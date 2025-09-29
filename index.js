import { Client, GatewayIntentBits, Events } from "discord.js"
import express from "express"
import dotenv from "dotenv"
import fetch from "node-fetch"
import setupCommands from './commandHandler.js'; // Import the command handler

dotenv.config({ path: ".env" })
dotenv.config({ path: "local.env" })

console.log("Checking environment variables...")
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing! Please add it to your environment variables.")
  process.exit(1)
}
if (!process.env.INTRODUCTION_CHANNEL_ID) {
  console.warn("⚠️ INTRODUCTION_CHANNEL_ID is missing. Role assignment won't work.")
}
console.log("✅ Environment variables checked")

// Express server setup
const app = express()
const port = process.env.PORT || 10000

app.get("/", (req, res) => {
  res.send("Discord bot is running!")
})

app.get("/keep-alive", (req, res) => {
  res.json({ status: "alive", timestamp: new Date().toISOString() })
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})

// Self-ping every 14 minutes to keep the service alive
const RENDER_URL = "https://mcroberts-engineering-club-discord-bot.onrender.com"
setInterval(
  async () => {
    try {
      const response = await fetch(`${RENDER_URL}/keep-alive`)
      const data = await response.json()
      console.log(`Keep-alive ping successful:`, data.timestamp)
    } catch (error) {
      console.error(`Keep-alive ping failed:`, error.message)
    }
  },
  14 * 60 * 1000,
) // 14 minutes in milliseconds

// Configuration
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})
const INTRODUCTION_CHANNEL_ID = process.env.INTRODUCTION_CHANNEL_ID

// Setup command handling
setupCommands(client);

// Message Event (for encouragement system)
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return

  const encourageCommand = client.commands.get("encourage")
  if (encourageCommand && encourageCommand.checkMessage) {
    await encourageCommand.checkMessage(message)
  }

  // Role Manager (existing code)
  if (message.channel.id === INTRODUCTION_CHANNEL_ID) {
    const content = message.content.toLowerCase()
    const gradeMatch = content.match(/(\d+)/)
    const membershipRole = message.guild.roles.cache.find((role) => role.name.toLowerCase() === "members")

    if (gradeMatch) {
      const grade = Number.parseInt(gradeMatch[1])
      const gradeRole = message.guild.roles.cache.find((role) => role.name.toLowerCase() === `${grade}`)

      if (gradeRole) {
        try {
          await message.member.roles.add(gradeRole)
          console.log(`Assigned Grade ${grade} role to ${message.author.tag}`)
        } catch (error) {
          console.error(`Error assigning Grade ${grade} role:`, error)
        }
      }
    }

    if (membershipRole) {
      try {
        await message.member.roles.add(membershipRole)
        console.log(`Assigned Member role to ${message.author.tag}`)
      } catch (error) {
        console.error("Error assigning Member role:", error)
      }
    }

    await message.react("👋")
  }
})

// Error Handling
client.on(Events.Error, console.error)

console.log("Attempting to login to Discord...")
console.log("Token length:", process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.length : "undefined")
console.log(
  "Token starts with:",
  process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.substring(0, 10) + "..." : "undefined",
)

client
  .login(token)
  .then(() => {
    console.log("✅ Discord login successful!")
  })
  .catch((error) => {
    console.error("❌ Failed to login to Discord:", error.message)
    console.error("Please check your DISCORD_TOKEN environment variable")
    process.exit(1)
  })

import { Client, GatewayIntentBits, Collection, Events } from "discord.js"
import express from "express"
import dotenv from "dotenv"
import fetch from "node-fetch"
import { loadBotCommands, setupInteractionHandlers } from "./commandHandler.js"
import { closeEmailConnection } from "./emailUtils.js"
import announceCommand from "./commands/announce.js" // Import the announce command
import { fileURLToPath } from "url"
import { dirname } from "path"

// Load environment variables based on NODE_ENV set by cross-env in package.json
// For local development, NODE_ENV is 'development', so .local.env will be loaded.
// For production, NODE_ENV is 'production', so .env will be loaded.
const envPath = process.env.NODE_ENV === "development" ? ".local.env" : ".env"
dotenv.config({ path: envPath })

console.log(`DEBUG: index.js loading environment variables from: ${envPath}`)
console.log("DEBUG: DISCORD_TOKEN is", process.env.DISCORD_TOKEN ? "set" : "not set")
console.log("DEBUG: CLIENT_ID is", process.env.CLIENT_ID ? "set" : "not set")
console.log("DEBUG: PORT is", process.env.PORT ? "set" : "not set")

// Validate critical environment variables
const requiredEnvVars = ["DISCORD_TOKEN", "CLIENT_ID", "PORT"]
const missingVars = requiredEnvVars.filter((v) => !process.env[v])
if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(", ")}`)
  process.exit(1)
}

// Helper for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Express server setup
const app = express()
const port = process.env.PORT || 10000
app.get("/", (req, res) => {
  res.send("Discord bot is running!")
})
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})
const server = app.listen(port, () => {
  console.log(`🌐 Server is running on port ${port}`)
})

// Self-ping for Render.com free tier (every 14 minutes)
if (process.env.NODE_ENV === "production") {
  const RENDER_URL = process.env.RENDER_URL || "https://mcroberts-engineering-club-discord-bot.onrender.com" // UPDATE THIS URL IF NEEDED
  setInterval(
    async () => {
      try {
        const response = await fetch(`${RENDER_URL}/health`)
        const data = await response.json()
        console.log(`🏓 Keep-alive ping: ${data.timestamp}`)
      } catch (error) {
        console.error(`❌ Keep-alive ping failed:`, error.message)
      }
    },
    14 * 60 * 1000,
  ) // 14 minutes
}

// Discord Client Configuration
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
})

// Command collection
client.commands = new Collection() // Initialize Collection

// Load commands and setup handlers
;(async () => {
  await loadBotCommands(client) // Load all commands into client.commands
  setupInteractionHandlers(client) // Setup event handlers for interactions
})()

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Bot is ready! Logged in as ${c.user.tag}`)
  console.log(`📊 Bot is in ${c.guilds.cache.size} guild(s)`)
  console.log(`🎯 Commands loaded: ${client.commands.size}`)
  console.log(`📝 Command names: ${Array.from(client.commands.keys()).join(", ")}`)
  console.log(`⚠️ IMPORTANT: If commands don't work, run: npm run register`)
})

// Introduction channel auto-role assignment
const INTRODUCTION_CHANNEL_ID = process.env.INTRODUCTION_CHANNEL_ID
if (INTRODUCTION_CHANNEL_ID) {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return

    const encourageCommand = client.commands?.get("encourage")
    if (encourageCommand?.checkMessage) {
      await encourageCommand.checkMessage(message)
    }

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
            console.log(`✅ Assigned Grade ${grade} role to ${message.author.tag}`)
          } catch (error) {
            console.error(`❌ Error assigning Grade ${grade} role:`, error.message)
          }
        }
      }

      if (membershipRole) {
        try {
          await message.member.roles.add(membershipRole)
          console.log(`✅ Assigned Member role to ${message.author.tag}`)
        } catch (error) {
          console.error("❌ Error assigning Member role:", error.message)
        }
      }
      await message.react("👋").catch(console.error)
    }
  })
}

// Error handling
client.on(Events.Error, (error) => {
  console.error("❌ Discord client error:", error)
})
client.on(Events.Warn, (warning) => {
  console.warn("⚠️ Discord warning:", warning)
})

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM received, shutting down gracefully...")
  client.destroy()
  closeEmailConnection() // Ensure email transporter is closed
  server.close(() => {
    console.log("✅ Server closed")
    process.exit(0)
  })
})

// Login to Discord
console.log("🔄 Attempting to login to Discord...")
client
  .login(process.env.DISCORD_TOKEN)
  .then(async () => {
    // Made the callback async
    console.log("✅ Discord login successful!")
    // Call the initialize method of the announce command
    if (announceCommand.initialize) {
      await announceCommand.initialize()
    }
  })
  .catch((error) => {
    console.error("❌ Failed to login to Discord:", error.message)
    process.exit(1)
  })

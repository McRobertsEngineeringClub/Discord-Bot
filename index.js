import { Client, GatewayIntentBits, Collection, Events } from "discord.js"
import fs from "fs"
import { fileURLToPath } from "url"
import { dirname } from "path"
import express from "express"
import dotenv from "dotenv"

dotenv.config({ path: ".env" })
dotenv.config({ path: "local.env" })

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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
const port = process.env.PORT || 3000

app.get("/", (req, res) => {
  res.send("Discord bot is running!")
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})

// Configuration
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
})
client.commands = new Collection()
const token = process.env.DISCORD_TOKEN
const INTRODUCTION_CHANNEL_ID = process.env.INTRODUCTION_CHANNEL_ID

console.log("[v0] Loading commands...")
const commandFiles = fs.readdirSync("./commands").filter((file) => file.endsWith(".js"))
for (const file of commandFiles) {
  try {
    const command = await import(`./commands/${file}`)
    if (command.default && command.default.data && command.default.data.name) {
      client.commands.set(command.default.data.name, command.default)
      console.log(`✅ Loaded command: ${command.default.data.name}`)
    } else {
      console.warn(`⚠️ Command file ${file} doesn't export properly structured command`)
    }
  } catch (error) {
    console.error(`❌ Error loading command ${file}:`, error)
  }
}
console.log(`📦 Loaded ${client.commands.size} commands total`)

// Register Commands
client.once(Events.ClientReady, async () => {
  console.log(`🤖 Bot logged in as ${client.user.tag}`)

  try {
    // Try to register commands globally first (takes up to 1 hour to update)
    await client.application.commands.set(client.commands.map((command) => command.data))
    console.log("✅ Global slash commands registered")

    // Also register to specific guild for instant updates (if guild ID is provided)
    const guildId = process.env.GUILD_ID || "768632778396139550"
    const guild = client.guilds.cache.get(guildId)
    if (guild) {
      await guild.commands.set(client.commands.map((command) => command.data))
      console.log(`✅ Guild slash commands registered in ${guild.name}`)
    } else {
      console.warn(`⚠️ Could not find guild with ID: ${guildId}`)
    }
  } catch (error) {
    console.error("❌ Error registering commands:", error)
  }
})

// Interaction Event
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isCommand()) {
    const command = client.commands.get(interaction.commandName)
    if (!command) return

    try {
      await command.execute(interaction)
    } catch (error) {
      console.error(error)
      const replyOptions = {
        content: "There was an error executing this command!",
        flags: 64, // This sets the message as ephemeral
      }
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyOptions)
      } else {
        await interaction.reply(replyOptions)
      }
    }
  } else if (interaction.isButton()) {
    // Handle button interactions for announce command
    const announceCommand = client.commands.get("announce")
    if (announceCommand && announceCommand.handleButtonInteraction) {
      try {
        await announceCommand.handleButtonInteraction(interaction)
      } catch (error) {
        console.error("Button interaction error:", error)
      }
    }
  } else if (interaction.isModalSubmit()) {
    // Handle modal submissions for announce command
    const announceCommand = client.commands.get("announce")
    if (announceCommand && announceCommand.handleModalSubmit) {
      try {
        await announceCommand.handleModalSubmit(interaction)
      } catch (error) {
        console.error("Modal submit error:", error)
      }
    }
  }
})

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

try {
  await client.login(token)
  console.log("✅ Discord login successful!")
} catch (error) {
  console.error("❌ Failed to login to Discord:", error.message)
  console.error("Please check your DISCORD_TOKEN environment variable")
  process.exit(1)
}

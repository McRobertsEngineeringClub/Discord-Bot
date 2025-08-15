import { Client, GatewayIntentBits, Collection, Events } from "discord.js"
import fs from "fs"
import { fileURLToPath } from "url"
import { dirname } from "path"
import express from "express"
import dotenv from "dotenv"
import fetch from "node-fetch"

dotenv.config({ path: ".env" })
dotenv.config({ path: "local.env" })

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log("[v0] Checking environment variables...")
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

// Keep-alive mechanism
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    fetch(process.env.RENDER_EXTERNAL_URL).then(() => console.log("Kept alive"))
  }, 840000) // 14 minutes
}

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

async function testDiscordConnectivity() {
  console.log("[v0] Testing Discord API connectivity...")

  try {
    // Test Discord API endpoint
    const response = await fetch("https://discord.com/api/v10/gateway", {
      timeout: 10000,
    })

    if (response.ok) {
      const data = await response.json()
      console.log("✅ Discord API is reachable")
      console.log("[v0] Gateway URL:", data.url)
    } else {
      console.error("❌ Discord API returned error:", response.status, response.statusText)

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after")
        console.error(`🚫 Rate limited! Retry after: ${retryAfter} seconds`)
        return { rateLimited: true, retryAfter: Number.parseInt(retryAfter) || 60 }
      }
    }
  } catch (error) {
    console.error("❌ Cannot reach Discord API:", error.message)
    console.error("This indicates network connectivity issues between Render and Discord")
  }

  try {
    // Test Discord gateway connectivity
    const gatewayResponse = await fetch("https://gateway.discord.gg", {
      timeout: 10000,
    })
    console.log("✅ Discord Gateway is reachable")
  } catch (error) {
    console.error("❌ Cannot reach Discord Gateway:", error.message)
  }

  return { rateLimited: false }
}

async function loginWithRetry(maxRetries = 5) {
  console.log("[v0] Attempting to login to Discord...")
  console.log("[v0] Token length:", process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.length : "undefined")
  console.log(
    "[v0] Token starts with:",
    process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.substring(0, 10) + "..." : "undefined",
  )

  const connectivityResult = await testDiscordConnectivity()

  // If we're rate limited, wait before attempting login
  if (connectivityResult.rateLimited) {
    const waitTime = connectivityResult.retryAfter || 60
    console.log(`⏳ Waiting ${waitTime} seconds due to rate limiting...`)
    await new Promise((resolve) => setTimeout(resolve, waitTime * 1000))
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[v0] Login attempt ${attempt}/${maxRetries}`)

      // Set a timeout for this specific attempt
      const loginPromise = client.login(token)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Login timeout")), 30000)
      })

      await Promise.race([loginPromise, timeoutPromise])
      console.log("✅ Discord login successful!")
      return true
    } catch (error) {
      console.error(`❌ Login attempt ${attempt} failed:`, error.message)

      // Check if it's a rate limit error
      if (error.code === 429 || error.message.includes("429") || error.message.includes("rate limit")) {
        const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 60000) // Exponential backoff, max 60s
        const jitter = Math.random() * 1000 // Add jitter to prevent thundering herd
        const delay = baseDelay + jitter

        console.log(`🚫 Rate limited on attempt ${attempt}. Waiting ${Math.round(delay / 1000)}s before retry...`)

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }
      }

      // If it's the last attempt or not a rate limit error, throw
      if (attempt === maxRetries) {
        throw error
      }

      // For other errors, wait a shorter time before retry
      const delay = 5000 * attempt
      console.log(`⏳ Waiting ${delay / 1000}s before retry...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw new Error(`Failed to login after ${maxRetries} attempts`)
}

try {
  await loginWithRetry()
} catch (error) {
  console.error("❌ Failed to login to Discord after all retries:", error.message)
  console.error("This usually means:")
  console.error("1. Render's IP addresses are being rate-limited by Discord")
  console.error("2. Network connectivity issues between Render and Discord")
  console.error("3. Invalid Discord token (but token format looks correct)")
  console.error("4. Discord's API is experiencing issues")
  console.error("\nTry deploying again in a few minutes, or contact Render support if the issue persists.")
  process.exit(1)
}

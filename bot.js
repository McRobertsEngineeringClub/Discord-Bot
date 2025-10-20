import { Client, GatewayIntentBits, Collection, Events, REST, Routes } from "discord.js"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"
// import dotenv from "dotenv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
// const envPath = process.env.NODE_ENV === "development" ? ".local.env" : ".env"
// dotenv.config({ path: envPath })

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
})

// Load commands
client.commands = new Collection()
const commandsPath = path.join(__dirname, "commands")
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"))

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file)
  const command = await import(`file://${filePath}`)
  const cmd = command.default || command
  if (cmd.data && cmd.execute) {
    client.commands.set(cmd.data.name, cmd)
    console.log(`✅ Loaded command: ${cmd.data.name}`)
  } else {
    console.warn(`⚠️ Command at ${filePath} is missing data or execute property`)
  }
}

// Interaction handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    console.log(`[v0] Received command: ${interaction.commandName} from ${interaction.user.tag}`)

    const command = client.commands.get(interaction.commandName)
    if (!command) {
      console.log(`[v0] Command not found: ${interaction.commandName}`)
      return
    }

    try {
      console.log(`[v0] Deferring reply for ${interaction.commandName}...`)
      await interaction.deferReply()
      console.log(`[v0] Successfully deferred reply for ${interaction.commandName}`)

      console.log(`[v0] Executing command ${interaction.commandName}...`)
      await command.execute(interaction, client)
      console.log(`[v0] Successfully executed command ${interaction.commandName}`)
    } catch (error) {
      console.error(`[v0] Error executing command ${interaction.commandName}:`, error)
      console.error(`[v0] Error stack:`, error.stack)

      try {
        const replyMethod = interaction.deferred || interaction.replied ? "editReply" : "reply"
        console.log(`[v0] Attempting to send error message using ${replyMethod}`)
        await interaction[replyMethod]({
          content: "There was an error executing this command!",
          flags: 64,
        })
      } catch (replyError) {
        console.error(`[v0] Failed to send error message:`, replyError)
      }
    }
  }

  if (interaction.isButton()) {
    console.log(`[v0] Received button interaction: ${interaction.customId}`)

    try {
      console.log(`[v0] Deferring button update...`)
      await interaction.deferUpdate()
      console.log(`[v0] Successfully deferred button update`)

      if (interaction.customId.startsWith("announce_")) {
        const announceCommand = client.commands.get("announce")
        if (announceCommand?.handleButton) {
          console.log(`[v0] Handling announce button...`)
          await announceCommand.handleButton(interaction, client)
          console.log(`[v0] Successfully handled announce button`)
        }
      }
    } catch (error) {
      console.error("[v0] Error handling button:", error)
      console.error("[v0] Button error stack:", error.stack)
    }
  }

  if (interaction.isModalSubmit()) {
    console.log(`[v0] Received modal submit: ${interaction.customId}`)

    try {
      console.log(`[v0] Deferring modal reply...`)
      await interaction.deferReply({ flags: 64 })
      console.log(`[v0] Successfully deferred modal reply`)

      if (interaction.customId.startsWith("announce_modal_")) {
        const announceCommand = client.commands.get("announce")
        if (announceCommand?.handleModal) {
          console.log(`[v0] Handling announce modal...`)
          await announceCommand.handleModal(interaction, client)
          console.log(`[v0] Successfully handled announce modal`)
        }
      }
    } catch (error) {
      console.error("[v0] Error handling modal:", error)
      console.error("[v0] Modal error stack:", error.stack)
    }
  }
})

async function registerCommands() {
  const commands = []
  for (const [name, command] of client.commands) {
    commands.push(command.data.toJSON())
  }

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN)

  try {
    console.log(`🔄 Registering ${commands.length} commands...`)
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands })
    console.log(`✅ Successfully registered ${commands.length} commands`)
  } catch (error) {
    console.error("❌ Error registering commands:", error)
    if (error.code === 401) {
      console.error("\n⚠️  401 Unauthorized - Check that:")
      console.error("   1. DISCORD_TOKEN is correct and matches CLIENT_ID")
      console.error("   2. Bot has 'applications.commands' scope")
      console.error("   3. Bot is invited to the guild with GUILD_ID\n")
    }
  }
}

function startBot() {
  client.once(Events.ClientReady, async (c) => {
    console.log(`✅ Logged in as ${c.user.tag}`)
    console.log(`📊 Bot is in ${c.guilds.cache.size} guild(s)`)
    console.log(`🎯 Commands loaded: ${client.commands.size}`)

    await registerCommands()

    const announceCommand = client.commands.get("announce")
    if (announceCommand?.initialize) {
      await announceCommand.initialize()
    }
  })

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

  client.on(Events.Error, (error) => {
    console.error("❌ Discord client error:", error)
  })

  console.log("🔄 Attempting to login to Discord...")
  console.log(`   Token length: ${process.env.DISCORD_TOKEN?.length || 0} characters`)

  client
    .login(process.env.DISCORD_TOKEN)
    .then(() => console.log("✅ Bot login initiated successfully"))
    .catch((error) => {
      console.error("❌ Failed to login to Discord:", error)
      console.error("\n⚠️  Login failed - Check that:")
      console.error("   1. DISCORD_TOKEN is set correctly in OnRender environment variables")
      console.error("   2. Token is valid (not regenerated)")
      console.error("   3. Privileged Gateway Intents are enabled in Discord Developer Portal")
      console.error("      - SERVER MEMBERS INTENT")
      console.error("      - MESSAGE CONTENT INTENT\n")
      process.exit(1)
    })
}

export { startBot, client }

import { Client, GatewayIntentBits, Collection, Events, REST, Routes, MessageFlags } from "discord.js"
import { readdirSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "url"
import { dirname } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
})

async function loadBotCommands(client) {
  client.commands = new Collection()

  const commandsPath = join(__dirname, "commands")

  if (!existsSync(commandsPath)) {
    mkdirSync(commandsPath)
  }

  const commandFiles = readdirSync(commandsPath).filter((file) => file.endsWith(".js"))

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file)
    try {
      const fileUrl = new URL(`file:///${filePath}`).href
      const commandModule = await import(fileUrl)
      const command = commandModule.default || commandModule

      if ("data" in command && "execute" in command) {
        if (client.commands.has(command.data.name)) {
          console.warn(`⚠️ Skipping duplicate command in client.commands: ${command.data.name} from ${file}`)
          continue
        }
        client.commands.set(command.data.name, command)
        console.log(`✅ Loaded command: ${command.data.name} from ${file}`)
      } else {
        console.warn(`⚠️ Warning: Command file ${file} is missing required "data" or "execute" properties.`)
      }
    } catch (error) {
      console.error(`❌ Error loading command ${file}:`, error)
    }
  }
  console.log(`📦 Total commands loaded into client.commands: ${client.commands.size}`)
}

function setupInteractionHandlers(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      console.log(`[v0] Received interaction: ${interaction.type} - ${interaction.commandName || interaction.customId}`)

      // Handle slash commands
      if (interaction.isChatInputCommand()) {
        console.log(`[v0] Processing slash command: ${interaction.commandName}`)

        const command = client.commands.get(interaction.commandName)

        if (!command) {
          console.log(`[v0] Unknown command: ${interaction.commandName}`)
          await interaction.reply({
            content: "Unknown command!",
            flags: MessageFlags.Ephemeral,
          })
          return
        }

        console.log(`[v0] Deferring reply for command: ${interaction.commandName}`)
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch((err) => {
          console.error(`[v0] Failed to defer reply:`, err)
          throw err
        })
        console.log(`[v0] Successfully deferred reply for: ${interaction.commandName}`)

        console.log(`[v0] Executing command: ${interaction.commandName}`)
        await command.execute(interaction, client)
        console.log(`[v0] Command executed successfully: ${interaction.commandName}`)
      }
      // Handle button interactions
      else if (interaction.isButton()) {
        console.log(`[v0] Processing button: ${interaction.customId}`)

        await interaction.deferUpdate().catch(async (err) => {
          console.error("[v0] Failed to defer button update:", err)
          // Fallback if deferUpdate fails
          if (!interaction.replied && !interaction.deferred) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(console.error)
          }
        })

        const command = client.commands.get("announce")
        if (command && command.handleButton) {
          console.log(`[v0] Handling button with announce command`)
          await command.handleButton(interaction, client)
        } else {
          console.warn(`[v0] No handler found for button interaction: ${interaction.customId}`)
        }
      }
      // Handle modal submissions
      else if (interaction.isModalSubmit()) {
        console.log(`[v0] Processing modal: ${interaction.customId}`)

        await interaction.deferUpdate().catch(console.error)

        const command = client.commands.get("announce")
        if (command && command.handleModal) {
          console.log(`[v0] Handling modal with announce command`)
          await command.handleModal(interaction, client)
        } else {
          console.warn(`[v0] No handler found for modal submission: ${interaction.customId}`)
        }
      }
    } catch (error) {
      console.error("[v0] Error handling interaction:", error)
      console.error("[v0] Error stack:", error.stack)

      const errorMessage = { content: "There was an error processing your request!", flags: MessageFlags.Ephemeral }

      try {
        if (interaction.deferred) {
          console.log(`[v0] Sending error via editReply`)
          await interaction.editReply(errorMessage)
        } else if (interaction.replied) {
          console.log(`[v0] Sending error via followUp`)
          await interaction.followUp(errorMessage)
        } else {
          console.log(`[v0] Sending error via reply`)
          await interaction.reply(errorMessage)
        }
      } catch (replyError) {
        console.error("[v0] Failed to send error message:", replyError)
      }
    }
  })
}

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
  }
}

async function startBot() {
  console.log("🔄 Attempting to login to Discord...")

  // Load commands first
  await loadBotCommands(client)

  setupInteractionHandlers(client)

  // Setup ready event
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

  // Login to Discord
  try {
    await client.login(process.env.DISCORD_TOKEN)
    console.log("✅ Discord login successful!")
  } catch (error) {
    console.error("❌ Failed to login to Discord:", error)
    process.exit(1)
  }
}

export { startBot, client }

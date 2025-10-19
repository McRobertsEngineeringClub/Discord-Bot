import { Client, GatewayIntentBits, Collection, Events, REST, Routes } from "discord.js"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"
import dotenv from "dotenv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
const envPath = process.env.NODE_ENV === "development" ? ".local.env" : ".env"
dotenv.config({ path: envPath })

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
    const command = client.commands.get(interaction.commandName)
    if (!command) return

    try {
      await interaction.deferReply()
      await command.execute(interaction, client)
    } catch (error) {
      console.error(`❌ Error executing command ${interaction.commandName}:`, error)
      const replyMethod = interaction.deferred ? "editReply" : "reply"
      await interaction[replyMethod]({
        content: "There was an error executing this command!",
        flags: 64,
      }).catch(console.error)
    }
  }

  if (interaction.isButton()) {
    try {
      await interaction.deferUpdate()

      if (interaction.customId.startsWith("announce_")) {
        const announceCommand = client.commands.get("announce")
        if (announceCommand?.handleButton) {
          await announceCommand.handleButton(interaction, client)
        }
      }
    } catch (error) {
      console.error("❌ Error handling button:", error)
    }
  }

  if (interaction.isModalSubmit()) {
    try {
      await interaction.deferReply({ flags: 64 })

      if (interaction.customId.startsWith("announce_modal_")) {
        const announceCommand = client.commands.get("announce")
        if (announceCommand?.handleModal) {
          await announceCommand.handleModal(interaction, client)
        }
      }
    } catch (error) {
      console.error("❌ Error handling modal:", error)
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
    console.log("🔄 Started refreshing application (/) commands.")
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands })
    console.log("✅ Successfully reloaded application (/) commands.")
  } catch (error) {
    console.error("❌ Error registering commands:", error)
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
  client
    .login(process.env.DISCORD_TOKEN)
    .then(() => console.log("✅ Bot login initiated successfully"))
    .catch((error) => {
      console.error("❌ Failed to login to Discord:", error)
      process.exit(1)
    })
}

export { startBot, client }

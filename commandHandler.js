import { Collection, Events } from "discord.js"
import { readdirSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "url"
import { dirname } from "path"

// Helper for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function loadBotCommands(client) {
  client.commands = new Collection() // Ensure commands collection is fresh

  const commandsPath = join(__dirname, "commands")

  if (!existsSync(commandsPath)) {
    mkdirSync(commandsPath)
  }

  const commandFiles = readdirSync(commandsPath).filter((file) => file.endsWith(".js"))

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file)
    try {
      // Convert Windows path to file:// URL for dynamic import
      const fileUrl = new URL(`file:///${filePath}`).href
      const commandModule = await import(fileUrl)
      const command = commandModule.default || commandModule // Handle both default and non-default exports

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

export function setupInteractionHandlers(client) {
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
            ephemeral: true,
          })
          return
        }

        console.log(`[v0] Deferring reply for command: ${interaction.commandName}`)
        await interaction.deferReply({ ephemeral: false }).catch((err) => {
          console.error(`[v0] Failed to defer reply:`, err)
          throw err
        })
        console.log(`[v0] Successfully deferred reply for: ${interaction.commandName}`)

        // Execute the command
        console.log(`[v0] Executing command: ${interaction.commandName}`)
        await command.execute(interaction, client)
        console.log(`[v0] Command executed successfully: ${interaction.commandName}`)
      }
      // Handle button interactions
      else if (interaction.isButton()) {
        console.log(`[v0] Processing button: ${interaction.customId}`)

        await interaction.deferUpdate().catch(async (err) => {
          console.error("[v0] Failed to defer button update:", err)
          if (!interaction.replied && !interaction.deferred) {
            await interaction.deferReply({ ephemeral: true }).catch(console.error)
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

      const errorMessage = { content: "There was an error processing your request!", ephemeral: true }

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

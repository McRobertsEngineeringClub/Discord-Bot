import { Collection, Events } from "discord.js";
import announceModule from "./announceModule.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function setupCommands(client) {
  // Initialize client.commands as a Collection
  client.commands = new Collection();

  // Load announceModule explicitly into client.commands
  client.commands.set(announceModule.data.name, announceModule);
  console.log(`✅ Loaded internal command: ${announceModule.data.name}`);

  // Dynamically load other command files into client.commands
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'announce.js');

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
      const commandModule = await import(filePath);
      const command = commandModule.default; // Assuming default export

      if (command && command.data && command.data.name) {
        // Check for duplicates before adding to client.commands
        if (client.commands.has(command.data.name)) {
          console.warn(`⚠️ Skipping duplicate command in client.commands: ${command.data.name} from ${file}`);
          continue;
        }
        client.commands.set(command.data.name, command);
        console.log(`✅ Loaded external command: ${command.data.name} from ${file}`);
      } else {
        console.warn(`⚠️ Command file ${file} doesn't export properly structured command`);
      }
    } catch (error) {
      console.error(`❌ Error loading command ${file}:`, error);
    }
  }
  console.log(`📦 Total commands loaded into client.commands: ${client.commands.size}`);

  client.on(Events.InteractionCreate, async (interaction) => {
    // Command handling (slash commands)
    if (interaction.isCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        console.warn(`⚠️ No handler for command: ${interaction.commandName}`);
        return;
      }
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`❌ Error executing ${interaction.commandName}:`, error);
        
        const errorMessage = {
          content: "❌ There was an error executing this command!",
          flags: 64 
        };
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
          } else {
            await interaction.reply(errorMessage);
          }
        } catch (replyError) {
          console.error('❌ Could not send error message:', replyError);
        }
      }
    }
    
    // Button interactions
    else if (interaction.isButton()) {
      // Handle announce module buttons
      if (
        interaction.customId.startsWith("edit_") ||
        interaction.customId.startsWith("send_") ||
        interaction.customId.startsWith("test_") ||
        interaction.customId.startsWith("cancel_")
      ) {
        try {
          await announceModule.handleButtonInteraction(interaction);
        } catch (error) {
          console.error('❌ Button interaction error:', error);
          await interaction.reply({ 
            content: '❌ An error occurred processing your request.', 
            flags: 64 
          }).catch(() => {});
        }
      }
      // Add more button handlers for other commands if needed here
    }
    
    // Modal submissions
    else if (interaction.isModalSubmit()) {
      if (
        interaction.customId.startsWith("discord_edit_modal_") ||
        interaction.customId.startsWith("email_edit_modal_")
      ) {
        try {
          await announceModule.handleModalSubmit(interaction);
        } catch (error) {
          console.error('❌ Modal submission error:', error);
          await interaction.reply({ 
            content: '❌ An error occurred processing your submission.', 
            flags: 64 
          }).catch(() => {});
        }
      }
      // Add more modal handlers for other commands if needed here
    }
  });
}

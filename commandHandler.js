import { REST, Routes, Collection, Events } from "discord.js";
import announceModule from "./announceModule.js";
import dotenv from "dotenv";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";

dotenv.config({ path: ".env" }); // Explicitly load .env
// dotenv.config({ path: "local.env" }); // Removed as local.env is not used on Render

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Clear existing commands and register fresh
async function registerCommands(client) {
  const commandsToRegister = [];
  const commandCollection = new Collection();
  const commandNames = new Set(); // Track unique command names
  // Add announceModule
  if (!commandNames.has(announceModule.data.name)) {
    commandsToRegister.push(announceModule.data.toJSON());
    commandCollection.set(announceModule.data.name, announceModule);
    commandNames.add(announceModule.data.name);
    console.log(`✅ Loaded command: ${announceModule.data.name}`);
  }
  // Load other commands
  const commandFiles = fs
    .readdirSync(`${__dirname}/commands`)
    .filter(file => file.endsWith('.js') && file !== 'announce.js');
  for (const file of commandFiles) {
    try {
      const command = await import(`./commands/${file}`);
      
      if (command.default && command.default.data && command.default.data.name) {
        const commandName = command.default.data.name;
        
        // Skip if command name already exists
        if (commandNames.has(commandName)) {
          console.warn(`⚠️ Skipping duplicate command: ${commandName} from ${file}`);
          continue;
        }
        
        commandsToRegister.push(command.default.data.toJSON());
        commandCollection.set(commandName, command.default);
        commandNames.add(commandName);
        console.log(`✅ Loaded command: ${commandName} from ${file}`);
      } else {
        console.warn(`⚠️ Command file ${file} doesn't export properly structured command`);
      }
    } catch (error) {
      console.error(`❌ Error loading command ${file}:`, error);
    }
  }
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log(`🧹 Clearing old commands and registering ${commandsToRegister.length} new commands...`);
    
    // IMPORTANT: This will completely replace all existing commands
    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commandsToRegister }
    );
    
    console.log(`✅ Successfully registered ${data.length} commands!`);
    
    // Optional: Clear guild-specific commands if you have any
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: [] } // Empty array clears guild commands
      );
      console.log('🧹 Cleared guild-specific commands');
    }
    
  } catch (error) {
    console.error('❌ Error registering commands:', error);
    throw error;
  }
  client.commands = commandCollection;
}

export default function setupCommands(client) {
  client.once(Events.ClientReady, async () => {
    console.log(`🤖 Ready as ${client.user.tag}`);
    
    try {
      await registerCommands(client);
    } catch (error) {
      console.error('❌ Fatal error during command registration:', error);
      process.exit(1);
    }
  });
  client.on(Events.InteractionCreate, async (interaction) => {
    // Command handling
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
          flags: 64 // Use flags instead of ephemeral (fixes the warning)
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
    }
  });
}

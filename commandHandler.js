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

// Register Commands with duplicate prevention
async function registerCommands(client) {
  const commandsToRegister = [];
  const commandCollection = new Collection();
  const commandNames = new Set(); // Track unique command names
  // Add announceModule explicitly
  if (!commandNames.has(announceModule.data.name)) {
    commandsToRegister.push(announceModule.data.toJSON());
    commandCollection.set(announceModule.data.name, announceModule);
    commandNames.add(announceModule.data.name);
    console.log(`✅ Loaded command: ${announceModule.data.name}`);
  }
  // Dynamically load other commands with duplicate check
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
    console.log(`🔄 Registering ${commandsToRegister.length} commands...`);
    
    // Register globally (or use guild-specific if preferred)
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID), 
      { body: commandsToRegister }
    );
    
    console.log(`✅ Successfully registered ${commandsToRegister.length} commands!`);
  } catch (error) {
    console.error('❌ Error registering commands:', error);
    throw error;
  }
  // Store commands in client for interaction handling
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
        console.warn(`⚠️ No command handler for: ${interaction.commandName}`);
        return;
      }
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`❌ Error executing ${interaction.commandName}:`, error);
        
        const errorMessage = {
          content: "❌ There was an error executing this command!",
          ephemeral: true
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
    
    // Button interaction handling
    else if (interaction.isButton()) {
      if (
        interaction.customId.startsWith("edit_") ||
        interaction.customId.startsWith("send_") ||
        interaction.customId.startsWith("test_") ||
        interaction.customId.startsWith("cancel_")
      ) {
        await announceModule.handleButtonInteraction(interaction);
      }
    }
    
    // Modal submission handling
    else if (interaction.isModalSubmit()) {
      if (
        interaction.customId.startsWith("discord_edit_modal_") ||
        interaction.customId.startsWith("email_edit_modal_")
      ) {
        await announceModule.handleModalSubmit(interaction);
      }
    }
  });
}

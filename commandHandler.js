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

// Register Commands (once, at bot startup)
async function registerCommands(client) {
  const commandsToRegister = [];
  const commandCollection = new Collection();

  // Add announceModule explicitly
  commandsToRegister.push(announceModule.data.toJSON());
  commandCollection.set(announceModule.data.name, announceModule);

  // Dynamically load other commands
  const commandFiles = fs.readdirSync(`${__dirname}/commands`).filter(file => file.endsWith('.js') && file !== 'announce.js');

  for (const file of commandFiles) {
    try {
      const command = await import(`./commands/${file}`);
      if (command.default && command.default.data && command.default.data.name) {
        commandsToRegister.push(command.default.data.toJSON());
        commandCollection.set(command.default.data.name, command.default);
        console.log(`✅ Loaded command: ${command.default.data.name}`);
      } else {
        console.warn(`⚠️ Command file ${file} doesn't export properly structured command`);
      }
    } catch (error) {
      console.error(`❌ Error loading command ${file}:`, error);
    }
  }

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  // Register GLOBALLY, or replace with guild registration if preferred
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandsToRegister });
  console.log('Commands registered!');

  // Store commands in client for interaction handling
  client.commands = commandCollection;
}

export default function setupCommands(client) {
  client.once(Events.ClientReady, async () => {
    console.log(`Ready as ${client.user.tag}`);
    await registerCommands(client);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(error);
        const replyOptions = {
          content: "There was an error executing this command!",
          flags: 64, // This sets the message as ephemeral
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(replyOptions);
        } else {
          await interaction.reply(replyOptions);
        }
      }
    } else if (interaction.isButton()) {
      // Check if it's an announce module button interaction
      if (
        interaction.customId.startsWith("edit_") ||
        interaction.customId.startsWith("send_") ||
        interaction.customId.startsWith("test_") ||
        interaction.customId.startsWith("cancel_")
      ) {
        await announceModule.handleButtonInteraction(interaction);
      }
      // Add more button handlers for other commands if needed
    } else if (interaction.isModalSubmit()) {
      // Check if it's an announce module modal submission
      if (
        interaction.customId.startsWith("discord_edit_modal_") ||
        interaction.customId.startsWith("email_edit_modal_")
      ) {
        await announceModule.handleModalSubmit(interaction);
      }
      // Add more modal handlers for other commands if needed
    }
  });
}

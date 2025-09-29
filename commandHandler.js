import { Collection, Events } from 'discord.js';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Helper for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function loadBotCommands(client) {
    client.commands = new Collection(); // Ensure commands collection is fresh

    const commandsPath = join(__dirname, 'commands');

    if (!existsSync(commandsPath)) {
        mkdirSync(commandsPath);
    }

    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = join(commandsPath, file);
        try {
            // Convert Windows path to file:// URL for dynamic import
            const fileUrl = new URL(`file:///${filePath}`).href;
            const commandModule = await import(fileUrl);
            const command = commandModule.default || commandModule; // Handle both default and non-default exports

            if ('data' in command && 'execute' in command) {
                if (client.commands.has(command.data.name)) {
                    console.warn(`⚠️ Skipping duplicate command in client.commands: ${command.data.name} from ${file}`);
                    continue;
                }
                client.commands.set(command.data.name, command);
                console.log(`✅ Loaded command: ${command.data.name} from ${file}`);
            } else {
                console.warn(`⚠️ Warning: Command file ${file} is missing required "data" or "execute" properties.`);
            }
        } catch (error) {
            console.error(`❌ Error loading command ${file}:`, error);
        }
    }
    console.log(`📦 Total commands loaded into client.commands: ${client.commands.size}`);
}

export function setupInteractionHandlers(client) {
    client.on(Events.InteractionCreate, async interaction => {
        try {
            // Handle slash commands
            if (interaction.isChatInputCommand()) {
                const command = client.commands.get(interaction.commandName);

                if (!command) {
                    console.log(`Unknown command: ${interaction.commandName}`);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: 'Unknown command!',
                            ephemeral: true
                        });
                    }
                    return;
                }
                await command.execute(interaction, client); // Pass client for potential use in commands
            }
            // Handle button interactions
            else if (interaction.isButton()) {
                const command = client.commands.get('announce'); // Assuming 'announce' command handles buttons
                if (command && command.handleButton) {
                    await command.handleButton(interaction, client);
                } else {
                    console.warn(`⚠️ No handler found for button interaction: ${interaction.customId}`);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'No handler for this button!', ephemeral: true });
                    }
                }
            }
            // Handle modal submissions
            else if (interaction.isModalSubmit()) {
                const command = client.commands.get('announce'); // Assuming 'announce' command handles modals
                if (command && command.handleModal) {
                    await command.handleModal(interaction, client);
                } else {
                    console.warn(`⚠️ No handler found for modal submission: ${interaction.customId}`);
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: 'No handler for this modal!', ephemeral: true });
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error handling interaction:', error);
            const errorMessage = { content: 'There was an error processing your request!', ephemeral: true };
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp(errorMessage).catch(console.error);
            } else {
                await interaction.reply(errorMessage).catch(console.error);
            }
        }
    });
}

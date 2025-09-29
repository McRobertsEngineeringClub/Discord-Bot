import { Collection, Events } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Import announceModule directly (if not dynamically imported)
// import announceModule from './announceModule.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadBotCommands(client) {
    client.commands = new Collection();

    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') && file !== 'announce.js');

    // Dynamically load announceModule (now using user.id for pending announcements)
    const announceModule = await import('./announceModule.js');
    if (announceModule.default?.data?.name) {
        client.commands.set(announceModule.default.data.name, announceModule.default);
        console.log(`✅ Loaded internal command: ${announceModule.default.data.name}`);
    }

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const commandModule = await import(filePath);
            const command = commandModule.default; // Assuming default export

            if (command && command.data && command.data.name) {
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
}

export function setupInteractionHandlers(client) {
    client.on('interactionCreate', async interaction => {
        // Handle slash commands
        if (interaction.isChatInputCommand()) { // Using isChatInputCommand for slash commands
            const command = client.commands.get(interaction.commandName);
            
            if (!command) {
                console.log(`Unknown command: ${interaction.commandName}`);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: 'Unknown command!', 
                        flags: 64 // Using flags
                    });
                }
                return;
            }
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`❌ Error executing ${interaction.commandName}:`, error);
                
                // Smart error response handling
                try {
                    const errorMessage = {
                        content: '❌ There was an error executing this command!',
                        flags: 64 // Using flags
                    };
                    if (interaction.deferred) {
                        await interaction.editReply(errorMessage);
                    } else if (interaction.replied) {
                        await interaction.followUp(errorMessage);
                    } else {
                        await interaction.reply(errorMessage);
                    }
                } catch (replyError) {
                    console.error('❌ Could not send error message:', replyError);
                }
            }
        }
        // Handle button interactions
        else if (interaction.isButton()) {
            try {
                // Defer the button update immediately
                await interaction.deferUpdate();
                
                // Dynamically import announceModule to get pending announcements
                const announceModule = await import('./announceModule.js');
                const pendingAnnouncements = announceModule.default.pendingAnnouncements;
                
                const announcementData = pendingAnnouncements.get(interaction.user.id);
                if (!announcementData) {
                    await interaction.followUp({
                        content: '❌ No pending announcement found. Please create a new one.',
                        flags: 64 // Using flags
                    });
                    return;
                }
                // Handle different button actions
                switch (interaction.customId) {
                    case 'edit_discord':
                        await announceModule.default.showEditModal(interaction, 'discord', announcementData);
                        break;
                    
                    case 'edit_email':
                        await announceModule.default.showEditModal(interaction, 'email', announcementData);
                        break;
                    
                    case 'test_send':
                        await announceModule.default.sendPreview(interaction, announcementData);
                        break;
                    
                    case 'send_announcement':
                        await announceModule.default.sendAnnouncement(interaction, announcementData);
                        pendingAnnouncements.delete(interaction.user.id);
                        break;
                    
                    case 'cancel_announcement':
                        pendingAnnouncements.delete(interaction.user.id);
                        await interaction.editReply({
                            content: '✅ Announcement cancelled.',
                            embeds: [],
                            components: []
                        });
                        break;
                }
            } catch (error) {
                console.error('❌ Button interaction error:', error);
                
                try {
                    if (interaction.deferred) {
                        await interaction.followUp({
                            content: '❌ An error occurred processing your request.',
                            flags: 64 // Using flags
                        });
                    } else if (!interaction.replied) {
                        await interaction.reply({
                            content: '❌ An error occurred processing your request.',
                            flags: 64
                        });
                    }
                } catch (followUpError) {
                    console.error('Could not send follow-up:', followUpError);
                }
            }
        }
        // Handle modal submissions
        else if (interaction.isModalSubmit()) {
            try {
                // Defer the modal response immediately
                await interaction.deferUpdate();

                const announceModule = await import('./announceModule.js');
                const pendingAnnouncements = announceModule.default.pendingAnnouncements;
                
                const announcementData = pendingAnnouncements.get(interaction.user.id);
                
                if (!announcementData) {
                    await interaction.followUp({
                        content: '❌ No pending announcement found.',
                        flags: 64 // Using flags
                    });
                    return;
                }
                // Update the announcement data based on modal type
                if (interaction.customId === 'edit_discord_modal') {
                    announcementData.discordContent = interaction.fields.getTextInputValue('discord_content');
                } else if (interaction.customId === 'edit_email_modal') {
                    announcementData.emailSubject = interaction.fields.getTextInputValue('email_subject');
                    announcementData.emailContent = interaction.fields.getTextInputValue('email_content');
                }
                // Update the control panel
                await announceModule.default.updateControlPanel(interaction, announcementData); // Call updateControlPanel via announceModule.default
                
            } catch (error) {
                console.error('❌ Modal submission error:', error);
                
                try {
                    if (interaction.deferred) {
                        await interaction.followUp({
                            content: '❌ An error occurred processing your submission.',
                            flags: 64 // Using flags
                        });
                    } else if (!interaction.replied) {
                        await interaction.reply({
                            content: '❌ An error occurred processing your submission.',
                            flags: 64
                        });
                    }
                } catch (followUpError) {
                    console.error('Could not send follow-up:', followUpError);
                }
            }
        }
    });
}

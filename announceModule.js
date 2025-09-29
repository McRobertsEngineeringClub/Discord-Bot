import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits
} from 'discord.js';
import { getClubEmails, sendEmails } from "./emailUtils.js";
import { createStatusEmbed } from "./lib/embedStyles.js"; // Import only necessary for status embeds

const pendingAnnouncements = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Create and send an announcement')
        .addStringOption(option =>
            option.setName('topic')
                .setDescription('The topic of the announcement')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('details')
                .setDescription('Additional details for the announcement')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        // CRITICAL: Defer immediately to prevent timeout
        await interaction.deferReply({ flags: 64 }); // Changed ephemeral to flags
        try {
            // Permission check after deferring
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return await interaction.editReply({
                    content: '❌ You need the "Manage Messages" permission to use this command.',
                    flags: 64 // Changed ephemeral to flags
                });
            }
            const topic = interaction.options.getString('topic');
            const details = interaction.options.getString('details') || '';

            // Create announcement data
            const announcementData = {
                topic,
                details,
                discordContent: `**${topic}**\n${details}`,
                emailSubject: `Club: ${topic}`,
                emailContent: `Update: ${topic}\n\n${details}`,
                userId: interaction.user.id,
                timestamp: Date.now()
            };

            // Store in pending announcements using user ID as key
            pendingAnnouncements.set(interaction.user.id, announcementData);

            // Create control panel embed
            const embed = new EmbedBuilder()
                .setTitle('📢 Announcement Control Panel')
                .setDescription(`**Topic:** ${topic}`)
                .addFields(
                    { name: 'Discord Content', value: announcementData.discordContent.substring(0, 1024) || 'N/A' },
                    { name: 'Email Subject', value: announcementData.emailSubject.substring(0, 1024) || 'N/A' },
                    { name: 'Email Content', value: announcementData.emailContent.substring(0, 1024) || 'N/A' }
                )
                .setColor(0x0099FF) // Using a Discord blue-like color
                .setFooter({ text: 'Use the buttons below to manage this announcement' });

            // Create control buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('edit_discord')
                        .setLabel('✏️ Edit Discord')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('edit_email')
                        .setLabel('📧 Edit Email')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('test_send')
                        .setLabel('🔍 Preview')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('send_announcement')
                        .setLabel('📤 Send')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('cancel_announcement')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Danger)
                );

            // Use editReply since we deferred
            await interaction.editReply({
                embeds: [embed],
                components: [row],
                flags: 64 // Changed ephemeral to flags
            });
        } catch (error) {
            console.error('Error in announce command:', error);

            // Smart error response handling
            const errorMessage = {
                content: '❌ An error occurred while creating the announcement.',
                flags: 64 // Changed ephemeral to flags
            };

            if (interaction.deferred) {
                await interaction.editReply(errorMessage);
            } else if (!interaction.replied) {
                await interaction.reply(errorMessage);
            } else {
                await interaction.followUp(errorMessage);
            }
        }
    },

    async handleButtonInteraction(interaction) {
        // Defer the button update immediately to prevent timeout
        await interaction.deferUpdate();
        try {
            const announcementData = pendingAnnouncements.get(interaction.user.id);
            if (!announcementData) {
                await interaction.followUp({
                    content: '❌ No pending announcement found. Please create a new one.',
                    flags: 64 // Changed ephemeral to flags
                });
                return;
            }

            // Verify ownership
            if (announcementData.userId !== interaction.user.id) {
                await interaction.followUp({
                    content: '❌ You can only modify your own announcements.',
                    flags: 64 // Changed ephemeral to flags
                });
                return;
            }

            // Handle different button actions
            switch (interaction.customId) {
                case 'edit_discord':
                    await showEditModal(interaction, 'discord', announcementData);
                    break;

                case 'edit_email':
                    await showEditModal(interaction, 'email', announcementData);
                    break;

                case 'test_send':
                    await sendPreview(interaction, announcementData);
                    break;

                case 'send_announcement':
                    await sendAnnouncement(interaction, announcementData);
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
            await interaction.followUp({
                content: '❌ An error occurred processing your request.',
                flags: 64 // Changed ephemeral to flags
            }).catch(() => { });
        }
    },

    async handleModalSubmit(interaction) {
        // Defer the modal response immediately to prevent timeout
        await interaction.deferUpdate();
        try {
            const announcementData = pendingAnnouncements.get(interaction.user.id);
            if (!announcementData) {
                await interaction.followUp({
                    content: '❌ No pending announcement found.',
                    flags: 64 // Changed ephemeral to flags
                });
                return;
            }

            // Update the announcement data based on modal type
            if (interaction.customId === 'edit_discord_modal') {
                announcementData.discordContent = interaction.fields.getTextInputValue('discord_content');
                // Update topic and details if discord content is edited and derived from them
                // For simplicity, let's assume direct content editing for now.
            } else if (interaction.customId === 'edit_email_modal') {
                announcementData.emailSubject = interaction.fields.getTextInputValue('email_subject');
                announcementData.emailContent = interaction.fields.getTextInputValue('email_content');
            }

            // Update the control panel with new data
            await updateControlPanel(interaction, announcementData);

        } catch (error) {
            console.error('❌ Modal submission error:', error);
            await interaction.followUp({
                content: '❌ An error occurred processing your submission.',
                flags: 64 // Changed ephemeral to flags
            }).catch(() => { });
        }
    },
    pendingAnnouncements // Export for commandHandler to access
};

// Helper functions (defined outside the default export)

async function showEditModal(interaction, type, announcementData) {
    const modal = new ModalBuilder()
        .setCustomId(`edit_${type}_modal`)
        .setTitle(`Edit ${type === 'discord' ? 'Discord Message' : 'Email Content'}`);

    if (type === 'discord') {
        const contentInput = new TextInputBuilder()
            .setCustomId('discord_content')
            .setLabel('Discord Message Content')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(announcementData.discordContent)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(contentInput));
    } else {
        const subjectInput = new TextInputBuilder()
            .setCustomId('email_subject')
            .setLabel('Email Subject')
            .setStyle(TextInputStyle.Short)
            .setValue(announcementData.emailSubject)
            .setRequired(true);

        const contentInput = new TextInputBuilder()
            .setCustomId('email_content')
            .setLabel('Email Content')
            .setStyle(TextInputStyle.Paragraph)
            .setValue(announcementData.emailContent)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(subjectInput),
            new ActionRowBuilder().addComponents(contentInput)
        );
    }
    // Note: showModal doesn't need deferral
    await interaction.showModal(modal);
}

async function updateControlPanel(interaction, announcementData) {
    const embed = new EmbedBuilder()
        .setTitle('📢 Announcement Control Panel')
        .setDescription(`**Topic:** ${announcementData.topic}`)
        .addFields(
            { name: 'Discord Content', value: announcementData.discordContent.substring(0, 1024) || 'N/A' },
            { name: 'Email Subject', value: announcementData.emailSubject.substring(0, 1024) || 'N/A' },
            { name: 'Email Content', value: announcementData.emailContent.substring(0, 1024) || 'N/A' }
        )
        .setColor(0x00FF00) // Green for updated status
        .setFooter({ text: '✅ Content updated!' });

    await interaction.editReply({ embeds: [embed] });
}

async function sendPreview(interaction, announcementData) {
    await interaction.followUp({
        content: `**--- Discord Preview ---**\n${announcementData.discordContent}\n\n**--- Email Preview (Subject) ---**\n${announcementData.emailSubject}\n\n**--- Email Preview (Content) ---**\n${announcementData.emailContent}`,
        flags: 64 // Changed ephemeral to flags
    });
}

async function sendAnnouncement(interaction, announcementData) {
    await interaction.followUp({
        content: '📤 Sending announcement...', // Use followUp as deferUpdate was already called
        flags: 64,
    });

    let discordSuccess = false;
    let emailSuccess = false;
    let discordError = null;
    let emailError = null;

    // Send to Discord
    try {
        console.log("Attempting to send Discord announcement...");
        const announcementChannel = interaction.guild.channels.cache.get(process.env.ANNOUNCEMENT_CHANNEL_ID);

        if (!announcementChannel) {
            throw new Error(`Announcement channel not found. Channel ID: ${process.env.ANNOUNCEMENT_CHANNEL_ID}`);
        }

        await announcementChannel.send({
            content: `@everyone ${announcementData.discordContent}`,
            embeds: [new EmbedBuilder().setTitle(announcementData.topic).setDescription(announcementData.details).setColor(0x5865F2)],
        });
        discordSuccess = true;
        console.log("✅ Discord announcement sent successfully");
    } catch (error) {
        console.error("❌ Discord send error:", error);
        discordError = error.message;
    }

    // Send to Email
    try {
        console.log("Attempting to send email announcement...");
        // Import getClubEmails and sendEmails here to avoid circular dependency if they import announceModule
        const { getClubEmails, sendEmails } = await import('./emailUtils.js'); // Dynamic import

        const emails = await getClubEmails();
        if (emails.length === 0) {
            throw new Error("No emails found in the spreadsheet");
        }

        const emailResults = await sendEmails(
            announcementData.emailSubject,
            announcementData.emailContent,
            emails,
        );

        if (emailResults.failed.length > 0) {
            throw new Error(`Failed to send emails to ${emailResults.failed.length} recipients.`);
        }
        emailSuccess = true;
        console.log("✅ Email announcement sent successfully");
    } catch (error) {
        console.error("❌ Email send error:", error);
        emailError = error.message;
    }

    let resultMessage = "";
    let resultType = "info";

    if (discordSuccess && emailSuccess) {
        resultMessage = "✅ Discord and Email announcements sent successfully!";
        resultType = "success";
    } else if (discordSuccess) {
        resultMessage = `⚠️ Discord announcement sent. Email failed: ${emailError}`;         
        resultType = "warning";
    } else if (emailSuccess) {
        resultMessage = `⚠️ Email announcement sent. Discord failed: ${discordError}`;         
        resultType = "warning";
    } else {
        resultMessage = `❌ All announcements failed. Discord: ${discordError || 'N/A'}. Email: ${emailError || 'N/A'}`; 
        resultType = "error";
    }

    await interaction.editReply({ // Edit the original deferred reply with results
        embeds: [createStatusEmbed("SEND RESULTS", resultMessage, resultType)],
        components: [],
        flags: 64,
    });
}

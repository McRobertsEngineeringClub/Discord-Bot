import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } from "discord.js";
import { getClubEmails, sendEmails } from "./emailUtils.js";
import { createAnnouncementEmbed, createStatusEmbed, CLUB_THEME } from "./lib/embedStyles.js";

// Store pending announcements
const pendingAnnouncements = new Map();

export default {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Create an announcement") // Updated description
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addStringOption(opt => opt.setName("topic").setDescription("Brief topic of the announcement").setRequired(true))
    .addStringOption(opt => opt.setName("details").setDescription("Additional details (optional)").setRequired(false)),
  
  async execute(interaction) {
    // Permission check
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: '❌ You need Manage Messages permission',
        flags: 64 
      });
    }
    
    const announcementId = `${interaction.user.id}-${Date.now()}`;
    const topic = interaction.options.getString("topic");
    const details = interaction.options.getString("details") || "More details coming soon!"; // Updated default
    
    // Store announcement data WITHOUT timeout
    const announcementData = {
        id: announcementId,
        userId: interaction.user.id,
        topic: topic,
        details: details,
        discordContent: `**Topic:** ${topic}\n**Details:** ${details}`,
        emailSubject: `Club: ${topic}`,
        emailContent: `Update: ${topic}\n\n${details}`,
        createdAt: Date.now()
    };
    
    pendingAnnouncements.set(announcementId, announcementData);
    
    // Create control panel embed (using EmbedBuilder directly as per Claude's suggestion)
    const embed = new EmbedBuilder()
        .setTitle('📢 ANNOUNCEMENT CONTROL PANEL')
        .setColor(0x5865F2)
        .setDescription('**ANNOUNCEMENT READY**\n\nYour announcement is ready to send! Use the buttons below to edit or send.')
        .addFields(
            {
                name: 'Discord Preview',
                value: `**Topic:** ${topic}\n**Details:** ${details}`.substring(0, 1024)
            },
            {
                name: 'Email Preview',
                value: `**Subject:** Club: ${topic}\n**Content:** Update: ${topic}\n...`.substring(0, 1024)
            }
        )
        .setTimestamp();
    
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`edit_discord_${announcementId}`)
                .setLabel('Edit Discord')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✏️'),
            new ButtonBuilder()
                .setCustomId(`edit_email_${announcementId}`)
                .setLabel('Edit Email')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📧'),
            new ButtonBuilder()
                .setCustomId(`test_send_${announcementId}`) // Consolidated test send
                .setLabel('Test Send')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🧪'),
            new ButtonBuilder()
                .setCustomId(`send_${announcementId}`) // Consolidated send
                .setLabel('Send')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📤'),
            new ButtonBuilder()
                .setCustomId(`cancel_${announcementId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );
    
    await interaction.reply({
        embeds: [embed],
        components: [buttons],
        flags: 64 // Ephemeral message
    });
  },

  async handleButtonInteraction(interaction) {
    const [action, ...idParts] = interaction.customId.split('_');
    const announcementId = idParts.join('_');
    
    // Check if announcement still exists
    const announcement = pendingAnnouncements.get(announcementId);
    
    if (!announcement) {
        return interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle('❌ ANNOUNCEMENT EXPIRED')
                    .setDescription('This announcement has expired or been deleted')
                    .setColor(0xFF0000)
            ],
            components: []
        });
    }
    
    // Verify ownership
    if (announcement.userId !== interaction.user.id) {
        return interaction.reply({
            content: '❌ You can only modify your own announcements',
            flags: 64
        });
    }

    switch (action) {
      case "test_send": {
        await interaction.reply({
          content: "🧪 Sending test announcement...",
          flags: 64,
        });
        try {
          const emails = await getClubEmails();
          if (emails.length === 0) {
            throw new Error("No emails found in the spreadsheet");
          }
          const testEmailContent = `This is a test announcement from the bot.\n\nTopic: ${announcement.topic}\nDetails: ${announcement.details}`;          
          const testEmailSubject = `[TEST] Club: ${announcement.topic}`;

          // Send test email to the user who initiated the test
          await sendEmails(testEmailSubject, testEmailContent, [interaction.user.email || ''], { retries: 1 }); // Assuming user has email property or you can fetch it.

          await interaction.followUp({
            content: "✅ Test announcement sent to your email (if available in spreadsheet).",
            flags: 64
          });
        } catch (error) {
          console.error("❌ Test send error:", error);
          await interaction.followUp({
            content: `❌ Failed to send test announcement: ${error.message}`,
            flags: 64
          });
        }
        break;
      }

      case "send": {
        await interaction.reply({
          content: "📤 Sending announcement...",
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
              content: announcement.discordContent,
              embeds: [new EmbedBuilder().setTitle(announcement.topic).setDescription(announcement.details).setColor(0x5865F2)], // Using generic embed for simplicity
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
          const emails = await getClubEmails();

          if (emails.length === 0) {
            throw new Error("No emails found in the spreadsheet");
          }

          const emailResults = await sendEmails(
            announcement.emailSubject,
            announcement.emailContent,
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

        await interaction.followUp({
            embeds: [createStatusEmbed("SEND RESULTS", resultMessage, resultType)],
            flags: 64,
        });

        // After successful send, delete the announcement
        if (discordSuccess && emailSuccess) {
          pendingAnnouncements.delete(announcementId);
          await interaction.update({
              embeds: [
                  new EmbedBuilder()
                      .setTitle('✅ ANNOUNCEMENT SENT')
                      .setDescription('Successfully sent both Discord and email announcements.')
                      .setColor(0x00FF00)
              ],
              components: []
          }).catch(e => console.error("Error updating interaction after send:", e));
        }
        break;
      }

      case "cancel":
        pendingAnnouncements.delete(announcementId);
        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle('❌ ANNOUNCEMENT CANCELLED')
                    .setDescription('The announcement has been cancelled')
                    .setColor(0xFF0000)
            ],
            components: []
        });
        break;
      
      case "edit_discord": {
        const modal = new ModalBuilder()
            .setCustomId(`discord_edit_modal_${announcementId}`)
            .setTitle("Edit Discord Announcement");

        const topicInput = new TextInputBuilder()
            .setCustomId("discord_topic")
            .setLabel("Main Topic/Event")
            .setStyle(TextInputStyle.Short)
            .setValue(announcement.topic || "")
            .setMaxLength(256);

        const detailsInput = new TextInputBuilder()
            .setCustomId("discord_details")
            .setLabel("Additional Details (Optional)")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(announcement.details || "")
            .setMaxLength(2000)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(topicInput),
            new ActionRowBuilder().addComponents(detailsInput),
        );
        await interaction.showModal(modal);
        break;
      }

      case "edit_email": {
        const modal = new ModalBuilder()
            .setCustomId(`email_edit_modal_${announcementId}`)
            .setTitle("Edit Email Announcement");

        const subjectInput = new TextInputBuilder()
            .setCustomId("email_subject")
            .setLabel("Email Subject")
            .setStyle(TextInputStyle.Short)
            .setValue(announcement.emailSubject)
            .setMaxLength(200);

        const contentInput = new TextInputBuilder()
            .setCustomId("email_content")
            .setLabel("Email Content")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(announcement.emailContent)
            .setMaxLength(4000);

        modal.addComponents(
            new ActionRowBuilder().addComponents(subjectInput),
            new ActionRowBuilder().addComponents(contentInput),
        );
        await interaction.showModal(modal);
        break;
      }

      // No other cases for now
    }
  },

  async handleModalSubmit(interaction) {
    const [type, , announcementId] = interaction.customId.split("_");

    const announcement = pendingAnnouncements.get(announcementId);
    if (!announcement) {
      return interaction.reply({
        content: "❌ Announcement expired.",
        flags: 64,
      });
    }

    if (type === "discord") {
      announcement.topic = interaction.fields.getTextInputValue("discord_topic");
      announcement.details = interaction.fields.getTextInputValue("discord_details") || "More details coming soon!";

      // Update Discord content and email content derived from topic/details
      announcement.discordContent = `**Topic:** ${announcement.topic}\n**Details:** ${announcement.details}`;
      announcement.emailSubject = `Club: ${announcement.topic}`;
      announcement.emailContent = `Update: ${announcement.topic}\n\n${announcement.details}`;

    } else if (type === "email") {
      announcement.emailSubject = interaction.fields.getTextInputValue("email_subject");
      announcement.emailContent = interaction.fields.getTextInputValue("email_content");
    }

    pendingAnnouncements.set(announcementId, announcement);

    // Re-render the control panel with updated information
    const embed = new EmbedBuilder()
        .setTitle('📢 ANNOUNCEMENT CONTROL PANEL')
        .setColor(0x5865F2)
        .setDescription('**ANNOUNCEMENT UPDATED**\n\nYour changes have been saved! Use the buttons below to send.')
        .addFields(
            {
                name: 'Discord Preview',
                value: announcement.discordContent.substring(0, 1024)
            },
            {
                name: 'Email Preview',
                value: `**Subject:** ${announcement.emailSubject}\n**Content:** ${announcement.emailContent.substring(0, 150)}...`.substring(0, 1024)
            }
        )
        .setTimestamp();
    
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`edit_discord_${announcementId}`)
                .setLabel('Edit Discord')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✏️'),
            new ButtonBuilder()
                .setCustomId(`edit_email_${announcementId}`)
                .setLabel('Edit Email')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📧'),
            new ButtonBuilder()
                .setCustomId(`test_send_${announcementId}`)
                .setLabel('Test Send')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🧪'),
            new ButtonBuilder()
                .setCustomId(`send_${announcementId}`)
                .setLabel('Send')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📤'),
            new ButtonBuilder()
                .setCustomId(`cancel_${announcementId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );
    
    await interaction.update({
        embeds: [embed],
        components: [buttons],
    });
  },
};

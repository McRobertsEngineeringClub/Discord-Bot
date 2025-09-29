import { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { getClubEmails, sendEmails } from "./emailUtils.js"; // Updated import
import { createAnnouncementEmbed, createStatusEmbed, CLUB_THEME } from "./lib/embedStyles.js"; // Import for embeds

// Store pending announcements
const pendingAnnouncements = new Map();

export default {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Create announcements for Discord and email")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false)
    .addStringOption(opt => opt.setName("topic").setDescription("Main topic").setRequired(true))
    .addStringOption(opt => opt.setName("details").setDescription("Details").setRequired(false)),
  
  async execute(interaction) {
    // Only allow users with ManageMessages
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({ content: "Permission denied.", flags: 64 }); // Changed ephemeral to flags
      return;
    }
    const topic = interaction.options.getString("topic");
    const details = interaction.options.getString("details") || "";
    
    const announcementId = Date.now().toString();
    const discordEmbed = createAnnouncementEmbed(topic, details, 0); // Assuming no attachments for now
    const emailSubject = `Club: ${topic}`;
    const emailContent = `Update: ${topic}\n${details}`;

    pendingAnnouncements.set(announcementId, {
      discordContent: `@everyone **NEW ANNOUNCEMENT**`,
      discordEmbed,
      emailSubject,
      emailContent,
      attachments: [], // No attachments yet in this simplified flow
      createdBy: interaction.user.id,
      createdAt: new Date(),
    });

    // Set a timeout for the announcement to expire (e.g., 30 minutes)
    setTimeout(() => {
      pendingAnnouncements.delete(announcementId);
      console.log(`Cleaned up expired announcement: ${announcementId}`);
    }, 30 * 60 * 1000); // 30 minutes

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`edit_discord_${announcementId}`)
        .setLabel("Edit Discord")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`edit_email_${announcementId}`)
        .setLabel("Edit Email")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`test_preview_${announcementId}`)
        .setLabel("Preview")
        .setStyle(ButtonStyle.Secondary),
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`send_discord_${announcementId}`)
        .setLabel("Send to Discord")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`send_email_${announcementId}`)
        .setLabel("Send to Email")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`send_both_${announcementId}`)
        .setLabel("Send Both")
        .setStyle(ButtonStyle.Success),
    );

    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`cancel_announcement_${announcementId}`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger),
    );

    const previewFields = [
      {
        name: "Discord Preview",
        value: `**Topic:** ${topic}\n**Details:** ${details || "More details coming soon!"}`,
        inline: false,
      },
      {
        name: "Email Preview",
        value: `**Subject:** ${emailSubject}\n**Content:** ${emailContent.substring(0, 150)}...`,
        inline: false,
      },
    ];

    await interaction.reply({
      content: "**ANNOUNCEMENT CONTROL PANEL**",
      embeds: [
        createStatusEmbed(
          "Announcement Ready",
          "Your announcement is ready to send! Use the buttons below to edit or send.",
          "success",
          previewFields,
        ),
      ],
      components: [row1, row2, row3],
      flags: 64, // Changed ephemeral to flags
    });

  },

  async handleButtonInteraction(interaction) {
    try {
      console.log(`Button interaction: ${interaction.customId} by ${interaction.user.tag}`);

      const [action, type, announcementId] = interaction.customId.split("_");

      if (!["edit", "send", "cancel", "test"].includes(action)) return;

      const announcement = pendingAnnouncements.get(announcementId);
      if (!announcement) {
        await interaction.reply({
          embeds: [createStatusEmbed("Announcement Expired", "This announcement has expired or been deleted", "error")],
          flags: 64, // Changed ephemeral to flags
        });
        return;
      }

      if (
        announcement.createdBy !== interaction.user.id &&
        !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)
      ) {
        await interaction.reply({
          embeds: [createStatusEmbed("Access Denied", "You can only edit your own announcements", "error")],
          flags: 64, // Changed ephemeral to flags
        });
        return;
      }

      switch (action) {
        case "test": {
          if (type === "preview") {
            await interaction.reply({
              content: announcement.discordContent,
              embeds: [announcement.discordEmbed],
              flags: 64, // Changed ephemeral to flags
            });
          }
          break;
        }

        case "edit": {
          if (type === "discord") {
            const modal = new ModalBuilder()
              .setCustomId(`discord_edit_modal_${announcementId}`)
              .setTitle("Edit Discord Announcement");

            const topicInput = new TextInputBuilder()
              .setCustomId("discord_topic")
              .setLabel("Main Topic/Event")
              .setStyle(TextInputStyle.Short)
              .setValue(announcement.discordEmbed.data.title || "")
              .setMaxLength(256);

            const detailsInput = new TextInputBuilder()
              .setCustomId("discord_details")
              .setLabel("Additional Details (Optional)")
              .setStyle(TextInputStyle.Paragraph)
              .setValue(announcement.discordEmbed.data.description || "")
              .setMaxLength(2000)
              .setRequired(false);

            modal.addComponents(
              new ActionRowBuilder().addComponents(topicInput),
              new ActionRowBuilder().addComponents(detailsInput),
            );
            await interaction.showModal(modal);
          } else if (type === "email") {
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
          }
          break;
        }

        case "send": {
          await interaction.reply({
            embeds: [
              createStatusEmbed(
                "SENDING ANNOUNCEMENT",
                `Sending ${type === "both" ? "both announcements" : type === "discord" ? "Discord announcement" : "email announcement"}...`,
                "loading",
              ),
            ],
            flags: 64, // Changed ephemeral to flags
          });

          let discordSuccess = false;
          let emailSuccess = false;
          let discordError = null;
          let emailError = null;

          if (type === "discord" || type === "both") {
            try {
              console.log("Attempting to send Discord announcement...");
              const announcementChannel = interaction.guild.channels.cache.get(process.env.ANNOUNCEMENT_CHANNEL_ID);

              if (!announcementChannel) {
                throw new Error(`Announcement channel not found. Channel ID: ${process.env.ANNOUNCEMENT_CHANNEL_ID}`);
              }

              console.log(`Found announcement channel: ${announcementChannel.name}`);

              await announcementChannel.send({
                content: announcement.discordContent,
                embeds: [announcement.discordEmbed],
              });

              discordSuccess = true;
              console.log("Discord announcement sent successfully");
            } catch (error) {
              console.error("Discord send error:", error);
              discordError = error.message;
            }
          }

          if (type === "email" || type === "both") {
            try {
              console.log("Attempting to send email announcement...");
              const emails = await getClubEmails();

              if (emails.length === 0) {
                throw new Error("No emails found in the spreadsheet");
              }

              console.log(`Found ${emails.length} emails`);
              const emailResults = await sendEmails(
                announcement.emailSubject,
                announcement.emailContent,
                emails,
              );

              if (emailResults.failed.length > 0) {
                throw new Error(`Failed to send emails to ${emailResults.failed.length} recipients.`);
              }

              emailSuccess = true;
              console.log("Email announcement sent successfully");
            } catch (error) {
              console.error("Email send error:", error);
              emailError = error.message;
            }
          }

          let resultType = "success";
          let resultMessage = "";

          if (type === "discord") {
            resultMessage = discordSuccess
              ? "Discord announcement sent successfully!"
              : `Discord failed: ${discordError}`;
            resultType = discordSuccess ? "success" : "error";
          } else if (type === "email") {
            resultMessage = emailSuccess ? "Email announcement sent successfully!" : `Email failed: ${emailError}`;
            resultType = emailSuccess ? "success" : "error";
          } else {
            const successes = [];
            const failures = [];

            if (discordSuccess) successes.push("Discord");
            else failures.push(`Discord: ${discordError}`);

            if (emailSuccess) successes.push("Email");
            else failures.push(`Email: ${emailError}`);

            if (successes.length > 0 && failures.length === 0) {
              resultMessage = `All announcements sent successfully! (${successes.join(", ")})`;
              resultType = "success";
            } else if (successes.length > 0) {
              resultMessage = `Partial success: ${successes.join(", ")} sent. Failures: ${failures.join(", ")}`;
              resultType = "warning";
            } else {
              resultMessage = `All failed: ${failures.join(", ")}`;
              resultType = "error";
            }
          }

          await interaction.editReply({
            embeds: [createStatusEmbed("SEND RESULTS", resultMessage, resultType)],
          });

          if (
            (type === "discord" && discordSuccess) ||
            (type === "email" && emailSuccess) ||
            (type === "both" && discordSuccess && emailSuccess)
          ) {
            pendingAnnouncements.delete(announcementId);

            try {
              await interaction.message.edit({
                embeds: [createStatusEmbed("ANNOUNCEMENT SENT", "Successfully sent announcement(s)", "success")],
                components: [],
              });
            } catch (editError) {
              console.log("Could not edit original message:", editError.message);
            }
          }
          break;
        }

        case "cancel": {
          pendingAnnouncements.delete(announcementId);
          await interaction.update({
            embeds: [createStatusEmbed("Announcement Cancelled", "Announcement has been cancelled", "error")],
            components: [],
          });
          break;
        }
      }
    } catch (error) {
      console.error("Button interaction error:", error);
      try {
        const errorEmbed = createStatusEmbed("Interaction Error", error.message, "error");
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ embeds: [errorEmbed], flags: 64 }); // Changed ephemeral to flags
        } else {
          await interaction.editReply({ embeds: [errorEmbed] });
        }
      } catch (replyError) {
        console.error("Failed to send error message:", replyError);
      }
    }
  },

  async handleModalSubmit(interaction) {
    try {
      const [type, , announcementId] = interaction.customId.split("_");

      const announcement = pendingAnnouncements.get(announcementId);
      if (!announcement) {
        await interaction.reply({
          content: "❌ Announcement expired.",
          flags: 64, // Changed ephemeral to flags
        });
        return;
      }

      if (type === "discord") {
        const topic = interaction.fields.getTextInputValue("discord_topic");
        const details = interaction.fields.getTextInputValue("discord_details") || "";

        // Recreate the embed with new content
        announcement.discordEmbed = createAnnouncementEmbed(topic, details, announcement.attachments?.length || 0);
        announcement.discordContent = `@everyone **NEW ANNOUNCEMENT**`;

        // Update email content to match
        announcement.emailSubject = `Engineering Club: ${topic}`;
        announcement.emailContent = `Dear Engineering Club Members,\n\nWe have an important announcement about: ${topic}\n\n${details || "More details will be provided soon."}\n\nBest,\nEngineering Club Execs`;
      } else if (type === "email") {
        announcement.emailSubject = interaction.fields.getTextInputValue("email_subject");
        announcement.emailContent = interaction.fields.getTextInputValue("email_content");
      }

      pendingAnnouncements.set(announcementId, announcement);

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`edit_discord_${announcementId}`)
          .setLabel("Edit Discord")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`edit_email_${announcementId}`)
          .setLabel("Edit Email")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`test_preview_${announcementId}`)
          .setLabel("Preview")
          .setStyle(ButtonStyle.Secondary),
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`send_discord_${announcementId}`)
          .setLabel("Send to Discord")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`send_email_${announcementId}`)
          .setLabel("Send to Email")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`send_both_${announcementId}`)
          .setLabel("Send Both")
          .setStyle(ButtonStyle.Success),
      );

      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`cancel_announcement_${announcementId}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Danger),
      );

      const previewFields = [
        {
          name: "Discord Preview",
          value: `**Topic:** ${announcement.discordEmbed.data.title}\n**Details:** ${announcement.discordEmbed.data.description || "More details coming soon!"}`,
          inline: false,
        },
        {
          name: "Email Preview",
          value: `**Subject:** ${announcement.emailSubject}\n**Content:** ${announcement.emailContent.substring(0, 150)}...`,
          inline: false,
        },
      ];

      await interaction.update({
        content: "**ANNOUNCEMENT CONTROL PANEL**",
        embeds: [
          createStatusEmbed(
            "Announcement Updated",
            "Your changes have been saved! Use the buttons below to send.",
            "success",
            previewFields,
          ),
        ],
        components: [row1, row2, row3],
      });
    } catch (error) {
      console.error("Modal submit error:", error);
      try {
        await interaction.reply({
          embeds: [createStatusEmbed("Update Error", error.message, "error")],
          flags: 64, // Changed ephemeral to flags
        });
      } catch (replyError) {
        console.error("Failed to send error message:", replyError);
      }
    }
  },
};

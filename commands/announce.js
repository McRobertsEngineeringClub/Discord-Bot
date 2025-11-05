import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js"
import { promises as fs } from "node:fs"
import { join } from "node:path"

// File path for persistent storage
const ANNOUNCEMENTS_FILE = join(process.cwd(), "data", "pendingAnnouncements.json")
// Lifespan of an announcement in milliseconds (e.g., 30 minutes)
const ANNOUNCEMENT_LIFESPAN_MS = 30 * 60 * 1000

// Store pending announcements by unique ID (based on user and timestamp)
let pendingAnnouncements = new Map()

// --- Persistence Functions ---

async function saveAnnouncements() {
  try {
    // Convert Map to an array of [key, value] pairs for JSON serialization
    const dataToSave = Array.from(pendingAnnouncements.entries())
    await fs.writeFile(ANNOUNCEMENTS_FILE, JSON.stringify(dataToSave, null, 2))
    console.log("✅ Pending announcements saved.", dataToSave.length, "announcements.")
  } catch (error) {
    console.error("❌ Error saving pending announcements:", error)
  }
}

async function loadAnnouncements() {
  try {
    const data = await fs.readFile(ANNOUNCEMENTS_FILE, "utf8")
    if (!data || data.trim().length === 0) {
      console.log("Pending announcements file is empty, starting fresh.")
      pendingAnnouncements = new Map()
    } else {
      const loadedData = JSON.parse(data)
      pendingAnnouncements = new Map(loadedData)
      console.log("✅ Pending announcements loaded.", pendingAnnouncements.size, "announcements.")
    }
    cleanupAnnouncements() // Clean up loaded announcements immediately
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log("No pending announcements file found, starting fresh.")
      pendingAnnouncements = new Map() // Ensure map is initialized even if file doesn't exist
    } else {
      console.error("❌ Error loading pending announcements:", error)
    }
  }
}

function cleanupAnnouncements() {
  const now = Date.now()
  let cleanedCount = 0
  const initialSize = pendingAnnouncements.size
  for (const [id, announcement] of pendingAnnouncements.entries()) {
    // Assuming 'created' timestamp is stored within the announcement object
    // If not, you might need to store it as part of the map key or value.
    // For now, let's assume announcement.timestamp exists
    if (!announcement.timestamp) {
      // If no timestamp, use the timestamp from the announcementId (e.g., user-ID-timestamp)
      const idParts = id.split("-")
      if (idParts.length > 1) {
        announcement.timestamp = Number.parseInt(idParts[idParts.length - 1], 10)
      } else {
        announcement.timestamp = 0 // Treat as expired if no valid timestamp
      }
    }

    if (now - announcement.timestamp > ANNOUNCEMENT_LIFESPAN_MS) {
      console.log(
        `🧹 Cleaning up expired announcement: ${id} (Age: ${((now - announcement.timestamp) / 1000 / 60).toFixed(1)} minutes)`,
      )
      pendingAnnouncements.delete(id)
      cleanedCount++
    }
  }
  if (cleanedCount > 0) {
    console.log(
      `🧹 Cleaned up ${cleanedCount} expired announcements (initial: ${initialSize}, current: ${pendingAnnouncements.size}).`,
    )
    saveAnnouncements() // Save changes after cleanup
  } else if (initialSize > 0) {
    console.log(`🔍 No expired announcements to clean up. Total: ${initialSize}.`)
  }
}

// Schedule periodic cleanup
setInterval(cleanupAnnouncements, ANNOUNCEMENT_LIFESPAN_MS / 2) // Run cleanup twice as often as lifespan

export default {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Create and send an announcement")
    .addStringOption((option) =>
      option.setName("topic").setDescription("The topic of the announcement").setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("details").setDescription("The details of the announcement").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Requires Administrator permissions

  async execute(interaction, client) {
    const topic = interaction.options.getString("topic")
    const details = interaction.options.getString("details")
    const announcementId = `${interaction.user.id}-${Date.now()}` // Unique ID for this announcement

    // Store announcement data
    pendingAnnouncements.set(announcementId, {
      topic,
      discordContent: details,
      emailContent: details,
      userId: interaction.user.id,
      channelId: interaction.channelId, // Store original channel for Discord send
      timestamp: Date.now(), // Add timestamp for cleanup
    })
    console.log(`✨ New announcement created: ${announcementId}`)
    saveAnnouncements() // Save after new announcement

    const embed = new EmbedBuilder()
      .setTitle("📢 Announcement Control Panel")
      .setDescription("Use the buttons below to edit, preview, test, or send your announcement.")
      .setColor(0x5865f2) // Discord blurple color
      .addFields(
        { name: "📝 Topic", value: `\`\`\`${topic}\`\`\``, inline: false },
        {
          name: "💬 Discord Content",
          value: details.length > 0 ? `\`\`\`${details.substring(0, 1000)}\`\`\`` : "*No content*",
          inline: false,
        },
        {
          name: "📧 Email Content",
          value: details.length > 0 ? `\`\`\`${details.substring(0, 1000)}\`\`\`` : "*No content*",
          inline: false,
        },
      )
      .setTimestamp()
      .setFooter({
        text: `ID: ${announcementId} | Created by ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL(),
      })

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`announce_edit_discord_${announcementId}`)
        .setLabel("Edit Discord")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("✏️"),
      new ButtonBuilder()
        .setCustomId(`announce_edit_email_${announcementId}`)
        .setLabel("Edit Email")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📝"),
      new ButtonBuilder()
        .setCustomId(`announce_preview_${announcementId}`)
        .setLabel("Preview")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("👁️"),
      new ButtonBuilder()
        .setCustomId(`announce_test_email_${announcementId}`)
        .setLabel("Test Email")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🧪"),
    )

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`announce_send_discord_${announcementId}`)
        .setLabel("Send to Discord")
        .setStyle(ButtonStyle.Success)
        .setEmoji("📤"),
      new ButtonBuilder()
        .setCustomId(`announce_send_email_${announcementId}`)
        .setLabel("Send Email")
        .setStyle(ButtonStyle.Success)
        .setEmoji("📧"),
      new ButtonBuilder()
        .setCustomId(`announce_cancel_${announcementId}`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("❌"),
    )

    await interaction.editReply({
      embeds: [embed],
      components: [row1, row2],
    })
  },

  async handleButton(interaction, client) {
    const customId = interaction.customId
    if (!customId.startsWith("announce_")) return

    let action,
      subAction = null,
      announcementId

    // Strip the "announce_" prefix
    const withoutPrefix = customId.replace(/^announce_/, "")

    if (withoutPrefix.startsWith("edit_") || withoutPrefix.startsWith("send_") || withoutPrefix.startsWith("test_")) {
      const parts = withoutPrefix.split("_")
      action = parts[0] // "edit", "send", or "test"
      subAction = parts[1] // "discord", "email", etc.
      announcementId = parts.slice(2).join("_")
    } else {
      // Case: preview_<id> or cancel_<id>
      const parts = withoutPrefix.split("_")
      action = parts[0] // "preview" or "cancel"
      announcementId = parts.slice(1).join("_")
    }

    console.log(
      `🔍 Handling button for announcementId: ${announcementId}, Action: ${action}, SubAction: ${subAction || "N/A"}`,
    )

    const announcement = pendingAnnouncements.get(announcementId)
    if (!announcement) {
      const replyMethod = interaction.deferred ? "editReply" : "reply"
      await interaction[replyMethod]({
        content: "❌ Announcement not found or expired!",
        components: [],
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const getControlPanelMessage = () => {
      const embed = new EmbedBuilder()
        .setTitle("📢 Announcement Control Panel")
        .setDescription("Use the buttons below to edit, preview, test, or send your announcement.")
        .setColor(0x5865f2)
        .addFields(
          { name: "📝 Topic", value: `\`\`\`${announcement.topic}\`\`\``, inline: false },
          {
            name: "💬 Discord Content",
            value:
              announcement.discordContent.length > 0
                ? `\`\`\`${announcement.discordContent.substring(0, 1000)}\`\`\``
                : "*No content*",
            inline: false,
          },
          {
            name: "📧 Email Content",
            value:
              announcement.emailContent.length > 0
                ? `\`\`\`${announcement.emailContent.substring(0, 1000)}\`\`\``
                : "*No content*",
            inline: false,
          },
        )
        .setTimestamp()
        .setFooter({
          text: `ID: ${announcementId} | Created by ${interaction.user.username}`,
          iconURL: interaction.user.displayAvatarURL(),
        })

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`announce_edit_discord_${announcementId}`)
          .setLabel("Edit Discord")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("✏️"),
        new ButtonBuilder()
          .setCustomId(`announce_edit_email_${announcementId}`)
          .setLabel("Edit Email")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("📝"),
        new ButtonBuilder()
          .setCustomId(`announce_preview_${announcementId}`)
          .setLabel("Preview")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("👁️"),
        new ButtonBuilder()
          .setCustomId(`announce_test_email_${announcementId}`)
          .setLabel("Test Email")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("🧪"),
      )

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`announce_send_discord_${announcementId}`)
          .setLabel("Send to Discord")
          .setStyle(ButtonStyle.Success)
          .setEmoji("📤"),
        new ButtonBuilder()
          .setCustomId(`announce_send_email_${announcementId}`)
          .setLabel("Send Email")
          .setStyle(ButtonStyle.Success)
          .setEmoji("📧"),
        new ButtonBuilder()
          .setCustomId(`announce_cancel_${announcementId}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌"),
      )

      return { embeds: [embed], components: [row1, row2] }
    }

    // --- PREVIEW ---
    if (action === "preview") {
      const previewEmbed = new EmbedBuilder()
        .setTitle(`📢 ${announcement.topic}`)
        .setDescription(announcement.discordContent || "*No content*")
        .setColor(0x1e90ff)
        .setThumbnail("attachment://club_logo.png")
        .setFooter({ text: `Announced by ${interaction.user.username}` })
        .setTimestamp()

      await interaction.followUp({
        content: "**📱 Discord Preview:**",
        embeds: [previewEmbed],
        files: [
          {
            attachment: "./assets/club_logo.png",
            name: "club_logo.png",
          },
        ],
        flags: MessageFlags.Ephemeral,
      })

      await interaction.followUp({
        content: `**📧 Email Preview:**\n\n**Subject:** \`${announcement.topic}\`\n\n**Body:**\n\`\`\`\n${announcement.emailContent}\n\`\`\``,
        flags: MessageFlags.Ephemeral,
      })
    } else if (action === "test" && subAction === "email") {
      await interaction.followUp({
        content: "🧪 Sending test email to club1engineering@gmail.com...",
        flags: MessageFlags.Ephemeral,
      })

      try {
        const { sendEmails } = await import("../emailUtils.js")
        const testEmail = "club1engineering@gmail.com"

        const results = await sendEmails(
          `[TEST] ${announcement.topic}`,
          `This is a test email.\n\n${announcement.emailContent}`,
          [testEmail],
        )

        if (results.failed.length > 0) {
          throw new Error(`Failed to send test email: ${results.failed[0].error}`)
        }

        await interaction.followUp({
          content: `✅ Test email sent successfully to ${testEmail}!`,
          flags: MessageFlags.Ephemeral,
        })
      } catch (error) {
        console.error("Error sending test email:", error)
        await interaction.followUp({
          content: `❌ Failed to send test email: ${error.message}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }

    // --- CANCEL ---
    else if (action === "cancel") {
      pendingAnnouncements.delete(announcementId)
      saveAnnouncements()
      await interaction.deleteReply() // Use deleteReply instead of update since interaction is already deferred
    }

    // --- EDIT ---
    else if (action === "edit") {
      if (subAction === "discord") {
        const modal = new ModalBuilder()
          .setCustomId(`announce_modal_discord_${announcementId}`)
          .setTitle("Edit Discord Content")

        const contentInput = new TextInputBuilder()
          .setCustomId("content")
          .setLabel("Discord Message Content")
          .setStyle(TextInputStyle.Paragraph)
          .setValue(announcement.discordContent)
          .setMaxLength(4000)
          .setRequired(true)

        modal.addComponents(new ActionRowBuilder().addComponents(contentInput))

        await interaction.deferUpdate() // Use deferUpdate interaction state to show modal
        await interaction.showModal(modal)
      } else if (subAction === "email") {
        const modal = new ModalBuilder()
          .setCustomId(`announce_modal_email_${announcementId}`)
          .setTitle("Edit Email Content")

        const contentInput = new TextInputBuilder()
          .setCustomId("content")
          .setLabel("Email Body Content")
          .setStyle(TextInputStyle.Paragraph)
          .setValue(announcement.emailContent)
          .setMaxLength(4000)
          .setRequired(true)

        modal.addComponents(new ActionRowBuilder().addComponents(contentInput))

        await interaction.deferUpdate() // Use deferUpdate interaction state to show modal
        await interaction.showModal(modal)
      }
    }

    // --- SEND ---
    else if (action === "send") {
      if (subAction === "discord") {
        await interaction.editReply({
          ...getControlPanelMessage(),
          content: "📤 Sending Discord announcement...",
        })

        try {
          const channelId = process.env.ANNOUNCEMENT_CHANNEL_ID || announcement.channelId
          const channel = await client.channels.fetch(channelId)

          if (!channel) throw new Error(`Announcement channel with ID ${channelId} not found.`)

          const announceEmbed = new EmbedBuilder()
            .setTitle(`📢 ${announcement.topic}`)
            .setDescription(announcement.discordContent)
            .setColor(0x1e90ff)
            .setThumbnail("attachment://club_logo.png")
            .setTimestamp()
            .setFooter({ text: `Announced by ${interaction.user.username}` })

          await channel.send({
            embeds: [announceEmbed],
            files: [
              {
                attachment: "./assets/club_logo.png",
                name: "club_logo.png",
              },
            ],
          })

          await interaction.editReply({
            content: "✅ Discord announcement sent successfully!",
            embeds: [],
            components: [],
          })

          pendingAnnouncements.delete(announcementId)
          saveAnnouncements()
        } catch (error) {
          console.error("Error sending Discord announcement:", error)
          await interaction.editReply({
            ...getControlPanelMessage(),
            content: `❌ Failed to send Discord announcement: ${error.message}`,
          })
        }
      } else if (subAction === "email") {
        await interaction.editReply({
          ...getControlPanelMessage(),
          content: "📧 Sending email announcement...",
        })

        try {
          const { getEmailList, sendEmails } = await import("../emailUtils.js")
          const emailList = await getEmailList()

          if (!emailList || emailList.length === 0) {
            throw new Error("No email addresses found!")
          }

          const results = await sendEmails(announcement.topic, announcement.emailContent, emailList)

          if (results.failed.length > 0) {
            throw new Error(`Failed to send emails to ${results.failed.length} recipients.`)
          }

          await interaction.editReply({
            content: `✅ Email announcement sent successfully to ${results.successful.length} recipients!`,
            embeds: [],
            components: [],
          })

          pendingAnnouncements.delete(announcementId)
          saveAnnouncements()
        } catch (error) {
          console.error("Error sending emails:", error)
          await interaction.editReply({
            ...getControlPanelMessage(),
            content: `❌ Failed to send emails: ${error.message}`,
          })
        }
      }
    }
  },

  async handleModal(interaction, client) {
    const customId = interaction.customId
    if (!customId.startsWith("announce_modal_")) return

    const parts = customId.split("_")
    const type = parts[2] // 'discord' or 'email'
    const announcementId = parts.slice(3).join("_")

    const announcement = pendingAnnouncements.get(announcementId)

    if (!announcement) {
      await interaction.editReply({
        content: "❌ Announcement not found or expired!",
        embeds: [],
        components: [],
      })
      return
    }

    if (announcement.userId !== interaction.user.id) {
      await interaction.editReply({
        content: "❌ You can only manage your own announcements!",
        embeds: [],
        components: [],
      })
      return
    }

    const newContent = interaction.fields.getTextInputValue("content")

    if (type === "discord") {
      announcement.discordContent = newContent
    } else if (type === "email") {
      announcement.emailContent = newContent
    }
    saveAnnouncements()

    const embed = new EmbedBuilder()
      .setTitle("📢 Announcement Control Panel")
      .setDescription("Use the buttons below to edit, preview, test, or send your announcement.")
      .setColor(0x5865f2)
      .addFields(
        { name: "📝 Topic", value: `\`\`\`${announcement.topic}\`\`\``, inline: false },
        {
          name: "💬 Discord Content",
          value:
            announcement.discordContent.length > 0
              ? `\`\`\`${announcement.discordContent.substring(0, 1000)}\`\`\``
              : "*No content*",
          inline: false,
        },
        {
          name: "📧 Email Content",
          value:
            announcement.emailContent.length > 0
              ? `\`\`\`${announcement.emailContent.substring(0, 1000)}\`\`\``
              : "*No content*",
          inline: false,
        },
      )
      .setTimestamp()
      .setFooter({ text: `ID: ${announcementId} | Content updated!`, iconURL: interaction.user.displayAvatarURL() })

    await interaction.editReply({
      embeds: [embed],
      components: interaction.message.components,
    })
  },

  async initialize() {
    console.log("🚀 Initializing announce command, loading pending announcements...")
    await loadAnnouncements()
    console.log("Current pendingAnnouncements size after init:", pendingAnnouncements.size)
  },
}

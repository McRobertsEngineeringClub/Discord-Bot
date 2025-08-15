import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} from "discord.js"
import { google } from "googleapis"
import nodemailer from "nodemailer"
import fetch from "node-fetch"

// Store pending announcements
const pendingAnnouncements = new Map()

// Helper function to get current academic year sheet name
function getCurrentSheetName() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const academicStartYear = currentMonth >= 8 ? currentYear : currentYear - 1
  const academicEndYear = academicStartYear + 1
  return `${academicStartYear}/${academicEndYear} Engineering Club Sign Up Sheet  (Responses)`
}

// Helper function to get current academic year string (e.g., "2024/2025")
function getCurrentAcademicYear() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const academicStartYear = currentMonth >= 8 ? currentYear : currentYear - 1
  const academicEndYear = academicStartYear + 1
  return `${academicStartYear}/${academicEndYear}`
}

// Helper function to find the correct sheet name
async function findCorrectSheetName(sheets, spreadsheetId) {
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
    const sheetNames = spreadsheet.data.sheets.map((sheet) => sheet.properties.title)

    const currentAcademicYear = getCurrentAcademicYear()
    console.log(`Looking for sheets with academic year: ${currentAcademicYear}`)

    // First, try to find the exact match with current academic year
    const targetSheet = sheetNames.find(
      (name) =>
        name.includes("Engineering Club Sign Up") && name.includes("Responses") && name.includes(currentAcademicYear),
    )

    if (targetSheet) {
      console.log(`Found exact match: ${targetSheet}`)
      return targetSheet
    }

    // If no exact match, try to find any sheet with the current academic year
    const yearSheet = sheetNames.find((name) => name.includes(currentAcademicYear))
    if (yearSheet) {
      console.log(`Found year match: ${yearSheet}`)
      return yearSheet
    }

    // If still no match, try to find the most recent academic year
    const academicYearPattern = /(\d{4})\/(\d{4})/
    const sheetsWithYears = sheetNames
      .map((name) => {
        const match = name.match(academicYearPattern)
        if (match) {
          return {
            name,
            startYear: Number.parseInt(match[1]),
            endYear: Number.parseInt(match[2]),
          }
        }
        return null
      })
      .filter(Boolean)
      .sort((a, b) => b.startYear - a.startYear) // Sort by most recent year first

    if (sheetsWithYears.length > 0) {
      console.log(`Found most recent academic year sheet: ${sheetsWithYears[0].name}`)
      return sheetsWithYears[0].name
    }

    // Last resort: return the first sheet
    console.log(`No academic year sheets found, using first sheet: ${sheetNames[0]}`)
    return sheetNames[0]
  } catch (error) {
    console.error("Error finding sheet name:", error)
    return getCurrentSheetName()
  }
}

// Helper function to get emails from Google Sheets
async function getClubEmails() {
  try {
    if (!process.env.GOOGLE_SHEETS_ID || !process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      throw new Error("Missing Google Sheets environment variables")
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        type: "service_account",
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    })

    const sheets = google.sheets({ version: "v4", auth })
    const sheetName = await findCorrectSheetName(sheets, process.env.GOOGLE_SHEETS_ID)

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: `'${sheetName}'!B:B`,
    })

    const emails = response.data.values
      ?.flat()
      .filter((email) => email && email.includes("@"))
      .filter((email, index, arr) => arr.indexOf(email) === index)

    return { emails: emails || [], sheetName }
  } catch (error) {
    console.error("Error fetching emails:", error)
    throw error
  }
}

// Helper function to send emails
async function sendEmails(subject, content, emails, attachments = []) {
  try {
    if (!process.env.EMAIL_FROM || !process.env.EMAIL_PASSWORD) {
      throw new Error("Email credentials not configured")
    }

    console.log(`Setting up email with: ${process.env.EMAIL_FROM.substring(0, 3)}...`)

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_FROM,
        pass: process.env.EMAIL_PASSWORD,
      },
    })

    console.log("Testing email connection...")
    await transporter.verify()
    console.log("Email connection verified!")

    const emailAttachments = []
    for (const attachment of attachments) {
      try {
        const response = await fetch(attachment.url)
        const buffer = await response.buffer()
        emailAttachments.push({
          filename: attachment.name,
          content: buffer,
        })
      } catch (error) {
        console.error(`Failed to download attachment ${attachment.name}:`, error)
      }
    }

    console.log(`Sending email to ${emails.length} recipients with ${emailAttachments.length} attachments...`)
    await transporter.sendMail({
      from: `"Engineering Club" <${process.env.EMAIL_FROM}>`,
      bcc: emails.join(","),
      subject: subject,
      text: content,
      html: content.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>"),
      attachments: emailAttachments,
    })
    console.log("Email sent successfully!")

    return true
  } catch (error) {
    console.error("Email error details:", error)
    throw error
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Create announcements for Discord and email")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a new announcement")
        .addStringOption((option) => option.setName("topic").setDescription("The main topic/event").setRequired(true))
        .addStringOption((option) =>
          option.setName("details").setDescription("Additional details (optional)").setRequired(false),
        )
        .addAttachmentOption((option) =>
          option.setName("attachment1").setDescription("Optional file/image to include").setRequired(false),
        )
        .addAttachmentOption((option) =>
          option.setName("attachment2").setDescription("Optional second file/image").setRequired(false),
        )
        .addAttachmentOption((option) =>
          option.setName("attachment3").setDescription("Optional third file/image").setRequired(false),
        ),
    )
    .addSubcommand((subcommand) => subcommand.setName("test-emails").setDescription("Test email connection"))
    .addSubcommand((subcommand) =>
      subcommand.setName("test-email-auth").setDescription("Test email authentication only"),
    )
    .addSubcommand((subcommand) => subcommand.setName("list-sheets").setDescription("List available sheets"))
    .addSubcommand((subcommand) =>
      subcommand.setName("check-year").setDescription("Check which academic year the bot is detecting"),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  async execute(interaction) {
    try {
      console.log(`Announce command: ${interaction.options.getSubcommand()} by ${interaction.user.tag}`)

      // Check permissions first
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        await interaction.reply({
          content: "❌ No permission to create announcements.",
          ephemeral: true,
        })
        return
      }

      const subcommand = interaction.options.getSubcommand()

      if (subcommand === "create") {
        const topic = interaction.options.getString("topic")
        const details = interaction.options.getString("details") || ""

        const attachments = []
        for (let i = 1; i <= 3; i++) {
          const attachment = interaction.options.getAttachment(`attachment${i}`)
          if (attachment) {
            attachments.push({
              name: attachment.name,
              url: attachment.url,
              size: attachment.size,
              contentType: attachment.contentType,
            })
          }
        }

        const discordEmbed = new EmbedBuilder()
          .setTitle(`🚨 ${topic}`)
          .setDescription(`# ${details || "More details coming soon!"}\n\u200B\n\u200B`)
          .setColor(0x5dade2) // Light blue color to match logo
          .addFields(
            { name: "\n# 📍 **Location**", value: "# Electronics Room\n\u200B\n\u200B\n\u200B", inline: true },
            { name: "\n# ⏰ **Time**", value: "# TBD\n\u200B\n\u200B\n\u200B", inline: true },
            { name: "\n# 🎯 **What to Bring**", value: "# TBD\n\u200B\n\u200B\n\u200B", inline: true },
          )
          .setFooter({
            text: "Engineering Club • Stay tuned for updates!",
            iconURL: "https://cdn.discordapp.com/emojis/🔧.png",
          })
          .setTimestamp()
          .setThumbnail("https://drive.google.com/uc?export=view&id=1FMf439DX_I-Up9Nww7x-ajlyuppcE_rZ")

        const discordContent = "@everyone"
        const emailSubject = `🛠️ Engineering Club: ${topic}`
        const emailContent = `Dear Engineering Club Members,\n\nWe have an important announcement about: ${topic}\n\n${details || "More details will be provided soon."}\n\nHere's what you need to know:\n- **When:** TBD\n- **Where:** Electronics room\n- **What to bring:** TBD\n\nStay tuned for more information!\n\nBest,\nEngineering Club Execs`

        // Store announcement with embed
        const announcementId = Date.now().toString()
        pendingAnnouncements.set(announcementId, {
          discordContent,
          discordEmbed,
          emailSubject,
          emailContent,
          attachments,
          createdBy: interaction.user.id,
          createdAt: new Date(),
        })

        // Create buttons with separate send options
        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`edit_discord_${announcementId}`)
            .setLabel("Edit Discord")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("💬"),
          new ButtonBuilder()
            .setCustomId(`edit_email_${announcementId}`)
            .setLabel("Edit Email")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📧"),
          new ButtonBuilder()
            .setCustomId(`test_preview_${announcementId}`)
            .setLabel("Test Preview")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("👀"),
        )

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`send_discord_${announcementId}`)
            .setLabel("Send Discord Only")
            .setStyle(ButtonStyle.Success)
            .setEmoji("💬"),
          new ButtonBuilder()
            .setCustomId(`send_email_${announcementId}`)
            .setLabel("Send Email Only")
            .setStyle(ButtonStyle.Success)
            .setEmoji("📧"),
          new ButtonBuilder()
            .setCustomId(`send_both_${announcementId}`)
            .setLabel("Send Both")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🚀"),
        )

        const row3 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`cancel_announcement_${announcementId}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌"),
        )

        const previewFields = [
          {
            name: "💬 Discord Message",
            value: `**Content:** ${discordContent}\n**Embed Title:** ${discordEmbed.data.title}\n**Description:** ${discordEmbed.data.description}\n**Fields:** ${discordEmbed.data.fields.map((f) => `${f.name}: ${f.value}`).join(", ")}`,
            inline: false,
          },
          {
            name: "📧 Email Subject",
            value: `\`\`\`${emailSubject}\`\`\``,
            inline: false,
          },
          {
            name: "📧 Email Content",
            value: `\`\`\`${emailContent.substring(0, 500)}${emailContent.length > 500 ? "..." : ""}\`\`\``,
            inline: false,
          },
        ]

        if (attachments.length > 0) {
          previewFields.push({
            name: "📎 Attachments",
            value: attachments
              .map(
                (att) => `• **${att.name}** (${(att.size / 1024).toFixed(1)}KB) - ${att.contentType || "Unknown type"}`,
              )
              .join("\n"),
            inline: false,
          })
        }

        await interaction.reply({
          content: "📢 **Announcement Ready!**",
          embeds: [
            {
              title: "📢 Announcement Preview",
              fields: previewFields,
              color: 0x00ff00,
              footer: { text: "Use the buttons below to edit or send!" },
            },
          ],
          components: [row1, row2, row3],
          ephemeral: true,
        })
      } else if (subcommand === "test-emails") {
        await interaction.deferReply({ ephemeral: true })

        try {
          const result = await getClubEmails()
          const emails = result.emails
          const sheetName = result.sheetName

          await interaction.editReply({
            content: null,
            embeds: [
              {
                title: "📊 Email Test Results",
                fields: [
                  { name: "Sheet Name", value: sheetName, inline: false },
                  { name: "Emails Found", value: emails.length.toString(), inline: true },
                  {
                    name: "Sample Emails",
                    value: emails.length > 0 ? emails.slice(0, 5).join("\n") : "No emails found",
                    inline: false,
                  },
                ],
                color: emails.length > 0 ? 0x00ff00 : 0xff0000,
              },
            ],
          })
        } catch (error) {
          console.error("Test emails error:", error)
          await interaction.editReply(`❌ Error: ${error.message}`)
        }
      } else if (subcommand === "test-email-auth") {
        await interaction.deferReply({ ephemeral: true })

        try {
          if (!process.env.EMAIL_FROM || !process.env.EMAIL_PASSWORD) {
            throw new Error("Email credentials not configured")
          }

          console.log("Testing email authentication...")
          const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
              user: process.env.EMAIL_FROM,
              pass: process.env.EMAIL_PASSWORD,
            },
          })

          await transporter.verify()

          await interaction.editReply({
            content: null,
            embeds: [
              {
                title: "✅ Email Authentication Successful",
                description: `Successfully authenticated with ${process.env.EMAIL_FROM}`,
                color: 0x00ff00,
              },
            ],
          })
        } catch (error) {
          console.error("Email auth error:", error)
          await interaction.editReply({
            content: null,
            embeds: [
              {
                title: "❌ Email Authentication Failed",
                description: `Error: ${error.message}`,
                fields: [
                  { name: "Email Address", value: process.env.EMAIL_FROM || "Not set", inline: true },
                  { name: "Password", value: process.env.EMAIL_PASSWORD ? "Set (hidden)" : "Not set", inline: true },
                ],
                color: 0xff0000,
              },
            ],
          })
        }
      } else if (subcommand === "check-year") {
        await interaction.deferReply({ ephemeral: true })

        try {
          const currentAcademicYear = getCurrentAcademicYear()
          const currentSheetName = getCurrentSheetName()

          const auth = new google.auth.GoogleAuth({
            credentials: {
              type: "service_account",
              project_id: process.env.GOOGLE_PROJECT_ID,
              private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
              private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
              client_email: process.env.GOOGLE_CLIENT_EMAIL,
              client_id: process.env.GOOGLE_CLIENT_ID,
              auth_uri: "https://accounts.google.com/o/oauth2/auth",
              token_uri: "https://oauth2.googleapis.com/token",
              auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
              client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
            },
            scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
          })

          const sheets = google.sheets({ version: "v4", auth })
          const detectedSheetName = await findCorrectSheetName(sheets, process.env.GOOGLE_SHEETS_ID)

          await interaction.editReply({
            content: null,
            embeds: [
              {
                title: "📅 Academic Year Detection",
                fields: [
                  { name: "Current Academic Year", value: currentAcademicYear, inline: true },
                  { name: "Expected Sheet Name", value: currentSheetName, inline: false },
                  { name: "Detected Sheet Name", value: detectedSheetName, inline: false },
                  {
                    name: "Status",
                    value: detectedSheetName.includes(currentAcademicYear)
                      ? "✅ Correct year detected"
                      : "⚠️ Using fallback sheet",
                    inline: true,
                  },
                ],
                color: detectedSheetName.includes(currentAcademicYear) ? 0x00ff00 : 0xffaa00,
                footer: { text: "The bot automatically detects the current academic year based on the date" },
              },
            ],
          })
        } catch (error) {
          console.error("Check year error:", error)
          await interaction.editReply(`❌ Error: ${error.message}`)
        }
      } else if (subcommand === "list-sheets") {
        await interaction.deferReply({ ephemeral: true })

        try {
          const auth = new google.auth.GoogleAuth({
            credentials: {
              type: "service_account",
              project_id: process.env.GOOGLE_PROJECT_ID,
              private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
              private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
              client_email: process.env.GOOGLE_CLIENT_EMAIL,
              client_id: process.env.GOOGLE_CLIENT_ID,
              auth_uri: "https://accounts.google.com/o/oauth2/auth",
              token_uri: "https://oauth2.googleapis.com/token",
              auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
              client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
            },
            scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
          })

          const sheets = google.sheets({ version: "v4", auth })
          const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId: process.env.GOOGLE_SHEETS_ID,
          })

          const sheetNames = spreadsheet.data.sheets.map((sheet) => sheet.properties.title)
          const currentAcademicYear = getCurrentAcademicYear()

          // Highlight sheets that match the current academic year
          const formattedSheets = sheetNames.map((name, index) => {
            const isCurrentYear = name.includes(currentAcademicYear)
            return `${index + 1}. ${name}${isCurrentYear ? " ⭐" : ""}`
          })

          await interaction.editReply({
            content: null,
            embeds: [
              {
                title: "📋 Available Sheets",
                description: formattedSheets.join("\n"),
                fields: [
                  { name: "Total Sheets", value: sheetNames.length.toString(), inline: true },
                  { name: "Current Academic Year", value: currentAcademicYear, inline: true },
                  { name: "Expected Pattern", value: getCurrentSheetName(), inline: false },
                ],
                color: 0x0099ff,
                footer: { text: "⭐ indicates sheets matching the current academic year" },
              },
            ],
          })
        } catch (error) {
          console.error("List sheets error:", error)
          await interaction.editReply(`❌ Error: ${error.message}`)
        }
      }
    } catch (error) {
      console.error("Command error:", error)
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true })
        } else {
          await interaction.editReply(`❌ Error: ${error.message}`)
        }
      } catch (replyError) {
        console.error("Failed to send error message:", replyError)
      }
    }
  },

  // Handle button interactions
  async handleButtonInteraction(interaction) {
    try {
      console.log(`Button interaction: ${interaction.customId} by ${interaction.user.tag}`)

      const [action, type, announcementId] = interaction.customId.split("_")

      if (!["edit", "send", "cancel", "test"].includes(action)) return

      const announcement = pendingAnnouncements.get(announcementId)
      if (!announcement) {
        await interaction.reply({
          content: "❌ This announcement has expired.",
          ephemeral: true,
        })
        return
      }

      if (
        announcement.createdBy !== interaction.user.id &&
        !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)
      ) {
        await interaction.reply({
          content: "❌ You can only edit your own announcements.",
          ephemeral: true,
        })
        return
      }

      switch (action) {
        case "test": {
          if (type === "preview") {
            const testMessageOptions = {
              content: `${announcement.discordContent} 🧪 **Test Preview** - This is how your announcement will look:`,
              embeds: [announcement.discordEmbed],
            }

            if (announcement.attachments && announcement.attachments.length > 0) {
              testMessageOptions.files = announcement.attachments.map((att) => ({
                attachment: att.url,
                name: att.name,
              }))
            }

            await interaction.reply({
              ...testMessageOptions,
              ephemeral: false, // Make it visible to test in the channel
            })
          }
          break
        }

        case "edit": {
          if (type === "discord") {
            const modal = new ModalBuilder()
              .setCustomId(`discord_edit_modal_${announcementId}`)
              .setTitle("Edit Discord Announcement")

            const textInput = new TextInputBuilder()
              .setCustomId("discord_content")
              .setLabel("Discord Content")
              .setStyle(TextInputStyle.Paragraph)
              .setValue(JSON.stringify(announcement.discordEmbed.data))
              .setMaxLength(2000)

            modal.addComponents(new ActionRowBuilder().addComponents(textInput))
            await interaction.showModal(modal)
          } else if (type === "email") {
            const modal = new ModalBuilder()
              .setCustomId(`email_edit_modal_${announcementId}`)
              .setTitle("Edit Email Announcement")

            const subjectInput = new TextInputBuilder()
              .setCustomId("email_subject")
              .setLabel("Email Subject")
              .setStyle(TextInputStyle.Short)
              .setValue(announcement.emailSubject)
              .setMaxLength(200)

            const contentInput = new TextInputBuilder()
              .setCustomId("email_content")
              .setLabel("Email Content")
              .setStyle(TextInputStyle.Paragraph)
              .setValue(announcement.emailContent)
              .setMaxLength(4000)

            modal.addComponents(
              new ActionRowBuilder().addComponents(subjectInput),
              new ActionRowBuilder().addComponents(contentInput),
            )
            await interaction.showModal(modal)
          }
          break
        }

        case "send": {
          await interaction.reply({
            content: `🚀 Sending ${type === "both" ? "both announcements" : type === "discord" ? "Discord announcement" : "email announcement"}...`,
            ephemeral: true,
          })

          let discordSuccess = false
          let emailSuccess = false
          let discordError = null
          let emailError = null

          // Send Discord announcement
          if (type === "discord" || type === "both") {
            try {
              console.log("Attempting to send Discord announcement...")
              const announcementChannel = interaction.guild.channels.cache.get(process.env.ANNOUNCEMENT_CHANNEL_ID)

              if (!announcementChannel) {
                throw new Error(`Announcement channel not found. Channel ID: ${process.env.ANNOUNCEMENT_CHANNEL_ID}`)
              }

              console.log(`Found announcement channel: ${announcementChannel.name}`)

              const messageOptions = {
                content: announcement.discordContent,
                embeds: [announcement.discordEmbed],
              }

              if (announcement.attachments && announcement.attachments.length > 0) {
                messageOptions.files = announcement.attachments.map((att) => ({
                  attachment: att.url,
                  name: att.name,
                }))
              }

              await announcementChannel.send(messageOptions)
              discordSuccess = true
              console.log("Discord announcement sent successfully")
            } catch (error) {
              console.error("Discord send error:", error)
              discordError = error.message
            }
          }

          // Send Email announcement
          if (type === "email" || type === "both") {
            try {
              console.log("Attempting to send email announcement...")
              const result = await getClubEmails()
              const emails = result.emails

              if (emails.length === 0) {
                throw new Error("No emails found in the spreadsheet")
              }

              console.log(`Found ${emails.length} emails`)
              await sendEmails(
                announcement.emailSubject,
                announcement.emailContent,
                emails,
                announcement.attachments || [],
              )
              emailSuccess = true
              console.log("Email announcement sent successfully")
            } catch (error) {
              console.error("Email send error:", error)
              emailError = error.message
            }
          }

          // Build result message
          let resultMessage = ""
          if (type === "discord") {
            resultMessage = discordSuccess ? "✅ Discord announcement sent!" : `❌ Discord failed: ${discordError}`
          } else if (type === "email") {
            resultMessage = emailSuccess ? "✅ Email announcement sent!" : `❌ Email failed: ${emailError}`
          } else {
            // both
            const results = []
            if (discordSuccess) results.push("✅ Discord sent")
            else results.push(`❌ Discord failed: ${discordError}`)

            if (emailSuccess) results.push("✅ Email sent")
            else results.push(`❌ Email failed: ${emailError}`)

            resultMessage = results.join("\n")
          }

          await interaction.editReply(resultMessage)

          // If everything was successful, clean up
          if (
            (type === "discord" && discordSuccess) ||
            (type === "email" && emailSuccess) ||
            (type === "both" && discordSuccess && emailSuccess)
          ) {
            pendingAnnouncements.delete(announcementId)

            try {
              await interaction.message.edit({
                embeds: [
                  {
                    title: "✅ Announcement Sent",
                    description: "Successfully sent announcement(s).",
                    color: 0x00ff00,
                    timestamp: new Date(),
                  },
                ],
                components: [],
              })
            } catch (editError) {
              console.log("Could not edit original message:", editError.message)
            }
          }
          break
        }

        case "cancel": {
          pendingAnnouncements.delete(announcementId)
          await interaction.update({
            embeds: [
              {
                title: "❌ Cancelled",
                description: "Announcement cancelled.",
                color: 0xff0000,
                timestamp: new Date(),
              },
            ],
            components: [],
          })
          break
        }
      }
    } catch (error) {
      console.error("Button interaction error:", error)
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: `❌ Error: ${error.message}`,
            ephemeral: true,
          })
        } else {
          await interaction.editReply(`❌ Error: ${error.message}`)
        }
      } catch (replyError) {
        console.error("Failed to send error message:", replyError)
      }
    }
  },

  // Handle modal submissions
  async handleModalSubmit(interaction) {
    try {
      const [type, , , announcementId] = interaction.customId.split("_")

      const announcement = pendingAnnouncements.get(announcementId)
      if (!announcement) {
        await interaction.reply({
          content: "❌ Announcement expired.",
          ephemeral: true,
        })
        return
      }

      if (type === "discord") {
        const embedData = JSON.parse(interaction.fields.getTextInputValue("discord_content"))
        announcement.discordEmbed = new EmbedBuilder(embedData)
      } else if (type === "email") {
        announcement.emailSubject = interaction.fields.getTextInputValue("email_subject")
        announcement.emailContent = interaction.fields.getTextInputValue("email_content")
      }

      pendingAnnouncements.set(announcementId, announcement)

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`edit_discord_${announcementId}`)
          .setLabel("Edit Discord")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("💬"),
        new ButtonBuilder()
          .setCustomId(`edit_email_${announcementId}`)
          .setLabel("Edit Email")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("📧"),
        new ButtonBuilder()
          .setCustomId(`test_preview_${announcementId}`)
          .setLabel("Test Preview")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("👀"),
      )

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`send_discord_${announcementId}`)
          .setLabel("Send Discord Only")
          .setStyle(ButtonStyle.Success)
          .setEmoji("💬"),
        new ButtonBuilder()
          .setCustomId(`send_email_${announcementId}`)
          .setLabel("Send Email Only")
          .setStyle(ButtonStyle.Success)
          .setEmoji("📧"),
        new ButtonBuilder()
          .setCustomId(`send_both_${announcementId}`)
          .setLabel("Send Both")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🚀"),
      )

      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`cancel_announcement_${announcementId}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌"),
      )

      await interaction.update({
        embeds: [
          {
            title: "📢 Updated Preview",
            fields: [
              {
                name: "💬 Discord Message",
                value: `**Content:** ${announcement.discordContent}\n**Embed Title:** ${announcement.discordEmbed.data.title}\n**Description:** ${announcement.discordEmbed.data.description}`,
                inline: false,
              },
              {
                name: "📧 Email Subject",
                value: `\`\`\`${announcement.emailSubject}\`\`\``,
                inline: false,
              },
              {
                name: "📧 Email Content",
                value: `\`\`\`${announcement.emailContent.substring(0, 500)}${announcement.emailContent.length > 500 ? "..." : ""}\`\`\``,
                inline: false,
              },
            ],
            color: 0x00ff00,
          },
        ],
        components: [row1, row2, row3],
      })
    } catch (error) {
      console.error("Modal submit error:", error)
      try {
        await interaction.reply({
          content: `❌ Error: ${error.message}`,
          ephemeral: true,
        })
      } catch (replyError) {
        console.error("Failed to send error message:", replyError)
      }
    }
  },
}

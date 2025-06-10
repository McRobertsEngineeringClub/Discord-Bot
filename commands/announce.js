import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js"
import Groq from "groq-sdk"
import { google } from "googleapis"
import nodemailer from "nodemailer"

// Initialize Groq only if API key exists
let groq = null
if (process.env.GROQ_API_KEY) {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  })
}

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

// Helper function to find the correct sheet name
async function findCorrectSheetName(sheets, spreadsheetId) {
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId })
    const sheetNames = spreadsheet.data.sheets.map((sheet) => sheet.properties.title)

    const targetSheet = sheetNames.find(
      (name) => name.includes("Engineering Club Sign Up") && name.includes("Responses") && name.includes("2024/2025"),
    )

    return targetSheet || sheetNames.find((name) => name.includes("2024/2025")) || sheetNames[0]
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

// Helper function to generate announcement content
async function generateAnnouncement(topic, additionalInfo = "") {
  try {
    if (!groq) {
      throw new Error("Groq API not available")
    }

    const prompt = `Generate both a Discord announcement and an email announcement for: "${topic}"

${additionalInfo ? `Additional context: ${additionalInfo}` : ""}

Format EXACTLY like this:

**Discord Announcement:**
"@everyone 🚨 **[Title]** 🚨 [Content with emojis] 🔧⚡"

---

**Email Announcement:**

Subject: 🛠️ Engineering Club: [Subject]

Dear Engineering Club Members,

[Professional email content]

Here's what you need to know:
- **When:** [Details]
- **Where:** Electronics room
- **What to bring:** [If applicable]

[Closing]

Best,
Engineering Club Execs`

    const completion = await Promise.race([
      groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "deepseek-r1-distill-llama-70b",
        temperature: 0.7,
        max_tokens: 1000,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000)),
    ])

    return completion.choices[0]?.message?.content || "Failed to generate"
  } catch (error) {
    console.error("Groq error:", error)
    // Fallback content
    return `**Discord Announcement:**
"@everyone 🚨 **${topic}** 🚨 ${additionalInfo || "Important announcement!"} 🔧⚡"

---

**Email Announcement:**

Subject: 🛠️ Engineering Club: ${topic}

Dear Engineering Club Members,

${topic}

${additionalInfo || "More details coming soon."}

Best,
Engineering Club Execs`
  }
}

// Helper function to send emails
async function sendEmails(subject, content, emails) {
  try {
    const transporter = nodemailer.createTransporter({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_FROM,
        pass: process.env.EMAIL_PASSWORD,
      },
    })

    await transporter.sendMail({
      from: `"Engineering Club" <${process.env.EMAIL_FROM}>`,
      bcc: emails.join(","),
      subject: subject,
      text: content,
      html: content.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>"),
    })

    return true
  } catch (error) {
    console.error("Email error:", error)
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
        .setDescription("Generate a new announcement")
        .addStringOption((option) => option.setName("topic").setDescription("The main topic/event").setRequired(true))
        .addStringOption((option) =>
          option.setName("details").setDescription("Additional details (optional)").setRequired(false),
        ),
    )
    .addSubcommand((subcommand) => subcommand.setName("test-emails").setDescription("Test email connection"))
    .addSubcommand((subcommand) => subcommand.setName("list-sheets").setDescription("List available sheets"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  async execute(interaction) {
    console.log(`Announce command: ${interaction.options.getSubcommand()} by ${interaction.user.tag}`)

    // Respond immediately
    try {
      await interaction.reply({
        content: "⏳ Processing...",
        ephemeral: true,
      })
    } catch (error) {
      console.error("Failed to reply:", error)
      return
    }

    // Check permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.editReply("❌ No permission to create announcements.")
    }

    const subcommand = interaction.options.getSubcommand()

    try {
      if (subcommand === "create") {
        const topic = interaction.options.getString("topic")
        const details = interaction.options.getString("details") || ""

        await interaction.editReply("🤖 Generating announcement...")

        const generatedContent = await generateAnnouncement(topic, details)

        // Parse content
        const discordMatch = generatedContent.match(/\*\*Discord Announcement:\*\*\s*\n"([^"]+)"/)
        const emailMatch = generatedContent.match(
          /\*\*Email Announcement:\*\*\s*\n\nSubject: ([^\n]+)\n\n([\s\S]+?)(?=\n\nBest,|$)/,
        )

        let discordContent, emailSubject, emailContent

        if (!discordMatch || !emailMatch) {
          // Fallback
          discordContent = `@everyone 🚨 **${topic}** 🚨\n\n${details || "More details coming soon!"} 🔧⚡`
          emailSubject = `🛠️ Engineering Club: ${topic}`
          emailContent = `Dear Engineering Club Members,\n\n${topic}\n\n${details || "More details coming soon."}\n\nBest,\nEngineering Club Execs`
        } else {
          discordContent = discordMatch[1]
          emailSubject = emailMatch[1]
          emailContent = emailMatch[2] + "\n\nBest,\nEngineering Club Execs"
        }

        // Store announcement
        const announcementId = Date.now().toString()
        pendingAnnouncements.set(announcementId, {
          discordContent,
          emailSubject,
          emailContent,
          createdBy: interaction.user.id,
          createdAt: new Date(),
        })

        // Create buttons
        const row = new ActionRowBuilder().addComponents(
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
            .setCustomId(`send_announcement_${announcementId}`)
            .setLabel("Send Both")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🚀"),
          new ButtonBuilder()
            .setCustomId(`cancel_announcement_${announcementId}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("❌"),
        )

        await interaction.editReply({
          content: null,
          embeds: [
            {
              title: "📢 Announcement Preview",
              fields: [
                {
                  name: "💬 Discord",
                  value: `\`\`\`${discordContent.substring(0, 1000)}\`\`\``,
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
              ],
              color: 0x00ff00,
            },
          ],
          components: [row],
        })
      } else if (subcommand === "test-emails") {
        await interaction.editReply("📊 Testing email connection...")

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
      } else if (subcommand === "list-sheets") {
        await interaction.editReply("📋 Fetching sheets...")

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

        await interaction.editReply({
          content: null,
          embeds: [
            {
              title: "📋 Available Sheets",
              description: sheetNames.map((name, index) => `${index + 1}. ${name}`).join("\n"),
              fields: [
                { name: "Total Sheets", value: sheetNames.length.toString(), inline: true },
                { name: "Expected Pattern", value: getCurrentSheetName(), inline: false },
              ],
              color: 0x0099ff,
            },
          ],
        })
      }
    } catch (error) {
      console.error("Command error:", error)
      await interaction.editReply(`❌ Error: ${error.message}`)
    }
  },

  // Handle button interactions
  async handleButtonInteraction(interaction) {
    const [action, type, announcementId] = interaction.customId.split("_")

    if (action !== "edit" && action !== "send" && action !== "cancel") return

    const announcement = pendingAnnouncements.get(announcementId)
    if (!announcement) {
      return interaction.reply({
        content: "This announcement has expired.",
        ephemeral: true,
      })
    }

    if (
      announcement.createdBy !== interaction.user.id &&
      !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)
    ) {
      return interaction.reply({
        content: "You can only edit your own announcements.",
        ephemeral: true,
      })
    }

    try {
      switch (action) {
        case "edit": {
          if (type === "discord") {
            const modal = new ModalBuilder()
              .setCustomId(`discord_edit_modal_${announcementId}`)
              .setTitle("Edit Discord Announcement")

            const textInput = new TextInputBuilder()
              .setCustomId("discord_content")
              .setLabel("Discord Content")
              .setStyle(TextInputStyle.Paragraph)
              .setValue(announcement.discordContent)
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
            content: "🚀 Sending announcements...",
            ephemeral: true,
          })

          try {
            // Get emails
            const result = await getClubEmails()
            const emails = result.emails
            if (emails.length === 0) {
              throw new Error("No emails found")
            }

            // Send Discord announcement
            const announcementChannel = interaction.guild.channels.cache.get(process.env.ANNOUNCEMENT_CHANNEL_ID)
            if (!announcementChannel) {
              throw new Error("Announcement channel not found")
            }

            await announcementChannel.send(announcement.discordContent)
            await sendEmails(announcement.emailSubject, announcement.emailContent, emails)

            pendingAnnouncements.delete(announcementId)

            await interaction.editReply(
              `✅ Sent!\n📱 Discord: ${announcementChannel.name}\n📧 Email: ${emails.length} members`,
            )

            try {
              await interaction.message.edit({
                embeds: [
                  {
                    title: "✅ Announcement Sent",
                    description: "Successfully sent to Discord and email.",
                    color: 0x00ff00,
                    timestamp: new Date(),
                  },
                ],
                components: [],
              })
            } catch (editError) {
              console.log("Could not edit original message")
            }
          } catch (error) {
            await interaction.editReply(`❌ Error: ${error.message}`)
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
      console.error("Button error:", error)
    }
  },

  // Handle modal submissions
  async handleModalSubmit(interaction) {
    const [type, , , announcementId] = interaction.customId.split("_")

    const announcement = pendingAnnouncements.get(announcementId)
    if (!announcement) {
      return interaction.reply({
        content: "Announcement expired.",
        ephemeral: true,
      })
    }

    try {
      if (type === "discord") {
        announcement.discordContent = interaction.fields.getTextInputValue("discord_content")
      } else if (type === "email") {
        announcement.emailSubject = interaction.fields.getTextInputValue("email_subject")
        announcement.emailContent = interaction.fields.getTextInputValue("email_content")
      }

      pendingAnnouncements.set(announcementId, announcement)

      const row = new ActionRowBuilder().addComponents(
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
          .setCustomId(`send_announcement_${announcementId}`)
          .setLabel("Send Both")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🚀"),
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
                name: "💬 Discord",
                value: `\`\`\`${announcement.discordContent}\`\`\``,
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
        components: [row],
      })
    } catch (error) {
      console.error("Modal error:", error)
      await interaction.reply({
        content: `❌ Error: ${error.message}`,
        ephemeral: true,
      })
    }
  },
}

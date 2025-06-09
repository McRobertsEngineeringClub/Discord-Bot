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

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

// Store pending announcements
const pendingAnnouncements = new Map()

// Helper function to get current academic year sheet name
function getCurrentSheetName() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() // 0-based (0 = January)

  // If it's before September (month 8), we're still in the previous academic year
  const academicStartYear = currentMonth >= 8 ? currentYear : currentYear - 1
  const academicEndYear = academicStartYear + 1

  return `${academicStartYear}/${academicEndYear} Engineering Club Sign Up Sheet  (Responses)`
}

// Helper function to find the correct sheet name by searching all sheets
async function findCorrectSheetName(sheets, spreadsheetId) {
  try {
    // Get all sheet names from the spreadsheet
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: spreadsheetId,
    })

    const sheetNames = spreadsheet.data.sheets.map((sheet) => sheet.properties.title)
    console.log("Available sheets:", sheetNames)

    // Look for a sheet that contains "Engineering Club Sign Up" and "Responses"
    const targetSheet = sheetNames.find(
      (name) => name.includes("Engineering Club Sign Up") && name.includes("Responses") && name.includes("2024/2025"),
    )

    if (targetSheet) {
      console.log("Found matching sheet:", targetSheet)
      return targetSheet
    }

    // If no exact match, try the current year pattern
    const currentYearPattern = getCurrentSheetName()
    const fallbackSheet = sheetNames.find((name) => name.includes("2024/2025"))

    return fallbackSheet || sheetNames[0] // Return first sheet as last resort
  } catch (error) {
    console.error("Error finding sheet name:", error)
    return getCurrentSheetName() // Fallback to generated name
  }
}

// Helper function to get emails from Google Sheets
async function getClubEmails() {
  try {
    // Check if required environment variables exist
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

    // Find the correct sheet name dynamically
    const sheetName = await findCorrectSheetName(sheets, process.env.GOOGLE_SHEETS_ID)
    console.log("Using sheet name:", sheetName)

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: `'${sheetName}'!B:B`, // Column B contains emails - wrapped in quotes for special characters
    })

    const emails = response.data.values
      ?.flat()
      .filter((email) => email && email.includes("@"))
      .filter((email, index, arr) => arr.indexOf(email) === index) // Remove duplicates

    return { emails: emails || [], sheetName }
  } catch (error) {
    console.error("Error fetching emails from Google Sheets:", error)
    throw error
  }
}

// Helper function to generate announcement content using Groq
async function generateAnnouncement(topic, additionalInfo = "") {
  try {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("Missing Groq API key")
    }

    console.log("Generating announcement with Groq...")

    const prompt = `You are writing announcements for an engineering club. Generate both a Discord announcement and an email announcement for the following topic: "${topic}"

${additionalInfo ? `Additional context: ${additionalInfo}` : ""}

Format your response EXACTLY like this:

**Discord Announcement:**
"@everyone 🚨 **[Your announcement title]** 🚨 [Your announcement content with emojis] 🔧⚡"

---

**Email Announcement:**

Subject: 🛠️ Engineering Club: [Your subject line]

Dear Engineering Club Members,

[Your email content - make it professional but engaging, include relevant details about timing, location (Electronics room), what to bring, etc.]

Here's what you need to know:
- **When:** [Include timing details]
- **Where:** Electronics room
- **What to bring:** [If applicable]

[Closing paragraph encouraging participation]

Best,
Engineering Club Execs

Keep the Discord announcement concise and exciting. Make the email more detailed and professional. Use engineering/tech emojis appropriately.`

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "deepseek-r1-distill-llama-70b",
      temperature: 0.7,
      max_tokens: 1000,
    })

    const result = completion.choices[0]?.message?.content
    console.log("Groq API response received")

    if (!result) {
      throw new Error("No content received from Groq API")
    }

    return result
  } catch (error) {
    console.error("Error generating announcement with Groq:", error)

    // Return a fallback response instead of throwing
    return `**Discord Announcement:**
"@everyone 🚨 **${topic}** 🚨 ${additionalInfo || "Important announcement from Engineering Club!"} 🔧⚡"

---

**Email Announcement:**

Subject: 🛠️ Engineering Club: ${topic}

Dear Engineering Club Members,

We have an important announcement regarding: ${topic}

${additionalInfo || "More details will be provided soon."}

Here's what you need to know:
- **When:** TBD
- **Where:** Electronics room
- **What to bring:** TBD

Stay tuned for more information!

Best,
Engineering Club Execs`
  }
}

// Helper function to send emails
async function sendEmails(subject, content, emails) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_FROM,
        pass: process.env.EMAIL_PASSWORD, // App-specific password
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
    console.error("Error sending emails:", error)
    throw error
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Create AI-generated announcements for Discord and email")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Generate a new announcement")
        .addStringOption((option) =>
          option.setName("topic").setDescription("The main topic/event for the announcement").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("details").setDescription("Additional details or context (optional)").setRequired(false),
        ),
    )
    .addSubcommand((subcommand) => subcommand.setName("test-emails").setDescription("Test email list connection"))
    .addSubcommand((subcommand) => subcommand.setName("list-sheets").setDescription("List all available sheets"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  async execute(interaction) {
    console.log(`Announce command executed by ${interaction.user.tag}`)

    // Track if we've already responded to avoid the 10062 error
    let hasResponded = false

    // Function to safely respond to the interaction
    const safeReply = async (options) => {
      if (hasResponded) {
        try {
          return await interaction.editReply(options)
        } catch (error) {
          console.error("Error editing reply:", error)
        }
      } else {
        try {
          await interaction.deferReply({ ephemeral: true })
          hasResponded = true
          return await interaction.editReply(options)
        } catch (error) {
          console.error("Error in initial reply:", error)
        }
      }
    }

    // Check permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      console.log("User lacks permissions")
      return safeReply({
        content: "❌ You do not have permission to create announcements.",
      })
    }

    const subcommand = interaction.options.getSubcommand()
    console.log(`Subcommand: ${subcommand}`)

    if (subcommand === "create") {
      const topic = interaction.options.getString("topic")
      const details = interaction.options.getString("details") || ""
      console.log(`Topic: ${topic}, Details: ${details}`)

      try {
        await safeReply({
          content: "🤖 Generating announcement with AI...",
        })

        // Check if Groq API key exists
        if (!process.env.GROQ_API_KEY) {
          throw new Error("Groq API key not configured")
        }

        console.log("Calling Groq API...")
        // Generate announcement content
        const generatedContent = await generateAnnouncement(topic, details)
        console.log("Generated content received:", generatedContent.substring(0, 100) + "...")

        // Parse the generated content with better error handling
        const discordMatch = generatedContent.match(/\*\*Discord Announcement:\*\*\s*\n"([^"]+)"/)
        const emailMatch = generatedContent.match(
          /\*\*Email Announcement:\*\*\s*\n\nSubject: ([^\n]+)\n\n([\s\S]+?)(?=\n\nBest,|$)/,
        )

        let discordContent, emailSubject, emailContent

        if (!discordMatch || !emailMatch) {
          console.log("Failed to parse AI content, using fallback")
          // Fallback content if parsing fails
          discordContent = `@everyone 🚨 **${topic}** 🚨\n\n${details || "More details coming soon!"} 🔧⚡`
          emailSubject = `🛠️ Engineering Club: ${topic}`
          emailContent = `Dear Engineering Club Members,\n\nWe have an important announcement about: ${topic}\n\n${details || "More details will be provided soon."}\n\nHere's what you need to know:\n- **When:** TBD\n- **Where:** Electronics room\n- **What to bring:** TBD\n\nStay tuned for more information!\n\nBest,\nEngineering Club Execs`
        } else {
          discordContent = discordMatch[1]
          emailSubject = emailMatch[1]
          emailContent = emailMatch[2] + "\n\nBest,\nEngineering Club Execs"
        }

        console.log("Parsed content successfully")

        // Store the announcement for editing
        const announcementId = Date.now().toString()
        pendingAnnouncements.set(announcementId, {
          discordContent,
          emailSubject,
          emailContent,
          createdBy: interaction.user.id,
          createdAt: new Date(),
        })

        console.log(`Stored announcement with ID: ${announcementId}`)

        // Create action buttons
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

        await safeReply({
          content: null,
          embeds: [
            {
              title: "📢 Generated Announcement Preview",
              fields: [
                {
                  name: "💬 Discord Announcement",
                  value: `\`\`\`${discordContent.substring(0, 1000)}\`\`\``,
                  inline: false,
                },
                {
                  name: "📧 Email Subject",
                  value: `\`\`\`${emailSubject}\`\`\``,
                  inline: false,
                },
                {
                  name: "📧 Email Content (Preview)",
                  value: `\`\`\`${emailContent.substring(0, 500)}${emailContent.length > 500 ? "..." : ""}\`\`\``,
                  inline: false,
                },
              ],
              color: 0x00ff00,
              footer: { text: "Use the buttons below to edit or send the announcements" },
            },
          ],
          components: [row],
        })

        console.log("Successfully sent announcement preview")
      } catch (error) {
        console.error("Error in create subcommand:", error)
        await safeReply({
          content: `❌ Error generating announcement: ${error.message}\n\nPlease check:\n- Groq API key is configured\n- Bot has proper permissions\n- Try again in a few moments`,
        })
      }
    } else if (subcommand === "test-emails") {
      try {
        await safeReply({
          content: "📊 Testing Google Sheets connection...",
        })

        console.log("Testing email connection...")
        const result = await getClubEmails()
        const emails = result.emails
        const actualSheetName = result.sheetName

        console.log(`Found ${emails.length} emails from sheet: ${actualSheetName}`)

        await safeReply({
          content: null,
          embeds: [
            {
              title: "📊 Email List Test Results",
              fields: [
                { name: "Actual Sheet Name", value: actualSheetName, inline: false },
                { name: "Emails Found", value: emails.length.toString(), inline: true },
                {
                  name: "Sample Emails",
                  value: emails.length > 0 ? emails.slice(0, 5).join("\n") : "No emails found",
                  inline: false,
                },
                {
                  name: "Environment Check",
                  value: `Sheets ID: ${process.env.GOOGLE_SHEETS_ID ? "✅" : "❌"}\nClient Email: ${process.env.GOOGLE_CLIENT_EMAIL ? "✅" : "❌"}\nPrivate Key: ${process.env.GOOGLE_PRIVATE_KEY ? "✅" : "❌"}`,
                  inline: false,
                },
              ],
              color: emails.length > 0 ? 0x00ff00 : 0xff0000,
              footer: {
                text:
                  emails.length > 0
                    ? "✅ Email connection successful!"
                    : "❌ Check Google Sheets API and environment variables",
              },
            },
          ],
        })
      } catch (error) {
        console.error("Error in test-emails subcommand:", error)
        await safeReply({
          content: null,
          embeds: [
            {
              title: "❌ Email Test Failed",
              description: `Error: ${error.message}`,
              fields: [
                {
                  name: "Common Issues",
                  value:
                    "• Google Sheets API not enabled\n• Invalid service account credentials\n• Wrong sheet name or ID\n• Missing environment variables",
                  inline: false,
                },
                {
                  name: "Expected Sheet Name",
                  value: getCurrentSheetName(),
                  inline: false,
                },
              ],
              color: 0xff0000,
            },
          ],
        })
      }
    } else if (subcommand === "list-sheets") {
      try {
        await safeReply({
          content: "📋 Fetching all available sheets...",
        })

        console.log("Listing sheets...")

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
        console.log("Found sheets:", sheetNames)

        await safeReply({
          content: null,
          embeds: [
            {
              title: "📋 Available Sheets",
              description: sheetNames.map((name, index) => `${index + 1}. ${name}`).join("\n"),
              fields: [
                {
                  name: "Total Sheets",
                  value: sheetNames.length.toString(),
                  inline: true,
                },
                {
                  name: "Expected Pattern",
                  value: getCurrentSheetName(),
                  inline: false,
                },
              ],
              color: 0x0099ff,
            },
          ],
        })
      } catch (error) {
        console.error("Error listing sheets:", error)
        await safeReply({
          content: `❌ Error listing sheets: ${error.message}`,
        })
      }
    }
  },

  // Handle button interactions
  async handleButtonInteraction(interaction) {
    const [action, type, announcementId] = interaction.customId.split("_")

    if (action !== "edit" && action !== "send" && action !== "cancel") return

    const announcement = pendingAnnouncements.get(announcementId)
    if (!announcement) {
      return interaction.reply({
        content: "This announcement has expired or been removed.",
        ephemeral: true,
      })
    }

    // Check if user is the creator or has manage messages permission
    if (
      announcement.createdBy !== interaction.user.id &&
      !interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)
    ) {
      return interaction.reply({
        content: "You can only edit announcements you created.",
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
              .setLabel("Discord Announcement Content")
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
            // Get club emails
            const result = await getClubEmails()
            const emails = result.emails
            if (emails.length === 0) {
              throw new Error("No club member emails found")
            }

            // Send Discord announcement
            const announcementChannel = interaction.guild.channels.cache.get(process.env.ANNOUNCEMENT_CHANNEL_ID)
            if (!announcementChannel) {
              throw new Error("Announcement channel not found")
            }

            await announcementChannel.send(announcement.discordContent)

            // Send emails
            await sendEmails(announcement.emailSubject, announcement.emailContent, emails)

            // Clean up
            pendingAnnouncements.delete(announcementId)

            await interaction.editReply({
              content: `✅ Announcements sent successfully!\n📱 Discord: Posted to ${announcementChannel.name}\n📧 Email: Sent to ${emails.length} members`,
            })

            // Update the original message to show it was sent
            try {
              await interaction.message.edit({
                embeds: [
                  {
                    title: "✅ Announcement Sent",
                    description: "This announcement has been successfully sent to Discord and email.",
                    color: 0x00ff00,
                    timestamp: new Date(),
                  },
                ],
                components: [],
              })
            } catch (editError) {
              console.log("Could not edit original message:", editError.message)
            }
          } catch (error) {
            await interaction.editReply({
              content: `❌ Error sending announcements: ${error.message}`,
            })
          }
          break
        }

        case "cancel": {
          pendingAnnouncements.delete(announcementId)

          await interaction.update({
            embeds: [
              {
                title: "❌ Announcement Cancelled",
                description: "The announcement has been cancelled and will not be sent.",
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
        await interaction.reply({
          content: `Error: ${error.message}`,
          ephemeral: true,
        })
      } catch (replyError) {
        console.error("Failed to send error message:", replyError)
      }
    }
  },

  // Handle modal submissions
  async handleModalSubmit(interaction) {
    const [type, , , announcementId] = interaction.customId.split("_")

    const announcement = pendingAnnouncements.get(announcementId)
    if (!announcement) {
      return interaction.reply({
        content: "This announcement has expired or been removed.",
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

      // Update the stored announcement
      pendingAnnouncements.set(announcementId, announcement)

      // Create updated action buttons
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

      // Update the original message with new content
      await interaction.update({
        embeds: [
          {
            title: "📢 Updated Announcement Preview",
            fields: [
              {
                name: "💬 Discord Announcement",
                value: `\`\`\`${announcement.discordContent}\`\`\``,
                inline: false,
              },
              {
                name: "📧 Email Subject",
                value: `\`\`\`${announcement.emailSubject}\`\`\``,
                inline: false,
              },
              {
                name: "📧 Email Content (Preview)",
                value: `\`\`\`${announcement.emailContent.substring(0, 500)}${announcement.emailContent.length > 500 ? "..." : ""}\`\`\``,
                inline: false,
              },
            ],
            color: 0x00ff00,
            footer: { text: "Updated! Use the buttons below to edit further or send the announcements" },
          },
        ],
        components: [row],
      })
    } catch (error) {
      console.error("Modal submit error:", error)
      await interaction.reply({
        content: `❌ Error updating announcement: ${error.message}`,
        ephemeral: true,
      })
    }
  },
}

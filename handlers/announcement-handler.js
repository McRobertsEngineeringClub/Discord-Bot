import {
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js"
import axios from "axios"

export async function handleAnnouncementInteraction(interaction) {
  const customId = interaction.customId

  if (customId === "announce_help") {
    await showHelpMenu(interaction)
    return
  }

  if (customId === "announce_cancel") {
    const cancelEmbed = new EmbedBuilder()
      .setTitle("❌ Announcement Cancelled")
      .setDescription("No worries! Use `/announce` again when you're ready.")
      .setColor("#ED4245")

    await interaction.update({ embeds: [cancelEmbed], components: [] })
    return
  }

  if (customId.startsWith("announce_")) {
    await showAnnouncementModal(interaction, customId)
  }

  if (customId.startsWith("modal_announce_")) {
    await processAnnouncementModal(interaction)
  }

  if (customId.startsWith("edit_announcement")) {
    await handleAnnouncementEdit(interaction)
  }

  if (customId.startsWith("send_announcement")) {
    await sendAnnouncement(interaction)
  }
}

async function showAnnouncementModal(interaction, type) {
  const isAI = type.includes("ai")
  const platform = type.includes("both") ? "both" : type.includes("discord") ? "discord" : "email"

  const modal = new ModalBuilder()
    .setCustomId(`modal_announce_${type}`)
    .setTitle(`📢 ${isAI ? "AI-Assisted" : "Manual"} Announcement`)

  const titleInput = new TextInputBuilder()
    .setCustomId("announcement_title")
    .setLabel("📋 Announcement Title")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., "Weekly Meeting Reminder" or "New Project Launch"')
    .setRequired(true)
    .setMaxLength(100)

  const contentInput = new TextInputBuilder()
    .setCustomId("announcement_content")
    .setLabel(isAI ? "💭 Brief Description (AI will expand)" : "📝 Full Announcement Content")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(
      isAI
        ? 'Brief description: "Meeting this Friday at 3PM in room 205 to discuss new robotics project"'
        : "Write your complete announcement here...",
    )
    .setRequired(true)
    .setMaxLength(isAI ? 500 : 2000)

  const audienceInput = new TextInputBuilder()
    .setCustomId("announcement_audience")
    .setLabel("👥 Target Audience")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., "All members", "Executives only", "Freshmen"')
    .setRequired(false)
    .setMaxLength(100)

  const priorityInput = new TextInputBuilder()
    .setCustomId("announcement_priority")
    .setLabel("⚡ Priority Level")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("High, Medium, Low, or Urgent")
    .setRequired(false)
    .setMaxLength(20)

  const attachmentInput = new TextInputBuilder()
    .setCustomId("announcement_attachments")
    .setLabel("📎 Attachment URLs (optional)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Paste image URLs or file links, one per line")
    .setRequired(false)
    .setMaxLength(500)

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(contentInput),
    new ActionRowBuilder().addComponents(audienceInput),
    new ActionRowBuilder().addComponents(priorityInput),
    new ActionRowBuilder().addComponents(attachmentInput),
  )

  await interaction.showModal(modal)
}

async function processAnnouncementModal(interaction) {
  const type = interaction.customId.replace("modal_announce_", "")
  const isAI = type.includes("ai")

  const title = interaction.fields.getTextInputValue("announcement_title")
  const content = interaction.fields.getTextInputValue("announcement_content")
  const audience = interaction.fields.getTextInputValue("announcement_audience") || "All members"
  const priority = interaction.fields.getTextInputValue("announcement_priority") || "Medium"
  const attachments = interaction.fields.getTextInputValue("announcement_attachments") || ""

  await interaction.deferReply({ ephemeral: true })

  let finalContent = content
  let aiSuggestions = ""

  if (isAI) {
    try {
      const aiResponse = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "mixtral-8x7b-32768",
          messages: [
            {
              role: "system",
              content: `You are an AI assistant for an engineering club. Create professional, engaging announcements that:
                        - Are clear and actionable
                        - Include relevant details and context
                        - Use appropriate tone for engineering students
                        - Add helpful suggestions or reminders
                        - Format nicely with emojis where appropriate
                        - Keep it concise but informative`,
            },
            {
              role: "user",
              content: `Create an announcement with:
                        Title: ${title}
                        Brief description: ${content}
                        Audience: ${audience}
                        Priority: ${priority}
                        
                        Please expand this into a full announcement and also provide 3 additional suggestions for improving engagement.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
        },
      )

      const aiContent = aiResponse.data.choices[0].message.content
      const parts = aiContent.split("SUGGESTIONS:")
      finalContent = parts[0].trim()
      aiSuggestions = parts[1] ? parts[1].trim() : ""
    } catch (error) {
      console.error("Groq AI Error:", error)
      finalContent = content // Fallback to original content
    }
  }

  await showAnnouncementPreview(interaction, {
    title,
    content: finalContent,
    audience,
    priority,
    attachments,
    aiSuggestions,
    type,
  })
}

async function showAnnouncementPreview(interaction, announcementData) {
  const { title, content, audience, priority, attachments, aiSuggestions, type } = announcementData

  const priorityColors = {
    Urgent: "#ED4245",
    High: "#F57C00",
    Medium: "#5865F2",
    Low: "#57F287",
  }

  const previewEmbed = new EmbedBuilder()
    .setTitle(`📢 ${title}`)
    .setDescription(content)
    .setColor(priorityColors[priority] || "#5865F2")
    .setThumbnail("https://placeholder.svg?height=80&width=80&query=engineering+club+logo")
    .addFields(
      { name: "👥 Audience", value: audience, inline: true },
      { name: "⚡ Priority", value: priority, inline: true },
      { name: "📅 Date", value: new Date().toLocaleDateString(), inline: true },
    )
    .setFooter({
      text: "Engineering Club Announcement",
      iconURL: "https://placeholder.svg?height=20&width=20&query=gear+icon",
    })
    .setTimestamp()

  if (attachments) {
    previewEmbed.addFields({
      name: "📎 Attachments",
      value: attachments.split("\n").slice(0, 3).join("\n"),
      inline: false,
    })
  }

  const components = []

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`send_announcement_${type}`)
      .setLabel("✅ Send Announcement")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`edit_announcement_${type}`)
      .setLabel("✏️ Edit Content")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("announce_cancel").setLabel("❌ Cancel").setStyle(ButtonStyle.Danger),
  )

  components.push(actionRow)

  const embedsToSend = [previewEmbed]
  if (aiSuggestions) {
    const suggestionsEmbed = new EmbedBuilder()
      .setTitle("🤖 AI Suggestions for Better Engagement")
      .setDescription(aiSuggestions)
      .setColor("#00D166")
      .setFooter({ text: "Powered by Groq AI" })

    embedsToSend.push(suggestionsEmbed)
  }

  // Store announcement data for later use
  interaction.client.announcementData = interaction.client.announcementData || new Map()
  interaction.client.announcementData.set(interaction.user.id, announcementData)

  await interaction.editReply({
    content: "**📋 Announcement Preview**\nReview your announcement below:",
    embeds: embedsToSend,
    components,
  })
}

async function sendAnnouncement(interaction) {
  const type = interaction.customId.replace("send_announcement_", "")
  const announcementData = interaction.client.announcementData?.get(interaction.user.id)

  if (!announcementData) {
    await interaction.reply({ content: "❌ Announcement data not found. Please start over.", ephemeral: true })
    return
  }

  await interaction.deferUpdate()

  try {
    const webhookData = {
      ...announcementData,
      type,
      userId: interaction.user.id,
      userName: interaction.user.displayName,
      guildId: interaction.guild.id,
      channelId: process.env.ANNOUNCEMENT_CHANNEL_ID,
    }

    await axios.post(`${process.env.N8N_WEBHOOK_URL}/webhook/announce`, webhookData)

    const successEmbed = new EmbedBuilder()
      .setTitle("✅ Announcement Sent Successfully!")
      .setDescription(`Your announcement "${announcementData.title}" has been processed and sent.`)
      .setColor("#57F287")
      .addFields(
        { name: "📊 Status", value: "Processing in background", inline: true },
        {
          name: "🎯 Platform",
          value: type.includes("both") ? "Discord + Email" : type.includes("discord") ? "Discord Only" : "Email Only",
          inline: true,
        },
      )
      .setTimestamp()

    await interaction.editReply({
      content: null,
      embeds: [successEmbed],
      components: [],
    })

    // Clean up stored data
    interaction.client.announcementData.delete(interaction.user.id)
  } catch (error) {
    console.error("Webhook Error:", error)

    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Announcement Failed")
      .setDescription("There was an error sending your announcement. Please try again.")
      .setColor("#ED4245")

    await interaction.editReply({
      embeds: [errorEmbed],
      components: [],
    })
  }
}

async function showHelpMenu(interaction) {
  const helpEmbed = new EmbedBuilder()
    .setTitle("❓ Announcement System Help")
    .setDescription("**How to use the Engineering Club Announcement System**")
    .setColor("#5865F2")
    .addFields(
      {
        name: "🤖 AI Assistant Mode",
        value: "Provide a brief description and let AI create a professional announcement",
        inline: false,
      },
      { name: "✍️ Manual Mode", value: "Write your own complete announcement with full control", inline: false },
      {
        name: "📧 Email + Discord",
        value: "Sends to both Discord channel and member emails via Google Sheets",
        inline: false,
      },
      { name: "💬 Discord Only", value: "Posts only to the Discord announcement channel", inline: false },
      { name: "📮 Email Only", value: "Sends only to member emails (no Discord post)", inline: false },
      {
        name: "📎 Attachments",
        value: "Add image URLs or file links to include with your announcement",
        inline: false,
      },
      {
        name: "⚡ Priority Levels",
        value: "**Urgent** (Red) • **High** (Orange) • **Medium** (Blue) • **Low** (Green)",
        inline: false,
      },
    )
    .setFooter({ text: "Need more help? Contact the tech team!" })

  const backButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("announce_back_to_main")
      .setLabel("← Back to Main Menu")
      .setStyle(ButtonStyle.Secondary),
  )

  await interaction.update({
    embeds: [helpEmbed],
    components: [backButton],
  })
}

async function handleAnnouncementEdit(interaction) {
  // This would open a new modal with the current content pre-filled
  // Implementation similar to showAnnouncementModal but with existing data
  await interaction.reply({ content: "✏️ Edit functionality coming soon!", ephemeral: true })
}

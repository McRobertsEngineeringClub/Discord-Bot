import axios from "axios"
import { EmbedBuilder } from "discord.js"

export async function handleAnnouncementButtons(interaction) {
  const [action, type, announcementId] = interaction.customId.split("_")

  if (action !== "send") return false

  await interaction.deferReply({ ephemeral: true })

  try {
    const webhookData = {
      announcementId,
      sendType: type, // 'discord', 'email', or 'both'
      userId: interaction.user.id,
      userName: interaction.user.username,
    }

    const response = await axios.post(`${process.env.N8N_WEBHOOK_URL}/send-announcement`, webhookData)

    if (response.data.success) {
      const embed = new EmbedBuilder()
        .setTitle("✅ Announcement Sent!")
        .setDescription(`Successfully sent announcement via ${type === "both" ? "Discord and Email" : type}`)
        .addFields(
          { name: "Recipients", value: response.data.recipients || "Unknown", inline: true },
          { name: "Sent At", value: new Date().toLocaleString(), inline: true },
        )
        .setColor("#00ff00")

      await interaction.editReply({ embeds: [embed] })
    } else {
      throw new Error(response.data.error || "Unknown error")
    }
  } catch (error) {
    console.error("Error sending announcement:", error)

    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Error")
      .setDescription("Failed to send announcement. Please try again.")
      .setColor("#ff0000")

    await interaction.editReply({ embeds: [errorEmbed] })
  }

  return true
}

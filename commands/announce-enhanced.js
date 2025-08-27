const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js")
const axios = require("axios")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("📢 Create professional announcements with AI assistance"),

  async execute(interaction) {
    const mainEmbed = new EmbedBuilder()
      .setTitle("📢 Announcement Center")
      .setDescription(
        "**Welcome to the Engineering Club Announcement System**\n\nChoose how you'd like to create your announcement:",
      )
      .setColor("#2B2D31") // Discord dark theme color
      .setThumbnail("https://drive.google.com/uc?export=view&id=1FMf439DX_I-Up9Nww7x-ajlyuppcE_rZ") // Replace with your club logo
      .addFields(
        { name: "🤖 AI Assistant", value: "Let AI help write your announcement", inline: true },
        { name: "✍️ Manual Creation", value: "Write your own announcement", inline: true },
        { name: "📧 Email + Discord", value: "Send to both platforms", inline: true },
        { name: "💬 Discord Only", value: "Post only to Discord", inline: false },
        { name: "📮 Email Only", value: "Send only via email", inline: false },
      )
      .setFooter({
        text: "Engineering Club • Powered by AI",
        iconURL: "https://drive.google.com/uc?export=view&id=1FMf439DX_I-Up9Nww7x-ajlyuppcE_rZ",
      })
      .setTimestamp()

    const navigationRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("announce_ai_both")
        .setLabel("🤖 AI + Both Platforms")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("announce_manual_both")
        .setLabel("✍️ Manual + Both Platforms")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("announce_discord_only")
        .setLabel("💬 Discord Only")
        .setStyle(ButtonStyle.Success),
    )

    const secondRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("announce_email_only").setLabel("📮 Email Only").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("announce_help").setLabel("❓ Help & Tips").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("announce_cancel").setLabel("❌ Cancel").setStyle(ButtonStyle.Danger),
    )

    await interaction.reply({
      embeds: [mainEmbed],
      components: [navigationRow, secondRow],
      ephemeral: true,
    })
  },
}

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js"
import { createStatusEmbed } from "../lib/embedStyles.js"

export default {
  data: new SlashCommandBuilder()
    .setName("setavatar")
    .setDescription("Set the bot's profile picture")
    .addStringOption((option) =>
      option.setName("url").setDescription("Image URL or 'default' for club GIF").setRequired(false),
    )
    .addAttachmentOption((option) => option.setName("image").setDescription("Upload an image file").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    try {
      // Check permissions
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          embeds: [
            createStatusEmbed("Access Denied", "You need Manage Server permission to change the bot avatar", "error"),
          ],
          ephemeral: true,
        })
        return
      }

      await interaction.deferReply({ ephemeral: true })

      let avatarUrl = interaction.options.getString("url")
      const attachment = interaction.options.getAttachment("image")

      // Use attachment if provided
      if (attachment) {
        if (!attachment.contentType?.startsWith("image/")) {
          await interaction.editReply({
            embeds: [createStatusEmbed("Invalid File", "Please upload an image file", "error")],
          })
          return
        }
        avatarUrl = attachment.url
      }

      // Use default club GIF if no URL provided or "default" specified
      if (!avatarUrl || avatarUrl.toLowerCase() === "default") {
        avatarUrl =
          "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExaGZnZGoydDhqcm9yZGtqanQ5YmNvdDNybzY4bGR3aDJqeWg3MnRkeiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/s3wqGbNrYjG3AqkmD5/giphy.gif"
      }

      try {
        await interaction.client.user.setAvatar(avatarUrl)

        await interaction.editReply({
          embeds: [
            createStatusEmbed("Avatar Updated", "Bot profile picture has been successfully updated!", "success", [
              {
                name: "New Avatar",
                value: `[View Image](${avatarUrl})`,
                inline: false,
              },
            ]),
          ],
        })
      } catch (error) {
        console.error("Avatar update error:", error)

        let errorMessage = "Failed to update avatar"
        if (error.code === 50035) {
          errorMessage = "Invalid image format or size. Use PNG, JPG, or GIF under 8MB"
        } else if (error.code === 50013) {
          errorMessage = "Bot doesn't have permission to change avatar"
        } else if (error.message.includes("rate limit")) {
          errorMessage = "Rate limited. You can only change the bot avatar twice per hour"
        }

        await interaction.editReply({
          embeds: [createStatusEmbed("Avatar Update Failed", errorMessage, "error")],
        })
      }
    } catch (error) {
      console.error("SetAvatar command error:", error)
      try {
        const errorEmbed = createStatusEmbed("Command Error", error.message, "error")
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true })
        } else {
          await interaction.editReply({ embeds: [errorEmbed] })
        }
      } catch (replyError) {
        console.error("Failed to send error message:", replyError)
      }
    }
  },
}

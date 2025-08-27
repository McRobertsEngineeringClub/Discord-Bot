import { SlashCommandBuilder } from "discord.js"
import { createUserInfoEmbed } from "../lib/embedStyles.js"

export default {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Get information about a user")
    .addUserOption((option) =>
      option.setName("user").setDescription("The user to get information about").setRequired(false),
    ),
  async execute(interaction) {
    const user = interaction.options.getUser("user") || interaction.user
    const member = await interaction.guild.members.fetch(user.id)

    const userEmbed = createUserInfoEmbed(user, member)

    await interaction.reply({
      embeds: [userEmbed],
    })
  },
}

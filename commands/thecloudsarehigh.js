import { SlashCommandBuilder } from "discord.js"

export default {
  data: new SlashCommandBuilder().setName("thecloudsarehigh").setDescription("AndSoAmI"),
  async execute(interaction) {
    await interaction.editReply("The discord moderators are watching you")
  },
}

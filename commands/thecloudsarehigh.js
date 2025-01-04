import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName("thecloudsarehigh")
    .setDescription("AndSoAmI"),
  async execute(interaction) {
    await interaction.reply("The discord moderators are watching you");
  }
};

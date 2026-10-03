import { SlashCommandBuilder } from 'discord.js';
import { createModernEmbed } from '../lib/embedStyles.js';

export default {
  data: new SlashCommandBuilder()
	.setName("sendembed")
	.setDescription("Send an embed")
	.addStringOption((option) => option.setName("title")),
  async execute(interaction) {
	const embed =  createModernEmbed({
		title: `Rules of the server`,
		description: `Hi everyone! Welcome to the HMS Engineering Club Discord Server. To keep our community safe and have a good time, we have some rules.`,
		fields: [
			{
				name: "Rule I: Respect Others", 
				value: "Everyone in this server is to be treated with respect. Any forms of harrasment/bullying will not be permitted and will result in a punishment. Examples are: \n- Calling others slurs\n- Derogatory language\n- Internet attacks (eg. DDOSing, doxxing)", 
				inline: false
			}, 
			{
				name: "Rule II: No Spamming", 
				value: "Spamming is defined as repeatedly sending similar or same messages to block the chat from being read. This includes (but is not limited to): \n- Zalgo\n- Excessive Caps\n- Any form of text walls\n- Ragebaiting", 
				inline: false
			}, 
			{
				name: "Rule III: Keep discussions within server regulations.", 
				value: "Unacceptable topics to discuss include:\n- Anything that makes a user uncomfortable\n- Discussing politics", 
				inline: false
			}, 
			{
				name: "Rule IV: No Discriminatory Content", 
				value: "Discriminatory content is defined as content that singles a person out because they are part of a group. This includes (but is not limited to):\n- Racism\n- Sexism", 
				inline: false
			}
		],
		footer: false,
		timestamp: true
	})

	const RULES_CHANNEL_ID = process.env.RULES_CHANNEL_ID;
	if (RULES_CHANNEL_ID) {
		const channel = await interaction.client.channels.fetch(RULES_CHANNEL_ID);
		channel.send({
			embeds: [embed]
		});
	}

	// await interaction.reply({
    //   	embeds: [embed],
    // })

	await interaction.reply("done lol");
  }
};


// const embed =  createModernEmbed({
// 	title: `is tung dong`,
// 	description: `dong is tung! only but dong banana is? tung sahur! oh the dungs tongs light the larila. the path of tung and tang.`,
// 	fields: [
// 		{
// 			name: "tung", 
// 			value: "tung is dong", 
// 			inline: false
// 		}, 
// 		{
// 			name: "sahur", 
// 			value: "sahur aint dong but dong is tung", 
// 			inline: false
// 		}, 
// 		{
// 			name: "tralalero", 
// 			value: "corre di buche tralalerito", 
// 			inline: false
// 		}, 
// 		{
// 			name: "ambalabu", 
// 			value: "el sappo qi tung dice dong", 
// 			inline: false
// 		}
// 	],
// 	footer: "un fort une ate ly tung no more dong",
// 	timestamp: false
// })
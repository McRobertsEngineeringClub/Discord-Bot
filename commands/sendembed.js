import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { createModernEmbed } from '../lib/embedStyles.js';

export default {
  data: new SlashCommandBuilder()
	.setName("sendembed")
	.setDescription("Send an embed"),
  async execute(interaction) {
	// const embed =  createModernEmbed({
	// 	title: `Rules of the server`,
	// 	description: `Hi everyone! Welcome to the HMS Engineering Club Discord Server. To keep our community safe and have a good time, we have some rules.`,
	// 	fields: [
	// 		{
	// 			name: "Rule I: Respect Others", 
	// 			value: "Everyone in this server is to be treated with respect. Any forms of harrasment/bullying will not be permitted and will result in a punishment. Examples are: \n- Calling others slurs\n- Derogatory language\n- Internet attacks (eg. DDOSing, doxxing)", 
	// 			inline: false
	// 		}, 
	// 		{
	// 			name: "Rule II: No Spamming", 
	// 			value: "Spamming is defined as repeatedly sending similar or same messages to block the chat from being read. This includes (but is not limited to): \n- Zalgo\n- Excessive Caps\n- Any form of text walls\n- Ragebaiting", 
	// 			inline: false
	// 		}, 
	// 		{
	// 			name: "Rule III: Keep discussions within server regulations.", 
	// 			value: "Unacceptable topics to discuss include:\n- Anything that makes a user uncomfortable\n- Discussing politics", 
	// 			inline: false
	// 		}, 
	// 		{
	// 			name: "Rule IV: No Discriminatory Content", 
	// 			value: "Discriminatory content is defined as content that singles a person out because they are part of a group. This includes (but is not limited to):\n- Racism\n- Sexism", 
	// 			inline: false
	// 		}
	// 	],
	// 	footer: false,
	// 	timestamp: true
	// })

	const embed =  createModernEmbed({
		title: `Applying for Executive Positions`,
		description: `When applying, you must start by DMing an executive and stating the position you would like to apply for as well as your resume. If you are not comfortable sharing your resume on Discord, you may also e-mail it to club1engineering@gmail.com Chances are, the resume will not determine anything but it will be useful as a reference. After that, an executive will contact you with potential interview times. The interview audio **will be recorded**, so that any executive who was not there will be able to hear it.\n\nPositions are listed below, as well as their responsiblities.`,
		fields: [
			{
				name: "Outreach Executive", 
				value: "- Has Instagram and Discord admin permissions, regularly posts media.\n- Takes sufficient media during club meetings to ensure enough for marketing purposes.\n- Coordinates fundraisers with Club Executives when appropriate.", 
				inline: false
			}, 
			{
				name: "Club Executive", 
				value: "- Responsible for showing up to weekly executive planning meetings.\n- Responsible for showing up to every club meeting unless unavailable, in which case contact an Assistant Executive.\n- Plans lessons and ensures proper communication.\n- Ensures that requirements are met at least a day before a club meeting.", 
				inline: false
			}, 
			{
				name: "Assistant Executive", 
				value: "- Substitues for Club Executives when needed.\n- Encouraged to show up to as many meetings as possible.\n- Helps draft lesson plans and pitches ideas for meetings.", 
				inline: false
			}
		],
		footer: false,
		timestamp: true
	})

	const CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID;
	if (CHANNEL_ID) {
		const channel = await interaction.client.channels.fetch(CHANNEL_ID);
		channel.send({
			embeds: [embed]
		});

		// channel.messages.fetch('1560466259684884480')
		// .then(async message => {
		// 	// Edit the content once the message is retrieved
		// 	const receivedEmbed = message.embeds[0]; 

		// 	if (receivedEmbed) {
		// 		// Clone the existing embed data and update just the title
		// 		const updatedEmbed = EmbedBuilder.from(receivedEmbed)
		// 			.setDescription(`Hi guys! So a lot of y'all have been asking how to become an executive, and we finally have an answer! You can find all the information in the <#1560457919047147541> channel. Keep in mind that we are still starting out so some things might change. That's about it!\n\n– Execs :D`)

		// 		// Apply the update to the message
		// 		await message.edit({ embeds: [updatedEmbed], files: []  });
		// 	}
		// })
		// .then(updatedMessage => console.log(`Updated message to: ${updatedMessage.content}`))
		// .catch(console.error);
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
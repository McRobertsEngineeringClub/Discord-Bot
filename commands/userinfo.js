import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Get information about a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to get information about')
                .setRequired(false)),
    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id);

        const roles = member.roles.cache
            .filter(role => role.id !== interaction.guild.id)
            .map(role => role.toString())
            .join(', ') || 'None';

        await interaction.reply({
            embeds: [{
                title: `User Information - ${user.tag}`,
                thumbnail: { url: user.displayAvatarURL({ dynamic: true }) },
                fields: [
                    { name: 'User ID', value: user.id, inline: true },
                    { name: 'Nickname', value: member.nickname || 'None', inline: true },
                    { name: 'Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Roles', value: roles },
                ],
                footer: { text: `Requested by ${interaction.user.tag}` },
                timestamp: new Date(),
            }]
        });
    },
};


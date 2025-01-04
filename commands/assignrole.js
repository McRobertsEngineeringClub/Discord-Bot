import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('assignrole')
        .setDescription('Assign a role to a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to assign the role to')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role to assign')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .setDMPermission(false),
    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');

        if (role.position >= interaction.member.roles.highest.position) {
            return interaction.reply({ content: 'You cannot assign a role equal to or higher than your highest role.', ephemeral: true });
        }

        try {
            const member = await interaction.guild.members.fetch(user.id);
            await member.roles.add(role);
            await interaction.reply(`Successfully assigned the role ${role.name} to ${user.tag}`);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error assigning the role. Please check my permissions and try again.', ephemeral: true });
        }
    },
};


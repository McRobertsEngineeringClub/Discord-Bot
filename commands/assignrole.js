import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js"
import { createRoleEmbed, createStatusEmbed } from "../lib/embedStyles.js"

export default {
  data: new SlashCommandBuilder()
    .setName("assignrole")
    .setDescription("Assign a role to a user")
    .addUserOption((option) =>
      option.setName("user").setDescription("The user to assign the role to").setRequired(true),
    )
    .addRoleOption((option) => option.setName("role").setDescription("The role to assign").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        embeds: [createStatusEmbed("Access Denied", "You need Manage Roles permission to use this command", "error")],
        ephemeral: true, // Changed flags to ephemeral
      })
    }

    const user = interaction.options.getUser("user")
    const role = interaction.options.getRole("role")

    if (role.position >= interaction.member.roles.highest.position) {
      return interaction.reply({
        embeds: [
          createStatusEmbed(
            "Role Hierarchy Error",
            "You cannot assign a role equal to or higher than your highest role",
            "error",
          ),
        ],
        ephemeral: true, // Changed flags to ephemeral
      })
    }

    try {
      const member = await interaction.guild.members.fetch(user.id)
      await member.roles.add(role)

      const successEmbed = createRoleEmbed("success", user.tag, role.name, `Role successfully assigned to ${user.tag}`)
      await interaction.reply({ embeds: [successEmbed] })
    } catch (error) {
      console.error(error)

      const errorEmbed = createRoleEmbed("error", user.tag, role.name, "Please check my permissions and try again")
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true }) // Changed flags to ephemeral
    }
  },
}

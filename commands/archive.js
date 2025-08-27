import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js"
import { createArchiveEmbed, createStatusEmbed, CLUB_THEME } from "../lib/embedStyles.js"

// Store scheduled tasks (in production, you'd want to use a database)
let scheduledTasks = []

// Helper function to find category by name
function findCategoryByName(guild, categoryName) {
  return guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildCategory && channel.name.toLowerCase().includes(categoryName.toLowerCase()),
  )
}

// Helper function to schedule archiving
function scheduleArchiving(channelId, guildId, targetDate, client) {
  const task = {
    id: Date.now().toString(),
    channelId,
    guildId,
    targetDate: new Date(targetDate),
    created: new Date(),
  }

  scheduledTasks.push(task)

  // Calculate time until execution
  const timeUntil = task.targetDate.getTime() - Date.now()

  if (timeUntil > 0) {
    setTimeout(async () => {
      try {
        const guild = client.guilds.cache.get(guildId)
        const channel = guild?.channels.cache.get(channelId)
        const archivedCategory = findCategoryByName(guild, "archived")

        if (channel && archivedCategory) {
          await channel.setParent(archivedCategory.id)
          console.log(`Automatically archived channel: ${channel.name}`)

          // Send notification to the channel
          await channel.send("📁 This channel has been automatically archived as scheduled.")
        }

        // Remove completed task
        scheduledTasks = scheduledTasks.filter((t) => t.id !== task.id)
      } catch (error) {
        console.error("Error in scheduled archiving:", error)
      }
    }, timeUntil)
  }

  return task
}

export default {
  data: new SlashCommandBuilder()
    .setName("archive")
    .setDescription("Manage channel archiving and categories")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("move")
        .setDescription("Move a channel to archived category")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The channel to archive")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("unarchive")
        .setDescription("Move a channel from archived to execs category")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The channel to unarchive")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("schedule")
        .setDescription("Schedule automatic archiving for a channel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The channel to schedule for archiving")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("date")
            .setDescription("Date to archive (YYYY-MM-DD format, e.g., 2024-06-22)")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list-scheduled").setDescription("List all scheduled archiving tasks"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel-schedule")
        .setDescription("Cancel a scheduled archiving task")
        .addStringOption((option) =>
          option.setName("task-id").setDescription("The ID of the task to cancel").setRequired(true),
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    // Check permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({
        embeds: [
          createStatusEmbed("ACCESS DENIED", "You need Manage Channels permission to use this command", "error"),
        ],
        ephemeral: true,
      })
    }

    const subcommand = interaction.options.getSubcommand()

    try {
      switch (subcommand) {
        case "move": {
          const channel = interaction.options.getChannel("channel")
          const archivedCategory = findCategoryByName(interaction.guild, "archived")

          if (!archivedCategory) {
            return interaction.reply({
              embeds: [
                createStatusEmbed(
                  "CATEGORY NOT FOUND",
                  'Could not find an "Archived" category. Please create one first.',
                  "error",
                ),
              ],
              ephemeral: true,
            })
          }

          await channel.setParent(archivedCategory.id)

          const archiveEmbed = createArchiveEmbed(
            "move",
            channel.name,
            `Channel moved to **${archivedCategory.name}** category`,
          )
          await interaction.reply({ embeds: [archiveEmbed] })
          break
        }

        case "unarchive": {
          const channel = interaction.options.getChannel("channel")
          const execsCategory = findCategoryByName(interaction.guild, "execs")

          if (!execsCategory) {
            return interaction.reply({
              embeds: [
                createStatusEmbed(
                  "CATEGORY NOT FOUND",
                  'Could not find an "Execs" category. Please create one first.',
                  "error",
                ),
              ],
              ephemeral: true,
            })
          }

          await channel.setParent(execsCategory.id)

          const unarchiveEmbed = createArchiveEmbed(
            "unarchive",
            channel.name,
            `Channel restored to **${execsCategory.name}** category`,
          )
          await interaction.reply({ embeds: [unarchiveEmbed] })
          break
        }

        case "schedule": {
          const channel = interaction.options.getChannel("channel")
          const dateString = interaction.options.getString("date")

          // Validate date format
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/
          if (!dateRegex.test(dateString)) {
            return interaction.reply({
              embeds: [createStatusEmbed("INVALID DATE", "Please use YYYY-MM-DD format (e.g., 2024-06-22)", "error")],
              ephemeral: true,
            })
          }

          const targetDate = new Date(dateString + "T00:00:00")

          if (targetDate <= new Date()) {
            return interaction.reply({
              embeds: [createStatusEmbed("INVALID DATE", "The scheduled date must be in the future", "error")],
              ephemeral: true,
            })
          }

          // Check if archived category exists
          const archivedCategory = findCategoryByName(interaction.guild, "archived")
          if (!archivedCategory) {
            return interaction.reply({
              embeds: [
                createStatusEmbed(
                  "CATEGORY NOT FOUND",
                  'Could not find an "Archived" category. Please create one first.',
                  "error",
                ),
              ],
              ephemeral: true,
            })
          }

          const task = scheduleArchiving(channel.id, interaction.guild.id, targetDate, interaction.client)

          const scheduleEmbed = createArchiveEmbed(
            "schedule",
            channel.name,
            `Scheduled for <t:${Math.floor(targetDate.getTime() / 1000)}:F>`,
          )
          scheduleEmbed.addFields({
            name: `${CLUB_THEME.emojis.gear} Task ID`,
            value: `\`${task.id}\``,
            inline: true,
          })

          await interaction.reply({ embeds: [scheduleEmbed] })
          break
        }

        case "list-scheduled": {
          if (scheduledTasks.length === 0) {
            return interaction.reply({
              embeds: [createStatusEmbed("NO SCHEDULED TASKS", "No scheduled archiving tasks found", "info")],
            })
          }

          const taskFields = scheduledTasks.map((task, index) => {
            const channel = interaction.guild.channels.cache.get(task.channelId)
            const channelName = channel ? channel.name : "Unknown Channel"
            return {
              name: `${CLUB_THEME.emojis.clock} Task ${index + 1}`,
              value: `**ID:** \`${task.id}\`\n**Channel:** ${channelName}\n**Date:** <t:${Math.floor(task.targetDate.getTime() / 1000)}:F>`,
              inline: true,
            }
          })

          const listEmbed = createStatusEmbed(
            "SCHEDULED TASKS",
            `Found ${scheduledTasks.length} scheduled archiving task${scheduledTasks.length > 1 ? "s" : ""}`,
            "info",
            taskFields,
          )

          await interaction.reply({ embeds: [listEmbed] })
          break
        }

        case "cancel-schedule": {
          const taskId = interaction.options.getString("task-id")
          const taskIndex = scheduledTasks.findIndex((task) => task.id === taskId)

          if (taskIndex === -1) {
            return interaction.reply({
              embeds: [
                createStatusEmbed(
                  "TASK NOT FOUND",
                  "Task not found. Use `/archive list-scheduled` to see available tasks.",
                  "error",
                ),
              ],
              ephemeral: true,
            })
          }

          const canceledTask = scheduledTasks.splice(taskIndex, 1)[0]
          const channel = interaction.guild.channels.cache.get(canceledTask.channelId)

          const cancelEmbed = createStatusEmbed(
            "TASK CANCELLED",
            `Canceled scheduled archiving for **${channel ? channel.name : "Unknown Channel"}**`,
            "success",
            [{ name: `${CLUB_THEME.emojis.gear} Task ID`, value: `\`${taskId}\``, inline: true }],
          )

          await interaction.reply({ embeds: [cancelEmbed] })
          break
        }
      }
    } catch (error) {
      console.error("Archive command error:", error)
      await interaction.reply({
        embeds: [
          createStatusEmbed(
            "COMMAND ERROR",
            "An error occurred while executing the command. Please check my permissions and try again.",
            "error",
          ),
        ],
        ephemeral: true,
      })
    }
  },

  // Initialize scheduled tasks when bot starts
  initializeScheduledTasks: (client) => {
    // In a production environment, you'd load these from a database
    // For now, this is just a placeholder for the initialization function
    console.log("Archive command initialized")
  },
}

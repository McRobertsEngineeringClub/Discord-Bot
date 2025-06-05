import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js"

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
        content: "You do not have permission to manage channels.",
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
              content: 'Could not find an "Archived" category. Please create one first.',
              ephemeral: true,
            })
          }

          await channel.setParent(archivedCategory.id)
          await interaction.reply(`📁 Successfully moved ${channel.name} to the Archived category.`)
          break
        }

        case "unarchive": {
          const channel = interaction.options.getChannel("channel")
          const execsCategory = findCategoryByName(interaction.guild, "execs")

          if (!execsCategory) {
            return interaction.reply({
              content: 'Could not find an "Execs" category. Please create one first.',
              ephemeral: true,
            })
          }

          await channel.setParent(execsCategory.id)
          await interaction.reply(`📤 Successfully moved ${channel.name} to the Execs category.`)
          break
        }

        case "schedule": {
          const channel = interaction.options.getChannel("channel")
          const dateString = interaction.options.getString("date")

          // Validate date format
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/
          if (!dateRegex.test(dateString)) {
            return interaction.reply({
              content: "Invalid date format. Please use YYYY-MM-DD (e.g., 2024-06-22).",
              ephemeral: true,
            })
          }

          const targetDate = new Date(dateString + "T00:00:00")

          if (targetDate <= new Date()) {
            return interaction.reply({
              content: "The scheduled date must be in the future.",
              ephemeral: true,
            })
          }

          // Check if archived category exists
          const archivedCategory = findCategoryByName(interaction.guild, "archived")
          if (!archivedCategory) {
            return interaction.reply({
              content: 'Could not find an "Archived" category. Please create one first.',
              ephemeral: true,
            })
          }

          const task = scheduleArchiving(channel.id, interaction.guild.id, targetDate, interaction.client)

          await interaction.reply({
            embeds: [
              {
                title: "⏰ Archiving Scheduled",
                description: `Channel ${channel.name} will be automatically archived on ${dateString}`,
                fields: [
                  { name: "Task ID", value: task.id, inline: true },
                  { name: "Channel", value: channel.toString(), inline: true },
                  { name: "Scheduled Date", value: `<t:${Math.floor(targetDate.getTime() / 1000)}:F>`, inline: true },
                ],
                color: 0x00ff00,
                timestamp: new Date(),
              },
            ],
          })
          break
        }

        case "list-scheduled": {
          if (scheduledTasks.length === 0) {
            return interaction.reply("No scheduled archiving tasks found.")
          }

          const taskList = scheduledTasks
            .map((task) => {
              const channel = interaction.guild.channels.cache.get(task.channelId)
              const channelName = channel ? channel.name : "Unknown Channel"
              return `**ID:** ${task.id}\n**Channel:** ${channelName}\n**Date:** <t:${Math.floor(task.targetDate.getTime() / 1000)}:F>`
            })
            .join("\n\n")

          await interaction.reply({
            embeds: [
              {
                title: "📅 Scheduled Archiving Tasks",
                description: taskList,
                color: 0x0099ff,
                timestamp: new Date(),
              },
            ],
          })
          break
        }

        case "cancel-schedule": {
          const taskId = interaction.options.getString("task-id")
          const taskIndex = scheduledTasks.findIndex((task) => task.id === taskId)

          if (taskIndex === -1) {
            return interaction.reply({
              content: "Task not found. Use `/archive list-scheduled` to see available tasks.",
              ephemeral: true,
            })
          }

          const canceledTask = scheduledTasks.splice(taskIndex, 1)[0]
          const channel = interaction.guild.channels.cache.get(canceledTask.channelId)

          await interaction.reply(
            `❌ Canceled scheduled archiving for ${channel ? channel.name : "Unknown Channel"} (Task ID: ${taskId})`,
          )
          break
        }
      }
    } catch (error) {
      console.error("Archive command error:", error)
      await interaction.reply({
        content: "An error occurred while executing the command. Please check my permissions and try again.",
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

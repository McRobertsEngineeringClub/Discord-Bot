import { EmbedBuilder } from "discord.js"

export const CLUB_THEME = {
  colors: {
    primary: 0x667eea, // Modern gradient blue
    secondary: 0x764ba2, // Deep purple accent
    success: 0x06d6a0, // Clean success green
    warning: 0xffd166, // Warm warning yellow
    error: 0xf72585, // Modern error pink
    info: 0x4cc9f0, // Clean info blue
    dark: 0x2d3748, // Modern dark gray
    light: 0xf7fafc, // Clean light
  },

  emojis: {
    // Core system emojis only
    announce: "📢",
    user: "👤",
    role: "🏷️",
    archive: "📁",
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
  },

  ui: {
    // Modern box drawing characters
    topBar: "╔═══════════════════════════════════════════════════════════════════╗",
    bottomBar: "╚═══════════════════════════════════════════════════════════════════╝",
    divider: "─────────────────────────────────────────────────────────────────────",
    shortDivider: "──────────────────────",
    bullet: "▸",
    accent: "◆",
    separator: "│",
  },
}

export function createModernEmbed(options = {}) {
  const {
    title,
    description,
    color = CLUB_THEME.colors.primary,
    fields = [],
    footer,
    timestamp = true,
    thumbnail = false,
  } = options

  const embed = new EmbedBuilder().setColor(color)

  if (title) {
    embed.setTitle(title.toUpperCase())
  }

  if (description) {
    embed.setDescription(description)
  }

  if (thumbnail) {
    embed.setThumbnail(thumbnail)
  }

  fields.forEach((field) => {
    embed.addFields({
      name: field.name,
      value: field.value,
      inline: field.inline || false,
    })
  })

  if (footer !== false) {
    embed.setFooter({
      text: footer || "Engineering Club",
    })
  }

  if (timestamp) {
    embed.setTimestamp()
  }

  return embed
}

export function createAnnouncementEmbed(topic, details = "", attachmentCount = 0) {
  let description = `**${topic}**`

  if (details) {
    description += `\n\n${details}`
  }

  const fields = []

  if (attachmentCount > 0) {
    fields.push({
      name: "Attachments",
      value: `${attachmentCount} file${attachmentCount > 1 ? "s" : ""} included`,
      inline: false,
    })
  }

  return createModernEmbed({
    title: "Club Announcement",
    description,
    color: CLUB_THEME.colors.primary,
    fields,
  })
}

export function createUserInfoEmbed(user, member) {
  const roles =
    member.roles.cache
      .filter((role) => role.id !== member.guild.id)
      .map((role) => role.name)
      .join(" | ") || "No roles"

  const headerBox = `╔════════════════════╗\n   ✦ USER PROFILE ✦\n╚════════════════════╝`

  const profileInfo = [
    `**Username:** ${user.username}`,
    `**Nickname:** ${member.nickname || user.displayName}`,
    `**ID:** ${user.id}`,
    `**Created:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
    `**Joined:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
    `**Roles:** ${roles}`,
    `${CLUB_THEME.ui.shortDivider}`,
    `Requested by ${member.user.username}`,
  ].join("\n")

  return createModernEmbed({
    description: `${headerBox}\n\n${profileInfo}`,
    color: CLUB_THEME.colors.info,
    thumbnail: user.displayAvatarURL({ dynamic: true, size: 256 }),
    footer: false,
    timestamp: false,
  })
}

export function createArchiveEmbed(type, channelName, details = "") {
  const typeConfig = {
    move: {
      color: CLUB_THEME.colors.warning,
      title: "Channel Archived",
      description: `**${channelName}** has been moved to archives`,
    },
    unarchive: {
      color: CLUB_THEME.colors.success,
      title: "Channel Restored",
      description: `**${channelName}** has been restored from archives`,
    },
  }

  const config = typeConfig[type] || typeConfig.move

  return createModernEmbed({
    title: config.title,
    description: config.description + (details ? `\n\n${details}` : ""),
    color: config.color,
  })
}

export function createRoleEmbed(type, userName, roleName, details = "") {
  const isSuccess = type === "success"

  return createModernEmbed({
    title: isSuccess ? "Role Assigned" : "Role Assignment Failed",
    description: `${isSuccess ? "Successfully assigned" : "Failed to assign"} **${roleName}** ${isSuccess ? "to" : "for"} **${userName}**${details ? `\n\n${details}` : ""}`,
    color: isSuccess ? CLUB_THEME.colors.success : CLUB_THEME.colors.error,
  })
}

export function createStatusEmbed(title, message, type = "info", fields = []) {
  const typeConfig = {
    success: { color: CLUB_THEME.colors.success },
    error: { color: CLUB_THEME.colors.error },
    warning: { color: CLUB_THEME.colors.warning },
    info: { color: CLUB_THEME.colors.info },
    loading: { color: CLUB_THEME.colors.primary },
  }

  const config = typeConfig[type] || typeConfig.info

  return createModernEmbed({
    title,
    description: message,
    color: config.color,
    fields,
  })
}

// Legacy exports for compatibility
export const createStyledEmbed = createModernEmbed

import { EmbedBuilder } from "discord.js"

// Club branding colors and theme
export const CLUB_THEME = {
  colors: {
    primary: 0x2e86ab, // Engineering blue
    secondary: 0xa23b72, // Accent purple
    success: 0x43aa8b, // Success green
    warning: 0xf18f01, // Warning orange
    error: 0xc73e1d, // Error red
    info: 0x5dade2, // Info light blue
    dark: 0x2c3e50, // Dark blue-gray
    light: 0xecf0f1, // Light gray
  },

  emojis: {
    // Engineering themed emojis
    gear: "⚙️",
    wrench: "🔧",
    bolt: "🔩",
    circuit: "🔌",
    robot: "🤖",
    rocket: "🚀",
    star: "⭐",
    sparkles: "✨",
    fire: "🔥",
    lightning: "⚡",
    diamond: "💎",
    crown: "👑",

    // Status emojis
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
    loading: "⏳",
    clock: "🕐",
    calendar: "📅",

    // Action emojis
    announce: "📢",
    archive: "📁",
    user: "👤",
    role: "🏷️",
    email: "📧",
    discord: "💬",
    settings: "⚙️",
  },

  // Unicode decorative elements (Discord-safe)
  decorations: {
    divider: "━━━━━━━━━━━━━━━━━━━━",
    shortDivider: "━━━━━━━━━━",
    dots: "• • • • • • • • • •",
    arrows: "▶ ▶ ▶ ▶ ▶",
    stars: "★ ★ ★ ★ ★",
    diamonds: "◆ ◆ ◆ ◆ ◆",
  },
}

// Create styled embed with club branding
export function createStyledEmbed(options = {}) {
  const {
    title,
    description,
    color = CLUB_THEME.colors.primary,
    thumbnail,
    image,
    fields = [],
    footer,
    timestamp = true,
    author,
  } = options

  const embed = new EmbedBuilder().setColor(color)

  // Add decorative title with emojis
  if (title) {
    const decoratedTitle = `${CLUB_THEME.emojis.gear} ${title} ${CLUB_THEME.emojis.gear}`
    embed.setTitle(decoratedTitle)
  }

  // Add description with decorative elements
  if (description) {
    const decoratedDesc = `${CLUB_THEME.decorations.shortDivider}\n${description}\n${CLUB_THEME.decorations.shortDivider}`
    embed.setDescription(decoratedDesc)
  }

  // Add thumbnail (club logo by default)
  if (thumbnail !== false) {
    embed.setThumbnail(thumbnail || "https://drive.google.com/uc?export=view&id=1FMf439DX_I-Up9Nww7x-ajlyuppcE_rZ")
  }

  if (image) {
    embed.setImage(image)
  }

  // Add styled fields
  fields.forEach((field) => {
    const styledField = {
      name: `${CLUB_THEME.emojis.diamond} ${field.name}`,
      value: field.value,
      inline: field.inline || false,
    }
    embed.addFields(styledField)
  })

  // Add footer with club branding
  if (footer !== false) {
    embed.setFooter({
      text:
        footer ||
        `${CLUB_THEME.emojis.wrench} Engineering Club • Innovate • Create • Engineer ${CLUB_THEME.emojis.bolt}`,
      iconURL: "https://drive.google.com/uc?export=view&id=1FMf439DX_I-Up9Nww7x-ajlyuppcE_rZ",
    })
  }

  if (timestamp) {
    embed.setTimestamp()
  }

  if (author) {
    embed.setAuthor(author)
  }

  return embed
}

// Create announcement embed with special styling
export function createAnnouncementEmbed(topic, details = "", attachmentCount = 0) {
  const embed = createStyledEmbed({
    title: `CLUB ANNOUNCEMENT`,
    color: CLUB_THEME.colors.primary,
    description: `${CLUB_THEME.emojis.announce} **${topic}** ${CLUB_THEME.emojis.announce}\n\n${details || "More details coming soon!"}\n\n${CLUB_THEME.decorations.stars}`,
    fields: [
      {
        name: `${CLUB_THEME.emojis.calendar} When`,
        value: `**TBD**\n*Stay tuned for updates*`,
        inline: true,
      },
      {
        name: `${CLUB_THEME.emojis.gear} Where`,
        value: `**Electronics Room**\n*Our engineering hub*`,
        inline: true,
      },
      {
        name: `${CLUB_THEME.emojis.wrench} What to Bring`,
        value: `**TBD**\n*Details coming soon*`,
        inline: true,
      },
    ],
  })

  if (attachmentCount > 0) {
    embed.addFields({
      name: `${CLUB_THEME.emojis.circuit} Attachments`,
      value: `${CLUB_THEME.emojis.sparkles} ${attachmentCount} file${attachmentCount > 1 ? "s" : ""} included`,
      inline: false,
    })
  }

  return embed
}

// Create user info embed with enhanced styling
export function createUserInfoEmbed(user, member) {
  const roles =
    member.roles.cache
      .filter((role) => role.id !== member.guild.id)
      .map((role) => role.toString())
      .join(" • ") || "*No roles assigned*"

  const statusEmoji = {
    online: "🟢",
    idle: "🟡",
    dnd: "🔴",
    offline: "⚫",
  }

  return createStyledEmbed({
    title: `USER PROFILE`,
    color: CLUB_THEME.colors.info,
    description: `${CLUB_THEME.emojis.user} **${user.tag}** ${CLUB_THEME.emojis.user}\n${CLUB_THEME.decorations.dots}`,
    thumbnail: user.displayAvatarURL({ dynamic: true, size: 256 }),
    fields: [
      {
        name: `${CLUB_THEME.emojis.robot} User ID`,
        value: `\`${user.id}\``,
        inline: true,
      },
      {
        name: `${CLUB_THEME.emojis.star} Nickname`,
        value: member.nickname || "*No nickname*",
        inline: true,
      },
      {
        name: `${CLUB_THEME.emojis.calendar} Account Created`,
        value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
        inline: true,
      },
      {
        name: `${CLUB_THEME.emojis.rocket} Joined Server`,
        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
        inline: true,
      },
      {
        name: `${CLUB_THEME.emojis.crown} Roles`,
        value: roles,
        inline: false,
      },
    ],
    footer: `Requested by ${member.user.tag} • Member since ${new Date(member.joinedTimestamp).getFullYear()}`,
  })
}

// Create archive embed with enhanced styling
export function createArchiveEmbed(type, channelName, details = "") {
  const typeConfig = {
    move: {
      emoji: CLUB_THEME.emojis.archive,
      color: CLUB_THEME.colors.warning,
      title: "CHANNEL ARCHIVED",
      description: `Successfully moved **${channelName}** to archived category`,
    },
    unarchive: {
      emoji: CLUB_THEME.emojis.rocket,
      color: CLUB_THEME.colors.success,
      title: "CHANNEL RESTORED",
      description: `Successfully restored **${channelName}** from archives`,
    },
    schedule: {
      emoji: CLUB_THEME.emojis.clock,
      color: CLUB_THEME.colors.info,
      title: "ARCHIVING SCHEDULED",
      description: `**${channelName}** scheduled for automatic archiving`,
    },
  }

  const config = typeConfig[type] || typeConfig.move

  return createStyledEmbed({
    title: config.title,
    color: config.color,
    description: `${config.emoji} ${config.description} ${config.emoji}\n\n${details}\n\n${CLUB_THEME.decorations.arrows}`,
    fields: details
      ? [
          {
            name: `${CLUB_THEME.emojis.info} Details`,
            value: details,
            inline: false,
          },
        ]
      : [],
  })
}

// Create role assignment embed
export function createRoleEmbed(type, userName, roleName, details = "") {
  const isSuccess = type === "success"

  return createStyledEmbed({
    title: isSuccess ? "ROLE ASSIGNED" : "ROLE ERROR",
    color: isSuccess ? CLUB_THEME.colors.success : CLUB_THEME.colors.error,
    description: `${isSuccess ? CLUB_THEME.emojis.success : CLUB_THEME.emojis.error} ${isSuccess ? "Successfully assigned" : "Failed to assign"} role **${roleName}** ${isSuccess ? "to" : "for"} **${userName}**\n\n${CLUB_THEME.decorations.diamonds}`,
    fields: details
      ? [
          {
            name: `${CLUB_THEME.emojis.info} ${isSuccess ? "Details" : "Error Details"}`,
            value: details,
            inline: false,
          },
        ]
      : [],
  })
}

// Create status/info embed
export function createStatusEmbed(title, message, type = "info", fields = []) {
  const typeConfig = {
    success: { color: CLUB_THEME.colors.success, emoji: CLUB_THEME.emojis.success },
    error: { color: CLUB_THEME.colors.error, emoji: CLUB_THEME.emojis.error },
    warning: { color: CLUB_THEME.colors.warning, emoji: CLUB_THEME.emojis.warning },
    info: { color: CLUB_THEME.colors.info, emoji: CLUB_THEME.emojis.info },
    loading: { color: CLUB_THEME.colors.primary, emoji: CLUB_THEME.emojis.loading },
  }

  const config = typeConfig[type] || typeConfig.info

  return createStyledEmbed({
    title: title.toUpperCase(),
    color: config.color,
    description: `${config.emoji} ${message} ${config.emoji}\n\n${CLUB_THEME.decorations.shortDivider}`,
    fields,
  })
}

// Format text with engineering theme
export function formatText(text, style = "normal") {
  const styles = {
    header: `**${CLUB_THEME.emojis.gear} ${text} ${CLUB_THEME.emojis.gear}**`,
    subheader: `*${CLUB_THEME.emojis.diamond} ${text}*`,
    highlight: `**${CLUB_THEME.emojis.sparkles} ${text} ${CLUB_THEME.emojis.sparkles}**`,
    code: `\`${text}\``,
    quote: `> ${CLUB_THEME.emojis.circuit} ${text}`,
    normal: text,
  }

  return styles[style] || text
}

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js")
const axios = require("axios")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("advisor")
    .setDescription("🤖 Get AI-powered advice and ideas for your engineering club")
    .addStringOption((option) =>
      option
        .setName("topic")
        .setDescription("What do you need advice about?")
        .setRequired(true)
        .addChoices(
          { name: "📅 Event Planning", value: "events" },
          { name: "👥 Member Engagement", value: "engagement" },
          { name: "💰 Fundraising Ideas", value: "fundraising" },
          { name: "🔧 Project Ideas", value: "projects" },
          { name: "🏆 Competition Prep", value: "competitions" },
          { name: "🤝 Industry Partnerships", value: "partnerships" },
          { name: "📊 Club Management", value: "management" },
          { name: "💡 Custom Question", value: "custom" },
        ),
    )
    .addStringOption((option) =>
      option.setName("details").setDescription("Provide specific details about your situation").setRequired(false),
    ),

  async execute(interaction) {
    const topic = interaction.options.getString("topic")
    const details = interaction.options.getString("details") || ""

    await interaction.deferReply({ ephemeral: true })

    const topicPrompts = {
      events:
        "Suggest creative and engaging engineering-focused events that would attract students and provide educational value. Consider budget, logistics, and seasonal timing.",
      engagement:
        "Provide strategies to increase member participation, retention, and enthusiasm in an engineering club. Focus on practical, actionable ideas.",
      fundraising:
        "Suggest innovative fundraising ideas specifically for engineering clubs, including grant opportunities, sponsorship strategies, and member-driven initiatives.",
      projects:
        "Recommend hands-on engineering projects that are educational, achievable for students, and showcase practical skills. Consider different skill levels.",
      competitions:
        "Advise on preparing for engineering competitions, team formation, skill development, and competition strategy.",
      partnerships:
        "Suggest ways to build relationships with industry professionals, companies, and other organizations that could benefit the engineering club.",
      management:
        "Provide guidance on effective club leadership, organization structure, meeting management, and administrative best practices.",
      custom: "Provide thoughtful advice and suggestions for this engineering club situation.",
    }

    try {
      const response = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "mixtral-8x7b-32768",
          messages: [
            {
              role: "system",
              content: `You are an experienced engineering club advisor and mentor. You provide practical, actionable advice that considers:
                        - Student budgets and time constraints
                        - Educational value and skill development
                        - Feasibility for undergraduate engineering students
                        - Industry relevance and career preparation
                        - Building community and engagement
                        
                        Format your response with clear sections, bullet points, and actionable steps. Be encouraging but realistic.`,
            },
            {
              role: "user",
              content: `Topic: ${topicPrompts[topic]}
                        
                        Additional context: ${details}
                        
                        Please provide comprehensive advice with specific recommendations, implementation steps, and potential challenges to consider.`,
            },
          ],
          temperature: 0.8,
          max_tokens: 1500,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
        },
      )

      const aiAdvice = response.data.choices[0].message.content

      const adviceEmbed = new EmbedBuilder()
        .setTitle(`🤖 Club Advisor: ${topic.charAt(0).toUpperCase() + topic.slice(1)} Advice`)
        .setDescription(aiAdvice.length > 4000 ? aiAdvice.substring(0, 4000) + "..." : aiAdvice)
        .setColor("#00D166")
        .setThumbnail("https://placeholder.svg?height=80&width=80&query=engineering+club+logo")
        .setFooter({
          text: "Engineering Club AI Advisor • Powered by Groq",
          iconURL: "https://placeholder.svg?height=20&width=20&query=robot+icon",
        })
        .setTimestamp()

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("advisor_follow_up").setLabel("💬 Ask Follow-up").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("advisor_share").setLabel("📤 Share with Team").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("advisor_save").setLabel("💾 Save Advice").setStyle(ButtonStyle.Success),
      )

      await interaction.editReply({
        embeds: [adviceEmbed],
        components: [actionRow],
      })
    } catch (error) {
      console.error("Groq AI Error:", error)

      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Advisor Temporarily Unavailable")
        .setDescription("Sorry, the AI advisor is currently unavailable. Please try again in a few moments.")
        .setColor("#ED4245")

      await interaction.editReply({
        embeds: [errorEmbed],
      })
    }
  },
}

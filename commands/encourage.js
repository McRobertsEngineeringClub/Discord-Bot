import { SlashCommandBuilder } from "discord.js"
import fetch from "node-fetch"

const sadWords = ["sad", "depressed", "unhappy", "angry", "miserable"]
const starterEncouragements = ["Cheer up!", "Hang in there.", "You are a great person!"]

const encouragements = [...starterEncouragements]
let responding = true

async function getQuote() {
  const res = await fetch("https://zenquotes.io/api/random")
  const data = await res.json()
  return `${data[0]["q"]} -${data[0]["a"]}`
}

export default {
  data: new SlashCommandBuilder()
    .setName("encourage")
    .setDescription("Encouragement system commands")
    .addSubcommand((subcommand) => subcommand.setName("inspire").setDescription("Get an inspiring quote"))
    .addSubcommand((subcommand) =>
      subcommand
        .setName("add")
        .setDescription("Add a new encouraging message")
        .addStringOption((option) =>
          option.setName("message").setDescription("The encouraging message to add").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Delete an encouraging message")
        .addIntegerOption((option) =>
          option.setName("index").setDescription("The index of the message to delete").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List all encouraging messages"))
    .addSubcommand((subcommand) =>
      subcommand
        .setName("responding")
        .setDescription("Turn encouragement responses on or off")
        .addBooleanOption((option) =>
          option.setName("state").setDescription("Turn responding on (true) or off (false)").setRequired(true),
        ),
    ),
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand()

    switch (subcommand) {
      case "inspire":
        const quote = await getQuote()
        await interaction.editReply(quote)
        break
      case "add":
        const newMessage = interaction.options.getString("message")
        encouragements.push(newMessage)
        await interaction.editReply("New encouraging message added.")
        break
      case "delete":
        const index = interaction.options.getInteger("index")
        if (index >= 0 && index < encouragements.length) {
          encouragements.splice(index, 1)
          await interaction.editReply("Encouraging message deleted.")
        } else {
          await interaction.editReply("Invalid index.")
        }
        break
      case "list":
        await interaction.editReply(encouragements.join("\n"))
        break
      case "responding":
        responding = interaction.options.getBoolean("state")
        await interaction.editReply(`Responding is now ${responding ? "on" : "off"}.`)
        break
    }
  },
  checkMessage: async (message) => {
    if (responding && sadWords.some((word) => message.content.toLowerCase().includes(word))) {
      const encouragement = encouragements[Math.floor(Math.random() * encouragements.length)]
      await message.reply(encouragement)
    }
  },
}

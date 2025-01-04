import { Client, GatewayIntentBits, Collection, Events } from "discord.js";
import fs from "fs";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import express from 'express';
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Express server setup
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Discord bot is running!');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Configuration
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});
client.commands = new Collection();
const token = process.env.DISCORD_TOKEN;
const INTRODUCTION_CHANNEL_ID = process.env.INTRODUCTION_CHANNEL_ID;

// Load Commands
const commandFiles = fs
    .readdirSync("./commands")
    .filter((file) => file.endsWith(".js"));
for (const file of commandFiles) {
    const command = await import(`./commands/${file}`);
    client.commands.set(command.default.data.name, command.default);
}

// Register Commands
client.once(Events.ClientReady, async () => {
    const guild = client.guilds.cache.get("1293071121998020630"); // Replace with your server's ID
    if (guild) {
        await guild.commands.set(
            client.commands.map((command) => command.data),
        );
        console.log(`Slash commands registered in ${guild.name}`);
    }
    console.log(`Logged in as ${client.user.tag}`);
});

// Interaction Event
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        await interaction.reply({
            content: "There was an error executing this command!",
            ephemeral: true,
        });
    }
});

// Role Manager
client.on(Events.MessageCreate, async (message) => {
    if (message.channel.id !== INTRODUCTION_CHANNEL_ID || message.author.bot) return;

    const content = message.content.toLowerCase();
    const gradeMatch = content.match(/(\d+)/);
    const membershipRole = message.guild.roles.cache.find(role => role.name.toLowerCase() === 'members');

    if (gradeMatch) {
        const grade = parseInt(gradeMatch[1]);
        const gradeRole = message.guild.roles.cache.find(role => role.name.toLowerCase() === `${grade}`);

        if (gradeRole) {
            try {
                await message.member.roles.add(gradeRole);
                console.log(`Assigned Grade ${grade} role to ${message.author.tag}`);
            } catch (error) {
                console.error(`Error assigning Grade ${grade} role:`, error);
            }
        }
    }

    if (membershipRole) {
        try {
            await message.member.roles.add(membershipRole);
            console.log(`Assigned Member role to ${message.author.tag}`);
        } catch (error) {
            console.error('Error assigning Member role:', error);
        }
    }

    await message.react('👋');
});

// Error Handling
client.on(Events.Error, console.error);

// Login
client.login(process.env.DISCORD_TOKEN);


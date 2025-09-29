import { REST, Routes } from 'discord.js';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

// Load environment variables based on NODE_ENV set by cross-env in package.json
// For local development, NODE_ENV is 'development', so .local.env will be loaded.
// For production, NODE_ENV is 'production', so .env will be loaded.
const envPath = process.env.NODE_ENV === 'development' ? '.local.env' : '.env';
dotenv.config({ path: envPath });

console.log(`DEBUG: deploy-commands.js loading environment variables from: ${envPath}`);
console.log("DEBUG: DISCORD_TOKEN is", process.env.DISCORD_TOKEN ? "set" : "not set");
console.log("DEBUG: CLIENT_ID is", process.env.CLIENT_ID ? "set" : "not set");
console.log("DEBUG: GUILD_ID is", process.env.GUILD_ID ? "set" : "not set");


// Helper for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function registerCommands() {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID; // Optional - for guild-specific commands

    if (!token) {
        console.error('ERROR: DISCORD_TOKEN is not set. Cannot register commands.');
        process.exit(1);
    }
    if (!clientId) {
        console.error('ERROR: CLIENT_ID is not set. Cannot register commands.');
        process.exit(1);
    }

    const commands = [];
    const commandsPath = join(__dirname, 'commands');

    try {
        const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = join(commandsPath, file);
            try {
                // Convert Windows path to file:// URL for dynamic import
                const fileUrl = new URL(`file:///${filePath}`).href;
                const commandModule = await import(fileUrl);
                const command = commandModule.default || commandModule; // Handle both default and non-default exports

                if ('data' in command && 'execute' in command) {
                    commands.push(command.data.toJSON());
                    console.log(`📦 Loaded command for registration: ${command.data.name}`);
                } else {
                    console.warn(`⚠️ Warning: Command at ${filePath} is missing required "data" or "execute" properties.`);
                }
            } catch (error) {
                console.error(`❌ Error loading command file ${filePath}:`, error);
            }
        }
    } catch (error) {
        console.error(`❌ Error reading commands directory ${commandsPath}:`, error);
    }

    const rest = new REST({ version: '10' }).setToken(token);

    try {
        console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);

        if (guildId) { // Register to specific guild for faster development updates
            const data = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );
            console.log(`✅ Successfully reloaded ${data.length} guild commands to guild ID: ${guildId}.`);
        } else { // Register globally (takes ~1 hour to propagate)
            const data = await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands },
            );
            console.log(`✅ Successfully reloaded ${data.length} global commands.`);
        }
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
}

registerCommands();

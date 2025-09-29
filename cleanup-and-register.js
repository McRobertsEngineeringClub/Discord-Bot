import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function cleanupAndRegister() {
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID; // Optional - for guild-specific commands
    
    const rest = new REST().setToken(token);
    
    console.log('🧹 Starting complete command cleanup...');
    
    try {
        // STEP 1: Clear ALL global commands
        console.log('Removing all global commands...');
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: [] }
        );
        console.log('✅ Global commands cleared');
        
        // STEP 2: Clear ALL guild commands (if you use guild-specific commands)
        if (guildId) {
            console.log('Removing all guild commands...');
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: [] }
            );
            console.log('✅ Guild commands cleared');
        }
        
        // Wait a moment for Discord to process the cleanup
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // STEP 3: Load your commands
        const commands = [];
        const commandsPath = path.join(__dirname, 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        const commandNames = new Set(); // Track unique command names
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            // Use dynamic import for ES Modules
            const commandModule = await import(filePath);
            const command = commandModule.default; // Assuming default export
            
            if ('data' in command && 'execute' in command) {
                // Skip if we've already added this command name
                if (commandNames.has(command.data.name)) {
                    console.warn(`⚠️ Skipping duplicate command: ${command.data.name} from ${file}`);
                    continue;
                }
                
                commands.push(command.data.toJSON());
                commandNames.add(command.data.name);
                console.log(`✅ Loaded command: ${command.data.name}`);
            }
        }
        
        // STEP 4: Register commands (choose ONE approach)
        console.log(`🚀 Registering ${commands.length} commands...`);
        
        // Option A: Register globally (available everywhere after ~1 hour)
        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );
        console.log(`✅ Successfully registered ${data.length} global commands`);
        
        // Option B: Register to specific guild (instant but guild-specific)
        // Uncomment this and comment out Option A if you want guild-specific
        /*
        if (guildId) {
            const data = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands }
            );
            console.log(`✅ Successfully registered ${data.length} guild commands`);
        }
        */
        
    } catch (error) {
        console.error('❌ Error during cleanup/registration:', error);
    }
}
// Run the cleanup and registration
cleanupAndRegister();

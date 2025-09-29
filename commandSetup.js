import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // Optional - only if using guild-specific commands

// Configuration - Choose ONE registration mode
const REGISTRATION_MODE = 'GLOBAL'; // Options: 'GLOBAL' or 'GUILD'
const CLEANUP_BEFORE_REGISTER = true; // Recommended: true

class CommandManager {
    constructor() {
        this.rest = new REST({ version: '10' }).setToken(token);
        this.commands = [];
        this.commandMap = new Map(); // Track loaded commands to prevent duplicates
        this.logger = this.setupLogger();
    }

    setupLogger() {
        const logDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir);
        }

        const logFile = path.join(logDir, `command-manager-${new Date().toISOString().split('T')[0]}.log`);
        
        return {
            info: (message) => {
                const timestamp = new Date().toISOString();
                const logMessage = `[${timestamp}] INFO: ${message}`;
                console.log('\x1b[36m%s\x1b[0m', logMessage);
                fs.appendFileSync(logFile, logMessage + '\n');
            },
            success: (message) => {
                const timestamp = new Date().toISOString();
                const logMessage = `[${timestamp}] SUCCESS: ${message}`;
                console.log('\x1b[32m%s\x1b[0m', logMessage);
                fs.appendFileSync(logFile, logMessage + '\n');
            },
            error: (message) => {
                const timestamp = new Date().toISOString();
                const logMessage = `[${timestamp}] ERROR: ${message}`;
                console.log('\x1b[31m%s\x1b[0m', logMessage);
                fs.appendFileSync(logFile, logMessage + '\n');
            },
            warn: (message) => {
                const timestamp = new Date().toISOString();
                const logMessage = `[${timestamp}] WARN: ${message}`;
                console.log('\x1b[33m%s\x1b[0m', logMessage);
                fs.appendFileSync(logFile, logMessage + '\n');
            }
        };
    }

    // Load all command files from the commands directory
    async loadCommands() {
        this.logger.info('Loading commands from directory...');
        
        const commandsPath = path.join(__dirname, 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            
            try {
                // Use dynamic import for ES Modules
                const commandModule = await import(filePath);
                const command = commandModule.default; // Assuming default export
                
                // Validate command structure
                if (!command || !command.data || !command.data.name) {
                    this.logger.warn(`Skipping invalid command file: ${file}`);
                    continue;
                }
                
                const commandName = command.data.name;
                
                // Check for duplicates
                if (this.commandMap.has(commandName)) {
                    this.logger.warn(`Duplicate command detected: ${commandName} in ${file}. Skipping...`);
                    continue;
                }
                
                this.commandMap.set(commandName, file);
                this.commands.push(command.data.toJSON());
                this.logger.success(`Loaded command: ${commandName} from ${file}`);
                
            } catch (error) {
                this.logger.error(`Failed to load command from ${file}: ${error.message}`);
            }
        }
        
        this.logger.info(`Total commands loaded: ${this.commands.length}`);
        return this.commands;
    }

    // Remove ALL global commands
    async cleanupGlobalCommands() {
        this.logger.info('Starting global command cleanup...');
        
        try {
            const existingCommands = await this.rest.get(
                Routes.applicationCommands(clientId)
            );
            
            this.logger.info(`Found ${existingCommands.length} global commands to remove`);
            
            if (existingCommands.length > 0) {
                // List commands being removed
                existingCommands.forEach(cmd => {
                    this.logger.info(`  - Removing global command: ${cmd.name}`);
                });
                
                // Clear all global commands
                await this.rest.put(
                    Routes.applicationCommands(clientId),
                    { body: [] }
                );
                
                this.logger.success('All global commands removed successfully');
            } else {
                this.logger.info('No global commands to remove');
            }
            
        } catch (error) {
            this.logger.error(`Failed to cleanup global commands: ${error.message}`);
            throw error;
        }
    }

    // Remove ALL guild-specific commands
    async cleanupGuildCommands(guildIds = []) {
        const guildsToClean = guildIds.length > 0 ? guildIds : [guildId].filter(Boolean);
        
        if (guildsToClean.length === 0) {
            this.logger.warn('No guild IDs provided for cleanup');
            return;
        }
        
        for (const guild of guildsToClean) {
            this.logger.info(`Starting guild command cleanup for guild: ${guild}`);
            
            try {
                const existingCommands = await this.rest.get(
                    Routes.applicationGuildCommands(clientId, guild)
                );
                
                this.logger.info(`Found ${existingCommands.length} commands in guild ${guild}`);
                
                if (existingCommands.length > 0) {
                    // List commands being removed
                    existingCommands.forEach(cmd => {
                        this.logger.info(`  - Removing guild command: ${cmd.name} from guild ${guild}`);
                    });
                    
                    // Clear all guild commands
                    await this.rest.put(
                        Routes.applicationGuildCommands(clientId, guild),
                        { body: [] }
                    );
                    
                    this.logger.success(`All commands removed from guild ${guild}`);
                } else {
                    this.logger.info(`No commands to remove from guild ${guild}`);
                }
                
            } catch (error) {
                this.logger.error(`Failed to cleanup commands for guild ${guild}: ${error.message}`);
            }
        }
    }

    // Complete cleanup of ALL commands everywhere
    async completeCleanup(additionalGuildIds = []) {
        this.logger.info('========================================');
        this.logger.info('Starting COMPLETE command cleanup...');
        this.logger.info('========================================');
        
        // Clean global commands
        await this.cleanupGlobalCommands();
        
        // Clean guild commands
        const allGuildIds = [...new Set([guildId, ...additionalGuildIds].filter(Boolean))];
        if (allGuildIds.length > 0) {
            await this.cleanupGuildCommands(allGuildIds);
        }
        
        this.logger.success('Complete cleanup finished!');
        this.logger.info('========================================');
        
        // Add a delay to ensure Discord's cache is updated
        this.logger.info('Waiting for Discord cache to update...');
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Register commands based on mode
    async registerCommands() {
        if (this.commands.length === 0) {
            this.logger.warn('No commands to register');
            return;
        }
        
        this.logger.info('========================================');
        this.logger.info(`Registering ${this.commands.length} commands in ${REGISTRATION_MODE} mode...`);
        this.logger.info('========================================');
        
        try {
            let data;
            
            if (REGISTRATION_MODE === 'GLOBAL') {
                // Register globally (available in all servers)
                this.logger.info('Registering commands GLOBALLY...');
                
                data = await this.rest.put(
                    Routes.applicationCommands(clientId),
                    { body: this.commands }
                );
                
                this.logger.success(`Successfully registered ${data.length} GLOBAL commands:`);
                data.forEach(cmd => {
                    this.logger.success(`  ✓ ${cmd.name} (ID: ${cmd.id})`);
                });
                
            } else if (REGISTRATION_MODE === 'GUILD' && guildId) {
                // Register only in specific guild (instant update)
                this.logger.info(`Registering commands in GUILD ${guildId}...`);
                
                data = await this.rest.put(
                    Routes.applicationGuildCommands(clientId, guildId),
                    { body: this.commands }
                );
                
                this.logger.success(`Successfully registered ${data.length} GUILD commands:`);
                data.forEach(cmd => {
                    this.logger.success(`  ✓ ${cmd.name} (ID: ${cmd.id})`);
                });
                
            } else {
                this.logger.error('Invalid registration mode or missing guild ID');
                throw new Error('Invalid registration configuration');
            }
            
            this.logger.info('========================================');
            this.logger.success('Command registration complete!');
            
        } catch (error) {
            this.logger.error(`Failed to register commands: ${error.message}`);
            throw error;
        }
    }

    // Main execution method
    async execute(options = {}) {
        try {
            const { cleanup = CLEANUP_BEFORE_REGISTER, additionalGuildIds = [] } = options;
            
            this.logger.info('Starting Command Manager...');
            this.logger.info(`Mode: ${REGISTRATION_MODE}, Cleanup: ${cleanup}`);
            
            // Load commands
            await this.loadCommands();
            
            if (this.commands.length === 0) {
                this.logger.error('No valid commands found to register');
                return;
            }
            
            // Perform cleanup if enabled
            if (cleanup) {
                await this.completeCleanup(additionalGuildIds);
            }
            
            // Register commands
            await this.registerCommands();
            
            // Summary
            this.logger.info('\n========================================');
            this.logger.info('SUMMARY:');
            this.logger.info(`  - Commands loaded: ${this.commands.length}`);
            this.logger.info(`  - Registration mode: ${REGISTRATION_MODE}`);
            this.logger.info(`  - Cleanup performed: ${cleanup ? 'Yes' : 'No'}`);
            this.logger.info('========================================\n');
            
        } catch (error) {
            this.logger.error(`Fatal error in Command Manager: ${error.message}`);
            process.exit(1);
        }
    }
}

// Utility function to clean specific guilds
async function cleanSpecificGuilds(guildIds) {
    const manager = new CommandManager();
    await manager.cleanupGuildCommands(guildIds);
}

// Utility function for emergency cleanup
async function emergencyCleanup() {
    const manager = new CommandManager();
    
    console.log('\n🚨 EMERGENCY CLEANUP MODE 🚨');
    console.log('This will remove ALL commands from EVERYWHERE');
    console.log('Press Ctrl+C to cancel...\n');
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await manager.completeCleanup();
    console.log('\n✅ Emergency cleanup complete!\n');
}

// Export for use in other files
export { CommandManager, cleanSpecificGuilds, emergencyCleanup };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    
    if (args.includes('--emergency-cleanup')) {
        emergencyCleanup();
    } else if (args.includes('--cleanup-only')) {
        const manager = new CommandManager();
        manager.completeCleanup().then(() => {
            console.log('Cleanup complete. No commands registered.');
        });
    } else {
        // Normal execution
        const manager = new CommandManager();
        manager.execute({
            cleanup: true,
            additionalGuildIds: [] // Add any additional guild IDs here if needed
        });
    }
}

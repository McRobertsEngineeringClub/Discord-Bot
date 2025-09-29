import { Client, GatewayIntentBits, Events } from "discord.js";
import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { loadBotCommands, setupInteractionHandlers } from './commandHandler.js'; // Import the new functions
import { closeEmailConnection } from './emailUtils.js';
// Load environment variables
dotenv.config({ path: ".env" });
// Validate critical environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'CLIENT_ID', 'PORT'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}
// Express server setup
const app = express();
const port = process.env.PORT || 10000;
app.get("/", (req, res) => {
  res.send("Discord bot is running!");
});
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
const server = app.listen(port, () => {
  console.log(`🌐 Server is running on port ${port}`);
});
// Self-ping for Render.com free tier (every 14 minutes)
if (process.env.NODE_ENV === 'production') {
  const RENDER_URL = process.env.RENDER_URL || "https://mcroberts-engineering-club-discord-bot.onrender.com";
  
  setInterval(async () => {
    try {
      const response = await fetch(`${RENDER_URL}/health`);
      const data = await response.json();
      console.log(`🏓 Keep-alive ping: ${data.timestamp}`);
    } catch (error) {
      console.error(`❌ Keep-alive ping failed:`, error.message);
    }
  }, 14 * 60 * 1000); // 14 minutes
}
// Discord Client Configuration
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
});
// Load commands into client.commands
loadBotCommands(client);
// Setup interaction handlers
setupInteractionHandlers(client);
// Introduction channel auto-role assignment
const INTRODUCTION_CHANNEL_ID = process.env.INTRODUCTION_CHANNEL_ID;
if (INTRODUCTION_CHANNEL_ID) {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    // Check for encourage command
    const encourageCommand = client.commands?.get("encourage");
    if (encourageCommand?.checkMessage) {
      await encourageCommand.checkMessage(message);
    }
    // Auto role assignment in introduction channel
    if (message.channel.id === INTRODUCTION_CHANNEL_ID) {
      const content = message.content.toLowerCase();
      const gradeMatch = content.match(/(\d+)/);
      const membershipRole = message.guild.roles.cache.find(
        (role) => role.name.toLowerCase() === "members"
      );
      // Assign grade role if mentioned
      if (gradeMatch) {
        const grade = parseInt(gradeMatch[1]);
        const gradeRole = message.guild.roles.cache.find(
          (role) => role.name.toLowerCase() === `${grade}`
        );
        if (gradeRole) {
          try {
            await message.member.roles.add(gradeRole);
            console.log(`✅ Assigned Grade ${grade} role to ${message.author.tag}`);
          } catch (error) {
            console.error(`❌ Error assigning Grade ${grade} role:`, error.message);
          }
        }
      }
      // Assign member role
      if (membershipRole) {
        try {
          await message.member.roles.add(membershipRole);
          console.log(`✅ Assigned Member role to ${message.author.tag}`);
        } catch (error) {
          console.error("❌ Error assigning Member role:", error.message);
        }
      }
      // React to acknowledge
      await message.react("👋").catch(console.error);
    }
  });
}
// Error handling
client.on(Events.Error, (error) => {
  console.error('❌ Discord client error:', error);
});
client.on(Events.Warn, (warning) => {
  console.warn('⚠️ Discord warning:', warning);
});
// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  
  client.destroy();
  closeEmailConnection();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
// Login to Discord
console.log("🔄 Attempting to login to Discord...");
client
  .login(process.env.DISCORD_TOKEN)
  .then(() => {
    console.log("✅ Discord login successful!");
  })
  .catch((error) => {
    console.error("❌ Failed to login to Discord:", error.message);
    process.exit(1);
  });

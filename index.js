import express from "express"
import dotenv from "dotenv"
import fetch from "node-fetch"
import { startBot, client } from "./bot.js"
import { closeEmailConnection } from "./emailUtils.js"

// Load environment variables based on NODE_ENV set by cross-env in package.json
// For local development, NODE_ENV is 'development', so .local.env will be loaded.
// For production, NODE_ENV is 'production', so .env will be loaded.
const envPath = process.env.NODE_ENV === "development" ? ".local.env" : ".env"
dotenv.config({ path: envPath })

console.log(`DEBUG: index.js loading environment variables from: ${envPath}`)
console.log("DEBUG: DISCORD_TOKEN is", process.env.DISCORD_TOKEN ? "set" : "not set")
console.log("DEBUG: CLIENT_ID is", process.env.CLIENT_ID ? "set" : "not set")
console.log("DEBUG: PORT is", process.env.PORT ? "set" : "not set")

// Validate critical environment variables
const requiredEnvVars = ["DISCORD_TOKEN", "CLIENT_ID", "PORT"]
const missingVars = requiredEnvVars.filter((v) => !process.env[v])
if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(", ")}`)
  process.exit(1)
}

const app = express()
const port = process.env.PORT || 10000

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get("/", (req, res) => {
  res.send("Bot is running!")
})

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

const server = app.listen(port, () => {
  console.log(`🌐 Server is running on port ${port}`)

  startBot()
})

// Self-ping for Render.com free tier (every 14 minutes)
if (process.env.NODE_ENV === "production") {
  const RENDER_URL = process.env.RENDER_URL || "https://mcroberts-engineering-club-discord-bot.onrender.com"
  setInterval(
    async () => {
      try {
        const response = await fetch(`${RENDER_URL}/health`)
        const data = await response.json()
        console.log(`🏓 Keep-alive ping: ${data.timestamp}`)
      } catch (error) {
        console.error(`❌ Keep-alive ping failed:`, error.message)
      }
    },
    14 * 60 * 1000,
  )
}

process.on("SIGTERM", async () => {
  console.log("🛑 SIGTERM received, shutting down gracefully...")
  client.destroy()
  closeEmailConnection()
  server.close(() => {
    console.log("✅ Server closed")
    process.exit(0)
  })
})

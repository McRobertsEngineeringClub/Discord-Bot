import express from "express"
import dotenv from "dotenv"
import fetch from "node-fetch"
import { startBot, client } from "./bot.js"
import { closeEmailConnection } from "./emailUtils.js"

const envPath = process.env.NODE_ENV === "development" ? ".local.env" : ".env"
dotenv.config({ path: envPath })

console.log("=== Environment Variables Check ===")
console.log("NODE_ENV:", process.env.NODE_ENV || "not set")
console.log(
  "DISCORD_TOKEN:",
  process.env.DISCORD_TOKEN ? `set (${process.env.DISCORD_TOKEN.length} chars)` : "❌ NOT SET",
)
console.log("CLIENT_ID:", process.env.CLIENT_ID || "❌ NOT SET")
console.log("PORT:", process.env.PORT || "❌ NOT SET")
console.log("===================================")

const requiredEnvVars = ["DISCORD_TOKEN", "CLIENT_ID"]
const missingVars = requiredEnvVars.filter((v) => !process.env[v])
if (missingVars.length > 0) {
  console.error(`\n❌ CRITICAL ERROR: Missing required environment variables: ${missingVars.join(", ")}`)
  console.error("\n📝 On OnRender, set these in: Dashboard → Your Service → Environment")
  console.error("   Required variables:")
  console.error("   - DISCORD_TOKEN (your bot token from Discord Developer Portal)")
  console.error("   - CLIENT_ID (your bot's application ID)")
  console.error("   - GUILD_ID (your Discord server ID)")
  console.error("   - EMAIL_FROM (Gmail address)")
  console.error("   - EMAIL_PASSWORD (Gmail app password)")
  console.error("   - GOOGLE_SHEETS_ID (your spreadsheet ID)")
  console.error("   - Plus all GOOGLE_* service account variables\n")
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

if (process.env.NODE_ENV === "production") {
  const RENDER_URL = process.env.RENDER_URL || "https://discord-bot-vf1d.onrender.com"
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

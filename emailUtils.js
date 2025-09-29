import { google } from "googleapis";
import nodemailer from "nodemailer";

// Cache for Google Sheets auth to avoid repeated authentication
let cachedAuth = null;

// Get authenticated Google Sheets client
async function getGoogleAuth() {
  if (cachedAuth) return cachedAuth;

  const requiredEnvVars = [
    'GOOGLE_SHEETS_ID',
    'GOOGLE_CLIENT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_PROJECT_ID'
  ];
  const missingVars = requiredEnvVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    throw new Error(`Missing Google Sheets environment variables: ${missingVars.join(', ')}`);
  }

  cachedAuth = new google.auth.GoogleAuth({
    credentials: {
      type: "service_account",
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return cachedAuth;
}

// Read club emails from Google Sheets with timeout
export async function getClubEmails(timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const auth = await getGoogleAuth();
    const sheets = google.sheets({ version: "v4", auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: `'Sheet1'!B:B`, // Fixed sheet name as requested
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const emails = response.data.values
      ?.flat()
      .filter((email) => email && email.includes("@"))
      .filter((email, index, arr) => arr.indexOf(email) === index);
    console.log(`📧 Found ${emails?.length || 0} unique emails`);
    return emails || [];
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('Google Sheets request timeout');
    }
    
    console.error("❌ Error fetching emails:", error.message);
    throw error;
  }
}

// Create reusable transporter with connection pooling
let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_FROM,
        pass: process.env.EMAIL_PASSWORD
      },
      pool: true, // Enable connection pooling
      maxConnections: 5,
      maxMessages: 10,
      socketTimeout: 30000, // 30 second timeout
      greetingTimeout: 30000,
      connectionTimeout: 30000
    });
  }
  return transporter;
}

// Enhanced email sending with better error handling
export async function sendEmails(subject, content, toEmails, options = {}) {
  const {
    retries = 3,
    retryDelay = 2000,
    batchSize = 50, // Send in batches to avoid rate limits
    delayBetweenBatches = 1000
  } = options;

  if (!toEmails || toEmails.length === 0) {
    throw new Error("No email recipients provided");
  }

  const transporter = getTransporter();
  
  // Split emails into batches
  const batches = [];
  for (let i = 0; i < toEmails.length; i += batchSize) {
    batches.push(toEmails.slice(i, i + batchSize));
  }

  console.log(`📬 Sending emails to ${toEmails.length} recipients in ${batches.length} batch(es)`);

  const results = {
    successful: 0,
    failed: [],
    errors: []
  };

  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    let attempt = 0;
    let success = false;

    while (attempt < retries && !success) {
      try {
        attempt++;
        
        // Verify transporter connection
        await transporter.verify();
        
        // Send email
        const info = await transporter.sendMail({
          from: `"Engineering Club" <${process.env.EMAIL_FROM}>`,
          bcc: batch.join(","),
          subject: subject,
          text: content,
          html: formatEmailContent(content)
        });

        results.successful += batch.length;
        success = true;
        
        console.log(`✅ Batch ${batchIndex + 1}/${batches.length} sent successfully`);
        
        // Delay between batches to avoid rate limits
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      } catch (error) {
        console.error(`❌ Attempt ${attempt}/${retries} failed for batch ${batchIndex + 1}:`, error.message);
        
        if (attempt < retries) {
          console.log(`⏳ Retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        } else {
          results.failed.push(...batch);
          results.errors.push({
            batch: batchIndex + 1,
            error: error.message
          });
        }
      }
    }
  }

  // Log final results
  if (results.successful > 0) {
    console.log(`✅ Successfully sent emails to ${results.successful} recipients`);
  }
  
  if (results.failed.length > 0) {
    console.error(`❌ Failed to send to ${results.failed.length} recipients`);
  }

  return results;
}

// Format content for HTML email
function formatEmailContent(content) {
  return content
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>");
}

// Cleanup function to close transporter
export function closeEmailConnection() {
  if (transporter) {
    transporter.close();
    transporter = null;
  }
}

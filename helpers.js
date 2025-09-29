import { google } from "googleapis";
import nodemailer from "nodemailer";

// Read club emails from Google Sheets
export async function getClubEmails() {
  try {
    if (!process.env.GOOGLE_SHEETS_ID || !process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      throw new Error("Missing Google Sheets environment variables")
    }

    const auth = new google.auth.GoogleAuth({
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
    })

    const sheets = google.sheets({ version: "v4", auth })
    const sheetName = "Sheet1"; // Use a static sheet name as per user request

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: `'${sheetName}'!B:B`,
    })

    const emails = response.data.values
      ?.flat()
      .filter((email) => email && email.includes("@"))
      .filter((email, index, arr) => arr.indexOf(email) === index)

    return emails || []
  } catch (error) {
    console.error("Error fetching emails:", error)
    throw error
  }
}

// Robust email sending with error handling (and retry, if you want)
export async function sendEmails(subject, content, toEmails, retries = 1) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_FROM, pass: process.env.EMAIL_PASSWORD },
  });
  try {
    await transporter.verify();
    await transporter.sendMail({
      from: `"Your Club" <${process.env.EMAIL_FROM}>`,
      bcc: toEmails.join(","), // Join emails with a comma
      subject,
      text: content,
      html: content.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>"), // Convert markdown to HTML
    });
  } catch (err) {
    if (retries > 0) {
      console.warn("Email failed, retrying...", err.message);
      await new Promise(res => setTimeout(res, 2500));
      return sendEmails(subject, content, toEmails, retries - 1);
    }
    throw new Error("Email send failed after retries: " + err.message);
  }
}

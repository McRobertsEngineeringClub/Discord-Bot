import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables based on NODE_ENV
const envPath = process.env.NODE_ENV === 'development' ? '.local.env' : '.env';
dotenv.config({ path: envPath });

console.log(`DEBUG: emailUtils.js loading environment variables from: ${envPath}`);
console.log("DEBUG: EMAIL_FROM is", process.env.EMAIL_FROM ? "set" : "not set");
console.log("DEBUG: GOOGLE_SHEETS_ID is", process.env.GOOGLE_SHEETS_ID ? "set" : "not set");

// Create reusable transporter
let transporter = null;

function getTransporter() {
    if (!transporter) {
        if (!process.env.EMAIL_FROM || !process.env.EMAIL_PASSWORD) {
            console.error('ERROR: EMAIL_FROM or EMAIL_PASSWORD is not set for Nodemailer.');
            // Fallback for development if not critical, or throw error to stop.
            if (process.env.NODE_ENV !== 'production') {
                console.warn('⚠️ Nodemailer will not send emails without EMAIL_FROM/EMAIL_PASSWORD. Continuing in dev mode.');
                return null; // Return null transporter in dev if credentials missing
            } else {
                throw new Error('Missing EMAIL_FROM or EMAIL_PASSWORD in production.');
            }
        }

        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_FROM,
                pass: process.env.EMAIL_PASSWORD
            },
            pool: true,
            maxConnections: 5,
            maxMessages: 100
        });
    }
    return transporter;
}

// Google Sheets authentication
async function authenticateGoogle() {
    // Validate required Google Sheets environment variables
    const requiredGoogleEnvVars = [
        'GOOGLE_PROJECT_ID', 'GOOGLE_PRIVATE_KEY_ID',
        'GOOGLE_PRIVATE_KEY', 'GOOGLE_CLIENT_EMAIL', 'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_CERT_URL'
    ];

    const missingGoogleVars = requiredGoogleEnvVars.filter(v => !process.env[v]);
    if (missingGoogleVars.length > 0) {
        console.error(`ERROR: Missing Google Sheets API environment variables: ${missingGoogleVars.join(', ')}`);
        throw new Error('Missing Google Sheets API environment variables.');
    }

    const auth = new google.auth.GoogleAuth({
        credentials: {
            type: "service_account", // Assuming type is always service_account based on provided keys
            project_id: process.env.GOOGLE_PROJECT_ID,
            private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
            // Replace escaped newlines with actual newlines
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            client_id: process.env.GOOGLE_CLIENT_ID,
            // Use the original client cert URL
            client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    return await auth.getClient();
}

// Get email list from Google Sheets
async function getEmailList() {
    try {
        if (!process.env.GOOGLE_SHEETS_ID) {
            console.error('ERROR: GOOGLE_SHEETS_ID is not set. Cannot fetch email list.');
            return [];
        }

        const auth = await authenticateGoogle();
        const sheets = google.sheets({ version: 'v4', auth });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.GOOGLE_SHEETS_ID,
            range: 'B:B', // Read from Column B
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            console.log('No data found in column B.');
            return [];
        }

        // Filter out header and empty cells, validate emails
        const emails = rows
            .slice(1) // Skip header row
            .flat()
            .filter(email => email && typeof email === 'string' && email.includes('@'))
            .map(email => email.trim().toLowerCase());

        console.log(`Found ${emails.length} valid email addresses from Google Sheets`);
        return emails;
    } catch (error) {
        console.error('❌ Error fetching emails from Google Sheets:', error);
        // Fallback: return empty array or test emails
        if (process.env.NODE_ENV === 'development') {
            console.log('Using test email for development due to Google Sheets error.');
            return ['test@example.com']; // Test email for development
        }
        return [];
    }
}

// Send emails with BCC
async function sendEmails(subject, htmlContent, emailList) {
    const transporter = getTransporter();

    if (!transporter) {
        console.error('❌ Email transporter not initialized due to missing credentials or other error.');
        throw new Error('Email transporter not ready.');
    }

    if (!emailList || emailList.length === 0) {
        console.log('No email addresses provided to send to.');
        return { successful: [], failed: [] };
    }

    try {
        const mailOptions = {
            from: `"Engineering Club Announcements" <${process.env.EMAIL_FROM}>`,
            to: process.env.EMAIL_FROM, // Send to yourself to avoid issues with empty 'to' and all BCC
            bcc: emailList.join(', '), // All recipients in BCC
            subject: subject,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">${subject}</h2>
                    <div style="padding: 20px; background-color: #f5f5f5; border-radius: 5px;">
                        ${htmlContent.replace(/\n/g, '<br>')}
                    </div>
                    <footer style="margin-top: 20px; font-size: 12px; color: #666;">
                        <p>This is an automated message. Please do not reply to this email.</p>
                    </footer>
                </div>
            `
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent to ${emailList.length} recipients via BCC. Message ID: ${info.messageId}`);

        return {
            successful: emailList,
            failed: []
        };
    } catch (error) {
        console.error('❌ Error sending emails:', error);
        throw error;
    }
}

// Cleanup function to close transporter
function closeEmailConnection() {
    if (transporter) {
        transporter.close();
        transporter = null;
        console.log('📧 Email transporter closed.');
    }
}

// Export all functions using ES Module syntax
export { getEmailList, sendEmails, closeEmailConnection };
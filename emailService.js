// ============================================
// Email Service - Send Invitation Emails
// ============================================

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// Gmail SMTP Configuration - Using SSL port 465 (more reliable)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465, // SSL port
  secure: true, // Use SSL
  auth: {
    user: process.env.GMAIL_USER || process.env.EMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASSWORD,
  },
  tls: {
    // Do not fail on invalid certificates
    rejectUnauthorized: false
  },
  connectionTimeout: 30000, // 30 second timeout
  greetingTimeout: 30000,
  socketTimeout: 30000,
});

// Verify transporter configuration
if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ Email service error:', error.message);
    } else {
      console.log('✅ Email service ready');
    }
  });
}

/**
 * Send organization invitation email
 * @param {Object} options
 * @param {string} options.to - Recipient email
 * @param {string} options.inviterName - Name of person sending invite
 * @param {string} options.orgName - Organization name
 * @param {string} options.inviteLink - Invitation acceptance link
 * @param {string} options.role - Role being invited to (optional)
 */
export async function sendInvitationEmail({ to, inviterName, orgName, inviteLink, role = 'member' }) {
  const emailTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Join ${orgName} on Panlo</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <!-- Header -->
  <div style="text-align: center; padding: 30px 0; border-bottom: 3px solid #4F46E5;">
    <h1 style="margin: 0; color: #4F46E5; font-size: 32px;">🗂️ Panlo</h1>
    <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;">Your AI-Powered Knowledge Assistant</p>
  </div>

  <!-- Main Content -->
  <div style="padding: 40px 20px;">
    <h2 style="color: #1F2937; margin-bottom: 20px;">You've been invited to join ${orgName}</h2>
    
    <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
      <strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> on Panlo as a <strong>${role}</strong>.
    </p>

    <p style="font-size: 15px; color: #4B5563; margin-bottom: 30px;">
      Panlo helps teams collaborate and search through their shared documents using AI. 
      Accept this invitation to start working with your team.
    </p>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 40px 0;">
      <a href="${inviteLink}" 
         style="background-color: #4F46E5; 
                color: white; 
                padding: 14px 32px; 
                text-decoration: none; 
                border-radius: 8px; 
                font-weight: 600;
                font-size: 16px;
                display: inline-block;
                box-shadow: 0 4px 6px rgba(79, 70, 229, 0.2);">
        Accept Invitation
      </a>
    </div>

    <p style="font-size: 14px; color: #6B7280; margin-top: 30px;">
      Or copy and paste this link into your browser:
    </p>
    <p style="font-size: 14px; 
               color: #4F46E5; 
               background-color: #F3F4F6; 
               padding: 12px; 
               border-radius: 6px; 
               word-break: break-all;">
      ${inviteLink}
    </p>

    <!-- What You'll Get -->
    <div style="margin-top: 40px; padding: 20px; background-color: #F9FAFB; border-radius: 8px; border-left: 4px solid #4F46E5;">
      <h3 style="margin-top: 0; color: #1F2937; font-size: 18px;">What you'll get:</h3>
      <ul style="margin: 10px 0; padding-left: 20px; color: #374151;">
        <li>Access to ${orgName}'s shared documents and knowledge base</li>
        <li>AI-powered search across all team files</li>
        <li>Collaborate with team members in real-time</li>
        <li>Secure, role-based access control</li>
      </ul>
    </div>
  </div>

  <!-- Footer -->
  <div style="border-top: 1px solid #E5E7EB; padding: 30px 20px; text-align: center;">
    <p style="font-size: 13px; color: #9CA3AF; margin: 0 0 10px 0;">
      This invitation was sent by ${inviterName} from ${orgName}
    </p>
    <p style="font-size: 13px; color: #9CA3AF; margin: 0 0 15px 0;">
      If you weren't expecting this invitation, you can safely ignore this email.
    </p>
    <p style="font-size: 12px; color: #D1D5DB; margin: 0;">
      © ${new Date().getFullYear()} Panlo. All rights reserved.
    </p>
  </div>

</body>
</html>
  `;

  const textContent = `
You've been invited to join ${orgName} on Panlo

${inviterName} has invited you to join ${orgName} as a ${role}.

Panlo helps teams collaborate and search through their shared documents using AI.

Accept your invitation: ${inviteLink}

What you'll get:
• Access to ${orgName}'s shared documents and knowledge base
• AI-powered search across all team files
• Collaborate with team members in real-time
• Secure, role-based access control

This invitation was sent by ${inviterName} from ${orgName}.
If you weren't expecting this invitation, you can safely ignore this email.

© ${new Date().getFullYear()} Panlo. All rights reserved.
  `.trim();

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Panlo" <noreply@panlo.ai>',
      to,
      subject: `${inviterName} invited you to join ${orgName} on Panlo`,
      text: textContent,
      html: emailTemplate,
    });

    console.log('✅ Invitation email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send invitation email:', error);
    throw error;
  }
}

/**
 * Send welcome email to new user
 */
export async function sendWelcomeEmail({ to, name, orgName }) {
  const emailTemplate = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Panlo</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="text-align: center; padding: 30px 0;">
    <h1 style="margin: 0; color: #4F46E5; font-size: 32px;">🗂️ Welcome to Panlo!</h1>
  </div>

  <div style="padding: 20px;">
    <h2 style="color: #1F2937;">Hi ${name},</h2>
    
    <p style="font-size: 16px; color: #374151;">
      Welcome to Panlo! Your account has been created and your organization <strong>${orgName}</strong> is ready.
    </p>

    <p style="font-size: 15px; color: #4B5563;">
      Here's how to get started:
    </p>

    <ol style="color: #374151; line-height: 1.8;">
      <li><strong>Add your first folder</strong> - Watch folders to index your documents</li>
      <li><strong>Invite your team</strong> - Collaborate with team members</li>
      <li><strong>Start chatting</strong> - Ask questions about your files with AI</li>
    </ol>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${process.env.APP_URL || 'http://localhost:3000'}" 
         style="background-color: #4F46E5; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
        Open Panlo
      </a>
    </div>
  </div>

  <div style="border-top: 1px solid #E5E7EB; padding: 20px; text-align: center;">
    <p style="font-size: 12px; color: #9CA3AF;">
      Need help? Reply to this email or visit our support center.
    </p>
  </div>

</body>
</html>
  `;

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Panlo" <noreply@panlo.ai>',
      to,
      subject: `Welcome to Panlo, ${name}!`,
      html: emailTemplate,
    });

    console.log('✅ Welcome email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error);
    throw error;
  }
}

export default {
  sendInvitationEmail,
  sendWelcomeEmail,
};


// services/emailService.js
import nodemailer from 'nodemailer';
import { config } from '../config/config.js';

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: config.emailUser, // your email
    pass: config.emailPassword // app password
  }
});

// Professional invitation email template
export const sendInvitationEmail = async (inviterName, inviteeEmail, inviteeName, credentials, projectDetails) => {
  const loginLink = `${config.frontendUrl}/login?email=${encodeURIComponent(credentials.email)}&prefill=true`;

  const mailOptions = {
    from: `"${projectDetails.companyName || 'AI Assistant Platform'}" <${config.emailUser}>`,
    to: inviteeEmail,
    subject: `🎉 ${inviterName} has invited you to collaborate on ${projectDetails.projectName || 'AI Assistant Project'}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .credentials { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
          .footer { text-align: center; color: #666; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; }
          .highlight { color: #667eea; font-weight: bold; }
          .warning { background: #fff3cd; color: #856404; padding: 10px; border-radius: 5px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚀 You're Invited to Collaborate!</h1>
          </div>
          
          <div class="content">
            <h2>Hello ${inviteeName}! 👋</h2>
            
            <p>Great news! <strong>${inviterName}</strong> has invited you to collaborate on their exciting project:</p>
            
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #667eea; margin-top: 0;">📌 ${projectDetails.projectName || 'AI Assistant Integration Project'}</h3>
              <p>${projectDetails.description || 'Join us to build an amazing AI-powered customer support assistant that will revolutionize customer interactions.'}</p>
            </div>
            
            <p>We're thrilled to have you join our team! Your expertise and collaboration will be invaluable to the success of this project.</p>
            
            <div class="credentials">
              <h3 style="margin-top: 0;">🔐 Your Account Credentials</h3>
              <p>We've created an account for you. Here are your login details:</p>
              <p><strong>Email:</strong> <span class="highlight">${credentials.email}</span></p>
              <p><strong>Temporary Password:</strong> <span class="highlight">${credentials.password}</span></p>
              <p style="font-size: 12px; color: #666;">⚠️ Please change your password after first login for security.</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${loginLink}" class="button" style="color: white;">
                ✨ Accept Invitation & Login
              </a>
            </div>
            
            <div class="warning">
              <strong>📝 Important:</strong> This invitation will expire in 7 days. Please accept it before then to secure your access.
            </div>
            
            <h3>What happens next?</h3>
            <ul>
              <li>Click the "Accept Invitation" button above</li>
              <li>You'll be redirected to the login page with your email pre-filled</li>
              <li>Enter the temporary password provided above</li>
              <li>Complete your profile setup</li>
              <li>Start collaborating with the team!</li>
            </ul>
            
            <h3>Why join us?</h3>
            <ul>
              <li>✅ Access to cutting-edge AI assistant technology</li>
              <li>✅ Real-time collaboration tools</li>
              <li>✅ Comprehensive analytics dashboard</li>
              <li>✅ 24/7 support from our team</li>
              <li>✅ Regular feature updates and improvements</li>
            </ul>
            
            <p>If you have any questions or need assistance, feel free to reach out to ${inviterName} or our support team.</p>
            
            <p>Looking forward to having you on board!</p>
            
            <p>Best regards,<br>
            <strong>The ${projectDetails.companyName || 'AI Assistant'} Team</strong></p>
          </div>
          
          <div class="footer">
            <p>This invitation was sent to ${inviteeEmail} by ${inviterName}.</p>
            <p>If you didn't expect this invitation, please ignore this email.</p>
            <p>© 2024 ${projectDetails.companyName || 'AI Assistant Platform'}. All rights reserved.</p>
            <p style="margin-top: 10px;">
              <a href="${config.frontendUrl}/privacy" style="color: #667eea; text-decoration: none;">Privacy Policy</a> | 
              <a href="${config.frontendUrl}/terms" style="color: #667eea; text-decoration: none;">Terms of Service</a>
            </p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  await transporter.sendMail(mailOptions);
};
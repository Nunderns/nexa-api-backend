import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly logger = new Logger(EmailService.name);
  private readonly fromEmail: string;
  private readonly appUrl: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'RESEND_API_KEY not configured, email sending will be disabled',
      );
    }
    this.resend = new Resend(apiKey);
    this.fromEmail =
      this.configService.get<string>('EMAIL_FROM') || 'noreply@nexa.local';
    this.appUrl =
      this.configService.get<string>('APP_URL') || 'http://localhost:3000';
  }

  async sendEmail(to: string, template: EmailTemplate): Promise<boolean> {
    if (!this.configService.get<string>('RESEND_API_KEY')) {
      this.logger.debug(
        `Email sending disabled (no RESEND_API_KEY). Would send to ${to}: ${template.subject}`,
      );
      return true;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: [to],
        subject: template.subject,
        html: template.html,
        text: template.text,
      });

      if (error) {
        const message = error?.message ?? JSON.stringify(error);
        this.logger.error(`Failed to send email to ${to}: ${message}`);
        return false;
      }

      this.logger.log(`Email sent successfully to ${to} (id: ${data?.id})`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Exception sending email to ${to}: ${message}`);
      return false;
    }
  }

  generateConfirmationTemplate(token: string, username: string): EmailTemplate {
    const confirmationUrl = `${this.appUrl}/auth/confirm-email?token=${token}`;

    const subject = 'Confirm your email address';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm your email address</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; border-radius: 8px; padding: 40px;">
    <h1 style="color: #1a1a2e; margin-top: 0; margin-bottom: 24px;">Welcome to Nexa, ${username}!</h1>
    
    <p style="font-size: 16px; margin-bottom: 24px;">Thanks for creating an account. Please confirm your email address by clicking the button below:</p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${confirmationUrl}" style="display: inline-block; background: #1a1a2e; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;">
        Confirm Email Address
      </a>
    </div>
    
    <p style="font-size: 14px; color: #666; margin-bottom: 8px;">Or copy and paste this link into your browser:</p>
    <p style="font-size: 13px; color: #999; word-break: break-all; background: #f1f1f1; padding: 12px; border-radius: 4px; font-family: monospace;">
      ${confirmationUrl}
    </p>
    
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 32px 0;">
    
    <p style="font-size: 13px; color: #999; margin-bottom: 8px;">This link will expire in 24 hours.</p>
    <p style="font-size: 13px; color: #999; margin-bottom: 0;">If you didn't create an account, you can safely ignore this email.</p>
  </div>
  
  <div style="text-align: center; margin-top: 24px; font-size: 12px; color: #999;">
    <p>&copy; ${new Date().getFullYear()} Nexa. All rights reserved.</p>
  </div>
</body>
</html>
`;

    const text = `
Welcome to Nexa, ${username}!

Thanks for creating an account. Please confirm your email address by visiting this link:

${confirmationUrl}

This link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.

© ${new Date().getFullYear()} Nexa. All rights reserved.
`;

    return { subject, html, text };
  }

  async sendConfirmationEmail(
    email: string,
    username: string,
    token: string,
  ): Promise<boolean> {
    const template = this.generateConfirmationTemplate(token, username);
    return this.sendEmail(email, template);
  }
}

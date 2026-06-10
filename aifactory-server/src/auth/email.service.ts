import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendVerificationCode(email: string, code: string) {
    const appName = this.config.get<string>('APP_NAME') || 'Agent Craft';
    const subject = `${appName} verification code`;
    const text = `Your ${appName} verification code is ${code}. It expires in 10 minutes.`;
    const html = [
      `<p>Your <strong>${appName}</strong> verification code is:</p>`,
      `<p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p>`,
      '<p>This code expires in 10 minutes.</p>',
    ].join('');

    if (this.isResendConfigured()) {
      await this.sendWithResend({ email, subject, text, html });
      return;
    }

    if (this.isSmtpConfigured()) {
      await this.sendWithSmtp({ email, subject, text, html });
      return;
    }

    if (!this.isSmtpConfigured()) {
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException('Email service is not configured');
      }

      this.logger.warn(`Email verification code for ${email}: ${code}`);
      return;
    }
  }

  private async sendWithResend(message: { email: string; subject: string; text: string; html: string }) {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('Resend API key is not configured');
    }

    const resend = new Resend(apiKey);
    const from =
      this.config.get<string>('RESEND_FROM') ||
      this.config.get<string>('SMTP_FROM') ||
      'Agent Craft <onboarding@resend.dev>';

    const result = await resend.emails.send({
      from,
      to: message.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    if (result.error) {
      this.logger.warn(`Resend email failed: ${result.error.message}`);
      throw new ServiceUnavailableException('Email service failed to send verification code');
    }
  }

  private async sendWithSmtp(message: { email: string; subject: string; text: string; html: string }) {
    const transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port: Number(this.config.get<string>('SMTP_PORT') || 587),
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });

    const from = this.config.get<string>('SMTP_FROM') || this.config.get<string>('SMTP_USER');

    await transporter.sendMail({
      from,
      to: message.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  private isResendConfigured() {
    return Boolean(this.config.get<string>('RESEND_API_KEY')?.trim());
  }

  private isSmtpConfigured() {
    return Boolean(
      this.config.get<string>('SMTP_HOST') &&
      this.config.get<string>('SMTP_USER') &&
      this.config.get<string>('SMTP_PASS'),
    );
  }
}

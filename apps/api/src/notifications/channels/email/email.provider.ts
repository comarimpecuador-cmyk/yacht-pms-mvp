import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma.service';
import { NotificationChannelProvider, SendNotificationInput } from '../channel.types';

type DirectEmailInput = {
  toEmail: string;
  toName?: string;
  type: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class EmailProvider implements NotificationChannelProvider {
  channel: 'email' = 'email';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async send(input: SendNotificationInput) {
    const providerCheck = this.validateProviderEnabled();
    if (providerCheck.status !== 'ready') {
      return providerCheck.result;
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, fullName: true, isActive: true },
    });

    if (!recipient?.isActive || !recipient.email) {
      return { status: 'failed' as const, error: 'recipient_not_found_or_inactive' };
    }

    return this.sendViaBrevo({
      toEmail: recipient.email,
      toName: recipient.fullName,
      subject: this.pickText(input.payload, ['title']) ?? `Yacht PMS - ${input.type}`,
      htmlContent:
        this.pickText(input.payload, ['htmlContent']) ??
        this.buildDefaultHtml(input.payload, 'You have an operational notification in Yacht PMS.'),
    });
  }

  async sendDirect(input: DirectEmailInput) {
    const providerCheck = this.validateProviderEnabled();
    if (providerCheck.status !== 'ready') {
      return providerCheck.result;
    }

    return this.sendViaBrevo({
      toEmail: input.toEmail,
      toName: input.toName,
      subject: this.pickText(input.payload, ['title']) ?? `Yacht PMS - ${input.type}`,
      htmlContent:
        this.pickText(input.payload, ['htmlContent']) ??
        this.buildDefaultHtml(input.payload, 'You have an operational notification in Yacht PMS.'),
    });
  }

  private validateProviderEnabled():
    | { status: 'ready' }
    | {
        status: 'blocked';
        result: { status: 'skipped'; reason: string } | { status: 'failed'; error: string };
      } {
    const provider = this.configService.get<string>('EMAIL_PROVIDER', 'disabled').toLowerCase();
    const enabled = this.configService.get<string>('EMAIL_ENABLED', 'false') === 'true';

    if (!enabled) {
      return { status: 'blocked', result: { status: 'skipped', reason: 'email_disabled' } };
    }

    if (provider !== 'brevo') {
      return {
        status: 'blocked',
        result: { status: 'failed', error: `unsupported_email_provider:${provider}` },
      };
    }

    return { status: 'ready' };
  }

  private async sendViaBrevo(input: {
    toEmail: string;
    toName?: string;
    subject: string;
    htmlContent: string;
  }) {
    const apiKey = this.configService.get<string>('BREVO_API_KEY', '').trim();
    const fromEmail = this.configService.get<string>('EMAIL_FROM', '').trim();
    const fromName = this.configService.get<string>('EMAIL_FROM_NAME', 'Yacht PMS').trim();

    if (!apiKey) {
      return { status: 'failed' as const, error: 'brevo_api_key_missing' };
    }
    if (!fromEmail) {
      return { status: 'failed' as const, error: 'email_from_missing' };
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: input.toEmail, name: input.toName || undefined }],
        subject: input.subject,
        htmlContent: input.htmlContent,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { status: 'failed' as const, error: `brevo_error:${response.status}:${body.slice(0, 160)}` };
    }

    return { status: 'sent' as const };
  }

  private pickText(payload: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  }

  private buildDefaultHtml(payload: Record<string, unknown>, fallbackMessage: string) {
    const message = this.pickText(payload, ['message', 'description']) ?? fallbackMessage;
    return `<p>${this.escapeHtml(message)}</p>`;
  }

  private escapeHtml(input: string) {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

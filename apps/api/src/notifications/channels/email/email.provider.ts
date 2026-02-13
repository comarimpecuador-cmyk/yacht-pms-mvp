import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma.service';
import { NotificationChannelProvider, SendNotificationInput } from '../channel.types';

@Injectable()
export class EmailProvider implements NotificationChannelProvider {
  channel: 'email' = 'email';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async send(input: SendNotificationInput) {
    const provider = this.configService.get<string>('EMAIL_PROVIDER', 'disabled').toLowerCase();
    const enabled = this.configService.get<string>('EMAIL_ENABLED', 'false') === 'true';

    if (!enabled) {
      return { status: 'skipped' as const, reason: 'email_disabled' };
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, fullName: true, isActive: true },
    });

    if (!recipient?.isActive || !recipient.email) {
      return { status: 'failed' as const, error: 'recipient_not_found_or_inactive' };
    }

    if (provider === 'brevo') {
      return this.sendViaBrevo(input, recipient.email, recipient.fullName);
    }

    return { status: 'failed' as const, error: `unsupported_email_provider:${provider}` };
  }

  private async sendViaBrevo(input: SendNotificationInput, toEmail: string, toName?: string) {
    const apiKey = this.configService.get<string>('BREVO_API_KEY', '').trim();
    const fromEmail = this.configService.get<string>('EMAIL_FROM', '').trim();
    const fromName = this.configService.get<string>('EMAIL_FROM_NAME', 'Yacht PMS').trim();

    if (!apiKey) {
      return { status: 'failed' as const, error: 'brevo_api_key_missing' };
    }
    if (!fromEmail) {
      return { status: 'failed' as const, error: 'email_from_missing' };
    }

    const title = this.pickText(input.payload, ['title']) ?? `Yacht PMS · ${input.type}`;
    const message =
      this.pickText(input.payload, ['message', 'description']) ??
      'Tienes una nueva notificacion operativa.';

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender: { email: fromEmail, name: fromName },
        to: [{ email: toEmail, name: toName || undefined }],
        subject: title,
        htmlContent: `<p>${this.escapeHtml(message)}</p>`,
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

  private escapeHtml(input: string) {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

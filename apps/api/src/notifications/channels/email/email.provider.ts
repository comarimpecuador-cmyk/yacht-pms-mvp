import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannelProvider, SendNotificationInput } from '../channel.types';

@Injectable()
export class EmailProvider implements NotificationChannelProvider {
  channel: 'email' = 'email';

  constructor(private readonly configService: ConfigService) {}

  async send(input: SendNotificationInput) {
    const provider = this.configService.get<string>('EMAIL_PROVIDER', 'mock');
    const enabled = this.configService.get<string>('EMAIL_ENABLED', 'false') === 'true';

    if (!enabled || provider === 'mock') {
      return { status: 'sent' as const };
    }

    if (provider === 'smtp' || provider === 'brevo') {
      return { status: 'sent' as const };
    }

    return { status: 'failed' as const, error: `Unsupported EMAIL_PROVIDER ${provider} for ${input.type}` };
  }
}

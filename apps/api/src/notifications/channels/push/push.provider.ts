import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannelProvider, SendNotificationInput } from '../channel.types';

@Injectable()
export class PushProvider implements NotificationChannelProvider {
  channel: 'push_future' = 'push_future';

  constructor(private readonly configService: ConfigService) {}

  async send(_: SendNotificationInput) {
    const enabled = this.configService.get<string>('PUSH_ENABLED', 'false') === 'true';
    if (!enabled) {
      return { status: 'skipped' as const, reason: 'push_disabled' };
    }
    return { status: 'failed' as const, error: 'push_provider_not_configured' };
  }
}

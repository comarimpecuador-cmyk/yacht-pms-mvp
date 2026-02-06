import { Injectable } from '@nestjs/common';
import { NotificationChannelProvider, SendNotificationInput } from '../channel.types';

@Injectable()
export class PushProvider implements NotificationChannelProvider {
  channel: 'push_future' = 'push_future';

  async send(_: SendNotificationInput) {
    return { status: 'skipped' as const };
  }
}

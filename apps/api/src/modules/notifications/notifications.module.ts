import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { EmailProvider } from '../../notifications/channels/email/email.provider';
import { PushProvider } from '../../notifications/channels/push/push.provider';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, PrismaService, EmailProvider, PushProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}

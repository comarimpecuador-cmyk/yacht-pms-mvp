import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { EmailProvider } from '../../notifications/channels/email/email.provider';
import { PushProvider } from '../../notifications/channels/push/push.provider';
import { AlertsModule } from '../alerts/alerts.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { NotificationRulesService } from './notification-rules.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [AlertsModule],
  controllers: [NotificationsController, JobsController],
  providers: [
    NotificationsService,
    NotificationRulesService,
    JobsService,
    PrismaService,
    EmailProvider,
    PushProvider,
  ],
  exports: [NotificationsService, NotificationRulesService, JobsService],
})
export class NotificationsModule {}

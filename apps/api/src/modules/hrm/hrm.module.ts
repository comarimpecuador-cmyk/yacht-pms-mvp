import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HrmController } from './hrm.controller';
import { HrmService } from './hrm.service';

@Module({
  imports: [NotificationsModule, AlertsModule],
  controllers: [HrmController],
  providers: [HrmService],
})
export class HrmModule {}

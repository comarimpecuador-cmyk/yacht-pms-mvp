import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AlertsModule } from '../../modules/alerts/alerts.module';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { PrismaService } from '../../prisma.service';
import { RuleEngineService } from './rule-engine.service';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [ConfigModule, AlertsModule, NotificationsModule],
  providers: [RuleEngineService, SchedulerService, PrismaService],
})
export class SchedulerModule {}

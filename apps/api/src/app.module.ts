import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma.service';
import { LogbookModule } from './modules/logbook/logbook.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { RequisitionsModule } from './modules/requisitions/requisitions.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { IsmModule } from './modules/ism/ism.module';
import { ManifestModule } from './modules/manifest/manifest.module';
import { WorkingDaysModule } from './modules/working-days/working-days.module';
import { QueueModule } from './queue/queue.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { SchedulerModule } from './notifications/scheduler/scheduler.module';
import { YachtsModule } from './modules/yachts/yachts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    QueueModule,
    LogbookModule,
    MaintenanceModule,
    RequisitionsModule,
    DocumentsModule,
    IsmModule,
    ManifestModule,
    WorkingDaysModule,
    AlertsModule,
    NotificationsModule,
    TimelineModule,
    SchedulerModule,
    YachtsModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class AppModule {}

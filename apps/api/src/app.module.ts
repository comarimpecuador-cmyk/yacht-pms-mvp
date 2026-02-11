import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from './prisma.module'; // 👈 IMPORTANTE

import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
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
import { UsersModule } from './modules/users/users.module';
import { HrmModule } from './modules/hrm/hrm.module';
import { LogbookV2Module } from './modules/logbook-v2/logbook-v2.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule, // ✅ Prisma global y correcto
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
    UsersModule,
    HrmModule,
    LogbookV2Module,
    UploadsModule,
    InventoryModule,
    PurchaseOrdersModule,
  ],
  controllers: [HealthController],
  providers: [], // ❌ NO PrismaService aquí
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { AlertsModule } from '../alerts/alerts.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../../storage/storage.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { YachtDocumentsController } from './yacht-documents.controller';

@Module({
  imports: [NotificationsModule, AlertsModule, StorageModule],
  controllers: [DocumentsController, YachtDocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}

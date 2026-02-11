import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { LogbookV2Controller } from './logbook-v2.controller';
import { LogbookV2Service } from './logbook-v2.service';

@Module({
  imports: [NotificationsModule],
  controllers: [LogbookV2Controller],
  providers: [LogbookV2Service],
  exports: [LogbookV2Service],
})
export class LogbookV2Module {}

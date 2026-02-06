import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('in-app/:userId')
  listInApp(@Param('userId') userId: string) {
    return this.notificationsService.listInApp(userId);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.notificationsService.markRead(id);
  }

  @Get('settings/:userId')
  settings(@Param('userId') userId: string) {
    return this.notificationsService.getPreference(userId);
  }

  @Post('settings/:userId')
  upsertSettings(
    @Param('userId') userId: string,
    @Body()
    body: {
      timezone: string;
      inAppEnabled: boolean;
      emailEnabled: boolean;
      pushFuture: boolean;
      windowStart: string;
      windowEnd: string;
      minSeverity: 'info' | 'warn' | 'critical';
      yachtsScope: string[];
    },
  ) {
    return this.notificationsService.upsertPreference(userId, body);
  }
}

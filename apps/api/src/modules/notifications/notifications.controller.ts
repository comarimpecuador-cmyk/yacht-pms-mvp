import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('in-app')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  listInAppSelf(
    @Req() req: { user: { userId: string; role: string } },
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.listInAppForActor(
      req.user.userId,
      req.user.role,
      req.user.userId,
      Number(limit || 20),
    );
  }

  @Get('in-app/:userId')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  listInApp(
    @Param('userId') userId: string,
    @Req() req: { user: { userId: string; role: string } },
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.listInAppForActor(
      req.user.userId,
      req.user.role,
      userId,
      Number(limit || 20),
    );
  }

  @Patch(':id/read')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  markRead(@Param('id') id: string, @Req() req: { user: { userId: string; role: string } }) {
    return this.notificationsService.markReadForActor(id, req.user.userId, req.user.role);
  }

  @Get('settings')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  settingsSelf(@Req() req: { user: { userId: string; role: string } }) {
    return this.notificationsService.getPreferenceForActor(req.user.userId, req.user.role, req.user.userId);
  }

  @Get('settings/:userId')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  settings(
    @Param('userId') userId: string,
    @Req() req: { user: { userId: string; role: string } },
  ) {
    return this.notificationsService.getPreferenceForActor(req.user.userId, req.user.role, userId);
  }

  @Post('settings')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  upsertSettingsSelf(
    @Req() req: { user: { userId: string; role: string } },
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
    return this.notificationsService.upsertPreferenceForActor(
      req.user.userId,
      req.user.role,
      req.user.userId,
      body,
    );
  }

  @Post('settings/:userId')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  upsertSettings(
    @Param('userId') userId: string,
    @Req() req: { user: { userId: string; role: string } },
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
    return this.notificationsService.upsertPreferenceForActor(
      req.user.userId,
      req.user.role,
      userId,
      body,
    );
  }
}

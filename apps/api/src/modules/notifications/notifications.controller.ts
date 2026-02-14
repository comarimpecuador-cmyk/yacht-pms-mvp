import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateNotificationRuleDto,
  ListNotificationRulesQueryDto,
  TestNotificationRuleDto,
  UpdateNotificationRuleDto,
} from './dto/notification-rules.dto';
import { SendScenarioEmailsDto, SendTestEmailsDto } from './dto/test-email.dto';
import { NotificationRulesService } from './notification-rules.service';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly notificationRulesService: NotificationRulesService,
  ) {}

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

  @Get('rules')
  @Roles('Captain', 'Chief Engineer', 'Management/Office', 'Admin')
  listRules(@Query() query: ListNotificationRulesQueryDto) {
    return this.notificationRulesService.listRules(query);
  }

  @Post('rules')
  @Roles('Captain', 'Chief Engineer', 'Management/Office', 'Admin')
  createRule(
    @Req() req: { user: { userId: string } },
    @Body() body: CreateNotificationRuleDto,
  ) {
    return this.notificationRulesService.createRule(req.user.userId, body);
  }

  @Patch('rules/:id')
  @Roles('Captain', 'Chief Engineer', 'Management/Office', 'Admin')
  updateRule(@Param('id') id: string, @Body() body: UpdateNotificationRuleDto) {
    return this.notificationRulesService.updateRule(id, body);
  }

  @Post('rules/:id/test')
  @Roles('Captain', 'Chief Engineer', 'Management/Office', 'Admin')
  testRule(@Param('id') id: string, @Body() body: TestNotificationRuleDto) {
    return this.notificationRulesService.testRule(id, body);
  }

  @Post('email/scenarios/send')
  @Roles('Management/Office', 'Admin')
  sendEmailScenarios(@Body() body: SendScenarioEmailsDto) {
    return this.notificationsService.sendScenarioEmails({
      toEmail: body.toEmail,
      toName: body.toName,
      recipients: body.recipients,
      yachtId: body.yachtId,
      scenarios: body.scenarios,
      dueAt: body.dueAt,
      responsibleUserId: body.responsibleUserId,
      responsibleName: body.responsibleName,
      responsibleEmail: body.responsibleEmail,
      responsibleRole: body.responsibleRole,
    });
  }

  @Get('email/recipients')
  @Roles('Management/Office', 'Admin')
  listEmailRecipients(@Query('yachtId') yachtId?: string) {
    return this.notificationsService.listEmailRecipients(yachtId);
  }

  @Get('email/logs')
  @Roles('Management/Office', 'Admin')
  listEmailLogs(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('yachtId') yachtId?: string,
    @Query('recipient') recipient?: string,
  ) {
    return this.notificationsService.listEmailLogs({
      limit: Number(limit || 40),
      status,
      yachtId,
      recipient,
    });
  }

  @Post('test/email-scenarios')
  @Roles('Management/Office', 'Admin')
  sendEmailScenariosLegacy(@Body() body: SendTestEmailsDto) {
    return this.sendEmailScenarios(body);
  }
}

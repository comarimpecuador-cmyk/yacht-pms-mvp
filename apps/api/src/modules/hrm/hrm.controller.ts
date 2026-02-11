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
import { YachtScope } from '../../common/decorators/yacht-scope.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { YachtScopeGuard } from '../../common/guards/yacht-scope.guard';
import {
  CreateLeaveRequestDto,
  CreateRestDeclarationDto,
  CreateScheduleDto,
  GeneratePayrollDto,
  ListLeavesQueryDto,
  ListPayrollsQueryDto,
  ListSchedulesQueryDto,
  RestHoursReportQueryDto,
  ReviewLeaveRequestDto,
  UpdateScheduleDto,
} from './dto';
import { HrmService } from './hrm.service';

@Controller('hrm')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HrmController {
  constructor(private readonly service: HrmService) {}

  @Get('status')
  getStatus() {
    return this.service.status();
  }

  @Get('crew-options')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  @YachtScope()
  listCrewOptions(
    @Query('yachtId') yachtId: string,
    @Req() req: { user: { yachtIds: string[] } },
  ) {
    return this.service.listCrewOptions(yachtId, req.user.yachtIds || []);
  }

  @Get('schedules')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  @YachtScope()
  listSchedules(
    @Query() query: ListSchedulesQueryDto,
    @Req() req: { user: { yachtIds: string[] } },
  ) {
    return this.service.listSchedules(query, req.user.yachtIds || []);
  }

  @Post('schedules')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Admin')
  @YachtScope()
  createSchedule(
    @Body() body: CreateScheduleDto,
    @Req() req: { user: { userId: string; yachtIds: string[] } },
  ) {
    return this.service.createSchedule(req.user.userId, body, req.user.yachtIds || []);
  }

  @Patch('schedules/:id')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Admin')
  updateSchedule(
    @Param('id') id: string,
    @Body() body: UpdateScheduleDto,
    @Req() req: { user: { userId: string; yachtIds: string[] } },
  ) {
    return this.service.updateSchedule(id, req.user.userId, body, req.user.yachtIds || []);
  }

  @Get('rest-hours/report')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  @YachtScope()
  restHoursReport(
    @Query() query: RestHoursReportQueryDto,
    @Req() req: { user: { yachtIds: string[] } },
  ) {
    return this.service.restHoursReport(query, req.user.yachtIds || []);
  }

  @Post('rest-hours/declarations')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  @YachtScope()
  createRestDeclaration(
    @Body() body: CreateRestDeclarationDto,
    @Req() req: { user: { userId: string; yachtIds: string[] } },
  ) {
    return this.service.createRestDeclaration(req.user.userId, body, req.user.yachtIds || []);
  }

  @Get('leaves')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  @YachtScope()
  listLeaves(
    @Query() query: ListLeavesQueryDto,
    @Req() req: { user: { yachtIds: string[] } },
  ) {
    return this.service.listLeaves(query, req.user.yachtIds || []);
  }

  @Post('leaves')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  @YachtScope()
  createLeaveRequest(
    @Body() body: CreateLeaveRequestDto,
    @Req() req: { user: { userId: string; yachtIds: string[] } },
  ) {
    return this.service.createLeaveRequest(req.user.userId, body, req.user.yachtIds || []);
  }

  @Post('leaves/:id/approve')
  @Roles('Captain', 'HoD', 'Management/Office', 'Admin')
  approveLeave(@Param('id') id: string, @Req() req: { user: { userId: string; yachtIds: string[] } }) {
    return this.service.approveLeave(id, req.user.userId, req.user.yachtIds || []);
  }

  @Post('leaves/:id/reject')
  @Roles('Captain', 'HoD', 'Management/Office', 'Admin')
  rejectLeave(
    @Param('id') id: string,
    @Body() body: ReviewLeaveRequestDto,
    @Req() req: { user: { userId: string; yachtIds: string[] } },
  ) {
    return this.service.rejectLeave(id, req.user.userId, body.reason, req.user.yachtIds || []);
  }

  @Get('payrolls')
  @UseGuards(YachtScopeGuard)
  @Roles('Captain', 'Management/Office', 'Admin')
  @YachtScope()
  listPayrolls(
    @Query() query: ListPayrollsQueryDto,
    @Req() req: { user: { yachtIds: string[] } },
  ) {
    return this.service.listPayrolls(query, req.user.yachtIds || []);
  }

  @Post('payrolls/generate')
  @UseGuards(YachtScopeGuard)
  @Roles('Captain', 'Management/Office', 'Admin')
  @YachtScope()
  generatePayroll(
    @Body() body: GeneratePayrollDto,
    @Req() req: { user: { userId: string; yachtIds: string[] } },
  ) {
    return this.service.generatePayroll(req.user.userId, body, req.user.yachtIds || []);
  }

  @Get('payrolls/:id')
  @Roles('Captain', 'Management/Office', 'Admin')
  getPayroll(@Param('id') id: string, @Req() req: { user: { yachtIds: string[] } }) {
    return this.service.getPayroll(id, req.user.yachtIds || []);
  }

  @Post('payrolls/:id/publish')
  @Roles('Captain', 'Management/Office', 'Admin')
  publishPayroll(
    @Param('id') id: string,
    @Req() req: { user: { userId: string; yachtIds: string[] } },
  ) {
    return this.service.publishPayroll(id, req.user.userId, req.user.yachtIds || []);
  }
}

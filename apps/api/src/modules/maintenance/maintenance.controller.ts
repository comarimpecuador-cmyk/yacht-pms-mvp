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
import { MaintenanceService } from './maintenance.service';
import {
  AddMaintenanceEvidenceDto,
  CompleteMaintenanceTaskDto,
  CreateMaintenanceTaskDto,
  ListMaintenanceTasksQueryDto,
  RejectMaintenanceTaskDto,
  UpdateMaintenanceTaskDto,
} from './dto';

@Controller('maintenance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MaintenanceController {
  constructor(private readonly service: MaintenanceService) {}

  @Get('status')
  getStatus() {
    return this.service.status();
  }

  @Get('tasks')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  @YachtScope()
  listTasks(
    @Query() query: ListMaintenanceTasksQueryDto,
    @Req() req: { user: { yachtIds: string[] } },
  ) {
    return this.service.listTasks(query, req.user.yachtIds || []);
  }

  @Post('tasks')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Admin')
  @YachtScope()
  createTask(
    @Req() req: { user: { userId: string; yachtIds: string[] } },
    @Body() body: CreateMaintenanceTaskDto,
  ) {
    return this.service.createTask(req.user.userId, body, req.user.yachtIds || []);
  }

  @Get('summary/:yachtId')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  @YachtScope()
  getSummary(@Param('yachtId') yachtId: string, @Req() req: { user: { yachtIds: string[] } }) {
    return this.service.getSummary(yachtId, req.user.yachtIds || []);
  }

  @Get('calendar/:yachtId')
  @UseGuards(YachtScopeGuard)
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  @YachtScope()
  getCalendar(
    @Param('yachtId') yachtId: string,
    @Query('windowDays') windowDays = '30',
    @Req() req: { user: { yachtIds: string[] } },
  ) {
    return this.service.getCalendar(yachtId, Number(windowDays), req.user.yachtIds || []);
  }

  @Get('tasks/:id')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin')
  getTask(@Param('id') id: string, @Req() req: { user: { yachtIds: string[] } }) {
    return this.service.getTask(id, req.user.yachtIds || []);
  }

  @Patch('tasks/:id')
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Admin')
  updateTask(
    @Param('id') id: string,
    @Req() req: { user: { userId: string; yachtIds: string[] } },
    @Body() body: UpdateMaintenanceTaskDto,
  ) {
    return this.service.updateTask(id, req.user.userId, body, req.user.yachtIds || []);
  }

  @Post('tasks/:id/submit')
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Admin')
  submitTask(
    @Param('id') id: string,
    @Req() req: { user: { userId: string; yachtIds: string[] } },
  ) {
    return this.service.submitTask(id, req.user.userId, req.user.yachtIds || []);
  }

  @Post('tasks/:id/approve')
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Admin')
  approveTask(
    @Param('id') id: string,
    @Req() req: { user: { userId: string; yachtIds: string[] } },
  ) {
    return this.service.approveTask(id, req.user.userId, req.user.yachtIds || []);
  }

  @Post('tasks/:id/reject')
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Admin')
  rejectTask(
    @Param('id') id: string,
    @Body() body: RejectMaintenanceTaskDto,
    @Req() req: { user: { userId: string; yachtIds: string[] } },
  ) {
    return this.service.rejectTask(id, req.user.userId, body.reason, req.user.yachtIds || []);
  }

  @Post('tasks/:id/complete')
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Crew Member', 'Admin')
  completeTask(
    @Param('id') id: string,
    @Body() body: CompleteMaintenanceTaskDto,
    @Req() req: { user: { userId: string; yachtIds: string[] } },
  ) {
    return this.service.completeTask(id, req.user.userId, body, req.user.yachtIds || []);
  }

  @Post('tasks/:id/evidences')
  @Roles('Chief Engineer', 'Captain', 'Management/Office', 'Crew Member', 'Admin')
  addEvidence(
    @Param('id') id: string,
    @Body() body: AddMaintenanceEvidenceDto,
    @Req() req: { user: { userId: string; yachtIds: string[] } },
  ) {
    return this.service.addEvidence(id, req.user.userId, body, req.user.yachtIds || []);
  }
}

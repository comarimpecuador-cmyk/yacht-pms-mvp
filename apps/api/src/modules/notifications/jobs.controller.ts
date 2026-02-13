import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateJobDto, JobTestRunRequestDto, ListJobsQueryDto, UpdateJobDto } from './dto/jobs.dto';
import { JobsService } from './jobs.service';

@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @Roles('Captain', 'Chief Engineer', 'Management/Office', 'Admin')
  list(@Query() query: ListJobsQueryDto) {
    return this.jobsService.listJobs(query);
  }

  @Post()
  @Roles('Captain', 'Chief Engineer', 'Management/Office', 'Admin')
  create(@Req() req: { user: { userId: string } }, @Body() body: CreateJobDto) {
    return this.jobsService.createJob(req.user.userId, body);
  }

  @Patch(':id')
  @Roles('Captain', 'Chief Engineer', 'Management/Office', 'Admin')
  update(@Param('id') id: string, @Body() body: UpdateJobDto) {
    return this.jobsService.updateJob(id, body);
  }

  @Post(':id/run-now')
  @Roles('Captain', 'Chief Engineer', 'Management/Office', 'Admin')
  runNow(
    @Param('id') id: string,
    @Req() req: { user: { userId: string } },
    @Body() body: JobTestRunRequestDto,
  ) {
    return this.jobsService.runNow(id, req.user.userId, body);
  }

  @Get(':id/runs')
  @Roles('Captain', 'Chief Engineer', 'Management/Office', 'Admin')
  listRuns(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.jobsService.listRuns(id, Number(limit || 20));
  }
}

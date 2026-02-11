import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { YachtScope } from '../../common/decorators/yacht-scope.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { YachtScopeGuard } from '../../common/guards/yacht-scope.guard';
import { TimelineService } from './timeline.service';

@Controller('timeline')
@UseGuards(JwtAuthGuard, RolesGuard, YachtScopeGuard)
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  @Get('fleet')
  @Roles('SystemAdmin')
  getFleetAgenda(
    @Query('windowDays') windowDays?: string,
    @Query('yachtId') yachtId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.timelineService.getFleetAgenda(Number(windowDays || 14), yachtId, from, to);
  }

  @Get(':yachtId')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  @YachtScope()
  getAgenda(
    @Param('yachtId') yachtId: string,
    @Query('windowDays') windowDays?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.timelineService.getAgenda(yachtId, Number(windowDays || 14), from, to);
  }
}

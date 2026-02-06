import { Controller, Get, Param, Query } from '@nestjs/common';
import { TimelineService } from './timeline.service';

@Controller('timeline')
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  @Get(':yachtId')
  getAgenda(@Param('yachtId') yachtId: string, @Query('windowDays') windowDays?: string) {
    return this.timelineService.getAgenda(yachtId, Number(windowDays || 14));
  }
}

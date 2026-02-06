import { Controller, Get } from '@nestjs/common';
import { WorkingDaysService } from './working-days.service';

@Controller('working-days')
export class WorkingDaysController {
  constructor(private readonly service: WorkingDaysService) {}

  @Get('status')
  getStatus() {
    return this.service.status();
  }
}

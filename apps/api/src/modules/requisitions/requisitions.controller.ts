import { Controller, Get } from '@nestjs/common';
import { RequisitionsService } from './requisitions.service';

@Controller('requisitions')
export class RequisitionsController {
  constructor(private readonly service: RequisitionsService) {}

  @Get('status')
  getStatus() {
    return this.service.status();
  }
}

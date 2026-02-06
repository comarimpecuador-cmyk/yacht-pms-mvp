import { Controller, Get } from '@nestjs/common';
import { IsmService } from './ism.service';

@Controller('ism')
export class IsmController {
  constructor(private readonly service: IsmService) {}

  @Get('status')
  getStatus() {
    return this.service.status();
  }
}

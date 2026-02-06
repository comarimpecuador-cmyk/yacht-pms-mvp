import { Controller, Get } from '@nestjs/common';
import { ManifestService } from './manifest.service';

@Controller('manifest')
export class ManifestController {
  constructor(private readonly service: ManifestService) {}

  @Get('status')
  getStatus() {
    return this.service.status();
  }
}

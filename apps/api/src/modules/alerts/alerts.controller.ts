import { Controller, Get, Param } from '@nestjs/common';
import { AlertsService } from './alerts.service';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get(':yachtId')
  list(@Param('yachtId') yachtId: string) {
    return this.alertsService.listByYacht(yachtId);
  }
}

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { YachtScope } from '../../common/decorators/yacht-scope.decorator';
import { YachtScopeGuard } from '../../common/guards/yacht-scope.guard';
import { AlertsService } from './alerts.service';

@Controller('alerts')
@UseGuards(JwtAuthGuard, YachtScopeGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get(':yachtId')
  @YachtScope()
  list(@Param('yachtId') yachtId: string) {
    return this.alertsService.listByYacht(yachtId);
  }
}

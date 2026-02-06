import { Injectable } from '@nestjs/common';

@Injectable()
export class MaintenanceService {
  status() {
    return { module: 'maintenance', ready: true };
  }
}

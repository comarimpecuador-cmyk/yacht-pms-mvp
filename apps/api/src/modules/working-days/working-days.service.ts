import { Injectable } from '@nestjs/common';

@Injectable()
export class WorkingDaysService {
  status() {
    return { module: 'working-days', ready: true };
  }
}

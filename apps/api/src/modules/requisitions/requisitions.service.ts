import { Injectable } from '@nestjs/common';

@Injectable()
export class RequisitionsService {
  status() {
    return { module: 'requisitions', ready: true };
  }
}

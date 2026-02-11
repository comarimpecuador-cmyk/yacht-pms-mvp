import { Injectable } from '@nestjs/common';

@Injectable()
export class IsmService {
  status() {
    return { module: 'ism', ready: true };
  }
}

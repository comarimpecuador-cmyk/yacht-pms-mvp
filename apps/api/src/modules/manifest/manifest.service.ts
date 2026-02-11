import { Injectable } from '@nestjs/common';

@Injectable()
export class ManifestService {
  status() {
    return { module: 'manifest', ready: true };
  }
}

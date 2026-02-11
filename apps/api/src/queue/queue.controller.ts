import { Controller, Post } from '@nestjs/common';
import { QueueService } from './queue.service';

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post('dummy')
  async enqueueDummy() {
    return this.queueService.enqueueDummyJob();
  }
}

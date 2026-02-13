import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly queueName = 'queue-dummy';
  private readonly connection: IORedis;
  private readonly queue: Queue;
  private readonly worker: Worker;

  constructor(configService: ConfigService) {
    const redisUrl = configService.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(this.queueName, { connection: this.connection });
    this.worker = new Worker(
      this.queueName,
      async (job: Job) => {
        return { ok: true, name: job.name, data: job.data };
      },
      { connection: this.connection },
    );
  }

  async enqueueDummyJob() {
    return this.queue.add('dummy', { at: new Date().toISOString() });
  }

  async onModuleDestroy() {
    await this.worker.close();
    await this.queue.close();
    await this.connection.quit();
  }
}

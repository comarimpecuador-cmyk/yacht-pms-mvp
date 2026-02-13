import { Injectable, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { JobsService } from '../../modules/notifications/jobs.service';
import { RuleEngineService } from './rule-engine.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private queue!: Queue;

  constructor(
    private readonly configService: ConfigService,
    private readonly ruleEngineService: RuleEngineService,
    private readonly jobsService: JobsService,
  ) {}

  async onModuleInit() {
    const connection = new IORedis(this.configService.get<string>('REDIS_URL', 'redis://localhost:6379'), {
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue('jobs', { connection });

    new Worker(
      'jobs',
      async (job: Job) => {
        if (job.name === 'hourly-rule-scan') {
          return this.ruleEngineService.runHourly();
        }
        if (job.name === 'jobs-tick') {
          return this.jobsService.tick();
        }
        return { ignored: true };
      },
      { connection },
    );

    await this.queue.upsertJobScheduler(
      'hourly-rule-scan',
      { pattern: '0 * * * *' },
      {
        name: 'hourly-rule-scan',
        data: {},
      },
    );

    await this.queue.upsertJobScheduler(
      'jobs-tick',
      { pattern: '*/5 * * * *' },
      {
        name: 'jobs-tick',
        data: {},
      },
    );
  }
}

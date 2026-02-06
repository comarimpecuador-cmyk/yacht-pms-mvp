import { Module } from '@nestjs/common';
import { WorkingDaysController } from './working-days.controller';
import { WorkingDaysService } from './working-days.service';

@Module({
  controllers: [WorkingDaysController],
  providers: [WorkingDaysService],
})
export class WorkingDaysModule {}

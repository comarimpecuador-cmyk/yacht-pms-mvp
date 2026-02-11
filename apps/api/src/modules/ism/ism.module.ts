import { Module } from '@nestjs/common';
import { IsmController } from './ism.controller';
import { IsmService } from './ism.service';

@Module({
  controllers: [IsmController],
  providers: [IsmService],
})
export class IsmModule {}

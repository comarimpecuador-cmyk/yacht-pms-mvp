import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { YachtsController } from './yachts.controller';
import { YachtsService } from './yachts.service';

@Module({
  controllers: [YachtsController],
  providers: [YachtsService, PrismaService],
})
export class YachtsModule {}

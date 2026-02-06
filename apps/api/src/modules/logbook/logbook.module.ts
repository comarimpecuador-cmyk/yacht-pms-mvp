import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { LogbookController } from './logbook.controller';
import { LogbookService } from './logbook.service';

@Module({
  controllers: [LogbookController],
  providers: [LogbookService, PrismaService],
})
export class LogbookModule {}

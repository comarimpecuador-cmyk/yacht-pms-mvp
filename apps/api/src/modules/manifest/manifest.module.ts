import { Module } from '@nestjs/common';
import { ManifestController } from './manifest.controller';
import { ManifestService } from './manifest.service';

@Module({
  controllers: [ManifestController],
  providers: [ManifestService],
})
export class ManifestModule {}

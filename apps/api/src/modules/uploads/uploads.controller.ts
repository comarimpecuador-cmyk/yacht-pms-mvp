import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UploadsService } from './uploads.service';

@Controller('uploads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: any) {
    return this.uploadsService.uploadSingle(file);
  }

  @Get(':fileKey/url')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  getUrl(@Param('fileKey') fileKey: string) {
    return this.uploadsService.resolveUrl(fileKey);
  }

  @Get('files/:fileKey')
  @Roles('Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin')
  async serveFile(
    @Param('fileKey') fileKey: string,
    @Req() req: { user: { userId: string } },
    @Res() res: Response,
    @Query('download') download?: string,
  ) {
    void req.user?.userId;
    const file = await this.uploadsService.readLocalFile(fileKey);
    if (download === '1' || download === 'true') {
      res.download(file.fullPath, file.fileName);
      return;
    }
    res.sendFile(file.fullPath);
  }
}

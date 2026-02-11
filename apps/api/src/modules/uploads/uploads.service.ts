import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { basename } from 'path';
import { StorageService } from '../../storage/storage.service';

@Injectable()
export class UploadsService {
  constructor(private readonly storageService: StorageService) {}

  async uploadSingle(file?: any) {
    if (!file) {
      throw new BadRequestException('file is required');
    }

    const uploaded = await this.storageService.uploadFile({
      buffer: file.buffer,
      originalName: file.originalname || 'upload.bin',
      mimeType: file.mimetype || 'application/octet-stream',
    });

    return {
      fileKey: uploaded.fileKey,
      fileUrl: uploaded.fileUrl,
      fileName: uploaded.originalName,
      mimeType: uploaded.mimeType,
      sizeBytes: uploaded.sizeBytes,
      checksumSha256: uploaded.checksumSha256,
      storageProvider: uploaded.storageProvider,
    };
  }

  async resolveUrl(fileKey: string) {
    const url = await this.storageService.getSignedUrl({ fileKey });
    return { fileKey, url };
  }

  async readLocalFile(fileKey: string) {
    const fullPath = this.storageService.resolveLocalPath(fileKey);
    try {
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) throw new NotFoundException('file not found');
      return {
        fullPath,
        fileName: basename(fullPath),
      };
    } catch {
      throw new NotFoundException('file not found');
    }
  }
}

import { BadRequestException, Injectable, NotFoundException, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';

export type UploadInput = {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
};

export type StoredFileResult = {
  fileKey: string;
  storageProvider: 'local' | 's3';
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  fileUrl: string;
};

export type FileDescriptor = {
  fileKey?: string | null;
  fileUrl?: string | null;
};

@Injectable()
export class StorageService {
  private readonly driver: 'local' | 's3';
  private readonly localRootDir: string;
  private readonly maxBytes: number;
  private readonly publicBaseUrl: string;
  private readonly allowedMimeTypes: Set<string>;

  constructor(private readonly configService: ConfigService) {
    const configuredDriver = (this.configService.get<string>('STORAGE_DRIVER') || 'local').toLowerCase();
    this.driver = configuredDriver === 's3' ? 's3' : 'local';

    const configuredDir = this.configService.get<string>('STORAGE_LOCAL_DIR') || 'storage/uploads';
    this.localRootDir = resolve(process.cwd(), configuredDir);

    const maxMb = Number(this.configService.get<string>('STORAGE_MAX_FILE_MB') || 20);
    this.maxBytes = Number.isFinite(maxMb) && maxMb > 0 ? Math.floor(maxMb * 1024 * 1024) : 20 * 1024 * 1024;

    this.publicBaseUrl = (this.configService.get<string>('API_PUBLIC_BASE_URL') || 'http://localhost:3001').replace(/\/$/, '');

    this.allowedMimeTypes = new Set(
      (this.configService.get<string>('STORAGE_ALLOWED_MIME_TYPES') ||
        'application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    );
  }

  getMaxBytes() {
    return this.maxBytes;
  }

  getAllowedMimeTypes() {
    return Array.from(this.allowedMimeTypes);
  }

  isMimeTypeAllowed(mimeType: string) {
    return this.allowedMimeTypes.has((mimeType || '').trim().toLowerCase());
  }

  async uploadFile(input: UploadInput): Promise<StoredFileResult> {
    if (!input.buffer || input.buffer.length === 0) {
      throw new BadRequestException('file is required');
    }
    if (!this.isMimeTypeAllowed(input.mimeType)) {
      throw new BadRequestException(`Unsupported mime type: ${input.mimeType}`);
    }
    if (input.buffer.length > this.maxBytes) {
      throw new BadRequestException(`File exceeds max size of ${Math.floor(this.maxBytes / (1024 * 1024))}MB`);
    }

    if (this.driver === 's3') {
      throw new NotImplementedException('S3 storage driver is declared but not configured in this environment');
    }

    return this.uploadToLocal(input);
  }

  async getSignedUrl(file: FileDescriptor): Promise<string> {
    if (file.fileKey) {
      if (this.driver === 's3') {
        throw new NotImplementedException('S3 signed URL generation is not configured');
      }
      return this.buildLocalUrl(file.fileKey);
    }

    if (file.fileUrl) {
      return file.fileUrl;
    }

    throw new NotFoundException('No file reference available');
  }

  async deleteFile(fileKey: string | null | undefined) {
    if (!fileKey) return;
    if (this.driver === 's3') return;

    const safeKey = this.ensureSafeKey(fileKey);
    const target = join(this.localRootDir, safeKey);
    try {
      await fs.unlink(target);
    } catch {
      return;
    }
  }

  resolveLocalPath(fileKey: string) {
    const safeKey = this.ensureSafeKey(fileKey);
    return join(this.localRootDir, safeKey);
  }

  private async uploadToLocal(input: UploadInput): Promise<StoredFileResult> {
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const ext = this.guessExtension(input.originalName);
    const fileKey = `${stamp}-${randomUUID()}${ext ? `.${ext}` : ''}`;
    const targetPath = join(this.localRootDir, fileKey);

    await fs.mkdir(this.localRootDir, { recursive: true });
    await fs.writeFile(targetPath, input.buffer);

    const checksumSha256 = createHash('sha256').update(input.buffer).digest('hex');

    return {
      fileKey,
      storageProvider: 'local',
      originalName: input.originalName,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      checksumSha256,
      fileUrl: this.buildLocalUrl(fileKey),
    };
  }

  private buildLocalUrl(fileKey: string) {
    return `${this.publicBaseUrl}/api/uploads/files/${encodeURIComponent(fileKey)}`;
  }

  private ensureSafeKey(fileKey: string) {
    const normalized = String(fileKey || '').replace(/\\/g, '/').trim();
    if (!normalized || normalized.includes('..') || normalized.startsWith('/')) {
      throw new BadRequestException('Invalid file key');
    }
    return normalized;
  }

  private guessExtension(fileName: string) {
    const clean = (fileName || '').trim();
    const parts = clean.split('.');
    if (parts.length < 2) return '';
    return parts.pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  }
}

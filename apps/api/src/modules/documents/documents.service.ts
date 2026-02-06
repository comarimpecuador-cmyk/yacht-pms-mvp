import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  status() {
    return { module: 'documents', ready: true };
  }

  async addEvidence(documentId: string, fileUrl: string, uploadedBy: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const inProgressRenewal = await this.prisma.documentRenewal.findFirst({
      where: {
        documentId,
        status: 'IN_PROGRESS',
      },
      orderBy: { requestedAt: 'desc' },
    });

    return this.prisma.documentEvidence.create({
      data: {
        documentId,
        renewalId: inProgressRenewal?.id ?? null,
        fileUrl,
        uploadedBy,
      },
    });
  }
}

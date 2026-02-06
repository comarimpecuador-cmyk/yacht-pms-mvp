import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertAlert(input: {
    yachtId: string;
    module: string;
    alertType: string;
    severity: 'info' | 'warn' | 'critical';
    dueAt?: Date;
    dedupeKey: string;
    entityId?: string;
    assignedTo?: string;
  }) {
    return this.prisma.alert.upsert({
      where: { dedupeKey: input.dedupeKey },
      update: {
        severity: input.severity,
        dueAt: input.dueAt,
        assignedTo: input.assignedTo,
      },
      create: {
        yachtId: input.yachtId,
        module: input.module,
        alertType: input.alertType,
        severity: input.severity,
        dueAt: input.dueAt,
        dedupeKey: input.dedupeKey,
        entityId: input.entityId,
        assignedTo: input.assignedTo,
      },
    });
  }

  async listByYacht(yachtId: string) {
    return this.prisma.alert.findMany({
      where: { yachtId, resolvedAt: null },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    });
  }
}

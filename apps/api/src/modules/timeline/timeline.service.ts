import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async getAgenda(yachtId: string, windowDays = 14) {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + windowDays);

    const alerts = await this.prisma.alert.findMany({
      where: {
        yachtId,
        resolvedAt: null,
        dueAt: { gte: now, lte: end },
      },
      orderBy: { dueAt: 'asc' },
    });

    return alerts.map((a) => ({
      when: a.dueAt,
      module: a.module,
      type: a.alertType,
      severity: a.severity,
      dedupeKey: a.dedupeKey,
    }));
  }
}

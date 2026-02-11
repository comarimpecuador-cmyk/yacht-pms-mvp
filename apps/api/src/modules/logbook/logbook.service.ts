import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogBookStatus, MaintenanceTaskStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import {
  CreateEngineDto,
  CreateLogBookEntryDto,
  UpdateEngineDto,
  UpdateLogBookEntryDto,
} from './dto';

@Injectable()
export class LogbookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private readonly entryInclude: Prisma.LogBookEntryInclude = {
    engineReadings: {
      include: {
        engine: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    },
    observations: true,
    creator: {
      select: {
        id: true,
        fullName: true,
        email: true,
      },
    },
  };

  private normalizeRole(role?: string | null): string {
    if (!role) return '';
    const normalized = role.trim();
    if (normalized === 'Engineer') return 'Chief Engineer';
    if (normalized === 'Steward') return 'Crew Member';
    return normalized;
  }

  private legacyWriteEnabled(): boolean {
    const raw = this.configService.get<string | boolean | undefined>('LOGBOOK_LEGACY_WRITE_ENABLED');
    if (raw === undefined || raw === null) return true;
    if (typeof raw === 'boolean') return raw;
    const normalized = String(raw).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }

  private assertLegacyWriteEnabled() {
    if (!this.legacyWriteEnabled()) {
      throw new ForbiddenException('Legacy logbook is read-only. Use /api/logbook/v2/events');
    }
  }

  private assertYachtScope(yachtId: string, yachtIds: string[]) {
    if (!yachtId) {
      throw new BadRequestException('yachtId is required');
    }
    if (!yachtIds.includes(yachtId)) {
      throw new ForbiddenException('Yacht scope violation');
    }
  }

  async createEntry(userId: string, dto: CreateLogBookEntryDto) {
    this.assertLegacyWriteEnabled();

    const exists = await this.prisma.logBookEntry.findUnique({
      where: {
        yachtId_entryDate: {
          yachtId: dto.yachtId,
          entryDate: new Date(dto.entryDate),
        },
      },
    });

    if (exists) {
      throw new BadRequestException('Log Book entry already exists for yacht and date');
    }

    return this.prisma.logBookEntry.create({
      data: {
        yachtId: dto.yachtId,
        entryDate: new Date(dto.entryDate),
        watchPeriod: dto.watchPeriod,
        status: LogBookStatus.Draft,
        createdBy: userId,
        engineReadings: {
          create: dto.engineReadings.map((r) => ({ engineId: r.engineId, hours: r.hours })),
        },
        observations: {
          create: dto.observations.map((o) => ({ category: o.category, text: o.text })),
        },
      },
      include: this.entryInclude,
    });
  }

  private isSystemAdmin(role?: string | null): boolean {
    return this.normalizeRole(role) === 'SystemAdmin';
  }

  async listEntries(yachtId: string, from?: string, to?: string) {
    const where: Prisma.LogBookEntryWhereInput = { yachtId };
    if (from || to) {
      where.entryDate = {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      };
    }

    return this.prisma.logBookEntry.findMany({
      where,
      include: this.entryInclude,
      orderBy: { entryDate: 'desc' },
    });
  }

  async getEntry(id: string, yachtIds: string[]) {
    const entry = await this.prisma.logBookEntry.findUnique({
      where: { id },
      include: this.entryInclude,
    });

    if (!entry) throw new NotFoundException('Log Book entry not found');
    this.assertYachtScope(entry.yachtId, yachtIds);
    return entry;
  }

  async updateEntry(id: string, dto: UpdateLogBookEntryDto, yachtIds: string[]) {
    this.assertLegacyWriteEnabled();

    const entry = await this.prisma.logBookEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Log Book entry not found');
    this.assertYachtScope(entry.yachtId, yachtIds);

    if (entry.status !== LogBookStatus.Draft && entry.status !== LogBookStatus.Corrected) {
      throw new BadRequestException('Only Draft or Corrected entries can be edited');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.logBookEntry.update({
        where: { id },
        data: { watchPeriod: dto.watchPeriod },
      });

      if (dto.engineReadings) {
        await tx.logBookEngineReading.deleteMany({ where: { logbookId: id } });
        await tx.logBookEngineReading.createMany({
          data: dto.engineReadings.map((r) => ({
            logbookId: id,
            engineId: r.engineId,
            hours: r.hours,
          })),
        });
      }

      if (dto.observations) {
        await tx.logBookObservation.deleteMany({ where: { logbookId: id } });
        await tx.logBookObservation.createMany({
          data: dto.observations.map((o) => ({
            logbookId: id,
            category: o.category,
            text: o.text,
          })),
        });
      }

      return updated;
    });
  }

  async submitEntry(id: string, actorId: string, yachtIds: string[]) {
    this.assertLegacyWriteEnabled();

    const entry = await this.prisma.logBookEntry.findUnique({
      where: { id },
      include: { engineReadings: true },
    });

    if (!entry) throw new NotFoundException('Log Book entry not found');
    this.assertYachtScope(entry.yachtId, yachtIds);

    if (entry.status !== LogBookStatus.Draft && entry.status !== LogBookStatus.Corrected) {
      throw new BadRequestException('Only Draft/Corrected entries can be submitted');
    }

    const before = { ...entry };

    return this.prisma.$transaction(async (tx) => {
      for (const reading of entry.engineReadings) {
        await tx.engineCounter.create({
          data: {
            engineId: reading.engineId,
            readingHours: reading.hours,
            readingDate: entry.entryDate,
            sourceLogbookId: entry.id,
          },
        });
      }

      const updated = await tx.logBookEntry.update({
        where: { id },
        data: { status: LogBookStatus.Submitted },
      });

      await tx.auditEvent.create({
        data: {
          module: 'logbook',
          entityType: 'LogBookEntry',
          entityId: entry.id,
          action: 'submit',
          actorId,
          beforeJson: before,
          afterJson: updated,
          source: 'api',
        },
      });

      return updated;
    });
  }

  async lockEntry(id: string, actorId: string, role: string, yachtIds: string[]) {
    this.assertLegacyWriteEnabled();

    const effectiveRole = this.normalizeRole(role);
    if (!['Captain', 'Chief Engineer', 'Admin'].includes(effectiveRole)) {
      throw new ForbiddenException('Only Captain, Chief Engineer or Admin can lock entries');
    }

    const entry = await this.prisma.logBookEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Log Book entry not found');
    this.assertYachtScope(entry.yachtId, yachtIds);

    if (entry.status !== LogBookStatus.Submitted) {
      throw new BadRequestException('Only Submitted entries can be locked');
    }

    const updated = await this.prisma.logBookEntry.update({
      where: { id },
      data: { status: LogBookStatus.Locked },
    });

    await this.prisma.auditEvent.create({
      data: {
        module: 'logbook',
        entityType: 'LogBookEntry',
        entityId: entry.id,
        action: 'lock',
        actorId,
        beforeJson: entry,
        afterJson: updated,
        source: 'api',
      },
    });

    return updated;
  }

  async createEngine(dto: CreateEngineDto) {
    return this.prisma.engine.create({
      data: {
        yachtId: dto.yachtId,
        name: dto.name,
        type: dto.type,
        serialNo: dto.serialNo,
      },
    });
  }

  async listEngines(yachtId: string, yachtIds: string[], role?: string) {
    if (!this.isSystemAdmin(role)) {
      this.assertYachtScope(yachtId, yachtIds);
    }

    const now = new Date();
    const checkWindowEnd = new Date(now);
    checkWindowEnd.setDate(checkWindowEnd.getDate() + 7);

    const [engines, pendingTasks] = await Promise.all([
      this.prisma.engine.findMany({
        where: { yachtId },
        orderBy: { name: 'asc' },
        include: {
          counters: {
            orderBy: { readingDate: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.maintenanceTask.findMany({
        where: {
          yachtId,
          engineId: { not: null },
          status: {
            in: [
              MaintenanceTaskStatus.Draft,
              MaintenanceTaskStatus.Submitted,
              MaintenanceTaskStatus.Approved,
              MaintenanceTaskStatus.InProgress,
            ],
          },
          dueDate: { lte: checkWindowEnd },
        },
        select: {
          engineId: true,
          dueDate: true,
        },
      }),
    ]);

    const overdueEngineIds = new Set<string>();
    const reviewEngineIds = new Set<string>();

    for (const task of pendingTasks) {
      if (!task.engineId) continue;
      if (task.dueDate.getTime() < now.getTime()) {
        overdueEngineIds.add(task.engineId);
      } else {
        reviewEngineIds.add(task.engineId);
      }
    }

    return engines.map((engine) => {
      const lastCounter = engine.counters[0] ?? null;
      let healthStatus: 'OK' | 'Check' | 'Maintenance' = 'OK';

      if (overdueEngineIds.has(engine.id)) {
        healthStatus = 'Maintenance';
      } else if (reviewEngineIds.has(engine.id)) {
        healthStatus = 'Check';
      } else if (!lastCounter) {
        healthStatus = 'Check';
      } else {
        const daysWithoutReadings =
          (now.getTime() - lastCounter.readingDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysWithoutReadings > 30) {
          healthStatus = 'Check';
        }
      }

      return {
        id: engine.id,
        yachtId: engine.yachtId,
        name: engine.name,
        type: engine.type,
        serialNo: engine.serialNo,
        healthStatus,
        lastReadingAt: lastCounter?.readingDate ?? null,
      };
    });
  }

  async updateEngine(id: string, dto: UpdateEngineDto, yachtIds: string[], role?: string) {
    const existing = await this.prisma.engine.findUnique({
      where: { id },
      select: { id: true, yachtId: true },
    });
    if (!existing) {
      throw new NotFoundException('Engine not found');
    }

    if (!this.isSystemAdmin(role)) {
      this.assertYachtScope(existing.yachtId, yachtIds);
    }

    const patch: Prisma.EngineUpdateInput = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('name cannot be empty');
      patch.name = name;
    }
    if (dto.type !== undefined) {
      const type = dto.type.trim();
      if (!type) throw new BadRequestException('type cannot be empty');
      patch.type = type;
    }
    if (dto.serialNo !== undefined) {
      const serialNo = dto.serialNo.trim();
      if (!serialNo) throw new BadRequestException('serialNo cannot be empty');
      patch.serialNo = serialNo;
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('At least one field is required');
    }

    return this.prisma.engine.update({
      where: { id },
      data: patch,
    });
  }

  async deleteEngine(id: string, yachtIds: string[], role?: string) {
    const existing = await this.prisma.engine.findUnique({
      where: { id },
      select: { id: true, yachtId: true },
    });
    if (!existing) {
      throw new NotFoundException('Engine not found');
    }

    if (!this.isSystemAdmin(role)) {
      this.assertYachtScope(existing.yachtId, yachtIds);
    }

    return this.prisma.engine.delete({ where: { id } });
  }
}

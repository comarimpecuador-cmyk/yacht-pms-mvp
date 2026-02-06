import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LogBookStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import {
  CreateEngineDto,
  CreateLogBookEntryDto,
  UpdateLogBookEntryDto,
} from './dto';

@Injectable()
export class LogbookService {
  constructor(private readonly prisma: PrismaService) {}

  private assertYachtScope(yachtId: string, yachtIds: string[]) {
    if (!yachtIds.includes(yachtId)) {
      throw new ForbiddenException('Yacht scope violation');
    }
  }

  async createEntry(userId: string, dto: CreateLogBookEntryDto) {
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
      include: { engineReadings: true, observations: true },
    });
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
      include: { engineReadings: true, observations: true },
      orderBy: { entryDate: 'desc' },
    });
  }

  async getEntry(id: string, yachtIds: string[]) {
    const entry = await this.prisma.logBookEntry.findUnique({
      where: { id },
      include: { engineReadings: true, observations: true },
    });

    if (!entry) throw new NotFoundException('Log Book entry not found');
    this.assertYachtScope(entry.yachtId, yachtIds);
    return entry;
  }

  async updateEntry(id: string, dto: UpdateLogBookEntryDto, yachtIds: string[]) {
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
    if (!['Captain', 'Chief Engineer'].includes(role)) {
      throw new ForbiddenException('Only Captain or Chief Engineer can lock entries');
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

  async listEngines(yachtId: string, yachtIds: string[]) {
    this.assertYachtScope(yachtId, yachtIds);
    return this.prisma.engine.findMany({ where: { yachtId }, orderBy: { name: 'asc' } });
  }
}

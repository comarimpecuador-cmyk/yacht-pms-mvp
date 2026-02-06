import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateYachtDto, GrantYachtAccessDto } from './dto';

@Injectable()
export class YachtsService {
  constructor(private readonly prisma: PrismaService) {}

  async createYacht(actorId: string, role: string, dto: CreateYachtDto) {
    if (!['Admin', 'Management/Office'].includes(role)) {
      throw new ForbiddenException('Only Admin/Management can create yachts');
    }

    const yacht = await this.prisma.yacht.create({
      data: {
        name: dto.name,
        flag: dto.flag,
        imoOptional: dto.imoOptional,
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        module: 'yachts',
        entityType: 'Yacht',
        entityId: yacht.id,
        action: 'create',
        actorId,
        beforeJson: null,
        afterJson: yacht,
        source: 'api',
      },
    });

    return yacht;
  }

  async listVisibleYachts(userId: string, role: string) {
    if (['Admin', 'Management/Office'].includes(role)) {
      return this.prisma.yacht.findMany({ orderBy: { name: 'asc' } });
    }

    return this.prisma.yacht.findMany({
      where: {
        userAccesses: {
          some: { userId },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async grantAccess(actorId: string, role: string, yachtId: string, dto: GrantYachtAccessDto) {
    if (!['Admin', 'Management/Office'].includes(role)) {
      throw new ForbiddenException('Only Admin/Management can grant yacht access');
    }

    const yacht = await this.prisma.yacht.findUnique({ where: { id: yachtId } });
    if (!yacht) throw new NotFoundException('Yacht not found');

    const access = await this.prisma.userYachtAccess.upsert({
      where: {
        userId_yachtId: {
          userId: dto.userId,
          yachtId,
        },
      },
      update: {
        roleNameOverride: dto.roleNameOverride,
      },
      create: {
        userId: dto.userId,
        yachtId,
        roleNameOverride: dto.roleNameOverride,
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        module: 'yachts',
        entityType: 'UserYachtAccess',
        entityId: access.id,
        action: 'grant_access',
        actorId,
        beforeJson: null,
        afterJson: access,
        source: 'api',
      },
    });

    return access;
  }

  async listYachtAccess(role: string, yachtId: string) {
    if (!['Admin', 'Management/Office'].includes(role)) {
      throw new ForbiddenException('Only Admin/Management can list yacht access');
    }

    return this.prisma.userYachtAccess.findMany({
      where: { yachtId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

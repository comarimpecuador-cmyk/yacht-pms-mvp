import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma.service';
import { CreateUserDto, SetUserAccessesDto } from './dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(query?: string) {
    const q = query?.trim();

    const users = await this.prisma.user.findMany({
      where: q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { fullName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        createdAt: true,
        role: {
          select: {
            name: true,
          },
        },
        yachtAccesses: {
          where: { revokedAt: null },
          select: { yachtId: true },
        },
      },
      orderBy: { email: 'asc' },
      take: 300,
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      isActive: u.isActive,
      role: u.role,
      roleName: u.role.name,
      createdAt: u.createdAt,
      activeYachtCount: u.yachtAccesses.length,
    }));
  }

  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        role: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async createUser(actorId: string, dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const fullName = dto.fullName.trim();
    const roleName = dto.roleName.trim();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const role = await this.prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      throw new BadRequestException('Invalid role');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const created = await this.prisma.user.create({
      data: {
        email,
        fullName,
        passwordHash,
        roleId: role.id,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        isActive: true,
        role: { select: { name: true } },
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        module: 'users',
        entityType: 'User',
        entityId: created.id,
        action: 'create',
        actorId,
        beforeJson: Prisma.DbNull,
        afterJson: created as unknown as Prisma.JsonObject,
        source: 'api',
      },
    });

    return created;
  }

  async updateUserStatus(actorId: string, userId: string, isActive: boolean) {
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isActive: true },
    });

    if (!current) {
      throw new NotFoundException('User not found');
    }

    if (current.id === actorId && !isActive) {
      throw new BadRequestException('You cannot deactivate your own user');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
      select: { id: true, email: true, isActive: true },
    });

    await this.prisma.auditEvent.create({
      data: {
        module: 'users',
        entityType: 'User',
        entityId: userId,
        action: 'status_update',
        actorId,
        beforeJson: current as unknown as Prisma.JsonObject,
        afterJson: updated as unknown as Prisma.JsonObject,
        source: 'api',
      },
    });

    return updated;
  }

  async getUserAccesses(userId: string, includeRevoked: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, isActive: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const accesses = await this.prisma.userYachtAccess.findMany({
      where: {
        userId,
        ...(includeRevoked ? {} : { revokedAt: null }),
      },
      include: {
        yacht: {
          select: {
            id: true,
            name: true,
            flag: true,
          },
        },
      },
      orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
    });

    return { user, accesses };
  }

  async setUserAccesses(actorId: string, userId: string, dto: SetUserAccessesDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const uniqueByYacht = new Map<string, { yachtId: string; roleNameOverride?: string }>();
    for (const assignment of dto.assignments || []) {
      uniqueByYacht.set(assignment.yachtId, {
        yachtId: assignment.yachtId,
        roleNameOverride: assignment.roleNameOverride,
      });
    }
    const desired = Array.from(uniqueByYacht.values());

    const yachtIds = desired.map((a) => a.yachtId);
    if (yachtIds.length > 0) {
      const existingYachts = await this.prisma.yacht.findMany({
        where: { id: { in: yachtIds } },
        select: { id: true },
      });
      const existingSet = new Set(existingYachts.map((y) => y.id));
      const missing = yachtIds.filter((id) => !existingSet.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(`Invalid yachtIds: ${missing.join(', ')}`);
      }
    }

    const requestedOverrides = Array.from(
      new Set(
        desired
          .map((assignment) => assignment.roleNameOverride?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    if (requestedOverrides.length > 0) {
      const existingRoles = await this.prisma.role.findMany({
        where: { name: { in: requestedOverrides } },
        select: { name: true },
      });
      const existingRoleSet = new Set(existingRoles.map((r) => r.name));
      const invalidOverrides = requestedOverrides.filter((name) => !existingRoleSet.has(name));
      if (invalidOverrides.length > 0) {
        throw new BadRequestException(`Invalid role overrides: ${invalidOverrides.join(', ')}`);
      }
    }

    const before = await this.prisma.userYachtAccess.findMany({ where: { userId } });

    await this.prisma.$transaction(async (tx) => {
      for (const assignment of desired) {
        const normalizedOverride =
          assignment.roleNameOverride && assignment.roleNameOverride.trim().length > 0
            ? assignment.roleNameOverride.trim()
            : null;

        await tx.userYachtAccess.upsert({
          where: {
            userId_yachtId: {
              userId,
              yachtId: assignment.yachtId,
            },
          },
          update: {
            roleNameOverride: normalizedOverride,
            revokedAt: null,
            revokedBy: null,
          },
          create: {
            userId,
            yachtId: assignment.yachtId,
            roleNameOverride: normalizedOverride,
          },
        });
      }

      const desiredSet = new Set(desired.map((x) => x.yachtId));
      const revokeIds = before
        .filter((x) => x.revokedAt === null && !desiredSet.has(x.yachtId))
        .map((x) => x.id);

      if (revokeIds.length > 0) {
        await tx.userYachtAccess.updateMany({
          where: { id: { in: revokeIds } },
          data: { revokedAt: new Date(), revokedBy: actorId },
        });
      }
    });

    const after = await this.getUserAccesses(userId, true);

    await this.prisma.auditEvent.create({
      data: {
        module: 'users',
        entityType: 'UserYachtAccess',
        entityId: userId,
        action: 'set_accesses',
        actorId,
        beforeJson: before as unknown as Prisma.JsonObject,
        afterJson: after.accesses as unknown as Prisma.JsonObject,
        source: 'api',
      },
    });

    return after;
  }
}

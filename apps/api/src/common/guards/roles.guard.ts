import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

const prisma = new PrismaClient();

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  private normalizeRole(role?: string | null): string {
    if (!role) return '';
    const normalized = role.trim();
    if (normalized === 'Engineer') return 'Chief Engineer';
    if (normalized === 'Steward') return 'Crew Member';
    return normalized;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const userRole: string | undefined = request.user?.role;
    const userId: string | undefined = request.user?.userId;
    const yachtId: string | undefined =
      request.query?.yachtId || request.params?.yachtId || request.body?.yachtId;

    if (!userRole) return false;

    if (userRole === 'SystemAdmin') return true;

    const effectiveRole = this.normalizeRole(userRole);

    if (userId && yachtId) {
      const access = await prisma.userYachtAccess.findUnique({
        where: {
          userId_yachtId: {
            userId,
            yachtId: String(yachtId),
          },
        },
        select: { roleNameOverride: true, revokedAt: true },
      });

      if (!access || access.revokedAt) {
        return false;
      }

      const finalRole = this.normalizeRole(access.roleNameOverride || effectiveRole);
      return roles.includes(finalRole);
    }

    return roles.includes(effectiveRole);
  }
}

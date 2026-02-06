import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { YACHT_SCOPE_KEY } from '../decorators/yacht-scope.decorator';

const prisma = new PrismaClient();

@Injectable()
export class YachtScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const needsScope = this.reflector.getAllAndOverride<boolean>(YACHT_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!needsScope) return true;

    const request = context.switchToHttp().getRequest();
    const yachtId = request.params?.yachtId || request.params?.id || request.body?.yachtId || request.query?.yachtId;
    const userId: string | undefined = request.user?.userId;
    const role: string | undefined = request.user?.role;

    if (!yachtId) return true;
    if (!userId || !role) return false;

    if (role === 'Admin' || role === 'Management/Office') {
      return true;
    }

    const access = await prisma.userYachtAccess.findUnique({
      where: {
        userId_yachtId: {
          userId,
          yachtId: String(yachtId),
        },
      },
    });

    return Boolean(access);
  }
}

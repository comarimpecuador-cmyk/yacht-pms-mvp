import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap(async (responseBody) => {
        const method = request.method;
        const isCritical = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);
        if (!isCritical) return;

        // OJO: Prisma Json espera JSON real (objeto), no string.
        // beforeJson: Prisma.DbNull (en vez de null)
        await this.prisma.auditEvent.create({
          data: {
            module: request.baseUrl || 'unknown',
            entityType: request.route?.path || 'unknown',
            entityId: request.params?.id ?? undefined, // mejor omitir que mandar null
            action: method,
            actorId: request.user?.userId || 'system',
            timestamp: new Date(),
            beforeJson: Prisma.DbNull,
            afterJson: (responseBody ?? {}) as any,
            ipDevice: request.ip ?? undefined,
            source: 'api',
          },
        });
      }),
    );
  }
}

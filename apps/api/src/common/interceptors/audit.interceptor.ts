import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
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

        await this.prisma.auditEvent.create({
          data: {
            module: request.baseUrl || 'unknown',
            entityType: request.route?.path || 'unknown',
            entityId: request.params?.id || null,
            action: method,
            actorId: request.user?.userId || 'system',
            timestamp: new Date(),
            beforeJson: null,
            afterJson: JSON.stringify(responseBody || {}),
            ipDevice: request.ip || null,
            source: 'api',
          },
        });
      }),
    );
  }
}

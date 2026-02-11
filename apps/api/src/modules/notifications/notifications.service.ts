import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { EmailProvider } from '../../notifications/channels/email/email.provider';
import { PushProvider } from '../../notifications/channels/push/push.provider';

type ProviderResult =
  | { status: 'sent' }
  | { status: 'skipped'; reason?: string }
  | { status: 'failed'; error: string };

function normalizeResult(result: any): ProviderResult {
  if (!result || typeof result !== 'object') return { status: 'failed', error: 'provider_returned_invalid_result' };

  const status = result.status;
  if (status === 'sent') return { status: 'sent' };
  if (status === 'failed') return { status: 'failed', error: String(result.error ?? 'unknown_error') };
  if (status === 'skipped') return { status: 'skipped', reason: result.reason ? String(result.reason) : undefined };

  // fallback seguro
  return { status: 'failed', error: `unknown_status:${String(status)}` };
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailProvider: EmailProvider,
    private readonly pushProvider: PushProvider,
  ) {}

  private isPrivilegedRole(role: string) {
    return ['SystemAdmin', 'Admin', 'Management/Office'].includes(role);
  }

  private assertUserAccess(actorId: string, actorRole: string, targetUserId: string) {
    if (actorId === targetUserId) return;
    if (this.isPrivilegedRole(actorRole)) return;
    throw new ForbiddenException('Forbidden user scope');
  }

  async createInApp(input: {
    userId: string;
    yachtId?: string;
    type: string;
    dedupeKey: string;
    payload: Prisma.JsonObject;
  }) {
    const normalizedPayload = this.normalizeInAppPayload(input.type, input.payload, input.yachtId);

    return this.prisma.notificationEvent.create({
      data: {
        userId: input.userId,
        yachtId: input.yachtId,
        channel: 'in_app',
        type: input.type,
        payload: normalizedPayload,
        status: 'sent',
        dedupeKey: input.dedupeKey,
        sentAt: new Date(),
      },
    });
  }

  async maybeSendEmail(input: {
    userId: string;
    yachtId?: string;
    type: string;
    dedupeKey: string;
    severity: 'info' | 'warn' | 'critical';
    payload: Prisma.JsonObject;
  }) {
    const since = new Date();
    since.setHours(0, 0, 0, 0);

    const existing = await this.prisma.notificationEvent.findFirst({
      where: {
        channel: 'email',
        dedupeKey: input.dedupeKey,
        createdAt: { gte: since },
        status: 'sent',
      },
    });

    if (existing) {
      return { status: 'skipped_daily_dedupe' };
    }

    const raw = await this.emailProvider.send({
      userId: input.userId,
      yachtId: input.yachtId,
      type: input.type,
      dedupeKey: input.dedupeKey,
      severity: input.severity,
      payload: input.payload,
    });

    const result = normalizeResult(raw);

    return this.prisma.notificationEvent.create({
      data: {
        userId: input.userId,
        yachtId: input.yachtId,
        channel: 'email',
        type: input.type,
        payload: input.payload,
        status: result.status === 'failed' ? 'failed' : result.status === 'sent' ? 'sent' : 'skipped',
        dedupeKey: input.dedupeKey,
        sentAt: result.status === 'sent' ? new Date() : null,
        error: result.status === 'failed' ? result.error : null,
      },
    });
  }

  async maybeSendPushFuture(input: {
    userId: string;
    yachtId?: string;
    type: string;
    dedupeKey: string;
    severity: 'info' | 'warn' | 'critical';
    payload: Prisma.JsonObject;
  }) {
    const raw = await this.pushProvider.send({ ...input });
    const result = normalizeResult(raw);

    return this.prisma.notificationEvent.create({
      data: {
        userId: input.userId,
        yachtId: input.yachtId,
        channel: 'push_future',
        type: input.type,
        payload: input.payload,
        status: result.status === 'failed' ? 'failed' : result.status === 'sent' ? 'sent' : 'skipped',
        dedupeKey: input.dedupeKey,
        sentAt: result.status === 'sent' ? new Date() : null,
        error: result.status === 'failed' ? result.error : null,
      },
    });
  }

  async listInApp(userId: string) {
    const rows = await this.prisma.notificationEvent.findMany({
      where: { userId, channel: 'in_app' },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => this.withPresentation(row));
  }

  async listInAppForActor(actorId: string, actorRole: string, targetUserId: string, limit = 20) {
    this.assertUserAccess(actorId, actorRole, targetUserId);

    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 20;
    const rows = await this.prisma.notificationEvent.findMany({
      where: { userId: targetUserId, channel: 'in_app' },
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
    });

    return rows.map((row) => this.withPresentation(row));
  }

  async markRead(notificationId: string) {
    return this.prisma.notificationEvent.update({
      where: { id: notificationId },
      data: { status: 'read', readAt: new Date() },
    });
  }

  async markReadForActor(notificationId: string, actorId: string, actorRole: string) {
    const existing = await this.prisma.notificationEvent.findUnique({
      where: { id: notificationId },
      select: { id: true, userId: true },
    });

    if (!existing) {
      throw new NotFoundException('Notification not found');
    }
    if (existing.userId && existing.userId !== actorId && !this.isPrivilegedRole(actorRole)) {
      throw new ForbiddenException('Forbidden notification scope');
    }

    return this.markRead(notificationId);
  }

  async getPreference(userId: string) {
    return this.prisma.notificationPreference.findUnique({ where: { userId } });
  }

  async getPreferenceForActor(actorId: string, actorRole: string, targetUserId: string) {
    this.assertUserAccess(actorId, actorRole, targetUserId);
    return this.getPreference(targetUserId);
  }

  async upsertPreference(
    userId: string,
    input: {
      timezone: string;
      inAppEnabled: boolean;
      emailEnabled: boolean;
      pushFuture: boolean;
      windowStart: string;
      windowEnd: string;
      minSeverity: 'info' | 'warn' | 'critical';
      yachtsScope: string[];
    },
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: input,
      create: { userId, ...input },
    });
  }

  async upsertPreferenceForActor(
    actorId: string,
    actorRole: string,
    targetUserId: string,
    input: {
      timezone: string;
      inAppEnabled: boolean;
      emailEnabled: boolean;
      pushFuture: boolean;
      windowStart: string;
      windowEnd: string;
      minSeverity: 'info' | 'warn' | 'critical';
      yachtsScope: string[];
    },
  ) {
    this.assertUserAccess(actorId, actorRole, targetUserId);
    return this.upsertPreference(targetUserId, input);
  }

  private withPresentation(row: NotificationEvent) {
    return {
      ...row,
      payload: this.normalizeInAppPayload(row.type, row.payload, row.yachtId ?? undefined),
    };
  }

  private normalizeInAppPayload(
    type: string,
    payload: Prisma.JsonValue,
    yachtId?: string,
  ): Prisma.JsonObject {
    const data = this.asRecord(payload);
    const defaults = this.buildPresentation(type, data, yachtId);

    const title = this.pickText(data, ['title']) ?? defaults.title;
    const message =
      this.pickText(data, ['message', 'detail', 'statusText']) ?? defaults.message;
    const description =
      this.pickText(data, ['description']) ?? defaults.description ?? message;

    const merged: Prisma.JsonObject = {
      ...data,
      title,
      message,
      description,
    };

    if (!this.pickText(data, ['module']) && defaults.module) {
      merged.module = defaults.module;
    }

    if (!this.pickText(data, ['actionUrl']) && defaults.actionUrl) {
      merged.actionUrl = defaults.actionUrl;
    }

    return merged;
  }

  private buildPresentation(
    type: string,
    payload: Record<string, unknown>,
    yachtId?: string,
  ): { title: string; message: string; description?: string; module?: string; actionUrl?: string } {
    const module = type.split('.')[0] || 'sistema';
    const taskTitle = this.pickText(payload, ['title']) ?? 'tarea';
    const docType = this.pickText(payload, ['docType']) ?? 'documento';
    const daysLeft = this.pickNumber(payload, ['daysLeft']);
    const leaveType = this.pickText(payload, ['leaveType']) ?? 'solicitud';
    const reason = this.pickText(payload, ['reason']);
    const period = this.pickText(payload, ['period']);
    const status = this.pickText(payload, ['status']);
    const eventType = this.pickText(payload, ['eventType']);
    const eventTitle = this.pickText(payload, ['title']) ?? 'evento';
    const itemName = this.pickText(payload, ['itemName']) ?? 'item';
    const poNumber = this.pickText(payload, ['poNumber']) ?? 'PO';
    const vendorName = this.pickText(payload, ['vendorName']) ?? 'proveedor';

    if (type === 'documents.created') {
      return {
        module: 'documents',
        title: 'Documento creado',
        message: `Se registro un documento de tipo ${docType}.`,
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.updated') {
      return {
        module: 'documents',
        title: 'Documento actualizado',
        message: `Se actualizo un documento de tipo ${docType}${status ? ` (${status})` : ''}.`,
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.version_uploaded') {
      return {
        module: 'documents',
        title: 'Nueva version de documento',
        message: `Se subio una nueva version de ${docType}.`,
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.submitted') {
      return {
        module: 'documents',
        title: 'Documento enviado a aprobacion',
        message: reason
          ? `Documento pendiente de aprobacion. Motivo: ${reason}`
          : 'Documento pendiente de aprobacion.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.approved') {
      return {
        module: 'documents',
        title: 'Documento aprobado',
        message: reason ? `Aprobado. Motivo: ${reason}` : 'Documento aprobado y bloqueado.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.rejected') {
      return {
        module: 'documents',
        title: 'Documento rechazado',
        message: reason ? `Rechazado. Motivo: ${reason}` : 'Documento rechazado.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.archived') {
      return {
        module: 'documents',
        title: 'Documento archivado',
        message: `Se archivo un documento de tipo ${docType}.`,
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.deleted') {
      return {
        module: 'documents',
        title: 'Documento eliminado',
        message: 'Un documento fue eliminado del sistema.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.evidence_added') {
      return {
        module: 'documents',
        title: 'Evidencia agregada',
        message: 'Se adjunto una nueva evidencia a un documento.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.renewal_started') {
      return {
        module: 'documents',
        title: 'Renovacion iniciada',
        message: 'Se inicio el proceso de renovacion de un documento.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.renewal_completed') {
      return {
        module: 'documents',
        title: 'Renovacion completada',
        message: 'La renovacion del documento fue completada.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.renewal_updated') {
      return {
        module: 'documents',
        title: 'Renovacion actualizada',
        message: 'Se actualizo el estado de una renovacion documental.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.expiring') {
      return {
        module: 'documents',
        title: 'Documento por vencer',
        message:
          daysLeft !== null
            ? `Un documento vence en ${Math.max(daysLeft, 0)} dia(s).`
            : 'Un documento requiere atencion por vencimiento.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'documents.expired') {
      return {
        module: 'documents',
        title: 'Documento vencido',
        message: 'Un documento ha vencido y requiere accion inmediata.',
        actionUrl: this.buildYachtUrl(yachtId, 'documents'),
      };
    }

    if (type === 'logbook_v2.created') {
      const eventTypeLabel = this.mapLogbookEventTypeLabel(eventType);
      return {
        module: 'logbook',
        title: `${eventTypeLabel} registrado`,
        message: `Se registro "${eventTitle}" en la bitacora.`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'logbook'),
      };
    }

    if (type === 'logbook_v2.updated') {
      const eventTypeLabel = this.mapLogbookEventTypeLabel(eventType);
      return {
        module: 'logbook',
        title: `${eventTypeLabel} modificado`,
        message: `Se actualizaron datos del evento "${eventTitle}".`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'logbook'),
      };
    }

    if (type === 'logbook_v2.status_updated') {
      const eventTypeLabel = this.mapLogbookEventTypeLabel(eventType);
      const statusLabel = this.mapLogbookStatusLabel(status);
      return {
        module: 'logbook',
        title: `${eventTypeLabel} actualizado`,
        message: statusLabel
          ? `El evento cambio a estado ${statusLabel}.`
          : `Se actualizo el estado de "${eventTitle}".`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'logbook'),
      };
    }

    if (type === 'inventory.item_created') {
      return {
        module: 'inventory',
        title: 'Item de inventario creado',
        message: `Se creo el item "${itemName}".`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'inventory'),
      };
    }

    if (type === 'inventory.item_updated') {
      return {
        module: 'inventory',
        title: 'Item de inventario actualizado',
        message: `Se actualizaron los datos de "${itemName}".`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'inventory'),
      };
    }

    if (type === 'inventory.movement_created') {
      const movementType = this.pickText(payload, ['type']) ?? 'movimiento';
      return {
        module: 'inventory',
        title: 'Movimiento de inventario',
        message: `Se registro ${movementType} para "${itemName}".`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'inventory'),
      };
    }

    if (type === 'inventory.adjustment') {
      return {
        module: 'inventory',
        title: 'Ajuste de inventario',
        message: `Se realizo un ajuste manual para "${itemName}".`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'inventory'),
      };
    }

    if (type === 'inventory.low_stock') {
      return {
        module: 'inventory',
        title: 'Stock bajo',
        message: `El item "${itemName}" alcanzo su stock minimo.`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'inventory'),
      };
    }

    if (type === 'inventory.stockout') {
      return {
        module: 'inventory',
        title: 'Stock agotado',
        message: `El item "${itemName}" quedo en cero.`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'inventory'),
      };
    }

    if (type === 'po.created') {
      return {
        module: 'purchase_orders',
        title: `Orden ${poNumber} creada`,
        message: `Nueva orden de compra para ${vendorName}.`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'purchase-orders'),
      };
    }

    if (type === 'po.updated') {
      return {
        module: 'purchase_orders',
        title: `Orden ${poNumber} actualizada`,
        message: `Se actualizo la orden de compra (${vendorName}).`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'purchase-orders'),
      };
    }

    if (type === 'po.submitted') {
      return {
        module: 'purchase_orders',
        title: `Orden ${poNumber} enviada`,
        message: 'Pendiente de aprobacion.',
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'purchase-orders'),
      };
    }

    if (type === 'po.approved') {
      return {
        module: 'purchase_orders',
        title: `Orden ${poNumber} aprobada`,
        message: 'La orden fue aprobada y bloqueada para cambios.',
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'purchase-orders'),
      };
    }

    if (type === 'po.ordered') {
      return {
        module: 'purchase_orders',
        title: `Orden ${poNumber} emitida`,
        message: `Compra enviada al proveedor ${vendorName}.`,
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'purchase-orders'),
      };
    }

    if (type === 'po.received') {
      const receiptId = this.pickText(payload, ['receiptId']);
      return {
        module: 'purchase_orders',
        title: `Recepcion de ${poNumber}`,
        message: receiptId
          ? `Se registro recepcion (${receiptId}) para la orden.`
          : 'Se registro recepcion de mercaderia.',
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'purchase-orders'),
      };
    }

    if (type === 'po.cancelled') {
      return {
        module: 'purchase_orders',
        title: `Orden ${poNumber} cancelada`,
        message: reason ? `Motivo: ${reason}` : 'La orden de compra fue cancelada.',
        actionUrl:
          this.pickText(payload, ['actionUrl']) ?? this.buildYachtUrl(yachtId, 'purchase-orders'),
      };
    }

    if (type === 'maintenance.task_assigned') {
      return {
        module: 'maintenance',
        title: 'Mantenimiento asignado',
        message: `Se le asigno la tarea "${taskTitle}".`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'maintenance.task_reassigned') {
      return {
        module: 'maintenance',
        title: 'Mantenimiento reasignado',
        message: `La tarea "${taskTitle}" fue reasignada.`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'maintenance.task_submitted') {
      return {
        module: 'maintenance',
        title: 'Mantenimiento enviado',
        message: `La tarea "${taskTitle}" esta pendiente de aprobacion.`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'maintenance.task_approved') {
      return {
        module: 'maintenance',
        title: 'Mantenimiento aprobado',
        message: `La tarea "${taskTitle}" fue aprobada.`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'maintenance.task_rejected') {
      return {
        module: 'maintenance',
        title: 'Mantenimiento rechazado',
        message: reason ? `Motivo: ${reason}` : `La tarea "${taskTitle}" fue rechazada.`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'maintenance.task_completed') {
      return {
        module: 'maintenance',
        title: 'Mantenimiento completado',
        message: `La tarea "${taskTitle}" se completo correctamente.`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'maintenance.evidence_added') {
      return {
        module: 'maintenance',
        title: 'Evidencia de mantenimiento',
        message: `Se adjunto evidencia en la tarea "${taskTitle}".`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'maintenance.overdue') {
      return {
        module: 'maintenance',
        title: 'Tarea vencida',
        message: `La tarea "${taskTitle}" esta fuera de plazo.`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'maintenance.due_soon') {
      return {
        module: 'maintenance',
        title: 'Tarea por vencer',
        message: `La tarea "${taskTitle}" vence pronto.`,
        actionUrl: this.buildYachtUrl(yachtId, 'maintenance'),
      };
    }

    if (type === 'hrm.schedule_created') {
      return {
        module: 'hrm',
        title: 'Horario actualizado',
        message: 'Se registro o actualizo su horario de trabajo.',
        actionUrl: this.buildYachtUrl(yachtId, 'hrm'),
      };
    }

    if (type === 'hrm.rest_non_compliance') {
      return {
        module: 'hrm',
        title: 'Incumplimiento de descanso',
        message: 'Se detecto una declaracion de descanso no conforme.',
        actionUrl: this.buildYachtUrl(yachtId, 'hrm'),
      };
    }

    if (type === 'hrm.leave_pending_approval') {
      return {
        module: 'hrm',
        title: 'Permiso pendiente de aprobacion',
        message: `Existe una solicitud de ${leaveType} pendiente de revision.`,
        actionUrl: this.buildYachtUrl(yachtId, 'hrm'),
      };
    }

    if (type === 'hrm.leave_approved') {
      return {
        module: 'hrm',
        title: 'Permiso aprobado',
        message: 'Su solicitud de permiso fue aprobada.',
        actionUrl: this.buildYachtUrl(yachtId, 'hrm'),
      };
    }

    if (type === 'hrm.leave_rejected') {
      return {
        module: 'hrm',
        title: 'Permiso rechazado',
        message: reason ? `Motivo: ${reason}` : 'Su solicitud de permiso fue rechazada.',
        actionUrl: this.buildYachtUrl(yachtId, 'hrm'),
      };
    }

    if (type === 'hrm.payroll_generated') {
      return {
        module: 'hrm',
        title: 'Nomina generada',
        message: period ? `Se genero la nomina del periodo ${period}.` : 'Se genero una nueva nomina.',
        actionUrl: this.buildYachtUrl(yachtId, 'hrm'),
      };
    }

    if (type === 'hrm.payroll_published') {
      return {
        module: 'hrm',
        title: 'Nomina publicada',
        message: period ? `La nomina del periodo ${period} fue publicada.` : 'La nomina fue publicada.',
        actionUrl: this.buildYachtUrl(yachtId, 'hrm'),
      };
    }

    return {
      module,
      title: `Notificacion de ${module.toUpperCase()}`,
      message: this.pickText(payload, ['reason']) ?? 'Se registro una actualizacion en la plataforma.',
    };
  }

  private buildYachtUrl(yachtId: string | undefined, section: string): string | undefined {
    if (!yachtId) return undefined;
    return `/yachts/${yachtId}/${section}`;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  private pickText(source: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0 && trimmed.toLowerCase() !== 'undefined') {
          return trimmed;
        }
      }
    }
    return null;
  }

  private pickNumber(source: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
        return Number(value);
      }
    }
    return null;
  }

  private mapLogbookEventTypeLabel(eventType: string | null): string {
    if (eventType === 'entry') return 'Ingreso';
    if (eventType === 'exit') return 'Egreso';
    if (eventType === 'service') return 'Servicio';
    if (eventType === 'maintenance') return 'Mantenimiento';
    if (eventType === 'incident') return 'Incidente';
    if (eventType === 'operation') return 'Operacion';
    return 'Evento';
  }

  private mapLogbookStatusLabel(status: string | null): string | null {
    if (status === 'draft') return 'Borrador';
    if (status === 'submitted') return 'Pendiente de revision';
    if (status === 'approved') return 'Aprobado';
    if (status === 'rejected') return 'Rechazado';
    if (status === 'closed') return 'Cerrado';
    if (status === 'cancelled') return 'Cancelado';
    return null;
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import { AlertsService } from '../alerts/alerts.service';
import { NotificationRulesService } from '../notifications/notification-rules.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma.service';
import { StorageService } from '../../storage/storage.service';
import {
  AddPurchaseOrderAttachmentDto,
  CreatePurchaseOrderDto,
  ListPurchaseOrdersQueryDto,
  PurchaseOrderActionReasonDto,
  PurchaseOrderLineInputDto,
  ReceivePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto';

type ActorContext = {
  userId: string;
  role: string;
  yachtIds: string[];
};

type PurchaseOrderWithRelations = Prisma.PurchaseOrderGetPayload<{
  include: {
    lines: {
      include: {
        item: {
          select: {
            id: true;
            name: true;
            sku: true;
            unit: true;
          };
        };
      };
    };
    receipts: {
      include: {
        lines: true;
      };
    };
    attachments: true;
  };
}>;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly alertsService: AlertsService,
    private readonly notificationRulesService: NotificationRulesService,
    private readonly storageService: StorageService,
  ) {}

  status() {
    return { module: 'purchase_orders', ready: true };
  }

  private normalizeRole(role?: string | null) {
    if (!role) return '';
    const normalized = role.trim();
    if (normalized === 'Engineer') return 'Chief Engineer';
    if (normalized === 'Steward') return 'Crew Member';
    return normalized;
  }

  private isSystemAdmin(role?: string | null) {
    return this.normalizeRole(role) === 'SystemAdmin';
  }

  private isViewerRole(role?: string | null) {
    const normalized = this.normalizeRole(role);
    return [
      'Crew Member',
      'HoD',
      'Chief Engineer',
      'Captain',
      'Management/Office',
      'Admin',
      'SystemAdmin',
    ].includes(normalized);
  }

  private isCreatorRole(role?: string | null) {
    const normalized = this.normalizeRole(role);
    return ['Crew Member', 'Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin'].includes(normalized);
  }

  private isApproverRole(role?: string | null) {
    const normalized = this.normalizeRole(role);
    return ['Captain', 'Admin', 'SystemAdmin'].includes(normalized);
  }

  private isOrderingRole(role?: string | null) {
    const normalized = this.normalizeRole(role);
    return ['Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin'].includes(normalized);
  }

  private isReceivingRole(role?: string | null) {
    const normalized = this.normalizeRole(role);
    return ['Chief Engineer', 'Captain', 'Admin', 'SystemAdmin'].includes(normalized);
  }

  private assertYachtScope(yachtId: string, actor: ActorContext) {
    if (!yachtId) {
      throw new BadRequestException('yachtId is required');
    }
    if (this.isSystemAdmin(actor.role)) return;
    if (!actor.yachtIds.includes(yachtId)) {
      throw new ForbiddenException('Yacht scope violation');
    }
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  private parsePage(input: string | undefined, defaultValue: number) {
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed < 1) return defaultValue;
    return Math.floor(parsed);
  }

  private sanitizeText(value: string | undefined | null, maxLength: number) {
    const text = String(value || '').trim();
    if (!text) return null;
    return text.slice(0, maxLength);
  }

  private parseOptionalDate(value: string | undefined, field: string): Date | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return parsed;
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async listYachtUsersByRoles(yachtId: string, roles: string[]) {
    const targetRoles = new Set(roles.map((role) => this.normalizeRole(role)));

    const rows = await this.prisma.userYachtAccess.findMany({
      where: {
        yachtId,
        revokedAt: null,
        user: { isActive: true },
      },
      include: {
        user: {
          select: {
            id: true,
            role: {
              select: { name: true },
            },
          },
        },
      },
    });

    return rows
      .filter((row) => {
        const effectiveRole = this.normalizeRole(row.roleNameOverride || row.user.role?.name || '');
        return targetRoles.has(effectiveRole);
      })
      .map((row) => row.user.id);
  }

  private async resolveRecipients(
    yachtId: string,
    input: {
      requestedByUserId?: string | null;
      approvedByUserId?: string | null;
      includeApprovers?: boolean;
      includeEngineers?: boolean;
      extraUserIds?: string[];
    },
  ) {
    const approvers = input.includeApprovers
      ? await this.listYachtUsersByRoles(yachtId, ['Captain', 'Admin', 'SystemAdmin'])
      : [];
    const engineers = input.includeEngineers
      ? await this.listYachtUsersByRoles(yachtId, ['Chief Engineer'])
      : [];

    return Array.from(
      new Set(
        [
          ...(input.extraUserIds || []),
          ...(input.requestedByUserId ? [input.requestedByUserId] : []),
          ...(input.approvedByUserId ? [input.approvedByUserId] : []),
          ...approvers,
          ...engineers,
        ].filter(Boolean),
      ),
    );
  }

  private async notifyUsers(
    userIds: string[],
    yachtId: string,
    type: string,
    dedupeKeyBase: string,
    payload: Prisma.JsonObject,
  ) {
    const uniqueUsers = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueUsers.length === 0) return;

    await Promise.all(
      uniqueUsers.map((userId) =>
        this.notificationsService.createInApp({
          userId,
          yachtId,
          type,
          dedupeKey: `${dedupeKeyBase}-${userId}`,
          payload,
        }),
      ),
    );

    await this.notificationRulesService.dispatchCandidates([
      {
        type,
        module: 'purchase_orders',
        yachtId,
        entityType: 'PurchaseOrder',
        entityId: typeof payload.purchaseOrderId === 'string' ? payload.purchaseOrderId : undefined,
        severity: this.resolveNotificationSeverity(type),
        payload: payload as Record<string, unknown>,
        assigneeUserId: uniqueUsers[0] ?? null,
        occurredAt: new Date(),
      },
    ]);
  }

  private resolveNotificationSeverity(type: string): 'info' | 'warn' | 'critical' {
    if (type.includes('cancelled')) return 'critical';
    if (type.includes('submitted')) return 'warn';
    return 'info';
  }

  private async createAudit(
    actorId: string,
    action: string,
    entityId: string,
    beforeJson: Prisma.InputJsonValue | null,
    afterJson: Prisma.InputJsonValue | null,
  ) {
    await this.prisma.auditEvent.create({
      data: {
        module: 'purchase_orders',
        entityType: 'PurchaseOrder',
        entityId,
        action,
        actorId,
        beforeJson: beforeJson ?? Prisma.DbNull,
        afterJson: afterJson ?? Prisma.DbNull,
        source: 'api',
      },
    });
  }

  private async buildAuditTrail(entityId: string) {
    const rows = await this.prisma.auditEvent.findMany({
      where: {
        module: 'purchase_orders',
        entityType: 'PurchaseOrder',
        entityId,
      },
      orderBy: { timestamp: 'desc' },
      take: 120,
    });

    const actorIds = Array.from(new Set(rows.map((row) => row.actorId).filter(Boolean)));
    const users = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, fullName: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((user) => [user.id, user.fullName || user.email]));

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorId: row.actorId,
      actorName: userMap.get(row.actorId) || row.actorId,
      timestamp: row.timestamp,
      beforeJson: row.beforeJson,
      afterJson: row.afterJson,
      source: row.source,
    }));
  }

  private async nextPoNumber(tx: Prisma.TransactionClient, yachtId: string) {
    const year = new Date().getUTCFullYear();
    const prefix = `PO-${year}-`;

    const last = await tx.purchaseOrder.findFirst({
      where: {
        yachtId,
        poNumber: {
          startsWith: prefix,
        },
      },
      orderBy: { poNumber: 'desc' },
      select: { poNumber: true },
    });

    const currentSeq = last?.poNumber ? Number(last.poNumber.split('-').pop() || 0) : 0;
    const nextSeq = Number.isFinite(currentSeq) ? currentSeq + 1 : 1;
    return `${prefix}${String(nextSeq).padStart(6, '0')}`;
  }

  private async validateAndNormalizeLines(
    yachtId: string,
    lines: PurchaseOrderLineInputDto[],
  ) {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new BadRequestException('Purchase order requires at least one line');
    }

    const itemIds = Array.from(new Set(lines.map((line) => line.itemId).filter(Boolean) as string[]));
    const items = itemIds.length
      ? await this.prisma.inventoryItem.findMany({
          where: {
            id: { in: itemIds },
            yachtId,
          },
          select: {
            id: true,
          },
        })
      : [];
    const itemSet = new Set(items.map((item) => item.id));

    return lines.map((line, index) => {
      if (!line.itemId && !line.freeTextName?.trim()) {
        throw new BadRequestException(`Line ${index + 1} requires itemId or freeTextName`);
      }
      if (line.itemId && !itemSet.has(line.itemId)) {
        throw new BadRequestException(`Line ${index + 1} itemId does not belong to this yacht`);
      }

      const requiredByAt = this.parseOptionalDate(line.requiredByAt, `lines[${index}].requiredByAt`);
      const taxRate = line.taxRate ?? 0;
      const lineSubtotal = this.roundMoney(line.quantityOrdered * line.unitPrice);
      const lineTax = this.roundMoney(lineSubtotal * (taxRate / 100));

      return {
        itemId: line.itemId || null,
        freeTextName: this.sanitizeText(line.freeTextName, 180),
        quantityOrdered: line.quantityOrdered,
        unitPrice: line.unitPrice,
        taxRate,
        quantityReceived: 0,
        requiredByAt,
        notes: this.sanitizeText(line.notes, 600),
        lineSubtotal,
        lineTax,
      };
    });
  }

  private calculateTotals(
    lines: Array<{
      lineSubtotal: number;
      lineTax: number;
    }>,
  ) {
    const subtotal = this.roundMoney(lines.reduce((sum, line) => sum + line.lineSubtotal, 0));
    const tax = this.roundMoney(lines.reduce((sum, line) => sum + line.lineTax, 0));
    const total = this.roundMoney(subtotal + tax);
    return { subtotal, tax, total };
  }

  private async getPurchaseOrderWithScope(id: string, actor: ActorContext) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                sku: true,
                unit: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        receipts: {
          include: {
            lines: true,
          },
          orderBy: { receivedAt: 'desc' },
        },
        attachments: {
          orderBy: { uploadedAt: 'desc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Purchase order not found');
    }

    this.assertYachtScope(order.yachtId, actor);
    return order;
  }

  private assertEditable(order: { status: PurchaseOrderStatus; lockedAt: Date | null }, role: string) {
    if (order.status === 'draft' || order.status === 'submitted') return;
    if (this.normalizeRole(role) === 'Admin' || this.normalizeRole(role) === 'SystemAdmin') return;
    throw new ConflictException('Only draft/submitted purchase orders can be edited');
  }

  async listPurchaseOrders(yachtId: string, query: ListPurchaseOrdersQueryDto, actor: ActorContext) {
    if (!this.isViewerRole(actor.role)) {
      throw new ForbiddenException('Role is not allowed to access purchase orders');
    }
    this.assertYachtScope(yachtId, actor);

    const page = this.parsePage(query.page, 1);
    const pageSize = Math.min(this.parsePage(query.pageSize, 25), 100);

    const where: Prisma.PurchaseOrderWhereInput = {
      yachtId,
      ...(query.status ? { status: query.status as PurchaseOrderStatus } : {}),
      ...(query.vendor
        ? {
            vendorName: {
              contains: query.vendor.trim(),
              mode: 'insensitive',
            },
          }
        : {}),
    };

    if (query.from || query.to) {
      where.createdAt = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }

    const [total, items] = await Promise.all([
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.findMany({
        where,
        include: {
          lines: true,
          receipts: {
            select: {
              id: true,
              receivedAt: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async createPurchaseOrder(yachtId: string, dto: CreatePurchaseOrderDto, actor: ActorContext) {
    if (!this.isCreatorRole(actor.role)) {
      throw new ForbiddenException('Role is not allowed to create purchase orders');
    }
    this.assertYachtScope(yachtId, actor);

    const expectedDeliveryAt = this.parseOptionalDate(dto.expectedDeliveryAt, 'expectedDeliveryAt');
    const normalizedLines = await this.validateAndNormalizeLines(yachtId, dto.lines);
    const totals = this.calculateTotals(normalizedLines);

    const created = await this.prisma.$transaction(async (tx) => {
      const poNumber = await this.nextPoNumber(tx, yachtId);
      const order = await tx.purchaseOrder.create({
        data: {
          yachtId,
          poNumber,
          vendorName: dto.vendorName.trim(),
          vendorEmail: this.sanitizeText(dto.vendorEmail, 180),
          vendorPhone: this.sanitizeText(dto.vendorPhone, 40),
          expectedDeliveryAt,
          notes: this.sanitizeText(dto.notes, 1200),
          requestedByUserId: actor.userId,
          subtotal: totals.subtotal,
          tax: totals.tax,
          total: totals.total,
          lines: {
            create: normalizedLines.map((line) => ({
              itemId: line.itemId,
              freeTextName: line.freeTextName,
              quantityOrdered: line.quantityOrdered,
              unitPrice: line.unitPrice,
              taxRate: line.taxRate,
              quantityReceived: 0,
              requiredByAt: line.requiredByAt,
              notes: line.notes,
            })),
          },
        },
        include: {
          lines: true,
        },
      });

      await tx.auditEvent.create({
        data: {
          module: 'purchase_orders',
          entityType: 'PurchaseOrder',
          entityId: order.id,
          action: 'po_created',
          actorId: actor.userId,
          beforeJson: Prisma.DbNull,
          afterJson: this.toJson(order),
          source: 'api',
        },
      });

      return order;
    });

    const recipients = await this.resolveRecipients(yachtId, {
      requestedByUserId: actor.userId,
      includeApprovers: true,
    });
    await this.notifyUsers(recipients, yachtId, 'po.created', `po-created-${created.id}`, {
      purchaseOrderId: created.id,
      poNumber: created.poNumber,
      vendorName: created.vendorName,
      status: created.status,
      actionUrl: `/yachts/${yachtId}/purchase-orders?poId=${created.id}`,
    });

    return this.getPurchaseOrder(created.id, actor);
  }

  async getPurchaseOrder(id: string, actor: ActorContext) {
    if (!this.isViewerRole(actor.role)) {
      throw new ForbiddenException('Role is not allowed to view purchase orders');
    }

    const order = await this.getPurchaseOrderWithScope(id, actor);
    const auditTrail = await this.buildAuditTrail(order.id);
    return { ...order, auditTrail };
  }

  async updatePurchaseOrder(id: string, dto: UpdatePurchaseOrderDto, actor: ActorContext) {
    if (!this.isCreatorRole(actor.role)) {
      throw new ForbiddenException('Role is not allowed to update purchase orders');
    }
    const current = await this.getPurchaseOrderWithScope(id, actor);
    this.assertEditable(current, actor.role);

    const patch: Prisma.PurchaseOrderUpdateInput = {};
    if (dto.vendorName !== undefined) patch.vendorName = dto.vendorName.trim();
    if (dto.vendorEmail !== undefined) patch.vendorEmail = this.sanitizeText(dto.vendorEmail, 180);
    if (dto.vendorPhone !== undefined) patch.vendorPhone = this.sanitizeText(dto.vendorPhone, 40);
    if (dto.notes !== undefined) patch.notes = this.sanitizeText(dto.notes, 1200);
    if (dto.expectedDeliveryAt !== undefined) {
      patch.expectedDeliveryAt = this.parseOptionalDate(dto.expectedDeliveryAt, 'expectedDeliveryAt');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.lines) {
        if (current.lines.some((line) => line.quantityReceived > 0)) {
          throw new ConflictException('Cannot replace lines after receiving quantities');
        }

        const normalizedLines = await this.validateAndNormalizeLines(current.yachtId, dto.lines);
        const totals = this.calculateTotals(normalizedLines);
        patch.subtotal = totals.subtotal;
        patch.tax = totals.tax;
        patch.total = totals.total;

        await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: current.id } });
        await tx.purchaseOrderLine.createMany({
          data: normalizedLines.map((line) => ({
            purchaseOrderId: current.id,
            itemId: line.itemId,
            freeTextName: line.freeTextName,
            quantityOrdered: line.quantityOrdered,
            unitPrice: line.unitPrice,
            taxRate: line.taxRate,
            quantityReceived: 0,
            requiredByAt: line.requiredByAt,
            notes: line.notes,
          })),
        });
      }

      const order = await tx.purchaseOrder.update({
        where: { id },
        data: patch,
      });

      await tx.auditEvent.create({
        data: {
          module: 'purchase_orders',
          entityType: 'PurchaseOrder',
          entityId: order.id,
          action: 'po_updated',
          actorId: actor.userId,
          beforeJson: this.toJson(current),
          afterJson: this.toJson(order),
          source: 'api',
        },
      });

      return order;
    });

    const recipients = await this.resolveRecipients(updated.yachtId, {
      requestedByUserId: updated.requestedByUserId,
      includeApprovers: true,
    });
    await this.notifyUsers(recipients, updated.yachtId, 'po.updated', `po-updated-${updated.id}-${Date.now()}`, {
      purchaseOrderId: updated.id,
      poNumber: updated.poNumber,
      vendorName: updated.vendorName,
      status: updated.status,
      actionUrl: `/yachts/${updated.yachtId}/purchase-orders?poId=${updated.id}`,
    });

    return this.getPurchaseOrder(updated.id, actor);
  }

  async submitPurchaseOrder(id: string, dto: PurchaseOrderActionReasonDto, actor: ActorContext) {
    if (!this.isCreatorRole(actor.role)) {
      throw new ForbiddenException('Role is not allowed to submit purchase orders');
    }
    const current = await this.getPurchaseOrderWithScope(id, actor);
    if (current.status !== 'draft') {
      throw new ConflictException('Only draft purchase orders can be submitted');
    }

    const submitted = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'submitted' },
    });

    await this.createAudit(actor.userId, 'po_submitted', submitted.id, this.toJson(current), this.toJson(submitted));

    const recipients = await this.resolveRecipients(submitted.yachtId, {
      requestedByUserId: submitted.requestedByUserId,
      includeApprovers: true,
    });
    await this.notifyUsers(recipients, submitted.yachtId, 'po.submitted', `po-submitted-${submitted.id}`, {
      purchaseOrderId: submitted.id,
      poNumber: submitted.poNumber,
      vendorName: submitted.vendorName,
      status: submitted.status,
      reason: dto.reason.trim(),
      actionUrl: `/yachts/${submitted.yachtId}/purchase-orders?poId=${submitted.id}`,
    });

    return this.getPurchaseOrder(submitted.id, actor);
  }

  async approvePurchaseOrder(id: string, dto: PurchaseOrderActionReasonDto, actor: ActorContext) {
    if (!this.isApproverRole(actor.role)) {
      throw new ForbiddenException('Only Captain/Admin/SystemAdmin can approve purchase orders');
    }
    const current = await this.getPurchaseOrderWithScope(id, actor);
    if (current.status !== 'submitted') {
      throw new ConflictException('Only submitted purchase orders can be approved');
    }

    const approvedAt = new Date();
    const approved = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'approved',
        approvedAt,
        approvedByUserId: actor.userId,
        lockedAt: approvedAt,
      },
    });

    await this.createAudit(actor.userId, 'po_approved', approved.id, this.toJson(current), this.toJson(approved));

    const recipients = await this.resolveRecipients(approved.yachtId, {
      requestedByUserId: approved.requestedByUserId,
      approvedByUserId: approved.approvedByUserId,
      includeApprovers: true,
      includeEngineers: true,
    });
    await this.notifyUsers(recipients, approved.yachtId, 'po.approved', `po-approved-${approved.id}`, {
      purchaseOrderId: approved.id,
      poNumber: approved.poNumber,
      vendorName: approved.vendorName,
      status: approved.status,
      reason: dto.reason.trim(),
      actionUrl: `/yachts/${approved.yachtId}/purchase-orders?poId=${approved.id}`,
    });

    return this.getPurchaseOrder(approved.id, actor);
  }

  async markOrdered(id: string, dto: PurchaseOrderActionReasonDto, actor: ActorContext) {
    if (!this.isOrderingRole(actor.role)) {
      throw new ForbiddenException('Role is not allowed to mark purchase order as ordered');
    }
    const current = await this.getPurchaseOrderWithScope(id, actor);
    if (current.status !== 'approved') {
      throw new ConflictException('Only approved purchase orders can move to ordered');
    }

    const ordered = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'ordered' },
    });

    await this.createAudit(actor.userId, 'po_ordered', ordered.id, this.toJson(current), this.toJson(ordered));

    const recipients = await this.resolveRecipients(ordered.yachtId, {
      requestedByUserId: ordered.requestedByUserId,
      approvedByUserId: ordered.approvedByUserId,
      includeApprovers: true,
      includeEngineers: true,
    });
    await this.notifyUsers(recipients, ordered.yachtId, 'po.ordered', `po-ordered-${ordered.id}`, {
      purchaseOrderId: ordered.id,
      poNumber: ordered.poNumber,
      vendorName: ordered.vendorName,
      status: ordered.status,
      reason: dto.reason.trim(),
      actionUrl: `/yachts/${ordered.yachtId}/purchase-orders?poId=${ordered.id}`,
    });

    return this.getPurchaseOrder(ordered.id, actor);
  }

  async receivePurchaseOrder(id: string, dto: ReceivePurchaseOrderDto, actor: ActorContext) {
    if (!this.isReceivingRole(actor.role)) {
      throw new ForbiddenException('Role is not allowed to receive purchase orders');
    }
    const current = await this.getPurchaseOrderWithScope(id, actor);
    if (!['ordered', 'partially_received'].includes(current.status)) {
      throw new ConflictException('Only ordered/partially_received purchase orders can be received');
    }
    if (!Array.isArray(dto.lines) || dto.lines.length === 0) {
      throw new BadRequestException('Receipt requires at least one line');
    }

    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    if (Number.isNaN(receivedAt.getTime())) {
      throw new BadRequestException('Invalid receivedAt');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.purchaseOrder.findUnique({
        where: { id: current.id },
        include: {
          lines: true,
        },
      });
      if (!fresh) {
        throw new NotFoundException('Purchase order not found');
      }

      const lineMap = new Map(fresh.lines.map((line) => [line.id, line]));
      const itemStockUpdates: Array<{ itemId: string; minStock: number; currentStock: number }> = [];

      const receipt = await tx.purchaseOrderReceipt.create({
        data: {
          purchaseOrderId: fresh.id,
          yachtId: fresh.yachtId,
          receivedAt,
          receivedByUserId: actor.userId,
          reason: dto.reason.trim(),
        },
      });

      for (const lineInput of dto.lines) {
        const line = lineMap.get(lineInput.purchaseOrderLineId);
        if (!line) {
          throw new BadRequestException(`Invalid purchaseOrderLineId: ${lineInput.purchaseOrderLineId}`);
        }

        const remaining = line.quantityOrdered - line.quantityReceived;
        if (lineInput.quantityReceived > remaining + 0.000001) {
          throw new BadRequestException(`Line ${line.id} exceeds remaining quantity`);
        }

        await tx.purchaseOrderReceiptLine.create({
          data: {
            receiptId: receipt.id,
            purchaseOrderLineId: line.id,
            quantityReceived: lineInput.quantityReceived,
          },
        });

        const updatedLine = await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: {
            quantityReceived: {
              increment: lineInput.quantityReceived,
            },
          },
        });

        if (updatedLine.itemId) {
          const stockItem = await tx.inventoryItem.findUnique({
            where: { id: updatedLine.itemId },
          });
          if (!stockItem) {
            throw new BadRequestException(`Inventory item ${updatedLine.itemId} not found`);
          }

          const beforeQty = stockItem.currentStock;
          const afterQty = beforeQty + lineInput.quantityReceived;
          const updatedStock = await tx.inventoryItem.update({
            where: { id: stockItem.id },
            data: { currentStock: afterQty },
          });

          await tx.inventoryMovement.create({
            data: {
              yachtId: fresh.yachtId,
              itemId: stockItem.id,
              type: 'in',
              quantity: lineInput.quantityReceived,
              reason: `Recepcion ${fresh.poNumber}: ${dto.reason.trim()}`,
              referenceType: 'po',
              referenceId: fresh.id,
              purchaseOrderId: fresh.id,
              performedByUserId: actor.userId,
              occurredAt: receivedAt,
              beforeQty,
              afterQty,
            },
          });

          itemStockUpdates.push({
            itemId: updatedStock.id,
            minStock: updatedStock.minStock,
            currentStock: updatedStock.currentStock,
          });
        }
      }

      const finalLines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: fresh.id },
      });
      const allReceived = finalLines.every((line) => line.quantityReceived >= line.quantityOrdered);
      const someReceived = finalLines.some((line) => line.quantityReceived > 0);
      const nextStatus: PurchaseOrderStatus = allReceived
        ? 'received'
        : someReceived
          ? 'partially_received'
          : fresh.status;

      const order = await tx.purchaseOrder.update({
        where: { id: fresh.id },
        data: {
          status: nextStatus,
        },
      });

      await tx.auditEvent.create({
        data: {
          module: 'purchase_orders',
          entityType: 'PurchaseOrder',
          entityId: order.id,
          action: 'po_received',
          actorId: actor.userId,
          beforeJson: this.toJson(current),
          afterJson: this.toJson({
            status: order.status,
            receiptId: receipt.id,
            lines: dto.lines,
          }),
          source: 'api',
        },
      });

      return {
        order,
        receipt,
        itemStockUpdates,
      };
    });

    for (const item of result.itemStockUpdates) {
      if (item.currentStock > item.minStock && item.currentStock > 0) {
        await this.alertsService.resolveByDedupeKey(`inventory-item-${item.itemId}-low-stock`);
        await this.alertsService.resolveByDedupeKey(`inventory-item-${item.itemId}-stockout`);
      }
    }

    const recipients = await this.resolveRecipients(result.order.yachtId, {
      requestedByUserId: result.order.requestedByUserId,
      approvedByUserId: result.order.approvedByUserId,
      includeApprovers: true,
      includeEngineers: true,
      extraUserIds: [actor.userId],
    });
    await this.notifyUsers(recipients, result.order.yachtId, 'po.received', `po-received-${result.order.id}-${result.receipt.id}`, {
      purchaseOrderId: result.order.id,
      poNumber: result.order.poNumber,
      vendorName: result.order.vendorName,
      status: result.order.status,
      receiptId: result.receipt.id,
      reason: dto.reason.trim(),
      actionUrl: `/yachts/${result.order.yachtId}/purchase-orders?poId=${result.order.id}`,
    });

    return this.getPurchaseOrder(result.order.id, actor);
  }

  async cancelPurchaseOrder(id: string, dto: PurchaseOrderActionReasonDto, actor: ActorContext) {
    if (!this.isOrderingRole(actor.role)) {
      throw new ForbiddenException('Role is not allowed to cancel purchase orders');
    }
    const current = await this.getPurchaseOrderWithScope(id, actor);
    if (current.status === 'received' || current.status === 'cancelled') {
      throw new ConflictException('Purchase order cannot be cancelled in this state');
    }

    const cancelled = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    await this.createAudit(actor.userId, 'po_cancelled', cancelled.id, this.toJson(current), this.toJson(cancelled));

    const recipients = await this.resolveRecipients(cancelled.yachtId, {
      requestedByUserId: cancelled.requestedByUserId,
      approvedByUserId: cancelled.approvedByUserId,
      includeApprovers: true,
      includeEngineers: true,
    });
    await this.notifyUsers(recipients, cancelled.yachtId, 'po.cancelled', `po-cancelled-${cancelled.id}`, {
      purchaseOrderId: cancelled.id,
      poNumber: cancelled.poNumber,
      vendorName: cancelled.vendorName,
      status: cancelled.status,
      reason: dto.reason.trim(),
      actionUrl: `/yachts/${cancelled.yachtId}/purchase-orders?poId=${cancelled.id}`,
    });

    return this.getPurchaseOrder(cancelled.id, actor);
  }

  async addAttachment(id: string, dto: AddPurchaseOrderAttachmentDto, actor: ActorContext) {
    if (!this.isCreatorRole(actor.role)) {
      throw new ForbiddenException('Role is not allowed to attach files to purchase orders');
    }
    const order = await this.getPurchaseOrderWithScope(id, actor);

    let resolvedUrl = this.sanitizeText(dto.fileUrl, 2000);
    if (!resolvedUrl && dto.fileKey) {
      resolvedUrl = await this.storageService.getSignedUrl({ fileKey: dto.fileKey });
    }
    if (!resolvedUrl) {
      throw new BadRequestException('fileKey or fileUrl is required');
    }

    const attachment = await this.prisma.purchaseOrderAttachment.create({
      data: {
        purchaseOrderId: order.id,
        fileKey: this.sanitizeText(dto.fileKey, 220),
        fileUrl: resolvedUrl,
        fileName: dto.fileName.trim(),
        mimeType: dto.mimeType.trim(),
        sizeBytes: dto.sizeBytes ?? null,
        uploadedByUserId: actor.userId,
        note: this.sanitizeText(dto.note, 600),
      },
    });

    await this.createAudit(
      actor.userId,
      'po_attachment_added',
      order.id,
      null,
      this.toJson({
        attachmentId: attachment.id,
        fileName: attachment.fileName,
      }),
    );

    const recipients = await this.resolveRecipients(order.yachtId, {
      requestedByUserId: order.requestedByUserId,
      approvedByUserId: order.approvedByUserId,
      includeApprovers: true,
      includeEngineers: true,
    });
    await this.notifyUsers(recipients, order.yachtId, 'po.updated', `po-attachment-${order.id}-${attachment.id}`, {
      purchaseOrderId: order.id,
      poNumber: order.poNumber,
      vendorName: order.vendorName,
      status: order.status,
      actionUrl: `/yachts/${order.yachtId}/purchase-orders?poId=${order.id}`,
    });

    return attachment;
  }
}

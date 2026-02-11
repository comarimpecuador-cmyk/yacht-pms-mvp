import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';
import { AlertsService } from '../alerts/alerts.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma.service';
import {
  CreateInventoryItemDto,
  CreateInventoryMovementDto,
  ListInventoryItemsQueryDto,
  ListInventoryMovementsQueryDto,
  UpdateInventoryItemDto,
} from './dto';

type ActorContext = {
  userId: string;
  role: string;
  yachtIds: string[];
};

type StockState = 'ok' | 'low' | 'out';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly alertsService: AlertsService,
  ) {}

  status() {
    return { module: 'inventory', ready: true };
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

  private isManagerRole(role?: string | null) {
    const normalized = this.normalizeRole(role);
    return ['Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin'].includes(normalized);
  }

  private isAdjustmentRole(role?: string | null) {
    const normalized = this.normalizeRole(role);
    return ['Chief Engineer', 'Captain', 'Admin', 'SystemAdmin'].includes(normalized);
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

  private assertCanView(role: string) {
    if (!this.isViewerRole(role)) {
      throw new ForbiddenException('Role is not allowed to access inventory');
    }
  }

  private assertCanManage(role: string) {
    if (!this.isManagerRole(role)) {
      throw new ForbiddenException('Role is not allowed to manage inventory items');
    }
  }

  private assertCanRegisterMovement(role: string, type: InventoryMovementType) {
    if (!this.isViewerRole(role)) {
      throw new ForbiddenException('Role is not allowed to register inventory movements');
    }
    if (type === 'adjustment' && !this.isAdjustmentRole(role)) {
      throw new ForbiddenException('Only Chief Engineer/Captain/Admin/SystemAdmin can adjust stock');
    }
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

  private sanitizeText(value: string | undefined | null, maxLength: number) {
    const text = String(value || '').trim();
    if (!text) return null;
    return text.slice(0, maxLength);
  }

  private parsePage(input: string | undefined, defaultValue: number) {
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed < 1) return defaultValue;
    return Math.floor(parsed);
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  private stockState(currentStock: number, minStock: number): StockState {
    if (currentStock <= 0) return 'out';
    if (currentStock <= minStock) return 'low';
    return 'ok';
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

  private async resolveRecipients(yachtId: string, extraUserIds: string[] = []) {
    const mainRoles = await this.listYachtUsersByRoles(yachtId, [
      'Captain',
      'Chief Engineer',
      'Management/Office',
      'Admin',
      'SystemAdmin',
    ]);

    return Array.from(new Set([...mainRoles, ...extraUserIds].filter(Boolean)));
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
        module: 'inventory',
        entityType: 'InventoryItem',
        entityId,
        action,
        actorId,
        beforeJson: beforeJson ?? Prisma.DbNull,
        afterJson: afterJson ?? Prisma.DbNull,
        source: 'api',
      },
    });
  }

  private async syncStockAlerts(
    input: {
      itemId: string;
      yachtId: string;
      itemName: string;
      minStock: number;
      currentStock: number;
      actorUserId: string;
      previousState: StockState | null;
    },
  ) {
    const lowDedupe = `inventory-item-${input.itemId}-low-stock`;
    const outDedupe = `inventory-item-${input.itemId}-stockout`;
    const nextState = this.stockState(input.currentStock, input.minStock);

    if (nextState === 'out') {
      await this.alertsService.resolveByDedupeKey(lowDedupe);
      await this.alertsService.upsertAlert({
        yachtId: input.yachtId,
        module: 'inventory',
        alertType: 'INV_STOCKOUT',
        severity: 'critical',
        dedupeKey: outDedupe,
        entityId: input.itemId,
        dueAt: new Date(),
      });
    } else if (nextState === 'low') {
      await this.alertsService.resolveByDedupeKey(outDedupe);
      await this.alertsService.upsertAlert({
        yachtId: input.yachtId,
        module: 'inventory',
        alertType: 'INV_LOW_STOCK',
        severity: 'warn',
        dedupeKey: lowDedupe,
        entityId: input.itemId,
        dueAt: new Date(),
      });
    } else {
      await this.alertsService.resolveByDedupeKey(lowDedupe);
      await this.alertsService.resolveByDedupeKey(outDedupe);
    }

    if (input.previousState === nextState) {
      return;
    }

    const recipients = await this.resolveRecipients(input.yachtId, [input.actorUserId]);
    if (nextState === 'low') {
      await this.notifyUsers(recipients, input.yachtId, 'inventory.low_stock', `inventory-low-${input.itemId}-${Date.now()}`, {
        itemId: input.itemId,
        itemName: input.itemName,
        currentStock: input.currentStock,
        minStock: input.minStock,
        actionUrl: `/yachts/${input.yachtId}/inventory?itemId=${input.itemId}`,
      });
    } else if (nextState === 'out') {
      await this.notifyUsers(recipients, input.yachtId, 'inventory.stockout', `inventory-out-${input.itemId}-${Date.now()}`, {
        itemId: input.itemId,
        itemName: input.itemName,
        currentStock: input.currentStock,
        minStock: input.minStock,
        actionUrl: `/yachts/${input.yachtId}/inventory?itemId=${input.itemId}`,
      });
    }
  }

  private async getItemWithScope(itemId: string, actor: ActorContext) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: itemId },
      include: {
        engine: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Inventory item not found');
    }
    this.assertYachtScope(item.yachtId, actor);
    return item;
  }

  async listItems(yachtId: string, query: ListInventoryItemsQueryDto, actor: ActorContext) {
    this.assertCanView(actor.role);
    this.assertYachtScope(yachtId, actor);

    const page = this.parsePage(query.page, 1);
    const pageSize = Math.min(this.parsePage(query.pageSize, 25), 100);
    const lowStockOnly = ['true', '1'].includes(String(query.lowStock || '').toLowerCase());

    const where: Prisma.InventoryItemWhereInput = {
      yachtId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search.trim(), mode: 'insensitive' } },
              { sku: { contains: query.search.trim(), mode: 'insensitive' } },
              { description: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    if (lowStockOnly) {
      const allRows = await this.prisma.inventoryItem.findMany({
        where,
        include: {
          engine: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      });

      const filtered = allRows.filter((item) => item.currentStock <= item.minStock);
      const total = filtered.length;
      const start = (page - 1) * pageSize;
      const items = filtered.slice(start, start + pageSize);

      return {
        items,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      };
    }

    const [total, items] = await Promise.all([
      this.prisma.inventoryItem.count({ where }),
      this.prisma.inventoryItem.findMany({
        where,
        include: {
          engine: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
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

  async createItem(yachtId: string, dto: CreateInventoryItemDto, actor: ActorContext) {
    this.assertCanManage(actor.role);
    this.assertYachtScope(yachtId, actor);

    if (dto.engineId) {
      const engine = await this.prisma.engine.findUnique({ where: { id: dto.engineId } });
      if (!engine || engine.yachtId !== yachtId) {
        throw new BadRequestException('engineId does not belong to this yacht');
      }
    }

    const created = await this.prisma.inventoryItem.create({
      data: {
        yachtId,
        sku: this.sanitizeText(dto.sku, 80),
        name: dto.name.trim(),
        description: this.sanitizeText(dto.description, 1200),
        category: dto.category,
        unit: dto.unit.trim(),
        location: this.sanitizeText(dto.location, 120),
        minStock: dto.minStock ?? 0,
        currentStock: dto.currentStock ?? 0,
        engineId: dto.engineId ?? null,
        isActive: dto.isActive ?? true,
        createdByUserId: actor.userId,
      },
      include: {
        engine: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await this.createAudit(actor.userId, 'item_created', created.id, null, this.toJson(created));

    const recipients = await this.resolveRecipients(yachtId, [actor.userId]);
    await this.notifyUsers(recipients, yachtId, 'inventory.item_created', `inventory-item-created-${created.id}`, {
      itemId: created.id,
      itemName: created.name,
      currentStock: created.currentStock,
      minStock: created.minStock,
      actionUrl: `/yachts/${yachtId}/inventory?itemId=${created.id}`,
    });

    await this.syncStockAlerts({
      itemId: created.id,
      yachtId,
      itemName: created.name,
      minStock: created.minStock,
      currentStock: created.currentStock,
      actorUserId: actor.userId,
      previousState: null,
    });

    return created;
  }

  async getItem(itemId: string, actor: ActorContext) {
    this.assertCanView(actor.role);
    const item = await this.getItemWithScope(itemId, actor);

    const movements = await this.prisma.inventoryMovement.findMany({
      where: { itemId },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 120,
    });

    return {
      ...item,
      movements,
    };
  }

  async updateItem(itemId: string, dto: UpdateInventoryItemDto, actor: ActorContext) {
    this.assertCanManage(actor.role);
    const current = await this.getItemWithScope(itemId, actor);

    if (dto.engineId) {
      const engine = await this.prisma.engine.findUnique({ where: { id: dto.engineId } });
      if (!engine || engine.yachtId !== current.yachtId) {
        throw new BadRequestException('engineId does not belong to this yacht');
      }
    }

    const patch: Prisma.InventoryItemUpdateInput = {};
    if (dto.sku !== undefined) patch.sku = this.sanitizeText(dto.sku, 80);
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.description !== undefined) patch.description = this.sanitizeText(dto.description, 1200);
    if (dto.category !== undefined) patch.category = dto.category;
    if (dto.unit !== undefined) patch.unit = dto.unit.trim();
    if (dto.location !== undefined) patch.location = this.sanitizeText(dto.location, 120);
    if (dto.minStock !== undefined) patch.minStock = dto.minStock;
    if (dto.engineId !== undefined) {
      patch.engine = dto.engineId
        ? { connect: { id: dto.engineId } }
        : { disconnect: true };
    }
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('No inventory fields to update');
    }

    const updated = await this.prisma.inventoryItem.update({
      where: { id: itemId },
      data: patch,
      include: {
        engine: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await this.createAudit(actor.userId, 'item_updated', updated.id, this.toJson(current), this.toJson(updated));

    const recipients = await this.resolveRecipients(updated.yachtId, [actor.userId]);
    await this.notifyUsers(recipients, updated.yachtId, 'inventory.item_updated', `inventory-item-updated-${updated.id}-${Date.now()}`, {
      itemId: updated.id,
      itemName: updated.name,
      currentStock: updated.currentStock,
      minStock: updated.minStock,
      actionUrl: `/yachts/${updated.yachtId}/inventory?itemId=${updated.id}`,
    });

    await this.syncStockAlerts({
      itemId: updated.id,
      yachtId: updated.yachtId,
      itemName: updated.name,
      minStock: updated.minStock,
      currentStock: updated.currentStock,
      actorUserId: actor.userId,
      previousState: this.stockState(current.currentStock, current.minStock),
    });

    return updated;
  }

  async createMovement(itemId: string, dto: CreateInventoryMovementDto, actor: ActorContext) {
    this.assertCanView(actor.role);
    const item = await this.getItemWithScope(itemId, actor);
    this.assertCanRegisterMovement(actor.role, dto.type as InventoryMovementType);

    if (!item.isActive) {
      throw new BadRequestException('Cannot move stock for inactive item');
    }

    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException('Invalid occurredAt');
    }

    let delta = 0;
    if (dto.type === 'in' || dto.type === 'transfer_in') {
      delta = dto.quantity;
    } else if (dto.type === 'out' || dto.type === 'transfer_out') {
      delta = -dto.quantity;
    } else if (dto.type === 'adjustment') {
      if (!dto.direction) {
        throw new BadRequestException('direction is required for adjustment movement');
      }
      delta = dto.direction === 'increase' ? dto.quantity : -dto.quantity;
    }

    const beforeQty = item.currentStock;
    const afterQty = beforeQty + delta;
    if (afterQty < 0) {
      throw new BadRequestException('Stock cannot become negative');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const nextItem = await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          currentStock: afterQty,
        },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          yachtId: item.yachtId,
          itemId: item.id,
          type: dto.type as InventoryMovementType,
          quantity: dto.quantity,
          reason: dto.reason.trim(),
          referenceType: dto.referenceType ?? 'manual',
          referenceId: dto.referenceId ?? null,
          maintenanceTaskId: dto.maintenanceTaskId ?? null,
          engineId: dto.engineId ?? item.engineId ?? null,
          purchaseOrderId: dto.referenceType === 'po' ? dto.referenceId ?? null : null,
          performedByUserId: actor.userId,
          occurredAt,
          beforeQty,
          afterQty,
        },
      });

      await tx.auditEvent.create({
        data: {
          module: 'inventory',
          entityType: 'InventoryMovement',
          entityId: movement.id,
          action: 'movement_created',
          actorId: actor.userId,
          beforeJson: Prisma.DbNull,
          afterJson: this.toJson({
            movement,
            itemId: item.id,
            beforeQty,
            afterQty,
          }),
          source: 'api',
        },
      });

      return { movement, item: nextItem };
    });

    const recipients = await this.resolveRecipients(item.yachtId, [actor.userId]);
    await this.notifyUsers(
      recipients,
      item.yachtId,
      'inventory.movement_created',
      `inventory-movement-${updated.movement.id}`,
      {
        movementId: updated.movement.id,
        itemId: item.id,
        itemName: item.name,
        type: dto.type,
        quantity: dto.quantity,
        beforeQty,
        afterQty,
        reason: dto.reason.trim(),
        actionUrl: `/yachts/${item.yachtId}/inventory?itemId=${item.id}`,
      },
    );

    if (dto.type === 'adjustment') {
      await this.notifyUsers(
        recipients,
        item.yachtId,
        'inventory.adjustment',
        `inventory-adjustment-${updated.movement.id}`,
        {
          movementId: updated.movement.id,
          itemId: item.id,
          itemName: item.name,
          quantity: dto.quantity,
          direction: dto.direction || '',
          reason: dto.reason.trim(),
          actionUrl: `/yachts/${item.yachtId}/inventory?itemId=${item.id}`,
        },
      );
    }

    await this.syncStockAlerts({
      itemId: item.id,
      yachtId: item.yachtId,
      itemName: item.name,
      minStock: item.minStock,
      currentStock: afterQty,
      actorUserId: actor.userId,
      previousState: this.stockState(beforeQty, item.minStock),
    });

    return {
      ...updated.movement,
      item: {
        ...item,
        currentStock: afterQty,
      },
    };
  }

  async listMovements(yachtId: string, query: ListInventoryMovementsQueryDto, actor: ActorContext) {
    this.assertCanView(actor.role);
    this.assertYachtScope(yachtId, actor);

    const page = this.parsePage(query.page, 1);
    const pageSize = Math.min(this.parsePage(query.pageSize, 25), 100);

    const where: Prisma.InventoryMovementWhereInput = {
      yachtId,
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.type ? { type: query.type as InventoryMovementType } : {}),
    };

    if (query.from || query.to) {
      where.occurredAt = {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined,
      };
    }

    const [total, items] = await Promise.all([
      this.prisma.inventoryMovement.count({ where }),
      this.prisma.inventoryMovement.findMany({
        where,
        include: {
          item: {
            select: {
              id: true,
              name: true,
              sku: true,
              unit: true,
              minStock: true,
              currentStock: true,
            },
          },
        },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
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
}

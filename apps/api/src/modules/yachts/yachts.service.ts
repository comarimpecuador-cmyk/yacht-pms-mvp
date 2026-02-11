import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LogBookStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import {
  mapLegacyStatusToWorkflowStatus,
  normalizeLegacyLogbookFeedItem,
  normalizeLogbookV2FeedItem,
} from '../logbook-v2/feed-normalizer';
import {
  CreateYachtDto,
  GrantYachtAccessDto,
  UpdateYachtAccessDto,
  UpdateYachtDto,
} from './dto';

type ActivityType = 'logbook' | 'alert' | 'crew' | 'document' | 'inventory' | 'purchase_order';

export interface SummaryActivity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  subtype?: string;
  occurredAt?: string;
  createdAt?: string;
  actor?: string;
  yachtId?: string;
  severity?: string;
  source?: string;
  link?: string;
}

export interface YachtSummaryResponse {
  stats: {
    logbookPending: number;
    logbookPendingReview: number;
    alerts: number;
    crewOnboard: number;
    maintenancePending: number | null;
    maintenanceReady: boolean;
    documentsPendingApproval?: number;
    documentsExpiringSoon?: number;
    inventoryLowStockCount?: number;
    purchaseOrdersPendingApprovalCount?: number;
    purchaseOrdersOpenCount?: number;
  };
  recentActivity: SummaryActivity[];
}

@Injectable()
export class YachtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private getSortTimestamp(item: SummaryActivity): number {
    const primary = item.occurredAt || item.createdAt || item.timestamp;
    const parsed = new Date(primary).getTime();
    if (!Number.isNaN(parsed)) return parsed;

    const fallback = new Date(item.timestamp).getTime();
    if (!Number.isNaN(fallback)) return fallback;
    return 0;
  }

  private getCreatedTimestamp(item: SummaryActivity): number {
    const parsed = new Date(item.createdAt || item.timestamp).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private isEnabled(key: string, defaultValue: boolean): boolean {
    const raw = this.configService.get<string | boolean | undefined>(key);
    if (raw === undefined || raw === null) return defaultValue;
    if (typeof raw === 'boolean') return raw;
    const normalized = String(raw).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }

  private async resolveLogbookCounters(yachtId: string) {
    const v2ReadEnabled = this.isEnabled('LOGBOOK_V2_READ_ENABLED', true);
    const fallbackEnabled = this.isEnabled('LOGBOOK_V2_READ_FALLBACK_LEGACY_ENABLED', true);

    if (v2ReadEnabled) {
      try {
        const grouped = await this.prisma.logbookEventV2.groupBy({
          by: ['workflowStatus'],
          where: { yachtId },
          _count: { _all: true },
        });

        const countByStatus = new Map(grouped.map((row) => [row.workflowStatus, row._count._all]));
        const total = Array.from(countByStatus.values()).reduce((sum, value) => sum + value, 0);

        const v2Result = {
          draft: countByStatus.get('draft') ?? 0,
          pendingReview: countByStatus.get('submitted') ?? 0,
        };

        if (total > 0 || !fallbackEnabled) {
          return v2Result;
        }
      } catch {
        if (!fallbackEnabled) {
          throw new BadRequestException('Logbook V2 is enabled but unavailable');
        }
      }
    }

    const legacyGrouped = await this.prisma.logBookEntry.groupBy({
      by: ['status'],
      where: { yachtId },
      _count: { _all: true },
    });

    let draft = 0;
    let pendingReview = 0;

    for (const row of legacyGrouped) {
      const mapped = mapLegacyStatusToWorkflowStatus(row.status);
      if (mapped === 'draft') {
        draft += row._count._all;
      } else if (mapped === 'submitted') {
        pendingReview += row._count._all;
      }
    }

    return { draft, pendingReview };
  }

  private isSystemAdmin(role: string) {
    return role === 'SystemAdmin';
  }

  private isManager(role: string) {
    return ['Admin', 'Management/Office', 'SystemAdmin'].includes(role);
  }

  private buildDocumentActivityTitle(item: { workflowStatus: string; title: string | null; docType: string }) {
    const base = item.title?.trim() || item.docType;
    if (item.workflowStatus === 'submitted') return `Documento pendiente: ${base}`;
    if (item.workflowStatus === 'approved') return `Documento aprobado: ${base}`;
    if (item.workflowStatus === 'rejected') return `Documento rechazado: ${base}`;
    if (item.workflowStatus === 'archived') return `Documento archivado: ${base}`;
    return `Documento actualizado: ${base}`;
  }

  private buildInventoryMovementTitle(itemName: string, type: string, afterQty: number, minStock: number) {
    if (afterQty <= 0) return `Stock agotado: ${itemName}`;
    if (afterQty <= minStock) return `Stock bajo: ${itemName}`;
    if (type === 'in' || type === 'transfer_in') return `Ingreso de inventario: ${itemName}`;
    if (type === 'out' || type === 'transfer_out') return `Salida de inventario: ${itemName}`;
    if (type === 'adjustment') return `Ajuste de inventario: ${itemName}`;
    return `Movimiento de inventario: ${itemName}`;
  }

  private buildPurchaseOrderActivityTitle(item: { poNumber: string; status: string }) {
    if (item.status === 'submitted') return `PO enviada: ${item.poNumber}`;
    if (item.status === 'approved') return `PO aprobada: ${item.poNumber}`;
    if (item.status === 'ordered') return `PO emitida: ${item.poNumber}`;
    if (item.status === 'partially_received') return `PO parcialmente recibida: ${item.poNumber}`;
    if (item.status === 'received') return `PO recibida: ${item.poNumber}`;
    if (item.status === 'cancelled') return `PO cancelada: ${item.poNumber}`;
    return `PO actualizada: ${item.poNumber}`;
  }

  async createYacht(actorId: string, role: string, dto: CreateYachtDto) {
    if (!this.isSystemAdmin(role)) {
      throw new ForbiddenException('Only SystemAdmin can create yachts');
    }

    const yacht = await this.prisma.yacht.create({
      data: {
        name: dto.name.trim(),
        flag: dto.flag.trim().toUpperCase(),
        isActive: dto.isActive ?? true,
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
        beforeJson: Prisma.DbNull,
        afterJson: yacht,
        source: 'api',
      },
    });

    return yacht;
  }

  async listVisibleYachts(userId: string, role: string) {
    if (this.isSystemAdmin(role)) {
      return this.prisma.yacht.findMany({
        orderBy: { name: 'asc' },
      });
    }

    return this.prisma.yacht.findMany({
      where: {
        isActive: true,
        userAccesses: {
          some: { userId, revokedAt: null },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getVisibleYacht(userId: string, role: string, yachtId: string) {
    const yacht = this.isSystemAdmin(role)
      ? await this.prisma.yacht.findUnique({ where: { id: yachtId } })
      : await this.prisma.yacht.findFirst({
          where: {
            id: yachtId,
            isActive: true,
            userAccesses: {
              some: { userId, revokedAt: null },
            },
          },
        });

    if (!yacht) {
      throw new NotFoundException('Yacht not found');
    }

    return yacht;
  }

  async getYachtSummary(userId: string, role: string, yachtId: string): Promise<YachtSummaryResponse> {
    await this.getVisibleYacht(userId, role, yachtId);

    const now = new Date();
    const expiringWindow = new Date(now);
    expiringWindow.setDate(expiringWindow.getDate() + 7);

    const inventoryLowStockQuery = this.prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(*) AS count
      FROM "InventoryItem"
      WHERE "yachtId" = ${yachtId}
        AND "isActive" = true
        AND "currentStock" <= "minStock"
    `;

    const [
      logbookCounters,
      alertsOpen,
      crewOnboard,
      documentsPendingApproval,
      documentsExpiringSoon,
      inventoryLowStockRows,
      purchaseOrdersPendingApproval,
      purchaseOrdersOpen,
      latestLogbook,
      latestLogbookV2,
      latestAlerts,
      latestCrewChanges,
      latestDocuments,
      latestInventoryMovements,
      latestPurchaseOrders,
    ] = await Promise.all([
      this.resolveLogbookCounters(yachtId),
      this.prisma.alert.count({
        where: { yachtId, resolvedAt: null },
      }),
      this.prisma.userYachtAccess.count({
        where: { yachtId, revokedAt: null, user: { isActive: true } },
      }),
      this.prisma.document.count({
        where: { yachtId, workflowStatus: 'submitted' },
      }),
      this.prisma.document.count({
        where: {
          yachtId,
          expiryDate: { gte: now, lte: expiringWindow },
          status: { not: 'Archived' },
          workflowStatus: { not: 'archived' },
        },
      }),
      inventoryLowStockQuery.catch(() => [] as Array<{ count: bigint | number }>),
      this.prisma.purchaseOrder.count({
        where: { yachtId, status: 'submitted' },
      }).catch(() => 0),
      this.prisma.purchaseOrder.count({
        where: {
          yachtId,
          status: { in: ['ordered', 'partially_received'] },
        },
      }).catch(() => 0),
      this.prisma.logBookEntry.findMany({
        where: { yachtId },
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: {
          id: true,
          watchPeriod: true,
          status: true,
          entryDate: true,
          createdAt: true,
        },
      }),
      this.prisma.logbookEventV2.findMany({
        where: { yachtId },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: 8,
        select: {
          id: true,
          yachtId: true,
          eventType: true,
          title: true,
          description: true,
          severity: true,
          workflowStatus: true,
          occurredAt: true,
          createdAt: true,
          reportedByName: true,
          reportedByRole: true,
          rawJson: true,
        },
      }),
      this.prisma.alert.findMany({
        where: { yachtId, resolvedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: {
          id: true,
          module: true,
          alertType: true,
          severity: true,
          createdAt: true,
        },
      }),
      this.prisma.userYachtAccess.findMany({
        where: { yachtId, revokedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 4,
        include: {
          user: {
            select: {
              fullName: true,
              email: true,
              isActive: true,
            },
          },
        },
      }),
      this.prisma.document.findMany({
        where: { yachtId },
        orderBy: { updatedAt: 'desc' },
        take: 4,
        select: {
          id: true,
          yachtId: true,
          title: true,
          docType: true,
          workflowStatus: true,
          updatedAt: true,
          createdAt: true,
          expiryDate: true,
        },
      }),
      this.prisma.inventoryMovement.findMany({
        where: { yachtId },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: 4,
        select: {
          id: true,
          yachtId: true,
          type: true,
          quantity: true,
          reason: true,
          occurredAt: true,
          createdAt: true,
          afterQty: true,
          itemId: true,
          item: {
            select: {
              name: true,
              minStock: true,
              unit: true,
            },
          },
        },
      }).catch(() => []),
      this.prisma.purchaseOrder.findMany({
        where: { yachtId },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 4,
        select: {
          id: true,
          yachtId: true,
          poNumber: true,
          vendorName: true,
          status: true,
          updatedAt: true,
          createdAt: true,
        },
      }).catch(() => []),
    ]);

    const inventoryLowStockCount = Number(inventoryLowStockRows[0]?.count ?? 0);

    const activity: SummaryActivity[] = [
      ...latestLogbook.map((entry) => ({
        ...normalizeLegacyLogbookFeedItem(entry, yachtId),
        id: `legacy:${entry.id}`,
        source: 'legacy',
      })),
      ...latestLogbookV2.map((event) => normalizeLogbookV2FeedItem(event)),
      ...latestAlerts.map((alert) => ({
        id: `alert-${alert.id}`,
        type: 'alert' as const,
        title: 'Alerta activa',
        description: `${alert.module} - ${alert.alertType} (${alert.severity})`,
        timestamp: alert.createdAt.toISOString(),
        createdAt: alert.createdAt.toISOString(),
        yachtId,
        severity: alert.severity,
        source: 'alert',
        link: '/timeline',
      })),
      ...latestCrewChanges.map((access) => ({
        id: `crew-${access.id}`,
        type: 'crew' as const,
        title: 'Tripulacion actualizada',
        description: `${access.user.fullName || access.user.email} con acceso`,
        timestamp: access.createdAt.toISOString(),
        createdAt: access.createdAt.toISOString(),
        yachtId,
        source: 'crew_access',
      })),
      ...latestDocuments.map((document) => ({
        id: `document:${document.id}`,
        type: 'document' as const,
        title: this.buildDocumentActivityTitle(document),
        description: document.expiryDate
          ? `Tipo ${document.docType} | vence ${document.expiryDate.toISOString().slice(0, 10)}`
          : `Tipo ${document.docType}`,
        timestamp: document.updatedAt.toISOString(),
        occurredAt: document.updatedAt.toISOString(),
        createdAt: document.createdAt.toISOString(),
        yachtId: document.yachtId,
        source: 'documents',
        link: `/yachts/${document.yachtId}/documents?documentId=${document.id}`,
      })),
      ...latestInventoryMovements.map((movement) => {
        const itemName = movement.item?.name || 'Item';
        const title = this.buildInventoryMovementTitle(
          itemName,
          movement.type,
          movement.afterQty,
          movement.item?.minStock ?? 0,
        );
        const severity =
          movement.afterQty <= 0 ? 'critical' : movement.afterQty <= (movement.item?.minStock ?? 0) ? 'warn' : 'info';

        return {
          id: `inventory:${movement.id}`,
          type: 'inventory' as const,
          title,
          description: `${movement.quantity} ${movement.item?.unit || ''} | ${movement.reason}`,
          timestamp: movement.occurredAt.toISOString(),
          occurredAt: movement.occurredAt.toISOString(),
          createdAt: movement.createdAt.toISOString(),
          yachtId: movement.yachtId,
          severity,
          source: 'inventory',
          link: `/yachts/${movement.yachtId}/inventory?itemId=${movement.itemId}`,
        };
      }),
      ...latestPurchaseOrders.map((order) => ({
        id: `purchase_order:${order.id}`,
        type: 'purchase_order' as const,
        title: this.buildPurchaseOrderActivityTitle(order),
        description: `${order.vendorName} | estado ${order.status}`,
        timestamp: order.updatedAt.toISOString(),
        occurredAt: order.updatedAt.toISOString(),
        createdAt: order.createdAt.toISOString(),
        yachtId: order.yachtId,
        source: 'purchase_orders',
        severity:
          order.status === 'submitted'
            ? 'warn'
            : order.status === 'cancelled'
              ? 'critical'
              : 'info',
        link: `/yachts/${order.yachtId}/purchase-orders?poId=${order.id}`,
      })),
    ]
      .sort((a, b) => {
        const diff = this.getSortTimestamp(b) - this.getSortTimestamp(a);
        if (diff !== 0) return diff;
        return this.getCreatedTimestamp(b) - this.getCreatedTimestamp(a);
      })
      .slice(0, 8);

    return {
      stats: {
        logbookPending: logbookCounters.draft,
        logbookPendingReview: logbookCounters.pendingReview,
        alerts: alertsOpen,
        crewOnboard,
        maintenancePending: null,
        maintenanceReady: false,
        documentsPendingApproval,
        documentsExpiringSoon,
        inventoryLowStockCount,
        purchaseOrdersPendingApprovalCount: purchaseOrdersPendingApproval,
        purchaseOrdersOpenCount: purchaseOrdersOpen,
      },
      recentActivity: activity,
    };
  }

  async updateYacht(actorId: string, role: string, yachtId: string, dto: UpdateYachtDto) {
    if (!this.isSystemAdmin(role)) {
      throw new ForbiddenException('Only SystemAdmin can update yachts');
    }

    const current = await this.prisma.yacht.findUnique({ where: { id: yachtId } });
    if (!current) {
      throw new NotFoundException('Yacht not found');
    }

    const patch: UpdateYachtDto = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.flag !== undefined) patch.flag = dto.flag.trim().toUpperCase();
    if (dto.isActive !== undefined) patch.isActive = dto.isActive;
    if (dto.imoOptional !== undefined) patch.imoOptional = dto.imoOptional;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('No yacht fields to update');
    }

    const updated = await this.prisma.yacht.update({
      where: { id: yachtId },
      data: patch,
    });

    await this.prisma.auditEvent.create({
      data: {
        module: 'yachts',
        entityType: 'Yacht',
        entityId: updated.id,
        action: 'update',
        actorId,
        beforeJson: current as unknown as Prisma.JsonObject,
        afterJson: updated as unknown as Prisma.JsonObject,
        source: 'api',
      },
    });

    return updated;
  }

  async grantAccess(
    actorId: string,
    role: string,
    yachtId: string,
    dto: GrantYachtAccessDto,
  ) {
    if (!this.isManager(role)) {
      throw new ForbiddenException('Only Admin/Management can grant yacht access');
    }

    const [yacht, user] = await Promise.all([
      this.prisma.yacht.findUnique({ where: { id: yachtId } }),
      this.prisma.user.findUnique({ where: { id: dto.userId } }),
    ]);

    if (!yacht) {
      throw new NotFoundException('Yacht not found');
    }

    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.isActive) {
      throw new BadRequestException('Cannot grant yacht access to an inactive user');
    }

    const access = await this.prisma.userYachtAccess.upsert({
      where: {
        userId_yachtId: {
          userId: dto.userId,
          yachtId,
        },
      },
      update: {
        roleNameOverride: dto.roleNameOverride,
        revokedAt: null,
        revokedBy: null,
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
        beforeJson: Prisma.DbNull,
        afterJson: access,
        source: 'api',
      },
    });

    return access;
  }

  async listYachtAccess(role: string, yachtId: string) {
    if (!this.isManager(role)) {
      throw new ForbiddenException('Only Admin/Management can list yacht access');
    }

    return this.prisma.userYachtAccess.findMany({
      where: { yachtId, revokedAt: null },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateAccess(
    actorId: string,
    role: string,
    yachtId: string,
    userId: string,
    dto: UpdateYachtAccessDto,
  ) {
    if (!this.isManager(role)) {
      throw new ForbiddenException('Only Admin/Management can update yacht access');
    }

    const access = await this.prisma.userYachtAccess.findUnique({
      where: {
        userId_yachtId: {
          userId,
          yachtId,
        },
      },
    });

    if (!access) {
      throw new NotFoundException('Access record not found');
    }
    if (access.revokedAt) {
      throw new NotFoundException('Access record is revoked');
    }

    const updated = await this.prisma.userYachtAccess.update({
      where: {
        userId_yachtId: {
          userId,
          yachtId,
        },
      },
      data: {
        roleNameOverride: dto.roleNameOverride,
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        module: 'yachts',
        entityType: 'UserYachtAccess',
        entityId: updated.id,
        action: 'update_access',
        actorId,
        beforeJson: access as unknown as Prisma.JsonObject,
        afterJson: updated as unknown as Prisma.JsonObject,
        source: 'api',
      },
    });

    return updated;
  }

  async removeAccess(actorId: string, role: string, yachtId: string, userId: string) {
    if (!this.isManager(role)) {
      throw new ForbiddenException('Only Admin/Management can remove yacht access');
    }

    const access = await this.prisma.userYachtAccess.findUnique({
      where: {
        userId_yachtId: {
          userId,
          yachtId,
        },
      },
    });

    if (!access) {
      throw new NotFoundException('Access record not found');
    }
    if (access.revokedAt) {
      throw new NotFoundException('Access record already revoked');
    }

    const revoked = await this.prisma.userYachtAccess.update({
      where: {
        userId_yachtId: {
          userId,
          yachtId,
        },
      },
      data: {
        revokedAt: new Date(),
        revokedBy: actorId,
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        module: 'yachts',
        entityType: 'UserYachtAccess',
        entityId: access.id,
        action: 'remove_access',
        actorId,
        beforeJson: access as unknown as Prisma.JsonObject,
        afterJson: revoked as unknown as Prisma.JsonObject,
        source: 'api',
      },
    });

    return { success: true };
  }
}

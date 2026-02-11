import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma.service';
import {
  normalizeLegacyLogbookFeedItem,
  normalizeLogbookV2FeedItem,
} from '../logbook-v2/feed-normalizer';

@Injectable()
export class TimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  private isEnabled(key: string, defaultValue: boolean): boolean {
    const raw = this.configService.get<string | boolean | undefined>(key);
    if (raw === undefined || raw === null) return defaultValue;
    if (typeof raw === 'boolean') return raw;
    const normalized = String(raw).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }

  private toUtcStartOfDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  }

  private toUtcEndOfDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
  }

  private parseDateRange(windowDays = 14, from?: string, to?: string) {
    const now = new Date();
    const safeWindowDays = Number.isFinite(windowDays)
      ? Math.min(Math.max(Math.floor(windowDays), 1), 90)
      : 14;

    if (from || to) {
      const fromDate = from ? new Date(from) : new Date(now);
      const toDate = to ? new Date(to) : new Date(now);

      const safeFrom = Number.isNaN(fromDate.getTime())
        ? this.toUtcStartOfDay(new Date(now.getTime() - safeWindowDays * 24 * 60 * 60 * 1000))
        : this.toUtcStartOfDay(fromDate);
      const safeTo = Number.isNaN(toDate.getTime())
        ? this.toUtcEndOfDay(new Date(now.getTime() + safeWindowDays * 24 * 60 * 60 * 1000))
        : this.toUtcEndOfDay(toDate);

      if (safeFrom.getTime() <= safeTo.getTime()) {
        return { start: safeFrom, end: safeTo };
      }
    }

    const start = this.toUtcStartOfDay(new Date(now.getTime() - safeWindowDays * 24 * 60 * 60 * 1000));
    const end = this.toUtcEndOfDay(new Date(now.getTime() + safeWindowDays * 24 * 60 * 60 * 1000));
    return { start, end };
  }

  async getAgenda(yachtId: string, windowDays = 14, from?: string, to?: string) {
    const { start, end } = this.parseDateRange(windowDays, from, to);
    const v2ReadEnabled = this.isEnabled('LOGBOOK_V2_READ_ENABLED', true);
    const legacyFallbackEnabled = this.isEnabled('LOGBOOK_V2_READ_FALLBACK_LEGACY_ENABLED', true);

    const alerts = await this.prisma.alert.findMany({
      where: {
        yachtId,
        resolvedAt: null,
        dueAt: { gte: start, lte: end },
      },
      orderBy: { dueAt: 'asc' },
    });

    const alertItems = alerts.map((a) => ({
      id: `alert:${a.id}`,
      when: a.dueAt,
      module: a.module,
      type: a.alertType,
      severity: a.severity,
      dedupeKey: a.dedupeKey,
      source: 'alerts',
      title: a.alertType,
      description: `${a.module} - ${a.alertType}`,
      status: null,
      link: '/timeline',
      occurredAt: a.dueAt?.toISOString() || null,
      createdAt: a.createdAt.toISOString(),
    }));

    const documentRows = await this.prisma.document.findMany({
      where: {
        yachtId,
        expiryDate: { gte: start, lte: end },
        status: { not: 'Archived' },
        workflowStatus: { not: 'archived' },
      },
      orderBy: [{ expiryDate: 'asc' }, { updatedAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        title: true,
        docType: true,
        expiryDate: true,
        updatedAt: true,
      },
    });

    const purchaseOrders = await this.prisma.purchaseOrder.findMany({
      where: {
        yachtId,
        expectedDeliveryAt: { gte: start, lte: end },
        status: { in: ['draft', 'submitted', 'approved', 'ordered', 'partially_received'] },
      },
      orderBy: [{ expectedDeliveryAt: 'asc' }, { updatedAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        poNumber: true,
        vendorName: true,
        status: true,
        expectedDeliveryAt: true,
        updatedAt: true,
      },
    }).catch(() => []);

    const now = Date.now();
    const documentItems = documentRows
      .filter((row) => row.expiryDate)
      .map((row) => {
        const dueAt = row.expiryDate as Date;
        const daysLeft = Math.ceil((dueAt.getTime() - now) / (1000 * 60 * 60 * 24));
        const severity = daysLeft <= 7 ? 'critical' : 'warn';
        const type = daysLeft < 0 ? 'DOC_EXPIRED' : 'DOC_EXPIRING';
        const title = daysLeft < 0 ? 'Documento vencido' : 'Documento por vencer';
        const base = row.title?.trim() || row.docType;

        return {
          id: `document:${row.id}`,
          when: dueAt,
          module: 'documents',
          type,
          severity,
          dedupeKey: `document-${row.id}-agenda`,
          source: 'documents',
          title,
          description: `${base}${daysLeft >= 0 ? ` (${daysLeft} dia(s))` : ''}`,
          status: null,
          link: `/yachts/${yachtId}/documents?documentId=${row.id}`,
          occurredAt: dueAt.toISOString(),
          createdAt: row.updatedAt.toISOString(),
        } as const;
      });

    const purchaseOrderItems = purchaseOrders
      .filter((row) => row.expectedDeliveryAt)
      .map((row) => {
        const expectedAt = row.expectedDeliveryAt as Date;
        const daysLeft = Math.ceil((expectedAt.getTime() - now) / (1000 * 60 * 60 * 24));
        const severity = daysLeft <= 2 ? 'warn' : 'info';
        const statusLabel =
          row.status === 'submitted'
            ? 'pendiente de aprobacion'
            : row.status === 'approved'
              ? 'aprobada'
              : row.status === 'ordered'
                ? 'emitida'
                : row.status === 'partially_received'
                  ? 'parcialmente recibida'
                  : 'borrador';

        return {
          id: `purchase_order:${row.id}`,
          when: expectedAt,
          module: 'purchase_orders',
          type: 'PO_EXPECTED_DELIVERY',
          severity,
          dedupeKey: `purchase-order-${row.id}-agenda`,
          source: 'purchase_orders',
          title: 'Entrega esperada de PO',
          description: `${row.poNumber} | ${row.vendorName} (${statusLabel})`,
          status: row.status,
          link: `/yachts/${yachtId}/purchase-orders?poId=${row.id}`,
          occurredAt: expectedAt.toISOString(),
          createdAt: row.updatedAt.toISOString(),
        } as const;
      });

    let v2Items = [] as ReturnType<typeof normalizeLogbookV2FeedItem>[];
    if (v2ReadEnabled) {
      const events = await this.prisma.logbookEventV2.findMany({
        where: {
          yachtId,
          occurredAt: { gte: start, lte: end },
        },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: 400,
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
      });

      v2Items = events.map((event) => normalizeLogbookV2FeedItem(event));
    }

    let legacyItems = [] as ReturnType<typeof normalizeLegacyLogbookFeedItem>[];
    if ((!v2ReadEnabled || v2Items.length === 0) && legacyFallbackEnabled) {
      const entries = await this.prisma.logBookEntry.findMany({
        where: {
          yachtId,
          entryDate: { gte: start, lte: end },
        },
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        take: 400,
        select: {
          id: true,
          watchPeriod: true,
          status: true,
          entryDate: true,
          createdAt: true,
        },
      });

      legacyItems = entries.map((entry) => normalizeLegacyLogbookFeedItem(entry, yachtId));
    }

    const agendaItems = [
      ...alertItems,
      ...documentItems,
      ...purchaseOrderItems,
      ...v2Items.map((item) => ({
        id: item.id,
        when: item.when,
        module: item.module,
        type: item.subtype,
        severity: item.severity,
        dedupeKey: item.dedupeKey,
        source: item.source,
        title: item.title,
        description: item.description,
        status: item.status,
        link: item.link,
        occurredAt: item.occurredAt,
        createdAt: item.createdAt,
      })),
      ...legacyItems.map((item) => ({
        id: item.id,
        when: item.when,
        module: item.module,
        type: item.subtype,
        severity: item.severity,
        dedupeKey: item.dedupeKey,
        source: item.source,
        title: item.title,
        description: item.description,
        status: item.status,
        link: item.link,
        occurredAt: item.occurredAt,
        createdAt: item.createdAt,
      })),
    ];

    return agendaItems.sort((a, b) => {
      const left = new Date(b.occurredAt || b.createdAt || '').getTime();
      const right = new Date(a.occurredAt || a.createdAt || '').getTime();
      return (Number.isNaN(left) ? 0 : left) - (Number.isNaN(right) ? 0 : right);
    });
  }

  async getFleetAgenda(windowDays = 14, yachtId?: string, from?: string, to?: string) {
    const { start, end } = this.parseDateRange(windowDays, from, to);

    const alerts = await this.prisma.alert.findMany({
      where: {
        ...(yachtId ? { yachtId } : {}),
        resolvedAt: null,
        dueAt: { gte: start, lte: end },
      },
      include: {
        yacht: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    });

    const documents = await this.prisma.document.findMany({
      where: {
        ...(yachtId ? { yachtId } : {}),
        expiryDate: { gte: start, lte: end },
        status: { not: 'Archived' },
        workflowStatus: { not: 'archived' },
      },
      include: {
        yacht: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ expiryDate: 'asc' }, { updatedAt: 'desc' }],
      take: 300,
    });

    const purchaseOrders = await this.prisma.purchaseOrder.findMany({
      where: {
        ...(yachtId ? { yachtId } : {}),
        expectedDeliveryAt: { gte: start, lte: end },
        status: { in: ['draft', 'submitted', 'approved', 'ordered', 'partially_received'] },
      },
      include: {
        yacht: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ expectedDeliveryAt: 'asc' }, { updatedAt: 'desc' }],
      take: 300,
    }).catch(() => []);

    const now = Date.now();
    const documentItems = documents
      .filter((item) => item.expiryDate)
      .map((item) => {
        const dueAt = item.expiryDate as Date;
        const daysLeft = Math.ceil((dueAt.getTime() - now) / (1000 * 60 * 60 * 24));

        return {
          yachtId: item.yacht.id,
          yachtName: item.yacht.name,
          when: dueAt,
          module: 'documents',
          type: daysLeft < 0 ? 'DOC_EXPIRED' : 'DOC_EXPIRING',
          severity: daysLeft <= 7 ? 'critical' : 'warn',
          dedupeKey: `document-${item.id}-fleet-agenda`,
          entityId: item.id,
          title: daysLeft < 0 ? 'Documento vencido' : 'Documento por vencer',
          description: item.title?.trim() || item.docType,
          source: 'documents',
          occurredAt: dueAt.toISOString(),
          createdAt: item.updatedAt.toISOString(),
          link: `/yachts/${item.yacht.id}/documents?documentId=${item.id}`,
        };
      });

    const alertItems = alerts.map((a) => ({
      yachtId: a.yacht.id,
      yachtName: a.yacht.name,
      when: a.dueAt,
      module: a.module,
      type: a.alertType,
      severity: a.severity,
      dedupeKey: a.dedupeKey,
      entityId: a.entityId,
      title: a.alertType,
      description: `${a.module} - ${a.alertType}`,
      source: 'alerts',
      occurredAt: a.dueAt?.toISOString() || null,
      createdAt: a.createdAt.toISOString(),
      link: '/timeline',
    }));

    const purchaseOrderItems = purchaseOrders
      .filter((row) => row.expectedDeliveryAt)
      .map((row) => {
        const dueAt = row.expectedDeliveryAt as Date;
        const daysLeft = Math.ceil((dueAt.getTime() - now) / (1000 * 60 * 60 * 24));

        return {
          yachtId: row.yacht.id,
          yachtName: row.yacht.name,
          when: dueAt,
          module: 'purchase_orders',
          type: 'PO_EXPECTED_DELIVERY',
          severity: daysLeft <= 2 ? 'warn' : 'info',
          dedupeKey: `purchase-order-${row.id}-fleet-agenda`,
          entityId: row.id,
          title: 'Entrega esperada de PO',
          description: `${row.poNumber} | ${row.vendorName}`,
          source: 'purchase_orders',
          occurredAt: dueAt.toISOString(),
          createdAt: row.updatedAt.toISOString(),
          link: `/yachts/${row.yacht.id}/purchase-orders?poId=${row.id}`,
        };
      });

    return [...alertItems, ...documentItems, ...purchaseOrderItems].sort((a, b) => {
      const left = new Date(b.occurredAt || b.createdAt || '').getTime();
      const right = new Date(a.occurredAt || a.createdAt || '').getTime();
      return (Number.isNaN(left) ? 0 : left) - (Number.isNaN(right) ? 0 : right);
    });
  }
}

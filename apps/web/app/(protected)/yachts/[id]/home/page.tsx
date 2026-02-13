'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useYacht } from '@/lib/yacht-context';
import { formatFlagLabel } from '@/lib/flags';

interface SummaryStats {
  logbookPending: number;
  logbookPendingReview?: number;
  alerts: number;
  maintenancePending: number | null;
  maintenanceReady: boolean;
  crewOnboard: number;
  documentsPendingApproval?: number;
  documentsExpiringSoon?: number;
  inventoryLowStockCount?: number;
  purchaseOrdersPendingApprovalCount?: number;
  purchaseOrdersOpenCount?: number;
}

type ActivityType = 'logbook' | 'alert' | 'crew' | 'document' | 'inventory' | 'purchase_order';

interface SummaryActivity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  link?: string;
}

interface YachtSummary {
  stats: SummaryStats;
  recentActivity: SummaryActivity[];
}

function StatCard({
  title,
  value,
  detail,
  href,
  alert,
  priority,
}: {
  title: string;
  value: string;
  detail?: string;
  href?: string;
  alert?: boolean;
  priority?: boolean;
}) {
  const router = useRouter();
  const clickable = Boolean(href);

  return (
    <button
      type="button"
      onClick={() => href && router.push(href)}
      className={`kpi-card w-full text-left transition ${
        clickable ? 'hover:shadow-md' : ''
      } ${
        priority
          ? 'kpi-card-accent'
          : alert
            ? 'kpi-card-warning'
            : ''
      }`}
    >
      <p className={`kpi-label ${priority ? 'text-accent' : ''}`}>{title}</p>
      <p className={`kpi-value ${priority ? 'text-accent' : ''}`}>{value}</p>
      {detail && <p className="kpi-detail">{detail}</p>}
    </button>
  );
}

function ActivityRow({ item }: { item: SummaryActivity }) {
  const router = useRouter();
  const color =
    item.type === 'alert'
      ? 'bg-warning/20 text-warning'
      : item.type === 'crew'
        ? 'bg-info/20 text-info'
        : item.type === 'document'
          ? 'bg-indigo-100 text-indigo-700'
          : item.type === 'inventory'
            ? 'bg-amber-100 text-amber-700'
            : item.type === 'purchase_order'
              ? 'bg-cyan-100 text-cyan-700'
          : 'bg-success/20 text-success';

  const when = new Date(item.timestamp).toLocaleString();

  const typeLabel: Record<ActivityType, string> = {
    alert: 'Alerta',
    crew: 'Tripulacion',
    logbook: 'Bitacora',
    document: 'Documento',
    inventory: 'Inventario',
    purchase_order: 'Compras',
  };

  return (
    <div className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <span className={`rounded px-2 py-1 text-xs font-medium uppercase ${color}`}>{typeLabel[item.type]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{item.title}</p>
        <p className="truncate text-sm text-text-secondary">{item.description}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-xs text-text-muted">{when}</span>
        {item.link && (
          <button
            type="button"
            onClick={() => router.push(item.link as string)}
            className="text-xs text-info hover:underline"
          >
            Ver detalle
          </button>
        )}
      </div>
    </div>
  );
}

export default function YachtHomePage() {
  const params = useParams();
  const yachtId = String(params.id || '');
  const router = useRouter();
  const { currentYacht, loadYachts } = useYacht();

  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState<YachtSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    if (!yachtId) return;

    try {
      setError(null);
      const data = await api.get<YachtSummary>(`/yachts/${encodeURIComponent(yachtId)}/summary`);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el resumen del yate');
    } finally {
      setIsLoading(false);
    }
  }, [yachtId]);

  useEffect(() => {
    const init = async () => {
      if (!currentYacht) {
        await loadYachts();
      }
      await loadSummary();
    };

    init();
  }, [currentYacht, loadYachts, loadSummary]);

  const maintenanceValue = useMemo(() => {
    if (!summary) return '0';
    if (!summary.stats.maintenanceReady || summary.stats.maintenancePending === null) return 'N/D';
    return String(summary.stats.maintenancePending);
  }, [summary]);

  if (isLoading || !currentYacht) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-surface-hover" />
        <div className="kpi-row-mobile">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-hover" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{currentYacht.name}</h1>
          <p className="text-sm text-text-secondary">
            Bandera: {formatFlagLabel(currentYacht.flag)}
            {currentYacht.imoOptional ? ` | IMO: ${currentYacht.imoOptional}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadSummary()}
          className="rounded-lg border border-border px-3 py-2 text-sm text-text-primary hover:bg-surface-hover"
        >
          Actualizar resumen
        </button>
      </header>

      {error && (
        <div className="rounded-xl border border-error/40 bg-error/10 p-4 text-sm text-error">
          {error}
        </div>
      )}

      <section className="kpi-row-mobile">
        <StatCard
          title="Alertas activas"
          value={String(summary?.stats.alerts ?? 0)}
          href={`/timeline?yachtId=${encodeURIComponent(yachtId)}`}
          alert={(summary?.stats.alerts ?? 0) > 0}
          priority
        />
        <StatCard
          title="Mantenimientos pendientes"
          value={maintenanceValue}
          detail={summary?.stats.maintenanceReady ? undefined : 'Modulo de mantenimiento aun no implementado'}
          href={`/yachts/${yachtId}/maintenance`}
          priority
        />
        <StatCard
          title="Documentos pendientes"
          value={String(summary?.stats.documentsPendingApproval ?? 0)}
          detail={`Por vencer (7 dias): ${summary?.stats.documentsExpiringSoon ?? 0}`}
          href={`/yachts/${yachtId}/documents`}
          alert={(summary?.stats.documentsPendingApproval ?? 0) > 0 || (summary?.stats.documentsExpiringSoon ?? 0) > 0}
          priority
        />
        <StatCard
          title="Borradores de bitacora"
          value={String(summary?.stats.logbookPending ?? 0)}
          detail={`Pendientes de revision: ${summary?.stats.logbookPendingReview ?? 0}`}
          href={`/yachts/${yachtId}/logbook?view=drafts`}
        />
        <StatCard
          title="Tripulantes con acceso"
          value={String(summary?.stats.crewOnboard ?? 0)}
          href={`/yachts/${yachtId}/crew`}
        />
        <StatCard
          title="Inventario en bajo stock"
          value={String(summary?.stats.inventoryLowStockCount ?? 0)}
          href={`/yachts/${yachtId}/inventory`}
          alert={(summary?.stats.inventoryLowStockCount ?? 0) > 0}
        />
        <StatCard
          title="PO pendientes"
          value={String(summary?.stats.purchaseOrdersPendingApprovalCount ?? 0)}
          detail={`PO abiertas: ${summary?.stats.purchaseOrdersOpenCount ?? 0}`}
          href={`/yachts/${yachtId}/purchase-orders`}
          alert={(summary?.stats.purchaseOrdersPendingApprovalCount ?? 0) > 0}
        />
      </section>

      <section className="rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold text-text-primary">Actividad reciente</h2>
          <button
            type="button"
            onClick={() => router.push(`/timeline?yachtId=${encodeURIComponent(yachtId)}`)}
            className="text-sm text-info hover:underline"
          >
            Ver agenda
          </button>
        </div>

        {!summary || summary.recentActivity.length === 0 ? (
          <div className="px-4 py-8 text-sm text-text-secondary">
            Sin actividad registrada para este yate.
          </div>
        ) : (
          <div>
            {summary.recentActivity.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => router.push(`/yachts/${yachtId}/logbook`)}
          className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-black hover:bg-gold-hover"
        >
          Ir a bitacora
        </button>
        <button
          type="button"
          onClick={() => router.push(`/yachts/${yachtId}/engines`)}
          className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover"
        >
          Ir a motores
        </button>
        <button
          type="button"
          onClick={() => router.push(`/yachts/${yachtId}/crew`)}
          className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover"
        >
          Gestionar tripulacion
        </button>
        <button
          type="button"
          onClick={() => router.push(`/yachts/${yachtId}/hrm`)}
          className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover"
        >
          Ir a RRHH
        </button>
        <button
          type="button"
          onClick={() => router.push(`/yachts/${yachtId}/inventory`)}
          className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover"
        >
          Ir a inventario
        </button>
        <button
          type="button"
          onClick={() => router.push(`/yachts/${yachtId}/purchase-orders`)}
          className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover"
        >
          Ir a ordenes de compra
        </button>
      </section>
    </div>
  );
}

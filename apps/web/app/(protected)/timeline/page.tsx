'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { translate } from '@/lib/i18n';
import { useYacht } from '@/lib/yacht-context';

type Severity = 'info' | 'warn' | 'critical';

interface AgendaItem {
  id?: string;
  when?: string | null;
  module: string;
  type: string;
  severity: Severity;
  dedupeKey: string;
  source?: string;
  title?: string;
  description?: string;
  status?: string | null;
  link?: string;
  occurredAt?: string | null;
  createdAt?: string | null;
}

interface FleetAgendaItem extends AgendaItem {
  yachtId: string;
  yachtName: string;
  entityId?: string | null;
}

interface TimelineRow {
  id: string;
  yachtId: string;
  yachtName: string;
  source: string;
  module: string;
  title: string;
  description: string;
  severity: Severity;
  when: string;
  link?: string;
  status?: string | null;
}

const WINDOW_OPTIONS = [7, 14, 30];

function severityClass(severity: Severity) {
  if (severity === 'critical') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
  if (severity === 'warn') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
}

function severityLabel(severity: Severity) {
  if (severity === 'critical') return 'Critica';
  if (severity === 'warn') return 'Advertencia';
  return 'Informativa';
}

function moduleLabel(moduleName: string) {
  const translated = translate(`timeline.${moduleName}`);
  if (translated !== `timeline.${moduleName}`) {
    return translated;
  }
  return moduleName;
}

function typeLabel(type: string) {
  const knownTypes: Record<string, string> = {
    DOC_EXPIRED: 'Documento vencido',
    DOC_EXPIRING: 'Documento por vencer',
    TASK_OVERDUE: 'Tarea vencida',
    TASK_DUE_SOON: 'Tarea por vencer',
    PO_EXPECTED_DELIVERY: 'Entrega esperada de compra',
  };

  return knownTypes[type] || type.replaceAll('_', ' ').toLowerCase();
}

export default function TimelinePage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { yachts, currentYacht, loadYachts } = useYacht();
  const isSystemAdmin = user?.role === 'SystemAdmin';

  const [selectedYachtId, setSelectedYachtId] = useState<string>('all');
  const [windowDays, setWindowDays] = useState<number>(14);
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [rows, setRows] = useState<TimelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadYachts().catch(() => {});
  }, [loadYachts]);

  useEffect(() => {
    const queryYachtId = searchParams.get('yachtId');
    if (queryYachtId && yachts.some((yacht) => yacht.id === queryYachtId)) {
      setSelectedYachtId(queryYachtId);
      return;
    }

    if (isSystemAdmin) {
      setSelectedYachtId('all');
      return;
    }
    if (currentYacht?.id) {
      setSelectedYachtId(currentYacht.id);
      return;
    }
    if (yachts.length > 0) {
      setSelectedYachtId(yachts[0].id);
    }
  }, [isSystemAdmin, currentYacht, yachts, searchParams]);

  const yachtNameMap = useMemo(() => {
    return new Map(yachts.map((yacht) => [yacht.id, yacht.name]));
  }, [yachts]);

  const fetchTimeline = useCallback(async () => {
    if (!selectedYachtId || (selectedYachtId !== 'all' && !yachtNameMap.has(selectedYachtId))) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const fromDate = new Date(now);
      fromDate.setDate(now.getDate() - windowDays);
      const toDate = new Date(now);
      toDate.setDate(now.getDate() + windowDays);
      const from = fromDate.toISOString().slice(0, 10);
      const to = toDate.toISOString().slice(0, 10);

      if (isSystemAdmin && selectedYachtId === 'all') {
        const fleet = await api.get<FleetAgendaItem[]>(
          `/timeline/fleet?windowDays=${windowDays}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        );
        const merged: TimelineRow[] = fleet.map((item) => ({
          id: item.id || `fleet-${item.yachtId}-${item.dedupeKey}`,
          yachtId: item.yachtId,
          yachtName: item.yachtName,
          source: item.source || 'agenda',
          module: item.module,
          title: item.title || typeLabel(item.type),
          description: item.description || '',
          severity: item.severity,
          when: item.occurredAt || item.when || new Date().toISOString(),
          link: item.link,
          status: item.status || null,
        }));

        merged.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
        setRows(merged);
        return;
      }

      const responses = await Promise.all(
        [selectedYachtId].map(async (yachtId) => {
          const agenda = await api.get<AgendaItem[]>(
            `/timeline/${yachtId}?windowDays=${windowDays}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          );
          return { yachtId, agenda };
        }),
      );

      const merged: TimelineRow[] = responses.flatMap(({ yachtId, agenda }) => {
        const yachtName = yachtNameMap.get(yachtId) || yachtId;

        return agenda.map((item) => ({
          id: item.id || `agenda-${yachtId}-${item.dedupeKey}`,
          yachtId,
          yachtName,
          source: item.source || 'agenda',
          module: item.module,
          title: item.title || typeLabel(item.type),
          description: item.description || '',
          severity: item.severity,
          when: item.occurredAt || item.when || new Date().toISOString(),
          link: item.link,
          status: item.status || null,
        }));
      });

      merged.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
      setRows(merged);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'No se pudo cargar la agenda');
    } finally {
      setLoading(false);
    }
  }, [selectedYachtId, windowDays, yachtNameMap, isSystemAdmin]);

  useEffect(() => {
    fetchTimeline().catch(() => {});
  }, [fetchTimeline]);

  const visibleRows = useMemo(() => {
    if (severityFilter === 'all') return rows;
    return rows.filter((row) => row.severity === severityFilter);
  }, [rows, severityFilter]);

  const counters = useMemo(() => {
    return {
      total: rows.length,
      critical: rows.filter((row) => row.severity === 'critical').length,
      warn: rows.filter((row) => row.severity === 'warn').length,
    };
  }, [rows]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{translate('timeline.title')}</h1>
        <button
          type="button"
          onClick={() => fetchTimeline()}
          className="rounded border bg-white px-3 py-2 text-sm hover:bg-slate-50"
        >
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded border bg-white p-4 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs text-slate-500">Yate</label>
          <select
            value={selectedYachtId}
            onChange={(event) => setSelectedYachtId(event.target.value)}
            className="w-full rounded border px-2 py-2 text-sm"
          >
            {isSystemAdmin && <option value="all">Todos los yates</option>}
            {yachts.map((yacht) => (
              <option key={yacht.id} value={yacht.id}>
                {yacht.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-500">Ventana</label>
          <select
            value={windowDays}
            onChange={(event) => setWindowDays(Number(event.target.value))}
            className="w-full rounded border px-2 py-2 text-sm"
          >
            {WINDOW_OPTIONS.map((days) => (
              <option key={days} value={days}>
                {days} dias
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-500">Severidad</label>
          <select
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value as 'all' | Severity)}
            className="w-full rounded border px-2 py-2 text-sm"
          >
            <option value="all">Todas</option>
            <option value="critical">Critica</option>
            <option value="warn">Advertencia</option>
            <option value="info">Informativa</option>
          </select>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded bg-slate-100 p-2">
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-lg font-semibold">{counters.total}</p>
          </div>
          <div className="rounded bg-red-50 p-2">
            <p className="text-xs text-red-500">Critica</p>
            <p className="text-lg font-semibold text-red-700">{counters.critical}</p>
          </div>
          <div className="rounded bg-amber-50 p-2">
            <p className="text-xs text-amber-600">Advertencia</p>
            <p className="text-lg font-semibold text-amber-700">{counters.warn}</p>
          </div>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-500">Cargando agenda...</p>}
      {!loading && error && (
        <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {!loading && !error && visibleRows.length === 0 && (
        <p className="rounded border bg-white p-4 text-sm text-slate-500">
          No hay eventos para esta fecha/rango.
        </p>
      )}

      {!loading && !error && visibleRows.length > 0 && (
        <ul className="space-y-2">
          {visibleRows.map((row) => (
            <li key={row.id} className="rounded border bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${severityClass(row.severity)}`}>
                    {severityLabel(row.severity)}
                  </span>
                  <strong>{moduleLabel(row.module)}</strong>
                  <span className="text-slate-500">{row.title}</span>
                  {row.status && <span className="text-xs text-slate-400">({row.status})</span>}
                </div>
                <span className="text-xs text-slate-500">{new Date(row.when).toLocaleString('es-EC')}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{row.yachtName} - Agenda</p>
              {row.description && <p className="mt-1 text-xs text-slate-600">{row.description}</p>}
              {row.link && (
                <a href={row.link} className="mt-2 inline-block text-xs text-info hover:underline">
                  Ver detalle
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

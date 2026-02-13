'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useYacht } from '@/lib/yacht-context';
import { formatFlagLabel } from '@/lib/flags';

interface FleetRow {
  yachtId: string;
  yachtName: string;
  logbookPending: number;
  alerts: number;
  crewOnboard: number;
  inventoryLowStock: number;
  purchaseOrdersPendingApproval: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { yachts, currentYacht, loadYachts, isLoading } = useYacht();
  const [fleetRows, setFleetRows] = useState<FleetRow[]>([]);
  const [fleetLoading, setFleetLoading] = useState(false);

  useEffect(() => {
    loadYachts().catch(() => {});
  }, [loadYachts]);

  const activeYachts = useMemo(() => yachts.filter((yacht) => yacht.isActive).length, [yachts]);
  const inactiveYachts = useMemo(() => yachts.filter((yacht) => !yacht.isActive).length, [yachts]);

  useEffect(() => {
    if (user?.role !== 'SystemAdmin' || yachts.length === 0) {
      setFleetRows([]);
      return;
    }

    const loadFleetOverview = async () => {
      setFleetLoading(true);
      try {
        const rows = await Promise.all(
          yachts.map(async (yacht) => {
            const summary = await api.get<{
              stats: {
                logbookPending: number;
                alerts: number;
                crewOnboard: number;
                inventoryLowStockCount?: number;
                purchaseOrdersPendingApprovalCount?: number;
              };
            }>(`/yachts/${yacht.id}/summary`);

            return {
              yachtId: yacht.id,
              yachtName: yacht.name,
              logbookPending: summary.stats.logbookPending,
              alerts: summary.stats.alerts,
              crewOnboard: summary.stats.crewOnboard,
              inventoryLowStock: summary.stats.inventoryLowStockCount ?? 0,
              purchaseOrdersPendingApproval: summary.stats.purchaseOrdersPendingApprovalCount ?? 0,
            };
          }),
        );

        rows.sort((a, b) => b.alerts - a.alerts || b.logbookPending - a.logbookPending);
        setFleetRows(rows);
      } catch {
        setFleetRows([]);
      } finally {
        setFleetLoading(false);
      }
    };

    loadFleetOverview().catch(() => {});
  }, [user?.role, yachts]);

  if (isLoading && yachts.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-accent" />
          <p className="text-text-secondary">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-secondary">
          Resumen operativo y acceso rapido a los modulos.
        </p>
      </header>

      {user?.role !== 'SystemAdmin' && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-medium text-text-primary">Flujo recomendado</p>
          <p className="mt-1 text-xs text-text-secondary">
            1) Selecciona un yate en <strong>Seleccionar yate</strong>. 2) Entra a <strong>Dashboard del yate</strong> para trabajar con datos precisos.
          </p>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi-card">
          <p className="kpi-label">Usuario</p>
          <p className="mt-1 truncate text-sm font-medium text-text-primary">{user?.email || '-'}</p>
          <p className="kpi-detail">Rol: {user?.role || '-'}</p>
        </div>

        <div className="kpi-card">
          <p className="kpi-label">Yates visibles</p>
          <p className="kpi-value">{yachts.length}</p>
        </div>

        <div className="kpi-card kpi-card-accent">
          <p className="kpi-label">Yates activos</p>
          <p className="kpi-value text-accent">{activeYachts}</p>
        </div>

        <div className="kpi-card kpi-card-warning">
          <p className="kpi-label">Yates inactivos</p>
          <p className="kpi-value">{inactiveYachts}</p>
        </div>
      </div>

      {currentYacht ? (
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-text-secondary">Yate seleccionado</p>
              <p className="text-lg font-semibold text-text-primary">{currentYacht.name}</p>
              <p className="text-sm text-text-secondary">{formatFlagLabel(currentYacht.flag)}</p>
            </div>
            <Link
              href={`/yachts/${currentYacht.id}/home`}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Abrir panel del yate
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="text-sm text-text-secondary">
            No hay un yate seleccionado. Selecciona uno para gestionar motores, bitacora, documentos y tripulacion.
          </p>
          <Link
            href="/yachts"
            className="mt-3 inline-flex rounded-lg border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover"
          >
            Ir a yates
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Link href="/yachts" className="rounded-xl border border-border bg-surface p-4 hover:shadow-md">
          <p className="text-sm font-medium text-text-primary">Gestion de yates</p>
          <p className="mt-1 text-xs text-text-secondary">Seleccion, alta y edicion de datos del yate.</p>
        </Link>
        {user?.role === 'SystemAdmin' && (
          <Link href="/settings/users" className="rounded-xl border border-border bg-surface p-4 hover:shadow-md">
            <p className="text-sm font-medium text-text-primary">Usuarios y permisos</p>
            <p className="mt-1 text-xs text-text-secondary">Asigna usuarios a yates y controla estado de acceso.</p>
          </Link>
        )}
      </div>

      {user?.role === 'SystemAdmin' && (
        <section className="rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-base font-semibold text-text-primary">Revision global por yate</h2>
            {fleetLoading && <span className="text-xs text-text-secondary">Actualizando...</span>}
          </div>
          {fleetRows.length === 0 ? (
            <p className="px-4 py-4 text-sm text-text-secondary">Sin datos de resumen disponibles.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover text-xs text-text-secondary">
                  <tr>
                    <th className="px-4 py-2 text-left">Yate</th>
                    <th className="px-4 py-2 text-left">Alertas</th>
                    <th className="px-4 py-2 text-left">Borradores de bitacora</th>
                    <th className="px-4 py-2 text-left">Inv. bajo stock</th>
                    <th className="px-4 py-2 text-left">PO pendientes</th>
                    <th className="px-4 py-2 text-left">Tripulacion</th>
                    <th className="px-4 py-2 text-left">Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {fleetRows.map((row) => (
                    <tr key={row.yachtId} className="border-t border-border">
                      <td className="px-4 py-2 text-text-primary">{row.yachtName}</td>
                      <td className="px-4 py-2 text-text-primary">{row.alerts}</td>
                      <td className="px-4 py-2 text-text-primary">{row.logbookPending}</td>
                      <td className="px-4 py-2 text-text-primary">{row.inventoryLowStock}</td>
                      <td className="px-4 py-2 text-text-primary">{row.purchaseOrdersPendingApproval}</td>
                      <td className="px-4 py-2 text-text-primary">{row.crewOnboard}</td>
                      <td className="px-4 py-2">
                        <Link
                          href={`/yachts/${row.yachtId}/home`}
                          className="text-info hover:underline"
                        >
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </section>
  );
}

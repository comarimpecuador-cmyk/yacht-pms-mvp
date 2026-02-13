'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useYacht, type Yacht } from '@/lib/yacht-context';
import { AddYachtModal } from '@/components/yacht/add-yacht-modal';
import { EditYachtModal } from '@/components/yacht/edit-yacht-modal';
import { formatFlagLabel } from '@/lib/flags';

type FilterMode = 'all' | 'active' | 'inactive';

function YachtCard({
  yacht,
  isSystemAdmin,
  onSelect,
  onEdit,
}: {
  yacht: Yacht;
  isSystemAdmin: boolean;
  onSelect: (yachtId: string) => void;
  onEdit: (yacht: Yacht) => void;
}) {
  const statusClass = yacht.isActive
    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200';

  return (
    <button
      type="button"
      onClick={() => onSelect(yacht.id)}
      className="w-full rounded-xl border border-border bg-surface p-5 text-left transition hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">{yacht.name}</h3>
          <p className="mt-1 text-sm text-text-secondary">{formatFlagLabel(yacht.flag)}</p>
          {yacht.imoOptional ? (
            <p className="mt-1 text-xs text-text-muted">IMO: {yacht.imoOptional}</p>
          ) : null}
        </div>
        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClass}`}>
          {yacht.isActive ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <span className="text-sm text-text-secondary">Entrar al panel de este yate</span>
        <span className="text-sm font-medium text-accent">Abrir</span>
        {isSystemAdmin && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit(yacht);
            }}
            className="ml-auto rounded-lg border border-border px-3 py-1.5 text-xs text-text-primary hover:bg-surface-hover"
          >
            Editar
          </button>
        )}
      </div>
    </button>
  );
}

export default function YachtsPage() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const { yachts, loadYachts, isLoading: yachtLoading, selectYacht } = useYacht();

  const [initialized, setInitialized] = useState(false);
  const [showAddYacht, setShowAddYacht] = useState(false);
  const [editingYacht, setEditingYacht] = useState<Yacht | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');

  const isSystemAdmin = user?.role === 'SystemAdmin';

  useEffect(() => {
    if (authLoading || !user || initialized) {
      return;
    }

    loadYachts()
      .catch(() => {})
      .finally(() => setInitialized(true));
  }, [authLoading, user, initialized, loadYachts]);

  const yachtsVisible = useMemo(() => {
    if (filter === 'active') {
      return yachts.filter((item) => item.isActive);
    }
    if (filter === 'inactive') {
      return yachts.filter((item) => !item.isActive);
    }
    return yachts;
  }, [yachts, filter]);

  const activeCount = useMemo(() => yachts.filter((item) => item.isActive).length, [yachts]);
  const inactiveCount = useMemo(() => yachts.filter((item) => !item.isActive).length, [yachts]);

  if (authLoading || yachtLoading || !initialized) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-accent" />
          <p className="text-text-secondary">Cargando yates...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (yachts.length === 0) {
    return (
      <section className="flex min-h-[60vh] items-center justify-center">
        <div className="mx-auto max-w-lg rounded-xl border border-border bg-surface p-6 text-center">
          <h1 className="text-2xl font-semibold text-text-primary">Sin yates asignados</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Todavia no tienes acceso a yates. Si eres SystemAdmin, crea uno para empezar.
          </p>

          <div className="mt-6 flex flex-col-reverse items-stretch justify-center gap-2 sm:flex-row">
            {isSystemAdmin && (
              <button
                type="button"
                onClick={() => setShowAddYacht(true)}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              >
                Crear yate
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                logout();
              }}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover"
            >
              Cerrar sesion
            </button>
          </div>

          {showAddYacht && (
            <AddYachtModal
              onClose={() => setShowAddYacht(false)}
              onSuccess={async () => {
                setShowAddYacht(false);
                await loadYachts();
              }}
            />
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Gestion de yates</h1>
          <p className="text-sm text-text-secondary">
            Selecciona un yate para entrar a su modulo. SystemAdmin puede editar bandera, estado e informacion general.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isSystemAdmin && (
            <button
              type="button"
              onClick={() => setShowAddYacht(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              <span className="text-base leading-none">+</span>
              Nuevo yate
            </button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:max-w-xl sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-text-secondary">Total</p>
          <p className="text-lg font-semibold text-text-primary">{yachts.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-text-secondary">Activos</p>
          <p className="text-lg font-semibold text-text-primary">{activeCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-text-secondary">Inactivos</p>
          <p className="text-lg font-semibold text-text-primary">{inactiveCount}</p>
        </div>
      </div>

      {isSystemAdmin && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
          <span className="text-xs text-text-secondary">Filtro:</span>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-md px-3 py-1.5 text-xs ${
              filter === 'all' ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-surface-hover'
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setFilter('active')}
            className={`rounded-md px-3 py-1.5 text-xs ${
              filter === 'active' ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-surface-hover'
            }`}
          >
            Solo activos
          </button>
          <button
            type="button"
            onClick={() => setFilter('inactive')}
            className={`rounded-md px-3 py-1.5 text-xs ${
              filter === 'inactive' ? 'bg-accent/15 text-accent' : 'text-text-secondary hover:bg-surface-hover'
            }`}
          >
            Solo inactivos
          </button>
        </div>
      )}

      {yachtsVisible.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">
          No hay yates para el filtro seleccionado.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {yachtsVisible.map((yacht) => (
            <YachtCard
              key={yacht.id}
              yacht={yacht}
              isSystemAdmin={isSystemAdmin}
              onSelect={selectYacht}
              onEdit={setEditingYacht}
            />
          ))}
        </div>
      )}

      {showAddYacht && isSystemAdmin && (
        <AddYachtModal
          onClose={() => setShowAddYacht(false)}
          onSuccess={async () => {
            setShowAddYacht(false);
            await loadYachts();
          }}
        />
      )}

      {editingYacht && isSystemAdmin && (
        <EditYachtModal
          yacht={editingYacht}
          onClose={() => setEditingYacht(null)}
          onSuccess={async () => {
            setEditingYacht(null);
            await loadYachts();
          }}
        />
      )}
    </section>
  );
}

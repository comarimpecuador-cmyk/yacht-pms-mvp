'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useYacht } from '@/lib/yacht-context';

type InventoryCategory =
  | 'engineering'
  | 'deck'
  | 'safety'
  | 'housekeeping'
  | 'galley'
  | 'admin'
  | 'other';

type InventoryMovementType = 'in' | 'out' | 'adjustment' | 'transfer_in' | 'transfer_out';

interface InventoryItem {
  id: string;
  yachtId: string;
  sku: string | null;
  name: string;
  description: string | null;
  category: InventoryCategory;
  unit: string;
  location: string | null;
  minStock: number;
  currentStock: number;
  isActive: boolean;
  engineId: string | null;
  createdAt: string;
  updatedAt: string;
  engine?: { id: string; name: string } | null;
}

interface InventoryMovement {
  id: string;
  yachtId: string;
  itemId: string;
  type: InventoryMovementType;
  quantity: number;
  reason: string;
  occurredAt: string;
  beforeQty: number;
  afterQty: number;
  createdAt: string;
}

interface InventoryListResponse {
  items: InventoryItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface InventoryItemDetail extends InventoryItem {
  movements: InventoryMovement[];
}

const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  engineering: 'Ingenieria',
  deck: 'Cubierta',
  safety: 'Seguridad',
  housekeeping: 'Housekeeping',
  galley: 'Cocina',
  admin: 'Administrativo',
  other: 'Otros',
};

const TYPE_LABELS: Record<InventoryMovementType, string> = {
  in: 'Entrada',
  out: 'Salida',
  adjustment: 'Ajuste',
  transfer_in: 'Transferencia entrada',
  transfer_out: 'Transferencia salida',
};

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1 text-sm text-text-primary hover:bg-surface-hover"
          >
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function stockBadgeClass(item: InventoryItem) {
  if (item.currentStock <= 0) return 'bg-red-100 text-red-700';
  if (item.currentStock <= item.minStock) return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

export default function YachtInventoryPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const yachtId = String(params.id || '');
  const { currentYacht } = useYacht();
  const { user } = useAuth();

  const role = user?.role || '';
  const canManage = ['Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin'].includes(role);
  const canMove = ['Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin'].includes(role);
  const canAdjust = ['Chief Engineer', 'Captain', 'Admin', 'SystemAdmin'].includes(role);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | InventoryCategory>('all');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const [detailItem, setDetailItem] = useState<InventoryItemDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [savingItem, setSavingItem] = useState(false);

  const [showMovementModal, setShowMovementModal] = useState(false);
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [savingMovement, setSavingMovement] = useState(false);

  const [itemForm, setItemForm] = useState({
    sku: '',
    name: '',
    description: '',
    category: 'engineering' as InventoryCategory,
    unit: 'pcs',
    location: '',
    minStock: '0',
    currentStock: '0',
    isActive: true,
  });

  const [movementForm, setMovementForm] = useState({
    type: 'out' as InventoryMovementType,
    quantity: '1',
    reason: '',
    direction: 'decrease' as 'increase' | 'decrease',
  });

  const resetItemForm = (item?: InventoryItem) => {
    if (item) {
      setItemForm({
        sku: item.sku || '',
        name: item.name,
        description: item.description || '',
        category: item.category,
        unit: item.unit,
        location: item.location || '',
        minStock: String(item.minStock),
        currentStock: String(item.currentStock),
        isActive: item.isActive,
      });
      return;
    }

    setItemForm({
      sku: '',
      name: '',
      description: '',
      category: 'engineering',
      unit: 'pcs',
      location: '',
      minStock: '0',
      currentStock: '0',
      isActive: true,
    });
  };

  const loadItems = useCallback(async () => {
    if (!yachtId) return;
    setIsLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams();
      query.set('page', '1');
      query.set('pageSize', '80');
      if (search.trim()) query.set('search', search.trim());
      if (category !== 'all') query.set('category', category);
      if (lowStockOnly) query.set('lowStock', 'true');

      const response = await api.get<InventoryListResponse>(
        `/yachts/${encodeURIComponent(yachtId)}/inventory/items?${query.toString()}`,
      );
      setItems(response.items || []);
      setTotal(response.total || 0);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : 'No se pudo cargar inventario');
    } finally {
      setIsLoading(false);
    }
  }, [category, lowStockOnly, search, yachtId]);

  useEffect(() => {
    loadItems().catch(() => {});
  }, [loadItems]);

  const openDetail = useCallback(async (itemId: string) => {
    try {
      const detail = await api.get<InventoryItemDetail>(`/inventory/items/${encodeURIComponent(itemId)}`);
      setDetailItem(detail);
      setDetailOpen(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo cargar detalle del item');
    }
  }, []);

  useEffect(() => {
    const itemId = searchParams.get('itemId');
    if (!itemId) return;
    openDetail(itemId).catch(() => {});
  }, [openDetail, searchParams]);

  const handleSaveItem = async (event: FormEvent) => {
    event.preventDefault();
    if (!yachtId) return;

    setSavingItem(true);
    try {
      const payload = {
        sku: itemForm.sku || undefined,
        name: itemForm.name.trim(),
        description: itemForm.description || undefined,
        category: itemForm.category,
        unit: itemForm.unit.trim(),
        location: itemForm.location || undefined,
        minStock: Number(itemForm.minStock),
        ...(editingItem ? {} : { currentStock: Number(itemForm.currentStock) }),
        isActive: itemForm.isActive,
      };

      if (editingItem) {
        await api.patch(`/inventory/items/${encodeURIComponent(editingItem.id)}`, payload);
      } else {
        await api.post(`/yachts/${encodeURIComponent(yachtId)}/inventory/items`, payload);
      }

      setShowItemModal(false);
      setEditingItem(null);
      resetItemForm();
      await loadItems();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo guardar el item');
    } finally {
      setSavingItem(false);
    }
  };

  const handleCreateMovement = async (event: FormEvent) => {
    event.preventDefault();
    if (!movementItem) return;

    setSavingMovement(true);
    try {
      await api.post(`/inventory/items/${encodeURIComponent(movementItem.id)}/movements`, {
        type: movementForm.type,
        quantity: Number(movementForm.quantity),
        reason: movementForm.reason.trim(),
        ...(movementForm.type === 'adjustment' ? { direction: movementForm.direction } : {}),
      });

      setShowMovementModal(false);
      setMovementItem(null);
      setMovementForm({
        type: 'out',
        quantity: '1',
        reason: '',
        direction: 'decrease',
      });
      await loadItems();
      if (detailItem?.id === movementItem.id) {
        await openDetail(movementItem.id);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo registrar movimiento');
    } finally {
      setSavingMovement(false);
    }
  };

  const summary = useMemo(() => {
    const low = items.filter((item) => item.currentStock > 0 && item.currentStock <= item.minStock).length;
    const out = items.filter((item) => item.currentStock <= 0).length;
    return { low, out };
  }, [items]);

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Inventario del yate</h1>
            <p className="text-sm text-text-secondary">
              Control de stock por item, movimientos y alertas de minimos.
            </p>
            <p className="mt-1 text-xs text-text-muted">Yate: {currentYacht?.name || 'Cargando...'}</p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setEditingItem(null);
                resetItemForm();
                setShowItemModal(true);
              }}
              className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-black hover:bg-gold-hover"
            >
              Nuevo item
            </button>
          )}
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-secondary">Items</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{total}</p>
        </div>
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-4">
          <p className="text-xs text-text-secondary">Stock bajo</p>
          <p className="mt-1 text-2xl font-semibold text-amber-300">{summary.low}</p>
        </div>
        <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4">
          <p className="text-xs text-text-secondary">Sin stock</p>
          <p className="mt-1 text-2xl font-semibold text-red-300">{summary.out}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-secondary">Movimientos</p>
          <p className="mt-1 text-sm text-text-primary">Registrar entradas, salidas y ajustes.</p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre/SKU"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as 'all' | InventoryCategory)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
          >
            <option value="all">Todas las categorias</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-primary">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(event) => setLowStockOnly(event.target.checked)}
            />
            Solo stock bajo
          </label>
          <button
            type="button"
            onClick={() => loadItems()}
            className="rounded-lg border border-border px-3 py-2 text-sm text-text-primary hover:bg-surface-hover"
          >
            Actualizar
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-text-secondary">Cargando inventario...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-300">{error}</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-secondary">No hay items para los filtros seleccionados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-hover text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 text-left">Item</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">Ubicacion</th>
                  <th className="px-4 py-3 text-left">Stock</th>
                  <th className="px-4 py-3 text-left">Minimo</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="px-4 py-3 text-text-primary">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-text-muted">{item.sku || 'Sin SKU'}</div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{CATEGORY_LABELS[item.category]}</td>
                    <td className="px-4 py-3 text-text-secondary">{item.location || 'Sin ubicacion'}</td>
                    <td className="px-4 py-3 text-text-primary">
                      {item.currentStock} {item.unit}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{item.minStock}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${stockBadgeClass(item)}`}>
                        {item.currentStock <= 0 ? 'Agotado' : item.currentStock <= item.minStock ? 'Bajo' : 'OK'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openDetail(item.id)}
                          className="rounded-lg border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-hover"
                        >
                          Detalle
                        </button>
                        {canMove && (
                          <button
                            type="button"
                            onClick={() => {
                              setMovementItem(item);
                              setMovementForm({
                                type: 'out',
                                quantity: '1',
                                reason: '',
                                direction: 'decrease',
                              });
                              setShowMovementModal(true);
                            }}
                            className="rounded-lg border border-blue-400/40 bg-blue-500/10 px-2 py-1 text-xs text-blue-200 hover:bg-blue-500/20"
                          >
                            Movimiento
                          </button>
                        )}
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItem(item);
                              resetItemForm(item);
                              setShowItemModal(true);
                            }}
                            className="rounded-lg border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-hover"
                          >
                            Editar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={showItemModal}
        title={editingItem ? 'Editar item de inventario' : 'Nuevo item de inventario'}
        onClose={() => setShowItemModal(false)}
      >
        <form onSubmit={handleSaveItem} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-text-secondary">
              Nombre
              <input
                required
                minLength={2}
                maxLength={180}
                value={itemForm.name}
                onChange={(event) => setItemForm((prev) => ({ ...prev, name: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
            <label className="text-sm text-text-secondary">
              SKU
              <input
                value={itemForm.sku}
                onChange={(event) => setItemForm((prev) => ({ ...prev, sku: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm text-text-secondary">
              Categoria
              <select
                value={itemForm.category}
                onChange={(event) => setItemForm((prev) => ({ ...prev, category: event.target.value as InventoryCategory }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-text-secondary">
              Unidad
              <input
                required
                maxLength={30}
                value={itemForm.unit}
                onChange={(event) => setItemForm((prev) => ({ ...prev, unit: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
            <label className="text-sm text-text-secondary">
              Ubicacion
              <input
                value={itemForm.location}
                onChange={(event) => setItemForm((prev) => ({ ...prev, location: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-text-secondary">
              Stock minimo
              <input
                type="number"
                min={0}
                step="0.01"
                value={itemForm.minStock}
                onChange={(event) => setItemForm((prev) => ({ ...prev, minStock: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
            {!editingItem && (
              <label className="text-sm text-text-secondary">
                Stock inicial
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={itemForm.currentStock}
                  onChange={(event) => setItemForm((prev) => ({ ...prev, currentStock: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
                />
              </label>
            )}
          </div>

          <label className="text-sm text-text-secondary">
            Descripcion
            <textarea
              rows={3}
              value={itemForm.description}
              onChange={(event) => setItemForm((prev) => ({ ...prev, description: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={itemForm.isActive}
              onChange={(event) => setItemForm((prev) => ({ ...prev, isActive: event.target.checked }))}
            />
            Item activo
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowItemModal(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingItem}
              className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-black hover:bg-gold-hover disabled:opacity-60"
            >
              {savingItem ? 'Guardando...' : editingItem ? 'Guardar cambios' : 'Crear item'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showMovementModal}
        title={movementItem ? `Movimiento: ${movementItem.name}` : 'Registrar movimiento'}
        onClose={() => setShowMovementModal(false)}
      >
        <form onSubmit={handleCreateMovement} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-text-secondary">
              Tipo
              <select
                value={movementForm.type}
                onChange={(event) =>
                  setMovementForm((prev) => ({
                    ...prev,
                    type: event.target.value as InventoryMovementType,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              >
                <option value="in">Entrada</option>
                <option value="out">Salida</option>
                <option value="transfer_in">Transferencia entrada</option>
                <option value="transfer_out">Transferencia salida</option>
                <option value="adjustment">Ajuste</option>
              </select>
            </label>
            <label className="text-sm text-text-secondary">
              Cantidad
              <input
                type="number"
                min={0.0001}
                step="0.01"
                required
                value={movementForm.quantity}
                onChange={(event) => setMovementForm((prev) => ({ ...prev, quantity: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
          </div>

          {movementForm.type === 'adjustment' && (
            <label className="text-sm text-text-secondary">
              Direccion del ajuste
              <select
                value={movementForm.direction}
                onChange={(event) =>
                  setMovementForm((prev) => ({
                    ...prev,
                    direction: event.target.value as 'increase' | 'decrease',
                  }))
                }
                disabled={!canAdjust}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary disabled:opacity-60"
              >
                <option value="increase">Aumentar</option>
                <option value="decrease">Disminuir</option>
              </select>
            </label>
          )}

          <label className="text-sm text-text-secondary">
            Motivo
            <textarea
              required
              minLength={3}
              maxLength={300}
              rows={3}
              value={movementForm.reason}
              onChange={(event) => setMovementForm((prev) => ({ ...prev, reason: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
            />
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowMovementModal(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingMovement || (movementForm.type === 'adjustment' && !canAdjust)}
              className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-black hover:bg-gold-hover disabled:opacity-60"
            >
              {savingMovement ? 'Guardando...' : 'Registrar movimiento'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={detailOpen} title={detailItem?.name || 'Detalle de item'} onClose={() => setDetailOpen(false)}>
        {!detailItem ? (
          <p className="text-sm text-text-secondary">Sin detalle disponible.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <p className="text-text-secondary">
                SKU: <span className="text-text-primary">{detailItem.sku || 'Sin SKU'}</span>
              </p>
              <p className="text-text-secondary">
                Categoria: <span className="text-text-primary">{CATEGORY_LABELS[detailItem.category]}</span>
              </p>
              <p className="text-text-secondary">
                Stock actual:{' '}
                <span className="font-medium text-text-primary">
                  {detailItem.currentStock} {detailItem.unit}
                </span>
              </p>
              <p className="text-text-secondary">
                Minimo: <span className="text-text-primary">{detailItem.minStock}</span>
              </p>
            </div>

            <div className="rounded-lg border border-border">
              <div className="border-b border-border px-3 py-2 text-sm font-medium text-text-primary">
                Movimientos recientes
              </div>
              {detailItem.movements.length === 0 ? (
                <p className="px-3 py-4 text-sm text-text-secondary">Sin movimientos registrados.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {detailItem.movements.map((movement) => (
                    <li key={movement.id} className="px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-text-primary">{TYPE_LABELS[movement.type]}</span>
                        <span className="text-xs text-text-muted">
                          {new Date(movement.occurredAt).toLocaleString('es-EC')}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary">
                        Cantidad: {movement.quantity} | Antes: {movement.beforeQty} | Despues: {movement.afterQty}
                      </p>
                      <p className="text-xs text-text-secondary">{movement.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

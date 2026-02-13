'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useYacht } from '@/lib/yacht-context';

type PurchaseOrderStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'ordered'
  | 'partially_received'
  | 'received'
  | 'cancelled';

interface InventoryOption {
  id: string;
  name: string;
  sku: string | null;
}

interface PurchaseOrderLine {
  id: string;
  itemId: string | null;
  freeTextName: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  unitPrice: number;
  item?: { id: string; name: string; sku: string | null; unit: string } | null;
}

interface PurchaseOrder {
  id: string;
  yachtId: string;
  poNumber: string;
  vendorName: string;
  currency: string;
  status: PurchaseOrderStatus;
  expectedDeliveryAt: string | null;
  total: number;
  createdAt: string;
  updatedAt: string;
  lines: PurchaseOrderLine[];
}

interface ListResponse {
  items: PurchaseOrder[];
  total: number;
}

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: 'Borrador',
  submitted: 'Pendiente de aprobacion',
  approved: 'Aprobada',
  ordered: 'Emitida',
  partially_received: 'Recepcion parcial',
  received: 'Recibida',
  cancelled: 'Cancelada',
};

function statusClass(status: PurchaseOrderStatus) {
  if (status === 'submitted' || status === 'partially_received') return 'bg-amber-100 text-amber-700';
  if (status === 'approved' || status === 'ordered') return 'bg-blue-100 text-blue-700';
  if (status === 'received') return 'bg-emerald-100 text-emerald-700';
  if (status === 'cancelled') return 'bg-red-100 text-red-700';
  return 'bg-slate-100 text-slate-700';
}

export default function YachtPurchaseOrdersPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const yachtId = String(params.id || '');
  const { currentYacht } = useYacht();
  const { user } = useAuth();
  const role = user?.role || '';
  const canCreate = ['Chief Engineer', 'Captain', 'Crew Member', 'Management/Office', 'Admin', 'SystemAdmin'].includes(role);
  const canApprove = ['Captain', 'Admin', 'SystemAdmin'].includes(role);
  const canOrder = ['Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin'].includes(role);
  const canReceive = ['Chief Engineer', 'Captain', 'Admin', 'SystemAdmin'].includes(role);

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | PurchaseOrderStatus>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [savingCreate, setSavingCreate] = useState(false);
  const [inventory, setInventory] = useState<InventoryOption[]>([]);
  const [createVendor, setCreateVendor] = useState('');
  const [createDelivery, setCreateDelivery] = useState('');
  const [lineItemId, setLineItemId] = useState('');
  const [lineName, setLineName] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [linePrice, setLinePrice] = useState('0');

  const [showReceive, setShowReceive] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrder | null>(null);
  const [receiveReason, setReceiveReason] = useState('Recepcion de mercaderia');
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [savingReceive, setSavingReceive] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detailOrder, setDetailOrder] = useState<PurchaseOrder | null>(null);

  const loadOrders = useCallback(async () => {
    if (!yachtId) return;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ page: '1', pageSize: '80' });
      if (statusFilter !== 'all') query.set('status', statusFilter);
      const response = await api.get<ListResponse>(
        `/yachts/${encodeURIComponent(yachtId)}/purchase-orders?${query.toString()}`,
      );
      setOrders(response.items || []);
      setTotal(response.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar PO');
      setOrders([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, yachtId]);

  const loadInventory = useCallback(async () => {
    if (!yachtId) return;
    try {
      const data = await api.get<{ items: InventoryOption[] }>(
        `/yachts/${encodeURIComponent(yachtId)}/inventory/items?page=1&pageSize=200`,
      );
      setInventory(data.items || []);
    } catch {
      setInventory([]);
    }
  }, [yachtId]);

  useEffect(() => {
    loadOrders().catch(() => {});
  }, [loadOrders]);

  useEffect(() => {
    loadInventory().catch(() => {});
  }, [loadInventory]);

  const openDetail = useCallback(async (orderId: string) => {
    try {
      const detail = await api.get<PurchaseOrder>(`/purchase-orders/${encodeURIComponent(orderId)}`);
      setDetailOrder(detail);
      setShowDetail(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo cargar detalle');
    }
  }, []);

  const runAction = async (
    id: string,
    action: 'submit' | 'approve' | 'mark-ordered' | 'cancel',
    defaultReason: string,
  ) => {
    const reason = window.prompt('Motivo de la accion', defaultReason);
    if (!reason || reason.trim().length < 3) return;
    setActionLoadingId(id);
    try {
      await api.post(`/purchase-orders/${encodeURIComponent(id)}/${action}`, { reason: reason.trim() });
      await loadOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo ejecutar la accion');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!yachtId) return;
    setSavingCreate(true);
    try {
      await api.post(`/yachts/${encodeURIComponent(yachtId)}/purchase-orders`, {
        vendorName: createVendor.trim(),
        expectedDeliveryAt: createDelivery || undefined,
        lines: [
          {
            itemId: lineItemId || undefined,
            freeTextName: lineName || undefined,
            quantityOrdered: Number(lineQty),
            unitPrice: Number(linePrice),
            taxRate: 0,
          },
        ],
      });
      setShowCreate(false);
      setCreateVendor('');
      setCreateDelivery('');
      setLineItemId('');
      setLineName('');
      setLineQty('1');
      setLinePrice('0');
      await loadOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo crear PO');
    } finally {
      setSavingCreate(false);
    }
  };

  const openReceive = (order: PurchaseOrder) => {
    const next: Record<string, string> = {};
    for (const line of order.lines) {
      const remaining = Math.max(line.quantityOrdered - line.quantityReceived, 0);
      next[line.id] = remaining > 0 ? String(remaining) : '0';
    }
    setReceiveOrder(order);
    setReceiveReason('Recepcion de mercaderia');
    setReceiveQty(next);
    setShowReceive(true);
  };

  const handleReceive = async (event: FormEvent) => {
    event.preventDefault();
    if (!receiveOrder) return;
    setSavingReceive(true);
    try {
      const lines = receiveOrder.lines
        .map((line) => ({
          purchaseOrderLineId: line.id,
          quantityReceived: Number(receiveQty[line.id] || 0),
        }))
        .filter((line) => line.quantityReceived > 0);

      if (lines.length === 0) {
        alert('Debes ingresar al menos una linea con cantidad recibida');
        setSavingReceive(false);
        return;
      }

      await api.post(`/purchase-orders/${encodeURIComponent(receiveOrder.id)}/receive`, {
        reason: receiveReason.trim(),
        lines,
      });
      setShowReceive(false);
      setReceiveOrder(null);
      await loadOrders();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo registrar recepcion');
    } finally {
      setSavingReceive(false);
    }
  };

  useEffect(() => {
    const poId = searchParams.get('poId');
    if (!poId) return;
    openDetail(poId).catch(() => {});
  }, [openDetail, searchParams]);

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Ordenes de compra</h1>
            <p className="text-sm text-text-secondary">
              Gestion de compras por yate con recepcion parcial/final e integracion con inventario.
            </p>
            <p className="mt-1 text-xs text-text-muted">Yate: {currentYacht?.name || 'Cargando...'}</p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-black hover:bg-gold-hover"
            >
              Nueva PO
            </button>
          )}
        </div>
      </header>

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | PurchaseOrderStatus)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
          >
            <option value="all">Todos los estados</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="kpi-card w-full lg:w-auto">
            <p className="kpi-label">Total PO</p>
            <p className="kpi-value">{total}</p>
          </div>
          <button
            type="button"
            onClick={() => loadOrders()}
            className="rounded-lg border border-border px-3 py-2 text-sm text-text-primary hover:bg-surface-hover lg:w-auto"
          >
            Actualizar
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface">
        {loading ? (
          <div className="p-8 text-center text-sm text-text-secondary">Cargando ordenes...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-300">{error}</div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-secondary">No hay ordenes para este filtro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-hover text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-4 py-3 text-left">PO</th>
                  <th className="px-4 py-3 text-left">Proveedor</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-left">Total</th>
                  <th className="px-4 py-3 text-left">Entrega</th>
                  <th className="px-4 py-3 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-t border-border">
                    <td className="px-4 py-3 text-text-primary">{order.poNumber}</td>
                    <td className="px-4 py-3 text-text-secondary">{order.vendorName}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass(order.status)}`}>
                        {STATUS_LABEL[order.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-primary">
                      {order.currency} {order.total.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {order.expectedDeliveryAt
                        ? new Date(order.expectedDeliveryAt).toLocaleDateString('es-EC')
                        : 'No definida'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openDetail(order.id)}
                          className="rounded-lg border border-border px-2 py-1 text-xs text-text-primary"
                        >
                          Detalle
                        </button>
                        {order.status === 'draft' && canCreate && (
                          <button
                            type="button"
                            disabled={actionLoadingId === order.id}
                            onClick={() => runAction(order.id, 'submit', 'Envio a aprobacion')}
                            className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-300"
                          >
                            Enviar
                          </button>
                        )}
                        {order.status === 'submitted' && canApprove && (
                          <button
                            type="button"
                            disabled={actionLoadingId === order.id}
                            onClick={() => runAction(order.id, 'approve', 'Aprobacion de orden')}
                            className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300"
                          >
                            Aprobar
                          </button>
                        )}
                        {order.status === 'approved' && canOrder && (
                          <button
                            type="button"
                            disabled={actionLoadingId === order.id}
                            onClick={() => runAction(order.id, 'mark-ordered', 'Orden emitida a proveedor')}
                            className="rounded-lg border border-blue-400/40 bg-blue-500/10 px-2 py-1 text-xs text-blue-200"
                          >
                            Emitir
                          </button>
                        )}
                        {(order.status === 'ordered' || order.status === 'partially_received') && canReceive && (
                          <button
                            type="button"
                            onClick={() => openReceive(order)}
                            className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-200"
                          >
                            Recibir
                          </button>
                        )}
                        {order.status !== 'received' && order.status !== 'cancelled' && canOrder && (
                          <button
                            type="button"
                            disabled={actionLoadingId === order.id}
                            onClick={() => runAction(order.id, 'cancel', 'Cancelacion de orden')}
                            className="rounded-lg border border-red-400/40 bg-red-500/10 px-2 py-1 text-xs text-red-200"
                          >
                            Cancelar
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

      {showCreate && (
        <Modal title="Nueva orden de compra" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <label className="block text-sm text-text-secondary">
              Proveedor
              <input
                required
                minLength={2}
                value={createVendor}
                onChange={(event) => setCreateVendor(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
            <label className="block text-sm text-text-secondary">
              Entrega esperada
              <input
                type="datetime-local"
                value={createDelivery}
                onChange={(event) => setCreateDelivery(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-sm font-medium text-text-primary">Linea principal</p>
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={lineItemId}
                  onChange={(event) => setLineItemId(event.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                >
                  <option value="">Item libre</option>
                  {inventory.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} {item.sku ? `(${item.sku})` : ''}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Nombre libre (si no eliges item)"
                  value={lineName}
                  onChange={(event) => setLineName(event.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input
                  type="number"
                  min={0.0001}
                  step="0.01"
                  value={lineQty}
                  onChange={(event) => setLineQty(event.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={linePrice}
                  onChange={(event) => setLinePrice(event.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingCreate}
                className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
              >
                {savingCreate ? 'Guardando...' : 'Crear PO'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showReceive && receiveOrder && (
        <Modal title={`Recepcion ${receiveOrder.poNumber}`} onClose={() => setShowReceive(false)}>
          <form onSubmit={handleReceive} className="space-y-4">
            <label className="block text-sm text-text-secondary">
              Motivo
              <input
                required
                minLength={3}
                value={receiveReason}
                onChange={(event) => setReceiveReason(event.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary"
              />
            </label>
            <div className="space-y-2 rounded-lg border border-border p-3">
              {receiveOrder.lines.map((line) => {
                const remaining = Math.max(line.quantityOrdered - line.quantityReceived, 0);
                return (
                  <div key={line.id} className="grid gap-2 md:grid-cols-3 md:items-center">
                    <div className="text-sm text-text-primary">{line.item?.name || line.freeTextName || 'N/A'}</div>
                    <div className="text-xs text-text-secondary">Pendiente: {remaining}</div>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      max={remaining}
                      value={receiveQty[line.id] || '0'}
                      onChange={(event) =>
                        setReceiveQty((prev) => ({
                          ...prev,
                          [line.id]: event.target.value,
                        }))
                      }
                      className="rounded-lg border border-border bg-background px-2 py-2 text-sm text-text-primary"
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowReceive(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-text-primary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingReceive}
                className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-black disabled:opacity-60"
              >
                {savingReceive ? 'Guardando...' : 'Confirmar recepcion'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showDetail && detailOrder && (
        <Modal title={`Detalle ${detailOrder.poNumber}`} onClose={() => setShowDetail(false)}>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-text-secondary">Proveedor</p>
                <p className="text-sm font-medium text-text-primary">{detailOrder.vendorName}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-text-secondary">Estado</p>
                <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClass(detailOrder.status)}`}>
                  {STATUS_LABEL[detailOrder.status]}
                </span>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-text-secondary">Total</p>
                <p className="text-sm font-medium text-text-primary">
                  {detailOrder.currency} {detailOrder.total.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border">
              <div className="border-b border-border px-3 py-2 text-sm font-medium text-text-primary">Lineas</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-hover text-xs uppercase text-text-secondary">
                    <tr>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2 text-left">Ordenada</th>
                      <th className="px-3 py-2 text-left">Recibida</th>
                      <th className="px-3 py-2 text-left">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailOrder.lines.map((line) => (
                      <tr key={line.id} className="border-t border-border">
                        <td className="px-3 py-2 text-text-primary">{line.item?.name || line.freeTextName || 'N/A'}</td>
                        <td className="px-3 py-2 text-text-secondary">{line.quantityOrdered}</td>
                        <td className="px-3 py-2 text-text-secondary">{line.quantityReceived}</td>
                        <td className="px-3 py-2 text-text-secondary">
                          {detailOrder.currency} {line.unitPrice.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
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

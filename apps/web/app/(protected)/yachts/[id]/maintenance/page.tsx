'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useYacht } from '@/lib/yacht-context';

type MaintenanceStatus =
  | 'Draft'
  | 'Submitted'
  | 'Approved'
  | 'InProgress'
  | 'Completed'
  | 'Rejected'
  | 'Cancelled';

type MaintenancePriority = 'Low' | 'Medium' | 'High' | 'Critical';

interface MaintenanceEvidence {
  id: string;
  fileUrl: string;
  comment?: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

interface MaintenanceTask {
  id: string;
  yachtId: string;
  title: string;
  description?: string | null;
  engineId?: string | null;
  systemTag?: string | null;
  priority: MaintenancePriority;
  dueDate: string;
  assignedToUserId?: string | null;
  status: MaintenanceStatus;
  rejectionReason?: string | null;
  completionNotes?: string | null;
  createdAt: string;
  evidences: MaintenanceEvidence[];
}

interface MaintenanceSummary {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  inProgress: number;
  completed: number;
  rejected: number;
  overdue: number;
}

interface CrewOption {
  userId: string;
  name: string;
  email: string;
}

const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  Draft: 'Borrador',
  Submitted: 'Enviado',
  Approved: 'Aprobado',
  InProgress: 'En progreso',
  Completed: 'Completado',
  Rejected: 'Rechazado',
  Cancelled: 'Cancelado',
};

const PRIORITY_LABEL: Record<MaintenancePriority, string> = {
  Low: 'Baja',
  Medium: 'Media',
  High: 'Alta',
  Critical: 'Critica',
};

function StatusBadge({ status }: { status: MaintenanceStatus }) {
  const color =
    status === 'Completed'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'Rejected' || status === 'Cancelled'
        ? 'bg-red-100 text-red-700'
        : status === 'Approved' || status === 'InProgress'
          ? 'bg-blue-100 text-blue-700'
          : status === 'Submitted'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-slate-100 text-slate-700';

  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${color}`}>{STATUS_LABEL[status]}</span>;
}

function PriorityBadge({ priority }: { priority: MaintenancePriority }) {
  const color =
    priority === 'Critical'
      ? 'bg-red-100 text-red-700'
      : priority === 'High'
        ? 'bg-orange-100 text-orange-700'
        : priority === 'Medium'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-slate-100 text-slate-700';

  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${color}`}>{PRIORITY_LABEL[priority]}</span>;
}

export default function YachtMaintenancePage() {
  const params = useParams();
  const yachtId = String(params.id || '');
  const { currentYacht } = useYacht();
  const { user } = useAuth();

  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [summary, setSummary] = useState<MaintenanceSummary | null>(null);
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | MaintenanceStatus>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    dueDate: '',
    priority: 'Medium' as MaintenancePriority,
    description: '',
    systemTag: '',
    assignedToUserId: '',
  });

  const role = user?.role || '';
  const canCreate = ['Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin'].includes(role);
  const canReview = ['Chief Engineer', 'Captain', 'Management/Office', 'Admin', 'SystemAdmin'].includes(role);
  const canComplete = ['Chief Engineer', 'Captain', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin'].includes(role);

  const fetchCrewOptions = useCallback(async () => {
    if (!yachtId) return;
    try {
      const data = await api.get<CrewOption[]>(`/hrm/crew-options?yachtId=${encodeURIComponent(yachtId)}`);
      setCrewOptions(data);
    } catch {
      setCrewOptions([]);
    }
  }, [yachtId]);

  const fetchData = useCallback(async () => {
    if (!yachtId) return;
    setIsLoading(true);
    setError(null);
    try {
      const statusQuery = statusFilter === 'all' ? '' : `&status=${statusFilter}`;
      const [summaryData, taskData] = await Promise.all([
        api.get<MaintenanceSummary>(`/maintenance/summary/${encodeURIComponent(yachtId)}`),
        api.get<MaintenanceTask[]>(
          `/maintenance/tasks?yachtId=${encodeURIComponent(yachtId)}${statusQuery}`,
        ),
      ]);
      setSummary(summaryData);
      setTasks(taskData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar mantenimiento');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, yachtId]);

  useEffect(() => {
    fetchData();
    fetchCrewOptions();
  }, [fetchData, fetchCrewOptions]);

  const crewNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const crew of crewOptions) {
      map.set(crew.userId, crew.name);
    }
    return map;
  }, [crewOptions]);

  const resetForm = () => {
    setForm({
      title: '',
      dueDate: '',
      priority: 'Medium',
      description: '',
      systemTag: '',
      assignedToUserId: '',
    });
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!yachtId) return;

    setSaving(true);
    try {
      await api.post('/maintenance/tasks', {
        yachtId,
        title: form.title,
        dueDate: new Date(form.dueDate).toISOString(),
        priority: form.priority,
        description: form.description || undefined,
        systemTag: form.systemTag || undefined,
        assignedToUserId: form.assignedToUserId || undefined,
      });
      setShowCreateModal(false);
      resetForm();
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo crear la tarea');
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (taskId: string, fn: () => Promise<unknown>) => {
    setActionLoadingId(taskId);
    try {
      await fn();
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo ejecutar la accion');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleEdit = (task: MaintenanceTask) => {
    const nextTitle = window.prompt('Nuevo titulo de tarea', task.title);
    if (!nextTitle || nextTitle.trim() === '') return;
    const nextDate = window.prompt('Nueva fecha limite (YYYY-MM-DD)', task.dueDate.slice(0, 10));
    if (!nextDate || nextDate.trim() === '') return;

    void runAction(task.id, () =>
      api.patch(`/maintenance/tasks/${task.id}`, {
        title: nextTitle.trim(),
        dueDate: new Date(nextDate).toISOString(),
      }),
    );
  };

  const handleSubmit = (task: MaintenanceTask) => {
    void runAction(task.id, () => api.post(`/maintenance/tasks/${task.id}/submit`, {}));
  };

  const handleApprove = (task: MaintenanceTask) => {
    void runAction(task.id, () => api.post(`/maintenance/tasks/${task.id}/approve`, {}));
  };

  const handleReject = (task: MaintenanceTask) => {
    const reason = window.prompt('Motivo del rechazo');
    if (!reason || reason.trim() === '') return;
    void runAction(task.id, () =>
      api.post(`/maintenance/tasks/${task.id}/reject`, { reason: reason.trim() }),
    );
  };

  const handleComplete = (task: MaintenanceTask) => {
    const notes = window.prompt('Notas de cierre (opcional)') || '';
    void runAction(task.id, () =>
      api.post(`/maintenance/tasks/${task.id}/complete`, { notes: notes.trim() }),
    );
  };

  const handleAddEvidence = (task: MaintenanceTask) => {
    const fileUrl = window.prompt('URL de la evidencia');
    if (!fileUrl || fileUrl.trim() === '') return;
    const comment = window.prompt('Comentario (opcional)') || '';
    void runAction(task.id, () =>
      api.post(`/maintenance/tasks/${task.id}/evidences`, {
        fileUrl: fileUrl.trim(),
        comment: comment.trim() || undefined,
      }),
    );
  };

  if (isLoading && tasks.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-text-secondary">Cargando mantenimiento...</div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            Mantenimiento {currentYacht ? `- ${currentYacht.name}` : ''}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Planificacion, aprobacion y cierre de tareas tecnicas del yate.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="rounded-lg bg-info px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Nueva tarea
          </button>
        )}
      </header>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-secondary">Pendientes</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {(summary?.draft || 0) + (summary?.submitted || 0) + (summary?.approved || 0) + (summary?.inProgress || 0)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-secondary">Vencidas</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{summary?.overdue || 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-secondary">Completadas</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{summary?.completed || 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-secondary">Total</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{summary?.total || 0}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-text-secondary" htmlFor="statusFilter">
          Estado
        </label>
        <select
          id="statusFilter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'all' | MaintenanceStatus)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
        >
          <option value="all">Todos</option>
          <option value="Draft">Borrador</option>
          <option value="Submitted">Enviado</option>
          <option value="Approved">Aprobado</option>
          <option value="InProgress">En progreso</option>
          <option value="Completed">Completado</option>
          <option value="Rejected">Rechazado</option>
          <option value="Cancelled">Cancelado</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-hover text-xs uppercase tracking-wide text-text-secondary">
            <tr>
              <th className="px-4 py-3 text-left">Tarea</th>
              <th className="px-4 py-3 text-left">Vence</th>
              <th className="px-4 py-3 text-left">Prioridad</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-left">Responsable</th>
              <th className="px-4 py-3 text-left">Evidencias</th>
              <th className="px-4 py-3 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-secondary">
                  No hay tareas de mantenimiento con este filtro.
                </td>
              </tr>
            ) : (
              tasks.map((task) => (
                <tr key={task.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="font-medium text-text-primary">{task.title}</p>
                    <p className="text-xs text-text-secondary">{task.systemTag || 'Sin sistema'}</p>
                    {task.rejectionReason && <p className="text-xs text-red-600">Rechazo: {task.rejectionReason}</p>}
                  </td>
                  <td className="px-4 py-3 text-text-primary">{new Date(task.dueDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {task.assignedToUserId ? crewNameById.get(task.assignedToUserId) || task.assignedToUserId : 'Sin asignar'}
                  </td>
                  <td className="px-4 py-3 text-text-primary">{task.evidences.length}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {canCreate && task.status !== 'Completed' && task.status !== 'Cancelled' && (
                        <button
                          type="button"
                          onClick={() => handleEdit(task)}
                          disabled={actionLoadingId === task.id}
                          className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-hover"
                        >
                          Editar
                        </button>
                      )}
                      {canCreate && (task.status === 'Draft' || task.status === 'Rejected') && (
                        <button
                          type="button"
                          onClick={() => handleSubmit(task)}
                          disabled={actionLoadingId === task.id}
                          className="rounded border border-blue-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                        >
                          Enviar
                        </button>
                      )}
                      {canReview && task.status === 'Submitted' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleApprove(task)}
                            disabled={actionLoadingId === task.id}
                            className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(task)}
                            disabled={actionLoadingId === task.id}
                            className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                      {canComplete && (task.status === 'Approved' || task.status === 'InProgress') && (
                        <button
                          type="button"
                          onClick={() => handleComplete(task)}
                          disabled={actionLoadingId === task.id}
                          className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                        >
                          Completar
                        </button>
                      )}
                      {canComplete && (
                        <button
                          type="button"
                          onClick={() => handleAddEvidence(task)}
                          disabled={actionLoadingId === task.id}
                          className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-hover"
                        >
                          Evidencia
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Nueva tarea de mantenimiento</h2>
            <form className="mt-4 space-y-4" onSubmit={handleCreate}>
              <div>
                <label className="mb-1 block text-sm text-gray-700">Titulo</label>
                <input
                  required
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Ej: Cambio de filtro de combustible"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-gray-700">Fecha limite</label>
                  <input
                    type="date"
                    required
                    value={form.dueDate}
                    onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-700">Prioridad</label>
                  <select
                    value={form.priority}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, priority: event.target.value as MaintenancePriority }))
                    }
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                  >
                    <option value="Low">Baja</option>
                    <option value="Medium">Media</option>
                    <option value="High">Alta</option>
                    <option value="Critical">Critica</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-700">Sistema (opcional)</label>
                <input
                  value={form.systemTag}
                  onChange={(event) => setForm((prev) => ({ ...prev, systemTag: event.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Ej: ENGINE.FUEL"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-700">Responsable (opcional)</label>
                <select
                  value={form.assignedToUserId}
                  onChange={(event) => setForm((prev) => ({ ...prev, assignedToUserId: event.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">Sin asignar</option>
                  {crewOptions.map((crew) => (
                    <option key={crew.userId} value={crew.userId}>
                      {crew.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-700">Descripcion</label>
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border px-3 py-2 text-sm text-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? 'Guardando...' : 'Crear tarea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

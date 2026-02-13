'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useYacht } from '@/lib/yacht-context';

interface CrewOption {
  userId: string;
  name: string;
  email: string;
}

interface HrmSchedule {
  id: string;
  userId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  restHours: number;
  notes?: string | null;
}

interface RestDeclaration {
  id: string;
  userId: string;
  workDate: string;
  workedHours: number;
  restHours: number;
  compliant: boolean;
  comment?: string | null;
}

interface RestHoursReport {
  items: RestDeclaration[];
  summary: {
    total: number;
    compliant: number;
    nonCompliant: number;
    complianceRate: number;
    totalWorkedHours: number;
    totalRestHours: number;
  };
}

type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

interface LeaveRequest {
  id: string;
  userId: string;
  type: string;
  startDate: string;
  endDate: string;
  status: LeaveStatus;
  comment?: string | null;
  rejectionReason?: string | null;
}

type PayrollStatus = 'Draft' | 'Published';

interface PayrollLine {
  id: string;
  userId: string;
  userName?: string;
  baseAmount: number;
  bonusAmount: number;
  deductionsAmount: number;
  netAmount: number;
}

interface Payroll {
  id: string;
  period: string;
  currency: string;
  status: PayrollStatus;
  generatedAt: string;
  publishedAt?: string | null;
  lines: PayrollLine[];
}

const LEAVE_LABEL: Record<LeaveStatus, string> = {
  Pending: 'Pendiente',
  Approved: 'Aprobado',
  Rejected: 'Rechazado',
  Cancelled: 'Cancelado',
};

function LeaveBadge({ status }: { status: LeaveStatus }) {
  const color =
    status === 'Approved'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'Rejected' || status === 'Cancelled'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700';
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${color}`}>{LEAVE_LABEL[status]}</span>;
}

export default function YachtHrmPage() {
  const params = useParams();
  const yachtId = String(params.id || '');
  const { currentYacht } = useYacht();
  const { user } = useAuth();

  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([]);
  const [schedules, setSchedules] = useState<HrmSchedule[]>([]);
  const [restReport, setRestReport] = useState<RestHoursReport | null>(null);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showRestForm, setShowRestForm] = useState(false);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [showPayrollForm, setShowPayrollForm] = useState(false);

  const [scheduleForm, setScheduleForm] = useState({
    userId: '',
    workDate: '',
    startTime: '08:00',
    endTime: '17:00',
    restHours: '8',
    notes: '',
  });

  const [restForm, setRestForm] = useState({
    userId: '',
    workDate: '',
    workedHours: '8',
    restHours: '12',
    comment: '',
  });

  const [leaveForm, setLeaveForm] = useState({
    userId: '',
    type: 'Vacation',
    startDate: '',
    endDate: '',
    comment: '',
  });

  const [payrollForm, setPayrollForm] = useState({
    period: '',
    currency: 'USD',
  });

  const role = user?.role || '';
  const canManageSchedules = ['Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Admin', 'SystemAdmin'].includes(role);
  const canDeclareRest = ['Chief Engineer', 'Captain', 'HoD', 'Management/Office', 'Crew Member', 'Admin', 'SystemAdmin'].includes(role);
  const canCreateLeave = canDeclareRest;
  const canApproveLeaves = ['Captain', 'HoD', 'Management/Office', 'Admin', 'SystemAdmin'].includes(role);
  const canViewPayroll = ['Captain', 'Management/Office', 'Admin', 'SystemAdmin'].includes(role);
  const canGeneratePayroll = canViewPayroll;

  const crewNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const crew of crewOptions) {
      map.set(crew.userId, crew.name);
    }
    if (user?.id) {
      map.set(user.id, user.email);
    }
    return map;
  }, [crewOptions, user?.email, user?.id]);

  const fetchAll = useCallback(async () => {
    if (!yachtId) return;
    setIsLoading(true);
    setError(null);

    const safeGet = async <T,>(url: string, fallback: T): Promise<T> => {
      try {
        return await api.get<T>(url);
      } catch {
        return fallback;
      }
    };

    try {
      const [crewData, scheduleData, restData, leavesData, payrollData] = await Promise.all([
        safeGet<CrewOption[]>(`/hrm/crew-options?yachtId=${encodeURIComponent(yachtId)}`, []),
        safeGet<HrmSchedule[]>(`/hrm/schedules?yachtId=${encodeURIComponent(yachtId)}`, []),
        safeGet<RestHoursReport>(`/hrm/rest-hours/report?yachtId=${encodeURIComponent(yachtId)}`, {
          items: [],
          summary: {
            total: 0,
            compliant: 0,
            nonCompliant: 0,
            complianceRate: 100,
            totalWorkedHours: 0,
            totalRestHours: 0,
          },
        }),
        safeGet<LeaveRequest[]>(`/hrm/leaves?yachtId=${encodeURIComponent(yachtId)}`, []),
        canViewPayroll
          ? safeGet<Payroll[]>(`/hrm/payrolls?yachtId=${encodeURIComponent(yachtId)}`, [])
          : Promise.resolve([] as Payroll[]),
      ]);

      setCrewOptions(crewData);
      setSchedules(scheduleData);
      setRestReport(restData);
      setLeaves(leavesData);
      setPayrolls(payrollData);

      const defaultUserId = user?.id || crewData[0]?.userId || '';
      if (!scheduleForm.userId && defaultUserId) {
        setScheduleForm((prev) => ({ ...prev, userId: defaultUserId }));
      }
      if (!restForm.userId && defaultUserId) {
        setRestForm((prev) => ({ ...prev, userId: defaultUserId }));
      }
      if (!leaveForm.userId && defaultUserId) {
        setLeaveForm((prev) => ({ ...prev, userId: defaultUserId }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar RRHH');
    } finally {
      setIsLoading(false);
    }
  }, [canViewPayroll, leaveForm.userId, restForm.userId, scheduleForm.userId, user?.id, yachtId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const runAction = async (id: string, fn: () => Promise<unknown>) => {
    setActionLoadingId(id);
    try {
      await fn();
      await fetchAll();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo ejecutar la accion');
    } finally {
      setActionLoadingId(null);
    }
  };

  const createSchedule = async (event: FormEvent) => {
    event.preventDefault();
    if (!scheduleForm.userId) {
      alert('Selecciona un tripulante');
      return;
    }

    await runAction('create-schedule', () =>
      api.post('/hrm/schedules', {
        yachtId,
        userId: scheduleForm.userId,
        workDate: new Date(scheduleForm.workDate).toISOString(),
        startTime: scheduleForm.startTime,
        endTime: scheduleForm.endTime,
        restHours: Number(scheduleForm.restHours),
        notes: scheduleForm.notes || undefined,
      }),
    );
    setShowScheduleForm(false);
  };

  const createRestDeclaration = async (event: FormEvent) => {
    event.preventDefault();
    if (!restForm.userId) {
      alert('Selecciona un tripulante');
      return;
    }

    await runAction('create-rest', () =>
      api.post('/hrm/rest-hours/declarations', {
        yachtId,
        userId: restForm.userId,
        workDate: new Date(restForm.workDate).toISOString(),
        workedHours: Number(restForm.workedHours),
        restHours: Number(restForm.restHours),
        comment: restForm.comment || undefined,
      }),
    );
    setShowRestForm(false);
  };

  const createLeave = async (event: FormEvent) => {
    event.preventDefault();
    if (!leaveForm.userId) {
      alert('Selecciona un tripulante');
      return;
    }

    await runAction('create-leave', () =>
      api.post('/hrm/leaves', {
        yachtId,
        userId: leaveForm.userId,
        type: leaveForm.type,
        startDate: new Date(leaveForm.startDate).toISOString(),
        endDate: new Date(leaveForm.endDate).toISOString(),
        comment: leaveForm.comment || undefined,
      }),
    );
    setShowLeaveForm(false);
  };

  const generatePayroll = async (event: FormEvent) => {
    event.preventDefault();
    await runAction('generate-payroll', () =>
      api.post('/hrm/payrolls/generate', {
        yachtId,
        period: payrollForm.period,
        currency: payrollForm.currency,
      }),
    );
    setShowPayrollForm(false);
  };

  if (isLoading && schedules.length === 0 && leaves.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-text-secondary">Cargando RRHH...</div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary">
          RRHH {currentYacht ? `- ${currentYacht.name}` : ''}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Jornadas, descansos, permisos y nomina operativa por yate.
        </p>
      </header>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="kpi-grid">
        <div className="kpi-card">
          <p className="kpi-label">Horarios</p>
          <p className="kpi-value">{schedules.length}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">Descansos declarados</p>
          <p className="kpi-value">{restReport?.summary.total || 0}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">Solicitudes de permiso</p>
          <p className="kpi-value">{leaves.length}</p>
        </div>
        <div className="kpi-card kpi-card-accent">
          <p className="kpi-label">Cumplimiento descanso</p>
          <p className="kpi-value text-emerald-500">{restReport?.summary.complianceRate ?? 100}%</p>
        </div>
      </div>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Jornadas de trabajo</h2>
          {canManageSchedules && (
            <button
              type="button"
              onClick={() => setShowScheduleForm((prev) => !prev)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-primary hover:bg-surface-hover"
            >
              {showScheduleForm ? 'Cerrar' : 'Nuevo horario'}
            </button>
          )}
        </div>

        {showScheduleForm && (
          <form onSubmit={createSchedule} className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 md:grid-cols-6">
            <select
              required
              value={scheduleForm.userId}
              onChange={(event) => setScheduleForm((prev) => ({ ...prev, userId: event.target.value }))}
              className="rounded border px-2 py-2 text-xs md:col-span-2"
            >
              <option value="">Tripulante</option>
              {crewOptions.map((crew) => (
                <option key={crew.userId} value={crew.userId}>
                  {crew.name}
                </option>
              ))}
            </select>
            <input
              required
              type="date"
              value={scheduleForm.workDate}
              onChange={(event) => setScheduleForm((prev) => ({ ...prev, workDate: event.target.value }))}
              className="rounded border px-2 py-2 text-xs"
            />
            <input
              required
              type="time"
              value={scheduleForm.startTime}
              onChange={(event) => setScheduleForm((prev) => ({ ...prev, startTime: event.target.value }))}
              className="rounded border px-2 py-2 text-xs"
            />
            <input
              required
              type="time"
              value={scheduleForm.endTime}
              onChange={(event) => setScheduleForm((prev) => ({ ...prev, endTime: event.target.value }))}
              className="rounded border px-2 py-2 text-xs"
            />
            <button
              type="submit"
              className="rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              Guardar
            </button>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-hover text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-3 py-2 text-left">Tripulante</th>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Horario</th>
                <th className="px-3 py-2 text-left">Descanso</th>
                <th className="px-3 py-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {schedules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-5 text-center text-text-secondary">
                    No hay horarios cargados.
                  </td>
                </tr>
              ) : (
                schedules.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2 text-text-primary">{crewNameById.get(row.userId) || row.userId}</td>
                    <td className="px-3 py-2 text-text-primary">{new Date(row.workDate).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-text-primary">
                      {row.startTime} - {row.endTime}
                    </td>
                    <td className="px-3 py-2 text-text-primary">{row.restHours}h</td>
                    <td className="px-3 py-2">
                      {canManageSchedules && (
                        <button
                          type="button"
                          disabled={actionLoadingId === row.id}
                          onClick={() => {
                            const startTime = window.prompt('Hora inicio (HH:mm)', row.startTime);
                            if (!startTime) return;
                            const endTime = window.prompt('Hora fin (HH:mm)', row.endTime);
                            if (!endTime) return;
                            void runAction(row.id, () =>
                              api.patch(`/hrm/schedules/${row.id}`, {
                                startTime: startTime.trim(),
                                endTime: endTime.trim(),
                              }),
                            );
                          }}
                          className="rounded border border-border px-2 py-1 text-xs text-text-primary hover:bg-surface-hover"
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Descanso y cumplimiento</h2>
          {canDeclareRest && (
            <button
              type="button"
              onClick={() => setShowRestForm((prev) => !prev)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-primary hover:bg-surface-hover"
            >
              {showRestForm ? 'Cerrar' : 'Nueva declaracion'}
            </button>
          )}
        </div>

        {showRestForm && (
          <form onSubmit={createRestDeclaration} className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 md:grid-cols-6">
            <select
              required
              value={restForm.userId}
              onChange={(event) => setRestForm((prev) => ({ ...prev, userId: event.target.value }))}
              className="rounded border px-2 py-2 text-xs md:col-span-2"
            >
              <option value="">Tripulante</option>
              {crewOptions.map((crew) => (
                <option key={crew.userId} value={crew.userId}>
                  {crew.name}
                </option>
              ))}
            </select>
            <input
              required
              type="date"
              value={restForm.workDate}
              onChange={(event) => setRestForm((prev) => ({ ...prev, workDate: event.target.value }))}
              className="rounded border px-2 py-2 text-xs"
            />
            <input
              required
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={restForm.workedHours}
              onChange={(event) => setRestForm((prev) => ({ ...prev, workedHours: event.target.value }))}
              className="rounded border px-2 py-2 text-xs"
              placeholder="Horas trabajo"
            />
            <input
              required
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={restForm.restHours}
              onChange={(event) => setRestForm((prev) => ({ ...prev, restHours: event.target.value }))}
              className="rounded border px-2 py-2 text-xs"
              placeholder="Horas descanso"
            />
            <button
              type="submit"
              className="rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              Guardar
            </button>
          </form>
        )}

        <div className="text-xs text-text-secondary">
          Total: {restReport?.summary.total || 0} | Cumplen: {restReport?.summary.compliant || 0} | No cumplen:{' '}
          {restReport?.summary.nonCompliant || 0}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Permisos y ausencias</h2>
          {canCreateLeave && (
            <button
              type="button"
              onClick={() => setShowLeaveForm((prev) => !prev)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-primary hover:bg-surface-hover"
            >
              {showLeaveForm ? 'Cerrar' : 'Nueva solicitud'}
            </button>
          )}
        </div>

        {showLeaveForm && (
          <form onSubmit={createLeave} className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 md:grid-cols-6">
            <select
              required
              value={leaveForm.userId}
              onChange={(event) => setLeaveForm((prev) => ({ ...prev, userId: event.target.value }))}
              className="rounded border px-2 py-2 text-xs md:col-span-2"
            >
              <option value="">Tripulante</option>
              {crewOptions.map((crew) => (
                <option key={crew.userId} value={crew.userId}>
                  {crew.name}
                </option>
              ))}
            </select>
            <input
              required
              value={leaveForm.type}
              onChange={(event) => setLeaveForm((prev) => ({ ...prev, type: event.target.value }))}
              className="rounded border px-2 py-2 text-xs"
              placeholder="Tipo"
            />
            <input
              required
              type="date"
              value={leaveForm.startDate}
              onChange={(event) => setLeaveForm((prev) => ({ ...prev, startDate: event.target.value }))}
              className="rounded border px-2 py-2 text-xs"
            />
            <input
              required
              type="date"
              value={leaveForm.endDate}
              onChange={(event) => setLeaveForm((prev) => ({ ...prev, endDate: event.target.value }))}
              className="rounded border px-2 py-2 text-xs"
            />
            <button
              type="submit"
              className="rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              Guardar
            </button>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-hover text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-3 py-2 text-left">Tripulante</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Rango</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {leaves.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-5 text-center text-text-secondary">
                    No hay solicitudes.
                  </td>
                </tr>
              ) : (
                leaves.map((row) => (
                  <tr key={row.id} className="border-t border-border">
                    <td className="px-3 py-2 text-text-primary">{crewNameById.get(row.userId) || row.userId}</td>
                    <td className="px-3 py-2 text-text-primary">{row.type}</td>
                    <td className="px-3 py-2 text-text-primary">
                      {new Date(row.startDate).toLocaleDateString()} - {new Date(row.endDate).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">
                      <LeaveBadge status={row.status} />
                    </td>
                    <td className="px-3 py-2">
                      {canApproveLeaves && row.status === 'Pending' && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={actionLoadingId === row.id}
                            onClick={() =>
                              void runAction(row.id, () => api.post(`/hrm/leaves/${row.id}/approve`, {}))
                            }
                            className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            disabled={actionLoadingId === row.id}
                            onClick={() => {
                              const reason = window.prompt('Motivo del rechazo');
                              void runAction(row.id, () =>
                                api.post(`/hrm/leaves/${row.id}/reject`, {
                                  reason: reason?.trim() || undefined,
                                }),
                              );
                            }}
                            className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {canViewPayroll && (
        <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-text-primary">Nomina</h2>
            {canGeneratePayroll && (
              <button
                type="button"
                onClick={() => setShowPayrollForm((prev) => !prev)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-primary hover:bg-surface-hover"
              >
                {showPayrollForm ? 'Cerrar' : 'Generar nomina'}
              </button>
            )}
          </div>

          {showPayrollForm && (
            <form onSubmit={generatePayroll} className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 md:grid-cols-4">
              <input
                required
                placeholder="Periodo YYYY-MM"
                value={payrollForm.period}
                onChange={(event) => setPayrollForm((prev) => ({ ...prev, period: event.target.value }))}
                className="rounded border px-2 py-2 text-xs"
              />
              <input
                value={payrollForm.currency}
                onChange={(event) => setPayrollForm((prev) => ({ ...prev, currency: event.target.value }))}
                className="rounded border px-2 py-2 text-xs"
              />
              <button
                type="submit"
                className="rounded bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                Generar
              </button>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-hover text-xs uppercase tracking-wide text-text-secondary">
                <tr>
                  <th className="px-3 py-2 text-left">Periodo</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-left">Moneda</th>
                  <th className="px-3 py-2 text-left">Lineas</th>
                  <th className="px-3 py-2 text-left">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {payrolls.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-5 text-center text-text-secondary">
                      No hay nominas generadas.
                    </td>
                  </tr>
                ) : (
                  payrolls.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-3 py-2 text-text-primary">{row.period}</td>
                      <td className="px-3 py-2 text-text-primary">{row.status === 'Published' ? 'Publicada' : 'Borrador'}</td>
                      <td className="px-3 py-2 text-text-primary">{row.currency}</td>
                      <td className="px-3 py-2 text-text-primary">{row.lines.length}</td>
                      <td className="px-3 py-2">
                        {canGeneratePayroll && row.status === 'Draft' && (
                          <button
                            type="button"
                            disabled={actionLoadingId === row.id}
                            onClick={() =>
                              void runAction(row.id, () => api.post(`/hrm/payrolls/${row.id}/publish`, {}))
                            }
                            className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                          >
                            Publicar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}

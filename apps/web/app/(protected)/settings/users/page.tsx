'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatFlagLabel } from '@/lib/flags';

type RoleName =
  | 'SystemAdmin'
  | 'Admin'
  | 'Management/Office'
  | 'Captain'
  | 'Chief Engineer'
  | 'HoD'
  | 'Crew Member';

type UserListItem = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  role: { name: string };
  roleName?: string;
  activeYachtCount: number;
};

type YachtOption = {
  id: string;
  name: string;
  flag: string;
};

type UserAccess = {
  id: string;
  yachtId: string;
  roleNameOverride: string | null;
  revokedAt: string | null;
  createdAt: string;
  yacht: {
    id: string;
    name: string;
    flag: string;
  };
};

type UserAccessResponse = {
  user: {
    id: string;
    email: string;
    fullName: string;
    isActive: boolean;
  };
  accesses: UserAccess[];
};

type AssignmentDraft = {
  enabled: boolean;
  roleNameOverride: string;
};

const ROLE_OPTIONS: RoleName[] = [
  'SystemAdmin',
  'Admin',
  'Management/Office',
  'Captain',
  'Chief Engineer',
  'HoD',
  'Crew Member',
];

const ACCESS_ROLE_OPTIONS: RoleName[] = [
  'Captain',
  'Chief Engineer',
  'HoD',
  'Crew Member',
  'Admin',
  'Management/Office',
  'SystemAdmin',
];

export default function UsersSettingsPage() {
  const { user } = useAuth();
  const canRead = user?.role === 'SystemAdmin' || user?.role === 'Admin' || user?.role === 'Management/Office';
  const canManage = user?.role === 'SystemAdmin';

  const [items, setItems] = useState<UserListItem[]>([]);
  const [yachts, setYachts] = useState<YachtOption[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null);
  const [selectedAccessData, setSelectedAccessData] = useState<UserAccessResponse | null>(null);
  const [assignmentDraft, setAssignmentDraft] = useState<Record<string, AssignmentDraft>>({});

  const [createForm, setCreateForm] = useState({
    email: '',
    fullName: '',
    password: '',
    roleName: 'Crew Member' as RoleName,
  });

  const loadUsers = async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const suffix = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      const data = await api.get<UserListItem[]>(`/users${suffix}`);
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  const loadYachts = async () => {
    try {
      const data = await api.get<YachtOption[]>('/yachts');
      setYachts(data);
    } catch {
      setYachts([]);
    }
  };

  useEffect(() => {
    if (!canRead) return;
    loadUsers().catch(() => {});
    loadYachts().catch(() => {});
  }, [canRead]);

  const totalActive = useMemo(() => items.filter((item) => item.isActive).length, [items]);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    await loadUsers(query);
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    setSaving(true);
    setError(null);
    try {
      await api.post('/users', {
        email: createForm.email,
        fullName: createForm.fullName,
        password: createForm.password,
        roleName: createForm.roleName,
      });
      setShowCreate(false);
      setCreateForm({ email: '', fullName: '', password: '', roleName: 'Crew Member' });
      await loadUsers(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear usuario');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (item: UserListItem) => {
    if (!canManage) return;
    const nextStatus = !item.isActive;
    const confirmed = window.confirm(
      nextStatus
        ? `Activar usuario ${item.email}?`
        : `Desactivar usuario ${item.email}?`,
    );
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    try {
      await api.patch(`/users/${item.id}/status`, { isActive: nextStatus });
      await loadUsers(query);
      if (selectedUser?.id === item.id && selectedAccessData) {
        setSelectedUser({ ...item, isActive: nextStatus });
        setSelectedAccessData({
          ...selectedAccessData,
          user: { ...selectedAccessData.user, isActive: nextStatus },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar estado');
    } finally {
      setSaving(false);
    }
  };

  const openAssignModal = async (item: UserListItem) => {
    setSaving(true);
    setError(null);
    try {
      const accessData = await api.get<UserAccessResponse>(`/users/${item.id}/accesses?includeRevoked=true`);
      const draft: Record<string, AssignmentDraft> = {};
      for (const yacht of yachts) {
        draft[yacht.id] = { enabled: false, roleNameOverride: '' };
      }
      for (const access of accessData.accesses) {
        if (access.revokedAt) continue;
        draft[access.yachtId] = {
          enabled: true,
          roleNameOverride: access.roleNameOverride ?? '',
        };
      }

      setSelectedUser(item);
      setSelectedAccessData(accessData);
      setAssignmentDraft(draft);
      setShowAssign(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar asignaciones');
    } finally {
      setSaving(false);
    }
  };

  const saveAssignments = async () => {
    if (!canManage || !selectedUser) return;
    setSaving(true);
    setError(null);
    try {
      const assignments = Object.entries(assignmentDraft)
        .filter(([, value]) => value.enabled)
        .map(([yachtId, value]) => ({
          yachtId,
          ...(value.roleNameOverride ? { roleNameOverride: value.roleNameOverride } : {}),
        }));

      await api.put(`/users/${selectedUser.id}/accesses`, { assignments });
      const fresh = await api.get<UserAccessResponse>(`/users/${selectedUser.id}/accesses?includeRevoked=true`);
      setSelectedAccessData(fresh);
      await loadUsers(query);
      setShowAssign(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar asignaciones');
    } finally {
      setSaving(false);
    }
  };

  if (!canRead) {
    return (
      <section className="max-w-3xl space-y-3">
        <h1 className="text-2xl font-semibold text-text-primary">Gestion de usuarios</h1>
        <div className="rounded-lg border border-border bg-surface p-4 text-sm text-text-secondary">
          No tienes permisos para ver esta seccion.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Gestion de usuarios</h1>
          <p className="text-sm text-text-secondary">
            Crea usuarios, controla estado y asigna acceso por yate.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <span className="text-base leading-none">+</span>
            Crear usuario
          </button>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-text-secondary">Usuarios activos</p>
          <p className="text-lg font-semibold text-text-primary">{totalActive}</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs text-text-secondary">Total usuarios</p>
          <p className="text-lg font-semibold text-text-primary">{items.length}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
        <div className="min-w-[240px] flex-1">
          <label htmlFor="search-user" className="mb-1 block text-xs text-text-secondary">
            Buscar por correo o nombre
          </label>
          <input
            id="search-user"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
            placeholder="usuario@yachtpms.com"
          />
        </div>
        <button
          type="submit"
          className="w-full sm:w-auto rounded-lg border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover"
        >
          Buscar
        </button>
        <button
          type="button"
          className="w-full sm:w-auto rounded-lg border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover"
          onClick={() => {
            setQuery('');
            loadUsers().catch(() => {});
          }}
        >
          Limpiar
        </button>
      </form>

      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">
            Cargando usuarios...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">
            Sin resultados
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm font-semibold text-text-primary">{item.fullName}</p>
              <p className="mt-0.5 text-xs text-text-secondary">{item.email}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex rounded-full bg-slate-200 px-2 py-1 text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                  {item.roleName || item.role?.name}
                </span>
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                    item.isActive
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                  }`}
                >
                  {item.isActive ? 'Activo' : 'Inactivo'}
                </span>
                <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  Yates: {item.activeYachtCount}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => openAssignModal(item)}
                  className="rounded-lg border border-border px-3 py-2 text-xs text-text-primary hover:bg-surface-hover"
                >
                  Gestionar asignaciones
                </button>
                {canManage && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleToggleStatus(item)}
                    className="rounded-lg border border-border px-3 py-2 text-xs text-text-primary hover:bg-surface-hover disabled:opacity-50"
                  >
                    {item.isActive ? 'Desactivar usuario' : 'Activar usuario'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
        <table className="w-full min-w-[760px]">
          <thead className="bg-surface-hover">
            <tr>
              <th className="px-4 py-3 text-left text-xs text-text-secondary">Usuario</th>
              <th className="px-4 py-3 text-left text-xs text-text-secondary">Rol global</th>
              <th className="px-4 py-3 text-left text-xs text-text-secondary">Estado</th>
              <th className="px-4 py-3 text-left text-xs text-text-secondary">Yates activos</th>
              <th className="px-4 py-3 text-left text-xs text-text-secondary">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-sm text-text-secondary" colSpan={5}>
                  Cargando usuarios...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-sm text-text-secondary" colSpan={5}>
                  Sin resultados
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-text-primary">{item.fullName}</p>
                    <p className="text-xs text-text-secondary">{item.email}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary">{item.roleName || item.role?.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        item.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {item.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary">{item.activeYachtCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openAssignModal(item)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-primary hover:bg-surface-hover"
                      >
                        Asignaciones
                      </button>
                      {canManage && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => handleToggleStatus(item)}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-primary hover:bg-surface-hover disabled:opacity-50"
                        >
                          {item.isActive ? 'Desactivar' : 'Activar'}
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

      {showCreate && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="h-screen w-screen overflow-y-auto bg-surface p-5 sm:h-auto sm:w-full sm:max-w-lg sm:rounded-xl sm:border sm:border-border">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Crear usuario</h2>
              <button
                type="button"
                className="text-sm text-text-secondary hover:text-text-primary"
                onClick={() => setShowCreate(false)}
              >
                Cerrar
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-text-secondary" htmlFor="user-full-name">
                  Nombre completo
                </label>
                <input
                  id="user-full-name"
                  value={createForm.fullName}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, fullName: event.target.value }))
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-secondary" htmlFor="user-email">
                  Correo
                </label>
                <input
                  id="user-email"
                  type="email"
                  value={createForm.email}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, email: event.target.value }))
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-secondary" htmlFor="user-password">
                  Contrasena temporal
                </label>
                <input
                  id="user-password"
                  type="password"
                  value={createForm.password}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, password: event.target.value }))
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-text-secondary" htmlFor="user-role">
                  Rol global
                </label>
                <select
                  id="user-role"
                  value={createForm.roleName}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      roleName: event.target.value as RoleName,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="w-full sm:w-auto rounded-lg border border-border px-3 py-2 text-sm text-text-primary hover:bg-surface-hover"
                  onClick={() => setShowCreate(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full sm:w-auto rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAssign && selectedUser && selectedAccessData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="h-screen w-screen overflow-auto bg-surface p-5 sm:max-h-[90vh] sm:w-full sm:max-w-3xl sm:rounded-xl sm:border sm:border-border">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Asignaciones por yate</h2>
                <p className="text-xs text-text-secondary">
                  {selectedAccessData.user.email} - {selectedAccessData.user.isActive ? 'Activo' : 'Inactivo'}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover"
                onClick={() => setShowAssign(false)}
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-2">
              {yachts.length === 0 ? (
                <p className="text-sm text-text-secondary">No hay yates disponibles.</p>
              ) : (
                yachts.map((yacht) => {
                  const current = assignmentDraft[yacht.id] || { enabled: false, roleNameOverride: '' };
                  return (
                    <div
                      key={yacht.id}
                      className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-background p-3 md:grid-cols-[1fr_auto]"
                    >
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm text-text-primary">
                          <input
                            type="checkbox"
                            checked={current.enabled}
                            disabled={!canManage}
                            onChange={(event) =>
                              setAssignmentDraft((draft) => ({
                                ...draft,
                                [yacht.id]: {
                                  ...current,
                                  enabled: event.target.checked,
                                },
                              }))
                            }
                          />
                          {yacht.name} ({formatFlagLabel(yacht.flag)})
                        </label>
                        <div>
                          <label className="mb-1 block text-xs text-text-secondary">Rol override</label>
                          <select
                            value={current.roleNameOverride}
                            onChange={(event) =>
                              setAssignmentDraft((draft) => ({
                                ...draft,
                                [yacht.id]: {
                                  ...current,
                                  roleNameOverride: event.target.value,
                                },
                              }))
                            }
                            disabled={!canManage || !current.enabled}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary disabled:opacity-50"
                          >
                            <option value="">Sin override (usa rol global)</option>
                            {ACCESS_ROLE_OPTIONS.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-5">
              <h3 className="mb-2 text-sm font-medium text-text-primary">Historial revocado</h3>
              <div className="rounded-lg border border-border">
                {selectedAccessData.accesses.filter((access) => access.revokedAt).length === 0 ? (
                  <p className="p-3 text-xs text-text-secondary">Sin historial revocado.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {selectedAccessData.accesses
                      .filter((access) => access.revokedAt)
                      .map((access) => (
                        <li key={access.id} className="p-3 text-xs text-text-secondary">
                          {access.yacht.name} - revocado{' '}
                          {access.revokedAt ? new Date(access.revokedAt).toLocaleString() : '-'}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>

            {canManage && (
              <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button
                  type="button"
                  className="w-full sm:w-auto rounded-lg border border-border px-3 py-2 text-sm text-text-primary hover:bg-surface-hover"
                  onClick={() => setShowAssign(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveAssignments}
                  className="w-full sm:w-auto rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar asignaciones'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {canManage && (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="fixed bottom-5 right-5 z-40 rounded-full bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg md:hidden"
        >
          + Usuario
        </button>
      )}
    </section>
  );
}

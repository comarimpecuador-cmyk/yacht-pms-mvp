'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { GrantAccessRequest } from '@/lib/crew';
import { translate } from '@/lib/i18n';

type RoleName = 'Captain' | 'Chief Engineer' | 'HoD' | 'Crew Member' | 'Admin' | 'Management/Office' | 'SystemAdmin';
type UserOption = {
  id: string;
  email: string;
  fullName: string | null;
  isActive: boolean;
  role: { name: string };
};

interface AddUserModalProps {
  yachtId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const ROLES: { value: RoleName; label: string }[] = [
  { value: 'Captain', label: 'Captain' },
  { value: 'Chief Engineer', label: 'Chief Engineer' },
  { value: 'HoD', label: 'HoD (Head of Department)' },
  { value: 'Crew Member', label: 'Crew Member' },
  { value: 'Admin', label: 'Admin' },
  { value: 'Management/Office', label: 'Management/Office' },
  { value: 'SystemAdmin', label: 'SystemAdmin' },
];

export function AddUserModal({ yachtId, onClose, onSuccess }: AddUserModalProps) {
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [role, setRole] = useState<RoleName>('Crew Member');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const list = await api.get<UserOption[]>('/users');
        setUsers(list);
      } catch {
        setUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    };

    loadUsers();
  }, []);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId],
  );
  const activeUsers = useMemo(() => users.filter((u) => u.isActive), [users]);
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activeUsers;
    return activeUsers.filter((u) => {
      const name = (u.fullName || '').toLowerCase();
      return u.email.toLowerCase().includes(query) || name.includes(query);
    });
  }, [activeUsers, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (!selectedUserId) {
        throw new Error('Seleccione un usuario activo');
      }
      if (!selectedUser || !selectedUser.isActive) {
        throw new Error('El usuario seleccionado no esta disponible');
      }

      const request: GrantAccessRequest = {
        userId: selectedUser.id,
        roleNameOverride: role,
      };

      await api.post(`/yachts/${yachtId}/access`, request);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('errors.addUserFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="h-screen w-screen overflow-y-auto bg-white shadow-xl dark:bg-gray-800 sm:mx-4 sm:h-auto sm:w-full sm:max-w-lg sm:max-h-[90vh] sm:rounded-xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {translate('crew.addUserToCrew')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="search-user" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Buscar usuario
            </label>
            <input
              type="text"
              id="search-user"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre o correo"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="user-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Usuario activo
            </label>
            <select
              id="user-select"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">Seleccionar usuario...</option>
              {filteredUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {(u.fullName || 'Sin nombre')} - {u.email} ({u.role.name})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {loadingUsers
                ? 'Cargando usuarios...'
                : `${filteredUsers.length} usuarios disponibles`}
            </p>
          </div>

          {selectedUser && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40 px-3 py-2">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {selectedUser.fullName || 'Sin nombre'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-300">{selectedUser.email}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                  Rol global: {selectedUser.role.name}
                </span>
              </div>
            </div>
          )}

          <details className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <summary className="cursor-pointer text-sm text-gray-700 dark:text-gray-300">
              No encuentro al usuario en la lista
            </summary>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Crea primero el usuario en Configuracion &gt; Usuarios y luego regresa para asignarlo al yate.
            </p>
          </details>

          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Rol para este yate
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as RoleName)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              disabled={isLoading}
            >
              {translate('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? translate('crew.adding') : translate('crew.addUser')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

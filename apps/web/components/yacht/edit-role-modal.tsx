'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { CrewMember } from '@/lib/crew';
import { translate } from '@/lib/i18n';

type RoleName = 'Captain' | 'Chief Engineer' | 'HoD' | 'Crew Member' | 'Admin' | 'Management/Office' | 'SystemAdmin';

interface EditRoleModalProps {
  yachtId: string;
  member: CrewMember;
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

export function EditRoleModal({ yachtId, member, onClose, onSuccess }: EditRoleModalProps) {
  const [role, setRole] = useState<RoleName>((member.roleNameOverride as RoleName) || 'Crew Member');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await api.patch(`/yachts/${yachtId}/access/${member.userId}`, {
        roleNameOverride: role,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('errors.updateRoleFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="h-screen w-screen overflow-y-auto bg-white shadow-xl dark:bg-gray-800 sm:mx-4 sm:h-auto sm:w-full sm:max-w-md sm:max-h-[90vh] sm:rounded-xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {translate('crew.editRole')}
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

          <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
            <p className="text-sm text-gray-500 dark:text-gray-400">{translate('crew.user')}</p>
            <p className="font-medium text-gray-900 dark:text-white">{member.user.email}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {translate('crew.roleOverride')}
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as RoleName)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            >
              <option value="">{translate('crew.noOverrideNote')}</option>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              ℹ️ El cambio de rol override aplicará en el próximo inicio de sesión del usuario.
            </p>
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
              {isLoading ? translate('crew.saving') : translate('crew.saveChanges')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

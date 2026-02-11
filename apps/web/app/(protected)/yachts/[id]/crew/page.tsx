'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useYacht } from '@/lib/yacht-context';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type { CrewMember } from '@/lib/crew';
import { AddUserModal } from '@/components/yacht/add-user-modal';
import { EditRoleModal } from '@/components/yacht/edit-role-modal';
import { translate } from '@/lib/i18n';

export default function CrewPage() {
  const params = useParams();
  const yachtId = params.id as string;
  const { currentYacht, loadYachts } = useYacht();
  const { user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<CrewMember | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  // Permissions
  const canEdit = user && ['Admin', 'Management/Office', 'SystemAdmin'].includes(user.role);
  const canAdd = !!canEdit;

  useEffect(() => {
    const loadData = async () => {
      if (!currentYacht) {
        await loadYachts();
      }
      setIsLoading(false);
    };
    loadData();
  }, [currentYacht, loadYachts]);

  const fetchCrew = async () => {
    try {
      const data = await api.get<CrewMember[]>(`/yachts/${yachtId}/access`);
      setCrew(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('crew.loadFailed'));
    }
  };

  useEffect(() => {
    if (currentYacht) {
      fetchCrew();
    }
  }, [currentYacht, yachtId]);

  const handleAddSuccess = () => {
    setShowAddModal(false);
    fetchCrew();
  };

  const handleEditSuccess = () => {
    setEditingMember(null);
    fetchCrew();
  };

  const handleRemoveAccess = async (userId: string) => {
    if (!confirm('Quitar acceso de este usuario al yate?')) return;
    setRemovingUserId(userId);
    setError(null);
    try {
      await api.delete(`/yachts/${yachtId}/access/${userId}`);
      await fetchCrew();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar el acceso');
    } finally {
      setRemovingUserId(null);
    }
  };

  if (isLoading || !currentYacht) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">{translate('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {currentYacht.name} - Gestion de tripulacion
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Usuarios con acceso a este yate
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {translate('crew.addUser')}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">
          {error}
        </div>
      )}

      {crew.length === 0 ? (
        <EmptyState onAddClick={() => canEdit && setShowAddModal(true)} canAdd={!!canAdd} />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Email
                </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Rol en este yate
                  </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                {canEdit && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {crew.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {member.user.fullName || translate('common.noResults')}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {member.user.email}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      member.roleNameOverride 
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    }`}>
                      {member.roleNameOverride || 'Rol global'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        member.user.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {member.user.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => setEditingMember(member)}
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
                      >
                        Editar rol
                      </button>
                      <button
                        onClick={() => handleRemoveAccess(member.userId)}
                        disabled={removingUserId === member.userId}
                        className="ml-4 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium disabled:opacity-50"
                      >
                        {removingUserId === member.userId ? 'Quitando...' : 'Quitar acceso'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddUserModal
          yachtId={yachtId}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
        />
      )}

      {editingMember && (
        <EditRoleModal
          yachtId={yachtId}
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}

function EmptyState({ onAddClick, canAdd }: { onAddClick: () => void; canAdd: boolean }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-12">
      <div className="text-center">
        <div className="mx-auto h-16 w-16 text-gray-400 mb-4">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No hay miembros en el crew aún
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
          Asigna usuarios a este yacht para comenzar a gestionar tu equipo.
        </p>
        {canAdd && (
          <button
            onClick={onAddClick}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Agregar Usuario
          </button>
        )}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useYacht } from '@/lib/yacht-context';
import { useAuth } from '@/lib/auth-context';
import { AddEngineModal, type Engine } from '@/components/engines/add-engine-modal';
import { EditEngineModal } from '@/components/engines/edit-engine-modal';
import { formatStatus, getStatusColor } from '@/components/engines/add-engine-modal';
import { api } from '@/lib/api';
import { translate } from '@/lib/i18n';

const CAN_EDIT_ROLES = [
  'Captain',
  'Chief Engineer',
  'Engineer',
  'Admin',
  'SystemAdmin',
];

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-20 h-20 mb-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <svg
          className="w-10 h-10 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
        {translate('engines.noEnginesYet')}
      </h3>
      <p className="text-gray-500 dark:text-gray-400 text-center mb-6 max-w-sm">
        {translate('engines.addFirst')}
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
      >
        <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        {translate('engines.addEngine')}
      </button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">{translate('common.loading')}</p>
      </div>
    </div>
  );
}

function EngineRow({ 
  engine, 
  canEdit,
  onEdit,
  onDelete 
}: { 
  engine: Engine;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirm(translate('engines.deleteConfirm'))) {
      setIsDeleting(true);
      try {
        await api.request<void>('DELETE', `/engines/${engine.id}`);
        onDelete();
      } catch (err) {
        console.error(translate('errors.deleteEngineFailed'), err);
        alert(err instanceof Error ? err.message : translate('errors.deleteEngineFailed'));
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const status = engine.healthStatus || 'Check';

  return (
    <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
        {engine.name}
      </td>
      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
        {engine.type}
      </td>
      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono text-sm">
        {engine.serialNo}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status).color}`}>
          {formatStatus(status)}
        </span>
      </td>
      {canEdit && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
              title={translate('common.edit')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
              title={translate('common.delete')}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

export default function EnginesPage() {
  const params = useParams();
  const yachtId = params.id as string;
  const { currentYacht, loadYachts } = useYacht();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [engines, setEngines] = useState<Engine[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEngine, setEditingEngine] = useState<Engine | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canEdit = user ? CAN_EDIT_ROLES.includes(user.role) : false;

  const loadEngines = async () => {
    try {
      const data = await api.get<Engine[]>(`/engines?yachtId=${yachtId}`);
      setEngines(data);
    } catch (err) {
      console.error(translate('errors.loadEnginesFailed'), err);
      setError(err instanceof Error ? err.message : translate('errors.loadEnginesFailed'));
    }
  };

  useEffect(() => {
    const init = async () => {
      if (!currentYacht) {
        await loadYachts();
      }
      setIsLoading(false);
    };
    init();
  }, [currentYacht, loadYachts]);

  useEffect(() => {
    if (currentYacht && !isLoading) {
      loadEngines();
    }
  }, [currentYacht, isLoading, yachtId]);

  if (isLoading || !currentYacht) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {currentYacht.name} - {translate('engines.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {translate('engines.engineManagement')}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {translate('engines.addEngine')}
          </button>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Content */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {engines.length === 0 ? (
          <EmptyState onAdd={() => setShowAddModal(true)} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {translate('engines.name')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {translate('engines.type')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {translate('engines.serialNumber')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {translate('yacht.status')}
                  </th>
                  {canEdit && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {translate('common.actions')}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {engines.map((engine) => (
                  <EngineRow
                    key={engine.id}
                    engine={engine}
                    canEdit={canEdit}
                    onEdit={() => setEditingEngine(engine)}
                    onDelete={() => {
                      loadEngines();
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Engine Modal */}
      {showAddModal && (
        <AddEngineModal
          yachtId={yachtId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadEngines();
          }}
        />
      )}

      {editingEngine && (
        <EditEngineModal
          engine={editingEngine}
          onClose={() => setEditingEngine(null)}
          onSuccess={() => {
            setEditingEngine(null);
            loadEngines();
          }}
        />
      )}
    </div>
  );
}

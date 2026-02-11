'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { translate } from '@/lib/i18n';

export type EngineType = 'Diesel' | 'Hydraulic' | 'Gas' | 'Electric';

export interface Engine {
  id: string;
  name: string;
  type: string;
  serialNo: string;
  yachtId: string;
  healthStatus?: 'OK' | 'Check' | 'Maintenance';
  lastReadingAt?: string | null;
  createdAt?: string;
}

interface AddEngineModalProps {
  yachtId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const ENGINE_TYPES: { value: EngineType; label: string }[] = [
  { value: 'Diesel', label: translate('engines.typeDiesel') },
  { value: 'Hydraulic', label: translate('engines.typeHydraulic') },
  { value: 'Gas', label: translate('engines.typeGas') },
  { value: 'Electric', label: translate('engines.typeElectric') },
];

const ENGINE_STATUS = {
  OK: { label: translate('engines.statusOk'), color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  Check: { label: translate('engines.statusCheck'), color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  Maintenance: { label: translate('engines.statusMaintenance'), color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
};

export function AddEngineModal({ yachtId, onClose, onSuccess }: AddEngineModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<EngineType>('Diesel');
  const [serialNo, setSerialNo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await api.post(`/engines`, {
        yachtId,
        name,
        type,
        serialNo,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('engines.createFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="h-screen w-screen overflow-y-auto bg-white shadow-xl dark:bg-gray-800 sm:mx-4 sm:h-auto sm:w-full sm:max-w-md sm:max-h-[90vh] sm:rounded-xl">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {translate('engines.addEngine')}
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
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {translate('engines.engineName')}
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Main Engine, Bow Thruster..."
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {translate('engines.type')}
            </label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as EngineType)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            >
              {ENGINE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="serialNo" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {translate('engines.serialNumber')}
            </label>
            <input
              type="text"
              id="serialNo"
              value={serialNo}
              onChange={(e) => setSerialNo(e.target.value)}
              placeholder="Ej: ME-2024-001"
              required
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
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
              {isLoading ? translate('engines.addingEngine') : translate('engines.addingMotor')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function getStatusColor(status: string) {
  return ENGINE_STATUS[status as keyof typeof ENGINE_STATUS] || ENGINE_STATUS.Check;
}

export function formatStatus(status: string) {
  return ENGINE_STATUS[status as keyof typeof ENGINE_STATUS]?.label || translate('engines.statusCheck');
}

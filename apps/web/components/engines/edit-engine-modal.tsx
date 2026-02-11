'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { translate } from '@/lib/i18n';
import type { Engine, EngineType } from './add-engine-modal';

interface EditEngineModalProps {
  engine: Engine;
  onClose: () => void;
  onSuccess: () => void;
}

const ENGINE_TYPES: { value: EngineType; label: string }[] = [
  { value: 'Diesel', label: translate('engines.typeDiesel') },
  { value: 'Hydraulic', label: translate('engines.typeHydraulic') },
  { value: 'Gas', label: translate('engines.typeGas') },
  { value: 'Electric', label: translate('engines.typeElectric') },
];

export function EditEngineModal({ engine, onClose, onSuccess }: EditEngineModalProps) {
  const [name, setName] = useState(engine.name);
  const [type, setType] = useState<EngineType>((engine.type as EngineType) || 'Diesel');
  const [serialNo, setSerialNo] = useState(engine.serialNo);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await api.patch(`/engines/${engine.id}`, {
        name,
        type,
        serialNo,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('errors.failedToSave'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="h-screen w-screen overflow-y-auto bg-white shadow-xl dark:bg-gray-800 sm:mx-4 sm:h-auto sm:w-full sm:max-w-md sm:max-h-[90vh] sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {translate('common.edit')} {translate('engines.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="edit-name" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {translate('engines.engineName')}
            </label>
            <input
              id="edit-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="edit-type" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {translate('engines.type')}
            </label>
            <select
              id="edit-type"
              value={type}
              onChange={(event) => setType(event.target.value as EngineType)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            >
              {ENGINE_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="edit-serial" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {translate('engines.serialNumber')}
            </label>
            <input
              id="edit-serial"
              type="text"
              value={serialNo}
              onChange={(event) => setSerialNo(event.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg px-4 py-2 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 sm:w-auto"
              disabled={isLoading}
            >
              {translate('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
            >
              {isLoading ? translate('common.loading') : translate('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

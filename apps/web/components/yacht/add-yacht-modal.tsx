'use client';

import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { FLAG_OPTIONS, formatFlagLabel, normalizeFlagCode } from '@/lib/flags';
import { translate } from '@/lib/i18n';

interface AddYachtModalProps {
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

interface CreateYachtRequest {
  name: string;
  flag: string;
  isActive: boolean;
  imoOptional?: string;
}

export function AddYachtModal({ onClose, onSuccess }: AddYachtModalProps) {
  const [name, setName] = useState('');
  const [flag, setFlag] = useState('EC');
  const [imoOptional, setImoOptional] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedFlagPreview = useMemo(() => formatFlagLabel(flag), [flag]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const payload: CreateYachtRequest = {
        name: name.trim(),
        flag: normalizeFlagCode(flag),
        isActive,
        ...(imoOptional.trim() ? { imoOptional: imoOptional.trim() } : {}),
      };

      await api.post('/yachts', payload);
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el yate');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="h-screen w-screen overflow-y-auto border-border bg-surface shadow-2xl sm:h-auto sm:w-full sm:max-w-md sm:rounded-xl sm:border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold text-text-primary">{translate('yacht.addYacht')}</h2>
          <button
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            type="button"
          >
            x
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          {error && (
            <div className="rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">Nombre del yate</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={120}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary outline-none ring-0 focus:border-gold"
              placeholder="Ocean Spirit"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">Bandera</label>
            <select
              value={flag}
              onChange={(event) => setFlag(event.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary outline-none ring-0 focus:border-gold"
            >
              {FLAG_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {formatFlagLabel(option.code)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">IMO (opcional)</label>
            <input
              value={imoOptional}
              onChange={(event) => setImoOptional(event.target.value)}
              maxLength={30}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary outline-none ring-0 focus:border-gold"
              placeholder="IMO1234567"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-primary">Estado inicial</label>
            <select
              value={isActive ? 'active' : 'inactive'}
              onChange={(event) => setIsActive(event.target.value === 'active')}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text-primary outline-none ring-0 focus:border-gold"
            >
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </select>
          </div>

          <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-text-secondary">
            Vista previa: <span className="font-medium text-text-primary">{selectedFlagPreview}</span>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="w-full rounded-lg border border-border px-4 py-2 text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50 sm:w-auto"
            >
              {translate('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-gold px-4 py-2 text-sm font-medium text-black hover:bg-gold-hover disabled:opacity-50 sm:w-auto"
            >
              {isLoading ? 'Creando...' : 'Crear yate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

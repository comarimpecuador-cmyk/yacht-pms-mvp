import { listInventoryItems } from '../repositories/inventoryRepository';
import { InventoryItemsResult } from '../types/inventory';
import { useApiQuery } from './useApiQuery';

export function useInventoryItems(yachtId?: string) {
  return useApiQuery<InventoryItemsResult>(
    ['inventory', 'items', yachtId],
    async () => {
      if (!yachtId) {
        throw new Error('yachtId es requerido para inventory');
      }

      return listInventoryItems(yachtId);
    },
    {
      enabled: Boolean(yachtId),
      staleTime: 30_000,
    },
  );
}


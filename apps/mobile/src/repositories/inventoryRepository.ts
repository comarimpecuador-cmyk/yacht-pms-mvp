import { AxiosError } from 'axios';
import { getDb } from '../db/sqlite';
import { httpGet } from '../services/http/httpClient';
import { InventoryItem, InventoryItemsApiResponse, InventoryItemsResult } from '../types/inventory';

type InventoryCacheRow = {
  id: string;
  yacht_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  category: string;
  unit: string;
  location: string | null;
  min_stock: number;
  current_stock: number;
  engine_id: string | null;
  engine_name: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  fetched_at: string;
};

function normalizeRemoteItem(item: InventoryItemsApiResponse['items'][number], fetchedAt: string): InventoryItem {
  return {
    id: item.id,
    yachtId: item.yachtId,
    sku: item.sku,
    name: item.name,
    description: item.description,
    category: item.category,
    unit: item.unit,
    location: item.location,
    minStock: Number(item.minStock ?? 0),
    currentStock: Number(item.currentStock ?? 0),
    engineId: item.engineId ?? null,
    engine: item.engine
      ? {
          id: item.engine.id,
          name: item.engine.name,
        }
      : null,
    isActive: Boolean(item.isActive),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    fetchedAt,
  };
}

function mapCacheRow(row: InventoryCacheRow): InventoryItem {
  return {
    id: row.id,
    yachtId: row.yacht_id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    category: row.category,
    unit: row.unit,
    location: row.location,
    minStock: Number(row.min_stock ?? 0),
    currentStock: Number(row.current_stock ?? 0),
    engineId: row.engine_id,
    engine: row.engine_id
      ? {
          id: row.engine_id,
          name: row.engine_name || 'Engine',
        }
      : null,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fetchedAt: row.fetched_at,
  };
}

function cacheInventoryItems(yachtId: string, items: InventoryItem[]) {
  const db = getDb();
  db.runSync('DELETE FROM inventory_items_cache WHERE yacht_id = ?', [yachtId]);

  for (const item of items) {
    db.runSync(
      `INSERT INTO inventory_items_cache (
        id, yacht_id, sku, name, description, category, unit, location, min_stock, current_stock,
        engine_id, engine_name, is_active, created_at, updated_at, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.yachtId,
        item.sku,
        item.name,
        item.description,
        item.category,
        item.unit,
        item.location,
        item.minStock,
        item.currentStock,
        item.engineId,
        item.engine?.name || null,
        item.isActive ? 1 : 0,
        item.createdAt,
        item.updatedAt,
        item.fetchedAt,
      ],
    );
  }
}

function getCachedInventoryItems(yachtId: string): InventoryItem[] {
  const db = getDb();
  const rows = db.getAllSync<InventoryCacheRow>(
    `SELECT
      id, yacht_id, sku, name, description, category, unit, location, min_stock, current_stock,
      engine_id, engine_name, is_active, created_at, updated_at, fetched_at
    FROM inventory_items_cache
    WHERE yacht_id = ?
    ORDER BY updated_at DESC, name ASC`,
    [yachtId],
  );

  return rows.map(mapCacheRow);
}

function isRecoverableRemoteError(error: unknown) {
  const axiosError = error as AxiosError | undefined;
  if (!axiosError?.isAxiosError) return false;

  const status = axiosError.response?.status;
  if (!status) return true;

  return status >= 500;
}

export async function listInventoryItems(yachtId: string): Promise<InventoryItemsResult> {
  const endpoint = `/yachts/${encodeURIComponent(yachtId)}/inventory/items`;

  try {
    const remote = await httpGet<InventoryItemsApiResponse>(endpoint);
    const fetchedAt = new Date().toISOString();
    const remoteItems = remote.items.map((item) => normalizeRemoteItem(item, fetchedAt));
    cacheInventoryItems(yachtId, remoteItems);

    return {
      items: remoteItems,
      page: remote.page,
      pageSize: remote.pageSize,
      total: remote.total,
      totalPages: remote.totalPages,
      source: 'remote',
    };
  } catch (error) {
    const cachedItems = getCachedInventoryItems(yachtId);
    if (cachedItems.length > 0 && isRecoverableRemoteError(error)) {
      return {
        items: cachedItems,
        page: 1,
        pageSize: cachedItems.length,
        total: cachedItems.length,
        totalPages: 1,
        source: 'cache',
      };
    }

    throw error;
  }
}

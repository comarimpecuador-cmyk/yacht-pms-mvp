export type InventoryCategory =
  | 'engineering'
  | 'deck'
  | 'safety'
  | 'housekeeping'
  | 'galley'
  | 'admin'
  | 'other';

export interface InventoryEngineRef {
  id: string;
  name: string;
}

export interface InventoryItem {
  id: string;
  yachtId: string;
  sku: string | null;
  name: string;
  description: string | null;
  category: InventoryCategory | string;
  unit: string;
  location: string | null;
  minStock: number;
  currentStock: number;
  engineId: string | null;
  engine: InventoryEngineRef | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  fetchedAt: string;
}

export interface InventoryItemsApiResponse {
  items: Array<{
    id: string;
    yachtId: string;
    sku: string | null;
    name: string;
    description: string | null;
    category: InventoryCategory | string;
    unit: string;
    location: string | null;
    minStock: number;
    currentStock: number;
    engineId: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    engine?: InventoryEngineRef | null;
  }>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface InventoryItemsResult {
  items: InventoryItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  source: 'remote' | 'cache';
}


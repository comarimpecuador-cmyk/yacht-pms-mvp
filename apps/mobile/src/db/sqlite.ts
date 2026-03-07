import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabaseSync('yacht_pms.db');

export function initDb() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS pending_ops (
      id TEXT PRIMARY KEY NOT NULL,
      module TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_items_cache (
      id TEXT PRIMARY KEY NOT NULL,
      yacht_id TEXT NOT NULL,
      sku TEXT,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      unit TEXT NOT NULL,
      location TEXT,
      min_stock REAL NOT NULL,
      current_stock REAL NOT NULL,
      engine_id TEXT,
      engine_name TEXT,
      is_active INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_items_cache_yacht
      ON inventory_items_cache (yacht_id);
  `);
}

export function getDb() {
  return db;
}

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
  `);
}

export function getDb() {
  return db;
}

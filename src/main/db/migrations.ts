/**
 * Portia DB — Migration runner.
 *
 * Uses PRAGMA user_version to track which migrations have been applied.
 * Migrations are append-only — never edit an existing migration.
 */

import { getDb, exec, scheduleSave } from './connection'

// ── Migration registry (append-only!) ────────────────────────────────────

const MIGRATIONS: string[] = [
  // Migration 0 → 1: Initial schema
  `
  CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS team (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT, floor TEXT,
    phone TEXT, email TEXT, status TEXT DEFAULT 'available', initials TEXT
  );
  CREATE TABLE IF NOT EXISTS access_codes (
    id TEXT PRIMARY KEY, code TEXT NOT NULL, visitor_name TEXT NOT NULL,
    assigned_to TEXT, created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT, active INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT, visitor_name TEXT, company TEXT,
    host_id TEXT, access_code_used TEXT, date TEXT DEFAULT (datetime('now')),
    duration INTEGER DEFAULT 0, outcome TEXT DEFAULT 'pending',
    call_id TEXT, summary TEXT
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
    date TEXT DEFAULT (datetime('now')), source TEXT, details TEXT, visit_id TEXT
  );
  CREATE TABLE IF NOT EXISTS escalations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, visit_id TEXT,
    reason TEXT NOT NULL, urgency TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'pending', date TEXT DEFAULT (datetime('now')),
    assigned_to TEXT, resolved_date TEXT
  );
  `,
]

// ── Runner ───────────────────────────────────────────────────────────────

export function runMigrations(): void {
  const db = getDb()
  const result = db.exec('PRAGMA user_version')
  const currentVersion = (result[0]?.values[0]?.[0] as number) || 0

  for (let i = currentVersion; i < MIGRATIONS.length; i++) {
    console.log(`[db] Running migration ${i + 1}/${MIGRATIONS.length}`)
    exec(MIGRATIONS[i])
  }

  if (MIGRATIONS.length > currentVersion) {
    db.run(`PRAGMA user_version = ${MIGRATIONS.length}`)
    scheduleSave()
    console.log(`[db] Migrations complete — version ${MIGRATIONS.length}`)
  }
}

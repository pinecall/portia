/**
 * Portia DB — Connection manager with debounced persistence.
 *
 * sql.js requires exporting the entire DB to a buffer and writing to disk.
 * Instead of doing this on every write, we debounce saves to 250ms and
 * provide a synchronous flush() for before-quit.
 */

import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DB_SAVE_DEBOUNCE_MS } from '@main/constants'
import { createLogger } from '@main/logger'

const log = createLogger('db')

let db: SqlJsDatabase | null = null
let dbPath: string = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null

/** Initialize the database connection. */
export async function initDb(path: string): Promise<SqlJsDatabase> {
  dbPath = path
  const SQL = await initSqlJs()
  mkdirSync(dirname(path), { recursive: true })

  if (existsSync(path)) {
    const buffer = readFileSync(path)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  return db
}

/** Initialize an in-memory database for testing. No disk I/O. */
export async function initDbInMemory(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs()
  db = new SQL.Database()
  dbPath = ':memory:'
  return db
}

/** Get the active database instance. Throws if not initialized. */
export function getDb(): SqlJsDatabase {
  if (!db) throw new Error('[db] Not initialized — call initDb() first')
  return db
}

/**
 * Schedule a save to disk (250ms debounce).
 * Multiple writes within 250ms are batched into a single disk write.
 */
export function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    flushSync()
  }, DB_SAVE_DEBOUNCE_MS)
}

/**
 * Synchronous flush — writes DB to disk immediately.
 * Call this on before-quit to ensure no data loss.
 */
export function flushSync(): void {
  if (!db) return
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  try {
    const data = db.export()
    writeFileSync(dbPath, Buffer.from(data))
  } catch (err) {
    log.error('Flush failed:', err)
  }
}

/** Close the database. */
export function closeDb(): void {
  flushSync()
  if (db) {
    db.close()
    db = null
  }
}

// ── Query helpers ────────────────────────────────────────────────────────

/** Run a SELECT and return all rows as typed objects. */
export function queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const results = getDb().exec(sql, params as any[])
  if (results.length === 0) return []
  const { columns, values } = results[0]!
  return values.map((row) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col, i) => (obj[col] = row[i]))
    return obj as T
  })
}

/** Run a SELECT and return the first row, or null. */
export function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
  const rows = queryAll<T>(sql, params)
  return rows[0] ?? null
}

/** Run a write statement (INSERT, UPDATE, DELETE) and schedule a save. */
export function run(sql: string, params: unknown[] = []): void {
  getDb().run(sql, params as any[])
  scheduleSave()
}

/** Run multiple statements (e.g. migrations). No auto-save — call scheduleSave() after. */
export function exec(sql: string): void {
  getDb().run(sql)
}

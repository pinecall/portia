/**
 * Tests for DB migrations — verifies all tables are created correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { initDbInMemory, getDb } from '@main/db/connection'
import { runMigrations } from '@main/db/migrations'

beforeEach(async () => {
  await initDbInMemory()
})

describe('migrations', () => {
  it('creates all expected tables from zero', () => {
    runMigrations()
    const db = getDb()
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    const tables = result[0]!.values.map(r => r[0] as string)
    expect(tables).toContain('config')
    expect(tables).toContain('team')
    expect(tables).toContain('access_codes')
    expect(tables).toContain('visits')
    expect(tables).toContain('events')
    expect(tables).toContain('escalations')
  })

  it('sets user_version to migration count', () => {
    runMigrations()
    const db = getDb()
    const result = db.exec('PRAGMA user_version')
    const version = result[0]!.values[0]![0] as number
    expect(version).toBeGreaterThan(0)
  })

  it('is idempotent — running twice does nothing extra', () => {
    runMigrations()
    const db = getDb()
    const v1 = (db.exec('PRAGMA user_version')[0]!.values[0]![0] as number)
    runMigrations()
    const v2 = (db.exec('PRAGMA user_version')[0]!.values[0]![0] as number)
    expect(v1).toBe(v2)
  })
})

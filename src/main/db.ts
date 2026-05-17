/**
 * Portia — SQLite database (local-first, via sql.js / WASM)
 *
 * Uses sql.js (pure WASM, no native dependencies) instead of better-sqlite3.
 * Data is persisted to disk after each write via auto-save.
 */

import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'

export interface AppConfig {
  zenitelHost: string
  zenitelUser: string
  zenitelPassword: string
  zenitelHasCamera: boolean
  pinecallApiKey: string
  agentPhone: string
  buildingName: string
  language: string
  wizardCompleted: boolean
  theme: string
}

const CONFIG_DEFAULTS: AppConfig = {
  zenitelHost: '',
  zenitelUser: 'admin',
  zenitelPassword: 'alphaadmin',
  zenitelHasCamera: false,
  pinecallApiKey: '',
  agentPhone: '',
  buildingName: '',
  language: 'es',
  wizardCompleted: false,
  theme: 'dark',
}

export class PortiaDB {
  private db!: SqlJsDatabase
  private dbPath: string

  private constructor(dbPath: string) {
    this.dbPath = dbPath
  }

  static async create(dbPath: string): Promise<PortiaDB> {
    const instance = new PortiaDB(dbPath)
    const SQL = await initSqlJs()

    // Ensure directory exists
    mkdirSync(dirname(dbPath), { recursive: true })

    if (existsSync(dbPath)) {
      const buffer = readFileSync(dbPath)
      instance.db = new SQL.Database(buffer)
    } else {
      instance.db = new SQL.Database()
    }

    instance._migrate()
    instance._save()
    return instance
  }

  private _save() {
    const data = this.db.export()
    writeFileSync(this.dbPath, Buffer.from(data))
  }

  private _migrate() {
    this.db.run(`
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
    `)

    const [{ values }] = this.db.exec('SELECT COUNT(*) FROM config')
    if ((values[0][0] as number) === 0) {
      const stmt = this.db.prepare('INSERT INTO config (key, value) VALUES (?, ?)')
      for (const [k, v] of Object.entries(CONFIG_DEFAULTS)) {
        stmt.run([k, JSON.stringify(v)])
      }
      stmt.free()
    }
  }

  // ── Config ──────────────────────────────────────────────────────────────

  getConfig(): AppConfig {
    const config = { ...CONFIG_DEFAULTS }
    const results = this.db.exec('SELECT key, value FROM config')
    if (results.length > 0) {
      for (const row of results[0].values) {
        try { (config as any)[row[0] as string] = JSON.parse(row[1] as string) } catch {}
      }
    }
    return config
  }

  updateConfig(updates: Partial<AppConfig>): AppConfig {
    const stmt = this.db.prepare(
      'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    for (const [k, v] of Object.entries(updates)) {
      stmt.run([k, JSON.stringify(v)])
    }
    stmt.free()
    this._save()
    return this.getConfig()
  }

  // ── Team ────────────────────────────────────────────────────────────────

  getTeam() {
    return this._all('SELECT * FROM team')
  }

  getTeamMember(id: string) {
    return this._get('SELECT * FROM team WHERE id = ?', [id])
  }

  updateTeamMember(id: string, updates: Record<string, any>) {
    const allowed = ['status', 'phone', 'email', 'role', 'floor', 'name', 'initials']
    const pairs = Object.entries(updates).filter(([k]) => allowed.includes(k))
    if (pairs.length === 0) return null
    const sets = pairs.map(([k]) => `${k} = ?`).join(', ')
    const vals = [...pairs.map(([, v]) => v), id]
    this.db.run(`UPDATE team SET ${sets} WHERE id = ?`, vals)
    this._save()
    return true
  }

  addTeamMember(member: { id: string; name: string; role?: string; floor?: string; phone?: string; email?: string; status?: string; initials?: string }) {
    this.db.run(
      'INSERT OR REPLACE INTO team (id, name, role, floor, phone, email, status, initials) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [member.id, member.name, member.role || null, member.floor || null, member.phone || null, member.email || null, member.status || 'available', member.initials || member.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()]
    )
    this._save()
    return member
  }

  deleteTeamMember(id: string) {
    this.db.run('DELETE FROM team WHERE id = ?', [id])
    this._save()
    return true
  }

  /** Wipe all data (for seed/reset). Config is preserved. */
  clearAll() {
    this.db.run('DELETE FROM team')
    this.db.run('DELETE FROM access_codes')
    this.db.run('DELETE FROM visits')
    this.db.run('DELETE FROM events')
    this.db.run('DELETE FROM escalations')
    this._save()
  }

  getTeamSummary(): string {
    const team = this.getTeam()
    if (team.length === 0) return 'TEAM DIRECTORY\nNo team members configured.'
    const lines = team.map((m: any) =>
      `- ${m.name} (${m.id}): ${m.role || 'Team'}, Floor ${m.floor || '—'}, Status: ${m.status || 'available'}`
    )
    return `TEAM DIRECTORY\n${lines.join('\n')}`
  }

  getAccessCodesSummary(): string {
    const codes = this.getAccessCodes()
    if (codes.length === 0) return 'ACCESS CODES\nNo active access codes.'
    const lines = codes.map((c: any) =>
      `- Code ${c.code}: ${c.visitor_name} (assigned to ${c.assigned_to || '—'})`
    )
    return `ACCESS CODES\n${lines.join('\n')}`
  }

  lookupVisitor(params: { name?: string; company?: string }) {
    if (params.name) {
      return this._all('SELECT * FROM visits WHERE visitor_name LIKE ? ORDER BY date DESC LIMIT 10', [`%${params.name}%`])
    }
    if (params.company) {
      return this._all('SELECT * FROM visits WHERE company LIKE ? ORDER BY date DESC LIMIT 10', [`%${params.company}%`])
    }
    return []
  }

  // ── Access Codes ────────────────────────────────────────────────────────

  getAccessCodes() { return this._all('SELECT * FROM access_codes WHERE active = 1') }
  getAllAccessCodes() { return this._all('SELECT * FROM access_codes') }

  /** Fuzzy-search team members by name (case-insensitive partial match). */
  findTeamByName(name: string): any[] {
    return this._all('SELECT * FROM team WHERE LOWER(name) LIKE LOWER(?)', [`%${name}%`])
  }

  /** Find active access codes assigned to a visitor name (fuzzy). */
  findCodesByVisitor(visitorName: string): any[] {
    return this._all(
      'SELECT * FROM access_codes WHERE active = 1 AND LOWER(visitor_name) LIKE LOWER(?)',
      [`%${visitorName}%`],
    )
  }

  validateCode(code: string) {
    const normalized = code.replace(/\D/g, '').trim()
    const entry = this._get('SELECT * FROM access_codes WHERE code = ? AND active = 1', [normalized])
    if (!entry) return { valid: false }
    if (entry.expires_at && new Date(entry.expires_at) < new Date()) return { valid: false }
    return { valid: true, visitor: entry.visitor_name, assignedTo: entry.assigned_to, codeId: entry.id }
  }

  createAccessCode(params: { code: string; visitorName: string; assignedTo: string; expiresAt?: string }) {
    const id = 'AC' + randomBytes(4).toString('hex')
    this.db.run(
      'INSERT INTO access_codes (id, code, visitor_name, assigned_to, expires_at) VALUES (?, ?, ?, ?, ?)',
      [id, params.code, params.visitorName, params.assignedTo, params.expiresAt || null]
    )
    this._save()
    return { id, ...params }
  }

  deleteAccessCode(id: string) {
    this.db.run('UPDATE access_codes SET active = 0 WHERE id = ?', [id])
    this._save()
    return true
  }

  // ── Visits ──────────────────────────────────────────────────────────────

  getVisits(limit = 50) {
    return this._all('SELECT * FROM visits ORDER BY date DESC LIMIT ?', [limit])
  }

  addVisit(visit: Record<string, any>) {
    this.db.run(
      `INSERT INTO visits (visitor_name, company, host_id, access_code_used, duration, outcome, call_id, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [visit.visitor_name, visit.company, visit.host_id, visit.access_code_used,
       visit.duration || 0, visit.outcome || 'pending', visit.call_id, visit.summary]
    )
    this._save()
    return visit
  }

  // ── Events ──────────────────────────────────────────────────────────────

  getEvents(limit = 100) {
    return this._all('SELECT * FROM events ORDER BY date DESC LIMIT ?', [limit])
  }

  addEvent(event: Record<string, any>) {
    this.db.run(
      'INSERT INTO events (type, source, details, visit_id) VALUES (?, ?, ?, ?)',
      [event.type || null, event.source || null, event.details || null, event.visit_id ?? event.visitId ?? null]
    )
    this._save()
    return event
  }

  // ── Escalations ─────────────────────────────────────────────────────────

  getEscalations() { return this._all('SELECT * FROM escalations') }

  addEscalation(params: { reason: string; urgency: string; visitId?: string }) {
    this.db.run(
      'INSERT INTO escalations (visit_id, reason, urgency, assigned_to) VALUES (?, ?, ?, ?)',
      [params.visitId || null, params.reason, params.urgency, 'Recepción']
    )
    this._save()
    return params
  }

  resolveEscalation(id: number) {
    this.db.run(
      "UPDATE escalations SET status = 'resolved', resolved_date = datetime('now') WHERE id = ?", [id]
    )
    this._save()
  }

  // ── Stats ───────────────────────────────────────────────────────────────

  getDashboardStats() {
    const today = new Date().toISOString().split('T')[0]
    const todayVisits = this._all('SELECT * FROM visits WHERE date LIKE ?', [`${today}%`])
    const granted = todayVisits.filter((v: any) => v.outcome === 'granted')
    const denied = todayVisits.filter((v: any) => v.outcome === 'denied')
    const totalDuration = todayVisits.reduce((s: number, v: any) => s + (v.duration || 0), 0)
    const pending = this._get("SELECT COUNT(*) as n FROM escalations WHERE status = 'pending'")

    return {
      visitsToday: todayVisits.length,
      granted: granted.length,
      denied: denied.length,
      avgDuration: todayVisits.length > 0 ? Math.round(totalDuration / todayVisits.length) : 0,
      resolution: todayVisits.length > 0 ? Math.round((granted.length / todayVisits.length) * 100) : 100,
      pendingEscalations: pending?.n || 0,
      totalVisits: (this._get('SELECT COUNT(*) as n FROM visits'))?.n || 0,
      activeTeam: (this._get("SELECT COUNT(*) as n FROM team WHERE status = 'available'"))?.n || 0,
      totalTeam: (this._get('SELECT COUNT(*) as n FROM team'))?.n || 0,
    }
  }

  // ── Utility ─────────────────────────────────────────────────────────────

  /** Generate a random SIP number for this Portia install: portia-XXXX */
  static generateSipId(): string {
    return 'portia-' + randomBytes(2).toString('hex')
  }

  close() { this.db.close() }

  // ── Internal helpers ────────────────────────────────────────────────────

  private _all(sql: string, params: any[] = []): any[] {
    const results = this.db.exec(sql, params)
    if (results.length === 0) return []
    const { columns, values } = results[0]
    return values.map((row) => {
      const obj: any = {}
      columns.forEach((col, i) => (obj[col] = row[i]))
      return obj
    })
  }

  private _get(sql: string, params: any[] = []): any {
    const rows = this._all(sql, params)
    return rows[0] || null
  }
}

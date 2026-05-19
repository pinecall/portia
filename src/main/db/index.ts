/**
 * Portia DB — Public facade.
 *
 * Delegates to individual repos. Maintains the same API as the old
 * monolithic PortiaDB class so callers don't need to change yet.
 */

import { initDb, closeDb, flushSync, run } from './connection'
import { runMigrations } from './migrations'
import { randomBytes } from 'node:crypto'

// Repos
import * as configRepo from './repos/config.repo'
import * as teamRepo from './repos/team.repo'
import * as codesRepo from './repos/codes.repo'
import * as visitsRepo from './repos/visits.repo'
import * as eventsRepo from './repos/events.repo'
import * as escalationsRepo from './repos/escalations.repo'
import * as statsRepo from './repos/stats.repo'

// Re-export types
export type { AppConfig } from '@shared/domain'

export class PortiaDB {
  private constructor() {}

  static async create(dbPath: string): Promise<PortiaDB> {
    await initDb(dbPath)
    runMigrations()
    configRepo.seedConfigDefaults()
    flushSync()
    return new PortiaDB()
  }

  /** In-memory instance for unit tests — no disk I/O. */
  static async createForTesting(): Promise<PortiaDB> {
    const { initDbInMemory } = await import('./connection')
    await initDbInMemory()
    runMigrations()
    configRepo.seedConfigDefaults()
    return new PortiaDB()
  }

  // ── Config ──────────────────────────────────────────────────────────────
  getConfig = configRepo.getConfig
  updateConfig = configRepo.updateConfig

  // ── Team ────────────────────────────────────────────────────────────────
  getTeam = teamRepo.getTeam
  getTeamMember = teamRepo.getTeamMember
  addTeamMember = teamRepo.addTeamMember
  updateTeamMember = teamRepo.updateTeamMember
  deleteTeamMember = teamRepo.deleteTeamMember
  findTeamByName = teamRepo.findTeamByName
  getTeamSummary = teamRepo.getTeamSummary

  // ── Access Codes ────────────────────────────────────────────────────────
  getAccessCodes = codesRepo.getAccessCodes
  getAllAccessCodes = codesRepo.getAllAccessCodes
  createAccessCode = codesRepo.createAccessCode
  deleteAccessCode = codesRepo.deleteAccessCode
  findCodesByVisitor = codesRepo.findCodesByVisitor
  validateCode = codesRepo.validateCode
  getAccessCodesSummary = codesRepo.getAccessCodesSummary

  // ── Visits ──────────────────────────────────────────────────────────────
  getVisits = visitsRepo.getVisits
  addVisit = visitsRepo.addVisit
  lookupVisitor = visitsRepo.lookupVisitor

  // ── Events ──────────────────────────────────────────────────────────────
  getEvents = eventsRepo.getEvents
  addEvent = eventsRepo.addEvent

  // ── Escalations ─────────────────────────────────────────────────────────
  getEscalations = escalationsRepo.getEscalations
  addEscalation = escalationsRepo.addEscalation
  resolveEscalation = escalationsRepo.resolveEscalation

  // ── Stats ───────────────────────────────────────────────────────────────
  getDashboardStats = statsRepo.getDashboardStats

  // ── Utility ─────────────────────────────────────────────────────────────

  clearAll(): void {
    run('DELETE FROM team')
    run('DELETE FROM access_codes')
    run('DELETE FROM visits')
    run('DELETE FROM events')
    run('DELETE FROM escalations')
  }

  static generateSipId(): string {
    return 'portia-' + randomBytes(2).toString('hex')
  }

  flush = flushSync
  close = closeDb
}

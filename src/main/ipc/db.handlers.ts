/**
 * Portia IPC — Database handlers.
 */

import { ipcMain } from 'electron'
import type { PortiaDB } from '@main/db'
import { CreateAccessCodeSchema, TeamMemberInputSchema } from '@shared/ipc-contracts'
import { createLogger } from '@main/logger'

const log = createLogger('db')

export function registerDbHandlers(db: PortiaDB) {
  // Helper: refresh agent keyterms after DB mutations
  const _refreshKeyterms = async () => {
    try {
      const { refreshKeyterms } = await import('@main/agent/bootstrap')
      refreshKeyterms()
    } catch (err) {
      log.debug('refreshKeyterms skipped:', err)
    }
  }

  ipcMain.handle('db:visitors:list', (_, limit?: number) => db.getVisits(limit))
  ipcMain.handle('db:visitors:add', (_, visit) => db.addVisit(visit))
  ipcMain.handle('db:team:list', () => db.getTeam())
  ipcMain.handle('db:team:add', (_, raw: unknown) => {
    const parsed = TeamMemberInputSchema.safeParse(raw)
    if (!parsed.success) {
      log.warn('db:team:add invalid:', parsed.error.format())
      return { error: 'Invalid team member data' }
    }
    const r = db.addTeamMember(parsed.data); _refreshKeyterms(); return r
  })
  ipcMain.handle('db:team:update', (_, id, updates) => { const r = db.updateTeamMember(id, updates); _refreshKeyterms(); return r })
  ipcMain.handle('db:team:delete', (_, id) => { const r = db.deleteTeamMember(id); _refreshKeyterms(); return r })
  ipcMain.handle('db:codes:list', () => db.getAllAccessCodes())
  ipcMain.handle('db:codes:create', (_, raw: unknown) => {
    const parsed = CreateAccessCodeSchema.safeParse(raw)
    if (!parsed.success) {
      log.warn('db:codes:create invalid:', parsed.error.format())
      return { error: 'Invalid access code data' }
    }
    const r = db.createAccessCode(parsed.data); _refreshKeyterms(); return r
  })
  ipcMain.handle('db:codes:delete', (_, id) => { const r = db.deleteAccessCode(id); _refreshKeyterms(); return r })
  ipcMain.handle('db:events:list', (_, limit?: number) => db.getEvents(limit))
  ipcMain.handle('db:escalations:list', () => db.getEscalations())
  ipcMain.handle('db:escalations:resolve', (_, id) => db.resolveEscalation(id))
  ipcMain.handle('db:stats', () => db.getDashboardStats())
}

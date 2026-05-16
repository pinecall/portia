/**
 * Portia — IPC Handlers
 *
 * Maps renderer invoke calls to main process operations.
 * All zenitel-client calls go through here.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { ZenitelClient, scanNetwork } from '@pinecall/zenitel-client'
import type { PortiaDB } from './db'

export function registerIpcHandlers(window: BrowserWindow, db: PortiaDB) {
  // ── Zenitel ───────────────────────────────────────────────────────────

  ipcMain.handle('zenitel:scan', async () => {
    return scanNetwork({ timeout: 8000 })
  })

  ipcMain.handle('zenitel:info', async () => {
    const config = db.getConfig()
    const z = _client(config)
    return z.getDeviceInfo()
  })

  ipcMain.handle('zenitel:test', async () => {
    const config = db.getConfig()
    const z = _client(config)
    const reachable = await z.isReachable()
    if (!reachable) return { reachable: false, webcallEnabled: false }
    const info = await z.getDeviceInfo()
    return { reachable: true, webcallEnabled: info.webcallEnabled, model: info.model }
  })

  ipcMain.handle('zenitel:relay', async (_, opts: any) => {
    const z = _client(db.getConfig())
    if (opts === 'deactivate' || opts?.action === 'deactivate') {
      await z.deactivateRelay(opts?.relayId || 'relay1')
    } else {
      await z.activateRelay({ relayId: opts?.relayId || 'relay1', timer: opts?.timer || 3 })
    }
  })

  ipcMain.handle('zenitel:sip:get', async () => {
    return _client(db.getConfig()).getSIPConfig()
  })

  ipcMain.handle('zenitel:sip:set', async (_, config: any) => {
    await _client(db.getConfig()).setSIPConfig(config)
  })

  ipcMain.handle('zenitel:webcall:enable', async () => {
    await _client(db.getConfig()).enableWebcall()
  })

  ipcMain.handle('zenitel:provision', async () => {
    const config = db.getConfig()
    const z = _client(config)
    const sipDomain = config.sipDomain || 'testing-mo16m3gw.sip.twilio.com'
    const sipId = config.agentPhone || config.sipId || 'portia'
    const dakAddress = `${sipId}@${sipDomain}`

    // 1. Set DAK (call button) → agent SIP address + End Call on press during call
    await z.setDAK(dakAddress)

    // 2. Enable webcall + relay API
    await z.enableWebcall()

    // Save the SIP config used
    db.updateConfig({ sipId: sipId, sipDomain })
    return { sipId, sipDomain, dakAddress }
  })

  ipcMain.handle('zenitel:reboot', async () => {
    await _client(db.getConfig()).reboot()
  })

  ipcMain.handle('zenitel:video-url', () => {
    const config = db.getConfig()
    return `portia-cam:///?ip=${config.zenitelHost}&user=${config.zenitelUser}&pass=${config.zenitelPassword}`
  })

  // ── Database ──────────────────────────────────────────────────────────

  ipcMain.handle('db:visitors:list', (_, limit?: number) => db.getVisits(limit))
  ipcMain.handle('db:visitors:add', (_, visit) => db.addVisit(visit))
  ipcMain.handle('db:team:list', () => db.getTeam())
  ipcMain.handle('db:team:add', (_, member) => db.addTeamMember(member))
  ipcMain.handle('db:team:update', (_, id, updates) => db.updateTeamMember(id, updates))
  ipcMain.handle('db:team:delete', (_, id) => db.deleteTeamMember(id))
  ipcMain.handle('db:codes:list', () => db.getAllAccessCodes())
  ipcMain.handle('db:codes:create', (_, params) => db.createAccessCode(params))
  ipcMain.handle('db:codes:delete', (_, id) => db.deleteAccessCode(id))
  ipcMain.handle('db:events:list', (_, limit?: number) => db.getEvents(limit))
  ipcMain.handle('db:escalations:list', () => db.getEscalations())
  ipcMain.handle('db:escalations:resolve', (_, id) => db.resolveEscalation(id))
  ipcMain.handle('db:stats', () => db.getDashboardStats())

  // ── Config ────────────────────────────────────────────────────────────

  ipcMain.handle('config:get', () => db.getConfig())

  ipcMain.handle('config:set', (_, updates) => {
    return db.updateConfig(updates)
  })

  ipcMain.handle('config:wizard-complete', () => {
    db.updateConfig({ wizardCompleted: true })
    window.webContents.send('portia:wizard-done')
    return true
  })

  ipcMain.handle('config:reset-wizard', async () => {
    try {
      const { stopAgent } = await import('./agent/bootstrap')
      await stopAgent()
    } catch {}
    db.updateConfig({ wizardCompleted: false })
    return true
  })

  // ── Agent ──────────────────────────────────────────────────────────────

  ipcMain.handle('agent:start', async () => {
    const { startAgent } = await import('./agent/bootstrap')
    return startAgent({ db, window })
  })

  ipcMain.handle('agent:stop', async () => {
    const { stopAgent } = await import('./agent/bootstrap')
    await stopAgent()
    return true
  })

  ipcMain.handle('agent:status', async () => {
    try {
      const { getAgentStatus } = await import('./agent/bootstrap')
      return getAgentStatus()
    } catch {
      return { running: false }
    }
  })
}

// ── Helper ──────────────────────────────────────────────────────────────

function _client(config: { zenitelHost: string; zenitelUser: string; zenitelPassword: string }) {
  return new ZenitelClient({
    host: config.zenitelHost,
    user: config.zenitelUser,
    password: config.zenitelPassword,
  })
}

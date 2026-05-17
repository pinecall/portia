/**
 * Portia — IPC Handlers
 *
 * Maps renderer invoke calls to main process operations.
 * All zenitel-client calls go through here.
 */

import { ipcMain, BrowserWindow } from 'electron'
import { TcivClient, scanNetwork } from 'tciv-client'
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

  ipcMain.handle('zenitel:audio:get', async () => {
    return _client(db.getConfig()).getAudioSettings()
  })

  ipcMain.handle('zenitel:audio:set', async (_, settings: any) => {
    await _client(db.getConfig()).setAudioSettings(settings)
  })

  // ── Database ──────────────────────────────────────────────────────────

  // Helper: refresh agent keyterms after DB mutations
  const _refreshKeyterms = async () => {
    try {
      const { refreshKeyterms } = await import('./agent/bootstrap')
      refreshKeyterms()
    } catch {}
  }

  ipcMain.handle('db:visitors:list', (_, limit?: number) => db.getVisits(limit))
  ipcMain.handle('db:visitors:add', (_, visit) => db.addVisit(visit))
  ipcMain.handle('db:team:list', () => db.getTeam())
  ipcMain.handle('db:team:add', (_, member) => { const r = db.addTeamMember(member); _refreshKeyterms(); return r })
  ipcMain.handle('db:team:update', (_, id, updates) => { const r = db.updateTeamMember(id, updates); _refreshKeyterms(); return r })
  ipcMain.handle('db:team:delete', (_, id) => { const r = db.deleteTeamMember(id); _refreshKeyterms(); return r })
  ipcMain.handle('db:codes:list', () => db.getAllAccessCodes())
  ipcMain.handle('db:codes:create', (_, params) => { const r = db.createAccessCode(params); _refreshKeyterms(); return r })
  ipcMain.handle('db:codes:delete', (_, id) => { const r = db.deleteAccessCode(id); _refreshKeyterms(); return r })
  ipcMain.handle('db:events:list', (_, limit?: number) => db.getEvents(limit))
  ipcMain.handle('db:escalations:list', () => db.getEscalations())
  ipcMain.handle('db:escalations:resolve', (_, id) => db.resolveEscalation(id))
  ipcMain.handle('db:stats', () => db.getDashboardStats())

  // ── Config ────────────────────────────────────────────────────────────

  ipcMain.handle('config:get', () => db.getConfig())

  ipcMain.handle('config:set', (_, updates) => {
    return db.updateConfig(updates)
  })

  ipcMain.handle('config:wizard-complete', async () => {
    db.updateConfig({ wizardCompleted: true })
    window.webContents.send('portia:wizard-done')
    // Auto-start agent after wizard
    try {
      const { startAgent } = await import('./agent/bootstrap')
      await startAgent({ db, window })
    } catch (err: any) {
      console.error('[Portia] Failed to start agent after wizard:', err.message)
    }
    return true
  })

  ipcMain.handle('config:reset-wizard', async () => {
    try {
      const { stopAgent } = await import('./agent/bootstrap')
      await stopAgent()
    } catch {}
    db.updateConfig({ wizardCompleted: false, agentId: null })
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

  // ── SIP IP Whitelisting ──────────────────────────────────────────────

  ipcMain.handle('sip:detect-ip', async () => {
    // Get public IP via external service
    try {
      const resp = await fetch('https://api.ipify.org?format=json')
      const data = await resp.json() as { ip: string }
      return { ip: data.ip }
    } catch (err: any) {
      return { ip: null, error: err.message }
    }
  })

  ipcMain.handle('sip:check-ip', async (_, opts: { ip: string }) => {
    const config = db.getConfig()
    const domain = config.sipDomain || 'testing-mo16m3gw.sip.twilio.com'
    const apiKey = config.pinecallApiKey
    const serverUrl = config.pinecallServerUrl || 'https://voice.pinecall.io'

    if (!apiKey) return { error: 'No API key configured' }

    try {
      const resp = await fetch(`${serverUrl}/api/sdk/sip/check-ip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({ domain, ip: opts.ip }),
      })
      return await resp.json()
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('sip:whitelist-ip', async (_, opts: { ip: string; name?: string }) => {
    const config = db.getConfig()
    const domain = config.sipDomain || 'testing-mo16m3gw.sip.twilio.com'
    const apiKey = config.pinecallApiKey
    const serverUrl = config.pinecallServerUrl || 'https://voice.pinecall.io'

    if (!apiKey) return { error: 'No API key configured' }

    try {
      const resp = await fetch(`${serverUrl}/api/sdk/sip/whitelist-ip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          domain,
          ip: opts.ip,
          name: opts.name || 'Portia',
        }),
      })
      return await resp.json()
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}

// ── Helper ──────────────────────────────────────────────────────────────

function _client(config: { zenitelHost: string; zenitelUser: string; zenitelPassword: string }) {
  return new TcivClient({
    host: config.zenitelHost,
    user: config.zenitelUser,
    password: config.zenitelPassword,
  })
}

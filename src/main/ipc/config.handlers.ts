/**
 * Portia IPC — Config + Agent + SIP handlers.
 */

import { ipcMain, BrowserWindow } from 'electron'
import type { PortiaDB } from '../db'
import { ENV } from '../config/env'

const SERVER_URL = 'https://voice.pinecall.io'

export function registerConfigHandlers(window: BrowserWindow, db: PortiaDB) {
  ipcMain.handle('config:get', () => db.getConfig())

  ipcMain.handle('config:set', (_, updates) => db.updateConfig(updates))

  ipcMain.handle('config:wizard-complete', async () => {
    db.updateConfig({ wizardCompleted: true })
    window.webContents.send('portia:wizard-done')
    try {
      const { startAgent } = await import('../agent/bootstrap')
      await startAgent({ db, window })
    } catch (err: any) {
      console.error('[ipc] Failed to start agent after wizard:', err.message)
    }
    return true
  })

  ipcMain.handle('config:reset-wizard', async () => {
    try {
      const { stopAgent } = await import('../agent/bootstrap')
      await stopAgent()
    } catch {}
    db.updateConfig({ wizardCompleted: false, agentId: null })
    return true
  })

  // ── Agent ──────────────────────────────────────────────────────────────

  ipcMain.handle('agent:start', async () => {
    const { startAgent } = await import('../agent/bootstrap')
    return startAgent({ db, window })
  })

  ipcMain.handle('agent:stop', async () => {
    const { stopAgent } = await import('../agent/bootstrap')
    await stopAgent()
    return true
  })

  ipcMain.handle('agent:status', async () => {
    try {
      const { getAgentStatus } = await import('../agent/bootstrap')
      return getAgentStatus()
    } catch {
      return { running: false }
    }
  })

  // ── SIP IP Whitelisting ────────────────────────────────────────────────

  ipcMain.handle('sip:detect-ip', async () => {
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
    const domain = config.sipDomain || ENV.SIP_DOMAIN
    const apiKey = ENV.API_KEY
    if (!apiKey) return { error: 'No API key configured' }
    try {
      const resp = await fetch(`${SERVER_URL}/api/sdk/sip/check-ip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ domain, ip: opts.ip }),
      })
      return await resp.json()
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('sip:whitelist-ip', async (_, opts: { ip: string; name?: string }) => {
    const config = db.getConfig()
    const domain = config.sipDomain || ENV.SIP_DOMAIN
    const apiKey = ENV.API_KEY
    if (!apiKey) return { error: 'No API key configured' }
    try {
      const resp = await fetch(`${SERVER_URL}/api/sdk/sip/whitelist-ip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ domain, ip: opts.ip, name: opts.name || 'Portia' }),
      })
      return await resp.json()
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}

/**
 * Portia IPC — Config + Agent + SIP handlers.
 */

import { ipcMain, BrowserWindow } from 'electron'
import type { PortiaDB } from '@main/db'
import { ENV } from '@main/config/env'
import { AgentConfigUpdateSchema } from '@shared/ipc-contracts'
import { createLogger } from '@main/logger'

const SERVER_URL = 'https://voice.pinecall.io'
const log = createLogger('ipc')

export function registerConfigHandlers(window: BrowserWindow, db: PortiaDB) {
  ipcMain.handle('config:get', () => {
    const cfg = db.getConfig()
    // Merge env defaults so renderer always has the active values
    return {
      ...cfg,
      agentVoice: cfg.agentVoice || ENV.VOICE_ID,
      sipDomain: cfg.sipDomain || ENV.SIP_DOMAIN,
    }
  })

  // Expose specific env vars to renderer (for wizard preview)
  const SAFE_ENV_KEYS: Record<string, string> = {
    PORTIA_SIP_DOMAIN: ENV.SIP_DOMAIN,
    PORTIA_VOICE_ID: ENV.VOICE_ID,
  }
  ipcMain.handle('config:get-env', (_, key: string) => SAFE_ENV_KEYS[key] || '')

  ipcMain.handle('config:set', (_, updates) => db.updateConfig(updates))

  ipcMain.handle('config:wizard-complete', async () => {
    db.updateConfig({ wizardCompleted: true })
    window.webContents.send('portia:wizard-done')
    try {
      const { startAgent } = await import('@main/agent/bootstrap')
      await startAgent({ db, window })
    } catch (err: any) {
      console.error('[ipc] Failed to start agent after wizard:', err.message)
    }
    return true
  })

  ipcMain.handle('config:reset-wizard', async () => {
    try {
      const { stopAgent } = await import('@main/agent/bootstrap')
      await stopAgent()
    } catch (err) {
      log.debug('reset-wizard stopAgent:', err)
    }
    db.updateConfig({ wizardCompleted: false, agentId: null })
    return true
  })

  // ── Agent ──────────────────────────────────────────────────────────────

  ipcMain.handle('agent:start', async () => {
    const { startAgent } = await import('@main/agent/bootstrap')
    return startAgent({ db, window })
  })

  ipcMain.handle('agent:stop', async () => {
    const { stopAgent } = await import('@main/agent/bootstrap')
    await stopAgent()
    return true
  })

  ipcMain.handle('agent:status', async () => {
    try {
      const { getAgentStatus } = await import('@main/agent/bootstrap')
      return getAgentStatus()
    } catch (err) {
      log.debug('agent:status error:', err)
      return { running: false }
    }
  })

  ipcMain.handle('agent:configure', async (_, raw: unknown) => {
    // Validate at the IPC boundary
    const parsed = AgentConfigUpdateSchema.safeParse(raw)
    if (!parsed.success) {
      log.warn('agent:configure invalid payload:', parsed.error.format())
      return { ok: false, error: 'Invalid configuration' }
    }
    const updates = parsed.data

    // 1. Persist to DB
    db.updateConfig(updates)

    // 2. Hot-reload live agent
    try {
      const { getAgentState } = await import('@main/agent/bootstrap')
      const state = getAgentState()
      if (state?.agent) {
        const body: Record<string, unknown> = {}
        if (updates.agentVoice) body.voice = updates.agentVoice
        if (updates.agentSttProvider) body.stt = { provider: updates.agentSttProvider }
        if (updates.agentLlmModel || updates.agentLlmEngine) {
          body.llm = {
            ...(updates.agentLlmModel && { model: updates.agentLlmModel }),
            ...(updates.agentLlmEngine && { engine: updates.agentLlmEngine }),
          }
        }
        if (updates.agentTurnDetection) body.turn_detection = updates.agentTurnDetection
        if (updates.language) body.language = updates.language
        // Hot-reload prompt if preset or custom prompt changed
        if (updates.promptPreset || updates.customPrompt) {
          const { getPromptTemplate } = await import('@main/agent/prompt/builder')
          body.llm = { ...body.llm, instructions: getPromptTemplate(db) }
        }
        if (Object.keys(body).length) {
          state.agent.configure(body)
          log.info('Agent config hot-reloaded:', Object.keys(body).join(', '))
        }
      }
    } catch (err: unknown) {
      log.error('Agent hot-reload failed:', err instanceof Error ? err.message : String(err))
    }

    return { ok: true }
  })

  // ── Prompt Presets ────────────────────────────────────────────────────

  ipcMain.handle('prompt:get-presets', async () => {
    const { PROMPT_PRESETS } = await import('@main/agent/prompt/builder')
    return Object.keys(PROMPT_PRESETS)
  })

  ipcMain.handle('prompt:get-template', async (_, preset: string) => {
    const { getPresetTemplate } = await import('@main/agent/prompt/builder')
    return getPresetTemplate(preset)
  })

  // ── Voices ─────────────────────────────────────────────────────────────

  ipcMain.handle('voices:list', async (_, opts: { provider?: string } = {}) => {
    try {
      const { fetchVoices } = await import('@pinecall/core')
      const voices = await fetchVoices({ provider: opts.provider || 'elevenlabs' })
      return { ok: true, voices }
    } catch (err: unknown) {
      log.error('voices:list error:', err instanceof Error ? err.message : String(err))
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown error', voices: [] }
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

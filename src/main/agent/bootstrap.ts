/**
 * Agent Bootstrap — starts the Portia agent in the Electron main process.
 *
 * Uses the core Pinecall API (Pinecall + Agent) directly.
 * Called after the wizard completes or on app start if already configured.
 */

import type { PortiaDB } from '../db'
import type { BrowserWindow } from 'electron'
import type { Agent } from '@pinecall/core'
import { ENV } from '../config/env'

let agentState: { agent: Agent; db: PortiaDB; disconnect: () => Promise<void> } | null = null

interface BootstrapOptions {
  db: PortiaDB
  window: BrowserWindow
}

export async function startAgent({ db, window }: BootstrapOptions): Promise<boolean> {
  const config = db.getConfig()

  if (!config.zenitelHost) {
    console.log('[Agent] No zenitelHost configured, skipping')
    return false
  }

  try {
    const { default: createAgent } = await import('./index')
    const { TcivClient } = await import('tciv-client')

    const sipDomain = config.sipDomain || ENV.SIP_DOMAIN
    const sipId = config.agentPhone || `portia-${Math.random().toString(36).slice(2, 6)}`
    const sipUri = `sip:${sipId}@${sipDomain}`

    const zenitel = new TcivClient({
      host: config.zenitelHost,
      user: config.zenitelUser || 'admin',
      password: config.zenitelPassword || ENV.ZENITEL_PASS,
    })

    const result = await createAgent({
      apiKey: ENV.API_KEY,
      sipUri,
      db,
      zenitel,
      language: config.language || 'es',
      onCallEvent: (event) => {
        window.webContents.send('portia:call-event', event)
      },
    })

    agentState = { agent: result.agent, db, disconnect: result.disconnect }
    console.log(`[Agent] Started — SIP: ${sipUri}`)
    window.webContents.send('portia:agent-status', { status: 'connected', sipUri })
    return true
  } catch (err: any) {
    console.error(`[Agent] Failed to start:`, err.message)
    window.webContents.send('portia:agent-status', { status: 'error', error: err.message })
    agentState = null
    return false
  }
}

export async function stopAgent(): Promise<void> {
  if (agentState) {
    try { await agentState.disconnect() } catch {}
    agentState = null
    console.log('[Agent] Stopped')
  }
}

export function getAgentStatus(): { running: boolean } {
  return { running: !!agentState }
}

/**
 * Rebuild keyterms from the database and push to the live agent.
 * Call this after any DB mutation that changes team/codes/visitors.
 */
export function refreshKeyterms(): void {
  if (!agentState) return
  try {
    const { buildKeyterms } = require('./keyterms')
    const keyterms = buildKeyterms(agentState.db)
    agentState.agent.configure({
      stt: { provider: 'deepgram-flux', keyterms },
    })
    console.log(`[agent] Keyterms refreshed: ${keyterms.length} terms`)
  } catch (err: any) {
    console.error(`[agent] Failed to refresh keyterms:`, err.message)
  }
}

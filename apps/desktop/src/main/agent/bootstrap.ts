/**
 * Agent Bootstrap — starts the Portia agent in the Electron main process.
 *
 * Uses the core Pinecall API (Pinecall + Agent) directly.
 * Called after the wizard completes or on app start if already configured.
 */

import type { PortiaDB } from '../db'
import type { BrowserWindow } from 'electron'

let agentState: { disconnect: () => Promise<void> } | null = null

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

  if (!config.pinecallApiKey) {
    console.log('[Agent] No API key configured, skipping')
    return false
  }

  try {
    const { default: createAgent } = await import('./index')
    const { ZenitelClient } = await import('@pinecall/zenitel-client')

    const sipDomain = config.sipDomain || 'testing-mo16m3gw.sip.twilio.com'
    const sipId = config.sipId || `portia-${Math.random().toString(36).slice(2, 6)}`
    const sipUri = `sip:${sipId}@${sipDomain}`

    const zenitel = new ZenitelClient({
      host: config.zenitelHost,
      user: config.zenitelUser || 'admin',
      password: config.zenitelPassword || 'alphaadmin',
    })

    const result = await createAgent({
      apiKey: config.pinecallApiKey,
      sipUri,
      db,
      zenitel,
      language: config.language || 'es',
      onCallEvent: (event) => {
        window.webContents.send('portia:call-event', event)
      },
    })

    agentState = result
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

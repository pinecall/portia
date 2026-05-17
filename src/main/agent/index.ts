/**
 * Portia Agent — Core API version
 *
 * Slim orchestrator: creates and connects the agent.
 * All logic is delegated to prompt/, tools/, events/, keyterms.
 */

import { Pinecall } from '@pinecall/core'
import type { PortiaDB } from '../db'
import type { TcivClient } from 'tciv-client'
import { ENV } from '../config/env'
import { buildPrompt } from './prompt/builder'
import { buildGreeting } from './prompt/greeting'
import { buildKeyterms } from './keyterms'
import { toolSchemas } from './tools/registry'
import { wireAgentEvents } from './events/wire'

// ── Agent ID ─────────────────────────────────────────────────────────────

const ADJECTIVES = ['amber','azure','coral','dusk','ember','frost','jade','lunar','nova','onyx','pearl','quartz','ruby','sage','silk','solar','tide','vale','vine','zen']
const NOUNS = ['arc','bay','cove','dew','elm','fern','glen','hawk','isle','jay','kite','lark','mesa','nest','oak','pine','reed','sky','thorn','wren']

function generateAgentId(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `portia-${adj}-${noun}`
}

function getAgentId(db: PortiaDB): string {
  const config = db.getConfig()
  if (config.agentId) return config.agentId
  const id = generateAgentId()
  db.updateConfig({ agentId: id })
  console.log(`[agent] Generated agent ID: ${id}`)
  return id
}

// ── Options ──────────────────────────────────────────────────────────────

interface PortiaAgentOptions {
  apiKey: string
  sipUri: string
  db: PortiaDB
  zenitel: TcivClient
  voice?: string
  language?: string
  onCallEvent?: (event: any) => void
}

// ── Main: create & connect ───────────────────────────────────────────────

export async function createAgent(opts: PortiaAgentOptions) {
  const pc = new Pinecall({ apiKey: opts.apiKey })
  await pc.connect()

  const agentId = getAgentId(opts.db)
  const prompt = buildPrompt(opts.db)
  const greeting = buildGreeting(opts.db)
  const tools = toolSchemas()
  const keyterms = buildKeyterms(opts.db)
  const sttConfig = { provider: 'deepgram-flux', keyterms }

  console.log(`[agent] ID: ${agentId} | Prompt: ${prompt.length} chars | Phone: ${opts.sipUri}`)

  const agent = pc.agent(agentId, {
    voice: opts.voice || ENV.VOICE_ID,
    language: opts.language || 'es',
    stt: sttConfig,
    turnDetection: 'native',
    llm: { engine: 'openai', model: ENV.LLM_MODEL, enabled: true, instructions: prompt },
    tools,
    greeting,
  })

  agent.addChannel('phone', opts.sipUri, {
    voice: opts.voice || ENV.VOICE_ID,
    language: opts.language || 'es',
    stt: sttConfig,
    turnDetection: 'native',
  })

  // Emit helper
  const emit = (event: string, data: Record<string, unknown>) => {
    try {
      const safe = JSON.parse(JSON.stringify({ event, ...data }))
      opts.onCallEvent?.(safe)
    } catch (err) {
      console.error(`[agent] Emit error ${event}:`, err)
    }
  }

  // Wire all events
  wireAgentEvents({
    agent, greeting, emit, db: opts.db,
    ctx: { db: opts.db, zenitel: opts.zenitel },
  })

  // Cleanup on process exit
  const cleanup = async () => {
    try {
      console.log(`[agent] Disconnecting ${agentId}...`)
      await pc.disconnect()
      console.log(`[agent] Disconnected`)
    } catch {}
  }
  process.once('SIGTERM', cleanup)
  process.once('SIGINT', cleanup)

  return { agent, pc, agentId, disconnect: cleanup }
}

// Re-export for bootstrap
export { buildKeyterms } from './keyterms'
export default createAgent

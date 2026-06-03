/**
 * Portia Agent — Core API version
 *
 * Slim orchestrator: creates and connects the agent.
 * All logic is delegated to prompt/, tools/, events/, keyterms.
 *
 * Prompt placeholders ({{building}}, {{team}}, {{codes}}) are resolved
 * server-side via setPromptVars. {{date}} and {{time}} are built-in.
 */

import { Pinecall } from '@pinecall/sdk'
import type { PortiaDB } from '@main/db'
import type { TcivClient } from 'tciv-client'
import type { CallEvent } from '@shared/ipc-contracts'
import { ENV } from '@main/config/env'
import { createLogger } from '@main/logger'
import { getPromptTemplate, getPromptVars, buildGreeting } from './prompt/builder'
import { buildKeyterms } from './keyterms'
import { createTools, type ToolContext } from './tools/tools'
import { wireAgentEvents } from './events/wire'

const log = createLogger('agent')

// ── Agent ID ─────────────────────────────────────────────────────────────

const ADJECTIVES = ['amber','azure','coral','dusk','ember','frost','jade','lunar','nova','onyx','pearl','quartz','ruby','sage','silk','solar','tide','vale','vine','zen']
const NOUNS = ['arc','bay','cove','dew','elm','fern','glen','hawk','isle','jay','kite','lark','mesa','nest','oak','pine','reed','sky','thorn','wren']

function generateAgentId(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]!
  return `portia-${adj}-${noun}`
}

function getAgentId(db: PortiaDB): string {
  const config = db.getConfig()
  if (config.agentId) return config.agentId
  const id = generateAgentId()
  db.updateConfig({ agentId: id })
  log.info(`Generated agent ID: ${id}`)
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
  llmProvider?: string
  llmModel?: string
  sttProvider?: string
  ttsProvider?: string
  onCallEvent?: (event: CallEvent) => void
}

// ── Main: create & connect ───────────────────────────────────────────────

export async function createAgent(opts: PortiaAgentOptions) {
  const pc = new Pinecall({ apiKey: opts.apiKey })
  await pc.connect()

  const agentId = getAgentId(opts.db)
  const promptTemplate = getPromptTemplate(opts.db)
  const promptVars = getPromptVars(opts.db)
  const greeting = buildGreeting(opts.db)
  const tools = createTools({ db: opts.db, zenitel: opts.zenitel })
  const keyterms = buildKeyterms(opts.db)
  const sttProvider = opts.sttProvider || 'deepgram-flux'
  const sttConfig = { provider: sttProvider, keyterms }

  const llmProvider = opts.llmProvider || 'openai'
  const llmModel = opts.llmModel || ENV.LLM_MODEL
  const voice = opts.voice || ENV.VOICE_ID

  log.info(`ID: ${agentId} | LLM: ${llmProvider}/${llmModel} | STT: ${sttProvider} | Phone: ${opts.sipUri}`)

  const agent = pc.agent(agentId, {
    voice,
    language: opts.language || 'es',
    stt: sttConfig,
    llm: {
      provider: llmProvider,
      model: llmModel,
      enabled: true,
      prompt: promptTemplate,
    },
    tools,
  })

  agent.addChannel('phone', opts.sipUri, {
    voice,
    language: opts.language || 'es',
    stt: sttConfig,
  })

  // Optional test phone number
  if (process.env.PORTIA_TEST_PHONE) {
    agent.addChannel('phone', process.env.PORTIA_TEST_PHONE, {
      voice,
      language: opts.language || 'es',
      stt: sttConfig,
    })
  }

  // Emit helper — type-safe via CallEvent discriminated union
  const emit = <E extends CallEvent['event']>(
    event: E,
    data: Omit<Extract<CallEvent, { event: E }>, 'event'>,
  ) => {
    try {
      const safe = JSON.parse(JSON.stringify({ event, ...data })) as CallEvent
      opts.onCallEvent?.(safe)
    } catch (err) {
      log.error(`Emit error ${event}:`, err)
    }
  }

  wireAgentEvents({
    agent, greeting, emit, db: opts.db,
  })

  // Disconnect function — lifecycle managed by bootstrap.ts
  const disconnect = async () => {
    try {
      log.info(`Disconnecting ${agentId}...`)
      await pc.disconnect()
      log.info('Disconnected')
    } catch (err) {
      log.debug('Disconnect ignored:', err)
    }
  }

  return { agent, pc, agentId, disconnect }
}

// Re-export for bootstrap
export { buildKeyterms } from './keyterms'
export default createAgent

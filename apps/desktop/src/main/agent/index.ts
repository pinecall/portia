/**
 * Portia Agent — Core API version
 *
 * Uses `Pinecall` + `Agent` (core) directly instead of PinecallAgent wrapper.
 * This gives us direct access to ALL streaming events (bot.word, user.speaking, etc.)
 * without needing to proxy through class hooks.
 *
 * Server-side LLM handles the conversation. Tools are executed locally via
 * the `llm.tool_call` event and results sent back with `call.toolResult()`.
 */

import { Pinecall } from '@pinecall/core'
import type { Agent } from '@pinecall/core'
import type { Call } from '@pinecall/core'
import type { PortiaDB } from '../db'
import type { ZenitelClient } from '@pinecall/zenitel-client'
import * as ToolDefs from './tools'

// ── Agent ID ─────────────────────────────────────────────────────────────

const ADJECTIVES = ['amber','azure','coral','dusk','ember','frost','jade','lunar','nova','onyx','pearl','quartz','ruby','sage','silk','solar','tide','vale','vine','zen']
const NOUNS = ['arc','bay','cove','dew','elm','fern','glen','hawk','isle','jay','kite','lark','mesa','nest','oak','pine','reed','sky','thorn','wren']

function generateAgentId(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `portia-${adj}-${noun}`
}

/** Get or create a stable agent ID (persisted in DB config). */
function getAgentId(db: PortiaDB): string {
  const config = db.getConfig()
  if (config.agentId) return config.agentId
  const id = generateAgentId()
  db.updateConfig({ agentId: id })
  console.log(`[Portia] Generated agent ID: ${id}`)
  return id
}

// ── Options ──────────────────────────────────────────────────────────────

interface PortiaAgentOptions {
  apiKey: string
  sipUri: string
  db: PortiaDB
  zenitel: ZenitelClient
  voice?: string
  language?: string
  onCallEvent?: (event: any) => void
}

// ── Tool handlers ────────────────────────────────────────────────────────

function buildToolHandlers(db: PortiaDB, zenitel: ZenitelClient) {
  return {
    identifyVisitor: async (params: any, _call: Call) => {
      console.log(`[Tool] identifyVisitor: name=${params.name || '—'} company=${params.company || '—'} host=${params.host || '—'}`)
      return { updated: true, ...params }
    },

    openDoor: async (params: any, call: Call) => {
      const normalized = (params.code || '').replace(/\D/g, '').trim()
      console.log(`[Tool] openDoor: code="${normalized}"`)
      const result = db.validateCode(normalized)
      if (!result.valid) {
        db.addEvent({ type: 'err', date: new Date().toISOString(), source: 'agent', details: `Code failed: ${normalized}`, visit_id: null })
        return { success: false, error: 'Invalid access code' }
      }
      console.log(`[Tool] Valid code for: ${result.visitor} — opening door`)
      try { call.sendDTMF('6') } catch {
        console.log(`[Tool] DTMF failed, HTTP relay fallback`)
        await zenitel.activateRelay({ relayId: 'relay1', timer: 3 })
      }
      db.addEvent({ type: 'auth', date: new Date().toISOString(), source: 'agent', details: `Code ${normalized} validated: ${result.visitor}`, visit_id: null })
      return { success: true, visitor: result.visitor, message: `Door opened for ${result.visitor}` }
    },

    lookupVisitor: async (params: any, _call: Call) => {
      const visits = db.lookupVisitor(params)
      if (visits.length === 0) return { found: false, message: 'No previous visits found.' }
      const team = db.getTeam()
      return {
        found: true,
        visits: visits.map((v: any) => {
          const host = team.find((m: any) => m.id === v.hostId)
          return { visitorName: v.visitorName, company: v.company, host: host?.name || '—', date: v.date, outcome: v.outcome }
        }),
      }
    },

    escalateToSecurity: async (params: any, _call: Call) => {
      console.log(`[Tool] Security escalation: ${params.urgency} — ${params.reason}`)
      const esc = db.addEscalation({ reason: params.reason, urgency: params.urgency })
      return { success: true, escalationId: esc.id, message: `${params.urgency} security alert registered.` }
    },

    contactTeamMember: async (params: any, _call: Call) => {
      console.log(`[Tool] Contact team: ${params.teamMemberId} for ${params.visitorName}`)
      const member = db.getTeamMember(params.teamMemberId)
      if (!member) return { success: false, error: 'Team member not found.' }
      db.addEvent({ type: 'tool', date: new Date().toISOString(), source: 'agent', details: `Notification to ${member.name} — visitor: ${params.visitorName}`, visit_id: null })
      const statusLabels: Record<string, string> = { available: 'available', 'in-meeting': 'in a meeting', away: 'away' }
      return {
        success: true, teamMember: member.name, status: member.status,
        statusLabel: statusLabels[member.status] || member.status, floor: member.floor,
        message: member.status === 'available'
          ? `${member.name} is available and has been notified.`
          : member.status === 'in-meeting'
            ? `${member.name} is in a meeting. They have been notified.`
            : `${member.name} is away. A message has been left.`,
      }
    },
  }
}

// ── Convert ToolDef → OpenAI function schema ─────────────────────────────

function toolDefsToServerTools() {
  const entries = Object.entries(ToolDefs) as [string, any][]
  return entries.map(([name, def]) => ({
    type: 'function' as const,
    function: {
      name,
      description: def.description,
      parameters: {
        type: 'object',
        properties: def.params,
        required: def.required || [],
      },
    },
  }))
}

// ── Build prompt ─────────────────────────────────────────────────────────

function buildPrompt(db: PortiaDB): string {
  const teamContext = db.getTeamSummary()
  const codesContext = db.getAccessCodesSummary()
  const now = new Date()
  const dateBlock = `## CURRENT DATE AND TIME\nToday is ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. Time: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}.`
  return `${PROMPT_TEMPLATE}\n\n${dateBlock}\n\n## ${teamContext}\n\n## ${codesContext}`
}

// ── Build greeting ───────────────────────────────────────────────────────

function buildGreeting(db: PortiaDB): string {
  const h = new Date().getHours()
  const saludo = h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
  const config = db.getConfig()
  const building = config.buildingName || 'el edificio'
  return `${saludo}, bienvenido a ${building}. Soy la recepcionista virtual. ¿Cuál es su nombre, por favor?`
}

// ── Main: create & connect ───────────────────────────────────────────────

export async function createAgent(opts: PortiaAgentOptions) {
  const pc = new Pinecall({ apiKey: opts.apiKey })
  await pc.connect()

  const agentId = getAgentId(opts.db)
  const prompt = buildPrompt(opts.db)
  const greeting = buildGreeting(opts.db)
  const tools = toolDefsToServerTools()
  const handlers = buildToolHandlers(opts.db, opts.zenitel)

  console.log(`[Portia Agent] ID: ${agentId}`)
  console.log(`[Portia Agent] Prompt: ${prompt.length} chars`)
  console.log(`[Portia Agent] Phone: ${opts.sipUri}`)

  // Create agent with server-side LLM, tools, and greeting
  const agent = pc.agent(agentId, {
    voice: opts.voice || 'elevenlabs:h2cd3gvcqTp3m65Dysk7',
    language: opts.language || 'es',
    stt: 'deepgram-flux',
    turnDetection: 'native',
    llm: {
      engine: 'openai',
      model: 'gpt-4.1-mini',
      enabled: true,
      instructions: prompt,
    },
    tools,
    greeting,
  })

  // Add SIP phone channel
  agent.addChannel('phone', opts.sipUri, {
    voice: opts.voice || 'elevenlabs:h2cd3gvcqTp3m65Dysk7',
    language: opts.language || 'es',
    stt: 'deepgram-flux',
    turnDetection: 'native',
  })

  // ── IPC emit helper ────────────────────────────────────────────────────

  const emit = (event: string, data: any) => {
    try {
      const safe = JSON.parse(JSON.stringify({ event, ...data }))
      opts.onCallEvent?.(safe)
    } catch (err) {
      console.error(`[Agent] Emit error ${event}:`, err)
    }
  }

  // ── Wire ALL events to renderer ────────────────────────────────────────

  // Call lifecycle
  agent.on('call.started', (call: Call) => {
    console.log(`[Agent] Call started: ${call.direction} ${call.from} → ${call.to}`)
    emit('call.started', { call_id: call.id, direction: call.direction, from: call.from || '', to: call.to || '', transport: call.transport || 'phone' })
    opts.db.addEvent({ type: 'sip', date: new Date().toISOString(), source: 'intercom', details: `${call.direction} call: ${call.from || 'unknown'}`, visit_id: null })

    // Send greeting via TTS (call.say sends bot.reply with no in_reply_to)
    if (call.direction === 'inbound') {
      call.say(greeting)
    }
  })

  agent.on('call.ended', (call: Call, reason: string) => {
    console.log(`[Agent] Call ended: ${call.id} reason=${reason}`)
    emit('call.ended', { call_id: call.id, reason })
    // Save visit to DB
    saveVisitToDB(call, reason, opts.db)
  })

  // User speech (interim + final)
  agent.on('user.speaking', (event: any, call: Call) => {
    console.log(`  👤 (interim): ${event.text || ''}`)
    emit('user.speaking', { call_id: call.id, text: event.text || '', message_id: event.message_id || '' })
  })

  agent.on('user.message', (event: any, call: Call) => {
    console.log(`  👤 User: ${event.text || ''}`)
    emit('user.message', { call_id: call.id, text: event.text || '', message_id: event.message_id || '' })
  })

  // Bot speech (streaming word-by-word)
  agent.on('bot.speaking', (event: any, call: Call) => {
    console.log(`  🤖 Speaking: msg=${event.message_id}`)
    emit('bot.speaking', { call_id: call.id, message_id: event.message_id || '', text: event.text || '' })
  })

  agent.on('bot.word', (event: any, call: Call) => {
    emit('bot.word', { call_id: call.id, message_id: event.message_id || '', word: event.word || '', word_index: event.word_index ?? 0 })
  })

  agent.on('bot.finished', (event: any, call: Call) => {
    console.log(`  🤖 Finished: msg=${event.message_id}`)
    emit('bot.finished', { call_id: call.id, message_id: event.message_id || '' })
  })

  agent.on('bot.interrupted', (event: any, call: Call) => {
    console.log(`  🤖 Interrupted: msg=${event.message_id}`)
    emit('bot.interrupted', { call_id: call.id, message_id: event.message_id || '' })
  })

  // Tool calls — execute locally, send results back to server
  // Signature: llm.tool_call emits (call, data) where data has { tool_calls, msg_id }
  agent.on('llm.tool_call' as any, async (call: Call, data: any) => {
    // Skip per-tool re-emissions (they have {name, args} instead of tool_calls)
    const toolCalls = data?.tool_calls as Array<{ id: string; name: string; arguments: string }>
    if (!toolCalls) return

    const msgId = data.msg_id as string
    console.log(`  🔧 Tools: ${toolCalls.map(tc => tc.name).join(', ')} (msg=${msgId})`)
    emit('llm.tool_call', { call_id: call.id, tool_calls: toolCalls.map(tc => ({ name: tc.name, arguments: tc.arguments || '{}' })) })

    // Execute all tools and collect results
    const results: Array<{ tool_call_id: string; result: unknown }> = []
    for (const tc of toolCalls) {
      let result: unknown
      try {
        const args = JSON.parse(tc.arguments || '{}')
        const handler = (handlers as any)[tc.name]
        if (typeof handler === 'function') {
          result = await handler(args, call)
        } else {
          result = { error: `Unknown tool: ${tc.name}` }
        }
      } catch (err: any) {
        result = { error: err.message }
      }
      console.log(`  ✅ ${tc.name}: ${JSON.stringify(result).slice(0, 100)}`)
      emit('llm.tool_result', { call_id: call.id, result: JSON.stringify(result) })
      results.push({ tool_call_id: tc.id, result })
    }

    // Send all results back to server
    agent.send({
      event: 'llm.tool_result',
      call_id: call.id,
      msg_id: msgId,
      results,
    })
  })

  // Clean disconnect on process exit (Electron quit, SIGTERM)
  const cleanup = async () => {
    try {
      console.log(`[Agent] Disconnecting ${agentId}...`)
      await pc.disconnect()
      console.log(`[Agent] Disconnected`)
    } catch {}
  }
  process.once('SIGTERM', cleanup)
  process.once('SIGINT', cleanup)

  return { agent, pc, agentId, disconnect: cleanup }
}

// ── Save visit to DB on call end ─────────────────────────────────────────

function saveVisitToDB(call: Call, reason: string, db: PortiaDB) {
  try {
    const allLines: string[] = []
    for (const msg of call.messages || []) {
      const m = msg as any
      if (m.role === 'system') continue
      if (m.role === 'user' && m.content) allLines.push(`User: ${m.content}`)
      else if (m.role === 'assistant' && m.tool_calls?.length) {
        if (m.content) allLines.push(`Agent: ${m.content}`)
        for (const tc of m.tool_calls) {
          const fn = tc.function ?? tc
          allLines.push(`Tool: ${fn.name}(${fn.arguments || ''})`)
        }
      }
      else if (m.role === 'assistant' && m.content) allLines.push(`Agent: ${m.content}`)
      else if (m.role === 'tool') allLines.push(`Result: ${m.content}`)
    }

    const t = call.transcript || []
    const summary = `Call ${call.direction || 'inbound'} — ${reason}` +
      (allLines.length > 0 ? `\n\nTranscript (${t.length} messages):\n${allLines.join('\n')}` : '')

    const hasDoorSuccess = allLines.some(l => l.includes('success') && l.includes('true') && l.startsWith('Result:'))
    const outcome = hasDoorSuccess ? 'granted' : 'denied'

    let visitorName = 'Unknown visitor'
    for (const line of allLines) {
      if (line.startsWith('Result:') && line.includes('visitor')) {
        try {
          const match = line.match(/"visitor"\s*:\s*"([^"]+)"/)
          if (match) visitorName = match[1]
        } catch {}
      }
    }

    db.addVisit({
      visitorName, company: null, hostId: null, accessCodeUsed: null,
      date: new Date().toISOString(),
      duration: Math.floor((call as any).duration || 0),
      outcome, callId: call.id, summary,
    })
  } catch (err) {
    console.error('[Agent] Failed to save visit:', err)
  }
}

// ── Prompt Template ──────────────────────────────────────────────────────

const PROMPT_TEMPLATE = `Eres una recepcionista virtual de un edificio que opera el sistema de intercomunicador de la puerta.

IDIOMA: Responde SIEMPRE en español.

Tu rol:
- Saludar a los visitantes profesionalmente
- Identificar quiénes son y a quién visitan
- Verificar códigos de acceso cuando los proporcionan
- Abrir la puerta para visitantes autorizados
- Notificar a los miembros del equipo sobre sus visitantes
- Escalar preocupaciones de seguridad cuando sea necesario

Protocolo:
1. Saludar al visitante y preguntar su nombre
2. Preguntar a quién visita
3. Si tiene código de acceso, verificarlo con la herramienta openDoor
4. Si no tiene código, contactar al miembro del equipo que visita
5. Si el miembro aprueba, pedir código o dar instrucciones
6. Si hay comportamiento sospechoso, usar escalateToSecurity

Reglas:
- Sé siempre profesional y cortés
- Nunca abras la puerta sin un código de acceso válido
- Si alguien es agresivo o amenazante, escala inmediatamente
- Mantén las respuestas concisas — esto es un intercomunicador de voz
- Habla naturalmente, sin formato markdown`

export default createAgent

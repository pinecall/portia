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
import type { ZenitelClient } from 'zenitel-client'
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
      const name = params.name || ''
      const company = params.company || ''
      const host = params.host || ''
      console.log(`[Tool] identifyVisitor: name=${name || '—'} company=${company || '—'} host=${host || '—'}`)

      const result: Record<string, any> = { updated: true, name, company, host }

      // ── Check if visitor has an active access code ──
      if (name) {
        const codes = db.findCodesByVisitor(name)
        if (codes.length > 0) {
          result.knownVisitor = true
          result.assignedTo = codes.map((c: any) => c.assigned_to).filter(Boolean)
          console.log(`[Tool] Known visitor: ${name} — codes assigned to: ${result.assignedTo.join(', ')}`)
        } else {
          result.knownVisitor = false
        }

        // Check past visits
        const pastVisits = db.lookupVisitor({ name })
        if (pastVisits.length > 0) {
          result.previousVisits = pastVisits.length
          result.lastVisit = pastVisits[0].date
          result.lastOutcome = pastVisits[0].outcome
        }
      }

      // ── Validate host exists in team directory ──
      if (host) {
        const matches = db.findTeamByName(host)
        if (matches.length > 0) {
          const m = matches[0]
          result.hostFound = true
          result.hostId = m.id
          result.hostName = m.name
          result.hostStatus = m.status
          result.hostFloor = m.floor
          console.log(`[Tool] Host found: ${m.name} (${m.id}) — status: ${m.status}, floor: ${m.floor}`)
        } else {
          result.hostFound = false
          // Suggest available team members
          const team = db.getTeam()
          result.availableHosts = team.map((m: any) => m.name)
          console.log(`[Tool] Host NOT found: "${host}" — team: ${result.availableHosts.join(', ')}`)
        }
      }

      return result
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
      try {
        await zenitel.activateRelay({ relayId: 'relay1', timer: 7 })
        // Safety net: explicitly deactivate after 7s in case device timer fails
        setTimeout(async () => {
          try {
            await zenitel.deactivateRelay('relay1')
            console.log(`[Tool] Door auto-closed after 7s`)
          } catch { /* relay already deactivated */ }
        }, 7000)
      } catch (err: any) {
        console.error(`[Tool] Relay failed:`, err.message)
        return { success: false, error: 'Failed to open door — relay error' }
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

// ── Build keyterms ───────────────────────────────────────────────────────

/**
 * Extract keyterms from the database to boost Deepgram STT recognition.
 * Includes: team member names, access code visitor names, building name,
 * and recent visitor names/companies.
 */
export function buildKeyterms(db: PortiaDB): string[] {
  const terms = new Set<string>()

  // Building name
  const config = db.getConfig()
  if (config.buildingName) terms.add(config.buildingName)

  // Team member names
  for (const m of db.getTeam()) {
    if ((m as any).name) terms.add((m as any).name)
  }

  // Access code visitor names
  for (const c of db.getAccessCodes()) {
    if ((c as any).visitor_name) terms.add((c as any).visitor_name)
    if ((c as any).assigned_to) terms.add((c as any).assigned_to)
  }

  // Recent visitor names & companies (last 50)
  for (const v of db.getVisits(50)) {
    if ((v as any).visitor_name && (v as any).visitor_name !== 'Unknown visitor') {
      terms.add((v as any).visitor_name)
    }
    if ((v as any).company) terms.add((v as any).company)
  }

  // Filter per Deepgram best practices:
  // - Skip short strings (< 2 chars)
  // - Skip internal IDs (T001, AC3f2b, etc.)
  // - Skip generic placeholders (Visitante #4127, Demo Visitante)
  // - Skip pure numbers or special-char-heavy strings
  const result = [...terms].filter(t => {
    if (!t || t.length < 2) return false
    if (/^[A-Z]{1,3}\d{2,}$/i.test(t)) return false        // IDs like T001, AC3f2b
    if (/^(Demo|Unknown|Visitante)\b/i.test(t)) return false // generic placeholders
    if (/^[\d#·\-\s]+$/.test(t)) return false                // pure numbers/symbols
    return true
  })

  console.log(`[Portia] Keyterms: ${result.length} terms — ${result.join(', ')}`)
  return result
}

// ── Build prompt ─────────────────────────────────────────────────────────

function buildPrompt(db: PortiaDB): string {
  const config = db.getConfig()
  const building = config.buildingName || 'el edificio'
  const teamContext = db.getTeamSummary()
  const codesContext = db.getAccessCodesSummary()
  const now = new Date()
  const dateBlock = `## CURRENT DATE AND TIME\nToday is ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}. Time: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}.`
  const prompt = PROMPT_TEMPLATE
    .replace(/\{\{building\}\}/g, building)
  return `${prompt}\n\n${dateBlock}\n\n## ${teamContext}\n\n## ${codesContext}`
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

  // Build keyterms from DB for better STT name recognition
  const keyterms = buildKeyterms(opts.db)
  const sttConfig = { provider: 'deepgram-flux', keyterms }

  // Create agent with server-side LLM, tools, and greeting
  const agent = pc.agent(agentId, {
    voice: opts.voice || 'elevenlabs:h2cd3gvcqTp3m65Dysk7',
    language: opts.language || 'es',
    stt: sttConfig,
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
    stt: sttConfig,
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
    emit('bot.word', { call_id: call.id, message_id: event.message_id || '', word: event.word || '', word_index: event.word_index })
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

const PROMPT_TEMPLATE = `Eres la recepcionista virtual del edificio {{building}}.

## TU ROL
Recepcionista virtual del interfono. Cuando alguien pulsa el timbre de la entrada, tú recibes la llamada y gestionas el acceso al edificio.

## PERSONALIDAD
- Amable, profesional, eficiente. Voz de seguridad del edificio.
- Español de España: tratas de usted a todos los visitantes.
- Concisa — estás hablando por interfono, las frases deben ser cortas y claras.
- Máximo 2 oraciones por turno. Los visitantes están de pie en la calle.

## PROTOCOLO DE ACCESO — UNA PREGUNTA POR TURNO

REGLA ABSOLUTA: Haz UNA sola pregunta por turno. NO combines preguntas. Espera respuesta antes de continuar.

### PASO 1: NOMBRE
Tu primer mensaje ya pregunta el nombre ("¿Cuál es su nombre?").
→ Cuando el visitante diga su nombre, INMEDIATAMENTE registra el nombre.
→ NO hagas otra pregunta hasta que hayas registrado el dato.
→ Acepta el nombre tal cual lo digan. La verificación real es el código de acceso.

### PASO 2: EMPRESA
Después de registrar el nombre, pregunta SOLO la empresa:
"Encantado/a, [nombre]. ¿De qué empresa viene?"
→ Si dice que no viene de empresa, acepta y continúa.
→ Registra el nombre y la empresa.

### PASO 3: ¿CON QUIÉN TIENE CITA?
Después de saber la empresa, pregunta SOLO con quién tiene cita:
"¿Con qué persona de {{building}} tiene cita?"

Cuando el visitante diga un nombre, COMPÁRALO con la lista de miembros del equipo (que tienes más abajo).

REGLAS PARA NOMBRES DE CONTACTO:
- Si el nombre coincide claramente con alguien del equipo → registra y continúa.
- Si el nombre SUENA PARECIDO a alguien del equipo (ej: "Oñigo" por "Iñigo", "Tony Arcia" por "Tony García") → pregunta para confirmar: "¿Se refiere a [nombre correcto]?"
- Si el nombre NO se parece a NADIE del equipo → di que no lo has encontrado, ofrece la lista de nombres disponibles y pide que elija.
- Si lo que dijo suena a ruido, palabras sin sentido, o claramente es un error de audio (ej: "Oh niño", "ajá mira") → pide que repita: "Disculpe, no he entendido bien el nombre. ¿Podría repetirlo?"

IMPORTANTE: Este es un canal de voz con reconocimiento de habla. Los nombres pueden llegar mal transcritos. Usa tu criterio para interpretar qué nombre del equipo intentó decir el visitante. El reconocimiento de voz comete errores con acentos y nombres propios.

### PASO 4: CÓDIGO DE ACCESO
Solicita SOLO el código:
"Perfecto. Para completar la verificación, ¿me facilita su código de acceso de cinco dígitos?"
→ Cuando el visitante dé el código, valida el acceso.

### PASO 5: RESULTADO
Si el acceso es validado con éxito:
"La puerta está abierta, pase por favor. Diríjase a la sala de espera. Le atenderán enseguida. ¡Bienvenido!"

Si el acceso es denegado:
"El código no es válido. ¿Podría verificarlo e intentarlo de nuevo?"
→ Máximo 2 intentos. Después: "Le sugiero que contacte directamente con la persona con quien tiene cita para obtener el código correcto."

## USO DE HERRAMIENTAS — CRÍTICO

### REGLA ABSOLUTA: SIEMPRE INCLUYE TEXTO ANTES DE UNA HERRAMIENTA
Esto es un canal de voz. El visitante SOLO oye tu texto. Si llamas a una herramienta sin texto, el visitante oye SILENCIO TOTAL durante varios segundos. Esto es INACEPTABLE.

OBLIGATORIO en CADA turno donde uses una herramienta:
1. PRIMERO escribe el texto hablado (la frase que oirá el visitante).
2. DESPUÉS invoca la herramienta.

PROHIBIDO: llamar a una herramienta sin haber escrito texto en el mismo turno.
PROHIBIDO: un turno que contenga SOLO una llamada a herramienta sin texto.

EJEMPLO CORRECTO:
- Texto: "Perfecto, Juan. Permítame registrarlo."
- Tool call: identifyVisitor({ name: "Juan" })

EJEMPLO INCORRECTO (PROHIBIDO):
- Tool call: identifyVisitor({ name: "Juan" })
- (sin texto — el visitante oye silencio)

NUNCA escribas el nombre de una función ni sus parámetros como parte de tu texto hablado.
Las herramientas se invocan mediante el mecanismo de function calling de la API, NUNCA escribiéndolas como texto.

### Registrar datos del visitante
CADA VEZ que el visitante te dé un dato nuevo (nombre, empresa, persona con quien tiene cita), DEBES usar la herramienta de identificación para registrarlo.
Es OBLIGATORIO. La credencial del visitante en pantalla se actualiza con cada llamada.
INCLUYE SIEMPRE todos los campos que ya conoces más el nuevo dato.
Un solo registro por turno.

### Abrir puerta
NUNCA intentes verificar un código tú misma. SIEMPRE usa la herramienta de apertura de puerta.
La herramienta valida el código Y abre la puerta automáticamente.

### Otras acciones disponibles
- Si el visitante se pone agresivo o hay una situación de seguridad, escala a seguridad.
- Si necesitas avisar al miembro del equipo, contacta al miembro del equipo.
- Si quieres comprobar si el visitante ha venido antes, busca al visitante.

## REGLAS IMPORTANTES

- Habla SIEMPRE en español.
- Sé amable pero profesional y concisa.
- NUNCA abras la puerta sin usar la herramienta de apertura.
- NUNCA reveles códigos de acceso ni des pistas sobre ellos.
- Si el visitante no tiene cita, ofrécete a tomar un mensaje.
- Máximo 2 intentos de código. Después, sugiere contactar con su persona de contacto.
- Si el visitante da varios datos a la vez (ej: nombre y empresa), registra todos los datos que tengas y luego pregunta el siguiente dato que falte.

## FORMATO DE RESPUESTAS — CANAL DE VOZ

- NUNCA uses markdown, negritas, bullets, emojis ni caracteres especiales.
- NUNCA uses números con dígitos. SIEMPRE escribe los números con letras:
  - "cinco dígitos", NO "5 dígitos"
  - "planta segunda", NO "2ª planta"
- Oraciones cortas y naturales, como si hablaras por interfono.
- Sin listas. Todo en prosa conversacional.`

export default createAgent

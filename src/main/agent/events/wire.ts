/**
 * Wire agent events to renderer via IPC emit.
 *
 * Registers all event listeners on the agent and forwards them
 * as structured JSON to the renderer process.
 *
 * NOTE: Tool execution is handled by the SDK (auto-execute via tool()).
 * We only emit tool events to the renderer for UI updates.
 */

import type { Agent, Call, Turn } from '@pinecall/sdk'
import type {
  UserSpeakingEvent,
  UserMessageEvent,
  TurnPauseEvent,
  TurnResumedEvent,
  BotSpeakingEvent,
  BotWordEvent,
  BotFinishedEvent,
  BotInterruptedEvent,
  ToolCallEvent,
} from '@pinecall/sdk'
import type { PortiaDB } from '@main/db'
import type { CallEvent } from '@shared/ipc-contracts'
import { saveVisitToDB } from '@main/agent/services/visit-recorder.service'
import { getPromptVars } from '@main/agent/prompt/builder'
import { createLogger } from '@main/logger'

const log = createLogger('agent')

interface WireOptions {
  agent: Agent
  greeting: string
  emit: <E extends CallEvent['event']>(event: E, data: Omit<Extract<CallEvent, { event: E }>, 'event'>) => void
  db: PortiaDB
}

export function wireAgentEvents({ agent, greeting, emit, db }: WireOptions): void {
  // Call lifecycle
  agent.on('call.started', (call: Call) => {
    log.info(`Call started: ${call.direction} ${call.from} → ${call.to}`)
    emit('call.started', { call_id: call.id, direction: call.direction, from: call.from || '', to: call.to || '', transport: call.transport || 'phone' })
    db.addEvent({ type: 'sip', date: new Date().toISOString(), source: 'intercom', details: `${call.direction} call: ${call.from || 'unknown'}`, visit_id: null })

    if (call.direction === 'inbound') {
      call.say(greeting)
    }

    // Inject prompt template vars (building, team, codes)
    const promptVars = getPromptVars(db)
    call.setPromptVars(promptVars)
  })

  agent.on('call.ended', (call: Call, reason: string) => {
    log.info(`Call ended: ${call.id} reason=${reason}`)
    emit('call.ended', { call_id: call.id, reason })
    saveVisitToDB(call, reason, db)
  })

  // User speech
  agent.on('user.speaking', (event: UserSpeakingEvent, call: Call) => {
    log.debug(`👤 (interim): ${event.text || ''}`)
    emit('user.speaking', { call_id: call.id, text: event.text || '', message_id: event.messageId || '' })
  })

  agent.on('user.message', (event: UserMessageEvent, call: Call) => {
    log.info(`👤 User: ${event.text || ''}`)
    emit('user.message', { call_id: call.id, text: event.text || '', message_id: event.messageId || '' })
  })

  // Turn detection
  agent.on('turn.pause', (event: TurnPauseEvent, call: Call) => {
    log.debug(`⏸ Turn pause (prob=${event.probability?.toFixed(2) || '?'})`)
    emit('turn.pause', { call_id: call.id, probability: event.probability })
  })

  agent.on('turn.end', (turn: Turn, call: Call) => {
    log.debug(`⏹ Turn end (prob=${turn.probability?.toFixed(2) || '?'})`)
    emit('turn.end', { call_id: call.id, probability: turn.probability })
  })

  agent.on('turn.resumed', (_event: TurnResumedEvent, call: Call) => {
    log.debug('▶ Turn resumed')
    emit('turn.resumed', { call_id: call.id })
  })

  // Bot speech
  agent.on('bot.speaking', (event: BotSpeakingEvent, call: Call) => {
    log.info(`🤖 Speaking: msg=${event.messageId}`)
    emit('bot.speaking', { call_id: call.id, message_id: event.messageId || '', text: event.text || '' })
  })

  agent.on('bot.word', (event: BotWordEvent, call: Call) => {
    emit('bot.word', { call_id: call.id, message_id: event.messageId || '', word: event.word || '', word_index: event.wordIndex })
  })

  agent.on('bot.finished', (event: BotFinishedEvent, call: Call) => {
    log.info(`🤖 Finished: msg=${event.messageId}`)
    emit('bot.finished', { call_id: call.id, message_id: event.messageId || '' })
  })

  agent.on('bot.interrupted', (event: BotInterruptedEvent, call: Call) => {
    log.info(`🤖 Interrupted: msg=${event.messageId}`)
    emit('bot.interrupted', { call_id: call.id, message_id: event.messageId || '' })
  })

  // Tool calls — SDK auto-executes via tool(). We only emit for the renderer UI.
  agent.on('llm.toolCall', (data: ToolCallEvent, call: Call) => {
    const mapped = data.toolCalls.map(tc => ({ name: tc.name, arguments: tc.arguments || '{}' }))
    log.info(`🔧 Tools: ${mapped.map(tc => `${tc.name}(${tc.arguments})`).join(', ')} (msg=${data.msgId})`)
    emit('llm.toolCall', { call_id: call.id, tool_calls: mapped })
  })

  // Tool results — emitted after SDK auto-executes each tool
  agent.on('llm.tool_result', (data: any, call: Call) => {
    const resultText = typeof data.result === 'string' ? data.result : JSON.stringify(data.result ?? '')
    emit('llm.tool_result', { call_id: call.id, result: resultText })
  })
}

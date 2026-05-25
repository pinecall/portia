/**
 * Wire agent events to renderer via IPC emit.
 *
 * Registers all event listeners on the agent and forwards them
 * as structured JSON to the renderer process.
 */

import type { Agent, Call } from '@pinecall/sdk'
import type { PortiaDB } from '@main/db'
import type { ToolContext } from '@main/agent/tools/types'
import type { CallEvent } from '@shared/ipc-contracts'
import { executeTool } from '@main/agent/tools/registry'
import { saveVisitToDB } from '@main/agent/services/visit-recorder.service'
import { createLogger } from '@main/logger'

const log = createLogger('agent')

// Event payload shapes from the SDK (camelCase)
interface SpeechEvent { text?: string; messageId?: string }
interface TurnEvent { probability?: number }
interface BotEvent { messageId?: string; text?: string }
interface BotWordEvent { messageId?: string; word?: string; wordIndex?: number }

interface WireOptions {
  agent: Agent
  ctx: ToolContext
  greeting: string
  emit: <E extends CallEvent['event']>(event: E, data: Omit<Extract<CallEvent, { event: E }>, 'event'>) => void
  db: PortiaDB
}

export function wireAgentEvents({ agent, ctx, greeting, emit, db }: WireOptions): void {
  // Call lifecycle
  agent.on('call.started', (call: Call) => {
    log.info(`Call started: ${call.direction} ${call.from} → ${call.to}`)
    emit('call.started', { call_id: call.id, direction: call.direction, from: call.from || '', to: call.to || '', transport: call.transport || 'phone' })
    db.addEvent({ type: 'sip', date: new Date().toISOString(), source: 'intercom', details: `${call.direction} call: ${call.from || 'unknown'}`, visit_id: null })

    if (call.direction === 'inbound') {
      call.say(greeting)
    }
  })

  agent.on('call.ended', (call: Call, reason: string) => {
    log.info(`Call ended: ${call.id} reason=${reason}`)
    emit('call.ended', { call_id: call.id, reason })
    saveVisitToDB(call, reason, db)
  })

  // User speech
  agent.on('user.speaking', (event: SpeechEvent, call: Call) => {
    log.debug(`👤 (interim): ${event.text || ''}`)
    emit('user.speaking', { call_id: call.id, text: event.text || '', message_id: event.message_id || '' })
  })

  agent.on('user.message', (event: SpeechEvent, call: Call) => {
    log.info(`👤 User: ${event.text || ''}`)
    emit('user.message', { call_id: call.id, text: event.text || '', message_id: event.message_id || '' })
  })

  // Turn detection
  agent.on('turn.pause', (event: TurnEvent, call: Call) => {
    log.debug(`⏸ Turn pause (prob=${event.probability?.toFixed(2) || '?'})`)
    emit('turn.pause', { call_id: call.id, probability: event.probability })
  })

  agent.on('turn.end', (event: TurnEvent, call: Call) => {
    log.debug(`⏹ Turn end (prob=${event.probability?.toFixed(2) || '?'})`)
    emit('turn.end', { call_id: call.id, probability: event.probability })
  })

  agent.on('turn.resumed', (_event: unknown, call: Call) => {
    log.debug('▶ Turn resumed')
    emit('turn.resumed', { call_id: call.id })
  })

  // Bot speech
  agent.on('bot.speaking', (event: BotEvent, call: Call) => {
    log.info(`🤖 Speaking: msg=${event.messageId}`)
    emit('bot.speaking', { call_id: call.id, message_id: event.messageId || '', text: event.text || '' })
  })

  agent.on('bot.word', (event: BotWordEvent, call: Call) => {
    emit('bot.word', { call_id: call.id, message_id: event.messageId || '', word: event.word || '', word_index: event.wordIndex })
  })

  agent.on('bot.finished', (event: BotEvent, call: Call) => {
    log.info(`🤖 Finished: msg=${event.messageId}`)
    emit('bot.finished', { call_id: call.id, message_id: event.messageId || '' })
  })

  agent.on('bot.interrupted', (event: BotEvent, call: Call) => {
    log.info(`🤖 Interrupted: msg=${event.messageId}`)
    emit('bot.interrupted', { call_id: call.id, message_id: event.messageId || '' })
  })

  // Tool calls — execute locally, send results back to server
  agent.on('llm.tool_call', async (data, call: Call) => {
    log.info(`🔧 Tools: ${data.toolCalls.map(tc => tc.name).join(', ')} (msg=${data.msgId})`)
    emit('llm.tool_call', { call_id: call.id, tool_calls: data.toolCalls.map(tc => ({ name: tc.name, arguments: tc.arguments || '{}' })) })

    const results: Array<{ toolCallId: string; result: unknown }> = []
    for (const tc of data.toolCalls) {
      let result: unknown
      try {
        const args = JSON.parse(tc.arguments || '{}')
        result = await executeTool(tc.name, args, call, ctx)
      } catch (err: unknown) {
        result = { error: err instanceof Error ? err.message : String(err) }
      }
      log.info(`✅ ${tc.name}: ${JSON.stringify(result).slice(0, 100)}`)
      emit('llm.tool_result', { call_id: call.id, result: JSON.stringify(result) })
      results.push({ toolCallId: tc.id, result })
    }

    call.toolResult(data.msgId, results)
  })
}

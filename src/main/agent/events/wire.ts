/**
 * Wire agent events to renderer via IPC emit.
 *
 * Registers all event listeners on the agent and forwards them
 * as structured JSON to the renderer process.
 */

import type { Agent, Call } from '@pinecall/core'
import type { PortiaDB } from '@main/db'
import type { ToolContext } from '@main/agent/tools/types'
import { executeTool } from '@main/agent/tools/registry'
import { saveVisitToDB } from '@main/db/repos/visit-recorder'

interface WireOptions {
  agent: Agent
  ctx: ToolContext
  greeting: string
  emit: (event: string, data: Record<string, unknown>) => void
  db: PortiaDB
}

export function wireAgentEvents({ agent, ctx, greeting, emit, db }: WireOptions): void {
  // Call lifecycle
  agent.on('call.started', (call: Call) => {
    console.log(`[agent] Call started: ${call.direction} ${call.from} → ${call.to}`)
    emit('call.started', { call_id: call.id, direction: call.direction, from: call.from || '', to: call.to || '', transport: call.transport || 'phone' })
    db.addEvent({ type: 'sip', date: new Date().toISOString(), source: 'intercom', details: `${call.direction} call: ${call.from || 'unknown'}`, visit_id: null })

    if (call.direction === 'inbound') {
      call.say(greeting)
    }
  })

  agent.on('call.ended', (call: Call, reason: string) => {
    console.log(`[agent] Call ended: ${call.id} reason=${reason}`)
    emit('call.ended', { call_id: call.id, reason })
    saveVisitToDB(call, reason, db)
  })

  // User speech
  agent.on('user.speaking', (event: any, call: Call) => {
    console.log(`  👤 (interim): ${event.text || ''}`)
    emit('user.speaking', { call_id: call.id, text: event.text || '', message_id: event.message_id || '' })
  })

  agent.on('user.message', (event: any, call: Call) => {
    console.log(`  👤 User: ${event.text || ''}`)
    emit('user.message', { call_id: call.id, text: event.text || '', message_id: event.message_id || '' })
  })

  // Turn detection
  agent.on('turn.pause', (event: any, call: Call) => {
    console.log(`  ⏸ Turn pause (prob=${event.probability?.toFixed(2) || '?'})`)
    emit('turn.pause', { call_id: call.id, probability: event.probability })
  })

  agent.on('turn.end', (event: any, call: Call) => {
    console.log(`  ⏹ Turn end (prob=${event.probability?.toFixed(2) || '?'})`)
    emit('turn.end', { call_id: call.id, probability: event.probability })
  })

  agent.on('turn.resumed', (event: any, call: Call) => {
    console.log(`  ▶ Turn resumed`)
    emit('turn.resumed', { call_id: call.id })
  })

  // Bot speech
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
  agent.on('llm.tool_call' as any, async (call: Call, data: any) => {
    const toolCalls = data?.tool_calls as Array<{ id: string; name: string; arguments: string }>
    if (!toolCalls) return

    const msgId = data.msg_id as string
    console.log(`  🔧 Tools: ${toolCalls.map(tc => tc.name).join(', ')} (msg=${msgId})`)
    emit('llm.tool_call', { call_id: call.id, tool_calls: toolCalls.map(tc => ({ name: tc.name, arguments: tc.arguments || '{}' })) })

    const results: Array<{ tool_call_id: string; result: unknown }> = []
    for (const tc of toolCalls) {
      let result: unknown
      try {
        const args = JSON.parse(tc.arguments || '{}')
        result = await executeTool(tc.name, args, call, ctx)
      } catch (err: any) {
        result = { error: err.message }
      }
      console.log(`  ✅ ${tc.name}: ${JSON.stringify(result).slice(0, 100)}`)
      emit('llm.tool_result', { call_id: call.id, result: JSON.stringify(result) })
      results.push({ tool_call_id: tc.id, result })
    }

    agent.send({
      event: 'llm.tool_result',
      call_id: call.id,
      msg_id: msgId,
      results,
    })
  })
}

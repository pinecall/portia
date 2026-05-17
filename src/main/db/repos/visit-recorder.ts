/**
 * Visit Recorder — saves visit to DB on call end.
 *
 * Extracts visitor info from call messages and tool results
 * instead of parsing text with regex.
 */

import type { Call } from '@pinecall/core'
import type { PortiaDB } from '@main/db'

export function saveVisitToDB(call: Call, reason: string, db: PortiaDB): void {
  try {
    const allLines: string[] = []
    let visitorName = 'Unknown visitor'
    let hasDoorSuccess = false

    for (const msg of call.messages || []) {
      const m = msg as any
      if (m.role === 'system') continue

      if (m.role === 'user' && m.content) {
        allLines.push(`User: ${m.content}`)
      } else if (m.role === 'assistant' && m.tool_calls?.length) {
        if (m.content) allLines.push(`Agent: ${m.content}`)
        for (const tc of m.tool_calls) {
          const fn = tc.function ?? tc
          allLines.push(`Tool: ${fn.name}(${fn.arguments || ''})`)
        }
      } else if (m.role === 'assistant' && m.content) {
        allLines.push(`Agent: ${m.content}`)
      } else if (m.role === 'tool') {
        allLines.push(`Result: ${m.content}`)
        // Extract visitor name and door status from tool results
        try {
          const parsed = JSON.parse(m.content)
          if (parsed.visitor && typeof parsed.visitor === 'string') {
            visitorName = parsed.visitor
          }
          if (parsed.success === true && parsed.visitor) {
            hasDoorSuccess = true
          }
        } catch { /* not JSON, skip */ }
      }
    }

    const t = call.transcript || []
    const summary = `Call ${call.direction || 'inbound'} — ${reason}` +
      (allLines.length > 0 ? `\n\nTranscript (${t.length} messages):\n${allLines.join('\n')}` : '')

    const outcome = hasDoorSuccess ? 'granted' : 'denied'

    db.addVisit({
      visitorName, company: null, hostId: null, accessCodeUsed: null,
      date: new Date().toISOString(),
      duration: Math.floor((call as any).duration || 0),
      outcome, callId: call.id, summary,
    })
  } catch (err) {
    console.error('[agent] Failed to save visit:', err)
  }
}

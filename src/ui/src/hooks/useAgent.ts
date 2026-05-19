import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Live call state — driven by IPC events from the agent in main process.
 * Equivalent to Julia's useCallManager() but uses Electron IPC instead of WebSocket.
 */

const STAGES = [
  'Incoming call',    // 0 — SIP ringing
  'Greeting',         // 1 — Agent greets
  'Identification',   // 2 — Visitor gives name/company
  'Host lookup',      // 3 — Visitor names host
  'Access code',      // 4 — Visitor gives code
  'Verification',     // 5 — openDoor tool call in flight
  'Access granted',   // 6 — openDoor returned success
]

export { STAGES }

export interface LiveCall {
  id: string
  status: 'active' | 'ended'
  direction: string
  from: string
  to: string
  transport: string
  startedAt: Date
  stage: number
  extracted: { name?: string; company?: string; host?: string; code?: string }
  doorOpen: boolean
  messages: CallMessage[]
  endReason: string | null
}

export interface CallMessage {
  role: 'user' | 'bot' | 'tool_call' | 'tool_result'
  text: string
  time: Date
  isInterim?: boolean
  finalized?: boolean
  status?: 'pause' | 'end' | null
  probability?: number
  toolName?: string
  messageId?: string
  words?: string[]
  speaking?: boolean
  interrupted?: boolean
}

function extractFromToolCall(tc: any, prev: any) {
  const extracted = { ...prev }
  let stageHint = -1
  try {
    const args = typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments
    if (tc.name === 'identifyVisitor') {
      if (args.name) extracted.name = args.name
      if (args.company) extracted.company = args.company
      if (args.host) extracted.host = args.host
      if (extracted.host) stageHint = 3
      else if (extracted.name) stageHint = 2
    }
    if (tc.name === 'openDoor') {
      if (args.code) extracted.code = args.code
      stageHint = 5
    }
  } catch {}
  return { extracted, stageHint }
}

export function useAgent() {
  const [liveCall, setLiveCall] = useState<LiveCall | null>(null)
  const [agentConnected, setAgentConnected] = useState(false)
  const lastBotMsgIdRef = useRef<string | null>(null)

  useEffect(() => {
    // Listen for call events from main process
    const unsub = window.portia.on('portia:call-event', (ev: any) => {
      const event = ev.event || ev.type
      const callId = ev.call_id
      if (!event || !callId) return

      // call.started
      if (event === 'call.started') {
        setLiveCall({
          id: callId, status: 'active', direction: ev.direction || 'inbound',
          from: ev.from || 'Intercom', to: ev.to || 'Agent',
          transport: ev.transport || 'sip', startedAt: new Date(),
          stage: 0, extracted: {}, doorOpen: false, messages: [], endReason: null,
        })
        return
      }

      // call.ended
      if (event === 'call.ended') {
        setLiveCall(prev => {
          if (!prev || prev.id !== callId) return prev
          return { ...prev, status: 'ended', endReason: ev.reason || 'hangup' }
        })
        // Clear after 30s
        setTimeout(() => {
          setLiveCall(prev => (prev?.id === callId ? null : prev))
        }, 30000)
        return
      }

      // bot.speaking — create bubble (text may be empty, filled by bot.word)
      if (event === 'bot.speaking') {
        const messageId = ev.message_id || ('bot_' + Date.now())
        lastBotMsgIdRef.current = messageId
        setLiveCall(prev => {
          if (!prev || prev.id !== callId) return prev
          const messages = [...prev.messages, {
            role: 'bot' as const, text: ev.text || '…',
            time: new Date(), messageId, speaking: true,
          }]
          let stage = prev.stage
          if (stage === 0) stage = 1
          return { ...prev, messages, stage }
        })
        return
      }

      // bot.word — append word to existing bubble (word-by-word streaming)
      if (event === 'bot.word' && ev.word) {
        setLiveCall(prev => {
          if (!prev || prev.id !== callId) return prev
          const targetId = ev.message_id || lastBotMsgIdRef.current
          const found = prev.messages.some(m => m.messageId === targetId)
          if (!found) {
            // Auto-create bubble if bot.speaking was missed
            lastBotMsgIdRef.current = targetId
            const messages = [...prev.messages, {
              role: 'bot' as const, text: ev.word,
              time: new Date(), messageId: targetId, speaking: true,
            }]
            let stage = prev.stage
            if (stage === 0) stage = 1
            return { ...prev, messages, stage }
          }
          const messages = prev.messages.map(m => {
            if (m.messageId !== targetId) return m
            const words = [...(m.words || [])]
            const idx = ev.word_index ?? words.length
            if (idx >= words.length) words.push(ev.word)
            else words[idx] = ev.word
            return { ...m, words, text: words.join(' ') }
          })
          return { ...prev, messages }
        })
        return
      }

      // bot.finished — mark speaking=false (do NOT overwrite text from bot.word)
      if (event === 'bot.finished') {
        setLiveCall(prev => {
          if (!prev || prev.id !== callId) return prev
          const targetId = ev.message_id || lastBotMsgIdRef.current
          const messages = prev.messages.map(m =>
            m.messageId === targetId ? { ...m, speaking: false } : m
          )
          return { ...prev, messages }
        })
        return
      }

      // bot.interrupted
      if (event === 'bot.interrupted') {
        setLiveCall(prev => {
          if (!prev || prev.id !== callId) return prev
          const targetId = ev.message_id || lastBotMsgIdRef.current
          const messages = prev.messages.map(m =>
            m.messageId === targetId ? { ...m, speaking: false, interrupted: true } : m
          )
          return { ...prev, messages }
        })
        return
      }

      // user.speaking (interim)
      if (event === 'user.speaking' && ev.text) {
        setLiveCall(prev => {
          if (!prev || prev.id !== callId) return prev
          const messages = [...prev.messages]
          const idx = messages.findLastIndex(m => m.role === 'user' && m.isInterim)
          if (idx >= 0) {
            messages[idx] = { ...messages[idx], text: ev.text }
          } else {
            messages.push({ role: 'user', text: ev.text, time: new Date(), isInterim: true })
          }
          return { ...prev, messages }
        })
        return
      }

      // user.message (final)
      if (event === 'user.message' && ev.text) {
        setLiveCall(prev => {
          if (!prev || prev.id !== callId) return prev
          const messages = [...prev.messages]
          const idx = messages.findLastIndex(m => m.role === 'user' && m.isInterim)
          if (idx >= 0) {
            messages[idx] = { ...messages[idx], text: ev.text, isInterim: false }
          } else {
            messages.push({ role: 'user', text: ev.text, time: new Date(), isInterim: false })
          }
          return { ...prev, messages }
        })
        return
      }

      // turn.pause — mark last user message as paused (yellow)
      if (event === 'turn.pause') {
        setLiveCall(prev => {
          if (!prev || prev.id !== callId) return prev
          const messages = [...prev.messages]
          const idx = messages.findLastIndex(m => m.role === 'user' && !m.finalized)
          if (idx < 0) return prev
          messages[idx] = { ...messages[idx], status: 'pause', probability: ev.probability, isInterim: false }
          return { ...prev, messages }
        })
        return
      }

      // turn.end — mark last user message as finalized (green)
      if (event === 'turn.end') {
        setLiveCall(prev => {
          if (!prev || prev.id !== callId) return prev
          const messages = [...prev.messages]
          const idx = messages.findLastIndex(m => m.role === 'user' && !m.finalized)
          if (idx < 0) return prev
          messages[idx] = { ...messages[idx], status: 'end', probability: ev.probability, finalized: true, isInterim: false }
          return { ...prev, messages }
        })
        return
      }

      // turn.resumed — clear pause status, user is still speaking
      if (event === 'turn.resumed') {
        setLiveCall(prev => {
          if (!prev || prev.id !== callId) return prev
          const messages = [...prev.messages]
          const idx = messages.findLastIndex(m => m.role === 'user' && !m.finalized)
          if (idx < 0) return prev
          messages[idx] = { ...messages[idx], status: null, finalized: false }
          return { ...prev, messages }
        })
        return
      }

      // llm.tool_call
      if (event === 'llm.tool_call') {
        const toolCalls = ev.tool_calls || []
        setLiveCall(prev => {
          if (!prev || prev.id !== callId) return prev
          let messages = [...prev.messages]
          let stage = prev.stage
          let extracted = { ...prev.extracted }

          for (const tc of toolCalls) {
            messages.push({ role: 'tool_call', text: `${tc.name}(${tc.arguments || '{}'})`, time: new Date(), toolName: tc.name })
            const info = extractFromToolCall(tc, extracted)
            extracted = info.extracted
            if (info.stageHint > stage) stage = info.stageHint
          }
          return { ...prev, messages, stage, extracted }
        })
        return
      }

      // llm.tool_result
      if (event === 'llm.tool_result') {
        const resultText = typeof ev.result === 'string' ? ev.result : JSON.stringify(ev.result ?? '')
        setLiveCall(prev => {
          if (!prev || prev.id !== callId) return prev
          const messages = [...prev.messages, { role: 'tool_result' as const, text: resultText, time: new Date() }]
          let stage = prev.stage
          let doorOpen = prev.doorOpen

          if (resultText.includes('"success":true') || resultText.includes('"success": true')) {
            doorOpen = true
            stage = 6
          }
          return { ...prev, messages, stage, doorOpen }
        })
        return
      }
    })

    // Listen for agent status
    const unsub2 = window.portia.on('portia:agent-status', (status: any) => {
      setAgentConnected(status.status === 'connected')
    })

    return () => { unsub(); unsub2() }
  }, [])

  return { liveCall, agentConnected, STAGES }
}

/** Elapsed time counter hook */
export function useElapsed(startTime: Date | null | undefined) {
  const [elapsed, setElapsed] = useState('0:00')

  useEffect(() => {
    if (!startTime) return
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)
      setElapsed(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(id)
  }, [startTime])

  return elapsed
}

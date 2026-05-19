/**
 * Tests for visit-recorder — verifies outcome extraction from call messages.
 *
 * Tests the core logic: parsing tool results to determine
 * visitor name and granted/denied outcome.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PortiaDB } from '@main/db'
import { saveVisitToDB } from '@main/agent/services/visit-recorder.service'

let db: PortiaDB

beforeEach(async () => {
  db = await PortiaDB.createForTesting()
})

function makeCall(overrides: Record<string, unknown> = {}) {
  return {
    id: 'call-001',
    direction: 'inbound',
    transcript: [],
    messages: [],
    ...overrides,
  } as any
}

describe('saveVisitToDB', () => {
  it('saves a visit with granted outcome when openDoor succeeds', () => {
    const call = makeCall({
      messages: [
        { role: 'user', content: 'I have code 12345' },
        { role: 'assistant', tool_calls: [{ function: { name: 'openDoor', arguments: '{"code":"12345"}' } }] },
        { role: 'tool', content: JSON.stringify({ success: true, visitor: 'Carlos García' }) },
        { role: 'assistant', content: 'Bienvenido, Carlos.' },
      ],
    })

    saveVisitToDB(call, 'completed', db)

    const visits = db.getVisits(1)
    expect(visits).toHaveLength(1)
    expect(visits[0]!.visitor_name).toBe('Carlos García')
    expect(visits[0]!.outcome).toBe('granted')
    expect(visits[0]!.call_id).toBe('call-001')
  })

  it('saves denied outcome when no successful door open', () => {
    const call = makeCall({
      messages: [
        { role: 'user', content: 'No tengo código' },
        { role: 'assistant', content: 'Lo siento, necesitas un código.' },
      ],
    })

    saveVisitToDB(call, 'hangup', db)

    const visits = db.getVisits(1)
    expect(visits).toHaveLength(1)
    expect(visits[0]!.visitor_name).toBe('Unknown visitor')
    expect(visits[0]!.outcome).toBe('denied')
  })

  it('extracts visitor name from identifyVisitor tool result', () => {
    const call = makeCall({
      messages: [
        { role: 'tool', content: JSON.stringify({ visitor: 'Elena Ruiz' }) },
      ],
    })

    saveVisitToDB(call, 'completed', db)

    const visits = db.getVisits(1)
    expect(visits[0]!.visitor_name).toBe('Elena Ruiz')
  })

  it('handles non-JSON tool results gracefully', () => {
    const call = makeCall({
      messages: [
        { role: 'tool', content: 'not-valid-json' },
      ],
    })

    // Should not throw
    saveVisitToDB(call, 'completed', db)

    const visits = db.getVisits(1)
    expect(visits).toHaveLength(1)
    expect(visits[0]!.visitor_name).toBe('Unknown visitor')
  })

  it('generates summary with transcript', () => {
    const call = makeCall({
      messages: [
        { role: 'user', content: 'Hola, soy Ana' },
        { role: 'assistant', content: '¿Tiene código de acceso?' },
      ],
    })

    saveVisitToDB(call, 'completed', db)

    const visits = db.getVisits(1)
    expect(visits[0]!.summary).toContain('User: Hola, soy Ana')
    expect(visits[0]!.summary).toContain('Agent: ¿Tiene código de acceso?')
  })

  it('skips system messages in summary', () => {
    const call = makeCall({
      messages: [
        { role: 'system', content: 'You are Portia.' },
        { role: 'user', content: 'Buenos días' },
      ],
    })

    saveVisitToDB(call, 'completed', db)

    const visits = db.getVisits(1)
    expect(visits[0]!.summary).not.toContain('You are Portia')
    expect(visits[0]!.summary).toContain('User: Buenos días')
  })
})

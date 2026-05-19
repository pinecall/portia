/**
 * Tests for openDoor tool — verifies code validation, relay activation,
 * and error handling with mocked zenitel client and DB.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PortiaDB } from '@main/db'
import { executeTool } from '@main/agent/tools/registry'

let db: PortiaDB

// Mock zenitel client
function createMockZenitel() {
  return {
    activateRelay: vi.fn().mockResolvedValue(undefined),
    deactivateRelay: vi.fn().mockResolvedValue(undefined),
  }
}

// Mock call object (minimal shape needed by tools)
function mockCall() {
  return { id: 'call-001', direction: 'inbound' } as any
}

beforeEach(async () => {
  db = await PortiaDB.createForTesting()
  vi.useFakeTimers()
})

describe('openDoor tool', () => {
  it('opens door with valid access code', async () => {
    db.createAccessCode({ code: '12345', visitorName: 'Luis Pérez', assignedTo: 'Ana Torres' })
    const zenitel = createMockZenitel()

    const result = await executeTool('openDoor', { code: '12345' }, mockCall(), { db, zenitel } as any) as any

    expect(result.success).toBe(true)
    expect(result.visitor).toBe('Luis Pérez')
    expect(zenitel.activateRelay).toHaveBeenCalledWith({ relayId: 'relay1', timer: expect.any(Number) })
  })

  it('rejects invalid access code', async () => {
    const zenitel = createMockZenitel()

    const result = await executeTool('openDoor', { code: '99999' }, mockCall(), { db, zenitel } as any) as any

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid access code')
    expect(zenitel.activateRelay).not.toHaveBeenCalled()
  })

  it('strips non-digit characters from code', async () => {
    db.createAccessCode({ code: '54321', visitorName: 'María Gómez', assignedTo: 'Carlos' })
    const zenitel = createMockZenitel()

    const result = await executeTool('openDoor', { code: '5-43-21' }, mockCall(), { db, zenitel } as any) as any

    expect(result.success).toBe(true)
    expect(result.visitor).toBe('María Gómez')
  })

  it('returns relay error when activation fails', async () => {
    db.createAccessCode({ code: '11111', visitorName: 'Test User', assignedTo: 'Host' })
    const zenitel = createMockZenitel()
    zenitel.activateRelay.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await executeTool('openDoor', { code: '11111' }, mockCall(), { db, zenitel } as any) as any

    expect(result.success).toBe(false)
    expect(result.error).toContain('relay error')
  })

  it('logs door access event on success', async () => {
    db.createAccessCode({ code: '67890', visitorName: 'Pedro Ruiz', assignedTo: 'Admin' })
    const zenitel = createMockZenitel()

    await executeTool('openDoor', { code: '67890' }, mockCall(), { db, zenitel } as any)

    const events = db.getEvents(5)
    const authEvent = events.find(e => e.type === 'auth')
    expect(authEvent).toBeTruthy()
    expect(authEvent!.details).toContain('Pedro Ruiz')
  })

  it('logs error event on failed code', async () => {
    const zenitel = createMockZenitel()

    await executeTool('openDoor', { code: '00000' }, mockCall(), { db, zenitel } as any)

    const events = db.getEvents(5)
    const errEvent = events.find(e => e.type === 'err')
    expect(errEvent).toBeTruthy()
    expect(errEvent!.details).toContain('Code failed: 00000')
  })
})

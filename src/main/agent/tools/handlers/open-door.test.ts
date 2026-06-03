/**
 * Tests for openDoor tool — verifies code validation, relay activation,
 * and error handling with mocked zenitel client and DB.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PortiaDB } from '@main/db'
import { createTools } from '@main/agent/tools/tools'

let db: PortiaDB

function createMockZenitel() {
  return {
    activateRelay: vi.fn().mockResolvedValue(undefined),
    deactivateRelay: vi.fn().mockResolvedValue(undefined),
  }
}

function mockCall() {
  return { id: 'call-001', direction: 'inbound' } as any
}

beforeEach(async () => {
  db = await PortiaDB.createForTesting()
  vi.useFakeTimers()
})

function getOpenDoor(zenitel: any) {
  const tools = createTools({ db, zenitel })
  const t = tools.find(t => t.name === 'openDoor')!
  return t as typeof t & { execute: (args: { code: string }, call: any) => Promise<any> }
}

describe('openDoor tool', () => {
  it('opens door with valid access code', async () => {
    db.createAccessCode({ code: '12345', visitorName: 'Luis Pérez', assignedTo: 'Ana Torres' })
    const zenitel = createMockZenitel()
    const openDoor = getOpenDoor(zenitel)

    const result = await openDoor.execute({ code: '12345' }, mockCall()) as any

    expect(result.success).toBe(true)
    expect(result.visitor).toBe('Luis Pérez')
    expect(zenitel.activateRelay).toHaveBeenCalledWith({ relayId: 'relay1', timer: expect.any(Number) })
  })

  it('rejects invalid access code', async () => {
    const zenitel = createMockZenitel()
    const openDoor = getOpenDoor(zenitel)

    const result = await openDoor.execute({ code: '99999' }, mockCall()) as any

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid access code')
    expect(zenitel.activateRelay).not.toHaveBeenCalled()
  })

  it('strips non-digit characters from code', async () => {
    db.createAccessCode({ code: '54321', visitorName: 'María Gómez', assignedTo: 'Carlos' })
    const zenitel = createMockZenitel()
    const openDoor = getOpenDoor(zenitel)

    const result = await openDoor.execute({ code: '5-43-21' }, mockCall()) as any

    expect(result.success).toBe(true)
    expect(result.visitor).toBe('María Gómez')
  })

  it('returns relay error when activation fails', async () => {
    db.createAccessCode({ code: '11111', visitorName: 'Test User', assignedTo: 'Host' })
    const zenitel = createMockZenitel()
    zenitel.activateRelay.mockRejectedValue(new Error('ECONNREFUSED'))
    const openDoor = getOpenDoor(zenitel)

    const result = await openDoor.execute({ code: '11111' }, mockCall()) as any

    expect(result.success).toBe(false)
    expect(result.error).toContain('relay error')
  })

  it('logs door access event on success', async () => {
    db.createAccessCode({ code: '67890', visitorName: 'Pedro Ruiz', assignedTo: 'Admin' })
    const zenitel = createMockZenitel()
    const openDoor = getOpenDoor(zenitel)

    await openDoor.execute({ code: '67890' }, mockCall())

    const events = db.getEvents(5)
    const authEvent = events.find(e => e.type === 'auth')
    expect(authEvent).toBeTruthy()
    expect(authEvent!.details).toContain('Pedro Ruiz')
  })

  it('logs error event on failed code', async () => {
    const zenitel = createMockZenitel()
    const openDoor = getOpenDoor(zenitel)

    await openDoor.execute({ code: '00000' }, mockCall())

    const events = db.getEvents(5)
    const errEvent = events.find(e => e.type === 'err')
    expect(errEvent).toBeTruthy()
    expect(errEvent!.details).toContain('Code failed: 00000')
  })
})

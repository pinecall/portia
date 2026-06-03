/**
 * Tests for tools — validates tool creation and schema generation.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PortiaDB } from '@main/db'
import { createTools } from '@main/agent/tools/tools'

let db: PortiaDB

const mockZenitel = {
  activateRelay: async () => {},
  deactivateRelay: async () => {},
} as any

beforeEach(async () => {
  db = await PortiaDB.createForTesting()
})

describe('createTools', () => {
  it('creates 5 tools with SDK tool() factory', () => {
    const tools = createTools({ db, zenitel: mockZenitel })
    expect(tools.length).toBe(5)

    for (const t of tools) {
      expect(t.name).toBeTruthy()
      expect(t.description).toBeTruthy()
      expect(t.schema).toBeTruthy()
      expect(typeof t.execute).toBe('function')
    }
  })

  it('tool names match expected list', () => {
    const tools = createTools({ db, zenitel: mockZenitel })
    const names = tools.map(t => t.name)
    expect(names).toEqual([
      'identifyVisitor', 'openDoor', 'lookupVisitor',
      'escalateToSecurity', 'contactTeamMember',
    ])
  })

  it('identifyVisitor has optional params', () => {
    const tools = createTools({ db, zenitel: mockZenitel })
    const identify = tools.find(t => t.name === 'identifyVisitor')!
    expect(identify).toBeDefined()
    // All params are optional — execute with empty object should work
    expect(identify.execute({} as any, {} as any)).resolves.toBeTruthy()
  })

  it('openDoor requires code parameter', () => {
    const tools = createTools({ db, zenitel: mockZenitel })
    const openDoor = tools.find(t => t.name === 'openDoor')!
    expect(openDoor).toBeDefined()
    // Schema requires 'code'
    expect(openDoor.schema.shape).toHaveProperty('code')
  })
})

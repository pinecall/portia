/**
 * Tests for tool registry — validates zod schema enforcement and schema generation.
 */

import { describe, it, expect } from 'vitest'
import { toolSchemas } from '@main/agent/tools/registry'

describe('toolSchemas', () => {
  it('generates valid OpenAI function-calling schemas', () => {
    const schemas = toolSchemas()
    expect(schemas.length).toBe(5)

    for (const schema of schemas) {
      expect(schema.type).toBe('function')
      expect(schema.function.name).toBeTruthy()
      expect(schema.function.description).toBeTruthy()
      expect(schema.function.parameters.type).toBe('object')
    }
  })

  it('openDoor requires code parameter', () => {
    const schemas = toolSchemas()
    const openDoor = schemas.find(s => s.function.name === 'openDoor')!
    expect(openDoor).toBeDefined()
    const params = openDoor.function.parameters as { required: string[] }
    expect(params.required).toContain('code')
  })

  it('identifyVisitor has all optional params', () => {
    const schemas = toolSchemas()
    const identify = schemas.find(s => s.function.name === 'identifyVisitor')!
    expect(identify).toBeDefined()
    const params = identify.function.parameters as { required: string[] }
    expect(params.required).toEqual([])
  })

  it('escalateToSecurity requires reason and urgency', () => {
    const schemas = toolSchemas()
    const escalate = schemas.find(s => s.function.name === 'escalateToSecurity')!
    const params = escalate.function.parameters as { required: string[] }
    expect(params.required).toContain('reason')
    expect(params.required).toContain('urgency')
  })
})

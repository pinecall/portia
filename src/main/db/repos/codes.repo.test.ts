/**
 * Tests for access codes — validates code matching, expiry, and soft delete.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { initDbInMemory } from '@main/db/connection'
import { runMigrations } from '@main/db/migrations'
import { seedConfigDefaults } from '@main/db/repos/config.repo'
import { createAccessCode, getAccessCodes, deleteAccessCode, validateCode } from '@main/db/repos/codes.repo'

beforeEach(async () => {
  await initDbInMemory()
  runMigrations()
  seedConfigDefaults()
})

describe('validateCode', () => {
  it('returns valid=true for active matching code', () => {
    createAccessCode({ code: '12345', visitorName: 'Bernardo', assignedTo: 'T001' })
    const result = validateCode('12345')
    expect(result.valid).toBe(true)
    expect(result.visitor).toBe('Bernardo')
    expect(result.assignedTo).toBe('T001')
  })

  it('returns valid=false for non-existent code', () => {
    const result = validateCode('99999')
    expect(result.valid).toBe(false)
  })

  it('strips non-digits from code input', () => {
    createAccessCode({ code: '12345', visitorName: 'Test', assignedTo: 'T001' })
    const result = validateCode('1-2-3-4-5')
    expect(result.valid).toBe(true)
  })

  it('returns valid=false for expired code', () => {
    createAccessCode({
      code: '11111', visitorName: 'Expired', assignedTo: 'T001',
      expiresAt: '2020-01-01T00:00:00Z',
    })
    const result = validateCode('11111')
    expect(result.valid).toBe(false)
  })

  it('returns valid=false for soft-deleted code', () => {
    createAccessCode({ code: '22222', visitorName: 'Deleted', assignedTo: 'T001' })
    const codes = getAccessCodes()
    const code = codes.find(c => c.code === '22222')
    expect(code).toBeDefined()
    deleteAccessCode(code!.id)
    const result = validateCode('22222')
    expect(result.valid).toBe(false)
  })
})

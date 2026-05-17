/**
 * Access Codes repository — CRUD + validation.
 */

import type { AccessCode, AccessCodeInput, CodeValidation } from '../../../shared/domain'
import { queryAll, queryOne, run } from '../connection'
import { randomBytes } from 'node:crypto'

export function getAccessCodes(): AccessCode[] {
  return queryAll('SELECT * FROM access_codes WHERE active = 1') as unknown as AccessCode[]
}

export function getAllAccessCodes(): AccessCode[] {
  return queryAll('SELECT * FROM access_codes') as unknown as AccessCode[]
}

export function createAccessCode(params: AccessCodeInput): AccessCodeInput & { id: string } {
  const id = 'AC' + randomBytes(4).toString('hex')
  run(
    'INSERT INTO access_codes (id, code, visitor_name, assigned_to, expires_at) VALUES (?, ?, ?, ?, ?)',
    [id, params.code, params.visitorName, params.assignedTo, params.expiresAt || null],
  )
  return { id, ...params }
}

export function deleteAccessCode(id: string): boolean {
  run('UPDATE access_codes SET active = 0 WHERE id = ?', [id])
  return true
}

export function findCodesByVisitor(visitorName: string): AccessCode[] {
  return queryAll(
    'SELECT * FROM access_codes WHERE active = 1 AND LOWER(visitor_name) LIKE LOWER(?)',
    [`%${visitorName}%`],
  ) as unknown as AccessCode[]
}

export function validateCode(code: string): CodeValidation {
  const normalized = code.replace(/\D/g, '').trim()
  const entry = queryOne('SELECT * FROM access_codes WHERE code = ? AND active = 1', [normalized])
  if (!entry) return { valid: false }
  if (entry.expires_at && new Date(entry.expires_at as string) < new Date()) return { valid: false }
  return {
    valid: true,
    visitor: entry.visitor_name as string,
    assignedTo: entry.assigned_to as string,
    codeId: entry.id as string,
  }
}

export function getAccessCodesSummary(): string {
  const codes = getAccessCodes()
  if (codes.length === 0) return 'ACCESS CODES\nNo active access codes.'
  const lines = codes.map(c =>
    `- Code ${c.code}: ${c.visitor_name} (assigned to ${c.assigned_to || '—'})`,
  )
  return `ACCESS CODES\n${lines.join('\n')}`
}

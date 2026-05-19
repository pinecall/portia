/**
 * Access Codes repository — CRUD + validation.
 */

import type { AccessCode, AccessCodeInput, CodeValidation } from '@shared/domain'
import { queryAll, queryOne, run } from '@main/db/connection'
import { randomBytes } from 'node:crypto'

export function getAccessCodes(): AccessCode[] {
  return queryAll<AccessCode>('SELECT * FROM access_codes WHERE active = 1')
}

export function getAllAccessCodes(): AccessCode[] {
  return queryAll<AccessCode>('SELECT * FROM access_codes')
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
  return queryAll<AccessCode>(
    'SELECT * FROM access_codes WHERE active = 1 AND LOWER(visitor_name) LIKE LOWER(?)',
    [`%${visitorName}%`],
  )
}

export function validateCode(code: string): CodeValidation {
  const normalized = code.replace(/\D/g, '').trim()
  const entry = queryOne<AccessCode>('SELECT * FROM access_codes WHERE code = ? AND active = 1', [normalized])
  if (!entry) return { valid: false }
  if (entry.expires_at && new Date(entry.expires_at) < new Date()) return { valid: false }
  return {
    valid: true,
    visitor: entry.visitor_name,
    assignedTo: entry.assigned_to ?? undefined,
    codeId: entry.id,
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

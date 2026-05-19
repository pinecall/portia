/**
 * Tests for keyterms builder — verifies name extraction and filtering.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PortiaDB } from '@main/db'

let db: PortiaDB

beforeEach(async () => {
  db = await PortiaDB.createForTesting()
})

describe('buildKeyterms', () => {
  it('includes building name', async () => {
    db.updateConfig({ buildingName: 'Torre Iberdrola' })
    const { buildKeyterms } = await import('@main/agent/keyterms')
    const terms = buildKeyterms(db)
    expect(terms).toContain('Torre Iberdrola')
  })

  it('includes team member names and parts', async () => {
    db.addTeamMember({ id: 'T1', name: 'Iñigo Linacisoro' })
    const { buildKeyterms } = await import('@main/agent/keyterms')
    const terms = buildKeyterms(db)
    expect(terms).toContain('Iñigo Linacisoro')
    expect(terms).toContain('Iñigo')
    expect(terms).toContain('Linacisoro')
  })

  it('excludes common Spanish words', async () => {
    db.addTeamMember({ id: 'T1', name: 'de la Fuente' })
    const { buildKeyterms } = await import('@main/agent/keyterms')
    const terms = buildKeyterms(db)
    expect(terms).not.toContain('de')
    expect(terms).not.toContain('la')
    expect(terms).toContain('Fuente')
  })

  it('includes access code visitor and assignee names', async () => {
    db.createAccessCode({ code: '12345', visitorName: 'Gabriel Marcos', assignedTo: 'Ana Torres' })
    const { buildKeyterms } = await import('@main/agent/keyterms')
    const terms = buildKeyterms(db)
    expect(terms).toContain('Gabriel Marcos')
    expect(terms).toContain('Ana Torres')
  })
})

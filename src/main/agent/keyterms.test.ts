/**
 * Tests for keyterms builder — verifies name extraction and filtering.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { initDbInMemory } from '@main/db/connection'
import { runMigrations } from '@main/db/migrations'
import { seedConfigDefaults, updateConfig } from '@main/db/repos/config.repo'
import { addTeamMember } from '@main/db/repos/team.repo'
import { createAccessCode } from '@main/db/repos/codes.repo'
import { PortiaDB } from '@main/db'

// Need to build a PortiaDB instance for buildKeyterms
// since it expects the facade. We'll use a trick.
let db: PortiaDB

beforeEach(async () => {
  await initDbInMemory()
  runMigrations()
  seedConfigDefaults()
  // Access the singleton since PortiaDB delegates to repo modules
  db = Object.create(PortiaDB.prototype)
  // Copy all repo methods since they're assigned at the class level
  const tmp = new (PortiaDB as any)()
  Object.assign(db, tmp)
})

describe('buildKeyterms', () => {
  it('includes building name', async () => {
    updateConfig({ buildingName: 'Torre Iberdrola' })
    const { buildKeyterms } = await import('@main/agent/keyterms')
    const terms = buildKeyterms(db)
    expect(terms).toContain('Torre Iberdrola')
  })

  it('includes team member names and parts', async () => {
    addTeamMember({ id: 'T1', name: 'Iñigo Linacisoro' })
    const { buildKeyterms } = await import('@main/agent/keyterms')
    const terms = buildKeyterms(db)
    expect(terms).toContain('Iñigo Linacisoro')
    expect(terms).toContain('Iñigo')
    expect(terms).toContain('Linacisoro')
  })

  it('excludes common Spanish words', async () => {
    addTeamMember({ id: 'T1', name: 'de la Fuente' })
    const { buildKeyterms } = await import('@main/agent/keyterms')
    const terms = buildKeyterms(db)
    expect(terms).not.toContain('de')
    expect(terms).not.toContain('la')
    expect(terms).toContain('Fuente')
  })

  it('includes access code visitor and assignee names', async () => {
    createAccessCode({ code: '12345', visitorName: 'Gabriel Marcos', assignedTo: 'Ana Torres' })
    const { buildKeyterms } = await import('@main/agent/keyterms')
    const terms = buildKeyterms(db)
    expect(terms).toContain('Gabriel Marcos')
    expect(terms).toContain('Ana Torres')
  })
})

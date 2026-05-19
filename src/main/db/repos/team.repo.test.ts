/**
 * Tests for team repo — CRUD operations and fuzzy name search.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PortiaDB } from '@main/db'

let db: PortiaDB

beforeEach(async () => {
  db = await PortiaDB.createForTesting()
})

describe('team repo', () => {
  it('adds and retrieves a team member', () => {
    db.addTeamMember({ id: 'T001', name: 'Iñigo Linacisoro', role: 'CTO', floor: '5' })

    const team = db.getTeam()
    expect(team).toHaveLength(1)
    expect(team[0]!.name).toBe('Iñigo Linacisoro')
    expect(team[0]!.role).toBe('CTO')
    expect(team[0]!.floor).toBe('5')
  })

  it('updates a team member', () => {
    db.addTeamMember({ id: 'T001', name: 'Ana Torres', role: 'Designer' })
    db.updateTeamMember('T001', { role: 'Lead Designer', status: 'in-meeting' })

    const member = db.getTeamMember('T001')
    expect(member).toBeTruthy()
    expect(member!.role).toBe('Lead Designer')
    expect(member!.status).toBe('in-meeting')
  })

  it('deletes a team member', () => {
    db.addTeamMember({ id: 'T001', name: 'Carlos García' })
    db.deleteTeamMember('T001')

    const team = db.getTeam()
    expect(team).toHaveLength(0)
  })

  it('finds team member by name (case-insensitive)', () => {
    db.addTeamMember({ id: 'T001', name: 'Borja Barbero', floor: '3' })
    db.addTeamMember({ id: 'T002', name: 'Oriol Mauri', floor: '4' })

    const matches = db.findTeamByName('borja')
    expect(matches).toHaveLength(1)
    expect(matches[0]!.id).toBe('T001')
  })

  it('returns empty array when name not found', () => {
    db.addTeamMember({ id: 'T001', name: 'Borja Barbero' })

    const matches = db.findTeamByName('Carlos')
    expect(matches).toHaveLength(0)
  })

  it('defaults status to available', () => {
    db.addTeamMember({ id: 'T001', name: 'Test User' })

    const member = db.getTeamMember('T001')
    expect(member!.status).toBe('available')
  })

  it('generates team summary', () => {
    db.addTeamMember({ id: 'T001', name: 'Ana Torres', floor: '2' })
    db.addTeamMember({ id: 'T002', name: 'Luis Pérez', floor: '3', status: 'away' })

    const summary = db.getTeamSummary()
    expect(summary).toContain('Ana Torres')
    expect(summary).toContain('Luis Pérez')
  })
})

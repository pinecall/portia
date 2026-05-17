/**
 * Team repository — CRUD for team members.
 */

import type { TeamMember, TeamMemberInput } from '@shared/domain'
import { queryAll, queryOne, run } from '@main/db/connection'

export function getTeam(): TeamMember[] {
  return queryAll('SELECT * FROM team') as unknown as TeamMember[]
}

export function getTeamMember(id: string): TeamMember | null {
  return queryOne('SELECT * FROM team WHERE id = ?', [id]) as unknown as TeamMember | null
}

export function addTeamMember(member: TeamMemberInput): TeamMemberInput {
  const initials = member.initials || member.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  run(
    'INSERT OR REPLACE INTO team (id, name, role, floor, phone, email, status, initials) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [member.id, member.name, member.role || null, member.floor || null,
     member.phone || null, member.email || null, member.status || 'available', initials],
  )
  return member
}

export function updateTeamMember(id: string, updates: Partial<TeamMemberInput>): boolean | null {
  const allowed = ['status', 'phone', 'email', 'role', 'floor', 'name', 'initials']
  const pairs = Object.entries(updates).filter(([k]) => allowed.includes(k))
  if (pairs.length === 0) return null
  const sets = pairs.map(([k]) => `${k} = ?`).join(', ')
  const vals = [...pairs.map(([, v]) => v), id]
  run(`UPDATE team SET ${sets} WHERE id = ?`, vals)
  return true
}

export function deleteTeamMember(id: string): boolean {
  run('DELETE FROM team WHERE id = ?', [id])
  return true
}

export function findTeamByName(name: string): TeamMember[] {
  return queryAll('SELECT * FROM team WHERE LOWER(name) LIKE LOWER(?)', [`%${name}%`]) as unknown as TeamMember[]
}

export function getTeamSummary(): string {
  const team = getTeam()
  if (team.length === 0) return 'TEAM DIRECTORY\nNo team members configured.'
  const lines = team.map(m =>
    `- ${m.name} (${m.id}): ${m.role || 'Team'}, Floor ${m.floor || '—'}, Status: ${m.status || 'available'}`,
  )
  return `TEAM DIRECTORY\n${lines.join('\n')}`
}

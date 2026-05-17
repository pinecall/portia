import type { ToolHandler } from '../types'

interface ContactArgs { teamMemberId: string; visitorName: string }

export const contactTeamMember: ToolHandler<ContactArgs> = async (params, _call, { db }) => {
  console.log(`[tool] Contact team: ${params.teamMemberId} for ${params.visitorName}`)
  const member = db.getTeamMember(params.teamMemberId)
  if (!member) return { success: false, error: 'Team member not found.' }

  db.addEvent({
    type: 'tool', date: new Date().toISOString(), source: 'agent',
    details: `Notification to ${member.name} — visitor: ${params.visitorName}`, visit_id: null,
  })

  const statusLabels: Record<string, string> = { available: 'available', 'in-meeting': 'in a meeting', away: 'away' }
  return {
    success: true, teamMember: member.name, status: member.status,
    statusLabel: statusLabels[member.status] || member.status, floor: member.floor,
    message: member.status === 'available'
      ? `${member.name} is available and has been notified.`
      : member.status === 'in-meeting'
        ? `${member.name} is in a meeting. They have been notified.`
        : `${member.name} is away. A message has been left.`,
  }
}

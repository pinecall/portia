import { z } from 'zod'
import { defineTool } from '../define-tool'

export const contactTeamMember = defineTool({
  name: 'contactTeamMember',
  description:
    'Notify a team member that their visitor has arrived. ' +
    'Use AFTER the visitor has been identified and verified. ' +
    'Returns the team member\'s current status (available, in-meeting, away).',
  schema: z.object({
    teamMemberId: z.string().describe('Team member ID (e.g. "T001")'),
    visitorName: z.string().describe('Name of the visitor who is waiting'),
    company: z.string().describe('Company of the visitor (optional)').optional(),
  }),
  async handler(params, _call, { db }) {
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
  },
})

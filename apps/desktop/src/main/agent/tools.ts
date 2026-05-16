/**
 * Tool definitions for the Portia intercom agent.
 * Identical to Julia's tools — extracted for reuse.
 */
import type { ToolDef } from '@pinecall/sdk/ai'

export const openDoor: ToolDef = {
  description:
    'Verify the visitor\'s access code and open the building door if valid. ' +
    'Call this ONLY after the visitor provides their 5-digit numeric access code. ' +
    'The tool validates the code against the database and sends DTMF to open the door relay. ' +
    'Returns whether the door was opened successfully and the visitor\'s registered name.',
  params: {
    code: {
      type: 'string',
      description: 'The 5-digit numeric access code provided by the visitor',
    },
  },
  required: ['code'],
}

export const lookupVisitor: ToolDef = {
  description:
    'Search for a visitor in the visit history by name or company. ' +
    'Use this when a returning visitor identifies themselves by name ' +
    'and you want to check if they\'ve visited before. ' +
    'Returns matching past visits with dates, hosts, and outcomes.',
  params: {
    name: { type: 'string', description: 'Visitor name to search for (partial match)' },
    company: { type: 'string', description: 'Company name to search for (partial match)' },
  },
  required: [],
}

export const escalateToSecurity: ToolDef = {
  description:
    'Register a SECURITY INCIDENT for human review. ' +
    'ONLY use for: aggressive visitors, repeated failed access attempts, ' +
    'suspicious behavior, or any situation requiring physical security response. ' +
    'This creates an alert record for the security team.',
  params: {
    reason: { type: 'string', description: 'Clear description of why this situation needs security attention' },
    urgency: { type: 'string', description: '"normal" (routine review), "urgent" (same-day attention), or "critical" (immediate intervention)' },
  },
  required: ['reason', 'urgency'],
}

export const contactTeamMember: ToolDef = {
  description:
    'Notify a team member that their visitor has arrived. ' +
    'Use AFTER the visitor has been identified and verified. ' +
    'Returns the team member\'s current status (available, in-meeting, away).',
  params: {
    teamMemberId: { type: 'string', description: 'Team member ID (e.g. "T001")' },
    visitorName: { type: 'string', description: 'Name of the visitor who is waiting' },
    company: { type: 'string', description: 'Company of the visitor (optional)' },
  },
  required: ['teamMemberId', 'visitorName'],
}

export const identifyVisitor: ToolDef = {
  description:
    'Update the visitor credential card with identified information. ' +
    'Call this EACH TIME you learn a new piece of information about the visitor. ' +
    'Always include ALL previously collected fields plus the new one.',
  params: {
    name: { type: 'string', description: 'Visitor\'s full name' },
    company: { type: 'string', description: 'Visitor\'s company or organization (if mentioned)' },
    host: { type: 'string', description: 'Full name of the team member they are visiting' },
  },
  required: [],
}

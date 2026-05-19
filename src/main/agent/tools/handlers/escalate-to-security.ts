import { z } from 'zod'
import { defineTool } from '../define-tool'
import { createLogger } from '@main/logger'

const log = createLogger('tool')

export const escalateToSecurity = defineTool({
  name: 'escalateToSecurity',
  description:
    'Register a SECURITY INCIDENT for human review. ' +
    'ONLY use for: aggressive visitors, repeated failed access attempts, ' +
    'suspicious behavior, or any situation requiring physical security response. ' +
    'This creates an alert record for the security team.',
  schema: z.object({
    reason: z.string().describe('Clear description of why this situation needs security attention'),
    urgency: z.string().describe('"normal" (routine review), "urgent" (same-day attention), or "critical" (immediate intervention)'),
  }),
  async handler(params, _call, { db }) {
    log.info(`Security escalation: ${params.urgency} — ${params.reason}`)
    db.addEscalation({ reason: params.reason, urgency: params.urgency })
    return { success: true, message: `${params.urgency} security alert registered.` }
  },
})

import type { ToolHandler } from '../types'

interface EscalateArgs { reason: string; urgency: string }

export const escalateToSecurity: ToolHandler<EscalateArgs> = async (params, _call, { db }) => {
  console.log(`[tool] Security escalation: ${params.urgency} — ${params.reason}`)
  const esc = db.addEscalation({ reason: params.reason, urgency: params.urgency })
  return { success: true, escalationId: (esc as any).id, message: `${params.urgency} security alert registered.` }
}

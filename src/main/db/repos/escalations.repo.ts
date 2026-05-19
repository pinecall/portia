/**
 * Escalations repository.
 */

import type { Escalation, EscalationInput } from '@shared/domain'
import { queryAll, run } from '@main/db/connection'

export function getEscalations(): Escalation[] {
  return queryAll<Escalation>('SELECT * FROM escalations')
}

export function addEscalation(params: EscalationInput): EscalationInput {
  run(
    'INSERT INTO escalations (visit_id, reason, urgency, assigned_to) VALUES (?, ?, ?, ?)',
    [params.visitId || null, params.reason, params.urgency, 'Recepción'],
  )
  return params
}

export function resolveEscalation(id: number): void {
  run("UPDATE escalations SET status = 'resolved', resolved_date = datetime('now') WHERE id = ?", [id])
}

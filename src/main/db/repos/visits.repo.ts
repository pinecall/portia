/**
 * Visits repository.
 */

import type { Visit, VisitInput } from '@shared/domain'
import { queryAll, run } from '@main/db/connection'

export function getVisits(limit = 50): Visit[] {
  return queryAll<Visit>('SELECT * FROM visits ORDER BY date DESC LIMIT ?', [limit])
}

export function addVisit(visit: VisitInput): VisitInput {
  run(
    `INSERT INTO visits (visitor_name, company, host_id, access_code_used, duration, outcome, call_id, summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [visit.visitorName, visit.company, visit.hostId, visit.accessCodeUsed,
     visit.duration || 0, visit.outcome || 'pending', visit.callId, visit.summary],
  )
  return visit
}

export function lookupVisitor(params: { name?: string; company?: string }): Visit[] {
  if (params.name) {
    return queryAll<Visit>('SELECT * FROM visits WHERE visitor_name LIKE ? ORDER BY date DESC LIMIT 10', [`%${params.name}%`])
  }
  if (params.company) {
    return queryAll<Visit>('SELECT * FROM visits WHERE company LIKE ? ORDER BY date DESC LIMIT 10', [`%${params.company}%`])
  }
  return []
}

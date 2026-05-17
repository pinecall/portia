/**
 * Keyterms — STT boost words extracted from the database.
 *
 * Improves Deepgram recognition for team names, visitor names,
 * building name, and access code assignees.
 */

import type { PortiaDB } from '@main/db'

export function buildKeyterms(db: PortiaDB): string[] {
  const terms = new Set<string>()

  // Building name
  const config = db.getConfig()
  if (config.buildingName) terms.add(config.buildingName)

  // Team member names
  for (const m of db.getTeam()) {
    if (m.name) terms.add(m.name)
  }

  // Access code visitor names
  for (const c of db.getAccessCodes()) {
    if ((c as any).visitor_name) terms.add((c as any).visitor_name)
    if ((c as any).assigned_to) terms.add((c as any).assigned_to)
  }

  // Recent visitor names & companies (last 50)
  for (const v of db.getVisits(50)) {
    if ((v as any).visitor_name && (v as any).visitor_name !== 'Unknown visitor') {
      terms.add((v as any).visitor_name)
    }
    if ((v as any).company) terms.add((v as any).company)
  }

  // Filter per Deepgram best practices
  const result = [...terms].filter(t => {
    if (!t || t.length < 2) return false
    if (/^[A-Z]{1,3}\d{2,}$/i.test(t)) return false
    if (/^(Demo|Unknown|Visitante)\b/i.test(t)) return false
    if (/^[\d#·\-\s]+$/.test(t)) return false
    return true
  })

  console.log(`[agent] Keyterms: ${result.length} terms — ${result.join(', ')}`)
  return result
}

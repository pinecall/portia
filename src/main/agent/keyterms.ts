/**
 * Keyterms — STT boost words extracted from the database.
 *
 * Improves Deepgram recognition for team names, visitor names,
 * building name, and access code assignees.
 */

import type { PortiaDB } from '@main/db'
import { KEYTERMS_VISIT_LIMIT } from '@main/constants'
import { createLogger } from '@main/logger'

const log = createLogger('agent')

export function buildKeyterms(db: PortiaDB): string[] {
  const terms = new Set<string>()

  // Building name
  const config = db.getConfig()
  if (config.buildingName) terms.add(config.buildingName)

  // Team member names — add full name + individual parts
  // Deepgram Flux keyterms treat multi-word phrases as cohesive units,
  // so "Iñigo Linacisoro" only boosts when both words appear together.
  // We add individual parts so "Iñigo" alone is also recognized.
  for (const m of db.getTeam()) {
    if (m.name) {
      terms.add(m.name)
      addNameParts(terms, m.name)
    }
  }

  // Access code visitor names
  for (const c of db.getAccessCodes()) {
    if (c.visitor_name) {
      terms.add(c.visitor_name)
      addNameParts(terms, c.visitor_name)
    }
    if (c.assigned_to) {
      terms.add(c.assigned_to)
      addNameParts(terms, c.assigned_to)
    }
  }

  // Recent visitor names & companies (last 50)
  for (const v of db.getVisits(KEYTERMS_VISIT_LIMIT)) {
    if (v.visitor_name && v.visitor_name !== 'Unknown visitor') {
      terms.add(v.visitor_name)
      addNameParts(terms, v.visitor_name)
    }
    if (v.company) terms.add(v.company)
  }

  // Filter per Deepgram best practices
  const result = [...terms].filter(t => {
    if (!t || t.length < 2) return false
    if (/^[A-Z]{1,3}\d{2,}$/i.test(t)) return false
    if (/^(Demo|Unknown|Visitante)\b/i.test(t)) return false
    if (/^[\d#·\-\s]+$/.test(t)) return false
    // Skip very common Spanish words that don't need boosting
    if (COMMON_WORDS.has(t.toLowerCase())) return false
    return true
  })

  log.info(`Keyterms: ${result.length} terms — ${result.join(', ')}`)
  return result
}

// Common words that don't need STT boosting — skip to stay under Deepgram's
// recommended 20-50 focused terms.
const COMMON_WORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'con', 'por',
  'para', 'a', 'un', 'una', 'es', 'son', 'no', 'si', 'se',
])

/**
 * Split a full name into individual parts and add each one.
 * "Iñigo Linacisoro" → adds "Iñigo" and "Linacisoro"
 * Skips common prepositions (de, del, la) that appear in names.
 */
function addNameParts(terms: Set<string>, fullName: string): void {
  const parts = fullName.split(/\s+/)
  if (parts.length <= 1) return // Single word, already added as full name
  for (const part of parts) {
    const clean = part.trim()
    if (clean.length >= 3 && !COMMON_WORDS.has(clean.toLowerCase())) {
      terms.add(clean)
    }
  }
}

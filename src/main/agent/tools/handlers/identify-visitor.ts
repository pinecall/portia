import { z } from 'zod'
import { defineTool } from '../define-tool'
import { createLogger } from '@main/logger'

const log = createLogger('tool')

export const identifyVisitor = defineTool({
  name: 'identifyVisitor',
  description:
    'Update the visitor credential card with identified information. ' +
    'Call this EACH TIME you learn a new piece of information about the visitor. ' +
    'Always include ALL previously collected fields plus the new one.',
  schema: z.object({
    name: z.string().describe("Visitor's full name").optional(),
    company: z.string().describe("Visitor's company or organization (if mentioned)").optional(),
    host: z.string().describe('Full name of the team member they are visiting').optional(),
  }),
  async handler(params, _call, { db }) {
    const name = params.name || ''
    const company = params.company || ''
    const host = params.host || ''
    log.info(`identifyVisitor: name=${name || '—'} company=${company || '—'} host=${host || '—'}`)

    const result: Record<string, unknown> = { updated: true, name, company, host }

    // Check if visitor has an active access code
    if (name) {
      const codes = db.findCodesByVisitor(name)
      if (codes.length > 0) {
        result.knownVisitor = true
        result.assignedTo = codes.map(c => c.assigned_to).filter(Boolean)
        log.info(`Known visitor: ${name} — codes assigned to: ${(result.assignedTo as string[]).join(', ')}`)
      } else {
        result.knownVisitor = false
      }

      // Check past visits
      const pastVisits = db.lookupVisitor({ name })
      if (pastVisits.length > 0) {
        const latest = pastVisits[0]!
        result.previousVisits = pastVisits.length
        result.lastVisit = latest.date
        result.lastOutcome = latest.outcome
      }
    }

    // Validate host exists in team directory
    if (host) {
      const matches = db.findTeamByName(host)
      if (matches.length > 0) {
        const m = matches[0]!
        result.hostFound = true
        result.hostId = m.id
        result.hostName = m.name
        result.hostStatus = m.status
        result.hostFloor = m.floor
        log.info(`Host found: ${m.name} (${m.id}) — status: ${m.status}, floor: ${m.floor}`)
      } else {
        result.hostFound = false
        const team = db.getTeam()
        result.availableHosts = team.map(m => m.name)
        log.info(`Host NOT found: "${host}" — team: ${(result.availableHosts as string[]).join(', ')}`)
      }
    }

    return result
  },
})

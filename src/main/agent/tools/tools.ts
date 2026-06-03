/**
 * Portia Tools — SDK tool() factory with closure-based context.
 *
 * Uses @pinecall/sdk's tool() directly (like boni/blossom),
 * no custom zodToJsonSchema or define-tool wrapper.
 *
 * Context (db, zenitel) is captured via closure in createTools().
 */

import { tool } from '@pinecall/sdk'
import { z } from 'zod'
import type { PortiaDB } from '@main/db'
import type { TcivClient } from 'tciv-client'
import { ENV } from '@main/config/env'
import { createLogger } from '@main/logger'

const log = createLogger('tool')

export interface ToolContext {
  db: PortiaDB
  zenitel: TcivClient
}

export function createTools(ctx: ToolContext) {
  const { db, zenitel } = ctx

  // ── identifyVisitor ──────────────────────────────────────────────────
  const identifyVisitor = tool({
    name: 'identifyVisitor',
    description:
      'Update the visitor credential card with identified information. ' +
      'Call this EACH TIME you learn a new piece of information about the visitor. ' +
      'Always include ALL previously collected fields plus the new one.',
    schema: z.object({
      name: z.string().describe("Visitor's full name"),
      company: z.string().describe("Visitor's company or organization (if mentioned)").optional(),
      host: z.string().describe('Full name of the team member they are visiting').optional(),
    }),
    execute: async (params) => {
      const name = params.name || ''
      const company = params.company || ''
      const host = params.host || ''
      log.info(`identifyVisitor: name=${name || '—'} company=${company || '—'} host=${host || '—'}`)

      const result: Record<string, unknown> = { updated: true, name, company, host }

      if (name) {
        const codes = db.findCodesByVisitor(name)
        if (codes.length > 0) {
          result.knownVisitor = true
          result.assignedTo = codes.map(c => c.assigned_to).filter(Boolean)
          log.info(`Known visitor: ${name} — codes assigned to: ${(result.assignedTo as string[]).join(', ')}`)
        } else {
          result.knownVisitor = false
        }

        const pastVisits = db.lookupVisitor({ name })
        if (pastVisits.length > 0) {
          const latest = pastVisits[0]!
          result.previousVisits = pastVisits.length
          result.lastVisit = latest.date
          result.lastOutcome = latest.outcome
        }
      }

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

  // ── openDoor ─────────────────────────────────────────────────────────
  const openDoor = tool({
    name: 'openDoor',
    description:
      'Verify the visitor\'s access code and open the building door if valid. ' +
      'Call this ONLY after the visitor provides their 5-digit numeric access code. ' +
      'The tool validates the code against the database and sends DTMF to open the door relay. ' +
      'Returns whether the door was opened successfully and the visitor\'s registered name.',
    schema: z.object({
      code: z.string().describe('The 5-digit numeric access code provided by the visitor'),
    }),
    execute: async (params) => {
      const normalized = params.code.replace(/\D/g, '').trim()
      log.info(`openDoor: code="${normalized}"`)
      const result = db.validateCode(normalized)
      if (!result.valid) {
        db.addEvent({ type: 'err', date: new Date().toISOString(), source: 'agent', details: `Code failed: ${normalized}`, visit_id: null })
        return { success: false, error: 'Invalid access code' }
      }
      log.info(`Valid code for: ${result.visitor} — opening door`)
      try {
        const timerSec = Math.round(ENV.RELAY_TIMER_MS / 1000)
        await zenitel.activateRelay({ relayId: 'relay1', timer: timerSec })
        setTimeout(async () => {
          try {
            await zenitel.deactivateRelay('relay1')
            log.info(`Door auto-closed after ${timerSec}s`)
          } catch { /* relay already deactivated */ }
        }, ENV.RELAY_TIMER_MS)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        log.error('Relay failed:', msg)
        return { success: false, error: 'Failed to open door — relay error' }
      }
      db.addEvent({ type: 'auth', date: new Date().toISOString(), source: 'agent', details: `Code ${normalized} validated: ${result.visitor}`, visit_id: null })
      return { success: true, visitor: result.visitor, message: `Door opened for ${result.visitor}` }
    },
  })

  // ── lookupVisitor ────────────────────────────────────────────────────
  const lookupVisitor = tool({
    name: 'lookupVisitor',
    description:
      'Search for a visitor in the visit history by name or company. ' +
      'Use this when a returning visitor identifies themselves by name ' +
      'and you want to check if they\'ve visited before. ' +
      'Returns matching past visits with dates, hosts, and outcomes.',
    schema: z.object({
      name: z.string().describe('Visitor name to search for (partial match)').optional(),
      company: z.string().describe('Company name to search for (partial match)').optional(),
    }),
    execute: async (params) => {
      const visits = db.lookupVisitor(params)
      if (visits.length === 0) return { found: false, message: 'No previous visits found.' }
      const team = db.getTeam()
      return {
        found: true,
        visits: visits.map(v => {
          const host = team.find(m => m.id === v.host_id)
          return { visitorName: v.visitor_name, company: v.company, host: host?.name || '—', date: v.date, outcome: v.outcome }
        }),
      }
    },
  })

  // ── escalateToSecurity ───────────────────────────────────────────────
  const escalateToSecurity = tool({
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
    execute: async (params) => {
      log.info(`Security escalation: ${params.urgency} — ${params.reason}`)
      db.addEscalation({ reason: params.reason, urgency: params.urgency })
      return { success: true, message: `${params.urgency} security alert registered.` }
    },
  })

  // ── contactTeamMember ────────────────────────────────────────────────
  const contactTeamMember = tool({
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
    execute: async (params) => {
      log.info(`Contact team: ${params.teamMemberId} for ${params.visitorName}`)
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

  return [identifyVisitor, openDoor, lookupVisitor, escalateToSecurity, contactTeamMember]
}

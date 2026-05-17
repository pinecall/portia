import type { ToolHandler } from '../types'

interface IdentifyArgs { name?: string; company?: string; host?: string }

export const identifyVisitor: ToolHandler<IdentifyArgs> = async (params, _call, { db }) => {
  const name = params.name || ''
  const company = params.company || ''
  const host = params.host || ''
  console.log(`[tool] identifyVisitor: name=${name || '—'} company=${company || '—'} host=${host || '—'}`)

  const result: Record<string, unknown> = { updated: true, name, company, host }

  // Check if visitor has an active access code
  if (name) {
    const codes = db.findCodesByVisitor(name)
    if (codes.length > 0) {
      result.knownVisitor = true
      result.assignedTo = codes.map((c: any) => c.assigned_to).filter(Boolean)
      console.log(`[tool] Known visitor: ${name} — codes assigned to: ${(result.assignedTo as string[]).join(', ')}`)
    } else {
      result.knownVisitor = false
    }

    // Check past visits
    const pastVisits = db.lookupVisitor({ name })
    if (pastVisits.length > 0) {
      result.previousVisits = pastVisits.length
      result.lastVisit = (pastVisits[0] as any).date
      result.lastOutcome = (pastVisits[0] as any).outcome
    }
  }

  // Validate host exists in team directory
  if (host) {
    const matches = db.findTeamByName(host)
    if (matches.length > 0) {
      const m = matches[0]
      result.hostFound = true
      result.hostId = m.id
      result.hostName = m.name
      result.hostStatus = m.status
      result.hostFloor = m.floor
      console.log(`[tool] Host found: ${m.name} (${m.id}) — status: ${m.status}, floor: ${m.floor}`)
    } else {
      result.hostFound = false
      const team = db.getTeam()
      result.availableHosts = team.map(m => m.name)
      console.log(`[tool] Host NOT found: "${host}" — team: ${(result.availableHosts as string[]).join(', ')}`)
    }
  }

  return result
}

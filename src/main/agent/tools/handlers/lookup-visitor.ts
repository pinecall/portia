import type { ToolHandler } from '../types'

interface LookupArgs { name?: string; company?: string }

export const lookupVisitor: ToolHandler<LookupArgs> = async (params, _call, { db }) => {
  const visits = db.lookupVisitor(params)
  if (visits.length === 0) return { found: false, message: 'No previous visits found.' }
  const team = db.getTeam()
  return {
    found: true,
    visits: visits.map((v: any) => {
      const host = team.find(m => m.id === v.host_id)
      return { visitorName: v.visitor_name, company: v.company, host: host?.name || '—', date: v.date, outcome: v.outcome }
    }),
  }
}

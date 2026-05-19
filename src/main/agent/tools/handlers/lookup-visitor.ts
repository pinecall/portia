import { z } from 'zod'
import { defineTool } from '../define-tool'

export const lookupVisitor = defineTool({
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
  async handler(params, _call, { db }) {
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

/**
 * Stats repository — dashboard aggregates.
 */

import type { DashboardStats, Visit } from '@shared/domain'
import { queryAll, queryOne } from '@main/db/connection'

interface CountRow { n: number }

export function getDashboardStats(): DashboardStats {
  const today = new Date().toISOString().split('T')[0]
  const todayVisits = queryAll<Visit>('SELECT * FROM visits WHERE date LIKE ?', [`${today}%`])
  const granted = todayVisits.filter(v => v.outcome === 'granted')
  const denied = todayVisits.filter(v => v.outcome === 'denied')
  const totalDuration = todayVisits.reduce((s, v) => s + (v.duration || 0), 0)
  const pending = queryOne<CountRow>("SELECT COUNT(*) as n FROM escalations WHERE status = 'pending'")

  return {
    visitsToday: todayVisits.length,
    granted: granted.length,
    denied: denied.length,
    avgDuration: todayVisits.length > 0 ? Math.round(totalDuration / todayVisits.length) : 0,
    resolution: todayVisits.length > 0 ? Math.round((granted.length / todayVisits.length) * 100) : 100,
    pendingEscalations: pending?.n ?? 0,
    totalVisits: queryOne<CountRow>('SELECT COUNT(*) as n FROM visits')?.n ?? 0,
    activeTeam: queryOne<CountRow>("SELECT COUNT(*) as n FROM team WHERE status = 'available'")?.n ?? 0,
    totalTeam: queryOne<CountRow>('SELECT COUNT(*) as n FROM team')?.n ?? 0,
  }
}

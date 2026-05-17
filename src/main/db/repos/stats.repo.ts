/**
 * Stats repository — dashboard aggregates.
 */

import type { DashboardStats } from '@shared/domain'
import { queryAll, queryOne } from '@main/db/connection'

export function getDashboardStats(): DashboardStats {
  const today = new Date().toISOString().split('T')[0]
  const todayVisits = queryAll('SELECT * FROM visits WHERE date LIKE ?', [`${today}%`])
  const granted = todayVisits.filter(v => v.outcome === 'granted')
  const denied = todayVisits.filter(v => v.outcome === 'denied')
  const totalDuration = todayVisits.reduce((s, v) => s + ((v.duration as number) || 0), 0)
  const pending = queryOne("SELECT COUNT(*) as n FROM escalations WHERE status = 'pending'")

  return {
    visitsToday: todayVisits.length,
    granted: granted.length,
    denied: denied.length,
    avgDuration: todayVisits.length > 0 ? Math.round(totalDuration / todayVisits.length) : 0,
    resolution: todayVisits.length > 0 ? Math.round((granted.length / todayVisits.length) * 100) : 100,
    pendingEscalations: (pending?.n as number) || 0,
    totalVisits: ((queryOne('SELECT COUNT(*) as n FROM visits'))?.n as number) || 0,
    activeTeam: ((queryOne("SELECT COUNT(*) as n FROM team WHERE status = 'available'"))?.n as number) || 0,
    totalTeam: ((queryOne('SELECT COUNT(*) as n FROM team'))?.n as number) || 0,
  }
}

import { useState, useEffect } from 'react'
import { UserCheck, RefreshCw } from 'lucide-react'

export default function VisitorsPage() {
  const [visits, setVisits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    window.portia.invoke('db:visitors:list', 100).then(v => { setVisits(v); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  return (
    <div className="page">
      <div className="page-header">
        <h1>Visitors</h1>
        <button className="btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>

      <div className="crud-table-wrap">
        <table className="crud-table">
          <thead>
            <tr><th>Visitor</th><th>Company</th><th>Host</th><th>Duration</th><th>Outcome</th><th>Date</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="crud-empty">Loading...</td></tr>}
            {!loading && visits.length === 0 && (
              <tr><td colSpan={6} className="crud-empty"><UserCheck size={20} /> No visits recorded yet</td></tr>
            )}
            {visits.map((v, i) => (
              <tr key={v.id || i}>
                <td className="cell-primary">{v.visitor_name || 'Unknown'}</td>
                <td>{v.company || '—'}</td>
                <td>{v.host_id || '—'}</td>
                <td className="cell-mono">{v.duration ? `${v.duration}s` : '—'}</td>
                <td><span className={`badge ${v.outcome === 'granted' ? 'ok' : v.outcome === 'denied' ? 'danger' : ''}`}>{v.outcome || 'pending'}</span></td>
                <td className="cell-date">{v.date ? new Date(v.date).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

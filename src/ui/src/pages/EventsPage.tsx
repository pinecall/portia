import { useState, useEffect } from 'react'
import { FileText, RefreshCw } from 'lucide-react'

const TYPE_CLASS: Record<string, string> = { sip: '', auth: 'ok', dtmf: 'warn', err: 'danger', tool: '', ws: '' }

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    window.portia.invoke('db:events:list', 200).then(e => { setEvents(e); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  return (
    <div className="page">
      <div className="page-header">
        <h1>Events</h1>
        <button className="btn-ghost btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
      </div>

      <div className="crud-table-wrap">
        <table className="crud-table">
          <thead>
            <tr><th>Type</th><th>Source</th><th>Details</th><th>Date</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="crud-empty">Loading...</td></tr>}
            {!loading && events.length === 0 && (
              <tr><td colSpan={4} className="crud-empty"><FileText size={20} /> No events recorded</td></tr>
            )}
            {events.map((e, i) => (
              <tr key={e.id || i}>
                <td><span className={`badge ${TYPE_CLASS[e.type] || ''}`}>{e.type}</span></td>
                <td>{e.source || '—'}</td>
                <td className="cell-details">{e.details || '—'}</td>
                <td className="cell-date">{e.date ? new Date(e.date).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

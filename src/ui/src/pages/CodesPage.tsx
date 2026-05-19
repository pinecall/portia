import { useState, useEffect } from 'react'
import { Plus, Trash2, Check, X, Key } from 'lucide-react'

export default function CodesPage() {
  const [codes, setCodes] = useState<any[]>([])
  const [team, setTeam] = useState<any[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ code: '', visitorName: '', assignedTo: '' })

  const load = () => {
    window.portia.invoke('db:codes:list').then(setCodes)
    window.portia.invoke('db:team:list').then(setTeam)
  }
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!form.code.trim() || !form.visitorName.trim()) return
    await window.portia.invoke('db:codes:create', form)
    setForm({ code: '', visitorName: '', assignedTo: '' })
    setAdding(false)
    load()
  }

  const remove = async (id: string) => {
    await window.portia.invoke('db:codes:delete', id)
    load()
  }

  const teamName = (id: string) => team.find(m => m.id === id)?.name || id || '—'

  return (
    <div className="page">
      <div className="page-header">
        <h1>Access Codes</h1>
        <button className="btn-primary btn-sm" onClick={() => setAdding(!adding)}>
          <Plus size={14} /> New Code
        </button>
      </div>

      {adding && (
        <div className="crud-form">
          <input className="input" placeholder="5-digit code *" maxLength={5} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.replace(/\D/g, '').slice(0, 5) })} autoFocus />
          <input className="input" placeholder="Visitor name *" value={form.visitorName} onChange={e => setForm({ ...form, visitorName: e.target.value })} />
          <select className="input" value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value })}>
            <option value="">Assign to team member...</option>
            {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <div className="crud-form-actions">
            <button className="btn-primary btn-sm" onClick={add} disabled={form.code.length < 5 || !form.visitorName}><Check size={14} /> Create</button>
            <button className="btn-ghost btn-sm" onClick={() => setAdding(false)}><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      <div className="crud-table-wrap">
        <table className="crud-table">
          <thead>
            <tr><th>Code</th><th>Visitor</th><th>Assigned To</th><th>Status</th><th>Created</th><th></th></tr>
          </thead>
          <tbody>
            {codes.length === 0 && (
              <tr><td colSpan={6} className="crud-empty"><Key size={20} /> No access codes</td></tr>
            )}
            {codes.map(c => (
              <tr key={c.id} className={c.active ? '' : 'inactive'}>
                <td className="cell-mono">{c.active ? c.code : '•••••'}</td>
                <td className="cell-primary">{c.visitor_name}</td>
                <td>{teamName(c.assigned_to)}</td>
                <td><span className={`badge ${c.active ? 'ok' : 'danger'}`}>{c.active ? 'Active' : 'Revoked'}</span></td>
                <td className="cell-date">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                <td className="crud-actions">
                  {c.active && (
                    <button className="btn-icon danger" onClick={() => remove(c.id)} title="Revoke"><Trash2 size={14} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

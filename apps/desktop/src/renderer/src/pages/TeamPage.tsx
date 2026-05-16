import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit2, Check, X, Users } from 'lucide-react'

const STATUS_OPTIONS = ['available', 'in-meeting', 'away'] as const
const STATUS_LABELS: Record<string, string> = { available: 'Available', 'in-meeting': 'In Meeting', away: 'Away' }
const STATUS_CLASS: Record<string, string> = { available: 'ok', 'in-meeting': 'warn', away: 'danger' }

export default function TeamPage() {
  const [team, setTeam] = useState<any[]>([])
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', role: '', floor: '', phone: '', email: '', status: 'available' })

  const load = () => window.portia.invoke('db:team:list').then(setTeam)
  useEffect(() => { load() }, [])

  const add = async () => {
    if (!form.name.trim()) return
    const id = 'T' + Math.random().toString(36).slice(2, 6).toUpperCase()
    await window.portia.invoke('db:team:add', { id, ...form })
    setForm({ name: '', role: '', floor: '', phone: '', email: '', status: 'available' })
    setAdding(false)
    load()
  }

  const update = async (id: string) => {
    await window.portia.invoke('db:team:update', id, form)
    setEditId(null)
    load()
  }

  const remove = async (id: string) => {
    await window.portia.invoke('db:team:delete', id)
    load()
  }

  const startEdit = (m: any) => {
    setEditId(m.id)
    setForm({ name: m.name, role: m.role || '', floor: m.floor || '', phone: m.phone || '', email: m.email || '', status: m.status || 'available' })
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Team</h1>
        <button className="btn-primary btn-sm" onClick={() => { setAdding(!adding); setEditId(null) }}>
          <Plus size={14} /> Add Member
        </button>
      </div>

      {adding && (
        <div className="crud-form">
          <input className="input" placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
          <input className="input" placeholder="Role" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} />
          <input className="input" placeholder="Floor" value={form.floor} onChange={e => setForm({ ...form, floor: e.target.value })} />
          <input className="input" placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <input className="input" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <div className="crud-form-actions">
            <button className="btn-primary btn-sm" onClick={add}><Check size={14} /> Save</button>
            <button className="btn-ghost btn-sm" onClick={() => setAdding(false)}><X size={14} /> Cancel</button>
          </div>
        </div>
      )}

      <div className="crud-table-wrap">
        <table className="crud-table">
          <thead>
            <tr><th>Name</th><th>Role</th><th>Floor</th><th>Status</th><th>Phone</th><th></th></tr>
          </thead>
          <tbody>
            {team.length === 0 && (
              <tr><td colSpan={6} className="crud-empty"><Users size={20} /> No team members yet</td></tr>
            )}
            {team.map(m => editId === m.id ? (
              <tr key={m.id} className="editing">
                <td><input className="input-inline" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></td>
                <td><input className="input-inline" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} /></td>
                <td><input className="input-inline" value={form.floor} onChange={e => setForm({ ...form, floor: e.target.value })} /></td>
                <td>
                  <select className="input-inline" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </td>
                <td><input className="input-inline" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></td>
                <td className="crud-actions">
                  <button className="btn-icon ok" onClick={() => update(m.id)}><Check size={14} /></button>
                  <button className="btn-icon" onClick={() => setEditId(null)}><X size={14} /></button>
                </td>
              </tr>
            ) : (
              <tr key={m.id}>
                <td className="cell-primary">{m.name}<span className="cell-sub">{m.initials}</span></td>
                <td>{m.role || '—'}</td>
                <td>{m.floor || '—'}</td>
                <td><span className={`badge ${STATUS_CLASS[m.status] || ''}`}>{STATUS_LABELS[m.status] || m.status}</span></td>
                <td className="cell-mono">{m.phone || '—'}</td>
                <td className="crud-actions">
                  <button className="btn-icon" onClick={() => startEdit(m)}><Edit2 size={14} /></button>
                  <button className="btn-icon danger" onClick={() => remove(m.id)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

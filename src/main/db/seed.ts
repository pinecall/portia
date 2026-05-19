/**
 * Portia — Auto-Seed Module
 *
 * Seeds the database with demo data on first launch.
 * Uses fictional data — no real names or credentials.
 */

import type { PortiaDB } from './index'

export function seedDemoData(db: PortiaDB): void {
  // ── Config ──────────────────────────────────────────────────────────────
  db.updateConfig({
    buildingName: 'Demo Building',
    language: 'en',
  })

  // ── Team Members ────────────────────────────────────────────────────────
  const team = [
    { id: 'T001', name: 'Alice Johnson', role: 'Office Manager', floor: '2nd Floor', phone: '+1555000001', email: 'alice@example.com', status: 'available', initials: 'AJ' },
    { id: 'T002', name: 'Bob Chen', role: 'Engineer', floor: '2nd Floor', phone: '+1555000002', email: 'bob@example.com', status: 'in-meeting', initials: 'BC' },
    { id: 'T003', name: 'Carol López', role: 'Designer', floor: '1st Floor', phone: '+1555000003', email: 'carol@example.com', status: 'available', initials: 'CL' },
    { id: 'T004', name: 'David Kim', role: 'Intern', floor: '1st Floor', phone: '+1555000004', email: 'david@example.com', status: 'away', initials: 'DK' },
  ]
  for (const m of team) {
    db.addTeamMember(m)
  }

  // ── Access Codes ────────────────────────────────────────────────────────
  const codes = [
    { code: '12345', visitorName: 'Jane Doe', assignedTo: 'T001' },
    { code: '54321', visitorName: 'Mark Smith', assignedTo: 'T003' },
    { code: '11111', visitorName: 'Sarah Connor', assignedTo: 'T001' },
    { code: '22222', visitorName: 'Demo Visitor', assignedTo: 'T002' },
  ]
  for (const c of codes) {
    db.createAccessCode(c)
  }

  // ── Sample Visits ───────────────────────────────────────────────────────
  const visits = [
    { visitor_name: 'Mark Smith', company: 'Acme Corp', host_id: 'T003', access_code_used: '54321', duration: 48, outcome: 'granted', call_id: null, summary: 'Access granted — normal visit' },
    { visitor_name: 'Courier #42', company: 'FedEx', host_id: null, access_code_used: null, duration: 22, outcome: 'granted', call_id: null, summary: 'Package delivery — quick access' },
    { visitor_name: 'Unknown Visitor', company: null, host_id: null, access_code_used: null, duration: 31, outcome: 'denied', call_id: null, summary: 'No valid code — access denied' },
    { visitor_name: 'Sarah Connor', company: null, host_id: 'T001', access_code_used: '11111', duration: 65, outcome: 'granted', call_id: null, summary: 'Access granted — normal visit' },
  ]
  for (const v of visits) {
    db.addVisit(v)
  }

  // ── Sample Events ───────────────────────────────────────────────────────
  const events = [
    { type: 'sip', source: 'intercom', details: 'Inbound SIP call', visit_id: null },
    { type: 'auth', source: 'portia', details: 'Code 54321 validated — Mark Smith', visit_id: null },
    { type: 'dtmf', source: 'portia', details: 'DTMF relay → door OPEN (3.0s)', visit_id: null },
    { type: 'sip', source: 'intercom', details: 'Inbound SIP call', visit_id: null },
    { type: 'err', source: 'portia', details: 'Code validation failed — 2 attempts exhausted', visit_id: null },
  ]
  for (const e of events) {
    db.addEvent(e)
  }

  db.flush()
}

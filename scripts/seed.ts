/**
 * Portia — Seed Script
 *
 * Populates the local SQLite DB with Cointel demo data (from Julia).
 * Usage: npm run seed
 */

import { PortiaDB } from '../src/main/db'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DB_PATH = join(homedir(), 'Library', 'Application Support', 'portia-desktop', 'portia.db')

async function seed() {
  console.log(`🌱 Seeding Portia DB at: ${DB_PATH}`)
  const db = await PortiaDB.create(DB_PATH)

  // Clear existing data (preserves config)
  db.clearAll()
  console.log('  ✓ Cleared existing data')

  // ── Config ──────────────────────────────────────────────────────────────
  db.updateConfig({
    buildingName: 'Cointel',
    language: 'es',
  })
  console.log('  ✓ Config: buildingName=Cointel')

  // ── Team Members ────────────────────────────────────────────────────────
  const team = [
    { id: 'T001', name: 'Iñigo Linacisoro', role: 'Comercial Senior', floor: '2ª planta', phone: '+34600000001', email: 'inigo@cointel.es', status: 'available', initials: 'IL' },
    { id: 'T002', name: 'Tony García', role: 'Comercial', floor: '2ª planta', phone: '+34600000002', email: 'tony@cointel.es', status: 'in-meeting', initials: 'TG' },
    { id: 'T003', name: 'Alberto Ruiz', role: 'Comercial', floor: '1ª planta', phone: '+34600000003', email: 'alberto@cointel.es', status: 'available', initials: 'AR' },
    { id: 'T004', name: 'Iker Mendoza', role: 'Comercial Junior', floor: '1ª planta', phone: '+34600000004', email: 'iker@cointel.es', status: 'away', initials: 'IM' },
  ]
  for (const m of team) {
    db.addTeamMember(m)
  }
  console.log(`  ✓ Team: ${team.length} members`)

  // ── Access Codes ────────────────────────────────────────────────────────
  const codes = [
    { code: '12345', visitorName: 'Bernardo de Pinecall', assignedTo: 'T001' },
    { code: '54321', visitorName: 'Oriol Mauri', assignedTo: 'T003' },
    { code: '11111', visitorName: 'Borja Barbero', assignedTo: 'T001' },
    { code: '22222', visitorName: 'Demo Visitante', assignedTo: 'T002' },
  ]
  for (const c of codes) {
    db.createAccessCode(c)
  }
  console.log(`  ✓ Access codes: ${codes.length}`)

  // ── Sample Visits ───────────────────────────────────────────────────────
  const visits = [
    { visitor_name: 'Oriol Mauri', company: 'Dastions', host_id: 'T003', access_code_used: '54321', duration: 48, outcome: 'granted', call_id: null, summary: 'Visita concedida — acceso normal' },
    { visitor_name: 'Pedro · SEUR', company: 'Mensajería', host_id: null, access_code_used: null, duration: 22, outcome: 'granted', call_id: null, summary: 'Entrega de mensajería — acceso rápido' },
    { visitor_name: 'Visitante #4127', company: null, host_id: null, access_code_used: null, duration: 31, outcome: 'denied', call_id: null, summary: 'Sin código válido — acceso denegado' },
    { visitor_name: 'Borja Barbero', company: 'Cointel', host_id: 'T001', access_code_used: '11111', duration: 65, outcome: 'granted', call_id: null, summary: 'Visita concedida — acceso normal' },
  ]
  for (const v of visits) {
    db.addVisit(v)
  }
  console.log(`  ✓ Visits: ${visits.length} sample records`)

  // ── Sample Events ───────────────────────────────────────────────────────
  const events = [
    { type: 'sip', source: 'intercom', details: 'Inbound SIP call · ext 222', visit_id: null },
    { type: 'auth', source: 'portia', details: 'Code 54321 validated · Oriol Mauri', visit_id: null },
    { type: 'dtmf', source: 'portia', details: 'DTMF #6 → door relay OPEN (3.0s)', visit_id: null },
    { type: 'sip', source: 'intercom', details: 'Inbound SIP call · ext 222', visit_id: null },
    { type: 'err', source: 'portia', details: 'Code validation failed · 2 attempts exhausted', visit_id: null },
  ]
  for (const e of events) {
    db.addEvent(e)
  }
  console.log(`  ✓ Events: ${events.length} sample records`)

  db.close()
  console.log('\n✅ Seed complete!')
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})

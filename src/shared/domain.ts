/**
 * Portia — Domain types shared between main and renderer processes.
 *
 * These are the canonical type definitions for all entities in the system.
 * Both the DB layer and IPC contracts reference these types.
 */

// ── Config ───────────────────────────────────────────────────────────────

export interface AppConfig {
  zenitelHost: string
  zenitelUser: string
  zenitelPassword: string
  zenitelHasCamera: boolean
  pinecallApiKey: string
  agentPhone: string
  buildingName: string
  language: string
  wizardCompleted: boolean
  theme: string
  // Dynamic fields (stored in config KV but not always present)
  agentId?: string | null
  sipId?: string | null
  sipDomain?: string | null
  // Agent voice/AI config
  agentVoice?: string | null
  agentLlmEngine?: string | null
  agentLlmModel?: string | null
  agentSttProvider?: string | null
  agentTtsProvider?: string | null
  agentTurnDetection?: string | null
}

// ── Team ─────────────────────────────────────────────────────────────────

export interface TeamMember {
  id: string
  name: string
  role: string | null
  floor: string | null
  phone: string | null
  email: string | null
  status: 'available' | 'in-meeting' | 'away'
  initials: string | null
}

export interface TeamMemberInput {
  id: string
  name: string
  role?: string
  floor?: string
  phone?: string
  email?: string
  status?: string
  initials?: string
}

// ── Access Codes ─────────────────────────────────────────────────────────

export interface AccessCode {
  id: string
  code: string
  visitor_name: string
  assigned_to: string | null
  created_at: string
  expires_at: string | null
  active: number // 0 | 1
}

export interface AccessCodeInput {
  code: string
  visitorName: string
  assignedTo: string
  expiresAt?: string
}

export interface CodeValidation {
  valid: boolean
  visitor?: string
  assignedTo?: string
  codeId?: string
}

// ── Visits ───────────────────────────────────────────────────────────────

export interface Visit {
  id: number
  visitor_name: string | null
  company: string | null
  host_id: string | null
  access_code_used: string | null
  date: string
  duration: number
  outcome: 'pending' | 'granted' | 'denied'
  call_id: string | null
  summary: string | null
}

export interface VisitInput {
  visitorName: string
  company: string | null
  hostId: string | null
  accessCodeUsed: string | null
  date?: string
  duration?: number
  outcome?: string
  callId?: string
  summary?: string
}

// ── Events ───────────────────────────────────────────────────────────────

export interface AppEvent {
  id: number
  type: string
  date: string
  source: string | null
  details: string | null
  visit_id: string | null
}

export interface EventInput {
  type: string
  date?: string
  source?: string
  details?: string
  visit_id?: string | null
}

// ── Escalations ──────────────────────────────────────────────────────────

export interface Escalation {
  id: number
  visit_id: string | null
  reason: string
  urgency: 'low' | 'normal' | 'high'
  status: 'pending' | 'resolved'
  date: string
  assigned_to: string | null
  resolved_date: string | null
}

export interface EscalationInput {
  reason: string
  urgency: string
  visitId?: string
}

// ── Dashboard Stats ──────────────────────────────────────────────────────

export interface DashboardStats {
  visitsToday: number
  granted: number
  denied: number
  avgDuration: number
  resolution: number
  pendingEscalations: number
  totalVisits: number
  activeTeam: number
  totalTeam: number
}

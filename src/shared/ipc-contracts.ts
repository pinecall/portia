/**
 * Portia — IPC Contracts
 *
 * Type-safe channel definitions for Electron IPC.
 * Maps every invoke channel to its request args and response type.
 *
 * Usage in handlers:  defineHandler('zenitel:scan', async () => ...)
 * Usage in renderer:  window.portia.invoke('zenitel:scan')
 */

import type {
  AppConfig, TeamMember, TeamMemberInput, AccessCode, AccessCodeInput,
  Visit, VisitInput, AppEvent, Escalation, DashboardStats,
} from './domain'

// ── Channel Map ──────────────────────────────────────────────────────────

export interface IpcChannelMap {
  // Zenitel
  'zenitel:scan':           { args: void; result: Array<{ ip: string; model?: string; firmware?: string; hasCamera?: boolean }> }
  'zenitel:info':           { args: void; result: Record<string, unknown> }
  'zenitel:test':           { args: void; result: { reachable: boolean; webcallEnabled?: boolean; model?: string } }
  'zenitel:relay':          { args: string | { action?: string; relayId?: string; timer?: number }; result: void }
  'zenitel:sip:get':        { args: void; result: Record<string, unknown> }
  'zenitel:sip:set':        { args: Record<string, unknown>; result: void }
  'zenitel:webcall:enable': { args: void; result: void }
  'zenitel:provision':      { args: void; result: { sipId: string; sipDomain: string; dakAddress: string } }
  'zenitel:reboot':         { args: void; result: void }
  'zenitel:factory-reset':  { args: void; result: void }
  'zenitel:set-mode':       { args: string; result: void }
  'zenitel:wait-reboot':    { args: void; result: { online: boolean } }
  'zenitel:get-settings':   { args: void; result: ZenitelSettings }
  'zenitel:video-url':      { args: void; result: string }
  'zenitel:audio:get':      { args: void; result: Record<string, unknown> }
  'zenitel:audio:set':      { args: Record<string, unknown>; result: void }

  // Database — Visitors
  'db:visitors:list':       { args: number | undefined; result: Visit[] }
  'db:visitors:add':        { args: VisitInput; result: VisitInput }

  // Database — Team
  'db:team:list':           { args: void; result: TeamMember[] }
  'db:team:add':            { args: TeamMemberInput; result: TeamMemberInput }
  'db:team:update':         { args: [string, Partial<TeamMemberInput>]; result: boolean | null }
  'db:team:delete':         { args: string; result: boolean }

  // Database — Codes
  'db:codes:list':          { args: void; result: AccessCode[] }
  'db:codes:create':        { args: AccessCodeInput; result: AccessCodeInput & { id: string } }
  'db:codes:delete':        { args: string; result: boolean }

  // Database — Events & Escalations
  'db:events:list':         { args: number | undefined; result: AppEvent[] }
  'db:escalations:list':    { args: void; result: Escalation[] }
  'db:escalations:resolve': { args: number; result: void }
  'db:stats':               { args: void; result: DashboardStats }

  // Config
  'config:get':             { args: void; result: AppConfig }
  'config:set':             { args: Partial<AppConfig>; result: AppConfig }
  'config:wizard-complete': { args: void; result: boolean }
  'config:reset-wizard':    { args: void; result: boolean }

  // Agent
  'agent:start':            { args: void; result: boolean }
  'agent:stop':             { args: void; result: boolean }
  'agent:status':           { args: void; result: { running: boolean } }

  // SIP
  'sip:detect-ip':          { args: void; result: { ip: string | null; error?: string } }
  'sip:check-ip':           { args: { ip: string }; result: { whitelisted?: boolean; error?: string } }
  'sip:whitelist-ip':       { args: { ip: string; name?: string }; result: { success?: boolean; error?: string } }
}

// ── Derived helpers ──────────────────────────────────────────────────────

export type IpcChannel = keyof IpcChannelMap
export type IpcArgs<C extends IpcChannel> = IpcChannelMap[C]['args']
export type IpcResult<C extends IpcChannel> = IpcChannelMap[C]['result']

// ── Zenitel settings (from get-settings) ─────────────────────────────────

export interface ZenitelSettings {
  mode: string
  model: string
  firmware: string
  webcallEnabled: boolean
  sipDomain: string
  sipNumber: string
  sipRegistered: boolean
}

// ── Call events (main → renderer, via send/on) ───────────────────────────

export type CallEvent =
  | { event: 'call.started'; call_id: string; direction: string; from: string; to: string; transport: string }
  | { event: 'call.ended'; call_id: string; reason: string }
  | { event: 'user.speaking'; call_id: string; text: string; message_id: string }
  | { event: 'user.message'; call_id: string; text: string; message_id: string }
  | { event: 'bot.speaking'; call_id: string; message_id: string; text: string }
  | { event: 'bot.word'; call_id: string; message_id: string; word: string; word_index: number }
  | { event: 'bot.finished'; call_id: string; message_id: string }
  | { event: 'bot.interrupted'; call_id: string; message_id: string }
  | { event: 'llm.tool_call'; call_id: string; tool_calls: Array<{ name: string; arguments: string }> }
  | { event: 'llm.tool_result'; call_id: string; result: string }

export type AgentStatus =
  | { status: 'connected'; sipUri: string }
  | { status: 'error'; error: string }
  | { status: 'disconnected' }

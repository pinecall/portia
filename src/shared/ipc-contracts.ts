/**
 * Portia — IPC contracts with Zod validation.
 *
 * Defines schemas for data crossing the IPC boundary (renderer → main).
 * All IPC handlers that accept user input should validate against these.
 */

import { z } from 'zod'

// ── Agent Configuration (renderer → main via agent:configure) ────────────

export const AgentConfigUpdateSchema = z.object({
  agentVoice: z.string().optional(),
  agentLlmModel: z.string().optional(),
  agentLlmEngine: z.string().optional(),
  agentSttProvider: z.string().optional(),
  agentTtsProvider: z.string().optional(),
  language: z.string().optional(),
  promptPreset: z.string().nullable().optional(),
  customPrompt: z.string().nullable().optional(),
}).strict()

export type AgentConfigUpdate = z.infer<typeof AgentConfigUpdateSchema>

// ── Access Code Creation (renderer → main via db:codes:create) ───────────

export const CreateAccessCodeSchema = z.object({
  code: z.string().min(1),
  visitorName: z.string().min(1),
  assignedTo: z.string().min(1),
  expiresAt: z.string().optional(),
})

export type CreateAccessCodeInput = z.infer<typeof CreateAccessCodeSchema>

// ── Team Member (renderer → main via db:team:add) ────────────────────────

export const TeamMemberInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().optional(),
  floor: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  status: z.enum(['available', 'in-meeting', 'away']).optional(),
  initials: z.string().optional(),
})

export type TeamMemberInputValidated = z.infer<typeof TeamMemberInputSchema>

// ── Call Events (main → renderer via emit) ───────────────────────────────

export type CallEvent =
  | { event: 'call.started'; call_id: string; direction: string; from: string; to: string; transport: string }
  | { event: 'call.ended'; call_id: string; reason: string }
  | { event: 'user.speaking'; call_id: string; text: string; message_id: string }
  | { event: 'user.message'; call_id: string; text: string; message_id: string }
  | { event: 'turn.pause'; call_id: string; probability?: number }
  | { event: 'turn.end'; call_id: string; probability?: number }
  | { event: 'turn.resumed'; call_id: string }
  | { event: 'bot.speaking'; call_id: string; message_id: string; text: string }
  | { event: 'bot.word'; call_id: string; message_id: string; word: string; word_index?: number }
  | { event: 'bot.finished'; call_id: string; message_id: string }
  | { event: 'bot.interrupted'; call_id: string; message_id: string }
  | { event: 'llm.toolCall'; call_id: string; tool_calls: Array<{ name: string; arguments: string }> }
  | { event: 'llm.tool_result'; call_id: string; result: string }

/**
 * Tool Registry — single source of truth for all tools.
 *
 * Imports self-contained tools (schema + handler) and exports
 * the handler map, OpenAI schemas, and execution with validation.
 */

import type { ToolContext } from './types'
import type { Call } from '@pinecall/sdk'
import type { ToolDefinition } from './define-tool'
import { createLogger } from '@main/logger'

const log = createLogger('tool')

import { identifyVisitor } from './handlers/identify-visitor'
import { openDoor } from './handlers/open-door'
import { lookupVisitor } from './handlers/lookup-visitor'
import { escalateToSecurity } from './handlers/escalate-to-security'
import { contactTeamMember } from './handlers/contact-team-member'

// ── All tools ────────────────────────────────────────────────────────────

const TOOLS: ToolDefinition[] = [
  identifyVisitor,
  openDoor,
  lookupVisitor,
  escalateToSecurity,
  contactTeamMember,
]

const TOOL_MAP = new Map(TOOLS.map(t => [t.name, t]))

// ── Public API ───────────────────────────────────────────────────────────

/** Execute a tool by name with zod validation. */
export async function executeTool(
  name: string, rawArgs: unknown, call: Call, ctx: ToolContext,
): Promise<unknown> {
  const tool = TOOL_MAP.get(name)
  if (!tool) return { error: `Unknown tool: ${name}` }

  // Validate args with zod schema
  const parsed = tool.schema.safeParse(rawArgs)
  if (!parsed.success) {
    log.error(`Validation failed for ${name}:`, parsed.error.flatten())
    return { error: `Invalid arguments for ${name}: ${parsed.error.message}` }
  }

  return tool.handler(parsed.data, call, ctx)
}

/** Generate OpenAI function-calling schemas from all tools. */
export function toolSchemas() {
  return TOOLS.map(t => t.toOpenAISchema())
}

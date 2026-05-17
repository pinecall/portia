/**
 * Tool Registry — maps tool names to handlers and builds OpenAI schemas.
 */

import type { ToolContext, ToolHandler } from './types'
import type { Call } from '@pinecall/core'
import * as ToolDefs from '@main/agent/tools'
import { identifyVisitor } from './handlers/identify-visitor'
import { openDoor } from './handlers/open-door'
import { lookupVisitor } from './handlers/lookup-visitor'
import { escalateToSecurity } from './handlers/escalate-to-security'
import { contactTeamMember } from './handlers/contact-team-member'

// ── Handler map ──────────────────────────────────────────────────────────

const HANDLERS: Record<string, ToolHandler<any, any>> = {
  identifyVisitor,
  openDoor,
  lookupVisitor,
  escalateToSecurity,
  contactTeamMember,
}

/** Execute a tool by name. Returns the result or an error object. */
export async function executeTool(
  name: string, args: unknown, call: Call, ctx: ToolContext,
): Promise<unknown> {
  const handler = HANDLERS[name]
  if (!handler) return { error: `Unknown tool: ${name}` }
  return handler(args, call, ctx)
}

// ── Schema generation ────────────────────────────────────────────────────

/** Convert ToolDefs to OpenAI function-calling schema array. */
export function toolSchemas() {
  const entries = Object.entries(ToolDefs) as [string, any][]
  return entries.map(([name, def]) => ({
    type: 'function' as const,
    function: {
      name,
      description: def.description,
      parameters: {
        type: 'object',
        properties: def.params,
        required: def.required || [],
      },
    },
  }))
}

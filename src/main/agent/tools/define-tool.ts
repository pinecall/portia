/**
 * Tool Definition Factory — creates self-contained tools with
 * co-located schemas, handlers, and OpenAI schema generation.
 *
 * Each tool is a single module that exports its schema AND handler,
 * so they can never drift apart.
 */

import { z } from 'zod'
import type { Call } from '@pinecall/sdk'
import type { ToolContext } from './types'

export interface ToolDefinition<S extends z.ZodObject<z.ZodRawShape> = z.ZodObject<z.ZodRawShape>> {
  name: string
  description: string
  schema: S
  handler: (args: z.infer<S>, call: Call, ctx: ToolContext) => Promise<unknown>
  /** Convert to OpenAI function-calling schema */
  toOpenAISchema: () => {
    type: 'function'
    function: { name: string; description: string; parameters: Record<string, unknown> }
  }
}

/**
 * Define a tool with co-located schema and handler.
 * The handler's args are inferred from the zod schema.
 */
export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(def: {
  name: string
  description: string
  schema: S
  handler: (args: z.infer<S>, call: Call, ctx: ToolContext) => Promise<unknown>
}): ToolDefinition<S> {
  return {
    ...def,
    toOpenAISchema() {
      return {
        type: 'function' as const,
        function: {
          name: def.name,
          description: def.description,
          parameters: zodToJsonSchema(def.schema),
        },
      }
    },
  }
}

// ── Zod → JSON Schema (minimal converter for OpenAI) ─────────────────────

function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const shape = schema.shape
  const properties: Record<string, Record<string, unknown>> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodType
    let innerType = zodType
    let isOptional = false

    // Unwrap ZodOptional
    if (innerType instanceof z.ZodOptional) {
      isOptional = true
      innerType = innerType._def.innerType
    }
    // Unwrap ZodDefault
    if (innerType instanceof z.ZodDefault) {
      innerType = innerType._def.innerType
    }

    const prop: Record<string, unknown> = { type: getJsonType(innerType) }
    if (innerType._def.description) {
      prop.description = innerType._def.description
    }

    properties[key] = prop
    if (!isOptional) required.push(key)
  }

  return { type: 'object', properties, required }
}

function getJsonType(zodType: z.ZodType): string {
  if (zodType instanceof z.ZodString) return 'string'
  if (zodType instanceof z.ZodNumber) return 'number'
  if (zodType instanceof z.ZodBoolean) return 'boolean'
  if (zodType instanceof z.ZodArray) return 'array'
  if (zodType instanceof z.ZodEnum) return 'string'
  return 'string' // fallback
}

/**
 * Module augmentation for @pinecall/core — adds event types
 * that the SDK emits but aren't in the public type map yet.
 */

import type { Call } from '@pinecall/core'

interface ToolCall {
  id: string
  name: string
  arguments: string
}

interface ToolCallData {
  tool_calls: ToolCall[]
  msg_id: string
}

declare module '@pinecall/core' {
  interface AgentEvents {
    'llm.tool_call': (call: Call, data: ToolCallData) => void
  }
}

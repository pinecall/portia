/**
 * Module augmentation for @pinecall/sdk — adds event types
 * that the SDK emits but aren't in the public type map yet.
 */

import type { Call } from '@pinecall/sdk'

interface ToolCall {
  id: string
  name: string
  arguments: string
}

interface ToolCallData {
  tool_calls: ToolCall[]
  msg_id: string
}

declare module '@pinecall/sdk' {
  interface AgentEvents {
    'llm.tool_call': (call: Call, data: ToolCallData) => void
  }
}

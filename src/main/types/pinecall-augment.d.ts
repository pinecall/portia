/**
 * Module augmentation for @pinecall/sdk — adds event types
 * that the SDK emits but aren't in the public type map yet.
 *
 * NOTE: As of SDK v0.2.0, `llm.tool_call` is natively typed with
 * `ToolCallEvent`. This augmentation is now a no-op but kept for
 * backward compatibility.
 */

// The SDK now exports ToolCallEvent and ToolCallItem natively.
// No augmentation needed — AgentEvents already includes:
//   'llm.toolCall': (event: ToolCallEvent, call: Call) => void

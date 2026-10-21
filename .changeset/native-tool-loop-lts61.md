---
"@memberjunction/ai": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-anthropic": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-openai": patch
---

Native tool calling, backported from next: provider-valid history after a retried native turn, and thinking kept across tool turns.

- **History ordering.** A generic Retry on a native tool-call turn answers each call with an `is_error` tool result carrying the reason instead of a "Retrying due to" user message, and `reconcileUnansweredToolCalls` inserts its synthetic results directly after the call turn. Anthropic and OpenAI rejected the old call → user message → result order with a 400.
- **Thinking across tool turns.** `ChatMessage.reasoning` / `ChatCompletionMessage.reasoning` carry provider reasoning blocks. Anthropic captures every `thinking` (with signature) and `redacted_thinking` block, replays them ahead of the `tool_use` blocks, and sends the interleaved-thinking beta for budget-form thinking with tools. Gemini keeps thought parts and signed text parts and replays them in order. The Loop agent carries reasoning onto the replayed call turn.
- **Prompt runs record their tool-calling path reliably.** `AIPromptRun.ToolCallingMode` is re-applied inside the post-INSERT update, so a model call that returns before the run's INSERT completes no longer loses it to the INSERT's reload (it was persisted as NULL).
- **The tool loop stays open on Anthropic.** A user message that follows tool results — the runtime-state fragment on every iteration, a retry reason — now joins their user turn as trailing text, instead of being separated from them by an assistant "OK". That filler read as the model's own reply and ended the tool loop, so replayed thinking was dropped and interleaved thinking never applied. Two assistant turns in a row get a user filler, so no text lands ahead of replayed thinking, and a request whose open tool loop has no thinking to replay (a failover from another provider) is sent with thinking off instead of being rejected.

---
"@memberjunction/ai-realtime-client": patch
---

`GeminiRealtimeClient` no longer leaves a session silent after a parallel tool-call batch in blocking mode (#6753). A blocking Gemini Live model answers only once it has every result of a `toolCall` frame, but the first result marked the client busy for the reply, so results 2..N queued behind it and the session waited until the connection moved.

On blocking tooling with the `turnComplete` idle signal:
- **Every result of a batch goes out, in order.** Once a batch's first result is sent, its other results skip the wait for the reply. Context notes and narrations still wait for the reply.
- **An open client turn is committed after the batch's last result**, not after its first.
- **The tool-batch barrier's timeout releases the batch.** Its queued results and a held commit go out whether or not the client is busy, and a result that arrives later still goes out at once.
- **A no-output backstop** (`GeminiRealtimeClient.BLOCKING_TOOL_REPLY_BACKSTOP_MS`, 10 s) releases the turn when the model has not answered after the last result. Model output, `turnComplete`, a new tool call or a new user turn clears it.

NON_BLOCKING tooling, the `interactionStatus` idle profile and the OpenAI clients are unchanged.

---
"@memberjunction/ai-realtime-client": patch
---

`GeminiRealtimeClient` no longer leaves a session silent after a parallel tool-call batch in blocking mode (#6753). A blocking Gemini Live model answers only once it has every result of a `toolCall` frame, but the first result marked the client busy for the reply, so results 2..N queued behind it and the session waited until the connection moved.

On blocking tooling with the `turnComplete` idle signal:
- **Every result of a batch goes out, in order.** Once a batch's first result is sent, its other results skip the wait for the reply. Context notes and narrations still wait for the reply, also when a second `toolCall` frame joins the batch.
- **An open client turn is committed after the batch's last result**, not after its first. Only the batch's other owed calls hold it: a stale or duplicate result does not.
- **The tool-batch barrier's timeout releases the batch.** Its queued results go out first, then a held commit (once, last), whether or not the client is busy. A result that arrives later still goes out at once. A commit still held when the session moves to a new connection goes out once the move completes.
- **A no-output backstop** (`GeminiRealtimeClient.BLOCKING_TOOL_REPLY_BACKSTOP_MS`, 10 s) releases the turn when the model has not answered after the last result. This covers a single blocking call too (a batch of one), so a blocking reply that takes over 10 s to start is released early. Model output, `turnComplete`, a new tool call or a new user turn clears it. The 10 s value rests on a downstream eval: last result to next model output p50 1.17 s, p95 3.78 s, max 4.76 s over 85 waits.

NON_BLOCKING tooling, the `interactionStatus` idle profile and the OpenAI clients are unchanged.

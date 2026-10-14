---
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-bedrock": patch
---

Backport of #5647: a cancelled prompt stops where it is, instead of failing over through every model candidate (#5548).

- **No failover walk after a cancel.** `AIPromptRunner`'s failover loop stops before each candidate once the caller's token is aborted, and after any attempt that fails while it is aborted. Real failures before the cancel are still recorded; a timeout still fails over. The runner's own abort error is classified as a cancellation (`canFailover: false`, `request_cancelled`), so it is no longer read as an unknown, failover-eligible error.
- **Logged once, recorded as cancelled.** One info line instead of an `[ERROR] [ModelExecution]` with a stack trace per candidate. The prompt run is saved `Cancelled` / `user_requested`, and the result carries `status: 'Cancelled'` and `cancelled: true`.
- **Agent runs end Cancelled.** `BaseAgent` checks the token before treating a failed prompt as a failure, and before counting a failed step toward the consecutive-failure limit. A final answer that had already finished when Stop landed still completes the run.
- **Failover fields persist.** A prompt run's failover fields were written while its `Running` INSERT could still be in flight, and the INSERT's reload reset them, so a run that failed over could be saved with `FailoverAttempts = 0`. They are now set again in the queued finalize update.
- **No leaked listener.** The prompt runner's race no longer leaves an abort listener on the caller's token after each call.
- **Bedrock streaming** iterated the response envelope instead of its body, so every streaming call failed with "stream is not async iterable".

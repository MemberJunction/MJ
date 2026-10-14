---
"@memberjunction/ai": patch
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-reranker": patch
"@memberjunction/ai-anthropic": patch
"@memberjunction/ai-azure": patch
"@memberjunction/ai-bedrock": patch
"@memberjunction/ai-betty": patch
"@memberjunction/ai-betty-bot": patch
"@memberjunction/ai-blackforestlabs": patch
"@memberjunction/ai-cerebras": patch
"@memberjunction/ai-cohere": patch
"@memberjunction/ai-elevenlabs": patch
"@memberjunction/ai-fireworks": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-groq": patch
"@memberjunction/ai-heygen": patch
"@memberjunction/ai-inception": patch
"@memberjunction/ai-lmstudio": patch
"@memberjunction/ai-local-embeddings": patch
"@memberjunction/ai-mistral": patch
"@memberjunction/ai-ollama": patch
"@memberjunction/ai-openai": patch
"@memberjunction/unit-testing": patch
"@memberjunction/integration-test-suite": patch
---

A cancelled model call now stops where it is: it is never failed over or retried, a call cancelled in flight is reported as `Cancelled` (a non-chat call cancelled before it starts is refused before a run row exists), and the cancellation reaches the vendor's SDK so the request is torn down rather than abandoned (#5548, #3132).

**Prompts and agents (#5548)**
- **No failover walk after a cancel.** `ExecuteWithFailover` stops before each candidate once the caller's token is aborted, and after any attempt that fails while it is aborted or that reports a cancellation. Before, one abort walked every model candidate (113 real driver calls in a live test) and logged an `[ERROR] [ModelExecution]` with a stack trace for each. Real failures before the cancel are still recorded as failover attempts. A timeout is not a cancellation and still fails over.
- **Logged once, recorded as cancelled.** One info line instead of an error per candidate. The prompt run is saved `Cancelled` / `user_requested`, and the `AIPromptRunResult` carries `status: 'Cancelled'` and `cancelled: true`.
- **Agent runs end Cancelled.** `BaseAgent` checks the token before treating a failed prompt as a failure, and before counting a failed step toward the consecutive-failure limit, so a run cancelled mid-prompt no longer ends `Failed`. A final answer that had already finished when Stop landed still completes the run.
- **Failover fields persist.** A prompt run's `FailoverAttempts`, `FailoverErrors`, `FailoverDurations`, `TotalFailoverDuration` and failed-over `ModelID` / `VendorID` were written while its `Running` INSERT could still be in flight, and the INSERT's reload reset them, so a run that failed over could be saved with `FailoverAttempts = 0`. They are now set again in the queued finalize update, after the reload. This affected every runner, not only cancellation.

**Cancellation in `@memberjunction/ai` (#3132)**
- **`AIErrorType` has `'Cancelled'`**: Fatal and never failed over. `ErrorAnalyzer` on its own classifies an error named `AbortError`, `APIUserAbortError` or `RequestAbortedError` as `Cancelled`. The signal-aware helpers that `BaseLLM`, `BaseDecision` and every runner use (`BuildCancellationErrorInfo`) decide by why the signal was aborted, so an abort caused by a timeout stays a retriable `NetworkError`. A timeout is recognized by the abort reason's type — a `TimeoutError`, or a reason flagged `IsTimeout` (new `TimeoutAbortReason`; `AIPromptTimeoutError` sets it) — never by the words of a caller's reason.
- **Shared helpers** (exported): `IsAbortError`, `IsTimeoutAbort`, `IsRequestAborted`, `BuildCancellationErrorInfo`, `IsCancellationErrorInfo`, `DescribeCancellation`, `CreateCancellationError`, `ThrowIfAborted`, `AbortableDelay`, and the `REQUEST_CANCELLED_CODE` / `REQUEST_TIMEOUT_CODE` codes.
- **`BaseLLM` owns chat cancellation, per request.** It answers an already-aborted request without calling the driver, turns an abort (thrown, or a failed result while the signal is aborted) into one cancelled result, and decides a streaming cancellation from the request's own signal, so drivers no longer keep cancellation state on a shared instance. New protected `BuildCancelledChatResult`, `IsCancellationError` and the `IsProviderAbortError` hook. A pre-aborted streaming request now resolves cancelled on every driver instead of rejecting with a generic error.
- **Every chat driver uses it.** The duplicated cancelled-result builders, predicates and stream-cancel flags are gone from Anthropic, Azure, Bedrock, Betty, BettyBot, Cerebras, Fireworks, Gemini (and Vertex), Groq, Inception, LMStudio, Mistral, Ollama and OpenAI (and its subclasses). Anthropic, Bedrock, Gemini, Mistral and Ollama used to report a cancel as a retriable `Unknown` error. Cancel messages now read "Request was cancelled[: reason]".
- **Bedrock streaming** iterated the response envelope instead of its body, so every streaming call failed with "stream is not async iterable". Fixed.
- `BaseDecision` and the decision runner classify an aborted decision by its signal, so a timeout fails over and a cancel does not.

**Non-chat models**
- **Media** (text-to-speech, speech-to-text, video): the driver params carry `CancellationToken`, the runner passes the call's bound signal, and the OpenAI, Groq, ElevenLabs and HeyGen drivers forward it. `MediaOperation.Invoke` takes the signal as a third argument.
- **Embeddings, rerank and image generation** gain timeout and cancellation: `TimeoutMS` / `CancellationToken` on their run options, a pre-aborted run refused before a run row exists, a cancelled run recorded `Cancelled` and not failed over, and a timeout failed over. The param types gain `CancellationToken`, and the OpenAI, Azure, Bedrock, Cohere, Gemini, Mistral, Ollama and local embedding drivers, the Cohere, LLM and decision rerankers, and the OpenAI, Gemini and FLUX image drivers forward it. A cancelled `BaseEmbeddings.EmbedTexts` now throws a cancellation error instead of returning an empty result. The local embedding model can only stop between texts or batches.

**Testing**
- `TestLLM` gains a `hangUntilAborted` outcome. The LLM conformance suite drops `PreAbortedStreamingBehavior`: every driver must resolve a pre-aborted request as `Cancelled`.
- New integration bundle **IT122 - Agent Prompt Cancellation**: a real agent run cancelled mid-call stops at that call and is recorded cancelled throughout.

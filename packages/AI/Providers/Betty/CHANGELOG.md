# @memberjunction/ai-betty

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [4c6a28b]
- Updated dependencies [709de1a]
- Updated dependencies [1090caa]
- Updated dependencies [914e6ff]
- Updated dependencies [1141164]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [c4645bc]
- Updated dependencies [5b41d48]
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/network-utils@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- 4e4c82d: A cancelled model call now stops where it is: it is never failed over or retried, a call cancelled in flight is reported as `Cancelled` (a non-chat call cancelled before it starts is refused before a run row exists), and the cancellation reaches the vendor's SDK so the request is torn down rather than abandoned (#5548, #3132).

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

- Updated dependencies [0d81c53]
- Updated dependencies [3080e83]
- Updated dependencies [81aea34]
- Updated dependencies [2274f42]
- Updated dependencies [230cdad]
- Updated dependencies [4e4c82d]
- Updated dependencies [72dd65c]
- Updated dependencies [17a4137]
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/network-utils@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- Updated dependencies [d17de94]
- Updated dependencies [7ada797]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [1da00cb]
- Updated dependencies [b699a37]
- Updated dependencies [a4b23b7]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [4889fb2]
- Updated dependencies [b2441c3]
- Updated dependencies [69e19c5]
- Updated dependencies [7316ac3]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [8bac4d6]
- Updated dependencies [5a3de97]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [8704df6]
- Updated dependencies [5345e3d]
- Updated dependencies [22c9074]
- Updated dependencies [aee2d53]
- Updated dependencies [5dc3752]
- Updated dependencies [6c8798b]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [afe9eb4]
- Updated dependencies [d2cb42e]
- Updated dependencies [cbddadb]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [6b487b8]
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/network-utils@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [29b6ec3]
- Updated dependencies [279b93e]
- Updated dependencies [bea2386]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/network-utils@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [2552b1e]
- Updated dependencies [f3c6161]
- Updated dependencies [5148534]
- Updated dependencies [ce1a5c3]
- Updated dependencies [4d647e6]
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/network-utils@6.2.0-edge.2

## 6.2.0-edge.1

### Minor Changes

- 48f77ea: Add `@memberjunction/ai-betty` — a `BaseLLM` provider for **Betty**, the MJ-native
  organization-scoped assistant, registered as `BettyLLM`.

  This sits **alongside** `@memberjunction/ai-betty-bot` rather than replacing it. The two target
  different services with different wire protocols: `BettyBotLLM` exchanges its key for a JWT at
  `POST /settings` and posts `{ input }` to `POST /response`; `BettyLLM` uses the API key directly as
  a bearer and posts `{ message, conversationId }` to `POST /messages`.

  **No breaking change.** `@memberjunction/ai-betty-bot` is untouched, so no existing deployment has
  to move and nobody needs to be contacted or given a deadline. Both can run in one instance;
  migrating a deployment is repointing one `AIModelVendor.DriverClass` from `BettyBotLLM` to
  `BettyLLM`, and rolling back is repointing it back.

  A separate driver class rather than a configuration mode on the existing one, because
  `GetAIAPIKey()` is keyed by driver class — one class serving both protocols would read a single
  `AI_VENDOR_API_KEY__BETTYBOTLLM` for two unrelated services, and a misconfiguration would silently
  send a customer's key to the wrong host.

  Configuration: `BETTY_API_BASE_URL` (required, no default — Betty is deployed per customer, so a
  default risks answering from the wrong tenant) and `AI_VENDOR_API_KEY__BETTYLLM`.

  Notes:
  - Citations keep the legacy response shape (`choices[1]` formatted, `choices[2]` raw JSON with
    `finish_reason: 'references_json'`), so anything already parsing `BettyBotLLM` output survives a
    `DriverClass` repoint.
  - Multi-turn is handled correctly. The legacy provider uses `messages.find(m => m.role === user)`,
    which returns the _first_ match and silently discards follow-ups; this provider sends the latest
    user turn and passes the earlier ones as advisory, non-authorizing `context.text`.
  - Streaming is not implemented yet (`SupportsStreaming` is `false`). The API does support SSE via
    `Accept: text/event-stream`, so this is a follow-up rather than a dead end.

### Patch Changes

- Updated dependencies [a50948e]
- Updated dependencies [15a4333]
- Updated dependencies [5da3ad2]
- Updated dependencies [e1dd673]
- Updated dependencies [c261eb8]
- Updated dependencies [1d43161]
- Updated dependencies [80905a1]
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/network-utils@6.2.0-edge.1

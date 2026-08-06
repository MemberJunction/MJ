# @memberjunction/ai-fireworks

## 6.1.0-edge.0

### Patch Changes

- @memberjunction/ai@6.1.0-edge.0
- @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/ai@6.0.0
- @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/ai@5.51.0
- @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [c221553]
- Updated dependencies [0ba33b3]
  - @memberjunction/ai@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- b52ffa8: Fix four silent-failure bugs found while triaging the open issue backlog. Each one looked correct from the outside while doing nothing, or doing the wrong thing, at runtime. No schema changes.

  **`BaseLLM` silently truncated streamed responses (`@memberjunction/ai`).** The streaming chunk loop caught any mid-stream error, logged it, and then finalized the response as a **success**. A dropped connection, a provider fault, or an abort part-way through a stream produced truncated content that the caller was told was complete — under every provider, for every streaming consumer. Genuine failures now surface as failures; cancellation is still routed to the driver's `finalizeStreamingResponse`, since providers differ on whether an abort throws there or simply ends iteration.

  **No LLM driver honored `ChatParams.cancellationToken`** (13 provider packages). The field existed on `ChatParams` and zero drivers read it, so an aborted or timed-out request abandoned the promise while the socket kept streaming and pinning buffers. Now forwarded to the SDK across all 19 drivers — 13 fixed directly, the remaining 6 inheriting from `OpenAILLM` / `GeminiLLM` — on both the streaming and non-streaming paths. The mechanism differs per provider and was verified rather than assumed — Bedrock takes `abortSignal` (not `signal`); Ollama has no per-request hook at all, so the signal is threaded through a custom `fetch`; and `Inception` overrides both chat paths without calling `super`, so it does not inherit the fix from `OpenAILLM` despite appearing to. An abort is reported `Fatal` / `canFailover: false`, because `ErrorAnalyzer` otherwise classifies it as retriable — meaning a request the user just cancelled would have been retried.

  **Prompt execution could not be bounded (`@memberjunction/ai-prompts`, `@memberjunction/ai-core-plus`).** On the single-model path the model call was awaited with no bound unless the caller hand-supplied an `AbortSignal`, so a hung provider connection never resolved. Adds a per-request `AIPromptParams.timeoutMS` and a typed `AIPromptTimeoutError` that `ErrorAnalyzer` classifies as retriable, so a timeout now flows into the existing retry/failover machinery instead of hanging. The timeout and any caller-supplied token compose — neither is discarded. Enforcement lives in `executeModel`, the one method the parallel coordinator also inherits, so the single-model and parallel paths cannot diverge. (Issue #3064 was filed as "`AIPromptRunner` does not enforce `AIPrompt.TimeoutMS`", but that column does not exist — the bound could not be expressed at all. A prompt-level column is tracked separately in #3133.)

  **A malformed deny-list silently disarmed the Predictive Studio leakage guard** (`@memberjunction/predictive-studio*`, `@memberjunction/core-entities-server`, `@memberjunction/ng-dashboards`). Pasting a bracketed list into the pipeline editor produced `DenyFields: ["[CheckInTime", …, "Status]"]`; the deny-set then matched nothing, so the most dangerous leak columns trained completely unguarded and the save was accepted. The editor no longer manufactures the bad input, a new `MJMLTrainingPipelineEntityServer.ValidateAsync` rejects it at save, and the dominance threshold is clamped at enforcement time so rows written before this validation existed cannot disable the guard. Also unifies `DEFAULT_DOMINANCE_THRESHOLD`, which was defined twice with different values (`0.85` vs `0.6`) — agent-authored pipelines had been held to a materially laxer guard than hand-authored ones.

  **Dead CSS shipped to production (`@memberjunction/ng-dashboards`, `@memberjunction/ng-conversations`).** These packages build with bare `ngc` — no Sass step — so `styleUrls` content is embedded verbatim. Native CSS nesting makes `&:hover` accidentally work, but it cannot do string concatenation, so every `&__elem` / `&--modifier` rule was silently dropped. Three components were affected. **This resurrects styling that has never rendered**: the realtime media-surface tab bar had no active-tab indicator, and evidence playback had no active-turn highlight and no played-progress color on its waveform. A new `check:ui-ngc-scss` CI gate prevents the trap re-arming.

  Also fixes `@memberjunction/ai-azure`, whose unit tests had never actually run — the package had test files and a vitest config but no `test` script.

- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [a9ec419]
- Updated dependencies [42a680a]
- Updated dependencies [b52ffa8]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [15e3017]
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [c20723a]
  - @memberjunction/ai@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- @memberjunction/ai@5.47.0
- @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/ai@5.46.0
- @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ai@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [c1f2d3d]
  - @memberjunction/global@5.45.0
  - @memberjunction/ai@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [5396d90]
- Updated dependencies [89ea055]
  - @memberjunction/global@5.44.0
  - @memberjunction/ai@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [9f6aa87]
  - @memberjunction/global@5.43.0
  - @memberjunction/ai@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [0fa3cbc]
  - @memberjunction/global@5.42.0
  - @memberjunction/ai@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [15b743b]
- Updated dependencies [1568bae]
  - @memberjunction/ai@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- @memberjunction/ai@5.40.1
- @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- @memberjunction/ai@5.40.0
- @memberjunction/global@5.40.0

## 5.39.0

### Minor Changes

- 1b0f355: Loop agent prompt improvements for cache optimization. Capture cache-read and cache-write token counts from every LLM provider that reports them (Anthropic, OpenAI, Gemini, Groq, Cerebras, Fireworks, Azure, Bedrock) and surface them on AI Prompt Runs and Agent Runs. Adds `CacheReadTokens`/`CacheWriteTokens` columns to `AIPromptRun` (migration included — run CodeGen after applying), normalizes cache-token accounting in `baseModel` so usage totals are consistent across providers, and enables Gemini implicit/explicit cache reporting. The Prompt Run form and Agent Run analytics now display cache hit/write token breakdown

### Patch Changes

- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [30f598d]
- Updated dependencies [3d739a3]
  - @memberjunction/global@5.38.0
  - @memberjunction/ai@5.38.0

## 5.37.0

### Patch Changes

- @memberjunction/ai@5.37.0
- @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- @memberjunction/ai@5.36.0
- @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [ac4b9a5]
  - @memberjunction/global@5.35.0
  - @memberjunction/ai@5.35.0

## 5.34.1

### Patch Changes

- @memberjunction/ai@5.34.1
- @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [389d356]
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [5cc5326]
  - @memberjunction/global@5.33.0
  - @memberjunction/ai@5.33.0

## 5.32.0

### Patch Changes

- @memberjunction/ai@5.32.0
- @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
  - @memberjunction/ai@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- @memberjunction/ai@5.30.0
- @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- @memberjunction/ai@5.29.0
- @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- @memberjunction/ai@5.28.0
- @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ai@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- @memberjunction/ai@5.26.0
- @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- @memberjunction/ai@5.25.0
- @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- @memberjunction/ai@5.24.0
- @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
  - @memberjunction/global@5.23.0
  - @memberjunction/ai@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [f2a6bec]
  - @memberjunction/global@5.22.0
  - @memberjunction/ai@5.22.0

## 5.21.0

### Patch Changes

- @memberjunction/ai@5.21.0
- @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- @memberjunction/ai@5.20.0
- @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/ai@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- @memberjunction/ai@5.17.0
- @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- @memberjunction/ai@5.16.0
- @memberjunction/global@5.16.0

## 5.15.0

### Minor Changes

- c3e8b94: metadata updates and migration

### Patch Changes

- Updated dependencies [c3e8b94]
  - @memberjunction/ai@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- @memberjunction/ai@5.14.0
- @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
  - @memberjunction/global@5.13.0
  - @memberjunction/ai@5.13.0

## 5.12.0

### Patch Changes

- @memberjunction/ai@5.12.0
- @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- @memberjunction/ai@5.11.0
- @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- @memberjunction/ai@5.10.0
- @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [194ddf2]
  - @memberjunction/global@5.9.0
  - @memberjunction/ai@5.9.0

## 5.8.0

### Patch Changes

- @memberjunction/ai@5.8.0
- @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
  - @memberjunction/ai@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- @memberjunction/ai@5.6.0
- @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/global@5.5.0
  - @memberjunction/ai@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai@5.4.1
- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- @memberjunction/ai@5.4.0
- @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- @memberjunction/ai@5.3.0
- @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- @memberjunction/ai@5.2.0
- @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [4aa1b54]
  - @memberjunction/ai@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- @memberjunction/ai@4.4.0
- @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai@4.3.1
- @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- @memberjunction/ai@4.3.0
- @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai@4.2.0
- @memberjunction/global@4.2.0

## 4.1.0

### Patch Changes

- @memberjunction/ai@4.1.0
- @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [8366d44]
- Updated dependencies [718b0ee]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ai@4.0.0
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- d596467: Add Fireworks.ai LLM provider package with Kimi K2.5 model support, fix AI prompts failover bug, and add Jest testing infrastructure
  - @memberjunction/ai@3.4.0
  - @memberjunction/global@3.4.0

# @memberjunction/ai-realtime-client

## 6.2.0-edge.0

### Minor Changes

- b87e4ac: feat(ai): Gemini 3.8 Live multimodal realtime streaming, video tracks, asynchronous reasoning, and per-model legality

  This release adds comprehensive support for Google's Gemini 3.8 Live multimodal realtime models (`gemini-3.8-live` and `gemini-3.8-live-extended-thinking`), including a first-class media plane for video/audio tracks, non-blocking tool execution, thought summaries, session continuity, and complete catalog metadata.

  In `@memberjunction/server`, the default configuration for `realtime.enabled` is flipped from `false` to `true`, enabling the `/realtime/sdp-exchange` WebRTC broker endpoint on all MemberJunction API servers by default (configurable via `MJ_REALTIME_ENABLED`).

  ### Phase Summary:
  - **Phase A (Contracts & Media Plane)**: Introduced directional media tracks (`RealtimeTrackDescriptor`, `RealtimeTrackDirection`), open modality vocabulary via `RealtimeModalityRegistry`, track negotiation in `BaseRealtimeClient`, and channel track sourcing/sinking (`GetSourcedTracks`/`GetSunkTracks`).
  - **Phase B (Audio Retrofit & SDK Convergence)**: Upgraded and converged `@google/genai` to `^2.8.0` across dependents.
  - **Phase C (Gemini Live Config Legality)**: Added per-model legality enforcement in `GeminiRealtime`: stripped `enable_affective_dialog`, preserved `proactive_audio: true` while rejecting `false`, enforced `thinkingConfig` rules (omitted on 3.8-live, validated levels low/medium/high and rejected `minimal` on Extended Thinking), explicit turn coverage, local refusal of `BLOCKING` tools on Extended Thinking, default `NON_BLOCKING` state on all declarations, and config bag sanitization.
  - **Phase D (Async Tool Execution & Idle Contract)**: Implemented per-model idle detection honoring `IdleSignal` (`generationComplete` for 3.8-live, `interactionStatus` for Extended Thinking); decoupled tool call arrival from response activity so generation is not falsely interrupted; drained `queuedSends` only on true idle or turn complete; integrated `RealtimeToolBatchBarrier` for parallel/out-of-order tool calls; and added function scheduling resolution (`__mj_scheduling` / `scheduling` with `INTERRUPT`/`INTERRUPTED` support).
  - **Phase E (Extended Thinking & Narration)**: Routed model thought parts (`IsThought: true`) to `ThoughtNarration$` and created immutable narration delegation cards (`Kind: 'narration'`), keeping scratch thoughts distinct from spoken responses and user-cancelable actions.
  - **Phase F (Video Tracks & Session Continuity)**: Implemented video frame capture (`getDisplayMedia`/`getUserMedia` in `src/media/frameCapture.ts`), throttled inbound video frame transmission via `ChannelInboundVideoBridge` (whiteboard and remote browser channels), and resilient session continuity across the vendor session cap via `sessionResumptionUpdate` / `goAway`.
  - **Phase G (Metadata & Release)**: Added declarative catalog metadata and multi-channel pricing for `Gemini 3.8 Live` and `Gemini 3.8 Live Extended Thinking` in `metadata/ai-models/.ai-models.json`.

  ### Reviewer Punch List Resolutions:
  - **Items 16–18 (Scheduling)**: Supported `__mj_scheduling` alongside `scheduling`, sanitized payload keys, accepted both `INTERRUPT` and `INTERRUPTED`, and added diagnostic warnings on unknown values.
  - **Item 19 (Non-blocking getter)**: Extracted and centralized `isNonBlocking` getter on `GeminiRealtimeClient`.
  - **Item 20 (Generation Complete)**: Ensured `handleGenerationComplete` updates `responseActive` without prematurely draining queued sends.
  - **Items 21–23 (Thought Narration)**: Cleanly separated thought summaries from spoken narrations and the ephemeral live note across `RealtimeSessionService` and `RealtimeSessionState`.
  - **Item 24 (Activity Rail)**: Restricted open-run button rendering to agent runs (`card.Kind === 'agent' && !!card.RunID`).
  - **Items 25–27 (Video Bridge & Throttle)**: Separated `sendFrameDirect`, resolved throttle contention between bridge and driver with jitter headroom, added graceful headless DOM detection, and guarded against unimplemented `SendVideoFrame`.
  - **Item 28 (File organization)**: Moved `frameCapture.ts` from `audio/` to `media/` with clean import paths.
  - **C5a–C5c (Config Sanitization & Tool Behavior)**: Stated explicit tool behavior on all declarations, warned on unknown values, and added `tooling`, `toolBehavior`, and `functionCallingBehavior` to `REALTIME_SHARED_CONFIG_KEYS`.

### Patch Changes

- d665a6e: feat(ai): Gemini Live direct tools support, prompt framing alignment, and change-driven remote browser screencast deduplication
  - Declared `SupportsDynamicToolSet = true` on `GeminiRealtime` and its session capabilities so target agent direct action tools are projected into Gemini Live sessions.
  - Fixed `hasDirectTools` calculation in `RealtimeClientSessionService` to consider `input.ExtraTools` (whiteboard, browser, media, context tools), ensuring interactive surface tools prevent the negative "do not attempt to do the work yourself" prompt guidance.
  - Implemented change-driven screencast frame deduplication in `RemoteBrowserChannel` with a 15-second heartbeat, preserving ~15k tokens/min on static pages while maintaining instant visual push on user interactions.
  - Reworded `ResolveGeminiThinkingLevel` fallback warning and added `CompileBrowserDelegationPolicy` doc clarification per PR review feedback.
  - Added Node < 23 `CloseEvent` compatibility polyfills in `ai-realtime-client` test suites.

- 575bfae: fix(ai-realtime): OpenAI Live planning model fallback, tool barrier synchronization, and remote video bridge
  - **OpenAI Live Default Planning Model**: Exported `DEFAULT_OPENAI_LIVE_PLANNING_MODEL = 'gpt-5.6-terra'` and warned with `console.warn` whenever `Reasoning.Remote.Ref` is undefined instead of falling back to legacy `gpt-4o`.
  - **Delegation Policy & Tool Framing**: Added `CompileBrowserDelegationPolicy` which omits the spoken holding phrase clause for browser-direct sessions. Guarded against appending delegation policy instructions when the session prompt already contains tool framing or interactive-surface execution rules.
  - **SendText Barrier Guard**: Prevented premature `response.create` emissions during `SendText` when background tool batches are in-flight (`!this.toolBatchBarrier.IsEmpty`). The creation is safely deferred until the tool batch completes via `SendToolResult`.
  - **Dedupe & Tool Barrier Lifetimes**: Maintained tool deduplication (`emittedToolCallIds`) throughout the lifetime of active tool batches, preventing duplicate execution from redelivered events when `response.completed` arrives before tool outputs. Cleared deduplication state upon batch completion and barrier timeout flushes.
  - **Remote Browser Video Bridge**: Wired `ChannelInboundVideoBridge` with client-getter support and hooked `OnSessionStarted` into active channels after WebRTC track negotiation so screencast frames stream reliably to the live model.
  - **Full-Duplex Barge-in Unblock**: Removed premature state gate in `GeminiRealtimeClient.sendMicChunk` so mic streaming and barge-in remain uninterrupted while the model is speaking or in extended thinking.
  - **Track Descriptors**: Added `Required?: boolean` to `RealtimeTrackDescriptor` so optional and channel-sourced media tracks are cleanly negotiated without breaking the session.

- 3977917: Extract the realtime co-agent session runtime out of Angular into `@memberjunction/realtime-runtime`, and register the GPT-Live client driver so it survives bundling.

  **Why.** `RealtimeSessionService` was 2,768 lines of client-direct realtime orchestration — mint, driver resolution, transcripts, tool relay, delegation narration, channel lifecycle, usage relay, teardown — living inside `@memberjunction/ng-conversations`. Its own header noted it stays component-free so it "must stay importable in plain-node tests", and the measurement bore that out: its entire Angular surface was `import { Injectable }` plus the decorator, and its entire DOM surface was one `navigator.mediaDevices.getUserMedia` call. But because it shipped in an Angular package, no other host could drive a realtime session without reimplementing it — and a second copy drifts from the first at the next protocol change, which GPT-Live just demonstrated is a frequent event.

  This follows the precedent set by `@memberjunction/conversations-runtime`, whose extraction plan explicitly noted realtime was landing in parallel and would need the same treatment.

  **What moved** into the new pure-TypeScript package: the session runtime (now `RealtimeSessionRuntime`), the channel plugin base class, the delegation-result parser, and the narration template builder.

  **The host seam.** `IRealtimeMediaHost` supplies the two genuinely platform-specific pieces: microphone acquisition (the Real-Time Co-Agents guide already specifies "the host acquires the mic — it owns the permission UX"; that seam simply had never been cut) and optional audio recording. Recording now returns base64 across the seam, so the runtime no longer touches `Blob` or `FileReader` — a browser reaches for `FileReader`, React Native reads a file, a test harness holds bytes in memory, and the orchestration layer should never have been asking.

  **`BaseRealtimeChannelClient`'s only Angular tie** was a type-only `Type<T>` import, used in one method the runtime never calls. It is now an opaque component-class reference that Angular's `Type<T>` satisfies unchanged, with the narrowing done at the single Angular call site that instantiates a component. This is what makes interactive channels authorable from a non-Angular host at all.

  **Bug fixed alongside:** `LoadOpenAILiveClient()` was exported but never called, while every sibling driver's Load function was. Since client drivers resolve dynamically through the ClassFactory, GPT-Live's driver could be tree-shaken out of a production bundle and fail to resolve at runtime while working in dev — the exact failure mode the Load-function convention exists to prevent.

  **No behaviour change for Explorer.** `RealtimeSessionService` keeps its name, injectable token and methods; it is now a thin subclass supplying the browser media host, and Explorer is untouched. `@memberjunction/ng-conversations` does, however, stop _exporting_ the types that moved — `public-api.ts` no longer re-exports `base-realtime-channel-client`, `delegation-result-parser` or `FormatToolName` — so a downstream consumer importing them from there must re-point at `@memberjunction/realtime-runtime`. No in-repo consumer does. The bump stays `patch` because MJ ties changeset level to database impact rather than semver breakage (see `.claude/rules/changesets.md`); the required import change is called out here instead. Verified by the package's existing suites: 108 test files / 1,324 tests green, including all 13 realtime-session suites.

  Types that moved (`RealtimeCaption`, `RealtimeConnectionState`, `RealtimeSessionRunOptions`, `BaseRealtimeChannelClient`, `ParseDelegationResultJson`, …) must now be imported from `@memberjunction/realtime-runtime`, since MJ does not re-export across package boundaries.

- e962151: refactor(ai-realtime): thread HasToolFraming boolean, document SendText barrier commentary queueing, and document tool batch dedupe lifetime rule
  - Added `HasToolFraming?: boolean` to `RealtimeSessionParams` in `@memberjunction/ai` (Core), replacing prompt substring sniffing with an explicit caller-asserted parameter while retaining substring sniffing as a fallback.
  - Set `HasToolFraming: true` in `RealtimeClientSessionService.buildSessionParams` for companion co-agent sessions.
  - Added comprehensive unit tests in `@memberjunction/ai-openai` verifying that `HasToolFraming` explicitly controls standalone delegation policy compilation.
  - Documented in `OpenAILiveClient.SendText` that user typed input is appended to commentary rather than dropped when the tool barrier is active, draining with the tool batch's `response.create`.
  - Documented the shared lifetime rule for `emittedToolCallIds` and `toolBatchBarrier` across declaration and clear sites.
  - Added `"engines": { "node": ">=24" }` to root `package.json` and `packages/AI/RealtimeClient/package.json`.
  - Recorded Item 43 design note for `RequiresConsent` in `plans/realtime/gemini-3-8-live.md`.

- fc3da91: fix(realtime): confirm whiteboard agent edits only when the tool succeeded, and source inbound-video capability from per-model profile data

  Review follow-ups to #4512.
  - **A failed whiteboard tool no longer reports success to the model.** `ApplyAgentTool` pushed a confirmation frame and a "visual confirmation of your action — do NOT narrate or announce your own change" note unconditionally, including when the tool returned `{ success: false, error }` (invalid JSON arguments, unknown tool, per-tool validation). The model received its failure result alongside an assertion that the edit had landed, plus an instruction not to mention it — so a failed edit disappeared from the user's view. It also pushed a frame identical to the previous one, since a failed tool mutates nothing.
  - **Inbound-video capability and its frame-rate ceiling are now per-model data.** `GeminiLiveModelProfile` gains `MaxInboundVideoRate`, the mint carries both it and `SupportsInboundVideo` in the session config, and the browser driver reads them instead of inferring capability from the model id with `startsWith('gemini-3.8-live')`. That sniff and the profile table were two answers to one question, agreeing only because the model names happened to line up; a model that broke the naming pattern would have diverged silently. A future model that accepts a faster feed now declares it in the profile and every consumer follows.
  - **The whiteboard channel is change-driven with no liveness heartbeat.** Its `WHITEBOARD_HEARTBEAT_MS` constant could never fire — the elapsed check lived inside the mutation path, which an idle board never enters — so it read as a liveness guarantee while providing none.
  - `RealtimeTrack.Descriptor`'s doc now states that negotiation refinement covers `Rate` only, so no one reads `Encoding` or `UsageBasis` off a live track expecting the model's answer.

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [b87e4ac]
- Updated dependencies [575bfae]
- Updated dependencies [e962151]
- Updated dependencies [fc3da91]
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Patch Changes

- 97cbf5f: Fix realtime token usage being silently discarded for xAI Grok Voice sessions.

  The two OpenAI-compatible realtime providers put the `response.done` usage payload in **different places**, verified by live wire capture:
  - **OpenAI** (`gpt-realtime`) populates `response.usage` and sends no top-level `usage`.
  - **xAI** (Grok Voice) populates a **top-level** `usage` and sends `response.usage` as an **empty object**.

  Both readers in the codebase dereferenced `response.usage` only. For xAI that value is `{}` — which is truthy — so the `if (!usage) return` guard never fired. A usage event was emitted with `input_tokens`/`output_tokens` `undefined`, those clamped to `0` downstream, the host dropped the all-zero delta without arming its flush timer, and the session's tokens were never relayed. The result was `TokensPrompt`/`TokensCompletion`/`TokensUsed` sitting at NULL on `AIPromptRun` for every Grok Voice session — a silent accounting hole rather than a visible failure. The server-bridged path had the same read and would have recorded zeros.

  Adds `ResolveResponseDoneUsage` to `@memberjunction/ai`, shared by the client-direct reader (`OpenAIProtocolRealtimeClient`) and the server-bridged driver (`OpenAIRealtime`) so the two paths cannot drift apart on this again. It prefers the nested payload whenever that carries real token counts — leaving OpenAI's behavior unchanged — and falls back to the top-level one, so xAI is captured now and nothing breaks if xAI later populates the nested slot. Crucially it rejects a payload with no numeric token fields, which is what closes the empty-object trap.

  xAI's payload also carries per-modality detail (`text_tokens` / `audio_tokens` / `grok_tokens`), `output_audio_seconds` and `billable_audio_seconds`; these survive on the usage event's `Raw` field. Note `billable_audio_seconds` is **cumulative**, not a per-response delta, so it must not be summed if it is ever surfaced as one.

  The existing xAI usage test passed throughout, because it asserted against a hand-written OpenAI-shaped frame — encoding the very assumption that was wrong. Tests now use frames copied from real captures of both providers.

- Updated dependencies [834f8d7]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [f5ec13b]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [5ecfdb4]
- Updated dependencies [a5f92d2]
- Updated dependencies [ada8784]
- Updated dependencies [11de1a3]
- Updated dependencies [cefc302]
- Updated dependencies [080f4cd]
- Updated dependencies [be0bdb2]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [23c2521]
- Updated dependencies [97cbf5f]
- Updated dependencies [f5ec13b]
- Updated dependencies [de343b5]
- Updated dependencies [1bd9674]
- Updated dependencies [7fcdc2d]
  - @memberjunction/global@6.1.0
  - @memberjunction/ai@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [61b5612]
- Updated dependencies [076fa5d]
- Updated dependencies [7fcdc2d]
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [2c826f7]
- Updated dependencies [197fdf8]
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [ada8784]
- Updated dependencies [23c2521]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [a5f92d2]
  - @memberjunction/ai@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
- Updated dependencies [cefc302]
- Updated dependencies [be0bdb2]
- Updated dependencies [f5ec13b]
- Updated dependencies [1bd9674]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- 97cbf5f: Fix realtime token usage being silently discarded for xAI Grok Voice sessions.

  The two OpenAI-compatible realtime providers put the `response.done` usage payload in **different places**, verified by live wire capture:
  - **OpenAI** (`gpt-realtime`) populates `response.usage` and sends no top-level `usage`.
  - **xAI** (Grok Voice) populates a **top-level** `usage` and sends `response.usage` as an **empty object**.

  Both readers in the codebase dereferenced `response.usage` only. For xAI that value is `{}` — which is truthy — so the `if (!usage) return` guard never fired. A usage event was emitted with `input_tokens`/`output_tokens` `undefined`, those clamped to `0` downstream, the host dropped the all-zero delta without arming its flush timer, and the session's tokens were never relayed. The result was `TokensPrompt`/`TokensCompletion`/`TokensUsed` sitting at NULL on `AIPromptRun` for every Grok Voice session — a silent accounting hole rather than a visible failure. The server-bridged path had the same read and would have recorded zeros.

  Adds `ResolveResponseDoneUsage` to `@memberjunction/ai`, shared by the client-direct reader (`OpenAIProtocolRealtimeClient`) and the server-bridged driver (`OpenAIRealtime`) so the two paths cannot drift apart on this again. It prefers the nested payload whenever that carries real token counts — leaving OpenAI's behavior unchanged — and falls back to the top-level one, so xAI is captured now and nothing breaks if xAI later populates the nested slot. Crucially it rejects a payload with no numeric token fields, which is what closes the empty-object trap.

  xAI's payload also carries per-modality detail (`text_tokens` / `audio_tokens` / `grok_tokens`), `output_audio_seconds` and `billable_audio_seconds`; these survive on the usage event's `Raw` field. Note `billable_audio_seconds` is **cumulative**, not a per-response delta, so it must not be summed if it is ever surfaced as one.

  The existing xAI usage test passed throughout, because it asserted against a hand-written OpenAI-shaped frame — encoding the very assumption that was wrong. Tests now use frames copied from real captures of both providers.

- Updated dependencies [5ecfdb4]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [48ff99f]
- Updated dependencies [97cbf5f]
- Updated dependencies [de343b5]
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- @memberjunction/ai@6.1.0-edge.1
- @memberjunction/global@6.1.0-edge.1

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

### Minor Changes

- 9e2278c: Consolidate the OpenAI-protocol realtime driver family (server AND client) onto shared, subclassable implementations, and wire MJ's normalized effort levels through to the realtime session.

  **Normalized effort mapping (`@memberjunction/ai-openai`)** — the session Config bag now accepts MJ's normalized `effortLevel` (the `ChatParams.effortLevel` vocabulary: numeric 1–100 or named level), translated to provider literals through a new per-provider `OpenAIRealtimeProfile.mapEffortLevel` seam (OpenAI implementation exported as `MapEffortLevelToOpenAIRealtime`, quintile mapping across the five GA levels). Provider-native `reasoningEffort` remains an explicit override. Providers whose endpoints use different level vocabularies override the profile function — no protocol code changes. Also: `extractRealtimeFeatures` → `ExtractRealtimeFeatures` (PascalCase for exported functions), per-session `inputTranscriptionModel` override, and unconditional scrubbing of MJ-side transport keys (`endpoint`/`sampleRate`/`proxyBaseUrl`) so they never leak into a provider payload.

  **HuggingFace server driver subclasses the shared driver (`@memberjunction/ai-huggingface`)** — `HuggingFaceRealtime`/`HuggingFaceRealtimeSession` now extend the OpenAI driver via a profile plus the new exported `RawRealtimeWebSocketConnection` adapter (raw WS speaking OpenAI frames → `IOpenAIRealtimeConnection`; send-buffering until open, provider-error-frame rerouting, close shim — reusable by any future OpenAI-frame provider). The ~340-line protocol clone is deleted while every HF-specific behavior is preserved: ready-after-config `StartSession` (via the base session's new `WaitForConfigApplied` gate), fold-context-into-prompt, beta event aliases, tool-set fingerprint no-op, native-STT (no default transcription block), proxy-ticket client-direct topology, and compat `responseActive` robustness.

  **Client-side mirror (`@memberjunction/ai-realtime-client`)** — new shared layers: `OpenAIProtocolRealtimeClient` (the transport-agnostic protocol brain: event dispatch incl. GA+beta names, response state machine, narration tagging, tool-result queueing, the outbound actions) and `OpenAIProtocolWebSocketRealtimeClient` (websocket + client-owned PCM plane). `OpenAIRealtimeClient` retains only its WebRTC transport; `xAIRealtimeClient` and `HuggingFaceRealtimeClient` collapse to thin subclasses (Grok: model-on-URL + subprotocol auth + fixed 24 kHz + streamed-transcript collapse + wire diagnostics; HF: proxy-URL connect + `{session, sampleRate}` pact parsing + `session.created` gate + benign close semantics). The per-driver duplicate frame-model types are REMOVED (breaking for anyone importing e.g. `XAIRealtimeEvent`/`OAIResponseAudioTranscriptDelta`/`IxAIClientSocket` from the driver modules — import the `OAIProtocol*`/`OpenAIProtocol*`/`IOpenAIProtocolClientSocket` names from the package root instead; repo-wide search found no consumers outside this package's own tests). Guard improvement: `RequestSpokenUpdate` on a non-open transport no longer flags busy without sending.

  **Testing** — dramatically expanded across the family: new `RawRealtimeWebSocketConnection` suite (buffering, dual error channel, listener semantics, payload integrity), `WaitForConfigApplied` lifecycle coverage, config-extraction hardening, per-provider gating proofs, and a ~2.7× expansion of the HuggingFace client suite (pact edges, tool loop, narration, barge-in/cancel, transport semantics, teardown). Suite totals: ai-openai 120, ai-xai 50, ai-huggingface 30, ai-realtime-client 377 — all passing; the pre-existing suites pass unchanged against the subclassed drivers (behavior-preserving refactor).

- bc388e3: Realtime QA hardening — every finding from the adversarial audit of the driver-family consolidation (PR #3177) plus the broader co-agent architecture, fixed with regression tests (plan: `plans/complete/realtime-qa-hardening.md`).

  **Regression fixes (A-items)** — bodyless provider `error` frames are recoverable again on raw-WS providers (adapter synthesizes the payload; transport failures stay fatal); `Capabilities.CanReconfigureTurnMode` is profile-gated (`supportsLiveReconfigure` — HuggingFace now truthfully reports false and `Reconfigure` no-ops); protected wire fields (`type`/`instructions`/`tools`) can no longer be overridden through the open Config bag (closing a strict-endpoint session.update kill vector) while the documented `audio` override remains; the client-direct minted `SessionConfig` now applies the residual bag with the same construction order as server-bridged (the two topologies are actually identical); deferred-config listener cleanup on early teardown; family-wide empty-transcript suppression; settle-handle + adapter buffer hygiene.

  **Robustness (B-items)** — connect/readiness deadlines everywhere (client WS `connectTimeoutMs` covering open + `session.created`, with socket-death/`Disconnect` releasing the awaited `Connect`; server `configReadinessTimeoutMs` rejecting `WaitForConfigApplied` on silent endpoints without cancelling the deferred apply); stale-`response.done` protection (a cancelled turn's trailing done can't release the busy lock under a locally-initiated replacement); TRUE-barge-in drops queued tool-result auto-triggers (the model never speaks over a user who took the floor; delivery via the user's next turn); WebRTC remote-stream handlers cleared on Disconnect; WS sends gated on socket-open.

  **Architecture (C-items)** — `realtime.session` tuning config (`effortLevel`/`parallelToolCalls`/`mcpTools`/`inputTranscriptionModel`) now flows config→bag→driver on BOTH topologies (`GetSessionTuningSettings`; the PR #3177 driver features are live end-to-end); per-modality usage detail (`RealtimeUsage.Input/OutputTokenDetails`) captured by the OpenAI driver, accumulated by the runner, and persisted on the realtime `AIPromptRun` for multi-channel cost attribution; HF proxy hardening (optional `MJ_REALTIME_PROXY_ALLOWED_ORIGINS` allowlist, upstream-open deadline, bounded pre-open buffer); the session runner observes the chained cancellation signal and performs bounded transport reconnects (default 1, `MaxTransportReconnects`); MCP approval requests are auto-DENIED so the turn continues instead of dead-air blocking; Gemini scrubs+warns on foreign OpenAI-protocol/transport keys (`REALTIME_SHARED_CONFIG_KEYS` exported from Core); `RealtimeTranscript.ReplacesPrevious` added for streamed-final providers.

  Suite totals after the wave: ai-openai 147, ai-realtime-client 391, ai-agents 1653, ai-gemini 87, ai-xai 50, ai-huggingface 34, MJServer proxy 8 — all passing.

  **Second-pass re-audit fixes**: a follow-up adversarial audit of the hardening itself found the C1 fix was inert (the new realtime.session field was never propagated through the effective-config resolver — now fixed with normalizeSession), plus untested edges introduced by the B2 counter (permanent wedge on a rejected response.create — now self-heals on the error frame), the C7 reconnect (abort/Stop race leaking a live session; stale call_id relayed to the fresh session; no re-entrancy/identity guard — all fixed), the client connect deadline (timer leak on synchronous socket-construction throw), reused-instance socket handling (old socket late close corrupting the new session), the C4 abort window (abort during StartSession lost), model not being a protected wire field, and ReplacesPrevious being ignored at the transcript-persist site. All fixed with regression + interaction-seam tests.

  **Fifth-pass re-audit fixes**: a five-reviewer verification pass found one reachable correctness bug and closed two latent transcript fragilities. (1) The pass-4 client `onErrorFrame` fix cleared the pending narration kind only when no confirmed response was active, so a narration create rejected while a cancelled response drained mistagged the next delegated-answer turn as ephemeral (dropping its transcript) — the kind is now cleared unconditionally on the rejecting error. (2) The transcript in-flight-row bookkeeping moved to an `{id, open}` model so a turn that emits both an interim delta and repeated streamed completeds still collapses to one row, and a short assistant final no longer suppresses the next turn's interim streaming row. Coverage added for the `confirmedResponseActive` busy-lock guard and the per-turn `ReplacesPrevious` reset (xAI + HuggingFace).

  **Fourth-pass re-audit fixes**: a four-reviewer pass found one regression from the third-pass work and several reachable pre-existing defects, all fixed with regression tests. (1) The third-pass usage un-gate let a trailing usage frame accumulate after `Stop()` and arm a post-finalize checkpoint timer — now gated on the runner lifecycle (`!stopped`) instead. (2) `RealtimeTranscript.ReplacesPrevious` is now wired END-TO-END: the shared server session flags the 2nd+ streamed user transcription completed (Grok streams repeated growing finals) and `persistRealtimeTranscript` uses status-disambiguated reuse, so server-bridged Grok/ElevenLabs no longer mint a duplicate `ConversationDetail` per caption (previously the flag was only ever set client-side). (3) The client `onErrorFrame` self-heal now clears the eager `responseActive`/narration phantom left by a rejected local `response.create` (a `confirmedResponseActive` flag distinguishes it from a live VAD turn) so `IsBusy` no longer wedges on compat endpoints. (4) The tool broker aborts EVERY concurrent delegation on barge-in (was: only the newest, orphaning the rest). (5) The HuggingFace server session declares its native 16 kHz sample rate (was: bridge fell back to 24 kHz into a 16 kHz pipeline). (6) A stuck delegate can no longer leak stale narration-burst timing across a reconnect (burst state reset decoupled from the delegation counter).

  **Third-pass re-audit fixes**: a third adversarial pass against the latest `next` found three residual seams: (1) the C8 transcript-persist fix only bound the in-flight key on the INTERIM branch, so a FINALS-ONLY streamed provider (e.g. Grok user captions, ElevenLabs corrections) that never emits an interim delta still minted a duplicate `ConversationDetail` row per correction — the create+finalize branch now binds the key too; (2) the C7 reconnect blanket-zeroed the runner's shared `activeDelegations` counter, which — combined with each aborted delegation's self-decrementing `finally` — could double-decrement and steal a CONCURRENT post-reconnect delegation's narration burst; the reset is gone (frames self-unwind); (3) `OnUsage` was identity-gated like every other handler, so a trailing usage frame flushed on the just-dropped socket was silently discarded — usage is runner-GLOBAL (cumulative) and is now un-gated. Plus a bounded-worst-case characterization test for the S1 self-heal. All fixed with regression + interaction-seam tests.

### Patch Changes

- 42fc86b: Stop a mid-sentence pause from splitting one spoken utterance into several transcript turns.

  Providers that stream input transcription (Grok) re-emit the **full accumulated utterance** on every `input_audio_transcription.completed`, and their VAD fires `speech_started` on ordinary mid-sentence breaths. Treating each `speech_started` as a hard turn boundary therefore split one spoken thought into several persisted turns, each a longer copy of the last — observed live as three conversation rows for a single sentence:

  ```
  "...including whiteboarding, uh, remote."
  "...including whiteboarding, uh, remote, so just get going."
  "...including whiteboarding, uh, remote, so just get going. Show me some cool stuff."
  ```

  Adds `IsTranscriptContinuation` (new, dependency-free module in `@memberjunction/ai`): a caption that **extends** the utterance already in flight is now recognized as a continuation and flagged `ReplacesPrevious`, collapsing the stream into one in-place-updating turn. Crucially the comparison is **normalized** (lowercased, punctuation/whitespace collapsed) because ASR engines re-punctuate as a sentence grows — in the production case above the earlier text is _not_ a literal prefix of the later one (`remote.` became `remote,`), so a naive prefix test missed roughly half the occurrences.

  The continuation window closes when the model takes the floor (`response.created`), so two genuinely separate utterances that happen to share an opening can never be merged.

  Applied identically in the shared server session (`OpenAIRealtimeSession`, inherited by Grok/HuggingFace) and the client-direct xAI driver, so both topologies collapse the stream the same way. A new `onResponseStarted()` hook on the shared client brain gives drivers a seam for per-user-turn state. No behavior change for single-completed providers such as OpenAI, which never produce a continuation to detect.

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

### Minor Changes

- c20723a: Add a self-hosted **HuggingFace speech-to-speech** realtime (voice) provider, sitting side-by-side with the cloud realtime providers (OpenAI, Gemini, ElevenLabs, AssemblyAI) with no host changes. It treats HuggingFace's open-source VAD → STT → LLM → TTS stack (in its OpenAI-Realtime-compatible `/v1/realtime` mode) as a `Realtime` model — private-by-design (audio never leaves owned infrastructure), cost-free, and component-swappable.

  Because the endpoint is self-hosted, the shipped client-direct audio topology runs through a new provider-agnostic **MJAPI realtime proxy**: the driver mints a one-time ticket into a shared `RealtimeProxyRegistry` (`@memberjunction/ai`) and hands the browser a `wss://<mjapi-public>/realtime-proxy?ticket=…` URL, so the internal endpoint + auth never reach the browser and the box needs no browser-facing ingress. Adds the new `@memberjunction/ai-huggingface` driver package, the `HuggingFaceRealtimeClient` (`@memberjunction/ai-realtime-client`), the `RealtimeProxyServer` + single upgrade-router in `@memberjunction/server`, the class-registration manifest entry (`@memberjunction/server-bootstrap`), and the client-load wiring (`@memberjunction/ng-conversations`), plus the `Hugging Face` vendor + `HuggingFace Speech-to-Speech` model metadata (low PowerRank — opt-in). Additive only; endpoint/auth/sample-rate are deployment config.

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

### Minor Changes

- aa9102d: feat(media+realtime): generic media player, end-to-end media streaming, and the realtime/LiveKit recording stack

  A new media + recording platform spanning the player, storage, server, and the realtime/voice stack.

  **Generic media player (`@memberjunction/ng-media-player`, new package)** — a framework-agnostic
  `mj-media-player` (transport, click/drag scrubber, playback speed, ±skip, keyboard, fullscreen,
  multi-track video grid, a real decoded audio waveform that doubles as the scrubber and accepts
  precomputed `MediaTrack.Peaks`, a time-synced clickable transcript, loading/buffering state with an
  `aria-live` status, cancelable `Before*` events, and an imperative API) plus an MJStorage-bound
  `mj-storage-media-player` that resolves a `FileID` to an authenticated, range-streamed source. The
  artifact audio/video viewers and previews now embed it.

  **MJStorage streaming (`@memberjunction/storage`)** — `FileStorageBase.GetObjectStream` +
  `SupportsStreaming` + `StreamingNotSupportedError`, implemented for all seven drivers (Box, AWS S3,
  Azure, GCS, Google Drive, SharePoint, Dropbox).

  **Authenticated media delivery (`@memberjunction/server`)** — a `CreateMediaAccessToken` mutation
  (short-lived, permission-gated, returns precomputed waveform peaks) and a `GET /media/:fileId?token=`
  HTTP-Range streaming route — any stored asset is served to the browser by `FileID` with real
  streaming + permissions, no public links.

  **Realtime co-agent recording (`@memberjunction/ng-conversations`, `@memberjunction/ai-realtime-client`,
  `@memberjunction/ai-agents`)** — client-direct sessions record a seekable 16-bit WAV with capture-time
  waveform peaks (a `peaks.json` sidecar); the agent's remote audio is mixed in when its WebRTC track
  lands (`OnRemoteMediaStream`/`AttachRemoteStream`); transcript cue timing anchors to real audio onset
  across tool-call gaps; recorded sessions stream back through the player. Plus reactive fixes
  (`ConversationEngine.EnsureConversationLoaded` in `@memberjunction/core-entities`) so new conversations
  and recordings appear without a refresh.

  **LiveKit meeting recording (`@memberjunction/livekit-room-server`, `@memberjunction/server`,
  `@memberjunction/graphql-dataprovider`, `@memberjunction/ng-mj-livekit-room`)** — egress output is
  registered as an `MJ: Files` row linked to the Meeting-Room `Conversation` (new `RecordingFileID` /
  `EgressID`), with point-at-sink or copy-to-canonical storage, and played back in the Meet UI.

  **Realtime surface-tab overhaul (`@memberjunction/ng-conversations`)** — channel tabs appear only once
  used (Whiteboard excepted), each color/icon-coded; the Activity tab is gated, restyled, and
  right-aligned; agent-run artifacts move out of per-artifact tabs into the Activity tab with a
  resizable, `UserInfoEngine`-persisted split viewer.

  The Media channel can now show MJStorage files (`fileId`) in addition to URLs. The realtime
  recordings dashboard (`@memberjunction/ng-dashboards`) and CodeGen-regenerated entity forms
  (`@memberjunction/ng-core-entity-forms`) reflect the new recording fields.

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

### Minor Changes

- 6f227ab: Realtime voice co-agent: direct channel control, full observability, Grok client-direct, and channel onboarding.
  - **Direct channel control** — the voice co-agent now drives interactive channels (the `browser_` and `Whiteboard_` tools) DIRECTLY instead of delegating every request to the target agent. The framing was fixed in both the client-direct path (`realtime-client-session-service.ts`, the path actually used) and the server-bridged path (`base-agent.ts`). A one-line mint log now surfaces the exact tools + framing reaching the model.
  - **Auto/Default model resolution** — now walks candidate Realtime models by power and returns the first that fully resolves to a usable client-direct driver, instead of dead-ending on a keyless or non-client-direct top pick (e.g. a newly-seeded Grok/Inworld model outranking GPT Realtime).
  - **Co-agent observability** — the co-agent's long-lived `AIPromptRun` now captures the full conversation: transcript turns AND channel tool calls (recorded run-only as `🔧 <tool> … → <result>`), closing the gap where the run held only token totals. Observability parity with every other MJ agent run.
  - **Grok Voice client-direct** — implemented xAI's OpenAI-Realtime-compatible client-direct topology: server ephemeral-token mint (`CreateClientSession` + `SupportsClientDirect`) plus a new browser-side WebSocket-audio client driver in `@memberjunction/ai-realtime-client` (registered under `Provider: 'xai'`). Grok is now selectable for voice sessions.
  - **Channel onboarding** — a first-run intro/details panel generalized to any interactive channel (Whiteboard, Remote Browser, future ones) via an optional `GetOnboardingDetails()` on `BaseRealtimeChannelClient`; excluded for the base Voice channel and persisted per-user via `UserInfoEngine`.
  - **Fix** — NG0100 `ExpressionChangedAfterItHasBeenCheckedError` on channel reveal (agent-activity tab mutations now deferred to a microtask).

- cd6c5f0: Realtime AI Agents wave 3: consolidated v5.41 migration (sessions, channels, co-agent schema) with the AIAgentCoAgent affinity registry replacing AIAgentPairedAgent — typed relationship vocabulary (CoAgent implemented; Peer/Delegate/Fallback/Reviewer/Observer reserved), type-level co-agent defaults as junction rows (removing the only FK cycle in core MJ), and the full code sweep (engine cache, resolver resolution chain, server-side invariants, client pairing reads, regenerated manifests). Realtime UX: progressive-disclosure voice console with persisted captions preference, user-owned composer and tabs toggles, audio-reactive visuals; whiteboard pages/multi-select and review-persistence fixes. Gemini Live triggering turns ride realtime text so widget clicks/typed input/narration speak immediately on native-audio models. CodeGen: single-winner IsNameField enforcement with eligibility guardrail fixes, SCC-based cycle diagnostics, and clean-database bootstrap robustness (conditional engine registry datasets).

### Patch Changes

- 8c8b658: Realtime UX wave 2 — the progressive-disclosure console (pure-audio-first overlay with the breathing hero orb, disclosure levels 0–4 ratcheted per-user via UserInfoEngine, gear density escape hatch, unified app-bar, fused composer dock; content never flips the console open — the one auto-reveal is a channel's first agent activity, finished artifacts arrive as glowing unfocused tabs, Activity tab pinned last); audio-reactive call visuals (BaseRealtimeClient GetAudioActivity capability — per-direction RMS + 9-bin spectrum metered on all four drivers via a shared RealtimePcmPlayback master-gain tap / WebRTC stream analysers — driving the hero + app-bar orbs and a true-spectrum EQ through a zero-CD rAF loop, with turn-state fallback). Whiteboard: OneNote-style PAGES (v2 JSON with tolerant v1 migration, AddPage/SwitchPage/RenamePage agent tools, page strip with inline rename + right-click Rename/Delete/New-page context menus, agent-authored page garnish), multi-select (marquee, shift-click, single-undo group drag/delete), hold-to-zoom, multi-page HTML/SVG export, shared active-page note on all item tools, UUIDsEqual compliance. ElevenLabs: tool-schema sanitizer (non-string enums + leaf descriptions, fingerprint-stable) and the absorbed-tool-result voice nudge. Conversations: shared auto-naming helper + race-free realtime naming lifecycle on SessionStarted$, slide-panel splitter rework, angular-split dependency removed. Plus integration-test script groundwork (server/client/runquery cache suites) and cache-layer fixes carried on this branch.
- 15b743b: Real-Time AI Agents — Sessions, Channels & the Realtime Model (plans/ai-agent-sessions.md). Adds the AIAgentSession/AIAgentChannel/AIAgentSessionChannel schema (+ AgentSessionID on AIAgentRun/ConversationDetail, CloseReason on AIAgentSession); the BaseRealtimeModel server primitive with OpenAIRealtime + GeminiRealtime drivers (server-bridged StartSession and client-direct ephemeral-token CreateClientSession, optional SendContextNote/RequestSpokenUpdate interim updates); the new @memberjunction/ai-realtime-client package with the BaseRealtimeClient browser abstraction + OpenAI/Gemini client drivers resolved via ClassFactory by provider key; the Realtime agent type + Voice Co-Agent with RealtimeSessionRunner/RealtimeToolBroker, AgentMemoryContextBuilder extraction, server session lifecycle (SessionManager, SessionJanitor, start/close/heartbeat + client-direct resolvers with delegated-run progress streaming, AwaitingFeedback resume, co-agent observability runs, user-selectable realtime model); the full-panel realtime voice call UX in ng-conversations (phone trigger + agent/model picker, banner/thread/activity rail, delegation working/result cards with provenance, ephemeral paced first-person progress narration driven by DB prompt templates, in-call text composer); Realtime Voice admin (AI Analytics dashboard sections, session/channel custom forms, agent Runs|Sessions execution history); and Query Builder/Strategist reliability fixes (entity catalog in prompt, Get Entity Details sample caps + semantic fallback, plan formatting). Also: the standalone @memberjunction/ng-whiteboard package (collaborative board with agent tool API, sandboxed interactive widgets + input bridge, markdown panels, exports, cancelable before/after events); ElevenLabs Agents + AssemblyAI Voice Agent realtime provider pairs (4-provider matrix, zero contract changes); session review mode with multi-leg resume carryover (timeline dividers, artifact junction closure, prior-transcript model hydration); delegation cancel channel; usage telemetry relay; Realtime Co-Agent rename with run-step/prompt-run observability.
- 1568bae: Realtime ledger completion + two field bugs. SERVER CHANNEL PLUGIN HALF: `ServerPluginClass` is now consumed — `BaseRealtimeChannelServer` lifecycle contract in @memberjunction/ai, `RealtimeChannelServerHost` (ClassFactory resolution mirroring the client half, per-session instances, failure-isolated hooks, post-close dispose linger) in ai-agents with a `WhiteboardChannelServer` reference impl that validates/canonicalizes landed board saves, wired through SessionManager create/close and the channel-state save path. TRANSCRIPT CORRECTIONS END-TO-END: `RealtimeClientTranscript.ReplacesPrevious` (stamped by the ElevenLabs driver on `agent_response_correction`) replaces the caption in place and `RelayRealtimeTranscript(replacesPrevious)` updates the persisted turn instead of appending. ASSEMBLYAI RESUME WINDOW: one-shot `session.resume` reattach on unexpected socket drop (mic/playout survive; failed/second drop falls through to the old fatal path). WHITEBOARD: widget srcdoc rebuilt per mount via a view-scoped pure pipe — SVG charts survive page switches/lazy remounts, and mounted widgets no longer reload on unrelated journal ops (the old journal-invalidated identity cache was both stale on remount and over-eager on 'replace'). CONVERSATIONS: surface-panel (re)creation lands on the marquee channel tab (the whiteboard) instead of the Activity rail, the agent's first stroke reveals synchronously, and session review now merges channel states across ALL chain legs (newest leg with a saved board wins) so resumed sessions never hide an earlier leg's drawing. Plus Per-Minute/Per-Hour AI model price unit types seeded via metadata.
- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [15b743b]
- Updated dependencies [1568bae]
  - @memberjunction/ai@5.41.0
  - @memberjunction/global@5.41.0

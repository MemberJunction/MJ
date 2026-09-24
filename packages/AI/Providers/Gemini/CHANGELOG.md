# Change Log - @memberjunction/ai-gemini

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

### Minor Changes

- 5ecfdb4: Realtime voice agents can now **speak first**.

  Conversation-start behavior is not instruction-following: an ElevenLabs realtime agent with no `first_message` produces no audio at all until it receives user audio, whatever the persona prompt says. Every ElevenLabs realtime session therefore opened in silence, waiting for the human to guess they should talk (issue #3557).
  - **`ElevenLabsRealtime`** now sends an `agent.first_message` conversation-config override, built alongside the existing prompt and voice overrides, so both topologies (server-bridged and client-direct) carry it. The managed agent enables the override, and — because `OverridesSatisfied` requires it too — an agent provisioned by an earlier MJ version is re-PATCHed on next use instead of silently dropping it forever (the failure mode behind #3374). Omitting it preserves today's wait-for-the-user behavior exactly.
  - **New persona slot `realtime.voice.default.firstMessage`** authors the opening utterance without naming a vendor, filed onto whichever driver resolves under the neutral `firstMessage` key — the same shape as the agnostic `voice`. It reaches both realtime host paths (`BaseAgent` server-bridged and `RealtimeClientSessionService` client-direct). The text is spoken VERBATIM; it is the literal opening line, not guidance about how to open.
  - **`AssemblyAIRealtime`** honors the same neutral `firstMessage` key for its `greeting` wire slot. The legacy `greeting` config key still works; `firstMessage` wins when it carries something. Both go through the same trim-and-drop-blank rule as the ElevenLabs driver, so one authored value means the same thing whichever vendor runs — in particular a blank `firstMessage` reads as "none authored" and does not suppress a valid legacy `greeting`.
  - **`firstMessage` is registered in `REALTIME_SHARED_CONFIG_KEYS`**, and the drivers that do not consume it now scrub it. Because an agnostic persona slot is filed onto _whichever_ driver resolves, an unregistered neutral key survives each driver's residual-bag spread and reaches the provider as an unknown session field — it was reaching the OpenAI (and xAI) `session.update` payload on both topologies, and Inworld's raw-override loop was copying it onto the session verbatim. On the OpenAI-protocol endpoints a malformed session object is rejected wholesale, taking the prompt and tools with it. Inworld now scrubs the whole shared vocabulary, closing the same class of leak for the other shared keys too.

  Drivers without a provider-native opening utterance ignore the key and open silently, as before.

- 076fa5d: Add a provider-neutral native tool-calling surface to `BaseLLM`, implement it in the Anthropic, OpenAI and Gemini drivers, give the prompt stack its own configuration bag, and gate the whole thing behind metadata in the prompt runner . MJ's LLM providers have described agent actions as prose in the system prompt and parsed a JSON envelope back; newer agentically-trained models increasingly fight that, and the prose action catalog is most of a 56–104KB Loop system prompt. This lands the plumbing, end to end and switched off. **Nothing in the tool-calling path changes behavior on merge.** The catalog now records which models and vendor servings _can_ do native tool calling — that is the audit this branch produced — but every one of them carries `LLM.DefaultToNativeToolCalling: false`, no prompt sets `LLM.UseNativeToolCalling`, and no MJ caller passes tools, so the gate resolves false on every existing path and each run takes exactly the code it takes today. Capability is a statement of fact and is safe to ship; policy is the switch, and it is off. The first behavior change is a deliberate one: flipping the policy on a specific model, and a caller that supplies tools.

  **Model selection does change on merge, and is not gated.** Query Builder and the Research Agent family (7 agents, 8 prompts) move from `Gemini 3.5 Flash` to `Gemini 3.8 Flash` — 16 `ModelID` changes across 8 prompt seed files. The Flash-Lite rows that outranked them are set `Status: "Inactive"` rather than deleted, because `mj sync push` never deletes; removing the rows from JSON would have left those agents on Flash-Lite in every existing database. Once this metadata is pushed, those eight prompts are served by a different model than they are today.

  `ChatParams` gains `tools` (declarations as JSON Schema — the one format all three vendors accept), `toolChoice` (`'auto' | 'none' | 'required' | { name }`) and `parallelToolCalls`. Responses normalize to `ChatCompletionMessage.toolCalls` with **parsed** arguments plus a `'tool_calls'` finish reason; a turn can carry text _and_ calls, because all three providers structurally allow it, and nothing may assume text exists on a tool-call turn. Multi-turn tool use round-trips through a new `tool` message role and `tool_result` content block, which reuse the existing content-block serialization so tool turns persist correctly in message logs. `BaseLLM.SupportsTools` declares whether a driver has the mapping (default `false`); a driver without it ignores declarations rather than failing.

  **Schema — a JSON bag at the prompt layers.** `AIPrompt.PromptConfiguration` and `AIPromptModel.PromptConfiguration` (`nvarchar(max) NULL`) mirror the model catalog's `ModelConfiguration` cascade, resolving prompt-model over prompt over catalog. This resolves the plan's open question in favour of a bag over bit columns: `AIPrompt` already carries fifty-odd columns, and a bag lets the shape keep adapting without a migration per knob — a knob graduates to a real column when it needs a foreign key or becomes a first-class platform concept. It is named `PromptConfiguration` rather than `Configuration` because `AIPromptModel.ConfigurationID` already makes CodeGen emit a `Configuration` display column in the base view, which a same-named base column would collide with.

  **One source of truth for the modality sections.** `metadata/entities/JSONType-interfaces/IAIConfiguration.ts` now defines `LLMConfigurationSettings`, `RealtimeConfigurationSettings`, `VisionConfigurationSettings` and `AudioConfigurationSettings` once, plus one outer type per column (`IAIModelConfiguration`, `IAIPromptConfiguration`, `IAIPromptModelConfiguration`); all five `EntityField` rows point at that single file. It has to be one file because `JSONTypeDefinition` is stored verbatim and emitted inline per entity — a definition cannot import a sibling. The package-side mirror in `@memberjunction/ai` matches, keeping `AIModelConfiguration` and the existing resolver exports intact (the old section names remain as deprecated aliases). Two typed flags join the `LLM` section: `SupportsNativeToolCalling` (capability — a hard gate) and `DefaultToNativeToolCalling` (policy), joined at the prompt layers by `UseNativeToolCalling` (preference). All are tri-state — absent means _inherit_, distinct from an explicit `false` that overrides a lower layer.

  **Guard.** An assistant turn must carry `toolCalls` for the `tool_result` answering it to be valid; forgetting to copy them is the easy mistake, and Anthropic rejects it with an error naming only an opaque id. `validateToolConversation` now catches orphaned results at the MJ boundary with a message that says what to fix, run from `BaseLLM.ChatCompletion` for tool-capable drivers.

  **Shared conformance suite.** `RunLLMToolCallingConformanceSuite` in `@memberjunction/unit-testing` asserts the provider-independent half of the contract — capability declaration, parsed arguments, the `'tool_calls'` finish reason, text-and-calls coexistence, a text-free call counting as success, the streaming downgrade, and the orphan guard — and is adopted by all three tool-capable drivers. It is a separate entry point from the streaming/cancellation suite so a driver can conform on tools without first scripting a mock for every streaming path. Provider-specific request mapping stays in each driver's own tests.

  Per-provider notes. Anthropic coalesces consecutive tool turns into the single user turn its API requires, so parallel-call results are not orphaned by the role-alternation filler, and drops the empty text block a tool-only turn would otherwise send. OpenAI expands one tool turn into its per-result `tool` messages and surfaces a call whose arguments are malformed JSON rather than dropping it — the agent loop must be able to see a bad call, not silently nothing. Gemini's "no output received from model" guard now accepts a tool call as output; without that, every clean text-free tool call would have been reported as a failed generation. Drivers extending `OpenAILLM` inherit the mapping (OpenRouter, xAI, Zhipu, MiniMax, LlamaCpp); `ai-inception` overrides `SupportsTools` back to false, since Mercury Edit is a next-edit-prediction model on a custom endpoint that takes no `tools` parameter.

  Native tool calling is non-streaming: when a caller requests streaming with tools declared, `BaseLLM` takes the non-streaming path and records `streamingSuppressedForTools` on the result, mirroring the existing streaming-unsupported fallback.

  `ai-cerebras` and `ai-lmstudio` pass MJ roles straight to SDKs that accept only system/user/assistant; both now narrow through the new `toClassicChatMessageRole` helper, which maps `tool` to `user` — the role a tool result reads as to a provider with no tool support.

  **Gating (layer 3).** `AIPromptRunner` is the only layer that reads metadata to decide whether tools go out. The decision itself is a pure function, `ResolveNativeToolCalling`, so the design's truth table is asserted directly rather than through the runner. It resolves inside `executeModel` — per model call, not once per run — because failover can move a run to a (model, vendor) whose capability differs, and the failover loop already threads each candidate's own `AIPromptModel` row so a candidate with no such row contributes no override. Callers supply tools through new `AIPromptParams.tools` / `toolChoice` / `parallelToolCalls`; the runner never invents them. The gate is wrapped so that any failure to resolve configuration degrades to the envelope path — an opt-in enhancement must never fail a run that would otherwise succeed.

  **Instrumentation and fallback (layer 4).** New `AIPromptRun.ToolCallingMode` column (`'Native' | 'Envelope' | 'NativeFallback'`, CHECK-constrained) records which path each run took, so the envelope-vs-native comparison is queryable from run history. It is a column rather than a bag key precisely because its purpose is to be filtered and grouped across many runs. When a native call fails in a _tools-specific_ way — the provider rejecting the declarations, an unusable tool call, a tool-related discarded turn — the runner retries once with tools stripped and records `NativeFallback`. That classification is deliberately narrow and biased toward missing a tool failure rather than catching an unrelated one: a rate limit or context-length error must reach the existing retry/failover logic unchanged. The retry shares the original call's timeout budget rather than silently doubling the caller's timeout.

  **Provider probe.** `integration-test-suite/rigs/native-tool-matrix.ts` sweeps each tool-capable driver directly against live providers across {no tools | auto | none | required | named} × {responseFormat Any | JSON} × an optional thinking axis, recording call well-formedness, parallel count, text/call coexistence, envelope compliance, forcing adherence, finish reason and prompt tokens. It answers the plan's §5.6 and §9.3 open questions with data rather than inference, and it is deliberately not a test: it reports rates, asserts nothing, is dry-run by default, and `mj test` never dispatches it. The evaluators live apart from the runner in `src/native-tool-matrix/` as framework-free pure functions with 37 unit tests, so the measuring instrument is verified on every PR without spending a token. The first sweep against Google found: forcing semantics are 100% honored; **forced tool choice combined with JSON mode is a hard 400 on every current Gemini model**, not just 2.x as the audit had it, which constrains the per-step forcing policy; and Gemini 3.7 Flash under JSON mode answers a tool question natively while ignoring the requested envelope entirely — the malformed-response mechanism reproduced in three calls at the driver layer. It also confirms two PR 2 decisions were load-bearing: text NEVER accompanied a tool call on Google (so the "no text on a tool-call turn" rule is the only case there), and the extended Gemini empty-output guard would otherwise have failed every successful tool call in the sweep.

  **Prompt-exemplar audit (plan open question §9.4).** Every JSON exemplar in `metadata/prompts/` — the shapes agent prompts show models and the `OutputExample` values injected into them — was checked against `LoopAgentResponse`, the validator, and the dispatcher. 20 defects across 8 files, **13 of which made a forced retry the guaranteed outcome of following the prompt**: `message` nested inside `nextStep` on a Chat step (it is top-level; the runtime retries without it) across seven research-agent exemplars, `"type": "Action"` with `action: {name, input}` across six Codesmith exemplars — one labelled "✅ CORRECT Response" — a lowercase `"chat"` the validator accepts case-insensitively and the dispatcher then cannot switch on, and `nextStep: {type: "Success"}` beside `taskComplete: true`. Separately, `database-schema-designer.example.json` had four trailing commas and did not parse: since `AIPromptRunner` parses `OutputExample` as a validation schema and that prompt is `ValidationBehavior: 'Strict'`, **every run of `Database Schema Designer - Main Prompt` failed validation regardless of what the model produced**. Also fixed: raw newlines inside a JSON string, a `//` comment inside an exemplar, bare `...` array placeholders, and invented keys that were silently dropped (`subAgent.payload`, `suggestedResponses`, and Codesmith's `finalCode`/`result`/`iterations`, now written through `payloadChangeRequest` under the names its own `FinalPayloadValidation` requires).

  To stop the class from returning, `LOOP_NEXT_STEP_TYPES` is now exported from `loop-agent-response-type.ts` with two-way compile-time checks against the interface union (a plain `readonly T[]` annotation accepts a subset, so it catches an invented value but not a forgotten one — both directions are asserted), `LoopAgentType.isValidLoopResponse` derives its accept-list from it instead of restating it, and `ai-agents` gains `loop-exemplar-conformance.test.ts`, which brace-matches every shipped exemplar out of `metadata/prompts/` — blockquotes stripped, so quoted and nested-fence exemplars are covered — and fails per offending exemplar. Full findings: prompt-exemplar audit.

  **Two repairs found while building the above.** `integration-test-suite/rigs/lib/harness.ts` re-exported `createRunQueryFixtures` / `teardownRunQueryFixtures`, which had moved into this package's own `runquery-cache` checks. A named re-export of a binding the source module does not provide is an ESM _link-time_ error, so it did not fail where it was written — it took down **all six rigs** that import the shim, before a line of their own code ran, and `tsc` never saw it because `rigs/` sits outside the package's tsconfig `include`. No rig ever used either symbol; removing the two lines revives every rig (verified by linking all sixteen). `src/__tests__/rig-harness-shim.test.ts` guards it by checking each forwarded name against the package's real exports — note that merely importing the shim under vitest does **not** reproduce the failure, because Vite transforms rather than links, so the name check is the part that bites.

  The matrix rig also now proves a credential before spending a sweep on it. A revoked key previously produced one identical 401 per cell — 186 across the two Claude rows — burying the real findings and reporting models as 100%-failed that were never actually asked anything; it now costs one eight-token preflight call per model, plus a mid-sweep abort after three consecutive auth failures, and the run ends by naming every unmeasured model so a partial scorecard cannot pass for a complete one. The classifier (`src/native-tool-matrix/credentials.ts`) is deliberately conservative — a rate limit, quota, unknown model or 5xx is not an auth failure, since a false positive discards a model that would have produced data — and is unit-tested against all three providers' verbatim rejection messages and against near-misses like a token count containing "1401".

  **The Action→tool mapping, measured before the framework implements it — and corrected.** The matrix grew a second scenario family that builds tools from **real `ActionParam` rows** (snapshotted into a fixture so the probe stays database-free) using a faithful restatement of the Action→`ChatTool` table, then asked providers what they make of it. Two results. First, the `Scalar` → `{type: ["string","number","boolean"]}` union type — which appears to contradict §8.2's own "stay inside the cross-provider common subset" rule, since OpenAPI has no union type — measured clean: identical error counts to a conservative `{type:"string"}` arm across 192 calls, and 6/6 tool selection among three real MJ Actions. It stands as written. Second, and less comfortably, `ValueType: 'Other'` → `{type:"object"}` does **not** hold. `Run Ad-hoc Query.Query` is `Other` but carries a SQL string, and typing it as an object makes models emit `Query: {}` — a well-formed, dispatchable, useless call that no well-formedness oracle would catch. Usable arguments: **60% as specified, 100% mapped to `{type:"string"}`** on identical prompts. The mapping has been corrected (`Other`/`MediaOutput` → string; `Simple Object`/`BaseEntity Sub-Class` stay object), its "exact parity with the prose catalog" claim retracted, and the `ValueSchema`-on-`ActionParam` question reopened — the baseline turns out to recover that case only by _guessing_ a type, which is precisely what `ValueSchema` would make unnecessary. The mapping ships here as a tested rig-side module, not as the framework's generator; `observedArguments` was added to the observation record because a failed matcher says fidelity was lost while only the payload says how.

  **The baseline eval harness.** The harness that has to exist _before_ the feature can be measured now exists.

  `trace-validate-sub-agents` (**T1**) is implemented and registered. It was referenced by shipped metadata that never had an implementation: both stock research-agent tests weight it at 0.25 and 0.3, the engine logged `Oracle not found`, and that fraction of each test's score silently vanished while the tests reported green on the rest. It walks the run tree through the **Sub-Agent step's `TargetLogID`** rather than `AIAgentRun.ParentRunID` — the generated ORM is explicit that ParentRunID "records parentage but is not a link the tree traverses" — recursing so a required agent two levels down still counts, and gives partial credit across the `requiredAgents` / `forbiddenAgents` / `minIterations` checks a test configures.

  `PromptEvalDriver` + the `Prompt Eval` test type (**T2**) evaluate ONE model decision from frozen mid-loop state. No action executes: the runner returns the reply and deterministic oracles read it. It is separate from `AgentEvalDriver` because a loop confounds the measurement — a run that recovered on iteration three answers a different question than "does this model, in this state, choose action B". Three easily-missed execution details are handled explicitly: an explicit `contextUser` (#3251), `AIEngine.Config()` before the first run, and `WaitForPendingPromptRunSaves()` before any oracle reads a prompt run back.

  `agent-decision-match` and `response-well-formed` (**T3**) are the decision oracles. The first reads a decision off **whichever channel the model used** — envelope `nextStep.actions[]` or native `ChatToolCall[]` — and scores it against an encoding-independent expectation, which is what makes a baseline cell and a native cell comparable on an identical corpus case. Its details carry the components apart (decision kind / action accuracy / param fidelity / per-matcher outcomes) so §6.1's metrics aggregate out of stored `ResultDetails` without re-running a single model call. The second measures the malformed class on its own, because "malformed rate fell" and "decision accuracy rose" are different claims.

  The corpus (**T4**) ships as golden files under `metadata-optional/prompt-eval-corpus/` with a validating loader, eight starter cases spanning the plan's categories against real shipped agents, and a generator that expands corpus × matrix into `MJ: Tests` records with stable per-cell IDs (so regeneration updates rather than orphans, and `mj test history` survives) plus an estimated-token manifest per run. Verified end to end: 8 cases generate, push, and validate through the real `mj test` pipeline against the registered driver.

  Everything scoring-related lives in `Engine/src/eval/` as **framework-free pure functions** per test plan §2.1 — no import from the testing engine anywhere in that directory — so the same logic runs behind the `IOracle` wrappers today and would run unchanged under the documented bespoke-runner fallback. 45 unit tests pin the instrument, including the rule that a corpus expectation may never name `nextStep` or `toolCalls`.

  **Corpus and harness verification.** The corpus is 57 golden cases spanning every category the test plan's §4.3 table names, written against the real shipped agents and their actual action names: first-step selection, mid-loop params, error recovery, disambiguation across Sage's 26-action catalog, parallel fan-out, sub-agent dispatch through Marketing's five specialists, terminal synthesis, clarify, payload change, forced control flow at the iteration ceiling, and six adversarial cases that specifically detect the malformed shapes MJ's own exemplars taught before the audit.

  A pinned matrix (`matrix/envelope-baseline.json`) fixes the (model, vendor) pairs by catalog ID rather than by name, so a rerun months later addresses the same rows; expanding corpus × matrix yields **399 test records, all validating through `mj test`**.

  `prompt-eval-harness` (IT87) verifies the instrument in the deterministic tier, for zero tokens: every case names capabilities that actually exist (PE1 — which caught two unsatisfiable cases the moment it was written), the generated records have not drifted from the golden files AND cover the pinned matrix in full (PE2 — which caught real drift on its first real run, and whose matrix half exists because a suite generated against the wrong matrix passes every other check while measuring the wrong models under the right name), every expectation is decidable (PE3), a scripted correct reply scores correct through the **real `AIPromptRunner`** with `TestLLM` registered over the driver classes (PE4), five distinct malformed shapes are provably caught (PE5), and a wrong-but-well-formed reply separates decision accuracy from malformed rate (PE6). PE5 is the load-bearing negative: a harness that cannot fail on demand makes every rate it reports a fiction.

  One evaluator gap closed along the way: an undispatchable `nextStep.type` — `'Success'`, or a lower-cased `'chat'` — previously scored as well-formed even though the runtime rejects it into a forced Retry. `evaluateWellFormed` now checks the raw step type against `LOOP_NEXT_STEP_TYPES`, derived from the agent framework rather than restated.

  The deterministic tier is 65/71 with the new bundle in it, 558 oracle results, zero failures.

  **The cost manifest is measured, not guessed.** It originally priced a run at a flat 12,000 tokens of composed prompt per call. Measuring the real templates showed that to be **38% low** — the Loop agent-type system prompt _alone_ is ~12,700 tokens (50KB, consistent with the issue's 56–104KB claim) before any agent's own prompt or its action catalog. Per-agent sizes now range 12.7k (an agent with no actions) to 33k (Report Writer), and the generator reads them from a committed `matrix/prompt-size-baseline.json` regenerated by `rigs/measure-prompt-sizes.cjs`. A full baseline run at N=20 is **~158M prompt tokens, not ~96M** — and that still reads low, since it is chars/4 over raw metadata rather than the rendered catalog. A cost manifest wrong by 64% is worse than none, because it gets believed.

  **The matrix is pinned to the deployed configuration, at N=3, for ~$11.** Two problems with the first pinning, both caught by asking what it would cost. First, it pinned one model per generation per developer — right for the provider probe, wrong for a baseline whose stated job is _"the quantified current-state of the framework"_: only 2 of 15 corpus agents had even one of those models in their real configuration, so it would have measured models nobody deploys. The cells are now the (model, vendor) pairs the agents actually run on, ranked by adoption, led by **GPT-OSS-120B on Cerebras — which all 15 corpus agents list**.

  Second, N=20 was over-specified. The plan justifies it from an experiment that ran 40 repetitions of _one_ prompt, where repetition was the only source of variation; here the corpus is the variation, and 57 cases × N=3 gives 171 observations per cell — well past what a two-proportion test on the aggregate needs. Escalating to N=20 belongs on the (case, cell) pairs that come back non-unanimous, which is the only place more repetition resolves anything.

  GPT 5.5 / 5.5 Instant are excluded on cost: at \$5/\$30 per 1M they were \$121 of a \$196 run, two thirds of the bill for one sixth of the cells. Aggregator pairs (Vertex, Bedrock, OpenRouter, Azure) are deferred to a run where vendor divergence is the thing being measured.

  The manifest now prices in **dollars per cell**, reading `AIModelCost` at pin time so the estimate works offline — a token count nobody can convert is a cost control nobody uses. The full baseline: **285 cells, ~$11.36**, down from $196.

  **A finding that outlives the baseline:** `CerebrasLLM` and `GroqLLM` extend `BaseLLM` directly rather than `OpenAILLM`, so `SupportsTools` is `false` on both. GPT-OSS-120B — the single most-deployed model across the corpus agents — **cannot do native tool calling in MJ today at all**; the gate would resolve `Envelope` whatever metadata is set. Irrelevant to an envelope-only baseline, but it means the primary deployed configuration is not reachable without driver work on those two providers.

  **Native tool calling on Cerebras and Groq — the deployed workhorse.** `CerebrasLLM` and `GroqLLM` extend `BaseLLM` directly rather than `OpenAILLM`, so unlike OpenRouter/xAI/Zhipu/MiniMax/LlamaCpp they inherited nothing and reported `SupportsTools: false`. That mattered more than the provider count suggests: **GPT-OSS-120B on Cerebras is the single most-deployed model across MJ's shipped agents** (all 15 in the eval corpus list it; Groq is second at 11), so the one configuration the feature most needed to reach was the one it could not — the capability gate resolved to the envelope no matter what metadata said.

  Rather than write the mapping a third and fourth time, it now lives once in `@memberjunction/ai` as `openAICompatibleTools.ts`, and **OpenAI delegates to it too**. That format is the de-facto standard — Groq, Cerebras, Fireworks, xAI, Together, LM Studio, DeepSeek, Moonshot, Z.AI, MiniMax and OpenRouter all speak it — and the mapping has three details that are easy to get quietly wrong: arguments cross the wire as a JSON **string**; one MJ tool turn expands into **N** provider `tool` messages; and a call with malformed arguments must be **surfaced**, because an agent loop that sees nothing cannot tell "said nothing" from "said something broken". Four copies of that would drift. The wire types carry an open index signature deliberately — several provider SDKs declare their own with one, and a closed type is not assignable to an open one.

  Two provider-specific facts are encoded rather than assumed. **Groq does not support parallel tool calls on the gpt-oss family** — precisely what MJ deploys most — so `parallel_tool_calls` is forwarded only when a caller sets it explicitly, never inferred. **Cerebras can emit a call to a tool that was never declared**; the shared extractor surfaces it rather than dropping it, so the agent loop can reject it by name instead of receiving silence.

  One latent bug fixed on the way: Groq's converter appended a dummy `"OK"` user message whenever the last turn was not from a user. After tool results that would have separated them from the assistant call they answer — the same hazard as the Anthropic alternation filler — so the filler now skips a turn ending in tool results. Its multimodal branch also cast the role through with `as`, which would have sent a raw `tool` role the API rejects; it narrows through `toClassicChatMessageRole` now.

  Both drivers adopt `RunLLMToolCallingConformanceSuite`, and their `@memberjunction/ai` test mocks import the real mapping by path rather than re-mocking it — a mocked copy would be exactly the second implementation the shared module exists to prevent.

  **Reachable, not enabled.** This makes the deployed configuration _reachable_; whether anything uses it is the policy flag's business, and that ships off (see the capability audit below).

  **`reasoning_effort` gained the two levels it was missing.** `OpenAILLM.getReasoningLevel` accepted `low`/`medium`/`high` or a number and threw on anything else, so OpenAI's `xhigh` and `none` were unreachable through MJ — verified against the live API, whose own rejection message enumerates `none, low, medium, high, xhigh`. Both are now accepted **by name only**: MJ's numeric 1-100 scale is a cross-provider convention whose three bands are replicated in the Groq and Cerebras drivers, so re-banding it to make room would silently reclassify every documented `effortLevel: 85` and mean something different per provider. `AIPromptParams.effortLevel` widens to `number | string` to carry a named level (`.toString()` on the runner's path already handled both); `AIPromptRun.EffortLevel` is a numeric column with a 1-100 CHECK, so a named level is deliberately not persisted there. The GPT-OSS path writes `Reasoning: <level>` into the system prompt rather than sending an API field, and harmony defines only three levels, so it clamps `xhigh`→`high` and `none`→`low`.

  **The hybrid agent loop, opt-in and inert.** Actions are now declarable as native tools and a tool call _is_ an Actions step. `buildActionToolSet` (§8.2) maps `ActionParam` metadata onto JSON Schema using the two mappings measurement settled — `Scalar` keeps the union type, and every opaque `ValueType` becomes `string` rather than `object`, which took usable arguments from 60% to 100% on `Run Ad-hoc Query.Query`. Only `Input`/`Both` params are declared, and a post-sanitization tool-name collision is a hard error at build time, because two Actions sharing one tool name would dispatch whichever registered last — a routing bug that presents as a model error. `LoopAgentType` checks native tool calls **before** the envelope (§8.1): Measurement showed that a model given tools answers through them and stops emitting the envelope entirely on some providers, so the two cannot be asked for in one turn. A call naming an undeclared tool is a Retry naming it, never a silent drop — Cerebras does this at roughly one forced call in six. The loop template drops its action catalog and the `'Actions'` step type under `_NATIVE_TOOL_CALLING` (§8.4), which is where the 56–104KB prompt reduction comes from; the flag is set from the gate's **real** decision before rendering, not from the caller's intent, so a prompt can never suppress its catalog while the model receives no tools. `AIAgentRunStep` gains `ToolCallingMode` and `NativeToolCallCount` (§8.5) so a comparison groups by its independent variable instead of reconstructing it through a lossy join.

  **The capability audit, and the policy that ships off.** `metadata/ai-models/.ai-models.json` now carries `ModelConfiguration.LLM` on **139 model rows** — `SupportsNativeToolCalling: true`, plus `NativeControlFlow: 'implicit'` and `NativeToolResults: true` describing which protocol that model can hold — and **83 vendor-level rows** that override it to `false` for a serving path verified not to accept tools. Those three are statements of fact about a model, and the gate treats capability as a hard gate that no policy can override, so recording them turns nothing on. Every one of the 139 also carries `DefaultToNativeToolCalling: false`: written explicitly rather than omitted, because "we know this model can, and we are choosing not to yet" is the thing a reader needs to see, and flipping it later is then a one-word edit per row rather than a new key. No prompt carries a `UseNativeToolCalling` preference. That is the measurement's own recommendation applied as written: revert the preference, keep the capability flags.

  `BaseAgentType.SupportsNativeToolCalls` (false; `true` on `LoopAgentType`, inherited by Harness) gates whether `BaseAgent` declares an agent's Actions as tools at all — without it a catalog default would have offered tools to the four Flow agents with Actions, whose type cannot read a call back and would have turned every such reply into a Retry.

  A full-corpus comparison then ran both arms — four times at N=3, 1,026 observations each, no observations lost — and returned **NO-GO on all three providers on every run**. The decomposition (results §9) is the useful part. Native tool calling delivers exactly the gain it should: given that an action is the right answer, GPT 5.6-luna acts 76% of the time through the envelope and 96% with tools declared, and every native turn that picks the right tool fills it correctly. That gain is then spent, almost to the turn, on two losses. Tool _selection_ got worse — the same confusion pairs as the envelope, confused more — and richer declarations fixed it only in compact form (outputs and result codes as names, +6 to +11pp on two models) while full-detail prose reversed the gain and cost the smallest model ~700 tokens a call. And models call a tool on 5–20% of turns whose right answer is chat, completion or delegation; that number did not move across four runs and two interventions, is concentrated in five specific corpus cases, and is the blocker. **The prompt-size premise did not hold** on any run: tokens fell on one model and rose on the other two. The single largest source of "wrong tool" in every arm is the action catalog itself — `Search Query Catalog`'s description prescribes search-before-SQL and the corpus expects direct SQL — which is a product question, not a model one. The recommendation on the record is to revert the prompt-level `UseNativeToolCalling` before merge and keep the capability flags, which change nothing on their own.

  **Tool declarations now carry what the prose catalog carries.** `buildToolFromAction` folds output params and result codes into the description, restoring the rule the file already stated (never less informative than the prose). The description ceiling is 1,024 characters as a _measured operating point_ — no provider enforces a limit anywhere near it (all three accepted 8,000 on a live probe), but the compact form measured better than full detail and the code comment says so. `resolveToolChoiceForTurn` forces `'none'` on the last permitted iteration, where a tool call would be executed and discarded; that is correct and unit-tested, and could not affect the single-decision corpus.

  **Six defects the measurement surfaced, all fixed here.** A tool-call-only turn carries no text, and the runner scored that as `No output received from model` — a warning on every native turn, and under `ValidationBehavior: 'Strict'` a retry that could never succeed; tool calls now count as output. The Layer-4 fallback only inspected a _returned_ failed result, but OpenAI's SDK _raises_ its 400, so a tools rejection bypassed the strip-and-retry entirely and hard-failed the run; both shapes now take the same one-shot retry. OpenAI additionally rejects tools alongside `reasoning_effort` on `/v1/chat/completions`, so **native tool calling and reasoning are mutually exclusive on OpenAI until the driver speaks the Responses API** — the earlier probe missed this by testing a non-reasoning model. `CerebrasLLM` drops `response_format` when a request declares tools, which Cerebras rejects outright. On the harness side, `PromptEvalConfig` gained the `toolCallingMode` axis it was always documented to have (an `envelope` cell withholds the declarations the composer attached, which is the gate's `toolsProvided` term and the only difference between the arms); the decision normalizer maps sanitized tool names back to Action names through the framework's own binding table, without which a corpus expectation written as `Execute Code` scores a correct `execute_code` call as the wrong action; and pinned matrix cells now decline vendor failover, after a first attempt lost 42% of its observations to rows that had quietly failed over to a different vendor and were recorded under the pinned one's label.

  `FailoverConfiguration` is now exported from `@memberjunction/ai-prompts` — it is the return type of `getFailoverConfiguration`, a `protected` method documented as an override point, which a subclass outside the package could not name.

  **Implicit control flow (opt-in, and off).** Under `LLM.NativeControlFlow: 'implicit'` the loop stops splitting its turn between two channels: sub-agents are declared as `delegate_to_<name>` tools, `payload_change_request` and `ask_user` join them, a tool call continues the loop, and **plain text with no call ends the turn as task completion**. The Loop agent-type template renders that protocol instead of the `'Actions'`/`'Sub-Agent'`/`'Chat'` step types, which is the rest of the prompt reduction the hybrid could not reach — the hybrid still had to describe the envelope because completion lived there. `ToolCallingMode` gains `'NativeImplicit'` so the two native protocols are distinguishable in run history rather than both reading as `Native`.

  **Tool results as tool turns.** When the catalog says `LLM.NativeToolResults`, a step's action results go back as native `tool` turns answering the assistant's call turn, instead of the markdown "Action results:" user message. `AIAgentRunStep.NativeToolResultsSent` records which encoding a step used, so the scorecard can tell them apart without reconstructing them from `AIPromptRun.Messages`. The two encodings are one function apart: `EncodeToolTurnsAsText` in `@memberjunction/ai` converts native tool turns back to the markdown form, and both the envelope fallback retry and the eval harness's history builder now call it rather than carrying their own copy — the fallback previously stripped the _declarations_ while leaving native `tool` turns in the history, which is a shape no envelope-path provider accepts.

  **Declaration control, per agent and per action.** `AIAgent.DeclareActionsAsNativeTools` and `AIAgentAction.DeclareAsNativeTool` (both `BIT NOT NULL DEFAULT 1`) decide whether an agent's Actions are _supplied_ as tools, independent of whether the gate would use them. Measurement found this was the missing switch: the Research Agent's prompt says it never does work itself, yet declaring its one action made GPT 5.6-luna use it on 7 of 9 turns against 0 of 9 on the envelope. Declaration turns a dormant capability into an active one and no prompt text can undo it, because the prompt already says never. `metadata/agents/.research-agent.json` sets the agent-level flag to `false` for exactly that reason. `AIAgentRunStep.NativeDualChannel` counts the other half of the same finding: turns that carried a tool call _and_ a complete Loop envelope, where the loop takes the call and discards the envelope silently.

  **Provider repairs found by running it.** Gemini rejects a request whose `contents` do not begin with a user turn, and a Skip-style caller that puts everything in the system instruction sends none — every such run died on a 400 naming `function call turn comes immediately after a user turn`. `geminiMessageSpacing` now prepends a minimal user turn when the first turn is the model's. Anthropic gained a `thinking-config` module so a thinking request and tool declarations no longer contradict each other in the mapping.

  **One step-save defect.** `AIAgentRunStep.StepName` is 255 characters and the loop writes a failure message into it; a 327-character provider error therefore failed the step save, and the run reported "2 step record save(s) failed" while hiding the actual error. `BaseAgent.fitStepName` truncates to the column's declared `MaxLength` read off the entity, so the row saves and the message is still readable.

  **Two toolchain repairs, unrelated to the feature but on its path.** `mj dev workspace` generated a root manifest with a `pnpm` block that pnpm 10.33 ignores — settings have to live in `pnpm-workspace.yaml` — and could not express a consumer-scoped override, so a member repo's own copy of a package lost to another member's `workspace:*`. The generator now emits its settings into the workspace file, pins patched packages to their patch version, and resolves duplicate providers with `parent>child` selectors pointing at the owning member. It also relaxes `strict-peer-dependencies` from `true` to `false` in the process: a mixed workspace resolving published `@mj-biz-apps/*` against linked MJ source now reports its peer gaps and completes, where it previously failed the install on peers no member can fix. Separately, `mj app install` resolved hook modules from the repo root only, which fails whenever the app's packages live in an installed tree or a dev-workspace parent; `ResolveHookModule` now walks the installed app packages, the server/client workspaces and the repo root, and names every base it tried when it fails.

  **Schema ships as one migration.** The seven migrations this work accumulated are consolidated into `V202609122036__v6.1.x__Native_Tool_Calling.sql` — hand-written DDL for all four groups above, then the CodeGen fold, generated from a from-scratch database so the tail reflects `next`'s schema rather than overwriting the procs `next`'s own migrations regenerate. The PostgreSQL counterpart is deferred to the release build, per `migrations/CLAUDE.md`.

### Patch Changes

- 102a692: Map the driver-neutral realtime `voice` key to Gemini's `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`, so an authored voice actually reaches a Gemini Live session. Gemini was exempted from the shared-key scrub on the grounds that `voice` is meaningful to it — and it is, but nothing ever translated it: `buildConnectConfig` spread the config bag onto a `LiveConnectConfig`, which has no `voice` property, through an `as` cast that hid the mismatch from `tsc`. The `@google/genai` config converter is a path allowlist, so the value was dropped with no error and nothing on the wire — the same silent-drop bug class fixed one layer up in #3530, one layer down. Fixes #3721.

  `voice` is now consumed before the merge (as `disableAutoResponse` already was) so it can never spread raw, and both realtime topologies are covered by the one mapping: `StartSession` and `CreateClientSession` share `buildConnectConfig`, and the browser driver applies the server-built config verbatim. Because `speechConfig` is a generation-level field it is mask-safe, so the ephemeral-token mint now **token-locks** the voice under `lockAdditionalFields: []` — the server's choice is authoritative on client-direct rather than merely suggested.

  Precedence is per-key at the leaf, matching the #3530 cascade: a caller-supplied raw `speechConfig` keeps whatever voice it already names (a prebuilt voice, a replicated/cloned voice, or a multi-speaker config — documented as mutually exclusive with `voiceConfig`, and rejected outright on any Live session, so a voice is never fabricated beside it), but a raw block that sets only e.g. `languageCode` still receives the authored voice. Block-level winner-takes-all would have re-created the same silent drop in a narrower case. Nothing is dropped in silence: a discarded voice, a blank voice, a non-string `voice`, a `speechConfig` that is not an object, and a `multiSpeakerVoiceConfig` that Live cannot accept are each logged.

  **Behavior change worth watching**: this converts a silent no-op into a live value, so a cross-vendor voice id that previously did nothing on Gemini is now sent as `voiceName`. Verified against the live Gemini API: an invalid name passes the ephemeral-token mint without complaint and then **kills the session when the socket opens** — close code `1007`, `No matching speaker voice found for name: alloy and language:`, surfaced as a `Fatal` session error. So the failure is late and total, not a silent degrade — the same shape as the ElevenLabs note in #3530. Pin the model alongside the voice, or author per-vendor ids under `realtime.voice.providers.<key>`. The driver deliberately does not rewrite that provider error to name the MJ config key: the message already quotes the offending value, so the only thing a translation would add is the key name, and buying it would mean string-matching Google's wording and carrying the sent voice on the session purely to annotate a close frame.

  Unrelated and still open: only `OpenAIRealtime`, `xAIRealtime` and `HuggingFaceRealtime` declare `SupportedVoices` and the native picker's dropdown is gated on that list, so Gemini voices remain reachable through agent metadata and programmatic hosts rather than the picker. The `@google/genai` typings do not enumerate Gemini's prebuilt voice names, so populating that list needs a source outside the SDK.

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

### Minor Changes

- 076fa5d: Add a provider-neutral native tool-calling surface to `BaseLLM`, implement it in the Anthropic, OpenAI and Gemini drivers, give the prompt stack its own configuration bag, and gate the whole thing behind metadata in the prompt runner . MJ's LLM providers have described agent actions as prose in the system prompt and parsed a JSON envelope back; newer agentically-trained models increasingly fight that, and the prose action catalog is most of a 56–104KB Loop system prompt. This lands the plumbing, end to end and switched off. **Nothing in the tool-calling path changes behavior on merge.** The catalog now records which models and vendor servings _can_ do native tool calling — that is the audit this branch produced — but every one of them carries `LLM.DefaultToNativeToolCalling: false`, no prompt sets `LLM.UseNativeToolCalling`, and no MJ caller passes tools, so the gate resolves false on every existing path and each run takes exactly the code it takes today. Capability is a statement of fact and is safe to ship; policy is the switch, and it is off. The first behavior change is a deliberate one: flipping the policy on a specific model, and a caller that supplies tools.

  **Model selection does change on merge, and is not gated.** Query Builder and the Research Agent family (7 agents, 8 prompts) move from `Gemini 3.5 Flash` to `Gemini 3.8 Flash` — 16 `ModelID` changes across 8 prompt seed files. The Flash-Lite rows that outranked them are set `Status: "Inactive"` rather than deleted, because `mj sync push` never deletes; removing the rows from JSON would have left those agents on Flash-Lite in every existing database. Once this metadata is pushed, those eight prompts are served by a different model than they are today.

  `ChatParams` gains `tools` (declarations as JSON Schema — the one format all three vendors accept), `toolChoice` (`'auto' | 'none' | 'required' | { name }`) and `parallelToolCalls`. Responses normalize to `ChatCompletionMessage.toolCalls` with **parsed** arguments plus a `'tool_calls'` finish reason; a turn can carry text _and_ calls, because all three providers structurally allow it, and nothing may assume text exists on a tool-call turn. Multi-turn tool use round-trips through a new `tool` message role and `tool_result` content block, which reuse the existing content-block serialization so tool turns persist correctly in message logs. `BaseLLM.SupportsTools` declares whether a driver has the mapping (default `false`); a driver without it ignores declarations rather than failing.

  **Schema — a JSON bag at the prompt layers.** `AIPrompt.PromptConfiguration` and `AIPromptModel.PromptConfiguration` (`nvarchar(max) NULL`) mirror the model catalog's `ModelConfiguration` cascade, resolving prompt-model over prompt over catalog. This resolves the plan's open question in favour of a bag over bit columns: `AIPrompt` already carries fifty-odd columns, and a bag lets the shape keep adapting without a migration per knob — a knob graduates to a real column when it needs a foreign key or becomes a first-class platform concept. It is named `PromptConfiguration` rather than `Configuration` because `AIPromptModel.ConfigurationID` already makes CodeGen emit a `Configuration` display column in the base view, which a same-named base column would collide with.

  **One source of truth for the modality sections.** `metadata/entities/JSONType-interfaces/IAIConfiguration.ts` now defines `LLMConfigurationSettings`, `RealtimeConfigurationSettings`, `VisionConfigurationSettings` and `AudioConfigurationSettings` once, plus one outer type per column (`IAIModelConfiguration`, `IAIPromptConfiguration`, `IAIPromptModelConfiguration`); all five `EntityField` rows point at that single file. It has to be one file because `JSONTypeDefinition` is stored verbatim and emitted inline per entity — a definition cannot import a sibling. The package-side mirror in `@memberjunction/ai` matches, keeping `AIModelConfiguration` and the existing resolver exports intact (the old section names remain as deprecated aliases). Two typed flags join the `LLM` section: `SupportsNativeToolCalling` (capability — a hard gate) and `DefaultToNativeToolCalling` (policy), joined at the prompt layers by `UseNativeToolCalling` (preference). All are tri-state — absent means _inherit_, distinct from an explicit `false` that overrides a lower layer.

  **Guard.** An assistant turn must carry `toolCalls` for the `tool_result` answering it to be valid; forgetting to copy them is the easy mistake, and Anthropic rejects it with an error naming only an opaque id. `validateToolConversation` now catches orphaned results at the MJ boundary with a message that says what to fix, run from `BaseLLM.ChatCompletion` for tool-capable drivers.

  **Shared conformance suite.** `RunLLMToolCallingConformanceSuite` in `@memberjunction/unit-testing` asserts the provider-independent half of the contract — capability declaration, parsed arguments, the `'tool_calls'` finish reason, text-and-calls coexistence, a text-free call counting as success, the streaming downgrade, and the orphan guard — and is adopted by all three tool-capable drivers. It is a separate entry point from the streaming/cancellation suite so a driver can conform on tools without first scripting a mock for every streaming path. Provider-specific request mapping stays in each driver's own tests.

  Per-provider notes. Anthropic coalesces consecutive tool turns into the single user turn its API requires, so parallel-call results are not orphaned by the role-alternation filler, and drops the empty text block a tool-only turn would otherwise send. OpenAI expands one tool turn into its per-result `tool` messages and surfaces a call whose arguments are malformed JSON rather than dropping it — the agent loop must be able to see a bad call, not silently nothing. Gemini's "no output received from model" guard now accepts a tool call as output; without that, every clean text-free tool call would have been reported as a failed generation. Drivers extending `OpenAILLM` inherit the mapping (OpenRouter, xAI, Zhipu, MiniMax, LlamaCpp); `ai-inception` overrides `SupportsTools` back to false, since Mercury Edit is a next-edit-prediction model on a custom endpoint that takes no `tools` parameter.

  Native tool calling is non-streaming: when a caller requests streaming with tools declared, `BaseLLM` takes the non-streaming path and records `streamingSuppressedForTools` on the result, mirroring the existing streaming-unsupported fallback.

  `ai-cerebras` and `ai-lmstudio` pass MJ roles straight to SDKs that accept only system/user/assistant; both now narrow through the new `toClassicChatMessageRole` helper, which maps `tool` to `user` — the role a tool result reads as to a provider with no tool support.

  **Gating (layer 3).** `AIPromptRunner` is the only layer that reads metadata to decide whether tools go out. The decision itself is a pure function, `ResolveNativeToolCalling`, so the design's truth table is asserted directly rather than through the runner. It resolves inside `executeModel` — per model call, not once per run — because failover can move a run to a (model, vendor) whose capability differs, and the failover loop already threads each candidate's own `AIPromptModel` row so a candidate with no such row contributes no override. Callers supply tools through new `AIPromptParams.tools` / `toolChoice` / `parallelToolCalls`; the runner never invents them. The gate is wrapped so that any failure to resolve configuration degrades to the envelope path — an opt-in enhancement must never fail a run that would otherwise succeed.

  **Instrumentation and fallback (layer 4).** New `AIPromptRun.ToolCallingMode` column (`'Native' | 'Envelope' | 'NativeFallback'`, CHECK-constrained) records which path each run took, so the envelope-vs-native comparison is queryable from run history. It is a column rather than a bag key precisely because its purpose is to be filtered and grouped across many runs. When a native call fails in a _tools-specific_ way — the provider rejecting the declarations, an unusable tool call, a tool-related discarded turn — the runner retries once with tools stripped and records `NativeFallback`. That classification is deliberately narrow and biased toward missing a tool failure rather than catching an unrelated one: a rate limit or context-length error must reach the existing retry/failover logic unchanged. The retry shares the original call's timeout budget rather than silently doubling the caller's timeout.

  **Provider probe.** `integration-test-suite/rigs/native-tool-matrix.ts` sweeps each tool-capable driver directly against live providers across {no tools | auto | none | required | named} × {responseFormat Any | JSON} × an optional thinking axis, recording call well-formedness, parallel count, text/call coexistence, envelope compliance, forcing adherence, finish reason and prompt tokens. It answers the plan's §5.6 and §9.3 open questions with data rather than inference, and it is deliberately not a test: it reports rates, asserts nothing, is dry-run by default, and `mj test` never dispatches it. The evaluators live apart from the runner in `src/native-tool-matrix/` as framework-free pure functions with 37 unit tests, so the measuring instrument is verified on every PR without spending a token. The first sweep against Google found: forcing semantics are 100% honored; **forced tool choice combined with JSON mode is a hard 400 on every current Gemini model**, not just 2.x as the audit had it, which constrains the per-step forcing policy; and Gemini 3.7 Flash under JSON mode answers a tool question natively while ignoring the requested envelope entirely — the malformed-response mechanism reproduced in three calls at the driver layer. It also confirms two PR 2 decisions were load-bearing: text NEVER accompanied a tool call on Google (so the "no text on a tool-call turn" rule is the only case there), and the extended Gemini empty-output guard would otherwise have failed every successful tool call in the sweep.

  **Prompt-exemplar audit (plan open question §9.4).** Every JSON exemplar in `metadata/prompts/` — the shapes agent prompts show models and the `OutputExample` values injected into them — was checked against `LoopAgentResponse`, the validator, and the dispatcher. 20 defects across 8 files, **13 of which made a forced retry the guaranteed outcome of following the prompt**: `message` nested inside `nextStep` on a Chat step (it is top-level; the runtime retries without it) across seven research-agent exemplars, `"type": "Action"` with `action: {name, input}` across six Codesmith exemplars — one labelled "✅ CORRECT Response" — a lowercase `"chat"` the validator accepts case-insensitively and the dispatcher then cannot switch on, and `nextStep: {type: "Success"}` beside `taskComplete: true`. Separately, `database-schema-designer.example.json` had four trailing commas and did not parse: since `AIPromptRunner` parses `OutputExample` as a validation schema and that prompt is `ValidationBehavior: 'Strict'`, **every run of `Database Schema Designer - Main Prompt` failed validation regardless of what the model produced**. Also fixed: raw newlines inside a JSON string, a `//` comment inside an exemplar, bare `...` array placeholders, and invented keys that were silently dropped (`subAgent.payload`, `suggestedResponses`, and Codesmith's `finalCode`/`result`/`iterations`, now written through `payloadChangeRequest` under the names its own `FinalPayloadValidation` requires).

  To stop the class from returning, `LOOP_NEXT_STEP_TYPES` is now exported from `loop-agent-response-type.ts` with two-way compile-time checks against the interface union (a plain `readonly T[]` annotation accepts a subset, so it catches an invented value but not a forgotten one — both directions are asserted), `LoopAgentType.isValidLoopResponse` derives its accept-list from it instead of restating it, and `ai-agents` gains `loop-exemplar-conformance.test.ts`, which brace-matches every shipped exemplar out of `metadata/prompts/` — blockquotes stripped, so quoted and nested-fence exemplars are covered — and fails per offending exemplar. Full findings: prompt-exemplar audit.

  **Two repairs found while building the above.** `integration-test-suite/rigs/lib/harness.ts` re-exported `createRunQueryFixtures` / `teardownRunQueryFixtures`, which had moved into this package's own `runquery-cache` checks. A named re-export of a binding the source module does not provide is an ESM _link-time_ error, so it did not fail where it was written — it took down **all six rigs** that import the shim, before a line of their own code ran, and `tsc` never saw it because `rigs/` sits outside the package's tsconfig `include`. No rig ever used either symbol; removing the two lines revives every rig (verified by linking all sixteen). `src/__tests__/rig-harness-shim.test.ts` guards it by checking each forwarded name against the package's real exports — note that merely importing the shim under vitest does **not** reproduce the failure, because Vite transforms rather than links, so the name check is the part that bites.

  The matrix rig also now proves a credential before spending a sweep on it. A revoked key previously produced one identical 401 per cell — 186 across the two Claude rows — burying the real findings and reporting models as 100%-failed that were never actually asked anything; it now costs one eight-token preflight call per model, plus a mid-sweep abort after three consecutive auth failures, and the run ends by naming every unmeasured model so a partial scorecard cannot pass for a complete one. The classifier (`src/native-tool-matrix/credentials.ts`) is deliberately conservative — a rate limit, quota, unknown model or 5xx is not an auth failure, since a false positive discards a model that would have produced data — and is unit-tested against all three providers' verbatim rejection messages and against near-misses like a token count containing "1401".

  **The Action→tool mapping, measured before the framework implements it — and corrected.** The matrix grew a second scenario family that builds tools from **real `ActionParam` rows** (snapshotted into a fixture so the probe stays database-free) using a faithful restatement of the Action→`ChatTool` table, then asked providers what they make of it. Two results. First, the `Scalar` → `{type: ["string","number","boolean"]}` union type — which appears to contradict §8.2's own "stay inside the cross-provider common subset" rule, since OpenAPI has no union type — measured clean: identical error counts to a conservative `{type:"string"}` arm across 192 calls, and 6/6 tool selection among three real MJ Actions. It stands as written. Second, and less comfortably, `ValueType: 'Other'` → `{type:"object"}` does **not** hold. `Run Ad-hoc Query.Query` is `Other` but carries a SQL string, and typing it as an object makes models emit `Query: {}` — a well-formed, dispatchable, useless call that no well-formedness oracle would catch. Usable arguments: **60% as specified, 100% mapped to `{type:"string"}`** on identical prompts. The mapping has been corrected (`Other`/`MediaOutput` → string; `Simple Object`/`BaseEntity Sub-Class` stay object), its "exact parity with the prose catalog" claim retracted, and the `ValueSchema`-on-`ActionParam` question reopened — the baseline turns out to recover that case only by _guessing_ a type, which is precisely what `ValueSchema` would make unnecessary. The mapping ships here as a tested rig-side module, not as the framework's generator; `observedArguments` was added to the observation record because a failed matcher says fidelity was lost while only the payload says how.

  **The baseline eval harness.** The harness that has to exist _before_ the feature can be measured now exists.

  `trace-validate-sub-agents` (**T1**) is implemented and registered. It was referenced by shipped metadata that never had an implementation: both stock research-agent tests weight it at 0.25 and 0.3, the engine logged `Oracle not found`, and that fraction of each test's score silently vanished while the tests reported green on the rest. It walks the run tree through the **Sub-Agent step's `TargetLogID`** rather than `AIAgentRun.ParentRunID` — the generated ORM is explicit that ParentRunID "records parentage but is not a link the tree traverses" — recursing so a required agent two levels down still counts, and gives partial credit across the `requiredAgents` / `forbiddenAgents` / `minIterations` checks a test configures.

  `PromptEvalDriver` + the `Prompt Eval` test type (**T2**) evaluate ONE model decision from frozen mid-loop state. No action executes: the runner returns the reply and deterministic oracles read it. It is separate from `AgentEvalDriver` because a loop confounds the measurement — a run that recovered on iteration three answers a different question than "does this model, in this state, choose action B". Three easily-missed execution details are handled explicitly: an explicit `contextUser` (#3251), `AIEngine.Config()` before the first run, and `WaitForPendingPromptRunSaves()` before any oracle reads a prompt run back.

  `agent-decision-match` and `response-well-formed` (**T3**) are the decision oracles. The first reads a decision off **whichever channel the model used** — envelope `nextStep.actions[]` or native `ChatToolCall[]` — and scores it against an encoding-independent expectation, which is what makes a baseline cell and a native cell comparable on an identical corpus case. Its details carry the components apart (decision kind / action accuracy / param fidelity / per-matcher outcomes) so §6.1's metrics aggregate out of stored `ResultDetails` without re-running a single model call. The second measures the malformed class on its own, because "malformed rate fell" and "decision accuracy rose" are different claims.

  The corpus (**T4**) ships as golden files under `metadata-optional/prompt-eval-corpus/` with a validating loader, eight starter cases spanning the plan's categories against real shipped agents, and a generator that expands corpus × matrix into `MJ: Tests` records with stable per-cell IDs (so regeneration updates rather than orphans, and `mj test history` survives) plus an estimated-token manifest per run. Verified end to end: 8 cases generate, push, and validate through the real `mj test` pipeline against the registered driver.

  Everything scoring-related lives in `Engine/src/eval/` as **framework-free pure functions** per test plan §2.1 — no import from the testing engine anywhere in that directory — so the same logic runs behind the `IOracle` wrappers today and would run unchanged under the documented bespoke-runner fallback. 45 unit tests pin the instrument, including the rule that a corpus expectation may never name `nextStep` or `toolCalls`.

  **Corpus and harness verification.** The corpus is 57 golden cases spanning every category the test plan's §4.3 table names, written against the real shipped agents and their actual action names: first-step selection, mid-loop params, error recovery, disambiguation across Sage's 26-action catalog, parallel fan-out, sub-agent dispatch through Marketing's five specialists, terminal synthesis, clarify, payload change, forced control flow at the iteration ceiling, and six adversarial cases that specifically detect the malformed shapes MJ's own exemplars taught before the audit.

  A pinned matrix (`matrix/envelope-baseline.json`) fixes the (model, vendor) pairs by catalog ID rather than by name, so a rerun months later addresses the same rows; expanding corpus × matrix yields **399 test records, all validating through `mj test`**.

  `prompt-eval-harness` (IT87) verifies the instrument in the deterministic tier, for zero tokens: every case names capabilities that actually exist (PE1 — which caught two unsatisfiable cases the moment it was written), the generated records have not drifted from the golden files AND cover the pinned matrix in full (PE2 — which caught real drift on its first real run, and whose matrix half exists because a suite generated against the wrong matrix passes every other check while measuring the wrong models under the right name), every expectation is decidable (PE3), a scripted correct reply scores correct through the **real `AIPromptRunner`** with `TestLLM` registered over the driver classes (PE4), five distinct malformed shapes are provably caught (PE5), and a wrong-but-well-formed reply separates decision accuracy from malformed rate (PE6). PE5 is the load-bearing negative: a harness that cannot fail on demand makes every rate it reports a fiction.

  One evaluator gap closed along the way: an undispatchable `nextStep.type` — `'Success'`, or a lower-cased `'chat'` — previously scored as well-formed even though the runtime rejects it into a forced Retry. `evaluateWellFormed` now checks the raw step type against `LOOP_NEXT_STEP_TYPES`, derived from the agent framework rather than restated.

  The deterministic tier is 65/71 with the new bundle in it, 558 oracle results, zero failures.

  **The cost manifest is measured, not guessed.** It originally priced a run at a flat 12,000 tokens of composed prompt per call. Measuring the real templates showed that to be **38% low** — the Loop agent-type system prompt _alone_ is ~12,700 tokens (50KB, consistent with the issue's 56–104KB claim) before any agent's own prompt or its action catalog. Per-agent sizes now range 12.7k (an agent with no actions) to 33k (Report Writer), and the generator reads them from a committed `matrix/prompt-size-baseline.json` regenerated by `rigs/measure-prompt-sizes.cjs`. A full baseline run at N=20 is **~158M prompt tokens, not ~96M** — and that still reads low, since it is chars/4 over raw metadata rather than the rendered catalog. A cost manifest wrong by 64% is worse than none, because it gets believed.

  **The matrix is pinned to the deployed configuration, at N=3, for ~$11.** Two problems with the first pinning, both caught by asking what it would cost. First, it pinned one model per generation per developer — right for the provider probe, wrong for a baseline whose stated job is _"the quantified current-state of the framework"_: only 2 of 15 corpus agents had even one of those models in their real configuration, so it would have measured models nobody deploys. The cells are now the (model, vendor) pairs the agents actually run on, ranked by adoption, led by **GPT-OSS-120B on Cerebras — which all 15 corpus agents list**.

  Second, N=20 was over-specified. The plan justifies it from an experiment that ran 40 repetitions of _one_ prompt, where repetition was the only source of variation; here the corpus is the variation, and 57 cases × N=3 gives 171 observations per cell — well past what a two-proportion test on the aggregate needs. Escalating to N=20 belongs on the (case, cell) pairs that come back non-unanimous, which is the only place more repetition resolves anything.

  GPT 5.5 / 5.5 Instant are excluded on cost: at \$5/\$30 per 1M they were \$121 of a \$196 run, two thirds of the bill for one sixth of the cells. Aggregator pairs (Vertex, Bedrock, OpenRouter, Azure) are deferred to a run where vendor divergence is the thing being measured.

  The manifest now prices in **dollars per cell**, reading `AIModelCost` at pin time so the estimate works offline — a token count nobody can convert is a cost control nobody uses. The full baseline: **285 cells, ~$11.36**, down from $196.

  **A finding that outlives the baseline:** `CerebrasLLM` and `GroqLLM` extend `BaseLLM` directly rather than `OpenAILLM`, so `SupportsTools` is `false` on both. GPT-OSS-120B — the single most-deployed model across the corpus agents — **cannot do native tool calling in MJ today at all**; the gate would resolve `Envelope` whatever metadata is set. Irrelevant to an envelope-only baseline, but it means the primary deployed configuration is not reachable without driver work on those two providers.

  **Native tool calling on Cerebras and Groq — the deployed workhorse.** `CerebrasLLM` and `GroqLLM` extend `BaseLLM` directly rather than `OpenAILLM`, so unlike OpenRouter/xAI/Zhipu/MiniMax/LlamaCpp they inherited nothing and reported `SupportsTools: false`. That mattered more than the provider count suggests: **GPT-OSS-120B on Cerebras is the single most-deployed model across MJ's shipped agents** (all 15 in the eval corpus list it; Groq is second at 11), so the one configuration the feature most needed to reach was the one it could not — the capability gate resolved to the envelope no matter what metadata said.

  Rather than write the mapping a third and fourth time, it now lives once in `@memberjunction/ai` as `openAICompatibleTools.ts`, and **OpenAI delegates to it too**. That format is the de-facto standard — Groq, Cerebras, Fireworks, xAI, Together, LM Studio, DeepSeek, Moonshot, Z.AI, MiniMax and OpenRouter all speak it — and the mapping has three details that are easy to get quietly wrong: arguments cross the wire as a JSON **string**; one MJ tool turn expands into **N** provider `tool` messages; and a call with malformed arguments must be **surfaced**, because an agent loop that sees nothing cannot tell "said nothing" from "said something broken". Four copies of that would drift. The wire types carry an open index signature deliberately — several provider SDKs declare their own with one, and a closed type is not assignable to an open one.

  Two provider-specific facts are encoded rather than assumed. **Groq does not support parallel tool calls on the gpt-oss family** — precisely what MJ deploys most — so `parallel_tool_calls` is forwarded only when a caller sets it explicitly, never inferred. **Cerebras can emit a call to a tool that was never declared**; the shared extractor surfaces it rather than dropping it, so the agent loop can reject it by name instead of receiving silence.

  One latent bug fixed on the way: Groq's converter appended a dummy `"OK"` user message whenever the last turn was not from a user. After tool results that would have separated them from the assistant call they answer — the same hazard as the Anthropic alternation filler — so the filler now skips a turn ending in tool results. Its multimodal branch also cast the role through with `as`, which would have sent a raw `tool` role the API rejects; it narrows through `toClassicChatMessageRole` now.

  Both drivers adopt `RunLLMToolCallingConformanceSuite`, and their `@memberjunction/ai` test mocks import the real mapping by path rather than re-mocking it — a mocked copy would be exactly the second implementation the shared module exists to prevent.

  **Reachable, not enabled.** This makes the deployed configuration _reachable_; whether anything uses it is the policy flag's business, and that ships off (see the capability audit below).

  **`reasoning_effort` gained the two levels it was missing.** `OpenAILLM.getReasoningLevel` accepted `low`/`medium`/`high` or a number and threw on anything else, so OpenAI's `xhigh` and `none` were unreachable through MJ — verified against the live API, whose own rejection message enumerates `none, low, medium, high, xhigh`. Both are now accepted **by name only**: MJ's numeric 1-100 scale is a cross-provider convention whose three bands are replicated in the Groq and Cerebras drivers, so re-banding it to make room would silently reclassify every documented `effortLevel: 85` and mean something different per provider. `AIPromptParams.effortLevel` widens to `number | string` to carry a named level (`.toString()` on the runner's path already handled both); `AIPromptRun.EffortLevel` is a numeric column with a 1-100 CHECK, so a named level is deliberately not persisted there. The GPT-OSS path writes `Reasoning: <level>` into the system prompt rather than sending an API field, and harmony defines only three levels, so it clamps `xhigh`→`high` and `none`→`low`.

  **The hybrid agent loop, opt-in and inert.** Actions are now declarable as native tools and a tool call _is_ an Actions step. `buildActionToolSet` (§8.2) maps `ActionParam` metadata onto JSON Schema using the two mappings measurement settled — `Scalar` keeps the union type, and every opaque `ValueType` becomes `string` rather than `object`, which took usable arguments from 60% to 100% on `Run Ad-hoc Query.Query`. Only `Input`/`Both` params are declared, and a post-sanitization tool-name collision is a hard error at build time, because two Actions sharing one tool name would dispatch whichever registered last — a routing bug that presents as a model error. `LoopAgentType` checks native tool calls **before** the envelope (§8.1): Measurement showed that a model given tools answers through them and stops emitting the envelope entirely on some providers, so the two cannot be asked for in one turn. A call naming an undeclared tool is a Retry naming it, never a silent drop — Cerebras does this at roughly one forced call in six. The loop template drops its action catalog and the `'Actions'` step type under `_NATIVE_TOOL_CALLING` (§8.4), which is where the 56–104KB prompt reduction comes from; the flag is set from the gate's **real** decision before rendering, not from the caller's intent, so a prompt can never suppress its catalog while the model receives no tools. `AIAgentRunStep` gains `ToolCallingMode` and `NativeToolCallCount` (§8.5) so a comparison groups by its independent variable instead of reconstructing it through a lossy join.

  **The capability audit, and the policy that ships off.** `metadata/ai-models/.ai-models.json` now carries `ModelConfiguration.LLM` on **139 model rows** — `SupportsNativeToolCalling: true`, plus `NativeControlFlow: 'implicit'` and `NativeToolResults: true` describing which protocol that model can hold — and **83 vendor-level rows** that override it to `false` for a serving path verified not to accept tools. Those three are statements of fact about a model, and the gate treats capability as a hard gate that no policy can override, so recording them turns nothing on. Every one of the 139 also carries `DefaultToNativeToolCalling: false`: written explicitly rather than omitted, because "we know this model can, and we are choosing not to yet" is the thing a reader needs to see, and flipping it later is then a one-word edit per row rather than a new key. No prompt carries a `UseNativeToolCalling` preference. That is the measurement's own recommendation applied as written: revert the preference, keep the capability flags.

  `BaseAgentType.SupportsNativeToolCalls` (false; `true` on `LoopAgentType`, inherited by Harness) gates whether `BaseAgent` declares an agent's Actions as tools at all — without it a catalog default would have offered tools to the four Flow agents with Actions, whose type cannot read a call back and would have turned every such reply into a Retry.

  A full-corpus comparison then ran both arms — four times at N=3, 1,026 observations each, no observations lost — and returned **NO-GO on all three providers on every run**. The decomposition (results §9) is the useful part. Native tool calling delivers exactly the gain it should: given that an action is the right answer, GPT 5.6-luna acts 76% of the time through the envelope and 96% with tools declared, and every native turn that picks the right tool fills it correctly. That gain is then spent, almost to the turn, on two losses. Tool _selection_ got worse — the same confusion pairs as the envelope, confused more — and richer declarations fixed it only in compact form (outputs and result codes as names, +6 to +11pp on two models) while full-detail prose reversed the gain and cost the smallest model ~700 tokens a call. And models call a tool on 5–20% of turns whose right answer is chat, completion or delegation; that number did not move across four runs and two interventions, is concentrated in five specific corpus cases, and is the blocker. **The prompt-size premise did not hold** on any run: tokens fell on one model and rose on the other two. The single largest source of "wrong tool" in every arm is the action catalog itself — `Search Query Catalog`'s description prescribes search-before-SQL and the corpus expects direct SQL — which is a product question, not a model one. The recommendation on the record is to revert the prompt-level `UseNativeToolCalling` before merge and keep the capability flags, which change nothing on their own.

  **Tool declarations now carry what the prose catalog carries.** `buildToolFromAction` folds output params and result codes into the description, restoring the rule the file already stated (never less informative than the prose). The description ceiling is 1,024 characters as a _measured operating point_ — no provider enforces a limit anywhere near it (all three accepted 8,000 on a live probe), but the compact form measured better than full detail and the code comment says so. `resolveToolChoiceForTurn` forces `'none'` on the last permitted iteration, where a tool call would be executed and discarded; that is correct and unit-tested, and could not affect the single-decision corpus.

  **Six defects the measurement surfaced, all fixed here.** A tool-call-only turn carries no text, and the runner scored that as `No output received from model` — a warning on every native turn, and under `ValidationBehavior: 'Strict'` a retry that could never succeed; tool calls now count as output. The Layer-4 fallback only inspected a _returned_ failed result, but OpenAI's SDK _raises_ its 400, so a tools rejection bypassed the strip-and-retry entirely and hard-failed the run; both shapes now take the same one-shot retry. OpenAI additionally rejects tools alongside `reasoning_effort` on `/v1/chat/completions`, so **native tool calling and reasoning are mutually exclusive on OpenAI until the driver speaks the Responses API** — the earlier probe missed this by testing a non-reasoning model. `CerebrasLLM` drops `response_format` when a request declares tools, which Cerebras rejects outright. On the harness side, `PromptEvalConfig` gained the `toolCallingMode` axis it was always documented to have (an `envelope` cell withholds the declarations the composer attached, which is the gate's `toolsProvided` term and the only difference between the arms); the decision normalizer maps sanitized tool names back to Action names through the framework's own binding table, without which a corpus expectation written as `Execute Code` scores a correct `execute_code` call as the wrong action; and pinned matrix cells now decline vendor failover, after a first attempt lost 42% of its observations to rows that had quietly failed over to a different vendor and were recorded under the pinned one's label.

  `FailoverConfiguration` is now exported from `@memberjunction/ai-prompts` — it is the return type of `getFailoverConfiguration`, a `protected` method documented as an override point, which a subclass outside the package could not name.

  **Implicit control flow (opt-in, and off).** Under `LLM.NativeControlFlow: 'implicit'` the loop stops splitting its turn between two channels: sub-agents are declared as `delegate_to_<name>` tools, `payload_change_request` and `ask_user` join them, a tool call continues the loop, and **plain text with no call ends the turn as task completion**. The Loop agent-type template renders that protocol instead of the `'Actions'`/`'Sub-Agent'`/`'Chat'` step types, which is the rest of the prompt reduction the hybrid could not reach — the hybrid still had to describe the envelope because completion lived there. `ToolCallingMode` gains `'NativeImplicit'` so the two native protocols are distinguishable in run history rather than both reading as `Native`.

  **Tool results as tool turns.** When the catalog says `LLM.NativeToolResults`, a step's action results go back as native `tool` turns answering the assistant's call turn, instead of the markdown "Action results:" user message. `AIAgentRunStep.NativeToolResultsSent` records which encoding a step used, so the scorecard can tell them apart without reconstructing them from `AIPromptRun.Messages`. The two encodings are one function apart: `EncodeToolTurnsAsText` in `@memberjunction/ai` converts native tool turns back to the markdown form, and both the envelope fallback retry and the eval harness's history builder now call it rather than carrying their own copy — the fallback previously stripped the _declarations_ while leaving native `tool` turns in the history, which is a shape no envelope-path provider accepts.

  **Declaration control, per agent and per action.** `AIAgent.DeclareActionsAsNativeTools` and `AIAgentAction.DeclareAsNativeTool` (both `BIT NOT NULL DEFAULT 1`) decide whether an agent's Actions are _supplied_ as tools, independent of whether the gate would use them. Measurement found this was the missing switch: the Research Agent's prompt says it never does work itself, yet declaring its one action made GPT 5.6-luna use it on 7 of 9 turns against 0 of 9 on the envelope. Declaration turns a dormant capability into an active one and no prompt text can undo it, because the prompt already says never. `metadata/agents/.research-agent.json` sets the agent-level flag to `false` for exactly that reason. `AIAgentRunStep.NativeDualChannel` counts the other half of the same finding: turns that carried a tool call _and_ a complete Loop envelope, where the loop takes the call and discards the envelope silently.

  **Provider repairs found by running it.** Gemini rejects a request whose `contents` do not begin with a user turn, and a Skip-style caller that puts everything in the system instruction sends none — every such run died on a 400 naming `function call turn comes immediately after a user turn`. `geminiMessageSpacing` now prepends a minimal user turn when the first turn is the model's. Anthropic gained a `thinking-config` module so a thinking request and tool declarations no longer contradict each other in the mapping.

  **One step-save defect.** `AIAgentRunStep.StepName` is 255 characters and the loop writes a failure message into it; a 327-character provider error therefore failed the step save, and the run reported "2 step record save(s) failed" while hiding the actual error. `BaseAgent.fitStepName` truncates to the column's declared `MaxLength` read off the entity, so the row saves and the message is still readable.

  **Two toolchain repairs, unrelated to the feature but on its path.** `mj dev workspace` generated a root manifest with a `pnpm` block that pnpm 10.33 ignores — settings have to live in `pnpm-workspace.yaml` — and could not express a consumer-scoped override, so a member repo's own copy of a package lost to another member's `workspace:*`. The generator now emits its settings into the workspace file, pins patched packages to their patch version, and resolves duplicate providers with `parent>child` selectors pointing at the owning member. It also relaxes `strict-peer-dependencies` from `true` to `false` in the process: a mixed workspace resolving published `@mj-biz-apps/*` against linked MJ source now reports its peer gaps and completes, where it previously failed the install on peers no member can fix. Separately, `mj app install` resolved hook modules from the repo root only, which fails whenever the app's packages live in an installed tree or a dev-workspace parent; `ResolveHookModule` now walks the installed app packages, the server/client workspaces and the repo root, and names every base it tried when it fails.

  **Schema ships as one migration.** The seven migrations this work accumulated are consolidated into `V202609122036__v6.1.x__Native_Tool_Calling.sql` — hand-written DDL for all four groups above, then the CodeGen fold, generated from a from-scratch database so the tail reflects `next`'s schema rather than overwriting the procs `next`'s own migrations regenerate. The PostgreSQL counterpart is deferred to the release build, per `migrations/CLAUDE.md`.

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

### Minor Changes

- 5ecfdb4: Realtime voice agents can now **speak first**.

  Conversation-start behavior is not instruction-following: an ElevenLabs realtime agent with no `first_message` produces no audio at all until it receives user audio, whatever the persona prompt says. Every ElevenLabs realtime session therefore opened in silence, waiting for the human to guess they should talk (issue #3557).
  - **`ElevenLabsRealtime`** now sends an `agent.first_message` conversation-config override, built alongside the existing prompt and voice overrides, so both topologies (server-bridged and client-direct) carry it. The managed agent enables the override, and — because `OverridesSatisfied` requires it too — an agent provisioned by an earlier MJ version is re-PATCHed on next use instead of silently dropping it forever (the failure mode behind #3374). Omitting it preserves today's wait-for-the-user behavior exactly.
  - **New persona slot `realtime.voice.default.firstMessage`** authors the opening utterance without naming a vendor, filed onto whichever driver resolves under the neutral `firstMessage` key — the same shape as the agnostic `voice`. It reaches both realtime host paths (`BaseAgent` server-bridged and `RealtimeClientSessionService` client-direct). The text is spoken VERBATIM; it is the literal opening line, not guidance about how to open.
  - **`AssemblyAIRealtime`** honors the same neutral `firstMessage` key for its `greeting` wire slot. The legacy `greeting` config key still works; `firstMessage` wins when it carries something. Both go through the same trim-and-drop-blank rule as the ElevenLabs driver, so one authored value means the same thing whichever vendor runs — in particular a blank `firstMessage` reads as "none authored" and does not suppress a valid legacy `greeting`.
  - **`firstMessage` is registered in `REALTIME_SHARED_CONFIG_KEYS`**, and the drivers that do not consume it now scrub it. Because an agnostic persona slot is filed onto _whichever_ driver resolves, an unregistered neutral key survives each driver's residual-bag spread and reaches the provider as an unknown session field — it was reaching the OpenAI (and xAI) `session.update` payload on both topologies, and Inworld's raw-override loop was copying it onto the session verbatim. On the OpenAI-protocol endpoints a malformed session object is rejected wholesale, taking the prompt and tools with it. Inworld now scrubs the whole shared vocabulary, closing the same class of leak for the other shared keys too.

  Drivers without a provider-native opening utterance ignore the key and open silently, as before.

### Patch Changes

- 102a692: Map the driver-neutral realtime `voice` key to Gemini's `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`, so an authored voice actually reaches a Gemini Live session. Gemini was exempted from the shared-key scrub on the grounds that `voice` is meaningful to it — and it is, but nothing ever translated it: `buildConnectConfig` spread the config bag onto a `LiveConnectConfig`, which has no `voice` property, through an `as` cast that hid the mismatch from `tsc`. The `@google/genai` config converter is a path allowlist, so the value was dropped with no error and nothing on the wire — the same silent-drop bug class fixed one layer up in #3530, one layer down. Fixes #3721.

  `voice` is now consumed before the merge (as `disableAutoResponse` already was) so it can never spread raw, and both realtime topologies are covered by the one mapping: `StartSession` and `CreateClientSession` share `buildConnectConfig`, and the browser driver applies the server-built config verbatim. Because `speechConfig` is a generation-level field it is mask-safe, so the ephemeral-token mint now **token-locks** the voice under `lockAdditionalFields: []` — the server's choice is authoritative on client-direct rather than merely suggested.

  Precedence is per-key at the leaf, matching the #3530 cascade: a caller-supplied raw `speechConfig` keeps whatever voice it already names (a prebuilt voice, a replicated/cloned voice, or a multi-speaker config — documented as mutually exclusive with `voiceConfig`, and rejected outright on any Live session, so a voice is never fabricated beside it), but a raw block that sets only e.g. `languageCode` still receives the authored voice. Block-level winner-takes-all would have re-created the same silent drop in a narrower case. Nothing is dropped in silence: a discarded voice, a blank voice, a non-string `voice`, a `speechConfig` that is not an object, and a `multiSpeakerVoiceConfig` that Live cannot accept are each logged.

  **Behavior change worth watching**: this converts a silent no-op into a live value, so a cross-vendor voice id that previously did nothing on Gemini is now sent as `voiceName`. Verified against the live Gemini API: an invalid name passes the ephemeral-token mint without complaint and then **kills the session when the socket opens** — close code `1007`, `No matching speaker voice found for name: alloy and language:`, surfaced as a `Fatal` session error. So the failure is late and total, not a silent degrade — the same shape as the ElevenLabs note in #3530. Pin the model alongside the voice, or author per-vendor ids under `realtime.voice.providers.<key>`. The driver deliberately does not rewrite that provider error to name the MJ config key: the message already quotes the offending value, so the only thing a translation would add is the key name, and buying it would mean string-matching Google's wording and carrying the sent voice on the session purely to annotate a close frame.

  Unrelated and still open: only `OpenAIRealtime`, `xAIRealtime` and `HuggingFaceRealtime` declare `SupportedVoices` and the native picker's dropdown is gated on that list, so Gemini voices remain reachable through agent metadata and programmatic hosts rather than the picker. The `@google/genai` typings do not enumerate Gemini's prebuilt voice names, so populating that list needs a source outside the SDK.

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

### Patch Changes

- ea945da: Expand optional embedding `dimensions` support to the remaining drivers whose underlying APIs support output-dimension control. `params.dimensions` (added to `EmbedTextParams`/`EmbedTextsParams`/`EmbedContentParams` in `@memberjunction/ai`) is opt-in everywhere: when unset, prior behavior is unchanged.
  - **`@memberjunction/ai-cohere`** — forwarded as `outputDimension` on the v2 embed API (`EmbedText`, `embedBatch`, and multimodal `EmbedContent`). Supported by `embed-v4.0` (256/512/1024/1536).
  - **`@memberjunction/ai-gemini`** — forwarded as `config.outputDimensionality` (`EmbedText`, the per-text concurrent `EmbedTexts` path, and multimodal `EmbedContent`).
  - **`@memberjunction/ai-mistral`** — forwarded as `outputDimension`; only effective on models supporting output truncation (e.g. `codestral-embed`).
  - **`@memberjunction/ai-azure`** — the REST body previously hardcoded `dimensions: 1536` on every request; `dimensions` is now sent only when the caller explicitly provides it. This fixes a latent bug: older models (e.g. `text-embedding-ada-002`, the driver's default) don't accept the parameter, and models with larger native outputs (e.g. `text-embedding-3-large` at 3072) were being silently truncated to 1536. Omitting it lets the selected model produce its native dimensionality. Note: deployments that relied on the implicit 1536 truncation with `text-embedding-3-*` models should now set the dimension explicitly via `VectorIndex.Dimensions`.
  - **`@memberjunction/ai-bedrock`** — forwarded as `dimensions` for `amazon.titan-embed*` models (supported by Titan Embed Text V2: 256/512/1024; V1 rejects it, so it is only sent on explicit opt-in). Also threaded through the per-text batch fallback loop.

  Not applicable (unchanged): Ollama (no output-dimension API parameter) and LocalEmbeddings (transformers.js has no output truncation).

- b52ffa8: Fix four silent-failure bugs found while triaging the open issue backlog. Each one looked correct from the outside while doing nothing, or doing the wrong thing, at runtime. No schema changes.

  **`BaseLLM` silently truncated streamed responses (`@memberjunction/ai`).** The streaming chunk loop caught any mid-stream error, logged it, and then finalized the response as a **success**. A dropped connection, a provider fault, or an abort part-way through a stream produced truncated content that the caller was told was complete — under every provider, for every streaming consumer. Genuine failures now surface as failures; cancellation is still routed to the driver's `finalizeStreamingResponse`, since providers differ on whether an abort throws there or simply ends iteration.

  **No LLM driver honored `ChatParams.cancellationToken`** (13 provider packages). The field existed on `ChatParams` and zero drivers read it, so an aborted or timed-out request abandoned the promise while the socket kept streaming and pinning buffers. Now forwarded to the SDK across all 19 drivers — 13 fixed directly, the remaining 6 inheriting from `OpenAILLM` / `GeminiLLM` — on both the streaming and non-streaming paths. The mechanism differs per provider and was verified rather than assumed — Bedrock takes `abortSignal` (not `signal`); Ollama has no per-request hook at all, so the signal is threaded through a custom `fetch`; and `Inception` overrides both chat paths without calling `super`, so it does not inherit the fix from `OpenAILLM` despite appearing to. An abort is reported `Fatal` / `canFailover: false`, because `ErrorAnalyzer` otherwise classifies it as retriable — meaning a request the user just cancelled would have been retried.

  **Prompt execution could not be bounded (`@memberjunction/ai-prompts`, `@memberjunction/ai-core-plus`).** On the single-model path the model call was awaited with no bound unless the caller hand-supplied an `AbortSignal`, so a hung provider connection never resolved. Adds a per-request `AIPromptParams.timeoutMS` and a typed `AIPromptTimeoutError` that `ErrorAnalyzer` classifies as retriable, so a timeout now flows into the existing retry/failover machinery instead of hanging. The timeout and any caller-supplied token compose — neither is discarded. Enforcement lives in `executeModel`, the one method the parallel coordinator also inherits, so the single-model and parallel paths cannot diverge. (Issue #3064 was filed as "`AIPromptRunner` does not enforce `AIPrompt.TimeoutMS`", but that column does not exist — the bound could not be expressed at all. A prompt-level column is tracked separately in #3133.)

  **A malformed deny-list silently disarmed the Predictive Studio leakage guard** (`@memberjunction/predictive-studio*`, `@memberjunction/core-entities-server`, `@memberjunction/ng-dashboards`). Pasting a bracketed list into the pipeline editor produced `DenyFields: ["[CheckInTime", …, "Status]"]`; the deny-set then matched nothing, so the most dangerous leak columns trained completely unguarded and the save was accepted. The editor no longer manufactures the bad input, a new `MJMLTrainingPipelineEntityServer.ValidateAsync` rejects it at save, and the dominance threshold is clamped at enforcement time so rows written before this validation existed cannot disable the guard. Also unifies `DEFAULT_DOMINANCE_THRESHOLD`, which was defined twice with different values (`0.85` vs `0.6`) — agent-authored pipelines had been held to a materially laxer guard than hand-authored ones.

  **Dead CSS shipped to production (`@memberjunction/ng-dashboards`, `@memberjunction/ng-conversations`).** These packages build with bare `ngc` — no Sass step — so `styleUrls` content is embedded verbatim. Native CSS nesting makes `&:hover` accidentally work, but it cannot do string concatenation, so every `&__elem` / `&--modifier` rule was silently dropped. Three components were affected. **This resurrects styling that has never rendered**: the realtime media-surface tab bar had no active-tab indicator, and evidence playback had no active-turn highlight and no played-progress color on its waveform. A new `check:ui-ngc-scss` CI gate prevents the trap re-arming.

  Also fixes `@memberjunction/ai-azure`, whose unit tests had never actually run — the package had test files and a vitest config but no `test` script.

- bc388e3: Realtime QA hardening — every finding from the adversarial audit of the driver-family consolidation (PR #3177) plus the broader co-agent architecture, fixed with regression tests (plan: `plans/complete/realtime-qa-hardening.md`).

  **Regression fixes (A-items)** — bodyless provider `error` frames are recoverable again on raw-WS providers (adapter synthesizes the payload; transport failures stay fatal); `Capabilities.CanReconfigureTurnMode` is profile-gated (`supportsLiveReconfigure` — HuggingFace now truthfully reports false and `Reconfigure` no-ops); protected wire fields (`type`/`instructions`/`tools`) can no longer be overridden through the open Config bag (closing a strict-endpoint session.update kill vector) while the documented `audio` override remains; the client-direct minted `SessionConfig` now applies the residual bag with the same construction order as server-bridged (the two topologies are actually identical); deferred-config listener cleanup on early teardown; family-wide empty-transcript suppression; settle-handle + adapter buffer hygiene.

  **Robustness (B-items)** — connect/readiness deadlines everywhere (client WS `connectTimeoutMs` covering open + `session.created`, with socket-death/`Disconnect` releasing the awaited `Connect`; server `configReadinessTimeoutMs` rejecting `WaitForConfigApplied` on silent endpoints without cancelling the deferred apply); stale-`response.done` protection (a cancelled turn's trailing done can't release the busy lock under a locally-initiated replacement); TRUE-barge-in drops queued tool-result auto-triggers (the model never speaks over a user who took the floor; delivery via the user's next turn); WebRTC remote-stream handlers cleared on Disconnect; WS sends gated on socket-open.

  **Architecture (C-items)** — `realtime.session` tuning config (`effortLevel`/`parallelToolCalls`/`mcpTools`/`inputTranscriptionModel`) now flows config→bag→driver on BOTH topologies (`GetSessionTuningSettings`; the PR #3177 driver features are live end-to-end); per-modality usage detail (`RealtimeUsage.Input/OutputTokenDetails`) captured by the OpenAI driver, accumulated by the runner, and persisted on the realtime `AIPromptRun` for multi-channel cost attribution; HF proxy hardening (optional `MJ_REALTIME_PROXY_ALLOWED_ORIGINS` allowlist, upstream-open deadline, bounded pre-open buffer); the session runner observes the chained cancellation signal and performs bounded transport reconnects (default 1, `MaxTransportReconnects`); MCP approval requests are auto-DENIED so the turn continues instead of dead-air blocking; Gemini scrubs+warns on foreign OpenAI-protocol/transport keys (`REALTIME_SHARED_CONFIG_KEYS` exported from Core); `RealtimeTranscript.ReplacesPrevious` added for streamed-final providers.

  Suite totals after the wave: ai-openai 147, ai-realtime-client 391, ai-agents 1653, ai-gemini 87, ai-xai 50, ai-huggingface 34, MJServer proxy 8 — all passing.

  **Second-pass re-audit fixes**: a follow-up adversarial audit of the hardening itself found the C1 fix was inert (the new realtime.session field was never propagated through the effective-config resolver — now fixed with normalizeSession), plus untested edges introduced by the B2 counter (permanent wedge on a rejected response.create — now self-heals on the error frame), the C7 reconnect (abort/Stop race leaking a live session; stale call_id relayed to the fresh session; no re-entrancy/identity guard — all fixed), the client connect deadline (timer leak on synchronous socket-construction throw), reused-instance socket handling (old socket late close corrupting the new session), the C4 abort window (abort during StartSession lost), model not being a protected wire field, and ReplacesPrevious being ignored at the transcript-persist site. All fixed with regression + interaction-seam tests.

  **Fifth-pass re-audit fixes**: a five-reviewer verification pass found one reachable correctness bug and closed two latent transcript fragilities. (1) The pass-4 client `onErrorFrame` fix cleared the pending narration kind only when no confirmed response was active, so a narration create rejected while a cancelled response drained mistagged the next delegated-answer turn as ephemeral (dropping its transcript) — the kind is now cleared unconditionally on the rejecting error. (2) The transcript in-flight-row bookkeeping moved to an `{id, open}` model so a turn that emits both an interim delta and repeated streamed completeds still collapses to one row, and a short assistant final no longer suppresses the next turn's interim streaming row. Coverage added for the `confirmedResponseActive` busy-lock guard and the per-turn `ReplacesPrevious` reset (xAI + HuggingFace).

  **Fourth-pass re-audit fixes**: a four-reviewer pass found one regression from the third-pass work and several reachable pre-existing defects, all fixed with regression tests. (1) The third-pass usage un-gate let a trailing usage frame accumulate after `Stop()` and arm a post-finalize checkpoint timer — now gated on the runner lifecycle (`!stopped`) instead. (2) `RealtimeTranscript.ReplacesPrevious` is now wired END-TO-END: the shared server session flags the 2nd+ streamed user transcription completed (Grok streams repeated growing finals) and `persistRealtimeTranscript` uses status-disambiguated reuse, so server-bridged Grok/ElevenLabs no longer mint a duplicate `ConversationDetail` per caption (previously the flag was only ever set client-side). (3) The client `onErrorFrame` self-heal now clears the eager `responseActive`/narration phantom left by a rejected local `response.create` (a `confirmedResponseActive` flag distinguishes it from a live VAD turn) so `IsBusy` no longer wedges on compat endpoints. (4) The tool broker aborts EVERY concurrent delegation on barge-in (was: only the newest, orphaning the rest). (5) The HuggingFace server session declares its native 16 kHz sample rate (was: bridge fell back to 24 kHz into a 16 kHz pipeline). (6) A stuck delegate can no longer leak stale narration-burst timing across a reconnect (burst state reset decoupled from the delegation counter).

  **Third-pass re-audit fixes**: a third adversarial pass against the latest `next` found three residual seams: (1) the C8 transcript-persist fix only bound the in-flight key on the INTERIM branch, so a FINALS-ONLY streamed provider (e.g. Grok user captions, ElevenLabs corrections) that never emits an interim delta still minted a duplicate `ConversationDetail` row per correction — the create+finalize branch now binds the key too; (2) the C7 reconnect blanket-zeroed the runner's shared `activeDelegations` counter, which — combined with each aborted delegation's self-decrementing `finally` — could double-decrement and steal a CONCURRENT post-reconnect delegation's narration burst; the reset is gone (frames self-unwind); (3) `OnUsage` was identity-gated like every other handler, so a trailing usage frame flushed on the just-dropped socket was silently discarded — usage is runner-GLOBAL (cumulative) and is now un-gated. Plus a bounded-worst-case characterization test for the S1 self-heal. All fixed with regression + interaction-seam tests.

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

- 89ea055: feat(ai): SupportsBatchEmbeddings + safe default EmbedTexts on BaseEmbeddings; rename GeminiEmbedding2 → GeminiEmbedding

  `BaseEmbeddings.EmbedTexts` is now a concrete dispatcher on a new `SupportsBatchEmbeddings` getter (default `false`): providers with a native batch endpoint return `true` and implement `embedBatch()`; everyone else inherits a safe per-text fallback (`embedPerText` — bounded concurrency, per-text retry-with-backoff, a hard 1:1 count guard, and a graceful empty-on-failure contract) that can never silently collapse a batch into fewer/blended vectors. A provider that claims batch support but doesn't implement `embedBatch()` throws, keeping the flag and the implementation honest.

  Per-text embedding on the fallback path (and in Gemini's own `EmbedTexts`) now retries transient failures with bounded exponential backoff before giving up, so one transient 429/500 among N texts no longer degrades the whole batch — addressing the failure-rate-scales-with-N concern from review.

  The OpenAI, Azure, Cohere, and Mistral embedding providers declare `SupportsBatchEmbeddings = true` and move their array call into `embedBatch()`. This generalizes the `GeminiEmbedding2` batch-collapse fix to the whole embedding layer and prevents the class of bug for any future provider that only implements single-text `EmbedText`.

  Also renames the `GeminiEmbedding2` class (and its `@RegisterClass` key / `DriverClass`) to `GeminiEmbedding` — the class outlives any single model version. The `DriverClass` change is carried by the AI-models metadata (`metadata/ai-models/.ai-models.json`) and the regenerated class-registration manifests in the bootstrap packages; no hand-written migration.

- a7c1f2f: fix(ai-gemini): EmbedTexts returns one vector per text (was collapsing the batch)

  `GeminiEmbedding2.EmbedTexts` passed the whole `texts` array to `embedContent` as a single `contents` value. Because `gemini-embedding-2` is multimodal, Gemini fused the array into ONE blended vector (`response.embeddings.length === 1`) and the method silently returned that single vector for the whole batch — corrupting any consumer that pairs vectors to records by index (e.g. `EntityVectorSyncer`), which wrecks downstream semantic search/clustering. No error was thrown.

  `EmbedTexts` now issues one `embedContent` call per text with bounded concurrency (max 4 in flight), preserving input order and returning exactly one vector per input text. A hard guard asserts `vectors.length === texts.length` and throws on mismatch so a collapse can never silently corrupt downstream storage. The existing error contract is preserved: on an API/embedding failure it returns an empty `vectors` array (matching the prior behavior and the other MJ embedding providers) rather than throwing, so batch pipelines degrade gracefully. The single-text `EmbedText` and multimodal `EmbedContent` paths are unchanged.

- Updated dependencies [5396d90]
- Updated dependencies [89ea055]
  - @memberjunction/global@5.44.0
  - @memberjunction/ai@5.44.0

## 5.43.0

### Minor Changes

- 9f6aa87: Generic fire-and-forget save queue, realtime multi-agent floor control, and telemetry fixes.

  **Generic fire-and-forget save queue** (`@memberjunction/global`, `@memberjunction/core`, + adopters) — de-duplicates the hand-rolled "INSERT (fire-and-forget) → chained UPDATE" persistence pattern and makes the "stuck at Running" race structurally impossible:
  - `KeyedSerialTaskQueue` (`@memberjunction/global`) — entity-agnostic per-key serial task chain: same-key tasks serialize, different keys run concurrently, failures are tallied for `flush()` and never propagate. Self-bounding (in-flight set + failure counters), so a long-lived queue that never flushes doesn't grow.
  - `BaseEntitySaveQueue` (`@memberjunction/core`) — entity façade: `Insert` / `Update(entity, applyMutation?)` / `Flush`, with an optional `onError` hook for structured logging. `Update`'s mutation runs _inside_ the post-INSERT task, so it can never be reverted by the INSERT's reload.
  - Adopted in all three hand-rolled copies + the new consumer: `GenericProcessRunTracker` (`@memberjunction/record-set-processor`), `AgentRunStepSaveQueue` (`@memberjunction/ai-core-plus`), `ActionEngine`'s execution log (`@memberjunction/actions`), and `AIPromptRunner` / `AIModelRunner` (`@memberjunction/ai-prompts`). Also fixes a pre-existing `MJLruCache` mock gap in the Actions/Engine test suite.

  **Realtime** (`@memberjunction/ai`, `@memberjunction/ai-bridge-server`, `@memberjunction/ai-gemini`, `@memberjunction/ai-openai`, `@memberjunction/livekit-room-server`, `@memberjunction/ng-livekit-room`) — multi-agent floor control, Gemini meeting mode, the session capability surface with first-agent re-gating, and an idle reaper.

  **Telemetry / core** (`@memberjunction/core`, `@memberjunction/server`) — cacheability-aware duplicate-RunView suggestion for `AllowCaching=false` entities; fixes the telemetry pagination-fingerprint false-duplicate and batches the janitor channel reads.

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

- 84089ae: Add multimodal embeddings: new EmbedContent method + GetFileCapabilities on BaseEmbeddings, GeminiEmbedding2 and CohereEmbedding providers, AIEngine.EmbedContent, and the @google/genai 2.x bump (Gemini + Vertex).
- cd6c5f0: Realtime AI Agents wave 3: consolidated v5.41 migration (sessions, channels, co-agent schema) with the AIAgentCoAgent affinity registry replacing AIAgentPairedAgent — typed relationship vocabulary (CoAgent implemented; Peer/Delegate/Fallback/Reviewer/Observer reserved), type-level co-agent defaults as junction rows (removing the only FK cycle in core MJ), and the full code sweep (engine cache, resolver resolution chain, server-side invariants, client pairing reads, regenerated manifests). Realtime UX: progressive-disclosure voice console with persisted captions preference, user-owned composer and tabs toggles, audio-reactive visuals; whiteboard pages/multi-select and review-persistence fixes. Gemini Live triggering turns ride realtime text so widget clicks/typed input/narration speak immediately on native-audio models. CodeGen: single-winner IsNameField enforcement with eligibility guardrail fixes, SCC-based cycle diagnostics, and clean-database bootstrap robustness (conditional engine registry datasets).

### Patch Changes

- 15b743b: Real-Time AI Agents — Sessions, Channels & the Realtime Model (plans/ai-agent-sessions.md). Adds the AIAgentSession/AIAgentChannel/AIAgentSessionChannel schema (+ AgentSessionID on AIAgentRun/ConversationDetail, CloseReason on AIAgentSession); the BaseRealtimeModel server primitive with OpenAIRealtime + GeminiRealtime drivers (server-bridged StartSession and client-direct ephemeral-token CreateClientSession, optional SendContextNote/RequestSpokenUpdate interim updates); the new @memberjunction/ai-realtime-client package with the BaseRealtimeClient browser abstraction + OpenAI/Gemini client drivers resolved via ClassFactory by provider key; the Realtime agent type + Voice Co-Agent with RealtimeSessionRunner/RealtimeToolBroker, AgentMemoryContextBuilder extraction, server session lifecycle (SessionManager, SessionJanitor, start/close/heartbeat + client-direct resolvers with delegated-run progress streaming, AwaitingFeedback resume, co-agent observability runs, user-selectable realtime model); the full-panel realtime voice call UX in ng-conversations (phone trigger + agent/model picker, banner/thread/activity rail, delegation working/result cards with provenance, ephemeral paced first-person progress narration driven by DB prompt templates, in-call text composer); Realtime Voice admin (AI Analytics dashboard sections, session/channel custom forms, agent Runs|Sessions execution history); and Query Builder/Strategist reliability fixes (entity catalog in prompt, Get Entity Details sample caps + semantic fallback, plan formatting). Also: the standalone @memberjunction/ng-whiteboard package (collaborative board with agent tool API, sandboxed interactive widgets + input bridge, markdown panels, exports, cancelable before/after events); ElevenLabs Agents + AssemblyAI Voice Agent realtime provider pairs (4-provider matrix, zero contract changes); session review mode with multi-leg resume carryover (timeline dividers, artifact junction closure, prior-transcript model hydration); delegation cancel channel; usage telemetry relay; Realtime Co-Agent rename with run-step/prompt-run observability.
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

- 8c39dd9: Wire Prompt.ModelSpecificResponseFormat through AIPromptRunner to the Gemini provider, and map responseFormat correctly so JSON mode sets responseMimeType=application/json and ModelSpecific applies the prompt-supplied config (e.g. responseSchema) to the Gemini model options.
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

- c3f4154: Fix Gemini streaming: parse chunks using the new @google/genai shape (content.parts) instead of the legacy content[0].parts, and split thought parts from visible answer parts so reasoning summaries no longer leak into the user-visible stream.
- Updated dependencies [ac4b9a5]
  - @memberjunction/global@5.35.0
  - @memberjunction/ai@5.35.0

## 5.34.1

### Patch Changes

- @memberjunction/ai@5.34.1
- @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

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

- @memberjunction/ai@3.4.0
- @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- @memberjunction/ai@3.3.0
- @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- cbd2714: Improve error handling and stability across Skip integration, component artifacts, and metadata sync
  - @memberjunction/ai@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ai@3.1.1
- @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai@3.0.0
- @memberjunction/global@3.0.0

## 2.133.0

### Patch Changes

- @memberjunction/ai@2.133.0
- @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- @memberjunction/ai@2.132.0
- @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- @memberjunction/ai@2.131.0
- @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/ai@2.130.1
- @memberjunction/global@2.130.1

## 2.130.0

### Minor Changes

- 83ae347: migrations

### Patch Changes

- Updated dependencies [83ae347]
  - @memberjunction/ai@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Patch Changes

- Updated dependencies [fbae243]
- Updated dependencies [c7e38aa]
  - @memberjunction/global@2.129.0
  - @memberjunction/ai@2.129.0

## 2.128.0

### Patch Changes

- 0863f85: no migration
  - @memberjunction/ai@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [c7c3378]
  - @memberjunction/global@2.127.0
  - @memberjunction/ai@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/ai@2.126.1
- @memberjunction/global@2.126.1

## 2.126.0

### Patch Changes

- @memberjunction/ai@2.126.0
- @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- @memberjunction/ai@2.125.0
- @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- @memberjunction/ai@2.124.0
- @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai@2.123.1
- @memberjunction/global@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/ai@2.123.0
- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- @memberjunction/ai@2.122.2
- @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/ai@2.122.1
- @memberjunction/global@2.122.1

## 2.122.0

### Minor Changes

- 6e65496: Fix Gemini 3 Pro DriverClass and add Claude 4.5 Opus

### Patch Changes

- @memberjunction/ai@2.122.0
- @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- a2bef0a: Refactor component-linter with fixture-based testing infrastructure, fix agent execution error handling and payload propagation, add Gemini API parameter fixes, and improve vendor failover with VendorValidationError type
- Updated dependencies [a2bef0a]
  - @memberjunction/ai@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- @memberjunction/ai@2.120.0
- @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- @memberjunction/ai@2.119.0
- @memberjunction/global@2.119.0

## 2.118.0

### Patch Changes

- @memberjunction/ai@2.118.0
- @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- @memberjunction/ai@2.117.0
- @memberjunction/global@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [a8d5592]
  - @memberjunction/global@2.116.0
  - @memberjunction/ai@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/ai@2.115.0
- @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/ai@2.114.0
- @memberjunction/global@2.114.0

## 2.113.2

### Patch Changes

- @memberjunction/ai@2.113.2
- @memberjunction/global@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [c126b59]
  - @memberjunction/global@2.112.0
  - @memberjunction/ai@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ai@2.110.1
- @memberjunction/global@2.110.1

## 2.110.0

### Patch Changes

- @memberjunction/ai@2.110.0
- @memberjunction/global@2.110.0

## 2.109.0

### Patch Changes

- @memberjunction/ai@2.109.0
- @memberjunction/global@2.109.0

## 2.108.0

### Patch Changes

- Updated dependencies [656d86c]
  - @memberjunction/ai@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/ai@2.107.0
- @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ai@2.106.0
- @memberjunction/global@2.106.0

## 2.105.0

### Patch Changes

- Updated dependencies [9b67e0c]
  - @memberjunction/ai@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Patch Changes

- Updated dependencies [2ff5428]
  - @memberjunction/global@2.104.0
  - @memberjunction/ai@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [addf572]
  - @memberjunction/global@2.103.0
  - @memberjunction/ai@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/ai@2.100.3
- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/ai@2.100.2
- @memberjunction/global@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/ai@2.100.1
- @memberjunction/global@2.100.1

## 2.100.0

### Patch Changes

- @memberjunction/ai@2.100.0
- @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- @memberjunction/ai@2.99.0
- @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/ai@2.98.0
- @memberjunction/global@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/ai@2.97.0
- @memberjunction/global@2.97.0

## 2.96.0

### Patch Changes

- @memberjunction/ai@2.96.0
- @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- @memberjunction/ai@2.95.0
- @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/ai@2.94.0
- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- @memberjunction/ai@2.93.0
- @memberjunction/global@2.93.0

## 2.92.0

### Patch Changes

- @memberjunction/ai@2.92.0
- @memberjunction/global@2.92.0

## 2.91.0

### Patch Changes

- @memberjunction/ai@2.91.0
- @memberjunction/global@2.91.0

## 2.90.0

### Patch Changes

- @memberjunction/ai@2.90.0
- @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- @memberjunction/ai@2.89.0
- @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- @memberjunction/ai@2.88.0
- @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- @memberjunction/ai@2.87.0
- @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- @memberjunction/ai@2.86.0
- @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- Updated dependencies [a96c1a7]
  - @memberjunction/ai@2.85.0
  - @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- @memberjunction/ai@2.84.0
- @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- @memberjunction/ai@2.83.0
- @memberjunction/global@2.83.0

## 2.82.0

### Patch Changes

- @memberjunction/ai@2.82.0
- @memberjunction/global@2.82.0

## 2.81.0

### Patch Changes

- @memberjunction/ai@2.81.0
- @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/ai@2.80.1
- @memberjunction/global@2.80.1

## 2.80.0

### Patch Changes

- @memberjunction/ai@2.80.0
- @memberjunction/global@2.80.0

## 2.79.0

### Minor Changes

- bad1a60: migration

### Patch Changes

- Updated dependencies [907e73f]
- Updated dependencies [bad1a60]
  - @memberjunction/global@2.79.0
  - @memberjunction/ai@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [ef7c014]
  - @memberjunction/ai@2.78.0
  - @memberjunction/global@2.78.0

## 2.77.0

### Patch Changes

- @memberjunction/ai@2.77.0
- @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- @memberjunction/ai@2.76.0
- @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- @memberjunction/ai@2.75.0
- @memberjunction/global@2.75.0

## 2.74.0

### Patch Changes

- @memberjunction/ai@2.74.0
- @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- Updated dependencies [eebfb9a]
  - @memberjunction/ai@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- @memberjunction/ai@2.72.0
- @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0
  - @memberjunction/ai@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/ai@2.70.0

## 2.69.1

### Patch Changes

- @memberjunction/ai@2.69.1
- @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/global@2.69.0
  - @memberjunction/ai@2.69.0

## 2.68.0

### Patch Changes

- @memberjunction/ai@2.68.0
- @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/ai@2.67.0
- @memberjunction/global@2.67.0

## 2.66.0

### Patch Changes

- @memberjunction/ai@2.66.0
- @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [1d034b7]
- Updated dependencies [619488f]
  - @memberjunction/ai@2.65.0
  - @memberjunction/global@2.65.0

## 2.64.0

### Patch Changes

- @memberjunction/ai@2.64.0
- @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/ai@2.63.1

## 2.63.0

### Patch Changes

- @memberjunction/ai@2.63.0
- @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/ai@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/ai@2.61.0
- @memberjunction/global@2.61.0

## 2.60.0

### Patch Changes

- @memberjunction/ai@2.60.0
- @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/ai@2.59.0
- @memberjunction/global@2.59.0

## 2.58.0

### Patch Changes

- Updated dependencies [db88416]
  - @memberjunction/ai@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/global@2.57.0
  - @memberjunction/ai@2.57.0

## 2.56.0

### Patch Changes

- @memberjunction/ai@2.56.0
- @memberjunction/global@2.56.0

## 2.55.0

### Patch Changes

- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
  - @memberjunction/ai@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- @memberjunction/ai@2.54.0
- @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- @memberjunction/ai@2.53.0
- @memberjunction/global@2.53.0

## 2.52.0

### Minor Changes

- e926106: Significant improvements to AI functionality

### Patch Changes

- Updated dependencies [e926106]
  - @memberjunction/ai@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Patch Changes

- Updated dependencies [4a79606]
- Updated dependencies [faf513c]
  - @memberjunction/ai@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/ai@2.50.0
- @memberjunction/global@2.50.0

## 2.49.0

### Minor Changes

- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [cc52ced]
- Updated dependencies [62cf1b6]
  - @memberjunction/global@2.49.0
  - @memberjunction/ai@2.49.0

## 2.48.0

### Patch Changes

- @memberjunction/ai@2.48.0
- @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- @memberjunction/ai@2.47.0
- @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/ai@2.46.0
- @memberjunction/global@2.46.0

## 2.45.0

### Patch Changes

- Updated dependencies [21d456d]
  - @memberjunction/ai@2.45.0
  - @memberjunction/global@2.45.0

## 2.44.0

### Patch Changes

- Updated dependencies [fbc30dc]
  - @memberjunction/ai@2.44.0
  - @memberjunction/global@2.44.0

## 2.43.0

### Patch Changes

- @memberjunction/ai@2.43.0
- @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/ai@2.42.1
- @memberjunction/global@2.42.1

## 2.42.0

### Patch Changes

- Updated dependencies [d49f25c]
  - @memberjunction/ai@2.42.0
  - @memberjunction/global@2.42.0

## 2.41.0

### Patch Changes

- Updated dependencies [9d3b577]
- Updated dependencies [276371d]
  - @memberjunction/ai@2.41.0
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- acffa0f: Clean up of AI packages + added Gemini implementaion for new approach to content
- Updated dependencies [b6ce661]
  - @memberjunction/ai@2.40.0
  - @memberjunction/global@2.40.0

## 2.39.0

### Patch Changes

- Updated dependencies [f73ea0e]
  - @memberjunction/ai@2.39.0
  - @memberjunction/global@2.39.0

## 2.38.0

### Patch Changes

- 6c26f49: Update to use new google gen ai library
  - @memberjunction/ai@2.38.0
  - @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/ai@2.37.1
- @memberjunction/global@2.37.1

## 2.37.0

### Patch Changes

- @memberjunction/ai@2.37.0
- @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- Updated dependencies [d9defc9]
- Updated dependencies [577cc6a]
  - @memberjunction/ai@2.36.1
  - @memberjunction/global@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
  - @memberjunction/global@2.36.0
  - @memberjunction/ai@2.36.0

## 2.35.1

### Patch Changes

- @memberjunction/ai@2.35.1
- @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/ai@2.35.0
- @memberjunction/global@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/ai@2.34.2
- @memberjunction/global@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/ai@2.34.1
- @memberjunction/global@2.34.1

## 2.34.0

### Patch Changes

- b48d6b4: LLM Streaming Support + HTML Report Fixes
- 54ac86c: Optimize streaming implementation + bug fixes
- Updated dependencies [b48d6b4]
- Updated dependencies [4c7f532]
- Updated dependencies [54ac86c]
  - @memberjunction/ai@2.34.0
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- efafd0e: Readme documentation, courtesy of Claude
- Updated dependencies [efafd0e]
  - @memberjunction/ai@2.33.0
  - @memberjunction/global@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/ai@2.32.2
- @memberjunction/global@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/ai@2.32.1
- @memberjunction/global@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/ai@2.32.0
- @memberjunction/global@2.32.0

## 2.31.0

### Patch Changes

- @memberjunction/ai@2.31.0
- @memberjunction/global@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [a3ab749]
  - @memberjunction/global@2.30.0
  - @memberjunction/ai@2.30.0

## 2.29.2

### Patch Changes

- @memberjunction/ai@2.29.2
- @memberjunction/global@2.29.2

## 2.28.0

### Patch Changes

- @memberjunction/ai@2.28.0
- @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/ai@2.27.1
- @memberjunction/global@2.27.1

## 2.27.0

### Patch Changes

- Updated dependencies [b4d3cbc]
  - @memberjunction/ai@2.27.0
  - @memberjunction/global@2.27.0

## 2.26.1

### Patch Changes

- @memberjunction/ai@2.26.1
- @memberjunction/global@2.26.1

## 2.26.0

### Patch Changes

- @memberjunction/ai@2.26.0
- @memberjunction/global@2.26.0

## 2.25.0

### Patch Changes

- @memberjunction/ai@2.25.0
- @memberjunction/global@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/ai@2.24.1
- @memberjunction/global@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [9cb85cc]
  - @memberjunction/global@2.24.0
  - @memberjunction/ai@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/ai@2.23.2
- @memberjunction/global@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/ai@2.23.1
- @memberjunction/global@2.23.1

## 2.23.0

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/global@2.23.0
  - @memberjunction/ai@2.23.0

## 2.22.2

### Patch Changes

- @memberjunction/ai@2.22.2
- @memberjunction/global@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/ai@2.22.1
- @memberjunction/global@2.22.1

## 2.22.0

### Patch Changes

- Updated dependencies [9660275]
  - @memberjunction/global@2.22.0
  - @memberjunction/ai@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:45 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:45 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/ai to v2.21.0
- Bump @memberjunction/global to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v2.20.3
- Bump @memberjunction/global to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Bump @memberjunction/ai to v2.20.2
- Bump @memberjunction/global to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/ai to v2.20.1
- Bump @memberjunction/global to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:04 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/ai to v2.20.0
- Bump @memberjunction/global to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/ai to v2.19.5
- Bump @memberjunction/global to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/ai to v2.19.4
- Bump @memberjunction/global to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/ai to v2.19.3
- Bump @memberjunction/global to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/ai to v2.19.2
- Bump @memberjunction/global to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/ai to v2.19.1
- Bump @memberjunction/global to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:48 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/ai to v2.19.0
- Bump @memberjunction/global to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Bump @memberjunction/ai to v2.18.3
- Bump @memberjunction/global to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/ai to v2.18.2
- Bump @memberjunction/global to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/ai to v2.18.1
- Bump @memberjunction/global to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Bump @memberjunction/ai to v2.18.0
- Bump @memberjunction/global to v2.18.0

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Bump @memberjunction/ai to v2.17.0
- Bump @memberjunction/global to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:28 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/ai to v2.16.1
- Bump @memberjunction/global to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Bump @memberjunction/ai to v2.16.0
- Bump @memberjunction/global to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:29 GMT

### Patches

- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Bump @memberjunction/ai to v2.15.2
- Bump @memberjunction/global to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Bump @memberjunction/ai to v2.14.0
- Bump @memberjunction/global to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/ai to v2.13.4
- Bump @memberjunction/global to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:45 GMT

### Patches

- Bump @memberjunction/ai to v2.13.3
- Bump @memberjunction/global to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/ai to v2.13.2
- Bump @memberjunction/global to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Bump @memberjunction/ai to v2.13.1
- Bump @memberjunction/global to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/ai to v2.13.0
- Bump @memberjunction/global to v2.13.0

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Bump @memberjunction/ai to v2.12.0
- Bump @memberjunction/global to v2.12.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Bump @memberjunction/ai to v2.11.0
- Bump @memberjunction/global to v2.11.0

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Bump @memberjunction/ai to v2.10.0
- Bump @memberjunction/global to v2.10.0

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Bump @memberjunction/ai to v2.9.0
- Bump @memberjunction/global to v2.9.0

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Bump @memberjunction/ai to v2.8.0
- Bump @memberjunction/global to v2.8.0

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Bump @memberjunction/ai to v2.7.1
- Bump @memberjunction/global to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v2.7.0
- Bump @memberjunction/global to v2.7.0

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Bump @memberjunction/ai to v2.6.1
- Bump @memberjunction/global to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v2.6.0
- Bump @memberjunction/global to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:03 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Bump @memberjunction/ai to v2.5.2
- Bump @memberjunction/global to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/ai to v2.5.1
- Bump @memberjunction/global to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:07 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v2.5.0
- Bump @memberjunction/global to v2.5.0

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Bump @memberjunction/ai to v2.4.1
- Bump @memberjunction/global to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v2.4.0
- Bump @memberjunction/global to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Bump @memberjunction/ai to v2.3.3
- Bump @memberjunction/global to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Bump @memberjunction/ai to v2.3.2
- Bump @memberjunction/global to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Bump @memberjunction/ai to v2.3.1
- Bump @memberjunction/global to v2.3.1

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Bump @memberjunction/ai to v2.3.0
- Bump @memberjunction/global to v2.3.0

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Bump @memberjunction/ai to v2.2.1
- Bump @memberjunction/global to v2.2.1

## 2.2.0

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Bump @memberjunction/ai to v2.2.0
- Bump @memberjunction/global to v2.2.0

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/ai to v2.1.5
- Bump @memberjunction/global to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/ai to v2.1.4
- Bump @memberjunction/global to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Bump @memberjunction/ai to v2.1.3
- Bump @memberjunction/global to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Bump @memberjunction/ai to v2.1.2
- Bump @memberjunction/global to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/ai to v2.1.1
- Bump @memberjunction/global to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:28 GMT

### Patches

- Bump @memberjunction/ai to v1.8.1
- Bump @memberjunction/global to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Minor changes

- Bump @memberjunction/ai to v1.8.0
- Bump @memberjunction/global to v1.8.0

## 1.7.1

Wed, 12 Jun 2024 20:13:29 GMT

### Patches

- Bump @memberjunction/ai to v1.7.1
- Bump @memberjunction/global to v1.7.1

## 1.7.0

Wed, 12 Jun 2024 18:53:39 GMT

### Minor changes

- Bump @memberjunction/ai to v1.7.0
- Bump @memberjunction/global to v1.7.0

## 1.6.1

Tue, 11 Jun 2024 06:50:06 GMT

### Patches

- Bump @memberjunction/ai to v1.6.1
- Bump @memberjunction/global to v1.6.1

## 1.6.0

Tue, 11 Jun 2024 04:59:29 GMT

### Minor changes

- Bump @memberjunction/ai to v1.6.0
- Bump @memberjunction/global to v1.6.0

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.5.3
- Bump @memberjunction/global to v1.5.3

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Bump @memberjunction/ai to v1.5.2
- Bump @memberjunction/global to v1.5.2

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Bump @memberjunction/ai to v1.5.1
- Bump @memberjunction/global to v1.5.1

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.5.0
- Bump @memberjunction/global to v1.5.0

## 1.4.1

Fri, 07 Jun 2024 04:36:54 GMT

### Patches

- Bump @memberjunction/ai to v1.4.1
- Bump @memberjunction/global to v1.4.1

## 1.4.0

Sat, 25 May 2024 15:30:16 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.4.0
- Bump @memberjunction/global to v1.4.0

## 1.3.3

Thu, 23 May 2024 18:35:52 GMT

### Patches

- Bump @memberjunction/ai to v1.3.3
- Bump @memberjunction/global to v1.3.3

## 1.3.2

Thu, 23 May 2024 14:19:50 GMT

### Patches

- Bump @memberjunction/ai to v1.3.2
- Bump @memberjunction/global to v1.3.2

## 1.3.1

Thu, 23 May 2024 02:29:25 GMT

### Patches

- Bump @memberjunction/ai to v1.3.1
- Bump @memberjunction/global to v1.3.1

## 1.3.0

Wed, 22 May 2024 02:26:03 GMT

### Minor changes

- Bump @memberjunction/ai to v1.3.0
- Bump @memberjunction/global to v1.3.0

### Patches

- Overhaul the way we vectorize records (155523863+JS-BC@users.noreply.github.com)

## 1.2.2

Thu, 02 May 2024 19:46:38 GMT

### Patches

- Bump @memberjunction/ai to v1.2.2
- Bump @memberjunction/global to v1.2.2

## 1.2.1

Thu, 02 May 2024 16:46:11 GMT

### Patches

- Bump @memberjunction/ai to v1.2.1
- Bump @memberjunction/global to v1.2.1

## 1.2.0

Mon, 29 Apr 2024 18:51:58 GMT

### Minor changes

- Bump @memberjunction/ai to v1.2.0
- Bump @memberjunction/global to v1.2.0

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Bump @memberjunction/ai to v1.1.3
- Bump @memberjunction/global to v1.1.3

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Bump @memberjunction/ai to v1.1.2
- Bump @memberjunction/global to v1.1.2

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Bump @memberjunction/ai to v1.1.1
- Bump @memberjunction/global to v1.1.1

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Bump @memberjunction/ai to v1.1.0
- Bump @memberjunction/global to v1.1.0

## 1.0.11

Wed, 24 Apr 2024 20:57:42 GMT

### Patches

- - bug fix in explorer-core to show new tab faster when a tab is being removed _ Added functionality in base-forms to enhance the toolbar and also enable showing changes since last saved when in Edit Mode in the base form _ BaseEntity bug - when a field had a default value other than null (e.g. any default value) and the value of the field was actually null in an existing record, that record would always be seen as dirty and would get wiped out. Fixed the logic (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.0.11
- Bump @memberjunction/global to v1.0.11

## 1.0.9

Sun, 14 Apr 2024 15:50:05 GMT

### Patches

- Bump @memberjunction/ai to v1.0.9
- Bump @memberjunction/global to v1.0.9

## 1.0.8

Sat, 13 Apr 2024 02:32:44 GMT

### Patches

- Update build and publish automation (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.0.8
- Bump @memberjunction/global to v1.0.8

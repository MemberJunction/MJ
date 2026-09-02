# @memberjunction/predictive-studio-core

## 6.1.0-edge.5

## 6.1.0-edge.4

## 6.1.0-edge.3

## 6.1.0-edge.2

## 6.1.0-edge.1

## 6.1.0-edge.0

## 6.0.0

## 5.51.0

## 5.50.0

### Patch Changes

- dd04a24: Widen the zod pin from `~3.24.4` to `^3.25.0` so it satisfies `@modelcontextprotocol/sdk`'s peer requirement (`zod ^3.25 || ^4.0`). The old tilde pin has no overlap with the SDK's peer range, which breaks strict package managers (pnpm) and MJCLI's oclif manifest generation under strict installs. zod 3.25.x keeps the classic v3 API at the root import, so this is a version-range correction with no behavior change.

## 5.49.0

### Patch Changes

- b52ffa8: Fix four silent-failure bugs found while triaging the open issue backlog. Each one looked correct from the outside while doing nothing, or doing the wrong thing, at runtime. No schema changes.

  **`BaseLLM` silently truncated streamed responses (`@memberjunction/ai`).** The streaming chunk loop caught any mid-stream error, logged it, and then finalized the response as a **success**. A dropped connection, a provider fault, or an abort part-way through a stream produced truncated content that the caller was told was complete — under every provider, for every streaming consumer. Genuine failures now surface as failures; cancellation is still routed to the driver's `finalizeStreamingResponse`, since providers differ on whether an abort throws there or simply ends iteration.

  **No LLM driver honored `ChatParams.cancellationToken`** (13 provider packages). The field existed on `ChatParams` and zero drivers read it, so an aborted or timed-out request abandoned the promise while the socket kept streaming and pinning buffers. Now forwarded to the SDK across all 19 drivers — 13 fixed directly, the remaining 6 inheriting from `OpenAILLM` / `GeminiLLM` — on both the streaming and non-streaming paths. The mechanism differs per provider and was verified rather than assumed — Bedrock takes `abortSignal` (not `signal`); Ollama has no per-request hook at all, so the signal is threaded through a custom `fetch`; and `Inception` overrides both chat paths without calling `super`, so it does not inherit the fix from `OpenAILLM` despite appearing to. An abort is reported `Fatal` / `canFailover: false`, because `ErrorAnalyzer` otherwise classifies it as retriable — meaning a request the user just cancelled would have been retried.

  **Prompt execution could not be bounded (`@memberjunction/ai-prompts`, `@memberjunction/ai-core-plus`).** On the single-model path the model call was awaited with no bound unless the caller hand-supplied an `AbortSignal`, so a hung provider connection never resolved. Adds a per-request `AIPromptParams.timeoutMS` and a typed `AIPromptTimeoutError` that `ErrorAnalyzer` classifies as retriable, so a timeout now flows into the existing retry/failover machinery instead of hanging. The timeout and any caller-supplied token compose — neither is discarded. Enforcement lives in `executeModel`, the one method the parallel coordinator also inherits, so the single-model and parallel paths cannot diverge. (Issue #3064 was filed as "`AIPromptRunner` does not enforce `AIPrompt.TimeoutMS`", but that column does not exist — the bound could not be expressed at all. A prompt-level column is tracked separately in #3133.)

  **A malformed deny-list silently disarmed the Predictive Studio leakage guard** (`@memberjunction/predictive-studio*`, `@memberjunction/core-entities-server`, `@memberjunction/ng-dashboards`). Pasting a bracketed list into the pipeline editor produced `DenyFields: ["[CheckInTime", …, "Status]"]`; the deny-set then matched nothing, so the most dangerous leak columns trained completely unguarded and the save was accepted. The editor no longer manufactures the bad input, a new `MJMLTrainingPipelineEntityServer.ValidateAsync` rejects it at save, and the dominance threshold is clamped at enforcement time so rows written before this validation existed cannot disable the guard. Also unifies `DEFAULT_DOMINANCE_THRESHOLD`, which was defined twice with different values (`0.85` vs `0.6`) — agent-authored pipelines had been held to a materially laxer guard than hand-authored ones.

  **Dead CSS shipped to production (`@memberjunction/ng-dashboards`, `@memberjunction/ng-conversations`).** These packages build with bare `ngc` — no Sass step — so `styleUrls` content is embedded verbatim. Native CSS nesting makes `&:hover` accidentally work, but it cannot do string concatenation, so every `&__elem` / `&--modifier` rule was silently dropped. Three components were affected. **This resurrects styling that has never rendered**: the realtime media-surface tab bar had no active-tab indicator, and evidence playback had no active-turn highlight and no played-progress color on its waveform. A new `check:ui-ngc-scss` CI gate prevents the trap re-arming.

  Also fixes `@memberjunction/ai-azure`, whose unit tests had never actually run — the package had test files and a vitest config but no `test` script.

## 5.48.0

## 5.47.0

### Minor Changes

- 46a06ac: Predictive Studio phase 2: per-record prediction contributions, as-of scoring fix, Studio UX overhaul.
  - **Per-record prediction contributions (P1-5)**: sidecar `/predict` returns the signed top feature drivers behind each row's prediction for linear models (`coef_ · transformed value` — exact and cheap; tree/ensemble models return none and callers fall back to global feature importance). Typed end-to-end via the new `PredictionContribution` in the shared sidecar contract.
  - **Fix — as-of column now covered by the anti-skew hydration guard**: `AsOfStrategy` `column` mode reads its cutoff date off each record, but the required-columns set only tracked feature columns + target, so a scoring scope's narrow projection that dropped the date column failed every record at `resolveAsOfDate` (live repro: 0/6747, circuit breaker). The as-of column is now hydrated and hard-asserted exactly like a feature column; two regression tests added.
  - **Studio UX**: purged all `//` comments from PS SCSS (this package embeds raw SCSS, so `//` comments reach the browser as invalid CSS and silently eat the next rule — root cause of the pipeline-pill layout breakage); Training Pipelines and Model Registry columns now scroll independently via fill-mode content hosts; Models door gains the missing `[Flex]` page body; hero card flattened to standard surface tokens; Predictions door gains business-predictions/at-risk view-models, agent context, and copilot view-models.
  - **Docs**: `plans/predictive-studio-guardrails.md` records 8 field-tested guardrail gaps (G1–G8) with proposed fixes; G8 (the as-of hydration gap) ships fixed here.

## 5.46.0

## 5.45.1

## 5.45.0

## 5.44.0

### Minor Changes

- 18b5bf0: Predictive Studio — business-user experience + a deterministic prediction-builder agent

  **`@memberjunction/predictive-studio-core`** — adds the **trust translator** (`deriveTrustVerdict`): turns a model's raw metrics into a plain-language Poor/Fair/Good/Excellent verdict + a `canAct` action gate. Shared by the UI (catalog badges + workspace gate) and the agent's publish gate, so a coin-flip / unmeasured model is fail-safe blocked (never silently acted on or published).

  **`@memberjunction/predictive-studio`** — elevates the Model Development Agent into a domain-builder (Database-Designer pattern): a deterministic `PredictiveStudioPipelineBuilder` (pure code, no LLM) turns the agent's approved `ModelingPlanSpec` into a real `MJ: ML Training Pipeline`, trains it, and **publishes only if the trust verdict clears the bar**; a `PredictiveStudioPipelineBuilderAgent` code sub-agent wraps it and a `PredictiveStudioModelDevAgent` orchestrator forces approve→build deterministically. Covered by unit, in-process integration, and an AgentRunner-driven agent-loop test.

  **`@memberjunction/ng-dashboards`** — a new business-user **Predictions** surface (the default Predictive Studio nav item): a catalog of published models reframed as plain-language predictions with trust badges (Poor/unmeasured blocked as "Needs an analyst"); a trust-gated workspace with a ranked at-risk list, plain-language drivers, and four actions (review / save scores / send to a list / export); and a "+ New prediction" docked Model Dev Agent co-pilot. Zero ML jargon — the analyst surfaces remain as Advanced.

  Also **consolidates the Predictive Studio nav from eight flat top-level items into three doors** — `Predictions` (business), `Studio` (the build/run workbench: Overview · Pipelines · Algorithm Catalog · Experiments · Compare Runs), and `Models` (Model Registry · Models in Production). The two workbench doors are single resources hosting an internal left-nav that swaps the existing section panels, with the active section round-tripped through a `section` query param (deep links + back/forward). The seven old per-section resources and the legacy monolith dashboard are removed. Also **fixes the embedded "New prediction" / Model Dev Agent co-pilot** not sending the first message: the chat-area was missing its conversation lifecycle wiring (`isNewConversation` + `conversationCreated`), so the suppressed empty-state input had no conversation to write into and silently no-op'd.

  **`@memberjunction/ng-conversations`** — fixes the realtime session widget's surface/Details panel not opening for a new user (or the agent): the on-demand "Details peek" no longer also requires the cross-session disclosure ratchet, so it opens at any level.

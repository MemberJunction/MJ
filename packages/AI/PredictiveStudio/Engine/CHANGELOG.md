# @memberjunction/predictive-studio

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [2143b98]
- Updated dependencies [c20723a]
- Updated dependencies [bda123a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai-agents@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/record-set-processor-base@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/ai-core-plus@5.48.0
  - @memberjunction/actions-base@5.48.0
  - @memberjunction/actions@5.48.0
  - @memberjunction/record-set-processor@5.48.0
  - @memberjunction/predictive-studio-core@5.48.0
  - @memberjunction/predictive-studio-sidecar@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Minor Changes

- 46a06ac: Predictive Studio phase 2: per-record prediction contributions, as-of scoring fix, Studio UX overhaul.
  - **Per-record prediction contributions (P1-5)**: sidecar `/predict` returns the signed top feature drivers behind each row's prediction for linear models (`coef_ · transformed value` — exact and cheap; tree/ensemble models return none and callers fall back to global feature importance). Typed end-to-end via the new `PredictionContribution` in the shared sidecar contract.
  - **Fix — as-of column now covered by the anti-skew hydration guard**: `AsOfStrategy` `column` mode reads its cutoff date off each record, but the required-columns set only tracked feature columns + target, so a scoring scope's narrow projection that dropped the date column failed every record at `resolveAsOfDate` (live repro: 0/6747, circuit breaker). The as-of column is now hydrated and hard-asserted exactly like a feature column; two regression tests added.
  - **Studio UX**: purged all `//` comments from PS SCSS (this package embeds raw SCSS, so `//` comments reach the browser as invalid CSS and silently eat the next rule — root cause of the pipeline-pill layout breakage); Training Pipelines and Model Registry columns now scroll independently via fill-mode content hosts; Models door gains the missing `[Flex]` page body; hero card flattened to standard surface tokens; Predictions door gains business-predictions/at-risk view-models, agent context, and copilot view-models.
  - **Docs**: `plans/predictive-studio-guardrails.md` records 8 field-tested guardrail gaps (G1–G8) with proposed fixes; G8 (the as-of hydration gap) ships fixed here.

### Patch Changes

- Updated dependencies [b216f2b]
- Updated dependencies [46a06ac]
  - @memberjunction/core@5.47.0
  - @memberjunction/predictive-studio-core@5.47.0
  - @memberjunction/predictive-studio-sidecar@5.47.0
  - @memberjunction/ai-agents@5.47.0
  - @memberjunction/ai-core-plus@5.47.0
  - @memberjunction/actions-base@5.47.0
  - @memberjunction/actions@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/record-set-processor-base@5.47.0
  - @memberjunction/record-set-processor@5.47.0
  - @memberjunction/ai@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/ai-agents@5.46.0
  - @memberjunction/ai-core-plus@5.46.0
  - @memberjunction/actions-base@5.46.0
  - @memberjunction/actions@5.46.0
  - @memberjunction/record-set-processor-base@5.46.0
  - @memberjunction/record-set-processor@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/predictive-studio-core@5.46.0
  - @memberjunction/predictive-studio-sidecar@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- Updated dependencies [572d219]
  - @memberjunction/ai-core-plus@5.45.1
  - @memberjunction/ai-agents@5.45.1
  - @memberjunction/record-set-processor@5.45.1
  - @memberjunction/ai@5.45.1
  - @memberjunction/predictive-studio-core@5.45.1
  - @memberjunction/predictive-studio-sidecar@5.45.1
  - @memberjunction/actions-base@5.45.1
  - @memberjunction/actions@5.45.1
  - @memberjunction/core@5.45.1
  - @memberjunction/core-entities@5.45.1
  - @memberjunction/global@5.45.1
  - @memberjunction/record-set-processor-base@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [19ec4b0]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [ad9f4a3]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/ai-agents@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/ai-core-plus@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/actions-base@5.45.0
  - @memberjunction/actions@5.45.0
  - @memberjunction/record-set-processor-base@5.45.0
  - @memberjunction/record-set-processor@5.45.0
  - @memberjunction/ai@5.45.0
  - @memberjunction/predictive-studio-core@5.45.0
  - @memberjunction/predictive-studio-sidecar@5.45.0

## 5.44.0

### Minor Changes

- 18b5bf0: Predictive Studio — business-user experience + a deterministic prediction-builder agent

  **`@memberjunction/predictive-studio-core`** — adds the **trust translator** (`deriveTrustVerdict`): turns a model's raw metrics into a plain-language Poor/Fair/Good/Excellent verdict + a `canAct` action gate. Shared by the UI (catalog badges + workspace gate) and the agent's publish gate, so a coin-flip / unmeasured model is fail-safe blocked (never silently acted on or published).

  **`@memberjunction/predictive-studio`** — elevates the Model Development Agent into a domain-builder (Database-Designer pattern): a deterministic `PredictiveStudioPipelineBuilder` (pure code, no LLM) turns the agent's approved `ModelingPlanSpec` into a real `MJ: ML Training Pipeline`, trains it, and **publishes only if the trust verdict clears the bar**; a `PredictiveStudioPipelineBuilderAgent` code sub-agent wraps it and a `PredictiveStudioModelDevAgent` orchestrator forces approve→build deterministically. Covered by unit, in-process integration, and an AgentRunner-driven agent-loop test.

  **`@memberjunction/ng-dashboards`** — a new business-user **Predictions** surface (the default Predictive Studio nav item): a catalog of published models reframed as plain-language predictions with trust badges (Poor/unmeasured blocked as "Needs an analyst"); a trust-gated workspace with a ranked at-risk list, plain-language drivers, and four actions (review / save scores / send to a list / export); and a "+ New prediction" docked Model Dev Agent co-pilot. Zero ML jargon — the analyst surfaces remain as Advanced.

  Also **consolidates the Predictive Studio nav from eight flat top-level items into three doors** — `Predictions` (business), `Studio` (the build/run workbench: Overview · Pipelines · Algorithm Catalog · Experiments · Compare Runs), and `Models` (Model Registry · Models in Production). The two workbench doors are single resources hosting an internal left-nav that swaps the existing section panels, with the active section round-tripped through a `section` query param (deep links + back/forward). The seven old per-section resources and the legacy monolith dashboard are removed. Also **fixes the embedded "New prediction" / Model Dev Agent co-pilot** not sending the first message: the chat-area was missing its conversation lifecycle wiring (`isNewConversation` + `conversationCreated`), so the suppressed empty-state input had no conversation to write into and silently no-op'd.

  **`@memberjunction/ng-conversations`** — fixes the realtime session widget's surface/Details panel not opening for a new user (or the agent): the on-demand "Details peek" no longer also requires the cross-session disclosure ratchet, so it opens at any level.

### Patch Changes

- 04f7863: Predictive Studio — Operate flow hardening + score-time train/serve skew fix

  **`@memberjunction/predictive-studio`** — Fix a silent train/serve skew in the FeatureAssembly score path. On-demand / scheduled scoring receives its records from an upstream Record-Set-Processing scope that may load them with a narrow field projection, dropping virtual/denormalized feature columns (e.g. a value-list field joined into the entity view but absent from the base table). The model trained on those columns, so their absence at score time silently degraded every prediction toward a constant. `FeatureAssemblyExecutor.assemble()` now re-reads any _absent_ required feature column from the **same entity view the training path reads** (keyed by primary key; columns already present are untouched, so training / full-load paths incur no extra read), and **hard-fails** if a required column is still absent — converting a silent "Succeeded with degenerate output" into a clear `Failed` run that bubbles to the run history and UI. The guardrail also protects training (a pipeline declaring a column the view doesn't expose now fails loudly up front). Covered by new unit tests (hydration, hard-fail, train/serve parity) and an integration assertion that on-demand predictions vary across a multi-type scope.

  **`@memberjunction/ng-dashboards`** — Predictive Studio: (1) "Models in Production" tab now reloads the selected model's run history + scoring bindings after the Operate dialog runs / schedules / binds a model, so a just-created run appears immediately (the reactive model stream refreshes deploy state but not the on-demand run list); (2) the Home recent-activity feed no longer crashes when a scoring run or model event arrives with a missing/invalid timestamp (it falls back gracefully instead of throwing); (3) Operate dialog summary grammar + a stale idle-state caption.

- Updated dependencies [eb38a42]
- Updated dependencies [3633fbb]
- Updated dependencies [d88568e]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [91842c3]
- Updated dependencies [89ea055]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [18b5bf0]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/ai-agents@5.44.0
  - @memberjunction/ai-core-plus@5.44.0
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ai@5.44.0
  - @memberjunction/predictive-studio-core@5.44.0
  - @memberjunction/record-set-processor@5.44.0
  - @memberjunction/actions-base@5.44.0
  - @memberjunction/actions@5.44.0
  - @memberjunction/record-set-processor-base@5.44.0
  - @memberjunction/predictive-studio-sidecar@5.44.0

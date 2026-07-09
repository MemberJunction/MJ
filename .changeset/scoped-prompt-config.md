---
"@memberjunction/core-entities": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/aiengine": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-prompts": patch
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
---

feat(prompt-config): scope-aware prompt run-settings override (ScopedPromptConfig + resolver)

The run-settings sibling of `ScopedPromptPart`. Where `ScopedPromptPart` scope-overrides a
prompt's TEXT, `ScopedPromptConfig` scope-overrides a prompt's RUN SETTINGS — model/vendor, AI
configuration, sampling knobs (temperature/topP/topK/minP/penalties/seed/stopSequences),
response format, and effort level — for an `AIPrompt`, narrowed by the SAME polymorphic scope the
agent runtime already carries (`PrimaryScopeEntity`/`PrimaryScopeRecordID` + `SecondaryScopes`).
Any MJ app can tune which model a prompt runs on and how it samples, per scope, by editing rows.

- **Entity** `__mj.ScopedPromptConfig` — scope columns (mirroring `ScopedPromptPart`) + nullable
  override columns; `Status`/`Priority`. Whole-row-wins by specificity (SecondaryScopes match >
  PrimaryScopeRecord > global, tie-broken by `Priority`); each non-null column overrides the
  prompt default, a NULL column inherits it.
- **`ScopedPromptConfigResolver`** (`@memberjunction/ai-agents`) — cached on `AIEngine`
  (`ScopedPromptConfigs`); pluggable via `@RegisterClass`; resolves the single most-specific
  in-scope config. `ApplyScopedPromptConfig` overlays it onto the run params
  (model/vendor → `override`, configuration → `configurationId`, effort → `effortLevel`, sampling
  knobs → `additionalParameters`).
- **`BaseAgent` wiring** — `preparePromptParams` resolves + applies the config using the run's
  existing scope, right before the params are returned. **Runtime-explicit overrides still win.**
- `StopSequences` overlays as a trimmed `string[]` (the comma-delimited column is split before it
  reaches `additionalParameters`, matching the runner's array contract — not the raw string).
- Unit tests for the resolver (cascade / priority / status / null-column inherit / runtime-wins,
  plus the StopSequences-array and ResponseFormat mappings).
- **`@memberjunction/ai-prompts`** — two `AIPromptRunner` fixes:
  1. **Response format override is honored** — the run now prefers `additionalParameters.responseFormat`
     (set by `ApplyScopedPromptConfig`) over the prompt's own `ResponseFormat`, keeping `'Any'`-means-
     silent semantics. Previously a `ScopedPromptConfig.ResponseFormat` was a no-op (the runner only
     read `prompt.ResponseFormat`).
  2. **`Messages` logging** — records caller-supplied `conversationMessages` to `AIPromptRun.Messages`
     even without a template-rendered system prompt (previously dropped for the
     `templateMessageRole='none'` path, leaving `Messages` null).

# Change Log - @memberjunction/ai

## 6.1.0-edge.5

### Minor Changes

- b1b24d7: Weekly AI model & vendor intelligence report (2026-08-31) + four metadata edits.
  - **New model** `GLM-5.3-Flash` (Z.AI, released 2026-08-26). Z.AI as Model Developer + Inference Provider, plus OpenRouter and Fireworks.ai as Inference Providers. Cost rows for Z.AI direct ($0.15/$0.50 per 1M) and OpenRouter ($0.05/$0.1667 reflecting a 50% Z.AI promo through 2026-09-09; a follow-up row should be added when the promo expires so the historical rate is preserved).
  - **New model** `Qwen3.8-Flash` (Alibaba Cloud, released 2026-08-26). Alibaba Cloud as Model Developer + Inference Provider, plus OpenRouter and Fireworks.ai as Inference Providers. Cost rows for Alibaba direct and OpenRouter at $0.15/$0.47 per 1M.
  - **New inference provider** on `Grok 4.6`: Amazon Bedrock vendor row (`xai.grok-4-6-v1:0`) and matching cost record (2026-08-25 start, $2/$6 sub-200K tier at vendor parity with x.ai direct).
  - **Deprecation** `Kimi K2.5` on Moonshot AI direct — the Moonshot Inference Provider vendor row and cost record are now `Status: "Inactive"` per Moonshot's 2026-08-31 sunset of `moonshotai/Kimi-K2.5` and the `moonshot-v1-*` series. Fireworks.ai and OpenRouter vendor rows remain Active (weights are MIT-licensed and both providers may continue to serve the model).
  - Full report at `reports/ai-model-research/2026-08-31-weekly-report.md`, including 5 items flagged for human review (DeepSeek V4 Flash Vision Experimental, OpenAI Daybreak Red/Blue on Bedrock, OpenAI Astra, Azure OpenAI cache-write charges on GPT-5.6 family, plus prior-week open items).

- 1a2ce13: Pricing for models that aren't billed by the token, and OpenAI as a second Whisper provider.

  **The problem.** MJ's pricing _schema_ was always general — a cost row names a price unit type, and the unit type names a `DriverClass` the ClassFactory resolves. The _execution layer_ was not: `BasePriceUnitType` took two token counts, only the three token drivers were ever registered, and `MJAIPromptRunEntityServer` refused to cost any run reporting zero tokens. So the three continuous-media unit types that already shipped — `Per Image`, `Per Minute`, `Per Hour` — resolved to nothing, and every run priced by one was silently uncosted. Six ACTIVE image cost rows were in that state. (Bug register B60.)

  Speech-to-text made it concrete: Groq bills Whisper by the audio-hour, the just-landed `GroqAudioGenerator` requested `response_format: 'json'` which discards the duration entirely, and the two Whisper models shipped with no cost rows because there was no honest way to write one.

  **Usage grows a second axis.** `ModelUsage` gains `unitKind` (`'Tokens' | 'Seconds' | 'Characters' | 'Images'`), `inputUnits` and `outputUnits`, plus a `ModelUsage.ForMedia(kind, input, output?)` constructor. Continuous quantities are deliberately _not_ folded into the token fields: a run reporting 90 "tokens" that means 90 minutes corrupts `TokensUsed`, every rollup above it, and every dashboard downstream. `SpeechResult` gains `usage?`, matching `ImageGenerationResult`.

  Quantities are always recorded in the **base** measure, never the billing measure — audio billed per hour is still recorded in seconds, and the driver converts. That is what lets one measured duration be priced against a per-minute row from one vendor and a per-hour row from another.

  **Pricing takes quantities.** `BasePriceUnitType` gains a `UnitKind` getter (defaulting to `'Tokens'`, so external subclasses need no change) and `CalculateCost(activeCost, usage)`, the preferred entry point — its default delegates to the existing cache-aware path, so every current driver behaves identically. `TimePerMinutePriceUnitType`, `TimePerHourPriceUnitType` and `PerImagePriceUnitType` register against the unit types that were already seeded, closing the driver half of B60.

  Each driver also exposes `UnitsPerBillingUnit` — 1,000,000 for a per-million-token rate, 3,600 for per-hour, 1 for per-image — so a divisor exists in exactly one place per driver. `TOKEN_PRICE_UNIT_TYPE_DIVISORS` is _derived_ from the driver instances rather than restated, which makes drift between the exported table and the arithmetic that prices every run impossible instead of merely detectable. The map deliberately covers only the token drivers: a missing key is the signal for a consumer doing token-rate math to SKIP a row priced by audio duration, not to fall back to a per-token divisor.

  `BasePriceUnitType` is marked `@RequiresSubclass()`. `ClassFactory.CreateInstance` has never returned `null` for an unregistered key — it falls back to `new BaseClass(...)` — so `if (!calculator)` was a dead branch that installed a hollow object whose only pricing method is `undefined`, surfacing as a `TypeError` inside cost math rather than "this driver is not registered". The new `UnitKind` default made that hollow instance _more_ convincing, since it answers `'Tokens'` and so passes the measure check before throwing. `GetPriceCalculator` now resolves via `TryCreateInstance` and reports the failure, so its documented `null` return is real.

  `AIEngineBase.CalculateModelCost(modelID, vendorID, usage)` is a new costing surface for callers holding a result but no prompt run — transcription and image actions, downstream apps. It returns `null`, having logged why, when there is no active cost row in the measure the run recorded, no registered driver, or a mismatch between what the run measured and what the row prices. A null means "we don't know what this cost" and must never be read as zero.

  **Cost-row selection is measure-aware.** `GetActiveModelCost` takes an optional `usageKind` and excludes rows priced in any other measure before the most-recently-started tiebreak. Without it the effective key is `(Model, Vendor, ProcessingType)`, which cannot represent a model billing in two measures — per-image output alongside per-token prompt — so which measure you got was a sort-order coin flip that was then refused downstream and reported as a pricing gap. The measure is now established _before_ a row is chosen. Omitting the argument keeps the previous behaviour, and no shipped model+vendor carries two measures today, so nothing changes for existing data.

  **The measure is a first-class row, not a string.** A new `MJ: AI Usage Types` entity (`Tokens`, `Seconds`, `Characters`, `Images`) is what a run and a price unit type point at, so "what does this price buy" is answerable by a join instead of by convention. An earlier revision carried it as `AIPromptRun.UnitsKind NVARCHAR(20)` behind a CHECK constraint, which made the set of measures a property of a constraint on one column: nothing else in the schema could reference a measure, and adding one meant editing a CHECK on a table with nothing to do with pricing.

  Note the usage type and the price unit type answer **different** questions and stay separate: `AIUsageType` is the BASE measure of a quantity, while `AIModelPriceUnitType` is the BILLING unit and its scale. Audio is recorded in `Seconds` and billed `Per Hour`. Collapsing them would force a new usage type per billing granularity.

  **The measure lives on `AIModelPriceUnitType`, and nowhere else.** It gains `UsageTypeID` — so a cost row has exactly one place to look for its measure, reached through its `UnitTypeID`, and the FK there means whatever it finds is a real catalog row rather than a string. `AIModelCost` deliberately carries **no** usage-type column: it would be a second copy of a derivable fact, and nothing would arbitrate a cost row claiming `Seconds` while its unit type says `Tokens` — which is precisely the comparison the safety checks depend on. Single-sourcing makes that contradiction unrepresentable rather than merely unlikely.

  **The divisor becomes data, which closes B60's class rather than its instance.** `AIModelPriceUnitType.UnitsPerBillingUnit` (`CHECK > 0`) holds the number that converts base measure to billed unit — 1,000,000 for per-1M-tokens, 3,600 for per-hour, 1 for per-image. That number previously existed _only_ inside a TypeScript class, and that is the root cause of B60: `Per Image` / `Per Minute` / `Per Hour` were seeded as data by one person while the driver classes were never written by another, and the seam was silent for months. A new `LinearPriceUnitType` (`DriverClass = 'Linear'`) reads both columns off its own row, so a linear billing unit — "Per 1,000 Characters" — now ships as one seeded row with no class, no registration and no build. `DriverClass` remains the escape hatch for genuinely non-linear pricing (tiered rates, per-image-by-resolution, minimum-billing increments like the Groq 10-second floor). An _unregistered_ driver still refuses to price, deliberately: `DriverClass` is NOT NULL, so an unrecognised name is ambiguous between "a new linear unit" and "a non-linear driver whose code is missing", and pricing the second linearly would produce a confident wrong number.

  **`AIModelPriceType` is demoted alongside.** It was a NOT NULL FK that nothing prices, filters or branches on, while `AIModelPriceUnitType` carried the real contract — three vocabularies for one concept, with the _mandatory_ one the one nothing read. Adding a usage type without demoting it would have locked that ambiguity in permanently. Not dropped (NOT NULL, 235 metadata rows, and dropping is on the Forbidden list in `PUBLISH_NO_BREAK_POLICY.md`): the field is flagged `Status = 'Deprecated'`, removed from the generated form (`IncludeInGeneratedForm = 0`, which is the step that actually ends the ambiguity rather than documenting it), and has `AutoUpdateDescription` cleared so CodeGen cannot overwrite the demotion text — all declared in `metadata/entities`, where field-level editorial decisions belong, rather than as EntityField UPDATEs in a migration. The migration keeps only the schema half: a database default of `Tokens`, so new cost rows need not name a value from the vocabulary they are being told to ignore.

  **Prompt runs can record it.** `AIPromptRun` gains `InputUnitsUsed`, `OutputUnitsUsed` (both `CHECK >= 0`) and `UsageTypeID`, where NULL means token-billed — which is what every row written before the column existed IS, since the schema had no way to say anything else. That reading happens at exactly one seam (`MJAIPromptRunEntityServer.RecordedUsage`) rather than in four places, so the rest of the runtime still sees a definite measure. The save-time cost gate passes on units as well as tokens, and refuses — loudly — to price a run whose measure disagrees with its cost row's, rather than dividing seconds by a million and reporting the ~$0 that produces. No units rollup was added: units of different kinds cannot be summed, so cost remains the universal aggregate.

  **The catalog rows are declarative metadata, and that is what makes the new columns nullable.** The four measures live in `metadata/ai-usage-types`, and the measure + divisor for all six shipped billing units in `metadata/ai-model-price-unit-types` — seeded and backfilled by `mj sync push`, not by INSERT and UPDATE statements in the migration, so they are reviewable data in the same form as the rest of the catalog. Metadata is pushed by the release-time consolidated `*__Metadata_Sync.sql`, which by construction carries a later timestamp than any migration a PR can author, so a NOT NULL column defaulted to the Tokens row would fail the from-scratch build on the ADD itself: SQL Server materialises the default into every existing row and the foreign key has nothing to resolve. Nullable + FK is the strongest guarantee available before the seed exists — any non-null value is a real measure — and the runtime is written to that contract rather than around it: a price unit type with no measure refuses to price rather than guessing Tokens. Tightening both `UsageTypeID` columns to NOT NULL is a one-statement follow-up in the release _after_ the one that ships the seed.

  A clean-room bootstrap also found that `sp_updateextendedproperty` throws when the property does not already exist, so the demotion uses drop-then-add — the same fresh-install-only class as the `EntityField.Sequence` trap in `migrations/CLAUDE.md`.

  **`ModelUsageUnitKind` must stay a superset of the `AIUsageType` catalog, and the catalog rows are the source.** `MJAIPromptRunEntityServer` resolves a run's `UsageTypeID` to the catalog row's `Name` and hands that string straight to `ModelUsageUnitKind`. Nothing about that is checked by the compiler — the name arrives as a plain `string` from a database row — so seeding a usage type whose name the union does not carry produces no build error, just a runtime hole on exactly the rows using the new measure. `MODEL_USAGE_UNIT_KINDS` exists so a test can assert the two agree by reading the seed file rather than restating it. `Characters` is present for that reason and has no pricing driver yet, which is not a defect: the costing path refuses to price a measure no driver claims and logs why, which is strictly better than a plausible wrong number. A compile-time assignability pin backs this up (Vitest does not typecheck by default, which is how a narrowing slipped through once).

  **Providers.** Groq now requests `verbose_json` and reports the duration it was already being billed for, summed across split pieces. If any piece fails to report one, usage is left undefined rather than under-reported — a partial sum understates the bill while looking complete. `OpenAIAudioGenerator.SpeechToText` is implemented (it previously threw), with the same 25MB ceiling, the same injected `AudioSplitter`, and the same duration capture. The split-and-join loop moved onto `BaseAudioGenerator.TranscribeWithSplitting` so both providers share one implementation.

  **Cost rows now ship** for Groq Whisper Large v3 ($0.111/audio-hour) and Turbo ($0.04/audio-hour), verified against Groq's published pricing. `Whisper 1` is a **new** model rather than a vendor row on Whisper Large v3: OpenAI's endpoint serves the large-v2 checkpoint, and attaching it to the v3 record would misreport which weights transcribed a given run. It carries a $0.006/minute cost row.

  **Also:** the AC1 integration check flips from warning to hard assert now that every shipped unit type resolves — a future unit type added without a driver reddens the deterministic tier instead of scrolling past. The assert is scoped to unit types an **Active cost row actually references**, since those are the ones whose missing driver silently uncosts real runs; a custom unit type awaiting its driver, referenced by nothing, is reported rather than failed.

  A new **AC7** check is the monitoring counterpart to the whole refusal doctrine. Everything here turns a wrong number into a `NULL`, which is right — but a null plus a `LogError` in a server log is invisible, and that is precisely how B60 survived months with six dormant ACTIVE image cost rows. AC7 asks the question nothing asked: completed runs that did measurable work and carry no cost. It grades the two populations differently — no active cost row in the run's measure is a pricing-coverage gap and is reported; an active cost row in that measure _existing_ while the run is still uncosted means the pipeline had everything it needed and produced nothing, which is asserted.

  The two Explorer cost dashboards no longer carry their own copy of the divisor table. They now resolve a cost row's scale through its unit type's `DriverClass` against the exported `TOKEN_PRICE_UNIT_TYPE_DIVISORS`, and skip rows priced by a non-token unit type rather than defaulting them to the per-1M divisor — which had been dividing an hourly audio rate by a million. Both local tables were keyed by unit-type _display name_ using names (`Per Million Tokens`) that never matched the seeded ones (`Per 1M Tokens`), so every lookup missed and only the per-1M fallback made the numbers come out right; keying off the driver class removes both the miss and the fallback that hid it.

  Pricing also refuses, rather than reporting $0, when a run records continuous units without a resolvable usage type to name their measure — the same "we don't know what this cost" rule the rest of the path follows.

  Both transcription providers request `verbose_json` only for models that accept it. OpenAI's GPT-4o transcription models reject it outright, so they fall back to `json` and report no duration instead of failing the transcription; Groq's STT surface is Whisper-only today, so the guard there is prospective — matched on `includes('whisper')`, because `distil-whisper-large-v3-en` does support `verbose_json` and a `startsWith` test would strip its duration and leave every run through it uncosted. A reported duration of exactly `0` now leaves usage undefined rather than producing a measure with no quantity, which the pricing layer would refuse and log as a fault for genuinely silent audio.

  The PostgreSQL counterpart to the migration is deferred to the release build, per `migrations/CLAUDE.md`.

### Patch Changes

- ada8784: Fix `ExecuteSimplePrompt`: four stacked defects in model selection, each reporting as something else (#3532)

  `ExecuteSimplePrompt` could not run at all, and every failure pointed somewhere other than its cause.
  1. **A model row with a null `DriverClass` threw while BUILDING the candidate list.**
     `AIAPIKeys.GetAPIKey` did `AIDriverName.toUpperCase()`, so one malformed row took out prompt
     execution entirely with `Cannot read properties of null (reading 'toUpperCase')`, naming neither
     the row nor the operation. A driver-less row has no key — that is an answer, and every caller
     already handles a falsy one.
  2. **`AIModelType` is a virtual column that is not populated on the engine's model objects**, so the
     LLM filter matched nothing and the caller was told _"No AI models with valid API keys found"_ — a
     message about keys for a problem with nothing to do with keys, which sends you to your
     environment. Selection now resolves the type through `ModelTypesByID` (an ID lookup that cannot be
     absent), with the virtual column as a fallback rather than the source of truth.
  3. **`DriverClass` lives on the model's VENDOR now**, so `GetAIAPIKey(model.DriverClass)` could never
     match and the list stayed empty — the same misleading key message again.
  4. **`APIName` also moved to the vendor**, so `chatParams.model` went out empty and the provider
     answered 404 with an empty error message, which reads as "that model doesn't exist" and sends you
     to a model list where the model is plainly present.

  Selection is now vendor-first and uses MJ's own rules rather than a local heuristic: for each Active
  LLM model, its Active **inference-provider** vendors (`AIEngine.IsInferenceProvider` — the same
  predicate `AIPromptRunner` selects with) in `Priority` order, and the first whose `DriverClass`
  resolves an API key wins. Deliberately not "any vendor whose driver class ends in LLM": a vendor can
  be attached to a model as its _developer_ without serving an endpoint.

  The model and its chosen vendor are returned as a pair rather than stamped onto the model entity —
  those entities are the engine's process-wide cache, so writing the winning driver onto one would leak
  into every other caller and make the next request's answer depend on this one's.

  Both of the issue's asks beyond the fix are covered: the failure message now says **which** of the
  three walls was hit (no LLM models / no Active inference vendor / no key resolved), and an empty wire
  name is refused client-side with the row to fix instead of being sent and 404'd.

  `preferredModels` is matched against all three names a caller could plausibly hold — the model's
  `Name`, the model's own `APIName`, and the vendor's wire name. The vendor's is an implementation
  detail (an Azure deployment name, a gateway slug) that a caller has no reason to know, so matching
  only that one would have quietly downgraded existing callers to power selection: not an error, just
  the wrong model.

- Updated dependencies [1940a4d]
- Updated dependencies [23c2521]
  - @memberjunction/global@6.1.0-edge.5

## 6.1.0-edge.4

### Minor Changes

- e533ce5: Weekly AI model & vendor intelligence report (2026-08-24) + two metadata edits.
  - **New model** `GLM 5.3` (Zhipu, released 2026-08-14). Placeholder record with Z.AI as Model Developer and OpenRouter as Inference Provider; no `MJ: AI Model Costs` rows populated because Zhipu has not posted a per-token API rate.
  - **Deprecation** `GLM 4.7` on Cerebras — the Cerebras vendor row and matching cost record are now `Status: "Inactive"` per Cerebras' 2026-08-17 retirement of GLM-4.7 from its inference cloud. OpenRouter and Fireworks.ai vendor rows for GLM 4.7 remain Active.
  - Full report at `reports/ai-model-research/2026-08-24-weekly-report.md`, including 4 items flagged for human review (DeepSeek V4 Pro Aug-16 cost record, GPT-5.6 Sol pricing conflict, FLUX.2 family refresh, redundant Sonnet 5 Sep-1 cost row).

### Patch Changes

- Updated dependencies [4586215]
- Updated dependencies [a5f92d2]
  - @memberjunction/global@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- f5ec13b: Move the shared LLM conformance suite out of the runtime `@memberjunction/ai` package, and gate silent skip-growth in the integration registry (review fixes for #3542).

  **Conformance suite relocated to `@memberjunction/unit-testing`.** The shared BaseLLM
  streaming/ChatResult conformance suite and its OpenAI-compatible seam mock previously lived in
  `@memberjunction/ai/src/test-support/` and were consumed through a deep `@memberjunction/ai/dist/test-support/*.js`
  import — reaching past the package's public API into its build output, which resolved only because
  `@memberjunction/ai` has no `exports` map, and which shipped test code plus an optional `vitest`
  peer dependency inside the runtime package. Both files (and the suite's own reference regression
  test) now live in `@memberjunction/unit-testing`, are exported from its index
  (`RunLLMConformanceSuite`, `CreateOpenAICompatibleSeamMock`, and their types), and the eight
  provider conformance suites import them from `@memberjunction/unit-testing`. `@memberjunction/ai`
  no longer ships `dist/test-support/*` and no longer declares the optional `vitest` peer. No runtime
  behavior changes; test-only wiring.

  **Skip-growth is now gated, not just reported.** `check-registry.test.ts` gained a snapshot of the
  exact set of checks that self-skip out of the deterministic lane (every `RequiresMutation` and
  `RequiresLiveModel` check across all bundles). A change that makes a check newly self-skip — or
  silently un-gates one — now fails the unit tests with a paste-ready diff, instead of only shrinking
  the CI step-summary. Also corrected a stale `task-graph-execution` count (26 → 27) in the
  all-bundle coverage-loss guard that had drifted after a `next` merge added TX27.

- Updated dependencies [834f8d7]
- Updated dependencies [cefc302]
- Updated dependencies [be0bdb2]
- Updated dependencies [f5ec13b]
- Updated dependencies [1bd9674]
  - @memberjunction/global@6.1.0-edge.3

## 6.1.0-edge.2

### Minor Changes

- 5ecfdb4: Realtime voice agents can now **speak first**.

  Conversation-start behavior is not instruction-following: an ElevenLabs realtime agent with no `first_message` produces no audio at all until it receives user audio, whatever the persona prompt says. Every ElevenLabs realtime session therefore opened in silence, waiting for the human to guess they should talk (issue #3557).
  - **`ElevenLabsRealtime`** now sends an `agent.first_message` conversation-config override, built alongside the existing prompt and voice overrides, so both topologies (server-bridged and client-direct) carry it. The managed agent enables the override, and — because `OverridesSatisfied` requires it too — an agent provisioned by an earlier MJ version is re-PATCHed on next use instead of silently dropping it forever (the failure mode behind #3374). Omitting it preserves today's wait-for-the-user behavior exactly.
  - **New persona slot `realtime.voice.default.firstMessage`** authors the opening utterance without naming a vendor, filed onto whichever driver resolves under the neutral `firstMessage` key — the same shape as the agnostic `voice`. It reaches both realtime host paths (`BaseAgent` server-bridged and `RealtimeClientSessionService` client-direct). The text is spoken VERBATIM; it is the literal opening line, not guidance about how to open.
  - **`AssemblyAIRealtime`** honors the same neutral `firstMessage` key for its `greeting` wire slot. The legacy `greeting` config key still works; `firstMessage` wins when it carries something. Both go through the same trim-and-drop-blank rule as the ElevenLabs driver, so one authored value means the same thing whichever vendor runs — in particular a blank `firstMessage` reads as "none authored" and does not suppress a valid legacy `greeting`.
  - **`firstMessage` is registered in `REALTIME_SHARED_CONFIG_KEYS`**, and the drivers that do not consume it now scrub it. Because an agnostic persona slot is filed onto _whichever_ driver resolves, an unregistered neutral key survives each driver's residual-bag spread and reaches the provider as an unknown session field — it was reaching the OpenAI (and xAI) `session.update` payload on both topologies, and Inworld's raw-override loop was copying it onto the session verbatim. On the OpenAI-protocol endpoints a malformed session object is rejected wholesale, taking the prompt and tools with it. Inworld now scrubs the whole shared vocabulary, closing the same class of leak for the other shared keys too.

  Drivers without a provider-native opening utterance ignore the key and open silently, as before.

- 11de1a3: Speech-to-text: `GroqAudioGenerator`, and the model type it needed.

  **`GroqAudioGenerator`** transcribes audio via Groq's Whisper models, and is the first `BaseAudioGenerator` subclass in MJ that actually implements `SpeechToText` — the OpenAI and ElevenLabs audio generators both throw for it, so the abstract method existed with no working implementation behind it. It uses the `groq-sdk` already depended on; no new dependencies.

  Groq exposes no text-to-speech API, so `CreateSpeech` throws and `GetSupportedMethods` reports only what works. Whisper on Groq cannot do speaker diarization at all — there is no parameter for it and nothing in the response to derive it from — so that is documented rather than approximated; speaker labels need AssemblyAI or Deepgram.

  An empty transcript is reported as a **failure**, not a success with empty content: Whisper returns an empty string both for silence and for audio it could not decode, and a caller that stores the result would otherwise store nothing as if it were the transcript.

  **`SpeechToTextParams`** gains four optional fields, all additive: `audioData` (a `Buffer`, avoiding the 33% memory cost of base 64 encoding an hour of audio into a string the implementation immediately decodes again), `fileName` (some providers infer the container format from the extension), `language` and `prompt`. `audioFile` is unchanged and still accepted.

  **`AudioSplitter`** is a new port in `@memberjunction/ai`, for providers that cap upload size. It declares one method, `Split(audio, maxBytes)`. Groq rejects requests over 25MB; assign an `AudioSplitter` to `GroqAudioGenerator.Splitter` and longer audio is split, transcribed piece by piece **sequentially** (Groq rate limits by audio-seconds per minute, so overlapping uploads buy 429s) and joined. Without one, oversized audio fails with a message naming the option rather than silently transcribing a truncated prefix.

  The splitter is injected rather than bundled on purpose: splitting audio without re-encoding it means an ffmpeg binary, and a ~70MB platform-specific binary is not a dependency an AI provider package should force on every consumer, most of which transcribe short clips.

  **New `Speech to Text` AI model type**, with `Whisper Large v3` and `Whisper Large v3 Turbo` on Groq. The model-type catalog covered LLM, Embeddings, Image Generator, Video, Reranker, TTS and Realtime — nothing described audio to text, so a transcription model could only be filed under TTS, which inverts its modalities. MJ's own catalog had already flagged this: the notes on GPT-Realtime-2 record that GPT-Realtime-Whisper is "flagged for human review pending Per-Minute PriceUnitType + Speech-to-Text AIModelType additions to MJ schema". This is the second half of that note; the per-minute price unit is not addressed here, which is also why no cost rows are seeded — Groq bills Whisper by audio-hour, and a per-token cost row would be wrong where a missing one is merely absent.

  68 tests across the Groq package, 37 of them new.

- 48ff99f: Add `ModelConfiguration` — a per-modality, strongly-typed JSON configuration bag on the AI model catalog — at three levels forming an inherit-with-override cascade: `AIModelType` < `AIModel` < `AIModelVendor`, resolved base-first with per-key deep merge. One interface (`IAIModelConfiguration`: `LLM` / `Realtime` / `Vision` / `Audio` sections) is shared by all three levels via MJ's JSONType mechanism, so CodeGen emits typed `ModelConfigurationObject` accessors on all three entities. This generalizes the scalar cascade those tables already carry (`SupportsPrefill` / `PrefillFallbackText`): new session/call-time capability knobs now land as typed properties in one bag instead of a column per knob. Existing capability columns are untouched. `AIEngine.GetEffectiveModelConfiguration(modelID, modelVendorID)` is the single canonical read path; the pure `ParseModelConfiguration` / `ResolveEffectiveModelConfiguration` live in `@memberjunction/ai`.

  First consumer: realtime turn detection. `Realtime.TurnDetection` (`Mode: 'default' | 'serverVad' | 'semanticVad' | 'native'`, plus eagerness / threshold / silence tuning) flows catalog → session config bag → provider wire block on both realtime topologies, with precedence `profile default < ModelConfiguration cascade < realtime.session.turnDetection < runtime configOverridesJson`. Profiles declare `supportedTurnModes` and translate through the shared `MapNormalizedTurnDetection`; an unsupported mode is diagnostic-logged and falls back to the profile default, so a shared model catalog never rejects a session on any provider. Non-protocol drivers scrub the key. Turn detection was previously hardcoded per provider profile, so smarter models had no way to opt into their smarter turn modes.

  Fixes a latent bug: a live `Reconfigure` (the meeting-mode auto-response flip) hardcoded `server_vad`, silently downgrading any session running a non-server-VAD turn mode. It now rebuilds the session's actual resolved mode, with meeting-mode floor control composed on top.

  GPT Realtime 2.1 and 2.1-mini are seeded to `semanticVad` (eagerness `auto`) at the model level — the one behavior-affecting change here. Everything else is behavior-neutral while `ModelConfiguration` is `NULL`.

### Patch Changes

- 97cbf5f: Fix realtime token usage being silently discarded for xAI Grok Voice sessions.

  The two OpenAI-compatible realtime providers put the `response.done` usage payload in **different places**, verified by live wire capture:
  - **OpenAI** (`gpt-realtime`) populates `response.usage` and sends no top-level `usage`.
  - **xAI** (Grok Voice) populates a **top-level** `usage` and sends `response.usage` as an **empty object**.

  Both readers in the codebase dereferenced `response.usage` only. For xAI that value is `{}` — which is truthy — so the `if (!usage) return` guard never fired. A usage event was emitted with `input_tokens`/`output_tokens` `undefined`, those clamped to `0` downstream, the host dropped the all-zero delta without arming its flush timer, and the session's tokens were never relayed. The result was `TokensPrompt`/`TokensCompletion`/`TokensUsed` sitting at NULL on `AIPromptRun` for every Grok Voice session — a silent accounting hole rather than a visible failure. The server-bridged path had the same read and would have recorded zeros.

  Adds `ResolveResponseDoneUsage` to `@memberjunction/ai`, shared by the client-direct reader (`OpenAIProtocolRealtimeClient`) and the server-bridged driver (`OpenAIRealtime`) so the two paths cannot drift apart on this again. It prefers the nested payload whenever that carries real token counts — leaving OpenAI's behavior unchanged — and falls back to the top-level one, so xAI is captured now and nothing breaks if xAI later populates the nested slot. Crucially it rejects a payload with no numeric token fields, which is what closes the empty-object trap.

  xAI's payload also carries per-modality detail (`text_tokens` / `audio_tokens` / `grok_tokens`), `output_audio_seconds` and `billable_audio_seconds`; these survive on the usage event's `Raw` field. Note `billable_audio_seconds` is **cumulative**, not a per-response delta, so it must not be summed if it is ever surfaced as one.

  The existing xAI usage test passed throughout, because it asserted against a hand-written OpenAI-shaped frame — encoding the very assumption that was wrong. Tests now use frames copied from real captures of both providers.

- Updated dependencies [080f4cd]
- Updated dependencies [48ff99f]
- Updated dependencies [de343b5]
  - @memberjunction/global@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/global@5.51.0

## 5.50.0

### Minor Changes

- c221553: Add Fireworks.ai inference routes for **Kimi K3** and **GLM 5.2**, and register the two fast-tier serving paths — **Kimi K3 Fast** and **Claude Opus 5 Fast** — as their own catalog entries.

  Fireworks stood up a hosted serverless endpoint for Kimi K3 on the day its open weights dropped, but that week's research pass classified the drop as a self-host event rather than a vendor event, so no route was added. GLM 5.2 had the same gap for a duller reason: `GLM 4.6` and `GLM 4.7` both carry Fireworks rows and 5.2 was skipped. Claude Opus 5's fast mode was described in prose on the Opus 5 entry but never modeled, so nothing in the catalog could route to it.
  - **Kimi K3 → Fireworks.ai** (`accounts/fireworks/models/kimi-k3`, `FireworksLLM`) — `$3.00`/`$15.00` per 1M with `$0.30` cached input, 1,048,576 input / 131,072 output. Vendor-parity with Moonshot direct: Moonshot's early-access license bars third-party hosts from undercutting its own API, so Fireworks competes on US-hosted infrastructure and zero data retention rather than price. Priority tier (`$3.75`/`$18.75`) is not modeled.
  - **GLM 5.2 → Fireworks.ai** (`accounts/fireworks/models/glm-5p2`, `FireworksLLM`) — `$1.40`/`$4.40` per 1M with `$0.14` cached input, 1M input / 131,072 output. Live day-zero on Fireworks, vendor-parity with Z.AI direct.
  - **Kimi K3 Fast** (`accounts/fireworks/routers/kimi-k3-fast`) — `$4.50`/`$22.50` per 1M with `$0.45` cached input. Identical weights to standard Kimi K3 at ~2× generated-token throughput; the premium buys latency, not capability. No Priority variant exists for the Fast tier.
  - **Claude Opus 5 Fast** (`claude-opus-5-fast` on Anthropic direct, `anthropic/claude-opus-5-fast` on OpenRouter) — `$10`/`$50` per 1M, exactly 2× standard Opus 5 for ~2.5× output throughput.

  Fast tiers are modeled as separate models rather than extra vendor rows on the base model because `MJ: AI Model Costs` rows key on `(ModelID, VendorID, ProcessingType)` — a second Fireworks realtime cost row on Kimi K3 would be ambiguous about which price applies to which route. This follows the existing `MiniMax-M2.5-highspeed` precedent, including its rank convention (same `PowerRank`, `SpeedRank` +2, `CostRank` +1). It also matches how the providers expose them: both are distinct endpoints selected by model ID, not a per-request flag. On Fireworks the fast path is a **router**, not a model — `accounts/fireworks/routers/…`, not `.../models/…`.

  Three notes carried in the entries themselves for whoever reads this later:
  - **`Claude Opus 5 Fast` is not available everywhere Opus 5 is.** Fast mode is a research preview on the Anthropic first-party API only — not on Amazon Bedrock, Google Vertex AI, or Microsoft Foundry, and not supported by the Batch API. There is deliberately no Bedrock vendor row and no batch cost row. Route batch and cloud-hosted workloads to standard `Claude Opus 5`.
  - **`Claude Opus 5 Fast` leaves `CacheReadPricePerUnit` null on purpose.** Anthropic publishes `$10`/`$50` but no separate fast-mode cache-read rate, and it is not safe to assume 2× the standard `$0.50`/1M. Verify before letting cache economics drive routing.
  - **Neither new model sets `PriorVersionID`.** That column means "previous version in a lineage chain"; a fast tier is the same weights on a different serving path, not a successor. Populating it would assert that Fast supersedes Standard, so anything walking the chain for the newest model in a family would recommend a 1.5–2× more expensive route as the upgrade.

  Prices were verified against Fireworks' own serverless pricing documentation and Anthropic's pricing page rather than aggregator sites, which disagreed on the fast-tier figures.

  Delivered as declarative metadata only (`.ai-models.json`: 2 models + 7 vendor rows + 5 cost rows, CLI-`uuidgen` primaryKeys, no sync blocks) — the consolidated metadata-sync migration is generated at release time by the build engineer's `mj sync push`, per the release workflow in `metadata/CLAUDE.md`.

### Patch Changes

- 0ba33b3: Client-issue batch fixes. Exports (Query viewer, Data Explorer, and User Views) now cover the FULL result set — capped at 100k with an over-cap warning — instead of just the on-screen page, and the Data Explorer toolbar Export button opens a unified Excel/CSV/JSON dialog for every view type (Grid/Cards/Map/Timeline). UI-role users can now create and manage Lists, with owner-scoped delete (or Developer/Integration) enforced server-side on BOTH Lists and List Details — a List Detail's authorization is scoped through its parent List's owner, so a user can't delete membership rows of lists they don't own. Also: grid quick-filter matches hidden columns, primary-key integer columns render without thousands separators, the Queries search-box icon/placeholder overlap is fixed, and the streaming thinking-tag stripper no longer leaks partial `<think>`/`</think>` tags split across chunks — and now flushes a genuine trailing tag-prefix (e.g. a response ending in `<`) at end of stream instead of dropping it.
  - @memberjunction/global@5.50.0

## 5.49.0

### Minor Changes

- a9ec419: Add the **Gemini 3.6 Flash** (`gemini-3.6-flash`) and **Gemini 3.5 Flash-Lite** (`gemini-3.5-flash-lite`) AI models to the model catalog metadata.

  Both shipped GA/Stable on July 21, 2026 and are driven by the existing `GeminiLLM` / `VertexLLM` / `OpenRouterLLM` drivers. Each is registered with Google and Vertex AI as Model Developer + Inference Provider plus an OpenRouter inference row, and chained via `PriorVersionID` to its predecessor.
  - **Gemini 3.6 Flash** (`PriorVersionID` → Gemini 3.5 Flash) — a token-efficiency refresh, not a new capability tier; the model card states it "is based on Gemini 3.5 Flash" and defers architecture, training data, and safety policy to the 3.5 Flash card. 1,048,576 input / 65,536 output tokens, thinking supported, knowledge cutoff March 2026. Output drops to `$7.50`/1M from 3.5 Flash's `$9.00` while emitting ~17% fewer output tokens; input is unchanged at `$1.50`/1M. Cache read `$0.15`/1M (0.1× input, Gemini Family A), no cache-write charge. Leads on computer use (OSWorld-Verified 83.0), chart reasoning, and long-context recall; trails frontier models on SWE-Bench Pro and Terminal-bench 2.1. Live API and image/audio generation are not supported.
  - **Gemini 3.5 Flash-Lite** (`PriorVersionID` → Gemini 3.1 Flash-Lite) — cost-optimized tier at `$0.30`/`$2.50` per 1M, cache read `$0.03`/1M (0.1× input). Same 1M/64K token envelope with configurable thinking levels; 74.0 on OSWorld-Verified. Prices text, image, video **and** audio input at one unified rate — a departure from Gemini 2.5 Flash and 3.1 Flash-Lite, which charged an audio premium. Google is the only real inference host: OpenRouter is a router whose upstreams resolve to Google AI Studio and Vertex only, so there is no third-party failover path.

  Neither model is context-length tiered — both are flat-rate across the full 1M window, unlike the Pro line.

  Two notes carried in the cost-row `Comments` for whoever reads this later:
  - **Do not route Gemini 3.6 Flash via the `gemini-flash-latest` alias.** The Gemini API changelog only ever repointed that alias to `gemini-3.5-flash` (May 19, 2026); the July 21 entry does not repoint it. Traffic assuming otherwise silently lands on 3.5 Flash at `$9.00`/1M output — a 20% overspend. Pin the explicit id.
  - **Same-day-launch recency.** Specs and pricing were verified against primary Google sources (per-model `ai.google.dev` pages, the pricing page, the launch blog, the API changelog, and the DeepMind model card PDFs) on the launch date itself, 2026-07-21. Same-day docs are the least stable kind — re-verify before these figures back a contractual cost model. LiteLLM's `model_prices_and_context_window.json` does not yet carry either model, so LiteLLM-based cost tracking will not price them correctly until that map updates.

  Delivered as declarative metadata only (`.ai-models.json`: 2 models + 10 vendor rows + 4 cost rows, CLI-`uuidgen` primaryKeys, no sync blocks) — the consolidated metadata-sync migration is generated at release time by the build engineer's `mj sync push` against a clean last-release DB, per the release workflow documented in `metadata/CLAUDE.md`.

- 42a680a: Add the **GPT Realtime 2.1** AI model (OpenAI, `gpt-realtime-2.1`) to the model catalog metadata.

  OpenAI's July 6, 2026 update to GPT Realtime 2 — a GPT-5-class speech-to-speech voice model served over the (now GA) Realtime API and driven by the existing `OpenAIRealtime` driver (`BaseRealtimeModel`). Registered as a `Realtime`-type model with OpenAI as both Model Developer and Inference Provider, chained via `PriorVersionID` to GPT Realtime 2.
  - **Capabilities**: 128K token context (32K max output), five reasoning effort levels (`minimal`/`low`/`medium`/`high`/`xhigh`, default `low`), parallel tool/function calls, streaming full-duplex. Improves on GPT Realtime 2 with better alphanumeric recognition, silence/noise handling, and interruption/barge-in behavior, plus ~25% lower p95 latency from improved caching.
  - **Pricing** (multi-channel; canonical row is the text channel): `$4`/1M text input (`$0.40` cached), `$24`/1M text output; audio `$32`/1M in (`$0.40` cached), `$64`/1M out; image input `$5`/1M (`$0.50` cached). Identical to GPT Realtime 2. `CacheReadPricePerUnit` set to the published text cached-input price ($0.40, OpenAI Family B); no cache-write charge.

  Also adds the **GPT Realtime 2.1-mini** variant (`gpt-realtime-2.1-mini`) — the same reasoning realtime stack at a cost-optimized tier: `$0.60`/1M text input (`$0.06` cached), `$2.40`/1M text output; audio `$10`/1M in (`$0.30` cached), `$20`/1M out; image `$0.80`/1M (`$0.08` cached).

  Delivered as declarative metadata only (`.ai-models.json`: 2 models + 4 vendor rows + 2 cost rows, CLI-`uuidgen` primaryKeys, no sync blocks) — the consolidated metadata-sync migration is generated at release time by the build engineer's `mj sync push` against a clean last-release DB, per the release workflow now documented in `metadata/CLAUDE.md`.

- bc388e3: Realtime QA hardening — every finding from the adversarial audit of the driver-family consolidation (PR #3177) plus the broader co-agent architecture, fixed with regression tests (plan: `plans/complete/realtime-qa-hardening.md`).

  **Regression fixes (A-items)** — bodyless provider `error` frames are recoverable again on raw-WS providers (adapter synthesizes the payload; transport failures stay fatal); `Capabilities.CanReconfigureTurnMode` is profile-gated (`supportsLiveReconfigure` — HuggingFace now truthfully reports false and `Reconfigure` no-ops); protected wire fields (`type`/`instructions`/`tools`) can no longer be overridden through the open Config bag (closing a strict-endpoint session.update kill vector) while the documented `audio` override remains; the client-direct minted `SessionConfig` now applies the residual bag with the same construction order as server-bridged (the two topologies are actually identical); deferred-config listener cleanup on early teardown; family-wide empty-transcript suppression; settle-handle + adapter buffer hygiene.

  **Robustness (B-items)** — connect/readiness deadlines everywhere (client WS `connectTimeoutMs` covering open + `session.created`, with socket-death/`Disconnect` releasing the awaited `Connect`; server `configReadinessTimeoutMs` rejecting `WaitForConfigApplied` on silent endpoints without cancelling the deferred apply); stale-`response.done` protection (a cancelled turn's trailing done can't release the busy lock under a locally-initiated replacement); TRUE-barge-in drops queued tool-result auto-triggers (the model never speaks over a user who took the floor; delivery via the user's next turn); WebRTC remote-stream handlers cleared on Disconnect; WS sends gated on socket-open.

  **Architecture (C-items)** — `realtime.session` tuning config (`effortLevel`/`parallelToolCalls`/`mcpTools`/`inputTranscriptionModel`) now flows config→bag→driver on BOTH topologies (`GetSessionTuningSettings`; the PR #3177 driver features are live end-to-end); per-modality usage detail (`RealtimeUsage.Input/OutputTokenDetails`) captured by the OpenAI driver, accumulated by the runner, and persisted on the realtime `AIPromptRun` for multi-channel cost attribution; HF proxy hardening (optional `MJ_REALTIME_PROXY_ALLOWED_ORIGINS` allowlist, upstream-open deadline, bounded pre-open buffer); the session runner observes the chained cancellation signal and performs bounded transport reconnects (default 1, `MaxTransportReconnects`); MCP approval requests are auto-DENIED so the turn continues instead of dead-air blocking; Gemini scrubs+warns on foreign OpenAI-protocol/transport keys (`REALTIME_SHARED_CONFIG_KEYS` exported from Core); `RealtimeTranscript.ReplacesPrevious` added for streamed-final providers.

  Suite totals after the wave: ai-openai 147, ai-realtime-client 391, ai-agents 1653, ai-gemini 87, ai-xai 50, ai-huggingface 34, MJServer proxy 8 — all passing.

  **Second-pass re-audit fixes**: a follow-up adversarial audit of the hardening itself found the C1 fix was inert (the new realtime.session field was never propagated through the effective-config resolver — now fixed with normalizeSession), plus untested edges introduced by the B2 counter (permanent wedge on a rejected response.create — now self-heals on the error frame), the C7 reconnect (abort/Stop race leaking a live session; stale call_id relayed to the fresh session; no re-entrancy/identity guard — all fixed), the client connect deadline (timer leak on synchronous socket-construction throw), reused-instance socket handling (old socket late close corrupting the new session), the C4 abort window (abort during StartSession lost), model not being a protected wire field, and ReplacesPrevious being ignored at the transcript-persist site. All fixed with regression + interaction-seam tests.

  **Fifth-pass re-audit fixes**: a five-reviewer verification pass found one reachable correctness bug and closed two latent transcript fragilities. (1) The pass-4 client `onErrorFrame` fix cleared the pending narration kind only when no confirmed response was active, so a narration create rejected while a cancelled response drained mistagged the next delegated-answer turn as ephemeral (dropping its transcript) — the kind is now cleared unconditionally on the rejecting error. (2) The transcript in-flight-row bookkeeping moved to an `{id, open}` model so a turn that emits both an interim delta and repeated streamed completeds still collapses to one row, and a short assistant final no longer suppresses the next turn's interim streaming row. Coverage added for the `confirmedResponseActive` busy-lock guard and the per-turn `ReplacesPrevious` reset (xAI + HuggingFace).

  **Fourth-pass re-audit fixes**: a four-reviewer pass found one regression from the third-pass work and several reachable pre-existing defects, all fixed with regression tests. (1) The third-pass usage un-gate let a trailing usage frame accumulate after `Stop()` and arm a post-finalize checkpoint timer — now gated on the runner lifecycle (`!stopped`) instead. (2) `RealtimeTranscript.ReplacesPrevious` is now wired END-TO-END: the shared server session flags the 2nd+ streamed user transcription completed (Grok streams repeated growing finals) and `persistRealtimeTranscript` uses status-disambiguated reuse, so server-bridged Grok/ElevenLabs no longer mint a duplicate `ConversationDetail` per caption (previously the flag was only ever set client-side). (3) The client `onErrorFrame` self-heal now clears the eager `responseActive`/narration phantom left by a rejected local `response.create` (a `confirmedResponseActive` flag distinguishes it from a live VAD turn) so `IsBusy` no longer wedges on compat endpoints. (4) The tool broker aborts EVERY concurrent delegation on barge-in (was: only the newest, orphaning the rest). (5) The HuggingFace server session declares its native 16 kHz sample rate (was: bridge fell back to 24 kHz into a 16 kHz pipeline). (6) A stuck delegate can no longer leak stale narration-burst timing across a reconnect (burst state reset decoupled from the delegation counter).

  **Third-pass re-audit fixes**: a third adversarial pass against the latest `next` found three residual seams: (1) the C8 transcript-persist fix only bound the in-flight key on the INTERIM branch, so a FINALS-ONLY streamed provider (e.g. Grok user captions, ElevenLabs corrections) that never emits an interim delta still minted a duplicate `ConversationDetail` row per correction — the create+finalize branch now binds the key too; (2) the C7 reconnect blanket-zeroed the runner's shared `activeDelegations` counter, which — combined with each aborted delegation's self-decrementing `finally` — could double-decrement and steal a CONCURRENT post-reconnect delegation's narration burst; the reset is gone (frames self-unwind); (3) `OnUsage` was identity-gated like every other handler, so a trailing usage frame flushed on the just-dropped socket was silently discarded — usage is runner-GLOBAL (cumulative) and is now un-gated. Plus a bounded-worst-case characterization test for the S1 self-heal. All fixed with regression + interaction-seam tests.

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

### Patch Changes

- b52ffa8: Fix four silent-failure bugs found while triaging the open issue backlog. Each one looked correct from the outside while doing nothing, or doing the wrong thing, at runtime. No schema changes.

  **`BaseLLM` silently truncated streamed responses (`@memberjunction/ai`).** The streaming chunk loop caught any mid-stream error, logged it, and then finalized the response as a **success**. A dropped connection, a provider fault, or an abort part-way through a stream produced truncated content that the caller was told was complete — under every provider, for every streaming consumer. Genuine failures now surface as failures; cancellation is still routed to the driver's `finalizeStreamingResponse`, since providers differ on whether an abort throws there or simply ends iteration.

  **No LLM driver honored `ChatParams.cancellationToken`** (13 provider packages). The field existed on `ChatParams` and zero drivers read it, so an aborted or timed-out request abandoned the promise while the socket kept streaming and pinning buffers. Now forwarded to the SDK across all 19 drivers — 13 fixed directly, the remaining 6 inheriting from `OpenAILLM` / `GeminiLLM` — on both the streaming and non-streaming paths. The mechanism differs per provider and was verified rather than assumed — Bedrock takes `abortSignal` (not `signal`); Ollama has no per-request hook at all, so the signal is threaded through a custom `fetch`; and `Inception` overrides both chat paths without calling `super`, so it does not inherit the fix from `OpenAILLM` despite appearing to. An abort is reported `Fatal` / `canFailover: false`, because `ErrorAnalyzer` otherwise classifies it as retriable — meaning a request the user just cancelled would have been retried.

  **Prompt execution could not be bounded (`@memberjunction/ai-prompts`, `@memberjunction/ai-core-plus`).** On the single-model path the model call was awaited with no bound unless the caller hand-supplied an `AbortSignal`, so a hung provider connection never resolved. Adds a per-request `AIPromptParams.timeoutMS` and a typed `AIPromptTimeoutError` that `ErrorAnalyzer` classifies as retriable, so a timeout now flows into the existing retry/failover machinery instead of hanging. The timeout and any caller-supplied token compose — neither is discarded. Enforcement lives in `executeModel`, the one method the parallel coordinator also inherits, so the single-model and parallel paths cannot diverge. (Issue #3064 was filed as "`AIPromptRunner` does not enforce `AIPrompt.TimeoutMS`", but that column does not exist — the bound could not be expressed at all. A prompt-level column is tracked separately in #3133.)

  **A malformed deny-list silently disarmed the Predictive Studio leakage guard** (`@memberjunction/predictive-studio*`, `@memberjunction/core-entities-server`, `@memberjunction/ng-dashboards`). Pasting a bracketed list into the pipeline editor produced `DenyFields: ["[CheckInTime", …, "Status]"]`; the deny-set then matched nothing, so the most dangerous leak columns trained completely unguarded and the save was accepted. The editor no longer manufactures the bad input, a new `MJMLTrainingPipelineEntityServer.ValidateAsync` rejects it at save, and the dominance threshold is clamped at enforcement time so rows written before this validation existed cannot disable the guard. Also unifies `DEFAULT_DOMINANCE_THRESHOLD`, which was defined twice with different values (`0.85` vs `0.6`) — agent-authored pipelines had been held to a materially laxer guard than hand-authored ones.

  **Dead CSS shipped to production (`@memberjunction/ng-dashboards`, `@memberjunction/ng-conversations`).** These packages build with bare `ngc` — no Sass step — so `styleUrls` content is embedded verbatim. Native CSS nesting makes `&:hover` accidentally work, but it cannot do string concatenation, so every `&__elem` / `&--modifier` rule was silently dropped. Three components were affected. **This resurrects styling that has never rendered**: the realtime media-surface tab bar had no active-tab indicator, and evidence playback had no active-turn highlight and no played-progress color on its waveform. A new `check:ui-ngc-scss` CI gate prevents the trap re-arming.

  Also fixes `@memberjunction/ai-azure`, whose unit tests had never actually run — the package had test files and a vitest config but no `test` script.

- 15e3017: Add optional embedding dimensions, per-record Pinecone namespace routing, and scope-level provider config support.

  **`@memberjunction/ai`** — Add optional `dimensions` field to `EmbedTextParams`, `EmbedTextsParams`, and `EmbedContentParams`. When provided, overrides the model's native output dimension (only effective on models that support it, e.g. OpenAI `text-embedding-3-*`).

  **`@memberjunction/ai-openai`** — `OpenAIEmbedding.EmbedText` and `embedBatch` now forward `params.dimensions` to the OpenAI embeddings API when set.

  **`@memberjunction/ai-vectordb`** — Three additive changes to the vector DB abstraction layer:
  - `VectorRecord` gains an optional `providerTemporaryDirectives` field — an MJ-internal routing map set by ingestion and stripped before any external upsert.
  - `QueryParamsBase` gains an optional `providerConfig` field — an opaque blob sourced from the scope's rendered `ExternalIndexConfig`, threaded through to the driver at query time.
  - `VectorDBBase` gains a `BuildProviderDirectives(sourceRecord, providerConfig)` hook (default: returns `{}`) that drivers override to extract per-record routing values (e.g. namespace) from the raw source row.
  - `CreateRecord` and `CreateRecords` signatures gain an optional `providerConfig` parameter.

  **`@memberjunction/ai-vectors-pinecone`** — Full namespace routing support:
  - `BuildProviderDirectives` reads `providerConfig.namespaceField`, looks up that field on each source record, and returns `{ namespace: '<value>' }` so records are routed to the correct Pinecone namespace during ingestion.
  - `CreateRecords` groups a mixed batch by namespace and issues one `upsert` per distinct namespace; falls back to a single-namespace path when no per-record directives are present.
  - `QueryIndex` extracts `providerConfig.namespace`, calls `index.namespace(ns)` when present, and strips the field before passing params to the Pinecone SDK.
  - `providerTemporaryDirectives` is stripped from each `VectorRecord` before any upsert call.

  **`@memberjunction/ai-vector-sync`** — Sync pipeline now reads `VectorIndex.Dimensions` and `VectorIndex.ProviderConfig` and threads them through:
  - `Dimensions` is forwarded to `EmbedTexts` so the embedding model produces vectors at the configured size.
  - `ProviderConfig` (parsed from JSON) is forwarded to `upsertBatchToVectorDB`, which passes it to `BuildProviderDirectives` per record and to `CreateRecords`.
  - Metadata value storage is now type-aware: SQL numeric types (`int`, `float`, `decimal`, etc.) are stored as JS numbers; a new `storeAs` field config supports `'epochSeconds'` and `'epochMilliseconds'` for datetime columns, `'number'`, and `'boolean'`.

  **`@memberjunction/search-engine`** — `ExternalIndexConfig` on scope external-index rows is now treated as a Nunjucks template: it is rendered against the caller's `SearchContext` before being JSON-parsed. The rendered object (e.g. `{ namespace: '<orgId>' }`) is forwarded as `providerConfig` through `VectorSearchProvider.queryOneIndex` to the vector DB driver. `VectorIndex.Dimensions` is also forwarded to the query-time embedding call.

- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [9c07270]
  - @memberjunction/global@5.49.0

## 5.48.0

### Minor Changes

- c20723a: Add a self-hosted **HuggingFace speech-to-speech** realtime (voice) provider, sitting side-by-side with the cloud realtime providers (OpenAI, Gemini, ElevenLabs, AssemblyAI) with no host changes. It treats HuggingFace's open-source VAD → STT → LLM → TTS stack (in its OpenAI-Realtime-compatible `/v1/realtime` mode) as a `Realtime` model — private-by-design (audio never leaves owned infrastructure), cost-free, and component-swappable.

  Because the endpoint is self-hosted, the shipped client-direct audio topology runs through a new provider-agnostic **MJAPI realtime proxy**: the driver mints a one-time ticket into a shared `RealtimeProxyRegistry` (`@memberjunction/ai`) and hands the browser a `wss://<mjapi-public>/realtime-proxy?ticket=…` URL, so the internal endpoint + auth never reach the browser and the box needs no browser-facing ingress. Adds the new `@memberjunction/ai-huggingface` driver package, the `HuggingFaceRealtimeClient` (`@memberjunction/ai-realtime-client`), the `RealtimeProxyServer` + single upgrade-router in `@memberjunction/server`, the class-registration manifest entry (`@memberjunction/server-bootstrap`), and the client-load wiring (`@memberjunction/ng-conversations`), plus the `Hugging Face` vendor + `HuggingFace Speech-to-Speech` model metadata (low PowerRank — opt-in). Additive only; endpoint/auth/sample-rate are deployment config.

### Patch Changes

- @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [c1f2d3d]
  - @memberjunction/global@5.45.0

## 5.44.0

### Patch Changes

- 89ea055: feat(ai): SupportsBatchEmbeddings + safe default EmbedTexts on BaseEmbeddings; rename GeminiEmbedding2 → GeminiEmbedding

  `BaseEmbeddings.EmbedTexts` is now a concrete dispatcher on a new `SupportsBatchEmbeddings` getter (default `false`): providers with a native batch endpoint return `true` and implement `embedBatch()`; everyone else inherits a safe per-text fallback (`embedPerText` — bounded concurrency, per-text retry-with-backoff, a hard 1:1 count guard, and a graceful empty-on-failure contract) that can never silently collapse a batch into fewer/blended vectors. A provider that claims batch support but doesn't implement `embedBatch()` throws, keeping the flag and the implementation honest.

  Per-text embedding on the fallback path (and in Gemini's own `EmbedTexts`) now retries transient failures with bounded exponential backoff before giving up, so one transient 429/500 among N texts no longer degrades the whole batch — addressing the failure-rate-scales-with-N concern from review.

  The OpenAI, Azure, Cohere, and Mistral embedding providers declare `SupportsBatchEmbeddings = true` and move their array call into `embedBatch()`. This generalizes the `GeminiEmbedding2` batch-collapse fix to the whole embedding layer and prevents the class of bug for any future provider that only implements single-text `EmbedText`.

  Also renames the `GeminiEmbedding2` class (and its `@RegisterClass` key / `DriverClass`) to `GeminiEmbedding` — the class outlives any single model version. The `DriverClass` change is carried by the AI-models metadata (`metadata/ai-models/.ai-models.json`) and the regenerated class-registration manifests in the bootstrap packages; no hand-written migration.

- Updated dependencies [5396d90]
  - @memberjunction/global@5.44.0

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

## 5.42.0

### Patch Changes

- Updated dependencies [0fa3cbc]
  - @memberjunction/global@5.42.0

## 5.41.0

### Minor Changes

- 84089ae: Add multimodal embeddings: new EmbedContent method + GetFileCapabilities on BaseEmbeddings, GeminiEmbedding2 and CohereEmbedding providers, AIEngine.EmbedContent, and the @google/genai 2.x bump (Gemini + Vertex).
- cd6c5f0: Realtime AI Agents wave 3: consolidated v5.41 migration (sessions, channels, co-agent schema) with the AIAgentCoAgent affinity registry replacing AIAgentPairedAgent — typed relationship vocabulary (CoAgent implemented; Peer/Delegate/Fallback/Reviewer/Observer reserved), type-level co-agent defaults as junction rows (removing the only FK cycle in core MJ), and the full code sweep (engine cache, resolver resolution chain, server-side invariants, client pairing reads, regenerated manifests). Realtime UX: progressive-disclosure voice console with persisted captions preference, user-owned composer and tabs toggles, audio-reactive visuals; whiteboard pages/multi-select and review-persistence fixes. Gemini Live triggering turns ride realtime text so widget clicks/typed input/narration speak immediately on native-audio models. CodeGen: single-winner IsNameField enforcement with eligibility guardrail fixes, SCC-based cycle diagnostics, and clean-database bootstrap robustness (conditional engine registry datasets).

### Patch Changes

- 15b743b: Real-Time AI Agents — Sessions, Channels & the Realtime Model (plans/ai-agent-sessions.md). Adds the AIAgentSession/AIAgentChannel/AIAgentSessionChannel schema (+ AgentSessionID on AIAgentRun/ConversationDetail, CloseReason on AIAgentSession); the BaseRealtimeModel server primitive with OpenAIRealtime + GeminiRealtime drivers (server-bridged StartSession and client-direct ephemeral-token CreateClientSession, optional SendContextNote/RequestSpokenUpdate interim updates); the new @memberjunction/ai-realtime-client package with the BaseRealtimeClient browser abstraction + OpenAI/Gemini client drivers resolved via ClassFactory by provider key; the Realtime agent type + Voice Co-Agent with RealtimeSessionRunner/RealtimeToolBroker, AgentMemoryContextBuilder extraction, server session lifecycle (SessionManager, SessionJanitor, start/close/heartbeat + client-direct resolvers with delegated-run progress streaming, AwaitingFeedback resume, co-agent observability runs, user-selectable realtime model); the full-panel realtime voice call UX in ng-conversations (phone trigger + agent/model picker, banner/thread/activity rail, delegation working/result cards with provenance, ephemeral paced first-person progress narration driven by DB prompt templates, in-call text composer); Realtime Voice admin (AI Analytics dashboard sections, session/channel custom forms, agent Runs|Sessions execution history); and Query Builder/Strategist reliability fixes (entity catalog in prompt, Get Entity Details sample caps + semantic fallback, plan formatting). Also: the standalone @memberjunction/ng-whiteboard package (collaborative board with agent tool API, sandboxed interactive widgets + input bridge, markdown panels, exports, cancelable before/after events); ElevenLabs Agents + AssemblyAI Voice Agent realtime provider pairs (4-provider matrix, zero contract changes); session review mode with multi-leg resume carryover (timeline dividers, artifact junction closure, prior-transcript model hydration); delegation cancel channel; usage telemetry relay; Realtime Co-Agent rename with run-step/prompt-run observability.
- 1568bae: Realtime ledger completion + two field bugs. SERVER CHANNEL PLUGIN HALF: `ServerPluginClass` is now consumed — `BaseRealtimeChannelServer` lifecycle contract in @memberjunction/ai, `RealtimeChannelServerHost` (ClassFactory resolution mirroring the client half, per-session instances, failure-isolated hooks, post-close dispose linger) in ai-agents with a `WhiteboardChannelServer` reference impl that validates/canonicalizes landed board saves, wired through SessionManager create/close and the channel-state save path. TRANSCRIPT CORRECTIONS END-TO-END: `RealtimeClientTranscript.ReplacesPrevious` (stamped by the ElevenLabs driver on `agent_response_correction`) replaces the caption in place and `RelayRealtimeTranscript(replacesPrevious)` updates the persisted turn instead of appending. ASSEMBLYAI RESUME WINDOW: one-shot `session.resume` reattach on unexpected socket drop (mic/playout survive; failed/second drop falls through to the old fatal path). WHITEBOARD: widget srcdoc rebuilt per mount via a view-scoped pure pipe — SVG charts survive page switches/lazy remounts, and mounted widgets no longer reload on unrelated journal ops (the old journal-invalidated identity cache was both stale on remount and over-eager on 'replace'). CONVERSATIONS: surface-panel (re)creation lands on the marquee channel tab (the whiteboard) instead of the Activity rail, the agent's first stroke reveals synchronously, and session review now merges channel states across ALL chain legs (newest leg with a saved board wins) so resumed sessions never hide an earlier leg's drawing. Plus Per-Minute/Per-Hour AI model price unit types seeded via metadata.
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- @memberjunction/global@5.40.0

## 5.39.0

### Minor Changes

- 1b0f355: Loop agent prompt improvements for cache optimization. Capture cache-read and cache-write token counts from every LLM provider that reports them (Anthropic, OpenAI, Gemini, Groq, Cerebras, Fireworks, Azure, Bedrock) and surface them on AI Prompt Runs and Agent Runs. Adds `CacheReadTokens`/`CacheWriteTokens` columns to `AIPromptRun` (migration included — run CodeGen after applying), normalizes cache-token accounting in `baseModel` so usage totals are consistent across providers, and enables Gemini implicit/explicit cache reporting. The Prompt Run form and Agent Run analytics now display cache hit/write token breakdown

### Patch Changes

- Updated dependencies [ae74fd5]
  - @memberjunction/global@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [30f598d]
- Updated dependencies [3d739a3]
  - @memberjunction/global@5.38.0

## 5.37.0

### Patch Changes

- @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [ac4b9a5]
  - @memberjunction/global@5.35.0

## 5.34.1

### Patch Changes

- @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- Updated dependencies [389d356]
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [5cc5326]
  - @memberjunction/global@5.33.0

## 5.32.0

### Patch Changes

- @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
  - @memberjunction/global@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [f2a6bec]
  - @memberjunction/global@5.22.0

## 5.21.0

### Patch Changes

- @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- @memberjunction/global@5.16.0

## 5.15.0

### Minor Changes

- c3e8b94: metadata updates and migration

### Patch Changes

- @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
  - @memberjunction/global@5.13.0

## 5.12.0

### Patch Changes

- @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [194ddf2]
  - @memberjunction/global@5.9.0

## 5.8.0

### Patch Changes

- @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- f52e156: Fix agent infinite retry loop and OOM crash when API credentials are missing by adding NoCredentials error classification, max consecutive failure safety net, and descriptive error propagation to the UI. Fix artifact collection removal UI update, artifact pane width reset on conversation switch, and component spec caching to survive render errors.
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/global@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [4aa1b54]
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/global@4.2.0

## 4.1.0

### Patch Changes

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
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/global@3.0.0

## 2.133.0

### Patch Changes

- @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/global@2.130.1

## 2.130.0

### Minor Changes

- 83ae347: migrations

### Patch Changes

- @memberjunction/global@2.130.0

## 2.129.0

### Patch Changes

- Updated dependencies [fbae243]
- Updated dependencies [c7e38aa]
  - @memberjunction/global@2.129.0

## 2.128.0

### Patch Changes

- @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [c7c3378]
  - @memberjunction/global@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/global@2.126.1

## 2.126.0

### Patch Changes

- @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/global@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/global@2.122.1

## 2.122.0

### Patch Changes

- @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- a2bef0a: Refactor component-linter with fixture-based testing infrastructure, fix agent execution error handling and payload propagation, add Gemini API parameter fixes, and improve vendor failover with VendorValidationError type
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- @memberjunction/global@2.119.0

## 2.118.0

### Patch Changes

- @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- @memberjunction/global@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [a8d5592]
  - @memberjunction/global@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/global@2.114.0

## 2.113.2

### Patch Changes

- @memberjunction/global@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [c126b59]
  - @memberjunction/global@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/global@2.110.1

## 2.110.0

### Patch Changes

- @memberjunction/global@2.110.0

## 2.109.0

### Patch Changes

- @memberjunction/global@2.109.0

## 2.108.0

### Minor Changes

- 656d86c: Migration

### Patch Changes

- @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/global@2.106.0

## 2.105.0

### Patch Changes

- 9b67e0c: This release addresses critical stability issues across build processes, runtime execution, and AI model management in the MemberJunction platform. The changes focus on three main areas: production build reliability, database migration consistency, and intelligent AI error handling.

  Resolved critical issues where Angular production builds with optimization enabled would remove essential classes through aggressive tree-shaking. Moved `TemplateEntityExtended` to `@memberjunction/core-entities` and created new `@memberjunction/ai-provider-bundle` package to centralize AI provider loading while maintaining clean separation between core infrastructure and provider implementations. Added `LoadEntityCommunicationsEngineClient()` calls to prevent removal of inherited singleton methods. These changes prevent runtime errors in production deployments where previously registered classes would become inaccessible, while improving architectural separation of concerns.

  Enhanced CodeGen SQL generation to use `IF OBJECT_ID()` patterns instead of `DROP ... IF EXISTS` syntax, fixing silent failures with Flyway placeholder substitution. Improved validator generation to properly handle nullable fields and correctly set `result.Success` status. Centralized GraphQL type name generation using schema-aware naming (`{schema}_{basetable}_`) to eliminate type collisions between entities with identical base table names across different schemas. These changes ensure reliable database migrations and prevent recurring cascade delete regressions.

  Implemented sophisticated error classification with new `NoCredit` error type for billing failures, message-first error detection, and permissive failover for 403 errors. Added hierarchical configuration-aware failover that respects configuration boundaries (Production vs Development models) while maintaining candidate list caching for performance. Enhanced error analysis to properly classify credit/quota issues and enable appropriate failover behavior.

  Improved model selection caching by checking all candidates for valid API keys instead of stopping at first match, ensuring retry logic has access to complete list of viable model/vendor combinations. Added `extractValidCandidates()` method to `AIModelSelectionInfo` class and `buildCandidatesFromSelectionInfo()` helper to properly reconstruct candidate lists from selection metadata during hierarchical template execution.

  Enhanced error-based retry and failover with intelligent handling for authentication and rate limit errors. Authentication errors now trigger vendor-level filtering (excluding all models from vendors with invalid API keys) and immediate failover to different vendors. Rate limit errors now retry the same model/vendor using configurable `MaxRetries` (default: 3) with backoff delay based on `RetryStrategy` (Fixed/Linear/Exponential) before failing over. Improved log messages with human-readable formatting showing model/vendor names, time in seconds, and clear status indicators. Fixed MJCLI sync commands to properly propagate exit codes for CI/CD integration.
  - @memberjunction/global@2.105.0

## 2.104.0

### Patch Changes

- Updated dependencies [2ff5428]
  - @memberjunction/global@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [addf572]
  - @memberjunction/global@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/global@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/global@2.100.1

## 2.100.0

### Patch Changes

- @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/global@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/global@2.97.0

## 2.96.0

### Patch Changes

- @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- @memberjunction/global@2.93.0

## 2.92.0

### Patch Changes

- @memberjunction/global@2.92.0

## 2.91.0

### Patch Changes

- @memberjunction/global@2.91.0

## 2.90.0

### Patch Changes

- @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- @memberjunction/global@2.86.0

## 2.85.0

### Minor Changes

- a96c1a7: migration

### Patch Changes

- @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- @memberjunction/global@2.83.0

## 2.82.0

### Patch Changes

- @memberjunction/global@2.82.0

## 2.81.0

### Patch Changes

- @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/global@2.80.1

## 2.80.0

### Patch Changes

- @memberjunction/global@2.80.0

## 2.79.0

### Minor Changes

- bad1a60: migration

### Patch Changes

- Updated dependencies [907e73f]
  - @memberjunction/global@2.79.0

## 2.78.0

### Minor Changes

- ef7c014: migration file

### Patch Changes

- @memberjunction/global@2.78.0

## 2.77.0

### Patch Changes

- @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- @memberjunction/global@2.75.0

## 2.74.0

### Patch Changes

- @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- eebfb9a: Add comprehensive context length handling with intelligent model
  selection

  This release adds sophisticated context length management to prevent
  infinite retry loops when AI models encounter context length exceeded
  errors.

  **New Features:**
  - **ContextLengthExceeded Error Type**: New error classification for
    context length exceeded errors
  - **Smart Failover Logic**: Automatically switches to models with larger
    context windows when context errors occur
  - **Proactive Model Selection**: Estimates token usage and selects
    appropriate models before execution
  - **Context-Aware Sorting**: Prioritizes models by context window size
    during failover

  **Enhanced Components:**
  - **ErrorAnalyzer**: Detects context_length_exceeded errors from
    provider codes, error messages, and JSON objects
  - **AIPromptRunner**: Adds token estimation, context validation, and
    intelligent model reselection
  - **Failover System**: Context-aware candidate selection with detailed
    logging

  **Key Improvements:**
  - Prevents infinite agent stalling on context length exceeded errors
  - Reduces API costs by avoiding repeated failed attempts with
    insufficient context models
  - Improves reliability through proactive context length validation
  - Provides detailed logging for monitoring and debugging

  **Breaking Changes:**
  - None - all changes are backward compatible

  **Migration Notes:**
  - No migration required - existing code will automatically benefit from
    enhanced context handling
  - Models with MaxInputTokens/MaxOutputTokens configured will be
    prioritized appropriately
  - Context length validation occurs transparently during prompt execution

  This resolves the critical issue where agents would infinitely retry
  prompts that exceed model context limits, improving system reliability
  and reducing unnecessary API calls.
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0

## 2.69.1

### Patch Changes

- @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/global@2.69.0

## 2.68.0

### Patch Changes

- @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/global@2.67.0

## 2.66.0

### Patch Changes

- @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- 1d034b7: Added features for agent payload manager + api keys for models
- Updated dependencies [619488f]
  - @memberjunction/global@2.65.0

## 2.64.0

### Patch Changes

- @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1

## 2.63.0

### Patch Changes

- @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- c995603: Better Error Handling and Failover in AI core and Promts
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/global@2.61.0

## 2.60.0

### Patch Changes

- @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/global@2.59.0

## 2.58.0

### Minor Changes

- db88416: migrations

### Patch Changes

- @memberjunction/global@2.58.0

## 2.57.0

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/global@2.57.0

## 2.56.0

### Patch Changes

- @memberjunction/global@2.56.0

## 2.55.0

### Minor Changes

- c3a49ff: Agent Manager + SQL Server fix + fix deps in core-entity-forms
- 659f892: Various

### Patch Changes

- @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- @memberjunction/global@2.53.0

## 2.52.0

### Minor Changes

- e926106: Significant improvements to AI functionality

### Patch Changes

- @memberjunction/global@2.52.0

## 2.51.0

### Minor Changes

- faf513c: circ deps + migration

### Patch Changes

- 4a79606: **Breaking circular dependency between AI packages**

  Resolves a circular dependency that was preventing `@memberjunction/core-entities-server` and other packages from
  building during `npm install`.

  **Root Cause:**
  - `@memberjunction/aiengine` imported `AIPromptRunResult` from `@memberjunction/ai-prompts`
  - `@memberjunction/ai-prompts` depended on `@memberjunction/aiengine` in package.json
  - This circular dependency blocked the build chain

  **Solution:**
  - Moved `AIPromptRunResult` and related types to `@memberjunction/ai` as shared types
  - Updated all packages to import from the shared location instead of creating circular references
  - Added comprehensive build failure debugging guide to development documentation

  **Packages Fixed:**
  - `@memberjunction/core-entities-server` now builds successfully
  - All AI packages (`aiengine`, `ai-prompts`, `ai-agents`) build without circular dependency issues
  - Build order now resolves properly in the monorepo
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/global@2.50.0

## 2.49.0

### Minor Changes

- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [cc52ced]
- Updated dependencies [62cf1b6]
  - @memberjunction/global@2.49.0

## 2.48.0

### Patch Changes

- @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/global@2.46.0

## 2.45.0

### Minor Changes

- 21d456d: Metadata and functional improvements for AI system (mainly parallelization and logging)

### Patch Changes

- @memberjunction/global@2.45.0

## 2.44.0

### Patch Changes

- fbc30dc: Documentation
  - @memberjunction/global@2.44.0

## 2.43.0

### Patch Changes

- @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/global@2.42.1

## 2.42.0

### Minor Changes

- d49f25c: Key Areas Addressed:

### Patch Changes

- @memberjunction/global@2.42.0

## 2.41.0

### Patch Changes

- 9d3b577: - Clarify that @memberjunction/ai can be used completely independently without database or environment setup
- 276371d: Added Google Vertex and Amazon Bedrock AI providers!
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- b6ce661: Proposed implementation for handling more complex `content` types in BaseLLM
  - @memberjunction/global@2.40.0

## 2.39.0

### Minor Changes

- f73ea0e: New Claude Models - bumping to 2.39.0

### Patch Changes

- @memberjunction/global@2.39.0

## 2.38.0

### Patch Changes

- @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/global@2.37.1

## 2.37.0

### Patch Changes

- @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- d9defc9: Azure AI Inference - Implementation
- 577cc6a: Support for parallel LLM completions in BaseLLM and AIEngine
  - @memberjunction/global@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
  - @memberjunction/global@2.36.0

## 2.35.1

### Patch Changes

- @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/global@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/global@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/global@2.34.1

## 2.34.0

### Patch Changes

- b48d6b4: LLM Streaming Support + HTML Report Fixes
- 4c7f532: Documentation for new core AI package
- 54ac86c: Optimize streaming implementation + bug fixes
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- efafd0e: Readme documentation, courtesy of Claude
  - @memberjunction/global@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/global@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/global@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/global@2.32.0

## 2.31.0

### Patch Changes

- @memberjunction/global@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [a3ab749]
  - @memberjunction/global@2.30.0

## 2.29.2

### Patch Changes

- @memberjunction/global@2.29.2

## 2.28.0

### Patch Changes

- @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/global@2.27.1

## 2.27.0

### Patch Changes

- b4d3cbc: Proposed base classes for audio and video generation
  - @memberjunction/global@2.27.0

## 2.26.1

### Patch Changes

- @memberjunction/global@2.26.1

## 2.26.0

### Patch Changes

- @memberjunction/global@2.26.0

## 2.25.0

### Patch Changes

- @memberjunction/global@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/global@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [9cb85cc]
  - @memberjunction/global@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/global@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/global@2.23.1

## 2.23.0

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/global@2.23.0

## 2.22.2

### Patch Changes

- @memberjunction/global@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/global@2.22.1

## 2.22.0

### Patch Changes

- Updated dependencies [9660275]
  - @memberjunction/global@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:45 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:45 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Bump @memberjunction/global to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/global to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:04 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/global to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/global to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/global to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/global to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/global to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:48 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Bump @memberjunction/global to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/global to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/global to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.18.0

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Bump @memberjunction/global to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:28 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/global to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Bump @memberjunction/global to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:29 GMT

### Patches

- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Bump @memberjunction/global to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/global to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:45 GMT

### Patches

- Bump @memberjunction/global to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/global to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Bump @memberjunction/global to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/global to v2.13.0

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Bump @memberjunction/global to v2.12.0

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Bump @memberjunction/global to v2.11.0

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Bump @memberjunction/global to v2.10.0

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Bump @memberjunction/global to v2.9.0

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Bump @memberjunction/global to v2.8.0

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Bump @memberjunction/global to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.7.0

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Bump @memberjunction/global to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:03 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Bump @memberjunction/global to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/global to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:07 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.5.0

### Patches

- Applying package updates [skip ci] (nico.ortiz@bluecypress.io)

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Bump @memberjunction/global to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Bump @memberjunction/global to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Bump @memberjunction/global to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Bump @memberjunction/global to v2.3.1

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Bump @memberjunction/global to v2.3.0

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Bump @memberjunction/global to v2.2.1

## 2.2.0

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Bump @memberjunction/global to v2.2.0

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/global to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/global to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Bump @memberjunction/global to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Bump @memberjunction/global to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/global to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:28 GMT

### Patches

- Bump @memberjunction/global to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Minor changes

- Bump @memberjunction/global to v1.8.0

## 1.7.1

Wed, 12 Jun 2024 20:13:29 GMT

### Patches

- Bump @memberjunction/global to v1.7.1

## 1.7.0

Wed, 12 Jun 2024 18:53:39 GMT

### Minor changes

- Bump @memberjunction/global to v1.7.0

## 1.6.1

Tue, 11 Jun 2024 06:50:06 GMT

### Patches

- Bump @memberjunction/global to v1.6.1

## 1.6.0

Tue, 11 Jun 2024 04:59:29 GMT

### Minor changes

- Bump @memberjunction/global to v1.6.0

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.5.3

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Bump @memberjunction/global to v1.5.2

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Bump @memberjunction/global to v1.5.1

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.5.0

## 1.4.1

Fri, 07 Jun 2024 04:36:54 GMT

### Patches

- Bump @memberjunction/global to v1.4.1

## 1.4.0

Sat, 25 May 2024 15:30:16 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.4.0

## 1.3.3

Thu, 23 May 2024 18:35:52 GMT

### Patches

- Bump @memberjunction/global to v1.3.3

## 1.3.2

Thu, 23 May 2024 14:19:50 GMT

### Patches

- Bump @memberjunction/global to v1.3.2

## 1.3.1

Thu, 23 May 2024 02:29:25 GMT

### Patches

- Bump @memberjunction/global to v1.3.1

## 1.3.0

Wed, 22 May 2024 02:26:03 GMT

### Minor changes

- Overhaul the way we vectorize records (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.3.0

## 1.2.2

Thu, 02 May 2024 19:46:38 GMT

### Patches

- Bump @memberjunction/global to v1.2.2

## 1.2.1

Thu, 02 May 2024 16:46:11 GMT

### Patches

- Bump @memberjunction/global to v1.2.1

## 1.2.0

Mon, 29 Apr 2024 18:51:58 GMT

### Minor changes

- Bump @memberjunction/global to v1.2.0

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Bump @memberjunction/global to v1.1.3

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Bump @memberjunction/global to v1.1.2

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Bump @memberjunction/global to v1.1.1

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Bump @memberjunction/global to v1.1.0

## 1.0.11

Wed, 24 Apr 2024 20:57:42 GMT

### Patches

- - bug fixes in Skip UI \* added exception handling to ReportResolver (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.0.11

## 1.0.9

Sun, 14 Apr 2024 15:50:05 GMT

### Patches

- Bump @memberjunction/global to v1.0.9

## 1.0.8

Sat, 13 Apr 2024 02:32:44 GMT

### Patches

- Update build and publish automation (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.0.8

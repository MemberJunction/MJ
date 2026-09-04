# Change Log - @memberjunction/core-entities

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

- 5fc861f: CodeGen treats schema as the incremental unit at 2,000+ entities: per-schema emit with write-if-changed and dirty-schema regen, `'schema.table'` exclude strings, schema-parallel file generation, incremental `tsc` on core-entities and server, hydrate-by-schema catalog projections, and `schemaOutput` routing so brownfield/demo schemas do not land in published packages. BigSchemaDemo is the droppable test bed.
- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/interactive-component-types@6.1.0-edge.5

## 6.1.0-edge.4

### Minor Changes

- e533ce5: Weekly AI model & vendor intelligence report (2026-08-24) + two metadata edits.
  - **New model** `GLM 5.3` (Zhipu, released 2026-08-14). Placeholder record with Z.AI as Model Developer and OpenRouter as Inference Provider; no `MJ: AI Model Costs` rows populated because Zhipu has not posted a per-token API rate.
  - **Deprecation** `GLM 4.7` on Cerebras — the Cerebras vendor row and matching cost record are now `Status: "Inactive"` per Cerebras' 2026-08-17 retirement of GLM-4.7 from its inference cloud. OpenRouter and Fireworks.ai vendor rows for GLM 4.7 remain Active.
  - Full report at `reports/ai-model-research/2026-08-24-weekly-report.md`, including 4 items flagged for human review (DeepSeek V4 Pro Aug-16 cost record, GPT-5.6 Sol pricing conflict, FLUX.2 family refresh, redundant Sonnet 5 Sep-1 cost row).

- de6eb14: Fix `__mj.FileEntityRecordLink`'s unique key, which omitted `RecordID` and therefore allowed a
  given file to be linked to at most ONE record per entity — attaching the same document to two
  Contracts, two Accounts, or two of anything else failed on a unique-key violation, contradicting
  the table's purpose. `UQ_FileEntityRecordLink_EntityID_FileID` is replaced by
  `UQ_FileEntityRecordLink_EntityID_RecordID_FileID`.

  The constraint came from the v5.37 junction-table batch, whose stated scope was pure two-FK-column
  link tables; `RecordID` is an `nvarchar(750)` soft key, so that heuristic mechanically selected
  `(EntityID, FileID)` and dropped the column that makes a row unique. This is the second constraint
  from that batch corrected on the same grounds, after `Drop_EntityAction_Uniqueness`.

  Operators upgrading from a deployment that predates v5.37 should know that the migration which
  introduced the bad constraint (`V202605221002__v5.37.x__Add_Unique_Constraints_To_MJ_Junction_Tables`)
  DELETED pre-existing duplicates before adding each constraint, keeping only the earliest
  `__mj_CreatedAt` row per `(EntityID, FileID)` group. Any deployment that legitimately had one file
  linked to several records of the same entity lost those link rows at that upgrade, and they are not
  recoverable from the migration. It logged per-table duplicate and deletion counts, so affected
  deployments can check their v5.37 upgrade logs. This change stops the loss recurring; it cannot undo it.

  The change is a widening — every row satisfying the old key satisfies the new one — so it needs no
  de-duplication pass and cannot fail on existing data. The genuine duplicate (same file linked twice
  to the same record) is still rejected. No CodeGen or generated-ORM change is involved.

- 1fa6f6b: fix(metadata): the retired GLM-4.7 Cerebras cost record uses a Status its entity actually allows

  `MJ: AI Model Costs.Status` is a value list of `Active | Expired | Invalid | Pending`. The GLM-4.7 Cerebras cost record was set to `Inactive` — which is valid on `MJ: AI Model Vendors` (33 rows legitimately use it) but not on `MJ: AI Model Costs` — so `mj sync push --ci` failed validation and took the deterministic integration tier red on `next`.

  The record now reads `Status: "Expired"` (the ORM defines it as "no longer valid", which is what the 2026-08-17 Cerebras retirement means) and carries `EndedAt: "2026-08-17"`. `EndedAt` is documented as "when this pricing expired… NULL indicates currently active pricing", so an expired row without it would contradict itself. The sibling `MJ: AI Model Vendors` row keeps `Inactive`, which is correct there.

- 00a2483: Introduces Identity Claims infrastructure in MemberJunction core for guest record claiming, account linking, and invite verification workflows (#4012).
  - Schema & Entities: Adds `IdentityClaimType` and `IdentityClaim` entities with lifecycle state transitions (`Pending`, `Claimed`, `Expired`, `Revoked`).
  - Pluggable Driver Substrate: Supports custom claim handler implementations via `BaseIdentityClaimDriver` and `@RegisterClass`.
  - Server Engine: `IdentityClaimEngineServer` handles cryptographic claim creation, SHA-256 token hashing at rest, timing-safe token verification, email notifications via MJ Communications framework with HTML escaping, configurable email providers, polymorphic entity resolution, and atomic claim redemption.

- 0db4f4f: Remove domain-specific `GuestOrder` and `PersonAccountLink` identity claim types from core MemberJunction metadata. These claim types are specific to BizApps applications (Orders/Common) and are managed in their respective app metadata seed files.

### Patch Changes

- 8f199e2: Identity Claims: ship the redemption surface and close the trust gaps.
  - New `IdentityClaimRedemptionResolver` (MJServer): `RedeemIdentityClaim` /
    `AutoClaimPendingIdentityClaims` mutations and `GetMyPendingIdentityClaims` query, with an
    in-memory per-user rate limit on redemption attempts.
  - New Explorer `/claims/redeem` page (explorer-core) — the landing target of claim emails'
    `?id=..&token=..` links, previously a dead URL.
  - Automatic claim-on-login: `getUserPayload` now fires `AutoClaimForUser` once per issued
    token (deduped alongside the session audit), so pending claims addressed to a user's email
    attach at sign-in.
  - Email-verification gate: the OIDC `email_verified` claim is read off the verified JWT onto
    `UserPayload.emailVerified` and threaded into redemption — an IdP that explicitly asserts
    an unverified email can no longer redeem by email match (the token path still works).
  - `IdentityClaimType.Configuration` is now read: `RequireVerifiedEmail`, `RequireToken`, and
    `AutoClaim` gates (typed as `IdentityClaimTypeConfiguration` on the client engine).
  - `IdentityClaimType.IsActive` is now enforced on both create and redeem.
  - `GetPendingClaimsForEmail` uses `EscapeSQLString` and a platform-neutral expiry literal
    (was `GETUTCDATE()`, SQL Server-only); `RevokeClaim` checks its save result and skips the
    driver's `OnRevoke` when the revocation did not persist.

- d078c54: Stop `UserInfoEngine`'s debounced settings flush from raising a process-level unhandled rejection.

  `SetSettingDebounced` arms a 500ms timer whose callback called `FlushPendingSettings()` fire-and-forget — unawaited, with no `.catch()` — so any rejection from that flush escaped as an `unhandledRejection` rather than something a caller could handle. The rejection itself came from `SetSetting`, which read `md.CurrentUser?.ID` off `this.ProviderToUse`: the optional chain guarded `CurrentUser` but not the provider, and `ProviderToUse` resolves to `this._provider || Metadata.Provider`, which is `undefined` when no provider is configured or when one has been torn down while the timer was still armed.

  Two changes: `SetSetting` now guards the provider itself (`md?.CurrentUser?.ID`), degrading to its existing "No user context available" path instead of throwing; and the debounce timer attaches a `.catch()` so no failure on that path — from this cause or any future one — can reach the process as an unhandled rejection.

  Impact was mostly felt in CI, where a timer firing after a test environment was torn down failed the whole run with every assertion green: `Test Files 8 passed (8) / Tests 57 passed (57) / Errors 1 error`. Because it depends on where the 500ms timer lands relative to teardown, it was intermittent and reproduced on `next` itself — the same commit failed one scheduled run and passed the next.

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [a1a8989]
  - @memberjunction/ai@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/interactive-component-types@6.1.0-edge.4

## 6.1.0-edge.3

### Minor Changes

- 711c208: Durable sync runs: lease/fence run ownership, DB-backed cancellation and progress, and an opt-in worker mode.

  A sync run is now owned by exactly one process for the life of its lease. `MJ: RSU Pending Work` records the queue, and each run carries an owner token, lease expiry, heartbeat, and fence token, so a stalled or killed process releases its work instead of stranding it, and a resumed process cannot write through a newer owner's fence. Cancellation and progress move through the database rather than in-process state, so either is observable and actionable from any process. The engine no longer shares a single provider across concurrent runs — each run carries its own through an `AsyncLocalStorage` context — and run history is pruned to `MJ_INTEGRATION_MAX_RUNS_PER_CI`.

  RSU post-restart work moves the same way: `RuntimeSchemaManager` now registers it as `MJ: RSU Pending Work` rows instead of `.rsu_pending` files that were deleted as they were read, so a crash mid-consumption leaves visible, resumable work rather than losing it silently. Registration failures are reported on the pipeline result — a migration whose post-restart work never persisted no longer reports success, since the restart discards that work.

  **Additive on the public API.** Reading progress and requesting cancellation now hit the database, which cannot be done from a synchronous method, so they ship under new names: `IntegrationEngine.GetSyncProgressAsync()` and `IntegrationEngine.CancelSyncAsync()`. The three published statics they supersede — `GetSyncProgress`, `CancelSync`, `GetAllSyncProgress` — keep their exact original signatures so a consumer taking this minor upgrade still compiles. They are marked `@deprecated` and are no longer functional, because the in-process map they read no longer exists; each logs once naming its replacement, and each returns the value that previously meant "nothing to report" (`undefined`, `false`, empty map) rather than pretending to have succeeded.

  `RuntimeSchemaManager`'s pending-work entry points follow the same rule, since it too is exported from a published package. `ReadAndClearPendingWork()` keeps its zero-argument signature, warns once, and returns an empty array. `WritePendingWork(data)` keeps compiling — its new `contextUser` parameter is optional — but the one-argument form throws rather than returning a fabricated ID, because a durability queue that silently discards work is worse than one that fails loudly. Both replacements, `ReadPendingWork()` and `WritePendingWork(data, contextUser)`, are named in the messages.

  **One caveat on "additive", for TypeScript consumers.** The paragraph above concerns the deprecated statics. The `Status` value list itself is a different matter: it widens from five values to seven (`Queued`, `Cancelled`), and CodeGen turns a CHECK constraint into a literal union. Widening a union a consumer _reads_ is source-breaking in two patterns — assigning `run.Status` into a narrower hand-written type, and an exhaustive `switch` with no `default` and a declared return type. That is not hypothetical: the Integration dashboard in this repo carried two hand-copied `Status` unions and both had already fallen behind `Queued`. Consumers on those patterns will need one edit; the fix in both cases is to derive the type from the entity (`MJCompanyIntegrationRunEntity['Status']`) rather than restate it, which is what this PR does to the dashboard.

  **Two behaviour changes that are not compile breaks but are observable.** A cancelled run now reports `Cancelled` rather than `Failed`, so anything keyed on `Status='Failed'` — external dashboards, alerts, error-rate SLOs — will report fewer errors than before. And cancellation is now resumable, so "cancel, then re-run to re-pull" no longer re-fetches the window before the cancel point; that needs an explicit full sync.

  **`Cancelled` is now a run status.** `CK_CompanyIntegrationRun_Status` gains it alongside `Queued`, so a deliberately-stopped run records itself instead of being finalized as `Failed` with an explanatory `ErrorLog` — which meant every health, cadence, and error-rate consumer booked operator cancellations as errors unless it string-matched that text. `RunOwnershipService.Release` now takes a `TerminalRunStatus` (`Extract`-ed from the entity's own union, so the terminal subset can never drift from the CHECK constraint), and the Integration dashboard's status colours, icons, activity filter and KPIs handle both new values — its two hand-copied status unions are replaced with indexed access to the entity, which is also how they had already fallen behind `Queued`.

  **A cancelled sync no longer repeats its work on resume.** Stopping mid-fetch logged `— saving watermark`, but only keyset connectors actually persisted a position; a watermark-based connector saved nothing, so the next incremental re-fetched everything back to the last clean run. Measured on a 2,000-record source cancelled at 1,400: the following incremental processed 1,750 records (resuming from 250) where it now processes 600. The max watermark seen is persisted whenever whole batches completed and no page was skipped — never wall-clock `now`, since partial coverage must not advance past the point actually reached, and never when a page was skipped, because that leaves a hole behind the watermark.

  **Sync options survive a process death.** The run row now records its options (the shape `EnqueueSync` already wrote), and `ResumeOrphanedSyncs` reads them back, so an adopted run finishes what was asked for. Previously the resume rebuilt config from the `CompanyIntegration` alone: a `FullSync` that lost its owner resumed as an _incremental_, re-fetched nothing, and reported `Success` — the opposite of why a full sync is requested. The resumed run also reports its real trigger type rather than a hardcoded `Scheduled`.

  The worker's startup line moves from verbose-only to standard log level. `Stop()` already logged at standard level, so logs showed a worker stopping that never started, and there was no way to confirm from logs that a process was in worker mode.

- d79fe39: Add Embedded Records: an opt-in 1:1 owner-held companion on BaseEntity so a record and the peer its FK points at (Deal.OrderID → Order) load, validate and persist as one unit — inverted save order, recursive companion serialization, CodeGen emission from EntityField.EmbeddedRecord.
- 06ccfb2: Add Entity.Configuration and EntityRelationship.Configuration JSONType bags (IEntityConfiguration / IEntityRelationshipConfiguration) as the tenant-editable default for generated-form chrome. NULL keeps today's accordion. CodeGen emits typed ConfigurationObject accessors.
- 8ec1515: fix(metadata): remove invalid entries from the hierarchy configuration seed

  `metadata/entities/.entity-field-hierarchy-configurations.json` (added in #3939) declared
  `Hierarchy.IsHierarchy` for four entities that cannot resolve. `mj sync push` runs in a single
  transaction, so any one bad `@lookup` rolls the whole push back — meaning **no** `Configuration`
  value was seeded for **any** entity, not just the four. With `IsHierarchy` then false everywhere,
  the next `mj codegen` regenerated every base view without its hierarchy projections and dropped
  the `Root*ID` columns the migrations had correctly created, leaving `EntityField` rows demanding
  columns that no longer existed (`Invalid column name 'RootParentID'`). On a from-scratch database
  this made `mj sync push` and `mj codegen` both unrunnable.
  - `MJ: Prompt Categories` → `MJ: AI Prompt Categories`. No entity by the former name exists; the
    latter has the `ParentID` self-referencing FK the entry intends, and `vwAIPromptCategories`
    already carries `RootParentID`.
  - Removed `MJ: Resource Types`, `MJ: Roles` and `MJ: Tests`. Each declared a `ParentID` hierarchy,
    but none has a `ParentID` field, a self-referencing FK, or any parent column on its underlying
    table (`ResourceType`, `Role`, `Test`) — so the lookups could never resolve.

  Verified on a database built from migrations alone: `mj sync push` now completes (13,777 records,
  0 errors) and seeds all 14 remaining declarations.

  Not addressed here — 18 `RootParentID` fields on genuine tree entities remain undeclared, and the
  seed file's `Name=ParentID` shape cannot express non-`ParentID` hierarchy fields such as
  `ParentArchitectureID` or `ParentChunkID`. Both need a decision on the opt-in surface rather than
  another entry.

- 95fc3e6: Ship generated-form chrome: a budgeted related-role ranker (not all-in-More), accordion More as a quiet overflow footer (not a fake panel), left-nav More folder, user move in/out of More via Manage Sections, Layout auto / left-nav, optional BaseFormPolicy, and Entity / Entity Relationship visualization. Metadata JSONType bags on Entity / EntityRelationship.Configuration back the ranker.
- c643ba3: Ship the CodeGen output IT50 checks for: hierarchy TVFs and base-view lateral joins
  for the 34 seeded hierarchy fields, the 136 EntityField rows describing those virtual
  columns, and the MJ: Form Chrome Rules Entity metadata that V202608151200 assumed a
  later CodeGen run would create. Removes the two hierarchy seed entries
  (MJ: Employees.SupervisorID, MJ: Entities.ParentID) whose entities have
  BaseViewGenerated = 0 and therefore cannot receive hierarchy columns.
- 048c5ce: feat(auth): metadata-driven pluggable authentication providers

  Authentication providers are now discovered the MJ way — a `@RegisterClass(BaseAuthProvider, 'x')`
  subclass plus a row in the new `MJ: Authentication Providers` entity, resolved at runtime through
  `ClassFactory` by `DriverClass`. Adding a provider requires no core edits.
  - **New entity** `__mj.AuthenticationProvider`, with the OIDC connection fields as columns, an
    optional `CredentialID` for the rare provider needing server-side secrets, and login-picker
    presentation fields. Driver configuration is split by trust boundary: `AdditionalConfiguration`
    is server-only, `ClientConfiguration` is published to the browser.
  - **`AuthProviderEngine`** loads the catalog at startup and registers it with `AuthProviderFactory`.
  - **Layered resolution** — `mj.config.cjs` `authProviders[]` remains fully supported as the baseline
    and fallback, so existing deployments are unaffected and need no changes.
  - **`GET /auth/providers`** publishes the non-secret catalog to the pre-auth browser (rate-limited,
    mounted ahead of the auth middleware, allow-list projection).
  - **`<mj-login-picker>`** — a reusable, app-agnostic multi-IdP picker built on `mjButton`, rendered
    only when 2+ client-visible providers exist. Single-provider deployments look exactly as before.
  - `AuthProviderFactory` no longer carries a hard-wired list of built-in provider imports; the
    package entry point and the class-registration manifests already covered registration.
  - **Environment-variable configuration is now pluggable too.** The hard-coded block in MJServer's
    config that enumerated Entra / Auth0 / Cognito inline is replaced by an optional
    `configFromEnvironment` static on each provider class (`IEnvironmentConfigurableProvider`),
    collected through the ClassFactory registry by `AuthProviderFactory.discoverFromEnvironment()`.
    A third-party provider can now offer the same "set two variables and you're done" experience
    with no change to MJ core. The three existing mappings are preserved byte-for-byte; **Okta**
    (`OKTA_DOMAIN` + `OKTA_CLIENT_ID`) and **WorkOS** (`WORKOS_CLIENT_ID`) gain env-var support they
    did not previously have.

- 7300953: Query & Entity Materialization — snapshot a stored Query's result (or an entity's base view) into a physical table that IS its own read-only entity, refreshed on a schedule with an atomic wrapper-view swap. Base-view (entity) materialization is cross-engine (SQL Server + PostgreSQL); query materialization runs on SQL Server today and becomes cross-engine once the pre-existing `spCreateVirtualEntity` support proc is ported to PostgreSQL (tracked with the broader PG parity effort). The refresh SQL and read path are cross-engine on both.
  - **New `@memberjunction/materialization`** package: the refresh engine (`MaterializationRefresher`) — full-rebuild (shadow table + atomic view swap), `DirtyGroupRecompute` and MERGE-upsert `Incremental` strategies for keyed aggregations, combined-key `SHA2_256` surrogate hashing, and the advisory `MaterializationFreshness` mixed-freshness inspector.
  - **CodeGen** (`codegen-lib`): materializes flagged stored Queries + entity base views (cross-engine DDL, wrapper view, read-only Virtual Entity minting, migration-reuse detection); parameterization (row-filter → materialize-broad + read-time predicate); aggregation-key auto-detection; RLS-downgrade gate; and `DriftHold` flag-and-hold drift detection.
  - **Read path**: `RunViewParams.DataSource: 'Live' | 'Materialized'` (`core`) routed by `GenericDatabaseProvider.GetEffectiveBaseView`, plumbed through the GraphQL layer (`server`, `graphql-dataprovider`).
  - **Scheduling** (`scheduling-engine`): `MaterializationRefreshScheduledJobDriver` sweeps due materializations (skips `Disabled`/`DriftHold`).
  - **`core-entities` / `ng-core-entity-forms`**: generated `MJ: Materialized Results` + `MJ: Materialized Result Queries` (join) entities + `Query.IsMaterialized` + forms. The MR↔Query link lives in the `MaterializedResultQuery` join table — there is no `MaterializedResult.SourceQueryID` / `Query.MaterializedResultID` FK — avoiding the circular dependency of the direct-FK design.

  See `plans/query-entity-materialization.md` for the full design.

- b46330e: feat(codegen,core): full-stack recursive foreign key support with automated TVF suites, base view projections, and hierarchy traversal APIs
  - **Database / TVF Suite**: CodeGen automatically emits 4 table-valued functions per recursive self-referencing foreign key on both SQL Server (T-SQL) and PostgreSQL (PL/pgSQL):
    - `fn<Table><Field>_GetHierarchyMeta` (computes `RootID`, `Depth`, materialized `Path`, `IsLeaf`, and `ChildCount`)
    - `fn<Table><Field>_GetDescendants` (full subtree retrieval with cycle detection)
    - `fn<Table><Field>_GetAncestors` (materialized path-based ancestor retrieval)
    - `fn<Table><Field>_GetRootID` (top-level root resolver)
  - **Base View Projections**: Every base view (`vw<Entities>`) automatically joins the hierarchy metadata via lateral joins (`OUTER APPLY` in SQL Server, `LEFT JOIN LATERAL` in PostgreSQL), projecting `[Root<Field>]`, `[<Field>Depth]`, `[<Field>Path]`, `[<Field>IsLeaf]`, and `[<Field>ChildCount]`.
  - **`BaseEntity` & Generated Subclasses**:
    - `BaseEntity` in `@memberjunction/core` provides generic hierarchy traversal methods `GetDescendants<T>()`, `GetAncestors<T>()`, and `GetChildren<T>()` with automated `ParentID` and recursive FK resolution.
    - CodeGen generates strongly-typed convenience methods (`entity.GetDescendants()`, `entity.GetAncestors()`, `entity.GetChildren()`) on all generated entity subclasses with self-referencing foreign keys.
  - **Documentation**: Added comprehensive architectural documentation in [`guides/RECURSIVE_FOREIGN_KEYS_AND_HIERARCHIES_GUIDE.md`](guides/RECURSIVE_FOREIGN_KEYS_AND_HIERARCHIES_GUIDE.md) and cross-referenced in package READMEs.

- ca3657d: Generated remote-operation clients for the workflow debug verbs that #3770 shipped.

  The Run Console calls eight control verbs — pause, resume, step, set breakpoints, override path, skip step, force-complete step, update step input — and #3770 added their rows to `metadata/remote-operations`. The generated client classes are produced by CodeGen _from the database_, so they do not exist until someone pushes that metadata and regenerates. Until then the console's controls have no typed client to call.

  This is that regeneration, run against a from-scratch database (migrations → DB-side CodeGen → `mj sync push --dir=metadata` → file CodeGen), which is what proves the classes come from the repo's own metadata rather than from state a long-lived dev database happened to hold.

  Additive except for one deliberate change CodeGen picked up with them: `TaskGraphRetryInput` gains an optional `inputPayload`, so an operator who can see why a step failed can correct the brief for the re-run.

### Patch Changes

- 834f8d7: Fix a `TypeError` that could kill an agent mid-run during context assembly, and take down scheduled-job dispatch entirely (`__mj_CreatedAt?.getTime is not a function`, `job.NextRunAt.getTime is not a function`).

  Two defects, one crash:
  - **`BaseEngine.OnExternalCacheChange` poisoned `entity_object` caches (the root cause).** When a cross-server cache-change event carried a payload, its rows — plain JSON objects, since cache payloads are serialized — were assigned straight into the engine property. For a config whose effective `ResultType` is `entity_object` (the default), that silently replaced the array's `BaseEntity` instances with plain objects, so `BaseEntity`'s coercing accessors were bypassed and a date field declared `Date` held a raw ISO string. Rows are now materialized via `TransformSimpleObjectToEntityObject` — the same conversion RunView's own cache-hit path uses — before assignment, with `'simple'` configs still passing through untouched and any failure degrading to the pre-existing full reload. Because materialization is async, the payload branch now claims a refresh generation (`beginConfigRefresh`/`isLatestConfigRefresh`, as `LoadSingleConfig` already does) so overlapping cache events cannot commit out of order. This affects **every** engine with `CacheLocal: true`.
  - **Unguarded `Date` method calls on those fields (the crash sites).** Optional chaining does not protect them — `"…"?.getTime` is `undefined`, and calling it throws. A new `ToEpochMs(value)` helper is exported from `@memberjunction/global` (a pure date utility — it needs no entity or metadata concepts) and now backs every affected read across four engines: `AgentContextInjector.sortExamples`/`sortNotes`, `AIEngine.fallbackGetNotesFromCache`/`fallbackGetExamplesFromCache`, `ConversationEngine.sortConversations`, and the scheduling engine's `isJobDue` plus its `NextRunAt`/`EndAt` diagnostics. It also closes a latent issue in the previous form: an Invalid `Date`'s `getTime()` returns `NaN`, which `?? 0` did not catch, yielding an incoherent comparator.

  Two exposures worth calling out. `AIEngine.fallbackGetNotesFromCache` is reached whenever the note vector service is uninitialized or a query embedding fails, so semantic retrieval with real input text could crash too — not just the empty-input path. And `SchedulingEngine.isJobDue` throws on the _first_ job in the dispatch loop, so a poisoned cache stopped **all** scheduled jobs from running, on every poll, until the cache reloaded.

  `isJobDue` also had a silent variant of the same bug: `evalTime < job.StartAt` does not throw on a string — relational operators coerce toward numbers, an ISO string yields `NaN`, and every comparison is false — so `StartAt`/`EndAt` activation windows silently stopped being enforced and a job could fire outside its range with nothing in the logs. Those comparisons now go through `ToEpochMs` as well.

  Making the cache-event path work also exposed a filtering gap (caught in review): `SchedulingEngineBase` loads `MJ: Scheduled Jobs` unfiltered and applies its Active-only invariant in memory, but only re-applied it on entity events — not after a cross-server cache event, whose payload carries every row. In a multi-instance deployment, one server's engine load could therefore hand another server's dispatch loop Disabled/Paused/Pending jobs. The engine now re-applies the filter (and notifies `JobsChanged$`) after `OnExternalCacheChange`, and `isJobDue` independently refuses non-Active jobs so dispatch can never depend on the array staying pre-filtered.

- 815b9bc: feat(storage,core,forms): ephemeral staged binary upload pipeline, polymorphic related collections, and file record viewer
  - **Storage & Server**:
    - Implement Tier 2 ephemeral staged raw binary upload pipeline (UploadTokenManager, POST /media/upload-stage, CreateUploadStageToken mutation, UploadStorageFile token consumption).
    - Add single-use cryptographic token security, user identity ownership binding, automated TTL eviction, and memory bounds.
    - Sanitize paths/filenames and add X-Content-Type-Options: nosniff to /media endpoints.
  - **Core & ORM**:
    - Add support for polymorphic IS-A subtypes in RelatedRecordCollection and dirty state preservation across relationship chains.
    - Support IEntityConfiguration and entity hierarchy traversal.
  - **Angular & UI**:
    - Add 3-tier upload pipeline in RecordAttachmentsComponent with real-time wire progress.
    - Add dedicated MJ: Files custom record viewer form component in ng-core-entity-forms.
    - Add attachment count badges to base form container and toolbar.
    - Add ResizeObserver lifecycle handling to Gantt chart and OpenNewEntityRecord in SharedService.

- f5ec13b: Fix two integration-tier regressions that surfaced when merging the Query & Entity Materialization work into the test-coverage branch.

  **`codegen-determinism.CD3` — stale generated field.** The generated `MJMaterializedResultEntity` carried a `SourceQuery` field, but the materialization migration removed the direct source-query columns in favor of a join table, so `vwMaterializedResults` (which the entity is generated from) exposes no `SourceQuery` — CD3 correctly flagged the generated schema key as having no live field. Removed the stale field from the generated ORM to match the live view. No runtime code read the property.

  **`client-cache.C12` — Trust=0 client caching regressed.** The materialization work re-gated the smart-cache-check WRITE path from `param.CacheLocal` to `runViewCacheEligible`, which includes `IsServerCacheAllowedForEntity`. That term gates the SERVER cache (kept fresh by BaseEntity events), so it excludes Trust=0 / Record-Changes / caching-disabled entities. But the CLIENT cache writes each slot with a `maxUpdatedAt` stamp and DB-revalidates per request, so those entities are still safely client-cacheable when stamped — the shared gate over-tightened the client path. Added `runViewCacheEligibleForWrite`: on the trusting server it is exactly `runViewCacheEligible`; on a client it keeps the structural + materialized exclusions but drops the server Trust/event gate. The Fields-override `willCache` decision is unchanged.

- 2741d46: Make the deterministic integration tier runnable against PostgreSQL, and fix the runtime and conversion defects that running it exposed.

  **Why.** MJ #3257 records that the integration suite is meant to run twice per build — once per backend — and that this was never implemented. PostgreSQL therefore shipped with migration parity verified and _runtime_ parity unverified. This change makes the tier run on PostgreSQL for the first time and fixes what that surfaced: **49 of 61 deterministic bundles now pass on PostgreSQL** (measured, MJAPI live; 61/61 executed, none skipped).

  **Harness (closes the #3257 blocker list).** `testing-cli` now branches on platform instead of unconditionally building an `mssql` pool: `mj-provider.ts` gains a PostgreSQL path (dynamic import, declared as an optionalDependency so SQL-Server-only consumers never resolve `pg`) with a PG-native user-cache load, `MJConfig` gains `dbPlatform`, and `getContextUser()` resolves the same user on both backends — System by name, then the well-known System ID, then the first active Owner, with `.trim()` because `Type` is space-padded in both ledgers. `mj.config.cjs` gains `dbPlatform` and a platform-aware `dbPort` default; with `DB_PLATFORM` unset both are exactly the previous SQL Server behaviour.

  **Runtime dialect leaks.**
  - `SQLDialect` gains `AffectedRowCountSQL()`. `TaskClaimStore` was emitting `SELECT @@ROWCOUNT`, which is T-SQL only — on PostgreSQL the `@@` is consumed as a parameter marker and the bare `ROWCOUNT` folds to lowercase, so _every_ guarded write failed with `column "rowcount" does not exist` (7,168 occurrences in one tier run, now zero). SQL Server keeps `@@ROWCOUNT`; PostgreSQL uses a data-modifying CTE.
  - `MJDashboardEntityExtended` no longer denies the owner. `Validate()` is synchronous and reads `DashboardEngine`'s cache directly, so in any process using the default `task` startup mode — where engine pre-warm is deferred — an unloaded cache was indistinguishable from "you have no permission", and `mj sync push` failed on a dashboard whose `UserID` _was_ the pushing user. Ownership is now answered from the row itself, which needs no cache; a non-owner still falls through to the engine and is refused when it is cold. `Delete()`, being async, loads the engine for the non-owner case and short-circuits for the owner, so a merely _stale_ cache — a dashboard created since the last `Config()` is absent from the backing array — cannot refuse its own owner either.

    Ownership is read from the **persisted** `UserID` (`GetFieldByName('UserID').OldValue`), never the in-memory one. `UserID` is a settable field on `UpdateMJDashboardInput`, and `ResolverBase.UpdateRecord` loads the row and then applies the client's values _before_ `Save()` runs `Validate()` — so an owner check written against `this.UserID` would be satisfied by a value the caller supplied in the same request. Since this class **is** the permission gate for dashboards, that would let any user who can load one send `UpdateMJDashboard(ID: <someone else's>, UserID: <self>)` and take the record. Transferring ownership is separately gated to the owner, so a user holding `CanEdit` through a share can edit but not appropriate. `MJDashboardEntityExtended.ownership.test.ts` covers both directions, including that the engine is still consulted for the attacker case.

  **Conversion (T-SQL → PostgreSQL).** Five defects, each caught only by applying the output to a fresh database — the converter reported `0 errors` every time:
  - CASE-expression keywords were quoted as identifiers inside `CHECK` bodies (`"CASE" "WHEN" …`), so the migration would not parse. The missing keyword set was derived by intersecting 2,084 `CHECK` bodies across 67 shipped migrations against the dialect keyword list: exactly `CASE`, `WHEN`, `THEN`, `ELSE`, `END`.
  - Every `IF EXISTS (…)` batch was classified `SKIP_SQLSERVER` and silently discarded. A guarded `DROP CONSTRAINT` therefore vanished — with exit code 0 — and the paired `ADD CONSTRAINT` later in the same migration failed with "already exists". The rewrite discards the guard, so it fires **only when the guard is a catalog probe** (`sys.check_constraints` / `key_constraints` / `foreign_keys` / `default_constraints` / `objects`) — the form that exists purely because SQL Server has no `DROP CONSTRAINT IF EXISTS`. A guard on data (`IF EXISTS (SELECT 1 FROM Payment WHERE Status = 'Legacy')`) is a real condition; dropping it would make PostgreSQL drop unconditionally while SQL Server does not. Those keep falling through to the generic path, which comments out what it cannot express. This mirrors the `sys.indexes` gate the conditional-index rule already had.
  - `CREATE SCHEMA` is folded to lowercase to match its unquoted references — `convertIdentifiers` emits the schema half of `[X].[Y]` bare, so a quoted `CREATE` and a bare reference name two different schemas. **`__mj_UDT` is exempt**, because it is the one schema with a producer outside the migration set: the Database Designer creates it, and every table in it, through `UDT_SCHEMA_NAME` — quoted and case-preserved, as do `CreateSchemaDDL`, `QuoteSchema` and the schema-builder's `QuotePostgres`. Folding it would leave the runtime writing into a schema no migration made, and would orphan every UDT entity from its table in `vwSQLTablesAndEntities`, which joins `nspname = e."SchemaName"` case-sensitively. Nothing wants the folded spelling: across `migrations-pg/` there is not one unquoted `__mj_udt` reference, and all 272 other occurrences of the name are prose or JSON string content. No reconciliation DDL is emitted for any schema — a guard at that point would land in the converted output of the migration that CREATES the schema, the one file every affected database has already applied and Flyway will never re-run, so it could only ever fire on a database that does not need it.
  - T-SQL table variables became the invalid declaration `v_X TABLE;`; they now become `CREATE TEMP TABLE … ON COMMIT DROP`.
  - `DELETE alias FROM … JOIN …` passed through as T-SQL; it now becomes PostgreSQL's `DELETE … USING` (the UPDATE analogue already existed).
  - `WITH CHECK ADD CONSTRAINT` survived on non-FK constraints, and `END ELSE BEGIN` left stray tokens. A subtler one: the `DECLARE` indent capture also matched a preceding blank line, which pushed the declaration out of the `DECLARE` section and into the block body.

  **Also fixed.** `spDeleteEntityWithCoreDependencies` could not be invoked on PostgreSQL — `callRoutineSQL` always emitted `SELECT * FROM fn(...)`, which PostgreSQL rejects for a `RETURNS SETOF record` routine with no OUT parameters, so entity pruning silently died and cascaded into 22 missing CRUD routines. `callRoutineSQL` gains an optional `expectsResultSet`; SQL Server ignores it. CodeGen's PostgreSQL audit-SQL folder swap was pinned to `v5` by exact match, so on v6 it wrote into the SQL Server tree. `applyLLMPrimaryKeys` validated primary-key names case-insensitively but then used the model's spelling in the `UPDATE`, matching zero rows on PostgreSQL while reporting success — it now uses the matched column's actual name.

  **Repeatable metadata refresh.** `R__RefreshMetadata` on PostgreSQL now also clears orphaned `EntityField` rows, as the SQL Server file has always done. Without it a from-scratch PostgreSQL database ends up with metadata describing columns its own base views do not have, and every read of those views fails.

  **Two test-authoring fixes, not product changes.** The aggregates bundle passed `MAX(__mj_UpdatedAt)` unquoted and the open-app-teardown fixture called `SYSDATETIMEOFFSET()`; both are SQL-Server-only spellings and are now dialect-quoted.

  **On the `migrations-pg/v6/**`files in this PR.**`CLAUDE.md`says a feature PR ships the T-SQL migration only and that PG counterparts are regenerated by the build engineer at release time. The five files here are`mj migrate convert`output, not hand-authored, and they exist because the tier cannot run on PostgreSQL without them — that is the whole subject of the change. They need the build engineer's sign-off before merge, and should be regenerated rather than merged if the release conversion runs first. Existing`migrations-pg`output is deliberately **not** regenerated against the converter changes above: the v5 files are frozen baselines, and the`\_\_mj_UDT` exemption above means the converter's new output agrees with what they already installed.

  SQL Server is unaffected: every changed path is either PostgreSQL-only or a same-output refactor. Unit tests across the touched packages pass — SQLDialect 404, SQLConverter 1139, MJCoreEntities 597, CodeGenLib 808, TaskGraph 60, testing-cli 23 — zero failures in any of them.

- 53d256f: Remove the 11 `Orders*` remote-operation classes and their 36 input/output types from
  `remote_operations.ts`. They come from a developer's local `bizapps_orders` install, not
  from anything this repo ships — a core-only database generates 31 operations, not 42. No
  MJ package imports them. The generator remains unscoped (see #3981); this only removes the
  app-specific classes that reached the core artifact.
- 4b1257f: Window the chat transcript: load the latest display page on open, prepend older pages from a top sentinel, and keep the ConversationEngine full-history API unchanged for agents.

  Opening a conversation previously ran `GetConversationComplete` for every row, hydrated all of them, and mounted a component per timeline item. It now reads only the newest page. `ConversationEngine.LoadDetailWindow` is additive and pages on `Sequence` (not `AfterKey` — the primary key is a uniqueidentifier, so PK order is not chat order); `LoadConversationDetails` is untouched and still returns complete history, which `GetAgentContextWindow` and the server callers depend on. A window is deliberately never written into `_detailCache`.

  Paging is counted in display items rather than rows, so a realtime session still collapses to one card and is never split across pages.

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
- Updated dependencies [07cb22e]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [f5ec13b]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/interactive-component-types@6.1.0-edge.3

## 6.1.0-edge.2

### Minor Changes

- 48ff99f: Add `ModelConfiguration` — a per-modality, strongly-typed JSON configuration bag on the AI model catalog — at three levels forming an inherit-with-override cascade: `AIModelType` < `AIModel` < `AIModelVendor`, resolved base-first with per-key deep merge. One interface (`IAIModelConfiguration`: `LLM` / `Realtime` / `Vision` / `Audio` sections) is shared by all three levels via MJ's JSONType mechanism, so CodeGen emits typed `ModelConfigurationObject` accessors on all three entities. This generalizes the scalar cascade those tables already carry (`SupportsPrefill` / `PrefillFallbackText`): new session/call-time capability knobs now land as typed properties in one bag instead of a column per knob. Existing capability columns are untouched. `AIEngine.GetEffectiveModelConfiguration(modelID, modelVendorID)` is the single canonical read path; the pure `ParseModelConfiguration` / `ResolveEffectiveModelConfiguration` live in `@memberjunction/ai`.

  First consumer: realtime turn detection. `Realtime.TurnDetection` (`Mode: 'default' | 'serverVad' | 'semanticVad' | 'native'`, plus eagerness / threshold / silence tuning) flows catalog → session config bag → provider wire block on both realtime topologies, with precedence `profile default < ModelConfiguration cascade < realtime.session.turnDetection < runtime configOverridesJson`. Profiles declare `supportedTurnModes` and translate through the shared `MapNormalizedTurnDetection`; an unsupported mode is diagnostic-logged and falls back to the profile default, so a shared model catalog never rejects a session on any provider. Non-protocol drivers scrub the key. Turn detection was previously hardcoded per provider profile, so smarter models had no way to opt into their smarter turn modes.

  Fixes a latent bug: a live `Reconfigure` (the meeting-mode auto-response flip) hardcoded `server_vad`, silently downgrading any session running a non-server-VAD turn mode. It now rebuilds the session's actual resolved mode, with meeting-mode floor control composed on top.

  GPT Realtime 2.1 and 2.1-mini are seeded to `semanticVad` (eagerness `auto`) at the model level — the one behavior-affecting change here. Everything else is behavior-neutral while `ModelConfiguration` is `NULL`.

- ca4feb4: Workflow cost becomes a projection of the run tree, and a graph now runs in the order it was drawn.

  **Cost is the tree, not arithmetic beside it.** `AIAgentRun`'s four `…Rollup` columns are now written from `SumAgentRunTreeCost(LoadAgentRunTree(runID))` at settlement — one basis (per-node own spend), prompt-aware through `Configuration.runtime.promptRunID`, and structurally incapable of disagreeing with what the run viewer shows. The previous per-child loop filtered on `AgentRunID`, so every Prompt step's spend was absent, and mixed a descendant-inclusive number with an own-spend one. The tree now also carries the prompt/completion token split so all four columns share a basis. Writing the sum back makes the column an _output_ of the tree, which is non-circular only because the query reads own cost and never a rollup — stated in the query header and pinned by a test that plants an absurd rollup on a real run. When the tree cannot be summed (load failure, depth cap, graph not reachable), the columns are **cleared** rather than left holding a stale total from an earlier settlement.

  **A loop's passes exist.** The run tree reaches nested work through six relationships and a loop iteration was none of them, so a `While` that spent real money across three passes reported one childless node with no cost. The dispatcher now records one entry per pass (`ITaskStepRuntime.iterations`) and the tree expands them into nodes. On a real workflow this moved `TotalCostRollup` from `0.00049725` to `0.00555375` — the loop had been spent and not counted.

  **A graph is dispatched only once its edges exist.** Children and dependencies are now written in one transaction. Previously a poll could land between the two writes, see tasks with no prerequisites, and claim the whole graph at once — observed running a closing branch before the draft it was meant to judge existed, then reporting Complete.

  **Steps see their payload.** A step with no input mapping fell back to the raw input instead of the merged payload, so a Prompt step — which declares no mapping by design — rendered `{{ _CURRENT_PAYLOAD }}` as `{}` and wrote from an empty brief. Separately, a step with no output mapping _replaced_ the payload with its own output rather than merging; for a loop, whose output is a summary, that discarded everything the iterations had established and made a downstream `payload.x === true` edge unreachable.

  **An output mapping that names a parameter the step never returns now says so** (`unmapped`), naming what the step did return, instead of skipping in silence.

  **Human steps**: a cancelled request re-raises instead of stalling forever; cancelling a graph withdraws its open requests instead of leaving them in someone's inbox; cross-user `assignToUserID` is refused at submission rather than silently reassigned to the submitter; and a step can declare `expiresInHours`, which finally makes the existing expiry machinery reachable.

  **Web Search** captured each result with a non-greedy match that stopped at the first nested `</div>`, cutting the snippet out of every result — ten well-formed hits carrying no content. Results are now sliced between block starts, and an all-snippets-empty parse is reported rather than returned silently.

  **Testing**: a bundle whose every check is gated out now records an explicit skip naming the flag that would run it, instead of reporting PASS with zero checks executed.

### Patch Changes

- 255d506: A dashboard's owner can save it when the dashboard engine has not loaded

  `MJDashboardEntityExtended.Validate()` resolved edit permission solely through
  `DashboardEngine.GetDashboardPermissions()`, which answers from the engine's `_dashboards` array. A
  dashboard the engine cannot find returns "no permissions" — indistinguishable from a genuine denial.
  In a process that never configures the engine, that array is empty, so _every_ dashboard save is
  refused, including by the record's own owner.

  CLI task mode is exactly such a process: it defers all 14 engines to first use. `mj sync push` on
  PostgreSQL therefore failed the whole run on the first owner-owned dashboard it touched, reporting
  "You do not have permission to edit this dashboard" while running as that dashboard's owner. It went
  unnoticed on SQL Server because the same record is unchanged there, so `Save()` short-circuits before
  `Validate()` ever runs.

  Ownership does not need the cache to answer: the row carries `UserID`. When the engine is not loaded,
  that direct comparison now decides. A loaded engine still makes the call, and a non-owner is still
  refused on either path — so no denial is weakened.

- 1c0d586: Flow agents now execute on the durable task-graph dispatcher instead of walking their own graph
  inside an agent run.

  `FlowAgentType.DetermineInitialStep` compiles the agent's steps and paths into a `TaskGraphSpec` and
  returns a `Tasks` step; `BaseAgent.executeTasksStep` submits it and detaches. From there a workflow
  is `Task` rows owned by a server-side dispatcher, with the same claiming, conditions, skip cascade,
  retry and failure semantics as any other graph — one traversal engine rather than two that drift.
  The in-run walker is retained as the reference implementation the compiler is checked against, but
  refuses at its single choke point, so a workflow that runs at all provably ran on the new engine.

  Also in this change:
  - `Task` gains `StepType`, `PromptID` and a typed `Configuration` bag (`ITaskStepConfiguration`)
    carrying kind-specific settings, the payload mappings, the execution policy and the author's
    canvas layout. `CK_Task_Assignment` now counts `PromptID`.
  - Payload mapping semantics are lifted into `@memberjunction/ai-core-plus` so both engines share one
    dialect — the `*` wildcard, case-insensitive result lookup, `[]` append, `$message` fields, and the
    `static:` / `payload.` / `data.` / `context.` prefixes.
  - `ForEach` and `While` steps run through a new `TaskLoopExecutor`: bounds (`maxIterations: 0` means
    unlimited), `continueOnError`, delay, and parallel batches that keep results in **iteration** order.
  - New deterministic DAG layout (`LayoutTaskGraph` / `LayoutGraphNodes` / `GraphLayoutBounds`) — a
    `Task` row has no position columns, so a run view previously drew every node on the origin.
  - A settled graph credits its spending back to the submitting run through the `…Rollup` columns on
    `AIAgentRun`, which existed since v3 and were never written. `TotalCost` keeps its current meaning.
  - `TaskGraphActionRunner` returns a flat, name-addressable result instead of an `ActionParam[]`, so
    output mappings resolve and branch conditions can be evaluated.
  - `GetTaskGraphSubmitter()` now honours its documented contract and returns `null` when no
    durable-execution package is loaded, instead of an instantiated abstract base.

  New guide: `guides/WORKFLOW_AND_TASK_GRAPH_GUIDE.md`.

- Updated dependencies [5ecfdb4]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/interactive-component-types@6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

- 394d276: External agent harnesses as a new MJ agent type — plus a cost-guardrail fix that affects every agent

  An MJ agent can now be executed by an **external agent harness** (Claude Code, Codex CLI, OpenCode,
  Gemini CLI, Pi) running in a sandbox, while MemberJunction keeps identity, permissions, governed data
  access, payload contracts, HITL, cost control and run-level audit.

  **A harness turn is protocol-identical to a Loop iteration.** The harness reasons freely inside its
  sandbox, then ends its turn by emitting the same next-step JSON envelope a Loop model emits. MJ
  executes any actions, sub-agents or skills through its own validated machinery and resumes the
  session with the results. That is why every existing guarantee — next-step validation, per-action
  `MaxExecutionsPerRun`, skill gates, plan-mode blocking, `PayloadManager` ACLs,
  `checkExecutionGuardrails`, run-step recording — applies with no new enforcement code, and why there
  is one authority channel to audit rather than two. `HarnessAgentBase` overrides exactly one method,
  `executePrompt`.

  New schema, all additive: `MJ: AI Agent Harnesses` (the registry of launchable harnesses),
  `MJ: AI Agent Credentials` (the grant edge for secrets an agent carries into its sandbox — custody
  stays in `MJ: Credentials`), and `AIAgentRun.ExternalSessionID`. `CapabilitySettings` is a
  strongly-typed JSONType declaring what each adapter **actually implements**, because the runtime
  _emulates what is missing_ — an over-claim is a silent behavioural gap, not an error.

  **Also fixes `MaxCostPerRun` / `MaxTokensPerRun` for every agent type, not just harness agents.**
  The limits are static on the agent and were compared correctly, but the run's accumulated
  `TotalCost` / `TotalTokensUsed` were only written on terminal paths — so mid-run they sat at 0 and
  the checks short-circuited on a falsy zero. The ceilings were evaluated as a run _ended_: reporting,
  not guardrails. A runaway agent burned its whole budget and was told afterwards. Only the iteration
  and time limits actually interrupted a run. The totals are now refreshed before the comparison, with
  regression coverage verified to fail without the fix.

  Sandboxes: the **provider owns process placement**, delivered to adapters as a `SandboxExecutor`, so
  the same adapter runs on a laptop or inside a per-run container without knowing the difference. The
  local provider scopes a workspace directory but does **not** contain the process — `networkPolicy` is
  advisory there, which is documented rather than implied. `DockerSandboxProvider` enforces
  `networkPolicy: 'none'` for real.

  Known gaps, documented in the guide so nobody designs around a guarantee that does not exist:
  `PermissionHooks` is false on every adapter (the `strict` posture needs an MCP permission-prompt tool
  that is a later phase), `mcp-only`/`allowlist` are not packet-enforced, the MCP loopback is not yet
  wired, and `ModelID` uses the declared rather than the harness-reported model.

  Ships **not live**: every harness row is `Inactive` and `Demo Harness Agent` is `Pending`, because
  they depend on external binaries a fresh install will not have.

  See [`guides/AGENT_HARNESS_GUIDE.md`](../guides/AGENT_HARNESS_GUIDE.md).

- 394d276: Phase 0 of the unified workflow DAG engine program (plan: PR #3456) — retires three dead or superseded subsystems so the **Workflow** name is freed for the program's user-facing vocabulary, and so the task-graph engine isn't built alongside a parallel, non-functioning orchestration model.

  **Eleven tables dropped** — the Skip v1-era workflow schema (`Workflow`, `WorkflowRun`, `WorkflowEngine`), the Skip v1-era report artifact (`Report`, `ReportCategory`, `ReportSnapshot`, `ReportUserState`, `ReportVersion`), the legacy `ScheduledAction` / `ScheduledActionParam` pair, and the report-era `OutputTriggerType`. All were verified dead or superseded: nothing outside generated code read the workflow tables, the `Reports` resource type named a `DriverClass` (`ReportResource`) that exists nowhere in the repo, and the legacy scheduled-action cron due-check is mathematically always-false so authored schedules could never fire.

  **Breaking — the report execution surface is gone.** `RunReport` was already marked `@deprecated` ("Reports are no longer supported... Interactive Components and Artifacts are replacements") and read `vwReports`, which this migration drops. Removed: `IRunReportProvider`, the `RunReport` class, `RunReportParams` / `RunReportResult`, `BaseEntity.RunReportProviderToUse`, `BaseAngularComponent.RunReportToUse`, `GraphQLDataProvider.GetReportData`, the `GetReportData` GraphQL query and `CreateReportFromConversationDetailID` mutation, and the `GET /reports/:reportId` REST endpoint. Accepted deliberately in the open v6 breaking-change window. Consumers should use Interactive Components and Artifacts.

  **Scheduled Actions are superseded by Scheduled Jobs, and the UI moved with them.** Contrary to the original plan's read, the entities were live authoring surface: four Knowledge Hub / AI dashboards created and read them. Those surfaces now author a `MJ: Scheduled Jobs` row of type **Action** — the same work, executed by `ActionScheduledJobDriver`, with the action and its parameters carried in the job's `Configuration` JSON rather than in child parameter rows. `ContentSource.ScheduledActionID` becomes `ContentSource.ScheduledJobID`. A shared `action-scheduled-job` helper in `ng-dashboards` owns the mapping so it isn't triplicated across surfaces.

  **Also removed:** the `@memberjunction/scheduled-actions` and `@memberjunction/scheduled-actions-server` packages (nothing depended on either), the `MJScheduledActionEntityExtended` subclass, the "coming soon" Scheduled Actions placeholder dashboard, and the Explorer report wiring (route, `TabService.OpenReport`, `NavigationService.OpenReport`, resource-type map entry, home-pin matcher, and the dashboard add-item Reports branch).

- 394d276: Phase 1 of the unified workflow DAG engine program (plan: PR #3456) — makes the task substrate tell the truth about what actually happened.

  **Payloads become columns.** `Task` gains `InputPayload`, `OutputPayload`, `ErrorMessage`, and `AgentRunID`. Inputs and outputs previously rode inside `Task.Description` behind `__TASK_METADATA__` / `__TASK_OUTPUT__` markers, which leaked orchestration plumbing into search results and the task detail panel. A one-time migration backfill converts existing marker rows into the new columns and strips the markers; there is deliberately **no fallback parse** in code, because a fallback with no backfill never dies. The backfill is conservative — a row whose marker text doesn't parse as JSON is left byte-for-byte intact for inspection rather than silently discarded.

  **Failures propagate instead of stalling.** A `Failed` dependency used to leave its dependents `Pending` forever: they never became eligible, so the graph appeared to finish while work silently never ran — and the parent was marked `Complete` at 100% regardless. Now failure propagates transitively to `Blocked`, and the parent rolls its children up honestly (`Failed` > `Blocked` > `Cancelled` > `Complete`, with progress counting only completed children). Completion notifications fire only for genuinely successful graphs.

  **Bad graphs are rejected before they are persisted.** Dependency cycles are detected at creation (a cyclic graph could previously be saved and then deadlock silently), and a graph naming an unknown agent is now an error rather than being logged-and-skipped — which used to execute the graph with holes where the caller's tasks should have been.

  **Waves run in parallel.** Eligible tasks execute with bounded concurrency (5) rather than one at a time, and each pass loads the graph once instead of issuing a dependency query per candidate task. Stalled graphs — pending work, nothing runnable, nothing in flight — are now detected and logged rather than exiting quietly.

  **The Gantt links the right run.** `Task.AgentRunID` records the specific run that executed each task. The UI previously joined tasks to runs through the shared `ConversationDetailID`, so every sibling task in a graph resolved to the _same_ agent run; the link was wrong for all but one. `Blocked` and `Failed` also now render distinctly instead of inheriting the pending treatment.

  **New pure graph algorithms** in `@memberjunction/ai-core-plus` (`computeEligibleTasks`, `computeTasksToBlock`, `computeParentRollup`, `detectCycle`, `isGraphStalled`, `findUnknownDependencyRefs`) — dependency-free, operating on plain shapes rather than entities, with 44 unit tests. Phase 2's durable dispatcher consumes these unchanged rather than reimplementing eligibility and propagation.

  **Also:** dispatcher claim columns (`ClaimedBy`, `ClaimExpiresAt`) and their supporting indexes land now so Phase 2 adds the dispatcher without further schema churn — nothing reads them yet. `AIAgentRunStep.StepType` gains `TaskGraph`. New deterministic integration bundle `task-graph-orchestration` (TG1–TG4) covering cycle rejection, unknown-agent rejection, payload columns, and the new schema's presence in generated metadata.

- 394d276: Follow-up to Phase 2 of the unified workflow DAG program (plan: PR #3456) — the task-graph control plane becomes **Remote Operations**, and the durable dispatcher actually starts.

  **BREAKING: the `SubmitTaskGraph`, `CancelTaskGraph`, and `RetryTask` GraphQL mutations are removed**, one release after they were added. They shipped in Phase 2 as bespoke resolvers, which fixed the _durability_ problem — nothing awaits a whole workflow inside one request anymore — but left the _reachability_ problem exactly where it was: callable from the Explorer client and nothing else. That undercuts the program's own goal of letting agents **set up** workflows rather than only navigate to them.

  Remote Operations are MJ's typed control plane, and the closest analogous substrate already uses them for precisely this shape of verb: Record Set Processing exposes `Run` / `Pause` / `Resume` / `Cancel` / `Get Run Status` entirely as Remote Operations. One registration is reachable from MCP (external agents), from an Action wrapper (internal agents), and from the UI, with the framework's authorization scopes applied uniformly rather than re-implemented per resolver.

  The replacements are `TaskGraph.Submit`, `TaskGraph.Cancel`, `TaskGraph.RetryTask`, and `TaskGraph.GetStatus`. `GetStatus` is new — it has no mutation predecessor. It is the observation half of making execution durable: once nobody holds a request open, a caller re-attaching after a reload, an agent checking work it submitted, or an external MCP caller all need a way to ask "where is it?". Its rollup runs the same pure algorithm the dispatcher runs, so the reported status cannot disagree with the engine's own view.

  There is deliberately no `TaskGraph.Pause`. The dispatcher has no pause concept — pausing a claimed task means deciding what happens to its claim, and inventing that here to round out a verb set would be guessing ahead of Phase 4.

  **The durable dispatcher now starts.** Phase 2 landed `TaskGraphDispatcher` but nothing ever instantiated it, so a submitted graph persisted correctly and then sat in `Pending` forever — durable and inert, which is strictly worse than the client-driven path it replaced. MJServer now starts one instance per process after `listen()`, alongside the other boot-time reconcilers, keyed by hostname + pid so reconciliation can tell its own orphaned work from a peer's live work. It is gated on SQL Server because the provider factory mints a `SQLServerDataProvider`; the PostgreSQL branch lands with PG parity.

  **The dispatcher self-registers with `ShutdownRegistry`** rather than making each host remember to stop it. A dispatcher still polling through a graceful shutdown would claim work the process is about to abandon — creating exactly the orphaned-claim state reconciliation exists to clean up.

  The Angular conversation client now calls `TaskGraph.Submit` through the generic `ExecuteRemoteOperation` transport, so the hand-written GraphQL document is gone from the client as well.

### Patch Changes

- 394d276: Harness permissions: make policy enforcement a declared capability, and stop trusting prefix-matched command patterns

  MJ's harness permission policy was already abstract — declared in agent metadata, overridable at runtime, translated per-harness through `BaseHarnessAdapter.ApplyPermissionPolicy`. But only `ClaudeCodeCliAdapter` overrode that seam. The other four adapters inherited the inert base default, so a configured `strict` posture was **silently ignored**, and the runtime's warning checked `PermissionHooks` — a different question — so it never fired.

  **New `IHarnessCapabilitySettings.PermissionPolicy`** declares that an adapter actually translates the policy into flags the harness honours. Deliberately separate from `PermissionHooks`, which is about _interactive_ mid-turn approval: Claude Code enforces a static policy while having no hook to pause on, and conflating the two is precisely what hid this. `HarnessAgentBase` now logs an error when a policy is configured against an adapter reporting `false`, so an operator is never left believing something is gated. It warns rather than refusing — an unenforced policy on a properly-provisioned sandbox is still contained by the sandbox, and failing the run would take every unverified adapter offline.

  **Pi now enforces**, using flags verified against a real install (`--tools` / `--exclude-tools`): `strict` → `read,grep,find`; `auto` → additionally `edit,write` but no shell (the `acceptEdits` analogue); `dangerous` → no flag at all. Because Pi gates on **exact tool names**, `strict` is genuinely enforceable there, unlike on Claude Code where it degrades to prompts that have nowhere to go headlessly. MJ's tool vocabulary is translated to Pi's (`Glob`→`find`, `Bash`→`bash`) by the adapter, so a policy is authored once regardless of harness.

  Pi cannot express command-scoped patterns like `Bash(git:*)`, and those **fail closed in both directions**: a command-scoped _allow_ is dropped, because granting the whole tool would hand over strictly more authority than the policy asked for; a command-scoped _deny_ is widened to the whole tool, because denying more than asked is the safe direction.

  Codex, Gemini CLI, OpenCode and the generic stdio adapter declare `PermissionPolicy: false`. Their CLIs' permission flags could not be verified against a real install, and guessing them produces exactly the failure this capability exists to surface — a policy that looks applied and is not.

  **Claude Code's Bash patterns are PREFIX-LITERAL, and that is now documented as a rule rather than a caveat.** Proven live: a `Bash(git:*)` allow paired with a `Bash(git commit:*)` deny let `git -C <path> commit` execute, because any flag before the subcommand defeats the prefix. The run failed only because nothing happened to be staged. So: deny whole tool names — an exact match, no prefix involved — or allow fully-specified commands; never carve dangerous subcommands out of a broad allow. Tool-pattern lists are hygiene, not a security boundary. Real containment comes from the sandbox provider, and the `local` provider offers none.

  The shipped `Demo Harness Agent` follows its own advice: `Read`/`Grep`/`Glob` allowed, `Bash`/`Write`/`Edit`/`NotebookEdit` denied outright.

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/interactive-component-types@6.1.0-edge.1
  - @memberjunction/ai@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Minor Changes

- 2412415: Entity Action workflow extensions — turn `EntityAction` into the general workflow-hook substrate, and make its execution log safe and diagnosable.

  `EntityAction` was already wired into the save path (`Validate` is a real blocking gate that fails the save) and `Execute Agent` already let any binding run a flow or loop agent. This adds what was missing to use it as the workflow layer across MJ and every OpenApp, rather than each app inventing its own.

  **Schema (additive):**
  - `EntityAction.ScopeEntityID` + `ScopeRecordID` — bind a workflow to one _configuration_ record (a Deal Type, a Contract Type, a Pipeline, a Company) instead of every record of an entity. `NULL` keeps today's apply-to-all behaviour. This is what stops every app growing a column per type per event.
  - `EntityAction.Sequence` — deterministic ordering when several bindings share an invocation type.
  - `EntityAction.LoggingMode` — `All` / `FailuresOnly` / `None`, per binding.
  - `EntityActionParam.ValueType` gains `'Entity Object Data'` — passes `entity.GetAll()` rather than the live `BaseEntity`. Required for anything that serializes the value, notably `Execute Agent`'s `Data` payload, where a `BaseEntity` yields `{}` because its fields are getters rather than enumerable own properties.
  - `ActionParam.LogValue` and `EntityActionParam.LogValue` — control whether a parameter's value may be written to the execution log.
  - `ActionExecutionLog.EntityActionID`, `EntityActionInvocationTypeID`, `TargetEntityID`, `TargetRecordID` — provenance, so a failed workflow can be traced to the binding, the record and the event that fired it.
  - `ActionExecutionLog.ResultParams` — the final parameter set, so `Params` can stop being overwritten and keep the inputs _as the action was called_.

  **Engine behaviour (built in this change):** whole-record parameter value types (`Entity Object` / `Entity Object Data`) are never written to the execution log — rule 1 of `RedactParams`, which no `LogValue` flag can re-enable; redaction runs through one shared helper applied by every persister rather than inline in the log methods, so no path can write a raw `ActionParam[]` to persistent storage; the input snapshot is taken at the top of `RunAction` so all four exit paths (validation failure, filter refusal, timeout/abort, normal completion) record the same as-called values; `ResultParams` is written on failure exactly as on success, so `NULL` means precisely "the run never finished"; scope resolution is fail-closed — a scoped binding that cannot be resolved declines to fire; and `LoggingMode` gates _logging only_, never execution.

  **⚠️ Semantic change to an existing column — `ActionExecutionLog.Params`.** It previously held the final _merged_ parameter set (inputs plus any outputs the action appended). It now holds the _as-called inputs_, and the merged set moves to the new `ResultParams` column. This is a repurposing, not merely an added column: any existing dashboard, report, query or downstream consumer reading `Params` to see an action's **outputs** will now silently get its **inputs** instead, and must be repointed at `ResultParams`. The column's extended-property description is updated to match. Nothing else about the row changes.

  **Metadata:** `Execute Agent`'s content-bearing parameters (`Data`, `ConversationMessages`, `Payload`, `AgentResult`) ship with `LogValue: false`. Its identifier parameters stay logged, so a run remains diagnosable and the content is one hop away in `MJ: AI Agent Runs`.

  Existing bindings and direct action invocations are unchanged: every new column is nullable or defaulted to today's semantics (`Sequence` DEFAULT 0, `LoggingMode` DEFAULT `'All'`, `LogValue` DEFAULT 1), and an unscoped binding short-circuits to "applies". The one exception to "purely additive" is the `Params` repurposing called out above. Requires `mj codegen` after the migration — see `plans/entity-action-workflow-extensions.md` §6 for the ordering, which matters.

  **Known follow-ups (not blockers, tracked separately):** undeclared output params pushed via `addOutputParam` have no `ActionParam` row to opt out with, so they default to logged; shape recording emits top-level key names, which are schema for a record but content for a map keyed by IDs; and execution-log retention (§5.8 Scheduled Job) is documented but not yet enforced, so row count is unbounded.

### Patch Changes

- 9a905e8: fix(explorer): decouple the session landing app from the user-sortable Sequence order.

  `UserApplication.Sequence` is a user-owned display preference for the app switcher, but the shell's bare-root landing blindly activated `apps[0]` from the Sequence-ordered list — so dragging any app above Home (or landing in a Sequence-0 tie, reachable without ever touching the ordering UI) silently changed where every fresh session, including magic links, opened; and if that app failed to produce a tab the session had no way back. The landing pick is now the declared-default app (lowest `Application.DefaultSequence` — Home ships at -1), Sequence ties break by `DefaultSequence` then name, the bare-root path validates a candidate's default tab BEFORE activating it and falls through to the next candidate instead of stranding the session, and `CreateDefaultTab()` honors the `isDefault` nav item so landing on an app opens the same tab as clicking it. Reordering the switcher no longer changes where a session lands.

- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [5c6e36c]
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/interactive-component-types@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/interactive-component-types@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/interactive-component-types@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Minor Changes

- 12691e3: Content autotagging: metadata-driven vector config, chunk purge + backfill, and parity with the entity-vectorization pipeline

  Brings the ContentSource / autotag embedding pipeline (`AutotagBaseEngine`) up to parity with the
  EntityDocument pipeline, and wires up chunk lifecycle operations. All additive and opt-in — existing
  setups behave identically. No schema/migration changes (config rides the `Configuration` JSONType).
  - **Metadata-driven vector config** on the `Configuration` JSONType of both `ContentSource` and
    `ContentType` (ContentSource overrides ContentType, then a hardcoded default):
    - **`VectorIDStrategy`** (`'hash' | 'recordId'`, default `'recordId'`): `'recordId'` uses each
      chunk's own id as its vector-DB id (purge-safe); `'hash'` is 5.49 EntityDocument parity and
      unsafe with re-chunk + purge (documented).
    - **`ChunkTextStorage`** (`'mixed' | 'alwaysChunk'`, default `'alwaysChunk'`): `'alwaysChunk'`
      writes a `ContentItemChunk` row for every item and leaves `ContentItem.VectorRecordID` null;
      `'mixed'` keeps single-chunk items' text/vector on the ContentItem.
    - **`VectorMetadata`** — full structural parity with the entity pipeline's metadata control:
      `FieldStrategy: 'all' | 'include' | 'exclude' | 'explicit'` (unset ⇒ the curated content
      default, preserving historical behavior), per-field `Fields` overrides
      (`Included`/`TruncationLimit`/`StoreAs`), `DefaultTruncationLimit`,
      and `IncludeEntityIcon`/`IncludeUpdatedAt`/`IncludeTags`/`IncludeText` toggles. The runner mirrors
      the entity side's decomposition (system/icon/updatedAt/display-field helpers, StoreAs coercion,
      UUID normalization, truncation) driven off the ContentItem entity. Content-specific deviations:
      `Entity` is always kept under `'explicit'` (so results stay labeled; record id recovers from the
      vector id under the default `recordId` strategy), and `Tags` (not a ContentItem field) is a
      toggle rather than a discovered field.
  - **Chunk-Identity Contract** — chunk vectors now carry their own identity: `Entity='MJ: Content
Item Chunks'`, `RecordID=<ContentItemChunk.ID>`, `ContentItemID`, `Sequence`. The chunk row PK is
    minted up front and used as its identity (and, under `recordId`, its vector id), so a scoped
    search hit returns the matched **chunk** id (not just the parent content item id) with no
    search-side changes. Item-level ('mixed' single-chunk) vectors keep `MJ: Content Items` identity.
  - **`AutotagBaseEngine.EmbedPendingChunks(user, {maxItems})`** — (re)embeds persisted
    `ContentItemChunk` rows whose `EmbeddingStatus='Pending'`, for migration backfill and error
    recovery. Bounded per run + rate-limited; best-effort per chunk.
  - **Embedding dimensions** — the resolved infrastructure now carries `MJ: Vector Indexes.Dimensions`
    and threads it into the embedding call (new optional `Dimensions` on `AIModelRunner`'s
    `EmbeddingRunParams`, forwarded to `EmbedTexts`), so reduced-dimension indexes work in the autotag
    path and the dedup-check query embeds at the matching size.
  - **Provider routing** — the resolved infrastructure carries the parsed `VectorIndex.ProviderConfig`;
    per-record `providerTemporaryDirectives` are built via `VectorDBBase.BuildProviderDirectives`
    (e.g. Pinecone namespace from a configured source field) and `providerConfig` is passed to
    `CreateRecords`. Only invoked when the index actually has a ProviderConfig.
  - **`AutotagBaseEngine.PurgeDeletedChunks`** is now triggerable: the Autotag/Vectorize action gains
    optional **`Purge`** (Phase 4) and **`EmbedPendingChunks`** (Phase 3) params, both independent of
    Vectorize, both bounded by `MaxItems`, both best-effort.

  Behavior note: the default `ChunkTextStorage='alwaysChunk'` + `VectorIDStrategy='recordId'` means
  newly-embedded single-chunk items now get a `ContentItemChunk` row with a unique vector id instead
  of an item-level hash id. Already-embedded (`EmbeddingStatus='Complete'`) items are not reprocessed,
  so existing data is untouched until re-embedded; set `ChunkTextStorage='mixed'` per source to retain
  the item-level single-chunk behavior.

- 1afdc40: Content autotagging: persist vector-database record identifiers, and add the ContentItemChunk entity

  Vectorized Content Items previously had no back-reference to their stored vectors, and chunked items produced multiple vectors with no record of which portion of the item each represented. This adds that provenance.
  - **`ContentItem.VectorRecordID`** (new `NVARCHAR(100)` column) — the vector-database record id for an item embedded as a single vector, providing traceability from the item to its stored vector.
  - **New `ContentItemChunk` entity** — `ContentItemID` / `Sequence` / `Text` / `VectorRecordID`. When an item's text is split into multiple embedding chunks, each chunk becomes a row here, linking the stored vector back to the specific portion of the parent item. `(ContentItemID, Sequence)` is intentionally NOT unique — superseded chunks are soft-deleted (kept as tombstones) so a chunk and its replacement can share a Sequence until purged.
  - **`AutotagBaseEngine.VectorizeContentItems`** — after a successful upsert, persists the record ids: single-chunk items write `ContentItem.VectorRecordID`; multi-chunk items write ordered `ContentItemChunk` rows in a server-side transaction. For multi-chunk items the item-level `VectorRecordID` is left null — the chunk table is the source of truth. Each chunk gets a **unique, persistent per-chunk vector id** (not the old item-hash scheme) so a re-chunk's new rows never reuse a superseded chunk's vector id. Each chunk row is stamped `EmbeddingStatus='Complete'` with `LastEmbeddedAt` on creation.
  - **Re-chunking is a soft-delete + append** — re-vectorizing an item marks its current live chunks `DeleteStatus='Pending'` (rows kept) and appends the new chunks, all in one SQL transaction (no third-party call inside it). **`AutotagBaseEngine.PurgeDeletedChunks`** then removes the superseded chunks' vectors from the vector database (`vectorDB.DeleteRecords`, bounded sub-batches + rate-limited) and flips them to `DeleteStatus='Deleted'` with `LastDeletedAt` — delete-vector-first so a mid-run failure stays retryable, and out-of-band from vectorization so the remote deletes can be batched to each provider's limits.
  - **`ContentItem` also gains** a self-referencing `ParentID` (nullable FK, enabling a content-item hierarchy) and a nullable `DisplayLink` (`NVARCHAR(2000)`, a display/clickable URL).
  - **`ContentItemChunk` also gains** status-lifecycle + tracking fields mirroring the `ContentItem` pattern: `EmbeddingStatus` / `TaggingStatus` (NOT NULL, default `Pending`; value list = ContentItem's plus `Active` and `Processed`), a nullable `DeleteStatus` (`Pending` / `Deleted`), and `LastEmbeddedAt` / `LastTaggedAt` / `LastDeletedAt` timestamps.
  - **Standalone vectorization** (`@memberjunction/actions-content-autotag`) — the Autotag/Vectorize action now runs vectorization whenever `Vectorize=1`, decoupled from whether autotagging produced new items, so `Autotag=0, Vectorize=1` embeds pending content without re-tagging or `ForceReprocess`. `RunDirectVectorization` selects only items awaiting embedding (`EmbeddingStatus='Pending'`) and honors the `ContentSourceIDs` filter; `ForceReprocess` re-embeds everything.
  - **Re-embed on change** — when a content item is (re)tagged because its content changed, `AutotagBaseEngine` resets its `EmbeddingStatus` to `Pending` as tagging begins, so the vectorization phase picks it up and re-embeds it.

  Additive only; existing vectorization behavior is unchanged when items fit in a single chunk.

### Patch Changes

- 938ae80: Fix collection sharing end-to-end: run the share-create authorization gate against the entity's provider with the caller as contextUser (it previously rejected every share server-side), surface the real block reason instead of "Unknown error creating record", open shared collections from the Sharing Center via the Collections nav item, and polish the shared-indicator UI (badge sizing/styling, Shared chip, owner name resolution and truncation). Includes share-affordance gating for legacy null-OwnerID collections and regression tests for the create gate.
- 623dfc5: Break CodeGen FK cycle between AIAgentRun, AIPromptRun, and ConversationDetail. Move SummaryPromptRunID from ConversationDetail to a new ConversationCompactionRun audit table. Remove AgentRunID from AIPromptRun (derivable via AIAgentRunStep.TargetLogID). Remove agentRunId from AIPromptParams and all write sites across the prompt/agent stack.
- 8ce3356: Follow-up polish for #3275 (resolves #3287) — no behavior change:
  - **Export the vector-config interfaces** from `@memberjunction/content-autotagging` with TSDoc
    (`ResolvedVectorInfrastructure`, `ResolvedVectorStorageConfig`, `EmbeddingChunk`, `PersistedChunk`,
    `ChunkPurgeStats`, `ChunkEmbedStats`, and the `VectorIDStrategy` / `ChunkTextStorage` /
    `VectorMetadataConfig` / `VectorMetadataFieldConfig` aliases) so downstream consumers can reason
    about resolved vector infrastructure.
  - **`AutotagBaseEngine` chunk-record shaping is now subclass-overridable**: the per-chunk record
    construction is extracted into a new `protected buildVectorRecord(...)`, and `buildVectorRecords`
    plus its collaborators (`resolveChunkVectorId`, `buildVectorMetadata`, `buildProviderDirectives`,
    `resolveItemVectorStorageConfig`, `isItemLevelVector`) are now `protected` with TSDoc.
  - **O(1) by-id lookups in `KnowledgeHubMetadataEngine`**: `GetContentSourceByID`,
    `GetContentTypeByID`, `GetContentSourceTypeByID`, `GetContentFileTypeByID` (plus the existing
    `GetVectorIndexByID` / `GetEntityDocumentByID`) are now backed by lazily-built id indexes that
    self-invalidate on the engine's `DataChange$`. `AutotagBaseEngine` now routes its by-id lookups
    through these helpers instead of repeated `.find()` scans.

- ce6374c: Artifact engine no longer bulk-loads versions at boot; cache guarded.
- 764d6f6: Fix three client-reported issues (search coverage, Configure App dialog, default-app provisioning):
  - **C3 — Search coverage:** decouple the per-entity fetch depth from the global `topK` budget in both `EntitySearchProvider` and `FullTextSearchProvider` (new tunable `PerEntityFetchDepth`, default 15), so multi-entity searches no longer starve individual entities of results. Also lower `MIN_TERM_LENGTH` from 3 to 2 across the engine and both providers so short queries (e.g. "US", "AI") are searchable.
  - **F1 — Configure App dialog glitch:** the `[(ShowDialog)]` setter now emits `ShowDialogChange`, so the app-switcher's flag round-trips correctly; the dialog resets its app lists on open/close and reloads the user's applications on a deferred microtask (avoids `ExpressionChangedAfterItHasBeenCheckedError`). Removed the redundant double-drive in the app switcher.
  - **F2 — Default-app provisioning (`Status = 'Active'` filter):** the JWT new-user provisioning path selected default applications with `DefaultForNewUser` but **without** the `Status = 'Active'` check that the client self-heal path already applied, so an inactive app flagged `DefaultForNewUser` could be provisioned onto new users there. Both paths now use a single shared selector, `UserInfoEngine.GetDefaultApplicationsForNewUser`, which filters to Active + `DefaultForNewUser` in `DefaultSequence` order — eliminating the drift.

- 0ba33b3: Client-issue batch fixes. Exports (Query viewer, Data Explorer, and User Views) now cover the FULL result set — capped at 100k with an over-cap warning — instead of just the on-screen page, and the Data Explorer toolbar Export button opens a unified Excel/CSV/JSON dialog for every view type (Grid/Cards/Map/Timeline). UI-role users can now create and manage Lists, with owner-scoped delete (or Developer/Integration) enforced server-side on BOTH Lists and List Details — a List Detail's authorization is scoped through its parent List's owner, so a user can't delete membership rows of lists they don't own. Also: grid quick-filter matches hidden columns, primary-key integer columns render without thousands separators, the Queries search-box icon/placeholder overlap is fixed, and the streaming thinking-tag stripper no longer leaks partial `<think>`/`</think>` tags split across chunks — and now flushes a genuine trailing tag-prefix (e.g. a response ending in `<`) at end of stream instead of dropping it.
- dd04a24: Widen the zod pin from `~3.24.4` to `^3.25.0` so it satisfies `@modelcontextprotocol/sdk`'s peer requirement (`zod ^3.25 || ^4.0`). The old tilde pin has no overlap with the SDK's peer range, which breaks strict package managers (pnpm) and MJCLI's oclif manifest generation under strict installs. zod 3.25.x keeps the classic v3 API at the root import, so this is a version-range correction with no behavior change.
- Updated dependencies [623dfc5]
- Updated dependencies [ce6374c]
- Updated dependencies [c221553]
- Updated dependencies [deb02b4]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/interactive-component-types@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- c5e4b9e: Agent conversation compaction: durable cross-turn summaries stored on the conversation (Sequence + SummaryPromptRunID, budget knobs on AIAgentType/AIAgent, Compaction run steps), conversation-history retrieval tools (getMessageBySequence, getMessagesByRange, searchConversation, summarizeRange), edit handling with OriginalMessageChanged flagging and a wired chat edit affordance, plus hardening fixes: failed message expansions now surface a reason to the model (breaks an unbounded retry loop), json5 ESM import fix restores the local JSON-repair tier, and SQLConverter no longer truncates PG column comments at escaped apostrophes.
- a8cb2b6: Explicit ClassFactory resolution failure + permission provider fault isolation (B34/B35)

  `ClassFactory.CreateInstance` has never returned `null` for an unregistered key — it falls back to
  instantiating the anchor base class — so every call site written as `if (instance) { use } else { error }`
  had a dead failure branch and silently installed a hollow base-class object.
  - **`@memberjunction/global`**: adds `TryCreateInstance` / `TryCreateInstanceAsync`, which return an
    explicit `ClassResolutionResult<T>` (`Resolved` / `Instance` / `Reason`). Bases that cannot function
    standalone opt in with `static readonly RequiresSubclass = true`: on a fallback they now throw from
    `CreateInstance` and return `{Resolved: false, Instance: null}` from `TryCreateInstance`. Bases without
    the marker keep the historical base-class fallback (e.g. `BaseEntity`) and emit a structured, once-per-key
    warning listing the registered keys for that base plus the call-site stack. `CreateInstance`,
    `CreateInstanceAsync`, and the `Try*` variants all route through one shared resolution path.
  - **`@memberjunction/core`**: `PermissionProviderBase` declares `RequiresSubclass = true` — every member is
    abstract, so a base instance is a method-less stub.
  - **`@memberjunction/core-entities`**: `PermissionEngine.instantiateProviders` uses `TryCreateInstance`, so
    an unresolvable `ProviderClassName` is now genuinely skipped instead of installing a stub as a live
    provider. The `GetAllUserPermissions` / `GetPermissionsGrantedByUser` / `GetPermissionsSharedWithUser`
    fan-outs defer each provider call into a promise body so a SYNCHRONOUS throw (a missing method) is
    isolated by `Promise.allSettled` instead of rejecting the entire aggregate for every user.

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [a9ec419]
- Updated dependencies [42a680a]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/interactive-component-types@5.49.0

## 5.48.0

### Patch Changes

- f613d0d: Unified Ctrl+K omnibar command palette + composer draft persistence.
  - **Omnibar (ng-explorer-core)**: pluggable `OmnibarProvider` ClassFactory registry powering a unified Ctrl+K palette (search, `@agent`, `#entity`, `/skills`, `>commands`, recent searches), gated by a two-layer switch — the `Shell.Omnibar.Enabled` instance config flag is the master availability switch (default ON; OFF = legacy trio for everyone), and each user opts in personally via My Profile → Command Palette (UserInfoEngine setting `mj.shell.omnibar.enabled`, default OFF, cross-device, flips live). Modal palette is summonable from within editable elements (Slack/Linear semantics). `@agent` selection lands in Chat with a one-shot `agent|agentReq` nonce instruction so URL↔tab-config sync echoes can never re-stage the pre-address or wipe an in-progress draft.
  - **Composer (ng-composer)**: public `InsertMention()` API stages a resolved mention pill programmatically (chip + trailing space + caret focus), `FocusCaretAtEnd()`, blur output, and full serialized-mention rehydration — `writeValue` re-renders `@{...}` tokens as pills via `ParseSerializedMentions`.
  - **Conversations (ng-conversations)**: `InsertAgentMention()` resolves an agent name to a pill with replace-not-stack semantics and focus re-assertion; new `ComposerDraftStore` persists in-progress drafts per conversation (plus the new-conversation composer) via `UserInfoEngine` under `mj.chat.drafts.v1` — debounced while typing, flushed on blur, cleared on send, restored (pills included) on reload across sessions/devices.
  - **core-entities**: `UserInfoEngine.SetSetting` recovers when a cached settings row was deleted out-of-band (recreates instead of failing the UPDATE).

- Updated dependencies [09e1b4b]
- Updated dependencies [c20723a]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/interactive-component-types@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/interactive-component-types@5.47.0
  - @memberjunction/ai@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Minor Changes

- ef3e802: feat(prompt-config): scope-aware prompt run-settings override (ScopedPromptConfig + resolver)

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

### Patch Changes

- 33741fc: Make `mj app` install/upgrade/uninstall resumable and idempotent. The install orchestrator now records its last-completed step (new `OpenApp.LastCompletedStep` and `OpenApp.LastCompletedStepTargetVersion` columns) so a crashed or interrupted run picks up where it left off instead of re-running already-applied steps, and mutex guards prevent concurrent install/upgrade/uninstall operations against the same app from racing each other.
- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
  - @memberjunction/core@5.46.0
  - @memberjunction/interactive-component-types@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ai@5.45.1
- @memberjunction/interactive-component-types@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Minor Changes

- f4f11fa: External Data Sources — read MJ entities and queries directly from remote systems (Snowflake, MongoDB, PostgreSQL) without replicating their data into the MJ database.

  An Entity (or Query) that carries an `ExternalDataSourceID` is proxied live to a remote system through a pluggable driver, then returned through MJ's standard typed `RunView` / `RunQuery` / `Load` APIs. Behavior is fully additive: any entity/query with a null `ExternalDataSourceID` is unchanged and never touches the new code path.
  - **`@memberjunction/core`**: new abstract `ExternalDataSourceReadRouter` — the dependency-inversion seam (`RunViewExternal` / `RunQueryExternal` / `GetCacheTTLSeconds`) that lets foundational providers reach the EDS engine via `MJGlobal.ClassFactory` without any compile-time dependency on driver SDKs or the credential subsystem. `EntityInfo` gains `ExternalDataSourceID` / `ExternalObjectName`. `LocalCacheManager.SetRunViewResult` gains an optional `ttlMs` (with read-time expiry) so external reads can be time-bounded like RunQuery already is.
  - **`@memberjunction/core-entities`**: `ReadOnlyExternalBaseEntity` — `BaseEntity` subclass whose `Save`/`Delete` reject (populating `LatestResult`); MJ is never the system of record for external data.
  - **`@memberjunction/external-data-sources`**: the server-only engine — `ExternalDataSourceReadRouterImpl` (registered for the ClassFactory), `BaseExternalDataSourceDriver` contract, and `ExternalDataSourceRouter` (per-source driver + connection-pool cache, credential resolution). `BaseExternalDataSourceDriver` now provides `withConnectionRetry` — on an auth/credential failure it evicts the cached connection (forcing a fresh credential resolve) and retries the read once, self-healing rotated/expired credentials without a process restart; each driver implements `invalidateConnection`.
  - **Drivers** — `@memberjunction/external-data-source-postgres`, `…-snowflake` (PAT auth; `snowflake-sdk` as an optional peer loaded by dynamic import to avoid AWS-SDK version skew), `…-mongodb` (SQL-`WHERE`→Mongo filter translation, document-sampling introspection). Each wraps its read operations in the auth-retry self-heal and closes the evicted connection on the failure path.
  - **`@memberjunction/generic-database-provider`**: external dispatch for `RunView`, `RunQuery`, and single-record `Load` — guarded by an `ExternalDataSourceID` null check so MJ-DB entities are untouched. Browser/Explorer reads flow through the same provider path, so they route externally transparently. External `RunQuery` results are checked against the query's declared `QueryField` metadata (case-insensitive); when a remote object's columns have drifted, a warning is logged naming the missing field(s) while the rows are still returned (non-fatal, per the plan). External reads (both `RunView` and `RunQuery`) are cached with a TTL sourced from the data source's `DefaultCacheTTLSeconds` — external data can't be event-invalidated, so it's time-bounded instead (mitigating per-query cost on warehouses); external `RunView` writes without a TTL are refused to prevent stale-forever entries. External reads also **refuse rather than silently bypass** Row-Level Security — if RLS would filter a user's rows the read is rejected with a clear error (RLS can't be enforced on a remote system; users exempt from RLS pass through), and the external single-record `Load` primary-key filter single-quote-escapes values to block SQL injection. Unsupported external RunView params (AfterKey/keyset pagination, Aggregates, a non-empty UserSearchString) now hard-fail with a clear error instead of being silently dropped — a dropped AfterKey would otherwise return the same page on every call (an infinite loop in deep-pagination jobs). External read results now run through the same row post-processing MJ-DB reads get (field decryption + datetime normalization), so an Encrypt-flagged external field no longer surfaces as ciphertext.
  - **`@memberjunction/codegen-lib`**: external-backed entities now generate to extend `ReadOnlyExternalBaseEntity` (explicit custom subclasses still take precedence), and CodeGen skips all SQL-object generation (sprocs/views/permissions/FK-indexes) for them since no MJ table exists. GraphQL Create/Update/Delete mutation resolvers are still generated (gated only by `Allow*API`, like any entity) — they route through `entity.Save()`/`.Delete()`, which `ReadOnlyExternalBaseEntity` rejects before any sproc is reached, so an attempted write **fails loudly** with the read-only reason rather than silently lacking a resolver. (No sproc is generated for these entities, but none is ever called.)

  Additional hardening: the Postgres driver now **verifies TLS server certificates by default** (`sslRejectUnauthorized`, opt-out only for knowingly-accepted self-signed dev endpoints) instead of silently accepting any certificate; an unbounded external `RunView` (no `MaxRows`) is capped to the entity's `UserViewMaxRows` or a 1000-row default so a single read can't pull an entire remote table; caller-supplied `ExtraFilter` / `OrderBy` clauses are screened for forbidden SQL keywords before reaching the driver (the same screen the MJ-DB path applies); and a saved **UserView** over an external entity now has its stored `WhereClause` / `OrderByClause` folded into the remote read (previously the external dispatch returned before they were applied, so a view silently returned unfiltered, unordered rows).

  Dispatch-completeness fixes (an audit found read paths that bypassed external routing): CodeGen's PostgreSQL phased executor now skips external entities (it previously regenerated view/CRUD DDL and would `CREATE VIEW` against a non-existent base table); datasets fail loud per-item for external-backed entities rather than querying a non-existent MJ base view; `RunViewsWithCacheCheck` routes external entities to the standard external-dispatch path instead of issuing MJ-DB `COUNT/MAX` validation SQL; and external saved queries skip the outer `RunQuery` `CacheLocal` layer so only the TTL-correct `runExternalQueryWithCache` caches them. Two further validation tightenings: a saved view's merged `WhereClause`/`OrderByClause` is now re-screened for forbidden SQL keywords before reaching the driver, and non-quoted (numeric/boolean) primary-key values in the external `Load` filter are type-checked to block unquoted injection. Read-only is also enforced at the **provider layer** — `DatabaseProviderBase.Save`/`Delete` refuse any external-data-source entity regardless of its generated base class (a backstop for the edge case where an explicit custom subclass replaces `ReadOnlyExternalBaseEntity`). And the SQL drivers are **secure-by-default on transport**: Postgres/MongoDB refuse a plaintext connection to a non-local host unless TLS is enabled or `allowInsecureTransport: true` is explicitly set (local hosts stay exempt for dev).

  The starter `ExternalDataSourceType` catalog now seeds **PostgreSQL, Snowflake, and MongoDB** (all `Active` — the shipped drivers), and a developer guide ships at `guides/EXTERNAL_DATA_SOURCES_GUIDE.md`.

  Two new metadata tables (`ExternalDataSource`, `ExternalDataSourceType`) and additive `Entity` / `Query` columns ship in migration `v5.42`. Validated live end-to-end against real Snowflake and MongoDB. SQL Server as an external source is a deliberate fast-follow. Comprehensive unit tests across the engine, drivers, and CodeGen, plus CI-runnable Postgres/MongoDB driver integration suites.

- 6125dcd: Skill activation governance & observability (v5.45): double activation gate (AISkill.ActivationMode × AIAgent.SkillActivationMode, both defaulting to RequestedOnly — self-activation requires Auto×Auto; /skill user requests unaffected) via new GetAutoActivatableSkillsForAgent; AIAgent.RequirePlanMode forces plan mode on every root run; AIAgentRun.PlanMode stamps plan-mode runs; plan-mode runs block skill activations after approval (re-plan required); AIAgentRunStep.Skills JSON records per-step AgentSkillInvocation provenance (activation type, gate values, agent-stated reason) on Skill/Prompt/Actions/Sub-Agent steps with native-grant precedence; agent-run UX gains a Plan Mode header chip, Skill/Plan step icons, per-step skill chips, and a Skills drill-in tab with provenance cards.
- c1f2d3d: User Routines (P1.5): user-owned scheduled/monitoring routines that run an Agent, Action, or Prompt on a cron schedule. New UserRoutine/UserRoutineRecipient/UserRoutineRun schema; UserRoutineDispatcherDriver scheduled-job driver (1-minute sweep, claim-before-run, bounded concurrency, per-routine isolation, runs as the owner, Template-driven notifications with OnChange result-hash detection, RequestedSkillIDs pre-arming for Agent targets); pure UserRoutineProcessor schedule/notify primitives shared with MJUserRoutineEntityServer (NextRunAt on save, cron validation) and MJUserRoutineRecipientEntityServer (User-xor-Email); lazy non-startup UserRoutineEngine; new @memberjunction/ng-user-routines widget set (list/editor/history + command-center composite + slide-in, cancelable Before/After events, Agent-only creation with categorical ng-trees picker); conversations bottom-sidebar Routines section gated by ShowRoutines input AND entity-Read permission (hosted in both the generic workspace sidebar and Explorer's Chat wrapper); Routines Explorer app; pure cron preset/describe helpers now in @memberjunction/global (CronUtils); mj-tree gains a DefaultExpansion input ('first-level' | 'all' | 'none'); BaseScheduledJob gains IsHighFrequencyByDesign so by-design pollers (the routine dispatcher) opt out of the high-frequency cron warning; Agent-target routines run inside a dedicated per-routine Conversation (Application-scoped via the Routines app so it stays out of the default chat list; RunAgentInConversation writes proper user/assistant turns; standalone fallback when the app is absent); UserRoutine.ConversationID schema + open-conversation and open-execution-record event chains through the conversations hosts; server-side cascade delete (recipients + run bookkeeping) so routines that have run delete cleanly; agent picker is a compact mj-tree-dropdown (DefaultExpansion pass-through added); mj-slide-panel settles to transform:none when open so position:fixed descendants (dropdown panels) keep true viewport coordinates; time-relative sidebar/card/history text is snapshot-based (NG0100 fix); 16-test live integration suite + live Playwright E2E; Explorer notifications page rebuilt (day-grouped cards, sanitized HTML + Markdown message rendering with expand/collapse previews, snapshot relative times, removal of a test harness that created junk Conversations on Mark-All-Read) and the seeded routine notification template gains a compact Markdown Text body that the dispatcher now prefers for in-app delivery (the HTML document stays for email); new @memberjunction/ng-composer package extracts the conversations message composer (mention editor + dropdown + message input box) so the routine editor's InitialMessage field uses the mention editor without an ng-conversations dependency cycle — and the composer's mention/command triggers are PLUGGABLE: a generic ComposerTriggerProvider contract (TriggerChar/Key/Priority/GetSuggestions, generic MentionSuggestion with provider-supplied presets) with two supply modes (explicit [TriggerProviders] list, or ClassFactory discovery via @RegisterClass(ComposerTriggerProvider,'<key>') filtered by [ExcludedTriggerKeys]), leaving ng-composer with ZERO AI knowledge; the AI plugins moved to ng-conversations (composer-plugins: 'agent-mentions' '@' agents+users w/ configuration presets, 'record-mentions' '#' entities+queries, 'skill-commands' '/' skills — tree-shake-guarded by LoadComposerPlugins(); MentionAutocompleteService moved back to ng-conversations as a BaseSingleton engine shared by plugins and components) plus a new mj-ai-composer wrapped component that proxies the full mj-message-input-box surface with the AI triggers built in and familiar EnableAgentMentions/EnableEntityMentions/EnableSkillCommands convenience flags (the chat composer now uses it); the routine editor uses discovery mode with agent-mentions excluded.

### Patch Changes

- fbee64c: Fix intermittent stale installed-apps state in the Home dashboard and app switcher. BaseEngine's entity-event skip-guards previously dropped the observer notification along with the redundant refresh whenever an event's changes were already reflected in an engine array (in-place save of a cached instance, manual push after create) — so UserInfoEngine's Install/Enable/Disable/UninstallApplication flows never emitted DataChange$ and ApplicationManager.applications$ went permanently stale. Skip paths now emit through the new notifyAlreadyAppliedMutation. Hardening in the same pass: the debounced pipeline buffers ALL events per window and decides refresh-vs-skip as an OR over the batch (ProcessEntityEvents — a lone in-place save can no longer mask a coalesced fresh-instance save); delete membership checks key off the event payload's pre-delete OldValues snapshot (Delete() re-keys the entity via NewRecord() before the debounced handler runs); deletes of rows absent from an array stay silent to avoid phantom delete events on filtered configs (manual-splice engine code notifies explicitly — UninstallApplication now does); transiently-failed event-triggered refreshes get a bounded, backed-off retry instead of stranding observers until an unrelated event; applyImmediateMutation's already-in-array branches gained the same DataChange$ parity. The 'MJ: User Applications' config now uses a 200ms DebounceTime (vs the 1500ms default) so app-config dialog saves reach the UI near-instantly.
- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/interactive-component-types@5.45.0
  - @memberjunction/ai@5.45.0

## 5.44.0

### Minor Changes

- 3633fbb: Agent Skills, Plan Mode, and realtime widget UX.

  **Agent Skills** — portable `SKILL.md` import/export, a first-class Skill step wired into the Loop agent runtime, Skills engine caching + agent-gating resolution, the `AI Skills` resource type with "Can Share Skills" authorization, and the AI Skill sharing panel in the entity forms. Includes the skill-markdown converter/operations and the generated entity + resolver surface for the new Skill entities.

  **Plan Mode** — a human-in-the-loop plan-approval gate for the Loop agent (server + client), threaded through the agent client session/types, the GraphQL AI client, and the conversations composer/message-input UI so a run can pause for plan review before executing.

  **Realtime voice widget UX** — fixes and consolidation in `@memberjunction/ng-conversations`:
  - Fixed `NG0100 ExpressionChangedAfterItHasBeenCheckedError` when opening the Details panel (defer the `ResizeObserver` seed + callback to a microtask).
  - The surface/Details panel is now an independent right-hand peek gated on available width (not console chrome / text-reveal), so opening Details keeps the glowing orb and toggling captions off no longer removes the panel; the orb also returns immediately on captions-off.
  - Type-to-compose: any printable keystroke opens the composer and seeds itself as the first character (removed the dedicated "T" hotkey + hint).
  - Control consolidation: the banner is now state + window-chrome only (removed duplicate Captions/End controls, folded "pure audio" into the gear's Density = Simple); Captions is promoted to a first-class control in the compact lean dock.

  **Remote Browser** — `RemoteBrowserSnapshot` now honors its documented best-effort contract: it returns an empty snapshot instead of throwing when the underlying browser adapter has been torn down, so the client's periodic live-view poll never surfaces a recurring GraphQL error (with unit coverage).

- 1367fbb: AI Skill permissions (full agent parity) + `/skill` composer invocation. Skills now use the same dedicated-table, **open-by-default** permission model as AI Agents via `MJ: AI Skill Permissions`: a cached runtime helper (`AISkillPermissionHelper`, open-by-default) and a unified-engine provider (`AISkillPermissionProvider`, closed-by-default / Sharing Center), grantee-exclusivity enforced by `MJAISkillPermissionEntityServer`, and a `GetSkillsForAgent(agent, user?)` filter so the model's skill catalog is intersected with the acting user's Run permission. The old `AI Skills` Resource-Type sharing is retired in favor of a skill-scoped permissions grid (`SkillPermissionsPanel`/`Dialog`/`Service`), with the `Can Share Skills` authorization repointed to it. End users invoke a skill for a message by typing `/skill-name` in the conversation composer (mirrors `@agent`/`#entity`; picker filtered by permission, chips use `AISkill.IconClass`/`Color`); selected IDs thread through the client → resolver → runtime chain as `ExecuteAgentParams.requestedSkillIDs` (both the `RunAIAgent` and `RunAIAgentFromConversationDetail` mutations), and `BaseAgent.preActivateRequestedSkills` activates them at run start only if they survive the guard (agent-accepted ∩ user-permitted). Requires the companion Agent Skills migration + CodeGen.
- 6f74b17: Add an LLM/agentic reasoning pass on top of the embedding/vector duplicate-detection pipeline — "vectors filter, reasoning validates". A small/fast LLM judges high-probability vector candidates (Merge / NotDuplicate / Uncertain) to shrink the human-review set, strengthening or weakening the vector score rather than replacing it. Adds a dual-provider reasoning seam (Prompt/Agent), per-entity gating (EnableLLMReasoning, ReasoningThreshold, AutomationLevel), per-candidate verdict/audit columns, the new @memberjunction/record-comparison engine + resolver/client, and an in-place reasoning UI in the duplicates dashboard. Fully back-compat: EnableLLMReasoning defaults to 0, leaving the vector-only path byte-for-byte unchanged.
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

- 2f926df: feat(prompt-parts): scope-aware, pluggable prompt construction (ScopedPromptPart + PromptComponentResolver)

  Adds a first-class, scope-aware prompt-construction primitive to MJ core. `ScopedPromptPart` is a
  small, named, role-tagged fragment of prompt text attached to an `AIPrompt` and optionally narrowed
  by the **same polymorphic scope the agent runtime already carries for memory** (`PrimaryScopeEntity`/
  `PrimaryScopeRecordID` + `SecondaryScopes`). Any MJ app can control LLM behavior per scope by editing
  rows, not code.
  - **Entity + controls:** `__mj.ScopedPromptPart` with `Name`, `Role`, `Sort`, `Text`, `Status`, the
    polymorphic scope columns, and the resolver controls `MergeBehavior` (`Override` | `Append`) and
    `Priority`. The inclusion rule is data-driven, not hardcoded.
  - **Resolution + assembly:** cached on `AIEngine` (`ScopedPromptParts`); resolved by
    `PromptComponentResolver` — a **template-method** class whose protected hooks (`getCandidates`,
    `isInScope`, `score`, `selectIncluded`, `order`) are the extension points. Within a part `Name`,
    the most-specific scope wins (`Override`) or all in-scope parts accumulate (`Append`); distinct
    names compose additively. Roles are preserved (System/User/Assistant) — assembled messages drive
    the model directly, not flattened.
  - **Pluggable:** the agent runtime obtains the resolver via
    `MJGlobal.ClassFactory.CreateInstance(PromptComponentResolver)`, so a downstream consumer can
    `@RegisterClass(PromptComponentResolver) class X extends PromptComponentResolver { … }` and override
    the protected hooks for custom inclusion/scope logic — **no core change required**.
  - **Agent wiring:** `BaseAgent` resolves + injects scoped parts (role-faithful) alongside memory/RAG,
    using the run's existing primary/secondary scopes.

  Verified by unit tests (`PromptComponentResolver`) and a full agent run demonstrating the scope cascade.

### Patch Changes

- 5396d90: Add permission-constrained engine loading to BaseEngine — pre-checks entity read permissions during Config() and skips all entity configs (all-or-nothing) when the user lacks access, preventing endless retry loops and console error flooding for org-scoped SaaS users. Engine getters now use GetConfigData() which throws a typed PermissionConstrainedError instead of silently returning empty arrays. Also fixes unsafe GetHighestPowerModel/GetHighestPowerLLM return types and resolves FK_AIAgentRunStep_ParentID race in fire-and-forget step saves.
- be5ab50: Prevent AI agent runs from bleeding into other conversations when swapping conversations early after sending: agent-lifecycle events now carry the captured ConversationID so the chat-area drops events from a backgrounded conversation, pending-message auto-send is pinned to its target conversation, intent-check start/complete are guarded symmetrically, the shared agent runner tracks in-flight runs with a refcount, and new-conversation creation no longer produces a duplicate sidebar row.
- 863a10d: Fix saved views disappearing from the view selector ("No saved views yet") once an entity has a view shared by another user. `MJUserViewEntityExtended.CalculateUserCanView()` resolved the User Views resource type by `ResourceType.Name === 'MJ: User Views'`, but the seeded name is `'User Views'` (the `'MJ: '` value lives on `.Entity`), so the lookup threw. That throw propagated out of `UserViewEngine.GetAccessibleViewsForEntity()`'s `.filter(v => v.UserCanView)`, emptying the entire list — including the current user's own views. It now resolves via `ViewResourceTypeID` (matching on `.Entity`), consistent with `UserCanEdit`/`UserCanDelete`. `CalculateUserCanView` also now honors `ContextCurrentUser` (server-side/per-request rendering) instead of always using the global current user, and `ResetCachedCanUserSettings()` clears the cached `UserCanView` result alongside edit/delete.
- Updated dependencies [5396d90]
- Updated dependencies [89ea055]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [2f9b863]
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ai@5.44.0
  - @memberjunction/interactive-component-types@5.44.0

## 5.43.0

### Minor Changes

- 9200b13: feat(open-app): connector-extraction modality — multi-app repos, in-repo subpath, teardown, and `OpenApp.Subpath`

  Adds the Open-App capabilities needed to ship vendor connectors as installable apps from a single multi-app repo (e.g. `MemberJunction/Integrations`):
  - **Multi-app repos via in-repo subpath** — `mj app install <repo>/<subpath>` resolves a per-app manifest under a subdirectory; scoped-tag version resolution (`<subpath>@<version>`) per app.
  - **`OpenApp.Subpath` column** (migration + CodeGen) persists which in-repo directory an app installed from, so upgrade/remove re-fetch the right manifest.
  - **Remove-time teardown** (`migrations.teardownDirectory`) — retires the rows an app's seed migrations wrote into the shared core schema (`__mj` Integration/IO/IOF/Action), which dropping the app's own schema cannot reach. Platform-aware (`-pg` on Postgres) + subpath-aware.
  - **Array-form `dependencies`** accepted in the manifest (normalized to a record), so apps that ship `dependencies` as an array of `{ name, repository, versionRange }` validate and install.

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ai@5.43.0
  - @memberjunction/interactive-component-types@5.43.0

## 5.42.0

### Minor Changes

- 0fa3cbc: Record Set Processing & Record Processes, plus the Remote Operations primitive.

  **Remote Operations** (`@memberjunction/core`, `@memberjunction/global`, `@memberjunction/graphql-dataprovider`, `@memberjunction/server`) — a typed, provider-routed capability the browser and server both invoke through one call site, the peer of `BaseEntity` (CRUD) and `RunView` (set reads):
  - `BaseRemotableOperation<TInput,TOutput>` with `OperationKey` / `RequiredScope` / `RequiresSystemUser` / `ExecutionMode`; `Execute()` routes per-provider, `ExecuteServer()` runs in-process and never throws on logical failure.
  - `IRemoteOperationProvider.RouteOperation` on `ProviderBase` (the documented power tool), in-process dispatch in `DatabaseProviderBase`, GraphQL marshalling in `GraphQLDataProvider`, and the single generic `ExecuteRemoteOperation` resolver that composes the existing API-key-scope + user-permission auth chain.
  - Genericized value-mapping resolver in `@memberjunction/global` (`getValueAtPath` / `resolveMappingRef` / `resolveValueMapping`) — one canonical mapping engine over pluggable named sources.

  **Record Set Processing substrate** (`@memberjunction/record-set-processor-base`, `@memberjunction/record-set-processor`) — a hardened iterate-a-record-set-and-do-work engine with three pluggable seams (source / processor / run-tracker): batching, bounded concurrency, rate limiting, circuit breaker, checkpoint/resume, and pause/cancel. Ships Array/View/List/Filter/Keyset sources; Action / Agent / Infer record processors; a uniform `WriteBackProcessor` that applies an `OutputMapping` (fields / child record) to any work type; the `RecordProcessExecutor` facade (Scope→source, Work→processor); and the `RecordProcess.RunNow` / `GetRunStatus` / `Pause` / `Resume` / `Cancel` control operations.

  **Record Processes facade** (`@memberjunction/core-entities`, `@memberjunction/core-entities-server`, `@memberjunction/scheduling-engine`, `@memberjunction/actions`) — the `MJ: Record Processes` definition (Work × Scope × Trigger) plus generic `MJ: Process Runs` / `Process Run Details` tracking and the `MJ: Remote Operations` registry. `MJRecordProcessEntityServer` reconciles the owned recurrence Scheduled Job on save; `RecordProcessScheduledJobDriver` runs a process on its cron schedule and links each `ProcessRun` back to its `ScheduledJobRun`; the Entity Action `GetRecordList` View/List fan-out backs scoped iteration.

### Patch Changes

- 6d970cd: Runtime SQL dialect correctness on PostgreSQL:
  - **scheduling-engine**: PostgreSQL-correct heartbeat lease extension — affected-rowcount handling +
    mixed-case column quoting in `spExtendScheduledJobLease`, with a PG-only migration. _(migration → minor)_
  - **postgresql-dataprovider** + call-sites (archiving-engine, core-entities, ng-dashboards,
    ng-entity-communications): translate T-SQL date functions (`GETDATE()`, `DATEADD`, etc.) in
    runtime SQL clauses to PostgreSQL equivalents. _(code → patch)_

- da5a3dd: Group conversations into collapsible, nestable folders (backed by MJ: Projects) and make the Collections view's artifact organization fluid — drag-and-drop, frictionless multi-select, bulk move, a staging shelf, a navigator pane, and a right-click "Open source conversation". Also fixes stale-cache reads after moves/deletes (BypassCache), conversation-folder delete not refreshing, and cached-tab navigation that opened the Conversations app without selecting the conversation.
- Updated dependencies [9b9b484]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
  - @memberjunction/core@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/interactive-component-types@5.42.0
  - @memberjunction/ai@5.42.0

## 5.41.0

### Minor Changes

- 8fd6f59: Realtime Bridges (Phase 0+1): new media-transport layer that connects the one realtime agent engine to external endpoints — meetings (Zoom/Teams/Slack/Meet/Webex/Discord) and telephony (Twilio/Vonage/RingCentral/VOIP). Adds the v5.42 schema (5 entities: AIBridgeProvider with a strongly-typed SupportedFeatures JSON column, AIBridgeAgentIdentity, AIBridgeProviderChannel, AIAgentSessionBridge, AIAgentSessionBridgeParticipant — the bridge is an attachment to the existing AIAgentSession, not a new session). New packages @memberjunction/ai-bridge-base (BaseRealtimeBridge media driver with capability gating, AIBridgeEngineBase cache, pure passive/active/hybrid TurnTakingPolicy) and @memberjunction/ai-bridge-server (AIBridgeEngine completing the deferred server-bridged transport seam — bridge media ↔ IRealtimeSession.SendInput/OnOutput — plus a LoopbackBridge, host affinity and janitor). Five server-side EntityServer validation invariants. Nothing is audio-specific (typed directional audio/video/screen tracks).
- 2e48d1a: Add heartbeat-based lease renewal to the scheduled job engine (#2749): running jobs can opt in via context.heartbeat() to keep their concurrency slot alive (atomic, token-checked spExtendScheduledJobLease), with a new ScheduledJob.MaxRuntimeMinutes override for single-long-call jobs that can't beat mid-flight.
- cd6c5f0: Realtime AI Agents wave 3: consolidated v5.41 migration (sessions, channels, co-agent schema) with the AIAgentCoAgent affinity registry replacing AIAgentPairedAgent — typed relationship vocabulary (CoAgent implemented; Peer/Delegate/Fallback/Reviewer/Observer reserved), type-level co-agent defaults as junction rows (removing the only FK cycle in core MJ), and the full code sweep (engine cache, resolver resolution chain, server-side invariants, client pairing reads, regenerated manifests). Realtime UX: progressive-disclosure voice console with persisted captions preference, user-owned composer and tabs toggles, audio-reactive visuals; whiteboard pages/multi-select and review-persistence fixes. Gemini Live triggering turns ride realtime text so widget clicks/typed input/narration speak immediately on native-audio models. CodeGen: single-winner IsNameField enforcement with eligibility guardrail fixes, SCC-based cycle diagnostics, and clean-database bootstrap robustness (conditional engine registry datasets).
- a5f5472: Remote Browser channel + new realtime voice providers + computer-use enrichment.
  - **Remote Browser channel** (`@memberjunction/remote-browser-*`): an in-house realtime channel where an agent drives a live, CDP-connected browser while it talks (sales demos, support walkthroughs, trainer agents). New `AIRemoteBrowserProvider` registry (migration V202606161000) with JSONType capability gating; a universal `remote-browser-base` (driver family + `RemoteBrowserEngineBase`), a shared `remote-browser-cdp` kit (one lossless action mapper + `CdpRemoteBrowserSession`), a `remote-browser-server` engine + `RemoteBrowserChannel` (control arbiter, control modes AgentOnly/ViewOnly/Collaborative vs strategies ComputerUse/NativeAI), and five thin backends (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).
  - **computer-use** enriched additively into a complete browser-I/O + perception engine: CSS-selector-aware actions, CDP screencast, MouseMove, accessibility-snapshot/QueryElement/GetVisibleText/GetTitle/WaitForLoadState — every consumer benefits, existing vision/coordinate path unchanged.
  - **New realtime model providers**: xAI Grok Voice (`@memberjunction/ai-xai`, OpenAI-Realtime-compatible) and Inworld (`@memberjunction/ai-inworld`), with vendor/model seeds.
  - **Console logging improvements** across `@memberjunction/ai-core-plus`, `ai-engine-base`, `ai-prompts`, `aiengine`, `cli`, `generic-database-provider`, `metadata-sync`, and the bootstrap/forms packages.

### Patch Changes

- 659ee5b: Realtime co-agent pairing & type configuration. New `MJ: AI Agent Paired Agents` junction (opt-in: a co-agent with zero rows stays universal — today's zero-config default unchanged; rows restrict + prebuild its target list with an IsDefault preselection), `AIAgent.TypeConfiguration` (agent-type-specific JSON: realtime model preference, per-provider voice, tone/speaking style, override policy, narration pacing), and `AIAgentType.ConfigSchema`/`DefaultConfiguration` (the type publishes a JSON Schema + type-level defaults; effective config = type defaults <- agent config <- runtime overrides, deep-merged per key, server-authoritative). Runtime overrides ride a new `configOverridesJson` session-start argument gated by the seeded `Realtime: Advanced Session Controls` authorization (Developer-mapped) — enforced server-side, disclosed client-side (unauthorized users silently get defaults). ValidateAsync server subclasses enforce ConfigSchema conformance, Realtime-type co-agents, and at-most-one-default-per-co-agent. Conversations UX: co-agent picker for everyone with more than one permitted co-agent (persisted via UserInfoEngine), pairing-constrained target selection, authorization-gated model/config override pickers.
- cc604aa: Agent in-flight memory writes: agents can commit durable cross-run memories mid-run via the memoryWrites loop-response field, gated by AIAgent.AllowMemoryWrite (ON by default — opt out per agent). Writes land as immediately-injectable Provisional agent notes (new Status value, with AuthorType provenance) under framework-enforced guards (descriptive types only, scope clamp, exact-restatement dedupe with same-run supersede, per-run cap, TTL), inject with recency-wins precedence and per-note recorded dates, and are hardened or pruned by a new Memory Manager pass each cycle. Cross-run dedupe requires exact normalized restatement so corrections are never silently absorbed into a stale note; the loop-agent prompt instructs agents not to claim a memory was saved before its result message arrives.
- 15b743b: Real-Time AI Agents — Sessions, Channels & the Realtime Model (plans/ai-agent-sessions.md). Adds the AIAgentSession/AIAgentChannel/AIAgentSessionChannel schema (+ AgentSessionID on AIAgentRun/ConversationDetail, CloseReason on AIAgentSession); the BaseRealtimeModel server primitive with OpenAIRealtime + GeminiRealtime drivers (server-bridged StartSession and client-direct ephemeral-token CreateClientSession, optional SendContextNote/RequestSpokenUpdate interim updates); the new @memberjunction/ai-realtime-client package with the BaseRealtimeClient browser abstraction + OpenAI/Gemini client drivers resolved via ClassFactory by provider key; the Realtime agent type + Voice Co-Agent with RealtimeSessionRunner/RealtimeToolBroker, AgentMemoryContextBuilder extraction, server session lifecycle (SessionManager, SessionJanitor, start/close/heartbeat + client-direct resolvers with delegated-run progress streaming, AwaitingFeedback resume, co-agent observability runs, user-selectable realtime model); the full-panel realtime voice call UX in ng-conversations (phone trigger + agent/model picker, banner/thread/activity rail, delegation working/result cards with provenance, ephemeral paced first-person progress narration driven by DB prompt templates, in-call text composer); Realtime Voice admin (AI Analytics dashboard sections, session/channel custom forms, agent Runs|Sessions execution history); and Query Builder/Strategist reliability fixes (entity catalog in prompt, Get Entity Details sample caps + semantic fallback, plan formatting). Also: the standalone @memberjunction/ng-whiteboard package (collaborative board with agent tool API, sandboxed interactive widgets + input bridge, markdown panels, exports, cancelable before/after events); ElevenLabs Agents + AssemblyAI Voice Agent realtime provider pairs (4-provider matrix, zero contract changes); session review mode with multi-leg resume carryover (timeline dividers, artifact junction closure, prior-transcript model hydration); delegation cancel channel; usage telemetry relay; Realtime Co-Agent rename with run-step/prompt-run observability.
- Updated dependencies [8fd6f59]
- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
  - @memberjunction/core@5.41.0
  - @memberjunction/ai@5.41.0
  - @memberjunction/interactive-component-types@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai@5.40.2
- @memberjunction/interactive-component-types@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/interactive-component-types@5.40.1
  - @memberjunction/ai@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Minor Changes

- 43e6c0f: MJ-issued magic-link sessions for external, app-scoped users: passwordless, single-use (or multi-use) invite links that sign external users into MJExplorer confined to one application and a per-link role. MJ issues and validates its own RS256 session tokens (published via JWKS, accepted by the standard auth-provider path), so there's no external IdP dependency or per-user IdP cost. Invite scope (app, role, expiry, max uses) is configured per link, with support for per-invite app/role, resource-scoped RLS sharing, and anonymous sessions — a shared Anonymous principal whose scope rides per-session JWT claims rather than DB roles, so concurrent anonymous visitors can't accrete privileges.

  Also includes two framework changes made along the way:
  - **RunView server-cache RLS fix:** the cache fingerprint now incorporates the per-user Row-Level-Security where-clause, so an RLS-scoped read can no longer be served an unscoped cached result. No-op for users without an RLS filter (byte-identical fingerprint), so normal caching is untouched.
  - **BaseEngine degrades gracefully under restricted roles:** a config load that fails because the current user lacks Read permission is now treated as a permanent condition — the property loads empty and the engine is marked loaded — instead of looping on "not marking as loaded", which previously hung the MJExplorer shell for least-privilege users (e.g. magic-link guests). Only genuinely transient failures (network, server restart) keep retrying.

- 253a188: Knowledge Hub Classify redesign
  - **Clustering**: new `@memberjunction/clustering-engine` (framework-agnostic fetch → cluster → reduce → LLM-name pipeline), a "Run Cluster Analysis" action, a `RunClusterAnalysis` GraphQL resolver, a `GraphQLClusterClient` transport, and the Angular `ClusteringService` thinned to delegate to the server.
  - **View-type plug-in architecture (entity viewer)**: `ViewType` registry + `ViewTypeEngine` + `IViewTypeDescriptor`/`IViewRenderer`/`IViewPropSheet` contracts in `ng-entity-viewer`, with Grid/Cards/Timeline/Map descriptors. The host now **dynamic-mounts** any registered plug-in view type (via `ViewContainerRef`) with zero host changes, and the switcher shows the active type's icon + label, collapsing from an icon strip to a dropdown as the list grows. **Cluster view type** added in `@memberjunction/ng-clustering` (descriptor + `IViewRenderer` wrapper over the scatter + `IViewPropSheet` + an Entity-Document availability engine) — available on any entity with vectors, reusing the same `ClusteringService`. The active view type persists to `UserView.ViewTypeID` (new source of truth; backfilled from the legacy `DisplayState.defaultMode`) and per-view-type config to `UserView.DisplayState.viewTypeConfigs` (new typed `IViewTypeConfigEntry`). `ViewType.Icon` is now `ExtendedType='Icon'` for the admin icon picker. See `packages/Angular/Generic/entity-viewer/VIEW_TYPE_PLUGINS.md`.
  - **Classify UX**: per-tab scroll fix, Refresh buttons, meaningful content-item display names, loading states, `BaseEntityEvent` reactivity, and load-more pagination.
  - **Audit & analytics**: direct tag→prompt-run lineage (`AIPromptRunID` + `Reasoning` on Content Item Tags), `ClassifyAnalyticsEngine`, reusable item grid + drilldown, and an Overview analytics section.
  - **Setup & onboarding**: contextual prompt injection (org/content-type/source aggregation), `generateSeedTaxonomy` (clustering-backed) + resolver, source-form domain-context UI, org-context editor, inline Entity Document creation, seed-taxonomy review, and a guided setup wizard.
  - **Visualize surface**: Knowledge Hub "Clusters" tab generalized to a "Visualize" host with Clusters / Tag Cloud modes, a `TagCloudEngine`, and a shared record drilldown.
  - **Foundations**: `ApplicationSettingEngine` (global + app-scoped settings), and the `tag-engine` → `tag-engine-base` split so browser code no longer pulls server-only AI dependencies.
  - **Fix**: stop server-only packages (`templates` → `aiengine`/`ai-provider-bundle`, storage, vector-DB and LLM provider SDKs) from leaking into the browser class-registration manifest, which previously broke the MJExplorer cold build. Added CLAUDE.md guardrails to the Bootstrap and BootstrapLite packages.

### Patch Changes

- 804f9f6: Security audit fixes: parameterize SQL queries in GraphQL resolvers to prevent injection, validate entity read permissions on query execution, centralize permission logic in UserCanRun with recursive dependency checks, and fix UUID/multi-provider compliance violations.
- 73bb233: Add KeyPrefix column to APIKey table for visual key identification. Stores the configured prefix plus 4 characters of the random body (e.g., "mj_sk_a1b2") at creation time so administrators can differentiate API keys without exposing the full key.
- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
  - @memberjunction/core@5.40.0
  - @memberjunction/interactive-component-types@5.40.0
  - @memberjunction/ai@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Minor Changes

- db4addf: feat(integration): Integration Framework Expansion — schema + metadata-driven CRUD base class, generated layer, cross-dialect hardening, and field-mapping cache

  End-to-end increment expanding the integration framework: new per-operation write metadata on the schema, a generic metadata-driven CRUD base class, the regenerated entity/GraphQL/form layers that expose it, plus the cross-dialect (PostgreSQL + SQL Server) bug fixes and a field-mapping performance cache found while proving it live.

  **Schema (v5.39.x migration)**
  - `IntegrationObject`: explicit per-operation write columns — `CreateAPIPath`/`Method`/`BodyShape`/`BodyKey`/`IDLocation`, `UpdateAPIPath`/`Method`/`BodyShape`/`BodyKey`/`IDLocation`, `DeleteAPIPath`/`DeleteIDLocation`. The legacy `WriteAPIPath`/`WriteMethod` are kept one release as deprecated aliases.
  - `IntegrationObject`: `IncrementalWatermarkField` — vendor cursor/timestamp field name driving the incremental sync filter.
  - `IntegrationObject` + `IntegrationObjectField`: `MetadataSource` enum `{Declared, Discovered, Custom}` — provenance for merge precedence in `IntegrationSchemaSync`.

  All schema changes are additive (new nullable fields + a new enum field) — no existing field is removed, renamed, or narrowed — so the bumps are **minor**.

  **Engine / base class (`@memberjunction/integration-engine`)**
  - `ExternalFieldSchema`: add `IsPrimaryKey` (distinct from `IsUniqueKey`). Fixes an `IntrospectSchema` bug where `IsPrimaryKey` was incorrectly mapped from `IsUniqueKey` — an object can have multiple unique fields but only one primary key.
  - `BaseRESTIntegrationConnector`: new `TransformRecord` hook — optional per-record customization seam between `NormalizeResponse` and `ToExternalRecord` (default identity); override for vendor-specific record-level shape changes.
  - `BaseRESTIntegrationConnector`: generic metadata-driven CRUD — `CreateRecord`/`UpdateRecord`/`DeleteRecord`/`GetRecord` read the per-operation columns and execute generically. Concrete connectors override only when an API is genuinely idiosyncratic. Replaces the hand-rolled write logic previously duplicated across every concrete connector.
  - `FieldMappingEngine`: cache compiled `custom`-transform expressions instead of recompiling `new Function` once per field per record. A batch of N records sharing an expression compiles it once and executes the cached function N times, dropping per-record cost from `O(compile + execute)` to `O(execute)`. The cache stores a typed `CompiledExpression = (value, fields) => unknown` (no weak typing), caches compile failures too (a malformed expression is compiled once and the resulting `Error` re-thrown from cache per record, leaving `OnError` `Fail`/`Null`/`Skip` semantics unchanged), and is bounded by `MJLruCache` (1000-entry default) since the owning `IntegrationEngine` is a process-lifetime singleton.

  **Generated layer (CodeGen for the v5.39.x migration)**
  - `@memberjunction/core-entities` — `IntegrationObjectEntity` / `IntegrationObjectFieldEntity` gain strongly-typed accessors for the per-operation write columns, `IncrementalWatermarkField`, and the `MetadataSource` enum (`'Declared' | 'Discovered' | 'Custom'`).
  - `@memberjunction/server` — regenerated resolvers / GraphQL types expose the new fields.
  - `@memberjunction/ng-core-entity-forms` — regenerated `MJ: Integration Objects` / `MJ: Integration Object Fields` forms render the new fields.

  **Cross-dialect hardening (PostgreSQL + SQL Server)**

  Bugs found and fixed while proving the framework end-to-end on both dialects with live generated actions:
  - `@memberjunction/codegen-lib` — PostgreSQL CRUD generation emitted the primary-key column twice for composite-PK entities, so association/junction tables never synced on PG; `PostgreSQLCodeGenProvider` now treats a multi-column PK as strategy-handled. Soft-PK/FK application uses dialect-aware identifier quoting and boolean literals (`this.dialect.QuoteIdentifier` / `BooleanLiteral`) so the pass runs correctly on PostgreSQL.
  - `@memberjunction/server` — wired the PostgreSQL branch of the in-process CodeGen runner (`RuntimeSchemaManager.SetCodeGenRunner`) that previously existed only for SQL Server, so runtime schema sync no longer falls back to a hang-prone child process on PG. `IntegrationDiscoveryResolver` entity/field-map creation is now create-or-reuse (idempotent on re-apply), and its idempotency + operational list reads use `BypassCache` so create-vs-update decisions read committed state.
  - `@memberjunction/integration-engine` — `MatchEngine.FindRecordMapEntry` and the bulk record-map load now read committed state (`BypassCache`), fixing duplicate-create after a direct-DB change; watermark save/load is idempotent to avoid a transaction-abort on retry. `LoadRunConfiguration` and every remaining operational decision-read — the upsert-by-identity record-map lookup, field-maps, the full-vs-incremental gate, write-back external-id lookup, orphan-sweep, and orphaned-run resume — now also `BypassCache`. This closes a Postgres-only gap where a freshly-toggled entity-map `Configuration` (e.g. enabling partition/Merkle reconcile) was read stale → the ChangeToken rollup was silently never written on PG, and removes the broader read-stale-then-decide bug class so the read-your-own-writes pipeline always decides from committed state on both dialects.
  - `@memberjunction/core-actions` — the generated integration-action executor used stale entity names (`'Integrations'`, `'Company Integrations'`); corrected to `'MJ: Integrations'` / `'MJ: Company Integrations'` so `List`/`Get` invoke successfully.
  - `@memberjunction/core-entities-server` — declares its previously-undeclared `@memberjunction/integration-pk-classifier` dependency (used by the server-side LLM PK-detection callback), fixing the missing-dependency check; covers the integration server-entity behavior (`MJCompanyIntegrationEntityServer`, `IntegrationLLMPKCallback`).
  - Multi-provider safety — the post-pipeline metadata `Refresh()` calls in `IntegrationDiscoveryResolver` and `MJCompanyIntegrationEntityServer` now refresh the request's own provider (`provider ?? new Metadata()`) instead of the global default, satisfying the `MultiProviderCompliance` gate and refreshing the correct cache under a non-default provider.
  - Dialect layer (`@memberjunction/sql-dialect`) — statement splitting for runtime schema migrations is now a dialect concern: `SplitStatements` (naive `;`-split on the base, dollar-quote-aware override on PostgreSQL so `DO $$…$$` blocks stay intact) instead of living in the schema-engine runtime.

- 0f9acba: feat(knowledge-hub): Classify sub-app decomposition + new classification features

  Decompose the Classify (content autotagging) dashboard from a single ~5,150-line component into a thin host shell plus 6 self-contained tab sub-page components and 4 dialog components, with a shared pure helper layer. Cacheable metadata reuses the existing `KnowledgeHubMetadataEngine` / `TagEngineBase` / `AIEngineBase`; high-volume rows stay on `RunView`.

  Surfaces backend capabilities that previously had no UI:
  - **Suggestions Inbox** — human-in-the-loop review queue over `MJ: Tag Suggestions` (approve / merge / reject).
  - **Tag Health** — real merge-candidate / low-usage / wide-node signals, replacing the prior heuristic.
  - **Governance / Synonyms / Scope** editors on the Taxonomy tag panel (typed `MJTag` flags, synonym approval workflow, tag scope).
  - **Config parity** — full `IContentSourceConfiguration` (taxonomy mode, thresholds, tag root, budgets, toggles, effective-values) inline in the source form, which is now sectioned and a resizable, width-remembering slide-in.
  - **Dry-run preview** — in-memory disposition preview of a source's tags under its current mode + thresholds (no LLM call, nothing persisted).

  Adds `TagSynonym.Status` (`Active`/`Pending`/`Rejected`, default `Active`) for the synonym approval workflow — additive and backward-compatible — with the regenerated entity, server, and form code. `ng-bootstrap`'s class manifest + allow-list pick up `TagEngineBase`.

- 1b0f355: Loop agent prompt improvements for cache optimization. Capture cache-read and cache-write token counts from every LLM provider that reports them (Anthropic, OpenAI, Gemini, Groq, Cerebras, Fireworks, Azure, Bedrock) and surface them on AI Prompt Runs and Agent Runs. Adds `CacheReadTokens`/`CacheWriteTokens` columns to `AIPromptRun` (migration included — run CodeGen after applying), normalizes cache-token accounting in `baseModel` so usage totals are consistent across providers, and enables Gemini implicit/explicit cache reporting. The Prompt Run form and Agent Run analytics now display cache hit/write token breakdown
- 34fe6d1: Capture and surface AI prompt-cache cost across providers — OpenRouter provider-reported cost passthrough; per-model cache read/write pricing on AI Model Costs with cache-aware cost calculation; cache-token rollups on AI Prompt Runs and Agent Runs; and cache hit-rate + dollar-savings analytics across the AI dashboards (Cost & Budget, Model Performance, Prompt Runs, Usage Patterns, Executive Summary) and the prompt-run / agent-run detail views. Includes a migration adding cache columns — run CodeGen after applying.

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0
  - @memberjunction/interactive-component-types@5.39.0

## 5.38.0

### Minor Changes

- 30f598d: Two intertwined deliverables in one PR: the autotag-website overhaul, plus a new dynamic forms-extension architecture (`BaseFormPanel` slot system) that lets consumers extend generated entity forms without the heavyweight custom-form override pattern.

  ## Autotag website crawler overhaul

  Fixes the long-standing "only crawls the seed page" symptom and adds first-class run budgets, a streaming pipeline, and per-source UI knobs.

  **Fixes**
  - `AutotagWebsite` now respects `MaxDepth` out of the box — the recursive crawler was previously gated on a flag that defaulted to falsy, so most sources only ever scraped the start URL. Class-level defaults are now `MaxDepth=2`, `CrawlSitesInLowerLevelDomain=true`, `CrawlOtherSitesInTopLevelDomain=false`.
  - Change-detection (the "is this page changed?" short-circuit) was rewritten to fetch each URL once instead of two or three times, hash the **extracted body text** (not raw HTML — eliminates spurious "changed" verdicts from CSRF tokens / build hashes / server timestamps), and scope the dedup query to the current `ContentSourceID` (a 404 boilerplate from one site no longer masks real pages on another).
  - `visitedURLs` state is now reset per content source — was leaking across sources and silently deduping legitimate URLs.
  - Conservative URL normalization (strip fragment, collapse trailing slash, sort query params; path case preserved per RFC 3986) so common variants dedupe correctly.
  - Several smaller bugs: `URLPattern` regex now applied in the shallow path too, `Number.isFinite` guard prevents NaN-cascade in the depth check.

  **Features**
  - **Streaming pipeline.** `ExtractTextAndProcessWithLLM` now accepts `AsyncIterable<MJContentItemEntity>` in addition to arrays. The website crawler streams items into the LLM batcher as they pass change-detection — total wall-clock is `~max(crawl, classify)` instead of `crawl + classify`. Backwards-compatible: existing array callers (AutotagEntity, tests) are unchanged.
  - **`MaxItemsPerRun` run budget.** Most intuitive "do at most N this run, do the rest next time" cap. Wired into `AutotagWebsite` (which had no budget integration before) and `AutotagEntity` (which already had the other RunBudget knobs). Pause is graceful via the existing CancellationRequested machinery; next run picks up where it left off (change-detection skips already-tagged items).
  - **Per-source Website crawler UI.** New "Website Crawler Settings" section on the Content Source form (conditional on Website source type) with structured inputs for MaxDepth, RootURL, URLPattern (live regex validation), and toggles for the recursion + sibling-fan-out flags. The Tag Pipeline section gets a promoted "Max items / run" primary row.

  **Storage**
  - `IContentSourceConfiguration` extended with a typed `MaxItemsPerRun?: number` and `Website?: IContentSourceWebsiteConfiguration` sub-object. The new `MJContentSourceEntity_IContentSourceWebsiteConfiguration` interface is now exported from `@memberjunction/core-entities`.
  - `AutotagWebsite` reads website knobs from the typed `Configuration.Website` first, then overlays `ContentSourceParam` rows as a sharper-per-instance override (legacy sources configured the old way keep working).
  - Per-key coercion at the param-overlay boundary fixes a latent bug where DB-stored strings were silently stuffed into number/boolean-typed instance fields.

  **Tests**

  162 tests pass (up from 119). New coverage spans URL normalization, fetch-once / extracted-text hashing, the streaming engine path (AsyncIterable batching, partial-batch flush, resume), `MaxItemsPerRun` budget enforcement, and the `Configuration.Website` overlay.

  **Docs**

  `packages/ContentAutotagging/README.md` documents the new streaming diagram, the Website Crawl Settings table, the Run Budgets table with priority order, and the resume semantics.

  **Known follow-ups** (not in this PR)
  - True crawl-side resume that persists discovered URLs so re-runs skip the HTTP re-discovery — today's resume is "functional via change-detection dedup."
  - `ETag` / `If-Modified-Since` conditional GETs on re-crawls (needs new columns on `MJContentItem`).

  ## `BaseFormPanel` slot system (`@memberjunction/ng-base-forms`)

  Generated entity forms can now be extended **without** replacing them via a `*Extended` custom-form override. Author a standalone Angular component extending `BaseFormPanel`, decorate with `@RegisterClassEx(BaseFormPanel, { metadata: { entity, slot, sortKey } })`, declare in any module. `<mj-form-panel-slot>` hosts in the generated form discover matching panels at runtime and dynamically mount them.

  **Slot positions** (top → bottom): `top-area`, `before-fields`, `after-fields`, `after-related`, `after-everything`.

  **Fallback chain** via `FormSlotCoordinator`: if the registered slot is missing because CodeGen hasn't been rerun against the new template emitter, the panel walks forward in the chain until it finds an existing slot. `MjRecordFormContainer` ALWAYS emits `after-everything` in its template, so panels never dead-end — pre-CodeGen-regen forms display every panel (at the bottom); post-regen forms display them in the preferred position.

  New public exports from `@memberjunction/ng-base-forms`:
  - `BaseFormPanel<TRecord>` abstract directive
  - `FormPanelSlot` type union
  - `FormPanelRegistrationMetadata` interface
  - `<mj-form-panel-slot>` component
  - `FormSlotCoordinator` service
  - `FORM_SLOT_CHAIN` constant

  Custom `*Extended` forms (e.g. `AIAgentFormComponentExtended`) remain a first-class pattern for truly bespoke layouts where the generated form is the wrong starting point entirely.

  Full authoring guide in `packages/Angular/Generic/base-forms/PANELS.md`.

  ## `@RegisterClassEx` + ClassFactory metadata (`@memberjunction/global`)

  Existing `@RegisterClass` keeps its exact positional signature (zero breaking changes) but also accepts an optional 6th `metadata` arg for parity. New `@RegisterClassEx(baseClass, options)` is the modern form when you have anything beyond `(baseClass, key, priority)` to specify — options-bag avoids positional-boolean noise and is the right place to attach `metadata`.

  New public exports from `@memberjunction/global`:
  - `RegisterClassEx` decorator
  - `RegisterClassOptions` interface
  - `ClassRegistration.Metadata` field (optional, additive)
  - `ClassFactory.GetAllRegistrationsByKeyPrefix(base, prefix)` — common structured-key case (case-insensitive, trimmed)
  - `ClassFactory.GetAllRegistrationsByKeyPattern(base, regex)` — nuanced key matching
  - `ClassFactory.GetAllRegistrationsByMetadata(base, predicate)` — recommended for structured discriminators

  The `Ex` suffix follows MJ's existing `Foo`/`FooAsync`/`FooEx` convention. Not a true TS overload — JS overloads are hacky compared to true OOP, and sibling decorators give cleaner IntelliSense + a clean deprecation path if we ever consolidate.

  MJGlobal README adds a "Structured registration" section documenting both decorators + all three lookup helpers.

  ## Knowledge Hub dashboard quick-edit (`@memberjunction/ng-dashboards`)

  The AI > Autotagging Pipeline dashboard's "Edit Content Source" slide-in is intentionally a **quick-edit surface**, not a full form. Added the most-useful subset of the new knobs:
  - `MaxItemsPerRun` (always shown — most-asked-for budget cap)
  - `MaxDepth` + 2 crawl toggles (Website-source-conditional)
  - **"Open advanced settings →"** link that calls `NavigationService.OpenEntityRecord('MJ: Content Sources', id)` to land in the full entity form, where every panel is available via the slot system.

  ## Documentation
  - `packages/Angular/Generic/base-forms/PANELS.md` (NEW) — comprehensive BaseFormPanel authoring guide.
  - `packages/Angular/CLAUDE.md` — restructured "Extending Entity Forms" section. Both patterns first-class.
  - `packages/Angular/Explorer/core-entity-forms/README.md` — new "Two Patterns" section above the existing custom-form guide.
  - `guides/CONTENT_AUTOTAGGING_GUIDE.md` — extended config table (all budget caps + `Website` sub-object) + UI section pointing at PANELS.md.
  - `packages/MJGlobal/README.md` — new "Structured registration: `@RegisterClassEx` + metadata" section.
  - Root `CLAUDE.md` — new "Nested CLAUDE.md Index" pointing at every sub-directory CLAUDE.md.

  ## Follow-ups (not in this PR)
  - Promote source-type-specific form sections to a registered class extension point when the count grows past 2-3 (e.g., RSS, Cloud Storage). Today's `IsWebsiteSourceType` template gate works fine for 1-2 source types.

### Patch Changes

- 6a3ac36: Fix AllowUpdateAPI clearing when EntityField transitions to virtual, use subqueries for organic key INSERTs for portable SQL, prevent permanent engine failure when MJAPI is temporarily unavailable, and centralize RLS exemption check in GetUserRowLevelSecurityWhereClause
- ebb0e3d: Eliminate provider.Refresh() from query save/delete paths, introduce MJQueryEntityExtended with child-relationship getters and business logic, migrate all QueryInfo consumers outside MJCore to use QueryEngine and entity types, remove dead QueryCacheManager, and replace 12 redundant RunView calls with QueryEngine cache reads. Fixes major performance bottleneck on large-entity deployments where every query save reloaded the entire metadata graph.
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [d285996]
- Updated dependencies [6a3ac36]
- Updated dependencies [918d663]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/interactive-component-types@5.38.0
  - @memberjunction/ai@5.38.0

## 5.37.0

### Patch Changes

- 4f15f31: Add Feedback Explorer dashboard with 1–10 conversation-rating modal persisting to ConversationDetail, plus a migration granting the UI role Create/Update on MJ: User Settings so user-scoped preferences (e.g. Agent Feedback consent) stop silently failing.
- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/interactive-component-types@5.37.0
  - @memberjunction/ai@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- 91036ee: Refreshable, shareable, taggable Lists with an agent-callable Actions surface.
  - New `@memberjunction/lists` core: ListOperations (delta + drop-guard + materialize/refresh/set-op), ListSharing, AudienceResolver.
  - `MJ: Lists` lineage fields (SourceViewID, SourceFilterSnapshot, LastRefreshedAt, RefreshMode, UseSnapshot) wired into Refresh-from-source.
  - GraphQL: ListOperationsResolver + GraphQLListsClient. New `SendToAudience` in communication-engine.
  - 12 new Actions covering materialize / refresh / share / invite / move / compose / resolve-audience / send-to-audience.
  - UI: Save-as-List, mixed list+view operands, compose-into-target, Shared With Me tab, invitations + audit-log dialogs, viewer-perspective gating, bulk Move/Copy with delta-confirm, tag chips + filter, list-stats sidebar, audience picker, Communications New Message page, Excel/CSV/JSON column-picker export.

- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core@5.36.0
  - @memberjunction/interactive-component-types@5.36.0
  - @memberjunction/ai@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- 31f2a7f: Add the missing `@deprecated` JSDoc tag to the generated `MJConversationDetailAttachmentEntity` class. This is a CodeGen catch from the attachment-unification work — the entity is deprecated in metadata but the generated class was not regenerated with the corresponding JSDoc. Comment-only change, no runtime impact.
- c1f1cad: Add pluggable geocoding provider abstraction with Google, Geocod.io, and HERE implementations (expands GeoCodeSource enum and adds provider registry). Polish the Home dashboard pin empty state with a dismissible "Don't show this again" preference persisted via UserInfoEngine, and speed up the Add Pin panel by reading from cached DashboardEngine, UserViewEngine, QueryEngine, and ActionEngineBase singletons instead of firing fresh RunViews on every open, with background pre-warm on home load.
- 32c4a02: Unify artifact and attachment delivery paths for AI agents. Seperate artifact storage from rendering. Every attachement now creates paired Artifact + ArtifactVersion and routing functions exist to replace hardcoded MIME allowlist. Unregistered file types are rejected at upload time unless the agent opts into AcceptUnregisteredFiles. Adds wildecard MIME resolver. `mj artifacts reclassify` for legacy rows
- Updated dependencies [6fa8e13]
- Updated dependencies [c1f1cad]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/interactive-component-types@5.35.0
  - @memberjunction/ai@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/interactive-component-types@5.34.1
  - @memberjunction/ai@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 0caffca: Emit `override` modifier on CodeGen-generated `Delete()`. Consumers compiling with `noImplicitOverride: true` were hitting TS4114. Compile-time-only; no runtime change. Fixes #2588
- e999e0d: Add cross-server cache invalidation via shared storage provider, fix "No Applications Available" after browser refresh, use cacheSettings.verboseLogging for Redis provider, add ParameterHints to override LLM-generated sampleValues, and thread forceRefresh as BypassCache through BaseEngine config loading
- ae5cfbd: Search Scopes & RAG+ — multi-phase ship

  A bundled feature release across the search pipeline (Phases 2A–6 of
  the Search Scopes & RAG+ initiative). Highlights:

  **SearchEngine pipeline**
  - New `SimpleVectorDatabase` in-process driver — points
    `VectorDBBase` at any entity column with an `EmbeddingVector`
    field. Suitable for dev / agent-memory / small-medium corpora.
    Constructor accepts an empty/missing API key (in-process driver
    has no remote auth target).
  - `VectorDBBase.QueryIndex(params, contextUser?)` — `contextUser`
    is now a proper second parameter instead of being smuggled
    through `filter.__contextUser`. Pinecone/Qdrant/pgvector ignore
    it (they auth via API key); in-process drivers use it for
    RunView's server-side RLS guard. Method-level pattern matches
    MJ's `RunView(params, contextUser)` and `GetEntityObject(name,
contextUser)` conventions.
  - `SearchFusion` — multi-provider score evidence is now preserved
    through RRF. Previously the second provider's `ScoreBreakdown`
    contribution was silently dropped when the same RecordID
    appeared in two provider lists, causing the merged item to
    rank below single-provider hits. Records that match in
    Vector + Entity now carry both contributions and rank
    correctly.
  - Defensive sanitation in `Fuse()` — items with non-finite Score
    (NaN, Infinity), empty/non-string RecordID, or null payloads are
    filtered before fusion. Closes a class of failure modes from
    misbehaving 3rd-party providers.
  - Tier-1 input edge cases hardened — null/undefined/non-string
    Query no longer TypeErrors, surfaces a clean Failure result.
    `EntitySearchProvider` now strips SQL LIKE wildcards (`%`, `_`,
    `[`, `]`) from user input — `Query="%"` no longer matches every
    row through the LIKE-injection vector.
  - Streaming search — `SearchEngine.streamSearch()` v2 emits
    provider events as soon as each provider promise settles
    (concurrent emission), not in registration order.

  **Permission gate (Phase 2A)**
  - `SearchScopePermissionResolver` enforces a 6-step decision tree:
    AgentNone → AgentAssignedNotListed → DirectGrant → RoleGrant →
    AgentUnscopedAll → NoGrant.
  - `AIAgent.SearchScopeAccess` enum (`'None' | 'All' | 'Assigned'`)
    controls agent-side fallback when no per-user/per-role grant
    applies. `BypassCache` propagates through the dedup-linger cache
    so freshly-revoked grants take effect immediately.
  - New tests + agent scenarios cover all 13 permission-matrix cells
    (PM-01..PM-13).

  **Reranker catalog (Phase 2D)**
  - 4 reranker drivers — Cohere, Voyage, OpenAI judge, BGE local —
    all with `@RegisterClass(BaseReRanker, ...)`. Per-search
    `RerankerBudgetGuard` caps API spend; `EstimateCostCents` and
    `CostReporter` per driver. Graceful degradation when the
    upstream SDK rejects/times out/returns malformed responses.

  **Observability (Phase 3)**
  - `MJSearchExecutionLog` — every `Search()` invocation writes one
    row with Status / ResultCount / TotalDurationMs / RerankerCostCents
    / ProvidersJSON (per-source hit counts) / AIAgentID attribution.
    Forbidden gate decisions log `Status='Forbidden'` rows.
  - Knowledge Hub Config dashboard subtab visualizes the log:
    hit-rate, p50/p95 latency, top failure reasons, top users, total
    reranker cost.

  **External providers (Phase 5)**
  - 4 search providers — Elasticsearch, Typesense, Azure AI Search,
    OpenSearch — all with `@RegisterClass(BaseSearchProvider, ...)`.
  - New `AvailableSearchProviders` GraphQL query exposes the
    `BaseSearchProvider.GetAvailableProviders()` runtime catalog to
    the SearchScope form's provider dropdown (P5.5).

  **Angular / UI**
  - Custom `MJSearchScopeFormComponentExtended` (P2D.7 / P4) — fusion
    weights sliders, reranker dropdown, live-preview panel, A/B
    Kendall-tau similarity, CSV export of last 500 invocations.
  - Custom `MJSearchScopeProviderFormComponentExtended` (P5.5) —
    provider dropdown sourced from `MJ: Search Providers` rows,
    annotated with whether each provider's DriverClass is currently
    registered with the server's ClassFactory.
  - Streaming search consumer in `SearchService.StreamSearch()` —
    Angular Observable surface for the `StreamScopedSearch`
    mutation + `SearchStreamEvents` subscription.

  **Migration**
  - `V202605081416__v5.34.x__Search_Scopes_And_RAG_Plus.sql` —
    consolidated. Contains six DDL sections (Phase 1 baseline,
    `SearchScopePermission`, `SearchScope.RerankerBudgetCents`,
    `SearchExecutionLog`, `SearchScopeTestQuery`, unique-constraint
    fix) followed by five CodeGen runs that regenerate the entity
    metadata, sprocs, views, and permission grants for all of the
    above.

  **Test suite**
  - 17 end-to-end agent scenarios (s01–s17) under `agent-scenarios/`,
    driving real LLM tool-calls (Sage agent) against the SearchEngine
    - multi-provider RRF + reranker pipeline. 95 assertions; all PASS.
  - `@memberjunction/search-engine` vitest: 237 unit tests across 21
    files, all PASS. Covers fusion, providers (real + external),
    rerankers, scope template renderer, parent-ID metadata,
    streaming, permission resolver, edge cases, mid-flight failures.

  **Documentation**
  - `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` — comprehensive guide
    covering scope creation, agent integration, permission resolution,
    multi-scope fusion, reranker catalog, observability, external
    providers, how-to templates for adding a new provider /
    reranker / artifact tool library / vector index over an
    embedded entity column. Documents the embedding-regeneration
    contract for ops.

  See `RAG_plan.md` for the full multi-phase plan and `plans/
search-scopes-rag-plus/what-we-built.md` for the customer-facing
  summary.

- 72cb92e: Optimize component loading pipeline: remove 163 MB MJ: Components bulk load from ComponentMetadataEngine, add ComponentMetadataEngineServer for server-only use, add generic cache API to LocalCacheManager with server-side registry caching (page refresh component load reduced from 12-20s to ~70ms), add hash-based 304 support for registry fetches, remove proprietary spec caching to client database, and optimize Component Studio to load lightweight summaries on demand.
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/interactive-component-types@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
- Updated dependencies [3e84676]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/interactive-component-types@5.33.0
  - @memberjunction/ai@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/interactive-component-types@5.32.0
  - @memberjunction/ai@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Minor Changes

- fc8b9b8: Autotagger scope & governance — per-tenant tag scoping, per-tag governance, persisted embeddings, suggestion queue, Tag Health, and a unified Tag Governance dashboard with full UI.

  **Schema (one additive migration `V202605010846`)** — 9 new columns on `__mj.Tag` (governance + persisted embedding cache), three new tables (`__mj.TagScope` polymorphic M2M, `__mj.TagSynonym`, `__mj.TagSuggestion` review queue). Existing rows default to `IsGlobal=1` so behavior is unchanged out of the box. `IContentSourceConfiguration` JSON type extended with five net-new optional knobs (`SuggestThreshold`, `MaxNewTagsPerRun`, `MaxNewTagsPerItem`, `MaxTokensPerRun`, `MaxCostPerRun`) — CodeGen emits the typed accessor.

  **Engine (`tag-engine` / `tag-engine-base` / `core-entities-server`)** — `MJTagEntityServer` + new `MJTagScopeEntityServer` enforce the `IsGlobal ⊕ TagScope` invariant via `ValidateAsync` (no DB triggers); persisted-embedding `Save()` hook + cold-start hydrate path replace the every-startup recompute. `TagEngineBase` eagerly loads scope + synonyms in `Config()` and exposes `GetVisibleTags / GetTagBySynonym / GetTagByName(name, ctx) / GetTaxonomyTree(rootID, ctx)`. New `TagScopeFilterBuilder` (`BaseSingleton`) produces SQL fragments + in-memory predicates + child-scope subset validator. `TagEngine.ResolveTag` widened with a `'hybrid'` mode and a `ResolveTagOptions` parameter — new 4+1-tier pipeline (synonym → exact → fuzzy → semantic with tiered confidence routing → governance-gated `handleNoMatch`). `SuggestThreshold` band routes to the suggestion queue; `createAndEmbedTag` snapshots parent scope onto new children when parent is non-global. `TagGovernanceEngine` adds `ValidateAutoGrow / EnqueueSuggestion / PromoteSuggestion / RejectSuggestion`; `MergeTags` carries source synonyms (`Source='Merged'`). New `TagHealthJob` with three idempotent emitters (merge / low-usage / wide-node), gated by `MJ_AUTOTAG_RUN_TAG_HEALTH=1` env or invokable on demand. New `TagEngine.RebuildTagEmbeddings(contextUser)` utility for post-model-change rebuilds.

  **Autotag pipeline (`content-autotagging`)** — `ScopeContextResolver` derives per-source scope from `TagRootID`, `RunBudget` enforces per-run + per-item caps, new `OnAfterBatch` hook on `AutotagBaseEngine` gracefully pauses runs via the existing `CancellationRequested` machinery. `BridgeContentItemTagToTaxonomy` threads `scopeContext`, `SuggestThreshold`, source traceability, and an `onTagCreated` callback into `ResolveTag`. Per-item budget exhaustion collapses the effective mode to `hybrid` so further new tags route to suggestions instead of being auto-created.

  **Server (`server` / `graphql-dataprovider`)** — new `TagGovernanceResolver` exposes `PromoteTagSuggestion` / `RejectTagSuggestion` / `RebuildTagEmbeddings` / `RunTagHealth` mutations so suggestion dispositions run transactionally on the server. Matching `GraphQLAIClient` methods + result interfaces.

  **UI (`ng-dashboards` / `ng-core-entity-forms`)** — new `TagGovernanceResourceComponent` (registered as `'TagGovernance'`) — single dashboard with **left-nav** (top nav stays with the MJExplorer shell). Three sections built to the picked mockup options: Taxonomy (Option A — tree + governance/scope/synonyms detail-form, scope dialog with parent-subset validation), Suggestions (Option C — table + drawer with bulk actions and "if approved" preview), Tag Health (Option A — three summary cards + threshold tuning + run history + Rebuild stale embeddings). `MJContentSourceFormComponentExtended` gains a "Tag Pipeline Configuration" panel (Option B dense form) with mode picker cards, threshold sliders that auto-keep `SuggestThreshold < MatchThreshold`, scope+root, and budget fields — the existing JSON code editor stays available collapsed below as the advanced override. Multi-provider safe + UUID-compliant throughout.

  **Tests** — 271 tests across the impacted packages, all green. New: 12 `TagScopeFilterBuilder`, 8 `ValidateAutoGrow`, 4 `TagHealthJob`, 7 `RunBudget`, 8 `ScopeContextResolver`, 18 `TagGovernanceResolver`, 18 `TagGovernance` dashboard, 23 `ContentSource` form (vitest newly enabled in `ng-core-entity-forms`).

  **Documentation** — `guides/TAXONOMY_TAGGING_GUIDE.md` (~730 lines, 7 Mermaid diagrams) covers the entity model, autotag pipeline, 4+1-tier resolver, taxonomy modes, governance gates, scope inheritance, suggestion lifecycle, worked implementation guides, seeding patterns, and ops guidance. `guides/BASE_ENTITY_SERVER_PATTERNS.md` captures the persisted-embedding + `ValidateAsync` invariant + FK-cleanup-before-delete patterns this PR introduces so future agents lift the recipe rather than re-discover it. `mockups/knowledge-hub-classify-redesign/` ships 12 polished HTML mockups (3 options each across the 3 high-priority surfaces) that drove the UX direction.

  Migration ordering: apply the SQL migration → run CodeGen → `mj sync push` for the JSON-type interface → build. The migration is additive and idempotent against `IsGlobal=1` defaults; existing customers see no behavior change until they opt in by setting per-tag governance flags or moving sources off the default `auto-grow` mode.

### Patch Changes

- cde4d2c: Surface Resource Permission shares in the "Shared with me" view by extending `ResourcePermissionProvider` to include resources granted via direct permission rows alongside other share mechanisms.
- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/ai@5.31.0
  - @memberjunction/interactive-component-types@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai@5.30.1
- @memberjunction/interactive-component-types@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Minor Changes

- c2c5892: Activate Memory Manager consolidation pipeline with drift prevention, entity-attribute contradiction detection, Ebbinghaus decay-based archival, protection tiers, and composite importance scoring. Adds the `AIAgentNote` consolidation schema (`ConsolidatedIntoNoteID`, `ConsolidationCount`, `DerivedFromNoteIDs`, `ProtectionTier`, `ImportanceScore`) and enforces the vector-store Status invariant write-side in `MJAIAgentNoteEntityServer.Save()` / `.Delete()` so revoked notes are removed from retrieval without an MJAPI restart. Expands Memory Manager observability with per-phase run-step payloads: `scoreDistribution`, `entityTriplesExtracted`, `decayScoreDistribution`, `protectedPreserved`, `ephemeralAccelerated`, consolidation `triggerType` (forced/time/event/count), a new `Verify Consolidation Output` phase-level run step, and per-cluster `Process Consolidation Cluster` child steps. Adds 95th-percentile uniqueness outlier auto-protection in importance scoring. Deprecates the Memory Cleanup Agent in favor of the unified Memory Manager pipeline.
- 4729398: Runtime Actions — Phase 1 complete. Introduces `Action.Type='Runtime'`, a new action type where agents dynamically generate, test, and persist JavaScript actions that execute in MJ's isolated-vm sandbox with a permissioned bridge to metadata, views, queries, entity CRUD, other actions, agents, and AI prompts. Ships the v5.29.x migration (new `RuntimeActionConfiguration`, universal `MaxExecutionTimeMS`, and `CreatedByAgentID` columns on `Action`), the JSONType-authored config interface, the Zod validator with drift detection, the bidirectional IPC bridge in WorkerPool, the full `utilities.*` handler surface, the ActionSmith meta-agent with `Create Runtime Action` / `Test Runtime Action` helpers, Agent Manager wiring, the generic `Execute Agent` action, and Runtime-aware approval UI enhancements. Minor bumps across all touched packages because the schema migration + metadata records are coupled surface changes.

### Patch Changes

- 68bf87f: Archive entity CodeGen migration with updated views/SPs, field display name corrections, and RuntimeActionConfiguration type fix
- b1f32a4: Tighten the fast-startup window so all parallel engine loads share the local cache, defer background metadata validation until after StartupManager finishes, parallelize per-param IndexedDB cache checks, gzip-compress AllMetadata in localStorage, scope UserInfoEngine loads by UserID on the Network provider, and replace GeoDataEngine's Web Worker boundary parser with synchronous parsing to avoid an 11+s structured-clone stall.
- c199f3b: Phase 2 of the unified permissions architecture: introduces the `IPermissionProvider` interface with 9 domain providers (Entity, Application Role, Dashboard, Resource, Artifact, AI Agent, Collection, Query, Access Control Rule) aggregated by a new `PermissionEngine` singleton, adds explicit Allow/Deny support to `EntityPermission`, and ships the Permissions admin dashboard. Includes migrations for the Permission Domain catalog, EntityPermission.Type column, Dashboard FK cascade delete, ResourcePermission.SharedByUserID, and UI role permission fixes.
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [00b5c26]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core@5.30.0
  - @memberjunction/interactive-component-types@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- 7006276: Extend MCPEngine with a cached `Favorites` property (`MJ: MCP Tool Favorites`) backed by BaseEngine's `CacheLocal` + event-driven cache sync. Adds `GetFavoritesByUser(userId)` and `GetFavoriteByUserAndTool(userId, toolId)` helpers. MCP Dashboard's `loadFavorites` and `toggleFavorite` paths now read the engine cache instead of issuing per-call RunViews against `MJ: MCP Tool Favorites`; Save/Delete on the favorite entity still flows through BaseEntity so the cache stays consistent across tabs via auto-invalidation.
- Updated dependencies [e02e24e]
  - @memberjunction/core@5.29.0
  - @memberjunction/interactive-component-types@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- 115e4da: Hot-path optimizations and a new BaseEngine observable API.

  **Performance (bundled from #2397, #2405, #2406, #2417):**
  - `BaseEntity.GetFieldByName` and new `GetFieldByCodeName` back Fields lookups with lazy `Map` caches — O(1) in place of O(N) `.find()` scans inside `SetMany`, setters, and serialization. Caches clear on `init()` so re-initialized entities see fresh fields.
  - `Metadata.EntityByName`/`EntityByID` fall back to a lazy `Map` when the provider doesn't own the lookup. UUID keys are normalized so SQL-Server-upper-case and PostgreSQL-lower-case resolve the same entry. Invalidated on `Refresh()`.
  - `BaseInfo.copyInitData` uses `hasOwnProperty` instead of scanning `Object.keys(this)`, and short-circuits the `DefaultValue` case-insensitive match with an exact-equality fast path plus a length pre-check before falling back to `toLowerCase`.
  - `RunView`/`RunViews` post-cache field filtering caches per-call key-to-keep decisions so repeated keys across rows avoid re-lowercasing and re-lookup.

  **BaseEngine observable properties:**
  - New `BaseEngine.ObserveProperty<E>(propertyName)` returns an `Observable<E[]>` backed by a lazy `BehaviorSubject`. Unobserved properties pay zero runtime cost.
  - Five mutation paths (`applyImmediateMutation` add/remove, `LoadSingleEntityConfig`, `LoadMultipleEntityConfigs`, remote-record-data handling) now emit via `emitPropertyChange` so subscribers receive array updates.
  - `UserInfoEngine` exposes `UserNotifications$`, `UserFavorites$`, `UserApplications$` as convenience accessors.

  Fully test-covered: 918/918 tests pass in `@memberjunction/core` including new coverage for each cache and for the observable lifecycle.

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/interactive-component-types@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/interactive-component-types@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ai@5.27.0
- @memberjunction/interactive-component-types@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- 55de456: Fix missing dependencies across 17 packages that accumulated while knip dependency checking was silently broken. Repair knip infrastructure: disable crashing vitest plugin, harden CI workflow to fail-fast on tool crashes instead of silently passing, and fix hardcoded Angular version in auto-fix script.
- a1002f4: - Entities now expose AllowCaching as the runtime source of truth for
- Updated dependencies [a1002f4]
  - @memberjunction/core@5.26.0
  - @memberjunction/interactive-component-types@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Minor Changes

- d6370e8: migration
- 7ddf732: migration/metadata
- cbcf477: migration

### Patch Changes

- fc8cd52: Autotagging pipeline with run tracking, retry, and tag merge/delete; taxonomy server-side SQL aggregates; vector sync credential engine integration; search resolver and organic key support; unit test fixes across geo-core, ai-vector-sync, MJServer, and UUID compliance.
- Updated dependencies [fc8cd52]
  - @memberjunction/core@5.25.0
  - @memberjunction/interactive-component-types@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Minor Changes

- c318a0c: metadata + migrations in this PR == minor

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/interactive-component-types@5.24.0
  - @memberjunction/ai@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Minor Changes

- 513b20c: migration/metadata
- 44bc22b: JSONType strong typing system: adds JSONType, JSONTypeIsArray, and JSONTypeDefinition metadata.

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/interactive-component-types@5.23.0
  - @memberjunction/ai@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/interactive-component-types@5.22.0
  - @memberjunction/ai@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/interactive-component-types@5.21.0
  - @memberjunction/ai@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/interactive-component-types@5.20.0
  - @memberjunction/ai@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai@5.19.0
- @memberjunction/interactive-component-types@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/ai@5.18.0
- @memberjunction/interactive-component-types@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/interactive-component-types@5.17.0
  - @memberjunction/ai@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/interactive-component-types@5.16.0
  - @memberjunction/ai@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/core@5.15.0
  - @memberjunction/ai@5.15.0
  - @memberjunction/interactive-component-types@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/interactive-component-types@5.14.0
  - @memberjunction/ai@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/interactive-component-types@5.13.0
  - @memberjunction/ai@5.13.0

## 5.12.0

### Minor Changes

- d92502e: migration/metadata
- 1567293: migration
- 1e5d181: migration

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
  - @memberjunction/core@5.12.0
  - @memberjunction/interactive-component-types@5.12.0
  - @memberjunction/ai@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/interactive-component-types@5.11.0
  - @memberjunction/ai@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai@5.10.1
- @memberjunction/interactive-component-types@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- f2df653: Add ExternalReferenceID column to AIAgentRun for cross-system run correlation and wire it through Skip proxy. Fix CodeGen validator duplicate generation and cleanup existing duplicates.
- 98e9f15: no migration
- 5ce18ff: no migration
- Updated dependencies [f2df653]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/interactive-component-types@5.10.0
  - @memberjunction/ai@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- c6a0df2: Fix extensionless ESM barrel re-exports by adding .js extensions for Node.js 22+ compatibility
- Updated dependencies [194ddf2]
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ai@5.9.0
  - @memberjunction/interactive-component-types@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/interactive-component-types@5.8.0
  - @memberjunction/ai@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ai@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/interactive-component-types@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/interactive-component-types@5.6.0
  - @memberjunction/ai@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Minor Changes

- ee9f788: migrations - postgres sql support!

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ai@5.5.0
  - @memberjunction/interactive-component-types@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai@5.4.1
- @memberjunction/interactive-component-types@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- c9a760c: no migration
  - @memberjunction/ai@5.4.0
  - @memberjunction/interactive-component-types@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai@5.3.1
- @memberjunction/interactive-component-types@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- 1692c53: Viewing System fixes for sorting and filtering. Memory manager SQL fix.
  - @memberjunction/ai@5.3.0
  - @memberjunction/interactive-component-types@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core@5.2.0
  - @memberjunction/interactive-component-types@5.2.0
  - @memberjunction/ai@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/interactive-component-types@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Minor Changes

- a3e7cb6: migration

### Patch Changes

- Updated dependencies [737b56b]
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/interactive-component-types@5.0.0
  - @memberjunction/core@5.0.0
  - @memberjunction/ai@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/interactive-component-types@4.4.0
  - @memberjunction/ai@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai@4.3.1
- @memberjunction/interactive-component-types@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/global@4.3.1

## 4.3.0

### Minor Changes

- 564e1af: migration

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/interactive-component-types@4.3.0
  - @memberjunction/ai@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai@4.2.0
- @memberjunction/interactive-component-types@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/global@4.2.0

## 4.1.0

### Minor Changes

- 2ea241f: metadata

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/interactive-component-types@4.1.0
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

- f159146: no migration
- Updated dependencies [8366d44]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ai@4.0.0
  - @memberjunction/interactive-component-types@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- 18b4e65: Add field-level encryption for credential values with automatic decryption, Box.com OAuth credential type, comprehensive JSON Schema validation, and fix credential editor to prevent "undefined" text in fields
- Updated dependencies [a3961d5]
  - @memberjunction/core@3.4.0
  - @memberjunction/interactive-component-types@3.4.0
  - @memberjunction/ai@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- ca551dd: no migration
  - @memberjunction/ai@3.3.0
  - @memberjunction/interactive-component-types@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Minor Changes

- 039983c: migration
- 6806a6c: Add enterprise file storage accounts with credential-based authentication
- 582ca0c: Added unified notification system with email/SMS delivery, user notification preferences, and agent completion notifications

### Patch Changes

- Updated dependencies [cbd2714]
  - @memberjunction/interactive-component-types@3.2.0
  - @memberjunction/ai@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ai@3.1.1
- @memberjunction/interactive-component-types@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai@3.0.0
- @memberjunction/interactive-component-types@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/global@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/interactive-component-types@2.133.0
  - @memberjunction/ai@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/interactive-component-types@2.132.0
  - @memberjunction/ai@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/interactive-component-types@2.131.0
  - @memberjunction/ai@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/ai@2.130.1
- @memberjunction/interactive-component-types@2.130.1
- @memberjunction/core@2.130.1
- @memberjunction/global@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/ai@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/interactive-component-types@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Minor Changes

- c7e38aa: migration

### Patch Changes

- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/interactive-component-types@2.129.0
  - @memberjunction/ai@2.129.0

## 2.128.0

### Patch Changes

- f407abe: Add EffortLevel support to AIPromptModel with priority hierarchy and fix GPT 5.2 naming convention to align with standards
- Updated dependencies [f407abe]
  - @memberjunction/core@2.128.0
  - @memberjunction/interactive-component-types@2.128.0
  - @memberjunction/ai@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [65318c4]
- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/interactive-component-types@2.127.0
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/ai@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/ai@2.126.1
- @memberjunction/interactive-component-types@2.126.1
- @memberjunction/core@2.126.1
- @memberjunction/global@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [703221e]
  - @memberjunction/core@2.126.0
  - @memberjunction/interactive-component-types@2.126.0
  - @memberjunction/ai@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [1115143]
- Updated dependencies [bd4aa3d]
  - @memberjunction/interactive-component-types@2.125.0
  - @memberjunction/core@2.125.0
  - @memberjunction/ai@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- 75058a9: Fix metadata provider race conditions, add EntityDataGrid component validation, and enforce Component entity Specification field as single source of truth
- Updated dependencies [75058a9]
  - @memberjunction/core@2.124.0
  - @memberjunction/interactive-component-types@2.124.0
  - @memberjunction/ai@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai@2.123.1
- @memberjunction/interactive-component-types@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/global@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/ai@2.123.0
- @memberjunction/interactive-component-types@2.123.0
- @memberjunction/core@2.123.0
- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
  - @memberjunction/ai@2.122.2
  - @memberjunction/interactive-component-types@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/interactive-component-types@2.122.1
- @memberjunction/core@2.122.1
- @memberjunction/global@2.122.1

## 2.122.0

### Minor Changes

- c989c45: migration

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/interactive-component-types@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/interactive-component-types@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/interactive-component-types@2.120.0
  - @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- Updated dependencies [7dd7cca]
  - @memberjunction/core@2.119.0
  - @memberjunction/interactive-component-types@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Minor Changes

- 264c57a: migration
- 096ece6: migration

### Patch Changes

- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
  - @memberjunction/interactive-component-types@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [8c092ec]
  - @memberjunction/core@2.117.0
  - @memberjunction/interactive-component-types@2.117.0
  - @memberjunction/global@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [81bb7a4]
- Updated dependencies [a8d5592]
  - @memberjunction/core@2.116.0
  - @memberjunction/global@2.116.0
  - @memberjunction/interactive-component-types@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/interactive-component-types@2.115.0
- @memberjunction/core@2.115.0
- @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/interactive-component-types@2.114.0
- @memberjunction/core@2.114.0
- @memberjunction/global@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/interactive-component-types@2.113.2
  - @memberjunction/global@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [c126b59]
  - @memberjunction/global@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/interactive-component-types@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/interactive-component-types@2.110.1
- @memberjunction/core@2.110.1
- @memberjunction/global@2.110.1

## 2.110.0

### Minor Changes

- 02d72ff: - Sort Zod schema entity field values by sequence in CodeGen for consistent ordering
  - Add unique constraints to QueryCategory and Query tables to prevent duplicates
  - Improve concurrent query creation handling in CreateQueryResolver
  - Fix metadata provider usage in entity server classes
  - Remove automatic error logging from SQLServerDataProvider
- d2d7ab9: migration
- c8b9aca: Migration

### Patch Changes

- @memberjunction/interactive-component-types@2.110.0
- @memberjunction/core@2.110.0
- @memberjunction/global@2.110.0

## 2.109.0

### Minor Changes

- 6e45c17: migration

### Patch Changes

- @memberjunction/interactive-component-types@2.109.0
- @memberjunction/core@2.109.0
- @memberjunction/global@2.109.0

## 2.108.0

### Minor Changes

- 656d86c: Migration

### Patch Changes

- @memberjunction/interactive-component-types@2.108.0
- @memberjunction/core@2.108.0
- @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/interactive-component-types@2.107.0
- @memberjunction/core@2.107.0
- @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/interactive-component-types@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/global@2.106.0

## 2.105.0

### Minor Changes

- 4807f35: migration

### Patch Changes

- 9b67e0c: This release addresses critical stability issues across build processes, runtime execution, and AI model management in the MemberJunction platform. The changes focus on three main areas: production build reliability, database migration consistency, and intelligent AI error handling.

  Resolved critical issues where Angular production builds with optimization enabled would remove essential classes through aggressive tree-shaking. Moved `TemplateEntityExtended` to `@memberjunction/core-entities` and created new `@memberjunction/ai-provider-bundle` package to centralize AI provider loading while maintaining clean separation between core infrastructure and provider implementations. Added `LoadEntityCommunicationsEngineClient()` calls to prevent removal of inherited singleton methods. These changes prevent runtime errors in production deployments where previously registered classes would become inaccessible, while improving architectural separation of concerns.

  Enhanced CodeGen SQL generation to use `IF OBJECT_ID()` patterns instead of `DROP ... IF EXISTS` syntax, fixing silent failures with Flyway placeholder substitution. Improved validator generation to properly handle nullable fields and correctly set `result.Success` status. Centralized GraphQL type name generation using schema-aware naming (`{schema}_{basetable}_`) to eliminate type collisions between entities with identical base table names across different schemas. These changes ensure reliable database migrations and prevent recurring cascade delete regressions.

  Implemented sophisticated error classification with new `NoCredit` error type for billing failures, message-first error detection, and permissive failover for 403 errors. Added hierarchical configuration-aware failover that respects configuration boundaries (Production vs Development models) while maintaining candidate list caching for performance. Enhanced error analysis to properly classify credit/quota issues and enable appropriate failover behavior.

  Improved model selection caching by checking all candidates for valid API keys instead of stopping at first match, ensuring retry logic has access to complete list of viable model/vendor combinations. Added `extractValidCandidates()` method to `AIModelSelectionInfo` class and `buildCandidatesFromSelectionInfo()` helper to properly reconstruct candidate lists from selection metadata during hierarchical template execution.

  Enhanced error-based retry and failover with intelligent handling for authentication and rate limit errors. Authentication errors now trigger vendor-level filtering (excluding all models from vendors with invalid API keys) and immediate failover to different vendors. Rate limit errors now retry the same model/vendor using configurable `MaxRetries` (default: 3) with backoff delay based on `RetryStrategy` (Fixed/Linear/Exponential) before failing over. Improved log messages with human-readable formatting showing model/vendor names, time in seconds, and clear status indicators. Fixed MJCLI sync commands to properly propagate exit codes for CI/CD integration.
  - @memberjunction/interactive-component-types@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Minor Changes

- 9ad6353: migrations

### Patch Changes

- Updated dependencies [2ff5428]
  - @memberjunction/global@2.104.0
  - @memberjunction/core@2.104.0
  - @memberjunction/interactive-component-types@2.104.0

## 2.103.0

### Minor Changes

- 3ba01de: migration
- a38eec3: new entities

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
  - @memberjunction/core@2.103.0
  - @memberjunction/interactive-component-types@2.103.0
  - @memberjunction/global@2.103.0

## 2.100.3

### Patch Changes

- Updated dependencies [3cec75a]
  - @memberjunction/interactive-component-types@2.100.3
  - @memberjunction/core@2.100.3
  - @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/interactive-component-types@2.100.2
- @memberjunction/core@2.100.2
- @memberjunction/global@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/interactive-component-types@2.100.1
- @memberjunction/core@2.100.1
- @memberjunction/global@2.100.1

## 2.100.0

### Minor Changes

- ffc2c1a: migration

### Patch Changes

- Updated dependencies [5f76e3a]
  - @memberjunction/core@2.100.0
  - @memberjunction/interactive-component-types@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Minor Changes

- eb7677d: feat(ai-agents): Add ChatHandlingOption for flexible Chat step
  handling
  - Add ChatHandlingOption field to AIAgent table with values:
    Success, Failed, Retry
  - Implement Chat step remapping in
    BaseAgent.validateChatNextStep() based on agent configuration
  - Fix executeChatStep to mark Chat steps as successful
    (they're valid terminal states for user interaction)
  - Remove complex sub-agent Chat handling from FlowAgentType in
    favor of agent-level configuration
  - Enables agents like Requirements Expert to request user
    clarification without breaking parent flows
  - Parent agents can control whether Chat steps should continue
    (Success), fail (Failed), or retry (Retry)

### Patch Changes

- Updated dependencies [8bbb0a9]
  - @memberjunction/core@2.99.0
  - @memberjunction/interactive-component-types@2.99.0
  - @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/interactive-component-types@2.98.0
- @memberjunction/core@2.98.0
- @memberjunction/global@2.98.0

## 2.97.0

### Patch Changes

- Updated dependencies [dc497d5]
  - @memberjunction/interactive-component-types@2.97.0
  - @memberjunction/core@2.97.0
  - @memberjunction/global@2.97.0

## 2.96.0

### Patch Changes

- Updated dependencies [01dcfde]
  - @memberjunction/core@2.96.0
  - @memberjunction/interactive-component-types@2.96.0
  - @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- Updated dependencies [a54c014]
- Updated dependencies [85985bd]
  - @memberjunction/core@2.95.0
  - @memberjunction/interactive-component-types@2.95.0
  - @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- Updated dependencies [eed16e0]
  - @memberjunction/interactive-component-types@2.94.0
  - @memberjunction/core@2.94.0
  - @memberjunction/global@2.94.0

## 2.93.0

### Minor Changes

- 103e4a9: Added comprehensive tracking fields to AI execution entities:
  - **AIAgentRun**: Added `RunName`, `Comment`, and `ParentID` fields for better run identification and hierarchical tracking
  - **AIPromptRun**: Added `RunName`, `Comment`, and `ParentID` fields for consistent tracking across prompt executions
  - **AIAgentRunStep**: Added `Comment` and `ParentID` fields for detailed step-level tracking
  - **Flow Agent Type**: Added support for Chat message handling to properly bubble up messages from sub-agents to users
  - **Action Execution**: Enhanced action execution logging by capturing input data (action name and parameters) in step entities
  - **CodeGen SQL Execution**: Fixed QUOTED_IDENTIFIER issues by adding `-I` flag to sqlcmd execution (required for indexed views and computed columns)
  - **MetadataSync Push Service**: Improved error reporting with detailed context for field processing failures, lookup failures, and save errors
  - Database migration `V202508231445__v2.93.0` adds the new tracking fields with proper constraints and metadata
  - Updated all generated entity classes, GraphQL types, and Angular forms to support the new fields
  - Enhanced error diagnostics in push service to help identify root causes of sync failures

- 7f465b5: migration

### Patch Changes

- Updated dependencies [f8757aa]
- Updated dependencies [bfcd737]
- Updated dependencies [1461a44]
  - @memberjunction/core@2.93.0
  - @memberjunction/interactive-component-types@2.93.0
  - @memberjunction/global@2.93.0

## 2.92.0

### Patch Changes

- Updated dependencies [b303b84]
- Updated dependencies [8fb03df]
- Updated dependencies [5817bac]
  - @memberjunction/interactive-component-types@2.92.0
  - @memberjunction/core@2.92.0
  - @memberjunction/global@2.92.0

## 2.91.0

### Minor Changes

- 6476d74: migrations

### Patch Changes

- Updated dependencies [f703033]
  - @memberjunction/core@2.91.0
  - @memberjunction/interactive-component-types@2.91.0
  - @memberjunction/global@2.91.0

## 2.90.0

### Minor Changes

- 146ebcc: migration
- d5d26d7: migration
- 1e7eb76: migration

### Patch Changes

- Updated dependencies [d4530d7]
- Updated dependencies [146ebcc]
  - @memberjunction/interactive-component-types@2.90.0
  - @memberjunction/core@2.90.0
  - @memberjunction/global@2.90.0

## 2.89.0

### Minor Changes

- d1911ed: migration

### Patch Changes

- @memberjunction/interactive-component-types@2.89.0
- @memberjunction/core@2.89.0
- @memberjunction/global@2.89.0

## 2.88.0

### Minor Changes

- df4031f: migration

### Patch Changes

- @memberjunction/interactive-component-types@2.88.0
- @memberjunction/core@2.88.0
- @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- Updated dependencies [58a00df]
  - @memberjunction/core@2.87.0
  - @memberjunction/global@2.87.0

## 2.86.0

### Minor Changes

- 7dd2409: migration for new entiites

### Patch Changes

- @memberjunction/core@2.86.0
- @memberjunction/global@2.86.0

## 2.85.0

### Minor Changes

- 747455a: migration

### Patch Changes

- @memberjunction/core@2.85.0
- @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [0b9d691]
  - @memberjunction/core@2.84.0
  - @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- Updated dependencies [e2e0415]
  - @memberjunction/core@2.83.0
  - @memberjunction/global@2.83.0

## 2.82.0

### Minor Changes

- 2186d7b: migration file for effort level stuff
- 975e8d1: migration

### Patch Changes

- @memberjunction/core@2.82.0
- @memberjunction/global@2.82.0

## 2.81.0

### Minor Changes

- e623f99: added DisplayName to Entities entity
- 971c5d4: feat: implement query audit logging and TTL-based caching

  Add comprehensive audit logging and caching capabilities to the
  MemberJunction Query system:
  - Add ForceAuditLog and AuditLogDescription parameters to RunQuery for
    granular audit control
  - Implement TTL-based result caching with LRU eviction strategy for
    improved performance
  - Add cache configuration columns to Query and QueryCategory entities
  - Support category-level cache configuration inheritance
  - Update GraphQL resolvers to handle new audit and cache fields
  - Refactor RunQuery method into logical helper methods for better
    maintainability
  - Follow established RunView pattern for fire-and-forget audit logging

### Patch Changes

- Updated dependencies [6d2d478]
- Updated dependencies [971c5d4]
  - @memberjunction/core@2.81.0
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/core@2.80.1
- @memberjunction/global@2.80.1

## 2.80.0

### Minor Changes

- d03dfae: migration

### Patch Changes

- 7c5f844: Bug fixes for SQLServerDataProvider and fix ability to use other providers for MD refreshes up and down the stack
- Updated dependencies [7c5f844]
  - @memberjunction/core@2.80.0
  - @memberjunction/global@2.80.0

## 2.79.0

### Minor Changes

- 4bf2634: migrations

### Patch Changes

- Updated dependencies [907e73f]
  - @memberjunction/global@2.79.0
  - @memberjunction/core@2.79.0

## 2.78.0

### Minor Changes

- 06088e5: Queries Entity - Cascade Deletes Turned On

### Patch Changes

- @memberjunction/core@2.78.0
- @memberjunction/global@2.78.0

## 2.77.0

### Patch Changes

- 8ee0d86: Fix: Query parameter validation and cascade delete transaction handling
  - Added validation to ensure query parameters are JSON objects rather than arrays in GraphQL system user client
  - Implemented automatic transaction wrapping for entities with CascadeDeletes enabled
  - For database providers (server-side), delete operations are wrapped in
    BeginTransaction/CommitTransaction/RollbackTransaction
  - For network providers (client-side), deletes pass through as cascade handling occurs server-side
  - Ensures atomicity of cascade delete operations

- Updated dependencies [d8f14a2]
- Updated dependencies [c91269e]
  - @memberjunction/core@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Minor Changes

- 4b27b3c: migration file so minor bump
- ffda243: migration

### Patch Changes

- Updated dependencies [7dabb22]
  - @memberjunction/core@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- @memberjunction/core@2.75.0
- @memberjunction/global@2.75.0

## 2.74.0

### Minor Changes

- b70301e: migrations

### Patch Changes

- Updated dependencies [d316670]
  - @memberjunction/core@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- e99336f: UI tweaks
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Minor Changes

- 636b6ee: migration

### Patch Changes

- @memberjunction/core@2.72.0
- @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0
  - @memberjunction/core@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/core@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0

## 2.68.0

### Patch Changes

- Updated dependencies [b10b7e6]
  - @memberjunction/core@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/core@2.67.0
- @memberjunction/global@2.67.0

## 2.66.0

### Patch Changes

- @memberjunction/core@2.66.0
- @memberjunction/global@2.66.0

## 2.65.0

### Minor Changes

- b029c5d: Added fields to AIAgent table

### Patch Changes

- Updated dependencies [619488f]
  - @memberjunction/global@2.65.0
  - @memberjunction/core@2.65.0

## 2.64.0

### Minor Changes

- e775f2b: Found bug in metadata extraction from SQL Server, fixed and migration to capture changes for 2.64.0

### Patch Changes

- @memberjunction/core@2.64.0
- @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/core@2.63.1

## 2.63.0

### Minor Changes

- 28e8a85: Migration included to modify the AIAgentRun table, so minor bump

### Patch Changes

- @memberjunction/core@2.63.0
- @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- c995603: Better Error Handling and Failover in AI core and Promts
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/core@2.61.0
- @memberjunction/global@2.61.0

## 2.60.0

### Minor Changes

- e30ee12: migrations

### Patch Changes

- Updated dependencies [b5fa80a]
- Updated dependencies [e512e4e]
  - @memberjunction/core@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/core@2.59.0
- @memberjunction/global@2.59.0

## 2.58.0

### Patch Changes

- Updated dependencies [def26fe]
  - @memberjunction/core@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Minor Changes

- 0ba485f: various bug fixes

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/global@2.57.0

## 2.56.0

### Minor Changes

- bf24cae: Various

### Patch Changes

- @memberjunction/core@2.56.0
- @memberjunction/global@2.56.0

## 2.55.0

### Minor Changes

- 659f892: Various

### Patch Changes

- @memberjunction/core@2.55.0
- @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- Updated dependencies [20f424d]
  - @memberjunction/core@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Minor Changes

- bddc4ea: LoadFromData() changed to async, various other changes

### Patch Changes

- Updated dependencies [bddc4ea]
  - @memberjunction/core@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Minor Changes

- e926106: Significant improvements to AI functionality

### Patch Changes

- Updated dependencies [e926106]
  - @memberjunction/core@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Minor Changes

- 7a9b88e: AI Improvements
- 53f8167: AI Agent Infra - bump to 2.51.0

### Patch Changes

- Updated dependencies [7a9b88e]
  - @memberjunction/core@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/core@2.50.0
- @memberjunction/global@2.50.0

## 2.49.0

### Minor Changes

- 2f974e2: AI Model Costs Schema
- cc52ced: Significant changes all around
- db17ed7: Further Updates
- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- ca3365f: Use BaseEntity from MJ Core instead of typeorm
- Updated dependencies [cc52ced]
- Updated dependencies [db17ed7]
- Updated dependencies [62cf1b6]
  - @memberjunction/core@2.49.0
  - @memberjunction/global@2.49.0

## 2.48.0

### Minor Changes

- 031e724: Implement agent architecture separation of concerns
  - **NEW**: Add BaseAgent class for domain-specific prompt execution
  - **NEW**: Add ConductorAgent for autonomous orchestration decisions and action planning
  - **NEW**: Add AgentRunner class to coordinate BaseAgent + ConductorAgent interactions
  - **NEW**: Add AgentFactory with `GetConductorAgent()` and `GetAgentRunner()` methods using MJGlobal
    class factory
  - **NEW**: Add comprehensive execution tracking with AIAgentRun and AIAgentRunStep entities
  - **NEW**: Support parallel and sequential action execution with proper ordering
  - **NEW**: Structured JSON response format for deterministic decision parsing
  - **NEW**: Database persistence for execution history and step tracking
  - **NEW**: Cancellation and progress monitoring support
  - **NEW**: Context compression for long conversations
  - **NEW**: Template rendering with data context

  This implements clean separation of concerns:
  - BaseAgent: Domain-specific execution only (~500 lines)
  - ConductorAgent: Orchestration decisions with structured responses
  - AgentRunner: Coordination layer providing unified user interface

  Includes comprehensive TypeScript typing and MemberJunction framework integration.

### Patch Changes

- Updated dependencies [bb01fcf]
  - @memberjunction/core@2.48.0
  - @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- @memberjunction/core@2.47.0
- @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/core@2.46.0
- @memberjunction/global@2.46.0

## 2.45.0

### Minor Changes

- 556ee8d: Add AI Agent framework database entities and enhanced agent execution support

  New entity classes generated for AIAgentType, AIAgentRun, and AIAgentRunStep tables. Enhanced AIAgent and AIPromptRun entities with new foreign key relationships. Updated DataContextItem entity with CodeName property for improved code generation. These changes provide the foundational data layer for the AI Agent execution framework with hierarchical agent support, execution tracking, and pause/resume capabilities.

### Patch Changes

- @memberjunction/core@2.45.0
- @memberjunction/global@2.45.0

## 2.44.0

### Minor Changes

- 091c5f6: Align Entity Field sequence ordering with base views for core entities.

### Patch Changes

- fbc30dc: Documentation
- 99b27c5: various updates
- Updated dependencies [fbc30dc]
  - @memberjunction/core@2.44.0
  - @memberjunction/global@2.44.0

## 2.43.0

### Patch Changes

- Updated dependencies [1629c04]
  - @memberjunction/core@2.43.0
  - @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/core@2.42.1
- @memberjunction/global@2.42.1

## 2.42.0

### Patch Changes

- @memberjunction/core@2.42.0
- @memberjunction/global@2.42.0

## 2.41.0

### Minor Changes

- 7e0523d: Persist Skip conversation status and add completion time display
  - Added 'Status' column to Conversation table with 'Processing' and 'Available' states
  - Added 'CompletionTime' column to ConversationDetail table to track processing duration
  - Updated AskSkipResolver to manage conversation status and track processing time
  - Enabled GraphQLDataProvider to cache and retrieve session IDs from IndexedDB
  - Enhanced skip-chat component to poll for 'Processing' conversations after page refresh
  - Added CompletionTime display in the UI for completed AI messages
  - Fixed session persistence for conversation status across page reloads

### Patch Changes

- Updated dependencies [3be3f71]
  - @memberjunction/core@2.41.0
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- @memberjunction/core@2.40.0
- @memberjunction/global@2.40.0

## 2.39.0

### Patch Changes

- c9ccc36: Added SupportsEffortLevel to AIModels entity - generated artifacts to suit...
  - @memberjunction/core@2.39.0
  - @memberjunction/global@2.39.0

## 2.38.0

### Minor Changes

- c835ded: flagging this package to trigger a minor version bump. No actual code changes, but we have a new migration file to clean up and add new AI models

### Patch Changes

- @memberjunction/core@2.38.0
- @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/core@2.37.1
- @memberjunction/global@2.37.1

## 2.37.0

### Minor Changes

- 1418b71: Added ArtifactID/ArtifactVersionID as optional fkeys to ConversationDetail

### Patch Changes

- @memberjunction/core@2.37.0
- @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- Updated dependencies [9d709e2]
  - @memberjunction/core@2.36.1
  - @memberjunction/global@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
- Updated dependencies [160f24f]
  - @memberjunction/global@2.36.0
  - @memberjunction/core@2.36.0

## 2.35.1

### Patch Changes

- Updated dependencies [3e7ec64]
  - @memberjunction/core@2.35.1
  - @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/core@2.35.0
- @memberjunction/global@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/core@2.34.2
- @memberjunction/global@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/core@2.34.1
- @memberjunction/global@2.34.1

## 2.34.0

### Minor Changes

- e60f326: More support for HTML Reports in Skip, Additional Entities and CodeGen and SkipTypes for Artifacts Support

### Patch Changes

- Updated dependencies [785f06a]
  - @memberjunction/core@2.34.0
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- @memberjunction/core@2.33.0
- @memberjunction/global@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/core@2.32.2
- @memberjunction/global@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/core@2.32.1
- @memberjunction/global@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/core@2.32.0
- @memberjunction/global@2.32.0

## 2.31.0

### Patch Changes

- @memberjunction/core@2.31.0
- @memberjunction/global@2.31.0

## 2.30.0

### Minor Changes

- a3ab749: Updated CodeGen for more generalized CHECK constraint validation function generation and built new metadata constructs to hold generated code for future needs as well.

### Patch Changes

- Updated dependencies [a3ab749]
  - @memberjunction/global@2.30.0
  - @memberjunction/core@2.30.0

## 2.29.2

### Patch Changes

- 07bde92: New CodeGen Advanced Generation Functionality and supporting metadata schema changes
- Updated dependencies [07bde92]
- Updated dependencies [64aa7f0]
- Updated dependencies [69c3505]
  - @memberjunction/core@2.29.2
  - @memberjunction/global@2.29.2

## 2.28.0

### Patch Changes

- Updated dependencies [8259093]
  - @memberjunction/core@2.28.0
  - @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/core@2.27.1
- @memberjunction/global@2.27.1

## 2.27.0

### Patch Changes

- 5a81451: Added a UserID column to the Conversation Details Entity for the future extensibility of multi-user conversations with Skip.
- Updated dependencies [54ab868]
  - @memberjunction/core@2.27.0
  - @memberjunction/global@2.27.0

## 2.26.1

### Patch Changes

- @memberjunction/core@2.26.1
- @memberjunction/global@2.26.1

## 2.26.0

### Patch Changes

- Updated dependencies [23801c5]
  - @memberjunction/core@2.26.0
  - @memberjunction/global@2.26.0

## 2.25.0

### Patch Changes

- Updated dependencies [fd07dcd]
- Updated dependencies [26c990d]
- Updated dependencies [86e6d3b]
  - @memberjunction/core@2.25.0
  - @memberjunction/global@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/core@2.24.1
- @memberjunction/global@2.24.1

## 2.24.0

### Minor Changes

- 7c6ff41: Updates to support a new Description field in the DataContextItem entity and flow from the Skip API response where Skip can add new items separately from the DATA_REQUESTED response phase via the new GetData GQL query that MJ Server now supports.

### Patch Changes

- Updated dependencies [9cb85cc]
  - @memberjunction/global@2.24.0
  - @memberjunction/core@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/core@2.23.2
- @memberjunction/global@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/core@2.23.1
- @memberjunction/global@2.23.1

## 2.23.0

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/global@2.23.0
  - @memberjunction/core@2.23.0

## 2.22.2

### Patch Changes

- Updated dependencies [94ebf81]
  - @memberjunction/core@2.22.2
  - @memberjunction/global@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/core@2.22.1
- @memberjunction/global@2.22.1

## 2.22.0

### Patch Changes

- Updated dependencies [a598f1a]
- Updated dependencies [9660275]
  - @memberjunction/core@2.22.0
  - @memberjunction/global@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.21.0
- Bump @memberjunction/global to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.20.3
- Bump @memberjunction/global to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Bump @memberjunction/core to v2.20.2
- Bump @memberjunction/global to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/core to v2.20.1
- Bump @memberjunction/global to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:04 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.20.0
- Bump @memberjunction/global to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/core to v2.19.5
- Bump @memberjunction/global to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/core to v2.19.4
- Bump @memberjunction/global to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/core to v2.19.3
- Bump @memberjunction/global to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/core to v2.19.2
- Bump @memberjunction/global to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/core to v2.19.1
- Bump @memberjunction/global to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:48 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.19.0
- Bump @memberjunction/global to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.18.3
- Bump @memberjunction/global to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/core to v2.18.2
- Bump @memberjunction/global to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/core to v2.18.1
- Bump @memberjunction/global to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.18.0
- Bump @memberjunction/global to v2.18.0

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.17.0
- Bump @memberjunction/global to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:27 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/core to v2.16.1
- Bump @memberjunction/global to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.16.0
- Bump @memberjunction/global to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:28 GMT

### Patches

- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.15.2
- Bump @memberjunction/global to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.14.0
- Bump @memberjunction/global to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/core to v2.13.4
- Bump @memberjunction/global to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:45 GMT

### Patches

- Bump @memberjunction/core to v2.13.3
- Bump @memberjunction/global to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/core to v2.13.2
- Bump @memberjunction/global to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Bump @memberjunction/core to v2.13.1
- Bump @memberjunction/global to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/core to v2.13.0
- Bump @memberjunction/global to v2.13.0

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Bump @memberjunction/core to v2.12.0
- Bump @memberjunction/global to v2.12.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Bump @memberjunction/core to v2.11.0
- Bump @memberjunction/global to v2.11.0

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.10.0
- Bump @memberjunction/global to v2.10.0

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Bump @memberjunction/core to v2.9.0
- Bump @memberjunction/global to v2.9.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Bump @memberjunction/core to v2.8.0
- Bump @memberjunction/global to v2.8.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Bump @memberjunction/core to v2.7.1
- Bump @memberjunction/global to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.7.0
- Bump @memberjunction/global to v2.7.0

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Bump @memberjunction/core to v2.6.1
- Bump @memberjunction/global to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.6.0
- Bump @memberjunction/global to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:02 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.5.2
- Bump @memberjunction/global to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/core to v2.5.1
- Bump @memberjunction/global to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:06 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.5.0
- Bump @memberjunction/global to v2.5.0

### Patches

- Applying package updates [skip ci] (nico.ortiz@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Bump @memberjunction/core to v2.4.1
- Bump @memberjunction/global to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.4.0
- Bump @memberjunction/global to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Minor changes

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

### Patches

- Bump @memberjunction/core to v2.3.3
- Bump @memberjunction/global to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.3.2
- Bump @memberjunction/global to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.3.1
- Bump @memberjunction/global to v2.3.1

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.2.2
- Bump @memberjunction/global to v2.3.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.2.1
- Bump @memberjunction/global to v2.2.1

## 2.1.6

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

### Patches

- Bump @memberjunction/core to v2.2.0
- Bump @memberjunction/global to v2.2.0

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/core to v2.1.5
- Bump @memberjunction/global to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/core to v2.1.4
- Bump @memberjunction/global to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Bump @memberjunction/core to v2.1.3
- Bump @memberjunction/global to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.1.2
- Bump @memberjunction/global to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/core to v2.1.1
- Bump @memberjunction/global to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:27 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.8.1
- Bump @memberjunction/global to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Minor changes

- Applying package updates [skip ci] (jonathan.stfelix@bluecypress.io)
- Bump @memberjunction/core to v1.8.0
- Bump @memberjunction/global to v1.8.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.7.1

Wed, 12 Jun 2024 20:13:29 GMT

### Patches

- Bump @memberjunction/core to v1.7.1
- Bump @memberjunction/global to v1.7.1

## 1.7.0

Wed, 12 Jun 2024 18:53:38 GMT

### Minor changes

- Bump @memberjunction/core to v1.7.0
- Bump @memberjunction/global to v1.7.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.6.1

Tue, 11 Jun 2024 06:50:06 GMT

### Patches

- Bump @memberjunction/core to v1.6.1
- Bump @memberjunction/global to v1.6.1

## 1.6.0

Tue, 11 Jun 2024 04:59:29 GMT

### Minor changes

- Bump @memberjunction/core to v1.6.0
- Bump @memberjunction/global to v1.6.0

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.5.3
- Bump @memberjunction/global to v1.5.3

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Bump @memberjunction/core to v1.5.2
- Bump @memberjunction/global to v1.5.2

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Bump @memberjunction/core to v1.5.1
- Bump @memberjunction/global to v1.5.1

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v1.5.0
- Bump @memberjunction/global to v1.5.0

## 1.4.1

Fri, 07 Jun 2024 04:36:53 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.4.1
- Bump @memberjunction/global to v1.4.1

## 1.4.0

Sat, 25 May 2024 15:30:17 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v1.4.0
- Bump @memberjunction/global to v1.4.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.3.3

Thu, 23 May 2024 18:35:52 GMT

### Patches

- Bump @memberjunction/core to v1.3.3
- Bump @memberjunction/global to v1.3.3

## 1.3.2

Thu, 23 May 2024 14:19:50 GMT

### Patches

- Bump @memberjunction/core to v1.3.2
- Bump @memberjunction/global to v1.3.2

## 1.3.1

Thu, 23 May 2024 02:29:25 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.3.1
- Bump @memberjunction/global to v1.3.1

## 1.3.0

Wed, 22 May 2024 02:26:03 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.3.0
- Bump @memberjunction/global to v1.3.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.2.2

Thu, 02 May 2024 19:46:38 GMT

### Patches

- Bump @memberjunction/core to v1.2.2
- Bump @memberjunction/global to v1.2.2

## 1.2.1

Thu, 02 May 2024 16:46:11 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.2.1
- Bump @memberjunction/global to v1.2.1

## 1.2.0

Mon, 29 Apr 2024 18:51:58 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.2.0
- Bump @memberjunction/global to v1.2.0

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Bump @memberjunction/core to v1.1.3
- Bump @memberjunction/global to v1.1.3

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Bump @memberjunction/core to v1.1.2
- Bump @memberjunction/global to v1.1.2

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Bump @memberjunction/core to v1.1.1
- Bump @memberjunction/global to v1.1.1

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Bump @memberjunction/core to v1.1.0
- Bump @memberjunction/global to v1.1.0

## 1.0.11

Wed, 24 Apr 2024 20:57:41 GMT

### Patches

- - bug fixes in Skip UI \* added exception handling to ReportResolver (97354817+AN-BC@users.noreply.github.com)
- - Created mj-form-field component in the ng-base-forms package which is a higher order way of binding to a given field on an entity and it dynamically selects the needed control. Provides several advantages including the ability to easily upgrade functionality on forms and to conditionally render fields in their entirety only when needed (e.g. not show them at all when read only field and new record). _ Updated CodeGenLib to emit this new style of Angular Code _ Ran Code Gen (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.0.11
- Bump @memberjunction/global to v1.0.11

## 1.0.9

Sun, 14 Apr 2024 15:50:05 GMT

### Patches

- Bump @memberjunction/core to v1.0.9
- Bump @memberjunction/global to v1.0.9

## 1.0.8

Sat, 13 Apr 2024 02:32:44 GMT

### Patches

- Update build and publish automation (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v1.0.8
- Bump @memberjunction/global to v1.0.8

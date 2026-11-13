# @memberjunction/predictive-studio-core

## 6.3.0-edge.0

### Minor Changes

- 6fd9fb7: Predictive Studio training under a declared unit and protocol: Prediction Units (immutable versions with outcome window, censoring and task type),
  as-of feature assembly over dated history with typed columns, fingerprinted Training Snapshots, Evaluation Protocols
  saved before search, a trainer that reports proper scores, baselines and intervals, and a three-outcome gate
  (model, keep-simple-baseline, no-signal). Adds a Local File System storage driver.

  Predictive Studio decides what a training run ships with a three-outcome gate (the model, a simple baseline, or no
  signal), stores that decision with its reason on the run, and renders the trust verdict from it.

  The seeded-random holdout hashes the unit row's group key (lower-cased; the entity key when the unit declares no group),
  not its row id, so every row of one group lands on the same side of the holdout. No released version stored a
  seeded-random holdout, so nothing deployed re-carves.

  An incumbent-heuristic baseline is refused for multiclass units (the protocol rules and the sidecar both refuse it, and the default protocol leaves it out): it scores one number per row, which a multiclass log loss cannot judge.
  An incumbent rule with no value on a training-snapshot row (a column it reads is missing there) refuses the run before training (`incumbent-score-missing`, naming the count and the first row ids) instead of failing at the holdout stage.
  - `@memberjunction/predictive-studio-core`: `GateRules` (the gate decision table, proven equal to the reference
    pipeline's and to the sidecar's on seeded cases, plus two guards: a holdout minority class below
    `MinMinorityClassRows` and a binary AUC interval that contains 0.5 never ship) and `GateRecords` (the stored gate
    record, the `gate` member of the `ps-run-results/v2` envelope). `TrustVerdicts.DeriveTrustVerdict` takes
    `{ ValidationResults, Lineage }` and renders the stored gate decision; `TrustGrade`, `TrustModelInput`,
    `MajorityBaselineFinding`, `TrustVerdicts.TrustDots` and the free functions `DeriveTrustVerdict`,
    `deriveTrustVerdict`, `TrustEvidenceLine`, `trustEvidenceLine`, `TrustDots`, `trustDots` are removed.
  - `@memberjunction/predictive-studio`: a unit training run refuses a sidecar gate that differs from the TypeScript
    decision (`sidecar-gate-mismatch`), creates the model row from the shipped artifact only (none under `no-signal`),
    and `TrainModelResult.model` is nullable. `IRecordLoader.resolveAlgorithmIDForDriver` and
    `IArtifactStore.AssertWritable` are new required members (see the storage paragraph below for `save` / `delete`). `PredictiveStudioBuildOutcome.trustGrade` / `trustOneLiner` are
    renamed `trustTitle` / `headline`;
    `GenerateMarkdownReport` takes `trustTitle` / `headline`; `SingleModelLeaderboard` takes a `TrustComparison | null`.
    The free functions `ExtractNormalizedScore` / `extractNormalizedScore` are removed; use
    `ExperimentScores.ExtractNormalizedScore(holdoutMetricsJson, successMetric)` (holdout metrics only, null when unmeasured).
  - `@memberjunction/ng-dashboards`: the business catalog opens only predictions the gate shipped;
    `toBusinessPredictionCard` / `buildBusinessCatalog` (and the PascalCase free functions) → `BusinessPredictions.*`;
    `BusinessPredictionInput.modelId` / `name` are renamed `ModelID` / `Name`;
    `ImprovePromptInput.TrustGrade` is renamed `TrustTitle`;
    the deprecated lowercase helpers of the Predictive Studio agent context, models and studio resources and
    `buildImprovePrompt` are removed.
  - `@memberjunction/predictive-studio-sidecar`, `@memberjunction/predictive-studio-truth-suite`: the gate parity tests
    (`test:gate-parity`, `test:gate-parity-refpipe`).
  - `@memberjunction/integration-test-suite`: the Predictive Studio gate checks over the planted-truth datasets, for
    Prediction Units (unit rows and reference keys, censored rows excluded, label versions, task-type refusals, as-of
    values equal to history, training/scoring parity, value provenance, the snapshot manifest and reproducible retrains)
    and for training (date-carved, new-entity and rolling-origin holdouts, proper-score ranking per task family,
    baselines and intervals, calibration, slices, leakage flags, inner-fold selection and optimism, protocols created
    before their runs, determinism, and the gate decision: how often a planted null publishes, the AUC-interval and
    minority-class guards, the kept simple baseline, the incumbent heuristic as a named comparator).
  - `@memberjunction/ng-artifacts`: the ML Experiment Results leaderboard shows each candidate's inner-fold mean with its
    interval and tags the winner's score optimistic, from rows built by the new `LeaderboardRows`
    (`ml-leaderboard-rows.ts`, PascalCase `NormalizedLeaderboardRow` members); the deprecated `formatImportance` /
    `formatScore` aliases of `MLExperimentResultsViewerComponent` are removed.
  - `@memberjunction/core`: listed for the Predictive Studio prompt and agent metadata corrected on this branch.

  Prediction Units and Evaluation Protocols are authored and viewed in Explorer, every existing pipeline migrates to
  version 1 of each, and the training path without them is removed.
  - `@memberjunction/predictive-studio-core`: `ProtocolRows`, `ProtocolEdits`, `UnitEdits` (one owner of the unit and
    protocol row writes, the next-version rules and the label version bump) and `LegacyPipelines` (the migration's
    mapping from a pipeline's columns to a unit and a protocol, or the archive or hold reason). Stored rows whose date is
    not a calendar day fail parse (`UtcDay.IsIsoDay`). `TrainRequest` and the `/train` contract are removed. New refusal
    code `TIME_HOLDOUT_REQUIRED`.
  - `@memberjunction/predictive-studio`: the `Migrate Pipelines to Prediction Units and Evaluation Protocols` Action (dry run by default) binds
    each pipeline to a version-1 unit and protocol, archives one that cannot be expressed, or holds one with its reason
    (an undetermined adverse class, a declared time index, a date column with a value that is not a date). A pipeline without a unit is refused `UNIT_REQUIRED`; the
    legacy training path and `MLSidecar.Train` are deleted. A time-indexed pipeline under a holdout that does not respect
    time is refused (`time-index-needs-time-holdout`). An advancing fixed decision date mints the next unit version only
    after every pre-run refusal passes, and removes it if the run then fails to bind. A model is scored on the unit path
    only when its own Lineage names a unit. The as-of assembler reads a stored value for a row decided on or after the
    assembly day only when no change history covers that day. A parent record hard-deleted after the decision date
    is read from its Record Changes (its stored fields from its Delete row) and is uncovered from its Delete on; a
    missing record with no Delete still refuses `truncated-read`. `PredictiveStudio.TrainModel` refuses `asOf` (including
    `{ Mode: 'none' }`), `labelEventDates`, `maxRows` and `primaryKeyField` by presence; its output carries the stored
    gate decision, the snapshot and the protocol version, `modelId`/`version` are absent when no model ships (status
    `NoSignal` or `KeptExistingRule`), and an unreadable stored result fails. The Train ML Model Action loses its `MaxRows`
    input and gains `GateOutcome`, `GateReason`, `TrainingSnapshotID` and `EvaluationProtocolID` outputs.
  - `@memberjunction/core-entities`: the regenerated TrainModel remote-operation types and the `MJ: ML Prediction Units`,
    `MJ: ML Evaluation Protocols` and `MJ: ML Training Snapshots` entities.
  - `@memberjunction/core-entities-server`: server subclasses that keep a saved Prediction Unit, Evaluation Protocol or
    Training Snapshot row from ever being updated (`VersionedRowGuard`, shared by the three), check a new unit or
    protocol version against version n−1, and check that a pipeline agrees with the unit and protocol it binds.
  - `@memberjunction/storage`: `LocalFileSystemStorage` (`Local File System Storage` driver, root `STORAGE_LOCAL_ROOT`;
    its pre-authorised downloads are `file://` URLs, readable only on the same host). The `Local File System` provider
    row ships inactive; Predictive Studio names it through `PS_STORAGE_PROVIDER` (default `Local File System`), the one
    setting for Training Snapshot files and trained model files alike, and a cloud or multi-host install points that at
    a cloud provider.
  - `@memberjunction/predictive-studio`: trained model files are stored through the `PS_STORAGE_PROVIDER` storage
    provider (`StorageProviderArtifactStore`, keys `predictive-studio/model-artifacts/<uuid>/<name>`) and read through
    the provider their `MJ: Files` row names (`StorageProviderArtifactLoader`); `PredictiveStudioStorage` resolves the
    provider for snapshots and models. Model files trained before 6.3 (`MJ: Files.ProviderKey` empty) are still read
    from `PS_ARTIFACT_DIR`. `IArtifactStore.save` / `delete` are `save(bytes, name)` / `delete(fileId)` (no
    `contextUser`: the store writes as the user of the `PredictiveStudioStorage` it is built over), and
    `IArtifactLoader.load` is `load(fileId, contextUser, provider)` with a required `UserInfo` and `provider`.
    `IArtifactStore.AssertWritable` is a new required member the engine calls before a run is written: it puts and
    deletes a probe object under `predictive-studio/model-artifacts/`, so a provider that is unconfigured or cannot write
    (wrong credentials, an unwritable root) refuses the run before training. A run that fails after storing its
    artifacts deletes its model row and artifacts. `StorageProviderSnapshotFileStore` takes `(entityFactory, storage)`;
    `StorageProviderSnapshotFileStore.ForProviderName(entityFactory, provider, contextUser, providerName?)` builds one
    over its own storage. The local-disk model
    artifact store and loader, and their active-provider lookup, are removed.
  - `@memberjunction/server`, `@memberjunction/server-bootstrap`, `@memberjunction/server-bootstrap-lite`,
    `@memberjunction/ng-bootstrap`, `@memberjunction/ng-bootstrap-lite`, `@memberjunction/ng-core-entity-forms`: the
    generated GraphQL schema, class registrations and record forms for the three new entities.
  - `@memberjunction/ng-explorer-core`: the generated lazy-load keys of the Studio record panels on `MJ: ML Prediction Units` and
    `MJ: ML Evaluation Protocols` forms.
  - `@memberjunction/ng-dashboards`: the Studio's Prediction Units and Evaluation Protocols sections, the unit and
    protocol editors and version lists, the pipeline bindings panel and the model form's protocol results panel; the
    pipeline wizard binds a new pipeline to version 1 of its unit and the default protocol. The deprecated lowercase
    aliases of `PSPipelinesComponent`, `PSPipelineWizardComponent` and the Predictive Studio nav helpers are removed:
    bind `[CurrentUser]`, `[CloneFrom]`, `[InitialAlgorithmId]`, `(Saved)`, `(TrainRequested)`, `(Closed)` and the other
    PascalCase members. `PSPredictionsResourceComponent.applicationId` is `ApplicationID`, inherited with `CurrentUser` and
    `ChatEnvironmentId` from `PSResourceBase`.
  - `@memberjunction/predictive-studio-sidecar`: the `/train` route and its legacy helpers (`build_estimator`, `fit_transform`,
    `serialize_envelope`) are removed; `/predict` still loads legacy envelopes. The `ps-predictor/v2` envelope's payload
    key is `payloadB64`. A snapshot header's `capacityPerPeriod` must be a positive integer or null.
  - `@memberjunction/predictive-studio-truth-suite`, `@memberjunction/integration-test-suite`: the harness trains every
    pipeline through its unit; six containment checks are re-pinned to the unit path; the pipeline-migration rig.
    `RunRecords.PipelineIDs` / `ModelIDs` are `RecordIDSet`s (iteration yields IDs as recorded, not lower-cased).
    `HarnessFileStorage` (and the rigs' `RigStorage`) is removed: training stores files through the provider
    `PS_STORAGE_PROVIDER` names whatever its `IsActive` flag, so the harness and rigs no longer switch a File Storage
    Provider on.
  - `@memberjunction/core`: listed for the Migrate Pipelines Action and the Train ML Model parameter metadata.

  Holds no sign-off overrides: a binary or multiclass model whose holdout calibration slope is outside 0.8–1.2, or could
  not be measured, is held in Draft (Lineage `calibrationHold`, a `CALIBRATION HOLD` run note) and the Promote ML Model
  action refuses it with `CALIBRATION_HOLD`; a forecast's series forecaster, which `/predict` does not serve, is refused
  with `MODEL_NOT_SERVABLE` and never scored. A kept simple baseline carries its run's leakage audit
  (`trainingLeakageAudit`), so it needs the same leakage sign-off as the finalist. The Pipeline Builder agent publishes
  through the promotion gate. Binding a binary or multiclass unit to a protocol whose calibration is `not-applicable` is
  refused.
  - Round 3 (2026-11-07): a Delete in force reads as deleted whatever the record's history start, and a hard-deleted record's Delete row is continuity-checked (`@memberjunction/predictive-studio`); a grouped unit refuses `repeated-stratified-kfold` inner folds (`inner-validation-ungrouped`), a grouped non-forecast unit accepts only `cluster-bootstrap` intervals (`intervals-not-clustered`), and a migrated legacy pipeline bound to a grouped unit gets grouped folds (`@memberjunction/predictive-studio-core`, `@memberjunction/core-entities-server`); the sidecar refuses a snapshot whose reference score is missing on any row (`reference-score-missing`, `@memberjunction/predictive-studio-sidecar`); an undated scenario fixture keeps its group key (`@memberjunction/predictive-studio-truth-suite`); a throwing artifact cleanup no longer masks the `MJ: Files` save error (`@memberjunction/predictive-studio`).
  - Round 4 (2026-11-08): a grouped unit refuses any inner validation without its group key, `blocked-time` without a key included (`@memberjunction/predictive-studio-core`); the as-of history covers only the requested keys, a Delete in force wins on both readers before the created-after check, the not-updatable path included, an unreached history excludes under exclude-and-count on the stored-value reader as it already did on the replay reader, and a stored `__mj_CreatedAt` later than an earlier change row other than the history's opening Create dates a re-creation and is ignored (`@memberjunction/predictive-studio`); two standing matrix tests pin reader agreement on existence and which sidecar fold builders keep a group together (`@memberjunction/predictive-studio`, `@memberjunction/predictive-studio-sidecar`); a member × period unit naming no group key is grouped by its grain record, so it gets grouped folds and clustered intervals by default and refuses stratified folds (`@memberjunction/predictive-studio-core`), and a windowed aggregate counts a child hard-deleted after the decision day as its Delete row recorded it (`@memberjunction/predictive-studio`); change rows of one record at one instant are ordered by whether the record continues after that instant, which the next change row proves unless it is a Create and, at its last instant, a current row (a Delete ends the instant of a record that is gone, and precedes the Create of one that was re-created, so a record re-created at one instant and hard-deleted later reads its second incarnation between the two, and one created and deleted at one instant and re-created later reads deleted between the two), a windowed aggregate's child history is loaded once so coverage counts each child record once, and a child row or a join-key unit row deleted and re-created after the decision day is read from the Delete row that ended the incarnation standing then (`@memberjunction/predictive-studio`).

### Patch Changes

- Updated dependencies [03bb8b6]
- Updated dependencies [31cc053]
- Updated dependencies [6fd9fb7]
- Updated dependencies [5c4fa7c]
- Updated dependencies [7ace3ee]
- Updated dependencies [c889b72]
  - @memberjunction/global@6.3.0-edge.0

## 6.2.0

### Minor Changes

- a17a228: Consolidate metadata cache API methods and update PredictiveStudio outcome config score band semantics per review.
  - **Metadata Cache API**:
    - Make `HasCachedRecordName` and `GetCachedRecordNameOnlyIfCached` required methods on `IMetadataProvider`.
    - Remove deprecated `GetCachedRecordNameSync` across core and UI consumers (`navigation.service.ts`, `record-origin-crumb.component.ts`, `app-routing.module.ts`).
  - **Predictive Studio Outcome Config**:
    - Score band assignment now uses clean half-open intervals `[Min, Max)` with the highest band inclusive `[Min, Max]`, eliminating floating-point sentinel tolerances.
    - Non-finite and out-of-range normalized model scores (`< 0` or `> 1`) return `null` rather than silently clamping.
    - Non-standard/neutral target variables default to neutral gray band styling without asserting polarity.
    - Warn on JSON parse failures in `resolveOutcomeConfig`.
  - **Lockfile & Dev Scripts**:
    - Restored `@memberjunction/tag-engine-base` lockfile sync.
    - Restored MJExplorer dev port 4201.

- ff73341: Add the Predictive Studio planted-truth test suite (`packages/AI/PredictiveStudio/TruthSuite`: the datasets and the harness that loads and scores them) and Phase-0 containment safeguards. The containment gates are MJ Tests run with `mj test suite "Predictive Studio Gates — Containment"`. Containment fixes: uncapped default row reads for training and filter-scoped scoring, lifecycle status gates and dry-run isolation for model scoring, typed refusal codes the gates assert on, a feature-importance kind that decides which model drivers may be shown, polarity-aware risk bands and non-causal driver copy across UI and prompt templates, seeded, reproducible training (a fixed random state; the truth-suite sidecar also pins one thread for its determinism gate) and honest out-of-sample validation metrics (`kfold`/`holdout`), refusal of no-effect `AsOfStrategy` configurations, withholding of non-origin-split time-series forecasts, majority-class baseline enforcement on imbalanced classifiers, disabling the Run Experiment Session action, and keeping the maintenance job disabled, since nothing runs either yet.

  Note: Pre-existing models trained with locked holdout explicitly disabled (`LockedHoldoutFraction = 0`) or graded on accuracy alone (without `AUC` or a recorded `BaselineAccuracy`) will display as unmeasured until retrained. Existing models' global driver lists stay hidden until retrained, because a model with no stored feature-importance kind has its drivers hidden.

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

- 6e6e3f1: Surface explicit warnings when candidate feature sets contain unmapped llm-derived features during model training and pipeline generation.

## 6.2.0-edge.8

## 6.2.0-edge.7

## 6.2.0-edge.6

### Minor Changes

- ff73341: Add the Predictive Studio planted-truth test suite (`packages/AI/PredictiveStudio/TruthSuite`: the datasets and the harness that loads and scores them) and Phase-0 containment safeguards. The containment gates are MJ Tests run with `mj test suite "Predictive Studio Gates — Containment"`. Containment fixes: uncapped default row reads for training and filter-scoped scoring, lifecycle status gates and dry-run isolation for model scoring, typed refusal codes the gates assert on, a feature-importance kind that decides which model drivers may be shown, polarity-aware risk bands and non-causal driver copy across UI and prompt templates, seeded, reproducible training (a fixed random state; the truth-suite sidecar also pins one thread for its determinism gate) and honest out-of-sample validation metrics (`kfold`/`holdout`), refusal of no-effect `AsOfStrategy` configurations, withholding of non-origin-split time-series forecasts, majority-class baseline enforcement on imbalanced classifiers, disabling the Run Experiment Session action, and keeping the maintenance job disabled, since nothing runs either yet.

  Note: Pre-existing models trained with locked holdout explicitly disabled (`LockedHoldoutFraction = 0`) or graded on accuracy alone (without `AUC` or a recorded `BaselineAccuracy`) will display as unmeasured until retrained. Existing models' global driver lists stay hidden until retrained, because a model with no stored feature-importance kind has its drivers hidden.

## 6.2.0-edge.5

## 6.2.0-edge.4

## 6.2.0-edge.3

## 6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

## 6.2.0-edge.0

### Minor Changes

- a17a228: Consolidate metadata cache API methods and update PredictiveStudio outcome config score band semantics per review.
  - **Metadata Cache API**:
    - Make `HasCachedRecordName` and `GetCachedRecordNameOnlyIfCached` required methods on `IMetadataProvider`.
    - Remove deprecated `GetCachedRecordNameSync` across core and UI consumers (`navigation.service.ts`, `record-origin-crumb.component.ts`, `app-routing.module.ts`).
  - **Predictive Studio Outcome Config**:
    - Score band assignment now uses clean half-open intervals `[Min, Max)` with the highest band inclusive `[Min, Max]`, eliminating floating-point sentinel tolerances.
    - Non-finite and out-of-range normalized model scores (`< 0` or `> 1`) return `null` rather than silently clamping.
    - Non-standard/neutral target variables default to neutral gray band styling without asserting polarity.
    - Warn on JSON parse failures in `resolveOutcomeConfig`.
  - **Lockfile & Dev Scripts**:
    - Restored `@memberjunction/tag-engine-base` lockfile sync.
    - Restored MJExplorer dev port 4201.

### Patch Changes

- 6e6e3f1: Surface explicit warnings when candidate feature sets contain unmapped llm-derived features during model training and pipeline generation.

## 6.1.0

## 6.1.0-edge.7

## 6.1.0-edge.6

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

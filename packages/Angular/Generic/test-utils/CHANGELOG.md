# @memberjunction/ng-test-utils

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

- Updated dependencies [62eca59]
- Updated dependencies [4d2c52d]
- Updated dependencies [7ed32af]
- Updated dependencies [567d7b9]
- Updated dependencies [c07f654]
- Updated dependencies [9ec4dce]
- Updated dependencies [03bb8b6]
- Updated dependencies [0ebebfe]
- Updated dependencies [9eb002d]
- Updated dependencies [1dd1af1]
- Updated dependencies [87ac205]
- Updated dependencies [18bb8fa]
- Updated dependencies [6049806]
- Updated dependencies [63636e0]
- Updated dependencies [abb285b]
- Updated dependencies [4884a47]
- Updated dependencies [5c3d369]
- Updated dependencies [b2789ee]
- Updated dependencies [2641e47]
- Updated dependencies [b332459]
- Updated dependencies [100b9c2]
- Updated dependencies [6bd8271]
- Updated dependencies [6fd9fb7]
- Updated dependencies [70b5e38]
- Updated dependencies [28cec7d]
- Updated dependencies [b68d388]
- Updated dependencies [8c3c8a4]
- Updated dependencies [fbbc06a]
- Updated dependencies [2b349b9]
- Updated dependencies [c889b72]
  - @memberjunction/core@6.3.0-edge.0

## 6.2.0

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

- 920bef8: Give `mj-combobox`, `mj-switch`, `mj-numeric-input`, `mj-datepicker` and `mj-page-search` the
  accessible-name inputs `mj-dropdown` already had (`AriaLabel`, `AriaLabelledBy`, `AriaDescribedBy`,
  `InputId`), from a shared `MJNamedControlBase`. A control with no accessible name announces as its
  role and state alone, which fails WCAG 2.1 4.1.2. The name reaches each control's secondary pieces
  too — the combobox's toggle and clear buttons, the datepicker's toggle and calendar grid, the
  dropdown's filter box — so a form full of them no longer presents a row of identical unnamed
  controls. Unset inputs render no attribute at all, since an empty `aria-label` overrides every other
  naming source.

  `mj-combobox` additionally moves `role="combobox"` and its state attributes onto the `<input>`,
  where focus actually lands, and gains `aria-activedescendant` so the arrow-key highlight is
  announced rather than being a CSS class alone.

  A new dev-mode `WarnIfUnnamed` guard warns once per control that renders with no accessible name,
  alongside the existing `mjButton` and `mjClickable` guards, and is a no-op in production.

- b8a9e5e: Remove nested `UUIDsEqual` scans where both lists grow with the data or the code runs on every render. Fix one cross-database lookup bug.
  - **Rubric publish validation could miss advisory parents.** `ValidateRubricTree` looked a raw `parentId` up in a map with normalized keys. On SQL Server (upper-case IDs) the advisory-ancestor walk silently stopped, so a non-advisory criterion under an advisory group was not reported. The map is now a `UUIDMap`.
  - **Per-render getters no longer rescan the entity list.** The Entity form's `FormChromeCandidates`, the Data Explorer's `RecentEntities` / `FavoriteEntities` and the storage admin's `FilteredAccountRows` now read cached or once-built indexes.
  - **Entity lookups by ID** in the ERD, the get-entity-details and list-entities actions, recent-access and the form builder now use the provider's indexed `EntityByID`. The application dialog uses a once-built index.
  - **Other once-built indexes:** tag lookups, permission grantee names, orphaned-conversation owners and flow-editor node moves.
  - `createFakeProvider` (`ng-test-utils`) now implements `EntityByID`, like a real provider.
  - **New helper:** `GroupByUUID(items, getId?)` in `@memberjunction/global` groups items by a UUID in one pass, each group in input order.
  - **Server sites that matched two growing lists:** the user cache (users × user roles), resource-permission deduplication, user/role sync, default-app user applications, scheduled-job statistics, MCP action discovery, REST connector schema introspection and rubric calibration.
  - **Offline tools:** CodeGen relationship sync and CHECK-constraint value lists, CodeGen's related-entity form lookups, and `mj artifacts reclassify`.
  - **Angular screens that scale with the data:** the AI Agent form's linked prompts and actions, the prompt priority matrix, the Testing explorer, the conversations message cache, the Query Browser tree, the Actions overview and categories, the dashboard browser, list-form bulk remove and credentials bulk actions.

  Behaviour is unchanged otherwise, and each site has a test that also passes against the old code.

- Updated dependencies [39b35f1]
- Updated dependencies [e97d95c]
- Updated dependencies [6c36fb6]
- Updated dependencies [cc36de5]
- Updated dependencies [9cb815b]
- Updated dependencies [709de1a]
- Updated dependencies [c159e2f]
- Updated dependencies [d2db108]
- Updated dependencies [dfe40a4]
- Updated dependencies [a3539d2]
- Updated dependencies [db39145]
- Updated dependencies [41274aa]
- Updated dependencies [c671f85]
- Updated dependencies [49f26d9]
- Updated dependencies [5e4205c]
- Updated dependencies [7be1684]
- Updated dependencies [21f9e15]
- Updated dependencies [c8c48e1]
- Updated dependencies [f2248d5]
- Updated dependencies [5465489]
- Updated dependencies [3bace5a]
- Updated dependencies [88e6902]
- Updated dependencies [c87f87a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [e1fd4c1]
- Updated dependencies [4248fb3]
- Updated dependencies [d29b5c2]
- Updated dependencies [59e32e0]
- Updated dependencies [0a7c255]
- Updated dependencies [0adaf76]
- Updated dependencies [0ff7523]
- Updated dependencies [d86bcbc]
- Updated dependencies [42df19d]
- Updated dependencies [d6b39c4]
- Updated dependencies [5f0baf7]
- Updated dependencies [f65fec7]
- Updated dependencies [9b5b489]
- Updated dependencies [cb205de]
- Updated dependencies [a6f8c1c]
- Updated dependencies [56d7614]
- Updated dependencies [683f652]
- Updated dependencies [914e6ff]
- Updated dependencies [0fb3649]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [705ab4e]
- Updated dependencies [a7da50b]
- Updated dependencies [0f04590]
- Updated dependencies [4c0eaec]
- Updated dependencies [f26084f]
- Updated dependencies [db39145]
- Updated dependencies [f48dffc]
- Updated dependencies [41c2c08]
- Updated dependencies [630bb88]
- Updated dependencies [e69634e]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [17cc774]
- Updated dependencies [dae1d31]
- Updated dependencies [bfd67c6]
- Updated dependencies [80905a1]
- Updated dependencies [397ae9a]
- Updated dependencies [7e72c86]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [d296edd]
- Updated dependencies [66fd011]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [509d2aa]
- Updated dependencies [196160a]
- Updated dependencies [5513c2a]
- Updated dependencies [90829e3]
- Updated dependencies [5986939]
- Updated dependencies [8c120db]
- Updated dependencies [9a2d7cc]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [60bd774]
- Updated dependencies [0a348e2]
- Updated dependencies [ac18db8]
- Updated dependencies [35da130]
- Updated dependencies [5b41d48]
- Updated dependencies [4b9542c]
- Updated dependencies [28c92e0]
- Updated dependencies [5f707d1]
- Updated dependencies [369e229]
- Updated dependencies [ba00ac7]
- Updated dependencies [8a5d2c0]
- Updated dependencies [aca4317]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
- Updated dependencies [2c590b0]
- Updated dependencies [dc38250]
  - @memberjunction/core@6.2.0

## 6.2.0-edge.8

### Patch Changes

- Updated dependencies [6c36fb6]
- Updated dependencies [9cb815b]
- Updated dependencies [d2db108]
- Updated dependencies [c671f85]
- Updated dependencies [59e32e0]
- Updated dependencies [5f0baf7]
- Updated dependencies [a6f8c1c]
- Updated dependencies [56d7614]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [e69634e]
- Updated dependencies [ac18db8]
  - @memberjunction/core@6.2.0-edge.8

## 6.2.0-edge.7

### Patch Changes

- Updated dependencies [c8c48e1]
- Updated dependencies [3bace5a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [42df19d]
- Updated dependencies [d6b39c4]
- Updated dependencies [f65fec7]
- Updated dependencies [0fb3649]
- Updated dependencies [4c0eaec]
- Updated dependencies [397ae9a]
- Updated dependencies [509d2aa]
- Updated dependencies [9a2d7cc]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [aca4317]
  - @memberjunction/core@6.2.0-edge.7

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [f2248d5]
- Updated dependencies [0ff7523]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [dae1d31]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [0a348e2]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/core@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- Updated dependencies [39b35f1]
- Updated dependencies [c159e2f]
- Updated dependencies [db39145]
- Updated dependencies [5e4205c]
- Updated dependencies [5465489]
- Updated dependencies [d29b5c2]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [7e72c86]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/core@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- b8a9e5e: Remove nested `UUIDsEqual` scans where both lists grow with the data or the code runs on every render. Fix one cross-database lookup bug.
  - **Rubric publish validation could miss advisory parents.** `ValidateRubricTree` looked a raw `parentId` up in a map with normalized keys. On SQL Server (upper-case IDs) the advisory-ancestor walk silently stopped, so a non-advisory criterion under an advisory group was not reported. The map is now a `UUIDMap`.
  - **Per-render getters no longer rescan the entity list.** The Entity form's `FormChromeCandidates`, the Data Explorer's `RecentEntities` / `FavoriteEntities` and the storage admin's `FilteredAccountRows` now read cached or once-built indexes.
  - **Entity lookups by ID** in the ERD, the get-entity-details and list-entities actions, recent-access and the form builder now use the provider's indexed `EntityByID`. The application dialog uses a once-built index.
  - **Other once-built indexes:** tag lookups, permission grantee names, orphaned-conversation owners and flow-editor node moves.
  - `createFakeProvider` (`ng-test-utils`) now implements `EntityByID`, like a real provider.
  - **New helper:** `GroupByUUID(items, getId?)` in `@memberjunction/global` groups items by a UUID in one pass, each group in input order.
  - **Server sites that matched two growing lists:** the user cache (users × user roles), resource-permission deduplication, user/role sync, default-app user applications, scheduled-job statistics, MCP action discovery, REST connector schema introspection and rubric calibration.
  - **Offline tools:** CodeGen relationship sync and CHECK-constraint value lists, CodeGen's related-entity form lookups, and `mj artifacts reclassify`.
  - **Angular screens that scale with the data:** the AI Agent form's linked prompts and actions, the prompt priority matrix, the Testing explorer, the conversations message cache, the Query Browser tree, the Actions overview and categories, the dashboard browser, list-form bulk remove and credentials bulk actions.

  Behaviour is unchanged otherwise, and each site has a test that also passes against the old code.

- Updated dependencies [49f26d9]
- Updated dependencies [88e6902]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [90829e3]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
  - @memberjunction/core@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [dfe40a4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
  - @memberjunction/core@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [0adaf76]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [369e229]
  - @memberjunction/core@6.2.0-edge.2

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

- 920bef8: Give `mj-combobox`, `mj-switch`, `mj-numeric-input`, `mj-datepicker` and `mj-page-search` the
  accessible-name inputs `mj-dropdown` already had (`AriaLabel`, `AriaLabelledBy`, `AriaDescribedBy`,
  `InputId`), from a shared `MJNamedControlBase`. A control with no accessible name announces as its
  role and state alone, which fails WCAG 2.1 4.1.2. The name reaches each control's secondary pieces
  too — the combobox's toggle and clear buttons, the datepicker's toggle and calendar grid, the
  dropdown's filter box — so a form full of them no longer presents a row of identical unnamed
  controls. Unset inputs render no attribute at all, since an empty `aria-label` overrides every other
  naming source.

  `mj-combobox` additionally moves `role="combobox"` and its state attributes onto the `<input>`,
  where focus actually lands, and gains `aria-activedescendant` so the arrow-key highlight is
  announced rather than being a CSS class alone.

  A new dev-mode `WarnIfUnnamed` guard warns once per control that renders with no accessible name,
  alongside the existing `mjButton` and `mjClickable` guards, and is a no-op in production.

- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [a7da50b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
  - @memberjunction/core@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [2c590b0]
  - @memberjunction/core@6.2.0-edge.0

## 6.1.0

### Patch Changes

- c09c818: MJDropdown can finally be given an accessible name (#3860)

  `mj-dropdown` renders a `div[role="combobox"]` with no way to name it, so every one of the ~94 call
  sites in this repo announced as "combobox, collapsed" with no hint of what it selects — WCAG 2.1
  4.1.2 (Name, Role, Value). Four optional passthroughs close it, all applied to the popup listbox as
  well as the trigger so both halves announce the same name:
  - **`AriaLabelledBy`** — the id of a VISIBLE label, and the preferred wiring when one exists. Not
    `<label for>`: the trigger is a `div`, which label-for neither names nor focuses.
  - **`AriaLabel`** — for when no visible label exists.
  - **`AriaDescribedBy`** — hint and error text.
  - **`InputId`** — an id on the trigger so other markup can reference it.

  Absent beats empty: none of the four renders an attribute when unset, because `aria-label=""` is
  worse than no attribute — it overrides every other naming source with an explicitly empty name.

  The filterable panel's filter box is named from the same source rather than being a second unnamed
  control. Under `AriaLabelledBy` it composes "Filter" with the visible label's own text through an
  `aria-labelledby` id list, so six filterable dropdowns on one form no longer announce as six
  identical "Filter options" boxes. A name that already begins with "Filter" (this repo's house habit,
  e.g. `AriaLabel="Filter roles"`) is not prefixed again.

  Also in the same attribute cluster:
  - The trigger now points `aria-controls` at a generated listbox id while open — `aria-expanded`
    alone says something expanded without saying what.
  - A disabled dropdown renders `aria-disabled` and leaves the tab order. Previously `tabindex` was
    static, and since the SCSS suppresses the focus ring when disabled, a keyboard user landed on
    something invisible that then silently ignored Enter.

  **One visible change for existing `Filterable` callers:** the filter box's placeholder is now
  "Filter..." rather than "Search...". This is deliberate — the accessible name is "Filter <name>", and
  a visible "Search" that is not in the accessible name breaks WCAG 2.5.3 (Label in Name): a
  voice-control user says "click Search" and nothing matches.

  `StubDropdownComponent` in `@memberjunction/ng-test-utils` gains the same four inputs, keeping its
  "mirrors the real inputs" contract true. Without it the first consumer spec binding `[AriaLabel]` on
  a stubbed dropdown throws NG0303 under `errorOnUnknownProperties`, and a static attribute would land
  silently as a vacuous pass.

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- Updated dependencies [834f8d7]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0ec1980]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [e2ad3c0]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2d14c62]
- Updated dependencies [c996a56]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [2be2960]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
  - @memberjunction/core@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0ec1980]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/core@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- c09c818: MJDropdown can finally be given an accessible name (#3860)

  `mj-dropdown` renders a `div[role="combobox"]` with no way to name it, so every one of the ~94 call
  sites in this repo announced as "combobox, collapsed" with no hint of what it selects — WCAG 2.1
  4.1.2 (Name, Role, Value). Four optional passthroughs close it, all applied to the popup listbox as
  well as the trigger so both halves announce the same name:
  - **`AriaLabelledBy`** — the id of a VISIBLE label, and the preferred wiring when one exists. Not
    `<label for>`: the trigger is a `div`, which label-for neither names nor focuses.
  - **`AriaLabel`** — for when no visible label exists.
  - **`AriaDescribedBy`** — hint and error text.
  - **`InputId`** — an id on the trigger so other markup can reference it.

  Absent beats empty: none of the four renders an attribute when unset, because `aria-label=""` is
  worse than no attribute — it overrides every other naming source with an explicitly empty name.

  The filterable panel's filter box is named from the same source rather than being a second unnamed
  control. Under `AriaLabelledBy` it composes "Filter" with the visible label's own text through an
  `aria-labelledby` id list, so six filterable dropdowns on one form no longer announce as six
  identical "Filter options" boxes. A name that already begins with "Filter" (this repo's house habit,
  e.g. `AriaLabel="Filter roles"`) is not prefixed again.

  Also in the same attribute cluster:
  - The trigger now points `aria-controls` at a generated listbox id while open — `aria-expanded`
    alone says something expanded without saying what.
  - A disabled dropdown renders `aria-disabled` and leaves the tab order. Previously `tabindex` was
    static, and since the SCSS suppresses the focus ring when disabled, a keyboard user landed on
    something invisible that then silently ignored Enter.

  **One visible change for existing `Filterable` callers:** the filter box's placeholder is now
  "Filter..." rather than "Search...". This is deliberate — the accessible name is "Filter <name>", and
  a visible "Search" that is not in the accessible name breaks WCAG 2.5.3 (Label in Name): a
  voice-control user says "click Search" and nothing matches.

  `StubDropdownComponent` in `@memberjunction/ng-test-utils` gains the same four inputs, keeping its
  "mirrors the real inputs" contract true. Without it the first consumer spec binding `[AriaLabel]` on
  a stubbed dropdown throws NG0303 under `errorOnUnknownProperties`, and a static attribute would land
  silently as a vacuous pass.

- Updated dependencies [c42c0e8]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/core@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e2ad3c0]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [a1a8989]
  - @memberjunction/core@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
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
- Updated dependencies [68b9cf0]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [d0a2a55]
  - @memberjunction/core@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [8288711]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [15319b4]
  - @memberjunction/core@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core@6.1.0-edge.0

## 6.0.0

## 5.51.0

## 5.50.0

### Patch Changes

- 6237f22: Remove the internal `@memberjunction/core` peerDependency — the repo's only internal peer. Semver ranges exclude prereleases, so during an Edge (changesets pre-mode) window any internal peer range is out of range for every `-edge.N` version and, with `onlyUpdatePeerDependentsWhenOutOfRange` plus the repo-wide fixed group, escalates all packages to a silent major bump. Core stays available via devDependencies (the package is private and never published). A new CI guard (`npm run check:peer-deps`, "No internal peerDependencies" workflow) blocks internal peerDependencies repo-wide.

## 5.49.0

### Minor Changes

- d3f9d77: Angular DOM unit-testing — Phase 3 (`Angular/Explorer/**` rollout) toolkit growth.

  `createFakeProvider` gains an additive **`roles`** option that populates `provider.Roles`, for DOM
  specs of permission/role UIs that read `ProviderToUse.Roles` (e.g. the Explorer entity-permissions
  grid). Mirrors the existing `entities` option; defaults to `[]` when omitted, so it's non-breaking.

## 5.48.0

## 5.47.0

## 5.46.0

## 5.45.1

## 5.45.0

## 5.44.0

### Minor Changes

- 5de2d37: Angular DOM unit-testing — Phase 2 (`Angular/Generic/**` rollout). Extends the shared test toolkit and rolls DOM specs across the Generic packages.

  `@memberjunction/ng-test-utils` gains (additive):
  - **`providers` / `imports` / `declarations`** options on `renderComponentFixture` — inject stub services so service-backed presentational components can be constructed and rendered.
  - **`createFakeProvider`** (+ an `entities` option) — a fake `IMetadataProvider` / `RunView` supplied through a component's `[Provider]` input.
  - **`useFakeGlobalProvider`** — scoped save/restore of the global `RunView.Provider` / `Metadata.Provider` for components that use a bare `new RunView()`.
  - **dom-helpers** — `query` / `queryAll` / `text` / `attr` / `hasClass` / `typeInto` / `capture`.

  Tooling (repo scripts, no package version impact):
  - `scripts/gen-dom-stub.mjs` — scaffolds specs against the shared dom-helpers and bootstraps a package's DOM config (auto single-vs-dual vitest preset + `tsconfig.spec.json` + the `ng-test-utils` devDependency).
  - `scripts/dom-test-report.mjs` — a DOM-test **visibility report**: scores each component `solid`/`partial`/`stub`/`none` by how much of its named surface (`@Output`s, `[class.X]`, `[attr.X]`) its spec exercises, weighted by how heavily the component is used, so the backlog ranks by leverage. Skipped/deferred components still count as gaps (annotated).
  - `scripts/lib/component-surface.mjs` — a shared Angular-component parser used by **both** the generator and the report, so they always agree on what a component's testable surface is.

  DOM specs were added across ~49 Generic packages plus a `ng-conversations` deep-dive (~19 components). Those additions are test-only (specs + devDependencies) with no runtime change to the packages under test, so they are not individually version-bumped here. Media / realtime / WebRTC surfaces remain live-tested, never faked.

## 5.43.0

### Patch Changes

- 54183aa: Add the Angular DOM unit-testing foundation: a new `@memberjunction/ng-test-utils` package providing `renderComponentFixture` (standalone/leaf components) and `renderTemplate` (compound / module-declared components) helpers, the Vitest + jsdom DOM-testing harness, coverage reporting in the DOM preset, a `scaffold-tests.mjs --dom` flag (with a spaces-in-path fix), and DOM specs across `ng-ui-components`, `ng-pagination`, `ng-tabstrip`, and `ng-livekit-room`.

  `ng-livekit-room` is the headline pilot (now that PR #2860 is on `next`): DOM specs for the media-free leaf components (`control-bar`, `agent-state`, `connection-overlay`, `chat-panel`, `device-menu`) plus `participant-tile` as the §7 media-split worked example — the media-free surface is tested while `track.attach()` and the audio-meter `requestAnimationFrame` loop are left to live tests — on a dual node+dom preset that preserves the package's existing logic specs. The `LiveKitRoomComponent` injectable-controller refactor (the one production-code change) is deferred to the Phase 2 component rollout; the injected-fake-container pattern it would prove is already demonstrated via the `providers` seam.

  Also hardens the harness wiring flagged in review: correct `@memberjunction/ng-test-utils` devDependency declarations (`ng-tabstrip`, `ng-livekit-room`) and Turbo cache inputs covering `tsconfig.spec.json` + the root shared-harness files. Code-only, no schema changes.

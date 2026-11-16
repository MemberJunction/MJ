# @memberjunction/predictive-studio-truth-suite

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
- Updated dependencies [0d484c2]
- Updated dependencies [03bb8b6]
- Updated dependencies [a01e840]
- Updated dependencies [6555a44]
- Updated dependencies [3c4de2b]
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
- Updated dependencies [83b1293]
- Updated dependencies [b2789ee]
- Updated dependencies [31cc053]
- Updated dependencies [2641e47]
- Updated dependencies [b332459]
- Updated dependencies [100b9c2]
- Updated dependencies [6bd8271]
- Updated dependencies [1ff0bd4]
- Updated dependencies [6fd9fb7]
- Updated dependencies [70b5e38]
- Updated dependencies [28cec7d]
- Updated dependencies [b9fda3f]
- Updated dependencies [b68d388]
- Updated dependencies [5c4fa7c]
- Updated dependencies [8c3c8a4]
- Updated dependencies [fbbc06a]
- Updated dependencies [7ace3ee]
- Updated dependencies [2b349b9]
- Updated dependencies [d87bb40]
- Updated dependencies [c889b72]
  - @memberjunction/core@6.3.0-edge.0
  - @memberjunction/core-entities@6.3.0-edge.0
  - @memberjunction/global@6.3.0-edge.0
  - @memberjunction/storage@6.3.0-edge.0
  - @memberjunction/graphql-dataprovider@6.3.0-edge.0
  - @memberjunction/ai-core-plus@6.3.0-edge.0
  - @memberjunction/testing-integration@6.3.0-edge.0
  - @memberjunction/predictive-studio@6.3.0-edge.0
  - @memberjunction/predictive-studio-sidecar@6.3.0-edge.0
  - @memberjunction/predictive-studio-core@6.3.0-edge.0

## 6.2.0

### Patch Changes

- Updated dependencies [0d81c53]
- Updated dependencies [622f166]
- Updated dependencies [f555162]
- Updated dependencies [043f418]
- Updated dependencies [1419ba7]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [96d6ec2]
- Updated dependencies [a709bb6]
- Updated dependencies [39b35f1]
- Updated dependencies [d17de94]
- Updated dependencies [e97d95c]
- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [a50948e]
- Updated dependencies [2552b1e]
- Updated dependencies [25bb295]
- Updated dependencies [432cb73]
- Updated dependencies [3080e83]
- Updated dependencies [4c6a28b]
- Updated dependencies [c93c0f8]
- Updated dependencies [6c36fb6]
- Updated dependencies [0eeb89d]
- Updated dependencies [ecf36eb]
- Updated dependencies [cc36de5]
- Updated dependencies [9cb815b]
- Updated dependencies [709de1a]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [37891d3]
- Updated dependencies [1d6e3e8]
- Updated dependencies [d2db108]
- Updated dependencies [dfe40a4]
- Updated dependencies [d43d86e]
- Updated dependencies [a3539d2]
- Updated dependencies [dde482c]
- Updated dependencies [db39145]
- Updated dependencies [41274aa]
- Updated dependencies [91cba84]
- Updated dependencies [b14c72f]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [c671f85]
- Updated dependencies [49f26d9]
- Updated dependencies [660ef45]
- Updated dependencies [5e4205c]
- Updated dependencies [0cc6b08]
- Updated dependencies [7be1684]
- Updated dependencies [21f9e15]
- Updated dependencies [1090caa]
- Updated dependencies [c8c48e1]
- Updated dependencies [f2248d5]
- Updated dependencies [81aea34]
- Updated dependencies [7384dd6]
- Updated dependencies [6849b00]
- Updated dependencies [67f6c85]
- Updated dependencies [ac9b00b]
- Updated dependencies [eb3a8d3]
- Updated dependencies [5465489]
- Updated dependencies [3bace5a]
- Updated dependencies [88e6902]
- Updated dependencies [953086f]
- Updated dependencies [bb3028a]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [e1fd4c1]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [e1dd673]
- Updated dependencies [f3c6161]
- Updated dependencies [c6b4b85]
- Updated dependencies [d29b5c2]
- Updated dependencies [59e32e0]
- Updated dependencies [d122a41]
- Updated dependencies [0a7c255]
- Updated dependencies [0adaf76]
- Updated dependencies [5ee02db]
- Updated dependencies [0ff7523]
- Updated dependencies [d86bcbc]
- Updated dependencies [307da67]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [a65dfb8]
- Updated dependencies [d6b39c4]
- Updated dependencies [5f0baf7]
- Updated dependencies [f65fec7]
- Updated dependencies [ef43cf3]
- Updated dependencies [6e6e3f1]
- Updated dependencies [ea4080e]
- Updated dependencies [9b5b489]
- Updated dependencies [cb205de]
- Updated dependencies [b44c7cf]
- Updated dependencies [0c634ba]
- Updated dependencies [a6f8c1c]
- Updated dependencies [08f8966]
- Updated dependencies [48c9cd2]
- Updated dependencies [56d7614]
- Updated dependencies [223669e]
- Updated dependencies [683f652]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [914e6ff]
- Updated dependencies [a8be410]
- Updated dependencies [7316ac3]
- Updated dependencies [2274f42]
- Updated dependencies [7e57b48]
- Updated dependencies [35ed364]
- Updated dependencies [9ce7cf4]
- Updated dependencies [0fb3649]
- Updated dependencies [131f3c4]
- Updated dependencies [b054fe5]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [705ab4e]
- Updated dependencies [5df9486]
- Updated dependencies [a7da50b]
- Updated dependencies [0f04590]
- Updated dependencies [dd34a5c]
- Updated dependencies [5fed75a]
- Updated dependencies [4c0eaec]
- Updated dependencies [1cb1d52]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [1d43161]
- Updated dependencies [f26084f]
- Updated dependencies [db39145]
- Updated dependencies [f48dffc]
- Updated dependencies [41c2c08]
- Updated dependencies [630bb88]
- Updated dependencies [e69634e]
- Updated dependencies [7110019]
- Updated dependencies [6779eed]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [29b6ec3]
- Updated dependencies [1141164]
- Updated dependencies [44faf83]
- Updated dependencies [17cc774]
- Updated dependencies [dae1d31]
- Updated dependencies [bfd67c6]
- Updated dependencies [80905a1]
- Updated dependencies [4c97994]
- Updated dependencies [397ae9a]
- Updated dependencies [08b3d7b]
- Updated dependencies [7e72c86]
- Updated dependencies [dbc3462]
- Updated dependencies [a17a228]
- Updated dependencies [6e6e3f1]
- Updated dependencies [21175fa]
- Updated dependencies [6b08ebf]
- Updated dependencies [5fed75a]
- Updated dependencies [ee1f0d9]
- Updated dependencies [ce758af]
- Updated dependencies [ff73341]
- Updated dependencies [89a5b59]
- Updated dependencies [1ea4085]
- Updated dependencies [975948b]
- Updated dependencies [22c9074]
- Updated dependencies [88b85fc]
- Updated dependencies [aee2d53]
- Updated dependencies [279b93e]
- Updated dependencies [8420f36]
- Updated dependencies [f0c78c3]
- Updated dependencies [4ef13d6]
- Updated dependencies [25f7b82]
- Updated dependencies [8b90b41]
- Updated dependencies [02bb563]
- Updated dependencies [104125c]
- Updated dependencies [7e57b48]
- Updated dependencies [55c1c58]
- Updated dependencies [7e57b48]
- Updated dependencies [d296edd]
- Updated dependencies [66fd011]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [509d2aa]
- Updated dependencies [68f5c01]
- Updated dependencies [196160a]
- Updated dependencies [ed326fb]
- Updated dependencies [5513c2a]
- Updated dependencies [90829e3]
- Updated dependencies [1d29837]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [8c120db]
- Updated dependencies [bea2386]
- Updated dependencies [9a2d7cc]
- Updated dependencies [3ab85f9]
- Updated dependencies [aac148b]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [8d1a373]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [36a3f9e]
- Updated dependencies [539dfe3]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [d046715]
- Updated dependencies [60bd774]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [ac18db8]
- Updated dependencies [35da130]
- Updated dependencies [5b41d48]
- Updated dependencies [4b9542c]
- Updated dependencies [28c92e0]
- Updated dependencies [5f707d1]
- Updated dependencies [369e229]
- Updated dependencies [ba00ac7]
- Updated dependencies [8a5d2c0]
- Updated dependencies [d13cf6b]
- Updated dependencies [aca4317]
- Updated dependencies [d52f9ba]
- Updated dependencies [d0a8dbf]
- Updated dependencies [ec97ad4]
- Updated dependencies [b1b6d3d]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [af57e8d]
- Updated dependencies [68a7e3b]
- Updated dependencies [718b01c]
- Updated dependencies [57fea6a]
- Updated dependencies [374b1a4]
- Updated dependencies [2c590b0]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [2854a2e]
- Updated dependencies [b0b2cc9]
- Updated dependencies [dc38250]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0
  - @memberjunction/testing-integration@6.2.0
  - @memberjunction/ai-core-plus@6.2.0
  - @memberjunction/global@6.2.0
  - @memberjunction/core@6.2.0
  - @memberjunction/graphql-dataprovider@6.2.0
  - @memberjunction/predictive-studio@6.2.0
  - @memberjunction/predictive-studio-core@6.2.0
  - @memberjunction/predictive-studio-sidecar@6.2.0

## 6.2.0-edge.8

### Patch Changes

- Updated dependencies [6c36fb6]
- Updated dependencies [9cb815b]
- Updated dependencies [d2db108]
- Updated dependencies [c671f85]
- Updated dependencies [6849b00]
- Updated dependencies [59e32e0]
- Updated dependencies [5f0baf7]
- Updated dependencies [a6f8c1c]
- Updated dependencies [56d7614]
- Updated dependencies [9ce7cf4]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [dd34a5c]
- Updated dependencies [e69634e]
- Updated dependencies [539dfe3]
- Updated dependencies [ac18db8]
  - @memberjunction/core@6.2.0-edge.8
  - @memberjunction/core-entities@6.2.0-edge.8
  - @memberjunction/global@6.2.0-edge.8
  - @memberjunction/graphql-dataprovider@6.2.0-edge.8
  - @memberjunction/ai-core-plus@6.2.0-edge.8
  - @memberjunction/predictive-studio@6.2.0-edge.8
  - @memberjunction/testing-integration@6.2.0-edge.8
  - @memberjunction/predictive-studio-core@6.2.0-edge.8
  - @memberjunction/predictive-studio-sidecar@6.2.0-edge.8

## 6.2.0-edge.7

### Patch Changes

- Updated dependencies [1419ba7]
- Updated dependencies [c93c0f8]
- Updated dependencies [ecf36eb]
- Updated dependencies [91cba84]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [c8c48e1]
- Updated dependencies [3bace5a]
- Updated dependencies [953086f]
- Updated dependencies [f4cd5fb]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [d6b39c4]
- Updated dependencies [f65fec7]
- Updated dependencies [08f8966]
- Updated dependencies [48c9cd2]
- Updated dependencies [0fb3649]
- Updated dependencies [b054fe5]
- Updated dependencies [4c0eaec]
- Updated dependencies [6779eed]
- Updated dependencies [397ae9a]
- Updated dependencies [89a5b59]
- Updated dependencies [4ef13d6]
- Updated dependencies [8b90b41]
- Updated dependencies [509d2aa]
- Updated dependencies [9a2d7cc]
- Updated dependencies [36a3f9e]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [aca4317]
- Updated dependencies [b0b2cc9]
  - @memberjunction/ai-core-plus@6.2.0-edge.7
  - @memberjunction/global@6.2.0-edge.7
  - @memberjunction/core-entities@6.2.0-edge.7
  - @memberjunction/core@6.2.0-edge.7
  - @memberjunction/graphql-dataprovider@6.2.0-edge.7
  - @memberjunction/testing-integration@6.2.0-edge.7
  - @memberjunction/predictive-studio@6.2.0-edge.7
  - @memberjunction/predictive-studio-core@6.2.0-edge.7
  - @memberjunction/predictive-studio-sidecar@6.2.0-edge.7

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [622f166]
- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [0ff7523]
- Updated dependencies [a65dfb8]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [1141164]
- Updated dependencies [dae1d31]
- Updated dependencies [4c97994]
- Updated dependencies [ff73341]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [68f5c01]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/ai-core-plus@6.2.0-edge.6
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/graphql-dataprovider@6.2.0-edge.6
  - @memberjunction/testing-integration@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/predictive-studio-sidecar@6.2.0-edge.6
  - @memberjunction/predictive-studio-core@6.2.0-edge.6
  - @memberjunction/predictive-studio@6.2.0-edge.6

---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/predictive-studio-core": minor
"@memberjunction/predictive-studio": minor
"@memberjunction/predictive-studio-sidecar": minor
"@memberjunction/predictive-studio-truth-suite": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/storage": minor
"@memberjunction/global": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/diagnostics": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-test-utils": minor
"@memberjunction/ng-ui-components": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Predictive Studio training under a declared unit and protocol: Prediction Units (immutable versions with outcome window, censoring and task type),
as-of feature assembly over dated history with typed columns, fingerprinted Training Snapshots, Evaluation Protocols
saved before search, a trainer that reports proper scores, baselines and intervals, and a three-outcome gate
(model, keep-simple-baseline, no-signal). Adds a Local File System storage driver.

Predictive Studio decides what a training run ships with a three-outcome gate (the model, a simple baseline, or no
signal), stores that decision with its reason on the run, and renders the trust verdict from it.

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
  `IArtifactStore.delete` are new required members. `PredictiveStudioBuildOutcome.trustGrade` / `trustOneLiner` are
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
  assembly day only when no change history covers that day. `PredictiveStudio.TrainModel` refuses `asOf` (including
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
  from `PS_ARTIFACT_DIR`. `IArtifactLoader.load` takes a required `provider`, and `IArtifactStore.AssertWritable` is a new required
  member the engine calls before a run is written, so an unconfigured provider refuses the run before training. The local-disk model
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
- `@memberjunction/core`: listed for the Migrate Pipelines Action and the Train ML Model parameter metadata.

Holds no sign-off overrides: a binary or multiclass model whose holdout calibration slope is outside 0.8–1.2, or could
not be measured, is held in Draft (Lineage `calibrationHold`, a `CALIBRATION HOLD` run note) and the Promote ML Model
action refuses it with `CALIBRATION_HOLD`; a forecast's series forecaster, which `/predict` does not serve, is refused
with `MODEL_NOT_SERVABLE` and never scored. A kept simple baseline carries its run's leakage audit
(`trainingLeakageAudit`), so it needs the same leakage sign-off as the finalist. The Pipeline Builder agent publishes
through the promotion gate. Binding a binary or multiclass unit to a protocol whose calibration is `not-applicable` is
refused.

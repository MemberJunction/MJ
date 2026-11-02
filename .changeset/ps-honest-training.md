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
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

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
  the deprecated lowercase helpers of the Predictive Studio agent context, models and studio resources and
  `buildImprovePrompt` are removed.
- `@memberjunction/predictive-studio-sidecar`, `@memberjunction/predictive-studio-truth-suite`: the gate parity tests
  (`test:gate-parity`, `test:gate-parity-refpipe`).
- `@memberjunction/integration-test-suite`: seven Predictive Studio gate checks (G2.1, G2.2, G2.3, G2.5, G2.7, G2.8,
  G2.22).
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
- `@memberjunction/core-entities`: the regenerated TrainModel remote-operation types.
- `@memberjunction/ng-dashboards`: the Studio's Prediction Units and Evaluation Protocols sections, the unit and
  protocol editors and version lists, the pipeline bindings panel and the model form's protocol results panel; the
  pipeline wizard binds a new pipeline to version 1 of its unit and the default protocol. The deprecated lowercase
  aliases of `PSPipelinesComponent`, `PSPipelineWizardComponent` and the Predictive Studio nav helpers are removed:
  bind `[CurrentUser]`, `[CloneFrom]`, `[InitialAlgorithmId]`, `(Saved)`, `(TrainRequested)`, `(Closed)` and the other
  PascalCase members. `PSPredictionsResourceComponent.applicationId` is `ApplicationID`.
- `@memberjunction/predictive-studio-sidecar`: the `/train` route and its legacy helpers (`build_estimator`, `fit_transform`,
  `serialize_envelope`) are removed; `/predict` still loads legacy envelopes. The `ps-predictor/v2` envelope's payload
  key is `payloadB64`. A snapshot header's `capacityPerPeriod` must be a positive integer or null.
- `@memberjunction/predictive-studio-truth-suite`, `@memberjunction/integration-test-suite`: the harness trains every
  pipeline through its unit; six containment checks are re-pinned to the unit path; the pipeline-migration rig.
  `UnitFixtures.LatestRun` returns a read-only `LatestTrainingRun` row; `ReadWorldTruth` and the W4 `StatusTimeline`
  are `UUIDMap`s; `UnitFixtures.LoadUnitSpec` is removed.
- `@memberjunction/core`: listed for the Migrate Pipelines Action and the Train ML Model parameter metadata.

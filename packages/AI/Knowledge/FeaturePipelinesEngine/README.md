# @memberjunction/feature-pipelines-engine

Server-side execution engine for **Knowledge Hub Feature Pipelines** (`WorkType = 'Infer'` on `MJ: Record Processes`).
All Feature Pipeline runtime logic — inference drivers, `MJ: Feature Values` persistence, version activation & backfill
stewardship, and golden-set test evaluation — lives here, decoupled from the generic Record Set Processing, Scheduling,
and Testing Framework substrates.

Pure specification types, constraint/escalation validators, pin hashing, and `FeaturePipelineRunResults` live in
[`@memberjunction/feature-pipelines`](../FeaturePipelines).

## Architecture & Substrate Seams

| Surface | Registration / Entry Point | Description |
|---------|----------------------------|-------------|
| `WorkType = 'Infer'` | `FeaturePipelineStartup` (`@RegisterForStartup`) -> `RegisterInferRecordProcessor()` | Registers the `'Infer'` factory in `RecordProcessorRegistry.Instance` on module load and startup |
| Pipeline Drivers | `LLMFeaturePipelineDriver`, `DecisionFeaturePipelineDriver` (`BaseFeaturePipelineDriver`) | Turn a record's context into structured output values via `AIPromptRunner` or `AIDecisionRunner`, with optional borderline escalation |
| Record Processor | `InferProcessor` (`FailRunOnRecordError = true`, `BuildRunSummary`) | Enforces version activation gates, resolves lookup taxonomies, validates output constraints & confidence floors, upserts `MJ: Feature Values` via `FeatureValueStore`, and delegates write-back |
| Version Steward | `FeaturePipelineVersionSteward` + `StewardFeaturePipelineVersionAction` (`@RegisterClass(BaseAction, 'Steward Feature Pipeline Version')`) | Evaluates unevaluated gated versions and runs the one backfill of an active changed version; invoked per pipeline by the scheduled `'Feature Pipeline Version Steward'` `MJ: Record Processes` row (`WorkType = 'Action'`, every 15 minutes via `RecordProcessScheduledJobDriver`) |
| Golden Set Driver | `FeaturePipelineGoldenSetDriver` (`@RegisterClass(BaseTestDriver, 'FeaturePipelineGoldenSetDriver')`), `GoldenSetScorer`, `GoldenLabelQualityCheck` | Evaluates a *Feature Pipeline Golden Set* test against the pipeline's current version in one dry-run batch (`BypassCache: true`) and records the evaluation through `FeaturePipelineVersionService` |

## Feature Pipeline Results (`ResultSummary`)

`InferProcessor` upserts each record's Feature Values on their key (`ValueKeyHash`). Its `RecordResult` carries
`Outcome` (`Unchanged` or `Upserted`), `PipelineVersion`, `HumanValuesPreserved`, `RejectedInvalid` when an output
violates its constraint, and `Warnings` (stored in `MJ: Process Run Details.Warnings`).

At the end of the run, `InferProcessor.BuildRunSummary` builds a `FeaturePipelineRunResult` (via
`FeaturePipelineRunResults.Build` in `@memberjunction/feature-pipelines`) and stores it in
`MJ: Process Runs.ResultSummary`:

- The pin (`PromptVersionHash`, `PrimaryModelID`, `ParametersHash`, `SpecHash`) and `PipelineVersion` the run used
- Tallies: `Attempted`, `Upserted`, `Unchanged`, `Previewed`, `RejectedInvalid`, `BelowConfidence`, `Failed`, `Skipped`, `HumanValuesPreserved`
- Because `InferProcessor.FailRunOnRecordError = true`, **a Feature Pipeline run with any failed or rejected record ends `Failed`**.

## Dry Runs

An `Infer` dry run writes nothing (no Dedup Cache entry, Feature Value, watermark, target or child row) but still calls
the model, so its `MJ: AI Prompt Runs` are recorded and cost what a real run of those records would.

- Without a scope or a single record it previews at most **25** records (`DryRunSampleSize` overrides it).
- A record whose real write would fail is reported `Failed` with the write-back's reason (`PreviewErrors`).
- It reports, in `WouldRefuse`, why a real run would be refused (a version that has not passed its golden set), and
  never registers or activates a version. `RecordProcess.RunNow` / `PredictiveStudio.RunFeaturePipeline` return it as
  `wouldRefuse`; the Bulk Operations dialog then offers no Apply.
- Each record's `previewFields` / `previewChildren` / `previewTags` hold only what the real write would change. Outputs
  withheld below their confidence floor are listed in `withheldFields` (and `withheldKeptFields` when the column does
  not allow null) and `withheldChildEntities`.
- An output with no `Target` ("Feature value only") writes nothing to the record; its dry-run result is
  `previewFeatureValues` (`FeatureName`, `Previous`, `Proposed`), listing the Feature Values a real run would store.

## Golden-Set Evaluation & Label Quality

- **`FeaturePipelineGoldenSetDriver`** — Driver of the *Feature Pipeline Golden Set* test type. Verifies that the
  pipeline names the test as its `Activation.GoldenSetTestID` and that model-made labels pass `GoldenLabelQualityCheck`,
  runs the current version as one dry-run batch with the cache bypassed (`AI Prompt Runs` are recorded), scores the
  answers with `GoldenSetScorer`, and records the result on that version through `FeaturePipelineVersionService`, which
  activates or refuses it against the pipeline's `Activation` threshold.
- **`GoldenSetScorer`** — Pure scoring of a golden set: per-output accuracy with alternates accepted case-insensitively
  and a Wilson 95% confidence interval, abstention cases (`ExpectAbstain`), and overall pipeline value equal to its
  lowest output accuracy (or `0` when any `Required` case is wrong).
- **`GoldenLabelQualityCheck`** — Automated quality check for model-made golden labels: `Adjudicate` builds cases from
  labelers A, B, and C (A–B agreement keeps A, C adjudicates disagreements, three-way disagreements are excluded) and
  `Check` verifies a stored `InputDefinition.LabelQuality` record (two independent vendors, pairwise Wilson 95% lower
  bound >= 0.70, <= 5 of 52 excluded, and SHA-256 of cases) before any model call.

## Version Stewardship

- **`FeaturePipelineVersionSteward`** — Evaluates a gated pipeline's unevaluated version (running its
  `Activation.GoldenSetTestID`) and executes the one backfill of an active changed version (records whose latest value is
  under another version or none, with `SkipUnchanged: false` so watermarks are refreshed). A pipeline can opt out per
  step via `Unattended: { AutoEvaluate: false }` / `{ AutoBackfill: false }`.
- **`StewardFeaturePipelineVersionAction`** — MJ Action (`DriverClass = 'Steward Feature Pipeline Version'`) that runs
  `FeaturePipelineVersionSteward.Instance.StewardPipelineByID(recordProcessID, { ContextUser, Provider })` for a single
  pipeline and outputs `Outcomes`, `Version`, `LastAction`, and `Detail`.
- **Scheduled execution** — Seeded as the `'Feature Pipeline Version Steward'` `MJ: Record Processes` row (`WorkType = 'Action'`,
  `Entity = 'MJ: Record Processes'`, `ScopeFilter = "WorkType='Infer' AND Status='Active'"`), dispatched every 15 minutes
  by the `'Feature Pipeline Version Steward'` `MJ: Scheduled Jobs` row (`RecordProcessScheduledJobDriver`).

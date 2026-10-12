---
"@memberjunction/predictive-studio": patch
"@memberjunction/record-set-processor": patch
"@memberjunction/record-set-processor-base": patch
"@memberjunction/ng-dashboards": patch
---

Predictive Studio: a model that has never been trained on this server now says "needs training" instead of looking deployed and failing every scoring run. Scoring processes can also opt in to train their model on first use, so an Open App's scoring works on a fresh install.

- **Run-level `Preflight` seam.** `IRecordProcessor` has an optional `Preflight(context)`. `RecordSetProcessor.Process` calls it once before the first batch. When it throws, the run is recorded `Failed` with that message and no record is processed. `WriteBackProcessor` forwards it to the processor it wraps.
- **The ML scorer refuses clearly.** `MLModelInferenceProcessor.Preflight` loads the model before any record is scored. A model that is missing, has no `ArtifactFileID`, or whose artifact can't be loaded on this server throws `ModelNeedsTrainingError` with a "needs training" message. Before, all 100 records of the first batch failed and the run ended "Circuit breaker: error rate 100.0% exceeded 20%". `ScoreRecordSet` runs the same check.
- **No publishing an untrained model.** The promotion gate refuses `→ Published` for a model with no artifact (`needs-training`). The Promote Action returns `MODEL_NEEDS_TRAINING` and the Remote Op throws the message.
- **Studio badge.** The Production panel shows such a model as **Needs training** (amber) instead of Bound / Scheduled, explains why, and disables **Operate**.
- **Opt-in auto-train.** An `'ML Model'` Record Process may declare `Configuration.autoTrain = { pipelineId, binding? }`, and `modelId` may then be omitted. When the run's model needs training, the new `PipelineAutoTrainer` does the following, then the run goes on to score:
  - Reuses the newest Published model of that pipeline whose artifact loads here. If there is none, it trains the pipeline with `TrainingEngine` and publishes the result through the promotion gate. A leakage-flagged model is refused and stays Draft.
  - Writes the model id into the process `Configuration`.
  - Repoints the process's bindings, plus any binding still on the old model, and creates the declared binding if none exists.
  - Archives the old model if it was Published.

  Processes without `autoTrain` behave exactly as before. New exports: `ModelHasTrainedArtifact`, `ModelNeedsTrainingMessage`, `ModelArtifactMissingMessage`, `ModelNeedsTrainingError`, `PipelineAutoTrainer`, `MLAutoTrainConfig`, `IModelAutoTrainer`, `AutoTrainRequest`. `RegisterMLScoringProcessor(deps, autoTrainer?)` accepts the trainer.
- **Fix: training was capped at 1000 rows.** Feature assembly passed no `MaxRows`, so RunView applied the entity's `UserViewMaxRows` (1000 by default). Training silently used only the first 1000 records. It now reads every matching row (`IgnoreMaxRows`) unless the caller sets a cap.
- **Fix: write-back failed for every ML scoring run.** `WriteBackProcessor.ProcessBatch` assumed the inner processor returns a `Map`. The `IRecordProcessor` contract also allows an array aligned with the input records, which is what the ML scorer returns. Every ML Model process with an `OutputMapping` therefore failed every record with `innerResults.get is not a function`. Both shapes are now accepted.

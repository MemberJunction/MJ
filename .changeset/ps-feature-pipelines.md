---
"@memberjunction/actions": minor
"@memberjunction/ai": minor
"@memberjunction/ai-agent-harness": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-anthropic": minor
"@memberjunction/ai-azure": minor
"@memberjunction/ai-bedrock": minor
"@memberjunction/ai-betty": minor
"@memberjunction/ai-betty-bot": minor
"@memberjunction/ai-cerebras": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-gemini": minor
"@memberjunction/ai-inception": minor
"@memberjunction/ai-lmstudio": minor
"@memberjunction/ai-ollama": minor
"@memberjunction/ai-openai": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/ai-vector-dupe": minor
"@memberjunction/ai-vector-sync": minor
"@memberjunction/ai-vertex": minor
"@memberjunction/aiengine": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/content-autotagging": minor
"@memberjunction/core": minor
"@memberjunction/core-actions": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/db-auto-doc": minor
"@memberjunction/entity-documents": minor
"@memberjunction/feature-pipelines": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/metadata-sync": minor
"@memberjunction/ng-actions": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-entity-action-ux": minor
"@memberjunction/ng-record-process-studio": minor
"@memberjunction/postgresql-dataprovider": minor
"@memberjunction/predictive-studio": minor
"@memberjunction/record-set-processor": minor
"@memberjunction/record-set-processor-base": minor
"@memberjunction/scheduling-base-types": minor
"@memberjunction/scheduling-engine": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/sql-dialect": minor
"@memberjunction/sqlserver-dataprovider": minor
"@memberjunction/tag-engine": minor
"@memberjunction/tag-engine-base": minor
"@memberjunction/templates": minor
"@memberjunction/templates-base-types": minor
"@memberjunction/testing-cli": minor
"@memberjunction/testing-engine": minor
"@memberjunction/testing-integration": minor
"@memberjunction/unit-testing": minor
---

Feature Pipelines: validated, idempotent, versioned values and honest runs; vendor parameter fidelity. Feature Values upsert on a key (record, feature, pipeline version, prompt version, primary
model, parameters, input) and record human-entered values (`Source='Human'`) that write-back never overwrites unless
asked; the Dedup Cache refreshes expired entries in place and normalises keys; prompt-template edits apply without
a restart; outputs are checked against their constraints (lookup rows, per-item) and rejects are counted; dry runs
write nothing (and report the real write's failures); the breaker counts attempted records (processed minus watermark
skips) and a Feature Pipeline run with failures ends Failed; versions are registered in `MJ: Feature Pipeline
Versions` and a gated pipeline runs only under a version whose golden-set result meets its threshold, on a golden set
whose model-made labels pass an automated label-quality check; the new "Feature Pipeline Version Steward" scheduled
job evaluates and backfills changed versions without a person; an Action scheduled job paused for a missing class
resumes by itself once the class is loaded; embedding templates render raw and existing vectors are re-vectorized;
failed prompt calls record their own error and no longer leave prompt runs Running, and parallel prompt execution
completes; Gemini, Vertex and Bedrock send temperature 0 as 0, strict calls refuse a changed parameter and a refusal
stops the prompt without failover; Bedrock accepts inference-profile model IDs; OpenAI and Azure drop parameters
reasoning models reject. Migration `V202610151119__v6.2.x__Feature_Value_Key_And_Versions.sql`.

API move: `WriteBackResult` and `TagWriteBackPreview` now live in `@memberjunction/record-set-processor-base` (with the new `WriteBackRunPayload`,
`WriteBackFieldChange`, `WriteBackChildChange` and `FeaturePipelineRunResults`) so the Explorer can use them; they are no longer exported from
`@memberjunction/record-set-processor`. A write-back dry run now reports the real write's decision (`previewFieldChanges`, `previewChildChanges`,
`TagWriteBackPreview.alreadyLinked`), which the run dialog shows and counts. `TagEngineBase.FindTaggedItems` (with `TaggedItemLookup`) is the one existing-link lookup that both a tag write and its preview use; a preview marks a link whose weight would change as reweighted.

Watermarks record what was processed: a real `Checksum` run without `SkipUnchanged` (such as the steward's version backfill) now writes the watermark of each record it processed successfully when its processor computes a basis hash (Infer), so the next skipping run skips those records instead of re-processing them once; dry runs, failed records and processors without a basis hash write none.

Run Record Process returns its run summary (ProcessRunID, Processed, Succeeded, Errored, Skipped) on the result's params, replacing a same-name output instead of duplicating it; the Action Test Harness reads each output's value from the RunAction result by param name, and the Action Execution Log form lists a finished run's outputs (from `ResultParams`). The Bulk Operations editor shows the process's stored target entity. The Testing Overview's KPIs (run count, pass rate, total cost, average duration, pending review) are aggregates over every run in the window rather than the first 1000 rows, Suite Health shows each suite's member tests and their runs, the named time ranges roll forward to the current time on each load and on Refresh, trends and feedback stats are server-side aggregates, analytics come from the new `TestRunTotalsByTest` query (grouped per test on the server), the review queue tests feedback on the server and lists at most the newest 1000 runs of each kind (a capped queue, run list or score distribution says "Showing the newest 1,000 of N", and the review badge shows the exact pending total), Insights shows an analytics load failure, Suite Health shows "No runs" (listed last) for a suite with no runs in the period instead of 0%, Skipped runs no longer raise "Score below 0.5" alerts and are left out of every Testing pass-rate denominator (shared `TestingPassRate`; counts next to a rate read "N executed · M skipped", and a suite whose runs were all skipped reads "All skipped"; `TestRunTotalsByTest` gains a Skipped column), every Testing read is bounded, and the suite and type filters use views named by metadata (the suite filter on the `SuiteID` column).

The Feature Pipelines card reads a run that skipped records on their watermark as up to date ("5 of 5 up to date (5 unchanged)", "1 written, 1 unchanged of 2"), never calls a run that did not complete up to date, and shows a failed or refused run's error message; Run shows a refused or failed run as an error toast with the run's message. `RecordProcess.RunNow` and `PredictiveStudio.RunFeaturePipeline` outputs type `status` as the Process Run status union and return `wouldRefuse` for a Feature Pipeline dry run whose real run would be refused (from the new `FeaturePipelineRunResult.WouldRefuse`, reported by `IRecordProcessor.CurrentRunRefusal`); the Bulk Operations dialog then says applying would be refused and offers no Apply. A dry run names what its preview shows (`WriteBackResult.RecordName`, `WriteBackFieldChange.OldValueName`/`NewValueName`, `WriteBackChildChange.ValueNames`; a FieldRules run's diff `RecordName` and per-change names — `FieldRulesResultPayload` moved to `@memberjunction/record-set-processor-base`), named per batch — records the source loaded are named from their own fields, every related record the batch shows is read in one `RunViews` call (one view per related entity) under the acting user's permissions — and the dialog shows names, child fields by their display names, with the IDs on hover. The `RunFeaturePipeline` agent tool and Predictive Studio's Run now report a refused or failed run as a failure with its message. The field-rules builder's field pickers show a saved rule's target and source field.

`EntityInfo.RecordNameFields` and `EntityInfo.CanUserReadRecordName(user)` (MJCore) are the one record-name rule: the name fields in order, and whether a user may see a record's name (every name field readable, so a name is shown whole or not at all); the database provider's record-name read delegates to them and the dry-run preview applies the same gate to names it reads and to names from already-loaded rows. Processors may implement `IRecordProcessor.CompleteDryRunBatch`, which the record loop calls once per dry-run batch before recording its results (FieldRules and write-back processors name their previews there); real runs still record each record as it finishes.

A RunAction result's `ResultData` is a JSON array of the run's Output/Both params (`ActionResolver.SerializeOutputParams`); it used to arrive as an index-keyed object (`{"0": …}`), so clients that look params up by name (the Action Test Harness, the Communication dashboard) showed nothing. The Database Designer's workaround for the old shape is removed.

A user view saved through a network provider (a process that saves over GraphQL with the server entity classes registered, such as the integration test runner) is no longer refused by the client-SQL screen in that process; MJAPI screens the stored clauses before writing and on every run, as before. A database provider that cannot screen still fails closed.

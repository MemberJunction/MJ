---
"@memberjunction/integration-engine": patch
"@memberjunction/server": patch
---

Schema evolution acts on the watermark-field change it already detects, and the remaining bare RSU pipeline calls retry.

**A watermark-field change now resets the watermark (MJ-RUN-37).**

When a connector upgrade moves an object's incremental cursor to a different source column, `IntegrationSchemaSync.UpsertObject` has always overlaid `IntegrationObject.IncrementalWatermarkField` and recorded `'IncrementalWatermarkField'` on a local `changes` array. Nothing consumed that array. The schema evolution's `changedObjects` — the only input to `ResetPullWatermarks` — was built from a physical column diff and a field-map add/disable, and a cursor swap produces neither: no column moves and no field map changes. So the object read as unchanged, its Pull watermark survived, and the next incremental sync applied the OLD column's stored value as a lower bound on the NEW one.

Where the new column sorts later than the old one, every row below that value is filtered out at the source and never fetched again. Nothing reports it. On an incremental the source returns a total consistent with the filter it was handed, so the run's fetch-integrity check sees fetched equal to expected and closes clean — the defect produces silent, permanent absence rather than an error or a duplicate.

The fix is wiring, not detection. `ObjectMergeLog` now carries the `ChangedAttributes` the persist layer already computed, and `IntegrationSchemaEvolution` consumes it through a new pure helper, `ObjectsWithWatermarkFieldChange`, so such an object is marked changed and its Pull watermark is reset exactly as a column change already does. The helper is scoped to the evolution's CONTINUING entity maps and excludes newly-created objects, so it cannot inflate the change set (and therefore `HasChanges`, and therefore a full re-fetch) with objects nothing can act on.

`SupportsIncrementalSync` is deliberately NOT covered: the persist layer never writes that column on an existing row, so there is no detected change to consume. Making it work is a detection change, not a wiring one.

**The remaining bare `RunPipelineBatch` calls retry (MJ-APPLY-6 residual).**

`SchemaBuilder.RunSchemaPipeline` already states the reason: the pipeline's expensive middle steps (`ExecuteMigration`, `RunCodeGen`, `CompileTypeScript`, `RestartMJAPI`) fail transiently, `RunPipelineBatchWithRetry` whitelists exactly those and refuses to replay once anything has been applied, and "the callers simply never used it". Three of the four remaining bare call sites now do: `IntegrationApplySchemaBatch` (parity with its single-connector sibling, which retries), `IntegrationSchemaEvolution`, and the post-sync `CustomColumnPromoter` (which runs unattended, mid-sync, where a dropped promotion is invisible).

`RunRuntimeSchemaUpdateBatch` deliberately keeps the bare call, now with the reason stated in the code: it replays CALLER-AUTHORED SQL, and `executeMigration` is not transactional — it issues one `ExecuteSQL` per GO/statement chunk, so a migration that fails on a later chunk leaves earlier chunks committed while the step records `failed`, which is exactly the state a replay reads as safe. For SchemaBuilder-generated DDL that risk is accepted upstream; for arbitrary operator SQL it is not.

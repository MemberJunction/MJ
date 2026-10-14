# @memberjunction/record-set-processor

The server-side **Record Set Processor** engine — the single substrate every set-iterating job in
MemberJunction routes through. It owns the hardened iteration lifecycle so each consumer doesn't
reinvent it, while delegating *what to iterate*, *what to do*, and *where to persist* to the
pluggable seams defined in [`@memberjunction/record-set-processor-base`](../base).

## What the engine owns

- **Batching** with a configurable batch size
- **Bounded concurrency** within a batch (`maxConcurrency`)
- **Rate limiting** (optional, token-bucket with a sliding window)
- **Error-rate circuit breaker** — auto-fails a run when the error rate of the records it attempted exceeds a threshold.
  Records skipped on their watermark were never handed to the processor and are left out; records a processor itself
  returned as `Skipped` (e.g. field rules that changed nothing) were evaluated and count as attempted
- **Feature Pipeline runs** (`FeaturePipeline`, set by `RecordProcessExecutor` for Infer work) — the run ends `Failed`
  when any record failed (records that succeeded keep their writes), and the summary carries a
  `FeaturePipelineRunResult` (counts, pin, parameter fidelity) that `GenericProcessRunTracker` persists as the run's
  `ResultSummary`. Side effect for `WatermarkStrategy = 'UpdatedAt'`: its window starts at the last `Completed` run, so
  a pipeline with a record that keeps failing (e.g. an output its constraints always reject) never advances that
  window and re-reads the same changed records each run until the failure is fixed (`Checksum`, the default, is per
  record and unaffected). The LLM driver runs each prompt with `strictParameters`, so a model call that would not send
  the pipeline's configured temperature, max tokens and seed is refused (the record fails); every record that made a
  call carries its `ParameterFidelity`, and a refusal on any record is the run's fidelity
- **Budget gate** — an `onAfterBatch` hook to pause when a cost/item budget is exhausted
- **Progress events** after each batch
- **Pause / cancel handshake** — the tracker re-checks its row's cancellation flag at each checkpoint
- **Resume from a checkpoint** — offset or keyset cursor, round-tripped through the tracker
- **Per-record error isolation** — one bad record never aborts its batch

## Usage

```typescript
import { RecordSetProcessor, FunctionRecordProcessor } from '@memberjunction/record-set-processor';
import { ViewSource } from '@memberjunction/record-set-processor-base';

const result = await RecordSetProcessor.Instance.Process({
    source: new ViewSource(activeCustomersViewID),
    processor: new FunctionRecordProcessor(async (record, ctx) => {
        // ...do the work for `record` using ctx.provider / ctx.contextUser...
        return { Status: 'Succeeded', ResultPayload: { summarized: true } };
    }),
    contextUser,
    batchSize: 100,
    maxConcurrency: 4,
    recordProcessID,          // optional facade linkage
    triggeredBy: 'Schedule',
});

console.log(`${result.Status}: ${result.Success}/${result.Processed} ok, run ${result.ProcessRunID}`);
```

By default the engine persists to `MJ: Process Runs` / `MJ: Process Run Details` via
`GenericProcessRunTracker`. Pass `tracker: new NoOpTracker()` for fire-and-forget single-record work,
or your own `IProcessRunTracker` to persist into domain-specific tables.

## Feature Pipeline results

`InferProcessor` (WorkType `Infer`) writes each record's Feature Values keyed upserts (see
`@memberjunction/feature-pipelines`), and a record whose values cannot be written fails. Its `RecordResult` carries:

| Field | Meaning |
|---|---|
| `Outcome` | `Unchanged` when every value already existed as it is, else `Upserted` |
| `PipelineVersion` | the `MJ: Feature Pipeline Versions.Version` the values were computed under (null until versions are resolved) |
| `Warnings` | non-fatal problems of a record that succeeded (e.g. its Dedup Cache entry could not be stored); the default tracker stores them as a JSON array in `MJ: Process Run Details.Warnings`, never in `ErrorMessage` |

Per batch, the processor also exposes `PreviousFeatureValues(recordID)` (each feature's value before this run wrote it)
and `FeatureValueKeyOf(recordID)` (the pin and input hash the result was written under). Both are kept for the batch
that produced them and dropped when the next `ProcessBatch` starts. The Record Process's OutputMapping text is a
constructor argument (`new InferProcessor(promptID, inputMapping, spec, outputMappingText)`), so every construction path
hashes the same spec.

## Output-mapping write-back

A Record Process's `OutputMapping` (applied by `WriteBackProcessor` through `ApplyOutputMapping`) writes a result's
`fields` onto the processed record and its `childRecord`/`childRecords` as child rows. An `OutputMappingWriter` writes
both inside one entity transaction on a unit provider minted from the caller's provider (below), **children first**: a
failed child write rolls back and leaves the record's fields unwritten. A mapped field is saved only when its value
differs from the stored one, compared
by the field's type (`OutputMappingWriter.ValuesEqual`): text exactly (case and whitespace count), dates by instant,
decimal/numeric/money rounded to the column's scale, other numbers numerically, uniqueidentifiers case-insensitively.

Each write-back transaction runs on its own provider instance (`MetadataProviderCapabilities.RunIsolated` from `@memberjunction/feature-pipelines`:
`CreateIndependentInstance()` on the caller's database provider — same connection pool, its own transaction stack —
released afterwards). An MJ entity transaction belongs to the provider instance, so opened on the shared provider it
would take in every other statement run through it meanwhile (other records' write-backs, the run tracker's detail
rows, watermark updates) and roll them back with it. Isolated, records can write back concurrently
(`MaxConcurrency > 1`) with no lock. The minted instance's metadata comes from the process-global `Metadata.Provider`
(not from the caller's provider; `CreateIndependentInstance` takes no argument), which on every server host serves the
same database.

When the caller already holds a transaction on its provider (`TransactionDepth > 0`), the write-back runs on that
provider and joins the caller's transaction as a savepoint instead: the caller owns atomicity, and nothing the
write-back wrote is durable until the caller commits. A separate connection would wait on rows the caller's open
transaction holds locked until the request timed out.

Two writes sit outside the transaction on purpose:

- a lookup row created by `onLookupMiss: 'create'` is saved while the fields resolve. A rollback leaves it unreferenced
  (a re-run reuses it by its match field). It stays outside because the run-wide `lookupCache` holds its ID: rolled back,
  that cached ID would point at a row that no longer exists;
- tags are linked after the commit, so a tag failure fails the record while its fields and child rows stay committed.

A child mapping with `reconcile` is matched to the parent's existing rows on its key instead of always inserted, so a
re-run is idempotent (an always-insert mapping hits a unique key on its second run):

```json
{ "entity": "MJ_BizApps_Common: Person Job Functions", "parentField": "PersonID", "fanOutRef": "$.Functions",
  "map": { "JobFunctionID": "$.JobFunctionID", "Sequence": "$.Sequence", "Source": "static:Derived" },
  "reconcile": { "keyFields": ["JobFunctionID"], "sourceField": "Source", "derivedSourceValue": "Derived", "deleteStale": true } }
```

| Existing row with the proposed key | Outcome (`WriteBackResult` list) |
|---|---|
| none | inserted (`createdChildIDs`) |
| pipeline row (`sourceField` = `derivedSourceValue`), same values | left as is (`unchangedChildIDs`) |
| pipeline row, different values | the differing fields saved (`updatedChildIDs`) |
| human row (any other `sourceField` value) | left as is (`preservedHumanChildIDs`), unless the call sets `overwriteHumanValues` |
| pipeline row whose key the result no longer proposes | deleted when `deleteStale` (default true) (`deletedChildIDs`); human rows are never deleted |

An explicit empty answer (the fan-out value is `[]`) proposes no rows, so it deletes every pipeline row of the mapping;
a missing or null fan-out value is no answer and changes nothing. With `deleteStale` on, `sourceField` and
`derivedSourceValue` are required (without them no row can be told apart as human, so the config is refused). An
answer that proposes one key twice, or a `keyFields` entry the `map` does not set, fails the record before any write.

Keys match as the database's unique index on them would (`OutputMappingWriter.NormalizeKeyPart`): a uniqueidentifier
via `NormalizeUUID`; other values with trailing whitespace removed (SQL Server ignores it) and lower-cased, which
assumes a case-insensitive (`_CI_`, SQL Server's default) collation on the key column. `WriteBackResult.changed` is false when nothing
was written. Rows an older mapping wrote without the `sourceField` stamp keep the column's default value and therefore
count as human rows until they are restamped.

## Exports

| Export | Purpose |
|---|---|
| `RecordSetProcessor` | the engine singleton — `RecordSetProcessor.Instance.Process(options)` |
| `GenericProcessRunTracker` | default tracker writing the generic Process Run tables |
| `NoOpTracker` | a tracker that persists nothing |
| `FunctionRecordProcessor` | a processor backed by a function |
| `ApplyOutputMapping` / `OutputMappingWriter` | the output-mapping write-back and the class that writes its child rows and fields on an isolated provider instance (see above) |
| `RateLimiter` | the token-bucket limiter used when `rateLimit` is configured |

Source adapters, the seam interfaces, and all shared types are re-exported from
`@memberjunction/record-set-processor-base`.

> **Server-only.** This package executes work and persists runs; use it on the server. The base
> package (types + seams + sources) is client-safe.

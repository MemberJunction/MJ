# @memberjunction/record-set-processor

The server-side **Record Set Processor** engine — the single substrate every set-iterating job in
MemberJunction routes through. It owns the hardened iteration lifecycle so each consumer doesn't
reinvent it, while delegating *what to iterate*, *what to do*, and *where to persist* to the
pluggable seams defined in [`@memberjunction/record-set-processor-base`](../base).

## What the engine owns

- **Batching** with a configurable batch size
- **Bounded concurrency** within a batch (`maxConcurrency`)
- **Rate limiting** (optional, token-bucket with a sliding window)
- **Error-rate circuit breaker** — auto-fails a run when the error rate of the records it attempted exceeds a
  threshold (records skipped on their watermark are left out)
- **Feature Pipeline runs** (`FeaturePipeline`, set by `RecordProcessExecutor` for Infer work) — the run ends `Failed`
  when any record failed, and its `FeaturePipelineRunResult` (counts, pin) is persisted as the
  run's `ResultSummary`
- **Skipping unchanged records** (`skipUnchanged`, by `Checksum` or `UpdatedAt`) — unless the run overwrites human
  values. A real `Checksum` run that does not skip (e.g. a version backfill) still writes the watermark of each
  succeeded record whose processor computes a basis hash (Infer), so the next skipping run skips it
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

`InferProcessor` (WorkType `Infer`) upserts each record's Feature Values on their key (see
`@memberjunction/feature-pipelines`). Its `RecordResult` carries `Outcome` (`Unchanged` or `Upserted`),
`PipelineVersion`, and `Warnings` (non-fatal problems of a succeeded record, stored in `MJ: Process Run Details.Warnings`).

## Output-mapping write-back

`ApplyOutputMapping` writes a result's `fields` onto the processed record and its child rows through an
`OutputMappingWriter`, in one entity transaction, children first, on its own provider instance
(`MetadataProviderCapabilities.RunIsolated`), or as a savepoint of the caller's transaction when one is open. A field is
saved only when its value differs by the field's type (`OutputMappingWriter.ValuesEqual`). A lookup row created by
`onLookupMiss: 'create'` and tag links are written outside the transaction.

A child mapping with `reconcile` is matched to the parent's existing rows on its key, so a re-run is idempotent:

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

An explicit empty answer (`[]`) deletes every pipeline row of the mapping; a missing or null answer changes nothing.
Keys match as a case-insensitive unique index would (`OutputMappingWriter.NormalizeKeyPart`).

## Exports

| Export | Purpose |
|---|---|
| `RecordSetProcessor` | the engine singleton — `RecordSetProcessor.Instance.Process(options)` |
| `GenericProcessRunTracker` | default tracker writing the generic Process Run tables |
| `NoOpTracker` | a tracker that persists nothing |
| `FunctionRecordProcessor` | a processor backed by a function |
| `ApplyOutputMapping` / `OutputMappingWriter` | the output-mapping write-back (see above) |
| `RateLimiter` | the token-bucket limiter used when `rateLimit` is configured |

Source adapters, the seam interfaces, and all shared types are re-exported from
`@memberjunction/record-set-processor-base`.

> **Server-only.** This package executes work and persists runs; use it on the server. The base
> package (types + seams + sources) is client-safe.

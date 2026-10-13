# @memberjunction/record-set-processor

The server-side **Record Set Processor** engine — the single substrate every set-iterating job in
MemberJunction routes through. It owns the hardened iteration lifecycle so each consumer doesn't
reinvent it, while delegating *what to iterate*, *what to do*, and *where to persist* to the
pluggable seams defined in [`@memberjunction/record-set-processor-base`](../base).

## What the engine owns

- **Batching** with a configurable batch size
- **Bounded concurrency** within a batch (`maxConcurrency`)
- **Rate limiting** (optional, token-bucket with a sliding window)
- **Error-rate circuit breaker** — auto-fails a run when the error rate exceeds a threshold
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

## Exports

| Export | Purpose |
|---|---|
| `RecordSetProcessor` | the engine singleton — `RecordSetProcessor.Instance.Process(options)` |
| `GenericProcessRunTracker` | default tracker writing the generic Process Run tables |
| `NoOpTracker` | a tracker that persists nothing |
| `FunctionRecordProcessor` | a processor backed by a function |
| `RateLimiter` | the token-bucket limiter used when `rateLimit` is configured |

Source adapters, the seam interfaces, and all shared types are re-exported from
`@memberjunction/record-set-processor-base`.

> **Server-only.** This package executes work and persists runs; use it on the server. The base
> package (types + seams + sources) is client-safe.

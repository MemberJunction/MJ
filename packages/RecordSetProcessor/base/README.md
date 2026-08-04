# @memberjunction/record-set-processor-base

Client-safe foundation for the MemberJunction **Record Set Processing** substrate: the shared types,
the three pluggable seams, and the built-in source adapters. The server engine that drives these
lives in [`@memberjunction/record-set-processor`](../engine).

## What's in here

| Export | Kind | Purpose |
|---|---|---|
| `IRecordSetSource` | seam | yields the record set in cursor-paginated batches |
| `IRecordProcessor` | seam | does the work for a single record |
| `IProcessRunTracker` | seam | persists run lifecycle, per-record detail, checkpoints, pause/cancel |
| `RecordSetProcessOptions` | type | the engine's per-run options |
| `RecordRef`, `RecordBatch`, `ProcessCursor`, `RecordResult`, `ProcessRunResult`, … | types | the data shapes shared across the seams |
| `ArraySource`, `ViewSource`, `ListSource`, `FilterSource`, `KeysetSource` | sources | the built-in record-set sources |

## The three seams

A processing job is a composition of three independent choices:

- **Source** — *what* records to iterate (a User View, a List, an ad-hoc filter, an in-memory array,
  or a keyset sweep). Sources paginate themselves and hand back an opaque `ProcessCursor` the engine
  round-trips for resume.
- **Processor** — *what to do* with each record (an Action, an Agent, an Infer-&-Write-Back step, or
  a function), returning a `RecordResult` (`Succeeded` / `Failed` / `Skipped`).
- **Tracker** — *where to persist* run + per-record audit. The default writes the generic
  `MJ: Process Runs` / `MJ: Process Run Details` tables; domain consumers can supply their own.

## Source adapters

| Source | Pagination | Notes |
|---|---|---|
| `ArraySource` | offset (in-memory) | a fixed list of `RecordRef`; also use for `SingleRecord` scopes |
| `ViewSource` | offset | resolves a saved User View; views may carry arbitrary order/filter so offset is used |
| `ListSource` | offset | iterates a List's members via `MJ: List Details` |
| `FilterSource` | keyset → offset | entity + ad-hoc WHERE; keyset when the entity has a single orderable PK |
| `KeysetSource` | keyset (required) | like `FilterSource` but asserts keyset eligibility — for large background sweeps |

## Implementing a source

```typescript
import { IRecordSetSource, RecordBatch, ProcessCursor, SourceDescriptor } from '@memberjunction/record-set-processor-base';

export class MySource implements IRecordSetSource {
    Describe(): SourceDescriptor { return { SourceType: 'Filter', SourceFilter: '...' }; }
    async NextBatch(cursor: ProcessCursor | undefined, batchSize: number, contextUser, provider): Promise<RecordBatch> {
        // fetch up to `batchSize` records after `cursor`, return them plus the next cursor + exhausted flag
    }
}
```

This package carries no server-only dependencies and is safe to import on the client.

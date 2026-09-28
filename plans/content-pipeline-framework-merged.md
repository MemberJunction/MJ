# Content Pipeline Framework — Merged: Record Set Processing + Work Queue

## Status
- **Status**: Draft — competing alternative (option 3 of 3)
- **Created**: 2026-09-28
- **Revised**: 2026-09-28 — per-record detail rows kept in queue mode; heartbeat with buffered progress; cooperative in-flight cancel; record-cap fix; scope-provider registry
- **Author**: Dray + Claude
- **Branch**: dray/content-pipeline-framework
- **Depends on**: `feat/work-queue` landing on `next`, **and** a small set of generic additions to `packages/RecordSetProcessor` (see API Changes). This is the only one of the three plans in this PR that changes both systems rather than depending on one, unmodified.

## Relationship to the other two plans in this PR

This PR contains three competing architectures for the same five-stage content pipeline:

1. `content-pipeline-framework.md` — built entirely on Record Set Processing (RSP), unmodified.
2. `content-pipeline-framework-workqueue.md` — built entirely on Work Queue, unmodified.
3. **This document** — RSP and Work Queue are not two ways to do the same job. RSP is the processing engine; Work Queue is a queue substrate. They should compose, not duplicate each other.

None of the three documents were altered to accommodate this one.

## Overview

A Record Process is always the unit you configure and run. Its **scope** decides where its records come from:

- **Filter / View / List / SingleRecord** (today): RSP queries the entity directly. Single-tracked; exactly today's behavior.
- **Queue** (new): RSP claims records from a Work Queue subscription. Any number of containers can run the same Record Process concurrently, each claiming its own records atomically, with crash recovery via leases.

Same processor code, same declarative `WorkType` registry, same `ProcessBatch` bulk hook, same run history in both modes. Moving a stage from single-tracked to distributed is a scope change, not a rewrite.

The two systems each keep the job they're best at:

| Concern | Owned by | Recorded in |
|---|---|---|
| **Logistics** — is it running, on which container, since when, how many attempts, live status | Work Queue | `WorkQueueDelivery` |
| **Substance** — what was read, what was found, what failed and why | RSP | `MJ: Process Runs` / `MJ: Process Run Details` |

In queue mode a record gets both: a delivery row that tracks its logistics live, and a detail row that records what it actually did. Neither table is asked to do the other's job.

How records get *into* the queue is an implementation decision outside this framework — e.g. a scheduled job that finds ready records and publishes them. Everything needed for that already exists.

## Goals & Non-Goals

### Goals
- One processing engine, one `WorkType` registry, one bulk-efficiency mechanism, one run history, whether records come from a filter or a queue.
- Safe concurrent processing across any number of containers, including records that run for hours or days.
- Live status for long-running records, fed by the processor itself and flushed on each lease heartbeat.
- In-system cancellation: remove an item before pickup, and request a cooperative stop for one in flight — instead of killing a container.
- No capability of either system is lost, and neither team is asked to build something the other already has.

### Non-Goals
- No change to Work Queue's queue mechanics: claim, lease, sweep, dedup, fencing, topic/subscription model are used exactly as built.
- No removal of RSP's existing scopes — they remain the right choice for ad hoc, synchronous, single-instance work.
- No merging of `Process Run Details` and `WorkQueueDelivery` into one table. They record different things (see Overview).
- No decision on how records are published to the queue.
- No guarantee that an in-flight cancel stops work — it's cooperative (see Cancellation).

## Background & Context

Verified against source on the `feat/work-queue` branch:

**RSP**
- `IRecordSetSource` is pluggable (`packages/RecordSetProcessor/base/src/interfaces.ts`); `FilterSource`, `ViewSource`, `ListSource`, `ArraySource`, `KeysetSource` are independent implementations.
- `IRecordProcessor.ProcessBatch?` is dispatched once per page with every eligible record when present (`engine/src/RecordSetProcessor.ts:245`). A thrown batch fails every record in the page.
- The engine processes one page at a time: it claims/fetches the next page only after every record in the current page has settled (`runBatchLoop` → `processBatch` → `runWithConcurrency`).
- The engine trims a page to the run's `maxRecords` cap *after* the source returns it (`RecordSetProcessor.ts:134-144`). Harmless for a query; wrong for a claim (see Phase M0).
- `RecordProcessorContext` is built once per page and shared by every record in it; it carries no cancellation signal or progress channel.
- `RecordProcessExecutor.Run()` never passes a tracker, so every run gets `GenericProcessRunTracker`. Every built-in trigger — the scheduled-job driver, the Run Now remote operation, and on-change (via the `Run Record Process` action) — goes through `RunByID`.
- `ScopeType` and `WorkType` are database CHECK constraints (`CK_RecordProcess_ScopeType`, `CK_RecordProcess_WorkType`). New values need a migration that drops and re-adds the constraint, then CodeGen — the same path `'ML Model'` took.
- `RecordProcessorRegistry` (`base/src/registry.ts`) is the existing pattern for teaching RSP about something new from a separate package: the engine handles built-ins, then consults the registry. Predictive Studio uses it.

**Work Queue**
- `ITransportConsumer` (`packages/WorkQueue/core/src/transport.ts:88`) exposes every primitive this plan needs: `Receive(max)`, `ExtendLease(delivery, seconds, progress)`, `Complete`, `Retry(delaySeconds)`, `DeadLetter`, `Release` (no attempt consumed on the Database transport), `AcknowledgeCancel`, `Close`. `DatabaseTransportConsumer` is exported from `@memberjunction/work-queue-engine`.
- The unpartitioned claim takes up to N deliveries in one call (`spWorkQueueClaimUnpartitioned`, `migrations/v6/V202609241637__v6.2.x__Work_Queue_Guarded_Write_Sprocs.sql:311`).
- Database transport capabilities include `CancelPending`, `CancelInFlight` and `PersistsProgress` (`engine/src/transports/database/databaseCapabilities.ts`).
- `ExtendLease` is fenced on the lease token, `Status='InFlight'` and no cancel request (`spWorkQueueExtendLease`). It returns `'Held' | 'Lost' | 'Cancelled'`.
- A heartbeat carries `WorkProgress { Percent?: 0..100; Message?: ≤500 chars; Checkpoint?: small JSON }` into `WorkQueueDelivery.Progress`. Each heartbeat **replaces** the previous value — it is a latest-status slot, not a log.
- `HeartbeatIntervalSeconds(policy)` = `LeaseSeconds / 3`, capped. `ComputeBackoffSeconds` is exported. Both live in `@memberjunction/work-queue-core`.
- Subscriptions carry `MaxAttempts`, backoff, `LeaseSeconds`, `HeartbeatMode`, `MaxProcessingSeconds`, and `HostType` (`'MJWorker' | 'External'`). An `External` subscription is not consumed by MJ's own Work Queue host, so it won't compete with this plan's consumers.
- Consumer concurrency is host/process configuration, not a subscription column. N containers each running concurrency C process up to N×C records at once. Neither system enforces a global per-source rate limit across processes.

## Architecture / Design

### Data Model Changes

```mermaid
erDiagram
    MJRecordProcess {
        uuid ID
        string ScopeType "adds 'Queue' (CHECK constraint migration)"
        uuid ScopeWorkQueueSubscriptionID "populated only when ScopeType='Queue'"
        string WorkType
    }
    WorkQueueSubscription {
        uuid ID
        uuid TopicID
        string HostType "'External' for queue-scoped Record Processes"
        int LeaseSeconds
        int MaxAttempts
    }
    MJProcessRun {
        uuid ID
        uuid RecordProcessID
    }
    MJProcessRunDetail {
        uuid ID
        uuid ProcessRunID
        uuid WorkQueueDeliveryID "new, nullable — set in queue mode"
        json ResultPayload "substance: what was done, plus progress history"
    }
    WorkQueueDelivery {
        uuid ID
        uuid SubscriptionID
        string Status
        int AttemptCount
        string Progress "logistics: latest live status"
    }

    MJRecordProcess ||--o| WorkQueueSubscription : "scoped to, when ScopeType=Queue"
    MJRecordProcess ||--o{ MJProcessRun : "runs of"
    MJProcessRun ||--o{ MJProcessRunDetail : "one per record — both modes"
    WorkQueueDelivery ||--o| MJProcessRunDetail : "logistics of — queue mode"
```

`WorkQueueDeliveryID` on the detail row is the join between "what happened" and "where and how it ran." It could live in `ResultPayload` instead, but a real column lets the Record Process UI link straight to the delivery.

### Component / Flow Design

```mermaid
flowchart TB
    subgraph Unchanged["Unchanged in both modes"]
        Engine["RSP engine — pages, bounds concurrency, budget gate, circuit breaker, dry-run"]
        Processor["Processor — same code, same WorkType registry, same ProcessBatch hook"]
        Generic["GenericProcessRunTracker — Process Run header + one detail row per record"]
    end
    subgraph Queue["ScopeType = Queue — bridge package"]
        Source["WorkQueueSource — claims deliveries, runs the heartbeat, owns per-record signal + progress buffer"]
        Tracker["QueueAwareTracker — writes the detail row via GenericProcessRunTracker, then settles the delivery"]
    end
    Source -->|"claimed records"| Engine
    Engine --> Processor
    Processor -. "context.ReportProgress / context.Signal" .-> Source
    Processor --> Tracker
    Tracker --> Generic
    Tracker -->|"Complete / Retry / DeadLetter / AcknowledgeCancel"| WQ[("WorkQueueDelivery")]
    Source -->|"ExtendLease + latest progress, every heartbeat"| WQ
```

A queue-mode run, start to finish:
1. A container runs the Record Process — the same call any run uses. RSP opens a Process Run.
2. The engine asks the source for the next page, never more than the run's remaining cap. The source claims that many deliveries in one call and starts heartbeating all of them immediately, including records still waiting their turn in the page.
3. The processor runs each record, with a per-record context carrying a cancellation signal and a progress reporter.
4. As the processor reports progress, the source buffers it. Every heartbeat flushes the latest status to the delivery.
5. As each record finishes, the tracker writes its detail row — including the accumulated progress history — then settles the delivery.
6. When nothing is left to claim, the tracker closes the Process Run, the source stops its heartbeat timer and closes its consumer, and the container exits.

### Heartbeat and buffered progress

A record can run for hours or longer — a whole-source Discover has taken more than a day — so a long lease is not a substitute for renewing it.

- The source runs one timer per run at `HeartbeatIntervalSeconds(policy)` (a third of the subscription's `LeaseSeconds`; a 90-second lease gives a 30-second heartbeat). Each tick renews every claimed, unsettled delivery.
- A processor calls `context.ReportProgress({ Message, Percent, Checkpoint })` as often as it likes — the same places it would have written to the console. The source keeps only the latest value per record in memory, and each heartbeat sends it with the lease renewal. Reports between heartbeats cost nothing.
- Because the delivery's `Progress` is overwritten on each heartbeat, it shows *current* status ("inserted 200 of 3000"). The full sequence of reports is kept by the source and written into the record's detail row at the end, so the history isn't lost.
- `Checkpoint` carries small structured counters (e.g. `{ "Inserted": 200, "Total": 3000 }`) for a UI to render without parsing the message.
- Heartbeats run on the Node event loop. A driver that does long synchronous CPU work blocks them and loses its lease; such work must yield or run in a worker thread. This is the same rule Work Queue documents for its own handlers.

### Cancellation

Two levels, both in-system:
- **Before pickup:** an operator cancels the pending delivery. The claim procedure already skips cancelled deliveries, so no container ever picks it up. Nothing to build.
- **In flight (cooperative):** an operator requests cancel on an in-flight delivery. The next heartbeat's `ExtendLease` returns `'Cancelled'`. The source aborts that record's `context.Signal` with reason `'Cancelled'`. A processor that checks the signal — between pages of a crawl, between files, before a bulk call — stops and returns. The tracker records the outcome in the detail row and calls `AcknowledgeCancel`, which marks the delivery `Discarded` and frees it.

A processor that doesn't check the signal runs to completion; cancellation can't stop work the code doesn't pause for. That's the same guarantee Work Queue gives its own handlers.

A cancel request can never cause a record to run twice. Verified in the procedures: once a cancel is requested, `spWorkQueueCompleteDelivery` refuses to complete the delivery and `spWorkQueueExtendLease` stops renewing it. If the lease then expires while an unresponsive processor is still running, `spWorkQueueExpireLeases` marks it `Discarded` rather than returning it to `Pending`. So the tracker always ends a cancel-requested delivery with `AcknowledgeCancel`, even when the processor finished the work anyway. The detail row records what really happened; the queue records that it was cancelled.

Run-level pause/cancel (the Process Run's `CancellationRequested`, checked between pages) is unchanged and still works in queue mode.

If a heartbeat returns `'Lost'` — the lease expired and another container may now own the record — the source aborts the signal with reason `'LeaseLost'` and the tracker does **not** settle the delivery. The detail row still records what this container did.

### Settling a delivery

After writing the detail row, the tracker decides what the queue should do, checking in this order:

| Outcome | Settle call |
|---|---|
| Lease lost | none — another holder owns it |
| Cancel was requested during processing — whatever the processor's outcome | `AcknowledgeCancel` |
| `Succeeded` or `Skipped` | `Complete` |
| `Failed` with `FailureKind: 'Fatal'`, or attempts reached `MaxAttempts` | `DeadLetter` |
| Any other `Failed` | `Retry(ComputeBackoffSeconds(...))` |

That's the entire retry policy on this side. The backoff math is Work Queue's own exported function, not a re-implementation.

### API Changes

All additive and generic. None of them mention Work Queue.

```typescript
// record-set-processor-base — types.ts
export interface RecordResult {
    // ...existing fields unchanged
    /** Lets a tracker that supports retries distinguish "never retry" from "try again". Ignored by GenericProcessRunTracker. */
    FailureKind?: 'Fatal' | 'Transient';
}

export interface RecordProgress {
    Message?: string;   // a sink may truncate (Work Queue keeps 500 chars)
    Percent?: number;   // 0..100
    Checkpoint?: Record<string, unknown>;
}

// record-set-processor-base — interfaces.ts
export interface RecordProcessorContext {
    // ...existing fields unchanged
    /** Aborted when this record should stop: 'Cancelled', 'LeaseLost', or run shutdown. Absent for sources with no such concept. */
    Signal?: AbortSignal;
    /** Report status as often as convenient; the source decides how and when it's persisted. No-op when absent. */
    ReportProgress?: (progress: RecordProgress) => void;
}

export interface RecordBinding {
    Signal?: AbortSignal;
    ReportProgress?: (progress: RecordProgress) => void;
}

export interface IRecordSetSource {
    // ...existing NextBatch / Describe unchanged
    /** Optional. Supplies per-record controls; the engine merges them into that record's context. */
    BindRecord?(record: RecordRef): RecordBinding | undefined;
}

// record-set-processor-base — registry.ts (alongside RecordProcessorRegistry)
/** Builds the source and its paired tracker for a ScopeType the executor doesn't handle natively. */
export type RecordScopeProviderFactory = (context: RecordScopeBuildContext) => { Source: IRecordSetSource; Tracker: IProcessRunTracker };
export class RecordScopeProviderRegistry { Register(scopeType: string, factory: RecordScopeProviderFactory): void; /* ... */ }
```

Engine and executor changes:
- **Record cap:** ask the source for `min(batchSize, maxRecords - processed)`, not `batchSize`, so nothing is claimed that won't be processed.
- **Per-record context:** build each record's context from the page context plus `source.BindRecord?.(record)`. For the `ProcessBatch` path there is one call per page, so it receives a page-level signal (aborted on run shutdown) and a page-level progress reporter. Per-record cancels are honored when results are settled.
- **Scope provider:** `RecordProcessExecutor` handles the built-in scopes as today, then consults `RecordScopeProviderRegistry`, then fails — the same fall-through `BuildProcessor` already uses for work types. When a provider supplies a tracker, `Run()` passes it into `Process()`.

The source and its tracker come from one factory because they share state: which deliveries are claimed, their lease tokens, their signals and progress buffers.

`WorkQueueSource` and `QueueAwareTracker` live in a new package, `@memberjunction/record-set-processor-work-queue`, which depends on `record-set-processor-base` and Work Queue's packages and registers the `'Queue'` scope provider at startup. Neither `RecordSetProcessor` nor `WorkQueue` depends on it — the same arm's-length pattern Predictive Studio uses for its work type.

## Implementation Plan

### Phase M0 — Record-cap fix
The engine requests no more than the remaining cap from the source. Fixes a latent issue for any claiming source, and saves a wasted read for query sources. Unit test: a run capped at 30 with a page size of 100 requests 30.

### Phase M1 — Contract additions
`RecordResult.FailureKind`; `RecordProcessorContext.Signal` / `ReportProgress`; `RecordProgress`; `IRecordSetSource.BindRecord?`. The engine builds a per-record context. Existing sources, processors and trackers are unaffected — every new member is optional and absent today.

### Phase M2 — Scope-provider registry
`RecordScopeProviderRegistry` in base; `RecordProcessExecutor.BuildSource` and `Run()` consult it and pass the provider's tracker into `Process()`. Built-in scopes behave exactly as today.

### Phase M3 — `ScopeType = 'Queue'`
Migration dropping and re-adding `CK_RecordProcess_ScopeType` with `'Queue'`; new nullable `ScopeWorkQueueSubscriptionID` (FK to `WorkQueueSubscription`); new nullable `WorkQueueDeliveryID` on `ProcessRunDetail`; CodeGen. Record Process UI surfaces that switch on `ScopeType` need the new value handled.

### Phase M4 — `WorkQueueSource` (bridge package)
- `NextBatch` calls `DatabaseTransportConsumer.Receive(n)` and returns claimed deliveries as `RecordRef`s; `Exhausted` when fewer than requested come back. The cursor is unused and resume is disabled.
- Starts the heartbeat timer on first claim: renews every unsettled delivery with the latest buffered progress; maps `'Cancelled'` and `'Lost'` to that record's abort signal; retries a thrown `ExtendLease` on the next tick.
- `BindRecord` returns the record's signal and a `ReportProgress` that updates its buffer and appends to its history.

### Phase M5 — `QueueAwareTracker` (bridge package)
- Delegates the Process Run header, checkpoints, pause/cancel handshake and completion to a wrapped `GenericProcessRunTracker`.
- For each record: writes the detail row through the wrapped tracker, adding `WorkQueueDeliveryID` and the progress history, then settles the delivery per the table above.
- On `CompleteRun`: stops the heartbeat, `Release`s any delivery still claimed but never processed (e.g. after an unexpected exception — costs no attempt), closes the consumer.

### Phase M6 — Prove it end to end
No-op processor against a real `ScopeType='Queue'` Record Process, then:
- a slow processor outliving several lease periods, confirming heartbeats keep it and progress appears on the delivery;
- an in-flight cancel honored via the signal, ending `Discarded` with a detail row;
- a lease deliberately lost, confirming no settle and no double completion;
- two concurrent runs of the same Record Process, confirming no record is processed twice;
- a capped run, confirming nothing is claimed beyond the cap.

### Phase M7 — Apply to the pipeline stages
Each stage's Record Process uses `ScopeType='Queue'`, pointed at its subscription (per stage, or per source where a customer gets dedicated containers). Stage logic, working record and drivers are the same as in the other two plans. Long-running drivers (Discover, large crawls) check `context.Signal` between units of work and call `context.ReportProgress` where they used to log.

### Nothing retired
Filter, View, List and SingleRecord scopes stay available platform-wide for ad hoc and synchronous work.

## Migration & Data

- `CK_RecordProcess_ScopeType` re-created with `'Queue'`.
- `RecordProcess.ScopeWorkQueueSubscriptionID` — nullable FK.
- `ProcessRunDetail.WorkQueueDeliveryID` — nullable FK.
- `RecordResult.FailureKind`, `RecordProgress`, the context members and `BindRecord` are TypeScript only.
- No changes to any Work Queue table or procedure.

## Testing Strategy

- **Unit (RSP):** record-cap request size; per-record context merges `BindRecord`; scope-provider fall-through and tracker pass-through; built-in scopes unchanged.
- **Unit (bridge):** heartbeat cadence from `LeaseSeconds`; progress buffered and flushed only on heartbeat; history written to the detail row; `'Cancelled'` and `'Lost'` map to the right signal reasons; settle table, including backoff from `ComputeBackoffSeconds`.
- **Live database** (the pattern Work Queue's engine tests already use, `MJ_WORKQUEUE_LIVE_DB=1`): the Phase M6 scenarios.
- **Integration tier:** one bundle running the same processor through a `FilterSource` and a `WorkQueueSource`, asserting identical detail rows apart from `WorkQueueDeliveryID`.

## Risks & Open Questions

- **Cooperative cancel only.** A processor that never checks `context.Signal` runs to completion. Drivers need to be written with checkpoints where stopping is safe.
- **Head-of-line blocking within a page.** The engine fetches the next page only after the current page fully settles, so a page moves at the speed of its slowest record. For stages mixing multi-hour and seconds-long records, use a small `BatchSize` (1 for whole-source Discover) until a rolling mode exists.
- **Event-loop blocking** stops heartbeats (see Heartbeat). Needs to be in driver-author guidance.
- **Progress is latest-value.** The delivery holds one status up to 500 characters plus percent and a small checkpoint; history lives in the detail row, written at the end. If history must be visible *while* a record runs, the tracker would also update the detail row in place — deferred until needed.
- **No global per-source rate limit.** Concurrency is per process; isolating a source to one container with concurrency 1 is the only way to guarantee a strict ceiling today.
- **Cross-team dependency.** Needs RSP and Work Queue codeowners' sign-off, though Work Queue itself needs no changes.
- **`FailureKind` inference.** Explicit per processor for now; revisit if a thrown-error convention (like Work Queue's `FatalWorkError`) proves simpler.
- **Declarative work types at queue scale.** `Action`/`Agent`/`FieldRules`/`ML Model` Record Processes become runnable against queue scope for free; worth confirming with their owners that no extra guardrails are wanted.
- **`HandleBatch` is unnecessary under this plan.** `ProcessBatch` already covers bulk work for queue-scoped records. That request to Work Queue should wait until a direction is chosen; it only applies if the Work-Queue-only plan wins.

## Files to Modify

| File / Package | Change |
|---|---|
| `packages/RecordSetProcessor/base/src/types.ts` | `RecordResult.FailureKind`, `RecordProgress` |
| `packages/RecordSetProcessor/base/src/interfaces.ts` | `RecordProcessorContext.Signal` / `ReportProgress`, `RecordBinding`, `IRecordSetSource.BindRecord?` |
| `packages/RecordSetProcessor/base/src/registry.ts` | `RecordScopeProviderRegistry` |
| `packages/RecordSetProcessor/engine/src/RecordSetProcessor.ts` | Cap-aware page request; per-record context |
| `packages/RecordSetProcessor/engine/src/RecordProcessExecutor.ts` | Scope-provider fall-through; pass provider tracker into `Process()` |
| New `@memberjunction/record-set-processor-work-queue` | `WorkQueueSource`, `QueueAwareTracker`, `'Queue'` provider registration |
| `packages/WorkQueue/*` | None |
| `migrations/v6/` | `ScopeType` CHECK, two nullable FK columns |
| `packages/MJCoreEntities` (generated) | Via CodeGen |
| Record Process Explorer UI | Handle `ScopeType='Queue'`; link detail rows to deliveries |

## References

- Sibling plans: `content-pipeline-framework.md`, `content-pipeline-framework-workqueue.md`.
- `packages/RecordSetProcessor/base/src/interfaces.ts`, `types.ts`, `registry.ts`.
- `packages/RecordSetProcessor/engine/src/RecordSetProcessor.ts`, `RecordProcessExecutor.ts`, `trackers/GenericProcessRunTracker.ts`.
- `packages/WorkQueue/core/src/transport.ts`, `handler.ts`, `backoff.ts`.
- `packages/WorkQueue/engine/src/transports/database/` — `DatabaseTransportConsumer`, `databaseCapabilities.ts`.
- `migrations/v6/V202609241637__v6.2.x__Work_Queue_Guarded_Write_Sprocs.sql` — claim, extend-lease and settle procedures.

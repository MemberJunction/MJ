# 09e — Integration Runs Revamp onto the Work Queue — Follow-on

## Summary

This moves integration work onto the queue: both **sync requests** (pull-based syncs triggered manually, by
schedule or by webhook) and **pushed batches** (use case 2). The Phase 1 queue replaces the bespoke
`CompanyIntegrationRun` queue:
- `Status='Queued'` rows
- the claim/renew/release stored procedures
- `PollQueuedRuns`, `IntegrationSyncWorkerService`, and orphan resume

`CompanyIntegrationRun` stays as the **run record** (history, progress, statistics, UI). Its execution
ownership moves to the **delivery lease**. This is a revamp of a queue *user* (D10), not of the queue.

## Motivation

- **Two durable-work mechanisms to maintain.** The integration engine carries a hand-built lease/fence
  protocol (`packages/Integration/engine/src/RunOwnershipService.ts`: `Claim` :156, `Renew` :178,
  `CheckBoundary` :205, `Release` :241, `RunOwnershipLostError` :22). It also has a polling queue
  (`IntegrationEngine.EnqueueSync` :1156, `PollQueuedRuns` :825, `ExecuteQueuedRun` :1188,
  `ResumeOrphanedSyncs` :872) and a worker (`packages/MJServer/src/services/IntegrationSyncWorkerService.ts`).
  All of it duplicates the queue's claim/lease/retry/dead-letter behavior.
- **Per-integration exclusivity is in-process only.** `IntegrationEngine.activeSyncs`, checked in
  `ResumeOneOrphanedRun` (~:941–962), guards one process. Cross-instance exclusivity relies on the claim sproc
  per *run*, not per *integration*. An `Exclusive`/`Ordered` subscription keyed by `CompanyIntegrationID` makes
  "one active unit of work per integration" a cross-instance guarantee.
- **Pushed data has nowhere to land.** `SyncTriggerType` includes `'Webhook'`
  (`packages/Integration/engine/src/types.ts:7`), but there's no ingress, no ordering of pushed batches, and no
  dead-letter handling.
- **Scheduling runs sync inline.** `IntegrationSyncScheduledJobDriver`
  (`packages/Scheduling/engine/src/drivers/IntegrationSyncScheduledJobDriver.ts:73`) calls `RunSync` inside the
  scheduler's concurrency slot and heartbeats the scheduler lease. Long syncs occupy scheduler capacity.

## Scope / Non-goals

**In scope:** topics and subscriptions for integration work, handler implementations, webhook batch ingress
pattern, a compatibility flag, deprecation of the bespoke queue paths, and a UI progress mapping.

**Non-goals:**
- Changing connector APIs (`BaseIntegrationConnector.FetchChanges`, `FetchBatchResult`).
- Watermark semantics (`WatermarkService`).
- The record-mapping engine.
- Cloud-hosted integration consumers: handlers need MJ entities → `MJWorker` host (D5).
- `Ordered` on a cloud topic. Revision 4 made `Ordered` **Database-only** (11 §1, S2 — no staging of cloud messages
  into the database), so `integration.batch-ready` lives on the Database transport. The `Exclusive` topics may sit on
  either transport.

## Options

| Option | Description | Pros | Cons |
|---|---|---|---|
| A. Queue *triggers* the existing run | Handler calls `ExecuteQueuedRun`, which keeps `RunOwnershipService` | smallest change | two leases per unit of work (delivery + run), two liveness/orphan systems, double retry semantics, a cancellation path only on the run side |
| **B. Queue *owns* execution** | Delivery lease = ownership; `LeaseToken` = fence; `CompanyIntegrationRun` becomes a record written by the handler | one mechanism; cross-instance per-integration exclusivity; retries and dead letters uniform with everything else | touches the engine's boundary checks and cancel path (in-flight cancel is Phase 1, 03 §7) |
| C. A then B | ship A behind a flag, then collapse to B | de-risks rollout | two migrations of the same code |

**Recommendation: B, with a compatibility flag** (`integrationSync.executionMode: 'LegacyQueue' | 'WorkQueue'`,
default `LegacyQueue` for one release, then flipped). Option A's double lease is exactly the class of bug the
queue exists to remove.

## Design

### Topology (system metadata in `metadata/work-queue-topics/`, subscriptions nested — 02 §5)

| Topic | Transport | Payload | Publisher |
|---|---|---|---|
| `integration.sync-requested` | Database (default) or AWS (FIFO topic, because the subscription is `Exclusive`) | `{ CompanyIntegrationID, TriggerType, Options: IntegrationSyncOptions, RequestedByUserID }` | `EnqueueSync`, scheduled-job driver, UI |
| `integration.batch-ready` | **Database only** (`Ordered`) | `{ CompanyIntegrationID, BatchID, RecordCount, Format }` + `PayloadRef` | the webhook ingress — the **single producer** for an integration's batches, publishing them in order |
| `integration.sync-completed` | Database (default) or AWS | `{ CompanyIntegrationRunID, VendorJobID, Outcome }` | vendor webhook (connectors whose sync runs at the vendor) |

There is no `OrderingMode`: order is publish order (11 §1, S1 cut explicit sequences).

| Subscription (all `HostType: MJWorker`) | Topic | PartitionMode (key = CompanyIntegrationID) | Handler | Policy notes |
|---|---|---|---|---|
| `integration.sync` | sync-requested | `Exclusive` | `IntegrationSyncWorkHandler` | `HeartbeatMode: Auto`, `LeaseSeconds: 120`, `MaxAttempts: 3` |
| `integration.apply-batch` | batch-ready | `Ordered` | `IntegrationBatchApplyHandler` | `HeartbeatMode: Manual` (heartbeat per record chunk), `MaxAttempts: 5`, `LeaseSeconds` sized for the longest chunk |
| `integration.sync-completed` | sync-completed | `Exclusive` | `IntegrationSyncCompletionHandler` | `HeartbeatMode: Auto`, `MaxAttempts: 5` — only for vendor-completed connectors |

**Cross-topic exclusivity (open question 1).** A pull sync and a pushed batch for the same integration could
run at the same time, because single flight is enforced per subscription (the unique in-flight index
`(SubscriptionID, PartitionKey)`, 03 §6.5). Phase 1 of the revamp prevents it inside
the handlers by taking a lightweight per-integration DB guard (below). A contract-level "shared partition
group" across subscriptions is a candidate queue feature.

### Handler: `IntegrationSyncWorkHandler` (replaces worker + orphan resume)

```
Handle(msg, ctx):
  run = find-or-create CompanyIntegrationRun for msg.MessageID   (idempotent: ConfigData.WorkMessageID)
        Status 'In Progress', OwnerToken = ctx.DeliveryID, FenceToken = ctx.Attempt
  guard = acquire IntegrationExecutionGuard(CompanyIntegrationID, ctx)   (see below) → busy → Retry(60s)
  resume point = completed entity maps from run details (reuse ResumeOrphanedSyncs' detection logic,
                 extracted into a pure function)
  engine.RunSyncOwned(run, options, boundary = () => ctx.Signal.aborted ? throw RunOwnershipLostError : ok,
                      onProgress = p => ctx.Heartbeat({ Percent, Message, Checkpoint: { EntityMapIndex } }))
  success → run.Status='Success' → Complete
  connector transient error → run keeps 'In Progress' progress → Retry(backoff)
  config/auth error (non-retryable) → run.Status='Failed' → DeadLetter(reason)
  ctx.Signal aborted (lease lost) → stop writing, no settle (runtime ignores)
  cancel requested (03 §7, F2: heartbeat false, ctx.Signal.reason === 'Cancelled') → run.Status='Cancelled' →
                                 stop; the runtime calls AcknowledgeCancel → delivery Discarded, key freed at once
```

`RunOwnershipService.CheckBoundary` is replaced by a `BoundaryCheck` callback that the engine calls at the same
batch boundaries. It's backed by `ctx.Signal` plus a fenced heartbeat. The DB transport's fenced `ExtendLease`
returns `Lost` exactly when another claim superseded this one, which is the same guarantee `FenceToken` gave.

### Handler: `IntegrationBatchApplyHandler`

```
Handle(msg, ctx):
  guard (as above)
  reader = open PayloadRef (mjstorage:// via FileStorageEngine.GetDriver → GetObject stream; s3:// via SDK)
  checkpoint = ctx previous Progress.Checkpoint (persisted by the Database transport) → skip N records
  for each chunk (MaxBatchSize): engine.ApplyRecords(chunk) ; ctx.Heartbeat({ Checkpoint: { Offset } })
  all good → Complete   | poison records → write reject file, DeadLetter if policy says batch-atomic,
                          else Complete with run detail errors (per-integration setting)
```

Ordering semantics: batch N+1 for an integration waits until batch N is `Completed` (or `Discarded`). A
dead-lettered batch **blocks** that integration's later batches (D7) — the block is derived from the head delivery's
`DeadLettered` status (03 §7); there is no sequence counter and no partition-state table. This is the intended
data-safety behavior from use case 2. Operators fix it through the `WorkQueue.ReplayDeadLetter` and
`WorkQueue.DiscardDelivery` remote operations.

### Connectors whose sync finishes at the vendor (split-message pattern)

Some connectors do not run the sync in our process at all: we ask the vendor to start a job (HotGlue-style), the job
runs for minutes or hours on their side, and a webhook tells us it finished. **The queue does not wait for that.** A
delivery's guarantees end when its handler settles ([02 §1a](../02-implementation-overview.md#1a-where-the-queue-stops)),
so the work is split across two messages:

```
integration.sync-requested ─► IntegrationSyncWorkHandler
      vendor job already active for this integration?  → domain decision (below) → Complete
      otherwise: POST start-job → store { VendorJobID, StartedAt, Status:'Awaiting' } on CompanyIntegrationRun
                 → Outcome.Complete()            (lease released; nothing is held open)

vendor webhook ─► IntegrationWebhookExtension
      verify signature → look up the run by VendorJobID
      → PublishAs('integration.sync-completed', { PartitionKey: ciId, Payload: { CompanyIntegrationRunID, VendorJobID },
                  DeduplicationKey: 'vendorjob:' + vendorJobId })      // provider retries converge

integration.sync-completed ─► IntegrationSyncCompletionHandler   (Exclusive by CompanyIntegrationID)
      load the run, fetch/apply results, mark Success or Failed → Complete
```

Three things this makes explicit, all of them **the integration's job**:

| Concern | Where it lives |
|---|---|
| **Overlap / coalescing.** A second request arriving while a vendor job is active | The `Exclusive` subscription serialises deliveries per `CompanyIntegrationID`, so the handler reads `CompanyIntegrationRun` without a race and decides: skip (`Complete` with a note), merge into the active job, or `Retry(60s)` to queue behind it. MJ Central's priority rules (empty > manual > scheduled) are exactly this kind of policy and stay in the connector |
| **Stall detection.** A vendor job whose webhook never arrives | The run row knows `StartedAt` and `Status='Awaiting'`; a scheduled job (or the next sync request) sweeps runs older than the connector's timeout and marks them `Failed`, optionally re-requesting. The queue has nothing to time out, because nothing is parked in it |
| **Idempotency.** Duplicate webhooks, replayed completions | `DeduplicationKey` on the vendor job ID suppresses repeats inside its window; the completion handler is written to be re-runnable against the run row |

An `AwaitExternal` queue state was considered for this and declined — see
[09i, "Considered and declined"](09i-minor-follow-ons.md#considered-and-declined-revision-3).

### IntegrationExecutionGuard

This is a per-integration cross-subscription mutual exclusion, needed only while two subscriptions can touch
the same integration. It adds columns to `CompanyIntegration`: `ExecutionOwner nvarchar(200) NULL`,
`ExecutionLeaseExpiresAt datetimeoffset NULL`.

The existing `LockedAt` / `LockedByInstance` columns appear unused by engine code, so they could be repurposed.
That needs verification; if confirmed, prefer repurposing over adding columns.

Mechanics: a compare-and-swap UPDATE with row-count semantics, on the DB clock, renewed alongside the
heartbeat. If this is later replaced by a queue "partition group" feature, it's removed.

### Publishing batches in order (the single-producer rule)

`Ordered` means **publish order**, so the producer owns the order (10 §5a, 11 §1). For pushed batches the producer
is the webhook ingress, and the order is the order in which its publishes **commit**:

- On the Database transport, plan 05 serialises publishes for one partition key with a transaction-scoped
  application lock, so two MJAPI instances receiving webhooks for the same integration cannot commit ordinals out of
  order — the batches are ordered by arrival at MJ.
- The ingress stores the object and publishes **in one transaction**, and returns `202` only after commit. A
  provider that waits for the `202` before sending its next batch therefore gets strict order end to end.
- **If a provider can deliver batches out of order** (parallel uploads, its own retries overtaking later batches),
  arrival order is not the right order and `Ordered` would faithfully apply the wrong one. Do **not** try to repair
  that with a "wait for batch N−1" precondition under `Ordered`: an early batch N becomes the head of the key, batch
  N−1 queues *behind* it, and the head retries until it dead-letters and blocks the key. Use `Exclusive` for that
  connector instead — the early batch backs off, the missing one runs, and the retry then succeeds — with the
  precondition checked against the provider's batch number on the domain row. The price is that a permanently failed
  batch no longer halts the later ones automatically; they fail their own precondition and dead-letter after
  `MaxAttempts`. This is a per-connector choice recorded on its subscription.
- Queue-level reordering by producer sequence numbers was cut in Revision 4 and is in 09i's declined register, with
  the evidence that would reopen it (a real producer whose ordering authority is external and that a handler-side
  version check cannot solve).

### Webhook ingress (pushed data)

```
Provider ──POST──► IntegrationWebhookExtension (Server Extension, per connector route; signature verify
                   by connector hook e.g. BaseIntegrationConnector.VerifyWebhook — new, optional)
   1. store raw body → MJStorage (FileStorageEngine.UploadFile) key integrations/{ciId}/{yyyy}/{mm}/{dd}/{uuid}
   2. txn: record the batch on the domain side (object key, provider delivery id), then
           WorkQueueEngine.PublishAs('integration.batch-ready', [{ PartitionKey: ciId,
                                   PayloadRef: { Uri: 'mjstorage://…', SizeBytes, Checksum },
                                   DeduplicationKey: 'webhook:' + providerDeliveryId }],   // provider retries
                                   { ContextUser, Provider: txnProvider })
           (the CompanyIntegrationRun row is created later, by the handler)
   3. 202 to provider after commit (a provider retry of the same delivery gets `Duplicate` → 202, and no second
      delivery; only a *confirmed* reservation is a duplicate — 03 §2.1, F1)
```

`integration.batch-ready` is a Database topic, so the publish always enlists in the ingress transaction (02 §4.2):
the message, its delivery and the ledger row commit with the domain row, or none do.

### Producers updated

| Today | After (flag = WorkQueue) |
|---|---|
| `IntegrationEngine.EnqueueSync` inserts `Queued` run | publishes to `integration.sync-requested`; returns MessageID (the run row is created by the handler; the API returns a "pending run" handle resolved by MessageID) |
| `IntegrationSyncScheduledJobDriver` calls `RunSync` inline | publishes and returns immediately; the scheduled job run completes on publish. The run links back via `Options.ScheduledJobRunID`. |
| UI "Run now" | publishes (same as EnqueueSync) |
| MJServer boot `ResumeOrphanedSyncs` (`packages/MJServer/src/index.ts` ~1540) | removed; lease expiry is the orphan mechanism |
| `IntegrationSyncWorkerService` (index.ts ~1493–1505) | not started; `WorkQueueHost` runs the `integration.*` subscriptions |

### Cancellation (Phase 1)

The UI cancel today sets `CancelRequestedAt`, which `spRenewCompanyIntegrationRunLease` returns on each renew.
After the revamp, `CancelSync` calls `WorkQueue.DiscardDelivery` for both cases — Phase 1 covers them (03 §7,
capabilities `CancelPending` and `CancelInFlight`, both `true` on the Database transport). `integration.sync` on an
AWS topic would lose in-flight cancel (`CancelInFlight: false` on SQS), which is one more reason to keep integration
topics on the Database transport:

- **Pending (unclaimed):** the delivery becomes `Discarded` immediately; `CancelSync` marks the run `Cancelled`.
- **In flight:** `CancelRequestedAt` is set (the lease token is **not** rotated — 03 §7, F2). The handler's next
  `ctx.Heartbeat()` — at most 30 s later whatever the lease length (F3) — resolves `false`, and `ctx.Signal` aborts
  with `reason === 'Cancelled'`. The handler stops work and writes `CompanyIntegrationRun.Status='Cancelled'` on its
  **own row** (that write is not fenced — only the queue settle is); the runtime then calls `AcknowledgeCancel`, the
  delivery becomes `Discarded` immediately and the `Exclusive` key is free for the next request. If the worker is
  dead, `ExpireLeases` discards the row when the lease runs out; either way a queued sync cannot start on top of a
  run still winding down.

`ctx.Signal.reason` (`'Cancelled' | 'LeaseLost' | 'MaxProcessingSeconds' | 'Shutdown'`, 03 §3) tells the handler
which it is, so it marks the run `Cancelled` only for a real cancel and leaves it `In Progress` for the next owner on
`LeaseLost`. Cancelling a vendor-side job is a connector call the handler makes before it stops.

### Compatibility & migration plan

| Step | Release |
|---|---|
| 1. Add queue topics/subscriptions metadata, handlers, guard, flag (default `LegacyQueue`) | N |
| 2. Drain rule at flag flip: new work → queue; existing `Queued` runs are drained by a one-time bridge job that publishes them to `integration.sync-requested` and marks them `Cancelled` with note `MovedToWorkQueue` | N |
| 3. Flip default to `WorkQueue`; legacy worker + resume disabled unless flag set | N+1 |
| 4. Remove legacy paths; keep ownership columns (publish-no-break policy — additive only; columns become unused) and the sprocs until the next major | next major |

UI progress keeps reading `CompanyIntegrationRun.ProgressJSON` (`GetSyncProgressAsync` ~:745). The handler
mirrors `ctx.Heartbeat` progress into it, so the Integration dashboard needs no change beyond liveness reading
`Delivery.LeaseExpiresAt` instead of `Run.LeaseExpiresAt` (a small query change).

## Interfaces / schema changes

- `CompanyIntegration.ExecutionOwner`/`ExecutionLeaseExpiresAt` (or repurposed `LockedAt`/`LockedByInstance`) for the execution guard. No sequence column: order is publish order.
- Optional `BaseIntegrationConnector.VerifyWebhook(request)` hook.
- No contract proposals are required: in-flight cancel and the abort reason shipped in Phase 1 (03 §3, §7), and
  C6 is not needed because integration subscriptions are on the Database transport, which persists checkpoints.
- `integration.sync-completed` topic + `IntegrationSyncCompletionHandler`, for connectors whose sync finishes at the
  vendor.
- Engine refactor: `RunSyncOwned(run, options, boundaryCheck, onProgress)` extracted from `runWithOwnedContext`.

## Dependencies on Phase 1

Database transport with `Exclusive` and `Ordered` and the per-key publish-order lock (plan 05); in-transaction
publish and the deduplication ledger (plan 05); `WorkQueueHost` (plan 06); remote operations `DiscardDelivery`
(pending and in-flight cancel) / `ReplayDeadLetter` for stuck batches (plan 06); `Progress.Checkpoint` persistence.

## Testing

| Tier | What |
|---|---|
| Unit | resume-point detection (pure fn), guard CAS, handler outcome mapping (incl. `Signal.reason`) |
| Integration (deterministic) | a mock connector through the queue: kill worker mid-sync → redelivery resumes from completed maps; two instances → no concurrent run for one integration; batches published 1,2,3 by the ingress → applied 1,2,3 across two hosts; two ingress instances publishing for one integration concurrently → commit order preserved; batch 2 poison → 3 blocked until Replay or Discard; in-flight cancel frees the key as soon as the handler stops |
| Compatibility | flag flip with `Queued` legacy runs drained exactly once |
| Regression | existing Integration test suites under both flag values |

## Work breakdown

| Item | Size |
|---|---|
| Topology metadata + handlers (sync, batch apply) | L |
| Engine refactor (boundary callback, resume-point extraction, RunSyncOwned) | L |
| Execution guard + migration | M |
| Webhook ingress extension + connector hook | M |
| Producers (EnqueueSync, scheduled driver, UI) behind flag | M |
| Cancel: pending and in-flight, both via `DiscardDelivery` (Phase 1) | S |
| Drain bridge + deprecations | S |
| Tests | L |

## Open questions

1. Should the queue gain a **partition group** (shared partition state across subscriptions) so the execution guard
   isn't needed? Revision 3's boundary rule says no by default — cross-subscription mutual exclusion over a *domain*
   entity is domain state, and the guard is ~20 lines of conditional UPDATE. Reopen only if several consumers need
   the same thing.
2. Batch atomicity: apply a pushed batch all-or-nothing (dead-letter on any poison record), or record per-record errors and complete? A per-integration setting is proposed.
3. Should pull syncs *emit* batches (`integration.batch-ready`) so both paths share the apply handler, making `integration.sync` a pure fetch stage?
4. Retention: stored batch objects are deleted by the handler on `Completed`, or kept N days for audit?

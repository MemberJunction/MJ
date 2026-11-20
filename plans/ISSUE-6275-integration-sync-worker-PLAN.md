# ISSUE-6275 — Integration syncs on the work queue: the co-located worker

**Resolves:** #6275 (decision issue). **Related:** #4824, #5510, #5673, #6273, #6274, the architectural review on
#4709 (comment 6507854693), and spec `plans/work-queue-1/09-follow-on/09e-integration-runs-revamp.md` on
`spec/work-queue`.

**Status:** Task 0 (#6273, #6274) is fixed in PR #6369. Tasks 1–8 are designed here and not started.

---

## 1. Summary

Integration syncs run inside the MJAPI process today. A heavy connector run competes with GraphQL requests for the
event loop and for the heap, and the largest tenant already runs MJAPI near the ceiling where a sync can push it into a
pm2 memory restart. This plan moves sync execution to a second Node process on the same machine (`mj-worker` under
pm2) that is started on demand by the MJ Work Queue and exits when idle. MJAPI keeps every other integration duty
(discovery, apply, the GraphQL surface, the queue sweeper). The same handler later runs unchanged in a container job
when a tenant tier needs real isolation.

The design follows 09e **Option B**: the work queue delivery lease *is* execution ownership. The engine's own run
lease (`RunOwnershipService`, 10-minute claim, renew timer, stale sweep) is not used on the queue path, because two
leases over one run is the double-lease bug class the queue exists to remove. Option A (queue triggers
`ExecuteQueuedRun`) is rejected for that reason by both the 09e options table and the #4709 review.

Three decisions shape everything else:

1. **MJ Central is the first customer, MJ is the home of the code.** Handler, producer, topology, worker entry point
   and config flag live in MJ packages. The chassis (pm2 ecosystem, spawn tick, deploy variables) lives in the
   platform repo and is about 60 lines.
2. **One handler, two hosts.** Phase 1 is `mj-worker` under pm2 on the MJAPI machine. Phase 2 is the same handler in
   ECS Fargate or Azure Container Apps, gated on a database-backed progress stream.
3. **`Inline` stays the default for one release.** `integrationSync.executionMode` flips a tenant to `WorkQueue`;
   flipping it back is the rollback.

---

## 2. Problem

Measured on PLUS production (MJAPI 6.1.6, 4 vCPU, 15,770 MB RAM) in October 2026. The numbers are from the memory
investigation and the stalls diagnosis; they are the sizing inputs for §8.

| Measure | Value | Why it matters |
|---|---|---|
| Live heap, steady state | 4,250–4,535 MB | Already 40–45 % of the 10,322 MB `--max-old-space-size` ceiling before any sync |
| Metadata held in heap | ~400 MB (806 API entities, 59,271 entity fields) | Paid once per process; the worker pays it too |
| Integration field maps | ~300 MB | Loaded by the engine `Config`; paid again by the worker |
| Unattributed retained | ~3.3 GB | Mostly V8 page pool plus NetForum regex-sliced values (fixed by PLUS#90); still inside the ceiling |
| RSS | 7.6 GB | pm2 `max_memory_restart` fires on RSS, not heap |
| One sync run | 1.5–6 CPU-minutes, 10–60 GB allocated, +80–130 MB retained | Allocation churn stalls the loop; retained growth never returns while the process lives |
| pm2 memory restarts | 10-13, 10-14, 10-16 at 12.9–13.75 GB | All around discovery or apply, with syncs resident |
| Average CPU | 0.6–6 %, peaks 70–80 % | A sync peak coincides with request serving on 4 vCPU |
| Daytime CPU profile | 52 % in the metadata serve | The worker must not add to that path; it must take load away |
| Sync schedule | NetForum 7:00 pm ET, Elevate 7:30 pm ET | Nightly, sequential, before the overnight rasa sync |
| MJAPI startup | 174 s, of which 109 s is the GraphQL schema | A second full MJAPI costs this on every start; a worker without GraphQL does not |

What the inline model cannot give us:

- **No memory isolation.** A sync's retained growth and its allocation storm land on the heap that serves every
  request. The only lever is a larger instance.
- **No CPU isolation.** The event loop is shared; the stalls diagnosis showed request p95 tracking sync batches.
- **Boot resume adopts in-process.** `ResumeOrphanedSyncs` runs on every MJAPI boot (`index.ts` L1778) and resumes
  up to `ResumeConcurrency()` runs inside the API, which is #4824's symptom: a restart meant to free memory starts
  the heaviest work again immediately.
- **Smaller tiers cannot run syncs at all.** On a 4 GB MJ Central tier the API alone fills the box.

---

## 3. Options considered

| # | Option | Isolation | Idle cost | Cold start | Verdict |
|---|---|---|---|---|---|
| 1 | Inline in MJAPI (today) | None | 0 | 0 | Keep as `Inline` mode and the rollback switch; not the target |
| 2 | Second full MJAPI in a worker role (`MJ_SERVER_ROLE=worker`) | Process | ~5 GB on PLUS (metadata + field maps + GraphQL schema) | 174 s | Rejected: doubles the largest fixed cost, builds a schema it never serves, runs its own sweeps and auto-upgrade |
| 3 | `IntegrationSyncWorkerService` poller (exists, off by default) | None when hosted in MJAPI; Process only with option 2 | Polls every 15 s | 0 | Rejected as the long-term path: Option A semantics (run-row lease, `Status !== 'Queued'` refuses retries, resumes from map 0); keep the code one release for compatibility, then remove |
| 4 | **Work Queue handler in `mj-worker` under pm2 (chosen)** | Process, own heap ceiling, lower OOM and CPU priority | 0 (process exits when idle) | 5–15 s small tenant, ~60 s PLUS-size | Fits every MJ Central tier that has the RAM; no new platform; the handler is reused by option 5 |
| 5 | Container job (ECS Fargate / Azure Container Apps) | Machine | 0 | 30–90 s | Phase 2, same handler; blocked on a database-backed progress stream (§13) and a container platform per tenant |
| 6 | AWS Lambda / Azure Functions | Machine | 0 | 60 s + metadata | Rejected: 15-minute cap against runs that take minutes to hours; no local disk for the JSONL stream |

Option 4 over option 5 for phase 1 because MJ Central provisions an EC2 instance or an App Service per tenant and
nothing else; the run worker on Azure Container Apps exists for provisioning only and is not in every tenant's
environment.

---

## 4. What the review changed

| # | Review point (rkihm-BC, #4709 comment / #6275) | Decision | Where |
|---|---|---|---|
| 1 | `ExecuteQueuedRun` refuses retries (`Status !== 'Queued'`), restarts from entity map 0, and its 10-minute run lease races the delivery lease | **Option B.** New `RunSyncOwned`; the boundary check reads the delivery `Signal`; the resume-point filter is extracted from `resumeOneOrphanedRun` and runs on every attempt; `Claim`/`Renew`/`Release` are not called on the queue path | Tasks 2, 3 |
| 2 | Cancel only stamps `CancelRequestedAt`; the delivery stays on the Exclusive key | `CancelSync` in `WorkQueue` mode calls the transport operator's `Discard` (pending and in flight). The handler never calls the cancel API; it marks its own run `Cancelled` when `Signal.reason === 'Cancelled'` | Task 5 |
| 3 | Worker-run sweeper: when the worker is dead nothing purges retention or the dedup ledger (#6274) | MJAPI keeps the host with `subscriptions: []`, `sweeperEnabled: true`. The worker runs `SweeperIntervalMs: 0`. `mj queue sweep` exists for hosts with no MJAPI | Task 0, 6 |
| 4 | Spawn-on-publish races the idle exit | Level-triggered: MJAPI checks `GetBacklog('integration.sync')` every 60 s and starts the worker when `Claimable > 0` and the process is not online. `OnPublished` stays as the fast path | Task 6, §7 |
| 5 | `SharedProviderSource` + `concurrency > 1` interleaves transactions (#6273) | Provider minted per delivery everywhere (`IndependentProviderSource`), released in `finally`. Phase 1 runs `Concurrency: 1` for the memory budget, not for safety | Task 0 |
| 6 | MJAPI boot `ResumeOrphanedSyncs` would adopt a worker's run in-process | Skipped when `integrationSync.executionMode === 'WorkQueue'` (also the #4824 symptom) | Task 6 |
| 7 | `webhookURL` fires from the in-process promise | Stored in `CompanyIntegrationRun.ConfigData`; the handler fires it on completion and failure | Tasks 3, 4 |
| 8 | Scheduled driver awaits inline and writes counts + notification | Driver publishes and returns `Details: { Dispatched: true, CompanyIntegrationRunID }`. The handler writes final counts back and sends the notification when `ScheduledJobRunID` is set | Tasks 3, 4 |
| 9 | Custom-column promotion and cache-invalidation broadcast are registered only in MJAPI | The worker entry registers both. `SchemaUpdatePending` is written to the run row; MJAPI reads it on its metadata refresh (open question 3) | Task 7 |
| 10 | Smaller worker heap: a sync over the ceiling OOMs three times and dead-letters even with MJAPI idle | The ceiling W comes from a measured run on a copy of the largest tenant database, never an estimate. MJAPI keeps its full ceiling | §8 |
| 11 | Progress JSONL files are local | Fine for phase 1 (same disk). A database-backed stream for `IntegrationTailRunEvents` is the **gate for phase 2** | §13 |

Points the review confirmed and the plan keeps: run row and publish in one transaction (claim check); `Exclusive`
partition by `CompanyIntegrationID`; the same handler and topology from pm2 to container jobs; pre-creating the run
row lets `IntegrationStartSync` return the real `RunID` and drop the recency polling loop in
`IntegrationDiscoveryResolver`.

One change from the earlier draft of this plan: the producer does **not** set a `DeduplicationKey`. The ledger's TTL
semantics (a second publish with the same key inside the window is `Duplicate` even after the first run finished) are
wrong for "sync again now". The producer refuses when a live run already exists for the connection (§6 step 2) and the
Exclusive key serializes any race that slips past that check.

---

## 5. Target architecture

```
 client machine (EC2 / App Service)                                database
 ┌────────────────────────────────────────────────────┐            ┌──────────────────────────────────┐
 │  mjapi  (pm2, full heap ceiling)                   │            │ __mj.CompanyIntegrationRun        │
 │   GraphQL/REST ─ IntegrationStartSync ─┐           │  1 txn:    │   Status, ConfigData, OwnerToken, │
 │   scheduled jobs ─ IntegrationSync     ├ PublishSync┼──────────▶ │   ProgressJSON, counts            │
 │     ScheduledJobDriver ────────────────┘           │  run row + │ __mj.WorkQueueMessage / Delivery   │
 │   WorkQueueHost: subscriptions [], sweeper 60 s    │  message   │   topic integration.sync-requested │
 │   OnPublished ──┐  60 s backlog tick ──┐           │            │   sub   integration.sync           │
 │                 └──────┬───────────────┘           │            │   (Exclusive by CompanyIntegration)│
 ├────────────────────────▼───────────────────────────┤            └───────────────┬────────────────────┘
 │  pm2 start --only mj-worker                        │   claim ─ heartbeat 30 s ─ │ settle
 │  mj-worker (pm2, --max-old-space-size=W,           │ ◀──────────────────────────┘
 │   nice 10, oom_score_adj 1000, autorestart off)    │
 │   RunWorkQueueWorker() → WorkQueueHost.RunOnce     │
 │     ({ IdleExitMs: 600000 })                       │
 │   IntegrationSyncHandler ─▶ RunSyncOwned ──────────┼───────────▶ connector APIs (NetForum, Elevate, …)
 │   progress JSONL ─▶ shared disk (phase 1)          │
 └────────────────────────────────────────────────────┘
```

| Part | Lives in | Note |
|---|---|---|
| Topic `integration.sync-requested`, subscription `integration.sync` | `metadata/work-queue-topics/` (new folder, shipped with `mj sync`) | Database transport, `PartitionMode: Exclusive`, key = lower-case `CompanyIntegrationID`, `HostType: MJWorker`, `HandlerKey: Integration.Sync`, `LeaseSeconds: 300`, `MaxProcessingSeconds: 14400`, `MaxAttempts: 3`, backoff 60–600 s, `HeartbeatMode: Auto` |
| `IntegrationSyncHandler` | `packages/Integration/engine/src/handlers/` | `@RegisterClass(BaseWorkHandler, 'Integration.Sync')`; one delivery = one run attempt |
| `RunSyncOwned`, `ResumePointFromRunDetails` | `packages/Integration/engine/src/IntegrationEngine.ts` | Engine refactor; no sproc leases on this path |
| `PublishSync` producer | `packages/Integration/engine` | Run row + publish in one `RunInEntityTransaction`; used by the resolver, the scheduled driver and `EnqueueSync` |
| `integrationSync.executionMode` | `packages/MJServer/src/config.ts` | `'Inline' | 'WorkQueue'`, default `Inline` |
| `RunWorkQueueWorker()` | `packages/MJServer/src/worker/` exported from `@memberjunction/server` | Same bootstrap as MJAPI minus Express, Apollo and the schema build |
| MJAPI boot guards, publish-only host | `packages/MJServer/src/index.ts`, `WorkQueueHostService.ts` | Skip boot resume and the legacy poller in `WorkQueue` mode |
| `mj-worker` pm2 app, spawn tick, deploy variables | MJ Central chassis (platform repo) | Calls `RunWorkQueueWorker()`; §10 |

Nothing in MJ shells out to pm2. The spawn tick is chassis code because only the chassis knows the process manager.

---

## 6. Life of a sync

1. **Request.** `IntegrationStartSync` (GraphQL), `IntegrationSyncScheduledJobDriver` (scheduler) or the Explorer UI
   asks the engine for a sync. With `executionMode === 'Inline'` the call path is unchanged. With `WorkQueue` the
   caller invokes `PublishSync`.
2. **Refuse or publish, in one transaction.** `PublishSync` opens `RunInEntityTransaction(provider)`. Inside it:
   one query for a run on this connection with `Status IN ('Queued','In Progress')` whose message is not settled;
   if found, throw `SyncAlreadyQueuedError` (the UI shows "already running", same as today's `activeSyncs` answer).
   Otherwise insert `CompanyIntegrationRun` with `Status: 'Queued'` and `ConfigData` carrying `triggerType`,
   `options`, `webhookURL` and a client-generated `workMessageID`; then
   `WorkQueueEngine.Instance.PublishAs('integration.sync-requested', [request], { ContextUser, Provider })`, which
   enlists in the same transaction. A `Rejected` publish throws, which rolls the run row back. Commit. Return
   `{ RunID, MessageID }`.
3. **Wake.** `OnPublished('integration.sync-requested')` fires in MJAPI; the chassis listener runs
   `pm2 start ecosystem.config.cjs --only mj-worker`. If the worker is already online pm2 does nothing. The 60 s
   backlog tick (§7) covers the race with an idle exit and a dead worker.
4. **Claim.** The worker's `DatabaseTransportConsumer` claims the `Pending` delivery. The unique in-flight index on
   `(SubscriptionID, PartitionKey)` guarantees one run per connection across every process, including a second
   worker on a second machine in phase 2. The consumer also calls `ExpireLeases` for its own subscription on every
   receive, so a lease left by a dead worker is returned to `Pending` without the MJAPI sweeper.
5. **Run.** `IntegrationSyncHandler.Handle` loads the run, refuses or short-circuits the terminal states (§9 Task 3),
   flips it to `In Progress` with `OwnerToken = context.DeliveryID`, computes the resume point with
   `ResumePointFromRunDetails` over the run's `CompanyIntegrationRunDetail` rows, and calls `RunSyncOwned`. The
   engine's batch boundary check calls the handler's `BoundaryCheck` instead of `RunOwnershipService.CheckBoundary`.
   Progress is mirrored to `ProgressJSON` and to `context.Heartbeat({ Percent, Message })`; the runtime's Auto
   heartbeat renews the lease every `min(LeaseSeconds/3, 30)` s.
6. **Finish.** Mapped in §9 Task 3: result → run `Success` (or completed-with-errors), counts, webhook, scheduled-job
   notification, `Outcome.Complete()`. Transient error → run stays `In Progress` with its details,
   `Outcome.Retry(reason)`. Fatal (config, auth, inactive connection, missing connector) → run `Failed`,
   `FatalWorkError` → dead letter. `Signal.reason === 'Cancelled'` → run `Cancelled`, `Outcome.Complete()`.
   `LeaseLost` → stop writing, `Outcome.Retry`; the fenced settle is a no-op and the next owner resumes.
7. **Idle.** `RunOnce({ IdleExitMs: 600000 })` returns after ten minutes with nothing claimable; the process exits 0
   and pm2 `autorestart: false` leaves it stopped. The hourly `cron_restart` is a safety net for a worker that is
   alive but wedged, not the normal exit path.

---

## 7. Worker start and stop

| Event | Mechanism | Why |
|---|---|---|
| Message published | `WorkQueueEngine.Instance.OnPublished` listener in the chassis `app.ts` → `pm2 start ecosystem.config.cjs --only mj-worker` | Fast path; the worker is claiming inside a few seconds plus cold start |
| Idle-exit race, dead worker, MJAPI restart | 60 s tick: `GetBacklog('integration.sync')` returns `Claimable > 0` and `pm2 jlist` reports `mj-worker` not `online` → start | Level-triggered; removes the edge race the review described. `GetBacklog` answers `{ Supported, Claimable, InFlight, Total, Capped }` and is a single indexed count |
| Nothing claimable for 10 min | `RunOnce` returns; `Shutdown()`; `process.exit(0)` | Memory returns to MJAPI and the OS; zero idle cost |
| Worker killed mid-sync (OOM, SIGKILL, host reboot) | Lease expires after `LeaseSeconds` (300 s); the next worker's receive or the MJAPI sweeper returns the delivery to `Pending`; redelivery resumes from the completed entity maps | The run row keeps `In Progress`; nothing is lost but the current batch |
| Deploy / RSU restart | `RSU_RESTART_COMMAND="pm2 restart mjapi mj-worker"`; the worker gets SIGTERM, `Shutdown()` drains for `ShutdownDrainMs`, the handler sees `Signal.reason === 'Shutdown'` at its next boundary and returns `Outcome.Retry` | Same code and metadata on both processes after every deploy |
| Worker wedged (no exit, no heartbeat) | Lease expires; the runtime fences the stale owner; pm2 `cron_restart: '0 * * * *'` recycles the process | Belt and braces only |

Cold start on the worker is the engine `Config` (metadata plus field maps) and the bootstrap manifest: roughly
5–15 s on a small tenant and about a minute on a PLUS-size tenant. There is no GraphQL schema build (109 s on PLUS)
because the worker never serves HTTP.

---

## 8. Memory and CPU isolation

### Heap budgets

| Process | Ceiling | Source |
|---|---|---|
| `mjapi` | unchanged: `(RAM − 1,024) × 70 %` or `MJC_HEAP_MB` | Existing MJ Central deploy workflow |
| `mj-worker` | W, measured: peak live heap of a full sync on a copy of the largest tenant database, + 30 % | §12 open question 1; until measured the tier default stays `off` |
| pm2 `max_memory_restart` on the worker | W × 1.25 (RSS) | Restarts a worker whose RSS runs away before the OS OOM killer picks it |
| Host RAM required | `mjapi ceiling + W + 1 GB OS` | Tier gate in §10 |

Expected W on a PLUS-size tenant from the problem table: metadata ~400 MB + field maps ~300 MB + a run's working
set (80–130 MB retained plus the live batch) + V8 overhead, so an order of 1.5–2.5 GB. The measurement replaces this
estimate before any tier default is switched on.

### Priority

| Lever | Value | Effect |
|---|---|---|
| `oom_score_adj` | 1000 on the worker (written by the chassis after spawn; Linux only) | The kernel kills the worker before MJAPI when the box runs out of memory |
| `os.setPriority(10)` | set by `RunWorkQueueWorker` when `Nice` is passed | MJAPI wins CPU contention on 2–4 vCPU tiers |
| `LeaseSeconds: 300` with Auto heartbeat every 30 s | subscription metadata | Ten missed renewals before the lease lapses, so CPU starvation does not cost ownership |
| `Concurrency: 1` | chassis option | One run's working set at a time inside W; raise per tier later |

### What the worker does not do

Discovery, schema apply, RSU pipelines and metadata refresh stay in MJAPI in phase 1. They need MJAPI's disk, its
maintenance locks (`IntegrationEngine.maintenanceLocks`) and the process restart at the end of apply. A sync that is
published while a maintenance lock is held is refused by `RunSyncOwned` the same way `runWithOwnedContext` refuses
today; the handler returns `Outcome.Retry('maintenance in progress', 120)`.

### Over-ceiling sync

A sync that exceeds W is killed, retried after backoff, and dead-lettered on the third attempt with the run row marked
`Failed` by the last attempt (Task 3). Alert on `GetSubscriptionStats('integration.sync').DeadLettered` and on pm2
exit code 134. The fix is a larger W or a smaller connector batch size, never a larger MJAPI.

---

## 9. MJ changes

Tests first in every task: write the failing test, watch it fail, then implement. Sizes: S under a day, M one to three
days, L about a week. Line numbers are on `next` at ea207aec3a.

### Task 0 — Queue host fixes (#6273, #6274) — **done in PR #6369**

- `WorkQueueProviderSource.ReleaseProvider?` and `BoundWorkHandler.Handle` releasing in `finally`;
  `IndependentProviderSource` mints with `CreateIndependentInstance` and releases with `ReleaseIndependentInstance`.
- `mj queue work` mints per delivery; long-running mode defaults `SweeperIntervalMs: 60000`,
  `ReconcileIntervalMs: 30000` with `--sweeper-interval-ms` / `--reconcile-interval-ms`; `--once` keeps `0/0`.
- `mj queue sweep [--json]` over `WorkQueueHost.RunSweeperOnce()` for hosts where no MJAPI sweeps.
- `MJServerWorkQueueProviderSource.ReleaseProvider` releases what it minted, never the shared fallback.
- Engine README documents the publish-only MJAPI shape; the consumer guide states the per-delivery provider contract.
- Verified by hand against a local SQL Server database: four `Sweeper pass` lines at one-minute cadence under
  `mj queue work --subscription "*"`, and `mj queue sweep` printing the three counts.

### Task 1 — Topology metadata (S)

**Files:** `metadata/work-queue-topics/.mj-sync.json`, `metadata/work-queue-topics/topics/.integration.json`,
`metadata/work-queue-topics/subscriptions/.integration.json`. Same file shape as `metadata-optional/work-queue-samples`,
but shipped in the required metadata so every install has the topic.

```json
[
  {
    "fields": {
      "Name": "integration.sync-requested",
      "Description": "One message per requested integration sync run. Payload: { RunID, CompanyIntegrationID }.",
      "TransportID": "@lookup:MJ: Work Queue Transports.Name=Database",
      "IsFifo": false,
      "AllowExternalPublish": false,
      "MaxPayloadBytes": 4096,
      "DefaultDeduplicationTTLSeconds": 3600,
      "RetentionDays": 30,
      "Status": "Active"
    },
    "primaryKey": { "ID": "<new GUID>" }
  }
]
```

```json
[
  {
    "fields": {
      "Name": "integration.sync",
      "Description": "Runs one integration sync per delivery. Exclusive by CompanyIntegrationID: one run per connection at a time.",
      "TopicID": "@lookup:MJ: Work Queue Topics.Name=integration.sync-requested",
      "PartitionMode": "Exclusive",
      "MaxAttempts": 3,
      "BackoffBaseSeconds": 60,
      "BackoffMaxSeconds": 600,
      "LeaseSeconds": 300,
      "MaxProcessingSeconds": 14400,
      "HeartbeatMode": "Auto",
      "HostType": "MJWorker",
      "HandlerKey": "Integration.Sync",
      "Status": "Active"
    },
    "primaryKey": { "ID": "<new GUID>" }
  }
]
```

- `RetentionDays: 30` keeps settled deliveries for the run history view; the sweeper purges them.
- `MaxProcessingSeconds: 14400` (4 h) is the longest sync seen on PLUS with margin. The runtime aborts the handler
  with `Signal.reason === 'MaxProcessingSeconds'`; the run stays `In Progress` and the retry resumes.
- **Tests:** `ValidateTopology` reports no issue for the two records; `PlanHostedSubscriptions` yields the subscription
  as `Runnable` once `Integration.Sync` is registered and `NotRunnable` with the reason "no handler" when it is not.

### Task 2 — Engine refactor: `RunSyncOwned` and `ResumePointFromRunDetails` (L)

**File:** `packages/Integration/engine/src/IntegrationEngine.ts`.

Today the run path is `RunSync` (L1191) → `runWithOwnedContext` (L1316) → `executeSyncInternal` (L1403). The queue
path shares `executeSyncInternal` and its `existingRun` argument, and replaces the ownership pieces around it.

**2a. The resume point as a pure function.** Lines 1033–1049 of `resumeOneOrphanedRun` become:

```ts
/** Entity map IDs that already finished with IsSuccess=1 in this run; a parse miss falls open. */
export function ResumePointFromRunDetails(details: ReadonlyArray<{ RecordID: string | null; IsSuccess: boolean }>): Set<string> {
    const completed = new Set<string>();
    for (const d of details) {
        if (!d.IsSuccess) continue;
        const m = /^EntityMap:([0-9a-fA-F-]+)\|/.exec(d.RecordID ?? '');
        if (m) completed.add(m[1].toLowerCase());
    }
    return completed;
}
```

`resumeOneOrphanedRun` calls it; behaviour on the `Inline` path is unchanged.

**2b. A boundary callback beside the ownership service.** `EngineRunContext` gains `boundary?: BoundaryCheck`:

```ts
export interface BoundaryVerdict { Owned: boolean; CancelRequested: boolean }
export type BoundaryCheck = () => BoundaryVerdict | Promise<BoundaryVerdict>;
```

`assertOwnershipAtBoundary` (L703) becomes:

```ts
private async assertOwnershipAtBoundary(): Promise<void> {
    const ctx = this.currentRunContext;
    if (!ctx) return;
    const check = ctx.boundary ? await ctx.boundary() : ctx.ownership ? await ctx.ownership.CheckBoundary() : null;
    if (!check) return;
    if (!check.Owned) {
        ctx.ownershipLost = true;
        ctx.abortController.abort();
        throw new RunOwnershipLostError(ctx.runID, 'fence moved at batch boundary');
    }
    if (check.CancelRequested && !ctx.cancelRequested) {
        ctx.cancelRequested = true;
        ctx.abortController.abort();
    }
}
```

The lease renewal timer in `RunOwnershipService` also checks `CancelRequestedAt`; on the queue path that signal comes
through the delivery's cancel flag instead (Task 5), so no second poller is needed.

**2c. `RunSyncOwned`.**

```ts
export interface OwnedRunRequest {
    /** Loaded by the caller; Status 'In Progress', OwnerToken = the delivery ID. */
    Run: MJCompanyIntegrationRunEntity;
    TriggerType: SyncTriggerType;
    Options?: IntegrationSyncOptions;
    /** From ResumePointFromRunDetails; empty on a first attempt. */
    CompletedMapIDs: ReadonlySet<string>;
    BoundaryCheck: BoundaryCheck;
    OnProgress?: OnProgressCallback;
    OnNotification?: OnNotificationCallback;
    ContextUser: UserInfo;
    Provider: IMetadataProvider;
}

/** Executes a run whose ownership is held by the caller's lease. Never claims, renews or releases a run lease. */
public async RunSyncOwned(req: OwnedRunRequest): Promise<SyncResult>
```

Body, in order:

1. `RunInWarmedCatalogScope(ciID, ...)` as `RunSync` does.
2. The `activeSyncs` check stays as a same-process guard (a worker with `Concurrency > 1` could receive two
   different connections, never the same one; the guard costs nothing).
3. The `maintenanceLocks` refusal stays and returns the same failed `SyncResult`; the handler maps it to a retry.
4. Build `EngineRunContext` with `boundary: req.BoundaryCheck`, no `ownership`, and `provider: req.Provider`.
5. `wrappedProgress` ratchets the snapshot and writes `ProgressJSON` through a throttled `run.Save()` on the run's own
   provider (today `RunOwnershipService.WriteProgress` does this; the throttle moves to a small helper both paths use).
6. Call `executeSyncInternal(..., abortController.signal, req.Run)` with `config.entityMaps` filtered by
   `CompletedMapIDs` (today the filter happens in `resumeOneOrphanedRun` before `executeSyncInternal`; it moves into
   `loadRunConfiguration` behind a `skipMapIDs` argument so both paths use it).
7. `finalizeRun` and `invokePostSyncPromotionSafe` run as today. `result.SchemaUpdate` is also written to the run row
   as `ConfigData.schemaUpdate` so MJAPI can read it (open question 3).

`ExecuteQueuedRun` and `PollQueuedRuns` stay for one release for the legacy poller and are marked `@deprecated`.

- **Tests (all written first):**
  - `ResumePointFromRunDetails` skips `IsSuccess = 0` and parse misses, lower-cases IDs.
  - `RunSyncOwned` with a two-map fake connector and a `BoundaryCheck` that reports `Owned: false` after the first
    batch: the second batch is never written and `RunOwnershipLostError` propagates.
  - `BoundaryCheck` reporting `CancelRequested: true`: the run finalizes `Cancelled` and the connector's abort signal
    fired.
  - A run resumed with one completed map writes exactly one new `CompanyIntegrationRunDetail`.
  - The number of `BoundaryCheck` calls equals the number of batch boundaries the inline path checks for the same
    fixture (guards open question 2).

### Task 3 — `IntegrationSyncHandler` (M)

**File:** `packages/Integration/engine/src/handlers/IntegrationSyncHandler.ts`, exported from the package index so the
bootstrap manifest registers it.

```ts
export interface IntegrationSyncPayload extends WorkJson { RunID: string; CompanyIntegrationID: string }

@RegisterClass(BaseWorkHandler, 'Integration.Sync')
export class IntegrationSyncHandler extends BaseWorkHandler<IntegrationSyncPayload> {
    public async Handle(message: WorkMessage<IntegrationSyncPayload>, context: WorkContext): Promise<WorkOutcome> {
        const { RunID, CompanyIntegrationID } = RequirePayload(message.Payload); // FatalWorkError when a field is missing
        const run = await this.Provider.GetEntityObject<MJCompanyIntegrationRunEntity>('MJ: Company Integration Runs', this.ContextUser);
        if (!(await run.Load(RunID))) throw new FatalWorkError(`run ${RunID} not found`);
        if (run.CompanyIntegrationID.toLowerCase() !== CompanyIntegrationID.toLowerCase()) throw new FatalWorkError('payload/run mismatch');

        // Terminal rows: a replay or a duplicate delivery of a finished run is a no-op, never a re-run.
        if (run.Status === 'Success' || run.Status === 'Failed' || run.Status === 'Cancelled') return Outcome.Complete();
        if (run.CancelRequestedAt != null) { await FinalizeCancelled(run, 'cancelled before start'); return Outcome.Complete(); }

        run.Status = 'In Progress';
        run.Set('OwnerToken', context.DeliveryID);
        run.Set('LeaseExpiresAt', null); // the delivery lease owns this run; the stale sweep must ignore it
        if (!(await run.Save())) return Outcome.Retry('could not mark run In Progress', 30);

        const cfg = ParseRunConfig(run.ConfigData);
        const completed = ResumePointFromRunDetails(await LoadRunDetails(this.Provider, RunID, this.ContextUser));
        context.Log.Info(`run ${RunID} attempt ${context.Attempt}/${context.MaxAttempts}, ${completed.size} maps already done`);

        const boundaryCheck: BoundaryCheck = () => ({
            Owned: !context.Signal.aborted || context.Signal.reason === 'Cancelled',
            CancelRequested: context.Signal.reason === 'Cancelled',
        });

        try {
            const result = await IntegrationEngine.Instance.RunSyncOwned({
                Run: run, TriggerType: cfg.triggerType, Options: cfg.options, CompletedMapIDs: completed, BoundaryCheck: boundaryCheck,
                OnProgress: p => { void context.Heartbeat({ Percent: PercentOf(p), Message: p.CurrentEntity }); },
                OnNotification: n => NotifyScheduledJob(cfg, n),
                ContextUser: this.ContextUser, Provider: this.Provider,
            });
            await SendWebhook(cfg.webhookURL, result);
            await WriteScheduledJobRunDetails(cfg.options?.ScheduledJobRunID, result, this.Provider, this.ContextUser);
            return Outcome.Complete();
        } catch (err) {
            return this.outcomeFor(err, run, context);
        }
    }
}
```

`outcomeFor` is the whole policy, in one place:

| Condition | Run row | Outcome |
|---|---|---|
| `RunOwnershipLostError` and `Signal.reason === 'LeaseLost'` | untouched (another owner has it) | `Outcome.Retry('lease lost')`; the transport rejects the fenced settle |
| `RunOwnershipLostError` and reason `Shutdown` | stays `In Progress` | `Outcome.Retry('shutdown', 30)` |
| `RunOwnershipLostError` and reason `MaxProcessingSeconds` | stays `In Progress` | `Outcome.Retry('processing cap')`; the runtime applies its cap policy |
| Engine returned `Cancelled` (boundary reported cancel) | `Cancelled` by `finalizeRun` | `Outcome.Complete()`; the delivery was already marked cancel-requested by the operator |
| `IntegrationConfigError`, inactive connection, unknown connector, auth refused | `Failed`, `ErrorLog` set | `throw new FatalWorkError(message)` → dead letter |
| Maintenance-lock refusal (`Success: false`, no work) | back to `Queued` | `Outcome.Retry('maintenance', 120)` |
| Any other error (connector 5xx, timeout, deadlock) and `Attempt < MaxAttempts` | stays `In Progress`, details kept | `Outcome.Retry(message)` |
| Any other error and `Attempt === MaxAttempts` | `Failed`, `ErrorLog` = message, webhook and notification sent | `Outcome.Retry(message)` → the runtime dead-letters |

The handler never calls `CancelSync`, `Claim`, `Renew` or `Release`. It owns the run only while the runtime holds the
delivery.

- **Tests (first, through `ConsumerRuntime` with an in-memory transport and a scripted fake connector):**
  - Happy path: run `Success`, counts on the row, webhook called once, `Complete`.
  - Abort with `LeaseLost` after map 1: no further `CompanyIntegrationRunDetail` rows; outcome `Retry`; a second
    delivery for the same run writes only map 2.
  - Abort with `Cancelled`: row `Cancelled`, outcome `Complete`, the partition key is free.
  - Fatal config error: row `Failed`, `FatalWorkError` thrown.
  - Transient error on the last attempt: row `Failed`, webhook `sync_failed` sent.
  - Replay of a `Success` run: `Complete` with no connector call.

### Task 4 — Producers behind the flag (M)

**4a. Config.** `packages/MJServer/src/config.ts`, next to `integrationSyncWorkerSchema` (L185):

```ts
const integrationSyncSchema = z.object({
  /** Inline runs syncs in this process; WorkQueue publishes them to integration.sync-requested. */
  executionMode: z.enum(['Inline', 'WorkQueue']).optional().default('Inline'),
  /** User the worker executes syncs as. */
  workerUserEmail: z.string().optional().default('system@memberjunction.org'),
});
```

Key `integrationSync` on `configInfoSchema`; `integrationSyncWorker` stays for the legacy poller and is refused
(`enabled: true` with `executionMode: 'WorkQueue'` fails config validation with a clear message).

**4b. `PublishSync` in the engine.**

```ts
export interface PublishSyncRequest {
    CompanyIntegrationID: string;
    TriggerType: SyncTriggerType;
    Options?: IntegrationSyncOptions;
    WebhookURL?: string;
}
export interface PublishSyncResult { RunID: string; MessageID: string }

public async PublishSync(req: PublishSyncRequest, contextUser: UserInfo, provider?: IMetadataProvider): Promise<PublishSyncResult> {
    const p = provider ?? Metadata.Provider;
    return RunInEntityTransaction(p, async () => {
        if (await this.hasLiveRun(req.CompanyIntegrationID, contextUser, p)) throw new SyncAlreadyQueuedError(req.CompanyIntegrationID);
        const messageID = randomUUID();
        const run = await p.GetEntityObject<MJCompanyIntegrationRunEntity>('MJ: Company Integration Runs', contextUser);
        run.NewRecord();
        run.CompanyIntegrationID = req.CompanyIntegrationID;
        run.RunByUserID = contextUser.ID;
        run.StartedAt = new Date();
        run.Status = 'Queued';
        run.TotalRecords = 0;
        run.ConfigData = JSON.stringify({ triggerType: req.TriggerType, options: req.Options ?? null, webhookURL: req.WebhookURL ?? null, workMessageID: messageID });
        if (req.Options?.ScheduledJobRunID) run.Set('ScheduledJobRunID', req.Options.ScheduledJobRunID);
        if (!(await run.Save())) throw new Error(`Failed to create sync run: ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);

        const [res] = await WorkQueueEngine.Instance.PublishAs<IntegrationSyncPayload>('integration.sync-requested', [{
            MessageID: messageID,
            PartitionKey: req.CompanyIntegrationID.toLowerCase(),
            CorrelationID: run.ID,
            Payload: { RunID: run.ID, CompanyIntegrationID: req.CompanyIntegrationID },
        }], { ContextUser: contextUser, Provider: p });
        if (res.Status !== 'Accepted') throw new Error(`Publish ${res.Status}: ${res.Error?.Message ?? 'no detail'}`); // rolls the run row back
        return { RunID: run.ID, MessageID: messageID };
    });
}
```

`hasLiveRun` is one query: a run for the connection with `Status IN ('Queued','In Progress')` and, when `Queued`, a
delivery for `ConfigData.workMessageID` that is still `Pending` or `InFlight`. A `Queued` row whose delivery was
dead-lettered or discarded does not block a new request.

**4c. `IntegrationStartSync`** (`IntegrationDiscoveryResolver.ts` L4931). In `WorkQueue` mode: the `IsActive` and
maintenance-lock checks stay; then `PublishSync({ CompanyIntegrationID, TriggerType: 'Manual', Options, WebhookURL:
webhookURL })` and return `{ Success: true, RunID }` at once. The fire-and-forget promise, the `.then` webhook and the
recency lookup are only on the `Inline` branch. `SyncAlreadyQueuedError` maps to `{ Success: false, Message: 'A sync
is already queued or running for this connection' }`.

**4d. `IntegrationSyncScheduledJobDriver`** (`packages/Scheduling/engine/src/drivers/`). In `WorkQueue` mode the
driver calls `PublishSync` with `TriggerType: 'Scheduled'` and `Options.ScheduledJobRunID` and returns
`{ Success: true, Details: { Dispatched: true, CompanyIntegrationRunID } }` in milliseconds. The completion
notification and the final counts move to the handler (`WriteScheduledJobRunDetails` merges them into the same
`ScheduledJobRun.Details` row; open question 4).

**4e. `EnqueueSync`** (L1221) in `WorkQueue` mode delegates to `PublishSync` and returns the `RunID`, so callers of the
legacy API get queue semantics without a code change.

- **Tests (first):**
  - `PublishSync` against a fake provider with `SupportsEntityTransactions: true`: a `Rejected` publish leaves no run
    row; an `Accepted` publish commits both.
  - `hasLiveRun` blocks on `In Progress`, blocks on `Queued` with a `Pending` delivery, does not block on `Queued`
    with a `Discarded` delivery.
  - Resolver returns the published `RunID` without awaiting any sync.
  - Driver returns `Dispatched: true` within the test's timeout with the run ID.
  - Config validation rejects `integrationSyncWorker.enabled: true` with `executionMode: 'WorkQueue'`.

### Task 5 — Cancel through the queue (S)

**File:** `IntegrationEngine.CancelSyncAsync` (L830) and a new `CancelQueuedSync`.

Today `CancelSyncAsync` stamps `CancelRequestedAt` on every live run for the connection. In `WorkQueue` mode it also
discards the delivery so the Exclusive key is released:

```ts
public static async CancelQueuedSync(companyIntegrationID: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<boolean> {
    const stamped = await IntegrationEngine.CancelSyncAsync(companyIntegrationID, contextUser, provider); // unchanged
    const live = await FindLiveRun(companyIntegrationID, contextUser, provider);                           // Queued or In Progress
    if (!live) return stamped;
    const messageID = ParseRunConfig(live.ConfigData).workMessageID;
    const subscription = await WorkQueueEngine.Instance.GetSubscription('integration.sync');
    const operator = await WorkQueueEngine.Instance.GetOperator(subscription);
    const delivery = await operator.FindDelivery(BindingFor(subscription), { MessageID: messageID });
    if (!delivery) return stamped;
    const result = await operator.Discard(BindingFor(subscription), delivery.DeliveryID, 'cancelled by user', contextUser.ID);
    if (delivery.Status === 'Pending' && result.Success) await FinalizeCancelled(live, 'cancelled before start'); // no handler will run it
    return stamped || result.Success;
}
```

`ITransportOperator.Discard` already distinguishes `Pending` (→ `Discarded` now, requires `CancelPending`) from
`InFlight` (→ `CancelRequestedAt` on the delivery, `CancelRequested: true`); the runtime then aborts the handler's
`Signal` with `'Cancelled'` at its next heartbeat and the handler finalizes the run. The operator surface has
`ListDeliveries` with filters; if a lookup by `MessageID` is missing, Task 5 adds `FindDelivery` to
`ITransportOperator` and the database operator.

- **Tests (first):** pending cancel → delivery `Discarded`, run `Cancelled`, a new `PublishSync` for the same
  connection is `Accepted`; in-flight cancel → delivery `CancelRequested`, run untouched until the handler finalizes.

### Task 6 — MJAPI side (S)

**File:** `packages/MJServer/src/index.ts`.

- L1726: the `IntegrationSyncWorkerService` block is skipped when `configInfo.integrationSync.executionMode ===
  'WorkQueue'` (config validation already refuses the combination; this is the belt).
- L1778: `ResumeOrphanedSyncs` is skipped in `WorkQueue` mode with one log line. In that mode an `In Progress` run
  whose delivery is `Pending` after a lease expiry is resumed by the next worker delivery, not by MJAPI.
- L1850: unchanged. A publish-only MJAPI is `workQueue: { enabled: true, subscriptions: [], sweeperEnabled: true }`;
  `StartWorkQueueHost` with an empty subscription list still starts the host and arms the sweeper (verified in Task 0).
- `IntegrationGetSyncProgress` / `IntegrationTailRunEvents` keep reading `ProgressJSON` and the JSONL file; both work in
  phase 1 because the worker shares the disk and the row.
- **Test (first):** a config fixture with `executionMode: 'WorkQueue'` boots the server module with the resume and
  poller spies never called.

### Task 7 — `RunWorkQueueWorker()` in `@memberjunction/server` (M)

**File:** `packages/MJServer/src/worker/RunWorkQueueWorker.ts`, exported from the package index.

```ts
export interface RunWorkQueueWorkerOptions {
    Subscriptions: Array<{ Name: string; Concurrency: number }>;
    /** Exit after this long with nothing claimable; omit to run until SIGTERM. */
    IdleExitMs?: number;
    /** Hard cap on the process lifetime; the lease covers whatever is in flight. */
    MaxDurationMs?: number;
    /** os.setPriority value; omit to leave the default. */
    Nice?: number;
    InstanceID?: string;
    ShutdownDrainMs?: number;
}

/** Boots the server runtime without HTTP and runs the work queue host until idle or stopped. Returns the exit code. */
export async function RunWorkQueueWorker(opts: RunWorkQueueWorkerOptions): Promise<number>
```

Body, in order:

1. Load `configInfo`; refuse to start when `workQueue.enabled` is false or the database settings are missing.
2. Open the SQL pool and `Metadata.Provider` exactly as `index.ts` does for the API, but skip Express, Apollo, the
   schema build, scheduled jobs, the legacy poller, boot resume and the auto-upgrade sweep.
3. Load the same bootstrap manifest `index.ts` loads so every `@RegisterClass` handler and connector is present;
   `IntegrationEngineBase.Config` runs lazily on the first delivery (task mode pre-warm stays off).
4. Register `RegisterIntegrationCustomColumnPromoter` and
   `CacheInvalidationBroadcastManager.Instance.Configure(configInfo.cacheSettings?.broadcast)` so promotion and
   invalidation behave as they do in MJAPI.
5. Resolve `contextUser` from `integrationSync.workerUserEmail`.
6. `if (opts.Nice !== undefined) os.setPriority(process.pid, opts.Nice)`.
7. Build `new WorkQueueHost({ InstanceID, Subscriptions, SweeperIntervalMs: 0, ReconcileIntervalMs: 30000,
   ShutdownDrainMs }, WorkQueueEngine.Instance, contextUser, provider, logger, { ProviderSource: new
   IndependentProviderSource(provider) })`.
8. SIGTERM / SIGINT → `host.Shutdown()`; `RunOnce({ IdleExitMs, MaxDurationMs })` when `IdleExitMs` or
   `MaxDurationMs` is set, else `Start()` and wait on the signal.
9. `Shutdown()`, close the pool, return 0 (1 when the host reported an error).

`oom_score_adj` is not set here: writing `/proc/self/oom_score_adj` to a positive value is allowed without privileges
on Linux, but the chassis owns process policy, so the chassis writes it after spawn (§10).

- **Tests (first):** the module never imports `express`, `@apollo/server` or `type-graphql` (static import graph
  check); the promoter and broadcast registrations happen before `WorkQueueHost.RunOnce` is called (spy order);
  `Nice` calls `os.setPriority` once.

### Task 8 — Docs (S)

- `guides/WORK_QUEUE_CONSUMER_GUIDE.md`: the Option B pattern ("a long domain run owned by the delivery") as a worked
  example with the outcome table from Task 3.
- `packages/WorkQueue/engine/README.md`: the co-located on-demand worker shape, cold-start cost, the backlog tick and
  the publish-only MJAPI config.
- `packages/Integration/engine/README.md`: `executionMode`, what moves to the worker and what stays in MJAPI.

---

## 10. MJ Central changes (platform repo, for reference)

### Chassis

| Item | Change |
|---|---|
| `apps/MJAPI/src/queue-worker.ts` | New entry: `RunWorkQueueWorker({ Subscriptions: [{ Name: 'integration.sync', Concurrency: 1 }], IdleExitMs: 600000, Nice: 10, InstanceID: 'mj-worker-' + process.pid }).then(code => process.exit(code))` |
| `ecosystem.config.cjs` | Two apps. `mjapi`: as today. `mj-worker`: `script: 'dist/queue-worker.js'`, `autorestart: false`, `node_args: '--max-old-space-size=' + W`, `max_memory_restart: W * 1.25 + 'M'`, `cron_restart: '0 * * * *'`, `kill_timeout: 60000` |
| `app.ts` | When `INTEGRATION_WORKER=on`: `WorkQueueEngine.Instance.OnPublished(topic => topic === 'integration.sync-requested' && startWorker())` and a 60 s `setInterval` that calls `startWorker()` when `GetBacklog('integration.sync').Claimable > 0` and `pm2 jlist` shows `mj-worker` not `online`. `startWorker` runs `pm2 start ecosystem.config.cjs --only mj-worker` and then writes `1000` to `/proc/<pid>/oom_score_adj` on Linux |
| `mj.config.cjs` | `workQueue: { enabled: true, subscriptions: [], sweeperEnabled: true }`; `integrationSync: { executionMode: process.env.INTEGRATION_WORKER === 'on' ? 'WorkQueue' : 'Inline' }` |

### Deploy workflow (`_mjc_deploy-api.yml`)

| Step | Today | Change |
|---|---|---|
| Start command | `pm2 start dist/index.js --name mjapi` | `pm2 start ecosystem.config.cjs` (both apps declared; `mj-worker` stays stopped until spawned) |
| Heap ceiling | `(RAM − 1,024) × 70 %` or `MJC_HEAP_MB` for `mjapi` | unchanged for `mjapi`; `MJC_WORKER_HEAP_MB` (W) added, from the tier |
| RSU restart | `RSU_RESTART_COMMAND="pm2 restart mjapi"` | `"pm2 restart mjapi mj-worker"` |
| Variables | — | `INTEGRATION_WORKER_<ENV>` from the Terraform tier; `INTEGRATION_WORKER` and `MJC_WORKER_HEAP_MB` in the pm2 env |
| Azure App Service | same zip deploy | identical; pm2 runs inside the App Service container today |

### Tier defaults

| Tier | RAM | `INTEGRATION_WORKER` | W |
|---|---|---|---|
| t4g.medium / B1 | 4 GB | off (MJAPI alone fills it; syncs stay `Inline`) | — |
| t4g.large / B2 | 8 GB | on after W is measured | measured, expected ≤ 2 GB |
| t4g.xlarge and up | 16 GB+ | on | measured |

Per-tenant override through the existing environment-variable path. A tenant is only switched on when
`mjapi ceiling + W + 1 GB` fits the instance.

---

## 11. Failure cases

| Case | What happens | Recovery |
|---|---|---|
| Worker OOM mid-sync | Process dies with exit 134; lease expires after 300 s; redelivery resumes from the completed maps | Automatic; dead letter after 3 attempts with the run `Failed` |
| Worker exits in the idle race | Message stays `Pending`; `OnPublished` already fired | Backlog tick starts the worker within 60 s |
| MJAPI restarts during a sync | Worker keeps running; its lease and the row are untouched; boot resume is skipped | None |
| Both processes restart (deploy) | Worker drains, returns `Retry('shutdown')`; after restart the backlog tick finds `Claimable > 0` | Automatic, within 60 s of MJAPI being up |
| Two syncs requested for one connection | Second `PublishSync` throws `SyncAlreadyQueuedError`; if two publishes race past the check the Exclusive key runs them one after the other | None |
| Run row inserted, publish rejected | `RunInEntityTransaction` rolls back; no orphan `Queued` row | None |
| Cancel while pending | Delivery `Discarded`, run `Cancelled`, key free at once | None |
| Cancel while running | Operator marks the delivery cancel-requested; the runtime aborts `Signal` with `'Cancelled'` at the next heartbeat; the handler finalizes `Cancelled` | None |
| Connector auth failure | `FatalWorkError` → dead letter; run `Failed`; webhook and notification sent | Operator fixes credentials and uses `mj queue replay` or starts a new sync |
| Sync longer than `MaxProcessingSeconds` | Runtime aborts with that reason; run stays `In Progress`; the retry resumes | Raise the cap for that tenant or split the entity maps |
| Database unreachable | Claim fails; the consumer backs off; the worker's `RunOnce` exits on `IdleExitMs`; MJAPI reports as today | Automatic once the database returns |
| Sweeper never runs (no MJAPI, no worker) | Retention and dedup rows grow | `mj queue sweep` from cron |
| Maintenance lock held when the delivery arrives | `RunSyncOwned` refuses; handler returns `Retry(120)`; run back to `Queued` | Automatic after the lock clears |

---

## 12. Risks and open questions

1. **Worker heap W is unmeasured.** Decide after a full run on a copy of the largest tenant database with
   `--heapsnapshot-near-heap-limit` off and `process.memoryUsage()` sampled per entity map. Until then every tier
   default is off.
2. **Boundary callback coverage.** `RunSyncOwned` must call `BoundaryCheck` at every point `CheckBoundary` is called
   today (one site, L706, reached from the batch loop). The Task 2 test counts calls against the inline fixture so a
   future batch path cannot bypass it.
3. **`SchemaUpdatePending` out of process.** The promoter creates `EntityField` rows from the worker; MJAPI must
   refresh. Options: the existing metadata refresh cadence, or `CacheInvalidationBroadcastManager` when configured.
   **Decide in Task 7** after checking what the promoter already broadcasts.
4. **Scheduled-job `Details` contract.** Readers of `ScheduledJobRun.Details` that expect counts see
   `Dispatched: true` until the handler merges the final numbers into the same row. **Decide in Task 4:** merge into the
   same row (preferred, one row per fire) or add a completion row.
5. **`hasLiveRun` and stale `Queued` rows.** A `Queued` row whose delivery was discarded by an operator outside
   `CancelQueuedSync` must not block new requests; the check reads delivery status, not run status alone. Covered by
   a Task 4 test; worth a `mj queue` operator note.
6. **`Concurrency > 1` on the worker.** Safe for correctness after #6273, but two connections' working sets share W.
   Keep `1` until W is measured with two runs.
7. **Discovery and apply stay in MJAPI** in phase 1. Moving discovery needs the worker to share the metadata directory
   and the restart signal; a later task.
8. **Progress tail in phase 2** needs a database-backed stream for `IntegrationTailRunEvents`. Phase 2 does not start
   until it exists; phase 1 is unaffected because the worker writes the same JSONL path.
9. **Windows hosts.** `oom_score_adj` and `os.setPriority(10)` are Linux semantics; on Windows the chassis skips the
   first and the second maps to below-normal priority. No MJ Central tier runs Windows today.
10. **09e scope not taken here:** `integration.batch-ready` (pushed batches on an `Ordered` subscription), the
    vendor-completed split-message pattern and the `IntegrationExecutionGuard`. They stay on the 09e roadmap; nothing
    here blocks them, and the topology from Task 1 is the one they extend.

---

## 13. Order of work and rollout

Order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Tasks 1, 6 and 8 can run alongside 2. Task 3 depends on 2; Task 4 depends
on 1 and 3; Task 5 depends on 4; Task 7 depends on 3.

1. Merge Task 0 (PR #6369) to `next`.
2. Tasks 1–8 on `next` behind `executionMode: 'Inline'`; the integration tier runs green under both values.
3. Measure W on a copy of the largest tenant database (§12 item 1).
4. MJ Central chassis changes to stage; one staff-run tenant with `INTEGRATION_WORKER=on`, nightly syncs watched for a
   week: dead-letter count, worker exit codes, MJAPI heap during the sync window.
5. Tier defaults on for 8 GB and up; `Inline` stays available as the rollback switch for one release; the legacy
   poller (`integrationSyncWorker`) is removed the release after.
6. Phase 2 after the progress-tail gate: the same handler in a container job, `mj-worker` replaced by the scaler.

---

## 14. Sources

- Review: https://github.com/MemberJunction/MJ/pull/4709#issuecomment-6507854693
- Issues: #6273, #6274, #6275, #4824, #5510, #5673
- Spec: `plans/work-queue-1/09-follow-on/09e-integration-runs-revamp.md` on `spec/work-queue`
- PLUS measurements: memory investigation (2026-10-26) and stalls diagnosis (2026-10-29 to 11-02), summarized in §2
- Code on `next` at ea207aec3a:
  - `packages/WorkQueue/core/src/handler.ts` (`WorkContext`, `Outcome`, `WorkAbortReason`), `publishing.ts`
    (`PublishRequest`, `PublishResult`), `operator.ts` (`ITransportOperator.Discard`)
  - `packages/WorkQueue/engine/src/WorkQueueEngine.ts` (`PublishAs` L166, `OnPublished` L181, `GetBacklog` L189,
    `GetOperator` L134), `host/WorkQueueHost.ts`, `transports/database/DatabaseTransportConsumer.ts` (lease expiry on
    receive, L176), `handlers/BoundWorkHandler.ts`
  - `packages/MJServer/src/services/WorkQueueHostService.ts`, `src/config.ts` (`integrationSyncWorkerSchema` L185),
    `src/index.ts` (poller L1726, resume L1778, host L1850), `src/resolvers/IntegrationDiscoveryResolver.ts`
    (`IntegrationStartSync` L4931)
  - `packages/Integration/engine/src/IntegrationEngine.ts` (`assertOwnershipAtBoundary` L703, `CancelSyncAsync`
    L830, `ResumeOrphanedSyncs` L919, `resumeOneOrphanedRun` L988, `RunSync` L1191, `EnqueueSync` L1221,
    `ExecuteQueuedRun` L1253, `runWithOwnedContext` L1316, `executeSyncInternal` L1403), `RunOwnershipService.ts`,
    `types.ts` (`IntegrationSyncOptions`)
  - `packages/Scheduling/engine/src/drivers/IntegrationSyncScheduledJobDriver.ts`
  - `packages/MJCore/src/generic/entityTransactionScope.ts` (`RunInEntityTransaction` L130)
  - `metadata-optional/work-queue-samples/` (topology file shape)

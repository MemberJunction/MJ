# ISSUE-6275 — Integration syncs on the work queue: the co-located worker plan

**Goal:** run integration syncs outside the MJAPI process so a heavy connector cannot stall the request loop or
push MJAPI past its heap ceiling, without a second MJAPI and without a container platform in every client
environment. The first host is a second Node process on the same machine (`mj-worker` under pm2). The second host is
a container job (ECS Fargate / Azure Container Apps) running the same handler.

**Decision:** adopt `09e-integration-runs-revamp.md` **Option B** (the delivery lease *is* execution ownership), not
Option A (queue triggers `ExecuteQueuedRun`). The architectural review on #4709 and the 09e options table both reject
Option A as the double-lease bug class the queue exists to remove. This plan replaces the earlier draft that kept
`ExecuteQueuedRun` and the run-row lease.

**Status:** #6273 and #6274 are fixed in this PR (Task 0). Everything from Task 1 on is planned, not started.

**Resolves:** #6275 (decision issue). Related: #4824, #5510, #5673, #6273, #6274, review comment on #4709.

---

## 1. What the review changed

| # | Review point (rkihm-BC, #4709 comment / #6275) | Decision | Where |
|---|---|---|---|
| 1 | `ExecuteQueuedRun` refuses retries (`Status !== 'Queued'`), restarts from entity map 0, and its 10-minute run lease races the delivery lease | **Option B.** New `RunSyncOwned`; boundary check reads `context.Signal`; resume-point filter extracted from `ResumeOrphanedSyncs` and run on every attempt; claim/renew/release sprocs not called on the queue path | Task 2, 3 |
| 2 | Cancel only stamps `CancelRequestedAt`; the delivery stays on the Exclusive key | `CancelSync` calls `WorkQueue.DiscardDelivery` (pending and in flight). The handler never calls the cancel API; it marks its own run row `Cancelled` when `Signal.reason === 'Cancelled'` | Task 5 |
| 3 | Worker-run sweeper: when the worker is dead nothing purges retention or the dedup ledger (#6274) | MJAPI keeps the host with `subscriptions: []`, `sweeperEnabled: true`. Worker runs `SweeperIntervalMs: 0`. `mj queue sweep` exists for hosts with no MJAPI | Task 0, 6 |
| 4 | Spawn-on-publish races the idle exit | Level-triggered: MJAPI checks `GetBacklog('integration.sync')` every 60 s and starts the worker when `Claimable > 0` and the process is not online. `OnPublished` stays as the fast path | Task 6, §4 |
| 5 | `SharedProviderSource` + `concurrency > 1` interleaves transactions (#6273) | Provider minted per delivery everywhere (`IndependentProviderSource`), released in `finally`. Phase 1 runs `Concurrency: 1` for the memory budget, not for safety | Task 0 |
| 6 | MJAPI boot `ResumeOrphanedSyncs` would adopt a worker's run in-process | Skipped when `integrationSync.executionMode === 'WorkQueue'` (also the #4824 symptom) | Task 6 |
| 7 | `webhookURL` fires from the in-process promise | Stored in `CompanyIntegrationRun.ConfigData`; the handler fires it on completion and failure | Task 4 |
| 8 | Scheduled driver awaits inline and writes counts + notification | Driver publishes and returns `Details: { Dispatched: true, CompanyIntegrationRunID }`. The handler writes final counts back and sends the notification when `ScheduledJobRunID` is set | Task 4 |
| 9 | Custom-column promotion and cache-invalidation broadcast are registered only in MJAPI | The worker entry registers both (`RegisterIntegrationCustomColumnPromoter`, `CacheInvalidationBroadcastManager.Configure`). `SchemaUpdatePending` is written to the run row; MJAPI reads it on its metadata refresh (open question 3) | Task 7 |
| 10 | Smaller worker heap: a sync over the ceiling OOMs three times and dead-letters even with MJAPI idle | Ceiling comes from a measured run on a copy of the largest tenant database, never an estimate. MJAPI keeps its full ceiling | §5 |
| 11 | Progress JSONL files are local | Fine for phase 1 (same disk). A database-backed stream for `IntegrationTailRunEvents` is a **gate for phase 2** | §10 |

Points the review confirmed and the plan keeps: run row and publish in one transaction (claim check); `Exclusive`
partition by `CompanyIntegrationID`; the same handler and topology from pm2 to container jobs; pre-creating the run row
lets `IntegrationStartSync` return the real `RunID` and drop the 22-second polling loop in
`IntegrationDiscoveryResolver`.

---

## 2. Target architecture

```
 client machine (EC2 / App Service)                       database
 ┌───────────────────────────────────────────────┐        ┌──────────────────────────────┐
 │  mjapi (pm2, full heap ceiling)                │        │ CompanyIntegrationRun        │
 │   GraphQL/REST ── IntegrationStartSync         │ 1 txn  │   Status, ConfigData,        │
 │   scheduled jobs ── IntegrationSyncDriver   ───┼──────▶ │   ProgressJSON, counts       │
 │   WorkQueue host: subscriptions [], sweeper    │        │ WorkQueueMessage/Delivery    │
 │   OnPublished + 60 s backlog tick ─┐           │        │   integration.sync (Exclusive│
 │                                    │ pm2 start │        │   by CompanyIntegrationID)   │
 ├────────────────────────────────────▼───────────┤        └──────────────┬───────────────┘
 │  mj-worker (pm2, own ceiling, nice 10,         │   claim / heartbeat / │ settle
 │   oom_score_adj 1000, idle exit 10 min)        │ ◀─────────────────────┘
 │   WorkQueueHost.RunOnce({ IdleExitMs })        │
 │   IntegrationSyncHandler → RunSyncOwned        │ ───▶ connector APIs
 └───────────────────────────────────────────────┘
```

| Part | Lives in | Note |
|---|---|---|
| Topic `integration.sync-requested`, subscription `integration.sync` | `metadata/work-queue-topics/` | Database transport, `PartitionMode: Exclusive`, key = lower-case `CompanyIntegrationID`, `HostType: MJWorker`, `HandlerKey: Integration.Sync`, `LeaseSeconds: 300`, `MaxProcessingSeconds: 14400`, `MaxAttempts: 3`, backoff 60–600 s, `HeartbeatMode: Auto` |
| `IntegrationSyncHandler` | `packages/Integration/engine` (new `handlers/`) | Registered with `@RegisterClass(BaseWorkHandler, 'Integration.Sync')` |
| `RunSyncOwned`, `ResumePointFromRunDetails` | `packages/Integration/engine` | Engine refactor; no sproc leases |
| Producers behind `integrationSync.executionMode` | `MJServer` resolver, `IntegrationEngine.EnqueueSync`, `Scheduling/engine` driver | Default `Inline` for one release |
| `RunWorkQueueWorker()` | `@memberjunction/server` | Boots the full server-bootstrap manifest without HTTP, registers the promoter and broadcast, runs the host |
| MJAPI side | `MJServer/src/index.ts`, `WorkQueueHostService` | Boot guard, empty-subscription host with sweeper |
| `mj-worker` process, ecosystem config, spawn tick | MJ Central chassis (platform repo) | Calls `RunWorkQueueWorker()`; see §7 |

---

## 3. Life of a sync

1. **Request.** `IntegrationStartSync`, the scheduled driver, or the UI calls the engine with `executionMode === 'WorkQueue'`.
2. **One transaction.** Inside `RunInEntityTransaction`: insert `CompanyIntegrationRun` (`Status: 'Queued'`, `ConfigData` = options + `WebhookURL` + `ScheduledJobRunID` + `WorkMessageID`), then `WorkQueueEngine.Instance.PublishAs('integration.sync-requested', [{ PartitionKey, DeduplicationKey: ciID, Payload: { RunID, CompanyIntegrationID } }])`. Commit. Return `RunID`.
3. **Wake.** `OnPublished` fires in MJAPI; the chassis runs `pm2 start ecosystem.config.cjs --only mj-worker`. If the worker was already online nothing happens. The 60 s backlog tick covers the race with an idle exit.
4. **Claim.** The worker's consumer takes the `Pending` row; the unique in-flight index on `(SubscriptionID, PartitionKey)` guarantees one run per connection across every process.
5. **Run.** `IntegrationSyncHandler.Handle` loads the run, flips it to `In Progress` with `OwnerToken = DeliveryID`, computes the resume point from `CompanyIntegrationRunDetail` rows with `IsSuccess = 1`, and calls `RunSyncOwned(run, options, boundaryCheck, onProgress)`. `boundaryCheck` throws `RunOwnershipLostError` when `context.Signal.aborted`. `onProgress` mirrors into `ProgressJSON`. Auto heartbeat renews the lease every 30 s.
6. **Finish.** Success → run `Success`, counts written, webhook fired, scheduled-job notification sent, `Outcome.Complete()`. Transient connector error → run stays `In Progress` with its details, `Outcome.Retry(backoff)`. Config/auth error → run `Failed`, `FatalWorkError` → dead letter. `Signal.reason === 'Cancelled'` → run `Cancelled`, return; the runtime acknowledges and discards. `LeaseLost` → stop writing, return; the next owner resumes from the details.
7. **Idle.** `RunOnce` returns after 10 minutes with nothing claimable; pm2 `autorestart: false` lets the process exit. The hourly `cron_restart` is a safety net only.

---

## 4. Worker start and stop

| Event | Mechanism | Why |
|---|---|---|
| Message published | `WorkQueueEngine.Instance.OnPublished` listener in the chassis `app.ts` → `pm2 start --only mj-worker` | Fast path, under 1 s to spawn |
| Idle-exit race, dead worker, MJAPI restart | 60 s tick: `GetBacklog('integration.sync').Claimable > 0` and pm2 reports `mj-worker` not `online` → start | Level-triggered; removes the edge race the review described |
| Nothing claimable for 10 min | `RunOnce({ IdleExitMs: 600000 })` returns; process exits 0 | Memory returns to MJAPI and the OS |
| Worker killed mid-sync | Lease expires after `LeaseSeconds`; consumer `ExpireLeases` on the next receive or the MJAPI sweeper returns the row to `Pending`; redelivery resumes from the completed entity maps | Verified: `DatabaseTransportConsumer` expires its own subscription's leases on every receive |
| Deploy / RSU restart | `RSU_RESTART_COMMAND="pm2 restart mjapi mj-worker"`; worker drains for `ShutdownDrainMs` then the lease covers the rest | Same code and metadata on both processes |

Cold start: roughly 5–15 s on a small tenant (review estimate); about a minute on the largest tenant because of metadata
size. Acceptable for syncs that run minutes to hours.

---

## 5. Memory and CPU isolation

- **MJAPI keeps its full heap ceiling.** The worker gets its own `--max-old-space-size` (W), measured on a copy of the
  largest tenant database, plus pm2 `max_memory_restart: W + 25 %`. Host RAM must hold `MJAPI ceiling + W + 1 GB OS`.
- **Worker yields first.** `oom_score_adj 1000` (Linux kills it before MJAPI), `os.setPriority(10)` so MJAPI wins CPU.
  A generous `LeaseSeconds` (300) keeps CPU preemption from costing heartbeats.
- **Baseline cost while running:** full metadata plus `ClassFactory` registrations and a pool, roughly 300–600 MB on a
  small tenant and more on large ones. Zero when idle because the process exits.
- **Over-ceiling sync:** retries three times and dead-letters. Alert on `WorkQueue.GetSubscriptionStats.DeadLettered`
  and on pm2 exit code 134. The fix is a larger W or a smaller batch size on the connector, never a bigger MJAPI.

---

## 6. MJ work breakdown

Tests first in every task (write, watch fail, implement). Sizes: S < 1 day, M 1–3 days, L a week.

### Task 0 — Queue host fixes (#6273, #6274) — **this PR**
- `WorkQueueProviderSource.ReleaseProvider?` and `BoundWorkHandler` releasing in `finally`; `IndependentProviderSource`
  minting with `CreateIndependentInstance` and releasing with `ReleaseIndependentInstance`.
- `mj queue work` mints per delivery; long-running mode defaults `SweeperIntervalMs: 60000`,
  `ReconcileIntervalMs: 30000` with `--sweeper-interval-ms` / `--reconcile-interval-ms`; `--once` keeps `0/0`.
- `mj queue sweep` over `WorkQueueHost.RunSweeperOnce()`.
- `MJServerWorkQueueProviderSource.ReleaseProvider`.
- Consumer guide §1 states the per-delivery provider contract; engine README documents the publish-only MJAPI shape.

### Task 1 — Topology metadata (S)
- `metadata/work-queue-topics/integration.sync-requested.json` with the subscription from §2.
- Test: `ValidateTopology` reports no issue; `PlanHostedSubscriptions` yields `Runnable` once the handler is registered.

### Task 2 — Engine refactor (L)
- `ResumePointFromRunDetails(details): Set<EntityMapID>` extracted from `ResumeOrphanedSyncs` as a pure function.
- `RunSyncOwned(run, options, boundaryCheck, onProgress)` extracted from `runWithOwnedContext`: no `RunOwnershipService`
  calls; `CheckBoundary` replaced by the callback at the same batch boundaries; `SchemaUpdatePending` written to the run.
- `CancelSync` unchanged for `Inline`; see Task 5 for `WorkQueue`.
- Tests: resume point skips `IsSuccess = 1` maps; boundary callback aborts between batches; a run that resumes writes no
  duplicate details.

### Task 3 — `IntegrationSyncHandler` (M)
- Payload `{ RunID, CompanyIntegrationID }`; `FatalWorkError` on a missing field.
- Outcome mapping per §3 step 6, keyed on `Signal.reason` and the engine's error class.
- Writes counts, `Status`, webhook, scheduled-job notification on finish.
- Tests with a mock connector through `ConsumerRuntime`: kill mid-sync → redelivery resumes; cancel → `Cancelled` and
  the key frees; lease lost → no settle, no further writes.

### Task 4 — Producers behind the flag (M)
- `integrationSync.executionMode: 'Inline' | 'WorkQueue'` in `mj.config.cjs` (default `Inline`).
- `IntegrationStartSync`: `WorkQueue` → §3 step 2, returns `RunID` at once; drops the polling loop; `webhookURL` into
  `ConfigData`.
- `IntegrationSyncScheduledJobDriver`: publishes, returns `Details: { Dispatched: true, CompanyIntegrationRunID }`; the
  completion notification moves to the handler.
- `EnqueueSync` publishes instead of inserting a `Queued` row for the legacy poller.
- Tests: the publish and the run insert commit or roll back together (fake provider transaction); the driver returns in
  milliseconds with the run id.

### Task 5 — Cancel through the queue (S)
- `CancelSync` in `WorkQueue` mode: find the delivery by `ConfigData.WorkMessageID`, call `WorkQueue.DiscardDelivery`;
  pending → `Cancelled` at once; in flight → `cancelRequested`, handler finishes it.
- Test: pending cancel frees the partition key immediately.

### Task 6 — MJAPI side (S)
- `index.ts`: skip `ResumeOrphanedSyncs` and `IntegrationSyncWorkerService` when `executionMode === 'WorkQueue'`.
- Documented config for a publish-only MJAPI: `workQueue.enabled: true`, `subscriptions: []`, `sweeperEnabled: true`
  (verified in `StartWorkQueueHost`: an empty list still starts the host and arms the sweeper).
- Nothing else; the spawn tick is chassis code because it shells out to pm2 (§7).

### Task 7 — `RunWorkQueueWorker()` in `@memberjunction/server` (M)
- Boots the full `server-bootstrap` manifest (integration packages, connectors) without Express or the GraphQL schema.
- Registers `RegisterIntegrationCustomColumnPromoter` and `CacheInvalidationBroadcastManager.Instance.Configure`.
- Builds `WorkQueueHost` with `IndependentProviderSource`, `SweeperIntervalMs: 0`, `ReconcileIntervalMs: 30000`,
  `Concurrency` from options, and runs `RunOnce({ IdleExitMs })` or `Start()`.
- Sets `os.setPriority` and `oom_score_adj` when asked. Handles SIGTERM/SIGINT through `RunUntilStopped`.
- Test: the worker never imports `express`/`apollo`; the promoter and broadcast are registered before the host starts.

### Task 8 — Docs (S)
- Consumer guide: the Option B pattern as the worked example for "a long domain run on the queue".
- Engine README: the co-located on-demand worker shape, cold-start cost, and the backlog tick.

Order: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Tasks 1, 6 and 8 can run alongside 2.

---

## 7. MJ Central chassis work (platform repo, for reference)

| Item | Change |
|---|---|
| `apps/MJAPI/src/queue-worker.ts` | 10 lines: call `RunWorkQueueWorker({ Subscriptions: [{ Name: 'integration.sync', Concurrency: 1 }], IdleExitMs: 600000, Nice: 10, OomScoreAdj: 1000 })` |
| `ecosystem.config.cjs` | two apps: `mjapi` (existing) and `mj-worker` (`autorestart: false`, `max_memory_restart`, `cron_restart: '0 * * * *'`, `node_args: --max-old-space-size=W`) |
| `app.ts` | `OnPublished` listener + 60 s backlog tick → `pm2 start ecosystem.config.cjs --only mj-worker`, gated by `INTEGRATION_WORKER=on` |
| `_mjc_deploy-api.yml` | start command `pm2 start ecosystem.config.cjs`; `RSU_RESTART_COMMAND="pm2 restart mjapi mj-worker"`; `INTEGRATION_WORKER_<ENV>` variable from Terraform tier |
| `mj.config.cjs` | `workQueue: { enabled: true, subscriptions: [], sweeperEnabled: true }`, `integrationSync.executionMode: 'WorkQueue'` |
| Tier defaults | off on the smallest tier, on from the tier with 8 GB RAM; override per tenant |

---

## 8. Failure cases

| Case | What happens | Recovery |
|---|---|---|
| Worker OOM mid-sync | pm2 restarts it; the lease expires; redelivery resumes from completed maps | Automatic; dead letter after 3 attempts |
| Worker exits during idle race | Message stays `Pending` | Backlog tick starts the worker within 60 s |
| MJAPI restarts during a sync | Worker keeps running; its lease is unaffected | None needed; boot resume is disabled |
| Two syncs requested for one connection | Second publish is a dedup `Duplicate` inside the window, else waits on the Exclusive key | None |
| Cancel while pending | Delivery discarded, run `Cancelled`, key free | None |
| Cancel while running | Next heartbeat reports cancel; handler stops and marks `Cancelled`; delivery discarded | None |
| Connector auth failure | `FatalWorkError` → dead letter, run `Failed`, webhook/notification sent | Operator fixes credentials, `mj queue replay` |
| Sync longer than `MaxProcessingSeconds` | Runtime aborts with that reason; handler leaves `In Progress`; retry resumes | Raise the cap or split the entity maps |
| Database unreachable | Claim fails; consumer backs off; MJAPI reports it as today | Automatic |
| Sweeper never runs (no MJAPI, no worker) | Retention and dedup rows grow | `mj queue sweep` from cron |

---

## 9. Risks and open questions

1. **Worker heap W is unmeasured.** Decide after a run on a copy of the largest tenant database. Until then the tier
   defaults stay off.
2. **Boundary callback coverage.** `RunSyncOwned` must call `boundaryCheck` at every point `CheckBoundary` is called
   today, or a lost lease keeps writing. The test in Task 2 has to count the calls against the current path.
3. **`SchemaUpdatePending` out of process.** The worker writes it on the run row; the promoter creates `EntityField`
   rows. MJAPI needs to notice. Options: the existing metadata refresh cadence, or the cache-invalidation broadcast
   when configured. **Decide in Task 7.**
4. **Scheduled-job `Details` contract.** Consumers of `ScheduledJobRun.Details` that expect counts will see
   `Dispatched: true` until the handler writes the final numbers back. **Decide:** write back into the same row or add a
   second row.
5. **Discovery and apply stay in MJAPI** in phase 1 (they need MJAPI's disk and the final restart). A later task can move
   discovery once the worker shares the disk.
6. **Progress tail in phase 2** needs a database-backed stream. Phase 2 does not start until it exists.
7. **09e scope not taken here:** `integration.batch-ready` (pushed batches), the vendor-completed split-message pattern
   and the `IntegrationExecutionGuard`. They stay on the 09e roadmap; nothing in this plan blocks them.

---

## 10. Rollout

1. Merge Task 0 (this PR) to `next`.
2. Tasks 1–8 on `next` behind `executionMode: 'Inline'`; integration tier green under both values.
3. MJ Central chassis changes to stage; one staff-run tenant with `WorkQueue` on, syncs watched for a week.
4. Tier defaults on; `Inline` stays available as the rollback switch for one release.
5. Phase 2 after the progress-tail gate: the same handler in a container job, `mj-worker` replaced by the scaler.

---

## 11. Sources

- Review: https://github.com/MemberJunction/MJ/pull/4709#issuecomment-6507854693
- Issues: #6273, #6274, #6275, #4824, #5510, #5673
- Spec: `plans/work-queue-1/09-follow-on/09e-integration-runs-revamp.md` on `spec/work-queue`
- Code (on `next` at ea207aec3a): `packages/WorkQueue/engine/src/host/WorkQueueHost.ts`,
  `packages/WorkQueue/engine/src/transports/database/DatabaseTransportConsumer.ts` (lease expiry on receive, L176),
  `packages/MJServer/src/services/WorkQueueHostService.ts`, `packages/MJCLI/src/commands/queue/work.ts`,
  `packages/Integration/engine/src/IntegrationEngine.ts`, `packages/MJServer/src/resolvers/IntegrationDiscoveryResolver.ts`,
  `packages/Scheduling/engine/src/drivers/IntegrationSyncScheduledJobDriver.ts`, `packages/MJServer/src/index.ts` (L1778)

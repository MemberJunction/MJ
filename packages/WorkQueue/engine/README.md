# @memberjunction/work-queue-engine

Server-side engine for the MemberJunction durable work queue: the Database transport driver and its SQL, the
publish coordinator and deduplication ledger, the operator, the sweeper, the in-process host that runs handlers,
and the `WorkQueue.*` Remote Operations. Browser-safe metadata (`WorkQueueEngineBase`, row types, binding builders,
topology validation) lives in `@memberjunction/work-queue-base`; transport-neutral contracts and the consumer
runtime live in `@memberjunction/work-queue-core`.

Design and contract: `plans/work-queue-1/02-implementation-overview.md` and `03-interfaces-and-tables.md`.

## What is in the box

| Area | Exports |
| --- | --- |
| Engine | `WorkQueueEngine` (facade over `WorkQueueEngineBase.Instance`; drivers, `Publish`/`PublishAs`, `GetDriver`, `OnDeadLettered`) |
| Database transport | `DatabaseTransportDriverFactory`, `DatabaseTransportDriver`, `DatabaseTransportConsumer`, `DatabaseTransportOperator`, `DATABASE_TRANSPORT_CAPABILITIES` |
| SQL | `WorkQueuePublishSql`, `WorkQueueConsumeSql`, `WorkQueueOperatorSql` (one builder set for SQL Server and PostgreSQL, rendering calls to the `spWorkQueue*` procedures), `RunInWorkQueueTransaction`, `TryAcquireSweepLock` |
| Publishing | `WorkQueuePublishCoordinator`, `DeduplicationLedger` |
| Runtime | `WorkQueueHost`, `WorkQueueSweeper`, `BaseWorkHandler`, `ResolveWorkHandler`, `SharedProviderSource` |
| Operators | `WorkQueueOperatorService`, the seven `WorkQueue*ServerOperation` classes (`@RegisterClass` server halves of the `WorkQueue.*` Remote Operations) |
| Entities | Server subclasses that validate topology rows (`WorkQueueTransportEntityServer`, `WorkQueueTopicEntityServer`, `WorkQueueSubscriptionEntityServer`) and refuse `Save()`/`Delete()` on driver-owned rows (messages, deliveries, deduplication) |
| Testing | `CreateDatabaseConformanceHarness` — runs core's transport conformance cases against a live database |

## Data layer

Every queue statement is a static stored procedure named `spWorkQueue*` (32 of them, in
`migrations/v6/V202609241637__v6.2.x__Work_Queue_Guarded_Write_Sprocs.sql`). Runtime roles hold **EXECUTE on the
procedures only** — no direct DML on the queue tables — so the claim, settle, cancel and sweep rules cannot be
bypassed by a caller with a connection string. The TypeScript builders render `EXEC` on SQL Server and
`SELECT * FROM schema."proc"(...)` on PostgreSQL; the PostgreSQL functions are produced by the SQLConverter at release
time, never hand-written.

Consumers, the operator and the sweeper each own an **independent executor** (`CreateIndependentInstance()`),
never the shared provider's ambient transaction, so a claim can never be rolled back by an unrelated caller. The
sweep lock is a transaction-scoped application lock: one sweeper pass at a time across every instance.

Identifiers that come back from SQL Server are normalised to lower case before they reach any comparison
(`guides/UUID_COMPARISON_GUIDE.md`).

**SQL Server databases need `READ_COMMITTED_SNAPSHOT ON`**: without snapshot reads, publishers, claimers and the
scaler block each other. `WorkQueue.ValidateBindings` / `mj queue validate-bindings` probes the setting and reports
it as an `Error` issue with the `ALTER DATABASE` to run; check it before enabling the host on a new database.

### Live conformance test

`pnpm test` in this package is hermetic. To run core's 26 transport conformance cases against your own database:

```bash
MJ_WORKQUEUE_LIVE_DB=1 pnpm test
```

It reads the repository `.env`, uses the seeded `Database` transport (`D1ED3F08-7008-4DA8-BA2B-7CD6A820AEB5`),
names everything it creates so it can be recognised, and deletes it afterwards. The integration bundle
`work-queue-runtime` (IT95) runs the same cases plus the host, operators, sweeper and REST endpoint under
`pnpm run test:integration`.

## Running subscriptions inside MJ

Enable the host in `mj.config.cjs` on every instance that should process work:

```javascript
workQueue: {
  enabled: true,
  systemUserEmail: 'system@example.org',            // REQUIRED: an existing MJ user; handlers run as this user
  subscriptions: [{ name: '*', concurrency: 4 }],   // or name specific subscriptions
  idlePollMinMs: 250,
  idlePollMaxMs: 5000,
  shutdownDrainMs: 8000,
  sweeperEnabled: true,
  sweeperIntervalMs: 60000,
  reconcileIntervalMs: 30000,
}
```

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | Start the host in this process |
| `systemUserEmail` | none that works — set it | The user handlers, the sweeper and the REST extension's engine run as. The shipped placeholder (`not.set@nowhere.com`) fails start-up with a message that says so |
| `subscriptions` | `[{ name: '*', concurrency: 4 }]` | Which subscriptions this instance runs, and how many deliveries of each at once |
| `idlePollMinMs` / `idlePollMaxMs` | 250 / 5000 | Poll back-off while a Database subscription is empty |
| `shutdownDrainMs` | 8000 | How long running handlers get to finish on shutdown. The host can take up to **2×** this (drain, abort with `'Shutdown'`, drain again), so the process supervisor's grace period must exceed it |
| `sweeperEnabled` / `sweeperIntervalMs` | `true` / 60000 | Lease expiry and retention purge. Any number of instances may enable it: a database application lock lets one pass run at a time |
| `reconcileIntervalMs` | 30000 | How often the host re-plans. `0` plans only at start |

`MJ_DISABLE_WORK_QUEUE_HOST=1` turns the host off for one process without touching configuration.

Any number of instances may run the same subscription: claims are atomic against the database (or the cloud queue),
leases are fenced, and each instance only decides what **it** runs.

Subscription metadata is cached by `WorkQueueEngineBase` (`@memberjunction/work-queue-base`, browser-safe). The server
`WorkQueueEngine` delegates to it, the same split as `AIEngineBase`/`AIEngine`. Import base symbols from
`@memberjunction/work-queue-base` directly — the engine package does not re-export them.

Every `reconcileIntervalMs` the host re-plans: a subscription set to `Paused`, a changed lease, or a newly added
subscription takes effect without a restart. `GET /health/extensions` (with `WorkQueueServerExtension` enabled)
reports each subscription's state:

| State | Meaning | Fix |
| --- | --- | --- |
| `Running` | A consumer runtime is claiming | — |
| `Paused` | Subscription, topic or transport is not `Active` | Set it `Active` |
| `HandlerNotRegistered` | No `BaseWorkHandler` under `HandlerKey` in this process | Import the handler's package / check the key |
| `Unsupported` | The transport cannot honor the policy — for example `Ordered` on a cloud topic (`Ordered` needs a Database topic) | See the reason text |
| `Error` | Driver or consumer could not start | See the reason text and server log |

## Writing a handler

```typescript
import { RegisterClass } from '@memberjunction/global';
import { Outcome, FatalWorkError, type WorkContext, type WorkMessage, type WorkOutcome } from '@memberjunction/work-queue-core';
import { BaseWorkHandler } from '@memberjunction/work-queue-engine';

interface BatchReady { batchUri: string; records: number }

@RegisterClass(BaseWorkHandler, 'integration.apply-batch')
export class ApplyBatchHandler extends BaseWorkHandler<BatchReady> {
    public async Handle(message: WorkMessage<BatchReady>, context: WorkContext): Promise<WorkOutcome> {
        if (!message.Payload?.batchUri) {
            throw new FatalWorkError('batchUri missing');                      // dead-letter now, no retry
        }
        await applyBatch(message.Payload.batchUri, this.Provider, this.ContextUser, context.Signal);   // idempotent upserts
        return Outcome.Complete();
    }
}
```

Rules: handlers must be idempotent; use `this.Provider` / `this.ContextUser` (the host's system user) for every data
call; honor `context.Signal` and stop when it aborts; any other thrown error retries with backoff. With the default
`HeartbeatMode = 'Auto'` the runtime renews the lease itself, every `min(LeaseSeconds / 3, 30 s)`. The full guidance
— idempotency keys, long-running work, abort reasons, publishing in order, filters — is in the consumer guide,
`plans/work-queue-1/10-consumer-guide.md`.

A handler class must be **loaded** in the process that runs it: MJ resolves `HandlerKey` through the ClassFactory,
so the package that declares the handler has to appear in the host's class manifest (`mj codegen manifest`) or be
imported by the application. A key that resolves to nothing plans as `HandlerNotRegistered` and its deliveries stay
`Pending` for another instance.

## Operating

| Task | CLI | Remote Operation |
| --- | --- | --- |
| Counts | `mj queue stats [--subscription s]` | `WorkQueue.GetSubscriptionStats` |
| Dead letters | `mj queue dead-letters --subscription s` | `WorkQueue.ListDeadLetters` |
| Blocked keys | `mj queue partitions --subscription s --condition Blocked` | `WorkQueue.ListPartitions` |
| Retry a dead letter | `mj queue replay --subscription s --delivery id` | `WorkQueue.ReplayDeadLetter` |
| Drop work, or cancel a running handler | `mj queue discard --subscription s --delivery id --reason "…"` | `WorkQueue.DiscardDelivery` |
| Backlog for an autoscaler | `mj queue backlog --subscription s` | `WorkQueue.GetBacklog` |
| Check bindings | `mj queue validate-bindings [--transport t]` | `WorkQueue.ValidateBindings` |
| Run work in a container job | `mj queue work --subscription s --once` | — |

**Who may call the operations.** Every caller needs entity permissions: **Read** on `MJ: Work Queue Deliveries` for
the read operations (stats, dead letters, partitions, backlog, validate-bindings) and **Update** on
`MJ: Work Queue Subscriptions` for replay and discard. API-key callers additionally need the `workqueue:read` or
`workqueue:operate` scope, which the `MJAPI` application allows (`metadata/api-application-scopes`). Messages and
deliveries are readable by administrative roles only: payloads may hold personal data.

**Discard and cancel.** Discarding a **pending** or **dead-lettered** delivery resolves it immediately. Discarding an
**in-flight** delivery is a cancel (`cancelRequested: true`): the row is flagged, the holder's next heartbeat — at
most 30 seconds away — reports `Cancelled`, the runtime aborts the handler with `Signal.reason === 'Cancelled'` and
acknowledges, and the row becomes `Discarded` as soon as the handler returns, freeing its `Exclusive`/`Ordered` key.
A handler that ignores its signal holds the key until its lease runs out; if the holder has died, lease expiry
discards the row. A cancelled delivery is never retried.

**Alerting on dead letters.** `WorkQueueEngine.Instance.OnDeadLettered(event => …)` is **in-process only**: it fires
in the process that dead-lettered the item. A dead letter produced by another instance's sweeper, or inside a one-shot
container job, reaches no listener elsewhere. Alert from `WorkQueue.GetSubscriptionStats` (`DeadLettered > 0`) on the
Database transport and from the DLQ alarms on AWS.

### Container-job workers (KEDA, Azure Container Apps jobs, Kubernetes)

Instead of a long-running host, run one-shot jobs that claim a bounded amount of work and exit:

```bash
mj queue work --subscription venue-import --once                  # claim 1, run, drain, exit 0
mj queue work --subscription venue-import --once --max 5 --concurrency 2 --max-duration-ms 3300000
```

`--max` bounds deliveries **received**, so a job never claims work it will not run. `--max-duration-ms` stops claiming
after that long and drains; keep it below the scheduler's job deadline. `SIGTERM` and `SIGINT` drain the host in both
`--once` and long-running modes.

**Exit codes.** `0` when the host ran — including "the queue was empty", a spent budget, `--max-duration-ms`, a
signal, or a subscription an operator paused — so a scheduler never records a failure for idleness. **Non-zero** when
the requested subscription could not run at all: unknown name, `HandlerNotRegistered`, `Unsupported`, `Error`, or a
boot/configuration failure. A mis-deployed image therefore fails loudly instead of "succeeding" forever.

**Scaler query.** Give the scaler its own SELECT-only login (`scripts/work-queue-scaler-login.sql`) and use the query
below. It counts claimable `Pending` **plus** `InFlight`, applies single flight per key, and caps each count at 1000.
Counting `InFlight` is load-bearing: schedulers subtract running executions from the metric, so a `Pending`-only
count scales to zero while work is still running and starves the queue. Each half walks an index in order and needs
`READ_COMMITTED_SNAPSHOT` so it never blocks behind writers. A `Paused` subscription reports only its `InFlight`
rows; a blocked `Ordered` key contributes nothing because its waiting rows are not heads. On an `Exclusive`
subscription the query counts rows, not distinct keys, so it can over-count; the cost is a job that starts, claims
nothing and exits 0. `mj queue backlog` / `WorkQueue.GetBacklog` is exact — prefer it where the scaler can call an API.

```sql
-- SQL Server. @SubscriptionName = the subscription the scaled job runs. Replace __mj with your core schema.
SELECT
    (SELECT COUNT(*) FROM (
        SELECT TOP (1000) 1 AS x
        FROM __mj.WorkQueueDelivery d
        INNER JOIN __mj.WorkQueueSubscription s ON s.ID = d.SubscriptionID
        WHERE s.Name = @SubscriptionName AND s.Status = 'Active'
          AND d.Status = 'Pending' AND d.VisibleAt <= SYSDATETIMEOFFSET()
          AND (d.PartitionKey IS NULL
               OR (NOT EXISTS (SELECT 1 FROM __mj.WorkQueueDelivery f
                               WHERE f.SubscriptionID = d.SubscriptionID AND f.PartitionKey = d.PartitionKey AND f.Status = 'InFlight')
                   AND (s.PartitionMode <> 'Ordered'
                        OR NOT EXISTS (SELECT 1 FROM __mj.WorkQueueDelivery e
                                       WHERE e.SubscriptionID = d.SubscriptionID AND e.PartitionKey = d.PartitionKey
                                         AND e.OrderKey < d.OrderKey AND e.Status IN ('Pending', 'InFlight', 'DeadLettered')))))
     ) claimable)
  + (SELECT COUNT(*) FROM (
        SELECT TOP (1000) 1 AS x
        FROM __mj.WorkQueueDelivery d
        INNER JOIN __mj.WorkQueueSubscription s ON s.ID = d.SubscriptionID
        WHERE s.Name = @SubscriptionName AND d.Status = 'InFlight'
     ) inflight) AS Backlog;
```

PostgreSQL form: replace `SYSDATETIMEOFFSET()` with `now()`, quote identifiers (`"__mj"."WorkQueueDelivery"`,
`d."Status"` …), drop `TOP (1000)` and end each inner `SELECT` with `LIMIT 1000`.

**KEDA `ScaledJob`** (one delivery per job, scale to zero, at most 5 at a time):

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledJob
metadata:
  name: mj-work-queue-venue-import
spec:
  jobTargetRef:
    parallelism: 1
    completions: 1
    backoffLimit: 0                     # the queue owns retries; never let the scheduler re-run a job
    activeDeadlineSeconds: 3600         # hard stop; --max-duration-ms below is the graceful one
    template:
      spec:
        restartPolicy: Never            # required for Jobs; with backoffLimit 0 a failed pod is not restarted
        terminationGracePeriodSeconds: 30      # > 2 × --shutdown-drain-ms, so a drain is never cut short
        containers:
          - name: worker
            image: <your mj image>
            args: ["queue", "work", "--subscription", "venue-import", "--once",
                   "--max-duration-ms", "3300000", "--shutdown-drain-ms", "10000"]
  pollingInterval: 10
  maxReplicaCount: 5
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 5
  scalingStrategy:
    strategy: accurate                  # the query already includes in-flight work
  triggers:
    - type: mssql
      metadata:
        targetValue: "1"
        query: <the scaler query above, on one line, with the subscription name inlined>
      authenticationRef:
        name: mj-work-queue-scaler-auth       # the SELECT-only login
```

Azure Container Apps event-driven jobs are the same shape: `replicaTimeout` above `--max-duration-ms` plus the drain,
`replicaRetryLimit: 0`, and the same query as the scale rule.

**Sizing.** `LeaseSeconds` must cover the job's worst heartbeat outage (a database failover), not just its runtime —
a lease that expires while the job is healthy lets a second job claim the same delivery. `2 × --shutdown-drain-ms`
must fit inside the platform's termination grace period.

### Runbook: an `Ordered` key is blocked

1. `mj queue partitions --subscription <s> --condition Blocked` — note `HeadDeliveryID` and `WaitingItems`.
2. `mj queue dead-letters --subscription <s>` — read `Reason` and `LastError` for that delivery.
3. Fix the cause (handler bug → deploy; bad data → correct the source).
4. `mj queue replay --subscription <s> --delivery <HeadDeliveryID> --note "<what changed>"` — the head keeps its
   position; the key resumes when it completes. If the work must be dropped instead:
   `mj queue discard … --reason "<why>"`.
5. Re-run step 1 until the key no longer appears.

### Runbook: a delivery is stuck `InFlight`

1. `mj queue stats --subscription <s>` — `InFlight` that never falls.
2. If the handler is alive and hung, cancel it: `mj queue discard --subscription <s> --delivery <id> --reason "<why>"`.
   Expect `cancelRequested: true`; the row is `Discarded` within ~30 seconds if the handler honors its signal.
3. If the holder is dead, do nothing: the sweeper expires the lease within `LeaseSeconds` + `sweeperIntervalMs` and
   the delivery retries (or dead-letters on its final attempt). Check that some instance has `sweeperEnabled: true`.

### Soak test (manual, before each release that touches the work queue)

1. Development database of your own; two MJAPI instances with `workQueue.enabled` and different `GRAPHQL_PORT`s.
2. A throwaway topic with one `None`, one `Exclusive` and one `Ordered` subscription on a handler that sleeps
   0–200 ms and fails 2 % of the time (`TransientWorkError`).
3. Publish 50,000 messages over 10 minutes (keys drawn from 500 values; one producer per key, awaiting each
   acceptance) through `POST /work-queue/topics/…/messages`.
4. During the run: `kill -9` one instance twice, restart it each time; cancel ten in-flight deliveries.
5. Pass when: every delivery ends `Completed`, `DeadLettered` or `Discarded`; no `Exclusive`/`Ordered` key ever had two
   `InFlight` rows (`SELECT SubscriptionID, PartitionKey, COUNT(*) FROM WorkQueueDelivery WHERE Status = 'InFlight' AND PartitionKey IS NOT NULL GROUP BY SubscriptionID, PartitionKey HAVING COUNT(*) > 1` returns nothing throughout);
   `Ordered` completion order per key equals `OrderKey` order; `mj queue stats` shows no stuck `InFlight` after the run.

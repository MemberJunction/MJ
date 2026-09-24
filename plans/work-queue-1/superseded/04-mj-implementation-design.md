# 04 — MJ Implementation (Phase 1: Database transport, MJ host, API, CLI, MJQueue replacement)

Normative names come from [03](03-interfaces-and-tables.md). Where this document **extends or adjusts**
03 it says so explicitly and the item is collected in [§14](#14-deviations-from-and-extensions-to-03).
All repo paths are relative to the repository root and were verified against `next` (2026-09-16).

---

## 1. Scope & deliverables

| # | Deliverable | Package / location |
|---|---|---|
| 1 | Core contract, `ConsumerRuntime`, filter evaluator, backoff, `InMemoryTransport`, conformance kit, `WorkQueueApiPublisher` | `packages/WorkQueue/core` → `@memberjunction/work-queue-core` |
| 2 | `WorkQueueEngine` (topology cache + validation + in-process publish), Database transport driver, operator service, sweeper, manifest export / binding import, `BaseWorkHandler`, AWS driver factory shim, CLI plugins | `packages/WorkQueue/engine` → `@memberjunction/work-queue-engine` |
| 3 | REST publish + operator routes (Server Extension) | `packages/WorkQueue/server` → `@memberjunction/work-queue-server` |
| 4 | `SQLDialect.SkipLockedClaim()` | `packages/SQLDialect` |
| 5 | Worker host service + `workQueue` config section + boot wiring | `packages/MJServer` |
| 6 | Shared server provider factory (SQL Server + PostgreSQL) lifted out of `context.ts` | `packages/MJServer` |
| 7 | `mj queue …` commands (thin oclif shims) | `packages/MJCLI/src/commands/queue/` |
| 8 | Migration (6 tables) + CodeGen output; entity-flag metadata; API scopes; system topic/subscription metadata | `migrations/v6/`, `metadata/` |
| 9 | Entity AI Action dispatch moved off `MJQueue`; `MJQueue` deprecated | `packages/GenericDatabaseProvider`, `packages/SQLServerDataProvider`, `packages/MJQueue`, metadata |
| 10 | Unit tests, conformance runs, deterministic integration bundle | per package; `packages/TestingFramework/integration-test-suite` |

Out of scope here: AWS driver internals (05), dashboard (06b), gateway host (06c).

---

## 2. `@memberjunction/work-queue-core`

No `@memberjunction/*` dependencies (so Lambdas can bundle it). Node ≥ 20 (`AbortController`, `crypto.randomUUID`).

### 2.1 Source layout

```
core/src/
  envelope.ts            WorkJson, WorkPayloadRef, WorkMessage, PublishRequest/Result, envelope validation
  handler.ts             WorkContext, WorkOutcome, Outcome, WorkHandler, LeaseLostError, WorkProgress, WorkLogger
  policy.ts              SubscriptionPolicy + enums, ComputeBackoffSeconds, DEFAULT_POLICY
  filter.ts              SubscriptionFilter grammar, ParseFilter (validates limits), MatchesFilter
  transport.ts           ITransportDriver, ITransportConsumer, ITransportOperator, bindings, SettleResult, stats types
  runtime/ConsumerRuntime.ts
  runtime/LeaseKeeper.ts  per-delivery heartbeat timer + abort wiring
  memory/InMemoryTransport.ts
  testing/conformance.ts  RunTransportConformance(factory, options) — Vitest-agnostic describe/it callbacks
  client/WorkQueueApiPublisher.ts
  manifest.ts            TopologyManifest, ManifestTopic, ManifestSubscription, BindingImport
  index.ts
```

### 2.2 `ConsumerRuntime` behavior (normative)

**Slots.** `Concurrency` slots. The loop requests `min(freeSlots, ReceiveBatchSize)` deliveries; it never holds
more received-but-unstarted deliveries than free slots, so a delivery's lease never ticks while it waits
in memory.

**Loop.**
```
while running:
  free = Concurrency - inFlight
  if free == 0: await any handler settles
  batch = consumer.Receive(min(free, ReceiveBatchSize), waitSeconds, loopSignal)
  if batch empty: idleDelay = min(IdlePollMaxMs, max(IdlePollMinMs, idleDelay * 2)); await sleep(idleDelay) | Kick()
  else: idleDelay = IdlePollMinMs; for each: start RunOne(d)   (not awaited; tracked)
```
`waitSeconds` is passed through (SQS long-poll); the Database consumer ignores it and returns immediately.

**RunOne(d).**
1. Create per-delivery `AbortController` (linked to runtime shutdown controller).
2. Start `LeaseKeeper`:
   - `Auto`: every `floor(LeaseSeconds*1000/3)` ms call `ExtendLease(d, LeaseSeconds)` while the handler promise
     is pending. If `MaxProcessingSeconds` is set, stop renewing once elapsed ≥ `MaxProcessingSeconds` and abort
     the handler with reason `MaxProcessingExceeded` (the lease then expires naturally → failed attempt).
   - `Manual`: no timer. `context.Heartbeat(progress)` calls `ExtendLease`.
   - In both modes `context.Heartbeat(progress)` is available; in `Auto` it additionally records progress and
     resets the timer.
   - `ExtendLease` → `'Lost'` ⇒ abort with reason `LeaseLost`; `context.Heartbeat` rejects with `LeaseLostError`.
   - A transient `ExtendLease` exception is logged and retried at the next tick; after two consecutive
     failures spanning ≥ `LeaseSeconds*2/3` the runtime aborts with `LeaseUnknown` (it can no longer prove ownership).
3. `outcome = await handler.Handle(message, context)`; a throw ⇒ `Retry` with `LastError = error.stack ?? message`.
4. Stop `LeaseKeeper`. If aborted for `LeaseLost`/`LeaseUnknown`: **do not settle** (the new owner or the
   sweeper decides), log, free slot.
5. Settle:
   | Outcome | Condition | Call |
   |---|---|---|
   | `Complete` | — | `Complete(d)` |
   | `Retry` | `d.Attempt < MaxAttempts` | `Retry(d, DelaySeconds ?? ComputeBackoffSeconds(policy, d.Attempt), reason)` |
   | `Retry` | `d.Attempt ≥ MaxAttempts` | `DeadLetter(d, 'MaxAttemptsExceeded', lastError)` |
   | `DeadLetter` | — | `DeadLetter(d, reason, null)` |
   | aborted by shutdown before handler started | — | `Release(d)` |
   | aborted by shutdown after handler started, handler returned | — | settle normally |
6. `SettleResult.Failed` (infra error) ⇒ log; do nothing else — the lease expires and the delivery is redelivered
   (at-least-once preserved). `LeaseLost` ⇒ log at warn.

**`Retry.DelaySeconds`** is clamped to `[0, BackoffMaxSeconds]`.

**Stop().** Stop receiving; wait up to `ShutdownDrainMs` for in-flight handlers; then abort remaining with reason
`Shutdown`, wait ≤ 1 s for them to return, and `Release` those whose handlers never returned an outcome.
(Released deliveries do not consume an attempt.) `Stop()` is idempotent.

**`ProcessBatch(deliveries)`** (Lambda mode) runs the same `RunOne` for each delivery with no loop, honoring
`Concurrency`, and resolves with per-delivery `SettleResult`s. AWS-specific ordering of batch items is 05's concern.

**Context values.** `DeliveryID`, `Attempt`, `IsReplay` from the `ReceivedDelivery`; `Log` = runtime logger with
`{ subscription, deliveryID, messageID, attempt }` bound.

### 2.3 `InMemoryTransport`

Full `ITransportDriver` implementation with an injectable clock (`() => number`) so tests can advance time. It
implements every semantic in 02 §3 (fan-out with filters, lease/token fence, `None`/`Exclusive`/`Ordered`, both
ordering modes, dead letters, replay/discard/skip-sequence, stats). It is the **reference implementation** the
conformance kit is validated against first; it is also what unit tests of handlers use.

### 2.4 Conformance kit

`RunTransportConformance(ctx: ConformanceContext)` where the context supplies: a driver factory, a way to create
topics/subscriptions with a given policy, `AdvanceTime(seconds)` (in-memory: fake clock; database: rewrites
`VisibleAt`/`LeaseExpiresAt` by the delta — see §11.3), and teardown.

| ID | Case | Asserts |
|---|---|---|
| C01 | Publish → receive → complete | exactly one delivery; status `Completed` |
| C02 | Fan-out to 3 subscriptions, one filtered out | 2 deliveries; independent statuses |
| C03 | Failure isolation | sub A dead-letters, sub B completes the same message |
| C04 | Filter grammar: equals-any, prefix, exists, anything-but | matches per table |
| C05 | Duplicate `MessageID` publish | second result `Duplicate` (skippable per driver capability `DetectsDuplicates`) |
| C06 | Envelope validation | each §1 rule returns its error code |
| C07 | Lease expiry → redelivery | attempt 2 received; first holder's `Complete` returns `LeaseLost` |
| C08 | Fence: zombie heartbeat after reclaim | `ExtendLease` → `Lost` |
| C09 | Late completion without reclaim | holder whose lease expired but not reclaimed can still `Complete` |
| C10 | Retry with delay | not receivable before delay; receivable after |
| C11 | Max attempts via Retry → dead letter | reason `MaxAttemptsExceeded` |
| C12 | Max attempts via lease expiry → dead letter | reason `LeaseExpired` |
| C13 | Handler `DeadLetter` | immediate, attempt 1 |
| C14 | `Release` | status `Pending`, attempt count not consumed |
| C15 | Exclusive: two messages same key | never both in flight; both complete |
| C16 | Exclusive: dead letter does not block | second item for key proceeds |
| C17 | Exclusive: different keys run concurrently | both in flight simultaneously |
| C18 | Ordered/PublishOrder: 5 items | handled strictly in publish order |
| C19 | Ordered: head retry-delay holds the key | item 2 not receivable during item 1 backoff |
| C20 | Ordered: head dead-lettered → key blocked | items 2..n not receivable; stats `BlockedKeys=1` |
| C21 | Ordered: replay unblocks | replayed head delivered first, then 2..n in order |
| C22 | Ordered: discard unblocks | 2..n delivered in order |
| C23 | Ordered: other keys unaffected by a blocked key | |
| C24 | ExplicitSequence: publish 2 before 1 | 2 not receivable; after 1 published, 1 then 2 |
| C25 | ExplicitSequence: missing publish of sequence | partition condition `AwaitingSequence`, then `GapStalled` after alert seconds |
| C26 | SkipSequence | next sequence becomes deliverable; invalid skip rejected |
| C27 | ExplicitSequence: duplicate sequence different MessageID | `Rejected` `DuplicateSequence` |
| C28 | ExplicitSequence: sequence without key / key without sequence | rejected |
| C29 | Message without PartitionKey on partitioned subscription | treated as unique key |
| C30 | Paused subscription | publish creates deliveries; nothing receivable; resume → receivable |
| C31 | Disabled subscription | no deliveries created |
| C32 | `ListDeadLetters` paging | cursor round-trips all records |
| C33 | Two consumers contend (Database/InMemory: two consumer instances) | no delivery handed out twice concurrently; all complete |
| C34 | Stats | counts reflect each state |

Drivers declare capabilities (`{ DetectsDuplicates: boolean; PersistsProgress: boolean; SupportsCompletedCounts: boolean }`)
so C05/progress/stats assertions adapt (extension to 03 — §14).

### 2.5 `WorkQueueApiPublisher`

```ts
export interface WorkQueueApiPublisherOptions {
  BaseUrl: string;                 // e.g. https://api.example.com/work-queue
  ApiKey: string;                  // sent as X-API-Key
  TimeoutMs?: number;              // default 10_000
  MaxRetries?: number;             // default 4 (whole-request retries)
  Fetch?: typeof fetch;            // injectable
}
export class WorkQueueApiPublisher implements IWorkPublisher { … }
```
- Assigns `crypto.randomUUID()` to every request lacking `MessageID` **before** the first attempt, so retries reuse IDs.
- Chunks into requests of ≤ 100 messages; concatenates results positionally.
- Retries whole chunks on network error, `429`, `502/503/504` with exponential backoff + jitter (base 200 ms, cap 5 s),
  honoring `Retry-After`. After a retry, items previously `Accepted` come back `Duplicate` (Database, FIFO) — both are success.
- Per-item `Rejected` with `Error.Retryable = true` (e.g. `TransportUnavailable`) are retried item-wise up to `MaxRetries`.
- `400/401/403/404` fail fast with a typed `WorkQueuePublishError`.

---

## 3. Database transport driver

Lives in `engine/src/transports/database/`. Registered as `@RegisterClass(BaseTransportDriverFactory, 'Database')`.

### 3.1 Structure

```
DatabaseTransportDriver        implements ITransportDriver
DatabaseTransportConsumer      implements ITransportConsumer   (one per subscription per host)
DatabaseTransportOperator      implements ITransportOperator
DatabaseSweeper                set-based maintenance
WorkQueueSqlBuilder            abstract; SqlServerWorkQueueSqlBuilder, PostgreSQLWorkQueueSqlBuilder
                               (selected by provider.PlatformKey; uses provider.Dialect for quoting/params)
```

**Why a per-platform statement builder and not only the dialect primitive.** `SkipLockedClaim()` (03 §6.8) supplies
the lock fragments, but statement *shapes* differ: SQL Server needs `UPDATE` through an updatable CTE with
`OUTPUT … INTO @table` (MJ tables carry CodeGen's `__mj_UpdatedAt` trigger, and `OUTPUT` without `INTO` is illegal on
a table with enabled triggers — the same reason `spClaimCompanyIntegrationRun` uses a table variable,
`migrations/v6/V202608140100__v6.1.x__Durable_Sync_Runs.sql`), while PostgreSQL uses
`WITH c AS (SELECT … FOR UPDATE SKIP LOCKED) UPDATE … FROM c RETURNING`. Queue-specific shapes stay in the engine;
only the reusable lock primitive goes into `SQLDialect`. No stored procedures (no PG sproc conversion burden).

**Clock.** Every timestamp comparison and write uses the database clock (`SYSDATETIMEOFFSET()` / `now()`), never the
process clock — the rule `TaskClaimStore.TryClaim` documents (`packages/TaskGraph/src/TaskClaimStore.ts` ~209).
`SQLDialect.DateAddExpression` only accepts `MINUTE|HOUR|DAY` (`packages/SQLDialect/src/sqlDialect.ts:740`); the
builder emits `DATEADD(SECOND, …)` / `now() + make_interval(secs => …)` itself (optionally extend the dialect union
with `'SECOND'` — §14).

**Providers & transactions.** A transaction belongs to a provider instance (`databaseProviderBase.ts` ~143). The driver
takes a `ProviderFactory` (same shape as `packages/TaskGraph/src/types.ts:20`) and mints a provider **per transactional
operation** (claim cycle, settle, publish when no caller provider). Minting is cheap — it reuses loaded metadata over
the shared pool (`packages/MJServer/src/services/TaskGraphProviderFactory.ts`). Single-statement ops (`ExtendLease`,
stats) share one long-lived "ops" provider per consumer.

**Lock order (deadlock avoidance).** Every transaction that touches both tables locks
`WorkQueuePartitionState` row(s) **before** `WorkQueueDelivery` row(s); multi-key transactions lock partition rows in
`(SubscriptionID, PartitionKey)` order. Deadlock-victim errors (SQL Server 1205, PG `40P01`) and serialization
failures are classified retryable: the operation is retried up to 3× with 20–100 ms jitter; claims simply skip.

**Direct SQL on entity tables** requires `AllowDirectSQLInsert/Update/Delete = 1` and `TrackRecordChanges = 0` on
Messages, Deliveries, Partition States (03 §6.7; set via `metadata/entities`, §8.3).

Placeholders below are shown as `@name`; the builder emits `provider.BuildParameterPlaceholder(i)`. Schema shown as `__mj`.

### 3.2 Publish

`DatabaseTransportDriver.Publish(topic, messages, subscriptions, opts?: { Provider?: DatabaseProviderBase; UserID?: string })`
(the optional fourth argument `opts` is used by the in-process path, §4.1).

**TS pre-work (no DB):**
1. Envelope validation (03 §1) — per-item `Rejected`.
2. For each message, compute matched subscriptions: `Status IN ('Active','Paused')` and `MatchesFilter(filter, attributes)`.
3. Delivery `PartitionKey` = message key **only** for `Exclusive`/`Ordered` subscriptions (NULL for `None`, and NULL
   when the message has no key → the unique-key rule of 02 §3.5 falls out of the claim routing in §3.3).
4. Collect the distinct `(SubscriptionID, PartitionKey)` pairs needing partition state; sort.

**Transaction** (caller's provider if it has an active transaction — enlisted, no commit; otherwise a minted provider
with `BeginTransaction`/`CommitTransaction`):

```sql
-- (a) lock/create partition state rows, sorted order. SQL Server:
INSERT INTO __mj.WorkQueuePartitionState (SubscriptionID, PartitionKey)
SELECT @sub, @key
WHERE NOT EXISTS (SELECT 1 FROM __mj.WorkQueuePartitionState WITH (UPDLOCK, HOLDLOCK)
                  WHERE SubscriptionID = @sub AND PartitionKey = @key);
SELECT ID FROM __mj.WorkQueuePartitionState WITH (UPDLOCK, ROWLOCK)
WHERE SubscriptionID = @sub AND PartitionKey = @key;
-- PostgreSQL: INSERT … ON CONFLICT (SubscriptionID, PartitionKey) DO NOTHING; SELECT … FOR UPDATE;
```
Holding these row locks until commit is what makes **publish order per key** well-defined: two concurrent publishers
for the same key serialize here, so `PublishOrdinal` (assigned at insert, after the lock) is monotonic per key in
commit order, and a claimer's head re-check (§3.3) can never see ordinal 11 committed while ordinal 10 is still
in flight.

```sql
-- (b) per message, inside SAVE TRANSACTION wq_m{i} / SAVEPOINT (dialect savepoint SQL)
DECLARE @ins TABLE (ID uniqueidentifier, PublishOrdinal bigint);
INSERT INTO __mj.WorkQueueMessage
  (ID, TopicID, PartitionKey, Sequence, Attributes, Payload, PayloadRef, CorrelationID, PublishedByUserID)
OUTPUT inserted.ID, inserted.PublishOrdinal INTO @ins
SELECT @id, @topic, @key, @seq, @attrs, @payload, @payloadRef, @corr, @user
WHERE NOT EXISTS (SELECT 1 FROM __mj.WorkQueueMessage WITH (UPDLOCK, HOLDLOCK) WHERE ID = @id);
SELECT ID, PublishOrdinal FROM @ins;
```
- 0 rows → look up the existing row: same `TopicID` → `Duplicate`; different topic → `Rejected` `MessageIDConflict`.
- Unique violation on `UQ_WorkQueueMessage_Topic_Key_Sequence` (possible on PG under read committed) → roll back to
  savepoint → `Rejected` `DuplicateSequence`. SQL Server pre-checks the same condition under `UPDLOCK, HOLDLOCK` to avoid
  the exception path.
- Any other error on one message → roll back to savepoint → `Rejected` with `Retryable = true`; batch continues.

```sql
-- (c) deliveries for the message (one multi-row INSERT; ≤ 1000 rows per statement)
INSERT INTO __mj.WorkQueueDelivery (MessageID, SubscriptionID, Status, PartitionKey, OrderKey, VisibleAt)
VALUES (@id, @sub1, 'Pending', @keyOrNull1, @orderKey, SYSDATETIMEOFFSET()), …;
```
`OrderKey` = `Sequence` on `ExplicitSequence` topics, else `PublishOrdinal` from (b).

Commit → `Accepted`. After commit (or immediately when enlisted in a caller transaction — a premature kick is harmless),
kick local runtimes for affected subscriptions and emit the cross-instance kick (§3.7).

### 3.3 Claim (`DatabaseTransportConsumer.Receive`)

One claim cycle = `ExpireLeases(sub)` (§3.5, cheap, indexed) then the claim path(s) for the subscription's mode.

> **Deviation from the brief:** lease-expired `InFlight` rows are **not** reclaimed inside the claim statement. They are
> first transitioned by `ExpireLeases` (→ `Pending` or `DeadLettered`, fence cleared, partition state released), which
> every claim cycle runs for its own subscription and the sweeper runs globally. This keeps one code path for
> "absent update" handling across all partition modes, keeps the claim predicate index-friendly (`Status='Pending'`
> only), and keeps partition-state bookkeeping out of the hot `None` claim.

#### 3.3.1 `None` (and keyless deliveries on partitioned subscriptions)

SQL Server:
```sql
DECLARE @claimed TABLE (ID uniqueidentifier, MessageID uniqueidentifier, AttemptCount int,
                        LeaseToken uniqueidentifier, LeaseExpiresAt datetimeoffset(7), IsReplay bit);
WITH c AS (
  SELECT TOP (@n) *
  FROM __mj.WorkQueueDelivery WITH (UPDLOCK, READPAST, ROWLOCK)     -- Dialect.SkipLockedClaim().TableHint
  WHERE SubscriptionID = @sub
    AND Status = 'Pending'
    AND PartitionKey IS NULL
    AND VisibleAt <= SYSDATETIMEOFFSET()
  ORDER BY VisibleAt
)
UPDATE c SET
  Status          = 'InFlight',
  LeaseToken      = NEWID(),
  LeaseOwner      = @owner,
  LeaseExpiresAt  = DATEADD(SECOND, @leaseSeconds, SYSDATETIMEOFFSET()),
  LastHeartbeatAt = SYSDATETIMEOFFSET(),
  AttemptCount    = AttemptCount + 1,
  Progress        = NULL
OUTPUT inserted.ID, inserted.MessageID, inserted.AttemptCount, inserted.LeaseToken, inserted.LeaseExpiresAt, inserted.IsReplay
INTO @claimed;

SELECT c.ID AS DeliveryID, c.AttemptCount, c.LeaseToken, c.LeaseExpiresAt, c.IsReplay,
       m.ID AS MessageID, m.PartitionKey, m.Sequence, m.Attributes, m.Payload, m.PayloadRef, m.CorrelationID, m.PublishedAt
FROM @claimed c JOIN __mj.WorkQueueMessage m ON m.ID = c.MessageID;
```
PostgreSQL:
```sql
WITH c AS (
  SELECT "ID" FROM __mj."WorkQueueDelivery"
  WHERE "SubscriptionID" = $1 AND "Status" = 'Pending' AND "PartitionKey" IS NULL AND "VisibleAt" <= now()
  ORDER BY "VisibleAt" LIMIT $2
  FOR UPDATE SKIP LOCKED                                              -- Dialect.SkipLockedClaim().TrailingClause
)
UPDATE __mj."WorkQueueDelivery" d SET "Status" = 'InFlight', "LeaseToken" = gen_random_uuid(), …
FROM c WHERE d."ID" = c."ID"
RETURNING d."ID", d."MessageID", d."AttemptCount", d."LeaseToken", d."LeaseExpiresAt", d."IsReplay";
```
Driven by `IX_WorkQueueDelivery_Claim`. The `AttemptCount < MaxAttempts` predicate is unnecessary here: a `Pending` row
always has attempts remaining because `Retry` and `ExpireLeases` dead-letter at the limit, and `Replay` resets to 0.

`LeaseOwner` = the host instance ID (§5.3). `ReceivedDelivery.DeliveryID` = `Delivery.ID`; `LeaseToken` = the new GUID.

#### 3.3.2 `Exclusive` / `Ordered` (keyed deliveries)

Two steps. Step 1 is an unlocked **candidate** read; step 2 is the **authoritative** CAS. Correctness depends only on
step 2's row counts; step 1 only decides what is worth attempting.

**Step 1 — candidates** (`@k = 2 × requested`, then keep the first per key in TS):

```sql
SELECT TOP (@k) d.ID, d.PartitionKey, d.OrderKey
FROM __mj.WorkQueueDelivery d
JOIN __mj.WorkQueuePartitionState ps
  ON ps.SubscriptionID = d.SubscriptionID AND ps.PartitionKey = d.PartitionKey
WHERE d.SubscriptionID = @sub
  AND d.PartitionKey IS NOT NULL
  AND d.Status = 'Pending'
  AND d.VisibleAt <= SYSDATETIMEOFFSET()
  AND ps.InFlightDeliveryID IS NULL
  -- Ordered only:
  AND (ps.BlockedByDeliveryID IS NULL OR ps.BlockedByDeliveryID = d.ID)
  AND NOT EXISTS (SELECT 1 FROM __mj.WorkQueueDelivery e
                  WHERE e.SubscriptionID = d.SubscriptionID AND e.PartitionKey = d.PartitionKey
                    AND e.OrderKey < d.OrderKey
                    AND e.Status IN ('Pending','InFlight','DeadLettered'))
  -- Ordered + ExplicitSequence only:
  AND d.OrderKey = COALESCE(ps.LastCompletedSequence, 0) + 1
ORDER BY d.VisibleAt, d.OrderKey;
```
- `Exclusive` omits the three Ordered predicates: any visible pending delivery of an idle key.
- `BlockedByDeliveryID = d.ID` is what lets a **replayed** dead letter be claimed while its own block is still recorded
  (the block is cleared only when it completes or is discarded).
- A head in retry backoff (`Pending`, future `VisibleAt`) still counts in `NOT EXISTS` ⇒ the key waits (C19).

**Step 2 — claim each candidate** (one short transaction per candidate; minted provider):

```sql
-- 2a. CAS the key (locks the partition row first — lock order rule)
UPDATE __mj.WorkQueuePartitionState
SET InFlightDeliveryID = @d
WHERE SubscriptionID = @sub AND PartitionKey = @key
  AND InFlightDeliveryID IS NULL
  AND (@ordered = 0 OR BlockedByDeliveryID IS NULL OR BlockedByDeliveryID = @d);
-- rowcount 0 → ROLLBACK, skip (another worker owns the key, or it became blocked)

-- 2b. claim the delivery, re-verifying head conditions under the key lock
UPDATE __mj.WorkQueueDelivery
SET Status = 'InFlight', LeaseToken = NEWID(), LeaseOwner = @owner,
    LeaseExpiresAt = DATEADD(SECOND, @leaseSeconds, SYSDATETIMEOFFSET()),
    LastHeartbeatAt = SYSDATETIMEOFFSET(), AttemptCount = AttemptCount + 1, Progress = NULL
OUTPUT inserted.ID, inserted.MessageID, inserted.AttemptCount, inserted.LeaseToken, inserted.LeaseExpiresAt, inserted.IsReplay
INTO @claimed
WHERE ID = @d AND Status = 'Pending' AND VisibleAt <= SYSDATETIMEOFFSET()
  AND (@ordered = 0 OR NOT EXISTS (…same earlier-non-terminal predicate…))
  AND (@explicit = 0 OR OrderKey = (SELECT COALESCE(LastCompletedSequence,0) + 1
                                    FROM __mj.WorkQueuePartitionState
                                    WHERE SubscriptionID = @sub AND PartitionKey = @key));
-- rowcount 0 → ROLLBACK, skip;  1 → COMMIT, join message, return
```

**Why this is correct under contention.** Every writer that can change a key's head — publish (§3.2 a), settle (§3.4),
replay/discard/skip (§3.6), `ExpireLeases` (§3.5) — first takes the partition row lock. 2a takes the same lock
(blocking, not `READPAST`, so it waits for an in-flight publish of an earlier ordinal to commit), and 2b re-checks the
head predicates while holding it. Two workers racing on one key: one wins 2a, the other gets rowcount 0. A candidate
made stale between step 1 and step 2 fails 2a or 2b and is skipped. Nothing relies on step 1 being current.

**Contention.** Workers are unlikely to collide much because step 1 returns up to `2×` candidates across keys and the
TS layer shuffles candidates within equal `VisibleAt` buckets before attempting. Worst case (few hot keys, many
workers) degrades to wasted CAS attempts, never to double delivery. The per-candidate transaction is ≤ 2 statements.

**Known cost.** Step 1 scans pending rows of blocked keys on every cycle (they satisfy `Status='Pending' AND
VisibleAt<=now` but fail the join/`NOT EXISTS`). Acceptable at Database-transport volumes; if profiling shows otherwise,
add a denormalized `PartitionState.ReadyAt` (set when a key has a claimable head, cleared at claim) with a filtered
index, and drive step 1 from partition state. Tracked in §13.

**Receive composition.** For a partitioned subscription `Receive(max)` runs 3.3.2 for up to `max` and fills any remainder
with 3.3.1 (keyless deliveries).

#### 3.3.3 `AwaitingSequenceSince`

Not written by the claim path (it is a read path). The sweeper (§3.8) maintains it.

### 3.4 Settle operations (fenced)

All guards: `ID = @d AND LeaseToken = @token AND Status = 'InFlight'`. The fence is the **token, not the clock**: a
holder whose lease elapsed but has not been expired/reclaimed may still settle (C09) — nobody else owns it. Keyed
deliveries run in a transaction that updates `WorkQueuePartitionState` first; the delivery update's row count is
decisive (0 ⇒ rollback ⇒ `LeaseLost`).

| Operation | Partition state update (keyed only) | Delivery update |
|---|---|---|
| **Complete** | `InFlightDeliveryID = NULL WHERE InFlightDeliveryID = @d`; `BlockedByDeliveryID = NULL` if it equals `@d`; ExplicitSequence: `LastCompletedSequence = @orderKey` **when** `@orderKey = COALESCE(LastCompletedSequence,0)+1`, and clear `AwaitingSequenceSince`, `GapStalled` | `Status='Completed', CompletedAt=now, LeaseToken=NULL, LeaseOwner=NULL, LeaseExpiresAt=NULL` |
| **Retry** | `InFlightDeliveryID = NULL WHERE = @d` (Ordered head keeps its position — `OrderKey` unchanged) | `Status='Pending', VisibleAt=DATEADD(SECOND,@delay,now), LastError=@err`, lease cleared |
| **DeadLetter** | `InFlightDeliveryID = NULL`; Ordered: `BlockedByDeliveryID = @d`; Exclusive: nothing else | `Status='DeadLettered', DeadLetterReason=@reason, DeadLetteredAt=now, LastError=COALESCE(@err, LastError)`, lease cleared |
| **ExtendLease** | — (single statement, ops provider) | `LeaseExpiresAt=DATEADD(SECOND,@lease,now), LastHeartbeatAt=now, Progress=COALESCE(@progress, Progress)`; rowcount 1 ⇒ `'Held'`, 0 ⇒ `'Lost'` |
| **Release** | `InFlightDeliveryID = NULL WHERE = @d` | `Status='Pending', AttemptCount = CASE WHEN AttemptCount>0 THEN AttemptCount-1 ELSE 0 END, VisibleAt=now`, lease cleared |

`Progress` is JSON-serialized `WorkProgress`, truncated to 4000 chars (checkpoint dropped first if too large, with a warning).

`Retry` in the consumer never dead-letters on its own — the runtime chooses `DeadLetter` at max attempts (§2.2). The
consumer nevertheless adds `AND AttemptCount < @maxAttempts` defensively and returns `Failed` if violated.

### 3.5 `ExpireLeases`

The single implementation of "unexplained absence of an update".

**Keyless rows** (set-based, one statement per call; optional `@sub` filter):
```sql
UPDATE d SET
  Status           = CASE WHEN d.AttemptCount >= s.MaxAttempts THEN 'DeadLettered' ELSE 'Pending' END,
  DeadLetterReason = CASE WHEN d.AttemptCount >= s.MaxAttempts THEN 'LeaseExpired' ELSE d.DeadLetterReason END,
  DeadLetteredAt   = CASE WHEN d.AttemptCount >= s.MaxAttempts THEN SYSDATETIMEOFFSET() ELSE d.DeadLetteredAt END,
  VisibleAt        = SYSDATETIMEOFFSET(),
  LastError        = N'LeaseExpired',
  LeaseToken = NULL, LeaseOwner = NULL, LeaseExpiresAt = NULL
FROM __mj.WorkQueueDelivery d WITH (UPDLOCK, READPAST, ROWLOCK)
JOIN __mj.WorkQueueSubscription s ON s.ID = d.SubscriptionID
WHERE d.Status = 'InFlight' AND d.PartitionKey IS NULL
  AND d.LeaseExpiresAt < SYSDATETIMEOFFSET()
  AND (@sub IS NULL OR d.SubscriptionID = @sub);
```
(`IX_WorkQueueDelivery_Lease`.) An expired lease becomes visible immediately — the lease duration already served as the delay.

**Keyed rows:** select expired `(ID, SubscriptionID, PartitionKey)` without locks (TOP 500), then process each through the
standard keyed transaction (partition row first): same delivery transitions as above, guarded
`Status='InFlight' AND LeaseExpiresAt < now`; partition state `InFlightDeliveryID = NULL WHERE = @d`, and for
`Ordered` + dead-lettered: `BlockedByDeliveryID = @d`. Doing keyed rows one transaction each preserves the lock order;
the set-based form would lock delivery before partition and could deadlock with a concurrent settle.

Idempotent and safe on every instance: a row already transitioned fails the `Status='InFlight'` guard.

### 3.6 Operator operations (`DatabaseTransportOperator`)

All mutations take `actor` (user ID) and write an audit record (§6.4). Keyed deliveries lock the partition row first.

**Replay(deliveryID)**
```sql
UPDATE __mj.WorkQueueDelivery
SET Status='Pending', AttemptCount=0, IsReplay=1, VisibleAt=SYSDATETIMEOFFSET(),
    ResolvedByUserID=@actor, ResolutionNote=@note
WHERE ID=@d AND SubscriptionID=@sub AND Status='DeadLettered';
```
0 rows ⇒ `NotDeadLettered` error. Partition state untouched: an Ordered block stays until the replay completes (§3.4) —
the claim predicate admits `BlockedByDeliveryID = d.ID`. `DeadLetterReason`/`LastError` are retained until the next outcome.

**Discard(deliveryID, reason)**
```sql
-- keyed: partition row first
UPDATE __mj.WorkQueuePartitionState
SET BlockedByDeliveryID = CASE WHEN BlockedByDeliveryID = @d THEN NULL ELSE BlockedByDeliveryID END,
    LastCompletedSequence = CASE WHEN @explicit = 1 AND @orderKey = COALESCE(LastCompletedSequence,0)+1
                                 THEN @orderKey ELSE LastCompletedSequence END
WHERE SubscriptionID=@sub AND PartitionKey=@key;
UPDATE __mj.WorkQueueDelivery
SET Status='Discarded', CompletedAt=SYSDATETIMEOFFSET(), ResolvedByUserID=@actor, ResolutionNote=@reason
WHERE ID=@d AND SubscriptionID=@sub AND Status='DeadLettered';
```
`CompletedAt` records the terminal time for both `Completed` and `Discarded` (clarification of 03 §6.5 — §14).
Phase 1 only discards `DeadLettered` deliveries (not `Pending`).

**SkipSequence(key, sequence, reason)** — ExplicitSequence + Ordered subscriptions only. In one transaction:
1. Lock partition row. Require `COALESCE(LastCompletedSequence,0) = @seq - 1` else `SequenceNotNext`.
2. Require no delivery for `(sub, key)` with `OrderKey = @seq AND Status IN ('Pending','InFlight','DeadLettered')` else
   `SequencePresent` (operator must discard it instead).
3. `LastCompletedSequence = @seq, AwaitingSequenceSince = NULL, GapStalled = 0`.
A later publish of that sequence is still accepted (it is unique per topic) but its delivery can never become head; the
sweeper flags such rows as `Orphaned` in logs and they are discarded automatically with reason `SequenceSkipped`.

**ListDeadLetters** — keyset by `(DeadLetteredAt, ID)`; cursor = base64 JSON of the last pair. `BlocksKey` =
subscription is Ordered and `PartitionState.BlockedByDeliveryID = d.ID`.

**ListPartitions** — from `WorkQueuePartitionState` (keyset by `PartitionKey`) with:

| Condition (first match wins) | Rule |
|---|---|
| `InFlight` | `InFlightDeliveryID IS NOT NULL` |
| `Blocked` | `BlockedByDeliveryID IS NOT NULL` |
| `GapStalled` | `GapStalled = 1` |
| `AwaitingSequence` | `AwaitingSequenceSince IS NOT NULL` |
| `Idle` | otherwise |

`WaitingItems` = count of `Pending` deliveries for the key (correlated subquery, page-bounded). Filtering by condition
translates the rule to a `WHERE`.

**GetStats**
```sql
SELECT Status, COUNT(*) AS N FROM __mj.WorkQueueDelivery WHERE SubscriptionID=@sub
  AND Status IN ('Pending','InFlight','DeadLettered') GROUP BY Status;
SELECT COUNT(*) FROM __mj.WorkQueuePartitionState WHERE SubscriptionID=@sub AND BlockedByDeliveryID IS NOT NULL;
SELECT MIN(m.PublishedAt) FROM __mj.WorkQueueDelivery d JOIN __mj.WorkQueueMessage m ON m.ID=d.MessageID
  WHERE d.SubscriptionID=@sub AND d.Status='Pending';
SELECT COUNT(*) FROM __mj.WorkQueueDelivery WHERE SubscriptionID=@sub AND Status='Completed'
  AND CompletedAt >= DATEADD(HOUR,-1,SYSDATETIMEOFFSET());
```
`ParkedItems = 0`. `IngestBackstop` returns 0.

### 3.7 Wake-ups

- **Adaptive polling** per runtime: `IdlePollMinMs` (250) doubling to `IdlePollMaxMs` (5000) while empty; reset on work.
- **Local kick:** in-process `Publish` calls `WorkQueueWorkerService.Instance.Kick(subscriptionIDs)` → `ConsumerRuntime.Kick()`.
  The engine exposes a `OnPublished` event the worker subscribes to (no engine → MJServer dependency).
- **Cross-instance kick (optional, later):** `RedisLocalStorageProvider` exposes only cache-change pub/sub
  (`OnCacheChanged`, single `${prefix}:__pubsub__` channel — `packages/RedisProvider/src/RedisLocalStorageProvider.ts` 229, 808, 979);
  there is no general-purpose message channel. Phase 1 relies on polling (max idle latency 5 s by default). A follow-up
  adds a generic `Publish(channel, payload)` / `Subscribe(channel, cb)` to `RedisLocalStorageProvider` and a
  `wq:kick` channel carrying subscription IDs. Not required for correctness.

### 3.8 Sweeper (`DatabaseSweeper`)

Runs on every worker-enabled instance. Every step is set-based or per-row guarded, idempotent, and uses `READPAST`
where it scans hot tables so instances don't queue behind each other.

| Step | Cadence (config) | Action |
|---|---|---|
| S1 ExpireLeases | `sweeper.intervalMs` (30 s) | §3.5 for all subscriptions (claim cycles also do it per subscription) |
| S2 Repair partition state | 30 s | `InFlightDeliveryID` pointing at a delivery not `InFlight` → NULL; `BlockedByDeliveryID` pointing at a `Completed`/`Discarded`/`Pending`-non-replay delivery → NULL (+ advance sequence mark per Discard rule). Each repair logs a warning with IDs — repairs indicate a bug |
| S3 Sequence awareness | 30 s | For ExplicitSequence Ordered subs: keys with no in-flight, no block, and `MIN(OrderKey of Pending) > COALESCE(LastCompletedSequence,0)+1` → set `AwaitingSequenceSince = COALESCE(AwaitingSequenceSince, now)`; keys whose condition cleared → NULL. `GapStalled = 1` when `SequenceGapAlertSeconds` is set and exceeded (logged at warn once per transition) |
| S4 Skipped-sequence orphans | 30 s | `Pending` deliveries with `OrderKey <= LastCompletedSequence` on ExplicitSequence keys → `Discarded`, `ResolutionNote='SequenceSkipped'` |
| S5 Retention purge | `sweeper.retentionIntervalMs` (10 min) | Chunks of `purgeChunkSize` (1000): `DELETE TOP (@n) FROM WorkQueueDelivery WITH (READPAST) WHERE Status IN ('Completed','Discarded') AND CompletedAt < DATEADD(DAY, -@retentionDays, now) AND SubscriptionID IN (topic's subs)`; then `DELETE TOP (@n) m FROM WorkQueueMessage m WITH (READPAST) WHERE m.TopicID=@topic AND m.PublishedAt < cutoff AND NOT EXISTS (SELECT 1 FROM WorkQueueDelivery d WHERE d.MessageID = m.ID)`; loop until a chunk returns < n or a per-run time budget (20 s) is spent |
| S6 Partition state purge | with S5 | Delete rows for **Exclusive** subs, and **Ordered + PublishOrder** subs, with no in-flight, no block, no non-terminal deliveries, `__mj_UpdatedAt < cutoff`. **Never** for ExplicitSequence topics |

Dead-lettered deliveries and their messages are never purged automatically.

---

## 4. `WorkQueueEngine`, handlers, validation

### 4.1 Engine

```ts
export class WorkQueueEngine extends BaseEngine<WorkQueueEngine> implements IWorkPublisher {
  public static get Instance(): WorkQueueEngine;
  public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void>;
  public get Transports(): MJWorkQueueTransportEntity[];
  public get Topics(): MJWorkQueueTopicEntity[];
  public get Subscriptions(): MJWorkQueueSubscriptionEntity[];

  public GetTopicBinding(topicName: string): TopicBinding;
  public GetSubscriptionBinding(subscriptionName: string): SubscriptionBinding;
  public async GetDriver(transportID: string, contextUser: UserInfo): Promise<ITransportDriver>;   // cached per transport

  public Publish<T extends WorkJson>(topic: string, requests: PublishRequest<T>[]): Promise<PublishResult[]>;       // IWorkPublisher (uses bound context user)
  public PublishAs<T extends WorkJson>(topic: string, requests: PublishRequest<T>[], options: WorkQueuePublishOptions): Promise<PublishResult[]>;
  public readonly OnPublished: WorkQueueEvent<{ SubscriptionIDs: string[] }>;

  public ValidateTopology(): BindingValidationIssue[];                           // metadata-only rules (§4.3)
  public async ValidateBindings(contextUser: UserInfo): Promise<BindingValidationIssue[]>;   // driver.ValidateBindings per topic
  public ExportManifest(transportName: string): TopologyManifest;
  public async ImportBindings(input: BindingImport, contextUser: UserInfo): Promise<void>;
}

export interface WorkQueuePublishOptions {
  ContextUser: UserInfo;
  /** Database transport: when this provider has an active transaction the publish enlists in it. */
  Provider?: IMetadataProvider;
}
```
- Loads `MJ: Work Queue Transports`, `MJ: Work Queue Topics`, `MJ: Work Queue Subscriptions` via `BaseEngine.Load`
  (`packages/MJCore/src/generic/baseEngine.ts:573`), auto-refreshing on entity save events.
- `Publish` (the `IWorkPublisher` form) exists for symmetry; MJ code should call `PublishAs` so the actor is explicit.
  (The 03 signature `Publish(topic, requests, { ContextUser, Provider? })` is realized as `PublishAs` because
  `IWorkPublisher.Publish` has two parameters — §14.)
- Driver factories resolve through `MJGlobal.Instance.ClassFactory.TryCreateInstance(BaseTransportDriverFactory, transport.DriverClass)`;
  unresolved ⇒ publish returns `Rejected` `TransportUnavailable` (`Retryable: false`) and `ValidateTopology` reports an error.
- Credentials: `Transport.CredentialID` ⇒ `CredentialEngine.Instance.getCredential(...)`
  (`packages/Credentials/Engine/src/CredentialEngine.ts:239`) passed to the factory; null ⇒ ambient identity.

```ts
export abstract class BaseTransportDriverFactory {
  abstract Create(transport: MJWorkQueueTransportEntity, credential: Record<string, string> | null,
                  deps: TransportDriverDeps): Promise<ITransportDriver>;
}
export interface TransportDriverDeps { ProviderFactory: ProviderFactory; InstanceID: string; Log: WorkLogger; }
```

### 4.2 Handlers

```ts
export interface WorkHandlerExecutionContext { ContextUser: UserInfo; Provider: IMetadataProvider; }

export abstract class BaseWorkHandler<TPayload extends WorkJson = WorkJson> implements WorkHandler<TPayload> {
  protected ContextUser!: UserInfo;
  protected Provider!: IMetadataProvider;
  /** Called by the host before Handle. Public so the host can bind; not for handler authors. */
  public BindExecutionContext(ctx: WorkHandlerExecutionContext): void;
  abstract Handle(message: WorkMessage<TPayload>, context: WorkContext): Promise<WorkOutcome>;
}
```
(`BindExecutionContext` is an addition to 03 — §14.)

- **Instantiation:** per delivery, `TryCreateInstance<BaseWorkHandler>(BaseWorkHandler, subscription.HandlerKey)`.
  `BaseWorkHandler` is marked `@RequiresSubclass()` so an unresolved key returns `Instance: null`
  (`packages/MJGlobal/src/ClassFactory.ts` ~45–74).
- **Unregistered handler — decision: the host does not consume that subscription.** Resolution is checked once when the
  worker starts (and on each topology reconcile). If the key does not resolve locally, the worker logs an error, reports
  the subscription as `HandlerNotRegistered` in health, and does **not** start a runtime for it.
  *Why not dead-letter:* it is a deployment/config fault on this host, not a property of the messages — dead-lettering
  would poison every message and, for `Ordered`, block every key. *Why not pause the subscription:* another instance may
  have the handler; a global pause from one misconfigured host would stop healthy consumers. Deliveries simply wait,
  visible as backlog in stats. Handler constructor exceptions or a per-delivery resolution failure (should not happen after
  the startup check) are thrown errors ⇒ `Retry`.
- **Provider & user:** a fresh provider per delivery from the host `ProviderFactory` (separate from the queue-ops providers,
  so handler transactions never mix with settle transactions); `ContextUser` = `workQueue.systemUserEmail` resolved from
  `UserCache` (pattern: `packages/MJServer/src/services/IntegrationSyncWorkerService.ts:50`). Per-subscription run-as users
  are a follow-on.

### 4.3 Validation

Implemented in `WorkQueueEngine.ValidateTopology()` and enforced on save by server-side entity subclasses registered in the
engine package — `@RegisterClass(BaseEntity, 'MJ: Work Queue Topics')` / `'MJ: Work Queue Subscriptions'` extending the
generated classes and overriding `Validate()` (errors ⇒ `ValidationErrorType.Failure`, warnings ⇒ `Warning`,
`packages/MJGlobal/src/ValidationTypes.ts`).

| Rule | Severity |
|---|---|
| `HostType='MJWorker'` ⇒ `HandlerKey` non-empty | Error |
| `HostType='External'` ⇒ transport `DriverClass <> 'Database'` (W9) | Error |
| `HostType='External'` and `ExternalRef` empty | Warning |
| `Filter` parses per 03 §4 and within limits | Error |
| AWS transport (`DriverClass='AWS'`) and (`PartitionMode<>'None'` on any subscription **or** topic `OrderingMode='ExplicitSequence'`) ⇒ topic `IsFifo=1` (W7) — checked on topic save and subscription save | Error |
| Database transport and `IsFifo=1` | Warning (meaningless) |
| `SequenceGapAlertSeconds` set ⇒ `PartitionMode='Ordered'` and topic `ExplicitSequence` | Error |
| `BackoffMaxSeconds >= BackoffBaseSeconds`; `LeaseSeconds >= 5` | Error |
| `MaxProcessingSeconds` > host ceiling (MJWorker: none; External with `ExternalRef` starting `arn:aws:lambda:`: 900) | Warning (D5) |
| `HeartbeatMode='Auto'`, `MaxProcessingSeconds` null, HostType External on AWS | Warning ("no processing cap") |
| Changing `PartitionMode`, `TopicID`, or topic `OrderingMode` while non-terminal deliveries exist (Database transport) | Error |
| Deleting a subscription/topic with non-terminal deliveries | Error (disable instead) |
| Topic `Name` / subscription `Name` pattern `^[a-z0-9]+([.-][a-z0-9]+)*$`, ≤ 200 chars (AWS resource-name safe) | Error |

---

## 5. Worker host service (MJServer)

### 5.1 Config (`packages/MJServer/src/config.ts`)

Follows `scheduledJobsSchema` / `integrationSyncWorkerSchema` (~147–170, registered ~559–560, types ~619–620):

```ts
const workQueueSubscriptionSchema = z.object({
  name: z.string(),                                  // subscription Name or '*'
  concurrency: z.number().int().min(1).optional().default(4),
  receiveBatchSize: z.number().int().min(1).max(100).optional().default(10),
});

const workQueueSchema = z.object({
  /** Worker master switch. Publishing and operator APIs work regardless (they only need the engine). */
  enabled: z.boolean().optional().default(false),
  systemUserEmail: z.string().optional().default('system@memberjunction.org'),
  instanceID: z.string().optional(),
  /** Explicit names win over '*'. '*' = every Active/Paused MJWorker subscription whose handler resolves locally. */
  subscriptions: z.array(workQueueSubscriptionSchema).optional().default([{ name: '*', concurrency: 4, receiveBatchSize: 10 }]),
  idlePollMinMs: z.number().optional().default(250),
  idlePollMaxMs: z.number().optional().default(5000),
  sqsWaitSeconds: z.number().int().min(0).max(20).optional().default(20),   // MJ-hosted AWS subscriptions (05)
  reconcileIntervalMs: z.number().optional().default(30000),
  /** Must stay below serve()'s 10 s forced-exit window. */
  shutdownDrainMs: z.number().optional().default(7000),
  sweeper: z.object({
    enabled: z.boolean().optional().default(true),
    intervalMs: z.number().optional().default(30000),
    retentionIntervalMs: z.number().optional().default(600000),
    purgeChunkSize: z.number().optional().default(1000),
  }).optional().default({}),
});
// configInfoSchema: workQueue: workQueueSchema.optional().default({}),
export type WorkQueueConfig = z.infer<typeof workQueueSchema>;
```

### 5.2 Boot wiring (`packages/MJServer/src/index.ts`)

After `httpServer.listen` and the existing post-listen recovery calls (~1517–1590), alongside `StartTaskGraphDispatcher`:

```ts
if (resumeUser) {
  // Engine always configured: publish + operator paths need it even when this host runs no workers.
  await WorkQueueEngine.Instance.Config(false, resumeUser);
  // Entity AI Action dispatch seam (§10) — registered on every host that has the engine.
  EntityAIActionDispatchRegistry.Instance.Register(new WorkQueueEntityAIActionDispatcher());
  if (configInfo.workQueue?.enabled) {
    StartWorkQueueWorker(configInfo.workQueue, serverProviderFactory)
      .catch(err => console.warn(`[WorkQueueWorker] Startup failed: ${err}`));
  }
}
```
`StartWorkQueueWorker` (`packages/MJServer/src/services/WorkQueueWorkerService.ts`) must not throw into `serve()` (the
existing services' "don't prevent the API from serving" rule, index.ts ~1484–1504).

**Provider factory.** `TaskGraphProviderFactory` is SQL Server-only by design and its header says the right move for PG
is to lift the branch out of `context.ts` (`createPerRequestProviders`, `packages/MJServer/src/context.ts:780`). Phase 1
does that lift into `services/ServerProviderFactory.ts` (SQL Server + PostgreSQL) and uses it for the work queue;
`TaskGraphProviderFactory` is left untouched (TaskGraph is out of scope, D10).

### 5.3 `WorkQueueWorkerService`

```ts
export class WorkQueueWorkerService implements IShutdownable {
  constructor(config: WorkQueueConfig, providerFactory: ProviderFactory, contextUser: UserInfo, instanceID: string);
  Start(): Promise<void>;         // resolve subscriptions, start runtimes + sweeper, subscribe to engine OnPublished/refresh
  Shutdown(): Promise<void>;      // stop sweeper; Stop() all runtimes in parallel (each bounded by shutdownDrainMs)
  Kick(subscriptionIDs: string[]): void;
  GetStatus(): WorkQueueWorkerStatus;
}
export interface WorkQueueWorkerStatus {
  InstanceID: string;
  Runtimes: { Subscription: string; State: 'Running' | 'Paused' | 'HandlerNotRegistered' | 'Error'; InFlight: number;
              Concurrency: number; LastReceiveAt: string | null; LastError: string | null }[];
  Sweeper: { LastRunAt: string | null; LastError: string | null };
}
```
- **Instance identity:** `config.instanceID ?? \`${HOSTNAME ?? 'mjapi'}-${pid}-${randomBytes(4).toString('hex')}\`` — the same
  reasoning as `defaultInstanceID()` in `packages/MJServer/src/services/StartTaskGraphDispatcher.ts` (host+pid collide in
  containers). Stored as `LeaseOwner`; used only for diagnostics (the fence is `LeaseToken`).
- **Subscription selection:** subscriptions with `HostType='MJWorker'`, `Status IN ('Active','Paused')`, matched by explicit
  name or `'*'`. Subscriptions on AWS transports use the AWS consumer with SQS long-poll (05). A `Paused` subscription has its
  runtime stopped (not receiving) and resumes on reconcile.
- **Reconcile:** on engine refresh and every `reconcileIntervalMs`: start runtimes for new/re-activated subscriptions, stop
  removed/Disabled ones (graceful `Stop()`), restart a runtime whose policy fields changed (new policy applies to new claims).
- **Shutdown:** `ShutdownRegistry.Instance.Register(this)` (`packages/MJGlobal/src/ShutdownRegistry.ts:55`). `gracefulShutdown`
  drains the registry (~1594–1656) inside its 10 s window, hence `shutdownDrainMs` default 7000.
- **Health:** the Server Extension's `HealthCheck()` (§6) includes `GetStatus()` via the extension services registry key
  `workQueue.worker` (the service registers itself there when an extension context exists), surfacing at `/health/extensions`.

---

## 6. Server Extension (`@memberjunction/work-queue-server`)

### 6.1 Registration & config

```ts
@RegisterClass(BaseServerExtension, 'WorkQueueServerExtension')
export class WorkQueueServerExtension extends BaseServerExtension {
  public override get DefaultPhase(): ServerExtensionPhase { return 'post-auth'; }
  async Initialize(app: Application, config: ServerExtensionConfig): Promise<ExtensionInitResult>;
  async Shutdown(): Promise<void>;
  async HealthCheck(): Promise<ExtensionHealthResult>;
}
```
Post-auth: MJ unified auth (`packages/MJServer/src/context.ts` ~680–704) has already attached `req.userPayload`
(`UserPayload`, including `apiKeyHash`) and `req['mjUser']`. The pattern mirrors `SlackMessagingExtension`
(`packages/MessagingAdapters/src/slack/SlackMessagingExtension.ts`), which is pre-auth because Slack signs its own calls.

```js
// mj.config.cjs
serverExtensions: [{
  Enabled: true,
  DriverClass: 'WorkQueueServerExtension',
  RootPath: '/work-queue',
  Phase: 'post-auth',
  Settings: {
    MaxMessagesPerRequest: 100,
    MaxRequestBytes: 30_000_000,     // 100 × 256 KB + overhead
    ApplicationName: 'MJAPI',        // APIKeyEngine application for scope checks
  },
}],
```
`RootPath` must not collide with `coreReservedServerExtensionRoots` (`packages/MJServer/src/serverExtensionReservedRoots.ts:43`).

### 6.2 Routes (03 §7)

Mounted on an `express.Router` under `RootPath` with `express.json({ limit: MaxRequestBytes })` scoped to the router
(no raw body needed — callers authenticate with MJ credentials, not signatures).

Request pipeline per route:
1. `req['mjUser']` present, else `401`.
2. **Scope check** (API-key callers only — bearer/JWT callers are governed by entity permissions in step 3), modeled on
   `ResolverBase.CheckAPIKeyScopeAuthorization` (`packages/MJServer/src/generic/ResolverBase.ts` ~832–900):
   `full_access` probe with `skipLogging`, then `APIKeyEngine.Authorize(apiKeyHash, ApplicationName, scopePath, resource, systemUser, { endpoint, method })`.
3. **Entity permission check:** publish requires `CanCreate` on `MJ: Work Queue Messages`; operate requires `CanUpdate` on
   `MJ: Work Queue Deliveries`; read requires `CanRead` on `MJ: Work Queue Subscriptions` — so non-API-key users are governed
   by normal MJ roles. (The permission checks are metadata checks; the engine writes with direct SQL.)
4. Validate params/body; call the engine / operator service with `contextUser = req['mjUser']`.

| Route | Scope path (see §14) | Resource | Handler |
|---|---|---|---|
| `POST /topics/:topic/messages` | `workqueue:publish` | topic name | `WorkQueueEngine.PublishAs` |
| `GET /subscriptions/:sub/stats` | `workqueue:read` | subscription name | operator `GetStats` |
| `GET /subscriptions/:sub/dead-letters` | `workqueue:read` | subscription | `ListDeadLetters` |
| `POST /subscriptions/:sub/dead-letters/:deliveryId/replay` | `workqueue:operate` | subscription | `Replay` |
| `POST /subscriptions/:sub/dead-letters/:deliveryId/discard` | `workqueue:operate` | subscription | `Discard` |
| `GET /subscriptions/:sub/partitions` | `workqueue:read` | subscription | `ListPartitions` |
| `POST /subscriptions/:sub/partitions/:key/skip-sequence` | `workqueue:operate` | subscription | `SkipSequence` |
| `POST /subscriptions/:sub/backstop/ingest` | `workqueue:operate` | subscription | `IngestBackstop` |
| `GET /topology/manifest` | `workqueue:read` | transport name | `ExportManifest` |

`:key` is URL-encoded; the server decodes once.

**Publish semantics.**
- Whole-request failures: malformed JSON / not an array / 0 or > `MaxMessagesPerRequest` ⇒ `400 { Code: 'InvalidRequest' }`;
  unknown topic ⇒ `404 TopicNotFound`; scope/permission ⇒ `403 Forbidden`.
- Otherwise `202 { Results }` positionally aligned, even when some items are `Rejected`. The caller treats
  `Accepted` and `Duplicate` as success.
- `202` is returned **only after** the transport accepted (Database: transaction committed; AWS: `PublishBatch` succeeded
  for those entries).
- Transport outage (DB connection error, SNS 5xx after SDK retries) ⇒ items `Rejected` with `TransportUnavailable`,
  `Retryable: true`; if **every** item failed that way the route returns `503` with `Retry-After: 5` so generic webhook
  relays retry.

### 6.3 Operator service

`WorkQueueOperatorService` (engine package) wraps `ITransportOperator` resolution per subscription and applies
authorization-independent rules (e.g. `SkipSequence` only on ExplicitSequence Ordered subscriptions). Both the REST routes
and the CLI call it, so behavior is identical.

### 6.4 Audit

Every operator mutation writes an `MJ: Audit Logs` row with a new Audit Log Type `Work Queue Operator Action` (metadata,
§8.4): `Details` JSON `{ Operation, Subscription, DeliveryID?, PartitionKey?, Sequence?, Reason?, Note? }`. On the Database
transport `ResolvedByUserID` / `ResolutionNote` are also stamped on the delivery.

---

## 7. CLI — `mj queue`

**Decision: the CLI calls the engine directly (DB connection from `mj.config.cjs`), not the REST API.**
- Every DB-touching `mj` command already works this way (bootstrap-lite loaded in the prerun hook unless the command is in
  `LIGHT_COMMANDS`, `packages/MJCLI/src/light-commands.ts`).
- Operators need these commands most when MJAPI is unhealthy.
- `export-topology` / `import-bindings` / `validate-bindings` are deployment-pipeline steps that run where no API is up.
- Behavior parity with REST comes from sharing `WorkQueueOperatorService`.
AWS-backed operator commands additionally need AWS credentials on the operator machine (ambient or via the Transport's
credential); documented in 05.

**Structure:** thin oclif shims in `packages/MJCLI/src/commands/queue/*.ts` re-exporting plugins from
`@memberjunction/work-queue-engine/plugins` (built on `BaseCLIPlugin`, `packages/CLICore/src/base-cli-plugin.ts`),
the pattern of `packages/MJCLI/src/commands/sync/push.ts`. None are light commands. All support `--format json|table`.

| Command | Flags | Notes |
|---|---|---|
| `mj queue topics` | `--transport` | name, transport, ordering, FIFO, subscription count |
| `mj queue subscriptions` | `--topic` | name, mode, host, status, handler/external ref |
| `mj queue stats` | `--subscription` (repeatable, default all) | `SubscriptionStats` |
| `mj queue dead-letters list` | `--subscription`, `--page-size`, `--cursor` | |
| `mj queue dead-letters replay` | `--subscription`, `--id` (repeatable) or `--all`, `--note` | `--all` requires `--yes` |
| `mj queue dead-letters discard` | `--subscription`, `--id`, `--reason` (required) | |
| `mj queue partitions list` | `--subscription`, `--condition` | |
| `mj queue partitions skip-sequence` | `--subscription`, `--key`, `--sequence`, `--reason` | |
| `mj queue backstop ingest` | `--subscription` | AWS only |
| `mj queue export-topology` | `--transport`, `--out` | writes `TopologyManifest` JSON |
| `mj queue import-bindings` | `--file`, `--dry-run` | writes `BindingConfig` on topics/subscriptions |
| `mj queue validate-bindings` | `--transport` | exit code 1 on any `Error` issue (CI gate) |

Operator actions in the CLI run as the user resolved from `mj.config.cjs` CLI context (system user by default) and are audited.

---

## 8. Migration & metadata

### 8.1 Migration

- File: `migrations/v6/V<YYYYMMDDHHMM>__v6.<next>.x__Work_Queue_Core.sql`. Timestamp from `date +"%Y%m%d%H%M"`; the minor
  version is one above the newest file in `migrations/v6/` at authoring time (on 2026-09-16 the newest is
  `V202609142100__v6.2.x__…`, so `v6.3.x` — re-check at authoring). The folder is derived from the filename's major version
  (`migrations/CLAUDE.md`).
- **Hand-written DDL at top:** the six `CREATE TABLE`s from 03 §6 with PKs, FKs, CHECK constraints (simple
  `IN (…)` / comparison forms CodeGen parses), defaults, the non-FK indexes listed in 03, and `sp_addextendedproperty`
  descriptions for every table and column. **Not** included: `__mj_CreatedAt/__mj_UpdatedAt`, single-column FK indexes
  (CodeGen generates `IDX_AUTO_MJ_FKEY_*`), views, procs, EntityField rows.
- `WorkQueueMessage`: `CONSTRAINT PK_WorkQueueMessage PRIMARY KEY NONCLUSTERED (ID)` and
  `CREATE UNIQUE CLUSTERED INDEX CIX_WorkQueueMessage_PublishOrdinal ON …(PublishOrdinal)`.
- Filtered indexes (`WHERE Sequence IS NOT NULL`, `WHERE PartitionKey IS NOT NULL`, `WHERE Status = 'InFlight'`) — the PG
  converter handles partial indexes; the build engineer owns the PG counterpart (no `migrations-pg` file in this PR).
- Then **≥ 50 blank lines**, the CodeGen comment block, and the appended CodeGen output from `mj codegen` (entity rows,
  EntityField INSERTs with the apply-time `COALESCE(MAX(Sequence),0)+1` expression, views, `spCreate/Update/Delete`,
  permissions). Delete the standalone `CodeGen_Run_*.sql`. Run `node .github/scripts/check-migration-entityfield-sequence.mjs`.
- `npm run check:codegen-tail` must pass (new-table migrations ship their generated entity).

### 8.2 Order of operations (one database per agent)

Confirm no other session uses `DB_DATABASE` (or use the `bootstrap-clean-db` skill for a private DB), then:
1. `mj migrate` (hand DDL only, generated section not yet appended)
2. `mj sync push` (metadata in §8.3–8.4 — entity flags need the entity rows, so run CodeGen first for new entities; see note)
3. `mj codegen`
4. `mj sync push` again (entity-setting overrides for the now-existing entities)
5. append CodeGen output to the migration; rebuild `@memberjunction/core-entities`, engine, server packages.

Note: `migrations/CLAUDE.md` requires `mj sync push` before `mj codegen` so JSONType definitions are current; the second push
applies entity-level overrides that reference entities CodeGen just created. Verify with the metadata-sync owner whether the
`metadata/entities` override file can be applied in the first push via `@lookup` deferral (§13).

### 8.3 Entity settings (`metadata/entities/.work-queue-entities.json`)

Pattern: `metadata/entities/.audit-related-entities.json`.

| Entity | TrackRecordChanges | TrustServerCacheCompletely | AllowDirectSQLInsert/Update/Delete | AllowUserSearchAPI |
|---|---|---|---|---|
| `MJ: Work Queue Transports` / `Topics` / `Subscriptions` | true | (default) | false | false |
| `MJ: Work Queue Messages` / `Deliveries` / `Partition States` | **false** | **false** | **true** | false |

Runtime entities' generated `spCreate/Update/Delete` stay (read-only API exposure is enforced by permissions: only the
`Developer`/`Integration` roles get read; nobody gets create/update/delete through the API).

### 8.4 Metadata records

All primary keys via CLI `uuidgen`; no `sync` blocks; no per-PR sync migration (`metadata/CLAUDE.md` rule 1b).

| File | Records |
|---|---|
| `metadata/api-scopes/.work-queue-scopes.json` | `workqueue` (parent, Category `Work Queue`), `workqueue:publish` (ResourceType `Topic`), `workqueue:read`, `workqueue:operate` (ResourceType `Subscription`) — naming follows the existing lowercase `query:run` / `agent:execute` paths (`metadata/api-scopes/.api-scopes.json`) |
| `metadata/api-application-scopes/…` | grant ceilings for `MJAPI` |
| `metadata/audit-log-types/…` (verify folder) | `Work Queue Operator Action` |
| `metadata/work-queue/.transports.json` | `Database` transport (`DriverClass: 'Database'`) |
| `metadata/work-queue/.topics.json` | `mj.entity-ai-actions` (Database, PublishOrder, RetentionDays 7) |
| `metadata/work-queue/.subscriptions.json` | `mj.entity-ai-actions.execute` (§10.3) |
| `metadata/entities/.queue-deprecation.json` | `MJ: Queue Types`, `MJ: Queues`, `MJ: Queue Tasks` → `Status: 'Deprecated'` (§10.5) |
| `metadata/entity-permissions/…` | read permissions for runtime entities; full CRUD for admins on Transports/Topics/Subscriptions |

`metadata/work-queue/.mj-sync.json` entity routing must be added (and `metadata/.mj-sync.json` directory order: transports →
topics → subscriptions).

### 8.5 Changeset

The branch adds a migration and metadata ⇒ **`minor`** (`.claude/rules/changesets.md`). New packages start at the
workspace's fixed version. Run `npm run check:changeset`.

---

## 9. Class registration & the AWS SDK footprint

- Generated manifests (`packages/ServerBootstrap/src/generated/mj-class-registrations.ts`, produced by
  `mj codegen manifest` / `CodeGenLib/src/Manifest/GenerateClassRegistrationsManifest.ts`, which walks the app's transitive
  dependencies) import every `@RegisterClass` so tree-shaking can't drop them. Adding
  `@memberjunction/work-queue-engine` and `@memberjunction/work-queue-server` to `packages/ServerBootstrap/package.json`
  registers: `Database` driver factory, `AWS` driver factory shim, entity subclasses, `WorkQueueServerExtension`, and the
  built-in `EntityAIAction` handler. `ServerBootstrapLite` gets the engine only (CLI needs operator/export; no extension).
- **AWS decision:** `@memberjunction/work-queue-aws` cannot itself use `@RegisterClass` (it has no MJ dependency, so Lambdas
  stay thin). The MJ registration shim `AWSTransportDriverFactory` lives in the engine
  (`engine/src/transports/aws/AWSTransportDriverFactory.ts`) and imports the AWS package, so every MJ server install carries
  `@aws-sdk/client-sns`, `client-sqs`, `client-dynamodb`.
  - Precedent: `@memberjunction/storage` already ships `@aws-sdk/client-s3` on every server (`packages/MJStorage/package.json:27`).
  - Dynamic `import()` is prohibited by repo rules, so lazy loading is not an option. Clients are **constructed** lazily
    (on first driver creation), so non-AWS deployments pay install size and module load only.
  - Alternative (rejected for Phase 1): a separate `@memberjunction/work-queue-aws-mj` registration package that deployments add
    to their MJAPI `package.json`. It saves the install footprint but requires every AWS deployment to regenerate its app
    manifest and adds a package; revisit if server image size becomes a concern (Azure will follow the same decision).
- Handlers written by applications register in their own packages; the app manifest picks them up the same way.

---

## 10. `MJQueue` replacement

### 10.1 Current state (verified)

- `GenericDatabaseProvider.HandleEntityAIActions` → `EnqueueAfterSaveAIAction(p, user)` →
  `QueueManager.AddTask('Entity AI Action', params, null, user)` (`packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts` ~557–609).
- `SQLServerDataProvider.EnqueueAfterSaveAIAction` defers into `_deferredTasks` during a transaction and otherwise calls
  `QueueManager.AddTask` (~1015–1025); `processDeferredTasks` calls it after commit (~2546–2566).
- Driver: `EntityAIActionQueue` → `AIEngine.Instance.ExecuteEntityAIAction(task.Data)` (`packages/MJQueue/src/drivers/AIActionQueue.ts`).
- `params` is `EntityAIActionParams { entityAIActionId, entityRecord: BaseEntity, actionId, modelId }` — **holds a live entity
  object**, not serializable.
- The DB insert path is broken today (`CK_QueueTask_Status` rejects `'Pending'`; `Status nchar(10)` can't hold `'In Progress'`),
  documented in `packages/TestingFramework/integration-test-suite/src/checks/queue.checks.ts` header.

### 10.2 Seam (dependency direction)

`GenericDatabaseProvider` sits low in the graph; the work-queue engine depends on `MJCore`/entities and must not be imported by
it. Same shape as `DurableEntityActionRegistry` (`packages/Actions/Base/src/DurableEntityActionSubmitter.ts`):

```ts
// packages/GenericDatabaseProvider/src/EntityAIActionDispatch.ts
export type EntityAIActionDispatchRequest = {
  EntityAIActionID: string; ActionID: string; ModelID: string;
  EntityName: string; PrimaryKey: string;        // CompositeKey.ToConcatenatedString()
  ContextUser: UserInfo;
  /** Present when the caller is inside a transaction on this provider; dispatcher may enlist. */
  Provider?: IMetadataProvider;
};
export type EntityAIActionDispatcher = { Dispatch(request: EntityAIActionDispatchRequest): Promise<void> };
export class EntityAIActionDispatchRegistry extends BaseSingleton<EntityAIActionDispatchRegistry> {
  public static get Instance(): EntityAIActionDispatchRegistry;
  public Register(d: EntityAIActionDispatcher): void;
  public get Dispatcher(): EntityAIActionDispatcher | null;
}
```
- `GenericDatabaseProvider.EnqueueAfterSaveAIAction` builds the request (serializing the record to entity name + primary key)
  and calls the registered dispatcher. **No dispatcher registered** (CLI, tests, non-MJServer hosts): run inline
  fire-and-forget `AIEngine.Instance.ExecuteEntityAIAction(params)` with a one-time warning — today's effective behavior without
  the broken persistence.
- `SQLServerDataProvider`: when a dispatcher is registered, pass `Provider: this` while a transaction is active so the Database
  transport publish **enlists in the save transaction** (transactional outbox — the AI action is published iff the save commits;
  today a crash between commit and `processDeferredTasks` loses it). The `_deferredTasks` path is kept only for the no-dispatcher
  inline fallback.
- `@memberjunction/queue` is removed from both providers' `package.json`.

### 10.3 Topic, subscription, handler

| Item | Value |
|---|---|
| Topic | `mj.entity-ai-actions`, transport `Database`, `PublishOrder`, `RetentionDays` 7 |
| Subscription | `mj.entity-ai-actions.execute`, `HostType` `MJWorker`, `HandlerKey` `EntityAIAction` |
| Partition mode | **`Exclusive`**, key = `${EntityAIActionID}|${EntityName}|${PrimaryKey}` — two rapid saves of the same record must not run the same AI action concurrently and race on the output field; different records/actions run in parallel |
| Policy | `MaxAttempts` 3, backoff 30 s → 600 s, `LeaseSeconds` 120, `HeartbeatMode` `Auto`, `MaxProcessingSeconds` 900 |
| Payload | `{ EntityAIActionID, ActionID, ModelID, EntityName, PrimaryKey }`; `Attributes: { entity: EntityName }` |
| Dispatcher | `WorkQueueEntityAIActionDispatcher` → `WorkQueueEngine.PublishAs('mj.entity-ai-actions', [req], { ContextUser, Provider })` |
| Handler | `@RegisterClass(BaseWorkHandler, 'EntityAIAction')`: load the entity via `this.Provider.GetEntityObject(EntityName, ContextUser)` + `InnerLoad(CompositeKey)`; missing record ⇒ `Complete` (deleted since save; nothing to do); `AIEngine.Instance.Config(false, ContextUser)`; `ExecuteEntityAIAction({ entityAIActionId, entityRecord, actionId, modelId })`; `success=false` ⇒ `Retry(errorMessage)` |

Behavior change (intended): the action runs against the record **as persisted at processing time**, not the in-memory
instance. For after-save semantics this is equivalent or better (it cannot act on an uncommitted/rolled-back state).
Context user: the worker's system user (the old path used the saving user). Documented; per-subscription run-as is a follow-on.

### 10.4 Removal steps (Phase 1)

1. Add seam + dispatcher + handler; switch both providers; remove `@memberjunction/queue` imports/deps.
2. Delete `MJQueue` from `packages/ServerBootstrap` / `ServerBootstrapLite` dependency lists and regenerate manifests.
3. Keep `packages/MJQueue` building and published for this release with a `README` deprecation banner and `"deprecated"` note
   in `package.json` description; the npm `deprecate` flag is a release-time build-engineer step.
4. The `queue` integration bundle (`queue.checks.ts`) keeps passing (it drives MJQueue directly). It is removed together with
   the package in the release after deprecation (follow-on), not in Phase 1.

### 10.5 Entities

`MJ: Queue Types`, `MJ: Queues`, `MJ: Queue Tasks` → `Status = 'Deprecated'` (Entity `Status` allows
`Active | Deprecated | Disabled`). Tables are **not dropped** and their broken CHECK constraint is **not** repaired (no new
writers). Seeded `MJ: Queue Types` rows stay. Table drop is a later major-version cleanup.

---

## 11. Testing

### 11.1 Unit (Vitest, per package)

| Package | Focus |
|---|---|
| core | `ComputeBackoffSeconds` (bounds, jitter injection); `MatchesFilter` + `ParseFilter` limits; envelope validation codes; `ConsumerRuntime` with a scripted fake consumer and fake timers: slot accounting, Auto heartbeat cadence, Manual mode, `MaxProcessingSeconds` abort, `LeaseLost` abort without settle, throw ⇒ Retry, max-attempt ⇒ DeadLetter, shutdown drain + Release, `ProcessBatch`; `WorkQueueApiPublisher` chunking, MessageID reuse across retries, `Retry-After`; `InMemoryTransport` passes the conformance kit |
| engine | SQL builders produce expected SQL per platform (snapshot tests); `ValidateTopology` rule table; manifest export/import round-trip; handler resolution (unregistered ⇒ `HandlerNotRegistered`); dispatcher request mapping; entity subclass `Validate()` |
| server | route auth matrix (no user, API key missing scope, full_access, JWT user without permission); 400/404/202/503 mapping; limits |
| SQLDialect | `SkipLockedClaim()` per dialect |
| GenericDatabaseProvider / SQLServerDataProvider | dispatcher used when registered; inline fallback; in-transaction enlistment passes provider |
| MJServer | config schema defaults; worker subscription selection (explicit beats `*`, handler-missing skip) |

### 11.2 Conformance on the Database driver

`RunTransportConformance` executed by the integration bundle (§11.3) against the live DB (SQL Server in the deterministic tier;
the same kit against PostgreSQL where the PG bootstrap is available). `AdvanceTime(seconds)` for the DB driver shifts
`VisibleAt`, `LeaseExpiresAt`, `DeadLetteredAt`, `AwaitingSequenceSince` of the test's subscriptions **back** by `seconds`
(test-only helper in the bundle, never in the driver).

### 11.3 Deterministic integration bundle

- Bundle `work-queue` in `packages/TestingFramework/integration-test-suite/src/checks/work-queue.checks.ts`; test row
  `metadata-optional/integration-test/tests/integration/.IT<next>-work-queue.json` (currently the highest is IT93 — take the
  next free number at authoring); add to the "Integration Tests — Deterministic" suite; add the count row to
  `src/__tests__/check-registry.test.ts` (guide §"Update the count table").
- Server transport, no LLM. Fixture transport/topics/subscriptions created per run with unique names; stub handlers
  registered in the bundle (`@RegisterClass(BaseWorkHandler, 'ITWorkQueueStub…')`) whose behavior is scripted per message
  attribute (`complete | retry | deadletter | throw | hang | heartbeat-then-complete`).
- `MJ_DISABLE_…`-style isolation: the bundle's subscriptions use handler keys no server has, so a running MJAPI worker never
  consumes them (the §4.2 unregistered-handler rule gives this for free).

| ID | Scenario |
|---|---|
| WQ01 | Conformance kit C01–C34 against the Database driver |
| WQ02 | Two independent `ConsumerRuntime`s (separate providers, separate instance IDs) on one Exclusive subscription, 200 messages over 20 keys: no key ever has two in flight (sampled via partition state + handler-side concurrency map); all complete exactly once per attempt |
| WQ03 | Crash simulation: handler `hang`, runtime `Stop()` forcibly skipped (drop the runtime without Release), `AdvanceTime(LeaseSeconds+1)`, second runtime receives attempt 2; zombie `Complete` ⇒ `LeaseLost` |
| WQ04 | Ordered + PublishOrder: dead-letter head, verify block, replay via **REST route** (in-process Express app with the extension mounted), verify ordered drain |
| WQ05 | Ordered + ExplicitSequence: publish 3,1; 1 completes; 2 missing ⇒ `AwaitingSequence` ⇒ `GapStalled`; `SkipSequence(2)` via operator service; 3 completes |
| WQ06 | Fan-out isolation: three subscriptions, one Paused, one failing; message stats per subscription correct |
| WQ07 | Transactional publish: publish enlisted in a provider transaction then rollback ⇒ no message/deliveries; commit ⇒ present |
| WQ08 | Retention: terminal deliveries aged past `RetentionDays` purged, dead letters retained, ExplicitSequence partition state retained |
| WQ09 | Entity AI Action seam: register a stub dispatcher-backed handler (no LLM) and save a fixture entity with an after-save Entity AI Action ⇒ message published with expected key/payload |
| WQ10 | Publish API validation: 400 on oversize batch, per-item `Rejected` codes, `Duplicate` on resend |

### 11.4 Soak runbook (manual, pre-release)

1. Two MJAPI instances, one DB, `workQueue.enabled`, stub handler with 50–500 ms random latency, 5% `throw`.
2. Publisher script via `WorkQueueApiPublisher`: 50 msg/s for 30 min across 1000 keys; subscriptions `None`, `Exclusive`, `Ordered`.
3. Every 5 min `kill -9` one instance; restart after 30 s.
4. Pass criteria: every message reaches `Completed` or `DeadLettered` per subscription; per-key order holds on the Ordered
   subscription (handler logs sequence per key); no delivery observed concurrently in two handlers; claim p95 < 50 ms; no
   deadlock errors surfacing past internal retry; sweeper runs < 2 s.

---

## 12. Work breakdown

Sizes: **S** ≤ 1 day, **M** 2–3 days, **L** 4–6 days. `→` = depends on.

### Milestone A — Contract & runtime (no DB)
| # | Task | Size | Deps |
|---|---|---|---|
| A1 | Scaffold `packages/WorkQueue/{core,engine,server}` (package.json, tsconfig, vitest, build order entries) | S | — |
| A2 | Core types: envelope, handler, policy, transport, manifest; envelope validation | M | A1 |
| A3 | Filter grammar parser + evaluator | S | A2 |
| A4 | Backoff + `ConsumerRuntime` + `LeaseKeeper` | L | A2 |
| A5 | `InMemoryTransport` | L | A2, A3 |
| A6 | Conformance kit C01–C34; green on InMemory | M | A5 |
| A7 | `WorkQueueApiPublisher` | S | A2 |

### Milestone B — Schema & engine
| # | Task | Size | Deps |
|---|---|---|---|
| B1 | Migration hand DDL (6 tables) | M | A2 |
| B2 | Metadata: transports/topics/subscriptions folders, entity settings, scopes, audit type, permissions | M | B1 |
| B3 | migrate → sync push → codegen → sync push → append CodeGen output; checks | M | B1, B2 |
| B4 | `SQLDialect.SkipLockedClaim()` (+ optional `SECOND` in `DateAddExpression`) | S | — |
| B5 | `WorkQueueEngine` (load, bindings, driver factory resolution, credentials, `PublishAs`, events) | M | B3 |
| B6 | Validation (engine + entity subclasses) | M | B5 |
| B7 | Manifest export / binding import | S | B5 |

### Milestone C — Database transport
| # | Task | Size | Deps |
|---|---|---|---|
| C1 | `WorkQueueSqlBuilder` (SQL Server) + snapshot tests | L | B4 |
| C2 | Publish (partition-state locking, savepoints, dedup, outbox enlistment) | M | C1, B5 |
| C3 | Claim `None` + keyed two-step claim | L | C1 |
| C4 | Settle ops + `ExpireLeases` | M | C3 |
| C5 | Operator ops (replay, discard, skip, lists, stats) | M | C4 |
| C6 | Sweeper S1–S6 | M | C4 |
| C7 | `ServerProviderFactory` lift (SQL Server + PG) | M | — |
| C8 | PostgreSQL builder | M | C1–C6 |

### Milestone D — Hosting & surfaces
| # | Task | Size | Deps |
|---|---|---|---|
| D1 | `workQueue` config schema | S | — |
| D2 | `WorkQueueWorkerService` (selection, reconcile, shutdown, status) + boot wiring | M | A4, C4, C7, D1 |
| D3 | `BaseWorkHandler` + handler resolution rules | S | B5 |
| D4 | `WorkQueueOperatorService` + audit | S | C5 |
| D5 | Server Extension (routes, auth, limits, health) | M | D4, C2 |
| D6 | CLI plugins + shims | M | D4, B7 |
| D7 | ServerBootstrap/Lite dependencies + manifest regeneration | S | D5, D6 |

### Milestone E — MJQueue replacement
| # | Task | Size | Deps |
|---|---|---|---|
| E1 | `EntityAIActionDispatchRegistry` seam + inline fallback in GenericDatabaseProvider | S | — |
| E2 | SQLServerDataProvider enlistment path; remove MJQueue deps | S | E1 |
| E3 | `WorkQueueEntityAIActionDispatcher` + `EntityAIAction` handler + topic/subscription metadata | M | E1, D2, D3 |
| E4 | MJQueue deprecation (README, entity Status metadata, bootstrap removal) | S | E3 |

### Milestone F — Verification
| # | Task | Size | Deps |
|---|---|---|---|
| F1 | Unit tests across packages (alongside each task) | — | — |
| F2 | Integration bundle WQ01–WQ10 | L | D5, E3 |
| F3 | Conformance on PostgreSQL (if PG bootstrap available) | M | C8, F2 |
| F4 | Soak runbook execution + tuning (indexes, `ReadyAt` decision) | M | F2 |
| F5 | Package READMEs + guide `guides/WORK_QUEUE_GUIDE.md` indexed in `guides/README.md`; `npm run check:claude-md` | M | D6 |
| F6 | Changeset (`minor`); `check:standards`, `check:esm`, `check:changeset`, `check:codegen-tail` | S | all |

---

## 13. Risks & open verification items

| # | Item | Mitigation / action |
|---|---|---|
| V1 | CodeGen handling of `PublishOrdinal BIGINT IDENTITY` with a **nonclustered** UUID PK and a separate clustered index (AutoIncrement field detection, `spCreate` omitting the identity column, base view) | Verify in B3 on a clean DB; fallback: clustered PK on `ID` with `NEWSEQUENTIALID()` default when producer omits `MessageID`, ordinal remains a non-clustered unique identity |
| V2 | `__mj_UpdatedAt` trigger fires on every claim/heartbeat update ⇒ write amplification on Deliveries | Measure in soak; if significant, explore a CodeGen/entity setting to omit timestamp trigger for these entities |
| V3 | Step-1 candidate scan over blocked keys' backlog | Soak; add `PartitionState.ReadyAt` + filtered index if needed |
| V4 | `READPAST` requires READ COMMITTED locking (not RCSI snapshot semantics for the scan); confirm the provider's session isolation | Check connection options (`V202607202110…Fix_ConversationDetail_Sequence_Deadlock.sql` header notes this constraint) |
| V5 | PostgreSQL: unique-violation path on concurrent same-sequence publish; `FOR UPDATE SKIP LOCKED` inside CTE with ordering | PG conformance run (F3) |
| V6 | Metadata ordering: entity-setting overrides referencing entities created by CodeGen in the same branch | Confirm two-pass push is acceptable to release tooling (build engineer consolidates) |
| V7 | `metadata/audit-log-types` folder name / Audit Log Type entity name | Verify before B2 |
| V8 | Entity AI Actions now run as the system user instead of the saving user | Confirm acceptable with product owner; otherwise carry `PublishedByUserID` and resolve the user in the handler |
| V9 | AWS SDK packages added to every server install | Accept per MJStorage precedent; revisit (§9 alternative) if image size matters |
| V10 | Engine refresh across instances (BaseEngine save-event refresh is local; remote invalidation via Redis cache events) | Reconcile interval (30 s) bounds staleness; verify BaseEngine remote refresh behavior |
| R1 | Long-running handlers holding a pooled connection for their whole run | Handler providers share the pool; document that handlers must not hold open transactions across long work; pool size guidance in guide |
| R2 | `Auto` heartbeat hides hung handlers | Documented; `Manual` mode and `MaxProcessingSeconds` exist for that |

---

## 14. Deviations from and extensions to 03

| # | 03 says | This document | Reason |
|---|---|---|---|
| X1 | Scope names `WorkQueue:Publish`, `WorkQueue:Operate`, `WorkQueue:Read` | `workqueue:publish`, `workqueue:operate`, `workqueue:read` (parent `workqueue`) | Existing `MJ: API Scopes` use lowercase colon paths (`query:run`, `agent:execute`) |
| X2 | `SQLDialect.SkipLockedClaim()` is the dialect addition | Kept; plus per-platform `WorkQueueSqlBuilder` in the engine; optional `'SECOND'` added to `DateAddExpression` unit union | Statement shapes differ (CTE+`OUTPUT INTO` vs `RETURNING`); triggers forbid bare `OUTPUT` |
| X3 | In-process `Publish(topic, requests, { ContextUser, Provider? })` | `WorkQueueEngine.PublishAs(topic, requests, options)`; `Publish` keeps the 2-arg `IWorkPublisher` shape | Avoids overloading the interface method |
| X4 | `BaseWorkHandler` fields "populated by the host" | Adds public `BindExecutionContext(ctx)` | The host needs a sanctioned way to bind |
| X5 | — | Driver capability flags `{ DetectsDuplicates, PersistsProgress, SupportsCompletedCounts }` on `ITransportDriver` | Conformance kit adapts assertions per driver |
| X6 | `CompletedAt` described for completion | `CompletedAt` is the terminal timestamp for both `Completed` and `Discarded` | Retention purge needs one terminal time |
| X7 | Claim reclaims expired leases (brief) | `ExpireLeases` step runs before each claim cycle and in the sweeper; claim touches `Pending` only | Single "absent update" path; index-friendly claim; lock-order safety |
| X8 | — | `BaseTransportDriverFactory` + `TransportDriverDeps` (ClassFactory base for transport drivers) | Engine resolves drivers by `Transport.DriverClass` |
| X9 | — | `EntityAIActionDispatchRegistry` seam in GenericDatabaseProvider | Dependency direction for MJQueue replacement |
| X10 | — | Skipped-sequence publishes are auto-discarded by the sweeper (`SequenceSkipped`) | Keeps a skipped sequence from lingering as unreachable `Pending` |
| X11 | `ITransportDriver.Publish(topic, messages, subscriptions)` | Optional 4th arg `opts?: { Provider?; UserID? }` (ignored by cloud drivers) | Transactional enlistment + `PublishedByUserID` on the Database transport |
| X12 | Envelope errors listed in 03 §1 | Adds publish codes `MessageIDConflict`, `DuplicateSequence`, `TransportUnavailable` | Needed by the DB publish path |

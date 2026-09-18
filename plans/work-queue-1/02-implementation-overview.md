# 02 — Implementation Overview

## 1. Architecture at a glance

```
                ┌──────────────────────── MJ metadata (source of truth) ────────────────────────┐
                │  Transports ── Topics ── Subscriptions (filter, partition mode, retry, host)   │
                └──────────────┬──────────────────────────────────────┬─────────────────────────┘
                               │ WorkQueueEngine cache                │ mj queue export-topology
                               ▼                                      ▼
 Producers               ┌─────────────┐                     Topology manifest ─► Terraform ─► SNS/SQS/Lambda
 in-MJ code ─PublishAs──►│ WorkQueue   │── dedup ledger (MJ DB, all transports)
 external ─REST publish─►│ Engine      │
 (webhook Lambda, jobs)  └──────┬──────┘
                                ├── Database driver ─► Message + Delivery rows ─► MJ worker host (claim)
                                │
                                │                     (None / Exclusive / Ordered)
                                └── AWS driver ─► SNS topic ─┬─► SQS ─► Lambda (thin, no MJ)       None/Exclusive
                                                              └─► SQS ─► MJ worker (SQS pull)        None/Exclusive
```

`Ordered` subscriptions exist on the **Database transport only**; a topic that needs one lives there.

Three orthogonal axes (unchanged):

| Axis | Chosen per | Phase 1 options |
|---|---|---|
| **Topology** | MJ metadata | Topics, Subscriptions |
| **Transport** | Topic | `Database`, `AWS` |
| **Compute host** | Subscription | `MJWorker`, `External` |

### Package decoupling

```
@memberjunction/work-queue-core    ← zero @memberjunction deps
        ▲                  ▲
        │                  │
        │      @memberjunction/work-queue-aws   ← core + AWS SDK (SNS, SQS) only   → used by Lambda consumers
        │                  ▲
@memberjunction/work-queue-base    ← core + MJ core/global/core-entities; BROWSER-SAFE
        ▲                  │          WorkQueueEngineBase: cached topology for Explorer and client code
        │                  │
@memberjunction/work-queue-engine  ← base + MJ (sql-dialect, credentials); server only
        │   main entry          does NOT import work-queue-aws
        │   ./aws subpath       registers the AWS driver factory; imported only by server bootstraps
        ▲
        ├── @memberjunction/work-queue-server          (REST publish extension)
        ├── @memberjunction/server                     (host wiring)
        ├── @memberjunction/cli                        (mj queue)
        └── @memberjunction/work-queue-legacy-bridge   (queue ↔ engine routing seam; imported by ServerBootstrap)
                        ▲
        @memberjunction/queue registers a routing seam; it does NOT depend on the engine
```

Two loading rules keep unrelated processes light:
- A Lambda consumer imports only `@memberjunction/work-queue-aws/lambda` (which pulls in `work-queue-core`).
- Data-provider consumers (CodeGen, MetadataSync, the CLI) load neither the engine nor AWS clients: the AWS factory
  registers from `work-queue-engine/aws`, and legacy `MJQueue` routing lives in the bridge package rather than in
  `@memberjunction/queue`.

Both are enforced by dependency guard tests over package.json and source imports (03 §0). Packages never re-export
another package's symbols; consumers import from `work-queue-base` directly.

### Host × transport × partition mode (validated by `SubscriptionUnsupportedReason`, checked at save and at host start)

| | Database transport | AWS transport |
|---|---|---|
| `MJWorker` + `None`/`Exclusive` | ✅ claim from DB | ✅ long-poll SQS |
| `MJWorker` + `Ordered` | ✅ claim from DB | ❌ put the topic on the Database transport (09i) |
| `External` + `None`/`Exclusive` | ❌ | ✅ SQS event source (Lambda) |
| `External` + `Ordered` | ❌ | ❌ (09i, only if a use case appears) |

**Why `Ordered` is Database-only, and why no DynamoDB.** SQS FIFO already gives a key's messages in order, one at a
time — that is `Exclusive` on AWS. What it cannot do is *halt the key after a dead letter*; closing that hole needs
an external state store (DynamoDB) or a copy of every message into the database. Neither driving use case needs the
combination: email events use `None`/`Exclusive`; ordered integration batches need MJ entities, run on MJ workers, and
so publish to a Database topic. Both workarounds were reviewed and cut (11 §1) rather than shipped with known ordering
holes.

## 1a. Where the queue stops

The queue owns exactly three guarantees:

1. **Durable delivery** — an accepted publish reaches every matching subscription at least once.
2. **One valid lease holder at a time** — per delivery, and per key for `Exclusive`/`Ordered`, while a handler runs.
3. **Fencing** — a holder whose lease was revoked or taken over cannot settle or write lease state.

Everything below is a **consumer responsibility**, by design (see [10 — Consumer guide](10-consumer-guide.md)):

| Not the queue's job | Why | The consumer's tool |
|---|---|---|
| Preventing duplicate *side effects* | At-least-once delivery plus lease takeover means a handler can run twice | Idempotent handlers; a domain lock for non-restartable work (e.g. Terraform state lock) |
| Work that finishes **after** the handler returns (an external job completed by webhook) | A queue item's guarantees end when its handler settles | Split-message pattern: record the external job on a domain row, publish a completion message from the webhook |
| "Only one active per key" policy, coalescing, superseding | Needs domain knowledge (is this request redundant?) | `Exclusive` mode serialises deliveries per key; the handler then checks its domain row and completes or merges |
| Output, history, results, operator UI | The item is a claim check, not the record | A domain row referenced from the payload |
| Knowing whether a remote executor is still alive | Cloud-specific probing does not belong in a transport-agnostic queue | A lease long enough to cover the worst heartbeat outage, plus the domain lock above |

## 2. Core concepts

- **Topic** — named destination; declares its transport, `AllowExternalPublish`, payload cap, deduplication TTL
  default, retention.
- **Subscription** — consumer declaration: topic, filter, partition mode, retry/backoff, lease/heartbeat, host type,
  handler key (MJ) or external reference.
- **Message** — the envelope published once. **Delivery** — one subscription's processing of one message.
- **Handler** — `WorkHandler.Handle(message, context) → WorkOutcome`. MJ-hosted handlers extend `BaseWorkHandler`
  and register with `@RegisterClass(BaseWorkHandler, '<HandlerKey>')`.

## 3. Delivery semantics

### 3.1 Guarantees

| Property | Guarantee |
|---|---|
| Publish | `Accepted` means the transport durably holds the message (Database: committed rows; AWS: SNS accepted). |
| Deduplication | A `DeduplicationKey` suppresses repeats per topic within its TTL, on every transport (MJ ledger). Only a **confirmed** reservation counts as a duplicate: a retry that finds its own unconfirmed reservation sends again, so a crash between reserve and send never loses a message. `MessageID` is globally unique. |
| Delivery | **At least once** per matching subscription. |
| Isolation | Subscriptions are independent. |
| Exclusivity | One valid lease holder per delivery; superseded holders are fenced out (see "why guarded writes" below). `Exclusive`/`Ordered`: one in flight per key, enforced by a unique filtered index (Database) or FIFO message groups consumed one message at a time (SQS). |
| Ordering | `Ordered` (Database transport): per key, strict **publish order**. The producer owns the order — for one key, publish N+1 only after N is accepted, or publish both in one call. |
| Idempotency | Handler responsibility; `MessageID` is stable. |

### 3.2 Delivery lifecycle

```
            publish (filter matched)
                    │
                    ▼
   ┌──────────► Pending ◄──────────────────────────┐
   │   (claimable when VisibleAt ≤ now and         │
   │    partition rules allow — 03 §7)             │ Retry: attempts remain
   │                │ claim (lease + token,        │  → VisibleAt = now + backoff
   │                │        AttemptCount += 1)    │
   │                ▼                              │
   │            InFlight ──── heartbeat ──┐        │
   │                │  ▲                  │        │
   │                │  └──────────────────┘        │
   │   ┌────────────┼───────────────┬──────────────┘
   │   │ Complete   │ lease expires │ Retry / throw
   │   ▼            │ (ExpireLeases)│                     cancel requested:
   │ Completed      └───────────────┤                     holder acknowledges → Discarded
   │                                │ attempts exhausted, DeadLetter, FatalWorkError
   │                                ▼
   │ operator Replay          DeadLettered ─────────────┐
   └────────────────────────────────┘                   │ operator Discard
                         Pending ── operator Discard ───┤
                                                        ▼
                                                    Discarded
```

| Status | Meaning | Terminal |
|---|---|---|
| `Pending` | Awaiting claim; future `VisibleAt` = backoff | no |
| `InFlight` | Leased | no |
| `Completed` | Handler succeeded | yes |
| `DeadLettered` | Exhausted or rejected | no — needs operator |
| `Discarded` | Operator cancelled a `Pending` or `InFlight` item, or resolved a dead letter | yes |

On SQS the same vocabulary is reported by the operator but not stored per message: `Pending`/`InFlight`
are queue counts, `DeadLettered` is the dead-letter queue, and `Discard` of a `Pending` or `InFlight` message is
unsupported.

**Cancelling in-flight work** (Database): `Discard` sets `CancelRequestedAt` — a flag, not a token change. The
holder's next heartbeat (at most 30 s away) returns `Cancelled`; the runtime aborts the handler's `Signal` with reason
`'Cancelled'`, and once the handler has stopped it calls `AcknowledgeCancel` (fenced on its lease token), which makes
the row `Discarded` **immediately** and frees an `Exclusive`/`Ordered` key. Every other settle is guarded on
`CancelRequestedAt IS NULL`, so a cancelled handler cannot complete. If the holder is dead, the key is held only until
the lease expires, when `ExpireLeases` discards the row.

**Why guarded writes, and why handlers never touch the row.** Every settle is one statement guarded on
`ID + Status='InFlight' + LeaseToken`, and succeeds only if it changes exactly one row. The tempting alternative —
load the row, check `Status` in TypeScript, call `Save()` — *looks* like a compare-and-swap and is not one: two workers
can both read `Pending`, and MJ's generated update procedure writes every column, so the loser's save restores a stale
lease token and attempt count over the winner's claim. That is how a reaped-but-still-alive worker marks someone else's
in-progress work complete. Delivery rows are therefore closed to `BaseEntity.Save()` (03 §6.8), and handlers settle only
by returning an outcome.

### 3.3 Handler outcomes

| Outcome | Effect |
|---|---|
| `Complete()` | → `Completed` |
| `Retry({ DelaySeconds?, Reason? })` / `TransientWorkError` / any other throw | attempts remain → `Pending` after backoff; else → `DeadLettered('MaxAttemptsExceeded')` |
| `DeadLetter({ Reason })` / `FatalWorkError` | → `DeadLettered` immediately |
| Lease lost / cancelled | `Signal` aborted (`reason`: `'LeaseLost'`, `'Cancelled'`, `'MaxProcessingSeconds'` or `'Shutdown'`); outcome discarded |
| No handler registered (MJ host) | Subscription reported `HandlerNotRegistered`; runtime not started (nothing claimed) |

Backoff: full jitter, `random(0, min(BackoffMax, BackoffBase × 2^(attempt−1)))`.

### 3.4 Liveness

| `HeartbeatMode` | Renews the lease | Detects |
|---|---|---|
| `Auto` (default) | Runtime every `min(LeaseSeconds / 3, 30 s)` while the handler runs, until `MaxProcessingSeconds` | Dead process / host / partition; runaway handlers past the cap |
| `Manual` | Only `context.Heartbeat(progress?)` (returns `false` once the lease is lost or the item is cancelled) | Additionally hung handlers in a live process |

The heartbeat interval is **decoupled from the lease length**: a 20-minute lease still heartbeats every 30 s, so a
cancel or a lost lease is noticed within 30 s. The **lease horizon has its own timer**, re-armed on every successful
renewal, in both modes: when it fires the handler is aborted, whether or not a renewal call is still outstanding — a
hung `ExtendLease` cannot wedge a delivery or leak a worker slot.

**Liveness lives in dedicated columns.** `__mj_CreatedAt`/`__mj_UpdatedAt` are never the lease. (A heartbeat that
"dirties" a row by re-assigning a field to its current value writes nothing — `Save()` skips the no-op — so the
timestamp never moves and every live run is reaped.) `LeaseExpiresAt` and `LastHeartbeatAt` are moved by guarded SQL.
A transient heartbeat failure is retried on the next tick; only a lost lease, or the lease passing its expiry, aborts
the handler.

**Crash recovery is lease expiry, nothing else.** After a restart, an in-flight row that nobody owns is simply a lease
that ran out; the next claim cycle picks it up with its attempt counted. There are no per-state recovery steps and no
bespoke "stale after N hours" sweeps — the pattern to retire wherever a `Status` column doubles as a lock today.

Expired leases: Database — `ExpireLeases` moves expired `InFlight` rows back to `Pending` (or `DeadLettered` at the
attempt limit, or `Discarded` when a cancel was requested) before each claim cycle and in the sweeper. SQS — the
visibility timeout returns the message; attempt accounting is in §4.4.

### 3.5 Partition modes

| Mode | In flight per key | Order | On dead letter | Database | SQS |
|---|---|---|---|---|---|
| `None` | unlimited | none | continue | `PartitionKey` not stored on delivery | standard or FIFO topic |
| `Exclusive` | 1 | Database: not guaranteed · SQS FIFO: publish order | continue | unique in-flight index | FIFO message group, one message per receive |
| `Ordered` | 1 | strict publish order | **key blocked** until replayed to success or discarded | head-of-line + unique in-flight index | — (not supported) |

- An `Ordered` head in retry backoff holds its key.
- `Exclusive` differs by transport while a message **retries**: on SQS FIFO the retrying message keeps its message
  group busy, so later messages for the key wait; on the Database transport a delivery in backoff does not hold its
  key, and later deliveries proceed.
- `PartitionMode` is immutable once a subscription has deliveries.
- There are no producer-supplied sequence numbers: order is the order the producer published (11 §1, S1).

### 3.6 Fan-out, filters, payloads

Filters see attributes only, and are stored as MJ's `CompositeFilterDescriptor` JSON restricted to a
broker-translatable subset, edited with the existing `mj-filter-builder` component (03 §4). Database: deliveries created at publish for every `Active`/`Paused` matching
subscription. AWS: SNS filter policies. Inline payload
≤ 256 KB envelope, ≤ 10 attributes; otherwise `PayloadRef`.

## 4. Principal flows

### 4.1 Publish (external producer → REST)

```
Webhook Lambda ─POST /work-queue/topics/email.events/messages (X-API-Key, ≤100)─► MJAPI extension
   API key required · scope workqueue:publish(topic), checked before the body is parsed
   topic.AllowExternalPublish · validate each request
   WorkQueueEngine.PublishAs(topic, requests, { ContextUser, External: true })
     for each request with DeduplicationKey — ledger Reserve:
        Confirmed row                         → Duplicate (skip)
        Reserved by this same MessageID       → re-take the reservation and send again (a retry after a crash)
        Reserved by a different MessageID     → Rejected DeduplicationPending (retryable)
     driver.Publish(batch)         Database: INSERT Message + Deliveries (Reserve/Confirm in the same transaction)
                                   AWS: SNS PublishBatch (chunks of 10) → Confirm on success / Release on failure
   ◄── 202 { results: [{ messageId, status: Accepted|Duplicate|Rejected, error? }] }
```

Retries must reuse their `MessageID`s (`WorkQueueApiPublisher` does). That is what makes the re-take safe: on a FIFO
topic, SNS's five-minute window absorbs a genuine double send.

### 4.2 Publish (in-process)

`WorkQueueEngine.Instance.PublishAs('mj.entity-ai-actions', [req], { ContextUser, Provider })` — on the Database
transport, a `Provider` inside an open transaction enlists message, deliveries and ledger rows in that transaction.

### 4.3 Consume — Database

```
WorkQueueHost (per MJ instance)
  start: for each configured subscription → SubscriptionUnsupportedReason / handler registered? → Running | Unsupported | HandlerNotRegistered
  per subscription: ConsumerRuntime(DatabaseConsumer) — ExpireLeases → claim batch → handlers → settle (fenced)
  in-process publish kicks the local runtime
WorkQueueSweeper (DB clock, one sweeper at a time via an application lock): ExpireLeases, retention purge, dedup purge
```

- **Queue SQL never rides an ambient transaction.** Each consumer, operator and cloud-path ledger owns an independent
  executor, so a claim or settle can never be swept into — and rolled back with — some other unit of work on the shared
  provider. Only a publish the caller explicitly enlists uses the caller's transaction.
- **SQL Server requires `READ_COMMITTED_SNAPSHOT ON`**, verified when the engine starts.
- Hot paths are bounded and index-backed: the claim index covers `Pending` rows only, purge has its own indexes, and
  backlog/scaler counts are capped.

### 4.4 Consume — AWS (`None`/`Exclusive`)

```
SNS topic ─(filter policy, raw delivery)─► SQS queue per subscription (+ DLQ, redrive MaxAttempts + 5)
  Lambda (CreateSqsLambdaHandler, ReportBatchItemFailures)  or  MJ worker long-poll
  FIFO queues: ONE message per receive (MaxNumberOfMessages = 1; Lambda event source batch_size = 1);
               concurrency comes from parallel receives / invocations across message groups
  per message: run handler; heartbeat = ChangeMessageVisibility
     Complete → DeleteMessage
     Retry    → ChangeMessageVisibility(backoff); report item failure
     DeadLetter / exhausted → SendMessage to DLQ with mj_* reason attributes → DeleteMessage
```

- **Why one message at a time on FIFO.** A single receive can return several messages of one message group. Running
  them together would break `Exclusive`; handing the extras back would burn their receive counts, so a follower could
  reach its final attempt — or be dead-lettered — without ever having run.
- **Attempt accounting.** `Attempt` is SQS's `ApproximateReceiveCount`. The runtime dead-letters after a failed attempt
  at `MaxAttempts`; a receive-time guard dead-letters anything arriving at `> MaxAttempts + 2`; the redrive policy
  (`MaxAttempts + 5`) only catches crash loops. `Release` (shutdown) and Lambda throttling each consume a receive — the
  margin absorbs them. Throttle with the event source's `maximum_concurrency`, not reserved concurrency.
- **Dead-letter queues.** A FIFO DLQ copy uses the SQS `MessageId` as its `MessageGroupId`, so scanning is not blocked
  behind one key; DLQ receives long-poll and loop until consecutive empties.

### 4.4a Consume — one-shot container job (KEDA and friends)

```
scaler: SELECT claimable Pending + InFlight for the subscription   (SELECT-only login; WorkQueue.GetBacklog remote op
        returns the same number)  ── counts InFlight too: KEDA subtracts running executions from the metric, and a
        Pending-only count starves the queue
job:    mj queue work --subscription venue-import --once      → WorkQueueHost.RunOnce({ MaxDeliveries: 1, IdleExitMs })
        claim → run → settle → drain → exit 0 (also on empty queue)
```

The container needs no transport code: it claims from the Database transport exactly as an MJ worker does. Scale to
zero between items; size `LeaseSeconds` to survive the job's worst heartbeat outage.

### 4.5 Operator

Remote operations (03 §8) — callable from Explorer/GraphQL and from the CLI:

```
mj queue stats         [--subscription email.unsubscribe]
mj queue dead-letters  --subscription email.unsubscribe
mj queue replay        --subscription integration.apply --delivery <id>
mj queue discard       --subscription integration.apply --delivery <id> --reason "bad batch"
mj queue partitions    --subscription integration.apply --condition Blocked
mj queue export-topology --transport AWS-prod > manifest.json
mj queue import-bindings  terraform-output.json
mj queue validate-bindings [--transport AWS-prod]
mj queue work           --subscription venue-import --once    # container-job worker; exits 0
```

`DiscardDelivery` on an in-flight item reports `cancelRequested: true` — the handler is asked to stop, and the row
becomes `Discarded` as soon as it acknowledges (or when the lease expires, if the holder is dead).

**Authorization.** API-key callers need the operation's scope (`workqueue:read` / `workqueue:operate`, per
subscription). Interactive users are checked too — MJ's scope gate is a no-op without an API key — and need **Update**
on `MJ: Work Queue Subscriptions` to operate or **Read** on `MJ: Work Queue Deliveries` to read. REST publish accepts
API keys only. Handlers run as the host's system user; because payloads may hold PII, read permission on Messages and
Deliveries is limited to administrative roles.

## 5. Configuration surfaces

| Surface | Holds |
|---|---|
| MJ metadata (`metadata/work-queue-transports/`, `metadata/work-queue-topics/` — one entity per folder, `mj sync`) | System transports/topics/subscriptions (`Database` transport; legacy MJQueue topics) |
| MJ entities | Customer-defined topics/subscriptions |
| `mj.config.cjs` → `workQueue` | Host enablement, subscriptions this instance runs, concurrency, poll intervals, sweeper cadence |
| Server Extension config | REST publish root path, body limits |
| MJ Credentials | Cloud credentials (`Transport.CredentialID`) or ambient IAM role |
| Topology manifest + Terraform variables | Cloud resources, Lambda artifacts, alarms |
| Lambda environment | `MJ_WQ_SUBSCRIPTION` (one `SubscriptionBinding`) |

## 6. Testing strategy

| Tier | What | Plan |
|---|---|---|
| Unit | Pure helpers, runtime, SQL statement shapes (recording executor), drivers against fakes | 04–08 |
| Conformance kit | Data-driven cases (`CONFORMANCE_CASES`) gated by capabilities: fan-out, lease expiry, fencing, Exclusive, Ordered blocking, cancel in flight, replay/discard, dedup. Run by `RunConformanceChecks` (no test runner) or `RunTransportConformanceSuite` (vitest) | 04 (kit + InMemory), 05 (Database harness), 06 (live DB in IT94), 07 (AWS via LocalStack, opt-in) |
| Integration (deterministic tier) | Database transport + host + REST publish + remote operations on a live MJ database | 06 |
| Infrastructure | `terraform fmt/validate`, tflint, plan against a sample manifest | 07 |
| Soak (manual runbook) | Throughput and crash injection | 06, 07 |

## 7. Known limits

Stated rather than solved (11 §4):

- **High-velocity AWS topics.** A topic with any `Exclusive` subscription must be FIFO, which caps *every* subscription
  on it at FIFO quotas. Use the **two-topic pattern**: a standard topic for permanence and reporting (`None`), and a
  FIFO topic for per-subscriber work (`Exclusive`).
- **Every publish passes through MJ**, and a `DeduplicationKey` costs two MJ-database writes (reserve, confirm).
  Producers at firehose volume should rely on stable `MessageID`s instead, and on the direct publisher follow-on (09d).
- **`OnDeadLettered` is per-process.** A dead letter produced by another instance's sweeper, or inside a one-shot
  container job, fires no listener elsewhere. Alert from `GetSubscriptionStats` and the DLQ alarms.

## 8. Plan map

| Plan | Scope | Depends on |
|---|---|---|
| [04](04-core-implementation-plan.md) | `@memberjunction/work-queue-core` | — |
| [05](05-native-data-implementation-plan.md) | Schema + metadata (six tables), SQL executor & builders, Database driver/operator, dedup ledger, `work-queue-base` + `WorkQueueEngine` | 04 |
| [06](06-native-runtime-implementation-plan.md) | Handlers, host, sweeper, remote operations, MJServer wiring, REST extension, CLI, manifests, integration bundle | 05 |
| [07](07-aws-implementation-plan.md) | `@memberjunction/work-queue-aws`, Lambda adapter, engine AWS factory (`work-queue-engine/aws`), Terraform module, deployment governance | 04 (package); 06 (engine wiring tasks) |
| [08](08-legacy-queue-port-plan.md) | Repair `MJQueue`, serialisable Entity AI Action references, opt-in routing through `@memberjunction/work-queue-legacy-bridge` | 06 |
| [11](11-revision-4-review.md) | Independent review findings, scope cuts and the normative Revision 4 change list | — |

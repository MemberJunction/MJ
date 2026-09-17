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
                                └── AWS driver ─► SNS topic ─┬─► SQS ─► Lambda (thin, no MJ)       None/Exclusive
                                                              ├─► SQS ─► MJ worker (SQS pull)        None/Exclusive
                                                              └─► SQS ─► MJ worker STAGER ─► Delivery rows ─► claim   Ordered
```

Three orthogonal axes (unchanged):

| Axis | Chosen per | Phase 1 options |
|---|---|---|
| **Topology** | MJ metadata | Topics, Subscriptions |
| **Transport** | Topic | `Database`, `AWS` |
| **Compute host** | Subscription | `MJWorker`, `External` |

### Package decoupling

```
@memberjunction/work-queue-core   ← zero @memberjunction deps
        ▲                 ▲
        │                 │
@memberjunction/work-queue-aws    ← core + AWS SDK (SNS, SQS) only      → used by Lambda consumers
        ▲
        │
@memberjunction/work-queue-engine ← core + aws + MJ (core, global, core-entities, sql-dialect, credentials)
        ▲
        ├── @memberjunction/work-queue-server (REST publish extension)
        ├── @memberjunction/server   (host wiring)       ├── @memberjunction/cli (mj queue)
        └── @memberjunction/queue    (legacy routing)
```

A Lambda consumer imports only `@memberjunction/work-queue-aws/lambda` (which pulls in `work-queue-core`). The
restriction is enforced by dependency guard tests over package.json and source imports (03 §0).

### Host × transport × partition mode (validated by `SubscriptionUnsupportedReason`, checked at save and at host start)

| | Database transport | AWS transport |
|---|---|---|
| `MJWorker` + `None`/`Exclusive` | ✅ claim from DB | ✅ long-poll SQS |
| `MJWorker` + `Ordered` | ✅ claim from DB | ✅ **staged**: SQS → Delivery rows → DB claim |
| `External` + `None`/`Exclusive` | ❌ | ✅ SQS event source (Lambda) |
| `External` + `Ordered` | ❌ | ❌ (follow-on 09/09i, only if a use case appears) |

**Why no DynamoDB.** The only hole an external state store would close is strict per-key blocking and
sequence-gap waiting for **thin external consumers**. Neither driving use case needs that combination: email
events use `None`/`Exclusive`; ordered integration batches need MJ entities and run on MJ workers. Staging cloud
`Ordered` subscriptions into the database transport gives them the exact Database semantics with no extra
infrastructure.

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

- **Topic** — named destination; declares `OrderingMode`, transport, `AllowExternalPublish`, payload cap,
  deduplication TTL default, retention.
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
| Deduplication | A `DeduplicationKey` suppresses repeats per topic within its TTL, on every transport (MJ ledger). |
| Delivery | **At least once** per matching subscription. |
| Isolation | Subscriptions are independent. |
| Exclusivity | One valid lease holder per delivery; superseded holders are fenced out (see "why guarded writes" below). `Exclusive`/`Ordered`: one in flight per key, enforced by a unique filtered index (Database/staged) or FIFO message groups (SQS). |
| Ordering | `Ordered` only, per key, strict. |
| Idempotency | Handler responsibility; `MessageID` is stable. |

### 3.2 Delivery lifecycle

```
            publish / stage (filter matched)
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
   │   ▼            │ (ExpireLeases)│
   │ Completed      └───────────────┤
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
| `Discarded` | Operator cancelled a `Pending` item or resolved a dead letter | yes |

On SQS (non-staged) the same vocabulary is reported by the operator but not stored per message: `Pending`/`InFlight`
are queue counts, `DeadLettered` is the dead-letter queue, and `Discard` of a `Pending` or `InFlight` message is
unsupported.

**Cancelling in-flight work** (Database/staged): `Discard` sets `CancelRequestedAt` and rotates the lease token. The
handler's next heartbeat resolves `false`, its `Signal` aborts, and its settle is fenced out. The row stays `InFlight`
until the lease expires — so an `Exclusive`/`Ordered` key is not handed on while the old handler is still stopping —
then becomes `Discarded`.

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
| Lease lost | Signal aborted; outcome discarded |
| No handler registered (MJ host) | Subscription reported `HandlerNotRegistered`; runtime not started (nothing claimed) |

Backoff: full jitter, `random(0, min(BackoffMax, BackoffBase × 2^(attempt−1)))`.

### 3.4 Liveness

| `HeartbeatMode` | Renews the lease | Detects |
|---|---|---|
| `Auto` (default) | Runtime every `LeaseSeconds / 3` while the handler runs, until `MaxProcessingSeconds` | Dead process / host / partition; runaway handlers past the cap |
| `Manual` | Only `context.Heartbeat(progress?)` (returns `false` once the lease is lost) | Additionally hung handlers in a live process |

**Liveness lives in dedicated columns.** `__mj_CreatedAt`/`__mj_UpdatedAt` are never the lease. (A heartbeat that
"dirties" a row by re-assigning a field to its current value writes nothing — `Save()` skips the no-op — so the
timestamp never moves and every live run is reaped.) `LeaseExpiresAt` and `LastHeartbeatAt` are moved by guarded SQL.
A transient heartbeat failure is retried on the next tick; only a lost lease, or the lease passing its expiry, aborts
the handler.

**Crash recovery is lease expiry, nothing else.** After a restart, an in-flight row that nobody owns is simply a lease
that ran out; the next claim cycle picks it up with its attempt counted. There are no per-state recovery steps and no
bespoke "stale after N hours" sweeps — the pattern to retire wherever a `Status` column doubles as a lock today.

Expired leases: Database/staged — `ExpireLeases` moves expired `InFlight` rows back to `Pending` (or `DeadLettered`
at the attempt limit) before each claim cycle and in the sweeper. SQS — the visibility timeout returns the message;
the runtime dead-letters at `MaxAttempts`, and the redrive policy (`MaxAttempts + 2`) catches crash loops. Staged
`Ordered` queues use redrive `1000`, so a database outage never pushes staged messages into the DLQ out of order.

### 3.5 Partition modes

| Mode | In flight per key | Order | On dead letter | Database / staged | SQS (non-staged) |
|---|---|---|---|---|---|
| `None` | unlimited | none | continue | `PartitionKey` not stored on delivery | standard or FIFO topic |
| `Exclusive` | 1 | not guaranteed | continue | unique in-flight index | FIFO message group |
| `Ordered` | 1 | strict | **key blocked** until replayed to success or discarded | head-of-line + unique in-flight index (+ sequence state) | — (staged) |

`ExplicitSequence` topics: the next deliverable item for an `Ordered` key is exactly `LastCompletedSequence + 1`;
gaps block (`AwaitingSequence`, `GapStalled` after `SequenceGapAlertSeconds`); `SkipSequence` declares a sequence
permanently absent. An `Ordered` head in retry backoff holds its key.

### 3.6 Fan-out, filters, payloads

Filters see attributes only, and are stored as MJ's `CompositeFilterDescriptor` JSON restricted to a
broker-translatable subset, edited with the existing `mj-filter-builder` component (03 §4). Database: deliveries created at publish for every `Active`/`Paused` matching
subscription. AWS: SNS filter policies; staged subscriptions filter at SNS and are staged as received. Inline payload
≤ 256 KB envelope, ≤ 10 attributes; otherwise `PayloadRef`.

## 4. Principal flows

### 4.1 Publish (external producer → REST)

```
Webhook Lambda ─POST /work-queue/topics/email.events/messages (X-API-Key, ≤100)─► MJAPI extension
   scope workqueue:publish(topic) · topic.AllowExternalPublish · validate each request
   WorkQueueEngine.PublishAs(topic, requests, { ContextUser, External: true })
     for each request with DeduplicationKey:  ledger Reserve → Duplicate? skip
     driver.Publish(batch)         Database: INSERT Message + Deliveries (with Reserve/Confirm in one txn)
                                   AWS: SNS PublishBatch (chunks of 10) → Confirm / Release
   ◄── 202 { results: [{ messageId, status: accepted|duplicate|rejected, error? }] }
```

### 4.2 Publish (in-process)

`WorkQueueEngine.Instance.PublishAs('mj.entity-ai-actions', [req], { ContextUser, Provider })` — on the Database
transport, a `Provider` inside an open transaction enlists message, deliveries and ledger rows in that transaction.

### 4.3 Consume — Database (and staged)

```
WorkQueueHost (per MJ instance)
  start: for each configured subscription → SubscriptionUnsupportedReason / handler registered? → Running | Unsupported | HandlerNotRegistered
  per subscription: ConsumerRuntime(DatabaseConsumer) — ExpireLeases → claim batch → handlers → settle (fenced)
  staged subscriptions: + Stager loop (SQS receive → insert Message/Delivery → delete)
  in-process publish kicks the local runtime
WorkQueueSweeper (every instance, idempotent, DB clock): ExpireLeases, gap stalls, retention purge, dedup purge
```

### 4.4 Consume — AWS (`None`/`Exclusive`)

```
SNS topic ─(filter policy, raw delivery)─► SQS queue per subscription (+ DLQ, redrive MaxAttempts + 2)
  Lambda (CreateSqsLambdaHandler, ReportBatchItemFailures)  or  MJ worker long-poll
  per record: run handler; heartbeat = ChangeMessageVisibility
     Complete → DeleteMessage
     Retry    → ChangeMessageVisibility(backoff); report item failure (FIFO: later items of the group too)
     DeadLetter / exhausted → SendMessage to DLQ with mj_* reason attributes → DeleteMessage
```

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
mj queue skip-sequence --subscription integration.apply --key <integrationId> --sequence 5 --reason "…"
mj queue export-topology --transport AWS-prod > manifest.json
mj queue import-bindings  terraform-output.json
mj queue validate-bindings [--transport AWS-prod]
mj queue work           --subscription venue-import --once    # container-job worker; exits 0
```

`DiscardDelivery` on an in-flight item reports `cancelRequested: true` — the handler is asked to stop, and the row
settles as `Discarded` when its lease expires.

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
| Conformance kit | 25 data-driven cases (`CONFORMANCE_CASES`) gated by capabilities: fan-out, lease expiry, fencing, Exclusive, Ordered blocking, sequence gaps, replay/discard, dedup. Run by `RunConformanceChecks` (no test runner) or `RunTransportConformanceSuite` (vitest) | 04 (kit + InMemory), 05 (Database harness), 06 (live DB in IT94), 07 (AWS via LocalStack, opt-in) |
| Integration (deterministic tier) | Database transport + host + REST publish + remote operations on a live MJ database | 06 |
| Infrastructure | `terraform fmt/validate`, tflint, plan against a sample manifest | 07 |
| Soak (manual runbook) | Throughput and crash injection | 06, 07 |

## 7. Plan map

| Plan | Scope | Depends on |
|---|---|---|
| [04](04-core-implementation-plan.md) | `@memberjunction/work-queue-core` | — |
| [05](05-native-data-implementation-plan.md) | Schema + metadata, SQL executor & builders, Database driver/operator, dedup ledger, `WorkQueueEngine` | 04 |
| [06](06-native-runtime-implementation-plan.md) | Handlers, host, sweeper, remote operations, MJServer wiring, REST extension, CLI, manifests, integration bundle | 05 |
| [07](07-aws-implementation-plan.md) | `@memberjunction/work-queue-aws`, Lambda adapter, engine AWS factory + stager, Terraform module, deployment governance | 04 (package); 06 (engine wiring tasks) |
| [08](08-legacy-queue-port-plan.md) | Repair `MJQueue`, serialisable Entity AI Action references, opt-in routing onto the work queue | 06 |

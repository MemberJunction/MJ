# MJ Work Queue — Design & Implementation Plan (work-queue-1)

A durable, pluggable work-queue subsystem for MemberJunction: producers publish units of work to a **topic**;
independent **subscriptions** receive them with **at-least-once** delivery, **lease-based liveness**, **per-key
exclusivity or strict ordering**, **deduplication**, **retry with backoff**, and **dead-lettering**. The same model
runs on an MJ-native **Database transport** and on **cloud transports** (AWS in Phase 1, Azure as a fast follow),
with consumers hosted **inside MJ** or as **thin external functions** (Lambda) that carry no MJ dependencies.

> Designed independently of `plans/work-queue/`, then revised after a comparison with it (Revision 2), a review against
> MJ Central's queues (Revision 3), and an independent seven-reviewer audit (Revision 4, [11](11-revision-4-review.md)).
> Where an older decision below was changed, it is marked *superseded* and points at the decision that replaced it.

## Document set

| # | Document | Kind |
|---|---|---|
| 00 | [README](README.md) | Index, phases, decision log, glossary |
| 01 | [Use cases](01-use-cases.md) | Requirements |
| 02 | [Implementation overview](02-implementation-overview.md) | Architecture, semantics, flows, plan map |
| 03 | [Interfaces & tables](03-interfaces-and-tables.md) | **Normative contract** — plans must match it |
| 04 | [Core implementation plan](04-core-implementation-plan.md) | Task-by-task: `@memberjunction/work-queue-core` |
| 05 | [Native data implementation plan](05-native-data-implementation-plan.md) | Task-by-task: schema, SQL, Database driver, dedup ledger, engine |
| 06 | [Native runtime implementation plan](06-native-runtime-implementation-plan.md) | Task-by-task: handlers, host, sweeper, remote operations, MJServer, REST, CLI, integration bundle |
| 07 | [AWS implementation plan](07-aws-implementation-plan.md) | Task-by-task: `@memberjunction/work-queue-aws`, Lambda adapter, Terraform, deployment governance |
| 08 | [Legacy queue port plan](08-legacy-queue-port-plan.md) | Task-by-task: repair `@memberjunction/queue`, route it through `@memberjunction/work-queue-legacy-bridge` |
| 09 | [Follow-on specs](09-follow-on/README.md) | Azure (1a), dashboard, gateway, direct publisher, integration runs, email ingestion, batching, GCP, minor |
| 10 | [Consumer guide](10-consumer-guide.md) | Writing handlers and producers; what stays the consumer's job |
| 11 | [Revision 4 review](11-revision-4-review.md) | Independent review findings, the two scope cuts, and the normative change list |
| — | [superseded/](superseded/) | Revision 1 design-detail docs (kept for reference; not normative) |

**Execution order:** 04 → 05 → 06 → (07 and 08 in parallel). 07's `aws` package tasks can start after 04.

## Phase map

| Phase | Scope | Where |
|---|---|---|
| **1** | Core; Database transport (`None`/`Exclusive`/`Ordered`); AWS transport (SNS/SQS/Lambda; `None`/`Exclusive`); MJ host and one-shot container worker; Lambda adapter; REST publish; remote operations + CLI; Terraform module (AWS); legacy `MJQueue` repair + opt-in routing | 03–08 |
| **1a** | Azure transport (Service Bus + Functions) + Terraform module | 09a |
| **Fast follow** | Explorer operator dashboard; lightweight publish gateway host; manifest-cached direct publisher | 09b, 09c, 09d |
| **Follow-on** | Integration runs revamp onto the queue; email event ingestion consumer | 09e, 09f |
| **2** | High-velocity batch ingestion (Firehose → S3 → batch-ready message; Database equivalent); GCP transport | 09g, 09h |

## Decision log

### Confirmed in design review

| # | Decision |
|---|---|
| D1 | **Pluggable transports**: Database for "slow" in-MJ workloads; AWS (SNS/SQS/Lambda) for high velocity; Azure fast-follow; GCP later. |
| D2 | **Three orthogonal axes**: topology (MJ metadata), transport (per topic), compute host (per subscription). |
| D3 | A topic owns its transport binding; a subscription declares topic + filter + host; subscriptions are independent. |
| D4 | Filters operate on envelope attributes only (portable to SNS / Service Bus). |
| D5 | Consumer implementers own host fit. A `MaxProcessingSeconds` above the host's known ceiling (e.g. Lambda's 15 minutes) is a **validation warning**, not a block. At runtime the cap is enforced: the runtime stops renewing the lease and aborts the handler. |
| D6 | Cloud resources are pre-provisioned; governed deployment via Terraform driven by an exported topology manifest. |
| D7 | Partition modes `None` / `Exclusive` / `Ordered`; an `Ordered` dead letter blocks its key until fixed. |
| D8 | `Ordered` means publish order. *(The optional explicit `Sequence` with gap blocking is superseded by R18.)* |
| D9 | Publishing goes through MJ (in-process or REST); REST runs inside MJAPI in Phase 1. |
| D10 | TaskGraph and Scheduled Jobs untouched; integration runs and email ingestion are follow-ons. |
| D11 | No per-message **delivery** ledger for cloud transports (no row per delivery in MJ); dead letters tracked on every transport. The deduplication ledger (R1) is separate: one row per `DeduplicationKey`, in the MJ database, for every transport. |
| D12 | Database transport stores Message (once) and Delivery (per subscription). Statuses `Pending`, `InFlight`, `Completed`, `DeadLettered`, `Discarded`. |

### Revision 2 (after comparison with `plans/work-queue/`)

| # | Decision |
|---|---|
| R1 | **Deduplication key + TTL** per topic, in an MJ-database ledger used by every transport (two-phase reserve/confirm for cloud sends). |
| R2 | **Unique filtered index** `(SubscriptionID, PartitionKey) WHERE Status='InFlight'` enforces single flight; blocking is **derived** from the head delivery. *(The `WorkQueuePartitionState` table is gone entirely — R18.)* |
| R3 | **Discard covers pending work** (cancel) as well as dead letters. **`AllowExternalPublish`** per topic gates REST publishing. |
| R4 | **Remote Operations** are the operator surface (Explorer/GraphQL/CLI); REST is publish-only. |
| R5 | **SQL executor seam** (`WorkQueueSqlExecutor`) with SQL Server/PostgreSQL builders in the engine; no `SQLDialect` change. **Capability gating** at subscription save and host start. |
| R6 | **Legacy `MJQueue`**: repair `QueueTask.Status`, replace live `BaseEntity` task data with serialisable references, **opt-in routing** per queue type onto seeded (disabled) work-queue topics. No deprecation in Phase 1. |
| R7 | Plans written in **task-by-task TDD format** (04–08). |
| R8 | **No DynamoDB.** AWS dead letters live in the SQS dead-letter queue with reason attributes. *(Staging AWS `Ordered` subscriptions into Database delivery rows is superseded by R19: `Ordered` is Database-only.)* |
| R9 | `work-queue-core` has **zero** `@memberjunction` dependencies; `work-queue-aws` depends only on core + AWS SDK. Enforced by dependency guard tests (P5). |

### Revision 3 (after review against MJ Central's hand-rolled queues)

MJ Central runs two queues today (a `Run` row whose `Status` doubles as a lock, scaled by KEDA into one-shot container
jobs; plus a per-connector sync queue). Their experience is [use case 3](01-use-cases.md); it produced one boundary
decision and five changes.

| # | Decision |
|---|---|
| R10 | **The queue's guarantees stop at the handler.** Durable delivery, one valid lease holder while a handler runs, fencing — and nothing else. Duplicate *side effects*, work completed later by a webhook, "one active per key" policy, coalescing, and remote-executor liveness are consumer concerns ([02 §1a](02-implementation-overview.md#1a-where-the-queue-stops), [10](10-consumer-guide.md)). Declined on that basis: an `AwaitExternal` delivery state, a cloud liveness probe before reaping, `UntilResolved` deduplication, and child-process helpers. |
| R11 | **Delivery state is driver-owned.** Messages, Deliveries and Deduplications reject `BaseEntity.Save()`/`Delete()` and disallow create/update/delete through the API; settles happen only through guarded driver SQL. Rationale: a full-row save from a stale snapshot silently overwrites a newer claim (MJ Central's actual failure mode). |
| R12 | **Operators can cancel in-flight work**: `Discard` on an `InFlight` delivery asks the handler to stop and ends as `Discarded`. *(The mechanism — token rotation, key held until the lease expires — is superseded by R21.)* |
| R13 | **One-shot worker mode + autoscaler metric.** `WorkQueueHost.RunOnce()` and `mj queue work --once` for container jobs; `WorkQueue.GetBacklog` and a documented SELECT-only scaler query counting claimable `Pending` **plus** `InFlight` (a Pending-only count starves the queue). |
| R14 | **Transient heartbeat failures are retried within the lease**, and `OnDeadLettered` gives deployments an in-process alerting seam (per-process only — see R24's known limits). Liveness stays in dedicated lease columns — never `__mj_UpdatedAt`. |
| R15 | **Filters reuse MJ's `CompositeFilterDescriptor` shape and `mj-filter-builder` UI**, restricted to the operators brokers can express (`eq`, `neq`, `startswith`, `isnull`/`isnotnull`, single-field OR). `work-queue-core` ships its own small evaluator (it may not depend on `@memberjunction/core`), kept honest by a parity test against `CompositeFilter`; matching is **case-sensitive**, unlike MJ's loose compare. Untranslatable filters are rejected when the subscription is saved. |
| R16 | **`WorkQueueEngineBase` / `WorkQueueEngine` split**, mirroring `AIEngineBase`/`AIEngine`: a browser-safe `@memberjunction/work-queue-base` caches topology metadata for UI and client use; the server `WorkQueueEngine` is a separate singleton that **delegates** to it (composition, as `AIEngine` does) and adds drivers, publishing and the operator. |
| R17 | **Azure stays Phase 1a**, deliberately: Phase 1 proves the pluggable contract with one cloud, and the Azure plan follows the same shape as 07. |

### Revision 4 (after an independent review — [11](11-revision-4-review.md))

Seven fresh-context reviewers checked the spec and every plan against the repository. The lease, fencing and claim
design held up; the plan set was not executable as written. Two scope cuts and a fix revision followed.

| # | Decision |
|---|---|
| R18 | **Explicit sequences are cut.** No `Sequence`, topic `OrderingMode`, gap waiting, `SkipSequence` or `WorkQueuePartitionState`. Nine stuck-key defects across three review passes, and no use case: ordering matters when **one producer** owns the work, and that producer can publish in order. Reopen only for a producer whose ordering authority is external *and* a handler-side version check cannot solve it. |
| R19 | **`Ordered` is Database-only; staged `Ordered` on cloud transports is cut** (stager, `StageDeliveries`, host loop registry, redrive-1000). Ordering holes, backlog churn during a database outage, and dead letters invisible to MJ — for a combination no use case needs. AWS keeps `None` and `Exclusive`; SQS FIFO `Exclusive` already preserves order within a key and lacks only halt-on-dead-letter. Six tables remain. |
| R20 | **A dedup reservation is not a duplicate.** Only a `Confirmed` ledger row returns `Duplicate`. A `Reserved` row owned by the same `MessageID` is re-taken and the send repeated; owned by a different `MessageID` it is `Rejected` `DeduplicationPending` (retryable). Closes a message-loss path when MJ crashes between reserve and send. `MessageID` is globally unique. |
| R21 | **Cancel is a flag the holder acknowledges.** `CancelRequestedAt` without token rotation; `ExtendLease` returns `Held` / `Lost` / `Cancelled`; every other settle is guarded on the flag; `AcknowledgeCancel` makes the row `Discarded` immediately and frees the key. Heartbeats run every `min(LeaseSeconds / 3, 30 s)`, so a cancel is noticed within 30 s whatever the lease length, and an independent lease-horizon timer means a hung renewal call cannot wedge a delivery. |
| R22 | **SQS FIFO is consumed one message at a time** (`MaxNumberOfMessages = 1`, Lambda `batch_size = 1`). This makes `Exclusive` hold for MJ workers and stops followers of a failing message burning receive counts they never used. Receive-time guard at `> MaxAttempts + 2`, redrive at `MaxAttempts + 5`; FIFO DLQ copies use the SQS `MessageId` as their group so a scan is not blocked per key. |
| R23 | **Authorization and isolation.** Remote operations authorize interactive users too (Update on `MJ: Work Queue Subscriptions` to operate, Read on `MJ: Work Queue Deliveries` to read); REST publish takes API keys only and mirrors MJ's resolver scope check; handlers run as the host's system user; payload-bearing entities are readable by administrative roles only. Queue SQL never rides an ambient transaction: consumers, operators and the cloud-path ledger own independent executors. |
| R24 | **Loading, hot paths and stated limits.** The engine's main entry does not import `work-queue-aws` (the AWS factory registers from `work-queue-engine/aws`), and `@memberjunction/queue` does not depend on the engine (routing lives in `@memberjunction/work-queue-legacy-bridge`), so CodeGen, MetadataSync and the CLI load neither. No cross-package re-exports. The claim index covers `Pending` rows only, purge has its own indexes, backlog counts are capped, one sweeper runs at a time, and SQL Server requires `READ_COMMITTED_SNAPSHOT`. Known limits — FIFO-topic throughput and the two-topic pattern, the cost of publishing through MJ with a dedup key, and per-process `OnDeadLettered` — are stated in [02 §7](02-implementation-overview.md#7-known-limits). |

### Found while writing the plans (folded into 03)

| # | Finding | Effect |
|---|---|---|
| P1 | Discarding or skipping a sequence could strand later sequences; a late publish of a resolved sequence could wedge its key forever | *Moot — explicit sequences are cut (R18).* |
| P2 | Two concurrent publishes for one `Ordered` key could commit ordinals out of order | Transaction-scoped application lock per key before the message insert (`sp_getapplock` / `pg_advisory_xact_lock`) — plan 05 |
| P3 | A database outage while staging AWS `Ordered` messages would redrive them to the DLQ and break order | *Moot — staged cloud `Ordered` is cut (R19).* |
| P4 | The conformance kit could only run under Vitest, so it couldn't run against a live database in the integration tier | Data-driven cases + `RunConformanceChecks`; Vitest wrapper in `./testing/vitest`; IT94 runs it against the Database transport |
| P5 | No ESLint config exists in the repo | Package independence is enforced by dependency guard tests, not lint |
| P6 | `packages/WorkQueue/*` is not covered by workspace globs | Added in plan 04 Task 1 |

**Open (minor):** lease owners are set by engine-created drivers rather than the host `InstanceID` (plan 06 CD10) —
cosmetic for diagnostics; revisit if operators need them to match.

### Defaults and smaller calls (review welcome)

| # | Decision |
|---|---|
| W1 | *Superseded by R18* — topics have no ordering mode; `Ordered` is always publish order. |
| W2 | `HeartbeatMode` `Auto` (default) \| `Manual`; `Heartbeat()` resolves `false` once the lease is lost or the item is cancelled. |
| W3 | Backoff full jitter; defaults `MaxAttempts` 5, base 10 s, max 900 s, lease 60 s. |
| W4 | Envelope ≤ 256 KB, ≤ 10 attributes, on every transport. |
| W7 | An AWS topic must be FIFO when any of its subscriptions is `Exclusive`. `None` subscriptions on a FIFO topic are serialised per partition key as a side effect (two-topic pattern for firehoses). |
| W8 | Replay with an edited payload is a follow-on. |
| W9 | `External` hosts only on cloud transports in Phase 1. |

## Glossary

| Term | Meaning |
|---|---|
| **Transport** | Backend that stores and delivers messages (Database, AWS, …). |
| **Topic** | Named destination producers publish to; bound to one transport. |
| **Subscription** | A consumer's standing request for a topic's messages (filter + policy + host). |
| **Message** | One published unit of work (envelope). Immutable. |
| **Delivery** | One subscription's processing of one message: status, attempts, lease. |
| **Lease / lease token** | Time-bounded exclusive right to process a delivery; the per-claim token fences out stale holders. |
| **Partition key** | Producer-supplied key used by `Exclusive`/`Ordered` subscriptions. |
| **Head** | For an `Ordered` key (Database transport): the earliest-published delivery that is still unfinished (`Pending`, `InFlight` or `DeadLettered`). Only the head can be claimed. |
| **Blocked key** | An `Ordered` key whose head is dead-lettered; nothing behind it runs until an operator replays the head to success or discards it. |
| **Deduplication key** | Producer key that suppresses repeat publishes to a topic within a TTL window; only a confirmed reservation counts as a duplicate. |
| **Cancel** | `Discard` on an in-flight delivery: a flag the handler sees at its next heartbeat and acknowledges once stopped. |
| **Topology manifest** | Export of topics/subscriptions/policies; input to Terraform and external consumer config. |
| **Claim-check** | The message carries a `PayloadRef` to data stored elsewhere. |

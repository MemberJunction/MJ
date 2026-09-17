# MJ Work Queue — Design & Implementation Plan (work-queue-1)

A durable, pluggable work-queue subsystem for MemberJunction: producers publish units of work to a **topic**;
independent **subscriptions** receive them with **at-least-once** delivery, **lease-based liveness**, **per-key
exclusivity or strict ordering**, **deduplication**, **retry with backoff**, and **dead-lettering**. The same model
runs on an MJ-native **Database transport** and on **cloud transports** (AWS in Phase 1, Azure as a fast follow),
with consumers hosted **inside MJ** or as **thin external functions** (Lambda) that carry no MJ dependencies.

> Designed independently of `plans/work-queue/`, then revised after a comparison with it (see "Revision 2").

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
| 07 | [AWS implementation plan](07-aws-implementation-plan.md) | Task-by-task: `@memberjunction/work-queue-aws`, Lambda adapter, staging, Terraform, deployment governance |
| 08 | [Legacy queue port plan](08-legacy-queue-port-plan.md) | Task-by-task: repair and route `@memberjunction/queue` |
| 09 | [Follow-on specs](09-follow-on/README.md) | Azure (1a), dashboard, gateway, direct publisher, integration runs, email ingestion, batching, GCP, minor |
| — | [superseded/](superseded/) | Revision 1 design-detail docs (kept for reference; not normative) |

**Execution order:** 04 → 05 → 06 → (07 and 08 in parallel). 07's `aws` package tasks can start after 04.

## Phase map

| Phase | Scope | Where |
|---|---|---|
| **1** | Core; Database transport; AWS transport (SNS/SQS/Lambda, staged `Ordered`); MJ host; Lambda adapter; REST publish; remote operations + CLI; Terraform module (AWS); legacy `MJQueue` repair + opt-in routing | 03–08 |
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
| D5 | Consumer implementers own host fit; `MaxProcessingSeconds` is a warning, not a block. |
| D6 | Cloud resources are pre-provisioned; governed deployment via Terraform driven by an exported topology manifest. |
| D7 | Partition modes `None` / `Exclusive` / `Ordered`; an `Ordered` dead letter blocks its key until fixed. |
| D8 | Publish order by default; explicit `Sequence` optional, gaps block. |
| D9 | Publishing goes through MJ (in-process or REST); REST runs inside MJAPI in Phase 1. |
| D10 | TaskGraph and Scheduled Jobs untouched; integration runs and email ingestion are follow-ons. |
| D11 | No per-message ledger for cloud transports; dead letters tracked on every transport. |
| D12 | Database transport stores Message (once) and Delivery (per subscription). Statuses `Pending`, `InFlight`, `Completed`, `DeadLettered`, `Discarded`. |

### Revision 2 (after comparison with `plans/work-queue/`)

| # | Decision |
|---|---|
| R1 | **Deduplication key + TTL** per topic, in an MJ-database ledger used by every transport (two-phase reserve/confirm for cloud sends). |
| R2 | **Unique filtered index** `(SubscriptionID, PartitionKey) WHERE Status='InFlight'` enforces single flight; blocking is **derived** from the head delivery. `WorkQueuePartitionState` now only tracks explicit-sequence high-water marks. |
| R3 | **Discard covers pending work** (cancel) as well as dead letters. **`AllowExternalPublish`** per topic gates REST publishing. |
| R4 | **Remote Operations** are the operator surface (Explorer/GraphQL/CLI); REST is publish-only. |
| R5 | **SQL executor seam** (`WorkQueueSqlExecutor`) with SQL Server/PostgreSQL builders in the engine; no `SQLDialect` change. **Capability gating** at subscription save and host start. |
| R6 | **Legacy `MJQueue`**: repair `QueueTask.Status`, replace live `BaseEntity` task data with serialisable references, **opt-in routing** per queue type onto seeded (disabled) work-queue topics. No deprecation in Phase 1. |
| R7 | Plans written in **task-by-task TDD format** (04–08). |
| R8 | **No DynamoDB.** AWS `Ordered` subscriptions must be MJ-hosted and are **staged** into Database delivery rows; AWS dead letters live in the SQS dead-letter queue with reason attributes. Strict ordering for external hosts is a follow-on only if a use case appears. |
| R9 | `work-queue-core` has **zero** `@memberjunction` dependencies; `work-queue-aws` depends only on core + AWS SDK. Enforced by lint + tests. |

### Found while writing the plans (folded into 03)

| # | Finding | Effect |
|---|---|---|
| P1 | Discarding or skipping a sequence could strand later sequences; a late publish of a resolved sequence could wedge its key forever | Sequence mark walks past resolved successors; late publishes are inserted `Discarded`; the gap flag clears on arrival (03 §7) |
| P2 | Two concurrent publishes for one `Ordered` key could commit ordinals out of order | Transaction-scoped application lock per key before the message insert (`sp_getapplock` / `pg_advisory_xact_lock`) — plan 05 |
| P3 | A database outage while staging AWS `Ordered` messages would redrive them to the DLQ and break order | Staged queues use redrive `maxReceiveCount = 1000`; failed batches retry one message at a time, holding back later ones |
| P4 | The conformance kit could only run under Vitest, so it couldn't run against a live database in the integration tier | Data-driven cases + `RunConformanceChecks`; Vitest wrapper in `./testing/vitest`; IT94 runs it against the Database transport |
| P5 | No ESLint config exists in the repo | Package independence is enforced by dependency guard tests, not lint |
| P6 | `packages/WorkQueue/*` is not covered by workspace globs | Added in plan 04 Task 1 |

**Open (minor):** lease owners are set by engine-created drivers rather than the host `InstanceID` (plan 06 CD10) —
cosmetic for diagnostics; revisit if operators need them to match.

### Defaults and smaller calls (review welcome)

| # | Decision |
|---|---|
| W1 | Topic `OrderingMode` `PublishOrder` \| `ExplicitSequence`; sequences start at 1 per key. |
| W2 | `HeartbeatMode` `Auto` (default) \| `Manual`; `Heartbeat()` resolves `false` once the lease is lost. |
| W3 | Backoff full jitter; defaults `MaxAttempts` 5, base 10 s, max 900 s, lease 60 s. |
| W4 | Envelope ≤ 256 KB, ≤ 10 attributes, on every transport. |
| W7 | AWS topics must be FIFO when any subscription is `Exclusive`/`Ordered` or the topic is `ExplicitSequence`. |
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
| **Head** | The lowest-ordered unfinished (`Pending`/`InFlight`/`DeadLettered`) delivery of an `Ordered` key. |
| **Blocked key** | An `Ordered` key whose head is dead-lettered. |
| **Staged subscription** | An `Ordered` subscription on a cloud topic whose MJ worker copies messages into Database delivery rows before processing. |
| **Deduplication key** | Producer key that suppresses repeat publishes to a topic within a TTL window. |
| **Topology manifest** | Export of topics/subscriptions/policies; input to Terraform and external consumer config. |
| **Claim-check** | The message carries a `PayloadRef` to data stored elsewhere. |

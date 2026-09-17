# 01 — Use Cases & Requirements

## Use case 1 — Email action recording (high velocity, fan-out)

**Situation.** An email service provider (e.g. SendGrid) calls a webhook with engagement and delivery
events: *delivered, opened, clicked, bounced, dropped, spam report, unsubscribe (including RFC 8058
one-click unsubscribe)*. During a large campaign send these arrive in bursts of thousands per second,
frequently batched (one HTTP request carrying many events), retried by the provider, and **out of
occurrence order**.

**Each event needs several independent handlings:**

| Handling | Needs | Implication |
|---|---|---|
| Record for permanence (event store) | Every event, exactly represented | Idempotent insert keyed on provider event ID; max throughput; no ordering |
| Reporting dashboards | Aggregations | Commutative; tolerant of delay; no ordering |
| Subscriber information update (last engaged, bounce status, suppression) | Must not race on the same subscriber | Exclusive per subscriber; last-writer-wins by event `OccurredAt`, not arrival order |
| One-click unsubscribe | **Must never be dropped**; legally significant | At-least-once, dead-letter visibility, alerting; idempotent downstream |

A failure in one handling (e.g. dashboard store down) must not delay or fail the others.

**Distilled requirements**
- R1.1 Accept a published event durably **before** acknowledging the provider (2xx only after the transport accepted it).
- R1.2 Fan out one published event to N independent subscriptions with **independent** state, retries and dead letters.
- R1.3 Scale ingestion and processing horizontally for bursts; processing may run outside MJ (thin functions).
- R1.4 Per-subscriber **mutual exclusion without ordering** for handlers that mutate subscriber records.
- R1.5 Filter so a subscription only receives the event types it cares about (e.g. unsubscribe handler receives only `unsubscribe`).
- R1.6 Idempotency is the **handler's** responsibility; the queue guarantees at-least-once and supplies stable `MessageID`s.

## Use case 2 — Long-running data integration batches (claim-check, ordered)

**Situation.** A data integration receives multiple inbound batches (files, API pages, change sets). Each
batch is stored in persistent storage **outside** the queue (object storage, staging tables). When a batch
is ready, a producer publishes a small notification: *"batch 7 for integration X is ready at
`s3://…/batch-7.jsonl`, 40,000 records"*. A consumer then performs long-running processing (minutes to
hours), inside MJ because it needs MJ entities.

**Distilled requirements**
- R2.1 Messages carry **references** (claim-check), not bulk data.
- R2.2 Batches for the same integration must be applied **strictly in order** — batch 4 must not apply before batch 3, even if batch 4's notification arrives first.
- R2.3 If a batch fails permanently, **later batches for that integration must not proceed** until an operator fixes it (replays successfully or discards). Other integrations continue.
- R2.4 Processing may run for a long time; the queue must know the worker is still alive and must redeliver if it silently dies.
- R2.5 Only one worker may process a given batch at a time, even across multiple MJ server instances.

## Use case 3 — Long-running jobs in scaled container workers

**Situation.** MJ Central provisions customer environments by running OpenTofu (Terraform) from a Node handler: a child
process that runs 30–90 minutes, with no natural progress boundaries. Work is executed by **one-shot Azure Container
Apps jobs** that KEDA scales from queue depth: a job starts, takes one item, runs it, and exits. Today the "queue" is a
`Run` row whose `Status` column doubles as a lock, claimed by loading the row, checking `Status` in TypeScript and
calling `Save()`.

What that has cost them, and what this design must answer:

| Their experience | Requirement |
|---|---|
| Load-check-`Save()` is not a compare-and-swap; two workers can claim one row, and a full-row save restores a stale lease over the winner's claim. Only a Terraform state lock catches it | R3.1 Claims are single guarded statements; every holder write is fenced (03 §7) |
| A heartbeat that "dirtied" a row wrote nothing, `__mj_UpdatedAt` never moved, and every live run was reaped at 30 minutes | R3.2 Liveness is a dedicated column moved by guarded SQL; system columns are never the lease |
| Frozen heartbeat during a healthy run forced a raise from 30 → 75 minutes plus a cloud liveness probe before reaping | R3.3 Per-subscription `LeaseSeconds` sized by the consumer; transient heartbeat failures retried within the lease |
| Cancel is a flag polled by the heartbeat, up to 60 s late, and a stale save can clear it | R3.4 Cancel revokes the lease: next heartbeat returns `false`, the signal aborts, later settles are fenced |
| A scaler query counting only `Pending` starved the queue for ~40 minutes (scalers subtract running executions) | R3.5 A documented backlog metric counting claimable `Pending` **plus** `InFlight`, from a SELECT-only login |
| Ten startup recovery steps, each with its own stale-state sweep | R3.6 Recovery is lease expiry; no per-state recovery code |
| Requeue creates a new row, losing its place in line | R3.7 Replay keeps the item's identity and position |
| The `Run` row carries queue mechanics *and* output, history and operator UI | R3.8 The item is a claim check; the domain row keeps the rest ([10](10-consumer-guide.md) §1) |

**Not the queue's job** (established with MJ Central, [02 §1a](02-implementation-overview.md#1a-where-the-queue-stops)):
preventing a second Terraform apply (their state lock does that), probing whether a container execution is alive,
deciding what to do with a second sync request, or completing work that a webhook finishes later.

## Cross-cutting requirements (all three use cases)

| ID | Requirement | Design answer (see 02) |
|---|---|---|
| X1 | **Liveness** of a processing thread | Lease + heartbeat; `Auto` or `Manual` heartbeat mode |
| X2 | Handle the **unexplained absence** of an update | Lease expiry → counted as a failed attempt → redelivery (or dead letter at max attempts) |
| X3 | **Prevent duplicate simultaneous handling** | Single-owner claim with lease token (fence); `Exclusive`/`Ordered` add per-key single-flight |
| X4 | **Sequential processing** | `Ordered` partition mode; publish order or explicit `Sequence` with gap blocking |
| X5 | **Dead-letter handling** | Per-subscription dead letters with reason + last error; replay/discard via operator API/CLI; `Ordered` keys block on dead letter |
| X6 | **Durability** across process crash/restart/deploy | State lives in the transport (DB rows / SQS / DynamoDB), never only in memory |
| X7 | **Pluggable infrastructure** | Transport driver interface; DB + AWS in Phase 1, Azure 1a, GCP later |
| X8 | **Multi-instance safety** | All claims are atomic against shared state; clock comparisons use the DB/transport clock |
| X9 | **Operability** | Stats, dead-letter browse, replay, discard (including cancelling in-flight work), blocked-key listing, sequence skip — same API on every transport |
| X10 | **Worker shapes** | In-process host inside MJAPI, or a one-shot container job that claims, runs, drains and exits, scaled from a backlog metric |

## Non-goals (Phase 1)

- Exactly-once processing (handlers are idempotent instead).
- Workflow/graph orchestration (that is TaskGraph).
- Cron scheduling (that is Scheduled Jobs; a scheduled job may *publish*, though).
- Runtime provisioning of cloud resources.
- Per-message delivery history for cloud transports.
- Editing a dead-lettered message's payload before replay.
- Priority queues (a separate topic/subscription is the Phase 1 answer to priority).
- Waiting on external completion as a queue state, cloud liveness probes, "one active per key" deduplication, and
  child-process helpers — all considered with MJ Central and deliberately left to consumers ([09i](09-follow-on/09i-minor-follow-ons.md)).

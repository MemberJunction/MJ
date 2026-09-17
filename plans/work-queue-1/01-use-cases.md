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

## Cross-cutting requirements (both use cases)

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
| X9 | **Operability** | Stats, dead-letter browse, replay, discard, blocked-key listing, sequence skip — same API on every transport |

## Non-goals (Phase 1)

- Exactly-once processing (handlers are idempotent instead).
- Workflow/graph orchestration (that is TaskGraph).
- Cron scheduling (that is Scheduled Jobs; a scheduled job may *publish*, though).
- Runtime provisioning of cloud resources.
- Per-message delivery history for cloud transports.
- Editing a dead-lettered message's payload before replay.
- Priority queues (a separate topic/subscription is the Phase 1 answer to priority).

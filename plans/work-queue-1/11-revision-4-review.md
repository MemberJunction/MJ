# 11 — Revision 4: Independent Review and Resulting Changes

Seven fresh-context reviewers examined the plan set (spec; plans 04, 05 ×2, 06, 07, 08 + follow-ons), verifying claims
against the repository. Verdict: **the core lease/fence/claim design is sound; the plan set was not executable as
written.** This document records the decisions taken and the normative change list. Where it conflicts with an older
statement anywhere in this folder, this document wins until that statement is updated.

## 1. Scope cuts

| # | Cut | Why | Reopen when |
|---|---|---|---|
| S1 | **Explicit sequences** — `Sequence`, topic `OrderingMode`, gap waiting, `SkipSequence`, `WorkQueuePartitionState` (whole table), `AwaitingSequence`/`GapStalled`, sequence sweeper steps, `SequenceGapAlertSeconds`, sequence error codes | Nine stuck-key defects across three review passes (new/re-enabled/filtered subscriptions wait forever; cancel and concurrent discards strand the counter; purge deletes rows the counter needs). No use case: ordering matters when **one producer** owns the work, and that producer can publish in order. | A real producer whose ordering authority is external (a provider's sequence numbers echoed by webhook) **and** a handler-side version check cannot solve it |
| S2 | **Staged `Ordered` on cloud transports** — SQS→database stager, `StageDeliveries`, `StagedToDatabase`, `WorkQueueHostLoopRegistry`, redrive-1000 rule | Ordering holes (shared ordinals across filtered subscriptions; PostgreSQL insert race), backlog churn during a DB outage, dead letters invisible to MJ. 02 already said no use case needs it. | A cloud-hosted topic needs a consumer that halts its key on failure |

After the cuts: **`Ordered` = Database transport only**: a key's deliveries run in publish order, one at a time, and a
dead letter halts the key until an operator replays or discards it. AWS keeps `None` and `Exclusive` (SQS FIFO
`Exclusive` already preserves order within a key; it lacks only halt-on-dead-letter). Tables: **six** (Transport,
Topic, Subscription, Message, Delivery, Deduplication). `OrderKey` is always the message's `PublishOrdinal`.

Producer rule (consumer guide): for one key, do not publish N+1 until N is accepted, or publish both in one call
(Database: one transaction, array order).

## 2. Contract changes (03)

| # | Change |
|---|---|
| F1 | **Dedup reservation is not a duplicate.** Only a `Confirmed` row returns `Duplicate`. A `Reserved` row owned by the **same** `MessageID` is re-taken and the send repeated; owned by a **different** `MessageID` → `Rejected` `DeduplicationPending` (retryable). Closes the crash-between-reserve-and-send message loss. |
| F2 | **Cancel is a flag, acknowledged by the holder.** `Discard` on `InFlight` sets `CancelRequestedAt` (no token rotation). `ExtendLease` returns `'Held' \| 'Lost' \| 'Cancelled'`; every settle except the new `AcknowledgeCancel` is guarded on `CancelRequestedAt IS NULL`. The runtime aborts the handler and calls `AcknowledgeCancel` (token-fenced) → `Discarded` immediately, freeing the key. A dead holder's row is discarded by `ExpireLeases`. `Signal.reason` is `'Cancelled' \| 'LeaseLost' \| 'MaxProcessingSeconds' \| 'Shutdown'`. |
| F3 | **Heartbeat interval is decoupled from lease length**: `min(LeaseSeconds / 3, 30 s)`. Cancels and lease loss are noticed within 30 s regardless of lease size. |
| F4 | **Lease horizon is enforced by its own timer**, re-armed on every `Held`, in `Auto` and `Manual` modes, independent of any in-flight `ExtendLease` call (a hung call cannot wedge a delivery). `Run()` races a pending heartbeat against the horizon. Executions are keyed by `DeliveryID + LeaseToken`. `ProcessBatch` **releases** a key's remaining items after a non-complete (calls `Release`). |
| F5 | **SQS FIFO is consumed one message at a time** (`MaxNumberOfMessages = 1`; Lambda event source `batch_size = 1`), with concurrency from parallel receives/invocations. This makes `Exclusive` hold for MJ workers and stops followers burning receive counts. `Attempt` = `ApproximateReceiveCount`; the receive-time dead-letter guard fires at `> MaxAttempts + 2`; redrive `maxReceiveCount = MaxAttempts + 5`. `Release` and Lambda throttling consume a receive (documented; use event-source `maximum_concurrency`, not reserved concurrency). |
| F6 | **FIFO dead-letter queues use the SQS `MessageId` as `MessageGroupId`** so a scan is not blocked per key; DLQ receives use `WaitTimeSeconds ≥ 1` and loop until consecutive empties. |
| F7 | **Operator authorization.** Remote operations override `Authorize`: API-key callers need the scope; interactive users need **Update** permission on `MJ: Work Queue Subscriptions` (operate) or **Read** on `MJ: Work Queue Deliveries` (read). REST publish requires an **API key** (no JWT sessions) and its scope check mirrors `ResolverBase.CheckAPIKeyScopeAuthorization` (`full_access`, acting context, system user). Handlers run as the host's **system user**; Messages/Deliveries entity read permissions are limited to administrative roles because payloads may hold PII. |
| F8 | **Queue SQL never rides an ambient transaction.** Each consumer, operator and cloud-path ledger owns an independent executor (`CreateIndependentInstance`), released in `Close()`. Only a publish explicitly enlisted by the caller uses the caller's transaction. |
| F9 | **Bounded, index-backed hot paths.** `IX_WorkQueueDelivery_Claim` is filtered to `Status='Pending'`; new `IX_WorkQueueDelivery_Purge (CompletedAt) WHERE Status IN ('Completed','Discarded')` and `IX_WorkQueueMessage_Purge (TopicID, PublishedAt)`; backlog/scaler counts are capped (`TOP 1000`); stats use per-status seeks; one sweeper at a time (application lock). **SQL Server requires `READ_COMMITTED_SNAPSHOT ON`**, verified at engine start. `PartitionKey` and `DeduplicationKey` use a binary collation so both dialects compare case-sensitively. Multi-key publishes take publish-order locks in sorted key order with a lock timeout. |
| F10 | **`MessageID` is globally unique.** Same ID + same canonical envelope (sorted-key JSON of `PartitionKey`, `Attributes`, `Payload`, `PayloadRef`, `CorrelationID`; not `PublishedAt`) → `Duplicate`; otherwise `MessageIDConflict`. |
| F11 | **`PartitionMode` is immutable** once a subscription has deliveries. `Exclusive` retry semantics differ by transport and are documented: on SQS FIFO a retrying message holds its key; on Database it does not. |
| F12 | **Engine loading.** The engine's main entry does not import `work-queue-aws`; the AWS driver factory registers from `@memberjunction/work-queue-engine/aws`, imported only by server bootstraps. `@memberjunction/queue` does **not** depend on the engine: routing registers through a seam in a new `@memberjunction/work-queue-legacy-bridge` package imported by `ServerBootstrap`, so data-provider consumers (CodeGen, MetadataSync, CLI) load neither the engine nor AWS clients. |
| F13 | **No cross-package re-exports** (repo rule): consumers import base symbols from `@memberjunction/work-queue-base` directly. Base has its own tsconfig (`"types": []`, no DOM lib) and a widened dependency guard. `NotifyDeadLettered` is public on the engine; `OnDeadLettered` is documented as in-process only — alert from `GetSubscriptionStats`/DLQ alarms. |

## 3. Plan defects to fix (mechanical)

| Plan | Fix |
|---|---|
| 04 | Test using `tenant.id` contradicts the no-dots rule; add `TransportRejected` to error codes; heartbeat-coalescing and hung-call tests; separate cap/shutdown flags; sorted-key envelope comparison; guard regex for side-effect imports; remove sequence/staging code and conformance cases |
| 05 | **Single CodeGen SQL pass** (keep run 1's tail; the flags and save-guards protect the rows; run `check:codegen-tail`; revert `sync` stamps before staging); missing imports (`BacklogRow`, `ExpiredDeadLetterRow`, `IsWorkJson`, expire constants); create the guard test file with a real `EntityInfo` stub; stage the base package's config files; undefined `USER` in a test; PostgreSQL expire statement returns only dead-lettered rows; rethrow transient errors when enlisted; rollback must not mask the original error; one Database driver instance; executor-tagging fake; facade tests; metadata `directoryOrder` (transports before topics) |
| 06 | `RunOnce` budget counts *received*, not *requested*, deliveries and exits only when nothing is pending or in flight; real-runtime test + integration check; non-zero exit when nothing could run; SIGTERM/SIGINT in both modes with a shared shutdown promise; use core's REST mapping (`Accepted`/`Duplicate`/`Rejected`); auth before body parsing; fix the always-zero `ExpireLeases` assertion and the invalid suite JSON; KEDA sample `restartPolicy: Never`, plan 05's scaler query, `--max-duration`; host `Start`/`Shutdown` race and consumer leak; input bounds on remote operations; do not commit `sync` stamps |
| 07 | Apply F5/F6; per-message `Receive` error handling; precheck empty attribute values; SNS subscription DLQ + alarm; KMS key-policy statements (SNS, CloudWatch Logs); queue-name collision precondition; split an SQS-only client factory for `./lambda`; governance: destructive-change **gate**, apply the reviewed plan artifact, scheduled drift plan, Lambda pause via event-source `enabled`, alias-based rollback; remove the stager and staged-queue rules |
| 08 | Truncate `QueueManager.CreateQueue` process fields to column lengths (Linux `os.release()` is 16 chars vs `NVARCHAR(10)`); SQL cleanup + Setup pre-clean in the integration checks; carry the enqueuing `userID` in the routed payload; a record that does not load is `Retry` until the last attempt (PostgreSQL enqueues before commit); deterministic failures dead-letter immediately; `COLLATE` on the altered column; mandated extended-property block; move routing to the legacy-bridge package (F12) |
| 09 | Filter grammar in 09a/09f/09h → restricted `CompositeFilterDescriptor`; 09b/09c → base/engine split and `mj-filter-builder`; 09i coalescing → declined register; add S1/S2 to the declined register |

## 4. Known limits, stated rather than solved

- **High-velocity AWS topics:** a topic with any `Exclusive` subscription must be FIFO, which caps every subscription on
  it at FIFO quotas. Use the two-topic pattern (standard topic for permanence/reporting, FIFO topic for per-subscriber
  work). Every publish still passes through MJ, and a `DeduplicationKey` costs two MJ-database writes; producers at
  firehose volume should rely on stable `MessageID`s and the direct publisher follow-on (09d).
- **`OnDeadLettered` is per-process.** A dead letter produced by another instance's sweeper fires no local listener.

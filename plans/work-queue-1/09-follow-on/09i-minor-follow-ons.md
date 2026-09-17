# 09i — Minor Follow-ons (Backlog)

Smaller extensions. Each item is a compact spec: summary, design, schema/contract, dependencies, testing,
size, open questions. Priority reflects expected demand after Phase 1.

| # | Item | Priority | Size |
|---|---|---|---|
| 1 | Replay with edited payload | P2 | M |
| 2 | Subscription backfill from retained messages (DB) | P3 | M |
| 3 | DB → cloud bridge (transactional outbox) | P2 | S |
| 4 | Remote-pull API for External consumers on the Database transport | P2 | M |
| 5 | Action-backed handler adapter | P2 | S |
| 6 | Priority lanes | P3 | S (pattern) / M (engine) |
| 7 | Per-key concurrency > 1 and latest-wins coalescing | P3 | M |
| 8 | Sampled per-message delivery ledger for cloud transports | P3 | M |
| 9 | Cancel reason on the abort signal (the rest of C8 shipped in Phase 1) | P2 | S |
| 10 | `Ordered` for External (serverless) hosts on cloud transports | P3 (only with a real use case) | L |

Items **considered and declined** in Revision 3 are recorded at the end, with the evidence that would reopen each.

---

## 1. Replay with edited payload (W8)

**Summary.** Operators can fix a dead-lettered message's payload or attributes, then replay it. It keeps the
same `MessageID` and order position, which matters for `Ordered` keys.

**Design.**
- Messages stay immutable. The edit is stored as a **replay override** on the delivery or dead-letter record.
  The handler receives the overridden envelope, and `WorkContext.IsReplay = true` plus a new
  `WorkContext.ReplayEdited = true`.
- **DB:** `WorkQueueDelivery.ReplayPayload nvarchar(max) NULL`, `ReplayAttributes nvarchar(4000) NULL`,
  `ReplayEditedByUserID`. The claim join uses `COALESCE(d.ReplayPayload, m.Payload)`.
- **Staged subscriptions (cloud `Ordered`):** same as DB — the delivery row carries the override.
- **AWS (SQS dead-letter queue) / GCP (`<sub>.dlq`) / Azure (dead-letter subqueue):** dead-letter copies are
  immutable; replay already re-sends a copy to the source (scan-based), so the edited envelope is simply what gets
  re-sent, with the same `MessageID` and partition key. The original stays in the operator's audit log.
- **Validation:** the edited envelope passes `ValidatePublishRequest` (03 §1.1). `PartitionKey` and `Sequence`
  are **not editable** (they'd corrupt ordering). Filter attributes may change, but only affect this
  subscription's delivery.
- **Audit:** the original payload is retained (message row / record history). The DB entity keeps
  `TrackRecordChanges=0`, so the override columns carry who and when.

**Contract.** `ITransportOperator.Replay(subscription, deliveryID, actorUserID, note, edit?: { Payload?, PayloadRef?, Attributes? })`;
the `WorkQueue.ReplayDeadLetter` remote operation input gains `edit`.

**Testing.** Edited replay on an `Ordered` blocked head → the key resumes and the handler sees the edit;
PartitionKey edits are rejected.

**Open question.** Should edits require a second approver for `email.unsubscribe`-class subscriptions?

---

## 2. Subscription backfill (Database transport)

**Summary.** A newly created subscription can receive messages published before it existed, within the
topic's `RetentionDays`.

**Design.**
- Operator command `mj queue subscriptions backfill --subscription X --from <ISO>`.
- Creates deliveries in chunks (1,000 by `PublishOrdinal`) with
  `INSERT … SELECT … WHERE TopicID=@t AND PublishedAt >= @from AND NOT EXISTS delivery` and the filter
  evaluated in TypeScript per chunk (filters are JSON; no SQL translation).
- `OrderKey` is preserved, so `Ordered` semantics hold. Backfilled items interleave correctly by ordinal
  with live items.
- Throttled, resumable via `WorkQueueSubscription.BackfillCursor bigint NULL`.

**Cloud.**
- AWS: not supported (no retained log).
- GCP: topic retention + `Seek` can emulate it for new subscriptions (note only).
- Azure: not supported.

**Open question.** Purge interaction: messages purged mid-backfill are silently skipped. Is that acceptable?

---

## 3. DB → cloud bridge (transactional outbox)

**Summary.** Atomic "save MJ data + publish" to a cloud topic. Publish to a DB topic inside the entity
transaction (02 §4.2); a bridge subscription republishes to the cloud topic.

**Design.**
- A built-in handler `WorkQueue.Bridge` (`@RegisterClass(BaseWorkHandler, 'WorkQueue.Bridge')`). Subscription
  `BindingConfig: { "TargetTopic": "email.events" }`.
- The handler republishes with the **same `MessageID`**, `PartitionKey`, `Sequence`, `Attributes`, `Payload`
  and `CorrelationID`. `Duplicate` counts as success.
- Ordering: make the bridge subscription `Ordered` by partition key when the target topic has ordered
  consumers; otherwise `None` for throughput.
- A cloud publish failure → `Retry` (backoff). A target topic missing → `DeadLetter`.
- Throughput is bounded by the DB transport, which is appropriate: the outbox protects correctness, not volume.

**Testing.** Transaction rollback → nothing bridged; kill during republish → duplicate suppressed on FIFO,
tolerated on standard.

---

## 4. Remote-pull API for External consumers on the Database transport (W9 → C9)

**Summary.** External processes (no DB access) consume DB-transport subscriptions over HTTP. This removes the
Phase 1 incompatibility (`External` × `Database`).

**Design.** New REST routes on the `work-queue-server` extension (Revision 2 REST is publish-only, so this adds a
second route family), scope `workqueue:consume` on the subscription name:

| Route | Maps to |
|---|---|
| `POST /subscriptions/{sub}/receive` `{ Max ≤ 50, WaitSeconds ≤ 20 }` | claim (long-poll server-side with adaptive wait) → `ReceivedDelivery[]` |
| `POST /subscriptions/{sub}/deliveries/{id}/extend` `{ LeaseToken, LeaseSeconds, Progress? }` | `ExtendLease` → `{ Result: 'Held'|'Lost' }` |
| `…/complete`, `…/retry` `{ DelaySeconds, Error }`, `…/dead-letter` `{ Reason, Error }`, `…/release` | settle (fenced on `LeaseToken`) |

- Core `RemotePullTransportConsumer implements ITransportConsumer` over HTTP, so external hosts run the
  standard `ConsumerRuntime`.
- The lease owner is recorded as `remote:{apiKeyId}:{clientInstanceId}`.
- Validation change: the Database driver reports `SupportsExternalHosts: true` for subscriptions whose
  `BindingConfig.RemotePull = true`, so `SubscriptionUnsupportedReason` (03 §5) accepts them (C9).

**Risks.** It puts MJAPI or the gateway (09c) in the consume path; it's for modest volumes only. Long-poll
connections hold server resources, so the number of concurrent receives per key is capped.

---

## 5. Action-backed handler adapter

**Summary.** A subscription runs an MJ **Action** with no handler code, reusing Actions' typed params, result
codes and execution logs (`packages/Actions/Engine/src/generic/BaseAction.ts`; `ActionEngineServer.RunAction`
in `packages/Actions/Engine/src/generic/ActionEngine.ts`; `RunActionParams` in
`packages/Actions/Base/src/ActionEngine-Base.ts`).

**Design.**
- Built-in `HandlerKey = 'WorkQueue.RunAction'`. Subscription `BindingConfig`:
  ```json
  { "ActionID": "…", "ParamMap": { "RecordID": "$.Payload.recordId", "Mode": "=full" },
    "RetryResultCodes": ["RATE_LIMITED", "TIMEOUT"], "DeadLetterResultCodes": ["INVALID_INPUT"] }
  ```
- `ParamMap` values: a JSONPath into the envelope (`$.Payload…`, `$.Attributes…`, `$.MessageID`) or a
  literal (`=…`).
- Outcome mapping:
  - `Success` → `Complete`
  - `ResultCode` in `RetryResultCodes` → `Retry`
  - in `DeadLetterResultCodes` → `DeadLetter`
  - other failures → `Retry` (attempts bound it)
  - thrown → `Retry`
- `WorkContext.Signal` → `RunActionParams.AbortSignal`. `ContextUser` = the subscription's configured run-as
  user (new `WorkQueueSubscription.RunAsUserID` NULL; default = system user).
- **MJQueue parity:** the Phase 1 legacy routing (plan 08) runs `@memberjunction/queue` task types through a
  fallback handler that invokes the registered `QueueBase` driver. Task types that are really Actions could later
  switch their subscription's `HandlerKey` to this adapter.

---

## 6. Priority lanes

**Recommendation: pattern first.** Separate topics or subscriptions per priority
(`email.unsubscribe` vs `email.reporting`) with **dedicated worker concurrency** per subscription in the
`workQueue` config. That covers the need without engine changes.

**Engine option (if demanded).**
- `WorkQueueDelivery.Priority tinyint`, set from a topic-defined attribute mapping.
- The claim orders by `Priority DESC, VisibleAt`, with an aging term to prevent starvation
  (`effective = Priority + minutes waited / AgingMinutes`).
- Index `(SubscriptionID, Status, Priority, VisibleAt)`.
- Not portable to SQS or Pub/Sub (no priority), so it would be a DB-only feature. That argues for the pattern.

---

## 7. Per-key concurrency > 1 and latest-wins coalescing

**Per-key concurrency.**
- New `WorkQueueSubscription.PartitionConcurrency int NULL`, for `Exclusive` only.
- **DB / staged:** Revision 2 enforces single flight with the unique index
  `(SubscriptionID, PartitionKey) WHERE Status='InFlight'`, which can't express N. Add `WorkQueueDelivery.Lane
  tinyint NOT NULL DEFAULT 0` (`hash(MessageID) % N`, set at publish/staging) and widen the index to
  `(SubscriptionID, PartitionKey, Lane)`: at most one in flight per lane, so at most N per key. N=1 keeps `Lane = 0`
  and today's behavior.
- **AWS:** FIFO groups are single-flight, so emulate with sharded group IDs `key#(hash(MessageID) % N)`.
  This is approximate and breaks key-level mutual exclusion into N lanes.
- **Azure:** multiple sessions per key via the same sharding.
- The documentation must say plainly that N>1 is "at most N concurrent", not load-balanced.

**Latest-wins coalescing.**
- New `PartitionMode = 'Coalesce'`: only the newest pending item per key is handled; superseded items settle
  as `Completed` with `ResolutionNote='Superseded'` (no handler call).
- **DB:** at claim, pick the max `OrderKey` Pending delivery per key and complete older pending ones in the
  same statement.
- **AWS (and other cloud transports):** Revision 2 has no external state store, and thin consumers can't read the
  MJ database. `Coalesce` is therefore supported only for MJ-hosted subscriptions, **staged** into Database rows
  like `Ordered` (03 §5.1), where the DB claim rule above applies. External `Coalesce` would need the same state
  store as item 10.
- Use cases: "recompute subscriber score", "refresh cache for record X".

---

## 8. Sampled per-message delivery ledger (cloud)

**Summary.** Optional answers to "what happened to message X?" on cloud transports, without a DB write per
delivery (D11 keeps it off by default).

**Design.**
- A runtime `DeliveryLedgerSink` interface emits events: `Received`, `Settled{status, attempt, durationMs}`,
  `LeaseLost`.
- Sampling per subscription: `LedgerSampleRate` 0–1. Dead-letter and replay events are always emitted.
- Sinks:
  - CloudWatch Logs EMF (default, queryable via Logs Insights by MessageID)
  - Firehose → S3 (analytics)
  - MJ REST batch endpoint (low volume only)
- Operator surface: a `WorkQueue.GetMessageHistory` remote operation (`workqueue:read`) queries the configured sink
  (Logs Insights on AWS). It's best-effort and eventually consistent.

---

## 9. Cancel reason on the abort signal (residue of C8)

**In-flight cancel itself shipped in Phase 1** (Revision 3, R12). `WorkQueue.DiscardDelivery` on an `InFlight`
delivery sets `WorkQueueDelivery.CancelRequestedAt`, rotates `LeaseToken` and answers `CancelRequested: true`; the
holder's next heartbeat resolves `false`, `WorkContext.Signal` aborts, any later settle is fenced, and the row
becomes `Discarded` when its lease expires (03 §7, capability `CancelInFlight`). No separate
`ITransportOperator.CancelInFlight` method was added — `Discard` covers `Pending`, `InFlight` and `DeadLettered`.
AWS (non-staged) reports `CancelInFlight: false`; staged `Ordered` subscriptions get the Database behaviour.

**What is left.** A handler cannot tell *why* it was stopped: lease lost, host shutting down, or operator cancel all
surface as `Heartbeat() → false` and an aborted `Signal`. Handlers that want to record "cancelled by operator" on
their domain row (09e's integration runs, for one) must infer it.

**Design.** Carry a reason on the abort: `WorkContext.Signal.reason` set to a typed
`WorkAbortedError { Kind: 'LeaseLost' | 'Cancelled' | 'Shutdown' | 'MaxProcessingSeconds' }`, sourced from the
transport's `ExtendLease` result (`'Held' | 'Lost' | 'Cancelled'`) plus the runtime's own reasons. A handler that
sees `Cancelled` may still settle: the fence has not moved for shutdown, and for cancel the queue ignores the
outcome because the row is already destined for `Discarded`.

**Schema.** None beyond Phase 1's `CancelRequestedAt`; add `CancelRequestedByUserID` only if the operator identity
is wanted separately from `ResolvedByUserID`.

**Size.** S. **Priority.** P2 — cosmetic until a consumer needs cancelled-vs-crashed on its own record.

---

## 10. `Ordered` for External (serverless) hosts on cloud transports

**Summary.** Let thin, MJ-free consumers (Lambda, Azure Functions, Cloud Run) run `Ordered` subscriptions — strict
per-key order, blocking on dead letter, explicit-sequence gaps. Revision 2 deliberately leaves this out: cloud
`Ordered` subscriptions must be `HostType = 'MJWorker'` and are staged into the Database transport (03 §5.1).
**Build this only if a real use case appears** (neither Phase 1 use case needs it: email events use `None`/`Exclusive`;
ordered integration batches need MJ entities).

**Why it's hard.** SQS FIFO, Pub/Sub ordering keys and Service Bus sessions all release a key after a dead letter,
and an early-arriving explicit sequence would stall a FIFO group if left unacknowledged. Strict blocking therefore
needs per-key control state plus **parking** (move blocked/early messages out of the queue, release them in order
later).

**Options.**

| Option | Transport | Notes |
|---|---|---|
| Azure Service Bus **session state + deferred messages** | Azure | no extra infrastructure; single writer via the session lock; state size bounds the parked list (analysis in 09a, "Optional extension") |
| **DynamoDB** single-table state (key state, parked items, dead-letter records) with conditional writes | AWS | the Revision 1 design (see `../superseded/05-aws-implementation-design.md`, Ordered-mode section); adds a table, IAM and a state sweeper |
| **Firestore** key documents + `parked` sub-collections | GCP | sketched in 09h, "Optional extension" |
| **Cosmos DB / Table Storage** | Azure | only if session-state size limits bite |
| MJ remote-pull (item 4) | any | not serverless-thin, but gives External hosts Database semantics without a new store |

**Contract.** Flip `TransportCapabilities.SupportsOrdered` to `true` for the transport; `SubscriptionUnsupportedReason`
(03 §5) then accepts External `Ordered`. A shared `PartitionStateStore` interface (key state, park, release,
dead-letter record) keeps one reducer and one conformance suite across stores.

**Testing.** The full `Ordered` section of the conformance kit (blocking, replay-as-head, discard-releases,
sequence gaps, skip) against each store, plus crash injection between park-write and message delete.

**Open question.** Is Azure's native session-state option enough to satisfy the first real use case, avoiding a
store on AWS/GCP entirely?

---

## Considered and declined (Revision 3)

Reviewed against MJ Central's two hand-rolled queues ([01](../01-use-cases.md) use case 3) and declined on the
boundary rule in [02 §1a](../02-implementation-overview.md#1a-where-the-queue-stops): the queue guarantees durable
delivery, one valid lease holder while a handler runs, and fencing — everything else is the consumer's. Each row
names the evidence that would reopen it.

| Declined | Why | Consumer does this instead | Reopen when |
|---|---|---|---|
| **`AwaitExternal` delivery state** — a delivery parks (lease released, key still held) until `CompleteExternal(completionKey)` or a timeout | Needs a new status, a completion-key index, a widened in-flight index, a timeout sweeper and a new API; works only on Database/staged, so the contract would diverge per transport. It also puts the domain's stall policy inside the queue | Split-message pattern ([10](../10-consumer-guide.md) §5): the handler starts the vendor job, records it on its domain row and completes; the webhook publishes a completion message. Overlap, coalescing and stall detection stay with the integration, which knows the rules | Many concurrent long external jobs make worker slots (option B: hold the lease and poll) genuinely expensive, **and** the split-message pattern's domain bookkeeping has been written more than twice |
| **Cloud liveness probe before reclaiming a lease** — sweeper asks the platform (e.g. Azure's execution API) whether the lease owner is alive before expiring it | Makes lease expiry cloud-aware and non-SQL, needs a probe registry and an owner-ID convention, and a dead-but-reported-alive executor blocks its key indefinitely. MJ Central needed it because its heartbeat was entangled with a full-row `Save()`; ours is a small guarded update, retried within the lease | Size `LeaseSeconds` above the worst plausible heartbeat outage, and guard non-restartable side effects in the handler (a state lock or a domain row claimed by conditional UPDATE) — [10](../10-consumer-guide.md) §4 | Long-lease subscriptions still see healthy-but-silent workers reclaimed in practice, with lease sizing already tuned |
| **`DeduplicationMode = 'UntilResolved'`** — hold a deduplication key until the work finishes instead of for a TTL | "Resolved" is ambiguous under fan-out (all subscriptions? the first?), couples the ledger to delivery state, cannot work on AWS (no per-message tracking), and a dead letter silently blocks publishes until an operator acts | `Exclusive` serialises deliveries per key, so the handler can check its domain row without a race and coalesce or complete; a short `DeduplicationKey` TTL absorbs genuine double-submits — [10](../10-consumer-guide.md) §6 | A consumer needs cross-transport "one active per key" *at publish time* (not at handle time) and cannot see domain state from the producer |
| **Child-process / heartbeat helpers in core** — `HeartbeatWhile(promise)`, `RunChildProcess` with SIGTERM→grace→SIGKILL and a bounded output tail | `HeartbeatMode: 'Auto'` already renews the lease while a handler awaits anything, so no helper is needed for liveness; signal escalation and output tails are domain utilities, and Node-only code has no place in the Lambda-safe core | Await normally, honour `context.Signal`, set `MaxProcessingSeconds`, and offload CPU-bound work off the event loop — [10](../10-consumer-guide.md) §3 | Several consumers ship near-identical process-supervision code; then it belongs in a general MJ Node utility, still not in `work-queue-core` |

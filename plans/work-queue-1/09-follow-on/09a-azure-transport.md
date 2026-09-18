# 09a — Azure Transport (Service Bus + Functions) — Phase 1a

## Summary

An `Azure` transport driver implementing the Phase 1 contract (`ITransportDriver`, `ITransportConsumer`,
`ITransportOperator`) on **Azure Service Bus** topics and subscriptions. It includes a **Functions host
adapter**, an MJ-worker consumer built on `@azure/service-bus`, and a Terraform `azurerm` module whose inputs
and outputs mirror the AWS module. Service Bus fits the model more closely than SNS/SQS:
- Fan-out, filters, dead-lettering and exclusive per-key sessions are native to each subscription.
- There's no topic-wide FIFO constraint.
- Phase 1a mirrors the AWS capability profile (03 §5): `SupportsOrdered: false`, so an `Ordered` subscription on
  an Azure topic is **rejected at save** ("Ordered requires the Database transport", 03 §5). Revision 4 removed
  staging cloud messages into the database (11 §1, S2); Azure offers `None` and `Exclusive`; `Exclusive` on a
  session delivers a key's messages one at a time in session order (a retried message rejoins at the end), and lacks
  halt-on-dead-letter. **Session state** could later
  enforce `Ordered` natively; that analysis is kept below as an optional extension, gated on a real use case (09i).

## Motivation

- Customers on Azure need the high-velocity path without AWS.
- Validates that the contract in 03 really is transport-neutral before GCP (09h).

## Scope / Non-goals

**In scope:** a new package `@memberjunction/work-queue-azure` (core + `@azure/service-bus` + `@azure/identity`,
no MJ dependencies), driver registration for MJ, a Functions adapter, the Terraform module, operator
operations, conformance-kit runs.

**Non-goals:**
- Event Hubs (batch ingestion is 09g).
- Premium-only features as a hard requirement (Premium is supported, not required).
- Service Bus queues without topics.
- Runtime provisioning (D6 still applies).

## Concept mapping

| Contract concept | Service Bus construct | Notes |
|---|---|---|
| Topic | Topic | `supportOrdering=true` when the MJ topic is `IsFifo` |
| Subscription | Subscription | independent cursor, lock and DLQ per subscription (native fan-out) |
| Filter | Subscription rule (SQL filter) | translated from 03 §4; default `$Default` rule removed |
| Lease | Peek-lock | `LockDuration` ≤ 5 min (service max) |
| Heartbeat | `renewMessageLock` / `renewSessionLock` | SDK auto-renew for `Auto`; explicit for `Manual` |
| `Exclusive` | Sessions (`requiresSession=true` on **that subscription**), `SessionId = PartitionKey` | Session receivers are exclusive per session and deliver a key's messages in order. Other subscriptions on the same topic aren't affected. |
| Order within a key | Session FIFO order (`SequenceNumber`) | publish order; there are no producer sequence numbers (11 §1, S1) |
| Dead letter | `$DeadLetterQueue` subqueue | `deadLetterReason` / `deadLetterErrorDescription` set by the runtime |
| Crash backstop | `MaxDeliveryCount = MaxAttempts + 5` (03 §5.1's margin) | Service Bus auto-dead-letters with reason `MaxDeliveryCountExceeded`; the runtime counts attempts in `mj_attempt`, so abandon/release does not burn a handler attempt |
| `Ordered` | **unsupported in Phase 1a** — put the topic on the Database transport | same as AWS (03 §5); native session-state option below |
| Blocked key / parked items | n/a | optional extension only: session state + deferred messages |
| Publish dedup | MJ ledger (`DeduplicationKey` + TTL, 03 §2.1, two-phase reserve/confirm); also `requiresDuplicateDetection` on topic with `MessageId = MessageID` | native window configurable (default 10 min); silent, so `Duplicate` is reported only by the ledger |

### Limits (verify at implementation against current Azure docs)

| Limit | Standard | Premium | Contract impact |
|---|---|---|---|
| Message size | 256 KB | up to 100 MB (large message support) | 03's 256 KB envelope cap still applies (W4), so topics stay portable |
| Session state size | same as message size | same | only relevant to the optional native-`Ordered` extension |
| Lock duration | ≤ 5 min | ≤ 5 min | policy validation: `LeaseSeconds ≤ 300` (C3) |
| Application properties | total header ≤ 64 KB | same | 03's 10-attribute rule is stricter |
| Transactions across entities | "send via" only | same | JS SDK support is limited, so settle + re-send isn't atomic (at-least-once) |

## Design

### Publish

`ServiceBusSender.sendMessages(batch)` builds a batch with `createMessageBatch`. Each `WorkMessage` becomes:
- `body` = the envelope JSON
- `messageId` = `MessageID`
- `sessionId` = `PartitionKey`, only when the topic is `IsFifo`. When a FIFO topic gets a message without a key, `sessionId = MessageID` (each message is its own session).
- `applicationProperties` = `Attributes` (the reserved `mj_*` names — `mj_target`, `mj_attempt`, `mj_replay` — are set only by the runtime)
- `correlationId` = `CorrelationID`

Result mapping: a successful send → `Accepted`. Duplicate detection is silent on Service Bus, so `Duplicate`
can't be reported and duplicates return `Accepted` (documented, same as AWS standard topics).

### Filter translation

A new `ToServiceBusSqlFilter(filter: SubscriptionFilter, subscriptionName)` function translates the restricted
`CompositeFilterDescriptor` of 03 §4 (one constraint per field; top-level AND; single-field OR groups of `eq`),
operator by operator:

| 03 §4.1 operator | Descriptor | SQL filter |
|---|---|---|
| `eq` | `{ field: "eventType", operator: "eq", value: "click" }` | `eventType = 'click'` |
| OR group of `eq` on one field | `{ logic: "or", filters: [eq "a", eq "b"] }` | `eventType IN ('a','b')` |
| `neq` | `{ field: "source", operator: "neq", value: "test" }` | `EXISTS(source) AND source <> 'test'` (explicit `EXISTS`: a missing attribute fails every operator except `isnull`) |
| `startswith` | `{ field: "tenant", operator: "startswith", value: "acme-" }` | `tenant LIKE 'acme-%'` (escape `%`, `_` and `[` in the value) |
| `isnotnull` / `isnull` | `{ field: "priority", operator: "isnotnull" }` | `EXISTS(priority)` / `NOT EXISTS(priority)` |
| top-level `and` | — | `AND` |

Values are single-quoted with `'` doubled. Attribute keys are `[A-Za-z0-9_-]` (03 §1 — no dots), so a key
containing `-` is bracket-quoted (`[my-key]`). Matching is case-sensitive, as on every transport (03 §4.3); Service
Bus SQL string comparison is ordinal, which agrees. The Azure capability constant declares the same
`Filters: FilterSupport` as AWS (`eq`, `neq`, `startswith`, `isnull`, `isnotnull`; `SingleFieldOrGroups: true`;
5 fields; 50 values), so an untranslatable filter is rejected when the subscription is saved.

**Every** subscription rule is wrapped with the targeting clause used by retries (below):
`(NOT EXISTS(mj_target) OR mj_target = '<subscriptionName>') AND (<translated filter>)`.

### Consumer: non-session subscriptions (`None`)

- **Receive:** `receiveMessages(max, { maxWaitTimeInMs })` in peek-lock mode. `DeliveryID` = `lockToken`, and
  `LeaseToken` = `lockToken`, since the lock token *is* the fence.
- **ExtendLease:** `renewMessageLock`; a `MessageLockLostError` → `'Lost'`.
- **Complete:** `completeMessage`.
- **Retry with delay.** `abandonMessage` has **no delay parameter**: it redelivers immediately and increments
  `DeliveryCount`. The options were:

  | Option | Behavior | Verdict |
  |---|---|---|
  | Abandon | immediate redelivery, a hot loop at failure rate | ❌ violates backoff (W3) |
  | Defer + a scheduled "wake" control message | message stays in place, fetched by sequence number when the wake arrives | ✅ needed for sessions, but overkill for `None` |
  | **Scheduled re-send + complete** | `scheduleMessages(copy, now+delay)` to the topic with `mj_target=<sub>` and `mj_attempt=n+1`, then `completeMessage(original)` | ✅ **chosen for `None`** |

  Why re-send for `None`: no ordering is at stake, the copy is visible only to this subscription (targeting
  clause), and the attempt count lives in `mj_attempt` rather than `DeliveryCount`, which resets on each copy.
  If the process crashes between schedule and complete, you get a duplicate delivery; that's acceptable under
  at-least-once.
- **DeadLetter:** `deadLetterMessage(msg, { deadLetterReason, deadLetterErrorDescription })`.
- **Release** (shutdown): `abandonMessage` (immediate; the attempt isn't counted because the runtime tracks
  `mj_attempt`).

### Consumer: session subscriptions (`Exclusive`)

A session receiver (`acceptNextSession`) owns one partition key at a time, which gives `Exclusive` single flight
natively. Retry uses the same **scheduled re-send + complete** as `None`, keeping `SessionId`: the copy lands at the
end of the session, which is allowed because `Exclusive` promises no order. Dead letter → `deadLetterMessage`, and
the session continues. No session state is needed. (Contrast with SQS FIFO, where a retrying message holds its
group — 03 §5.1, F11: `Exclusive` retry semantics differ by transport, and on Azure, as on the Database transport,
a retrying item does **not** hold its key.)

### Capabilities, and `Ordered` (Phase 1a: unsupported)

`TransportCapabilities` for Azure: `SupportsOrdered: false`, `SupportsExternalHosts: true`, `CancelPending: false`,
`CancelInFlight: false` (a peek-lock cannot be revoked from outside the receiver, so the cancel flag of 03 §7 has
nowhere to live), `ListPartitions: false`, `PeekDeadLetters: 'Full'` (non-destructive peek),
`ReplaySingleDeadLetter: true`, `PersistsProgress: false`, `MaxRetryDelaySeconds` bounded by scheduled-enqueue
(effectively unbounded), `Filters` as above.

`SubscriptionUnsupportedReason` (03 §5) therefore rejects an `Ordered` subscription on an Azure topic with "Ordered
requires the Database transport" — no Azure-specific code. A workload that needs halt-on-dead-letter puts its topic
on the Database transport; an Azure event stream that needs one such consumer bridges to a Database topic (09i §3).

### Optional extension: native `Ordered` via session state (not in Phase 1a)

Only if a use case needs `Ordered` on an Azure topic (09i §10 and its declined register). It would flip
`SupportsOrdered` to `true` for Azure. The sketch below predates Revision 4 and is kept as a starting point; with
explicit sequences cut (11 §1, S1) it needs no `LastCompletedSequence`, `AwaitingSequenceSince` or `skip` control
message — only blocking, parking and retry-hold.
A session receiver (`acceptNextSession`) owns one partition key at a time. **Session state** (JSON, one per
session) holds the key's control data:

```ts
interface AzureSessionState {
  V: 1;
  BlockedByMessageID: string | null;        // Ordered: dead-lettered head
  BlockedDeadLetterSeq: number | null;      // its $DeadLetterQueue SequenceNumber
  Parked: { Seq: number; Order: number }[]; // deferred SB SequenceNumbers, sorted by Order
  RetryHead: { Seq: number; NotBefore: string; Attempt: number } | null;
  Checkpoint?: WorkJson;                    // C6
}
```

Per received message (in session order):

```
load state
├─ mj_control present (always handled first, never parked)
│    'wake'    → complete; if RetryHead due → receiveDeferredMessages([RetryHead.Seq]) → run
│    'unblock' → complete; clear BlockedByMessageID; release Parked in Order
├─ MessageID = BlockedByMessageID (replay copy) → run handler (it is the head)
├─ BlockedByMessageID set       → defer(msg); Parked += {Seq, Order}; setState   (Ordered only)
├─ RetryHead set (Ordered)      → defer(msg); Parked += …                         (hold position)
└─ otherwise                    → run handler
outcome
├─ Complete   → complete; release the next Parked item via receiveDeferredMessages (in Order)
├─ Retry      → defer(msg); RetryHead = {Seq, NotBefore, Attempt+1};
│               scheduleMessages(wake{SessionId, mj_target, mj_control:'wake'}, NotBefore)
│               Exclusive: continue with the next session messages meanwhile (order not promised)
│               Ordered: everything after is parked until RetryHead resolves
├─ DeadLetter → Ordered: BlockedByMessageID = MessageID; deadLetter(msg); key blocked
│               Exclusive: deadLetter(msg); continue
```

**Why session state instead of an external store (evaluated).** It's transactionally tied to the session lock:
only the lock holder can call `setSessionState`, which gives single-writer semantics for free. It survives
restarts, costs nothing extra, and needs no extra IAM or resources. The limit is size: at 256 KB (Standard),
about 8–10k parked entries per key. When `Parked` would exceed a safe bound (default 5,000), the key raises
operator visibility (`Condition = 'Blocked'`, alert). Further messages are deadlettered
with reason `ParkOverflow` rather than silently dropped. Premium raises the bound. An external store
(Table Storage / Cosmos DB) is noted as an escape hatch in Open questions.

**Deferred messages keep their lock-free position.** They can only be retrieved by `SequenceNumber`, which is
why `Parked` stores them.

### Liveness

| `HeartbeatMode` | Mechanism |
|---|---|
| `Auto` | SDK `maxAutoLockRenewalDurationInMs = MaxProcessingSeconds*1000` (or ∞) on the receiver; the session lock also auto-renews |
| `Manual` | auto-renew disabled; `context.Heartbeat()` → `renewMessageLock` + `renewSessionLock` |

A lost session lock → `SessionLockLostError` → abort **all** handlers from that session and settle nothing
(another receiver takes the session and redelivers). Heartbeats follow 03 §3.2: the interval is
`min(LeaseSeconds / 3, 30 s)`, and the lease horizon is enforced by the runtime's own timer, not by the SDK call.

### Hosts

**MJ worker.** `AzureTransportDriver` is registered via `@RegisterClass(BaseTransportDriverFactory, 'Azure')`.
The worker host uses `ConsumerRuntime` with `ServiceBusReceiver` (non-session) or an `acceptNextSession` loop
that holds up to `Concurrency` sessions at once.

**Azure Functions.** Adapter `createServiceBusFunctionHandler(handler, options)`:
- Trigger: Service Bus topic subscription, `isSessionsEnabled` = the subscription is `Exclusive`, `autoCompleteMessages: false` (host.json, extension v5+).
- Settlement: via the Functions Service Bus SDK-type bindings (`ServiceBusMessageActions`) where available for Node.
- Configuration: `MJ_WQ_SUBSCRIPTION` env JSON (`SubscriptionBinding`), same as Lambda.
- **If Node settlement bindings aren't GA at implementation time** (open question 1), the supported
  external host is **Azure Container Apps + a KEDA Service Bus scaler** running the same worker loop as
  `ConsumerRuntime` (scale-to-zero, no 10-minute Consumption-plan limit).

Host ceilings for D5 warnings: Functions Consumption 10 min, Flex/Premium configurable, Container Apps none.

### Identity & secrets

- **Managed Identity** first: MJAPI and Functions get `Azure Service Bus Data Sender` on topics and
  `Azure Service Bus Data Receiver` on subscriptions. `DefaultAzureCredential` is used everywhere.
- MJAPI outside Azure: service principal secret held in **MJ Credentials** (`Transport.CredentialID`).
- External consumers: Key Vault references for the MJ API key (only needed for callbacks into MJ).
- Operators (replay/discard) need `Data Owner` on the subscription (receive from DLQ + send to topic),
  granted to the MJAPI identity only.

### Operator mapping

| Operation | Implementation |
|---|---|
| `GetStats` | `ServiceBusAdministrationClient.getSubscriptionRuntimeProperties` → `activeMessageCount` (Pending) and `deadLetterMessageCount` (DeadLettered). Service Bus doesn't expose locked-message counts, so `InFlight` is reported as 0 with an "unavailable" note. `BlockedKeys = null` (no `Ordered` on Azure in Phase 1a). |
| `ListDeadLetters` | **`peekMessages` on the DLQ receiver, non-destructive**, cursor = `fromSequenceNumber`. This is a real advantage over SQS, where browsing a DLQ means receiving from it. |
| `Replay` | receive (peek-lock) the target DLQ message by scanning; re-send to the topic with `mj_target`, same `MessageID`, `SessionId`, `mj_attempt=0`, `mj_replay=true`; complete the DLQ copy. |
| `Discard` | dead letters: receive + complete the DLQ copy. Pending and in-flight: `{ Supported: false }` (`CancelPending`/`CancelInFlight` both `false`). |
| `ListPartitions` | `null` (`ListPartitions: false`) |

All operations are reached through the `WorkQueue.*` remote operations (03 §8). Dead letters raised by
`MaxDeliveryCount` (crash loops) carry reason `MaxDeliveryCountExceeded`, reported as `RedrivePolicy`.

## Terraform module — `infrastructure/terraform/work-queue/azure`

The same inputs and outputs as the AWS module (`manifest_json`, `name_prefix`, `environment`, `consumers`
map, `alarms`, `tags`), with these resources:

| Resource | Purpose |
|---|---|
| `azurerm_servicebus_namespace` | `sku` variable (Standard default; Premium for >256 KB state/perf) |
| `azurerm_servicebus_topic` | `support_ordering`, `requires_duplicate_detection`, `duplicate_detection_history_time_window`, `max_size_in_megabytes` |
| `azurerm_servicebus_subscription` | `requires_session` (`Exclusive`), `lock_duration` (from `LeaseSeconds`), `max_delivery_count` (MaxAttempts+5), `dead_lettering_on_message_expiration=true`, `default_message_ttl` |
| `azurerm_servicebus_subscription_rule` | `filter_type="SqlFilter"`, `sql_filter` from `ToServiceBusSqlFilter` (the manifest carries the pre-translated string, so Terraform never re-implements translation) |
| `azurerm_linux_function_app` / `azurerm_container_app` | external consumers, identity, app settings `MJ_WQ_SUBSCRIPTION` |
| `azurerm_role_assignment` | Data Sender / Receiver / Owner as above |
| `azurerm_monitor_metric_alert` | `DeadletteredMessages > 0`, `ActiveMessages` age proxy |

Output: a `binding_import` JSON in the `BindingImport` shape (`{ "Namespace": "…", "TopicName": "…" }` per topic;
`{ "SubscriptionName": "…", "RequiresSession": true }` per subscription), consumed by `mj queue import-bindings`.

### Deployment governance deltas vs AWS

- Same pipeline: export manifest → `terraform plan` in CI → review → apply → import bindings → MJ `ValidateBindings`.
- `requires_session` is **immutable** on an existing subscription. Changing `PartitionMode` between `None` and
  partitioned means replacing the subscription (drain first). The plan must flag the replacement and the
  runbook must drain.
- Filter rule changes apply in place (no replacement).
- Duplicate detection can only be set at topic creation.

## Interfaces / schema changes

- No new tables. `Transport.Configuration` for Azure: `{ "FullyQualifiedNamespace": "…servicebus.windows.net" }`.
- Topic `BindingConfig`: `{ "TopicName": "…" }`. Subscription `BindingConfig`: `{ "SubscriptionName": "…", "RequiresSession": bool }`.
- `TransportCapabilities` as listed above; `SubscriptionUnsupportedReason` (03 §5) then rejects `Ordered` on an Azure topic with no Azure-specific code. The driver factory registers from an engine subpath (`@memberjunction/work-queue-engine/azure`) imported only by server bootstraps, mirroring `./aws` (03 §0, F12).
- Contract proposals: **C3** (`MaxLeaseSeconds` capability for `LockDuration ≤ 300`), **C6** (checkpoint in session state — only with the native extension). Absent-attribute semantics and reserved `mj_*` names are already adopted in 03.

## Dependencies on Phase 1

`ITransportDriver` + conformance kit (core), driver factory registration + `ValidateBindings` wiring (engine),
manifest export / import-bindings CLI, and the AWS Terraform module layout (mirrored).

## Testing

| Tier | Approach |
|---|---|
| Unit | SQL filter translation (golden cases incl. quoting/escaping), retry scheduling math, capability profile vs `SubscriptionUnsupportedReason` |
| Conformance | full kit against a **real Standard namespace** in a sandbox subscription (no official emulator parity for sessions; the Service Bus emulator is used for smoke only). Opt-in CI job. |
| Infra | `terraform validate`, `tflint`, plan against the sample manifest |
| Soak | kill Functions/Container App instances mid-session; verify redelivery, `Exclusive` single flight per session, and no lost dead letters |

## Work breakdown

| Item | Size |
|---|---|
| Driver publish + filter translation + `ValidateBindings` (admin client) | M |
| Non-session consumer (retry via scheduled re-send) | M |
| Session consumer for `Exclusive` | M |
| (Optional, only with a use case) native `Ordered` session-state reducer: parking, wake, unblock control messages | L |
| Operator operations | M |
| Functions adapter (or Container Apps/KEDA fallback) | M |
| Terraform module + alerts + binding output | M |
| Conformance runs + soak runbook | M |

## Open questions

1. Is Node.js message settlement (`autoCompleteMessages: false` + `ServiceBusMessageActions`) GA for Azure Functions at implementation time? If not, is Container Apps + KEDA acceptable as the primary external host?
2. (Native-`Ordered` extension only) Enumerating blocked keys: the JS SDK has no session listing — a Table Storage index vs deriving from DLQ `mj_blocks_key` properties.
3. (Native-`Ordered` extension only) Should parked-overflow fall back to an external store (Cosmos DB / Table Storage) rather than dead-letter with `ParkOverflow`?
4. Premium as a recommended default for production (larger session state, predictable latency)?

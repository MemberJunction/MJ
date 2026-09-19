# 09h — GCP Transport (Pub/Sub + Cloud Run) — Phase 2

## Summary

A `GCP` transport driver on **Google Cloud Pub/Sub**:
- Per-subscription attribute filters, **ordering keys** for `Exclusive`, and ack deadlines with
  `ModifyAckDeadline` as the lease.
- Native exponential retry policy, and dead-letter topics with a max delivery attempt count.
- Hosts: Cloud Run (pull worker) or MJ workers. Capability profile mirrors AWS (03 §5): `SupportsOrdered: false`,
  so an `Ordered` subscription on a GCP topic is **rejected at save** ("Ordered requires the Database transport").
  Revision 4 removed staging cloud messages into the database (11 §1, S2); GCP offers `None` and `Exclusive`. No
  Firestore or other state store in the base design. A Firestore-backed native `Ordered` is kept below as an
  optional extension, gated on a real use case (09i).
- A Terraform `google` module mirroring the AWS and Azure modules.

## Motivation

Customers on GCP need the high-velocity path. Completing the third major cloud validates the contract's
neutrality (01, X7).

## Scope / Non-goals

**In scope:** package `@memberjunction/work-queue-gcp` (core + `@google-cloud/pubsub` only, no MJ deps), engine-side
driver factory registration (from an engine subpath imported only by server bootstraps, like `./aws` — 03 §0, F12),
pull-worker host adapter, operator operations,
Terraform module, conformance runs.

**Non-goals:**
- Push subscriptions as the primary host (analysis below).
- Pub/Sub Lite.
- BigQuery/Cloud Storage subscriptions as consumers (09g may use Cloud Storage subscriptions later).

## Concept mapping

| Contract | Pub/Sub | Notes |
|---|---|---|
| Topic | Topic | message retention optional (enables seek/replay) |
| Subscription | Subscription | independent per subscriber |
| Filter | subscription `filter` (attributes) | **immutable after creation**, so a filter change = new subscription |
| Lease | ack deadline (10–600 s) | client lease management extends via `ModifyAckDeadline` |
| Heartbeat | `ModifyAckDeadline` | the client library auto-extends up to `maxExtension`; Manual = disable auto-extension, explicit modAck |
| Retry backoff | subscription `retry_policy` (min/max backoff ≤ 600 s) on nack | per-message `DelaySeconds` → `modAck(delay)` without ack (≤ 600 s cap) |
| Dead letter | `dead_letter_policy` (topic + `max_delivery_attempts` 5–100) | the service moves the message; `deliveryAttempt` is available on received messages |
| `Exclusive` | publisher `orderingKey = PartitionKey` + subscription `enable_message_ordering` (**per subscription**, immutable) | no topic-wide FIFO constraint (unlike AWS W7) |
| Order within a key | publish order within ordering key (same region) | `Exclusive` delivers a key's messages in order, one outstanding at a time; there are no producer sequence numbers (11 §1, S1), and `Ordered` (halt-on-dead-letter) is Database-only |
| Publish dedup | none natively (exactly-once *delivery* is a subscription feature, not publish dedup) | `DeduplicationKey` handled by the MJ ledger (03 §2.1, two-phase); `MessageID` duplicates not reported |

### Limits (verify at implementation)

| Limit | Value | Contract impact |
|---|---|---|
| Message size | 10 MB | 03's 256 KB cap still applies (W4) |
| Attributes | 100 | 03's 10 still applies |
| Ack deadline | 10–600 s | policy validation `LeaseSeconds ≤ 600` (C3); longer work relies on continuous modAck extension |
| `max_delivery_attempts` | 5–100 | crash backstop = `min(100, max(5, MaxAttempts + 5))` (03 §5.1's margin) |
| Filter | attributes only; `=`, `!=`, `hasPrefix`, `:` (exists), `AND`/`OR`/`NOT` | covers the 03 §4.1 operator set fully |

## Design

### Filter translation (`ToPubSubFilter`)

Input is the restricted `CompositeFilterDescriptor` of 03 §4 (`SubscriptionFilter`: top-level `and`, one constraint
per field, single-field OR groups of `eq`), translated operator by operator:

| 03 §4.1 operator | Pub/Sub filter |
|---|---|
| `eq` | `attributes.eventType = "click"` |
| OR group of `eq` on one field | `(attributes.eventType = "a" OR attributes.eventType = "b")` |
| `neq` | `(attributes:source AND attributes.source != "test")` — explicit presence: a missing attribute fails every operator except `isnull` |
| `startswith` | `hasPrefix(attributes.tenant, "acme-")` |
| `isnotnull` / `isnull` | `attributes:priority` / `NOT attributes:priority` |
| top-level `and` | `AND` |

Values are double-quoted with `"` and `\` escaped; matching is case-sensitive, as on every transport (03 §4.3). The
GCP capability constant declares the same `Filters: FilterSupport` as AWS, so an untranslatable filter is rejected
when the subscription is saved.

Because filters are immutable, `ValidateBindings` compares the live filter with the manifest and reports
`Error: FilterDrift`. Terraform plans a replacement, and the runbook drains the old subscription first.

### Publish

`topic.publishMessage({ data, attributes, orderingKey })` with `messageOrdering: true` on the publisher client
when the MJ topic has partitioned subscriptions. Pub/Sub ordering quirk: after a failed publish for an
ordering key, the client **pauses that key** until `resumePublishing(key)`. The driver calls resume and
reports `Rejected, Retryable=true` for the failed and subsequent same-key messages in the batch, preserving
order on retry.

### Hosts

| Host | Verdict |
|---|---|
| **Pull subscriber in Cloud Run** (worker pool / always-on CPU service) or GKE | ✅ primary external host. Full lease control (modAck), `HeartbeatMode` both modes, `ConsumerRuntime` loop. |
| Push subscription → Cloud Run / Cloud Run functions (Eventarc) | ⚠️ supported for `None` + `Auto` only. Push has **no lease extension**: the ack deadline is the request timeout (≤ 600 s), and ack = 2xx. `Manual` heartbeat, `Exclusive` and per-message retry delay aren't available, so validation rejects those combinations for push hosts. |
| MJ worker | ✅ `@google-cloud/pubsub` streaming pull via `ConsumerRuntime`, with flow control `maxMessages = 1` per ordering key for `Exclusive` subscriptions |

A new `SubscriptionBinding.Config.DeliveryType: 'Pull' | 'Push'` is added to the GCP binding (driver-specific,
no contract change).

### `Exclusive`, dead letters, and `Ordered` (base design: unsupported)

**`Exclusive`** uses ordering keys natively (`orderingKey = PartitionKey`, `enable_message_ordering` on that
subscription): one message per key is outstanding to the client at a time. Retry = `modAck(delay)` without ack
(≤ 600 s) — the key waits, which is stronger than `Exclusive` requires (as on SQS FIFO and unlike the Database
transport, a retrying message **holds its key** — 03 §3.1, F11). Dead letter → continue. The runtime counts handled
attempts from `deliveryAttempt`; like SQS's receive count it also rises on nack-for-release and redelivery of
same-key followers, so the lessons of 03 §5.1 (F5) apply: keep one message per key outstanding, and set the
receive-time guard and the native backstop above `MaxAttempts` by the same margins.

**Dead letters (runtime-managed, no state store).** On final failure the runtime publishes the envelope to the
subscription's dead-letter topic `<sub>.dlq` with attributes `mj_dead_letter_reason`, `mj_last_error` (truncated),
`mj_attempts`, `mj_dead_lettered_at`, then acks the original. The native `dead_letter_policy` points at the **same**
topic as a crash backstop (reason reported as `RedrivePolicy` when the `mj_*` attributes are absent). A pull
subscription `<sub>.dlq-reader` on that topic serves the operator.

**`Ordered`** — Pub/Sub ordering doesn't block after dead-lettering (later messages for the key flow), and a nack
redelivers all subsequent same-key messages already sent to the client. Rather than an external store, the base
design declares `SupportsOrdered: false`, and `SubscriptionUnsupportedReason` (03 §5) rejects `Ordered` on a GCP
topic with "Ordered requires the Database transport". A workload that needs halt-on-dead-letter puts its topic on
the Database transport, or bridges a GCP stream onto one (09i §3).

### Optional extension: native `Ordered` on GCP (not in base design)

Only if a use case needs `Ordered` on a GCP topic (09i §10 and its declined register). It would flip `SupportsOrdered` to
`true` for GCP and requires external control state:

| Store option | Verdict |
|---|---|
| **Firestore (Native mode)** | ✅ serverless, transactional (optimistic transactions with preconditions), per-document 1 MiB, IAM-scoped, cheap at low write volume (only Ordered keys write) |
| Memorystore (Redis) | ❌ not durable enough for blocked-key state |
| Spanner / Bigtable | ❌ overkill in cost and ops for small control state |
| Cloud SQL | ❌ reintroduces a DB dependency for thin consumers |

Sketch: a key document `{ BlockedByMessageID }` plus a `parked` sub-collection; park-then-ack when blocked; on
`Complete`, republish the next parked item with
`mj_target=<subscription>` and the same ordering key, relying on a targeting clause
`(NOT attributes:mj_target OR attributes.mj_target = "<sub>")` that must be present in the (immutable) filter from
creation. The base design includes that clause anyway, so the extension doesn't force subscription replacement.

### Identity

- **Workload Identity** (Cloud Run service accounts; Workload Identity Federation for MJAPI outside GCP) with
  `roles/pubsub.publisher` on topics, `roles/pubsub.subscriber` on subscriptions, and
  `roles/pubsub.publisher` on each `<sub>.dlq` topic for consumers (runtime-managed dead letters).
- The **Pub/Sub service agent** needs `pubsub.publisher` on dead-letter topics and `pubsub.subscriber` on
  source subscriptions. This is a common misconfiguration, so `ValidateBindings` checks it via
  `testIamPermissions`.
- Service-account keys, if unavoidable, live in MJ Credentials.

### Operator mapping

| Operation | Implementation |
|---|---|
| `GetStats` | Cloud Monitoring metrics `subscription/num_undelivered_messages`, `oldest_unacked_message_age` on the source and `<sub>.dlq-reader` subscriptions; `InFlight` unavailable → 0 with note; `BlockedKeys = null` |
| `ListDeadLetters` | pull from `<sub>.dlq-reader` with a short ack deadline and **no ack** (`PeekDeadLetters: 'BestEffort'`, as on AWS; messages reappear after the deadline) |
| `Replay` | scan-pull the reader for the `MessageID`; republish the envelope to the topic with `mj_target`, same ordering key, `mj_replay=true`; ack the dead-letter copy |
| `Discard` | dead letters: scan-pull and ack. Pending and in-flight: `{ Supported: false }` (`CancelPending`/`CancelInFlight` both `false`) |
| `ListPartitions` | unsupported (`null`, `ListPartitions: false`) — there is no `Ordered` on GCP in the base design |

All operations are reached through the `WorkQueue.*` remote operations (03 §8).

## Terraform module — `infrastructure/terraform/work-queue/gcp`

Same inputs and outputs as the AWS and Azure modules.

| Resource | Purpose |
|---|---|
| `google_pubsub_topic` (+ `<sub>.dlq` dead-letter topic per subscription) | `message_retention_duration` optional |
| `google_pubsub_subscription` | `filter` (pre-translated in manifest), `enable_message_ordering`, `ack_deadline_seconds` (LeaseSeconds), `retry_policy {minimum_backoff, maximum_backoff}` (Backoff*), `dead_letter_policy`, `push_config` when Push |
| `google_pubsub_subscription` `<sub>.dlq-reader` | operator dead-letter browse/replay |
| `google_cloud_run_v2_service` / worker pool | external consumers; env `MJ_WQ_SUBSCRIPTION` |
| `google_*_iam_member` | publisher/subscriber + Pub/Sub service agent bindings |
| `google_monitoring_alert_policy` | `<sub>.dlq` publish rate > 0, oldest unacked age |

Governance delta: filters and `enable_message_ordering` are immutable, so changes to `Filter` or
`PartitionMode` plan a **replacement**. The pipeline must flag it, and the runbook must drain before apply.

## Interfaces / schema changes

- No MJ tables. `Transport.Configuration`: `{ "ProjectId": "…" }`.
- Subscription `BindingConfig`: `{ "SubscriptionPath": "…", "DeliveryType": "Pull" | "Push", "DeadLetterTopicPath": "…", "DeadLetterReaderPath": "…" }`.
- `TransportCapabilities`: `SupportsOrdered: false`, `SupportsExternalHosts: true`, `CancelPending: false`,
  `CancelInFlight: false` (an ack deadline cannot be revoked by a third party, so 03 §7's cancel flag has nowhere
  to live), `ListPartitions: false`, `PeekDeadLetters: 'BestEffort'`,
  `ReplaySingleDeadLetter: true`, `PersistsProgress: false`, `MaxRetryDelaySeconds: 600`, `Filters` as above.
- Contract proposals: **C3** (`MaxLeaseSeconds` ≤ 600), **C6** (only with the native-`Ordered` extension or batch
  checkpoints). Absent-attribute semantics and reserved `mj_*` attribute names (`mj_target`, `mj_seq`, `mj_replay`)
  are already adopted in 03.

## Dependencies on Phase 1

Core contract + conformance kit (plan 04), engine driver factory + deduplication ledger (plans 05–07), manifest export/import-bindings CLI (plan 06), and the SQS consumer's runtime-managed dead-letter
pattern (plan 07) as the model for `<sub>.dlq`.

## Testing

| Tier | What |
|---|---|
| Unit | filter translation golden cases; publish-pause/resume handling; dead-letter attribute mapping; capability profile vs `SubscriptionUnsupportedReason` |
| Emulator | Pub/Sub emulator for conformance basics (the emulator doesn't implement dead-letter policies or filters faithfully, so those cases are skipped) |
| Sandbox project | full conformance kit incl. dead-letter + filter + `Exclusive` ordering keys; `Ordered` cases skip on `SupportsOrdered: false` (opt-in CI) |
| Infra | `terraform validate` / plan with sample manifest |

## Work breakdown

| Item | Size |
|---|---|
| Driver publish (ordering pause/resume) + filter translation + ValidateBindings (IAM checks) | M |
| Pull consumer + lease/heartbeat + retry mapping | M |
| (Optional, only with a use case) Firestore-backed native `Ordered` | L |
| Operator operations (dead-letter reader, replay/discard by scan) | M |
| Cloud Run host adapter (pull) + push-host validation | S |
| Terraform module + alerts | M |
| Conformance (emulator + sandbox) | M |

## Open questions

1. Is Pub/Sub **exactly-once delivery** (subscription feature, regional) worth enabling for `Exclusive` subscriptions to reduce duplicate handling, given its throughput trade-offs?
2. If the native-`Ordered` extension is ever built, should it share a generic `PartitionStateStore` interface with an AWS equivalent (see 09i) and Azure session state, for uniform conformance testing?
3. Is push-host support worth the validation complexity, or should GCP external hosts be pull-only?

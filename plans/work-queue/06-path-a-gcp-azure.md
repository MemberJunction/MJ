# Path A — GCP and Azure Drivers (Design)

**Status:** Future path, design only. Not part of Phase 1. No implementation plan, by intent.
**Date:** 2026-09-15
**Depends on:** the driver contract in [02](02-interfaces-and-schema.md) §4.6 and the AWS driver in
[05](05-aws-implementation-plan.md), which establishes the pattern.

> **Verify every service limit quoted here against current provider documentation before
> implementation.** Limits change, and several design choices below depend on them.

---

## 1. What a cloud driver replaces — and what it does not

A driver implements `BaseWorkQueueDriver`: `Deliver`, `Claim`, `Heartbeat`, `Complete`, `Retry`,
`DeadLetter`, `ReapLeaseExhausted`, and declares `Capabilities`.

A cloud driver moves **item delivery and claiming** out of the database. It does **not** move:

- **Topic, subscription and filter resolution.** `WorkQueueProducer` resolves subscriptions and evaluates
  `FilterRules` in TypeScript, then calls `Deliver` with explicit target queues. Cloud topics and
  cloud-side filters are therefore unnecessary: **each framework queue maps to one cloud queue-like
  resource, and nothing maps to a framework topic.** This removes filter translation — and the drift risk
  that comes with it — from every driver.
- **The deduplication ledger** (`WorkQueueDeduplication`). Cloud deduplication windows are short or
  absent, so every cloud driver uses the two-phase reservation the AWS driver introduces: reserve the key
  in the MJ database, send, then confirm — or release on failure.
- **Queue metadata**, which stays in MJ entities and is the source of truth for provisioning.

The cost of producer-side fan-out is **atomicity**: a publish to N queues becomes N sends. Where the cloud
cannot send to several queues in one transaction, a failed publish is retried by the caller and converges,
because each send carries a deduplication identifier derived from the publish.

## 2. Capability matrix

| Capability | Native | AWS SQS FIFO | GCP Pub/Sub | Azure Service Bus |
| --- | --- | --- | --- | --- |
| FIFO, one at a time per partition | yes | message group | ordering key | session (`SessionId`) |
| `BlockPartitionDeadLetter` | yes | no | no | **yes, emulated** via session state |
| `PerItemRetryDelayMaxSeconds` | unbounded | 43,200 (visibility timeout) | 600 (one ack-deadline extension) | bounded by lock renewal policy |
| `DelayedPublish` | yes | no (FIFO has no per-message delay) | no | yes (`ScheduledEnqueueTimeUtc`) — but see §4.2 |
| `Priority` | yes | no | no | no |
| `AtomicFanOut` | yes | no | no | **yes** (transactional send across queues) |
| Lease renewal | yes | `ChangeMessageVisibility` | `ModifyAckDeadline` | `RenewMessageLock` / `RenewSessionLock` |
| Cloud-native publish deduplication | — | 5 minutes | none | up to 7 days |
| `PeekItems` | yes | no | no | yes |
| `ListBlockedPartitions` | yes | no | no | yes, via an MJ-side index (§4.2) |
| `ReplaySingleDeadLetter` | yes | no | no | yes |
| Max message size | 64 KB framework cap | 256 KB | 10 MB | 256 KB Standard, 100 MB Premium |
| Serverless consumer | — | Lambda | Cloud Run / Cloud Functions (push) | Azure Functions |

The framework's 64,000-byte payload cap means message size never constrains a driver.

## 3. GCP — Pub/Sub

### 3.1 Mapping

| Framework | Pub/Sub |
| --- | --- |
| Queue | Topic `mj-wq-{queue}` with one pull subscription `mj-wq-{queue}`, message ordering enabled, dead-letter policy set |
| Topic | No resource |
| Deliver | `Publish` to each target queue's topic, ordering key = `PartitionKey`; unpartitioned items omit the key |
| Claim | `Pull` one message (streaming pull for long-running workers) |
| Lease | Ack deadline; `ModifyAckDeadline` on heartbeat |
| Complete | `Acknowledge` |
| Retry with delay | `ModifyAckDeadline(ackId, delaySeconds)` without acknowledging — the ordering key stays held |
| Dead letter | Publish to `mj-wq-{queue}-dlq` with reason attributes, then `Acknowledge` |
| Attempts and fence token | `deliveryAttempt` (populated because the subscription has a dead-letter policy) |
| ReapLeaseExhausted | The subscription's max-delivery-attempts policy; the driver returns 0 |

### 3.2 Gaps and design responses

- **Retry delay is bounded at 600 seconds** per ack-deadline extension. The capability reports 600, so the
  worker refuses queues whose `MaxBackoffSeconds` exceeds it.
- **No Block Partition.** Publishing the head to the dead-letter topic releases its ordering key; later
  messages continue. Block Partition queues are refused.
- **Ordering and redelivery cooperate with head-of-line.** With ordering enabled, a message that is not
  acknowledged is redelivered before later messages with the same key.
- **No peek, blocked-partition listing, or single-item replay.** Management operations return
  `supported: false`. Depth and age come from Cloud Monitoring (`num_undelivered_messages`,
  `oldest_unacked_message_age`).
- **Pub/Sub "exactly-once delivery"** reduces redelivery; the framework contract remains at-least-once and
  handlers stay idempotent.

### 3.3 Serverless

A push subscription to Cloud Run or Cloud Functions is the Lambda analogue. It suits short handlers only:
the ack deadline bounds the request and push delivery cannot heartbeat. Long-running handlers such as DDX
normalisation use pull workers.

### 3.4 Package sketch

`@memberjunction/work-queue-gcp`, dependency `@google-cloud/pubsub`. Classes: `GCPWorkQueueDriver`,
`GCPResourceNames`, `GCPPubSubGateway` (injected interface, faked in unit tests),
`CreatePubSubPushHandler`. Configuration `workQueue.gcp: { projectId, resourcePrefix, deadLetterSuffix }`.

## 4. Azure — Service Bus

### 4.1 Mapping

| Framework | Service Bus |
| --- | --- |
| Queue | Session-enabled queue `mj-wq-{queue}`, dead-lettering on max delivery count |
| Topic | No resource |
| Deliver | Send to each target queue **in one transaction** (`AtomicFanOut: true`), `SessionId = PartitionKey ?? PublishID`, `MessageId = deduplication identifier` |
| Claim | Accept the next available session; receive one message in peek-lock mode |
| Lease | Message lock plus session lock, renewed on heartbeat |
| Complete | `CompleteMessage` |
| Retry with delay | Hold the session lock and renew it through the backoff, then abandon; beyond the bound, dead letter |
| Dead letter | `DeadLetterMessage` with `DeadLetterReason` and `DeadLetterErrorDescription` |
| Attempts and fence token | `DeliveryCount` |
| Deduplication | Queue duplicate detection on `MessageId`, in addition to the MJ ledger |

### 4.2 Gaps and design responses

- **Every item gets a session.** Unpartitioned items use `SessionId = PublishID`, a one-message session,
  which preserves parallelism at the cost of session churn. A queue-level setting added with this driver
  lets high-volume unpartitioned queues use a non-session queue instead.
- **Block Partition can be honoured.** Service Bus stores per-session state. When dead-lettering a head
  under Block Partition, the driver writes `{ blocked: true, itemId }` to the session state and records the
  partition in an MJ-side table so `ListBlockedPartitions` can enumerate it (Service Bus cannot list
  session state). On accepting a session, the driver reads its state and releases a blocked session
  unprocessed. Replay clears the state and re-sends the dead-lettered message with the same `SessionId`;
  Cancel clears the state and removes the index row.
- **Retry delay is bounded by lock renewal.** Abandoning redelivers immediately. Re-sending with
  `ScheduledEnqueueTimeUtc` would place the message behind later ones in its session and break FIFO. The
  driver therefore holds and renews the session lock through the backoff, up to a configured bound, and
  dead-letters beyond it. `DelayedPublish` works for new messages, whose position is set when they are
  enqueued.
- **Peek and single-item replay are available**, so `GetQueueStats` and `ReplayDeadLetter` are
  implementable: runtime properties give counts, and receiving from the dead-letter subqueue then
  re-sending replays.

### 4.3 Serverless

The Azure Functions Service Bus trigger supports sessions and lock renewal, so it can host FIFO handlers.
Long-running handlers should still prefer dedicated workers.

### 4.4 Package sketch

`@memberjunction/work-queue-azure`, dependency `@azure/service-bus`. Classes: `AzureWorkQueueDriver`,
`AzureResourceNames`, `AzureServiceBusGateway` (injected, faked in unit tests),
`AzureSessionStateStore`, `CreateServiceBusFunctionHandler`. Configuration
`workQueue.azure: { fullyQualifiedNamespace, credential: 'DefaultAzureCredential' | 'ConnectionString', resourcePrefix, maxRetryHoldSeconds }`.

## 5. Recommended order and approach

1. **Run the AWS driver in production first.** It proves producer-side fan-out, the two-phase
   deduplication reservation, and capability gating against a real transport.
2. **Azure next if Block Partition or atomic fan-out matters** to the target workloads — it is the only
   cloud that can honour both. **GCP next otherwise** — its mapping is closest to AWS.
3. For each driver:
   - Resource naming first, as pure functions with unit tests.
   - Gateway interface wrapping the SDK; the driver depends on the interface; unit tests use a recording
     fake, with no network.
   - `Deliver`, `Claim`, `Heartbeat`, `Complete`, `Retry`, `DeadLetter` against the gateway.
   - A startup validator that checks each active queue against the driver's capabilities and the
     provisioned resources, and names every refused queue.
   - A conformance run of the native integration behaviours: FIFO within a partition, retry holds the head,
     takeover after lease loss, stale-owner rejection, fan-out isolation, deduplication.

## 6. Provisioning

Cloud resources are created **out of band** — Terraform, Bicep, or the provider CLI — generated from MJ
queue metadata, never by the driver at runtime (runtime creation needs broad permissions and races across
instances). Each driver ships a naming convention (§3.1, §4.1), a startup validator, and an example
infrastructure template for a list of queues and their dead-letter queues.

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Per-queue sends are not atomic (AWS, GCP) | Deduplication identifiers derived from the publish make caller retries converge; Azure uses a transaction |
| Backoff bounds differ per cloud | Capability gating refuses queues whose `MaxBackoffSeconds` exceeds the driver's bound |
| A deduplication reservation leaks after a crash | Short reservation expiry, extended to the full TTL only after a successful send |
| Session churn for unpartitioned Azure queues | Queue-level session setting |
| Operators expect management operations everywhere | Operations return `supported: false` explicitly |

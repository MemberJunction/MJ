# 05 — AWS Implementation (Phase 1)

Phase 1 AWS transport: package `@memberjunction/work-queue-aws`, the Terraform module
`infrastructure/terraform/work-queue/aws`, and the deployment governance runbook for SNS, SQS and Lambda.

Normative inputs: [02 — Implementation overview](02-implementation-overview.md) and
[03 — Interfaces & tables](03-interfaces-and-tables.md). Names used here (`ITransportDriver`,
`SubscriptionBinding`, `WorkMessage`, `TopologyManifest`, …) are defined in 03. Deviations and extensions
to 03 are collected in [§16](#16-deviations--extensions-to-03).

> **About AWS limits.** Figures below are conservative. Anything marked *(verify)* must be confirmed against
> current AWS documentation and account quotas before it is relied on in code or alarms.

---

## Contents

1. [Scope & deliverables](#1-scope--deliverables)
2. [Resource model](#2-resource-model)
3. [Publish mapping](#3-publish-mapping)
4. [Consumer runtime on SQS](#4-consumer-runtime-on-sqs)
5. [Exclusive mode on AWS](#5-exclusive-mode-on-aws)
6. [Ordered mode on AWS (DynamoDB state)](#6-ordered-mode-on-aws-dynamodb-state)
7. [Lambda adapter](#7-lambda-adapter)
8. [MJ worker on AWS subscriptions](#8-mj-worker-on-aws-subscriptions)
9. [Operator implementation & state sweeper](#9-operator-implementation--state-sweeper)
10. [IAM](#10-iam)
11. [Terraform module](#11-terraform-module)
12. [Deployment governance runbook](#12-deployment-governance-runbook)
13. [Throughput, limits & cost](#13-throughput-limits--cost)
14. [Testing](#14-testing)
15. [Work breakdown, risks & verification items](#15-work-breakdown-risks--verification-items)
16. [Deviations & extensions to 03](#16-deviations--extensions-to-03)

---

## 1. Scope & deliverables

### In scope

| # | Deliverable | Location |
|---|---|---|
| A1 | `AwsTransportDriver` implementing `ITransportDriver` (publish, consumer, operator, binding validation) | `packages/WorkQueue/aws/src/driver/` |
| A2 | `SqsTransportConsumer` implementing `ITransportConsumer` for `None` / `Exclusive` / `Ordered` | `packages/WorkQueue/aws/src/consumer/` |
| A3 | `OrderedPartitionStore`: DynamoDB state, parking, release, dead-letter records, counters | `packages/WorkQueue/aws/src/state/` |
| A4 | `AwsTransportOperator` implementing `ITransportOperator` | `packages/WorkQueue/aws/src/operator/` |
| A5 | Lambda adapter `CreateSqsLambdaHandler` plus the state-sweeper Lambda entry point `CreateStateSweeperHandler` | `packages/WorkQueue/aws/src/lambda/` |
| A6 | `ToSnsFilterPolicy` (filter grammar → SNS filter policy JSON) | `packages/WorkQueue/aws/src/filter/` |
| A7 | MJ registration shim (`AWSTransportDriverFactory` via ClassFactory, credential resolution through MJ Credentials). **Lives in the engine package** (04 §9) so this package stays MJ-free. | `packages/WorkQueue/engine/src/transports/aws/` |
| A8 | Terraform module (topics, queues, DLQs, subscriptions, state table, sweeper, consumer Lambdas, IAM, alarms) | `infrastructure/terraform/work-queue/aws/` |
| A9 | Example consumer Lambdas (thin, MJ-free; plus an MJ-API-calling variant) | `packages/WorkQueue/aws/examples/` |
| A10 | Deployment governance: CI workflow for Terraform plan/apply and for consumer artifact build/publish, plus a runbook | `.github/workflows/work-queue-aws-*.yml`, `infrastructure/terraform/work-queue/aws/RUNBOOK.md` |
| A11 | Conformance kit run against LocalStack; Terraform tests | `packages/WorkQueue/aws/test/`, `infrastructure/terraform/work-queue/aws/tests/` |

### Out of scope (Phase 1)

- Runtime creation or mutation of AWS resources by MJ (D6).
- Firehose / batch ingestion (06g), direct publishing from external producers (06d), Azure/GCP.
- Per-message delivery history (D11). Only dead letters, parked items and partition state are stored per item.

### Package boundaries

```
@memberjunction/work-queue-aws
  dependencies:      @memberjunction/work-queue-core,
                     @aws-sdk/client-sns, @aws-sdk/client-sqs, @aws-sdk/client-dynamodb,
                     @aws-sdk/lib-dynamodb, @aws-sdk/client-cloudwatch, @aws-sdk/credential-providers
  exports:
    "."        → driver, consumer, operator, filter, state   (no MJ imports)
    "./lambda" → CreateSqsLambdaHandler, CreateStateSweeperHandler  (no MJ imports; esbuild-friendly)
```

The `.` and `./lambda` entry points **must not** import any `@memberjunction/*` package other than
`work-queue-core`. A lint rule (`no-restricted-imports` scoped to those source folders) plus a bundle-size CI
check on the example Lambda enforce this.

---

## 2. Resource model

### 2.1 Per topic, per subscription, per deployment

```
Deployment (name_prefix + environment)
 ├── DynamoDB table   {prefix}-{env}-wq-state           (1 per deployment; shared by all subscriptions)
 ├── Lambda           {prefix}-{env}-wq-sweeper         (1 per deployment; EventBridge schedule rate(1 minute))
 │
 └── Topic "email.events"   (IsFifo = false)
      ├── SNS topic   {prefix}-{env}-email-events
      │
      ├── Subscription "email.record"       (None, External → Lambda)
      │    ├── SQS queue       {prefix}-{env}-email-record
      │    ├── SQS backstop DLQ {prefix}-{env}-email-record-bdlq
      │    ├── SNS→SQS subscription (RawMessageDelivery=true, FilterPolicyScope=MessageAttributes)
      │    ├── Lambda          {prefix}-{env}-email-record  + event source mapping
      │    └── IAM role        {prefix}-{env}-email-record-consumer
      │
      └── Subscription "email.unsubscribe"  (None, External → Lambda, filter eventType=[unsubscribe])
           └── … same shape …

 └── Topic "integration.batch-ready"   (IsFifo = true, OrderingMode = ExplicitSequence)
      ├── SNS topic   {prefix}-{env}-integration-batch-ready.fifo
      └── Subscription "integration.apply"  (Ordered, MJWorker → long-poll from MJ)
           ├── SQS queue        {prefix}-{env}-integration-apply.fifo
           ├── SQS backstop DLQ {prefix}-{env}-integration-apply-bdlq.fifo
           └── SNS→SQS subscription (RawMessageDelivery=true)
```

### 2.2 Resource settings

| Resource | Setting | Value | Rationale |
|---|---|---|---|
| SNS topic | `fifo_topic` | `Topic.IsFifo` | W7 |
| SNS topic (FIFO) | `content_based_deduplication` | `false` | Dedup is explicit via `MessageDeduplicationId = MessageID` |
| SNS topic (FIFO) | `fifo_throughput_scope` | `MessageGroup` when high throughput is enabled *(verify attribute availability in provider version)* | Throughput scales per group |
| SNS topic | `kms_master_key_id` | `var.kms_key_arn` or unset | See 2.4 |
| SQS queue | `fifo_queue` | `= Topic.IsFifo` | SNS FIFO topics can only deliver to FIFO queues, and standard topics only to standard queues *(verify)* |
| SQS queue (FIFO) | `deduplication_scope` / `fifo_throughput_limit` | `messageGroup` / `perMessageGroupId` when `var.fifo_high_throughput` | SQS high-throughput FIFO mode |
| SQS queue | `visibility_timeout_seconds` | MJ worker host: `max(LeaseSeconds, 30)`. Lambda host: `max(LeaseSeconds, 6 × lambda_timeout)` | AWS recommends at least 6× the function timeout for Lambda event sources. The runtime then keeps visibility fresh by heartbeat. |
| SQS queue | `message_retention_seconds` | `1209600` (14 days, the SQS maximum) | Maximum buffer during outages |
| SQS queue | `receive_wait_time_seconds` | `20` | Long polling for MJ workers |
| SQS queue | `redrive_policy` | `{ deadLetterTargetArn: bdlq, maxReceiveCount: MaxAttempts + 2 }` | W6 backstop. The runtime dead-letters at `MaxAttempts` itself (§4.6). |
| SQS backstop DLQ | `fifo_queue` | `= Topic.IsFifo` | A FIFO queue's DLQ must also be FIFO |
| SQS backstop DLQ | `message_retention_seconds` | `1209600` | Enqueue-timestamp semantics on move differ between FIFO and standard *(verify)*. The sweeper ingests every minute (§9.6), so this is headroom. |
| SQS backstop DLQ | `redrive_allow_policy` | `byQueue` limited to its source queue | Hygiene |
| SQS queue policy | allow `sns.amazonaws.com` `sqs:SendMessage` | condition `aws:SourceArn = topic ARN` | Required for SNS→SQS |
| SNS subscription | `raw_message_delivery` | `true` | Body = envelope JSON, attributes → SQS message attributes |
| SNS subscription | `filter_policy_scope` | `MessageAttributes` | D4 |
| SNS subscription | `filter_policy` | `ToSnsFilterPolicy(Filter)`, omitted when the filter is null | |
| SNS subscription | `redrive_policy` (subscription-level DLQ) | Not used in Phase 1 | SNS→SQS delivery failures are rare, and SNS retries internally. Revisit if alarms show delivery failures. *(verify SNS delivery retry policy for SQS endpoints)* |
| DynamoDB table | billing | `PAY_PER_REQUEST` | Spiky, per-key traffic |
| DynamoDB table | keys | `PK` (S), `SK` (S) | §6.2 |
| DynamoDB table | GSIs | `GSI1` (`GSI1PK`, `GSI1SK`) sparse partition condition; `GSI2` (`GSI2PK`, `GSI2SK`) dead-letter time order | §6.2 |
| DynamoDB table | TTL attribute | `ExpiresAt`: set only on items that are safe to expire (§6.2) | |
| DynamoDB table | PITR | enabled | Dead letters are operational records |
| DynamoDB table | SSE | AWS-owned key by default, `var.kms_key_arn` optional | |

### 2.3 Naming convention

| Element | Rule |
|---|---|
| Base | `{name_prefix}-{environment}-{slug}` where `slug` = MJ name lowercased, `.` → `-`, anything outside `[a-z0-9_-]` → `-` |
| FIFO | append `.fifo` (SNS topic name and SQS queue name) |
| Backstop DLQ | `{base}-bdlq` (+ `.fifo`) |
| Length | SQS queue names ≤ 80 chars *including* `.fifo`; SNS topic names ≤ 256. If a base name would exceed the limit, it is truncated and suffixed with `-{first 8 hex of sha1(MJ name)}`. |
| Lambda | `{base}` (≤ 64 chars, same truncation rule) |
| Uniqueness | MJ subscription names are globally unique (03 §6.3), so the base is unique per deployment |

The slug rule is implemented **once** in TypeScript (`ResourceNames.ts`, used by `ValidateBindings` to explain
mismatches) and mirrored in HCL `locals`. A Terraform test asserts both produce identical names for a fixture
manifest.

### 2.4 Encryption

| Option | SNS | SQS | DynamoDB | Notes |
|---|---|---|---|---|
| **Default** | SSE with AWS-managed SNS key *or* none | SSE-SQS (SQS-managed) | AWS-owned key | SNS delivery to SSE-SQS queues is supported *(verify)* |
| **`kms_key_arn` set** | CMK | CMK | CMK | The key policy must allow `sns.amazonaws.com` `kms:GenerateDataKey*` + `kms:Decrypt` so SNS can write to the encrypted queues. The **AWS-managed `alias/aws/sqs` key cannot be used** for SNS→SQS. Consumer and MJ roles need `kms:Decrypt`; publisher roles need `kms:GenerateDataKey*`. |

### 2.5 Tags

Every resource gets `var.tags` merged with:
`mj:component = work-queue`, `mj:environment = {env}`, `mj:topic = {topic name}`,
`mj:subscription = {subscription name}` (where applicable), `mj:manifest-hash = {sha256 of manifest, first 12}`.

---

## 3. Publish mapping

### 3.1 Envelope → SNS

| `WorkMessage` field | SNS `PublishBatchRequestEntry` |
|---|---|
| whole envelope | `Message` = `JSON.stringify(envelope)` (UTF-8) |
| `Attributes` (user, ≤ 10) | `MessageAttributes[k] = { DataType: 'String', StringValue: v }` |
| `MessageID`, `PartitionKey`, `Sequence`, `CorrelationID`, `PublishedAt` | **body only**. They never use attribute slots, so users keep all 10 (W4). |
| FIFO: `PartitionKey ?? MessageID` | `MessageGroupId` |
| FIFO: `MessageID` | `MessageDeduplicationId` |
| batch position | `Id` = `m{index}` (unique within the batch, `[A-Za-z0-9_-]{1,80}`) |

Why reserved fields stay out of attributes: SQS allows at most 10 message attributes per message *(verify)*, and
03 grants all 10 to users. Filters never need reserved fields; routing by partition key is not a filter concern.

### 3.2 Batching & size

```ts
// packages/WorkQueue/aws/src/driver/PublishBatcher.ts
export const SNS_MAX_BATCH_ENTRIES = 10;
export const SNS_MAX_BATCH_BYTES = 262_144;   // aggregate of all entries in one PublishBatch (verify)
export const SNS_MAX_MESSAGE_BYTES = 262_144; // body + attribute names, types and values (verify)

export function ChunkForPublishBatch(entries: SizedEntry[]): SizedEntry[][];
export function MeasureEntryBytes(body: string, attributes: Record<string, string>): number;
// = utf8(body) + Σ (utf8(name) + utf8('String') + utf8(value))
```

- `MeasureEntryBytes` runs **before** any network call. An entry over `min(Topic.MaxPayloadBytes, 262_144)` is
  `Rejected { Code: 'PayloadTooLarge', Retryable: false }`, and the remaining entries still publish.
- Chunks hold at most 10 entries and at most 262,144 aggregate bytes. Chunks publish concurrently, capped by
  `PublishConcurrency` (default 4). For FIFO topics, **entries sharing a `MessageGroupId` stay in request order
  across chunks**: chunks run sequentially per group, and different groups may run in parallel.
- **Headroom for re-sent messages.** Replays and releases wrap the envelope (§4.3), which adds ≤ 512 bytes.
  `ValidateBindings` warns when `Topic.MaxPayloadBytes > 261_000` on AWS. The queue's `MaximumMessageSize` must
  be ≥ 262,144 (SQS now allows larger messages *(verify)*; Terraform sets 262,144 explicitly).

### 3.3 Result mapping

| SNS outcome | `PublishResult` |
|---|---|
| Entry in `Successful[]` | `Status: 'Accepted'` |
| Entry in `Failed[]`, `SenderFault: true` (e.g. `InvalidParameter`) | `Rejected`, `Error { Code: entry.Code, Retryable: false }` |
| Entry in `Failed[]`, `SenderFault: false` | `Rejected`, `Error { Code: entry.Code, Retryable: true }` |
| Whole call throws after SDK retries (`ThrottledException`, `KMSThrottlingException`, network) | every entry in the chunk `Rejected`, `Error { Code: 'TransportUnavailable', Retryable: true }` |
| Whole call throws a non-retryable error (`AuthorizationError`, `NotFound`) | every entry `Rejected`, `Retryable: false`, plus an error log and a `PublishAuthFailure` metric |
| FIFO duplicate within the dedup window | SNS reports it as successful: `Accepted` |

- **`Duplicate` is never returned by the AWS driver.** SNS FIFO silently suppresses duplicates within its
  5-minute deduplication window, and standard topics do not deduplicate at all. Callers already treat
  `Duplicate` as success (03 §2), so this is safe, and it is documented in the REST API notes.
- SDK clients use `retryMode: 'adaptive'` with `maxAttempts: 5`. The REST publish endpoint does not add its own
  retries beyond that: the producer retries with the same `MessageID`s.

### 3.4 Driver sketch

```ts
export class AwsTransportDriver implements ITransportDriver {
  public readonly Name = 'AWS';
  constructor(private readonly clients: AwsClients, private readonly options: AwsDriverOptions) {}

  public async Publish(topic: TopicBinding, messages: WorkMessage[], _subscriptions: SubscriptionBinding[]): Promise<PublishResult[]> {
    const config = ParseTopicConfig(topic.Config);           // { SnsTopicArn }
    const prepared = messages.map((m, i) => this.prepareEntry(topic, m, i));   // size check, attributes, group/dedup
    const chunks = ChunkForPublishBatch(prepared.filter(p => p.Kind === 'Ready'));
    const results = await RunChunks(chunks, topic.IsFifo, this.options.PublishConcurrency,
      chunk => this.publishChunk(config.SnsTopicArn, chunk));
    return MergePositional(messages, prepared, results);
  }
  // SNS performs fan-out and filtering; the _subscriptions argument is unused on AWS.
  public OpenConsumer<T extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<T> { … }
  public Operator(): ITransportOperator { … }
  public ValidateBindings(topic: TopicBinding, subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]> { … }
}

export interface AwsClients { Sns: SNSClient; Sqs: SQSClient; Dynamo: DynamoDBDocumentClient; CloudWatch?: CloudWatchClient; }
export interface AwsDriverOptions { PublishConcurrency: number; Clock: () => Date; Log: WorkLogger; Metrics: WorkMetrics; }
```

---

## 4. Consumer runtime on SQS

The same `SqsTransportConsumer` serves both hosts:

| Host | How deliveries arrive | Runtime entry point |
|---|---|---|
| MJ worker | `ReceiveMessage` long poll through `Receive()` | `ConsumerRuntime.Start()` loop |
| Lambda | Lambda's SQS poller invokes with `SQSEvent` | `ConsumerRuntime.ProcessBatch()` (§7) |

### 4.1 Binding config (per subscription)

```ts
export interface AwsSubscriptionConfig {
  Region: string;
  QueueUrl: string;
  QueueArn: string;
  BackstopDlqUrl: string;
  BackstopDlqArn: string;
  StateTableName: string;   // present on every subscription (dead letters are stored there for all modes)
  IsFifo: boolean;
}
```

### 4.2 Identity, attempts, fencing

| 03 concept | SQS realization |
|---|---|
| `ReceivedDelivery.DeliveryID` | SQS `MessageId` of *this* SQS message. A replay or release re-send gets a new SQS `MessageId`. |
| `ReceivedDelivery.LeaseToken` | SQS `ReceiptHandle` (changes on every receive) |
| `ReceivedDelivery.Attempt` | `ApproximateReceiveCount` of this SQS message |
| `ReceivedDelivery.IsReplay` | `true` when the body is a control wrapper of `Kind: 'Replay'` |
| `ReceivedDelivery.LeaseExpiresAt` | receive time + current visibility (runtime-tracked) |
| `WorkMessage.MessageID` | from the body envelope; stable across receives, replays and releases |
| Dead-letter `DeliveryID` (operator API) | `WorkMessage.MessageID`, which is unique per subscription |

**Fencing strength.** The SQS receipt handle is a **weak** fence: SQS may still accept a delete made with an
older receipt handle *(verify current behavior)*. So:
- `None` / `Exclusive`: a zombie completion can delete a message another consumer has redelivered. The effect
  is at most a duplicate or skipped retry, which idempotent handlers already tolerate. This is documented.
- `Ordered`: every **state transition** is fenced strongly by `InFlightToken` plus a conditional write on the
  DynamoDB `STATE` item (§6.5). A zombie cannot advance, block or release a key.

**Attempt baseline.** Replays and releases are **new SQS messages**, so `ApproximateReceiveCount` restarts at
1 naturally, which satisfies "AttemptCount reset to 0" on replay. A release is not a new attempt of the same
logical delivery: for a message that was parked before it ever ran, its attempts are counted fresh.

**`Release` consumes a receive.** `ChangeMessageVisibility(0)` returns the message, but SQS has already
counted the receive. Unlike on the DB transport, a released delivery **does** use up one receive count. The
2-receive margin in the redrive policy (`MaxAttempts + 2`) absorbs routine shutdown releases. The runtime also
counts a pre-handler release (shutdown before the handler started) toward the budget only when
`Attempt > MaxAttempts` (§4.6). This is a deviation (§16).

### 4.3 Control wrapper (replay & release re-sends)

Messages the system itself re-sends to a source queue (operator replay; Ordered release of a parked item) use a
**body wrapper**, not message attributes. Attributes would eat into the user's 10 slots.

```ts
export interface ControlWrapper {
  mjwq: 1;                                   // discriminator; a WorkMessage never has this key
  Kind: 'Replay' | 'Release';
  Envelope: WorkMessage;
  /** Replay: the dead-letter item it came from. Release: the parked item it came from. */
  SourceSK: string;
  /** Monotonic counter copied from STATE (Ordered) or from the DL item (others); detects stale re-sends. */
  Counter: number;
  SentAt: string;
  Actor?: string;                            // replay only
}

export function DecodeBody(body: string): { Envelope: WorkMessage; Control: ControlWrapper | null };
```

Re-sends use `SendMessage` directly to the **source queue** with no SNS involved, so filters are not
re-evaluated (they were already applied). FIFO re-sends use `MessageGroupId = PartitionKey ?? MessageID` and
`MessageDeduplicationId = {MessageID}:{Kind}:{Counter}`, so the 5-minute dedup window never suppresses a
legitimate second replay or release.

### 4.4 Operation mapping

| `ITransportConsumer` | SQS / DynamoDB calls | Result |
|---|---|---|
| `Receive(max, wait, signal)` | `ReceiveMessage { MaxNumberOfMessages: min(max,10), WaitTimeSeconds: min(wait,20), MessageSystemAttributeNames: [ApproximateReceiveCount, SentTimestamp, MessageGroupId, SequenceNumber], MessageAttributeNames: ['All'] }` → decode → mode-specific eligibility (Ordered: §6.4, which may park). Only eligible deliveries are returned. | `ReceivedDelivery[]` |
| `ExtendLease(d, seconds, progress?)` | `ChangeMessageVisibility(receiptHandle, seconds)`. Ordered also runs a conditional `UpdateItem` that extends `InFlightExpiresAt` with the condition `InFlightToken = :mine`. | `'Held'`, or `'Lost'` on `ReceiptHandleIsInvalid` / `MessageNotInflight` / `InvalidParameterValue` (12 h cap reached) / `ConditionalCheckFailed`. `progress` is ignored on AWS (02 §3.4). |
| `Complete(d)` | Ordered: completion transaction (§6.6), then `DeleteMessage`. Others: `DeleteMessage` (+ delete the DL item if `IsReplay`, §9.3). | `Settled/Completed`; `LeaseLost` if the Ordered fence fails |
| `Retry(d, delay, error)` | `ChangeMessageVisibility(receiptHandle, min(delay, remainingOf12h))`. Ordered also clears `InFlightToken` (fenced). No delete. | `Settled/Pending` |
| `DeadLetter(d, reason, error)` | Write the DL item (Ordered: transactionally with `STATE → Blocked`), **then** `DeleteMessage` | `Settled/DeadLettered` |
| `Release(d)` | `ChangeMessageVisibility(receiptHandle, 0)`. Ordered also clears `InFlightToken` (fenced). | `Settled/Pending` |
| `Close()` | Stops polling and destroys clients if owned | — |

`remainingOf12h = 43_200 − (now − firstReceiveTimestamp)`. The first receive timestamp comes from
`ApproximateFirstReceiveTimestamp` *(add to requested system attributes)*. When the requested backoff exceeds
what remains, the runtime uses the remainder and logs `BackoffCapped`.

### 4.5 Crash analysis: DeadLetter (all modes)

```
consumer                           DynamoDB                         SQS
   │ PutItem DL#{MessageID}            │                              │
   │  cond attribute_not_exists(PK)    │                              │
   │ ─────────────────────────────────►│  (or TransactWrite for Ordered)
   │ ✗ crash here ─────────────────────┼──────────────────────────────┤ message reappears after visibility
   │                                   │                              │ next receive: DL item exists for MessageID
   │                                   │                              │  → treat as "already dead-lettered":
   │                                   │                              │    DeleteMessage only (no handler run)
   │ DeleteMessage ──────────────────────────────────────────────────►│
```

- **Write-then-delete** gives at-least-once into the dead-letter store. The reverse order could lose a message.
- **Idempotency.** DL items are keyed `SK = DL#{MessageID}` under `PK = SUB#{subscription}`, so a second write
  hits `ConditionalCheckFailed`, which is treated as success. The dead-letter check on receive (§4.6 step 2)
  costs a `GetItem` **only when `Attempt ≥ MaxAttempts`**. At lower counts the message cannot be dead-lettered
  yet, except when the handler returned `DeadLetter` and the process crashed before the delete. That case
  causes one duplicate handler run, which is accepted.

### 4.6 Per-delivery runtime flow (all modes)

```
1. Decode body (envelope + optional control wrapper). Undecodable → DL item Reason 'UndecodableMessage' → delete.
2. If Attempt > MaxAttempts, or (Attempt == MaxAttempts and a DL#{MessageID} item exists):
      if DL item exists → delete (already dead-lettered)
      else DeadLetter(Reason 'MaxAttemptsExceeded', LastError = 'LeaseExpired or crash') — WITHOUT running the handler
   (The redrive policy fires at MaxAttempts+2, so the runtime nearly always gets here first.)
3. Mode eligibility: None/Exclusive → proceed. Ordered → §6.4 (may park and return).
4. Run the handler with WorkContext; heartbeat per HeartbeatMode (02 §3.4) → ExtendLease(LeaseSeconds).
5. Outcome → Complete / Retry(backoff) / DeadLetter; a thrown error → Retry; Retry at Attempt ≥ MaxAttempts → DeadLetter('MaxAttemptsExceeded').
```

---

## 5. Exclusive mode on AWS

`Exclusive` requires a FIFO topic (W7). It is implemented **entirely by SQS FIFO message groups**, with no
DynamoDB.

| FIFO property | Effect on `Exclusive` |
|---|---|
| Messages with the same `MessageGroupId` (= `PartitionKey`) are delivered in order, and SQS returns no later message of a group while an earlier one is in flight | Single flight per key, as required |
| A message under a retry backoff (visibility extended, not deleted) is still in flight for its group | The **whole key waits** for the backoff |
| After a dead letter (DL write + delete), the group continues | Failures don't block, as required |
| Messages without a `PartitionKey` use `MessageGroupId = MessageID` | Unique group, no exclusivity, as required (02 §3.5) |

**Stronger than required.** On AWS, `Exclusive` in practice also **preserves publish order** and **delays
later items for the same key during a retry backoff**. That's correct under `Exclusive` semantics (which promise
no order but forbid nothing) and is documented. Handlers must not *depend* on it: the DB transport does not
provide it.

**`None` on a FIFO topic** is serialized per partition key the same way (W7). For true firehose parallelism,
use the two-topic pattern (§13.3).

---

## 6. Ordered mode on AWS (DynamoDB state)

### 6.1 Why FIFO alone is not enough

| Requirement (02 §3.5) | SQS FIFO behavior | Gap |
|---|---|---|
| A dead-lettered head **blocks** its key until fixed | After redrive or delete, FIFO moves on to the next message in the group | FIFO does not block |
| `ExplicitSequence`: wait for sequence N+1 before N+2 | If N+2 arrives first and is left undeleted, the group is stuck on N+2. N+1 is queued *behind* it and can never be delivered. | **Deadlock** |
| Operator replay goes back to the head of the key | A re-sent message lands at the *tail* of the group | Order violated |

**Solution: parking.** When a key cannot accept the message just received, the runtime writes the message
into DynamoDB (`PARKED`), keeping its order position, then **deletes it from SQS**. The FIFO group stays free,
and DynamoDB becomes the source of truth for order. When the key becomes deliverable again, parked items are
**released** one at a time by re-sending them to the source queue in order.

### 6.2 Table design (single table per deployment)

| Item | `PK` | `SK` | Key attributes | TTL |
|---|---|---|---|---|
| Partition state | `SUB#{sub}#KEY#{key}` | `STATE` | see 6.3 | **never** for `ExplicitSequence` keys. `PublishOrder` keys: `ExpiresAt` set to now + 30 days whenever the state returns to Idle with no parked items; removed on any non-Idle transition. |
| Parked item | `SUB#{sub}#KEY#{key}` | `PARKED#{orderKey:020d}` | `Envelope` (map), `MessageID`, `ParkedAt`, `ParkOrder`, `OriginalSqsMessageId`, `OriginalAttempt` | never |
| Parked marker (idempotency) | `SUB#{sub}#KEY#{key}` | `PARKEDID#{MessageID}` | `ParkSK` | never (deleted with its parked item) |
| Skip audit | `SUB#{sub}#KEY#{key}` | `SKIP#{sequence:020d}` | `Actor`, `Reason`, `At` | 400 days |
| Dead letter | `SUB#{sub}` | `DL#{MessageID}` | `Envelope`, `PartitionKey`, `Attempts`, `Reason`, `LastError`, `DeadLetteredAt`, `BlocksKey`, `Status` (`DeadLettered`\|`Replaying`), `ReplayCounter`, `GSI2PK = SUB#{sub}#DL`, `GSI2SK = {DeadLetteredAt}#{MessageID}` | never (deleted when resolved) |
| Counters | `SUB#{sub}` | `COUNTERS` | `DeadLettered`, `BlockedKeys`, `ParkedItems` (numbers, updated with `ADD` inside the same transactions) | never |

| Index | Partition key | Sort key | Sparse on | Used for |
|---|---|---|---|---|
| `GSI1` | `GSI1PK = SUB#{sub}#COND#{Condition}` | `GSI1SK = {key}` | Present only while `Condition ≠ Idle` | `ListPartitions(condition)`, sweeper scans of `Draining` / `AwaitingSequence` |
| `GSI2` | `GSI2PK = SUB#{sub}#DL` | `GSI2SK = {DeadLetteredAt}#{MessageID}` | DL items only | `ListDeadLetters` in time order |

Notes:
- An `SK = DL#{MessageID}` key (instead of a time-prefixed key) lets replay, discard and the idempotency check
  in §4.5 address a dead letter directly by `DeliveryID`; time ordering comes from `GSI2`. No LSIs are used, so
  there is no 10 GB item-collection limit.
- Item sizes: the envelope is ≤ 256 KB and the DynamoDB item limit is 400 KB, which leaves ~140 KB for other
  attributes. Only small attributes are added.
- `orderKey` is `Sequence` for `ExplicitSequence` topics and `ParkOrder` (a monotonic counter in STATE) for
  `PublishOrder` topics (§6.4).

### 6.3 STATE item

```ts
export type AwsPartitionCondition = 'Idle' | 'Blocked' | 'Draining' | 'AwaitingSequence';

export interface PartitionStateItem {
  PK: string; SK: 'STATE';
  Condition: AwsPartitionCondition;
  Version: number;                       // optimistic concurrency; every write: condition Version = :read, set Version = :read + 1
  // single flight (strong fence)
  InFlightMessageID?: string;
  InFlightToken?: string;                // uuid per claim
  InFlightExpiresAt?: number;            // epoch ms; now + LeaseSeconds (+ ClockSkewAllowanceMs on read)
  // ordering
  LastCompletedSequence?: number;        // ExplicitSequence high-water mark (Completed | Discarded | Skipped)
  LastCompletedMessageID?: string;       // duplicate suppression for PublishOrder
  NextParkOrder: number;                 // PublishOrder parking counter (starts 1)
  ParkedCount: number;
  // blocking
  BlockedByMessageID?: string;
  BlockedSince?: string;
  ReplayCounter: number;
  // draining
  ReleasingMessageID?: string;
  ReleasingSK?: string;
  ReleaseCounter: number;
  ReleasingSince?: string;
  // gaps
  AwaitingSince?: string;
  GapStalled?: boolean;
  // index + ttl
  GSI1PK?: string; GSI1SK?: string;
  ExpiresAt?: number;
}
```

Mapping to 03's `PartitionCondition`: `Idle` → `Idle`, or `InFlight` when `InFlightToken` is set and
unexpired. `Blocked` → `Blocked`. `AwaitingSequence` → `AwaitingSequence`, or `GapStalled` when `GapStalled`.
`Draining` → reported as `InFlight`, meaning the key is actively progressing. `PartitionStateRecord.WaitingItems`
= `ParkedCount`.

### 6.4 Receive algorithm (Ordered)

```
onReceive(msg):                                  // after §4.6 steps 1–2
  S ← GetItem(STATE, ConsistentRead) or new Idle item (created lazily by the first conditional write)
  seq ← msg.Envelope.Sequence (ExplicitSequence) | null
  C ← msg.Control

  // duplicates of already-settled work
  if C == null and msg.MessageID == S.LastCompletedMessageID          → delete; return   (PublishOrder dup)
  if seq != null and S.LastCompletedSequence != null and seq ≤ S.LastCompletedSequence
                                                                        → delete; return   (ExplicitSequence dup)
  if C != null and C.Kind == 'Release' and not (C.SourceSK == S.ReleasingSK and C.Counter == S.ReleaseCounter)
                                                                        → delete; return   (stale release)
  if C != null and C.Kind == 'Replay' and not (S.Condition == 'Blocked' and msg.MessageID == S.BlockedByMessageID
                                               and C.Counter == S.ReplayCounter)
                                                                        → delete; return   (stale replay)
  if C == null and S.Condition == 'Blocked' and msg.MessageID == S.BlockedByMessageID
                                                                        → delete; return   (original of a DL, crash before delete)

  // in-flight guard (misconfiguration or zombie overlap)
  if S.InFlightToken set and S.InFlightExpiresAt > now and S.InFlightMessageID != msg.MessageID
                                                                        → Retry(delay = 5 s); return

  switch S.Condition:
    'Blocked':          if C?.Kind == 'Replay' (validated above) → CLAIM
                        else → PARK
    'Draining':         if C?.Kind == 'Release' (validated above) → CLAIM
                        else → PARK
    'AwaitingSequence': if seq == S.LastCompletedSequence + 1 → CLAIM   (the missing one arrived)
                        else → PARK
    'Idle':             if seq == null → CLAIM
                        elif seq == (S.LastCompletedSequence ?? 0) + 1 → CLAIM
                        else → PARK (and set AwaitingSequence)

CLAIM:
  UpdateItem STATE
    SET InFlightMessageID=:m, InFlightToken=:t, InFlightExpiresAt=:now+LeaseSeconds, Version=:v+1
    REMOVE ExpiresAt
    CONDITION Version = :v                                        (or attribute_not_exists(PK) when S is new)
  on ConditionalCheckFailed → re-read and re-evaluate (max 3 loops) → then Retry(delay = 2 s)
  → return delivery to the runtime (handler runs)

PARK:
  orderKey ← seq ?? S.NextParkOrder
  TransactWriteItems [
    Put    PARKED#{orderKey}     cond attribute_not_exists(SK)                         (ExplicitSequence: same seq, different MessageID → see below)
    Put    PARKEDID#{MessageID}  cond attribute_not_exists(SK)
    Update STATE  SET ParkedCount += 1, NextParkOrder += (seq == null ? 1 : 0), Version += 1,
                      Condition = (Idle with a sequence gap → 'AwaitingSequence', else unchanged),
                      AwaitingSince = if_not_exists(AwaitingSince, :now) when AwaitingSequence,
                      GSI1PK/GSI1SK per Condition
                  REMOVE ExpiresAt
                  cond Version = :v
    Update COUNTERS ADD ParkedItems 1
  ]
  on cancellation reason PARKEDID ConditionalCheckFailed → already parked (crash before delete) → delete; return
  on cancellation reason PARKED ConditionalCheckFailed (ExplicitSequence only) → a different MessageID holds this sequence →
       DL item Reason 'DuplicateSequence', BlocksKey = false → delete; return
  on STATE Version conflict → re-read, re-evaluate
  DeleteMessage; emit metric Parked
```

**Ordering correctness for PublishOrder topics.** Within a group, FIFO delivers messages in `SequenceNumber`
order, and at most one of them is in flight at a time. So messages reach `onReceive` in publish order, and
parking assigns `ParkOrder` from the monotonic `STATE.NextParkOrder`, preserving that order. `ParkOrder` is used
rather than the SQS `SequenceNumber` because a released item is re-sent with a **new**, larger
`SequenceNumber`. That number sorts after messages published *before* the release that are still parked. Using
the park counter keeps the original arrival order regardless of re-sends. A released item never re-enters the
parked set with a new order: the only message CLAIMed while `Draining` is the matching release, and any other
arrival parks with `NextParkOrder`, which is always greater than every existing parked order.

**Ordering correctness for ExplicitSequence topics.** The order key is the producer's `Sequence`, which is
independent of SQS order. Early arrivals park under `PARKED#{seq}`. Releases always pick the lowest parked
sequence, and only when it equals `LastCompletedSequence + 1`.

### 6.5 Heartbeat & lease loss (Ordered)

```
every LeaseSeconds/3 (Auto) or on context.Heartbeat() (Manual):
  ChangeMessageVisibility(receiptHandle, LeaseSeconds)
  UpdateItem STATE SET InFlightExpiresAt = :now + LeaseSeconds  COND InFlightToken = :mine
  either failure → 'Lost' → abort signal; the eventual outcome is discarded (no settle writes)
```

When visibility expires mid-handler (for example, a GC pause longer than the lease), SQS redelivers the same
message to consumer B:
- B sees `InFlightMessageID == msg.MessageID`. The in-flight guard only blocks *other* messages, so B may CLAIM
  once `InFlightExpiresAt < now`.
- If B receives the message before A's `InFlightExpiresAt` passes, B takes `Retry(5 s)`, which bounds the
  overlap to the lease.
- Once B's CLAIM overwrites `InFlightToken`, every fenced write A makes afterwards fails, so A can never
  advance the key.

### 6.6 Completion, dead-letter, release

```
COMPLETE(d):
  P ← Query PK=SUB#s#KEY#k, SK begins_with 'PARKED#', Limit 1, ConsistentRead      // lowest parked (excluding own item if released)
  next ← decide:
     newLast ← (seq ?? S.LastCompletedSequence)
     if P exists and P.SK == d.Control?.SourceSK → look at the second-lowest (Limit 2)
     if P exists and (PublishOrder or P.orderKey == newLast + 1) → Condition 'Draining', Releasing = P
     elif P exists (ExplicitSequence gap)                         → Condition 'AwaitingSequence', AwaitingSince = now
     else                                                         → Condition 'Idle' (PublishOrder: set ExpiresAt)
  TransactWriteItems [
    Update STATE  SET LastCompletedSequence=:newLast?, LastCompletedMessageID=:m, Condition=:next, Version+1,
                      ReleasingMessageID/SK/Since per next, ReleaseCounter += (next=='Draining' ? 1 : 0),
                      ParkedCount -= (released ? 1 : 0)
                  REMOVE InFlightMessageID, InFlightToken, InFlightExpiresAt,
                         BlockedByMessageID/BlockedSince (if this was the replayed head), GapStalled (if gap closed)
                  cond InFlightToken = :mine
    [if released]  Delete PARKED#{own orderKey}, Delete PARKEDID#{MessageID}, COUNTERS ADD ParkedItems -1
    [if replay]    Delete DL#{MessageID} (cond Status = 'Replaying'), COUNTERS ADD DeadLettered -1, BlockedKeys -1
  ]
  cancellation on the InFlightToken condition → LeaseLost (no SQS delete; the new holder owns it)
  DeleteMessage(receiptHandle)
  if next == 'Draining' → SEND_RELEASE(P, S.ReleaseCounter)

SEND_RELEASE(P, counter):
  SendMessage(QueueUrl, Body = ControlWrapper{Kind:'Release', Envelope:P.Envelope, SourceSK:P.SK, Counter:counter},
              MessageGroupId = key, MessageDeduplicationId = `${P.MessageID}:Release:${counter}`)
  // The parked item is NOT deleted here; it is deleted inside the COMPLETE/DISCARD transaction of the released message.

DEAD_LETTER(d, reason, error):         // Ordered
  TransactWriteItems [
    Put DL#{MessageID} (Status 'DeadLettered', BlocksKey true, ReplayCounter = existing or 0)   cond attribute_not_exists OR Status = 'Replaying'
    Update STATE SET Condition='Blocked', BlockedByMessageID=:m, BlockedSince=:now, GSI1PK=…#COND#Blocked, Version+1
                 REMOVE InFlight*  cond InFlightToken = :mine
    [if d was a release] Delete PARKED#{orderKey}, Delete PARKEDID#{MessageID}, ParkedCount -1, COUNTERS ParkedItems -1
    COUNTERS ADD DeadLettered (new ? 1 : 0), BlockedKeys 1
  ]
  DeleteMessage
```

### 6.7 Crash & failure analysis

| # | Crash / failure point | What happens next | Outcome |
|---|---|---|---|
| F1 | After the PARK transaction, before `DeleteMessage` | Redelivery → PARK transaction fails on `PARKEDID` → delete | No duplicate park |
| F2 | After CLAIM, handler crashes | Visibility expires → redelivered. `InFlightMessageID` matches, so it may CLAIM after `InFlightExpiresAt`. | Retry, attempt +1 |
| F3 | After the COMPLETE transaction, before `DeleteMessage` | Redelivery → `LastCompletedMessageID` or sequence ≤ Last → delete | No double processing |
| F4 | After the COMPLETE transaction, before `SEND_RELEASE` | STATE is `Draining` with `ReleasingSince` set and no message in the queue. **Sweeper** (§9.6) finds `Draining` older than `ReleaseStallSeconds` (default `2 × LeaseSeconds`), increments `ReleaseCounter` (fenced on Version), and re-sends. | Liveness restored ≤ ~2 leases + 1 min |
| F5 | `SEND_RELEASE` duplicated (sweeper re-send racing with a slow original) | The copy with the older `Counter` fails the stale-release check → delete | No duplicate |
| F6 | Released item completes, crash before `DeleteMessage` | Redelivery → `LastCompletedMessageID` or sequence check → delete. The parked item was already deleted inside the COMPLETE transaction. | OK |
| F7 | After the DEAD_LETTER transaction, before `DeleteMessage` | Redelivery (no wrapper) with `MessageID == BlockedByMessageID` → delete | No spurious park |
| F8 | Operator replay sent, but the replayed message crashes the handler repeatedly | The replayed SQS message has its own receive count. At `MaxAttempts` → DEAD_LETTER with `Status` `Replaying` → `DeadLettered` (same item, updated) | Key stays blocked |
| F9 | Runtime can't run (init crash, DynamoDB outage) for `MaxAttempts + 2` receives | SQS redrive → backstop DLQ. **The FIFO group moves on.** A later message for the key could be CLAIMed before the sweeper ingests the backstop (≤ 1 min). | **Known window.** Mitigations: (a) the pre-handler check means the handler never runs past `MaxAttempts`, so only runtime-level failures reach the backstop; (b) if DynamoDB is unavailable, CLAIM fails, so later messages cannot progress either; (c) an alarm on backstop depth > 0. |
| F10 | Two different subscriptions misconfigured onto the same queue | Their `PK`s differ (`SUB#…`), so state doesn't cross, but each consumes the other's messages. `ValidateBindings` rejects shared queue URLs. | Prevented by validation |
| F11 | MJ worker and Lambda both consuming one Ordered queue (misconfiguration) | FIFO still delivers one message per group at a time. The Version + InFlightToken fences keep the state consistent. | Safe; `ValidateBindings` warns (HostType mismatch) |

### 6.8 Operator actions (Ordered specifics)

| Action | Implementation |
|---|---|
| **Replay** (DL with `BlocksKey`) | TransactWrite: `STATE` cond `Condition='Blocked' AND BlockedByMessageID=:id` → `ReplayCounter += 1`; `DL` cond `Status='DeadLettered'` → `Status='Replaying'`, `ReplayCounter = new`. Then `SendMessage` wrapper `{Kind:'Replay', Counter}` with dedup `{id}:Replay:{counter}`. If the send fails → revert `Status` to `DeadLettered` (best effort; the sweeper also reverts `Replaying` items older than `ReplayStallSeconds` with no in-flight token). |
| **Discard** (DL with `BlocksKey`) | cond `Status='DeadLettered'` (409 `ReplayInProgress` if `Replaying`). TransactWrite: delete DL; COUNTERS `DeadLettered -1`, `BlockedKeys -1`; STATE cond `Blocked AND BlockedByMessageID=:id` → set `LastCompletedSequence = discarded.Sequence` (ExplicitSequence) and `LastCompletedMessageID = id`, then compute *next* exactly as in COMPLETE (Draining / AwaitingSequence / Idle) → `SEND_RELEASE` if Draining. Audit fields `ResolvedBy`, `ResolutionNote` are emitted to the structured log and CloudWatch Logs (DL item is gone). |
| **SkipSequence**(key, seq) | cond `Condition='AwaitingSequence' AND LastCompletedSequence = :seq − 1` → `LastCompletedSequence = seq`, `GapStalled` removed, Put `SKIP#{seq}` audit, compute next as in COMPLETE → `SEND_RELEASE` if the lowest parked is now `seq + 1`. |
| Replay / Discard of a non-blocking DL | §9.3 |

### 6.9 State diagram (Ordered key on AWS)

```
                     arrival (next in order)                    handler Complete
          ┌──────────────────────────────────────► [Idle+InFlight] ─────────────────────┐
          │                                             │                               │
        Idle ◄──────── no parked, no gap ───────────────┼───────────────────────────────┤
          │                                             │ DeadLetter / max attempts      │
          │ arrival with seq > Last+1                   ▼                               │ lowest parked is next
          ▼                                          Blocked ──── operator Discard ─────┤
   AwaitingSequence ◄── parked exist, gap ─────────────  │                              ▼
          │  ▲                                          │ operator Replay            Draining ──(release completes)──┐
          │  └───── gap remains after complete ─────────┤ (replayed head Complete)      │   ▲                         │
          │ missing seq arrives / SkipSequence          └────────────────────────────►  │   └── next parked is next ──┘
          └──────────────────────────────────────────────────────────────────────────────┘
   (every non-Idle state: arrivals other than the expected head/replay/release are PARKED)
```

---

## 7. Lambda adapter

### 7.1 API

```ts
// @memberjunction/work-queue-aws/lambda
import type { SQSEvent, SQSBatchResponse, Context } from 'aws-lambda';

export interface SqsLambdaHandlerOptions {
  /** Defaults to JSON.parse(process.env.MJ_WQ_SUBSCRIPTION). */
  Binding?: SubscriptionBinding;
  /** Max groups processed concurrently in one invocation (default 10). Items in a group always run sequentially. */
  GroupConcurrency?: number;
  /** Abort handlers when remaining time < this (default max(10_000, 10% of the function timeout)). */
  TimeoutSafetyMs?: number;
  /** Grace period after abort before the delivery is settled as Retry (default 3_000). */
  AbortGraceMs?: number;
  Log?: WorkLogger;          // default: JSON structured logger to stdout
  Metrics?: WorkMetrics;     // default: CloudWatch EMF writer
}

export function CreateSqsLambdaHandler<TPayload extends WorkJson>(
  handlerFactory: () => WorkHandler<TPayload>,
  options?: SqsLambdaHandlerOptions,
): (event: SQSEvent, context: Context) => Promise<SQSBatchResponse>;

export function CreateStateSweeperHandler(options?: StateSweeperOptions):
  (event: { source?: string }, context: Context) => Promise<StateSweepReport>;
```

### 7.2 Invocation flow

```
cold start (module scope, once per execution environment):
  binding ← parse + validate MJ_WQ_SUBSCRIPTION (fail fast: throw → Lambda init error → messages retried)
  clients ← SQS, DynamoDB DocumentClient (region from binding; keep-alive agent)
  consumer ← new SqsTransportConsumer(clients, binding)
  runtime  ← new ConsumerRuntime(consumer, handlerFactory, binding.Policy, { Concurrency: GroupConcurrency, … })

invoke(event, context):
  deliveries ← event.Records.map(toReceivedDelivery)   // Attempt from attributes.ApproximateReceiveCount
  groups ← groupBy(deliveries, r => r.attributes.MessageGroupId ?? r.messageId)   // preserve record order within a group
  deadline ← now + context.getRemainingTimeInMillis() − TimeoutSafetyMs
  failures ← []
  run groups with concurrency GroupConcurrency:
     for item in group (sequential):
        if now ≥ deadline: failures.push(item and every later item in the group); break
        result ← runtime.ProcessBatch([item]) with abort at deadline
        if result is Retry / Release / LeaseLost / Failed:
            failures.push(item, and EVERY LATER ITEM IN THE SAME GROUP)   // FIFO order preservation
            break
  return { batchItemFailures: failures.map(f => ({ itemIdentifier: f.messageId })) }
```

| Runtime settle result | Reported to Lambda as | Why |
|---|---|---|
| Completed (deleted), DeadLettered (DL + delete), Parked (park + delete), Duplicate (delete) | success (not listed) | The runtime already deleted the message. Lambda's own delete of successful items is a harmless no-op *(verify)*. |
| Retry (visibility set to backoff) | failure | Lambda must not delete. The message returns after the backoff the runtime set. |
| Release / LeaseLost / Failed | failure | Must not delete |
| Later items in a group after a failure | failure (never started) | Keeps FIFO order. AWS guidance for FIFO + partial batch response is to stop after the first failure and return the rest; doing this per group preserves order within each group *(verify that the Lambda FIFO poller accepts per-group partial failures without reordering)*. |

Event source mapping requirements (enforced by Terraform, checked by `ValidateBindings` where possible):
`FunctionResponseTypes = ["ReportBatchItemFailures"]`; FIFO `BatchSize ≤ 10`; `ScalingConfig.MaximumConcurrency`
set from `lambda_consumers[*].max_concurrency`. There is no `MaximumBatchingWindowInSeconds` on FIFO queues
*(verify)*.

### 7.3 Timeout guard

```
deadline − now reaches 0 while a handler is running:
  abort context.Signal (reason 'HostTimeout')
  wait AbortGraceMs for the handler promise
  settle as Retry(delay = 0, error 'HostTimeout: Lambda remaining time exhausted')   // counts as an attempt (receive already counted)
  Ordered: fenced clear of InFlightToken
  a MaxProcessingSeconds above (lambda_timeout − safety) logs a Warning at cold start (D5)
```

### 7.4 Observability

Structured JSON log fields: `Subscription`, `Topic`, `MessageID`, `SqsMessageId`, `PartitionKey`, `Attempt`,
`Outcome`, `DurationMs`, `CorrelationID`, `AwsRequestId`.

CloudWatch EMF, namespace `MJ/WorkQueue`, dimensions `[Subscription]` (plus `[Subscription, Outcome]` for
`Processed`):

| Metric | Unit | Emitted |
|---|---|---|
| `Processed` | Count | per settled delivery (dimension `Outcome` = Completed / Retried / DeadLettered / Duplicate) |
| `Retried` | Count | per Retry |
| `DeadLettered` | Count | per DL write (any mode, including sweeper backstop ingest) |
| `Parked` | Count | per PARK (Ordered) |
| `Released` | Count | per SEND_RELEASE |
| `BlockedKeys` | Count (gauge) | sweeper, from COUNTERS |
| `GapStalledKeys` | Count (gauge) | sweeper |
| `HandlerDurationMs` | Milliseconds | per handler run |
| `LeaseLost` | Count | per lost lease |
| `BackstopIngested` | Count | sweeper |

### 7.5 Example: thin consumer (no MJ dependencies)

```ts
// examples/email-record/index.ts   — bundle: esbuild --bundle --platform=node --target=node22
import { CreateSqsLambdaHandler } from '@memberjunction/work-queue-aws/lambda';
import { Outcome, type WorkHandler, type WorkMessage, type WorkContext } from '@memberjunction/work-queue-core';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

interface EmailEvent { ProviderEventID: string; EventType: string; Email: string; OccurredAt: string; CampaignID?: string; }

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.EMAIL_EVENTS_TABLE ?? '';

class RecordEmailEvent implements WorkHandler<EmailEvent> {
  public async Handle(message: WorkMessage<EmailEvent>, context: WorkContext) {
    const e = message.Payload;
    if (!e) return Outcome.DeadLetter('Missing payload');
    try {
      await doc.send(new PutCommand({
        TableName: TABLE,
        Item: { PK: `EVT#${e.ProviderEventID}`, ...e, MessageID: message.MessageID },
        ConditionExpression: 'attribute_not_exists(PK)',          // idempotent by provider event ID
      }), { abortSignal: context.Signal });
    } catch (err) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') return Outcome.Complete();
      throw err;                                                    // → Retry with backoff
    }
    return Outcome.Complete();
  }
}

export const handler = CreateSqsLambdaHandler(() => new RecordEmailEvent());
```

### 7.6 Example (conceptual): consumer that calls MJ

For handlers that need MJ data but run in Lambda (02 §4, "MJ access is a consumer problem"):

```ts
// examples/email-subscriber-update/index.ts  (conceptual)
// - API key stored in Secrets Manager (secret ARN in env MJ_API_KEY_SECRET_ARN), fetched once per cold start and cached.
// - Calls MJ over its public API with the X-API-Key header, using a scoped key (e.g. entity permissions on the
//   subscriber entities only).
// - Client: the MJ GraphQL client package (GraphQLDataProvider in API-key mode) or plain fetch against the MJ REST
//   endpoints. Which one is standardized for external consumers is settled in 04 / 06d; this example deliberately
//   does not pin it.
// - Idempotency: last-writer-wins by event OccurredAt, compared server-side.
class UpdateSubscriber implements WorkHandler<EmailEvent> {
  public async Handle(message: WorkMessage<EmailEvent>, context: WorkContext) {
    const mj = await GetMJClient();              // cached; re-reads the secret on 401
    const result = await mj.UpsertSubscriberEngagement(message.Payload!, { signal: context.Signal });
    if (result.Kind === 'NotRetryable') return Outcome.DeadLetter(result.Reason);
    if (result.Kind === 'Throttled') return Outcome.Retry('MJ throttled', result.RetryAfterSeconds);
    return Outcome.Complete();
  }
}
```

The Terraform `lambda_consumers[*].secrets` input grants `secretsmanager:GetSecretValue` on the listed ARNs
(§10.3).

---

## 8. MJ worker on AWS subscriptions

MJ-hosted handlers (`HostType = 'MJWorker'`) can consume an AWS-transport subscription. The worker host
service (04) opens `driver.OpenConsumer(binding)`, then runs `ConsumerRuntime.Start()`.

| Aspect | Behavior |
|---|---|
| Receive | `ReceiveMessage` long poll: `WaitTimeSeconds = 20`, `MaxNumberOfMessages = min(10, free slots)`, `VisibilityTimeout = LeaseSeconds` (overrides the queue default at receive time) |
| Loop | While free slots > 0: receive; if empty, the next long poll starts immediately (long polling is already the idle wait). `Kick()` is a no-op for AWS consumers. |
| Concurrency | `ConsumerRuntimeOptions.Concurrency` from the `workQueue` config section (04). FIFO groups still serialize. |
| Heartbeat | Same as §4.4 (ChangeMessageVisibility + Ordered fence) |
| Shutdown | Stop receiving, drain for up to `ShutdownDrainMs`, then abort and `Release` (§4.2: this consumes a receive) |
| Handler context | `BaseWorkHandler` gets `ContextUser` / `Provider` from the MJ host, as for DB-transport subscriptions |
| Sweeper | The MJ host does **not** run the AWS state sweeper by default. The Terraform-deployed sweeper Lambda owns it (§9.6). The config flag `workQueue.aws.runStateSweeper` (default `false`) lets deployments without the sweeper Lambda run the same code from MJ. |

### 8.1 Credential resolution (MJ side only)

```ts
// @memberjunction/work-queue-engine — engine/src/transports/aws/AWSTransportDriverFactory.ts (04 §9)
@RegisterClass(BaseTransportDriverFactory, 'AWS')
export class AWSTransportDriverFactory extends BaseTransportDriverFactory {
  public async Create(transport: MJWorkQueueTransportEntity, contextUser: UserInfo): Promise<ITransportDriver> {
    const cfg = ParseAwsTransportConfiguration(transport.Configuration);   // { Region, StateTableName?, Endpoint? (LocalStack) }
    const credentials = transport.CredentialID
      ? await ResolveMJCredential(transport.CredentialID, contextUser)
      : fromNodeProviderChain();                                          // ambient: ECS task role, instance profile, env
    return new AwsTransportDriver(BuildAwsClients(cfg, credentials), DefaultAwsDriverOptions());
  }
}

async function ResolveMJCredential(credentialID: string, contextUser: UserInfo): Promise<AwsCredentialIdentityProvider> {
  // CredentialEngine.Instance.getCredential(name, { credentialId, contextUser, subsystem: 'WorkQueue' })
  // (verify the exact option names in CredentialResolutionOptions)
  // Values: { AccessKeyId, SecretAccessKey, SessionToken? } or { RoleArn, ExternalId?, SourceProfile? }
  // RoleArn → fromTemporaryCredentials({ params: { RoleArn, ExternalId, RoleSessionName: 'mj-work-queue' } }) on top of ambient creds.
}
```

- **Recommended:** ambient role (null `CredentialID`) for MJAPI running in AWS, and `RoleArn` credentials for
  MJ running outside AWS. Static access keys are supported but discouraged.
- `BaseTransportDriverFactory` and this factory live in the engine package (04 §9), which depends on
  `@memberjunction/work-queue-aws`. The AWS package itself never imports `@memberjunction/*` beyond
  `work-queue-core`, so Lambda bundles stay thin. The factory signature follows 03 (`Create(transport, deps)`);
  `deps` carries the context user and credential engine.

---

## 9. Operator implementation & state sweeper

### 9.1 `GetStats`

| `SubscriptionStats` field | Source | Cost |
|---|---|---|
| `Pending` | `GetQueueAttributes`: `ApproximateNumberOfMessages` + `ApproximateNumberOfMessagesDelayed` | 1 SQS call |
| `InFlight` | `ApproximateNumberOfMessagesNotVisible` (includes messages waiting on retry backoff) | same call |
| `DeadLettered` | `COUNTERS.DeadLettered` + backstop DLQ `ApproximateNumberOfMessages` (not yet ingested) | 1 GetItem + 1 SQS call |
| `BlockedKeys` | `COUNTERS.BlockedKeys` | same GetItem |
| `ParkedItems` | `COUNTERS.ParkedItems` | same GetItem |
| `OldestPendingAgeSeconds` | CloudWatch `GetMetricData` `AWS/SQS ApproximateAgeOfOldestMessage` (last 5 min, Maximum). `null` if the CloudWatch client is not configured. | 1 CloudWatch call (billed) |
| `CompletedLastHour` | `null` (02 D11) | — |

Counters are maintained **only** inside transactions (atomic with the item changes). A `RecountCounters`
maintenance operation (CLI `mj queue aws recount --subscription`) rebuilds them by querying GSI1/GSI2. It's for
drift after manual table edits.

### 9.2 `ListDeadLetters`

`Query GSI2 GSI2PK = SUB#{sub}#DL`, `ScanIndexForward = false` (newest first), `Limit = pageSize`.
`NextCursor` = base64url(`LastEvaluatedKey`). GSIs are eventually consistent, so a just-written dead letter may
take a moment to appear. `BlocksKey` comes from the item.

### 9.3 `Replay` / `Discard` (non-blocking dead letters: `None`, `Exclusive`, or `DuplicateSequence` records)

| Action | Steps |
|---|---|
| Replay | `UpdateItem DL` cond `Status='DeadLettered'` → `Status='Replaying'`, `ReplayCounter += 1`, `ReplayedBy`, `ReplayedAt`. Then `SendMessage` wrapper `{Kind:'Replay', SourceSK:'DL#id', Counter}` (FIFO: group = `PartitionKey ?? MessageID`, dedup `{id}:Replay:{counter}`). The runtime's `Complete` of a replay deletes the DL item (cond `Status='Replaying'`, COUNTERS `DeadLettered -1`). A replay that dead-letters again updates the same item back to `DeadLettered` with the new `LastError`. |
| Discard | `TransactWrite`: delete DL (cond `Status='DeadLettered'`), COUNTERS `DeadLettered -1`. The audit record (actor, reason, envelope digest) goes to a structured log line **and** to an `AUDIT#{at}#{id}` item under `SUB#{sub}` with a 400-day TTL. |

Blocking (Ordered) dead letters: §6.8.

### 9.4 `ListPartitions`

- `condition` given: `Query GSI1 GSI1PK = SUB#{sub}#COND#{Condition}`. `InFlight` is not indexed: it is derived
  from `Idle` items with an unexpired token and is not listable on AWS. `GapStalled` queries `AwaitingSequence`
  and filters `GapStalled = true`.
- `condition = null`: returns **non-Idle keys only** (merged queries over the three indexed conditions). Listing
  every key would need a table scan, which Phase 1 deliberately doesn't offer (deviation §16).
- `WaitingItems` = `ParkedCount`.

### 9.5 `SkipSequence`

§6.8. `404 KeyNotFound` if the STATE item is missing. `409 NotAwaitingSequence` or `409 SequenceMismatch` when
the conditions fail.

### 9.6 State sweeper (`IngestBackstop` + liveness repair)

Deployed by Terraform as `{prefix}-{env}-wq-sweeper`, triggered by EventBridge `rate(1 minute)`, with reserved
concurrency 1. It reads `MJ_WQ_MANIFEST_BINDINGS` (the list of `SubscriptionBinding`s for the deployment; if it
exceeds the Lambda environment's 4 KB limit, it is read from an S3 object whose key is in the environment
*(verify limit)*).

| Task | Per subscription | Action |
|---|---|---|
| **Backstop ingest** | always | `ReceiveMessage` from the backstop DLQ (up to `SweepMaxIngestPerRun`, default 100). For each: decode → DL item `Reason 'RedrivePolicy'`, `Attempts = ApproximateReceiveCount`. For Ordered, the same transaction as DEAD_LETTER **without** the InFlight fence: `STATE → Blocked` if not already blocked (if blocked by a different message, the new DL is recorded with `BlocksKey=false` and `Reason 'RedrivePolicyWhileBlocked'`). → `DeleteMessage` from the backstop. Emits `BackstopIngested`. |
| **Stalled release** | Ordered | `Query GSI1 …#COND#Draining` where `ReleasingSince < now − ReleaseStallSeconds`, and no unexpired in-flight token → fenced `ReleaseCounter += 1` → SEND_RELEASE |
| **Stalled replay** | all modes | DL items `Status='Replaying'` with `ReplayedAt < now − ReplayStallSeconds` (default `MaxAttempts × (LeaseSeconds + BackoffMaxSeconds) + 300`) → `Status='DeadLettered'`, `LastError 'ReplayStalled'` |
| **Gap stall** | Ordered + ExplicitSequence with `SequenceGapAlertSeconds` | `Query GSI1 …#COND#AwaitingSequence` where `AwaitingSince < now − SequenceGapAlertSeconds` → set `GapStalled = true`, emit `GapStalledKeys` |
| **Gauges** | all | emit `BlockedKeys` / `ParkedItems` / `DeadLettered` from COUNTERS |

`ITransportOperator.IngestBackstop(subscription)` runs the backstop-ingest task for one subscription on demand
(REST `POST /subscriptions/{sub}/backstop/ingest`).

### 9.7 `ValidateBindings`

| Check | API | Severity on failure |
|---|---|---|
| Topic exists; `FifoTopic` matches `IsFifo`; `ContentBasedDeduplication = false` | `SNS GetTopicAttributes` | Error |
| AWS topic requires FIFO: any subscription `Exclusive`/`Ordered` or `OrderingMode = ExplicitSequence`, but `IsFifo = false` | metadata | Error |
| `MaxPayloadBytes > 261_000` | metadata | Warning (§3.2) |
| Subscription exists on the topic → queue ARN; `RawMessageDelivery = true`; `FilterPolicyScope = MessageAttributes`; `FilterPolicy` semantically equals `ToSnsFilterPolicy(Filter)` | `SNS ListSubscriptionsByTopic` + `GetSubscriptionAttributes` | Error |
| Queue exists; `FifoQueue` matches; `RedrivePolicy.maxReceiveCount = MaxAttempts + 2` and target = `BackstopDlqArn`; `VisibilityTimeout ≥ LeaseSeconds`; `MaximumMessageSize ≥ 262144` | `SQS GetQueueAttributes` | Error (visibility: Warning) |
| Backstop DLQ exists and FIFO matches | `SQS GetQueueAttributes` | Error |
| No two subscriptions share a `QueueUrl` | metadata | Error |
| State table exists, key schema `PK`/`SK`, `GSI1` and `GSI2` present and `ACTIVE` | `DynamoDB DescribeTable` | Error |
| `HostType = External` and `ExternalRef` is a Lambda ARN whose event source mapping points at this queue with `ReportBatchItemFailures` | `Lambda ListEventSourceMappings` (needs `lambda:ListEventSourceMappings`; skipped with Warning if denied) | Warning |
| `MaxProcessingSeconds` > the Lambda function timeout (External + Lambda ARN) | `Lambda GetFunctionConfiguration` | Warning (D5) |

---

## 10. IAM

Policies are generated by the Terraform module (§11). The JSON sketches below show the **shape**; the module
emits one statement set per role with the exact ARNs.

### 10.1 MJAPI publisher + operator role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "Publish", "Effect": "Allow", "Action": ["sns:Publish"],
      "Resource": ["arn:aws:sns:us-east-1:111122223333:mj-prod-*"] },
    { "Sid": "ValidateTopology", "Effect": "Allow",
      "Action": ["sns:GetTopicAttributes", "sns:ListSubscriptionsByTopic", "sns:GetSubscriptionAttributes",
                 "sqs:GetQueueAttributes", "sqs:GetQueueUrl", "dynamodb:DescribeTable"],
      "Resource": ["arn:aws:sns:us-east-1:111122223333:mj-prod-*",
                   "arn:aws:sqs:us-east-1:111122223333:mj-prod-*",
                   "arn:aws:dynamodb:us-east-1:111122223333:table/mj-prod-wq-state"] },
    { "Sid": "OperatorQueues", "Effect": "Allow",
      "Action": ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage"],
      "Resource": ["arn:aws:sqs:us-east-1:111122223333:mj-prod-*"] },
    { "Sid": "OperatorState", "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:UpdateItem", "dynamodb:PutItem",
                 "dynamodb:DeleteItem", "dynamodb:TransactWriteItems", "dynamodb:ConditionCheckItem"],
      "Resource": ["arn:aws:dynamodb:us-east-1:111122223333:table/mj-prod-wq-state",
                   "arn:aws:dynamodb:us-east-1:111122223333:table/mj-prod-wq-state/index/*"] },
    { "Sid": "Stats", "Effect": "Allow", "Action": ["cloudwatch:GetMetricData"], "Resource": "*" },
    { "Sid": "OptionalLambdaChecks", "Effect": "Allow",
      "Action": ["lambda:ListEventSourceMappings", "lambda:GetFunctionConfiguration"], "Resource": "*" },
    { "Sid": "Kms", "Effect": "Allow", "Action": ["kms:GenerateDataKey*", "kms:Decrypt"],
      "Resource": ["<kms_key_arn if set>"] }
  ]
}
```

Wildcards on `{prefix}-{env}-*` keep the policy stable as topics are added. The module variable
`mjapi_policy_mode = "exact"` switches to explicit ARNs for stricter environments.

### 10.2 MJ worker role (subscriptions with `HostType = MJWorker`)

Added to the MJAPI role, or to a separate worker task role:

```json
{
  "Statement": [
    { "Sid": "ConsumeQueues", "Effect": "Allow",
      "Action": ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility",
                 "sqs:GetQueueAttributes", "sqs:SendMessage"],
      "Resource": ["<QueueArn of each MJWorker subscription>"] },
    { "Sid": "State", "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem",
                 "dynamodb:DeleteItem", "dynamodb:TransactWriteItems"],
      "Resource": ["<state table ARN>"],
      "Condition": { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["SUB#<sub-a>*", "SUB#<sub-b>*"] } } },
    { "Sid": "Kms", "Effect": "Allow", "Action": ["kms:Decrypt", "kms:GenerateDataKey*"], "Resource": ["<kms_key_arn>"] }
  ]
}
```

`sqs:SendMessage` on its own queue is required for Ordered releases.

### 10.3 Per-subscription Lambda consumer role

```json
{
  "Statement": [
    { "Sid": "OwnQueue", "Effect": "Allow",
      "Action": ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility",
                 "sqs:GetQueueAttributes", "sqs:SendMessage"],
      "Resource": ["arn:aws:sqs:us-east-1:111122223333:mj-prod-email-unsubscribe"] },
    { "Sid": "OwnStatePrefix", "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem",
                 "dynamodb:DeleteItem", "dynamodb:TransactWriteItems"],
      "Resource": ["arn:aws:dynamodb:us-east-1:111122223333:table/mj-prod-wq-state"],
      "Condition": { "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["SUB#email.unsubscribe*"] } } },
    { "Sid": "Logs", "Effect": "Allow", "Action": ["logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": ["arn:aws:logs:us-east-1:111122223333:log-group:/aws/lambda/mj-prod-email-unsubscribe:*"] },
    { "Sid": "Secrets", "Effect": "Allow", "Action": ["secretsmanager:GetSecretValue"],
      "Resource": ["<each ARN in lambda_consumers[sub].secrets>"] },
    { "Sid": "Kms", "Effect": "Allow", "Action": ["kms:Decrypt", "kms:GenerateDataKey*"], "Resource": ["<kms_key_arn>"] }
  ]
}
```

Notes:
- `LeadingKeys` with a `*` suffix also matches `SUB#email.unsubscribe-other…`. The module **rejects** subscription
  names where one is a prefix of another followed by a character other than `#` *(alternatively use
  `SUB#{sub}#*` plus `SUB#{sub}` as two exact patterns: DL/COUNTERS items use PK `SUB#{sub}` and state items
  use `SUB#{sub}#KEY#…`, so use `["SUB#{sub}", "SUB#{sub}#*"]`; this is the preferred form)*.
- Condition keys on `TransactWriteItems` are evaluated per contained action *(verify LeadingKeys enforcement for
  TransactWriteItems and Query on GSIs)*. The Lambda role does not need GSI access because Lambdas never query
  GSIs; only the sweeper and operator do.
- The Lambda **execution role does not** include `sqs:ReceiveMessage` on the backstop DLQ. Only the sweeper
  role does.

### 10.4 Sweeper role

Consume/delete on all backstop DLQs, `sqs:SendMessage` on all source queues (releases), full item access on
the state table **including** `/index/*`, `cloudwatch:PutMetricData` is not needed (EMF via logs), logs.

---

## 11. Terraform module

### 11.1 Location & layout

No infrastructure folder exists at the repo root today. The module goes in a new top-level
`infrastructure/terraform/` tree (a sibling of `docker/`), so later modules (`work-queue/azure`, 06a) sit
alongside it.

```
infrastructure/terraform/work-queue/aws/
  README.md              usage, inputs/outputs table (terraform-docs generated)
  RUNBOOK.md             §12 operational runbook
  versions.tf            terraform >= 1.7; hashicorp/aws ~> 6.0 (verify current major); archive provider not used
  variables.tf           inputs + validation blocks
  main.tf                manifest decode, locals (names, flattening, FIFO checks), tags
  topics.tf              aws_sns_topic, aws_sns_topic_policy
  subscriptions.tf       aws_sqs_queue (source + backstop), aws_sqs_queue_policy,
                         aws_sqs_queue_redrive_allow_policy, aws_sns_topic_subscription
  state.tf               aws_dynamodb_table (PK/SK, GSI1, GSI2, TTL, PITR, SSE)
  lambda.tf              consumer aws_lambda_function, aws_lambda_event_source_mapping, log groups;
                         sweeper function + aws_cloudwatch_event_rule/target + permission
  iam.tf                 consumer roles, sweeper role, aws_iam_policy documents for MJAPI / MJ worker (output only)
  alarms.tf              aws_cloudwatch_metric_alarm set + optional dashboard
  outputs.tf             binding_import (BindingImport JSON), mjapi_policy_json, worker_policy_json, names
  tests/
    fixtures/manifest.sample.json
    names.tftest.hcl     naming + truncation
    fifo.tftest.hcl      FIFO consistency validation failures
    plan.tftest.hcl      mock_provider plan assertions (resource counts per manifest)
  examples/
    basic/               email.events (standard) + integration.batch-ready (FIFO) wiring
```

### 11.2 Inputs

```hcl
variable "manifest_path"   { type = string, default = null }       # path to `mj queue export-topology` JSON
variable "manifest"        { type = any,    default = null }       # or the decoded object (one of the two)
variable "name_prefix"     { type = string }                        # e.g. "mj"; ^[a-z][a-z0-9-]{1,15}$
variable "environment"     { type = string }                        # e.g. "prod";  ^[a-z0-9-]{2,12}$
variable "kms_key_arn"     { type = string, default = null }
variable "fifo_high_throughput" { type = bool, default = true }
variable "mjapi_policy_mode"    { type = string, default = "prefix" }   # "prefix" | "exact"
variable "mj_worker_subscriptions" { type = list(string), default = [] } # subs consumed by MJ (for worker policy + visibility sizing)

variable "lambda_consumers" {
  type = map(object({
    artifact_s3_bucket    = optional(string)
    artifact_s3_key       = optional(string)
    image_uri             = optional(string)          # exactly one of s3 artifact / image
    handler               = optional(string, "index.handler")
    runtime               = optional(string, "nodejs22.x")   # verify supported runtimes; nodejs20.x is past community EOL
    architecture          = optional(string, "arm64")
    memory_mb             = optional(number, 512)
    timeout_seconds       = optional(number, 60)             # ≤ 900
    batch_size            = optional(number, 10)             # FIFO ≤ 10
    max_concurrency       = optional(number, 50)             # ScalingConfig.MaximumConcurrency (2..1000, verify)
    reserved_concurrency  = optional(number, null)
    environment           = optional(map(string), {})
    secrets               = optional(list(string), [])       # Secrets Manager ARNs granted to the role
    vpc                   = optional(object({ subnet_ids = list(string), security_group_ids = list(string) }), null)
    log_retention_days    = optional(number, 30)
  }))
  default = {}
}

variable "alarms" {
  type = object({
    enabled                        = optional(bool, true)
    sns_alarm_topic_arn            = optional(string)
    oldest_message_age_seconds     = optional(number, 900)
    lambda_error_rate_threshold    = optional(number, 0.05)
    dead_letter_rate_per_5m        = optional(number, 1)
    blocked_keys_threshold         = optional(number, 1)
  })
  default = {}
}

variable "sweeper" {
  type = object({
    artifact_s3_bucket = string, artifact_s3_key = string,
    schedule_expression = optional(string, "rate(1 minute)")
    release_stall_seconds = optional(number, null)     # default 2 × max LeaseSeconds
  })
}

variable "tags" { type = map(string), default = {} }
```

### 11.3 Locals & validation

```hcl
locals {
  manifest = var.manifest != null ? var.manifest : jsondecode(file(var.manifest_path))

  slug = { for t in local.manifest.Topics : t.Name => substr(replace(lower(t.Name), "/[^a-z0-9_-]/", "-"), 0, 200) }

  subscriptions = merge([
    for t in local.manifest.Topics : {
      for s in t.Subscriptions : s.Name => {
        topic       = t
        sub         = s
        is_fifo     = t.IsFifo
        base        = "${var.name_prefix}-${var.environment}-${replace(lower(s.Name), "/[^a-z0-9_-]/", "-")}"
        # truncation + sha1 suffix rule mirrored from ResourceNames.ts (tests assert parity)
      }
    }
  ]...)

  fifo_violations = [
    for t in local.manifest.Topics : t.Name
    if !t.IsFifo && (t.OrderingMode == "ExplicitSequence" ||
                     anytrue([for s in t.Subscriptions : contains(["Exclusive", "Ordered"], s.Policy.PartitionMode)]))
  ]
  unknown_lambda_consumers = [for k in keys(var.lambda_consumers) : k if !contains(keys(local.subscriptions), k)]
  external_without_lambda  = [for k, v in local.subscriptions : k if v.sub.HostType == "External" && !contains(keys(var.lambda_consumers), k)]
}

resource "terraform_data" "manifest_checks" {
  lifecycle {
    precondition {
      condition     = local.manifest.ManifestVersion == 1
      error_message = "Unsupported ManifestVersion."
    }
    precondition {
      condition     = length(local.fifo_violations) == 0
      error_message = "Topics must be FIFO (IsFifo=true) when partitioned/ExplicitSequence: ${join(", ", local.fifo_violations)}"
    }
    precondition {
      condition     = length(local.unknown_lambda_consumers) == 0
      error_message = "lambda_consumers keys not in manifest: ${join(", ", local.unknown_lambda_consumers)}"
    }
  }
}

check "external_subscriptions_have_consumers" {
  assert {
    condition     = length(local.external_without_lambda) == 0
    error_message = "External subscriptions without a lambda_consumers entry (deployed elsewhere?): ${join(", ", local.external_without_lambda)}"
  }
}
```

### 11.4 Key resources (excerpt)

```hcl
resource "aws_sns_topic" "this" {
  for_each                    = { for t in local.manifest.Topics : t.Name => t }
  name                        = each.value.IsFifo ? "${local.topic_base[each.key]}.fifo" : local.topic_base[each.key]
  fifo_topic                  = each.value.IsFifo
  content_based_deduplication = false
  kms_master_key_id           = var.kms_key_arn
  tags                        = merge(local.tags, { "mj:topic" = each.key })
}

resource "aws_sqs_queue" "backstop" {
  for_each                  = local.subscriptions
  name                      = each.value.is_fifo ? "${local.bdlq_base[each.key]}.fifo" : local.bdlq_base[each.key]
  fifo_queue                = each.value.is_fifo
  message_retention_seconds = 1209600
  kms_master_key_id         = var.kms_key_arn
  sqs_managed_sse_enabled   = var.kms_key_arn == null
  tags                      = merge(local.tags, { "mj:subscription" = each.key, "mj:role" = "backstop" })
}

resource "aws_sqs_queue" "source" {
  for_each                   = local.subscriptions
  name                       = each.value.is_fifo ? "${each.value.base}.fifo" : each.value.base
  fifo_queue                 = each.value.is_fifo
  deduplication_scope        = each.value.is_fifo && var.fifo_high_throughput ? "messageGroup" : null
  fifo_throughput_limit      = each.value.is_fifo && var.fifo_high_throughput ? "perMessageGroupId" : null
  visibility_timeout_seconds = contains(keys(var.lambda_consumers), each.key)
                                 ? max(each.value.sub.Policy.LeaseSeconds, 6 * var.lambda_consumers[each.key].timeout_seconds)
                                 : max(each.value.sub.Policy.LeaseSeconds, 30)
  message_retention_seconds  = 1209600
  receive_wait_time_seconds  = 20
  max_message_size           = 262144
  kms_master_key_id          = var.kms_key_arn
  sqs_managed_sse_enabled    = var.kms_key_arn == null
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.backstop[each.key].arn
    maxReceiveCount     = each.value.sub.Policy.MaxAttempts + 2
  })
  tags = merge(local.tags, { "mj:subscription" = each.key })
}

resource "aws_sns_topic_subscription" "this" {
  for_each             = local.subscriptions
  topic_arn            = aws_sns_topic.this[each.value.topic.Name].arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.source[each.key].arn
  raw_message_delivery = true
  filter_policy_scope  = each.value.sub.Filter == null ? null : "MessageAttributes"
  filter_policy        = each.value.sub.Filter == null ? null : jsonencode(local.sns_filter[each.key])
}

resource "aws_lambda_event_source_mapping" "consumer" {
  for_each                = var.lambda_consumers
  event_source_arn        = aws_sqs_queue.source[each.key].arn
  function_name           = aws_lambda_function.consumer[each.key].arn
  batch_size              = each.value.batch_size
  function_response_types = ["ReportBatchItemFailures"]
  scaling_config { maximum_concurrency = each.value.max_concurrency }
}

resource "aws_lambda_function" "consumer" {
  for_each      = var.lambda_consumers
  function_name = local.subscriptions[each.key].base
  role          = aws_iam_role.consumer[each.key].arn
  s3_bucket     = each.value.artifact_s3_bucket
  s3_key        = each.value.artifact_s3_key
  image_uri     = each.value.image_uri
  package_type  = each.value.image_uri != null ? "Image" : "Zip"
  handler       = each.value.image_uri != null ? null : each.value.handler
  runtime       = each.value.image_uri != null ? null : each.value.runtime
  architectures = [each.value.architecture]
  memory_size   = each.value.memory_mb
  timeout       = each.value.timeout_seconds
  publish       = true
  reserved_concurrent_executions = each.value.reserved_concurrency
  environment {
    variables = merge(each.value.environment, {
      MJ_WQ_SUBSCRIPTION = jsonencode(local.subscription_binding[each.key])   # SubscriptionBinding (03 §5); watch the 4 KB env limit
      NODE_OPTIONS       = "--enable-source-maps"
    })
  }
  tags = merge(local.tags, { "mj:subscription" = each.key })
}
```

The filter translation lives in two places: `ToSnsFilterPolicy` in TypeScript and `local.sns_filter` in HCL,
which maps `{prefix}` → `{"prefix": …}`, `{exists}` → `{"exists": …}`, `{anything-but}` → `{"anything-but": […]}`,
and strings as-is. A Terraform test and a TS unit test share the fixture `tests/fixtures/filters.json` and must
produce the same JSON. **Alternative adopted to reduce drift:** `mj queue export-topology --transport AWS`
includes a precomputed `SnsFilterPolicy` string per subscription in an `Aws` extension block of the manifest
(§16), and HCL uses it verbatim. The HCL translation remains only as a fallback for hand-written manifests.

### 11.5 Outputs

```hcl
output "binding_import" {
  description = "Feed to `mj queue import-bindings` (BindingImport, 03 §8)."
  value = {
    ManifestVersion = 1
    Topics = [for name, t in aws_sns_topic.this : {
      Name = name, BindingConfig = { SnsTopicArn = t.arn }
    }]
    Subscriptions = [for name, s in local.subscriptions : {
      Name = name
      BindingConfig = {
        Region         = data.aws_region.current.name
        QueueUrl       = aws_sqs_queue.source[name].url
        QueueArn       = aws_sqs_queue.source[name].arn
        BackstopDlqUrl = aws_sqs_queue.backstop[name].url
        BackstopDlqArn = aws_sqs_queue.backstop[name].arn
        StateTableName = aws_dynamodb_table.state.name
        IsFifo         = s.is_fifo
      }
    }]
  }
}
output "mjapi_policy_json"        { value = data.aws_iam_policy_document.mjapi.json }
output "mj_worker_policy_json"    { value = data.aws_iam_policy_document.mj_worker.json }
output "state_table_name"         { value = aws_dynamodb_table.state.name }
output "consumer_function_arns"   { value = { for k, f in aws_lambda_function.consumer : k => f.arn } }
```

The module **outputs** the MJAPI and worker policies rather than attaching them: the MJAPI role usually belongs
to a different stack. Attaching is a one-line `aws_iam_role_policy` in the caller.

### 11.6 State & versions

- Terraform `>= 1.7` (needed for `mock_provider` in tests), `hashicorp/aws ~> 6.0` *(verify)*, pinned in
  `versions.tf`. Consumers pin the module by git tag (`?ref=work-queue-aws-v1.0.0`).
- Remote state: S3 backend with native locking (`use_lockfile = true`, Terraform ≥ 1.10 *(verify)*) or a
  DynamoDB lock table. **One state file per environment**
  (`work-queue/aws/{env}/terraform.tfstate`), in the environment's account.
- The state contains queue URLs and ARNs, no secrets. Encrypt the bucket anyway.

---

## 12. Deployment governance runbook

### 12.1 Lifecycle of a topology change

```
 ① Author change in MJ metadata (metadata/work-queue/*.json via mj sync, or MJ UI in a dev env)
        │
 ② mj queue export-topology --transport AWS-{env} > infrastructure/terraform/work-queue/aws/envs/{env}/manifest.json
        │   (deterministic: sorted keys, no timestamps except GeneratedAt which CI ignores in diff)
 ③ PR: metadata diff + manifest diff (+ lambda_consumers tfvars changes)
        │
 ④ CI (work-queue-aws-plan.yml), per changed env:
        terraform fmt -check · terraform validate · tflint · terraform test
        mj queue lint-manifest (schema + FIFO + name-length + LeadingKeys-prefix checks)
        terraform plan -out → plan summary posted to the PR (destroy/replace counts highlighted)
        policy gate: any replace/destroy of aws_sqs_queue.source / aws_sns_topic / aws_dynamodb_table → label "destructive" → requires platform-owner approval (CODEOWNERS)
        │
 ⑤ Approval (CODEOWNERS: platform team for infrastructure/terraform/**, MJ owners for metadata/**)
        │
 ⑥ Merge → apply pipeline (work-queue-aws-apply.yml), environment-gated (GitHub Environments with required reviewers for staging/prod)
        dev (auto) → staging (approval) → prod (approval); the same commit SHA and the same plan artifact per env
        │
 ⑦ terraform output -json binding_import > bindings.{env}.json   (pipeline artifact)
        │
 ⑧ mj queue import-bindings bindings.{env}.json --transport AWS-{env}     (updates Topic/Subscription BindingConfig in that env's MJ DB)
        │
 ⑨ mj queue validate-bindings --transport AWS-{env}   → fail pipeline on any Error
        │
 ⑩ MJAPI rolling restart (or engine cache refresh) → startup ValidateBindings logs; Error → subscription consumer not started + health check degraded
```

**Ordering rule.** Metadata that *adds* a topic or subscription can be merged before infrastructure exists:
subscriptions without `BindingConfig` are reported `Unbound` and not consumed, and publishes to an unbound
topic are `Rejected { Code: 'TopicUnbound', Retryable: true }`. Metadata that *removes* one is applied **after**
the drain procedure (§12.4).

### 12.2 Lambda consumer build & publish pipeline

```
consumer source (in a consumer repo or packages/WorkQueue/aws/examples/*)
  ① pnpm build → esbuild --bundle --platform=node --target=node22 --format=esm|cjs --sourcemap --minify
       external: @aws-sdk/* (provided by the runtime) — pin instead by bundling if reproducibility is required (team choice; default bundle, verify runtime SDK version drift policy)
  ② zip deterministically (sorted entries, fixed mtimes) → sha256 → artifact key: consumers/{subscription}/{sha256}.zip
  ③ upload to the artifacts bucket (versioned, SSE, account-scoped; cross-account read for prod)
  ④ PR to infrastructure tfvars: lambda_consumers[sub].artifact_s3_key = consumers/{sub}/{sha256}.zip
  ⑤ standard ④–⑥ flow above → aws_lambda_function publishes a new version
  ⑥ (optional canary) alias "live" with routing_config weights 10% → 100% after N minutes with alarm checks;
     event source mapping targets the alias ARN when canary is enabled
  rollback: revert the tfvars artifact key (same content-hash artifact still in bucket) → apply
```

A bundle-size budget (default 5 MB zipped) and the "no `@memberjunction/*` except `work-queue-core` and
`work-queue-aws`" import check run in the consumer build.

### 12.3 Change classes

| Change | Terraform effect | Class | Procedure |
|---|---|---|---|
| Add topic / subscription | create | Safe | Standard flow |
| Change filter | in-place update of the subscription `filter_policy` | Safe* | *Messages already queued keep flowing; the filter only affects new publishes. SNS filter changes can take minutes to propagate *(verify)*. |
| Change `MaxAttempts` | queue `redrive_policy` in-place | Safe | Apply infra **before** metadata (otherwise the runtime threshold and the redrive margin drift) |
| Change `LeaseSeconds` / Lambda timeout | queue visibility in-place | Safe | Infra first |
| Change `PartitionMode` None ↔ Exclusive on a FIFO topic | none (metadata only) | Safe | Metadata only |
| Change `PartitionMode` to/from `Ordered` | none | **Guarded** | Only when the queue is empty and (from Ordered) no STATE items are non-Idle: `mj queue aws drain-check --subscription` |
| Flip topic `IsFifo` | **replace** SNS topic + all queues (names change `.fifo`) | **Destructive** | §12.4 migration |
| Rename subscription or topic | replace | **Destructive** | Treat as add-new + drain-old + remove-old |
| Remove subscription | destroy queue + DLQ | **Destructive** | §12.4 drain |
| Change `kms_key_arn` | in-place for SQS/SNS; DynamoDB SSE update in-place *(verify)* | Guarded | Grant the new key before switching; keep the old key enabled for 14 days |
| Change `name_prefix` / `environment` | replace everything | **Forbidden** in place | New deployment + migration |

### 12.4 Destructive procedures

**Drain & remove a subscription**
1. Set the subscription `Status = 'Disabled'` in MJ (its publishes still fan out on AWS until the SNS
   subscription is removed; the consumer keeps running).
2. Wait until `mj queue stats` shows `Pending = 0`, `InFlight = 0`, `ParkedItems = 0`.
3. Resolve dead letters (`replay`/`discard`) or export them: `mj queue dead-letters export --subscription … > dl.jsonl`.
4. Remove it from metadata → export the manifest → PR (plan shows the destroy, labeled destructive) → approve → apply.
5. `mj queue aws purge-state --subscription …` deletes STATE / DL / COUNTERS items (requires confirmation).

**Flip a topic to FIFO (standard → FIFO)**
1. Create a new topic in MJ, e.g. `email.events.v2` with `IsFifo = true`, and duplicate its subscriptions under
   new names. Deploy.
2. Switch producers to publish to the new topic (a metadata alias, or a config change on the producer side).
3. Drain the old subscriptions (above), then remove the old topic.

There is no in-place conversion: SNS and SQS do not support changing FIFO-ness.

### 12.5 Alarms & dashboard (module `alarms.tf`)

| Alarm | Metric | Threshold (default) | Severity |
|---|---|---|---|
| Backstop DLQ not empty | `AWS/SQS ApproximateNumberOfMessagesVisible` (backstop) | > 0 for 5 min | High: the runtime could not act |
| Dead letters created | `MJ/WorkQueue DeadLettered` (Sum, 5 min) | ≥ `dead_letter_rate_per_5m` | Medium (High for subscriptions tagged `mj:critical=true`, e.g. `email.unsubscribe`) |
| Oldest message age | `AWS/SQS ApproximateAgeOfOldestMessage` (source) | > `oldest_message_age_seconds` | High |
| Blocked keys | `MJ/WorkQueue BlockedKeys` (Maximum) | ≥ `blocked_keys_threshold` for 5 min | High (Ordered only) |
| Gap-stalled keys | `MJ/WorkQueue GapStalledKeys` | ≥ 1 | Medium |
| Lambda errors | `AWS/Lambda Errors / Invocations` | > `lambda_error_rate_threshold` | Medium |
| Lambda throttles | `AWS/Lambda Throttles` | > 0 for 10 min | Medium |
| Sweeper not running | `AWS/Lambda Invocations` (sweeper) | < 3 in 5 min | High |

All alarms notify `alarms.sns_alarm_topic_arn`. An optional `aws_cloudwatch_dashboard` shows per-subscription
depth, age, dead letters, blocked keys and handler duration p50/p95.

### 12.6 Environments & accounts

- **One AWS account per environment** (dev / staging / prod), or at least a separate prefix and state file
  per environment in a shared non-prod account. Prod is always its own account.
- **One MJ `WorkQueueTransport` row per environment** (`AWS-dev`, `AWS-prod`). MJ databases are per
  environment too, so bindings never cross environments.
- **Artifacts bucket:** in a tooling account, with cross-account read granted to each environment's Lambda
  service. Otherwise use a per-account copy step.
- **Promotion:** the same manifest and commit SHA through dev → staging → prod. A manifest may differ per
  environment only in `lambda_consumers` sizing and alarms, never in topology.

---

## 13. Throughput, limits & cost

### 13.1 Reference limits (conservative; verify before relying)

| Service | Limit | Value | Status |
|---|---|---|---|
| SNS | Message size (incl. attributes) | 256 KB | verify |
| SNS | `PublishBatch` entries / aggregate size | 10 / 256 KB | verify |
| SNS standard | Publish TPS | Regional soft quota (thousands to tens of thousands/s) | **verify against current AWS quotas** |
| SNS FIFO | Throughput per topic | Low hundreds of msg/s by default; much higher with high-throughput mode | **verify against current AWS quotas** |
| SNS FIFO | Dedup window | 5 minutes | verify |
| SNS FIFO | Subscriptions per topic | Lower than standard (historically 100) | **verify against current AWS quotas** |
| SQS | Message attributes | 10 | verify |
| SQS | Max visibility / receive long poll / receive batch | 12 h / 20 s / 10 | verify |
| SQS | Retention | 60 s – 14 days | verify |
| SQS FIFO | Throughput | 300 TPS per API action (3,000 with 10-message batching) without high throughput; substantially higher per region with high-throughput mode | **verify against current AWS quotas** |
| SQS FIFO | Messages in flight | 120,000 *(verify; relevant for many concurrent groups)* | verify |
| Lambda | Max timeout / env var size | 900 s / 4 KB | verify |
| Lambda + SQS FIFO | Concurrency | ≤ number of active message groups, capped by `MaximumConcurrency` | verify |
| DynamoDB | Item size / TransactWriteItems actions | 400 KB / 100 | verify |

### 13.2 Throughput posture by mode

| Mode | Topic type | Ceiling driven by | Scales with |
|---|---|---|---|
| `None` on a standard topic | SNS standard → SQS standard | Account SNS publish quota and Lambda account concurrency | Lambda concurrency |
| `None` / `Exclusive` on a FIFO topic | SNS FIFO → SQS FIFO | SNS FIFO topic throughput; SQS FIFO per-group throughput | **Number of distinct partition keys** (high-cardinality keys ≈ near-linear) |
| `Ordered` | FIFO + DynamoDB | As FIFO, plus DynamoDB per-message writes (on-demand scales, subject to per-partition hot-key limits of ~1,000 WCU/s per item collection *(verify)*) | Distinct keys |

### 13.3 Two-topic pattern for firehoses

When one high-volume stream needs both firehose handlers and a partitioned handler (use case 1):

```
email webhook ──publish──► email.events            (standard; None subscriptions: record, dashboards)
                                 │
                                 └── subscription email.fanout-subscriber (None, Lambda, filter eventType ∈ [click, open, bounce, unsubscribe])
                                        └── republishes (MJ publish API or in-process) ──► email.subscriber-events (FIFO; PartitionKey = subscriber)
                                                                                               └── email.subscriber-update (Exclusive)
                                                                                               └── email.unsubscribe      (Exclusive)
```

The FIFO topic only carries the filtered subset, keyed on a high-cardinality key. The republish Lambda must
reuse the original `MessageID` so FIFO deduplication absorbs its own retries.

### 13.4 Cost notes (relative; no prices)

| Per message, per subscription | SNS | SQS | DynamoDB | CloudWatch |
|---|---|---|---|---|
| `None` / `Exclusive`, success | 1 publish (shared across subscriptions) + delivery | receive + delete (+ 1 ChangeMessageVisibility per heartbeat) | **0** | EMF log bytes |
| `Ordered`, success, key idle | same | same | 1 consistent GetItem + 1 conditional Update (claim) + 1 Query (lowest parked) + 1 TransactWrite (complete, 2–4 actions) | same |
| `Ordered`, parked then released | same | + 1 SendMessage + receive/delete of the release | + TransactWrite (park, 4 actions) | same |
| Dead letter (any mode) | — | delete | 1 Put or TransactWrite | alarm eval |
| Stats call | — | 1–2 GetQueueAttributes | 1 GetItem | 1 GetMetricData (billed per metric) |

Conclusion: DynamoDB cost is proportional to **Ordered** traffic only. Firehose subscriptions (`None`) incur
none.

---

## 14. Testing

| Tier | Scope | Tooling | Runs in |
|---|---|---|---|
| Unit | `ChunkForPublishBatch`, `MeasureEntryBytes`, result mapping, `ToSnsFilterPolicy` (shared fixture), `ResourceNames`, `DecodeBody`, §6.4 decision function (pure: `(STATE, message) → Action`), §6.6 next-state function, Lambda group-failure reporting, timeout guard (fake timers) | Vitest + `aws-sdk-client-mock` | `pnpm test` (package) |
| Store logic | `OrderedPartitionStore` against DynamoDB Local: conditional failures, transaction cancellation reasons, counters | Vitest + `amazon/dynamodb-local` container | package test script `test:dynamo` (CI service container) |
| Conformance | The core transport conformance kit (02 §7): fan-out, filters, lease expiry, fence rejection, Exclusive, Ordered blocking, sequence gaps, replay, discard, skip, backstop ingest | LocalStack (SNS, SQS incl. FIFO, DynamoDB) via `docker compose -f packages/WorkQueue/aws/test/localstack.compose.yml`; `LeaseSeconds = 5`, `BackoffBaseSeconds = 1` | opt-in CI job `work-queue-aws-conformance` (not the deterministic tier) |
| Fidelity check | Behaviors LocalStack may not model faithfully (receipt-handle staleness, `ApproximateReceiveCount` after `ChangeMessageVisibility(0)`, FIFO high-throughput, SNS filter propagation delay) | Small smoke suite against a **real sandbox account** | manual / nightly with credentials |
| Terraform | `fmt`, `validate`, `tflint` (aws ruleset), `terraform test` with `mock_provider "aws"`: name truncation, FIFO violation errors, resource counts per fixture manifest, `binding_import` shape matches the `BindingImport` JSON schema | Terraform ≥ 1.7 | CI on `infrastructure/terraform/**` |
| Chaos | ① Lambda timeout mid-handler (handler sleeps past the deadline) → Retry, no double completion; ② `kill -9` MJ worker between the PARK transaction and delete (F1); ③ between COMPLETE and SEND_RELEASE (F4) → sweeper recovers; ④ duplicate SEND_RELEASE (F5); ⑤ DynamoDB throttling injected via client middleware → Retry, no state corruption; ⑥ forced redrive (runtime disabled for Ordered) → backstop ingest blocks key (F9) | Fault-injection hooks: `AwsTransportTestHooks` (compiled in only when `NODE_ENV=test`) + LocalStack | opt-in CI job + runbook |
| Soak | 1 M messages across 10k keys, mixed modes, with random worker kills; assert per-key order, no loss (every MessageID completed or dead-lettered exactly once) | sandbox account; checker queries completion records written by a test handler | manual before GA |

---

## 15. Work breakdown, risks & verification items

### 15.1 Tasks

Size: S ≤ 2 days, M ≤ 1 week, L ≤ 2 weeks. Dependencies refer to task IDs; `C*` = core package tasks from 04.

| ID | Task | Depends on | Size |
|---|---|---|---|
| AW1 | Package scaffold `packages/WorkQueue/aws` (three entry points, import-restriction lint, esbuild smoke bundle) | C-core contracts | S |
| AW2 | `ResourceNames`, `ToSnsFilterPolicy`, `DecodeBody` / `ControlWrapper`, shared fixtures | AW1 | S |
| AW3 | Publish path: `PublishBatcher`, `AwsTransportDriver.Publish`, result mapping | AW2 | M |
| AW4 | `SqsTransportConsumer` for `None` / `Exclusive` (receive, extend, complete, retry, release, dead-letter to DynamoDB, pre-handler attempt check) | AW2, AW7 (DL items only) | M |
| AW5 | Ordered decision and next-state pure functions + exhaustive unit tests (table-driven over §6.4 / §6.6) | AW2 | M |
| AW6 | `OrderedPartitionStore` (claim, park, complete, dead-letter, release, counters) + DynamoDB Local tests | AW5 | L |
| AW7 | State table item model + dead-letter item writes (shared by AW4/AW6) | AW1 | S |
| AW8 | `AwsTransportOperator` (stats, list/replay/discard, list partitions, skip, ingest backstop) | AW4, AW6 | M |
| AW9 | State sweeper (tasks §9.6) + `CreateStateSweeperHandler` | AW6, AW8 | M |
| AW10 | Lambda adapter (`CreateSqsLambdaHandler`, group-ordered failure reporting, timeout guard, EMF metrics, logger) | AW4, AW6 | M |
| AW11 | `ValidateBindings` | AW3, AW4 | M |
| AW12 | Engine-side `AWSTransportDriverFactory` shim (04 §9): credential resolution, worker-host integration hooks | AW3, AW4, 04 engine factory | S |
| AW13 | Terraform module: topics/queues/subscriptions/state/sweeper/IAM/outputs + `terraform test` | AW2 (names), AW9 artifact | L |
| AW14 | Terraform alarms + dashboard + consumer Lambda resources (event source mapping, alias/canary option) | AW13 | M |
| AW15 | `mj queue` CLI AWS extras: `import-bindings`, `validate-bindings`, `lint-manifest`, `aws drain-check`, `aws purge-state`, `aws recount`, `dead-letters export`; manifest `Aws` extension block | AW11, 04 CLI | M |
| AW16 | CI workflows: plan (PR comment, destructive label), apply (environment gates), consumer artifact build/publish | AW13 | M |
| AW17 | LocalStack conformance job + fidelity smoke suite | AW8, AW10, core conformance kit | M |
| AW18 | Examples (thin record consumer, MJ-calling consumer) + RUNBOOK.md + package README | AW10, AW16 | S |
| AW19 | Chaos + soak runs; fix findings | AW17 | M |

### 15.2 Milestones

| Milestone | Contents | Exit criteria |
|---|---|---|
| **M-A1: Publish + None** | AW1–AW4, AW7, AW10 (basic), AW13 (no alarms) | Email-record example in a sandbox: webhook → MJ publish API → SNS → SQS → Lambda → completion; forced failures reach DynamoDB dead letters |
| **M-A2: Exclusive + operator** | AW8 (non-Ordered), AW11, AW12, AW15 (bindings) | MJ worker consuming a FIFO subscription; `mj queue stats / dead-letters replay/discard` work against AWS |
| **M-A3: Ordered** | AW5, AW6, AW8 (Ordered), AW9 | Conformance kit Ordered suite passes on LocalStack; chaos ②–④ recover |
| **M-A4: Governed deployment** | AW14, AW16, AW18 | Full §12.1 lifecycle executed dev → staging with plan comments, gates, import/validate |
| **M-A5: Hardening** | AW17, AW19 | Fidelity suite green in sandbox; soak shows no loss and no order violation |

### 15.3 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Lambda FIFO partial-batch semantics differ from the per-group assumption (§7.2) | Order violation within a group | Verify early (M-A1 spike). Fallback: stop the whole batch at the first failure (AWS-documented behavior) |
| Weak receipt-handle fencing on `None` / `Exclusive` (§4.2) | Rare duplicates or a skipped retry | Handler idempotency (R1.6); documented |
| F9 window (redrive while runtime is down) on Ordered | Rare order violation for one key | Pre-handler check, alarms on backstop depth, sweeper cadence 1 min; document |
| Two filter translators (TS + HCL) drift | Wrong routing | Manifest `Aws.SnsFilterPolicy` precomputed by MJ (§11.4); shared fixture tests |
| `LeadingKeys` condition semantics for transactions and prefixes | Over-broad or broken Lambda permissions | Verify in the sandbox (M-A1); use exact `["SUB#{sub}", "SUB#{sub}#*"]` patterns |
| Hot partition keys (single key with a very high rate) on Ordered | DynamoDB throttling on one item collection; FIFO group throughput cap | Document: Ordered is for per-entity sequences, not firehoses; alarm on DynamoDB throttles |
| Lambda env 4 KB limit for large filters or policies | Deploy failure | Size check in `lint-manifest`; fall back to the SSM parameter / S3 object reference |
| LocalStack fidelity gaps | False confidence | Real-account fidelity suite (§14) |

### 15.4 Verification items (before implementation is considered correct)

1. SNS FIFO → SQS FIFO only, and standard → standard only; SNS FIFO high-throughput attributes and quotas.
2. SQS FIFO high-throughput quotas and in-flight limits in target regions.
3. The 10-message-attribute limit on SNS raw delivery to SQS, and the size accounting for attributes.
4. Whether `DeleteMessage` / `ChangeMessageVisibility` with a stale receipt handle succeed (fence strength).
5. `ApproximateReceiveCount` behavior after `ChangeMessageVisibility(0)`, and `ApproximateFirstReceiveTimestamp` availability.
6. Lambda SQS FIFO event source: partial batch response semantics per group; Lambda's delete behavior for items the function already deleted; no batching window on FIFO.
7. SNS delivery to SSE-SQS queues; KMS key policy requirements for SNS → SQS with a CMK.
8. DLQ retention-timestamp semantics for FIFO vs standard queues.
9. `dynamodb:LeadingKeys` enforcement for `TransactWriteItems` and prefix patterns.
10. Terraform AWS provider major version and argument names (`fifo_throughput_scope`, `filter_policy_scope`, `scaling_config`).
11. Supported Lambda Node.js runtimes at implementation time.
12. `CredentialEngine.getCredential` option names for resolving by credential ID.

---

## 16. Deviations & extensions to 03

| # | Item | Type | Detail |
|---|---|---|---|
| X1 | Dead-letter `DeliveryID` on AWS = `WorkMessage.MessageID` | Clarification | 03 leaves the AWS `DeliveryID` opaque. Operator endpoints take this value. `ReceivedDelivery.DeliveryID` in handler context = the SQS `MessageId`. |
| X2 | `Release` consumes a receive count on SQS | Deviation | 03 says Release does not consume an attempt. On SQS it does, absorbed by the `MaxAttempts + 2` redrive margin. |
| X3 | `PublishStatus 'Duplicate'` never returned by the AWS driver | Clarification | FIFO dedup is silent, so duplicates return `Accepted`. |
| X4 | `ListPartitions(condition = null)` returns non-Idle keys only; `InFlight` is not filterable | Deviation | No table scans |
| X5 | `SubscriptionStats.OldestPendingAgeSeconds` requires CloudWatch access (`null` otherwise) | Clarification | |
| X6 | AWS `PartitionCondition` has an internal `Draining` state, reported as `InFlight` | Extension (internal) | |
| X7 | New AWS state-sweeper Lambda (backstop ingest, stalled release/replay repair, gap stall, gauges) | Extension | Not in 02 §4.4. Optionally hosted by MJ via `workQueue.aws.runStateSweeper`. |
| X8 | `AwsSubscriptionConfig` shape (`Region`, `QueueUrl`, `QueueArn`, `BackstopDlqUrl`, `BackstopDlqArn`, `StateTableName`, `IsFifo`) | Extension | Refines the 03 §6.3 BindingConfig example (adds `Region`, `BackstopDlqArn`, `StateTableName`, `IsFifo`) |
| X9 | `TopologyManifest` optional `Aws` extension block per subscription: `{ SnsFilterPolicy: string }` | Extension | Avoids TS/HCL filter-translation drift |
| X10 | AWS topics warn when `MaxPayloadBytes > 261_000` | Extension | Headroom for the control wrapper |
| X11 | Control wrapper body format for replays and releases (`mjwq: 1`) | Extension | Keeps the user's 10 attribute slots free |
| X12 | Publish to an unbound AWS topic → `Rejected { Code: 'TopicUnbound', Retryable: true }` | Extension | New error code |
| X13 | New operator/CLI verbs: `import-bindings`, `validate-bindings`, `lint-manifest`, `aws drain-check`, `aws purge-state`, `aws recount`, `dead-letters export` | Extension | 04's CLI owns the command surface |
| X14 | `WorkProgress` is not persisted on AWS | Confirmation | As 02 §3.4 |
| X15 | Handler context `Attempt` resets to 1 for replays and for released parked items (new SQS messages) | Clarification | Matches the "AttemptCount reset" rule for replay |

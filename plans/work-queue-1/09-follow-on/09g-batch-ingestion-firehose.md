# 09g — High-Velocity Batch Ingestion (Firehose / Event Hubs Capture / DB micro-batching) — Phase 2

## Summary

This adds a **batched delivery path** for firehose-scale topics.
- **Cloud:** individual events are buffered into objects (AWS Firehose → S3; Azure Event Hubs Capture → Blob).
  Each finished object produces one claim-check `WorkMessage` ("batch ready") on a batch topic.
- **Effect:** use case 1's event stream becomes use case 2's batch notifications. Consumers process thousands
  of events per invocation, with checkpointing and per-record partial-failure handling.
- **DB transport:** gets an equivalent **micro-batching claim** (`BatchWorkHandler`), with no new storage.

## Motivation

- Per-message SNS→SQS→Lambda delivery at thousands of events/s means per-message invocation and request
  costs, plus DB write amplification in permanence handlers.
- Analytics and permanence handlers are naturally batch-oriented (bulk insert, Parquet/JSONL).
- Firehose/Capture give durable buffering and object storage for replay at low cost.

## Scope / Non-goals

**In scope:**
- Topic `DeliveryMode: 'Batched'` (contract proposal C7)
- Firehose and Event Hubs Capture bindings
- The object-created bridge
- The batch topic and message schema
- `BatchWorkHandler` + helpers (streaming readers, checkpoint, partial failure)
- DB micro-batching
- Terraform additions
- Ordering rules

**Non-goals:**
- Stream processing (windowed aggregation, Kinesis Data Analytics).
- Exactly-once.
- `Ordered` subscriptions on batched topics (rejected by validation; see Ordering).

## Design

### Model

```
Individual topic (today)            Batched topic (new)
────────────────────────            ────────────────────
Publish → fan-out → per-message     Publish → buffer stream → object (N records)
delivery per subscription                    │ object-created event
                                             ▼
                                    bridge → publish 1 WorkMessage to the linked BATCH topic
                                             (PayloadRef = object, Attributes = partition prefix)
                                             │
                                             ▼ normal Phase 1 fan-out/delivery
                                    batch subscriptions (BatchWorkHandler helpers)
```

A **batched topic** (`email.events.raw`, `DeliveryMode='Batched'`) accepts publishes through the same
`IWorkPublisher` (D9 preserved) but has **no subscriptions of its own**. Its `BatchTopicID` points at an
Individual topic (`email.events.batches`) that carries the batch-ready messages. Consumers subscribe to that
Individual topic with any Phase 1 policy.

### AWS binding

| Piece | Configuration |
|---|---|
| Firehose stream (Direct PUT) | destination S3; **dynamic partitioning** enabled at creation (it can't be enabled later), with inline JQ keys from attributes carried in the record: `topic`, `eventType` → prefix `wq/{topic}/eventType=!{partitionKeyFromQuery:eventType}/!{timestamp:yyyy/MM/dd/HH}/` |
| Buffering | size 1–128 MiB, interval up to 900 s (verify current limits). Defaults: 64 MiB / 60 s. **Latency ≈ interval.** |
| Record format | one `WorkMessage` JSON per line (JSONL), `AppendDelimiterToRecord=true`; optional GZIP |
| Error output | `wq/{topic}/errors/` prefix; alarm on objects |
| S3 → bridge | S3 EventBridge notifications (`Object Created`, prefix `wq/`) → `wq-batch-bridge` Lambda |
| Bridge publish | `IWorkPublisher.Publish(batchTopic, [{ MessageID: UUIDv5(bucket/key/etag), PayloadRef: { Uri: 's3://…', SizeBytes, Checksum: etag }, Attributes: { sourceTopic, eventType } }])`, via MJ API or 09d |

The engine's `Publish` on a Batched AWS topic → `firehose:PutRecordBatch` (≤ 500 records / 4 MiB per call).
Failed records (`FailedPutCount`) → `Rejected, Retryable=true` for those positions.

**Duplicates:** Firehose delivery is at-least-once, so a record may appear in two objects. Batch handlers rely
on per-record idempotency (`MessageID` of the inner record).

### Azure binding

| Piece | Configuration |
|---|---|
| Event Hub + **Capture** to Blob | time window 1–15 min, size window 10–500 MB (verify); **Avro** container format (Capture's native format; Parquet via the no-code editor is optional) |
| Blob created → bridge | Event Grid `BlobCreated` → Function bridge → batch topic publish (`PayloadRef: https://…blob…`) |
| Reader | `AvroBatchReader` helper (Capture body bytes contain the JSON envelope) |

### DB transport equivalent — micro-batching claim (recommended)

The DB transport has no object store in the path, and its volume is "slow" by definition (D1). It doesn't
emulate Firehose. Instead, a subscription may opt into **batch delivery**:
- `WorkQueueSubscription.MaxBatchSize int NULL`: null = individual handler.
- `BatchMaxWaitMs int NULL`: how long to wait to fill a batch.

The worker runs the normal `ExpireLeases` step, then claims up to `MaxBatchSize` deliveries with the **unchanged**
Phase 1 claim (03 §7) and hands them to a `BatchWorkHandler`. Each delivery keeps its own lease token and settles
individually through the fenced single-row writes. Claim rules per partition mode:

| Mode | Batch claim candidate set |
|---|---|
| `None` | any claimable `Pending` rows (`VisibleAt ≤ now`, not cancel-requested), `TOP (@MaxBatchSize)` ordered by `OrderKey`, in **one** skip-locked statement |
| `Exclusive` | at most **one row per `PartitionKey`** within the batch (`ROW_NUMBER() OVER (PARTITION BY PartitionKey ORDER BY OrderKey) = 1` among visible `Pending` rows, and no `InFlight` row for the key) |
| `Ordered` | the **head** per key only (03 §7 rule 4); a locked head means the key yields nothing this cycle — a later row of the key is never taken instead. `Ordered` is Database-only (11 §1, S2) |

For partitioned subscriptions 03 §7 is already batch-shaped: candidates are selected one per key, **each candidate
is claimed by its own guarded statement**, and a violation of the unique in-flight index
`UQ_WorkQueueDelivery_InFlightPartition` is handled **per candidate** as "not claimed" — it never aborts the rest of
the batch. Batching therefore adds no new claim statement and changes no `Exclusive`/`Ordered` rule; a batch for a
partitioned subscription simply spans up to `MaxBatchSize` **different keys**. There is no sequence gap rule to
honour (explicit sequences were cut, 11 §1, S1). The candidate query must stay bounded and index-backed (03 §6.5's
filtered claim index, F9) — `MaxBatchSize` is capped at 500.

A staging-table design (a buffer table sealed into batch objects) was considered and **rejected** for Phase 2.
It duplicates the delivery table with no benefit at DB volumes.

### Batch handler contract (contract proposal C7)

```ts
export interface BatchItemOutcome { DeliveryID: string; Outcome: WorkOutcome; }

/** DB micro-batching (and any transport that delivers N messages per invocation). */
export interface BatchWorkHandler<TPayload extends WorkJson = WorkJson> {
  HandleBatch(messages: WorkMessage<TPayload>[], context: BatchWorkContext): Promise<BatchItemOutcome[]>;
}
export interface BatchWorkContext extends Omit<WorkContext, 'DeliveryID' | 'Attempt'> {
  readonly Attempts: Record<string, number>;    // by DeliveryID
}

/** Helpers for claim-check batch objects (cloud batched topics). */
export interface BatchRecordReader<TRecord extends WorkJson> extends AsyncIterable<{ Index: number; Record: TRecord }> {}
export function OpenJsonlReader<TRecord extends WorkJson>(ref: WorkPayloadRef, source: ObjectSource, startIndex: number): BatchRecordReader<TRecord>;
export function OpenAvroCaptureReader<TRecord extends WorkJson>(ref: WorkPayloadRef, source: ObjectSource, startIndex: number): BatchRecordReader<TRecord>;

export interface BatchCheckpoint { ObjectUri: string; NextIndex: number; FailedIndexes: number[]; }
export async function ProcessBatchObject<TRecord extends WorkJson>(
  message: WorkMessage, context: WorkContext, reader: BatchRecordReader<TRecord>,
  processChunk: (records: { Index: number; Record: TRecord }[]) => Promise<{ FailedIndexes: number[] }>,
  options: { ChunkSize: number; MaxFailedRecords: number; FailureSink: FailureSink }
): Promise<WorkOutcome>;
```

`ProcessBatchObject` behavior:
1. Resume from `Checkpoint.NextIndex`. Database subscriptions persist `Progress.Checkpoint` already. SQS
   subscriptions don't (`PersistsProgress: false`, 03 §5); rather than adding a state store (the design has no
   DynamoDB, R8), `ProcessBatchObject` writes a small **checkpoint object next to the batch object**
   (`…/checkpoints/{subscription}/{messageId}.json` in the same bucket — S3 is already in this path; a blob on
   Azure) on each heartbeat and reads it on redelivery. Without it, a redelivered object is re-processed from
   index 0 and per-record idempotency absorbs the repeats (proposal **C6** generalizes this).
2. Per chunk: `processChunk` → heartbeat with the checkpoint.
3. Failed records accumulate until `MaxFailedRecords`.
4. At the end, if there were no failures → `Complete`.
5. With failures, the **split** strategy applies: write the failed records to `FailureSink`
   (`…/retries/{messageId}-{attempt}.jsonl`) and **publish a child batch-ready message** with the same
   attributes, `CorrelationID = parent MessageID`, and `mj.retryOf` noted in the payload. The parent returns
   `Complete`. The child flows through normal retry/backoff/dead-letter, so a poison record eventually
   dead-letters a tiny child batch rather than blocking or re-processing the large parent.
6. Infrastructure failure (object unreadable) → `Retry`. A missing object after N attempts → `DeadLetter('ObjectMissing')`.

### Ordering implications

| Situation | Rule |
|---|---|
| Records across objects | **no order**: Firehose and Capture don't preserve cross-object order, and objects complete out of order |
| `Ordered` subscription on a batch topic | **rejected** at validation (`OrderedNotSupportedForBatchedSource`) |
| `Exclusive` by a record-level key (e.g. RecipientKey) | not meaningful at batch level. The batch message may carry a coarse key (e.g. `eventType` partition) for `Exclusive`, but record-level exclusivity is the handler's concern (idempotent LWW by `OccurredAt`). |
| Consumers needing per-key order or exclusivity | keep an **Individual** topic for those events (09f's `email.subscriber-events`); batch only the commutative consumers (permanence, reporting) |

### Trade-offs

| Dimension | Individual (SNS/SQS) | Batched (Firehose/S3) |
|---|---|---|
| End-to-end latency | ~seconds | buffer interval (default 60 s) + bridge |
| Cost at 5k events/s | per-message SNS+SQS+Lambda requests | per-GB Firehose + S3 PUT per object + one Lambda per object |
| Replay | SQS dead-letter queue (`WorkQueue.ReplayDeadLetter`) | raw objects retained (S3 lifecycle), re-drive by re-publishing batch messages |
| Handler complexity | simple | chunking, checkpoint, split-retry (helpers provided) |
| Ordering/exclusivity | available | not available |

### 09f pairing (reference)

```
email ingress ──► email.events.raw (Batched) ──► Firehose ──► S3 ──► bridge ──► email.events.batches
                                                                                 ├ email.record.batch   (bulk insert / Athena)
                                                                                 └ email.reporting.batch
email ingress ──► email.subscriber-events (Individual FIFO) ──► email.subscriber, email.unsubscribe
```

## Interfaces / schema changes

- `WorkQueueTopic.DeliveryMode nvarchar(20) NOT NULL DEFAULT 'Individual'`, CHECK IN (`Individual`,`Batched`).
- `WorkQueueTopic.BatchTopicID uniqueidentifier NULL` FK → `WorkQueueTopic.ID`.
- `WorkQueueSubscription.MaxBatchSize int NULL`, `BatchMaxWaitMs int NULL`.
- `TopicBinding.DeliveryMode` added. Topic `BindingConfig` for Batched AWS topics: `{ "FirehoseStreamArn": "…", "BucketPrefix": "wq/email.events.raw/" }`.
- Manifest adds `DeliveryMode` and `BatchTopicName`.
- Core: `BatchWorkHandler`, readers, `ProcessBatchObject`. The AWS package gains `S3ObjectSource`; the Azure package gains `BlobObjectSource`.
- Contract proposals: **C6** (checkpoint persistence for SQS subscriptions — object-store checkpoint as above), **C7**.
- AWS IAM for batch consumers adds `s3:GetObject`/`s3:PutObject` on the checkpoint prefix only; no other new infrastructure.

## Dependencies on Phase 1

Publisher contract and conformance kit (plan 04, extended with batched-topic cases); Database claim SQL builders
and the unique in-flight index (plan 05, extended for batch claims); `WorkQueueHost` (plan 06, batch handler
support); `@memberjunction/work-queue-aws` publish path and Lambda adapter (plan 07, extended for Firehose); and
09a for the Azure half.

## Testing

| Tier | What |
|---|---|
| Unit | JSONL/Avro readers with resume index; split-retry bookkeeping; validation rules |
| DB integration | `MaxBatchSize=50` subscription with mixed outcomes → per-delivery settlement; partitioned subscription never gets two items for one key in a batch; two workers racing batch claims → index violation → single-row fallback, no double claim |
| LocalStack | Firehose isn't fully emulated. Test the bridge + batch topic with synthetic S3 objects; test Firehose in a sandbox account (opt-in). |
| Soak | 5k events/s for 1 h: count reconciliation (inner MessageIDs seen ≥ published, duplicates counted); kill batch Lambdas mid-object → resume from checkpoint |

## Work breakdown

| Item | Size |
|---|---|
| Schema + validation (DeliveryMode, BatchTopic, MaxBatchSize) | S |
| AWS Firehose publish + Terraform (stream, dynamic partitioning, bucket, EventBridge, bridge Lambda) | L |
| Batch helpers (readers, ProcessBatchObject, split-retry) + object-store checkpoint (C6) | L |
| DB micro-batch claim + BatchWorkHandler host support | M |
| Azure Event Hubs Capture + bridge + Avro reader | L |
| Tests + soak | M |

## Open questions

1. Should the bridge be owned by MJ (a generic `wq-batch-bridge` in the AWS package) or per topic? This spec assumes generic.
2. Is Parquet output (Firehose record format conversion via a Glue schema) needed for analytics consumers in this phase?
3. Default buffer interval: 60 s (latency) versus 300 s (fewer, larger objects)? Should it be per topic?
4. Should batch-ready messages include a record count and min/max `OccurredAt` (requires a Firehose Lambda transform) for smarter consumers?

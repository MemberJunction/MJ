# 03 — Interfaces & Tables

This document is the **contract**. Plans 04–08 implement it; names here are normative. Where a plan and this
document disagree, fix the plan.

Code style follows MJ rules: PascalCase public members, no `any`, `unknown` only at trust boundaries and narrowed
immediately, static imports only. Remote-operation I/O and REST JSON bodies follow their existing repo conventions
(see §8, §9).

---

## 0. Packages and dependency rules

| Package | Folder | MJ dependencies allowed | Owns |
|---|---|---|---|
| `@memberjunction/work-queue-core` | `packages/WorkQueue/core` | **none** (no `@memberjunction/*` at all) | Envelope, validation, filter grammar, backoff, outcomes, errors, transport/consumer/operator contracts, capabilities, `ConsumerRuntime`, `InMemoryTransport`, REST JSON mapping, `WorkQueueApiPublisher`; conformance kit: `./testing` (`CONFORMANCE_CASES`, `RunConformanceChecks`, fixtures — no vitest) and `./testing/vitest` (`RunTransportConformanceSuite`; vitest optional peer) |
| `@memberjunction/work-queue-aws` | `packages/WorkQueue/aws` | **none** except `work-queue-core` | SNS publish, SQS consumer, SQS dead-letter operator, binding validation, SNS filter-policy translation, shared resource naming (`AwsResourceName`), Lambda adapter (`./lambda`), SNS/SQS fakes (`./testing`) |
| `@memberjunction/work-queue-base` | `packages/WorkQueue/base` | core, global, core-entities (**browser-safe** — no server, no drivers, no SQL) | `WorkQueueEngineBase extends BaseEngine`: cached Transports/Topics/Subscriptions, lookups, policy/binding builders, filter parsing, `IsStagedToDatabase`, `ValidateTopologyRows`. Used by Explorer/dashboards and any client-tier code. |
| `@memberjunction/work-queue-engine` | `packages/WorkQueue/engine` | `work-queue-base`, core, global, core-entities, sql-dialect, credentials; + `work-queue-aws`, `@aws-sdk/credential-providers` (plan 07) | SQL executor seam, SQL Server/PostgreSQL SQL builders, Database transport driver + operator, deduplication ledger, `WorkQueueEngine`, `BaseWorkHandler`, handler resolution, `WorkQueueHost`, sweeper, staged consumption for cloud `Ordered`, remote-operation server classes, manifest export/import, transport driver factories |
| `@memberjunction/work-queue-server` | `packages/WorkQueue/server` | engine + server-extensions-core + api-keys | REST publish Server Extension |
| `@memberjunction/server` (existing) | `packages/MJServer` | — | `workQueue` config section, host start/stop |
| `@memberjunction/cli` (existing) | `packages/MJCLI` | — | `mj queue …` commands |
| `@memberjunction/queue` (existing) | `packages/MJQueue` | + engine | Legacy API, opt-in routing onto the work queue (plan 08) |

**Enforcement:** the repo has no ESLint configuration, so `core` and `aws` each carry a **dependency guard test**
that fails if `package.json` declares, or any source file imports, a `@memberjunction/*` module other than
`@memberjunction/work-queue-core`. The `./lambda` bundle of `aws` is size-checked in CI (plan 07).

**Layering:** `work-queue-engine` must never depend on `@memberjunction/queue` or on any data-provider package
(`GenericDatabaseProvider`, `SQLServerDataProvider`, `PostgreSQLDataProvider`); it reaches the database only through
`WorkQueueSqlExecutor`. `packages/WorkQueue/*` is added to `pnpm-workspace.yaml` and the root `package.json`
workspaces (plan 04).

---

## 1. Envelope

```ts
/** JSON-safe value used for inline payloads and progress checkpoints. */
export type WorkJson =
  | string | number | boolean | null
  | WorkJson[]
  | { [key: string]: WorkJson };

/** Reference to data held outside the queue (claim-check). The queue never dereferences it. */
export interface WorkPayloadRef {
  /** e.g. s3://bucket/key, https://…, mjstorage://{FileStorageAccountID}/{objectKey} */
  Uri: string;
  ContentType?: string;
  SizeBytes?: number;
  /** e.g. "sha256:…" */
  Checksum?: string;
}

/** The message as delivered to a handler. Identical on every transport. */
export interface WorkMessage<TPayload extends WorkJson = WorkJson> {
  /** UUID. Stable across redeliveries and replays. Producer-supplied or generated at publish. */
  MessageID: string;
  Topic: string;
  PartitionKey?: string;
  /** Present only on ExplicitSequence topics. Starts at 1 per PartitionKey. */
  Sequence?: number;
  /** ≤ 10 entries; keys 1–64 chars [A-Za-z0-9_-] (no dots — a dotted filter field means MJ's source.field form,
   *  which filters reject, §4), values ≤ 256 chars. The only fields filters see. */
  Attributes: Record<string, string>;
  Payload?: TPayload;
  PayloadRef?: WorkPayloadRef;
  CorrelationID?: string;
  /** ISO-8601 UTC, assigned by the publisher (MJ), not the producer. */
  PublishedAt: string;
}
```

### 1.1 Publish validation (identical on every publish path)

| Rule | Error code | Retryable |
|---|---|---|
| Serialized envelope ≤ topic `MaxPayloadBytes` (≤ 262,144) | `PayloadTooLarge` | no |
| ≤ 10 attributes; keys `[A-Za-z0-9_-]{1,64}` (no dots, §4); keys starting `mj` followed by `.`/`_` (case-insensitive) reserved | `InvalidAttributes` | no |
| Not both `Payload` and `PayloadRef` | `InvalidPayload` | no |
| `PartitionKey` ≤ 200 chars | `InvalidPartitionKey` | no |
| `ExplicitSequence` topic: `Sequence` required iff `PartitionKey` present; integer ≥ 1 | `SequenceRequired` / `InvalidSequence` | no |
| `PublishOrder` topic: `Sequence` absent | `SequenceNotAllowed` | no |
| `MessageID`, if supplied, is a UUID | `InvalidMessageID` | no |
| `DeduplicationKey` ≤ 200 chars; `DeduplicationTTLSeconds` 60–2,592,000 | `InvalidDeduplication` | no |
| Topic exists and is `Active` | `TopicNotFound` / `TopicDisabled` | no |
| External (REST) caller and topic `AllowExternalPublish = 0` | `TopicNotExternallyPublishable` | no |
| Caller lacks `workqueue:publish` for the topic | `Forbidden` | no |
| Cloud topic has no imported binding | `TopicUnbound` | yes |
| `MessageID` already used on this topic with a different envelope (Database) | `MessageIDConflict` | no |
| `(Topic, PartitionKey, Sequence)` already published with a different `MessageID` (Database) | `DuplicateSequence` | no |
| Transport unreachable / throttled | `TransportUnavailable` | yes |
| Transport rejected the message (e.g. SNS entry-level validation failure) | `TransportRejected` | no |
| `ExplicitSequence` topic: `Sequence` without `PartitionKey` | `InvalidSequence` | no |
| REST client only: request rejected (400) / unauthenticated (401) / unparseable success body | `BadRequest` / `Unauthorized` / `InvalidResponse` | no / no / yes |

Core exports the shared, MJ-free validation used by every path:

```ts
export function ValidatePublishRequest(topic: TopicBinding, request: PublishRequest): PublishError | null;
export function BuildWorkMessage(topicName: string, request: PublishRequest, publishedAt: Date, newId: () => string): WorkMessage;
export function SerializedEnvelopeBytes(message: WorkMessage): number;
```

---

## 2. Publisher contract

```ts
export interface PublishRequest<TPayload extends WorkJson = WorkJson> {
  MessageID?: string;
  PartitionKey?: string;
  Sequence?: number;
  Attributes?: Record<string, string>;
  Payload?: TPayload;
  PayloadRef?: WorkPayloadRef;
  CorrelationID?: string;
  /** Suppresses a second publish with the same key to the same topic inside the TTL window. */
  DeduplicationKey?: string;
  /** Default: topic DefaultDeduplicationTTLSeconds. */
  DeduplicationTTLSeconds?: number;
}

export type PublishStatus = 'Accepted' | 'Duplicate' | 'Rejected';

export interface PublishError { Code: string; Message: string; Retryable: boolean; }

export interface PublishResult {
  /** For Duplicate: the MessageID of the publish that owns the key (or the existing MessageID). */
  MessageID: string;
  Status: PublishStatus;
  Error?: PublishError;
}

export interface IWorkPublisher {
  /** Batch publish. Results are positionally aligned with requests. Partial success is possible. */
  Publish<TPayload extends WorkJson>(topic: string, requests: PublishRequest<TPayload>[]): Promise<PublishResult[]>;
}
```

### 2.1 Deduplication

Two independent mechanisms:

| Mechanism | Scope | Where | Transports |
|---|---|---|---|
| **DeduplicationKey + TTL** | `(Topic, DeduplicationKey)` within window | `WorkQueueDeduplication` table in the MJ database (§6.7) | **all** (every publish goes through MJ — D9) |
| **MessageID** | `(Topic, MessageID)` | Database: primary key within retention. AWS FIFO: silent 5-minute SNS window | Database reports `Duplicate`; AWS returns `Accepted` |

Ledger protocol (owned by `WorkQueueEngine.PublishAs`; drivers never see deduplication keys):
- **Database transport** — `Reserve` → `driver.Publish` → `Confirm` run inside **one database transaction** (the
  caller's, when a `Provider` in a transaction is passed), so the ledger row and the message commit together.
- **Cloud transport** — two-phase: `Reserve` (status `Reserved`, `ExpiresAt = now + 120 s`) → transport send →
  `Confirm` (`Confirmed`, `ExpiresAt = now + TTL`) on success, or `Release` (delete) on send failure. A crash
  between send and confirm lets the reservation lapse; a caller retry after that may publish again
  (at-least-once holds; handlers are idempotent).
- A `Reserved` or unexpired `Confirmed` row for the key → result `Duplicate` with the owning `MessageID`.
- Expired rows are deleted by the sweeper and replaced in place on publish.

### 2.2 Implementations

| Implementation | Package | Used by |
|---|---|---|
| `WorkQueueEngine.PublishAs(topic, requests, { ContextUser, Provider?, External? })` (`Publish` keeps the 2-arg interface shape and publishes as the engine's system user) | engine | Code running inside MJ; the REST extension (with `External: true`) |
| `WorkQueueApiPublisher` (HTTP client for §9; `fetch`, retries reuse MessageIDs, chunks to 100) | core | External producers (webhook Lambdas, other services) |
| `DirectManifestPublisher` | follow-on (09/09d) | High-volume external producers |

---

## 3. Handler & runtime contract

```ts
export interface WorkProgress {
  Percent?: number;          // 0..100
  Message?: string;          // ≤ 500 chars
  Checkpoint?: WorkJson;     // small; persisted by the Database transport only
}

export interface WorkLogger {
  Info(message: string, data?: Record<string, WorkJson>): void;
  Warn(message: string, data?: Record<string, WorkJson>): void;
  Error(message: string, error?: Error, data?: Record<string, WorkJson>): void;
}

export interface WorkContext {
  readonly SubscriptionName: string;
  readonly DeliveryID: string;         // Database/staged: WorkQueueDelivery.ID; SQS: SQS MessageId
  readonly Attempt: number;            // 1-based
  readonly MaxAttempts: number;
  readonly IsReplay: boolean;
  readonly Signal: AbortSignal;        // aborted on lease loss, MaxProcessingSeconds, or host shutdown
  /** Renews the lease and records progress. Resolves false once the lease is lost; the handler must stop. */
  Heartbeat(progress?: WorkProgress): Promise<boolean>;
  readonly Log: WorkLogger;
}

export type WorkOutcome =
  | { Kind: 'Complete' }
  | { Kind: 'Retry'; DelaySeconds?: number; Reason?: string }
  | { Kind: 'DeadLetter'; Reason: string };

export const Outcome: {
  Complete(): WorkOutcome;
  Retry(reason?: string, delaySeconds?: number): WorkOutcome;
  DeadLetter(reason: string): WorkOutcome;
};

/** Core handler interface — external (e.g. Lambda) handlers implement this directly. */
export interface WorkHandler<TPayload extends WorkJson = WorkJson> {
  Handle(message: WorkMessage<TPayload>, context: WorkContext): Promise<WorkOutcome>;
}

/** Thrown by a handler to dead-letter immediately (equivalent to returning Outcome.DeadLetter). */
export class FatalWorkError extends Error {}
/** Thrown by a handler to retry, optionally after a delay (equivalent to Outcome.Retry). */
export class TransientWorkError extends Error { constructor(message: string, public readonly RetryAfterSeconds?: number); }
/** Configuration problems (unknown topic, unsupported policy on a transport, invalid filter). */
export class WorkQueueConfigurationError extends Error {}
```

Any other thrown error = `Retry` with default backoff.

MJ-hosted handlers (engine):

```ts
/** Register with @RegisterClass(BaseWorkHandler, '<HandlerKey>'). Instantiated per delivery. */
export abstract class BaseWorkHandler<TPayload extends WorkJson = WorkJson> implements WorkHandler<TPayload> {
  protected ContextUser!: UserInfo;
  protected Provider!: IMetadataProvider;
  public BindExecutionContext(ctx: { ContextUser: UserInfo; Provider: IMetadataProvider }): void;
  abstract Handle(message: WorkMessage<TPayload>, context: WorkContext): Promise<WorkOutcome>;
}

/** Returns null when no registration exists for the key (never silently returns the base class). */
export function ResolveWorkHandler(handlerKey: string): BaseWorkHandler | null;
```

### 3.1 Subscription policy

```ts
export type PartitionMode = 'None' | 'Exclusive' | 'Ordered';
export type OrderingMode = 'PublishOrder' | 'ExplicitSequence';
export type HeartbeatMode = 'Auto' | 'Manual';
export type HostType = 'MJWorker' | 'External';
export type DeliveryStatus = 'Pending' | 'InFlight' | 'Completed' | 'DeadLettered' | 'Discarded';

export interface SubscriptionPolicy {
  SubscriptionName: string;
  TopicName: string;
  OrderingMode: OrderingMode;
  PartitionMode: PartitionMode;
  MaxAttempts: number;                 // default 5
  BackoffBaseSeconds: number;          // default 10
  BackoffMaxSeconds: number;           // default 900
  LeaseSeconds: number;                // default 60
  HeartbeatMode: HeartbeatMode;        // default 'Auto'
  MaxProcessingSeconds?: number;
  SequenceGapAlertSeconds?: number;
}

/** Full jitter: random(0, min(BackoffMax, BackoffBase × 2^(attempt−1))). Handler-supplied delay wins, clamped to BackoffMax. */
export function ComputeBackoffSeconds(policy: SubscriptionPolicy, attempt: number, handlerDelaySeconds?: number, random?: () => number): number;
```

### 3.2 Runtime

```ts
export interface ConsumerRuntimeOptions {
  Concurrency: number;
  ReceiveBatchSize: number;
  ReceiveWaitSeconds?: number;         // long-poll wait passed to Receive (SQS); default 0
  IdlePollMinMs: number;
  IdlePollMaxMs: number;
  ShutdownDrainMs: number;
}

/** Transport-agnostic loop: receive → run handler with lease management → settle. */
export class ConsumerRuntime<TPayload extends WorkJson = WorkJson> {
  constructor(consumer: ITransportConsumer<TPayload>, handlerFactory: () => WorkHandler<TPayload>,
              policy: SubscriptionPolicy, options: ConsumerRuntimeOptions, log: WorkLogger, now?: () => number);
  Start(): void;
  /** Stops receiving, waits up to ShutdownDrainMs, then aborts remaining handlers and releases their deliveries. */
  Stop(): Promise<void>;
  Kick(): void;
  get InFlightCount(): number;
  /** Process exactly the given deliveries (Lambda mode: no loop). */
  ProcessBatch(deliveries: ReceivedDelivery<TPayload>[]): Promise<SettleResult[]>;
}
```

Runtime rules: a failed `ExtendLease` caused by a transient transport error is **retried on the next heartbeat tick**;
only `Lost`, or the lease passing its expiry, aborts the handler. A cancel (§5.2) is delivered the same way: the lease
token is rotated, so the next heartbeat resolves `false` and the handler's later settle is rejected.
`DeadLetter` reasons are truncated to 100 characters (`DeadLetterReason`); the full handler/error text goes
to `LastError`. `FatalWorkError` → `DeadLetterReason` = its message (truncated), `LastError` = `"Name: message"` plus
stack frames. Heartbeats are coalesced (a call made while an extension is in flight shares its result); after
`MaxProcessingSeconds`, `Heartbeat` resolves `false`, but a later handler outcome is still settled — the lease token
fences it if the lease has expired. In `ProcessBatch`, once an item
of a partition key does not complete, the remaining items of that key in the batch are released unprocessed.
`Auto` heartbeat every `LeaseSeconds / 3` while the handler runs, stopping after
`MaxProcessingSeconds` (then abort); `Manual` renews only on `context.Heartbeat()`; a heartbeat reporting `Lost`
aborts the signal and the handler's outcome is discarded; `FatalWorkError` → `DeadLetter`; `TransientWorkError` →
`Retry(RetryAfterSeconds)`; other throws → `Retry`; `Retry` with `Attempt ≥ MaxAttempts` → `DeadLetter('MaxAttemptsExceeded')`.

---

## 4. Filters — MJ `CompositeFilterDescriptor`, restricted

A subscription's `Filter` column stores MJ's standard filter JSON: **`CompositeFilterDescriptor`**
(`@memberjunction/core`, `MJCore/src/generic/filters/filter.types.ts`) — the same shape user views persist and the
generic `mj-filter-builder` Angular component (`packages/Angular/Generic/filter-builder`) edits. `field` is an
**envelope attribute name** (bare names only; the dotted `source.field` multi-record form is rejected). Null or an
empty filter matches everything.

```jsonc
{ "logic": "and", "filters": [
  { "field": "eventType", "operator": "eq", "value": "click" },
  { "logic": "or", "filters": [
      { "field": "tenant", "operator": "eq", "value": "acme" },
      { "field": "tenant", "operator": "eq", "value": "globex" } ] },
  { "field": "campaign", "operator": "isnotnull", "value": null }
] }
```

### 4.1 Supported operators

| Operator | Meaning over attributes | SNS filter policy | Service Bus (09a) |
|---|---|---|---|
| `eq` | equals (case-sensitive) | `["value"]` | `attr = 'value'` |
| `neq` | present and not equal | `[{"anything-but":["value"]}]` | `attr <> 'value'` |
| `startswith` | prefix | `[{"prefix":"value"}]` | `startswith(attr,'value')` |
| `isnotnull` / `isnull` | attribute present / absent | `[{"exists":true|false}]` | `EXISTS(attr)` / `NOT EXISTS(attr)` |
| OR group of `eq` on one field | any-of | `["a","b"]` | `attr IN ('a','b')` |

**Structure limits (all transports):** top-level `logic` must be `and`; nested groups may only be a one-field OR of
`eq`; ≤ 5 distinct fields; ≤ 50 values total; depth ≤ 2. **Each field may be constrained only once** (one rule, or one
OR group): a broker reads a field's value array as OR, so two AND-ed rules on one field would silently widen the filter
rather than narrow it. A value is required for `eq`/`neq`/`startswith` and forbidden for `isnull`/`isnotnull`. Values are strings (numbers and booleans are compared as
their string form, because envelope attributes are strings).

Anything outside that set — `contains`, `endswith`, `gt`/`lt`, OR across different fields, deeper nesting — is
**rejected when the subscription is saved**, by `SubscriptionUnsupportedReason`, naming the operator and field. Each
driver publishes what it accepts:

```ts
export interface FilterSupport {
  Operators: FilterOperator[];      // e.g. ['eq','neq','startswith','isnull','isnotnull']
  SingleFieldOrGroups: boolean;
  MaxFields: number;
  MaxValues: number;
}
```

### 4.2 Core API (no MJ dependency)

```ts
export type FilterOperator = 'eq' | 'neq' | 'startswith' | 'isnull' | 'isnotnull';
export interface FilterRule { field: string; operator: FilterOperator; value?: string | number | boolean | null; }
export interface FilterGroup { logic: 'and' | 'or'; filters: (FilterRule | FilterGroup)[]; }
export type SubscriptionFilter = FilterGroup;

/** Throws WorkQueueConfigurationError naming the offending field/operator. */
/** What the Database transport accepts (every operator in §4.1, single-field OR groups, 5 fields, 50 values). */
export const WORK_QUEUE_FILTER_SUPPORT: FilterSupport;
export function ParseSubscriptionFilter(json: string | null, support: FilterSupport): SubscriptionFilter | null;
/** Case-sensitive, string-valued, missing attribute fails every operator except isnull. */
export function MatchesFilter(filter: SubscriptionFilter | null, attributes: Record<string, string>): boolean;
export function ToSnsFilterPolicy(filter: SubscriptionFilter): string;     // aws package
```

### 4.3 Why the subset, and why not `CompositeFilter` itself

We reuse MJ's **shape and its editor**, not its evaluator. Four reasons, each of which also explains a restriction
above:

1. **`work-queue-core` has zero `@memberjunction` dependencies** (03 §0) so Lambda bundles stay small, and
   `CompositeFilter` lives in `@memberjunction/core`. Core therefore ships a small evaluator for the subset above.
   **Drift guard:** a parity test in the engine package (which may import `@memberjunction/core`) asserts our evaluator
   agrees with `CompositeFilter.Evaluate({ '': attrs })` over a shared case table.
2. **Brokers cannot express the full grammar.** SNS filter policies are AND-across-attributes with OR only inside a
   value array, and offer `prefix`, `anything-but` and `exists` — no `contains`, no `endswith`, no comparisons, no
   cross-field OR. A filter MJ can evaluate but SNS cannot would silently mean "every message is delivered and the
   consumer sorts it out", which defeats fan-out and wakes Lambdas for nothing. Rejecting at save time is honest.
3. **Case sensitivity differs.** `CompositeFilter` lowercases both sides (`Str()`), so its matching is
   case-insensitive; SNS matches exactly. Work-queue filters are **case-sensitive** everywhere, so a filter behaves
   identically in MJ and in the broker. This is the one deliberate divergence from MJ's filter semantics, and the
   parity test only covers case-matched fixtures.
4. **Attributes are a flat string map.** The dotted `source.field` form (for multi-record view filters) has no meaning
   here, and MJ's SQL generator for this JSON (`MJUserViewEntityExtended.GenerateWhereClause`) is `protected`,
   entity-bound and unparameterised, so it is not a reuse candidate for the queue's own SQL.

**UI:** the operator dashboard (09b) uses `mj-filter-builder` with `FilterFieldInfo[]` built from the topic's known
attribute names, `allowGroups` limited to single-field OR, and the operator list above.

## 5. Transport contracts

```ts
export interface TopicBinding {
  TopicName: string;
  OrderingMode: OrderingMode;
  IsFifo: boolean;
  MaxPayloadBytes: number;
  Config: Record<string, WorkJson>;          // e.g. { SnsTopicArn }
}

export interface SubscriptionBinding {
  Policy: SubscriptionPolicy;
  Filter: SubscriptionFilter | null;
  HostType: HostType;
  Config: Record<string, WorkJson>;          // e.g. { Region, QueueUrl, QueueArn, DeadLetterQueueUrl, DeadLetterQueueArn, IsFifo }
}

export interface ReceivedDelivery<TPayload extends WorkJson = WorkJson> {
  Message: WorkMessage<TPayload>;
  DeliveryID: string;
  LeaseToken: string;                        // Database: per-claim UUID; SQS: receipt handle
  Attempt: number;
  IsReplay: boolean;
  LeaseExpiresAt: Date;
}

export type SettleResult =
  | { Kind: 'Settled'; DeliveryID: string; Status: DeliveryStatus }
  | { Kind: 'LeaseLost'; DeliveryID: string }
  | { Kind: 'Failed'; DeliveryID: string; Error: string };

export interface TransportCapabilities {
  Filters: FilterSupport;                  // operators/structure this transport accepts (§4.1)
  DetectsMessageIDDuplicates: boolean;     // Database true; AWS false
  PersistsProgress: boolean;               // Database true; AWS false
  SupportsOrdered: boolean;                // Database true; AWS false (engine stages Ordered — §5.1)
  SupportsExternalHosts: boolean;          // Database false; AWS true
  CancelPending: boolean;                  // Database true; AWS false
  CancelInFlight: boolean;                 // Database true (lease revoke); AWS false
  ListPartitions: boolean;                 // Database true; AWS false
  PeekDeadLetters: 'Full' | 'BestEffort';  // Database Full; AWS BestEffort (≤ 100 scanned)
  ReplaySingleDeadLetter: boolean;         // Database true; AWS true (scan-based)
  CompletedCounts: boolean;                // Database true; AWS false
  MaxRetryDelaySeconds: number;            // Database 2147483647; AWS 43200
}

export interface ITransportDriver {
  readonly Name: string;
  readonly Capabilities: TransportCapabilities;
  Publish(topic: TopicBinding, messages: WorkMessage[], subscriptions: SubscriptionBinding[],
          opts?: DatabasePublishOptions): Promise<PublishResult[]>;
  OpenConsumer<TPayload extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<TPayload>;
  Operator(): ITransportOperator;
  ValidateBindings(topic: TopicBinding, subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]>;
}

/** Opaque to core; the Database driver narrows it (transaction enlistment, PublishedByUserID). Cloud drivers ignore it. */
export interface DatabasePublishOptions { readonly Kind: 'Database'; }

export interface ITransportConsumer<TPayload extends WorkJson = WorkJson> {
  Receive(max: number, waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]>;
  ExtendLease(delivery: ReceivedDelivery<TPayload>, leaseSeconds: number, progress?: WorkProgress): Promise<'Held' | 'Lost'>;
  Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult>;
  Retry(delivery: ReceivedDelivery<TPayload>, delaySeconds: number, error: string): Promise<SettleResult>;
  DeadLetter(delivery: ReceivedDelivery<TPayload>, reason: string, error: string | null): Promise<SettleResult>;
  /** Database: no attempt consumed. SQS: receive already counted; absorbed by the MaxAttempts + 2 redrive margin. */
  Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult>;
  Close(): Promise<void>;
}

export interface BindingValidationIssue { Severity: 'Error' | 'Warning'; Subject: string; Message: string; }

/** Host/transport/policy compatibility; used by engine validation and host start (capability gating). */
export function SubscriptionUnsupportedReason(binding: SubscriptionBinding, capabilities: TransportCapabilities,
                                             stagedToDatabase: boolean): string | null;
```

`SubscriptionUnsupportedReason` rules (in order):
1. `HostType = 'External'` and `!SupportsExternalHosts` → unsupported.
2. `PartitionMode = 'Ordered'` and `!SupportsOrdered` and not `stagedToDatabase` → unsupported.
3. `PartitionMode = 'Ordered'` and `HostType = 'External'` and `!SupportsOrdered` → unsupported ("Ordered on a cloud transport requires HostType MJWorker").
4. `BackoffMaxSeconds > MaxRetryDelaySeconds` → unsupported.
5. otherwise `null`. (`MaxProcessingSeconds` above a known host ceiling is a **warning**, reported by validation, not here.)

### 5.1 Staged consumption (cloud `Ordered`)

A subscription with `PartitionMode = 'Ordered'` on a transport whose `SupportsOrdered = false` must be
`HostType = 'MJWorker'`. Its MJ worker runs a **stager**: receive from the cloud queue → in one database transaction
insert `WorkQueueMessage` (if absent) + `WorkQueueDelivery` for this subscription (+ sequence state) → delete from
the cloud queue. A redelivered message hits `UQ_WorkQueueDelivery_Subscription_Message` and is simply deleted. From
then on the delivery is processed by the Database consumer with full `Ordered` semantics (blocking, gaps, replay,
discard, progress). Staged queues use redrive `maxReceiveCount = 1000` (not `MaxAttempts + 2`): staging only fails when
the database is unavailable, and those messages must wait rather than dead-letter. A failed staging batch is retried
one message at a time, and the first failure holds back later messages of the batch so order is preserved. Receive order within a FIFO group is preserved because the next group message is not released
until the previous one is deleted and staging inserts in receive order.

### 5.2 Operator contract

```ts
export interface SubscriptionStats {
  SubscriptionName: string;
  Pending: number;
  InFlight: number;
  DeadLettered: number;
  BlockedKeys: number | null;              // null when not applicable/unsupported
  OldestPendingAgeSeconds: number | null;  // AWS: always null in Phase 1 (no CloudWatch client; use the CloudWatch alarm)
  CompletedLastHour: number | null;        // null unless CompletedCounts
  AsOf: string;
}

export interface DeadLetterRecord {
  DeliveryID: string;                      // Database/staged: Delivery.ID; AWS: envelope MessageID
  Message: WorkMessage;
  PartitionKey: string | null;
  Attempts: number;
  Reason: string;                          // handler reason, 'MaxAttemptsExceeded', 'LeaseExpired', 'HandlerNotRegistered', 'RedrivePolicy', …
  LastError: string | null;
  DeadLetteredAt: string | null;
  BlocksKey: boolean;
}

export type PartitionCondition = 'Idle' | 'InFlight' | 'Blocked' | 'AwaitingSequence' | 'GapStalled';

export interface PartitionStateRecord {
  PartitionKey: string;
  Condition: PartitionCondition;
  HeadDeliveryID: string | null;
  LastCompletedSequence: number | null;
  AwaitingSequenceSince: string | null;
  WaitingItems: number;
}

export interface Page<T> { Items: T[]; NextCursor: string | null; }

export type OperatorResult =
  | { Supported: false }
  | { Supported: true; Changed: boolean; CancelRequested?: boolean };   // CancelRequested: an InFlight delivery was revoked

export interface ITransportOperator {
  GetStats(subscription: SubscriptionBinding): Promise<SubscriptionStats>;
  ListDeadLetters(subscription: SubscriptionBinding, cursor: string | null, pageSize: number): Promise<Page<DeadLetterRecord> | null>;
  /** condition null = all non-Idle keys. Returns null when !ListPartitions. */
  ListPartitions(subscription: SubscriptionBinding, condition: PartitionCondition | null, cursor: string | null, pageSize: number): Promise<Page<PartitionStateRecord> | null>;
  Replay(subscription: SubscriptionBinding, deliveryID: string, actorUserID: string | null, note: string | null): Promise<OperatorResult>;
  /** Pending (requires CancelPending) or DeadLettered → Discarded immediately.
   *  InFlight (requires CancelInFlight) → lease revoked, `CancelRequested: true` (§7). */
  Discard(subscription: SubscriptionBinding, deliveryID: string, reason: string, actorUserID: string | null): Promise<OperatorResult>;
  SkipSequence(subscription: SubscriptionBinding, partitionKey: string, sequence: number, reason: string, actorUserID: string | null): Promise<OperatorResult>;
}
```

Staged subscriptions always use the **Database** operator.

Operator details per transport:
- **Database** — dead-letter cursor keyed on delivery ID, page size 1–500 (default 50); `CompletedLastHour` is always a
  number; `BlockedKeys` is `null` for non-`Ordered` subscriptions.
- **AWS (non-staged)** — `ListDeadLetters` scans ≤ 100 DLQ messages, `NextCursor` always `null`; `Discard` of a message not
  found among scanned dead letters (including any pending message) returns `{ Supported: false }`; `BlockedKeys` `null`;
  `Attempts` is `0` for redrive-policy moves; `ExtendLease` returns `Held` on a retryable SQS error and `Lost` when the
  12-hour visibility window is exhausted. Dead-letter attributes: `mj_dead_letter_reason`, `mj_last_error`, `mj_attempts`,
  `mj_dead_lettered_at`, `mj_source_queue`; replay markers `mj_replay`, `mj_replay_note`, `mj_replayed_by`. Unparseable
  bodies dead-letter with reason `InvalidEnvelope`.

---

## 6. Tables

Schema `${flyway:defaultSchema}`. Per MJ migration rules: no `__mj_CreatedAt/__mj_UpdatedAt`; no single-column FK
indexes (CodeGen owns them); simple CHECK constraints; T-SQL only. One migration creates all seven tables (plan 05).

### 6.1 `WorkQueueTransport` → `MJ: Work Queue Transports`

| Column | Type | Null | Default / Constraint | Notes |
|---|---|---|---|---|
| ID | uniqueidentifier | no | `NEWSEQUENTIALID()` PK | |
| Name | nvarchar(100) | no | UNIQUE | `Database`, `AWS-prod-us-east-1` |
| Description | nvarchar(max) | yes | | |
| DriverClass | nvarchar(100) | no | | ClassFactory key: `Database`, `AWS` |
| Configuration | nvarchar(max) | yes | | JSON; AWS: `{ "Region": "us-east-1", "Endpoint"?: "…" }` |
| CredentialID | uniqueidentifier | yes | FK → `Credential.ID` | null = ambient identity |
| Status | nvarchar(20) | no | `'Active'`; CHECK IN (`Active`,`Disabled`) | |

### 6.2 `WorkQueueTopic` → `MJ: Work Queue Topics`

| Column | Type | Null | Default / Constraint | Notes |
|---|---|---|---|---|
| ID | uniqueidentifier | no | PK | |
| Name | nvarchar(200) | no | UNIQUE | dotted lowercase |
| Description | nvarchar(max) | yes | | |
| TransportID | uniqueidentifier | no | FK | |
| OrderingMode | nvarchar(20) | no | `'PublishOrder'`; CHECK IN (`PublishOrder`,`ExplicitSequence`) | |
| IsFifo | bit | no | `0` | AWS: must be 1 if any subscription is `Exclusive`/`Ordered` or topic is `ExplicitSequence` |
| AllowExternalPublish | bit | no | `0` | REST publishing allowed only when 1 |
| MaxPayloadBytes | int | no | `262144`; CHECK `> 0 AND <= 262144` | |
| DefaultDeduplicationTTLSeconds | int | no | `86400`; CHECK `>= 60` | |
| RetentionDays | int | no | `7`; CHECK `>= 1` | Database/staged terminal-row purge age |
| BindingConfig | nvarchar(max) | yes | | JSON; AWS: `{ "SnsTopicArn": "…" }` |
| Status | nvarchar(20) | no | `'Active'`; CHECK IN (`Active`,`Disabled`) | |

### 6.3 `WorkQueueSubscription` → `MJ: Work Queue Subscriptions`

| Column | Type | Null | Default / Constraint | Notes |
|---|---|---|---|---|
| ID | uniqueidentifier | no | PK | |
| TopicID | uniqueidentifier | no | FK | |
| Name | nvarchar(200) | no | UNIQUE (global) | |
| Description | nvarchar(max) | yes | | |
| Filter | nvarchar(max) | yes | | JSON per §4 |
| PartitionMode | nvarchar(20) | no | `'None'`; CHECK IN (`None`,`Exclusive`,`Ordered`) | |
| MaxAttempts | int | no | `5`; CHECK `>= 1` | |
| BackoffBaseSeconds | int | no | `10`; CHECK `>= 0` | |
| BackoffMaxSeconds | int | no | `900`; CHECK `>= 0` | |
| LeaseSeconds | int | no | `60`; CHECK `>= 5` | |
| HeartbeatMode | nvarchar(20) | no | `'Auto'`; CHECK IN (`Auto`,`Manual`) | |
| MaxProcessingSeconds | int | yes | | |
| SequenceGapAlertSeconds | int | yes | | |
| HostType | nvarchar(20) | no | `'MJWorker'`; CHECK IN (`MJWorker`,`External`) | |
| HandlerKey | nvarchar(200) | yes | | required for `MJWorker` (entity subclass `Validate`) |
| ExternalRef | nvarchar(500) | yes | | informational |
| BindingConfig | nvarchar(max) | yes | | JSON; AWS: `{ "Region","QueueUrl","QueueArn","DeadLetterQueueUrl","DeadLetterQueueArn","SnsSubscriptionArn","IsFifo" }` |
| Status | nvarchar(20) | no | `'Active'`; CHECK IN (`Active`,`Paused`,`Disabled`) | `Paused`: fan-out continues, nothing claimed; `Disabled`: no new deliveries |

### 6.4 `WorkQueueMessage` → `MJ: Work Queue Messages` (Database transport + staged)

| Column | Type | Null | Default / Constraint | Notes |
|---|---|---|---|---|
| ID | uniqueidentifier | no | PK | = `MessageID` |
| PublishOrdinal | bigint | no | `IDENTITY(1,1)` | publish (or staging) order |
| TopicID | uniqueidentifier | no | FK | |
| PartitionKey | nvarchar(200) | yes | | |
| Sequence | bigint | yes | CHECK `Sequence IS NULL OR Sequence >= 1` | |
| Attributes | nvarchar(4000) | yes | | JSON |
| Payload | nvarchar(max) | yes | | JSON |
| PayloadRef | nvarchar(2000) | yes | | JSON |
| CorrelationID | nvarchar(200) | yes | | |
| PublishedAt | datetimeoffset(7) | no | `SYSDATETIMEOFFSET()` | |
| PublishedByUserID | uniqueidentifier | yes | FK → `User.ID` | |

Indexes: `UQ_WorkQueueMessage_PublishOrdinal` UNIQUE (`PublishOrdinal`); `UQ_WorkQueueMessage_Topic_Key_Sequence`
UNIQUE (`TopicID`,`PartitionKey`,`Sequence`) WHERE `Sequence IS NOT NULL`. (Clustering stays on the PK per MJ
convention; plan 05 records a verification item on insert performance.)

### 6.5 `WorkQueueDelivery` → `MJ: Work Queue Deliveries` (Database transport + staged)

| Column | Type | Null | Default / Constraint | Notes |
|---|---|---|---|---|
| ID | uniqueidentifier | no | `NEWSEQUENTIALID()` PK | |
| MessageID | uniqueidentifier | no | FK → `WorkQueueMessage.ID` | |
| SubscriptionID | uniqueidentifier | no | FK | |
| Status | nvarchar(20) | no | `'Pending'`; CHECK IN (`Pending`,`InFlight`,`Completed`,`DeadLettered`,`Discarded`) | |
| PartitionKey | nvarchar(200) | yes | | **populated only for `Exclusive`/`Ordered` subscriptions** (null for `None`) |
| OrderKey | bigint | no | | `Sequence` (ExplicitSequence) else `PublishOrdinal` |
| AttemptCount | int | no | `0` | incremented at claim |
| IsReplay | bit | no | `0` | |
| VisibleAt | datetimeoffset(7) | no | `SYSDATETIMEOFFSET()` | |
| LeaseOwner | nvarchar(200) | yes | | |
| LeaseToken | uniqueidentifier | yes | | new per claim (fence) |
| LeaseExpiresAt | datetimeoffset(7) | yes | | DB clock |
| LastHeartbeatAt | datetimeoffset(7) | yes | | |
| Progress | nvarchar(4000) | yes | | JSON `WorkProgress` |
| LastError | nvarchar(max) | yes | | |
| DeadLetterReason | nvarchar(100) | yes | | |
| DeadLetteredAt | datetimeoffset(7) | yes | | |
| CompletedAt | datetimeoffset(7) | yes | | terminal time for `Completed` **and** `Discarded` |
| CancelRequestedAt | datetimeoffset(7) | yes | | set when an `InFlight` delivery is cancelled; the lease token is rotated at the same time |
| ResolvedByUserID | uniqueidentifier | yes | FK → `User.ID` | |
| ResolutionNote | nvarchar(1000) | yes | | |

Indexes:
- `UQ_WorkQueueDelivery_Subscription_Message` UNIQUE (`SubscriptionID`,`MessageID`)
- **`UQ_WorkQueueDelivery_InFlightPartition` UNIQUE (`SubscriptionID`,`PartitionKey`) WHERE `Status = 'InFlight' AND PartitionKey IS NOT NULL`** — race-proof single flight per key; a claim that violates it is "nothing to claim"
- `IX_WorkQueueDelivery_Claim` (`SubscriptionID`,`Status`,`VisibleAt`) INCLUDE (`PartitionKey`,`OrderKey`,`AttemptCount`)
- `IX_WorkQueueDelivery_PartitionHead` (`SubscriptionID`,`PartitionKey`,`OrderKey`) INCLUDE (`Status`) WHERE `PartitionKey IS NOT NULL AND Status IN ('Pending','InFlight','DeadLettered')`
- `IX_WorkQueueDelivery_Lease` (`Status`,`LeaseExpiresAt`) WHERE `Status = 'InFlight'`

**The lease is never a system column.** `__mj_CreatedAt`/`__mj_UpdatedAt` are not liveness signals: liveness is
`LeaseExpiresAt`/`LastHeartbeatAt`, moved only by guarded single-statement SQL that touches lease columns alone. A
full-row write (`BaseEntity.Save()`) from a stale snapshot would restore an old `LeaseToken`, `AttemptCount` or
`CancelRequestedAt` and walk straight past the fence — see §6.8.

Filtered indexes contain no clock function (not allowed on either platform); lease expiry is handled by the
`ExpireLeases` step, which moves expired rows out of `InFlight` before the next claim.

### 6.6 `WorkQueuePartitionState` → `MJ: Work Queue Partition States` (ExplicitSequence + Ordered only)

| Column | Type | Null | Default / Constraint | Notes |
|---|---|---|---|---|
| ID | uniqueidentifier | no | PK | |
| SubscriptionID | uniqueidentifier | no | FK | |
| PartitionKey | nvarchar(200) | no | | |
| LastCompletedSequence | bigint | no | `0` | resolved high-water mark (Completed, Discarded or Skipped) |
| AwaitingSequenceSince | datetimeoffset(7) | yes | | set when head `OrderKey > LastCompletedSequence + 1` |
| GapStalled | bit | no | `0` | set by sweeper past `SequenceGapAlertSeconds` |

Index: `UQ_WorkQueuePartitionState_Subscription_Key` UNIQUE (`SubscriptionID`,`PartitionKey`). Never purged
automatically. **Blocking and single-flight are not stored here** — they are derived from deliveries (§7).

### 6.7 `WorkQueueDeduplication` → `MJ: Work Queue Deduplications` (all transports)

| Column | Type | Null | Default / Constraint | Notes |
|---|---|---|---|---|
| ID | uniqueidentifier | no | PK | |
| TopicID | uniqueidentifier | no | FK | |
| DeduplicationKey | nvarchar(200) | no | | |
| MessageID | uniqueidentifier | no | | owning publish (no FK: cloud messages have no row) |
| Status | nvarchar(20) | no | CHECK IN (`Reserved`,`Confirmed`) | |
| ExpiresAt | datetimeoffset(7) | no | | |

Indexes: `UQ_WorkQueueDeduplication_Topic_Key` UNIQUE (`TopicID`,`DeduplicationKey`); `IX_WorkQueueDeduplication_ExpiresAt` (`ExpiresAt`).

### 6.8 Entity metadata flags

| Entity | `TrackRecordChanges` | `AllowUserSearchAPI` | `AllowDirectSQLInsert/Update/Delete` |
|---|---|---|---|
| Transports, Topics, Subscriptions | 1 | 1 | 0 |
| Messages, Deliveries, Partition States, Deduplications | **0** | **0** | **1** |

**Delivery state is driver-owned.** For Messages, Deliveries, Partition States and Deduplications, `AllowCreateAPI`,
`AllowUpdateAPI` and `AllowDeleteAPI` are **0**, and the engine ships server entity subclasses whose `Save()`/`Delete()`
fail with: *"work-queue delivery state is managed by the transport driver; use the operator API (Replay / Discard /
SkipSequence)"*. Reads stay open for dashboards and operators. Rationale: MJ's generated update procedure writes every
column, so a `Save()` from a stale snapshot silently overwrites a newer claim's lease token, attempt count or cancel
request — the "load, check `Status`, `Save()`" pattern that looks like a compare-and-swap and is not one.

---

## 7. Database claim semantics (normative)

`ExpireLeases(now)` runs before each claim cycle and in the sweeper: `InFlight` rows with `LeaseExpiresAt < now` →
`Pending` (`LastError = 'LeaseExpired'`, lease columns cleared) when `AttemptCount < MaxAttempts`, else
`DeadLettered` (`DeadLetterReason = 'LeaseExpired'`). An expired row whose `CancelRequestedAt` is set becomes
`Discarded` instead (it is not retried).

**Cancelling in-flight work.** `Discard` on an `InFlight` delivery does not change `Status`: it sets
`CancelRequestedAt`, rotates `LeaseToken`, records the reason and actor, and returns `CancelRequested: true`. The
holder's next heartbeat resolves `false`, its `Signal` aborts and any later settle is rejected by the fence. The row
stays `InFlight` until its lease expires, so an `Exclusive`/`Ordered` key is not handed to the next item while the old
handler is still winding down; `ExpireLeases` then makes it `Discarded`. A cancelled delivery is never claimable.

A `Pending` delivery `d` of subscription `s` is **claimable** when all hold:

1. `s.Status = 'Active'`, `d.VisibleAt ≤ now`.
2. `s.PartitionMode = 'None'` → nothing else.
3. `s.PartitionMode = 'Exclusive'` → no `InFlight` delivery exists for `(s, d.PartitionKey)`.
4. `s.PartitionMode = 'Ordered'` → `d` is the **head**: no delivery for `(s, d.PartitionKey)` with a lower `OrderKey`
   in `Pending`, `InFlight` or `DeadLettered`; and no `InFlight` delivery for the key.
5. `Ordered` + `ExplicitSequence` → additionally `d.OrderKey = LastCompletedSequence + 1` (else the key is
   `AwaitingSequence`; the claim sets `AwaitingSequenceSince` if null).

Claim = one statement per candidate batch using skip-locked hints (`WITH (UPDLOCK, READPAST, ROWLOCK)` /
`FOR UPDATE SKIP LOCKED`) that sets `InFlight`, `LeaseToken = new UUID`, `LeaseOwner`, `LeaseExpiresAt = now +
LeaseSeconds`, `AttemptCount + 1`. For partitioned subscriptions a violation of `UQ_WorkQueueDelivery_InFlightPartition`
is mapped to "not claimed". Every holder write (heartbeat, complete, retry, dead-letter, release) is guarded on
`ID`, `Status = 'InFlight'` and `LeaseToken` and succeeds only when exactly one row changes.

Derived partition conditions: `InFlight` (an in-flight delivery exists), `Blocked` (head is `DeadLettered`),
`AwaitingSequence` / `GapStalled` (from `WorkQueuePartitionState`), else `Idle`.

Settle effects: `Complete` → `Completed`, `CompletedAt`; for ExplicitSequence advance `LastCompletedSequence` to
`OrderKey` and clear `AwaitingSequenceSince`/`GapStalled`.

Sequence-mark rules (ExplicitSequence + Ordered):
- **Advance past resolved successors.** Whenever the mark advances (Complete, Discard, SkipSequence), it continues
  through every immediately following sequence whose delivery is already `Discarded`.
- **Late publish of a resolved sequence.** A delivery inserted (publish or stage) with `OrderKey ≤ LastCompletedSequence`
  is inserted as `Discarded` with `ResolutionNote = 'SequenceAlreadyResolved'`, never `Pending`.
- **Gap closes on arrival.** Inserting the delivery for `LastCompletedSequence + 1` clears `AwaitingSequenceSince` and
  `GapStalled` immediately. `Retry` → `Pending`, `VisibleAt = now + delay`
(an `Ordered` head in backoff holds its key). `DeadLetter` → `DeadLettered` (an `Ordered` head blocks its key).
Operator `Replay` → `Pending`, `AttemptCount = 0`, `IsReplay = 1`, `VisibleAt = now` (the head keeps its position).
Operator `Discard` (`Pending` or `DeadLettered`) → `Discarded`, `CompletedAt`; for ExplicitSequence advance the mark
when it was the next sequence. `SkipSequence(k, n)` advances the mark from `n − 1` to `n` only when no non-discarded
delivery with that sequence exists.

---

## 8. Remote operations (operator surface)

CodeGen-emitted bases from `MJ: Remote Operations` rows (`GenerationType = 'Manual'`), server subclasses in the
engine. I/O field casing follows the existing remote-operation type files in `metadata/remote-operations/types/`.
Each returns `supported: false` without side effects when the transport lacks the capability.

| Key | RequiredScope | Input | Output |
|---|---|---|---|
| `WorkQueue.GetSubscriptionStats` | `workqueue:read` | `{ subscriptionName?: string }` | `{ subscriptions: SubscriptionStats[]; failures: { subscriptionName; error }[] }` |
| `WorkQueue.ListDeadLetters` | `workqueue:read` | `{ subscriptionName: string; cursor?: string; pageSize?: number }` | `{ supported: boolean; items: DeadLetterRecord[]; nextCursor: string \| null }` |
| `WorkQueue.ListPartitions` | `workqueue:read` | `{ subscriptionName: string; condition?: PartitionCondition; cursor?: string; pageSize?: number }` | `{ supported: boolean; items: PartitionStateRecord[]; nextCursor: string \| null }` |
| `WorkQueue.ReplayDeadLetter` | `workqueue:operate` | `{ subscriptionName: string; deliveryID: string; note?: string }` | `{ supported: boolean; replayed: boolean }` |
| `WorkQueue.DiscardDelivery` | `workqueue:operate` | `{ subscriptionName: string; deliveryID: string; reason: string }` | `{ supported: boolean; discarded: boolean; cancelRequested: boolean }` |
| `WorkQueue.SkipSequence` | `workqueue:operate` | `{ subscriptionName: string; partitionKey: string; sequence: number; reason: string }` | `{ supported: boolean; skipped: boolean }` |
| `WorkQueue.GetBacklog` | `workqueue:read` | `{ subscriptionName: string }` | `{ supported: boolean; claimable: number; inFlight: number; total: number }` — the autoscaler metric (§11) |
| `WorkQueue.ValidateBindings` | `workqueue:read` | `{ transportName?: string }` | `{ issues: BindingValidationIssue[] }` |

Dead-letter rows in operation output carry `PayloadJSON: string | null` instead of a recursive `Payload` (CodeGen
emits operation types from `.ts` definition files).

Scopes (`metadata/api-scopes`): parent `workqueue`; `workqueue:publish` (ResourceType Topic), `workqueue:read`,
`workqueue:operate` (ResourceType Subscription).

CLI (`mj queue …`, plan 06) invokes these operations in-process, plus `export-topology`, `import-bindings` and
`validate-bindings`.

---

## 9. REST API — publish only

Server Extension, root `/work-queue` (configurable). Auth: MJ unified auth (`X-API-Key` or bearer); scope
`workqueue:publish` with the topic name as resource.

| Method & path | Body | Response |
|---|---|---|
| `POST /work-queue/topics/{topic}/messages` | `{ "messages": PublishRequestJson[] }` (1–100; fields camelCase: `messageId`, `partitionKey`, `sequence`, `attributes`, `payload`, `payloadRef`, `correlationId`, `deduplicationKey`, `deduplicationTtlSeconds`) | `202 { "results": [{ "messageId", "status", "error"?: { "code", "message", "retryable" } }] }` · `400` malformed body · `403` missing scope or `TopicNotExternallyPublishable` · `404` unknown topic · `413` body over 30 MB |

`202` is returned even with per-item rejections; callers inspect `results`. `status` values are `Accepted` / `Duplicate` /
`Rejected` (parsed case-insensitively); `payloadRef` fields are camelCase (`uri`, `contentType`, `sizeBytes`, `checksum`).
Core exports the single JSON mapping used by both client and server (`ParseRestPublishBody`, `ToRestPublishResult`, …).
`401` is returned for unauthenticated calls; `MaxBatch` (≤ 100) and `BodyLimit` (default `30mb`) are extension settings.

---

## 10. Topology manifest

```ts
export interface TopologyManifest {
  ManifestVersion: 1;
  GeneratedAt: string;
  Transport: { Name: string; DriverClass: string; Configuration: Record<string, WorkJson> };
  Topics: ManifestTopic[];
}
export interface ManifestTopic { Name: string; OrderingMode: OrderingMode; IsFifo: boolean; MaxPayloadBytes: number; Subscriptions: ManifestSubscription[]; }
export interface ManifestSubscription {
  Name: string;
  Filter: SubscriptionFilter | null;
  Policy: SubscriptionPolicy;
  HostType: HostType;
  StagedToDatabase: boolean;
  ExternalRef: string | null;
  Aws?: { SnsFilterPolicy: string | null };
}
export interface BindingImport {
  ManifestVersion: 1;
  Topics: { Name: string; BindingConfig: Record<string, WorkJson> }[];
  Subscriptions: { Name: string; BindingConfig: Record<string, WorkJson> }[];
}
```

External consumer configuration (Lambda env `MJ_WQ_SUBSCRIPTION`) is a `SubscriptionBinding` JSON produced by
Terraform from the manifest and the created resources.

---

## 11. Engine surface used across plans (normative names)

Plans 05 and 06 carry the complete member lists and helper types (`HostRuntime`, `HostRuntimeArgs`, `HostSweeper`,
`WorkQueueHostEngine`, `WorkHandlerResolver`); the signatures below are the cross-plan seams and must not drift.

```ts
// engine/src/sql/WorkQueueSqlExecutor.ts — DatabaseProviderBase satisfies these structurally
export type SqlParam = string | number | boolean | Date | null;
export interface SqlStatement { SQL: string; Params: SqlParam[]; }
export interface WorkQueueSqlExecutor {
  readonly PlatformKey: DatabasePlatform;
  readonly MJCoreSchemaName: string;
  readonly Dialect: SQLDialect;
  QuoteIdentifier(name: string): string;
  BuildParameterPlaceholder(index: number): string;
  ExecuteSQL<T>(sql: string, parameters?: SqlParam[], options?: ExecuteSQLOptions, contextUser?: UserInfo): Promise<T[]>;
}
export interface WorkQueueTransactionalExecutor extends WorkQueueSqlExecutor { BeginEntityTransaction(): Promise<EntityTransactionScope>; }
export interface WorkQueueIndependentExecutor extends WorkQueueTransactionalExecutor { ReleaseIndependentInstance(): Promise<void>; }
export interface WorkQueueExecutorSource extends WorkQueueTransactionalExecutor { CreateIndependentInstance(): Promise<WorkQueueIndependentExecutor>; }

// engine/src/transports/database/DatabaseTransportDriver.ts
export interface StageDeliveriesRequest { TopicID: string; SubscriptionID: string; PartitionMode: PartitionMode; OrderingMode: OrderingMode; Messages: WorkMessage[]; }
export type StageResult =
  | { MessageID: string; Kind: 'Staged' }
  | { MessageID: string; Kind: 'AlreadyStaged' }
  | { MessageID: string; Kind: 'Rejected'; Code: string; Message: string };   // MessageIDConflict | DuplicateSequence
export class DatabaseTransportDriver implements ITransportDriver {
  /** Staged consumption (§5.1): whole batch one transaction in array order; thrown error = rollback; §7 sequence rules apply. */
  StageDeliveries(request: StageDeliveriesRequest): Promise<StageResult[]>;
}
export class DatabaseTransportOperator implements ITransportOperator { }

// engine/src/dedup/DeduplicationLedger.ts
export type LedgerReservation = { Kind: 'Reserved' } | { Kind: 'Duplicate'; OwnerMessageID: string };
export class DeduplicationLedger {
  constructor(executor: WorkQueueSqlExecutor, contextUser: UserInfo);
  Reserve(topicID: string, key: string, messageID: string): Promise<LedgerReservation>;
  Confirm(topicID: string, key: string, messageID: string, ttlSeconds: number): Promise<boolean>;
  Release(topicID: string, key: string, messageID: string): Promise<boolean>;
  PurgeExpired(): Promise<number>;
}

// engine/src/transports/BaseTransportDriverFactory.ts
export interface TransportDriverDeps { ContextUser: UserInfo; Executor: WorkQueueExecutorSource; Log: WorkLogger; InstanceID?: string; }
/** The Database driver narrows 03 §5's opaque options; the engine's WorkQueuePublishCoordinator owns deduplication. */
export interface DatabaseTransportPublishOptions extends DatabasePublishOptions { Kind: 'Database'; Executor?: WorkQueueTransactionalExecutor; UserID?: string; }
export abstract class BaseTransportDriverFactory {
  abstract Create(transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver>;   // TransportRow: structural view the generated entity satisfies (plan 05)
}   // @RegisterClass(BaseTransportDriverFactory, 'Database' | 'AWS')

// base/src/WorkQueueEngineBase.ts — browser-safe metadata tier (mirrors AIEngineBase/AIEngine, packages/AI/BaseAIEngine)
export class WorkQueueEngineBase extends BaseEngine<WorkQueueEngineBase> {
  static get Instance(): WorkQueueEngineBase;
  get Transports(): MJWorkQueueTransportEntity[];
  get Topics(): MJWorkQueueTopicEntity[];
  get Subscriptions(): MJWorkQueueSubscriptionEntity[];
  GetTopicByName(name: string): MJWorkQueueTopicEntity | undefined;              // trimmed, case-insensitive
  GetSubscriptionByName(name: string): MJWorkQueueSubscriptionEntity | undefined;
  SubscriptionsForTopic(topicID: string): MJWorkQueueSubscriptionEntity[];
  BuildTopicBinding(topic: MJWorkQueueTopicEntity): TopicBinding;
  BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity): SubscriptionBinding;
  BuildSubscriptionPolicy(subscription: MJWorkQueueSubscriptionEntity): SubscriptionPolicy;
  ParseFilter(subscription: MJWorkQueueSubscriptionEntity, support: FilterSupport): SubscriptionFilter | null;
  IsStagedToDatabase(subscription: MJWorkQueueSubscriptionEntity): boolean;
  ValidateTopologyRows(capabilitiesByDriverClass: Record<string, TransportCapabilities>): BindingValidationIssue[];
}

// engine/src/WorkQueueEngine.ts — server tier. Mirrors AIEngine/AIEngineBase: a separate singleton that DELEGATES
// metadata to WorkQueueEngineBase.Instance (composition, not inheritance — see packages/AI/Engine/src/AIEngine.ts:240)
// and adds drivers, publishing, operator, staging and the manifest.
export interface WorkQueuePublishOptions { ContextUser: UserInfo; Provider?: IMetadataProvider; External?: boolean; }
export class WorkQueueEngine extends BaseSingleton<WorkQueueEngine> implements IWorkPublisher, IStartupSink {
  static get Instance(): WorkQueueEngine;
  /** The metadata tier; Config() delegates to it. Convenience proxies (Topics, Subscriptions, Transports,
   *  GetTopicByName, GetSubscriptionByName, BuildTopicBinding, BuildSubscriptionBinding, IsStagedToDatabase, …)
   *  forward to this instance, exactly as AIEngine proxies AIEngineBase. */
  get Metadata(): WorkQueueEngineBase;
  Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void>;
  GetDriver(transportID: string): Promise<ITransportDriver>;                     // cached per transport
  GetDatabaseDriver(): Promise<DatabaseTransportDriver>;                          // the Active 'Database' transport's driver
  OnPublished(listener: (topicName: string) => void): () => void;                // host Kick hook; returns unsubscribe
  BuildTopicBinding(topic: MJWorkQueueTopicEntity): TopicBinding;
  BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity): SubscriptionBinding;
  IsStagedToDatabase(subscription: MJWorkQueueSubscriptionEntity): boolean;
  GetOperator(subscription: MJWorkQueueSubscriptionEntity): Promise<ITransportOperator>;   // Database operator when staged
  ValidateTopology(): Promise<BindingValidationIssue[]>;
  PublishAs<T extends WorkJson>(topic: string, requests: PublishRequest<T>[], options: WorkQueuePublishOptions): Promise<PublishResult[]>;
  Publish<T extends WorkJson>(topic: string, requests: PublishRequest<T>[]): Promise<PublishResult[]>;
  /** Autoscaler metric: claimable Pending (partition rules applied) + InFlight. Both counts matter — a scaler that
   *  ignores InFlight starves the queue, because KEDA subtracts running executions from the metric. */
  GetBacklog(subscriptionName: string): Promise<{ Supported: boolean; Claimable: number; InFlight: number; Total: number }>;
  /** Fires for Database and staged subscriptions when a delivery is dead-lettered (alerting seam). Returns unsubscribe. */
  OnDeadLettered(listener: (event: { SubscriptionName: string; DeliveryID: string; Reason: string; PartitionKey: string | null }) => void): () => void;
  ExportManifest(transportName: string): TopologyManifest;
  ImportBindings(bindings: BindingImport, contextUser: UserInfo): Promise<BindingValidationIssue[]>;
}

// engine/src/host/WorkQueueHost.ts
export interface WorkQueueHostConfig {
  InstanceID: string;
  Subscriptions: { Name: string; Concurrency: number }[];        // Name '*' = every MJWorker subscription
  IdlePollMinMs: number; IdlePollMaxMs: number; ShutdownDrainMs: number;
  SweeperIntervalMs: number;                                     // 0 disables the sweeper on this instance
  ReconcileIntervalMs: number;                                   // 0 disables periodic re-planning after metadata changes
}
export interface WorkQueueProviderSource { CreateProvider(): Promise<IMetadataProvider>; }
export interface WorkQueueHostDependencies {
  ProviderSource: WorkQueueProviderSource;                       // per-delivery provider for BaseWorkHandler
  CreateRuntime?: (args: HostRuntimeArgs) => HostRuntime;        // test seams (defaults: ConsumerRuntime, WorkQueueSweeper, ResolveWorkHandler, registry)
  CreateSweeper?: () => HostSweeper;
  ResolveHandler?: WorkHandlerResolver;
  LoopRegistry?: Pick<WorkQueueHostLoopRegistry, 'Get'>;
}
export type HostedSubscriptionState = 'Running' | 'Paused' | 'Unsupported' | 'HandlerNotRegistered' | 'Error';
export class WorkQueueHost implements IShutdownable {
  constructor(config: WorkQueueHostConfig, engine: WorkQueueHostEngine, contextUser: UserInfo, executor: WorkQueueExecutorSource,
              log: WorkLogger, dependencies: WorkQueueHostDependencies);
  Start(): Promise<void>;
  /** One-shot container-job mode: start, claim/run/drain, then resolve. Never returns before in-flight work settles. */
  RunOnce(options: { MaxDeliveries?: number; IdleExitMs?: number; MaxDurationMs?: number }): Promise<{ Processed: number; Reason: 'MaxDeliveries' | 'Idle' | 'MaxDuration' | 'Shutdown' }>;
  Reconcile(): Promise<void>;
  Shutdown(): Promise<void>;
  Kick(subscriptionName: string): void;
  GetHealth(): { InstanceID: string; Subscriptions: { Name: string; State: HostedSubscriptionState; Reason: string | null; InFlight: number }[] };
}

// engine/src/host/WorkQueueHostLoopRegistry.ts — transport packages add auxiliary loops (plan 07: SqsStager)
export interface IHostLoop { readonly Name: string; Start(): void; Stop(): Promise<void>; }
export interface HostLoopContext {
  InstanceID: string;
  Subscription: MJWorkQueueSubscriptionEntity; Topic: MJWorkQueueTopicEntity; Transport: MJWorkQueueTransportEntity;
  Binding: SubscriptionBinding; StagedToDatabase: boolean; ContextUser: UserInfo;
  Executor: WorkQueueExecutorSource; Log: WorkLogger;
  KickConsumer(): void;
}
export type HostLoopFactory = (context: HostLoopContext) => Promise<IHostLoop[]>;
export class WorkQueueHostLoopRegistry extends BaseSingleton<WorkQueueHostLoopRegistry> {
  static get Instance(): WorkQueueHostLoopRegistry;
  Register(driverClass: string, factory: HostLoopFactory): void;
  Get(driverClass: string): HostLoopFactory | undefined;
  Unregister(driverClass: string): boolean;
}

// engine/src/host/WorkQueueSweeper.ts
export class WorkQueueSweeper {
  constructor(executor: WorkQueueSqlExecutor, ledger: DeduplicationLedger, engine: WorkQueueEngine, contextUser: UserInfo, log: WorkLogger);
  RunOnce(): Promise<Record<string, number>>;   // ExpireLeases, GapStalls, SkippedSequences, PurgeRetention, PurgeDeduplications
}
```

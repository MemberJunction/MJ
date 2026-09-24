# 03 — Interfaces & Tables

This document is the **contract**. Plans 04–08 implement it; names here are normative. Where a plan and this
document disagree, fix the plan.

> **Revision history.** This is the **Revision 4** contract. It applies the scope cuts and fixes recorded in
> [11 — Revision 4 review](11-revision-4-review.md): explicit ordering numbers and cloud-side `Ordered` consumption are
> gone (S1, S2), and changes F1–F13 are folded in below. Earlier revisions are summarised in the [README](README.md).

Code style follows MJ rules: PascalCase public members, no `any`, `unknown` only at trust boundaries and narrowed
immediately, static imports only, **no cross-package re-exports**. Remote-operation I/O and REST JSON bodies follow
their existing repo conventions (see §8, §9).

---

## 0. Packages and dependency rules

| Package | Folder | MJ dependencies allowed | Owns |
|---|---|---|---|
| `@memberjunction/work-queue-core` | `packages/WorkQueue/core` | **none** (no `@memberjunction/*` at all) | Envelope, validation, filter grammar, backoff, outcomes, errors, transport/consumer/operator contracts, capabilities, `ConsumerRuntime`, `InMemoryTransport`, REST JSON mapping, `WorkQueueApiPublisher`; conformance kit: `./testing` (`CONFORMANCE_CASES`, `RunConformanceChecks`, fixtures — no vitest) and `./testing/vitest` (`RunTransportConformanceSuite`; vitest optional peer) |
| `@memberjunction/work-queue-aws` | `packages/WorkQueue/aws` | **none** except `work-queue-core` | SNS publish, SQS consumer, SQS dead-letter operator, binding validation, SNS filter-policy translation, shared resource naming (`AwsResourceName`), Lambda adapter (`./lambda`, built on an SQS-only client factory so it never pulls the SNS client), SNS/SQS fakes (`./testing`) |
| `@memberjunction/work-queue-base` | `packages/WorkQueue/base` | `work-queue-core`, core, global, core-entities (**browser-safe** — no server, no drivers, no SQL, no Node APIs) | `WorkQueueEngineBase extends BaseEngine`: cached Transports/Topics/Subscriptions, lookups, policy/binding builders, filter parsing, `ValidateTopologyRows`. Used by Explorer/dashboards and any client-tier code. |
| `@memberjunction/work-queue-engine` | `packages/WorkQueue/engine` | `work-queue-base`, `work-queue-core`, core, global, core-entities, sql-dialect, credentials. The **`./aws` subpath only** adds `work-queue-aws` and `@aws-sdk/credential-providers` | SQL executor seam, SQL Server/PostgreSQL SQL builders, Database transport driver + operator, deduplication ledger, `WorkQueueEngine`, `BaseWorkHandler`, handler resolution, `WorkQueueHost`, sweeper, driver-owned entity save guards, remote-operation server classes, manifest export/import, `BaseTransportDriverFactory` + the `Database` factory. `./aws`: the `AWS` driver factory and credential resolution |
| `@memberjunction/work-queue-server` | `packages/WorkQueue/server` | engine + server-extensions-core + api-keys | REST publish Server Extension |
| `@memberjunction/work-queue-legacy-bridge` | `packages/WorkQueue/legacy-bridge` | `@memberjunction/queue` + engine + the package that owns `UserCache` (to resolve the enqueuing user) | Routing of legacy `@memberjunction/queue` task types onto work-queue topics, and the `MJQueue.LegacyQueueDriver` handler (plan 08). Imported only by `ServerBootstrap` |
| `@memberjunction/server` (existing) | `packages/MJServer` | — | `workQueue` config section, host start/stop |
| `@memberjunction/cli` (existing) | `packages/MJCLI` | — | `mj queue …` commands |
| `@memberjunction/queue` (existing) | `packages/MJQueue` | **no work-queue dependency** | Legacy API, plus a tiny routing seam: `LegacyQueueRouterRegistry` (a `BaseSingleton`) holding at most one `ILegacyQueueRouter { TryRoute(queueTypeName, data, options, contextUser): Promise<boolean> }`, consulted by `QueueManager.AddTask` before the in-process path |

**Enforcement.** The repo has no ESLint configuration, so `core` and `aws` each carry a **dependency guard test**
that fails if `package.json` declares, or any source file imports (including side-effect imports, double-quoted
specifiers and `require`), a `@memberjunction/*` module other than `@memberjunction/work-queue-core`. `base` carries
the same style of guard against `node:` and bare Node built-ins, `sql-dialect`, `work-queue-engine` and
`work-queue-aws`, and compiles with **its own tsconfig** (`"types": []`, no DOM lib) so Node and DOM globals fail to
type-check. The `./lambda` bundle of `aws` is size-checked in CI (plan 07).

**Engine loading (F12).** The engine's **main entry must not import `@memberjunction/work-queue-aws`**, directly or
transitively. The `AWS` driver factory registers from the subpath `@memberjunction/work-queue-engine/aws`
(`@RegisterClass(BaseTransportDriverFactory, 'AWS')` as an import side effect), and that subpath is imported **only by
server bootstraps** (`ServerBootstrap`; never `ServerBootstrapLite`) and by the `mj queue` commands that need cloud
drivers (`export-topology`, `import-bindings`, `validate-bindings`, `work`) — oclif loads a command module only when
that command runs, so no other CLI command pays for it. `@memberjunction/queue` does **not** depend on
the engine: data-provider consumers (CodeGen, MetadataSync, the CLI) therefore load neither the engine nor any AWS
client. A transport row whose `DriverClass` has no registered factory surfaces as a validation **error**, not a crash.

**Layering.** `work-queue-engine` must never depend on `@memberjunction/queue` or on any data-provider package
(`GenericDatabaseProvider`, `SQLServerDataProvider`, `PostgreSQLDataProvider`); it reaches the database only through
`WorkQueueSqlExecutor` (§11). `packages/WorkQueue/*` is added to `pnpm-workspace.yaml` and the root `package.json`
workspaces (plan 04).

**No cross-package re-exports (F13).** A package never re-exports a symbol owned by another package (repo rule,
`.claude/rules/typescript-style.md`). Consumers import base symbols from `@memberjunction/work-queue-base`, core
symbols from `@memberjunction/work-queue-core`, and engine symbols from `@memberjunction/work-queue-engine`.

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
  /** UUID, globally unique (§2.1). Stable across redeliveries and replays. Producer-supplied or generated at publish. */
  MessageID: string;
  Topic: string;
  PartitionKey?: string;
  /** ≤ 10 entries; keys 1–64 chars [A-Za-z0-9_-] (no dots — a dotted filter field means MJ's source.field form,
   *  which filters reject, §4), values 1–256 chars. The only fields filters see. */
  Attributes: Record<string, string>;
  Payload?: TPayload;
  PayloadRef?: WorkPayloadRef;
  CorrelationID?: string;
  /** ISO-8601 UTC, assigned by the publisher (MJ), not the producer. */
  PublishedAt: string;
}
```

Ordering is **publish order** and nothing else: there is no producer-supplied ordering number. A producer that owns a
key's order publishes in order — it does not publish N+1 until N is accepted, or it publishes both in one call
(Database transport: one transaction, array order). See [10 — Consumer guide](10-consumer-guide.md).

### 1.1 Publish validation (identical on every publish path)

| Rule | Error code | Retryable |
|---|---|---|
| Serialized envelope ≤ topic `MaxPayloadBytes` (≤ 262,144) | `PayloadTooLarge` | no |
| ≤ 10 attributes; keys `[A-Za-z0-9_-]{1,64}` (no dots, §4); values 1–256 chars (**empty values rejected** — brokers refuse them and one bad entry fails a whole batch call); keys starting `mj` followed by `.`/`_` (case-insensitive) reserved | `InvalidAttributes` | no |
| Not both `Payload` and `PayloadRef` | `InvalidPayload` | no |
| `PartitionKey` 1–200 chars | `InvalidPartitionKey` | no |
| `MessageID`, if supplied, is a UUID | `InvalidMessageID` | no |
| `DeduplicationKey` 1–200 chars; `DeduplicationTTLSeconds` 60–2,592,000 | `InvalidDeduplication` | no |
| Topic exists and is `Active` | `TopicNotFound` / `TopicDisabled` | no |
| External (REST) caller and topic `AllowExternalPublish = 0` | `TopicNotExternallyPublishable` | no |
| Caller lacks `workqueue:publish` for the topic | `Forbidden` | no |
| Cloud topic has no imported binding | `TopicUnbound` | yes |
| `MessageID` already used (any topic) with a different canonical envelope (§2.1) | `MessageIDConflict` | no |
| The `DeduplicationKey` is reserved by a **different** in-flight publish (§2.1) | `DeduplicationPending` | yes |
| Transport unreachable / throttled | `TransportUnavailable` | yes |
| Transport rejected the message (e.g. SNS entry-level validation failure) | `TransportRejected` | no |
| REST client only: request rejected (400) / unauthenticated (401) / unparseable success body | `BadRequest` / `Unauthorized` / `InvalidResponse` | no / no / yes |

Core exports the shared, MJ-free validation used by every path, and the code list (`PublishErrorCodes`, which
includes every code above):

```ts
export function ValidatePublishRequest(topic: TopicBinding, request: PublishRequest): PublishError | null;
export function BuildWorkMessage(topicName: string, request: PublishRequest, publishedAt: Date, newId: () => string): WorkMessage;
export function SerializedEnvelopeBytes(message: WorkMessage): number;
/** Sorted-key JSON of { PartitionKey, Attributes, Payload, PayloadRef, CorrelationID } — never PublishedAt (§2.1). */
export function CanonicalEnvelope(message: WorkMessage): string;
```

---

## 2. Publisher contract

```ts
export interface PublishRequest<TPayload extends WorkJson = WorkJson> {
  MessageID?: string;
  PartitionKey?: string;
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
| **DeduplicationKey + TTL** | `(Topic, DeduplicationKey)` within window | `WorkQueueDeduplication` table in the MJ database (§6.6) | **all** (every publish goes through MJ — D9) |
| **MessageID** | **global** (F10) | Database: `WorkQueueMessage` primary key within retention. AWS FIFO: silent 5-minute SNS window | Database reports `Duplicate`/`MessageIDConflict`; AWS returns `Accepted` |

**`MessageID` is globally unique (F10).** On the Database transport a publish whose `MessageID` already exists is
compared by `CanonicalEnvelope` (sorted-key JSON of `PartitionKey`, `Attributes`, `Payload`, `PayloadRef`,
`CorrelationID`; `PublishedAt` is excluded because it always differs) **and** topic: same topic and same canonical
envelope → `Duplicate`; anything else → `MessageIDConflict`.

**Ledger protocol (F1)** — owned by `WorkQueueEngine.PublishAs` (its `WorkQueuePublishCoordinator`); drivers never see
deduplication keys. `Reserve(topic, key, messageID)` returns one of:

| Existing row for `(Topic, DeduplicationKey)` | `Reserve` result | Publish result |
|---|---|---|
| none, or expired (replaced in place) | `Reserved` | proceed |
| `Confirmed`, unexpired | `Duplicate { OwnerMessageID }` | `Duplicate` with the owner's `MessageID` |
| `Reserved`, unexpired, **same** `MessageID` | `Reserved` (the reservation is re-taken, `ExpiresAt` refreshed) | proceed — the send is repeated |
| `Reserved`, unexpired, **different** `MessageID` | `Pending { OwnerMessageID }` | `Rejected` `DeduplicationPending` (retryable) |

**Only a `Confirmed` row is a duplicate.** A reservation proves that a send was *attempted*, not that it succeeded; a
process that dies between reserve and send must not turn the caller's retry into a silent success. Because retries
reuse their `MessageID` (§2.2), the retry re-takes its own reservation and sends again; on AWS FIFO topics the 5-minute
`MessageDeduplicationId` window absorbs a double send, elsewhere at-least-once plus idempotent handlers does.

- **Database transport** — `Reserve` → `driver.Publish` → `Confirm` run inside **one database transaction** (the
  caller's, when a `Provider` in a transaction is passed), so the ledger row and the message commit together and a
  `Reserved` row is never visible to another publisher.
- **Cloud transport** — two-phase, on an independent executor (§11): `Reserve` (`Reserved`, `ExpiresAt = now + 120 s`)
  → transport send → `Confirm` (`Confirmed`, `ExpiresAt = now + TTL`) on success, or `Release` (delete) on send failure.
- Expired rows are deleted by the sweeper and replaced in place on publish.

### 2.2 Implementations

| Implementation | Package | Used by |
|---|---|---|
| `WorkQueueEngine.PublishAs(topic, requests, { ContextUser, Provider?, External? })` (`Publish` keeps the 2-arg interface shape and publishes as the engine's system user) | engine | Code running inside MJ; the REST extension (with `External: true`) |
| `WorkQueueApiPublisher` (HTTP client for §9; `fetch`, **generates MessageIDs up front so retries reuse them**, chunks to 100) | core | External producers (webhook Lambdas, other services) |
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

/** Why a handler was asked to stop; the value of WorkContext.Signal.reason once aborted. */
export type WorkAbortReason = 'Cancelled' | 'LeaseLost' | 'MaxProcessingSeconds' | 'Shutdown';

export interface WorkContext {
  readonly SubscriptionName: string;
  readonly DeliveryID: string;         // Database: WorkQueueDelivery.ID; SQS: SQS MessageId
  readonly Attempt: number;            // 1-based
  readonly MaxAttempts: number;
  readonly IsReplay: boolean;
  /** Aborted with a WorkAbortReason when an operator cancels, the lease is lost, the cap is hit, or the host stops. */
  readonly Signal: AbortSignal;
  /** Renews the lease and records progress. Resolves false once the lease is lost or the delivery is cancelled;
   *  the handler must stop. */
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

**Handler identity (F7).** MJ-hosted handlers run as the **host's system user** (`workQueue.systemUserEmail`), never as
the publisher. Whoever may publish to a topic can therefore cause system-privileged work: treat `workqueue:publish`
and `AllowExternalPublish` accordingly, and carry the originating user in the payload when a handler must act on
their behalf.

### 3.1 Subscription policy

```ts
export type PartitionMode = 'None' | 'Exclusive' | 'Ordered';
export type HeartbeatMode = 'Auto' | 'Manual';
export type HostType = 'MJWorker' | 'External';
export type DeliveryStatus = 'Pending' | 'InFlight' | 'Completed' | 'DeadLettered' | 'Discarded';

export interface SubscriptionPolicy {
  SubscriptionName: string;
  TopicName: string;
  PartitionMode: PartitionMode;
  MaxAttempts: number;                 // default 5
  BackoffBaseSeconds: number;          // default 10
  BackoffMaxSeconds: number;           // default 900
  LeaseSeconds: number;                // default 60
  HeartbeatMode: HeartbeatMode;        // default 'Auto'
  MaxProcessingSeconds?: number;
}

/** Full jitter: random(0, min(BackoffMax, BackoffBase × 2^(attempt−1))). Handler-supplied delay wins, clamped to BackoffMax. */
export function ComputeBackoffSeconds(policy: SubscriptionPolicy, attempt: number, handlerDelaySeconds?: number, random?: () => number): number;

/** min(LeaseSeconds / 3, 30) seconds — F3. */
export function HeartbeatIntervalSeconds(policy: SubscriptionPolicy): number;
```

**Partition modes.** `None` — no per-key constraint. `Exclusive` — at most one delivery in flight per key, no order
promise, a dead letter does not block the key. `Ordered` — **Database transport only**: a key's deliveries run in
publish order, one at a time, and a dead-lettered head halts the key until an operator replays or discards it.

**`PartitionMode` is immutable once a subscription has deliveries (F11)** — `Delivery.PartitionKey` is populated only
for partitioned subscriptions, so a change would leave existing rows inconsistent. The subscription entity's
`Validate()` rejects the change; create a new subscription instead.

**`Exclusive` retry differs by transport (F11).** On SQS FIFO a message in retry backoff stays in flight, so it **holds
its key** (and, FIFO being ordered, `Exclusive` there also preserves order within a key). On the Database transport a
retrying delivery returns to `Pending` and **does not hold its key**: later deliveries of the key may run first.
Handlers under `Exclusive` must not assume order on either.

### 3.2 Runtime

```ts
export interface ConsumerRuntimeOptions {
  Concurrency: number;
  ReceiveBatchSize: number;
  ReceiveWaitSeconds?: number;         // long-poll wait passed to Receive (SQS); default 0
  IdlePollMinMs: number;
  IdlePollMaxMs: number;
  ShutdownDrainMs: number;
  LeaseExpiryGraceMs?: number;         // local-clock allowance when enforcing the lease horizon; default 5000
}

/** Transport-agnostic loop: receive → run handler with lease management → settle. */
export class ConsumerRuntime<TPayload extends WorkJson = WorkJson> {
  constructor(consumer: ITransportConsumer<TPayload>, handlerFactory: () => WorkHandler<TPayload>,
              policy: SubscriptionPolicy, options: ConsumerRuntimeOptions, log: WorkLogger, now?: () => number);
  Start(): void;
  /** Stops receiving, waits up to ShutdownDrainMs, then aborts remaining handlers ('Shutdown') and releases their deliveries. */
  Stop(): Promise<void>;
  Kick(): void;
  get InFlightCount(): number;
  /** Process exactly the given deliveries (Lambda mode: no loop). */
  ProcessBatch(deliveries: ReceivedDelivery<TPayload>[]): Promise<SettleResult[]>;
}
```

Runtime rules (normative):

- **Heartbeat cadence (F3).** The heartbeat interval is `min(LeaseSeconds / 3, 30 s)`, decoupled from lease length, so
  a cancel or a lost lease is noticed within 30 s however long the lease. `Auto` heartbeats on that interval while the
  handler runs; `Manual` renews only on `context.Heartbeat()`. Each successful extension still grants a full
  `LeaseSeconds`. Heartbeats are coalesced: a call made while an extension is in flight shares its result.
- **Heartbeat results.** `Held` re-arms the lease horizon. `Lost` aborts the signal with `'LeaseLost'` and the handler's
  outcome is discarded. `Cancelled` aborts the signal with `'Cancelled'`; when the handler returns (or after
  `ShutdownDrainMs`), the runtime calls `AcknowledgeCancel` and discards the handler's outcome. A **transient**
  `ExtendLease` failure (a thrown transport error) is retried on the next tick and aborts nothing by itself.
- **Lease horizon (F4).** The runtime tracks the lease horizon — `LeaseExpiresAt` of the last `Held` (initially the
  claim's) — on **its own timer**, re-armed on every `Held`, in `Auto` **and** `Manual` modes and independent of any
  in-flight `ExtendLease` call. When the horizon plus `LeaseExpiryGraceMs` passes without a `Held`, the signal aborts
  with `'LeaseLost'`. A hung `ExtendLease` therefore cannot wedge a delivery: when the handler finishes, the runtime
  **races** any pending heartbeat against the horizon instead of awaiting it unboundedly. The horizon is a DB/transport
  clock value compared with the local clock; the grace is the skew allowance.
- **Cap.** After `MaxProcessingSeconds` the runtime stops renewing, aborts with `'MaxProcessingSeconds'`, and
  `Heartbeat` resolves `false`; a later handler outcome is still settled (the fence rejects it if the lease has gone).
  Cap and shutdown are tracked as **separate** conditions: a shutdown after the cap still `Release`s rather than
  `Retry`ing, and manual heartbeats never renew past the cap.
- **Settling.** `FatalWorkError` → `DeadLetter` (`DeadLetterReason` = its message truncated to 100 characters,
  `LastError` = `"Name: message"` plus stack frames); `TransientWorkError` → `Retry(RetryAfterSeconds)`; other throws →
  `Retry`; `Retry` with `Attempt ≥ MaxAttempts` → `DeadLetter('MaxAttemptsExceeded')`. All `DeadLetter` reasons are
  truncated to 100 characters; the full text goes to `LastError`. When a settle reports `LeaseLost`, the runtime calls
  `AcknowledgeCancel` once (a no-op unless the delivery was cancelled — §7), so a cancel that lands between the last
  heartbeat and the settle still frees the key immediately.
- **Bookkeeping.** Executions are keyed by `DeliveryID + LeaseToken` (a Database `DeliveryID` is stable across
  attempts, and a handler that ignores its abort may still be running when the same runtime re-claims the delivery).
- **`ProcessBatch`.** Once an item of a partition key does not complete, the remaining items of that key in the batch
  are **released** (`consumer.Release`, results returned) and not run.

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
| `startswith` | prefix | `[{"prefix":"value"}]` | `attr LIKE 'value%'` (wildcards in `value` escaped) |
| `isnotnull` / `isnull` | attribute present / absent | `[{"exists":true|false}]` | `EXISTS(attr)` / `NOT EXISTS(attr)` |
| OR group of `eq` on one field | any-of | `["a","b"]` | `attr IN ('a','b')` |

**Structure limits (all transports):** top-level `logic` must be `and`; nested groups may only be a one-field OR of
`eq`; ≤ 5 distinct fields; ≤ 50 values total; depth ≤ 2. **Each field may be constrained only once** (one rule, or one
OR group): a broker reads a field's value array as OR, so two AND-ed rules on one field would silently widen the filter
rather than narrow it. A non-empty value is required for `eq`/`neq`/`startswith` and forbidden for `isnull`/`isnotnull`.
Values are strings (numbers and booleans are compared as their string form, because envelope attributes are strings).

Anything outside that set — `contains`, `endswith`, `gt`/`lt`, OR across different fields, deeper nesting — is
**rejected when the subscription is saved**, by `SubscriptionUnsupportedReason` (§5, rule 4), naming the operator and
field. Each driver publishes what it accepts:

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

/** What the Database transport accepts (every operator in §4.1, single-field OR groups, 5 fields, 50 values). */
export const WORK_QUEUE_FILTER_SUPPORT: FilterSupport;
/** Throws WorkQueueConfigurationError naming the offending field/operator. */
export function ParseSubscriptionFilter(json: string | null, support: FilterSupport): SubscriptionFilter | null;
/** Case-sensitive, string-valued, missing attribute fails every operator except isnull. */
export function MatchesFilter(filter: SubscriptionFilter | null, attributes: Record<string, string>): boolean;
export function ToSnsFilterPolicy(filter: SubscriptionFilter): string;     // aws package
```

### 4.3 Why the subset, and why not `CompositeFilter` itself

We reuse MJ's **shape and its editor**, not its evaluator. Four reasons, each of which also explains a restriction
above:

1. **`work-queue-core` has zero `@memberjunction` dependencies** (§0) so Lambda bundles stay small, and
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

---

## 5. Transport contracts

```ts
export interface TopicBinding {
  TopicName: string;
  IsFifo: boolean;
  MaxPayloadBytes: number;
  Config: Record<string, WorkJson>;          // e.g. { SnsTopicArn }
}

export interface SubscriptionBinding {
  Policy: SubscriptionPolicy;
  Filter: SubscriptionFilter | null;
  HostType: HostType;
  Config: Record<string, WorkJson>;          // e.g. { Region, QueueUrl, QueueArn, DeadLetterQueueUrl, DeadLetterQueueArn, SnsSubscriptionArn, IsFifo }
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
  | { Kind: 'LeaseLost'; DeliveryID: string }          // the guarded write changed no row (taken over, expired or cancelled)
  | { Kind: 'Failed'; DeliveryID: string; Error: string };

export type LeaseExtension = 'Held' | 'Lost' | 'Cancelled';

export interface TransportCapabilities {
  Filters: FilterSupport;                  // operators/structure this transport accepts (§4.1)
  DetectsMessageIDDuplicates: boolean;     // Database true; AWS false
  PersistsProgress: boolean;               // Database true; AWS false
  SupportsOrdered: boolean;                // Database true; AWS false — Ordered requires the Database transport
  SupportsExternalHosts: boolean;          // Database false; AWS true
  CancelPending: boolean;                  // Database true; AWS false
  CancelInFlight: boolean;                 // Database true (cancel flag + acknowledge); AWS false
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
  /** Never returns two deliveries of one partition key for a partitioned subscription (§7; SQS FIFO: one message per receive call). */
  Receive(max: number, waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]>;
  /** A thrown error is transient (the runtime retries next tick). 'Cancelled' only where CancelInFlight. */
  ExtendLease(delivery: ReceivedDelivery<TPayload>, leaseSeconds: number, progress?: WorkProgress): Promise<LeaseExtension>;
  Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult>;
  Retry(delivery: ReceivedDelivery<TPayload>, delaySeconds: number, error: string): Promise<SettleResult>;
  DeadLetter(delivery: ReceivedDelivery<TPayload>, reason: string, error: string | null): Promise<SettleResult>;
  /** Database: no attempt consumed. SQS: the receive is already counted (§5.1). */
  Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult>;
  /** Token-fenced: a cancelled InFlight delivery held by this token → Discarded now, freeing its key (§7).
   *  Anything else → LeaseLost with no change. Transports without CancelInFlight always return LeaseLost. */
  AcknowledgeCancel(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult>;
  /** Releases the consumer's independent executor / clients (§11). */
  Close(): Promise<void>;
}

export interface BindingValidationIssue { Severity: 'Error' | 'Warning'; Subject: string; Message: string; }

/** Host/transport/policy compatibility; used by engine validation, subscription save and host start (capability gating). */
export function SubscriptionUnsupportedReason(binding: SubscriptionBinding, capabilities: TransportCapabilities): string | null;
```

`SubscriptionUnsupportedReason` rules (in order; the first that applies decides):
1. `HostType = 'External'` and `!SupportsExternalHosts` → unsupported.
2. `PartitionMode = 'Ordered'` and `!SupportsOrdered` → unsupported ("Ordered requires the Database transport").
3. `BackoffMaxSeconds > MaxRetryDelaySeconds` → unsupported.
4. The filter is not expressible under `capabilities.Filters` → unsupported, naming the field and operator (§4).
5. otherwise `null`. (`MaxProcessingSeconds` above a known host ceiling is a **warning**, reported by validation, not here.)

### 5.1 AWS transport notes (normative for plan 07)

- **One message per FIFO receive (F5).** On a FIFO binding the SQS consumer always calls `ReceiveMessage` with
  `MaxNumberOfMessages = 1`; `Receive(max, …)` issues up to `max` such calls **in parallel** (SQS locks a message group
  while one of its messages is in flight, so parallel receives return different keys). Lambda event sources on FIFO
  queues use `batch_size = 1`. This is what makes `Exclusive` hold for MJ workers and stops a key's followers from
  burning receive counts while its head retries. Standard queues may batch (≤ 10).
- **Attempt accounting (F5).** `Attempt` = `ApproximateReceiveCount`. The runtime dead-letters after a failure at
  `Attempt ≥ MaxAttempts` (§3.2). The consumer's **receive-time guard** dead-letters a message (reason
  `'MaxAttemptsExceeded'`) only when its receive count is `> MaxAttempts + 2`, and the queue's redrive policy is
  `maxReceiveCount = MaxAttempts + 5` (a crash-loop backstop; such moves list with reason `'RedrivePolicy'` and
  `Attempts = 0`). `Release` (visibility 0) and Lambda throttling each consume a receive — that is what the margins are
  for. Throttle with the event source's `maximum_concurrency`, **not** reserved concurrency, which returns messages
  to the queue and burns receives.
- **Leases.** `ExtendLease` = `ChangeMessageVisibility`; it **throws** on a retryable SQS error (the runtime retries
  next tick) and returns `Lost` for an invalid/expired receipt handle or once the 12-hour visibility window is
  exhausted. It never returns `Cancelled`.
- **Retry** = `ChangeMessageVisibility(delay ≤ 43,200 s)` without delete; on a FIFO queue the message keeps its group
  locked for the delay (§3.1, F11). **Dead-letter** = `SendMessage` to the subscription's dead-letter queue with reason
  attributes, then `DeleteMessage` (send-then-delete: a crash between them re-delivers, and the second dead-letter copy
  is suppressed by its deduplication id).
- **Dead-letter queue shape (F6).** A FIFO queue's DLQ is FIFO. Every dead-letter copy uses the **source SQS
  `MessageId` as `MessageGroupId`** (order is meaningless in a DLQ, and a shared group would let one receive block the
  rest of a key's dead letters) and `<MessageId>:dl` as `MessageDeduplicationId`. Replays use
  `<MessageID>:replay:<epoch-ms>` so the 5-minute dedup window never swallows them, and carry the original
  `PartitionKey` as their group id on the source queue.
- **DLQ scans (F6).** `ListDeadLetters`, `Replay` and `Discard` receive with `WaitTimeSeconds ≥ 1` (short polling
  samples a server subset and returns false empties) and loop until **three consecutive empty receives** or 100
  messages scanned; scanned messages are made visible again (`ChangeMessageVisibility 0`) unless acted on.
- **Attributes on dead-letter/replay copies:** `mj_dead_letter_reason`, `mj_last_error`, `mj_attempts`,
  `mj_dead_lettered_at`, `mj_source_queue`; replay markers `mj_replay`, `mj_replay_note`, `mj_replayed_by`. Unparseable
  bodies dead-letter with reason `InvalidEnvelope` and are listable (with a null `Message` payload) and discardable.
- **FIFO topics.** A topic must be FIFO when any of its subscriptions is `Exclusive` (W7). `MessageGroupId =
  PartitionKey ?? MessageID`, `MessageDeduplicationId = MessageID`. A `None` subscription on a FIFO topic is
  serialised per `PartitionKey` as a side effect; use the two-topic pattern for firehoses (11 §4).

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
  DeliveryID: string;                      // Database: Delivery.ID; AWS: envelope MessageID
  Message: WorkMessage;
  PartitionKey: string | null;
  Attempts: number;
  Reason: string;                          // handler reason, 'MaxAttemptsExceeded', 'LeaseExpired', 'HandlerNotRegistered', 'RedrivePolicy', 'InvalidEnvelope', …
  LastError: string | null;
  DeadLetteredAt: string | null;
  BlocksKey: boolean;                      // Ordered head on the Database transport
}

export type PartitionCondition = 'Idle' | 'InFlight' | 'Blocked';

export interface PartitionStateRecord {
  PartitionKey: string;
  Condition: PartitionCondition;
  HeadDeliveryID: string | null;
  WaitingItems: number;
}

export interface Page<T> { Items: T[]; NextCursor: string | null; }

export type OperatorResult =
  | { Supported: false }
  | { Supported: true; Changed: boolean; CancelRequested?: boolean };   // CancelRequested: present (true) only when an InFlight delivery was asked to stop

export interface ITransportOperator {
  GetStats(subscription: SubscriptionBinding): Promise<SubscriptionStats>;
  ListDeadLetters(subscription: SubscriptionBinding, cursor: string | null, pageSize: number): Promise<Page<DeadLetterRecord> | null>;
  /** condition null = all non-Idle keys. Returns null when !ListPartitions. */
  ListPartitions(subscription: SubscriptionBinding, condition: PartitionCondition | null, cursor: string | null, pageSize: number): Promise<Page<PartitionStateRecord> | null>;
  Replay(subscription: SubscriptionBinding, deliveryID: string, actorUserID: string | null, note: string | null): Promise<OperatorResult>;
  /** Pending (requires CancelPending) or DeadLettered → Discarded immediately.
   *  InFlight (requires CancelInFlight) → CancelRequestedAt set, `CancelRequested: true` (§7).
   *  One guarded statement per case, retried once when the status flips between cases while the operator acts. */
  Discard(subscription: SubscriptionBinding, deliveryID: string, reason: string, actorUserID: string | null): Promise<OperatorResult>;
}
```

Operator details per transport:
- **Database** — dead-letter cursor keyed on delivery ID, page size 1–500 (default 50); `CompletedLastHour` is always a
  number; `BlockedKeys` is `null` for non-`Ordered` subscriptions. Counts are **per-status index seeks** (§6.5), never
  an aggregate over every row of the subscription. `reason`/`note` are truncated to `ResolutionNote`'s 1000 characters.
- **AWS** — per §5.1: `ListDeadLetters` scans ≤ 100 DLQ messages, `NextCursor` always `null`; `Discard` of a message not
  found among scanned dead letters (including any pending or in-flight message) returns `{ Supported: false }`;
  `ListPartitions` returns `null`; `BlockedKeys` `null`.

---

## 6. Tables

Schema `${flyway:defaultSchema}`. Per MJ migration rules: no `__mj_CreatedAt/__mj_UpdatedAt`; no single-column FK
indexes (CodeGen owns them); simple CHECK constraints; T-SQL only. One migration creates all **six** tables (plan 05),
with a **single CodeGen SQL pass** appended to it.

**Key collation (F9).** `WorkQueueMessage.PartitionKey`, `WorkQueueDelivery.PartitionKey` and
`WorkQueueDeduplication.DeduplicationKey` are declared `COLLATE Latin1_General_100_BIN2` on SQL Server, so keys compare
**case-sensitively and byte-exactly on both dialects** (PostgreSQL already does). `Venue-42` and `venue-42` are two keys
everywhere, and the publish-order lock resource (§7) uses the key exactly as supplied.

**Isolation (F9).** The Database transport requires **`READ_COMMITTED_SNAPSHOT ON`** on SQL Server: without it,
publishers, claimers and the scaler query block or deadlock behind each other. `WorkQueueEngine.ValidateTopology`
reports an **Error** when it is off, and the host reports Database-transport subscriptions as `Error` rather than
starting them.

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
| IsFifo | bit | no | `0` | AWS: must be 1 if any subscription is `Exclusive` |
| AllowExternalPublish | bit | no | `0` | REST publishing allowed only when 1 |
| MaxPayloadBytes | int | no | `262144`; CHECK `> 0 AND <= 262144` | |
| DefaultDeduplicationTTLSeconds | int | no | `86400`; CHECK `>= 60` | |
| RetentionDays | int | no | `7`; CHECK `>= 1` | Database transport: terminal-row purge age |
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
| PartitionMode | nvarchar(20) | no | `'None'`; CHECK IN (`None`,`Exclusive`,`Ordered`) | immutable once deliveries exist (§3.1); `Ordered` requires the Database transport |
| MaxAttempts | int | no | `5`; CHECK `>= 1` | |
| BackoffBaseSeconds | int | no | `10`; CHECK `>= 0` | |
| BackoffMaxSeconds | int | no | `900`; CHECK `>= 0` | |
| LeaseSeconds | int | no | `60`; CHECK `>= 5` | |
| HeartbeatMode | nvarchar(20) | no | `'Auto'`; CHECK IN (`Auto`,`Manual`) | |
| MaxProcessingSeconds | int | yes | | |
| HostType | nvarchar(20) | no | `'MJWorker'`; CHECK IN (`MJWorker`,`External`) | |
| HandlerKey | nvarchar(200) | yes | | required for `MJWorker` (entity subclass `Validate`) |
| ExternalRef | nvarchar(500) | yes | | informational |
| BindingConfig | nvarchar(max) | yes | | JSON; AWS: `{ "Region","QueueUrl","QueueArn","DeadLetterQueueUrl","DeadLetterQueueArn","SnsSubscriptionArn","IsFifo" }` |
| Status | nvarchar(20) | no | `'Active'`; CHECK IN (`Active`,`Paused`,`Disabled`) | `Paused`: fan-out continues, nothing claimed; `Disabled`: no new deliveries |

A subscription receives only messages published while it is `Active` or `Paused`; there is no backfill.

### 6.4 `WorkQueueMessage` → `MJ: Work Queue Messages` (Database transport only)

| Column | Type | Null | Default / Constraint | Notes |
|---|---|---|---|---|
| ID | uniqueidentifier | no | PK | = `MessageID`, globally unique |
| PublishOrdinal | bigint | no | `IDENTITY(1,1)` | publish order |
| TopicID | uniqueidentifier | no | FK | |
| PartitionKey | nvarchar(200) | yes | `COLLATE Latin1_General_100_BIN2` | |
| Attributes | nvarchar(4000) | yes | | JSON |
| Payload | nvarchar(max) | yes | | JSON |
| PayloadRef | nvarchar(2000) | yes | | JSON |
| CorrelationID | nvarchar(200) | yes | | |
| PublishedAt | datetimeoffset(7) | no | `SYSDATETIMEOFFSET()` | DB clock |
| PublishedByUserID | uniqueidentifier | yes | FK → `User.ID` | |

Indexes: `UQ_WorkQueueMessage_PublishOrdinal` UNIQUE (`PublishOrdinal`); `IX_WorkQueueMessage_Purge`
(`TopicID`,`PublishedAt`). (Clustering stays on the PK per MJ convention; plan 05 records a verification item on insert
performance with producer-supplied random UUIDs.)

### 6.5 `WorkQueueDelivery` → `MJ: Work Queue Deliveries` (Database transport only)

| Column | Type | Null | Default / Constraint | Notes |
|---|---|---|---|---|
| ID | uniqueidentifier | no | `NEWSEQUENTIALID()` PK | |
| MessageID | uniqueidentifier | no | FK → `WorkQueueMessage.ID` | |
| SubscriptionID | uniqueidentifier | no | FK | |
| Status | nvarchar(20) | no | `'Pending'`; CHECK IN (`Pending`,`InFlight`,`Completed`,`DeadLettered`,`Discarded`) | |
| PartitionKey | nvarchar(200) | yes | `COLLATE Latin1_General_100_BIN2` | **populated only for `Exclusive`/`Ordered` subscriptions** (null for `None`) |
| OrderKey | bigint | no | | always the message's `PublishOrdinal` |
| AttemptCount | int | no | `0` | incremented at claim |
| IsReplay | bit | no | `0` | |
| VisibleAt | datetimeoffset(7) | no | `SYSDATETIMEOFFSET()` | |
| LeaseOwner | nvarchar(200) | yes | | |
| LeaseToken | uniqueidentifier | yes | | new per claim (fence); **never rotated by a cancel** |
| LeaseExpiresAt | datetimeoffset(7) | yes | | DB clock |
| LastHeartbeatAt | datetimeoffset(7) | yes | | |
| Progress | nvarchar(4000) | yes | | JSON `WorkProgress` |
| LastError | nvarchar(max) | yes | | |
| DeadLetterReason | nvarchar(100) | yes | | |
| DeadLetteredAt | datetimeoffset(7) | yes | | |
| CompletedAt | datetimeoffset(7) | yes | | terminal time for `Completed` **and** `Discarded` |
| CancelRequestedAt | datetimeoffset(7) | yes | | set when an `InFlight` delivery is cancelled; from then on only `AcknowledgeCancel` and `ExpireLeases` may change the row (§7) |
| ResolvedByUserID | uniqueidentifier | yes | FK → `User.ID` | |
| ResolutionNote | nvarchar(1000) | yes | | |

Indexes:
- `UQ_WorkQueueDelivery_Subscription_Message` UNIQUE (`SubscriptionID`,`MessageID`)
- **`UQ_WorkQueueDelivery_InFlightPartition` UNIQUE (`SubscriptionID`,`PartitionKey`) WHERE `Status = 'InFlight' AND PartitionKey IS NOT NULL`** — race-proof single flight per key; a claim that violates it is "nothing to claim"
- **`IX_WorkQueueDelivery_Claim` (`SubscriptionID`,`VisibleAt`) INCLUDE (`PartitionKey`,`OrderKey`,`AttemptCount`) WHERE `Status = 'Pending'`** — the claim scan never walks retained terminal rows
- `IX_WorkQueueDelivery_PartitionHead` (`SubscriptionID`,`PartitionKey`,`OrderKey`) INCLUDE (`Status`) WHERE `PartitionKey IS NOT NULL AND Status IN ('Pending','InFlight','DeadLettered')`
- `IX_WorkQueueDelivery_Lease` (`Status`,`LeaseExpiresAt`) WHERE `Status = 'InFlight'`
- `IX_WorkQueueDelivery_Open` (`SubscriptionID`,`Status`) WHERE `Status IN ('InFlight','DeadLettered')` — per-status counts and the dead-letter list
- `IX_WorkQueueDelivery_Purge` (`CompletedAt`) INCLUDE (`SubscriptionID`,`Status`) WHERE `Status IN ('Completed','Discarded')` — retention purge and `CompletedLastHour`

**The lease is never a system column.** `__mj_CreatedAt`/`__mj_UpdatedAt` are not liveness signals: liveness is
`LeaseExpiresAt`/`LastHeartbeatAt`, moved only by guarded single-statement SQL that touches lease columns alone. A
full-row write (`BaseEntity.Save()`) from a stale snapshot would restore an old `LeaseToken`, `AttemptCount` or
`CancelRequestedAt` and walk straight past the fence — see §6.7.

Filtered indexes contain no clock function (not allowed on either platform); lease expiry is handled by the
`ExpireLeases` step, which moves expired rows out of `InFlight` before the next claim.

### 6.6 `WorkQueueDeduplication` → `MJ: Work Queue Deduplications` (all transports)

| Column | Type | Null | Default / Constraint | Notes |
|---|---|---|---|---|
| ID | uniqueidentifier | no | PK | |
| TopicID | uniqueidentifier | no | FK | |
| DeduplicationKey | nvarchar(200) | no | `COLLATE Latin1_General_100_BIN2` | |
| MessageID | uniqueidentifier | no | | owning publish (no FK: cloud messages have no row) |
| Status | nvarchar(20) | no | CHECK IN (`Reserved`,`Confirmed`) | only `Confirmed` is a duplicate (§2.1) |
| ExpiresAt | datetimeoffset(7) | no | | |

Indexes: `UQ_WorkQueueDeduplication_Topic_Key` UNIQUE (`TopicID`,`DeduplicationKey`); `IX_WorkQueueDeduplication_ExpiresAt` (`ExpiresAt`).

### 6.7 Entity metadata flags and permissions

| Entity | `TrackRecordChanges` | `AllowUserSearchAPI` | `AllowDirectSQLInsert/Update/Delete` | `AllowCreateAPI/UpdateAPI/DeleteAPI` |
|---|---|---|---|---|
| Transports, Topics, Subscriptions | 1 | 1 | 0 | 1 |
| Messages, Deliveries, Deduplications | **0** | **0** | **1** | **0** |

**Delivery state is driver-owned.** For Messages, Deliveries and Deduplications the API flags are 0 and the engine
ships server entity subclasses whose `Save()`/`Delete()` fail with: *"work-queue delivery state is managed by the
transport driver; use the operator API (Replay / Discard)"*. Rationale: MJ's generated update procedure writes every
column, so a `Save()` from a stale snapshot silently overwrites a newer claim's lease token, attempt count or cancel
request — the "load, check `Status`, `Save()`" pattern that looks like a compare-and-swap and is not one. (CodeGen
still emits the CRUD procedures in the migration's single SQL pass; the flags and the save guards are the protection.
Test cleanup of these rows uses SQL `DELETE`, never `entity.Delete()`.)

**Read permissions (F7).** Payloads may carry personal data, so entity **read** permission on Messages and Deliveries
is granted to **administrative roles only** (the `Developer` role in plan 05's permission metadata), not to general UI
roles. Operators reach dead letters through the remote operations (§8), which authorize per subscription.

---

## 7. Database claim semantics (normative)

**Executors (F8).** None of the statements below may ride an ambient provider transaction: consumers, operators and
the sweeper each run on their own independent executor (§11). The one exception is a publish the caller explicitly
enlists in its transaction.

**`ExpireLeases(now)`** runs before each claim cycle and in the sweeper. `InFlight` rows with `LeaseExpiresAt < now`:

| Expired row | Becomes |
|---|---|
| `CancelRequestedAt` set | `Discarded` (`CompletedAt = now`) — never retried |
| `AttemptCount < MaxAttempts` | `Pending` (`LastError = 'LeaseExpired'`, lease columns cleared) |
| otherwise | `DeadLettered` (`DeadLetterReason = 'LeaseExpired'`) |

The statement **returns only the rows it dead-lettered** (subscription, delivery, partition key), identically on both
dialects, so the caller can raise `NotifyDeadLettered` (§11); retried and discarded rows are not returned.

**Claimable.** A `Pending` delivery `d` of subscription `s` is claimable when all hold:

1. `s.Status = 'Active'`, `d.VisibleAt ≤ now`, `d.CancelRequestedAt IS NULL`.
2. `s.PartitionMode = 'None'` → nothing else.
3. `s.PartitionMode = 'Exclusive'` → no `InFlight` delivery exists for `(s, d.PartitionKey)`.
4. `s.PartitionMode = 'Ordered'` → `d` is the **head**: no delivery for `(s, d.PartitionKey)` with a lower `OrderKey`
   in `Pending`, `InFlight` or `DeadLettered`; and no `InFlight` delivery for the key.

**Claim.** Claims use skip-locked hints (`WITH (UPDLOCK, READPAST, ROWLOCK)` / `FOR UPDATE SKIP LOCKED`) and set
`InFlight`, `LeaseToken = new UUID`, `LeaseOwner`, `LeaseExpiresAt = now + LeaseSeconds`, `AttemptCount + 1`.
`None` subscriptions claim a batch in one statement. For partitioned subscriptions:
- **at most one row per partition key is selected within one claim batch** (e.g. `ROW_NUMBER() OVER (PARTITION BY
  PartitionKey ORDER BY OrderKey) = 1`), and an `Ordered` head is never skipped in favour of a later row of its key
  (a locked head means the key yields nothing this cycle);
- each candidate is claimed by its own guarded statement, and a violation of
  `UQ_WorkQueueDelivery_InFlightPartition` is handled **per candidate** as "not claimed" — it never aborts the rest of
  the batch.

**Holder writes.** Heartbeat, complete, retry, dead-letter and release are single statements guarded on `ID`,
`Status = 'InFlight'`, `LeaseToken` **and `CancelRequestedAt IS NULL`**, and succeed only when exactly one row
changes. A zero-row settle returns `LeaseLost`. `ExtendLease` that changes no row distinguishes the cause: the row is
still `InFlight` with this token and `CancelRequestedAt` set → `Cancelled`; otherwise → `Lost`.

**Cancelling in-flight work (F2).** `Discard` on an `InFlight` delivery does not change `Status` and **does not rotate
the token**: it sets `CancelRequestedAt`, records the reason and actor, and returns `CancelRequested: true`. From that
moment no holder write succeeds except `AcknowledgeCancel`. Within one heartbeat interval (≤ 30 s, F3) `ExtendLease`
returns `Cancelled`, the runtime aborts the handler with `'Cancelled'` and, once it has stopped, calls
**`AcknowledgeCancel`** — guarded on `ID`, `Status = 'InFlight'`, `LeaseToken` and `CancelRequestedAt IS NOT NULL` —
which sets `Discarded` and `CompletedAt` **immediately**, freeing an `Exclusive`/`Ordered` key as soon as the handler
is really finished rather than when the lease runs out. If the holder is dead, `ExpireLeases` discards the row when the
lease expires. A cancelled delivery is never claimable and never retried.

**Settle effects.** `Complete` → `Completed`, `CompletedAt`. `Retry` → `Pending`, `VisibleAt = now + delay` (an
`Ordered` head in backoff holds its key, because it is still the head; an `Exclusive` retry does not — §3.1).
`DeadLetter` → `DeadLettered` (an `Ordered` head blocks its key). `Release` → `Pending`, `VisibleAt = now`,
`AttemptCount − 1`.

**Operator effects.** `Replay` (`DeadLettered`) → `Pending`, `AttemptCount = 0`, `IsReplay = 1`, `VisibleAt = now`; the
delivery keeps its `OrderKey`, so an `Ordered` head keeps its place. `Discard` (`Pending` or `DeadLettered`) →
`Discarded`, `CompletedAt`; discarding a dead-lettered `Ordered` head unblocks the key.

**Derived partition conditions.** `InFlight` (an in-flight delivery exists for the key), `Blocked` (the key's head is
`DeadLettered`, `Ordered` only), else `Idle`. Nothing about a partition is stored outside the delivery rows.

**Publish order (F9).** For topics with an `Ordered` subscription, a publish takes a transaction-scoped application
lock per partition key (`sp_getapplock` / `pg_advisory_xact_lock`) before inserting the message, so ordinals commit in
order. A publish touching several keys takes its locks in **sorted key order**, with a **lock timeout** (`lock_timeout`
on PostgreSQL, the `@LockTimeout` argument on SQL Server) mapped to `TransportUnavailable` (retryable). Callers that
enlist a publish in their own transaction should publish to one key per transaction.

**Bounded work (F9).** Backlog and scaler counts are capped (`TOP (1000)` / `LIMIT 1000` inside the count); stats use
per-status index seeks; `ExpireLeases`, purge and ledger purge are chunked and index-backed (§6.4–§6.6). **One sweeper
runs at a time**: a sweep takes a **transaction-owned** application lock (`sp_getapplock @LockOwner='Transaction'` /
`pg_try_advisory_xact_lock`) held on a private independent executor — MJ providers pool connections, so only a
transaction pins one — and skips the pass when another instance holds it. The engine exports
`TryAcquireSweepLock(source, contextUser): Promise<SweepLock | null>` with `SweepLock { Executor; Release() }`. Retention purge deletes terminal deliveries older than the topic's
`RetentionDays`, then messages with no remaining deliveries.

---

## 8. Remote operations (operator surface)

CodeGen-emitted bases from `MJ: Remote Operations` rows (`GenerationType = 'Manual'`), server subclasses in the
engine. I/O field casing follows the existing remote-operation type files in `metadata/remote-operations/types/`.
Each returns `supported: false` without side effects when the transport lacks the capability.

| Key | RequiredScope | Input | Output |
|---|---|---|---|
| `WorkQueue.GetSubscriptionStats` | `workqueue:read` | `{ subscriptionName?: string }` | `{ subscriptions: SubscriptionStats[]; failures: { subscriptionName: string; error: string }[] }` |
| `WorkQueue.ListDeadLetters` | `workqueue:read` | `{ subscriptionName: string; cursor?: string; pageSize?: number }` | `{ supported: boolean; items: DeadLetterRecord[]; nextCursor: string \| null }` |
| `WorkQueue.ListPartitions` | `workqueue:read` | `{ subscriptionName: string; condition?: PartitionCondition; cursor?: string; pageSize?: number }` | `{ supported: boolean; items: PartitionStateRecord[]; nextCursor: string \| null }` |
| `WorkQueue.ReplayDeadLetter` | `workqueue:operate` | `{ subscriptionName: string; deliveryID: string; note?: string }` | `{ supported: boolean; replayed: boolean }` |
| `WorkQueue.DiscardDelivery` | `workqueue:operate` | `{ subscriptionName: string; deliveryID: string; reason: string }` | `{ supported: boolean; discarded: boolean; cancelRequested: boolean }` |
| `WorkQueue.GetBacklog` | `workqueue:read` | `{ subscriptionName: string }` | `{ supported: boolean; claimable: number; inFlight: number; total: number; capped: boolean }` — the autoscaler metric (§11) |
| `WorkQueue.ValidateBindings` | `workqueue:read` | `{ transportName?: string }` | `{ issues: BindingValidationIssue[] }` |

Dead-letter rows in operation output carry `PayloadJSON: string | null` instead of a recursive `Payload` (CodeGen
emits operation types from `.ts` definition files). `failures` carries a sanitised message, never raw driver text.

**Authorization (F7).** MJ's resolver scope check (`ResolverBase.CheckAPIKeyScopeAuthorization`) is a **no-op for
callers without an API key**, so `RequiredScope` alone would let any logged-in user replay, discard or read dead-letter
payloads. Every operation therefore overrides `Authorize(input, user)`:

| Caller | `workqueue:read` operations | `workqueue:operate` operations |
|---|---|---|
| API key | the scope, with the subscription name as resource | the scope, with the subscription name as resource |
| Interactive user | **Read** permission on `MJ: Work Queue Deliveries` | **Update** permission on `MJ: Work Queue Subscriptions` |

**Input bounds.** `deliveryID` is a UUID; `pageSize` 1–500; `reason`/`note` ≤ 1000 characters, `cursor` ≤ 500,
`partitionKey`/`subscriptionName` ≤ 200; a null or non-object input is rejected with a validation error, not a throw.

Scopes (`metadata/api-scopes`): parent `workqueue`; `workqueue:publish` (ResourceType Topic), `workqueue:read` and
`workqueue:operate` (ResourceType **Subscription** — a key scoped to one subscription cannot read another's dead
letters).

CLI (`mj queue …`, plan 06) invokes these operations in-process — `stats`, `dead-letters`, `replay`, `discard`,
`partitions`, `backlog` — plus `export-topology`, `import-bindings`, `validate-bindings` and the worker entry point
`work`.

---

## 9. REST API — publish only

Server Extension, root `/work-queue` (configurable). **Auth: an MJ API key is required (F7).** A request authenticated
only by a bearer/JWT session (including magic-link and widget sessions) is refused with `403` — REST publishing is for
external producers; code inside MJ calls `PublishAs`. The scope check is `workqueue:publish` with the topic name as
resource and **mirrors `ResolverBase.CheckAPIKeyScopeAuthorization`**: the `full_access` fast path, the acting-context
argument, and evaluation/usage logging as the **system user** (not the API key's clone user). Authentication and the
scope check run in middleware **before the JSON body parser**, so an unauthorized caller cannot make the server parse
30 MB.

| Method & path | Body | Response |
|---|---|---|
| `POST /work-queue/topics/{topic}/messages` | `{ "messages": PublishRequestJson[] }` (1–100; fields camelCase: `messageId`, `partitionKey`, `attributes`, `payload`, `payloadRef`, `correlationId`, `deduplicationKey`, `deduplicationTtlSeconds`) | `202 { "results": [{ "messageId", "status", "error"?: { "code", "message", "retryable" } }] }` · `400` malformed body · `401` unauthenticated · `403` no API key, missing scope or `TopicNotExternallyPublishable` · `404` unknown topic · `413` body over the limit |

`202` is returned even with per-item rejections; callers inspect `results`. `status` values are `Accepted` / `Duplicate` /
`Rejected` (parsed case-insensitively); `payloadRef` fields are camelCase (`uri`, `contentType`, `sizeBytes`, `checksum`).
**Core exports the single JSON mapping used by both client and server** (`ParseRestPublishBody`, `ToRestPublishResult`, …);
the server extension imports it and defines no mapping of its own. `MaxBatch` (≤ 100) and `BodyLimit` (default `30mb`)
are extension settings. `{topic}` must match the topic-name charset before it is logged or looked up. The extension
configures the engine as the **system user**, never as the first caller.

---

## 10. Topology manifest

```ts
export interface TopologyManifest {
  ManifestVersion: 1;
  GeneratedAt: string;
  Transport: { Name: string; DriverClass: string; Configuration: Record<string, WorkJson> };
  Topics: ManifestTopic[];
}
export interface ManifestTopic { Name: string; IsFifo: boolean; MaxPayloadBytes: number; Subscriptions: ManifestSubscription[]; }
export interface ManifestSubscription {
  Name: string;
  Filter: SubscriptionFilter | null;
  Policy: SubscriptionPolicy;
  HostType: HostType;
  Status: 'Active' | 'Paused' | 'Disabled';     // Terraform maps Paused/Disabled to the Lambda event source's `enabled = false`
  ExternalRef: string | null;
  Aws?: { SnsFilterPolicy: string | null };     // rendered by the engine's ./aws entry so IaC never re-translates filters
}
export interface BindingImport {
  ManifestVersion: 1;
  Topics: { Name: string; BindingConfig: Record<string, WorkJson> }[];
  Subscriptions: { Name: string; BindingConfig: Record<string, WorkJson> }[];
}
```

External consumer configuration (Lambda env `MJ_WQ_SUBSCRIPTION`) is a `SubscriptionBinding` JSON produced by
Terraform from the manifest and the created resources. It freezes the subscription's policy at apply time: changing
`MaxAttempts`/backoff in MJ without re-applying is drift, which `ValidateBindings` reports as a **Warning** by comparing
the queue's redrive count and visibility timeout with the policy.

---

## 11. Engine surface used across plans (normative names)

Plans 05 and 06 carry the complete member lists and helper types (`HostRuntime`, `HostRuntimeArgs`, `HostSweeper`,
`WorkQueueHostEngine`, `WorkHandlerResolver`, `TransportRow`); the signatures below are the cross-plan seams and must
not drift.

**Executor ownership (F8).** Both data providers route an un-sourced `ExecuteSQL` onto the provider's **ambient
transaction**, so queue SQL issued on the shared provider can be absorbed by an unrelated unit of work and rolled back
with it — un-claiming a delivery whose handler is already running. Therefore:

- every `DatabaseTransportConsumer` (created in `OpenConsumer`), every `DatabaseTransportOperator`, the sweeper and the
  cloud-path deduplication ledger **own an independent executor** obtained from
  `WorkQueueExecutorSource.CreateIndependentInstance()` and release it in `Close()`/shutdown;
- multi-statement units (publish, discard, replay) run in a transaction **on that independent executor**;
- the shared source executor is used only to mint independent instances;
- the only queue SQL that runs on a caller's transaction is a publish the caller explicitly enlists
  (`DatabaseTransportPublishOptions.Executor`); in that mode the driver **rethrows transient database errors** instead
  of mapping them to `TransportUnavailable`, so the caller's retry policy sees the deadlock, and a failed rollback never
  masks the original error.

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

// engine/src/transports/database/
export class DatabaseTransportDriver implements ITransportDriver { }
export class DatabaseTransportOperator implements ITransportOperator { }

// engine/src/dedup/DeduplicationLedger.ts
export type LedgerReservation =
  | { Kind: 'Reserved' }                                  // new, expired-and-replaced, or re-taken by the same MessageID
  | { Kind: 'Duplicate'; OwnerMessageID: string }         // a Confirmed, unexpired row
  | { Kind: 'Pending'; OwnerMessageID: string };          // Reserved, unexpired, owned by a different MessageID
export class DeduplicationLedger {
  constructor(executor: WorkQueueSqlExecutor, contextUser: UserInfo);   // a transaction (Database) or an independent executor (cloud)
  Reserve(topicID: string, key: string, messageID: string): Promise<LedgerReservation>;
  Confirm(topicID: string, key: string, messageID: string, ttlSeconds: number): Promise<boolean>;
  Release(topicID: string, key: string, messageID: string): Promise<boolean>;
  PurgeExpired(): Promise<number>;
}

// engine/src/transports/
export interface DeadLetteredEvent { SubscriptionName: string; DeliveryID: string; Reason: string; PartitionKey: string | null; }
export interface TransportDriverDeps {
  ContextUser: UserInfo; Executor: WorkQueueExecutorSource; Log: WorkLogger; InstanceID?: string;
  NotifyDeadLettered?: (event: DeadLetteredEvent) => void;
}
/** The Database driver narrows §5's opaque options; the engine's WorkQueuePublishCoordinator owns deduplication. */
export interface DatabaseTransportPublishOptions extends DatabasePublishOptions { Kind: 'Database'; Executor?: WorkQueueTransactionalExecutor; UserID?: string; }
export abstract class BaseTransportDriverFactory {
  abstract Create(transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver>;   // TransportRow: structural view the generated entity satisfies (plan 05, in work-queue-base)
}   // @RegisterClass(BaseTransportDriverFactory, 'Database') in the main entry; 'AWS' in the ./aws subpath (§0)

// base/src/WorkQueueEngineBase.ts — browser-safe metadata tier (mirrors AIEngineBase/AIEngine, packages/AI/BaseAIEngine)
export class WorkQueueEngineBase extends BaseEngine<WorkQueueEngineBase> {
  static get Instance(): WorkQueueEngineBase;
  get Transports(): MJWorkQueueTransportEntity[];
  get Topics(): MJWorkQueueTopicEntity[];
  get Subscriptions(): MJWorkQueueSubscriptionEntity[];
  GetTopicByName(name: string): MJWorkQueueTopicEntity | undefined;              // trimmed, case-insensitive
  GetSubscriptionByName(name: string): MJWorkQueueSubscriptionEntity | undefined;
  SubscriptionsForTopic(topicID: string): MJWorkQueueSubscriptionEntity[];
  TopicOf(subscription: MJWorkQueueSubscriptionEntity): MJWorkQueueTopicEntity | undefined;
  TransportOf(topic: MJWorkQueueTopicEntity): MJWorkQueueTransportEntity | undefined;
  BuildTopicBinding(topic: MJWorkQueueTopicEntity): TopicBinding;
  BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity, support?: FilterSupport): SubscriptionBinding;
  BuildSubscriptionPolicy(subscription: MJWorkQueueSubscriptionEntity): SubscriptionPolicy;
  ParseFilter(subscription: MJWorkQueueSubscriptionEntity, support: FilterSupport): SubscriptionFilter | null;
  ValidateTopologyRows(capabilitiesByDriverClass: Record<string, TransportCapabilities>): BindingValidationIssue[];
}

// engine/src/WorkQueueEngine.ts — server tier. Mirrors AIEngine/AIEngineBase: a separate singleton that DELEGATES
// metadata to WorkQueueEngineBase.Instance (composition, not inheritance — see packages/AI/Engine/src/AIEngine.ts:240)
// and adds drivers, publishing, the operator, the autoscaler metric and the manifest.
export interface WorkQueuePublishOptions { ContextUser: UserInfo; Provider?: IMetadataProvider; External?: boolean; }
export class WorkQueueEngine extends BaseSingleton<WorkQueueEngine> implements IWorkPublisher {
  static get Instance(): WorkQueueEngine;
  /** The metadata tier. Config() delegates to it. */
  get Metadata(): WorkQueueEngineBase;
  Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void>;

  // Proxies — the COMPLETE list; each forwards to Metadata with the same signature. Anything else is reached via Metadata.
  get Transports(): MJWorkQueueTransportEntity[];
  get Topics(): MJWorkQueueTopicEntity[];
  get Subscriptions(): MJWorkQueueSubscriptionEntity[];
  GetTopicByName(name: string): MJWorkQueueTopicEntity | undefined;
  GetSubscriptionByName(name: string): MJWorkQueueSubscriptionEntity | undefined;
  SubscriptionsForTopic(topicID: string): MJWorkQueueSubscriptionEntity[];
  BuildTopicBinding(topic: MJWorkQueueTopicEntity): TopicBinding;
  BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity, support?: FilterSupport): SubscriptionBinding;

  // Server-only
  GetDriver(transportID: string): Promise<ITransportDriver>;                     // ONE cached instance per transport, however it is reached
  GetOperator(subscription: MJWorkQueueSubscriptionEntity): Promise<ITransportOperator>;
  /** Topology rows + capability gating + driver ValidateBindings + database prerequisites (RCSI, §6). */
  ValidateTopology(): Promise<BindingValidationIssue[]>;
  PublishAs<T extends WorkJson>(topic: string, requests: PublishRequest<T>[], options: WorkQueuePublishOptions): Promise<PublishResult[]>;
  Publish<T extends WorkJson>(topic: string, requests: PublishRequest<T>[]): Promise<PublishResult[]>;
  OnPublished(listener: (topicName: string) => void): () => void;                // host Kick hook; returns unsubscribe
  /** Autoscaler metric: claimable Pending (partition rules applied) + InFlight. Both counts matter — a scaler that
   *  ignores InFlight starves the queue, because KEDA subtracts running executions from the metric.
   *  Each count is capped at 1000 (Capped = true when either cap was hit); Total = Claimable + InFlight. */
  GetBacklog(subscriptionName: string): Promise<{ Supported: boolean; Claimable: number; InFlight: number; Total: number; Capped: boolean }>;
  /** Raise a dead-letter event to OnDeadLettered listeners. Public: drivers (via TransportDriverDeps) and the sweeper call it. */
  NotifyDeadLettered(event: DeadLetteredEvent): void;
  /** IN-PROCESS ONLY: fires for dead letters produced by THIS process (its consumers and its sweeper passes) on the
   *  Database transport. A dead letter produced by another instance, or by an `mj queue work --once` job, fires no
   *  listener here. Alert durably from WorkQueue.GetSubscriptionStats (DeadLettered > 0) or, on AWS, the DLQ alarms. */
  OnDeadLettered(listener: (event: DeadLetteredEvent) => void): () => void;
  /** Builds the manifest with base's BuildTopologyManifest, then applies the enricher registered for the transport's
   *  DriverClass (ManifestEnricherRegistry; the AWS subpath registers one that renders SnsFilterPolicy). */
  ExportManifest(transportName: string): TopologyManifest;
  /** Re-reads metadata as the engine's system user; the caller's user is used only for the entity saves. */
  ImportBindings(bindings: BindingImport, contextUser: UserInfo): Promise<BindingValidationIssue[]>;
}
```

`WorkQueueEngine` does **not** implement `IStartupSink`: nothing registers it for startup, and MJServer configures it
explicitly when the `workQueue` section is enabled (plan 06).

```ts
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
  CreateRuntime?: (args: HostRuntimeArgs) => HostRuntime;        // test seams (defaults: ConsumerRuntime, WorkQueueSweeper, ResolveWorkHandler)
  CreateSweeper?: () => HostSweeper;
  ResolveHandler?: WorkHandlerResolver;
}
export type HostedSubscriptionState = 'Running' | 'Paused' | 'Unsupported' | 'HandlerNotRegistered' | 'Error';
export class WorkQueueHost implements IShutdownable {
  constructor(config: WorkQueueHostConfig, engine: WorkQueueHostEngine, contextUser: UserInfo, executor: WorkQueueExecutorSource,
              log: WorkLogger, dependencies: WorkQueueHostDependencies);
  Start(): Promise<void>;
  /** One-shot container-job mode: start, claim/run/drain, then resolve. The delivery budget counts deliveries
   *  RECEIVED (not requested); it returns 'MaxDeliveries' only when the budget is received AND no receive is pending
   *  AND nothing is in flight, and 'Idle' only after an empty receive has completed since the last activity.
   *  Never returns before in-flight work settles. */
  RunOnce(options: { MaxDeliveries?: number; IdleExitMs?: number; MaxDurationMs?: number }): Promise<{ Processed: number; Reason: 'MaxDeliveries' | 'Idle' | 'MaxDuration' | 'Shutdown' }>;
  Reconcile(): Promise<void>;
  /** Idempotent: concurrent callers share one shutdown promise, which resolves only when the drain has finished. */
  Shutdown(): Promise<void>;
  Kick(subscriptionName: string): void;
  GetHealth(): { InstanceID: string; Subscriptions: { Name: string; State: HostedSubscriptionState; Reason: string | null; InFlight: number }[] };
}

// engine/src/host/WorkQueueSweeper.ts
export class WorkQueueSweeper {
  constructor(executor: WorkQueueExecutorSource, engine: WorkQueueEngine, contextUser: UserInfo, log: WorkLogger);
  /** Skips the pass (returns {}) when another instance holds the sweep lock (§7). Keys: ExpireLeases (rows dead-lettered
   *  by the pass, each raised through NotifyDeadLettered), PurgeRetention, PurgeDeduplications. */
  RunOnce(): Promise<Record<string, number>>;
}
```

A worker process (`mj queue work`, plan 06) exits **non-zero** when no requested subscription reached `Running`
(unknown name, `Unsupported`, `HandlerNotRegistered`, `Error`), exits 0 on an empty queue or a spent budget, and
handles `SIGTERM`/`SIGINT` in both one-shot and long-running modes by awaiting `Shutdown()`.

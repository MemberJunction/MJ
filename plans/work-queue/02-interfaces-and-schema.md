# Work Queue — Interfaces and Schema (Phase 1)

**Status:** Proposed — the contract every plan in this set implements.
**Date:** 2026-09-15
**Design:** [01](01-design.md)

Names, types and shapes here are normative. The implementation plans ([03](03-native-implementation-plan.md),
[04](04-legacy-queue-port-plan.md), [05](05-aws-implementation-plan.md)) contain the code; where a plan
and this document disagree, fix the plan.

---

## 1. Packages

| Package | Folder | Owns |
| --- | --- | --- |
| `@memberjunction/work-queue` | `packages/WorkQueue` | Contracts, native driver, producer, worker, maintenance, management operations |
| `@memberjunction/work-queue-aws` | `packages/WorkQueueAWS` | AWS SQS FIFO driver, Lambda adapter |
| `@memberjunction/server` (existing) | `packages/MJServer` | Configuration, startup wiring, `/work-queue/publish` REST router |
| `@memberjunction/queue` (existing) | `packages/MJQueue` | Legacy API, routed onto the work queue |

Both new packages live directly under `packages/`, which the existing `packages/*` workspace glob already
covers. No workspace configuration changes.

## 2. Entities

CodeGen derives entity names from table names. The names below are what CodeGen produces for `__mj`
tables; confirm them in `packages/MJCoreEntities/src/generated/entities/__mj.ts` after CodeGen, and if any
differ, change **only** `WorkQueueEntityNames` in `packages/WorkQueue/src/constants.ts`.

| Table | Entity name | Generated class |
| --- | --- | --- |
| `WorkQueue` | `MJ: Work Queues` | `MJWorkQueueEntity` |
| `WorkQueueTopic` | `MJ: Work Queue Topics` | `MJWorkQueueTopicEntity` |
| `WorkQueueSubscription` | `MJ: Work Queue Subscriptions` | `MJWorkQueueSubscriptionEntity` |
| `WorkQueueItem` | `MJ: Work Queue Items` | `MJWorkQueueItemEntity` |
| `WorkQueueDeduplication` | `MJ: Work Queue Deduplications` | `MJWorkQueueDeduplicationEntity` |

Record-change tracking and user search are disabled for the high-write entities (Items and
Deduplications) through `metadata/entities`.

## 3. Schema

All tables live in the core schema (`${flyway:defaultSchema}`). CodeGen adds `__mj_CreatedAt`,
`__mj_UpdatedAt`, single-column foreign-key indexes, views, procedures and permissions. The full T-SQL,
with a description for every column, is Task 1 of [03](03-native-implementation-plan.md).

### 3.1 `WorkQueue`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `ID` | `UNIQUEIDENTIFIER` | no | `NEWSEQUENTIALID()` | primary key |
| `Name` | `NVARCHAR(100)` | no | | unique (`UQ_WorkQueue_Name`) |
| `Description` | `NVARCHAR(MAX)` | yes | | |
| `LeaseSeconds` | `INT` | no | `300` | `>= 10` |
| `MaxAttempts` | `INT` | no | `5` | `>= 1` |
| `InitialBackoffSeconds` | `INT` | no | `10` | `>= 0` |
| `MaxBackoffSeconds` | `INT` | no | `3600` | `>= InitialBackoffSeconds` |
| `DeadLetterPolicy` | `NVARCHAR(20)` | no | `'Block Partition'` | `'Block Partition'`, `'Skip Partition'` |
| `PurgeOnComplete` | `BIT` | no | `1` | |
| `IsActive` | `BIT` | no | `1` | |

### 3.2 `WorkQueueTopic`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `ID` | `UNIQUEIDENTIFIER` | no | `NEWSEQUENTIALID()` | primary key |
| `Name` | `NVARCHAR(200)` | no | | unique (`UQ_WorkQueueTopic_Name`) |
| `Description` | `NVARCHAR(MAX)` | yes | | |
| `AllowExternalPublish` | `BIT` | no | `0` | REST publishing allowed only when 1 |
| `IsActive` | `BIT` | no | `1` | |

### 3.3 `WorkQueueSubscription`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `ID` | `UNIQUEIDENTIFIER` | no | `NEWSEQUENTIALID()` | primary key |
| `TopicID` | `UNIQUEIDENTIFIER` | no | | FK `WorkQueueTopic.ID` |
| `QueueID` | `UNIQUEIDENTIFIER` | no | | FK `WorkQueue.ID` |
| `FilterRules` | `NVARCHAR(MAX)` | yes | | JSON object, see §4.4 |
| `IsActive` | `BIT` | no | `1` | |

Unique `(TopicID, QueueID)` — `UQ_WorkQueueSubscription_Topic_Queue`.

### 3.4 `WorkQueueItem`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `ID` | `UNIQUEIDENTIFIER` | no | `NEWSEQUENTIALID()` | primary key |
| `Sequence` | `BIGINT IDENTITY(1,1)` | no | | publish order |
| `PublishID` | `UNIQUEIDENTIFIER` | no | | shared by all items of one publish |
| `QueueID` | `UNIQUEIDENTIFIER` | no | | FK `WorkQueue.ID` |
| `TopicID` | `UNIQUEIDENTIFIER` | yes | | FK `WorkQueueTopic.ID`; null for Enqueue |
| `PartitionKey` | `NVARCHAR(200)` | yes | | |
| `TenantID` | `NVARCHAR(100)` | yes | | |
| `CorrelationID` | `NVARCHAR(200)` | yes | | |
| `Payload` | `NVARCHAR(MAX)` | no | | `DATALENGTH(Payload) <= 128000` (64,000 characters) |
| `Status` | `NVARCHAR(20)` | no | `'Pending'` | `'Pending'`, `'In Progress'`, `'Completed'`, `'Dead Letter'`, `'Cancelled'` |
| `Priority` | `INT` | no | `0` | |
| `AttemptCount` | `INT` | no | `0` | `>= 0` |
| `MaxAttempts` | `INT` | no | | `>= 1`; copied from the queue at publish |
| `RunAfter` | `DATETIMEOFFSET` | yes | | |
| `ClaimedBy` | `NVARCHAR(200)` | yes | | |
| `ClaimExpiresAt` | `DATETIMEOFFSET` | yes | | database clock |
| `FenceToken` | `INT` | no | `0` | |
| `StartedAt` | `DATETIMEOFFSET` | yes | | |
| `CompletedAt` | `DATETIMEOFFSET` | yes | | |
| `DeadLetterReason` | `NVARCHAR(30)` | yes | | `'Fatal Error'`, `'Max Attempts Exceeded'`, `'Handler Not Found'`, `'Lease Exhausted'` |
| `ErrorMessage` | `NVARCHAR(MAX)` | yes | | |

Indexes:

| Name | Definition | Purpose |
| --- | --- | --- |
| `UQ_WorkQueueItem_InFlightPartition` | unique `(QueueID, PartitionKey)` where `Status = 'In Progress' AND PartitionKey IS NOT NULL` | one in-flight item per partition, race-proof |
| `IX_WorkQueueItem_Claim` | `(QueueID, Status, Priority DESC, Sequence)` include `(PartitionKey, RunAfter, ClaimExpiresAt, AttemptCount, MaxAttempts)` | claim scan |
| `IX_WorkQueueItem_PartitionHead` | `(QueueID, PartitionKey, Sequence)` include `(Status)` where `PartitionKey IS NOT NULL AND Status IN ('Pending', 'In Progress', 'Dead Letter')` | head-of-line check |

### 3.5 `WorkQueueDeduplication`

| Column | Type | Null | Default | Rule |
| --- | --- | --- | --- | --- |
| `ID` | `UNIQUEIDENTIFIER` | no | `NEWSEQUENTIALID()` | primary key |
| `QueueID` | `UNIQUEIDENTIFIER` | no | | FK `WorkQueue.ID` |
| `DeduplicationKey` | `NVARCHAR(200)` | no | | |
| `PublishID` | `UNIQUEIDENTIFIER` | no | | the publish that owns the key |
| `ExpiresAt` | `DATETIMEOFFSET` | no | | |

Unique `(QueueID, DeduplicationKey)` — `UQ_WorkQueueDeduplication_Queue_Key`. Index `IX_WorkQueueDeduplication_ExpiresAt` on `(ExpiresAt)`.

## 4. Core TypeScript contracts — `@memberjunction/work-queue`

Public members are PascalCase (MJ convention). **Payload and manifest JSON is camelCase** — it is data,
not API surface.

### 4.1 Constants

```typescript
export const WORK_QUEUE_MAX_PAYLOAD_BYTES = 64000;
export const WORK_QUEUE_DEFAULT_DEDUP_TTL_SECONDS = 86400;
export const WORK_QUEUE_FALLBACK_HANDLER_KEY = 'WorkQueue.FallbackHandler';
export const IN_FLIGHT_PARTITION_INDEX = 'UQ_WorkQueueItem_InFlightPartition';

export const WorkQueueEntityNames = {
    Queues: 'MJ: Work Queues',
    Topics: 'MJ: Work Queue Topics',
    Subscriptions: 'MJ: Work Queue Subscriptions',
    Items: 'MJ: Work Queue Items',
    Deduplications: 'MJ: Work Queue Deduplications',
} as const;
```

### 4.2 Types

```typescript
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

export type WorkQueueItemStatus = 'Pending' | 'In Progress' | 'Completed' | 'Dead Letter' | 'Cancelled';
export type DeadLetterReason = 'Fatal Error' | 'Max Attempts Exceeded' | 'Handler Not Found' | 'Lease Exhausted';
export type DeadLetterPolicy = 'Block Partition' | 'Skip Partition';

export interface PublishOptions {
    PartitionKey?: string;
    TenantID?: string;
    CorrelationID?: string;
    DeduplicationKey?: string;
    DeduplicationTTLSeconds?: number;
    Priority?: number;
    RunAfter?: Date;
}

export interface PublishResult {
    PublishID: string;
    ItemIDs: string[];
    DuplicateQueueNames: string[];
}

export interface WorkQueueDefinition {
    ID: string;
    Name: string;
    LeaseSeconds: number;
    MaxAttempts: number;
    InitialBackoffSeconds: number;
    MaxBackoffSeconds: number;
    DeadLetterPolicy: DeadLetterPolicy;
    PurgeOnComplete: boolean;
    IsActive: boolean;
}

export interface WorkQueueTopicDefinition {
    ID: string;
    Name: string;
    AllowExternalPublish: boolean;
    IsActive: boolean;
}

export interface WorkQueueSubscriptionDefinition {
    ID: string;
    TopicID: string;
    QueueID: string;
    FilterRules: string | null;
    IsActive: boolean;
}

export interface DeliveryTarget {
    QueueID: string;
    QueueName: string;
    MaxAttempts: number;
}

export interface DeliveryEnvelope {
    PublishID: string;
    TopicID: string | null;
    TopicName: string | null;
    PartitionKey: string | null;
    TenantID: string | null;
    CorrelationID: string | null;
    PayloadJSON: string;
    Priority: number;
    RunAfter: Date | null;
    DeduplicationKey: string | null;
    DeduplicationTTLSeconds: number;
}

export interface DeliveredItem {
    ItemID: string;
    QueueID: string;
}

export interface ClaimedWorkItem {
    ItemID: string;
    PublishID: string;
    QueueID: string;
    QueueName: string;
    TopicID: string | null;
    TopicName: string | null;
    PartitionKey: string | null;
    TenantID: string | null;
    CorrelationID: string | null;
    PayloadJSON: string;
    AttemptCount: number;
    MaxAttempts: number;
    FenceToken: number;
    /** Driver-specific handle (for example an SQS receipt handle). Native leaves it undefined. */
    DriverReceipt?: string;
}

export interface WorkQueueContext<T = Record<string, unknown>> {
    readonly ItemID: string;
    readonly PublishID: string;
    readonly QueueName: string;
    readonly TopicName: string | null;
    readonly PartitionKey: string | null;
    readonly TenantID: string | null;
    readonly CorrelationID: string | null;
    readonly Payload: T;
    readonly AttemptCount: number;
    readonly MaxAttempts: number;
    readonly FenceToken: number;
    readonly ContextUser: UserInfo;
    readonly Provider: IMetadataProvider;
    /** Extends the lease. Returns false once the lease is lost; the handler must stop writing. */
    Heartbeat(): Promise<boolean>;
    readonly LeaseLost: boolean;
}

export interface WorkQueueDriverCapabilities {
    BlockPartitionDeadLetter: boolean;
    PerItemRetryDelayMaxSeconds: number;
    DelayedPublish: boolean;
    Priority: boolean;
    AtomicFanOut: boolean;
    PeekItems: boolean;
    ListBlockedPartitions: boolean;
    ReplaySingleDeadLetter: boolean;
}

export interface WorkQueueWorkerConfig {
    WorkerID: string;
    PollingIntervalMs: number;
    MaxConcurrentItems: number;
    HeartbeatMinIntervalMs: number;
}
```

### 4.3 Errors

| Class | Meaning to the worker |
| --- | --- |
| `FatalQueueError(message)` | Dead-letter now with reason `'Fatal Error'`; no retry |
| `TransientQueueError(message, RetryAfterSeconds?)` | Retry with backoff, honouring `RetryAfterSeconds` when given |
| `PayloadTooLargeError(Bytes, MaxBytes)` | Thrown by publish; nothing is delivered |
| `WorkQueueConfigurationError(message)` | Thrown for unknown or inactive topics or queues, and for options the driver cannot honour |

Any other error thrown by a handler is treated as transient.

### 4.4 Filter rules

`FilterRules` is a JSON object mapping top-level payload property names to a required value. Values are
string, number, boolean or null. A subscription matches when every rule matches by strict equality.
`null` or an empty object matches everything. Rules are evaluated in TypeScript before delivery by every
driver.

### 4.5 Handler

```typescript
export abstract class BaseWorkQueueHandler<T = Record<string, unknown>> {
    public abstract Handle(context: WorkQueueContext<T>): Promise<void>;
}
```

Handlers register with `@RegisterClass(BaseWorkQueueHandler, '<queue name>')`. When no registration
matches a queue name, the worker uses the registration keyed `WORK_QUEUE_FALLBACK_HANDLER_KEY` if one
exists, otherwise dead-letters the item with `'Handler Not Found'`.

### 4.6 Driver

```typescript
export abstract class BaseWorkQueueDriver {
    public abstract readonly DriverKey: string;
    public abstract readonly Capabilities: WorkQueueDriverCapabilities;

    public abstract Deliver(targets: DeliveryTarget[], envelope: DeliveryEnvelope, contextUser: UserInfo): Promise<DeliveredItem[]>;
    public abstract Claim(queue: WorkQueueDefinition, workerID: string, contextUser: UserInfo): Promise<ClaimedWorkItem | null>;
    public abstract Heartbeat(item: ClaimedWorkItem, workerID: string, leaseSeconds: number, contextUser: UserInfo): Promise<boolean>;
    public abstract Complete(item: ClaimedWorkItem, workerID: string, purge: boolean, contextUser: UserInfo): Promise<boolean>;
    public abstract Retry(item: ClaimedWorkItem, workerID: string, delaySeconds: number, errorMessage: string, contextUser: UserInfo): Promise<boolean>;
    public abstract DeadLetter(item: ClaimedWorkItem, workerID: string, reason: DeadLetterReason, errorMessage: string, contextUser: UserInfo): Promise<boolean>;
    public abstract ReapLeaseExhausted(contextUser: UserInfo): Promise<number>;

    /**
     * Problems that stop this driver processing the given queues. The default reports capability gaps
     * (`QueueUnsupportedReason`); cloud drivers override it to add missing-resource checks. MJServer logs
     * the result at startup, so the host never needs to import a specific driver package.
     */
    public ValidateQueues(queues: WorkQueueDefinition[], contextUser: UserInfo): Promise<string[]>;
}
```

- `Deliver` returns one entry per queue that accepted the message. Queues whose deduplication key was
  still active are omitted.
- `Heartbeat`, `Complete`, `Retry` and `DeadLetter` return `false` when this worker no longer owns the
  item (lease lost or fence token stale). They never throw for that case.
- Drivers register with `@RegisterClass(BaseWorkQueueDriver, '<DriverKey>')` and are constructed by
  `ClassFactory.CreateInstance(BaseWorkQueueDriver, key, executor, settings)` where `executor` is a
  `WorkQueueSqlExecutor` and `settings` is `Record<string, unknown>` (the `workQueue` configuration block).

| Capability | Native | AWS |
| --- | --- | --- |
| `BlockPartitionDeadLetter` | `true` | `false` |
| `PerItemRetryDelayMaxSeconds` | `2147483647` | `43200` |
| `DelayedPublish` | `true` | `false` |
| `Priority` | `true` | `false` |
| `AtomicFanOut` | `true` | `false` |
| `PeekItems` | `true` | `false` |
| `ListBlockedPartitions` | `true` | `false` |
| `ReplaySingleDeadLetter` | `true` | `false` |

A queue is **unsupported** by a driver when its `DeadLetterPolicy` is `'Block Partition'` and the driver
lacks `BlockPartitionDeadLetter`, or its `MaxBackoffSeconds` exceeds `PerItemRetryDelayMaxSeconds`.
Workers skip unsupported queues; MJServer logs `ValidateQueues` results at startup. Publishing with `RunAfter` or a
non-zero `Priority` to a driver without the matching capability throws `WorkQueueConfigurationError`.

### 4.7 SQL execution seam

`DatabaseProviderBase` satisfies this interface structurally; tests implement it with a plain object.

```typescript
import type { ExecuteSQLOptions, UserInfo } from '@memberjunction/core';
import type { DatabasePlatform, SQLDialect } from '@memberjunction/sql-dialect';

export interface WorkQueueSqlExecutor {
    readonly PlatformKey: DatabasePlatform;
    readonly MJCoreSchemaName: string;
    readonly Dialect: SQLDialect;
    QuoteIdentifier(name: string): string;
    BuildParameterPlaceholder(index: number): string;
    ExecuteSQL<T>(query: string, parameters?: unknown[], options?: ExecuteSQLOptions, contextUser?: UserInfo): Promise<Array<T>>;
}

export interface SqlStatement {
    SQL: string;
    Params: unknown[];
}
```

Rules for every SQL builder:

- Values are always bound parameters. Identifiers go through `QuoteIdentifier`; the schema is
  `MJCoreSchemaName`.
- A guarded write (`UPDATE` or `DELETE` whose `WHERE` is the ownership check) is returned bare; the store
  wraps it with `Dialect.AffectedRowCountSQL(sql, 'AffectedRows')` and treats `1` as success.
- A statement that returns rows ends with **exactly one** result set. On SQL Server, `OUTPUT` must use
  `INTO` a table variable (CodeGen tables have triggers, so bare `OUTPUT` fails with error 334).
- Time is the database clock: `SYSDATETIMEOFFSET()` on SQL Server, `now()` on PostgreSQL.

**Claim** returns zero or one row with columns `ItemID`, `PublishID`, `QueueID`, `TopicID`,
`PartitionKey`, `TenantID`, `CorrelationID`, `PayloadJSON`, `AttemptCount`, `MaxAttempts`, `FenceToken`.
The claimable predicate is design [01](01-design.md) §7. A claim that loses the in-flight race raises a
unique violation naming `IN_FLIGHT_PARTITION_INDEX`; the store maps that to "no item".

**Deliver** returns one row per accepted queue with columns `ItemID`, `QueueID`, all in one atomic
statement batch: delete that key's expired deduplication rows, insert new deduplication rows where no
active row exists, insert items for the accepted queues.

### 4.8 Metadata access

```typescript
export class WorkQueueMetadataIndex {
    constructor(queues: WorkQueueDefinition[], topics: WorkQueueTopicDefinition[], subscriptions: WorkQueueSubscriptionDefinition[]);
    public get Queues(): WorkQueueDefinition[];
    public QueueByName(name: string): WorkQueueDefinition | undefined;   // trimmed, case-insensitive
    public QueueByID(id: string): WorkQueueDefinition | undefined;       // UUID-normalised
    public TopicByName(name: string): WorkQueueTopicDefinition | undefined;
    public TopicByID(id: string): WorkQueueTopicDefinition | undefined;
    public ActiveSubscriptionsForTopic(topicID: string): WorkQueueSubscriptionDefinition[];
}

export interface WorkQueueMetadataSource {
    GetIndex(contextUser: UserInfo): Promise<WorkQueueMetadataIndex>;
}
```

`WorkQueueEngine` (a `BaseEngine`) implements `WorkQueueMetadataSource` over the three cached entities.

### 4.9 Producer and runtime

```typescript
export class WorkQueueProducer {
    constructor(driver: BaseWorkQueueDriver, metadata: WorkQueueMetadataSource, maxPayloadBytes?: number);
    public Publish<T>(topicName: string, payload: T, contextUser: UserInfo, options?: PublishOptions): Promise<PublishResult>;
    public Enqueue<T>(queueName: string, payload: T, contextUser: UserInfo, options?: PublishOptions): Promise<PublishResult>;
}

export interface WorkQueueRuntimeParts {
    Driver: BaseWorkQueueDriver;
    Metadata: WorkQueueMetadataSource;
    Producer: WorkQueueProducer;
}

export class WorkQueueRuntime extends BaseSingleton<WorkQueueRuntime> {
    public static get Instance(): WorkQueueRuntime;
    public Configure(parts: WorkQueueRuntimeParts): void;
    public Reset(): void;                             // tests and reconfiguration
    public get IsConfigured(): boolean;
    public get Driver(): BaseWorkQueueDriver;        // throws WorkQueueConfigurationError when not configured
    public get Metadata(): WorkQueueMetadataSource;
    public get Producer(): WorkQueueProducer;
}

export interface WorkQueueRuntimeOptions {
    DriverKey: string;                                // ClassFactory key, e.g. 'Native' or 'AWS'
    Executor: WorkQueueSqlExecutor;
    Settings?: Record<string, unknown>;
    Metadata?: WorkQueueMetadataSource;               // defaults to WorkQueueEngine.Instance
    MaxPayloadBytes?: number;
}

/** Throws WorkQueueConfigurationError when no driver is registered under DriverKey. */
export function CreateWorkQueueRuntimeParts(options: WorkQueueRuntimeOptions): WorkQueueRuntimeParts;
```

MJServer configures the runtime at startup. In-process code publishes with
`WorkQueueRuntime.Instance.Producer.Publish(topic, payload, contextUser, options)`.

## 5. Worker, runner, maintenance

```typescript
export type ItemOutcome =
    | { Kind: 'Completed' }
    | { Kind: 'Retried'; DelaySeconds: number }
    | { Kind: 'DeadLettered'; Reason: DeadLetterReason }
    | { Kind: 'LeaseLost' };

export class WorkQueueItemRunner {
    constructor(driver: BaseWorkQueueDriver, workerID: string, heartbeatMinIntervalMs: number, now?: () => number);
    public Run(item: ClaimedWorkItem, queue: WorkQueueDefinition, handler: BaseWorkQueueHandler | null,
               contextUser: UserInfo, provider: IMetadataProvider): Promise<ItemOutcome>;
}

export type WorkQueueHandlerResolver = (queueName: string) => BaseWorkQueueHandler | null;

export class WorkQueueWorker implements IShutdownable {
    constructor(config: WorkQueueWorkerConfig, driver: BaseWorkQueueDriver, metadata: WorkQueueMetadataSource,
                contextUser: UserInfo, provider: IMetadataProvider,
                resolveHandler?: WorkQueueHandlerResolver);   // defaults to ResolveWorkQueueHandler
    public get ShutdownName(): string;
    public get IsRunning(): boolean;
    public get InFlightCount(): number;
    public Start(): void;
    public Stop(): void;
    public Shutdown(): void;
    public PollOnce(): Promise<number>;        // items started; never throws
    public WaitForInFlight(): Promise<void>;   // resolves when every started item has settled
}

export interface MaintenanceTask {
    readonly Name: string;
    Run(contextUser: UserInfo): Promise<number>;
}

export class WorkQueueMaintenance implements IShutdownable {
    constructor(tasks: MaintenanceTask[], intervalMs: number, contextUser: UserInfo);
    public get ShutdownName(): string;
    public Start(): void;
    public Stop(): void;
    public Shutdown(): void;
    public RunOnce(): Promise<Record<string, number>>;
}
```

Maintenance tasks shipped: `ReapLeaseExhaustedTask(driver)` and `PurgeDeduplicationsTask(ledger)`;
`DefaultMaintenanceTasks(driver, executor)` returns both. `RunOnce` runs tasks in order, records `-1` for a
task that throws and still runs the rest, and returns `{}` when a pass is already running.

## 6. REST API — `/work-queue/publish`

Mounted after MJServer's unified authentication middleware. Bodies are JSON. Every endpoint checks its
scope with `CheckAPIKeyScope(req.userPayload.apiKeyId, scope, req.userPayload.userRecord)`.

| Method and path | Scope | Body | Success | Errors |
| --- | --- | --- | --- | --- |
| `POST /work-queue/publish` | `workqueue:publish` | `{ topic, payload, partitionKey?, tenantId?, correlationId?, deduplicationKey?, deduplicationTTLSeconds?, priority? }` | `202 { publishId, itemIds, duplicateQueueNames }` | `400` invalid body · `403` topic not externally publishable · `404` unknown or inactive topic · `413` payload too large |

## 7. Remote operations

| Key | Scope | Input | Output |
| --- | --- | --- | --- |
| `WorkQueue.GetQueueStats` | `workqueue:manage` | `{ queueName?: string }` | `{ supported: boolean; queues: { queueName: string; pending: number; inProgress: number; deadLetter: number; oldestPendingAt: string \| null }[] }` |
| `WorkQueue.ListBlockedPartitions` | `workqueue:manage` | `{ queueName?: string }` | `{ supported: boolean; partitions: { queueName: string; partitionKey: string; itemID: string; deadLetterReason: string \| null; errorMessage: string \| null; waitingCount: number }[] }` |
| `WorkQueue.ReplayDeadLetter` | `workqueue:manage` | `{ itemID: string }` | `{ supported: boolean; replayed: boolean }` |
| `WorkQueue.CancelItem` | `workqueue:manage` | `{ itemID: string }` | `{ supported: boolean; cancelled: boolean }` |

CodeGen names the typed bases `WorkQueueGetQueueStatsOperation`, `WorkQueueListBlockedPartitionsOperation`,
`WorkQueueReplayDeadLetterOperation`, `WorkQueueCancelItemOperation`. Each returns `supported: false`
without touching the database when the configured driver lacks the capability.

## 8. Configuration — `mj.config.cjs`

```javascript
workQueue: {
  driver: 'Native',                         // ClassFactory key of the BaseWorkQueueDriver
  workerEnabled: false,                     // run the worker and maintenance loops in this process
  systemUserEmail: 'system@memberjunction.org',
  pollingIntervalMs: 1000,
  maxConcurrentItems: 10,
  heartbeatMinIntervalMs: 5000,
  maintenanceIntervalMs: 60000,
  maxPayloadBytes: 64000,
  // aws: { region, accountId, resourcePrefix, deadLetterSuffix, waitTimeSeconds }   — plan 05
}
```

Publishing is available on every MJServer instance once the runtime is configured; `workerEnabled`
controls only whether this instance processes items.

## 9. Metadata records

| Folder | Records |
| --- | --- |
| `metadata/api-scopes` | `workqueue` (parent), `workqueue:publish`, `workqueue:manage` |
| `metadata/remote-operation-categories` | `Work Queue` |
| `metadata/remote-operations` | the four operations in §8, with type files under `types/` |
| `metadata/entity-permissions` | `Developer` role: read, create, update, delete on all five entities |
| `metadata/entities` | `TrackRecordChanges: false` and `AllowUserSearchAPI: false` on Items and Deduplications |
| `metadata/work-queues` (plan 04) | `Entity AI Action`, `AI Action` queues, seeded **inactive** (activating one routes that MJQueue task type to the work queue) |

Primary keys are generated with `uuidgen` and committed with the JSON. `sync` blocks are never
hand-written.

## 10. Conventions every implementation follows

- Compare UUIDs with `UUIDsEqual` and key maps with `NormalizeUUID` (`@memberjunction/global`).
- Pass `contextUser` to every `RunView`, `GetEntityObject` and `ExecuteSQL` call.
- No `any`. `unknown` only at trust boundaries (request bodies, parsed payloads), narrowed before use.
- Static imports only.
- Check `Save()`/`Delete()` booleans; read errors from `LatestResult?.CompleteMessage`.
- Functions stay around 30–40 lines; decompose early.

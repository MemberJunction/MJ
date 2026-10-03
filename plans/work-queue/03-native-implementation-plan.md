# Work Queue — Native Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@memberjunction/work-queue` with its database-native driver, management operations, the `/work-queue/publish` REST endpoint and MJServer wiring — verified by unit tests and an integration bundle.

**Architecture:** Five new core-schema tables hold queues, topics, subscriptions, items and deduplication keys. A driver abstraction (`BaseWorkQueueDriver`) isolates transport; the native driver implements claim, heartbeat and settle as guarded single statements with dialect-specific SQL for SQL Server and PostgreSQL. `WorkQueueProducer` resolves subscriptions and filters in TypeScript and delivers atomically; `WorkQueueWorker` claims, runs registered handlers and settles; `WorkQueueMaintenance` dead-letters exhausted leases and purges expired deduplication keys. MJServer configures a `WorkQueueRuntime` singleton at startup and mounts an authenticated publish endpoint. Staged batch ingestion is out of scope (design [01](01-design.md) §15, Path C).

**Tech Stack:** TypeScript 5.9 (ESM), Vitest 3, MemberJunction core/global/core-entities/sql-dialect, SQL Server and PostgreSQL via MJ data providers, Express + zod in MJServer, MJ CodeGen and mj-sync.

**Spec:** [`plans/work-queue/01-design.md`](01-design.md) and [`plans/work-queue/02-interfaces-and-schema.md`](02-interfaces-and-schema.md). Read both before starting.

## Global Constraints

- **Package manager:** pnpm. Run `pnpm install` at the repository root only; never inside a package; never `npm install`.
- **Per-package commands:** `cd packages/<Package> && pnpm test` and `cd packages/<Package> && pnpm run build`. Do not build with turbo from the root for single packages.
- **Internal dependency versions:** pin every `@memberjunction/*` dependency to the version in `packages/MJCore/package.json` (`6.1.0-edge.4` when this plan was written).
- **New package shape:** `"type": "module"`, build script `tsc && tsc-alias -f`, `tsconfig.json` extends `../../tsconfig.server.json`, `vitest.config.ts` merges `../../vitest.shared`, tests in `src/__tests__/*.test.ts`, extensionless relative imports.
- **Migrations:** T-SQL only, in `migrations/v6/`, named `V<YYYYMMDDHHMM>__v6.<minor>.x__<Description>.sql` using the minor of the newest file in that folder. DDL and `sp_addextendedproperty` only. Use `${flyway:defaultSchema}`, never `__mj`. **Do not create a PostgreSQL counterpart** — say in the PR description that it is deferred to the release build. Append CodeGen output after at least 50 blank lines and a comment block, then delete the standalone `CodeGen_Run_*.sql`.
- **CodeGen order for new tables:** `pnpm run mj:migrate` → `pnpm exec mj codegen --skipfiles` → append output → `pnpm exec mj sync push --dir=metadata --ci` → `pnpm exec mj codegen --skipdb`.
- **One database per agent.** Confirm `DB_DATABASE` in `.env` is not in use by another session before migrating or running CodeGen.
- **Metadata:** primary keys are the `uuidgen` values given in the tasks; never add `sync` blocks.
- **Code rules:** no `any`; `unknown` only at trust boundaries and narrowed before use; compare UUIDs with `UUIDsEqual`; pass `contextUser` to every data call; static imports only; PascalCase public members, camelCase private; functions around 30–40 lines.
- **SQL rules:** bound parameters for every value; identifiers through `QuoteIdentifier`; guarded writes wrapped by `Dialect.AffectedRowCountSQL`; row-returning SQL Server batches produce exactly one result set and use `OUTPUT … INTO` a table variable; database clock only.

---

## Task overview

| # | Task | Deliverable |
| --- | --- | --- |
| 1 | Schema, CodeGen, entity metadata, permissions, API scopes | Five entities generated and pushed |
| 2 | Package scaffold, constants, types, errors, payload | `@memberjunction/work-queue` builds; payload tests pass |
| 3 | Filter rules, backoff, capability gating | Pure helpers tested |
| 4 | Metadata index | Lookups tested |
| 5 | SQL helpers and SQL Server work-queue SQL | Statement shapes tested |
| 6 | PostgreSQL work-queue SQL | Statement shapes tested |
| 7 | Driver contract, deduplication SQL, native driver, ledger | Driver behaviour tested with a recording executor |
| 8 | Engine and producer | Publish and enqueue tested |
| 9 | Handler resolution and item runner | Outcome mapping tested |
| 10 | Worker loop | Concurrency and gating tested |
| 11 | Runtime and maintenance | Configuration and maintenance tasks tested |
| 12 | Admin SQL and remote operations | Operations tested; metadata pushed |
| 13 | MJServer configuration and host | Startup wiring tested |
| 14 | REST publish request parsing and router | Parsing and mapping tested; router mounted |
| 15 | ServerBootstrap dependency, manifest, build | Full build green |
| 16 | Integration bundle `work-queue` (IT87) | Runs against a live database |
| 17 | Package README | Documentation |

## Pre-flight

- [ ] Branch from the latest `next`: `git fetch origin && git switch -c feat/work-queue origin/next`
- [ ] Confirm the database in `.env` is yours alone (see Global Constraints).
- [ ] `pnpm install` at the root; `cd packages/MJCore && pnpm test` passes (baseline health check).

## File structure

```
migrations/v6/V<ts>__v6.<minor>.x__Add_Work_Queue_Schema.sql                      Task 1

metadata/
  entities/.work-queue-entities.json                                             Task 1
  entity-permissions/.work-queue-permissions.json                                Task 1
  api-scopes/.workqueue-scopes.json                                              Task 1
  remote-operation-categories/.work-queue-category.json                          Task 12
  remote-operations/.work-queue-operations.json                                  Task 12
  remote-operations/types/work-queue-*.ts (8 files)                              Task 12

packages/WorkQueue/
  package.json · tsconfig.json · vitest.config.ts                                Task 2
  README.md                                                                      Task 17
  src/index.ts                                                                   Task 2, extended by later tasks
  src/constants.ts · src/types.ts · src/errors.ts · src/payload.ts               Task 2
  src/filterRules.ts · src/backoff.ts · src/capabilities.ts                      Task 3
  src/metadata/WorkQueueMetadataIndex.ts                                         Task 4
  src/metadata/WorkQueueEngine.ts                                                Task 8
  src/sql/sqlExecution.ts · src/sql/SqlParamList.ts                              Task 5
  src/sql/WorkQueueSqlBuilder.ts · src/sql/SqlServerWorkQueueSql.ts              Task 5
  src/sql/PostgreSQLWorkQueueSql.ts                                              Task 6
  src/sql/DeduplicationSqlBuilder.ts · SqlServerDeduplicationSql.ts · PostgreSQLDeduplicationSql.ts   Task 7
  src/sql/CreateSqlBuilders.ts                                                   Task 7
  src/BaseWorkQueueDriver.ts · src/native/NativeWorkQueueDriver.ts               Task 7
  src/ledger/DeduplicationLedger.ts                                              Task 7
  src/WorkQueueProducer.ts                                                       Task 8
  src/BaseWorkQueueHandler.ts · src/handlers/ResolveWorkQueueHandler.ts          Task 9
  src/worker/WorkQueueItemRunner.ts                                              Task 9
  src/worker/WorkQueueWorker.ts                                                  Task 10
  src/WorkQueueRuntime.ts                                                        Task 11
  src/maintenance/WorkQueueMaintenance.ts · src/maintenance/tasks.ts             Task 11
  src/sql/AdminSql.ts                                                            Task 12
  src/admin/WorkQueueAdmin.ts · src/operations/WorkQueueOperations.ts            Task 12
  src/__tests__/fakes.ts                                                         Task 5, extended by later tasks
  src/__tests__/*.test.ts                                                        every code task

packages/MJServer/
  package.json                                                                   Task 13
  src/config.ts                                                                  Task 13
  src/services/WorkQueueHost.ts · src/__tests__/WorkQueueHost.test.ts            Task 13
  src/rest/workQueueRequests.ts · src/__tests__/workQueueRequests.test.ts        Task 14
  src/rest/WorkQueueRouter.ts                                                    Task 14
  src/index.ts                                                                   Tasks 13 and 14

packages/ServerBootstrap/package.json                                            Task 15

packages/TestingFramework/integration-test-suite/
  package.json · src/index.ts · src/__tests__/check-registry.test.ts             Task 16
  src/checks/work-queue.checks.ts                                                Task 16
metadata-optional/integration-test/tests/integration/.IT87-work-queue.json       Task 16
metadata-optional/integration-test/test-suites/.integration-suite.json           Task 16
```

---

### Task 1: Schema, CodeGen, entity metadata, permissions and API scopes

**Files:**
- Create: `migrations/v6/V<ts>__v6.<minor>.x__Add_Work_Queue_Schema.sql`
- Create: `metadata/entities/.work-queue-entities.json`
- Create: `metadata/entity-permissions/.work-queue-permissions.json`
- Create: `metadata/api-scopes/.workqueue-scopes.json`
- Generated (commit, never edit): `packages/MJCoreEntities/src/generated/**`, `packages/MJServer/src/generated/**`

**Interfaces:**
- Consumes: nothing.
- Produces: entities `MJ: Work Queues`, `MJ: Work Queue Topics`, `MJ: Work Queue Subscriptions`, `MJ: Work Queue Items`, `MJ: Work Queue Deduplications` with generated classes `MJWorkQueueEntity`, `MJWorkQueueTopicEntity`, `MJWorkQueueSubscriptionEntity`, `MJWorkQueueItemEntity`, `MJWorkQueueDeduplicationEntity`; API scopes `workqueue`, `workqueue:publish`, `workqueue:manage`.

- [ ] **Step 1: Choose the file name**

Run:
```bash
ls migrations/v6 | grep -v CodeGen_Run | tail -1
date -u +%Y%m%d%H%M
```
Use the minor from the newest file (for example `v6.1.x`) and the timestamp printed. The file is
`migrations/v6/V<timestamp>__v6.<minor>.x__Add_Work_Queue_Schema.sql`.

- [ ] **Step 2: Write the migration**

```sql
-- ============================================================================
-- Work Queue — schema
-- Design: plans/work-queue/01-design.md · Contract: plans/work-queue/02-interfaces-and-schema.md
-- ============================================================================
-- Additive only: five new tables, their constraints, four non-FK indexes, and
-- descriptions. CodeGen owns __mj_CreatedAt/__mj_UpdatedAt, FK indexes, views,
-- procedures, EntityField rows and generated classes. DDL + extended properties
-- ONLY, per migrations/CLAUDE.md. PostgreSQL counterpart deferred to release build.
-- ============================================================================

SET NOCOUNT ON;
GO

-- ---------------------------------------------------------------------------
-- WorkQueue
-- ---------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[WorkQueue] (
    [ID] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_WorkQueue_ID] DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(100) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [LeaseSeconds] INT NOT NULL CONSTRAINT [DF_WorkQueue_LeaseSeconds] DEFAULT 300,
    [MaxAttempts] INT NOT NULL CONSTRAINT [DF_WorkQueue_MaxAttempts] DEFAULT 5,
    [InitialBackoffSeconds] INT NOT NULL CONSTRAINT [DF_WorkQueue_InitialBackoffSeconds] DEFAULT 10,
    [MaxBackoffSeconds] INT NOT NULL CONSTRAINT [DF_WorkQueue_MaxBackoffSeconds] DEFAULT 3600,
    [DeadLetterPolicy] NVARCHAR(20) NOT NULL CONSTRAINT [DF_WorkQueue_DeadLetterPolicy] DEFAULT N'Block Partition',
    [PurgeOnComplete] BIT NOT NULL CONSTRAINT [DF_WorkQueue_PurgeOnComplete] DEFAULT 1,
    [IsActive] BIT NOT NULL CONSTRAINT [DF_WorkQueue_IsActive] DEFAULT 1,
    CONSTRAINT [PK_WorkQueue] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_WorkQueue_Name] UNIQUE ([Name]),
    CONSTRAINT [CK_WorkQueue_LeaseSeconds] CHECK ([LeaseSeconds] >= 10),
    CONSTRAINT [CK_WorkQueue_MaxAttempts] CHECK ([MaxAttempts] >= 1),
    CONSTRAINT [CK_WorkQueue_InitialBackoffSeconds] CHECK ([InitialBackoffSeconds] >= 0),
    CONSTRAINT [CK_WorkQueue_MaxBackoffSeconds] CHECK ([MaxBackoffSeconds] >= [InitialBackoffSeconds]),
    CONSTRAINT [CK_WorkQueue_DeadLetterPolicy] CHECK ([DeadLetterPolicy] IN (N'Block Partition', N'Skip Partition'))
);
GO

-- ---------------------------------------------------------------------------
-- WorkQueueTopic
-- ---------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[WorkQueueTopic] (
    [ID] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_WorkQueueTopic_ID] DEFAULT NEWSEQUENTIALID(),
    [Name] NVARCHAR(200) NOT NULL,
    [Description] NVARCHAR(MAX) NULL,
    [AllowExternalPublish] BIT NOT NULL CONSTRAINT [DF_WorkQueueTopic_AllowExternalPublish] DEFAULT 0,
    [IsActive] BIT NOT NULL CONSTRAINT [DF_WorkQueueTopic_IsActive] DEFAULT 1,
    CONSTRAINT [PK_WorkQueueTopic] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [UQ_WorkQueueTopic_Name] UNIQUE ([Name])
);
GO

-- ---------------------------------------------------------------------------
-- WorkQueueSubscription
-- ---------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[WorkQueueSubscription] (
    [ID] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_WorkQueueSubscription_ID] DEFAULT NEWSEQUENTIALID(),
    [TopicID] UNIQUEIDENTIFIER NOT NULL,
    [QueueID] UNIQUEIDENTIFIER NOT NULL,
    [FilterRules] NVARCHAR(MAX) NULL,
    [IsActive] BIT NOT NULL CONSTRAINT [DF_WorkQueueSubscription_IsActive] DEFAULT 1,
    CONSTRAINT [PK_WorkQueueSubscription] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_WorkQueueSubscription_Topic] FOREIGN KEY ([TopicID]) REFERENCES [${flyway:defaultSchema}].[WorkQueueTopic] ([ID]),
    CONSTRAINT [FK_WorkQueueSubscription_Queue] FOREIGN KEY ([QueueID]) REFERENCES [${flyway:defaultSchema}].[WorkQueue] ([ID]),
    CONSTRAINT [UQ_WorkQueueSubscription_Topic_Queue] UNIQUE ([TopicID], [QueueID])
);
GO

-- ---------------------------------------------------------------------------
-- WorkQueueItem
-- ---------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[WorkQueueItem] (
    [ID] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_WorkQueueItem_ID] DEFAULT NEWSEQUENTIALID(),
    [Sequence] BIGINT IDENTITY(1, 1) NOT NULL,
    [PublishID] UNIQUEIDENTIFIER NOT NULL,
    [QueueID] UNIQUEIDENTIFIER NOT NULL,
    [TopicID] UNIQUEIDENTIFIER NULL,
    [PartitionKey] NVARCHAR(200) NULL,
    [TenantID] NVARCHAR(100) NULL,
    [CorrelationID] NVARCHAR(200) NULL,
    [Payload] NVARCHAR(MAX) NOT NULL,
    [Status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_WorkQueueItem_Status] DEFAULT N'Pending',
    [Priority] INT NOT NULL CONSTRAINT [DF_WorkQueueItem_Priority] DEFAULT 0,
    [AttemptCount] INT NOT NULL CONSTRAINT [DF_WorkQueueItem_AttemptCount] DEFAULT 0,
    [MaxAttempts] INT NOT NULL,
    [RunAfter] DATETIMEOFFSET NULL,
    [ClaimedBy] NVARCHAR(200) NULL,
    [ClaimExpiresAt] DATETIMEOFFSET NULL,
    [FenceToken] INT NOT NULL CONSTRAINT [DF_WorkQueueItem_FenceToken] DEFAULT 0,
    [StartedAt] DATETIMEOFFSET NULL,
    [CompletedAt] DATETIMEOFFSET NULL,
    [DeadLetterReason] NVARCHAR(30) NULL,
    [ErrorMessage] NVARCHAR(MAX) NULL,
    CONSTRAINT [PK_WorkQueueItem] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_WorkQueueItem_Queue] FOREIGN KEY ([QueueID]) REFERENCES [${flyway:defaultSchema}].[WorkQueue] ([ID]),
    CONSTRAINT [FK_WorkQueueItem_Topic] FOREIGN KEY ([TopicID]) REFERENCES [${flyway:defaultSchema}].[WorkQueueTopic] ([ID]),
    CONSTRAINT [CK_WorkQueueItem_Payload] CHECK (DATALENGTH([Payload]) <= 128000),
    CONSTRAINT [CK_WorkQueueItem_Status] CHECK ([Status] IN (N'Pending', N'In Progress', N'Completed', N'Dead Letter', N'Cancelled')),
    CONSTRAINT [CK_WorkQueueItem_AttemptCount] CHECK ([AttemptCount] >= 0),
    CONSTRAINT [CK_WorkQueueItem_MaxAttempts] CHECK ([MaxAttempts] >= 1),
    CONSTRAINT [CK_WorkQueueItem_DeadLetterReason] CHECK ([DeadLetterReason] IS NULL OR [DeadLetterReason] IN (N'Fatal Error', N'Max Attempts Exceeded', N'Handler Not Found', N'Lease Exhausted'))
);
GO

CREATE UNIQUE NONCLUSTERED INDEX [UQ_WorkQueueItem_InFlightPartition]
    ON [${flyway:defaultSchema}].[WorkQueueItem] ([QueueID], [PartitionKey])
    WHERE [Status] = N'In Progress' AND [PartitionKey] IS NOT NULL;
GO

CREATE NONCLUSTERED INDEX [IX_WorkQueueItem_Claim]
    ON [${flyway:defaultSchema}].[WorkQueueItem] ([QueueID], [Status], [Priority] DESC, [Sequence])
    INCLUDE ([PartitionKey], [RunAfter], [ClaimExpiresAt], [AttemptCount], [MaxAttempts]);
GO

CREATE NONCLUSTERED INDEX [IX_WorkQueueItem_PartitionHead]
    ON [${flyway:defaultSchema}].[WorkQueueItem] ([QueueID], [PartitionKey], [Sequence])
    INCLUDE ([Status])
    WHERE [PartitionKey] IS NOT NULL AND [Status] IN (N'Pending', N'In Progress', N'Dead Letter');
GO

-- ---------------------------------------------------------------------------
-- WorkQueueDeduplication
-- ---------------------------------------------------------------------------
CREATE TABLE [${flyway:defaultSchema}].[WorkQueueDeduplication] (
    [ID] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_WorkQueueDeduplication_ID] DEFAULT NEWSEQUENTIALID(),
    [QueueID] UNIQUEIDENTIFIER NOT NULL,
    [DeduplicationKey] NVARCHAR(200) NOT NULL,
    [PublishID] UNIQUEIDENTIFIER NOT NULL,
    [ExpiresAt] DATETIMEOFFSET NOT NULL,
    CONSTRAINT [PK_WorkQueueDeduplication] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_WorkQueueDeduplication_Queue] FOREIGN KEY ([QueueID]) REFERENCES [${flyway:defaultSchema}].[WorkQueue] ([ID]),
    CONSTRAINT [UQ_WorkQueueDeduplication_Queue_Key] UNIQUE ([QueueID], [DeduplicationKey])
);
GO

CREATE NONCLUSTERED INDEX [IX_WorkQueueDeduplication_ExpiresAt]
    ON [${flyway:defaultSchema}].[WorkQueueDeduplication] ([ExpiresAt]);
GO

-- ===========================================================================
-- Descriptions
-- ===========================================================================
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A named consumer pipeline with its own lease, retry and dead-letter settings. One handler class, registered with BaseWorkQueueHandler under the queue Name, processes its items.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueue';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique queue name. Handlers register with @RegisterClass(BaseWorkQueueHandler, Name).',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueue', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What this queue processes and who owns it.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueue', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Seconds a claim lasts before another worker may take the item over, unless the handler renews it with a heartbeat. Measured on the database clock.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueue', @level2type=N'COLUMN', @level2name=N'LeaseSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Claims allowed per item, including takeovers after an expired lease, before the item is dead-lettered. Copied onto each item at publish.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueue', @level2type=N'COLUMN', @level2name=N'MaxAttempts';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Delay before the first retry, in seconds. Each later retry doubles the delay, up to MaxBackoffSeconds.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueue', @level2type=N'COLUMN', @level2name=N'InitialBackoffSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Upper bound on the retry delay, in seconds.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueue', @level2type=N'COLUMN', @level2name=N'MaxBackoffSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Block Partition: a dead-lettered item halts later items with the same PartitionKey until it is replayed or cancelled. Skip Partition: later items continue.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueue', @level2type=N'COLUMN', @level2name=N'DeadLetterPolicy';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, completed items are deleted immediately instead of kept with Status Completed.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueue', @level2type=N'COLUMN', @level2name=N'PurgeOnComplete';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Inactive queues accept no deliveries and are not processed.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueue', @level2type=N'COLUMN', @level2name=N'IsActive';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A named event stream. Publishing to a topic delivers one item to every active, matching subscription.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique topic name, for example link.clicked.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What the topic represents and who publishes to it.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, API-key callers may publish to this topic through POST /work-queue/publish. In-process code may publish to any active topic.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'AllowExternalPublish';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Inactive topics reject publishes.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'IsActive';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Connects a topic to a queue, with an optional payload filter.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional JSON object of top-level payload property names to required values. Every rule must match by strict equality for the subscription to receive the message. Null matches every message.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'FilterRules';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Inactive subscriptions receive nothing.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'IsActive';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'One unit of work in one queue, created by a publish or enqueue and settled by a worker.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Publish order. Items sharing a QueueID and PartitionKey are processed in ascending Sequence.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'Sequence';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Identifier shared by every item created by one publish.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'PublishID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Items in the same queue with the same PartitionKey are processed one at a time, in Sequence order. Null means no ordering constraint.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'PartitionKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Tenant the work belongs to. Routing metadata, not an authorization boundary.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'TenantID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Caller-supplied identifier for tracing related work.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'CorrelationID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON message, at most 64,000 characters. Large data is referenced rather than embedded.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'Payload';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Pending: waiting to be claimed. In Progress: claimed under a lease. Completed: the handler succeeded. Dead Letter: failed permanently. Cancelled: withdrawn by an operator.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Higher values are claimed first, subject to partition order.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'Priority';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Number of claims so far, including takeovers after an expired lease.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'AttemptCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Attempts allowed before dead-lettering, copied from the queue at publish.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'MaxAttempts';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Earliest time the item may be claimed. Set by delayed publishes and by retry backoff.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'RunAfter';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Worker instance holding the current lease.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'ClaimedBy';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the current lease expires, on the database clock.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'ClaimExpiresAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Incremented on every claim. Settling writes must present the current value, so a worker that lost its lease cannot overwrite the new owner.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'FenceToken';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the most recent claim started.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'StartedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the item reached Completed, Dead Letter or Cancelled.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'CompletedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Why the item was dead-lettered.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'DeadLetterReason';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Most recent handler error.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueItem', @level2type=N'COLUMN', @level2name=N'ErrorMessage';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active deduplication keys per queue. A publish carrying a key that is still active for a queue creates no item in that queue.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Caller-supplied key identifying one logical message.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication', @level2type=N'COLUMN', @level2name=N'DeduplicationKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'The publish that owns the key.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication', @level2type=N'COLUMN', @level2name=N'PublishID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the key stops suppressing duplicates. Expired rows are purged by maintenance.',
 @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication', @level2type=N'COLUMN', @level2name=N'ExpiresAt';
GO

```

- [ ] **Step 3: Apply the migration**

Run: `pnpm run mj:migrate`
Expected: the new migration is applied with no errors.

- [ ] **Step 4: Run CodeGen against the database only**

Run: `pnpm exec mj codegen --skipfiles`
Expected: completes and writes a `migrations/v6/CodeGen_Run_*.sql` file.

- [ ] **Step 5: Append the CodeGen output to the migration**

Append at least 50 blank lines to the migration, then this block, then the full contents of the
`CodeGen_Run_*.sql` file. Then delete the `CodeGen_Run_*.sql` file.

```sql
/* ===========================================================================
   EVERYTHING BELOW THIS BLOCK WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL
   ---------------------------------------------------------------------------
   Contents: Entity and EntityField inserts, regenerated base views,
   spCreate/spUpdate/spDelete procedures, permission grants, and extended
   properties for the five work-queue tables above.
   DO NOT EDIT BY HAND. If the DDL above changes, re-run CodeGen and replace
   this entire generated section.
   =========================================================================== */
```

Run: `.github/scripts/check-migration-entityfield-sequence.sh`
Expected: exits 0 (no literal `Sequence` values in the appended EntityField inserts).

- [ ] **Step 6: Write the entity setting overrides**

`metadata/entities/.work-queue-entities.json`:

```json
[
  {
    "_comments": ["High-write claim table: change tracking would record every claim, heartbeat and settle"],
    "primaryKey": { "ID": "@lookup:MJ: Entities.Name=MJ: Work Queue Items" },
    "fields": { "Name": "MJ: Work Queue Items", "TrackRecordChanges": false, "AllowUserSearchAPI": false }
  },
  {
    "_comments": ["High-write, short-lived deduplication keys"],
    "primaryKey": { "ID": "@lookup:MJ: Entities.Name=MJ: Work Queue Deduplications" },
    "fields": { "Name": "MJ: Work Queue Deduplications", "TrackRecordChanges": false, "AllowUserSearchAPI": false }
  }
]
```

- [ ] **Step 7: Write the entity permissions**

`metadata/entity-permissions/.work-queue-permissions.json`:

```json
[
  { "fields": { "EntityID": "@lookup:MJ: Entities.Name=MJ: Work Queues", "RoleID": "@lookup:MJ: Roles.Name=Developer", "CanRead": true, "CanCreate": true, "CanUpdate": true, "CanDelete": true }, "primaryKey": { "ID": "0F6420A5-25D7-4B0F-B8EB-2CACAB21D291" } },
  { "fields": { "EntityID": "@lookup:MJ: Entities.Name=MJ: Work Queue Topics", "RoleID": "@lookup:MJ: Roles.Name=Developer", "CanRead": true, "CanCreate": true, "CanUpdate": true, "CanDelete": true }, "primaryKey": { "ID": "612C0650-037C-4535-8A63-CCAAA05A94FB" } },
  { "fields": { "EntityID": "@lookup:MJ: Entities.Name=MJ: Work Queue Subscriptions", "RoleID": "@lookup:MJ: Roles.Name=Developer", "CanRead": true, "CanCreate": true, "CanUpdate": true, "CanDelete": true }, "primaryKey": { "ID": "8AC63FE0-FFBA-487B-B536-A992F8A0E689" } },
  { "fields": { "EntityID": "@lookup:MJ: Entities.Name=MJ: Work Queue Items", "RoleID": "@lookup:MJ: Roles.Name=Developer", "CanRead": true, "CanCreate": true, "CanUpdate": true, "CanDelete": true }, "primaryKey": { "ID": "BDB80C72-0CE8-48DE-A748-355341FC201E" } },
  { "fields": { "EntityID": "@lookup:MJ: Entities.Name=MJ: Work Queue Deduplications", "RoleID": "@lookup:MJ: Roles.Name=Developer", "CanRead": true, "CanCreate": true, "CanUpdate": true, "CanDelete": true }, "primaryKey": { "ID": "829C7B71-E80F-484E-A296-DB4FADD1D6A1" } }
]
```

- [ ] **Step 8: Write the API scopes**

`metadata/api-scopes/.workqueue-scopes.json`:

```json
[
  {
    "fields": {
      "Name": "workqueue",
      "FullPath": "workqueue",
      "ParentID": null,
      "Category": "Work Queue",
      "Description": "Parent scope for the durable work queue.",
      "ResourceType": null,
      "IsActive": true,
      "UIConfig": { "icon": "fa-solid fa-layer-group", "color": "#0e7490" }
    },
    "primaryKey": { "ID": "D470F70E-2C14-481F-AB33-61D6E684E836" }
  },
  {
    "fields": {
      "Name": "publish",
      "FullPath": "workqueue:publish",
      "ParentID": "@lookup:MJ: API Scopes.FullPath=workqueue",
      "Category": "Work Queue",
      "Description": "Publish messages to externally publishable topics through POST /work-queue/publish.",
      "ResourceType": null,
      "IsActive": true
    },
    "primaryKey": { "ID": "2B9DC5AC-5545-4B44-93EA-3533B8AC534B" }
  },
  {
    "fields": {
      "Name": "manage",
      "FullPath": "workqueue:manage",
      "ParentID": "@lookup:MJ: API Scopes.FullPath=workqueue",
      "Category": "Work Queue",
      "Description": "Inspect queues and replay or cancel items through the WorkQueue remote operations.",
      "ResourceType": null,
      "IsActive": true
    },
    "primaryKey": { "ID": "9F1A5625-DB6F-4E76-AF73-B878C7FAEDEF" }
  }
]
```

- [ ] **Step 9: Push the metadata, then generate files**

Run: `pnpm exec mj sync push --dir=metadata --ci --dry-run`
Expected: shows 2 entity updates, 5 entity permission creates, 3 API scope creates; no lookup failures.

Run: `pnpm exec mj sync push --dir=metadata --ci`
Expected: completes without errors.

Run: `pnpm exec mj codegen --skipdb`
Expected: completes; regenerates TypeScript only.

- [ ] **Step 10: Verify the generated entity names**

Run:
```bash
grep -oE "@RegisterClass\(BaseEntity, 'MJ: Work Queue[^']*'\)" packages/MJCoreEntities/src/generated/entities/__mj.ts | sort
```
Expected — exactly these five lines:
```
@RegisterClass(BaseEntity, 'MJ: Work Queue Deduplications')
@RegisterClass(BaseEntity, 'MJ: Work Queue Items')
@RegisterClass(BaseEntity, 'MJ: Work Queue Subscriptions')
@RegisterClass(BaseEntity, 'MJ: Work Queue Topics')
@RegisterClass(BaseEntity, 'MJ: Work Queues')
```
If any name differs, record the actual names; Task 2 uses them in `WorkQueueEntityNames`.

Run: `cd packages/MJCoreEntities && pnpm run build`
Expected: builds.

- [ ] **Step 11: Commit**

```bash
git add migrations/v6/*Add_Work_Queue_Schema.sql metadata/entities/.work-queue-entities.json \
  metadata/entity-permissions/.work-queue-permissions.json metadata/api-scopes/.workqueue-scopes.json \
  packages/MJCoreEntities/src/generated packages/MJServer/src/generated
git commit -m "feat(work-queue): schema, entities, permissions and API scopes"
```

---

### Task 2: Package scaffold, constants, types, errors and payload

**Files:**
- Create: `packages/WorkQueue/package.json`, `packages/WorkQueue/tsconfig.json`, `packages/WorkQueue/vitest.config.ts`
- Create: `packages/WorkQueue/src/constants.ts`, `src/types.ts`, `src/errors.ts`, `src/payload.ts`, `src/index.ts`
- Test: `packages/WorkQueue/src/__tests__/payload.test.ts`

**Interfaces:**
- Consumes: entity names verified in Task 1.
- Produces: constants and types exactly as in spec 02 §4.1–4.3; `SerializePayload(payload: unknown, maxBytes?: number): string`; `ParsePayload<T>(payloadJSON: string): T`; error classes `FatalQueueError`, `TransientQueueError`, `PayloadTooLargeError`, `WorkQueueConfigurationError`.

- [ ] **Step 1: Create the package files**

`packages/WorkQueue/package.json`:

```json
{
  "name": "@memberjunction/work-queue",
  "type": "module",
  "version": "6.1.0-edge.4",
  "description": "MemberJunction: durable work queue",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["/dist"],
  "scripts": {
    "build": "tsc && tsc-alias -f",
    "watch": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "author": "MemberJunction.com",
  "license": "BUSL-1.1",
  "dependencies": {
    "@memberjunction/core": "6.1.0-edge.4",
    "@memberjunction/core-entities": "6.1.0-edge.4",
    "@memberjunction/global": "6.1.0-edge.4",
    "@memberjunction/sql-dialect": "6.1.0-edge.4"
  },
  "devDependencies": {
    "@types/node": "24.10.11",
    "typescript": "^5.9.3",
    "vitest": "^3.1.1"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/MemberJunction/MJ"
  }
}
```

`packages/WorkQueue/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.server.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "src/__tests__/**", "src/**/*.test.ts", "vitest.config.ts"]
}
```

`packages/WorkQueue/vitest.config.ts`:

```typescript
import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../vitest.shared';

export default mergeConfig(sharedConfig, defineProject({
    test: {
        environment: 'node',
    },
}));
```

Run: `pnpm install` (repository root)
Expected: installs; `@memberjunction/work-queue` appears as a workspace package.

- [ ] **Step 2: Write `src/constants.ts`**

```typescript
/** Maximum UTF-8 size of a serialised payload. Larger data is referenced (claim check). */
export const WORK_QUEUE_MAX_PAYLOAD_BYTES = 64000;

/** Default window for a publish deduplication key, in seconds. */
export const WORK_QUEUE_DEFAULT_DEDUP_TTL_SECONDS = 86400;

/** ClassFactory key of the handler used when no handler is registered for a queue name. */
export const WORK_QUEUE_FALLBACK_HANDLER_KEY = 'WorkQueue.FallbackHandler';

/** Unique index enforcing one in-flight item per (queue, partition). */
export const IN_FLIGHT_PARTITION_INDEX = 'UQ_WorkQueueItem_InFlightPartition';

/** Entity names. If CodeGen produced different names in Task 1, change them here only. */
export const WorkQueueEntityNames = {
    Queues: 'MJ: Work Queues',
    Topics: 'MJ: Work Queue Topics',
    Subscriptions: 'MJ: Work Queue Subscriptions',
    Items: 'MJ: Work Queue Items',
    Deduplications: 'MJ: Work Queue Deduplications',
} as const;
```

- [ ] **Step 3: Write `src/types.ts`**

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

- [ ] **Step 4: Write `src/errors.ts`**

```typescript
/** The handler failed in a way retrying cannot fix. The item is dead-lettered immediately. */
export class FatalQueueError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FatalQueueError';
    }
}

/** The handler failed in a way that may succeed later. The item is retried with backoff. */
export class TransientQueueError extends Error {
    public readonly RetryAfterSeconds?: number;

    constructor(message: string, retryAfterSeconds?: number) {
        super(message);
        this.name = 'TransientQueueError';
        this.RetryAfterSeconds = retryAfterSeconds;
    }
}

/** A publish exceeded the payload cap. Nothing was delivered. */
export class PayloadTooLargeError extends Error {
    public readonly Bytes: number;
    public readonly MaxBytes: number;

    constructor(bytes: number, maxBytes: number) {
        super(`Payload is ${bytes} bytes; the maximum is ${maxBytes}`);
        this.name = 'PayloadTooLargeError';
        this.Bytes = bytes;
        this.MaxBytes = maxBytes;
    }
}

/** Unknown or inactive topic or queue, or an option the driver cannot honour. */
export class WorkQueueConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WorkQueueConfigurationError';
    }
}
```

- [ ] **Step 5: Write the failing payload test**

`packages/WorkQueue/src/__tests__/payload.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SerializePayload, ParsePayload } from '../payload';
import { PayloadTooLargeError } from '../errors';

describe('SerializePayload', () => {
    it('returns compact JSON for a payload under the cap', () => {
        expect(SerializePayload({ a: 1, b: 'x' }, 100)).toBe('{"a":1,"b":"x"}');
    });

    it('measures UTF-8 bytes, not characters', () => {
        // "é" is two bytes in UTF-8, so the JSON text "éé" (with quotes) is six bytes.
        expect(() => SerializePayload('éé', 5)).toThrow(PayloadTooLargeError);
        expect(SerializePayload('éé', 6)).toBe('"éé"');
    });

    it('reports the measured size and the cap on the error', () => {
        let caught: unknown;
        try {
            SerializePayload({ text: 'x'.repeat(50) }, 10);
        } catch (e) {
            caught = e;
        }
        expect(caught).toBeInstanceOf(PayloadTooLargeError);
        const error = caught as PayloadTooLargeError;
        expect(error.MaxBytes).toBe(10);
        expect(error.Bytes).toBeGreaterThan(10);
    });

    it('rejects undefined, which JSON cannot represent', () => {
        expect(() => SerializePayload(undefined, 100)).toThrow('Payload must be JSON-serialisable');
    });

    it('uses the 64,000-byte cap by default', () => {
        expect(() => SerializePayload('x'.repeat(64000))).toThrow(PayloadTooLargeError);
        expect(SerializePayload('x'.repeat(63998))).toHaveLength(64000);
    });
});

describe('ParsePayload', () => {
    it('round-trips a serialised payload', () => {
        expect(ParsePayload<{ n: number }>(SerializePayload({ n: 5 }, 100))).toEqual({ n: 5 });
    });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd packages/WorkQueue && pnpm test payload`
Expected: FAIL — `Failed to resolve import "../payload"`.

- [ ] **Step 7: Write `src/payload.ts`**

```typescript
import { WORK_QUEUE_MAX_PAYLOAD_BYTES } from './constants';
import { PayloadTooLargeError } from './errors';

/**
 * Serialises a payload to JSON and enforces the size cap in UTF-8 bytes — the unit cloud
 * transports measure, and the one that keeps every driver interchangeable.
 */
export function SerializePayload(payload: unknown, maxBytes: number = WORK_QUEUE_MAX_PAYLOAD_BYTES): string {
    const json = JSON.stringify(payload);
    if (json === undefined) {
        throw new Error('Payload must be JSON-serialisable');
    }
    const bytes = Buffer.byteLength(json, 'utf8');
    if (bytes > maxBytes) {
        throw new PayloadTooLargeError(bytes, maxBytes);
    }
    return json;
}

/** Parses a stored payload. The caller owns validating the shape. */
export function ParsePayload<T>(payloadJSON: string): T {
    return JSON.parse(payloadJSON) as T;
}
```

- [ ] **Step 8: Write `src/index.ts`**

```typescript
export * from './constants';
export * from './types';
export * from './errors';
export * from './payload';
```

- [ ] **Step 9: Run the tests and build**

Run: `cd packages/WorkQueue && pnpm test payload`
Expected: PASS — 6 tests.

Run: `cd packages/WorkQueue && pnpm run build`
Expected: builds with no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/WorkQueue pnpm-lock.yaml
git commit -m "feat(work-queue): package scaffold, contracts, errors and payload cap"
```

---

### Task 3: Filter rules, backoff and capability gating

**Files:**
- Create: `packages/WorkQueue/src/filterRules.ts`, `src/backoff.ts`, `src/capabilities.ts`
- Modify: `packages/WorkQueue/src/index.ts`
- Test: `packages/WorkQueue/src/__tests__/filterRules.test.ts`, `backoff.test.ts`, `capabilities.test.ts`

**Interfaces:**
- Consumes: `WorkQueueDefinition`, `WorkQueueDriverCapabilities`, `PublishOptions`, `WorkQueueConfigurationError` (Task 2).
- Produces: `type FilterValue`, `type FilterRules`, `ParseFilterRules(json: string | null): FilterRules | null`, `MatchesFilterRules(payload: unknown, rules: FilterRules | null): boolean`, `ComputeBackoffSeconds(attemptCount: number, initialSeconds: number, maxSeconds: number, retryAfterSeconds?: number): number`, `QueueUnsupportedReason(queue, capabilities): string | null`, `AssertPublishSupported(options, capabilities): void`, `NATIVE_DRIVER_CAPABILITIES`.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/src/__tests__/filterRules.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ParseFilterRules, MatchesFilterRules } from '../filterRules';
import { WorkQueueConfigurationError } from '../errors';

describe('ParseFilterRules', () => {
    it('returns null for null or blank text', () => {
        expect(ParseFilterRules(null)).toBeNull();
        expect(ParseFilterRules('   ')).toBeNull();
    });

    it('parses an object of scalar values', () => {
        expect(ParseFilterRules('{"eventType":"email","count":2,"live":true,"gone":null}'))
            .toEqual({ eventType: 'email', count: 2, live: true, gone: null });
    });

    it('rejects arrays and non-objects', () => {
        expect(() => ParseFilterRules('[1,2]')).toThrow(WorkQueueConfigurationError);
        expect(() => ParseFilterRules('"text"')).toThrow(WorkQueueConfigurationError);
    });

    it('rejects nested values', () => {
        expect(() => ParseFilterRules('{"a":{"b":1}}')).toThrow("FilterRules value for 'a'");
    });
});

describe('MatchesFilterRules', () => {
    it('matches everything when there are no rules', () => {
        expect(MatchesFilterRules({ any: 1 }, null)).toBe(true);
        expect(MatchesFilterRules('not an object', {})).toBe(true);
    });

    it('requires every rule to match by strict equality', () => {
        const rules = { eventType: 'email', count: 2 };
        expect(MatchesFilterRules({ eventType: 'email', count: 2, other: 'x' }, rules)).toBe(true);
        expect(MatchesFilterRules({ eventType: 'email', count: '2' }, rules)).toBe(false);
        expect(MatchesFilterRules({ eventType: 'sms', count: 2 }, rules)).toBe(false);
    });

    it('treats a missing property as a mismatch, including for null rules', () => {
        expect(MatchesFilterRules({}, { gone: null })).toBe(false);
        expect(MatchesFilterRules({ gone: null }, { gone: null })).toBe(true);
    });

    it('never matches a non-object payload against non-empty rules', () => {
        expect(MatchesFilterRules([1], { a: 1 })).toBe(false);
        expect(MatchesFilterRules(null, { a: 1 })).toBe(false);
    });
});
```

`packages/WorkQueue/src/__tests__/backoff.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ComputeBackoffSeconds } from '../backoff';

describe('ComputeBackoffSeconds', () => {
    it('uses the initial delay for the first attempt', () => {
        expect(ComputeBackoffSeconds(1, 10, 3600)).toBe(10);
    });

    it('doubles for each later attempt', () => {
        expect(ComputeBackoffSeconds(2, 10, 3600)).toBe(20);
        expect(ComputeBackoffSeconds(4, 10, 3600)).toBe(80);
    });

    it('clamps to the maximum', () => {
        expect(ComputeBackoffSeconds(20, 10, 300)).toBe(300);
    });

    it('treats attempt zero like attempt one', () => {
        expect(ComputeBackoffSeconds(0, 10, 3600)).toBe(10);
    });

    it('honours a handler-supplied retry-after, clamped to the maximum', () => {
        expect(ComputeBackoffSeconds(5, 10, 3600, 45)).toBe(45);
        expect(ComputeBackoffSeconds(5, 10, 60, 600)).toBe(60);
        expect(ComputeBackoffSeconds(1, 10, 60, 2.2)).toBe(3);
    });

    it('does not overflow for very large attempt counts', () => {
        expect(ComputeBackoffSeconds(10000, 1, 86400)).toBe(86400);
    });
});
```

`packages/WorkQueue/src/__tests__/capabilities.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { QueueUnsupportedReason, AssertPublishSupported, NATIVE_DRIVER_CAPABILITIES } from '../capabilities';
import { WorkQueueConfigurationError } from '../errors';
import type { WorkQueueDefinition, WorkQueueDriverCapabilities } from '../types';

const QUEUE: WorkQueueDefinition = {
    ID: '11111111-1111-1111-1111-111111111111',
    Name: 'venue-import',
    LeaseSeconds: 300,
    MaxAttempts: 5,
    InitialBackoffSeconds: 10,
    MaxBackoffSeconds: 3600,
    DeadLetterPolicy: 'Block Partition',
    PurgeOnComplete: true,
    IsActive: true,
};

const LIMITED: WorkQueueDriverCapabilities = {
    ...NATIVE_DRIVER_CAPABILITIES,
    BlockPartitionDeadLetter: false,
    PerItemRetryDelayMaxSeconds: 600,
    DelayedPublish: false,
    Priority: false,
};

describe('QueueUnsupportedReason', () => {
    it('accepts every queue on the native driver', () => {
        expect(QueueUnsupportedReason(QUEUE, NATIVE_DRIVER_CAPABILITIES)).toBeNull();
    });

    it('refuses Block Partition on a driver that cannot honour it', () => {
        expect(QueueUnsupportedReason(QUEUE, LIMITED)).toContain('Block Partition');
    });

    it('refuses a maximum backoff above the driver limit', () => {
        const queue = { ...QUEUE, DeadLetterPolicy: 'Skip Partition' as const };
        expect(QueueUnsupportedReason(queue, LIMITED)).toContain('MaxBackoffSeconds 3600');
    });

    it('accepts a queue within the driver limits', () => {
        const queue = { ...QUEUE, DeadLetterPolicy: 'Skip Partition' as const, MaxBackoffSeconds: 600 };
        expect(QueueUnsupportedReason(queue, LIMITED)).toBeNull();
    });
});

describe('AssertPublishSupported', () => {
    it('allows every option on the native driver', () => {
        expect(() => AssertPublishSupported({ RunAfter: new Date(), Priority: 5 }, NATIVE_DRIVER_CAPABILITIES)).not.toThrow();
    });

    it('rejects RunAfter without DelayedPublish', () => {
        expect(() => AssertPublishSupported({ RunAfter: new Date() }, LIMITED)).toThrow(WorkQueueConfigurationError);
    });

    it('rejects a non-zero priority without Priority, but allows zero', () => {
        expect(() => AssertPublishSupported({ Priority: 1 }, LIMITED)).toThrow('Priority');
        expect(() => AssertPublishSupported({ Priority: 0 }, LIMITED)).not.toThrow();
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue && pnpm test filterRules backoff capabilities`
Expected: FAIL — unresolved imports `../filterRules`, `../backoff`, `../capabilities`.

- [ ] **Step 3: Write `src/filterRules.ts`**

```typescript
import { WorkQueueConfigurationError } from './errors';

export type FilterValue = string | number | boolean | null;
export type FilterRules = Record<string, FilterValue>;

/** Parses a subscription's FilterRules column. Null or blank text means "match everything". */
export function ParseFilterRules(json: string | null): FilterRules | null {
    if (json === null || json.trim() === '') {
        return null;
    }
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new WorkQueueConfigurationError('FilterRules must be a JSON object');
    }
    const rules: FilterRules = {};
    for (const [key, value] of Object.entries(parsed)) {
        if (!isFilterValue(value)) {
            throw new WorkQueueConfigurationError(
                `FilterRules value for '${key}' must be a string, number, boolean or null`,
            );
        }
        rules[key] = value;
    }
    return rules;
}

/** True when every rule matches a top-level payload property by strict equality. */
export function MatchesFilterRules(payload: unknown, rules: FilterRules | null): boolean {
    if (!rules) {
        return true;
    }
    const entries = Object.entries(rules);
    if (entries.length === 0) {
        return true;
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return false;
    }
    return entries.every(([key, expected]) =>
        Object.prototype.hasOwnProperty.call(payload, key) && Reflect.get(payload, key) === expected,
    );
}

function isFilterValue(value: unknown): value is FilterValue {
    return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}
```

- [ ] **Step 4: Write `src/backoff.ts`**

```typescript
/** Largest exponent applied, so 2^n never overflows a double before clamping. */
const MAX_EXPONENT = 30;

/**
 * Retry delay in seconds. A handler-supplied retry-after wins; otherwise the delay doubles per
 * attempt from the initial value. Always clamped to [0, maxSeconds].
 */
export function ComputeBackoffSeconds(
    attemptCount: number,
    initialSeconds: number,
    maxSeconds: number,
    retryAfterSeconds?: number,
): number {
    if (retryAfterSeconds !== undefined) {
        return clamp(Math.ceil(retryAfterSeconds), 0, maxSeconds);
    }
    const exponent = Math.min(Math.max(0, attemptCount - 1), MAX_EXPONENT);
    return clamp(initialSeconds * Math.pow(2, exponent), 0, maxSeconds);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}
```

- [ ] **Step 5: Write `src/capabilities.ts`**

```typescript
import { WorkQueueConfigurationError } from './errors';
import type { PublishOptions, WorkQueueDefinition, WorkQueueDriverCapabilities } from './types';

export const NATIVE_DRIVER_CAPABILITIES: WorkQueueDriverCapabilities = {
    BlockPartitionDeadLetter: true,
    PerItemRetryDelayMaxSeconds: 2147483647,
    DelayedPublish: true,
    Priority: true,
    AtomicFanOut: true,
    PeekItems: true,
    ListBlockedPartitions: true,
    ReplaySingleDeadLetter: true,
};

/** Why a driver cannot process a queue as configured, or null when it can. */
export function QueueUnsupportedReason(queue: WorkQueueDefinition, capabilities: WorkQueueDriverCapabilities): string | null {
    if (queue.DeadLetterPolicy === 'Block Partition' && !capabilities.BlockPartitionDeadLetter) {
        return `Queue '${queue.Name}' uses the Block Partition dead-letter policy, which this driver cannot honour`;
    }
    if (queue.MaxBackoffSeconds > capabilities.PerItemRetryDelayMaxSeconds) {
        return `Queue '${queue.Name}' has MaxBackoffSeconds ${queue.MaxBackoffSeconds}, above this driver's limit of ${capabilities.PerItemRetryDelayMaxSeconds}`;
    }
    return null;
}

/** Throws when publish options need a capability the driver lacks. */
export function AssertPublishSupported(options: PublishOptions, capabilities: WorkQueueDriverCapabilities): void {
    if (options.RunAfter && !capabilities.DelayedPublish) {
        throw new WorkQueueConfigurationError('This work-queue driver does not support RunAfter on publish');
    }
    if ((options.Priority ?? 0) !== 0 && !capabilities.Priority) {
        throw new WorkQueueConfigurationError('This work-queue driver does not support Priority');
    }
}
```

- [ ] **Step 6: Export the new modules**

Replace `packages/WorkQueue/src/index.ts` with:

```typescript
export * from './constants';
export * from './types';
export * from './errors';
export * from './payload';
export * from './filterRules';
export * from './backoff';
export * from './capabilities';
```

- [ ] **Step 7: Run the tests and build**

Run: `cd packages/WorkQueue && pnpm test`
Expected: PASS — payload (6), filterRules (8), backoff (6), capabilities (7).

Run: `cd packages/WorkQueue && pnpm run build`
Expected: builds.

- [ ] **Step 8: Commit**

```bash
git add packages/WorkQueue/src
git commit -m "feat(work-queue): filter rules, backoff and driver capability gating"
```

---

### Task 4: Metadata index

**Files:**
- Create: `packages/WorkQueue/src/metadata/WorkQueueMetadataIndex.ts`
- Modify: `packages/WorkQueue/src/index.ts`
- Test: `packages/WorkQueue/src/__tests__/WorkQueueMetadataIndex.test.ts`

**Interfaces:**
- Consumes: `WorkQueueDefinition`, `WorkQueueTopicDefinition`, `WorkQueueSubscriptionDefinition` (Task 2).
- Produces: `class WorkQueueMetadataIndex` — `constructor(queues, topics, subscriptions)`, `Queues`, `QueueByName(name)`, `QueueByID(id)`, `TopicByName(name)`, `TopicByID(id)`, `ActiveSubscriptionsForTopic(topicID)`; `interface WorkQueueMetadataSource { GetIndex(contextUser: UserInfo): Promise<WorkQueueMetadataIndex> }`.

- [ ] **Step 1: Write the failing test**

`packages/WorkQueue/src/__tests__/WorkQueueMetadataIndex.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorkQueueMetadataIndex } from '../metadata/WorkQueueMetadataIndex';
import type { WorkQueueDefinition, WorkQueueSubscriptionDefinition, WorkQueueTopicDefinition } from '../types';

const QUEUE_A: WorkQueueDefinition = {
    ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'person-click-updater', LeaseSeconds: 60, MaxAttempts: 5,
    InitialBackoffSeconds: 5, MaxBackoffSeconds: 300, DeadLetterPolicy: 'Skip Partition', PurgeOnComplete: true, IsActive: true,
};
const QUEUE_B: WorkQueueDefinition = { ...QUEUE_A, ID: 'AAAAAAAA-0000-0000-0000-000000000002', Name: 'click-archiver' };
const TOPIC: WorkQueueTopicDefinition = { ID: 'BBBBBBBB-0000-0000-0000-000000000001', Name: 'link.clicked', AllowExternalPublish: false, IsActive: true };
const SUBS: WorkQueueSubscriptionDefinition[] = [
    { ID: 'CCCCCCCC-0000-0000-0000-000000000001', TopicID: TOPIC.ID, QueueID: QUEUE_A.ID, FilterRules: null, IsActive: true },
    { ID: 'CCCCCCCC-0000-0000-0000-000000000002', TopicID: TOPIC.ID, QueueID: QUEUE_B.ID, FilterRules: null, IsActive: false },
];

function makeIndex(): WorkQueueMetadataIndex {
    return new WorkQueueMetadataIndex([QUEUE_A, QUEUE_B], [TOPIC], SUBS);
}

describe('WorkQueueMetadataIndex', () => {
    it('finds queues by name, trimmed and case-insensitively', () => {
        expect(makeIndex().QueueByName('  PERSON-click-updater ')?.ID).toBe(QUEUE_A.ID);
        expect(makeIndex().QueueByName('missing')).toBeUndefined();
    });

    it('finds queues and topics by ID regardless of UUID case', () => {
        expect(makeIndex().QueueByID(QUEUE_B.ID.toLowerCase())?.Name).toBe('click-archiver');
        expect(makeIndex().TopicByID(TOPIC.ID.toLowerCase())?.Name).toBe('link.clicked');
    });

    it('finds topics by name', () => {
        expect(makeIndex().TopicByName('Link.Clicked')?.ID).toBe(TOPIC.ID);
    });

    it('returns only active subscriptions for a topic', () => {
        const subs = makeIndex().ActiveSubscriptionsForTopic(TOPIC.ID.toLowerCase());
        expect(subs.map(s => s.ID)).toEqual(['CCCCCCCC-0000-0000-0000-000000000001']);
    });

    it('returns an empty list for a topic with no subscriptions', () => {
        expect(makeIndex().ActiveSubscriptionsForTopic('DDDDDDDD-0000-0000-0000-000000000009')).toEqual([]);
    });

    it('returns copies so callers cannot mutate the index', () => {
        const index = makeIndex();
        index.Queues.pop();
        index.ActiveSubscriptionsForTopic(TOPIC.ID).pop();
        expect(index.Queues).toHaveLength(2);
        expect(index.ActiveSubscriptionsForTopic(TOPIC.ID)).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/WorkQueue && pnpm test WorkQueueMetadataIndex`
Expected: FAIL — unresolved import `../metadata/WorkQueueMetadataIndex`.

- [ ] **Step 3: Write `src/metadata/WorkQueueMetadataIndex.ts`**

```typescript
import { NormalizeUUID } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import type { WorkQueueDefinition, WorkQueueSubscriptionDefinition, WorkQueueTopicDefinition } from '../types';

/**
 * Immutable lookups over queue, topic and subscription metadata. Names match trimmed and
 * case-insensitively; IDs match through NormalizeUUID so SQL Server and PostgreSQL agree.
 */
export class WorkQueueMetadataIndex {
    private readonly queueList: WorkQueueDefinition[];
    private readonly queuesByName = new Map<string, WorkQueueDefinition>();
    private readonly queuesByID = new Map<string, WorkQueueDefinition>();
    private readonly topicsByName = new Map<string, WorkQueueTopicDefinition>();
    private readonly topicsByID = new Map<string, WorkQueueTopicDefinition>();
    private readonly subscriptionsByTopic = new Map<string, WorkQueueSubscriptionDefinition[]>();

    constructor(
        queues: WorkQueueDefinition[],
        topics: WorkQueueTopicDefinition[],
        subscriptions: WorkQueueSubscriptionDefinition[],
    ) {
        this.queueList = [...queues];
        for (const queue of queues) {
            this.queuesByName.set(normalizeName(queue.Name), queue);
            this.queuesByID.set(NormalizeUUID(queue.ID), queue);
        }
        for (const topic of topics) {
            this.topicsByName.set(normalizeName(topic.Name), topic);
            this.topicsByID.set(NormalizeUUID(topic.ID), topic);
        }
        this.indexSubscriptions(subscriptions);
    }

    public get Queues(): WorkQueueDefinition[] {
        return [...this.queueList];
    }

    public QueueByName(name: string): WorkQueueDefinition | undefined {
        return this.queuesByName.get(normalizeName(name));
    }

    public QueueByID(id: string): WorkQueueDefinition | undefined {
        return this.queuesByID.get(NormalizeUUID(id));
    }

    public TopicByName(name: string): WorkQueueTopicDefinition | undefined {
        return this.topicsByName.get(normalizeName(name));
    }

    public TopicByID(id: string): WorkQueueTopicDefinition | undefined {
        return this.topicsByID.get(NormalizeUUID(id));
    }

    public ActiveSubscriptionsForTopic(topicID: string): WorkQueueSubscriptionDefinition[] {
        return [...(this.subscriptionsByTopic.get(NormalizeUUID(topicID)) ?? [])];
    }

    private indexSubscriptions(subscriptions: WorkQueueSubscriptionDefinition[]): void {
        for (const subscription of subscriptions) {
            if (!subscription.IsActive) {
                continue;
            }
            const key = NormalizeUUID(subscription.TopicID);
            const list = this.subscriptionsByTopic.get(key) ?? [];
            list.push(subscription);
            this.subscriptionsByTopic.set(key, list);
        }
    }
}

/** Anything that can supply a current metadata index — the engine in production, a fake in tests. */
export interface WorkQueueMetadataSource {
    GetIndex(contextUser: UserInfo): Promise<WorkQueueMetadataIndex>;
}

function normalizeName(name: string): string {
    return name.trim().toLowerCase();
}
```

- [ ] **Step 4: Export it**

Append to `packages/WorkQueue/src/index.ts`:

```typescript
export * from './metadata/WorkQueueMetadataIndex';
```

- [ ] **Step 5: Run the tests**

Run: `cd packages/WorkQueue && pnpm test WorkQueueMetadataIndex`
Expected: PASS — 6 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/WorkQueue/src
git commit -m "feat(work-queue): metadata index with UUID-normalised lookups"
```

---

### Task 5: SQL helpers and SQL Server work-queue SQL

**Files:**
- Create: `packages/WorkQueue/src/sql/sqlExecution.ts`, `src/sql/SqlParamList.ts`, `src/sql/WorkQueueSqlBuilder.ts`, `src/sql/SqlServerWorkQueueSql.ts`
- Create: `packages/WorkQueue/src/__tests__/fakes.ts`
- Modify: `packages/WorkQueue/src/index.ts`
- Test: `packages/WorkQueue/src/__tests__/sqlExecution.test.ts`, `src/__tests__/SqlServerWorkQueueSql.test.ts`

**Interfaces:**
- Consumes: `DeliveryTarget`, `DeliveryEnvelope`, `WorkQueueDefinition`, `DeadLetterReason` (Task 2).
- Produces:
  - `interface WorkQueueSqlExecutor`, `interface SqlStatement { SQL: string; Params: unknown[] }`, `type SqlBuilderExecutor = Pick<WorkQueueSqlExecutor, 'MJCoreSchemaName' | 'QuoteIdentifier' | 'BuildParameterPlaceholder'>`
  - `QualifiedTable(executor: SqlBuilderExecutor, table: string): string`
  - `ExecuteWrite(executor: WorkQueueSqlExecutor, statement: SqlStatement, contextUser: UserInfo): Promise<number>`
  - `ExecuteRows<T>(executor: WorkQueueSqlExecutor, statement: SqlStatement, contextUser: UserInfo): Promise<T[]>`
  - `IsUniqueViolation(error: unknown, indexName: string): boolean`
  - `class SqlParamList { constructor(executor: Pick<WorkQueueSqlExecutor, 'BuildParameterPlaceholder'>); Add(value: unknown): string; get Values(): unknown[] }`
  - `interface WorkQueueSqlBuilder` with `Deliver`, `Claim`, `Heartbeat`, `Complete`, `Retry`, `DeadLetter`, `ReapLeaseExhausted`
  - `class SqlServerWorkQueueSql implements WorkQueueSqlBuilder { constructor(executor: SqlBuilderExecutor) }`
  - Test fakes: `class RecordingExecutor implements WorkQueueSqlExecutor` (`Calls`, `QueueResponse(rows)`, `FailNextWith(error)`), `TEST_USER`, `QUEUE_FIXTURE`, `ENVELOPE_FIXTURE`

- [ ] **Step 1: Write `src/sql/sqlExecution.ts`**

```typescript
import type { ExecuteSQLOptions, UserInfo } from '@memberjunction/core';
import type { DatabasePlatform, SQLDialect } from '@memberjunction/sql-dialect';

/** The slice of DatabaseProviderBase the work queue needs. DatabaseProviderBase satisfies it structurally. */
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

/** What a statement builder needs: quoting, schema and placeholders — never execution. */
export type SqlBuilderExecutor = Pick<WorkQueueSqlExecutor, 'MJCoreSchemaName' | 'QuoteIdentifier' | 'BuildParameterPlaceholder'>;

export function QualifiedTable(executor: SqlBuilderExecutor, table: string): string {
    return `${executor.QuoteIdentifier(executor.MJCoreSchemaName)}.${executor.QuoteIdentifier(table)}`;
}

/** Runs a bare UPDATE or DELETE and returns the affected-row count, read back as data. */
export async function ExecuteWrite(executor: WorkQueueSqlExecutor, statement: SqlStatement, contextUser: UserInfo): Promise<number> {
    const rows = await executor.ExecuteSQL<{ AffectedRows: number }>(
        executor.Dialect.AffectedRowCountSQL(statement.SQL, 'AffectedRows'),
        statement.Params,
        { isMutation: true },
        contextUser,
    );
    return Number(rows?.[0]?.AffectedRows ?? 0);
}

/** Runs a statement that ends in exactly one result set and returns its rows. */
export async function ExecuteRows<T>(executor: WorkQueueSqlExecutor, statement: SqlStatement, contextUser: UserInfo): Promise<T[]> {
    const rows = await executor.ExecuteSQL<T>(statement.SQL, statement.Params, { isMutation: true }, contextUser);
    return rows ?? [];
}

/** True when a database error is a unique-constraint violation on the named index. */
export function IsUniqueViolation(error: unknown, indexName: string): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes(indexName);
}
```

- [ ] **Step 2: Write `src/sql/SqlParamList.ts`**

```typescript
import type { WorkQueueSqlExecutor } from './sqlExecution';

/** Accumulates bound values and hands back the provider's placeholder for each. */
export class SqlParamList {
    private readonly values: unknown[] = [];

    constructor(private readonly executor: Pick<WorkQueueSqlExecutor, 'BuildParameterPlaceholder'>) {}

    public Add(value: unknown): string {
        const placeholder = this.executor.BuildParameterPlaceholder(this.values.length);
        this.values.push(value);
        return placeholder;
    }

    public get Values(): unknown[] {
        return [...this.values];
    }
}
```

- [ ] **Step 3: Write `src/sql/WorkQueueSqlBuilder.ts`**

```typescript
import type { DeadLetterReason, DeliveryEnvelope, DeliveryTarget, WorkQueueDefinition } from '../types';
import type { SqlStatement } from './sqlExecution';

/**
 * Dialect-specific statements for the item table. Row-returning statements: Deliver (ItemID, QueueID)
 * and Claim (spec 02 §4.7 columns). Every other statement is a bare guarded write.
 */
export interface WorkQueueSqlBuilder {
    Deliver(targets: DeliveryTarget[], envelope: DeliveryEnvelope): SqlStatement;
    Claim(queue: WorkQueueDefinition, workerID: string): SqlStatement;
    Heartbeat(itemID: string, workerID: string, fenceToken: number, leaseSeconds: number): SqlStatement;
    Complete(itemID: string, workerID: string, fenceToken: number, purge: boolean): SqlStatement;
    Retry(itemID: string, workerID: string, fenceToken: number, delaySeconds: number, errorMessage: string): SqlStatement;
    DeadLetter(itemID: string, workerID: string, fenceToken: number, reason: DeadLetterReason, errorMessage: string): SqlStatement;
    ReapLeaseExhausted(): SqlStatement;
}
```

- [ ] **Step 4: Write the test fakes**

`packages/WorkQueue/src/__tests__/fakes.ts`:

```typescript
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import type { DatabasePlatform, SQLDialect } from '@memberjunction/sql-dialect';
import type { ExecuteSQLOptions, UserInfo } from '@memberjunction/core';
import type { WorkQueueSqlExecutor } from '../sql/sqlExecution';
import type { DeliveryEnvelope, WorkQueueDefinition } from '../types';

export interface RecordedCall {
    SQL: string;
    Params: unknown[];
    Options?: ExecuteSQLOptions;
}

/** Records every statement and answers with queued row sets. Uses the real dialects. */
export class RecordingExecutor implements WorkQueueSqlExecutor {
    public readonly Calls: RecordedCall[] = [];
    public readonly MJCoreSchemaName = '__mj';
    public readonly Dialect: SQLDialect;
    private readonly responses: unknown[][] = [];
    private failure: Error | null = null;

    constructor(public readonly PlatformKey: DatabasePlatform = 'sqlserver') {
        this.Dialect = PlatformKey === 'sqlserver' ? new SQLServerDialect() : new PostgreSQLDialect();
    }

    public QuoteIdentifier(name: string): string {
        return this.PlatformKey === 'sqlserver' ? `[${name}]` : `"${name}"`;
    }

    public BuildParameterPlaceholder(index: number): string {
        return this.PlatformKey === 'sqlserver' ? `@p${index}` : `$${index + 1}`;
    }

    public QueueResponse(rows: unknown[]): this {
        this.responses.push(rows);
        return this;
    }

    public FailNextWith(error: Error): this {
        this.failure = error;
        return this;
    }

    public async ExecuteSQL<T>(query: string, parameters?: unknown[], options?: ExecuteSQLOptions): Promise<Array<T>> {
        this.Calls.push({ SQL: query, Params: parameters ?? [], Options: options });
        if (this.failure) {
            const error = this.failure;
            this.failure = null;
            throw error;
        }
        return (this.responses.shift() ?? []) as T[];
    }
}

export const TEST_USER = {} as UserInfo;

export const QUEUE_FIXTURE: WorkQueueDefinition = {
    ID: 'AAAAAAAA-0000-0000-0000-000000000001',
    Name: 'venue-import',
    LeaseSeconds: 300,
    MaxAttempts: 5,
    InitialBackoffSeconds: 10,
    MaxBackoffSeconds: 3600,
    DeadLetterPolicy: 'Block Partition',
    PurgeOnComplete: true,
    IsActive: true,
};

export const ENVELOPE_FIXTURE: DeliveryEnvelope = {
    PublishID: 'EEEEEEEE-0000-0000-0000-000000000001',
    TopicID: 'BBBBBBBB-0000-0000-0000-000000000001',
    TopicName: 'import.ready',
    PartitionKey: 'venue-42',
    TenantID: null,
    CorrelationID: null,
    PayloadJSON: '{"importId":"x"}',
    Priority: 0,
    RunAfter: null,
    DeduplicationKey: null,
    DeduplicationTTLSeconds: 86400,
};
```

- [ ] **Step 5: Write the failing tests**

`packages/WorkQueue/src/__tests__/sqlExecution.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ExecuteRows, ExecuteWrite, IsUniqueViolation, QualifiedTable } from '../sql/sqlExecution';
import { SqlParamList } from '../sql/SqlParamList';
import { RecordingExecutor, TEST_USER } from './fakes';

describe('sql execution helpers', () => {
    it('qualifies a table with the core schema', () => {
        expect(QualifiedTable(new RecordingExecutor(), 'WorkQueueItem')).toBe('[__mj].[WorkQueueItem]');
        expect(QualifiedTable(new RecordingExecutor('postgresql'), 'WorkQueueItem')).toBe('"__mj"."WorkQueueItem"');
    });

    it('wraps a write in the dialect affected-row form and returns the count', async () => {
        const executor = new RecordingExecutor().QueueResponse([{ AffectedRows: 1 }]);
        const count = await ExecuteWrite(executor, { SQL: 'UPDATE t SET a = @p0', Params: [5] }, TEST_USER);
        expect(count).toBe(1);
        expect(executor.Calls[0].SQL).toContain('SELECT @@ROWCOUNT AS');
        expect(executor.Calls[0].Params).toEqual([5]);
        expect(executor.Calls[0].Options).toEqual({ isMutation: true });
    });

    it('returns zero when the write reports no rows', async () => {
        expect(await ExecuteWrite(new RecordingExecutor(), { SQL: 'DELETE FROM t', Params: [] }, TEST_USER)).toBe(0);
    });

    it('returns rows unchanged from a row-returning statement', async () => {
        const executor = new RecordingExecutor().QueueResponse([{ ItemID: 'a' }]);
        expect(await ExecuteRows(executor, { SQL: 'SELECT 1', Params: [] }, TEST_USER)).toEqual([{ ItemID: 'a' }]);
    });

    it('recognises a unique violation by index name', () => {
        expect(IsUniqueViolation(new Error("Cannot insert duplicate key row ... 'UQ_WorkQueueItem_InFlightPartition'"), 'UQ_WorkQueueItem_InFlightPartition')).toBe(true);
        expect(IsUniqueViolation(new Error('deadlock victim'), 'UQ_WorkQueueItem_InFlightPartition')).toBe(false);
    });

    it('hands out placeholders in order', () => {
        const params = new SqlParamList(new RecordingExecutor('postgresql'));
        expect(params.Add('a')).toBe('$1');
        expect(params.Add(2)).toBe('$2');
        expect(params.Values).toEqual(['a', 2]);
    });
});
```

`packages/WorkQueue/src/__tests__/SqlServerWorkQueueSql.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SqlServerWorkQueueSql } from '../sql/SqlServerWorkQueueSql';
import { ENVELOPE_FIXTURE, QUEUE_FIXTURE, RecordingExecutor } from './fakes';

const sql = new SqlServerWorkQueueSql(new RecordingExecutor());
const OWNER_GUARD = /\[ID\] = @p\d+ AND \[ClaimedBy\] = @p\d+ AND \[FenceToken\] = @p\d+ AND \[Status\] = N'In Progress'/;

describe('SqlServerWorkQueueSql.Claim', () => {
    const statement = sql.Claim(QUEUE_FIXTURE, 'worker-1');

    it('skips locked rows and returns the claimed row through a table variable', () => {
        expect(statement.SQL).toContain('WITH (UPDLOCK, READPAST, ROWLOCK)');
        expect(statement.SQL).toContain('INTO @Claimed');
        expect(statement.SQL.trim().endsWith('SELECT * FROM @Claimed;')).toBe(true);
    });

    it('allows pending items past RunAfter and expired leases with attempts left', () => {
        expect(statement.SQL).toContain("i.[Status] = N'Pending' AND (i.[RunAfter] IS NULL OR i.[RunAfter] <= SYSDATETIMEOFFSET())");
        expect(statement.SQL).toContain("i.[Status] = N'In Progress' AND i.[ClaimExpiresAt] < SYSDATETIMEOFFSET() AND i.[AttemptCount] < i.[MaxAttempts]");
    });

    it('enforces head-of-line within the partition, counting dead letters when blocking', () => {
        expect(statement.SQL).toContain('o.[Sequence] < i.[Sequence]');
        expect(statement.SQL).toContain("o.[Status] IN (N'Pending', N'In Progress') OR (@p1 = 1 AND o.[Status] = N'Dead Letter')");
    });

    it('counts the attempt and advances the fence token', () => {
        expect(statement.SQL).toContain('[FenceToken] = [FenceToken] + 1');
        expect(statement.SQL).toContain('[AttemptCount] = [AttemptCount] + 1');
    });

    it('binds queue, dead-letter policy, worker and lease in order', () => {
        expect(statement.Params).toEqual([QUEUE_FIXTURE.ID, 1, 'worker-1', 300]);
        expect(sql.Claim({ ...QUEUE_FIXTURE, DeadLetterPolicy: 'Skip Partition' }, 'w').Params[1]).toBe(0);
    });
});

describe('SqlServerWorkQueueSql guarded writes', () => {
    it('extends a lease only for the current owner', () => {
        const statement = sql.Heartbeat('item-1', 'worker-1', 3, 120);
        expect(statement.SQL).toMatch(OWNER_GUARD);
        expect(statement.SQL).toContain('DATEADD(SECOND, @p0, SYSDATETIMEOFFSET())');
        expect(statement.Params).toEqual([120, 'item-1', 'worker-1', 3]);
    });

    it('deletes on purge and marks Completed otherwise', () => {
        expect(sql.Complete('item-1', 'w', 1, true).SQL).toMatch(/^DELETE FROM \[__mj\]\.\[WorkQueueItem\]/);
        const kept = sql.Complete('item-1', 'w', 1, false).SQL;
        expect(kept).toContain("[Status] = N'Completed'");
        expect(kept).toMatch(OWNER_GUARD);
    });

    it('returns a retried item to Pending with a delayed RunAfter and releases the claim', () => {
        const statement = sql.Retry('item-1', 'w', 2, 40, 'deadlock');
        expect(statement.SQL).toContain("[Status] = N'Pending'");
        expect(statement.SQL).toContain('[RunAfter] = DATEADD(SECOND, @p0, SYSDATETIMEOFFSET())');
        expect(statement.SQL).toContain('[ClaimedBy] = NULL');
        expect(statement.Params).toEqual([40, 'deadlock', 'item-1', 'w', 2]);
    });

    it('dead-letters with a reason for the current owner', () => {
        const statement = sql.DeadLetter('item-1', 'w', 2, 'Fatal Error', 'bad payload');
        expect(statement.SQL).toContain("[Status] = N'Dead Letter'");
        expect(statement.SQL).toMatch(OWNER_GUARD);
        expect(statement.Params).toEqual(['Fatal Error', 'bad payload', 'item-1', 'w', 2]);
    });

    it('reaps only expired leases on their final attempt', () => {
        const reap = sql.ReapLeaseExhausted().SQL;
        expect(reap).toContain("N'Lease Exhausted'");
        expect(reap).toContain('[AttemptCount] >= [MaxAttempts]');
        expect(reap).toContain('[ClaimExpiresAt] < SYSDATETIMEOFFSET()');
    });
});

describe('SqlServerWorkQueueSql.Deliver', () => {
    const targets = [
        { QueueID: 'AAAAAAAA-0000-0000-0000-000000000001', QueueName: 'a', MaxAttempts: 5 },
        { QueueID: 'AAAAAAAA-0000-0000-0000-000000000002', QueueName: 'b', MaxAttempts: 3 },
    ];

    it('inserts items for every target atomically when there is no deduplication key', () => {
        const statement = sql.Deliver(targets, ENVELOPE_FIXTURE);
        expect(statement.SQL).toContain('BEGIN TRANSACTION;');
        expect(statement.SQL).toContain('COMMIT TRANSACTION;');
        expect(statement.SQL).not.toContain('[WorkQueueDeduplication]');
        expect(statement.SQL.trim().endsWith('SELECT [ItemID], [QueueID] FROM @Delivered;')).toBe(true);
        expect(statement.SQL.match(/\bSELECT \[ItemID\]/g)).toHaveLength(1);
    });

    it('filters targets through the deduplication ledger when a key is given', () => {
        const statement = sql.Deliver(targets, { ...ENVELOPE_FIXTURE, DeduplicationKey: 'batch:1' });
        expect(statement.SQL).toContain('[ExpiresAt] <= SYSDATETIMEOFFSET()');
        expect(statement.SQL).toContain('WITH (UPDLOCK, HOLDLOCK)');
        expect(statement.SQL).toContain('INTO @Accepted');
        expect(statement.Params).toContain('batch:1');
    });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd packages/WorkQueue && pnpm test sqlExecution SqlServerWorkQueueSql`
Expected: `sqlExecution` passes (helpers exist); `SqlServerWorkQueueSql` FAILS — unresolved import `../sql/SqlServerWorkQueueSql`.

- [ ] **Step 7: Write `src/sql/SqlServerWorkQueueSql.ts`**

```typescript
import type { DeadLetterReason, DeliveryEnvelope, DeliveryTarget, WorkQueueDefinition } from '../types';
import { QualifiedTable, type SqlBuilderExecutor, type SqlStatement } from './sqlExecution';
import { SqlParamList } from './SqlParamList';
import type { WorkQueueSqlBuilder } from './WorkQueueSqlBuilder';

const NOW = 'SYSDATETIMEOFFSET()';

export class SqlServerWorkQueueSql implements WorkQueueSqlBuilder {
    constructor(private readonly executor: SqlBuilderExecutor) {}

    private get items(): string {
        return QualifiedTable(this.executor, 'WorkQueueItem');
    }

    private get dedup(): string {
        return QualifiedTable(this.executor, 'WorkQueueDeduplication');
    }

    public Claim(queue: WorkQueueDefinition, workerID: string): SqlStatement {
        const p = new SqlParamList(this.executor);
        const queueID = p.Add(queue.ID);
        const blockOnDeadLetter = p.Add(queue.DeadLetterPolicy === 'Block Partition' ? 1 : 0);
        const worker = p.Add(workerID);
        const lease = p.Add(queue.LeaseSeconds);
        const SQL = `
DECLARE @Claimed TABLE ([ItemID] UNIQUEIDENTIFIER, [PublishID] UNIQUEIDENTIFIER, [QueueID] UNIQUEIDENTIFIER, [TopicID] UNIQUEIDENTIFIER NULL, [PartitionKey] NVARCHAR(200) NULL, [TenantID] NVARCHAR(100) NULL, [CorrelationID] NVARCHAR(200) NULL, [PayloadJSON] NVARCHAR(MAX), [AttemptCount] INT, [MaxAttempts] INT, [FenceToken] INT);
WITH NextItem AS (
    SELECT TOP (1) i.*
    FROM ${this.items} i WITH (UPDLOCK, READPAST, ROWLOCK)
    WHERE i.[QueueID] = ${queueID}
      AND ((i.[Status] = N'Pending' AND (i.[RunAfter] IS NULL OR i.[RunAfter] <= ${NOW}))
        OR (i.[Status] = N'In Progress' AND i.[ClaimExpiresAt] < ${NOW} AND i.[AttemptCount] < i.[MaxAttempts]))
      AND (i.[PartitionKey] IS NULL OR NOT EXISTS (
          SELECT 1 FROM ${this.items} o
          WHERE o.[QueueID] = i.[QueueID] AND o.[PartitionKey] = i.[PartitionKey] AND o.[Sequence] < i.[Sequence]
            AND (o.[Status] IN (N'Pending', N'In Progress') OR (${blockOnDeadLetter} = 1 AND o.[Status] = N'Dead Letter'))))
    ORDER BY i.[Priority] DESC, i.[Sequence] ASC
)
UPDATE NextItem
SET [Status] = N'In Progress', [ClaimedBy] = ${worker}, [ClaimExpiresAt] = DATEADD(SECOND, ${lease}, ${NOW}),
    [FenceToken] = [FenceToken] + 1, [AttemptCount] = [AttemptCount] + 1, [StartedAt] = ${NOW}
OUTPUT inserted.[ID], inserted.[PublishID], inserted.[QueueID], inserted.[TopicID], inserted.[PartitionKey], inserted.[TenantID],
       inserted.[CorrelationID], inserted.[Payload], inserted.[AttemptCount], inserted.[MaxAttempts], inserted.[FenceToken]
INTO @Claimed;
SELECT * FROM @Claimed;`;
        return { SQL, Params: p.Values };
    }

    public Heartbeat(itemID: string, workerID: string, fenceToken: number, leaseSeconds: number): SqlStatement {
        const p = new SqlParamList(this.executor);
        const lease = p.Add(leaseSeconds);
        const SQL = `UPDATE ${this.items} SET [ClaimExpiresAt] = DATEADD(SECOND, ${lease}, ${NOW}) WHERE ${this.ownerGuard(p, itemID, workerID, fenceToken)}`;
        return { SQL, Params: p.Values };
    }

    public Complete(itemID: string, workerID: string, fenceToken: number, purge: boolean): SqlStatement {
        const p = new SqlParamList(this.executor);
        if (purge) {
            return { SQL: `DELETE FROM ${this.items} WHERE ${this.ownerGuard(p, itemID, workerID, fenceToken)}`, Params: p.Values };
        }
        const SQL = `UPDATE ${this.items} SET [Status] = N'Completed', [CompletedAt] = ${NOW}, [ClaimedBy] = NULL, [ClaimExpiresAt] = NULL WHERE ${this.ownerGuard(p, itemID, workerID, fenceToken)}`;
        return { SQL, Params: p.Values };
    }

    public Retry(itemID: string, workerID: string, fenceToken: number, delaySeconds: number, errorMessage: string): SqlStatement {
        const p = new SqlParamList(this.executor);
        const delay = p.Add(delaySeconds);
        const message = p.Add(errorMessage);
        const SQL = `UPDATE ${this.items} SET [Status] = N'Pending', [RunAfter] = DATEADD(SECOND, ${delay}, ${NOW}), [ClaimedBy] = NULL, [ClaimExpiresAt] = NULL, [ErrorMessage] = ${message} WHERE ${this.ownerGuard(p, itemID, workerID, fenceToken)}`;
        return { SQL, Params: p.Values };
    }

    public DeadLetter(itemID: string, workerID: string, fenceToken: number, reason: DeadLetterReason, errorMessage: string): SqlStatement {
        const p = new SqlParamList(this.executor);
        const reasonParam = p.Add(reason);
        const message = p.Add(errorMessage);
        const SQL = `UPDATE ${this.items} SET [Status] = N'Dead Letter', [DeadLetterReason] = ${reasonParam}, [ErrorMessage] = ${message}, [ClaimedBy] = NULL, [ClaimExpiresAt] = NULL, [CompletedAt] = ${NOW} WHERE ${this.ownerGuard(p, itemID, workerID, fenceToken)}`;
        return { SQL, Params: p.Values };
    }

    public ReapLeaseExhausted(): SqlStatement {
        const SQL = `UPDATE ${this.items} SET [Status] = N'Dead Letter', [DeadLetterReason] = N'Lease Exhausted', [ErrorMessage] = N'Lease expired on the final attempt', [ClaimedBy] = NULL, [ClaimExpiresAt] = NULL, [CompletedAt] = ${NOW} WHERE [Status] = N'In Progress' AND [ClaimExpiresAt] < ${NOW} AND [AttemptCount] >= [MaxAttempts]`;
        return { SQL, Params: [] };
    }

    public Deliver(targets: DeliveryTarget[], envelope: DeliveryEnvelope): SqlStatement {
        const p = new SqlParamList(this.executor);
        const publishID = p.Add(envelope.PublishID);
        const rows = targets.map(t => `(${p.Add(t.QueueID)}, ${p.Add(t.MaxAttempts)})`).join(', ');
        const acceptance = envelope.DeduplicationKey
            ? this.dedupAcceptance(p, envelope.DeduplicationKey, publishID, envelope.DeduplicationTTLSeconds)
            : 'INSERT INTO @Accepted ([QueueID]) SELECT [QueueID] FROM @Targets;';
        const SQL = `SET XACT_ABORT ON;
BEGIN TRANSACTION;
DECLARE @Targets TABLE ([QueueID] UNIQUEIDENTIFIER NOT NULL, [MaxAttempts] INT NOT NULL);
DECLARE @Accepted TABLE ([QueueID] UNIQUEIDENTIFIER NOT NULL);
DECLARE @Delivered TABLE ([ItemID] UNIQUEIDENTIFIER NOT NULL, [QueueID] UNIQUEIDENTIFIER NOT NULL);
INSERT INTO @Targets ([QueueID], [MaxAttempts]) VALUES ${rows};
${acceptance}
${this.insertItems(p, envelope, publishID)}
COMMIT TRANSACTION;
SELECT [ItemID], [QueueID] FROM @Delivered;`;
        return { SQL, Params: p.Values };
    }

    private dedupAcceptance(p: SqlParamList, key: string, publishID: string, ttlSeconds: number): string {
        const keyParam = p.Add(key);
        const ttl = p.Add(ttlSeconds);
        return `DELETE d FROM ${this.dedup} d INNER JOIN @Targets t ON d.[QueueID] = t.[QueueID]
WHERE d.[DeduplicationKey] = ${keyParam} AND d.[ExpiresAt] <= ${NOW};
INSERT INTO ${this.dedup} ([QueueID], [DeduplicationKey], [PublishID], [ExpiresAt])
OUTPUT inserted.[QueueID] INTO @Accepted ([QueueID])
SELECT t.[QueueID], ${keyParam}, ${publishID}, DATEADD(SECOND, ${ttl}, ${NOW})
FROM @Targets t
WHERE NOT EXISTS (SELECT 1 FROM ${this.dedup} d WITH (UPDLOCK, HOLDLOCK) WHERE d.[QueueID] = t.[QueueID] AND d.[DeduplicationKey] = ${keyParam});`;
    }

    private insertItems(p: SqlParamList, envelope: DeliveryEnvelope, publishID: string): string {
        return `INSERT INTO ${this.items} ([PublishID], [QueueID], [TopicID], [PartitionKey], [TenantID], [CorrelationID], [Payload], [Status], [Priority], [MaxAttempts], [RunAfter])
OUTPUT inserted.[ID], inserted.[QueueID] INTO @Delivered ([ItemID], [QueueID])
SELECT ${publishID}, t.[QueueID], ${p.Add(envelope.TopicID)}, ${p.Add(envelope.PartitionKey)}, ${p.Add(envelope.TenantID)}, ${p.Add(envelope.CorrelationID)},
       ${p.Add(envelope.PayloadJSON)}, N'Pending', ${p.Add(envelope.Priority)}, t.[MaxAttempts], ${p.Add(envelope.RunAfter)}
FROM @Targets t INNER JOIN @Accepted a ON a.[QueueID] = t.[QueueID];`;
    }

    private ownerGuard(p: SqlParamList, itemID: string, workerID: string, fenceToken: number): string {
        return `[ID] = ${p.Add(itemID)} AND [ClaimedBy] = ${p.Add(workerID)} AND [FenceToken] = ${p.Add(fenceToken)} AND [Status] = N'In Progress'`;
    }
}
```

- [ ] **Step 8: Export the SQL contracts**

Append to `packages/WorkQueue/src/index.ts`:

```typescript
export * from './sql/sqlExecution';
export * from './sql/SqlParamList';
export * from './sql/WorkQueueSqlBuilder';
export * from './sql/SqlServerWorkQueueSql';
```

- [ ] **Step 9: Run the tests**

Run: `cd packages/WorkQueue && pnpm test sqlExecution SqlServerWorkQueueSql`
Expected: PASS — sqlExecution (6), SqlServerWorkQueueSql (12).

- [ ] **Step 10: Commit**

```bash
git add packages/WorkQueue/src
git commit -m "feat(work-queue): SQL execution helpers and SQL Server item statements"
```

---

### Task 6: PostgreSQL work-queue SQL

**Files:**
- Create: `packages/WorkQueue/src/sql/PostgreSQLWorkQueueSql.ts`
- Modify: `packages/WorkQueue/src/index.ts`
- Test: `packages/WorkQueue/src/__tests__/PostgreSQLWorkQueueSql.test.ts`

**Interfaces:**
- Consumes: `WorkQueueSqlBuilder`, `SqlParamList`, `QualifiedTable`, `SqlBuilderExecutor`, `SqlStatement` (Task 5); `RecordingExecutor`, `QUEUE_FIXTURE`, `ENVELOPE_FIXTURE` (Task 5 fakes).
- Produces: `class PostgreSQLWorkQueueSql implements WorkQueueSqlBuilder { constructor(executor: SqlBuilderExecutor) }` returning the same result columns as the SQL Server builder.

PostgreSQL rules for this builder: every value is cast where its type is not obvious from context (`::uuid`, `::integer`, `::boolean`, `::double precision`, `::timestamptz`); guarded writes carry **no trailing semicolon and no `RETURNING`**, because `PostgreSQLDialect.AffectedRowCountSQL` wraps them in a data-modifying CTE that appends `RETURNING 1`; row-returning statements are a single statement ending in one `SELECT` or `RETURNING`.

- [ ] **Step 1: Write the failing test**

`packages/WorkQueue/src/__tests__/PostgreSQLWorkQueueSql.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PostgreSQLWorkQueueSql } from '../sql/PostgreSQLWorkQueueSql';
import { ENVELOPE_FIXTURE, QUEUE_FIXTURE, RecordingExecutor } from './fakes';

const sql = new PostgreSQLWorkQueueSql(new RecordingExecutor('postgresql'));
const OWNER_GUARD = /"ID" = \$\d+::uuid AND "ClaimedBy" = \$\d+ AND "FenceToken" = \$\d+::integer AND "Status" = 'In Progress'/;
const WRAPPABLE = /;\s*$|RETURNING/;

describe('PostgreSQLWorkQueueSql.Claim', () => {
    const statement = sql.Claim(QUEUE_FIXTURE, 'worker-1');

    it('locks one candidate with SKIP LOCKED and returns it with the contract column names', () => {
        expect(statement.SQL).toContain('LIMIT 1\n    FOR UPDATE SKIP LOCKED');
        expect(statement.SQL).toContain('RETURNING i."ID" AS "ItemID"');
        expect(statement.SQL).toContain('i."Payload" AS "PayloadJSON"');
    });

    it('allows pending items past RunAfter and expired leases with attempts left', () => {
        expect(statement.SQL).toContain(`c."Status" = 'Pending' AND (c."RunAfter" IS NULL OR c."RunAfter" <= now())`);
        expect(statement.SQL).toContain(`c."Status" = 'In Progress' AND c."ClaimExpiresAt" < now() AND c."AttemptCount" < c."MaxAttempts"`);
    });

    it('enforces head-of-line within the partition, counting dead letters when blocking', () => {
        expect(statement.SQL).toContain('o."Sequence" < c."Sequence"');
        expect(statement.SQL).toContain(`o."Status" IN ('Pending', 'In Progress') OR ($2::boolean AND o."Status" = 'Dead Letter')`);
    });

    it('binds queue, dead-letter policy as a boolean, worker and lease', () => {
        expect(statement.Params).toEqual([QUEUE_FIXTURE.ID, true, 'worker-1', 300]);
        expect(sql.Claim({ ...QUEUE_FIXTURE, DeadLetterPolicy: 'Skip Partition' }, 'w').Params[1]).toBe(false);
    });
});

describe('PostgreSQLWorkQueueSql guarded writes', () => {
    it('extends a lease for the current owner and stays wrappable', () => {
        const statement = sql.Heartbeat('item-1', 'worker-1', 3, 120);
        expect(statement.SQL).toMatch(OWNER_GUARD);
        expect(statement.SQL).toContain('now() + make_interval(secs => $1::double precision)');
        expect(statement.SQL).not.toMatch(WRAPPABLE);
        expect(statement.Params).toEqual([120, 'item-1', 'worker-1', 3]);
    });

    it('deletes on purge and marks Completed otherwise', () => {
        expect(sql.Complete('item-1', 'w', 1, true).SQL).toMatch(/^DELETE FROM "__mj"\."WorkQueueItem"/);
        expect(sql.Complete('item-1', 'w', 1, false).SQL).toContain(`"Status" = 'Completed'`);
        expect(sql.Complete('item-1', 'w', 1, false).SQL).not.toMatch(WRAPPABLE);
    });

    it('returns a retried item to Pending with a delayed RunAfter', () => {
        const statement = sql.Retry('item-1', 'w', 2, 40, 'deadlock');
        expect(statement.SQL).toContain(`"Status" = 'Pending'`);
        expect(statement.SQL).toContain('"RunAfter" = now() + make_interval(secs => $1::double precision)');
        expect(statement.Params).toEqual([40, 'deadlock', 'item-1', 'w', 2]);
    });

    it('dead-letters with a reason for the current owner', () => {
        const statement = sql.DeadLetter('item-1', 'w', 2, 'Fatal Error', 'bad payload');
        expect(statement.SQL).toContain(`"Status" = 'Dead Letter'`);
        expect(statement.SQL).toMatch(OWNER_GUARD);
        expect(statement.Params).toEqual(['Fatal Error', 'bad payload', 'item-1', 'w', 2]);
    });

    it('reaps only expired leases on their final attempt', () => {
        const reap = sql.ReapLeaseExhausted().SQL;
        expect(reap).toContain(`'Lease Exhausted'`);
        expect(reap).toContain('"AttemptCount" >= "MaxAttempts"');
        expect(reap).not.toMatch(WRAPPABLE);
    });
});

describe('PostgreSQLWorkQueueSql.Deliver', () => {
    const targets = [
        { QueueID: 'AAAAAAAA-0000-0000-0000-000000000001', QueueName: 'a', MaxAttempts: 5 },
        { QueueID: 'AAAAAAAA-0000-0000-0000-000000000002', QueueName: 'b', MaxAttempts: 3 },
    ];

    it('inserts items for every target in one statement when there is no deduplication key', () => {
        const statement = sql.Deliver(targets, ENVELOPE_FIXTURE);
        expect(statement.SQL).not.toContain('"WorkQueueDeduplication"');
        expect(statement.SQL).toContain('VALUES ($2::uuid, $3::integer), ($4::uuid, $5::integer)');
        expect(statement.SQL.trim().endsWith('SELECT "ID" AS "ItemID", "QueueID" FROM delivered')).toBe(true);
    });

    it('accepts a queue only when its key is new or expired', () => {
        const statement = sql.Deliver(targets, { ...ENVELOPE_FIXTURE, DeduplicationKey: 'batch:1' });
        expect(statement.SQL).toContain('ON CONFLICT ("QueueID", "DeduplicationKey") DO UPDATE');
        expect(statement.SQL).toContain('WHERE d."ExpiresAt" <= now()');
        expect(statement.SQL).toContain('INNER JOIN accepted a ON a."QueueID" = t."QueueID"');
        expect(statement.Params).toContain('batch:1');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/WorkQueue && pnpm test PostgreSQLWorkQueueSql`
Expected: FAIL — unresolved import `../sql/PostgreSQLWorkQueueSql`.

- [ ] **Step 3: Write `src/sql/PostgreSQLWorkQueueSql.ts`**

```typescript
import type { DeadLetterReason, DeliveryEnvelope, DeliveryTarget, WorkQueueDefinition } from '../types';
import { QualifiedTable, type SqlBuilderExecutor, type SqlStatement } from './sqlExecution';
import { SqlParamList } from './SqlParamList';
import type { WorkQueueSqlBuilder } from './WorkQueueSqlBuilder';

const CLAIM_RETURNING = [
    'i."ID" AS "ItemID"', 'i."PublishID" AS "PublishID"', 'i."QueueID" AS "QueueID"', 'i."TopicID" AS "TopicID"',
    'i."PartitionKey" AS "PartitionKey"', 'i."TenantID" AS "TenantID"', 'i."CorrelationID" AS "CorrelationID"',
    'i."Payload" AS "PayloadJSON"', 'i."AttemptCount" AS "AttemptCount"', 'i."MaxAttempts" AS "MaxAttempts"',
    'i."FenceToken" AS "FenceToken"',
].join(', ');

export class PostgreSQLWorkQueueSql implements WorkQueueSqlBuilder {
    constructor(private readonly executor: SqlBuilderExecutor) {}

    private get items(): string {
        return QualifiedTable(this.executor, 'WorkQueueItem');
    }

    private get dedup(): string {
        return QualifiedTable(this.executor, 'WorkQueueDeduplication');
    }

    public Claim(queue: WorkQueueDefinition, workerID: string): SqlStatement {
        const p = new SqlParamList(this.executor);
        const queueID = p.Add(queue.ID);
        const blockOnDeadLetter = p.Add(queue.DeadLetterPolicy === 'Block Partition');
        const worker = p.Add(workerID);
        const lease = p.Add(queue.LeaseSeconds);
        const SQL = `UPDATE ${this.items} AS i
SET "Status" = 'In Progress', "ClaimedBy" = ${worker}, "ClaimExpiresAt" = now() + make_interval(secs => ${lease}::double precision),
    "FenceToken" = i."FenceToken" + 1, "AttemptCount" = i."AttemptCount" + 1, "StartedAt" = now()
WHERE i."ID" = (
    SELECT c."ID" FROM ${this.items} c
    WHERE c."QueueID" = ${queueID}::uuid
      AND ((c."Status" = 'Pending' AND (c."RunAfter" IS NULL OR c."RunAfter" <= now()))
        OR (c."Status" = 'In Progress' AND c."ClaimExpiresAt" < now() AND c."AttemptCount" < c."MaxAttempts"))
      AND (c."PartitionKey" IS NULL OR NOT EXISTS (
          SELECT 1 FROM ${this.items} o
          WHERE o."QueueID" = c."QueueID" AND o."PartitionKey" = c."PartitionKey" AND o."Sequence" < c."Sequence"
            AND (o."Status" IN ('Pending', 'In Progress') OR (${blockOnDeadLetter}::boolean AND o."Status" = 'Dead Letter'))))
    ORDER BY c."Priority" DESC, c."Sequence" ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING ${CLAIM_RETURNING}`;
        return { SQL, Params: p.Values };
    }

    public Heartbeat(itemID: string, workerID: string, fenceToken: number, leaseSeconds: number): SqlStatement {
        const p = new SqlParamList(this.executor);
        const lease = p.Add(leaseSeconds);
        const SQL = `UPDATE ${this.items} SET "ClaimExpiresAt" = now() + make_interval(secs => ${lease}::double precision) WHERE ${this.ownerGuard(p, itemID, workerID, fenceToken)}`;
        return { SQL, Params: p.Values };
    }

    public Complete(itemID: string, workerID: string, fenceToken: number, purge: boolean): SqlStatement {
        const p = new SqlParamList(this.executor);
        if (purge) {
            return { SQL: `DELETE FROM ${this.items} WHERE ${this.ownerGuard(p, itemID, workerID, fenceToken)}`, Params: p.Values };
        }
        const SQL = `UPDATE ${this.items} SET "Status" = 'Completed', "CompletedAt" = now(), "ClaimedBy" = NULL, "ClaimExpiresAt" = NULL WHERE ${this.ownerGuard(p, itemID, workerID, fenceToken)}`;
        return { SQL, Params: p.Values };
    }

    public Retry(itemID: string, workerID: string, fenceToken: number, delaySeconds: number, errorMessage: string): SqlStatement {
        const p = new SqlParamList(this.executor);
        const delay = p.Add(delaySeconds);
        const message = p.Add(errorMessage);
        const SQL = `UPDATE ${this.items} SET "Status" = 'Pending', "RunAfter" = now() + make_interval(secs => ${delay}::double precision), "ClaimedBy" = NULL, "ClaimExpiresAt" = NULL, "ErrorMessage" = ${message} WHERE ${this.ownerGuard(p, itemID, workerID, fenceToken)}`;
        return { SQL, Params: p.Values };
    }

    public DeadLetter(itemID: string, workerID: string, fenceToken: number, reason: DeadLetterReason, errorMessage: string): SqlStatement {
        const p = new SqlParamList(this.executor);
        const reasonParam = p.Add(reason);
        const message = p.Add(errorMessage);
        const SQL = `UPDATE ${this.items} SET "Status" = 'Dead Letter', "DeadLetterReason" = ${reasonParam}, "ErrorMessage" = ${message}, "ClaimedBy" = NULL, "ClaimExpiresAt" = NULL, "CompletedAt" = now() WHERE ${this.ownerGuard(p, itemID, workerID, fenceToken)}`;
        return { SQL, Params: p.Values };
    }

    public ReapLeaseExhausted(): SqlStatement {
        const SQL = `UPDATE ${this.items} SET "Status" = 'Dead Letter', "DeadLetterReason" = 'Lease Exhausted', "ErrorMessage" = 'Lease expired on the final attempt', "ClaimedBy" = NULL, "ClaimExpiresAt" = NULL, "CompletedAt" = now() WHERE "Status" = 'In Progress' AND "ClaimExpiresAt" < now() AND "AttemptCount" >= "MaxAttempts"`;
        return { SQL, Params: [] };
    }

    public Deliver(targets: DeliveryTarget[], envelope: DeliveryEnvelope): SqlStatement {
        const p = new SqlParamList(this.executor);
        const publishID = p.Add(envelope.PublishID);
        const rows = targets.map(t => `(${p.Add(t.QueueID)}::uuid, ${p.Add(t.MaxAttempts)}::integer)`).join(', ');
        const acceptance = envelope.DeduplicationKey
            ? `,\n${this.dedupAcceptance(p, envelope.DeduplicationKey, publishID, envelope.DeduplicationTTLSeconds)}`
            : '';
        const source = envelope.DeduplicationKey
            ? 'targets t INNER JOIN accepted a ON a."QueueID" = t."QueueID"'
            : 'targets t';
        const SQL = `WITH targets("QueueID", "MaxAttempts") AS (VALUES ${rows})${acceptance},
delivered AS (
    ${this.insertItems(p, envelope, publishID, source)}
)
SELECT "ID" AS "ItemID", "QueueID" FROM delivered`;
        return { SQL, Params: p.Values };
    }

    private dedupAcceptance(p: SqlParamList, key: string, publishID: string, ttlSeconds: number): string {
        const keyParam = p.Add(key);
        const ttl = p.Add(ttlSeconds);
        return `accepted AS (
    INSERT INTO ${this.dedup} AS d ("QueueID", "DeduplicationKey", "PublishID", "ExpiresAt")
    SELECT t."QueueID", ${keyParam}, ${publishID}::uuid, now() + make_interval(secs => ${ttl}::double precision) FROM targets t
    ON CONFLICT ("QueueID", "DeduplicationKey") DO UPDATE SET "PublishID" = EXCLUDED."PublishID", "ExpiresAt" = EXCLUDED."ExpiresAt"
    WHERE d."ExpiresAt" <= now()
    RETURNING d."QueueID"
)`;
    }

    private insertItems(p: SqlParamList, envelope: DeliveryEnvelope, publishID: string, source: string): string {
        return `INSERT INTO ${this.items} ("PublishID", "QueueID", "TopicID", "PartitionKey", "TenantID", "CorrelationID", "Payload", "Status", "Priority", "MaxAttempts", "RunAfter")
    SELECT ${publishID}::uuid, t."QueueID", ${p.Add(envelope.TopicID)}::uuid, ${p.Add(envelope.PartitionKey)}, ${p.Add(envelope.TenantID)}, ${p.Add(envelope.CorrelationID)},
           ${p.Add(envelope.PayloadJSON)}, 'Pending', ${p.Add(envelope.Priority)}::integer, t."MaxAttempts", ${p.Add(envelope.RunAfter)}::timestamptz
    FROM ${source}
    RETURNING "ID", "QueueID"`;
    }

    private ownerGuard(p: SqlParamList, itemID: string, workerID: string, fenceToken: number): string {
        return `"ID" = ${p.Add(itemID)}::uuid AND "ClaimedBy" = ${p.Add(workerID)} AND "FenceToken" = ${p.Add(fenceToken)}::integer AND "Status" = 'In Progress'`;
    }
}
```

- [ ] **Step 4: Export it**

Append to `packages/WorkQueue/src/index.ts`:

```typescript
export * from './sql/PostgreSQLWorkQueueSql';
```

- [ ] **Step 5: Run the tests**

Run: `cd packages/WorkQueue && pnpm test PostgreSQLWorkQueueSql`
Expected: PASS — 11 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/WorkQueue/src
git commit -m "feat(work-queue): PostgreSQL item statements"
```

---

### Task 7: Driver contract, deduplication SQL, native driver and ledger

**Files:**
- Create: `packages/WorkQueue/src/BaseWorkQueueDriver.ts`
- Create: `packages/WorkQueue/src/sql/DeduplicationSqlBuilder.ts`, `src/sql/SqlServerDeduplicationSql.ts`, `src/sql/PostgreSQLDeduplicationSql.ts`, `src/sql/CreateSqlBuilders.ts`
- Create: `packages/WorkQueue/src/native/NativeWorkQueueDriver.ts`, `src/ledger/DeduplicationLedger.ts`
- Modify: `packages/WorkQueue/src/__tests__/fakes.ts`, `packages/WorkQueue/src/index.ts`
- Test: `packages/WorkQueue/src/__tests__/NativeWorkQueueDriver.test.ts`, `src/__tests__/DeduplicationLedger.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 5, 6.
- Produces:
  - `abstract class BaseWorkQueueDriver` exactly as spec 02 §4.6, including the non-abstract `ValidateQueues(queues, contextUser): Promise<string[]>`
  - `interface DeduplicationSqlBuilder { PurgeExpired(): SqlStatement }`, `SqlServerDeduplicationSql`, `PostgreSQLDeduplicationSql`
  - `interface SqlBuilders { WorkQueue: WorkQueueSqlBuilder; Deduplication: DeduplicationSqlBuilder }` and `CreateSqlBuilders(executor: WorkQueueSqlExecutor): SqlBuilders`
  - `class NativeWorkQueueDriver extends BaseWorkQueueDriver` registered as `'Native'`, `constructor(executor: WorkQueueSqlExecutor, settings?: Record<string, unknown>)`
  - `class DeduplicationLedger { constructor(executor: WorkQueueSqlExecutor); PurgeExpired(contextUser: UserInfo): Promise<number> }` (plan 05 adds reservation methods)
  - Fakes: `CLAIM_ROW_FIXTURE`, `CLAIMED_ITEM_FIXTURE`

- [ ] **Step 1: Write `src/BaseWorkQueueDriver.ts`**

```typescript
import type { UserInfo } from '@memberjunction/core';
import { QueueUnsupportedReason } from './capabilities';
import type {
    ClaimedWorkItem, DeadLetterReason, DeliveredItem, DeliveryEnvelope, DeliveryTarget,
    WorkQueueDefinition, WorkQueueDriverCapabilities,
} from './types';

/**
 * Transport for work-queue items. Drivers register with @RegisterClass(BaseWorkQueueDriver, DriverKey) and
 * are constructed with (executor: WorkQueueSqlExecutor, settings: Record<string, unknown>).
 * Ownership-checked methods return false — never throw — when this worker no longer owns the item.
 */
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

    /** Problems that stop this driver processing active queues. Cloud drivers extend this with resource checks. */
    public async ValidateQueues(queues: WorkQueueDefinition[], _contextUser: UserInfo): Promise<string[]> {
        return queues
            .filter(queue => queue.IsActive)
            .map(queue => QueueUnsupportedReason(queue, this.Capabilities))
            .filter((reason): reason is string => reason !== null);
    }
}
```

- [ ] **Step 2: Write the deduplication statements**

`src/sql/DeduplicationSqlBuilder.ts`:

```typescript
import type { SqlStatement } from './sqlExecution';

/** Statements over WorkQueueDeduplication that are independent of item delivery. */
export interface DeduplicationSqlBuilder {
    PurgeExpired(): SqlStatement;
}
```

`src/sql/SqlServerDeduplicationSql.ts`:

```typescript
import type { DeduplicationSqlBuilder } from './DeduplicationSqlBuilder';
import { QualifiedTable, type SqlBuilderExecutor, type SqlStatement } from './sqlExecution';

export class SqlServerDeduplicationSql implements DeduplicationSqlBuilder {
    constructor(protected readonly executor: SqlBuilderExecutor) {}

    protected get table(): string {
        return QualifiedTable(this.executor, 'WorkQueueDeduplication');
    }

    public PurgeExpired(): SqlStatement {
        return { SQL: `DELETE FROM ${this.table} WHERE [ExpiresAt] < SYSDATETIMEOFFSET()`, Params: [] };
    }
}
```

`src/sql/PostgreSQLDeduplicationSql.ts`:

```typescript
import type { DeduplicationSqlBuilder } from './DeduplicationSqlBuilder';
import { QualifiedTable, type SqlBuilderExecutor, type SqlStatement } from './sqlExecution';

export class PostgreSQLDeduplicationSql implements DeduplicationSqlBuilder {
    constructor(protected readonly executor: SqlBuilderExecutor) {}

    protected get table(): string {
        return QualifiedTable(this.executor, 'WorkQueueDeduplication');
    }

    public PurgeExpired(): SqlStatement {
        return { SQL: `DELETE FROM ${this.table} WHERE "ExpiresAt" < now()`, Params: [] };
    }
}
```

`src/sql/CreateSqlBuilders.ts`:

```typescript
import { WorkQueueConfigurationError } from '../errors';
import type { DeduplicationSqlBuilder } from './DeduplicationSqlBuilder';
import { PostgreSQLDeduplicationSql } from './PostgreSQLDeduplicationSql';
import { PostgreSQLWorkQueueSql } from './PostgreSQLWorkQueueSql';
import { SqlServerDeduplicationSql } from './SqlServerDeduplicationSql';
import { SqlServerWorkQueueSql } from './SqlServerWorkQueueSql';
import type { WorkQueueSqlExecutor } from './sqlExecution';
import type { WorkQueueSqlBuilder } from './WorkQueueSqlBuilder';

export interface SqlBuilders {
    WorkQueue: WorkQueueSqlBuilder;
    Deduplication: DeduplicationSqlBuilder;
}

/** Picks the statement builders for the provider's database platform. */
export function CreateSqlBuilders(executor: WorkQueueSqlExecutor): SqlBuilders {
    switch (executor.PlatformKey) {
        case 'sqlserver':
            return { WorkQueue: new SqlServerWorkQueueSql(executor), Deduplication: new SqlServerDeduplicationSql(executor) };
        case 'postgresql':
            return { WorkQueue: new PostgreSQLWorkQueueSql(executor), Deduplication: new PostgreSQLDeduplicationSql(executor) };
        default:
            throw new WorkQueueConfigurationError(`The work queue does not support database platform '${String(executor.PlatformKey)}'`);
    }
}
```

- [ ] **Step 3: Extend the fakes**

Append to `packages/WorkQueue/src/__tests__/fakes.ts`:

```typescript
import type { ClaimedWorkItem } from '../types';

/** A claim row as the database returns it. */
export const CLAIM_ROW_FIXTURE = {
    ItemID: 'FFFFFFFF-0000-0000-0000-000000000001',
    PublishID: 'EEEEEEEE-0000-0000-0000-000000000001',
    QueueID: 'AAAAAAAA-0000-0000-0000-000000000001',
    TopicID: 'BBBBBBBB-0000-0000-0000-000000000001',
    PartitionKey: 'venue-42',
    TenantID: null,
    CorrelationID: 'corr-1',
    PayloadJSON: '{"importId":"x"}',
    AttemptCount: 1,
    MaxAttempts: 5,
    FenceToken: 7,
};

export const CLAIMED_ITEM_FIXTURE: ClaimedWorkItem = {
    ...CLAIM_ROW_FIXTURE,
    QueueName: 'venue-import',
    TopicName: null,
};
```

Move the new `import type` line to the top of the file with the other imports.

- [ ] **Step 4: Write the failing tests**

`packages/WorkQueue/src/__tests__/NativeWorkQueueDriver.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { NativeWorkQueueDriver } from '../native/NativeWorkQueueDriver';
import { CreateSqlBuilders } from '../sql/CreateSqlBuilders';
import { NATIVE_DRIVER_CAPABILITIES } from '../capabilities';
import { PostgreSQLWorkQueueSql } from '../sql/PostgreSQLWorkQueueSql';
import { SqlServerWorkQueueSql } from '../sql/SqlServerWorkQueueSql';
import type { WorkQueueSqlExecutor } from '../sql/sqlExecution';
import type { DatabasePlatform } from '@memberjunction/sql-dialect';
import {
    CLAIMED_ITEM_FIXTURE, CLAIM_ROW_FIXTURE, ENVELOPE_FIXTURE, QUEUE_FIXTURE, RecordingExecutor, TEST_USER,
} from './fakes';

const TARGET = { QueueID: QUEUE_FIXTURE.ID, QueueName: QUEUE_FIXTURE.Name, MaxAttempts: 5 };

describe('CreateSqlBuilders', () => {
    it('chooses builders by platform', () => {
        expect(CreateSqlBuilders(new RecordingExecutor('sqlserver')).WorkQueue).toBeInstanceOf(SqlServerWorkQueueSql);
        expect(CreateSqlBuilders(new RecordingExecutor('postgresql')).WorkQueue).toBeInstanceOf(PostgreSQLWorkQueueSql);
    });

    it('rejects an unknown platform', () => {
        const executor = new RecordingExecutor();
        const unknown: WorkQueueSqlExecutor = Object.assign(Object.create(executor), { PlatformKey: 'oracle' as DatabasePlatform });
        expect(() => CreateSqlBuilders(unknown)).toThrow("database platform 'oracle'");
    });
});

describe('NativeWorkQueueDriver', () => {
    it('declares the native capabilities', () => {
        const driver = new NativeWorkQueueDriver(new RecordingExecutor());
        expect(driver.DriverKey).toBe('Native');
        expect(driver.Capabilities).toEqual(NATIVE_DRIVER_CAPABILITIES);
    });

    it('delivers and maps the returned rows', async () => {
        const executor = new RecordingExecutor().QueueResponse([{ ItemID: 'item-1', QueueID: QUEUE_FIXTURE.ID }]);
        const delivered = await new NativeWorkQueueDriver(executor).Deliver([TARGET], ENVELOPE_FIXTURE, TEST_USER);
        expect(delivered).toEqual([{ ItemID: 'item-1', QueueID: QUEUE_FIXTURE.ID }]);
    });

    it('issues no SQL when there are no targets', async () => {
        const executor = new RecordingExecutor();
        expect(await new NativeWorkQueueDriver(executor).Deliver([], ENVELOPE_FIXTURE, TEST_USER)).toEqual([]);
        expect(executor.Calls).toHaveLength(0);
    });

    it('maps a claimed row onto a work item with the queue name', async () => {
        const executor = new RecordingExecutor().QueueResponse([CLAIM_ROW_FIXTURE]);
        const item = await new NativeWorkQueueDriver(executor).Claim(QUEUE_FIXTURE, 'worker-1', TEST_USER);
        expect(item).toEqual(CLAIMED_ITEM_FIXTURE);
    });

    it('returns null when nothing is claimable', async () => {
        expect(await new NativeWorkQueueDriver(new RecordingExecutor()).Claim(QUEUE_FIXTURE, 'w', TEST_USER)).toBeNull();
    });

    it('treats losing the in-flight partition race as nothing to claim', async () => {
        const executor = new RecordingExecutor().FailNextWith(new Error("duplicate key ... 'UQ_WorkQueueItem_InFlightPartition'"));
        expect(await new NativeWorkQueueDriver(executor).Claim(QUEUE_FIXTURE, 'w', TEST_USER)).toBeNull();
    });

    it('rethrows any other claim error', async () => {
        const executor = new RecordingExecutor().FailNextWith(new Error('connection reset'));
        await expect(new NativeWorkQueueDriver(executor).Claim(QUEUE_FIXTURE, 'w', TEST_USER)).rejects.toThrow('connection reset');
    });

    it('reports ownership through the affected-row count', async () => {
        const executor = new RecordingExecutor().QueueResponse([{ AffectedRows: 1 }]).QueueResponse([{ AffectedRows: 0 }]);
        const driver = new NativeWorkQueueDriver(executor);
        expect(await driver.Heartbeat(CLAIMED_ITEM_FIXTURE, 'w', 300, TEST_USER)).toBe(true);
        expect(await driver.Complete(CLAIMED_ITEM_FIXTURE, 'w', true, TEST_USER)).toBe(false);
        expect(executor.Calls[0].Params).toContain(7);
        expect(executor.Calls[1].SQL).toContain('DELETE FROM [__mj].[WorkQueueItem]');
    });

    it('retries and dead-letters with booleans', async () => {
        const executor = new RecordingExecutor().QueueResponse([{ AffectedRows: 1 }]).QueueResponse([{ AffectedRows: 1 }]);
        const driver = new NativeWorkQueueDriver(executor);
        expect(await driver.Retry(CLAIMED_ITEM_FIXTURE, 'w', 20, 'boom', TEST_USER)).toBe(true);
        expect(await driver.DeadLetter(CLAIMED_ITEM_FIXTURE, 'w', 'Fatal Error', 'bad', TEST_USER)).toBe(true);
    });

    it('returns the number of reaped items', async () => {
        const executor = new RecordingExecutor().QueueResponse([{ AffectedRows: 3 }]);
        expect(await new NativeWorkQueueDriver(executor).ReapLeaseExhausted(TEST_USER)).toBe(3);
    });

    it('uses PostgreSQL statements on a PostgreSQL provider', async () => {
        const executor = new RecordingExecutor('postgresql');
        await new NativeWorkQueueDriver(executor).Claim(QUEUE_FIXTURE, 'w', TEST_USER);
        expect(executor.Calls[0].SQL).toContain('FOR UPDATE SKIP LOCKED');
    });
});

describe('BaseWorkQueueDriver.ValidateQueues', () => {
    class LimitedDriver extends NativeWorkQueueDriver {
        public override readonly Capabilities = { ...NATIVE_DRIVER_CAPABILITIES, BlockPartitionDeadLetter: false };
    }

    it('reports nothing for the native driver', async () => {
        expect(await new NativeWorkQueueDriver(new RecordingExecutor()).ValidateQueues([QUEUE_FIXTURE], TEST_USER)).toEqual([]);
    });

    it('reports capability gaps for active queues only', async () => {
        const driver = new LimitedDriver(new RecordingExecutor());
        const problems = await driver.ValidateQueues([QUEUE_FIXTURE, { ...QUEUE_FIXTURE, Name: 'off', IsActive: false }], TEST_USER);
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain("Queue 'venue-import'");
    });
});
```

`packages/WorkQueue/src/__tests__/DeduplicationLedger.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DeduplicationLedger } from '../ledger/DeduplicationLedger';
import { RecordingExecutor, TEST_USER } from './fakes';

describe('DeduplicationLedger.PurgeExpired', () => {
    it('deletes expired keys on SQL Server and returns the count', async () => {
        const executor = new RecordingExecutor().QueueResponse([{ AffectedRows: 12 }]);
        expect(await new DeduplicationLedger(executor).PurgeExpired(TEST_USER)).toBe(12);
        expect(executor.Calls[0].SQL).toContain('DELETE FROM [__mj].[WorkQueueDeduplication] WHERE [ExpiresAt] < SYSDATETIMEOFFSET()');
    });

    it('deletes expired keys on PostgreSQL', async () => {
        const executor = new RecordingExecutor('postgresql').QueueResponse([{ AffectedRows: 0 }]);
        expect(await new DeduplicationLedger(executor).PurgeExpired(TEST_USER)).toBe(0);
        expect(executor.Calls[0].SQL).toContain('DELETE FROM "__mj"."WorkQueueDeduplication" WHERE "ExpiresAt" < now()');
    });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd packages/WorkQueue && pnpm test NativeWorkQueueDriver DeduplicationLedger`
Expected: FAIL — unresolved imports `../native/NativeWorkQueueDriver` and `../ledger/DeduplicationLedger`.

- [ ] **Step 6: Write `src/native/NativeWorkQueueDriver.ts`**

```typescript
import { RegisterClass } from '@memberjunction/global';
import type { UserInfo } from '@memberjunction/core';
import { BaseWorkQueueDriver } from '../BaseWorkQueueDriver';
import { NATIVE_DRIVER_CAPABILITIES } from '../capabilities';
import { IN_FLIGHT_PARTITION_INDEX } from '../constants';
import { CreateSqlBuilders } from '../sql/CreateSqlBuilders';
import { ExecuteRows, ExecuteWrite, IsUniqueViolation, type WorkQueueSqlExecutor } from '../sql/sqlExecution';
import type { WorkQueueSqlBuilder } from '../sql/WorkQueueSqlBuilder';
import type {
    ClaimedWorkItem, DeadLetterReason, DeliveredItem, DeliveryEnvelope, DeliveryTarget, WorkQueueDefinition,
} from '../types';

interface ClaimRow {
    ItemID: string;
    PublishID: string;
    QueueID: string;
    TopicID: string | null;
    PartitionKey: string | null;
    TenantID: string | null;
    CorrelationID: string | null;
    PayloadJSON: string;
    AttemptCount: number;
    MaxAttempts: number;
    FenceToken: number;
}

/** Database-native transport: every transition is one guarded statement against WorkQueueItem. */
@RegisterClass(BaseWorkQueueDriver, 'Native')
export class NativeWorkQueueDriver extends BaseWorkQueueDriver {
    public readonly DriverKey: string = 'Native';
    public readonly Capabilities = NATIVE_DRIVER_CAPABILITIES;
    private readonly sql: WorkQueueSqlBuilder;

    constructor(private readonly executor: WorkQueueSqlExecutor, _settings: Record<string, unknown> = {}) {
        super();
        this.sql = CreateSqlBuilders(executor).WorkQueue;
    }

    public async Deliver(targets: DeliveryTarget[], envelope: DeliveryEnvelope, contextUser: UserInfo): Promise<DeliveredItem[]> {
        if (targets.length === 0) {
            return [];
        }
        const rows = await ExecuteRows<DeliveredItem>(this.executor, this.sql.Deliver(targets, envelope), contextUser);
        return rows.map(row => ({ ItemID: row.ItemID, QueueID: row.QueueID }));
    }

    public async Claim(queue: WorkQueueDefinition, workerID: string, contextUser: UserInfo): Promise<ClaimedWorkItem | null> {
        try {
            const rows = await ExecuteRows<ClaimRow>(this.executor, this.sql.Claim(queue, workerID), contextUser);
            return rows.length > 0 ? toClaimedItem(rows[0], queue) : null;
        } catch (error) {
            if (IsUniqueViolation(error, IN_FLIGHT_PARTITION_INDEX)) {
                return null;
            }
            throw error;
        }
    }

    public async Heartbeat(item: ClaimedWorkItem, workerID: string, leaseSeconds: number, contextUser: UserInfo): Promise<boolean> {
        return this.owned(this.sql.Heartbeat(item.ItemID, workerID, item.FenceToken, leaseSeconds), contextUser);
    }

    public async Complete(item: ClaimedWorkItem, workerID: string, purge: boolean, contextUser: UserInfo): Promise<boolean> {
        return this.owned(this.sql.Complete(item.ItemID, workerID, item.FenceToken, purge), contextUser);
    }

    public async Retry(item: ClaimedWorkItem, workerID: string, delaySeconds: number, errorMessage: string, contextUser: UserInfo): Promise<boolean> {
        return this.owned(this.sql.Retry(item.ItemID, workerID, item.FenceToken, delaySeconds, errorMessage), contextUser);
    }

    public async DeadLetter(item: ClaimedWorkItem, workerID: string, reason: DeadLetterReason, errorMessage: string, contextUser: UserInfo): Promise<boolean> {
        return this.owned(this.sql.DeadLetter(item.ItemID, workerID, item.FenceToken, reason, errorMessage), contextUser);
    }

    public async ReapLeaseExhausted(contextUser: UserInfo): Promise<number> {
        return ExecuteWrite(this.executor, this.sql.ReapLeaseExhausted(), contextUser);
    }

    private async owned(statement: { SQL: string; Params: unknown[] }, contextUser: UserInfo): Promise<boolean> {
        return (await ExecuteWrite(this.executor, statement, contextUser)) === 1;
    }
}

function toClaimedItem(row: ClaimRow, queue: WorkQueueDefinition): ClaimedWorkItem {
    return {
        ItemID: row.ItemID,
        PublishID: row.PublishID,
        QueueID: row.QueueID,
        QueueName: queue.Name,
        TopicID: row.TopicID,
        TopicName: null,
        PartitionKey: row.PartitionKey,
        TenantID: row.TenantID,
        CorrelationID: row.CorrelationID,
        PayloadJSON: row.PayloadJSON,
        AttemptCount: Number(row.AttemptCount),
        MaxAttempts: Number(row.MaxAttempts),
        FenceToken: Number(row.FenceToken),
    };
}
```

- [ ] **Step 7: Write `src/ledger/DeduplicationLedger.ts`**

```typescript
import type { UserInfo } from '@memberjunction/core';
import { CreateSqlBuilders } from '../sql/CreateSqlBuilders';
import type { DeduplicationSqlBuilder } from '../sql/DeduplicationSqlBuilder';
import { ExecuteWrite, type WorkQueueSqlExecutor } from '../sql/sqlExecution';

/**
 * The deduplication ledger lives in the MJ database for every driver. The native driver writes keys
 * inside its delivery statement; this class owns the operations every driver shares.
 */
export class DeduplicationLedger {
    private readonly sql: DeduplicationSqlBuilder;

    constructor(private readonly executor: WorkQueueSqlExecutor) {
        this.sql = CreateSqlBuilders(executor).Deduplication;
    }

    /** Deletes keys whose window has passed. Returns the number removed. */
    public async PurgeExpired(contextUser: UserInfo): Promise<number> {
        return ExecuteWrite(this.executor, this.sql.PurgeExpired(), contextUser);
    }
}
```

- [ ] **Step 8: Export the new modules**

Append to `packages/WorkQueue/src/index.ts`:

```typescript
export * from './BaseWorkQueueDriver';
export * from './sql/DeduplicationSqlBuilder';
export * from './sql/SqlServerDeduplicationSql';
export * from './sql/PostgreSQLDeduplicationSql';
export * from './sql/CreateSqlBuilders';
export * from './native/NativeWorkQueueDriver';
export * from './ledger/DeduplicationLedger';
```

- [ ] **Step 9: Run the tests and build**

Run: `cd packages/WorkQueue && pnpm test`
Expected: PASS — all suites, including NativeWorkQueueDriver (15) and DeduplicationLedger (2).

Run: `cd packages/WorkQueue && pnpm run build`
Expected: builds.

- [ ] **Step 10: Commit**

```bash
git add packages/WorkQueue/src
git commit -m "feat(work-queue): driver contract, native driver and deduplication ledger"
```

---

### Task 8: Engine and producer

**Files:**
- Create: `packages/WorkQueue/src/metadata/definitionMapping.ts`, `src/metadata/WorkQueueEngine.ts`, `src/WorkQueueProducer.ts`
- Modify: `packages/WorkQueue/src/__tests__/fakes.ts`, `packages/WorkQueue/src/index.ts`
- Test: `packages/WorkQueue/src/__tests__/definitionMapping.test.ts`, `src/__tests__/WorkQueueProducer.test.ts`

**Interfaces:**
- Consumes: `BaseWorkQueueDriver` (Task 7); `WorkQueueMetadataIndex`, `WorkQueueMetadataSource` (Task 4); `ParseFilterRules`, `MatchesFilterRules`, `AssertPublishSupported`, `NATIVE_DRIVER_CAPABILITIES` (Task 3); `SerializePayload`, constants, types, errors (Task 2); generated `MJWorkQueueEntity`, `MJWorkQueueTopicEntity`, `MJWorkQueueSubscriptionEntity` (Task 1).
- Produces:
  - `interface WorkQueueRecord`, `WorkQueueTopicRecord`, `WorkQueueSubscriptionRecord`; `ToQueueDefinition(record)`, `ToTopicDefinition(record)`, `ToSubscriptionDefinition(record)`
  - `class WorkQueueEngine extends BaseEngine<WorkQueueEngine> implements WorkQueueMetadataSource` — `static Instance`, `Config(forceRefresh?, contextUser?, provider?)`, `GetIndex(contextUser)`
  - `class WorkQueueProducer` — `constructor(driver: BaseWorkQueueDriver, metadata: WorkQueueMetadataSource, maxPayloadBytes?: number)`, `Publish<T>(topicName, payload, contextUser, options?)`, `Enqueue<T>(queueName, payload, contextUser, options?)`, both `Promise<PublishResult>`
  - Fakes used by Tasks 9–11: `FakeDriver`, `DeliverCall`, `SettleCall`, `StaticMetadataSource`, `UPDATER_QUEUE`, `ARCHIVER_QUEUE`, `CLICK_TOPIC`, `ClickSubscriptions(archiverFilter?)`, `ClickIndex(options?)`

Publishing rules this task implements (design [01](01-design.md) §8):

- The topic must exist and be active; otherwise `WorkQueueConfigurationError`. A topic with no matching
  subscription is accepted, returns a new `PublishID` with no items, and never calls the driver.
- Options are checked against driver capabilities, and the payload is capped, **before** any delivery.
- Filters are evaluated against the payload **as serialised JSON** (`JSON.parse(payloadJSON)`), so an
  in-process publish and a REST publish of the same data route identically (a `Date` matches its ISO
  string).
- A malformed `FilterRules` value fails the publish loudly and names the subscription, rather than silently
  starving that queue.
- `DuplicateQueueNames` are the targets the driver did not return, compared with `NormalizeUUID`.

- [ ] **Step 1: Extend the fakes**

Append to `packages/WorkQueue/src/__tests__/fakes.ts`, then move the new imports to the top of the file
with the others:

```typescript
import type { UserInfo as FakeUserInfo } from '@memberjunction/core';
import { BaseWorkQueueDriver } from '../BaseWorkQueueDriver';
import { NATIVE_DRIVER_CAPABILITIES } from '../capabilities';
import { WorkQueueMetadataIndex, type WorkQueueMetadataSource } from '../metadata/WorkQueueMetadataIndex';
import type {
    DeadLetterReason, DeliveredItem, DeliveryTarget, WorkQueueDriverCapabilities,
    WorkQueueSubscriptionDefinition, WorkQueueTopicDefinition,
} from '../types';

export interface DeliverCall {
    Targets: DeliveryTarget[];
    Envelope: DeliveryEnvelope;
}

export interface SettleCall {
    Kind: 'Heartbeat' | 'Complete' | 'Retry' | 'DeadLetter';
    ItemID: string;
    FenceToken: number;
    Detail: unknown[];
}

/** In-memory driver for producer, runner and worker tests. */
export class FakeDriver extends BaseWorkQueueDriver {
    public readonly DriverKey = 'Fake';
    public Capabilities: WorkQueueDriverCapabilities = { ...NATIVE_DRIVER_CAPABILITIES };
    public readonly DeliverCalls: DeliverCall[] = [];
    public readonly SettleCalls: SettleCall[] = [];
    public readonly ClaimCalls: string[] = [];
    /** Queue IDs whose delivery is reported as a duplicate. */
    public readonly DuplicateQueueIDs = new Set<string>();
    /** Return accepted queue IDs lowercased, as PostgreSQL does. */
    public ReturnLowercaseQueueIDs = false;
    /** Items handed out by Claim, per queue name, in order. */
    public readonly Claimable = new Map<string, ClaimedWorkItem[]>();
    /** Results for successive Heartbeat calls; true once exhausted. */
    public HeartbeatResults: boolean[] = [];
    /** Result of Complete, Retry and DeadLetter. */
    public SettleResult = true;
    /** Error thrown by the next Complete, Retry or DeadLetter call. */
    public SettleError: Error | null = null;
    public ReapCount = 0;

    public async Deliver(targets: DeliveryTarget[], envelope: DeliveryEnvelope, _contextUser: FakeUserInfo): Promise<DeliveredItem[]> {
        this.DeliverCalls.push({ Targets: targets, Envelope: envelope });
        return targets
            .filter(target => !this.DuplicateQueueIDs.has(target.QueueID))
            .map(target => ({
                ItemID: `item-${target.QueueName}`,
                QueueID: this.ReturnLowercaseQueueIDs ? target.QueueID.toLowerCase() : target.QueueID,
            }));
    }

    public async Claim(queue: WorkQueueDefinition, _workerID: string, _contextUser: FakeUserInfo): Promise<ClaimedWorkItem | null> {
        this.ClaimCalls.push(queue.Name);
        return this.Claimable.get(queue.Name)?.shift() ?? null;
    }

    public async Heartbeat(item: ClaimedWorkItem, _workerID: string, leaseSeconds: number, _contextUser: FakeUserInfo): Promise<boolean> {
        this.record('Heartbeat', item, [leaseSeconds]);
        return this.HeartbeatResults.shift() ?? true;
    }

    public async Complete(item: ClaimedWorkItem, _workerID: string, purge: boolean, _contextUser: FakeUserInfo): Promise<boolean> {
        return this.settle('Complete', item, [purge]);
    }

    public async Retry(item: ClaimedWorkItem, _workerID: string, delaySeconds: number, errorMessage: string, _contextUser: FakeUserInfo): Promise<boolean> {
        return this.settle('Retry', item, [delaySeconds, errorMessage]);
    }

    public async DeadLetter(item: ClaimedWorkItem, _workerID: string, reason: DeadLetterReason, errorMessage: string, _contextUser: FakeUserInfo): Promise<boolean> {
        return this.settle('DeadLetter', item, [reason, errorMessage]);
    }

    public async ReapLeaseExhausted(_contextUser: FakeUserInfo): Promise<number> {
        return this.ReapCount;
    }

    private settle(kind: SettleCall['Kind'], item: ClaimedWorkItem, detail: unknown[]): boolean {
        this.record(kind, item, detail);
        if (this.SettleError) {
            const error = this.SettleError;
            this.SettleError = null;
            throw error;
        }
        return this.SettleResult;
    }

    private record(kind: SettleCall['Kind'], item: ClaimedWorkItem, detail: unknown[]): void {
        this.SettleCalls.push({ Kind: kind, ItemID: item.ItemID, FenceToken: item.FenceToken, Detail: detail });
    }
}

/** Metadata source that always answers with the same index. */
export class StaticMetadataSource implements WorkQueueMetadataSource {
    public Calls = 0;

    constructor(public Index: WorkQueueMetadataIndex) {}

    public async GetIndex(_contextUser: FakeUserInfo): Promise<WorkQueueMetadataIndex> {
        this.Calls++;
        return this.Index;
    }
}

export const UPDATER_QUEUE: WorkQueueDefinition = {
    ...QUEUE_FIXTURE,
    ID: 'AAAAAAAA-0000-0000-0000-000000000011',
    Name: 'person-click-updater',
    DeadLetterPolicy: 'Skip Partition',
};

export const ARCHIVER_QUEUE: WorkQueueDefinition = {
    ...UPDATER_QUEUE,
    ID: 'AAAAAAAA-0000-0000-0000-000000000012',
    Name: 'click-archiver',
};

export const CLICK_TOPIC: WorkQueueTopicDefinition = {
    ID: 'BBBBBBBB-0000-0000-0000-000000000011',
    Name: 'link.clicked',
    AllowExternalPublish: false,
    IsActive: true,
};

/** link.clicked → person-click-updater (no filter) and click-archiver (optional filter). */
export function ClickSubscriptions(archiverFilter: string | null = null): WorkQueueSubscriptionDefinition[] {
    return [
        { ID: 'CCCCCCCC-0000-0000-0000-000000000011', TopicID: CLICK_TOPIC.ID, QueueID: UPDATER_QUEUE.ID, FilterRules: null, IsActive: true },
        { ID: 'CCCCCCCC-0000-0000-0000-000000000012', TopicID: CLICK_TOPIC.ID, QueueID: ARCHIVER_QUEUE.ID, FilterRules: archiverFilter, IsActive: true },
    ];
}

export interface ClickIndexOptions {
    ArchiverFilter?: string | null;
    Queues?: WorkQueueDefinition[];
    Topics?: WorkQueueTopicDefinition[];
}

/** The use-case-1 metadata plus QUEUE_FIXTURE ('venue-import'), with overrides. */
export function ClickIndex(options: ClickIndexOptions = {}): WorkQueueMetadataIndex {
    return new WorkQueueMetadataIndex(
        options.Queues ?? [UPDATER_QUEUE, ARCHIVER_QUEUE, QUEUE_FIXTURE],
        options.Topics ?? [CLICK_TOPIC],
        ClickSubscriptions(options.ArchiverFilter ?? null),
    );
}
```

`fakes.ts` already imports `UserInfo`, `DeliveryEnvelope`, `WorkQueueDefinition` and `ClaimedWorkItem`. When
you merge the imports, drop the `FakeUserInfo` alias and use `UserInfo`.

- [ ] **Step 2: Write the failing tests**

`packages/WorkQueue/src/__tests__/definitionMapping.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ToQueueDefinition, ToSubscriptionDefinition, ToTopicDefinition } from '../metadata/definitionMapping';
import { WorkQueueConfigurationError } from '../errors';

const QUEUE_RECORD = {
    ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'venue-import', Description: 'not copied',
    LeaseSeconds: 300, MaxAttempts: 3, InitialBackoffSeconds: 60, MaxBackoffSeconds: 1800,
    DeadLetterPolicy: 'Block Partition', PurgeOnComplete: false, IsActive: true,
};

describe('definition mapping', () => {
    it('copies exactly the queue definition fields', () => {
        expect(ToQueueDefinition(QUEUE_RECORD)).toEqual({
            ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'venue-import', LeaseSeconds: 300, MaxAttempts: 3,
            InitialBackoffSeconds: 60, MaxBackoffSeconds: 1800, DeadLetterPolicy: 'Block Partition',
            PurgeOnComplete: false, IsActive: true,
        });
    });

    it('reads getter-backed properties, as generated entity classes expose them', () => {
        class TopicLike {
            get ID(): string { return 'BBBBBBBB-0000-0000-0000-000000000001'; }
            get Name(): string { return 'import.ready'; }
            get AllowExternalPublish(): boolean { return true; }
            get IsActive(): boolean { return true; }
        }
        expect(ToTopicDefinition(new TopicLike())).toEqual({
            ID: 'BBBBBBBB-0000-0000-0000-000000000001', Name: 'import.ready', AllowExternalPublish: true, IsActive: true,
        });
    });

    it('rejects an unknown dead-letter policy', () => {
        expect(() => ToQueueDefinition({ ...QUEUE_RECORD, DeadLetterPolicy: 'Drop' }))
            .toThrow(WorkQueueConfigurationError);
    });

    it('keeps a null filter on a subscription', () => {
        const record = { ID: 'C1', TopicID: 'T1', QueueID: 'Q1', FilterRules: null, IsActive: false };
        expect(ToSubscriptionDefinition(record)).toEqual(record);
    });
});
```

`packages/WorkQueue/src/__tests__/WorkQueueProducer.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { WorkQueueProducer } from '../WorkQueueProducer';
import { PayloadTooLargeError, WorkQueueConfigurationError } from '../errors';
import type { WorkQueueMetadataIndex } from '../metadata/WorkQueueMetadataIndex';
import {
    ARCHIVER_QUEUE, CLICK_TOPIC, ClickIndex, FakeDriver, QUEUE_FIXTURE, StaticMetadataSource, TEST_USER, UPDATER_QUEUE,
} from './fakes';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLICK = { clickId: 'abc', personId: 'p-1', eventType: 'email' };

let driver: FakeDriver;

function producerFor(index: WorkQueueMetadataIndex = ClickIndex(), maxBytes?: number): WorkQueueProducer {
    return new WorkQueueProducer(driver, new StaticMetadataSource(index), maxBytes);
}

function targetNames(): string[] {
    return driver.DeliverCalls[0].Targets.map(target => target.QueueName);
}

beforeEach(() => {
    driver = new FakeDriver();
});

describe('WorkQueueProducer.Publish', () => {
    it('delivers one item per active subscription under one publish ID', async () => {
        const result = await producerFor().Publish('link.clicked', CLICK, TEST_USER);
        expect(result.PublishID).toMatch(UUID_PATTERN);
        expect(result.ItemIDs).toEqual(['item-person-click-updater', 'item-click-archiver']);
        expect(result.DuplicateQueueNames).toEqual([]);
        expect(targetNames()).toEqual(['person-click-updater', 'click-archiver']);
        const envelope = driver.DeliverCalls[0].Envelope;
        expect(envelope.PublishID).toBe(result.PublishID);
        expect(envelope.TopicID).toBe(CLICK_TOPIC.ID);
        expect(envelope.TopicName).toBe('link.clicked');
        expect(envelope.PayloadJSON).toBe(JSON.stringify(CLICK));
    });

    it('uses a new publish ID for every publish', async () => {
        const producer = producerFor();
        const first = await producer.Publish('link.clicked', CLICK, TEST_USER);
        const second = await producer.Publish('link.clicked', CLICK, TEST_USER);
        expect(first.PublishID).not.toBe(second.PublishID);
    });

    it('copies publish options onto the envelope', async () => {
        const runAfter = new Date('2026-09-15T12:00:00Z');
        await producerFor().Publish('link.clicked', CLICK, TEST_USER, {
            PartitionKey: 'person-1', TenantID: 't-1', CorrelationID: 'c-1', DeduplicationKey: 'click:abc',
            DeduplicationTTLSeconds: 600, Priority: 3, RunAfter: runAfter,
        });
        expect(driver.DeliverCalls[0].Envelope).toMatchObject({
            PartitionKey: 'person-1', TenantID: 't-1', CorrelationID: 'c-1', DeduplicationKey: 'click:abc',
            DeduplicationTTLSeconds: 600, Priority: 3, RunAfter: runAfter,
        });
    });

    it('fills defaults for omitted options', async () => {
        await producerFor().Publish('link.clicked', CLICK, TEST_USER);
        expect(driver.DeliverCalls[0].Envelope).toMatchObject({
            PartitionKey: null, TenantID: null, CorrelationID: null, DeduplicationKey: null,
            DeduplicationTTLSeconds: 86400, Priority: 0, RunAfter: null,
        });
    });

    it('delivers only to subscriptions whose filter rules match', async () => {
        await producerFor(ClickIndex({ ArchiverFilter: '{"eventType":"sms"}' })).Publish('link.clicked', CLICK, TEST_USER);
        expect(targetNames()).toEqual(['person-click-updater']);
    });

    it('evaluates filters against the payload as serialised JSON', async () => {
        const payload = { eventType: 'email', at: new Date('2026-09-15T00:00:00.000Z') };
        const index = ClickIndex({ ArchiverFilter: '{"at":"2026-09-15T00:00:00.000Z"}' });
        await producerFor(index).Publish('link.clicked', payload, TEST_USER);
        expect(targetNames()).toEqual(['person-click-updater', 'click-archiver']);
    });

    it('skips inactive queues', async () => {
        const index = ClickIndex({ Queues: [UPDATER_QUEUE, { ...ARCHIVER_QUEUE, IsActive: false }] });
        await producerFor(index).Publish('link.clicked', CLICK, TEST_USER);
        expect(targetNames()).toEqual(['person-click-updater']);
    });

    it('accepts a publish that no subscription matches without calling the driver', async () => {
        const index = ClickIndex({ ArchiverFilter: '{"eventType":"sms"}', Queues: [{ ...UPDATER_QUEUE, IsActive: false }, ARCHIVER_QUEUE] });
        const result = await producerFor(index).Publish('link.clicked', CLICK, TEST_USER);
        expect(result.PublishID).toMatch(UUID_PATTERN);
        expect(result.ItemIDs).toEqual([]);
        expect(driver.DeliverCalls).toHaveLength(0);
    });

    it('names the queues that dropped the publish as a duplicate, whatever the UUID case', async () => {
        driver.DuplicateQueueIDs.add(ARCHIVER_QUEUE.ID);
        driver.ReturnLowercaseQueueIDs = true;
        const result = await producerFor().Publish('link.clicked', CLICK, TEST_USER, { DeduplicationKey: 'click:abc' });
        expect(result.ItemIDs).toEqual(['item-person-click-updater']);
        expect(result.DuplicateQueueNames).toEqual(['click-archiver']);
    });

    it('rejects an unknown or inactive topic', async () => {
        await expect(producerFor().Publish('nope', CLICK, TEST_USER)).rejects.toThrow("Unknown or inactive work-queue topic 'nope'");
        const index = ClickIndex({ Topics: [{ ...CLICK_TOPIC, IsActive: false }] });
        await expect(producerFor(index).Publish('link.clicked', CLICK, TEST_USER)).rejects.toThrow(WorkQueueConfigurationError);
    });

    it('rejects an oversized payload before delivery', async () => {
        const producer = producerFor(ClickIndex(), 50);
        await expect(producer.Publish('link.clicked', { text: 'x'.repeat(100) }, TEST_USER)).rejects.toThrow(PayloadTooLargeError);
        expect(driver.DeliverCalls).toHaveLength(0);
    });

    it('rejects options the driver cannot honour', async () => {
        driver.Capabilities = { ...driver.Capabilities, DelayedPublish: false };
        await expect(producerFor().Publish('link.clicked', CLICK, TEST_USER, { RunAfter: new Date() })).rejects.toThrow('RunAfter');
        expect(driver.DeliverCalls).toHaveLength(0);
    });

    it('rejects a deduplication window that is not a positive whole number of seconds', async () => {
        for (const ttl of [0, -5, 1.5]) {
            await expect(producerFor().Publish('link.clicked', CLICK, TEST_USER, { DeduplicationTTLSeconds: ttl }))
                .rejects.toThrow('DeduplicationTTLSeconds');
        }
    });

    it('names the subscription whose filter rules are malformed', async () => {
        await expect(producerFor(ClickIndex({ ArchiverFilter: '{not json' })).Publish('link.clicked', CLICK, TEST_USER))
            .rejects.toThrow('CCCCCCCC-0000-0000-0000-000000000012 has invalid FilterRules');
    });
});

describe('WorkQueueProducer.Enqueue', () => {
    it('delivers to exactly one queue with no topic', async () => {
        const result = await producerFor().Enqueue(' Venue-Import ', { importId: 1 }, TEST_USER, { PartitionKey: 'venue-42' });
        expect(result.ItemIDs).toEqual(['item-venue-import']);
        expect(driver.DeliverCalls[0].Targets).toEqual([{ QueueID: QUEUE_FIXTURE.ID, QueueName: 'venue-import', MaxAttempts: 5 }]);
        expect(driver.DeliverCalls[0].Envelope).toMatchObject({ TopicID: null, TopicName: null, PartitionKey: 'venue-42' });
    });

    it('rejects an unknown or inactive queue', async () => {
        await expect(producerFor().Enqueue('nope', {}, TEST_USER)).rejects.toThrow("Unknown or inactive work queue 'nope'");
        const index = ClickIndex({ Queues: [{ ...QUEUE_FIXTURE, IsActive: false }] });
        await expect(producerFor(index).Enqueue('venue-import', {}, TEST_USER)).rejects.toThrow(WorkQueueConfigurationError);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/WorkQueue && pnpm test definitionMapping WorkQueueProducer`
Expected: FAIL — unresolved imports `../metadata/definitionMapping` and `../WorkQueueProducer`.

- [ ] **Step 4: Write `src/metadata/definitionMapping.ts`**

```typescript
import { WorkQueueConfigurationError } from '../errors';
import type {
    DeadLetterPolicy, WorkQueueDefinition, WorkQueueSubscriptionDefinition, WorkQueueTopicDefinition,
} from '../types';

/** Queue columns the work queue reads. The generated MJWorkQueueEntity satisfies this structurally. */
export interface WorkQueueRecord {
    ID: string;
    Name: string;
    LeaseSeconds: number;
    MaxAttempts: number;
    InitialBackoffSeconds: number;
    MaxBackoffSeconds: number;
    DeadLetterPolicy: string;
    PurgeOnComplete: boolean;
    IsActive: boolean;
}

export interface WorkQueueTopicRecord {
    ID: string;
    Name: string;
    AllowExternalPublish: boolean;
    IsActive: boolean;
}

export interface WorkQueueSubscriptionRecord {
    ID: string;
    TopicID: string;
    QueueID: string;
    FilterRules: string | null;
    IsActive: boolean;
}

// Every mapper copies named properties. Entity classes expose fields as getters, so spreading one
// would produce an empty object.

export function ToQueueDefinition(record: WorkQueueRecord): WorkQueueDefinition {
    return {
        ID: record.ID,
        Name: record.Name,
        LeaseSeconds: record.LeaseSeconds,
        MaxAttempts: record.MaxAttempts,
        InitialBackoffSeconds: record.InitialBackoffSeconds,
        MaxBackoffSeconds: record.MaxBackoffSeconds,
        DeadLetterPolicy: toDeadLetterPolicy(record),
        PurgeOnComplete: record.PurgeOnComplete,
        IsActive: record.IsActive,
    };
}

export function ToTopicDefinition(record: WorkQueueTopicRecord): WorkQueueTopicDefinition {
    return { ID: record.ID, Name: record.Name, AllowExternalPublish: record.AllowExternalPublish, IsActive: record.IsActive };
}

export function ToSubscriptionDefinition(record: WorkQueueSubscriptionRecord): WorkQueueSubscriptionDefinition {
    return {
        ID: record.ID,
        TopicID: record.TopicID,
        QueueID: record.QueueID,
        FilterRules: record.FilterRules,
        IsActive: record.IsActive,
    };
}

function toDeadLetterPolicy(record: WorkQueueRecord): DeadLetterPolicy {
    if (record.DeadLetterPolicy === 'Block Partition' || record.DeadLetterPolicy === 'Skip Partition') {
        return record.DeadLetterPolicy;
    }
    throw new WorkQueueConfigurationError(
        `Work queue '${record.Name}' has unknown DeadLetterPolicy '${record.DeadLetterPolicy}'`,
    );
}
```

- [ ] **Step 5: Write `src/metadata/WorkQueueEngine.ts`**

```typescript
import { BaseEngine, type BaseEnginePropertyConfig, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type {
    MJWorkQueueEntity, MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity,
} from '@memberjunction/core-entities';
import { WorkQueueEntityNames } from '../constants';
import { ToQueueDefinition, ToSubscriptionDefinition, ToTopicDefinition } from './definitionMapping';
import { WorkQueueMetadataIndex, type WorkQueueMetadataSource } from './WorkQueueMetadataIndex';

/**
 * Cached queue, topic and subscription metadata. BaseEngine refreshes the cache when these entities are
 * saved through MJ in this process. Changes saved on another server instance, or by direct SQL, are seen
 * after Config(true, contextUser) or a restart.
 */
export class WorkQueueEngine extends BaseEngine<WorkQueueEngine> implements WorkQueueMetadataSource {
    private _queues: MJWorkQueueEntity[] = [];
    private _topics: MJWorkQueueTopicEntity[] = [];
    private _subscriptions: MJWorkQueueSubscriptionEntity[] = [];

    public static get Instance(): WorkQueueEngine {
        return super.getInstance<WorkQueueEngine>();
    }

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            { Type: 'entity', EntityName: WorkQueueEntityNames.Queues, PropertyName: '_queues' },
            { Type: 'entity', EntityName: WorkQueueEntityNames.Topics, PropertyName: '_topics' },
            { Type: 'entity', EntityName: WorkQueueEntityNames.Subscriptions, PropertyName: '_subscriptions' },
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    /** Builds a fresh index from the cache. Metadata is a few dozen rows, so no memoisation is needed. */
    public async GetIndex(contextUser: UserInfo): Promise<WorkQueueMetadataIndex> {
        await this.EnsureLoaded(contextUser);
        return new WorkQueueMetadataIndex(
            this.GetConfigData<MJWorkQueueEntity>('_queues').map(ToQueueDefinition),
            this.GetConfigData<MJWorkQueueTopicEntity>('_topics').map(ToTopicDefinition),
            this.GetConfigData<MJWorkQueueSubscriptionEntity>('_subscriptions').map(ToSubscriptionDefinition),
        );
    }
}
```

`WorkQueueEngine` has no unit test: its only logic is the mapping tested above, and loading needs a live
provider. The integration bundle (Task 16) exercises it end to end. If CodeGen named the entity classes
differently in Task 1, change the three type imports here.

- [ ] **Step 6: Write `src/WorkQueueProducer.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { UserInfo } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import type { BaseWorkQueueDriver } from './BaseWorkQueueDriver';
import { AssertPublishSupported } from './capabilities';
import { WORK_QUEUE_DEFAULT_DEDUP_TTL_SECONDS, WORK_QUEUE_MAX_PAYLOAD_BYTES } from './constants';
import { WorkQueueConfigurationError } from './errors';
import { MatchesFilterRules, ParseFilterRules } from './filterRules';
import type { WorkQueueMetadataIndex, WorkQueueMetadataSource } from './metadata/WorkQueueMetadataIndex';
import { SerializePayload } from './payload';
import type {
    DeliveryEnvelope, DeliveryTarget, PublishOptions, PublishResult, WorkQueueDefinition,
    WorkQueueSubscriptionDefinition, WorkQueueTopicDefinition,
} from './types';

/** The one publishing path, shared by in-process code and the REST endpoint. */
export class WorkQueueProducer {
    constructor(
        private readonly driver: BaseWorkQueueDriver,
        private readonly metadata: WorkQueueMetadataSource,
        private readonly maxPayloadBytes: number = WORK_QUEUE_MAX_PAYLOAD_BYTES,
    ) {}

    /** Delivers one item to every active queue whose subscription to the topic matches the payload. */
    public async Publish<T>(topicName: string, payload: T, contextUser: UserInfo, options: PublishOptions = {}): Promise<PublishResult> {
        const index = await this.metadata.GetIndex(contextUser);
        const topic = index.TopicByName(topicName);
        if (!topic || !topic.IsActive) {
            throw new WorkQueueConfigurationError(`Unknown or inactive work-queue topic '${topicName}'`);
        }
        const payloadJSON = this.preparePayload(payload, options);
        // Filters see the payload as every consumer will: parsed from the serialised JSON.
        const targets = subscribedTargets(index, topic, JSON.parse(payloadJSON));
        return this.deliver(targets, buildEnvelope(topic, payloadJSON, options), contextUser);
    }

    /** Delivers one item straight to one queue, bypassing topics and filters. */
    public async Enqueue<T>(queueName: string, payload: T, contextUser: UserInfo, options: PublishOptions = {}): Promise<PublishResult> {
        const index = await this.metadata.GetIndex(contextUser);
        const queue = index.QueueByName(queueName);
        if (!queue || !queue.IsActive) {
            throw new WorkQueueConfigurationError(`Unknown or inactive work queue '${queueName}'`);
        }
        const payloadJSON = this.preparePayload(payload, options);
        return this.deliver([toTarget(queue)], buildEnvelope(null, payloadJSON, options), contextUser);
    }

    private preparePayload<T>(payload: T, options: PublishOptions): string {
        AssertPublishSupported(options, this.driver.Capabilities);
        assertValidTTL(options.DeduplicationTTLSeconds);
        return SerializePayload(payload, this.maxPayloadBytes);
    }

    private async deliver(targets: DeliveryTarget[], envelope: DeliveryEnvelope, contextUser: UserInfo): Promise<PublishResult> {
        if (targets.length === 0) {
            return { PublishID: envelope.PublishID, ItemIDs: [], DuplicateQueueNames: [] };
        }
        const delivered = await this.driver.Deliver(targets, envelope, contextUser);
        const accepted = new Set(delivered.map(item => NormalizeUUID(item.QueueID)));
        return {
            PublishID: envelope.PublishID,
            ItemIDs: delivered.map(item => item.ItemID),
            DuplicateQueueNames: targets.filter(t => !accepted.has(NormalizeUUID(t.QueueID))).map(t => t.QueueName),
        };
    }
}

function buildEnvelope(topic: WorkQueueTopicDefinition | null, payloadJSON: string, options: PublishOptions): DeliveryEnvelope {
    return {
        PublishID: randomUUID(),
        TopicID: topic?.ID ?? null,
        TopicName: topic?.Name ?? null,
        PartitionKey: options.PartitionKey ?? null,
        TenantID: options.TenantID ?? null,
        CorrelationID: options.CorrelationID ?? null,
        PayloadJSON: payloadJSON,
        Priority: options.Priority ?? 0,
        RunAfter: options.RunAfter ?? null,
        DeduplicationKey: options.DeduplicationKey ?? null,
        DeduplicationTTLSeconds: options.DeduplicationTTLSeconds ?? WORK_QUEUE_DEFAULT_DEDUP_TTL_SECONDS,
    };
}

function subscribedTargets(index: WorkQueueMetadataIndex, topic: WorkQueueTopicDefinition, payload: unknown): DeliveryTarget[] {
    const targets: DeliveryTarget[] = [];
    for (const subscription of index.ActiveSubscriptionsForTopic(topic.ID)) {
        const queue = index.QueueByID(subscription.QueueID);
        if (queue?.IsActive && subscriptionMatches(subscription, payload)) {
            targets.push(toTarget(queue));
        }
    }
    return targets;
}

function subscriptionMatches(subscription: WorkQueueSubscriptionDefinition, payload: unknown): boolean {
    try {
        return MatchesFilterRules(payload, ParseFilterRules(subscription.FilterRules));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new WorkQueueConfigurationError(`Work-queue subscription ${subscription.ID} has invalid FilterRules: ${message}`);
    }
}

function toTarget(queue: WorkQueueDefinition): DeliveryTarget {
    return { QueueID: queue.ID, QueueName: queue.Name, MaxAttempts: queue.MaxAttempts };
}

function assertValidTTL(ttlSeconds: number | undefined): void {
    if (ttlSeconds !== undefined && (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0)) {
        throw new WorkQueueConfigurationError('DeduplicationTTLSeconds must be a positive whole number of seconds');
    }
}
```

- [ ] **Step 7: Export the new modules**

Append to `packages/WorkQueue/src/index.ts`:

```typescript
export * from './metadata/definitionMapping';
export * from './metadata/WorkQueueEngine';
export * from './WorkQueueProducer';
```

- [ ] **Step 8: Run the tests and build**

Run: `cd packages/WorkQueue && pnpm test`
Expected: PASS — all suites, including definitionMapping (4) and WorkQueueProducer (16).

Run: `cd packages/WorkQueue && pnpm run build`
Expected: builds. A missing `MJWorkQueueEntity` export means Task 1's CodeGen step did not run or named
the classes differently.

- [ ] **Step 9: Commit**

```bash
git add packages/WorkQueue/src
git commit -m "feat(work-queue): metadata engine and producer with fan-out, filters and dedup reporting"
```

---

### Task 9: Handler resolution and item runner

**Files:**
- Create: `packages/WorkQueue/src/BaseWorkQueueHandler.ts`, `src/handlers/ResolveWorkQueueHandler.ts`, `src/worker/WorkQueueItemRunner.ts`
- Modify: `packages/WorkQueue/src/__tests__/fakes.ts`, `packages/WorkQueue/src/index.ts`
- Test: `packages/WorkQueue/src/__tests__/ResolveWorkQueueHandler.test.ts`, `src/__tests__/WorkQueueItemRunner.test.ts`

**Interfaces:**
- Consumes: `BaseWorkQueueDriver` (Task 7); `ComputeBackoffSeconds` (Task 3); `ParsePayload`, `FatalQueueError`, `TransientQueueError`, `WORK_QUEUE_FALLBACK_HANDLER_KEY`, `ClaimedWorkItem`, `WorkQueueContext`, `WorkQueueDefinition`, `DeadLetterReason` (Task 2); `FakeDriver`, `CLAIMED_ITEM_FIXTURE`, `QUEUE_FIXTURE`, `TEST_USER` (Tasks 5, 7, 8 fakes).
- Produces:
  - `abstract class BaseWorkQueueHandler<T = Record<string, unknown>> { Handle(context: WorkQueueContext<T>): Promise<void> }`
  - `ResolveWorkQueueHandler(queueName: string): BaseWorkQueueHandler | null`
  - `type ItemOutcome` and `class WorkQueueItemRunner` — `constructor(driver, workerID: string, heartbeatMinIntervalMs: number, now?: () => number)`, `Run(item, queue, handler | null, contextUser, provider): Promise<ItemOutcome>`
  - Fakes used by Task 10: `TEST_PROVIDER`, `ScriptedHandler`

Rules the runner implements (design [01](01-design.md) §6–7):

| Situation | Settle | Outcome |
| --- | --- | --- |
| No handler | `DeadLetter('Handler Not Found')` | `DeadLettered` |
| Payload is not valid JSON | `DeadLetter('Fatal Error')`, handler not called | `DeadLettered` |
| Handler returns | `Complete(purge = queue.PurgeOnComplete)` | `Completed` |
| Handler throws `FatalQueueError` | `DeadLetter('Fatal Error')` | `DeadLettered` |
| Handler throws anything else, `AttemptCount >= MaxAttempts` | `DeadLetter('Max Attempts Exceeded')` | `DeadLettered` |
| Handler throws anything else, attempts left | `Retry(ComputeBackoffSeconds(...))`, honouring `TransientQueueError.RetryAfterSeconds` | `Retried` |
| A heartbeat returned false (before or after the handler finishes) | none | `LeaseLost` |
| The settle returns false or throws | — | `LeaseLost` (the current owner, or lease expiry, decides) |

`Heartbeat()` renews through the driver at most once per `heartbeatMinIntervalMs`; calls in between return
`true` without I/O. Concurrent calls share one renewal. Once a renewal returns false, every later call
returns false without I/O and `LeaseLost` is true. A renewal that throws propagates to the handler.
`Run` never throws.

- [ ] **Step 1: Write `src/BaseWorkQueueHandler.ts`**

```typescript
import type { WorkQueueContext } from './types';

/**
 * Processes the items of one queue. Register with @RegisterClass(BaseWorkQueueHandler, '<queue name>');
 * a new instance handles each item.
 *
 * Handlers must be idempotent — an item can run again after a crash between the work and the settle.
 * In long work, call context.Heartbeat() at progress boundaries and stop writing once it returns false.
 * Throw FatalQueueError for input that retrying cannot fix.
 */
export abstract class BaseWorkQueueHandler<T = Record<string, unknown>> {
    public abstract Handle(context: WorkQueueContext<T>): Promise<void>;
}
```

- [ ] **Step 2: Extend the fakes**

Append to `packages/WorkQueue/src/__tests__/fakes.ts`, moving the imports to the top of the file (merge
`IMetadataProvider` into the existing `@memberjunction/core` import and `WorkQueueContext` into the
existing `../types` import):

```typescript
import type { IMetadataProvider } from '@memberjunction/core';
import { BaseWorkQueueHandler } from '../BaseWorkQueueHandler';
import type { WorkQueueContext } from '../types';

export const TEST_PROVIDER = {} as IMetadataProvider;

/** Handler whose behaviour the test supplies. */
export class ScriptedHandler extends BaseWorkQueueHandler {
    constructor(private readonly script: (context: WorkQueueContext) => Promise<void>) {
        super();
    }

    public Handle(context: WorkQueueContext): Promise<void> {
        return this.script(context);
    }
}
```

- [ ] **Step 3: Write the failing tests**

`packages/WorkQueue/src/__tests__/ResolveWorkQueueHandler.test.ts` — the tests run in order, and the last
one registers the fallback:

```typescript
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseWorkQueueHandler } from '../BaseWorkQueueHandler';
import { WORK_QUEUE_FALLBACK_HANDLER_KEY } from '../constants';
import { ResolveWorkQueueHandler } from '../handlers/ResolveWorkQueueHandler';
import type { WorkQueueContext } from '../types';

class ResolverTestHandler extends BaseWorkQueueHandler {
    public async Handle(_context: WorkQueueContext): Promise<void> {}
}

class ResolverFallbackHandler extends BaseWorkQueueHandler {
    public async Handle(_context: WorkQueueContext): Promise<void> {}
}

function register(subClass: unknown, key: string): void {
    MJGlobal.Instance.ClassFactory.Register(BaseWorkQueueHandler, subClass, key);
}

describe('ResolveWorkQueueHandler', () => {
    it('returns null when neither the queue nor the fallback has a handler', () => {
        expect(ResolveWorkQueueHandler('resolver-unregistered')).toBeNull();
    });

    it('returns a new instance of the handler registered for the queue, matching case-insensitively', () => {
        register(ResolverTestHandler, 'resolver-test-queue');
        const first = ResolveWorkQueueHandler('Resolver-Test-Queue');
        expect(first).toBeInstanceOf(ResolverTestHandler);
        expect(ResolveWorkQueueHandler('resolver-test-queue')).not.toBe(first);
    });

    it('uses the fallback handler only when the queue has none', () => {
        register(ResolverFallbackHandler, WORK_QUEUE_FALLBACK_HANDLER_KEY);
        expect(ResolveWorkQueueHandler('resolver-unregistered')).toBeInstanceOf(ResolverFallbackHandler);
        expect(ResolveWorkQueueHandler('resolver-test-queue')).toBeInstanceOf(ResolverTestHandler);
    });
});
```

`packages/WorkQueue/src/__tests__/WorkQueueItemRunner.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { WorkQueueItemRunner, type ItemOutcome } from '../worker/WorkQueueItemRunner';
import { FatalQueueError, TransientQueueError } from '../errors';
import type { ClaimedWorkItem, WorkQueueContext } from '../types';
import {
    CLAIMED_ITEM_FIXTURE, FakeDriver, QUEUE_FIXTURE, ScriptedHandler, TEST_PROVIDER, TEST_USER,
} from './fakes';

let driver: FakeDriver;
let clock: number;

function run(script: (context: WorkQueueContext) => Promise<void>, item: ClaimedWorkItem = CLAIMED_ITEM_FIXTURE): Promise<ItemOutcome> {
    const runner = new WorkQueueItemRunner(driver, 'worker-1', 5000, () => clock);
    return runner.Run(item, QUEUE_FIXTURE, new ScriptedHandler(script), TEST_USER, TEST_PROVIDER);
}

function settlements(): string[] {
    return driver.SettleCalls.map(call => call.Kind);
}

beforeEach(() => {
    driver = new FakeDriver();
    clock = 0;
});

describe('WorkQueueItemRunner outcomes', () => {
    it('completes a successful item, purging as the queue specifies', async () => {
        expect(await run(async () => {})).toEqual({ Kind: 'Completed' });
        expect(driver.SettleCalls).toEqual([{ Kind: 'Complete', ItemID: CLAIMED_ITEM_FIXTURE.ItemID, FenceToken: 7, Detail: [true] }]);
    });

    it('gives the handler the parsed payload and the item facts', async () => {
        let seen: WorkQueueContext | undefined;
        await run(async context => {
            seen = context;
        });
        expect(seen).toMatchObject({
            ItemID: CLAIMED_ITEM_FIXTURE.ItemID, PublishID: CLAIMED_ITEM_FIXTURE.PublishID, QueueName: 'venue-import',
            TopicName: null, PartitionKey: 'venue-42', CorrelationID: 'corr-1', Payload: { importId: 'x' },
            AttemptCount: 1, MaxAttempts: 5, FenceToken: 7, LeaseLost: false,
        });
        expect(seen?.ContextUser).toBe(TEST_USER);
        expect(seen?.Provider).toBe(TEST_PROVIDER);
    });

    it('dead-letters an item whose queue has no handler', async () => {
        const runner = new WorkQueueItemRunner(driver, 'worker-1', 5000, () => clock);
        const outcome = await runner.Run(CLAIMED_ITEM_FIXTURE, QUEUE_FIXTURE, null, TEST_USER, TEST_PROVIDER);
        expect(outcome).toEqual({ Kind: 'DeadLettered', Reason: 'Handler Not Found' });
        expect(driver.SettleCalls[0].Detail).toEqual(['Handler Not Found', "No handler is registered for queue 'venue-import'"]);
    });

    it('dead-letters a payload that is not valid JSON without calling the handler', async () => {
        let called = false;
        const outcome = await run(async () => {
            called = true;
        }, { ...CLAIMED_ITEM_FIXTURE, PayloadJSON: '{bad' });
        expect(outcome).toEqual({ Kind: 'DeadLettered', Reason: 'Fatal Error' });
        expect(called).toBe(false);
    });

    it('dead-letters a fatal error immediately, even with attempts left', async () => {
        const outcome = await run(async () => {
            throw new FatalQueueError('personId missing');
        });
        expect(outcome).toEqual({ Kind: 'DeadLettered', Reason: 'Fatal Error' });
        expect(driver.SettleCalls[0].Detail).toEqual(['Fatal Error', 'personId missing']);
    });

    it('retries any other error with the initial backoff on the first attempt', async () => {
        const outcome = await run(async () => {
            throw new Error('deadlock victim');
        });
        expect(outcome).toEqual({ Kind: 'Retried', DelaySeconds: 10 });
        expect(driver.SettleCalls[0]).toMatchObject({ Kind: 'Retry', Detail: [10, 'deadlock victim'] });
    });

    it('doubles the backoff for each earlier attempt', async () => {
        const outcome = await run(async () => {
            throw new Error('x');
        }, { ...CLAIMED_ITEM_FIXTURE, AttemptCount: 3 });
        expect(outcome).toEqual({ Kind: 'Retried', DelaySeconds: 40 });
    });

    it("honours a transient error's retry-after", async () => {
        const outcome = await run(async () => {
            throw new TransientQueueError('rate limited', 90);
        });
        expect(outcome).toEqual({ Kind: 'Retried', DelaySeconds: 90 });
    });

    it('dead-letters when the final attempt fails', async () => {
        const outcome = await run(async () => {
            throw new Error('still broken');
        }, { ...CLAIMED_ITEM_FIXTURE, AttemptCount: 5 });
        expect(outcome).toEqual({ Kind: 'DeadLettered', Reason: 'Max Attempts Exceeded' });
        expect(driver.SettleCalls[0].Detail).toEqual(['Max Attempts Exceeded', 'still broken']);
    });

    it('records a thrown non-Error as text', async () => {
        await run(async () => {
            throw 'plain string';
        });
        expect(driver.SettleCalls[0].Detail).toEqual([10, 'plain string']);
    });
});

describe('WorkQueueItemRunner leases', () => {
    it('renews the lease no more often than the minimum interval', async () => {
        await run(async context => {
            expect(await context.Heartbeat()).toBe(true);
            clock = 4999;
            expect(await context.Heartbeat()).toBe(true);
            clock = 5000;
            expect(await context.Heartbeat()).toBe(true);
            clock = 6000;
            expect(await context.Heartbeat()).toBe(true);
        });
        const heartbeats = driver.SettleCalls.filter(call => call.Kind === 'Heartbeat');
        expect(heartbeats).toEqual([{ Kind: 'Heartbeat', ItemID: CLAIMED_ITEM_FIXTURE.ItemID, FenceToken: 7, Detail: [300] }]);
    });

    it('stops renewing once a heartbeat fails, reports the loss and never settles', async () => {
        driver.HeartbeatResults = [false];
        let second: boolean | undefined;
        let lost: boolean | undefined;
        const outcome = await run(async context => {
            clock = 5000;
            await context.Heartbeat();
            clock = 20000;
            second = await context.Heartbeat();
            lost = context.LeaseLost;
        });
        expect(outcome).toEqual({ Kind: 'LeaseLost' });
        expect(second).toBe(false);
        expect(lost).toBe(true);
        expect(settlements()).toEqual(['Heartbeat']);
    });

    it('does not retry an error thrown after the lease was lost', async () => {
        driver.HeartbeatResults = [false];
        const outcome = await run(async context => {
            clock = 5000;
            if (!(await context.Heartbeat())) {
                throw new Error('stopping: lease lost');
            }
        });
        expect(outcome).toEqual({ Kind: 'LeaseLost' });
        expect(settlements()).toEqual(['Heartbeat']);
    });

    it('shares one renewal between concurrent heartbeat calls', async () => {
        await run(async context => {
            clock = 5000;
            expect(await Promise.all([context.Heartbeat(), context.Heartbeat()])).toEqual([true, true]);
        });
        expect(settlements()).toEqual(['Heartbeat', 'Complete']);
    });

    it('reports lease loss when the settle finds the item owned by another worker', async () => {
        driver.SettleResult = false;
        expect(await run(async () => {})).toEqual({ Kind: 'LeaseLost' });
    });

    it('reports lease loss when the settle itself fails, leaving the item to lease expiry', async () => {
        driver.SettleError = new Error('connection reset');
        expect(await run(async () => {})).toEqual({ Kind: 'LeaseLost' });
    });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd packages/WorkQueue && pnpm test ResolveWorkQueueHandler WorkQueueItemRunner`
Expected: FAIL — unresolved imports `../handlers/ResolveWorkQueueHandler` and `../worker/WorkQueueItemRunner`.

- [ ] **Step 5: Write `src/handlers/ResolveWorkQueueHandler.ts`**

```typescript
import { MJGlobal } from '@memberjunction/global';
import { BaseWorkQueueHandler } from '../BaseWorkQueueHandler';
import { WORK_QUEUE_FALLBACK_HANDLER_KEY } from '../constants';

/**
 * A new handler for the queue: the class registered under the queue name, else the class registered under
 * WORK_QUEUE_FALLBACK_HANDLER_KEY, else null. Keys match trimmed and case-insensitively, as ClassFactory
 * keys always do.
 */
export function ResolveWorkQueueHandler(queueName: string): BaseWorkQueueHandler | null {
    const factory = MJGlobal.Instance.ClassFactory;
    const registration = factory.GetRegistration(BaseWorkQueueHandler, queueName)
        ?? factory.GetRegistration(BaseWorkQueueHandler, WORK_QUEUE_FALLBACK_HANDLER_KEY);
    if (!registration) {
        return null;
    }
    const handler: BaseWorkQueueHandler = new registration.SubClass();
    return handler;
}
```

- [ ] **Step 6: Write `src/worker/WorkQueueItemRunner.ts`**

```typescript
import { LogError, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { ComputeBackoffSeconds } from '../backoff';
import type { BaseWorkQueueDriver } from '../BaseWorkQueueDriver';
import type { BaseWorkQueueHandler } from '../BaseWorkQueueHandler';
import { FatalQueueError, TransientQueueError } from '../errors';
import { ParsePayload } from '../payload';
import type { ClaimedWorkItem, DeadLetterReason, WorkQueueContext, WorkQueueDefinition } from '../types';

export type ItemOutcome =
    | { Kind: 'Completed' }
    | { Kind: 'Retried'; DelaySeconds: number }
    | { Kind: 'DeadLettered'; Reason: DeadLetterReason }
    | { Kind: 'LeaseLost' };

const LEASE_LOST: ItemOutcome = { Kind: 'LeaseLost' };

/** Longest error text stored with an item. */
const MAX_ERROR_MESSAGE_LENGTH = 4000;

/**
 * Runs one claimed item through its handler and settles it. Never throws. A settle the database rejects,
 * or that fails outright, reports LeaseLost: the current owner or lease expiry decides what happens next.
 */
export class WorkQueueItemRunner {
    constructor(
        private readonly driver: BaseWorkQueueDriver,
        private readonly workerID: string,
        private readonly heartbeatMinIntervalMs: number,
        private readonly now: () => number = Date.now,
    ) {}

    public async Run(
        item: ClaimedWorkItem,
        queue: WorkQueueDefinition,
        handler: BaseWorkQueueHandler | null,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<ItemOutcome> {
        if (!handler) {
            return this.deadLetter(item, 'Handler Not Found', `No handler is registered for queue '${queue.Name}'`, contextUser);
        }
        let payload: Record<string, unknown>;
        try {
            payload = ParsePayload<Record<string, unknown>>(item.PayloadJSON);
        } catch (error) {
            return this.deadLetter(item, 'Fatal Error', `Payload is not valid JSON: ${describeError(error)}`, contextUser);
        }
        const renew = (): Promise<boolean> => this.driver.Heartbeat(item, this.workerID, queue.LeaseSeconds, contextUser);
        const lease = new LeaseTracker(renew, this.heartbeatMinIntervalMs, this.now);
        try {
            await handler.Handle(buildContext(item, payload, lease, contextUser, provider));
        } catch (error) {
            return lease.Lost ? LEASE_LOST : this.fail(item, queue, error, contextUser);
        }
        return lease.Lost ? LEASE_LOST : this.complete(item, queue, contextUser);
    }

    private fail(item: ClaimedWorkItem, queue: WorkQueueDefinition, error: unknown, contextUser: UserInfo): Promise<ItemOutcome> {
        const message = describeError(error);
        if (error instanceof FatalQueueError) {
            return this.deadLetter(item, 'Fatal Error', message, contextUser);
        }
        if (item.AttemptCount >= item.MaxAttempts) {
            return this.deadLetter(item, 'Max Attempts Exceeded', message, contextUser);
        }
        const retryAfter = error instanceof TransientQueueError ? error.RetryAfterSeconds : undefined;
        const delaySeconds = ComputeBackoffSeconds(item.AttemptCount, queue.InitialBackoffSeconds, queue.MaxBackoffSeconds, retryAfter);
        const write = (): Promise<boolean> => this.driver.Retry(item, this.workerID, delaySeconds, message, contextUser);
        return this.settle(item, write, { Kind: 'Retried', DelaySeconds: delaySeconds });
    }

    private complete(item: ClaimedWorkItem, queue: WorkQueueDefinition, contextUser: UserInfo): Promise<ItemOutcome> {
        const write = (): Promise<boolean> => this.driver.Complete(item, this.workerID, queue.PurgeOnComplete, contextUser);
        return this.settle(item, write, { Kind: 'Completed' });
    }

    private deadLetter(item: ClaimedWorkItem, reason: DeadLetterReason, message: string, contextUser: UserInfo): Promise<ItemOutcome> {
        const write = (): Promise<boolean> => this.driver.DeadLetter(item, this.workerID, reason, message, contextUser);
        return this.settle(item, write, { Kind: 'DeadLettered', Reason: reason });
    }

    private async settle(item: ClaimedWorkItem, write: () => Promise<boolean>, outcome: ItemOutcome): Promise<ItemOutcome> {
        try {
            return (await write()) ? outcome : LEASE_LOST;
        } catch (error) {
            LogError(`[WorkQueue] Could not settle item ${item.ItemID} in queue '${item.QueueName}'; it is retried when its lease expires`, undefined, error);
            return LEASE_LOST;
        }
    }
}

/** Throttled, shared lease renewal for one item. Once lost, always lost. */
class LeaseTracker {
    public Lost = false;
    private lastRenewedAt: number;
    private pending: Promise<boolean> | null = null;

    constructor(
        private readonly renew: () => Promise<boolean>,
        private readonly minIntervalMs: number,
        private readonly now: () => number,
    ) {
        this.lastRenewedAt = now();
    }

    public async Renew(): Promise<boolean> {
        if (this.Lost) {
            return false;
        }
        if (this.pending) {
            return this.pending;
        }
        if (this.now() - this.lastRenewedAt < this.minIntervalMs) {
            return true;
        }
        this.pending = this.renewNow();
        try {
            return await this.pending;
        } finally {
            this.pending = null;
        }
    }

    private async renewNow(): Promise<boolean> {
        const renewed = await this.renew();
        this.lastRenewedAt = this.now();
        if (!renewed) {
            this.Lost = true;
        }
        return renewed;
    }
}

function buildContext(
    item: ClaimedWorkItem,
    payload: Record<string, unknown>,
    lease: LeaseTracker,
    contextUser: UserInfo,
    provider: IMetadataProvider,
): WorkQueueContext {
    return {
        ItemID: item.ItemID,
        PublishID: item.PublishID,
        QueueName: item.QueueName,
        TopicName: item.TopicName,
        PartitionKey: item.PartitionKey,
        TenantID: item.TenantID,
        CorrelationID: item.CorrelationID,
        Payload: payload,
        AttemptCount: item.AttemptCount,
        MaxAttempts: item.MaxAttempts,
        FenceToken: item.FenceToken,
        ContextUser: contextUser,
        Provider: provider,
        Heartbeat: () => lease.Renew(),
        get LeaseLost(): boolean {
            return lease.Lost;
        },
    };
}

function describeError(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error);
    return text.length > MAX_ERROR_MESSAGE_LENGTH ? text.slice(0, MAX_ERROR_MESSAGE_LENGTH) : text;
}
```

- [ ] **Step 7: Export the new modules**

Append to `packages/WorkQueue/src/index.ts`:

```typescript
export * from './BaseWorkQueueHandler';
export * from './handlers/ResolveWorkQueueHandler';
export * from './worker/WorkQueueItemRunner';
```

- [ ] **Step 8: Run the tests and build**

Run: `cd packages/WorkQueue && pnpm test`
Expected: PASS — all suites, including ResolveWorkQueueHandler (3) and WorkQueueItemRunner (16). The
"reports lease loss when the settle itself fails" test logs one `[WorkQueue] Could not settle` line; that
is expected.

Run: `cd packages/WorkQueue && pnpm run build`
Expected: builds.

- [ ] **Step 9: Commit**

```bash
git add packages/WorkQueue/src
git commit -m "feat(work-queue): handler resolution and item runner with throttled heartbeats"
```

---

### Task 10: Worker loop

**Files:**
- Create: `packages/WorkQueue/src/worker/WorkQueueWorker.ts`
- Modify: `packages/WorkQueue/src/index.ts`
- Test: `packages/WorkQueue/src/__tests__/WorkQueueWorker.test.ts`

**Interfaces:**
- Consumes: `WorkQueueItemRunner`, `ItemOutcome`, `ResolveWorkQueueHandler`, `BaseWorkQueueHandler` (Task 9); `QueueUnsupportedReason` (Task 3); `WorkQueueMetadataSource` (Task 4); `WorkQueueWorkerConfig` (Task 2); fakes `FakeDriver`, `StaticMetadataSource`, `ClickIndex`, `UPDATER_QUEUE`, `ARCHIVER_QUEUE`, `QUEUE_FIXTURE`, `CLAIMED_ITEM_FIXTURE`, `ScriptedHandler`, `TEST_USER`, `TEST_PROVIDER`.
- Produces: `type WorkQueueHandlerResolver = (queueName: string) => BaseWorkQueueHandler | null`; `class WorkQueueWorker implements IShutdownable` exactly as spec 02 §5, including `WaitForInFlight()`.

Worker rules:

- **Eligible queues** are active and supported by the driver (`QueueUnsupportedReason` is null). An
  unsupported queue is logged once per worker and skipped.
- **Fairness.** Queues are visited round-robin, one claim at a time. A queue that yields an item goes to
  the back of the line; a queue that yields nothing, or whose claim throws, drops out of this pass. Each pass
  starts one queue further along than the last.
- **Concurrency.** A pass stops when `MaxConcurrentItems` items are in flight. Items run in the background.
- **Resilience.** `PollOnce` never throws. A failing claim affects only its queue; a failing metadata read
  makes the pass return 0. Overlapping passes return 0 immediately.
- **Stop** clears the timer and prevents further claims, including by a pass already running. In-flight items
  finish on their own; an abandoned item is retried when its lease expires. `Shutdown` calls `Stop`.
- A handler whose construction throws is treated as missing, so the item dead-letters with
  `'Handler Not Found'` and the error is logged.

- [ ] **Step 1: Write the failing test**

`packages/WorkQueue/src/__tests__/WorkQueueWorker.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { WorkQueueWorker, type WorkQueueHandlerResolver } from '../worker/WorkQueueWorker';
import type { WorkQueueMetadataIndex, WorkQueueMetadataSource } from '../metadata/WorkQueueMetadataIndex';
import type { ClaimedWorkItem, WorkQueueDefinition, WorkQueueWorkerConfig } from '../types';
import {
    ARCHIVER_QUEUE, CLAIMED_ITEM_FIXTURE, ClickIndex, FakeDriver, QUEUE_FIXTURE, ScriptedHandler,
    StaticMetadataSource, TEST_PROVIDER, TEST_USER, UPDATER_QUEUE,
} from './fakes';

const CONFIG: WorkQueueWorkerConfig = { WorkerID: 'worker-1', PollingIntervalMs: 1000, MaxConcurrentItems: 10, HeartbeatMinIntervalMs: 5000 };
const NOOP_HANDLER: WorkQueueHandlerResolver = () => new ScriptedHandler(async () => {});

let driver: FakeDriver;

interface WorkerOptions {
    Config?: Partial<WorkQueueWorkerConfig>;
    Metadata?: WorkQueueMetadataSource;
    Index?: WorkQueueMetadataIndex;
    Resolver?: WorkQueueHandlerResolver;
}

function makeWorker(options: WorkerOptions = {}): WorkQueueWorker {
    const metadata = options.Metadata ?? new StaticMetadataSource(options.Index ?? ClickIndex());
    return new WorkQueueWorker({ ...CONFIG, ...options.Config }, driver, metadata, TEST_USER, TEST_PROVIDER, options.Resolver ?? NOOP_HANDLER);
}

function items(queueName: string, count: number): ClaimedWorkItem[] {
    return Array.from({ length: count }, (_, i) => ({ ...CLAIMED_ITEM_FIXTURE, ItemID: `${queueName}-${i + 1}`, QueueName: queueName, PartitionKey: null }));
}

function deferred(): { Promise: Promise<void>; Resolve: () => void } {
    let resolve: () => void = () => {};
    const promise = new Promise<void>(r => {
        resolve = r;
    });
    return { Promise: promise, Resolve: resolve };
}

beforeEach(() => {
    driver = new FakeDriver();
});

describe('WorkQueueWorker.PollOnce', () => {
    it('claims from every eligible queue and runs each item to completion', async () => {
        driver.Claimable.set('person-click-updater', items('person-click-updater', 2));
        driver.Claimable.set('click-archiver', items('click-archiver', 1));
        const worker = makeWorker();
        expect(await worker.PollOnce()).toBe(3);
        await worker.WaitForInFlight();
        const completed = driver.SettleCalls.filter(call => call.Kind === 'Complete').map(call => call.ItemID);
        expect(completed.sort()).toEqual(['click-archiver-1', 'person-click-updater-1', 'person-click-updater-2']);
        expect(worker.InFlightCount).toBe(0);
    });

    it('rotates across queues one claim at a time', async () => {
        driver.Claimable.set('person-click-updater', items('person-click-updater', 2));
        driver.Claimable.set('click-archiver', items('click-archiver', 1));
        await makeWorker().PollOnce();
        expect(driver.ClaimCalls).toEqual([
            'person-click-updater', 'click-archiver', 'venue-import', 'person-click-updater', 'click-archiver', 'person-click-updater',
        ]);
    });

    it('starts each pass one queue further along', async () => {
        driver.Claimable.set('person-click-updater', items('person-click-updater', 2));
        driver.Claimable.set('click-archiver', items('click-archiver', 2));
        const worker = makeWorker({ Config: { MaxConcurrentItems: 1 } });
        await worker.PollOnce();
        await worker.WaitForInFlight();
        await worker.PollOnce();
        expect(driver.ClaimCalls).toEqual(['person-click-updater', 'click-archiver']);
    });

    it('never runs more items than MaxConcurrentItems', async () => {
        const gate = deferred();
        driver.Claimable.set('person-click-updater', items('person-click-updater', 3));
        const worker = makeWorker({ Config: { MaxConcurrentItems: 2 }, Resolver: () => new ScriptedHandler(() => gate.Promise) });
        expect(await worker.PollOnce()).toBe(2);
        expect(worker.InFlightCount).toBe(2);
        expect(await worker.PollOnce()).toBe(0);
        gate.Resolve();
        await worker.WaitForInFlight();
        expect(await worker.PollOnce()).toBe(1);
    });

    it('skips inactive queues and queues the driver cannot honour', async () => {
        driver.Capabilities = { ...driver.Capabilities, BlockPartitionDeadLetter: false };
        const index = ClickIndex({ Queues: [{ ...UPDATER_QUEUE, IsActive: false }, ARCHIVER_QUEUE, QUEUE_FIXTURE] });
        await makeWorker({ Index: index }).PollOnce();
        expect(driver.ClaimCalls).toEqual(['click-archiver']);
    });

    it('dead-letters items whose queue has no handler', async () => {
        driver.Claimable.set('click-archiver', items('click-archiver', 1));
        const worker = makeWorker({ Resolver: () => null });
        await worker.PollOnce();
        await worker.WaitForInFlight();
        expect(driver.SettleCalls).toMatchObject([{ Kind: 'DeadLetter', Detail: ['Handler Not Found', "No handler is registered for queue 'click-archiver'"] }]);
    });

    it('treats a handler that cannot be constructed as missing', async () => {
        driver.Claimable.set('click-archiver', items('click-archiver', 1));
        const worker = makeWorker({ Resolver: () => { throw new Error('bad constructor'); } });
        await worker.PollOnce();
        await worker.WaitForInFlight();
        expect(driver.SettleCalls[0]).toMatchObject({ Kind: 'DeadLetter', Detail: ['Handler Not Found', expect.any(String)] });
    });

    it("keeps claiming other queues when one queue's claim fails", async () => {
        class FailingClaimDriver extends FakeDriver {
            public override async Claim(queue: WorkQueueDefinition, workerID: string, contextUser: UserInfo): Promise<ClaimedWorkItem | null> {
                if (queue.Name === 'person-click-updater') {
                    throw new Error('deadlock victim');
                }
                return super.Claim(queue, workerID, contextUser);
            }
        }
        driver = new FailingClaimDriver();
        driver.Claimable.set('click-archiver', items('click-archiver', 1));
        expect(await makeWorker().PollOnce()).toBe(1);
    });

    it('returns 0 when metadata cannot be read', async () => {
        const failing: WorkQueueMetadataSource = {
            GetIndex: async () => {
                throw new Error('database unavailable');
            },
        };
        expect(await makeWorker({ Metadata: failing }).PollOnce()).toBe(0);
    });

    it('ignores a pass requested while another is running', async () => {
        const gate = deferred();
        let reads = 0;
        const slow: WorkQueueMetadataSource = {
            GetIndex: async () => {
                reads++;
                await gate.Promise;
                return ClickIndex();
            },
        };
        const worker = makeWorker({ Metadata: slow });
        const first = worker.PollOnce();
        expect(await worker.PollOnce()).toBe(0);
        gate.Resolve();
        await first;
        expect(reads).toBe(1);
    });
});

describe('WorkQueueWorker lifecycle', () => {
    it('names itself for shutdown logs', () => {
        expect(makeWorker().ShutdownName).toBe('WorkQueueWorker:worker-1');
    });

    it('polls on start and on every interval until shut down', async () => {
        vi.useFakeTimers();
        try {
            const worker = makeWorker();
            worker.Start();
            await vi.advanceTimersByTimeAsync(0);
            expect(worker.IsRunning).toBe(true);
            expect(driver.ClaimCalls).toHaveLength(3);
            await vi.advanceTimersByTimeAsync(1000);
            expect(driver.ClaimCalls).toHaveLength(6);
            worker.Shutdown();
            expect(worker.IsRunning).toBe(false);
            await vi.advanceTimersByTimeAsync(5000);
            expect(driver.ClaimCalls).toHaveLength(6);
        } finally {
            vi.useRealTimers();
        }
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/WorkQueue && pnpm test WorkQueueWorker`
Expected: FAIL — unresolved import `../worker/WorkQueueWorker`.

- [ ] **Step 3: Write `src/worker/WorkQueueWorker.ts`**

```typescript
import { LogError, LogStatus, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { NormalizeUUID, ShutdownRegistry, type IShutdownable } from '@memberjunction/global';
import type { BaseWorkQueueDriver } from '../BaseWorkQueueDriver';
import type { BaseWorkQueueHandler } from '../BaseWorkQueueHandler';
import { QueueUnsupportedReason } from '../capabilities';
import { ResolveWorkQueueHandler } from '../handlers/ResolveWorkQueueHandler';
import type { WorkQueueMetadataSource } from '../metadata/WorkQueueMetadataIndex';
import type { ClaimedWorkItem, WorkQueueDefinition, WorkQueueWorkerConfig } from '../types';
import { WorkQueueItemRunner, type ItemOutcome } from './WorkQueueItemRunner';

export type WorkQueueHandlerResolver = (queueName: string) => BaseWorkQueueHandler | null;

/**
 * Polls every active queue the driver supports, claims items up to MaxConcurrentItems and runs each in the
 * background. Any number of workers in any number of processes may poll the same queues — claiming is the
 * mutual exclusion. Queues are visited round-robin, one claim at a time, so a deep queue cannot starve the
 * others; each pass starts one queue further along than the last.
 */
export class WorkQueueWorker implements IShutdownable {
    private readonly runner: WorkQueueItemRunner;
    private readonly inFlight = new Set<Promise<void>>();
    private readonly warnedQueueIDs = new Set<string>();
    private timer: ReturnType<typeof setInterval> | null = null;
    private stopped = false;
    private polling = false;
    private passCount = 0;

    constructor(
        private readonly config: WorkQueueWorkerConfig,
        private readonly driver: BaseWorkQueueDriver,
        private readonly metadata: WorkQueueMetadataSource,
        private readonly contextUser: UserInfo,
        private readonly provider: IMetadataProvider,
        private readonly resolveHandler: WorkQueueHandlerResolver = ResolveWorkQueueHandler,
    ) {
        this.runner = new WorkQueueItemRunner(driver, config.WorkerID, config.HeartbeatMinIntervalMs);
    }

    public get ShutdownName(): string {
        return `WorkQueueWorker:${this.config.WorkerID}`;
    }

    public get IsRunning(): boolean {
        return this.timer !== null;
    }

    public get InFlightCount(): number {
        return this.inFlight.size;
    }

    /** Polls now and every PollingIntervalMs after, and registers for graceful shutdown. */
    public Start(): void {
        if (this.timer) {
            return;
        }
        this.stopped = false;
        ShutdownRegistry.Instance.Register(this);
        this.timer = setInterval(() => void this.PollOnce(), this.config.PollingIntervalMs);
        LogStatus(`🔄 Work Queue worker ${this.config.WorkerID}: polling every ${this.config.PollingIntervalMs} ms, up to ${this.config.MaxConcurrentItems} concurrent item(s)`);
        void this.PollOnce();
    }

    /** Stops claiming. In-flight items finish on their own; an abandoned item is retried when its lease expires. */
    public Stop(): void {
        this.stopped = true;
        if (!this.timer) {
            return;
        }
        clearInterval(this.timer);
        this.timer = null;
        LogStatus(`[WorkQueue] Worker ${this.config.WorkerID} stopped (${this.inFlight.size} item(s) still in flight)`);
    }

    public Shutdown(): void {
        this.Stop();
    }

    /** Resolves when every item started so far has settled. */
    public async WaitForInFlight(): Promise<void> {
        await Promise.allSettled([...this.inFlight]);
    }

    /** One claim pass. Returns the number of items started. Never throws. */
    public async PollOnce(): Promise<number> {
        if (this.polling || this.stopped) {
            return 0;
        }
        this.polling = true;
        try {
            return await this.claimPass();
        } catch (error) {
            LogError(`[WorkQueue] Worker ${this.config.WorkerID} poll failed`, undefined, error);
            return 0;
        } finally {
            this.polling = false;
        }
    }

    private async claimPass(): Promise<number> {
        const line = rotate(await this.eligibleQueues(), this.passCount++);
        let started = 0;
        while (line.length > 0 && this.freeSlots() > 0 && !this.stopped) {
            const queue = line.shift();
            const item = queue ? await this.claim(queue) : null;
            if (queue && item) {
                this.start(item, queue);
                started++;
                line.push(queue);
            }
        }
        return started;
    }

    private async eligibleQueues(): Promise<WorkQueueDefinition[]> {
        const index = await this.metadata.GetIndex(this.contextUser);
        return index.Queues.filter(queue => queue.IsActive && this.isSupported(queue));
    }

    private isSupported(queue: WorkQueueDefinition): boolean {
        const reason = QueueUnsupportedReason(queue, this.driver.Capabilities);
        const key = NormalizeUUID(queue.ID);
        if (reason && !this.warnedQueueIDs.has(key)) {
            this.warnedQueueIDs.add(key);
            LogStatus(`[WorkQueue] Worker ${this.config.WorkerID} is skipping a queue: ${reason}`);
        }
        return reason === null;
    }

    private freeSlots(): number {
        return this.config.MaxConcurrentItems - this.inFlight.size;
    }

    private async claim(queue: WorkQueueDefinition): Promise<ClaimedWorkItem | null> {
        try {
            return await this.driver.Claim(queue, this.config.WorkerID, this.contextUser);
        } catch (error) {
            LogError(`[WorkQueue] Claim failed for queue '${queue.Name}'`, undefined, error);
            return null;
        }
    }

    private start(item: ClaimedWorkItem, queue: WorkQueueDefinition): void {
        const execution: Promise<void> = this.execute(item, queue).finally(() => {
            this.inFlight.delete(execution);
        });
        this.inFlight.add(execution);
    }

    private async execute(item: ClaimedWorkItem, queue: WorkQueueDefinition): Promise<void> {
        const outcome = await this.runner.Run(item, queue, this.handlerFor(queue), this.contextUser, this.provider);
        logOutcome(item, outcome);
    }

    private handlerFor(queue: WorkQueueDefinition): BaseWorkQueueHandler | null {
        try {
            return this.resolveHandler(queue.Name);
        } catch (error) {
            LogError(`[WorkQueue] Could not create the handler for queue '${queue.Name}'`, undefined, error);
            return null;
        }
    }
}

function logOutcome(item: ClaimedWorkItem, outcome: ItemOutcome): void {
    if (outcome.Kind === 'DeadLettered') {
        LogStatus(`[WorkQueue] Item ${item.ItemID} in queue '${item.QueueName}' dead-lettered: ${outcome.Reason}`);
    } else if (outcome.Kind === 'LeaseLost') {
        LogStatus(`[WorkQueue] Item ${item.ItemID} in queue '${item.QueueName}' lost its lease; it now belongs to lease expiry or another worker`);
    }
}

function rotate<T>(items: T[], offset: number): T[] {
    if (items.length === 0) {
        return [];
    }
    const start = offset % items.length;
    return [...items.slice(start), ...items.slice(0, start)];
}
```

- [ ] **Step 4: Export it**

Append to `packages/WorkQueue/src/index.ts`:

```typescript
export * from './worker/WorkQueueWorker';
```

- [ ] **Step 5: Run the tests and build**

Run: `cd packages/WorkQueue && pnpm test`
Expected: PASS — all suites, including WorkQueueWorker (12).

Run: `cd packages/WorkQueue && pnpm run build`
Expected: builds.

- [ ] **Step 6: Commit**

```bash
git add packages/WorkQueue/src
git commit -m "feat(work-queue): round-robin worker with bounded concurrency and graceful stop"
```

---

### Task 11: Runtime and maintenance

**Files:**
- Create: `packages/WorkQueue/src/WorkQueueRuntime.ts`, `src/maintenance/tasks.ts`, `src/maintenance/WorkQueueMaintenance.ts`
- Modify: `packages/WorkQueue/src/index.ts`
- Test: `packages/WorkQueue/src/__tests__/WorkQueueRuntime.test.ts`, `src/__tests__/WorkQueueMaintenance.test.ts`

**Interfaces:**
- Consumes: `BaseWorkQueueDriver`, `NativeWorkQueueDriver`, `DeduplicationLedger` (Task 7); `WorkQueueEngine`, `WorkQueueProducer` (Task 8); `WorkQueueMetadataSource` (Task 4); `WorkQueueSqlExecutor` (Task 5); `WorkQueueConfigurationError`, `PayloadTooLargeError` (Task 2); fakes `FakeDriver`, `RecordingExecutor`, `StaticMetadataSource`, `ClickIndex`, `TEST_USER`.
- Produces (spec 02 §4.9 and §5):
  - `interface WorkQueueRuntimeParts`, `class WorkQueueRuntime extends BaseSingleton<WorkQueueRuntime>` — `Instance`, `Configure(parts)`, `Reset()`, `IsConfigured`, `Driver`, `Metadata`, `Producer`
  - `interface WorkQueueRuntimeOptions`, `CreateWorkQueueRuntimeParts(options): WorkQueueRuntimeParts`
  - `interface MaintenanceTask`, `class ReapLeaseExhaustedTask`, `class PurgeDeduplicationsTask`, `DefaultMaintenanceTasks(driver, executor): MaintenanceTask[]`
  - `class WorkQueueMaintenance implements IShutdownable` — `constructor(tasks, intervalMs, contextUser)`, `ShutdownName`, `IsRunning`, `Start()`, `Stop()`, `Shutdown()`, `RunOnce(): Promise<Record<string, number>>`

The runtime is the process-wide handle in-process code uses to publish
(`WorkQueueRuntime.Instance.Producer.Publish(...)`). `CreateWorkQueueRuntimeParts` resolves the driver
through `ClassFactory.TryCreateInstance(BaseWorkQueueDriver, DriverKey, executor, settings)`, so MJServer
never imports a specific driver package — the AWS driver (plan 05) registers itself under `'AWS'`.

Maintenance covers the one recovery the claim path cannot do in-line — dead-lettering an item whose lease
expired on its final attempt — and purges expired deduplication keys. Completed items are purged at settle
time by queues with `PurgeOnComplete`.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/src/__tests__/WorkQueueRuntime.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { CreateWorkQueueRuntimeParts, WorkQueueRuntime } from '../WorkQueueRuntime';
import { NativeWorkQueueDriver } from '../native/NativeWorkQueueDriver';
import { WorkQueueProducer } from '../WorkQueueProducer';
import { PayloadTooLargeError, WorkQueueConfigurationError } from '../errors';
import { ClickIndex, FakeDriver, RecordingExecutor, StaticMetadataSource, TEST_USER } from './fakes';

beforeEach(() => {
    WorkQueueRuntime.Instance.Reset();
});

describe('WorkQueueRuntime', () => {
    it('is a single process-wide instance', () => {
        expect(WorkQueueRuntime.Instance).toBe(WorkQueueRuntime.Instance);
    });

    it('refuses to hand out parts before it is configured', () => {
        const runtime = WorkQueueRuntime.Instance;
        expect(runtime.IsConfigured).toBe(false);
        expect(() => runtime.Driver).toThrow(WorkQueueConfigurationError);
        expect(() => runtime.Metadata).toThrow('not configured');
        expect(() => runtime.Producer).toThrow('not configured');
    });

    it('exposes the configured parts', () => {
        const driver = new FakeDriver();
        const metadata = new StaticMetadataSource(ClickIndex());
        const producer = new WorkQueueProducer(driver, metadata);
        WorkQueueRuntime.Instance.Configure({ Driver: driver, Metadata: metadata, Producer: producer });
        expect(WorkQueueRuntime.Instance.IsConfigured).toBe(true);
        expect(WorkQueueRuntime.Instance.Driver).toBe(driver);
        expect(WorkQueueRuntime.Instance.Metadata).toBe(metadata);
        expect(WorkQueueRuntime.Instance.Producer).toBe(producer);
    });
});

describe('CreateWorkQueueRuntimeParts', () => {
    it('builds the registered driver and a producer bound to it', () => {
        const metadata = new StaticMetadataSource(ClickIndex());
        const parts = CreateWorkQueueRuntimeParts({ DriverKey: 'Native', Executor: new RecordingExecutor(), Metadata: metadata });
        expect(parts.Driver).toBeInstanceOf(NativeWorkQueueDriver);
        expect(parts.Metadata).toBe(metadata);
        expect(parts.Producer).toBeInstanceOf(WorkQueueProducer);
    });

    it('passes the payload cap to the producer', async () => {
        const parts = CreateWorkQueueRuntimeParts({
            DriverKey: 'Native', Executor: new RecordingExecutor(), Metadata: new StaticMetadataSource(ClickIndex()), MaxPayloadBytes: 10,
        });
        await expect(parts.Producer.Publish('link.clicked', { text: 'longer than ten bytes' }, TEST_USER)).rejects.toThrow(PayloadTooLargeError);
    });

    it('rejects a driver key with no registration', () => {
        expect(() => CreateWorkQueueRuntimeParts({ DriverKey: 'Nope', Executor: new RecordingExecutor() }))
            .toThrow("No work-queue driver is registered under 'Nope'");
    });
});
```

`packages/WorkQueue/src/__tests__/WorkQueueMaintenance.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { WorkQueueMaintenance } from '../maintenance/WorkQueueMaintenance';
import { DefaultMaintenanceTasks, PurgeDeduplicationsTask, ReapLeaseExhaustedTask, type MaintenanceTask } from '../maintenance/tasks';
import { DeduplicationLedger } from '../ledger/DeduplicationLedger';
import { FakeDriver, RecordingExecutor, TEST_USER } from './fakes';

function task(name: string, run: () => Promise<number>, log: string[] = []): MaintenanceTask {
    return {
        Name: name,
        Run: async () => {
            log.push(name);
            return run();
        },
    };
}

describe('maintenance tasks', () => {
    it('reaps through the driver', async () => {
        const driver = new FakeDriver();
        driver.ReapCount = 4;
        expect(await new ReapLeaseExhaustedTask(driver).Run(TEST_USER)).toBe(4);
    });

    it('purges expired deduplication keys through the ledger', async () => {
        const executor = new RecordingExecutor().QueueResponse([{ AffectedRows: 7 }]);
        expect(await new PurgeDeduplicationsTask(new DeduplicationLedger(executor)).Run(TEST_USER)).toBe(7);
        expect(executor.Calls[0].SQL).toContain('WorkQueueDeduplication');
    });

    it('ships reaping and purging as the defaults', () => {
        const names = DefaultMaintenanceTasks(new FakeDriver(), new RecordingExecutor()).map(t => t.Name);
        expect(names).toEqual(['ReapLeaseExhausted', 'PurgeDeduplications']);
    });
});

describe('WorkQueueMaintenance', () => {
    it('runs every task in order and reports each count', async () => {
        const log: string[] = [];
        const maintenance = new WorkQueueMaintenance([task('A', async () => 2, log), task('B', async () => 0, log)], 60000, TEST_USER);
        expect(await maintenance.RunOnce()).toEqual({ A: 2, B: 0 });
        expect(log).toEqual(['A', 'B']);
    });

    it('records -1 for a failing task and still runs the rest', async () => {
        const failing = task('A', async () => {
            throw new Error('timeout');
        });
        const maintenance = new WorkQueueMaintenance([failing, task('B', async () => 3)], 60000, TEST_USER);
        expect(await maintenance.RunOnce()).toEqual({ A: -1, B: 3 });
    });

    it('returns an empty result for a pass requested while another is running', async () => {
        let release: () => void = () => {};
        const slow = task('A', () => new Promise<number>(resolve => {
            release = () => resolve(1);
        }));
        const maintenance = new WorkQueueMaintenance([slow], 60000, TEST_USER);
        const first = maintenance.RunOnce();
        expect(await maintenance.RunOnce()).toEqual({});
        release();
        expect(await first).toEqual({ A: 1 });
    });

    it('runs on start and on every interval until shut down', async () => {
        vi.useFakeTimers();
        try {
            const log: string[] = [];
            const maintenance = new WorkQueueMaintenance([task('A', async () => 0, log)], 60000, TEST_USER);
            maintenance.Start();
            await vi.advanceTimersByTimeAsync(0);
            expect(maintenance.IsRunning).toBe(true);
            expect(log).toHaveLength(1);
            await vi.advanceTimersByTimeAsync(60000);
            expect(log).toHaveLength(2);
            maintenance.Shutdown();
            expect(maintenance.IsRunning).toBe(false);
            await vi.advanceTimersByTimeAsync(120000);
            expect(log).toHaveLength(2);
        } finally {
            vi.useRealTimers();
        }
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue && pnpm test WorkQueueRuntime WorkQueueMaintenance`
Expected: FAIL — unresolved imports `../WorkQueueRuntime`, `../maintenance/WorkQueueMaintenance` and `../maintenance/tasks`.

- [ ] **Step 3: Write `src/WorkQueueRuntime.ts`**

```typescript
import { BaseSingleton, MJGlobal } from '@memberjunction/global';
import { BaseWorkQueueDriver } from './BaseWorkQueueDriver';
import { WorkQueueConfigurationError } from './errors';
import { WorkQueueEngine } from './metadata/WorkQueueEngine';
import type { WorkQueueMetadataSource } from './metadata/WorkQueueMetadataIndex';
import type { WorkQueueSqlExecutor } from './sql/sqlExecution';
import { WorkQueueProducer } from './WorkQueueProducer';

export interface WorkQueueRuntimeParts {
    Driver: BaseWorkQueueDriver;
    Metadata: WorkQueueMetadataSource;
    Producer: WorkQueueProducer;
}

/** Process-wide handle to the configured work queue. MJServer configures it at startup. */
export class WorkQueueRuntime extends BaseSingleton<WorkQueueRuntime> {
    private parts: WorkQueueRuntimeParts | null = null;

    protected constructor() {
        super();
    }

    public static get Instance(): WorkQueueRuntime {
        return super.getInstance<WorkQueueRuntime>();
    }

    public Configure(parts: WorkQueueRuntimeParts): void {
        this.parts = parts;
    }

    /** Forgets the configured parts. For tests and reconfiguration. */
    public Reset(): void {
        this.parts = null;
    }

    public get IsConfigured(): boolean {
        return this.parts !== null;
    }

    public get Driver(): BaseWorkQueueDriver {
        return this.requireParts().Driver;
    }

    public get Metadata(): WorkQueueMetadataSource {
        return this.requireParts().Metadata;
    }

    public get Producer(): WorkQueueProducer {
        return this.requireParts().Producer;
    }

    private requireParts(): WorkQueueRuntimeParts {
        if (!this.parts) {
            throw new WorkQueueConfigurationError('The work queue runtime is not configured; MJServer configures it at startup from the workQueue settings');
        }
        return this.parts;
    }
}

export interface WorkQueueRuntimeOptions {
    /** ClassFactory key of the driver, e.g. 'Native' or 'AWS'. */
    DriverKey: string;
    Executor: WorkQueueSqlExecutor;
    /** The workQueue configuration block, passed through to the driver. */
    Settings?: Record<string, unknown>;
    /** Defaults to WorkQueueEngine.Instance. */
    Metadata?: WorkQueueMetadataSource;
    MaxPayloadBytes?: number;
}

/** Resolves the driver by key and wires a producer to it. */
export function CreateWorkQueueRuntimeParts(options: WorkQueueRuntimeOptions): WorkQueueRuntimeParts {
    const resolution = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseWorkQueueDriver>(
        BaseWorkQueueDriver, options.DriverKey, options.Executor, options.Settings ?? {},
    );
    if (!resolution.Resolved || !resolution.Instance) {
        throw new WorkQueueConfigurationError(`No work-queue driver is registered under '${options.DriverKey}'`);
    }
    const metadata = options.Metadata ?? WorkQueueEngine.Instance;
    return {
        Driver: resolution.Instance,
        Metadata: metadata,
        Producer: new WorkQueueProducer(resolution.Instance, metadata, options.MaxPayloadBytes),
    };
}
```

- [ ] **Step 4: Write `src/maintenance/tasks.ts`**

```typescript
import type { UserInfo } from '@memberjunction/core';
import type { BaseWorkQueueDriver } from '../BaseWorkQueueDriver';
import { DeduplicationLedger } from '../ledger/DeduplicationLedger';
import type { WorkQueueSqlExecutor } from '../sql/sqlExecution';

/** One periodic housekeeping job. Returns the number of rows it affected. */
export interface MaintenanceTask {
    readonly Name: string;
    Run(contextUser: UserInfo): Promise<number>;
}

/** Dead-letters items whose lease expired on their final attempt. */
export class ReapLeaseExhaustedTask implements MaintenanceTask {
    public readonly Name = 'ReapLeaseExhausted';

    constructor(private readonly driver: BaseWorkQueueDriver) {}

    public Run(contextUser: UserInfo): Promise<number> {
        return this.driver.ReapLeaseExhausted(contextUser);
    }
}

/** Deletes deduplication keys whose window has passed. */
export class PurgeDeduplicationsTask implements MaintenanceTask {
    public readonly Name = 'PurgeDeduplications';

    constructor(private readonly ledger: DeduplicationLedger) {}

    public Run(contextUser: UserInfo): Promise<number> {
        return this.ledger.PurgeExpired(contextUser);
    }
}

export function DefaultMaintenanceTasks(driver: BaseWorkQueueDriver, executor: WorkQueueSqlExecutor): MaintenanceTask[] {
    return [new ReapLeaseExhaustedTask(driver), new PurgeDeduplicationsTask(new DeduplicationLedger(executor))];
}
```

- [ ] **Step 5: Write `src/maintenance/WorkQueueMaintenance.ts`**

```typescript
import { LogError, LogStatus, type UserInfo } from '@memberjunction/core';
import { ShutdownRegistry, type IShutdownable } from '@memberjunction/global';
import type { MaintenanceTask } from './tasks';

/**
 * Runs housekeeping tasks now and every intervalMs. Every task is safe to run on many server instances at
 * once: each is a single set-based statement.
 */
export class WorkQueueMaintenance implements IShutdownable {
    private timer: ReturnType<typeof setInterval> | null = null;
    private passing = false;

    constructor(
        private readonly tasks: MaintenanceTask[],
        private readonly intervalMs: number,
        private readonly contextUser: UserInfo,
    ) {}

    public get ShutdownName(): string {
        return 'WorkQueueMaintenance';
    }

    public get IsRunning(): boolean {
        return this.timer !== null;
    }

    public Start(): void {
        if (this.timer) {
            return;
        }
        ShutdownRegistry.Instance.Register(this);
        this.timer = setInterval(() => void this.RunOnce(), this.intervalMs);
        void this.RunOnce();
    }

    public Stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    public Shutdown(): void {
        this.Stop();
    }

    /** Runs each task once, in order. A failing task records -1; overlapping passes return {}. */
    public async RunOnce(): Promise<Record<string, number>> {
        if (this.passing) {
            return {};
        }
        this.passing = true;
        try {
            const results: Record<string, number> = {};
            for (const task of this.tasks) {
                results[task.Name] = await this.runTask(task);
            }
            return results;
        } finally {
            this.passing = false;
        }
    }

    private async runTask(task: MaintenanceTask): Promise<number> {
        try {
            const count = await task.Run(this.contextUser);
            if (count > 0) {
                LogStatus(`[WorkQueue] Maintenance ${task.Name}: ${count} row(s)`);
            }
            return count;
        } catch (error) {
            LogError(`[WorkQueue] Maintenance task ${task.Name} failed`, undefined, error);
            return -1;
        }
    }
}
```

- [ ] **Step 6: Export the new modules**

Append to `packages/WorkQueue/src/index.ts`:

```typescript
export * from './WorkQueueRuntime';
export * from './maintenance/tasks';
export * from './maintenance/WorkQueueMaintenance';
```

- [ ] **Step 7: Run the tests and build**

Run: `cd packages/WorkQueue && pnpm test`
Expected: PASS — all suites, including WorkQueueRuntime (6) and WorkQueueMaintenance (7). The failing-task
test logs one `Maintenance task A failed` line; that is expected.

Run: `cd packages/WorkQueue && pnpm run build`
Expected: builds.

- [ ] **Step 8: Commit**

```bash
git add packages/WorkQueue/src
git commit -m "feat(work-queue): runtime singleton, driver resolution and maintenance loop"
```

---

### Task 12: Admin SQL and remote operations

**Files:**
- Create: `metadata/remote-operation-categories/.work-queue-category.json`, `metadata/remote-operations/.work-queue-operations.json`
- Create: `metadata/remote-operations/types/work-queue-get-queue-stats.input.ts` and `.output.ts`, `work-queue-list-blocked-partitions.input.ts` and `.output.ts`, `work-queue-replay-dead-letter.input.ts` and `.output.ts`, `work-queue-cancel-item.input.ts` and `.output.ts`
- Create: `packages/WorkQueue/src/sql/AdminSql.ts`, `src/admin/WorkQueueAdmin.ts`, `src/operations/WorkQueueOperations.ts`
- Modify: `packages/WorkQueue/src/index.ts`; CodeGen regenerates `packages/MJCoreEntities/src/generated/remote_operations.ts`
- Test: `packages/WorkQueue/src/__tests__/AdminSql.test.ts`, `src/__tests__/WorkQueueAdmin.test.ts`, `src/__tests__/WorkQueueOperations.test.ts`

**Interfaces:**
- Consumes: `QualifiedTable`, `SqlParamList`, `ExecuteRows`, `ExecuteWrite`, `WorkQueueSqlExecutor`, `SqlStatement` (Task 5); `WorkQueueMetadataSource` (Task 4); `WorkQueueRuntime` (Task 11); `WorkQueueDriverCapabilities`, `NATIVE_DRIVER_CAPABILITIES`, `WorkQueueConfigurationError`; the `workqueue:manage` scope (Task 1).
- Produces:
  - CodeGen bases `WorkQueueGetQueueStatsOperation`, `WorkQueueListBlockedPartitionsOperation`, `WorkQueueReplayDeadLetterOperation`, `WorkQueueCancelItemOperation` and their `…Input`/`…Output` types, exported from `@memberjunction/core-entities`
  - `class AdminSql` — `constructor(executor: WorkQueueSqlExecutor)`, `QueueStats(queueID: string | null)`, `BlockedPartitions(queueID: string | null)`, `ReplayDeadLetter(itemID: string)`, `CancelItem(itemID: string)`, each returning `SqlStatement`
  - `class WorkQueueAdmin` — `constructor(executor, capabilities: WorkQueueDriverCapabilities, metadata: WorkQueueMetadataSource)`, `GetQueueStats(input, contextUser)`, `ListBlockedPartitions(input, contextUser)`, `ReplayDeadLetter(input, contextUser)`, `CancelItem(input, contextUser)` returning the generated output types
  - Server operations registered with `@RegisterClass(BaseRemotableOperation, '<OperationKey>')`: `WorkQueueGetQueueStatsServerOperation`, `WorkQueueListBlockedPartitionsServerOperation`, `WorkQueueReplayDeadLetterServerOperation`, `WorkQueueCancelItemServerOperation`

Operation rules (spec 02 §7):

| Operation | Capability required | Effect |
| --- | --- | --- |
| `WorkQueue.GetQueueStats` | `PeekItems` | Pending, in-progress and dead-letter counts, and the oldest pending item's creation time, per queue |
| `WorkQueue.ListBlockedPartitions` | `ListBlockedPartitions` | Dead-lettered items that head a partition in a Block Partition queue, with the number of pending items waiting behind each |
| `WorkQueue.ReplayDeadLetter` | `ReplaySingleDeadLetter` | A `Dead Letter` item returns to `Pending` with attempts, lease, error and timestamps cleared. In a Skip Partition queue the replayed item runs after later items that already finished |
| `WorkQueue.CancelItem` | `PeekItems` | A `Pending` or `Dead Letter` item becomes `Cancelled`. In-progress items cannot be cancelled; cancel after they settle |

- Every operation answers `supported: false` without touching the database when the driver lacks the
  capability.
- A `queueName` filter is resolved through metadata (trimmed, case-insensitive) and compared by ID. An
  unknown name throws `WorkQueueConfigurationError`.
- An `itemID` must be a UUID; anything else throws before any SQL runs.
- `RequiredScope` is `workqueue:manage`, enforced by the server's remote-operation gates before
  `InternalExecute` runs. The operations need a `DatabaseProviderBase`, so they fail with a clear error on
  any other provider.

- [ ] **Step 1: Write the operation metadata**

`metadata/remote-operation-categories/.work-queue-category.json`:

```json
[
  {
    "fields": {
      "Name": "Work Queue",
      "Description": "Operations over the durable work queue: queue depth, blocked partitions, dead-letter replay and cancellation.",
      "ParentID": null
    },
    "primaryKey": { "ID": "7BA6630A-E12D-4B0D-A735-665E83ABAD6B" }
  }
]
```

`metadata/remote-operations/.work-queue-operations.json`:

```json
[
  {
    "fields": {
      "Name": "Get Work Queue Stats",
      "OperationKey": "WorkQueue.GetQueueStats",
      "CategoryID": "@lookup:MJ: Remote Operation Categories.Name=Work Queue",
      "Description": "Returns pending, in-progress and dead-letter counts, and the oldest pending item's creation time, for one work queue or all of them. Implemented by WorkQueueGetQueueStatsServerOperation in @memberjunction/work-queue.",
      "InputTypeName": "WorkQueueGetQueueStatsInput",
      "InputTypeDefinition": "@file:types/work-queue-get-queue-stats.input.ts",
      "InputTypeIsArray": false,
      "OutputTypeName": "WorkQueueGetQueueStatsOutput",
      "OutputTypeDefinition": "@file:types/work-queue-get-queue-stats.output.ts",
      "OutputTypeIsArray": false,
      "ExecutionMode": "Sync",
      "RequiredScope": "workqueue:manage",
      "RequiresSystemUser": false,
      "GenerationType": "Manual",
      "CodeApprovalStatus": "Approved",
      "Status": "Active"
    },
    "primaryKey": { "ID": "92972EF2-31DF-48BB-8C8A-BC03D13FA74B" }
  },
  {
    "fields": {
      "Name": "List Blocked Work Queue Partitions",
      "OperationKey": "WorkQueue.ListBlockedPartitions",
      "CategoryID": "@lookup:MJ: Remote Operation Categories.Name=Work Queue",
      "Description": "Lists dead-lettered items that halt their partition in Block Partition queues, with the number of pending items waiting behind each. Implemented by WorkQueueListBlockedPartitionsServerOperation in @memberjunction/work-queue.",
      "InputTypeName": "WorkQueueListBlockedPartitionsInput",
      "InputTypeDefinition": "@file:types/work-queue-list-blocked-partitions.input.ts",
      "InputTypeIsArray": false,
      "OutputTypeName": "WorkQueueListBlockedPartitionsOutput",
      "OutputTypeDefinition": "@file:types/work-queue-list-blocked-partitions.output.ts",
      "OutputTypeIsArray": false,
      "ExecutionMode": "Sync",
      "RequiredScope": "workqueue:manage",
      "RequiresSystemUser": false,
      "GenerationType": "Manual",
      "CodeApprovalStatus": "Approved",
      "Status": "Active"
    },
    "primaryKey": { "ID": "5E76F022-717C-40ED-AD07-1637543A815E" }
  },
  {
    "fields": {
      "Name": "Replay Work Queue Dead Letter",
      "OperationKey": "WorkQueue.ReplayDeadLetter",
      "CategoryID": "@lookup:MJ: Remote Operation Categories.Name=Work Queue",
      "Description": "Returns one dead-lettered work queue item to Pending with its attempts reset, unblocking its partition. Implemented by WorkQueueReplayDeadLetterServerOperation in @memberjunction/work-queue.",
      "InputTypeName": "WorkQueueReplayDeadLetterInput",
      "InputTypeDefinition": "@file:types/work-queue-replay-dead-letter.input.ts",
      "InputTypeIsArray": false,
      "OutputTypeName": "WorkQueueReplayDeadLetterOutput",
      "OutputTypeDefinition": "@file:types/work-queue-replay-dead-letter.output.ts",
      "OutputTypeIsArray": false,
      "ExecutionMode": "Sync",
      "RequiredScope": "workqueue:manage",
      "RequiresSystemUser": false,
      "GenerationType": "Manual",
      "CodeApprovalStatus": "Approved",
      "Status": "Active"
    },
    "primaryKey": { "ID": "5A0C047B-044D-499C-B29F-5500860E7B16" }
  },
  {
    "fields": {
      "Name": "Cancel Work Queue Item",
      "OperationKey": "WorkQueue.CancelItem",
      "CategoryID": "@lookup:MJ: Remote Operation Categories.Name=Work Queue",
      "Description": "Cancels one pending or dead-lettered work queue item; cancelling a dead-lettered head skips it and unblocks its partition. Implemented by WorkQueueCancelItemServerOperation in @memberjunction/work-queue.",
      "InputTypeName": "WorkQueueCancelItemInput",
      "InputTypeDefinition": "@file:types/work-queue-cancel-item.input.ts",
      "InputTypeIsArray": false,
      "OutputTypeName": "WorkQueueCancelItemOutput",
      "OutputTypeDefinition": "@file:types/work-queue-cancel-item.output.ts",
      "OutputTypeIsArray": false,
      "ExecutionMode": "Sync",
      "RequiredScope": "workqueue:manage",
      "RequiresSystemUser": false,
      "GenerationType": "Manual",
      "CodeApprovalStatus": "Approved",
      "Status": "Active"
    },
    "primaryKey": { "ID": "F1C4313C-3EE7-41A5-A6B1-7F391A469B1C" }
  }
]
```

The eight type files in `metadata/remote-operations/types/`:

```typescript
// work-queue-get-queue-stats.input.ts
/** Input for `WorkQueue.GetQueueStats`. */
export interface WorkQueueGetQueueStatsInput {
    /** Limit the result to one queue, by name. Omit for every queue. */
    queueName?: string;
}
```

```typescript
// work-queue-get-queue-stats.output.ts
/** Output of `WorkQueue.GetQueueStats`. */
export interface WorkQueueGetQueueStatsOutput {
    /** False when the configured driver cannot inspect items; `queues` is then empty. */
    supported: boolean;
    queues: {
        queueName: string;
        pending: number;
        inProgress: number;
        deadLetter: number;
        /** ISO 8601 creation time of the oldest pending item, or null when none is pending. */
        oldestPendingAt: string | null;
    }[];
}
```

```typescript
// work-queue-list-blocked-partitions.input.ts
/** Input for `WorkQueue.ListBlockedPartitions`. */
export interface WorkQueueListBlockedPartitionsInput {
    /** Limit the result to one queue, by name. Omit for every queue. */
    queueName?: string;
}
```

```typescript
// work-queue-list-blocked-partitions.output.ts
/** Output of `WorkQueue.ListBlockedPartitions`. */
export interface WorkQueueListBlockedPartitionsOutput {
    /** False when the configured driver cannot list blocked partitions; `partitions` is then empty. */
    supported: boolean;
    partitions: {
        queueName: string;
        partitionKey: string;
        /** The dead-lettered item at the head of the partition. Replay or cancel it to unblock. */
        itemID: string;
        deadLetterReason: string | null;
        errorMessage: string | null;
        /** Pending items waiting behind the head. */
        waitingCount: number;
    }[];
}
```

```typescript
// work-queue-replay-dead-letter.input.ts
/** Input for `WorkQueue.ReplayDeadLetter`. */
export interface WorkQueueReplayDeadLetterInput {
    /** The `MJ: Work Queue Items` ID of a dead-lettered item. */
    itemID: string;
}
```

```typescript
// work-queue-replay-dead-letter.output.ts
/** Output of `WorkQueue.ReplayDeadLetter`. */
export interface WorkQueueReplayDeadLetterOutput {
    /** False when the configured driver cannot replay a single item. */
    supported: boolean;
    /** False when the item does not exist or is not dead-lettered. */
    replayed: boolean;
}
```

```typescript
// work-queue-cancel-item.input.ts
/** Input for `WorkQueue.CancelItem`. */
export interface WorkQueueCancelItemInput {
    /** The `MJ: Work Queue Items` ID of a pending or dead-lettered item. */
    itemID: string;
}
```

```typescript
// work-queue-cancel-item.output.ts
/** Output of `WorkQueue.CancelItem`. */
export interface WorkQueueCancelItemOutput {
    /** False when the configured driver cannot address single items. */
    supported: boolean;
    /** False when the item does not exist or is neither pending nor dead-lettered. */
    cancelled: boolean;
}
```

- [ ] **Step 2: Push the metadata and generate the operation bases**

Run: `pnpm exec mj sync push --dir=metadata --ci --dry-run`
Expected: 1 remote operation category create and 4 remote operation creates; no lookup failures.

Run: `pnpm exec mj sync push --dir=metadata --ci`
Run: `pnpm exec mj codegen --skipdb`

Run: `grep -oE "export class WorkQueue[A-Za-z]+Operation" packages/MJCoreEntities/src/generated/remote_operations.ts | sort`
Expected — exactly these four lines:

```
export class WorkQueueCancelItemOperation
export class WorkQueueGetQueueStatsOperation
export class WorkQueueListBlockedPartitionsOperation
export class WorkQueueReplayDeadLetterOperation
```

Run: `cd packages/MJCoreEntities && pnpm run build`
Expected: builds.

- [ ] **Step 3: Write the failing tests**

`packages/WorkQueue/src/__tests__/AdminSql.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AdminSql } from '../sql/AdminSql';
import { RecordingExecutor } from './fakes';

const QUEUE_ID = 'AAAAAAAA-0000-0000-0000-000000000001';

describe('AdminSql on SQL Server', () => {
    const sql = new AdminSql(new RecordingExecutor());

    it('counts items per queue by status, across every queue when unfiltered', () => {
        const statement = sql.QueueStats(null);
        expect(statement.SQL).toContain("SUM(CASE WHEN i.[Status] = N'Pending' THEN 1 ELSE 0 END) AS [Pending]");
        expect(statement.SQL).toContain('LEFT JOIN [__mj].[WorkQueueItem] i ON i.[QueueID] = q.[ID]');
        expect(statement.SQL).not.toContain('WHERE');
        expect(statement.Params).toEqual([]);
    });

    it('lists only dead-lettered heads of Block Partition queues, optionally for one queue', () => {
        const statement = sql.BlockedPartitions(QUEUE_ID);
        expect(statement.SQL).toContain("q.[DeadLetterPolicy] = N'Block Partition'");
        expect(statement.SQL).toContain('NOT EXISTS');
        expect(statement.SQL).toContain('AND q.[ID] = @p0');
        expect(statement.Params).toEqual([QUEUE_ID]);
    });

    it('replays only a dead-lettered item, resetting its attempts', () => {
        const statement = sql.ReplayDeadLetter('item-1');
        expect(statement.SQL).toContain("[Status] = N'Pending', [AttemptCount] = 0");
        expect(statement.SQL).toContain("WHERE [ID] = @p0 AND [Status] = N'Dead Letter'");
        expect(statement.Params).toEqual(['item-1']);
    });

    it('cancels only pending or dead-lettered items', () => {
        expect(sql.CancelItem('item-1').SQL).toContain("WHERE [ID] = @p0 AND [Status] IN (N'Pending', N'Dead Letter')");
    });
});

describe('AdminSql on PostgreSQL', () => {
    it('casts IDs and uses PostgreSQL literals and clock', () => {
        const sql = new AdminSql(new RecordingExecutor('postgresql'));
        expect(sql.QueueStats(QUEUE_ID).SQL).toContain('WHERE q."ID" = $1::uuid');
        const cancel = sql.CancelItem('item-1').SQL;
        expect(cancel).toContain('"CompletedAt" = now()');
        expect(cancel).toContain(`"Status" IN ('Pending', 'Dead Letter')`);
    });
});
```

`packages/WorkQueue/src/__tests__/WorkQueueAdmin.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorkQueueAdmin } from '../admin/WorkQueueAdmin';
import { NATIVE_DRIVER_CAPABILITIES } from '../capabilities';
import { WorkQueueConfigurationError } from '../errors';
import type { WorkQueueDriverCapabilities } from '../types';
import { ClickIndex, QUEUE_FIXTURE, RecordingExecutor, StaticMetadataSource, TEST_USER } from './fakes';

const ITEM_ID = 'FFFFFFFF-0000-0000-0000-000000000001';
const NO_ADMIN: WorkQueueDriverCapabilities = {
    ...NATIVE_DRIVER_CAPABILITIES, PeekItems: false, ListBlockedPartitions: false, ReplaySingleDeadLetter: false,
};

function makeAdmin(executor: RecordingExecutor, capabilities: WorkQueueDriverCapabilities = NATIVE_DRIVER_CAPABILITIES): WorkQueueAdmin {
    return new WorkQueueAdmin(executor, capabilities, new StaticMetadataSource(ClickIndex()));
}

describe('WorkQueueAdmin', () => {
    it('maps queue stats, converting driver-typed counts and timestamps', async () => {
        const executor = new RecordingExecutor('postgresql').QueueResponse([
            { QueueName: 'venue-import', Pending: '3', InProgress: 1, DeadLetter: '0', OldestPendingAt: new Date('2026-09-15T08:00:00Z') },
            { QueueName: 'click-archiver', Pending: 0, InProgress: 0, DeadLetter: 0, OldestPendingAt: null },
        ]);
        expect(await makeAdmin(executor).GetQueueStats({}, TEST_USER)).toEqual({
            supported: true,
            queues: [
                { queueName: 'venue-import', pending: 3, inProgress: 1, deadLetter: 0, oldestPendingAt: '2026-09-15T08:00:00.000Z' },
                { queueName: 'click-archiver', pending: 0, inProgress: 0, deadLetter: 0, oldestPendingAt: null },
            ],
        });
    });

    it('filters by a queue name resolved case-insensitively through metadata', async () => {
        const executor = new RecordingExecutor();
        await makeAdmin(executor).GetQueueStats({ queueName: ' VENUE-IMPORT ' }, TEST_USER);
        expect(executor.Calls[0].Params).toEqual([QUEUE_FIXTURE.ID]);
    });

    it('rejects an unknown queue name', async () => {
        await expect(makeAdmin(new RecordingExecutor()).ListBlockedPartitions({ queueName: 'nope' }, TEST_USER))
            .rejects.toThrow(WorkQueueConfigurationError);
    });

    it('maps blocked partitions', async () => {
        const executor = new RecordingExecutor().QueueResponse([
            { QueueName: 'venue-import', PartitionKey: 'venue-42', ItemID: ITEM_ID, DeadLetterReason: 'Fatal Error', ErrorMessage: 'bad file', WaitingCount: '2' },
        ]);
        expect(await makeAdmin(executor).ListBlockedPartitions({}, TEST_USER)).toEqual({
            supported: true,
            partitions: [{ queueName: 'venue-import', partitionKey: 'venue-42', itemID: ITEM_ID, deadLetterReason: 'Fatal Error', errorMessage: 'bad file', waitingCount: 2 }],
        });
    });

    it('reports whether a replay or cancel changed an item', async () => {
        const executor = new RecordingExecutor().QueueResponse([{ AffectedRows: 1 }]).QueueResponse([{ AffectedRows: 0 }]);
        const admin = makeAdmin(executor);
        expect(await admin.ReplayDeadLetter({ itemID: ITEM_ID }, TEST_USER)).toEqual({ supported: true, replayed: true });
        expect(await admin.CancelItem({ itemID: ITEM_ID }, TEST_USER)).toEqual({ supported: true, cancelled: false });
    });

    it('rejects an item ID that is not a UUID without touching the database', async () => {
        const executor = new RecordingExecutor();
        await expect(makeAdmin(executor).CancelItem({ itemID: "1'; DROP TABLE x" }, TEST_USER)).rejects.toThrow('itemID must be a UUID');
        expect(executor.Calls).toHaveLength(0);
    });

    it('answers unsupported without touching the database when the driver lacks the capability', async () => {
        const executor = new RecordingExecutor();
        const admin = makeAdmin(executor, NO_ADMIN);
        expect(await admin.GetQueueStats({}, TEST_USER)).toEqual({ supported: false, queues: [] });
        expect(await admin.ListBlockedPartitions({}, TEST_USER)).toEqual({ supported: false, partitions: [] });
        expect(await admin.ReplayDeadLetter({ itemID: ITEM_ID }, TEST_USER)).toEqual({ supported: false, replayed: false });
        expect(await admin.CancelItem({ itemID: ITEM_ID }, TEST_USER)).toEqual({ supported: false, cancelled: false });
        expect(executor.Calls).toHaveLength(0);
    });
});
```

`packages/WorkQueue/src/__tests__/WorkQueueOperations.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BaseRemotableOperation } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { WorkQueueCancelItemServerOperation } from '../operations/WorkQueueOperations';
import { TEST_PROVIDER, TEST_USER } from './fakes';

describe('work queue remote operations', () => {
    it('register the server implementation under the operation key', () => {
        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseRemotableOperation, 'WorkQueue.CancelItem');
        expect(registration?.SubClass).toBe(WorkQueueCancelItemServerOperation);
    });

    it('fail clearly on a provider without database access', async () => {
        const result = await new WorkQueueCancelItemServerOperation().ExecuteServer(
            { itemID: 'FFFFFFFF-0000-0000-0000-000000000001' },
            { provider: TEST_PROVIDER, user: TEST_USER, emitProgress: () => {} },
        );
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('database provider');
    });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd packages/WorkQueue && pnpm test AdminSql WorkQueueAdmin WorkQueueOperations`
Expected: FAIL — unresolved imports `../sql/AdminSql`, `../admin/WorkQueueAdmin`, `../operations/WorkQueueOperations`.

- [ ] **Step 5: Write `src/sql/AdminSql.ts`**

```typescript
import { QualifiedTable, type SqlStatement, type WorkQueueSqlExecutor } from './sqlExecution';
import { SqlParamList } from './SqlParamList';

/**
 * Operator statements. The SQL is shared; identifiers, string literals, UUID casts and the clock follow the
 * provider's platform. Only fixed status names are inlined as literals — every caller value is bound.
 */
export class AdminSql {
    private readonly postgres: boolean;

    constructor(private readonly executor: WorkQueueSqlExecutor) {
        this.postgres = executor.PlatformKey === 'postgresql';
    }

    public QueueStats(queueID: string | null): SqlStatement {
        const p = new SqlParamList(this.executor);
        const filter = queueID ? `WHERE q.${this.id('ID')} = ${this.uuid(p.Add(queueID))}` : '';
        const SQL = `SELECT q.${this.id('Name')} AS ${this.id('QueueName')},
    ${this.countWhere('Pending', 'Pending')},
    ${this.countWhere('In Progress', 'InProgress')},
    ${this.countWhere('Dead Letter', 'DeadLetter')},
    MIN(CASE WHEN i.${this.id('Status')} = ${this.text('Pending')} THEN i.${this.id('__mj_CreatedAt')} END) AS ${this.id('OldestPendingAt')}
FROM ${this.queues} q
LEFT JOIN ${this.items} i ON i.${this.id('QueueID')} = q.${this.id('ID')}
${filter}
GROUP BY q.${this.id('Name')}
ORDER BY q.${this.id('Name')}`;
        return { SQL, Params: p.Values };
    }

    public BlockedPartitions(queueID: string | null): SqlStatement {
        const p = new SqlParamList(this.executor);
        const filter = queueID ? `\n  AND q.${this.id('ID')} = ${this.uuid(p.Add(queueID))}` : '';
        const SQL = `SELECT q.${this.id('Name')} AS ${this.id('QueueName')}, i.${this.id('PartitionKey')} AS ${this.id('PartitionKey')},
    i.${this.id('ID')} AS ${this.id('ItemID')}, i.${this.id('DeadLetterReason')} AS ${this.id('DeadLetterReason')},
    i.${this.id('ErrorMessage')} AS ${this.id('ErrorMessage')},
    (SELECT COUNT(*) FROM ${this.items} w WHERE ${this.samePartition('w')} AND w.${this.id('Status')} = ${this.text('Pending')}
        AND w.${this.id('Sequence')} > i.${this.id('Sequence')}) AS ${this.id('WaitingCount')}
FROM ${this.items} i
INNER JOIN ${this.queues} q ON q.${this.id('ID')} = i.${this.id('QueueID')}
WHERE i.${this.id('Status')} = ${this.text('Dead Letter')} AND i.${this.id('PartitionKey')} IS NOT NULL
  AND q.${this.id('DeadLetterPolicy')} = ${this.text('Block Partition')}
  AND NOT EXISTS (SELECT 1 FROM ${this.items} o WHERE ${this.samePartition('o')} AND o.${this.id('Sequence')} < i.${this.id('Sequence')}
      AND o.${this.id('Status')} IN (${this.text('Pending')}, ${this.text('In Progress')}, ${this.text('Dead Letter')}))${filter}
ORDER BY q.${this.id('Name')}, i.${this.id('Sequence')}`;
        return { SQL, Params: p.Values };
    }

    public ReplayDeadLetter(itemID: string): SqlStatement {
        const p = new SqlParamList(this.executor);
        const set = this.assignments({
            Status: this.text('Pending'), AttemptCount: '0', RunAfter: 'NULL', DeadLetterReason: 'NULL', ErrorMessage: 'NULL',
            ClaimedBy: 'NULL', ClaimExpiresAt: 'NULL', StartedAt: 'NULL', CompletedAt: 'NULL',
        });
        const SQL = `UPDATE ${this.items} SET ${set} WHERE ${this.id('ID')} = ${this.uuid(p.Add(itemID))} AND ${this.id('Status')} = ${this.text('Dead Letter')}`;
        return { SQL, Params: p.Values };
    }

    public CancelItem(itemID: string): SqlStatement {
        const p = new SqlParamList(this.executor);
        const set = this.assignments({ Status: this.text('Cancelled'), ClaimedBy: 'NULL', ClaimExpiresAt: 'NULL', CompletedAt: this.now });
        const statuses = `${this.text('Pending')}, ${this.text('Dead Letter')}`;
        const SQL = `UPDATE ${this.items} SET ${set} WHERE ${this.id('ID')} = ${this.uuid(p.Add(itemID))} AND ${this.id('Status')} IN (${statuses})`;
        return { SQL, Params: p.Values };
    }

    private get items(): string {
        return QualifiedTable(this.executor, 'WorkQueueItem');
    }

    private get queues(): string {
        return QualifiedTable(this.executor, 'WorkQueue');
    }

    private get now(): string {
        return this.postgres ? 'now()' : 'SYSDATETIMEOFFSET()';
    }

    private id(name: string): string {
        return this.executor.QuoteIdentifier(name);
    }

    /** A fixed literal. Never pass caller input here. */
    private text(value: string): string {
        return this.postgres ? `'${value}'` : `N'${value}'`;
    }

    private uuid(placeholder: string): string {
        return this.postgres ? `${placeholder}::uuid` : placeholder;
    }

    private countWhere(status: string, alias: string): string {
        return `SUM(CASE WHEN i.${this.id('Status')} = ${this.text(status)} THEN 1 ELSE 0 END) AS ${this.id(alias)}`;
    }

    private samePartition(alias: string): string {
        return `${alias}.${this.id('QueueID')} = i.${this.id('QueueID')} AND ${alias}.${this.id('PartitionKey')} = i.${this.id('PartitionKey')}`;
    }

    private assignments(values: Record<string, string>): string {
        return Object.entries(values).map(([column, value]) => `${this.id(column)} = ${value}`).join(', ');
    }
}
```

- [ ] **Step 6: Write `src/admin/WorkQueueAdmin.ts`**

```typescript
import type { UserInfo } from '@memberjunction/core';
import type {
    WorkQueueCancelItemInput, WorkQueueCancelItemOutput, WorkQueueGetQueueStatsInput, WorkQueueGetQueueStatsOutput,
    WorkQueueListBlockedPartitionsInput, WorkQueueListBlockedPartitionsOutput, WorkQueueReplayDeadLetterInput,
    WorkQueueReplayDeadLetterOutput,
} from '@memberjunction/core-entities';
import { WorkQueueConfigurationError } from '../errors';
import type { WorkQueueMetadataSource } from '../metadata/WorkQueueMetadataIndex';
import { AdminSql } from '../sql/AdminSql';
import { ExecuteRows, ExecuteWrite, type WorkQueueSqlExecutor } from '../sql/sqlExecution';
import type { WorkQueueDriverCapabilities } from '../types';

type QueueStats = WorkQueueGetQueueStatsOutput['queues'][number];
type BlockedPartition = WorkQueueListBlockedPartitionsOutput['partitions'][number];

/** Counts arrive as numbers from SQL Server and as strings (bigint) from PostgreSQL. */
interface StatsRow {
    QueueName: string;
    Pending: number | string;
    InProgress: number | string;
    DeadLetter: number | string;
    OldestPendingAt: Date | string | null;
}

interface BlockedRow {
    QueueName: string;
    PartitionKey: string;
    ItemID: string;
    DeadLetterReason: string | null;
    ErrorMessage: string | null;
    WaitingCount: number | string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Operator reads and repairs over work queue items. Each method checks the driver capability it needs and
 * answers supported: false, without touching the database, when the driver lacks it.
 */
export class WorkQueueAdmin {
    private readonly sql: AdminSql;

    constructor(
        private readonly executor: WorkQueueSqlExecutor,
        private readonly capabilities: WorkQueueDriverCapabilities,
        private readonly metadata: WorkQueueMetadataSource,
    ) {
        this.sql = new AdminSql(executor);
    }

    public async GetQueueStats(input: WorkQueueGetQueueStatsInput, contextUser: UserInfo): Promise<WorkQueueGetQueueStatsOutput> {
        if (!this.capabilities.PeekItems) {
            return { supported: false, queues: [] };
        }
        const queueID = await this.resolveQueueID(input.queueName, contextUser);
        const rows = await ExecuteRows<StatsRow>(this.executor, this.sql.QueueStats(queueID), contextUser);
        return { supported: true, queues: rows.map(toQueueStats) };
    }

    public async ListBlockedPartitions(input: WorkQueueListBlockedPartitionsInput, contextUser: UserInfo): Promise<WorkQueueListBlockedPartitionsOutput> {
        if (!this.capabilities.ListBlockedPartitions) {
            return { supported: false, partitions: [] };
        }
        const queueID = await this.resolveQueueID(input.queueName, contextUser);
        const rows = await ExecuteRows<BlockedRow>(this.executor, this.sql.BlockedPartitions(queueID), contextUser);
        return { supported: true, partitions: rows.map(toBlockedPartition) };
    }

    public async ReplayDeadLetter(input: WorkQueueReplayDeadLetterInput, contextUser: UserInfo): Promise<WorkQueueReplayDeadLetterOutput> {
        if (!this.capabilities.ReplaySingleDeadLetter) {
            return { supported: false, replayed: false };
        }
        const changed = await ExecuteWrite(this.executor, this.sql.ReplayDeadLetter(requireUUID(input.itemID)), contextUser);
        return { supported: true, replayed: changed > 0 };
    }

    public async CancelItem(input: WorkQueueCancelItemInput, contextUser: UserInfo): Promise<WorkQueueCancelItemOutput> {
        if (!this.capabilities.PeekItems) {
            return { supported: false, cancelled: false };
        }
        const changed = await ExecuteWrite(this.executor, this.sql.CancelItem(requireUUID(input.itemID)), contextUser);
        return { supported: true, cancelled: changed > 0 };
    }

    private async resolveQueueID(queueName: string | undefined, contextUser: UserInfo): Promise<string | null> {
        if (!queueName) {
            return null;
        }
        const queue = (await this.metadata.GetIndex(contextUser)).QueueByName(queueName);
        if (!queue) {
            throw new WorkQueueConfigurationError(`Unknown work queue '${queueName}'`);
        }
        return queue.ID;
    }
}

function toQueueStats(row: StatsRow): QueueStats {
    return {
        queueName: row.QueueName,
        pending: Number(row.Pending),
        inProgress: Number(row.InProgress),
        deadLetter: Number(row.DeadLetter),
        oldestPendingAt: row.OldestPendingAt === null ? null : new Date(row.OldestPendingAt).toISOString(),
    };
}

function toBlockedPartition(row: BlockedRow): BlockedPartition {
    return {
        queueName: row.QueueName,
        partitionKey: row.PartitionKey,
        itemID: row.ItemID,
        deadLetterReason: row.DeadLetterReason,
        errorMessage: row.ErrorMessage,
        waitingCount: Number(row.WaitingCount),
    };
}

function requireUUID(value: unknown): string {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
        throw new WorkQueueConfigurationError('itemID must be a UUID');
    }
    return value;
}
```

- [ ] **Step 7: Write `src/operations/WorkQueueOperations.ts`**

```typescript
import { BaseRemotableOperation, DatabaseProviderBase, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import {
    WorkQueueCancelItemOperation, WorkQueueGetQueueStatsOperation, WorkQueueListBlockedPartitionsOperation,
    WorkQueueReplayDeadLetterOperation,
    type WorkQueueCancelItemInput, type WorkQueueCancelItemOutput, type WorkQueueGetQueueStatsInput,
    type WorkQueueGetQueueStatsOutput, type WorkQueueListBlockedPartitionsInput, type WorkQueueListBlockedPartitionsOutput,
    type WorkQueueReplayDeadLetterInput, type WorkQueueReplayDeadLetterOutput,
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { WorkQueueAdmin } from '../admin/WorkQueueAdmin';
import { WorkQueueRuntime } from '../WorkQueueRuntime';

/** An admin bound to the executing provider and the configured driver. */
function adminFor(provider: IMetadataProvider): WorkQueueAdmin {
    if (!(provider instanceof DatabaseProviderBase)) {
        throw new Error('Work queue operations run only on a server with a database provider');
    }
    const runtime = WorkQueueRuntime.Instance;
    return new WorkQueueAdmin(provider, runtime.Driver.Capabilities, runtime.Metadata);
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.GetQueueStats')
export class WorkQueueGetQueueStatsServerOperation extends WorkQueueGetQueueStatsOperation {
    protected InternalExecute(input: WorkQueueGetQueueStatsInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueGetQueueStatsOutput> {
        return adminFor(provider).GetQueueStats(input ?? {}, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.ListBlockedPartitions')
export class WorkQueueListBlockedPartitionsServerOperation extends WorkQueueListBlockedPartitionsOperation {
    protected InternalExecute(input: WorkQueueListBlockedPartitionsInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueListBlockedPartitionsOutput> {
        return adminFor(provider).ListBlockedPartitions(input ?? {}, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.ReplayDeadLetter')
export class WorkQueueReplayDeadLetterServerOperation extends WorkQueueReplayDeadLetterOperation {
    protected InternalExecute(input: WorkQueueReplayDeadLetterInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueReplayDeadLetterOutput> {
        return adminFor(provider).ReplayDeadLetter(input, user);
    }
}

@RegisterClass(BaseRemotableOperation, 'WorkQueue.CancelItem')
export class WorkQueueCancelItemServerOperation extends WorkQueueCancelItemOperation {
    protected InternalExecute(input: WorkQueueCancelItemInput, provider: IMetadataProvider, user: UserInfo): Promise<WorkQueueCancelItemOutput> {
        return adminFor(provider).CancelItem(input, user);
    }
}
```

`DatabaseProviderBase` exposes `PlatformKey`, `Dialect`, `MJCoreSchemaName`, `QuoteIdentifier`,
`BuildParameterPlaceholder` and `ExecuteSQL` publicly, so it satisfies `WorkQueueSqlExecutor` with no cast.

- [ ] **Step 8: Export the new modules**

Append to `packages/WorkQueue/src/index.ts`:

```typescript
export * from './sql/AdminSql';
export * from './admin/WorkQueueAdmin';
export * from './operations/WorkQueueOperations';
```

- [ ] **Step 9: Run the tests and build**

Run: `cd packages/WorkQueue && pnpm test`
Expected: PASS — all suites, including AdminSql (5), WorkQueueAdmin (7) and WorkQueueOperations (2).

Run: `cd packages/WorkQueue && pnpm run build`
Expected: builds. A missing `WorkQueue…Operation` export means Step 2's CodeGen did not run.

- [ ] **Step 10: Commit**

```bash
git add metadata/remote-operation-categories metadata/remote-operations packages/MJCoreEntities/src/generated packages/WorkQueue/src
git commit -m "feat(work-queue): queue stats, blocked partitions, replay and cancel as remote operations"
```

---

### Task 13: MJServer configuration and host

**Files:**
- Modify: `packages/MJServer/package.json`, `packages/MJServer/src/config.ts`, `packages/MJServer/src/index.ts`
- Create: `packages/MJServer/src/services/WorkQueueHost.ts`
- Test: `packages/MJServer/src/__tests__/WorkQueueHost.test.ts`

**Interfaces:**
- Consumes: `CreateWorkQueueRuntimeParts`, `WorkQueueRuntime`, `WorkQueueRuntimeParts`, `WorkQueueRuntimeOptions`, `DefaultMaintenanceTasks`, `WorkQueueMaintenance` (Task 11); `WorkQueueWorker` (Task 10); `WorkQueueWorkerConfig`, `BaseWorkQueueDriver`, `NATIVE_DRIVER_CAPABILITIES`, `WorkQueueMetadataIndex`, `WorkQueueProducer` from `@memberjunction/work-queue`; `UserCache` from `@memberjunction/generic-database-provider`.
- Produces:
  - `workQueue` section of MJServer configuration (spec 02 §8) and `type WorkQueueConfig`
  - `interface WorkQueueLoop { Start(): void; Stop(): void }`, `interface WorkQueueHostDependencies`
  - `class WorkQueueHost` — `constructor(config: WorkQueueConfig, dependencies?: WorkQueueHostDependencies)`, `Configure(provider: DatabaseProviderBase): void`, `StartWorker(): Promise<void>`, `Stop(): void`, `WorkerRunning: boolean`, `ValidationProblems: string[]`

Host rules:

- **Every instance publishes.** `Configure` builds the runtime parts and configures `WorkQueueRuntime`. It
  does no database I/O, so an install that never uses the work queue pays nothing at startup.
- **Only `workerEnabled` instances process.** `StartWorker` resolves the system user, asks the driver to
  validate the active queues (problems are logged and kept in `ValidationProblems`; the worker skips those
  queues), then starts the worker and maintenance loops. Both loops register with `ShutdownRegistry`, so
  MJServer's existing shutdown drain stops them.
- **The work queue never blocks startup.** MJServer logs a failure and keeps serving.
- The whole `workQueue` block, including driver-specific keys such as `aws` (plan 05), is passed to the
  driver as its settings. The schema is `passthrough` for that reason.
- `WorkerID` is `<hostname>:<pid>:<8 random hex>`, truncated to 200 characters (`ClaimedBy` is
  `NVARCHAR(200)`).

- [ ] **Step 1: Add the dependency**

In `packages/MJServer/package.json` `dependencies`, add (keeping alphabetical order):

```json
"@memberjunction/work-queue": "6.1.0-edge.4",
```

Run: `pnpm install` (repository root)
Expected: installs; `packages/MJServer/node_modules/@memberjunction/work-queue` links to the workspace package.

- [ ] **Step 2: Add the configuration section**

In `packages/MJServer/src/config.ts`, after `integrationSyncWorkerSchema`, add:

```typescript
/**
 * Durable work queue. Every instance can publish once the runtime is configured; only instances with
 * workerEnabled claim and process items. The block is passed through to the driver as its settings, so
 * driver-specific keys (for example `aws`) are allowed.
 */
const workQueueSchema = z.object({
  /** ClassFactory key of the BaseWorkQueueDriver: 'Native' (database) or 'AWS'. */
  driver: z.string().optional().default('Native'),
  /** Run the worker and maintenance loops in this process. */
  workerEnabled: z.boolean().optional().default(false),
  /** Email of the user handlers run as. */
  systemUserEmail: z.string().optional().default('system@memberjunction.org'),
  /** How often the worker polls for claimable items, in ms. */
  pollingIntervalMs: z.number().int().positive().optional().default(1000),
  /** Items this process runs concurrently. */
  maxConcurrentItems: z.number().int().positive().optional().default(10),
  /** Minimum time between lease renewals for one item, in ms. */
  heartbeatMinIntervalMs: z.number().int().nonnegative().optional().default(5000),
  /** How often maintenance reaps exhausted leases and purges expired deduplication keys, in ms. */
  maintenanceIntervalMs: z.number().int().positive().optional().default(60000),
  /** Payload cap in UTF-8 bytes; never above 64,000. */
  maxPayloadBytes: z.number().int().positive().max(64000).optional().default(64000),
}).passthrough();
```

In `configInfoSchema`, after `integrationSyncWorker: …`, add:

```typescript
  workQueue: workQueueSchema.optional().default({}),
```

After `export type IntegrationSyncWorkerConfig = …`, add:

```typescript
export type WorkQueueConfig = z.infer<typeof workQueueSchema>;
```

In `DEFAULT_SERVER_CONFIG`, after the `integrationSyncWorker` block, add:

```typescript
  // Work queue defaults (publishing on; processing off until an instance opts in)
  workQueue: {
    driver: 'Native',
    workerEnabled: false,
    systemUserEmail: 'not.set@nowhere.com',
    pollingIntervalMs: 1000,
    maxConcurrentItems: 10,
    heartbeatMinIntervalMs: 5000,
    maintenanceIntervalMs: 60000,
    maxPayloadBytes: 64000
  },
```

- [ ] **Step 3: Write the failing test**

`packages/MJServer/src/__tests__/WorkQueueHost.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

// config.ts validates database environment at module load, and UserCache needs a live provider; the host
// receives both through its dependencies here.
vi.mock('../config.js', () => ({ configInfo: {} }));
vi.mock('@memberjunction/generic-database-provider', () => ({ UserCache: { get Users() { return []; } } }));

import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import {
    BaseWorkQueueDriver, NATIVE_DRIVER_CAPABILITIES, WorkQueueMetadataIndex, WorkQueueProducer, WorkQueueRuntime,
    type ClaimedWorkItem, type DeliveredItem, type WorkQueueDefinition, type WorkQueueMetadataSource,
    type WorkQueueRuntimeOptions, type WorkQueueRuntimeParts, type WorkQueueWorkerConfig,
} from '@memberjunction/work-queue';
import { WorkQueueHost, type WorkQueueHostDependencies, type WorkQueueLoop } from '../services/WorkQueueHost.js';
import type { WorkQueueConfig } from '../config.js';

const PROVIDER = {} as DatabaseProviderBase;
const SYSTEM_USER = { ID: 'U-1', Email: 'system@memberjunction.org' } as UserInfo;
const QUEUE: WorkQueueDefinition = {
    ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'venue-import', LeaseSeconds: 300, MaxAttempts: 3,
    InitialBackoffSeconds: 60, MaxBackoffSeconds: 1800, DeadLetterPolicy: 'Block Partition', PurgeOnComplete: true, IsActive: true,
};

function unused<T>(): Promise<T> {
    return Promise.reject(new Error('not used by these tests'));
}

/** A driver that cannot honour Block Partition. Only ValidateQueues is exercised. */
class StubDriver extends BaseWorkQueueDriver {
    public readonly DriverKey = 'Stub';
    public readonly Capabilities = { ...NATIVE_DRIVER_CAPABILITIES, BlockPartitionDeadLetter: false };
    public Deliver(): Promise<DeliveredItem[]> { return unused(); }
    public Claim(): Promise<ClaimedWorkItem | null> { return unused(); }
    public Heartbeat(): Promise<boolean> { return unused(); }
    public Complete(): Promise<boolean> { return unused(); }
    public Retry(): Promise<boolean> { return unused(); }
    public DeadLetter(): Promise<boolean> { return unused(); }
    public ReapLeaseExhausted(): Promise<number> { return unused(); }
}

class FakeLoop implements WorkQueueLoop {
    public Started = 0;
    public Stopped = 0;
    constructor(public readonly Kind: string) {}
    public Start(): void { this.Started++; }
    public Stop(): void { this.Stopped++; }
}

interface Harness {
    Dependencies: WorkQueueHostDependencies;
    Parts: WorkQueueRuntimeParts;
    PartsOptions: WorkQueueRuntimeOptions[];
    WorkerConfigs: WorkQueueWorkerConfig[];
    Loops: FakeLoop[];
}

function makeHarness(users: UserInfo[] = [SYSTEM_USER]): Harness {
    const driver = new StubDriver();
    const metadata: WorkQueueMetadataSource = { GetIndex: async () => new WorkQueueMetadataIndex([QUEUE], [], []) };
    const parts: WorkQueueRuntimeParts = { Driver: driver, Metadata: metadata, Producer: new WorkQueueProducer(driver, metadata) };
    const partsOptions: WorkQueueRuntimeOptions[] = [];
    const workerConfigs: WorkQueueWorkerConfig[] = [];
    const loops: FakeLoop[] = [];
    const addLoop = (kind: string): FakeLoop => {
        const loop = new FakeLoop(kind);
        loops.push(loop);
        return loop;
    };
    const dependencies: WorkQueueHostDependencies = {
        CreateParts: options => {
            partsOptions.push(options);
            return parts;
        },
        FindUserByEmail: email => users.find(user => user.Email === email),
        CreateWorker: config => {
            workerConfigs.push(config);
            return addLoop('worker');
        },
        CreateMaintenance: () => addLoop('maintenance'),
    };
    return { Dependencies: dependencies, Parts: parts, PartsOptions: partsOptions, WorkerConfigs: workerConfigs, Loops: loops };
}

function makeConfig(overrides: Partial<WorkQueueConfig> = {}): WorkQueueConfig {
    return {
        driver: 'Native', workerEnabled: true, systemUserEmail: 'system@memberjunction.org', pollingIntervalMs: 1000,
        maxConcurrentItems: 10, heartbeatMinIntervalMs: 5000, maintenanceIntervalMs: 60000, maxPayloadBytes: 64000,
        ...overrides,
    };
}

async function startedHost(harness: Harness, config: WorkQueueConfig = makeConfig()): Promise<WorkQueueHost> {
    const host = new WorkQueueHost(config, harness.Dependencies);
    host.Configure(PROVIDER);
    await host.StartWorker();
    return host;
}

beforeEach(() => {
    WorkQueueRuntime.Instance.Reset();
});

describe('WorkQueueHost', () => {
    it('configures the runtime for publishing and passes the whole block to the driver', () => {
        const harness = makeHarness();
        new WorkQueueHost(makeConfig({ driver: 'AWS', maxPayloadBytes: 32000 }), harness.Dependencies).Configure(PROVIDER);
        expect(WorkQueueRuntime.Instance.Driver).toBe(harness.Parts.Driver);
        expect(harness.PartsOptions[0]).toMatchObject({ DriverKey: 'AWS', Executor: PROVIDER, MaxPayloadBytes: 32000 });
        expect(harness.PartsOptions[0].Settings).toMatchObject({ driver: 'AWS', maxPayloadBytes: 32000 });
    });

    it('starts nothing when the worker is disabled', async () => {
        const harness = makeHarness();
        const host = await startedHost(harness, makeConfig({ workerEnabled: false }));
        expect(harness.Loops).toHaveLength(0);
        expect(host.WorkerRunning).toBe(false);
    });

    it('starts the worker and maintenance loops with the configured settings', async () => {
        const harness = makeHarness();
        const host = await startedHost(harness, makeConfig({ pollingIntervalMs: 250, maxConcurrentItems: 4, heartbeatMinIntervalMs: 2000 }));
        expect(harness.Loops.map(loop => [loop.Kind, loop.Started])).toEqual([['worker', 1], ['maintenance', 1]]);
        expect(harness.WorkerConfigs[0]).toMatchObject({ PollingIntervalMs: 250, MaxConcurrentItems: 4, HeartbeatMinIntervalMs: 2000 });
        expect(harness.WorkerConfigs[0].WorkerID).toContain(`:${process.pid}:`);
        expect(host.WorkerRunning).toBe(true);
    });

    it('records queues the driver cannot process', async () => {
        const host = await startedHost(makeHarness());
        expect(host.ValidationProblems).toEqual([expect.stringContaining("Queue 'venue-import' uses the Block Partition dead-letter policy")]);
    });

    it('refuses to start the worker without the system user', async () => {
        const harness = makeHarness([]);
        await expect(startedHost(harness)).rejects.toThrow('System user not found with email: system@memberjunction.org');
        expect(harness.Loops).toHaveLength(0);
    });

    it('refuses to start the worker before Configure', async () => {
        const host = new WorkQueueHost(makeConfig(), makeHarness().Dependencies);
        await expect(host.StartWorker()).rejects.toThrow('Configure');
    });

    it('stops every loop it started', async () => {
        const harness = makeHarness();
        const host = await startedHost(harness);
        host.Stop();
        expect(harness.Loops.map(loop => loop.Stopped)).toEqual([1, 1]);
        expect(host.WorkerRunning).toBe(false);
    });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd packages/WorkQueue && pnpm run build` (MJServer consumes the built package)
Run: `cd packages/MJServer && pnpm test WorkQueueHost`
Expected: FAIL — unresolved import `../services/WorkQueueHost.js`.

- [ ] **Step 5: Write `packages/MJServer/src/services/WorkQueueHost.ts`**

```typescript
/**
 * @fileoverview Configures the durable work queue for this server and, when enabled, runs its worker.
 * @module MJServer/services
 */
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { LogStatus, type DatabaseProviderBase, type UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    CreateWorkQueueRuntimeParts, DefaultMaintenanceTasks, WorkQueueMaintenance, WorkQueueRuntime, WorkQueueWorker,
    type WorkQueueRuntimeOptions, type WorkQueueRuntimeParts, type WorkQueueWorkerConfig,
} from '@memberjunction/work-queue';
import type { WorkQueueConfig } from '../config.js';

/** A background loop the host starts and stops. */
export interface WorkQueueLoop {
    Start(): void;
    Stop(): void;
}

/** Seams for tests; production uses the defaults below. */
export interface WorkQueueHostDependencies {
    CreateParts(options: WorkQueueRuntimeOptions): WorkQueueRuntimeParts;
    FindUserByEmail(email: string): UserInfo | undefined;
    CreateWorker(config: WorkQueueWorkerConfig, parts: WorkQueueRuntimeParts, user: UserInfo, provider: DatabaseProviderBase): WorkQueueLoop;
    CreateMaintenance(parts: WorkQueueRuntimeParts, provider: DatabaseProviderBase, intervalMs: number, user: UserInfo): WorkQueueLoop;
}

const DEFAULT_DEPENDENCIES: WorkQueueHostDependencies = {
    CreateParts: CreateWorkQueueRuntimeParts,
    FindUserByEmail: email => UserCache.Users.find(user => user.Email?.trim().toLowerCase() === email.trim().toLowerCase()),
    CreateWorker: (config, parts, user, provider) => new WorkQueueWorker(config, parts.Driver, parts.Metadata, user, provider),
    CreateMaintenance: (parts, provider, intervalMs, user) =>
        new WorkQueueMaintenance(DefaultMaintenanceTasks(parts.Driver, provider), intervalMs, user),
};

/** ClaimedBy is NVARCHAR(200). */
const MAX_WORKER_ID_LENGTH = 200;

/**
 * Every instance configures the runtime so it can publish. Instances with workerEnabled also validate
 * queues against the driver and run the worker and maintenance loops, which register themselves with
 * ShutdownRegistry.
 */
export class WorkQueueHost {
    private parts: WorkQueueRuntimeParts | null = null;
    private provider: DatabaseProviderBase | null = null;
    private loops: WorkQueueLoop[] = [];
    private problems: string[] = [];

    constructor(
        private readonly config: WorkQueueConfig,
        private readonly dependencies: WorkQueueHostDependencies = DEFAULT_DEPENDENCIES,
    ) {}

    public get WorkerRunning(): boolean {
        return this.loops.length > 0;
    }

    /** Queues the driver reported it cannot process, from the last StartWorker. */
    public get ValidationProblems(): string[] {
        return [...this.problems];
    }

    /** Configures WorkQueueRuntime so this instance can publish. No database I/O. */
    public Configure(provider: DatabaseProviderBase): void {
        this.provider = provider;
        this.parts = this.dependencies.CreateParts({
            DriverKey: this.config.driver,
            Executor: provider,
            Settings: { ...this.config },
            MaxPayloadBytes: this.config.maxPayloadBytes,
        });
        WorkQueueRuntime.Instance.Configure(this.parts);
    }

    /** When workerEnabled: validates queues, then starts the worker and maintenance loops. */
    public async StartWorker(): Promise<void> {
        if (!this.config.workerEnabled) {
            return;
        }
        if (!this.parts || !this.provider) {
            throw new Error('[WorkQueue] Call Configure before StartWorker');
        }
        const user = this.systemUser();
        await this.validateQueues(this.parts, user);
        this.loops = [
            this.dependencies.CreateWorker(this.workerConfig(), this.parts, user, this.provider),
            this.dependencies.CreateMaintenance(this.parts, this.provider, this.config.maintenanceIntervalMs, user),
        ];
        for (const loop of this.loops) {
            loop.Start();
        }
    }

    public Stop(): void {
        for (const loop of this.loops) {
            loop.Stop();
        }
        this.loops = [];
    }

    private systemUser(): UserInfo {
        const user = this.dependencies.FindUserByEmail(this.config.systemUserEmail);
        if (!user) {
            throw new Error(`[WorkQueue] System user not found with email: ${this.config.systemUserEmail}`);
        }
        return user;
    }

    private async validateQueues(parts: WorkQueueRuntimeParts, user: UserInfo): Promise<void> {
        const index = await parts.Metadata.GetIndex(user);
        this.problems = await parts.Driver.ValidateQueues(index.Queues, user);
        for (const problem of this.problems) {
            LogStatus(`⚠️  Work Queue: ${problem}`);
        }
    }

    private workerConfig(): WorkQueueWorkerConfig {
        return {
            WorkerID: `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`.slice(0, MAX_WORKER_ID_LENGTH),
            PollingIntervalMs: this.config.pollingIntervalMs,
            MaxConcurrentItems: this.config.maxConcurrentItems,
            HeartbeatMinIntervalMs: this.config.heartbeatMinIntervalMs,
        };
    }
}
```

- [ ] **Step 6: Wire the host into startup**

In `packages/MJServer/src/index.ts`, add the import beside the other services:

```typescript
import { WorkQueueHost } from './services/WorkQueueHost.js';
```

Directly after the integration sync worker block (the `if (configInfo.integrationSyncWorker?.enabled) { … }`
block), add:

```typescript
  // Configure the durable work queue. Every instance can publish; only instances with
  // workQueue.workerEnabled claim and process items. A failure is logged and never stops the server.
  if (Metadata.Provider instanceof DatabaseProviderBase) { // global-provider-ok: server startup — the work queue runs on the server's own provider
    try {
      const workQueueHost = new WorkQueueHost(configInfo.workQueue);
      workQueueHost.Configure(Metadata.Provider); // global-provider-ok: server startup — the work queue runs on the server's own provider
      await workQueueHost.StartWorker();
    } catch (error) {
      console.error('❌ Failed to start the work queue:', error);
    }
  }
```

`Metadata` and `DatabaseProviderBase` are already imported in `index.ts`. The loops register with
`ShutdownRegistry`, which the existing shutdown drain already calls.

- [ ] **Step 7: Run the tests and build**

Run: `cd packages/MJServer && pnpm test WorkQueueHost`
Expected: PASS — 7 tests.

Run: `cd packages/MJServer && pnpm test`
Expected: PASS — no existing suite regresses (config-shape tests, if any, accept the new `workQueue` key).

Run: `cd packages/MJServer && pnpm run build`
Expected: builds.

- [ ] **Step 8: Commit**

```bash
git add packages/MJServer/package.json packages/MJServer/src/config.ts packages/MJServer/src/index.ts packages/MJServer/src/services/WorkQueueHost.ts packages/MJServer/src/__tests__/WorkQueueHost.test.ts pnpm-lock.yaml
git commit -m "feat(server): configure the work queue at startup and run its worker where enabled"
```

---

### Task 14: REST publish endpoint

**Files:**
- Create: `packages/MJServer/src/rest/workQueueRequests.ts`, `packages/MJServer/src/rest/WorkQueueRouter.ts`
- Modify: `packages/MJServer/src/index.ts`
- Test: `packages/MJServer/src/__tests__/workQueueRequests.test.ts`, `src/__tests__/WorkQueueRouter.test.ts`

**Interfaces:**
- Consumes: `WorkQueueRuntime` (Task 11); `WorkQueueProducer` (Task 8); `PayloadTooLargeError`, `WorkQueueConfigurationError`, `PublishOptions`, `BaseWorkQueueDriver`, `NATIVE_DRIVER_CAPABILITIES`, `WorkQueueMetadataIndex` from `@memberjunction/work-queue`; `CheckAPIKeyScope` (`src/auth/APIKeyScopeAuth.ts`); `AuthorizationError` from `type-graphql`; the `workqueue:publish` scope (Task 1).
- Produces:
  - `WORK_QUEUE_PUBLISH_SCOPE`, `WORK_QUEUE_BODY_LIMIT`, `type WorkQueuePublishRequest`, `type PublishRequestParseResult`, `interface WorkQueueHttpResult`, `ParsePublishRequest(body)`, `ToPublishOptions(request)`, `MapPublishError(error)`, `WorkQueueBodyError(error)`
  - `WORK_QUEUE_MOUNT_PATH = '/work-queue'`, `interface WorkQueuePublishContext`, `interface WorkQueueRouterDependencies`, `HandleWorkQueuePublish(context, dependencies)`, `createWorkQueueRouter(dependencies?)`

`POST /work-queue/publish` (spec 02 §6) is mounted after the unified authentication middleware. The
checks run in this order, so a caller without the scope learns nothing about topics:

| Order | Condition | Response |
| --- | --- | --- |
| 1 | No authenticated user | `401 { error }` |
| 2 | Runtime not configured on this instance | `503 { error }` |
| 3 | API key lacks `workqueue:publish` | `403 { error }` |
| 4 | Body fails validation (unknown keys are rejected) | `400 { error }` |
| 5 | Topic unknown or inactive | `404 { error }` |
| 6 | Topic has `AllowExternalPublish = false` | `403 { error }` |
| 7 | Payload over the cap | `413 { error, bytes, maxBytes }` |
| 8 | Option the driver cannot honour, invalid TTL, or malformed subscription filter | `400 { error }` |
| — | Published | `202 { publishId, itemIds, duplicateQueueNames }` |
| — | Anything else | `500 { error: 'Publish failed' }`, logged |

Bodies over 256 KB, or bodies that are not JSON, get `413` or `400` JSON responses from the router's own
error handler. A caller authenticated by session rather than API key passes step 3, as it does everywhere
else `CheckAPIKeyScope` is used.

- [ ] **Step 1: Write the failing tests**

`packages/MJServer/src/__tests__/workQueueRequests.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AuthorizationError } from 'type-graphql';
import { PayloadTooLargeError, WorkQueueConfigurationError } from '@memberjunction/work-queue';
import { MapPublishError, ParsePublishRequest, ToPublishOptions, WorkQueueBodyError } from '../rest/workQueueRequests.js';

describe('ParsePublishRequest', () => {
    it('accepts a topic and payload, trimming the topic', () => {
        const parsed = ParsePublishRequest({ topic: ' import.ready ', payload: { importId: 7 } });
        expect(parsed).toEqual({ Success: true, Request: { topic: 'import.ready', payload: { importId: 7 } } });
    });

    it('maps every option onto PublishOptions', () => {
        const parsed = ParsePublishRequest({
            topic: 'import.ready', payload: null, partitionKey: 'venue-42', tenantId: 't-1', correlationId: 'c-1',
            deduplicationKey: 'import:7', deduplicationTTLSeconds: 600, priority: 2,
        });
        if (!parsed.Success) {
            throw new Error(parsed.Error);
        }
        expect(ToPublishOptions(parsed.Request)).toEqual({
            PartitionKey: 'venue-42', TenantID: 't-1', CorrelationID: 'c-1', DeduplicationKey: 'import:7',
            DeduplicationTTLSeconds: 600, Priority: 2,
        });
    });

    it('requires a topic and a payload', () => {
        const parsed = ParsePublishRequest({ topic: '' });
        expect(parsed.Success).toBe(false);
        expect(parsed.Success ? '' : parsed.Error).toContain('topic');
        expect(parsed.Success ? '' : parsed.Error).toContain('payload is required');
    });

    it('rejects unknown properties', () => {
        const parsed = ParsePublishRequest({ topic: 'import.ready', payload: {}, runAfter: '2026-09-15' });
        expect(parsed.Success).toBe(false);
    });

    it('rejects a fractional priority and a non-positive deduplication window', () => {
        expect(ParsePublishRequest({ topic: 't', payload: {}, priority: 1.5 }).Success).toBe(false);
        expect(ParsePublishRequest({ topic: 't', payload: {}, deduplicationTTLSeconds: 0 }).Success).toBe(false);
    });
});

describe('MapPublishError', () => {
    it('maps an oversized payload to 413 with the sizes', () => {
        expect(MapPublishError(new PayloadTooLargeError(70000, 64000))).toEqual({
            Status: 413, Body: { error: 'Payload is 70000 bytes; the maximum is 64000', bytes: 70000, maxBytes: 64000 },
        });
    });

    it('maps a denied scope to 403', () => {
        expect(MapPublishError(new AuthorizationError('Scope denied'))?.Status).toBe(403);
    });

    it('maps a work queue configuration error to 400', () => {
        expect(MapPublishError(new WorkQueueConfigurationError('Priority unsupported'))).toEqual({ Status: 400, Body: { error: 'Priority unsupported' } });
    });

    it('leaves any other error unmapped', () => {
        expect(MapPublishError(new Error('socket hang up'))).toBeNull();
    });
});

describe('WorkQueueBodyError', () => {
    it('reports an oversized body as 413', () => {
        expect(WorkQueueBodyError({ status: 413, type: 'entity.too.large' }).Status).toBe(413);
    });

    it('reports any other body failure as 400', () => {
        expect(WorkQueueBodyError(new SyntaxError('Unexpected token'))).toEqual({ Status: 400, Body: { error: 'Request body must be valid JSON' } });
    });
});
```

`packages/MJServer/src/__tests__/WorkQueueRouter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../config.js', () => ({ configInfo: {} }));
vi.mock('../auth/APIKeyScopeAuth.js', () => ({ CheckAPIKeyScope: vi.fn() }));

import type { UserInfo } from '@memberjunction/core';
import { AuthorizationError } from 'type-graphql';
import {
    BaseWorkQueueDriver, NATIVE_DRIVER_CAPABILITIES, WorkQueueMetadataIndex, WorkQueueProducer, WorkQueueRuntime,
    type ClaimedWorkItem, type DeliveredItem, type DeliveryEnvelope, type DeliveryTarget, type WorkQueueMetadataSource,
} from '@memberjunction/work-queue';
import {
    HandleWorkQueuePublish, type WorkQueuePublishContext, type WorkQueueRouterDependencies,
} from '../rest/WorkQueueRouter.js';

const USER = { ID: 'U-1', Email: 'importer@example.com' } as UserInfo;
const QUEUE_ID = 'AAAAAAAA-0000-0000-0000-000000000001';

function unused<T>(): Promise<T> {
    return Promise.reject(new Error('not used by these tests'));
}

class RecordingDriver extends BaseWorkQueueDriver {
    public readonly DriverKey = 'Recording';
    public readonly Capabilities = NATIVE_DRIVER_CAPABILITIES;
    public readonly Envelopes: DeliveryEnvelope[] = [];
    public async Deliver(targets: DeliveryTarget[], envelope: DeliveryEnvelope): Promise<DeliveredItem[]> {
        this.Envelopes.push(envelope);
        return targets.map(target => ({ ItemID: `item-${target.QueueName}`, QueueID: target.QueueID }));
    }
    public Claim(): Promise<ClaimedWorkItem | null> { return unused(); }
    public Heartbeat(): Promise<boolean> { return unused(); }
    public Complete(): Promise<boolean> { return unused(); }
    public Retry(): Promise<boolean> { return unused(); }
    public DeadLetter(): Promise<boolean> { return unused(); }
    public ReapLeaseExhausted(): Promise<number> { return unused(); }
}

const INDEX = new WorkQueueMetadataIndex(
    [{ ID: QUEUE_ID, Name: 'venue-import', LeaseSeconds: 300, MaxAttempts: 3, InitialBackoffSeconds: 60, MaxBackoffSeconds: 1800, DeadLetterPolicy: 'Block Partition', PurgeOnComplete: true, IsActive: true }],
    [
        { ID: 'BBBBBBBB-0000-0000-0000-000000000001', Name: 'import.ready', AllowExternalPublish: true, IsActive: true },
        { ID: 'BBBBBBBB-0000-0000-0000-000000000002', Name: 'link.clicked', AllowExternalPublish: false, IsActive: true },
        { ID: 'BBBBBBBB-0000-0000-0000-000000000003', Name: 'retired.topic', AllowExternalPublish: true, IsActive: false },
    ],
    [{ ID: 'CCCCCCCC-0000-0000-0000-000000000001', TopicID: 'BBBBBBBB-0000-0000-0000-000000000001', QueueID: QUEUE_ID, FilterRules: null, IsActive: true }],
);

let driver: RecordingDriver;
const ALLOW: WorkQueueRouterDependencies = { CheckScope: async () => {} };

function configure(metadata: WorkQueueMetadataSource = { GetIndex: async () => INDEX }, maxPayloadBytes?: number): void {
    WorkQueueRuntime.Instance.Configure({ Driver: driver, Metadata: metadata, Producer: new WorkQueueProducer(driver, metadata, maxPayloadBytes) });
}

function context(body: unknown, user: UserInfo | undefined = USER): WorkQueuePublishContext {
    return { Body: body, ApiKeyID: 'key-1', User: user };
}

beforeEach(() => {
    WorkQueueRuntime.Instance.Reset();
    driver = new RecordingDriver();
});

describe('HandleWorkQueuePublish', () => {
    it('requires an authenticated user', async () => {
        configure();
        expect((await HandleWorkQueuePublish(context({}, undefined), ALLOW)).Status).toBe(401);
    });

    it('answers 503 when this instance has no configured work queue', async () => {
        expect((await HandleWorkQueuePublish(context({ topic: 'import.ready', payload: {} }), ALLOW)).Status).toBe(503);
    });

    it('checks the publish scope before looking at the body or topics', async () => {
        configure();
        const checkScope = vi.fn().mockRejectedValue(new AuthorizationError('API key lacks scope workqueue:publish'));
        const result = await HandleWorkQueuePublish(context({ not: 'even valid' }), { CheckScope: checkScope });
        expect(result.Status).toBe(403);
        expect(checkScope).toHaveBeenCalledWith('key-1', 'workqueue:publish', USER);
        expect(driver.Envelopes).toHaveLength(0);
    });

    it('rejects an invalid body', async () => {
        configure();
        expect((await HandleWorkQueuePublish(context({ topic: 'import.ready' }), ALLOW)).Status).toBe(400);
    });

    it('answers 404 for an unknown or inactive topic', async () => {
        configure();
        expect((await HandleWorkQueuePublish(context({ topic: 'nope', payload: {} }), ALLOW)).Status).toBe(404);
        expect((await HandleWorkQueuePublish(context({ topic: 'retired.topic', payload: {} }), ALLOW)).Status).toBe(404);
    });

    it('refuses a topic that does not accept external publishes', async () => {
        configure();
        const result = await HandleWorkQueuePublish(context({ topic: 'link.clicked', payload: {} }), ALLOW);
        expect(result).toEqual({ Status: 403, Body: { error: "Topic 'link.clicked' does not accept external publishes" } });
    });

    it('publishes as the caller and returns 202 with the item IDs', async () => {
        configure();
        const result = await HandleWorkQueuePublish(context({ topic: 'import.ready', payload: { importId: 7 }, partitionKey: 'venue-42' }), ALLOW);
        expect(result).toEqual({ Status: 202, Body: { publishId: expect.any(String), itemIds: ['item-venue-import'], duplicateQueueNames: [] } });
        expect(driver.Envelopes[0]).toMatchObject({ TopicName: 'import.ready', PartitionKey: 'venue-42', PayloadJSON: '{"importId":7}' });
    });

    it('answers 413 for a payload over the cap', async () => {
        configure(undefined, 20);
        const result = await HandleWorkQueuePublish(context({ topic: 'import.ready', payload: { text: 'far more than twenty bytes' } }), ALLOW);
        expect(result.Status).toBe(413);
        expect(driver.Envelopes).toHaveLength(0);
    });

    it('answers 500 for an unexpected failure', async () => {
        configure({ GetIndex: async () => { throw new Error('database unavailable'); } });
        expect((await HandleWorkQueuePublish(context({ topic: 'import.ready', payload: {} }), ALLOW)).Status).toBe(500);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/MJServer && pnpm test workQueueRequests WorkQueueRouter`
Expected: FAIL — unresolved imports `../rest/workQueueRequests.js` and `../rest/WorkQueueRouter.js`.

- [ ] **Step 3: Write `packages/MJServer/src/rest/workQueueRequests.ts`**

```typescript
/**
 * @fileoverview Request validation and error mapping for POST /work-queue/publish.
 * @module MJServer/rest
 */
import { AuthorizationError } from 'type-graphql';
import { z } from 'zod';
import { PayloadTooLargeError, WorkQueueConfigurationError, type PublishOptions } from '@memberjunction/work-queue';

export const WORK_QUEUE_PUBLISH_SCOPE = 'workqueue:publish';

/** Largest accepted body: the 64,000-byte payload cap plus JSON escaping and the envelope fields. */
export const WORK_QUEUE_BODY_LIMIT = '256kb';

const publishRequestSchema = z.object({
    topic: z.string().trim().min(1).max(200),
    payload: z.unknown().refine(value => value !== undefined, 'payload is required'),
    partitionKey: z.string().min(1).max(200).optional(),
    tenantId: z.string().min(1).max(100).optional(),
    correlationId: z.string().min(1).max(200).optional(),
    deduplicationKey: z.string().min(1).max(200).optional(),
    deduplicationTTLSeconds: z.number().int().positive().optional(),
    priority: z.number().int().optional(),
}).strict();

export type WorkQueuePublishRequest = z.infer<typeof publishRequestSchema>;

export type PublishRequestParseResult =
    | { Success: true; Request: WorkQueuePublishRequest }
    | { Success: false; Error: string };

export interface WorkQueueHttpResult {
    Status: number;
    Body: Record<string, unknown>;
}

export function ParsePublishRequest(body: unknown): PublishRequestParseResult {
    const parsed = publishRequestSchema.safeParse(body);
    if (parsed.success) {
        return { Success: true, Request: parsed.data };
    }
    const error = parsed.error.issues.map(issue => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
    return { Success: false, Error: error };
}

export function ToPublishOptions(request: WorkQueuePublishRequest): PublishOptions {
    return {
        PartitionKey: request.partitionKey,
        TenantID: request.tenantId,
        CorrelationID: request.correlationId,
        DeduplicationKey: request.deduplicationKey,
        DeduplicationTTLSeconds: request.deduplicationTTLSeconds,
        Priority: request.priority,
    };
}

/** The HTTP answer for a known publish failure, or null for an unexpected one. */
export function MapPublishError(error: unknown): WorkQueueHttpResult | null {
    if (error instanceof PayloadTooLargeError) {
        return { Status: 413, Body: { error: error.message, bytes: error.Bytes, maxBytes: error.MaxBytes } };
    }
    if (error instanceof AuthorizationError) {
        return { Status: 403, Body: { error: error.message } };
    }
    if (error instanceof WorkQueueConfigurationError) {
        return { Status: 400, Body: { error: error.message } };
    }
    return null;
}

/** The HTTP answer when the JSON body parser rejects a request. */
export function WorkQueueBodyError(error: unknown): WorkQueueHttpResult {
    const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
    return status === 413
        ? { Status: 413, Body: { error: `Request body exceeds ${WORK_QUEUE_BODY_LIMIT}` } }
        : { Status: 400, Body: { error: 'Request body must be valid JSON' } };
}
```

- [ ] **Step 4: Write `packages/MJServer/src/rest/WorkQueueRouter.ts`**

```typescript
/**
 * @fileoverview POST /work-queue/publish — lets services outside Node publish to topics that allow it.
 * Mounted after the unified authentication middleware, so req.userPayload is set.
 * @module MJServer/rest
 */
import { Router, json, type NextFunction, type Request, type Response } from 'express';
import { LogError, type UserInfo } from '@memberjunction/core';
import { WorkQueueRuntime } from '@memberjunction/work-queue';
import { CheckAPIKeyScope } from '../auth/APIKeyScopeAuth.js';
import {
    MapPublishError, ParsePublishRequest, ToPublishOptions, WORK_QUEUE_BODY_LIMIT, WORK_QUEUE_PUBLISH_SCOPE,
    WorkQueueBodyError, type WorkQueueHttpResult,
} from './workQueueRequests.js';

export const WORK_QUEUE_MOUNT_PATH = '/work-queue';

export interface WorkQueuePublishContext {
    Body: unknown;
    ApiKeyID: string | undefined;
    User: UserInfo | undefined;
}

export interface WorkQueueRouterDependencies {
    /** Throws AuthorizationError when the API key lacks the scope. */
    CheckScope(apiKeyID: string | undefined, scope: string, user: UserInfo): Promise<void>;
}

const DEFAULT_DEPENDENCIES: WorkQueueRouterDependencies = {
    CheckScope: async (apiKeyID, scope, user) => {
        await CheckAPIKeyScope(apiKeyID, scope, user);
    },
};

/** Runs one publish request to completion. Never throws. */
export async function HandleWorkQueuePublish(context: WorkQueuePublishContext, dependencies: WorkQueueRouterDependencies): Promise<WorkQueueHttpResult> {
    if (!context.User) {
        return { Status: 401, Body: { error: 'Authentication required' } };
    }
    if (!WorkQueueRuntime.Instance.IsConfigured) {
        return { Status: 503, Body: { error: 'The work queue is not configured on this server' } };
    }
    try {
        return await publish(context, context.User, dependencies);
    } catch (error) {
        const mapped = MapPublishError(error);
        if (mapped) {
            return mapped;
        }
        LogError('[WorkQueue] REST publish failed', undefined, error);
        return { Status: 500, Body: { error: 'Publish failed' } };
    }
}

async function publish(context: WorkQueuePublishContext, user: UserInfo, dependencies: WorkQueueRouterDependencies): Promise<WorkQueueHttpResult> {
    await dependencies.CheckScope(context.ApiKeyID, WORK_QUEUE_PUBLISH_SCOPE, user);
    const parsed = ParsePublishRequest(context.Body);
    if (!parsed.Success) {
        return { Status: 400, Body: { error: parsed.Error } };
    }
    const runtime = WorkQueueRuntime.Instance;
    const topicName = parsed.Request.topic;
    const topic = (await runtime.Metadata.GetIndex(user)).TopicByName(topicName);
    if (!topic || !topic.IsActive) {
        return { Status: 404, Body: { error: `Unknown or inactive topic '${topicName}'` } };
    }
    if (!topic.AllowExternalPublish) {
        return { Status: 403, Body: { error: `Topic '${topic.Name}' does not accept external publishes` } };
    }
    const result = await runtime.Producer.Publish(topic.Name, parsed.Request.payload, user, ToPublishOptions(parsed.Request));
    return { Status: 202, Body: { publishId: result.PublishID, itemIds: result.ItemIDs, duplicateQueueNames: result.DuplicateQueueNames } };
}

export function createWorkQueueRouter(dependencies: WorkQueueRouterDependencies = DEFAULT_DEPENDENCIES): Router {
    const router = Router();
    router.post('/publish', json({ limit: WORK_QUEUE_BODY_LIMIT }), async (req: Request, res: Response) => {
        const payload = req.userPayload;
        const result = await HandleWorkQueuePublish({ Body: req.body, ApiKeyID: payload?.apiKeyId, User: payload?.userRecord }, dependencies);
        res.status(result.Status).json(result.Body);
    });
    // Only the JSON body parser can fail before the handler; answer in JSON rather than Express's HTML page.
    router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
        if (res.headersSent) {
            next(error);
            return;
        }
        const result = WorkQueueBodyError(error);
        res.status(result.Status).json(result.Body);
    });
    return router;
}
```

- [ ] **Step 5: Mount the router**

In `packages/MJServer/src/index.ts`, add the import beside the other REST imports:

```typescript
import { createWorkQueueRouter, WORK_QUEUE_MOUNT_PATH } from './rest/WorkQueueRouter.js';
```

Directly after the widget authenticated route block (the `if (widgetAuthenticatedRouter) { … }` block that
follows `app.use(createUnifiedAuthMiddleware(dataSources))`), add:

```typescript
  // ─── Work queue publish endpoint (auth already handled by unified middleware) ─────
  app.use(WORK_QUEUE_MOUNT_PATH, cors<cors.CorsRequest>(), createWorkQueueRouter());
  startupLog.LogIf('verbose', `[WorkQueue] Publish route registered at ${WORK_QUEUE_MOUNT_PATH}/publish`);
```

The route must stay below `createUnifiedAuthMiddleware`; mounting it above would skip authentication.

- [ ] **Step 6: Run the tests and build**

Run: `cd packages/MJServer && pnpm test workQueueRequests WorkQueueRouter`
Expected: PASS — workQueueRequests (11) and WorkQueueRouter (9).

Run: `cd packages/MJServer && pnpm run build`
Expected: builds.

- [ ] **Step 7: Commit**

```bash
git add packages/MJServer/src/rest/workQueueRequests.ts packages/MJServer/src/rest/WorkQueueRouter.ts packages/MJServer/src/index.ts packages/MJServer/src/__tests__/workQueueRequests.test.ts packages/MJServer/src/__tests__/WorkQueueRouter.test.ts
git commit -m "feat(server): authenticated POST /work-queue/publish for external producers"
```

---

### Task 15: ServerBootstrap dependency, manifest and full build

**Files:**
- Modify: `packages/ServerBootstrap/package.json`
- Regenerate: `packages/ServerBootstrap/src/generated/mj-class-registrations.ts`

**Interfaces:**
- Consumes: every `@RegisterClass` in `@memberjunction/work-queue` — `NativeWorkQueueDriver` (`BaseWorkQueueDriver`, `'Native'`) and the four server operations (`BaseRemotableOperation`).
- Produces: a server bootstrap whose class manifest imports those registrations, so bundlers cannot tree-shake them out of MJAPI.

MJ apps load `@RegisterClass` registrations through generated manifests rather than side-effect imports.
Without a manifest entry, `CreateWorkQueueRuntimeParts({ DriverKey: 'Native' })` would fail with "No
work-queue driver is registered" in a bundled build even though every unit test passes.
`ServerBootstrapLite` is deliberately left alone: it excludes `@memberjunction/server`, and the work queue
only runs inside MJServer.

- [ ] **Step 1: Add the dependency**

In `packages/ServerBootstrap/package.json` `dependencies`, add (keeping alphabetical order):

```json
"@memberjunction/work-queue": "6.1.0-edge.4",
```

Run: `pnpm install` (repository root)
Expected: installs with no peer-dependency warnings for `@memberjunction/work-queue`.

- [ ] **Step 2: Build the chain**

Run: `pnpm exec turbo run build --filter=@memberjunction/work-queue --filter=@memberjunction/server`
Expected: builds `@memberjunction/work-queue`, its dependents up to `@memberjunction/server`, with no errors.

- [ ] **Step 3: Regenerate the manifest**

Run: `pnpm run mj:manifest:server-bootstrap`

Run: `grep -oE "NativeWorkQueueDriver|WorkQueue(GetQueueStats|ListBlockedPartitions|ReplayDeadLetter|CancelItem)ServerOperation" packages/ServerBootstrap/src/generated/mj-class-registrations.ts | sort -u`
Expected — exactly these five lines:

```
NativeWorkQueueDriver
WorkQueueCancelItemServerOperation
WorkQueueGetQueueStatsServerOperation
WorkQueueListBlockedPartitionsServerOperation
WorkQueueReplayDeadLetterServerOperation
```

If the list is empty, the manifest generator did not see the new dependency: confirm Step 1 and that
`packages/WorkQueue/dist` exists, then rerun Step 3.

- [ ] **Step 4: Full build and unit tests**

Run: `pnpm run build`
Expected: the full `@memberjunction*` build and its `postbuild` manifest pass succeed.

Run: `cd packages/WorkQueue && pnpm test`
Expected: PASS — every suite from Tasks 2–12.

Run: `cd packages/MJServer && pnpm test`
Expected: PASS.

- [ ] **Step 5: Smoke-test startup**

Run MJAPI against your development database with no `workQueue` block in `mj.config.cjs`.
Expected: the server starts; with verbose startup logging you see
`[WorkQueue] Publish route registered at /work-queue/publish`; there is no `Failed to start the work queue`
line.

Then add `workQueue: { workerEnabled: true, systemUserEmail: '<an existing user>' }` and restart.
Expected: `🔄 Work Queue worker <host>:<pid>:<id>: polling every 1000 ms, up to 10 concurrent item(s)`.
With no queues defined the worker polls quietly.

- [ ] **Step 6: Commit**

```bash
git add packages/ServerBootstrap/package.json packages/ServerBootstrap/src/generated/mj-class-registrations.ts pnpm-lock.yaml
git commit -m "build(server-bootstrap): register work queue driver and operations in the server manifest"
```

---

### Task 16: Integration bundle `work-queue` (IT87)

**Files:**
- Create: `packages/TestingFramework/integration-test-suite/src/checks/work-queue.checks.ts`
- Modify: `packages/TestingFramework/integration-test-suite/package.json`, `src/index.ts`, `src/__tests__/check-registry.test.ts`
- Create: `metadata-optional/integration-test/tests/integration/.IT87-work-queue.json`
- Modify: `metadata-optional/integration-test/test-suites/.integration-suite.json`, `metadata-optional/integration-test/tests/integration/README.md`

**Interfaces:**
- Consumes: from `@memberjunction/work-queue` — `NativeWorkQueueDriver`, `DeduplicationLedger` (Task 7), `WorkQueueEngine`, `WorkQueueProducer` (Task 8), `BaseWorkQueueHandler` (Task 9), `WorkQueueWorker` (Task 10), `WorkQueueAdmin` (Task 12), `WorkQueueMetadataIndex`, types; from `@memberjunction/testing-integration` — `Assert`, `AssertEqual`, `IntegrationCheckRegistry`, `NamedCheck`, `IntegrationCheckContext`.
- Produces: `WorkQueueChecks: NamedCheck[]` (10 checks, ids `work-queue.WQ1`–`WQ10`) and the `'work-queue'` lifecycle; `MJ: Tests` record `IT87 - Work Queue (native driver)`.

The unit tests prove statement shapes against a recording executor. This bundle proves the statements
**behave** on a real database — claim predicates, the in-flight unique index, fence tokens, atomic fan-out
and deduplication — on SQL Server and PostgreSQL alike.

| Check | Proves |
| --- | --- |
| WQ1 | `WorkQueueEngine` loads queues, topics and active subscriptions |
| WQ2 | A publish fans out one `Pending` item per matching subscription under one `PublishID`; filters exclude |
| WQ3 | A repeated deduplication key creates nothing and names the duplicate queues |
| WQ4 | Partition FIFO: the second item is unclaimable while the head is in flight |
| WQ5 | Takeover after lease expiry: same row, fence token + 1, attempt + 1; the displaced worker's heartbeat and settle are rejected |
| WQ6 | Block Partition: a dead-lettered head halts its partition, is listed as blocked, and replay releases it in order |
| WQ7 | The worker runs a handler end to end: success completes, failure retries, the final failure dead-letters |
| WQ8 | Maintenance dead-letters an expired lease on the final attempt with `'Lease Exhausted'` |
| WQ9 | An expired deduplication key is accepted again, and purge deletes expired keys |
| WQ10 | Queue stats count pending items; cancel changes a pending item once |

Safety in a shared development database:

- Every fixture is named `mj-it-wq-…`. Setup first removes leftovers from an interrupted run; Teardown
  removes everything again (items and deduplication keys by SQL, then subscriptions, topic and queues through
  their entities).
- The worker in WQ7 reads a metadata index narrowed to the fixture queue, so it can never claim items from a
  real queue.
- WQ8 calls the real maintenance statement, which is global. It only dead-letters items that are already
  unrecoverable, exactly as production maintenance would.
- Raw SQL changes rows behind the entity cache, so every read uses `BypassCache: true`.

- [ ] **Step 1: Add the dependency**

In `packages/TestingFramework/integration-test-suite/package.json` `dependencies`, add (alphabetical order):

```json
"@memberjunction/work-queue": "6.1.0-edge.4",
```

Run: `pnpm install` (repository root)

- [ ] **Step 2: Pin the bundle in the registry test (failing)**

In `packages/TestingFramework/integration-test-suite/src/__tests__/check-registry.test.ts`:

- add `import { WorkQueueChecks } from '../checks/work-queue.checks';` with the other bundle imports;
- add `['work-queue', WorkQueueChecks, 10],` to the bundle table, after `['concurrent', ConcurrentChecks, 2],`;
- add `'work-queue': 10,` to `EXPECTED_BUNDLE_COUNTS`, directly before `'workflow-demo-agents'`.

Run: `cd packages/TestingFramework/integration-test-suite && pnpm test check-registry`
Expected: FAIL — unresolved import `../checks/work-queue.checks`.

- [ ] **Step 3: Write `src/checks/work-queue.checks.ts`**

```typescript
/**
 * work-queue.checks.ts — the 'work-queue' bundle (WQ1–WQ10): the durable work queue's native driver against
 * the live database. Deterministic, no model calls. Server transport only (it needs a DatabaseProviderBase);
 * runs on SQL Server and PostgreSQL.
 *
 * Every fixture is named 'mj-it-wq-…'. Setup removes leftovers from an interrupted run before creating fresh
 * fixtures, and Teardown removes them again. The worker check reads a metadata index narrowed to the fixture
 * queue, so it never processes a real queue. Checks run in array order and build on each other's state.
 */
import { DatabaseProviderBase, RunView, type UserInfo } from '@memberjunction/core';
import type { MJWorkQueueEntity, MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity } from '@memberjunction/core-entities';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import {
    Assert, AssertEqual, IntegrationCheckRegistry, type IntegrationCheckContext, type NamedCheck,
} from '@memberjunction/testing-integration';
import {
    BaseWorkQueueHandler, DeduplicationLedger, NativeWorkQueueDriver, WorkQueueAdmin, WorkQueueEngine,
    WorkQueueMetadataIndex, WorkQueueProducer, WorkQueueWorker,
    type ClaimedWorkItem, type PublishResult, type WorkQueueContext, type WorkQueueDefinition, type WorkQueueMetadataSource,
} from '@memberjunction/work-queue';

const PREFIX = 'mj-it-wq-';
const NAMES = {
    FanoutA: `${PREFIX}fanout-a`,
    FanoutB: `${PREFIX}fanout-b`,
    Partition: `${PREFIX}partition`,
    Worker: `${PREFIX}worker`,
    Topic: `${PREFIX}topic`,
} as const;

interface WorkQueueFixture {
    Provider: DatabaseProviderBase;
    Driver: NativeWorkQueueDriver;
    Producer: WorkQueueProducer;
    Admin: WorkQueueAdmin;
    Ledger: DeduplicationLedger;
    Queues: { FanoutA: WorkQueueDefinition; FanoutB: WorkQueueDefinition; Partition: WorkQueueDefinition; Worker: WorkQueueDefinition };
}

interface ItemRow {
    ID: string;
    QueueID: string;
    PublishID: string;
    PartitionKey: string | null;
    Status: string;
    AttemptCount: number;
    FenceToken: number;
    DeadLetterReason: string | null;
}

let fixture: WorkQueueFixture | undefined;

function fx(): WorkQueueFixture {
    if (!fixture) {
        throw new Error('work-queue fixture missing (bundle Setup did not run)');
    }
    return fixture;
}

// ─── SQL helpers (fixture manipulation the public API deliberately does not offer) ──────────────

function table(provider: DatabaseProviderBase, name: string): string {
    return `${provider.QuoteIdentifier(provider.MJCoreSchemaName)}.${provider.QuoteIdentifier(name)}`;
}

function column(provider: DatabaseProviderBase, name: string): string {
    return provider.QuoteIdentifier(name);
}

function hourAgo(provider: DatabaseProviderBase): string {
    return provider.PlatformKey === 'postgresql' ? `now() - interval '1 hour'` : 'DATEADD(HOUR, -1, SYSDATETIMEOFFSET())';
}

function uuidParam(provider: DatabaseProviderBase, index: number): string {
    const placeholder = provider.BuildParameterPlaceholder(index);
    return provider.PlatformKey === 'postgresql' ? `${placeholder}::uuid` : placeholder;
}

async function execute(provider: DatabaseProviderBase, user: UserInfo, sql: string, params: unknown[]): Promise<void> {
    await provider.ExecuteSQL(sql, params, { isMutation: true }, user);
}

/** Moves an item's lease into the past, optionally setting its attempt count. */
async function expireLease(f: WorkQueueFixture, user: UserInfo, itemID: string, attemptCount?: number): Promise<void> {
    const p = f.Provider;
    const attempts = attemptCount === undefined ? '' : `, ${column(p, 'AttemptCount')} = ${Math.trunc(attemptCount)}`;
    const sql = `UPDATE ${table(p, 'WorkQueueItem')} SET ${column(p, 'ClaimExpiresAt')} = ${hourAgo(p)}${attempts} WHERE ${column(p, 'ID')} = ${uuidParam(p, 0)}`;
    await execute(p, user, sql, [itemID]);
}

async function expireDeduplicationKey(f: WorkQueueFixture, user: UserInfo, key: string): Promise<void> {
    const p = f.Provider;
    const sql = `UPDATE ${table(p, 'WorkQueueDeduplication')} SET ${column(p, 'ExpiresAt')} = ${hourAgo(p)} WHERE ${column(p, 'DeduplicationKey')} = ${p.BuildParameterPlaceholder(0)}`;
    await execute(p, user, sql, [key]);
}

// ─── Reads ─────────────────────────────────────────────────────────────────────────────────────

async function itemsWhere(user: UserInfo, filter: string): Promise<ItemRow[]> {
    const result = await new RunView().RunView<ItemRow>({
        EntityName: 'MJ: Work Queue Items',
        ExtraFilter: filter,
        Fields: ['ID', 'QueueID', 'PublishID', 'PartitionKey', 'Status', 'AttemptCount', 'FenceToken', 'DeadLetterReason'],
        OrderBy: 'Sequence',
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    Assert(result.Success, `reading work queue items failed: ${result.ErrorMessage}`);
    return result.Results;
}

async function item(user: UserInfo, itemID: string): Promise<ItemRow> {
    const rows = await itemsWhere(user, `ID='${itemID}'`);
    AssertEqual(rows.length, 1, `rows for item ${itemID}`);
    return rows[0];
}

async function deduplicationRowCount(user: UserInfo, key: string): Promise<number> {
    const result = await new RunView().RunView<{ ID: string }>({
        EntityName: 'MJ: Work Queue Deduplications', ExtraFilter: `DeduplicationKey='${key}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, user);
    Assert(result.Success, `reading deduplication keys failed: ${result.ErrorMessage}`);
    return result.Results.length;
}

async function claimOrFail(f: WorkQueueFixture, queue: WorkQueueDefinition, workerID: string, user: UserInfo): Promise<ClaimedWorkItem> {
    const claimed = await f.Driver.Claim(queue, workerID, user);
    if (!claimed) {
        throw new Error(`expected a claimable item in ${queue.Name}`);
    }
    return claimed;
}

function publishKeyed(f: WorkQueueFixture, user: UserInfo, key: string): Promise<PublishResult> {
    return f.Producer.Publish(NAMES.Topic, { route: 'all' }, user, { DeduplicationKey: key });
}

// ─── Fixtures ──────────────────────────────────────────────────────────────────────────────────

async function removeFixtures(provider: DatabaseProviderBase, user: UserInfo): Promise<void> {
    const rv = new RunView();
    const byName = { ExtraFilter: `Name LIKE '${PREFIX}%'`, ResultType: 'entity_object' as const, BypassCache: true };
    const queues = await rv.RunView<MJWorkQueueEntity>({ EntityName: 'MJ: Work Queues', ...byName }, user);
    const topics = await rv.RunView<MJWorkQueueTopicEntity>({ EntityName: 'MJ: Work Queue Topics', ...byName }, user);
    Assert(queues.Success && topics.Success, `finding leftover fixtures failed: ${queues.ErrorMessage ?? topics.ErrorMessage}`);
    const queueIDs = queues.Results.map(queue => queue.ID);
    if (queueIDs.length > 0) {
        await deleteQueueRows(provider, user, queueIDs);
        await deleteSubscriptions(user, queueIDs);
    }
    for (const record of [...topics.Results, ...queues.Results]) {
        Assert(await record.Delete(), `removing fixture ${record.Name} failed: ${record.LatestResult?.CompleteMessage}`);
    }
}

async function deleteQueueRows(provider: DatabaseProviderBase, user: UserInfo, queueIDs: string[]): Promise<void> {
    const placeholders = queueIDs.map((_, index) => uuidParam(provider, index)).join(', ');
    for (const tableName of ['WorkQueueItem', 'WorkQueueDeduplication']) {
        const sql = `DELETE FROM ${table(provider, tableName)} WHERE ${column(provider, 'QueueID')} IN (${placeholders})`;
        await execute(provider, user, sql, queueIDs);
    }
}

async function deleteSubscriptions(user: UserInfo, queueIDs: string[]): Promise<void> {
    const result = await new RunView().RunView<MJWorkQueueSubscriptionEntity>({
        EntityName: 'MJ: Work Queue Subscriptions',
        ExtraFilter: `QueueID IN (${queueIDs.map(id => `'${id}'`).join(', ')})`,
        ResultType: 'entity_object',
        BypassCache: true,
    }, user);
    Assert(result.Success, `finding fixture subscriptions failed: ${result.ErrorMessage}`);
    for (const subscription of result.Results) {
        Assert(await subscription.Delete(), `removing a fixture subscription failed: ${subscription.LatestResult?.CompleteMessage}`);
    }
}

async function saveQueue(provider: DatabaseProviderBase, user: UserInfo, name: string, policy: 'Block Partition' | 'Skip Partition'): Promise<MJWorkQueueEntity> {
    const queue = await provider.GetEntityObject<MJWorkQueueEntity>('MJ: Work Queues', user);
    queue.NewRecord();
    queue.Name = name;
    queue.Description = 'Integration test fixture (safe to delete)';
    queue.LeaseSeconds = 10;
    queue.MaxAttempts = 2;
    queue.InitialBackoffSeconds = 0;
    queue.MaxBackoffSeconds = 0;
    queue.DeadLetterPolicy = policy;
    queue.PurgeOnComplete = false;
    queue.IsActive = true;
    Assert(await queue.Save(), `creating work queue ${name} failed: ${queue.LatestResult?.CompleteMessage}`);
    return queue;
}

async function saveTopic(provider: DatabaseProviderBase, user: UserInfo): Promise<MJWorkQueueTopicEntity> {
    const topic = await provider.GetEntityObject<MJWorkQueueTopicEntity>('MJ: Work Queue Topics', user);
    topic.NewRecord();
    topic.Name = NAMES.Topic;
    topic.Description = 'Integration test fixture (safe to delete)';
    topic.AllowExternalPublish = false;
    topic.IsActive = true;
    Assert(await topic.Save(), `creating the fixture topic failed: ${topic.LatestResult?.CompleteMessage}`);
    return topic;
}

async function saveSubscription(provider: DatabaseProviderBase, user: UserInfo, topicID: string, queueID: string, filterRules: string | null): Promise<void> {
    const subscription = await provider.GetEntityObject<MJWorkQueueSubscriptionEntity>('MJ: Work Queue Subscriptions', user);
    subscription.NewRecord();
    subscription.TopicID = topicID;
    subscription.QueueID = queueID;
    subscription.FilterRules = filterRules;
    subscription.IsActive = true;
    Assert(await subscription.Save(), `creating a fixture subscription failed: ${subscription.LatestResult?.CompleteMessage}`);
}

function requireQueue(index: WorkQueueMetadataIndex, name: string): WorkQueueDefinition {
    const queue = index.QueueByName(name);
    if (!queue) {
        throw new Error(`fixture queue ${name} is not visible to WorkQueueEngine`);
    }
    return queue;
}

async function createFixture(provider: DatabaseProviderBase, user: UserInfo): Promise<WorkQueueFixture> {
    const fanoutA = await saveQueue(provider, user, NAMES.FanoutA, 'Skip Partition');
    const fanoutB = await saveQueue(provider, user, NAMES.FanoutB, 'Skip Partition');
    await saveQueue(provider, user, NAMES.Partition, 'Block Partition');
    await saveQueue(provider, user, NAMES.Worker, 'Skip Partition');
    const topic = await saveTopic(provider, user);
    await saveSubscription(provider, user, topic.ID, fanoutA.ID, null);
    await saveSubscription(provider, user, topic.ID, fanoutB.ID, '{"route":"all"}');
    await WorkQueueEngine.Instance.Config(true, user, provider);
    const index = await WorkQueueEngine.Instance.GetIndex(user);
    const driver = new NativeWorkQueueDriver(provider);
    return {
        Provider: provider,
        Driver: driver,
        Producer: new WorkQueueProducer(driver, WorkQueueEngine.Instance),
        Admin: new WorkQueueAdmin(provider, driver.Capabilities, WorkQueueEngine.Instance),
        Ledger: new DeduplicationLedger(provider),
        Queues: {
            FanoutA: requireQueue(index, NAMES.FanoutA),
            FanoutB: requireQueue(index, NAMES.FanoutB),
            Partition: requireQueue(index, NAMES.Partition),
            Worker: requireQueue(index, NAMES.Worker),
        },
    };
}

/** Succeeds unless the payload says otherwise. */
class IntegrationTestHandler extends BaseWorkQueueHandler {
    public async Handle(context: WorkQueueContext): Promise<void> {
        if (context.Payload['mode'] === 'fail') {
            throw new Error('integration test failure');
        }
    }
}

/** Only the fixture worker queue, so the worker cannot touch real queues. */
function workerQueueOnly(): WorkQueueMetadataSource {
    return {
        GetIndex: async (user: UserInfo) => new WorkQueueMetadataIndex([requireQueue(await WorkQueueEngine.Instance.GetIndex(user), NAMES.Worker)], [], []),
    };
}

// ─── Checks ────────────────────────────────────────────────────────────────────────────────────

export const WorkQueueChecks: NamedCheck[] = [
    {
        Id: 'work-queue.WQ1',
        Name: 'WQ1: WorkQueueEngine loads queues, topics and active subscriptions from the database',
        Fn: async (ctx: IntegrationCheckContext) => {
            const index = await WorkQueueEngine.Instance.GetIndex(ctx.User);
            const topic = index.TopicByName(NAMES.Topic);
            if (!topic) {
                throw new Error('the fixture topic was not loaded');
            }
            AssertEqual(index.ActiveSubscriptionsForTopic(topic.ID).length, 2, 'active subscriptions for the fixture topic');
            AssertEqual(index.QueueByName(NAMES.Partition)?.DeadLetterPolicy, 'Block Partition', 'partition queue dead-letter policy');
        },
    },
    {
        Id: 'work-queue.WQ2',
        Name: 'WQ2: a publish fans out one Pending item per matching subscription under one publish ID',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx();
            const all = await f.Producer.Publish(NAMES.Topic, { route: 'all' }, ctx.User);
            AssertEqual(all.ItemIDs.length, 2, 'items for a payload both subscriptions match');
            const rows = await itemsWhere(ctx.User, `PublishID='${all.PublishID}'`);
            AssertEqual(rows.length, 2, 'rows sharing the publish ID');
            Assert(rows.every(row => row.Status === 'Pending'), 'fanned-out items are Pending');
            const queueIDs = new Set(rows.map(row => NormalizeUUID(row.QueueID)));
            Assert(queueIDs.has(NormalizeUUID(f.Queues.FanoutA.ID)) && queueIDs.has(NormalizeUUID(f.Queues.FanoutB.ID)), 'one item in each subscribed queue');
            const filtered = await f.Producer.Publish(NAMES.Topic, { route: 'a-only' }, ctx.User);
            AssertEqual(filtered.ItemIDs.length, 1, 'items for a payload only the unfiltered subscription matches');
        },
    },
    {
        Id: 'work-queue.WQ3',
        Name: 'WQ3: a repeated deduplication key creates no items and names the duplicate queues',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx();
            const key = `${PREFIX}dedup`;
            AssertEqual((await publishKeyed(f, ctx.User, key)).ItemIDs.length, 2, 'first publish with a deduplication key');
            const duplicate = await publishKeyed(f, ctx.User, key);
            AssertEqual(duplicate.ItemIDs.length, 0, 'items created by the duplicate publish');
            AssertEqual([...duplicate.DuplicateQueueNames].sort().join(','), [NAMES.FanoutA, NAMES.FanoutB].sort().join(','), 'queues reporting the duplicate');
        },
    },
    {
        Id: 'work-queue.WQ4',
        Name: 'WQ4: items in one partition are claimed one at a time, in order',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx();
            const queue = f.Queues.Partition;
            const first = await f.Producer.Enqueue(queue.Name, { step: 1 }, ctx.User, { PartitionKey: 'p-fifo' });
            const second = await f.Producer.Enqueue(queue.Name, { step: 2 }, ctx.User, { PartitionKey: 'p-fifo' });
            const head = await claimOrFail(f, queue, 'worker-a', ctx.User);
            Assert(UUIDsEqual(head.ItemID, first.ItemIDs[0]), 'the first claim takes the partition head');
            AssertEqual(await f.Driver.Claim(queue, 'worker-b', ctx.User), null, 'a claim while the head is in flight');
            Assert(await f.Driver.Complete(head, 'worker-a', false, ctx.User), 'completing the head');
            const next = await claimOrFail(f, queue, 'worker-b', ctx.User);
            Assert(UUIDsEqual(next.ItemID, second.ItemIDs[0]), 'the next item is claimable once the head completes');
            Assert(await f.Driver.Complete(next, 'worker-b', false, ctx.User), 'completing the second item');
        },
    },
    {
        Id: 'work-queue.WQ5',
        Name: 'WQ5: a takeover after lease expiry fences out the displaced worker',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx();
            const queue = f.Queues.Partition;
            await f.Producer.Enqueue(queue.Name, { step: 'fence' }, ctx.User, { PartitionKey: 'p-fence' });
            const stale = await claimOrFail(f, queue, 'worker-a', ctx.User);
            await expireLease(f, ctx.User, stale.ItemID);
            const current = await claimOrFail(f, queue, 'worker-b', ctx.User);
            Assert(UUIDsEqual(current.ItemID, stale.ItemID), 'the expired item is taken over in place');
            AssertEqual(current.FenceToken, stale.FenceToken + 1, 'fence token after takeover');
            AssertEqual(current.AttemptCount, 2, 'a takeover counts as an attempt');
            AssertEqual(await f.Driver.Heartbeat(stale, 'worker-a', 10, ctx.User), false, 'heartbeat from the displaced worker');
            AssertEqual(await f.Driver.Complete(stale, 'worker-a', false, ctx.User), false, 'settle from the displaced worker');
            Assert(await f.Driver.Complete(current, 'worker-b', false, ctx.User), 'settle from the current owner');
            AssertEqual((await item(ctx.User, current.ItemID)).Status, 'Completed', 'status after the current owner settles');
        },
    },
    {
        Id: 'work-queue.WQ6',
        Name: 'WQ6: a dead-lettered head blocks its partition until it is replayed',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx();
            const queue = f.Queues.Partition;
            const first = await f.Producer.Enqueue(queue.Name, { step: 1 }, ctx.User, { PartitionKey: 'p-block' });
            const waiting = await f.Producer.Enqueue(queue.Name, { step: 2 }, ctx.User, { PartitionKey: 'p-block' });
            const head = await claimOrFail(f, queue, 'worker-a', ctx.User);
            Assert(UUIDsEqual(head.ItemID, first.ItemIDs[0]), 'the head is claimed first');
            Assert(await f.Driver.DeadLetter(head, 'worker-a', 'Fatal Error', 'integration test', ctx.User), 'dead-lettering the head');
            AssertEqual(await f.Driver.Claim(queue, 'worker-a', ctx.User), null, 'a claim while the dead-lettered head blocks the partition');
            const blocked = await f.Admin.ListBlockedPartitions({ queueName: queue.Name }, ctx.User);
            const entry = blocked.partitions.find(partition => partition.partitionKey === 'p-block');
            Assert(entry !== undefined && UUIDsEqual(entry.itemID, head.ItemID) && entry.waitingCount === 1, `blocked partition listing: ${JSON.stringify(blocked)}`);
            AssertEqual((await f.Admin.ReplayDeadLetter({ itemID: head.ItemID }, ctx.User)).replayed, true, 'replaying the head');
            const replayed = await claimOrFail(f, queue, 'worker-a', ctx.User);
            Assert(UUIDsEqual(replayed.ItemID, head.ItemID), 'the replayed head is claimed before the waiting item');
            AssertEqual(replayed.AttemptCount, 1, 'attempts after replay');
            Assert(await f.Driver.Complete(replayed, 'worker-a', false, ctx.User), 'completing the replayed head');
            const next = await claimOrFail(f, queue, 'worker-a', ctx.User);
            Assert(UUIDsEqual(next.ItemID, waiting.ItemIDs[0]), 'the waiting item runs after the head completes');
            Assert(await f.Driver.Complete(next, 'worker-a', false, ctx.User), 'completing the waiting item');
        },
    },
    {
        Id: 'work-queue.WQ7',
        Name: 'WQ7: the worker completes a succeeding item, retries a failing one, then dead-letters it',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx();
            const user = ctx.User;
            const ok = await f.Producer.Enqueue(NAMES.Worker, { mode: 'ok' }, user);
            const failing = await f.Producer.Enqueue(NAMES.Worker, { mode: 'fail' }, user);
            // One item per pass, so each pass has exactly one predictable effect.
            const config = { WorkerID: `${PREFIX}worker`, PollingIntervalMs: 1000, MaxConcurrentItems: 1, HeartbeatMinIntervalMs: 5000 };
            const worker = new WorkQueueWorker(config, f.Driver, workerQueueOnly(), user, f.Provider, () => new IntegrationTestHandler());
            const pass = async (): Promise<void> => {
                await worker.PollOnce();
                await worker.WaitForInFlight();
            };
            await pass();
            AssertEqual((await item(user, ok.ItemIDs[0])).Status, 'Completed', 'the succeeding item after the first pass');
            await pass();
            AssertEqual((await item(user, failing.ItemIDs[0])).Status, 'Pending', 'the failing item after its first attempt');
            await pass();
            const exhausted = await item(user, failing.ItemIDs[0]);
            AssertEqual(exhausted.Status, 'Dead Letter', 'the failing item after its final attempt');
            AssertEqual(exhausted.DeadLetterReason, 'Max Attempts Exceeded', 'dead-letter reason');
        },
    },
    {
        Id: 'work-queue.WQ8',
        Name: "WQ8: maintenance dead-letters a lease that expired on the final attempt",
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx();
            const published = await f.Producer.Enqueue(NAMES.Worker, { mode: 'reap' }, ctx.User);
            const claimed = await claimOrFail(f, f.Queues.Worker, 'worker-crashed', ctx.User);
            Assert(UUIDsEqual(claimed.ItemID, published.ItemIDs[0]), 'the reap fixture item is claimed');
            await expireLease(f, ctx.User, claimed.ItemID, f.Queues.Worker.MaxAttempts);
            const reaped = await f.Driver.ReapLeaseExhausted(ctx.User);
            Assert(reaped >= 1, `maintenance reaped ${reaped} item(s)`);
            const row = await item(ctx.User, claimed.ItemID);
            AssertEqual(row.Status, 'Dead Letter', 'status after reaping');
            AssertEqual(row.DeadLetterReason, 'Lease Exhausted', 'dead-letter reason after reaping');
        },
    },
    {
        Id: 'work-queue.WQ9',
        Name: 'WQ9: an expired deduplication key is accepted again, and purge deletes expired keys',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx();
            const key = `${PREFIX}expiring`;
            AssertEqual((await publishKeyed(f, ctx.User, key)).ItemIDs.length, 2, 'first publish with the expiring key');
            await expireDeduplicationKey(f, ctx.User, key);
            AssertEqual((await publishKeyed(f, ctx.User, key)).ItemIDs.length, 2, 'a publish after the window accepts the key again');
            await expireDeduplicationKey(f, ctx.User, key);
            const purged = await f.Ledger.PurgeExpired(ctx.User);
            Assert(purged >= 2, `purge removed ${purged} key(s)`);
            AssertEqual(await deduplicationRowCount(ctx.User, key), 0, 'rows left for the purged key');
        },
    },
    {
        Id: 'work-queue.WQ10',
        Name: 'WQ10: queue stats count pending items, and cancel changes a pending item exactly once',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx();
            const stats = await f.Admin.GetQueueStats({ queueName: NAMES.FanoutA }, ctx.User);
            Assert(stats.supported && stats.queues.length === 1 && stats.queues[0].pending >= 1 && stats.queues[0].oldestPendingAt !== null,
                `fan-out queue stats: ${JSON.stringify(stats)}`);
            const pending = await itemsWhere(ctx.User, `QueueID='${f.Queues.FanoutA.ID}' AND Status='Pending'`);
            Assert(pending.length >= 1, 'the fan-out queue has a pending item to cancel');
            AssertEqual((await f.Admin.CancelItem({ itemID: pending[0].ID }, ctx.User)).cancelled, true, 'cancelling a pending item');
            AssertEqual((await f.Admin.CancelItem({ itemID: pending[0].ID }, ctx.User)).cancelled, false, 'cancelling it again');
            AssertEqual((await item(ctx.User, pending[0].ID)).Status, 'Cancelled', 'status after cancel');
        },
    },
];

for (const check of WorkQueueChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('work-queue', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const provider = ctx.Provider;
        if (!(provider instanceof DatabaseProviderBase)) {
            throw new Error('the work-queue bundle needs the server transport (a DatabaseProviderBase provider)');
        }
        await removeFixtures(provider, ctx.User);
        fixture = await createFixture(provider, ctx.User);
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const provider = ctx.Provider;
        if (provider instanceof DatabaseProviderBase) {
            await removeFixtures(provider, ctx.User);
            await WorkQueueEngine.Instance.Config(true, ctx.User, provider);
        }
        fixture = undefined;
    },
});
```

Append to `packages/TestingFramework/integration-test-suite/src/index.ts`:

```typescript
export * from './checks/work-queue.checks';
```

- [ ] **Step 4: Run the registry test**

Run: `cd packages/TestingFramework/integration-test-suite && pnpm test check-registry`
Expected: PASS — the `work-queue` bundle has exactly 10 checks with unique ids.

Run: `cd packages/TestingFramework/integration-test-suite && pnpm run build`
Expected: builds.

- [ ] **Step 5: Add the test record and suite membership**

`metadata-optional/integration-test/tests/integration/.IT87-work-queue.json`:

```json
{
  "fields": {
    "TypeID": "@lookup:MJ: Test Types.Name=Integration Test",
    "Name": "IT87 - Work Queue (native driver)",
    "Description": "Live-DB proof of the durable work queue's native driver, which the unit tier only asserts as statement shapes. WQ1 metadata loads through WorkQueueEngine. WQ2 a publish fans out one Pending item per matching subscription under one PublishID, and subscription filters exclude. WQ3 a repeated deduplication key creates nothing and names the duplicate queues. WQ4 partition FIFO holds the second item while the head is in flight. WQ5 a takeover after lease expiry updates the row in place with fence token and attempt incremented, and the displaced worker's heartbeat and settle are rejected. WQ6 a dead-lettered head blocks its partition, is listed as blocked, and replay releases it in order. WQ7 the worker completes, retries and finally dead-letters through a real handler, reading a metadata index narrowed to the fixture queue. WQ8 maintenance dead-letters an expired final-attempt lease. WQ9 an expired deduplication key is accepted again and purge removes expired keys. WQ10 queue stats count pending items and cancel changes an item once. Server transport; SQL Server and PostgreSQL. Self-cleaning 'mj-it-wq-' fixtures.",
    "InputDefinition": {},
    "ExpectedOutcomes": {
      "summary": "The native driver's claim, fence, fan-out, deduplication, dead-letter, replay, maintenance and admin statements behave correctly against the live database. 10 checks (WQ1-WQ10)."
    },
    "Configuration": {
      "tier": "deterministic",
      "transport": "server",
      "checks": [
        {
          "type": "work-queue"
        }
      ]
    },
    "Status": "Active"
  },
  "primaryKey": {
    "ID": "C129FA10-619A-4710-AD5D-C8698FBC299A"
  }
}
```

In `metadata-optional/integration-test/test-suites/.integration-suite.json`, in the integration suite's test
list, add after the `IT73 - Entity Graph (client transport)` entry (Sequence 68 when this plan was written;
use one more than the highest Sequence in that suite):

```json
{
  "fields": {
    "SuiteID": "@parent:ID",
    "TestID": "@lookup:MJ: Tests.Name=IT87 - Work Queue (native driver)",
    "Sequence": 69,
    "Status": "Active"
  },
  "primaryKey": {
    "ID": "8C926B02-1032-402D-BFB6-4F3A46D67884"
  }
}
```

In `metadata-optional/integration-test/tests/integration/README.md`, add a row to the test table:

```markdown
| `.IT87-work-queue.json` | IT87 - Work Queue (native driver) | `work-queue` (WQ1–WQ10) | server (SQL) | Creates and removes `mj-it-wq-` queues, topic and subscriptions; SQL Server and PostgreSQL |
```

- [ ] **Step 6: Run the bundle against the development database**

Run: `npx mj sync push --dir=metadata-optional/integration-test`
Expected: 1 test create and 1 suite-test create.

Run: `MJ_INTEGRATION_TEST=1 ./node_modules/.bin/mj test run --name "IT87 - Work Queue (native driver)"`
Expected: 10 of 10 checks pass. Use the workspace `mj` binary, not a global one, or the driver will not
find the bundle.

If a PostgreSQL development database is available, point the configuration at it and run the same command.
Expected: 10 of 10 checks pass.

- [ ] **Step 7: Commit**

```bash
git add packages/TestingFramework/integration-test-suite metadata-optional/integration-test pnpm-lock.yaml
git commit -m "test(work-queue): IT87 live-database bundle for the native driver"
```

---

### Task 17: Package README

**Files:**
- Create: `packages/WorkQueue/README.md`

**Interfaces:**
- Consumes: the public API from Tasks 2–14.
- Produces: the developer-facing guide to `@memberjunction/work-queue`.

- [ ] **Step 1: Write `packages/WorkQueue/README.md`**

````markdown
# @memberjunction/work-queue

A durable work queue for MemberJunction. Publish a small message to a topic; every subscribed queue gets its
own item; workers on any number of servers claim items under a lease and run the handler registered for the
queue. Delivery is at-least-once, items sharing a partition key run one at a time in order, and failures
retry with backoff before dead-lettering.

Design: `plans/work-queue/01-design.md`. Contracts: `plans/work-queue/02-interfaces-and-schema.md`.

## Concepts

| Term | Meaning |
| --- | --- |
| Topic | Named event stream you publish to (`link.clicked`) |
| Queue | Named pipeline with its own lease, retry and dead-letter settings; one handler class per queue |
| Subscription | Topic → queue, with optional `FilterRules` (top-level payload equality) |
| Item | One unit of work in one queue |
| Partition key | Items in one queue with the same key run one at a time, in publish order |
| Dead letter | Terminal failure; operators replay or cancel |

Queues, topics and subscriptions are MJ entities (`MJ: Work Queues`, `MJ: Work Queue Topics`,
`MJ: Work Queue Subscriptions`). Define them with metadata files under `metadata/`.

## Publishing

In-process, on any server where MJServer configured the runtime:

```typescript
import { WorkQueueRuntime } from '@memberjunction/work-queue';

const result = await WorkQueueRuntime.Instance.Producer.Publish(
    'link.clicked',
    { clickId, personId, url, clickedAt },
    contextUser,
    { DeduplicationKey: `click:${clickId}` },
);
// result.PublishID, result.ItemIDs, result.DuplicateQueueNames
```

Straight to one queue: `Producer.Enqueue('venue-import', payload, contextUser, { PartitionKey: 'venue-42' })`.

From outside Node, to topics with `AllowExternalPublish = 1`, with an API key holding `workqueue:publish`:

```http
POST /work-queue/publish
x-api-key: mj_sk_…
Content-Type: application/json

{ "topic": "import.ready", "payload": { "importId": 1001 }, "partitionKey": "venue-42" }
```

`202 { publishId, itemIds, duplicateQueueNames }`; `400` invalid body, `403` scope or topic not external,
`404` unknown topic, `413` payload over 64,000 bytes, `503` work queue not configured.

**Payloads are capped at 64,000 UTF-8 bytes.** Put large data somewhere durable and publish a reference.

## Writing a handler

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseWorkQueueHandler, FatalQueueError, type WorkQueueContext } from '@memberjunction/work-queue';

interface ImportReady { importId: number }

@RegisterClass(BaseWorkQueueHandler, 'venue-import')
export class VenueImportHandler extends BaseWorkQueueHandler<ImportReady> {
    public async Handle(context: WorkQueueContext<ImportReady>): Promise<void> {
        if (typeof context.Payload.importId !== 'number') {
            throw new FatalQueueError('importId missing');         // dead-letter now, no retry
        }
        for (const table of await tablesFor(context.Payload.importId, context.Provider, context.ContextUser)) {
            await normalise(table, context.Provider, context.ContextUser);
            if (!(await context.Heartbeat())) {
                return;                                            // lease lost: another worker owns the item
            }
        }
    }
}
```

- **Be idempotent.** An item can run again after a crash between your work and the settle.
- **Heartbeat at progress boundaries** in anything that can outlast the queue's `LeaseSeconds`. Heartbeats
  are throttled, so calling often is cheap. Stop writing once `Heartbeat()` returns false.
- **Throw `FatalQueueError`** for input retrying cannot fix; **`TransientQueueError(message, retryAfterSeconds)`**
  to control the delay; anything else retries with the queue's backoff.
- Use `context.Provider` and `context.ContextUser` for data access.
- Register handler packages in your application's class manifest, like any other `@RegisterClass`.

## Configuration

`mj.config.cjs`:

```javascript
workQueue: {
  driver: 'Native',                 // or 'AWS' with @memberjunction/work-queue-aws
  workerEnabled: true,              // process items on this instance (publishing works everywhere)
  systemUserEmail: 'system@example.com',
  pollingIntervalMs: 1000,
  maxConcurrentItems: 10,
  heartbeatMinIntervalMs: 5000,
  maintenanceIntervalMs: 60000,
  maxPayloadBytes: 64000,
}
```

Metadata is cached by `WorkQueueEngine`. Changes saved through MJ on the same instance apply automatically;
other instances pick them up on restart or `WorkQueueEngine.Instance.Config(true, contextUser)`.

## Operations

Remote operations, scope `workqueue:manage`:

| Operation | Use |
| --- | --- |
| `WorkQueue.GetQueueStats` | Pending, in-progress and dead-letter counts; oldest pending item |
| `WorkQueue.ListBlockedPartitions` | Partitions halted by a dead-lettered head (Block Partition queues) |
| `WorkQueue.ReplayDeadLetter` | Return a dead-lettered item to Pending with attempts reset |
| `WorkQueue.CancelItem` | Cancel a pending or dead-lettered item (skips a blocked head) |

Maintenance runs on worker instances: it dead-letters leases that expired on their final attempt and purges
expired deduplication keys. Queues with `PurgeOnComplete` delete items when they complete.

## Guarantees and limits

- At-least-once delivery; exactly-once is not possible with leases.
- FIFO and one-at-a-time per (queue, partition key). No ordering across keys or queues.
- Backoff on a failing partition head pauses that partition; Block Partition halts it until an operator acts.
- Deduplication holds for the key's window (default one day).
- Drivers declare capabilities. A queue a driver cannot honour is logged at startup and skipped by workers.

## Testing

```bash
cd packages/WorkQueue && pnpm test
```

The live-database bundle is `IT87 - Work Queue (native driver)` in the integration suite.
````

- [ ] **Step 2: Commit**

```bash
git add packages/WorkQueue/README.md
git commit -m "docs(work-queue): package README"
```

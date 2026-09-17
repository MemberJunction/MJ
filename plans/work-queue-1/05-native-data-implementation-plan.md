# Work Queue — Native Data Layer Implementation Plan (Phase 1, plan 05)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the work-queue schema and metadata, the browser-safe metadata tier `@memberjunction/work-queue-base` (`WorkQueueEngineBase`), and the data layer of `@memberjunction/work-queue-engine`: the SQL executor seam, SQL Server and PostgreSQL statement builders, the Database transport driver, consumer and operator, the deduplication ledger, the Database driver factory, entity validation, the publish coordinator, manifest export, and the server `WorkQueueEngine`.

**Architecture:** Seven core-schema tables (03 §6) hold transports, topics, subscriptions, messages, deliveries, explicit-sequence partition state and deduplication keys. All runtime SQL is built by per-platform statement builders (`SqlServer*Sql`, `PostgreSQL*Sql`) behind three narrow interfaces (publish, consume, operator) and executed through a structural `WorkQueueSqlExecutor` that `DatabaseProviderBase` already satisfies. Single-flight per partition key is enforced by the unique filtered index `UQ_WorkQueueDelivery_InFlightPartition`; `Ordered` blocking is derived from the head delivery; publish order per key is serialized with an application lock taken inside the publish transaction.

The metadata tier is split in two, mirroring `AIEngineBase`/`AIEngine` (03 §0, §11): **`@memberjunction/work-queue-base`** is browser-safe and holds `WorkQueueEngineBase` (a `BaseEngine` caching transports, topics and subscriptions) plus the pure row types, binding builders, filter parsing and topology validation that Explorer, dashboards and any client-tier code need. **`@memberjunction/work-queue-engine`** is server-only: `WorkQueueEngine` is a `BaseSingleton` **facade** that delegates every metadata member to `WorkQueueEngineBase.Instance` — composition, not inheritance, exactly as `AIEngine` delegates to `AIEngineBase` (`packages/AI/Engine/src/AIEngine.ts`) — and adds drivers, the publish coordinator (which owns the deduplication ledger protocol, 03 §2.1), the operator, staging, the manifest and the autoscaler metric. Subscription filters are MJ's `CompositeFilterDescriptor` JSON restricted to the broker-translatable subset (03 §4), parsed by core and validated per transport.

**Tech Stack:** TypeScript 5.9 (ESM), Vitest 3, `@memberjunction/work-queue-core` (plan 04), `@memberjunction/work-queue-base` (this plan), `@memberjunction/core`, `@memberjunction/global`, `@memberjunction/core-entities`, `@memberjunction/sql-dialect`, SQL Server and PostgreSQL through MJ data providers, MJ CodeGen and mj-sync.

**Spec:** [`03-interfaces-and-tables.md`](03-interfaces-and-tables.md) (normative — §0, §4, §5, §6, §7, §11), [`02-implementation-overview.md`](02-implementation-overview.md), [`README.md`](README.md). Read all three before starting. Plan [04](04-core-implementation-plan.md) must be complete.

## Global Constraints

- **Package manager:** pnpm only. Run `pnpm install` at the repository root only — never inside a package, never `npm install`.
- **Per-package commands:** `cd packages/WorkQueue/base && pnpm test` / `pnpm run build`, and the same under `packages/WorkQueue/engine`. Build `base` before `engine`. Do not build single packages with turbo from the root.
- **Package shape (verified against `packages/Scheduling/engine`):** `"type": "module"`; build script `tsc && tsc-alias -f`; `tsconfig.json` extends `../../../tsconfig.server.json` with `outDir: dist`, `rootDir: src`; `vitest.config.ts` merges `../../../vitest.shared`; tests in `src/__tests__/*.test.ts`; extensionless relative imports.
- **Internal dependency versions:** pin every `@memberjunction/*` dependency to the exact `version` in `packages/MJCore/package.json` (`6.1.0` when this plan was written). Dev dependencies: `@types/node` `24.10.11`, `typescript` `^5.9.3`, `vitest` `^3.1.1`.
- **Base package dependencies (03 §0):** `@memberjunction/work-queue-core`, `@memberjunction/core`, `@memberjunction/global`, `@memberjunction/core-entities` **only**. `@memberjunction/work-queue-base` is **browser-safe**: no `@memberjunction/sql-dialect`, no drivers, no `node:` imports, no SQL. A unit test asserts its `package.json` declares nothing else and that no source file imports `node:*` or `sql-dialect`.
- **Engine dependencies in this plan:** `@memberjunction/work-queue-base`, `@memberjunction/work-queue-core`, `@memberjunction/core`, `@memberjunction/global`, `@memberjunction/core-entities`, `@memberjunction/sql-dialect` **only**. The engine must **not** depend on `@memberjunction/work-queue-aws` here — plan 07 adds that dependency and the AWS driver factory.
- **Migrations:** T-SQL only, in `migrations/v6/`, named `V<YYYYMMDDHHMM>__v6.<minor>.x__Add_Work_Queue_Schema.sql`, where `<minor>` is taken from the newest non-CodeGen file in `migrations/v6/` (`v6.2.x` when this plan was written) and the timestamp is later than every existing migration. DDL and `sp_addextendedproperty` only. Use `${flyway:defaultSchema}`, never `__mj`. No `__mj_CreatedAt`/`__mj_UpdatedAt` columns and no single-column foreign-key indexes (CodeGen owns both). Simple CHECK constraints; no `OR Column IS NULL` on nullable columns. Every non-key column gets a description. **Do not write a PostgreSQL migration** — say in the PR description that the counterpart is produced by the release build.
- **CodeGen block:** after the hand DDL, at least 50 blank lines, then the CodeGen comment block, then the full `CodeGen_Run_*.sql` output; delete the standalone `CodeGen_Run_*.sql`. EntityField INSERTs must use the apply-time `(SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM … WHERE [EntityID] = '…')` expression — never a literal. Gate: `node .github/scripts/check-migration-entityfield-sequence.mjs` must exit 0.
- **CodeGen order for new tables (migrations/CLAUDE.md "four steps"):** `pnpm run mj:migrate` → `pnpm exec mj codegen --skipfiles` → append output → `pnpm exec mj sync push --dir=metadata --ci` → `pnpm exec mj codegen --skipdb`. Never run a full `mj codegen` at step 2.
- **One database per agent.** Before `mj migrate`, `mj codegen` or `mj sync push`, confirm the `DB_DATABASE` in `.env` is not in use by any other session.
- **Metadata:** declarative JSON under `metadata/`; primary keys are the `uuidgen` values written in this plan; never hand-write `sync` blocks; never write a `*__Metadata_Sync.sql` migration.
- **Changeset:** this branch adds a migration and metadata, so its changeset bump is **`minor`** (`.claude/rules/changesets.md`); run `npm run check:changeset`.
- **Code rules:** no `any`; `unknown` only at trust boundaries, narrowed immediately; no `as` casts in production code (test fakes under `src/__tests__/` may use `{} as UserInfo` and the recording executor's generic row cast, following existing repo tests); compare UUIDs with `UUIDsEqual` / normalise with `NormalizeUUID` from `@memberjunction/global`; pass `contextUser` to every `ExecuteSQL`, `RunView` and `GetEntityObject`; static imports only; PascalCase public members, camelCase private; functions around 30–40 lines.
- **SQL rules:** every value is a bound parameter; identifiers go through `QuoteIdentifier` and the schema through `MJCoreSchemaName`; guarded writes are returned bare and executed through `ExecuteWrite` (which wraps them with `Dialect.AffectedRowCountSQL`); row-returning SQL Server batches end in exactly **one** result set and capture `OUTPUT` **`INTO` a table variable** (CodeGen tables carry triggers — bare `OUTPUT` fails with error 334); database clock only (`SYSDATETIMEOFFSET()` / `now()`); PostgreSQL parameters carry explicit casts (`$1::uuid`, `$2::text`, `$3::int`, `$4::bigint`).
- **Commits:** perform a task's commit step only when the user has approved commits for this execution session; otherwise stage nothing and report the task as ready to commit.
- **Branch:** work on `feat/work-queue`, tracking `origin/feat/work-queue` (verify with `git branch -vv` before any push).

---

## Task overview

| # | Task | Deliverable |
| --- | --- | --- |
| 1 | Schema (incl. `CancelRequestedAt`), CodeGen, entity flags (API mutations off for driver-owned state), API scopes, `Database` transport seed | Seven entities generated; metadata pushed |
| 2 | Base + engine scaffolds, SQL executor seam, execution helpers, test fakes | Both packages build; helper and dependency-guard tests pass |
| 3 | Row types, builder interfaces, SQL Server publish and ledger statements | Statement shapes tested |
| 4 | SQL Server consume statements (expire, claim, settle, sequence) | Statement shapes tested |
| 5 | SQL Server operator and sweeper statements, cancel-in-flight, autoscaler backlog query and scaler login | Statement shapes tested; scaler script written |
| 6 | PostgreSQL statements and the builder factory | Statement shapes tested for both platforms |
| 7 | Transaction helper and `DeduplicationLedger` | Ledger protocol tested |
| 8 | Driver dependencies, row mapping, `DatabaseTransportOperator` | Mapping and operator methods tested |
| 9 | `DatabaseTransportDriver` and `DatabaseTransportConsumer` | Publish, claim and settle tested with a recording executor |
| 10 | Topology rows and field validation (**base**); `BaseTransportDriverFactory`, Database factory, `MJWorkLogger`, entity servers, driver-owned state guards (**engine**) | Factory resolution, validation and refused `Save()`/`Delete()` tested |
| 11 | Topology bindings and validation incl. per-transport filter support (**base**); manifest and `WorkQueuePublishCoordinator` (**engine**) | Pure topology and publish orchestration tested |
| 12 | `StageDeliveries` for staged `Ordered` subscriptions | Staging insert tested (consumed by plan 07) |
| 13 | `WorkQueueEngineBase` (**base**) and the `WorkQueueEngine` facade (**engine**, incl. `OnDeadLettered`, `GetBacklog`) | Both build; metadata tier, delegation, driver resolution, listeners and cache keys tested |
| 14 | Database conformance harness, filter parity test, full build, changeset | Harness exported; parity with `CompositeFilter` proven; full build green |

## Pre-flight

- [ ] Plan 04 is complete: `cd packages/WorkQueue/core && pnpm test` passes, it exports the 03 §4.2 filter API (`FilterOperator`, `FilterRule`, `FilterGroup`, `SubscriptionFilter`, `FilterSupport`, `ParseSubscriptionFilter(json, support)`, `MatchesFilter`), and `pnpm-workspace.yaml` plus the root `package.json` `workspaces` array both contain `packages/WorkQueue/*` (plan 04 adds them; if missing, add `'packages/WorkQueue/*'` to both lists next to `'packages/Scheduling/*'` and run `pnpm install` at the root).
- [ ] You are on `feat/work-queue` and `git branch -vv` shows `[origin/feat/work-queue]`.
- [ ] The database in `.env` is yours alone (see Global Constraints).
- [ ] `cd packages/MJCore && pnpm test` passes (baseline health check).

## File structure

```
migrations/v6/V<ts>__v6.<minor>.x__Add_Work_Queue_Schema.sql                          Task 1

metadata/
  entities/.work-queue-entities.json                                                 Task 1
  api-scopes/.workqueue-scopes.json                                                  Task 1
  work-queue-transports/.mj-sync.json · .work-queue-transports.json                  Task 1

scripts/work-queue-scaler-login.sql                                                  Task 5

packages/WorkQueue/base/                        browser-safe metadata tier (03 §0)
  package.json · tsconfig.json · vitest.config.ts                                    Task 2
  src/index.ts · src/constants.ts · src/json.ts                                      Task 2
  src/topology/rows.ts · src/entities/validation.ts                                  Task 10
  src/topology/bindings.ts · src/topology/validateTopology.ts                        Task 11
  src/WorkQueueEngineBase.ts                                                         Task 13
  src/testing/rowFixtures.ts                                                         Task 10
  src/__tests__/dependencyGuard.test.ts                                              Task 2
  src/__tests__/entityValidation.test.ts · src/__tests__/topology.test.ts            Tasks 10–11
  src/__tests__/WorkQueueEngineBase.test.ts                                          Task 13

packages/WorkQueue/engine/
  package.json · tsconfig.json · vitest.config.ts                                    Task 2
  src/index.ts                                                                       Task 2, extended by every later task
  src/constants.ts                                                                   Task 2
  src/sql/WorkQueueSqlExecutor.ts · src/sql/SqlParamList.ts · src/sql/sqlExecution.ts   Task 2
  src/sql/rows.ts · src/sql/WorkQueueSqlBuilder.ts · src/sql/StatementBase.ts         Task 3   (SQL row shapes — not topology rows)
  src/sql/sqlserver/SqlServerPublishSql.ts                                           Task 3
  src/sql/sqlserver/SqlServerFragments.ts · SqlServerConsumeSql.ts                   Task 4
  src/sql/sqlserver/SqlServerOperatorSql.ts                                          Task 5
  src/sql/postgresql/PostgreSQLFragments.ts · PostgreSQLPublishSql.ts · PostgreSQLConsumeSql.ts · PostgreSQLOperatorSql.ts   Task 6
  src/sql/CreateWorkQueueSqlBuilder.ts                                               Task 6
  src/transaction/RunInWorkQueueTransaction.ts · src/dedup/DeduplicationLedger.ts    Task 7
  src/transports/TransportDriverDeps.ts                                              Task 8
  src/transports/database/bindingIds.ts · rowMapping.ts · DatabaseTransportOperator.ts   Task 8
  src/publish/publishResults.ts                                                      Task 9
  src/transports/database/databaseCapabilities.ts · deliveryPlan.ts                  Task 9
  src/transports/database/DatabaseTransportDriver.ts · DatabaseTransportConsumer.ts  Task 9
  src/transports/BaseTransportDriverFactory.ts                                       Task 10
  src/transports/database/DatabaseTransportDriverFactory.ts                          Task 10
  src/logging/MJWorkLogger.ts                                                        Task 10
  src/entities/WorkQueueTransportEntityServer.ts · WorkQueueTopicEntityServer.ts · WorkQueueSubscriptionEntityServer.ts   Task 10
  src/entities/DriverOwnedEntityServers.ts                                           Task 10
  src/topology/manifest.ts                                                           Task 11
  src/publish/WorkQueuePublishCoordinator.ts                                         Task 11
  src/transports/database/stageDeliveries.ts                                         Task 12
  src/engine/driverResolution.ts · src/engine/PublishListenerSet.ts                  Task 13
  src/WorkQueueEngine.ts                                                             Task 13
  src/testing/DatabaseConformanceHarness.ts                                          Task 14
  src/__tests__/filterParity.test.ts                                                 Task 14
  src/__tests__/fakes.ts                                                             Task 2, extended by later tasks
  src/__tests__/*.test.ts                                                            every code task

.changeset/<generated-name>.md                                                       Task 14
```

---

### Task 1: Schema, CodeGen, entity flags, API scopes and the `Database` transport seed

**Files:**
- Create: `migrations/v6/V<ts>__v6.<minor>.x__Add_Work_Queue_Schema.sql`
- Create: `metadata/entities/.work-queue-entities.json`
- Create: `metadata/api-scopes/.workqueue-scopes.json`
- Create: `metadata/work-queue-transports/.mj-sync.json`, `metadata/work-queue-transports/.work-queue-transports.json`
- Generated (commit, never edit): `packages/MJCoreEntities/src/generated/**`, `packages/MJServer/src/generated/**` (both are tracked in git). Never stage `packages/MJAPI/src/generated/**`, `packages/GeneratedEntities/**` or `mj.config.cjs`.

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Entities `MJ: Work Queue Transports`, `MJ: Work Queue Topics`, `MJ: Work Queue Subscriptions`, `MJ: Work Queue Messages`, `MJ: Work Queue Deliveries`, `MJ: Work Queue Partition States`, `MJ: Work Queue Deduplications` with generated classes `MJWorkQueueTransportEntity`, `MJWorkQueueTopicEntity`, `MJWorkQueueSubscriptionEntity`, `MJWorkQueueMessageEntity`, `MJWorkQueueDeliveryEntity`, `MJWorkQueuePartitionStateEntity`, `MJWorkQueueDeduplicationEntity`.
  - API scopes `workqueue`, `workqueue:publish`, `workqueue:read`, `workqueue:operate`.
  - A seeded transport row `Name = 'Database'`, `DriverClass = 'Database'`, `ID = D1ED3F08-7008-4DA8-BA2B-7CD6A820AEB5`.
  - Indexes named exactly `UQ_WorkQueueDelivery_InFlightPartition`, `UQ_WorkQueueMessage_Topic_Key_Sequence`, `UQ_WorkQueueDeduplication_Topic_Key` (the TypeScript maps unique violations by these names).

Entity permissions need no metadata: CodeGen's `newEntityDefaults.PermissionDefaults` grants `UI` read and `Developer`/`Integration` full access to every new entity (`packages/CodeGenLib/src/Config/config.ts`).

- [ ] **Step 1: Choose the file name**

Run:
```bash
ls migrations/v6 | grep -v CodeGen_Run | tail -1
date -u +%Y%m%d%H%M
```
Use the minor from the newest file (for example `v6.2.x`) and the printed timestamp:
`migrations/v6/V<timestamp>__v6.<minor>.x__Add_Work_Queue_Schema.sql`.

- [ ] **Step 2: Write the migration (hand DDL)**

```sql
-- ============================================================================
-- Work Queue — schema (plans/work-queue-1/03-interfaces-and-tables.md §6)
-- ============================================================================
-- Additive only: seven new tables, CHECK/UNIQUE constraints, five non-FK indexes
-- and column descriptions. CodeGen owns __mj_CreatedAt/__mj_UpdatedAt, FK
-- indexes, views, procedures, EntityField rows and generated classes.
-- PostgreSQL counterpart is produced by the release build.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- WorkQueueTransport
-- ---------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.WorkQueueTransport (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_WorkQueueTransport_ID DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(100) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    DriverClass NVARCHAR(100) NOT NULL,
    Configuration NVARCHAR(MAX) NULL,
    CredentialID UNIQUEIDENTIFIER NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_WorkQueueTransport_Status DEFAULT 'Active',
    CONSTRAINT PK_WorkQueueTransport PRIMARY KEY (ID),
    CONSTRAINT UQ_WorkQueueTransport_Name UNIQUE (Name),
    CONSTRAINT FK_WorkQueueTransport_Credential FOREIGN KEY (CredentialID) REFERENCES ${flyway:defaultSchema}.Credential(ID),
    CONSTRAINT CK_WorkQueueTransport_Status CHECK (Status IN ('Active', 'Disabled'))
);
GO

-- ---------------------------------------------------------------------------
-- WorkQueueTopic
-- ---------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.WorkQueueTopic (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_WorkQueueTopic_ID DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    TransportID UNIQUEIDENTIFIER NOT NULL,
    OrderingMode NVARCHAR(20) NOT NULL CONSTRAINT DF_WorkQueueTopic_OrderingMode DEFAULT 'PublishOrder',
    IsFifo BIT NOT NULL CONSTRAINT DF_WorkQueueTopic_IsFifo DEFAULT 0,
    AllowExternalPublish BIT NOT NULL CONSTRAINT DF_WorkQueueTopic_AllowExternalPublish DEFAULT 0,
    MaxPayloadBytes INT NOT NULL CONSTRAINT DF_WorkQueueTopic_MaxPayloadBytes DEFAULT 262144,
    DefaultDeduplicationTTLSeconds INT NOT NULL CONSTRAINT DF_WorkQueueTopic_DefaultDeduplicationTTLSeconds DEFAULT 86400,
    RetentionDays INT NOT NULL CONSTRAINT DF_WorkQueueTopic_RetentionDays DEFAULT 7,
    BindingConfig NVARCHAR(MAX) NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_WorkQueueTopic_Status DEFAULT 'Active',
    CONSTRAINT PK_WorkQueueTopic PRIMARY KEY (ID),
    CONSTRAINT UQ_WorkQueueTopic_Name UNIQUE (Name),
    CONSTRAINT FK_WorkQueueTopic_Transport FOREIGN KEY (TransportID) REFERENCES ${flyway:defaultSchema}.WorkQueueTransport(ID),
    CONSTRAINT CK_WorkQueueTopic_OrderingMode CHECK (OrderingMode IN ('PublishOrder', 'ExplicitSequence')),
    CONSTRAINT CK_WorkQueueTopic_MaxPayloadBytes CHECK (MaxPayloadBytes > 0 AND MaxPayloadBytes <= 262144),
    CONSTRAINT CK_WorkQueueTopic_DefaultDeduplicationTTLSeconds CHECK (DefaultDeduplicationTTLSeconds >= 60),
    CONSTRAINT CK_WorkQueueTopic_RetentionDays CHECK (RetentionDays >= 1),
    CONSTRAINT CK_WorkQueueTopic_Status CHECK (Status IN ('Active', 'Disabled'))
);
GO

-- ---------------------------------------------------------------------------
-- WorkQueueSubscription
-- ---------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.WorkQueueSubscription (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_WorkQueueSubscription_ID DEFAULT NEWSEQUENTIALID(),
    TopicID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Filter NVARCHAR(MAX) NULL,
    PartitionMode NVARCHAR(20) NOT NULL CONSTRAINT DF_WorkQueueSubscription_PartitionMode DEFAULT 'None',
    MaxAttempts INT NOT NULL CONSTRAINT DF_WorkQueueSubscription_MaxAttempts DEFAULT 5,
    BackoffBaseSeconds INT NOT NULL CONSTRAINT DF_WorkQueueSubscription_BackoffBaseSeconds DEFAULT 10,
    BackoffMaxSeconds INT NOT NULL CONSTRAINT DF_WorkQueueSubscription_BackoffMaxSeconds DEFAULT 900,
    LeaseSeconds INT NOT NULL CONSTRAINT DF_WorkQueueSubscription_LeaseSeconds DEFAULT 60,
    HeartbeatMode NVARCHAR(20) NOT NULL CONSTRAINT DF_WorkQueueSubscription_HeartbeatMode DEFAULT 'Auto',
    MaxProcessingSeconds INT NULL,
    SequenceGapAlertSeconds INT NULL,
    HostType NVARCHAR(20) NOT NULL CONSTRAINT DF_WorkQueueSubscription_HostType DEFAULT 'MJWorker',
    HandlerKey NVARCHAR(200) NULL,
    ExternalRef NVARCHAR(500) NULL,
    BindingConfig NVARCHAR(MAX) NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_WorkQueueSubscription_Status DEFAULT 'Active',
    CONSTRAINT PK_WorkQueueSubscription PRIMARY KEY (ID),
    CONSTRAINT UQ_WorkQueueSubscription_Name UNIQUE (Name),
    CONSTRAINT FK_WorkQueueSubscription_Topic FOREIGN KEY (TopicID) REFERENCES ${flyway:defaultSchema}.WorkQueueTopic(ID),
    CONSTRAINT CK_WorkQueueSubscription_PartitionMode CHECK (PartitionMode IN ('None', 'Exclusive', 'Ordered')),
    CONSTRAINT CK_WorkQueueSubscription_MaxAttempts CHECK (MaxAttempts >= 1),
    CONSTRAINT CK_WorkQueueSubscription_BackoffBaseSeconds CHECK (BackoffBaseSeconds >= 0),
    CONSTRAINT CK_WorkQueueSubscription_BackoffMaxSeconds CHECK (BackoffMaxSeconds >= 0),
    CONSTRAINT CK_WorkQueueSubscription_LeaseSeconds CHECK (LeaseSeconds >= 5),
    CONSTRAINT CK_WorkQueueSubscription_HeartbeatMode CHECK (HeartbeatMode IN ('Auto', 'Manual')),
    CONSTRAINT CK_WorkQueueSubscription_HostType CHECK (HostType IN ('MJWorker', 'External')),
    CONSTRAINT CK_WorkQueueSubscription_Status CHECK (Status IN ('Active', 'Paused', 'Disabled'))
);
GO

-- ---------------------------------------------------------------------------
-- WorkQueueMessage
-- ---------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.WorkQueueMessage (
    ID UNIQUEIDENTIFIER NOT NULL,
    PublishOrdinal BIGINT IDENTITY(1, 1) NOT NULL,
    TopicID UNIQUEIDENTIFIER NOT NULL,
    PartitionKey NVARCHAR(200) NULL,
    Sequence BIGINT NULL,
    Attributes NVARCHAR(4000) NULL,
    Payload NVARCHAR(MAX) NULL,
    PayloadRef NVARCHAR(2000) NULL,
    CorrelationID NVARCHAR(200) NULL,
    PublishedAt DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_WorkQueueMessage_PublishedAt DEFAULT SYSDATETIMEOFFSET(),
    PublishedByUserID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_WorkQueueMessage PRIMARY KEY (ID),
    CONSTRAINT UQ_WorkQueueMessage_PublishOrdinal UNIQUE (PublishOrdinal),
    CONSTRAINT FK_WorkQueueMessage_Topic FOREIGN KEY (TopicID) REFERENCES ${flyway:defaultSchema}.WorkQueueTopic(ID),
    CONSTRAINT FK_WorkQueueMessage_PublishedByUser FOREIGN KEY (PublishedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_WorkQueueMessage_Sequence CHECK (Sequence >= 1)
);
GO

CREATE UNIQUE NONCLUSTERED INDEX UQ_WorkQueueMessage_Topic_Key_Sequence
    ON ${flyway:defaultSchema}.WorkQueueMessage (TopicID, PartitionKey, Sequence)
    WHERE Sequence IS NOT NULL;
GO

-- ---------------------------------------------------------------------------
-- WorkQueueDelivery
-- ---------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.WorkQueueDelivery (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_WorkQueueDelivery_ID DEFAULT NEWSEQUENTIALID(),
    MessageID UNIQUEIDENTIFIER NOT NULL,
    SubscriptionID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_WorkQueueDelivery_Status DEFAULT 'Pending',
    PartitionKey NVARCHAR(200) NULL,
    OrderKey BIGINT NOT NULL,
    AttemptCount INT NOT NULL CONSTRAINT DF_WorkQueueDelivery_AttemptCount DEFAULT 0,
    IsReplay BIT NOT NULL CONSTRAINT DF_WorkQueueDelivery_IsReplay DEFAULT 0,
    VisibleAt DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_WorkQueueDelivery_VisibleAt DEFAULT SYSDATETIMEOFFSET(),
    LeaseOwner NVARCHAR(200) NULL,
    LeaseToken UNIQUEIDENTIFIER NULL,
    LeaseExpiresAt DATETIMEOFFSET(7) NULL,
    LastHeartbeatAt DATETIMEOFFSET(7) NULL,
    Progress NVARCHAR(4000) NULL,
    LastError NVARCHAR(MAX) NULL,
    DeadLetterReason NVARCHAR(100) NULL,
    DeadLetteredAt DATETIMEOFFSET(7) NULL,
    CompletedAt DATETIMEOFFSET(7) NULL,
    CancelRequestedAt DATETIMEOFFSET(7) NULL,
    ResolvedByUserID UNIQUEIDENTIFIER NULL,
    ResolutionNote NVARCHAR(1000) NULL,
    CONSTRAINT PK_WorkQueueDelivery PRIMARY KEY (ID),
    CONSTRAINT FK_WorkQueueDelivery_Message FOREIGN KEY (MessageID) REFERENCES ${flyway:defaultSchema}.WorkQueueMessage(ID),
    CONSTRAINT FK_WorkQueueDelivery_Subscription FOREIGN KEY (SubscriptionID) REFERENCES ${flyway:defaultSchema}.WorkQueueSubscription(ID),
    CONSTRAINT FK_WorkQueueDelivery_ResolvedByUser FOREIGN KEY (ResolvedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT UQ_WorkQueueDelivery_Subscription_Message UNIQUE (SubscriptionID, MessageID),
    CONSTRAINT CK_WorkQueueDelivery_Status CHECK (Status IN ('Pending', 'InFlight', 'Completed', 'DeadLettered', 'Discarded')),
    CONSTRAINT CK_WorkQueueDelivery_AttemptCount CHECK (AttemptCount >= 0)
);
GO

CREATE UNIQUE NONCLUSTERED INDEX UQ_WorkQueueDelivery_InFlightPartition
    ON ${flyway:defaultSchema}.WorkQueueDelivery (SubscriptionID, PartitionKey)
    WHERE Status = 'InFlight' AND PartitionKey IS NOT NULL;
GO

CREATE NONCLUSTERED INDEX IX_WorkQueueDelivery_Claim
    ON ${flyway:defaultSchema}.WorkQueueDelivery (SubscriptionID, Status, VisibleAt)
    INCLUDE (PartitionKey, OrderKey, AttemptCount);
GO

CREATE NONCLUSTERED INDEX IX_WorkQueueDelivery_PartitionHead
    ON ${flyway:defaultSchema}.WorkQueueDelivery (SubscriptionID, PartitionKey, OrderKey)
    INCLUDE (Status)
    WHERE PartitionKey IS NOT NULL AND Status IN ('Pending', 'InFlight', 'DeadLettered');
GO

CREATE NONCLUSTERED INDEX IX_WorkQueueDelivery_Lease
    ON ${flyway:defaultSchema}.WorkQueueDelivery (Status, LeaseExpiresAt)
    WHERE Status = 'InFlight';
GO

-- ---------------------------------------------------------------------------
-- WorkQueuePartitionState
-- ---------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.WorkQueuePartitionState (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_WorkQueuePartitionState_ID DEFAULT NEWSEQUENTIALID(),
    SubscriptionID UNIQUEIDENTIFIER NOT NULL,
    PartitionKey NVARCHAR(200) NOT NULL,
    LastCompletedSequence BIGINT NOT NULL CONSTRAINT DF_WorkQueuePartitionState_LastCompletedSequence DEFAULT 0,
    AwaitingSequenceSince DATETIMEOFFSET(7) NULL,
    GapStalled BIT NOT NULL CONSTRAINT DF_WorkQueuePartitionState_GapStalled DEFAULT 0,
    CONSTRAINT PK_WorkQueuePartitionState PRIMARY KEY (ID),
    CONSTRAINT FK_WorkQueuePartitionState_Subscription FOREIGN KEY (SubscriptionID) REFERENCES ${flyway:defaultSchema}.WorkQueueSubscription(ID),
    CONSTRAINT UQ_WorkQueuePartitionState_Subscription_Key UNIQUE (SubscriptionID, PartitionKey),
    CONSTRAINT CK_WorkQueuePartitionState_LastCompletedSequence CHECK (LastCompletedSequence >= 0)
);
GO

-- ---------------------------------------------------------------------------
-- WorkQueueDeduplication
-- ---------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.WorkQueueDeduplication (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_WorkQueueDeduplication_ID DEFAULT NEWSEQUENTIALID(),
    TopicID UNIQUEIDENTIFIER NOT NULL,
    DeduplicationKey NVARCHAR(200) NOT NULL,
    MessageID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL,
    ExpiresAt DATETIMEOFFSET(7) NOT NULL,
    CONSTRAINT PK_WorkQueueDeduplication PRIMARY KEY (ID),
    CONSTRAINT FK_WorkQueueDeduplication_Topic FOREIGN KEY (TopicID) REFERENCES ${flyway:defaultSchema}.WorkQueueTopic(ID),
    CONSTRAINT UQ_WorkQueueDeduplication_Topic_Key UNIQUE (TopicID, DeduplicationKey),
    CONSTRAINT CK_WorkQueueDeduplication_Status CHECK (Status IN ('Reserved', 'Confirmed'))
);
GO

CREATE NONCLUSTERED INDEX IX_WorkQueueDeduplication_ExpiresAt
    ON ${flyway:defaultSchema}.WorkQueueDeduplication (ExpiresAt);
GO

-- ===========================================================================
-- Descriptions (PK/FK columns are described by CodeGen)
-- ===========================================================================
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A configured backend that stores and delivers work-queue messages (Database, AWS, ...). Topics bind to exactly one transport.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTransport';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique transport name, for example Database or AWS-prod-us-east-1.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTransport', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What this transport is used for and who operates it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTransport', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ClassFactory key of the BaseTransportDriverFactory registration that builds the driver: Database or AWS.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTransport', @level2type=N'COLUMN', @level2name=N'DriverClass';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Driver-specific JSON configuration, for example {"Region":"us-east-1"}. Never holds secrets; use CredentialID.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTransport', @level2type=N'COLUMN', @level2name=N'Configuration';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active transports can deliver; Disabled transports reject publishes.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTransport', @level2type=N'COLUMN', @level2name=N'Status';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A named destination producers publish work to. Each topic is bound to one transport and fans out to its subscriptions.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Unique dotted lowercase topic name, for example email.events.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What the topic represents and who publishes to it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'PublishOrder: Ordered subscriptions process a key in publish order. ExplicitSequence: partitioned publishes carry Sequence (starting at 1 per key) and gaps block.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'OrderingMode';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Cloud transports: the topic uses FIFO resources. Required on AWS when any subscription is Exclusive or Ordered, or the topic is ExplicitSequence.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'IsFifo';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, API callers may publish to this topic through POST /work-queue/topics/{topic}/messages. In-process code may publish to any active topic.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'AllowExternalPublish';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Largest serialized envelope accepted, in bytes (at most 262144).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'MaxPayloadBytes';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Window, in seconds, during which a DeduplicationKey suppresses repeat publishes when the publisher does not supply one.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'DefaultDeduplicationTTLSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Days completed and discarded deliveries, and their messages, are kept before the sweeper purges them (Database and staged subscriptions).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'RetentionDays';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Transport binding JSON imported after provisioning, for example {"SnsTopicArn":"..."}. Empty for Database topics.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'BindingConfig';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active topics accept publishes; Disabled topics reject them.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'Status';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A consumer''s standing request for a topic''s messages: filter, partition mode, retry and lease policy, and where the handler runs.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Globally unique subscription name, used in manifests and consumer configuration.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What this consumer does and who owns it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional attribute filter as MJ CompositeFilterDescriptor JSON (03 section 4), restricted to the broker-translatable operators eq, neq, startswith, isnull and isnotnull over envelope attribute names. Null matches every message.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'Filter';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'None: no key constraints. Exclusive: one delivery in flight per partition key, no order promise. Ordered: strict order per key; a dead-lettered head blocks its key.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'PartitionMode';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Attempts allowed per delivery, including lease expiries, before it is dead-lettered.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'MaxAttempts';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Base retry delay in seconds; full-jitter exponential backoff doubles it per attempt.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'BackoffBaseSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Upper bound on the retry delay, in seconds.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'BackoffMaxSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Seconds a claim lasts before it expires unless renewed by a heartbeat. Measured on the transport clock.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'LeaseSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Auto: the runtime renews the lease while the handler runs. Manual: only handler heartbeats renew it, so hung handlers are detected.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'HeartbeatMode';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional cap on handler run time; Auto heartbeats stop and the handler is aborted after it. Above a host''s known ceiling it produces a validation warning.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'MaxProcessingSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Ordered subscriptions on ExplicitSequence topics: seconds a key may wait for a missing sequence before it is flagged GapStalled.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'SequenceGapAlertSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MJWorker: the handler runs inside an MJ server process. External: the handler runs elsewhere, for example a Lambda (cloud transports only).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'HostType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ClassFactory key of the BaseWorkHandler registration that processes deliveries. Required for MJWorker subscriptions.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'HandlerKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Informational reference to an external consumer, for example a Lambda ARN.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'ExternalRef';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Transport binding JSON imported after provisioning, for example queue and dead-letter queue URLs. Empty for Database subscriptions.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'BindingConfig';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active: deliveries are created and processed. Paused: deliveries are created but nothing is claimed. Disabled: no new deliveries are created.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'Status';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'One published unit of work (the envelope). Immutable. Stored for Database topics and for staged Ordered subscriptions on cloud topics.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Publish (or staging) order, assigned by the database. Used as the order key on PublishOrder topics.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'PublishOrdinal';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Producer-supplied key used by Exclusive and Ordered subscriptions.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'PartitionKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Explicit sequence within the partition key, starting at 1. Present only on ExplicitSequence topics.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'Sequence';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON object of string attributes (at most 10). The only envelope fields subscription filters see.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'Attributes';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Inline JSON payload. Mutually exclusive with PayloadRef.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'Payload';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON claim-check reference ({"Uri":...}) to data held outside the queue.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'PayloadRef';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Caller-supplied identifier for tracing related work.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'CorrelationID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When MJ accepted the publish.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'PublishedAt';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'One subscription''s processing of one message: status, attempts and lease.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Pending: awaiting claim. InFlight: leased. Completed: handler succeeded. DeadLettered: exhausted or rejected, needs an operator. Discarded: cancelled or resolved by an operator.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Copy of the message partition key, populated only for Exclusive and Ordered subscriptions. Drives the in-flight uniqueness rule.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'PartitionKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Position within the partition key: the message Sequence on ExplicitSequence topics, otherwise its PublishOrdinal.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'OrderKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Claims so far, including claims whose lease expired. Reset to 0 by replay.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'AttemptCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'1 once an operator has replayed this delivery from the dead-letter state.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'IsReplay';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Earliest time the delivery may be claimed; retry backoff moves it forward.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'VisibleAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Worker instance holding the current lease.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'LeaseOwner';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'New value per claim. Every heartbeat and settle must present it, so a worker that lost its lease cannot overwrite a newer claim.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'LeaseToken';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the current lease expires, on the database clock.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'LeaseExpiresAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the lease was last renewed.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'LastHeartbeatAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Latest handler progress JSON ({"Percent","Message","Checkpoint"}).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'Progress';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Most recent failure text, including LeaseExpired.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'LastError';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Why the delivery was dead-lettered: a handler reason, MaxAttemptsExceeded, LeaseExpired or HandlerNotRegistered.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'DeadLetterReason';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the delivery entered DeadLettered.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'DeadLetteredAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Terminal time for both Completed and Discarded; the retention purge key.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'CompletedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Set when an operator cancels an in-flight delivery; the lease token is rotated at the same moment so the holder is fenced out. ExpireLeases turns such a row into Discarded rather than retrying it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'CancelRequestedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Operator note recorded with a replay or the reason recorded with a discard.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'ResolutionNote';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Explicit-sequence high-water mark per Ordered subscription and partition key. Blocking and single-flight are derived from deliveries, not stored here. Never purged automatically.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueuePartitionState';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Partition key this row tracks.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueuePartitionState', @level2type=N'COLUMN', @level2name=N'PartitionKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Highest sequence resolved without gaps (Completed, Discarded or Skipped). The next deliverable sequence is this value plus one.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueuePartitionState', @level2type=N'COLUMN', @level2name=N'LastCompletedSequence';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the key started waiting for a missing sequence; null when not waiting.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueuePartitionState', @level2type=N'COLUMN', @level2name=N'AwaitingSequenceSince';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'1 once the key has waited longer than the subscription SequenceGapAlertSeconds.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueuePartitionState', @level2type=N'COLUMN', @level2name=N'GapStalled';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Publish deduplication ledger for every transport: a key suppresses repeat publishes to a topic until ExpiresAt.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Producer-supplied key identifying one logical message within the topic.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication', @level2type=N'COLUMN', @level2name=N'DeduplicationKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MessageID of the publish that owns the key. Not a foreign key: cloud messages have no row.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication', @level2type=N'COLUMN', @level2name=N'MessageID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Reserved: a cloud send is in progress (short expiry). Confirmed: the publish was accepted.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the key stops suppressing duplicates. Expired rows are replaced on publish and purged by the sweeper.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication', @level2type=N'COLUMN', @level2name=N'ExpiresAt';
GO
```

- [ ] **Step 3: Apply the migration**

Run: `pnpm run mj:migrate`
Expected: the new migration applies with no errors.

- [ ] **Step 4: Run CodeGen against the database only**

Run: `pnpm exec mj codegen --skipfiles`
Expected: completes and writes a `migrations/v6/CodeGen_Run_*.sql` file.

- [ ] **Step 5: Append the CodeGen output**

Append at least 50 blank lines to the migration, then this block, then the full contents of the `CodeGen_Run_*.sql` file. Delete the `CodeGen_Run_*.sql` file.

```sql
/* ===========================================================================
   EVERYTHING BELOW THIS BLOCK WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL
   ---------------------------------------------------------------------------
   Contents: Entity and EntityField inserts, regenerated base views,
   spCreate/spUpdate/spDelete procedures, permission grants, and extended
   properties for the seven work-queue tables above.
   DO NOT EDIT BY HAND. If the DDL above changes, re-run CodeGen and replace
   this entire generated section.
   =========================================================================== */
```

Run: `node .github/scripts/check-migration-entityfield-sequence.mjs`
Expected: exits 0 — no literal `Sequence` values in EntityField INSERTs.

- [ ] **Step 6: Write the entity setting overrides**

Delivery state is **driver-owned** (03 §6.8). Beyond the write-volume flags, these four entities set
`AllowCreateAPI`, `AllowUpdateAPI` and `AllowDeleteAPI` to `false`, which:

- removes create/update/delete from the GraphQL API, so nobody edits a claim, a lease or a cancel flag from
  Explorer or a client;
- stops CodeGen emitting `spCreate`/`spUpdate`/`spDelete` for them (`packages/CodeGenLib/src/Database/sql_codegen.ts:925-933`
  gates each routine on the matching flag), so `BaseEntity.Save()` has nothing to call. Task 10 adds server entity
  subclasses that fail such a save with a clear message instead of a missing-routine error.

CodeGen's new-entity defaults set all three to `true` (`packages/CodeGenLib/src/Config/config.ts:465`), so Step 9 pushes
this metadata **before** the CodeGen pass whose SQL is appended to the migration — otherwise the migration would carry
CRUD procedures the design forbids.

`metadata/entities/.work-queue-entities.json`:

```json
[
  {
    "_comments": ["Runtime table written by set-based SQL: no change tracking, no search, direct SQL sanctioned"],
    "primaryKey": { "ID": "@lookup:MJ: Entities.Name=MJ: Work Queue Messages" },
    "fields": { "Name": "MJ: Work Queue Messages", "TrackRecordChanges": false, "AllowUserSearchAPI": false, "TrustServerCacheCompletely": false, "AllowCreateAPI": false, "AllowUpdateAPI": false, "AllowDeleteAPI": false, "AllowDirectSQLInsert": true, "AllowDirectSQLUpdate": true, "AllowDirectSQLDelete": true }
  },
  {
    "_comments": ["Claim table: every claim, heartbeat and settle is a direct SQL write"],
    "primaryKey": { "ID": "@lookup:MJ: Entities.Name=MJ: Work Queue Deliveries" },
    "fields": { "Name": "MJ: Work Queue Deliveries", "TrackRecordChanges": false, "AllowUserSearchAPI": false, "TrustServerCacheCompletely": false, "AllowCreateAPI": false, "AllowUpdateAPI": false, "AllowDeleteAPI": false, "AllowDirectSQLInsert": true, "AllowDirectSQLUpdate": true, "AllowDirectSQLDelete": true }
  },
  {
    "_comments": ["Explicit-sequence high-water marks maintained by set-based SQL"],
    "primaryKey": { "ID": "@lookup:MJ: Entities.Name=MJ: Work Queue Partition States" },
    "fields": { "Name": "MJ: Work Queue Partition States", "TrackRecordChanges": false, "AllowUserSearchAPI": false, "TrustServerCacheCompletely": false, "AllowCreateAPI": false, "AllowUpdateAPI": false, "AllowDeleteAPI": false, "AllowDirectSQLInsert": true, "AllowDirectSQLUpdate": true, "AllowDirectSQLDelete": true }
  },
  {
    "_comments": ["Short-lived deduplication keys"],
    "primaryKey": { "ID": "@lookup:MJ: Entities.Name=MJ: Work Queue Deduplications" },
    "fields": { "Name": "MJ: Work Queue Deduplications", "TrackRecordChanges": false, "AllowUserSearchAPI": false, "TrustServerCacheCompletely": false, "AllowCreateAPI": false, "AllowUpdateAPI": false, "AllowDeleteAPI": false, "AllowDirectSQLInsert": true, "AllowDirectSQLUpdate": true, "AllowDirectSQLDelete": true }
  }
]
```

- [ ] **Step 7: Write the API scopes**

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
    "primaryKey": { "ID": "0462591B-AFD7-41DD-802B-F75BB609B9F5" }
  },
  {
    "fields": {
      "Name": "publish",
      "FullPath": "workqueue:publish",
      "ParentID": "@lookup:MJ: API Scopes.FullPath=workqueue",
      "Category": "Work Queue",
      "Description": "Publish messages to externally publishable topics through POST /work-queue/topics/{topic}/messages. Resource: topic name.",
      "ResourceType": "Topic",
      "IsActive": true
    },
    "primaryKey": { "ID": "DB82869E-0C00-4510-B570-2E6182C8CF48" }
  },
  {
    "fields": {
      "Name": "read",
      "FullPath": "workqueue:read",
      "ParentID": "@lookup:MJ: API Scopes.FullPath=workqueue",
      "Category": "Work Queue",
      "Description": "Read subscription statistics, dead letters, partitions and binding validation through the WorkQueue remote operations. Resource: subscription name.",
      "ResourceType": "Subscription",
      "IsActive": true
    },
    "primaryKey": { "ID": "9450B77D-0AEB-43D6-879E-FACE98915963" }
  },
  {
    "fields": {
      "Name": "operate",
      "FullPath": "workqueue:operate",
      "ParentID": "@lookup:MJ: API Scopes.FullPath=workqueue",
      "Category": "Work Queue",
      "Description": "Replay or discard deliveries and skip sequences through the WorkQueue remote operations. Resource: subscription name.",
      "ResourceType": "Subscription",
      "IsActive": true
    },
    "primaryKey": { "ID": "665F13F8-5690-45BE-911F-1E560CBEB0E1" }
  }
]
```

- [ ] **Step 8: Seed the `Database` transport**

`metadata/work-queue-transports/.mj-sync.json`:

```json
{
  "entity": "MJ: Work Queue Transports",
  "filePattern": "**/.*.json"
}
```

`metadata/work-queue-transports/.work-queue-transports.json`:

```json
[
  {
    "fields": {
      "Name": "Database",
      "Description": "MJ-native transport: messages and deliveries are rows in the MJ database, claimed by MJ worker hosts.",
      "DriverClass": "Database",
      "Configuration": null,
      "CredentialID": null,
      "Status": "Active"
    },
    "primaryKey": { "ID": "D1ED3F08-7008-4DA8-BA2B-7CD6A820AEB5" }
  }
]
```

- [ ] **Step 9: Push the metadata, re-run the SQL pass, then generate files**

Run: `pnpm exec mj sync push --dir=metadata --ci --dry-run`
Expected: 4 entity updates, 4 API scope creates, 1 work-queue transport create; no lookup failures.

Run: `pnpm exec mj sync push --dir=metadata --ci`
Expected: completes without errors.

Run: `pnpm exec mj codegen --skipfiles`
Expected: completes. This second SQL pass re-emits with `AllowCreateAPI/UpdateAPI/DeleteAPI = false` in force.
**Replace** the generated section appended in Step 5 with this run's `CodeGen_Run_*.sql` output (same rule: hand DDL,
≥ 50 blank lines, the comment block, then the generated tail), and delete the standalone `CodeGen_Run_*.sql`.

Run:
```bash
grep -cE "CREATE PROCEDURE \[?__mj\]?\.\[?(spCreate|spUpdate|spDelete)WorkQueue(Message|Delivery|PartitionState|Deduplication)\]?" migrations/v6/*Add_Work_Queue_Schema.sql
```
Expected: `0` — no CRUD procedures for the four driver-owned entities. (`spCreate/spUpdate/spDelete` for Transports,
Topics and Subscriptions are expected and stay.)

Run: `node .github/scripts/check-migration-entityfield-sequence.mjs`
Expected: exits 0 (re-check after replacing the generated tail).

Run: `pnpm exec mj codegen --skipdb`
Expected: completes; regenerates TypeScript only.

- [ ] **Step 10: Verify the generated entity names**

Run:
```bash
grep -oE "@RegisterClass\(BaseEntity, 'MJ: Work Queue[^']*'\)" packages/MJCoreEntities/src/generated/entities/__mj.ts | sort
grep -oE "export class MJWorkQueue[A-Za-z]*Entity " packages/MJCoreEntities/src/generated/entities/__mj.ts | sort
```
Expected — exactly these lines:
```
@RegisterClass(BaseEntity, 'MJ: Work Queue Deduplications')
@RegisterClass(BaseEntity, 'MJ: Work Queue Deliveries')
@RegisterClass(BaseEntity, 'MJ: Work Queue Messages')
@RegisterClass(BaseEntity, 'MJ: Work Queue Partition States')
@RegisterClass(BaseEntity, 'MJ: Work Queue Subscriptions')
@RegisterClass(BaseEntity, 'MJ: Work Queue Topics')
@RegisterClass(BaseEntity, 'MJ: Work Queue Transports')
export class MJWorkQueueDeduplicationEntity 
export class MJWorkQueueDeliveryEntity 
export class MJWorkQueueMessageEntity 
export class MJWorkQueuePartitionStateEntity 
export class MJWorkQueueSubscriptionEntity 
export class MJWorkQueueTopicEntity 
export class MJWorkQueueTransportEntity 
```
If any name differs, record the actual names; Task 2 puts them in `WorkQueueEntityNames` and Tasks 10–13 import the class names — change them there only.

Run: `grep -n "get OrderingMode\|get PartitionMode\|get HeartbeatMode\|get HostType" packages/MJCoreEntities/src/generated/entities/__mj.ts | head`
Expected: generated union getters exist (for example `'PublishOrder' | 'ExplicitSequence'`), confirming the CHECK constraints were read.

Run:
```bash
grep -rlE "WorkQueue(Message|Delivery|PartitionState|Deduplication)" packages/MJServer/src/generated | xargs grep -lE "@Mutation" 2>/dev/null | wc -l
```
Expected: `0` — the driver-owned entities expose no GraphQL mutations.

Run: `cd packages/MJCoreEntities && pnpm run build`
Expected: builds.

- [ ] **Step 11: Commit**

```bash
git add migrations/v6/*Add_Work_Queue_Schema.sql metadata/entities/.work-queue-entities.json \
  metadata/api-scopes/.workqueue-scopes.json metadata/work-queue-transports \
  packages/MJCoreEntities/src/generated packages/MJServer/src/generated
git commit -m "feat(work-queue): schema, entities, API scopes and Database transport seed"
```

---
### Task 2: Base + engine scaffolds, SQL executor seam, execution helpers and test fakes

**Files:**
- Create: `packages/WorkQueue/base/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/WorkQueue/base/src/index.ts`, `src/constants.ts`, `src/json.ts`
- Create: `packages/WorkQueue/base/src/__tests__/dependencyGuard.test.ts`
- Create: `packages/WorkQueue/engine/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/WorkQueue/engine/src/index.ts`, `src/constants.ts`
- Create: `packages/WorkQueue/engine/src/sql/WorkQueueSqlExecutor.ts`, `src/sql/SqlParamList.ts`, `src/sql/sqlExecution.ts`
- Create: `packages/WorkQueue/engine/src/__tests__/fakes.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/sqlExecution.test.ts`

**Interfaces:**
- Consumes: entity names verified in Task 1.
- Produces (base — `@memberjunction/work-queue-base`):
  - Constants `WorkQueueEntityNames`, `DATABASE_DRIVER_CLASS = 'Database'` (the engine re-exports both, so existing imports from `@memberjunction/work-queue-engine` keep working)
  - `IsWorkJson(value: unknown): value is WorkJson` (both tiers validate JSON columns; the engine's `rowMapping` re-exports it)
- Produces (engine):
  - `type SqlParam = string | number | boolean | Date | null`; `interface SqlStatement { SQL: string; Params: SqlParam[] }`
  - `interface WorkQueueSqlExecutor` (03 §11 plus `BuildParameterPlaceholder(index: number): string`), `interface WorkQueueTransactionalExecutor extends WorkQueueSqlExecutor { BeginEntityTransaction(): Promise<EntityTransactionScope> }`, `interface WorkQueueIndependentExecutor extends WorkQueueTransactionalExecutor { ReleaseIndependentInstance(): Promise<void> }`, `interface WorkQueueExecutorSource extends WorkQueueTransactionalExecutor { CreateIndependentInstance(): Promise<WorkQueueIndependentExecutor> }`, `type SqlBuilderContext = Pick<WorkQueueSqlExecutor, 'MJCoreSchemaName' | 'QuoteIdentifier' | 'BuildParameterPlaceholder'>`
  - `IsWorkQueueTransactionalExecutor(value: object | null | undefined): value is WorkQueueTransactionalExecutor`, `IsWorkQueueExecutorSource(value: object | null | undefined): value is WorkQueueExecutorSource`
  - `class SqlParamList { constructor(context: Pick<SqlBuilderContext, 'BuildParameterPlaceholder'>); Add(value: SqlParam): string; get Values(): SqlParam[] }`
  - `QualifiedTable(context: SqlBuilderContext, table: string): string`, `ExecuteWrite(executor: WorkQueueSqlExecutor, statement: SqlStatement, contextUser: UserInfo): Promise<number>`, `ExecuteRows<T>(executor: WorkQueueSqlExecutor, statement: SqlStatement, contextUser: UserInfo): Promise<T[]>`, `IsUniqueViolation(error: unknown, indexName: string): boolean`, `IsTransientDatabaseError(error: unknown): boolean`, `ToNumber(value: number | string | bigint | null | undefined): number | null`, `ToBoolean(value: boolean | number | string | null | undefined): boolean`, `ToIsoString(value: Date | string | null | undefined): string | null`, `ErrorText(error: unknown): string`
  - Constants `WorkQueueTables`, `type WorkQueueTableName`, `IN_FLIGHT_PARTITION_INDEX`, `MESSAGE_SEQUENCE_INDEX`, `DEDUPLICATION_KEY_INDEX`, `DEDUP_RESERVATION_SECONDS = 120`, `DELIVERY_INSERT_CHUNK = 250`, plus `export { WorkQueueEntityNames, DATABASE_DRIVER_CLASS } from '@memberjunction/work-queue-base'`
  - Test fakes: `class RecordingExecutor implements WorkQueueExecutorSource, WorkQueueIndependentExecutor` (`Calls`, `Events`, `QueueRows(rows)`, `QueueError(error)`), `TEST_USER`

- [ ] **Step 1: Create the base package files**

`packages/WorkQueue/base/package.json`:

```json
{
  "name": "@memberjunction/work-queue-base",
  "type": "module",
  "version": "6.1.0",
  "description": "MemberJunction: durable work queue — browser-safe metadata tier (topology cache, bindings, validation)",
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
    "@memberjunction/core": "6.1.0",
    "@memberjunction/core-entities": "6.1.0",
    "@memberjunction/global": "6.1.0",
    "@memberjunction/work-queue-core": "6.1.0"
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

`packages/WorkQueue/base/tsconfig.json` and `vitest.config.ts` are the same shape as the engine's below (both extend
`../../../tsconfig.server.json`; the base package compiles without DOM or Node globals because it uses neither).

`packages/WorkQueue/base/src/constants.ts`:

```typescript
/** Generated entity names for the work-queue tables (Task 1). Verify against the generated entity subclasses. */
export const WorkQueueEntityNames = {
    Transports: 'MJ: Work Queue Transports',
    Topics: 'MJ: Work Queue Topics',
    Subscriptions: 'MJ: Work Queue Subscriptions',
    Messages: 'MJ: Work Queue Messages',
    Deliveries: 'MJ: Work Queue Deliveries',
    PartitionStates: 'MJ: Work Queue Partition States',
    Deduplications: 'MJ: Work Queue Deduplications',
} as const;

/** Transport.DriverClass of the built-in Database transport. */
export const DATABASE_DRIVER_CLASS = 'Database';
```

`packages/WorkQueue/base/src/json.ts`:

```typescript
import type { WorkJson } from '@memberjunction/work-queue-core';

/** True when a parsed value is JSON-safe for a work-queue payload or config column. */
export function IsWorkJson(value: unknown): value is WorkJson {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return true;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    if (Array.isArray(value)) {
        return value.every(IsWorkJson);
    }
    if (typeof value === 'object') {
        return Object.values(value).every(IsWorkJson);
    }
    return false;
}
```

`packages/WorkQueue/base/src/index.ts`:

```typescript
export * from './constants';
export * from './json';
```

- [ ] **Step 1b: Write the base dependency-guard test**

`packages/WorkQueue/base/src/__tests__/dependencyGuard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = new Set([
    '@memberjunction/core', '@memberjunction/core-entities', '@memberjunction/global', '@memberjunction/work-queue-core',
]);

function SourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(entry => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            return entry === '__tests__' ? [] : SourceFiles(full);
        }
        return full.endsWith('.ts') ? [full] : [];
    });
}

describe('work-queue-base dependency guard', () => {
    it('declares only browser-safe MemberJunction dependencies', () => {
        const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
            dependencies?: Record<string, string>;
        };
        for (const name of Object.keys(pkg.dependencies ?? {})) {
            expect(ALLOWED.has(name), `unexpected dependency ${name}`).toBe(true);
        }
    });

    it('imports nothing server-only (node builtins, sql-dialect, drivers)', () => {
        const offenders: string[] = [];
        for (const file of SourceFiles(new URL('../', import.meta.url).pathname)) {
            const text = readFileSync(file, 'utf8');
            if (/from '(node:|@memberjunction\/sql-dialect|@memberjunction\/work-queue-engine)/.test(text)) {
                offenders.push(file);
            }
        }
        expect(offenders).toEqual([]);
    });
});
```

- [ ] **Step 1c: Create the engine package files**

`packages/WorkQueue/engine/package.json`:

```json
{
  "name": "@memberjunction/work-queue-engine",
  "type": "module",
  "version": "6.1.0",
  "description": "MemberJunction: durable work queue — engine, Database transport and SQL builders",
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
    "@memberjunction/core": "6.1.0",
    "@memberjunction/core-entities": "6.1.0",
    "@memberjunction/global": "6.1.0",
    "@memberjunction/sql-dialect": "6.1.0",
    "@memberjunction/work-queue-base": "6.1.0",
    "@memberjunction/work-queue-core": "6.1.0"
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

If `packages/MJCore/package.json` shows a different version, use it for `version` and every `@memberjunction/*` entry.

`packages/WorkQueue/engine/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.server.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "src/__tests__", "vitest.config.ts"]
}
```

`packages/WorkQueue/engine/vitest.config.ts`:

```typescript
import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';

export default mergeConfig(sharedConfig, defineProject({ test: { environment: 'node' } }));
```

Run: `pnpm install` (repository root)
Expected: installs; `@memberjunction/work-queue-base` links `@memberjunction/work-queue-core`, and `@memberjunction/work-queue-engine` links both from the workspace.

Run: `cd packages/WorkQueue/base && pnpm test && pnpm run build`
Expected: the dependency-guard suite passes (2) and the package builds. Build `base` before `engine` from here on.

- [ ] **Step 2: Write `src/constants.ts`**

```typescript
/** Physical table names (03 §6). */
export const WorkQueueTables = {
    Transport: 'WorkQueueTransport',
    Topic: 'WorkQueueTopic',
    Subscription: 'WorkQueueSubscription',
    Message: 'WorkQueueMessage',
    Delivery: 'WorkQueueDelivery',
    PartitionState: 'WorkQueuePartitionState',
    Deduplication: 'WorkQueueDeduplication',
} as const;

export type WorkQueueTableName = typeof WorkQueueTables[keyof typeof WorkQueueTables];

/**
 * Entity names and the Database DriverClass live in `@memberjunction/work-queue-base` (both tiers need them).
 * Re-exported here so server-side imports keep working. If CodeGen produced different entity names in Task 1,
 * change them in the base package only.
 */
export { DATABASE_DRIVER_CLASS, WorkQueueEntityNames } from '@memberjunction/work-queue-base';

/** Unique index enforcing one in-flight delivery per (subscription, partition key). */
export const IN_FLIGHT_PARTITION_INDEX = 'UQ_WorkQueueDelivery_InFlightPartition';

/** Unique index enforcing one message per (topic, partition key, sequence). */
export const MESSAGE_SEQUENCE_INDEX = 'UQ_WorkQueueMessage_Topic_Key_Sequence';

/** Unique constraint enforcing one ledger row per (topic, deduplication key). */
export const DEDUPLICATION_KEY_INDEX = 'UQ_WorkQueueDeduplication_Topic_Key';

/** Lifetime of a Reserved ledger row while a cloud send is in progress (03 §2.1). */
export const DEDUP_RESERVATION_SECONDS = 120;

/** Deliveries per INSERT statement (4 bound values per row, well under SQL Server's 2,100 parameter limit). */
export const DELIVERY_INSERT_CHUNK = 250;
```

- [ ] **Step 3: Write `src/sql/WorkQueueSqlExecutor.ts`**

```typescript
import type { EntityTransactionScope, ExecuteSQLOptions, UserInfo } from '@memberjunction/core';
import type { DatabasePlatform, SQLDialect } from '@memberjunction/sql-dialect';

/** A value bound to a SQL placeholder. */
export type SqlParam = string | number | boolean | Date | null;

export interface SqlStatement {
    SQL: string;
    Params: SqlParam[];
}

/** The slice of DatabaseProviderBase the work queue needs. DatabaseProviderBase satisfies it structurally. */
export interface WorkQueueSqlExecutor {
    readonly PlatformKey: DatabasePlatform;
    readonly MJCoreSchemaName: string;
    readonly Dialect: SQLDialect;
    QuoteIdentifier(name: string): string;
    BuildParameterPlaceholder(index: number): string;
    ExecuteSQL<T>(sql: string, parameters?: SqlParam[], options?: ExecuteSQLOptions, contextUser?: UserInfo): Promise<T[]>;
}

/** An executor whose statements can join a provider-arbitrated transaction. */
export interface WorkQueueTransactionalExecutor extends WorkQueueSqlExecutor {
    BeginEntityTransaction(): Promise<EntityTransactionScope>;
}

/** An executor with its own transaction stack over a shared pool; must be released after use. */
export interface WorkQueueIndependentExecutor extends WorkQueueTransactionalExecutor {
    ReleaseIndependentInstance(): Promise<void>;
}

/** A long-lived executor that can mint independent executors for isolated transactions. */
export interface WorkQueueExecutorSource extends WorkQueueTransactionalExecutor {
    CreateIndependentInstance(): Promise<WorkQueueIndependentExecutor>;
}

/** What a statement builder needs: quoting, schema and placeholders — never execution. */
export type SqlBuilderContext = Pick<WorkQueueSqlExecutor, 'MJCoreSchemaName' | 'QuoteIdentifier' | 'BuildParameterPlaceholder'>;

export function IsWorkQueueTransactionalExecutor(value: object | null | undefined): value is WorkQueueTransactionalExecutor {
    return value != null
        && 'ExecuteSQL' in value && typeof value.ExecuteSQL === 'function'
        && 'BeginEntityTransaction' in value && typeof value.BeginEntityTransaction === 'function'
        && 'BuildParameterPlaceholder' in value && typeof value.BuildParameterPlaceholder === 'function'
        && 'QuoteIdentifier' in value && typeof value.QuoteIdentifier === 'function'
        && 'Dialect' in value && value.Dialect != null
        && 'MJCoreSchemaName' in value && typeof value.MJCoreSchemaName === 'string';
}

export function IsWorkQueueExecutorSource(value: object | null | undefined): value is WorkQueueExecutorSource {
    return IsWorkQueueTransactionalExecutor(value)
        && 'CreateIndependentInstance' in value && typeof value.CreateIndependentInstance === 'function';
}
```

- [ ] **Step 4: Write `src/sql/SqlParamList.ts`**

```typescript
import type { SqlBuilderContext, SqlParam } from './WorkQueueSqlExecutor';

/** Accumulates bound values and hands back the provider's placeholder for each. */
export class SqlParamList {
    private readonly values: SqlParam[] = [];

    constructor(private readonly context: Pick<SqlBuilderContext, 'BuildParameterPlaceholder'>) {}

    /** Binds a value and returns its placeholder. A placeholder may be repeated in the SQL text. */
    public Add(value: SqlParam): string {
        const placeholder = this.context.BuildParameterPlaceholder(this.values.length);
        this.values.push(value);
        return placeholder;
    }

    public get Values(): SqlParam[] {
        return [...this.values];
    }
}
```

- [ ] **Step 5: Write `src/sql/sqlExecution.ts`**

```typescript
import type { UserInfo } from '@memberjunction/core';
import type { SqlBuilderContext, SqlStatement, WorkQueueSqlExecutor } from './WorkQueueSqlExecutor';

interface AffectedRowsRow {
    AffectedRows: number | string | null;
}

export function QualifiedTable(context: SqlBuilderContext, table: string): string {
    return `${context.QuoteIdentifier(context.MJCoreSchemaName)}.${context.QuoteIdentifier(table)}`;
}

/** Runs a bare INSERT, UPDATE or DELETE and returns the affected-row count, read back as data. */
export async function ExecuteWrite(executor: WorkQueueSqlExecutor, statement: SqlStatement, contextUser: UserInfo): Promise<number> {
    const rows = await executor.ExecuteSQL<AffectedRowsRow>(
        executor.Dialect.AffectedRowCountSQL(statement.SQL, 'AffectedRows'),
        statement.Params,
        { isMutation: true },
        contextUser,
    );
    return ToNumber(rows[0]?.AffectedRows) ?? 0;
}

/** Runs a statement that ends in exactly one result set and returns its rows. */
export async function ExecuteRows<T>(executor: WorkQueueSqlExecutor, statement: SqlStatement, contextUser: UserInfo): Promise<T[]> {
    const rows = await executor.ExecuteSQL<T>(statement.SQL, statement.Params, { isMutation: true }, contextUser);
    return rows ?? [];
}

/** True when a database error is a unique-constraint violation naming the given index or constraint. */
export function IsUniqueViolation(error: unknown, indexName: string): boolean {
    return ErrorText(error).includes(indexName);
}

/** Deadlocks, serialization failures and lock timeouts: safe to retry the whole operation. */
export function IsTransientDatabaseError(error: unknown): boolean {
    const text = ErrorText(error).toLowerCase();
    return text.includes('deadlock')
        || text.includes('40p01')
        || text.includes('40001')
        || text.includes('could not serialize')
        || text.includes('lock request time out');
}

export function ErrorText(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return typeof error === 'string' ? error : JSON.stringify(error);
}

/** BIGINT columns arrive as strings from the SQL Server driver; normalise to numbers. */
export function ToNumber(value: number | string | bigint | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

/** BIT columns arrive as booleans or 0/1 depending on the driver. */
export function ToBoolean(value: boolean | number | string | null | undefined): boolean {
    return value === true || value === 1 || value === '1' || value === 'true';
}

export function ToIsoString(value: Date | string | null | undefined): string | null {
    if (value === null || value === undefined) {
        return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
```

- [ ] **Step 6: Write the test fakes**

`packages/WorkQueue/engine/src/__tests__/fakes.ts`:

```typescript
import { PostgreSQLDialect, SQLServerDialect } from '@memberjunction/sql-dialect';
import type { DatabasePlatform, SQLDialect } from '@memberjunction/sql-dialect';
import type { EntityTransactionScope, ExecuteSQLOptions, UserInfo } from '@memberjunction/core';
import type { SqlParam, WorkQueueExecutorSource, WorkQueueIndependentExecutor } from '../sql/WorkQueueSqlExecutor';

export interface RecordedCall {
    SQL: string;
    Params: SqlParam[];
    Options?: ExecuteSQLOptions;
}

type QueuedResponse = { Kind: 'Rows'; Rows: object[] } | { Kind: 'Error'; Error: Error };

/**
 * Records every statement and answers with queued row sets (or errors) in order. An empty queue answers
 * with no rows. Transactions and independent instances are recorded in Events.
 */
export class RecordingExecutor implements WorkQueueExecutorSource, WorkQueueIndependentExecutor {
    public readonly Calls: RecordedCall[] = [];
    public readonly Events: string[] = [];
    public readonly MJCoreSchemaName = '__mj';
    public readonly Dialect: SQLDialect;
    private readonly responses: QueuedResponse[] = [];

    constructor(public readonly PlatformKey: DatabasePlatform = 'sqlserver') {
        this.Dialect = PlatformKey === 'sqlserver' ? new SQLServerDialect() : new PostgreSQLDialect();
    }

    public QuoteIdentifier(name: string): string {
        return this.PlatformKey === 'sqlserver' ? `[${name}]` : `"${name}"`;
    }

    public BuildParameterPlaceholder(index: number): string {
        return this.PlatformKey === 'sqlserver' ? `@p${index}` : `$${index + 1}`;
    }

    public QueueRows(rows: object[]): this {
        this.responses.push({ Kind: 'Rows', Rows: rows });
        return this;
    }

    public QueueError(error: Error): this {
        this.responses.push({ Kind: 'Error', Error: error });
        return this;
    }

    public async ExecuteSQL<T>(sql: string, parameters?: SqlParam[], options?: ExecuteSQLOptions): Promise<T[]> {
        this.Calls.push({ SQL: sql, Params: parameters ?? [], Options: options });
        const next = this.responses.shift();
        if (!next) {
            return [];
        }
        if (next.Kind === 'Error') {
            throw next.Error;
        }
        return next.Rows as T[];
    }

    public async BeginEntityTransaction(): Promise<EntityTransactionScope> {
        this.Events.push('begin');
        let settled = false;
        return {
            IsNested: false,
            Commit: async () => {
                if (!settled) {
                    settled = true;
                    this.Events.push('commit');
                }
            },
            Rollback: async () => {
                if (!settled) {
                    settled = true;
                    this.Events.push('rollback');
                }
            },
        };
    }

    public async CreateIndependentInstance(): Promise<WorkQueueIndependentExecutor> {
        this.Events.push('independent');
        return this;
    }

    public async ReleaseIndependentInstance(): Promise<void> {
        this.Events.push('release');
    }
}

export const TEST_USER = {} as UserInfo;
```

- [ ] **Step 7: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/sqlExecution.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
    ErrorText, ExecuteRows, ExecuteWrite, IsTransientDatabaseError, IsUniqueViolation,
    QualifiedTable, ToBoolean, ToIsoString, ToNumber,
} from '../sql/sqlExecution';
import { SqlParamList } from '../sql/SqlParamList';
import { IsWorkQueueExecutorSource, IsWorkQueueTransactionalExecutor } from '../sql/WorkQueueSqlExecutor';
import { RecordingExecutor, TEST_USER } from './fakes';

describe('QualifiedTable', () => {
    it('qualifies a table with the core schema on both platforms', () => {
        expect(QualifiedTable(new RecordingExecutor(), 'WorkQueueDelivery')).toBe('[__mj].[WorkQueueDelivery]');
        expect(QualifiedTable(new RecordingExecutor('postgresql'), 'WorkQueueDelivery')).toBe('"__mj"."WorkQueueDelivery"');
    });
});

describe('ExecuteWrite', () => {
    it('wraps a SQL Server write in @@ROWCOUNT and returns the count', async () => {
        const executor = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]);
        const count = await ExecuteWrite(executor, { SQL: 'UPDATE t SET a = @p0', Params: [5] }, TEST_USER);
        expect(count).toBe(1);
        expect(executor.Calls[0].SQL).toContain('SELECT @@ROWCOUNT AS');
        expect(executor.Calls[0].Params).toEqual([5]);
        expect(executor.Calls[0].Options).toEqual({ isMutation: true });
    });

    it('wraps a PostgreSQL write in a counting CTE', async () => {
        const executor = new RecordingExecutor('postgresql').QueueRows([{ AffectedRows: '2' }]);
        const count = await ExecuteWrite(executor, { SQL: 'UPDATE t SET a = $1', Params: [5] }, TEST_USER);
        expect(count).toBe(2);
        expect(executor.Calls[0].SQL).toContain('RETURNING 1');
    });

    it('returns zero when no rows come back', async () => {
        expect(await ExecuteWrite(new RecordingExecutor(), { SQL: 'DELETE FROM t', Params: [] }, TEST_USER)).toBe(0);
    });
});

describe('ExecuteRows', () => {
    it('returns rows unchanged', async () => {
        const executor = new RecordingExecutor().QueueRows([{ DeliveryID: 'a' }]);
        expect(await ExecuteRows(executor, { SQL: 'SELECT 1', Params: [] }, TEST_USER)).toEqual([{ DeliveryID: 'a' }]);
    });

    it('propagates execution errors', async () => {
        const executor = new RecordingExecutor().QueueError(new Error('boom'));
        await expect(ExecuteRows(executor, { SQL: 'SELECT 1', Params: [] }, TEST_USER)).rejects.toThrow('boom');
    });
});

describe('error classification', () => {
    it('recognises a unique violation by index name', () => {
        const error = new Error("Cannot insert duplicate key row in object with unique index 'UQ_WorkQueueDelivery_InFlightPartition'");
        expect(IsUniqueViolation(error, 'UQ_WorkQueueDelivery_InFlightPartition')).toBe(true);
        expect(IsUniqueViolation(new Error('deadlock victim'), 'UQ_WorkQueueDelivery_InFlightPartition')).toBe(false);
    });

    it('classifies deadlocks and serialization failures as transient', () => {
        expect(IsTransientDatabaseError(new Error('Transaction was deadlocked on lock resources'))).toBe(true);
        expect(IsTransientDatabaseError(new Error('ERROR 40P01: deadlock detected'))).toBe(true);
        expect(IsTransientDatabaseError(new Error('could not serialize access'))).toBe(true);
        expect(IsTransientDatabaseError(new Error('syntax error'))).toBe(false);
    });

    it('renders error text from errors, strings and objects', () => {
        expect(ErrorText(new Error('x'))).toBe('x');
        expect(ErrorText('y')).toBe('y');
        expect(ErrorText({ code: 1 })).toBe('{"code":1}');
    });
});

describe('value conversion', () => {
    it('normalises numbers from strings and bigints', () => {
        expect(ToNumber('42')).toBe(42);
        expect(ToNumber(BigInt(7))).toBe(7);
        expect(ToNumber(null)).toBeNull();
        expect(ToNumber('')).toBeNull();
        expect(ToNumber('abc')).toBeNull();
    });

    it('normalises bit values', () => {
        expect(ToBoolean(true)).toBe(true);
        expect(ToBoolean(1)).toBe(true);
        expect(ToBoolean('1')).toBe(true);
        expect(ToBoolean(0)).toBe(false);
        expect(ToBoolean(null)).toBe(false);
    });

    it('renders timestamps as ISO strings', () => {
        expect(ToIsoString(new Date('2026-01-02T03:04:05.000Z'))).toBe('2026-01-02T03:04:05.000Z');
        expect(ToIsoString('2026-01-02T03:04:05Z')).toBe('2026-01-02T03:04:05.000Z');
        expect(ToIsoString(null)).toBeNull();
        expect(ToIsoString('not a date')).toBeNull();
    });
});

describe('SqlParamList', () => {
    it('hands out placeholders in order', () => {
        const params = new SqlParamList(new RecordingExecutor('postgresql'));
        expect(params.Add('a')).toBe('$1');
        expect(params.Add(2)).toBe('$2');
        expect(params.Values).toEqual(['a', 2]);
    });
});

describe('executor type guards', () => {
    it('accepts an executor with transactions and independent instances', () => {
        const executor = new RecordingExecutor();
        expect(IsWorkQueueTransactionalExecutor(executor)).toBe(true);
        expect(IsWorkQueueExecutorSource(executor)).toBe(true);
    });

    it('rejects objects that are not database providers', () => {
        expect(IsWorkQueueTransactionalExecutor({ ExecuteSQL: () => [] })).toBe(false);
        expect(IsWorkQueueExecutorSource(null)).toBe(false);
    });
});
```

- [ ] **Step 8: Run the tests to verify they fail**

Order note: write Step 6 (fakes) and Step 7 (tests) **before** Steps 2–5 so this run is meaningful.

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: FAIL — unresolved imports `../sql/sqlExecution`, `../sql/SqlParamList`, `../sql/WorkQueueSqlExecutor`. Then write Steps 2–5.

- [ ] **Step 9: Write `src/index.ts`**

```typescript
export * from './constants';
export * from './sql/WorkQueueSqlExecutor';
export * from './sql/SqlParamList';
export * from './sql/sqlExecution';
```

- [ ] **Step 10: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — sqlExecution (15).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds with no errors.

- [ ] **Step 11: Commit**

```bash
git add packages/WorkQueue/engine pnpm-lock.yaml
git commit -m "feat(work-queue-engine): package scaffold, SQL executor seam and execution helpers"
```

---

### Task 3: Row types, builder interfaces, SQL Server publish and ledger statements

**Files:**
- Create: `packages/WorkQueue/engine/src/sql/rows.ts`, `src/sql/WorkQueueSqlBuilder.ts`, `src/sql/StatementBase.ts`
- Create: `packages/WorkQueue/engine/src/sql/sqlserver/SqlServerPublishSql.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/SqlServerPublishSql.test.ts`

**Interfaces:**
- Consumes: `SqlStatement`, `SqlParam`, `SqlBuilderContext`, `SqlParamList`, `QualifiedTable`, `WorkQueueTables`, `WorkQueueTableName`, `DELIVERY_INSERT_CHUNK` (Task 2); `PartitionCondition` from `@memberjunction/work-queue-core`.
- Produces:
  - Row types in `rows.ts`: `MessageInsertRow`, `MessageInsertOutcomeRow`, `DeliveryInsertRow`, `ReservationRow`, `ClaimedDeliveryRow`, `PartitionCandidateRow`, `CompletedDeliveryRow`, `SequenceMarkRow`, `StatsRow`, `DeadLetterRow`, `PartitionRow`, `DiscardedDeliveryRow`, `BacklogRow`, `DeadLetterCursor`, `type ClaimPartitionMode = 'Exclusive' | 'Ordered'`, `type BacklogPartitionMode = ClaimPartitionMode | 'None'`
  - Interfaces `PublishSqlBuilder`, `ConsumeSqlBuilder`, `OperatorSqlBuilder`, `WorkQueueSqlBuilder { readonly Publish; readonly Consume; readonly Operator }` (method list below — Tasks 4–6 implement them)
  - `PublishOrderLockResource(topicID: string, partitionKey: string): string`
  - `abstract class StatementBase { constructor(context: SqlBuilderContext) }`
  - `class SqlServerPublishSql extends StatementBase implements PublishSqlBuilder`

Builder method contract (row-returning methods say so; every other method returns a bare guarded write for `ExecuteWrite`):

| Interface | Method | Returns |
| --- | --- | --- |
| Publish | `AcquirePublishOrderLock(topicID, partitionKey)` | rows `{ LockResult }` |
| Publish | `InsertMessage(row: MessageInsertRow)` | rows `MessageInsertOutcomeRow` (0–2) |
| Publish | `InsertDeliveries(rows: DeliveryInsertRow[])` | write |
| Publish | `EnsureSequenceState(subscriptionID, partitionKey)` | write |
| Publish | `DeleteExpiredDeduplicationKey(topicID, key)` | write |
| Publish | `ReserveDeduplication(topicID, key, messageID, reserveSeconds)` | rows `ReservationRow` (0–1) |
| Publish | `ConfirmDeduplication(topicID, key, messageID, ttlSeconds)` | write |
| Publish | `ReleaseDeduplication(topicID, key, messageID)` | write |
| Publish | `PurgeExpiredDeduplications(batchSize)` | write |
| Consume | `ExpireLeases(subscriptionID, maxAttempts)` | rows `ExpiredDeadLetterRow` (0–n) |
| Consume | `SubscriptionBacklog(subscriptionID, mode, explicitSequence)` | rows `BacklogRow` (exactly 1) |
| Consume | `ClaimUnpartitioned(subscriptionID, leaseOwner, leaseSeconds, maxRows)` | rows `ClaimedDeliveryRow` |
| Consume | `SelectPartitionCandidates(subscriptionID, mode, explicitSequence, maxRows)` | rows `PartitionCandidateRow` |
| Consume | `ClaimPartitionCandidate(subscriptionID, deliveryID, mode, explicitSequence, leaseOwner, leaseSeconds)` | rows `ClaimedDeliveryRow` (0–1) |
| Consume | `MarkAwaitingSequence(subscriptionID)` / `ClearAwaitingSequence(subscriptionID)` | write |
| Consume | `ExtendLease(deliveryID, leaseToken, leaseSeconds, progressJSON)` | write |
| Consume | `CompleteDelivery(deliveryID, leaseToken)` | rows `CompletedDeliveryRow` (0–1) |
| Consume | `RetryDelivery(deliveryID, leaseToken, delaySeconds, error)` | write |
| Consume | `DeadLetterDelivery(deliveryID, leaseToken, reason, error)` | write |
| Consume | `ReleaseDelivery(deliveryID, leaseToken)` | write |
| Consume | `AdvanceSequenceMark(subscriptionID, partitionKey)` | rows `SequenceMarkRow` (0–1) |
| Consume | `ShiftTimestampsForConformance(subscriptionID, seconds)` | write |
| Operator | `SubscriptionStats(subscriptionID, ordered)` | rows `StatsRow` (1) |
| Operator | `ListDeadLetters(subscriptionID, ordered, after, pageSize)` | rows `DeadLetterRow` |
| Operator | `ListPartitions(subscriptionID, ordered, condition, afterPartitionKey, pageSize)` | rows `PartitionRow` |
| Operator | `ReplayDelivery(subscriptionID, deliveryID, actorUserID, note)` | write |
| Operator | `DiscardDelivery(subscriptionID, deliveryID, allowPending, actorUserID, reason)` | rows `DiscardedDeliveryRow` (0–1) |
| Operator | `CancelInFlightDelivery(subscriptionID, deliveryID, actorUserID, reason)` | write (1 = lease revoked) |
| Operator | `SkipSequence(subscriptionID, partitionKey, sequence)` | write |
| Operator | `ExpireLeasesAll()` | rows `ExpiredDeadLetterRow` (0–n) |
| Operator | `FlagGapStalls()` / `DiscardSkippedSequences()` | write |
| Operator | `PurgeTerminalDeliveries(batchSize)` / `PurgeOrphanMessages(batchSize)` | write |

- [ ] **Step 1: Write `src/sql/rows.ts`**

```typescript
import type { PartitionCondition } from '@memberjunction/work-queue-core';

/** Values for one WorkQueueMessage insert. JSON columns are pre-serialised. */
export interface MessageInsertRow {
    ID: string;
    TopicID: string;
    PartitionKey: string | null;
    Sequence: number | null;
    AttributesJSON: string | null;
    PayloadJSON: string | null;
    PayloadRefJSON: string | null;
    CorrelationID: string | null;
    PublishedAt: Date;
    PublishedByUserID: string | null;
}

/** 'Inserted' carries the new PublishOrdinal; 'Exists' carries the conflicting row (same ID, or same topic/key/sequence). */
export interface MessageInsertOutcomeRow {
    Outcome: 'Inserted' | 'Exists';
    ID: string;
    PublishOrdinal: number | string | null;
    TopicID: string | null;
    PartitionKey: string | null;
    Sequence: number | string | null;
    Attributes: string | null;
    Payload: string | null;
    PayloadRef: string | null;
    CorrelationID: string | null;
}

export interface DeliveryInsertRow {
    MessageID: string;
    SubscriptionID: string;
    /** Only for Exclusive/Ordered subscriptions; null otherwise. */
    PartitionKey: string | null;
    OrderKey: number;
}

/** Inserted true = this call reserved the key; false = MessageID already owns it. */
export interface ReservationRow {
    MessageID: string;
    Inserted: boolean | number;
}

export interface ClaimedDeliveryRow {
    DeliveryID: string;
    AttemptCount: number | string;
    LeaseToken: string;
    LeaseExpiresAt: Date | string;
    IsReplay: boolean | number;
    MessageID: string;
    PartitionKey: string | null;
    Sequence: number | string | null;
    Attributes: string | null;
    Payload: string | null;
    PayloadRef: string | null;
    CorrelationID: string | null;
    PublishedAt: Date | string;
}

export interface PartitionCandidateRow {
    DeliveryID: string;
    PartitionKey: string;
}

export interface CompletedDeliveryRow {
    SubscriptionID: string;
    PartitionKey: string | null;
    OrderKey: number | string;
}

export interface SequenceMarkRow {
    LastCompletedSequence: number | string | null;
}

export interface StatsRow {
    Pending: number | string | null;
    InFlight: number | string | null;
    DeadLettered: number | string | null;
    BlockedKeys: number | string | null;
    OldestPendingAgeSeconds: number | string | null;
    CompletedLastHour: number | string | null;
}

export interface DeadLetterRow {
    DeliveryID: string;
    AttemptCount: number | string;
    DeadLetterReason: string | null;
    LastError: string | null;
    DeadLetteredAt: Date | string | null;
    DeliveryPartitionKey: string | null;
    BlocksKey: boolean | number;
    MessageID: string;
    PartitionKey: string | null;
    Sequence: number | string | null;
    Attributes: string | null;
    Payload: string | null;
    PayloadRef: string | null;
    CorrelationID: string | null;
    PublishedAt: Date | string;
}

export interface PartitionRow {
    PartitionKey: string;
    Condition: PartitionCondition;
    HeadDeliveryID: string | null;
    LastCompletedSequence: number | string | null;
    AwaitingSequenceSince: Date | string | null;
    WaitingItems: number | string;
}

export interface DiscardedDeliveryRow {
    PartitionKey: string | null;
    OrderKey: number | string;
}

/** A delivery that an expire pass moved to DeadLettered; feeds the engine's OnDeadLettered seam (03 §11). */
export interface ExpiredDeadLetterRow {
    DeliveryID: string;
    SubscriptionID: string;
    PartitionKey: string | null;
}

/** One row from SubscriptionBacklog: the autoscaler metric (03 §11). */
export interface BacklogRow {
    Claimable: number | string;
    InFlight: number | string;
}

/** Keyset position for ListDeadLetters (ordered by delivery ID, which is stable and unique). */
export interface DeadLetterCursor {
    DeliveryID: string;
}

export type ClaimPartitionMode = 'Exclusive' | 'Ordered';
export type BacklogPartitionMode = ClaimPartitionMode | 'None';
```

- [ ] **Step 2: Write `src/sql/WorkQueueSqlBuilder.ts`**

```typescript
import type { PartitionCondition } from '@memberjunction/work-queue-core';
import type { SqlStatement } from './WorkQueueSqlExecutor';
import type { ClaimPartitionMode, DeadLetterCursor, DeliveryInsertRow, MessageInsertRow } from './rows';

/** Statements used while publishing and by the deduplication ledger. */
export interface PublishSqlBuilder {
    AcquirePublishOrderLock(topicID: string, partitionKey: string): SqlStatement;
    InsertMessage(row: MessageInsertRow): SqlStatement;
    InsertDeliveries(rows: DeliveryInsertRow[]): SqlStatement;
    EnsureSequenceState(subscriptionID: string, partitionKey: string): SqlStatement;
    DeleteExpiredDeduplicationKey(topicID: string, key: string): SqlStatement;
    ReserveDeduplication(topicID: string, key: string, messageID: string, reserveSeconds: number): SqlStatement;
    ConfirmDeduplication(topicID: string, key: string, messageID: string, ttlSeconds: number): SqlStatement;
    ReleaseDeduplication(topicID: string, key: string, messageID: string): SqlStatement;
    PurgeExpiredDeduplications(batchSize: number): SqlStatement;
}

/** Statements used by a Database consumer: expire, claim, heartbeat, settle, sequence bookkeeping. */
export interface ConsumeSqlBuilder {
    /** Returns the deliveries this pass dead-lettered (`ExpiredDeadLetterRow`), for the OnDeadLettered seam. */
    ExpireLeases(subscriptionID: string, maxAttempts: number): SqlStatement;
    ClaimUnpartitioned(subscriptionID: string, leaseOwner: string, leaseSeconds: number, maxRows: number): SqlStatement;
    SelectPartitionCandidates(subscriptionID: string, mode: ClaimPartitionMode, explicitSequence: boolean, maxRows: number): SqlStatement;
    /** Autoscaler metric (03 §11): claimable Pending under the partition rules, plus InFlight. One row, `BacklogRow`. */
    SubscriptionBacklog(subscriptionID: string, mode: BacklogPartitionMode, explicitSequence: boolean): SqlStatement;
    ClaimPartitionCandidate(subscriptionID: string, deliveryID: string, mode: ClaimPartitionMode, explicitSequence: boolean,
                            leaseOwner: string, leaseSeconds: number): SqlStatement;
    MarkAwaitingSequence(subscriptionID: string): SqlStatement;
    ClearAwaitingSequence(subscriptionID: string): SqlStatement;
    ExtendLease(deliveryID: string, leaseToken: string, leaseSeconds: number, progressJSON: string | null): SqlStatement;
    CompleteDelivery(deliveryID: string, leaseToken: string): SqlStatement;
    RetryDelivery(deliveryID: string, leaseToken: string, delaySeconds: number, error: string): SqlStatement;
    DeadLetterDelivery(deliveryID: string, leaseToken: string, reason: string, error: string | null): SqlStatement;
    ReleaseDelivery(deliveryID: string, leaseToken: string): SqlStatement;
    AdvanceSequenceMark(subscriptionID: string, partitionKey: string): SqlStatement;
    ShiftTimestampsForConformance(subscriptionID: string, seconds: number): SqlStatement;
}

/** Statements used by the operator and the sweeper. */
export interface OperatorSqlBuilder {
    SubscriptionStats(subscriptionID: string, ordered: boolean): SqlStatement;
    ListDeadLetters(subscriptionID: string, ordered: boolean, after: DeadLetterCursor | null, pageSize: number): SqlStatement;
    ListPartitions(subscriptionID: string, ordered: boolean, condition: PartitionCondition | null,
                   afterPartitionKey: string | null, pageSize: number): SqlStatement;
    ReplayDelivery(subscriptionID: string, deliveryID: string, actorUserID: string | null, note: string | null): SqlStatement;
    DiscardDelivery(subscriptionID: string, deliveryID: string, allowPending: boolean, actorUserID: string | null, reason: string): SqlStatement;
    /** Cancels an in-flight delivery (03 §7): stamps CancelRequestedAt and rotates the lease token so the holder is fenced. */
    CancelInFlightDelivery(subscriptionID: string, deliveryID: string, actorUserID: string | null, reason: string): SqlStatement;
    SkipSequence(subscriptionID: string, partitionKey: string, sequence: number): SqlStatement;
    /** Sweeper-wide expiry; same shape as `ConsumeSqlBuilder.ExpireLeases` — returns the rows it dead-lettered. */
    ExpireLeasesAll(): SqlStatement;
    FlagGapStalls(): SqlStatement;
    DiscardSkippedSequences(): SqlStatement;
    PurgeTerminalDeliveries(batchSize: number): SqlStatement;
    PurgeOrphanMessages(batchSize: number): SqlStatement;
}

export interface WorkQueueSqlBuilder {
    readonly Publish: PublishSqlBuilder;
    readonly Consume: ConsumeSqlBuilder;
    readonly Operator: OperatorSqlBuilder;
}

/**
 * Lock resource serialising publishes per (topic, partition key) so PublishOrdinal is monotonic per key in
 * commit order (sp_getapplock allows 255 characters: 3 + 36 + 1 + 200 fits).
 */
export function PublishOrderLockResource(topicID: string, partitionKey: string): string {
    return `wq:${topicID.trim().toLowerCase()}:${partitionKey}`;
}
```

- [ ] **Step 3: Write `src/sql/StatementBase.ts`**

```typescript
import type { WorkQueueTableName } from '../constants';
import { SqlParamList } from './SqlParamList';
import { QualifiedTable } from './sqlExecution';
import type { SqlBuilderContext, SqlStatement } from './WorkQueueSqlExecutor';

export abstract class StatementBase {
    constructor(protected readonly Context: SqlBuilderContext) {}

    protected Table(name: WorkQueueTableName): string {
        return QualifiedTable(this.Context, name);
    }

    protected NewParams(): SqlParamList {
        return new SqlParamList(this.Context);
    }

    protected Statement(sql: string, params: SqlParamList): SqlStatement {
        return { SQL: sql.trim(), Params: params.Values };
    }
}
```

- [ ] **Step 4: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/SqlServerPublishSql.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SqlServerPublishSql } from '../sql/sqlserver/SqlServerPublishSql';
import { PublishOrderLockResource } from '../sql/WorkQueueSqlBuilder';
import type { MessageInsertRow } from '../sql/rows';
import { RecordingExecutor } from './fakes';

const sql = new SqlServerPublishSql(new RecordingExecutor());
const TOPIC = 'AAAAAAAA-0000-0000-0000-000000000001';
const SUB = 'BBBBBBBB-0000-0000-0000-000000000001';
const MSG = 'CCCCCCCC-0000-0000-0000-000000000001';

const MESSAGE: MessageInsertRow = {
    ID: MSG,
    TopicID: TOPIC,
    PartitionKey: 'venue-42',
    Sequence: 3,
    AttributesJSON: '{"eventType":"import"}',
    PayloadJSON: '{"importId":"x"}',
    PayloadRefJSON: null,
    CorrelationID: 'corr-1',
    PublishedAt: new Date('2026-01-01T00:00:00.000Z'),
    PublishedByUserID: null,
};

describe('PublishOrderLockResource', () => {
    it('normalises the topic ID and keeps the key verbatim', () => {
        expect(PublishOrderLockResource(TOPIC, 'Venue-42')).toBe('wq:aaaaaaaa-0000-0000-0000-000000000001:Venue-42');
    });
});

describe('SqlServerPublishSql.AcquirePublishOrderLock', () => {
    const statement = sql.AcquirePublishOrderLock(TOPIC, 'venue-42');

    it('takes a transaction-owned exclusive application lock and fails loudly', () => {
        expect(statement.SQL).toContain("sp_getapplock @Resource = @p0, @LockMode = N'Exclusive', @LockOwner = N'Transaction'");
        expect(statement.SQL).toContain('IF @LockResult < 0 THROW 51000');
        expect(statement.SQL.endsWith('SELECT @LockResult AS [LockResult];')).toBe(true);
        expect(statement.Params).toEqual([PublishOrderLockResource(TOPIC, 'venue-42')]);
    });
});

describe('SqlServerPublishSql.InsertMessage', () => {
    const statement = sql.InsertMessage(MESSAGE);

    it('checks for an existing ID or sequence under a range lock before inserting', () => {
        expect(statement.SQL).toContain('FROM [__mj].[WorkQueueMessage] m WITH (UPDLOCK, HOLDLOCK)');
        expect(statement.SQL).toContain('m.[ID] = @p0 OR (@p3 IS NOT NULL AND m.[TopicID] = @p1 AND m.[PartitionKey] = @p2 AND m.[Sequence] = @p3)');
        expect(statement.SQL).toContain('IF NOT EXISTS (SELECT 1 FROM @Existing)');
    });

    it('captures the identity through a table variable and returns one result set', () => {
        expect(statement.SQL).toContain('OUTPUT inserted.[ID], inserted.[PublishOrdinal] INTO @Inserted');
        expect(statement.SQL).toContain("SELECT N'Inserted' AS [Outcome]");
        expect(statement.SQL).toContain("SELECT N'Exists'");
        expect(statement.SQL.endsWith('FROM @Existing e;')).toBe(true);
    });

    it('binds every value in column order', () => {
        expect(statement.Params).toEqual([
            MSG, TOPIC, 'venue-42', 3, '{"eventType":"import"}', '{"importId":"x"}', null, 'corr-1',
            new Date('2026-01-01T00:00:00.000Z'), null,
        ]);
    });
});

describe('SqlServerPublishSql.InsertDeliveries', () => {
    it('inserts one row per delivery with the database clock, skipping existing deliveries', () => {
        const statement = sql.InsertDeliveries([
            { MessageID: MSG, SubscriptionID: SUB, PartitionKey: null, OrderKey: 10 },
            { MessageID: MSG, SubscriptionID: 'DDDDDDDD-0000-0000-0000-000000000001', PartitionKey: 'venue-42', OrderKey: 10 },
        ]);
        expect(statement.SQL).toContain('INSERT INTO [__mj].[WorkQueueDelivery] ([MessageID], [SubscriptionID], [Status], [PartitionKey], [OrderKey], [VisibleAt], [CompletedAt], [ResolutionNote])');
        expect(statement.SQL).toContain('(CAST(@p0 AS UNIQUEIDENTIFIER), CAST(@p1 AS UNIQUEIDENTIFIER), CAST(@p2 AS NVARCHAR(200)), CAST(@p3 AS BIGINT))');
        expect(statement.SQL).toContain('x.[SubscriptionID] = v.[SubscriptionID] AND x.[MessageID] = v.[MessageID]');
        expect(statement.Params).toEqual([MSG, SUB, null, 10, MSG, 'DDDDDDDD-0000-0000-0000-000000000001', 'venue-42', 10]);
    });

    it('inserts deliveries for already-resolved sequences as Discarded', () => {
        const statement = sql.InsertDeliveries([{ MessageID: MSG, SubscriptionID: SUB, PartitionKey: 'venue-42', OrderKey: 2 }]);
        expect(statement.SQL).toContain("CASE WHEN ps.[LastCompletedSequence] >= v.[OrderKey] THEN N'Discarded' ELSE N'Pending' END");
        expect(statement.SQL).toContain("N'SequenceAlreadyResolved'");
        expect(statement.SQL).toContain('LEFT JOIN [__mj].[WorkQueuePartitionState] ps');
    });

    it('rejects empty and oversized batches', () => {
        expect(() => sql.InsertDeliveries([])).toThrow(RangeError);
        const tooMany = Array.from({ length: 251 }, () => ({ MessageID: MSG, SubscriptionID: SUB, PartitionKey: null, OrderKey: 1 }));
        expect(() => sql.InsertDeliveries(tooMany)).toThrow(RangeError);
    });
});

describe('SqlServerPublishSql.EnsureSequenceState', () => {
    it('inserts the partition row only when absent, under a range lock', () => {
        const statement = sql.EnsureSequenceState(SUB, 'venue-42');
        expect(statement.SQL).toContain('INSERT INTO [__mj].[WorkQueuePartitionState] ([SubscriptionID], [PartitionKey])');
        expect(statement.SQL).toContain('WITH (UPDLOCK, HOLDLOCK)');
        expect(statement.Params).toEqual([SUB, 'venue-42']);
    });
});

describe('SqlServerPublishSql deduplication ledger', () => {
    it('deletes only an expired row for the key', () => {
        const statement = sql.DeleteExpiredDeduplicationKey(TOPIC, 'k1');
        expect(statement.SQL).toContain('DELETE FROM [__mj].[WorkQueueDeduplication]');
        expect(statement.SQL).toContain('[ExpiresAt] <= SYSDATETIMEOFFSET()');
    });

    it('reserves under a range lock and reports the owner in one result set', () => {
        const statement = sql.ReserveDeduplication(TOPIC, 'k1', MSG, 120);
        expect(statement.SQL).toContain("N'Reserved', DATEADD(SECOND, @p3, SYSDATETIMEOFFSET())");
        expect(statement.SQL).toContain('WITH (UPDLOCK, HOLDLOCK)');
        expect(statement.SQL).toContain('INTO @Reservation');
        expect(statement.SQL.endsWith('SELECT [MessageID], [Inserted] FROM @Reservation;')).toBe(true);
        expect(statement.Params).toEqual([TOPIC, 'k1', MSG, 120]);
    });

    it('confirms and releases only the owning message', () => {
        const confirm = sql.ConfirmDeduplication(TOPIC, 'k1', MSG, 86400);
        expect(confirm.SQL).toContain("[Status] = N'Confirmed', [ExpiresAt] = DATEADD(SECOND, @p3, SYSDATETIMEOFFSET())");
        expect(confirm.SQL).toContain('[MessageID] = @p2');
        const release = sql.ReleaseDeduplication(TOPIC, 'k1', MSG);
        expect(release.SQL).toContain("[MessageID] = @p2 AND [Status] = N'Reserved'");
    });

    it('purges expired keys in bounded batches', () => {
        const statement = sql.PurgeExpiredDeduplications(500);
        expect(statement.SQL).toContain('DELETE TOP (@p0) FROM [__mj].[WorkQueueDeduplication]');
        expect(statement.Params).toEqual([500]);
    });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test SqlServerPublishSql`
Expected: FAIL — unresolved import `../sql/sqlserver/SqlServerPublishSql`.

- [ ] **Step 6: Write `src/sql/sqlserver/SqlServerPublishSql.ts`**

```typescript
import { DELIVERY_INSERT_CHUNK, WorkQueueTables } from '../../constants';
import type { DeliveryInsertRow, MessageInsertRow } from '../rows';
import { StatementBase } from '../StatementBase';
import type { PublishSqlBuilder } from '../WorkQueueSqlBuilder';
import { PublishOrderLockResource } from '../WorkQueueSqlBuilder';
import type { SqlStatement } from '../WorkQueueSqlExecutor';

export class SqlServerPublishSql extends StatementBase implements PublishSqlBuilder {
    public AcquirePublishOrderLock(topicID: string, partitionKey: string): SqlStatement {
        const p = this.NewParams();
        const resource = p.Add(PublishOrderLockResource(topicID, partitionKey));
        return this.Statement(`
DECLARE @LockResult INT;
EXEC @LockResult = sp_getapplock @Resource = ${resource}, @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 30000;
IF @LockResult < 0 THROW 51000, N'WorkQueue publish-order lock was not acquired', 1;
SELECT @LockResult AS [LockResult];`, p);
    }

    public InsertMessage(row: MessageInsertRow): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(row.ID);
        const topic = p.Add(row.TopicID);
        const key = p.Add(row.PartitionKey);
        const seq = p.Add(row.Sequence);
        const attrs = p.Add(row.AttributesJSON);
        const payload = p.Add(row.PayloadJSON);
        const ref = p.Add(row.PayloadRefJSON);
        const corr = p.Add(row.CorrelationID);
        const at = p.Add(row.PublishedAt);
        const user = p.Add(row.PublishedByUserID);
        const table = this.Table(WorkQueueTables.Message);
        return this.Statement(`
DECLARE @Existing TABLE ([ID] UNIQUEIDENTIFIER, [PublishOrdinal] BIGINT, [TopicID] UNIQUEIDENTIFIER, [PartitionKey] NVARCHAR(200), [Sequence] BIGINT,
    [Attributes] NVARCHAR(4000), [Payload] NVARCHAR(MAX), [PayloadRef] NVARCHAR(2000), [CorrelationID] NVARCHAR(200));
DECLARE @Inserted TABLE ([ID] UNIQUEIDENTIFIER, [PublishOrdinal] BIGINT);
INSERT INTO @Existing
SELECT m.[ID], m.[PublishOrdinal], m.[TopicID], m.[PartitionKey], m.[Sequence], m.[Attributes], m.[Payload], m.[PayloadRef], m.[CorrelationID]
FROM ${table} m WITH (UPDLOCK, HOLDLOCK)
WHERE m.[ID] = ${id} OR (${seq} IS NOT NULL AND m.[TopicID] = ${topic} AND m.[PartitionKey] = ${key} AND m.[Sequence] = ${seq});
IF NOT EXISTS (SELECT 1 FROM @Existing)
    INSERT INTO ${table} ([ID], [TopicID], [PartitionKey], [Sequence], [Attributes], [Payload], [PayloadRef], [CorrelationID], [PublishedAt], [PublishedByUserID])
    OUTPUT inserted.[ID], inserted.[PublishOrdinal] INTO @Inserted
    VALUES (${id}, ${topic}, ${key}, ${seq}, ${attrs}, ${payload}, ${ref}, ${corr}, ${at}, ${user});
SELECT N'Inserted' AS [Outcome], i.[ID], i.[PublishOrdinal], CAST(NULL AS UNIQUEIDENTIFIER) AS [TopicID],
    CAST(NULL AS NVARCHAR(200)) AS [PartitionKey], CAST(NULL AS BIGINT) AS [Sequence], CAST(NULL AS NVARCHAR(4000)) AS [Attributes],
    CAST(NULL AS NVARCHAR(MAX)) AS [Payload], CAST(NULL AS NVARCHAR(2000)) AS [PayloadRef], CAST(NULL AS NVARCHAR(200)) AS [CorrelationID]
FROM @Inserted i
UNION ALL
SELECT N'Exists', e.[ID], e.[PublishOrdinal], e.[TopicID], e.[PartitionKey], e.[Sequence], e.[Attributes], e.[Payload], e.[PayloadRef], e.[CorrelationID]
FROM @Existing e;`, p);
    }

    /**
     * Inserts deliveries, skipping any (SubscriptionID, MessageID) that already exists (staging redelivery). A delivery whose
     * OrderKey is already covered by its key's LastCompletedSequence is inserted Discarded, so a late sequence never wedges the key.
     */
    public InsertDeliveries(rows: DeliveryInsertRow[]): SqlStatement {
        if (rows.length === 0 || rows.length > DELIVERY_INSERT_CHUNK) {
            throw new RangeError(`InsertDeliveries accepts 1-${DELIVERY_INSERT_CHUNK} rows; got ${rows.length}`);
        }
        const p = this.NewParams();
        const values = rows.map(r =>
            `(CAST(${p.Add(r.MessageID)} AS UNIQUEIDENTIFIER), CAST(${p.Add(r.SubscriptionID)} AS UNIQUEIDENTIFIER), CAST(${p.Add(r.PartitionKey)} AS NVARCHAR(200)), CAST(${p.Add(r.OrderKey)} AS BIGINT))`,
        );
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(`
INSERT INTO ${deliveries} ([MessageID], [SubscriptionID], [Status], [PartitionKey], [OrderKey], [VisibleAt], [CompletedAt], [ResolutionNote])
SELECT v.[MessageID], v.[SubscriptionID],
    CASE WHEN ps.[LastCompletedSequence] >= v.[OrderKey] THEN N'Discarded' ELSE N'Pending' END,
    v.[PartitionKey], v.[OrderKey], SYSDATETIMEOFFSET(),
    CASE WHEN ps.[LastCompletedSequence] >= v.[OrderKey] THEN SYSDATETIMEOFFSET() END,
    CASE WHEN ps.[LastCompletedSequence] >= v.[OrderKey] THEN N'SequenceAlreadyResolved' END
FROM (VALUES ${values.join(',\n             ')}) v ([MessageID], [SubscriptionID], [PartitionKey], [OrderKey])
LEFT JOIN ${this.Table(WorkQueueTables.PartitionState)} ps ON ps.[SubscriptionID] = v.[SubscriptionID] AND ps.[PartitionKey] = v.[PartitionKey]
WHERE NOT EXISTS (SELECT 1 FROM ${deliveries} x WITH (UPDLOCK, HOLDLOCK) WHERE x.[SubscriptionID] = v.[SubscriptionID] AND x.[MessageID] = v.[MessageID])`, p);
    }

    public EnsureSequenceState(subscriptionID: string, partitionKey: string): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const key = p.Add(partitionKey);
        const table = this.Table(WorkQueueTables.PartitionState);
        return this.Statement(`
INSERT INTO ${table} ([SubscriptionID], [PartitionKey])
SELECT ${sub}, ${key}
WHERE NOT EXISTS (SELECT 1 FROM ${table} WITH (UPDLOCK, HOLDLOCK) WHERE [SubscriptionID] = ${sub} AND [PartitionKey] = ${key})`, p);
    }

    public DeleteExpiredDeduplicationKey(topicID: string, key: string): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
DELETE FROM ${this.Table(WorkQueueTables.Deduplication)}
WHERE [TopicID] = ${p.Add(topicID)} AND [DeduplicationKey] = ${p.Add(key)} AND [ExpiresAt] <= SYSDATETIMEOFFSET()`, p);
    }

    public ReserveDeduplication(topicID: string, key: string, messageID: string, reserveSeconds: number): SqlStatement {
        const p = this.NewParams();
        const topic = p.Add(topicID);
        const k = p.Add(key);
        const message = p.Add(messageID);
        const seconds = p.Add(reserveSeconds);
        const table = this.Table(WorkQueueTables.Deduplication);
        return this.Statement(`
DECLARE @Reservation TABLE ([MessageID] UNIQUEIDENTIFIER, [Inserted] BIT);
INSERT INTO ${table} ([TopicID], [DeduplicationKey], [MessageID], [Status], [ExpiresAt])
OUTPUT inserted.[MessageID], CAST(1 AS BIT) INTO @Reservation
SELECT ${topic}, ${k}, ${message}, N'Reserved', DATEADD(SECOND, ${seconds}, SYSDATETIMEOFFSET())
WHERE NOT EXISTS (SELECT 1 FROM ${table} WITH (UPDLOCK, HOLDLOCK) WHERE [TopicID] = ${topic} AND [DeduplicationKey] = ${k});
IF NOT EXISTS (SELECT 1 FROM @Reservation)
    INSERT INTO @Reservation SELECT [MessageID], CAST(0 AS BIT) FROM ${table} WHERE [TopicID] = ${topic} AND [DeduplicationKey] = ${k};
SELECT [MessageID], [Inserted] FROM @Reservation;`, p);
    }

    public ConfirmDeduplication(topicID: string, key: string, messageID: string, ttlSeconds: number): SqlStatement {
        const p = this.NewParams();
        const topic = p.Add(topicID);
        const k = p.Add(key);
        const message = p.Add(messageID);
        const ttl = p.Add(ttlSeconds);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Deduplication)}
SET [Status] = N'Confirmed', [ExpiresAt] = DATEADD(SECOND, ${ttl}, SYSDATETIMEOFFSET())
WHERE [TopicID] = ${topic} AND [DeduplicationKey] = ${k} AND [MessageID] = ${message}`, p);
    }

    public ReleaseDeduplication(topicID: string, key: string, messageID: string): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
DELETE FROM ${this.Table(WorkQueueTables.Deduplication)}
WHERE [TopicID] = ${p.Add(topicID)} AND [DeduplicationKey] = ${p.Add(key)} AND [MessageID] = ${p.Add(messageID)} AND [Status] = N'Reserved'`, p);
    }

    public PurgeExpiredDeduplications(batchSize: number): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
DELETE TOP (${p.Add(batchSize)}) FROM ${this.Table(WorkQueueTables.Deduplication)}
WHERE [ExpiresAt] <= SYSDATETIMEOFFSET()`, p);
    }
}
```

- [ ] **Step 7: Export the new modules**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './sql/rows';
export * from './sql/WorkQueueSqlBuilder';
export * from './sql/StatementBase';
export * from './sql/sqlserver/SqlServerPublishSql';
```

- [ ] **Step 8: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — sqlExecution (15), SqlServerPublishSql (13).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 9: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): statement builder contracts and SQL Server publish and ledger SQL"
```

---

### Task 4: SQL Server consume statements (expire, claim, settle, sequence)

**Files:**
- Create: `packages/WorkQueue/engine/src/sql/sqlserver/SqlServerFragments.ts`, `src/sql/sqlserver/SqlServerConsumeSql.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/SqlServerConsumeSql.test.ts`

**Interfaces:**
- Consumes: `ConsumeSqlBuilder`, `ClaimPartitionMode`, `StatementBase` (Task 3); `WorkQueueTables` (Task 2).
- Produces:
  - `SqlServerFragments`: `ActiveSubscriptionGuard(subscriptionTable: string, subscriptionParam: string): string`, `NoInFlightForKey(deliveryTable: string, alias: string): string`, `NoEarlierUnfinished(deliveryTable: string, alias: string): string`, `IsNextSequence(stateTable: string, alias: string): string`, `CLAIMED_TABLE_DECLARATION`, `CLAIMED_OUTPUT`, `ClaimSetClause(ownerParam: string, leaseParam: string): string`, `ClaimedSelect(messageTable: string): string`
  - `class SqlServerConsumeSql extends StatementBase implements ConsumeSqlBuilder`

Claim rules implemented here are 03 §7 verbatim: `Pending` + visible + active subscription; `Exclusive` adds "no in-flight delivery for the key"; `Ordered` adds "no earlier `Pending`/`InFlight`/`DeadLettered` delivery for the key"; `Ordered` + `ExplicitSequence` adds `OrderKey = LastCompletedSequence + 1`. The unique index `UQ_WorkQueueDelivery_InFlightPartition` is the race-proof backstop; the `NOT EXISTS` predicates only avoid most violations.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/SqlServerConsumeSql.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SqlServerConsumeSql } from '../sql/sqlserver/SqlServerConsumeSql';
import { RecordingExecutor } from './fakes';

const sql = new SqlServerConsumeSql(new RecordingExecutor());
const SUB = 'BBBBBBBB-0000-0000-0000-000000000001';
const DELIVERY = 'EEEEEEEE-0000-0000-0000-000000000001';
const TOKEN = 'FFFFFFFF-0000-0000-0000-000000000001';
const FENCE = /\[ID\] = @p0 AND \[LeaseToken\] = @p1 AND \[Status\] = N'InFlight'/;

describe('SqlServerConsumeSql.ExpireLeases', () => {
    const statement = sql.ExpireLeases(SUB, 5);

    it('returns expired in-flight rows to Pending or dead-letters them at the attempt limit', () => {
        expect(statement.SQL).toContain("WHEN [AttemptCount] >= @p1 THEN N'DeadLettered' ELSE N'Pending' END");
        expect(statement.SQL).toContain("[LastError] = CASE WHEN [CancelRequestedAt] IS NOT NULL THEN [LastError] ELSE N'LeaseExpired' END");
        expect(statement.SQL).toContain("WHERE [SubscriptionID] = @p0 AND [Status] = N'InFlight' AND [LeaseExpiresAt] < SYSDATETIMEOFFSET()");
        expect(statement.Params).toEqual([SUB, 5]);
    });

    it('counts the autoscaler backlog as claimable Pending plus InFlight', () => {
        const keyless = sql.SubscriptionBacklog(SUB, 'None', false);
        expect(keyless.SQL).toContain('+ 0 AS [Claimable]');
        expect(keyless.SQL).toContain("d.[Status] = N'InFlight') AS [InFlight]");
        expect(keyless.Params).toEqual([SUB]);

        const ordered = sql.SubscriptionBacklog(SUB, 'Ordered', true);
        expect(ordered.SQL).toContain('COUNT(DISTINCT d.[PartitionKey])');     // one claimable item per key
        expect(ordered.SQL).toContain('[LastCompletedSequence]');              // head-of-line + next-sequence rules apply
    });

    it('settles a cancelled in-flight row as Discarded instead of retrying it (03 §7)', () => {
        expect(statement.SQL).toContain("[Status] = CASE WHEN [CancelRequestedAt] IS NOT NULL THEN N'Discarded'");
        expect(statement.SQL).toContain("[CompletedAt] = CASE WHEN [CancelRequestedAt] IS NOT NULL THEN SYSDATETIMEOFFSET() ELSE [CompletedAt] END");
        // a cancelled row never dead-letters, whatever its attempt count
        expect(statement.SQL).toContain("[DeadLetterReason] = CASE WHEN [CancelRequestedAt] IS NULL AND [AttemptCount] >= @p1");
    });
});

describe('SqlServerConsumeSql.ClaimUnpartitioned', () => {
    const statement = sql.ClaimUnpartitioned(SUB, 'host:1:abc', 60, 10);

    it('claims keyless visible pending rows with skip-locked hints for an active subscription', () => {
        expect(statement.SQL).toContain('WITH (UPDLOCK, READPAST, ROWLOCK)');
        expect(statement.SQL).toContain("d.[Status] = N'Pending' AND d.[PartitionKey] IS NULL AND d.[VisibleAt] <= SYSDATETIMEOFFSET()");
        expect(statement.SQL).toContain("s.[Status] = N'Active'");
        expect(statement.SQL).toContain('SELECT TOP (@p3)');
    });

    it('issues a new lease token, counts the attempt and returns rows through a table variable', () => {
        expect(statement.SQL).toContain('[LeaseToken] = NEWID()');
        expect(statement.SQL).toContain('[AttemptCount] = [AttemptCount] + 1');
        expect(statement.SQL).toContain('DATEADD(SECOND, @p2, SYSDATETIMEOFFSET())');
        expect(statement.SQL).toContain('INTO @Claimed');
        expect(statement.SQL.endsWith('ON m.[ID] = c.[MessageID];')).toBe(true);
        expect(statement.Params).toEqual([SUB, 'host:1:abc', 60, 10]);
    });
});

describe('SqlServerConsumeSql.SelectPartitionCandidates', () => {
    it('Exclusive: first visible pending delivery per idle key', () => {
        const statement = sql.SelectPartitionCandidates(SUB, 'Exclusive', false, 20);
        expect(statement.SQL).toContain('ROW_NUMBER() OVER (PARTITION BY d.[PartitionKey] ORDER BY d.[OrderKey])');
        expect(statement.SQL).toContain("f.[Status] = N'InFlight'");
        expect(statement.SQL).not.toContain('e.[OrderKey] < d.[OrderKey]');
        expect(statement.SQL).not.toContain('[LastCompletedSequence]');
    });

    it('Ordered: only the head of each key', () => {
        const statement = sql.SelectPartitionCandidates(SUB, 'Ordered', false, 20);
        expect(statement.SQL).toContain("e.[OrderKey] < d.[OrderKey] AND e.[Status] IN (N'Pending', N'InFlight', N'DeadLettered')");
        expect(statement.SQL).not.toContain('[LastCompletedSequence]');
    });

    it('Ordered with explicit sequence: the head must be the next sequence', () => {
        const statement = sql.SelectPartitionCandidates(SUB, 'Ordered', true, 20);
        expect(statement.SQL).toContain('d.[OrderKey] = COALESCE((SELECT ps.[LastCompletedSequence]');
    });

    it('ignores explicit sequencing for Exclusive', () => {
        expect(sql.SelectPartitionCandidates(SUB, 'Exclusive', true, 20).SQL).not.toContain('[LastCompletedSequence]');
    });
});

describe('SqlServerConsumeSql.ClaimPartitionCandidate', () => {
    const statement = sql.ClaimPartitionCandidate(SUB, DELIVERY, 'Ordered', true, 'host:1:abc', 60);

    it('re-checks every head rule on the single candidate row', () => {
        expect(statement.SQL).toContain("WHERE d.[ID] = @p1 AND d.[SubscriptionID] = @p0 AND d.[Status] = N'Pending'");
        expect(statement.SQL).toContain("f.[Status] = N'InFlight'");
        expect(statement.SQL).toContain('e.[OrderKey] < d.[OrderKey]');
        expect(statement.SQL).toContain('[LastCompletedSequence]');
        expect(statement.SQL).toContain('INTO @Claimed');
        expect(statement.Params).toEqual([SUB, DELIVERY, 'host:1:abc', 60]);
    });
});

describe('SqlServerConsumeSql sequence bookkeeping', () => {
    it('marks keys waiting for a missing next sequence', () => {
        const statement = sql.MarkAwaitingSequence(SUB);
        expect(statement.SQL).toContain('SET [AwaitingSequenceSince] = SYSDATETIMEOFFSET()');
        expect(statement.SQL).toContain('d.[OrderKey] > ps.[LastCompletedSequence] + 1');
        expect(statement.SQL).toContain('n.[OrderKey] = ps.[LastCompletedSequence] + 1');
    });

    it('clears the wait once the next sequence exists', () => {
        const statement = sql.ClearAwaitingSequence(SUB);
        expect(statement.SQL).toContain('SET [AwaitingSequenceSince] = NULL, [GapStalled] = 0');
        expect(statement.SQL).toContain('ps.[AwaitingSequenceSince] IS NOT NULL');
    });

    it('advances the mark across consecutive resolved sequences and returns it', () => {
        const statement = sql.AdvanceSequenceMark(SUB, 'venue-42');
        expect(statement.SQL).toContain('WITH (UPDLOCK, ROWLOCK)');
        expect(statement.SQL).toContain("[OrderKey] = @Mark + 1 AND [Status] IN (N'Completed', N'Discarded')");
        expect(statement.SQL.endsWith('SELECT @Mark AS [LastCompletedSequence];')).toBe(true);
        expect(statement.Params).toEqual([SUB, 'venue-42']);
    });
});

describe('SqlServerConsumeSql fenced writes', () => {
    it('extends the lease and keeps prior progress when none is given', () => {
        const statement = sql.ExtendLease(DELIVERY, TOKEN, 60, null);
        expect(statement.SQL).toMatch(FENCE);
        expect(statement.SQL).toContain('[Progress] = COALESCE(@p3, [Progress])');
        expect(statement.Params).toEqual([DELIVERY, TOKEN, 60, null]);
    });

    it('completes and returns the key and order for sequence advancement', () => {
        const statement = sql.CompleteDelivery(DELIVERY, TOKEN);
        expect(statement.SQL).toMatch(FENCE);
        expect(statement.SQL).toContain("[Status] = N'Completed', [CompletedAt] = SYSDATETIMEOFFSET()");
        expect(statement.SQL).toContain('OUTPUT inserted.[SubscriptionID], inserted.[PartitionKey], inserted.[OrderKey] INTO @Completed');
    });

    it('retries with a delayed visibility and the error text', () => {
        const statement = sql.RetryDelivery(DELIVERY, TOKEN, 30, 'boom');
        expect(statement.SQL).toMatch(FENCE);
        expect(statement.SQL).toContain("[Status] = N'Pending', [VisibleAt] = DATEADD(SECOND, @p2, SYSDATETIMEOFFSET()), [LastError] = @p3");
        expect(statement.Params).toEqual([DELIVERY, TOKEN, 30, 'boom']);
    });

    it('dead-letters with a reason and timestamp', () => {
        const statement = sql.DeadLetterDelivery(DELIVERY, TOKEN, 'MaxAttemptsExceeded', null);
        expect(statement.SQL).toMatch(FENCE);
        expect(statement.SQL).toContain("[Status] = N'DeadLettered', [DeadLetterReason] = @p2, [DeadLetteredAt] = SYSDATETIMEOFFSET()");
    });

    it('releases without consuming the attempt', () => {
        const statement = sql.ReleaseDelivery(DELIVERY, TOKEN);
        expect(statement.SQL).toMatch(FENCE);
        expect(statement.SQL).toContain('[AttemptCount] = CASE WHEN [AttemptCount] > 0 THEN [AttemptCount] - 1 ELSE 0 END');
    });

    it('shifts visibility and lease timestamps back for conformance tests', () => {
        const statement = sql.ShiftTimestampsForConformance(SUB, 90);
        expect(statement.SQL).toContain('[VisibleAt] = DATEADD(SECOND, -@p1, [VisibleAt])');
        expect(statement.SQL).toContain('[LeaseExpiresAt] = DATEADD(SECOND, -@p1, [LeaseExpiresAt])');
        expect(statement.Params).toEqual([SUB, 90]);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test SqlServerConsumeSql`
Expected: FAIL — unresolved import `../sql/sqlserver/SqlServerConsumeSql`.

- [ ] **Step 3: Write `src/sql/sqlserver/SqlServerFragments.ts`**

```typescript
/** Reusable SQL Server predicate and clause fragments. Table arguments are already qualified. */

export function ActiveSubscriptionGuard(subscriptionTable: string, subscriptionParam: string): string {
    return `EXISTS (SELECT 1 FROM ${subscriptionTable} s WHERE s.[ID] = ${subscriptionParam} AND s.[Status] = N'Active')`;
}

/** No in-flight delivery exists for the same subscription and key as `alias`. */
export function NoInFlightForKey(deliveryTable: string, alias: string): string {
    return `NOT EXISTS (SELECT 1 FROM ${deliveryTable} f WHERE f.[SubscriptionID] = ${alias}.[SubscriptionID] `
        + `AND f.[PartitionKey] = ${alias}.[PartitionKey] AND f.[Status] = N'InFlight')`;
}

/** `alias` is the head of its key: nothing earlier is Pending, InFlight or DeadLettered. */
export function NoEarlierUnfinished(deliveryTable: string, alias: string): string {
    return `NOT EXISTS (SELECT 1 FROM ${deliveryTable} e WHERE e.[SubscriptionID] = ${alias}.[SubscriptionID] `
        + `AND e.[PartitionKey] = ${alias}.[PartitionKey] AND e.[OrderKey] < ${alias}.[OrderKey] `
        + `AND e.[Status] IN (N'Pending', N'InFlight', N'DeadLettered'))`;
}

/** `alias` carries the next explicit sequence for its key. */
export function IsNextSequence(stateTable: string, alias: string): string {
    return `${alias}.[OrderKey] = COALESCE((SELECT ps.[LastCompletedSequence] FROM ${stateTable} ps `
        + `WHERE ps.[SubscriptionID] = ${alias}.[SubscriptionID] AND ps.[PartitionKey] = ${alias}.[PartitionKey]), 0) + 1`;
}

export const CLAIMED_TABLE_DECLARATION =
    'DECLARE @Claimed TABLE ([ID] UNIQUEIDENTIFIER, [MessageID] UNIQUEIDENTIFIER, [AttemptCount] INT, '
    + '[LeaseToken] UNIQUEIDENTIFIER, [LeaseExpiresAt] DATETIMEOFFSET(7), [IsReplay] BIT);';

export const CLAIMED_OUTPUT =
    'OUTPUT inserted.[ID], inserted.[MessageID], inserted.[AttemptCount], inserted.[LeaseToken], '
    + 'inserted.[LeaseExpiresAt], inserted.[IsReplay] INTO @Claimed';

export function ClaimSetClause(ownerParam: string, leaseParam: string): string {
    return `[Status] = N'InFlight', [LeaseToken] = NEWID(), [LeaseOwner] = ${ownerParam}, `
        + `[LeaseExpiresAt] = DATEADD(SECOND, ${leaseParam}, SYSDATETIMEOFFSET()), [LastHeartbeatAt] = SYSDATETIMEOFFSET(), `
        + `[AttemptCount] = [AttemptCount] + 1, [Progress] = NULL`;
}

export function ClaimedSelect(messageTable: string): string {
    return 'SELECT c.[ID] AS [DeliveryID], c.[AttemptCount], c.[LeaseToken], c.[LeaseExpiresAt], c.[IsReplay], '
        + 'm.[ID] AS [MessageID], m.[PartitionKey], m.[Sequence], m.[Attributes], m.[Payload], m.[PayloadRef], m.[CorrelationID], m.[PublishedAt]\n'
        + `FROM @Claimed c INNER JOIN ${messageTable} m ON m.[ID] = c.[MessageID];`;
}

/** Lease columns cleared by every settle. */
export const CLEAR_LEASE = '[LeaseToken] = NULL, [LeaseOwner] = NULL, [LeaseExpiresAt] = NULL';

/** Expire passes OUTPUT every touched row (CodeGen tables have triggers, so OUTPUT needs INTO) and return only the
 *  ones that ended DeadLettered — the engine's OnDeadLettered seam (03 §11). Exactly one result set. */
export const EXPIRED_TABLE_DECLARATION =
    'DECLARE @Expired TABLE ([ID] UNIQUEIDENTIFIER, [SubscriptionID] UNIQUEIDENTIFIER, [PartitionKey] NVARCHAR(200), [Status] NVARCHAR(20));';
export const EXPIRED_DEAD_LETTER_SELECT =
    "SELECT [ID] AS [DeliveryID], [SubscriptionID], [PartitionKey] FROM @Expired WHERE [Status] = N'DeadLettered';";
```

- [ ] **Step 4: Write `src/sql/sqlserver/SqlServerConsumeSql.ts`**

```typescript
import { WorkQueueTables } from '../../constants';
import type { ClaimPartitionMode } from '../rows';
import { StatementBase } from '../StatementBase';
import type { ConsumeSqlBuilder } from '../WorkQueueSqlBuilder';
import type { SqlStatement } from '../WorkQueueSqlExecutor';
import {
    ActiveSubscriptionGuard, CLAIMED_OUTPUT, CLAIMED_TABLE_DECLARATION, ClaimedSelect, ClaimSetClause, CLEAR_LEASE,
    IsNextSequence, NoEarlierUnfinished, NoInFlightForKey,
} from './SqlServerFragments';

export class SqlServerConsumeSql extends StatementBase implements ConsumeSqlBuilder {
    public ExpireLeases(subscriptionID: string, maxAttempts: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const max = p.Add(maxAttempts);
        return this.Statement(`
${EXPIRED_TABLE_DECLARATION}
UPDATE ${this.Table(WorkQueueTables.Delivery)} SET
    [Status] = CASE WHEN [CancelRequestedAt] IS NOT NULL THEN N'Discarded'
                    WHEN [AttemptCount] >= ${max} THEN N'DeadLettered' ELSE N'Pending' END,
    [DeadLetterReason] = CASE WHEN [CancelRequestedAt] IS NULL AND [AttemptCount] >= ${max} THEN N'LeaseExpired' ELSE [DeadLetterReason] END,
    [DeadLetteredAt] = CASE WHEN [CancelRequestedAt] IS NULL AND [AttemptCount] >= ${max} THEN SYSDATETIMEOFFSET() ELSE [DeadLetteredAt] END,
    [CompletedAt] = CASE WHEN [CancelRequestedAt] IS NOT NULL THEN SYSDATETIMEOFFSET() ELSE [CompletedAt] END,
    [LastError] = CASE WHEN [CancelRequestedAt] IS NOT NULL THEN [LastError] ELSE N'LeaseExpired' END,
    [VisibleAt] = SYSDATETIMEOFFSET(), ${CLEAR_LEASE}
OUTPUT inserted.[ID], inserted.[SubscriptionID], inserted.[PartitionKey], inserted.[Status] INTO @Expired
WHERE [SubscriptionID] = ${sub} AND [Status] = N'InFlight' AND [LeaseExpiresAt] < SYSDATETIMEOFFSET();
${EXPIRED_DEAD_LETTER_SELECT}`, p);
    }

    public ClaimUnpartitioned(subscriptionID: string, leaseOwner: string, leaseSeconds: number, maxRows: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const owner = p.Add(leaseOwner);
        const lease = p.Add(leaseSeconds);
        const max = p.Add(maxRows);
        return this.Statement(`
${CLAIMED_TABLE_DECLARATION}
WITH [Ready] AS (
    SELECT TOP (${max}) d.[ID], d.[MessageID], d.[Status], d.[LeaseToken], d.[LeaseOwner], d.[LeaseExpiresAt],
        d.[LastHeartbeatAt], d.[AttemptCount], d.[Progress], d.[IsReplay]
    FROM ${this.Table(WorkQueueTables.Delivery)} d WITH (UPDLOCK, READPAST, ROWLOCK)
    WHERE d.[SubscriptionID] = ${sub} AND d.[Status] = N'Pending' AND d.[PartitionKey] IS NULL AND d.[VisibleAt] <= SYSDATETIMEOFFSET()
      AND ${ActiveSubscriptionGuard(this.Table(WorkQueueTables.Subscription), sub)}
    ORDER BY d.[VisibleAt]
)
UPDATE [Ready] SET ${ClaimSetClause(owner, lease)}
${CLAIMED_OUTPUT};
${ClaimedSelect(this.Table(WorkQueueTables.Message))}`, p);
    }

    public SelectPartitionCandidates(subscriptionID: string, mode: ClaimPartitionMode, explicitSequence: boolean, maxRows: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const max = p.Add(maxRows);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(`
WITH [Ready] AS (
    SELECT d.[ID], d.[PartitionKey], d.[OrderKey], d.[VisibleAt],
        ROW_NUMBER() OVER (PARTITION BY d.[PartitionKey] ORDER BY d.[OrderKey]) AS [KeyRank]
    FROM ${deliveries} d
    WHERE d.[SubscriptionID] = ${sub} AND d.[PartitionKey] IS NOT NULL AND d.[Status] = N'Pending' AND d.[VisibleAt] <= SYSDATETIMEOFFSET()
      AND ${NoInFlightForKey(deliveries, 'd')}${this.HeadPredicates(mode, explicitSequence)}
)
SELECT TOP (${max}) [ID] AS [DeliveryID], [PartitionKey]
FROM [Ready]
WHERE [KeyRank] = 1
ORDER BY [VisibleAt], [OrderKey];`, p);
    }

    public SubscriptionBacklog(subscriptionID: string, mode: BacklogPartitionMode, explicitSequence: boolean): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        const keyed = mode === 'None' ? '0' : `(
        SELECT COUNT(DISTINCT d.[PartitionKey]) FROM ${deliveries} d
        WHERE d.[SubscriptionID] = ${sub} AND d.[PartitionKey] IS NOT NULL AND d.[Status] = N'Pending'
          AND d.[VisibleAt] <= SYSDATETIMEOFFSET()
          AND ${NoInFlightForKey(deliveries, 'd')}${this.HeadPredicates(mode === 'None' ? 'Exclusive' : mode, explicitSequence)})`;
        return this.Statement(`
SELECT
    (SELECT COUNT(*) FROM ${deliveries} d
     WHERE d.[SubscriptionID] = ${sub} AND d.[PartitionKey] IS NULL AND d.[Status] = N'Pending'
       AND d.[VisibleAt] <= SYSDATETIMEOFFSET())
    + ${keyed} AS [Claimable],
    (SELECT COUNT(*) FROM ${deliveries} d
     WHERE d.[SubscriptionID] = ${sub} AND d.[Status] = N'InFlight') AS [InFlight];`, p);
    }

    public ClaimPartitionCandidate(subscriptionID: string, deliveryID: string, mode: ClaimPartitionMode, explicitSequence: boolean,
                                   leaseOwner: string, leaseSeconds: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const delivery = p.Add(deliveryID);
        const owner = p.Add(leaseOwner);
        const lease = p.Add(leaseSeconds);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(`
${CLAIMED_TABLE_DECLARATION}
UPDATE d SET ${ClaimSetClause(owner, lease)}
${CLAIMED_OUTPUT}
FROM ${deliveries} d
WHERE d.[ID] = ${delivery} AND d.[SubscriptionID] = ${sub} AND d.[Status] = N'Pending'
  AND d.[VisibleAt] <= SYSDATETIMEOFFSET() AND d.[PartitionKey] IS NOT NULL
  AND ${ActiveSubscriptionGuard(this.Table(WorkQueueTables.Subscription), sub)}
  AND ${NoInFlightForKey(deliveries, 'd')}${this.HeadPredicates(mode, explicitSequence)};
${ClaimedSelect(this.Table(WorkQueueTables.Message))}`, p);
    }

    public MarkAwaitingSequence(subscriptionID: string): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(`
UPDATE ps SET [AwaitingSequenceSince] = SYSDATETIMEOFFSET()
FROM ${this.Table(WorkQueueTables.PartitionState)} ps
WHERE ps.[SubscriptionID] = ${sub} AND ps.[AwaitingSequenceSince] IS NULL
  AND EXISTS (SELECT 1 FROM ${deliveries} d WHERE d.[SubscriptionID] = ps.[SubscriptionID] AND d.[PartitionKey] = ps.[PartitionKey]
              AND d.[Status] = N'Pending' AND d.[OrderKey] > ps.[LastCompletedSequence] + 1)
  AND NOT EXISTS (SELECT 1 FROM ${deliveries} n WHERE n.[SubscriptionID] = ps.[SubscriptionID] AND n.[PartitionKey] = ps.[PartitionKey]
              AND n.[OrderKey] = ps.[LastCompletedSequence] + 1 AND n.[Status] IN (N'Pending', N'InFlight', N'DeadLettered'))`, p);
    }

    public ClearAwaitingSequence(subscriptionID: string): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        return this.Statement(`
UPDATE ps SET [AwaitingSequenceSince] = NULL, [GapStalled] = 0
FROM ${this.Table(WorkQueueTables.PartitionState)} ps
WHERE ps.[SubscriptionID] = ${sub} AND ps.[AwaitingSequenceSince] IS NOT NULL
  AND EXISTS (SELECT 1 FROM ${this.Table(WorkQueueTables.Delivery)} n WHERE n.[SubscriptionID] = ps.[SubscriptionID]
              AND n.[PartitionKey] = ps.[PartitionKey] AND n.[OrderKey] = ps.[LastCompletedSequence] + 1
              AND n.[Status] IN (N'Pending', N'InFlight', N'DeadLettered'))`, p);
    }

    public ExtendLease(deliveryID: string, leaseToken: string, leaseSeconds: number, progressJSON: string | null): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        const lease = p.Add(leaseSeconds);
        const progress = p.Add(progressJSON);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET [LeaseExpiresAt] = DATEADD(SECOND, ${lease}, SYSDATETIMEOFFSET()), [LastHeartbeatAt] = SYSDATETIMEOFFSET(), [Progress] = COALESCE(${progress}, [Progress])
WHERE [ID] = ${id} AND [LeaseToken] = ${token} AND [Status] = N'InFlight'`, p);
    }

    public CompleteDelivery(deliveryID: string, leaseToken: string): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        return this.Statement(`
DECLARE @Completed TABLE ([SubscriptionID] UNIQUEIDENTIFIER, [PartitionKey] NVARCHAR(200), [OrderKey] BIGINT);
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET [Status] = N'Completed', [CompletedAt] = SYSDATETIMEOFFSET(), ${CLEAR_LEASE}
OUTPUT inserted.[SubscriptionID], inserted.[PartitionKey], inserted.[OrderKey] INTO @Completed
WHERE [ID] = ${id} AND [LeaseToken] = ${token} AND [Status] = N'InFlight';
SELECT [SubscriptionID], [PartitionKey], [OrderKey] FROM @Completed;`, p);
    }

    public RetryDelivery(deliveryID: string, leaseToken: string, delaySeconds: number, error: string): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        const delay = p.Add(delaySeconds);
        const text = p.Add(error);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET [Status] = N'Pending', [VisibleAt] = DATEADD(SECOND, ${delay}, SYSDATETIMEOFFSET()), [LastError] = ${text}, ${CLEAR_LEASE}
WHERE [ID] = ${id} AND [LeaseToken] = ${token} AND [Status] = N'InFlight'`, p);
    }

    public DeadLetterDelivery(deliveryID: string, leaseToken: string, reason: string, error: string | null): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        const why = p.Add(reason);
        const text = p.Add(error);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET [Status] = N'DeadLettered', [DeadLetterReason] = ${why}, [DeadLetteredAt] = SYSDATETIMEOFFSET(), [LastError] = COALESCE(${text}, [LastError]), ${CLEAR_LEASE}
WHERE [ID] = ${id} AND [LeaseToken] = ${token} AND [Status] = N'InFlight'`, p);
    }

    public ReleaseDelivery(deliveryID: string, leaseToken: string): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET [Status] = N'Pending', [AttemptCount] = CASE WHEN [AttemptCount] > 0 THEN [AttemptCount] - 1 ELSE 0 END, [VisibleAt] = SYSDATETIMEOFFSET(), ${CLEAR_LEASE}
WHERE [ID] = ${id} AND [LeaseToken] = ${token} AND [Status] = N'InFlight'`, p);
    }

    public AdvanceSequenceMark(subscriptionID: string, partitionKey: string): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const key = p.Add(partitionKey);
        const state = this.Table(WorkQueueTables.PartitionState);
        return this.Statement(`
DECLARE @Mark BIGINT;
DECLARE @Original BIGINT;
SELECT @Mark = [LastCompletedSequence], @Original = [LastCompletedSequence]
FROM ${state} WITH (UPDLOCK, ROWLOCK)
WHERE [SubscriptionID] = ${sub} AND [PartitionKey] = ${key};
IF @Mark IS NOT NULL
BEGIN
    WHILE EXISTS (SELECT 1 FROM ${this.Table(WorkQueueTables.Delivery)}
                  WHERE [SubscriptionID] = ${sub} AND [PartitionKey] = ${key} AND [OrderKey] = @Mark + 1 AND [Status] IN (N'Completed', N'Discarded'))
        SET @Mark = @Mark + 1;
    IF @Mark <> @Original
        UPDATE ${state} SET [LastCompletedSequence] = @Mark, [AwaitingSequenceSince] = NULL, [GapStalled] = 0
        WHERE [SubscriptionID] = ${sub} AND [PartitionKey] = ${key};
END
SELECT @Mark AS [LastCompletedSequence];`, p);
    }

    /** Test-only: moves a subscription's pending visibility and lease expiry into the past, standing in for elapsed time. */
    public ShiftTimestampsForConformance(subscriptionID: string, seconds: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const secs = p.Add(seconds);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET [VisibleAt] = DATEADD(SECOND, -${secs}, [VisibleAt]), [LeaseExpiresAt] = DATEADD(SECOND, -${secs}, [LeaseExpiresAt])
WHERE [SubscriptionID] = ${sub} AND [Status] IN (N'Pending', N'InFlight')`, p);
    }

    private HeadPredicates(mode: ClaimPartitionMode, explicitSequence: boolean): string {
        if (mode !== 'Ordered') {
            return '';
        }
        const deliveries = this.Table(WorkQueueTables.Delivery);
        const head = `\n  AND ${NoEarlierUnfinished(deliveries, 'd')}`;
        return explicitSequence ? `${head}\n  AND ${IsNextSequence(this.Table(WorkQueueTables.PartitionState), 'd')}` : head;
    }
}
```

- [ ] **Step 5: Export the new modules**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './sql/sqlserver/SqlServerFragments';
export * from './sql/sqlserver/SqlServerConsumeSql';
```

- [ ] **Step 6: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — sqlExecution (15), SqlServerPublishSql (13), SqlServerConsumeSql (17).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 7: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): SQL Server claim, lease and settle statements"
```

---

### Task 5: SQL Server operator and sweeper statements

**Files:**
- Create: `packages/WorkQueue/engine/src/sql/sqlserver/SqlServerOperatorSql.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/SqlServerOperatorSql.test.ts`

**Interfaces:**
- Consumes: `OperatorSqlBuilder`, `DeadLetterCursor`, `StatementBase` (Task 3); `NoEarlierUnfinished`, `CLEAR_LEASE` (Task 4); `PartitionCondition` from core.
- Produces: `class SqlServerOperatorSql extends StatementBase implements OperatorSqlBuilder`.

Derived conditions (03 §7): `InFlight` when the key has an in-flight delivery; `Blocked` (Ordered only) when the head is `DeadLettered`; `GapStalled`/`AwaitingSequence` from `WorkQueuePartitionState`; otherwise `Idle`. Dead letters page by delivery ID (keyset). Retention purges delete terminal deliveries older than the topic's `RetentionDays`, then messages that have no deliveries left.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/SqlServerOperatorSql.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SqlServerOperatorSql } from '../sql/sqlserver/SqlServerOperatorSql';
import { RecordingExecutor } from './fakes';

const sql = new SqlServerOperatorSql(new RecordingExecutor());
const SUB = 'BBBBBBBB-0000-0000-0000-000000000001';
const DELIVERY = 'EEEEEEEE-0000-0000-0000-000000000001';
const USER = '11111111-0000-0000-0000-000000000001';

describe('SqlServerOperatorSql.SubscriptionStats', () => {
    it('counts statuses, oldest pending age and last-hour completions', () => {
        const statement = sql.SubscriptionStats(SUB, false);
        expect(statement.SQL).toContain("SUM(CASE WHEN d.[Status] = N'Pending' THEN 1 ELSE 0 END) AS [Pending]");
        expect(statement.SQL).toContain('DATEDIFF(SECOND, MIN(CASE WHEN d.[Status] = N\'Pending\' THEN d.[__mj_CreatedAt] END), SYSDATETIMEOFFSET()) AS [OldestPendingAgeSeconds]');
        expect(statement.SQL).toContain('DATEADD(HOUR, -1, SYSDATETIMEOFFSET())');
        expect(statement.SQL).toContain('CAST(NULL AS INT) AS [BlockedKeys]');
        expect(statement.Params).toEqual([SUB]);
    });

    it('counts blocked heads only for Ordered subscriptions', () => {
        const statement = sql.SubscriptionStats(SUB, true);
        expect(statement.SQL).toContain("h.[Status] = N'DeadLettered' AND h.[PartitionKey] IS NOT NULL");
        expect(statement.SQL).toContain('e.[OrderKey] < h.[OrderKey]');
    });
});

describe('SqlServerOperatorSql.ListDeadLetters', () => {
    it('pages dead letters by delivery ID with the message joined', () => {
        const statement = sql.ListDeadLetters(SUB, true, { DeliveryID: DELIVERY }, 51);
        expect(statement.SQL).toContain('SELECT TOP (@p0)');
        expect(statement.SQL).toContain("d.[SubscriptionID] = @p1 AND d.[Status] = N'DeadLettered'");
        expect(statement.SQL).toContain('AND d.[ID] > @p2');
        expect(statement.SQL).toContain('INNER JOIN [__mj].[WorkQueueMessage] m ON m.[ID] = d.[MessageID]');
        expect(statement.SQL).toContain('ORDER BY d.[ID]');
        expect(statement.SQL).toContain('AS [BlocksKey]');
        expect(statement.Params).toEqual([51, SUB, DELIVERY]);
    });

    it('omits the keyset predicate on the first page and never reports blocks for unordered subscriptions', () => {
        const statement = sql.ListDeadLetters(SUB, false, null, 50);
        expect(statement.SQL).not.toContain('d.[ID] >');
        expect(statement.SQL).toContain('CAST(0 AS BIT) AS [BlocksKey]');
    });
});

describe('SqlServerOperatorSql.ListPartitions', () => {
    it('derives conditions per key and filters non-idle keys by default', () => {
        const statement = sql.ListPartitions(SUB, true, null, null, 100);
        expect(statement.SQL).toContain("WHEN k.[InFlightCount] > 0 THEN N'InFlight'");
        expect(statement.SQL).toContain("WHEN h.[Status] = N'DeadLettered' THEN N'Blocked'");
        expect(statement.SQL).toContain("WHEN ps.[GapStalled] = 1 THEN N'GapStalled'");
        expect(statement.SQL).toContain("[Condition] <> N'Idle'");
        expect(statement.SQL).toContain('ORDER BY [PartitionKey]');
    });

    it('filters by an explicit condition after a key', () => {
        const statement = sql.ListPartitions(SUB, false, 'InFlight', 'venue-10', 20);
        expect(statement.SQL).not.toContain("N'Blocked'");
        expect(statement.SQL).toContain('[Condition] = @p');
        expect(statement.SQL).toContain('[PartitionKey] > @p');
        expect(statement.Params).toEqual([SUB, 20, 'InFlight', 'venue-10']);
    });
});

describe('SqlServerOperatorSql resolutions', () => {
    it('replays only a dead-lettered delivery of the subscription and resets attempts', () => {
        const statement = sql.ReplayDelivery(SUB, DELIVERY, USER, 'fixed upstream');
        expect(statement.SQL).toContain("[Status] = N'Pending', [AttemptCount] = 0, [IsReplay] = 1");
        expect(statement.SQL).toContain("WHERE [ID] = @p1 AND [SubscriptionID] = @p0 AND [Status] = N'DeadLettered'");
        expect(statement.Params).toEqual([SUB, DELIVERY, USER, 'fixed upstream']);
    });

    it('discards dead letters, and pending deliveries only when allowed', () => {
        const deadOnly = sql.DiscardDelivery(SUB, DELIVERY, false, USER, 'bad batch');
        expect(deadOnly.SQL).toContain("[Status] IN (N'DeadLettered')");
        expect(deadOnly.SQL).toContain('INTO @Discarded');
        const withPending = sql.DiscardDelivery(SUB, DELIVERY, true, USER, 'cancel');
        expect(withPending.SQL).toContain("[Status] IN (N'DeadLettered', N'Pending')");
    });

    it('cancels an in-flight delivery by stamping CancelRequestedAt and rotating the lease token', () => {
        const statement = sql.CancelInFlightDelivery(SUB, DELIVERY, USER, 'operator cancelled');
        expect(statement.SQL).toContain('[CancelRequestedAt] = SYSDATETIMEOFFSET(), [LeaseToken] = NEWID()');
        expect(statement.SQL).toContain("WHERE [ID] = @p1 AND [SubscriptionID] = @p0 AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NULL");
        expect(statement.SQL).not.toContain("[Status] = N'Discarded'");   // the row stays InFlight until its lease expires
        expect(statement.Params).toEqual([SUB, DELIVERY, USER, 'operator cancelled']);
    });

    it('skips a sequence only from the previous mark when no live delivery holds it', () => {
        const statement = sql.SkipSequence(SUB, 'venue-42', 5);
        expect(statement.SQL).toContain('[LastCompletedSequence] = @p2 - 1');
        expect(statement.SQL).toContain("d.[OrderKey] = @p2 AND d.[Status] <> N'Discarded'");
        expect(statement.Params).toEqual([SUB, 'venue-42', 5]);
    });
});

describe('SqlServerOperatorSql sweeper statements', () => {
    it('expires leases for every subscription using its MaxAttempts', () => {
        const statement = sql.ExpireLeasesAll();
        expect(statement.SQL).toContain('INNER JOIN [__mj].[WorkQueueSubscription] s ON s.[ID] = d.[SubscriptionID]');
        expect(statement.SQL).toContain('d.[AttemptCount] >= s.[MaxAttempts]');
        expect(statement.Params).toEqual([]);
    });

    it('sweeps cancelled in-flight rows to Discarded', () => {
        const statement = sql.ExpireLeasesAll();
        expect(statement.SQL).toContain("[Status] = CASE WHEN d.[CancelRequestedAt] IS NOT NULL THEN N'Discarded'");
        expect(statement.SQL).toContain("[CompletedAt] = CASE WHEN d.[CancelRequestedAt] IS NOT NULL THEN SYSDATETIMEOFFSET() ELSE d.[CompletedAt] END");
    });

    it('flags gap stalls past the subscription alert threshold', () => {
        const statement = sql.FlagGapStalls();
        expect(statement.SQL).toContain('DATEADD(SECOND, -s.[SequenceGapAlertSeconds], SYSDATETIMEOFFSET())');
    });

    it('discards pending deliveries whose sequence is already resolved', () => {
        const statement = sql.DiscardSkippedSequences();
        expect(statement.SQL).toContain("d.[OrderKey] <= ps.[LastCompletedSequence]");
        expect(statement.SQL).toContain("[ResolutionNote] = N'SequenceSkipped'");
    });

    it('purges terminal deliveries and orphan messages by topic retention in batches', () => {
        const deliveries = sql.PurgeTerminalDeliveries(1000);
        expect(deliveries.SQL).toContain('DELETE TOP (@p0) d');
        expect(deliveries.SQL).toContain('DATEADD(DAY, -t.[RetentionDays], SYSDATETIMEOFFSET())');
        const messages = sql.PurgeOrphanMessages(1000);
        expect(messages.SQL).toContain('NOT EXISTS (SELECT 1 FROM [__mj].[WorkQueueDelivery] d WHERE d.[MessageID] = m.[ID])');
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test SqlServerOperatorSql`
Expected: FAIL — unresolved import `../sql/sqlserver/SqlServerOperatorSql`.

- [ ] **Step 3: Write `src/sql/sqlserver/SqlServerOperatorSql.ts`**

```typescript
import type { PartitionCondition } from '@memberjunction/work-queue-core';
import { WorkQueueTables } from '../../constants';
import type { DeadLetterCursor } from '../rows';
import { StatementBase } from '../StatementBase';
import type { OperatorSqlBuilder } from '../WorkQueueSqlBuilder';
import type { SqlStatement } from '../WorkQueueSqlExecutor';
import { CLEAR_LEASE, NoEarlierUnfinished } from './SqlServerFragments';

export class SqlServerOperatorSql extends StatementBase implements OperatorSqlBuilder {
    public SubscriptionStats(subscriptionID: string, ordered: boolean): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        const blocked = ordered
            ? `(SELECT COUNT(*) FROM ${deliveries} h WHERE h.[SubscriptionID] = ${sub} AND h.[Status] = N'DeadLettered' AND h.[PartitionKey] IS NOT NULL AND ${NoEarlierUnfinished(deliveries, 'h')})`
            : 'CAST(NULL AS INT)';
        return this.Statement(`
SELECT
    SUM(CASE WHEN d.[Status] = N'Pending' THEN 1 ELSE 0 END) AS [Pending],
    SUM(CASE WHEN d.[Status] = N'InFlight' THEN 1 ELSE 0 END) AS [InFlight],
    SUM(CASE WHEN d.[Status] = N'DeadLettered' THEN 1 ELSE 0 END) AS [DeadLettered],
    ${blocked} AS [BlockedKeys],
    DATEDIFF(SECOND, MIN(CASE WHEN d.[Status] = N'Pending' THEN d.[__mj_CreatedAt] END), SYSDATETIMEOFFSET()) AS [OldestPendingAgeSeconds],
    SUM(CASE WHEN d.[Status] = N'Completed' AND d.[CompletedAt] >= DATEADD(HOUR, -1, SYSDATETIMEOFFSET()) THEN 1 ELSE 0 END) AS [CompletedLastHour]
FROM ${deliveries} d
WHERE d.[SubscriptionID] = ${sub}`, p);
    }

    public ListDeadLetters(subscriptionID: string, ordered: boolean, after: DeadLetterCursor | null, pageSize: number): SqlStatement {
        const p = this.NewParams();
        const size = p.Add(pageSize);
        const sub = p.Add(subscriptionID);
        const keyset = after ? `\n  AND d.[ID] > ${p.Add(after.DeliveryID)}` : '';
        const deliveries = this.Table(WorkQueueTables.Delivery);
        const blocks = ordered
            ? `CASE WHEN d.[PartitionKey] IS NOT NULL AND ${NoEarlierUnfinished(deliveries, 'd')} THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END`
            : 'CAST(0 AS BIT)';
        return this.Statement(`
SELECT TOP (${size}) d.[ID] AS [DeliveryID], d.[AttemptCount], d.[DeadLetterReason], d.[LastError], d.[DeadLetteredAt],
    d.[PartitionKey] AS [DeliveryPartitionKey], ${blocks} AS [BlocksKey],
    m.[ID] AS [MessageID], m.[PartitionKey], m.[Sequence], m.[Attributes], m.[Payload], m.[PayloadRef], m.[CorrelationID], m.[PublishedAt]
FROM ${deliveries} d
INNER JOIN ${this.Table(WorkQueueTables.Message)} m ON m.[ID] = d.[MessageID]
WHERE d.[SubscriptionID] = ${sub} AND d.[Status] = N'DeadLettered'${keyset}
ORDER BY d.[ID]`, p);
    }

    public ListPartitions(subscriptionID: string, ordered: boolean, condition: PartitionCondition | null,
                          afterPartitionKey: string | null, pageSize: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const size = p.Add(pageSize);
        const conditionFilter = condition ? `[Condition] = ${p.Add(condition)}` : `[Condition] <> N'Idle'`;
        const keyset = afterPartitionKey !== null ? `\n  AND [PartitionKey] > ${p.Add(afterPartitionKey)}` : '';
        const blockedCase = ordered ? `\n             WHEN h.[Status] = N'DeadLettered' THEN N'Blocked'` : '';
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(`
WITH [Keys] AS (
    SELECT d.[PartitionKey],
        SUM(CASE WHEN d.[Status] = N'InFlight' THEN 1 ELSE 0 END) AS [InFlightCount],
        SUM(CASE WHEN d.[Status] = N'Pending' THEN 1 ELSE 0 END) AS [WaitingItems],
        MIN(d.[OrderKey]) AS [HeadOrderKey]
    FROM ${deliveries} d
    WHERE d.[SubscriptionID] = ${sub} AND d.[PartitionKey] IS NOT NULL AND d.[Status] IN (N'Pending', N'InFlight', N'DeadLettered')
    GROUP BY d.[PartitionKey]
), [Shaped] AS (
    SELECT k.[PartitionKey], k.[WaitingItems], h.[ID] AS [HeadDeliveryID], ps.[LastCompletedSequence], ps.[AwaitingSequenceSince],
        CASE WHEN k.[InFlightCount] > 0 THEN N'InFlight'${blockedCase}
             WHEN ps.[GapStalled] = 1 THEN N'GapStalled'
             WHEN ps.[AwaitingSequenceSince] IS NOT NULL THEN N'AwaitingSequence'
             ELSE N'Idle' END AS [Condition]
    FROM [Keys] k
    INNER JOIN ${deliveries} h ON h.[SubscriptionID] = ${sub} AND h.[PartitionKey] = k.[PartitionKey] AND h.[OrderKey] = k.[HeadOrderKey]
    LEFT JOIN ${this.Table(WorkQueueTables.PartitionState)} ps ON ps.[SubscriptionID] = ${sub} AND ps.[PartitionKey] = k.[PartitionKey]
)
SELECT TOP (${size}) [PartitionKey], [Condition], [HeadDeliveryID], [LastCompletedSequence], [AwaitingSequenceSince], [WaitingItems]
FROM [Shaped]
WHERE ${conditionFilter}${keyset}
ORDER BY [PartitionKey];`, p);
    }

    public ReplayDelivery(subscriptionID: string, deliveryID: string, actorUserID: string | null, note: string | null): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const id = p.Add(deliveryID);
        const actor = p.Add(actorUserID);
        const text = p.Add(note);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET [Status] = N'Pending', [AttemptCount] = 0, [IsReplay] = 1, [VisibleAt] = SYSDATETIMEOFFSET(),
    [DeadLetterReason] = NULL, [DeadLetteredAt] = NULL, [ResolvedByUserID] = ${actor}, [ResolutionNote] = ${text}
WHERE [ID] = ${id} AND [SubscriptionID] = ${sub} AND [Status] = N'DeadLettered'`, p);
    }

    public DiscardDelivery(subscriptionID: string, deliveryID: string, allowPending: boolean, actorUserID: string | null, reason: string): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const id = p.Add(deliveryID);
        const actor = p.Add(actorUserID);
        const text = p.Add(reason);
        const statuses = allowPending ? "N'DeadLettered', N'Pending'" : "N'DeadLettered'";
        return this.Statement(`
DECLARE @Discarded TABLE ([PartitionKey] NVARCHAR(200), [OrderKey] BIGINT);
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET [Status] = N'Discarded', [CompletedAt] = SYSDATETIMEOFFSET(), [ResolvedByUserID] = ${actor}, [ResolutionNote] = ${text}, ${CLEAR_LEASE}
OUTPUT inserted.[PartitionKey], inserted.[OrderKey] INTO @Discarded
WHERE [ID] = ${id} AND [SubscriptionID] = ${sub} AND [Status] IN (${statuses});
SELECT [PartitionKey], [OrderKey] FROM @Discarded;`, p);
    }

    public CancelInFlightDelivery(subscriptionID: string, deliveryID: string, actorUserID: string | null, reason: string): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const id = p.Add(deliveryID);
        const actor = p.Add(actorUserID);
        const text = p.Add(reason);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET [CancelRequestedAt] = SYSDATETIMEOFFSET(), [LeaseToken] = NEWID(),
    [ResolvedByUserID] = ${actor}, [ResolutionNote] = ${text}
WHERE [ID] = ${id} AND [SubscriptionID] = ${sub} AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NULL`, p);
    }

    public SkipSequence(subscriptionID: string, partitionKey: string, sequence: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const key = p.Add(partitionKey);
        const seq = p.Add(sequence);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.PartitionState)}
SET [LastCompletedSequence] = ${seq}, [AwaitingSequenceSince] = NULL, [GapStalled] = 0
WHERE [SubscriptionID] = ${sub} AND [PartitionKey] = ${key} AND [LastCompletedSequence] = ${seq} - 1
  AND NOT EXISTS (SELECT 1 FROM ${this.Table(WorkQueueTables.Delivery)} d
                  WHERE d.[SubscriptionID] = ${sub} AND d.[PartitionKey] = ${key} AND d.[OrderKey] = ${seq} AND d.[Status] <> N'Discarded')`, p);
    }

    public ExpireLeasesAll(): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
${EXPIRED_TABLE_DECLARATION}
UPDATE d SET
    [Status] = CASE WHEN d.[CancelRequestedAt] IS NOT NULL THEN N'Discarded'
                    WHEN d.[AttemptCount] >= s.[MaxAttempts] THEN N'DeadLettered' ELSE N'Pending' END,
    [DeadLetterReason] = CASE WHEN d.[CancelRequestedAt] IS NULL AND d.[AttemptCount] >= s.[MaxAttempts] THEN N'LeaseExpired' ELSE d.[DeadLetterReason] END,
    [DeadLetteredAt] = CASE WHEN d.[CancelRequestedAt] IS NULL AND d.[AttemptCount] >= s.[MaxAttempts] THEN SYSDATETIMEOFFSET() ELSE d.[DeadLetteredAt] END,
    [CompletedAt] = CASE WHEN d.[CancelRequestedAt] IS NOT NULL THEN SYSDATETIMEOFFSET() ELSE d.[CompletedAt] END,
    [LastError] = CASE WHEN d.[CancelRequestedAt] IS NOT NULL THEN d.[LastError] ELSE N'LeaseExpired' END,
    [VisibleAt] = SYSDATETIMEOFFSET(), ${CLEAR_LEASE}
OUTPUT inserted.[ID], inserted.[SubscriptionID], inserted.[PartitionKey], inserted.[Status] INTO @Expired
FROM ${this.Table(WorkQueueTables.Delivery)} d
INNER JOIN ${this.Table(WorkQueueTables.Subscription)} s ON s.[ID] = d.[SubscriptionID]
WHERE d.[Status] = N'InFlight' AND d.[LeaseExpiresAt] < SYSDATETIMEOFFSET();
${EXPIRED_DEAD_LETTER_SELECT}`, p);
    }

    public FlagGapStalls(): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
UPDATE ps SET [GapStalled] = 1
FROM ${this.Table(WorkQueueTables.PartitionState)} ps
INNER JOIN ${this.Table(WorkQueueTables.Subscription)} s ON s.[ID] = ps.[SubscriptionID]
WHERE ps.[GapStalled] = 0 AND ps.[AwaitingSequenceSince] IS NOT NULL AND s.[SequenceGapAlertSeconds] IS NOT NULL
  AND ps.[AwaitingSequenceSince] <= DATEADD(SECOND, -s.[SequenceGapAlertSeconds], SYSDATETIMEOFFSET())`, p);
    }

    public DiscardSkippedSequences(): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
UPDATE d SET [Status] = N'Discarded', [CompletedAt] = SYSDATETIMEOFFSET(), [ResolutionNote] = N'SequenceSkipped'
FROM ${this.Table(WorkQueueTables.Delivery)} d
INNER JOIN ${this.Table(WorkQueueTables.PartitionState)} ps ON ps.[SubscriptionID] = d.[SubscriptionID] AND ps.[PartitionKey] = d.[PartitionKey]
WHERE d.[Status] = N'Pending' AND d.[OrderKey] <= ps.[LastCompletedSequence]`, p);
    }

    public PurgeTerminalDeliveries(batchSize: number): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
DELETE TOP (${p.Add(batchSize)}) d
FROM ${this.Table(WorkQueueTables.Delivery)} d
INNER JOIN ${this.Table(WorkQueueTables.Subscription)} s ON s.[ID] = d.[SubscriptionID]
INNER JOIN ${this.Table(WorkQueueTables.Topic)} t ON t.[ID] = s.[TopicID]
WHERE d.[Status] IN (N'Completed', N'Discarded') AND d.[CompletedAt] < DATEADD(DAY, -t.[RetentionDays], SYSDATETIMEOFFSET())`, p);
    }

    public PurgeOrphanMessages(batchSize: number): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
DELETE TOP (${p.Add(batchSize)}) m
FROM ${this.Table(WorkQueueTables.Message)} m
INNER JOIN ${this.Table(WorkQueueTables.Topic)} t ON t.[ID] = m.[TopicID]
WHERE m.[PublishedAt] < DATEADD(DAY, -t.[RetentionDays], SYSDATETIMEOFFSET())
  AND NOT EXISTS (SELECT 1 FROM ${this.Table(WorkQueueTables.Delivery)} d WHERE d.[MessageID] = m.[ID])`, p);
    }
}
```

- [ ] **Step 4: Export the new module**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './sql/sqlserver/SqlServerOperatorSql';
```

- [ ] **Step 5: Write the autoscaler scaler query and its least-privilege login**

External autoscalers (KEDA's `mssql`/`postgresql` scalers, Azure Container Apps job scale rules) run **one SELECT**
against the queue, with no MJ code in the loop. It must count claimable `Pending` **and** `InFlight`: scalers subtract
running executions from the metric, so a Pending-only count stops new workers starting while a backlog drains (this is
exactly what starved MJ Central's queue — [01 use case 3](01-use-cases.md), R3.5). Keep it index-friendly: it runs every
few seconds.

`scripts/work-queue-scaler-login.sql` (flat `scripts/` folder, as `scripts/pg-bootstrap-helpers.sql`):

```sql
-- Least-privilege login for an external autoscaler (KEDA / ACA job scale rules).
-- Grants SELECT on the two work-queue tables the scaler query reads, and nothing else.
-- Usage: sqlcmd -S <server> -d <database> -v Password="<strong-password>" -i scripts/work-queue-scaler-login.sql
CREATE LOGIN mj_workqueue_scaler WITH PASSWORD = '$(Password)';
GO
CREATE USER mj_workqueue_scaler FOR LOGIN mj_workqueue_scaler;
GO
GRANT SELECT ON OBJECT::__mj.WorkQueueDelivery TO mj_workqueue_scaler;
GRANT SELECT ON OBJECT::__mj.WorkQueueSubscription TO mj_workqueue_scaler;
GO
```

PostgreSQL equivalent (same file, in a commented block at the end):

```sql
-- CREATE ROLE mj_workqueue_scaler LOGIN PASSWORD '<strong-password>';
-- GRANT USAGE ON SCHEMA __mj TO mj_workqueue_scaler;
-- GRANT SELECT ON __mj."WorkQueueDelivery", __mj."WorkQueueSubscription" TO mj_workqueue_scaler;
```

The scaler query itself, parameterised by subscription name (SQL Server shown; the PostgreSQL form replaces
`SYSDATETIMEOFFSET()` with `now()`, brackets with double quotes, and `+ 0` stays):

```sql
SELECT
    (SELECT COUNT(*) FROM __mj.WorkQueueDelivery d
      INNER JOIN __mj.WorkQueueSubscription s ON s.ID = d.SubscriptionID
     WHERE s.Name = @SubscriptionName AND s.Status = 'Active'
       AND d.Status = 'Pending' AND d.PartitionKey IS NULL AND d.VisibleAt <= SYSDATETIMEOFFSET())
  + (SELECT COUNT(DISTINCT d.PartitionKey) FROM __mj.WorkQueueDelivery d
      INNER JOIN __mj.WorkQueueSubscription s ON s.ID = d.SubscriptionID
     WHERE s.Name = @SubscriptionName AND s.Status = 'Active'
       AND d.Status = 'Pending' AND d.PartitionKey IS NOT NULL AND d.VisibleAt <= SYSDATETIMEOFFSET()
       AND NOT EXISTS (SELECT 1 FROM __mj.WorkQueueDelivery f
                       WHERE f.SubscriptionID = d.SubscriptionID AND f.PartitionKey = d.PartitionKey AND f.Status = 'InFlight'))
  + (SELECT COUNT(*) FROM __mj.WorkQueueDelivery d
      INNER JOIN __mj.WorkQueueSubscription s ON s.ID = d.SubscriptionID
     WHERE s.Name = @SubscriptionName AND s.Status = 'Active' AND d.Status = 'InFlight') AS Backlog;
```

Notes to carry into plan 06's runbook (which owns the KEDA/ACA job recipe):

- This standalone form approximates `Ordered` subscriptions: it applies single-flight per key but not head-of-line or
  next-sequence rules, so a blocked key can overcount by one. A container that starts and claims nothing exits 0 in
  seconds, so the cost is a wasted start, never a stuck queue. `WorkQueue.GetBacklog` (remote operation, plan 06) uses
  `SubscriptionBacklog` and is exact; prefer it where the scaler can call an API.
- `targetValue` of 1 with `parallelism = 1` gives one container per claimable item.

- [ ] **Step 6: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — sqlExecution (15), SqlServerPublishSql (13), SqlServerConsumeSql (19), SqlServerOperatorSql (15).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 7: Commit**

```bash
git add packages/WorkQueue/engine/src scripts/work-queue-scaler-login.sql
git commit -m "feat(work-queue-engine): SQL Server operator and sweeper statements, autoscaler backlog query"
```

---

### Task 6: PostgreSQL statements and the builder factory

**Files:**
- Create: `packages/WorkQueue/engine/src/sql/postgresql/PostgreSQLFragments.ts`
- Create: `packages/WorkQueue/engine/src/sql/postgresql/PostgreSQLPublishSql.ts`, `PostgreSQLConsumeSql.ts`, `PostgreSQLOperatorSql.ts`
- Create: `packages/WorkQueue/engine/src/sql/CreateWorkQueueSqlBuilder.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/PostgreSQLSql.test.ts`, `src/__tests__/CreateWorkQueueSqlBuilder.test.ts`

**Interfaces:**
- Consumes: builder interfaces, rows and `StatementBase` (Task 3); `WorkQueueTables`, `DELIVERY_INSERT_CHUNK`, `SqlBuilderContext`, `WorkQueueSqlExecutor` (Task 2); `SqlServer*Sql` (Tasks 3–5); `WorkQueueConfigurationError` from core.
- Produces:
  - `class PostgreSQLPublishSql`, `class PostgreSQLConsumeSql`, `class PostgreSQLOperatorSql` (same methods and row shapes as the SQL Server classes)
  - `CreateWorkQueueSqlBuilder(context: SqlBuilderContext & Pick<WorkQueueSqlExecutor, 'PlatformKey'>): WorkQueueSqlBuilder`

PostgreSQL shapes: skip-locked claims use a `FOR UPDATE SKIP LOCKED` CTE feeding `UPDATE … FROM … RETURNING`; publish-order locks use `pg_advisory_xact_lock(hashtextextended(…, 0))`; inserts that may conflict use `ON CONFLICT … DO NOTHING`; the sequence mark advances with a recursive CTE; batch deletes use `WHERE "ID" IN (SELECT … LIMIT n)`. Every parameter is cast. Columns are written with double quotes because CodeGen's PostgreSQL tables keep PascalCase names. `ExecuteWrite` wraps write statements in the dialect's `WITH … RETURNING 1` counter, so write statements never carry their own `RETURNING`.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/PostgreSQLSql.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PostgreSQLPublishSql } from '../sql/postgresql/PostgreSQLPublishSql';
import { PostgreSQLConsumeSql } from '../sql/postgresql/PostgreSQLConsumeSql';
import { PostgreSQLOperatorSql } from '../sql/postgresql/PostgreSQLOperatorSql';
import { RecordingExecutor } from './fakes';

const context = new RecordingExecutor('postgresql');
const publish = new PostgreSQLPublishSql(context);
const consume = new PostgreSQLConsumeSql(context);
const operator = new PostgreSQLOperatorSql(context);
const TOPIC = 'aaaaaaaa-0000-0000-0000-000000000001';
const SUB = 'bbbbbbbb-0000-0000-0000-000000000001';
const MSG = 'cccccccc-0000-0000-0000-000000000001';
const DELIVERY = 'eeeeeeee-0000-0000-0000-000000000001';
const TOKEN = 'ffffffff-0000-0000-0000-000000000001';

describe('PostgreSQLPublishSql', () => {
    it('takes a transaction-scoped advisory lock', () => {
        const statement = publish.AcquirePublishOrderLock(TOPIC, 'venue-42');
        expect(statement.SQL).toBe('SELECT 0 AS "LockResult" FROM pg_advisory_xact_lock(hashtextextended($1::text, 0))');
    });

    it('inserts a message with ON CONFLICT and reports existing rows', () => {
        const statement = publish.InsertMessage({
            ID: MSG, TopicID: TOPIC, PartitionKey: 'k', Sequence: 2, AttributesJSON: '{}', PayloadJSON: null,
            PayloadRefJSON: null, CorrelationID: null, PublishedAt: new Date('2026-01-01T00:00:00Z'), PublishedByUserID: null,
        });
        expect(statement.SQL).toContain('ON CONFLICT DO NOTHING');
        expect(statement.SQL).toContain('RETURNING "ID", "PublishOrdinal"');
        expect(statement.SQL).toContain("SELECT 'Exists' AS \"Outcome\"");
        expect(statement.SQL).toContain('$4::bigint IS NOT NULL');
        expect(statement.Params).toHaveLength(10);
    });

    it('inserts deliveries idempotently, discarding already-resolved sequences', () => {
        const statement = publish.InsertDeliveries([{ MessageID: MSG, SubscriptionID: SUB, PartitionKey: null, OrderKey: 7 }]);
        expect(statement.SQL).toContain('($1::uuid, $2::uuid, $3::text, $4::bigint)');
        expect(statement.SQL).toContain(`CASE WHEN ps."LastCompletedSequence" >= v."OrderKey" THEN 'Discarded' ELSE 'Pending' END`);
        expect(statement.SQL).toContain('ON CONFLICT ("SubscriptionID", "MessageID") DO NOTHING');
    });

    it('reserves a deduplication key with ON CONFLICT on the topic and key', () => {
        const statement = publish.ReserveDeduplication(TOPIC, 'k1', MSG, 120);
        expect(statement.SQL).toContain('ON CONFLICT ("TopicID", "DeduplicationKey") DO NOTHING');
        expect(statement.SQL).toContain('make_interval(secs => $4::int)');
        expect(statement.Params).toEqual([TOPIC, 'k1', MSG, 120]);
    });

    it('purges expired keys through a limited subquery', () => {
        expect(publish.PurgeExpiredDeduplications(500).SQL).toContain('LIMIT $1::int');
    });
});

describe('PostgreSQLConsumeSql', () => {
    it('claims keyless rows with FOR UPDATE SKIP LOCKED and returns the joined message', () => {
        const statement = consume.ClaimUnpartitioned(SUB, 'host:1:abc', 60, 10);
        expect(statement.SQL).toContain('FOR UPDATE SKIP LOCKED');
        expect(statement.SQL).toContain('"LeaseToken" = gen_random_uuid()');
        expect(statement.SQL).toContain('RETURNING u."ID", u."MessageID"');
        expect(statement.SQL).toContain('JOIN "__mj"."WorkQueueMessage" m ON m."ID" = c."MessageID"');
        expect(statement.Params).toEqual([SUB, 'host:1:abc', 60, 10]);
    });

    it('selects Ordered explicit-sequence candidates with head and sequence rules', () => {
        const statement = consume.SelectPartitionCandidates(SUB, 'Ordered', true, 20);
        expect(statement.SQL).toContain('e."OrderKey" < d."OrderKey"');
        expect(statement.SQL).toContain('COALESCE((SELECT ps."LastCompletedSequence"');
        expect(statement.SQL).toContain('LIMIT $2::int');
    });

    it('fences settles on token and status', () => {
        const statement = consume.RetryDelivery(DELIVERY, TOKEN, 30, 'boom');
        expect(statement.SQL).toContain(`WHERE "ID" = $1::uuid AND "LeaseToken" = $2::uuid AND "Status" = 'InFlight'`);
        expect(statement.SQL).not.toContain('RETURNING');
    });

    it('completes with RETURNING for sequence advancement', () => {
        expect(consume.CompleteDelivery(DELIVERY, TOKEN).SQL).toContain('RETURNING "SubscriptionID", "PartitionKey", "OrderKey"');
    });

    it('counts the autoscaler backlog with the same claimability rules', () => {
        expect(consume.SubscriptionBacklog(SUB, 'Exclusive', false).SQL).toContain('count(DISTINCT d."PartitionKey")');
        expect(consume.SubscriptionBacklog(SUB, 'None', false).SQL).toContain('+ 0 AS "Claimable"');
        expect(consume.SubscriptionBacklog(SUB, 'None', false).SQL).toContain(`d."Status" = 'InFlight') AS "InFlight"`);
    });

    it('advances the sequence mark with a recursive CTE', () => {
        const statement = consume.AdvanceSequenceMark(SUB, 'venue-42');
        expect(statement.SQL.startsWith('WITH RECURSIVE')).toBe(true);
        expect(statement.SQL).toContain(`d."Status" IN ('Completed', 'Discarded')`);
        expect(statement.Params).toEqual([SUB, 'venue-42']);
    });
});

describe('PostgreSQLOperatorSql', () => {
    it('computes stats with FILTER clauses', () => {
        const statement = operator.SubscriptionStats(SUB, true);
        expect(statement.SQL).toContain(`COUNT(*) FILTER (WHERE d."Status" = 'Pending') AS "Pending"`);
        expect(statement.SQL).toContain('EXTRACT(EPOCH FROM');
    });

    it('discards with RETURNING and purges by retention', () => {
        expect(operator.DiscardDelivery(SUB, DELIVERY, true, null, 'x').SQL).toContain('RETURNING "PartitionKey", "OrderKey"');
        expect(operator.CancelInFlightDelivery(SUB, DELIVERY, null, 'x').SQL)
            .toContain('"CancelRequestedAt" = now(), "LeaseToken" = gen_random_uuid()');
        expect(operator.CancelInFlightDelivery(SUB, DELIVERY, null, 'x').SQL)
            .toContain(`"Status" = 'InFlight' AND "CancelRequestedAt" IS NULL`);
        expect(operator.PurgeTerminalDeliveries(100).SQL).toContain('make_interval(days => t."RetentionDays")');
    });

    it('lists partitions with LIMIT and a keyset', () => {
        const statement = operator.ListPartitions(SUB, true, 'Blocked', 'venue-1', 25);
        expect(statement.SQL).toContain(`"Condition" = $3::text`);
        expect(statement.SQL).toContain(`"PartitionKey" > $4::text`);
        expect(statement.SQL).toContain('LIMIT $2::int');
    });
});
```

`packages/WorkQueue/engine/src/__tests__/CreateWorkQueueSqlBuilder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import { SqlServerPublishSql } from '../sql/sqlserver/SqlServerPublishSql';
import { SqlServerConsumeSql } from '../sql/sqlserver/SqlServerConsumeSql';
import { SqlServerOperatorSql } from '../sql/sqlserver/SqlServerOperatorSql';
import { PostgreSQLPublishSql } from '../sql/postgresql/PostgreSQLPublishSql';
import { PostgreSQLConsumeSql } from '../sql/postgresql/PostgreSQLConsumeSql';
import { PostgreSQLOperatorSql } from '../sql/postgresql/PostgreSQLOperatorSql';
import { RecordingExecutor } from './fakes';

describe('CreateWorkQueueSqlBuilder', () => {
    it('builds SQL Server statement builders', () => {
        const builder = CreateWorkQueueSqlBuilder(new RecordingExecutor('sqlserver'));
        expect(builder.Publish).toBeInstanceOf(SqlServerPublishSql);
        expect(builder.Consume).toBeInstanceOf(SqlServerConsumeSql);
        expect(builder.Operator).toBeInstanceOf(SqlServerOperatorSql);
    });

    it('builds PostgreSQL statement builders', () => {
        const builder = CreateWorkQueueSqlBuilder(new RecordingExecutor('postgresql'));
        expect(builder.Publish).toBeInstanceOf(PostgreSQLPublishSql);
        expect(builder.Consume).toBeInstanceOf(PostgreSQLConsumeSql);
        expect(builder.Operator).toBeInstanceOf(PostgreSQLOperatorSql);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test PostgreSQLSql CreateWorkQueueSqlBuilder`
Expected: FAIL — unresolved imports under `../sql/postgresql/` and `../sql/CreateWorkQueueSqlBuilder`.

- [ ] **Step 3: Write `src/sql/postgresql/PostgreSQLFragments.ts`**

```typescript
/** Reusable PostgreSQL predicate and clause fragments. Table arguments are already qualified. */

export function ActiveSubscriptionGuard(subscriptionTable: string, subscriptionParam: string): string {
    return `EXISTS (SELECT 1 FROM ${subscriptionTable} s WHERE s."ID" = ${subscriptionParam}::uuid AND s."Status" = 'Active')`;
}

export function NoInFlightForKey(deliveryTable: string, alias: string): string {
    return `NOT EXISTS (SELECT 1 FROM ${deliveryTable} f WHERE f."SubscriptionID" = ${alias}."SubscriptionID" `
        + `AND f."PartitionKey" = ${alias}."PartitionKey" AND f."Status" = 'InFlight')`;
}

export function NoEarlierUnfinished(deliveryTable: string, alias: string): string {
    return `NOT EXISTS (SELECT 1 FROM ${deliveryTable} e WHERE e."SubscriptionID" = ${alias}."SubscriptionID" `
        + `AND e."PartitionKey" = ${alias}."PartitionKey" AND e."OrderKey" < ${alias}."OrderKey" `
        + `AND e."Status" IN ('Pending', 'InFlight', 'DeadLettered'))`;
}

export function IsNextSequence(stateTable: string, alias: string): string {
    return `${alias}."OrderKey" = COALESCE((SELECT ps."LastCompletedSequence" FROM ${stateTable} ps `
        + `WHERE ps."SubscriptionID" = ${alias}."SubscriptionID" AND ps."PartitionKey" = ${alias}."PartitionKey"), 0) + 1`;
}

export function ClaimSetClause(alias: string, ownerParam: string, leaseParam: string): string {
    return `"Status" = 'InFlight', "LeaseToken" = gen_random_uuid(), "LeaseOwner" = ${ownerParam}::text, `
        + `"LeaseExpiresAt" = now() + make_interval(secs => ${leaseParam}::int), "LastHeartbeatAt" = now(), `
        + `"AttemptCount" = ${alias}."AttemptCount" + 1, "Progress" = NULL`;
}

export function ClaimReturning(alias: string): string {
    return `RETURNING ${alias}."ID", ${alias}."MessageID", ${alias}."AttemptCount", ${alias}."LeaseToken", ${alias}."LeaseExpiresAt", ${alias}."IsReplay"`;
}

export function ClaimedSelect(messageTable: string): string {
    return 'SELECT c."ID" AS "DeliveryID", c."AttemptCount", c."LeaseToken", c."LeaseExpiresAt", c."IsReplay", '
        + 'm."ID" AS "MessageID", m."PartitionKey", m."Sequence", m."Attributes", m."Payload", m."PayloadRef", m."CorrelationID", m."PublishedAt"\n'
        + `FROM claimed c JOIN ${messageTable} m ON m."ID" = c."MessageID"`;
}

export const CLEAR_LEASE = '"LeaseToken" = NULL, "LeaseOwner" = NULL, "LeaseExpiresAt" = NULL';

/** Expire passes return only the rows that ended DeadLettered — the engine's OnDeadLettered seam (03 §11). */
export const EXPIRED_DEAD_LETTER_RETURNING =
    `RETURNING CASE WHEN "Status" = 'DeadLettered' THEN "ID" END AS "DeliveryID", "SubscriptionID", "PartitionKey", "Status"`;
```

- [ ] **Step 4: Write `src/sql/postgresql/PostgreSQLPublishSql.ts`**

```typescript
import { DELIVERY_INSERT_CHUNK, WorkQueueTables } from '../../constants';
import type { DeliveryInsertRow, MessageInsertRow } from '../rows';
import { StatementBase } from '../StatementBase';
import type { PublishSqlBuilder } from '../WorkQueueSqlBuilder';
import { PublishOrderLockResource } from '../WorkQueueSqlBuilder';
import type { SqlStatement } from '../WorkQueueSqlExecutor';

export class PostgreSQLPublishSql extends StatementBase implements PublishSqlBuilder {
    public AcquirePublishOrderLock(topicID: string, partitionKey: string): SqlStatement {
        const p = this.NewParams();
        const resource = p.Add(PublishOrderLockResource(topicID, partitionKey));
        return this.Statement(`SELECT 0 AS "LockResult" FROM pg_advisory_xact_lock(hashtextextended(${resource}::text, 0))`, p);
    }

    public InsertMessage(row: MessageInsertRow): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(row.ID);
        const topic = p.Add(row.TopicID);
        const key = p.Add(row.PartitionKey);
        const seq = p.Add(row.Sequence);
        const attrs = p.Add(row.AttributesJSON);
        const payload = p.Add(row.PayloadJSON);
        const ref = p.Add(row.PayloadRefJSON);
        const corr = p.Add(row.CorrelationID);
        const at = p.Add(row.PublishedAt);
        const user = p.Add(row.PublishedByUserID);
        const table = this.Table(WorkQueueTables.Message);
        return this.Statement(`
WITH existing AS (
    SELECT m."ID", m."PublishOrdinal", m."TopicID", m."PartitionKey", m."Sequence", m."Attributes", m."Payload", m."PayloadRef", m."CorrelationID"
    FROM ${table} m
    WHERE m."ID" = ${id}::uuid
       OR (${seq}::bigint IS NOT NULL AND m."TopicID" = ${topic}::uuid AND m."PartitionKey" = ${key}::text AND m."Sequence" = ${seq}::bigint)
), inserted AS (
    INSERT INTO ${table} ("ID", "TopicID", "PartitionKey", "Sequence", "Attributes", "Payload", "PayloadRef", "CorrelationID", "PublishedAt", "PublishedByUserID")
    SELECT ${id}::uuid, ${topic}::uuid, ${key}::text, ${seq}::bigint, ${attrs}::text, ${payload}::text, ${ref}::text, ${corr}::text, ${at}::timestamptz, ${user}::uuid
    WHERE NOT EXISTS (SELECT 1 FROM existing)
    ON CONFLICT DO NOTHING
    RETURNING "ID", "PublishOrdinal"
)
SELECT 'Inserted' AS "Outcome", i."ID", i."PublishOrdinal", NULL::uuid AS "TopicID", NULL::text AS "PartitionKey", NULL::bigint AS "Sequence",
    NULL::text AS "Attributes", NULL::text AS "Payload", NULL::text AS "PayloadRef", NULL::text AS "CorrelationID"
FROM inserted i
UNION ALL
SELECT 'Exists' AS "Outcome", e."ID", e."PublishOrdinal", e."TopicID", e."PartitionKey", e."Sequence", e."Attributes", e."Payload", e."PayloadRef", e."CorrelationID"
FROM existing e`, p);
    }

    public InsertDeliveries(rows: DeliveryInsertRow[]): SqlStatement {
        if (rows.length === 0 || rows.length > DELIVERY_INSERT_CHUNK) {
            throw new RangeError(`InsertDeliveries accepts 1-${DELIVERY_INSERT_CHUNK} rows; got ${rows.length}`);
        }
        const p = this.NewParams();
        const values = rows.map(r =>
            `(${p.Add(r.MessageID)}::uuid, ${p.Add(r.SubscriptionID)}::uuid, ${p.Add(r.PartitionKey)}::text, ${p.Add(r.OrderKey)}::bigint)`,
        );
        return this.Statement(`
INSERT INTO ${this.Table(WorkQueueTables.Delivery)} ("ID", "MessageID", "SubscriptionID", "Status", "PartitionKey", "OrderKey", "AttemptCount", "IsReplay", "VisibleAt", "CompletedAt", "ResolutionNote")
SELECT gen_random_uuid(), v."MessageID", v."SubscriptionID",
    CASE WHEN ps."LastCompletedSequence" >= v."OrderKey" THEN 'Discarded' ELSE 'Pending' END,
    v."PartitionKey", v."OrderKey", 0, false, now(),
    CASE WHEN ps."LastCompletedSequence" >= v."OrderKey" THEN now() END,
    CASE WHEN ps."LastCompletedSequence" >= v."OrderKey" THEN 'SequenceAlreadyResolved' END
FROM (VALUES ${values.join(',\n             ')}) AS v ("MessageID", "SubscriptionID", "PartitionKey", "OrderKey")
LEFT JOIN ${this.Table(WorkQueueTables.PartitionState)} ps ON ps."SubscriptionID" = v."SubscriptionID" AND ps."PartitionKey" = v."PartitionKey"
ON CONFLICT ("SubscriptionID", "MessageID") DO NOTHING`, p);
    }

    public EnsureSequenceState(subscriptionID: string, partitionKey: string): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
INSERT INTO ${this.Table(WorkQueueTables.PartitionState)} ("ID", "SubscriptionID", "PartitionKey", "LastCompletedSequence", "GapStalled")
VALUES (gen_random_uuid(), ${p.Add(subscriptionID)}::uuid, ${p.Add(partitionKey)}::text, 0, false)
ON CONFLICT ("SubscriptionID", "PartitionKey") DO NOTHING`, p);
    }

    public DeleteExpiredDeduplicationKey(topicID: string, key: string): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
DELETE FROM ${this.Table(WorkQueueTables.Deduplication)}
WHERE "TopicID" = ${p.Add(topicID)}::uuid AND "DeduplicationKey" = ${p.Add(key)}::text AND "ExpiresAt" <= now()`, p);
    }

    public ReserveDeduplication(topicID: string, key: string, messageID: string, reserveSeconds: number): SqlStatement {
        const p = this.NewParams();
        const topic = p.Add(topicID);
        const k = p.Add(key);
        const message = p.Add(messageID);
        const seconds = p.Add(reserveSeconds);
        const table = this.Table(WorkQueueTables.Deduplication);
        return this.Statement(`
WITH reserved AS (
    INSERT INTO ${table} ("ID", "TopicID", "DeduplicationKey", "MessageID", "Status", "ExpiresAt")
    VALUES (gen_random_uuid(), ${topic}::uuid, ${k}::text, ${message}::uuid, 'Reserved', now() + make_interval(secs => ${seconds}::int))
    ON CONFLICT ("TopicID", "DeduplicationKey") DO NOTHING
    RETURNING "MessageID"
)
SELECT r."MessageID", true AS "Inserted" FROM reserved r
UNION ALL
SELECT x."MessageID", false AS "Inserted" FROM ${table} x
WHERE x."TopicID" = ${topic}::uuid AND x."DeduplicationKey" = ${k}::text AND NOT EXISTS (SELECT 1 FROM reserved)`, p);
    }

    public ConfirmDeduplication(topicID: string, key: string, messageID: string, ttlSeconds: number): SqlStatement {
        const p = this.NewParams();
        const topic = p.Add(topicID);
        const k = p.Add(key);
        const message = p.Add(messageID);
        const ttl = p.Add(ttlSeconds);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Deduplication)}
SET "Status" = 'Confirmed', "ExpiresAt" = now() + make_interval(secs => ${ttl}::int)
WHERE "TopicID" = ${topic}::uuid AND "DeduplicationKey" = ${k}::text AND "MessageID" = ${message}::uuid`, p);
    }

    public ReleaseDeduplication(topicID: string, key: string, messageID: string): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
DELETE FROM ${this.Table(WorkQueueTables.Deduplication)}
WHERE "TopicID" = ${p.Add(topicID)}::uuid AND "DeduplicationKey" = ${p.Add(key)}::text AND "MessageID" = ${p.Add(messageID)}::uuid AND "Status" = 'Reserved'`, p);
    }

    public PurgeExpiredDeduplications(batchSize: number): SqlStatement {
        const p = this.NewParams();
        const table = this.Table(WorkQueueTables.Deduplication);
        return this.Statement(`
DELETE FROM ${table}
WHERE "ID" IN (SELECT x."ID" FROM ${table} x WHERE x."ExpiresAt" <= now() LIMIT ${p.Add(batchSize)}::int)`, p);
    }
}
```

- [ ] **Step 5: Write `src/sql/postgresql/PostgreSQLConsumeSql.ts`**

```typescript
import { WorkQueueTables } from '../../constants';
import type { ClaimPartitionMode } from '../rows';
import { StatementBase } from '../StatementBase';
import type { ConsumeSqlBuilder } from '../WorkQueueSqlBuilder';
import type { SqlStatement } from '../WorkQueueSqlExecutor';
import {
    ActiveSubscriptionGuard, ClaimedSelect, ClaimReturning, ClaimSetClause, CLEAR_LEASE,
    IsNextSequence, NoEarlierUnfinished, NoInFlightForKey,
} from './PostgreSQLFragments';

export class PostgreSQLConsumeSql extends StatementBase implements ConsumeSqlBuilder {
    public ExpireLeases(subscriptionID: string, maxAttempts: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const max = p.Add(maxAttempts);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)} SET
    "Status" = CASE WHEN "CancelRequestedAt" IS NOT NULL THEN 'Discarded'
                    WHEN "AttemptCount" >= ${max}::int THEN 'DeadLettered' ELSE 'Pending' END,
    "DeadLetterReason" = CASE WHEN "CancelRequestedAt" IS NULL AND "AttemptCount" >= ${max}::int THEN 'LeaseExpired' ELSE "DeadLetterReason" END,
    "DeadLetteredAt" = CASE WHEN "CancelRequestedAt" IS NULL AND "AttemptCount" >= ${max}::int THEN now() ELSE "DeadLetteredAt" END,
    "CompletedAt" = CASE WHEN "CancelRequestedAt" IS NOT NULL THEN now() ELSE "CompletedAt" END,
    "LastError" = CASE WHEN "CancelRequestedAt" IS NOT NULL THEN "LastError" ELSE 'LeaseExpired' END,
    "VisibleAt" = now(), ${CLEAR_LEASE}
WHERE "SubscriptionID" = ${sub}::uuid AND "Status" = 'InFlight' AND "LeaseExpiresAt" < now()
${EXPIRED_DEAD_LETTER_RETURNING}`, p);
    }

    public ClaimUnpartitioned(subscriptionID: string, leaseOwner: string, leaseSeconds: number, maxRows: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const owner = p.Add(leaseOwner);
        const lease = p.Add(leaseSeconds);
        const max = p.Add(maxRows);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(`
WITH ready AS (
    SELECT d."ID"
    FROM ${deliveries} d
    WHERE d."SubscriptionID" = ${sub}::uuid AND d."Status" = 'Pending' AND d."PartitionKey" IS NULL AND d."VisibleAt" <= now()
      AND ${ActiveSubscriptionGuard(this.Table(WorkQueueTables.Subscription), sub)}
    ORDER BY d."VisibleAt"
    LIMIT ${max}::int
    FOR UPDATE SKIP LOCKED
), claimed AS (
    UPDATE ${deliveries} u SET ${ClaimSetClause('u', owner, lease)}
    FROM ready r
    WHERE u."ID" = r."ID"
    ${ClaimReturning('u')}
)
${ClaimedSelect(this.Table(WorkQueueTables.Message))}`, p);
    }

    public SelectPartitionCandidates(subscriptionID: string, mode: ClaimPartitionMode, explicitSequence: boolean, maxRows: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const max = p.Add(maxRows);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(`
WITH ready AS (
    SELECT d."ID", d."PartitionKey", d."OrderKey", d."VisibleAt",
        ROW_NUMBER() OVER (PARTITION BY d."PartitionKey" ORDER BY d."OrderKey") AS "KeyRank"
    FROM ${deliveries} d
    WHERE d."SubscriptionID" = ${sub}::uuid AND d."PartitionKey" IS NOT NULL AND d."Status" = 'Pending' AND d."VisibleAt" <= now()
      AND ${NoInFlightForKey(deliveries, 'd')}${this.HeadPredicates(mode, explicitSequence)}
)
SELECT r."ID" AS "DeliveryID", r."PartitionKey"
FROM ready r
WHERE r."KeyRank" = 1
ORDER BY r."VisibleAt", r."OrderKey"
LIMIT ${max}::int`, p);
    }

    public SubscriptionBacklog(subscriptionID: string, mode: BacklogPartitionMode, explicitSequence: boolean): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        const keyed = mode === 'None' ? '0' : `(
        SELECT count(DISTINCT d."PartitionKey") FROM ${deliveries} d
        WHERE d."SubscriptionID" = ${sub}::uuid AND d."PartitionKey" IS NOT NULL AND d."Status" = 'Pending'
          AND d."VisibleAt" <= now()
          AND ${NoInFlightForKey(deliveries, 'd')}${this.HeadPredicates(mode === 'None' ? 'Exclusive' : mode, explicitSequence)})`;
        return this.Statement(`
SELECT
    (SELECT count(*) FROM ${deliveries} d
     WHERE d."SubscriptionID" = ${sub}::uuid AND d."PartitionKey" IS NULL AND d."Status" = 'Pending'
       AND d."VisibleAt" <= now())
    + ${keyed} AS "Claimable",
    (SELECT count(*) FROM ${deliveries} d
     WHERE d."SubscriptionID" = ${sub}::uuid AND d."Status" = 'InFlight') AS "InFlight"`, p);
    }

    public ClaimPartitionCandidate(subscriptionID: string, deliveryID: string, mode: ClaimPartitionMode, explicitSequence: boolean,
                                   leaseOwner: string, leaseSeconds: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const delivery = p.Add(deliveryID);
        const owner = p.Add(leaseOwner);
        const lease = p.Add(leaseSeconds);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(`
WITH claimed AS (
    UPDATE ${deliveries} d SET ${ClaimSetClause('d', owner, lease)}
    WHERE d."ID" = ${delivery}::uuid AND d."SubscriptionID" = ${sub}::uuid AND d."Status" = 'Pending'
      AND d."VisibleAt" <= now() AND d."PartitionKey" IS NOT NULL
      AND ${ActiveSubscriptionGuard(this.Table(WorkQueueTables.Subscription), sub)}
      AND ${NoInFlightForKey(deliveries, 'd')}${this.HeadPredicates(mode, explicitSequence)}
    ${ClaimReturning('d')}
)
${ClaimedSelect(this.Table(WorkQueueTables.Message))}`, p);
    }

    public MarkAwaitingSequence(subscriptionID: string): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.PartitionState)} ps SET "AwaitingSequenceSince" = now()
WHERE ps."SubscriptionID" = ${sub}::uuid AND ps."AwaitingSequenceSince" IS NULL
  AND EXISTS (SELECT 1 FROM ${deliveries} d WHERE d."SubscriptionID" = ps."SubscriptionID" AND d."PartitionKey" = ps."PartitionKey"
              AND d."Status" = 'Pending' AND d."OrderKey" > ps."LastCompletedSequence" + 1)
  AND NOT EXISTS (SELECT 1 FROM ${deliveries} n WHERE n."SubscriptionID" = ps."SubscriptionID" AND n."PartitionKey" = ps."PartitionKey"
              AND n."OrderKey" = ps."LastCompletedSequence" + 1 AND n."Status" IN ('Pending', 'InFlight', 'DeadLettered'))`, p);
    }

    public ClearAwaitingSequence(subscriptionID: string): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.PartitionState)} ps SET "AwaitingSequenceSince" = NULL, "GapStalled" = false
WHERE ps."SubscriptionID" = ${sub}::uuid AND ps."AwaitingSequenceSince" IS NOT NULL
  AND EXISTS (SELECT 1 FROM ${this.Table(WorkQueueTables.Delivery)} n WHERE n."SubscriptionID" = ps."SubscriptionID"
              AND n."PartitionKey" = ps."PartitionKey" AND n."OrderKey" = ps."LastCompletedSequence" + 1
              AND n."Status" IN ('Pending', 'InFlight', 'DeadLettered'))`, p);
    }

    public ExtendLease(deliveryID: string, leaseToken: string, leaseSeconds: number, progressJSON: string | null): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        const lease = p.Add(leaseSeconds);
        const progress = p.Add(progressJSON);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET "LeaseExpiresAt" = now() + make_interval(secs => ${lease}::int), "LastHeartbeatAt" = now(), "Progress" = COALESCE(${progress}::text, "Progress")
WHERE "ID" = ${id}::uuid AND "LeaseToken" = ${token}::uuid AND "Status" = 'InFlight'`, p);
    }

    public CompleteDelivery(deliveryID: string, leaseToken: string): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET "Status" = 'Completed', "CompletedAt" = now(), ${CLEAR_LEASE}
WHERE "ID" = ${id}::uuid AND "LeaseToken" = ${token}::uuid AND "Status" = 'InFlight'
RETURNING "SubscriptionID", "PartitionKey", "OrderKey"`, p);
    }

    public RetryDelivery(deliveryID: string, leaseToken: string, delaySeconds: number, error: string): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        const delay = p.Add(delaySeconds);
        const text = p.Add(error);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET "Status" = 'Pending', "VisibleAt" = now() + make_interval(secs => ${delay}::int), "LastError" = ${text}::text, ${CLEAR_LEASE}
WHERE "ID" = ${id}::uuid AND "LeaseToken" = ${token}::uuid AND "Status" = 'InFlight'`, p);
    }

    public DeadLetterDelivery(deliveryID: string, leaseToken: string, reason: string, error: string | null): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        const why = p.Add(reason);
        const text = p.Add(error);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET "Status" = 'DeadLettered', "DeadLetterReason" = ${why}::text, "DeadLetteredAt" = now(), "LastError" = COALESCE(${text}::text, "LastError"), ${CLEAR_LEASE}
WHERE "ID" = ${id}::uuid AND "LeaseToken" = ${token}::uuid AND "Status" = 'InFlight'`, p);
    }

    public ReleaseDelivery(deliveryID: string, leaseToken: string): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET "Status" = 'Pending', "AttemptCount" = GREATEST("AttemptCount" - 1, 0), "VisibleAt" = now(), ${CLEAR_LEASE}
WHERE "ID" = ${id}::uuid AND "LeaseToken" = ${token}::uuid AND "Status" = 'InFlight'`, p);
    }

    public AdvanceSequenceMark(subscriptionID: string, partitionKey: string): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const key = p.Add(partitionKey);
        const state = this.Table(WorkQueueTables.PartitionState);
        return this.Statement(`
WITH RECURSIVE current_state AS (
    SELECT ps."LastCompletedSequence" AS "Mark" FROM ${state} ps
    WHERE ps."SubscriptionID" = ${sub}::uuid AND ps."PartitionKey" = ${key}::text
), chain AS (
    SELECT s."Mark" FROM current_state s
    UNION ALL
    SELECT c."Mark" + 1 FROM chain c
    WHERE EXISTS (SELECT 1 FROM ${this.Table(WorkQueueTables.Delivery)} d
                  WHERE d."SubscriptionID" = ${sub}::uuid AND d."PartitionKey" = ${key}::text AND d."OrderKey" = c."Mark" + 1
                    AND d."Status" IN ('Completed', 'Discarded'))
), target AS (
    SELECT MAX(c."Mark") AS "Mark" FROM chain c
), updated AS (
    UPDATE ${state} ps SET "LastCompletedSequence" = t."Mark", "AwaitingSequenceSince" = NULL, "GapStalled" = false
    FROM target t
    WHERE ps."SubscriptionID" = ${sub}::uuid AND ps."PartitionKey" = ${key}::text
      AND t."Mark" IS NOT NULL AND t."Mark" <> ps."LastCompletedSequence"
    RETURNING ps."LastCompletedSequence"
)
SELECT COALESCE((SELECT u."LastCompletedSequence" FROM updated u), (SELECT t."Mark" FROM target t)) AS "LastCompletedSequence"`, p);
    }

    /** Test-only: moves a subscription's pending visibility and lease expiry into the past, standing in for elapsed time. */
    public ShiftTimestampsForConformance(subscriptionID: string, seconds: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const secs = p.Add(seconds);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET "VisibleAt" = "VisibleAt" - make_interval(secs => ${secs}::int), "LeaseExpiresAt" = "LeaseExpiresAt" - make_interval(secs => ${secs}::int)
WHERE "SubscriptionID" = ${sub}::uuid AND "Status" IN ('Pending', 'InFlight')`, p);
    }

    private HeadPredicates(mode: ClaimPartitionMode, explicitSequence: boolean): string {
        if (mode !== 'Ordered') {
            return '';
        }
        const head = `\n      AND ${NoEarlierUnfinished(this.Table(WorkQueueTables.Delivery), 'd')}`;
        return explicitSequence ? `${head}\n      AND ${IsNextSequence(this.Table(WorkQueueTables.PartitionState), 'd')}` : head;
    }
}
```

- [ ] **Step 6: Write `src/sql/postgresql/PostgreSQLOperatorSql.ts`**

```typescript
import type { PartitionCondition } from '@memberjunction/work-queue-core';
import { WorkQueueTables } from '../../constants';
import type { DeadLetterCursor } from '../rows';
import { StatementBase } from '../StatementBase';
import type { OperatorSqlBuilder } from '../WorkQueueSqlBuilder';
import type { SqlStatement } from '../WorkQueueSqlExecutor';
import { CLEAR_LEASE, NoEarlierUnfinished } from './PostgreSQLFragments';

export class PostgreSQLOperatorSql extends StatementBase implements OperatorSqlBuilder {
    public SubscriptionStats(subscriptionID: string, ordered: boolean): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        const blocked = ordered
            ? `(SELECT COUNT(*) FROM ${deliveries} h WHERE h."SubscriptionID" = ${sub}::uuid AND h."Status" = 'DeadLettered' AND h."PartitionKey" IS NOT NULL AND ${NoEarlierUnfinished(deliveries, 'h')})`
            : 'NULL::bigint';
        return this.Statement(`
SELECT
    COUNT(*) FILTER (WHERE d."Status" = 'Pending') AS "Pending",
    COUNT(*) FILTER (WHERE d."Status" = 'InFlight') AS "InFlight",
    COUNT(*) FILTER (WHERE d."Status" = 'DeadLettered') AS "DeadLettered",
    ${blocked} AS "BlockedKeys",
    EXTRACT(EPOCH FROM (now() - MIN(d."__mj_CreatedAt") FILTER (WHERE d."Status" = 'Pending')))::int AS "OldestPendingAgeSeconds",
    COUNT(*) FILTER (WHERE d."Status" = 'Completed' AND d."CompletedAt" >= now() - interval '1 hour') AS "CompletedLastHour"
FROM ${deliveries} d
WHERE d."SubscriptionID" = ${sub}::uuid`, p);
    }

    public ListDeadLetters(subscriptionID: string, ordered: boolean, after: DeadLetterCursor | null, pageSize: number): SqlStatement {
        const p = this.NewParams();
        const size = p.Add(pageSize);
        const sub = p.Add(subscriptionID);
        const keyset = after ? `\n  AND d."ID" > ${p.Add(after.DeliveryID)}::uuid` : '';
        const deliveries = this.Table(WorkQueueTables.Delivery);
        const blocks = ordered
            ? `(d."PartitionKey" IS NOT NULL AND ${NoEarlierUnfinished(deliveries, 'd')})`
            : 'false';
        return this.Statement(`
SELECT d."ID" AS "DeliveryID", d."AttemptCount", d."DeadLetterReason", d."LastError", d."DeadLetteredAt",
    d."PartitionKey" AS "DeliveryPartitionKey", ${blocks} AS "BlocksKey",
    m."ID" AS "MessageID", m."PartitionKey", m."Sequence", m."Attributes", m."Payload", m."PayloadRef", m."CorrelationID", m."PublishedAt"
FROM ${deliveries} d
JOIN ${this.Table(WorkQueueTables.Message)} m ON m."ID" = d."MessageID"
WHERE d."SubscriptionID" = ${sub}::uuid AND d."Status" = 'DeadLettered'${keyset}
ORDER BY d."ID"
LIMIT ${size}::int`, p);
    }

    public ListPartitions(subscriptionID: string, ordered: boolean, condition: PartitionCondition | null,
                          afterPartitionKey: string | null, pageSize: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const size = p.Add(pageSize);
        const conditionFilter = condition ? `"Condition" = ${p.Add(condition)}::text` : `"Condition" <> 'Idle'`;
        const keyset = afterPartitionKey !== null ? `\n  AND "PartitionKey" > ${p.Add(afterPartitionKey)}::text` : '';
        const blockedCase = ordered ? `\n             WHEN h."Status" = 'DeadLettered' THEN 'Blocked'` : '';
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(`
WITH keys AS (
    SELECT d."PartitionKey",
        COUNT(*) FILTER (WHERE d."Status" = 'InFlight') AS "InFlightCount",
        COUNT(*) FILTER (WHERE d."Status" = 'Pending') AS "WaitingItems",
        MIN(d."OrderKey") AS "HeadOrderKey"
    FROM ${deliveries} d
    WHERE d."SubscriptionID" = ${sub}::uuid AND d."PartitionKey" IS NOT NULL AND d."Status" IN ('Pending', 'InFlight', 'DeadLettered')
    GROUP BY d."PartitionKey"
), shaped AS (
    SELECT k."PartitionKey", k."WaitingItems", h."ID" AS "HeadDeliveryID", ps."LastCompletedSequence", ps."AwaitingSequenceSince",
        CASE WHEN k."InFlightCount" > 0 THEN 'InFlight'${blockedCase}
             WHEN ps."GapStalled" = true THEN 'GapStalled'
             WHEN ps."AwaitingSequenceSince" IS NOT NULL THEN 'AwaitingSequence'
             ELSE 'Idle' END AS "Condition"
    FROM keys k
    JOIN ${deliveries} h ON h."SubscriptionID" = ${sub}::uuid AND h."PartitionKey" = k."PartitionKey" AND h."OrderKey" = k."HeadOrderKey"
    LEFT JOIN ${this.Table(WorkQueueTables.PartitionState)} ps ON ps."SubscriptionID" = ${sub}::uuid AND ps."PartitionKey" = k."PartitionKey"
)
SELECT "PartitionKey", "Condition", "HeadDeliveryID", "LastCompletedSequence", "AwaitingSequenceSince", "WaitingItems"
FROM shaped
WHERE ${conditionFilter}${keyset}
ORDER BY "PartitionKey"
LIMIT ${size}::int`, p);
    }

    public ReplayDelivery(subscriptionID: string, deliveryID: string, actorUserID: string | null, note: string | null): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const id = p.Add(deliveryID);
        const actor = p.Add(actorUserID);
        const text = p.Add(note);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET "Status" = 'Pending', "AttemptCount" = 0, "IsReplay" = true, "VisibleAt" = now(),
    "DeadLetterReason" = NULL, "DeadLetteredAt" = NULL, "ResolvedByUserID" = ${actor}::uuid, "ResolutionNote" = ${text}::text
WHERE "ID" = ${id}::uuid AND "SubscriptionID" = ${sub}::uuid AND "Status" = 'DeadLettered'`, p);
    }

    public DiscardDelivery(subscriptionID: string, deliveryID: string, allowPending: boolean, actorUserID: string | null, reason: string): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const id = p.Add(deliveryID);
        const actor = p.Add(actorUserID);
        const text = p.Add(reason);
        const statuses = allowPending ? "'DeadLettered', 'Pending'" : "'DeadLettered'";
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET "Status" = 'Discarded', "CompletedAt" = now(), "ResolvedByUserID" = ${actor}::uuid, "ResolutionNote" = ${text}::text, ${CLEAR_LEASE}
WHERE "ID" = ${id}::uuid AND "SubscriptionID" = ${sub}::uuid AND "Status" IN (${statuses})
RETURNING "PartitionKey", "OrderKey"`, p);
    }

    public CancelInFlightDelivery(subscriptionID: string, deliveryID: string, actorUserID: string | null, reason: string): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const id = p.Add(deliveryID);
        const actor = p.Add(actorUserID);
        const text = p.Add(reason);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET "CancelRequestedAt" = now(), "LeaseToken" = gen_random_uuid(),
    "ResolvedByUserID" = ${actor}::uuid, "ResolutionNote" = ${text}::text
WHERE "ID" = ${id}::uuid AND "SubscriptionID" = ${sub}::uuid AND "Status" = 'InFlight' AND "CancelRequestedAt" IS NULL`, p);
    }

    public SkipSequence(subscriptionID: string, partitionKey: string, sequence: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const key = p.Add(partitionKey);
        const seq = p.Add(sequence);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.PartitionState)}
SET "LastCompletedSequence" = ${seq}::bigint, "AwaitingSequenceSince" = NULL, "GapStalled" = false
WHERE "SubscriptionID" = ${sub}::uuid AND "PartitionKey" = ${key}::text AND "LastCompletedSequence" = ${seq}::bigint - 1
  AND NOT EXISTS (SELECT 1 FROM ${this.Table(WorkQueueTables.Delivery)} d
                  WHERE d."SubscriptionID" = ${sub}::uuid AND d."PartitionKey" = ${key}::text AND d."OrderKey" = ${seq}::bigint AND d."Status" <> 'Discarded')`, p);
    }

    public ExpireLeasesAll(): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)} d SET
    "Status" = CASE WHEN d."CancelRequestedAt" IS NOT NULL THEN 'Discarded'
                    WHEN d."AttemptCount" >= s."MaxAttempts" THEN 'DeadLettered' ELSE 'Pending' END,
    "DeadLetterReason" = CASE WHEN d."CancelRequestedAt" IS NULL AND d."AttemptCount" >= s."MaxAttempts" THEN 'LeaseExpired' ELSE d."DeadLetterReason" END,
    "DeadLetteredAt" = CASE WHEN d."CancelRequestedAt" IS NULL AND d."AttemptCount" >= s."MaxAttempts" THEN now() ELSE d."DeadLetteredAt" END,
    "CompletedAt" = CASE WHEN d."CancelRequestedAt" IS NOT NULL THEN now() ELSE d."CompletedAt" END,
    "LastError" = CASE WHEN d."CancelRequestedAt" IS NOT NULL THEN d."LastError" ELSE 'LeaseExpired' END,
    "VisibleAt" = now(), ${CLEAR_LEASE}
FROM ${this.Table(WorkQueueTables.Subscription)} s
WHERE s."ID" = d."SubscriptionID" AND d."Status" = 'InFlight' AND d."LeaseExpiresAt" < now()
${EXPIRED_DEAD_LETTER_RETURNING}`, p);
    }

    public FlagGapStalls(): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.PartitionState)} ps SET "GapStalled" = true
FROM ${this.Table(WorkQueueTables.Subscription)} s
WHERE s."ID" = ps."SubscriptionID" AND ps."GapStalled" = false AND ps."AwaitingSequenceSince" IS NOT NULL
  AND s."SequenceGapAlertSeconds" IS NOT NULL
  AND ps."AwaitingSequenceSince" <= now() - make_interval(secs => s."SequenceGapAlertSeconds")`, p);
    }

    public DiscardSkippedSequences(): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)} d SET "Status" = 'Discarded', "CompletedAt" = now(), "ResolutionNote" = 'SequenceSkipped'
FROM ${this.Table(WorkQueueTables.PartitionState)} ps
WHERE ps."SubscriptionID" = d."SubscriptionID" AND ps."PartitionKey" = d."PartitionKey"
  AND d."Status" = 'Pending' AND d."OrderKey" <= ps."LastCompletedSequence"`, p);
    }

    public PurgeTerminalDeliveries(batchSize: number): SqlStatement {
        const p = this.NewParams();
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(`
DELETE FROM ${deliveries}
WHERE "ID" IN (
    SELECT d."ID" FROM ${deliveries} d
    JOIN ${this.Table(WorkQueueTables.Subscription)} s ON s."ID" = d."SubscriptionID"
    JOIN ${this.Table(WorkQueueTables.Topic)} t ON t."ID" = s."TopicID"
    WHERE d."Status" IN ('Completed', 'Discarded') AND d."CompletedAt" < now() - make_interval(days => t."RetentionDays")
    LIMIT ${p.Add(batchSize)}::int
)`, p);
    }

    public PurgeOrphanMessages(batchSize: number): SqlStatement {
        const p = this.NewParams();
        const messages = this.Table(WorkQueueTables.Message);
        return this.Statement(`
DELETE FROM ${messages}
WHERE "ID" IN (
    SELECT m."ID" FROM ${messages} m
    JOIN ${this.Table(WorkQueueTables.Topic)} t ON t."ID" = m."TopicID"
    WHERE m."PublishedAt" < now() - make_interval(days => t."RetentionDays")
      AND NOT EXISTS (SELECT 1 FROM ${this.Table(WorkQueueTables.Delivery)} d WHERE d."MessageID" = m."ID")
    LIMIT ${p.Add(batchSize)}::int
)`, p);
    }
}
```

- [ ] **Step 7: Write `src/sql/CreateWorkQueueSqlBuilder.ts`**

```typescript
import { PostgreSQLConsumeSql } from './postgresql/PostgreSQLConsumeSql';
import { PostgreSQLOperatorSql } from './postgresql/PostgreSQLOperatorSql';
import { PostgreSQLPublishSql } from './postgresql/PostgreSQLPublishSql';
import { SqlServerConsumeSql } from './sqlserver/SqlServerConsumeSql';
import { SqlServerOperatorSql } from './sqlserver/SqlServerOperatorSql';
import { SqlServerPublishSql } from './sqlserver/SqlServerPublishSql';
import type { WorkQueueSqlBuilder } from './WorkQueueSqlBuilder';
import type { SqlBuilderContext, WorkQueueSqlExecutor } from './WorkQueueSqlExecutor';

/** Selects the statement builders for the provider's platform. */
export function CreateWorkQueueSqlBuilder(context: SqlBuilderContext & Pick<WorkQueueSqlExecutor, 'PlatformKey'>): WorkQueueSqlBuilder {
    switch (context.PlatformKey) {
        case 'sqlserver':
            return {
                Publish: new SqlServerPublishSql(context),
                Consume: new SqlServerConsumeSql(context),
                Operator: new SqlServerOperatorSql(context),
            };
        case 'postgresql':
            return {
                Publish: new PostgreSQLPublishSql(context),
                Consume: new PostgreSQLConsumeSql(context),
                Operator: new PostgreSQLOperatorSql(context),
            };
    }
    const unsupported: never = context.PlatformKey;
    throw new Error(`Work queue SQL is not implemented for platform '${String(unsupported)}'`);
}
```

`DatabasePlatform` is exactly `'sqlserver' | 'postgresql'` (`packages/SQLDialect/src/sqlDialect.ts:13`), so after the switch `context.PlatformKey` narrows to `never`. If a platform is added later, the `never` assignment fails the build, which is the intent.

- [ ] **Step 8: Export the new modules**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * as PostgreSQLFragments from './sql/postgresql/PostgreSQLFragments';
export * from './sql/postgresql/PostgreSQLPublishSql';
export * from './sql/postgresql/PostgreSQLConsumeSql';
export * from './sql/postgresql/PostgreSQLOperatorSql';
export * from './sql/CreateWorkQueueSqlBuilder';
```

The PostgreSQL fragments are exported under a namespace because their function names match the SQL Server fragments.

- [ ] **Step 9: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — sqlExecution (15), SqlServerPublishSql (13), SqlServerConsumeSql (17), SqlServerOperatorSql (13), PostgreSQLSql (13), CreateWorkQueueSqlBuilder (2).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 10: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): PostgreSQL statements and the platform builder factory"
```

---

### Task 7: Transaction helper and `DeduplicationLedger`

**Files:**
- Create: `packages/WorkQueue/engine/src/transaction/RunInWorkQueueTransaction.ts`
- Create: `packages/WorkQueue/engine/src/dedup/DeduplicationLedger.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/RunInWorkQueueTransaction.test.ts`, `src/__tests__/DeduplicationLedger.test.ts`

**Interfaces:**
- Consumes: `WorkQueueExecutorSource`, `WorkQueueTransactionalExecutor`, `WorkQueueSqlExecutor`, `ExecuteRows`, `ExecuteWrite`, `IsTransientDatabaseError`, `IsUniqueViolation`, `ToBoolean` (Task 2); `CreateWorkQueueSqlBuilder` (Task 6); `ReservationRow` (Task 3); `DEDUP_RESERVATION_SECONDS`, `DEDUPLICATION_KEY_INDEX` (Task 2).
- Produces:
  - `interface TransactionOutcome<T> { Commit: boolean; Value: T }`
  - `RunInWorkQueueTransaction<T>(source: WorkQueueExecutorSource, work: (tx: WorkQueueTransactionalExecutor) => Promise<TransactionOutcome<T>>, callerExecutor?: WorkQueueTransactionalExecutor | null): Promise<T>` — joins the caller's transaction when given (never releases it); otherwise runs on a fresh independent instance and releases it
  - `RetryTransient<T>(operation: () => Promise<T>, attempts?: number, wait?: (attempt: number) => Promise<void>): Promise<T>`
  - `type LedgerReservation = { Kind: 'Reserved' } | { Kind: 'Duplicate'; OwnerMessageID: string }`
  - `class DeduplicationLedger { constructor(executor: WorkQueueSqlExecutor, contextUser: UserInfo); Reserve(topicID, key, messageID): Promise<LedgerReservation>; Confirm(topicID, key, messageID, ttlSeconds): Promise<boolean>; Release(topicID, key, messageID): Promise<boolean>; PurgeExpired(batchSize?: number, maxBatches?: number): Promise<number> }`

Ledger rules (03 §2.1): an expired row for the key is deleted before reserving; a reservation already owned by the **same** `MessageID` counts as `Reserved` (a producer retry after a crash may resend); a live row owned by another message is `Duplicate`. On SQL Server a unique-constraint race is retried once; on PostgreSQL an empty result (a concurrently committed row not yet visible to the statement snapshot) is retried once.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/RunInWorkQueueTransaction.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { RetryTransient, RunInWorkQueueTransaction } from '../transaction/RunInWorkQueueTransaction';
import { RecordingExecutor } from './fakes';

const noWait = async (): Promise<void> => undefined;

describe('RunInWorkQueueTransaction', () => {
    it('runs on an independent instance, commits and releases', async () => {
        const executor = new RecordingExecutor();
        const value = await RunInWorkQueueTransaction(executor, async () => ({ Commit: true, Value: 42 }));
        expect(value).toBe(42);
        expect(executor.Events).toEqual(['independent', 'begin', 'commit', 'release']);
    });

    it('rolls back when the work asks not to commit', async () => {
        const executor = new RecordingExecutor();
        await RunInWorkQueueTransaction(executor, async () => ({ Commit: false, Value: 'x' }));
        expect(executor.Events).toEqual(['independent', 'begin', 'rollback', 'release']);
    });

    it('rolls back, releases and rethrows when the work throws', async () => {
        const executor = new RecordingExecutor();
        await expect(RunInWorkQueueTransaction(executor, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        expect(executor.Events).toEqual(['independent', 'begin', 'rollback', 'release']);
    });

    it("joins the caller's transaction without creating or releasing an instance", async () => {
        const source = new RecordingExecutor();
        const caller = new RecordingExecutor();
        await RunInWorkQueueTransaction(source, async tx => {
            expect(tx).toBe(caller);
            return { Commit: true, Value: null };
        }, caller);
        expect(source.Events).toEqual([]);
        expect(caller.Events).toEqual(['begin', 'commit']);
    });
});

describe('RetryTransient', () => {
    it('retries transient failures and returns the first success', async () => {
        let calls = 0;
        const result = await RetryTransient(async () => {
            calls++;
            if (calls < 3) {
                throw new Error('Transaction was deadlocked');
            }
            return 'ok';
        }, 3, noWait);
        expect(result).toBe('ok');
        expect(calls).toBe(3);
    });

    it('does not retry non-transient failures', async () => {
        let calls = 0;
        await expect(RetryTransient(async () => { calls++; throw new Error('syntax error'); }, 3, noWait)).rejects.toThrow('syntax error');
        expect(calls).toBe(1);
    });

    it('gives up after the attempt limit', async () => {
        let calls = 0;
        await expect(RetryTransient(async () => { calls++; throw new Error('deadlock'); }, 2, noWait)).rejects.toThrow('deadlock');
        expect(calls).toBe(2);
    });
});
```

`packages/WorkQueue/engine/src/__tests__/DeduplicationLedger.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DeduplicationLedger } from '../dedup/DeduplicationLedger';
import { RecordingExecutor, TEST_USER } from './fakes';

const TOPIC = 'AAAAAAAA-0000-0000-0000-000000000001';
const MSG = 'CCCCCCCC-0000-0000-0000-000000000001';
const OTHER = 'CCCCCCCC-0000-0000-0000-000000000002';

describe('DeduplicationLedger.Reserve', () => {
    it('deletes an expired key, then reserves it', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ AffectedRows: 1 }])
            .QueueRows([{ MessageID: MSG, Inserted: true }]);
        const result = await new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG);
        expect(result).toEqual({ Kind: 'Reserved' });
        expect(executor.Calls[0].SQL).toContain('DELETE FROM [__mj].[WorkQueueDeduplication]');
        expect(executor.Calls[1].SQL).toContain("N'Reserved'");
        expect(executor.Calls[1].Params).toEqual([TOPIC, 'k1', MSG, 120]);
    });

    it('reports a duplicate owned by another message', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ AffectedRows: 0 }])
            .QueueRows([{ MessageID: OTHER, Inserted: 0 }]);
        const result = await new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG);
        expect(result).toEqual({ Kind: 'Duplicate', OwnerMessageID: OTHER });
    });

    it('treats a reservation already owned by the same message as reserved', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ AffectedRows: 0 }])
            .QueueRows([{ MessageID: MSG.toLowerCase(), Inserted: false }]);
        expect(await new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG)).toEqual({ Kind: 'Reserved' });
    });

    it('retries once after a unique-constraint race', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ AffectedRows: 0 }])
            .QueueError(new Error("Violation of UNIQUE KEY constraint 'UQ_WorkQueueDeduplication_Topic_Key'"))
            .QueueRows([{ MessageID: OTHER, Inserted: false }]);
        const result = await new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG);
        expect(result).toEqual({ Kind: 'Duplicate', OwnerMessageID: OTHER });
        expect(executor.Calls).toHaveLength(3);
    });

    it('retries once when no owner row is visible, then fails loudly', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ AffectedRows: 0 }])
            .QueueRows([])
            .QueueRows([]);
        await expect(new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG)).rejects.toThrow("key 'k1'");
    });
});

describe('DeduplicationLedger confirm, release and purge', () => {
    it('confirms with the TTL and reports success', async () => {
        const executor = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]);
        expect(await new DeduplicationLedger(executor, TEST_USER).Confirm(TOPIC, 'k1', MSG, 86400)).toBe(true);
        expect(executor.Calls[0].Params).toEqual([TOPIC, 'k1', MSG, 86400]);
    });

    it('reports a failed release when nothing matched', async () => {
        const executor = new RecordingExecutor().QueueRows([{ AffectedRows: 0 }]);
        expect(await new DeduplicationLedger(executor, TEST_USER).Release(TOPIC, 'k1', MSG)).toBe(false);
    });

    it('purges in batches until a batch comes back short', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ AffectedRows: 2 }])
            .QueueRows([{ AffectedRows: 1 }]);
        expect(await new DeduplicationLedger(executor, TEST_USER).PurgeExpired(2, 10)).toBe(3);
        expect(executor.Calls).toHaveLength(2);
    });

    it('stops purging at the batch limit', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ AffectedRows: 2 }])
            .QueueRows([{ AffectedRows: 2 }]);
        expect(await new DeduplicationLedger(executor, TEST_USER).PurgeExpired(2, 2)).toBe(4);
        expect(executor.Calls).toHaveLength(2);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test RunInWorkQueueTransaction DeduplicationLedger`
Expected: FAIL — unresolved imports `../transaction/RunInWorkQueueTransaction` and `../dedup/DeduplicationLedger`.

- [ ] **Step 3: Write `src/transaction/RunInWorkQueueTransaction.ts`**

```typescript
import { IsTransientDatabaseError } from '../sql/sqlExecution';
import type { WorkQueueExecutorSource, WorkQueueTransactionalExecutor } from '../sql/WorkQueueSqlExecutor';

export interface TransactionOutcome<T> {
    Commit: boolean;
    Value: T;
}

/**
 * Runs work inside one provider-arbitrated transaction. With a caller executor the work joins the caller's
 * transaction (a savepoint when one is already open). Without one, it runs on an independent instance with its
 * own transaction stack, so concurrent units of work on the shared server provider never interleave.
 */
export async function RunInWorkQueueTransaction<T>(
    source: WorkQueueExecutorSource,
    work: (tx: WorkQueueTransactionalExecutor) => Promise<TransactionOutcome<T>>,
    callerExecutor: WorkQueueTransactionalExecutor | null = null,
): Promise<T> {
    if (callerExecutor) {
        return RunScoped(callerExecutor, work);
    }
    const independent = await source.CreateIndependentInstance();
    try {
        return await RunScoped(independent, work);
    } finally {
        await independent.ReleaseIndependentInstance();
    }
}

async function RunScoped<T>(
    tx: WorkQueueTransactionalExecutor,
    work: (tx: WorkQueueTransactionalExecutor) => Promise<TransactionOutcome<T>>,
): Promise<T> {
    const scope = await tx.BeginEntityTransaction();
    try {
        const outcome = await work(tx);
        if (outcome.Commit) {
            await scope.Commit();
        } else {
            await scope.Rollback();
        }
        return outcome.Value;
    } catch (error) {
        await scope.Rollback();
        throw error;
    }
}

const defaultWait = (attempt: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, 20 * attempt + Math.floor(Math.random() * 80)));

/** Retries an operation that failed with a deadlock or serialization error. Other errors propagate at once. */
export async function RetryTransient<T>(
    operation: () => Promise<T>,
    attempts = 3,
    wait: (attempt: number) => Promise<void> = defaultWait,
): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= attempts || !IsTransientDatabaseError(error)) {
                throw error;
            }
            await wait(attempt);
        }
    }
}
```

- [ ] **Step 4: Write `src/dedup/DeduplicationLedger.ts`**

```typescript
import type { UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { DEDUP_RESERVATION_SECONDS, DEDUPLICATION_KEY_INDEX } from '../constants';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import type { ReservationRow } from '../sql/rows';
import { ExecuteRows, ExecuteWrite, IsUniqueViolation, ToBoolean } from '../sql/sqlExecution';
import type { PublishSqlBuilder } from '../sql/WorkQueueSqlBuilder';
import type { WorkQueueSqlExecutor } from '../sql/WorkQueueSqlExecutor';

export type LedgerReservation = { Kind: 'Reserved' } | { Kind: 'Duplicate'; OwnerMessageID: string };

const RESERVE_ATTEMPTS = 2;

/** The publish deduplication ledger (03 §2.1), shared by every transport. */
export class DeduplicationLedger {
    private readonly sql: PublishSqlBuilder;

    constructor(private readonly executor: WorkQueueSqlExecutor, private readonly contextUser: UserInfo) {
        this.sql = CreateWorkQueueSqlBuilder(executor).Publish;
    }

    public async Reserve(topicID: string, key: string, messageID: string): Promise<LedgerReservation> {
        await ExecuteWrite(this.executor, this.sql.DeleteExpiredDeduplicationKey(topicID, key), this.contextUser);
        for (let attempt = 1; attempt <= RESERVE_ATTEMPTS; attempt++) {
            const row = await this.TryReserve(topicID, key, messageID, attempt);
            if (row) {
                return ToBoolean(row.Inserted) || UUIDsEqual(row.MessageID, messageID)
                    ? { Kind: 'Reserved' }
                    : { Kind: 'Duplicate', OwnerMessageID: row.MessageID };
            }
        }
        throw new Error(`Deduplication reservation for key '${key}' returned no owner after ${RESERVE_ATTEMPTS} attempts`);
    }

    public async Confirm(topicID: string, key: string, messageID: string, ttlSeconds: number): Promise<boolean> {
        const count = await ExecuteWrite(this.executor, this.sql.ConfirmDeduplication(topicID, key, messageID, ttlSeconds), this.contextUser);
        return count === 1;
    }

    public async Release(topicID: string, key: string, messageID: string): Promise<boolean> {
        const count = await ExecuteWrite(this.executor, this.sql.ReleaseDeduplication(topicID, key, messageID), this.contextUser);
        return count === 1;
    }

    /** Deletes expired keys in batches until a batch comes back short or maxBatches is reached. */
    public async PurgeExpired(batchSize = 1000, maxBatches = 20): Promise<number> {
        let total = 0;
        for (let batch = 0; batch < maxBatches; batch++) {
            const deleted = await ExecuteWrite(this.executor, this.sql.PurgeExpiredDeduplications(batchSize), this.contextUser);
            total += deleted;
            if (deleted < batchSize) {
                break;
            }
        }
        return total;
    }

    /** One reservation attempt. Null means "retry": a unique race (SQL Server) or an invisible owner (PostgreSQL). */
    private async TryReserve(topicID: string, key: string, messageID: string, attempt: number): Promise<ReservationRow | null> {
        try {
            const rows = await ExecuteRows<ReservationRow>(
                this.executor,
                this.sql.ReserveDeduplication(topicID, key, messageID, DEDUP_RESERVATION_SECONDS),
                this.contextUser,
            );
            return rows[0] ?? null;
        } catch (error) {
            if (attempt < RESERVE_ATTEMPTS && IsUniqueViolation(error, DEDUPLICATION_KEY_INDEX)) {
                return null;
            }
            throw error;
        }
    }
}
```

- [ ] **Step 5: Export the new modules**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './transaction/RunInWorkQueueTransaction';
export * from './dedup/DeduplicationLedger';
```

- [ ] **Step 6: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — previous suites plus RunInWorkQueueTransaction (7) and DeduplicationLedger (9).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 7: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): transaction helper and deduplication ledger"
```

---

### Task 8: Driver dependencies, row mapping and `DatabaseTransportOperator`

**Files:**
- Create: `packages/WorkQueue/engine/src/transports/TransportDriverDeps.ts`
- Create: `packages/WorkQueue/engine/src/transports/database/bindingIds.ts`, `src/transports/database/rowMapping.ts`
- Create: `packages/WorkQueue/engine/src/transports/database/DatabaseTransportOperator.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/rowMapping.test.ts`, `src/__tests__/DatabaseTransportOperator.test.ts`
- Extend: `packages/WorkQueue/engine/src/__tests__/fakes.ts` (binding fixtures and a recording logger)

**Interfaces:**
- Consumes: `CreateWorkQueueSqlBuilder` (Task 6); `RunInWorkQueueTransaction` (Task 7); rows (Task 3); execution helpers (Task 2); from `@memberjunction/work-queue-core`: `ITransportOperator`, `SubscriptionBinding`, `TopicBinding`, `SubscriptionStats`, `DeadLetterRecord`, `PartitionStateRecord`, `PartitionCondition`, `Page`, `OperatorResult`, `WorkMessage`, `WorkJson`, `WorkPayloadRef`, `WorkProgress`, `WorkLogger`, `WorkQueueConfigurationError`.
- Produces:
  - `interface TransportDriverDeps { ContextUser: UserInfo; Executor: WorkQueueExecutorSource; Log: WorkLogger; InstanceID?: string }`
  - `ReadTopicID(binding: TopicBinding): string`, `ReadSubscriptionIDs(binding: SubscriptionBinding): { SubscriptionID: string; TopicID: string }`
  - `IsWorkJson(value: unknown): value is WorkJson`, `ParseAttributes(json: string | null): Record<string, string>`, `ParsePayload<TPayload extends WorkJson>(json: string | null): TPayload | undefined`, `ParsePayloadRef(json: string | null): WorkPayloadRef | undefined`, `MessageFromColumns<TPayload extends WorkJson>(columns: MessageColumns, topicName: string): WorkMessage<TPayload>`, `SerializeProgress(progress: WorkProgress): string`, `EncodeCursor(value: Record<string, string>): string`, `DecodeCursorField(cursor: string, field: string): string`, `IsUUID(value: string): boolean`, `ClampPageSize(pageSize: number): number`, `interface MessageColumns`
  - `class DatabaseTransportOperator implements ITransportOperator { constructor(executor: WorkQueueExecutorSource, deps: TransportDriverDeps) }`
  - Fakes: `TopicBindingFixture(overrides?)`, `SubscriptionBindingFixture(overrides?)`, `RecordingLogger`, `TestDeps(executor)`

**Binding convention (Database and staged subscriptions):** `TopicBinding.Config.TopicID` and `SubscriptionBinding.Config.SubscriptionID` / `.TopicID` carry the row IDs. Task 11's binding builders always add them.

- [ ] **Step 1: Extend the test fakes**

Append to `packages/WorkQueue/engine/src/__tests__/fakes.ts`:

```typescript
import type { SubscriptionBinding, SubscriptionPolicy, TopicBinding, WorkJson, WorkLogger } from '@memberjunction/work-queue-core';
import type { TransportDriverDeps } from '../transports/TransportDriverDeps';

export const TOPIC_ID = 'AAAAAAAA-0000-0000-0000-000000000001';
export const SUBSCRIPTION_ID = 'BBBBBBBB-0000-0000-0000-000000000001';

export function TopicBindingFixture(overrides: Partial<TopicBinding> = {}): TopicBinding {
    return {
        TopicName: 'import.ready',
        OrderingMode: 'PublishOrder',
        IsFifo: false,
        MaxPayloadBytes: 262144,
        Config: { TopicID: TOPIC_ID },
        ...overrides,
    };
}

export function SubscriptionBindingFixture(
    policy: Partial<SubscriptionPolicy> = {},
    config: Record<string, WorkJson> = {},
): SubscriptionBinding {
    return {
        Policy: {
            SubscriptionName: 'venue-import',
            TopicName: 'import.ready',
            OrderingMode: 'PublishOrder',
            PartitionMode: 'None',
            MaxAttempts: 5,
            BackoffBaseSeconds: 10,
            BackoffMaxSeconds: 900,
            LeaseSeconds: 60,
            HeartbeatMode: 'Auto',
            ...policy,
        },
        Filter: null,
        HostType: 'MJWorker',
        Config: { SubscriptionID: SUBSCRIPTION_ID, TopicID: TOPIC_ID, ...config },
    };
}

export class RecordingLogger implements WorkLogger {
    public readonly Lines: string[] = [];
    public Info(message: string): void { this.Lines.push(`INFO ${message}`); }
    public Warn(message: string): void { this.Lines.push(`WARN ${message}`); }
    public Error(message: string): void { this.Lines.push(`ERROR ${message}`); }
}

export function TestDeps(executor: RecordingExecutor): TransportDriverDeps {
    return { ContextUser: TEST_USER, Executor: executor, Log: new RecordingLogger(), InstanceID: 'test-host:1:abcd' };
}
```

Move the new `import` lines to the top of `fakes.ts` with the existing imports.

- [ ] **Step 2: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/rowMapping.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import {
    ClampPageSize, DecodeCursorField, EncodeCursor, IsUUID, IsWorkJson, MessageFromColumns,
    ParseAttributes, ParsePayload, ParsePayloadRef, SerializeProgress,
} from '../transports/database/rowMapping';
import { ReadSubscriptionIDs, ReadTopicID } from '../transports/database/bindingIds';
import { SubscriptionBindingFixture, TopicBindingFixture } from './fakes';

describe('JSON column parsing', () => {
    it('accepts only JSON-safe values', () => {
        expect(IsWorkJson({ a: [1, 'x', null, true] })).toBe(true);
        expect(IsWorkJson(Number.NaN)).toBe(false);
        expect(IsWorkJson(undefined)).toBe(false);
    });

    it('parses attributes as a string map and rejects other shapes', () => {
        expect(ParseAttributes('{"eventType":"click"}')).toEqual({ eventType: 'click' });
        expect(ParseAttributes(null)).toEqual({});
        expect(() => ParseAttributes('{"n":1}')).toThrow(WorkQueueConfigurationError);
    });

    it('parses payloads and payload references', () => {
        expect(ParsePayload('{"importId":"x"}')).toEqual({ importId: 'x' });
        expect(ParsePayload(null)).toBeUndefined();
        expect(ParsePayloadRef('{"Uri":"s3://b/k","SizeBytes":10}')).toEqual({ Uri: 's3://b/k', SizeBytes: 10 });
        expect(() => ParsePayloadRef('{"SizeBytes":10}')).toThrow(WorkQueueConfigurationError);
    });
});

describe('MessageFromColumns', () => {
    it('builds the envelope, omitting absent optional fields', () => {
        const message = MessageFromColumns({
            MessageID: 'm1', PartitionKey: null, Sequence: '4', Attributes: '{"a":"b"}', Payload: null,
            PayloadRef: null, CorrelationID: null, PublishedAt: new Date('2026-01-01T00:00:00Z'),
        }, 'import.ready');
        expect(message).toEqual({
            MessageID: 'm1', Topic: 'import.ready', Sequence: 4, Attributes: { a: 'b' }, PublishedAt: '2026-01-01T00:00:00.000Z',
        });
    });
});

describe('SerializeProgress', () => {
    it('drops the checkpoint, then truncates the message, to fit 4,000 characters', () => {
        const big = { Percent: 50, Message: 'm'.repeat(600), Checkpoint: { blob: 'x'.repeat(5000) } };
        const text = SerializeProgress(big);
        expect(text.length).toBeLessThanOrEqual(4000);
        expect(JSON.parse(text)).toEqual({ Percent: 50, Message: 'm'.repeat(500) });
    });

    it('keeps small progress intact', () => {
        expect(JSON.parse(SerializeProgress({ Percent: 10, Checkpoint: { row: 5 } }))).toEqual({ Percent: 10, Checkpoint: { row: 5 } });
    });
});

describe('cursors, UUIDs and page sizes', () => {
    it('round-trips a cursor field and rejects garbage', () => {
        const cursor = EncodeCursor({ DeliveryID: 'abc' });
        expect(DecodeCursorField(cursor, 'DeliveryID')).toBe('abc');
        expect(() => DecodeCursorField('not-base64!', 'DeliveryID')).toThrow(WorkQueueConfigurationError);
    });

    it('recognises UUIDs', () => {
        expect(IsUUID('EEEEEEEE-0000-0000-0000-000000000001')).toBe(true);
        expect(IsUUID('x')).toBe(false);
    });

    it('clamps page sizes to 1-500 with a default of 50', () => {
        expect(ClampPageSize(0)).toBe(50);
        expect(ClampPageSize(-3)).toBe(1);
        expect(ClampPageSize(10000)).toBe(500);
    });
});

describe('binding IDs', () => {
    it('reads the topic and subscription IDs', () => {
        expect(ReadTopicID(TopicBindingFixture())).toBe('AAAAAAAA-0000-0000-0000-000000000001');
        expect(ReadSubscriptionIDs(SubscriptionBindingFixture()).SubscriptionID).toBe('BBBBBBBB-0000-0000-0000-000000000001');
    });

    it('fails with a configuration error when the IDs are missing', () => {
        expect(() => ReadTopicID(TopicBindingFixture({ Config: {} }))).toThrow(WorkQueueConfigurationError);
    });
});
```

`packages/WorkQueue/engine/src/__tests__/DatabaseTransportOperator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DatabaseTransportOperator } from '../transports/database/DatabaseTransportOperator';
import { EncodeCursor } from '../transports/database/rowMapping';
import { RecordingExecutor, SubscriptionBindingFixture, TestDeps } from './fakes';

const DELIVERY = 'EEEEEEEE-0000-0000-0000-000000000001';

function DeadLetterRowFixture(id: string): object {
    return {
        DeliveryID: id, AttemptCount: 5, DeadLetterReason: 'MaxAttemptsExceeded', LastError: 'boom',
        DeadLetteredAt: new Date('2026-01-01T00:00:00Z'), DeliveryPartitionKey: 'venue-42', BlocksKey: 1,
        MessageID: 'M1', PartitionKey: 'venue-42', Sequence: null, Attributes: '{}', Payload: '{"a":1}',
        PayloadRef: null, CorrelationID: null, PublishedAt: new Date('2026-01-01T00:00:00Z'),
    };
}

describe('DatabaseTransportOperator.GetStats', () => {
    it('maps counts, reports blocked keys only for Ordered subscriptions', async () => {
        const executor = new RecordingExecutor().QueueRows([{
            Pending: '3', InFlight: 1, DeadLettered: 2, BlockedKeys: 1, OldestPendingAgeSeconds: 12, CompletedLastHour: null,
        }]);
        const stats = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .GetStats(SubscriptionBindingFixture({ PartitionMode: 'Ordered' }));
        expect(stats).toMatchObject({
            SubscriptionName: 'venue-import', Pending: 3, InFlight: 1, DeadLettered: 2, BlockedKeys: 1,
            OldestPendingAgeSeconds: 12, CompletedLastHour: 0,
        });
    });

    it('returns null blocked keys for unordered subscriptions', async () => {
        const executor = new RecordingExecutor().QueueRows([{ Pending: 0, InFlight: 0, DeadLettered: 0, BlockedKeys: null, OldestPendingAgeSeconds: null, CompletedLastHour: 0 }]);
        const stats = await new DatabaseTransportOperator(executor, TestDeps(executor)).GetStats(SubscriptionBindingFixture());
        expect(stats.BlockedKeys).toBeNull();
        expect(stats.OldestPendingAgeSeconds).toBeNull();
    });
});

describe('DatabaseTransportOperator.ListDeadLetters', () => {
    it('fetches one extra row to decide whether there is a next page', async () => {
        const executor = new RecordingExecutor().QueueRows([DeadLetterRowFixture('D1'), DeadLetterRowFixture('D2'), DeadLetterRowFixture('D3')]);
        const page = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .ListDeadLetters(SubscriptionBindingFixture({ PartitionMode: 'Ordered' }), null, 2);
        expect(page?.Items.map(i => i.DeliveryID)).toEqual(['D1', 'D2']);
        expect(page?.NextCursor).toBe(EncodeCursor({ DeliveryID: 'D2' }));
        expect(page?.Items[0]).toMatchObject({ Attempts: 5, Reason: 'MaxAttemptsExceeded', BlocksKey: true, PartitionKey: 'venue-42' });
        expect(page?.Items[0].Message.Payload).toEqual({ a: 1 });
        expect(executor.Calls[0].Params[0]).toBe(3);
    });

    it('passes a decoded cursor to the keyset', async () => {
        const executor = new RecordingExecutor().QueueRows([]);
        await new DatabaseTransportOperator(executor, TestDeps(executor))
            .ListDeadLetters(SubscriptionBindingFixture(), EncodeCursor({ DeliveryID: 'D2' }), 10);
        expect(executor.Calls[0].Params).toContain('D2');
    });
});

describe('DatabaseTransportOperator.ListPartitions', () => {
    it('returns an empty page for unpartitioned subscriptions without querying', async () => {
        const executor = new RecordingExecutor();
        const page = await new DatabaseTransportOperator(executor, TestDeps(executor)).ListPartitions(SubscriptionBindingFixture(), null, null, 10);
        expect(page).toEqual({ Items: [], NextCursor: null });
        expect(executor.Calls).toHaveLength(0);
    });

    it('maps partition rows', async () => {
        const executor = new RecordingExecutor().QueueRows([{
            PartitionKey: 'venue-42', Condition: 'Blocked', HeadDeliveryID: DELIVERY, LastCompletedSequence: null,
            AwaitingSequenceSince: null, WaitingItems: '4',
        }]);
        const page = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .ListPartitions(SubscriptionBindingFixture({ PartitionMode: 'Ordered' }), 'Blocked', null, 10);
        expect(page?.Items).toEqual([{
            PartitionKey: 'venue-42', Condition: 'Blocked', HeadDeliveryID: DELIVERY, LastCompletedSequence: null,
            AwaitingSequenceSince: null, WaitingItems: 4,
        }]);
    });
});

describe('DatabaseTransportOperator resolutions', () => {
    it('replays a dead letter and reports a change', async () => {
        const executor = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]);
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .Replay(SubscriptionBindingFixture(), DELIVERY, null, 'fixed');
        expect(result).toEqual({ Supported: true, Changed: true });
    });

    it('does not touch the database for a malformed delivery ID', async () => {
        const executor = new RecordingExecutor();
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor)).Replay(SubscriptionBindingFixture(), 'nope', null, null);
        expect(result).toEqual({ Supported: true, Changed: false });
        expect(executor.Calls).toHaveLength(0);
    });

    it('discards inside a transaction and advances the sequence mark for explicit-sequence keys', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ PartitionKey: 'venue-42', OrderKey: '3' }])
            .QueueRows([{ LastCompletedSequence: 3 }]);
        const binding = SubscriptionBindingFixture({ PartitionMode: 'Ordered', OrderingMode: 'ExplicitSequence' });
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor)).Discard(binding, DELIVERY, 'bad batch', null);
        expect(result).toEqual({ Supported: true, Changed: true, CancelRequested: false });
        expect(executor.Calls[0].SQL).toContain("N'DeadLettered', N'Pending'");
        expect(executor.Calls[1].SQL).toContain('@Mark');
        expect(executor.Events).toEqual(['independent', 'begin', 'commit', 'release']);
    });

    it('falls back to revoking the lease when the delivery is in flight', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([])                          // DiscardDelivery matched nothing (row is InFlight)
            .QueueRows([{ AffectedRows: 1 }]);      // CancelInFlightDelivery revoked the lease
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .Discard(SubscriptionBindingFixture(), DELIVERY, 'operator cancelled', USER);
        expect(result).toEqual({ Supported: true, Changed: true, CancelRequested: true });
        expect(executor.Calls[1].SQL).toContain('[CancelRequestedAt] = SYSDATETIMEOFFSET(), [LeaseToken] = NEWID()');
    });

    it('reports no change when the delivery is already completed', async () => {
        const executor = new RecordingExecutor().QueueRows([]).QueueRows([{ AffectedRows: 0 }]);
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .Discard(SubscriptionBindingFixture(), DELIVERY, 'too late', null);
        expect(result).toEqual({ Supported: true, Changed: false, CancelRequested: false });
    });

    it('reports the autoscaler backlog as claimable plus in-flight counts', async () => {
        const executor = new RecordingExecutor().QueueRows([{ Claimable: '7', InFlight: 2 }]);
        const backlog = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .GetBacklog(SubscriptionBindingFixture({ PartitionMode: 'Ordered', OrderingMode: 'ExplicitSequence' }));
        expect(backlog).toEqual({ Claimable: 7, InFlight: 2 });
        expect(executor.Calls[0].SQL).toContain('AS [Claimable]');
    });

    it('rejects skip-sequence on subscriptions that are not Ordered explicit-sequence', async () => {
        const executor = new RecordingExecutor();
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .SkipSequence(SubscriptionBindingFixture({ PartitionMode: 'Ordered' }), 'venue-42', 5, 'lost', null);
        expect(result).toEqual({ Supported: false });
    });

    it('skips a sequence: ensure state, move the mark, cascade', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ AffectedRows: 0 }])
            .QueueRows([{ AffectedRows: 1 }])
            .QueueRows([{ LastCompletedSequence: 6 }]);
        const binding = SubscriptionBindingFixture({ PartitionMode: 'Ordered', OrderingMode: 'ExplicitSequence' });
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor)).SkipSequence(binding, 'venue-42', 5, 'lost', null);
        expect(result).toEqual({ Supported: true, Changed: true });
        expect(executor.Calls[0].SQL).toContain('[WorkQueuePartitionState]');
        expect(executor.Calls[1].SQL).toContain('[LastCompletedSequence] = @p2 - 1');
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test rowMapping DatabaseTransportOperator`
Expected: FAIL — unresolved imports under `../transports/`.

- [ ] **Step 4: Write `src/transports/TransportDriverDeps.ts`**

```typescript
import type { UserInfo } from '@memberjunction/core';
import type { WorkLogger } from '@memberjunction/work-queue-core';
import type { WorkQueueExecutorSource } from '../sql/WorkQueueSqlExecutor';

/** Everything a transport driver factory hands to the drivers it builds (03 §11). */
export interface DeadLetteredEvent {
    SubscriptionName: string;
    DeliveryID: string;
    Reason: string;
    PartitionKey: string | null;
}

export interface TransportDriverDeps {
    ContextUser: UserInfo;
    Executor: WorkQueueExecutorSource;
    Log: WorkLogger;
    /** Lease owner identity for claims; defaults to host:pid:random. */
    InstanceID?: string;
    /** Alerting seam (03 §11): the engine passes a notifier that fans out to its OnDeadLettered listeners. */
    NotifyDeadLettered?: (event: DeadLetteredEvent) => void;
}
```

- [ ] **Step 5: Write `src/transports/database/bindingIds.ts`**

```typescript
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { SubscriptionBinding, TopicBinding, WorkJson } from '@memberjunction/work-queue-core';

export interface DatabaseSubscriptionIDs {
    SubscriptionID: string;
    TopicID: string;
}

export function ReadTopicID(binding: TopicBinding): string {
    return RequireString(binding.Config['TopicID'], `Topic '${binding.TopicName}' binding is missing Config.TopicID`);
}

export function ReadSubscriptionIDs(binding: SubscriptionBinding): DatabaseSubscriptionIDs {
    const name = binding.Policy.SubscriptionName;
    return {
        SubscriptionID: RequireString(binding.Config['SubscriptionID'], `Subscription '${name}' binding is missing Config.SubscriptionID`),
        TopicID: RequireString(binding.Config['TopicID'], `Subscription '${name}' binding is missing Config.TopicID`),
    };
}

function RequireString(value: WorkJson | undefined, message: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new WorkQueueConfigurationError(message);
    }
    return value;
}
```

- [ ] **Step 6: Write `src/transports/database/rowMapping.ts`**

```typescript
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { WorkJson, WorkMessage, WorkPayloadRef, WorkProgress } from '@memberjunction/work-queue-core';
import { ToIsoString, ToNumber } from '../../sql/sqlExecution';

const PROGRESS_MAX_CHARS = 4000;
const PROGRESS_MESSAGE_MAX_CHARS = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Message columns as they come back from claim and dead-letter queries. */
export interface MessageColumns {
    MessageID: string;
    PartitionKey: string | null;
    Sequence: number | string | null;
    Attributes: string | null;
    Payload: string | null;
    PayloadRef: string | null;
    CorrelationID: string | null;
    PublishedAt: Date | string;
}

// The JSON-safety guard lives in the browser-safe base package (both tiers validate JSON columns).
export { IsWorkJson } from '@memberjunction/work-queue-base';

export function ParseAttributes(json: string | null): Record<string, string> {
    if (json === null || json.trim() === '') {
        return {};
    }
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new WorkQueueConfigurationError('Stored message Attributes are not a JSON object');
    }
    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
        if (typeof value !== 'string') {
            throw new WorkQueueConfigurationError(`Stored message attribute '${key}' is not a string`);
        }
        attributes[key] = value;
    }
    return attributes;
}

/**
 * Parses a stored payload. The payload type is the handler's declaration, not something the database can
 * prove, so this is the single unchecked narrowing point — the same contract ExecuteSQL<T> applies to rows.
 */
export function ParsePayload<TPayload extends WorkJson = WorkJson>(json: string | null): TPayload | undefined {
    if (json === null) {
        return undefined;
    }
    const parsed: unknown = JSON.parse(json);
    if (!IsWorkJson(parsed)) {
        throw new WorkQueueConfigurationError('Stored message Payload is not JSON-safe');
    }
    return parsed as TPayload;
}

export function ParsePayloadRef(json: string | null): WorkPayloadRef | undefined {
    if (json === null) {
        return undefined;
    }
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || !('Uri' in parsed) || typeof parsed.Uri !== 'string') {
        throw new WorkQueueConfigurationError('Stored message PayloadRef has no Uri');
    }
    const ref: WorkPayloadRef = { Uri: parsed.Uri };
    if ('ContentType' in parsed && typeof parsed.ContentType === 'string') {
        ref.ContentType = parsed.ContentType;
    }
    if ('SizeBytes' in parsed && typeof parsed.SizeBytes === 'number') {
        ref.SizeBytes = parsed.SizeBytes;
    }
    if ('Checksum' in parsed && typeof parsed.Checksum === 'string') {
        ref.Checksum = parsed.Checksum;
    }
    return ref;
}

export function MessageFromColumns<TPayload extends WorkJson = WorkJson>(columns: MessageColumns, topicName: string): WorkMessage<TPayload> {
    const message: WorkMessage<TPayload> = {
        MessageID: columns.MessageID,
        Topic: topicName,
        Attributes: ParseAttributes(columns.Attributes),
        PublishedAt: ToIsoString(columns.PublishedAt) ?? new Date(0).toISOString(),
    };
    const sequence = ToNumber(columns.Sequence);
    const payload = ParsePayload<TPayload>(columns.Payload);
    const payloadRef = ParsePayloadRef(columns.PayloadRef);
    if (columns.PartitionKey !== null) message.PartitionKey = columns.PartitionKey;
    if (sequence !== null) message.Sequence = sequence;
    if (payload !== undefined) message.Payload = payload;
    if (payloadRef !== undefined) message.PayloadRef = payloadRef;
    if (columns.CorrelationID !== null) message.CorrelationID = columns.CorrelationID;
    return message;
}

/** Serialises progress into the 4,000-character column: drop the checkpoint first, then trim the message. */
export function SerializeProgress(progress: WorkProgress): string {
    const full = JSON.stringify(progress);
    if (full.length <= PROGRESS_MAX_CHARS) {
        return full;
    }
    const withoutCheckpoint: WorkProgress = {};
    if (progress.Percent !== undefined) withoutCheckpoint.Percent = progress.Percent;
    if (progress.Message !== undefined) withoutCheckpoint.Message = progress.Message.slice(0, PROGRESS_MESSAGE_MAX_CHARS);
    return JSON.stringify(withoutCheckpoint);
}

export function EncodeCursor(value: Record<string, string>): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function DecodeCursorField(cursor: string, field: string): string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch {
        throw new WorkQueueConfigurationError('Invalid page cursor');
    }
    if (typeof parsed !== 'object' || parsed === null || !(field in parsed)) {
        throw new WorkQueueConfigurationError('Invalid page cursor');
    }
    const value: unknown = Reflect.get(parsed, field);
    if (typeof value !== 'string') {
        throw new WorkQueueConfigurationError('Invalid page cursor');
    }
    return value;
}

export function IsUUID(value: string): boolean {
    return UUID_PATTERN.test(value.trim());
}

export function ClampPageSize(pageSize: number): number {
    if (!Number.isFinite(pageSize) || pageSize === 0) {
        return 50;
    }
    return Math.min(Math.max(Math.floor(pageSize), 1), 500);
}
```

- [ ] **Step 7: Write `src/transports/database/DatabaseTransportOperator.ts`**

```typescript
import type {
    DeadLetterRecord, ITransportOperator, OperatorResult, Page, PartitionCondition, PartitionStateRecord,
    SubscriptionBinding, SubscriptionStats,
} from '@memberjunction/work-queue-core';
import { CreateWorkQueueSqlBuilder } from '../../sql/CreateWorkQueueSqlBuilder';
import type { DeadLetterRow, DiscardedDeliveryRow, PartitionRow, SequenceMarkRow, StatsRow } from '../../sql/rows';
import { ExecuteRows, ExecuteWrite, ToBoolean, ToIsoString, ToNumber } from '../../sql/sqlExecution';
import type { WorkQueueSqlBuilder } from '../../sql/WorkQueueSqlBuilder';
import type { WorkQueueExecutorSource, WorkQueueTransactionalExecutor } from '../../sql/WorkQueueSqlExecutor';
import { RunInWorkQueueTransaction } from '../../transaction/RunInWorkQueueTransaction';
import type { TransportDriverDeps } from '../TransportDriverDeps';
import { ReadSubscriptionIDs } from './bindingIds';
import { ClampPageSize, DecodeCursorField, EncodeCursor, IsUUID, MessageFromColumns } from './rowMapping';

export class DatabaseTransportOperator implements ITransportOperator {
    private readonly sql: WorkQueueSqlBuilder;

    constructor(private readonly executor: WorkQueueExecutorSource, private readonly deps: TransportDriverDeps) {
        this.sql = CreateWorkQueueSqlBuilder(executor);
    }

    public async GetStats(subscription: SubscriptionBinding): Promise<SubscriptionStats> {
        const ids = ReadSubscriptionIDs(subscription);
        const ordered = subscription.Policy.PartitionMode === 'Ordered';
        const rows = await ExecuteRows<StatsRow>(this.executor, this.sql.Operator.SubscriptionStats(ids.SubscriptionID, ordered), this.deps.ContextUser);
        const row = rows[0];
        return {
            SubscriptionName: subscription.Policy.SubscriptionName,
            Pending: ToNumber(row?.Pending) ?? 0,
            InFlight: ToNumber(row?.InFlight) ?? 0,
            DeadLettered: ToNumber(row?.DeadLettered) ?? 0,
            BlockedKeys: ordered ? ToNumber(row?.BlockedKeys) ?? 0 : null,
            OldestPendingAgeSeconds: ToNumber(row?.OldestPendingAgeSeconds),
            CompletedLastHour: ToNumber(row?.CompletedLastHour) ?? 0,
            AsOf: new Date().toISOString(),
        };
    }

    public async ListDeadLetters(subscription: SubscriptionBinding, cursor: string | null, pageSize: number): Promise<Page<DeadLetterRecord>> {
        const ids = ReadSubscriptionIDs(subscription);
        const size = ClampPageSize(pageSize);
        const after = cursor ? { DeliveryID: DecodeCursorField(cursor, 'DeliveryID') } : null;
        const ordered = subscription.Policy.PartitionMode === 'Ordered';
        const rows = await ExecuteRows<DeadLetterRow>(
            this.executor, this.sql.Operator.ListDeadLetters(ids.SubscriptionID, ordered, after, size + 1), this.deps.ContextUser);
        const page = rows.slice(0, size);
        const last = page[page.length - 1];
        return {
            Items: page.map(row => this.DeadLetterFromRow(row, subscription.Policy.TopicName)),
            NextCursor: rows.length > size && last ? EncodeCursor({ DeliveryID: last.DeliveryID }) : null,
        };
    }

    public async ListPartitions(subscription: SubscriptionBinding, condition: PartitionCondition | null,
                                cursor: string | null, pageSize: number): Promise<Page<PartitionStateRecord>> {
        if (subscription.Policy.PartitionMode === 'None') {
            return { Items: [], NextCursor: null };
        }
        const ids = ReadSubscriptionIDs(subscription);
        const size = ClampPageSize(pageSize);
        const afterKey = cursor ? DecodeCursorField(cursor, 'PartitionKey') : null;
        const ordered = subscription.Policy.PartitionMode === 'Ordered';
        const rows = await ExecuteRows<PartitionRow>(
            this.executor, this.sql.Operator.ListPartitions(ids.SubscriptionID, ordered, condition, afterKey, size + 1), this.deps.ContextUser);
        const page = rows.slice(0, size);
        const last = page[page.length - 1];
        return {
            Items: page.map(row => ({
                PartitionKey: row.PartitionKey,
                Condition: row.Condition,
                HeadDeliveryID: row.HeadDeliveryID,
                LastCompletedSequence: ToNumber(row.LastCompletedSequence),
                AwaitingSequenceSince: ToIsoString(row.AwaitingSequenceSince),
                WaitingItems: ToNumber(row.WaitingItems) ?? 0,
            })),
            NextCursor: rows.length > size && last ? EncodeCursor({ PartitionKey: last.PartitionKey }) : null,
        };
    }

    public async Replay(subscription: SubscriptionBinding, deliveryID: string, actorUserID: string | null, note: string | null): Promise<OperatorResult> {
        if (!IsUUID(deliveryID)) {
            return { Supported: true, Changed: false };
        }
        const ids = ReadSubscriptionIDs(subscription);
        const count = await ExecuteWrite(
            this.executor, this.sql.Operator.ReplayDelivery(ids.SubscriptionID, deliveryID, actorUserID, note), this.deps.ContextUser);
        this.deps.Log.Info(`Replay of delivery ${deliveryID} on '${subscription.Policy.SubscriptionName}': ${count === 1 ? 'replayed' : 'not dead-lettered'}`);
        return { Supported: true, Changed: count === 1 };
    }

    public async Discard(subscription: SubscriptionBinding, deliveryID: string, reason: string, actorUserID: string | null): Promise<OperatorResult> {
        if (!IsUUID(deliveryID)) {
            return { Supported: true, Changed: false };
        }
        const ids = ReadSubscriptionIDs(subscription);
        const changed = await RunInWorkQueueTransaction(this.executor, async tx => {
            const rows = await ExecuteRows<DiscardedDeliveryRow>(
                tx, this.sql.Operator.DiscardDelivery(ids.SubscriptionID, deliveryID, true, actorUserID, reason), this.deps.ContextUser);
            const discarded = rows[0];
            if (discarded && discarded.PartitionKey !== null && this.IsSequenced(subscription)) {
                await this.AdvanceMark(tx, ids.SubscriptionID, discarded.PartitionKey);
            }
            return { Commit: true, Value: discarded !== undefined };
        });
        if (changed) {
            this.deps.Log.Info(`Discard of delivery ${deliveryID} on '${subscription.Policy.SubscriptionName}': discarded (${reason})`);
            return { Supported: true, Changed: true, CancelRequested: false };
        }
        // Not Pending or DeadLettered: if it is in flight, revoke its lease (03 §7). The row stays InFlight until the
        // lease expires so an Exclusive/Ordered key is not handed on while the old handler is still stopping;
        // ExpireLeases then settles it as Discarded.
        const revoked = await ExecuteWrite(
            this.executor, this.sql.Operator.CancelInFlightDelivery(ids.SubscriptionID, deliveryID, actorUserID, reason), this.deps.ContextUser);
        this.deps.Log.Info(`Discard of delivery ${deliveryID} on '${subscription.Policy.SubscriptionName}': ${revoked === 1 ? 'cancel requested (lease revoked)' : 'not discardable'} (${reason})`);
        return { Supported: true, Changed: revoked === 1, CancelRequested: revoked === 1 };
    }

    public async SkipSequence(subscription: SubscriptionBinding, partitionKey: string, sequence: number,
                              reason: string, actorUserID: string | null): Promise<OperatorResult> {
        if (!this.IsSequenced(subscription) || !Number.isInteger(sequence) || sequence < 1) {
            return { Supported: false };
        }
        const ids = ReadSubscriptionIDs(subscription);
        const changed = await RunInWorkQueueTransaction(this.executor, async tx => {
            await ExecuteWrite(tx, this.sql.Publish.EnsureSequenceState(ids.SubscriptionID, partitionKey), this.deps.ContextUser);
            const count = await ExecuteWrite(tx, this.sql.Operator.SkipSequence(ids.SubscriptionID, partitionKey, sequence), this.deps.ContextUser);
            if (count === 1) {
                await this.AdvanceMark(tx, ids.SubscriptionID, partitionKey);
            }
            return { Commit: true, Value: count === 1 };
        });
        this.deps.Log.Info(`SkipSequence ${sequence} for key '${partitionKey}' on '${subscription.Policy.SubscriptionName}' by ${actorUserID ?? 'system'}: ${changed ? 'skipped' : 'not skippable'} (${reason})`);
        return { Supported: true, Changed: changed };
    }

    /**
     * Autoscaler metric (03 §11). `Claimable` applies the partition rules, so a blocked Ordered key contributes
     * nothing; `InFlight` is reported separately because scalers subtract running executions from the metric.
     */
    public async GetBacklog(subscription: SubscriptionBinding): Promise<{ Claimable: number; InFlight: number }> {
        const ids = ReadSubscriptionIDs(subscription);
        const statement = this.sql.Consume.SubscriptionBacklog(
            ids.SubscriptionID, subscription.Policy.PartitionMode, subscription.Policy.OrderingMode === 'ExplicitSequence');
        const rows = await ExecuteRows<BacklogRow>(this.executor, statement, this.deps.ContextUser);
        const row = rows[0];
        return { Claimable: ToNumber(row?.Claimable) ?? 0, InFlight: ToNumber(row?.InFlight) ?? 0 };
    }

    private IsSequenced(subscription: SubscriptionBinding): boolean {
        return subscription.Policy.PartitionMode === 'Ordered' && subscription.Policy.OrderingMode === 'ExplicitSequence';
    }

    private async AdvanceMark(tx: WorkQueueTransactionalExecutor, subscriptionID: string, partitionKey: string): Promise<void> {
        await ExecuteRows<SequenceMarkRow>(tx, this.sql.Consume.AdvanceSequenceMark(subscriptionID, partitionKey), this.deps.ContextUser);
    }

    private DeadLetterFromRow(row: DeadLetterRow, topicName: string): DeadLetterRecord {
        return {
            DeliveryID: row.DeliveryID,
            Message: MessageFromColumns(row, topicName),
            PartitionKey: row.DeliveryPartitionKey ?? row.PartitionKey,
            Attempts: ToNumber(row.AttemptCount) ?? 0,
            Reason: row.DeadLetterReason ?? 'Unknown',
            LastError: row.LastError,
            DeadLetteredAt: ToIsoString(row.DeadLetteredAt),
            BlocksKey: ToBoolean(row.BlocksKey),
        };
    }
}
```

`ITransportOperator.ListDeadLetters` / `ListPartitions` allow `null` for unsupported transports; the Database operator always supports them and returns a page.

- [ ] **Step 8: Export the new modules**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './transports/TransportDriverDeps';
export * from './transports/database/bindingIds';
export * from './transports/database/rowMapping';
export * from './transports/database/DatabaseTransportOperator';
```

- [ ] **Step 9: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — previous suites plus rowMapping (11) and DatabaseTransportOperator (11).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 10: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): Database transport operator and row mapping"
```

---

### Task 9: `DatabaseTransportDriver` and `DatabaseTransportConsumer`

**Files:**
- Create: `packages/WorkQueue/engine/src/transports/database/databaseCapabilities.ts`, `src/transports/database/deliveryPlan.ts`
- Create: `packages/WorkQueue/engine/src/publish/publishResults.ts`
- Create: `packages/WorkQueue/engine/src/transports/database/DatabaseTransportDriver.ts`, `src/transports/database/DatabaseTransportConsumer.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/deliveryPlan.test.ts`, `src/__tests__/DatabaseTransportDriver.test.ts`, `src/__tests__/DatabaseTransportConsumer.test.ts`

**Interfaces:**
- Consumes: Tasks 2–8 (`CreateWorkQueueSqlBuilder`, rows, execution helpers, `RunInWorkQueueTransaction`, `RetryTransient`, `TransportDriverDeps`, `ReadTopicID`, `ReadSubscriptionIDs`, `MessageFromColumns`, `SerializeProgress`, `DatabaseTransportOperator`, fakes); from core: `ITransportDriver`, `ITransportConsumer`, `TransportCapabilities`, `DatabasePublishOptions`, `TopicBinding`, `SubscriptionBinding`, `WorkMessage`, `WorkJson`, `WorkProgress`, `PublishResult`, `ReceivedDelivery`, `SettleResult`, `BindingValidationIssue`, `PartitionMode`, `MatchesFilter`.
- Produces:
  - `DATABASE_TRANSPORT_CAPABILITIES: TransportCapabilities` (03 §5 Database values, including `Filters: WORK_QUEUE_FILTER_SUPPORT`)
  - `Accepted(messageID: string): PublishResult`, `Duplicate(messageID: string): PublishResult`, `Rejected(messageID: string, code: string, message: string, retryable: boolean): PublishResult`
  - `interface PlannedDelivery { SubscriptionID: string; PartitionMode: PartitionMode }`, `interface DeliveryPlan { Deliveries: PlannedDelivery[]; NeedsPublishOrderLock: boolean; SequenceStateSubscriptionIDs: string[] }`
  - `BuildDeliveryPlan(topic: TopicBinding, message: WorkMessage, subscriptions: SubscriptionBinding[]): DeliveryPlan`, `ToMessageInsertRow(message: WorkMessage, topicID: string, userID: string | null): MessageInsertRow`, `ToDeliveryRows(message: WorkMessage, plan: DeliveryPlan, orderKey: number): DeliveryInsertRow[]`, `SameEnvelope(existing: MessageInsertOutcomeRow, row: MessageInsertRow): boolean`, `ResolveExistingOutcome(outcomes: MessageInsertOutcomeRow[], row: MessageInsertRow): PublishResult`
  - `interface DatabaseTransportPublishOptions extends DatabasePublishOptions { readonly Kind: 'Database'; readonly Executor?: WorkQueueTransactionalExecutor; readonly UserID?: string | null }`, `IsDatabaseTransportPublishOptions(options: DatabasePublishOptions | undefined): options is DatabaseTransportPublishOptions`
  - `DefaultInstanceID(): string`
  - `class DatabaseTransportDriver implements ITransportDriver { constructor(executor: WorkQueueExecutorSource, deps: TransportDriverDeps); get InstanceID(): string }`
  - `class DatabaseTransportConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> { constructor(executor: WorkQueueExecutorSource, sql: WorkQueueSqlBuilder, binding: SubscriptionBinding, deps: TransportDriverDeps, leaseOwner: string) }`

Publish rules (including the sequence fixes from plan 04 CD5/CD6): a delivery whose `OrderKey` is already covered by its key's `LastCompletedSequence` is inserted `Discarded` with `ResolutionNote = 'SequenceAlreadyResolved'` (Tasks 3/6 `InsertDeliveries`), and the awaiting-sequence flag is cleared right after the missing sequence's delivery is inserted; the mark advance (`AdvanceSequenceMark`) already walks through consecutive `Completed`/`Discarded` sequences after Complete, Discard and SkipSequence. Each message is written in its own transaction (or inside the caller's executor transaction when `DatabaseTransportPublishOptions.Executor` is set, in which case the caller commits). Every matching `Active`/`Paused` subscription the engine passed receives a delivery; delivery `PartitionKey` is set only for `Exclusive`/`Ordered` subscriptions; `OrderKey` is the `Sequence` on `ExplicitSequence` topics, else `PublishOrdinal`. `Ordered` subscriptions on `PublishOrder` topics take the publish-order lock before the message insert. `Ordered` subscriptions on `ExplicitSequence` topics get their sequence state row before deliveries (lock order partition state → deliveries, matching `AdvanceSequenceMark`). A message with no matching subscription is still stored (so `MessageID` duplicates stay detectable) and is purged by retention.

Consume rules: `Receive` runs `ExpireLeases`, then (for partitioned subscriptions) sequence bookkeeping, candidate selection and one guarded claim per candidate — a violation of `UQ_WorkQueueDelivery_InFlightPartition` means another worker won that key — then fills remaining capacity with keyless deliveries. `waitSeconds` is ignored: the Database consumer never long-polls; the runtime's idle backoff paces it. Settles are fenced; zero rows means `LeaseLost`; infrastructure errors become `Failed`. `Complete` on `Ordered` + `ExplicitSequence` runs completion and mark advancement in one transaction.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/deliveryPlan.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { WorkMessage } from '@memberjunction/work-queue-core';
import {
    BuildDeliveryPlan, ResolveExistingOutcome, SameEnvelope, ToDeliveryRows, ToMessageInsertRow,
} from '../transports/database/deliveryPlan';
import type { MessageInsertOutcomeRow } from '../sql/rows';
import { SubscriptionBindingFixture, TOPIC_ID, TopicBindingFixture } from './fakes';

const MESSAGE: WorkMessage = {
    MessageID: 'CCCCCCCC-0000-0000-0000-000000000001',
    Topic: 'import.ready',
    PartitionKey: 'venue-42',
    Attributes: { eventType: 'import' },
    Payload: { importId: 'x' },
    PublishedAt: '2026-01-01T00:00:00.000Z',
};

const NONE = SubscriptionBindingFixture({ SubscriptionName: 'archive', PartitionMode: 'None' }, { SubscriptionID: 'S-NONE' });
const EXCLUSIVE = SubscriptionBindingFixture({ SubscriptionName: 'update', PartitionMode: 'Exclusive' }, { SubscriptionID: 'S-EXCL' });
const ORDERED = SubscriptionBindingFixture({ SubscriptionName: 'apply', PartitionMode: 'Ordered' }, { SubscriptionID: 'S-ORD' });

describe('BuildDeliveryPlan', () => {
    it('includes only subscriptions whose filter matches', () => {
        const filtered = {
            ...EXCLUSIVE,
            Filter: { logic: 'and' as const, filters: [{ field: 'eventType', operator: 'eq' as const, value: 'click' }] },
        };
        const plan = BuildDeliveryPlan(TopicBindingFixture(), MESSAGE, [NONE, filtered]);
        expect(plan.Deliveries.map(d => d.SubscriptionID)).toEqual(['S-NONE']);
    });

    it('requires the publish-order lock only for Ordered subscriptions on keyed PublishOrder messages', () => {
        expect(BuildDeliveryPlan(TopicBindingFixture(), MESSAGE, [NONE, EXCLUSIVE]).NeedsPublishOrderLock).toBe(false);
        expect(BuildDeliveryPlan(TopicBindingFixture(), MESSAGE, [ORDERED]).NeedsPublishOrderLock).toBe(true);
        const keyless = { ...MESSAGE, PartitionKey: undefined };
        expect(BuildDeliveryPlan(TopicBindingFixture(), keyless, [ORDERED]).NeedsPublishOrderLock).toBe(false);
    });

    it('lists sequence-state subscriptions for Ordered subscriptions on ExplicitSequence topics', () => {
        const topic = TopicBindingFixture({ OrderingMode: 'ExplicitSequence' });
        const plan = BuildDeliveryPlan(topic, { ...MESSAGE, Sequence: 3 }, [NONE, ORDERED]);
        expect(plan.SequenceStateSubscriptionIDs).toEqual(['S-ORD']);
        expect(plan.NeedsPublishOrderLock).toBe(false);
    });
});

describe('row builders', () => {
    it('stores the partition key only on partitioned deliveries', () => {
        const plan = BuildDeliveryPlan(TopicBindingFixture(), MESSAGE, [NONE, EXCLUSIVE]);
        expect(ToDeliveryRows(MESSAGE, plan, 17)).toEqual([
            { MessageID: MESSAGE.MessageID, SubscriptionID: 'S-NONE', PartitionKey: null, OrderKey: 17 },
            { MessageID: MESSAGE.MessageID, SubscriptionID: 'S-EXCL', PartitionKey: 'venue-42', OrderKey: 17 },
        ]);
    });

    it('serialises the envelope for insert', () => {
        expect(ToMessageInsertRow(MESSAGE, TOPIC_ID, 'U1')).toEqual({
            ID: MESSAGE.MessageID, TopicID: TOPIC_ID, PartitionKey: 'venue-42', Sequence: null,
            AttributesJSON: '{"eventType":"import"}', PayloadJSON: '{"importId":"x"}', PayloadRefJSON: null,
            CorrelationID: null, PublishedAt: new Date('2026-01-01T00:00:00.000Z'), PublishedByUserID: 'U1',
        });
    });
});

describe('existing-row outcomes', () => {
    const row = ToMessageInsertRow(MESSAGE, TOPIC_ID, null);
    const existing = (overrides: Partial<MessageInsertOutcomeRow>): MessageInsertOutcomeRow => ({
        Outcome: 'Exists', ID: row.ID.toLowerCase(), PublishOrdinal: null, TopicID: TOPIC_ID.toLowerCase(), PartitionKey: 'venue-42',
        Sequence: null, Attributes: row.AttributesJSON, Payload: row.PayloadJSON, PayloadRef: null, CorrelationID: null, ...overrides,
    });

    it('treats an identical envelope with the same ID as a duplicate', () => {
        expect(SameEnvelope(existing({}), row)).toBe(true);
        expect(ResolveExistingOutcome([existing({})], row)).toEqual({ MessageID: row.ID, Status: 'Duplicate' });
    });

    it('rejects a reused ID with a different envelope', () => {
        const result = ResolveExistingOutcome([existing({ Payload: '{"importId":"y"}' })], row);
        expect(result.Status).toBe('Rejected');
        expect(result.Error?.Code).toBe('MessageIDConflict');
    });

    it('rejects a sequence already taken by another message', () => {
        const result = ResolveExistingOutcome([existing({ ID: 'OTHER' })], row);
        expect(result.Error?.Code).toBe('DuplicateSequence');
    });

    it('asks the caller to retry when no outcome row came back', () => {
        const result = ResolveExistingOutcome([], row);
        expect(result.Error).toEqual({ Code: 'TransportUnavailable', Message: expect.stringContaining('retry'), Retryable: true });
    });
});
```

`packages/WorkQueue/engine/src/__tests__/DatabaseTransportDriver.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { WorkMessage } from '@memberjunction/work-queue-core';
import { DatabaseTransportDriver, DefaultInstanceID } from '../transports/database/DatabaseTransportDriver';
import type { DatabaseTransportPublishOptions } from '../transports/database/DatabaseTransportDriver';
import { DatabaseTransportConsumer } from '../transports/database/DatabaseTransportConsumer';
import { DatabaseTransportOperator } from '../transports/database/DatabaseTransportOperator';
import { DATABASE_TRANSPORT_CAPABILITIES } from '../transports/database/databaseCapabilities';
import { RecordingExecutor, RecordingLogger, SubscriptionBindingFixture, TestDeps, TopicBindingFixture } from './fakes';

const MESSAGE: WorkMessage = {
    MessageID: 'CCCCCCCC-0000-0000-0000-000000000001',
    Topic: 'import.ready',
    PartitionKey: 'venue-42',
    Attributes: {},
    PublishedAt: '2026-01-01T00:00:00.000Z',
};

const INSERTED = { Outcome: 'Inserted', ID: MESSAGE.MessageID, PublishOrdinal: '17', TopicID: null, PartitionKey: null, Sequence: null, Attributes: null, Payload: null, PayloadRef: null, CorrelationID: null };

describe('DatabaseTransportDriver.Publish', () => {
    it('writes the message and deliveries in one transaction and accepts', async () => {
        const executor = new RecordingExecutor().QueueRows([INSERTED]).QueueRows([{ AffectedRows: 2 }]);
        const driver = new DatabaseTransportDriver(executor, TestDeps(executor));
        const subs = [
            SubscriptionBindingFixture({ PartitionMode: 'None' }, { SubscriptionID: 'S-NONE' }),
            SubscriptionBindingFixture({ PartitionMode: 'Exclusive' }, { SubscriptionID: 'S-EXCL' }),
        ];
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], subs);
        expect(result).toEqual({ MessageID: MESSAGE.MessageID, Status: 'Accepted' });
        expect(executor.Calls[0].SQL).toContain('[WorkQueueMessage]');
        expect(executor.Calls[1].Params).toEqual([MESSAGE.MessageID, 'S-NONE', null, 17, MESSAGE.MessageID, 'S-EXCL', 'venue-42', 17]);
        expect(executor.Events).toEqual(['independent', 'begin', 'commit', 'release']);
    });

    it('takes the publish-order lock first for Ordered subscriptions', async () => {
        const executor = new RecordingExecutor().QueueRows([{ LockResult: 0 }]).QueueRows([INSERTED]).QueueRows([{ AffectedRows: 1 }]);
        const driver = new DatabaseTransportDriver(executor, TestDeps(executor));
        await driver.Publish(TopicBindingFixture(), [MESSAGE], [SubscriptionBindingFixture({ PartitionMode: 'Ordered' })]);
        expect(executor.Calls[0].SQL).toContain('sp_getapplock');
    });

    it('ensures sequence state, uses the sequence as order key and clears a satisfied gap on ExplicitSequence topics', async () => {
        const executor = new RecordingExecutor().QueueRows([INSERTED]).QueueRows([{ AffectedRows: 1 }]).QueueRows([{ AffectedRows: 1 }]).QueueRows([{ AffectedRows: 1 }]);
        const driver = new DatabaseTransportDriver(executor, TestDeps(executor));
        await driver.Publish(TopicBindingFixture({ OrderingMode: 'ExplicitSequence' }), [{ ...MESSAGE, Sequence: 3 }],
            [SubscriptionBindingFixture({ PartitionMode: 'Ordered', OrderingMode: 'ExplicitSequence' })]);
        expect(executor.Calls[1].SQL).toContain('[WorkQueuePartitionState]');
        expect(executor.Calls[2].Params[3]).toBe(3);
        expect(executor.Calls[3].SQL).toContain('[AwaitingSequenceSince] = NULL');
    });

    it('stores a message with no matching subscription without inserting deliveries', async () => {
        const executor = new RecordingExecutor().QueueRows([INSERTED]);
        const driver = new DatabaseTransportDriver(executor, TestDeps(executor));
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], []);
        expect(result.Status).toBe('Accepted');
        expect(executor.Calls).toHaveLength(1);
    });

    it('rolls back a duplicate', async () => {
        const executor = new RecordingExecutor().QueueRows([{ ...INSERTED, Outcome: 'Exists', PublishOrdinal: null, TopicID: 'AAAAAAAA-0000-0000-0000-000000000001', PartitionKey: 'venue-42', Attributes: '{}' }]);
        const driver = new DatabaseTransportDriver(executor, TestDeps(executor));
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], []);
        expect(result.Status).toBe('Duplicate');
        expect(executor.Events).toContain('rollback');
    });

    it("writes on the caller's executor without managing a transaction", async () => {
        const source = new RecordingExecutor();
        const caller = new RecordingExecutor().QueueRows([INSERTED]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const options: DatabaseTransportPublishOptions = { Kind: 'Database', Executor: caller, UserID: 'U1' };
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], [], options);
        expect(result.Status).toBe('Accepted');
        expect(source.Calls).toHaveLength(0);
        expect(caller.Events).toEqual([]);
        expect(caller.Calls[0].Params[9]).toBe('U1');
    });

    it('turns infrastructure errors into retryable rejections and logs them', async () => {
        const executor = new RecordingExecutor().QueueError(new Error('connection reset'));
        const deps = TestDeps(executor);
        const driver = new DatabaseTransportDriver(executor, deps);
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], []);
        expect(result.Error).toEqual({ Code: 'TransportUnavailable', Message: 'connection reset', Retryable: true });
        expect(deps.Log instanceof RecordingLogger && deps.Log.Lines[0]).toContain('ERROR');
    });
});

describe('DatabaseTransportDriver surface', () => {
    it('declares the Database capabilities and name', () => {
        const executor = new RecordingExecutor();
        const driver = new DatabaseTransportDriver(executor, TestDeps(executor));
        expect(driver.Name).toBe('Database');
        expect(driver.Capabilities).toBe(DATABASE_TRANSPORT_CAPABILITIES);
        expect(DATABASE_TRANSPORT_CAPABILITIES).toMatchObject({ SupportsOrdered: true, SupportsExternalHosts: false, CancelPending: true, CancelInFlight: true, PeekDeadLetters: 'Full' });
        expect(DATABASE_TRANSPORT_CAPABILITIES.Filters.Operators).toEqual(['eq', 'neq', 'startswith', 'isnull', 'isnotnull']);
    });

    it('opens consumers and a cached operator', () => {
        const executor = new RecordingExecutor();
        const driver = new DatabaseTransportDriver(executor, TestDeps(executor));
        expect(driver.OpenConsumer(SubscriptionBindingFixture())).toBeInstanceOf(DatabaseTransportConsumer);
        expect(driver.Operator()).toBeInstanceOf(DatabaseTransportOperator);
        expect(driver.Operator()).toBe(driver.Operator());
    });

    it('uses the injected instance ID, or host:pid:random by default', () => {
        const executor = new RecordingExecutor();
        expect(new DatabaseTransportDriver(executor, TestDeps(executor)).InstanceID).toBe('test-host:1:abcd');
        expect(DefaultInstanceID()).toMatch(/^.+:\d+:[0-9a-f]{8}$/);
    });

    it('flags missing IDs and external hosts during binding validation', async () => {
        const executor = new RecordingExecutor();
        const driver = new DatabaseTransportDriver(executor, TestDeps(executor));
        const external = { ...SubscriptionBindingFixture(), HostType: 'External' as const };
        const issues = await driver.ValidateBindings(TopicBindingFixture({ Config: {} }), [external]);
        expect(issues.map(i => i.Message)).toEqual([
            'Database topic binding is missing Config.TopicID',
            'External hosts cannot consume the Database transport',
        ]);
    });
});
```

`packages/WorkQueue/engine/src/__tests__/DatabaseTransportConsumer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { ReceivedDelivery, SubscriptionPolicy } from '@memberjunction/work-queue-core';
import { DatabaseTransportConsumer } from '../transports/database/DatabaseTransportConsumer';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import { RecordingExecutor, SubscriptionBindingFixture, TestDeps } from './fakes';

const CLAIMED = {
    DeliveryID: 'EEEEEEEE-0000-0000-0000-000000000001', AttemptCount: 1, LeaseToken: 'FFFFFFFF-0000-0000-0000-000000000001',
    LeaseExpiresAt: new Date('2026-01-01T00:01:00Z'), IsReplay: 0, MessageID: 'M1', PartitionKey: 'venue-42', Sequence: null,
    Attributes: '{"a":"b"}', Payload: '{"x":1}', PayloadRef: null, CorrelationID: null, PublishedAt: new Date('2026-01-01T00:00:00Z'),
};

function Consumer(executor: RecordingExecutor, policy: Partial<SubscriptionPolicy> = {}): DatabaseTransportConsumer {
    return new DatabaseTransportConsumer(executor, CreateWorkQueueSqlBuilder(executor), SubscriptionBindingFixture(policy), TestDeps(executor), 'host:1:abcd');
}

function Delivery(): ReceivedDelivery {
    return {
        DeliveryID: CLAIMED.DeliveryID, LeaseToken: CLAIMED.LeaseToken, Attempt: 1, IsReplay: false,
        LeaseExpiresAt: new Date(), Message: { MessageID: 'M1', Topic: 'import.ready', Attributes: {}, PublishedAt: '2026-01-01T00:00:00.000Z' },
    };
}

describe('DatabaseTransportConsumer.Receive', () => {
    it('expires leases, then claims keyless deliveries for None subscriptions', async () => {
        const executor = new RecordingExecutor().QueueRows([{ AffectedRows: 0 }]).QueueRows([CLAIMED]);
        const deliveries = await Consumer(executor).Receive(5, 20, new AbortController().signal);
        expect(executor.Calls[0].SQL).toContain("[LastError] = N'LeaseExpired'");
        expect(executor.Calls[1].SQL).toContain('WITH (UPDLOCK, READPAST, ROWLOCK)');
        expect(executor.Calls[1].Params).toEqual(['BBBBBBBB-0000-0000-0000-000000000001', 'host:1:abcd', 60, 5]);
        expect(deliveries[0]).toMatchObject({ DeliveryID: CLAIMED.DeliveryID, Attempt: 1, IsReplay: false });
        expect(deliveries[0].Message).toMatchObject({ Topic: 'import.ready', PartitionKey: 'venue-42', Payload: { x: 1 } });
    });

    it('claims partition candidates, skips keys lost to another worker, then fills with keyless rows', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ AffectedRows: 0 }])
            .QueueRows([{ DeliveryID: 'D1', PartitionKey: 'k1' }, { DeliveryID: 'D2', PartitionKey: 'k2' }])
            .QueueError(new Error("Cannot insert duplicate key row with unique index 'UQ_WorkQueueDelivery_InFlightPartition'"))
            .QueueRows([CLAIMED])
            .QueueRows([]);
        const deliveries = await Consumer(executor, { PartitionMode: 'Exclusive' }).Receive(2, 0, new AbortController().signal);
        expect(deliveries).toHaveLength(1);
        expect(executor.Calls[1].SQL).toContain('ROW_NUMBER()');
        expect(executor.Calls[4].Params[3]).toBe(1);
    });

    it('runs sequence bookkeeping before selecting explicit-sequence candidates', async () => {
        const executor = new RecordingExecutor().QueueRows([{ AffectedRows: 0 }]).QueueRows([{ AffectedRows: 0 }]).QueueRows([{ AffectedRows: 0 }]).QueueRows([]);
        await Consumer(executor, { PartitionMode: 'Ordered', OrderingMode: 'ExplicitSequence' }).Receive(1, 0, new AbortController().signal);
        expect(executor.Calls[1].SQL).toContain('[AwaitingSequenceSince] = NULL');
        expect(executor.Calls[2].SQL).toContain('[AwaitingSequenceSince] = SYSDATETIMEOFFSET()');
        expect(executor.Calls[3].SQL).toContain('[LastCompletedSequence]');
    });

    it('does nothing when already aborted', async () => {
        const executor = new RecordingExecutor();
        const controller = new AbortController();
        controller.abort();
        expect(await Consumer(executor).Receive(5, 0, controller.signal)).toEqual([]);
        expect(executor.Calls).toHaveLength(0);
    });
});

describe('DatabaseTransportConsumer settles', () => {
    it('extends the lease with serialised progress', async () => {
        const executor = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]);
        expect(await Consumer(executor).ExtendLease(Delivery(), 60, { Percent: 40 })).toBe('Held');
        expect(executor.Calls[0].Params[3]).toBe('{"Percent":40}');
    });

    it('reports a lost lease when the fence rejects the heartbeat', async () => {
        const executor = new RecordingExecutor().QueueRows([{ AffectedRows: 0 }]);
        expect(await Consumer(executor).ExtendLease(Delivery(), 60)).toBe('Lost');
    });

    it('completes an unsequenced delivery without a transaction', async () => {
        const executor = new RecordingExecutor().QueueRows([{ SubscriptionID: 'S', PartitionKey: null, OrderKey: '1' }]);
        expect(await Consumer(executor).Complete(Delivery())).toEqual({ Kind: 'Settled', DeliveryID: CLAIMED.DeliveryID, Status: 'Completed' });
        expect(executor.Events).toEqual([]);
    });

    it('completes an explicit-sequence delivery and advances the mark in one transaction', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ SubscriptionID: 'S', PartitionKey: 'k1', OrderKey: '3' }])
            .QueueRows([{ LastCompletedSequence: 3 }]);
        const result = await Consumer(executor, { PartitionMode: 'Ordered', OrderingMode: 'ExplicitSequence' }).Complete(Delivery());
        expect(result.Kind).toBe('Settled');
        expect(executor.Calls[1].SQL).toContain('@Mark');
        expect(executor.Events).toEqual(['independent', 'begin', 'commit', 'release']);
    });

    it('reports LeaseLost when completion matches no row', async () => {
        const executor = new RecordingExecutor().QueueRows([]);
        expect(await Consumer(executor).Complete(Delivery())).toEqual({ Kind: 'LeaseLost', DeliveryID: CLAIMED.DeliveryID });
    });

    it('maps retry, dead letter and release to their statuses', async () => {
        const executor = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]).QueueRows([{ AffectedRows: 1 }]).QueueRows([{ AffectedRows: 1 }]);
        const consumer = Consumer(executor);
        expect(await consumer.Retry(Delivery(), 30, 'boom')).toMatchObject({ Kind: 'Settled', Status: 'Pending' });
        expect(await consumer.DeadLetter(Delivery(), 'Poison', null)).toMatchObject({ Kind: 'Settled', Status: 'DeadLettered' });
        expect(await consumer.Release(Delivery())).toMatchObject({ Kind: 'Settled', Status: 'Pending' });
    });

    it('reports infrastructure failures as Failed', async () => {
        const executor = new RecordingExecutor().QueueError(new Error('connection reset'));
        expect(await Consumer(executor).Retry(Delivery(), 30, 'boom')).toEqual({ Kind: 'Failed', DeliveryID: CLAIMED.DeliveryID, Error: 'connection reset' });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test deliveryPlan DatabaseTransportDriver DatabaseTransportConsumer`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Write `src/transports/database/databaseCapabilities.ts`**

```typescript
import { WORK_QUEUE_FILTER_SUPPORT } from '@memberjunction/work-queue-core';
import type { TransportCapabilities } from '@memberjunction/work-queue-core';

/** Database transport capabilities (03 §5). */
export const DATABASE_TRANSPORT_CAPABILITIES: TransportCapabilities = {
    DetectsMessageIDDuplicates: true,
    PersistsProgress: true,
    SupportsOrdered: true,
    SupportsExternalHosts: false,
    CancelPending: true,
    CancelInFlight: true,
    ListPartitions: true,
    PeekDeadLetters: 'Full',
    ReplaySingleDeadLetter: true,
    CompletedCounts: true,
    MaxRetryDelaySeconds: 2147483647,
    // The Database transport evaluates filters in TypeScript, so it accepts the whole queue-wide subset (03 §4.1).
    Filters: WORK_QUEUE_FILTER_SUPPORT,
};
```

- [ ] **Step 4: Write `src/publish/publishResults.ts`**

```typescript
import type { PublishResult } from '@memberjunction/work-queue-core';

export function Accepted(messageID: string): PublishResult {
    return { MessageID: messageID, Status: 'Accepted' };
}

export function Duplicate(messageID: string): PublishResult {
    return { MessageID: messageID, Status: 'Duplicate' };
}

export function Rejected(messageID: string, code: string, message: string, retryable: boolean): PublishResult {
    return { MessageID: messageID, Status: 'Rejected', Error: { Code: code, Message: message, Retryable: retryable } };
}
```

- [ ] **Step 5: Write `src/transports/database/deliveryPlan.ts`**

```typescript
import { MatchesFilter } from '@memberjunction/work-queue-core';
import type { PartitionMode, PublishResult, SubscriptionBinding, TopicBinding, WorkMessage } from '@memberjunction/work-queue-core';
import { UUIDsEqual } from '@memberjunction/global';
import { Duplicate, Rejected } from '../../publish/publishResults';
import type { DeliveryInsertRow, MessageInsertOutcomeRow, MessageInsertRow } from '../../sql/rows';
import { ToNumber } from '../../sql/sqlExecution';
import { ReadSubscriptionIDs } from './bindingIds';

export interface PlannedDelivery {
    SubscriptionID: string;
    PartitionMode: PartitionMode;
}

export interface DeliveryPlan {
    Deliveries: PlannedDelivery[];
    NeedsPublishOrderLock: boolean;
    SequenceStateSubscriptionIDs: string[];
}

export function BuildDeliveryPlan(topic: TopicBinding, message: WorkMessage, subscriptions: SubscriptionBinding[]): DeliveryPlan {
    const matched = subscriptions.filter(s => MatchesFilter(s.Filter, message.Attributes));
    const deliveries = matched.map(s => ({ SubscriptionID: ReadSubscriptionIDs(s).SubscriptionID, PartitionMode: s.Policy.PartitionMode }));
    const keyed = message.PartitionKey !== undefined;
    const ordered = deliveries.filter(d => d.PartitionMode === 'Ordered');
    return {
        Deliveries: deliveries,
        NeedsPublishOrderLock: keyed && topic.OrderingMode === 'PublishOrder' && ordered.length > 0,
        SequenceStateSubscriptionIDs: keyed && topic.OrderingMode === 'ExplicitSequence' ? ordered.map(d => d.SubscriptionID) : [],
    };
}

export function ToMessageInsertRow(message: WorkMessage, topicID: string, userID: string | null): MessageInsertRow {
    return {
        ID: message.MessageID,
        TopicID: topicID,
        PartitionKey: message.PartitionKey ?? null,
        Sequence: message.Sequence ?? null,
        AttributesJSON: JSON.stringify(message.Attributes),
        PayloadJSON: message.Payload === undefined ? null : JSON.stringify(message.Payload),
        PayloadRefJSON: message.PayloadRef === undefined ? null : JSON.stringify(message.PayloadRef),
        CorrelationID: message.CorrelationID ?? null,
        PublishedAt: new Date(message.PublishedAt),
        PublishedByUserID: userID,
    };
}

export function ToDeliveryRows(message: WorkMessage, plan: DeliveryPlan, orderKey: number): DeliveryInsertRow[] {
    return plan.Deliveries.map(d => ({
        MessageID: message.MessageID,
        SubscriptionID: d.SubscriptionID,
        PartitionKey: d.PartitionMode === 'None' ? null : message.PartitionKey ?? null,
        OrderKey: orderKey,
    }));
}

export function SameEnvelope(existing: MessageInsertOutcomeRow, row: MessageInsertRow): boolean {
    return UUIDsEqual(existing.TopicID, row.TopicID)
        && (existing.PartitionKey ?? null) === row.PartitionKey
        && ToNumber(existing.Sequence) === row.Sequence
        && (existing.Attributes ?? null) === row.AttributesJSON
        && (existing.Payload ?? null) === row.PayloadJSON
        && (existing.PayloadRef ?? null) === row.PayloadRefJSON
        && (existing.CorrelationID ?? null) === row.CorrelationID;
}

/** Interprets 'Exists' rows from InsertMessage (03 §1.1 error codes). */
export function ResolveExistingOutcome(outcomes: MessageInsertOutcomeRow[], row: MessageInsertRow): PublishResult {
    const sameID = outcomes.find(o => UUIDsEqual(o.ID, row.ID));
    if (sameID) {
        return SameEnvelope(sameID, row)
            ? Duplicate(row.ID)
            : Rejected(row.ID, 'MessageIDConflict', `MessageID ${row.ID} was already published with a different envelope`, false);
    }
    const other = outcomes[0];
    if (other) {
        return Rejected(row.ID, 'DuplicateSequence',
            `Sequence ${row.Sequence ?? ''} for key '${row.PartitionKey ?? ''}' was already published as message ${other.ID}`, false);
    }
    return Rejected(row.ID, 'TransportUnavailable', 'The message insert returned no outcome (concurrent publish); retry', true);
}
```

- [ ] **Step 6: Write `src/transports/database/DatabaseTransportConsumer.ts`**

```typescript
import type {
    ITransportConsumer, ReceivedDelivery, SettleResult, SubscriptionBinding, WorkJson, WorkProgress,
} from '@memberjunction/work-queue-core';
import type { DeliveryStatus } from '@memberjunction/work-queue-core';
import { IN_FLIGHT_PARTITION_INDEX } from '../../constants';
import type { ClaimedDeliveryRow, ClaimPartitionMode, CompletedDeliveryRow, PartitionCandidateRow, SequenceMarkRow } from '../../sql/rows';
import { ErrorText, ExecuteRows, ExecuteWrite, IsUniqueViolation, ToBoolean, ToNumber } from '../../sql/sqlExecution';
import type { WorkQueueSqlBuilder } from '../../sql/WorkQueueSqlBuilder';
import type { SqlStatement, WorkQueueExecutorSource, WorkQueueSqlExecutor } from '../../sql/WorkQueueSqlExecutor';
import { RunInWorkQueueTransaction } from '../../transaction/RunInWorkQueueTransaction';
import type { TransportDriverDeps } from '../TransportDriverDeps';
import { ReadSubscriptionIDs } from './bindingIds';
import type { DatabaseSubscriptionIDs } from './bindingIds';
import { MessageFromColumns, SerializeProgress } from './rowMapping';

export class DatabaseTransportConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> {
    private readonly ids: DatabaseSubscriptionIDs;

    constructor(
        private readonly executor: WorkQueueExecutorSource,
        private readonly sql: WorkQueueSqlBuilder,
        private readonly binding: SubscriptionBinding,
        private readonly deps: TransportDriverDeps,
        private readonly leaseOwner: string,
    ) {
        this.ids = ReadSubscriptionIDs(binding);
    }

    /** One claim cycle. The Database consumer never long-polls, so waitSeconds is ignored. */
    public async Receive(max: number, waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]> {
        if (signal.aborted || max <= 0) {
            return [];
        }
        const policy = this.binding.Policy;
        const expired = await ExecuteRows<ExpiredDeadLetterRow>(
            this.executor, this.sql.Consume.ExpireLeases(this.ids.SubscriptionID, policy.MaxAttempts), this.deps.ContextUser);
        for (const row of expired) {
            this.deps.NotifyDeadLettered?.({
                SubscriptionName: policy.SubscriptionName, DeliveryID: row.DeliveryID,
                Reason: 'LeaseExpired', PartitionKey: row.PartitionKey,
            });
        }
        const claimed: ClaimedDeliveryRow[] = policy.PartitionMode === 'None' ? [] : await this.ClaimPartitioned(max, signal);
        if (claimed.length < max && !signal.aborted) {
            const keyless = await ExecuteRows<ClaimedDeliveryRow>(this.executor,
                this.sql.Consume.ClaimUnpartitioned(this.ids.SubscriptionID, this.leaseOwner, policy.LeaseSeconds, max - claimed.length),
                this.deps.ContextUser);
            claimed.push(...keyless);
        }
        return claimed.map(row => this.ToDelivery(row));
    }

    public async ExtendLease(delivery: ReceivedDelivery<TPayload>, leaseSeconds: number, progress?: WorkProgress): Promise<'Held' | 'Lost'> {
        const progressJSON = progress === undefined ? null : SerializeProgress(progress);
        const count = await ExecuteWrite(this.executor,
            this.sql.Consume.ExtendLease(delivery.DeliveryID, delivery.LeaseToken, leaseSeconds, progressJSON), this.deps.ContextUser);
        return count === 1 ? 'Held' : 'Lost';
    }

    public async Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        try {
            if (!this.IsSequenced()) {
                return await this.CompleteWith(this.executor, delivery);
            }
            return await RunInWorkQueueTransaction(this.executor, async tx => {
                const result = await this.CompleteWith(tx, delivery);
                return { Commit: result.Kind === 'Settled', Value: result };
            });
        } catch (error) {
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: ErrorText(error) };
        }
    }

    public Retry(delivery: ReceivedDelivery<TPayload>, delaySeconds: number, error: string): Promise<SettleResult> {
        return this.SettleWrite(delivery, 'Pending',
            this.sql.Consume.RetryDelivery(delivery.DeliveryID, delivery.LeaseToken, Math.max(0, Math.round(delaySeconds)), error));
    }

    public async DeadLetter(delivery: ReceivedDelivery<TPayload>, reason: string, error: string | null): Promise<SettleResult> {
        const result = await this.SettleWrite(delivery, 'DeadLettered',
            this.sql.Consume.DeadLetterDelivery(delivery.DeliveryID, delivery.LeaseToken, reason, error));
        if (result.Kind === 'Settled') {
            this.deps.NotifyDeadLettered?.({
                SubscriptionName: this.binding.Policy.SubscriptionName, DeliveryID: delivery.DeliveryID,
                Reason: reason, PartitionKey: delivery.Message.PartitionKey ?? null,
            });
        }
        return result;
    }

    public Release(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.SettleWrite(delivery, 'Pending', this.sql.Consume.ReleaseDelivery(delivery.DeliveryID, delivery.LeaseToken));
    }

    public async Close(): Promise<void> {
        // Nothing held between calls.
    }

    private IsSequenced(): boolean {
        return this.binding.Policy.PartitionMode === 'Ordered' && this.binding.Policy.OrderingMode === 'ExplicitSequence';
    }

    private async ClaimPartitioned(max: number, signal: AbortSignal): Promise<ClaimedDeliveryRow[]> {
        const mode: ClaimPartitionMode = this.binding.Policy.PartitionMode === 'Ordered' ? 'Ordered' : 'Exclusive';
        const sequenced = this.IsSequenced();
        const user = this.deps.ContextUser;
        if (sequenced) {
            await ExecuteWrite(this.executor, this.sql.Consume.ClearAwaitingSequence(this.ids.SubscriptionID), user);
            await ExecuteWrite(this.executor, this.sql.Consume.MarkAwaitingSequence(this.ids.SubscriptionID), user);
        }
        const candidates = await ExecuteRows<PartitionCandidateRow>(this.executor,
            this.sql.Consume.SelectPartitionCandidates(this.ids.SubscriptionID, mode, sequenced, max * 2), user);
        const claimed: ClaimedDeliveryRow[] = [];
        for (const candidate of candidates) {
            if (claimed.length >= max || signal.aborted) {
                break;
            }
            const row = await this.TryClaimCandidate(candidate, mode, sequenced);
            if (row) {
                claimed.push(row);
            }
        }
        return claimed;
    }

    private async TryClaimCandidate(candidate: PartitionCandidateRow, mode: ClaimPartitionMode, sequenced: boolean): Promise<ClaimedDeliveryRow | null> {
        try {
            const rows = await ExecuteRows<ClaimedDeliveryRow>(this.executor,
                this.sql.Consume.ClaimPartitionCandidate(this.ids.SubscriptionID, candidate.DeliveryID, mode, sequenced,
                    this.leaseOwner, this.binding.Policy.LeaseSeconds),
                this.deps.ContextUser);
            return rows[0] ?? null;
        } catch (error) {
            if (IsUniqueViolation(error, IN_FLIGHT_PARTITION_INDEX)) {
                return null;
            }
            throw error;
        }
    }

    private async CompleteWith(executor: WorkQueueSqlExecutor, delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        const rows = await ExecuteRows<CompletedDeliveryRow>(executor,
            this.sql.Consume.CompleteDelivery(delivery.DeliveryID, delivery.LeaseToken), this.deps.ContextUser);
        const done = rows[0];
        if (!done) {
            return { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
        }
        if (this.IsSequenced() && done.PartitionKey !== null) {
            await ExecuteRows<SequenceMarkRow>(executor,
                this.sql.Consume.AdvanceSequenceMark(this.ids.SubscriptionID, done.PartitionKey), this.deps.ContextUser);
        }
        return { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: 'Completed' };
    }

    private async SettleWrite(delivery: ReceivedDelivery<TPayload>, status: DeliveryStatus, statement: SqlStatement): Promise<SettleResult> {
        try {
            const count = await ExecuteWrite(this.executor, statement, this.deps.ContextUser);
            return count === 1
                ? { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: status }
                : { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
        } catch (error) {
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: ErrorText(error) };
        }
    }

    private ToDelivery(row: ClaimedDeliveryRow): ReceivedDelivery<TPayload> {
        return {
            Message: MessageFromColumns<TPayload>(row, this.binding.Policy.TopicName),
            DeliveryID: row.DeliveryID,
            LeaseToken: row.LeaseToken,
            Attempt: ToNumber(row.AttemptCount) ?? 1,
            IsReplay: ToBoolean(row.IsReplay),
            LeaseExpiresAt: row.LeaseExpiresAt instanceof Date ? row.LeaseExpiresAt : new Date(row.LeaseExpiresAt),
        };
    }
}
```

- [ ] **Step 7: Write `src/transports/database/DatabaseTransportDriver.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type {
    BindingValidationIssue, DatabasePublishOptions, ITransportConsumer, ITransportDriver, ITransportOperator,
    PublishResult, SubscriptionBinding, TopicBinding, TransportCapabilities, WorkJson, WorkMessage,
} from '@memberjunction/work-queue-core';
import { DATABASE_DRIVER_CLASS, DELIVERY_INSERT_CHUNK } from '../../constants';
import { Accepted, Rejected } from '../../publish/publishResults';
import { CreateWorkQueueSqlBuilder } from '../../sql/CreateWorkQueueSqlBuilder';
import type { MessageInsertOutcomeRow } from '../../sql/rows';
import { ErrorText, ExecuteRows, ExecuteWrite, ToNumber } from '../../sql/sqlExecution';
import type { WorkQueueSqlBuilder } from '../../sql/WorkQueueSqlBuilder';
import type { WorkQueueExecutorSource, WorkQueueTransactionalExecutor } from '../../sql/WorkQueueSqlExecutor';
import { RetryTransient, RunInWorkQueueTransaction } from '../../transaction/RunInWorkQueueTransaction';
import type { TransportDriverDeps } from '../TransportDriverDeps';
import { ReadTopicID } from './bindingIds';
import { DATABASE_TRANSPORT_CAPABILITIES } from './databaseCapabilities';
import { DatabaseTransportConsumer } from './DatabaseTransportConsumer';
import { DatabaseTransportOperator } from './DatabaseTransportOperator';
import type { DeliveryPlan } from './deliveryPlan';
import { BuildDeliveryPlan, ResolveExistingOutcome, ToDeliveryRows, ToMessageInsertRow } from './deliveryPlan';

/** Database-specific publish options: enlist in the caller's transaction and stamp the publisher. */
export interface DatabaseTransportPublishOptions extends DatabasePublishOptions {
    readonly Kind: 'Database';
    readonly Executor?: WorkQueueTransactionalExecutor;
    readonly UserID?: string | null;
}

export function IsDatabaseTransportPublishOptions(options: DatabasePublishOptions | undefined): options is DatabaseTransportPublishOptions {
    return options !== undefined && options.Kind === 'Database';
}

export function DefaultInstanceID(): string {
    return `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
}

export class DatabaseTransportDriver implements ITransportDriver {
    public readonly Name = DATABASE_DRIVER_CLASS;
    public readonly Capabilities: TransportCapabilities = DATABASE_TRANSPORT_CAPABILITIES;
    private readonly sql: WorkQueueSqlBuilder;
    private readonly instanceID: string;
    private operator: DatabaseTransportOperator | null = null;

    constructor(private readonly executor: WorkQueueExecutorSource, private readonly deps: TransportDriverDeps) {
        this.sql = CreateWorkQueueSqlBuilder(executor);
        this.instanceID = deps.InstanceID ?? DefaultInstanceID();
    }

    public get InstanceID(): string {
        return this.instanceID;
    }

    public async Publish(topic: TopicBinding, messages: WorkMessage[], subscriptions: SubscriptionBinding[],
                         opts?: DatabasePublishOptions): Promise<PublishResult[]> {
        const topicID = ReadTopicID(topic);
        const options = IsDatabaseTransportPublishOptions(opts) ? opts : null;
        const results: PublishResult[] = [];
        for (const message of messages) {
            results.push(await this.PublishOne(topic, topicID, message, subscriptions, options));
        }
        return results;
    }

    public OpenConsumer<TPayload extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<TPayload> {
        return new DatabaseTransportConsumer<TPayload>(this.executor, this.sql, subscription, this.deps, this.instanceID);
    }

    public Operator(): ITransportOperator {
        this.operator ??= new DatabaseTransportOperator(this.executor, this.deps);
        return this.operator;
    }

    public async ValidateBindings(topic: TopicBinding, subscriptions: SubscriptionBinding[]): Promise<BindingValidationIssue[]> {
        const issues: BindingValidationIssue[] = [];
        if (!HasText(topic.Config['TopicID'])) {
            issues.push({ Severity: 'Error', Subject: topic.TopicName, Message: 'Database topic binding is missing Config.TopicID' });
        }
        for (const subscription of subscriptions) {
            const name = subscription.Policy.SubscriptionName;
            if (!HasText(subscription.Config['SubscriptionID'])) {
                issues.push({ Severity: 'Error', Subject: name, Message: 'Database subscription binding is missing Config.SubscriptionID' });
            }
            if (subscription.HostType === 'External') {
                issues.push({ Severity: 'Error', Subject: name, Message: 'External hosts cannot consume the Database transport' });
            }
        }
        return issues;
    }

    private async PublishOne(topic: TopicBinding, topicID: string, message: WorkMessage, subscriptions: SubscriptionBinding[],
                             options: DatabaseTransportPublishOptions | null): Promise<PublishResult> {
        const plan = BuildDeliveryPlan(topic, message, subscriptions);
        const userID = options?.UserID ?? null;
        try {
            if (options?.Executor) {
                return await this.WriteMessage(options.Executor, topic, topicID, message, plan, userID);
            }
            return await RetryTransient(() => RunInWorkQueueTransaction(this.executor, async tx => {
                const result = await this.WriteMessage(tx, topic, topicID, message, plan, userID);
                return { Commit: result.Status === 'Accepted', Value: result };
            }));
        } catch (error) {
            this.deps.Log.Error(`Publish of message ${message.MessageID} to '${topic.TopicName}' failed`, error instanceof Error ? error : undefined);
            return Rejected(message.MessageID, 'TransportUnavailable', ErrorText(error), true);
        }
    }

    private async WriteMessage(executor: WorkQueueTransactionalExecutor, topic: TopicBinding, topicID: string, message: WorkMessage,
                               plan: DeliveryPlan, userID: string | null): Promise<PublishResult> {
        const user = this.deps.ContextUser;
        const key = message.PartitionKey;
        if (plan.NeedsPublishOrderLock && key !== undefined) {
            await ExecuteRows<{ LockResult: number }>(executor, this.sql.Publish.AcquirePublishOrderLock(topicID, key), user);
        }
        const row = ToMessageInsertRow(message, topicID, userID);
        const outcomes = await ExecuteRows<MessageInsertOutcomeRow>(executor, this.sql.Publish.InsertMessage(row), user);
        const inserted = outcomes.find(o => o.Outcome === 'Inserted');
        if (!inserted) {
            return ResolveExistingOutcome(outcomes, row);
        }
        const orderKey = topic.OrderingMode === 'ExplicitSequence' && message.Sequence !== undefined
            ? message.Sequence
            : ToNumber(inserted.PublishOrdinal);
        if (orderKey === null) {
            throw new Error(`Message ${message.MessageID} was inserted without a PublishOrdinal`);
        }
        if (key !== undefined) {
            for (const subscriptionID of plan.SequenceStateSubscriptionIDs) {
                await ExecuteWrite(executor, this.sql.Publish.EnsureSequenceState(subscriptionID, key), user);
            }
        }
        const rows = ToDeliveryRows(message, plan, orderKey);
        for (let start = 0; start < rows.length; start += DELIVERY_INSERT_CHUNK) {
            await ExecuteWrite(executor, this.sql.Publish.InsertDeliveries(rows.slice(start, start + DELIVERY_INSERT_CHUNK)), user);
        }
        for (const subscriptionID of plan.SequenceStateSubscriptionIDs) {
            await ExecuteWrite(executor, this.sql.Consume.ClearAwaitingSequence(subscriptionID), user);
        }
        return Accepted(message.MessageID);
    }
}

function HasText(value: WorkJson | undefined): boolean {
    return typeof value === 'string' && value.trim() !== '';
}
```

- [ ] **Step 8: Export the new modules**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './publish/publishResults';
export * from './transports/database/databaseCapabilities';
export * from './transports/database/deliveryPlan';
export * from './transports/database/DatabaseTransportConsumer';
export * from './transports/database/DatabaseTransportDriver';
```

- [ ] **Step 9: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — previous suites plus deliveryPlan (9), DatabaseTransportDriver (11), DatabaseTransportConsumer (11).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 10: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): Database transport driver and consumer"
```

---

### Task 10: Topology rows and field validation (base); driver factories, `MJWorkLogger` and entity servers (engine)

**Files:**
- Create (**base**): `packages/WorkQueue/base/src/topology/rows.ts`, `src/entities/validation.ts`, `src/testing/rowFixtures.ts`
- Modify (**base**): `packages/WorkQueue/base/src/index.ts`
- Test (**base**): `packages/WorkQueue/base/src/__tests__/entityValidation.test.ts`
- Create (**engine**): `packages/WorkQueue/engine/src/transports/BaseTransportDriverFactory.ts`, `src/transports/database/DatabaseTransportDriverFactory.ts`
- Create (**engine**): `packages/WorkQueue/engine/src/logging/MJWorkLogger.ts`
- Create (**engine**): `packages/WorkQueue/engine/src/entities/WorkQueueTopicEntityServer.ts`, `src/entities/WorkQueueSubscriptionEntityServer.ts`, `src/entities/WorkQueueTransportEntityServer.ts`, `src/entities/DriverOwnedEntityServers.ts`
- Modify (**engine**): `packages/WorkQueue/engine/src/index.ts`
- Test (**engine**): `packages/WorkQueue/engine/src/__tests__/DatabaseTransportDriverFactory.test.ts`
- Extend (**engine**): `packages/WorkQueue/engine/src/__tests__/fakes.ts` (re-exports the base row fixtures as `TRANSPORT_ROW`, `TOPIC_ROW`, `SUBSCRIPTION_ROW`)

**Interfaces:**
- Consumes: `DatabaseTransportDriver` (Task 9); `TransportDriverDeps` (Task 8); `WorkQueueEntityNames`, `DATABASE_DRIVER_CLASS`, `IsWorkJson` (Task 2, base); from core: `ITransportDriver`, `WorkLogger`, `WorkJson`, `OrderingMode`, `PartitionMode`, `HeartbeatMode`, `HostType`, `ParseSubscriptionFilter`, `WORK_QUEUE_FILTER_SUPPORT`, `WorkQueueConfigurationError`; generated `MJWorkQueueTopicEntity`, `MJWorkQueueSubscriptionEntity`, `MJWorkQueueTransportEntity` (Task 1).
- Produces (base — `@memberjunction/work-queue-base`):
  - `interface TransportRow`, `interface TopicRow`, `interface SubscriptionRow` — structural views the generated entities satisfy
  - `interface FieldIssue { Field: string; Message: string; Value: string | number | null }`, `ParseJsonObject(json: string | null, subject: string): Record<string, WorkJson>`, `ValidateTransportFields(row: TransportRow): FieldIssue[]`, `ValidateTopicFields(row: TopicRow): FieldIssue[]`, `ValidateSubscriptionFields(row: SubscriptionRow): FieldIssue[]`
  - Row fixtures `TRANSPORT_ROW_FIXTURE`, `TOPIC_ROW_FIXTURE`, `SUBSCRIPTION_ROW_FIXTURE` (`src/testing/rowFixtures.ts`), re-exported by the engine's test fakes
- Produces (engine):
  - `abstract class BaseTransportDriverFactory { abstract Create(transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver> }`
  - `@RegisterClass(BaseTransportDriverFactory, 'Database') class DatabaseTransportDriverFactory`
  - `class MJWorkLogger implements WorkLogger { constructor(prefix?: string) }`
  - Server entity subclasses `MJWorkQueueTransportEntityServer`, `MJWorkQueueTopicEntityServer`, `MJWorkQueueSubscriptionEntityServer` registered under the Task 1 entity names
  - Driver-owned state guards `MJWorkQueueDeliveryEntityServer`, `MJWorkQueueMessageEntityServer`, `MJWorkQueuePartitionStateEntityServer`, `MJWorkQueueDeduplicationEntityServer` plus `DRIVER_OWNED_STATE_MESSAGE` (03 §6.8)

Validation performed on save (everything that needs a transport driver — FIFO rules, host/transport compatibility — is `WorkQueueEngine.ValidateTopology` in Task 12):

| Entity | Rule |
| --- | --- |
| Transport | `Configuration`, when present, is a JSON object |
| Topic | `Name` matches `^[a-z0-9]+([._-][a-z0-9]+)*$`; `BindingConfig`, when present, is a JSON object |
| Subscription | `MJWorker` requires a non-blank `HandlerKey`; `Filter` parses against the queue-wide subset `WORK_QUEUE_FILTER_SUPPORT` (03 §4 — the *transport-specific* check is `ValidateTopologyRows`, Task 11); `BackoffMaxSeconds >= BackoffBaseSeconds`; `MaxProcessingSeconds` and `SequenceGapAlertSeconds` are positive when set; `SequenceGapAlertSeconds` only with `PartitionMode = 'Ordered'`; `BindingConfig`, when present, is a JSON object |

- [ ] **Step 1: Write the shared row fixtures in the base package**

`packages/WorkQueue/base/src/testing/rowFixtures.ts` (shipped, not test-only: both packages' suites and plan 06 use
them; export it from `packages/WorkQueue/base/src/index.ts`):

```typescript
import type { SubscriptionRow, TopicRow, TransportRow } from '../topology/rows';

export const TRANSPORT_ROW_FIXTURE: TransportRow = {
    ID: 'D1ED3F08-7008-4DA8-BA2B-7CD6A820AEB5', Name: 'Database', DriverClass: 'Database', Configuration: null, CredentialID: null, Status: 'Active',
};

export const TOPIC_ROW_FIXTURE: TopicRow = {
    ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'import.ready', TransportID: TRANSPORT_ROW_FIXTURE.ID, OrderingMode: 'PublishOrder',
    IsFifo: false, AllowExternalPublish: false, MaxPayloadBytes: 262144, DefaultDeduplicationTTLSeconds: 86400, RetentionDays: 7,
    BindingConfig: null, Status: 'Active',
};

export const SUBSCRIPTION_ROW_FIXTURE: SubscriptionRow = {
    ID: 'BBBBBBBB-0000-0000-0000-000000000001', TopicID: TOPIC_ROW_FIXTURE.ID, Name: 'venue-import', Filter: null, PartitionMode: 'Ordered',
    MaxAttempts: 5, BackoffBaseSeconds: 10, BackoffMaxSeconds: 900, LeaseSeconds: 60, HeartbeatMode: 'Auto', MaxProcessingSeconds: null,
    SequenceGapAlertSeconds: null, HostType: 'MJWorker', HandlerKey: 'VenueImport', ExternalRef: null, BindingConfig: null, Status: 'Active',
};
```

Then append to `packages/WorkQueue/engine/src/__tests__/fakes.ts`, so every engine suite keeps its short names:

```typescript
export {
    TRANSPORT_ROW_FIXTURE as TRANSPORT_ROW,
    TOPIC_ROW_FIXTURE as TOPIC_ROW,
    SUBSCRIPTION_ROW_FIXTURE as SUBSCRIPTION_ROW,
} from '@memberjunction/work-queue-base';
```

- [ ] **Step 1b: Write the failing tests**

`packages/WorkQueue/base/src/__tests__/entityValidation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { ParseJsonObject, ValidateSubscriptionFields, ValidateTopicFields, ValidateTransportFields } from '../entities/validation';
import {
    SUBSCRIPTION_ROW_FIXTURE as SUBSCRIPTION_ROW,
    TOPIC_ROW_FIXTURE as TOPIC_ROW,
    TRANSPORT_ROW_FIXTURE as TRANSPORT_ROW,
} from '../testing/rowFixtures';

describe('ParseJsonObject', () => {
    it('returns an empty object for null or blank text', () => {
        expect(ParseJsonObject(null, 'x')).toEqual({});
        expect(ParseJsonObject('  ', 'x')).toEqual({});
    });

    it('parses objects and rejects arrays, scalars and invalid JSON', () => {
        expect(ParseJsonObject('{"Region":"us-east-1"}', 'x')).toEqual({ Region: 'us-east-1' });
        expect(() => ParseJsonObject('[1]', 'Topic t BindingConfig')).toThrow('Topic t BindingConfig must be a JSON object');
        expect(() => ParseJsonObject('{', 'x')).toThrow(WorkQueueConfigurationError);
    });
});

describe('ValidateTransportFields', () => {
    it('accepts a valid transport and rejects non-object configuration', () => {
        expect(ValidateTransportFields(TRANSPORT_ROW)).toEqual([]);
        expect(ValidateTransportFields({ ...TRANSPORT_ROW, Configuration: '"x"' })[0].Field).toBe('Configuration');
    });
});

describe('ValidateTopicFields', () => {
    it('accepts dotted lowercase names', () => {
        expect(ValidateTopicFields(TOPIC_ROW)).toEqual([]);
        expect(ValidateTopicFields({ ...TOPIC_ROW, Name: 'email.events-v2' })).toEqual([]);
    });

    it('rejects names with spaces, capitals or dangling separators', () => {
        for (const name of ['Email Events', 'Email.events', 'email.', '.email']) {
            expect(ValidateTopicFields({ ...TOPIC_ROW, Name: name })[0].Field).toBe('Name');
        }
    });

    it('rejects a non-object binding', () => {
        expect(ValidateTopicFields({ ...TOPIC_ROW, BindingConfig: '[]' })[0].Field).toBe('BindingConfig');
    });
});

describe('ValidateSubscriptionFields', () => {
    it('accepts a valid subscription', () => {
        expect(ValidateSubscriptionFields(SUBSCRIPTION_ROW)).toEqual([]);
    });

    it('requires a handler key for MJ workers but not external hosts', () => {
        expect(ValidateSubscriptionFields({ ...SUBSCRIPTION_ROW, HandlerKey: '  ' })[0].Field).toBe('HandlerKey');
        expect(ValidateSubscriptionFields({ ...SUBSCRIPTION_ROW, HostType: 'External', HandlerKey: null })).toEqual([]);
    });

    it('accepts a CompositeFilterDescriptor filter in the supported subset', () => {
        const filter = '{"logic":"and","filters":[{"field":"eventType","operator":"eq","value":"click"}]}';
        expect(ValidateSubscriptionFields({ ...SUBSCRIPTION_ROW, Filter: filter })).toEqual([]);
    });

    it('reports a filter that is not a CompositeFilterDescriptor or uses an unsupported operator', () => {
        expect(ValidateSubscriptionFields({ ...SUBSCRIPTION_ROW, Filter: '{"eventType":"click"}' })[0].Field).toBe('Filter');
        const contains = '{"logic":"and","filters":[{"field":"url","operator":"contains","value":"x"}]}';
        const issue = ValidateSubscriptionFields({ ...SUBSCRIPTION_ROW, Filter: contains })[0];
        expect(issue.Field).toBe('Filter');
        expect(issue.Message).toContain('contains');
    });

    it('checks backoff ordering and positive optional durations', () => {
        const fields = ValidateSubscriptionFields({
            ...SUBSCRIPTION_ROW, BackoffBaseSeconds: 60, BackoffMaxSeconds: 10, MaxProcessingSeconds: 0, SequenceGapAlertSeconds: -1,
        }).map(i => i.Field);
        expect(fields).toEqual(['BackoffMaxSeconds', 'MaxProcessingSeconds', 'SequenceGapAlertSeconds']);
    });

    it('allows SequenceGapAlertSeconds only on Ordered subscriptions', () => {
        const issues = ValidateSubscriptionFields({ ...SUBSCRIPTION_ROW, PartitionMode: 'Exclusive', SequenceGapAlertSeconds: 300 });
        expect(issues).toEqual([{ Field: 'SequenceGapAlertSeconds', Message: 'SequenceGapAlertSeconds applies only to Ordered subscriptions', Value: 300 }]);
    });
});
```

`packages/WorkQueue/engine/src/__tests__/DatabaseTransportDriverFactory.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseTransportDriverFactory } from '../transports/BaseTransportDriverFactory';
import { DatabaseTransportDriverFactory } from '../transports/database/DatabaseTransportDriverFactory';
import { DatabaseTransportDriver } from '../transports/database/DatabaseTransportDriver';
import { MJWorkLogger } from '../logging/MJWorkLogger';
import { RecordingExecutor, TestDeps, TRANSPORT_ROW } from './fakes';

describe('DatabaseTransportDriverFactory', () => {
    it('is registered under the Database driver class', () => {
        const resolution = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTransportDriverFactory>(BaseTransportDriverFactory, 'Database');
        expect(resolution.Resolved).toBe(true);
        expect(resolution.Instance).toBeInstanceOf(DatabaseTransportDriverFactory);
    });

    it('builds a Database driver from the deps executor', async () => {
        const executor = new RecordingExecutor();
        const driver = await new DatabaseTransportDriverFactory().Create(TRANSPORT_ROW, TestDeps(executor));
        expect(driver).toBeInstanceOf(DatabaseTransportDriver);
        expect(driver.Name).toBe('Database');
    });
});

describe('MJWorkLogger', () => {
    it('implements every WorkLogger method without throwing', () => {
        const logger = new MJWorkLogger('[Test]');
        expect(() => {
            logger.Info('info', { a: 1 });
            logger.Warn('warn');
            logger.Error('error', new Error('boom'));
        }).not.toThrow();
    });
});
```


- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/base && pnpm test entityValidation` and `cd packages/WorkQueue/engine && pnpm test DatabaseTransportDriverFactory`
Expected: FAIL — unresolved imports `../entities/validation` and `../topology/rows` (base), `../transports/BaseTransportDriverFactory` (engine).

- [ ] **Step 3: Write `packages/WorkQueue/base/src/topology/rows.ts`**

```typescript
import type { HeartbeatMode, HostType, OrderingMode, PartitionMode } from '@memberjunction/work-queue-core';

/** Structural views of the topology entities. The generated entity classes satisfy them directly. */
export interface TransportRow {
    ID: string;
    Name: string;
    DriverClass: string;
    Configuration: string | null;
    CredentialID: string | null;
    Status: 'Active' | 'Disabled';
}

export interface TopicRow {
    ID: string;
    Name: string;
    TransportID: string;
    OrderingMode: OrderingMode;
    IsFifo: boolean;
    AllowExternalPublish: boolean;
    MaxPayloadBytes: number;
    DefaultDeduplicationTTLSeconds: number;
    RetentionDays: number;
    BindingConfig: string | null;
    Status: 'Active' | 'Disabled';
}

export interface SubscriptionRow {
    ID: string;
    TopicID: string;
    Name: string;
    Filter: string | null;
    PartitionMode: PartitionMode;
    MaxAttempts: number;
    BackoffBaseSeconds: number;
    BackoffMaxSeconds: number;
    LeaseSeconds: number;
    HeartbeatMode: HeartbeatMode;
    MaxProcessingSeconds: number | null;
    SequenceGapAlertSeconds: number | null;
    HostType: HostType;
    HandlerKey: string | null;
    ExternalRef: string | null;
    BindingConfig: string | null;
    Status: 'Active' | 'Paused' | 'Disabled';
}
```

- [ ] **Step 4: Write `src/transports/BaseTransportDriverFactory.ts`**

```typescript
import type { ITransportDriver } from '@memberjunction/work-queue-core';
import type { TransportRow } from '@memberjunction/work-queue-base';
import type { TransportDriverDeps } from './TransportDriverDeps';

/**
 * ClassFactory base for transport drivers. Register implementations with
 * @RegisterClass(BaseTransportDriverFactory, '<Transport.DriverClass>') — 'Database' here, 'AWS' in plan 07.
 */
export abstract class BaseTransportDriverFactory {
    public abstract Create(transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver>;
}
```

- [ ] **Step 5: Write `src/transports/database/DatabaseTransportDriverFactory.ts`**

```typescript
import { RegisterClass } from '@memberjunction/global';
import type { ITransportDriver } from '@memberjunction/work-queue-core';
import type { TransportRow } from '@memberjunction/work-queue-base';
import { DATABASE_DRIVER_CLASS } from '../../constants';
import { BaseTransportDriverFactory } from '../BaseTransportDriverFactory';
import type { TransportDriverDeps } from '../TransportDriverDeps';
import { DatabaseTransportDriver } from './DatabaseTransportDriver';

@RegisterClass(BaseTransportDriverFactory, DATABASE_DRIVER_CLASS)
export class DatabaseTransportDriverFactory extends BaseTransportDriverFactory {
    public async Create(transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver> {
        return new DatabaseTransportDriver(deps.Executor, deps);
    }
}
```

- [ ] **Step 6: Write `src/logging/MJWorkLogger.ts`**

```typescript
import { LogError, LogStatus } from '@memberjunction/core';
import type { WorkJson, WorkLogger } from '@memberjunction/work-queue-core';

/** WorkLogger backed by MJ's LogStatus / LogError. */
export class MJWorkLogger implements WorkLogger {
    constructor(private readonly prefix = '[WorkQueue]') {}

    public Info(message: string, data?: Record<string, WorkJson>): void {
        LogStatus(this.Format(message, data));
    }

    public Warn(message: string, data?: Record<string, WorkJson>): void {
        LogStatus(this.Format(`WARNING: ${message}`, data));
    }

    public Error(message: string, error?: Error, data?: Record<string, WorkJson>): void {
        LogError(this.Format(error ? `${message}: ${error.message}` : message, data));
    }

    private Format(message: string, data?: Record<string, WorkJson>): string {
        return data ? `${this.prefix} ${message} ${JSON.stringify(data)}` : `${this.prefix} ${message}`;
    }
}
```

- [ ] **Step 7: Write `packages/WorkQueue/base/src/entities/validation.ts`**

```typescript
import { ParseSubscriptionFilter, WORK_QUEUE_FILTER_SUPPORT, WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { WorkJson } from '@memberjunction/work-queue-core';
import { IsWorkJson } from '../json';
import type { SubscriptionRow, TopicRow, TransportRow } from '../topology/rows';

export interface FieldIssue {
    Field: string;
    Message: string;
    Value: string | number | null;
}

const TOPIC_NAME_PATTERN = /^[a-z0-9]+([._-][a-z0-9]+)*$/;

/** Parses a JSON-object column. Null or blank text is an empty object. */
export function ParseJsonObject(json: string | null, subject: string): Record<string, WorkJson> {
    if (json === null || json.trim() === '') {
        return {};
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch (error) {
        throw new WorkQueueConfigurationError(`${subject} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || !IsWorkJson(parsed)) {
        throw new WorkQueueConfigurationError(`${subject} must be a JSON object`);
    }
    const result: Record<string, WorkJson> = {};
    for (const [key, value] of Object.entries(parsed)) {
        if (IsWorkJson(value)) {
            result[key] = value;
        }
    }
    return result;
}

export function ValidateTransportFields(row: TransportRow): FieldIssue[] {
    return JsonObjectIssue('Configuration', row.Configuration, `Transport ${row.Name} Configuration`);
}

export function ValidateTopicFields(row: TopicRow): FieldIssue[] {
    const issues: FieldIssue[] = [];
    if (!TOPIC_NAME_PATTERN.test(row.Name ?? '')) {
        issues.push({ Field: 'Name', Message: 'Topic names are dotted lowercase words, for example email.events', Value: row.Name });
    }
    issues.push(...JsonObjectIssue('BindingConfig', row.BindingConfig, `Topic ${row.Name} BindingConfig`));
    return issues;
}

export function ValidateSubscriptionFields(row: SubscriptionRow): FieldIssue[] {
    const issues: FieldIssue[] = [];
    if (row.HostType === 'MJWorker' && (row.HandlerKey ?? '').trim() === '') {
        issues.push({ Field: 'HandlerKey', Message: 'MJWorker subscriptions require a HandlerKey', Value: row.HandlerKey });
    }
    try {
        // Structural check only: the whole queue-wide subset (03 §4.1). ValidateTopologyRows re-parses with the
        // target transport's FilterSupport, so a filter the broker cannot express is caught there, not here.
        ParseSubscriptionFilter(row.Filter, WORK_QUEUE_FILTER_SUPPORT);
    } catch (error) {
        issues.push({ Field: 'Filter', Message: error instanceof Error ? error.message : String(error), Value: row.Filter });
    }
    if (row.BackoffMaxSeconds < row.BackoffBaseSeconds) {
        issues.push({ Field: 'BackoffMaxSeconds', Message: 'BackoffMaxSeconds must be at least BackoffBaseSeconds', Value: row.BackoffMaxSeconds });
    }
    if (row.MaxProcessingSeconds !== null && row.MaxProcessingSeconds <= 0) {
        issues.push({ Field: 'MaxProcessingSeconds', Message: 'MaxProcessingSeconds must be positive when set', Value: row.MaxProcessingSeconds });
    }
    issues.push(...GapAlertIssues(row));
    issues.push(...JsonObjectIssue('BindingConfig', row.BindingConfig, `Subscription ${row.Name} BindingConfig`));
    return issues;
}

function GapAlertIssues(row: SubscriptionRow): FieldIssue[] {
    if (row.SequenceGapAlertSeconds === null) {
        return [];
    }
    if (row.SequenceGapAlertSeconds <= 0) {
        return [{ Field: 'SequenceGapAlertSeconds', Message: 'SequenceGapAlertSeconds must be positive when set', Value: row.SequenceGapAlertSeconds }];
    }
    if (row.PartitionMode !== 'Ordered') {
        return [{ Field: 'SequenceGapAlertSeconds', Message: 'SequenceGapAlertSeconds applies only to Ordered subscriptions', Value: row.SequenceGapAlertSeconds }];
    }
    return [];
}

function JsonObjectIssue(field: string, json: string | null, subject: string): FieldIssue[] {
    try {
        ParseJsonObject(json, subject);
        return [];
    } catch (error) {
        return [{ Field: field, Message: error instanceof Error ? error.message : String(error), Value: json }];
    }
}
```

- [ ] **Step 8: Write the server entity subclasses**

`src/entities/WorkQueueSubscriptionEntityServer.ts`:

```typescript
import { BaseEntity, ValidationErrorInfo, ValidationErrorType } from '@memberjunction/core';
import type { ValidationResult } from '@memberjunction/core';
import { MJWorkQueueSubscriptionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { ValidateSubscriptionFields } from '@memberjunction/work-queue-base';
import { WorkQueueEntityNames } from '../constants';

@RegisterClass(BaseEntity, WorkQueueEntityNames.Subscriptions)
export class MJWorkQueueSubscriptionEntityServer extends MJWorkQueueSubscriptionEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        const issues = ValidateSubscriptionFields(this);
        for (const issue of issues) {
            result.Errors.push(new ValidationErrorInfo(issue.Field, issue.Message, issue.Value, ValidationErrorType.Failure));
        }
        result.Success = result.Success && issues.length === 0;
        return result;
    }
}
```

`src/entities/WorkQueueTopicEntityServer.ts`:

```typescript
import { BaseEntity, ValidationErrorInfo, ValidationErrorType } from '@memberjunction/core';
import type { ValidationResult } from '@memberjunction/core';
import { MJWorkQueueTopicEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { ValidateTopicFields } from '@memberjunction/work-queue-base';
import { WorkQueueEntityNames } from '../constants';

@RegisterClass(BaseEntity, WorkQueueEntityNames.Topics)
export class MJWorkQueueTopicEntityServer extends MJWorkQueueTopicEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        const issues = ValidateTopicFields(this);
        for (const issue of issues) {
            result.Errors.push(new ValidationErrorInfo(issue.Field, issue.Message, issue.Value, ValidationErrorType.Failure));
        }
        result.Success = result.Success && issues.length === 0;
        return result;
    }
}
```

`src/entities/WorkQueueTransportEntityServer.ts`:

```typescript
import { BaseEntity, ValidationErrorInfo, ValidationErrorType } from '@memberjunction/core';
import type { ValidationResult } from '@memberjunction/core';
import { MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { ValidateTransportFields } from '@memberjunction/work-queue-base';
import { WorkQueueEntityNames } from '../constants';

@RegisterClass(BaseEntity, WorkQueueEntityNames.Transports)
export class MJWorkQueueTransportEntityServer extends MJWorkQueueTransportEntity {
    public override Validate(): ValidationResult {
        const result = super.Validate();
        const issues = ValidateTransportFields(this);
        for (const issue of issues) {
            result.Errors.push(new ValidationErrorInfo(issue.Field, issue.Message, issue.Value, ValidationErrorType.Failure));
        }
        result.Success = result.Success && issues.length === 0;
        return result;
    }
}
```

If the build reports that a generated entity is not assignable to `TransportRow`/`TopicRow`/`SubscriptionRow` (for example a status union CodeGen emitted differently), align the row interface with the generated property type — never cast.

- [ ] **Step 8b: Write the driver-owned state guards**

Messages, Deliveries, Partition States and Deduplications are written **only** by guarded driver SQL (03 §6.8). Task 1
already removed their API mutations; these subclasses close the in-process door and, crucially, say why.

**The failure mode they prevent.** MJ's update procedure writes *every* column from the entity in memory, so a
`Save()` from a snapshot loaded minutes ago restores that snapshot's `LeaseToken`, `AttemptCount` and
`CancelRequestedAt` over a newer claim — erasing another worker's lease, resurrecting a consumed attempt, or clearing
a cancel an operator just requested. It is the "load, check `Status`, `Save()`" pattern that reads like a
compare-and-swap and is not one. Settles are single guarded statements instead (03 §7), so a stale writer changes zero
rows and is told it lost the lease.

`src/entities/DriverOwnedEntityServers.ts`:

```typescript
import { BaseEntity, BaseEntityResult } from '@memberjunction/core';
import type { EntityDeleteOptions, EntitySaveOptions } from '@memberjunction/core';
import {
    MJWorkQueueDeduplicationEntity, MJWorkQueueDeliveryEntity, MJWorkQueueMessageEntity, MJWorkQueuePartitionStateEntity,
} from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { WorkQueueEntityNames } from '../constants';

export const DRIVER_OWNED_STATE_MESSAGE =
    'work-queue delivery state is managed by the transport driver; use the operator API (Replay / Discard / SkipSequence)';

/** Records the refusal on the entity's result history so callers see it through LatestResult.CompleteMessage. */
function RefuseDriverOwnedWrite(entity: BaseEntity, type: 'create' | 'update' | 'delete'): boolean {
    const result = new BaseEntityResult();
    result.StartedAt = new Date();
    result.Success = false;
    result.Type = type;
    result.Message = DRIVER_OWNED_STATE_MESSAGE;
    result.EndedAt = new Date();
    entity.RegisterResultHistoryEntry(result);
    return false;
}

@RegisterClass(BaseEntity, WorkQueueEntityNames.Deliveries)
export class MJWorkQueueDeliveryEntityServer extends MJWorkQueueDeliveryEntity {
    public override async Save(_options?: EntitySaveOptions): Promise<boolean> {
        return RefuseDriverOwnedWrite(this, this.IsSaved ? 'update' : 'create');
    }

    public override async Delete(_options?: EntityDeleteOptions): Promise<boolean> {
        return RefuseDriverOwnedWrite(this, 'delete');
    }
}

@RegisterClass(BaseEntity, WorkQueueEntityNames.Messages)
export class MJWorkQueueMessageEntityServer extends MJWorkQueueMessageEntity {
    public override async Save(_options?: EntitySaveOptions): Promise<boolean> {
        return RefuseDriverOwnedWrite(this, this.IsSaved ? 'update' : 'create');
    }

    public override async Delete(_options?: EntityDeleteOptions): Promise<boolean> {
        return RefuseDriverOwnedWrite(this, 'delete');
    }
}

@RegisterClass(BaseEntity, WorkQueueEntityNames.PartitionStates)
export class MJWorkQueuePartitionStateEntityServer extends MJWorkQueuePartitionStateEntity {
    public override async Save(_options?: EntitySaveOptions): Promise<boolean> {
        return RefuseDriverOwnedWrite(this, this.IsSaved ? 'update' : 'create');
    }

    public override async Delete(_options?: EntityDeleteOptions): Promise<boolean> {
        return RefuseDriverOwnedWrite(this, 'delete');
    }
}

@RegisterClass(BaseEntity, WorkQueueEntityNames.Deduplications)
export class MJWorkQueueDeduplicationEntityServer extends MJWorkQueueDeduplicationEntity {
    public override async Save(_options?: EntitySaveOptions): Promise<boolean> {
        return RefuseDriverOwnedWrite(this, this.IsSaved ? 'update' : 'create');
    }

    public override async Delete(_options?: EntityDeleteOptions): Promise<boolean> {
        return RefuseDriverOwnedWrite(this, 'delete');
    }
}
```

Add to `packages/WorkQueue/engine/src/__tests__/entityServers.test.ts` (the suite written in Step 1b):

```typescript
describe('driver-owned state guards', () => {
    it('refuses Save and Delete and reports why', async () => {
        const delivery = new MJWorkQueueDeliveryEntityServer();
        expect(await delivery.Save()).toBe(false);
        expect(delivery.LatestResult?.Message).toBe(DRIVER_OWNED_STATE_MESSAGE);
        expect(await delivery.Delete()).toBe(false);

        for (const entity of [new MJWorkQueueMessageEntityServer(), new MJWorkQueuePartitionStateEntityServer(),
                              new MJWorkQueueDeduplicationEntityServer()]) {
            expect(await entity.Save()).toBe(false);
        }
    });
});
```

If instantiating a generated entity directly needs metadata the test environment lacks, construct them through the
fake provider already used by `entityServers.test.ts` rather than loosening the guard.

- [ ] **Step 9: Export the new modules**

Append to `packages/WorkQueue/base/src/index.ts`:

```typescript
export * from './topology/rows';
export * from './entities/validation';
export * from './testing/rowFixtures';
```

Append to `packages/WorkQueue/engine/src/index.ts` (the row types and validators are re-exported so server-side
consumers — plans 06–08 — need only one import):

```typescript
export { ParseJsonObject, ValidateSubscriptionFields, ValidateTopicFields, ValidateTransportFields } from '@memberjunction/work-queue-base';
export type { FieldIssue, SubscriptionRow, TopicRow, TransportRow } from '@memberjunction/work-queue-base';
export * from './transports/BaseTransportDriverFactory';
export * from './transports/database/DatabaseTransportDriverFactory';
export * from './logging/MJWorkLogger';
export * from './entities/WorkQueueTransportEntityServer';
export * from './entities/WorkQueueTopicEntityServer';
export * from './entities/WorkQueueSubscriptionEntityServer';
export * from './entities/DriverOwnedEntityServers';
```

- [ ] **Step 10: Run the tests and build**

Run: `cd packages/WorkQueue/base && pnpm test && pnpm run build`
Expected: PASS — dependency guard (2) and entityValidation (12); builds.

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — previous suites plus DatabaseTransportDriverFactory (3) and the entity-server guards.

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds; the three entity subclasses compile against the generated classes, which confirms the row interfaces match.

- [ ] **Step 11: Commit**

```bash
git add packages/WorkQueue/base/src packages/WorkQueue/engine/src
git commit -m "feat(work-queue): topology rows and field validation in the base tier; driver factories and entity servers in the engine"
```

---

### Task 11: Topology bindings and validation (base); manifest and `WorkQueuePublishCoordinator` (engine)

**Files:**
- Create (**base**): `packages/WorkQueue/base/src/topology/bindings.ts`, `src/topology/validateTopology.ts`
- Modify (**base**): `packages/WorkQueue/base/src/index.ts`
- Test (**base**): `packages/WorkQueue/base/src/__tests__/topology.test.ts`
- Create (**engine**): `packages/WorkQueue/engine/src/topology/manifest.ts`, `src/publish/WorkQueuePublishCoordinator.ts`
- Modify (**engine**): `packages/WorkQueue/engine/src/index.ts`
- Test (**engine**): `packages/WorkQueue/engine/src/__tests__/manifest.test.ts`, `src/__tests__/WorkQueuePublishCoordinator.test.ts`

**Interfaces:**
- Consumes: rows and `ParseJsonObject` (Task 10, base); `DeduplicationLedger`, `RunInWorkQueueTransaction`, `RetryTransient` (Task 7); `DatabaseTransportPublishOptions`, `DATABASE_TRANSPORT_CAPABILITIES`, `Accepted`/`Duplicate`/`Rejected` (Task 9); `DATABASE_DRIVER_CLASS` (Task 2, base); from core: `TopicBinding`, `SubscriptionBinding`, `SubscriptionPolicy`, `TransportCapabilities`, `FilterSupport`, `BindingValidationIssue`, `TopologyManifest`, `ManifestTopic`, `ManifestSubscription`, `BindingImport`, `PublishRequest`, `PublishResult`, `PublishError`, `WorkMessage`, `WorkJson`, `WorkLogger`, `ITransportDriver`, `ParseSubscriptionFilter`, `WORK_QUEUE_FILTER_SUPPORT`, `SubscriptionUnsupportedReason`, `ValidatePublishRequest`, `BuildWorkMessage`, `WorkQueueConfigurationError`.
- Produces (base — `@memberjunction/work-queue-base`):
  - `interface TopologySnapshot { Transports: TransportRow[]; Topics: TopicRow[]; Subscriptions: SubscriptionRow[] }`, `interface ResolvedTopic { Topic: TopicRow; Transport: TransportRow; Binding: TopicBinding; Subscriptions: SubscriptionBinding[] }`
  - `FindByName<T extends { Name: string }>(rows: T[], name: string): T | undefined`, `FindByID<T extends { ID: string }>(rows: T[], id: string): T | undefined`
  - `ToTopicBinding(topic: TopicRow): TopicBinding`, `ToSubscriptionPolicy(subscription: SubscriptionRow, topic: TopicRow): SubscriptionPolicy`, `ToSubscriptionBinding(subscription: SubscriptionRow, topic: TopicRow, support?: FilterSupport): SubscriptionBinding`, `IsStagedSubscription(subscription: SubscriptionRow, transport: TransportRow): boolean`, `ResolveTopic(snapshot: TopologySnapshot, topicName: string): ResolvedTopic | undefined`
  - `KNOWN_HOST_CEILING_SECONDS: Record<HostType, number | null>`, `ValidateTopologyRows(snapshot: TopologySnapshot, capabilities: Map<string, TransportCapabilities | Error>): BindingValidationIssue[]`
- Produces (engine):
  - `BuildTopologyManifest(snapshot: TopologySnapshot, transportName: string, generatedAt: Date): TopologyManifest`, `interface BindingUpdate { ID: string; Name: string; BindingConfig: string }`, `interface BindingImportPlan { TopicUpdates: BindingUpdate[]; SubscriptionUpdates: BindingUpdate[]; Issues: BindingValidationIssue[] }`, `PlanBindingImport(snapshot: TopologySnapshot, bindings: BindingImport): BindingImportPlan`
  - `type LedgerOperations = Pick<DeduplicationLedger, 'Reserve' | 'Confirm' | 'Release'>`, `interface PublishCoordinatorDeps`, `interface CoordinatorPublishOptions { UserID: string | null; External: boolean; CallerExecutor: WorkQueueTransactionalExecutor | null }`, `class WorkQueuePublishCoordinator { constructor(deps: PublishCoordinatorDeps); Publish<TPayload extends WorkJson>(topicName: string, requests: PublishRequest<TPayload>[], options: CoordinatorPublishOptions): Promise<PublishResult[]> }`

Binding convention: `ToTopicBinding` always adds `Config.TopicID`; `ToSubscriptionBinding` always adds `Config.SubscriptionID` and `Config.TopicID` (cloud drivers ignore them; the Database driver and staged consumers require them). A subscription is **staged** when its transport is not `Database`, its `PartitionMode` is `Ordered`, and its host is `MJWorker` (03 §5.1 — every Phase 1 cloud transport has `SupportsOrdered = false`).

Topology validation (per active topic and each non-disabled subscription):

| Condition | Severity |
| --- | --- |
| Topic's transport missing | Error |
| Transport `Disabled` | Warning |
| Transport driver unavailable (capability lookup failed) | Error |
| Cloud topic with `IsFifo = false` while the topic is `ExplicitSequence` or any subscription is `Exclusive`/`Ordered` (W7) | Error |
| Database topic with `IsFifo = true` | Warning |
| `SubscriptionUnsupportedReason(binding, capabilities, staged)` returns a reason | Error |
| Filter or binding JSON does not parse | Error |
| Filter uses an operator or structure the topic's transport cannot express (re-parsed with `capabilities.Filters`), naming the field and operator | Error |
| `MaxProcessingSeconds` above the host's known ceiling (`External`: 900 s) | Warning |
| `SequenceGapAlertSeconds` set on a `PublishOrder` topic | Warning |

Publish orchestration (03 §2.1, §1.1): topic lookup → topic rejections (`TopicNotFound`, `TopicDisabled`, `TopicNotExternallyPublishable`, `TopicUnbound`) → per-request `ValidatePublishRequest` → `BuildWorkMessage`. Database transport: per message, in one transaction (the caller's when given, else an independent one with transient retry): `Reserve` (duplicate ⇒ roll back, `Duplicate` with the owner's ID) → `driver.Publish` with `DatabaseTransportPublishOptions` → `Confirm` → commit only when accepted. Cloud transport: `Reserve` each keyed request outside any transaction → one `driver.Publish` for the batch → `Confirm` accepted keys, `Release` the rest. Results stay aligned with requests. `NotifyPublished(topicName)` fires once when anything was accepted.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/base/src/__tests__/topology.test.ts` (the base package has no drivers, so it declares both
capability fixtures locally — the Database values must stay in step with `DATABASE_TRANSPORT_CAPABILITIES`, Task 9):

```typescript
import { describe, it, expect } from 'vitest';
import { WORK_QUEUE_FILTER_SUPPORT } from '@memberjunction/work-queue-core';
import type { TransportCapabilities } from '@memberjunction/work-queue-core';
import {
    FindByName, IsStagedSubscription, ResolveTopic, ToSubscriptionBinding, ToTopicBinding,
} from '../topology/bindings';
import type { TopologySnapshot } from '../topology/bindings';
import { ValidateTopologyRows } from '../topology/validateTopology';
import {
    SUBSCRIPTION_ROW_FIXTURE as SUBSCRIPTION_ROW,
    TOPIC_ROW_FIXTURE as TOPIC_ROW,
    TRANSPORT_ROW_FIXTURE as TRANSPORT_ROW,
} from '../testing/rowFixtures';

const DATABASE_CAPABILITIES: TransportCapabilities = {
    DetectsMessageIDDuplicates: true, PersistsProgress: true, SupportsOrdered: true, SupportsExternalHosts: false,
    CancelPending: true, CancelInFlight: true, ListPartitions: true, PeekDeadLetters: 'Full',
    ReplaySingleDeadLetter: true, CompletedCounts: true, MaxRetryDelaySeconds: 2147483647,
    Filters: WORK_QUEUE_FILTER_SUPPORT,
};
const AWS_TRANSPORT = { ...TRANSPORT_ROW, ID: 'A0000000-0000-0000-0000-000000000001', Name: 'AWS-dev', DriverClass: 'AWS', Configuration: '{"Region":"us-east-1"}' };
const AWS_CAPABILITIES: TransportCapabilities = {
    ...DATABASE_CAPABILITIES, SupportsOrdered: false, SupportsExternalHosts: true, CancelPending: false, CancelInFlight: false,
    ListPartitions: false, PeekDeadLetters: 'BestEffort', CompletedCounts: false, PersistsProgress: false,
    DetectsMessageIDDuplicates: false, MaxRetryDelaySeconds: 43200,
    // A cloud transport that cannot express prefix matching, so `startswith` must be rejected at save time.
    Filters: { ...WORK_QUEUE_FILTER_SUPPORT, Operators: ['eq', 'neq', 'isnull', 'isnotnull'] },
};

function Snapshot(overrides: Partial<TopologySnapshot> = {}): TopologySnapshot {
    return { Transports: [TRANSPORT_ROW, AWS_TRANSPORT], Topics: [TOPIC_ROW], Subscriptions: [SUBSCRIPTION_ROW], ...overrides };
}

describe('bindings', () => {
    it('adds row IDs to binding config and builds the policy', () => {
        expect(ToTopicBinding({ ...TOPIC_ROW, BindingConfig: '{"SnsTopicArn":"arn"}' }).Config).toEqual({ SnsTopicArn: 'arn', TopicID: TOPIC_ROW.ID });
        const binding = ToSubscriptionBinding({ ...SUBSCRIPTION_ROW, MaxProcessingSeconds: 120 }, TOPIC_ROW);
        expect(binding.Config).toEqual({ SubscriptionID: SUBSCRIPTION_ROW.ID, TopicID: TOPIC_ROW.ID });
        expect(binding.Policy).toMatchObject({ SubscriptionName: 'venue-import', TopicName: 'import.ready', PartitionMode: 'Ordered', MaxProcessingSeconds: 120 });
        expect(binding.Policy.SequenceGapAlertSeconds).toBeUndefined();
    });

    it('stages only MJ-hosted Ordered subscriptions on cloud transports', () => {
        expect(IsStagedSubscription(SUBSCRIPTION_ROW, TRANSPORT_ROW)).toBe(false);
        expect(IsStagedSubscription(SUBSCRIPTION_ROW, AWS_TRANSPORT)).toBe(true);
        expect(IsStagedSubscription({ ...SUBSCRIPTION_ROW, PartitionMode: 'Exclusive' }, AWS_TRANSPORT)).toBe(false);
    });

    it('resolves a topic by trimmed case-insensitive name with its non-disabled subscriptions', () => {
        const disabled = { ...SUBSCRIPTION_ROW, ID: 'B2', Name: 'old', Status: 'Disabled' as const };
        const resolved = ResolveTopic(Snapshot({ Subscriptions: [SUBSCRIPTION_ROW, disabled] }), '  IMPORT.READY ');
        expect(resolved?.Transport.Name).toBe('Database');
        expect(resolved?.Subscriptions.map(s => s.Policy.SubscriptionName)).toEqual(['venue-import']);
        expect(ResolveTopic(Snapshot(), 'missing')).toBeUndefined();
        expect(FindByName([TOPIC_ROW], 'Import.Ready')).toBe(TOPIC_ROW);
    });
});

describe('ValidateTopologyRows', () => {
    const capabilities = new Map<string, TransportCapabilities | Error>([
        [TRANSPORT_ROW.ID.toLowerCase(), DATABASE_CAPABILITIES],
        [AWS_TRANSPORT.ID.toLowerCase(), AWS_CAPABILITIES],
    ]);

    it('passes a valid Database topology', () => {
        expect(ValidateTopologyRows(Snapshot(), capabilities)).toEqual([]);
    });

    it('requires FIFO for partitioned subscriptions on cloud topics', () => {
        const topic = { ...TOPIC_ROW, TransportID: AWS_TRANSPORT.ID, BindingConfig: '{"SnsTopicArn":"arn"}' };
        const issues = ValidateTopologyRows(Snapshot({ Topics: [topic] }), capabilities);
        expect(issues).toContainEqual(expect.objectContaining({ Severity: 'Error', Subject: 'import.ready', Message: expect.stringContaining('IsFifo') }));
    });

    it('rejects Ordered subscriptions on cloud transports hosted externally', () => {
        const topic = { ...TOPIC_ROW, TransportID: AWS_TRANSPORT.ID, IsFifo: true };
        const external = { ...SUBSCRIPTION_ROW, HostType: 'External' as const, HandlerKey: null };
        const issues = ValidateTopologyRows(Snapshot({ Topics: [topic], Subscriptions: [external] }), capabilities);
        expect(issues.some(i => i.Severity === 'Error' && i.Subject === 'venue-import')).toBe(true);
    });

    it('warns about processing times above the external host ceiling', () => {
        const topic = { ...TOPIC_ROW, TransportID: AWS_TRANSPORT.ID, IsFifo: true };
        const lambda = { ...SUBSCRIPTION_ROW, PartitionMode: 'Exclusive' as const, HostType: 'External' as const, HandlerKey: null, MaxProcessingSeconds: 1800 };
        const issues = ValidateTopologyRows(Snapshot({ Topics: [topic], Subscriptions: [lambda] }), capabilities);
        expect(issues).toEqual([expect.objectContaining({ Severity: 'Warning', Subject: 'venue-import' })]);
    });

    it('reports unavailable drivers and unparseable filters', () => {
        const broken = new Map<string, TransportCapabilities | Error>([[TRANSPORT_ROW.ID.toLowerCase(), new Error('not registered')]]);
        expect(ValidateTopologyRows(Snapshot(), broken)[0].Message).toContain('not registered');
        const badFilter = { ...SUBSCRIPTION_ROW, Filter: '{"eventType":"click"}' };
        expect(ValidateTopologyRows(Snapshot({ Subscriptions: [badFilter] }), capabilities)[0].Subject).toBe('venue-import');
    });

    it('rejects a filter the topic transport cannot express, naming field and operator', () => {
        const startswith = '{"logic":"and","filters":[{"field":"tenant","operator":"startswith","value":"acme-"}]}';
        // Valid on Database (full subset)…
        expect(ValidateTopologyRows(Snapshot({ Subscriptions: [{ ...SUBSCRIPTION_ROW, Filter: startswith }] }), capabilities)).toEqual([]);
        // …and an Error on the cloud transport whose FilterSupport omits `startswith`.
        const topic = { ...TOPIC_ROW, TransportID: AWS_TRANSPORT.ID, IsFifo: true };
        const issue = ValidateTopologyRows(Snapshot({ Topics: [topic], Subscriptions: [{ ...SUBSCRIPTION_ROW, Filter: startswith }] }), capabilities)[0];
        expect(issue).toMatchObject({ Severity: 'Error', Subject: 'venue-import' });
        expect(issue.Message).toContain('startswith');
        expect(issue.Message).toContain('tenant');
    });
});
```

`packages/WorkQueue/engine/src/__tests__/manifest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { TopologySnapshot } from '@memberjunction/work-queue-base';
import { BuildTopologyManifest, PlanBindingImport } from '../topology/manifest';
import { SUBSCRIPTION_ROW, TOPIC_ROW, TRANSPORT_ROW } from './fakes';

const AWS_TRANSPORT = { ...TRANSPORT_ROW, ID: 'A0000000-0000-0000-0000-000000000001', Name: 'AWS-dev', DriverClass: 'AWS', Configuration: '{"Region":"us-east-1"}' };

function Snapshot(overrides: Partial<TopologySnapshot> = {}): TopologySnapshot {
    return { Transports: [TRANSPORT_ROW, AWS_TRANSPORT], Topics: [TOPIC_ROW], Subscriptions: [SUBSCRIPTION_ROW], ...overrides };
}

describe('manifest', () => {
    it('exports active topics and non-disabled subscriptions of one transport, sorted by name', () => {
        const other = { ...TOPIC_ROW, ID: 'T2', Name: 'aaa.first' };
        const manifest = BuildTopologyManifest(Snapshot({ Topics: [TOPIC_ROW, other] }), 'Database', new Date('2026-01-01T00:00:00Z'));
        expect(manifest.ManifestVersion).toBe(1);
        expect(manifest.GeneratedAt).toBe('2026-01-01T00:00:00.000Z');
        expect(manifest.Transport).toEqual({ Name: 'Database', DriverClass: 'Database', Configuration: {} });
        expect(manifest.Topics.map(t => t.Name)).toEqual(['aaa.first', 'import.ready']);
        expect(manifest.Topics[1].Subscriptions[0]).toMatchObject({ Name: 'venue-import', HostType: 'MJWorker', StagedToDatabase: false, ExternalRef: null, Filter: null });
    });

    it('fails for an unknown transport', () => {
        expect(() => BuildTopologyManifest(Snapshot(), 'Nope', new Date())).toThrow("Transport 'Nope'");
    });

    it('plans binding updates and reports unknown names and versions', () => {
        const plan = PlanBindingImport(Snapshot(), {
            ManifestVersion: 1,
            Topics: [{ Name: 'import.ready', BindingConfig: { SnsTopicArn: 'arn' } }, { Name: 'ghost', BindingConfig: {} }],
            Subscriptions: [{ Name: 'venue-import', BindingConfig: { QueueUrl: 'https://q' } }],
        });
        expect(plan.TopicUpdates).toEqual([{ ID: TOPIC_ROW.ID, Name: 'import.ready', BindingConfig: '{"SnsTopicArn":"arn"}' }]);
        expect(plan.SubscriptionUpdates).toEqual([{ ID: SUBSCRIPTION_ROW.ID, Name: 'venue-import', BindingConfig: '{"QueueUrl":"https://q"}' }]);
        expect(plan.Issues).toEqual([{ Severity: 'Error', Subject: 'ghost', Message: 'No topic named ghost exists' }]);
    });
});
```

`packages/WorkQueue/engine/src/__tests__/WorkQueuePublishCoordinator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type {
    BindingValidationIssue, DatabasePublishOptions, ITransportConsumer, ITransportDriver, ITransportOperator,
    PublishResult, SubscriptionBinding, TopicBinding, WorkJson, WorkMessage,
} from '@memberjunction/work-queue-core';
import { WorkQueuePublishCoordinator } from '../publish/WorkQueuePublishCoordinator';
import type { LedgerOperations, PublishCoordinatorDeps } from '../publish/WorkQueuePublishCoordinator';
import type { LedgerReservation } from '../dedup/DeduplicationLedger';
import { Accepted, Rejected } from '../publish/publishResults';
import { ResolveTopic } from '@memberjunction/work-queue-base';
import type { TopicRow, TransportRow } from '@memberjunction/work-queue-base';
import { DATABASE_TRANSPORT_CAPABILITIES } from '../transports/database/databaseCapabilities';
import { IsDatabaseTransportPublishOptions } from '../transports/database/DatabaseTransportDriver';
import { RecordingExecutor, RecordingLogger, SUBSCRIPTION_ROW, TOPIC_ROW, TRANSPORT_ROW } from './fakes';

class FakeDriver implements ITransportDriver {
    public readonly Name = 'Fake';
    public readonly Capabilities = DATABASE_TRANSPORT_CAPABILITIES;
    public readonly Calls: { Messages: WorkMessage[]; Options?: DatabasePublishOptions }[] = [];
    public NextResults: PublishResult[] | Error | null = null;

    public async Publish(topic: TopicBinding, messages: WorkMessage[], subscriptions: SubscriptionBinding[], opts?: DatabasePublishOptions): Promise<PublishResult[]> {
        this.Calls.push({ Messages: messages, Options: opts });
        const next = this.NextResults;
        this.NextResults = null;
        if (next instanceof Error) {
            throw next;
        }
        return next ?? messages.map(m => Accepted(m.MessageID));
    }
    public OpenConsumer<TPayload extends WorkJson>(): ITransportConsumer<TPayload> { throw new Error('not used'); }
    public Operator(): ITransportOperator { throw new Error('not used'); }
    public async ValidateBindings(): Promise<BindingValidationIssue[]> { return []; }
}

class FakeLedger implements LedgerOperations {
    public readonly Events: string[] = [];
    public readonly Owners = new Map<string, string>();

    public async Reserve(topicID: string, key: string, messageID: string): Promise<LedgerReservation> {
        this.Events.push(`reserve:${key}`);
        const owner = this.Owners.get(key);
        return owner && owner !== messageID ? { Kind: 'Duplicate', OwnerMessageID: owner } : { Kind: 'Reserved' };
    }
    public async Confirm(topicID: string, key: string): Promise<boolean> { this.Events.push(`confirm:${key}`); return true; }
    public async Release(topicID: string, key: string): Promise<boolean> { this.Events.push(`release:${key}`); return true; }
}

const AWS_TRANSPORT = { ...TRANSPORT_ROW, ID: 'A0000000-0000-0000-0000-000000000001', Name: 'AWS-dev', DriverClass: 'AWS' };

function Setup(topicOverrides: Partial<TopicRow> = {}, transport: TransportRow = TRANSPORT_ROW) {
    const executor = new RecordingExecutor();
    const driver = new FakeDriver();
    const ledger = new FakeLedger();
    const notified: string[] = [];
    let id = 0;
    const topic = { ...TOPIC_ROW, TransportID: transport.ID, ...topicOverrides };
    const snapshot = { Transports: [TRANSPORT_ROW, AWS_TRANSPORT], Topics: [topic], Subscriptions: [{ ...SUBSCRIPTION_ROW, PartitionMode: 'None' as const }] };
    const deps: PublishCoordinatorDeps = {
        ResolveTopic: name => ResolveTopic(snapshot, name),
        GetDriver: async () => driver,
        Executor: executor,
        CreateLedger: () => ledger,
        NewID: () => `00000000-0000-0000-0000-00000000000${++id}`,
        Now: () => new Date('2026-01-01T00:00:00Z'),
        NotifyPublished: name => notified.push(name),
        Log: new RecordingLogger(),
    };
    return { coordinator: new WorkQueuePublishCoordinator(deps), driver, ledger, executor, notified };
}

const INTERNAL = { UserID: 'U1', External: false, CallerExecutor: null };

describe('WorkQueuePublishCoordinator topic rejections', () => {
    it('rejects every request for an unknown topic', async () => {
        const { coordinator } = Setup();
        const results = await coordinator.Publish('missing', [{}, {}], INTERNAL);
        expect(results.map(r => r.Error?.Code)).toEqual(['TopicNotFound', 'TopicNotFound']);
    });

    it('rejects disabled topics', async () => {
        const { coordinator } = Setup({ Status: 'Disabled' });
        expect((await coordinator.Publish('import.ready', [{}], INTERNAL))[0].Error?.Code).toBe('TopicDisabled');
    });

    it('rejects external publishes to topics that do not allow them', async () => {
        const { coordinator } = Setup();
        const external = await coordinator.Publish('import.ready', [{}], { ...INTERNAL, External: true });
        expect(external[0].Error?.Code).toBe('TopicNotExternallyPublishable');
        const internal = await coordinator.Publish('import.ready', [{}], INTERNAL);
        expect(internal[0].Status).toBe('Accepted');
    });

    it('rejects cloud topics that have no imported binding, as retryable', async () => {
        const { coordinator } = Setup({}, AWS_TRANSPORT);
        const [result] = await coordinator.Publish('import.ready', [{}], INTERNAL);
        expect(result.Error).toMatchObject({ Code: 'TopicUnbound', Retryable: true });
    });
});

describe('WorkQueuePublishCoordinator on the Database transport', () => {
    it('reserves, publishes on the transaction executor, confirms and commits', async () => {
        const { coordinator, driver, ledger, executor, notified } = Setup();
        const [result] = await coordinator.Publish('import.ready', [{ DeduplicationKey: ' k1 ', Payload: { a: 1 } }], INTERNAL);
        expect(result).toEqual({ MessageID: '00000000-0000-0000-0000-000000000001', Status: 'Accepted' });
        expect(ledger.Events).toEqual(['reserve:k1', 'confirm:k1']);
        const options = driver.Calls[0].Options;
        expect(IsDatabaseTransportPublishOptions(options) && options.Executor).toBe(executor);
        expect(IsDatabaseTransportPublishOptions(options) && options.UserID).toBe('U1');
        expect(executor.Events).toEqual(['independent', 'begin', 'commit', 'release']);
        expect(notified).toEqual(['import.ready']);
    });

    it('returns Duplicate with the owning message and rolls back without publishing', async () => {
        const { coordinator, driver, ledger, executor, notified } = Setup();
        ledger.Owners.set('k1', 'OWNER');
        const [result] = await coordinator.Publish('import.ready', [{ DeduplicationKey: 'k1' }], INTERNAL);
        expect(result).toEqual({ MessageID: 'OWNER', Status: 'Duplicate' });
        expect(driver.Calls).toHaveLength(0);
        expect(executor.Events).toContain('rollback');
        expect(notified).toEqual([]);
    });

    it('rolls back when the driver rejects and keeps results aligned with invalid requests', async () => {
        const { coordinator, driver, executor } = Setup();
        driver.NextResults = [Rejected('x', 'MessageIDConflict', 'conflict', false)];
        const results = await coordinator.Publish('import.ready', [{ Sequence: 3 }, { Payload: 1 }], INTERNAL);
        expect(results[0].Status).toBe('Rejected');
        expect(results[1].Error?.Code).toBe('MessageIDConflict');
        expect(executor.Events).toContain('rollback');
    });

    it("uses the caller's executor when one is provided", async () => {
        const { coordinator, driver, executor } = Setup();
        const caller = new RecordingExecutor();
        await coordinator.Publish('import.ready', [{}], { ...INTERNAL, CallerExecutor: caller });
        const options = driver.Calls[0].Options;
        expect(IsDatabaseTransportPublishOptions(options) && options.Executor).toBe(caller);
        expect(executor.Events).toEqual([]);
        expect(caller.Events).toEqual(['begin', 'commit']);
    });
});

describe('WorkQueuePublishCoordinator on a cloud transport', () => {
    it('reserves keyed requests, sends one batch, confirms accepted and releases rejected keys', async () => {
        const { coordinator, driver, ledger } = Setup({ BindingConfig: '{"SnsTopicArn":"arn"}' }, AWS_TRANSPORT);
        driver.NextResults = [Accepted('m1'), Rejected('m2', 'TransportUnavailable', 'throttled', true), Accepted('m3')];
        const results = await coordinator.Publish('import.ready', [
            { MessageID: '11111111-1111-1111-1111-111111111111', DeduplicationKey: 'a' },
            { MessageID: '22222222-2222-2222-2222-222222222222', DeduplicationKey: 'b' },
            { MessageID: '33333333-3333-3333-3333-333333333333' },
        ], INTERNAL);
        expect(results.map(r => r.Status)).toEqual(['Accepted', 'Rejected', 'Accepted']);
        expect(driver.Calls).toHaveLength(1);
        expect(driver.Calls[0].Messages).toHaveLength(3);
        expect(driver.Calls[0].Options).toBeUndefined();
        expect(ledger.Events).toEqual(['reserve:a', 'reserve:b', 'confirm:a', 'release:b']);
    });

    it('rejects and releases everything when the transport throws', async () => {
        const { coordinator, driver, ledger } = Setup({ BindingConfig: '{"SnsTopicArn":"arn"}' }, AWS_TRANSPORT);
        driver.NextResults = new Error('network down');
        const results = await coordinator.Publish('import.ready', [{ DeduplicationKey: 'a' }], INTERNAL);
        expect(results[0].Error).toEqual({ Code: 'TransportUnavailable', Message: 'network down', Retryable: true });
        expect(ledger.Events).toEqual(['reserve:a', 'release:a']);
    });
});
```

`{ Sequence: 3 }` on a `PublishOrder` topic fails core validation (`SequenceNotAllowed`, 03 §1.1); `{ Payload: 1 }` is valid.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/base && pnpm test topology` and `cd packages/WorkQueue/engine && pnpm test manifest WorkQueuePublishCoordinator`
Expected: FAIL — unresolved imports under `../topology/` (base) and `../topology/manifest` / `../publish/WorkQueuePublishCoordinator` (engine).

- [ ] **Step 3: Write `packages/WorkQueue/base/src/topology/bindings.ts`**

```typescript
import { ParseSubscriptionFilter, WORK_QUEUE_FILTER_SUPPORT, WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { FilterSupport, SubscriptionBinding, SubscriptionPolicy, TopicBinding } from '@memberjunction/work-queue-core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { DATABASE_DRIVER_CLASS } from '../constants';
import { ParseJsonObject } from '../entities/validation';
import type { SubscriptionRow, TopicRow, TransportRow } from './rows';

export interface TopologySnapshot {
    Transports: TransportRow[];
    Topics: TopicRow[];
    Subscriptions: SubscriptionRow[];
}

export interface ResolvedTopic {
    Topic: TopicRow;
    Transport: TransportRow;
    Binding: TopicBinding;
    Subscriptions: SubscriptionBinding[];
}

export function FindByName<T extends { Name: string }>(rows: T[], name: string): T | undefined {
    const wanted = name.trim().toLowerCase();
    return rows.find(r => r.Name.trim().toLowerCase() === wanted);
}

export function FindByID<T extends { ID: string }>(rows: T[], id: string): T | undefined {
    const wanted = NormalizeUUID(id);
    return rows.find(r => NormalizeUUID(r.ID) === wanted);
}

export function ToTopicBinding(topic: TopicRow): TopicBinding {
    return {
        TopicName: topic.Name,
        OrderingMode: topic.OrderingMode,
        IsFifo: topic.IsFifo,
        MaxPayloadBytes: topic.MaxPayloadBytes,
        Config: { ...ParseJsonObject(topic.BindingConfig, `Topic ${topic.Name} BindingConfig`), TopicID: topic.ID },
    };
}

export function ToSubscriptionPolicy(subscription: SubscriptionRow, topic: TopicRow): SubscriptionPolicy {
    const policy: SubscriptionPolicy = {
        SubscriptionName: subscription.Name,
        TopicName: topic.Name,
        OrderingMode: topic.OrderingMode,
        PartitionMode: subscription.PartitionMode,
        MaxAttempts: subscription.MaxAttempts,
        BackoffBaseSeconds: subscription.BackoffBaseSeconds,
        BackoffMaxSeconds: subscription.BackoffMaxSeconds,
        LeaseSeconds: subscription.LeaseSeconds,
        HeartbeatMode: subscription.HeartbeatMode,
    };
    if (subscription.MaxProcessingSeconds !== null) {
        policy.MaxProcessingSeconds = subscription.MaxProcessingSeconds;
    }
    if (subscription.SequenceGapAlertSeconds !== null) {
        policy.SequenceGapAlertSeconds = subscription.SequenceGapAlertSeconds;
    }
    return policy;
}

/**
 * `support` defaults to the queue-wide subset (03 §4.1) so callers that only need the shape need not know the
 * transport. `ValidateTopologyRows` passes the transport's own `FilterSupport` to catch filters a broker cannot express.
 */
export function ToSubscriptionBinding(subscription: SubscriptionRow, topic: TopicRow,
                                      support: FilterSupport = WORK_QUEUE_FILTER_SUPPORT): SubscriptionBinding {
    return {
        Policy: ToSubscriptionPolicy(subscription, topic),
        Filter: ParseSubscriptionFilter(subscription.Filter, support),
        HostType: subscription.HostType,
        Config: {
            ...ParseJsonObject(subscription.BindingConfig, `Subscription ${subscription.Name} BindingConfig`),
            SubscriptionID: subscription.ID,
            TopicID: topic.ID,
        },
    };
}

/** 03 §5.1: an Ordered, MJ-hosted subscription on a cloud transport is staged into Database delivery rows. */
export function IsStagedSubscription(subscription: SubscriptionRow, transport: TransportRow): boolean {
    return transport.DriverClass !== DATABASE_DRIVER_CLASS
        && subscription.PartitionMode === 'Ordered'
        && subscription.HostType === 'MJWorker';
}

/** Resolves a topic for publishing. Throws WorkQueueConfigurationError when its transport or a subscription is misconfigured. */
export function ResolveTopic(snapshot: TopologySnapshot, topicName: string): ResolvedTopic | undefined {
    const topic = FindByName(snapshot.Topics, topicName);
    if (!topic) {
        return undefined;
    }
    const transport = FindByID(snapshot.Transports, topic.TransportID);
    if (!transport) {
        throw new WorkQueueConfigurationError(`Topic '${topic.Name}' references a transport that does not exist`);
    }
    const subscriptions = snapshot.Subscriptions
        .filter(s => UUIDsEqual(s.TopicID, topic.ID) && s.Status !== 'Disabled')
        .map(s => ToSubscriptionBinding(s, topic));
    return { Topic: topic, Transport: transport, Binding: ToTopicBinding(topic), Subscriptions: subscriptions };
}
```

- [ ] **Step 4: Write `packages/WorkQueue/base/src/topology/validateTopology.ts`**

```typescript
import { SubscriptionUnsupportedReason } from '@memberjunction/work-queue-core';
import type { BindingValidationIssue, HostType, TransportCapabilities } from '@memberjunction/work-queue-core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { DATABASE_DRIVER_CLASS } from '../constants';
import { FindByID, IsStagedSubscription, ToSubscriptionBinding, ToTopicBinding } from './bindings';
import type { TopologySnapshot } from './bindings';
import type { SubscriptionRow, TopicRow, TransportRow } from './rows';

/** Known maximum handler run time per host type (null = no known ceiling). External = AWS Lambda's 900 s. */
export const KNOWN_HOST_CEILING_SECONDS: Record<HostType, number | null> = {
    MJWorker: null,
    External: 900,
};

/** Validates topology rows against transport capabilities (keyed by normalised transport ID). */
export function ValidateTopologyRows(snapshot: TopologySnapshot, capabilities: Map<string, TransportCapabilities | Error>): BindingValidationIssue[] {
    const issues: BindingValidationIssue[] = [];
    for (const topic of snapshot.Topics.filter(t => t.Status === 'Active')) {
        issues.push(...ValidateTopic(snapshot, topic, capabilities));
    }
    return issues;
}

function ValidateTopic(snapshot: TopologySnapshot, topic: TopicRow, capabilities: Map<string, TransportCapabilities | Error>): BindingValidationIssue[] {
    const transport = FindByID(snapshot.Transports, topic.TransportID);
    if (!transport) {
        return [Issue('Error', topic.Name, 'Topic references a transport that does not exist')];
    }
    const issues: BindingValidationIssue[] = [];
    if (transport.Status === 'Disabled') {
        issues.push(Issue('Warning', topic.Name, `Transport '${transport.Name}' is disabled; publishes will be rejected`));
    }
    const caps = capabilities.get(NormalizeUUID(transport.ID));
    if (!caps || caps instanceof Error) {
        issues.push(Issue('Error', topic.Name, `Transport '${transport.Name}' driver is unavailable: ${caps instanceof Error ? caps.message : 'no capabilities'}`));
        return issues;
    }
    const subscriptions = snapshot.Subscriptions.filter(s => UUIDsEqual(s.TopicID, topic.ID) && s.Status !== 'Disabled');
    issues.push(...FifoIssues(topic, transport, subscriptions));
    try {
        ToTopicBinding(topic);
    } catch (error) {
        issues.push(Issue('Error', topic.Name, error instanceof Error ? error.message : String(error)));
    }
    for (const subscription of subscriptions) {
        issues.push(...ValidateSubscription(topic, transport, subscription, caps));
    }
    return issues;
}

function FifoIssues(topic: TopicRow, transport: TransportRow, subscriptions: SubscriptionRow[]): BindingValidationIssue[] {
    const isDatabase = transport.DriverClass === DATABASE_DRIVER_CLASS;
    if (isDatabase) {
        return topic.IsFifo ? [Issue('Warning', topic.Name, 'IsFifo has no effect on the Database transport')] : [];
    }
    const needsFifo = topic.OrderingMode === 'ExplicitSequence' || subscriptions.some(s => s.PartitionMode !== 'None');
    return needsFifo && !topic.IsFifo
        ? [Issue('Error', topic.Name, 'IsFifo must be true on cloud topics that are ExplicitSequence or have Exclusive/Ordered subscriptions')]
        : [];
}

function ValidateSubscription(topic: TopicRow, transport: TransportRow, subscription: SubscriptionRow,
                              caps: TransportCapabilities): BindingValidationIssue[] {
    const issues: BindingValidationIssue[] = [];
    let reason: string | null;
    try {
        // Re-parsing with the transport's own FilterSupport is what rejects `contains`, cross-field OR and the rest
        // on a cloud topic: the thrown message names the offending field and operator (03 §4.1).
        reason = SubscriptionUnsupportedReason(ToSubscriptionBinding(subscription, topic, caps.Filters), caps, IsStagedSubscription(subscription, transport));
    } catch (error) {
        return [Issue('Error', subscription.Name, error instanceof Error ? error.message : String(error))];
    }
    if (reason) {
        issues.push(Issue('Error', subscription.Name, reason));
    }
    const ceiling = KNOWN_HOST_CEILING_SECONDS[subscription.HostType];
    if (ceiling !== null && subscription.MaxProcessingSeconds !== null && subscription.MaxProcessingSeconds > ceiling) {
        issues.push(Issue('Warning', subscription.Name, `MaxProcessingSeconds ${subscription.MaxProcessingSeconds} exceeds the ${subscription.HostType} host ceiling of ${ceiling} seconds`));
    }
    if (subscription.SequenceGapAlertSeconds !== null && topic.OrderingMode !== 'ExplicitSequence') {
        issues.push(Issue('Warning', subscription.Name, 'SequenceGapAlertSeconds has no effect on a PublishOrder topic'));
    }
    return issues;
}

function Issue(severity: 'Error' | 'Warning', subject: string, message: string): BindingValidationIssue {
    return { Severity: severity, Subject: subject, Message: message };
}
```

- [ ] **Step 5: Write `packages/WorkQueue/engine/src/topology/manifest.ts`**

```typescript
import { ParseSubscriptionFilter, WORK_QUEUE_FILTER_SUPPORT, WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { BindingImport, BindingValidationIssue, ManifestSubscription, TopologyManifest } from '@memberjunction/work-queue-core';
import { UUIDsEqual } from '@memberjunction/global';
import { FindByName, IsStagedSubscription, ParseJsonObject, ToSubscriptionPolicy } from '@memberjunction/work-queue-base';
import type { SubscriptionRow, TopicRow, TopologySnapshot, TransportRow } from '@memberjunction/work-queue-base';

export interface BindingUpdate {
    ID: string;
    Name: string;
    BindingConfig: string;
}

export interface BindingImportPlan {
    TopicUpdates: BindingUpdate[];
    SubscriptionUpdates: BindingUpdate[];
    Issues: BindingValidationIssue[];
}

/** Exports one transport's active topics and non-disabled subscriptions (03 §10), sorted by name for stable diffs. */
export function BuildTopologyManifest(snapshot: TopologySnapshot, transportName: string, generatedAt: Date): TopologyManifest {
    const transport = FindByName(snapshot.Transports, transportName);
    if (!transport) {
        throw new WorkQueueConfigurationError(`Transport '${transportName}' does not exist`);
    }
    const topics = snapshot.Topics
        .filter(t => UUIDsEqual(t.TransportID, transport.ID) && t.Status === 'Active')
        .sort((a, b) => a.Name.localeCompare(b.Name))
        .map(topic => ({
            Name: topic.Name,
            OrderingMode: topic.OrderingMode,
            IsFifo: topic.IsFifo,
            MaxPayloadBytes: topic.MaxPayloadBytes,
            Subscriptions: snapshot.Subscriptions
                .filter(s => UUIDsEqual(s.TopicID, topic.ID) && s.Status !== 'Disabled')
                .sort((a, b) => a.Name.localeCompare(b.Name))
                .map(s => ToManifestSubscription(s, topic, transport)),
        }));
    return {
        ManifestVersion: 1,
        GeneratedAt: generatedAt.toISOString(),
        Transport: {
            Name: transport.Name,
            DriverClass: transport.DriverClass,
            Configuration: ParseJsonObject(transport.Configuration, `Transport ${transport.Name} Configuration`),
        },
        Topics: topics,
    };
}

function ToManifestSubscription(subscription: SubscriptionRow, topic: TopicRow, transport: TransportRow): ManifestSubscription {
    return {
        Name: subscription.Name,
        Filter: ParseSubscriptionFilter(subscription.Filter, WORK_QUEUE_FILTER_SUPPORT),
        Policy: ToSubscriptionPolicy(subscription, topic),
        HostType: subscription.HostType,
        StagedToDatabase: IsStagedSubscription(subscription, transport),
        ExternalRef: subscription.ExternalRef,
    };
}

/** Turns `terraform output` bindings into entity updates; unknown names become issues. */
export function PlanBindingImport(snapshot: TopologySnapshot, bindings: BindingImport): BindingImportPlan {
    const plan: BindingImportPlan = { TopicUpdates: [], SubscriptionUpdates: [], Issues: [] };
    if (bindings.ManifestVersion !== 1) {
        plan.Issues.push({ Severity: 'Error', Subject: 'BindingImport', Message: `Unsupported ManifestVersion ${String(bindings.ManifestVersion)}` });
        return plan;
    }
    for (const entry of bindings.Topics) {
        const topic = FindByName(snapshot.Topics, entry.Name);
        if (topic) {
            plan.TopicUpdates.push({ ID: topic.ID, Name: topic.Name, BindingConfig: JSON.stringify(entry.BindingConfig) });
        } else {
            plan.Issues.push({ Severity: 'Error', Subject: entry.Name, Message: `No topic named ${entry.Name} exists` });
        }
    }
    for (const entry of bindings.Subscriptions) {
        const subscription = FindByName(snapshot.Subscriptions, entry.Name);
        if (subscription) {
            plan.SubscriptionUpdates.push({ ID: subscription.ID, Name: subscription.Name, BindingConfig: JSON.stringify(entry.BindingConfig) });
        } else {
            plan.Issues.push({ Severity: 'Error', Subject: entry.Name, Message: `No subscription named ${entry.Name} exists` });
        }
    }
    return plan;
}
```

- [ ] **Step 6: Write `src/publish/WorkQueuePublishCoordinator.ts`**

```typescript
import { BuildWorkMessage, ValidatePublishRequest } from '@memberjunction/work-queue-core';
import type {
    ITransportDriver, PublishError, PublishRequest, PublishResult, WorkJson, WorkLogger, WorkMessage,
} from '@memberjunction/work-queue-core';
import { DATABASE_DRIVER_CLASS } from '../constants';
import type { DeduplicationLedger } from '../dedup/DeduplicationLedger';
import { ErrorText } from '../sql/sqlExecution';
import type { WorkQueueExecutorSource, WorkQueueSqlExecutor, WorkQueueTransactionalExecutor } from '../sql/WorkQueueSqlExecutor';
import type { ResolvedTopic } from '@memberjunction/work-queue-base';
import { RetryTransient, RunInWorkQueueTransaction } from '../transaction/RunInWorkQueueTransaction';
import type { DatabaseTransportPublishOptions } from '../transports/database/DatabaseTransportDriver';
import { Duplicate, Rejected } from './publishResults';

export type LedgerOperations = Pick<DeduplicationLedger, 'Reserve' | 'Confirm' | 'Release'>;

export interface PublishCoordinatorDeps {
    /** Returns undefined for an unknown topic; throws WorkQueueConfigurationError for a misconfigured one. */
    ResolveTopic(topicName: string): ResolvedTopic | undefined;
    GetDriver(transportID: string): Promise<ITransportDriver>;
    Executor: WorkQueueExecutorSource;
    CreateLedger(executor: WorkQueueSqlExecutor): LedgerOperations;
    NewID(): string;
    Now(): Date;
    NotifyPublished(topicName: string): void;
    Log: WorkLogger;
}

export interface CoordinatorPublishOptions {
    UserID: string | null;
    External: boolean;
    CallerExecutor: WorkQueueTransactionalExecutor | null;
}

interface PreparedPublish {
    Index: number;
    Message: WorkMessage;
    DedupKey: string | null;
    TTLSeconds: number;
}

/** Owns publish validation and the deduplication ledger protocol for every transport (03 §2.1). */
export class WorkQueuePublishCoordinator {
    constructor(private readonly deps: PublishCoordinatorDeps) {}

    public async Publish<TPayload extends WorkJson>(topicName: string, requests: PublishRequest<TPayload>[],
                                                    options: CoordinatorPublishOptions): Promise<PublishResult[]> {
        let resolved: ResolvedTopic | undefined;
        try {
            resolved = this.deps.ResolveTopic(topicName);
        } catch (error) {
            return RejectAll(requests, { Code: 'TransportUnavailable', Message: ErrorText(error), Retryable: true });
        }
        if (!resolved) {
            return RejectAll(requests, { Code: 'TopicNotFound', Message: `Topic '${topicName}' does not exist`, Retryable: false });
        }
        const topicError = TopicRejection(resolved, options.External);
        if (topicError) {
            return RejectAll(requests, topicError);
        }
        const results: PublishResult[] = new Array<PublishResult>(requests.length);
        const prepared = this.Prepare(resolved, requests, results);
        if (prepared.length > 0) {
            await this.Deliver(resolved, prepared, options, results);
        }
        if (results.some(r => r.Status === 'Accepted')) {
            this.deps.NotifyPublished(resolved.Topic.Name);
        }
        return results;
    }

    private Prepare<TPayload extends WorkJson>(resolved: ResolvedTopic, requests: PublishRequest<TPayload>[], results: PublishResult[]): PreparedPublish[] {
        const prepared: PreparedPublish[] = [];
        requests.forEach((request, index) => {
            const error = ValidatePublishRequest(resolved.Binding, request);
            if (error) {
                results[index] = { MessageID: request.MessageID ?? '', Status: 'Rejected', Error: error };
                return;
            }
            const key = request.DeduplicationKey?.trim();
            prepared.push({
                Index: index,
                Message: BuildWorkMessage(resolved.Topic.Name, request, this.deps.Now(), () => this.deps.NewID()),
                DedupKey: key ? key : null,
                TTLSeconds: request.DeduplicationTTLSeconds ?? resolved.Topic.DefaultDeduplicationTTLSeconds,
            });
        });
        return prepared;
    }

    private async Deliver(resolved: ResolvedTopic, prepared: PreparedPublish[], options: CoordinatorPublishOptions, results: PublishResult[]): Promise<void> {
        let driver: ITransportDriver;
        try {
            driver = await this.deps.GetDriver(resolved.Transport.ID);
        } catch (error) {
            for (const item of prepared) {
                results[item.Index] = Rejected(item.Message.MessageID, 'TransportUnavailable', ErrorText(error), true);
            }
            return;
        }
        if (resolved.Transport.DriverClass === DATABASE_DRIVER_CLASS) {
            for (const item of prepared) {
                results[item.Index] = await this.PublishDatabaseOne(resolved, driver, item, options);
            }
        } else {
            await this.PublishCloud(resolved, driver, prepared, results);
        }
    }

    private async PublishDatabaseOne(resolved: ResolvedTopic, driver: ITransportDriver, item: PreparedPublish,
                                     options: CoordinatorPublishOptions): Promise<PublishResult> {
        const messageID = item.Message.MessageID;
        const work = () => RunInWorkQueueTransaction(this.deps.Executor, async tx => {
            const ledger = this.deps.CreateLedger(tx);
            if (item.DedupKey) {
                const reservation = await ledger.Reserve(resolved.Topic.ID, item.DedupKey, messageID);
                if (reservation.Kind === 'Duplicate') {
                    return { Commit: false, Value: Duplicate(reservation.OwnerMessageID) };
                }
            }
            const publishOptions: DatabaseTransportPublishOptions = { Kind: 'Database', Executor: tx, UserID: options.UserID };
            const [result] = await driver.Publish(resolved.Binding, [item.Message], resolved.Subscriptions, publishOptions);
            const outcome = result ?? Rejected(messageID, 'TransportUnavailable', 'The transport returned no publish result', true);
            if (outcome.Status !== 'Accepted') {
                return { Commit: false, Value: outcome };
            }
            if (item.DedupKey && !(await ledger.Confirm(resolved.Topic.ID, item.DedupKey, messageID, item.TTLSeconds))) {
                throw new Error(`Deduplication key '${item.DedupKey}' could not be confirmed`);
            }
            return { Commit: true, Value: outcome };
        }, options.CallerExecutor);
        try {
            return options.CallerExecutor ? await work() : await RetryTransient(work);
        } catch (error) {
            this.deps.Log.Error(`Publish of message ${messageID} to '${resolved.Topic.Name}' failed`, error instanceof Error ? error : undefined);
            return Rejected(messageID, 'TransportUnavailable', ErrorText(error), true);
        }
    }

    private async PublishCloud(resolved: ResolvedTopic, driver: ITransportDriver, prepared: PreparedPublish[], results: PublishResult[]): Promise<void> {
        const ledger = this.deps.CreateLedger(this.deps.Executor);
        const toSend = await this.ReserveCloudKeys(resolved, ledger, prepared, results);
        if (toSend.length === 0) {
            return;
        }
        let sent: PublishResult[];
        try {
            sent = await driver.Publish(resolved.Binding, toSend.map(i => i.Message), resolved.Subscriptions);
        } catch (error) {
            sent = toSend.map(i => Rejected(i.Message.MessageID, 'TransportUnavailable', ErrorText(error), true));
        }
        for (let position = 0; position < toSend.length; position++) {
            const item = toSend[position];
            const outcome = sent[position] ?? Rejected(item.Message.MessageID, 'TransportUnavailable', 'The transport returned no publish result', true);
            results[item.Index] = outcome;
            if (item.DedupKey) {
                await this.SettleCloudReservation(ledger, resolved.Topic.ID, item, outcome);
            }
        }
    }

    private async ReserveCloudKeys(resolved: ResolvedTopic, ledger: LedgerOperations, prepared: PreparedPublish[],
                                   results: PublishResult[]): Promise<PreparedPublish[]> {
        const toSend: PreparedPublish[] = [];
        for (const item of prepared) {
            if (!item.DedupKey) {
                toSend.push(item);
                continue;
            }
            try {
                const reservation = await ledger.Reserve(resolved.Topic.ID, item.DedupKey, item.Message.MessageID);
                if (reservation.Kind === 'Duplicate') {
                    results[item.Index] = Duplicate(reservation.OwnerMessageID);
                } else {
                    toSend.push(item);
                }
            } catch (error) {
                results[item.Index] = Rejected(item.Message.MessageID, 'TransportUnavailable', ErrorText(error), true);
            }
        }
        return toSend;
    }

    private async SettleCloudReservation(ledger: LedgerOperations, topicID: string, item: PreparedPublish, outcome: PublishResult): Promise<void> {
        const key = item.DedupKey ?? '';
        try {
            if (outcome.Status === 'Accepted') {
                if (!(await ledger.Confirm(topicID, key, item.Message.MessageID, item.TTLSeconds))) {
                    this.deps.Log.Warn(`Deduplication key '${key}' reservation expired before it was confirmed`);
                }
            } else {
                await ledger.Release(topicID, key, item.Message.MessageID);
            }
        } catch (error) {
            this.deps.Log.Error(`Deduplication ledger update for key '${key}' failed`, error instanceof Error ? error : undefined);
        }
    }
}

function RejectAll<TPayload extends WorkJson>(requests: PublishRequest<TPayload>[], error: PublishError): PublishResult[] {
    return requests.map(r => ({ MessageID: r.MessageID ?? '', Status: 'Rejected', Error: error }));
}

function TopicRejection(resolved: ResolvedTopic, external: boolean): PublishError | null {
    const { Topic: topic, Transport: transport } = resolved;
    if (topic.Status !== 'Active') {
        return { Code: 'TopicDisabled', Message: `Topic '${topic.Name}' is disabled`, Retryable: false };
    }
    if (transport.Status !== 'Active') {
        return { Code: 'TopicDisabled', Message: `Transport '${transport.Name}' for topic '${topic.Name}' is disabled`, Retryable: false };
    }
    if (external && !topic.AllowExternalPublish) {
        return { Code: 'TopicNotExternallyPublishable', Message: `Topic '${topic.Name}' does not accept external publishes`, Retryable: false };
    }
    if (transport.DriverClass !== DATABASE_DRIVER_CLASS && (topic.BindingConfig ?? '').trim() === '') {
        return { Code: 'TopicUnbound', Message: `Topic '${topic.Name}' has no imported ${transport.DriverClass} binding yet`, Retryable: true };
    }
    return null;
}
```

- [ ] **Step 7: Export the new modules**

Append to `packages/WorkQueue/base/src/index.ts`:

```typescript
export * from './topology/bindings';
export * from './topology/validateTopology';
```

Append to `packages/WorkQueue/engine/src/index.ts` (binding builders and topology validation are re-exported so
plans 06–08 keep importing them from the engine):

```typescript
export {
    FindByID, FindByName, IsStagedSubscription, KNOWN_HOST_CEILING_SECONDS, ResolveTopic,
    ToSubscriptionBinding, ToSubscriptionPolicy, ToTopicBinding, ValidateTopologyRows,
} from '@memberjunction/work-queue-base';
export type { ResolvedTopic, TopologySnapshot } from '@memberjunction/work-queue-base';
export * from './topology/manifest';
export * from './publish/WorkQueuePublishCoordinator';
```

- [ ] **Step 8: Run the tests and build**

Run: `cd packages/WorkQueue/base && pnpm test && pnpm run build`
Expected: PASS — previous base suites plus topology (12, including the per-transport filter-support case); builds.

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — previous suites plus manifest (3) and WorkQueuePublishCoordinator (10).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 9: Commit**

```bash
git add packages/WorkQueue/base/src packages/WorkQueue/engine/src
git commit -m "feat(work-queue): topology bindings and validation in the base tier; manifest and publish coordinator in the engine"
```

---

### Task 12: `StageDeliveries` for staged `Ordered` subscriptions

**Files:**
- Create: `packages/WorkQueue/engine/src/transports/database/stageDeliveries.ts`
- Modify: `packages/WorkQueue/engine/src/transports/database/DatabaseTransportDriver.ts` (method + type re-exports), `src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/stageDeliveries.test.ts`

**Interfaces:**
- Consumes: `CreateWorkQueueSqlBuilder` (Task 6); `MessageInsertOutcomeRow` (Task 3); `ExecuteRows`, `ExecuteWrite`, `ToNumber` (Task 2); `RunInWorkQueueTransaction`, `RetryTransient` (Task 7); `ToMessageInsertRow`, `SameEnvelope`, `DatabaseTransportDriver` (Task 9); from core: `WorkMessage`, `PartitionMode`, `OrderingMode`.
- Produces (the names plan 07's `SqsStager` imports from `engine/src/transports/database/DatabaseTransportDriver.ts`):
  - `interface StageDeliveriesRequest { TopicID: string; SubscriptionID: string; PartitionMode: PartitionMode; OrderingMode: OrderingMode; Messages: WorkMessage[] }`
  - `type StageResult = { MessageID: string; Kind: 'Staged' } | { MessageID: string; Kind: 'AlreadyStaged' } | { MessageID: string; Kind: 'Rejected'; Code: string; Message: string }`
  - `StageDeliveriesInTransaction(executor: WorkQueueSqlExecutor, sql: WorkQueueSqlBuilder, request: StageDeliveriesRequest, contextUser: UserInfo): Promise<StageResult[]>`
  - `DatabaseTransportDriver.StageDeliveries(request: StageDeliveriesRequest): Promise<StageResult[]>`

Staging rules (03 §5.1 plus plan 04 CD5/CD6): the whole batch is one transaction, in array order (receive order). Each message row is inserted once per topic — another staged subscription on the same topic, or an SQS redelivery, reuses the existing row and its `PublishOrdinal`. A reused `MessageID` with a different envelope is `Rejected MessageIDConflict`; a `(Topic, PartitionKey, Sequence)` already taken by another message is `Rejected DuplicateSequence`. The delivery insert is idempotent on `UQ_WorkQueueDelivery_Subscription_Message` (`AlreadyStaged` when zero rows are inserted) and inserts an already-resolved sequence as `Discarded`. For `Ordered` + `ExplicitSequence`, sequence state is ensured before the delivery and the awaiting-sequence flag is cleared after the batch. Any thrown error rolls the whole batch back and propagates (the stager then hides the SQS batch and retries).

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/stageDeliveries.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { WorkMessage } from '@memberjunction/work-queue-core';
import { DatabaseTransportDriver } from '../transports/database/DatabaseTransportDriver';
import type { StageDeliveriesRequest } from '../transports/database/DatabaseTransportDriver';
import { RecordingExecutor, SUBSCRIPTION_ID, TestDeps, TOPIC_ID } from './fakes';

function Message(id: string, overrides: Partial<WorkMessage> = {}): WorkMessage {
    return { MessageID: id, Topic: 'import.ready', PartitionKey: 'venue-42', Attributes: {}, PublishedAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

function Request(messages: WorkMessage[], overrides: Partial<StageDeliveriesRequest> = {}): StageDeliveriesRequest {
    return { TopicID: TOPIC_ID, SubscriptionID: SUBSCRIPTION_ID, PartitionMode: 'Ordered', OrderingMode: 'PublishOrder', Messages: messages, ...overrides };
}

const INSERTED = (id: string, ordinal: number) => ({ Outcome: 'Inserted', ID: id, PublishOrdinal: ordinal, TopicID: null, PartitionKey: null, Sequence: null, Attributes: null, Payload: null, PayloadRef: null, CorrelationID: null });

describe('DatabaseTransportDriver.StageDeliveries', () => {
    it('stages messages in order inside one transaction using the publish ordinal as order key', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([INSERTED('M1', 10)]).QueueRows([{ AffectedRows: 1 }])
            .QueueRows([INSERTED('M2', 11)]).QueueRows([{ AffectedRows: 1 }]);
        const driver = new DatabaseTransportDriver(executor, TestDeps(executor));
        const results = await driver.StageDeliveries(Request([Message('M1'), Message('M2')]));
        expect(results).toEqual([{ MessageID: 'M1', Kind: 'Staged' }, { MessageID: 'M2', Kind: 'Staged' }]);
        expect(executor.Calls[1].Params).toEqual(['M1', SUBSCRIPTION_ID, 'venue-42', 10]);
        expect(executor.Calls[3].Params).toEqual(['M2', SUBSCRIPTION_ID, 'venue-42', 11]);
        expect(executor.Events).toEqual(['independent', 'begin', 'commit', 'release']);
    });

    it('reuses an existing message row and reports a redelivered delivery as AlreadyStaged', async () => {
        const existing = { Outcome: 'Exists', ID: 'M1', PublishOrdinal: '10', TopicID: TOPIC_ID, PartitionKey: 'venue-42', Sequence: null, Attributes: '{}', Payload: null, PayloadRef: null, CorrelationID: null };
        const executor = new RecordingExecutor().QueueRows([existing]).QueueRows([{ AffectedRows: 0 }]);
        const driver = new DatabaseTransportDriver(executor, TestDeps(executor));
        const results = await driver.StageDeliveries(Request([Message('M1')]));
        expect(results).toEqual([{ MessageID: 'M1', Kind: 'AlreadyStaged' }]);
        expect(executor.Calls[1].Params[3]).toBe(10);
    });

    it('rejects a reused ID with a different envelope and a duplicate sequence without inserting deliveries', async () => {
        const conflict = { Outcome: 'Exists', ID: 'M1', PublishOrdinal: '10', TopicID: TOPIC_ID, PartitionKey: 'venue-42', Sequence: null, Attributes: '{"x":"y"}', Payload: null, PayloadRef: null, CorrelationID: null };
        const otherSequence = { ...conflict, ID: 'OTHER', Attributes: '{}', Sequence: '2' };
        const executor = new RecordingExecutor().QueueRows([conflict]).QueueRows([otherSequence]);
        const driver = new DatabaseTransportDriver(executor, TestDeps(executor));
        const results = await driver.StageDeliveries(Request([Message('M1'), Message('M2', { Sequence: 2 })], { OrderingMode: 'ExplicitSequence' }));
        expect(results.map(r => r.Kind === 'Rejected' ? r.Code : r.Kind)).toEqual(['MessageIDConflict', 'DuplicateSequence']);
        expect(executor.Calls).toHaveLength(3);
        expect(executor.Calls[2].SQL).toContain('[AwaitingSequenceSince] = NULL');
    });

    it('ensures sequence state before the delivery and clears a satisfied gap once for explicit sequences', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([INSERTED('M3', 12)]).QueueRows([{ AffectedRows: 0 }]).QueueRows([{ AffectedRows: 1 }]).QueueRows([{ AffectedRows: 1 }]);
        const driver = new DatabaseTransportDriver(executor, TestDeps(executor));
        await driver.StageDeliveries(Request([Message('M3', { Sequence: 3 })], { OrderingMode: 'ExplicitSequence' }));
        expect(executor.Calls[1].SQL).toContain('[WorkQueuePartitionState]');
        expect(executor.Calls[2].Params[3]).toBe(3);
        expect(executor.Calls[3].SQL).toContain('[AwaitingSequenceSince] = NULL');
    });

    it('stores no partition key for None subscriptions', async () => {
        const executor = new RecordingExecutor().QueueRows([INSERTED('M1', 10)]).QueueRows([{ AffectedRows: 1 }]);
        const driver = new DatabaseTransportDriver(executor, TestDeps(executor));
        await driver.StageDeliveries(Request([Message('M1')], { PartitionMode: 'None' }));
        expect(executor.Calls[1].Params[2]).toBeNull();
    });

    it('rolls the batch back and propagates infrastructure errors', async () => {
        const executor = new RecordingExecutor().QueueRows([INSERTED('M1', 10)]).QueueError(new Error('connection reset'));
        const driver = new DatabaseTransportDriver(executor, TestDeps(executor));
        await expect(driver.StageDeliveries(Request([Message('M1')]))).rejects.toThrow('connection reset');
        expect(executor.Events).toEqual(['independent', 'begin', 'rollback', 'release']);
    });

    it('returns an empty result for an empty batch without touching the database', async () => {
        const executor = new RecordingExecutor();
        expect(await new DatabaseTransportDriver(executor, TestDeps(executor)).StageDeliveries(Request([]))).toEqual([]);
        expect(executor.Events).toEqual([]);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test stageDeliveries`
Expected: FAIL — `StageDeliveries` is not a function and `StageDeliveriesRequest` is not exported.

- [ ] **Step 3: Write `src/transports/database/stageDeliveries.ts`**

```typescript
import type { UserInfo } from '@memberjunction/core';
import type { OrderingMode, PartitionMode, WorkMessage } from '@memberjunction/work-queue-core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MessageInsertOutcomeRow } from '../../sql/rows';
import { ExecuteRows, ExecuteWrite, ToNumber } from '../../sql/sqlExecution';
import type { WorkQueueSqlBuilder } from '../../sql/WorkQueueSqlBuilder';
import type { WorkQueueSqlExecutor } from '../../sql/WorkQueueSqlExecutor';
import { SameEnvelope, ToMessageInsertRow } from './deliveryPlan';

export interface StageDeliveriesRequest {
    TopicID: string;
    SubscriptionID: string;
    PartitionMode: PartitionMode;
    OrderingMode: OrderingMode;
    Messages: WorkMessage[];
}

export type StageResult =
    | { MessageID: string; Kind: 'Staged' }
    | { MessageID: string; Kind: 'AlreadyStaged' }
    | { MessageID: string; Kind: 'Rejected'; Code: string; Message: string };

type MessageRowOutcome = { Kind: 'Ordinal'; Ordinal: number } | { Kind: 'Rejected'; Code: string; Message: string };

/** Stages a batch of cloud-received messages into Database delivery rows on an executor that is already in a transaction. */
export async function StageDeliveriesInTransaction(executor: WorkQueueSqlExecutor, sql: WorkQueueSqlBuilder,
                                                   request: StageDeliveriesRequest, contextUser: UserInfo): Promise<StageResult[]> {
    const sequenced = request.PartitionMode === 'Ordered' && request.OrderingMode === 'ExplicitSequence';
    const results: StageResult[] = [];
    for (const message of request.Messages) {
        results.push(await StageOne(executor, sql, request, message, sequenced, contextUser));
    }
    if (sequenced) {
        await ExecuteWrite(executor, sql.Consume.ClearAwaitingSequence(request.SubscriptionID), contextUser);
    }
    return results;
}

async function StageOne(executor: WorkQueueSqlExecutor, sql: WorkQueueSqlBuilder, request: StageDeliveriesRequest,
                        message: WorkMessage, sequenced: boolean, contextUser: UserInfo): Promise<StageResult> {
    const outcome = await InsertOrFindMessage(executor, sql, request.TopicID, message, contextUser);
    if (outcome.Kind === 'Rejected') {
        return { MessageID: message.MessageID, Kind: 'Rejected', Code: outcome.Code, Message: outcome.Message };
    }
    const key = message.PartitionKey;
    if (sequenced && key !== undefined) {
        await ExecuteWrite(executor, sql.Publish.EnsureSequenceState(request.SubscriptionID, key), contextUser);
    }
    const orderKey = request.OrderingMode === 'ExplicitSequence' && message.Sequence !== undefined ? message.Sequence : outcome.Ordinal;
    const inserted = await ExecuteWrite(executor, sql.Publish.InsertDeliveries([{
        MessageID: message.MessageID,
        SubscriptionID: request.SubscriptionID,
        PartitionKey: request.PartitionMode === 'None' ? null : key ?? null,
        OrderKey: orderKey,
    }]), contextUser);
    return { MessageID: message.MessageID, Kind: inserted === 1 ? 'Staged' : 'AlreadyStaged' };
}

async function InsertOrFindMessage(executor: WorkQueueSqlExecutor, sql: WorkQueueSqlBuilder, topicID: string,
                                   message: WorkMessage, contextUser: UserInfo): Promise<MessageRowOutcome> {
    const row = ToMessageInsertRow(message, topicID, null);
    const outcomes = await ExecuteRows<MessageInsertOutcomeRow>(executor, sql.Publish.InsertMessage(row), contextUser);
    const inserted = outcomes.find(o => o.Outcome === 'Inserted');
    const sameID = outcomes.find(o => o.Outcome === 'Exists' && UUIDsEqual(o.ID, message.MessageID));
    const match = inserted ?? (sameID && SameEnvelope(sameID, row) ? sameID : undefined);
    if (match) {
        const ordinal = ToNumber(match.PublishOrdinal);
        if (ordinal === null) {
            throw new Error(`Message ${message.MessageID} has no PublishOrdinal`);
        }
        return { Kind: 'Ordinal', Ordinal: ordinal };
    }
    if (sameID) {
        return { Kind: 'Rejected', Code: 'MessageIDConflict', Message: `MessageID ${message.MessageID} was already stored with a different envelope` };
    }
    const other = outcomes[0];
    return other
        ? { Kind: 'Rejected', Code: 'DuplicateSequence', Message: `Sequence ${message.Sequence ?? ''} for key '${message.PartitionKey ?? ''}' is already held by message ${other.ID}` }
        : { Kind: 'Rejected', Code: 'TransportUnavailable', Message: 'The message insert returned no outcome; retry' };
}
```

A `TransportUnavailable` rejection means a concurrent insert of the same row was not yet visible; the stager treats `Rejected` codes other than `MessageIDConflict`/`DuplicateSequence` as retryable (plan 07).

- [ ] **Step 4: Add the method and type re-exports to `DatabaseTransportDriver.ts`**

Add these imports to `src/transports/database/DatabaseTransportDriver.ts`:

```typescript
import { StageDeliveriesInTransaction } from './stageDeliveries';
import type { StageDeliveriesRequest, StageResult } from './stageDeliveries';

export type { StageDeliveriesRequest, StageResult } from './stageDeliveries';
```

Add this method to `DatabaseTransportDriver`, after `ValidateBindings`:

```typescript
    /** Stages cloud-received messages for a staged Ordered subscription (03 §5.1). One transaction; throws on infrastructure errors. */
    public async StageDeliveries(request: StageDeliveriesRequest): Promise<StageResult[]> {
        if (request.Messages.length === 0) {
            return [];
        }
        return RetryTransient(() => RunInWorkQueueTransaction(this.executor, async tx => ({
            Commit: true,
            Value: await StageDeliveriesInTransaction(tx, this.sql, request, this.deps.ContextUser),
        })));
    }
```

- [ ] **Step 5: Export the new module**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './transports/database/stageDeliveries';
```

- [ ] **Step 6: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — previous suites plus stageDeliveries (7).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 7: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): stage cloud deliveries into Database rows for Ordered subscriptions"
```

---

### Task 13: `WorkQueueEngineBase` (base) and the `WorkQueueEngine` facade (engine)

**Files:**
- Create (**base**): `packages/WorkQueue/base/src/WorkQueueEngineBase.ts`
- Modify (**base**): `packages/WorkQueue/base/src/index.ts`
- Test (**base**): `packages/WorkQueue/base/src/__tests__/WorkQueueEngineBase.test.ts`
- Create (**engine**): `packages/WorkQueue/engine/src/engine/driverResolution.ts`, `src/engine/PublishListenerSet.ts`
- Create (**engine**): `packages/WorkQueue/engine/src/WorkQueueEngine.ts`
- Modify (**engine**): `packages/WorkQueue/engine/src/index.ts`
- Test (**engine**): `packages/WorkQueue/engine/src/__tests__/driverResolution.test.ts`, `src/__tests__/PublishListenerSet.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–12; generated `MJWorkQueueTransportEntity`, `MJWorkQueueTopicEntity`, `MJWorkQueueSubscriptionEntity`; `BaseEngine`, `BaseEnginePropertyConfig`, `BaseSingleton`, `IMetadataProvider`, `UserInfo` from `@memberjunction/core` / `@memberjunction/global`; `MJGlobal`, `NormalizeUUID` from `@memberjunction/global`; from core: `IWorkPublisher`, `ITransportDriver`, `ITransportOperator`, `TopicBinding`, `SubscriptionBinding`, `SubscriptionPolicy`, `FilterSupport`, `SubscriptionFilter`, `BindingValidationIssue`, `TransportCapabilities`, `TopologyManifest`, `BindingImport`, `PublishRequest`, `PublishResult`, `WorkJson`, `WorkQueueConfigurationError`.
- Produces (base — `@memberjunction/work-queue-base`):
  - `class WorkQueueEngineBase extends BaseEngine<WorkQueueEngineBase>` (03 §11): `static Instance`, `Config(forceRefresh?, contextUser?, provider?)`, `Transports`, `Topics`, `Subscriptions`, `GetTopicByName`, `GetSubscriptionByName`, `SubscriptionsForTopic(topicID)`, `BuildTopicBinding(topic)`, `BuildSubscriptionBinding(subscription, support?)`, `BuildSubscriptionPolicy(subscription)`, `ParseFilter(subscription, support)`, `IsStagedToDatabase(subscription)`, `ValidateTopologyRows(capabilitiesByDriverClass: Record<string, TransportCapabilities>)`, plus `get Snapshot(): TopologySnapshot` for the server tier
- Produces (engine):
  - `DriverCacheKey(transport: TransportRow): string`, `ResolveDriverFactory(driverClass: string): BaseTransportDriverFactory`
  - `class ListenerSet<TEvent> { constructor(label: string); Add(listener: (event: TEvent) => void): () => void; Notify(event: TEvent): void; get Count(): number }` and `class PublishListenerSet extends ListenerSet<string>` (the engine also holds a `ListenerSet<DeadLetteredEvent>` for `OnDeadLettered`)
  - `interface WorkQueuePublishOptions { ContextUser: UserInfo; Provider?: IMetadataProvider; External?: boolean }`
  - `class WorkQueueEngine extends BaseSingleton<WorkQueueEngine> implements IWorkPublisher` — a **facade** over `WorkQueueEngineBase.Instance` (composition, not inheritance, exactly like `AIEngine`/`AIEngineBase`), with the full 03 §11 surface: `static Instance`, `get Metadata(): WorkQueueEngineBase`, `Config(forceRefresh?, contextUser?, provider?)`, delegated `Transports`, `Topics`, `Subscriptions`, `GetTopicByName`, `GetSubscriptionByName`, `SubscriptionsForTopic`, `BuildTopicBinding`, `BuildSubscriptionBinding`, `IsStagedToDatabase`, `Loaded`, `ContextUser`, plus server-only `GetDriver(transportID)`, `GetDatabaseDriver()`, `GetOperator(subscription)`, `ValidateTopology()`, `PublishAs`, `Publish`, `ExportManifest(transportName)`, `ImportBindings(bindings, contextUser)`, `OnPublished(listener)`, `OnDeadLettered(listener)` and `GetBacklog(subscriptionName)`

**Why a facade and not a subclass** (`packages/AI/BaseAIEngine/src/BaseAIEngine.ts` carries the same rationale):
`BaseEngine<T>` is a singleton keyed on its own type, so a server subclass would give a *second* cache of the same
three entities. The metadata tier is loaded once, in the base, and the server engine proxies it — which also lets
Explorer and the operator dashboard load topology with no server-only dependency. **When you add a public member to
`WorkQueueEngineBase`, add its one-line delegate to `WorkQueueEngine`**, or server call sites fail to compile.

Engine rules: the engine requires a server-side provider that satisfies `WorkQueueExecutorSource` (`DatabaseProviderBase` does); a browser provider raises `WorkQueueConfigurationError`. Drivers are cached per transport and rebuilt when the transport's `DriverClass`, `Configuration`, `CredentialID` or `Status` change. `GetOperator` returns the Database operator for Database topics **and** staged subscriptions (03 §5.2), otherwise the transport driver's operator. `Publish` (two-argument) publishes as the engine's context user, which is the system user server-side (`BaseEngine.ContextUser`). `PublishAs` enlists in the caller's transaction when `options.Provider` satisfies `WorkQueueTransactionalExecutor`. `ImportBindings` saves each binding through the entity (so validation and cache invalidation run), refreshes the engine, and returns import issues plus `ValidateTopology()` issues.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/driverResolution.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { DriverCacheKey, ResolveDriverFactory } from '../engine/driverResolution';
import { DatabaseTransportDriverFactory } from '../transports/database/DatabaseTransportDriverFactory';
import { TRANSPORT_ROW } from './fakes';

describe('DriverCacheKey', () => {
    it('changes when anything that shapes the driver changes', () => {
        const base = DriverCacheKey(TRANSPORT_ROW);
        expect(DriverCacheKey({ ...TRANSPORT_ROW })).toBe(base);
        expect(DriverCacheKey({ ...TRANSPORT_ROW, Configuration: '{"Region":"x"}' })).not.toBe(base);
        expect(DriverCacheKey({ ...TRANSPORT_ROW, CredentialID: 'C1' })).not.toBe(base);
        expect(DriverCacheKey({ ...TRANSPORT_ROW, Status: 'Disabled' })).not.toBe(base);
        expect(DriverCacheKey({ ...TRANSPORT_ROW, Name: 'Renamed' })).toBe(base);
    });
});

describe('ResolveDriverFactory', () => {
    it('resolves the registered Database factory', () => {
        expect(ResolveDriverFactory('Database')).toBeInstanceOf(DatabaseTransportDriverFactory);
    });

    it('names the registered keys when a driver class is unknown', () => {
        expect(() => ResolveDriverFactory('Nope')).toThrow(WorkQueueConfigurationError);
        expect(() => ResolveDriverFactory('Nope')).toThrow("Registered: 'Database'");
    });
});
```

`packages/WorkQueue/engine/src/__tests__/PublishListenerSet.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ListenerSet, PublishListenerSet } from '../engine/PublishListenerSet';

describe('ListenerSet', () => {
    it('carries typed events, so the engine can fan out dead-letter notifications', () => {
        const set = new ListenerSet<{ DeliveryID: string; Reason: string }>('dead-letter');
        const seen: string[] = [];
        set.Add(event => seen.push(`${event.DeliveryID}:${event.Reason}`));
        set.Notify({ DeliveryID: 'd1', Reason: 'MaxAttemptsExceeded' });
        expect(seen).toEqual(['d1:MaxAttemptsExceeded']);
    });
});

describe('PublishListenerSet', () => {
    it('notifies every listener and supports unsubscribe', () => {
        const set = new PublishListenerSet();
        const seen: string[] = [];
        const off = set.Add(name => seen.push(`a:${name}`));
        set.Add(name => seen.push(`b:${name}`));
        set.Notify('email.events');
        off();
        set.Notify('import.ready');
        expect(seen).toEqual(['a:email.events', 'b:email.events', 'b:import.ready']);
        expect(set.Count).toBe(1);
    });

    it('isolates a throwing listener from the others', () => {
        const set = new PublishListenerSet();
        const seen: string[] = [];
        set.Add(() => { throw new Error('boom'); });
        set.Add(name => seen.push(name));
        expect(() => set.Notify('t')).not.toThrow();
        expect(seen).toEqual(['t']);
    });
});
```

`ResolveDriverFactory('Database')` resolves because importing `DatabaseTransportDriverFactory` in the test runs its `@RegisterClass` decorator. If a later plan registers more factories in the same test process (plan 07 adds `AWS`), relax the second assertion to `toThrow("Registered:")`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test driverResolution PublishListenerSet`
Expected: FAIL — unresolved imports under `../engine/`.

The engine's own wiring of these two seams is covered in Step 6 below: `OnDeadLettered` receives what
`TransportDriverDeps.NotifyDeadLettered` reports (explicit dead-letter settles and lease-expiry dead-letters, Task 9),
and `GetBacklog` delegates to `DatabaseTransportOperator.GetBacklog` for Database and staged subscriptions while
cloud-hosted ones answer `Supported: false`.

- [ ] **Step 3: Write `src/engine/driverResolution.ts`**

```typescript
import { MJGlobal } from '@memberjunction/global';
import type { TransportRow } from '@memberjunction/work-queue-base';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { BaseTransportDriverFactory } from '../transports/BaseTransportDriverFactory';

/** Identity of everything that shapes a driver instance; a change rebuilds the cached driver. */
export function DriverCacheKey(transport: TransportRow): string {
    return JSON.stringify([transport.DriverClass, transport.Configuration ?? '', transport.CredentialID ?? '', transport.Status]);
}

/** Resolves the registered factory for a transport DriverClass, naming the known keys when it is missing. */
export function ResolveDriverFactory(driverClass: string): BaseTransportDriverFactory {
    const resolution = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTransportDriverFactory>(BaseTransportDriverFactory, driverClass);
    if (resolution.Resolved && resolution.Instance) {
        return resolution.Instance;
    }
    const keys = Array.from(new Set(
        MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseTransportDriverFactory)
            .map(r => r.Key)
            .filter((k): k is string => k != null),
    )).sort();
    const known = keys.length > 0 ? keys.map(k => `'${k}'`).join(', ') : '(none)';
    throw new WorkQueueConfigurationError(
        `No work-queue transport driver is registered for DriverClass '${driverClass}'. Registered: ${known}. ` +
        'Add the driver package to the server and regenerate the class-registration manifest.',
    );
}
```

- [ ] **Step 4: Write `src/engine/PublishListenerSet.ts`**

```typescript
import { LogError } from '@memberjunction/core';

/** In-process fan-out to listeners; one bad listener never breaks the others or the caller. */
export class ListenerSet<TEvent> {
    private readonly listeners = new Set<(event: TEvent) => void>();

    constructor(private readonly label: string) {}

    public Add(listener: (event: TEvent) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    public Notify(event: TEvent): void {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (error) {
                LogError(`[WorkQueue] ${this.label} listener failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    public get Count(): number {
        return this.listeners.size;
    }
}

/** "Something was published to topic X" listeners, used to wake local consumers immediately (plan 06 host kick). */
export class PublishListenerSet extends ListenerSet<string> {
    constructor() {
        super('publish');
    }
}
```

- [ ] **Step 4b: Write `packages/WorkQueue/base/src/WorkQueueEngineBase.ts`**

```typescript
import { BaseEngine } from '@memberjunction/core';
import type { BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { WORK_QUEUE_FILTER_SUPPORT, WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type {
    BindingValidationIssue, FilterSupport, SubscriptionBinding, SubscriptionFilter, SubscriptionPolicy,
    TopicBinding, TransportCapabilities,
} from '@memberjunction/work-queue-core';
import { WorkQueueEntityNames } from './constants';
import {
    FindByID, FindByName, IsStagedSubscription, ToSubscriptionBinding, ToSubscriptionPolicy, ToTopicBinding,
} from './topology/bindings';
import type { TopologySnapshot } from './topology/bindings';
import { ValidateTopologyRows } from './topology/validateTopology';

/**
 * Browser-safe metadata tier for the work queue (03 §11): the cached topology plus the pure derivations over it.
 * The server tier (`WorkQueueEngine`, plan 05 Task 13) delegates to this instance; Explorer and the operator
 * dashboard use it directly, with no drivers, SQL or Node dependencies.
 */
export class WorkQueueEngineBase extends BaseEngine<WorkQueueEngineBase> {
    public static get Instance(): WorkQueueEngineBase {
        return super.getInstance<WorkQueueEngineBase>();
    }

    private _Transports: MJWorkQueueTransportEntity[] = [];
    private _Topics: MJWorkQueueTopicEntity[] = [];
    private _Subscriptions: MJWorkQueueSubscriptionEntity[] = [];

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            { Type: 'entity', EntityName: WorkQueueEntityNames.Transports, PropertyName: '_Transports', CacheLocal: true },
            { Type: 'entity', EntityName: WorkQueueEntityNames.Topics, PropertyName: '_Topics', CacheLocal: true },
            { Type: 'entity', EntityName: WorkQueueEntityNames.Subscriptions, PropertyName: '_Subscriptions', CacheLocal: true },
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    public get Transports(): MJWorkQueueTransportEntity[] {
        return this.GetConfigData<MJWorkQueueTransportEntity>('_Transports');
    }

    public get Topics(): MJWorkQueueTopicEntity[] {
        return this.GetConfigData<MJWorkQueueTopicEntity>('_Topics');
    }

    public get Subscriptions(): MJWorkQueueSubscriptionEntity[] {
        return this.GetConfigData<MJWorkQueueSubscriptionEntity>('_Subscriptions');
    }

    /** The row view the pure topology helpers work over. */
    public get Snapshot(): TopologySnapshot {
        return { Transports: this.Transports, Topics: this.Topics, Subscriptions: this.Subscriptions };
    }

    public GetTopicByName(name: string): MJWorkQueueTopicEntity | undefined {
        return FindByName(this.Topics, name);
    }

    public GetSubscriptionByName(name: string): MJWorkQueueSubscriptionEntity | undefined {
        return FindByName(this.Subscriptions, name);
    }

    public SubscriptionsForTopic(topicID: string): MJWorkQueueSubscriptionEntity[] {
        return this.Subscriptions.filter(s => UUIDsEqual(s.TopicID, topicID));
    }

    public BuildTopicBinding(topic: MJWorkQueueTopicEntity): TopicBinding {
        return ToTopicBinding(topic);
    }

    public BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity,
                                    support: FilterSupport = WORK_QUEUE_FILTER_SUPPORT): SubscriptionBinding {
        return ToSubscriptionBinding(subscription, this.TopicOf(subscription), support);
    }

    public BuildSubscriptionPolicy(subscription: MJWorkQueueSubscriptionEntity): SubscriptionPolicy {
        return ToSubscriptionPolicy(subscription, this.TopicOf(subscription));
    }

    /** Parses the subscription's CompositeFilterDescriptor JSON against the transport's supported subset (03 §4). */
    public ParseFilter(subscription: MJWorkQueueSubscriptionEntity, support: FilterSupport): SubscriptionFilter | null {
        return ToSubscriptionBinding(subscription, this.TopicOf(subscription), support).Filter;
    }

    public IsStagedToDatabase(subscription: MJWorkQueueSubscriptionEntity): boolean {
        return IsStagedSubscription(subscription, this.TransportOf(this.TopicOf(subscription)));
    }

    /**
     * Validates the cached topology against capabilities supplied per `Transport.DriverClass` (03 §11). The server
     * engine resolves real drivers per transport and calls `ValidateTopologyRows` directly so that one unresolvable
     * transport is reported as an Error rather than failing the whole pass.
     */
    public ValidateTopologyRows(capabilitiesByDriverClass: Record<string, TransportCapabilities>): BindingValidationIssue[] {
        const byTransport = new Map<string, TransportCapabilities | Error>();
        for (const transport of this.Transports) {
            const caps = capabilitiesByDriverClass[transport.DriverClass];
            byTransport.set(transport.ID.toLowerCase(),
                caps ?? new Error(`No capabilities supplied for DriverClass '${transport.DriverClass}'`));
        }
        return ValidateTopologyRows(this.Snapshot, byTransport);
    }

    public TopicOf(subscription: MJWorkQueueSubscriptionEntity): MJWorkQueueTopicEntity {
        const topic = FindByID(this.Topics, subscription.TopicID);
        if (!topic) {
            throw new WorkQueueConfigurationError(`Subscription '${subscription.Name}' references a topic that does not exist`);
        }
        return topic;
    }

    public TransportOf(topic: MJWorkQueueTopicEntity): MJWorkQueueTransportEntity {
        const transport = FindByID(this.Transports, topic.TransportID);
        if (!transport) {
            throw new WorkQueueConfigurationError(`Topic '${topic.Name}' references a transport that does not exist`);
        }
        return transport;
    }
}
```

`packages/WorkQueue/base/src/__tests__/WorkQueueEngineBase.test.ts` covers only what does not need a provider —
the derivations over an injected snapshot. Load a fake by assigning the private arrays through a small helper:

```typescript
import { describe, it, expect } from 'vitest';
import { WorkQueueEngineBase } from '../WorkQueueEngineBase';
import {
    SUBSCRIPTION_ROW_FIXTURE, TOPIC_ROW_FIXTURE, TRANSPORT_ROW_FIXTURE,
} from '../testing/rowFixtures';

/** Seeds the engine's caches without a provider; BaseEngine exposes them through GetConfigData. */
function Seed(engine: WorkQueueEngineBase): void {
    const anyEngine = engine as unknown as Record<string, unknown>;
    anyEngine._Transports = [TRANSPORT_ROW_FIXTURE];
    anyEngine._Topics = [TOPIC_ROW_FIXTURE];
    anyEngine._Subscriptions = [SUBSCRIPTION_ROW_FIXTURE];
}

describe('WorkQueueEngineBase', () => {
    it('looks up topics and subscriptions by trimmed, case-insensitive name', () => {
        const engine = WorkQueueEngineBase.Instance;
        Seed(engine);
        expect(engine.GetTopicByName(' IMPORT.READY ')?.Name).toBe('import.ready');
        expect(engine.GetSubscriptionByName('VENUE-IMPORT')?.Name).toBe('venue-import');
        expect(engine.SubscriptionsForTopic(TOPIC_ROW_FIXTURE.ID)).toHaveLength(1);
    });

    it('builds bindings and reports staging for cloud Ordered subscriptions', () => {
        const engine = WorkQueueEngineBase.Instance;
        Seed(engine);
        expect(engine.BuildSubscriptionBinding(engine.Subscriptions[0]).Policy.PartitionMode).toBe('Ordered');
        expect(engine.IsStagedToDatabase(engine.Subscriptions[0])).toBe(false);
    });
});
```

If `GetConfigData` refuses values that were not loaded through `Load`, seed instead with the provider fake the
engine suites already use, or drop to testing the pure helpers directly (they are covered in Task 11) — do not
loosen `BaseEngine`.

- [ ] **Step 5: Write `packages/WorkQueue/engine/src/WorkQueueEngine.ts` (the facade)**

```typescript
import { randomUUID } from 'node:crypto';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import { BaseSingleton } from '@memberjunction/global';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type {
    BindingImport, BindingValidationIssue, ITransportDriver, ITransportOperator, IWorkPublisher, PublishRequest,
    PublishResult, SubscriptionBinding, TopicBinding, TopologyManifest, TransportCapabilities, WorkJson,
} from '@memberjunction/work-queue-core';
import { NormalizeUUID } from '@memberjunction/global';
import { WorkQueueEngineBase } from '@memberjunction/work-queue-base';
import { DATABASE_DRIVER_CLASS, WorkQueueEntityNames } from './constants';
import { DeduplicationLedger } from './dedup/DeduplicationLedger';
import { DriverCacheKey, ResolveDriverFactory } from './engine/driverResolution';
import { ListenerSet, PublishListenerSet } from './engine/PublishListenerSet';
import { DatabaseTransportOperator } from './transports/database/DatabaseTransportOperator';
import type { DeadLetteredEvent } from './transports/TransportDriverDeps';
import { MJWorkLogger } from './logging/MJWorkLogger';
import { WorkQueuePublishCoordinator } from './publish/WorkQueuePublishCoordinator';
import { IsWorkQueueExecutorSource, IsWorkQueueTransactionalExecutor } from './sql/WorkQueueSqlExecutor';
import type { WorkQueueExecutorSource } from './sql/WorkQueueSqlExecutor';
import { FindByID, ResolveTopic, ValidateTopologyRows } from '@memberjunction/work-queue-base';
import type { TopologySnapshot } from '@memberjunction/work-queue-base';
import { BuildTopologyManifest, PlanBindingImport } from './topology/manifest';
import type { BindingUpdate } from './topology/manifest';
import { DatabaseTransportDriver } from './transports/database/DatabaseTransportDriver';
import type { TransportDriverDeps } from './transports/TransportDriverDeps';

export interface WorkQueuePublishOptions {
    ContextUser: UserInfo;
    Provider?: IMetadataProvider;
    External?: boolean;
}

interface CachedDriver {
    Key: string;
    Driver: Promise<ITransportDriver>;
}

/**
 * Server tier: the in-process publisher, driver registry and operator entry point (03 §11).
 *
 * 🚨 THIS CLASS IS A FACADE, NOT A SUBCLASS. Metadata lives in `WorkQueueEngineBase` (browser-safe) and is reached
 * through the delegates below — the same arrangement as `AIEngine`/`AIEngineBase`. Add a public member to
 * `WorkQueueEngineBase` and you must add its one-line delegate here, or server callers stop compiling.
 */
export class WorkQueueEngine extends BaseSingleton<WorkQueueEngine> implements IWorkPublisher {
    public static get Instance(): WorkQueueEngine {
        return super.getInstance<WorkQueueEngine>();
    }

    private _provider: IMetadataProvider | null = null;
    private readonly drivers = new Map<string, CachedDriver>();
    private readonly listeners = new PublishListenerSet();
    private readonly deadLetterListeners = new ListenerSet<DeadLetteredEvent>('dead-letter');
    private readonly log = new MJWorkLogger();
    private databaseDriver: DatabaseTransportDriver | null = null;

    /** The metadata tier this facade delegates to. */
    public get Metadata(): WorkQueueEngineBase {
        return WorkQueueEngineBase.Instance;
    }

    /** Loads (or refreshes) the metadata tier and remembers the provider the server side runs against. */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        if (provider) {
            this._provider = provider;
        }
        await this.Metadata.Config(forceRefresh ?? false, contextUser, provider);
    }

    // ── Delegated metadata surface (add a delegate here for every new WorkQueueEngineBase member) ──
    public get Loaded(): boolean { return this.Metadata.Loaded; }
    public get ContextUser(): UserInfo { return this.Metadata.ContextUser; }
    public get Transports(): MJWorkQueueTransportEntity[] { return this.Metadata.Transports; }
    public get Topics(): MJWorkQueueTopicEntity[] { return this.Metadata.Topics; }
    public get Subscriptions(): MJWorkQueueSubscriptionEntity[] { return this.Metadata.Subscriptions; }
    public GetTopicByName(name: string): MJWorkQueueTopicEntity | undefined { return this.Metadata.GetTopicByName(name); }
    public GetSubscriptionByName(name: string): MJWorkQueueSubscriptionEntity | undefined { return this.Metadata.GetSubscriptionByName(name); }
    public SubscriptionsForTopic(topicID: string): MJWorkQueueSubscriptionEntity[] { return this.Metadata.SubscriptionsForTopic(topicID); }
    public BuildTopicBinding(topic: MJWorkQueueTopicEntity): TopicBinding { return this.Metadata.BuildTopicBinding(topic); }
    public BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity): SubscriptionBinding { return this.Metadata.BuildSubscriptionBinding(subscription); }
    public IsStagedToDatabase(subscription: MJWorkQueueSubscriptionEntity): boolean { return this.Metadata.IsStagedToDatabase(subscription); }

    public OnPublished(listener: (topicName: string) => void): () => void {
        return this.listeners.Add(listener);
    }

    /** Alerting seam (03 §11): fires for Database and staged subscriptions when a delivery is dead-lettered. */
    public OnDeadLettered(listener: (event: DeadLetteredEvent) => void): () => void {
        return this.deadLetterListeners.Add(listener);
    }

    /**
     * Autoscaler metric (03 §11). Database and staged subscriptions report real counts; cloud-hosted subscriptions
     * answer `Supported: false` (scale those from the transport's own metrics).
     */
    public async GetBacklog(subscriptionName: string): Promise<{ Supported: boolean; Claimable: number; InFlight: number; Total: number }> {
        const subscription = this.GetSubscriptionByName(subscriptionName);
        if (!subscription) {
            throw new WorkQueueConfigurationError(`Work-queue subscription '${subscriptionName}' does not exist`);
        }
        const operator = await this.GetOperator(subscription);
        if (!(operator instanceof DatabaseTransportOperator)) {
            return { Supported: false, Claimable: 0, InFlight: 0, Total: 0 };
        }
        const counts = await operator.GetBacklog(this.BuildSubscriptionBinding(subscription));
        return { Supported: true, ...counts, Total: counts.Claimable + counts.InFlight };
    }

    public async GetDriver(transportID: string): Promise<ITransportDriver> {
        const transport = FindByID(this.Transports, transportID);
        if (!transport) {
            throw new WorkQueueConfigurationError(`Work-queue transport ${transportID} does not exist`);
        }
        const cacheID = NormalizeUUID(transport.ID);
        const key = DriverCacheKey(transport);
        const cached = this.drivers.get(cacheID);
        if (cached && cached.Key === key) {
            return cached.Driver;
        }
        const driver = ResolveDriverFactory(transport.DriverClass).Create(transport, this.DriverDeps());
        this.drivers.set(cacheID, { Key: key, Driver: driver });
        driver.catch(() => this.drivers.delete(cacheID));
        return driver;
    }

    /** The Database driver over this engine's provider, used for Database topics and staged subscriptions. */
    public async GetDatabaseDriver(): Promise<DatabaseTransportDriver> {
        this.databaseDriver ??= new DatabaseTransportDriver(this.Executor, this.DriverDeps());
        return this.databaseDriver;
    }

    public async GetOperator(subscription: MJWorkQueueSubscriptionEntity): Promise<ITransportOperator> {
        const transport = this.Metadata.TransportOf(this.Metadata.TopicOf(subscription));
        if (transport.DriverClass === DATABASE_DRIVER_CLASS || this.Metadata.IsStagedToDatabase(subscription)) {
            return (await this.GetDatabaseDriver()).Operator();
        }
        return (await this.GetDriver(transport.ID)).Operator();
    }

    public async ValidateTopology(): Promise<BindingValidationIssue[]> {
        const capabilities = new Map<string, TransportCapabilities | Error>();
        for (const transport of this.Transports) {
            try {
                capabilities.set(NormalizeUUID(transport.ID), (await this.GetDriver(transport.ID)).Capabilities);
            } catch (error) {
                capabilities.set(NormalizeUUID(transport.ID), error instanceof Error ? error : new Error(String(error)));
            }
        }
        return ValidateTopologyRows(this.Snapshot, capabilities);
    }

    public PublishAs<T extends WorkJson>(topic: string, requests: PublishRequest<T>[], options: WorkQueuePublishOptions): Promise<PublishResult[]> {
        const provider = options.Provider;
        const coordinator = new WorkQueuePublishCoordinator({
            ResolveTopic: name => ResolveTopic(this.Snapshot, name),
            GetDriver: transportID => this.DriverForPublish(transportID),
            Executor: this.Executor,
            CreateLedger: executor => new DeduplicationLedger(executor, options.ContextUser),
            NewID: () => randomUUID(),
            Now: () => new Date(),
            NotifyPublished: name => this.listeners.Notify(name),
            Log: this.log,
        });
        return coordinator.Publish(topic, requests, {
            UserID: options.ContextUser?.ID ?? null,
            External: options.External === true,
            CallerExecutor: provider && IsWorkQueueTransactionalExecutor(provider) ? provider : null,
        });
    }

    public Publish<T extends WorkJson>(topic: string, requests: PublishRequest<T>[]): Promise<PublishResult[]> {
        return this.PublishAs(topic, requests, { ContextUser: this.ContextUser });
    }

    public ExportManifest(transportName: string): TopologyManifest {
        return BuildTopologyManifest(this.Snapshot, transportName, new Date());
    }

    public async ImportBindings(bindings: BindingImport, contextUser: UserInfo): Promise<BindingValidationIssue[]> {
        const plan = PlanBindingImport(this.Snapshot, bindings);
        const issues = [...plan.Issues];
        for (const update of plan.TopicUpdates) {
            issues.push(...await this.SaveBinding(WorkQueueEntityNames.Topics, update, contextUser));
        }
        for (const update of plan.SubscriptionUpdates) {
            issues.push(...await this.SaveBinding(WorkQueueEntityNames.Subscriptions, update, contextUser));
        }
        await this.Config(true, contextUser, this.ProviderToUse);
        this.drivers.clear();
        this.databaseDriver = null;
        issues.push(...await this.ValidateTopology());
        return issues;
    }

    private get Snapshot(): TopologySnapshot {
        return this.Metadata.Snapshot;
    }

    /** The server provider: the one Config() was given, else the metadata tier's. */
    public get ProviderToUse(): IMetadataProvider {
        return this._provider ?? this.Metadata.ProviderToUse;
    }

    private get Executor(): WorkQueueExecutorSource {
        const provider = this.ProviderToUse;
        if (!IsWorkQueueExecutorSource(provider)) {
            throw new WorkQueueConfigurationError('WorkQueueEngine requires a server-side database provider (DatabaseProviderBase)');
        }
        return provider;
    }

    private DriverDeps(): TransportDriverDeps {
        return {
            ContextUser: this.ContextUser, Executor: this.Executor, Log: this.log,
            NotifyDeadLettered: event => this.deadLetterListeners.Notify(event),
        };
    }

    private async DriverForPublish(transportID: string): Promise<ITransportDriver> {
        const transport = FindByID(this.Transports, transportID);
        return transport?.DriverClass === DATABASE_DRIVER_CLASS ? this.GetDatabaseDriver() : this.GetDriver(transportID);
    }

    private async SaveBinding(entityName: string, update: BindingUpdate, contextUser: UserInfo): Promise<BindingValidationIssue[]> {
        const entity = entityName === WorkQueueEntityNames.Topics
            ? await this.ProviderToUse.GetEntityObject<MJWorkQueueTopicEntity>(entityName, contextUser)
            : await this.ProviderToUse.GetEntityObject<MJWorkQueueSubscriptionEntity>(entityName, contextUser);
        if (!(await entity.Load(update.ID))) {
            return [{ Severity: 'Error', Subject: update.Name, Message: `Could not load ${entityName} ${update.ID}` }];
        }
        entity.BindingConfig = update.BindingConfig;
        if (await entity.Save()) {
            return [];
        }
        return [{ Severity: 'Error', Subject: update.Name, Message: entity.LatestResult?.CompleteMessage ?? 'Save failed' }];
    }
}
```

Two provider-level notes, verified against `packages/MJCore/src/generic/databaseProviderBase.ts`: `CreateIndependentInstance` shares the pool and metadata but owns a transaction stack, and `BeginEntityTransaction` joins an open transaction with a savepoint — together they let concurrent publishes and claims share the long-lived server provider without interleaving transactions.

`BaseSingleton` gives the facade its `Instance` but no loading machinery, so `Loaded`, `ContextUser` and
`ProviderToUse` come from the metadata tier (or, for the provider, from whatever `Config()` was handed). Anything
that reaches the database goes through `Executor`, which refuses a browser provider.

- [ ] **Step 6: Export the new modules**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './engine/driverResolution';
export * from './engine/PublishListenerSet';
export * from './WorkQueueEngine';
export { WorkQueueEngineBase } from '@memberjunction/work-queue-base';
```

- [ ] **Step 7: Run the tests and build**

Run: `cd packages/WorkQueue/base && pnpm test && pnpm run build`
Expected: PASS — previous base suites plus WorkQueueEngineBase (2); builds.

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — previous suites plus driverResolution (3) and PublishListenerSet (2).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds. The engine has no unit test of its own: its logic lives in the tested helpers (`ResolveTopic`, `ValidateTopologyRows`, `WorkQueuePublishCoordinator`, `PlanBindingImport`, `DriverCacheKey`), and it runs end to end against a live database through Task 14's harness and plan 06's integration bundle.

- [ ] **Step 8: Commit**

```bash
git add packages/WorkQueue/base/src packages/WorkQueue/engine/src
git commit -m "feat(work-queue): WorkQueueEngineBase metadata tier and the server WorkQueueEngine facade"
```

---

### Task 14: Database conformance harness, filter parity, full build and changeset

**Files:**
- Create: `packages/WorkQueue/engine/src/testing/DatabaseConformanceHarness.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/DatabaseConformanceHarness.test.ts`, `src/__tests__/filterParity.test.ts`
- Create: `.changeset/work-queue-native-data-layer.md`

**Interfaces:**
- Consumes: `DatabaseTransportDriver`, `DATABASE_TRANSPORT_CAPABILITIES` (Task 9); `ToTopicBinding`, `ToSubscriptionBinding` (Task 11); `CreateWorkQueueSqlBuilder` (Task 6); `ExecuteWrite`, `QualifiedTable`, `SqlParamList` (Task 2); `WorkQueueTables`, `WorkQueueEntityNames` (Task 2); `MJWorkLogger` (Task 10); type-only from `@memberjunction/work-queue-core/testing` (plan 04 Task 8): `ConformanceHarness`, `ConformanceTraits`, `SubscriptionBindingOverrides`.
- Produces:
  - `DATABASE_CONFORMANCE_TRAITS: ConformanceTraits` = `{ ReleaseConsumesAttempt: false, ExpiredLeaseDeadLetters: true, ReceiveWaitSeconds: 0 }`
  - `SecondsToShift(ms: number): number`
  - `type ConformanceProvider = WorkQueueExecutorSource & Pick<IMetadataProvider, 'GetEntityObject'>`
  - `interface DatabaseConformanceHarness extends ConformanceHarness { Cleanup(): Promise<void> }`
  - `CreateDatabaseConformanceHarness(provider: ConformanceProvider, contextUser: UserInfo, transportID?: string): Promise<DatabaseConformanceHarness>` — plan 06's integration bundle runs `RunTransportConformanceSuite('Database', harness)` or its own runner against it

The harness writes real topic and subscription rows (the Database driver needs the foreign keys) on the seeded `Database` transport, `HostType = 'MJWorker'`, `HandlerKey = 'WorkQueueConformance'`. `AdvanceTime(ms)` cannot move the database clock, so it shifts each harness subscription's `VisibleAt` and `LeaseExpiresAt` back by `ceil(ms / 1000)` seconds. `Cleanup()` deletes the harness's deliveries, partition states, messages, deduplication rows, subscriptions and topics; `Dispose` is a no-op so one cleanup at the end of the suite removes everything. Type-only imports from `/testing` keep Vitest out of the engine's runtime bundle.

- [ ] **Step 1: Write the failing test**

`packages/WorkQueue/engine/src/__tests__/DatabaseConformanceHarness.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DATABASE_CONFORMANCE_TRAITS, SecondsToShift } from '../testing/DatabaseConformanceHarness';

describe('Database conformance harness helpers', () => {
    it('declares Database transport traits', () => {
        expect(DATABASE_CONFORMANCE_TRAITS).toEqual({ ReleaseConsumesAttempt: false, ExpiredLeaseDeadLetters: true, ReceiveWaitSeconds: 0 });
    });

    it('rounds elapsed milliseconds up to whole seconds and never shifts by less than one', () => {
        expect(SecondsToShift(1)).toBe(1);
        expect(SecondsToShift(1000)).toBe(1);
        expect(SecondsToShift(1001)).toBe(2);
        expect(SecondsToShift(0)).toBe(1);
    });
});
```

The harness's database behaviour is verified against a live database by plan 06's integration bundle; this unit test covers the pure pieces.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/WorkQueue/engine && pnpm test DatabaseConformanceHarness`
Expected: FAIL — unresolved import `../testing/DatabaseConformanceHarness`.

- [ ] **Step 3: Write `src/testing/DatabaseConformanceHarness.ts`**

```typescript
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity } from '@memberjunction/core-entities';
import type { ITransportDriver, SubscriptionBinding, TopicBinding } from '@memberjunction/work-queue-core';
import type { ConformanceHarness, ConformanceTraits, SubscriptionBindingOverrides } from '@memberjunction/work-queue-core/testing';
import { WorkQueueEntityNames, WorkQueueTables } from '../constants';
import type { WorkQueueTableName } from '../constants';
import { MJWorkLogger } from '../logging/MJWorkLogger';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import { SqlParamList } from '../sql/SqlParamList';
import { ExecuteWrite, QualifiedTable } from '../sql/sqlExecution';
import type { WorkQueueExecutorSource } from '../sql/WorkQueueSqlExecutor';
import { ToSubscriptionBinding, ToTopicBinding } from '@memberjunction/work-queue-base';
import { DATABASE_TRANSPORT_CAPABILITIES } from '../transports/database/databaseCapabilities';
import { DatabaseTransportDriver } from '../transports/database/DatabaseTransportDriver';

export const DATABASE_CONFORMANCE_TRAITS: ConformanceTraits = {
    ReleaseConsumesAttempt: false,
    ExpiredLeaseDeadLetters: true,
    ReceiveWaitSeconds: 0,
};

/** The seeded Database transport (plan 05 Task 1). */
const SEEDED_DATABASE_TRANSPORT_ID = 'D1ED3F08-7008-4DA8-BA2B-7CD6A820AEB5';
const CONFORMANCE_HANDLER_KEY = 'WorkQueueConformance';

export type ConformanceProvider = WorkQueueExecutorSource & Pick<IMetadataProvider, 'GetEntityObject'>;

export interface DatabaseConformanceHarness extends ConformanceHarness {
    /** Deletes every row this harness created. Call once after the suite. */
    Cleanup(): Promise<void>;
}

export function SecondsToShift(ms: number): number {
    return Math.max(1, Math.ceil(ms / 1000));
}

export async function CreateDatabaseConformanceHarness(provider: ConformanceProvider, contextUser: UserInfo,
                                                       transportID = SEEDED_DATABASE_TRANSPORT_ID): Promise<DatabaseConformanceHarness> {
    const topics: MJWorkQueueTopicEntity[] = [];
    const subscriptions: MJWorkQueueSubscriptionEntity[] = [];
    const sql = CreateWorkQueueSqlBuilder(provider);
    const deps = { ContextUser: contextUser, Executor: provider, Log: new MJWorkLogger('[WorkQueueConformance]') };

    return {
        Capabilities: DATABASE_TRANSPORT_CAPABILITIES,
        Traits: DATABASE_CONFORMANCE_TRAITS,
        CreateDriver: async (): Promise<ITransportDriver> => new DatabaseTransportDriver(provider, deps),
        CreateTopic: async (driver: ITransportDriver, name: string, overrides: Partial<TopicBinding> = {}): Promise<TopicBinding> => {
            const topic = await provider.GetEntityObject<MJWorkQueueTopicEntity>(WorkQueueEntityNames.Topics, contextUser);
            topic.NewRecord();
            topic.Name = name;
            topic.TransportID = transportID;
            topic.OrderingMode = overrides.OrderingMode ?? 'PublishOrder';
            topic.IsFifo = overrides.IsFifo ?? false;
            topic.MaxPayloadBytes = overrides.MaxPayloadBytes ?? 262144;
            await SaveOrThrow(topic, name);
            topics.push(topic);
            return ToTopicBinding(topic);
        },
        CreateSubscription: async (driver: ITransportDriver, binding: TopicBinding, name: string,
                                   overrides: SubscriptionBindingOverrides = {}): Promise<SubscriptionBinding> => {
            const topic = topics.find(t => t.Name === binding.TopicName);
            if (!topic) {
                throw new Error(`Conformance topic '${binding.TopicName}' was not created by this harness`);
            }
            const subscription = await provider.GetEntityObject<MJWorkQueueSubscriptionEntity>(WorkQueueEntityNames.Subscriptions, contextUser);
            subscription.NewRecord();
            ApplySubscriptionOverrides(subscription, topic.ID, name, overrides);
            await SaveOrThrow(subscription, name);
            subscriptions.push(subscription);
            return ToSubscriptionBinding(subscription, topic);
        },
        AdvanceTime: async (ms: number): Promise<void> => {
            for (const subscription of subscriptions) {
                await ExecuteWrite(provider, sql.Consume.ShiftTimestampsForConformance(subscription.ID, SecondsToShift(ms)), contextUser);
            }
        },
        Dispose: async (): Promise<void> => undefined,
        Cleanup: async (): Promise<void> => {
            await DeleteRuntimeRows(provider, contextUser, subscriptions.map(s => s.ID), topics.map(t => t.ID));
            for (const subscription of subscriptions.splice(0)) {
                await subscription.Delete();
            }
            for (const topic of topics.splice(0)) {
                await topic.Delete();
            }
        },
    };
}

function ApplySubscriptionOverrides(subscription: MJWorkQueueSubscriptionEntity, topicID: string, name: string,
                                    overrides: SubscriptionBindingOverrides): void {
    subscription.TopicID = topicID;
    subscription.Name = name;
    subscription.HostType = overrides.HostType ?? 'MJWorker';
    subscription.HandlerKey = subscription.HostType === 'MJWorker' ? CONFORMANCE_HANDLER_KEY : null;
    subscription.Filter = overrides.Filter ? JSON.stringify(overrides.Filter) : null;
    subscription.PartitionMode = overrides.PartitionMode ?? 'None';
    subscription.MaxAttempts = overrides.MaxAttempts ?? 5;
    subscription.BackoffBaseSeconds = overrides.BackoffBaseSeconds ?? 10;
    subscription.BackoffMaxSeconds = overrides.BackoffMaxSeconds ?? 900;
    subscription.LeaseSeconds = overrides.LeaseSeconds ?? 60;
    subscription.HeartbeatMode = overrides.HeartbeatMode ?? 'Auto';
    subscription.MaxProcessingSeconds = overrides.MaxProcessingSeconds ?? null;
    subscription.SequenceGapAlertSeconds = overrides.SequenceGapAlertSeconds ?? null;
}

async function SaveOrThrow(entity: MJWorkQueueTopicEntity | MJWorkQueueSubscriptionEntity, name: string): Promise<void> {
    if (!(await entity.Save())) {
        throw new Error(`Conformance setup could not save '${name}': ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

async function DeleteRuntimeRows(executor: WorkQueueExecutorSource, contextUser: UserInfo, subscriptionIDs: string[], topicIDs: string[]): Promise<void> {
    const bySubscription: WorkQueueTableName[] = [WorkQueueTables.Delivery, WorkQueueTables.PartitionState];
    const byTopic: WorkQueueTableName[] = [WorkQueueTables.Message, WorkQueueTables.Deduplication];
    for (const table of bySubscription) {
        await DeleteWhereIn(executor, contextUser, table, 'SubscriptionID', subscriptionIDs);
    }
    for (const table of byTopic) {
        await DeleteWhereIn(executor, contextUser, table, 'TopicID', topicIDs);
    }
}

async function DeleteWhereIn(executor: WorkQueueExecutorSource, contextUser: UserInfo, table: WorkQueueTableName, column: string, ids: string[]): Promise<void> {
    if (ids.length === 0) {
        return;
    }
    const params = new SqlParamList(executor);
    const placeholders = ids.map(id => params.Add(id)).join(', ');
    const sql = `DELETE FROM ${QualifiedTable(executor, table)} WHERE ${executor.QuoteIdentifier(column)} IN (${placeholders})`;
    await ExecuteWrite(executor, { SQL: sql, Params: params.Values }, contextUser);
}
```

On PostgreSQL the `IN (...)` comparison is between `uuid` and text parameters; the PostgreSQL provider binds untyped parameters, which the server coerces to `uuid` in an `IN` list against a `uuid` column. If your PostgreSQL run reports `operator does not exist: uuid = text`, append `::uuid` to each placeholder when `executor.PlatformKey === 'postgresql'`.

- [ ] **Step 3b: Write the filter parity test**

Core ships its own evaluator because `work-queue-core` may not depend on `@memberjunction/core` (03 §0, §4.3). The
engine package *can*, so this is where the two are held together: for every case in the table, core's `MatchesFilter`
must agree with MJ's `CompositeFilter.Evaluate`. Case-**insensitive** fixtures are deliberately absent — work-queue
matching is case-sensitive to match the brokers, and that divergence is the point of 03 §4.3 item 3.

`packages/WorkQueue/engine/src/__tests__/filterParity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CompositeFilter } from '@memberjunction/core';
import { MatchesFilter, ParseSubscriptionFilter, WORK_QUEUE_FILTER_SUPPORT } from '@memberjunction/work-queue-core';

/** Each case is CompositeFilterDescriptor JSON plus the attribute map both evaluators see. */
const CASES: { Name: string; Filter: string; Attributes: Record<string, string> }[] = [
    {
        Name: 'single eq match',
        Filter: '{"logic":"and","filters":[{"field":"eventType","operator":"eq","value":"click"}]}',
        Attributes: { eventType: 'click' },
    },
    {
        Name: 'single eq miss',
        Filter: '{"logic":"and","filters":[{"field":"eventType","operator":"eq","value":"click"}]}',
        Attributes: { eventType: 'open' },
    },
    {
        Name: 'and across fields',
        Filter: '{"logic":"and","filters":[{"field":"eventType","operator":"eq","value":"click"},{"field":"tenant","operator":"eq","value":"acme"}]}',
        Attributes: { eventType: 'click', tenant: 'acme' },
    },
    {
        Name: 'single-field or group, second value',
        Filter: '{"logic":"and","filters":[{"logic":"or","filters":[{"field":"tenant","operator":"eq","value":"acme"},{"field":"tenant","operator":"eq","value":"globex"}]}]}',
        Attributes: { tenant: 'globex' },
    },
    {
        Name: 'neq on a present attribute',
        Filter: '{"logic":"and","filters":[{"field":"source","operator":"neq","value":"test"}]}',
        Attributes: { source: 'live' },
    },
    {
        Name: 'startswith prefix match',
        Filter: '{"logic":"and","filters":[{"field":"tenant","operator":"startswith","value":"acme-"}]}',
        Attributes: { tenant: 'acme-eu' },
    },
    {
        Name: 'isnotnull with the attribute present',
        Filter: '{"logic":"and","filters":[{"field":"campaign","operator":"isnotnull"}]}',
        Attributes: { campaign: 'spring' },
    },
    {
        Name: 'isnull with the attribute absent',
        Filter: '{"logic":"and","filters":[{"field":"campaign","operator":"isnull"}]}',
        Attributes: { eventType: 'click' },
    },
    {
        Name: 'missing attribute fails eq',
        Filter: '{"logic":"and","filters":[{"field":"campaign","operator":"eq","value":"spring"}]}',
        Attributes: {},
    },
];

describe('filter parity with @memberjunction/core CompositeFilter', () => {
    for (const testCase of CASES) {
        it(`agrees on: ${testCase.Name}`, () => {
            const ours = MatchesFilter(ParseSubscriptionFilter(testCase.Filter, WORK_QUEUE_FILTER_SUPPORT), testCase.Attributes);
            const theirs = CompositeFilter.FromJSON(testCase.Filter).Evaluate({ '': testCase.Attributes });
            expect(ours, `${testCase.Name}: work-queue evaluator`).toBe(theirs);
        });
    }

    it('is case-sensitive where CompositeFilter is not (the one deliberate divergence, 03 §4.3)', () => {
        const filter = '{"logic":"and","filters":[{"field":"eventType","operator":"eq","value":"Click"}]}';
        const attributes = { eventType: 'click' };
        expect(MatchesFilter(ParseSubscriptionFilter(filter, WORK_QUEUE_FILTER_SUPPORT), attributes)).toBe(false);
        expect(CompositeFilter.FromJSON(filter).Evaluate({ '': attributes })).toBe(true);
    });
});
```

If a parity case fails, fix core's evaluator (plan 04) to match `CompositeFilter` — not the test — unless the
difference is the documented case sensitivity. If `CompositeFilter`'s `FilterEvalContext` keying differs from
`{ '': attrs }` for bare field names, check `ParseFilterField` in `MJCore/src/generic/filters/filter.types.ts` and
key the context the way it resolves.

- [ ] **Step 4: Export the harness**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './testing/DatabaseConformanceHarness';
```

- [ ] **Step 5: Run the tests and build the whole data layer**

Run: `cd packages/WorkQueue/base && pnpm test`
Expected: PASS — dependency guard, entityValidation, topology and WorkQueueEngineBase, 0 failures.

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — every suite from Tasks 2–14 including filterParity (10), 0 failures.

Run:
```bash
cd packages/MJCoreEntities && pnpm run build
cd ../WorkQueue/core && pnpm run build
cd ../base && pnpm run build
cd ../engine && pnpm run build
```
Expected: all four build with no errors (`base` before `engine`).

Run: `node .github/scripts/check-migration-entityfield-sequence.mjs` (repository root)
Expected: exits 0.

- [ ] **Step 6: Write the changeset**

`.changeset/work-queue-native-data-layer.md`:

```markdown
---
"@memberjunction/core-entities": minor
"@memberjunction/work-queue-base": minor
"@memberjunction/work-queue-engine": minor
---

Add the durable work queue's database layer: seven work-queue tables and entities (transports, topics, subscriptions, messages, deliveries, explicit-sequence partition state and the deduplication ledger), `workqueue:*` API scopes, the seeded `Database` transport, the browser-safe `@memberjunction/work-queue-base` metadata tier (`WorkQueueEngineBase`, topology rows, binding builders, filter and topology validation), and `@memberjunction/work-queue-engine` with SQL Server and PostgreSQL statement builders, the Database transport driver, consumer and operator, the deduplication ledger, staging for ordered cloud subscriptions, manifest export, and the server `WorkQueueEngine` facade.
```

Run: `npm run check:changeset`
Expected: passes — the branch changes a migration and `metadata/`, and the changeset is `minor`.

- [ ] **Step 7: Commit**

```bash
git add packages/WorkQueue/base/src packages/WorkQueue/engine/src .changeset/work-queue-native-data-layer.md
git commit -m "feat(work-queue-engine): Database conformance harness, filter parity test and changeset"
```

In the PR description, state that the PostgreSQL migration counterpart is produced by the release build.

---

## Contract deltas

Differences between this plan and spec 03 (and neighbouring plans) that should be folded into 03:

| # | Delta | Why |
| --- | --- | --- |
| ND1 | 03 §11 `BaseTransportDriverFactory.Create` takes a structural `TransportRow` (the generated `MJWorkQueueTransportEntity` satisfies it) instead of the entity class. | Keeps factories unit-testable without BaseEntity instances. |
| ND2 | `TransportDriverDeps.Executor` is `WorkQueueExecutorSource` (adds `BeginEntityTransaction`, `CreateIndependentInstance`), not `WorkQueueSqlExecutor`; deps gain optional `InstanceID`. The executor seam also includes `BuildParameterPlaceholder`. | Publishes and multi-statement settles need isolated transactions over the shared server provider. |
| ND3 | `DatabasePublishOptions` is narrowed by `DatabaseTransportPublishOptions { Kind: 'Database'; Executor?; UserID? }`; deduplication is owned by `WorkQueuePublishCoordinator` (the engine), never by drivers. | 03 §5 left the Database options opaque; the ledger must run in the same transaction as the Database insert. |
| ND4 | Sequence rules (plan 04 CD5/CD6) implemented: deliveries for already-resolved sequences are inserted `Discarded` (`SequenceAlreadyResolved`); `AdvanceSequenceMark` walks consecutive `Completed`/`Discarded` sequences after Complete, Discard and SkipSequence; awaiting-sequence state clears on insert and on each claim cycle. `DiscardSkippedSequences` stays as a sweeper backstop. | Prevents wedged keys. |
| ND5 | Publish order per key on `PublishOrder` topics with `Ordered` subscriptions is serialised by a transaction-scoped application lock (`sp_getapplock` / `pg_advisory_xact_lock`) before the message insert. | Otherwise a later ordinal can commit before an earlier one and be claimed out of order. |
| ND6 | `WorkQueuePartitionState` rows exist only for `Ordered` subscriptions on `ExplicitSequence` topics (03 §6.6 says "Exclusive/Ordered"). | Single flight and blocking are derived from deliveries (03 §7), so other modes need no row. |
| ND7 | `StageDeliveries(request: StageDeliveriesRequest): Promise<StageResult[]>` on `DatabaseTransportDriver` follows **plan 07's** consumer signature (`TopicID`, `SubscriptionID`, `PartitionMode`, `OrderingMode`, `Messages`; results `Staged` / `AlreadyStaged` / `Rejected`), not the coordinator's `(subscription, subscriptionID, messages) → { MessageID, Staged }`. | Plan 07 already imports this shape and needs `Rejected` codes (for example `DuplicateSequence`) to dead-letter instead of silently dropping. |
| ND8 | Engine additions beyond 03 §11: `OnPublished(listener)`, `GetDatabaseDriver()`. | Plan 06 host kicks consumers on local publish; plan 07's stager needs the Database driver. |
| ND9 | Conformance harness: this plan exports `CreateDatabaseConformanceHarness(provider, contextUser, transportID?)` returning plan 04's `ConformanceHarness` (plus `Cleanup()`); plan 06 currently expects `TransportConformanceHarness` / `RunTransportConformance` from core `/testing`. Align plan 06 to plan 04's names. The consume builder exposes test-only `ShiftTimestampsForConformance`. | Name mismatch between plans 04 and 06. |
| ND10 | Plan 06 lists its own `src/runtime/MJWorkLogger.ts` and `WorkQueueSweeperSql.ts`; this plan already provides `src/logging/MJWorkLogger.ts` and the sweeper statements on `OperatorSqlBuilder` (`ExpireLeasesAll`, `FlagGapStalls`, `DiscardSkippedSequences`, `PurgeTerminalDeliveries`, `PurgeOrphanMessages`) plus `DeduplicationLedger.PurgeExpired`. Plan 06 should reuse them. | Avoids duplicate implementations. |
| ND11 | Dead-letter paging cursor is keyed on delivery ID only (`DeadLetterCursor { DeliveryID }`); page size clamps to 1–500 (default 50). `SubscriptionStats.CompletedLastHour` is a number (never null) on the Database transport; `BlockedKeys` is null for non-`Ordered` subscriptions. | 03 §5.2 leaves paging and nullability open. |
| ND13 | Revision 3 adopted here: `WorkQueueDelivery.CancelRequestedAt` (03 §6.5); `OperatorSqlBuilder.CancelInFlightDelivery`; `Discard` of an `InFlight` delivery revokes the lease and returns `CancelRequested: true`; expire passes settle cancelled rows as `Discarded`; `DATABASE_TRANSPORT_CAPABILITIES.CancelInFlight = true`. | 03 §5, §5.2, §7 |
| ND14 | Both expire statements (`ConsumeSqlBuilder.ExpireLeases`, `OperatorSqlBuilder.ExpireLeasesAll`) now **return** the rows they dead-lettered (`ExpiredDeadLetterRow`) instead of only a row count, so lease-expiry dead letters reach `OnDeadLettered`. Plan 06's sweeper must read rows and forward them (it previously used `ExecuteWrite`). | 03 §11 · plan 06 |
| ND15 | `TransportDriverDeps` gains `NotifyDeadLettered?: (event: DeadLetteredEvent) => void`; the engine injects it and fans out through a generic `ListenerSet<TEvent>` (`PublishListenerSet` is now `ListenerSet<string>`). | 03 §11 |
| ND16 | `ConsumeSqlBuilder.SubscriptionBacklog(subscriptionID, mode, explicitSequence)` + `DatabaseTransportOperator.GetBacklog(subscription)` back `WorkQueueEngine.GetBacklog`. The standalone KEDA query (Task 5) approximates `Ordered` — single-flight per key, without head-of-line or next-sequence rules — so it can overcount a blocked key by one; the remote operation is exact. | 03 §11 |
| ND17 | Entity metadata sets `AllowCreateAPI/AllowUpdateAPI/AllowDeleteAPI = false` for the four driver-owned entities, so CodeGen emits **no** `spCreate/spUpdate/spDelete` for them. The metadata push therefore runs **before** the CodeGen pass whose SQL is appended to the migration (Task 1 Step 9). | 03 §6.8 |
| ND12 | `InsertDeliveries` is idempotent on `(SubscriptionID, MessageID)`, and `InsertMessage` returns the existing row's `PublishOrdinal` on conflict. | Required for staging redelivery and for multiple staged subscriptions sharing one message row. |
| ND18 | **Adopted (03 §0, §11):** the metadata tier moves to `@memberjunction/work-queue-base`. `WorkQueueEngineBase extends BaseEngine` owns the topology cache, lookups, binding/policy builders, `ParseFilter`, `IsStagedToDatabase` and `ValidateTopologyRows`; `WorkQueueEngine` becomes a `BaseSingleton` **facade** delegating to it (`AIEngine`/`AIEngineBase` pattern). The engine re-exports the row types, validators, binding builders and `WorkQueueEngineBase`, so plans 06–08 need no import changes. | 03 §0, §11 |
| ND19 | `WorkQueueEngineBase.ValidateTopologyRows(capabilitiesByDriverClass)` (03 §11) is a convenience over the standalone `ValidateTopologyRows(snapshot, capabilities: Map<transportID, TransportCapabilities \| Error>)`, which the server engine keeps using directly so **one** unresolvable transport is reported as an Error instead of failing the pass. `WorkQueueEngineBase` also exposes `Snapshot`, `TopicOf` and `TransportOf` (the facade and plan 07's stager need them). | 03 §11 |
| ND20 | **Adopted (03 §4):** subscription filters are MJ `CompositeFilterDescriptor` JSON. `ToSubscriptionBinding(subscription, topic, support?)` and `WorkQueueEngineBase.BuildSubscriptionBinding(subscription, support?)` take an optional `FilterSupport` (default `WORK_QUEUE_FILTER_SUPPORT`); entity-save validation checks the queue-wide subset, and `ValidateTopologyRows` re-parses with the transport's `capabilities.Filters` so an untranslatable operator is an Error naming field and operator. `DATABASE_TRANSPORT_CAPABILITIES.Filters = WORK_QUEUE_FILTER_SUPPORT`. | 03 §4, §5 |
| ND21 | Plan 04 must export `WORK_QUEUE_FILTER_SUPPORT` (the queue-wide `FilterSupport` constant) alongside `ParseSubscriptionFilter(json, support)` — 03 §4.2 lists the functions but not the constant, and every tier needs a default. | 03 §4.2 |
| ND22 | `IsWorkJson` moves to the base package (`@memberjunction/work-queue-base`); the engine's `rowMapping` re-exports it. The row fixtures used by both packages' suites ship from `work-queue-base/src/testing/rowFixtures.ts` as `TRANSPORT_ROW_FIXTURE` / `TOPIC_ROW_FIXTURE` / `SUBSCRIPTION_ROW_FIXTURE`, re-exported by the engine's test fakes under their old short names. | this plan |

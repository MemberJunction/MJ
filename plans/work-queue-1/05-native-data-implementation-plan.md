# Work Queue — Native Data Layer Implementation Plan (Phase 1, plan 05)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the work-queue schema and metadata, the browser-safe metadata tier `@memberjunction/work-queue-base` (`WorkQueueEngineBase`), and the data layer of `@memberjunction/work-queue-engine`: the SQL executor seam, SQL Server and PostgreSQL statement builders, the Database transport driver, consumer and operator, the deduplication ledger, the sweep lock, the Database driver factory, entity validation, the publish coordinator, manifest export, and the server `WorkQueueEngine`.

**Revision 4** ([`11-revision-4-review.md`](11-revision-4-review.md)): explicit sequencing (cut S1) and staging of ordered cloud subscriptions (cut S2) were **removed** from Phase 1, and findings F1–F13 are applied throughout. This plan has 13 tasks; the former Task 12 (the staging insert) no longer exists.

**Architecture:** Six core-schema tables (03 §6) hold transports, topics, subscriptions, messages, deliveries and deduplication keys. All runtime SQL is built by per-platform statement builders (`SqlServer*Sql`, `PostgreSQL*Sql`) behind three narrow interfaces (publish, consume, operator) and executed through a structural `WorkQueueSqlExecutor` that `DatabaseProviderBase` already satisfies. Single-flight per partition key is enforced by the unique filtered index `UQ_WorkQueueDelivery_InFlightPartition`; `Ordered` (Database transport only) is derived from the head delivery, whose `OrderKey` is always the message's `PublishOrdinal`; publish order per key is serialized with an application lock taken inside the publish transaction, in sorted key order and with a timeout. Cancelling an in-flight delivery only sets a flag (`CancelRequestedAt`); the holder learns of it from `ExtendLease → 'Cancelled'` and answers with `AcknowledgeCancel`.

**Executor ownership (03 §11, F8).** Both data providers route an un-sourced `ExecuteSQL` onto the provider's ambient transaction, so queue SQL on the shared provider can be absorbed — and rolled back — by an unrelated unit of work. Every consumer, the operator, the cloud-path ledger, the sweep lock and the conformance harness therefore **own an independent executor** (`OwnedExecutor`) and release it in `Close()`; the shared provider is used only to mint them. The one exception is a publish the caller explicitly enlists in its own transaction — and there every database error propagates to the caller.

The metadata tier is split in two, mirroring `AIEngineBase`/`AIEngine` (03 §0, §11): **`@memberjunction/work-queue-base`** is browser-safe and holds `WorkQueueEngineBase` (a `BaseEngine` caching transports, topics and subscriptions) plus the pure row types, binding builders, filter parsing and topology validation that Explorer, dashboards and any client-tier code need. **`@memberjunction/work-queue-engine`** is server-only: `WorkQueueEngine` is a `BaseSingleton` **facade** that delegates every metadata member to `WorkQueueEngineBase.Instance` — composition, not inheritance, exactly as `AIEngine` delegates to `AIEngineBase` (`packages/AI/Engine/src/AIEngine.ts`) — and adds drivers (one instance per transport), the publish coordinator (which owns the deduplication ledger protocol, 03 §2.1), the operator, the manifest and the autoscaler metric. Subscription filters are MJ's `CompositeFilterDescriptor` JSON restricted to the broker-translatable subset (03 §4), parsed by core and validated per transport.

**Tech Stack:** TypeScript 5.9 (ESM), Vitest 3, `@memberjunction/work-queue-core` (plan 04), `@memberjunction/work-queue-base` (this plan), `@memberjunction/core`, `@memberjunction/global`, `@memberjunction/core-entities`, `@memberjunction/sql-dialect`, SQL Server and PostgreSQL through MJ data providers, MJ CodeGen and mj-sync.

**Spec:** [`03-interfaces-and-tables.md`](03-interfaces-and-tables.md) (normative — §0, §4, §5, §6, §7, §11), [`02-implementation-overview.md`](02-implementation-overview.md), [`README.md`](README.md). Read all three before starting. Plan [04](04-core-implementation-plan.md) must be complete.

## Global Constraints

- **Package manager:** pnpm only. Run `pnpm install` at the repository root only — never inside a package, never `npm install`.
- **Per-package commands:** `cd packages/WorkQueue/base && pnpm test` / `pnpm run build`, and the same under `packages/WorkQueue/engine`. Build `base` before `engine`. Do not build single packages with turbo from the root.
- **Package shape (verified against `packages/Scheduling/engine`):** `"type": "module"`; build script `tsc && tsc-alias -f`; `tsconfig.json` extends `../../../tsconfig.server.json` with `outDir: dist`, `rootDir: src`; `vitest.config.ts` merges `../../../vitest.shared`; tests in `src/__tests__/*.test.ts`; extensionless relative imports.
- **Internal dependency versions:** pin every `@memberjunction/*` dependency to the exact `version` in `packages/MJCore/package.json` (`6.1.0` when this plan was written). Dev dependencies: `@types/node` `24.10.11`, `typescript` `^5.9.3`, `vitest` `^3.1.1`.
- **Base package compiler options:** the base package does **not** inherit `tsconfig.server.json`'s `dom` lib — it has its own `tsconfig.json` with `"lib": ["es2022", "esnext.asynciterable"]` and `"types": []`, so neither DOM nor Node globals type-check there (Task 2).
- **Base package dependencies (03 §0):** `@memberjunction/work-queue-core`, `@memberjunction/core`, `@memberjunction/global`, `@memberjunction/core-entities` **only**. `@memberjunction/work-queue-base` is **browser-safe**: no `@memberjunction/sql-dialect`, no drivers, no `node:` imports, no SQL. A unit test asserts its `package.json` declares nothing else and that no source file imports `node:*`, a bare Node built-in (`fs`, `path`, `crypto`, …), `sql-dialect` or a server package. Test data ships only through the `@memberjunction/work-queue-base/testing` subpath, never the production index.
- **Engine dependencies in this plan:** `@memberjunction/work-queue-base`, `@memberjunction/work-queue-core`, `@memberjunction/core`, `@memberjunction/global`, `@memberjunction/core-entities`, `@memberjunction/sql-dialect` **only**. The engine must **not** depend on `@memberjunction/work-queue-aws` here, and its **main entry never imports it** (F12): plan 07 adds the dependency, an `./aws` subpath export and `src/aws/`, which registers the AWS driver factory and manifest enricher. `engineEntryGuard.test.ts` (Task 2) fails the build if anything outside `src/aws/` imports an AWS package.
- **No cross-package re-exports** (`.claude/rules/typescript-style.md`, F13): the engine never re-exports a base or core symbol. Import `TransportRow`, `ValidateTopologyRows`, `BuildTopologyManifest`, `WorkQueueEngineBase`, `IsWorkJson`, `WorkQueueEntityNames`, `DATABASE_DRIVER_CLASS` … from `@memberjunction/work-queue-base` directly. The same guard test enforces it.
- **Migrations:** T-SQL only, in `migrations/v6/`, named `V<YYYYMMDDHHMM>__v6.<minor>.x__Add_Work_Queue_Schema.sql`, where `<minor>` is taken from the newest non-CodeGen file in `migrations/v6/` (`v6.2.x` when this plan was written) and the timestamp is later than every existing migration. DDL and `sp_addextendedproperty` only. Use `${flyway:defaultSchema}`, never `__mj`. No `__mj_CreatedAt`/`__mj_UpdatedAt` columns and no single-column foreign-key indexes (CodeGen owns both). Simple CHECK constraints; no `OR Column IS NULL` on nullable columns. Every non-key column gets a description. **Do not write a PostgreSQL migration** — say in the PR description that the counterpart is produced by the release build.
- **CodeGen block:** after the hand DDL, at least 50 blank lines, then the CodeGen comment block, then the full `CodeGen_Run_*.sql` output; delete the standalone `CodeGen_Run_*.sql`. EntityField INSERTs must use the apply-time `(SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM … WHERE [EntityID] = '…')` expression — never a literal. Gate: `node .github/scripts/check-migration-entityfield-sequence.mjs` must exit 0.
- **CodeGen order for new tables (migrations/CLAUDE.md "four steps"):** `pnpm run mj:migrate` → `pnpm exec mj codegen --skipfiles` → append output → `pnpm exec mj sync push --dir=metadata --ci` → `pnpm exec mj codegen --skipdb`. **There is exactly ONE CodeGen SQL pass** — the `--skipfiles` run whose output is appended. The entity flags pushed afterwards are metadata, not migration content: never re-run the SQL pass to "pick them up", and never edit the appended tail. Gates: `node .github/scripts/check-migration-entityfield-sequence.mjs` and `npm run check:codegen-tail`.
- **`mj sync push` writes `sync` stamps back into the metadata files.** Revert them before committing (migrations/CLAUDE.md) — Task 1 Step 10b.
- **Isolation (03 §6, F9):** the Database transport requires `READ_COMMITTED_SNAPSHOT ON` on SQL Server. Task 1 checks the dev database; `WorkQueueEngine.ValidateTopology` reports it as an **Error** at engine start. Partition keys use a `_BIN2` collation so SQL Server and PostgreSQL agree on key identity.
- **Never add to the index:** `mj.config.cjs`, `packages/MJAPI/src/generated/**`, `packages/MJExplorer/src/app/generated/**`, `packages/GeneratedEntities/**` — local host artifacts. Every commit step in this plan names its paths explicitly.
- **One database per agent.** Before `mj migrate`, `mj codegen` or `mj sync push`, confirm the `DB_DATABASE` in `.env` is not in use by any other session.
- **Metadata:** declarative JSON under `metadata/`; primary keys are the `uuidgen` values written in this plan; never hand-write `sync` blocks; never write a `*__Metadata_Sync.sql` migration.
- **Changeset:** this branch adds a migration and metadata, so its changeset bump is **`minor`** (`.claude/rules/changesets.md`); run `npm run check:changeset`.
- **Code rules:** no `any`; `unknown` only at trust boundaries, narrowed immediately; no `as` casts in production code (test fakes under `src/__tests__/` and the `./testing` subpath may use `{} as UserInfo`, the recording executor's generic row cast and `SeededWorkQueueEngineBase`'s row-to-entity cast, following existing repo tests); compare UUIDs with `UUIDsEqual` / normalise with `NormalizeUUID` from `@memberjunction/global`; pass `contextUser` to every `ExecuteSQL`, `RunView` and `GetEntityObject`; static imports only; PascalCase public members, camelCase private; functions around 30–40 lines.
- **SQL rules:** every value is a bound parameter; identifiers go through `QuoteIdentifier` and the schema through `MJCoreSchemaName`; guarded writes are returned bare and executed through `ExecuteWrite` (which wraps them with `Dialect.AffectedRowCountSQL`); row-returning SQL Server batches end in exactly **one** result set and capture `OUTPUT` **`INTO` a table variable** (CodeGen tables carry triggers — bare `OUTPUT` fails with error 334); database clock only (`SYSDATETIMEOFFSET()` / `now()`); PostgreSQL parameters carry explicit casts (`$1::uuid`, `$2::text`, `$3::int`, `$4::bigint`); every scan is bounded (`TOP`/`LIMIT`) and index-ordered; no built statement ever contains a literal `?` (the PostgreSQL provider rewrites it) — each builder suite asserts it.
- **Executors:** queue SQL never runs on the shared provider (see Architecture). Tests assert it with the tagged `RecordingExecutor` (`Calls[].Executor`, `CallsOn('source')`).
- **Commits:** perform a task's commit step only when the user has approved commits for this execution session; otherwise stage nothing and report the task as ready to commit.
- **Branch:** work on `feat/work-queue`, tracking `origin/feat/work-queue` (verify with `git branch -vv` before any push).

---

## Task overview

| # | Task | Deliverable |
| --- | --- | --- |
| 1 | Schema (six tables, `CancelRequestedAt`, `_BIN2` keys, claim/purge/open indexes), RCSI check, ONE CodeGen SQL pass, entity flags, UI read restriction, API scopes, `Database` transport seed, `directoryOrder` | Six entities generated; metadata pushed; `check:codegen-tail` green; sync stamps reverted |
| 2 | Base + engine scaffolds (base has its own tsconfig and a `./testing` subpath), SQL executor seam, execution helpers, tagged test fakes, entry guard | Both packages build; helper, dependency-guard and entry-guard tests pass |
| 3 | Row types, builder interfaces, SQL Server publish and ledger statements (global `MessageID`, F1 ledger, publish-order lock with timeout) | Statement shapes tested |
| 4 | SQL Server consume statements (expire, bounded claim, settle, `AcknowledgeCancel`, lease state) | Statement shapes tested |
| 5 | SQL Server operator and sweeper statements, flag-only cancel, sweep lock, RCSI read, bounded autoscaler query and scaler login | Statement shapes tested; scaler script written |
| 6 | PostgreSQL statements and the builder factory | Statement shapes tested for both platforms |
| 7 | Transaction helper, `TryAcquireSweepLock` and `DeduplicationLedger` | Rollback-masking, sweep lock and F1 ledger protocol tested |
| 8 | Driver dependencies, `OwnedExecutor`, row mapping, `DatabaseTransportOperator` | Mapping, executor ownership and operator methods tested |
| 9 | `DatabaseTransportDriver` and `DatabaseTransportConsumer` | Publish, claim, lease and settle tested with a tagged recording executor |
| 10 | Topology rows, field validation and `./testing` fixtures (**base**); `BaseTransportDriverFactory`, Database factory, `MJWorkLogger`, entity servers, `PartitionMode` immutability, driver-owned state guards (**engine**) | Factory resolution, validation, F11 and refused `Save()`/`Delete()` tested |
| 11 | Topology bindings, validation incl. per-transport filter support, and manifest (**base**); `WorkQueuePublishCoordinator` (**engine**) | Pure topology, manifest and publish orchestration (F1, enlisted publishes, owned ledger executor) tested |
| 12 | `WorkQueueEngineBase` (**base**) and the `WorkQueueEngine` facade (**engine**: closed proxy list, one driver per transport, `GetBacklog`, public `NotifyDeadLettered`, RCSI in `ValidateTopology`, `EnrichManifest` seam) | Both build; metadata tier, facade, driver resolution and listeners tested |
| 13 | Database conformance harness, filter parity test, full build, changeset | Harness exported; parity with `CompositeFilter` proven; full build and gates green |

## Pre-flight

- [ ] Plan 04 is complete: `cd packages/WorkQueue/core && pnpm test` passes, it exports the 03 §4.2 filter API (`FilterOperator`, `FilterRule`, `FilterGroup`, `SubscriptionFilter`, `FilterSupport`, `ParseSubscriptionFilter(json, support)`, `MatchesFilter`), and `pnpm-workspace.yaml` plus the root `package.json` `workspaces` array both contain `packages/WorkQueue/*` (plan 04 adds them; if missing, add `'packages/WorkQueue/*'` to both lists next to `'packages/Scheduling/*'` and run `pnpm install` at the root).
- [ ] You are on `feat/work-queue` and `git branch -vv` shows `[origin/feat/work-queue]`.
- [ ] The database in `.env` is yours alone (see Global Constraints).
- [ ] `cd packages/MJCore && pnpm test` passes (baseline health check).

## File structure

```
migrations/v6/V<ts>__v6.<minor>.x__Add_Work_Queue_Schema.sql                          Task 1

metadata/
  .mj-sync.json                                  (directoryOrder: transports before topics)   Task 1
  entities/.work-queue-entities.json                                                 Task 1
  entity-permissions/.work-queue-permissions.json                                    Task 1
  api-scopes/.workqueue-scopes.json                                                  Task 1
  work-queue-transports/.mj-sync.json · .work-queue-transports.json                  Task 1

scripts/work-queue-scaler-login.sql                                                  Task 5

packages/WorkQueue/base/                        browser-safe metadata tier (03 §0)
  package.json (exports "." and "./testing") · tsconfig.json (own lib/types) · vitest.config.ts   Task 2
  src/index.ts · src/constants.ts · src/json.ts                                      Task 2
  src/topology/rows.ts · src/entities/validation.ts                                  Task 10
  src/topology/bindings.ts · src/topology/validateTopology.ts · src/topology/manifest.ts   Task 11
  src/WorkQueueEngineBase.ts                                                         Task 12
  src/testing/index.ts                                                               Task 2, filled by Tasks 10 and 12
  src/testing/rowFixtures.ts                                                         Task 10
  src/testing/SeededWorkQueueEngineBase.ts                                           Task 12
  src/__tests__/dependencyGuard.test.ts                                              Task 2
  src/__tests__/entityValidation.test.ts                                             Task 10
  src/__tests__/topology.test.ts · src/__tests__/manifest.test.ts                    Task 11
  src/__tests__/WorkQueueEngineBase.test.ts                                          Task 12

packages/WorkQueue/engine/
  package.json (exports "." only — plan 07 adds "./aws") · tsconfig.json · vitest.config.ts   Task 2
  src/index.ts                                                                       Task 2, extended by every later task
  src/constants.ts                                                                   Task 2, extended by Tasks 4 and 9
  src/sql/WorkQueueSqlExecutor.ts · src/sql/SqlParamList.ts · src/sql/sqlExecution.ts   Task 2
  src/sql/rows.ts · src/sql/WorkQueueSqlBuilder.ts · src/sql/StatementBase.ts         Task 3   (SQL row shapes — not topology rows)
  src/sql/sqlserver/SqlServerPublishSql.ts                                           Task 3
  src/sql/sqlserver/SqlServerFragments.ts · SqlServerConsumeSql.ts                   Task 4
  src/sql/sqlserver/SqlServerOperatorSql.ts                                          Task 5
  src/sql/postgresql/PostgreSQLFragments.ts · PostgreSQLPublishSql.ts · PostgreSQLConsumeSql.ts · PostgreSQLOperatorSql.ts   Task 6
  src/sql/CreateWorkQueueSqlBuilder.ts                                               Task 6
  src/transaction/RunInWorkQueueTransaction.ts · src/sql/sweepLock.ts                Task 7
  src/dedup/DeduplicationLedger.ts                                                   Task 7
  src/transports/TransportDriverDeps.ts · src/transports/OwnedExecutor.ts            Task 8
  src/transports/database/bindingIds.ts · rowMapping.ts · DatabaseTransportOperator.ts   Task 8
  src/publish/publishResults.ts                                                      Task 9
  src/transports/database/databaseCapabilities.ts · deliveryPlan.ts                  Task 9
  src/transports/database/DatabaseTransportDriver.ts · DatabaseTransportConsumer.ts  Task 9
  src/transports/BaseTransportDriverFactory.ts                                       Task 10
  src/transports/database/DatabaseTransportDriverFactory.ts                          Task 10
  src/logging/MJWorkLogger.ts                                                        Task 10
  src/entities/WorkQueueTransportEntityServer.ts · WorkQueueTopicEntityServer.ts · WorkQueueSubscriptionEntityServer.ts   Task 10
  src/entities/partitionModeChange.ts · src/entities/DriverOwnedEntityServers.ts     Task 10
  src/publish/WorkQueuePublishCoordinator.ts                                         Task 11
  src/engine/driverResolution.ts · src/engine/PublishListenerSet.ts                  Task 12
  src/WorkQueueEngine.ts                                                             Task 12
  src/testing/DatabaseConformanceHarness.ts                                          Task 13
  src/__tests__/engineEntryGuard.test.ts                                             Task 2
  src/__tests__/filterParity.test.ts                                                 Task 13
  src/__tests__/fakes.ts                                                             Task 2, extended by Task 8
  src/__tests__/*.test.ts                                                            every code task
  (src/aws/ and src/topology/ManifestEnricherRegistry.ts belong to plan 07)

.changeset/<generated-name>.md                                                       Task 13
```

---

### Task 1: Schema, CodeGen, entity flags, API scopes and the `Database` transport seed

**Files:**
- Create: `migrations/v6/V<ts>__v6.<minor>.x__Add_Work_Queue_Schema.sql`
- Create: `metadata/entities/.work-queue-entities.json`
- Create: `metadata/api-scopes/.workqueue-scopes.json`
- Create: `metadata/work-queue-transports/.mj-sync.json`, `metadata/work-queue-transports/.work-queue-transports.json`
- Create: `metadata/entity-permissions/.work-queue-permissions.json`
- Modify: `metadata/.mj-sync.json` (`directoryOrder`)
- Generated (commit, never edit): `packages/MJCoreEntities/src/generated/**`, `packages/MJServer/src/generated/**` (both are tracked in git). Never stage `packages/MJAPI/src/generated/**`, `packages/GeneratedEntities/**` or `mj.config.cjs`.

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Entities `MJ: Work Queue Transports`, `MJ: Work Queue Topics`, `MJ: Work Queue Subscriptions`, `MJ: Work Queue Messages`, `MJ: Work Queue Deliveries`, `MJ: Work Queue Deduplications` (six — 03 §6) with generated classes `MJWorkQueueTransportEntity`, `MJWorkQueueTopicEntity`, `MJWorkQueueSubscriptionEntity`, `MJWorkQueueMessageEntity`, `MJWorkQueueDeliveryEntity`, `MJWorkQueueDeduplicationEntity`.
  - API scopes `workqueue`, `workqueue:publish`, `workqueue:read`, `workqueue:operate`.
  - A seeded transport row `Name = 'Database'`, `DriverClass = 'Database'`, `ID = D1ED3F08-7008-4DA8-BA2B-7CD6A820AEB5`.
  - Indexes and constraints named exactly `UQ_WorkQueueDelivery_InFlightPartition`, `UQ_WorkQueueDelivery_Subscription_Message`, `UQ_WorkQueueDeduplication_Topic_Key` and `PK_WorkQueueMessage` (the TypeScript maps unique violations by these names, together with the platform error number).
  - `metadata/.mj-sync.json` `directoryOrder` containing `work-queue-transports` and then `work-queue-topics` (plan 08 seeds topics; listing the folder now is harmless and keeps a fresh install's push order right).

**Permissions (03 §6.7, F7).** CodeGen's `newEntityDefaults.PermissionDefaults` grants `UI` **read** and `Developer`/`Integration` full access to every new entity (`packages/CodeGenLib/src/Config/config.ts:434-438`). Payloads may carry personal data, so Step 8b turns the `UI` read grant **off** for Messages and Deliveries; operators reach dead letters through the remote operations (plan 06), which authorize per subscription.

**Isolation prerequisite (03 §6, F9).** The Database transport requires `READ_COMMITTED_SNAPSHOT ON` on SQL Server. A migration cannot set it (`ALTER DATABASE … SET READ_COMMITTED_SNAPSHOT` needs exclusive access and is an environment setting, not schema). Task 12's `ValidateTopology` reports an **Error** when it is off; Step 3 below checks your dev database.

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
-- Additive only: six new tables, CHECK/UNIQUE constraints, eight non-FK indexes
-- (one unique filtered, seven supporting) and column descriptions.
-- PartitionKey and DeduplicationKey use a binary collation so keys compare
-- case-sensitively and byte-exactly, as PostgreSQL does (03 §6, F9).
-- CodeGen owns __mj_CreatedAt/__mj_UpdatedAt, FK indexes, views, procedures, EntityField rows and generated classes.
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
    PartitionKey NVARCHAR(200) COLLATE Latin1_General_100_BIN2 NULL,
    Attributes NVARCHAR(4000) NULL,
    Payload NVARCHAR(MAX) NULL,
    PayloadRef NVARCHAR(2000) NULL,
    CorrelationID NVARCHAR(200) NULL,
    PublishedAt DATETIMEOFFSET(7) NOT NULL CONSTRAINT DF_WorkQueueMessage_PublishedAt DEFAULT SYSDATETIMEOFFSET(),
    PublishedByUserID UNIQUEIDENTIFIER NULL,
    CONSTRAINT PK_WorkQueueMessage PRIMARY KEY (ID),
    CONSTRAINT UQ_WorkQueueMessage_PublishOrdinal UNIQUE (PublishOrdinal),
    CONSTRAINT FK_WorkQueueMessage_Topic FOREIGN KEY (TopicID) REFERENCES ${flyway:defaultSchema}.WorkQueueTopic(ID),
    CONSTRAINT FK_WorkQueueMessage_PublishedByUser FOREIGN KEY (PublishedByUserID) REFERENCES ${flyway:defaultSchema}.[User](ID)
);
GO

-- Retention purge: messages of a topic older than its RetentionDays with no remaining deliveries.
CREATE NONCLUSTERED INDEX IX_WorkQueueMessage_Purge
    ON ${flyway:defaultSchema}.WorkQueueMessage (TopicID, PublishedAt);
GO

-- ---------------------------------------------------------------------------
-- WorkQueueDelivery
-- ---------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.WorkQueueDelivery (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_WorkQueueDelivery_ID DEFAULT NEWSEQUENTIALID(),
    MessageID UNIQUEIDENTIFIER NOT NULL,
    SubscriptionID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_WorkQueueDelivery_Status DEFAULT 'Pending',
    PartitionKey NVARCHAR(200) COLLATE Latin1_General_100_BIN2 NULL,
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

-- Filtered to Pending so the claim scan never walks retained terminal rows.
CREATE NONCLUSTERED INDEX IX_WorkQueueDelivery_Claim
    ON ${flyway:defaultSchema}.WorkQueueDelivery (SubscriptionID, VisibleAt)
    INCLUDE (PartitionKey, OrderKey, AttemptCount)
    WHERE Status = 'Pending';
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

-- Per-status counts (stats, backlog) and the dead-letter list: seeks, never an aggregate over every row.
CREATE NONCLUSTERED INDEX IX_WorkQueueDelivery_Open
    ON ${flyway:defaultSchema}.WorkQueueDelivery (SubscriptionID, Status)
    WHERE Status IN ('InFlight', 'DeadLettered');
GO

-- Retention purge and CompletedLastHour.
CREATE NONCLUSTERED INDEX IX_WorkQueueDelivery_Purge
    ON ${flyway:defaultSchema}.WorkQueueDelivery (CompletedAt)
    INCLUDE (SubscriptionID, Status)
    WHERE Status IN ('Completed', 'Discarded');
GO

-- ---------------------------------------------------------------------------
-- WorkQueueDeduplication
-- ---------------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.WorkQueueDeduplication (
    ID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_WorkQueueDeduplication_ID DEFAULT NEWSEQUENTIALID(),
    TopicID UNIQUEIDENTIFIER NOT NULL,
    DeduplicationKey NVARCHAR(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
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
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Cloud transports: the topic uses FIFO resources. Required on AWS when any subscription is Exclusive.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'IsFifo';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When 1, API callers may publish to this topic through POST /work-queue/topics/{topic}/messages. In-process code may publish to any active topic.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'AllowExternalPublish';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Largest serialized envelope accepted, in bytes (at most 262144).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'MaxPayloadBytes';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Window, in seconds, during which a DeduplicationKey suppresses repeat publishes when the publisher does not supply one.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'DefaultDeduplicationTTLSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Days completed and discarded deliveries, and their messages, are kept before the sweeper purges them (Database transport).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'RetentionDays';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Transport binding JSON imported after provisioning, for example {"SnsTopicArn":"..."}. Empty for Database topics.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'BindingConfig';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active topics accept publishes; Disabled topics reject them.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueTopic', @level2type=N'COLUMN', @level2name=N'Status';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'A consumer''s standing request for a topic''s messages: filter, partition mode, retry and lease policy, and where the handler runs.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Globally unique subscription name, used in manifests and consumer configuration.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'Name';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'What this consumer does and who owns it.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'Description';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional attribute filter as MJ CompositeFilterDescriptor JSON (03 section 4), restricted to the broker-translatable operators eq, neq, startswith, isnull and isnotnull over envelope attribute names. Null matches every message.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'Filter';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'None: no key constraints. Exclusive: one delivery in flight per partition key, no order promise. Ordered (Database transport only): a key''s deliveries run in publish order, one at a time, and a dead-lettered head blocks its key. Immutable once the subscription has deliveries.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'PartitionMode';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Attempts allowed per delivery, including lease expiries, before it is dead-lettered.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'MaxAttempts';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Base retry delay in seconds; full-jitter exponential backoff doubles it per attempt.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'BackoffBaseSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Upper bound on the retry delay, in seconds.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'BackoffMaxSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Seconds a claim lasts before it expires unless renewed by a heartbeat. Measured on the transport clock.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'LeaseSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Auto: the runtime renews the lease while the handler runs. Manual: only handler heartbeats renew it, so hung handlers are detected.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'HeartbeatMode';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Optional cap on handler run time; Auto heartbeats stop and the handler is aborted after it. Above a host''s known ceiling it produces a validation warning.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'MaxProcessingSeconds';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MJWorker: the handler runs inside an MJ server process. External: the handler runs elsewhere, for example a Lambda (cloud transports only).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'HostType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'ClassFactory key of the BaseWorkHandler registration that processes deliveries. Required for MJWorker subscriptions.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'HandlerKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Informational reference to an external consumer, for example a Lambda ARN.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'ExternalRef';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Transport binding JSON imported after provisioning, for example queue and dead-letter queue URLs. Empty for Database subscriptions.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'BindingConfig';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Active: deliveries are created and processed. Paused: deliveries are created but nothing is claimed. Disabled: no new deliveries are created.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueSubscription', @level2type=N'COLUMN', @level2name=N'Status';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'One published unit of work (the envelope). Immutable. Stored for Database-transport topics only. ID is the globally unique MessageID.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Publish order, assigned by the database. Every delivery of the message carries it as its OrderKey.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'PublishOrdinal';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Producer-supplied key used by Exclusive and Ordered subscriptions. Compared case-sensitively (binary collation).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'PartitionKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON object of string attributes (at most 10). The only envelope fields subscription filters see.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'Attributes';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Inline JSON payload. Mutually exclusive with PayloadRef.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'Payload';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'JSON claim-check reference ({"Uri":...}) to data held outside the queue.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'PayloadRef';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Caller-supplied identifier for tracing related work.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'CorrelationID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When MJ accepted the publish, on the database clock.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueMessage', @level2type=N'COLUMN', @level2name=N'PublishedAt';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'One subscription''s processing of one message: status, attempts and lease.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Pending: awaiting claim. InFlight: leased. Completed: handler succeeded. DeadLettered: exhausted or rejected, needs an operator. Discarded: cancelled or resolved by an operator.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Copy of the message partition key, populated only for Exclusive and Ordered subscriptions. Drives the in-flight uniqueness rule.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'PartitionKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Position within the partition key: always the message PublishOrdinal.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'OrderKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Claims so far, including claims whose lease expired. Reset to 0 by replay.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'AttemptCount';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'1 once an operator has replayed this delivery from the dead-letter state.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'IsReplay';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Earliest time the delivery may be claimed; retry backoff moves it forward.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'VisibleAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Worker instance holding the current lease.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'LeaseOwner';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'New value per claim; a cancel leaves it unchanged. Every heartbeat and settle must present it, so a worker that lost its lease cannot overwrite a newer claim.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'LeaseToken';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the current lease expires, on the database clock.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'LeaseExpiresAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the lease was last renewed.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'LastHeartbeatAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Latest handler progress JSON ({"Percent","Message","Checkpoint"}).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'Progress';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Most recent failure text, including LeaseExpired.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'LastError';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Why the delivery was dead-lettered: a handler reason, MaxAttemptsExceeded, LeaseExpired or HandlerNotRegistered.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'DeadLetterReason';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the delivery entered DeadLettered.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'DeadLetteredAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Terminal time for both Completed and Discarded; the retention purge key.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'CompletedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Set when an operator cancels an in-flight delivery. From then on every holder write except AcknowledgeCancel fails; the holder acknowledges and the row becomes Discarded at once, or ExpireLeases discards it when the lease runs out. Never retried.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'CancelRequestedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Operator note recorded with a replay or the reason recorded with a discard.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDelivery', @level2type=N'COLUMN', @level2name=N'ResolutionNote';
GO

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Publish deduplication ledger for every transport: a key suppresses repeat publishes to a topic until ExpiresAt.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Producer-supplied key identifying one logical message within the topic. Compared case-sensitively (binary collation).', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication', @level2type=N'COLUMN', @level2name=N'DeduplicationKey';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'MessageID of the publish that owns the key. Not a foreign key: cloud messages have no row.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication', @level2type=N'COLUMN', @level2name=N'MessageID';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Reserved: a send is in progress (short expiry) and proves nothing about its outcome. Confirmed: the publish was accepted. Only Confirmed rows make a later publish a Duplicate.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication', @level2type=N'COLUMN', @level2name=N'Status';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the key stops suppressing duplicates. Expired rows are replaced on publish and purged by the sweeper.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'WorkQueueDeduplication', @level2type=N'COLUMN', @level2name=N'ExpiresAt';
GO
```

- [ ] **Step 3: Apply the migration**

Run: `pnpm run mj:migrate`
Expected: the new migration applies with no errors.

Run (SQL Server dev database; skip on PostgreSQL):
```bash
sqlcmd -S "$DB_HOST" -d "$DB_DATABASE" -U "$DB_USERNAME" -P "$DB_PASSWORD" -Q "SELECT is_read_committed_snapshot_on FROM sys.databases WHERE name = DB_NAME()"
```
Expected: `1`. If it prints `0`, enable it on **your own** database before going further
(`ALTER DATABASE [<name>] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;`) — the Database transport requires it (03 §6).

- [ ] **Step 4: Run CodeGen against the database only — the ONE SQL pass**

Run: `pnpm exec mj codegen --skipfiles`
Expected: completes and writes a `migrations/v6/CodeGen_Run_*.sql` file.

This is the **only** CodeGen SQL pass whose output goes into the migration. CodeGen emits the `Entity` and `EntityField`
INSERTs only while an entity is *new* (`packages/CodeGenLib/src/Database/sql_codegen.ts` scopes its SQL pass to
`newEntityList ∪ modifiedEntityList`), so a second run's file would contain none of them. Never re-run CodeGen and
replace the appended tail.

- [ ] **Step 5: Append the CodeGen output**

Append at least 50 blank lines to the migration, then this block, then the full contents of the `CodeGen_Run_*.sql` file. Delete the `CodeGen_Run_*.sql` file.

```sql
/* ===========================================================================
   EVERYTHING BELOW THIS BLOCK WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL
   ---------------------------------------------------------------------------
   Contents: Entity and EntityField inserts, regenerated base views,
   spCreate/spUpdate/spDelete procedures, permission grants, and extended
   properties for the six work-queue tables above. It includes spCreate/spUpdate/
   spDelete for the driver-owned tables too: CodeGen emits them while the entities
   are new. They are never called — the API flags (metadata) and the entity save
   guards (work-queue-engine) are the protection (03 §6.7).
   DO NOT EDIT BY HAND. If the DDL above changes, re-run CodeGen and replace
   this entire generated section.
   =========================================================================== */
```

Run: `node .github/scripts/check-migration-entityfield-sequence.mjs`
Expected: exits 0 — no literal `Sequence` values in EntityField INSERTs.

Run: `grep -c "INSERT INTO" migrations/v6/*Add_Work_Queue_Schema.sql`
Expected: a non-zero count, and `grep -c "'MJ: Work Queue Deliveries'" migrations/v6/*Add_Work_Queue_Schema.sql` is at least 1 — the tail carries the entity metadata.

- [ ] **Step 6: Write the entity setting overrides**

Delivery state is **driver-owned** (03 §6.7). Beyond the write-volume flags, these three entities set
`AllowCreateAPI`, `AllowUpdateAPI` and `AllowDeleteAPI` to `false`, which removes create/update/delete from the GraphQL
API, so nobody edits a claim, a lease or a cancel flag from Explorer or a client. Task 10 adds server entity
subclasses whose `Save()`/`Delete()` fail with a clear message.

The migration's single CodeGen pass (Step 4) ran while the flags still had CodeGen's defaults (`true`,
`packages/CodeGenLib/src/Config/config.ts:465`), so the migration **does** carry `spCreate/spUpdate/spDelete` for these
tables. That is accepted (03 §6.7): the flags pushed here and the Task 10 guards are the protection, and nothing calls
the procedures.

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
      "Description": "Replay, discard or cancel deliveries through the WorkQueue remote operations. Resource: subscription name.",
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

- [ ] **Step 8b: Restrict read access to payload-bearing entities, and order the metadata folders**

CodeGen granted the `UI` role read access to every new entity. Payloads may hold personal data (03 §6.7, F7), so turn
that grant off for Messages and Deliveries. The rows already exist (Step 4 created them), so the records are addressed
by a lookup on the permission view's `Entity` and `RoleName` fields rather than by a new key.

`metadata/entity-permissions/.work-queue-permissions.json`:

```json
[
  {
    "_comments": ["Payloads may carry personal data: general UI roles do not read messages (03 §6.7)"],
    "primaryKey": { "ID": "@lookup:MJ: Entity Permissions.Entity=MJ: Work Queue Messages&RoleName=UI" },
    "fields": { "CanRead": false, "CanCreate": false, "CanUpdate": false, "CanDelete": false }
  },
  {
    "_comments": ["Deliveries carry LastError and Progress text: same rule"],
    "primaryKey": { "ID": "@lookup:MJ: Entity Permissions.Entity=MJ: Work Queue Deliveries&RoleName=UI" },
    "fields": { "CanRead": false, "CanCreate": false, "CanUpdate": false, "CanDelete": false }
  }
]
```

`metadata/.mj-sync.json` — folders missing from `directoryOrder` are pushed **alphabetically after** the listed ones
(`packages/MetadataSync/src/lib/provider-utils.ts`), which would push `work-queue-topics` (plan 08) before
`work-queue-transports` on a fresh install and fail its `@lookup`. Insert both names, in this order, immediately
before `"entities"` in the `directoryOrder` array:

```json
    "work-queue-transports",
    "work-queue-topics",
```

Run: `python3 -c "import json;o=json.load(open('metadata/.mj-sync.json'))['directoryOrder'];print(o.index('work-queue-transports') < o.index('work-queue-topics') < o.index('entities'))"`
Expected: `True`.

- [ ] **Step 9: Push the metadata, then generate files**

Run: `pnpm exec mj sync push --dir=metadata --ci --dry-run`
Expected: 3 entity updates, 2 entity-permission updates, 4 API scope creates, 1 work-queue transport create; no lookup failures.

Run: `pnpm exec mj sync push --dir=metadata --ci`
Expected: completes without errors.

Run: `pnpm exec mj codegen --skipdb`
Expected: completes; regenerates TypeScript only. **Do not** run `mj codegen --skipfiles` again (Step 4).

Run: `git status --short migrations/v6 | grep CodeGen_Run || echo "no stray CodeGen file"`
Expected: `no stray CodeGen file`.

- [ ] **Step 10: Verify the generated entity names and the gates**

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
@RegisterClass(BaseEntity, 'MJ: Work Queue Subscriptions')
@RegisterClass(BaseEntity, 'MJ: Work Queue Topics')
@RegisterClass(BaseEntity, 'MJ: Work Queue Transports')
export class MJWorkQueueDeduplicationEntity 
export class MJWorkQueueDeliveryEntity 
export class MJWorkQueueMessageEntity 
export class MJWorkQueueSubscriptionEntity 
export class MJWorkQueueTopicEntity 
export class MJWorkQueueTransportEntity 
```
If any name differs, record the actual names; Task 2 puts them in `WorkQueueEntityNames` (base package) and Tasks 10–12 import the class names — change them there only.

Run: `grep -n "get PartitionMode\|get HeartbeatMode\|get HostType" packages/MJCoreEntities/src/generated/entities/__mj.ts | head`
Expected: generated union getters exist (for example `'None' | 'Exclusive' | 'Ordered'`), confirming the CHECK constraints were read.

Run:
```bash
grep -rlE "WorkQueue(Message|Delivery|Deduplication)" packages/MJServer/src/generated | xargs grep -lE "@Mutation" 2>/dev/null | wc -l
```
Expected: `0` — after the flag push and `--skipdb` regeneration, the driver-owned entities expose no GraphQL mutations.

Run: `npm run check:codegen-tail`
Expected: exits 0 — the migration's new tables ship with their generated entity subclasses (the same command CI runs).

Run: `cd packages/MJCoreEntities && pnpm run build`
Expected: builds.

- [ ] **Step 10b: Revert the `sync` write-back**

`mj sync push` stamps `sync: { lastModified, checksum }` blocks into every metadata file it pushed — the new ones **and**
unrelated ones. A feature branch must not carry them (`migrations/CLAUDE.md`, `metadata/CLAUDE.md` rule 1).

Run:
```bash
git status --short metadata | grep -v "work-queue\|\.workqueue-scopes\|\.mj-sync.json" | awk '{print $2}'
```
For every path printed (files this task did not author), inspect `git diff <path>`: if the only change is `sync`
blocks, undo it with targeted edits (remove the added/changed `sync` lines) — do **not** use `git checkout`/`git restore`.
Then remove the `sync` blocks the push added to the four new files:

```bash
python3 - <<'PY'
import json, pathlib
for p in ["metadata/entities/.work-queue-entities.json", "metadata/api-scopes/.workqueue-scopes.json",
          "metadata/work-queue-transports/.work-queue-transports.json",
          "metadata/entity-permissions/.work-queue-permissions.json"]:
    path = pathlib.Path(p); records = json.loads(path.read_text())
    for record in records:
        record.pop("sync", None)
    path.write_text(json.dumps(records, indent=2) + "\n")
PY
grep -c '"sync"' metadata/entities/.work-queue-entities.json metadata/api-scopes/.workqueue-scopes.json metadata/work-queue-transports/.work-queue-transports.json metadata/entity-permissions/.work-queue-permissions.json
```
Expected: every count is `0`.

- [ ] **Step 11: Commit**

```bash
git status --short          # confirm only this task's files are modified
git add migrations/v6/*Add_Work_Queue_Schema.sql metadata/.mj-sync.json metadata/entities/.work-queue-entities.json \
  metadata/api-scopes/.workqueue-scopes.json metadata/work-queue-transports \
  metadata/entity-permissions/.work-queue-permissions.json \
  packages/MJCoreEntities/src/generated packages/MJServer/src/generated
git commit -m "feat(work-queue): schema, entities, API scopes and Database transport seed"
```

**Verification item (03 §6.4).** `WorkQueueMessage` clusters on its primary key, which is the producer-supplied
`MessageID` — usually a random UUID — so inserts land on random pages. Task 13's harness run reports publish
throughput; if a load test shows page-split pressure, the follow-up is a migration that makes `PK_WorkQueueMessage`
NONCLUSTERED and clusters `UQ_WorkQueueMessage_PublishOrdinal`. Record the measured publish rate in the PR description.

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
- Test: `packages/WorkQueue/engine/src/__tests__/sqlExecution.test.ts`, `src/__tests__/engineEntryGuard.test.ts`

**Interfaces:**
- Consumes: entity names verified in Task 1.
- Produces (base — `@memberjunction/work-queue-base`):
  - Constants `WorkQueueEntityNames`, `DATABASE_DRIVER_CLASS = 'Database'`
  - `IsWorkJson(value: unknown): value is WorkJson` (both tiers validate JSON columns)
  - **No cross-package re-exports (03 §0, F13):** the engine and plans 06–08 import these from `@memberjunction/work-queue-base` directly; the engine never re-exports them.
  - A `./testing` subpath export (`@memberjunction/work-queue-base/testing`), filled in Task 10 with row fixtures, so test data never ships in the production index.
- Produces (engine):
  - `type SqlParam = string | number | boolean | Date | null`; `interface SqlStatement { SQL: string; Params: SqlParam[] }`
  - `interface WorkQueueSqlExecutor` (03 §11 plus `BuildParameterPlaceholder(index: number): string`), `interface WorkQueueTransactionalExecutor extends WorkQueueSqlExecutor { BeginEntityTransaction(): Promise<EntityTransactionScope> }`, `interface WorkQueueIndependentExecutor extends WorkQueueTransactionalExecutor { ReleaseIndependentInstance(): Promise<void> }`, `interface WorkQueueExecutorSource extends WorkQueueTransactionalExecutor { CreateIndependentInstance(): Promise<WorkQueueIndependentExecutor> }`, `type SqlBuilderContext = Pick<WorkQueueSqlExecutor, 'MJCoreSchemaName' | 'QuoteIdentifier' | 'BuildParameterPlaceholder'>`
  - `IsWorkQueueTransactionalExecutor(value: object | null | undefined): value is WorkQueueTransactionalExecutor`, `IsWorkQueueExecutorSource(value: object | null | undefined): value is WorkQueueExecutorSource`
  - `class SqlParamList { constructor(context: Pick<SqlBuilderContext, 'BuildParameterPlaceholder'>); Add(value: SqlParam): string; get Values(): SqlParam[] }`
  - `QualifiedTable(context: SqlBuilderContext, table: string): string`, `ExecuteWrite(executor: WorkQueueSqlExecutor, statement: SqlStatement, contextUser: UserInfo): Promise<number>`, `ExecuteRows<T>(executor: WorkQueueSqlExecutor, statement: SqlStatement, contextUser: UserInfo): Promise<T[]>`, `IsUniqueViolation(error: unknown, indexName: string): boolean` (platform error number/SQLSTATE **and** the index name), `IsTransientDatabaseError(error: unknown): boolean`, `ToNumber(value: number | string | bigint | null | undefined): number | null`, `ToBoolean(value: boolean | number | string | null | undefined): boolean`, `ToIsoString(value: Date | string | null | undefined): string | null`, `ErrorText(error: unknown): string`
  - Constants `WorkQueueTables`, `type WorkQueueTableName`, `IN_FLIGHT_PARTITION_INDEX`, `DELIVERY_SUBSCRIPTION_MESSAGE_INDEX`, `MESSAGE_PRIMARY_KEY`, `DEDUPLICATION_KEY_INDEX`, `DEDUP_RESERVATION_SECONDS = 120`, `DELIVERY_INSERT_CHUNK = 250`, `BACKLOG_COUNT_CAP = 1000`, `PUBLISH_LOCK_TIMEOUT_MS = 5000`, `SWEEP_LOCK_RESOURCE = 'mj-wq-sweep'`
  - Test fakes: `class RecordingExecutor implements WorkQueueExecutorSource, WorkQueueIndependentExecutor` (`Calls` — each tagged with the `Executor` that ran it and whether it was `InTransaction` — `Events`, `QueueRows(rows)`, `QueueError(error)`, `CallsOn(tag)`); `CreateIndependentInstance()` returns a **tagged child** (`independent#1`, `independent#2`, …) sharing the parent's queue and log, so a statement issued on the wrong executor fails a test; `TEST_USER`
  - An engine package whose **main entry never imports `@memberjunction/work-queue-aws`** (03 §0, F12), guarded by a test. `package.json` declares `exports` for `.` only; plan 07 adds the `./aws` subpath (AWS driver factory) together with the `work-queue-aws` dependency.

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
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./testing": { "types": "./dist/testing/index.d.ts", "default": "./dist/testing/index.js" }
  },
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

`packages/WorkQueue/base/tsconfig.json` — **its own compiler options** (03 §0). `tsconfig.server.json` includes the `dom`
lib and leaves `types` open, so with `@types/node` installed both `window` and `Buffer`/`process` would type-check
silently. The base package overrides both, so a Node or DOM global fails the build:

```json
{
  "extends": "../../../tsconfig.server.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["es2022", "esnext.asynciterable"],
    "types": []
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "src/__tests__", "vitest.config.ts"]
}
```

`packages/WorkQueue/base/vitest.config.ts`:

```typescript
import { defineProject, mergeConfig } from 'vitest/config';
import sharedConfig from '../../../vitest.shared';

export default mergeConfig(sharedConfig, defineProject({ test: { environment: 'node' } }));
```

`packages/WorkQueue/base/src/testing/index.ts` (filled in Task 10; created now so the `./testing` export resolves):

```typescript
export {};
```

`packages/WorkQueue/base/src/constants.ts`:

```typescript
/** Generated entity names for the work-queue tables (Task 1). Verify against the generated entity subclasses. */
export const WorkQueueEntityNames = {
    Transports: 'MJ: Work Queue Transports',
    Topics: 'MJ: Work Queue Topics',
    Subscriptions: 'MJ: Work Queue Subscriptions',
    Messages: 'MJ: Work Queue Messages',
    Deliveries: 'MJ: Work Queue Deliveries',
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
import { fileURLToPath } from 'node:url';

const ALLOWED = new Set([
    '@memberjunction/core', '@memberjunction/core-entities', '@memberjunction/global', '@memberjunction/work-queue-core',
]);

const NODE_BUILTINS = 'assert|buffer|child_process|cluster|crypto|dns|events|fs|http|https|net|os|path|process|readline|stream|tls|url|util|worker_threads|zlib';
const SERVER_ONLY = '@memberjunction/sql-dialect|@memberjunction/work-queue-engine|@memberjunction/work-queue-aws';
/** Matches `from '…'`, side-effect `import '…'`, `require('…')` and `export … from '…'`, single- or double-quoted. */
const FORBIDDEN_IMPORT = new RegExp(
    `(?:from\\s*|import\\s*|require\\(\\s*)['"](?:node:[^'"]+|(?:${NODE_BUILTINS})(?:/[^'"]*)?|(?:${SERVER_ONLY})(?:/[^'"]*)?)['"]`,
);

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
        const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')) as {
            dependencies?: Record<string, string>;
        };
        for (const name of Object.keys(pkg.dependencies ?? {})) {
            expect(ALLOWED.has(name), `unexpected dependency ${name}`).toBe(true);
        }
    });

    it('imports nothing server-only (node builtins, sql-dialect, the engine, drivers)', () => {
        const offenders: string[] = [];
        for (const file of SourceFiles(fileURLToPath(new URL('../', import.meta.url)))) {
            if (FORBIDDEN_IMPORT.test(readFileSync(file, 'utf8'))) {
                offenders.push(file);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('recognises every import form', () => {
        const forbidden = [
            `import { readFileSync } from 'node:fs';`, `import fs from "fs";`, `import 'node:crypto';`,
            `const os = require('os');`, `import { SQLDialect } from "@memberjunction/sql-dialect";`,
            `import '@memberjunction/work-queue-engine';`, `export * from '@memberjunction/work-queue-aws';`,
        ];
        for (const line of forbidden) {
            expect(FORBIDDEN_IMPORT.test(line), line).toBe(true);
        }
        expect(FORBIDDEN_IMPORT.test(`import { UserInfo } from '@memberjunction/core';`)).toBe(false);
        expect(FORBIDDEN_IMPORT.test(`import { x } from './paths';`)).toBe(false);
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
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
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

Plan 07 adds a second `exports` entry, `"./aws"` (`dist/aws/index.js`), plus the `@memberjunction/work-queue-aws` and
`@aws-sdk/credential-providers` dependencies. **Nothing under `src/` outside `src/aws/` may import
`@memberjunction/work-queue-aws`** (03 §0, F12): server bootstraps import the `./aws` subpath; data-provider consumers
that only need the main entry never load an AWS client. Step 7 guards this.

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
Expected: the dependency-guard suite passes (3) and the package builds. Build `base` before `engine` from here on.

- [ ] **Step 2: Write `src/constants.ts`**

```typescript
/** Physical table names (03 §6). */
export const WorkQueueTables = {
    Transport: 'WorkQueueTransport',
    Topic: 'WorkQueueTopic',
    Subscription: 'WorkQueueSubscription',
    Message: 'WorkQueueMessage',
    Delivery: 'WorkQueueDelivery',
    Deduplication: 'WorkQueueDeduplication',
} as const;

export type WorkQueueTableName = typeof WorkQueueTables[keyof typeof WorkQueueTables];

// Entity names and the Database DriverClass live in `@memberjunction/work-queue-base`; import them from there
// (no cross-package re-exports — 03 §0).

/** Unique index enforcing one in-flight delivery per (subscription, partition key). */
export const IN_FLIGHT_PARTITION_INDEX = 'UQ_WorkQueueDelivery_InFlightPartition';

/** Unique constraint enforcing one delivery per (subscription, message). */
export const DELIVERY_SUBSCRIPTION_MESSAGE_INDEX = 'UQ_WorkQueueDelivery_Subscription_Message';

/** Primary key of WorkQueueMessage: MessageID is globally unique (03 §2.1, F10). */
export const MESSAGE_PRIMARY_KEY = 'PK_WorkQueueMessage';

/** Unique constraint enforcing one ledger row per (topic, deduplication key). */
export const DEDUPLICATION_KEY_INDEX = 'UQ_WorkQueueDeduplication_Topic_Key';

/** Lifetime of a Reserved ledger row while a cloud send is in progress (03 §2.1). */
export const DEDUP_RESERVATION_SECONDS = 120;

/** Deliveries per INSERT statement (4 bound values per row, well under SQL Server's 2,100 parameter limit). */
export const DELIVERY_INSERT_CHUNK = 250;

/** Backlog and scaler counts stop here (03 §7 "Bounded work"): an autoscaler never needs more. */
export const BACKLOG_COUNT_CAP = 1000;

/** How long a publish waits for a per-key publish-order lock before failing as retryable (03 §7). */
export const PUBLISH_LOCK_TIMEOUT_MS = 5000;

/** Session-level application lock that lets one sweeper run at a time (03 §7). */
export const SWEEP_LOCK_RESOURCE = 'mj-wq-sweep';
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

const UNIQUE_VIOLATION_CODES = new Set(['2601', '2627', '23505']);
const TRANSIENT_CODES = new Set(['1205', '1222', '40P01', '40001', '55P03']);

/**
 * True when a database error is a unique violation **of the named index or constraint**. Both halves are required:
 * the platform code (SQL Server 2601/2627, PostgreSQL SQLSTATE 23505) says it is a unique violation, and the name says
 * which one — an unrelated error whose text merely mentions the index never matches. Names compare case-insensitively
 * because PostgreSQL folds unquoted identifiers.
 */
export function IsUniqueViolation(error: unknown, indexName: string): boolean {
    const codes = ErrorCodes(error);
    const text = ErrorText(error).toLowerCase();
    const isUnique = codes.some(code => UNIQUE_VIOLATION_CODES.has(code))
        || text.includes('duplicate key') || text.includes('unique constraint');
    return isUnique && text.includes(indexName.toLowerCase());
}

/** Deadlocks, serialization failures and lock timeouts: safe to retry the whole operation. */
export function IsTransientDatabaseError(error: unknown): boolean {
    if (ErrorCodes(error).some(code => TRANSIENT_CODES.has(code.toUpperCase()))) {
        return true;
    }
    const text = ErrorText(error).toLowerCase();
    return text.includes('deadlock')
        || text.includes('could not serialize')
        || text.includes('lock request time out')
        || text.includes('lock timeout');
}

/** Driver error codes (`number` on mssql, `code` on pg), following `cause`/`originalError` one level down. */
export function ErrorCodes(error: unknown): string[] {
    const codes: string[] = [];
    const visit = (value: unknown): void => {
        if (typeof value !== 'object' || value === null) {
            return;
        }
        if ('number' in value && (typeof value.number === 'number' || typeof value.number === 'string')) {
            codes.push(String(value.number));
        }
        if ('code' in value && (typeof value.code === 'number' || typeof value.code === 'string')) {
            codes.push(String(value.code));
        }
    };
    visit(error);
    if (typeof error === 'object' && error !== null) {
        visit('cause' in error ? error.cause : null);
        visit('originalError' in error ? error.originalError : null);
    }
    return codes;
}

/** Message text, including a PostgreSQL error's `constraint` name when the driver supplies one. */
export function ErrorText(error: unknown): string {
    if (error instanceof Error) {
        const constraint = 'constraint' in error && typeof error.constraint === 'string' ? ` [${error.constraint}]` : '';
        return `${error.message}${constraint}`;
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
    /** Which executor ran the statement: 'source', or 'independent#N' for the Nth minted instance. */
    Executor: string;
    /** True when that executor had an open transaction scope. */
    InTransaction: boolean;
}

type QueuedResponse = { Kind: 'Rows'; Rows: object[] } | { Kind: 'Error'; Error: Error };

/**
 * Records every statement and answers with queued row sets (or errors) in order. An empty queue answers with no
 * rows. `CreateIndependentInstance()` returns a **tagged child** that shares this executor's response queue, call log
 * and event log, so tests can assert *which* executor ran a statement (03 §11 "Executor ownership"): a regression that
 * issues queue SQL on the shared source, or an in-transaction statement outside its transaction, is visible.
 */
export class RecordingExecutor implements WorkQueueExecutorSource, WorkQueueIndependentExecutor {
    public readonly Calls: RecordedCall[];
    public readonly Events: string[];
    public readonly MJCoreSchemaName = '__mj';
    public readonly Dialect: SQLDialect;
    public readonly Tag: string;
    private readonly responses: QueuedResponse[];
    private readonly root: RecordingExecutor;
    private minted = 0;
    private openScopes = 0;

    constructor(public readonly PlatformKey: DatabasePlatform = 'sqlserver', parent?: RecordingExecutor) {
        this.Dialect = PlatformKey === 'sqlserver' ? new SQLServerDialect() : new PostgreSQLDialect();
        this.root = parent ? parent.root : this;
        this.Calls = parent ? parent.Calls : [];
        this.Events = parent ? parent.Events : [];
        this.responses = parent ? parent.responses : [];
        this.Tag = parent ? `independent#${++parent.root.minted}` : 'source';
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

    /** Calls run by the executor with this tag (`'source'`, `'independent#1'`, …). */
    public CallsOn(tag: string): RecordedCall[] {
        return this.Calls.filter(call => call.Executor === tag);
    }

    public async ExecuteSQL<T>(sql: string, parameters?: SqlParam[], options?: ExecuteSQLOptions): Promise<T[]> {
        this.Calls.push({ SQL: sql, Params: parameters ?? [], Options: options, Executor: this.Tag, InTransaction: this.openScopes > 0 });
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
        this.openScopes++;
        let settled = false;
        const settle = (event: string): void => {
            if (!settled) {
                settled = true;
                this.openScopes--;
                this.Events.push(event);
            }
        };
        return {
            IsNested: false,
            Commit: async () => settle('commit'),
            Rollback: async () => settle('rollback'),
        };
    }

    public async CreateIndependentInstance(): Promise<WorkQueueIndependentExecutor> {
        this.Events.push('independent');
        return new RecordingExecutor(this.PlatformKey, this);
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
    it('recognises a unique violation by platform code and index name', () => {
        const index = 'UQ_WorkQueueDelivery_InFlightPartition';
        const sqlServer = Object.assign(new Error(`Cannot insert duplicate key row in object with unique index '${index}'`), { number: 2601 });
        const postgres = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505', constraint: index.toLowerCase() });
        const wrapped = Object.assign(new Error(`Violation of UNIQUE KEY constraint '${index}'`), { originalError: { number: 2627 } });
        expect(IsUniqueViolation(sqlServer, index)).toBe(true);
        expect(IsUniqueViolation(postgres, index)).toBe(true);
        expect(IsUniqueViolation(wrapped, index)).toBe(true);
    });

    it('does not mistake other errors that mention the index for a unique violation', () => {
        const index = 'UQ_WorkQueueDelivery_InFlightPartition';
        expect(IsUniqueViolation(new Error(`deadlock victim while scanning ${index}`), index)).toBe(false);
        const otherIndex = Object.assign(new Error("duplicate key in 'UQ_Other'"), { number: 2601 });
        expect(IsUniqueViolation(otherIndex, index)).toBe(false);
    });

    it('classifies deadlocks and serialization failures as transient', () => {
        expect(IsTransientDatabaseError(new Error('Transaction was deadlocked on lock resources'))).toBe(true);
        expect(IsTransientDatabaseError(new Error('ERROR 40P01: deadlock detected'))).toBe(true);
        expect(IsTransientDatabaseError(new Error('could not serialize access'))).toBe(true);
        expect(IsTransientDatabaseError(Object.assign(new Error('x'), { number: 1205 }))).toBe(true);
        expect(IsTransientDatabaseError(Object.assign(new Error('canceling statement due to lock timeout'), { code: '55P03' }))).toBe(true);
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

describe('RecordingExecutor', () => {
    it('tags calls with the executor that ran them and whether a transaction was open', async () => {
        const source = new RecordingExecutor().QueueRows([{ A: 1 }]);
        const independent = await source.CreateIndependentInstance();
        const scope = await independent.BeginEntityTransaction();
        expect(await independent.ExecuteSQL('SELECT 1')).toEqual([{ A: 1 }]);
        await scope.Commit();
        await source.ExecuteSQL('SELECT 2');
        expect(source.Calls.map(call => [call.Executor, call.InTransaction])).toEqual([['independent#1', true], ['source', false]]);
        expect(source.CallsOn('independent#1')).toHaveLength(1);
        expect(source.Events).toEqual(['independent', 'begin', 'commit']);
    });
});
```

`packages/WorkQueue/engine/src/__tests__/engineEntryGuard.test.ts` — the F12 guard. It passes trivially now and keeps
passing after plan 07 adds `src/aws/`, because that folder is the only place allowed to import the AWS package:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../', import.meta.url));
const AWS_IMPORT = /(?:from\s*|import\s*|require\(\s*)['"](?:@memberjunction\/work-queue-aws|@aws-sdk\/)[^'"]*['"]/;

function SourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap(entry => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            return entry === '__tests__' || full === join(SRC, 'aws') ? [] : SourceFiles(full);
        }
        return full.endsWith('.ts') ? [full] : [];
    });
}

describe('engine main entry (03 §0, F12)', () => {
    it('never imports the AWS package or an AWS SDK client outside src/aws', () => {
        const offenders = SourceFiles(SRC).filter(file => AWS_IMPORT.test(readFileSync(file, 'utf8')));
        expect(offenders.map(file => file.split(sep).slice(-2).join('/'))).toEqual([]);
    });

    it('never re-exports another package (03 §0, F13)', () => {
        const reExport = /export\s+(?:\*|\{[^}]*\})\s+from\s+['"]@memberjunction\//;
        const offenders = SourceFiles(SRC).filter(file => reExport.test(readFileSync(file, 'utf8')));
        expect(offenders.map(file => file.split(sep).slice(-2).join('/'))).toEqual([]);
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
Expected: PASS — sqlExecution (17), engineEntryGuard (2).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds with no errors.

- [ ] **Step 11: Commit**

```bash
git add packages/WorkQueue/base packages/WorkQueue/engine pnpm-lock.yaml
git commit -m "feat(work-queue): base and engine package scaffolds, SQL executor seam and execution helpers"
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
  - Row types in `rows.ts`: `MessageInsertRow`, `MessageInsertedRow`, `ExistingMessageRow`, `DeliveryInsertRow`, `ReservationRow`, `ClaimedDeliveryRow`, `PartitionCandidateRow`, `LeaseStateRow`, `StatsRow`, `DeadLetterRow`, `PartitionRow`, `ExpiredDeadLetterRow`, `BacklogRow`, `SweepLockRow`, `IsolationRow`, `DeadLetterCursor`, `type ClaimPartitionMode = 'Exclusive' | 'Ordered'`, `type BacklogPartitionMode = ClaimPartitionMode | 'None'`
  - Interfaces `PublishSqlBuilder`, `ConsumeSqlBuilder`, `OperatorSqlBuilder`, `WorkQueueSqlBuilder { readonly Publish; readonly Consume; readonly Operator }` (method list below — Tasks 4–6 implement them)
  - `PublishOrderLockResource(topicID: string, partitionKey: string): string`
  - `abstract class StatementBase { constructor(context: SqlBuilderContext) }`
  - `class SqlServerPublishSql extends StatementBase implements PublishSqlBuilder`

Builder method contract (row-returning methods say so; every other method returns a bare guarded write for `ExecuteWrite`):

| Interface | Method | Returns |
| --- | --- | --- |
| Publish | `PreparePublishOrderLock(timeoutMs)` | statement or `null` (PostgreSQL sets `lock_timeout` for the transaction; SQL Server passes the timeout to `sp_getapplock`) |
| Publish | `AcquirePublishOrderLock(topicID, partitionKey, timeoutMs)` | rows `{ LockResult }`; a timeout raises an error `IsTransientDatabaseError` recognises |
| Publish | `InsertMessage(row: MessageInsertRow)` | rows `MessageInsertedRow` (0 = a message with this ID already exists) |
| Publish | `SelectMessage(messageID)` | rows `ExistingMessageRow` (0–1) |
| Publish | `InsertDeliveries(rows: DeliveryInsertRow[])` | write |
| Publish | `ReserveDeduplication(topicID, key, messageID, reserveSeconds)` | rows `ReservationRow` (1 = this call took or re-took the key; 0 = someone else holds it) |
| Publish | `SelectDeduplicationOwner(topicID, key)` | rows `ReservationRow` (0–1) |
| Publish | `ConfirmDeduplication(topicID, key, messageID, ttlSeconds)` | write |
| Publish | `ReleaseDeduplication(topicID, key, messageID)` | write |
| Publish | `PurgeExpiredDeduplications(batchSize)` | write |
| Consume | `ExpireLeases(subscriptionID, maxAttempts)` | rows `ExpiredDeadLetterRow` — **only** the rows it dead-lettered, on both dialects |
| Consume | `SubscriptionBacklog(subscriptionID, mode, cap)` | rows `BacklogRow` (exactly 1), each count capped |
| Consume | `ClaimUnpartitioned(subscriptionID, leaseOwner, leaseSeconds, maxRows)` | rows `ClaimedDeliveryRow` |
| Consume | `SelectPartitionCandidates(subscriptionID, mode, maxRows)` | rows `PartitionCandidateRow` |
| Consume | `ClaimPartitionCandidate(subscriptionID, deliveryID, mode, leaseOwner, leaseSeconds)` | rows `ClaimedDeliveryRow` (0–1) |
| Consume | `ExtendLease(deliveryID, leaseToken, leaseSeconds, progressJSON)` | write |
| Consume | `SelectLeaseState(deliveryID, leaseToken)` | rows `LeaseStateRow` (0–1) — tells `Cancelled` from `Lost` after a zero-row `ExtendLease` |
| Consume | `CompleteDelivery(deliveryID, leaseToken)` | write |
| Consume | `RetryDelivery(deliveryID, leaseToken, delaySeconds, error)` | write |
| Consume | `DeadLetterDelivery(deliveryID, leaseToken, reason, error)` | write |
| Consume | `ReleaseDelivery(deliveryID, leaseToken)` | write |
| Consume | `AcknowledgeCancel(deliveryID, leaseToken)` | write (1 = the cancelled delivery is now `Discarded`) |
| Consume | `ShiftTimestampsForConformance(subscriptionID, seconds)` | write |
| Operator | `SubscriptionStats(subscriptionID, ordered)` | rows `StatsRow` (1) — per-status index seeks |
| Operator | `ListDeadLetters(subscriptionID, ordered, after, pageSize)` | rows `DeadLetterRow` |
| Operator | `ListPartitions(subscriptionID, ordered, condition, afterPartitionKey, pageSize)` | rows `PartitionRow` |
| Operator | `ReplayDelivery(subscriptionID, deliveryID, actorUserID, note)` | write |
| Operator | `DiscardDelivery(subscriptionID, deliveryID, allowPending, actorUserID, reason)` | write |
| Operator | `CancelInFlightDelivery(subscriptionID, deliveryID, actorUserID, reason)` | write (1 = cancel flag set; the lease token is left **unchanged**) |
| Operator | `ExpireLeasesAll(batchSize = EXPIRE_LEASES_BATCH)` | rows `ExpiredDeadLetterRow` — only dead-lettered rows |
| Operator | `AcquireSweepLock(resource)` | rows `SweepLockRow` (1) |
| Operator | `ReadCommittedSnapshotState()` | rows `IsolationRow` (1) |
| Operator | `PurgeTerminalDeliveries(batchSize)` / `PurgeOrphanMessages(batchSize)` | write |

Design notes that the statements in Tasks 3–6 implement (03 §2.1, §7):

- **`MessageID` is globally unique (F10).** `InsertMessage` inserts only when no row has the ID (a single primary-key seek under a range lock on SQL Server, `ON CONFLICT DO NOTHING` on PostgreSQL). When it inserts nothing, the driver runs `SelectMessage` as a **separate statement** — inside a PostgreSQL CTE the snapshot cannot see a row a concurrent publisher has just committed — and compares canonical envelopes.
- **`PublishedAt` is the database clock.** The builder never binds it: the column default (SQL Server) or `now()` (PostgreSQL) supplies it.
- **The ledger follows F1.** `ReserveDeduplication` takes the key when it is free, replaces an expired row in place, and **re-takes a `Reserved` row owned by the same `MessageID`** (refreshing its expiry). Anything else yields no row and the ledger reads the owner with `SelectDeduplicationOwner`.
- **No sequence state.** `OrderKey` is always the message's `PublishOrdinal`; there is no partition-state table.

- [ ] **Step 1: Write `src/sql/rows.ts`**

```typescript
import type { PartitionCondition } from '@memberjunction/work-queue-core';

/** Values for one WorkQueueMessage insert. JSON columns are pre-serialised. PublishedAt is the database clock. */
export interface MessageInsertRow {
    ID: string;
    TopicID: string;
    PartitionKey: string | null;
    AttributesJSON: string | null;
    PayloadJSON: string | null;
    PayloadRefJSON: string | null;
    CorrelationID: string | null;
    PublishedByUserID: string | null;
}

export interface MessageInsertedRow {
    ID: string;
    PublishOrdinal: number | string;
}

/** The stored message with a given MessageID, for the canonical-envelope comparison (03 §2.1, F10). */
export interface ExistingMessageRow {
    ID: string;
    TopicID: string;
    PartitionKey: string | null;
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
    /** Always the message's PublishOrdinal. */
    OrderKey: number;
}

/** A ledger row: who owns a deduplication key and whether the publish was confirmed. */
export interface ReservationRow {
    MessageID: string;
    Status: 'Reserved' | 'Confirmed';
}

export interface ClaimedDeliveryRow {
    DeliveryID: string;
    AttemptCount: number | string;
    LeaseToken: string;
    LeaseExpiresAt: Date | string;
    IsReplay: boolean | number;
    MessageID: string;
    PartitionKey: string | null;
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

/** Present when the delivery is still InFlight under this token; CancelRequested tells Cancelled from Lost. */
export interface LeaseStateRow {
    CancelRequested: boolean | number;
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
    WaitingItems: number | string;
}

/** A delivery that an expire pass moved to DeadLettered; feeds the engine's NotifyDeadLettered seam (03 §11). */
export interface ExpiredDeadLetterRow {
    DeliveryID: string;
    SubscriptionID: string;
    PartitionKey: string | null;
    /** The DeadLetterReason the statement wrote ('LeaseExpired'); passed through, never hardcoded by callers. */
    Reason: string;
}

/** One row from SubscriptionBacklog: the autoscaler metric (03 §11). Each count is capped. */
export interface BacklogRow {
    Claimable: number | string;
    InFlight: number | string;
}

export interface SweepLockRow {
    Acquired: boolean | number;
}

/** READ_COMMITTED_SNAPSHOT state (SQL Server); always true on PostgreSQL, which is MVCC by design. */
export interface IsolationRow {
    SnapshotOn: boolean | number;
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
import type { BacklogPartitionMode, ClaimPartitionMode, DeadLetterCursor, DeliveryInsertRow, MessageInsertRow } from './rows';

/** Statements used while publishing and by the deduplication ledger. */
export interface PublishSqlBuilder {
    /** Per-transaction setup the platform needs before taking publish-order locks; null when none. */
    PreparePublishOrderLock(timeoutMs: number): SqlStatement | null;
    AcquirePublishOrderLock(topicID: string, partitionKey: string, timeoutMs: number): SqlStatement;
    /** Inserts when no message has this ID; returns the inserted row, or nothing when one exists. */
    InsertMessage(row: MessageInsertRow): SqlStatement;
    SelectMessage(messageID: string): SqlStatement;
    InsertDeliveries(rows: DeliveryInsertRow[]): SqlStatement;
    /** Takes a free or expired key, or re-takes this MessageID's own Reserved row; returns the row it now owns (0–1). */
    ReserveDeduplication(topicID: string, key: string, messageID: string, reserveSeconds: number): SqlStatement;
    SelectDeduplicationOwner(topicID: string, key: string): SqlStatement;
    ConfirmDeduplication(topicID: string, key: string, messageID: string, ttlSeconds: number): SqlStatement;
    ReleaseDeduplication(topicID: string, key: string, messageID: string): SqlStatement;
    PurgeExpiredDeduplications(batchSize: number): SqlStatement;
}

/** Statements used by a Database consumer: expire, claim, heartbeat, settle, acknowledge a cancel. */
export interface ConsumeSqlBuilder {
    /** Returns ONLY the deliveries this pass dead-lettered (`ExpiredDeadLetterRow`), identically on both dialects. */
    ExpireLeases(subscriptionID: string, maxAttempts: number): SqlStatement;
    ClaimUnpartitioned(subscriptionID: string, leaseOwner: string, leaseSeconds: number, maxRows: number): SqlStatement;
    /** Visible Pending rows that satisfy the partition rules, oldest first. May return several rows of one key for
     *  Exclusive — the consumer keeps the first per key (03 §7: at most one row per key per claim batch). */
    SelectPartitionCandidates(subscriptionID: string, mode: ClaimPartitionMode, maxRows: number): SqlStatement;
    /** Autoscaler metric (03 §11): claimable Pending under the partition rules, plus InFlight. One row, each count capped. */
    SubscriptionBacklog(subscriptionID: string, mode: BacklogPartitionMode, cap: number): SqlStatement;
    ClaimPartitionCandidate(subscriptionID: string, deliveryID: string, mode: ClaimPartitionMode,
                            leaseOwner: string, leaseSeconds: number): SqlStatement;
    ExtendLease(deliveryID: string, leaseToken: string, leaseSeconds: number, progressJSON: string | null): SqlStatement;
    SelectLeaseState(deliveryID: string, leaseToken: string): SqlStatement;
    CompleteDelivery(deliveryID: string, leaseToken: string): SqlStatement;
    RetryDelivery(deliveryID: string, leaseToken: string, delaySeconds: number, error: string): SqlStatement;
    DeadLetterDelivery(deliveryID: string, leaseToken: string, reason: string, error: string | null): SqlStatement;
    ReleaseDelivery(deliveryID: string, leaseToken: string): SqlStatement;
    /** Token-fenced and requires CancelRequestedAt: the cancelled delivery becomes Discarded now (03 §7, F2). */
    AcknowledgeCancel(deliveryID: string, leaseToken: string): SqlStatement;
    ShiftTimestampsForConformance(subscriptionID: string, seconds: number): SqlStatement;
}

/** Statements used by the operator, the sweeper and topology validation. */
export interface OperatorSqlBuilder {
    SubscriptionStats(subscriptionID: string, ordered: boolean): SqlStatement;
    ListDeadLetters(subscriptionID: string, ordered: boolean, after: DeadLetterCursor | null, pageSize: number): SqlStatement;
    ListPartitions(subscriptionID: string, ordered: boolean, condition: PartitionCondition | null,
                   afterPartitionKey: string | null, pageSize: number): SqlStatement;
    ReplayDelivery(subscriptionID: string, deliveryID: string, actorUserID: string | null, note: string | null): SqlStatement;
    DiscardDelivery(subscriptionID: string, deliveryID: string, allowPending: boolean, actorUserID: string | null, reason: string): SqlStatement;
    /** Cancels an in-flight delivery (03 §7, F2): stamps CancelRequestedAt. The lease token is left unchanged. */
    CancelInFlightDelivery(subscriptionID: string, deliveryID: string, actorUserID: string | null, reason: string): SqlStatement;
    /** Sweeper-wide expiry in bounded batches; same result shape as `ConsumeSqlBuilder.ExpireLeases`. */
    /** `batchSize` defaults to EXPIRE_LEASES_BATCH (500): plan 06's sweeper calls it with no argument. */
    ExpireLeasesAll(batchSize?: number): SqlStatement;
    /** Transaction-scoped, non-blocking application lock (03 §7 "one sweeper at a time"). One row, `SweepLockRow`. */
    AcquireSweepLock(resource: string): SqlStatement;
    /** Database prerequisite check (03 §6): READ_COMMITTED_SNAPSHOT on SQL Server. One row, `IsolationRow`. */
    ReadCommittedSnapshotState(): SqlStatement;
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
 * commit order (sp_getapplock allows 255 characters: 3 + 36 + 1 + 200 fits). The key is used **exactly as supplied**:
 * partition keys compare byte-exactly on both dialects (03 §6 "Key collation"), so 'Venue-42' and 'venue-42' are two
 * keys and take two locks.
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
    AttributesJSON: '{"eventType":"import"}',
    PayloadJSON: '{"importId":"x"}',
    PayloadRefJSON: null,
    CorrelationID: 'corr-1',
    PublishedByUserID: null,
};

describe('PublishOrderLockResource', () => {
    it('normalises the topic ID and keeps the key exactly as supplied', () => {
        expect(PublishOrderLockResource(TOPIC, 'Venue-42')).toBe('wq:aaaaaaaa-0000-0000-0000-000000000001:Venue-42');
        expect(PublishOrderLockResource(TOPIC, 'venue-42')).not.toBe(PublishOrderLockResource(TOPIC, 'Venue-42'));
    });
});

describe('SqlServerPublishSql publish-order lock', () => {
    it('needs no per-transaction preparation', () => {
        expect(sql.PreparePublishOrderLock(5000)).toBeNull();
    });

    it('takes a transaction-owned exclusive application lock with a timeout and fails loudly', () => {
        const statement = sql.AcquirePublishOrderLock(TOPIC, 'venue-42', 5000);
        expect(statement.SQL).toContain("sp_getapplock @Resource = @p0, @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = @p1");
        expect(statement.SQL).toContain("IF @LockResult = -1 THROW 51001, N'WorkQueue publish-order lock timeout', 1;");
        expect(statement.SQL).toContain('IF @LockResult < 0 THROW 51000');
        expect(statement.SQL.endsWith('SELECT @LockResult AS [LockResult];')).toBe(true);
        expect(statement.Params).toEqual([PublishOrderLockResource(TOPIC, 'venue-42'), 5000]);
    });
});

describe('SqlServerPublishSql.InsertMessage', () => {
    const statement = sql.InsertMessage(MESSAGE);

    it('inserts only when no message has the ID, under a single primary-key range lock', () => {
        expect(statement.SQL).toContain('WHERE NOT EXISTS (SELECT 1 FROM [__mj].[WorkQueueMessage] WITH (UPDLOCK, HOLDLOCK) WHERE [ID] = @p0)');
        expect(statement.SQL).not.toContain(' OR ');
    });

    it('captures the identity through a table variable and returns one result set', () => {
        expect(statement.SQL).toContain('OUTPUT inserted.[ID], inserted.[PublishOrdinal] INTO @Inserted');
        expect(statement.SQL.endsWith('SELECT [ID], [PublishOrdinal] FROM @Inserted;')).toBe(true);
    });

    it('binds every value in column order and leaves PublishedAt to the database clock', () => {
        expect(statement.SQL).not.toContain('[PublishedAt]');
        expect(statement.Params).toEqual([MSG, TOPIC, 'venue-42', '{"eventType":"import"}', '{"importId":"x"}', null, 'corr-1', null]);
    });

    it('reads an existing message for the canonical-envelope comparison', () => {
        const existing = sql.SelectMessage(MSG);
        expect(existing.SQL).toContain('SELECT [ID], [TopicID], [PartitionKey], [Attributes], [Payload], [PayloadRef], [CorrelationID]');
        expect(existing.SQL).toContain('WHERE [ID] = @p0');
        expect(existing.Params).toEqual([MSG]);
    });
});

describe('SqlServerPublishSql.InsertDeliveries', () => {
    it('inserts one Pending row per delivery and lets the defaults supply status and visibility', () => {
        const statement = sql.InsertDeliveries([
            { MessageID: MSG, SubscriptionID: SUB, PartitionKey: null, OrderKey: 10 },
            { MessageID: MSG, SubscriptionID: 'DDDDDDDD-0000-0000-0000-000000000001', PartitionKey: 'venue-42', OrderKey: 10 },
        ]);
        expect(statement.SQL).toContain('INSERT INTO [__mj].[WorkQueueDelivery] ([MessageID], [SubscriptionID], [PartitionKey], [OrderKey])');
        expect(statement.SQL).toContain('(@p0, @p1, @p2, @p3),\n       (@p4, @p5, @p6, @p7)');
        expect(statement.Params).toEqual([MSG, SUB, null, 10, MSG, 'DDDDDDDD-0000-0000-0000-000000000001', 'venue-42', 10]);
    });

    it('rejects empty and oversized batches', () => {
        expect(() => sql.InsertDeliveries([])).toThrow(RangeError);
        const tooMany = Array.from({ length: 251 }, () => ({ MessageID: MSG, SubscriptionID: SUB, PartitionKey: null, OrderKey: 1 }));
        expect(() => sql.InsertDeliveries(tooMany)).toThrow(RangeError);
    });
});

describe('SqlServerPublishSql deduplication ledger (03 §2.1, F1)', () => {
    const reserve = sql.ReserveDeduplication(TOPIC, 'k1', MSG, 120);

    it('replaces an expired row in place and re-takes its own Reserved row', () => {
        expect(reserve.SQL).toContain("SET [MessageID] = @p2, [Status] = N'Reserved', [ExpiresAt] = DATEADD(SECOND, @p3, SYSDATETIMEOFFSET())");
        expect(reserve.SQL).toContain("([ExpiresAt] <= SYSDATETIMEOFFSET() OR ([Status] = N'Reserved' AND [MessageID] = @p2))");
    });

    it('never re-takes a Confirmed row, and never a row reserved by another message', () => {
        expect(reserve.SQL).not.toContain("N'Confirmed' AND");
        expect(reserve.SQL).toContain("[Status] = N'Reserved' AND [MessageID] = @p2");
    });

    it('inserts when the key is free, under a range lock, and returns the row it owns in one result set', () => {
        expect(reserve.SQL).toContain('WITH (UPDLOCK, HOLDLOCK)');
        expect(reserve.SQL).toContain('IF NOT EXISTS (SELECT 1 FROM @Reservation)');
        expect(reserve.SQL.endsWith('SELECT [MessageID], [Status] FROM @Reservation;')).toBe(true);
        expect(reserve.Params).toEqual([TOPIC, 'k1', MSG, 120]);
    });

    it('reads the owner of a key', () => {
        const owner = sql.SelectDeduplicationOwner(TOPIC, 'k1');
        expect(owner.SQL).toContain('SELECT [MessageID], [Status]');
        expect(owner.SQL).toContain('[ExpiresAt] > SYSDATETIMEOFFSET()');
        expect(owner.Params).toEqual([TOPIC, 'k1']);
    });

    it('confirms and releases only the owning message', () => {
        const confirm = sql.ConfirmDeduplication(TOPIC, 'k1', MSG, 86400);
        expect(confirm.SQL).toContain("[Status] = N'Confirmed', [ExpiresAt] = DATEADD(SECOND, @p3, SYSDATETIMEOFFSET())");
        expect(confirm.SQL).toContain('[MessageID] = @p2');
        const release = sql.ReleaseDeduplication(TOPIC, 'k1', MSG);
        expect(release.SQL).toContain("[MessageID] = @p2 AND [Status] = N'Reserved'");
    });

    it('purges expired keys in bounded batches without waiting on locked rows', () => {
        const statement = sql.PurgeExpiredDeduplications(500);
        expect(statement.SQL).toContain('DELETE TOP (@p0) FROM [__mj].[WorkQueueDeduplication] WITH (READPAST)');
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
    /** sp_getapplock takes its timeout as an argument, so nothing is prepared per transaction. */
    public PreparePublishOrderLock(_timeoutMs: number): SqlStatement | null {
        return null;
    }

    public AcquirePublishOrderLock(topicID: string, partitionKey: string, timeoutMs: number): SqlStatement {
        const p = this.NewParams();
        const resource = p.Add(PublishOrderLockResource(topicID, partitionKey));
        const timeout = p.Add(timeoutMs);
        return this.Statement(`
DECLARE @LockResult INT;
EXEC @LockResult = sp_getapplock @Resource = ${resource}, @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = ${timeout};
IF @LockResult = -1 THROW 51001, N'WorkQueue publish-order lock timeout', 1;
IF @LockResult < 0 THROW 51000, N'WorkQueue publish-order lock was not acquired', 1;
SELECT @LockResult AS [LockResult];`, p);
    }

    public InsertMessage(row: MessageInsertRow): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(row.ID);
        const topic = p.Add(row.TopicID);
        const key = p.Add(row.PartitionKey);
        const attrs = p.Add(row.AttributesJSON);
        const payload = p.Add(row.PayloadJSON);
        const ref = p.Add(row.PayloadRefJSON);
        const corr = p.Add(row.CorrelationID);
        const user = p.Add(row.PublishedByUserID);
        const table = this.Table(WorkQueueTables.Message);
        return this.Statement(`
DECLARE @Inserted TABLE ([ID] UNIQUEIDENTIFIER, [PublishOrdinal] BIGINT);
INSERT INTO ${table} ([ID], [TopicID], [PartitionKey], [Attributes], [Payload], [PayloadRef], [CorrelationID], [PublishedByUserID])
OUTPUT inserted.[ID], inserted.[PublishOrdinal] INTO @Inserted
SELECT ${id}, ${topic}, ${key}, ${attrs}, ${payload}, ${ref}, ${corr}, ${user}
WHERE NOT EXISTS (SELECT 1 FROM ${table} WITH (UPDLOCK, HOLDLOCK) WHERE [ID] = ${id});
SELECT [ID], [PublishOrdinal] FROM @Inserted;`, p);
    }

    public SelectMessage(messageID: string): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
SELECT [ID], [TopicID], [PartitionKey], [Attributes], [Payload], [PayloadRef], [CorrelationID]
FROM ${this.Table(WorkQueueTables.Message)}
WHERE [ID] = ${p.Add(messageID)}`, p);
    }

    /** Status, AttemptCount, IsReplay and VisibleAt come from the column defaults (Pending, 0, 0, the database clock). */
    public InsertDeliveries(rows: DeliveryInsertRow[]): SqlStatement {
        if (rows.length === 0 || rows.length > DELIVERY_INSERT_CHUNK) {
            throw new RangeError(`InsertDeliveries accepts 1-${DELIVERY_INSERT_CHUNK} rows; got ${rows.length}`);
        }
        const p = this.NewParams();
        const values = rows.map(r => `(${p.Add(r.MessageID)}, ${p.Add(r.SubscriptionID)}, ${p.Add(r.PartitionKey)}, ${p.Add(r.OrderKey)})`);
        return this.Statement(`
INSERT INTO ${this.Table(WorkQueueTables.Delivery)} ([MessageID], [SubscriptionID], [PartitionKey], [OrderKey])
VALUES ${values.join(',\n       ')}`, p);
    }

    public ReserveDeduplication(topicID: string, key: string, messageID: string, reserveSeconds: number): SqlStatement {
        const p = this.NewParams();
        const topic = p.Add(topicID);
        const k = p.Add(key);
        const message = p.Add(messageID);
        const seconds = p.Add(reserveSeconds);
        const table = this.Table(WorkQueueTables.Deduplication);
        return this.Statement(`
DECLARE @Reservation TABLE ([MessageID] UNIQUEIDENTIFIER, [Status] NVARCHAR(20));
UPDATE ${table} WITH (UPDLOCK, HOLDLOCK)
SET [MessageID] = ${message}, [Status] = N'Reserved', [ExpiresAt] = DATEADD(SECOND, ${seconds}, SYSDATETIMEOFFSET())
OUTPUT inserted.[MessageID], inserted.[Status] INTO @Reservation
WHERE [TopicID] = ${topic} AND [DeduplicationKey] = ${k}
  AND ([ExpiresAt] <= SYSDATETIMEOFFSET() OR ([Status] = N'Reserved' AND [MessageID] = ${message}));
IF NOT EXISTS (SELECT 1 FROM @Reservation)
    INSERT INTO ${table} ([TopicID], [DeduplicationKey], [MessageID], [Status], [ExpiresAt])
    OUTPUT inserted.[MessageID], inserted.[Status] INTO @Reservation
    SELECT ${topic}, ${k}, ${message}, N'Reserved', DATEADD(SECOND, ${seconds}, SYSDATETIMEOFFSET())
    WHERE NOT EXISTS (SELECT 1 FROM ${table} WITH (UPDLOCK, HOLDLOCK) WHERE [TopicID] = ${topic} AND [DeduplicationKey] = ${k});
SELECT [MessageID], [Status] FROM @Reservation;`, p);
    }

    public SelectDeduplicationOwner(topicID: string, key: string): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
SELECT [MessageID], [Status]
FROM ${this.Table(WorkQueueTables.Deduplication)}
WHERE [TopicID] = ${p.Add(topicID)} AND [DeduplicationKey] = ${p.Add(key)} AND [ExpiresAt] > SYSDATETIMEOFFSET()`, p);
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

    /** Index-backed by IX_WorkQueueDeduplication_ExpiresAt; READPAST so concurrent sweeps and publishers never wait on each other. */
    public PurgeExpiredDeduplications(batchSize: number): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
DELETE TOP (${p.Add(batchSize)}) FROM ${this.Table(WorkQueueTables.Deduplication)} WITH (READPAST)
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
Expected: PASS — sqlExecution (17), engineEntryGuard (2), SqlServerPublishSql (15).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 9: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): statement builder contracts and SQL Server publish and ledger SQL"
```

---

### Task 4: SQL Server consume statements (expire, claim, settle, acknowledge cancel)

**Files:**
- Create: `packages/WorkQueue/engine/src/sql/sqlserver/SqlServerFragments.ts`, `src/sql/sqlserver/SqlServerConsumeSql.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`, `src/constants.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/SqlServerConsumeSql.test.ts`

**Interfaces:**
- Consumes: `ConsumeSqlBuilder`, `ClaimPartitionMode`, `BacklogPartitionMode`, `StatementBase` (Task 3); `WorkQueueTables` (Task 2).
- Produces:
  - Constant `EXPIRE_LEASES_BATCH = 500` (`src/constants.ts`)
  - `SqlServerFragments`: `ActiveSubscriptionGuard(subscriptionTable: string, subscriptionParam: string): string`, `NoInFlightForKey(deliveryTable: string, alias: string): string`, `NoEarlierUnfinished(deliveryTable: string, alias: string): string`, `HolderFence(idParam: string, tokenParam: string): string`, `ExpireSetClause(alias: string, maxAttempts: string): string`, `CLAIMED_TABLE_DECLARATION`, `CLAIMED_OUTPUT`, `ClaimSetClause(ownerParam: string, leaseParam: string): string`, `ClaimedSelect(messageTable: string): string`, `CLEAR_LEASE`, `EXPIRED_TABLE_DECLARATION`, `EXPIRED_OUTPUT`, `EXPIRED_DEAD_LETTER_SELECT`
  - `class SqlServerConsumeSql extends StatementBase implements ConsumeSqlBuilder`

Rules implemented here are 03 §7 verbatim:

- **Claimable:** `Pending` + visible + active subscription + no cancel flag; `Exclusive` adds "no in-flight delivery for the key"; `Ordered` adds "no earlier `Pending`/`InFlight`/`DeadLettered` delivery for the key".
- **Bounded candidate scan.** `SelectPartitionCandidates` walks `IX_WorkQueueDelivery_Claim` (`SubscriptionID`, `VisibleAt`, filtered to `Pending`) in order and stops after `TOP (n)` qualifying rows; each partition rule is one index seek (`UQ_WorkQueueDelivery_InFlightPartition`, `IX_WorkQueueDelivery_PartitionHead`). There is no window function and no sort, so the cost is proportional to the rows returned plus the non-claimable rows skipped on the way — never to the whole backlog. An `Ordered` head is unique per key, so at most one row per key comes back; for `Exclusive` several visible rows of one idle key may qualify, and the consumer keeps the first per key (Task 9).
- **The unique index is the backstop.** `UQ_WorkQueueDelivery_InFlightPartition` makes single flight race-proof; the `NOT EXISTS` predicates only avoid most violations. Each candidate is claimed by its own statement, so a violation is handled per candidate.
- **Holder writes are fenced on `ID`, `LeaseToken`, `Status = 'InFlight'` and `CancelRequestedAt IS NULL`** (`HolderFence`). Once a cancel is requested no holder write succeeds except `AcknowledgeCancel`.
- **`ExpireLeases` returns only dead-lettered rows**, carrying the reason it wrote.
- Reads rely on `READ_COMMITTED_SNAPSHOT` (03 §6): candidate and backlog SELECTs take no shared locks, so they never queue behind a publisher's transaction.

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
const FENCE = "[ID] = @p0 AND [LeaseToken] = @p1 AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NULL";

describe('SqlServerConsumeSql.ExpireLeases', () => {
    const statement = sql.ExpireLeases(SUB, 5);

    it('returns expired in-flight rows to Pending or dead-letters them at the attempt limit, in a bounded batch', () => {
        expect(statement.SQL).toContain('UPDATE TOP (500) d SET');
        expect(statement.SQL).toContain("WHEN d.[AttemptCount] >= @p1 THEN N'DeadLettered' ELSE N'Pending' END");
        expect(statement.SQL).toContain("[LastError] = CASE WHEN d.[CancelRequestedAt] IS NOT NULL THEN d.[LastError] ELSE N'LeaseExpired' END");
        expect(statement.SQL).toContain("WHERE d.[SubscriptionID] = @p0 AND d.[Status] = N'InFlight' AND d.[LeaseExpiresAt] < SYSDATETIMEOFFSET()");
        expect(statement.Params).toEqual([SUB, 5]);
    });

    it('settles a cancelled in-flight row as Discarded instead of retrying it (03 §7)', () => {
        expect(statement.SQL).toContain("[Status] = CASE WHEN d.[CancelRequestedAt] IS NOT NULL THEN N'Discarded'");
        expect(statement.SQL).toContain('[CompletedAt] = CASE WHEN d.[CancelRequestedAt] IS NOT NULL THEN SYSDATETIMEOFFSET() ELSE d.[CompletedAt] END');
        // a cancelled row never dead-letters, whatever its attempt count
        expect(statement.SQL).toContain('[DeadLetterReason] = CASE WHEN d.[CancelRequestedAt] IS NULL AND d.[AttemptCount] >= @p1');
    });

    it('returns only the rows it dead-lettered, with the reason it wrote, as one result set', () => {
        expect(statement.SQL).toContain('INTO @Expired');
        expect(statement.SQL.endsWith("SELECT [ID] AS [DeliveryID], [SubscriptionID], [PartitionKey], [DeadLetterReason] AS [Reason] FROM @Expired WHERE [Status] = N'DeadLettered';")).toBe(true);
    });
});

describe('SqlServerConsumeSql.SubscriptionBacklog', () => {
    it('counts keyless claimable Pending plus InFlight, each capped, for an active subscription', () => {
        const keyless = sql.SubscriptionBacklog(SUB, 'None', 1000);
        expect(keyless.SQL).toContain('SELECT TOP (@p1) 1 AS [x]');
        expect(keyless.SQL).toContain('+ 0 AS [Claimable]');
        expect(keyless.SQL).toContain("d.[Status] = N'InFlight'");
        expect(keyless.SQL).toContain("s.[Status] = N'Active'");
        expect(keyless.Params).toEqual([SUB, 1000]);
    });

    it('Exclusive counts distinct idle keys; Ordered counts heads', () => {
        const exclusive = sql.SubscriptionBacklog(SUB, 'Exclusive', 1000);
        expect(exclusive.SQL).toContain('SELECT DISTINCT TOP (@p1) d.[PartitionKey]');
        expect(exclusive.SQL).not.toContain('e.[OrderKey] < d.[OrderKey]');
        const ordered = sql.SubscriptionBacklog(SUB, 'Ordered', 1000);
        expect(ordered.SQL).toContain('e.[OrderKey] < d.[OrderKey]');
        expect(ordered.SQL).not.toContain('COUNT(DISTINCT');     // never an aggregate over the whole backlog
    });
});

describe('SqlServerConsumeSql.ClaimUnpartitioned', () => {
    const statement = sql.ClaimUnpartitioned(SUB, 'host:1:abc', 60, 10);

    it('claims keyless visible pending rows with skip-locked hints for an active subscription', () => {
        expect(statement.SQL).toContain('WITH (UPDLOCK, READPAST, ROWLOCK)');
        expect(statement.SQL).toContain("d.[Status] = N'Pending' AND d.[PartitionKey] IS NULL AND d.[VisibleAt] <= SYSDATETIMEOFFSET() AND d.[CancelRequestedAt] IS NULL");
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
    it('Exclusive: visible pending rows of keys with nothing in flight, in claim-index order, bounded', () => {
        const statement = sql.SelectPartitionCandidates(SUB, 'Exclusive', 20);
        expect(statement.SQL).toContain('SELECT TOP (@p1) d.[ID] AS [DeliveryID], d.[PartitionKey]');
        expect(statement.SQL).toContain("f.[Status] = N'InFlight'");
        expect(statement.SQL).toContain('ORDER BY d.[VisibleAt]');
        expect(statement.SQL).not.toContain('e.[OrderKey] < d.[OrderKey]');
        expect(statement.Params).toEqual([SUB, 20]);
    });

    it('Ordered: only the head of each key', () => {
        const statement = sql.SelectPartitionCandidates(SUB, 'Ordered', 20);
        expect(statement.SQL).toContain("e.[OrderKey] < d.[OrderKey] AND e.[Status] IN (N'Pending', N'InFlight', N'DeadLettered')");
    });

    it('never ranks or sorts the whole backlog', () => {
        for (const mode of ['Exclusive', 'Ordered'] as const) {
            const text = sql.SelectPartitionCandidates(SUB, mode, 20).SQL;
            expect(text).not.toContain('ROW_NUMBER');
            expect(text).not.toContain('COUNT(');
        }
    });
});

describe('SqlServerConsumeSql.ClaimPartitionCandidate', () => {
    const statement = sql.ClaimPartitionCandidate(SUB, DELIVERY, 'Ordered', 'host:1:abc', 60);

    it('re-checks every rule on the single candidate row', () => {
        expect(statement.SQL).toContain("WHERE d.[ID] = @p1 AND d.[SubscriptionID] = @p0 AND d.[Status] = N'Pending'");
        expect(statement.SQL).toContain('d.[CancelRequestedAt] IS NULL');
        expect(statement.SQL).toContain("f.[Status] = N'InFlight'");
        expect(statement.SQL).toContain('e.[OrderKey] < d.[OrderKey]');
        expect(statement.SQL).toContain('INTO @Claimed');
        expect(statement.Params).toEqual([SUB, DELIVERY, 'host:1:abc', 60]);
    });

    it('Exclusive omits the head-of-line rule', () => {
        expect(sql.ClaimPartitionCandidate(SUB, DELIVERY, 'Exclusive', 'host:1:abc', 60).SQL).not.toContain('e.[OrderKey] < d.[OrderKey]');
    });
});

describe('SqlServerConsumeSql fenced writes', () => {
    it('extends the lease and keeps prior progress when none is given', () => {
        const statement = sql.ExtendLease(DELIVERY, TOKEN, 60, null);
        expect(statement.SQL).toContain(FENCE);
        expect(statement.SQL).toContain('[Progress] = COALESCE(@p3, [Progress])');
        expect(statement.Params).toEqual([DELIVERY, TOKEN, 60, null]);
    });

    it('reads the lease state that tells Cancelled from Lost', () => {
        const statement = sql.SelectLeaseState(DELIVERY, TOKEN);
        expect(statement.SQL).toContain('CASE WHEN [CancelRequestedAt] IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS [CancelRequested]');
        expect(statement.SQL).toContain("WHERE [ID] = @p0 AND [LeaseToken] = @p1 AND [Status] = N'InFlight'");
        expect(statement.SQL).not.toContain('[CancelRequestedAt] IS NULL');
    });

    it('completes as a guarded write', () => {
        const statement = sql.CompleteDelivery(DELIVERY, TOKEN);
        expect(statement.SQL).toContain(FENCE);
        expect(statement.SQL).toContain("[Status] = N'Completed', [CompletedAt] = SYSDATETIMEOFFSET()");
        expect(statement.SQL).not.toContain('OUTPUT');
    });

    it('retries with a delayed visibility and the error text', () => {
        const statement = sql.RetryDelivery(DELIVERY, TOKEN, 30, 'boom');
        expect(statement.SQL).toContain(FENCE);
        expect(statement.SQL).toContain("[Status] = N'Pending', [VisibleAt] = DATEADD(SECOND, @p2, SYSDATETIMEOFFSET()), [LastError] = @p3");
        expect(statement.Params).toEqual([DELIVERY, TOKEN, 30, 'boom']);
    });

    it('dead-letters with a reason and timestamp', () => {
        const statement = sql.DeadLetterDelivery(DELIVERY, TOKEN, 'MaxAttemptsExceeded', null);
        expect(statement.SQL).toContain(FENCE);
        expect(statement.SQL).toContain("[Status] = N'DeadLettered', [DeadLetterReason] = @p2, [DeadLetteredAt] = SYSDATETIMEOFFSET()");
    });

    it('releases without consuming the attempt', () => {
        const statement = sql.ReleaseDelivery(DELIVERY, TOKEN);
        expect(statement.SQL).toContain(FENCE);
        expect(statement.SQL).toContain('[AttemptCount] = CASE WHEN [AttemptCount] > 0 THEN [AttemptCount] - 1 ELSE 0 END');
    });

    it('acknowledges a cancel: token-fenced, requires the flag, discards immediately', () => {
        const statement = sql.AcknowledgeCancel(DELIVERY, TOKEN);
        expect(statement.SQL).toContain("[Status] = N'Discarded', [CompletedAt] = SYSDATETIMEOFFSET()");
        expect(statement.SQL).toContain("WHERE [ID] = @p0 AND [LeaseToken] = @p1 AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NOT NULL");
        expect(statement.Params).toEqual([DELIVERY, TOKEN]);
    });

    it('shifts visibility and lease timestamps back for conformance tests', () => {
        const statement = sql.ShiftTimestampsForConformance(SUB, 90);
        expect(statement.SQL).toContain('[VisibleAt] = DATEADD(SECOND, -@p1, [VisibleAt])');
        expect(statement.SQL).toContain('[LeaseExpiresAt] = DATEADD(SECOND, -@p1, [LeaseExpiresAt])');
        expect(statement.Params).toEqual([SUB, 90]);
    });
});

describe('SqlServerConsumeSql placeholders (SQLServerDataProvider rewrites every ? when params are an array)', () => {
    it('never emits a literal question mark', () => {
        const statements = [
            sql.ExpireLeases(SUB, 5), sql.SubscriptionBacklog(SUB, 'Ordered', 1000), sql.ClaimUnpartitioned(SUB, 'o', 60, 1),
            sql.SelectPartitionCandidates(SUB, 'Ordered', 5), sql.ClaimPartitionCandidate(SUB, DELIVERY, 'Ordered', 'o', 60),
            sql.ExtendLease(DELIVERY, TOKEN, 60, '{}'), sql.SelectLeaseState(DELIVERY, TOKEN), sql.CompleteDelivery(DELIVERY, TOKEN),
            sql.RetryDelivery(DELIVERY, TOKEN, 1, 'e'), sql.DeadLetterDelivery(DELIVERY, TOKEN, 'r', null),
            sql.ReleaseDelivery(DELIVERY, TOKEN), sql.AcknowledgeCancel(DELIVERY, TOKEN),
        ];
        for (const statement of statements) {
            expect(statement.SQL).not.toContain('?');
        }
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test SqlServerConsumeSql`
Expected: FAIL — unresolved import `../sql/sqlserver/SqlServerConsumeSql`.

- [ ] **Step 3: Write `src/sql/sqlserver/SqlServerFragments.ts`**

Append to `packages/WorkQueue/engine/src/constants.ts`:

```typescript
/** Rows one expire pass may touch (03 §7 "Bounded work"); the next cycle continues where this one stopped. */
export const EXPIRE_LEASES_BATCH = 500;
```

`packages/WorkQueue/engine/src/sql/sqlserver/SqlServerFragments.ts`:

```typescript
/** Reusable SQL Server predicate and clause fragments. Table arguments are already qualified. */

export function ActiveSubscriptionGuard(subscriptionTable: string, subscriptionParam: string): string {
    return `EXISTS (SELECT 1 FROM ${subscriptionTable} s WHERE s.[ID] = ${subscriptionParam} AND s.[Status] = N'Active')`;
}

/** No in-flight delivery exists for the same subscription and key as `alias` (one seek on UQ_WorkQueueDelivery_InFlightPartition). */
export function NoInFlightForKey(deliveryTable: string, alias: string): string {
    return `NOT EXISTS (SELECT 1 FROM ${deliveryTable} f WHERE f.[SubscriptionID] = ${alias}.[SubscriptionID] `
        + `AND f.[PartitionKey] = ${alias}.[PartitionKey] AND f.[Status] = N'InFlight')`;
}

/** `alias` is the head of its key: nothing earlier is Pending, InFlight or DeadLettered (one seek on IX_WorkQueueDelivery_PartitionHead). */
export function NoEarlierUnfinished(deliveryTable: string, alias: string): string {
    return `NOT EXISTS (SELECT 1 FROM ${deliveryTable} e WHERE e.[SubscriptionID] = ${alias}.[SubscriptionID] `
        + `AND e.[PartitionKey] = ${alias}.[PartitionKey] AND e.[OrderKey] < ${alias}.[OrderKey] `
        + `AND e.[Status] IN (N'Pending', N'InFlight', N'DeadLettered'))`;
}

/** The guard on every holder write (03 §7): this claim, still in flight, and not cancelled. */
export function HolderFence(idParam: string, tokenParam: string): string {
    return `[ID] = ${idParam} AND [LeaseToken] = ${tokenParam} AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NULL`;
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
        + 'm.[ID] AS [MessageID], m.[PartitionKey], m.[Attributes], m.[Payload], m.[PayloadRef], m.[CorrelationID], m.[PublishedAt]\n'
        + `FROM @Claimed c INNER JOIN ${messageTable} m ON m.[ID] = c.[MessageID];`;
}

/** Lease columns cleared by every settle. */
export const CLEAR_LEASE = '[LeaseToken] = NULL, [LeaseOwner] = NULL, [LeaseExpiresAt] = NULL';

/**
 * What an expire pass does to one expired in-flight row (03 §7): cancelled → Discarded; attempts left → Pending;
 * otherwise DeadLettered with reason 'LeaseExpired'. `maxAttempts` is a parameter or a joined column.
 */
export function ExpireSetClause(alias: string, maxAttempts: string): string {
    const cancelled = `${alias}.[CancelRequestedAt] IS NOT NULL`;
    const exhausted = `${alias}.[CancelRequestedAt] IS NULL AND ${alias}.[AttemptCount] >= ${maxAttempts}`;
    return `[Status] = CASE WHEN ${cancelled} THEN N'Discarded'
                    WHEN ${alias}.[AttemptCount] >= ${maxAttempts} THEN N'DeadLettered' ELSE N'Pending' END,
    [DeadLetterReason] = CASE WHEN ${exhausted} THEN N'LeaseExpired' ELSE ${alias}.[DeadLetterReason] END,
    [DeadLetteredAt] = CASE WHEN ${exhausted} THEN SYSDATETIMEOFFSET() ELSE ${alias}.[DeadLetteredAt] END,
    [CompletedAt] = CASE WHEN ${cancelled} THEN SYSDATETIMEOFFSET() ELSE ${alias}.[CompletedAt] END,
    [LastError] = CASE WHEN ${cancelled} THEN ${alias}.[LastError] ELSE N'LeaseExpired' END,
    [VisibleAt] = SYSDATETIMEOFFSET(), ${CLEAR_LEASE}`;
}

/** Expire passes OUTPUT every touched row (CodeGen tables have triggers, so OUTPUT needs INTO) and return only the
 *  ones that ended DeadLettered — the engine's NotifyDeadLettered seam (03 §11). Exactly one result set. */
export const EXPIRED_TABLE_DECLARATION =
    'DECLARE @Expired TABLE ([ID] UNIQUEIDENTIFIER, [SubscriptionID] UNIQUEIDENTIFIER, [PartitionKey] NVARCHAR(200), '
    + '[Status] NVARCHAR(20), [DeadLetterReason] NVARCHAR(100));';
export const EXPIRED_OUTPUT =
    'OUTPUT inserted.[ID], inserted.[SubscriptionID], inserted.[PartitionKey], inserted.[Status], inserted.[DeadLetterReason] INTO @Expired';
export const EXPIRED_DEAD_LETTER_SELECT =
    "SELECT [ID] AS [DeliveryID], [SubscriptionID], [PartitionKey], [DeadLetterReason] AS [Reason] FROM @Expired WHERE [Status] = N'DeadLettered';";
```

- [ ] **Step 4: Write `src/sql/sqlserver/SqlServerConsumeSql.ts`**

```typescript
import { EXPIRE_LEASES_BATCH, WorkQueueTables } from '../../constants';
import type { BacklogPartitionMode, ClaimPartitionMode } from '../rows';
import { StatementBase } from '../StatementBase';
import type { ConsumeSqlBuilder } from '../WorkQueueSqlBuilder';
import type { SqlStatement } from '../WorkQueueSqlExecutor';
import {
    ActiveSubscriptionGuard, CLAIMED_OUTPUT, CLAIMED_TABLE_DECLARATION, ClaimedSelect, ClaimSetClause, CLEAR_LEASE,
    EXPIRED_DEAD_LETTER_SELECT, EXPIRED_OUTPUT, EXPIRED_TABLE_DECLARATION, ExpireSetClause, HolderFence,
    NoEarlierUnfinished, NoInFlightForKey,
} from './SqlServerFragments';

export class SqlServerConsumeSql extends StatementBase implements ConsumeSqlBuilder {
    public ExpireLeases(subscriptionID: string, maxAttempts: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const max = p.Add(maxAttempts);
        return this.Statement(`
${EXPIRED_TABLE_DECLARATION}
UPDATE TOP (${EXPIRE_LEASES_BATCH}) d SET
    ${ExpireSetClause('d', max)}
${EXPIRED_OUTPUT}
FROM ${this.Table(WorkQueueTables.Delivery)} d
WHERE d.[SubscriptionID] = ${sub} AND d.[Status] = N'InFlight' AND d.[LeaseExpiresAt] < SYSDATETIMEOFFSET();
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
    WHERE d.[SubscriptionID] = ${sub} AND d.[Status] = N'Pending' AND d.[PartitionKey] IS NULL AND d.[VisibleAt] <= SYSDATETIMEOFFSET() AND d.[CancelRequestedAt] IS NULL
      AND ${ActiveSubscriptionGuard(this.Table(WorkQueueTables.Subscription), sub)}
    ORDER BY d.[VisibleAt]
)
UPDATE [Ready] SET ${ClaimSetClause(owner, lease)}
${CLAIMED_OUTPUT};
${ClaimedSelect(this.Table(WorkQueueTables.Message))}`, p);
    }

    /**
     * Streams IX_WorkQueueDelivery_Claim in VisibleAt order and stops after TOP (n) qualifying rows. ORDER BY is the
     * index order alone (no OrderKey tiebreak) so the plan needs no sort and terminates early.
     */
    public SelectPartitionCandidates(subscriptionID: string, mode: ClaimPartitionMode, maxRows: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const max = p.Add(maxRows);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(`
SELECT TOP (${max}) d.[ID] AS [DeliveryID], d.[PartitionKey]
FROM ${deliveries} d
WHERE d.[SubscriptionID] = ${sub} AND d.[Status] = N'Pending' AND d.[PartitionKey] IS NOT NULL AND d.[VisibleAt] <= SYSDATETIMEOFFSET()
  AND ${ActiveSubscriptionGuard(this.Table(WorkQueueTables.Subscription), sub)}
  AND ${NoInFlightForKey(deliveries, 'd')}${this.HeadPredicate(mode)}
ORDER BY d.[VisibleAt];`, p);
    }

    public SubscriptionBacklog(subscriptionID: string, mode: BacklogPartitionMode, cap: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const top = p.Add(cap);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        const active = ActiveSubscriptionGuard(this.Table(WorkQueueTables.Subscription), sub);
        const visible = `d.[SubscriptionID] = ${sub} AND d.[Status] = N'Pending' AND d.[VisibleAt] <= SYSDATETIMEOFFSET() AND ${active}`;
        return this.Statement(`
SELECT
    (SELECT COUNT(*) FROM (SELECT TOP (${top}) 1 AS [x] FROM ${deliveries} d
                           WHERE ${visible} AND d.[PartitionKey] IS NULL) k)
    + ${this.KeyedBacklog(mode, visible, top)} AS [Claimable],
    (SELECT COUNT(*) FROM (SELECT TOP (${top}) 1 AS [x] FROM ${deliveries} d
                           WHERE d.[SubscriptionID] = ${sub} AND d.[Status] = N'InFlight') f) AS [InFlight];`, p);
    }

    public ClaimPartitionCandidate(subscriptionID: string, deliveryID: string, mode: ClaimPartitionMode,
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
  AND d.[VisibleAt] <= SYSDATETIMEOFFSET() AND d.[PartitionKey] IS NOT NULL AND d.[CancelRequestedAt] IS NULL
  AND ${ActiveSubscriptionGuard(this.Table(WorkQueueTables.Subscription), sub)}
  AND ${NoInFlightForKey(deliveries, 'd')}${this.HeadPredicate(mode)};
${ClaimedSelect(this.Table(WorkQueueTables.Message))}`, p);
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
WHERE ${HolderFence(id, token)}`, p);
    }

    /** A row means this token still holds the delivery; with the cancel flag set the answer is Cancelled, not Lost. */
    public SelectLeaseState(deliveryID: string, leaseToken: string): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        return this.Statement(`
SELECT CAST(CASE WHEN [CancelRequestedAt] IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS [CancelRequested]
FROM ${this.Table(WorkQueueTables.Delivery)}
WHERE [ID] = ${id} AND [LeaseToken] = ${token} AND [Status] = N'InFlight'`, p);
    }

    public CompleteDelivery(deliveryID: string, leaseToken: string): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET [Status] = N'Completed', [CompletedAt] = SYSDATETIMEOFFSET(), ${CLEAR_LEASE}
WHERE ${HolderFence(id, token)}`, p);
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
WHERE ${HolderFence(id, token)}`, p);
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
WHERE ${HolderFence(id, token)}`, p);
    }

    public ReleaseDelivery(deliveryID: string, leaseToken: string): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET [Status] = N'Pending', [AttemptCount] = CASE WHEN [AttemptCount] > 0 THEN [AttemptCount] - 1 ELSE 0 END, [VisibleAt] = SYSDATETIMEOFFSET(), ${CLEAR_LEASE}
WHERE ${HolderFence(id, token)}`, p);
    }

    /** The one holder write allowed after a cancel (03 §7, F2): the key is freed the moment the handler has stopped. */
    public AcknowledgeCancel(deliveryID: string, leaseToken: string): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET [Status] = N'Discarded', [CompletedAt] = SYSDATETIMEOFFSET(), ${CLEAR_LEASE}
WHERE [ID] = ${id} AND [LeaseToken] = ${token} AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NOT NULL`, p);
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

    private HeadPredicate(mode: ClaimPartitionMode): string {
        return mode === 'Ordered' ? `\n  AND ${NoEarlierUnfinished(this.Table(WorkQueueTables.Delivery), 'd')}` : '';
    }

    /** Exclusive counts distinct idle keys (one claim per key at a time); an Ordered head is already unique per key. */
    private KeyedBacklog(mode: BacklogPartitionMode, visible: string, top: string): string {
        if (mode === 'None') {
            return '0';
        }
        const deliveries = this.Table(WorkQueueTables.Delivery);
        const rules = `${visible} AND d.[PartitionKey] IS NOT NULL AND ${NoInFlightForKey(deliveries, 'd')}${this.HeadPredicate(mode)}`;
        const projection = mode === 'Exclusive' ? `SELECT DISTINCT TOP (${top}) d.[PartitionKey]` : `SELECT TOP (${top}) 1 AS [x]`;
        return `(SELECT COUNT(*) FROM (${projection} FROM ${deliveries} d
                           WHERE ${rules}) h)`;
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
Expected: PASS — sqlExecution (17), engineEntryGuard (2), SqlServerPublishSql (15), SqlServerConsumeSql (21).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 7: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): SQL Server claim, lease, settle and cancel-acknowledge statements"
```

---

### Task 5: SQL Server operator and sweeper statements, autoscaler query and scaler login

**Files:**
- Create: `packages/WorkQueue/engine/src/sql/sqlserver/SqlServerOperatorSql.ts`
- Create: `scripts/work-queue-scaler-login.sql`
- Modify: `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/SqlServerOperatorSql.test.ts`

**Interfaces:**
- Consumes: `OperatorSqlBuilder`, `DeadLetterCursor`, `StatementBase` (Task 3); `NoEarlierUnfinished`, `CLEAR_LEASE`, `ExpireSetClause`, `EXPIRED_TABLE_DECLARATION`, `EXPIRED_OUTPUT`, `EXPIRED_DEAD_LETTER_SELECT` (Task 4); `PartitionCondition` from core.
- Produces: `class SqlServerOperatorSql extends StatementBase implements OperatorSqlBuilder`; `scripts/work-queue-scaler-login.sql`.

Rules (03 §5.2, §7):

- **Derived conditions:** `InFlight` when the key has an in-flight delivery; `Blocked` (Ordered only) when the head is `DeadLettered`; otherwise `Idle`. Nothing about a partition is stored outside the delivery rows.
- **Stats are per-status index seeks**, never one aggregate over every row of the subscription: `Pending` from `IX_WorkQueueDelivery_Claim`, `InFlight`/`DeadLettered` from `IX_WorkQueueDelivery_Open`, `CompletedLastHour` from `IX_WorkQueueDelivery_Purge`. `OldestPendingAgeSeconds` is measured from the oldest `VisibleAt` (the leading claim-index row): how long claimable work has waited.
- **Discard is one guarded statement per case** (`Pending`/`DeadLettered` → `Discarded`; `InFlight` → cancel flag). `CancelInFlightDelivery` sets `CancelRequestedAt` and **leaves the lease token unchanged** (F2): the holder keeps its token so it can acknowledge.
- **Purges are chunked, index-backed and `READPAST`.** Terminal deliveries: a sargable lower bound on `CompletedAt` (the smallest `RetentionDays` of any topic) lets `IX_WorkQueueDelivery_Purge` seek; the per-topic retention is then applied row by row. Orphan messages: one `IX_WorkQueueMessage_Purge` range seek per topic.
- **One sweeper at a time.** `AcquireSweepLock` takes a non-blocking application lock **owned by the caller's transaction**. 03 §7 describes a session lock; MJ providers pool connections, and only a transaction pins one, so `TryAcquireSweepLock` (Task 7) opens a short "lock transaction" on a private independent executor, takes the lock there, hands plan 06's sweeper a second independent executor for the pass, and ends the lock transaction on `Release()`. See [Contract deltas](#contract-deltas).

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
    it('counts each status with its own seek, never one aggregate over the subscription', () => {
        const statement = sql.SubscriptionStats(SUB, false);
        expect(statement.SQL).toContain("WHERE p.[SubscriptionID] = @p0 AND p.[Status] = N'Pending') AS [Pending]");
        expect(statement.SQL).toContain("WHERE f.[SubscriptionID] = @p0 AND f.[Status] = N'InFlight') AS [InFlight]");
        expect(statement.SQL).toContain("WHERE x.[SubscriptionID] = @p0 AND x.[Status] = N'DeadLettered') AS [DeadLettered]");
        expect(statement.SQL).not.toContain('SUM(CASE');
        expect(statement.SQL).toContain('CAST(NULL AS INT) AS [BlockedKeys]');
        expect(statement.Params).toEqual([SUB]);
    });

    it('reports the oldest claimable wait and last-hour completions from their indexes', () => {
        const statement = sql.SubscriptionStats(SUB, false);
        expect(statement.SQL).toContain('DATEDIFF(SECOND, MIN(o.[VisibleAt]), SYSDATETIMEOFFSET())');
        expect(statement.SQL).toContain("c.[Status] = N'Completed' AND c.[CompletedAt] >= DATEADD(HOUR, -1, SYSDATETIMEOFFSET())");
        expect(statement.SQL).not.toContain('__mj_CreatedAt');
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
    it('derives conditions from the delivery rows alone and filters non-idle keys by default', () => {
        const statement = sql.ListPartitions(SUB, true, null, null, 100);
        expect(statement.SQL).toContain("WHEN k.[InFlightCount] > 0 THEN N'InFlight'");
        expect(statement.SQL).toContain("WHEN h.[Status] = N'DeadLettered' THEN N'Blocked'");
        expect(statement.SQL).toContain("[Condition] <> N'Idle'");
        expect(statement.SQL).toContain('ORDER BY [PartitionKey]');
    });

    it('filters by an explicit condition and starts the scan after the keyset key', () => {
        const statement = sql.ListPartitions(SUB, false, 'InFlight', 'venue-10', 20);
        expect(statement.SQL).not.toContain("N'Blocked'");
        expect(statement.SQL).toContain('[Condition] = @p2');
        expect(statement.SQL).toContain('d.[PartitionKey] > @p3');
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

    it('discards dead letters, and pending deliveries only when allowed, as a guarded write', () => {
        const deadOnly = sql.DiscardDelivery(SUB, DELIVERY, false, USER, 'bad batch');
        expect(deadOnly.SQL).toContain("[Status] IN (N'DeadLettered')");
        expect(deadOnly.SQL).not.toContain('OUTPUT');
        const withPending = sql.DiscardDelivery(SUB, DELIVERY, true, USER, 'cancel');
        expect(withPending.SQL).toContain("[Status] IN (N'DeadLettered', N'Pending')");
    });

    it('cancels an in-flight delivery by stamping CancelRequestedAt, leaving the lease token alone', () => {
        const statement = sql.CancelInFlightDelivery(SUB, DELIVERY, USER, 'operator cancelled');
        expect(statement.SQL).toContain('[CancelRequestedAt] = SYSDATETIMEOFFSET()');
        expect(statement.SQL).not.toContain('[LeaseToken]');                // F2: the token is left unchanged
        expect(statement.SQL).toContain("WHERE [ID] = @p1 AND [SubscriptionID] = @p0 AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NULL");
        expect(statement.SQL).not.toContain("[Status] = N'Discarded'");     // the holder acknowledges, or ExpireLeases discards
        expect(statement.Params).toEqual([SUB, DELIVERY, USER, 'operator cancelled']);
    });
});

describe('SqlServerOperatorSql sweeper statements', () => {
    it('expires leases for every subscription using its MaxAttempts, in a bounded batch', () => {
        const statement = sql.ExpireLeasesAll(500);
        expect(statement.SQL).toContain('UPDATE TOP (@p0) d SET');
        expect(statement.SQL).toContain('INNER JOIN [__mj].[WorkQueueSubscription] s ON s.[ID] = d.[SubscriptionID]');
        expect(statement.SQL).toContain('d.[AttemptCount] >= s.[MaxAttempts]');
        expect(statement.Params).toEqual([500]);
    });

    it('sweeps cancelled in-flight rows to Discarded and returns only dead-lettered rows', () => {
        const statement = sql.ExpireLeasesAll(500);
        expect(statement.SQL).toContain("[Status] = CASE WHEN d.[CancelRequestedAt] IS NOT NULL THEN N'Discarded'");
        expect(statement.SQL.endsWith("FROM @Expired WHERE [Status] = N'DeadLettered';")).toBe(true);
    });

    it('takes a non-blocking, transaction-owned sweep lock and reports whether it got it', () => {
        const statement = sql.AcquireSweepLock('mj-wq-sweep');
        expect(statement.SQL).toContain("@LockOwner = N'Transaction', @LockTimeout = 0");
        expect(statement.SQL.endsWith('AS [Acquired];')).toBe(true);
        expect(statement.Params).toEqual(['mj-wq-sweep']);
    });

    it('reads READ_COMMITTED_SNAPSHOT for the current database', () => {
        const statement = sql.ReadCommittedSnapshotState();
        expect(statement.SQL).toContain('is_read_committed_snapshot_on');
        expect(statement.SQL).toContain('WHERE name = DB_NAME()');
        expect(statement.Params).toEqual([]);
    });

    it('purges terminal deliveries through the purge index, skipping locked rows', () => {
        const deliveries = sql.PurgeTerminalDeliveries(1000);
        expect(deliveries.SQL).toContain('DELETE TOP (@p0) d');
        expect(deliveries.SQL).toContain('WITH (READPAST)');
        expect(deliveries.SQL).toContain('d.[CompletedAt] < DATEADD(DAY, -(SELECT MIN(mt.[RetentionDays])');   // sargable bound
        expect(deliveries.SQL).toContain('d.[CompletedAt] < DATEADD(DAY, -t.[RetentionDays], SYSDATETIMEOFFSET())');
    });

    it('purges orphan messages per topic retention', () => {
        const messages = sql.PurgeOrphanMessages(1000);
        expect(messages.SQL).toContain('m.[TopicID] = t.[ID] AND m.[PublishedAt] < DATEADD(DAY, -t.[RetentionDays], SYSDATETIMEOFFSET())');
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
import { EXPIRE_LEASES_BATCH, WorkQueueTables } from '../../constants';
import type { DeadLetterCursor } from '../rows';
import { StatementBase } from '../StatementBase';
import type { OperatorSqlBuilder } from '../WorkQueueSqlBuilder';
import type { SqlStatement } from '../WorkQueueSqlExecutor';
import {
    CLEAR_LEASE, EXPIRED_DEAD_LETTER_SELECT, EXPIRED_OUTPUT, EXPIRED_TABLE_DECLARATION, ExpireSetClause, NoEarlierUnfinished,
} from './SqlServerFragments';

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
    (SELECT COUNT(*) FROM ${deliveries} p WHERE p.[SubscriptionID] = ${sub} AND p.[Status] = N'Pending') AS [Pending],
    (SELECT COUNT(*) FROM ${deliveries} f WHERE f.[SubscriptionID] = ${sub} AND f.[Status] = N'InFlight') AS [InFlight],
    (SELECT COUNT(*) FROM ${deliveries} x WHERE x.[SubscriptionID] = ${sub} AND x.[Status] = N'DeadLettered') AS [DeadLettered],
    ${blocked} AS [BlockedKeys],
    (SELECT DATEDIFF(SECOND, MIN(o.[VisibleAt]), SYSDATETIMEOFFSET()) FROM ${deliveries} o
     WHERE o.[SubscriptionID] = ${sub} AND o.[Status] = N'Pending') AS [OldestPendingAgeSeconds],
    (SELECT COUNT(*) FROM ${deliveries} c
     WHERE c.[Status] = N'Completed' AND c.[CompletedAt] >= DATEADD(HOUR, -1, SYSDATETIMEOFFSET()) AND c.[SubscriptionID] = ${sub}) AS [CompletedLastHour];`, p);
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
    m.[ID] AS [MessageID], m.[PartitionKey], m.[Attributes], m.[Payload], m.[PayloadRef], m.[CorrelationID], m.[PublishedAt]
FROM ${deliveries} d
INNER JOIN ${this.Table(WorkQueueTables.Message)} m ON m.[ID] = d.[MessageID]
WHERE d.[SubscriptionID] = ${sub} AND d.[Status] = N'DeadLettered'${keyset}
ORDER BY d.[ID]`, p);
    }

    /** Reads IX_WorkQueueDelivery_PartitionHead (open rows only), starting after the keyset key. */
    public ListPartitions(subscriptionID: string, ordered: boolean, condition: PartitionCondition | null,
                          afterPartitionKey: string | null, pageSize: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const size = p.Add(pageSize);
        const conditionFilter = condition ? `[Condition] = ${p.Add(condition)}` : `[Condition] <> N'Idle'`;
        const keyset = afterPartitionKey !== null ? ` AND d.[PartitionKey] > ${p.Add(afterPartitionKey)}` : '';
        const blockedCase = ordered ? `\n             WHEN h.[Status] = N'DeadLettered' THEN N'Blocked'` : '';
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(`
WITH [Keys] AS (
    SELECT d.[PartitionKey],
        SUM(CASE WHEN d.[Status] = N'InFlight' THEN 1 ELSE 0 END) AS [InFlightCount],
        SUM(CASE WHEN d.[Status] = N'Pending' THEN 1 ELSE 0 END) AS [WaitingItems],
        MIN(d.[OrderKey]) AS [HeadOrderKey]
    FROM ${deliveries} d
    WHERE d.[SubscriptionID] = ${sub} AND d.[PartitionKey] IS NOT NULL AND d.[Status] IN (N'Pending', N'InFlight', N'DeadLettered')${keyset}
    GROUP BY d.[PartitionKey]
), [Shaped] AS (
    SELECT k.[PartitionKey], k.[WaitingItems], h.[ID] AS [HeadDeliveryID],
        CASE WHEN k.[InFlightCount] > 0 THEN N'InFlight'${blockedCase}
             ELSE N'Idle' END AS [Condition]
    FROM [Keys] k
    INNER JOIN ${deliveries} h ON h.[SubscriptionID] = ${sub} AND h.[PartitionKey] = k.[PartitionKey] AND h.[OrderKey] = k.[HeadOrderKey]
)
SELECT TOP (${size}) [PartitionKey], [Condition], [HeadDeliveryID], [WaitingItems]
FROM [Shaped]
WHERE ${conditionFilter}
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
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET [Status] = N'Discarded', [CompletedAt] = SYSDATETIMEOFFSET(), [ResolvedByUserID] = ${actor}, [ResolutionNote] = ${text}, ${CLEAR_LEASE}
WHERE [ID] = ${id} AND [SubscriptionID] = ${sub} AND [Status] IN (${statuses})`, p);
    }

    public CancelInFlightDelivery(subscriptionID: string, deliveryID: string, actorUserID: string | null, reason: string): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const id = p.Add(deliveryID);
        const actor = p.Add(actorUserID);
        const text = p.Add(reason);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET [CancelRequestedAt] = SYSDATETIMEOFFSET(), [ResolvedByUserID] = ${actor}, [ResolutionNote] = ${text}
WHERE [ID] = ${id} AND [SubscriptionID] = ${sub} AND [Status] = N'InFlight' AND [CancelRequestedAt] IS NULL`, p);
    }

    public ExpireLeasesAll(batchSize: number = EXPIRE_LEASES_BATCH): SqlStatement {
        const p = this.NewParams();
        const batch = p.Add(batchSize);
        return this.Statement(`
${EXPIRED_TABLE_DECLARATION}
UPDATE TOP (${batch}) d SET
    ${ExpireSetClause('d', 's.[MaxAttempts]')}
${EXPIRED_OUTPUT}
FROM ${this.Table(WorkQueueTables.Delivery)} d
INNER JOIN ${this.Table(WorkQueueTables.Subscription)} s ON s.[ID] = d.[SubscriptionID]
WHERE d.[Status] = N'InFlight' AND d.[LeaseExpiresAt] < SYSDATETIMEOFFSET();
${EXPIRED_DEAD_LETTER_SELECT}`, p);
    }

    /** Must run inside the caller's transaction: the lock lives until that transaction ends. */
    public AcquireSweepLock(resource: string): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
DECLARE @LockResult INT;
EXEC @LockResult = sp_getapplock @Resource = ${p.Add(resource)}, @LockMode = N'Exclusive', @LockOwner = N'Transaction', @LockTimeout = 0;
SELECT CAST(CASE WHEN @LockResult >= 0 THEN 1 ELSE 0 END AS BIT) AS [Acquired];`, p);
    }

    public ReadCommittedSnapshotState(): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
SELECT CAST(is_read_committed_snapshot_on AS BIT) AS [SnapshotOn] FROM sys.databases WHERE name = DB_NAME();`, p);
    }

    /**
     * The first predicate is sargable on IX_WorkQueueDelivery_Purge (no row can be purgeable before the smallest
     * retention of any topic has passed); the second applies each row's own topic retention.
     */
    public PurgeTerminalDeliveries(batchSize: number): SqlStatement {
        const p = this.NewParams();
        const topics = this.Table(WorkQueueTables.Topic);
        return this.Statement(`
DELETE TOP (${p.Add(batchSize)}) d
FROM ${this.Table(WorkQueueTables.Delivery)} d WITH (READPAST)
INNER JOIN ${this.Table(WorkQueueTables.Subscription)} s ON s.[ID] = d.[SubscriptionID]
INNER JOIN ${topics} t ON t.[ID] = s.[TopicID]
WHERE d.[Status] IN (N'Completed', N'Discarded')
  AND d.[CompletedAt] < DATEADD(DAY, -(SELECT MIN(mt.[RetentionDays]) FROM ${topics} mt), SYSDATETIMEOFFSET())
  AND d.[CompletedAt] < DATEADD(DAY, -t.[RetentionDays], SYSDATETIMEOFFSET())`, p);
    }

    /** One IX_WorkQueueMessage_Purge range seek per topic; a message is an orphan once every delivery of it is gone. */
    public PurgeOrphanMessages(batchSize: number): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
DELETE TOP (${p.Add(batchSize)}) m
FROM ${this.Table(WorkQueueTables.Topic)} t
INNER JOIN ${this.Table(WorkQueueTables.Message)} m WITH (READPAST)
    ON m.[TopicID] = t.[ID] AND m.[PublishedAt] < DATEADD(DAY, -t.[RetentionDays], SYSDATETIMEOFFSET())
WHERE NOT EXISTS (SELECT 1 FROM ${this.Table(WorkQueueTables.Delivery)} d WHERE d.[MessageID] = m.[ID])`, p);
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
exactly what starved MJ Central's queue — [01 use case 3](01-use-cases.md), R3.5). It runs every few seconds, so it is
**bounded**: each half stops counting at 1000 (no autoscaler needs more than `maxReplicas × target`), walks an index in
order, and needs `READ_COMMITTED_SNAPSHOT` so it never blocks behind writers.

`scripts/work-queue-scaler-login.sql` (flat `scripts/` folder, as `scripts/pg-bootstrap-helpers.sql`):

```sql
-- Least-privilege identity for an external autoscaler (KEDA / ACA job scale rules).
-- Grants SELECT on the two work-queue tables the scaler query reads, and nothing else.
--
-- SQL Server (on-premises / VM / Managed Instance) — run in the MJ database:
--   sqlcmd -S <server> -d <database> -v Schema="__mj" Password="<strong-password>" -i scripts/work-queue-scaler-login.sql
-- The schema is a sqlcmd variable: pass the MJ core schema of YOUR installation (mj.config.cjs → mjCoreSchema).
--
-- Azure SQL Database: CREATE LOGIN is only valid in the master database. Use a CONTAINED user instead — comment out
-- the CREATE LOGIN / CREATE USER ... FOR LOGIN pair below and run, in the MJ database:
--   CREATE USER mj_workqueue_scaler WITH PASSWORD = '$(Password)';
CREATE LOGIN mj_workqueue_scaler WITH PASSWORD = '$(Password)';
GO
CREATE USER mj_workqueue_scaler FOR LOGIN mj_workqueue_scaler;
GO
GRANT SELECT ON OBJECT::[$(Schema)].WorkQueueDelivery TO mj_workqueue_scaler;
GRANT SELECT ON OBJECT::[$(Schema)].WorkQueueSubscription TO mj_workqueue_scaler;
GO

-- PostgreSQL equivalent (replace <schema> and the password):
-- CREATE ROLE mj_workqueue_scaler LOGIN PASSWORD '<strong-password>';
-- GRANT USAGE ON SCHEMA <schema> TO mj_workqueue_scaler;
-- GRANT SELECT ON <schema>."WorkQueueDelivery", <schema>."WorkQueueSubscription" TO mj_workqueue_scaler;
```

The scaler query itself, parameterised by subscription name (SQL Server shown, `__mj` standing for your core schema):

```sql
SELECT
    (SELECT COUNT(*) FROM (
        SELECT TOP (1000) 1 AS x
        FROM __mj.WorkQueueDelivery d
        INNER JOIN __mj.WorkQueueSubscription s ON s.ID = d.SubscriptionID
        WHERE s.Name = @SubscriptionName AND s.Status = 'Active'
          AND d.Status = 'Pending' AND d.VisibleAt <= SYSDATETIMEOFFSET()
          AND (d.PartitionKey IS NULL
               OR (NOT EXISTS (SELECT 1 FROM __mj.WorkQueueDelivery f
                               WHERE f.SubscriptionID = d.SubscriptionID AND f.PartitionKey = d.PartitionKey AND f.Status = 'InFlight')
                   AND (s.PartitionMode <> 'Ordered'
                        OR NOT EXISTS (SELECT 1 FROM __mj.WorkQueueDelivery e
                                       WHERE e.SubscriptionID = d.SubscriptionID AND e.PartitionKey = d.PartitionKey
                                         AND e.OrderKey < d.OrderKey AND e.Status IN ('Pending', 'InFlight', 'DeadLettered')))))
     ) claimable)
  + (SELECT COUNT(*) FROM (
        SELECT TOP (1000) 1 AS x
        FROM __mj.WorkQueueDelivery d
        INNER JOIN __mj.WorkQueueSubscription s ON s.ID = d.SubscriptionID
        WHERE s.Name = @SubscriptionName AND d.Status = 'InFlight'
     ) inflight) AS Backlog;
```

PostgreSQL form: replace `SYSDATETIMEOFFSET()` with `now()`, quote identifiers (`"__mj"."WorkQueueDelivery"`, `d."Status"` …),
drop `TOP (1000)` and end each inner SELECT with `LIMIT 1000`.

Notes to carry into plan 06's runbook (which owns the KEDA/ACA job recipe and must use **this** query):

- A `Paused` or `Disabled` subscription reports only its `InFlight` rows, so nothing is started for it; a blocked
  `Ordered` key contributes nothing, because its waiting rows are not heads.
- For `Exclusive` subscriptions the claimable half counts rows, not distinct keys, so a key with several visible
  pending rows can overcount. A container that starts and claims nothing exits 0 in seconds — a wasted start, never a
  stuck queue. `WorkQueue.GetBacklog` (remote operation, plan 06) uses `SubscriptionBacklog`, which counts distinct
  keys; prefer it where the scaler can call an API.
- `targetValue` of 1 with `parallelism = 1` gives one container per claimable item.

- [ ] **Step 6: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — sqlExecution (17), engineEntryGuard (2), SqlServerPublishSql (15), SqlServerConsumeSql (21), SqlServerOperatorSql (16).

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
- Consumes: builder interfaces, rows and `StatementBase` (Task 3); `WorkQueueTables`, `DELIVERY_INSERT_CHUNK`, `EXPIRE_LEASES_BATCH`, `SqlBuilderContext`, `WorkQueueSqlExecutor` (Tasks 2, 4); `SqlServer*Sql` (Tasks 3–5).
- Produces:
  - `class PostgreSQLPublishSql`, `class PostgreSQLConsumeSql`, `class PostgreSQLOperatorSql` (same methods, same row shapes and **the same semantics** as the SQL Server classes)
  - `CreateWorkQueueSqlBuilder(context: SqlBuilderContext & Pick<WorkQueueSqlExecutor, 'PlatformKey'>): WorkQueueSqlBuilder`

PostgreSQL shapes: skip-locked claims use a `FOR UPDATE SKIP LOCKED` CTE feeding `UPDATE … FROM … RETURNING`; publish-order locks use `pg_advisory_xact_lock(hashtextextended(…, 0))` under a transaction-local `lock_timeout` set by `PreparePublishOrderLock` (advisory-lock waits honour `lock_timeout`, failing with SQLSTATE `55P03`); inserts that may conflict use `ON CONFLICT … DO NOTHING`; batch deletes use `WHERE "ID" IN (SELECT … LIMIT n FOR UPDATE SKIP LOCKED)`. Every parameter is cast. Columns are written with double quotes because CodeGen's PostgreSQL tables keep PascalCase names, and inserts name every NOT NULL column explicitly rather than relying on converted defaults. `ExecuteWrite` wraps write statements in the dialect's `WITH … RETURNING 1` counter, so write statements never carry their own `RETURNING`.

**Dialect equivalence (reviewer H4).** `RETURNING` reports every row an `UPDATE` touched, so an expire pass wraps the update in a CTE and selects **only** `"Status" = 'DeadLettered'` — the same result the SQL Server `@Expired` filter produces. An ordinary lease expiry therefore raises no dead-letter notification on either platform.

**Snapshot rule.** A statement's CTEs share one snapshot, so a row a concurrent transaction commits while `ON CONFLICT DO NOTHING` waits is invisible to a `SELECT` in the same statement. That is why "who owns it?" is always a **separate statement** (`SelectMessage`, `SelectDeduplicationOwner`), issued after the insert returned nothing.

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
    it('sets a transaction-local lock timeout, then takes a transaction-scoped advisory lock', () => {
        const prepare = publish.PreparePublishOrderLock(5000);
        expect(prepare?.SQL).toBe(`SELECT set_config('lock_timeout', $1::text, true) AS "LockTimeout"`);
        expect(prepare?.Params).toEqual(['5000ms']);
        const statement = publish.AcquirePublishOrderLock(TOPIC, 'venue-42', 5000);
        expect(statement.SQL).toBe('SELECT 0 AS "LockResult" FROM pg_advisory_xact_lock(hashtextextended($1::text, 0))');
        expect(statement.Params).toHaveLength(1);
    });

    it('inserts a message with ON CONFLICT on the primary key and the database clock', () => {
        const statement = publish.InsertMessage({
            ID: MSG, TopicID: TOPIC, PartitionKey: 'k', AttributesJSON: '{}', PayloadJSON: null,
            PayloadRefJSON: null, CorrelationID: null, PublishedByUserID: null,
        });
        expect(statement.SQL).toContain('ON CONFLICT ("ID") DO NOTHING');
        expect(statement.SQL).toContain('RETURNING "ID", "PublishOrdinal"');
        expect(statement.SQL).toContain('now()');
        expect(statement.SQL).not.toContain('UNION ALL');     // "who owns it?" is a separate statement (snapshot rule)
        expect(statement.Params).toHaveLength(8);
    });

    it('reads an existing message separately', () => {
        const statement = publish.SelectMessage(MSG);
        expect(statement.SQL).toContain('WHERE "ID" = $1::uuid');
        expect(statement.SQL).toContain('"TopicID", "PartitionKey", "Attributes"');
    });

    it('inserts deliveries naming every NOT NULL column', () => {
        const statement = publish.InsertDeliveries([{ MessageID: MSG, SubscriptionID: SUB, PartitionKey: null, OrderKey: 7 }]);
        expect(statement.SQL).toContain(`(gen_random_uuid(), $1::uuid, $2::uuid, 'Pending', $3::text, $4::bigint, 0, false, now())`);
    });

    it('reserves a key: replaces an expired row, re-takes its own reservation, inserts when free (F1)', () => {
        const statement = publish.ReserveDeduplication(TOPIC, 'k1', MSG, 120);
        expect(statement.SQL).toContain(`("ExpiresAt" <= now() OR ("Status" = 'Reserved' AND "MessageID" = $3::uuid))`);
        expect(statement.SQL).toContain('WHERE NOT EXISTS (SELECT 1 FROM taken)');
        expect(statement.SQL).toContain('ON CONFLICT ("TopicID", "DeduplicationKey") DO NOTHING');
        expect(statement.SQL).toContain('make_interval(secs => $4::int)');
        expect(statement.Params).toEqual([TOPIC, 'k1', MSG, 120]);
    });

    it('reads the unexpired owner of a key separately', () => {
        const statement = publish.SelectDeduplicationOwner(TOPIC, 'k1');
        expect(statement.SQL).toContain('SELECT "MessageID", "Status"');
        expect(statement.SQL).toContain('"ExpiresAt" > now()');
    });

    it('purges expired keys through a limited skip-locked subquery', () => {
        const statement = publish.PurgeExpiredDeduplications(500);
        expect(statement.SQL).toContain('LIMIT $1::int');
        expect(statement.SQL).toContain('FOR UPDATE SKIP LOCKED');
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

    it('selects Ordered candidates with the head rule, bounded and in claim-index order', () => {
        const statement = consume.SelectPartitionCandidates(SUB, 'Ordered', 20);
        expect(statement.SQL).toContain('e."OrderKey" < d."OrderKey"');
        expect(statement.SQL).toContain('ORDER BY d."VisibleAt"');
        expect(statement.SQL).toContain('LIMIT $2::int');
        expect(statement.SQL).not.toContain('ROW_NUMBER');
    });

    it('returns only dead-lettered rows from an expire pass (same as SQL Server)', () => {
        const statement = consume.ExpireLeases(SUB, 5);
        expect(statement.SQL.startsWith('WITH expired AS (')).toBe(true);
        expect(statement.SQL).toContain('FOR UPDATE SKIP LOCKED');
        expect(statement.SQL).toContain(`WHEN d."CancelRequestedAt" IS NOT NULL THEN 'Discarded'`);
        expect(statement.SQL.endsWith(`FROM expired WHERE "Status" = 'DeadLettered'`)).toBe(true);
        expect(statement.SQL).toContain('"DeadLetterReason" AS "Reason"');
    });

    it('fences settles on token, status and the cancel flag', () => {
        const statement = consume.RetryDelivery(DELIVERY, TOKEN, 30, 'boom');
        expect(statement.SQL).toContain(`WHERE "ID" = $1::uuid AND "LeaseToken" = $2::uuid AND "Status" = 'InFlight' AND "CancelRequestedAt" IS NULL`);
        expect(statement.SQL).not.toContain('RETURNING');
        expect(consume.CompleteDelivery(DELIVERY, TOKEN).SQL).not.toContain('RETURNING');
    });

    it('acknowledges a cancel and reads the lease state', () => {
        expect(consume.AcknowledgeCancel(DELIVERY, TOKEN).SQL)
            .toContain(`WHERE "ID" = $1::uuid AND "LeaseToken" = $2::uuid AND "Status" = 'InFlight' AND "CancelRequestedAt" IS NOT NULL`);
        expect(consume.SelectLeaseState(DELIVERY, TOKEN).SQL).toContain('("CancelRequestedAt" IS NOT NULL) AS "CancelRequested"');
    });

    it('counts the autoscaler backlog with the same claimability rules, capped', () => {
        expect(consume.SubscriptionBacklog(SUB, 'Exclusive', 1000).SQL).toContain('SELECT DISTINCT d."PartitionKey"');
        expect(consume.SubscriptionBacklog(SUB, 'None', 1000).SQL).toContain('+ 0 AS "Claimable"');
        expect(consume.SubscriptionBacklog(SUB, 'None', 1000).SQL).toContain('LIMIT $2::int');
        expect(consume.SubscriptionBacklog(SUB, 'Ordered', 1000).SQL).not.toContain('count(DISTINCT');
    });
});

describe('PostgreSQLOperatorSql', () => {
    it('computes stats with one seek per status', () => {
        const statement = operator.SubscriptionStats(SUB, true);
        expect(statement.SQL).toContain(`WHERE p."SubscriptionID" = $1::uuid AND p."Status" = 'Pending') AS "Pending"`);
        expect(statement.SQL).toContain('EXTRACT(EPOCH FROM');
        expect(statement.SQL).not.toContain('FILTER (WHERE');
    });

    it('discards as a guarded write and cancels without touching the lease token', () => {
        expect(operator.DiscardDelivery(SUB, DELIVERY, true, null, 'x').SQL).not.toContain('RETURNING');
        const cancel = operator.CancelInFlightDelivery(SUB, DELIVERY, null, 'x').SQL;
        expect(cancel).toContain('"CancelRequestedAt" = now()');
        expect(cancel).not.toContain('"LeaseToken"');
        expect(cancel).toContain(`"Status" = 'InFlight' AND "CancelRequestedAt" IS NULL`);
    });

    it('lists partitions with LIMIT and a keyset pushed into the scan', () => {
        const statement = operator.ListPartitions(SUB, true, 'Blocked', 'venue-1', 25);
        expect(statement.SQL).toContain(`"Condition" = $3::text`);
        expect(statement.SQL).toContain(`d."PartitionKey" > $4::text`);
        expect(statement.SQL).toContain('LIMIT $2::int');
    });

    it('takes a transaction-scoped try-lock for the sweep and reports MVCC as always on', () => {
        expect(operator.AcquireSweepLock('mj-wq-sweep').SQL).toBe('SELECT pg_try_advisory_xact_lock(hashtextextended($1::text, 0)) AS "Acquired"');
        expect(operator.ReadCommittedSnapshotState().SQL).toBe('SELECT true AS "SnapshotOn"');
    });

    it('purges by retention in skip-locked batches and expires in bounded batches', () => {
        expect(operator.PurgeTerminalDeliveries(100).SQL).toContain('make_interval(days => t."RetentionDays")');
        expect(operator.PurgeTerminalDeliveries(100).SQL).toContain('FOR UPDATE OF d SKIP LOCKED');
        expect(operator.PurgeOrphanMessages(100).SQL).toContain('FOR UPDATE OF m SKIP LOCKED');
        const expire = operator.ExpireLeasesAll(500);
        expect(expire.SQL).toContain('LIMIT $1::int');
        expect(expire.SQL.endsWith(`FROM expired WHERE "Status" = 'DeadLettered'`)).toBe(true);
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

/** The guard on every holder write (03 §7): this claim, still in flight, and not cancelled. */
export function HolderFence(idParam: string, tokenParam: string): string {
    return `"ID" = ${idParam}::uuid AND "LeaseToken" = ${tokenParam}::uuid AND "Status" = 'InFlight' AND "CancelRequestedAt" IS NULL`;
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
        + 'm."ID" AS "MessageID", m."PartitionKey", m."Attributes", m."Payload", m."PayloadRef", m."CorrelationID", m."PublishedAt"\n'
        + `FROM claimed c JOIN ${messageTable} m ON m."ID" = c."MessageID"`;
}

export const CLEAR_LEASE = '"LeaseToken" = NULL, "LeaseOwner" = NULL, "LeaseExpiresAt" = NULL';

/** Same decision table as the SQL Server ExpireSetClause (03 §7). `maxAttempts` is a cast parameter or a joined column. */
export function ExpireSetClause(alias: string, maxAttempts: string): string {
    const cancelled = `${alias}."CancelRequestedAt" IS NOT NULL`;
    const exhausted = `${alias}."CancelRequestedAt" IS NULL AND ${alias}."AttemptCount" >= ${maxAttempts}`;
    return `"Status" = CASE WHEN ${cancelled} THEN 'Discarded'
                    WHEN ${alias}."AttemptCount" >= ${maxAttempts} THEN 'DeadLettered' ELSE 'Pending' END,
    "DeadLetterReason" = CASE WHEN ${exhausted} THEN 'LeaseExpired' ELSE ${alias}."DeadLetterReason" END,
    "DeadLetteredAt" = CASE WHEN ${exhausted} THEN now() ELSE ${alias}."DeadLetteredAt" END,
    "CompletedAt" = CASE WHEN ${cancelled} THEN now() ELSE ${alias}."CompletedAt" END,
    "LastError" = CASE WHEN ${cancelled} THEN ${alias}."LastError" ELSE 'LeaseExpired' END,
    "VisibleAt" = now(), ${CLEAR_LEASE}`;
}

/** RETURNING reports every touched row; the outer SELECT keeps only the dead-lettered ones — identical to SQL Server. */
export function ExpiredRowsStatement(updateWithoutReturning: string, alias: string): string {
    return `WITH expired AS (
${updateWithoutReturning}
    RETURNING ${alias}."ID", ${alias}."SubscriptionID", ${alias}."PartitionKey", ${alias}."Status", ${alias}."DeadLetterReason"
)
SELECT "ID" AS "DeliveryID", "SubscriptionID", "PartitionKey", "DeadLetterReason" AS "Reason" FROM expired WHERE "Status" = 'DeadLettered'`;
}
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
    /** Transaction-local (`is_local = true`): applies to the advisory-lock waits of this publish and resets at commit. */
    public PreparePublishOrderLock(timeoutMs: number): SqlStatement | null {
        const p = this.NewParams();
        return this.Statement(`SELECT set_config('lock_timeout', ${p.Add(`${timeoutMs}ms`)}::text, true) AS "LockTimeout"`, p);
    }

    public AcquirePublishOrderLock(topicID: string, partitionKey: string, _timeoutMs: number): SqlStatement {
        const p = this.NewParams();
        const resource = p.Add(PublishOrderLockResource(topicID, partitionKey));
        return this.Statement(`SELECT 0 AS "LockResult" FROM pg_advisory_xact_lock(hashtextextended(${resource}::text, 0))`, p);
    }

    public InsertMessage(row: MessageInsertRow): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(row.ID);
        const topic = p.Add(row.TopicID);
        const key = p.Add(row.PartitionKey);
        const attrs = p.Add(row.AttributesJSON);
        const payload = p.Add(row.PayloadJSON);
        const ref = p.Add(row.PayloadRefJSON);
        const corr = p.Add(row.CorrelationID);
        const user = p.Add(row.PublishedByUserID);
        return this.Statement(`
INSERT INTO ${this.Table(WorkQueueTables.Message)} ("ID", "TopicID", "PartitionKey", "Attributes", "Payload", "PayloadRef", "CorrelationID", "PublishedAt", "PublishedByUserID")
VALUES (${id}::uuid, ${topic}::uuid, ${key}::text, ${attrs}::text, ${payload}::text, ${ref}::text, ${corr}::text, now(), ${user}::uuid)
ON CONFLICT ("ID") DO NOTHING
RETURNING "ID", "PublishOrdinal"`, p);
    }

    public SelectMessage(messageID: string): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
SELECT "ID", "TopicID", "PartitionKey", "Attributes", "Payload", "PayloadRef", "CorrelationID"
FROM ${this.Table(WorkQueueTables.Message)}
WHERE "ID" = ${p.Add(messageID)}::uuid`, p);
    }

    public InsertDeliveries(rows: DeliveryInsertRow[]): SqlStatement {
        if (rows.length === 0 || rows.length > DELIVERY_INSERT_CHUNK) {
            throw new RangeError(`InsertDeliveries accepts 1-${DELIVERY_INSERT_CHUNK} rows; got ${rows.length}`);
        }
        const p = this.NewParams();
        const values = rows.map(r =>
            `(gen_random_uuid(), ${p.Add(r.MessageID)}::uuid, ${p.Add(r.SubscriptionID)}::uuid, 'Pending', ${p.Add(r.PartitionKey)}::text, ${p.Add(r.OrderKey)}::bigint, 0, false, now())`,
        );
        return this.Statement(`
INSERT INTO ${this.Table(WorkQueueTables.Delivery)} ("ID", "MessageID", "SubscriptionID", "Status", "PartitionKey", "OrderKey", "AttemptCount", "IsReplay", "VisibleAt")
VALUES ${values.join(',\n       ')}`, p);
    }

    public ReserveDeduplication(topicID: string, key: string, messageID: string, reserveSeconds: number): SqlStatement {
        const p = this.NewParams();
        const topic = p.Add(topicID);
        const k = p.Add(key);
        const message = p.Add(messageID);
        const seconds = p.Add(reserveSeconds);
        const table = this.Table(WorkQueueTables.Deduplication);
        return this.Statement(`
WITH taken AS (
    UPDATE ${table}
    SET "MessageID" = ${message}::uuid, "Status" = 'Reserved', "ExpiresAt" = now() + make_interval(secs => ${seconds}::int)
    WHERE "TopicID" = ${topic}::uuid AND "DeduplicationKey" = ${k}::text
      AND ("ExpiresAt" <= now() OR ("Status" = 'Reserved' AND "MessageID" = ${message}::uuid))
    RETURNING "MessageID", "Status"
), inserted AS (
    INSERT INTO ${table} ("ID", "TopicID", "DeduplicationKey", "MessageID", "Status", "ExpiresAt")
    SELECT gen_random_uuid(), ${topic}::uuid, ${k}::text, ${message}::uuid, 'Reserved', now() + make_interval(secs => ${seconds}::int)
    WHERE NOT EXISTS (SELECT 1 FROM taken)
    ON CONFLICT ("TopicID", "DeduplicationKey") DO NOTHING
    RETURNING "MessageID", "Status"
)
SELECT "MessageID", "Status" FROM taken
UNION ALL
SELECT "MessageID", "Status" FROM inserted`, p);
    }

    public SelectDeduplicationOwner(topicID: string, key: string): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`
SELECT "MessageID", "Status"
FROM ${this.Table(WorkQueueTables.Deduplication)}
WHERE "TopicID" = ${p.Add(topicID)}::uuid AND "DeduplicationKey" = ${p.Add(key)}::text AND "ExpiresAt" > now()`, p);
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
WHERE "ID" IN (SELECT x."ID" FROM ${table} x WHERE x."ExpiresAt" <= now() LIMIT ${p.Add(batchSize)}::int FOR UPDATE SKIP LOCKED)`, p);
    }
}
```

- [ ] **Step 5: Write `src/sql/postgresql/PostgreSQLConsumeSql.ts`**

```typescript
import { EXPIRE_LEASES_BATCH, WorkQueueTables } from '../../constants';
import type { BacklogPartitionMode, ClaimPartitionMode } from '../rows';
import { StatementBase } from '../StatementBase';
import type { ConsumeSqlBuilder } from '../WorkQueueSqlBuilder';
import type { SqlStatement } from '../WorkQueueSqlExecutor';
import {
    ActiveSubscriptionGuard, ClaimedSelect, ClaimReturning, ClaimSetClause, CLEAR_LEASE, ExpiredRowsStatement,
    ExpireSetClause, HolderFence, NoEarlierUnfinished, NoInFlightForKey,
} from './PostgreSQLFragments';

export class PostgreSQLConsumeSql extends StatementBase implements ConsumeSqlBuilder {
    public ExpireLeases(subscriptionID: string, maxAttempts: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const max = p.Add(maxAttempts);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(ExpiredRowsStatement(`    UPDATE ${deliveries} d SET
    ${ExpireSetClause('d', `${max}::int`)}
    WHERE d."ID" IN (SELECT x."ID" FROM ${deliveries} x
                     WHERE x."SubscriptionID" = ${sub}::uuid AND x."Status" = 'InFlight' AND x."LeaseExpiresAt" < now()
                     LIMIT ${EXPIRE_LEASES_BATCH} FOR UPDATE SKIP LOCKED)`, 'd'), p);
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
    WHERE d."SubscriptionID" = ${sub}::uuid AND d."Status" = 'Pending' AND d."PartitionKey" IS NULL AND d."VisibleAt" <= now() AND d."CancelRequestedAt" IS NULL
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

    /** Walks the claim index in VisibleAt order and stops at LIMIT: no window function, no sort over the backlog. */
    public SelectPartitionCandidates(subscriptionID: string, mode: ClaimPartitionMode, maxRows: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const max = p.Add(maxRows);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(`
SELECT d."ID" AS "DeliveryID", d."PartitionKey"
FROM ${deliveries} d
WHERE d."SubscriptionID" = ${sub}::uuid AND d."Status" = 'Pending' AND d."PartitionKey" IS NOT NULL AND d."VisibleAt" <= now()
  AND ${ActiveSubscriptionGuard(this.Table(WorkQueueTables.Subscription), sub)}
  AND ${NoInFlightForKey(deliveries, 'd')}${this.HeadPredicate(mode)}
ORDER BY d."VisibleAt"
LIMIT ${max}::int`, p);
    }

    public SubscriptionBacklog(subscriptionID: string, mode: BacklogPartitionMode, cap: number): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const top = p.Add(cap);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        const active = ActiveSubscriptionGuard(this.Table(WorkQueueTables.Subscription), sub);
        const visible = `d."SubscriptionID" = ${sub}::uuid AND d."Status" = 'Pending' AND d."VisibleAt" <= now() AND ${active}`;
        return this.Statement(`
SELECT
    (SELECT count(*) FROM (SELECT 1 FROM ${deliveries} d
                           WHERE ${visible} AND d."PartitionKey" IS NULL LIMIT ${top}::int) k)
    + ${this.KeyedBacklog(mode, visible, top)} AS "Claimable",
    (SELECT count(*) FROM (SELECT 1 FROM ${deliveries} d
                           WHERE d."SubscriptionID" = ${sub}::uuid AND d."Status" = 'InFlight' LIMIT ${top}::int) f) AS "InFlight"`, p);
    }

    public ClaimPartitionCandidate(subscriptionID: string, deliveryID: string, mode: ClaimPartitionMode,
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
      AND d."VisibleAt" <= now() AND d."PartitionKey" IS NOT NULL AND d."CancelRequestedAt" IS NULL
      AND ${ActiveSubscriptionGuard(this.Table(WorkQueueTables.Subscription), sub)}
      AND ${NoInFlightForKey(deliveries, 'd')}${this.HeadPredicate(mode)}
    ${ClaimReturning('d')}
)
${ClaimedSelect(this.Table(WorkQueueTables.Message))}`, p);
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
WHERE ${HolderFence(id, token)}`, p);
    }

    public SelectLeaseState(deliveryID: string, leaseToken: string): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        return this.Statement(`
SELECT ("CancelRequestedAt" IS NOT NULL) AS "CancelRequested"
FROM ${this.Table(WorkQueueTables.Delivery)}
WHERE "ID" = ${id}::uuid AND "LeaseToken" = ${token}::uuid AND "Status" = 'InFlight'`, p);
    }

    public CompleteDelivery(deliveryID: string, leaseToken: string): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET "Status" = 'Completed', "CompletedAt" = now(), ${CLEAR_LEASE}
WHERE ${HolderFence(id, token)}`, p);
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
WHERE ${HolderFence(id, token)}`, p);
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
WHERE ${HolderFence(id, token)}`, p);
    }

    public ReleaseDelivery(deliveryID: string, leaseToken: string): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET "Status" = 'Pending', "AttemptCount" = GREATEST("AttemptCount" - 1, 0), "VisibleAt" = now(), ${CLEAR_LEASE}
WHERE ${HolderFence(id, token)}`, p);
    }

    public AcknowledgeCancel(deliveryID: string, leaseToken: string): SqlStatement {
        const p = this.NewParams();
        const id = p.Add(deliveryID);
        const token = p.Add(leaseToken);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET "Status" = 'Discarded', "CompletedAt" = now(), ${CLEAR_LEASE}
WHERE "ID" = ${id}::uuid AND "LeaseToken" = ${token}::uuid AND "Status" = 'InFlight' AND "CancelRequestedAt" IS NOT NULL`, p);
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

    private HeadPredicate(mode: ClaimPartitionMode): string {
        return mode === 'Ordered' ? `\n  AND ${NoEarlierUnfinished(this.Table(WorkQueueTables.Delivery), 'd')}` : '';
    }

    private KeyedBacklog(mode: BacklogPartitionMode, visible: string, top: string): string {
        if (mode === 'None') {
            return '0';
        }
        const deliveries = this.Table(WorkQueueTables.Delivery);
        const rules = `${visible} AND d."PartitionKey" IS NOT NULL AND ${NoInFlightForKey(deliveries, 'd')}${this.HeadPredicate(mode)}`;
        const projection = mode === 'Exclusive' ? 'SELECT DISTINCT d."PartitionKey"' : 'SELECT 1';
        return `(SELECT count(*) FROM (${projection} FROM ${deliveries} d
                           WHERE ${rules} LIMIT ${top}::int) h)`;
    }
}
```

- [ ] **Step 6: Write `src/sql/postgresql/PostgreSQLOperatorSql.ts`**

```typescript
import type { PartitionCondition } from '@memberjunction/work-queue-core';
import { EXPIRE_LEASES_BATCH, WorkQueueTables } from '../../constants';
import type { DeadLetterCursor } from '../rows';
import { StatementBase } from '../StatementBase';
import type { OperatorSqlBuilder } from '../WorkQueueSqlBuilder';
import type { SqlStatement } from '../WorkQueueSqlExecutor';
import { CLEAR_LEASE, ExpiredRowsStatement, ExpireSetClause, NoEarlierUnfinished } from './PostgreSQLFragments';

export class PostgreSQLOperatorSql extends StatementBase implements OperatorSqlBuilder {
    public SubscriptionStats(subscriptionID: string, ordered: boolean): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        const blocked = ordered
            ? `(SELECT count(*) FROM ${deliveries} h WHERE h."SubscriptionID" = ${sub}::uuid AND h."Status" = 'DeadLettered' AND h."PartitionKey" IS NOT NULL AND ${NoEarlierUnfinished(deliveries, 'h')})`
            : 'NULL::bigint';
        return this.Statement(`
SELECT
    (SELECT count(*) FROM ${deliveries} p WHERE p."SubscriptionID" = ${sub}::uuid AND p."Status" = 'Pending') AS "Pending",
    (SELECT count(*) FROM ${deliveries} f WHERE f."SubscriptionID" = ${sub}::uuid AND f."Status" = 'InFlight') AS "InFlight",
    (SELECT count(*) FROM ${deliveries} x WHERE x."SubscriptionID" = ${sub}::uuid AND x."Status" = 'DeadLettered') AS "DeadLettered",
    ${blocked} AS "BlockedKeys",
    (SELECT EXTRACT(EPOCH FROM (now() - MIN(o."VisibleAt")))::int FROM ${deliveries} o
     WHERE o."SubscriptionID" = ${sub}::uuid AND o."Status" = 'Pending') AS "OldestPendingAgeSeconds",
    (SELECT count(*) FROM ${deliveries} c
     WHERE c."Status" = 'Completed' AND c."CompletedAt" >= now() - interval '1 hour' AND c."SubscriptionID" = ${sub}::uuid) AS "CompletedLastHour"`, p);
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
    m."ID" AS "MessageID", m."PartitionKey", m."Attributes", m."Payload", m."PayloadRef", m."CorrelationID", m."PublishedAt"
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
        const keyset = afterPartitionKey !== null ? ` AND d."PartitionKey" > ${p.Add(afterPartitionKey)}::text` : '';
        const blockedCase = ordered ? `\n             WHEN h."Status" = 'DeadLettered' THEN 'Blocked'` : '';
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(`
WITH keys AS (
    SELECT d."PartitionKey",
        count(*) FILTER (WHERE d."Status" = 'InFlight') AS "InFlightCount",
        count(*) FILTER (WHERE d."Status" = 'Pending') AS "WaitingItems",
        MIN(d."OrderKey") AS "HeadOrderKey"
    FROM ${deliveries} d
    WHERE d."SubscriptionID" = ${sub}::uuid AND d."PartitionKey" IS NOT NULL AND d."Status" IN ('Pending', 'InFlight', 'DeadLettered')${keyset}
    GROUP BY d."PartitionKey"
), shaped AS (
    SELECT k."PartitionKey", k."WaitingItems", h."ID" AS "HeadDeliveryID",
        CASE WHEN k."InFlightCount" > 0 THEN 'InFlight'${blockedCase}
             ELSE 'Idle' END AS "Condition"
    FROM keys k
    JOIN ${deliveries} h ON h."SubscriptionID" = ${sub}::uuid AND h."PartitionKey" = k."PartitionKey" AND h."OrderKey" = k."HeadOrderKey"
)
SELECT "PartitionKey", "Condition", "HeadDeliveryID", "WaitingItems"
FROM shaped
WHERE ${conditionFilter}
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
WHERE "ID" = ${id}::uuid AND "SubscriptionID" = ${sub}::uuid AND "Status" IN (${statuses})`, p);
    }

    public CancelInFlightDelivery(subscriptionID: string, deliveryID: string, actorUserID: string | null, reason: string): SqlStatement {
        const p = this.NewParams();
        const sub = p.Add(subscriptionID);
        const id = p.Add(deliveryID);
        const actor = p.Add(actorUserID);
        const text = p.Add(reason);
        return this.Statement(`
UPDATE ${this.Table(WorkQueueTables.Delivery)}
SET "CancelRequestedAt" = now(), "ResolvedByUserID" = ${actor}::uuid, "ResolutionNote" = ${text}::text
WHERE "ID" = ${id}::uuid AND "SubscriptionID" = ${sub}::uuid AND "Status" = 'InFlight' AND "CancelRequestedAt" IS NULL`, p);
    }

    public ExpireLeasesAll(batchSize: number = EXPIRE_LEASES_BATCH): SqlStatement {
        const p = this.NewParams();
        const batch = p.Add(batchSize);
        const deliveries = this.Table(WorkQueueTables.Delivery);
        return this.Statement(ExpiredRowsStatement(`    UPDATE ${deliveries} d SET
    ${ExpireSetClause('d', 's."MaxAttempts"')}
    FROM ${this.Table(WorkQueueTables.Subscription)} s
    WHERE s."ID" = d."SubscriptionID"
      AND d."ID" IN (SELECT x."ID" FROM ${deliveries} x WHERE x."Status" = 'InFlight' AND x."LeaseExpiresAt" < now()
                     LIMIT ${batch}::int FOR UPDATE SKIP LOCKED)`, 'd'), p);
    }

    /** Must run inside the caller's transaction: the lock lives until that transaction ends. */
    public AcquireSweepLock(resource: string): SqlStatement {
        const p = this.NewParams();
        return this.Statement(`SELECT pg_try_advisory_xact_lock(hashtextextended(${p.Add(resource)}::text, 0)) AS "Acquired"`, p);
    }

    /** PostgreSQL is MVCC by design: readers never block writers, so the prerequisite always holds. */
    public ReadCommittedSnapshotState(): SqlStatement {
        return this.Statement('SELECT true AS "SnapshotOn"', this.NewParams());
    }

    public PurgeTerminalDeliveries(batchSize: number): SqlStatement {
        const p = this.NewParams();
        const deliveries = this.Table(WorkQueueTables.Delivery);
        const topics = this.Table(WorkQueueTables.Topic);
        return this.Statement(`
DELETE FROM ${deliveries}
WHERE "ID" IN (
    SELECT d."ID" FROM ${deliveries} d
    JOIN ${this.Table(WorkQueueTables.Subscription)} s ON s."ID" = d."SubscriptionID"
    JOIN ${topics} t ON t."ID" = s."TopicID"
    WHERE d."Status" IN ('Completed', 'Discarded')
      AND d."CompletedAt" < now() - make_interval(days => (SELECT MIN(mt."RetentionDays") FROM ${topics} mt))
      AND d."CompletedAt" < now() - make_interval(days => t."RetentionDays")
    LIMIT ${p.Add(batchSize)}::int
    FOR UPDATE OF d SKIP LOCKED
)`, p);
    }

    public PurgeOrphanMessages(batchSize: number): SqlStatement {
        const p = this.NewParams();
        const messages = this.Table(WorkQueueTables.Message);
        return this.Statement(`
DELETE FROM ${messages}
WHERE "ID" IN (
    SELECT m."ID" FROM ${this.Table(WorkQueueTables.Topic)} t
    JOIN ${messages} m ON m."TopicID" = t."ID" AND m."PublishedAt" < now() - make_interval(days => t."RetentionDays")
    WHERE NOT EXISTS (SELECT 1 FROM ${this.Table(WorkQueueTables.Delivery)} d WHERE d."MessageID" = m."ID")
    LIMIT ${p.Add(batchSize)}::int
    FOR UPDATE OF m SKIP LOCKED
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
Expected: PASS — sqlExecution (17), engineEntryGuard (2), SqlServerPublishSql (15), SqlServerConsumeSql (21), SqlServerOperatorSql (16), PostgreSQLSql (18), CreateWorkQueueSqlBuilder (2).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 10: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): PostgreSQL statements and the platform builder factory"
```

---

### Task 7: Transaction helper, sweep lock and `DeduplicationLedger`

**Files:**
- Create: `packages/WorkQueue/engine/src/transaction/RunInWorkQueueTransaction.ts`, `src/sql/sweepLock.ts`
- Create: `packages/WorkQueue/engine/src/dedup/DeduplicationLedger.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/RunInWorkQueueTransaction.test.ts`, `src/__tests__/sweepLock.test.ts`, `src/__tests__/DeduplicationLedger.test.ts`

**Interfaces:**
- Consumes: `WorkQueueExecutorSource`, `WorkQueueTransactionalExecutor`, `WorkQueueSqlExecutor`, `ExecuteRows`, `ExecuteWrite`, `IsTransientDatabaseError`, `IsUniqueViolation`, `ToBoolean` (Task 2); `CreateWorkQueueSqlBuilder` (Task 6); `ReservationRow`, `SweepLockRow` (Task 3); `DEDUP_RESERVATION_SECONDS`, `DEDUPLICATION_KEY_INDEX`, `SWEEP_LOCK_RESOURCE` (Task 2).
- Produces:
  - `interface TransactionOutcome<T> { Commit: boolean; Value: T }`
  - `RunInWorkQueueTransaction<T>(source: WorkQueueExecutorSource, work: (tx: WorkQueueTransactionalExecutor) => Promise<TransactionOutcome<T>>, callerExecutor?: WorkQueueTransactionalExecutor | null): Promise<T>` — joins the caller's transaction when given (never releases it); otherwise runs on a fresh independent instance and releases it
  - `RetryTransient<T>(operation: () => Promise<T>, attempts?: number, wait?: (attempt: number) => Promise<void>): Promise<T>`
  - `interface SweepLock { Executor: WorkQueueSqlExecutor; Release(): Promise<void> }`, `TryAcquireSweepLock(source: WorkQueueExecutorSource, contextUser: UserInfo): Promise<SweepLock | null>` (`src/sql/sweepLock.ts`) — one sweeper at a time (03 §7, F9); `null` when another instance holds the lock. Plan 06's `WorkQueueSweeper` calls it before each pass, runs the pass on `lock.Executor`, and calls `lock.Release()` in a `finally`
  - `type LedgerReservation = { Kind: 'Reserved' } | { Kind: 'Duplicate'; OwnerMessageID: string } | { Kind: 'Pending'; OwnerMessageID: string }` (03 §11)
  - `class DeduplicationLedger { constructor(executor: WorkQueueSqlExecutor, contextUser: UserInfo); Reserve(topicID, key, messageID): Promise<LedgerReservation>; Confirm(topicID, key, messageID, ttlSeconds): Promise<boolean>; Release(topicID, key, messageID): Promise<boolean>; PurgeExpired(batchSize?: number, maxBatches?: number): Promise<number> }`

Ledger rules (03 §2.1, F1) — **only a `Confirmed` row is a duplicate**:

| Existing row for `(Topic, DeduplicationKey)` | `ReserveDeduplication` returns | `Reserve` result |
| --- | --- | --- |
| none, or expired (replaced in place) | the row it now owns | `Reserved` |
| `Reserved`, unexpired, **same** `MessageID` | the re-taken row (expiry refreshed) | `Reserved` — the send is repeated |
| `Confirmed`, unexpired | nothing → `SelectDeduplicationOwner` | `Duplicate { OwnerMessageID }` |
| `Reserved`, unexpired, **different** `MessageID` | nothing → `SelectDeduplicationOwner` | `Pending { OwnerMessageID }` → the publish is `Rejected` `DeduplicationPending` (retryable) |

A reservation proves a send was *attempted*, not that it succeeded: a process that dies between reserve and send must
not turn the caller's retry into a silent success. "Who owns it?" is a **separate statement** because a PostgreSQL
statement cannot see a row a concurrent transaction committed while its `ON CONFLICT` waited. When neither statement
finds a row (it expired or was released in between) the ledger tries again, three times at most; a unique-constraint
race on SQL Server is retried the same way.

`RunInWorkQueueTransaction` never lets a failed rollback mask the error that caused it (reviewer M2): the rollback error
is swallowed and the original is rethrown, so `RetryTransient` still classifies a deadlock as a deadlock.

`TryAcquireSweepLock` implements "one sweeper at a time" with pooled connections. A session-level lock could be taken
on one pooled connection and released on another, so the lock is **owned by a transaction** held open on a private
independent executor until `Release()`. `SweepLock.Executor` is a **second** independent executor for the pass itself:
its chunked deletes must commit on their own, not pile up inside the lock transaction. `Release()` ends the lock
transaction and releases both executors; it never throws, so a sweeper's `finally` cannot mask the pass's own error.
A process that dies drops its connection, which ends the transaction and frees the lock.

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

    it('rethrows the original error even when the rollback itself fails', async () => {
        const executor = new RecordingExecutor();
        const scope = { IsNested: false, Commit: async () => undefined, Rollback: async () => { throw new Error('connection closed'); } };
        const independent = await executor.CreateIndependentInstance();
        independent.BeginEntityTransaction = async () => scope;
        executor.CreateIndependentInstance = async () => independent;
        await expect(RunInWorkQueueTransaction(executor, async () => { throw new Error('Transaction was deadlocked'); }))
            .rejects.toThrow('Transaction was deadlocked');
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

`packages/WorkQueue/engine/src/__tests__/sweepLock.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { TryAcquireSweepLock } from '../sql/sweepLock';
import { RecordingExecutor, TEST_USER } from './fakes';

describe('TryAcquireSweepLock', () => {
    it('holds the lock in a transaction on one executor and hands back a second one for the pass', async () => {
        const source = new RecordingExecutor().QueueRows([{ Acquired: true }]);
        const lock = await TryAcquireSweepLock(source, TEST_USER);
        expect(lock).not.toBeNull();
        await lock?.Executor.ExecuteSQL('SELECT 1');
        expect(source.Calls[0].Executor).toBe('independent#1');
        expect(source.Calls[0].InTransaction).toBe(true);
        expect(source.Calls[0].SQL).toContain('sp_getapplock');
        expect(source.Calls[0].Params).toEqual(['mj-wq-sweep']);
        expect(source.Calls[1].Executor).toBe('independent#2');
        expect(source.Calls[1].InTransaction).toBe(false);
        await lock?.Release();
        expect(source.Events).toEqual(['independent', 'begin', 'independent', 'release', 'commit', 'release']);
    });

    it('returns null and releases everything when another instance holds the lock', async () => {
        const source = new RecordingExecutor().QueueRows([{ Acquired: 0 }]);
        expect(await TryAcquireSweepLock(source, TEST_USER)).toBeNull();
        expect(source.Events).toEqual(['independent', 'begin', 'rollback', 'release']);
    });

    it('releases the lock executor and rethrows when the lock statement fails', async () => {
        const source = new RecordingExecutor().QueueError(new Error('connection reset'));
        await expect(TryAcquireSweepLock(source, TEST_USER)).rejects.toThrow('connection reset');
        expect(source.Events).toEqual(['independent', 'begin', 'rollback', 'release']);
    });

    it('releases only once', async () => {
        const source = new RecordingExecutor().QueueRows([{ Acquired: 1 }]);
        const lock = await TryAcquireSweepLock(source, TEST_USER);
        await lock?.Release();
        await lock?.Release();
        expect(source.Events.filter(e => e === 'release')).toHaveLength(2);
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

describe('DeduplicationLedger.Reserve (03 §2.1, F1)', () => {
    it('reserves a free or expired key in one statement', async () => {
        const executor = new RecordingExecutor().QueueRows([{ MessageID: MSG, Status: 'Reserved' }]);
        const result = await new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG);
        expect(result).toEqual({ Kind: 'Reserved' });
        expect(executor.Calls).toHaveLength(1);
        expect(executor.Calls[0].Params).toEqual([TOPIC, 'k1', MSG, 120]);
    });

    it('reports Duplicate only for a Confirmed owner', async () => {
        const executor = new RecordingExecutor().QueueRows([]).QueueRows([{ MessageID: OTHER, Status: 'Confirmed' }]);
        const result = await new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG);
        expect(result).toEqual({ Kind: 'Duplicate', OwnerMessageID: OTHER });
        expect(executor.Calls[1].SQL).toContain('SELECT [MessageID], [Status]');
    });

    it('reports its own Confirmed row as a Duplicate: the earlier publish succeeded', async () => {
        const executor = new RecordingExecutor().QueueRows([]).QueueRows([{ MessageID: MSG.toLowerCase(), Status: 'Confirmed' }]);
        expect(await new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG))
            .toEqual({ Kind: 'Duplicate', OwnerMessageID: MSG.toLowerCase() });
    });

    it("reports Pending, never Duplicate, for another message's unexpired reservation", async () => {
        const executor = new RecordingExecutor().QueueRows([]).QueueRows([{ MessageID: OTHER, Status: 'Reserved' }]);
        expect(await new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG))
            .toEqual({ Kind: 'Pending', OwnerMessageID: OTHER });
    });

    it('retries after a unique-constraint race', async () => {
        const race = Object.assign(new Error("Violation of UNIQUE KEY constraint 'UQ_WorkQueueDeduplication_Topic_Key'"), { number: 2627 });
        const executor = new RecordingExecutor()
            .QueueError(race)
            .QueueRows([])
            .QueueRows([{ MessageID: OTHER, Status: 'Confirmed' }]);
        const result = await new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG);
        expect(result).toEqual({ Kind: 'Duplicate', OwnerMessageID: OTHER });
        expect(executor.Calls).toHaveLength(3);
    });

    it('tries again when the owner vanished between the two statements, then reserves', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([]).QueueRows([])                                   // attempt 1: not taken, no owner visible
            .QueueRows([{ MessageID: MSG, Status: 'Reserved' }]);         // attempt 2: taken
        expect(await new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG)).toEqual({ Kind: 'Reserved' });
        expect(executor.Calls).toHaveLength(3);
    });

    it('fails loudly when no attempt resolves the key', async () => {
        const executor = new RecordingExecutor();      // every statement answers with no rows
        await expect(new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG)).rejects.toThrow("key 'k1'");
        expect(executor.Calls).toHaveLength(6);
    });

    it('does not swallow errors that are not a race on the key', async () => {
        const executor = new RecordingExecutor().QueueError(new Error('connection reset'));
        await expect(new DeduplicationLedger(executor, TEST_USER).Reserve(TOPIC, 'k1', MSG)).rejects.toThrow('connection reset');
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

Run: `cd packages/WorkQueue/engine && pnpm test RunInWorkQueueTransaction sweepLock DeduplicationLedger`
Expected: FAIL — unresolved imports `../transaction/RunInWorkQueueTransaction`, `../sql/sweepLock` and `../dedup/DeduplicationLedger`.

- [ ] **Step 3: Write `src/transaction/RunInWorkQueueTransaction.ts`**

```typescript
import type { EntityTransactionScope } from '@memberjunction/core';
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
        await RollbackQuietly(scope);
        throw error;
    }
}

/** A failed rollback must never replace the error that caused it: callers classify that error (deadlock → retry). */
async function RollbackQuietly(scope: EntityTransactionScope): Promise<void> {
    try {
        await scope.Rollback();
    } catch {
        // The connection is already gone or the transaction already ended; the original error is what matters.
    }
}

const defaultWait = (attempt: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, 20 * attempt + Math.floor(Math.random() * 80)));

/** Retries an operation that failed with a deadlock, serialization error or lock timeout. Other errors propagate at once. */
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

- [ ] **Step 3b: Write `src/sql/sweepLock.ts`**

```typescript
import type { EntityTransactionScope, UserInfo } from '@memberjunction/core';
import { SWEEP_LOCK_RESOURCE } from '../constants';
import { CreateWorkQueueSqlBuilder } from './CreateWorkQueueSqlBuilder';
import type { SweepLockRow } from './rows';
import { ExecuteRows, ToBoolean } from './sqlExecution';
import type { WorkQueueExecutorSource, WorkQueueIndependentExecutor, WorkQueueSqlExecutor } from './WorkQueueSqlExecutor';

/** The sweep lock, held until Release(). Run the pass on Executor — never on the shared source (03 §11, F8). */
export interface SweepLock {
    Executor: WorkQueueSqlExecutor;
    Release(): Promise<void>;
}

/**
 * 03 §7 "one sweeper at a time" (F9). Returns null when another instance holds the lock. The lock is owned by a
 * transaction held open on a private independent executor — pooled connections make a session-level lock unsafe —
 * and the returned Executor is a second independent executor, so the pass's chunked statements commit on their own.
 */
export async function TryAcquireSweepLock(source: WorkQueueExecutorSource, contextUser: UserInfo): Promise<SweepLock | null> {
    const holder = await source.CreateIndependentInstance();
    let scope: EntityTransactionScope | null = null;
    try {
        scope = await holder.BeginEntityTransaction();
        const sql = CreateWorkQueueSqlBuilder(holder).Operator;
        const rows = await ExecuteRows<SweepLockRow>(holder, sql.AcquireSweepLock(SWEEP_LOCK_RESOURCE), contextUser);
        if (!ToBoolean(rows[0]?.Acquired)) {
            await EndLock(holder, scope, false);
            return null;
        }
        const worker = await source.CreateIndependentInstance();
        return BuildSweepLock(holder, scope, worker);
    } catch (error) {
        await EndLock(holder, scope, false);
        throw error;
    }
}

function BuildSweepLock(holder: WorkQueueIndependentExecutor, scope: EntityTransactionScope, worker: WorkQueueIndependentExecutor): SweepLock {
    let released = false;
    return {
        Executor: worker,
        Release: async () => {
            if (released) {
                return;
            }
            released = true;
            await worker.ReleaseIndependentInstance().catch(() => undefined);
            await EndLock(holder, scope, true);
        },
    };
}

/** Ends the lock transaction and releases its executor. Never throws: the caller's own error must survive. */
async function EndLock(holder: WorkQueueIndependentExecutor, scope: EntityTransactionScope | null, commit: boolean): Promise<void> {
    try {
        await (commit ? scope?.Commit() : scope?.Rollback());
    } catch {
        // The connection is gone or the transaction already ended; either way the lock is free.
    }
    await holder.ReleaseIndependentInstance().catch(() => undefined);
}
```

- [ ] **Step 4: Write `src/dedup/DeduplicationLedger.ts`**

```typescript
import type { UserInfo } from '@memberjunction/core';
import { DEDUP_RESERVATION_SECONDS, DEDUPLICATION_KEY_INDEX } from '../constants';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import type { ReservationRow } from '../sql/rows';
import { ExecuteRows, ExecuteWrite, IsUniqueViolation } from '../sql/sqlExecution';
import type { PublishSqlBuilder } from '../sql/WorkQueueSqlBuilder';
import type { WorkQueueSqlExecutor } from '../sql/WorkQueueSqlExecutor';

/** 03 §11. Only `Duplicate` means "a publish with this key already succeeded". */
export type LedgerReservation =
    | { Kind: 'Reserved' }                                  // new, expired-and-replaced, or re-taken by the same MessageID
    | { Kind: 'Duplicate'; OwnerMessageID: string }         // a Confirmed, unexpired row
    | { Kind: 'Pending'; OwnerMessageID: string };          // Reserved, unexpired, owned by a different MessageID

const RESERVE_ATTEMPTS = 3;

/**
 * The publish deduplication ledger (03 §2.1), shared by every transport. Construct it over a transaction (Database
 * publishes) or an independent executor (cloud publishes) — never over the shared source executor (03 §11).
 */
export class DeduplicationLedger {
    private readonly sql: PublishSqlBuilder;

    constructor(private readonly executor: WorkQueueSqlExecutor, private readonly contextUser: UserInfo) {
        this.sql = CreateWorkQueueSqlBuilder(executor).Publish;
    }

    public async Reserve(topicID: string, key: string, messageID: string): Promise<LedgerReservation> {
        for (let attempt = 1; attempt <= RESERVE_ATTEMPTS; attempt++) {
            if (await this.TryTake(topicID, key, messageID)) {
                return { Kind: 'Reserved' };
            }
            const owner = await this.ReadOwner(topicID, key);
            if (owner) {
                return owner.Status === 'Confirmed'
                    ? { Kind: 'Duplicate', OwnerMessageID: owner.MessageID }
                    : { Kind: 'Pending', OwnerMessageID: owner.MessageID };
            }
        }
        throw new Error(`Deduplication reservation for key '${key}' was not resolved after ${RESERVE_ATTEMPTS} attempts`);
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

    /** True when this call now owns the key (free, expired, or its own Reserved row re-taken). A key race reads as "not taken". */
    private async TryTake(topicID: string, key: string, messageID: string): Promise<boolean> {
        try {
            const rows = await ExecuteRows<ReservationRow>(
                this.executor,
                this.sql.ReserveDeduplication(topicID, key, messageID, DEDUP_RESERVATION_SECONDS),
                this.contextUser,
            );
            return rows.length > 0;
        } catch (error) {
            if (IsUniqueViolation(error, DEDUPLICATION_KEY_INDEX)) {
                return false;
            }
            throw error;
        }
    }

    /** A separate statement on purpose: it must see rows committed while the reserve statement was waiting. */
    private async ReadOwner(topicID: string, key: string): Promise<ReservationRow | null> {
        const rows = await ExecuteRows<ReservationRow>(this.executor, this.sql.SelectDeduplicationOwner(topicID, key), this.contextUser);
        return rows[0] ?? null;
    }
}
```

- [ ] **Step 5: Export the new modules**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './transaction/RunInWorkQueueTransaction';
export * from './sql/sweepLock';
export * from './dedup/DeduplicationLedger';
```

- [ ] **Step 6: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — previous suites plus RunInWorkQueueTransaction (8), sweepLock (4) and DeduplicationLedger (12).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 7: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): transaction helper and deduplication ledger"
```

---

### Task 8: Driver dependencies, owned executors, row mapping and `DatabaseTransportOperator`

**Files:**
- Create: `packages/WorkQueue/engine/src/transports/TransportDriverDeps.ts`, `src/transports/OwnedExecutor.ts`
- Create: `packages/WorkQueue/engine/src/transports/database/bindingIds.ts`, `src/transports/database/rowMapping.ts`
- Create: `packages/WorkQueue/engine/src/transports/database/DatabaseTransportOperator.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/rowMapping.test.ts`, `src/__tests__/OwnedExecutor.test.ts`, `src/__tests__/DatabaseTransportOperator.test.ts`
- Extend: `packages/WorkQueue/engine/src/__tests__/fakes.ts` (binding fixtures and a recording logger)

**Interfaces:**
- Consumes: `CreateWorkQueueSqlBuilder` (Task 6); rows (Task 3); execution helpers and `BACKLOG_COUNT_CAP` (Task 2); `IsWorkJson` from `@memberjunction/work-queue-base` (imported directly — never re-exported); from `@memberjunction/work-queue-core`: `ITransportOperator`, `SubscriptionBinding`, `TopicBinding`, `SubscriptionStats`, `DeadLetterRecord`, `PartitionStateRecord`, `PartitionCondition`, `Page`, `OperatorResult`, `BindingValidationIssue`, `WorkMessage`, `WorkJson`, `WorkPayloadRef`, `WorkProgress`, `WorkLogger`, `WorkQueueConfigurationError`.
- Produces:
  - `interface DeadLetteredEvent { SubscriptionName; DeliveryID; Reason; PartitionKey }`, `interface TransportDriverDeps { ContextUser: UserInfo; Executor: WorkQueueExecutorSource; Log: WorkLogger; InstanceID?: string; NotifyDeadLettered?: (event: DeadLetteredEvent) => void }` (03 §11)
  - `class OwnedExecutor { constructor(source: WorkQueueExecutorSource); Get(): Promise<WorkQueueIndependentExecutor>; Release(): Promise<void> }` — the F8 building block: one lazily minted independent executor per consumer or operator, released on close
  - `ReadTopicID(binding: TopicBinding): string`, `ReadSubscriptionIDs(binding: SubscriptionBinding): { SubscriptionID: string; TopicID: string }`
  - `ParseAttributes(json: string | null): Record<string, string>`, `ParsePayload<TPayload extends WorkJson>(json: string | null): TPayload | undefined`, `ParsePayloadRef(json: string | null): WorkPayloadRef | undefined`, `MessageFromColumns<TPayload extends WorkJson>(columns: MessageColumns, topicName: string): WorkMessage<TPayload>`, `SerializeProgress(progress: WorkProgress): string`, `EncodeCursor(value: Record<string, string>): string`, `DecodeCursorField(cursor: string, field: string): string`, `IsUUID(value: string): boolean`, `ClampPageSize(pageSize: number): number`, `TruncateNote(text: string | null): string | null`, `interface MessageColumns`
  - `class DatabaseTransportOperator implements ITransportOperator { constructor(source: WorkQueueExecutorSource, deps: TransportDriverDeps); GetBacklog(subscription): Promise<{ Claimable: number; InFlight: number; Capped: boolean }>; CheckPrerequisites(): Promise<BindingValidationIssue[]>; Close(): Promise<void> }`
  - Fakes: `TopicBindingFixture(overrides?)`, `SubscriptionBindingFixture(policy?, config?)`, `RecordingLogger`, `TestDeps(executor)`

**Binding convention (Database transport):** `TopicBinding.Config.TopicID` and `SubscriptionBinding.Config.SubscriptionID` / `.TopicID` carry the row IDs. Task 11's binding builders always add them.

**Executor ownership (03 §11, F8).** Both data providers route an un-sourced `ExecuteSQL` onto the provider's *ambient
transaction*. If operator or consumer SQL ran on the shared server provider, an unrelated unit of work (an IS-A save,
say) could absorb a claim or a settle and roll it back — un-claiming a delivery whose handler is already running. So the
operator **never executes on the source**: it mints one independent executor (`OwnedExecutor`) on first use, runs every
statement there, and releases it in `Close()`. It opens no transaction on that executor: after Revision 4 every
operator action is a single guarded statement.

**Discard is one guarded statement per case (03 §5.2):** `Pending`/`DeadLettered` → `Discarded`; otherwise `InFlight` →
cancel flag (`CancelRequested: true`). The pair is tried twice, because the status can flip between the two statements
(an in-flight delivery can return to `Pending` just after the first missed it). `CancelRequested` is present — and
`true` — only when an in-flight delivery was asked to stop.

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
    ClampPageSize, DecodeCursorField, EncodeCursor, IsUUID, MessageFromColumns,
    ParseAttributes, ParsePayload, ParsePayloadRef, SerializeProgress, TruncateNote,
} from '../transports/database/rowMapping';
import { ReadSubscriptionIDs, ReadTopicID } from '../transports/database/bindingIds';
import { SubscriptionBindingFixture, TopicBindingFixture } from './fakes';

describe('JSON column parsing', () => {
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
            MessageID: 'm1', PartitionKey: null, Attributes: '{"a":"b"}', Payload: null,
            PayloadRef: null, CorrelationID: null, PublishedAt: new Date('2026-01-01T00:00:00Z'),
        }, 'import.ready');
        expect(message).toEqual({
            MessageID: 'm1', Topic: 'import.ready', Attributes: { a: 'b' }, PublishedAt: '2026-01-01T00:00:00.000Z',
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

    it('truncates operator notes to the ResolutionNote column', () => {
        expect(TruncateNote('x'.repeat(1500))).toHaveLength(1000);
        expect(TruncateNote(null)).toBeNull();
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

`packages/WorkQueue/engine/src/__tests__/OwnedExecutor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { OwnedExecutor } from '../transports/OwnedExecutor';
import { RecordingExecutor } from './fakes';

describe('OwnedExecutor', () => {
    it('mints one independent executor on first use and reuses it', async () => {
        const source = new RecordingExecutor();
        const owned = new OwnedExecutor(source);
        const first = await owned.Get();
        const [second, third] = await Promise.all([owned.Get(), owned.Get()]);
        expect(second).toBe(first);
        expect(third).toBe(first);
        expect(source.Events).toEqual(['independent']);
    });

    it('releases the executor once, and mints a fresh one afterwards', async () => {
        const source = new RecordingExecutor();
        const owned = new OwnedExecutor(source);
        await owned.Get();
        await owned.Release();
        await owned.Release();
        await owned.Get();
        expect(source.Events).toEqual(['independent', 'release', 'independent']);
    });

    it('does not cache a failed mint', async () => {
        const source = new RecordingExecutor();
        const mint = source.CreateIndependentInstance.bind(source);
        let calls = 0;
        source.CreateIndependentInstance = async () => {
            if (++calls === 1) {
                throw new Error('pool exhausted');
            }
            return mint();
        };
        const owned = new OwnedExecutor(source);
        await expect(owned.Get()).rejects.toThrow('pool exhausted');
        await expect(owned.Get()).resolves.toBeDefined();
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
const USER = '11111111-0000-0000-0000-000000000001';

function DeadLetterRowFixture(id: string): object {
    return {
        DeliveryID: id, AttemptCount: 5, DeadLetterReason: 'MaxAttemptsExceeded', LastError: 'boom',
        DeadLetteredAt: new Date('2026-01-01T00:00:00Z'), DeliveryPartitionKey: 'venue-42', BlocksKey: 1,
        MessageID: 'M1', PartitionKey: 'venue-42', Attributes: '{}', Payload: '{"a":1}',
        PayloadRef: null, CorrelationID: null, PublishedAt: new Date('2026-01-01T00:00:00Z'),
    };
}

describe('DatabaseTransportOperator executor ownership (03 §11, F8)', () => {
    it('runs every statement on its own independent executor, never on the shared source', async () => {
        const source = new RecordingExecutor()
            .QueueRows([{ Pending: 0, InFlight: 0, DeadLettered: 0, BlockedKeys: null, OldestPendingAgeSeconds: null, CompletedLastHour: 0 }])
            .QueueRows([{ AffectedRows: 1 }]);
        const operator = new DatabaseTransportOperator(source, TestDeps(source));
        await operator.GetStats(SubscriptionBindingFixture());
        await operator.Replay(SubscriptionBindingFixture(), DELIVERY, null, null);
        expect(source.CallsOn('source')).toHaveLength(0);
        expect(source.CallsOn('independent#1')).toHaveLength(2);
        expect(source.Calls.every(call => !call.InTransaction)).toBe(true);
    });

    it('releases its executor on Close', async () => {
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]);
        const operator = new DatabaseTransportOperator(source, TestDeps(source));
        await operator.Replay(SubscriptionBindingFixture(), DELIVERY, null, null);
        await operator.Close();
        expect(source.Events).toEqual(['independent', 'release']);
    });
});

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

    it('returns null blocked keys for unordered subscriptions and never a negative age', async () => {
        const executor = new RecordingExecutor().QueueRows([{ Pending: 1, InFlight: 0, DeadLettered: 0, BlockedKeys: null, OldestPendingAgeSeconds: -30, CompletedLastHour: 0 }]);
        const stats = await new DatabaseTransportOperator(executor, TestDeps(executor)).GetStats(SubscriptionBindingFixture());
        expect(stats.BlockedKeys).toBeNull();
        expect(stats.OldestPendingAgeSeconds).toBe(0);      // every pending row is still in backoff
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

    it('maps partition rows to the 03 §5.2 record', async () => {
        const executor = new RecordingExecutor().QueueRows([{
            PartitionKey: 'venue-42', Condition: 'Blocked', HeadDeliveryID: DELIVERY, WaitingItems: '4',
        }]);
        const page = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .ListPartitions(SubscriptionBindingFixture({ PartitionMode: 'Ordered' }), 'Blocked', null, 10);
        expect(page?.Items).toEqual([{ PartitionKey: 'venue-42', Condition: 'Blocked', HeadDeliveryID: DELIVERY, WaitingItems: 4 }]);
    });
});

describe('DatabaseTransportOperator resolutions', () => {
    it('replays a dead letter, truncating the note, and reports a change', async () => {
        const executor = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]);
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .Replay(SubscriptionBindingFixture(), DELIVERY, null, 'n'.repeat(1200));
        expect(result).toEqual({ Supported: true, Changed: true });
        expect(String(executor.Calls[0].Params[3])).toHaveLength(1000);
    });

    it('does not touch the database for a malformed delivery ID', async () => {
        const executor = new RecordingExecutor();
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor)).Replay(SubscriptionBindingFixture(), 'nope', null, null);
        expect(result).toEqual({ Supported: true, Changed: false });
        expect(executor.Calls).toHaveLength(0);
    });

    it('discards a pending or dead-lettered delivery with one guarded statement', async () => {
        const executor = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]);
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .Discard(SubscriptionBindingFixture({ PartitionMode: 'Ordered' }), DELIVERY, 'bad batch', null);
        expect(result).toEqual({ Supported: true, Changed: true });       // CancelRequested is absent: nothing was in flight
        expect(executor.Calls).toHaveLength(1);
        expect(executor.Calls[0].SQL).toContain("N'DeadLettered', N'Pending'");
        expect(executor.Events).toEqual(['independent']);                 // no transaction
    });

    it('sets the cancel flag when the delivery is in flight, leaving the token unchanged', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ AffectedRows: 0 }])       // DiscardDelivery matched nothing (row is InFlight)
            .QueueRows([{ AffectedRows: 1 }]);      // CancelInFlightDelivery set the flag
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .Discard(SubscriptionBindingFixture(), DELIVERY, 'operator cancelled', USER);
        expect(result).toEqual({ Supported: true, Changed: true, CancelRequested: true });
        expect(executor.Calls[1].SQL).toContain('[CancelRequestedAt] = SYSDATETIMEOFFSET()');
        expect(executor.Calls[1].SQL).not.toContain('[LeaseToken]');
    });

    it('tries the pair again when the status flipped between the two statements', async () => {
        const executor = new RecordingExecutor()
            .QueueRows([{ AffectedRows: 0 }]).QueueRows([{ AffectedRows: 0 }])     // in flight, then back to Pending in between
            .QueueRows([{ AffectedRows: 1 }]);                                     // second pass discards it
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .Discard(SubscriptionBindingFixture(), DELIVERY, 'cancel', null);
        expect(result).toEqual({ Supported: true, Changed: true });
        expect(executor.Calls).toHaveLength(3);
    });

    it('reports no change when the delivery is already completed', async () => {
        const executor = new RecordingExecutor();      // every statement affects 0 rows
        const result = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .Discard(SubscriptionBindingFixture(), DELIVERY, 'too late', null);
        expect(result).toEqual({ Supported: true, Changed: false });
        expect(executor.Calls).toHaveLength(4);
    });
});

describe('DatabaseTransportOperator backlog and prerequisites', () => {
    it('reports the autoscaler backlog as capped claimable plus in-flight counts', async () => {
        const executor = new RecordingExecutor().QueueRows([{ Claimable: '7', InFlight: 2 }]);
        const backlog = await new DatabaseTransportOperator(executor, TestDeps(executor))
            .GetBacklog(SubscriptionBindingFixture({ PartitionMode: 'Ordered' }));
        expect(backlog).toEqual({ Claimable: 7, InFlight: 2, Capped: false });
        expect(executor.Calls[0].SQL).toContain('AS [Claimable]');
        expect(executor.Calls[0].Params).toEqual(['BBBBBBBB-0000-0000-0000-000000000001', 1000]);
    });

    it('flags a capped backlog', async () => {
        const executor = new RecordingExecutor().QueueRows([{ Claimable: 1400, InFlight: 3 }]);      // keyless + keyed halves, each capped
        const backlog = await new DatabaseTransportOperator(executor, TestDeps(executor)).GetBacklog(SubscriptionBindingFixture({ PartitionMode: 'Exclusive' }));
        expect(backlog).toEqual({ Claimable: 1000, InFlight: 3, Capped: true });
    });

    it('reports an Error when READ_COMMITTED_SNAPSHOT is off, and nothing when it is on', async () => {
        const off = new RecordingExecutor().QueueRows([{ SnapshotOn: 0 }]);
        const issues = await new DatabaseTransportOperator(off, TestDeps(off)).CheckPrerequisites();
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({ Severity: 'Error', Subject: 'Database transport' });
        expect(issues[0].Message).toContain('READ_COMMITTED_SNAPSHOT');
        const on = new RecordingExecutor().QueueRows([{ SnapshotOn: true }]);
        expect(await new DatabaseTransportOperator(on, TestDeps(on)).CheckPrerequisites()).toEqual([]);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test rowMapping OwnedExecutor DatabaseTransportOperator`
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
import { IsWorkJson } from '@memberjunction/work-queue-base';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { WorkJson, WorkMessage, WorkPayloadRef, WorkProgress } from '@memberjunction/work-queue-core';
import { ToIsoString } from '../../sql/sqlExecution';

const PROGRESS_MAX_CHARS = 4000;
const PROGRESS_MESSAGE_MAX_CHARS = 500;
const RESOLUTION_NOTE_MAX_CHARS = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Message columns as they come back from claim and dead-letter queries. */
export interface MessageColumns {
    MessageID: string;
    PartitionKey: string | null;
    Attributes: string | null;
    Payload: string | null;
    PayloadRef: string | null;
    CorrelationID: string | null;
    PublishedAt: Date | string;
}

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
    const payload = ParsePayload<TPayload>(columns.Payload);
    const payloadRef = ParsePayloadRef(columns.PayloadRef);
    if (columns.PartitionKey !== null) message.PartitionKey = columns.PartitionKey;
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

/** Operator reasons and notes are stored in ResolutionNote, NVARCHAR(1000) (03 §5.2). */
export function TruncateNote(text: string | null): string | null {
    return text === null ? null : text.slice(0, RESOLUTION_NOTE_MAX_CHARS);
}

export function ClampPageSize(pageSize: number): number {
    if (!Number.isFinite(pageSize) || pageSize === 0) {
        return 50;
    }
    return Math.min(Math.max(Math.floor(pageSize), 1), 500);
}
```

- [ ] **Step 6b: Write `src/transports/OwnedExecutor.ts`**

```typescript
import type { WorkQueueExecutorSource, WorkQueueIndependentExecutor } from '../sql/WorkQueueSqlExecutor';

/**
 * One independent executor, minted on first use and released on close (03 §11 "Executor ownership"). Consumers and
 * operators run single statements on it concurrently — it has its own transaction stack, and nothing here ever opens
 * a transaction on it, so an unrelated unit of work can never absorb a claim or a settle.
 */
export class OwnedExecutor {
    private instance: Promise<WorkQueueIndependentExecutor> | null = null;

    constructor(private readonly source: WorkQueueExecutorSource) {}

    public Get(): Promise<WorkQueueIndependentExecutor> {
        const existing = this.instance;
        if (existing) {
            return existing;
        }
        const minted = this.source.CreateIndependentInstance();
        this.instance = minted;
        minted.catch(() => {
            if (this.instance === minted) {
                this.instance = null;       // never cache a failed mint
            }
        });
        return minted;
    }

    public async Release(): Promise<void> {
        const held = this.instance;
        this.instance = null;
        if (held) {
            const executor = await held.catch(() => null);
            await executor?.ReleaseIndependentInstance();
        }
    }
}
```

- [ ] **Step 7: Write `src/transports/database/DatabaseTransportOperator.ts`**

```typescript
import type {
    BindingValidationIssue, DeadLetterRecord, ITransportOperator, OperatorResult, Page, PartitionCondition,
    PartitionStateRecord, SubscriptionBinding, SubscriptionStats,
} from '@memberjunction/work-queue-core';
import { BACKLOG_COUNT_CAP } from '../../constants';
import { CreateWorkQueueSqlBuilder } from '../../sql/CreateWorkQueueSqlBuilder';
import type { BacklogRow, DeadLetterRow, IsolationRow, PartitionRow, StatsRow } from '../../sql/rows';
import { ExecuteRows, ExecuteWrite, ToBoolean, ToIsoString, ToNumber } from '../../sql/sqlExecution';
import type { WorkQueueSqlBuilder } from '../../sql/WorkQueueSqlBuilder';
import type { SqlStatement, WorkQueueExecutorSource } from '../../sql/WorkQueueSqlExecutor';
import { OwnedExecutor } from '../OwnedExecutor';
import type { TransportDriverDeps } from '../TransportDriverDeps';
import { ReadSubscriptionIDs } from './bindingIds';
import { ClampPageSize, DecodeCursorField, EncodeCursor, IsUUID, MessageFromColumns, TruncateNote } from './rowMapping';

/** The status can flip between the two guarded statements of a Discard (03 §5.2), so the pair is tried twice. */
const DISCARD_PASSES = 2;

export class DatabaseTransportOperator implements ITransportOperator {
    private readonly sql: WorkQueueSqlBuilder;
    private readonly owned: OwnedExecutor;

    constructor(source: WorkQueueExecutorSource, private readonly deps: TransportDriverDeps) {
        this.sql = CreateWorkQueueSqlBuilder(source);
        this.owned = new OwnedExecutor(source);
    }

    public async GetStats(subscription: SubscriptionBinding): Promise<SubscriptionStats> {
        const ids = ReadSubscriptionIDs(subscription);
        const ordered = subscription.Policy.PartitionMode === 'Ordered';
        const rows = await this.Rows<StatsRow>(this.sql.Operator.SubscriptionStats(ids.SubscriptionID, ordered));
        const row = rows[0];
        const age = ToNumber(row?.OldestPendingAgeSeconds);
        return {
            SubscriptionName: subscription.Policy.SubscriptionName,
            Pending: ToNumber(row?.Pending) ?? 0,
            InFlight: ToNumber(row?.InFlight) ?? 0,
            DeadLettered: ToNumber(row?.DeadLettered) ?? 0,
            BlockedKeys: ordered ? ToNumber(row?.BlockedKeys) ?? 0 : null,
            OldestPendingAgeSeconds: age === null ? null : Math.max(0, age),
            CompletedLastHour: ToNumber(row?.CompletedLastHour) ?? 0,
            AsOf: new Date().toISOString(),
        };
    }

    public async ListDeadLetters(subscription: SubscriptionBinding, cursor: string | null, pageSize: number): Promise<Page<DeadLetterRecord>> {
        const ids = ReadSubscriptionIDs(subscription);
        const size = ClampPageSize(pageSize);
        const after = cursor ? { DeliveryID: DecodeCursorField(cursor, 'DeliveryID') } : null;
        const ordered = subscription.Policy.PartitionMode === 'Ordered';
        const rows = await this.Rows<DeadLetterRow>(this.sql.Operator.ListDeadLetters(ids.SubscriptionID, ordered, after, size + 1));
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
        const rows = await this.Rows<PartitionRow>(this.sql.Operator.ListPartitions(ids.SubscriptionID, ordered, condition, afterKey, size + 1));
        const page = rows.slice(0, size);
        const last = page[page.length - 1];
        return {
            Items: page.map(row => ({
                PartitionKey: row.PartitionKey,
                Condition: row.Condition,
                HeadDeliveryID: row.HeadDeliveryID,
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
        const count = await this.Write(this.sql.Operator.ReplayDelivery(ids.SubscriptionID, deliveryID, actorUserID, TruncateNote(note)));
        this.deps.Log.Info(`Replay of delivery ${deliveryID} on '${subscription.Policy.SubscriptionName}': ${count === 1 ? 'replayed' : 'not dead-lettered'}`);
        return { Supported: true, Changed: count === 1 };
    }

    /**
     * Pending or DeadLettered → Discarded at once. InFlight → the cancel flag is set (03 §7, F2): the lease token is left
     * unchanged, so the holder learns of it on its next heartbeat (≤ 30 s), stops, and acknowledges — freeing an
     * Exclusive/Ordered key immediately. If the holder is dead, ExpireLeases discards the row when the lease runs out.
     */
    public async Discard(subscription: SubscriptionBinding, deliveryID: string, reason: string, actorUserID: string | null): Promise<OperatorResult> {
        if (!IsUUID(deliveryID)) {
            return { Supported: true, Changed: false };
        }
        const ids = ReadSubscriptionIDs(subscription);
        const name = subscription.Policy.SubscriptionName;
        const note = TruncateNote(reason) ?? '';
        for (let pass = 1; pass <= DISCARD_PASSES; pass++) {
            const discarded = await this.Write(this.sql.Operator.DiscardDelivery(ids.SubscriptionID, deliveryID, true, actorUserID, note));
            if (discarded === 1) {
                this.deps.Log.Info(`Discard of delivery ${deliveryID} on '${name}': discarded (${note})`);
                return { Supported: true, Changed: true };
            }
            const cancelled = await this.Write(this.sql.Operator.CancelInFlightDelivery(ids.SubscriptionID, deliveryID, actorUserID, note));
            if (cancelled === 1) {
                this.deps.Log.Info(`Discard of delivery ${deliveryID} on '${name}': in flight, cancel requested (${note})`);
                return { Supported: true, Changed: true, CancelRequested: true };
            }
        }
        this.deps.Log.Info(`Discard of delivery ${deliveryID} on '${name}': not discardable (${note})`);
        return { Supported: true, Changed: false };
    }

    /**
     * Autoscaler metric (03 §11). `Claimable` applies the partition rules, so a blocked Ordered key contributes
     * nothing; `InFlight` is reported separately because scalers subtract running executions from the metric. Each
     * count is capped (the statement stops counting at the cap); `Capped` says a cap was hit.
     */
    public async GetBacklog(subscription: SubscriptionBinding): Promise<{ Claimable: number; InFlight: number; Capped: boolean }> {
        const ids = ReadSubscriptionIDs(subscription);
        const rows = await this.Rows<BacklogRow>(
            this.sql.Consume.SubscriptionBacklog(ids.SubscriptionID, subscription.Policy.PartitionMode, BACKLOG_COUNT_CAP));
        const claimable = ToNumber(rows[0]?.Claimable) ?? 0;
        const inFlight = ToNumber(rows[0]?.InFlight) ?? 0;
        return {
            Claimable: Math.min(claimable, BACKLOG_COUNT_CAP),
            InFlight: Math.min(inFlight, BACKLOG_COUNT_CAP),
            Capped: claimable >= BACKLOG_COUNT_CAP || inFlight >= BACKLOG_COUNT_CAP,
        };
    }

    /** Database prerequisites (03 §6 "Isolation"): without snapshot reads, publishers, claimers and the scaler block each other. */
    public async CheckPrerequisites(): Promise<BindingValidationIssue[]> {
        const rows = await this.Rows<IsolationRow>(this.sql.Operator.ReadCommittedSnapshotState());
        if (rows.length > 0 && !ToBoolean(rows[0].SnapshotOn)) {
            return [{
                Severity: 'Error',
                Subject: 'Database transport',
                Message: 'READ_COMMITTED_SNAPSHOT is OFF for this SQL Server database. The Database transport requires it '
                    + '(ALTER DATABASE [<name>] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;).',
            }];
        }
        return [];
    }

    /** Releases the operator's independent executor (03 §11). */
    public Close(): Promise<void> {
        return this.owned.Release();
    }

    private async Rows<T>(statement: SqlStatement): Promise<T[]> {
        return ExecuteRows<T>(await this.owned.Get(), statement, this.deps.ContextUser);
    }

    private async Write(statement: SqlStatement): Promise<number> {
        return ExecuteWrite(await this.owned.Get(), statement, this.deps.ContextUser);
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

`ITransportOperator.ListDeadLetters` / `ListPartitions` allow `null` for unsupported transports; the Database operator always supports them and returns a page. `GetBacklog`, `CheckPrerequisites` and `Close` are Database-operator members, not part of the core operator contract; the engine reaches them through `DatabaseTransportDriver` (Task 9).

- [ ] **Step 8: Export the new modules**

Append to `packages/WorkQueue/engine/src/index.ts`:

```typescript
export * from './transports/TransportDriverDeps';
export * from './transports/OwnedExecutor';
export * from './transports/database/bindingIds';
export * from './transports/database/rowMapping';
export * from './transports/database/DatabaseTransportOperator';
```

- [ ] **Step 9: Run the tests and build**

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — previous suites plus rowMapping (11), OwnedExecutor (3) and DatabaseTransportOperator (17).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 10: Commit**

```bash
git add packages/WorkQueue/engine/src
git commit -m "feat(work-queue-engine): Database transport operator, owned executors and row mapping"
```

---

### Task 9: `DatabaseTransportDriver` and `DatabaseTransportConsumer`

**Files:**
- Create: `packages/WorkQueue/engine/src/transports/database/databaseCapabilities.ts`, `src/transports/database/deliveryPlan.ts`
- Create: `packages/WorkQueue/engine/src/publish/publishResults.ts`
- Create: `packages/WorkQueue/engine/src/transports/database/DatabaseTransportDriver.ts`, `src/transports/database/DatabaseTransportConsumer.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`, `src/constants.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/deliveryPlan.test.ts`, `src/__tests__/DatabaseTransportDriver.test.ts`, `src/__tests__/DatabaseTransportConsumer.test.ts`

**Interfaces:**
- Consumes: Tasks 2–8 (`CreateWorkQueueSqlBuilder`, rows, execution helpers, `RunInWorkQueueTransaction`, `RetryTransient`, `TransportDriverDeps`, `OwnedExecutor`, `ReadTopicID`, `ReadSubscriptionIDs`, `MessageFromColumns`, `SerializeProgress`, `DatabaseTransportOperator`, fakes); `DATABASE_DRIVER_CLASS` from `@memberjunction/work-queue-base`; from core: `ITransportDriver`, `ITransportConsumer`, `TransportCapabilities`, `LeaseExtension`, `DatabasePublishOptions`, `TopicBinding`, `SubscriptionBinding`, `WorkMessage`, `WorkJson`, `WorkProgress`, `PublishResult`, `ReceivedDelivery`, `SettleResult`, `BindingValidationIssue`, `PartitionMode`, `MatchesFilter`, `CanonicalEnvelope`, `WORK_QUEUE_FILTER_SUPPORT`.
- Produces:
  - Constant `CANDIDATE_OVERSCAN = 4` (`src/constants.ts`)
  - `DATABASE_TRANSPORT_CAPABILITIES: TransportCapabilities` (03 §5 Database values, including `Filters: WORK_QUEUE_FILTER_SUPPORT`)
  - `Accepted(messageID: string): PublishResult`, `Duplicate(messageID: string): PublishResult`, `Rejected(messageID: string, code: string, message: string, retryable: boolean): PublishResult`
  - `interface PlannedDelivery { SubscriptionID: string; PartitionMode: PartitionMode }`, `interface DeliveryPlan { Deliveries: PlannedDelivery[]; NeedsPublishOrderLock: boolean }`
  - `BuildDeliveryPlan(message: WorkMessage, subscriptions: SubscriptionBinding[]): DeliveryPlan`, `ToMessageInsertRow(message: WorkMessage, topicID: string, userID: string | null): MessageInsertRow`, `ToDeliveryRows(message: WorkMessage, plan: DeliveryPlan, publishOrdinal: number): DeliveryInsertRow[]`, `ResolveExistingMessage(existing: ExistingMessageRow | undefined, message: WorkMessage, topicID: string): PublishResult`, `PublishOrderKeys(messages: WorkMessage[], subscriptions: SubscriptionBinding[]): string[]`
  - `interface DatabaseTransportPublishOptions extends DatabasePublishOptions { Kind: 'Database'; Executor?: WorkQueueTransactionalExecutor; UserID?: string }` (03 §11), `IsDatabaseTransportPublishOptions(options: DatabasePublishOptions | undefined): options is DatabaseTransportPublishOptions`
  - `DefaultInstanceID(): string`
  - `class DatabaseTransportDriver implements ITransportDriver { constructor(source: WorkQueueExecutorSource, deps: TransportDriverDeps); get InstanceID(): string; AcquirePublishOrderLocks(topic, messages, subscriptions, executor): Promise<void>; GetBacklog(subscription): Promise<{ Claimable: number; InFlight: number; Capped: boolean }>; CheckPrerequisites(): Promise<BindingValidationIssue[]>; Close(): Promise<void> }`
  - `class DatabaseTransportConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> { constructor(source: WorkQueueExecutorSource, sql: WorkQueueSqlBuilder, binding: SubscriptionBinding, deps: TransportDriverDeps, leaseOwner: string) }`

**Publish rules (03 §2.1, §7).**
- Each message is written in its own transaction **on a fresh independent executor** (with transient retry) — or inside the caller's transaction when `DatabaseTransportPublishOptions.Executor` is set, in which case the caller commits.
- **Enlisted publishes never swallow a database error.** When the caller supplied the executor, every thrown error propagates: the caller owns the transaction, its retry policy must see the deadlock (reviewer M1), and on PostgreSQL the transaction is already doomed. Only a publish that manages its own transaction maps errors to `Rejected TransportUnavailable`.
- Every matching `Active`/`Paused` subscription the engine passed receives a delivery; delivery `PartitionKey` is set only for `Exclusive`/`Ordered` subscriptions; `OrderKey` is **always** the message's `PublishOrdinal`.
- A keyed message with a matching `Ordered` subscription takes the publish-order lock before the message insert, so ordinals commit in key order. A publish enlisted in a caller's transaction takes **all** its locks first, in **sorted key order** (`AcquirePublishOrderLocks`), so two callers publishing the same keys in opposite orders cannot deadlock; a lock timeout is a transient error.
- `MessageID` is globally unique: when `InsertMessage` inserts nothing, `SelectMessage` (a separate statement) reads the stored row — same topic and same `CanonicalEnvelope` → `Duplicate`, anything else → `MessageIDConflict`.
- A message with no matching subscription is still stored (so `MessageID` duplicates stay detectable) and is purged by retention.

**Consume rules (03 §7, §11).**
- The consumer **owns an independent executor** (`OwnedExecutor`): created on first use, released in `Close()`. No statement ever runs on the shared source, and no transaction is ever opened on the owned executor — every consumer statement is a single guarded write or read.
- `Receive` runs `ExpireLeases` (raising `NotifyDeadLettered` for each returned row with the reason the statement wrote), then for partitioned subscriptions selects candidates with `CANDIDATE_OVERSCAN`, keeps **the first candidate of each partition key**, and claims each with its own guarded statement — a violation of `UQ_WorkQueueDelivery_InFlightPartition` means another worker won that key and skips only that candidate. Remaining capacity is filled with keyless deliveries. `waitSeconds` is ignored: the Database consumer never long-polls; the runtime's idle backoff paces it.
- `ExtendLease` that changes no row asks `SelectLeaseState`: still in flight under this token with the cancel flag → `'Cancelled'`; otherwise `'Lost'`. A thrown error propagates — the runtime treats it as transient and retries next tick (03 §5).
- Settles are fenced; zero rows means `LeaseLost`; infrastructure errors become `Failed`. `AcknowledgeCancel` turns a cancelled in-flight delivery into `Discarded` at once.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/deliveryPlan.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { WorkMessage } from '@memberjunction/work-queue-core';
import {
    BuildDeliveryPlan, PublishOrderKeys, ResolveExistingMessage, ToDeliveryRows, ToMessageInsertRow,
} from '../transports/database/deliveryPlan';
import type { ExistingMessageRow } from '../sql/rows';
import { SubscriptionBindingFixture, TOPIC_ID } from './fakes';

const MESSAGE: WorkMessage = {
    MessageID: 'CCCCCCCC-0000-0000-0000-000000000001',
    Topic: 'import.ready',
    PartitionKey: 'venue-42',
    Attributes: { eventType: 'import', source: 'tessitura' },
    Payload: { importId: 'x', tables: 3 },
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
        const plan = BuildDeliveryPlan(MESSAGE, [NONE, filtered]);
        expect(plan.Deliveries.map(d => d.SubscriptionID)).toEqual(['S-NONE']);
    });

    it('requires the publish-order lock only for keyed messages with a matching Ordered subscription', () => {
        expect(BuildDeliveryPlan(MESSAGE, [NONE, EXCLUSIVE]).NeedsPublishOrderLock).toBe(false);
        expect(BuildDeliveryPlan(MESSAGE, [ORDERED]).NeedsPublishOrderLock).toBe(true);
        const keyless = { ...MESSAGE, PartitionKey: undefined };
        expect(BuildDeliveryPlan(keyless, [ORDERED]).NeedsPublishOrderLock).toBe(false);
    });

    it('lists the distinct keys that need a publish-order lock in sorted order', () => {
        const messages = [{ ...MESSAGE, PartitionKey: 'b' }, { ...MESSAGE, PartitionKey: 'a' }, { ...MESSAGE, PartitionKey: 'b' }, { ...MESSAGE, PartitionKey: undefined }];
        expect(PublishOrderKeys(messages, [ORDERED])).toEqual(['a', 'b']);
        expect(PublishOrderKeys(messages, [EXCLUSIVE])).toEqual([]);
    });
});

describe('row builders', () => {
    it('stores the partition key only on partitioned deliveries, and the publish ordinal as the order key', () => {
        const plan = BuildDeliveryPlan(MESSAGE, [NONE, EXCLUSIVE]);
        expect(ToDeliveryRows(MESSAGE, plan, 17)).toEqual([
            { MessageID: MESSAGE.MessageID, SubscriptionID: 'S-NONE', PartitionKey: null, OrderKey: 17 },
            { MessageID: MESSAGE.MessageID, SubscriptionID: 'S-EXCL', PartitionKey: 'venue-42', OrderKey: 17 },
        ]);
    });

    it('serialises the envelope for insert, leaving PublishedAt to the database', () => {
        expect(ToMessageInsertRow(MESSAGE, TOPIC_ID, 'U1')).toEqual({
            ID: MESSAGE.MessageID, TopicID: TOPIC_ID, PartitionKey: 'venue-42',
            AttributesJSON: '{"eventType":"import","source":"tessitura"}', PayloadJSON: '{"importId":"x","tables":3}', PayloadRefJSON: null,
            CorrelationID: null, PublishedByUserID: 'U1',
        });
    });
});

describe('ResolveExistingMessage (03 §2.1, F10)', () => {
    const existing = (overrides: Partial<ExistingMessageRow> = {}): ExistingMessageRow => ({
        ID: MESSAGE.MessageID.toLowerCase(), TopicID: TOPIC_ID.toLowerCase(), PartitionKey: 'venue-42',
        Attributes: '{"source":"tessitura","eventType":"import"}',     // stored with a different key order
        Payload: '{"tables":3,"importId":"x"}', PayloadRef: null, CorrelationID: null, ...overrides,
    });

    it('treats the same canonical envelope on the same topic as a duplicate, whatever the key order', () => {
        expect(ResolveExistingMessage(existing(), MESSAGE, TOPIC_ID)).toEqual({ MessageID: MESSAGE.MessageID, Status: 'Duplicate' });
    });

    it('rejects a reused ID with a different envelope', () => {
        const result = ResolveExistingMessage(existing({ Payload: '{"importId":"y"}' }), MESSAGE, TOPIC_ID);
        expect(result.Status).toBe('Rejected');
        expect(result.Error).toMatchObject({ Code: 'MessageIDConflict', Retryable: false });
    });

    it('rejects a reused ID on another topic: MessageID is globally unique', () => {
        const result = ResolveExistingMessage(existing({ TopicID: 'AAAAAAAA-0000-0000-0000-000000000099' }), MESSAGE, TOPIC_ID);
        expect(result.Error?.Code).toBe('MessageIDConflict');
    });

    it('asks the caller to retry when the conflicting row is no longer visible', () => {
        const result = ResolveExistingMessage(undefined, MESSAGE, TOPIC_ID);
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

const INSERTED = { ID: MESSAGE.MessageID, PublishOrdinal: '17' };
const STORED = { ID: MESSAGE.MessageID, TopicID: 'AAAAAAAA-0000-0000-0000-000000000001', PartitionKey: 'venue-42', Attributes: '{}', Payload: null, PayloadRef: null, CorrelationID: null };

describe('DatabaseTransportDriver.Publish', () => {
    it('writes the message and deliveries in one transaction on an independent executor, and accepts', async () => {
        const source = new RecordingExecutor().QueueRows([INSERTED]).QueueRows([{ AffectedRows: 2 }]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const subs = [
            SubscriptionBindingFixture({ PartitionMode: 'None' }, { SubscriptionID: 'S-NONE' }),
            SubscriptionBindingFixture({ PartitionMode: 'Exclusive' }, { SubscriptionID: 'S-EXCL' }),
        ];
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], subs);
        expect(result).toEqual({ MessageID: MESSAGE.MessageID, Status: 'Accepted' });
        expect(source.Calls[0].SQL).toContain('[WorkQueueMessage]');
        expect(source.Calls[1].Params).toEqual([MESSAGE.MessageID, 'S-NONE', null, 17, MESSAGE.MessageID, 'S-EXCL', 'venue-42', 17]);
        expect(source.Events).toEqual(['independent', 'begin', 'commit', 'release']);
        expect(source.Calls.every(call => call.Executor === 'independent#1' && call.InTransaction)).toBe(true);
    });

    it('takes the publish-order lock first for Ordered subscriptions', async () => {
        const source = new RecordingExecutor().QueueRows([{ LockResult: 0 }]).QueueRows([INSERTED]).QueueRows([{ AffectedRows: 1 }]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        await driver.Publish(TopicBindingFixture(), [MESSAGE], [SubscriptionBindingFixture({ PartitionMode: 'Ordered' })]);
        expect(source.Calls[0].SQL).toContain('sp_getapplock');
        expect(source.Calls[0].Params[1]).toBe(5000);
    });

    it('stores a message with no matching subscription without inserting deliveries', async () => {
        const source = new RecordingExecutor().QueueRows([INSERTED]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], []);
        expect(result.Status).toBe('Accepted');
        expect(source.Calls).toHaveLength(1);
    });

    it('reads the stored message in a separate statement and rolls back a duplicate', async () => {
        const source = new RecordingExecutor().QueueRows([]).QueueRows([STORED]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], []);
        expect(result).toEqual({ MessageID: MESSAGE.MessageID, Status: 'Duplicate' });
        expect(source.Calls[1].SQL).toContain('SELECT [ID], [TopicID]');
        expect(source.Events).toContain('rollback');
    });

    it('rejects a MessageID already used with a different envelope', async () => {
        const source = new RecordingExecutor().QueueRows([]).QueueRows([{ ...STORED, PartitionKey: 'venue-7' }]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], []);
        expect(result.Error).toMatchObject({ Code: 'MessageIDConflict', Retryable: false });
    });

    it("writes on the caller's executor without managing a transaction", async () => {
        const source = new RecordingExecutor();
        const caller = new RecordingExecutor().QueueRows([INSERTED]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const options: DatabaseTransportPublishOptions = { Kind: 'Database', Executor: caller, UserID: 'U1' };
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], [], options);
        expect(result.Status).toBe('Accepted');
        expect(source.Calls).toHaveLength(0);
        expect(source.Events).toEqual([]);
        expect(caller.Events).toEqual([]);
        expect(caller.Calls[0].Params[7]).toBe('U1');
    });

    it('lets every database error propagate when enlisted, so the caller can retry or roll back', async () => {
        const source = new RecordingExecutor();
        const caller = new RecordingExecutor().QueueError(Object.assign(new Error('Transaction was deadlocked'), { number: 1205 }));
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const options: DatabaseTransportPublishOptions = { Kind: 'Database', Executor: caller };
        await expect(driver.Publish(TopicBindingFixture(), [MESSAGE], [], options)).rejects.toThrow('deadlocked');
    });

    it('turns infrastructure errors into retryable rejections and logs them when it owns the transaction', async () => {
        const source = new RecordingExecutor().QueueError(new Error('connection reset'));
        const deps = TestDeps(source);
        const driver = new DatabaseTransportDriver(source, deps);
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], []);
        expect(result.Error).toEqual({ Code: 'TransportUnavailable', Message: 'connection reset', Retryable: true });
        expect(deps.Log instanceof RecordingLogger && deps.Log.Lines[0]).toContain('ERROR');
    });

    it('retries a deadlocked publish in a fresh transaction', async () => {
        const source = new RecordingExecutor()
            .QueueError(Object.assign(new Error('Transaction was deadlocked'), { number: 1205 }))
            .QueueRows([INSERTED]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const [result] = await driver.Publish(TopicBindingFixture(), [MESSAGE], []);
        expect(result.Status).toBe('Accepted');
        expect(source.Events).toEqual(['independent', 'begin', 'rollback', 'release', 'independent', 'begin', 'commit', 'release']);
    });
});

describe('DatabaseTransportDriver.AcquirePublishOrderLocks', () => {
    const ORDERED = [SubscriptionBindingFixture({ PartitionMode: 'Ordered' })];

    it('takes one lock per distinct key, in sorted key order', async () => {
        const source = new RecordingExecutor();
        const caller = new RecordingExecutor();
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const messages = ['venue-9', 'venue-1', 'venue-9'].map(key => ({ ...MESSAGE, PartitionKey: key }));
        await driver.AcquirePublishOrderLocks(TopicBindingFixture(), messages, ORDERED, caller);
        expect(caller.Calls.map(call => String(call.Params[0]).split(':').pop())).toEqual(['venue-1', 'venue-9']);
    });

    it('sets the PostgreSQL lock timeout once before the first lock', async () => {
        const source = new RecordingExecutor('postgresql');
        const caller = new RecordingExecutor('postgresql');
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        await driver.AcquirePublishOrderLocks(TopicBindingFixture(), [MESSAGE, { ...MESSAGE, PartitionKey: 'a' }], ORDERED, caller);
        expect(caller.Calls).toHaveLength(3);
        expect(caller.Calls[0].SQL).toContain(`set_config('lock_timeout'`);
        expect(caller.Calls[1].SQL).toContain('pg_advisory_xact_lock');
    });

    it('does nothing when no Ordered subscription matches', async () => {
        const source = new RecordingExecutor();
        const caller = new RecordingExecutor();
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        await driver.AcquirePublishOrderLocks(TopicBindingFixture(), [MESSAGE], [SubscriptionBindingFixture({ PartitionMode: 'Exclusive' })], caller);
        expect(caller.Calls).toHaveLength(0);
    });
});

describe('DatabaseTransportDriver surface', () => {
    it('declares the Database capabilities and name', () => {
        const source = new RecordingExecutor();
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        expect(driver.Name).toBe('Database');
        expect(driver.Capabilities).toBe(DATABASE_TRANSPORT_CAPABILITIES);
        expect(DATABASE_TRANSPORT_CAPABILITIES).toMatchObject({ SupportsOrdered: true, SupportsExternalHosts: false, CancelPending: true, CancelInFlight: true, PeekDeadLetters: 'Full' });
        expect(DATABASE_TRANSPORT_CAPABILITIES.Filters.Operators).toEqual(['eq', 'neq', 'startswith', 'isnull', 'isnotnull']);
    });

    it('opens consumers and a cached operator, and closes the operator', async () => {
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 0 }]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        expect(driver.OpenConsumer(SubscriptionBindingFixture())).toBeInstanceOf(DatabaseTransportConsumer);
        expect(driver.Operator()).toBeInstanceOf(DatabaseTransportOperator);
        expect(driver.Operator()).toBe(driver.Operator());
        await driver.Operator().Replay(SubscriptionBindingFixture(), 'EEEEEEEE-0000-0000-0000-000000000001', null, null);
        await driver.Close();
        expect(source.Events).toEqual(['independent', 'release']);
    });

    it('uses the injected instance ID, or host:pid:random by default', () => {
        const source = new RecordingExecutor();
        expect(new DatabaseTransportDriver(source, TestDeps(source)).InstanceID).toBe('test-host:1:abcd');
        expect(DefaultInstanceID()).toMatch(/^.+:\d+:[0-9a-f]{8}$/);
    });

    it('flags missing IDs and external hosts during binding validation', async () => {
        const source = new RecordingExecutor();
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        const external = { ...SubscriptionBindingFixture(), HostType: 'External' as const };
        const issues = await driver.ValidateBindings(TopicBindingFixture({ Config: {} }), [external]);
        expect(issues.map(i => i.Message)).toEqual([
            'Database topic binding is missing Config.TopicID',
            'External hosts cannot consume the Database transport',
        ]);
    });

    it('reports the backlog and the database prerequisites through its operator', async () => {
        const source = new RecordingExecutor().QueueRows([{ Claimable: 2, InFlight: 1 }]).QueueRows([{ SnapshotOn: 1 }]);
        const driver = new DatabaseTransportDriver(source, TestDeps(source));
        expect(await driver.GetBacklog(SubscriptionBindingFixture())).toEqual({ Claimable: 2, InFlight: 1, Capped: false });
        expect(await driver.CheckPrerequisites()).toEqual([]);
    });
});
```

`packages/WorkQueue/engine/src/__tests__/DatabaseTransportConsumer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { ReceivedDelivery, SubscriptionPolicy } from '@memberjunction/work-queue-core';
import { DatabaseTransportConsumer } from '../transports/database/DatabaseTransportConsumer';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';
import { RecordingExecutor, SubscriptionBindingFixture, TestDeps } from './fakes';

const CLAIMED = {
    DeliveryID: 'EEEEEEEE-0000-0000-0000-000000000001', AttemptCount: 1, LeaseToken: 'FFFFFFFF-0000-0000-0000-000000000001',
    LeaseExpiresAt: new Date('2026-01-01T00:01:00Z'), IsReplay: 0, MessageID: 'M1', PartitionKey: 'venue-42',
    Attributes: '{"a":"b"}', Payload: '{"x":1}', PayloadRef: null, CorrelationID: null, PublishedAt: new Date('2026-01-01T00:00:00Z'),
};

function Consumer(source: RecordingExecutor, policy: Partial<SubscriptionPolicy> = {}, events: DeadLetteredEvent[] = []): DatabaseTransportConsumer {
    const deps = { ...TestDeps(source), NotifyDeadLettered: (event: DeadLetteredEvent) => { events.push(event); } };
    return new DatabaseTransportConsumer(source, CreateWorkQueueSqlBuilder(source), SubscriptionBindingFixture(policy), deps, 'host:1:abcd');
}

function Delivery(): ReceivedDelivery {
    return {
        DeliveryID: CLAIMED.DeliveryID, LeaseToken: CLAIMED.LeaseToken, Attempt: 1, IsReplay: false,
        LeaseExpiresAt: new Date(), Message: { MessageID: 'M1', Topic: 'import.ready', PartitionKey: 'venue-42', Attributes: {}, PublishedAt: '2026-01-01T00:00:00.000Z' },
    };
}

describe('DatabaseTransportConsumer executor ownership (03 §11, F8)', () => {
    it('runs every statement on its own independent executor, outside any transaction, and releases it on Close', async () => {
        const source = new RecordingExecutor().QueueRows([]).QueueRows([CLAIMED]).QueueRows([{ AffectedRows: 1 }]);
        const consumer = Consumer(source);
        const [delivery] = await consumer.Receive(5, 0, new AbortController().signal);
        await consumer.Complete(delivery);
        await consumer.Close();
        expect(source.CallsOn('source')).toHaveLength(0);
        expect(source.CallsOn('independent#1')).toHaveLength(3);
        expect(source.Calls.every(call => !call.InTransaction)).toBe(true);
        expect(source.Events).toEqual(['independent', 'release']);
    });
});

describe('DatabaseTransportConsumer.Receive', () => {
    it('expires leases, then claims keyless deliveries for None subscriptions', async () => {
        const source = new RecordingExecutor().QueueRows([]).QueueRows([CLAIMED]);
        const deliveries = await Consumer(source).Receive(5, 20, new AbortController().signal);
        expect(source.Calls[0].SQL).toContain("N'LeaseExpired'");
        expect(source.Calls[1].SQL).toContain('WITH (UPDLOCK, READPAST, ROWLOCK)');
        expect(source.Calls[1].Params).toEqual(['BBBBBBBB-0000-0000-0000-000000000001', 'host:1:abcd', 60, 5]);
        expect(deliveries[0]).toMatchObject({ DeliveryID: CLAIMED.DeliveryID, Attempt: 1, IsReplay: false });
        expect(deliveries[0].Message).toMatchObject({ Topic: 'import.ready', PartitionKey: 'venue-42', Payload: { x: 1 } });
    });

    it('raises a dead-letter event for every row the expire pass dead-lettered, with the reason the statement wrote', async () => {
        const events: DeadLetteredEvent[] = [];
        const source = new RecordingExecutor()
            .QueueRows([{ DeliveryID: 'D9', SubscriptionID: 'S', PartitionKey: 'venue-1', Reason: 'LeaseExpired' }])
            .QueueRows([]);
        await Consumer(source, {}, events).Receive(1, 0, new AbortController().signal);
        expect(events).toEqual([{ SubscriptionName: 'venue-import', DeliveryID: 'D9', Reason: 'LeaseExpired', PartitionKey: 'venue-1' }]);
    });

    it('keeps the first candidate per key, skips a key lost to another worker, then fills with keyless rows', async () => {
        const lost = Object.assign(new Error("Cannot insert duplicate key row with unique index 'UQ_WorkQueueDelivery_InFlightPartition'"), { number: 2601 });
        const source = new RecordingExecutor()
            .QueueRows([])                                                                                  // ExpireLeases
            .QueueRows([{ DeliveryID: 'D1', PartitionKey: 'k1' }, { DeliveryID: 'D1b', PartitionKey: 'k1' }, { DeliveryID: 'D2', PartitionKey: 'k2' }])
            .QueueError(lost)                                                                               // D1: another worker won k1
            .QueueRows([CLAIMED])                                                                           // D2 claimed
            .QueueRows([]);                                                                                 // keyless fill
        const deliveries = await Consumer(source, { PartitionMode: 'Exclusive' }).Receive(2, 0, new AbortController().signal);
        expect(deliveries).toHaveLength(1);
        expect(source.Calls[1].Params).toEqual(['BBBBBBBB-0000-0000-0000-000000000001', 8]);               // max × CANDIDATE_OVERSCAN
        expect(source.Calls[1].SQL).not.toContain('ROW_NUMBER');
        expect(source.Calls.map(call => call.Params[1])).not.toContain('D1b');                              // never two claims for one key
        expect(source.Calls).toHaveLength(5);
        expect(source.Calls[4].Params[3]).toBe(1);
    });

    it('stops claiming candidates once it has enough', async () => {
        const source = new RecordingExecutor()
            .QueueRows([])
            .QueueRows([{ DeliveryID: 'D1', PartitionKey: 'k1' }, { DeliveryID: 'D2', PartitionKey: 'k2' }])
            .QueueRows([CLAIMED]);
        const deliveries = await Consumer(source, { PartitionMode: 'Ordered' }).Receive(1, 0, new AbortController().signal);
        expect(deliveries).toHaveLength(1);
        expect(source.Calls).toHaveLength(3);                                                               // no D2 claim, no keyless fill
    });

    it('rethrows claim errors that are not a lost key', async () => {
        const source = new RecordingExecutor().QueueRows([]).QueueRows([{ DeliveryID: 'D1', PartitionKey: 'k1' }]).QueueError(new Error('connection reset'));
        await expect(Consumer(source, { PartitionMode: 'Ordered' }).Receive(1, 0, new AbortController().signal)).rejects.toThrow('connection reset');
    });

    it('does nothing when already aborted', async () => {
        const source = new RecordingExecutor();
        const controller = new AbortController();
        controller.abort();
        expect(await Consumer(source).Receive(5, 0, controller.signal)).toEqual([]);
        expect(source.Calls).toHaveLength(0);
    });
});

describe('DatabaseTransportConsumer leases', () => {
    it('extends the lease with serialised progress', async () => {
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]);
        expect(await Consumer(source).ExtendLease(Delivery(), 60, { Percent: 40 })).toBe('Held');
        expect(source.Calls[0].Params[3]).toBe('{"Percent":40}');
        expect(source.Calls).toHaveLength(1);
    });

    it('reports Lost when the token no longer holds the delivery', async () => {
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 0 }]).QueueRows([]);
        expect(await Consumer(source).ExtendLease(Delivery(), 60)).toBe('Lost');
    });

    it('reports Cancelled when the delivery is still held but an operator asked it to stop', async () => {
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 0 }]).QueueRows([{ CancelRequested: 1 }]);
        expect(await Consumer(source).ExtendLease(Delivery(), 60)).toBe('Cancelled');
        expect(source.Calls[1].SQL).toContain('AS [CancelRequested]');
    });

    it('lets a transport error propagate, so the runtime retries on the next tick instead of aborting', async () => {
        const source = new RecordingExecutor().QueueError(new Error('connection reset'));
        await expect(Consumer(source).ExtendLease(Delivery(), 60)).rejects.toThrow('connection reset');
    });
});

describe('DatabaseTransportConsumer settles', () => {
    it('completes with one guarded write and no transaction', async () => {
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]);
        expect(await Consumer(source).Complete(Delivery())).toEqual({ Kind: 'Settled', DeliveryID: CLAIMED.DeliveryID, Status: 'Completed' });
        expect(source.Calls[0].SQL).toContain('[CancelRequestedAt] IS NULL');
        expect(source.Events).toEqual(['independent']);
    });

    it('reports LeaseLost when completion matches no row', async () => {
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 0 }]);
        expect(await Consumer(source).Complete(Delivery())).toEqual({ Kind: 'LeaseLost', DeliveryID: CLAIMED.DeliveryID });
    });

    it('acknowledges a cancel as Discarded, and reports LeaseLost when there is nothing to acknowledge', async () => {
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]).QueueRows([{ AffectedRows: 0 }]);
        const consumer = Consumer(source);
        expect(await consumer.AcknowledgeCancel(Delivery())).toEqual({ Kind: 'Settled', DeliveryID: CLAIMED.DeliveryID, Status: 'Discarded' });
        expect(source.Calls[0].SQL).toContain('[CancelRequestedAt] IS NOT NULL');
        expect(await consumer.AcknowledgeCancel(Delivery())).toEqual({ Kind: 'LeaseLost', DeliveryID: CLAIMED.DeliveryID });
    });

    it('maps retry, dead letter and release to their statuses, and raises a dead-letter event', async () => {
        const events: DeadLetteredEvent[] = [];
        const source = new RecordingExecutor().QueueRows([{ AffectedRows: 1 }]).QueueRows([{ AffectedRows: 1 }]).QueueRows([{ AffectedRows: 1 }]);
        const consumer = Consumer(source, {}, events);
        expect(await consumer.Retry(Delivery(), 30, 'boom')).toMatchObject({ Kind: 'Settled', Status: 'Pending' });
        expect(await consumer.DeadLetter(Delivery(), 'Poison', null)).toMatchObject({ Kind: 'Settled', Status: 'DeadLettered' });
        expect(await consumer.Release(Delivery())).toMatchObject({ Kind: 'Settled', Status: 'Pending' });
        expect(events).toEqual([{ SubscriptionName: 'venue-import', DeliveryID: CLAIMED.DeliveryID, Reason: 'Poison', PartitionKey: 'venue-42' }]);
    });

    it('reports infrastructure failures as Failed', async () => {
        const source = new RecordingExecutor().QueueError(new Error('connection reset'));
        expect(await Consumer(source).Retry(Delivery(), 30, 'boom')).toEqual({ Kind: 'Failed', DeliveryID: CLAIMED.DeliveryID, Error: 'connection reset' });
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test deliveryPlan DatabaseTransportDriver DatabaseTransportConsumer`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Write `src/transports/database/databaseCapabilities.ts`**

Append to `packages/WorkQueue/engine/src/constants.ts`:

```typescript
/** Partition candidates fetched per free slot: Exclusive may return several rows of one key, and some keys are lost to other workers. */
export const CANDIDATE_OVERSCAN = 4;
```

`packages/WorkQueue/engine/src/transports/database/databaseCapabilities.ts`:

```typescript
import { WORK_QUEUE_FILTER_SUPPORT } from '@memberjunction/work-queue-core';
import type { TransportCapabilities } from '@memberjunction/work-queue-core';

/** Database transport capabilities (03 §5). */
export const DATABASE_TRANSPORT_CAPABILITIES: TransportCapabilities = {
    // The Database transport evaluates filters in TypeScript, so it accepts the whole queue-wide subset (03 §4.1).
    Filters: WORK_QUEUE_FILTER_SUPPORT,
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
import { CanonicalEnvelope, MatchesFilter } from '@memberjunction/work-queue-core';
import type { PartitionMode, PublishResult, SubscriptionBinding, WorkMessage } from '@memberjunction/work-queue-core';
import { UUIDsEqual } from '@memberjunction/global';
import { Duplicate, Rejected } from '../../publish/publishResults';
import type { DeliveryInsertRow, ExistingMessageRow, MessageInsertRow } from '../../sql/rows';
import { ReadSubscriptionIDs } from './bindingIds';
import { MessageFromColumns } from './rowMapping';

export interface PlannedDelivery {
    SubscriptionID: string;
    PartitionMode: PartitionMode;
}

export interface DeliveryPlan {
    Deliveries: PlannedDelivery[];
    /** A keyed message with a matching Ordered subscription: ordinals must commit in key order (03 §7 "Publish order"). */
    NeedsPublishOrderLock: boolean;
}

export function BuildDeliveryPlan(message: WorkMessage, subscriptions: SubscriptionBinding[]): DeliveryPlan {
    const matched = subscriptions.filter(s => MatchesFilter(s.Filter, message.Attributes));
    const deliveries = matched.map(s => ({ SubscriptionID: ReadSubscriptionIDs(s).SubscriptionID, PartitionMode: s.Policy.PartitionMode }));
    return {
        Deliveries: deliveries,
        NeedsPublishOrderLock: message.PartitionKey !== undefined && deliveries.some(d => d.PartitionMode === 'Ordered'),
    };
}

/** Distinct partition keys that need a publish-order lock, in sorted (code-point) order so every publisher locks alike. */
export function PublishOrderKeys(messages: WorkMessage[], subscriptions: SubscriptionBinding[]): string[] {
    const keys = new Set<string>();
    for (const message of messages) {
        if (message.PartitionKey !== undefined && BuildDeliveryPlan(message, subscriptions).NeedsPublishOrderLock) {
            keys.add(message.PartitionKey);
        }
    }
    return [...keys].sort();
}

/** PublishedAt is not part of the row: the database clock supplies it (03 §6.4). */
export function ToMessageInsertRow(message: WorkMessage, topicID: string, userID: string | null): MessageInsertRow {
    return {
        ID: message.MessageID,
        TopicID: topicID,
        PartitionKey: message.PartitionKey ?? null,
        AttributesJSON: JSON.stringify(message.Attributes),
        PayloadJSON: message.Payload === undefined ? null : JSON.stringify(message.Payload),
        PayloadRefJSON: message.PayloadRef === undefined ? null : JSON.stringify(message.PayloadRef),
        CorrelationID: message.CorrelationID ?? null,
        PublishedByUserID: userID,
    };
}

export function ToDeliveryRows(message: WorkMessage, plan: DeliveryPlan, publishOrdinal: number): DeliveryInsertRow[] {
    return plan.Deliveries.map(d => ({
        MessageID: message.MessageID,
        SubscriptionID: d.SubscriptionID,
        PartitionKey: d.PartitionMode === 'None' ? null : message.PartitionKey ?? null,
        OrderKey: publishOrdinal,
    }));
}

/**
 * A message with this MessageID is already stored (03 §2.1, F10 — MessageID is globally unique). Same topic and same
 * canonical envelope → Duplicate; anything else → MessageIDConflict. `existing` is undefined when the conflicting row
 * was not visible to the follow-up read (purged in between): the caller retries.
 */
export function ResolveExistingMessage(existing: ExistingMessageRow | undefined, message: WorkMessage, topicID: string): PublishResult {
    if (!existing) {
        return Rejected(message.MessageID, 'TransportUnavailable', 'The message insert found a conflicting MessageID that is no longer visible; retry', true);
    }
    const stored = MessageFromColumns({
        MessageID: existing.ID, PartitionKey: existing.PartitionKey, Attributes: existing.Attributes, Payload: existing.Payload,
        PayloadRef: existing.PayloadRef, CorrelationID: existing.CorrelationID, PublishedAt: new Date(0),
    }, message.Topic);
    const same = UUIDsEqual(existing.TopicID, topicID) && CanonicalEnvelope(stored) === CanonicalEnvelope(message);
    return same
        ? Duplicate(message.MessageID)
        : Rejected(message.MessageID, 'MessageIDConflict', `MessageID ${message.MessageID} was already published with a different envelope or topic`, false);
}
```

- [ ] **Step 6: Write `src/transports/database/DatabaseTransportConsumer.ts`**

```typescript
import type {
    DeliveryStatus, ITransportConsumer, LeaseExtension, ReceivedDelivery, SettleResult, SubscriptionBinding, WorkJson, WorkProgress,
} from '@memberjunction/work-queue-core';
import { CANDIDATE_OVERSCAN, IN_FLIGHT_PARTITION_INDEX } from '../../constants';
import type { ClaimedDeliveryRow, ClaimPartitionMode, ExpiredDeadLetterRow, LeaseStateRow, PartitionCandidateRow } from '../../sql/rows';
import { ErrorText, ExecuteRows, ExecuteWrite, IsUniqueViolation, ToBoolean, ToNumber } from '../../sql/sqlExecution';
import type { WorkQueueSqlBuilder } from '../../sql/WorkQueueSqlBuilder';
import type { SqlStatement, WorkQueueExecutorSource } from '../../sql/WorkQueueSqlExecutor';
import { OwnedExecutor } from '../OwnedExecutor';
import type { TransportDriverDeps } from '../TransportDriverDeps';
import { ReadSubscriptionIDs } from './bindingIds';
import type { DatabaseSubscriptionIDs } from './bindingIds';
import { MessageFromColumns, SerializeProgress } from './rowMapping';

export class DatabaseTransportConsumer<TPayload extends WorkJson = WorkJson> implements ITransportConsumer<TPayload> {
    private readonly ids: DatabaseSubscriptionIDs;
    private readonly owned: OwnedExecutor;

    constructor(
        source: WorkQueueExecutorSource,
        private readonly sql: WorkQueueSqlBuilder,
        private readonly binding: SubscriptionBinding,
        private readonly deps: TransportDriverDeps,
        private readonly leaseOwner: string,
    ) {
        this.ids = ReadSubscriptionIDs(binding);
        this.owned = new OwnedExecutor(source);
    }

    /** One claim cycle. The Database consumer never long-polls, so waitSeconds is ignored. */
    public async Receive(max: number, _waitSeconds: number, signal: AbortSignal): Promise<ReceivedDelivery<TPayload>[]> {
        if (signal.aborted || max <= 0) {
            return [];
        }
        const policy = this.binding.Policy;
        await this.ExpireLeases();
        const claimed: ClaimedDeliveryRow[] = policy.PartitionMode === 'None' ? [] : await this.ClaimPartitioned(max, signal);
        if (claimed.length < max && !signal.aborted) {
            const keyless = await this.Rows<ClaimedDeliveryRow>(
                this.sql.Consume.ClaimUnpartitioned(this.ids.SubscriptionID, this.leaseOwner, policy.LeaseSeconds, max - claimed.length));
            claimed.push(...keyless);
        }
        return claimed.map(row => this.ToDelivery(row));
    }

    /** 'Held' | 'Lost' | 'Cancelled' (03 §7). A thrown error is transient: the runtime retries on its next tick. */
    public async ExtendLease(delivery: ReceivedDelivery<TPayload>, leaseSeconds: number, progress?: WorkProgress): Promise<LeaseExtension> {
        const progressJSON = progress === undefined ? null : SerializeProgress(progress);
        const count = await this.Write(this.sql.Consume.ExtendLease(delivery.DeliveryID, delivery.LeaseToken, leaseSeconds, progressJSON));
        if (count === 1) {
            return 'Held';
        }
        const state = await this.Rows<LeaseStateRow>(this.sql.Consume.SelectLeaseState(delivery.DeliveryID, delivery.LeaseToken));
        return state.length > 0 && ToBoolean(state[0].CancelRequested) ? 'Cancelled' : 'Lost';
    }

    public Complete(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.SettleWrite(delivery, 'Completed', this.sql.Consume.CompleteDelivery(delivery.DeliveryID, delivery.LeaseToken));
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

    /** The cancelled delivery becomes Discarded now, freeing its key; anything else is LeaseLost with no change (03 §5). */
    public AcknowledgeCancel(delivery: ReceivedDelivery<TPayload>): Promise<SettleResult> {
        return this.SettleWrite(delivery, 'Discarded', this.sql.Consume.AcknowledgeCancel(delivery.DeliveryID, delivery.LeaseToken));
    }

    /** Releases the consumer's independent executor (03 §11). */
    public Close(): Promise<void> {
        return this.owned.Release();
    }

    private async ExpireLeases(): Promise<void> {
        const policy = this.binding.Policy;
        const expired = await this.Rows<ExpiredDeadLetterRow>(this.sql.Consume.ExpireLeases(this.ids.SubscriptionID, policy.MaxAttempts));
        for (const row of expired) {
            this.deps.NotifyDeadLettered?.({
                SubscriptionName: policy.SubscriptionName, DeliveryID: row.DeliveryID, Reason: row.Reason, PartitionKey: row.PartitionKey,
            });
        }
    }

    private async ClaimPartitioned(max: number, signal: AbortSignal): Promise<ClaimedDeliveryRow[]> {
        const mode: ClaimPartitionMode = this.binding.Policy.PartitionMode === 'Ordered' ? 'Ordered' : 'Exclusive';
        const candidates = await this.Rows<PartitionCandidateRow>(
            this.sql.Consume.SelectPartitionCandidates(this.ids.SubscriptionID, mode, max * CANDIDATE_OVERSCAN));
        const claimed: ClaimedDeliveryRow[] = [];
        for (const candidate of FirstPerKey(candidates)) {
            if (claimed.length >= max || signal.aborted) {
                break;
            }
            const row = await this.TryClaimCandidate(candidate, mode);
            if (row) {
                claimed.push(row);
            }
        }
        return claimed;
    }

    /** A unique violation on the in-flight index means another worker won this key: skip the candidate, keep the batch. */
    private async TryClaimCandidate(candidate: PartitionCandidateRow, mode: ClaimPartitionMode): Promise<ClaimedDeliveryRow | null> {
        try {
            const rows = await this.Rows<ClaimedDeliveryRow>(
                this.sql.Consume.ClaimPartitionCandidate(this.ids.SubscriptionID, candidate.DeliveryID, mode, this.leaseOwner, this.binding.Policy.LeaseSeconds));
            return rows[0] ?? null;
        } catch (error) {
            if (IsUniqueViolation(error, IN_FLIGHT_PARTITION_INDEX)) {
                return null;
            }
            throw error;
        }
    }

    private async SettleWrite(delivery: ReceivedDelivery<TPayload>, status: DeliveryStatus, statement: SqlStatement): Promise<SettleResult> {
        try {
            const count = await this.Write(statement);
            return count === 1
                ? { Kind: 'Settled', DeliveryID: delivery.DeliveryID, Status: status }
                : { Kind: 'LeaseLost', DeliveryID: delivery.DeliveryID };
        } catch (error) {
            return { Kind: 'Failed', DeliveryID: delivery.DeliveryID, Error: ErrorText(error) };
        }
    }

    private async Rows<T>(statement: SqlStatement): Promise<T[]> {
        return ExecuteRows<T>(await this.owned.Get(), statement, this.deps.ContextUser);
    }

    private async Write(statement: SqlStatement): Promise<number> {
        return ExecuteWrite(await this.owned.Get(), statement, this.deps.ContextUser);
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

/** 03 §7: at most one row per partition key within one claim batch. Candidates arrive oldest first. */
function FirstPerKey(candidates: PartitionCandidateRow[]): PartitionCandidateRow[] {
    const seen = new Set<string>();
    return candidates.filter(candidate => {
        if (seen.has(candidate.PartitionKey)) {
            return false;
        }
        seen.add(candidate.PartitionKey);
        return true;
    });
}
```

- [ ] **Step 7: Write `src/transports/database/DatabaseTransportDriver.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { DATABASE_DRIVER_CLASS } from '@memberjunction/work-queue-base';
import type {
    BindingValidationIssue, DatabasePublishOptions, ITransportConsumer, ITransportDriver, ITransportOperator,
    PublishResult, SubscriptionBinding, TopicBinding, TransportCapabilities, WorkJson, WorkMessage,
} from '@memberjunction/work-queue-core';
import { DELIVERY_INSERT_CHUNK, MESSAGE_PRIMARY_KEY, PUBLISH_LOCK_TIMEOUT_MS } from '../../constants';
import { Accepted, Rejected } from '../../publish/publishResults';
import { CreateWorkQueueSqlBuilder } from '../../sql/CreateWorkQueueSqlBuilder';
import type { ExistingMessageRow, MessageInsertedRow } from '../../sql/rows';
import { ErrorText, ExecuteRows, ExecuteWrite, IsUniqueViolation, ToNumber } from '../../sql/sqlExecution';
import type { WorkQueueSqlBuilder } from '../../sql/WorkQueueSqlBuilder';
import type { WorkQueueExecutorSource, WorkQueueTransactionalExecutor } from '../../sql/WorkQueueSqlExecutor';
import { RetryTransient, RunInWorkQueueTransaction } from '../../transaction/RunInWorkQueueTransaction';
import type { TransportDriverDeps } from '../TransportDriverDeps';
import { ReadTopicID } from './bindingIds';
import { DATABASE_TRANSPORT_CAPABILITIES } from './databaseCapabilities';
import { DatabaseTransportConsumer } from './DatabaseTransportConsumer';
import { DatabaseTransportOperator } from './DatabaseTransportOperator';
import type { DeliveryPlan } from './deliveryPlan';
import { BuildDeliveryPlan, PublishOrderKeys, ResolveExistingMessage, ToDeliveryRows, ToMessageInsertRow } from './deliveryPlan';

/** Database-specific publish options (03 §11): enlist in the caller's transaction and stamp the publisher. */
export interface DatabaseTransportPublishOptions extends DatabasePublishOptions {
    Kind: 'Database';
    Executor?: WorkQueueTransactionalExecutor;
    UserID?: string;
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

    constructor(private readonly source: WorkQueueExecutorSource, private readonly deps: TransportDriverDeps) {
        this.sql = CreateWorkQueueSqlBuilder(source);
        this.instanceID = deps.InstanceID ?? DefaultInstanceID();
    }

    public get InstanceID(): string {
        return this.instanceID;
    }

    public async Publish(topic: TopicBinding, messages: WorkMessage[], subscriptions: SubscriptionBinding[],
                         opts?: DatabasePublishOptions): Promise<PublishResult[]> {
        const topicID = ReadTopicID(topic);
        const options = IsDatabaseTransportPublishOptions(opts) ? opts : null;
        if (options?.Executor) {
            // One caller transaction for the whole batch: take every lock up front, in sorted key order (03 §7).
            await this.AcquirePublishOrderLocks(topic, messages, subscriptions, options.Executor);
        }
        const results: PublishResult[] = [];
        for (const message of messages) {
            results.push(await this.PublishOne(topic, topicID, message, subscriptions, options));
        }
        return results;
    }

    /**
     * Takes the publish-order locks a batch needs, in sorted key order, inside the caller's transaction. Two callers
     * publishing the same keys in opposite orders therefore wait for each other instead of deadlocking. Re-acquiring a
     * lock the transaction already holds is a no-op on both platforms, so `WriteMessage` may ask again.
     */
    public async AcquirePublishOrderLocks(topic: TopicBinding, messages: WorkMessage[], subscriptions: SubscriptionBinding[],
                                          executor: WorkQueueTransactionalExecutor): Promise<void> {
        const keys = PublishOrderKeys(messages, subscriptions);
        if (keys.length === 0) {
            return;
        }
        const topicID = ReadTopicID(topic);
        const prepare = this.sql.Publish.PreparePublishOrderLock(PUBLISH_LOCK_TIMEOUT_MS);
        if (prepare) {
            await ExecuteRows<{ LockTimeout: string }>(executor, prepare, this.deps.ContextUser);
        }
        for (const key of keys) {
            await ExecuteRows<{ LockResult: number }>(
                executor, this.sql.Publish.AcquirePublishOrderLock(topicID, key, PUBLISH_LOCK_TIMEOUT_MS), this.deps.ContextUser);
        }
    }

    public OpenConsumer<TPayload extends WorkJson>(subscription: SubscriptionBinding): ITransportConsumer<TPayload> {
        return new DatabaseTransportConsumer<TPayload>(this.source, this.sql, subscription, this.deps, this.instanceID);
    }

    public Operator(): ITransportOperator {
        return this.DatabaseOperator();
    }

    public GetBacklog(subscription: SubscriptionBinding): Promise<{ Claimable: number; InFlight: number; Capped: boolean }> {
        return this.DatabaseOperator().GetBacklog(subscription);
    }

    /** Database prerequisites (READ_COMMITTED_SNAPSHOT on SQL Server), reported once per transport by ValidateTopology. */
    public CheckPrerequisites(): Promise<BindingValidationIssue[]> {
        return this.DatabaseOperator().CheckPrerequisites();
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

    /** Releases the operator's independent executor. Consumers are closed by the runtime that opened them. */
    public async Close(): Promise<void> {
        const operator = this.operator;
        this.operator = null;
        await operator?.Close();
    }

    private DatabaseOperator(): DatabaseTransportOperator {
        this.operator ??= new DatabaseTransportOperator(this.source, this.deps);
        return this.operator;
    }

    private async PublishOne(topic: TopicBinding, topicID: string, message: WorkMessage, subscriptions: SubscriptionBinding[],
                             options: DatabaseTransportPublishOptions | null): Promise<PublishResult> {
        const plan = BuildDeliveryPlan(message, subscriptions);
        const userID = options?.UserID ?? null;
        if (options?.Executor) {
            // Enlisted: the caller owns the transaction, so every database error is the caller's to see (03 §11).
            return this.WriteMessage(options.Executor, topicID, message, plan, userID);
        }
        try {
            return await RetryTransient(() => RunInWorkQueueTransaction(this.source, async tx => {
                const result = await this.WriteMessage(tx, topicID, message, plan, userID);
                return { Commit: result.Status === 'Accepted', Value: result };
            }));
        } catch (error) {
            this.deps.Log.Error(`Publish of message ${message.MessageID} to '${topic.TopicName}' failed`, error instanceof Error ? error : undefined);
            return Rejected(message.MessageID, 'TransportUnavailable', ErrorText(error), true);
        }
    }

    private async WriteMessage(executor: WorkQueueTransactionalExecutor, topicID: string, message: WorkMessage,
                               plan: DeliveryPlan, userID: string | null): Promise<PublishResult> {
        const user = this.deps.ContextUser;
        if (plan.NeedsPublishOrderLock && message.PartitionKey !== undefined) {
            await this.LockKey(executor, topicID, message.PartitionKey);
        }
        const inserted = await this.InsertMessage(executor, ToMessageInsertRow(message, topicID, userID));
        if (!inserted) {
            const existing = await ExecuteRows<ExistingMessageRow>(executor, this.sql.Publish.SelectMessage(message.MessageID), user);
            return ResolveExistingMessage(existing[0], message, topicID);
        }
        const publishOrdinal = ToNumber(inserted.PublishOrdinal);
        if (publishOrdinal === null) {
            throw new Error(`Message ${message.MessageID} was inserted without a PublishOrdinal`);
        }
        const rows = ToDeliveryRows(message, plan, publishOrdinal);
        for (let start = 0; start < rows.length; start += DELIVERY_INSERT_CHUNK) {
            await ExecuteWrite(executor, this.sql.Publish.InsertDeliveries(rows.slice(start, start + DELIVERY_INSERT_CHUNK)), user);
        }
        return Accepted(message.MessageID);
    }

    private async LockKey(executor: WorkQueueTransactionalExecutor, topicID: string, partitionKey: string): Promise<void> {
        const prepare = this.sql.Publish.PreparePublishOrderLock(PUBLISH_LOCK_TIMEOUT_MS);
        if (prepare) {
            await ExecuteRows<{ LockTimeout: string }>(executor, prepare, this.deps.ContextUser);
        }
        await ExecuteRows<{ LockResult: number }>(
            executor, this.sql.Publish.AcquirePublishOrderLock(topicID, partitionKey, PUBLISH_LOCK_TIMEOUT_MS), this.deps.ContextUser);
    }

    /** Undefined means "a message with this ID already exists": the statement inserted nothing, or the primary key raced. */
    private async InsertMessage(executor: WorkQueueTransactionalExecutor, row: ReturnType<typeof ToMessageInsertRow>): Promise<MessageInsertedRow | undefined> {
        try {
            const rows = await ExecuteRows<MessageInsertedRow>(executor, this.sql.Publish.InsertMessage(row), this.deps.ContextUser);
            return rows[0];
        } catch (error) {
            if (IsUniqueViolation(error, MESSAGE_PRIMARY_KEY)) {
                return undefined;
            }
            throw error;
        }
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
Expected: PASS — previous suites plus deliveryPlan (9), DatabaseTransportDriver (17), DatabaseTransportConsumer (16).

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
- Modify (**base**): `packages/WorkQueue/base/src/index.ts`, `src/testing/index.ts`
- Test (**base**): `packages/WorkQueue/base/src/__tests__/entityValidation.test.ts`
- Create (**engine**): `packages/WorkQueue/engine/src/transports/BaseTransportDriverFactory.ts`, `src/transports/database/DatabaseTransportDriverFactory.ts`
- Create (**engine**): `packages/WorkQueue/engine/src/logging/MJWorkLogger.ts`
- Create (**engine**): `packages/WorkQueue/engine/src/entities/WorkQueueTopicEntityServer.ts`, `src/entities/WorkQueueSubscriptionEntityServer.ts`, `src/entities/WorkQueueTransportEntityServer.ts`, `src/entities/DriverOwnedEntityServers.ts`, `src/entities/partitionModeChange.ts`
- Modify (**engine**): `packages/WorkQueue/engine/src/index.ts`
- Test (**engine**): `packages/WorkQueue/engine/src/__tests__/DatabaseTransportDriverFactory.test.ts`, `src/__tests__/entityServers.test.ts`

Engine suites import the row fixtures **directly** from `@memberjunction/work-queue-base/testing` — `fakes.ts` does not re-export them (no cross-package re-exports, `.claude/rules/typescript-style.md`).

**Interfaces:**
- Consumes: `DatabaseTransportDriver` (Task 9); `TransportDriverDeps` (Task 8); `WorkQueueEntityNames`, `DATABASE_DRIVER_CLASS`, `IsWorkJson` (Task 2, base); from core: `ITransportDriver`, `WorkLogger`, `WorkJson`, `PartitionMode`, `HeartbeatMode`, `HostType`, `ParseSubscriptionFilter`, `WORK_QUEUE_FILTER_SUPPORT`, `WorkQueueConfigurationError`; generated `MJWorkQueueTopicEntity`, `MJWorkQueueSubscriptionEntity`, `MJWorkQueueTransportEntity` (Task 1).
- Produces (base — `@memberjunction/work-queue-base`):
  - `interface TransportRow`, `interface TopicRow`, `interface SubscriptionRow` — structural views the generated entities satisfy
  - `interface FieldIssue { Field: string; Message: string; Value: string | number | null }`, `ParseJsonObject(json: string | null, subject: string): Record<string, WorkJson>`, `ValidateTransportFields(row: TransportRow): FieldIssue[]`, `ValidateTopicFields(row: TopicRow): FieldIssue[]`, `ValidateSubscriptionFields(row: SubscriptionRow): FieldIssue[]`
- Produces (base — `@memberjunction/work-queue-base/testing`, **not** the production index): row fixtures `TRANSPORT_ROW_FIXTURE`, `TOPIC_ROW_FIXTURE`, `SUBSCRIPTION_ROW_FIXTURE`
- Produces (engine):
  - `abstract class BaseTransportDriverFactory { abstract Create(transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver> }`
  - `@RegisterClass(BaseTransportDriverFactory, 'Database') class DatabaseTransportDriverFactory`
  - `class MJWorkLogger implements WorkLogger { constructor(prefix?: string) }`
  - Server entity subclasses `MJWorkQueueTransportEntityServer`, `MJWorkQueueTopicEntityServer`, `MJWorkQueueSubscriptionEntityServer` registered under the Task 1 entity names
  - `interface PartitionModeChange { IsSaved: boolean; Changed: boolean; OldValue: string | null; NewValue: string }`, `CheckPartitionModeChange(change: PartitionModeChange, hasDeliveries: () => Promise<boolean>): Promise<FieldIssue | null>` (F11)
  - Driver-owned state guards `MJWorkQueueDeliveryEntityServer`, `MJWorkQueueMessageEntityServer`, `MJWorkQueueDeduplicationEntityServer` plus `DRIVER_OWNED_STATE_MESSAGE` and `RefuseDriverOwnedWrite(entity, type): boolean` (03 §6.8)

Validation performed on save (everything that needs a transport driver — FIFO rules, host/transport compatibility — is `WorkQueueEngine.ValidateTopology` in Task 12):

| Entity | Rule |
| --- | --- |
| Transport | `Configuration`, when present, is a JSON object |
| Topic | `Name` matches `^[a-z0-9]+([._-][a-z0-9]+)*$`; `BindingConfig`, when present, is a JSON object |
| Subscription | `MJWorker` requires a non-blank `HandlerKey`; `Filter` parses against the queue-wide subset `WORK_QUEUE_FILTER_SUPPORT` (03 §4 — the *transport-specific* check is `ValidateTopologyRows`, Task 11); `BackoffMaxSeconds >= BackoffBaseSeconds`; `MaxProcessingSeconds` is positive when set; `BindingConfig`, when present, is a JSON object; **`PartitionMode` cannot change once the subscription has deliveries** (F11 — checked in `ValidateAsync`, server only) |

- [ ] **Step 1: Write the shared row fixtures in the base package**

`packages/WorkQueue/base/src/testing/rowFixtures.ts` — both packages' suites and plan 06 use these, so they ship, but
**only** through the `./testing` subpath (Task 2), never the production index:

```typescript
import type { SubscriptionRow, TopicRow, TransportRow } from '../topology/rows';

export const TRANSPORT_ROW_FIXTURE: TransportRow = {
    ID: 'D1ED3F08-7008-4DA8-BA2B-7CD6A820AEB5', Name: 'Database', DriverClass: 'Database', Configuration: null, CredentialID: null, Status: 'Active',
};

export const TOPIC_ROW_FIXTURE: TopicRow = {
    ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'import.ready', TransportID: TRANSPORT_ROW_FIXTURE.ID,
    IsFifo: false, AllowExternalPublish: false, MaxPayloadBytes: 262144, DefaultDeduplicationTTLSeconds: 86400, RetentionDays: 7,
    BindingConfig: null, Status: 'Active',
};

export const SUBSCRIPTION_ROW_FIXTURE: SubscriptionRow = {
    ID: 'BBBBBBBB-0000-0000-0000-000000000001', TopicID: TOPIC_ROW_FIXTURE.ID, Name: 'venue-import', Filter: null, PartitionMode: 'Ordered',
    MaxAttempts: 5, BackoffBaseSeconds: 10, BackoffMaxSeconds: 900, LeaseSeconds: 60, HeartbeatMode: 'Auto', MaxProcessingSeconds: null,
    HostType: 'MJWorker', HandlerKey: 'VenueImport', ExternalRef: null, BindingConfig: null, Status: 'Active',
};
```

Replace the placeholder body of `packages/WorkQueue/base/src/testing/index.ts` (Task 2) with:

```typescript
export * from './rowFixtures';
```

Engine suites import them by their real names:

```typescript
import { SUBSCRIPTION_ROW_FIXTURE, TOPIC_ROW_FIXTURE, TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
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
            ...SUBSCRIPTION_ROW, BackoffBaseSeconds: 60, BackoffMaxSeconds: 10, MaxProcessingSeconds: 0,
        }).map(i => i.Field);
        expect(fields).toEqual(['BackoffMaxSeconds', 'MaxProcessingSeconds']);
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
import { TRANSPORT_ROW_FIXTURE } from '@memberjunction/work-queue-base/testing';
import { RecordingExecutor, TestDeps } from './fakes';

describe('DatabaseTransportDriverFactory', () => {
    it('is registered under the Database driver class', () => {
        const resolution = MJGlobal.Instance.ClassFactory.TryCreateInstance<BaseTransportDriverFactory>(BaseTransportDriverFactory, 'Database');
        expect(resolution.Resolved).toBe(true);
        expect(resolution.Instance).toBeInstanceOf(DatabaseTransportDriverFactory);
    });

    it('builds a Database driver from the deps executor', async () => {
        const executor = new RecordingExecutor();
        const driver = await new DatabaseTransportDriverFactory().Create(TRANSPORT_ROW_FIXTURE, TestDeps(executor));
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

`packages/WorkQueue/engine/src/__tests__/entityServers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { BaseEntity, EntityInfo } from '@memberjunction/core';
import { WorkQueueEntityNames } from '@memberjunction/work-queue-base';
import { CheckPartitionModeChange } from '../entities/partitionModeChange';
import {
    DRIVER_OWNED_STATE_MESSAGE, MJWorkQueueDeduplicationEntityServer, MJWorkQueueDeliveryEntityServer, MJWorkQueueMessageEntityServer,
} from '../entities/DriverOwnedEntityServers';

/**
 * The smallest EntityInfo BaseEntity's constructor accepts: a name, an Active status and no fields. The guards never
 * read a field, so nothing else is needed — and no metadata provider or database is involved.
 */
function StubEntityInfo(name: string): EntityInfo {
    return new EntityInfo({ ID: '00000000-0000-0000-0000-000000000001', Name: name, Status: 'Active', EntityFields: [] });
}

describe('driver-owned state guards', () => {
    const guards = [
        { Build: () => new MJWorkQueueDeliveryEntityServer(StubEntityInfo(WorkQueueEntityNames.Deliveries)), Name: 'Delivery' },
        { Build: () => new MJWorkQueueMessageEntityServer(StubEntityInfo(WorkQueueEntityNames.Messages)), Name: 'Message' },
        { Build: () => new MJWorkQueueDeduplicationEntityServer(StubEntityInfo(WorkQueueEntityNames.Deduplications)), Name: 'Deduplication' },
    ];

    it.each(guards)('$Name refuses Save and Delete and reports why', async ({ Build }) => {
        const entity: BaseEntity = Build();
        expect(await entity.Save()).toBe(false);
        expect(entity.LatestResult?.Message).toBe(DRIVER_OWNED_STATE_MESSAGE);
        expect(entity.LatestResult?.Type).toBe('create');
        expect(await entity.Delete()).toBe(false);
        expect(entity.LatestResult?.Type).toBe('delete');
    });

    it('names the operator actions that exist', () => {
        expect(DRIVER_OWNED_STATE_MESSAGE).toContain('Replay / Discard');
    });
});

describe('CheckPartitionModeChange (F11)', () => {
    const changed = { IsSaved: true, Changed: true, OldValue: 'None', NewValue: 'Ordered' };

    it('rejects a change once the subscription has deliveries', async () => {
        const issue = await CheckPartitionModeChange(changed, async () => true);
        expect(issue).toEqual({
            Field: 'PartitionMode',
            Message: "PartitionMode cannot change from 'None' to 'Ordered' once the subscription has deliveries; create a new subscription instead",
            Value: 'Ordered',
        });
    });

    it('allows the change while the subscription has no deliveries', async () => {
        expect(await CheckPartitionModeChange(changed, async () => false)).toBeNull();
    });

    it('never queries for new records or unchanged modes', async () => {
        let asked = 0;
        const probe = async () => { asked++; return true; };
        expect(await CheckPartitionModeChange({ ...changed, IsSaved: false }, probe)).toBeNull();
        expect(await CheckPartitionModeChange({ ...changed, Changed: false }, probe)).toBeNull();
        expect(asked).toBe(0);
    });
});
```

If `EntityInfo`'s constructor rejects the stub on the branch you build against, add only the init fields it names —
never replace the stub with a live metadata provider, and never loosen a guard to make the test pass.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/base && pnpm test entityValidation` and `cd packages/WorkQueue/engine && pnpm test DatabaseTransportDriverFactory entityServers`
Expected: FAIL — unresolved imports `../entities/validation` and `../topology/rows` (base), `../transports/BaseTransportDriverFactory` (engine).

- [ ] **Step 3: Write `packages/WorkQueue/base/src/topology/rows.ts`**

```typescript
import type { HeartbeatMode, HostType, PartitionMode } from '@memberjunction/work-queue-core';

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
import { DATABASE_DRIVER_CLASS } from '@memberjunction/work-queue-base';
import type { TransportRow } from '@memberjunction/work-queue-base';
import { BaseTransportDriverFactory } from '../BaseTransportDriverFactory';
import type { TransportDriverDeps } from '../TransportDriverDeps';
import { DatabaseTransportDriver } from './DatabaseTransportDriver';

@RegisterClass(BaseTransportDriverFactory, DATABASE_DRIVER_CLASS)
export class DatabaseTransportDriverFactory extends BaseTransportDriverFactory {
    /** The Database transport has no per-transport configuration: the row only selects this factory. */
    public async Create(_transport: TransportRow, deps: TransportDriverDeps): Promise<ITransportDriver> {
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
    issues.push(...JsonObjectIssue('BindingConfig', row.BindingConfig, `Subscription ${row.Name} BindingConfig`));
    return issues;
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
import { BaseEntity, RunView, ValidationErrorInfo, ValidationErrorType } from '@memberjunction/core';
import type { ValidationResult } from '@memberjunction/core';
import { MJWorkQueueSubscriptionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { ValidateSubscriptionFields, WorkQueueEntityNames } from '@memberjunction/work-queue-base';
import { CheckPartitionModeChange } from './partitionModeChange';

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

    /** F11: PartitionMode is immutable once deliveries exist. Needs a read, so it lives in the async validation pass. */
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        const field = this.GetFieldByName('PartitionMode');
        const issue = await CheckPartitionModeChange(
            { IsSaved: this.IsSaved, Changed: field?.Dirty ?? false, OldValue: field ? String(field.OldValue ?? '') : null, NewValue: this.PartitionMode },
            () => this.HasDeliveries(),
        );
        if (issue) {
            result.Errors.push(new ValidationErrorInfo(issue.Field, issue.Message, issue.Value, ValidationErrorType.Failure));
            result.Success = false;
        }
        return result;
    }

    private async HasDeliveries(): Promise<boolean> {
        const view = await new RunView(this.RunViewProviderToUse).RunView<{ ID: string }>({
            EntityName: WorkQueueEntityNames.Deliveries,
            ExtraFilter: `SubscriptionID = '${this.ID}'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
        }, this.ContextCurrentUser);
        if (!view.Success) {
            throw new Error(`Could not check deliveries of subscription ${this.Name}: ${view.ErrorMessage}`);
        }
        return view.Results.length > 0;
    }
}
```

`src/entities/partitionModeChange.ts` (pure, so it is unit-tested without a database):

```typescript
import type { FieldIssue } from '@memberjunction/work-queue-base';

export interface PartitionModeChange {
    IsSaved: boolean;
    Changed: boolean;
    OldValue: string | null;
    NewValue: string;
}

/**
 * F11 (03 §3.1): Delivery.PartitionKey is populated only for partitioned subscriptions, so changing the mode under
 * existing deliveries would leave them inconsistent. New records and unchanged modes never reach the database.
 */
export async function CheckPartitionModeChange(change: PartitionModeChange, hasDeliveries: () => Promise<boolean>): Promise<FieldIssue | null> {
    if (!change.IsSaved || !change.Changed || !(await hasDeliveries())) {
        return null;
    }
    return {
        Field: 'PartitionMode',
        Message: `PartitionMode cannot change from '${change.OldValue}' to '${change.NewValue}' once the subscription has deliveries; create a new subscription instead`,
        Value: change.NewValue,
    };
}
```

`src/entities/WorkQueueTopicEntityServer.ts`:

```typescript
import { BaseEntity, ValidationErrorInfo, ValidationErrorType } from '@memberjunction/core';
import type { ValidationResult } from '@memberjunction/core';
import { MJWorkQueueTopicEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { ValidateTopicFields, WorkQueueEntityNames } from '@memberjunction/work-queue-base';

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
import { ValidateTransportFields, WorkQueueEntityNames } from '@memberjunction/work-queue-base';

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

Messages, Deliveries and Deduplications are written **only** by guarded driver SQL (03 §6.8). Task 1
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
import { MJWorkQueueDeduplicationEntity, MJWorkQueueDeliveryEntity, MJWorkQueueMessageEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { WorkQueueEntityNames } from '@memberjunction/work-queue-base';

export const DRIVER_OWNED_STATE_MESSAGE =
    'work-queue delivery state is managed by the transport driver; use the operator API (Replay / Discard)';

/** Records the refusal on the entity's result history so callers see it through LatestResult.CompleteMessage. */
export function RefuseDriverOwnedWrite(entity: BaseEntity, type: 'create' | 'update' | 'delete'): boolean {
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


The guards are exercised by `entityServers.test.ts` (Step 1b) against a stub `EntityInfo`.

- [ ] **Step 9: Export the new modules**

Append to `packages/WorkQueue/base/src/index.ts`:

```typescript
export * from './topology/rows';
export * from './entities/validation';
```

The fixtures stay out of this index; they are reachable only as `@memberjunction/work-queue-base/testing`.

Append to `packages/WorkQueue/engine/src/index.ts`. The engine re-exports **nothing** from the base package: server-side
consumers (plans 06–08) import row types and validators from `@memberjunction/work-queue-base` directly, and the
`engineEntryGuard` test (Task 2) fails the build if a re-export appears.

```typescript
export * from './transports/BaseTransportDriverFactory';
export * from './transports/database/DatabaseTransportDriverFactory';
export * from './logging/MJWorkLogger';
export * from './entities/WorkQueueTransportEntityServer';
export * from './entities/WorkQueueTopicEntityServer';
export * from './entities/WorkQueueSubscriptionEntityServer';
export * from './entities/DriverOwnedEntityServers';
export * from './entities/partitionModeChange';
```

- [ ] **Step 10: Run the tests and build**

Run: `cd packages/WorkQueue/base && pnpm test && pnpm run build`
Expected: PASS — dependency guard (3) and entityValidation (11); builds, and `dist/testing/index.js` exists.

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — previous suites plus DatabaseTransportDriverFactory (3) and entityServers (7).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds; the three topology entity subclasses compile against the generated classes, which confirms the row interfaces match.

- [ ] **Step 11: Commit**

```bash
git add packages/WorkQueue/base/src packages/WorkQueue/engine/src
git commit -m "feat(work-queue): topology rows and field validation in the base tier; driver factories and entity servers in the engine"
```

---

### Task 11: Topology bindings, validation and manifest (base); `WorkQueuePublishCoordinator` (engine)

**Files:**
- Create (**base**): `packages/WorkQueue/base/src/topology/bindings.ts`, `src/topology/validateTopology.ts`, `src/topology/manifest.ts`
- Modify (**base**): `packages/WorkQueue/base/src/index.ts`
- Test (**base**): `packages/WorkQueue/base/src/__tests__/topology.test.ts`, `src/__tests__/manifest.test.ts`
- Create (**engine**): `packages/WorkQueue/engine/src/publish/WorkQueuePublishCoordinator.ts`
- Modify (**engine**): `packages/WorkQueue/engine/src/index.ts`
- Test (**engine**): `packages/WorkQueue/engine/src/__tests__/WorkQueuePublishCoordinator.test.ts`

**Interfaces:**
- Consumes: rows and `ParseJsonObject` (Task 10, base); `DeduplicationLedger`, `LedgerReservation`, `RunInWorkQueueTransaction`, `RetryTransient` (Task 7); `OwnedExecutor` (Task 8); `DatabaseTransportPublishOptions`, `DATABASE_TRANSPORT_CAPABILITIES`, `Accepted`/`Duplicate`/`Rejected` (Task 9); `DATABASE_DRIVER_CLASS` (Task 2, base); from core: `TopicBinding`, `SubscriptionBinding`, `SubscriptionPolicy`, `TransportCapabilities`, `FilterSupport`, `BindingValidationIssue`, `TopologyManifest`, `ManifestTopic`, `ManifestSubscription`, `BindingImport`, `PublishRequest`, `PublishResult`, `PublishError`, `WorkMessage`, `WorkJson`, `WorkLogger`, `ITransportDriver`, `ParseSubscriptionFilter`, `WORK_QUEUE_FILTER_SUPPORT`, `SubscriptionUnsupportedReason`, `ValidatePublishRequest`, `BuildWorkMessage`, `WorkQueueConfigurationError`.
- Produces (base — `@memberjunction/work-queue-base`):
  - `interface TopologySnapshot { Transports: TransportRow[]; Topics: TopicRow[]; Subscriptions: SubscriptionRow[] }`, `interface ResolvedTopic { Topic: TopicRow; Transport: TransportRow; Binding: TopicBinding; Subscriptions: SubscriptionBinding[] }`
  - `FindByName<T extends { Name: string }>(rows: T[], name: string): T | undefined`, `FindByID<T extends { ID: string }>(rows: T[], id: string): T | undefined`
  - `ToTopicBinding(topic: TopicRow): TopicBinding`, `ToSubscriptionPolicy(subscription: SubscriptionRow, topic: TopicRow): SubscriptionPolicy`, `ToSubscriptionBinding(subscription: SubscriptionRow, topic: TopicRow, support?: FilterSupport): SubscriptionBinding`, `ResolveTopic(snapshot: TopologySnapshot, topicName: string): ResolvedTopic | undefined`
  - `KNOWN_HOST_CEILING_SECONDS: Record<HostType, number | null>`, `ValidateTopologyRows(snapshot: TopologySnapshot, capabilitiesByDriverClass: Record<string, TransportCapabilities>): BindingValidationIssue[]` (keyed by `Transport.DriverClass`, 03 §11; a class with no entry is reported as an unavailable driver)
  - `BuildTopologyManifest(snapshot: TopologySnapshot, transportName: string, generatedAt: Date): TopologyManifest`, `interface BindingUpdate { ID: string; Name: string; BindingConfig: string }`, `interface BindingImportPlan { TopicUpdates: BindingUpdate[]; SubscriptionUpdates: BindingUpdate[]; Issues: BindingValidationIssue[] }`, `PlanBindingImport(snapshot: TopologySnapshot, bindings: BindingImport): BindingImportPlan` — pure and browser-safe, so they live in the base tier; plan 07 wraps the manifest with its AWS enricher (Task 12 `EnrichManifest`)
- Produces (engine):
  - `type LedgerOperations = Pick<DeduplicationLedger, 'Reserve' | 'Confirm' | 'Release'>`, `interface PublishCoordinatorDeps`, `interface CoordinatorPublishOptions { UserID: string | null; External: boolean; CallerExecutor: WorkQueueTransactionalExecutor | null }`, `interface PublishOrderLocker { AcquirePublishOrderLocks(topic, messages, subscriptions, executor): Promise<void> }` (the Database driver satisfies it), `class WorkQueuePublishCoordinator { constructor(deps: PublishCoordinatorDeps); Publish<TPayload extends WorkJson>(topicName: string, requests: PublishRequest<TPayload>[], options: CoordinatorPublishOptions): Promise<PublishResult[]>; Close(): Promise<void> }`

Binding convention: `ToTopicBinding` always adds `Config.TopicID`; `ToSubscriptionBinding` always adds `Config.SubscriptionID` and `Config.TopicID` (cloud drivers ignore them; the Database driver requires them).

Topology validation (per active topic and each non-disabled subscription):

| Condition | Severity |
| --- | --- |
| Topic's transport missing | Error |
| Transport `Disabled` | Warning |
| No capabilities for the transport's `DriverClass` (driver not registered) | Error |
| Cloud topic with `IsFifo = false` while any subscription is `Exclusive` (W7) | Error |
| Database topic with `IsFifo = true` | Warning |
| `SubscriptionUnsupportedReason(binding, capabilities)` returns a reason — external host on Database, **`Ordered` on any cloud transport**, backoff above the transport's maximum, inexpressible filter (03 §5) | Error |
| Filter or binding JSON does not parse | Error |
| Filter uses an operator or structure the topic's transport cannot express (re-parsed with `capabilities.Filters`), naming the field and operator | Error |
| `MaxProcessingSeconds` above the host's known ceiling (`External`: 900 s) | Warning |

Publish orchestration (03 §2.1, §1.1): topic lookup → topic rejections (`TopicNotFound`, `TopicDisabled`, `TopicNotExternallyPublishable`, `TopicUnbound`) → per-request `ValidatePublishRequest` → `BuildWorkMessage`. Results stay aligned with requests. `NotifyPublished(topicName)` fires once when anything was accepted.

- **Ledger outcomes (F1).** `Reserved` → proceed. `Duplicate` → `Duplicate` with the owner's `MessageID` (only a `Confirmed` row). `Pending` → `Rejected` `DeduplicationPending`, **retryable**: another publish holds the key and has not confirmed, so the caller must retry rather than assume success.
- **Database transport.** Per message, in one transaction — the caller's when given, else an independent one with transient retry: `Reserve` → `driver.Publish` with `DatabaseTransportPublishOptions` → `Confirm` → commit only when accepted.
- **Enlisted publishes (`CallerExecutor`).** Before the first message the coordinator asks the driver for **every publish-order lock the batch needs, in sorted key order** (`PublishOrderLocker`), so two callers publishing the same keys in opposite orders cannot deadlock. Every database error **propagates to the caller** — it owns the transaction, its retry policy must see the deadlock, and on PostgreSQL the transaction is already doomed. Nothing is mapped to `TransportUnavailable` in this mode.
- **Cloud transport.** `Reserve` each keyed request → one `driver.Publish` for the batch → `Confirm` accepted keys, `Release` the rest. The ledger runs on an **independent executor the coordinator owns** (03 §11, F8) — never the shared provider, whose ambient transaction could absorb and roll back a reservation — created on first use and released by `Close()`.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/base/src/__tests__/topology.test.ts` (the base package has no drivers, so it declares both
capability fixtures locally — the Database values must stay in step with `DATABASE_TRANSPORT_CAPABILITIES`, Task 9):

```typescript
import { describe, it, expect } from 'vitest';
import { WORK_QUEUE_FILTER_SUPPORT } from '@memberjunction/work-queue-core';
import type { TransportCapabilities } from '@memberjunction/work-queue-core';
import { FindByName, ResolveTopic, ToSubscriptionBinding, ToTopicBinding } from '../topology/bindings';
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
        expect(ToTopicBinding(TOPIC_ROW)).toEqual({ TopicName: 'import.ready', IsFifo: false, MaxPayloadBytes: 262144, Config: { TopicID: TOPIC_ROW.ID } });
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
    const capabilities: Record<string, TransportCapabilities> = { Database: DATABASE_CAPABILITIES, AWS: AWS_CAPABILITIES };
    const EXCLUSIVE = { ...SUBSCRIPTION_ROW, PartitionMode: 'Exclusive' as const };

    it('passes a valid Database topology', () => {
        expect(ValidateTopologyRows(Snapshot(), capabilities)).toEqual([]);
    });

    it('requires FIFO for Exclusive subscriptions on cloud topics', () => {
        const topic = { ...TOPIC_ROW, TransportID: AWS_TRANSPORT.ID, BindingConfig: '{"SnsTopicArn":"arn"}' };
        const issues = ValidateTopologyRows(Snapshot({ Topics: [topic], Subscriptions: [EXCLUSIVE] }), capabilities);
        expect(issues).toEqual([expect.objectContaining({ Severity: 'Error', Subject: 'import.ready', Message: expect.stringContaining('IsFifo') })]);
        const unpartitioned = { ...SUBSCRIPTION_ROW, PartitionMode: 'None' as const };
        expect(ValidateTopologyRows(Snapshot({ Topics: [topic], Subscriptions: [unpartitioned] }), capabilities)).toEqual([]);
    });

    it('rejects Ordered subscriptions on every cloud transport, whatever the host', () => {
        const topic = { ...TOPIC_ROW, TransportID: AWS_TRANSPORT.ID, IsFifo: true };
        for (const row of [SUBSCRIPTION_ROW, { ...SUBSCRIPTION_ROW, HostType: 'External' as const, HandlerKey: null }]) {
            const issues = ValidateTopologyRows(Snapshot({ Topics: [topic], Subscriptions: [row] }), capabilities);
            expect(issues).toEqual([expect.objectContaining({ Severity: 'Error', Subject: 'venue-import', Message: expect.stringContaining('Ordered') })]);
        }
    });

    it('warns about processing times above the external host ceiling', () => {
        const topic = { ...TOPIC_ROW, TransportID: AWS_TRANSPORT.ID, IsFifo: true };
        const lambda = { ...SUBSCRIPTION_ROW, PartitionMode: 'Exclusive' as const, HostType: 'External' as const, HandlerKey: null, MaxProcessingSeconds: 1800 };
        const issues = ValidateTopologyRows(Snapshot({ Topics: [topic], Subscriptions: [lambda] }), capabilities);
        expect(issues).toEqual([expect.objectContaining({ Severity: 'Warning', Subject: 'venue-import' })]);
    });

    it('reports unavailable drivers and unparseable filters', () => {
        expect(ValidateTopologyRows(Snapshot(), {})[0]).toMatchObject({ Severity: 'Error', Subject: 'import.ready', Message: expect.stringContaining("DriverClass 'Database'") });
        const badFilter = { ...SUBSCRIPTION_ROW, Filter: '{"eventType":"click"}' };
        expect(ValidateTopologyRows(Snapshot({ Subscriptions: [badFilter] }), capabilities)[0].Subject).toBe('venue-import');
    });

    it('rejects a filter the topic transport cannot express, naming field and operator', () => {
        const startswith = '{"logic":"and","filters":[{"field":"tenant","operator":"startswith","value":"acme-"}]}';
        const row = { ...SUBSCRIPTION_ROW, PartitionMode: 'None' as const, Filter: startswith };
        // Valid on Database (full subset)…
        expect(ValidateTopologyRows(Snapshot({ Subscriptions: [row] }), capabilities)).toEqual([]);
        // …and an Error on the cloud transport whose FilterSupport omits `startswith`.
        const topic = { ...TOPIC_ROW, TransportID: AWS_TRANSPORT.ID, IsFifo: true };
        const issue = ValidateTopologyRows(Snapshot({ Topics: [topic], Subscriptions: [row] }), capabilities)[0];
        expect(issue).toMatchObject({ Severity: 'Error', Subject: 'venue-import' });
        expect(issue.Message).toContain('startswith');
        expect(issue.Message).toContain('tenant');
    });
});
```

`packages/WorkQueue/base/src/__tests__/manifest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { TopologySnapshot } from '../topology/bindings';
import { BuildTopologyManifest, PlanBindingImport } from '../topology/manifest';
import {
    SUBSCRIPTION_ROW_FIXTURE as SUBSCRIPTION_ROW,
    TOPIC_ROW_FIXTURE as TOPIC_ROW,
    TRANSPORT_ROW_FIXTURE as TRANSPORT_ROW,
} from '../testing/rowFixtures';

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
        expect(manifest.Topics[1]).toMatchObject({ Name: 'import.ready', IsFifo: false, MaxPayloadBytes: 262144 });
        expect(manifest.Topics[1].Subscriptions[0]).toEqual({
            Name: 'venue-import', Filter: null, HostType: 'MJWorker', Status: 'Active', ExternalRef: null,
            Policy: expect.objectContaining({ SubscriptionName: 'venue-import', PartitionMode: 'Ordered' }),
        });
    });

    it('exports Paused subscriptions with their status and leaves Disabled ones out', () => {
        const paused = { ...SUBSCRIPTION_ROW, ID: 'B2', Name: 'paused-one', Status: 'Paused' as const };
        const disabled = { ...SUBSCRIPTION_ROW, ID: 'B3', Name: 'retired', Status: 'Disabled' as const };
        const manifest = BuildTopologyManifest(Snapshot({ Subscriptions: [SUBSCRIPTION_ROW, paused, disabled] }), 'Database', new Date());
        expect(manifest.Topics[0].Subscriptions.map(s => [s.Name, s.Status])).toEqual([['paused-one', 'Paused'], ['venue-import', 'Active']]);
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
import {
    SUBSCRIPTION_ROW_FIXTURE as SUBSCRIPTION_ROW, TOPIC_ROW_FIXTURE as TOPIC_ROW, TRANSPORT_ROW_FIXTURE as TRANSPORT_ROW,
} from '@memberjunction/work-queue-base/testing';
import type { WorkQueueSqlExecutor, WorkQueueTransactionalExecutor } from '../sql/WorkQueueSqlExecutor';
import { RecordingExecutor, RecordingLogger } from './fakes';

class FakeDriver implements ITransportDriver {
    public readonly Name = 'Fake';
    public readonly Capabilities = DATABASE_TRANSPORT_CAPABILITIES;
    public readonly Calls: { Messages: WorkMessage[]; Options?: DatabasePublishOptions }[] = [];
    public readonly LockCalls: { Keys: (string | undefined)[]; Executor: WorkQueueTransactionalExecutor }[] = [];
    public NextResults: PublishResult[] | Error | null = null;

    /** Satisfies PublishOrderLocker, like the Database driver. */
    public async AcquirePublishOrderLocks(_topic: TopicBinding, messages: WorkMessage[], _subscriptions: SubscriptionBinding[],
                                          executor: WorkQueueTransactionalExecutor): Promise<void> {
        this.LockCalls.push({ Keys: messages.map(m => m.PartitionKey), Executor: executor });
    }

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
    /** Keys another publish has Reserved but not Confirmed (F1). */
    public readonly PendingOwners = new Map<string, string>();

    public async Reserve(topicID: string, key: string, messageID: string): Promise<LedgerReservation> {
        this.Events.push(`reserve:${key}`);
        const pending = this.PendingOwners.get(key);
        if (pending && pending !== messageID) {
            return { Kind: 'Pending', OwnerMessageID: pending };
        }
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
    const ledgerExecutors: WorkQueueSqlExecutor[] = [];
    let id = 0;
    const topic = { ...TOPIC_ROW, TransportID: transport.ID, ...topicOverrides };
    const snapshot = { Transports: [TRANSPORT_ROW, AWS_TRANSPORT], Topics: [topic], Subscriptions: [{ ...SUBSCRIPTION_ROW, PartitionMode: 'None' as const }] };
    const deps: PublishCoordinatorDeps = {
        ResolveTopic: name => ResolveTopic(snapshot, name),
        GetDriver: async () => driver,
        Executor: executor,
        CreateLedger: ledgerExecutor => { ledgerExecutors.push(ledgerExecutor); return ledger; },
        NewID: () => `00000000-0000-0000-0000-00000000000${++id}`,
        Now: () => new Date('2026-01-01T00:00:00Z'),
        NotifyPublished: name => notified.push(name),
        Log: new RecordingLogger(),
    };
    return { coordinator: new WorkQueuePublishCoordinator(deps), driver, ledger, executor, notified, ledgerExecutors };
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

    it('rejects as retryable DeduplicationPending when another publish holds the key unconfirmed (F1)', async () => {
        const { coordinator, driver, ledger, executor } = Setup();
        ledger.PendingOwners.set('k1', 'OTHER');
        const [result] = await coordinator.Publish('import.ready', [{ DeduplicationKey: 'k1' }], INTERNAL);
        expect(result.Status).toBe('Rejected');
        expect(result.Error).toMatchObject({ Code: 'DeduplicationPending', Retryable: true });
        expect(driver.Calls).toHaveLength(0);
        expect(executor.Events).toContain('rollback');
    });

    it('rolls back when the driver rejects and keeps results aligned with invalid requests', async () => {
        const { coordinator, driver, executor } = Setup();
        driver.NextResults = [Rejected('x', 'MessageIDConflict', 'conflict', false)];
        const results = await coordinator.Publish('import.ready', [{ PartitionKey: '' }, { Payload: 1 }], INTERNAL);
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

    it("asks the driver for the whole batch's publish-order locks before the first enlisted message", async () => {
        const { coordinator, driver } = Setup();
        const caller = new RecordingExecutor();
        await coordinator.Publish('import.ready', [{ PartitionKey: 'b' }, { PartitionKey: 'a' }], { ...INTERNAL, CallerExecutor: caller });
        expect(driver.LockCalls).toEqual([{ Keys: ['b', 'a'], Executor: caller }]);
        expect(driver.Calls).toHaveLength(2);
    });

    it('takes no batch locks when it manages its own per-message transactions', async () => {
        const { coordinator, driver } = Setup();
        await coordinator.Publish('import.ready', [{ PartitionKey: 'b' }, { PartitionKey: 'a' }], INTERNAL);
        expect(driver.LockCalls).toEqual([]);
    });

    it('lets database errors propagate to an enlisted caller instead of reporting TransportUnavailable', async () => {
        const { coordinator, driver } = Setup();
        const caller = new RecordingExecutor();
        driver.NextResults = Object.assign(new Error('Transaction was deadlocked'), { number: 1205 });
        await expect(coordinator.Publish('import.ready', [{}], { ...INTERNAL, CallerExecutor: caller })).rejects.toThrow('deadlocked');
        expect(caller.Events).toEqual(['begin', 'rollback']);
    });

    it('reports a retryable rejection when its own transaction fails', async () => {
        const { coordinator, driver } = Setup();
        driver.NextResults = new Error('connection reset');
        const [result] = await coordinator.Publish('import.ready', [{}], INTERNAL);
        expect(result.Error).toEqual({ Code: 'TransportUnavailable', Message: 'connection reset', Retryable: true });
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

    it('runs the ledger on an independent executor it owns, and releases it on Close (F8)', async () => {
        const { coordinator, executor, ledgerExecutors } = Setup({ BindingConfig: '{"SnsTopicArn":"arn"}' }, AWS_TRANSPORT);
        await coordinator.Publish('import.ready', [{ DeduplicationKey: 'a' }], INTERNAL);
        await coordinator.Publish('import.ready', [{ DeduplicationKey: 'b' }], INTERNAL);
        expect(ledgerExecutors).toHaveLength(2);
        expect(ledgerExecutors[0]).not.toBe(executor);
        expect(ledgerExecutors[1]).toBe(ledgerExecutors[0]);
        expect(executor.Events).toEqual(['independent']);
        await coordinator.Close();
        expect(executor.Events).toEqual(['independent', 'release']);
    });

    it('rejects a key another publish holds unconfirmed, and still sends the rest of the batch', async () => {
        const { coordinator, driver, ledger } = Setup({ BindingConfig: '{"SnsTopicArn":"arn"}' }, AWS_TRANSPORT);
        ledger.PendingOwners.set('a', 'OTHER');
        const results = await coordinator.Publish('import.ready', [{ DeduplicationKey: 'a' }, { DeduplicationKey: 'b' }], INTERNAL);
        expect(results[0].Error).toMatchObject({ Code: 'DeduplicationPending', Retryable: true });
        expect(results[1].Status).toBe('Accepted');
        expect(driver.Calls[0].Messages).toHaveLength(1);
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

`{ PartitionKey: '' }` fails core validation (`InvalidPartitionKey`, 03 §1.1); `{ Payload: 1 }` is valid.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/base && pnpm test topology manifest` and `cd packages/WorkQueue/engine && pnpm test WorkQueuePublishCoordinator`
Expected: FAIL — unresolved imports under `../topology/` (base) and `../publish/WorkQueuePublishCoordinator` (engine).

- [ ] **Step 3: Write `packages/WorkQueue/base/src/topology/bindings.ts`**

```typescript
import { ParseSubscriptionFilter, WORK_QUEUE_FILTER_SUPPORT, WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { FilterSupport, SubscriptionBinding, SubscriptionPolicy, TopicBinding } from '@memberjunction/work-queue-core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
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
        IsFifo: topic.IsFifo,
        MaxPayloadBytes: topic.MaxPayloadBytes,
        Config: { ...ParseJsonObject(topic.BindingConfig, `Topic ${topic.Name} BindingConfig`), TopicID: topic.ID },
    };
}

export function ToSubscriptionPolicy(subscription: SubscriptionRow, topic: TopicRow): SubscriptionPolicy {
    const policy: SubscriptionPolicy = {
        SubscriptionName: subscription.Name,
        TopicName: topic.Name,
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
import { UUIDsEqual } from '@memberjunction/global';
import { DATABASE_DRIVER_CLASS } from '../constants';
import { FindByID, ToSubscriptionBinding, ToTopicBinding } from './bindings';
import type { TopologySnapshot } from './bindings';
import type { SubscriptionRow, TopicRow, TransportRow } from './rows';

/** Known maximum handler run time per host type (null = no known ceiling). External = AWS Lambda's 900 s. */
export const KNOWN_HOST_CEILING_SECONDS: Record<HostType, number | null> = {
    MJWorker: null,
    External: 900,
};

/**
 * Validates topology rows against transport capabilities, keyed by `Transport.DriverClass` (03 §11). Capabilities are
 * a property of the driver class, not of one transport row, so the browser tier can validate with a static table.
 */
export function ValidateTopologyRows(snapshot: TopologySnapshot, capabilitiesByDriverClass: Record<string, TransportCapabilities>): BindingValidationIssue[] {
    const issues: BindingValidationIssue[] = [];
    for (const topic of snapshot.Topics.filter(t => t.Status === 'Active')) {
        issues.push(...ValidateTopic(snapshot, topic, capabilitiesByDriverClass));
    }
    return issues;
}

function ValidateTopic(snapshot: TopologySnapshot, topic: TopicRow, capabilitiesByDriverClass: Record<string, TransportCapabilities>): BindingValidationIssue[] {
    const transport = FindByID(snapshot.Transports, topic.TransportID);
    if (!transport) {
        return [Issue('Error', topic.Name, 'Topic references a transport that does not exist')];
    }
    const issues: BindingValidationIssue[] = [];
    if (transport.Status === 'Disabled') {
        issues.push(Issue('Warning', topic.Name, `Transport '${transport.Name}' is disabled; publishes will be rejected`));
    }
    const caps = Object.hasOwn(capabilitiesByDriverClass, transport.DriverClass) ? capabilitiesByDriverClass[transport.DriverClass] : undefined;
    if (!caps) {
        issues.push(Issue('Error', topic.Name, `Transport '${transport.Name}' driver is unavailable: no driver is registered for DriverClass '${transport.DriverClass}'`));
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
        issues.push(...ValidateSubscription(topic, subscription, caps));
    }
    return issues;
}

function FifoIssues(topic: TopicRow, transport: TransportRow, subscriptions: SubscriptionRow[]): BindingValidationIssue[] {
    const isDatabase = transport.DriverClass === DATABASE_DRIVER_CLASS;
    if (isDatabase) {
        return topic.IsFifo ? [Issue('Warning', topic.Name, 'IsFifo has no effect on the Database transport')] : [];
    }
    // W7. Ordered is not listed: no cloud transport supports it, and SubscriptionUnsupportedReason says so per subscription.
    const needsFifo = subscriptions.some(s => s.PartitionMode === 'Exclusive');
    return needsFifo && !topic.IsFifo
        ? [Issue('Error', topic.Name, 'IsFifo must be true on cloud topics that have Exclusive subscriptions')]
        : [];
}

function ValidateSubscription(topic: TopicRow, subscription: SubscriptionRow, caps: TransportCapabilities): BindingValidationIssue[] {
    const issues: BindingValidationIssue[] = [];
    let reason: string | null;
    try {
        // Re-parsing with the transport's own FilterSupport is what rejects `contains`, cross-field OR and the rest
        // on a cloud topic: the thrown message names the offending field and operator (03 §4.1).
        reason = SubscriptionUnsupportedReason(ToSubscriptionBinding(subscription, topic, caps.Filters), caps);
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
    return issues;
}

function Issue(severity: 'Error' | 'Warning', subject: string, message: string): BindingValidationIssue {
    return { Severity: severity, Subject: subject, Message: message };
}
```

- [ ] **Step 5: Write `packages/WorkQueue/base/src/topology/manifest.ts`**

Transport-neutral: it never renders a broker-specific field. `ManifestSubscription.Aws` (03 §10) is added by plan 07's
enricher, which the engine applies in `ExportManifest` (Task 12).

```typescript
import { ParseSubscriptionFilter, WORK_QUEUE_FILTER_SUPPORT, WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { BindingImport, BindingValidationIssue, ManifestSubscription, TopologyManifest } from '@memberjunction/work-queue-core';
import { UUIDsEqual } from '@memberjunction/global';
import { ParseJsonObject } from '../entities/validation';
import { FindByName, ToSubscriptionPolicy } from './bindings';
import type { TopologySnapshot } from './bindings';
import type { SubscriptionRow, TopicRow } from './rows';

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
            IsFifo: topic.IsFifo,
            MaxPayloadBytes: topic.MaxPayloadBytes,
            Subscriptions: snapshot.Subscriptions
                .filter(s => UUIDsEqual(s.TopicID, topic.ID) && s.Status !== 'Disabled')
                .sort((a, b) => a.Name.localeCompare(b.Name))
                .map(s => ToManifestSubscription(s, topic)),
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

function ToManifestSubscription(subscription: SubscriptionRow, topic: TopicRow): ManifestSubscription {
    return {
        Name: subscription.Name,
        Filter: ParseSubscriptionFilter(subscription.Filter, WORK_QUEUE_FILTER_SUPPORT),
        Policy: ToSubscriptionPolicy(subscription, topic),
        HostType: subscription.HostType,
        // Terraform maps Paused to the Lambda event source's `enabled = false` (03 §10). Disabled rows are not exported.
        Status: subscription.Status,
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
    ITransportDriver, PublishError, PublishRequest, PublishResult, SubscriptionBinding, TopicBinding, WorkJson, WorkLogger, WorkMessage,
} from '@memberjunction/work-queue-core';
import { DATABASE_DRIVER_CLASS } from '@memberjunction/work-queue-base';
import type { ResolvedTopic } from '@memberjunction/work-queue-base';
import type { DeduplicationLedger, LedgerReservation } from '../dedup/DeduplicationLedger';
import { ErrorText } from '../sql/sqlExecution';
import type { WorkQueueExecutorSource, WorkQueueSqlExecutor, WorkQueueTransactionalExecutor } from '../sql/WorkQueueSqlExecutor';
import { OwnedExecutor } from '../transports/OwnedExecutor';
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

/** A driver that can take a batch's publish-order locks up front, in sorted key order (the Database driver, Task 9). */
export interface PublishOrderLocker {
    AcquirePublishOrderLocks(topic: TopicBinding, messages: WorkMessage[], subscriptions: SubscriptionBinding[],
                             executor: WorkQueueTransactionalExecutor): Promise<void>;
}

function IsPublishOrderLocker(driver: ITransportDriver): driver is ITransportDriver & PublishOrderLocker {
    return 'AcquirePublishOrderLocks' in driver && typeof driver.AcquirePublishOrderLocks === 'function';
}

interface PreparedPublish {
    Index: number;
    Message: WorkMessage;
    DedupKey: string | null;
    TTLSeconds: number;
}

/** Owns publish validation and the deduplication ledger protocol for every transport (03 §2.1). */
export class WorkQueuePublishCoordinator {
    /** The cloud-path ledger's independent executor (03 §11, F8): minted on first use, released by Close(). */
    private readonly cloudLedgerExecutor: OwnedExecutor;

    constructor(private readonly deps: PublishCoordinatorDeps) {
        this.cloudLedgerExecutor = new OwnedExecutor(deps.Executor);
    }

    public Close(): Promise<void> {
        return this.cloudLedgerExecutor.Release();
    }

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
            if (options.CallerExecutor && IsPublishOrderLocker(driver)) {
                // One caller transaction for the whole batch: every lock first, in sorted key order (03 §7).
                await driver.AcquirePublishOrderLocks(resolved.Binding, prepared.map(p => p.Message), resolved.Subscriptions, options.CallerExecutor);
            }
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
                const refusal = ReservationRefusal(await ledger.Reserve(resolved.Topic.ID, item.DedupKey, messageID), messageID, item.DedupKey);
                if (refusal) {
                    return { Commit: false, Value: refusal };
                }
            }
            const publishOptions: DatabaseTransportPublishOptions = { Kind: 'Database', Executor: tx, UserID: options.UserID ?? undefined };
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
        if (options.CallerExecutor) {
            // Enlisted: the caller owns the transaction, so every database error is the caller's to see (03 §11).
            return work();
        }
        try {
            return await RetryTransient(work);
        } catch (error) {
            this.deps.Log.Error(`Publish of message ${messageID} to '${resolved.Topic.Name}' failed`, error instanceof Error ? error : undefined);
            return Rejected(messageID, 'TransportUnavailable', ErrorText(error), true);
        }
    }

    private async PublishCloud(resolved: ResolvedTopic, driver: ITransportDriver, prepared: PreparedPublish[], results: PublishResult[]): Promise<void> {
        let ledger: LedgerOperations;
        try {
            ledger = this.deps.CreateLedger(await this.cloudLedgerExecutor.Get());
        } catch (error) {
            for (const item of prepared) {
                results[item.Index] = Rejected(item.Message.MessageID, 'TransportUnavailable', ErrorText(error), true);
            }
            return;
        }
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
                const refusal = ReservationRefusal(reservation, item.Message.MessageID, item.DedupKey);
                if (refusal) {
                    results[item.Index] = refusal;
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

/** 03 §2.1 (F1): only a Confirmed row is a duplicate; someone else's unconfirmed reservation is a retryable rejection. */
function ReservationRefusal(reservation: LedgerReservation, messageID: string, key: string): PublishResult | null {
    switch (reservation.Kind) {
        case 'Reserved':
            return null;
        case 'Duplicate':
            return Duplicate(reservation.OwnerMessageID);
        case 'Pending':
            return Rejected(messageID, 'DeduplicationPending',
                `Deduplication key '${key}' is reserved by message ${reservation.OwnerMessageID}, which has not been confirmed yet; retry`, true);
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
export * from './topology/manifest';
```

Append to `packages/WorkQueue/engine/src/index.ts` — engine modules only; binding builders, topology validation and the
manifest are imported from `@memberjunction/work-queue-base` by whoever needs them (no re-exports):

```typescript
export * from './publish/WorkQueuePublishCoordinator';
```

- [ ] **Step 8: Run the tests and build**

Run: `cd packages/WorkQueue/base && pnpm test && pnpm run build`
Expected: PASS — previous base suites plus topology (8, including the per-transport filter-support case) and manifest (4); builds.

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — previous suites plus WorkQueuePublishCoordinator (17).

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds.

- [ ] **Step 9: Commit**

```bash
git add packages/WorkQueue/base/src packages/WorkQueue/engine/src
git commit -m "feat(work-queue): topology bindings, validation and manifest in the base tier; publish coordinator in the engine"
```

---

### Task 12: `WorkQueueEngineBase` (base) and the `WorkQueueEngine` facade (engine)

**Files:**
- Create (**base**): `packages/WorkQueue/base/src/WorkQueueEngineBase.ts`, `src/testing/SeededWorkQueueEngineBase.ts`
- Modify (**base**): `packages/WorkQueue/base/src/index.ts`, `src/testing/index.ts`
- Test (**base**): `packages/WorkQueue/base/src/__tests__/WorkQueueEngineBase.test.ts`
- Create (**engine**): `packages/WorkQueue/engine/src/engine/driverResolution.ts`, `src/engine/PublishListenerSet.ts`
- Create (**engine**): `packages/WorkQueue/engine/src/WorkQueueEngine.ts`
- Modify (**engine**): `packages/WorkQueue/engine/src/index.ts`
- Test (**engine**): `packages/WorkQueue/engine/src/__tests__/driverResolution.test.ts`, `src/__tests__/PublishListenerSet.test.ts`, `src/__tests__/WorkQueueEngine.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–11; generated `MJWorkQueueTransportEntity`, `MJWorkQueueTopicEntity`, `MJWorkQueueSubscriptionEntity`; `BaseEngine`, `BaseEnginePropertyConfig`, `IMetadataProvider`, `UserInfo` from `@memberjunction/core`; `BaseSingleton`, `MJGlobal`, `NormalizeUUID`, `UUIDsEqual` from `@memberjunction/global`; from core: `IWorkPublisher`, `ITransportDriver`, `ITransportOperator`, `TopicBinding`, `SubscriptionBinding`, `SubscriptionPolicy`, `FilterSupport`, `SubscriptionFilter`, `BindingValidationIssue`, `TransportCapabilities`, `TopologyManifest`, `BindingImport`, `PublishRequest`, `PublishResult`, `WorkJson`, `WorkQueueConfigurationError`.
- Produces (base — `@memberjunction/work-queue-base`):
  - `class WorkQueueEngineBase extends BaseEngine<WorkQueueEngineBase>` — exactly the 03 §11 members: `static Instance`, `Config(forceRefresh?, contextUser?, provider?)`, `Transports`, `Topics`, `Subscriptions`, `GetTopicByName`, `GetSubscriptionByName`, `SubscriptionsForTopic(topicID)`, `TopicOf(subscription): … | undefined`, `TransportOf(topic): … | undefined`, `BuildTopicBinding(topic)`, `BuildSubscriptionBinding(subscription, support?)`, `BuildSubscriptionPolicy(subscription)`, `ParseFilter(subscription, support)`, `ValidateTopologyRows(capabilitiesByDriverClass: Record<string, TransportCapabilities>)` — plus `get Snapshot(): TopologySnapshot` for the server tier
- Produces (base — `@memberjunction/work-queue-base/testing`): `class SeededWorkQueueEngineBase extends WorkQueueEngineBase { static get Instance(); Seed(snapshot: TopologySnapshot, contextUser: UserInfo): void }` — a provider-free metadata tier for this plan's and plan 06–07's suites
- Produces (engine):
  - `DriverCacheKey(transport: TransportRow): string`, `ResolveDriverFactory(driverClass: string): BaseTransportDriverFactory`
  - `class ListenerSet<TEvent> { constructor(label: string); Add(listener: (event: TEvent) => void): () => void; Notify(event: TEvent): void; get Count(): number }` and `class PublishListenerSet extends ListenerSet<string>`
  - `interface WorkQueuePublishOptions { ContextUser: UserInfo; Provider?: IMetadataProvider; External?: boolean }`
  - `class WorkQueueEngine extends BaseSingleton<WorkQueueEngine> implements IWorkPublisher` — a **facade** over `WorkQueueEngineBase.Instance` (composition, not inheritance, exactly like `AIEngine`/`AIEngineBase`) with **exactly** the 03 §11 surface:
    - `static Instance`, `get Metadata(): WorkQueueEngineBase`, `Config(forceRefresh?, contextUser?, provider?)`
    - proxies — the complete list: `Transports`, `Topics`, `Subscriptions`, `GetTopicByName`, `GetSubscriptionByName`, `SubscriptionsForTopic`, `BuildTopicBinding`, `BuildSubscriptionBinding(subscription, support?)`. Everything else (`TopicOf`, `TransportOf`, `BuildSubscriptionPolicy`, `ParseFilter`, `ValidateTopologyRows`) is reached through `Metadata`
    - server-only: `GetDriver(transportID)`, `GetOperator(subscription)`, `ValidateTopology()`, `PublishAs`, `Publish`, `OnPublished(listener)`, `GetBacklog(subscriptionName): Promise<{ Supported; Claimable; InFlight; Total; Capped }>`, **public** `NotifyDeadLettered(event)`, `OnDeadLettered(listener)`, `ExportManifest(transportName)`, `ImportBindings(bindings, contextUser)`
    - plus `Shutdown(): Promise<void>` (closes cached drivers and the publish coordinator; plan 06's host calls it on stop) and the protected seam `EnrichManifest(manifest): TopologyManifest` that plan 07 fills

`WorkQueueEngine` does **not** implement `IStartupSink` and is not registered for startup (03 §11): MJServer configures it
explicitly when the `workQueue` section is enabled (plan 06). The engine **re-exports nothing** from the base package —
callers import `WorkQueueEngineBase` from `@memberjunction/work-queue-base`.

**Why a facade and not a subclass** (`packages/AI/BaseAIEngine/src/BaseAIEngine.ts` carries the same rationale):
`BaseEngine<T>` is a singleton keyed on its own type, so a server subclass would give a *second* cache of the same
three entities. The metadata tier is loaded once, in the base, and the server engine proxies it — which also lets
Explorer and the operator dashboard load topology with no server-only dependency. The proxy list is **closed** (03 §11):
a new `WorkQueueEngineBase` member is reached as `engine.Metadata.NewMember(…)`, not by growing the facade.

Engine rules:

- **Provider.** The engine requires a server-side provider that satisfies `WorkQueueExecutorSource` (`DatabaseProviderBase` does); a browser provider raises `WorkQueueConfigurationError`.
- **One driver instance per transport, however it is reached** (03 §11). `GetDriver` is the only place a driver is built; `GetOperator`, `GetBacklog`, `PublishAs` and `ValidateTopology` all go through it. There is no separate "database driver" accessor: a second `DatabaseTransportDriver` would mean a second operator executor and a second lease-owner identity.
- **Driver cache.** Keyed per transport; a change to `DriverClass`, `Configuration`, `CredentialID` or `Status` builds a new driver and **closes the one it replaces** (releasing its operator executor, F8). Consumers already opened keep working: each owns its own executor.
- **`ValidateTopology`** = topology rows and capability gating (`ValidateTopologyRows`, keyed by `DriverClass`) + each driver's `ValidateBindings` + database prerequisites: a driver that exposes `CheckPrerequisites()` (the Database driver) reports `READ_COMMITTED_SNAPSHOT OFF` as an **Error** (03 §6, F9). A transport whose driver cannot be built is an Error issue, never an exception.
- **Publishing.** `Publish` (two-argument) publishes as the engine's system user. `PublishAs` enlists in the caller's transaction when `options.Provider` satisfies `WorkQueueTransactionalExecutor`; database errors then propagate to the caller (Task 11). The engine holds **one** `WorkQueuePublishCoordinator`, because the coordinator owns the cloud ledger's independent executor.
- **`GetBacklog`** answers `Supported: true` with capped counts for Database subscriptions (`Total = Claimable + InFlight`, `Capped` when either count hit 1000) and `Supported: false` for cloud ones — scale those from the broker's own metrics.
- **Dead letters.** `NotifyDeadLettered` is public (F13): drivers receive it through `TransportDriverDeps`, and plan 06's sweeper calls it for the rows `ExpireLeasesAll` returns. `OnDeadLettered` is in-process only (03 §11).
- **`ImportBindings`** saves each binding through the entity as the **caller's** user (so validation, permissions and record changes apply), then re-reads metadata as the **engine's system user** and returns import issues plus `ValidateTopology()` issues. Bindings do not shape drivers, so the driver cache is left alone.

- [ ] **Step 1: Write the failing tests**

`packages/WorkQueue/engine/src/__tests__/driverResolution.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import { DriverCacheKey, ResolveDriverFactory } from '../engine/driverResolution';
import { DatabaseTransportDriverFactory } from '../transports/database/DatabaseTransportDriverFactory';
import { TRANSPORT_ROW_FIXTURE as TRANSPORT_ROW } from '@memberjunction/work-queue-base/testing';

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

`packages/WorkQueue/engine/src/__tests__/WorkQueueEngine.test.ts` — the facade is tested through two seams: the metadata
tier is `SeededWorkQueueEngineBase` (no provider), and the executor is a `RecordingExecutor`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import type { TopologyManifest } from '@memberjunction/work-queue-core';
import { WORK_QUEUE_FILTER_SUPPORT } from '@memberjunction/work-queue-core';
import type { TopologySnapshot, WorkQueueEngineBase } from '@memberjunction/work-queue-base';
import {
    SeededWorkQueueEngineBase, SUBSCRIPTION_ROW_FIXTURE, TOPIC_ROW_FIXTURE, TRANSPORT_ROW_FIXTURE,
} from '@memberjunction/work-queue-base/testing';
import type { WorkQueueExecutorSource } from '../sql/WorkQueueSqlExecutor';
import { DatabaseTransportDriver } from '../transports/database/DatabaseTransportDriver';
import type { DeadLetteredEvent } from '../transports/TransportDriverDeps';
import { WorkQueueEngine } from '../WorkQueueEngine';
import { RecordingExecutor, TEST_USER } from './fakes';

/** The facade with its two collaborators replaced; everything else is the production code. */
class TestEngine extends WorkQueueEngine {
    public static get Instance(): TestEngine {
        return super.getInstance<TestEngine>();
    }
    public Source: RecordingExecutor = new RecordingExecutor();
    public Enriched: TopologyManifest[] = [];

    public override get Metadata(): WorkQueueEngineBase {
        return SeededWorkQueueEngineBase.Instance;
    }
    protected override get Executor(): WorkQueueExecutorSource {
        return this.Source;
    }
    protected override EnrichManifest(manifest: TopologyManifest): TopologyManifest {
        this.Enriched.push(manifest);
        return manifest;
    }
}

const SNAPSHOT: TopologySnapshot = { Transports: [TRANSPORT_ROW_FIXTURE], Topics: [TOPIC_ROW_FIXTURE], Subscriptions: [SUBSCRIPTION_ROW_FIXTURE] };

function Engine(snapshot: TopologySnapshot = SNAPSHOT): TestEngine {
    SeededWorkQueueEngineBase.Instance.Seed(snapshot, TEST_USER);
    const engine = TestEngine.Instance;
    engine.Source = new RecordingExecutor();
    engine.Enriched = [];
    return engine;
}

afterEach(async () => {
    await TestEngine.Instance.Shutdown();
});

describe('WorkQueueEngine proxies (03 §11)', () => {
    it('forwards the closed proxy list to the metadata tier', () => {
        const engine = Engine();
        expect(engine.Transports).toHaveLength(1);
        expect(engine.Topics[0].Name).toBe('import.ready');
        expect(engine.Subscriptions[0].Name).toBe('venue-import');
        expect(engine.GetTopicByName(' IMPORT.READY ')?.ID).toBe(TOPIC_ROW_FIXTURE.ID);
        expect(engine.GetSubscriptionByName('venue-import')?.ID).toBe(SUBSCRIPTION_ROW_FIXTURE.ID);
        expect(engine.SubscriptionsForTopic(TOPIC_ROW_FIXTURE.ID)).toHaveLength(1);
        expect(engine.BuildTopicBinding(engine.Topics[0]).Config).toEqual({ TopicID: TOPIC_ROW_FIXTURE.ID });
        expect(engine.BuildSubscriptionBinding(engine.Subscriptions[0], WORK_QUEUE_FILTER_SUPPORT).Policy.PartitionMode).toBe('Ordered');
    });

    it('no longer carries the members Revision 4 removed from the 03 §11 surface', () => {
        const engine = Engine();
        for (const gone of ['IsStagedToDatabase', 'GetDatabaseDriver', 'Loaded', 'ContextUser', 'ProviderToUse', 'HandleStartup']) {
            expect(gone in engine).toBe(false);
        }
    });
});

describe('WorkQueueEngine drivers', () => {
    it('hands out ONE driver instance per transport, however it is reached', async () => {
        const engine = Engine();
        const driver = await engine.GetDriver(TRANSPORT_ROW_FIXTURE.ID);
        expect(driver).toBeInstanceOf(DatabaseTransportDriver);
        expect(await engine.GetDriver(TRANSPORT_ROW_FIXTURE.ID.toLowerCase())).toBe(driver);
        expect(await engine.GetOperator(engine.Subscriptions[0])).toBe(driver.Operator());
    });

    it('rebuilds the driver when the transport changes, and closes the one it replaces', async () => {
        const engine = Engine();
        const first = await engine.GetDriver(TRANSPORT_ROW_FIXTURE.ID);
        engine.Source.QueueRows([{ AffectedRows: 0 }]);
        await first.Operator().Replay(engine.BuildSubscriptionBinding(engine.Subscriptions[0]), 'EEEEEEEE-0000-0000-0000-000000000001', null, null);
        SeededWorkQueueEngineBase.Instance.Seed({ ...SNAPSHOT, Transports: [{ ...TRANSPORT_ROW_FIXTURE, Configuration: '{"x":1}' }] }, TEST_USER);
        const second = await engine.GetDriver(TRANSPORT_ROW_FIXTURE.ID);
        expect(second).not.toBe(first);
        expect(engine.Source.Events).toEqual(['independent', 'release']);
    });

    it('fails clearly for an unknown transport', async () => {
        await expect(Engine().GetDriver('00000000-0000-0000-0000-00000000dead')).rejects.toThrow('does not exist');
    });
});

describe('WorkQueueEngine.GetBacklog', () => {
    it('reports capped counts with their total for a Database subscription', async () => {
        const engine = Engine();
        engine.Source.QueueRows([{ Claimable: 1000, InFlight: 3 }]);
        expect(await engine.GetBacklog('venue-import')).toEqual({ Supported: true, Claimable: 1000, InFlight: 3, Total: 1003, Capped: true });
    });

    it('rejects an unknown subscription', async () => {
        await expect(Engine().GetBacklog('nope')).rejects.toThrow("'nope' does not exist");
    });
});

describe('WorkQueueEngine dead-letter events', () => {
    it('fans NotifyDeadLettered out to OnDeadLettered listeners until they unsubscribe', () => {
        const engine = Engine();
        const seen: DeadLetteredEvent[] = [];
        const off = engine.OnDeadLettered(event => seen.push(event));
        const event = { SubscriptionName: 'venue-import', DeliveryID: 'D1', Reason: 'LeaseExpired', PartitionKey: null };
        engine.NotifyDeadLettered(event);
        off();
        engine.NotifyDeadLettered(event);
        expect(seen).toEqual([event]);
    });
});

describe('WorkQueueEngine.ValidateTopology', () => {
    it('reports READ_COMMITTED_SNAPSHOT OFF as an Error (F9)', async () => {
        const engine = Engine();
        engine.Source.QueueRows([{ SnapshotOn: 0 }]);
        const issues = await engine.ValidateTopology();
        expect(issues).toEqual([expect.objectContaining({ Severity: 'Error', Message: expect.stringContaining('READ_COMMITTED_SNAPSHOT') })]);
    });

    it('passes a healthy Database topology', async () => {
        const engine = Engine();
        engine.Source.QueueRows([{ SnapshotOn: 1 }]);
        expect(await engine.ValidateTopology()).toEqual([]);
    });

    it('reports a transport whose driver is not registered instead of throwing', async () => {
        const azure = { ...TRANSPORT_ROW_FIXTURE, DriverClass: 'Azure' };
        const issues = await Engine({ ...SNAPSHOT, Transports: [azure] }).ValidateTopology();
        expect(issues[0]).toMatchObject({ Severity: 'Error', Subject: 'Database', Message: expect.stringContaining("DriverClass 'Azure'") });
    });
});

describe('WorkQueueEngine publishing and manifest', () => {
    it('publishes through the cached driver and tells OnPublished listeners', async () => {
        const engine = Engine();
        const published: string[] = [];
        const off = engine.OnPublished(name => published.push(name));
        engine.Source.QueueRows([{ ID: 'CCCCCCCC-0000-0000-0000-000000000001', PublishOrdinal: 1 }]).QueueRows([{ AffectedRows: 1 }]);
        const [result] = await engine.PublishAs('import.ready', [{ MessageID: 'CCCCCCCC-0000-0000-0000-000000000001' }], { ContextUser: TEST_USER });
        off();
        expect(result.Status).toBe('Accepted');
        expect(published).toEqual(['import.ready']);
        expect(engine.Source.CallsOn('source')).toHaveLength(0);
    });

    it('passes the exported manifest through the single enrichment step', () => {
        const engine = Engine();
        const manifest = engine.ExportManifest('Database');
        expect(manifest.Topics[0].Name).toBe('import.ready');
        expect(engine.Enriched).toEqual([manifest]);
    });
});
```

The proxy list is closed (03 §11): when you are tempted to add a public member to the facade, change 03 first.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/WorkQueue/engine && pnpm test driverResolution PublishListenerSet WorkQueueEngine`
Expected: FAIL — unresolved imports under `../engine/`, `../WorkQueueEngine` and `@memberjunction/work-queue-base/testing` (`SeededWorkQueueEngineBase`).

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
import { FindByID, FindByName, ToSubscriptionBinding, ToSubscriptionPolicy, ToTopicBinding } from './topology/bindings';
import type { TopologySnapshot } from './topology/bindings';
import { ValidateTopologyRows } from './topology/validateTopology';

/**
 * Browser-safe metadata tier for the work queue (03 §11): the cached topology plus the pure derivations over it.
 * The server tier (`WorkQueueEngine`, plan 05 Task 12) delegates to this instance; Explorer and the operator
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

    /** Trimmed, case-insensitive. */
    public GetTopicByName(name: string): MJWorkQueueTopicEntity | undefined {
        return FindByName(this.Topics, name);
    }

    public GetSubscriptionByName(name: string): MJWorkQueueSubscriptionEntity | undefined {
        return FindByName(this.Subscriptions, name);
    }

    public SubscriptionsForTopic(topicID: string): MJWorkQueueSubscriptionEntity[] {
        return this.Subscriptions.filter(s => UUIDsEqual(s.TopicID, topicID));
    }

    public TopicOf(subscription: MJWorkQueueSubscriptionEntity): MJWorkQueueTopicEntity | undefined {
        return FindByID(this.Topics, subscription.TopicID);
    }

    public TransportOf(topic: MJWorkQueueTopicEntity): MJWorkQueueTransportEntity | undefined {
        return FindByID(this.Transports, topic.TransportID);
    }

    public BuildTopicBinding(topic: MJWorkQueueTopicEntity): TopicBinding {
        return ToTopicBinding(topic);
    }

    public BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity,
                                    support: FilterSupport = WORK_QUEUE_FILTER_SUPPORT): SubscriptionBinding {
        return ToSubscriptionBinding(subscription, this.RequireTopic(subscription), support);
    }

    public BuildSubscriptionPolicy(subscription: MJWorkQueueSubscriptionEntity): SubscriptionPolicy {
        return ToSubscriptionPolicy(subscription, this.RequireTopic(subscription));
    }

    /** Parses the subscription's CompositeFilterDescriptor JSON against the transport's supported subset (03 §4). */
    public ParseFilter(subscription: MJWorkQueueSubscriptionEntity, support: FilterSupport): SubscriptionFilter | null {
        return this.BuildSubscriptionBinding(subscription, support).Filter;
    }

    /**
     * Validates the cached topology against capabilities supplied per `Transport.DriverClass` (03 §11). A browser
     * caller passes a static table; the server engine passes what its resolved drivers report.
     */
    public ValidateTopologyRows(capabilitiesByDriverClass: Record<string, TransportCapabilities>): BindingValidationIssue[] {
        return ValidateTopologyRows(this.Snapshot, capabilitiesByDriverClass);
    }

    private RequireTopic(subscription: MJWorkQueueSubscriptionEntity): MJWorkQueueTopicEntity {
        const topic = this.TopicOf(subscription);
        if (!topic) {
            throw new WorkQueueConfigurationError(`Subscription '${subscription.Name}' references a topic that does not exist`);
        }
        return topic;
    }
}
```

`packages/WorkQueue/base/src/testing/SeededWorkQueueEngineBase.ts` — a metadata tier that needs no provider. It ships
through the `./testing` subpath only, because this plan's engine suite and plans 06–07 all need the same seam:

```typescript
import type { UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import type { TopologySnapshot } from '../topology/bindings';
import { WorkQueueEngineBase } from '../WorkQueueEngineBase';

/**
 * TEST ONLY. Serves seeded rows instead of loading entities. The row fixtures are structural stand-ins for the
 * generated entities — every derivation in WorkQueueEngineBase reads row fields only — which is why the three getters
 * carry the one cast in this package.
 */
export class SeededWorkQueueEngineBase extends WorkQueueEngineBase {
    public static override get Instance(): SeededWorkQueueEngineBase {
        return super.getInstance<SeededWorkQueueEngineBase>();
    }

    private seeded: TopologySnapshot = { Transports: [], Topics: [], Subscriptions: [] };
    private seededUser: UserInfo | null = null;

    public Seed(snapshot: TopologySnapshot, contextUser: UserInfo): void {
        this.seeded = snapshot;
        this.seededUser = contextUser;
    }

    public override async Config(): Promise<void> {
        // Nothing to load: Seed() is the data source.
    }

    public override get Loaded(): boolean {
        return true;
    }

    public override get ContextUser(): UserInfo {
        if (!this.seededUser) {
            throw new Error('SeededWorkQueueEngineBase.Seed() has not been called');
        }
        return this.seededUser;
    }

    public override get Transports(): MJWorkQueueTransportEntity[] {
        return this.seeded.Transports as unknown as MJWorkQueueTransportEntity[];
    }

    public override get Topics(): MJWorkQueueTopicEntity[] {
        return this.seeded.Topics as unknown as MJWorkQueueTopicEntity[];
    }

    public override get Subscriptions(): MJWorkQueueSubscriptionEntity[] {
        return this.seeded.Subscriptions as unknown as MJWorkQueueSubscriptionEntity[];
    }
}
```

Append to `packages/WorkQueue/base/src/testing/index.ts`:

```typescript
export * from './SeededWorkQueueEngineBase';
```

`packages/WorkQueue/base/src/__tests__/WorkQueueEngineBase.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import { WORK_QUEUE_FILTER_SUPPORT, WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type { TransportCapabilities } from '@memberjunction/work-queue-core';
import { SUBSCRIPTION_ROW_FIXTURE, TOPIC_ROW_FIXTURE, TRANSPORT_ROW_FIXTURE } from '../testing/rowFixtures';
import { SeededWorkQueueEngineBase } from '../testing/SeededWorkQueueEngineBase';
import type { TopologySnapshot } from '../topology/bindings';

const USER = { ID: '11111111-0000-0000-0000-000000000001' } as UserInfo;
const SNAPSHOT: TopologySnapshot = { Transports: [TRANSPORT_ROW_FIXTURE], Topics: [TOPIC_ROW_FIXTURE], Subscriptions: [SUBSCRIPTION_ROW_FIXTURE] };

function Seeded(snapshot: TopologySnapshot = SNAPSHOT): SeededWorkQueueEngineBase {
    const engine = SeededWorkQueueEngineBase.Instance;
    engine.Seed(snapshot, USER);
    return engine;
}

describe('WorkQueueEngineBase', () => {
    it('looks up topics and subscriptions by trimmed, case-insensitive name', () => {
        const engine = Seeded();
        expect(engine.GetTopicByName(' IMPORT.READY ')?.Name).toBe('import.ready');
        expect(engine.GetSubscriptionByName('VENUE-IMPORT')?.Name).toBe('venue-import');
        expect(engine.SubscriptionsForTopic(TOPIC_ROW_FIXTURE.ID.toLowerCase())).toHaveLength(1);
    });

    it('navigates subscription → topic → transport, answering undefined for dangling references', () => {
        const engine = Seeded();
        const topic = engine.TopicOf(engine.Subscriptions[0]);
        expect(topic?.Name).toBe('import.ready');
        expect(topic && engine.TransportOf(topic)?.Name).toBe('Database');
        const dangling = Seeded({ ...SNAPSHOT, Topics: [] });
        expect(dangling.TopicOf(dangling.Subscriptions[0])).toBeUndefined();
    });

    it('builds bindings and policies, and parses filters against a given support', () => {
        const filter = '{"logic":"and","filters":[{"field":"tenant","operator":"startswith","value":"acme-"}]}';
        const engine = Seeded({ ...SNAPSHOT, Subscriptions: [{ ...SUBSCRIPTION_ROW_FIXTURE, Filter: filter }] });
        const subscription = engine.Subscriptions[0];
        expect(engine.BuildSubscriptionBinding(subscription).Config).toEqual({ SubscriptionID: SUBSCRIPTION_ROW_FIXTURE.ID, TopicID: TOPIC_ROW_FIXTURE.ID });
        expect(engine.BuildSubscriptionPolicy(subscription)).toMatchObject({ SubscriptionName: 'venue-import', PartitionMode: 'Ordered' });
        expect(engine.ParseFilter(subscription, WORK_QUEUE_FILTER_SUPPORT)).not.toBeNull();
        const noPrefix = { ...WORK_QUEUE_FILTER_SUPPORT, Operators: WORK_QUEUE_FILTER_SUPPORT.Operators.filter(o => o !== 'startswith') };
        expect(() => engine.ParseFilter(subscription, noPrefix)).toThrow('startswith');
    });

    it('refuses to build a binding for a subscription whose topic is missing', () => {
        const engine = Seeded({ ...SNAPSHOT, Topics: [] });
        expect(() => engine.BuildSubscriptionBinding(engine.Subscriptions[0])).toThrow(WorkQueueConfigurationError);
    });

    it('validates the topology against capabilities keyed by driver class', () => {
        const engine = Seeded();
        expect(engine.ValidateTopologyRows({})[0].Message).toContain("DriverClass 'Database'");
        const database: TransportCapabilities = {
            Filters: WORK_QUEUE_FILTER_SUPPORT, DetectsMessageIDDuplicates: true, PersistsProgress: true, SupportsOrdered: true,
            SupportsExternalHosts: false, CancelPending: true, CancelInFlight: true, ListPartitions: true, PeekDeadLetters: 'Full',
            ReplaySingleDeadLetter: true, CompletedCounts: true, MaxRetryDelaySeconds: 2147483647,
        };
        expect(engine.ValidateTopologyRows({ Database: database })).toEqual([]);
    });
});
```

- [ ] **Step 5: Write `packages/WorkQueue/engine/src/WorkQueueEngine.ts` (the facade)**

```typescript
import { randomUUID } from 'node:crypto';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJWorkQueueSubscriptionEntity, MJWorkQueueTopicEntity, MJWorkQueueTransportEntity } from '@memberjunction/core-entities';
import { BaseSingleton, NormalizeUUID } from '@memberjunction/global';
import {
    BuildTopologyManifest, FindByID, PlanBindingImport, ResolveTopic, WorkQueueEngineBase, WorkQueueEntityNames,
} from '@memberjunction/work-queue-base';
import type { BindingUpdate } from '@memberjunction/work-queue-base';
import { WorkQueueConfigurationError } from '@memberjunction/work-queue-core';
import type {
    BindingImport, BindingValidationIssue, FilterSupport, ITransportDriver, ITransportOperator, IWorkPublisher, PublishRequest,
    PublishResult, SubscriptionBinding, TopicBinding, TopologyManifest, TransportCapabilities, WorkJson,
} from '@memberjunction/work-queue-core';
import { DeduplicationLedger } from './dedup/DeduplicationLedger';
import { DriverCacheKey, ResolveDriverFactory } from './engine/driverResolution';
import { ListenerSet, PublishListenerSet } from './engine/PublishListenerSet';
import { MJWorkLogger } from './logging/MJWorkLogger';
import { WorkQueuePublishCoordinator } from './publish/WorkQueuePublishCoordinator';
import { ErrorText } from './sql/sqlExecution';
import { IsWorkQueueExecutorSource, IsWorkQueueTransactionalExecutor } from './sql/WorkQueueSqlExecutor';
import type { WorkQueueExecutorSource } from './sql/WorkQueueSqlExecutor';
import { DatabaseTransportDriver } from './transports/database/DatabaseTransportDriver';
import type { DeadLetteredEvent, TransportDriverDeps } from './transports/TransportDriverDeps';

export interface WorkQueuePublishOptions {
    ContextUser: UserInfo;
    Provider?: IMetadataProvider;
    External?: boolean;
}

interface CachedDriver {
    Key: string;
    Driver: Promise<ITransportDriver>;
}

/** Members a driver may add beyond the core contract; the Database driver has both (Task 9). */
interface ClosableDriver { Close(): Promise<void>; }
interface PrerequisiteChecker { CheckPrerequisites(): Promise<BindingValidationIssue[]>; }

function IsClosable(driver: ITransportDriver): driver is ITransportDriver & ClosableDriver {
    return 'Close' in driver && typeof driver.Close === 'function';
}

function ChecksPrerequisites(driver: ITransportDriver): driver is ITransportDriver & PrerequisiteChecker {
    return 'CheckPrerequisites' in driver && typeof driver.CheckPrerequisites === 'function';
}

/**
 * Server tier: the in-process publisher, driver registry and operator entry point (03 §11).
 *
 * 🚨 THIS CLASS IS A FACADE, NOT A SUBCLASS. Metadata lives in `WorkQueueEngineBase` (browser-safe). The proxy list
 * below is CLOSED — it is the list 03 §11 publishes. Reach anything else as `engine.Metadata.Member(…)`.
 */
export class WorkQueueEngine extends BaseSingleton<WorkQueueEngine> implements IWorkPublisher {
    public static get Instance(): WorkQueueEngine {
        return super.getInstance<WorkQueueEngine>();
    }

    private provider: IMetadataProvider | null = null;
    private readonly drivers = new Map<string, CachedDriver>();
    private readonly publishListeners = new PublishListenerSet();
    private readonly deadLetterListeners = new ListenerSet<DeadLetteredEvent>('dead-letter');
    private readonly log = new MJWorkLogger();
    private coordinator: WorkQueuePublishCoordinator | null = null;

    /** The metadata tier. Config() delegates to it. */
    public get Metadata(): WorkQueueEngineBase {
        return WorkQueueEngineBase.Instance;
    }

    /** Loads (or refreshes) the metadata tier and remembers the provider the server side runs against. */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        if (provider) {
            this.provider = provider;
        }
        await this.Metadata.Config(forceRefresh ?? false, contextUser, provider);
    }

    // ── Proxies: the COMPLETE list (03 §11). Each forwards to Metadata with the same signature. ──
    public get Transports(): MJWorkQueueTransportEntity[] { return this.Metadata.Transports; }
    public get Topics(): MJWorkQueueTopicEntity[] { return this.Metadata.Topics; }
    public get Subscriptions(): MJWorkQueueSubscriptionEntity[] { return this.Metadata.Subscriptions; }
    public GetTopicByName(name: string): MJWorkQueueTopicEntity | undefined { return this.Metadata.GetTopicByName(name); }
    public GetSubscriptionByName(name: string): MJWorkQueueSubscriptionEntity | undefined { return this.Metadata.GetSubscriptionByName(name); }
    public SubscriptionsForTopic(topicID: string): MJWorkQueueSubscriptionEntity[] { return this.Metadata.SubscriptionsForTopic(topicID); }
    public BuildTopicBinding(topic: MJWorkQueueTopicEntity): TopicBinding { return this.Metadata.BuildTopicBinding(topic); }
    public BuildSubscriptionBinding(subscription: MJWorkQueueSubscriptionEntity, support?: FilterSupport): SubscriptionBinding {
        return this.Metadata.BuildSubscriptionBinding(subscription, support);
    }

    // ── Server-only ──

    /** ONE cached instance per transport, however it is reached. A changed transport builds a new driver and closes the old one. */
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
        if (cached) {
            await this.Evict(cacheID, cached);
        }
        const driver = ResolveDriverFactory(transport.DriverClass).Create(transport, this.DriverDeps());
        this.drivers.set(cacheID, { Key: key, Driver: driver });
        driver.catch(() => this.drivers.delete(cacheID));
        return driver;
    }

    public async GetOperator(subscription: MJWorkQueueSubscriptionEntity): Promise<ITransportOperator> {
        const topic = this.Metadata.TopicOf(subscription);
        if (!topic) {
            throw new WorkQueueConfigurationError(`Subscription '${subscription.Name}' references a topic that does not exist`);
        }
        return (await this.GetDriver(topic.TransportID)).Operator();
    }

    /** Topology rows + capability gating + driver ValidateBindings + database prerequisites (RCSI, 03 §6). */
    public async ValidateTopology(): Promise<BindingValidationIssue[]> {
        const issues: BindingValidationIssue[] = [];
        const capabilities: Record<string, TransportCapabilities> = {};
        const resolved = new Map<string, ITransportDriver>();
        for (const transport of this.Transports) {
            try {
                const driver = await this.GetDriver(transport.ID);
                capabilities[transport.DriverClass] = driver.Capabilities;
                resolved.set(NormalizeUUID(transport.ID), driver);
            } catch (error) {
                issues.push({ Severity: 'Error', Subject: transport.Name, Message: ErrorText(error) });
            }
        }
        issues.push(...this.Metadata.ValidateTopologyRows(capabilities));
        for (const driver of new Set(resolved.values())) {
            if (ChecksPrerequisites(driver)) {
                issues.push(...await driver.CheckPrerequisites());
            }
        }
        issues.push(...await this.ValidateBindings(resolved));
        return issues;
    }

    public PublishAs<T extends WorkJson>(topic: string, requests: PublishRequest<T>[], options: WorkQueuePublishOptions): Promise<PublishResult[]> {
        const provider = options.Provider;
        return this.Coordinator().Publish(topic, requests, {
            UserID: options.ContextUser?.ID ?? null,
            External: options.External === true,
            CallerExecutor: provider && IsWorkQueueTransactionalExecutor(provider) ? provider : null,
        });
    }

    public Publish<T extends WorkJson>(topic: string, requests: PublishRequest<T>[]): Promise<PublishResult[]> {
        return this.PublishAs(topic, requests, { ContextUser: this.SystemUser });
    }

    /** Host Kick hook (plan 06); returns unsubscribe. */
    public OnPublished(listener: (topicName: string) => void): () => void {
        return this.publishListeners.Add(listener);
    }

    /**
     * Autoscaler metric (03 §11): claimable Pending (partition rules applied) + InFlight, each capped at 1000.
     * Cloud subscriptions answer `Supported: false` — scale those from the broker's own metrics.
     */
    public async GetBacklog(subscriptionName: string): Promise<{ Supported: boolean; Claimable: number; InFlight: number; Total: number; Capped: boolean }> {
        const subscription = this.GetSubscriptionByName(subscriptionName);
        const topic = subscription && this.Metadata.TopicOf(subscription);
        if (!subscription || !topic) {
            throw new WorkQueueConfigurationError(`Work-queue subscription '${subscriptionName}' does not exist`);
        }
        const driver = await this.GetDriver(topic.TransportID);
        if (!(driver instanceof DatabaseTransportDriver)) {
            return { Supported: false, Claimable: 0, InFlight: 0, Total: 0, Capped: false };
        }
        const counts = await driver.GetBacklog(this.BuildSubscriptionBinding(subscription));
        return { Supported: true, ...counts, Total: counts.Claimable + counts.InFlight };
    }

    /** Public (F13): drivers call it through TransportDriverDeps, and plan 06's sweeper calls it directly. */
    public NotifyDeadLettered(event: DeadLetteredEvent): void {
        this.deadLetterListeners.Notify(event);
    }

    /** IN-PROCESS ONLY (03 §11): fires for dead letters produced by this process. Alert durably from subscription stats. */
    public OnDeadLettered(listener: (event: DeadLetteredEvent) => void): () => void {
        return this.deadLetterListeners.Add(listener);
    }

    public ExportManifest(transportName: string): TopologyManifest {
        return this.EnrichManifest(BuildTopologyManifest(this.Metadata.Snapshot, transportName, new Date()));
    }

    /** Re-reads metadata as the engine's system user; the caller's user is used only for the entity saves. */
    public async ImportBindings(bindings: BindingImport, contextUser: UserInfo): Promise<BindingValidationIssue[]> {
        const plan = PlanBindingImport(this.Metadata.Snapshot, bindings);
        const issues = [...plan.Issues];
        for (const update of plan.TopicUpdates) {
            issues.push(...await this.SaveBinding(WorkQueueEntityNames.Topics, update, contextUser));
        }
        for (const update of plan.SubscriptionUpdates) {
            issues.push(...await this.SaveBinding(WorkQueueEntityNames.Subscriptions, update, contextUser));
        }
        await this.Config(true, this.SystemUser, this.Provider);
        issues.push(...await this.ValidateTopology());
        return issues;
    }

    /** Closes every cached driver and the publish coordinator, releasing their independent executors (F8). */
    public async Shutdown(): Promise<void> {
        const cached = [...this.drivers.entries()];
        this.drivers.clear();
        for (const [cacheID, entry] of cached) {
            await this.Evict(cacheID, entry);
        }
        const coordinator = this.coordinator;
        this.coordinator = null;
        await coordinator?.Close();
    }

    /**
     * The single manifest post-processing step. Transport-neutral here; plan 07 replaces the body with
     * `ManifestEnricherRegistry.Instance.Apply(manifest)` so the `./aws` entry can add `Aws.SnsFilterPolicy`.
     */
    protected EnrichManifest(manifest: TopologyManifest): TopologyManifest {
        return manifest;
    }

    /** The shared server provider. Used ONLY to mint independent executors and as PublishAs's default (03 §11). */
    protected get Executor(): WorkQueueExecutorSource {
        const provider = this.Provider;
        if (!IsWorkQueueExecutorSource(provider)) {
            throw new WorkQueueConfigurationError('WorkQueueEngine requires a server-side database provider (DatabaseProviderBase)');
        }
        return provider;
    }

    private get Provider(): IMetadataProvider {
        return this.provider ?? this.Metadata.ProviderToUse;
    }

    /** Server-side, BaseEngine.ContextUser is the MJ system user. */
    private get SystemUser(): UserInfo {
        return this.Metadata.ContextUser;
    }

    private Coordinator(): WorkQueuePublishCoordinator {
        this.coordinator ??= new WorkQueuePublishCoordinator({
            ResolveTopic: name => ResolveTopic(this.Metadata.Snapshot, name),
            GetDriver: transportID => this.GetDriver(transportID),
            Executor: this.Executor,
            // Ledger SQL runs as the system user; the publisher's identity travels as CoordinatorPublishOptions.UserID.
            CreateLedger: executor => new DeduplicationLedger(executor, this.SystemUser),
            NewID: () => randomUUID(),
            Now: () => new Date(),
            NotifyPublished: name => this.publishListeners.Notify(name),
            Log: this.log,
        });
        return this.coordinator;
    }

    private DriverDeps(): TransportDriverDeps {
        return {
            ContextUser: this.SystemUser, Executor: this.Executor, Log: this.log,
            NotifyDeadLettered: event => this.NotifyDeadLettered(event),
        };
    }

    private async Evict(cacheID: string, entry: CachedDriver): Promise<void> {
        this.drivers.delete(cacheID);
        try {
            const driver = await entry.Driver;
            if (IsClosable(driver)) {
                await driver.Close();
            }
        } catch (error) {
            this.log.Warn(`Closing the replaced work-queue driver failed: ${ErrorText(error)}`);
        }
    }

    private async ValidateBindings(resolved: Map<string, ITransportDriver>): Promise<BindingValidationIssue[]> {
        const issues: BindingValidationIssue[] = [];
        for (const topic of this.Topics.filter(t => t.Status === 'Active')) {
            const driver = resolved.get(NormalizeUUID(topic.TransportID));
            if (!driver) {
                continue;                                   // already reported as an unavailable driver
            }
            try {
                const subscriptions = this.SubscriptionsForTopic(topic.ID)
                    .filter(s => s.Status !== 'Disabled')
                    .map(s => this.BuildSubscriptionBinding(s, driver.Capabilities.Filters));
                issues.push(...await driver.ValidateBindings(this.BuildTopicBinding(topic), subscriptions));
            } catch {
                // Unparseable filter or binding JSON: ValidateTopologyRows has already named it.
            }
        }
        return issues;
    }

    private async SaveBinding(entityName: string, update: BindingUpdate, contextUser: UserInfo): Promise<BindingValidationIssue[]> {
        const entity = entityName === WorkQueueEntityNames.Topics
            ? await this.Provider.GetEntityObject<MJWorkQueueTopicEntity>(entityName, contextUser)
            : await this.Provider.GetEntityObject<MJWorkQueueSubscriptionEntity>(entityName, contextUser);
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

`BaseSingleton` gives the facade its `Instance` but no loading machinery, so the system user and the default provider
come from the metadata tier (or, for the provider, from whatever `Config()` was handed). Anything that reaches the
database goes through `Executor`, which refuses a browser provider — and `Executor` itself never runs queue SQL: drivers,
the coordinator and the sweeper mint independent executors from it (03 §11, F8).

**Entry-point rule (F12).** `WorkQueueEngine.ts` and everything it imports stay free of `@memberjunction/work-queue-aws`
and `@aws-sdk/*`: the AWS factory registers itself from the `./aws` subpath plan 07 adds, and reaches the engine only
through `BaseTransportDriverFactory` and `EnrichManifest`. `engineEntryGuard.test.ts` (Task 2) enforces it.

- [ ] **Step 6: Export the new modules**

Append to `packages/WorkQueue/base/src/index.ts`:

```typescript
export * from './WorkQueueEngineBase';
```

Append to `packages/WorkQueue/engine/src/index.ts` (no re-export of `WorkQueueEngineBase` — import it from the base package):

```typescript
export * from './engine/driverResolution';
export * from './engine/PublishListenerSet';
export * from './WorkQueueEngine';
```

- [ ] **Step 7: Run the tests and build**

Run: `cd packages/WorkQueue/base && pnpm test && pnpm run build`
Expected: PASS — previous base suites plus WorkQueueEngineBase (5); builds.

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — previous suites plus driverResolution (3), PublishListenerSet (3), WorkQueueEngine (13) and engineEntryGuard still green.

Run: `cd packages/WorkQueue/engine && pnpm run build`
Expected: builds. `ImportBindings`/`SaveBinding` are the only facade members without a unit test — they need a live provider — and are covered end to end by Task 13's harness and plan 06's integration bundle.

- [ ] **Step 8: Commit**

```bash
git add packages/WorkQueue/base/src packages/WorkQueue/engine/src
git commit -m "feat(work-queue): WorkQueueEngineBase metadata tier and the server WorkQueueEngine facade"
```

---

### Task 13: Database conformance harness, filter parity, full build and changeset

**Files:**
- Create: `packages/WorkQueue/engine/src/testing/DatabaseConformanceHarness.ts`
- Modify: `packages/WorkQueue/engine/src/index.ts`
- Test: `packages/WorkQueue/engine/src/__tests__/DatabaseConformanceHarness.test.ts`, `src/__tests__/filterParity.test.ts`
- Create: `.changeset/work-queue-native-data-layer.md`

**Interfaces:**
- Consumes: `DatabaseTransportDriver`, `DATABASE_TRANSPORT_CAPABILITIES` (Task 9); `ToTopicBinding`, `ToSubscriptionBinding` (Task 11); `CreateWorkQueueSqlBuilder` (Task 6); `ExecuteWrite`, `QualifiedTable`, `SqlParamList`, `WorkQueueTables` (Task 2); `WorkQueueEntityNames` (Task 2, base); `OwnedExecutor` (Task 8); `MJWorkLogger` (Task 10); type-only from `@memberjunction/work-queue-core/testing` (plan 04 Task 8): `ConformanceHarness`, `ConformanceTraits`, `SubscriptionBindingOverrides`.
- Produces:
  - `DATABASE_CONFORMANCE_TRAITS: ConformanceTraits` = `{ ReleaseConsumesAttempt: false, ExpiredLeaseDeadLetters: true, ReceiveWaitSeconds: 0 }`
  - `SecondsToShift(ms: number): number`
  - `type ConformanceProvider = WorkQueueExecutorSource & Pick<IMetadataProvider, 'GetEntityObject'>`
  - `interface DatabaseConformanceHarness extends ConformanceHarness { Cleanup(): Promise<void> }`
  - `CreateDatabaseConformanceHarness(provider: ConformanceProvider, contextUser: UserInfo, transportID?: string): Promise<DatabaseConformanceHarness>` — plan 06's integration bundle runs `RunTransportConformanceSuite('Database', harness)` or its own runner against it

The harness writes real topic and subscription rows (the Database driver needs the foreign keys) on the seeded `Database` transport, `HostType = 'MJWorker'`, `HandlerKey = 'WorkQueueConformance'`. `AdvanceTime(ms)` cannot move the database clock, so it shifts each harness subscription's `VisibleAt` and `LeaseExpiresAt` back by `ceil(ms / 1000)` seconds. `Cleanup()` deletes the harness's deliveries, messages, deduplication rows, subscriptions and topics, closes the drivers it created and releases its executor; `Dispose` is a no-op so one cleanup at the end of the suite removes everything. The harness's own SQL (`AdvanceTime`, the cleanup deletes) runs on an **independent executor it owns**, never on the shared provider (03 §11, F8). Type-only imports from `/testing` keep Vitest out of the engine's runtime bundle.

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
import { ToSubscriptionBinding, ToTopicBinding, WorkQueueEntityNames } from '@memberjunction/work-queue-base';
import { WorkQueueTables } from '../constants';
import type { WorkQueueTableName } from '../constants';
import { MJWorkLogger } from '../logging/MJWorkLogger';
import { CreateWorkQueueSqlBuilder } from '../sql/CreateWorkQueueSqlBuilder';
import { SqlParamList } from '../sql/SqlParamList';
import { ExecuteWrite, QualifiedTable } from '../sql/sqlExecution';
import type { WorkQueueExecutorSource, WorkQueueSqlExecutor } from '../sql/WorkQueueSqlExecutor';
import { OwnedExecutor } from '../transports/OwnedExecutor';
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
    const drivers: DatabaseTransportDriver[] = [];
    const sql = CreateWorkQueueSqlBuilder(provider);
    const owned = new OwnedExecutor(provider);
    const deps = { ContextUser: contextUser, Executor: provider, Log: new MJWorkLogger('[WorkQueueConformance]') };

    return {
        Capabilities: DATABASE_TRANSPORT_CAPABILITIES,
        Traits: DATABASE_CONFORMANCE_TRAITS,
        CreateDriver: async (): Promise<ITransportDriver> => {
            const driver = new DatabaseTransportDriver(provider, deps);
            drivers.push(driver);
            return driver;
        },
        CreateTopic: async (driver: ITransportDriver, name: string, overrides: Partial<TopicBinding> = {}): Promise<TopicBinding> => {
            const topic = await provider.GetEntityObject<MJWorkQueueTopicEntity>(WorkQueueEntityNames.Topics, contextUser);
            topic.NewRecord();
            topic.Name = name;
            topic.TransportID = transportID;
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
                await ExecuteWrite(await owned.Get(), sql.Consume.ShiftTimestampsForConformance(subscription.ID, SecondsToShift(ms)), contextUser);
            }
        },
        Dispose: async (): Promise<void> => undefined,
        Cleanup: async (): Promise<void> => {
            for (const driver of drivers.splice(0)) {
                await driver.Close();
            }
            await DeleteRuntimeRows(await owned.Get(), contextUser, subscriptions.map(s => s.ID), topics.map(t => t.ID));
            await owned.Release();
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
}

async function SaveOrThrow(entity: MJWorkQueueTopicEntity | MJWorkQueueSubscriptionEntity, name: string): Promise<void> {
    if (!(await entity.Save())) {
        throw new Error(`Conformance setup could not save '${name}': ${entity.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
}

/** Deliveries first: they reference messages. */
async function DeleteRuntimeRows(executor: WorkQueueSqlExecutor, contextUser: UserInfo, subscriptionIDs: string[], topicIDs: string[]): Promise<void> {
    await DeleteWhereIn(executor, contextUser, WorkQueueTables.Delivery, 'SubscriptionID', subscriptionIDs);
    const byTopic: WorkQueueTableName[] = [WorkQueueTables.Message, WorkQueueTables.Deduplication];
    for (const table of byTopic) {
        await DeleteWhereIn(executor, contextUser, table, 'TopicID', topicIDs);
    }
}

async function DeleteWhereIn(executor: WorkQueueSqlExecutor, contextUser: UserInfo, table: WorkQueueTableName, column: string, ids: string[]): Promise<void> {
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
Expected: PASS — dependency guard (3), entityValidation (11), topology (8), manifest (4) and WorkQueueEngineBase (5): 31 tests, 0 failures.

Run: `cd packages/WorkQueue/engine && pnpm test`
Expected: PASS — every suite from Tasks 2–13 including DatabaseConformanceHarness (2), filterParity (10) and engineEntryGuard (2), 0 failures.

Run:
```bash
cd packages/MJCoreEntities && pnpm run build
cd ../WorkQueue/core && pnpm run build
cd ../base && pnpm run build
cd ../engine && pnpm run build
```
Expected: all four build with no errors (`base` before `engine`).

Run (repository root): `node .github/scripts/check-migration-entityfield-sequence.mjs` and `npm run check:codegen-tail`
Expected: both exit 0.

Run (repository root): `git status --short packages/MJAPI/src/generated packages/MJExplorer/src/app/generated packages/GeneratedEntities mj.config.cjs`
Expected: nothing from those paths is added to the index — they are local host artifacts and never part of this branch.

- [ ] **Step 6: Write the changeset**

`.changeset/work-queue-native-data-layer.md`:

```markdown
---
"@memberjunction/core-entities": minor
"@memberjunction/work-queue-base": minor
"@memberjunction/work-queue-engine": minor
---

Add the durable work queue's database layer: six work-queue tables and entities (transports, topics, subscriptions, messages, deliveries and the deduplication ledger), `workqueue:*` API scopes, the seeded `Database` transport, the browser-safe `@memberjunction/work-queue-base` metadata tier (`WorkQueueEngineBase`, topology rows, binding builders, filter and topology validation, manifest export), and `@memberjunction/work-queue-engine` with SQL Server and PostgreSQL statement builders, the Database transport driver, consumer and operator, the deduplication ledger, the sweep lock, and the server `WorkQueueEngine` facade.
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

Revision 4 folded the earlier deltas (ND1–ND22) into 03, or removed them with the features they described: explicit
sequencing, the partition-state table and the staging insert for ordered cloud subscriptions were **removed in
Revision 4** (cuts S1 and S2), so nothing in this plan refers to them. What remains open against the rewritten 03 and
the neighbouring plans:

| # | Delta | Who must act |
| --- | --- | --- |
| ND1 | **Sweep lock is transaction-owned, not session-level.** 03 §7 and plan 06 describe `sp_getapplock @LockOwner = 'Session'` / `pg_try_advisory_lock`. MJ providers pool connections, and only a transaction pins one, so `TryAcquireSweepLock(source, contextUser): Promise<SweepLock \| null>` (`src/sql/sweepLock.ts`) holds a transaction open on a private independent executor (`@LockOwner = 'Transaction'` / `pg_try_advisory_xact_lock`) and hands back a **second** independent executor as `SweepLock.Executor`. Name, module, signature and `SweepLock { Executor; Release() }` are exactly what plan 06 Task 4 imports; only the lock owner differs. | 03 §7 wording; plan 06 prose (no code change) |
| ND2 | **Enlisted publishes rethrow every database error**, not only transient ones (03 §11 says "transient"). The caller owns the transaction, and on PostgreSQL any error dooms it, so reporting `TransportUnavailable` would invite a retry inside a dead transaction. Applies to `DatabaseTransportDriver.Publish` with `Executor` set and to `WorkQueuePublishCoordinator` with `CallerExecutor`. | 03 §11 |
| ND3 | **Driver members beyond `ITransportDriver`:** `DatabaseTransportDriver` adds `InstanceID`, `AcquirePublishOrderLocks(topic, messages, subscriptions, executor)`, `GetBacklog(subscription)`, `CheckPrerequisites()` and `Close()`; `DatabaseTransportOperator` adds `GetBacklog`, `CheckPrerequisites`, `Close`. The engine reaches them through structural guards (`IsClosable`, `ChecksPrerequisites`, `PublishOrderLocker`), so a cloud driver may implement `Close()`/`CheckPrerequisites()` and gets the same treatment. | plan 07 (optional `Close()` on the AWS driver) |
| ND4 | **`WorkQueueEngine.Shutdown()`** is added to the 03 §11 surface: it closes cached drivers and the publish coordinator (F8 needs somewhere to release their executors). Plan 06's host should call it on stop. The protected **`EnrichManifest(manifest)`** is the single step `ExportManifest` runs after `BuildTopologyManifest`; this plan does **not** create `ManifestEnricherRegistry` — plan 07 Task 8 creates it and replaces `EnrichManifest`'s body with `ManifestEnricherRegistry.Instance.Apply(manifest)`. | 03 §11; plans 06, 07 |
| ND5 | **`BuildTopologyManifest`, `PlanBindingImport`, `BindingUpdate`, `BindingImportPlan` live in `@memberjunction/work-queue-base`** (`src/topology/manifest.ts`), not in the engine, and the engine re-exports nothing. Plan 07 Task 8's test imports `BuildTopologyManifest` from `'../topology/manifest'` — change that to `'@memberjunction/work-queue-base'`. | plan 07 |
| ND6 | **Row fixtures ship only from `@memberjunction/work-queue-base/testing`** as `TRANSPORT_ROW_FIXTURE`, `TOPIC_ROW_FIXTURE`, `SUBSCRIPTION_ROW_FIXTURE`, together with `SeededWorkQueueEngineBase`. They are not in the base production index, and the engine's `fakes.ts` no longer aliases them as `TRANSPORT_ROW` / `TOPIC_ROW` / `SUBSCRIPTION_ROW`. Plan 07 Task 8 imports them from `'@memberjunction/work-queue-base'` and lists the short aliases among plan 05's fakes — both must switch to the `/testing` subpath. | plans 06, 07 |
| ND7 | **No engine re-exports (F13).** `TransportRow`, `TopicRow`, `SubscriptionRow`, validators, binding builders, `ResolveTopic`, `ValidateTopologyRows`, `WorkQueueEngineBase`, `IsWorkJson`, `WorkQueueEntityNames` and `DATABASE_DRIVER_CLASS` are imported from `@memberjunction/work-queue-base`. | plans 06–08 imports |
| ND8 | **`ValidateTopologyRows(snapshot, capabilitiesByDriverClass: Record<string, TransportCapabilities>)`** — the standalone function takes the same driver-class record as the 03 §11 method; a class with no entry is reported per topic as an unavailable driver. `WorkQueueEngineBase` also exposes `get Snapshot(): TopologySnapshot`. | 03 §11 (mention `Snapshot`) |
| ND9 | **Builder surface 03 does not name:** `PreparePublishOrderLock(timeoutMs)` (PostgreSQL `set_config('lock_timeout', …, true)`; `null` on SQL Server, which passes the timeout to `sp_getapplock`), `SelectMessage`, `SelectDeduplicationOwner`, `SelectLeaseState`, `SelectPartitionCandidates` + `ClaimPartitionCandidate`, `AcquireSweepLock`, `ReadCommittedSnapshotState`. `ExpireLeasesAll(batchSize = 500)` — plan 06 calls it with no argument. `ExpiredDeadLetterRow` carries `Reason` in addition to the three fields plan 06 reads. | none (additive) |
| ND10 | **"One row per key per batch" is enforced in TypeScript.** The candidate scan is a bounded, index-ordered `TOP`/`LIMIT` (no window function), so for `Exclusive` it can return several rows of one key; the consumer over-scans (`CANDIDATE_OVERSCAN = 4`), keeps the first candidate per key and treats a unique violation on `UQ_WorkQueueDelivery_InFlightPartition` as "another worker won this key" for that candidate only. | 03 §7 (describe the mechanism) |
| ND11 | **`SubscriptionStats.OldestPendingAgeSeconds` is measured from `VisibleAt`**, which the per-status index can seek, not from the message's `PublishedAt`; a delivery waiting out a retry backoff therefore does not count as old. | 03 §5.2 |
| ND12 | **UI read access** to Messages and Deliveries is revoked through `metadata/entity-permissions/.work-queue-permissions.json` (CodeGen's permission defaults grant the `UI` role read on every new entity); `metadata/.mj-sync.json` `directoryOrder` gains `work-queue-transports` then `work-queue-topics` (the folder plan 08 adds), ahead of `entities`. | 03 §6.7 |
| ND13 | **Driver-owned guard message** is `'work-queue delivery state is managed by the transport driver; use the operator API (Replay / Discard)'`, and `PartitionMode` immutability (F11) is enforced in `MJWorkQueueSubscriptionEntityServer.ValidateAsync()` — it needs a read, which the synchronous `Validate()` 03 §3.1 names cannot do. | 03 §3.1 |
| ND14 | Plan 08's bridge consumes `WorkQueueEngine.Instance.Metadata`, `GetTopicByName` and `PublishAs` — all present with the 03 §11 signatures. `BaseWorkHandler` is plan 04/06's; this plan neither defines nor changes it. | none |

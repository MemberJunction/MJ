# Database Provider Refactoring Plan

## Context
Code review of `postgres-5-0-implementation` branch identified significant code duplication between SQLServerDataProvider and PostgreSQLDataProvider. This plan refactors shared logic into DatabaseProviderBase (MJCore) and a new `@memberjunction/generic-database-provider` package.

## Phase 1: Quick Wins (Commit 1)
- [x] **Task 1**: Remove Phase markers from databaseProviderBase.ts (9 locations)
- [x] **Task 2**: Make RenderViewWhereClause dialect-neutral (uses QuoteIdentifier/QuoteSchemaAndView instead of [brackets]). Full move to `@memberjunction/generic-database-provider` in Phase 3 (Task 9) — that package can depend on MJCoreEntities.
- [x] **Task 3**: Delete old PG Python conversion scripts from scripts/ folder (kept active utility scripts like scaffold-tests.mjs, fix-missing-dependencies.mjs)

## Phase 2: Medium Effort (Commit 2)
- [x] **Task 4**: Make UUID/default function patterns abstract getter properties
- [x] **Task 5**: Fix FormatValueInternal for PG types in util.ts
- [x] **Task 6**: Fix SQLFullType/SQLMaxLength PG gaps in util.ts
- [x] **Task 7**: ProcessEntityRows — analyzed, stays in providers. Datetime handling is SQL Server-specific; encryption logic moves to generic-database-provider in Phase 3 (Task 9). Base class already has correct `PostProcessRows` hook.

## Phase 3: Larger Refactoring (Commit 3)
- [x] **Task 8**: Refactor InternalRunView into base class with abstract methods — DONE. Moved InternalRunView, InternalRunViews, getRunTimeViewFieldString, getRunTimeViewFieldArray, createViewUserSearchSQL to GenericDatabaseProvider with dialect-neutral SQL. Added abstract BuildPaginationSQL (SQL Server: OFFSET/FETCH, PG: LIMIT/OFFSET), virtual BuildTopClause (SQL Server: TOP N, PG: empty), virtual BuildNonPaginatedLimitSQL (PG: LIMIT N), virtual TransformExternalSQLClause (PG: quotes mixed-case identifiers), virtual executeSQLForUserViewRunLogging (SQL Server: spCreateUserViewRunWithDetail). PG gets full view features for free: saved views, permissions, aggregates, RLS, search, encryption. 17 tests in GenericDatabaseProvider, all 83 SQLServer + 60 PG + 519 MJCore tests pass.
- [x] **Task 9**: Create `@memberjunction/generic-database-provider` package — DONE. Contains: HandleEntityActions, HandleEntityAIActions, GetEntityAIActions, EnqueueAfterSaveAIAction (virtual for transaction deferral), OnValidateBeforeSave, OnBeforeSave/AfterSave/BeforeDelete/AfterDelete Execute hooks, PostProcessRows (encryption decryption), RenderViewWhereClause. Both SQL Server and PG providers now extend GenericDatabaseProvider. SQL Server overrides EnqueueAfterSaveAIAction for transaction-deferred task logic.
- [x] **Task 10**: Refactor remaining methods (Load, GetDatasetByName, RunViewsWithCacheCheck, RunQueriesWithCacheCheck) — DONE. Moved to GenericDatabaseProvider: isCacheCurrent, RunViewsWithCacheCheck (with buildWhereClauseForCacheCheck, getBatchedServerCacheStatus, runFullQueryAndReturn, runDifferentialQueryAndReturn, getDeletedRecordIDsSince, getUpdatedRowsSince), RunQueriesWithCacheCheck (with resolveQueryInfo, findQueryInEngine, refreshQueryInfoFromEntity, resolveCategoryPath, getBatchedQueryCacheStatus, runFullQueryAndReturnForQuery), Load (with char trimming, relationship loading, PostProcessRows), GetDatasetByName (with BuildParameterPlaceholder, getColumnsForDatasetItem). All use dialect-neutral quoting via QuoteIdentifier/QuoteSchemaAndView. Virtual methods getBatchedServerCacheStatus, getBatchedQueryCacheStatus default to parallel individual queries (PG-compatible); SQL Server overrides for ExecuteSQLBatch multi-result-set batching. SQL Server also overrides GetDatasetByName for batch optimization, BuildParameterPlaceholder for @p-style params. Removed 13 methods from SQL Server, added 1 new override. 36 tests in GenericDatabaseProvider, all 83 SQL Server + 60 PG + 519 MJCore tests pass (698 total).

## Phase 4: PG Provider Update (Commit 4)
- [x] **Task 11**: Refactor PG data provider to use new base class / generic provider — DONE. Removed 13 methods now inherited from GenericDatabaseProvider: Load, GetDatasetByName, RunViewsWithCacheCheck, getBatchedServerCacheStatus, isCacheCurrent, runFullQueryAndReturn, runDifferentialQueryAndReturn, getDeletedRecordIDsSince, getUpdatedRowsSince, buildWhereClauseForCacheCheck, buildPKWhereClause, formatFieldValue, viewName. Removed 8 unused imports. PG now inherits: PostProcessRows (encryption), char field trimming, relationship loading in Load, full cache check suite. All 60 PG tests + 519 MJCore + 83 SQL Server + 36 GenericDP tests pass (698 total).

---

## Detailed Task Descriptions

### Task 1: Remove Phase Markers
**File**: `packages/MJCore/src/generic/databaseProviderBase.ts`
**Lines**: 785, 1046, 1050, 1461, 1589, 1593, 1785, 1789, 1834
**Action**: Remove "(Phase X)" from comment blocks. Mechanical change, no logic affected.

### Task 2: Move RenderViewWhereClause to DatabaseProviderBase
**Source**: `SQLServerDataProvider.ts` line 1437
**Target**: `databaseProviderBase.ts`
**Why**: 100% generic - no SQL Server-specific code. Uses template variable `{%variable%}` replacement and recursive view WHERE clause resolution.
**Dependencies**: Need to add abstract method for building schema-qualified view references since SQL Server uses `[brackets]` and PG uses `"quotes"`.
**Testing**: Existing SQLServerDataProvider tests should still pass.

### Task 3: Delete scripts/ folder
**Path**: `/scripts/` (repo root)
**Why**: Contains old Python-based PG conversion scripts superseded by `@memberjunction/sql-converter`
**Note**: Git history preserves these. NOT deleting `docker/workbench/workspace/MJ/scripts/` (that's a Docker copy).

### Task 4: Abstract UUID/Default Function Patterns
**File**: `packages/MJCore/src/generic/databaseProviderBase.ts` lines 177-188
**Action**: Convert `_uuidFunctionPattern` and `_dbDefaultFunctionPattern` from `private static readonly` fields to abstract getter methods. Each subclass implements with platform-specific patterns.
**SQL Server patterns**: NEWID, NEWSEQUENTIALID, GETDATE, GETUTCDATE, etc.
**PG patterns**: gen_random_uuid, uuid_generate_v4, NOW, CURRENT_TIMESTAMP, etc.

### Task 5: Fix FormatValueInternal for PG Types
**File**: `packages/MJCore/src/generic/util.ts` line 78
**Missing PG types**: numeric, bigint, smallint, timestamp, timestamptz, boolean, uuid, text, jsonb, json, interval, bytea
**Action**: Add case handlers for PG type names that map to existing formatting logic where applicable (e.g., `numeric` → same as `decimal`, `timestamp/timestamptz` → same as `datetime`).

### Task 6: Fix SQLFullType/SQLMaxLength PG Gaps
**File**: `packages/MJCore/src/generic/util.ts` lines 128, 154
**SQLFullType**: Add PG text type handling (no max length needed)
**SQLMaxLength**: Handle PG text (unlimited), PG varchar without length = unlimited

### Task 7: Move ProcessEntityRows to DatabaseProviderBase
**Source**: `SQLServerDataProvider.ts` line 3958
**Why**: ~95% generic. The only SQL Server-specific part is DATETIMEOFFSET adjustment.
**Approach**: Move to base with virtual hook for provider-specific row processing (datetime offset, etc.). Encryption logic stays in base.

### Task 8: Refactor InternalRunView
**Source**: `SQLServerDataProvider.ts` line 1489
**Why**: ~85% generic. Orchestration (permissions, view resolution, aggregates) is DB-agnostic.
**Approach**: Move orchestration to DatabaseProviderBase. Extract abstract methods for:
- `BuildViewSelectSQL()` - builds the SELECT statement with provider-specific syntax
- `BuildPaginationSQL()` - TOP vs LIMIT/OFFSET
- `ExecuteViewQuery()` - executes and returns typed results

### Task 9: Create generic-database-provider Package
**Path**: `packages/GenericDatabaseProvider/`
**Why**: Methods that can't go in MJCore due to heavy dependencies (ActionEngine, AIEngine, EncryptionEngine) but are shared between SQL Server and PG providers.
**Contents**:
- HandleEntityActions shared logic
- HandleEntityAIActions shared logic
- Encryption field processing
- Any other shared logic needing deps beyond MJCore

### Task 10: Refactor Remaining Methods
Move to DatabaseProviderBase (with abstract hooks for DB-specific parts):
- `Load()` (~65% generic) - SQL construction is specific, orchestration is generic
- `GetDatasetByName()` (~70% generic) - SQL is specific, filtering/mapping is generic
- `RunViewsWithCacheCheck()` (~80% generic) - cache strategy is generic, WHERE building is specific
- `RunQueriesWithCacheCheck()` (~80% generic) - cache validation is generic, SQL execution is specific

### Task 11: Refactor PG Data Provider
After all above refactoring:
- Remove duplicated methods now in DatabaseProviderBase
- Implement new abstract methods (BuildViewSelectSQL, BuildPaginationSQL, etc.)
- Implement abstract getter properties (UUID/default patterns)
- Use GenericDatabaseProvider shared logic
- Significantly reduced code size (estimated ~40% reduction)

---

## Testing Strategy
- After each phase, build affected packages: `npm run build`
- Run unit tests: `npm run test` in each modified package
- Add new tests for moved/refactored methods
- Final integration testing in Docker with both SQL Server and PG

## Packages Affected
- `@memberjunction/core` (MJCore)
- `@memberjunction/sqlserver-dataprovider`
- `@memberjunction/postgresql-dataprovider`
- `@memberjunction/generic-database-provider` (NEW)

## Status
- **Started**: 2026-02-28
- **Current Phase**: ALL PHASES COMPLETE (Tasks 1-11 done)
- **Last Updated**: 2026-02-28

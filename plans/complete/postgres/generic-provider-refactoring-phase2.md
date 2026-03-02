# Generic Provider Refactoring — Phase 2

## Goal
Make GenericDatabaseProvider do nearly everything. SQL Server and PG leaf providers should be "insanely thin" — just defining SQL and overriding platform-specific behaviors.

## Tasks

### Task A: Add ExecuteSQLBatch to GenericDatabaseProvider [pending]
**Why**: SQL Server uses `ExecuteSQLBatch` for multi-result-set efficiency (single round-trip). PG doesn't have it, forcing method overrides for batch-aware code. By adding a default `ExecuteSQLBatch` in GenericDP (parallel `ExecuteSQL` calls), we can move all batch-using code to the generic layer.
**Changes**:
- GenericDP: Add `ExecuteSQLBatch(queries, parameters?, options?, contextUser?)` — default implementation runs queries via `Promise.all(ExecuteSQL(...))` and returns `any[][]`
- SQL Server: Keeps its existing override (true multi-result-set batch via mssql)
- PG: Implement `ExecuteSQLBatch` — can use parallel `ExecuteSQL` calls or pg pipeline if beneficial
- Move `ExecuteSQLBatchOptions` type to GenericDP (or a shared types location)
**Tests**: Add GenericDP tests for default ExecuteSQLBatch behavior

### Task B: Consolidate GetDatasetByName into GenericDP [pending]
**Why**: SQL Server overrides `GetDatasetByName` only to use `ExecuteSQLBatch`. With Task A done, the generic implementation can call `ExecuteSQLBatch` directly and SQL Server's override becomes unnecessary.
**Changes**:
- GenericDP: Update existing `GetDatasetByName` to use `ExecuteSQLBatch` for fetching all item data in one call
- SQL Server: Remove `GetDatasetByName` override (inherits from GenericDP)
- GenericDP: Replace `ProcessEntityRows`/`PostProcessRows` calls with unified post-processing
**Tests**: Verify existing GenericDP + SQL Server tests still pass

### Task C: Move GetDatasetStatusByName to GenericDP [pending]
**Why**: Both SQL Server and PG have nearly identical implementations — fetch dataset items, then per-item MAX(dateField)/COUNT(*). Only SQL syntax differs.
**Changes**:
- GenericDP: Add `GetDatasetStatusByName` implementation using dialect-neutral quoting (`QuoteIdentifier`/`QuoteSchemaAndView`) and `ExecuteSQLBatch` for per-item status queries
- SQL Server: Remove override (inherits)
- PG: Remove override (inherits)
**Tests**: Add GenericDP unit tests for GetDatasetStatusByName

### Task D: Move ProcessEntityRows to GenericDP with datetime hook [pending]
**Why**: ProcessEntityRows does two things: (1) datetime timezone adjustment (SQL Server-specific) and (2) encryption decryption (generic). Moving it to GenericDP with a virtual datetime hook keeps SQL Server's specialization while giving PG encryption for free.
**Changes**:
- GenericDP: Add `ProcessEntityRows` that handles encryption (existing `PostProcessRows` logic) and calls virtual `adjustDatetimeFields(rows, entityInfo)`
- GenericDP: `adjustDatetimeFields` default = no-op (returns rows unchanged)
- SQL Server: Override `adjustDatetimeFields` with existing datetime2/datetimeoffset correction logic
- SQL Server: Remove `ProcessEntityRows` (inherits from GenericDP)
- SQL Server: `PostProcessRows` override simplifies to just calling `ProcessEntityRows` (or remove if they're unified)
- SQLServerTransactionGroup: Update calls to use the inherited method
**Tests**: Add GenericDP tests for ProcessEntityRows (encryption path), SQL Server tests for datetime adjustment

### Task E: Delete dead metadata methods [pending]
**Why**: `GetApplicationMetadata`, `GetAuditLogTypeMetadata`, `GetUserMetadata`, `GetAuthorizationMetadata` are protected methods in SQLServerDataProvider that are NEVER called. Metadata is loaded via `GetAllMetadata()` → `GetDatasetByName("MJ_Metadata")`.
**Changes**:
- SQL Server: Delete all 4 methods (~55 lines)
**Tests**: Existing tests should still pass (methods were dead code)

### Task F: Remove SQL Server GetColumnsForDatasetItem override [pending]
**Why**: GenericDP already has `getColumnsForDatasetItem` using `QuoteIdentifier`. SQL Server's override using `[brackets]` is redundant since `QuoteIdentifier` produces brackets for SQL Server.
**Changes**:
- SQL Server: Remove `GetColumnsForDatasetItem` if it exists as override
- Verify GenericDP's version is used
**Tests**: Existing tests should still pass

### Task G: Move SQL Logging to GenericDP [pending]
**Why**: The entire SQL logging system (SqlLoggingSessionImpl, session management, log filtering) lives in SQLServerDataProvider but is 100% database-agnostic. Moving it to GenericDP gives PG full SQL logging for free.
**Changes**:
- GenericDP package: Add `SqlLogger.ts` (move SqlLoggingSessionImpl), add `types.ts` with SqlLoggingOptions/SqlLoggingSession interfaces
- GenericDP: Add session management to class (_sqlLoggingSessions, CreateSqlLogger, GetActiveSqlLoggingSessions, GetSqlLoggingSessionById, DisposeAllSqlLoggingSessions)
- GenericDP: Add `_logSqlStatement` instance method and static `LogSQLStatement`
- GenericDP package.json: Add `sql-formatter` and `uuid` dependencies
- SQL Server: Remove SqlLogger.ts, remove session management methods, remove types from types.ts
- SQL Server: Update SQLServerTransactionGroup to use GenericDP's LogSQLStatement
- SQL Server index.ts: Remove SqlLoggingSessionImpl export, update type exports
- GenericDP index.ts: Export new types and SqlLoggingSessionImpl
**Tests**: Move/adapt existing SQL logging tests to GenericDP package

### Task H: Unit Tests & Final Validation [pending]
- Run unit tests for GenericDP, SQLServerDP, PostgreSQLDP after each task
- Add new unit tests for: ExecuteSQLBatch default, GetDatasetStatusByName, ProcessEntityRows, SQL logging session management
- Full repo build
- Full repo test suite

---

## Execution Order
A → D → B → C → E → F → G → H

**Rationale**:
- A first (ExecuteSQLBatch in GenericDP) because B and C depend on it
- D next (ProcessEntityRows) because B needs it for unified post-processing
- B and C use the new batch + processing infrastructure
- E and F are trivial cleanups
- G (SQL logging) is independent but medium-large
- H validates everything

## Status
- **Started**: 2026-02-28
- **Current Task**: Not started
- **Last Updated**: 2026-02-28

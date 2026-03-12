# Runtime Schema Update — Full Spec Complete

**Branch**: `feature/runtime-schema-update`
**Date**: 2026-03-12
**Status**: All 7 phases complete (Phase 0 through Phase 6)

---

## Phase Summary

### Phase 0: SchemaEngine Package (Foundation)
**Status**: Complete (110 tests passing)
**Package**: `@memberjunction/schema-engine` (`packages/SchemaEngine/`)

- Extracted and generalized DDL generation from integration `schema-builder`
- Platform-aware SQL generation (SQL Server + PostgreSQL)
- Classes: `SchemaEngine`, `DDLGenerator`, `TypeMapper`, `MigrationFileWriter`, `SchemaValidator`, `SchemaEvolution`
- Generic `TableDefinition` / `ColumnDefinition` / `MigrationOutput` interfaces
- No integration-specific assumptions — consumers inject their own columns

### Phase 1: RuntimeSchemaManager (Core Pipeline)
**Status**: Complete (34 RSM tests + 110 total)
**Location**: `packages/SchemaEngine/src/RuntimeSchemaManager.ts`

- 9-step pipeline: ValidateEnvironment → AcquireLock → ValidateSQL → WriteMigrationFile → ExecuteMigration → RunCodeGen → CompileTypeScript → RestartMJAPI → MarkOutOfSync
- Gated by `ALLOW_RUNTIME_SCHEMA_UPDATE=1` environment variable
- Hard-blocks CREATE/ALTER/DROP in `__mj` schema (regex SQL validation)
- In-memory concurrency mutex + optional DB-backed lock (`RSULock` table)
- Audit logging to `RSUAuditLog` table
- `RSUError` class with typed error codes (DISABLED, CONCURRENT, VALIDATION, SQL_EXEC, etc.)
- Preview mode via `Preview()` method
- Out-of-sync flag management (`GetStatus()`, `MarkOutOfSync()`, `ClearOutOfSync()`)

### Phase 2: Git Integration
**Status**: Complete
**Location**: `packages/SchemaEngine/src/RuntimeSchemaManager.ts` (git methods)

- Branch creation: `rsu/{YYYYMMDDHHMM}-{table-slugs}`
- Artifact collection: migration files, CodeGen output, metadata
- Git commit with descriptive messages
- Push to remote
- PR creation via `gh` CLI with auto-merge

### Phase 3: Integration SchemaBuilder Conversion
**Status**: Complete (87 tests passing)
**Location**: `packages/Integration/schema-builder/src/SchemaBuilder.ts`

- `BuildSchema()` delegates DDL generation to `SchemaEngine.GenerateMigration()`
- Integration-specific columns (`__mj_integration_SyncStatus`, `__mj_integration_LastSyncedAt`) injected via `AdditionalColumns`
- `RunSchemaPipeline()` method wires SchemaBuilder output directly to `RuntimeSchemaManager.RunPipeline()`
- `BuildRSUInput()` helper converts `SchemaBuilderOutput` → `RSUPipelineInput`
- Soft FK config and metadata emission remain in the integration layer

### Phase 4: User Defined Tables (UDT) Pipeline
**Status**: Complete (23 tests passing)
**Location**: `packages/SchemaEngine/src/UserTablePipeline.ts`

- `UserTablePipeline` class: user-friendly table creation → full MJ entity
- Naming conventions: `custom.UD_{PascalCase}` (SQL), `User: {DisplayName}` (entity)
- `ValidateUserTableDefinition()`: DisplayName, column names, reserved prefix checks, max 50 columns
- Rate limiting: max 1 table creation per minute (configurable via `RSU_UDT_RATE_LIMIT_MS`)
- `CreateTable()` → validates → converts to `TableDefinition` → SchemaEngine → RSU pipeline
- `Preview()` → dry-run without execution

### Phase 5: Agent-Driven Schema Creation (Action)
**Status**: Complete
**Location**: `packages/Actions/CoreActions/src/custom/schema/create-table.action.ts`

- `CreateDatabaseTableAction` (`@RegisterClass(BaseAction, "__CreateDatabaseTable")`)
  - Accepts structured `TableDefinition` object or JSON string
  - Preview mode via `Preview=true` parameter
  - Full pipeline execution with output parameters: SqlTableName, EntityName, MigrationSQL, PipelineSteps
  - Safety: all RSU rules enforced (__mj protection, rate limiting, env gating)
- `PreviewDatabaseTableAction` (`@RegisterClass(BaseAction, "__PreviewDatabaseTable")`)
  - Convenience wrapper that always runs in preview mode

### Phase 6: Polish & Hardening
**Status**: Complete
**Location**: Multiple files

#### DB-Backed Mutex
- `RSULock` table in `__mj` schema (auto-created on first use)
- 30-minute lock expiration with automatic cleanup
- Enabled via `RSU_DB_LOCK_ENABLED=1`
- Falls back to in-memory mutex when disabled

#### Audit Logging
- `RSUAuditLog` table in `__mj` schema (auto-created on first use)
- Records: Description, AffectedTables, Success, APIRestarted, GitCommitSuccess, BranchName, ErrorMessage, StepsJSON, TotalDurationMs
- Enabled by default (disable with `RSU_AUDIT_LOG_ENABLED=0`)
- Fires asynchronously after pipeline completion (failures silently ignored)

#### GraphQL API
- **RSUResolver** (`packages/MJServer/src/resolvers/RSUResolver.ts`)
  - Query: `RuntimeSchemaUpdateStatus` → `RSUStatusGQL` (Enabled, Running, OutOfSync, timestamps)
  - Mutation: `RunRuntimeSchemaUpdate(input: RSUPipelineInputGQL!)` → `RSUPipelineResultGQL` (requires system user)
  - Mutation: `PreviewRuntimeSchemaUpdate(input: RSUPipelineInputGQL!)` → `RSUPreviewResultGQL` (requires system user)
- **Exported** from `packages/MJServer/src/index.ts` for GraphQL schema discovery

---

## Test Results

| Package | Tests | Status |
|---------|-------|--------|
| `@memberjunction/schema-engine` | 110 | All passing |
| `@memberjunction/integration-schema-builder` | 87 | All passing |
| **Total** | **197** | **All passing** |

## Build Results

| Package | Status |
|---------|--------|
| `@memberjunction/schema-engine` | Builds clean |
| `@memberjunction/integration-schema-builder` | Builds clean |
| `@memberjunction/server` (MJServer) | Builds clean |
| `@memberjunction/core-actions` (CoreActions) | Builds clean |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ALLOW_RUNTIME_SCHEMA_UPDATE` | Yes | (none) | Must be `1` to enable |
| `DB_HOST` | Yes | `localhost` | Database server |
| `DB_DATABASE` | Yes | (none) | Database name |
| `DB_USER` | Yes | `sa` | Database user |
| `DB_PASSWORD` | Yes | (none) | Database password |
| `RSU_MIGRATIONS_PATH` | No | `migrations/v2` | Migration file directory |
| `RSU_DB_LOCK_ENABLED` | No | (disabled) | Set `1` for DB-backed mutex |
| `RSU_AUDIT_LOG_ENABLED` | No | (enabled) | Set `0` to disable |
| `RSU_UDT_RATE_LIMIT_MS` | No | `60000` | UDT creation rate limit |
| `RSU_PM2_PROCESS_NAME` | No | `mjapi` | PM2 process name |
| `GRAPHQL_PORT` | No | `4000` | MJAPI health check port |
| `RSU_GIT_TARGET_BRANCH` | No | `next` | PR target branch |

## Architecture

```
Consumer Layer
├── Integration SchemaBuilder → RunSchemaPipeline()
├── UserTablePipeline → CreateTable()
├── CreateDatabaseTableAction → Agent/Workflow interface
└── GraphQL Mutations → RSUResolver

            ↓

SchemaEngine (Pure DDL Generation)
├── SchemaEngine.GenerateMigration()
├── DDLGenerator (SQL Server + PostgreSQL)
├── TypeMapper (abstract → SQL types)
├── SchemaValidator (input validation)
└── SchemaEvolution (ALTER TABLE diffs)

            ↓

RuntimeSchemaManager (Pipeline Orchestration)
├── ValidateEnvironment → AcquireLock → ValidateSQL
├── WriteMigrationFile → ExecuteMigration → RunCodeGen
├── CompileTypeScript → RestartMJAPI → MarkOutOfSync
├── Git: Branch → Commit → Push → PR
└── Audit: RSUAuditLog table
```

---

*Implementation verified on 2026-03-12. All phases implemented, all packages build, all 197 tests pass.*
*E2E database testing requires a running SQL Server instance (sql-claude container in Docker workbench).*

## Verification Checklist

- [x] SchemaEngine: 110 tests pass, builds clean
- [x] Integration schema-builder: 87 tests pass, builds clean
- [x] MJServer (RSUResolver): builds clean, exported from index.ts
- [x] CoreActions (CreateDatabaseTableAction): builds clean
- [x] SchemaBuilder has `RunSchemaPipeline()` wired to RuntimeSchemaManager
- [x] UserTablePipeline creates `custom.UD_*` tables with `User: *` entity names
- [x] CreateDatabaseTableAction registered as `__CreateDatabaseTable`
- [x] PreviewDatabaseTableAction registered as `__PreviewDatabaseTable`
- [x] RSUResolver exposes RuntimeSchemaUpdateStatus query
- [x] RSUResolver exposes RunRuntimeSchemaUpdate mutation (requires system user)
- [x] RSUResolver exposes PreviewRuntimeSchemaUpdate mutation (requires system user)
- [x] DB-backed mutex via RSULock table (optional, enabled via RSU_DB_LOCK_ENABLED=1)
- [x] Audit logging via RSUAuditLog table (enabled by default)
- [x] CodeGen artifacts generated for test entity (dbo.RSU_TestGadget)

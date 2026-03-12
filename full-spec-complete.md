# Runtime Schema Update (RSU) — Full Spec Implementation Complete

> **Date**: March 12, 2026
> **Branch**: `feature/runtime-schema-update`
> **Phases Completed**: 0–6 (all)
> **Verified**: All packages compile, 190 tests passing, commit `395163783b`

---

## Summary

All six phases of the Runtime Schema Update plan have been implemented. The RSU system enables MemberJunction to create and modify database tables, run CodeGen, restart MJAPI, and commit artifacts to git — all programmatically and in-process.

---

## Phase 0: SchemaEngine Package ✅

**Package**: `@memberjunction/schema-engine` (`packages/SchemaEngine/`)

- Generic, platform-aware DDL generation (SQL Server + PostgreSQL)
- `SchemaEngine` orchestrator: `GenerateMigration()`, `GenerateEvolutionMigration()`, `GenerateCreateSchema()`
- `DDLGenerator`: CREATE TABLE, ALTER TABLE, extended properties
- `TypeMapper`: Abstract types → platform SQL types (12 types)
- `SchemaValidator`: Table definition validation (__mj protection, identifier checks)
- `SchemaEvolution`: Diff engine for ALTER TABLE generation
- `MigrationFileWriter`: Flyway-compatible file naming and wrapping
- **80 unit tests** — all passing

## Phase 1: RuntimeSchemaManager Pipeline ✅

**Class**: `RuntimeSchemaManager` (singleton, in `@memberjunction/schema-engine`)

9-step pipeline:
1. ValidateEnvironment (check `ALLOW_RUNTIME_SCHEMA_UPDATE=1`)
2. AcquireLock (concurrency mutex)
3. ValidateSQL (schema protection — __mj always blocked)
4. WriteMigrationFile (Flyway format)
5. ExecuteMigration (via sqlcmd)
6. RunCodeGen (temporary .mjs script)
7. CompileTypeScript (via turbo)
8. RestartMJAPI (via PM2 with health polling)
9. MarkOutOfSync

Plus: `Preview()` dry-run, `GetStatus()`, env var gating.

**27 unit tests** — all passing.

## Phase 2: Git Integration ✅

Added to step 9 of the pipeline (non-fatal on failure):
- Create feature branch: `rsu/{timestamp}-{table-slugs}`
- Stage RSU artifacts (migration, CodeGen output, metadata)
- Commit with descriptive message
- Push with upstream tracking
- Create PR via `gh` CLI

## Phase 3: Integration SchemaBuilder Wiring ✅

**File**: `packages/Integration/schema-builder/src/SchemaBuilder.ts`

Added `RunSchemaPipeline()` method that:
1. Calls `BuildSchema()` to generate migration SQL, soft FKs, metadata
2. Converts output to `RSUPipelineInput` via `BuildRSUInput()`
3. Feeds into `RuntimeSchemaManager.RunPipeline()`
4. Returns both `SchemaBuilderOutput` and `RSUPipelineResult`

Handles error cases: schema errors, no migration produced, pipeline failures.

**3 new tests** (87 total in schema-builder) — all passing.

## Phase 4: User Defined Tables (UDT) Pipeline ✅

**File**: `packages/SchemaEngine/src/UserTablePipeline.ts`

`UserTablePipeline` class with:
- `CreateTable(def)`: Full pipeline — validate → SchemaEngine → RSU
- `Preview(def)`: Dry-run — validate and return SQL
- Naming conventions: `custom.UD_{PascalName}` / `User: {Display Name}`
- Rate limiting: configurable via `RSU_UDT_RATE_LIMIT_MS` (default: 60s)
- Validation: max 50 columns, reserved name checks, duplicate detection
- Helper functions: `DisplayNameToSqlName()`, `GenerateUDTTableName()`, `GenerateUDTEntityName()`

Exported types: `UserTableDefinition`, `UserColumnDefinition`, `UserForeignKeyDefinition`, `UserTablePipelineResult`

**23 new tests** (103 total in SchemaEngine) — all passing.

## Phase 5: Agent-Driven Schema Creation Action ✅

**File**: `packages/Actions/CoreActions/src/custom/schema/create-table.action.ts`

Two actions registered:

### `__CreateDatabaseTable`
- Input: `TableDefinition` (object or JSON), `Preview`, `SkipRestart`, `SkipGitCommit`
- Wraps `UserTablePipeline` for structured table creation
- Preview mode validates and returns SQL without executing
- Output params: `SqlTableName`, `EntityName`, `MigrationSQL`, `PipelineSteps`
- Enforces all RSU safety rules via the pipeline

### `__PreviewDatabaseTable`
- Convenience action that always runs in preview mode
- Delegates to `CreateDatabaseTableAction` with `Preview=true`

Added `@memberjunction/schema-engine` dependency to CoreActions.

## Phase 6: Polish & Hardening ✅

### DB-Backed Mutex (Multi-Instance Safety)
**In**: `RuntimeSchemaManager.ts`

- Enabled via `RSU_DB_LOCK_ENABLED=1`
- Creates `[__mj].[RSULock]` table on first use (auto-DDL)
- Lock expires after 30 minutes (auto-cleanup of stale locks)
- Falls back to in-memory mutex if DB is unavailable
- Released in `finally` block (always cleaned up)

### Pipeline Audit Logging
**In**: `RuntimeSchemaManager.ts`

- Creates `[__mj].[RSUAuditLog]` table on first use (auto-DDL)
- Logs every pipeline run: description, affected tables, success/failure, steps, timing
- Best-effort (non-blocking) — failures don't affect the pipeline
- Disable via `RSU_AUDIT_LOG_ENABLED=0`

### GraphQL API
**File**: `packages/MJServer/src/resolvers/RSUResolver.ts`

Three endpoints:

| Endpoint | Type | Auth | Description |
|----------|------|------|-------------|
| `RuntimeSchemaUpdateStatus` | Query | Authenticated user | Status: enabled, running, out-of-sync, last run |
| `RunRuntimeSchemaUpdate` | Mutation | System user only | Execute full RSU pipeline |
| `PreviewRuntimeSchemaUpdate` | Mutation | System user only | Dry-run: validate SQL, return plan |

Input/output types fully defined as GraphQL types (InputType/ObjectType).
Added `@memberjunction/schema-engine` dependency to MJServer.

---

## Test Results

| Package | Tests | Status |
|---------|-------|--------|
| `@memberjunction/schema-engine` | 103 | ✅ All passing |
| `@memberjunction/integration-schema-builder` | 87 | ✅ All passing |
| **Total** | **190** | **✅ All passing** |

---

## Files Modified/Created

### New Files
- `packages/SchemaEngine/src/UserTablePipeline.ts` — UDT pipeline
- `packages/SchemaEngine/src/__tests__/UserTablePipeline.test.ts` — UDT tests
- `packages/Actions/CoreActions/src/custom/schema/create-table.action.ts` — Agent action
- `packages/MJServer/src/resolvers/RSUResolver.ts` — GraphQL API

### Modified Files
- `packages/SchemaEngine/src/RuntimeSchemaManager.ts` — DB mutex, audit logging
- `packages/SchemaEngine/src/index.ts` — UDT exports
- `packages/Integration/schema-builder/src/SchemaBuilder.ts` — `RunSchemaPipeline()`
- `packages/Integration/schema-builder/src/index.ts` — RSU type re-exports
- `packages/Integration/schema-builder/src/__tests__/integration.test.ts` — New tests
- `packages/Actions/CoreActions/src/index.ts` — Schema action export
- `packages/Actions/CoreActions/package.json` — schema-engine dependency
- `packages/MJServer/package.json` — schema-engine dependency

---

## Environment Variables

| Variable | Default | Phase | Description |
|----------|---------|-------|-------------|
| `ALLOW_RUNTIME_SCHEMA_UPDATE` | — | 1 | Master switch (must be `1`) |
| `RSU_MIGRATIONS_PATH` | `migrations/v2` | 1 | Migration file directory |
| `RSU_DEFAULT_SCHEMA` | `__mj` | 1 | Flyway placeholder schema |
| `RSU_CODEGEN_COMMAND` | — | 1 | Custom CodeGen command |
| `RSU_COMPILE_PACKAGES` | MJCoreEntities,MJServer,MJAPI | 1 | Packages to compile |
| `RSU_PM2_PROCESS_NAME` | `mjapi` | 1 | PM2 process name |
| `RSU_PROTECTED_SCHEMAS` | — | 1 | Additional protected schemas |
| `RSU_GIT_TARGET_BRANCH` | `next` | 2 | Git PR target branch |
| `RSU_GIT_USER_NAME` | — | 2 | Git commit author name |
| `RSU_GIT_USER_EMAIL` | — | 2 | Git commit author email |
| `RSU_UDT_RATE_LIMIT_MS` | `60000` | 4 | UDT rate limit (ms) |
| `RSU_DB_LOCK_ENABLED` | — | 6 | Enable DB-backed mutex (`1`) |
| `RSU_AUDIT_LOG_ENABLED` | — | 6 | Disable audit log (`0`) |

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│  CONSUMERS                                                             │
│                                                                        │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Integration   │  │ UDT         │  │ AI Agent     │  │ GraphQL    │ │
│  │ SchemaBuilder │  │ Pipeline    │  │ Action       │  │ Mutation   │ │
│  │ (Phase 3)     │  │ (Phase 4)   │  │ (Phase 5)    │  │ (Phase 6)  │ │
│  └──────┬───────┘  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                 │                 │                 │        │
│         ▼                 ▼                 ▼                 ▼        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  @memberjunction/schema-engine  (Phase 0)                        │  │
│  │                                                                  │  │
│  │  TableDefinition → DDLGenerator → Migration SQL                  │  │
│  │  TypeMapper · SchemaValidator · SchemaEvolution                   │  │
│  └──────────────────────────┬───────────────────────────────────────┘  │
│                              │                                         │
│                              ▼                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  RuntimeSchemaManager  (Phase 1 + 2 + 6)                        │  │
│  │                                                                  │  │
│  │  1. Validate   2. DB Lock   3. Execute SQL   4. CodeGen          │  │
│  │  5. Compile    6. Restart   7. Git PR        8. Audit Log        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

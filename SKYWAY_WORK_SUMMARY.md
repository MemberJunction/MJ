# Skyway Multi-Database Provider — Work Summary

**Repo:** external Skyway repo (published to npm as `@memberjunction/skyway-*`)
**Branch:** `feature/multi-db-provider-support`
**Commit:** `59daf5d` — "made skyway able to target sql server and PostgreSQL from same core engine"
**Total:** 23 files, +1,967 / -1,172 lines (excluding package-lock.json)

---

## What We Built

Skyway was a TypeScript-native, Flyway-compatible migration engine **hard-coupled to SQL Server** via the `mssql` driver. We extracted a `DatabaseProvider` interface, split the SQL Server implementation into its own package, and built a parallel PostgreSQL implementation — making Skyway database-agnostic while keeping 100% backward compatibility.

### Before

```
skyway-core (single package)
  ├── mssql driver (hardcoded)
  ├── ConnectionManager (SQL Server-specific)
  ├── HistoryTable (SQL Server DDL)
  └── Skyway class (mssql imports everywhere)
```

### After

```
skyway-core          — interfaces + orchestration (no database driver)
skyway-sqlserver     — SqlServerProvider (mssql driver)
skyway-postgres      — PostgresProvider (pg driver)
skyway-cli           — dialect-aware CLI
```

---

## Package Structure

| Package | npm Name | Purpose |
|---|---|---|
| `packages/core/` | `@memberjunction/skyway-core` | Provider interfaces, Skyway engine, migration scanner/parser/resolver, checksum, placeholder, errors. **Zero database driver dependencies.** |
| `packages/sqlserver/` | `@memberjunction/skyway-sqlserver` | SQL Server provider. Depends on `mssql`. Drop-in replacement for the old hardcoded behavior. |
| `packages/postgres/` | `@memberjunction/skyway-postgres` | PostgreSQL provider. Depends on `pg`. Full parity with SQL Server provider. |
| `packages/cli/` | `@memberjunction/skyway-cli` | CLI. Dialect-aware — creates the right provider from `--dialect` flag or config. |

---

## Files and Why They Matter

### NEW: Provider Interface (`packages/core/src/db/provider.ts`) — 246 lines

The central abstraction that makes everything else possible. Defines:

- **`DatabaseProvider`** — Connection lifecycle (`Connect`/`Disconnect`), database-level ops (`DatabaseExists`/`CreateDatabase`/`DropDatabase`), transaction management (`BeginTransaction`), direct execution (`Execute`/`Query`), dialect info (`Dialect`/`DefaultSchema`/`DefaultPort`), script splitting (`SplitScript`), history table management (`History`), and schema cleanup (`GetCleanOperations`/`DropSchema`).
- **`ProviderTransaction`** — `Execute`/`Query`/`Commit`/`Rollback` within a transaction context.
- **`HistoryTableProvider`** — CRUD for the `flyway_schema_history` table with dialect-specific DDL (`EnsureExists`, `GetAllRecords`, `InsertRecord`, `DeleteRecord`, `UpdateChecksum`).
- **`HistoryInsertParams`** — Dialect-agnostic parameters for history record insertion.
- **`CleanOperation`** — SQL + label pairs for ordered schema cleanup.

### NEW: PostgreSQL Provider (`packages/postgres/src/postgres-provider.ts`) — 561 lines

Full `DatabaseProvider` implementation for PostgreSQL:

- **Connection:** `pg.Pool` with `max: 1` (sequential migration execution, matches SQL Server pattern)
- **System DB:** Connects to `postgres` database for `DatabaseExists`/`CreateDatabase`/`DropDatabase`
- **Transactions:** `BEGIN` → acquire client → wrap as `ProviderTransaction` → `COMMIT`/`ROLLBACK` + release
- **History table:** PG DDL with `VARCHAR`, `TIMESTAMP`, `BOOLEAN`, `NOW()`, `COALESCE()`, `$1`/`$2` positional params, double-quoted identifiers
- **Schema creation:** `CREATE SCHEMA IF NOT EXISTS "schema"`
- **Script splitting:** Returns entire script as single batch (PG doesn't use `GO`)
- **Clean operations:** Queries `pg_catalog` for FK constraints (`contype='f'`), views (`relkind='v'`), functions (`pg_proc`), tables (`relkind='r'`), types (`typtype='c'`/`'e'`)
- **Drop database:** `pg_terminate_backend` to kill connections before `DROP DATABASE`

### NEW: SQL Server Provider (`packages/sqlserver/src/sqlserver-provider.ts`) — 527 lines

Extracted from the old monolithic `skyway.ts`. Same logic, clean interface:

- **Connection:** `mssql.ConnectionPool` with `max: 1`
- **System DB:** Connects to `master` for database-level operations
- **Transactions:** `sql.Transaction` wrapped as `ProviderTransaction`
- **History table:** `NVARCHAR`, `DATETIME`, `BIT`, `GETDATE()`, `ISNULL()`, bracket-quoted identifiers, `sql.Int`/`sql.NVarChar`/`sql.Bit` typed parameters
- **Script splitting:** Delegates to existing `SplitOnGO()` utility
- **Clean operations:** `sys.foreign_keys`, `sys.views`, `sys.procedures`, `INFORMATION_SCHEMA.ROUTINES`, `sys.tables`, `sys.types`

### REFACTORED: Skyway Engine (`packages/core/src/core/skyway.ts`) — 524 lines changed

The Skyway class went from 1,100+ lines of mssql-coupled code to a clean orchestrator:

- **Removed:** All `import * as sql from 'mssql'`, direct `ConnectionManager` usage, inline `HistoryTable` instantiation, hardcoded SQL Server DDL in `Clean()`, `CreateDatabase()`, `DropDatabase()`
- **Now uses:** `provider.Connect()/Disconnect()`, `provider.History`, `provider.BeginTransaction()`, `provider.GetCleanOperations()`, `provider.SplitScript()`
- **Backward compatible:** Constructor accepts `SkywayConfig` with optional `Provider` field. Consumer just passes the provider instance.

### DELETED: Absorbed into providers

| Deleted file | Where it went |
|---|---|
| `packages/core/src/db/connection.ts` (117 lines) | `SqlServerProvider.Connect()/Disconnect()/ConnectToMaster()` |
| `packages/core/src/history/history-table.ts` (359 lines) | `SqlServerProvider.History` inner class + `PostgresProvider.History` |
| `packages/core/src/executor/executor.ts` (331 lines) | Migration execution logic absorbed into `skyway.ts` provider calls |

### MODIFIED: Config & Types

| File | Change |
|---|---|
| `packages/core/src/core/config.ts` | Added `Provider` to `SkywayConfig`, dialect-aware `resolveConfig()` — `DefaultSchema` defaults to `'public'` for PG, `'dbo'` for SQL Server |
| `packages/core/src/db/types.ts` | Added `Dialect` to `DatabaseConfig`, PG-specific options (`SSL`), separated SQL Server options |
| `packages/core/src/index.ts` | Updated exports — removed `ConnectionManager`/`HistoryTable`, added provider interfaces |
| `packages/core/src/__tests__/config.test.ts` | **NEW.** Tests dialect-aware config defaults |

### MODIFIED: CLI

| File | Change |
|---|---|
| `packages/cli/src/config-loader.ts` | Added `--dialect` flag, `SKYWAY_DIALECT` env var, config file `dialect` field. Dynamically imports correct provider package based on dialect. |
| `packages/cli/src/commands/migrate.ts` | Passes provider from config loader to `new Skyway()` |
| `packages/cli/src/bin/skyway.ts` | Minor wiring update |

### NEW: Package configs

| File | Purpose |
|---|---|
| `packages/postgres/package.json` | `@memberjunction/skyway-postgres` — depends on `skyway-core` + `pg` |
| `packages/postgres/tsconfig.json` | TypeScript config for PG package |
| `packages/postgres/src/index.ts` | Exports `PostgresProvider` + types |
| `packages/sqlserver/package.json` | `@memberjunction/skyway-sqlserver` — depends on `skyway-core` + `mssql` |
| `packages/sqlserver/tsconfig.json` | TypeScript config for SQL Server package |
| `packages/sqlserver/src/index.ts` | Exports `SqlServerProvider` + types |

---

## How Skyway Connects to the MJ Work

Skyway is the engine behind `mj migrate` in the MJ CLI. Here's the dependency chain:

```
User runs: mj migrate
    ↓
packages/MJCLI/src/commands/migrate/index.ts
    ↓ reads dbPlatform from mj.config.cjs
packages/MJCLI/src/config.ts (createSkywayProvider)
    ↓ dynamically imports correct provider
@memberjunction/skyway-postgres (or skyway-sqlserver)
    ↓ creates PostgresProvider
@memberjunction/skyway-core (Skyway class)
    ↓ uses provider.Connect(), provider.History, provider.BeginTransaction()
    ↓ scans migrations-pg/v5/, resolves pending, applies each
PostgreSQL database
```

Without this Skyway work:
- `mj migrate` could only target SQL Server
- The coworker had to run raw `psql -f` loops (no history tracking, no checksums, no idempotency)
- Docker workbench used `psql -f` loops
- No programmatic way to apply PG migrations from TypeScript

With this Skyway work:
- `mj migrate` handles both platforms through the same API
- Full Flyway-compatible history tracking on PG
- Docker workbench delegates to `mj migrate`
- Skyway's Validate/Repair/Clean/Info commands all work on PG

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **Separate npm packages** (core + sqlserver + postgres) | Prevents PG users from pulling `mssql` and vice versa. Core stays driver-free. |
| **`max: 1` connection pool** on both providers | Migrations must execute sequentially — parallel connections cause ordering issues and lock contention. |
| **Flyway-compatible history table** | Existing SQL Server installations already have `flyway_schema_history`. Skyway can read and continue where Flyway left off on both platforms. |
| **`Provider` field in `SkywayConfig`** | Consumer explicitly creates the provider — no magic auto-detection that could fail. Clean dependency injection. |
| **System DB approach** for database creation | SQL Server uses `master`, PG uses `postgres`. Each provider connects to the system DB for `CREATE/DROP DATABASE`. |
| **`SplitScript` on the provider** | SQL Server splits on `GO`, PG doesn't. The provider knows its dialect's batching rules. |

---

## Validation

- **MJ repo validated end-to-end:** `scripts/run-pg-migrate.mjs` used Skyway with `PostgresProvider` to apply 26 PG migrations to a real PG database — connection, scanning, history tracking, placeholder substitution, error reporting all worked correctly.
- **Coworker's report confirmed:** Their #1 pain point was "`mj migrate` tried port 1433 even with `DB_TYPE=postgresql`" — now fixed by the provider architecture.
- **Backward compatible:** Existing SQL Server users pass `SqlServerProvider` and get identical behavior to the pre-refactor Skyway.

---

## Published Versions

- `@memberjunction/skyway-core@0.5.3`
- `@memberjunction/skyway-sqlserver@0.5.3`
- `@memberjunction/skyway-postgres@0.5.3`

These are already referenced in `packages/MJCLI/package.json` as dependencies.

---
"@memberjunction/codegen-lib": minor
---

refactor(codegen-lib): multi-provider `SetupDataSource` + PostgreSQL pool symmetry

**Why minor (not patch):** this PR has no DB / migration / metadata changes, but it does add new
public API to `@memberjunction/codegen-lib` — `CodeGenDatabaseProvider.SetupDataSource()` (new
abstract method on the public base class), `Config/pg-connection.ts` (new file exporting `PGConnection`
and `getPgConfig()`), and a new optional `codegenPool` config block. Net-additive public surface →
minor under our semver convention. End-user behavior is unchanged when none of the new APIs / config
keys are set.

- `RunCodeGenBase.setupDataSource()` now dispatches via `MJGlobal.Instance.ClassFactory.CreateInstance(CodeGenDatabaseProvider, dbPlatform)` instead of a hard-coded `if (platform === 'postgresql')` switch. Adding a new platform is a single `@RegisterClass` registration — no orchestrator change.
- `CodeGenDatabaseProvider` gains an abstract `SetupDataSource()` method; `SQLServerCodeGenProvider` and `PostgreSQLCodeGenProvider` own their respective implementations. The shared `DataSourceResult` interface moved to the base class.
- New `Config/pg-connection.ts` mirrors `Config/db-connection.ts`'s shape for PostgreSQL: lazy + module-cached pool via `PGConnectionManager`, plus a `getPgConfig()` accessor. Eliminates the previous function-local `pg.Pool` that was rebuilt on every `setupDataSource()`.
- New optional `codegenPool` config block (max, min, idleTimeoutMillis, connectionTimeoutMillis, statementTimeoutMs). When unset, underlying driver defaults apply — fully backwards compatible. `statementTimeoutMs` applies to both providers: it maps to mssql's `requestTimeout` and to PG's per-connection `statement_timeout` GUC.
- PG env vars (`PG_HOST` / `PG_PORT` / `PG_DATABASE` / `PG_USERNAME` / `PG_PASSWORD`) are now resolved once in `DEFAULT_CODEGEN_CONFIG` and flow through `configInfo`. When a PG_* env var differs from its `DB_*` counterpart, a `logWarning` records which one is winning and which one was overridden — silent precedence was the cause of "I set DB_HOST but it's still connecting to localhost" reports during dev. The provider reads `configInfo.dbHost` etc. directly — no second env-resolution layer at the connection site.

Documented in CLAUDE.md under "CodeGen Database Connections (SQL Server + PostgreSQL)".

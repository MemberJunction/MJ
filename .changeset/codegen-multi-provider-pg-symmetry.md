---
"@memberjunction/codegen-lib": minor
---

refactor(codegen-lib): multi-provider `SetupDataSource` + PostgreSQL pool symmetry

- `RunCodeGenBase.setupDataSource()` now dispatches via `MJGlobal.Instance.ClassFactory.CreateInstance(CodeGenDatabaseProvider, dbPlatform)` instead of a hard-coded `if (platform === 'postgresql')` switch. Adding a new platform is a single `@RegisterClass` registration — no orchestrator change.
- `CodeGenDatabaseProvider` gains an abstract `SetupDataSource()` method; `SQLServerCodeGenProvider` and `PostgreSQLCodeGenProvider` own their respective implementations. The shared `DataSourceResult` interface moved to the base class.
- New `Config/pg-connection.ts` mirrors `Config/db-connection.ts`'s shape for PostgreSQL: lazy + module-cached pool via `PGConnectionManager`, plus a `getPgConfig()` accessor. Eliminates the previous function-local `pg.Pool` that was rebuilt on every `setupDataSource()`.
- New optional `codegenPool` config block (max, min, idleTimeoutMillis, connectionTimeoutMillis, pgStatementTimeoutMs). When unset, underlying driver defaults apply — fully backwards compatible. `pgStatementTimeoutMs` is the PG counterpart to `dbRequestTimeout` (set via per-connection `statement_timeout` GUC).
- PG env vars (`PG_HOST` / `PG_PORT` / `PG_DATABASE` / `PG_USERNAME` / `PG_PASSWORD`) are now resolved once in `DEFAULT_CODEGEN_CONFIG` and flow through `configInfo`. The provider reads `configInfo.dbHost` etc. directly — no second env-resolution layer at the connection site.

Documented in CLAUDE.md under "CodeGen Database Connections (SQL Server + PostgreSQL)".

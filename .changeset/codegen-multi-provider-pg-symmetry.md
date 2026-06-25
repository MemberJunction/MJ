---
"@memberjunction/codegen-lib": patch
---

refactor(codegen-lib): multi-provider `SetupDataSource` + PostgreSQL pool symmetry

**Why patch (not minor):** under the convention recent `@memberjunction/codegen-lib` entries
follow (see `5.42.0` — minor for `2f225e4` / `b7092ca`, both of which carried SQL migrations;
patch for `ded7a20`, which restructured `db-connection.ts` and added `getSqlConfig()` with no
migration), the semver bump is driven by whether the change ships a DB migration or schema
modification. This PR has no migration, no metadata changes, and no DB schema changes — it is
a pure code refactor + new optional `codegenPool` knobs + a new abstract `SetupDataSource()`
on the provider base. End-user behavior is unchanged when the new optional APIs / config keys
aren't touched, and no external code depends on the new exports yet — so `patch` is consistent
with the recent precedent.

- `RunCodeGenBase.setupDataSource()` now dispatches via `MJGlobal.Instance.ClassFactory.CreateInstance(CodeGenDatabaseProvider, dbPlatform)` instead of a hard-coded `if (platform === 'postgresql')` switch. Adding a new platform is a single `@RegisterClass` registration — no orchestrator change.
- `CodeGenDatabaseProvider` gains an abstract `SetupDataSource()` method; `SQLServerCodeGenProvider` and `PostgreSQLCodeGenProvider` own their respective implementations. The shared `DataSourceResult` interface moved to the base class.
- New `Config/pg-connection.ts` mirrors `Config/db-connection.ts`'s shape for PostgreSQL: lazy + module-cached pool via `PGConnectionManager`, plus a `getPgConfig()` accessor. Eliminates the previous function-local `pg.Pool` that was rebuilt on every `setupDataSource()`.
- New optional `codegenPool` config block (max, min, idleTimeoutMillis, connectionTimeoutMillis, statementTimeoutMs). When unset, underlying driver defaults apply — fully backwards compatible. `statementTimeoutMs` applies to both providers: it maps to mssql's `requestTimeout` and to PG's per-connection `statement_timeout` GUC.
- PG env vars (`PG_HOST` / `PG_PORT` / `PG_DATABASE` / `PG_USERNAME` / `PG_PASSWORD`) are now resolved once in `DEFAULT_CODEGEN_CONFIG` and flow through `configInfo`. When a PG_* env var differs from its `DB_*` counterpart, a `logWarning` records which one is winning and which one was overridden — silent precedence was the cause of "I set DB_HOST but it's still connecting to localhost" reports during dev. The provider reads `configInfo.dbHost` etc. directly — no second env-resolution layer at the connection site.

Documented in CLAUDE.md under "CodeGen Database Connections (SQL Server + PostgreSQL)".

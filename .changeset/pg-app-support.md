---
"@memberjunction/open-app-engine": patch
"@memberjunction/db-auto-doc": patch
---

App-level PostgreSQL support (code-only — no schema/metadata changes):

- **open-app-engine**: `mj app install/upgrade/remove` now work on PostgreSQL — the CLI orchestrator
  builds a `PostgreSQLDataProvider` when `dbPlatform=postgresql` (was hardcoded to SQL Server), and
  the installer selects the platform-specific migration directory (`<dir>-pg` / `migrations.directoryPostgres`)
  so PG apps run plpgsql migrations instead of T-SQL.
- **db-auto-doc**: dialect-aware description write-back — emits PostgreSQL `COMMENT ON` statements
  (double-quoted identifiers, no `sp_addextendedproperty` / `GO`) when the configured provider is postgresql.

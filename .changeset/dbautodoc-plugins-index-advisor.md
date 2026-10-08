---
"@memberjunction/db-auto-doc": patch
---

DBAutoDoc gets a plugin system, and its first built-in plugin, the Index Advisor, which proposes missing indexes and exports them as a SQL migration.

- **Plugins.** A plugin is a class registered with `@RegisterClass(BaseAutoDocPlugin, '<Name>')` and enabled in the new `plugins` config section. External plugins load at startup from an npm package or file path (`Module`). Hooks run at six points of an analysis (`OnPreRun`, `OnAfterIntrospection`, `OnAfterDiscovery`, `OnAfterDescriptions`, `OnAfterPruning`, `OnPostRun`, the last with the database connection still open), in `Priority` order. A hook that throws is logged and recorded, and the run continues. Each plugin keeps its run history and data in `state.plugins.<Name>`. Built-in plugins run by default and can be turned off with `Enabled: false`. An unregistered plugin name fails the run at startup. With no plugins enabled, runs write the same state files as before.
- **Plugin export formats.** `db-auto-doc export --format <name>` (repeatable) runs a plugin's exporter; `--list-formats` lists them, `--provider` overrides the platform, and `--file-prefix` overrides a format's file-name prefix.
- **Index Advisor (built-in, on by default).** At the end of a run it reads existing indexes on every analyzed schema (new `GetIndexes(schemaName)` on the SQL Server, PostgreSQL and MySQL drivers). It proposes indexes for foreign keys with no index starting with them (declared, or discovered and confirmed at `KeyMinConfidence`, default 90) and for confirmed discovered primary keys. It skips tables under `MinRowCount` (default 1000) and poor leading keys. It flags redundant indexes (report only, never dropped). An LLM review (`LLMReview`, default on; up to `MaxLLMTables` tables, default 40; model override key `indexAdvisor`) can keep, drop, modify or add proposals, using column statistics, descriptions, existing indexes and sample queries. The model returns structured decisions, never SQL, and every change is validated. The advisor never changes the database.
- **Index migration export.** `export --format index-migration` writes `V<yyyyMMddHHmm>__dbautodoc_indexes.sql`:
  - SQL Server: `CREATE NONCLUSTERED INDEX`, guarded by `IF NOT EXISTS`.
  - PostgreSQL: `CREATE INDEX CONCURRENTLY IF NOT EXISTS` by default, plus a Flyway `.sql.conf` with `executeInTransaction=false`. Skyway 0.6.x runs every migration in a transaction, so apply a CONCURRENTLY migration with `psql` or Flyway, or set `Concurrently: false`.
  - MySQL: `CREATE INDEX`.
- **State file.** `state.database.provider` now records the platform a run connected to (absent in older state files).
- **Fix: MySQL login.** The MySQL driver overrode `mysql_native_password` and `caching_sha2_password` with handlers that sent an empty password, so every password-protected MySQL 8 connection failed ("using password: NO"). The override is removed; `mysql2` handles both methods itself.

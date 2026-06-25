---
"@memberjunction/cli": patch
"@memberjunction/open-app-engine": patch
"@memberjunction/sql-dialect": patch
---

fix(open-app): make `mj app` db-generic — install, migrations, and remove work on PostgreSQL

Coupled fixes so the full `mj app` Open App lifecycle works on a PostgreSQL-backed MJ, not just SQL Server:

- **Provider selection (`@memberjunction/cli`).** `open-app-context.ts` built a SQL Server provider unconditionally, so every `mj app` command ran the SS path against a PG database regardless of `DB_PLATFORM`. It now **delegates to MetadataSync's shared `initializeProvider` / `cleanupProvider`** — the same db-generic lifecycle `mj sync` uses (lazy singleton, SS-or-PG selection, pool teardown, UserCache populated on both platforms). `open-app-context.ts` keeps only its config-field adaptation (`codeGenLogin`/`coreSchema` → `dbUsername`/`mjCoreSchema`) and its lenient Owner/first-active system-user policy; the context's `DatabaseProvider` is `DatabaseProviderBase` so `Dialect.PlatformKey` matches the real DB, and SSL follows the standard `PG*` env (managed Postgres via `PGSSLMODE`/`NODE_ENV`). The duplicated provider bootstrap and the direct `@memberjunction/postgresql-dataprovider` dependency (now transitive) are dropped.

- **Migrations (`@memberjunction/open-app-engine`).** `HandleMigrations` downloaded exactly `manifest.migrations.directory` (the SQL Server set) on every platform, so a schema-backed install on PG failed with `syntax error at or near "IF"` (T-SQL against PG). It now mirrors core `mj migrate`'s `migrations` → `migrations-pg` swap: on PostgreSQL it prefers a sibling `<directory>-pg` folder (the `.pg.sql` set) and falls back to the declared directory when no PG variant exists. SQL Server unchanged.

- **Schema casing (`@memberjunction/sql-dialect` + `@memberjunction/open-app-engine`).** PostgreSQL folds unquoted identifiers to lowercase, so a mixed-case schema (`__mj_BizAppsCommon`) would split into two physical schemas — tables in the folded `__mj_bizappscommon` (from the app's unquoted migration DDL) and Skyway's history in the quoted mixed-case one. Rather than hand-handle casing per call site, a new dialect method **`SQLDialect.CanonicalSchemaName`** owns it: lowercase on PostgreSQL (matching unquoted DDL), identity on SQL Server (case-insensitive). The engine routes schema create + the Skyway `DefaultSchema`/`${flyway:defaultSchema}` through it, so a fresh install has a single physical schema and the split can't happen. Schema quoting now uses `Dialect.QuoteIdentifier` (removing a duplicate hand-rolled quoter).

- **Remove (`@memberjunction/open-app-engine`).** (1) A `__`-prefixed app schema couldn't be dropped — install can opt in via `--dangerously-ignore-dbl-underscore-schema-rule` but `remove` had no equivalent, so `DropAppSchema` hit the `'__' reserved` guard. Removal of a *recorded* app's own schema is always legitimate, so the remove path now bypasses that guard (exact reserved names like `__mj` stay blocked). (2) `DropAppSchema` additionally `CASCADE`-drops every case-insensitive schema match on PostgreSQL, which (with canonicalization above preventing new splits) cleans up any LEGACY split. SQL Server unchanged.

Proven live: a schema-backed Open App installs, upgrades, and removes cleanly on a PostgreSQL MJ instance — schema dropped, metadata retired, status `Removed`.

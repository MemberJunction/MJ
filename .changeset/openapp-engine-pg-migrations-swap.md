---
"@memberjunction/open-app-engine": patch
---

fix(open-app): use `migrations-pg` when installing an Open App on PostgreSQL

`HandleMigrations` downloaded exactly `manifest.migrations.directory` (the SQL Server `migrations/` set) on every platform, so installing a schema-backed Open App on a PostgreSQL-backed MJ failed at the migration step with `syntax error at or near "IF"` (T-SQL run against PG) — even though the only PG-aware bit (the Skyway provider) was selected correctly.

It now mirrors core `mj migrate`'s `migrations` → `migrations-pg` swap: on PostgreSQL the engine prefers a sibling `<directory>-pg` folder (the `.pg.sql` set) and falls back to the declared directory when no PG variant exists (dialect-neutral or SQL-Server-only apps). On SQL Server, behavior is unchanged. This is the migration half of making `mj app` db-generic (the provider half shipped separately); with it, a schema-backed app that ships `migrations-pg/` installs cleanly on PostgreSQL.

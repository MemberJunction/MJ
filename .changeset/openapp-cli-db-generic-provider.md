---
"@memberjunction/cli": patch
---

fix(openapp): make the `mj app` CLI db-generic so it works on PostgreSQL, not just SQL Server

`open-app-context.ts` built a SQL Server provider unconditionally, so every `mj app` command (install/upgrade/remove/list/…) ran the SQL Server path against a PostgreSQL database regardless of `DB_PLATFORM` — the OpenApp engine's existing PG support never activated because it was handed a SS provider.

Rather than hand-roll a second platform-aware provider bootstrap, `mj app` now **delegates to MetadataSync's shared `initializeProvider` / `cleanupProvider`** — the same db-generic lifecycle `mj sync` already uses (lazy singleton, SS-or-PG selection, pool teardown, and UserCache population on both platforms via the PG `vwUsers`/`vwUserRoles` bootstrap). `open-app-context.ts` keeps only its own config-field adaptation (`codeGenLogin`/`coreSchema` → `dbUsername`/`mjCoreSchema`) and its lenient Owner/first-active system-user policy. The context's `DatabaseProvider` is `DatabaseProviderBase` so `Dialect.PlatformKey` matches the real database, and SSL is driven by the standard `PG*` env / provider default (managed Postgres like AWS Aurora/RDS via `PGSSLMODE`/`NODE_ENV`), same as `mj sync`. Net: the duplicated provider/teardown/PG-bootstrap code is removed and the direct `@memberjunction/postgresql-dataprovider` dependency (now transitive via MetadataSync) is dropped.

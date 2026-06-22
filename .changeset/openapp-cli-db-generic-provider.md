---
"@memberjunction/cli": patch
---

fix(openapp): make the `mj app` CLI db-generic so it works on PostgreSQL, not just SQL Server

`open-app-context.ts` built a SQL Server provider unconditionally, so every `mj app` command (install/upgrade/remove/list/…) ran the SQL Server path against a PostgreSQL database regardless of `DB_PLATFORM` — the OpenApp engine's existing PG support never activated because it was handed a SS provider. The provider is now selected from `dbPlatform`/`DB_PLATFORM` (SS unchanged; PG mirrors CodeGen's `setupPostgreSQLDataSource`: `SetProvider`, metadata-load interval, and system user from `vwUsers`/`vwUserRoles`), and the context's `DatabaseProvider` is `DatabaseProviderBase` so `Dialect.PlatformKey` matches the real database. SSL is left to the standard `PG*` env / provider default (same as `mj sync`), so managed Postgres (e.g. AWS Aurora/RDS) is driven by `PGSSLMODE`/`NODE_ENV` rather than hardcoded.

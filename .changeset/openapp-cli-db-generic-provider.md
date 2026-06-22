---
"@memberjunction/cli": patch
---

fix(openapp): make the `mj app` CLI db-generic so it works on PostgreSQL (incl. AWS Aurora/RDS), not just SQL Server

`open-app-context.ts` built a SQL Server provider unconditionally, so every `mj app` command (install/upgrade/remove/list/…) ran the SQL Server path against a PostgreSQL database regardless of `DB_PLATFORM` — the OpenApp engine's existing PG support never activated because it was handed a SS provider. The provider is now selected from `dbPlatform`/`DB_PLATFORM` (SS unchanged; PG mirrors CodeGen's `setupPostgreSQLDataSource`), and the context's `DatabaseProvider` is `DatabaseProviderBase` so `Dialect.PlatformKey` matches the real database. SSL is enabled for AWS Aurora/RDS endpoints (which force `rds.force_ssl=1`), with `rejectUnauthorized` following `DB_TRUST_SERVER_CERTIFICATE`.

---
"@memberjunction/cli": patch
"@memberjunction/installer": patch
---

fix(openapp): make the `mj app` CLI honor `DB_PLATFORM=postgresql`, and stop scaffolding `.env` without a `.gitignore`

- **OpenApp PG support (CLI seam).** `open-app-context.ts` built a SQL Server provider unconditionally, so `mj app install/upgrade/remove` ran the SQL Server path even against a PostgreSQL database (the engine's already-merged PG/skyway-postgres support never activated because it received a SS provider). It now selects `PostgreSQLDataProvider` vs `SQLServerDataProvider` from `dbPlatform`/`DB_PLATFORM`, widening the context's `DatabaseProvider` to `DatabaseProviderBase` so `Dialect.PlatformKey` reflects the real database. SSL is resolved to work across local, self-hosted, and managed Postgres (AWS RDS/Aurora `rds.force_ssl=1`), with `rejectUnauthorized` following `DB_TRUST_SERVER_CERTIFICATE`. Pool cleanup is now platform-aware (`Dispose()` for PG).
- **Scaffolding secret leak.** The installer wrote a real `.env` (DB credentials, API keys) but never emitted a `.gitignore`, so a generated project could commit secrets to a public repo. The configure phase now guarantees a `.gitignore` ignoring `.env`/`.env.*` (keeping `.env.example`) — idempotent: appends only missing entries to an existing file.

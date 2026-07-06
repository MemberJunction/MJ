---
"@memberjunction/metadata-sync": patch
"@memberjunction/cli": patch
---

Fix: honor the configured request timeout on the MetadataSync/OpenApp provider pool. `mj app remove` (and other `mj app …` / `mj sync` commands sharing this provider) built the SQL Server connection without `requestTimeout`, so it silently fell back to mssql's 15s default — dropping a large app schema could time out regardless of `dbRequestTimeout` config. The configured value now flows through `toMJConfig` → `MJConfig.dbRequestTimeout` → the mssql pool's `requestTimeout` (and the PostgreSQL client's `statement_timeout` for parity). When unset, each driver's own default still applies.

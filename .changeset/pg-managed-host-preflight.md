---
"@memberjunction/cli": patch
"@memberjunction/installer": patch
---

`mj migrate` on PostgreSQL now checks the database before it applies the first migration, and `mj doctor --db` runs the same checks on their own. The checks cover the server version (14 or later), the `cdp_*` group roles, the extensions the pending migrations create (including the `azure.extensions` allowlist on Azure), whether the migrate login has `CREATE` on the database and owns the target schema, TLS, and `max_connections`. When a check fails, the command exits non-zero with the SQL an administrator must run. That SQL comes from the installer's `BuildPostgresSetupSteps`, which `@memberjunction/installer` now exports with `POSTGRES_MJ_GROUP_ROLES`, `POSTGRES_MJ_EXTENSIONS`, `QuotePgIdentifier`, `QuotePgLiteral` and `PgSetupStep`. Before this, an unprovisioned database failed partway through the baseline. Pass `--skip-preflight` to skip the checks.

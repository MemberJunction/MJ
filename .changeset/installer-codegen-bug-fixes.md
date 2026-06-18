---
"@memberjunction/installer": minor
"@memberjunction/codegen-lib": patch
---

Install-pipeline + codegen-lib bug fixes surfaced during E2E testing.

**Installer (`@memberjunction/installer`):**

- **ConfigurePhase** — checkpoint resume no longer corrupts `.env` on restart. The resume path now reads-then-merges instead of re-writing empty defaults, so a partially-completed install can pick up where it left off without losing user-entered credentials.
- **ConfigurePhase** — `syncEnvFieldsFromRoot()` now propagates `PG_HOST` / `PG_PORT` / `PG_DATABASE` / `PG_USERNAME` / `PG_PASSWORD` in addition to the SQL-Server-style `DB_*` keys, so a PostgreSQL install whose root `.env` uses PG-prefixed env vars keeps the MJAPI `.env` in sync on re-run.
- **ConfigurePhase / DependencyPhase** — `tagToNpmVersion()` does strict semver validation and falls back to `latest` for non-semver tags, so branch refs like `feature/some-branch` no longer get passed to `npm install --tag` (npm interprets those as GitHub shorthand and ssh-clones).
- **DatabaseProvisionPhase** — `mj-db-setup.sql` skips `CREATE LOGIN`, `CREATE USER`, `ALTER ROLE`, and `GRANT EXECUTE` when the configured DB user is a SQL Server built-in sysadmin (`sa`). `isBuiltInSysadmin()` guard added with 5 unit tests.
- **MigratePhase** — migration timeout is now configurable via the `MJ_INSTALL_MIGRATE_TIMEOUT_MIN` env var, with an accurate error message on timeout.
- **PreflightPhase + DatabaseProvisionPhase** — both phases now honor the actual `.env` target path during connectivity preflight, reading `PG_HOST` / `PG_PORT` first then falling back to `DB_HOST` / `DB_PORT`. Matches `codegen-lib`'s `DEFAULT_CODEGEN_CONFIG` precedence so a PG `.env` doesn't yield a false-negative "missing credentials" warning.
- **models/InstallConfig** — accept user-facing `AuthProviderValues` key shapes (`ClientID` / `TenantID` for entra, `Domain` / `ClientID` for auth0) and add a legacy-alias compat layer so existing camelCase `install.config.json` files (`dbUrl` / `codeGenLogin` / `msalWebClientId` / etc.) keep working alongside the new PascalCase shape.

**CodeGen-lib (`@memberjunction/codegen-lib`):**

- **`Config/db-connection.ts`** — mssql config is now built lazily inside `MSSQLConnection()` instead of destructured at module load. The previous behavior captured empty defaults before `initializeConfig()` populated them, producing `"config.server property is required"` at codegen time. The exported mutable `sqlConfig` `let` was refactored into a `getSqlConfig()` accessor function (no exposed mutable storage). JSDoc explicitly clarifies the file is SQL-Server-only.
- **`Config/config.ts`** — schema-validation failures in `initializeConfig()` now surface via `LogError`. A visible error beats a silent empty `configInfo` plus a downstream `"config.server"` crash.
- **`runCodeGen.ts`** — single consumer updated to use the new `getSqlConfig()` accessor instead of importing `sqlConfig` directly.

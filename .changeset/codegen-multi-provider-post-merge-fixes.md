---
"@memberjunction/codegen-lib": patch
"@memberjunction/postgresql-dataprovider": patch
---

Post-merge follow-up to PR #2854 (`refactor(codegen-lib): multi-provider SetupDataSource + PostgreSQL pool symmetry`), addressing review feedback. Bug-fix scope only — no migration, no schema changes — so this is patch under the same convention PR #2854 followed.

**Behavior fixes (silent regressions introduced by PR #2854):**

- **PG_* env-var precedence regressed when `dbPlatform` was set only in `mj.config.cjs`.** `_resolveConnEnv()` keyed its PG_* check on `_IS_PG_DEFAULT`, which derives from `process.env.DB_PLATFORM` alone. A user who set `dbPlatform: 'postgresql'` in their `mj.config.cjs` (no `DB_PLATFORM` env var) and supplied the host via `PG_HOST` would silently connect to `localhost`. New helper `applyPlatformDependentEnvVars()` runs *after* `mergeConfigs(DEFAULT_CODEGEN_CONFIG, userConfig)` to re-apply PG_* precedence to any field the user didn't explicitly set in `mj.config.cjs`, restoring the pre-refactor behavior (`process.env.PG_HOST ?? configInfo.dbHost`). Wired into both the module-load merge and `initializeConfig()`.

- **SSL silently flipped on in `NODE_ENV=production`.** PR #2854's `buildPgConfig()` didn't set `SSL`, so `PGConnectionManager.Initialize()`'s `ssl: config.SSL ?? (process.env.NODE_ENV === 'production')` default kicked in — flipping codegen against non-SSL/locally-bridged PostgreSQL from off (the pre-refactor inline `pg.Pool` behavior) to on under any production shell. `buildPgConfig()` now passes `SSL: false` by default and exposes a new optional `codegenPool.ssl` knob (boolean or pg-ssl object) for callers that genuinely need SSL.

- **`statement_timeout` GUC missed the verify-SELECT-1 connection.** The runtime `connect` listener was attached *after* `PGConnectionManager.Initialize()` had already opened, used, and released the first physical connection for its `SELECT 1` health check. That first warm client gets reused later without the GUC. The fix carries the timeout via the libpq `-c statement_timeout=<ms>` startup option (new optional `PGConnectionConfig.Options` field, threaded into the `pg.Pool` config), so every backend honors it from query #1 — including the verify connection. The runtime listener is removed entirely; the connect-string path is both correct and simpler.

**Warning hygiene:**

- The PG_*/DB_* precedence `console.warn` is now de-duplicated across the
  module-load merge, the post-merge `applyPlatformDependentEnvVars` pass,
  and any subsequent `initializeConfig()` calls. Without de-dup, a single
  env-var divergence would emit 2–3 identical warnings; now it emits once
  per `<pgEnv>:<ssEnv>` pair per process. A module-level set tracks which
  pairs have already warned.

**Doc / API clarity:**

- `codegenPool` JSDoc + CLAUDE.md now spell out per-provider applicability: `statementTimeoutMs` is cross-platform; `max` / `min` / `idleTimeoutMillis` / `connectionTimeoutMillis` / `ssl` are PG-only today. Previously the docs claimed cross-platform application of pool-sizing knobs, but only `statementTimeoutMs` is wired into `buildSqlConfig()` — so a user setting `codegenPool.max: 50` for SQL Server was silently ignored.
- Added a `KEEP IN SYNC` comment near `DEFAULT_CODEGEN_CONFIG` pointing to `applyPlatformDependentEnvVars`'s `overrides` table — the two share the same set of PG_*/DB_* env-var pairs and must be updated together.
- Fixed JSDoc typo `@memberjunction/postgresql-data-provider` → `@memberjunction/postgresql-dataprovider`.

**Test quality:**

- `setupDataSource.test.ts` now exercises the actual `resolveCodeGenDatabaseProvider()` function the orchestrator delegates to, instead of re-implementing the factory call inline. The orchestrator's "not registered → throw with descriptive message" branch is now genuinely covered — previously the assertions would have kept passing even if the real method had drifted. The dispatch logic was extracted from `RunCodeGenBase.setupDataSource()` into a free function on `codeGenDatabaseProvider.ts` to make this possible without forcing the test to import the heavy `runCodeGen.ts` module.
- New `db-connection.test.ts` covers the SQL Server `codegenPool.statementTimeoutMs` → `dbRequestTimeout` → 120000 precedence chain — previously only validated E2E. `buildSqlConfig` is exported for the test (sole production caller remains `MSSQLConnection()`).
- New `applyPlatformDependentEnvVars.test.ts` covers the helper added by this PR: short-circuit on non-PG `dbPlatform`, PG_* override semantics, user-explicit precedence, non-numeric PG_PORT handling, and warning de-dup (single warning across multiple `initializeConfig()` calls). The function is exported solely for testing — production code only calls it internally.

**`@memberjunction/postgresql-dataprovider`:** additive — `PGConnectionConfig` gains an optional `Options` field threaded into `pg.PoolConfig.options`. Existing consumers that don't set it see identical behavior.

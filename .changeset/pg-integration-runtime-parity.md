---
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/testing-engine-base": patch
"@memberjunction/testing-engine": patch
"@memberjunction/testing-integration": patch
"@memberjunction/testing-cli": patch
"@memberjunction/integration-test-suite": patch
"@memberjunction/server": patch
"@memberjunction/metadata-sync": patch
---

Run the deterministic integration suite against PostgreSQL as a second blocking CI lane, so SS/PG
runtime parity is verified rather than assumed (#3257). Previously every release shipped PostgreSQL
with migration parity verified and **runtime parity unverified** — the suite could not execute on it
at all.

Closing that surfaced two things CI had never actually been running:

- **`metadata-consistency` (MC1–MC8) had never executed on either platform.** `ctx.Pool` comes from
  the active bootstrap context and the `mj test` CLI never published one, so the pool was `undefined`
  on SQL Server too and all eight catalog-audit checks skipped-as-pass. The CLI now publishes that
  context and they run for the first time.
- **The 52 mutation-tier checks across 12 bundles had never run in CI.** No workflow set
  `RUN_MUTATION_TESTS`; both lanes now do, which the new CRUD parity checks require.

Three code changes made the PostgreSQL run possible:

- **`UserCache.RefreshFromRows(users, roles, provider)`** — a platform-neutral data-in seam owning the
  role join and `UserInfo` construction, which each backend feeds in its own dialect. `Refresh(pool)`
  stays the mssql feeder. MJServer and MetadataSync had both been working around the mssql-only
  `Refresh` by smashing the private `_users` field through an `as unknown as` cast; both now call the
  real API. **Behavior change: both throw on an empty user set** where they previously started with no
  users, because a silently empty cache is invisible at the call sites (`GetSystemUser()` merely
  returns `undefined`). `_users` is initialized to `[]` and untouched on a throw, so the call sites
  that dereference `.Users` unguarded stay safe.
- **A platform branch in the testing CLI.** `config-loader` gains `dbPlatform` plus environment
  fallbacks — it previously returned the raw cosmiconfig result with no merge, so `DB_PLATFORM` was
  unreadable on this path in principle. The PostgreSQL path runs `StartupManager.Startup` explicitly,
  which the SQL Server path gets free inside `setupSQLServerClient`; omitting it would run the PG lane
  through a different engine-initialization sequence and misattribute harness gaps to parity bugs.
- **A real `Skipped` status.** `buildSkipResult` hard-coded `status: 'Passed'` because
  `DriverExecutionResult['status']` had no `'Skipped'`, making "never ran" indistinguishable from
  "verified" in every count, report and exit code. The union is widened, `TestSuiteRunResult` gains
  `skippedTests`, and suite aggregation, summary statistics and both CLI formatters are now
  skip-aware — skips are excluded from pass/fail ratios and from `averageScore` rather than counted on
  either side, and the pass rate is computed over executed tests.

Adds the `pg-parity` bundle (PG1 CRUD round-trip, PG2 mixed-case identifier quoting, PG4 UUID/boolean/
datetime type fidelity, PG5 OFFSET + keyset pagination) and its IT68 record. It carries **no** platform
declaration and runs on both backends by design: every check asserts a platform-independent invariant,
so SQL Server acts as the baseline oracle that makes a PostgreSQL failure legible. PG3 is dropped —
no composite-PK entity exists in the v5 schema, so it would have no target, and its anchored defect is
a CodeGen-time bug this lane cannot reach.

Bundles may now declare `RegisterBundlePlatforms(bundle, platforms)`, but only for **dialect-impossible**
cases: `metadata-consistency` is the sole declared bundle, because its `sys.*` catalog queries have no
PostgreSQL equivalent. A bundle that can run on both platforms and fails on one has found a parity bug
and stays red — the declaration is not a quarantine list.

Also fixes the #3251 ordering guard, which publishing a bootstrap context would otherwise have killed
silently: it inspected the resolved provider, which a published context makes always-`Database`, so it
now also inspects the process-global provider where a client rebind is actually visible.

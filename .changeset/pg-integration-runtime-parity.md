---
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/testing-engine-base": patch
"@memberjunction/testing-engine": patch
"@memberjunction/testing-integration": patch
"@memberjunction/testing-cli": patch
"@memberjunction/integration-test-suite": patch
"@memberjunction/server": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/ng-testing": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/core-entities": patch
---

Run the deterministic integration suite against PostgreSQL as a second blocking CI lane, so SS/PG
runtime parity is verified rather than assumed (#3257). Previously every release shipped PostgreSQL
with migration parity verified and **runtime parity unverified** — the suite could not execute on it
at all.

Closing that surfaced two things CI had never actually been running:

- **`metadata-consistency` had never executed on either platform.** `ctx.Pool` comes from
  the active bootstrap context and the `mj test` CLI never published one, so the pool was `undefined`
  on SQL Server too and all seven catalog-audit checks (MC1–MC6 and MC8; MC7 is deliberately
  unimplemented) skipped-as-pass. The CLI now publishes that context and they run for the first time.
- **47 mutation-tier checks across 12 bundles had never run in CI.** No workflow set
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
  `skippedTests`, and suite aggregation, summary statistics and every formatter — console, Markdown
  and the published `@memberjunction/testing-engine` renderers — are now skip-aware. Skips are
  excluded from pass/fail ratios and from `averageScore` rather than counted on either side, and the
  pass rate is computed over executed tests.

Two long-standing false greens surfaced while wiring that up, and are fixed here because the new lane
is built on them:

- **`mj test suite` exited 0 on `Error` and `Timeout`.** Suite `failedTests` counted only
  `status === 'Failed'`, while the persisted `MJTestSuiteRun` row counted by subtraction — the two
  disagreed, and the weaker one drove the exit code. A suite that errored on every test reported
  green. Both now share one `summarizeSuiteResults`, which is failure-closed: anything that is
  neither a pass nor a deliberate skip counts as a failure, so a status added to the union gates the
  build until someone decides otherwise. `ErrorTests` and `SkippedTests` — columns that already
  existed and had never been written — are now persisted, so `Passed + Failed + Errors + Skipped`
  reconciles against `Total` in Explorer. The persisted `FailedTests` is the DISJOINT
  assertion-failure bucket, since the suite-run form renders those four as sibling tiles; the
  overlapping gate value (`Failed + Errors`) stays on the in-memory result, where it decides the
  exit code and nothing else.
- **Client-transport bundles reported `Error`, not `Skipped`, on every CI run.** `LoadClientConfig`
  threw on a missing `MJ_API_KEY` *before* the MJAPI preflight was reached, and the driver's skip
  branch matched only the preflight's message text. CI sets no `MJ_API_KEY`, so all
  client-transport members of the deterministic suite errored on both lanes — invisible only because
  of the exit-code bug above. The condition is now a named `IntegrationEnvironmentUnavailableError`
  raised by both throw sites and matched by type, so a third throw site cannot be one forgotten regex
  away from being misreported. CI evidence: **19 of the 54 deterministic tests** were erroring on
  every SQL Server run and the lane still exited 0. **Expect 19 skips on the SQL Server lane and 20
  on PostgreSQL**, where 0 were reported before. Restoring that coverage needs an MJAPI in CI and is
  deliberately out of scope here — this change makes the gap visible and countable first.

Adds the `pg-parity` bundle (PG1 CRUD round-trip, PG2 mixed-case identifier quoting, PG4 UUID/boolean/
datetime type fidelity, PG5 OFFSET + keyset pagination) and its IT68 record. It carries **no** platform
declaration and runs on both backends by design: every check asserts a platform-independent invariant,
so SQL Server acts as the baseline oracle that makes a PostgreSQL failure legible. PG3 is dropped —
no composite-PK entity exists in the v5 schema, so it would have no target, and its anchored defect is
a CodeGen-time bug this lane cannot reach.

Bundles may now declare `RegisterBundlePlatforms(bundle, platforms)`, but only for **dialect-impossible**
cases: `metadata-consistency` is the sole declared bundle, because its `sys.*` catalog queries have no
PostgreSQL equivalent. A bundle that can run on both platforms and fails on one has found a parity bug
and stays red — the declaration is not a quarantine list. An excluded bundle is dropped from the run
even when selected alongside runnable ones (executing it would either throw on its impossible SQL or
self-skip internally), and the dropped bundles are named in a gate oracle so the omission is recorded
rather than silent.

It also unblocked `mj sync push`, which could not save a dashboard on **either** platform.
`DashboardEngine.GetDashboardPermissions` answers from an in-memory cache and returned
"no permissions" when that cache was never loaded — so an UNCONFIGURED engine was
indistinguishable from a genuine denial. `mj sync push` runs `StartupManager` in `'task'` mode,
which pre-warms no engines, so every dashboard push was rejected with "You do not have permission
to edit this dashboard" — a message describing a problem that did not exist. The result now carries
`PermissionSource: 'unevaluated'` for that state (grants stay false, so it is not an escalation),
and both the `Validate()` and `Delete()` gates skip-and-log rather than deny. The sharing model is
still enforced wherever it is the security boundary: MJAPI pre-warms the engine via `StartupManager`
`'full'` and Explorer configures it before rendering, so only the CLI and metadata-sync paths —
which run as the System user against declarative metadata — reach the unevaluated branch.

Standing the lane up surfaced a PostgreSQL provider bug worth its own mention: `autoQuoteIdentifiers`
carried `NAME` in its **case-insensitive** keyword set (PostgreSQL has a `name` type), so the PascalCase
column `Name` — the single most common column in the MJ schema — was treated as a keyword and left
unquoted. PostgreSQL folded it to `name` and rejected the statement with `column "name" does not exist`,
breaking every hand-written SQL string in the codebase that referenced it. `TYPE` and `DATA` had already
been rescued from exactly this collision via an all-caps-only set; `NAME` now joins them, so the DDL
keyword form still parses while the column form is quoted.

Also fixed on the SQL Server path: `UserCache.Refresh` stopped re-arming its auto-refresh timer when
`vwUsers` came back empty, because the new fail-loud `RefreshFromRows` threw before the `setTimeout`.
That timer is the cache's only self-healing mechanism, so a single transient empty read — a login that
momentarily cannot read the view, a replica mid-reload — froze the cache for the life of the process.
The timer now re-arms whenever the queries themselves succeeded; an unreachable database still stops
the loop, as it always has.

Also fixes the #3251 ordering guard, which publishing a bootstrap context would otherwise have killed
silently: it inspected the resolved provider, which a published context makes always-`Database`, so it
now also inspects the process-global provider where a client rebind is actually visible.

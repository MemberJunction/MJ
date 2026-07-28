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
  every SQL Server run and the lane still exited 0. **Expect 19 skips on the SQL Server lane and 21
  on PostgreSQL** (the same 19, plus IT24 and IT67), where 0 were reported before. Restoring that
  client coverage needs an MJAPI in CI and is deliberately out of scope here — this change makes the
  gap visible and countable first.

Standing the lane up red-to-green surfaced three things, which is the point of it:

- **A real product defect**, shipped on both platforms — a User Routine run could be stranded at
  `Status = 'Running'` forever by an FK race against the fire-and-forget action-log INSERT. Fixed
  separately (see the `user-routine-run-action-log-fk-race` changeset) because it is a behavior
  change in `@memberjunction/actions` / `@memberjunction/scheduling-engine`, not test infrastructure.
- **Two checks that asserted a coincidence.** `server-cache` S15 and S27 compared a DATABASE sort
  against JavaScript's `localeCompare`. Those are different collations: PostgreSQL clusters use
  glibc `en_US.utf8`, which ignores spaces at the primary level and so orders `MJ: AI Models` before
  `MJ: AI Model Types`, while ICU orders them the other way — 49 such pairs exist in that entity
  alone. SQL Server's default collation happens to agree with ICU, which is the only reason the
  assertions ever held. Both now assert relationships that no collation can disagree about: S15 that
  the cache HIT returns the same order as the MISS (which is what it is named for), and S27 that DESC
  is ASC reversed.
- **A provisioning gap.** `MJ: Content Item Chunks` has no PostgreSQL counterpart migration, so the
  `content-vectorization` bundle has no target there and failed four times over with "Entity not
  found in metadata". It is declared `['sqlserver']` so the lane reports an honest, COUNTED `Skipped`
  — the bundle's own internal skip path would have returned six vacuous *green* checks, which is the
  failure mode this changeset exists to remove. This is explicitly a **temporary provisioning
  exclusion, not a dialect impossibility**, and it is the one stated exception to the rule that
  platform declarations are never a quarantine list: unlike `metadata-consistency`, this bundle is
  perfectly runnable on PostgreSQL and the declaration must be deleted as soon as the migration is
  ported. Until then the PostgreSQL lane has no content-vectorization coverage, and the asserted skip
  count is what keeps that visible rather than forgotten.

Both lanes now **assert their skip count** (19 on SQL Server, 21 on PostgreSQL) rather than only
documenting it. Skips are deliberately excluded from `failedTests`, so a bundle that silently stops
running — a `RegisterBundlePlatforms` used as a quarantine, a dropped `RUN_MUTATION_TESTS`, a new
client-transport member — raises that number while the build stays green. That is the same false
green this changeset is otherwise about, so the number is now a gate: a missing count fails too,
because silence must not read as zero.

Relatedly, a check filtered out by its tier now records a `gate` oracle naming what did not run.
Previously the score was computed over the checks that RAN, so a bundle with 8 of 9 checks filtered
reported 1/1 = 100%, and a bundle with all of them filtered reported `Skipped` with no reason
recorded at all. The platform gate already worked this way; the tier filter did not.

`TestEngine` also no longer DROPS a test that throws before producing a result (a failed
`createTestRun`, an unresolvable test type, a driver that will not instantiate). Those landed in a
per-test catch that logged and moved on without recording anything, and every count derives from the
results array — so a vanished test shrank `totalTests` instead of going red, and a suite where every
test failed to start reported `0/0 passed` and exited 0. They are now recorded as `Error`.

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
to edit this dashboard" — a message describing a problem that did not exist.

The fix is to **load the engine before consulting it**, not to excuse the unloaded case:
`MJDashboardEntityExtended` now calls `EnsureLoaded` from `Save()` (whose `Validate()` is
synchronous and cannot await) and from `Delete()`, then honours the real answer. That resolves the
CLI failure on genuine ownership — every dashboard in `metadata/dashboards` is
`UserID: @lookup:MJ: Users.Name=System` and `mj sync push` runs as System, so it now passes the
gate because it *owns* the records, not because the gate was skipped.

The result additionally carries `PermissionSource: 'unevaluated'` to distinguish "could not
evaluate" from "evaluated to no" — grants stay false either way, so both gates **fail closed** on
it. That distinction is diagnostic, not permissive: these two gates are the only server-side
enforcement of dashboard sharing (the GraphQL `UpdateMJDashboard`/`DeleteMJDashboard` resolvers
reach them through `BaseEntity`, and no MJServer code configures the engine), and the unloaded
state is genuinely reachable inside a live MJAPI — `BaseEngine.Load` leaves `_loaded` false
*without throwing* when a config fails, and `MJ_STARTUP_MODE=task` skips pre-warm entirely. Treating
that as permission-to-proceed would have let any authenticated user edit or delete any dashboard.

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

**Consumer-visible surface changes** (additive, but worth knowing before upgrading):

- `TestSuiteRunResult` gains a **required** `skippedTests: number`. Code that READS the result is
  unaffected; code that CONSTRUCTS one — a custom harness, a test fixture, a mock — must supply it.
  In-repo there is exactly one producer (`TestEngine.RunSuite`).
- `DriverExecutionResult['status']` gains `'Skipped'`. An exhaustive `switch` over that union in a
  custom driver now has an unhandled case.
- `MJTestSuiteRun.FailedTests` **changes meaning**. It was "everything not passed" (assertion
  failures + errors + timeouts + skips), with `ErrorTests`/`SkippedTests` never written; it is now
  the disjoint assertion-failure bucket, with the other two populated. Rows written before this
  release use the old convention and are not comparable — the suite-run trend chart and CSV export
  in Explorer read the column directly, so date-fence any analysis that spans the upgrade.
- `generateSummaryStatistics` now excludes skips from `passRate`'s numerator and denominator and
  from `averageScore`. A consumer whose drivers already emitted `'Skipped'` (the status predates
  this branch) will see both values move without changing anything on its side.
- `autoQuoteIdentifiers` now quotes `Name` (see below). Hand-written SQL that referenced a genuinely
  **lowercase** `name` column using `Name` casing — a stored `MJ: Queries.SQL`, a `RunView`
  `ExtraFilter`, a DDL batch — previously worked by accident and now resolves to `"Name"`. Nothing
  in this repo does that; customer-authored SQL might.

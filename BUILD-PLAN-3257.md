# Build Plan — #3257: Integration suite runs against PostgreSQL (SS/PG runtime parity)

**Branch:** `feat/3257-pg-integration-parity` · **Target release:** v5.50.0 (build 2026-07-28)
**Scope:** all four work items land in this branch, validated by throwaway builds before the release build.
**Status:** v2 — corrected after Opus-5 verification (29 agents, 6 dimensions, adversarial verify). 18 findings confirmed and folded in; see §7 for what changed and why.

---

## 1. Problem

The integration suite is intended to run twice per build — once per backend — so SS/PG parity is *verified*, not assumed. Today it cannot execute on PostgreSQL at all. Every release ships PG with migration parity verified and **runtime parity unverified**. Three blockers, all in code:

1. **CLI is SQL-Server-hardcoded** — `TestingFramework/CLI/src/lib/mj-provider.ts` imports `mssql` + `setupSQLServerClient` with no platform branch; `suite.ts`/`run.ts`/`validate.ts`/`compare.ts`/`list.ts` all reach it; the CLI's `package.json` has no PG driver. The CLI's own `MJConfig` (`config-loader.ts:15-50`) has **no `dbPlatform` field at all**, and `loadMJConfig` returns the raw cosmiconfig result (`:81`) with no env-merged defaults — so `DB_PLATFORM` is unreadable on this path even in principle.
2. **The PG bootstrap throws by design** — `testing-integration/src/bootstrap.ts` `resolvePostgresContextUser` throws because `UserCache.Refresh` (`SQLServerDataProvider/src/UserCache.ts:36`) is hard-typed to `sql.ConnectionPool`, runs T-SQL bracket syntax, and swallows errors (`catch { LogError }` at `:59-61`) — the cache stays silently empty on PG regardless of DB contents.
3. **The suite reports false greens, on BOTH platforms.** The driver has no way to express "skipped": `DriverExecutionResult.status` (`Engine/src/types.ts:195`) is `'Passed' | 'Failed' | 'Error' | 'Timeout'`, and `buildSkipResult` (`IntegrationTestDriver.ts:462-474`) hard-codes `status: 'Passed'` — its own comment at `:128` says *"the driver result enum has no 'Skipped'"*.

### 1a. What verification discovered — CI has been running less than anyone thought

Two pre-existing false-greens in the **SQL Server** lane, both load-bearing for this work:

- **`metadata-consistency` (MC1–MC8) has never executed in CI — on either platform.** `ctx.Pool` is sourced from `getActiveIntegrationBootstrap()?.Pool` (`IntegrationTestDriver.ts:391`), and the *only* writer of that context is `bootstrap.ts:100` inside `bootstrapIntegrationServer`. On the `mj test` path the CLI calls `installInstrumentedCacheFirst()` (`suite.ts:40`), which sets `activeStorage` only (`bootstrap-shared.ts:143-154`) — so `activeBootstrap` is null, the driver's `if (!storage)` self-bootstrap branch is skipped (storage *is* set), and `ctx.Pool` is `undefined`. `poolOrSkip` (`metadata-consistency.checks.ts:102-107`) then skips-as-pass. The plan's original premise — "undefined on PG", implying defined on SS — was wrong.
- **The 52 mutation checks across 12 bundles never run in CI.** `RUN_MUTATION_TESTS` is set in no workflow and no npm script (`tiers.ts:25` is the gate; `IntegrationTestDriver.ts:271-276` enforces per check). The v5.49 evidence quoted in #3257 ("52/52 with the mutation axis enabled") describes a **local release-procedure run**, not the gating CI lane.

Both matter here: without fixing them, a PG lane would inherit the same blind spots and the parity claim would be padded exactly the way this issue exists to stop.

### 1b. Key discovery — production already fakes the PG user cache

`UserCache` is already populated on PG in production, twice, by smashing the private `_users` field through an `as unknown as` cast:
- `MJServer/src/index.ts:1735` `refreshUserCacheFromPG` (smash at `:1752`; schema **unquoted** in its SQL — latent divergence from MetadataSync's quoted form, logged as follow-up)
- `MetadataSync/src/lib/provider-utils.ts` `refreshUserCacheFromPG` (near-verbatim copy, same smash)
- `PostgreSQLCodeGenProvider` hand-queries but builds a local `UserInfo[]`, never touching the cache

So the "PG-aware user-cache bootstrap" is not research — it is promoting an API that three copies already fake.

---

## 2. Decisions

| # | Decision | Choice |
|---|---|---|
| Q1 | Scope | All 4 items in this branch for 5.50 |
| Q2 | User cache | **Option C**: additive `UserCache.RefreshFromRows(users, roles, provider)` — platform-neutral data-in method; no relocation (30 consumers + no-re-export rule); mssql `Refresh(pool)` becomes one feeder of it. **Fail-loud**: validates and throws. **Correction:** `_users` is initialized to `[]` at declaration so a throw can never leave it `undefined` (see F4) |
| Q3 | CLI | **Option B**: in-place platform branch in `mj-provider.ts` (not delegation to `bootstrapIntegrationServer`, which would couple `validate`/`compare`/`list`/`run` to integration-suite process-ownership invariants). PG via dynamic import of `@memberjunction/postgresql-dataprovider` in `optionalDependencies`. Shared PG user-feeder lives once in testing-integration, exported; `mj-provider.ts` and `bootstrap.ts` both call it |
| Q4 | Skip semantics | **Option B, enlarged**: bundle-level platform declaration → a genuine `'Skipped'` status. **Correction:** this requires widening `DriverExecutionResult['status']` in `@memberjunction/testing-engine` and making suite aggregation + reporting skip-aware — not the `testing-integration`-only change originally scoped (see F1). **Boundary unchanged**: platform-skip is only for *dialect-impossible* bundles; a bundle that fails on PG is a parity bug and stays red — never a quarantine list |
| Q5 | Dedup scope | **Option B**: migrate both production smash sites to `RefreshFromRows`; queries stay as-is. **Accepted behavior change**: MJAPI booting against an empty-users PG DB now fails loudly. CodeGenLib untouched (tracked follow-up) |
| Q6 | CI lane | **Blocking** second job in `integration.yml` (not a YAML matrix — the lanes share almost no steps). Throwaway builds validate before 5.50 |
| Q7 | Bundle | `pg-parity`, runs on **both** platforms (SS = baseline oracle, PG = platform under test). **Corrections:** record is **IT68** (IT67 is taken), **PG3 is dropped** (no target exists), and the checks must be reachable by the gating lane (see D1) |
| Docs | Location | No CONTEXT.md / ADRs (not this repo's convention). Rationale → TestingFramework `README.md`; release steps → `DEPLOYMENT.md` Steps 4, 8, 9 |

### D1 — RESOLVED (2026-07-27): the mutation axis

**Decision: `RUN_MUTATION_TESTS=1` on BOTH lanes** — the recommendation below, taken as-is.
Implemented at `.github/workflows/integration.yml` on both the `integration-sqlserver` and
`integration-postgresql` jobs.

Forced rather than chosen: every one of the 52 writes in the suite is marked `RequiresMutation: true`,
which is the shipped convention, so `pg-parity`'s CRUD legs (PG1, PG4) cannot be authored as
deterministic without breaking it. Without the flag the bundle would register, dispatch and skip
every write check.

**Outstanding risk — Risk 2 below is NOT yet retired.** This newly activates 52 dormant mutation
checks on the *gating* SQL Server lane. They are self-cleaning and the release procedure has run
them locally (v5.49: "52/52 with the mutation axis enabled"), but they have never run in CI.
**A throwaway build must validate the SQL Server lane before the release build.**

<details><summary>Original framing (kept for the reasoning)</summary>

`pg-parity`'s catalogued checks are tagged `PG/MUT`, and PG1 ("create → read → filter → delete") and PG4 (value round-trip) are inherently writes. Since CI sets `RUN_MUTATION_TESTS` nowhere, an as-catalogued bundle would register, dispatch, and **skip every check** — a green lane proving nothing.

**Recommendation: set `RUN_MUTATION_TESTS=1` on BOTH lanes.** It makes the lanes symmetric (required for the SS-as-baseline-oracle design), matches what the release procedure already does locally, and is the only way the CRUD-parity checks execute. **Risk:** this newly activates 52 dormant mutation checks on the gating SS lane — they must be validated in a throwaway build before the release build. *This is the one call with real release-day risk; the narrower fallback is to author only the read-path checks (PG2, PG5, and read-only legs of PG1/PG4) as deterministic and defer the mutation legs, which yields weaker but still-real parity coverage.*

</details>

---

## 3. Work breakdown (build order)

### Step 1 — `UserCache.RefreshFromRows` (`packages/SQLServerDataProvider/src/UserCache.ts`)
- New public method `RefreshFromRows(users, roles, provider)`: builds `UserInfo[]` with `UserRoles` attached via `UUIDsEqual`, assigns `_users`.
- **Initialize `private _users: UserInfo[] = []` at declaration.** Today an empty recordset still assigns `[]` (`:45-50`); if a guard-throw left `_users` `undefined`, ~8 unguarded `.Users.find(...)` / `.Users[0]` dereferences would raise `TypeError` instead of the intended contextual error (`config.ts:44`, `MJServer/src/index.ts:330,392,530`, `context.ts:400`, `bootstrap.ts:44`, `sql_codegen.ts:1455`, `SQLServerCodeGenProvider.ts:83-84`, `mj-provider.ts:192`). The array postcondition is what those callers actually depend on.
- **`provider` is an explicit parameter**, not `Metadata.Provider` — a new public API must not bake in the global-provider anti-pattern. `Refresh(pool)` passes `Metadata.Provider` (preserving today's behavior, with the existing `global-provider-ok` annotation).
- Guard clauses throw with context on empty/missing users; empty roles is legal. No catch-and-log.
- `Refresh(pool)` refactors to: run its two T-SQL queries → delegate. Its outer catch/LogError and the `autoRefreshIntervalMS` re-arm both stay (SS callers depend on them). Follow-up logged to make `Refresh` fail-loud too.
- Tests in existing `__tests__/user-cache.test.ts`: happy path, role attachment, empty-users throw, roles-empty OK, **`_users` remains `[]` after a throw**.

### Step 2 — Shared PG feeder (`packages/TestingFramework/testing-integration/`)
- Exported `feedUserCacheFromPG(queryable, coreSchema, provider)`: accepts a pg-pool-shaped `{ query(sql): Promise<{rows}> }` (structural type — no `pg` dependency needed), runs `SELECT * FROM "schema"."vwUsers"` / `"vwUserRoles"` (quoted-schema form), calls `RefreshFromRows`. Throws on query failure.
- `bootstrap.ts` `setupPostgreSQLProvider`: replace the `resolvePostgresContextUser` throw-path with feeder + normal context-user resolution. Delete `resolvePostgresContextUser` entirely — once the feeder is fail-loud its "residual empty cache" branch is unreachable; `resolveContextUser` already raises a good error. Rewrite the stale "Phase-0 prerequisite" / "non-blocking lane" comments.

### Step 3 — Production smash-site migration
- `MJServer/src/index.ts` and `MetadataSync/src/lib/provider-utils.ts`: replace the `_users` cast-smash with `UserCache.Instance.RefreshFromRows(users, roles, provider)`. Each site also sheds its now-dead local `UserInfo` mapping and `UUIDsEqual` role-join (more than the "2-line diff" originally claimed — roughly the whole body of each helper collapses into the call). Query SQL untouched.
- Accepted: both paths now throw on empty users.

### Step 4 — CLI platform branch (`packages/TestingFramework/CLI/`)
- **`src/utils/config-loader.ts` first**: add `dbPlatform` to `MJConfig` and merge env-driven defaults over the cosmiconfig result (mirroring `MetadataSync/src/lib/config-manager.ts:18,33,142`). Without this the branch is unreachable — the repo-root `mj.config.cjs` never sets `dbPlatform`, and `loadMJConfig` merges nothing.
- **Platform-aware port**: `mj.config.cjs:44` hardcodes `1433` whenever `DB_PORT` is unset, and `mj-provider.ts:86` re-applies `1433` as its own fallback. Resolve the default from the platform (5432/1433) as `testing-integration/src/config.ts:88-89` does, *and* set `DB_PORT=5432` explicitly in the PG job (belt and braces — the committed config would otherwise override a platform default).
- `src/lib/mj-provider.ts`: branch on the resolved platform. PG path = dynamic import of `@memberjunction/postgresql-dataprovider` (comment citing dynamic-import category 2) → `PostgreSQLProviderConfigData` → `provider.Config` → `SetProvider` → shared feeder → **`StartupManager.Instance.Startup(...)`**. That last call is not optional: the SS path gets it free inside `setupSQLServerClient` (`SQLServerDataProvider/src/config.ts:45`), and `MetadataSync/provider-utils.ts:159-166` documents adding it to its PG path for exactly this reason. Omitting it means the PG lane runs ~60 bundles with a different startup sequence than SS, and engine-dependent PG-only failures would be triaged as parity bugs under the Q4 boundary when they are really a harness gap.
- **Do not** pass `MJPostgresTypes` through `PostgreSQLProviderConfigData` — it has no such field; the provider's `PGConnectionManager` installs the parsers itself.
- `closeMJProvider()` gains a PG branch (end the pg pool, not `pool.close()`); `getContextUser()` needs no change (it reads `UserCache`, which the feeder now populates). `getConnectionPool()` is **dead code** — no caller anywhere in `packages/` — so it needs no platform guard; delete it or leave it, but its original justification ("only `metadata-consistency` wants it") was wrong: that bundle reads `ctx.Pool`, not this function.
- `package.json`: add `@memberjunction/postgresql-dataprovider` to `optionalDependencies`.
- All five `mj test` subcommands (`suite`, `run`, `validate`, `compare`, `list`) inherit PG support.

### Step 5 — Honest `Skipped` (spans `Engine`, `EngineBase`, `testing-integration`, `CLI`)
Larger than originally scoped — the status the plan targeted is on `TestRunResult` (`EngineBase/src/types.ts:236`), a *dead union member* copied from the driver at `TestEngine.ts:1290`, not something the driver can emit.

- **5a — Publish the bootstrap context from the CLI path.** `initializeMJProvider` calls `_setCurrentServerBootstrap(...)` with the context it already builds (Pool on SS / undefined on PG, Db incl. platform, Provider, Storage, Schema, ClosePool). This single change resolves three problems at once: `metadata-consistency` finally receives its pool on SS; the driver learns the active platform on the CLI path (where `activeBootstrap` is null today); and the platform declaration gets a source of truth. The driver needs no edit for the pool — it already reads `activeBootstrap?.Pool`. Mechanically safe: `assertOwnsProcess` is only called inside `bootstrapIntegrationServer`, and the driver's `if (!storage)` branch stays skipped either way. **Behavioral risk: MC1–MC8 execute for the first time ever — see Risk 1.**
- **5b — Widen the driver status.** `DriverExecutionResult['status']` (`Engine/src/types.ts:195`) gains `'Skipped'`. This makes `@memberjunction/testing-engine` a **touched package** (its tests must run). No migration/CodeGen needed — `MJTestRunEntity.Status` already permits `'Skipped'` (`entity_subclasses.ts:30070`), so `TestEngine.ts:913` stays type-safe. Audit the other consumers of the union for non-exhaustive handling: `AgentEvalDriver.ts:295,352`, `TestEngine.ts:1238-1252`.
- **5c — Make aggregation and reporting skip-aware, or the lane reports a false red.** `TestEngine.updateSuiteRun` (`:1047-1052`) counts only `'Passed'` and sets `Status = passedTests === totalTests ? 'Completed' : 'Failed'` with `FailedTests = totalTests - passedTests` — a skipped IT24 would persist **every** PG suite run as Failed. Exclude `'Skipped'` from both, and add `skippedTests` to `TestSuiteRunResult` so Step 8's "read the Skipped count" has a surface. Update `CLI/src/utils/output-formatter.ts:159-165,202-208`, which currently renders anything `!== 'Passed'` as `✗ FAIL` and lists it under "## Failures". (Exit code needs no change: `suite.ts:187` reads `failedTests`, computed at `TestEngine.ts:385` as `status === 'Failed'`.)
- **5d — Platform declaration.** Add optional `Platforms?: ('sqlserver' | 'postgresql')[]` to the bundle registration surface (absent = all). The driver skips non-matching bundles without invoking check bodies, emitting `'Skipped'` with a note. Declare `Platforms: ['sqlserver']` on `metadata-consistency` only. Note: that bundle registers no lifecycle today, so the declaration needs a registration path that does not require one.
- Tests in existing `IntegrationTestDriver.test.ts` + `Engine` tests: matching platform runs, non-matching → Skipped, undeclared runs everywhere, suite aggregation counts skips separately.

### Step 6 — `pg-parity` bundle (`integration-test-suite/src/checks/pg-parity.checks.ts`)
Four checks (PG3 dropped), all platform-independent invariants, **no platform declaration** — runs on both lanes:
- **PG1** CRUD + RunView round-trip (create → read → filter → delete)
- **PG2** identifier quoting — RunView over mixed-case entity/field names. *Note: as catalogued this risks being tautological on PG and is mis-anchored to a SQLParser fix; author it against a genuine unquoted-fold-to-lowercase path or drop it to a documented gap rather than shipping a check that cannot fail.*
- **PG4** UUID/bool/datetime value round-trips (UUID compared via `UUIDsEqual`)
- **PG5** `AfterKey` keyset + `StartRow` pagination parity
- **PG3 is dropped.** No multi-column PK exists anywhere in the v5 schema (zero matches across `migrations/v5` and `migrations-pg/v5`; all 382 generated entities have single-`ID` `Load` signatures), so the check would degrade to the same skip-as-pass `view-execution.checks.ts:386-405` already carries. Its anchored defect (#3112) is a *CodeGen-time* bug in generated PG CRUD bodies, unreachable by a lane that provisions from committed migrations and runs no `mj codegen` — and it already shipped three unit regressions in `PostgreSQLCodeGenProvider.test.ts`. Record as a documented catalog gap.
- Tier per **D1**. Whatever is chosen must be stated explicitly in the IT record and in each check's `RequiresMutation`.
- Mutating checks clean up in their own `try/finally` (the shipped pattern — `view-execution.checks.ts:565-593`, `server-cache.checks.ts`); no `BundleLifecycle` or new `IntegrationCheckContext` fixture field is required.
- **Export the new bundle from the suite package's `index.ts`** or it never registers.
- New IT record **IT68** (IT67 is `.IT67-content-vectorization.json`, already joined to the suite at Sequence 32) + suite membership. `sibling-parity.test.ts` enforces the pairing.
- File header: explains the both-platform design and why the name stays `pg-parity`.
- Update `packages/TestingFramework/integration-test-suite/docs/test-catalog.md:223-231`: mark built, record PG3 as a gap.

### Step 7 — CI lane (`.github/workflows/integration.yml`, second job, **blocking**)
1. **Extend the workflow's `paths:` filter (`:43-53`) with `migrations-pg/**`** — otherwise the PR class most likely to break this lane (PG-migration PRs) never triggers it, and only the post-merge `push: [next]` backstop catches it.
2. `postgres:17` service container (per `pg-migrations.yml` / `eds-integration.yml`). No separate "create DB" step — the service container's `POSTGRES_DB` handles it.
3. Setup node; `npm ci`; build graph with the SS lane's turbo filters **plus `@memberjunction/postgresql-dataprovider`**.
4. **Bootstrap the `cdp_*` roles via `psql` BEFORE migrate** — `cdp_UI`, `cdp_Developer`, `cdp_Integration` + `GRANT USAGE ON SCHEMA public`, copied from `pg-migrations.yml:128-146`. 129 files under `migrations-pg/v5` carry GRANTs; a blank container dies on the first one with `role "cdp_UI" does not exist`.
5. `npx mj migrate --dir=migrations-pg/v5 -v` with the **`CODEGEN_DB_USERNAME` / `CODEGEN_DB_PASSWORD`** pair — MJCLI reads only those (`MJCLI/src/config.ts:28-29`) and its schema marks them required (`:120-121`); with only `DB_USERNAME`/`DB_PASSWORD` set it aborts before starting.
6. `mj sync push --dir=metadata --ci`, then `--dir=metadata-optional/integration-test --ci` — these read **`DB_USERNAME`/`DB_PASSWORD`** (`config-manager.ts:39-40`). ⚠ First-ever CI run of sync push on PG; most likely first breakage point.
7. Verify the 3 `@integration.test` users via `psql` (needs `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE`).
8. `mj test suite` with `MJ_INTEGRATION_TEST=1`, `DB_PLATFORM=postgresql`, and the D1 mutation setting.
- **Job-level env must set all three credential families plus `DB_PORT: '5432'`** (`DB_*`, `CODEGEN_DB_*`, `PG*`) — GitHub Actions `env:` is per-job, so the SS lane's block does not carry over.
- Add `timeout-minutes` matching the SS lane. No `continue-on-error`: the lane gates.

### Step 8 — Documentation
- **`DEPLOYMENT.md` Step 8 rewrite**: parity table row flips to ✅; the "roadmap item + three blockers" narrative becomes the actual release step; how to read the `Skipped` count. **Also update Step 4** — it carries its own now-stale blocker note — and Step 9's CI-check list gains the PG lane.
- **TestingFramework `README.md`**: feeder-vs-relocation rationale, the platform-declaration boundary rule, how to run the suite locally against PG, and the D1 mutation-axis decision.

### Follow-ups to file
1. Relocate `UserCache` to a neutral package; unify `PostgreSQLCodeGenProvider`'s hand-rolled load.
2. Make mssql `Refresh(pool)` fail-loud.
3. MJServer `refreshUserCacheFromPG` unquoted-schema divergence.
4. The 22 fixture-degradation skip-as-pass sites (distinct semantics from platform skip).
5. PG3 / composite-PK parity — revisit if composite-PK entities ever ship.
6. Whether `RUN_MUTATION_TESTS` should be permanent on both lanes (if D1 lands narrow).

---

## 4. Testing

- **Primary seam (existing):** `mj test suite "Integration Tests — Deterministic"` with `DB_PLATFORM=postgresql` — locally against docker `postgres:17`, permanently via the blocking CI job.
- **Unit seams (existing files):** `user-cache.test.ts` (Step 1), `bootstrap-guard.test.ts` / `IntegrationTestDriver.test.ts` (Steps 2, 5), `Engine` package tests (Step 5b/5c), `sibling-parity.test.ts` (Step 6, automatic).
- **Touched packages needing green unit tests:** `SQLServerDataProvider`, `testing-integration`, `testing-cli`, **`testing-engine`**, `MJServer`, `MetadataSync`, `integration-test-suite`.
- **Definition of done:** SS deterministic tier green *including MC1–MC8 now actually executing*; PG deterministic tier green with `skippedTests` = the `metadata-consistency` test only; both lanes report a non-zero, explainable skip count rather than a padded pass count.

## 5. Risks

1. **MC1–MC8 execute for the first time ever (Step 5a).** They have never run in CI on any platform. They may fail on SS — that is a pre-existing defect surfaced, not a regression introduced. Validate in a throwaway build *before* the release build. If they fail, triage or fix; **do not** re-hide them behind the platform declaration (Q4 boundary).
2. **The mutation axis (D1).** If enabled on both lanes, 52 dormant checks activate on the gating SS lane. Same mitigation: throwaway build first.
3. **`mj sync push` on PG is CI-unproven.** Recently fixed (#3253) but never run in a workflow.
4. **First honest run of ~60 bundles on PG** will likely surface real parity bugs. They stay red; each becomes a tracked fix.
5. **Fail-loud behavior change** in MJAPI startup (empty-users PG DB now fatal) — deliberate, documented.
6. **Cross-package type widening (Step 5b)** touches `@memberjunction/testing-engine`, consumed beyond this feature (`AgentEvalDriver`).

---

## 6. Sequencing for tomorrow

Steps 1→2→3 are independent of 4→5 and can proceed in parallel. Step 5a is the highest-information change: land it early and run a throwaway SS build immediately, because it is the one that can surface pre-existing SS failures (Risk 1). Step 7 depends on 4 and 6; Step 8 last.

## 7. What changed in v2 (verification corrections)

| ID | Correction | Impact |
|---|---|---|
| F1 | Step 5 targets a type that cannot express Skipped; the real edit is `DriverExecutionResult` in `@memberjunction/testing-engine`, plus aggregation + formatter changes | Step 5 tripled in scope (5a–5d); new touched package |
| F2 | `metadata-consistency` already skips on **SQL Server** — `ctx.Pool` is undefined on the CLI path | Original DoD described a lane difference that did not exist; added Step 5a; Risk 1 |
| F3 | The 52 mutation checks never run in CI | Added decision D1; pg-parity would otherwise be vacuous |
| F4 | Fail-loud `RefreshFromRows` would leave `_users` undefined → `TypeError` at ~8 unguarded sites | `_users` initialized to `[]` |
| F5 | CLI has no `dbPlatform` field and no env merge; port defaults to 1433 | Step 4 now starts with `config-loader.ts` |
| F6 | PG branch omitted `StartupManager.Startup` that SS gets free | Added, with the precedent conflict documented |
| F7 | Step 7 omitted the `cdp_*` role bootstrap | Added as item 4 — migrate would have died on the first GRANT |
| F8 | Step 7 named only `DB_PLATFORM`; migrate/sync/test/psql need three different credential families + `DB_PORT` | Full env block specified |
| F9 | `integration.yml` path filter lacks `migrations-pg/**` | Added as item 1 |
| F10 | IT67 is already `content-vectorization` | Record is now IT68 |
| F11 | PG3 has no target (zero composite-PK entities; #3112 is CodeGen-time) | Dropped, recorded as a catalog gap |
| F12 | `getConnectionPool()` is dead code; its stated rationale was wrong | Guard removed from scope |
| F13 | Smaller: bundle must be exported from `index.ts`; no `BundleLifecycle` needed; no "create DB" step; `timeout-minutes`; `MJPostgresTypes` not passable; `closeMJProvider` PG branch; `RefreshFromRows` takes an explicit provider; DEPLOYMENT.md Step 4 also stale; Step 3 diffs understated; all five CLI subcommands affected | Folded into the relevant steps |

**Refuted (deliberately not changed):** the `Refresh` auto-refresh timer concern (pre-existing, unchanged by delegation); the testing-integration barrel-import coupling (already exists today via MJCLI's root-package import); the claim that mutating bundles need a lifecycle + context fixture field (shipped bundles use `try/finally`).

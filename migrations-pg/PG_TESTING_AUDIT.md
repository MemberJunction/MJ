# PG Testing Audit & Gap Analysis

This document inventories the existing PG test surface (per PR 2208's TESTING_GUIDE.md) and identifies new gaps surfaced during the v5.30.1 toolchain fixes work. Read this with `MIGRATION_DECISION_TREE.md` for the full PG testing picture.

## Existing test surface (inherited from PR 2208)

### Unit tests (run via `npm test` per package)

| Package | Tests | Purpose |
|---|---|---|
| `@memberjunction/sql-converter` | 856 (749 unit + 107 regression) | Per-rule converter validation, full migration regression loop |
| `@memberjunction/codegen-lib` | 477 (418 unit + 59 PG-integration env-gated) | CodeGen core logic, view regen, manifest generation |
| `@memberjunction/postgresql-dataprovider` | 90 | Runtime `autoQuoteIdentifiers` tokenizer |
| Cross-package monorepo (`npm test` at root) | 297 packages parallel | Full unit-test surface |

### Database-level verification scripts

| Script | What it does | When to use |
|---|---|---|
| `scripts/audit-baseline-completeness.mjs` | Per-migration audit — verifies every declared object is present in target DB | After regenerating baseline; verify any PG DB has all migration content |
| `scripts/snapshot-{ss,pg}.sh` | Capture sorted object lists per category (tables/cols/cons/routines/views/idx) | Compare SS↔PG schema parity |
| `scripts/test-pg-autoquoter-coverage.mjs` | 19 GraphQL queries exercising PascalCase identifier quoting | After changes to `PostgreSQLDataProvider.ExecuteSQL` |
| `scripts/regenerate-pg-baseline.sh` | Dumps canonical PG state to fresh baseline | When source-of-truth schema advances |
| `scripts/validate-pg-codegen.mjs` | Provider-level PG syntax check (26 generation + 3 execution tests) | After changes to `PostgreSQLCodeGenProvider` |
| `scripts/test-pg-ci-flow.mjs` | Local simulator for `pg-migrations.yml` CI workflow | Pre-flight before pushing migration changes |
| `scripts/pg-install-fresh.mjs` | Full install pipeline (drop → migrate → CodeGen → seed) | E2E smoke test on demand |

### CI workflows (run automatically on PR)

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/test.yml` | PRs touching packages or vitest | Full monorepo unit tests |
| `.github/workflows/pg-migrations.yml` | PRs touching migrations or PG-related code | Converts T-SQL → PG, applies baseline to PG 17 service container, verifies thresholds |
| `.github/workflows/changes.yml` | All PRs to next/main | Validates new migration filenames + content rules |
| `.github/workflows/build.yml` | PRs touching packages | Full Turbo build |
| `.github/workflows/migrations.yml` | Push to next | SS migration smoke (post-merge only) |

---

## New tests added in this PR (Fix 16+ retrospective)

### `scripts/compare-pg-ss-snapshots.mjs` — MJ_OVERRIDES-aware schema diff

**Why added:** The pre-existing snapshot scripts dump raw type names; their diff was done with ad-hoc sed normalization that didn't know about MJ_OVERRIDES. This false-positive class is what triggered Bug #15 (the retracted ListInvitation.ExpiresAt fix).

**What it does:** Imports `MJ_OVERRIDES` from `@memberjunction/sql-converter` (single source of truth), normalizes both SS and PG sides through it, reports drift in three categories: REAL DRIFT (action required), KNOWN OVERRIDE (intentional MJ design, no action), DIALECT ALIAS (trivial type-name aliases, no action).

**Verified:** Re-running today's parity check correctly classifies the ListInvitation.ExpiresAt case as "Known MJ override" rather than drift. Real drift count = 0. Bug #15 would not have been triggered if this script had existed earlier.

### `packages/SQLConverter/src/__tests__/MJConventionEnforcement.test.ts` — SS contra-test

**Why added:** Existing tests check that PG matches SS. But sometimes SS itself is the anomaly (Bug #15: `ListInvitation.ExpiresAt` is the only column declared as bare `[datetime]` in the entire baseline; everything else uses `[datetimeoffset]`). A test that catches SS-side anomalies points to the *real* fix instead of letting us write a wrong-direction PG-side fix.

**What it does:** Scans `migrations/v5/*.sql` for CREATE TABLE column declarations using bare `[datetime]`, `[datetime2]`, or `[smalldatetime]`. Fails with a clear error message pointing the developer at MJ_OVERRIDES and recommending `[datetimeoffset]`. Has a `KNOWN_VIOLATIONS` allowlist for shipped baselines that can't be retroactively modified.

**Verified:** Test passes with the documented `ListInvitation.ExpiresAt` violation in the allowlist. With the allowlist temporarily emptied, the test fails with `Found 1 SS column(s) violating the MJ datetime convention: ... B202602151200 line 15479 - ListInvitation.ExpiresAt declared as [datetime]`.

### `migrations-pg/MIGRATION_DECISION_TREE.md` — process documentation

**Why added:** The Bug #15 retraction was a process failure. Someone (us) bypassed the implicit review chain because PG work is primarily owned by one person. Codifying the 5-question checklist makes the bypass explicit — you have to consciously decide to skip it.

**What it does:** 5-question decision tree anyone must answer before adding a `.pg-only.sql` migration:
1. Is there a documented MJ override that explains the divergence?
2. Does the test normalization include that override?
3. Does the original conversion **fail** (apply error) or just **diverge** (test diff)?
4. Does any production code path actually break at runtime?
5. If only diverging, is the SS source the anomaly?

Includes worked examples (Bug #14 = legitimate, Bug #15 = retracted) showing how the decision tree maps to real cases.

---

## Gaps identified during this session — recommended follow-up tests

These would close the test surface further but were too large to fit in this PR. Each is tagged with effort estimate and priority.

### High value / quick-ish wins (could be a separate small PR)

#### G1: BaseEntity CRUD smoke (env-gated script)

**What:** A reproducible script that bootstraps PG metadata, creates a v5.31 entity (TagScope) and a v5.30 schema-extension entity (Action with `MaxExecutionTimeMS`), runs Save/Update/Delete via BaseEntity, verifies all return `true` and DB state reflects the operations.

**Why:** Fix 8 (`PostgreSQLDataProvider.ValidateDeleteResult` override) is unit-tested but never exercised end-to-end against fresh PG by automation. We exercised it manually this session via `_test-crud-roundtrip.mjs` (~100 lines), which we deleted after verification. Codifying it as `scripts/smoke-pg-baseentity-crud.mjs` would catch any future PG-side BaseEntity regressions.

**Effort:** ~30 min (recreate the deleted script, add documentation, gate behind env var)

#### G2: First-time sign-in / `createNewUser` smoke (env-gated script)

**What:** Reproducible script that bootstraps PG metadata, simulates Auth0 first-time sign-in by directly invoking `NewUserBase.createNewUser()`, verifies the user + roles + applications + UserApplicationEntity records get created without crash.

**Why:** Fix 6 (boolean-filter rewrites in `newUsers.ts` and `IntegrationDiscoveryResolver.ts`) is unit-tested but the real flow was only manually verified via `_test-new-user.mjs` (~80 lines, deleted). Codify as `scripts/smoke-pg-newuser.mjs`.

**Effort:** ~30 min (similar to G1)

#### G3: CodeGen output file replay test (env-gated integration test)

**What:** Run `mj codegen` against fresh PG, capture the generated `CodeGen_Run_*.pg.sql` file, replay it against a freshly-migrated PG, assert zero errors. Catches Fix 13 (PG semicolon termination) and Fix 16 (CREATE OR REPLACE VIEW DO/EXCEPTION fallback) regressions.

**Why:** Both fixes were validated manually this session. A future regression in CodeGen output that breaks file replay would only surface during a fresh install, not during normal codegen.

**Effort:** ~45 min (write the integration test, gate behind env var)

### Bigger efforts (separate planning needed)

#### G4: Browser smoke automation in CI

**What:** Headless Playwright test that loads MJExplorer against PG-backed MJAPI, exercises login + entity grid + record open. Catches UI-layer regressions.

**Why:** We did this manually with Playwright this session and caught real issues (the FA kit regression, the ResourcePermissionEngine race). Currently the only "browser test" in the repo is the linter validation in the React test harness. A real Playwright suite would catch UI regressions in CI.

**Effort:** ~3-4 hours (Playwright setup, fixtures, CI workflow, Auth0 mock or service account)

#### G5: Runtime SQL error catch-all

**What:** During MJAPI startup + standard scheduled jobs, capture any `PostgreSQLDataProvider.ExecuteSQL failed:` log line and fail the test if any error class matches PG-specific patterns (`type "X" does not exist`, `operator does not exist`, `relation "X" does not exist`).

**Why:** During this session's E2E test we discovered an unresolved `type "INTEGER" does not exist` error in the Memory Manager's runtime SQL conversion (`MJCoreEntitiesServer/src/custom/query-extraction/dialect.ts` calling `convertCastTypes` from sql-converter). The error is non-blocking (the job swallows it gracefully) but it IS a real PG bug we never tracked down. Without runtime error monitoring, similar issues will continue to be invisible.

**Effort:** ~2 hours (instrument MJAPI logs, write the assertion harness, decide on signal-vs-noise threshold)

### Lower priority / nice to have

#### G6: Schema equivalence in CI (not just on demand)

**What:** Add a CI step that runs `compare-pg-ss-snapshots.mjs` on every PR touching migrations, fails if real drift detected. Currently the snapshot scripts run on demand only.

**Effort:** ~1 hour

#### G7: Smoke tests for the Memory Manager / scheduled jobs against PG

**What:** Verify that scheduled jobs (Memory Manager, Geocoding Maintenance) actually run to completion against PG without runtime errors.

**Effort:** ~2-3 hours

---

## Suggested next steps

1. **Land this PR with the 3 process improvements** (`compare-pg-ss-snapshots.mjs`, `MJConventionEnforcement.test.ts`, `MIGRATION_DECISION_TREE.md`). These prevent the Bug #15 class of false positive going forward.

2. **Open a follow-up ticket for G1, G2, G3** as a "PG smoke test codification" effort. Probably ~2 hours total since the manual scripts are already proven.

3. **Open a separate ticket for G4** (browser automation) if the team agrees Playwright in CI is worth the investment.

4. **Run the existing `audit-baseline-completeness.mjs` and `test-pg-autoquoter-coverage.mjs`** as part of this PR's pre-merge checklist if not already done — they're documented in PR 2208's testing guide but I'm not sure they were re-run after the merge with origin/next.

5. **Track G5 separately** — the unresolved `INTEGER` error needs investigation (we paused mid-flight this session).

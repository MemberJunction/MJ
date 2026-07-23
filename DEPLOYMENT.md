# MemberJunction Release & Deployment Guide

This document covers the end-to-end process for releasing a new version of MemberJunction. All `@memberjunction/*` packages are versioned together (fixed group via changesets).

---

## Release Types

| Type | When | Versioning | Deployment |
|------|------|-----------|------------|
| **Patch** | Bug fixes, no schema/metadata changes | `5.5.1 → 5.5.2` | Automated via GitHub Actions |
| **Minor** | New migration files or metadata changes | `5.5.x → 5.6.0` | Automated via GitHub Actions |
| **Major** | Breaking changes | `5.x → 6.0.0` | **Manual deploy — do NOT use GitHub Actions** |

> The `publish.yml` workflow auto-detects minor vs patch: if new migration files exist since the last tag, it bumps minor; otherwise patch. But you must ensure the changesets are correct (see Step 3).

---

## Pre-Release Checklist

> **Recommended: work on a release-prep branch instead of committing to `next`
> directly.** Cut `release/vX.Y-prep` from the tip of `next`
> (`git checkout -b release/vX.Y-prep && git push -u origin release/vX.Y-prep` —
> same-named remote tracking, per the branch rules), land the Step 2–7 commits
> there, and merge into `next` via a PR (e.g. #3163 for v5.48). This keeps `next`
> green while prep is in flight and gives the release artifacts a reviewable PR.
>
> **Reading the steps below:** where they say "commit/push to `next`" (Step 3.8,
> Step 6), that is the target on the direct-to-`next` workflow. On the prep-branch
> workflow, commit to your prep branch instead — it reaches `next` through the PR.
> The steps use `next` as shorthand for "the branch that becomes the release."

### Step 1: Verify CI on `next`

Before anything else, confirm the `next` branch is healthy:

- [ ] **"Build all packages for testing"** (`build.yml`) — passes on `next`
- [ ] **"Test migrations"** (`migrations.yml`) — passes if migrations were changed
- [ ] **"Unit Tests"** (`test.yml`) — passes on any open PR, and on the **push-to-`next`** run (that unfiltered backstop is the one that actually proves integration-bundle ↔ `MJ: Tests` metadata sibling parity; a metadata-only PR never triggers `test.yml` at all)
- [ ] **"Integration Tier"** (`integration.yml`) — passes on `next`. Runs the deterministic suite against a fresh SQL Server on PRs into `next` plus an unfiltered push-to-`next` backstop. It is **not** a substitute for Step 4: CI runs no MJAPI (so client-transport bundles skip) and no live-model tier.

### Step 2: Pull In New AI Models (REQUIRED — every release)

> ⚠️ **This is standard practice for every release — not optional.** AI model intelligence is
> produced on a weekly cadence by an automated Claude routine that opens an **AI model research PR**
> against `next` (e.g. PR titled `AI Model Research Report — YYYY-MM-DD`, on branch
> `claude/ai-model-research-YYYY-MM-DD`). If that PR is not merged before the metadata sync step,
> the new models **silently miss the release.** This happened in **5.43** (PR #2924 was open at
> release time and the Fable 5 / Mythos 5 / GLM-5.2 entries were left out).

Do this **before** the metadata sync step (Step 3) so new models are captured in the migration script.

**The rule: there must always be a current AI model research PR pulled in, or one generated, for every release.**

1. **Check the repo for an open AI model research PR.**
   - Look for an open PR titled `AI Model Research Report — *` (head branch `claude/ai-model-research-*`).
   - If one exists, **review and merge it into `next`** so its `metadata/ai-models/.ai-models.json`
     changes are present locally before Step 3. Then **close the loop**: comment on / close the PR noting
     which release it landed in (the routine PRs are one-shot deliverables and rely on the build engineer
     to merge + close them).
2. **If no AI model research PR exists**, run the Claude AI-model-research routine to generate one
   (the same routine that produced the PRs in `reports/ai-model-research/` and PR #2924), then merge it
   as in step 1. Do not skip the release's model refresh just because a PR wasn't waiting — generate it.
3. **Sanity-check** the merged entries against `metadata/ai-models/.ai-models.json` and confirm
   `@lookup:` references resolve.
4. Run `mj sync push --dir ./metadata` to sync to your local database — the changes are then captured
   in the metadata migration script generated in Step 3.

> Manual fallback: if neither an existing PR nor the routine is available, do quick web research across
> major provider release pages (Google/Gemini, OpenAI/GPT, Anthropic/Claude, Mistral, Groq, Meta/Llama,
> xAI/Grok, DeepSeek, Z.AI/GLM), diff against `.ai-models.json`, and use the `/add-ai-model` skill or edit
> the file directly. But the AI model research PR is the primary, expected path — use it.

### Step 3: Handle Metadata Changes

Check if there are any pending metadata changes (new/updated records in `metadata/`).

#### If metadata has changed since the last release:

1. **Verify MJ CLI is up to date** — run `mj version` and compare against `npm view @memberjunction/cli version`; update with `npm install -g @memberjunction/cli@latest` if behind (a stale CLI produces stale sync/codegen output)
2. **Start a fresh database** — a new empty database on your existing dev SQL Server works fine (no separate instance needed). Example, with the standard MJ logins mapped in:
   ```bash
   docker exec <your-sql-container> bash -c '
     /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C \
       -Q "CREATE DATABASE MJ_Release_vXXX; ALTER DATABASE MJ_Release_vXXX SET RECOVERY SIMPLE;" &&
     /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -C -d MJ_Release_vXXX \
       -Q "CREATE USER MJ_CodeGen FOR LOGIN MJ_CodeGen; ALTER ROLE db_owner ADD MEMBER MJ_CodeGen;
           CREATE USER MJ_Connect FOR LOGIN MJ_Connect; ALTER ROLE db_owner ADD MEMBER MJ_Connect;"'
   ```
3. **Update local `.env`** to point to this fresh database (back up your `.env` first — `cp .env .env.release-backup` — and restore it when done)
4. **Run migrations** to bring it to the latest version:
   ```bash
   export MJ_MIGRATION_REQUEST_TIMEOUT=1800000   # REQUIRED — see below
   mj migrate
   ```
   Three field-tested gotchas here:
   - **Set `MJ_MIGRATION_REQUEST_TIMEOUT` (30 min shown) in the same shell.** The default request timeout is 300s and at least one baseline batch exceeds it on a busy machine — the failure mode is `Timeout: Request failed to complete in 300000ms`, or the uglier `Failed to cancel request in 5000ms` → `Requests can only be made in the LoggedIn state` cascade, which leaves the DB half-applied (drop + recreate before retrying).
   - **Don't run probe/status queries against the DB while migrate is executing.** They queue behind DDL locks, get chosen as deadlock victims, and add contention. Wait for the CLI to report.
   - **Check for CPU-hungry Docker containers competing with your SQL Server.** An unrelated hot container on the same Docker VM starved the server badly enough to masquerade as migration timeouts (a clean run takes ~1 min; the starved runs died for over an hour). `docker stats --no-stream` before you start.
5. **Push metadata** to the fresh database:
   ```bash
   mj sync push --dir ./metadata
   ```
   > This push includes the inert **"Integration Test" TestType** (it lives in the normal
   > `metadata/test-types/` tree) — that's fine, it's just a type definition. But **do NOT push
   > `metadata-optional/integration-test/` here.** That optional sibling root holds the actual
   > test-only records — the **IT01–IT66 Tests (67 records: 52 in the Deterministic suite, 15 in
   > the Live Model suite)**, the three-suite hierarchy, the RLS principals (three synthetic
   > `it-*@integration.test` users + the "Integration Test: RLS Scoped Reader" role + its grants),
   > **and the synthetic AI stack the live tier drives** (14 `IT: *` AI Agents — 12 of them
   > root-level — 14 IT AI Prompts with 42 model bindings + templates, `IT: Probe Skill`,
   > `IT: Integration Test Scope`).
   > It is deliberately kept out of `metadata/` so none of it enters the generated
   > `Metadata_Sync.sql` migration — and thus never reaches production, where those IT agents would
   > surface in every user's `@agent` picker. It is pushed only into the throwaway Step-3 database,
   > in Step 4.2.
6. **Grab the generated SQL** from `metadata/sql_logging/` — find the most recent `MetadataSync_Push_*.sql` file
7. **Copy it to the migrations folder** and rename using the naming convention:
   ```
   V[YYYYMMDDHHMM]__v[NEXT_MINOR].x__Metadata_Sync.sql
   ```
   Examples:
   ```
   V202603021058__v5.5.x__Metadata_Sync.sql
   V202602271034__v5.4.x__Metadata_Sync.sql
   ```
   - Timestamp format: `YYYYMMDDHHMM` (year, month, day, hour, minute)
   - Version: use the **next minor version** (e.g., if current release is `5.5.x`, use `v5.6.x`)
   - Timestamp must be **strictly greater** than all existing migration timestamps (enforced by CI)
   - **Verify no test-only records leaked in.** No CI check catches this — `changes.yml` validates
     naming, schema placeholders and timestamps only. Grep the newly copied file by name and
     confirm zero hits:
     ```bash
     grep -c '@integration\.test\|Integration Test: RLS Scoped Reader\|IT: Probe Skill' \
       migrations/v5/V<new-timestamp>__v5.X.x__Metadata_Sync.sql   # must print 0
     ```

8. **Commit the migration script to `next`** — push this new migration file to the `next` branch so it's included in the release PR. **Also commit the mj-sync writeback**: the push back-fills `primaryKey`/`sync` blocks into the new records' metadata JSON files (`metadata/**/.*.json`) — those belong in the same commit so future pushes recognize the records as existing.
9. **Ensure a minor changeset exists** — if changesets only have `patch` bumps, you must add a changeset with `minor` on at least one `@memberjunction/*` package to indicate this is a minor release:
   ```bash
   npm run change
   # Select at least one package, choose "minor"
   ```
   The migration/metadata files themselves do **not** get their own changeset — changesets version npm packages, and the minor signal is normally already carried by the feature changesets on `next`. This step is a check, not an automatic add.

> **`mj codegen` is NOT part of this step.** On a fresh database, `mj migrate`
> already replays every historical `CodeGen_Run_*.sql`, so schema and generated
> objects are current before the push; the metadata-sync migration is pure data,
> captured entirely by `mj sync push`'s SQL log. Running codegen afterwards is an
> *optional* drift check — expect zero output; if it emits a new `CodeGen_Run`
> migration, stop and investigate before including anything.
>
> **Reconciling this with the suite's own runbook.** `build-engineering-runbook.md`
> lists the build order as *migrations → `mj codegen` → `npm run build` → seed → MJAPI → run*.
> That ordering is correct for a **developer's existing database**, where the schema may have
> moved without codegen having been re-run. It is **not** the release path: Step 3 provisions a
> *fresh* database, and `mj migrate` replays every historical `CodeGen_Run_*.sql`, so generated
> objects are already current. On the release path, treat `mj codegen` as the drift check
> described above — not a required step. Either way the invariant the runbook is protecting
> holds: never run the suite before the schema is current, or `IT50 - CodeGen Artifact
> Consistency` will (correctly) fail on an entity-count mismatch.

#### If no metadata changes:
- Skip this step. Changesets will determine patch vs minor based on what's already been added.

### Step 4: Run the Full Integration Suite

The database from Step 3 is now at the latest schema **and** metadata, so this is the point in the release where the schema, generated types, and engines should all agree. Run the headless integration suite against that database as a full-stack smoke test that they actually do.

There are **two runnable suites**, and one `mj test suite` invocation runs exactly one of them, serially, in one process. There is no aggregator — `run-all.ts` and the per-bundle `tsx` dispatchers were deleted in the July-2026 restructure. Spell the names exactly: they contain an **em dash (—)**, not a hyphen.

| Suite | Members | Gate |
|---|---|---|
| `Integration Tests — Deterministic` | 52 | **Required — must be 52/52.** Deterministic: any shortfall blocks the release |
| `Integration Tests — Live Model` | 15 | **Required to run and be triaged — but *not* required to be 15/15.** Real LLM calls; see 4.4 |

> **The two tiers have different pass criteria, and conflating them will either block a good release or wave through a bad one.** The deterministic tier is exactly that — 52/52 or stop. The live tier drives real models, and `agents-suite.md` documents run-to-run variance as a known characteristic "surfaced honestly rather than hidden": checks that need the model to take a specific action use a two-phase bounded retry (≤3 attempts) and then fail **loudly** with `model-noncompliance:`. So a live shortfall is not automatically a blocker — every failing live test must be **triaged individually** (see 4.6): `model-noncompliance:` is variance and may be accepted; anything else is a real defect and blocks.

> ⚠️ Do **not** run `mj test suite "Integration Tests"`. That is the empty parent container (zero members); it exits **1** with `No tests found in suite: <id>`. A hyphen typed instead of the em dash also exits 1, with `Test suite not found: <arg>`.

> 🐘 **Run this step against SQL Server — that is the supported path, and it is all this step requires.** Do not try to point Step 4 at a PostgreSQL database: the testing CLI builds an `mssql` pool (`packages/TestingFramework/CLI/src/lib/mj-provider.ts` → `setupSQLServerClient`, no platform branch), so `DB_PLATFORM=postgresql` is never consulted and the run would fail on connection before testing anything. **This is a limitation of the test harness only — it does not affect the release.** PostgreSQL still ships fully: its migrations are converted, verified, and committed in Step 8. See "What PG parity does and does NOT cover today" there.

#### 4.1 Prerequisites (all required — miss one and the suite reports **green without testing**)

1. **Step 3 is done** — `mj migrate` + `mj sync push --dir ./metadata` applied to the scratch database, and your `.env` points at it.

   > 🚨 **Repoint the database by editing `.env` (Step 3.3) — an inline `DB_DATABASE=… npx mj test …` silently does NOT work.** The testing CLI loads dotenv with `override: true` (`packages/TestingFramework/CLI/src/lib/mj-provider.ts`), so `.env` clobbers the shell variable and the suite runs against whatever `.env` says. `mj sync push` behaves the **opposite** way (its init hook does not override), so the shell-var shortcut *appears* to work while seeding and then silently targets the wrong database for the run — and this tier mutates. Confirm the target on every run: the CLI prints `config.dbDatabase: <name>` at startup.
2. **The repo is built — and the suite package's `dist/` is *current*.** `npm run build`. The suite loads compiled `dist/`, including the private, never-published `@memberjunction/integration-test-suite` package. A `dist/` that merely **exists is not enough**: if it predates the newest `src/checks/*.checks.ts`, every bundle added since compiles to nothing and the run fails with a wall of `Unknown integration check bundle '<name>'` — naming the *newest* bundles while older ones pass. Verify freshness rather than assuming:
   ```bash
   ls -t packages/TestingFramework/integration-test-suite/dist/index.js \
         packages/TestingFramework/integration-test-suite/src/checks/*.checks.ts | head -1
   # Must print the dist file. If a .checks.ts is newest, rebuild THROUGH TURBO:
   npx turbo run build --filter=@memberjunction/integration-test-suite
   ```
   > Rebuild it with turbo, **not** `cd <pkg> && npm run build`. The check bundles depend on fixtures and context properties exported by `@memberjunction/testing-integration`; if that sibling is also stale, the direct build dies with dozens of `has no exported member 'AgentLiveFixture'` / `Property 'XFixture' does not exist on type 'IntegrationCheckContext'` errors. Turbo's `dependsOn: ["^build"]` builds the dependency first. A full `npm run build` (Step 7) covers this too.
3. **`mj.config.cjs` still carries `testing.checkModules`** (`['@memberjunction/integration-test-suite']`) — that key is how check bundles are discovered.
4. **The integration metadata is seeded** — see 4.2. This is **not** optional any more.
5. **MJAPI is running** against the Step-3 database, with `MJ_API_KEY` set — see 4.3.
6. **Use the repo-local CLI**, from the repo root (`npm run test:integration` / `npx mj …`). A globally-installed `mj` cannot load the private suite package.

#### 4.2 Seed the integration metadata (REQUIRED)

`mj test` dispatches from `MJ: Tests` / `MJ: Test Suites` rows that exist **only** in `metadata-optional/integration-test/`. Nothing in `metadata/` and no migration seeds them, so without this push Step 4 exits 1 on suite lookup before a single check runs.

```bash
# AFTER Step 3's `mj migrate` + `mj sync push --dir ./metadata` — order matters, the IT
# records @lookup the "Integration Test" TestType and AI models from the base metadata.
npx mj sync push --dir ./metadata-optional/integration-test --ci
```

This seeds **242 records**: the **67 IT Test records** (IT01–IT66), the 3 suite rows and their 52 + 15 memberships, the RLS principals (3 synthetic `it-*@integration.test` users + the `Integration Test: RLS Scoped Reader` role + 2 entity-permission grants), and the synthetic AI stack the live tier drives (14 `IT: *` AI Agents — 12 root-level — 14 IT AI Prompts with 42 multi-vendor model bindings + templates, `IT: Probe Skill`, `IT: Integration Test Scope`, and the IT categories). Expect `Created 242 / Errors 0` in the push summary.

Verify it actually landed — the push can exit 0 without seeding, which silently degrades the RLS checks to skip-as-pass (this is the same assertion `integration.yml` makes in CI):

```sql
SELECT COUNT(*) FROM __mj.[User] WHERE Email LIKE '%@integration.test';   -- must return 3
```

> 🚨 **Scratch Step-3 database ONLY — never a production database, and never move these files into `metadata/`.** Post-#3228 the blast radius is no longer inert test data: the 12 root-level `IT: *` agents would appear in **every** user's `@agent` picker and `IT: Probe Skill` in every user's `/skill` picker (both permission-open by default), on top of 3 live user accounts, a role, and its grants.

> This push emits **no** SQL log, so it cannot contaminate the Step-3 `Metadata_Sync.sql` migration. It **does** rewrite `sync.lastModified`/`checksum` into the `metadata-optional/**` JSON files — **discard that churn.** Unlike the Step-3 `metadata/**` writeback (Step 3.8), it does not belong in the release commit.

**One more precondition a virgin database does not satisfy.** `IT29 - Cache Gauntlet` enforces an explicit *anti-vacuity floor*: CG1/CG4/CG5 assert that `MJ: User Settings` already holds **≥ 2 rows** before they create their own, because "a `MaxRows:1` slot returned ≤ 1 row" would be trivially true against an empty table. A Step-3 database is brand new, so that table is empty and those three checks fail with `need >= 2 existing rows … (found 0)` — **51/52, and not a product regression.** Seed a baseline once, before running:

```sql
DECLARE @u UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM __mj.[User] ORDER BY __mj_CreatedAt);
INSERT INTO __mj.UserSetting (ID, UserID, Setting, Value) VALUES
  (NEWID(), @u, 'mj.baselineFloor.a', '1'),
  (NEWID(), @u, 'mj.baselineFloor.b', '2'),
  (NEWID(), @u, 'mj.baselineFloor.c', '3');
```

With those rows present all 7 cache-gauntlet checks pass and the tier reaches 52/52.

#### 4.3 Start MJAPI (REQUIRED — 19 of the 52 deterministic tests need it)

19 of the 52 deterministic members are **client-transport** and exercise the real GraphQL wire (IT03, IT15, IT23, IT25–IT28, IT31–IT34, IT37, IT40, IT43–IT45, IT47, IT50, IT52). Start MJAPI against the Step-3 database before running:

```bash
# In a separate shell, pointed at the Step-3 database
cd packages/MJAPI && npm run start
```

- `MJ_API_KEY` must be set (process env or repo-root `.env`), and **the same value must be set for the test run** — MJServer reads it from `process.env.MJ_API_KEY` too (`packages/MJServer/src/config.ts`).
- **Start MJAPI from the *current* build — after Step 7, not before.** For the 19 client-transport bundles, the running server *is* the artifact under test, so a stale `packages/MJServer/dist/` silently tests last week's server. This is not theoretical: a server built before this release's merge fails `transaction-groups.TG5` with `SCOPE BYPASS (bug-register B1): a view:run-only API key executed a Create via ExecuteTransactionGroup` — the check working exactly as designed, reporting that the server it reached lacks the scope gate. Confirm before blaming the product:
  ```bash
  ls -t packages/MJServer/dist/resolvers/TransactionGroupResolver.js \
        packages/MJServer/src/resolvers/TransactionGroupResolver.ts | head -1   # want the dist file
  ```
- If MJAPI has been up a long time, restart it fresh — a resource-degraded server produces spurious timeouts.

The two failure modes are **asymmetric, and neither shows up in the exit code**:

| Condition | Result |
|---|---|
| MJAPI not reachable | 19 tests **skip-as-PASS** (`SKIPPED (environment gap)`) — a green 52/52 that really ran 33 tests |
| `MJ_API_KEY` unset or rejected | 19 tests return status `Error` — which **also** exits 0 |

#### 4.4 Run the two suites

```bash
# 1) Deterministic + mutation axis — from the repo root
RUN_MUTATION_TESTS=1 npm run test:integration 2>&1 | tee release-deterministic.log
```

`npm run test:integration` expands to `MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"`.

- `RUN_MUTATION_TESTS` must be **literally `1`** (`true` and `0` both disable it). The mutation checks are per-check gates *inside* the deterministic bundles, not a separate suite, and they skip **silently** when disabled — the only observable difference is a smaller total check count.
- `RUN_AGENT_TESTS` does nothing here: the deterministic suite has zero live-model members.

```bash
# 2) Live-model tier — a SEPARATE suite with its own exit code
MJ_INTEGRATION_TEST=1 npx mj test suite "Integration Tests — Live Model" 2>&1 | tee release-live-model.log
```

- **Selecting the suite *is* the opt-in.** The live-model tier is now **default-ON**: `IsTierEnabled` returns `RUN_AGENT_TESTS !== '0'`, so `=1` is a legacy no-op and `RUN_AGENT_TESTS=0` is the *opt-out* — which yields a green 15/15 that executed nothing. A green live run only counts if the log has no `tier 'live-model'` skip lines.
- **Working provider credentials required.** Each IT prompt binds a 3-model ladder (Google → OpenAI → Groq) and a check asserts failover onto the *secondary* binding, so Google **and** OpenAI keys are the practical minimum; IT54 additionally drives the real shipped agents. **There is no credential preflight — a missing key FAILS the tier, it does not skip.** Verified by blanking `AI_VENDOR_API_KEY__*` and re-running a previously-green bundle: it failed at fixture setup and exited 1, with no skip message. So a keyless run produces red tests that look like product defects.
- **This tier writes to the database** (agent runs, conversations, `MJ: AI Prompt Models` `Status` toggles) regardless of `RUN_MUTATION_TESTS`. Never point it at production. If a run is killed mid-check, grep the log for `RESTORE FAILED` and confirm the `IT: Failover Agent` bindings are back to `Active`.
- On a slow release box, raise `AGENT_LIVE_SETTLE_MS` / `AGENT_SETTLE_MS` (default ~5000) rather than treating late fire-and-forget saves as defects.

**Budget (measured on a fully-seeded local run, MJAPI up):** deterministic **≈ 133s** at $0; live model **≈ 570s** (~9.5 min). The runbook's older "~4–5 minutes" figure for the deterministic tier is a ceiling, not a floor — but time it on your own box.

> ⚠️ **Do not read `[COST]` as your actual spend.** The live tier printed `[COST] $0.0000` on a run that made real model calls across 15 bundles, and the persisted `MJ: Test Runs.CostUSD` column was populated-but-zero for 68 of 69 rows. Cost roll-up into test telemetry is not wired through for agent runs, so use your provider dashboards to confirm spend.

- Predictive Studio: the **deterministic PS stack-seam checks (IT14) DO run** in this gate, sidecar-free. Only the live Python-sidecar leg (`PS_INTEGRATION=1`) and the standalone `rigs/ps-*.ts` flows are excluded.

#### 4.5 Verify the result — the exit code is NOT sufficient

The exit code is driven by `failedTests`, which counts **only** status `Failed`. Statuses `Error` and `Timeout`, tier-gated skips, and MJAPI-absent skips all exit **0**. So for each of the two runs:

1. Read the console block: `[SUMMARY] N/M passed (X%)`.
2. **Deterministic:** require **N === M === 52**. A 100% summary over a smaller M means tests errored or were skipped — it did not pass.
   **Live model:** require **M === 15** (everything actually ran); `N` may legitimately be < 15, so instead of a number gate, triage every failure per 4.6 — `model-noncompliance:` is accepted variance, anything else blocks.
3. Confirm the log contains no `SKIPPED (environment gap)` and no `Bootstrap failed:`.
4. **Get the real status breakdown from the database, not the console.** The console prints `✗ FAILED` for *any* non-passed test, so an `Error` is visually indistinguishable from a `Failed` — and only `Failed` moves the exit code. Query the run you just did:
   ```sql
   SELECT Status, COUNT(*) FROM __mj.TestRun
   WHERE __mj_CreatedAt > DATEADD(minute, -30, GETUTCDATE())
   GROUP BY Status;     -- want: Passed = 52, nothing else
   ```
   A tally like `Error = 19 / Failed = 15 / Passed = 18` is the signature of an environment problem (here: 19 client-transport bundles with no `MJ_API_KEY`), not 34 product defects.
5. Record both `[SUMMARY]` lines in the release checklist. Per-run telemetry persists to `MJ: Test Runs` / `MJ: Test Suite Runs` (`DurationSeconds`, `CostUSD`, `MachineName`) — useful for trending a bundle that's slowing down.

#### 4.6 On failure — classify before touching anything

- **Environment gap** — `MJAPI is not reachable`, `MJ_API_KEY is not set`, `Bootstrap failed:`, or **exit code 2** (ran inside a process that already owns the cache, e.g. a live MJAPI). Fix the environment, re-run.
- **A wall of `Unknown integration check bundle '<name>'`** — the private suite package wasn't built, `testing.checkModules` isn't loading, or a global `mj` / wrong cwd. Not a product regression.
- **Seeding died with `Failed to process field 'TypeID' in MJ: Tests: Lookup failed: No record found in 'MJ: Test Types' where Name='Integration Test'`** — you ran 4.2 before Step 3's `mj sync push --dir ./metadata`, which is what supplies that TestType. The push rolls the DB transaction back and restores the file backups cleanly, so just do Step 3 first and re-run 4.2.
- **MJAPI refuses to boot with `Schema must contain uniquely named types but contains multiple types named "<X>"`** — a **stale `dist/` orphan**, not a code defect: a resolver whose source was deleted or renamed still has compiled output, and TypeGraphQL loads every resolver in `dist/`, registering the type twice. `tsc` never deletes outputs for removed sources, so another incremental `npm run build` will **not** clear it. Find and remove the orphans, then restart:
  ```bash
  for d in packages/MJServer/dist/resolvers/*.js; do b=$(basename "$d" .js); \
    [ -f "packages/MJServer/src/resolvers/$b.ts" ] || echo "ORPHAN: $d"; done
  ```
- **`Test suite not found: Integration Tests — Deterministic`, listing only unrelated suites** — 4.2 was never run against *this* database (or `.env` points somewhere else). Not a product regression.
- **`IT50 - CodeGen Artifact Consistency` failing on an entity-count mismatch** — checked-in generated types and the migrated schema disagree. Same drift condition Step 3 warns about: **stop and investigate**; do not paper over it with `mj codegen`.
- **`model-noncompliance:` in the message** — model-behaviour variance on the live tier (the model refused the instructed action after 3 billed attempts), not a product defect and not a flake to wave through. Re-run that bundle before calling it a blocker.
- **`agent-run-failed:` in the message** — an **execution** failure, not model variance: the agent run never landed a run id. Read the run's `ErrorMessage` (query `__mj.AIAgentRun` for the newest row of that agent). Historically this class was mislabeled `model-noncompliance:` and sent triagers chasing phantom model variance (issue #3251). It is a harness or product fault — investigate the actual error, don't re-run hoping the model complies.
- **Anything else red** — a real product defect. Re-run the single bundle before re-running the tier:
  ```bash
  MJ_INTEGRATION_TEST=1 npx mj test run "IT## - <name>"
  ```
  **Single-bundle runs are equivalent to the in-suite run** for every bundle with a declared transport: each bundle's metadata Configuration carries `"transport"` (`server`/`client`), and the driver fails loudly with a harness-attributed `Error` if a `server`-transport bundle resolves a non-Database provider (i.e. a client-transport bundle rebound the process-global provider earlier in the process). So a red single-bundle re-run is genuine signal, not a harness artifact. (Before #3251, the live-agent bundles ran the agent in-process with a null `contextUser` — surfacing as product-shaped `BaseAgent` failures identically in both `mj test run` and `mj test suite`; the run now carries `ctx.User` explicitly.)

Do **not** reorder suite membership (client-transport members are deliberately sequenced last — the client bootstrap rebinds the process's global provider; the driver now enforces this and aborts loudly if a server-transport bundle resolves a rebound client provider), and do not declare the gate green on the exit code alone.

> **Deeper docs:** [`packages/TestingFramework/integration-test-suite/docs/build-engineering-runbook.md`](packages/TestingFramework/integration-test-suite/docs/build-engineering-runbook.md) is the operational runbook (build order, tiers, telemetry, triage), also available as the `/run-integration-tests` slash command. [Integration Testing Quickstart](guides/INTEGRATION_TESTING_QUICKSTART.md) covers architecture and authoring — but its member counts and tier-gating table are currently stale, so take the numbers above as authoritative.

### Step 5: Check for New Packages

**This must be done for every release.**

Follow [NEW_PACKAGE_SETUP.md](NEW_PACKAGE_SETUP.md):

1. Check if any new `@memberjunction/*` packages were added since the last release — the authoritative check is the same script the publish workflow runs:
   ```bash
   ./.github/scripts/validate-npm-packages.sh   # lists every publishable package missing from npm
   ```
   Packages marked `private: true` are skipped — changesets never publishes them, so they need no npm placeholder. (`validate-package-repository.sh` applies the same rule: private packages don't need `repository.url`, which exists only for npm provenance.)
2. For each package the script lists, create a placeholder on npm with OIDC trusted publishing:
   ```bash
   npx setup-npm-trusted-publish @memberjunction/new-package-name
   ```
3. Configure OIDC on npm:
   - Provider: `GitHub Actions`
   - Organization: `MemberJunction`
   - Repository: `MJ`
   - Workflow: `publish.yml`
   - Environment: _(leave blank)_
4. Verify the OIDC configuration on the npm package settings page

> If you skip this step and a new package exists, the `publish.yml` workflow will fail.

### Step 6: Verify Changesets

Make sure the changeset entries accurately reflect the release:

- **Patch-only changes?** All changesets should say `patch`
- **New migrations or metadata sync?** At least one changeset must say `minor`
- **Breaking changes?** Must have `major` (and deploy manually, not via Actions)

---

## Local Build Validation

### Step 7: Full Repo Build

**This must be done before creating the release PR.** A full local build validates compilation across all packages and regenerates bootstrap manifest files that may have drifted across merged PRs.

```bash
# 1. Pull the latest next branch
git checkout next
git pull origin next

# 2. Clean install dependencies
npm install

# 3. Full repo build
npm run build

# 4. Integration sibling-parity gate (check bundle <-> MJ: Tests metadata drift).
#    --force is required: turbo's `test` inputs are src/**, vitest.config.*, tsconfig* —
#    NOT metadata-optional/** or mj.config.cjs — so a warm cache replays a stale PASS
#    for exactly the metadata-side drift this gate exists to catch.
npx turbo run test --force --filter=@memberjunction/integration-test-suite
```

**Expected behavior:**
- The `npm run build` step runs `turbo build` across all `@memberjunction/*` packages
- The `postbuild` step regenerates bootstrap manifests (`mj-class-registrations.ts`) for:
  - `packages/ServerBootstrap/src/generated/`
  - `packages/ServerBootstrapLite/src/generated/`
  - `packages/Angular/Bootstrap/src/generated/`
  - `packages/Angular/BootstrapLite/src/generated/`
- **You will likely see diffs in these generated files.** This is normal — different PRs merge class registrations independently, and the full build reconciles them into the correct combined manifest. Commit these regenerated files to `next` before creating the release PR.

```bash
# If bootstrap files changed, commit them
git add packages/ServerBootstrap/src/generated/ packages/ServerBootstrapLite/src/generated/ \
       packages/Angular/Bootstrap/src/generated/ packages/Angular/BootstrapLite/src/generated/
git commit -m "chore: regenerate bootstrap manifests for release"
git push origin next
```

> **Why this matters:** Git merging catches code-level conflicts, but bootstrap manifests are generated files that concatenate registrations from all packages. Two PRs each adding a new `@RegisterClass` will merge cleanly (no git conflict) but the manifest won't contain both registrations until a full build regenerates it. Skipping this step can cause missing class registrations at runtime.

---

## PostgreSQL Migration Conversion

### Step 8: Convert New Migrations to PostgreSQL (`/pg-migrate-v2`)

**This must be done for every release that adds new migrations** (including the metadata-sync migration from Step 3).

MemberJunction ships migrations for **both** SQL Server and PostgreSQL. SS migrations in `migrations/v5/` are authored first; each needs a validated PostgreSQL counterpart (`.pg.sql`) in `migrations-pg/v5/`. Producing those counterparts is now a standard part of the release process, run via the **`/pg-migrate-v2`** skill (the "split-and-regenerate" pipeline) or its successor runbook **`/pg-migrate-experimental`**, which carries the latest field-tested gotchas (converter dedup mutating committed files, workbench memory limits, scheduled-job OOM, `provisioningGuard`, correct `mj_api`/`mj_explorer` workspace names — see the Gotchas section in `.claude/commands/pg-migrate-experimental.md`). Whichever variant runs, the non-negotiables are the same: **the real gate is a clean `mj migrate` on a fresh PG database**, committed `.pg.sql` files are immutable, and no `.needs-hand` files may remain.

> ⚠️ **Do this after the full build (Step 7) and before the release PR (Step 9).** Every new SS migration in this release must have a committed, verified `.pg.sql` counterpart on `next` before the PR is opened — otherwise PostgreSQL deployments of the release are missing migrations.

**What the skill does** (see `.claude/commands/pg-migrate-v2.md` for the full runbook):

1. Runs entirely inside the `claude-dev` Docker workbench (with SQL Server + PostgreSQL containers), on a dedicated `pg-migrate-v2/<branch>` branch — the host repo stays read-only until the final copy-back.
2. `mj migrate convert --split` classifies each new SS migration and transpiles only the ~2% hand-written DDL via the sqlglot AST dialect; CodeGen objects (views/sprocs/triggers/grants) are **baked inline** into each new migration. Only migrations lacking a `.pg.sql`/`.pg-only.sql` counterpart are converted — committed counterparts are immutable and never reconverted.
3. Any procedural residue the dialect can't auto-translate lands as `.needs-hand` files; these are hand-authored (lifting from the committed ledger where the routine already exists) and renamed to `.pg.sql`.
4. **The real gate:** the converted set is applied to a **fresh** PG database via `mj migrate` → `mj sync push` (no `mj codegen`). A clean apply — not the converter's "0 gaps" summary — is what proves the SQL is correct.
5. Four verification layers run: conversion parity, SS↔PG schema parity, view semantic equivalence, and a CRUD behavioral oracle — followed by full-stack browser smoke + deep CRUD workflow tests (magic-link login, no external IdP).
6. The verified `.pg.sql` files are copied back to the host as **uncommitted** changes for review, along with a `migrations-pg/PG_MIGRATION_REPORT.md`.

**After the skill finishes:** review the converted `.pg.sql` files and the report, then **commit them to `next`** so they're included in the release PR. Confirm no `.needs-hand` files were copied back (that would mean conversion is incomplete).

> **Invariant:** committed `migrations-pg/v5/*.pg.sql` / `*.pg-only.sql` are a deployed historical ledger — byte-for-byte immutable. This step only ever produces PG counterparts for the **new** SS migrations in this release.

#### What PG parity does and does NOT cover today

This step proves **schema parity** — that every new migration lands correctly on PostgreSQL. It does **not** prove **runtime behavior parity**, and it is worth being precise about the gap, because the two are easy to conflate.

| Parity | Covered? | By what |
|---|---|---|
| Migrations apply on PG | ✅ Yes | This step + `pg-migrations.yml` (a `postgres:17` service running `mj migrate` with `DB_PLATFORM: postgresql`) |
| CodeGen / External-Data-Source PG paths | ✅ Partly | `pg-migrations.yml`, `eds-integration.yml` |
| **Integration suite on PG** (runtime behavior: RunView/RunQuery SQL generation, provider code paths, UUID casing, identifier quoting) | ❌ **No** | Nothing. Zero PG bundles exist |

> ✅ **Scope check — this does NOT block the release.** Ship as normal. The SQL Server integration tier (Step 4) runs and gates exactly as documented; PG migrations are converted, verified against a fresh PG database, and committed in this step; the rest of the release (Steps 5–12) is unaffected. The only thing missing is an *additional* PG run of the test suite, which has never existed. Do not treat any of the following as a reason to halt a build.

**The stated intent is to run the integration suite twice per build — once per backend — for SS/PG parity. That is a roadmap item, not yet a release step.** It cannot be done today by configuration or by provisioning a database — three blockers, all in code:

1. **The testing CLI is SQL-Server-hardcoded, and has no PG driver to switch to.** `packages/TestingFramework/CLI/src/lib/mj-provider.ts` imports `mssql` + `setupSQLServerClient` and builds an mssql pool with no platform branch; `commands/suite.ts` calls it unconditionally, so `DB_PLATFORM` is never read on the `mj test` path. Its `package.json` declares `mssql` and `@memberjunction/sqlserver-dataprovider` and **no PostgreSQL driver at all** — so this is a dependency change as well as a code change. Point `.env` at Postgres and the run dies at `mj-provider.ts` `connectionPool.connect()` — a TDS handshake against a PG server — before a single check executes.
2. **The PG bootstrap that does exist throws by design.** `testing-integration/src/bootstrap.ts` dispatches to `setupPostgreSQLProvider` when `DB_PLATFORM=postgresql`, but `resolvePostgresContextUser` raises: *"UserCache.Refresh is mssql-only, so PG needs a PG-aware user-cache bootstrap before the integration suites can run against it (tracked Phase-0 prerequisite)."* Its own comment concludes: *"The PG parity CI lane is therefore non-blocking until that framework gap is closed."*

   > **"Couldn't a freshly-migrated PG database with users in it fix this?" No — and it's worth knowing why, because it's the obvious first idea.** The cache is empty on PG for a *code* reason, not a *data* reason: `UserCache.Refresh` (`packages/SQLServerDataProvider/src/UserCache.ts:36`) takes an **`sql.ConnectionPool`** (an mssql type) and runs **T-SQL** — `new sql.Request(pool)` against `` SELECT * FROM [schema].vwUsers ``. On PostgreSQL there is no mssql pool to hand it, and the bracket syntax isn't valid PG anyway; it also swallows its own errors (`catch { LogError(err) }`), so the cache stays silently empty no matter how many users the database holds. Provisioning a database cannot change any of that.
3. **Even if it ran, it would report false greens.** Bundles whose catalog queries are T-SQL key off the mssql pool, which the PG bootstrap leaves undefined — `metadata-consistency` documents that *"on PG every check skips-as-pass with a logged note."* A green PG run would mean "didn't execute," not "passed."

Enabling it is a **code change, not configuration**: a platform branch (and a PG driver dependency) in `mj-provider.ts`, plus a PG-aware user-cache bootstrap — then a `pg-parity` bundle (Domain 8, catalogued but never built) and a CI lane. Until then, `integration.yml` provisions SQL Server 2022 only and there is no platform matrix.

> **For whoever picks this up: the hard part is already solved elsewhere.** `PostgreSQLCodeGenProvider.SetupDataSource()` (`packages/CodeGenLib/src/Database/providers/postgresql/PostgreSQLCodeGenProvider.ts`) already performs a working PG-native user load — it hand-queries `SELECT * FROM "schema"."vwUsers"` / `"vwUserRoles"` and builds real `UserInfo[]` with the same audit-user semantics (Owner, else first user). Its own comment names the exact gap and the intended fix: *"SQL Server uses `UserCache.Instance.Refresh(pool)` which is hard-typed to `mssql.ConnectionPool`… Refactoring it to be cross-platform would touch that package's public API; until then PG hand-queries `vwUsers`/`vwUserRoles` here. Tracked for follow-up: unify behind a platform-agnostic cache."* So the Phase-0 prerequisite is a known, scoped refactor with a working reference implementation — not open-ended research.

> Track it as a release-readiness gap rather than silently skipping it: PostgreSQL deployments of a release currently ship with migration parity verified and **runtime parity unverified**.

---

## Creating the Release

### Step 9: Create PR from `next` → `main`

> **Important:** All changes from the previous steps (metadata migration scripts, new changesets, AI model updates) must already be committed and pushed to `next` before creating this PR.

1. Open a PR: `next` → `main`
2. The **"Generate Release Notes"** workflow (`generate-release-notes.yml`) will auto-populate the PR title (e.g., `v5.6.0`) and description with structured release notes
3. Wait for the generated PR message to appear
4. Wait for **all CI checks** to pass:
   - `changes.yml` — validates migration filenames, version patterns, schema placeholder usage. **This is the only workflow that triggers on the release PR itself** (it's the one workflow listening on PRs into `main`).
   - Everything else you see on the PR is **surfaced from the push-to-`next` run on the same head SHA** — `test.yml` (unit tests), `integration.yml` ("Integration Tier", deterministic suite), `build.yml`, and `migrations.yml` / `pg-migrations.yml` when migrations changed. If any of those are missing rather than green, the `next` tip never got a clean run — go back to Step 1.

   > Two traps in this list: the hardcoded-UUID scan for migrations is now an **advisory, non-blocking** step *inside* `changes.yml` (the old `claude.yml` workflow was deleted) — it posts a sticky PR comment plus a `::warning` and **never fails the job**, so you must read it, not just wait for green. And `dependency-check.yml` only triggers on PRs into `next`, so it will not appear on this PR at all.

### Step 10: Merge the PR

Once all checks pass, merge the PR into `main`.

---

## Post-Merge: Automated Pipeline

Merging to `main` triggers a chain of automated workflows. Monitor each one.

### 10a. `publish.yml` — Build & Publish Packages

**Triggered by:** push to `main`

This workflow:
1. Runs migration tests against a fresh SQL Server container
2. Validates package-lock.json case sensitivity
3. Validates all `@memberjunction/*` packages exist on npm (see Step 5)
4. Determines version bump (minor if new migrations, patch otherwise)
5. Builds all packages
6. Publishes to npm via OIDC
7. Tags the release
8. **Auto-merges `main` back into `next`** and updates lock files

### 10b. `docker.yml` — Build & Publish Docker Images

**Triggered by:** `publish.yml` completion

Builds and pushes multi-platform Docker images (`linux/amd64`, `linux/arm64`):
- Docker Hub: `memberjunction/api:latest` and `memberjunction/api:v{VERSION}`
- Azure ACR: `askskip.azurecr.io` with same tags

> **Known issue:** This workflow sometimes fails because it tries to install the newly published npm packages before they've fully propagated on the npm registry. If it fails, **re-run the failed job** — it usually succeeds on the second attempt.

### 10c. `docs.yml` — Update Package Documentation

**Triggered by:** `publish.yml` completion

Builds TypeDoc documentation and deploys to GitHub Pages.

### Post-Merge Checklist

- [ ] `publish.yml` completes successfully (npm packages published, tag created)
- [ ] `docker.yml` completes successfully (Docker images pushed)
- [ ] `docs.yml` completes successfully (GitHub Pages updated)
- [ ] `main` auto-merged back into `next` (includes lock file updates)
- [ ] **`next` branch build passes** after the auto-merge — the lock file and version updates can sometimes cause issues, so always verify `build.yml` passes on `next` after a release

---

## Post-Release Updates

### Step 11: Update MJ Documentation Site

Go to [ReadMe Dashboard](https://dash.readme.com/):

1. Click **Edit**
2. Navigate to **quickstart-download**
3. Confirm the quickstart points users at the CLI installer — `npx @memberjunction/cli install` (online) or `npx @memberjunction/cli bundle` for an offline zip — rather than a per-version download link.
4. **Save** — this can be done while the post-merge actions are still running

> **Note:** The legacy per-version distribution zip (`Distributions/MemberJunction_Code_Bootstrap.zip`) has been retired. `mj install` now sparse-fetches and assembles the project from the tagged source on demand, so there is no longer a version-specific zip URL to update each release.

### Step 12: Update Changelog

**Wait until ALL of the following are complete before saving:**
- [ ] npm packages published
- [ ] Docker images pushed

> Saving the changelog sends a notification to users, so everything must be live first.

---

## Quick Reference

### Key Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `build.yml` | Push to `next` | Build smoke test |
| `test.yml` | PR to `next` | Unit tests |
| `migrations.yml` | Push to `next` (migrations changed) | Validate migrations |
| `changes.yml` | PR to `next` or `main` | Validate migration naming & changesets |
| `publish.yml` | Push to `main` | Version, build, publish to npm |
| `docker.yml` | After `publish.yml` | Build & push Docker images |
| `docs.yml` | After `publish.yml` | Deploy TypeDoc to GitHub Pages |
| `generate-release-notes.yml` | PR to `main` | Auto-generate PR description |
| `integration.yml` | PR to `next` + push to `next` | Deterministic integration tier against a fresh SQL Server |

### Migration Naming Convention

```
V[YYYYMMDDHHMM]__v[MAJOR].[MINOR].x__[Description].sql
```

- `V` prefix (not `B` — that's only for baselines)
- Timestamp: `YYYYMMDDHHMM` — must be strictly greater than all existing timestamps
- Version: matches the target release minor version
- Description: underscores between words, PascalCase words
- Use `${flyway:defaultSchema}` — never hardcode the schema name
- Do NOT include `__mj_CreatedAt`/`__mj_UpdatedAt` columns (CodeGen handles these)
- Use hardcoded UUIDs (not `NEWID()`)

### MJ CLI Commands

```bash
# Check MJ CLI version
mj version

# Run database migrations
mj migrate

# Push metadata to database
mj sync push --dir ./metadata

# Seed the integration metadata — REQUIRED before Step 4 (IT01-IT66 Tests, the two tier suites,
# the RLS principals, and the IT agent/prompt/skill/search fixtures; the TestType itself lives in
# normal metadata/) — TEST/CI databases ONLY, never production (kept out of ./metadata on purpose)
npx mj sync push --dir ./metadata-optional/integration-test --ci

# SQL logs appear in
metadata/sql_logging/MetadataSync_Push_*.sql
```

### Integration Suite Commands

```bash
# Repo root, repo-local CLI only. MJ_INTEGRATION_TEST=1 is mandatory — without it every
# server-transport test errors out. Exit code 2 = ran inside a process that already owns
# the cache (e.g. a live MJAPI).

# Deterministic tier (52 tests) + mutation axis — the release gate
RUN_MUTATION_TESTS=1 npm run test:integration

# Live-model tier (15 tests) — SEPARATE suite, real LLM cost. Note the em dash.
MJ_INTEGRATION_TEST=1 npx mj test suite "Integration Tests — Live Model"

# Re-run one bundle during triage
MJ_INTEGRATION_TEST=1 npx mj test run "IT## - <name>"

# Validate Test/Suite definitions without executing anything
npx mj test validate --type "Integration Test"
```

### Changeset Commands

```bash
# Add a new changeset
npm run change

# Version packages based on changesets (done by CI, rarely manual)
npm run version
```

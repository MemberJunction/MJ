# MemberJunction Release & Deployment Guide

This document covers the end-to-end process for releasing a new version of MemberJunction. All `@memberjunction/*` packages are versioned together (fixed group via changesets).

> ### 🤖 If you are an AI coding agent running this release
>
> **Build a persistent checklist of all 12 steps (0–11) before you start, and tick each one off as it completes.** A release spans hours, several CI waits, and a Docker workbench session, so steps get silently skipped — **Step 5 was nearly missed in v5.49.0** precisely because it sits between two long-running steps and has no CI equivalent to remind you.
>
> Include the sub-steps that are separately skippable: 3.8 (commit the mj-sync writeback), 4.2 (seed integration metadata), 4.2b (the `UserSetting` floor), 5 (new-package npm placeholders), 7's parity gate, and 11 (the changelog).
>
> Steps 5 and 11 are the ones with no automated backstop. If you skip a CI-covered step, something goes red. If you skip those two, nothing does.

> ### Local values differ per engineer — resolve them, don't copy them
>
> Every port, container name, database name and path in this guide is **an example from one machine**. Ports collide, containers get named differently, and `.env` varies. Read your own before running anything:
>
> ```bash
> grep -E '^(DB_HOST|DB_PORT|DB_DATABASE|GRAPHQL_PORT)=' .env   # your DB + API port
> docker ps --format '{{.Names}}\t{{.Ports}}'                    # your container names
> ```
>
> Known to vary: the SQL Server container name (`mj-sqlserver-1455` here) and its host port; `GRAPHQL_PORT` (this repo's `.env` uses **4000**, while root `CLAUDE.md` still says 4001); the Explorer port (4200 in the workbench, 4201 on a desktop dev setup); and the scratch release database name. The workbench's own ports are set by `MJAPI_HOST_PORT` / `EXPLORER_HOST_PORT` in `docker/workbench/.env`.
>
> Where a command must agree with a running service, derive it rather than typing it — e.g. the integration suite builds its URL from `GRAPHQL_PORT`, so MJAPI and the test run cannot disagree if both read `.env`.

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

### Step 0: Preflight — check the environment before you start

These are cheap to verify and expensive to discover mid-release. Every item below cost real time in a previous build.

**1. The workbench env file exists (needed in Step 8).** `docker/workbench/.env.database` is **gitignored** and must exist locally, or `docker compose up` fails with `env file … not found`. Copy the tracked template:

```bash
cp -n docker/workbench/.env.database.example docker/workbench/.env.database
```

> The template is the single source for those values — do not retype them here or anywhere else. If you override `SA_PASSWORD` / `PG_PASSWORD` in `docker/workbench/.env`, update `.env.database` to match.

**2. Provider API keys are *valid*, not merely present.** The live-model tier has **no credential preflight** — a dead key fails the tier and the failures look exactly like product defects. In one build an expired Gemini key produced 11 red agent tests that were triaged as a `BaseAgent` regression before the real cause surfaced. Verify before you start:

```bash
# Google — 200 = good, 400 = dead key
curl -s -o /dev/null -w 'gemini=%{http_code}\n' \
  -H "x-goog-api-key: $(grep '^AI_VENDOR_API_KEY__GeminiLLM=' .env | cut -d= -f2- | tr -d "'\"")" \
  https://generativelanguage.googleapis.com/v1beta/models
# OpenAI
curl -s -o /dev/null -w 'openai=%{http_code}\n' https://api.openai.com/v1/models \
  -H "Authorization: Bearer $(grep '^AI_VENDOR_API_KEY__OpenAILLM=' .env | cut -d= -f2- | tr -d "'\"")"
```

**3. `MJ_API_KEY` is in repo-root `.env`, not just your shell.** It is a **self-chosen shared secret** — no registry issues it; `MJServer` reads `process.env.MJ_API_KEY` and string-compares it against the `x-mj-api-key` header. Both MJAPI *and* the test run need the same value, so `.env` is the only channel that reliably reaches both. Generate one if absent:

```bash
grep -q '^MJ_API_KEY=' .env || printf 'MJ_API_KEY=%s\n' "$(openssl rand -hex 32)" >> .env
```

**4. Docker has headroom.** Step 8's workbench adds four containers plus two turbo builds. Check before you start — an unrelated hot container has starved SQL Server badly enough to masquerade as migration timeouts for over an hour:

```bash
docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'
```

Stop anything unrelated. On a < 8 GiB Docker VM, cap every turbo build with `--concurrency=2`.

### Step 1: Verify CI on `next`

Before anything else, confirm the `next` branch is healthy:

- [ ] **"Build all packages for testing"** (`build.yml`) — passes on `next`
- [ ] **"Test migrations"** (`migrations.yml`) — passes if migrations were changed
- [ ] **"Unit Tests"** (`test.yml`) — passes on any open PR, and on the **push-to-`next`** run (that unfiltered backstop is the one that actually proves integration-bundle ↔ `MJ: Tests` metadata sibling parity; a metadata-only PR never triggers `test.yml` at all)
- [ ] **"Integration Tier"** (`integration.yml`) — passes on `next`. Runs the deterministic suite **twice, once per backend** (`integration-sqlserver` and `integration-postgresql`, both blocking) on PRs into `next` plus an unfiltered push-to-`next` backstop. Both must be green. It is **not** a substitute for Step 4: CI runs no MJAPI (so client-transport bundles skip) and no live-model tier.

> **Don't idle here.** These runs take ~15 minutes. **Step 3 (fresh database + migrate + metadata push) is independent of them** — it works on a local scratch database and reads nothing from CI. Start Step 3 while Step 1 runs and check back. The only ordering that matters is that Step 3's results are committed before the release PR.
>
> Step 2 must still precede Step 3, since its model metadata has to be present before the sync push.

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
   > test-only records — the **IT01–IT68 Tests (69 records: 54 in the Deterministic suite, 15 in
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
| `Integration Tests — Deterministic` | 54 | **Required — must be 54/54.** Deterministic: any shortfall blocks the release |
| `Integration Tests — Live Model` | 15 | **Required to run and be triaged — but *not* required to be 15/15.** Real LLM calls; see 4.4 |

> **The two tiers have different pass criteria, and conflating them will either block a good release or wave through a bad one.** The deterministic tier is exactly that — 54/54 or stop (skips are reported separately and are not passes; see 4.3). The live tier drives real models, and `agents-suite.md` documents run-to-run variance as a known characteristic "surfaced honestly rather than hidden": checks that need the model to take a specific action use a two-phase bounded retry (≤3 attempts) and then fail **loudly** with `model-noncompliance:`. So a live shortfall is not automatically a blocker — every failing live test must be **triaged individually** (see 4.6): `model-noncompliance:` is variance and may be accepted; anything else is a real defect and blocks.

> ⚠️ Do **not** run `mj test suite "Integration Tests"`. That is the empty parent container (zero members); it exits **1** with `No tests found in suite: <id>`. A hyphen typed instead of the em dash also exits 1, with `Test suite not found: <arg>`.

> 🐘 **Run this step against SQL Server — that is all this step requires.** PostgreSQL runtime parity is covered separately and automatically by the blocking `integration-postgresql` CI lane (see "What PG parity covers" in Step 8), so you do not need to run Step 4 twice by hand. You *can* now, if you want to reproduce a PG lane failure locally: set `DB_PLATFORM=postgresql` and `DB_PORT=5432` and point `.env` at a migrated PostgreSQL database — as of #3257 the testing CLI has a real platform branch and a PG driver. Expect 21 skipped tests there — IT24 (whose `sys.*` catalog queries are dialect-impossible on PG) and IT67 (content-vectorization, whose entity has no PG migration yet) plus the 19 client-transport members if you have no MJAPI running.

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

This seeds **246 records**: the **69 IT Test records** (IT01–IT68), the 3 suite rows and their 54 + 15 memberships, the RLS principals (3 synthetic `it-*@integration.test` users + their 2 user-role rows + the `Integration Test: RLS Scoped Reader` role + 2 entity-permission grants), and the synthetic AI stack the live tier drives (14 `IT: *` AI Agents — 12 root-level — 14 IT AI Prompts with 42 multi-vendor model bindings + templates, `IT: Probe Skill`, `IT: Integration Test Scope`, and the IT categories). Expect `Created 246 / Errors 0` in the push summary.

Verify it actually landed — the push can exit 0 without seeding, which silently degrades the RLS checks to skip-as-pass (this is the same assertion `integration.yml` makes in CI):

```sql
SELECT COUNT(*) FROM __mj.[User] WHERE Email LIKE '%@integration.test';   -- must return 3
```

> 🚨 **Scratch Step-3 database ONLY — never a production database, and never move these files into `metadata/`.** Post-#3228 the blast radius is no longer inert test data: the 12 root-level `IT: *` agents would appear in **every** user's `@agent` picker and `IT: Probe Skill` in every user's `/skill` picker (both permission-open by default), on top of 3 live user accounts, a role, and its grants.

> This push emits **no** SQL log, so it cannot contaminate the Step-3 `Metadata_Sync.sql` migration. It **does** rewrite `sync.lastModified`/`checksum` into the `metadata-optional/**` JSON files — **discard that churn.** Unlike the Step-3 `metadata/**` writeback (Step 3.8), it does not belong in the release commit.

> **No longer required: the `MJ: User Settings` baseline seed.** `IT29 - Cache Gauntlet`'s CG1/CG4/CG5
> enforce an anti-vacuity floor (a `MaxRows:1` slot proves nothing against an empty table), and they
> used to *assume* the rows already existed — so a virgin Step-3 database failed them with
> `need >= 2 existing rows … (found 0)` and needed a manual `INSERT` first. As of #3257 each check
> **seeds its own floor** inside its existing `try/finally`, so all 8 cache-gauntlet checks pass on a
> brand-new database with no manual step. If you still have that seed SQL in your runbook, drop it.

#### 4.3 Start MJAPI (REQUIRED — 19 of the 54 deterministic tests need it)

19 of the 54 deterministic members are **client-transport** and exercise the real GraphQL wire (IT03, IT15, IT23, IT25–IT28, IT31–IT34, IT37, IT40, IT43–IT45, IT47, IT50, IT52). Start MJAPI against the Step-3 database before running:

```bash
# In a separate shell, pointed at the Step-3 database
cd packages/MJAPI && npm run start
```

> ⚠️ **Run it from `packages/MJAPI`, not `npm run start:api` from the repo root.** The root script is `turbo start --filter=mj_api`, and **turbo passes through only the environment variables declared in `turbo.json`** — anything else is stripped before the task sees it. Overriding the database with `DB_DATABASE=… npm run start:api` therefore fails with `Error parsing config file … "path": ["dbDatabase"] … "received": "undefined"`, which reads like a config-file problem rather than an env-passthrough one. Running from the package directory bypasses turbo entirely and the variables arrive intact.

- `MJ_API_KEY` must be in **repo-root `.env`** (Step 0.3), not just your shell — MJAPI and the test run are separate processes and both must see the same value. You invent this value; nothing issues it (`MJServer` string-compares `process.env.MJ_API_KEY` against the `x-mj-api-key` header). Confirm it authenticates end-to-end before running the suite, rather than discovering it 19 tests later:
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "http://localhost:${GRAPHQL_PORT:-4000}/" \
    -H 'Content-Type: application/json' -H "x-mj-api-key: $(grep '^MJ_API_KEY=' .env | cut -d= -f2-)" \
    -d '{"query":"{ __typename }"}'      # 200 = good; 401 = key mismatch
  ```
- **Start MJAPI from the *current* build — after Step 7, not before.** For the 19 client-transport bundles, the running server *is* the artifact under test, so a stale `packages/MJServer/dist/` silently tests last week's server. This is not theoretical: a server built before this release's merge fails `transaction-groups.TG5` with `SCOPE BYPASS (bug-register B1): a view:run-only API key executed a Create via ExecuteTransactionGroup` — the check working exactly as designed, reporting that the server it reached lacks the scope gate. Confirm before blaming the product:
  ```bash
  ls -t packages/MJServer/dist/resolvers/TransactionGroupResolver.js \
        packages/MJServer/src/resolvers/TransactionGroupResolver.ts | head -1   # want the dist file
  ```
- If MJAPI has been up a long time, restart it fresh — a resource-degraded server produces spurious timeouts.

Both failure modes are now **visible in the counts and in the exit code** — as of #3257 they no
longer masquerade as a pass:

| Condition | Result |
|---|---|
| MJAPI not reachable | 19 tests report **`Skipped`** (`SKIPPED (environment gap)`) — counted separately, excluded from the pass rate, and NOT a pass. Exit code 0, because a skip is not a failure |
| `MJ_API_KEY` unset or rejected | 19 tests report **`Skipped`** too — the missing key is the same environment gap, raised as `IntegrationEnvironmentUnavailableError` from `LoadClientConfig` before the preflight |
| MJAPI reachable but rejects the key | status `Error` — a real failure, and it now **exits non-zero** (`failedTests` is failure-closed) |

Before #3257 the first row silently reported `Passed` and the second reported `Error` while the
suite still exited 0 — so 19 of 54 tests never ran and the tier reported green either way. If you
see 19 skips here, that is the honest number, not a regression.

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
- **Anything else red** — a real product defect. Re-run the single bundle before re-running the tier:
  ```bash
  MJ_INTEGRATION_TEST=1 npx mj test run "IT## - <name>"
  ```
  > 🚨 **Do NOT use single-bundle re-run to triage the live-agent bundles (IT53–IT62).** `mj test run` takes a **different transport path** than the same bundle inside the suite: `agent-loop-live` is not in the `CLIENT_BUNDLES` set (`IntegrationTestDriver.ts`), so standalone it executes the agent **in-process** with no server `contextUser`, fails 7/7, and floods the log with `[CRITICAL] … must provide the contextUser parameter`. In-suite it passes, because an earlier client bundle rebinds the process's global provider. Re-run the **whole live suite** for those. Tracked as **#3251**. Single-bundle triage remains valid for deterministic bundles.

Do **not** reorder suite membership (client-transport members are deliberately sequenced last — the client bootstrap rebinds the process's global provider), and do not declare the gate green on the exit code alone.

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
- **You will likely see diffs in these generated files.** This is normal — different PRs merge class registrations independently, and the full build reconciles them into the correct combined manifest.

**Decide whether the diff is substantive before committing it.** There are two very different cases, and only one needs a commit:

```bash
# Substantive? Compare the registration COUNT, not the diff size.
git diff packages/ServerBootstrap/src/generated/mj-class-registrations.ts | grep -E '^[+-]' | grep -vE '^[+-]{3}'
```

| What changed | Action |
|---|---|
| **Import/registration lines added or removed** (the count in the header comment moved, e.g. `105 contain @RegisterClass` → `107`) | **Commit it.** This is the case the step exists for — a missing registration is a runtime failure |
| **Only the header comment's package-walk count** (e.g. `1211 packages walked` → `1207`), registrations unchanged | **Leave it uncommitted.** `publish.yml` regenerates and commits these post-release itself — `9cc0a42fa5 chore: post-release generated files [skip ci]` did exactly that for v5.48, covering `mj-class-registrations.ts` for both bootstraps plus `version.generated.ts` |

```bash
# ONLY if registrations actually changed:
git add packages/ServerBootstrap/src/generated/ packages/ServerBootstrapLite/src/generated/ \
       packages/Angular/Bootstrap/src/generated/ packages/Angular/BootstrapLite/src/generated/
git commit -m "chore: regenerate bootstrap manifests for release"
git push origin next
```

> **Why this matters:** Git merging catches code-level conflicts, but bootstrap manifests are generated files that concatenate registrations from all packages. Two PRs each adding a new `@RegisterClass` will merge cleanly (no git conflict) but the manifest won't contain both registrations until a full build regenerates it. Skipping this step can cause missing class registrations at runtime.
>
> The same reasoning is why a *cosmetic* diff should be left alone: committing it adds release-PR noise for a file CI is about to rewrite anyway. `package-lock.json` changes from `npm install` fall in the same bucket — `publish.yml` updates lock files during the `main` → `next` back-merge.

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

#### 🚨 Verify content, not just existence — the gate cannot do this for you

**The "clean apply" gate is structurally blind to an emptied migration, because empty SQL applies cleanly.** So does the L1 parity script, which only checks that a counterpart file *exists*. A silently-emptied `.pg.sql` passes every automated check in this step and ships.

This is not hypothetical. It has happened in both directions:

- **v5.45** shipped `Metadata_Sync.pg.sql` as a **126-byte marker** — 12,041 lines of SQL Server metadata DML reduced to two comment lines. PostgreSQL deployments migrating through v5.45 silently received none of that release's curated metadata (issue #3253). The v5.46 PG baseline was dumped from a gapped database, so **fresh installs from that baseline were gapped too**. Healed forward in v5.50 by the idempotent reseed [`V202607271005__v5.50.x__Reseed_v545_Metadata.pg-only.sql`](migrations-pg/v5/V202607271005__v5.50.x__Reseed_v545_Metadata.pg-only.sql) (derivation: [`scripts/generate-v545-metadata-reseed.mjs`](scripts/generate-v545-metadata-reseed.mjs); rationale below) — no `mj sync push` required.
- In a later build the converter emitted **three** header-only stubs and one file containing six bare `;` statements where six `CREATE INDEX` statements belonged — while reporting `unhandled stmts: 0` and exiting successfully (issue #3252).

##### How to heal a ledger gap (and why the obvious repairs are wrong)

If you find a gap like v5.45's, **do not repair history.** Committed `.pg.sql` files and baselines are an immutable ledger: deployed databases hold their Flyway checksums, so editing one breaks validation for everyone who already ran it. Three repairs look attractive and are all wrong:

- **Rewriting the bad file in place** breaks checksum validation on every deployment that already executed it, and does nothing for databases already past that version.
- **Regenerating the gapped baseline** has the same checksum problem for every install created from it, and again does nothing for migrate-through deployments. (Future baselines self-heal on their own: any database they are dumped from will have run the reseed.)
- **Producing a delta with `mj sync push` against a gapped database** emits current-JSON state, which entangles unreleased metadata with the fix and is not reproducible from the repo alone.

What works is a **forward-dated, idempotent reseed**, derived by replaying the original source through the converter and post-processing it — with the derivation script committed next to the artifact so the 7,000-line output is reviewable. Three properties make it safe to run on every database, gapped or whole: each create is guarded by an `IF EXISTS (… WHERE "ID" = …) THEN RETURN` on its primary key; updates that a later release already re-applied full-row are excluded (computed from the ledger, with a field-superset assertion, so replaying older values cannot revert newer state); and the delete is `IF EXISTS`-guarded. The gapped file and baseline stay in the ledger permanently — the content gate grandfathers them.

**Heal any future gap of this class the same way**, and stamp the reseed *after* every migration whose counterpart is still pending: Flyway runs with `outOfOrder: false`, so a counterpart generated later but stamped earlier cannot be applied to a database that already ran the reseed.

**Always diff output size against source before committing:**

```bash
# Every new .pg.sql vs its SS original — investigate anything suspiciously small
for f in migrations/v5/V*.sql; do
  b=$(basename "$f" .sql); pg="migrations-pg/v5/${b}.pg.sql"
  [ -f "$pg" ] || continue
  ss=$(wc -l < "$f"); p=$(wc -l < "$pg")
  [ "$p" -le 25 ] && [ "$ss" -gt 60 ] && printf 'SUSPECT %-58s SS=%s PG=%s\n' "${b:0:56}" "$ss" "$p"
done
```

**Also check DELETE parity in the metadata sync specifically.** mj-sync emits record deletions as bare `EXEC …spDelete… @ID = '…'` batches with no `DECLARE` block. The legacy converter (the mandated path for `*_Metadata_Sync.sql`) used to silently skip these — they vanished into the anonymous "skipped" count while the run reported OK, which is how v5.45's `spDeleteComponentRegistry` was dropped (issue #3253). It was never the only one: **196 such deletions across 10 metadata syncs (v5.9 through v5.45) reached zero committed PG counterparts.** The converter now converts all 196 (see `StatementClassifier` "bare EXEC CRUD sp calls" and `ExecBlockRule.splitIntoBlocks`), and **you no longer check this by hand** — size-diffing can't see one missing statement, so [`scripts/check-pg-migration-content.mjs`](scripts/check-pg-migration-content.mjs) counts the deletions on both sides and fails the build when they disagree. It runs in CI ([`pg-migrations.yml`](.github/workflows/pg-migrations.yml)) and locally:

```bash
node scripts/check-pg-migration-content.mjs
# → PG content OK — … Delete parity OK — 10 pair(s) with deletions, 10 grandfathered, 0 mismatched.
```

The 10 historical gaps are grandfathered in `DELETE_PARITY_GRANDFATHERED` because committed `.pg.sql` files are Flyway-checksummed and immutable. **A new release must have parity** — do not add an entry to silence a failure; a new gap means the converter dropped a statement. If a deletion genuinely doesn't apply to PostgreSQL, hand-port it as a guarded `DO` block (`IF EXISTS (SELECT 1 FROM __mj."<Table>" WHERE "ID" = '…') THEN PERFORM __mj."spDelete<Table>"(p_ID := '…'); END IF;` — see the synthesized delete in [`V202607271005__v5.50.x__Reseed_v545_Metadata.pg-only.sql`](migrations-pg/v5/V202607271005__v5.50.x__Reseed_v545_Metadata.pg-only.sql) for the exact shape) and say why in the migration.

**An empty counterpart is sometimes correct** — do not blindly treat every hit as a defect. Two legitimate cases:

- The SS migration modifies a routine that PostgreSQL maintains in **TypeScript** rather than a migration (e.g. `spUpdateExistingEntityFieldsFromSchema` lives in `packages/CodeGenLib/src/Database/providers/postgresql/metadataSupportObjects.ts`). Verify the TS side actually received the equivalent change in this release.
- PostgreSQL genuinely never had the defect the SS migration fixes.

**When an empty file is correct, say so in the file.** A bare stub is indistinguishable from the silent-emptying bug. Write a header explaining *why* it is empty and what carries the change instead — that turns "empty" from an invisible state into a documented decision a reviewer can check.

#### Check git history before hand-authoring anything

Feature PRs sometimes author their own `.pg.sql` counterparts, which are then **deliberately deleted** under the "build engineer creates PG migrations during the build" policy. That work is reviewed and recoverable — search for it before writing your own:

```bash
git log --all --oneline --diff-filter=A -- '*<MigrationName>.pg.sql'   # was it ever authored?
git show <deleting-commit>^:migrations-pg/v5/<file>.pg.sql > /tmp/recovered.pg.sql
```

In one build this recovered a hand-authored PL/pgSQL trigger (a `BEFORE INSERT FOR EACH ROW` using `pg_advisory_xact_lock`) plus a full CodeGen bake — 7,002 lines that would otherwise have been re-authored from scratch and re-reviewed. Confirm the SS source hasn't changed since the deletion before reusing it:

```bash
git log --oneline <deleting-commit>..HEAD -- migrations/v5/<MigrationName>.sql   # blank = still matches
```

> **Invariant:** committed `migrations-pg/v5/*.pg.sql` / `*.pg-only.sql` are a deployed historical ledger — byte-for-byte immutable. This step only ever produces PG counterparts for the **new** SS migrations in this release.

#### What PG parity covers

This step proves **schema parity** — that every new migration lands correctly on PostgreSQL. As of
the #3257 wave, **runtime behavior parity is also covered**, by a second blocking CI lane that runs
the same deterministic integration suite against PostgreSQL.

| Parity | Covered? | By what |
|---|---|---|
| Migrations apply on PG | ✅ Yes | This step + `pg-migrations.yml` (a `postgres:17` service running `mj migrate` with `DB_PLATFORM: postgresql`) |
| CodeGen / External-Data-Source PG paths | ✅ Partly | `pg-migrations.yml`, `eds-integration.yml` |
| **Integration suite on PG** (runtime behavior: RunView/RunQuery SQL generation, provider code paths, UUID casing, identifier quoting) | ✅ Yes | `integration.yml` job `integration-postgresql` — blocking, plus the `pg-parity` bundle (IT68) which runs on **both** backends |

> 🚦 **This step is now gated on both backends.** `integration.yml` runs two blocking jobs —
> `integration-sqlserver` and `integration-postgresql` — so a PostgreSQL runtime regression fails the
> PR the same way a SQL Server one does. Both lanes set `RUN_MUTATION_TESTS=1`, which also activates
> the 47 pre-existing mutation-tier checks that no workflow had previously enabled (49 across 13 bundles now, counting this PR's two pg-parity CRUD legs).

**How to read the result.** Both lanes report a **Skipped** count alongside passed/failed, and a skip
is neither. Expect **20** skipped tests on the PostgreSQL lane and **19** on SQL Server:

- **The 19 client-transport members** (both lanes) — every deterministic-suite record whose
  Configuration sets `transport: "client"`. CI runs no MJAPI and sets no `MJ_API_KEY`, so these
  cannot execute on either platform. They are an *environment* gap, not a platform one: run MJAPI
  locally and they execute normally. Before #3257 they reported `Error`, and the suite exit code
  counted only `Failed` — so 19 of 54 tests silently never ran and the lane still went green. That
  is the single largest coverage gap this change exposes.
- **IT24 — Metadata/DB Consistency Audit** (PostgreSQL lane only). The `metadata-consistency` bundle
  declares `Platforms: ['sqlserver']` because its `sys.objects` / `sys.check_constraints` /
  `sys.indexes` catalog queries have no PostgreSQL equivalent. That is *dialect-impossible*, the only
  justification for a platform declaration.

Bringing those 19 back into coverage means standing an MJAPI up in CI with an `MJ_API_KEY`. That is
deliberately **not** in scope here — this change makes the gap visible and countable first.

Any **other** skip is a real finding, never to be declared away with a platform restriction. The pass
rate is computed over *executed* tests, so a skip neither pads nor depresses it. `Error` and `Timeout`
are **not** skips: they gate the build exactly like `Failed`.

**Triaging a PostgreSQL-lane failure — in this order.** Not every red is a parity bug:

1. **Is the check's own SQL dialect-specific?** `ExtraFilter` and any `ExecuteSQL` string is raw SQL
   handed to the database. A bare `IsActive=1` fails on PostgreSQL (`boolean = integer`),
   `[bracket]` quoting reaches PostgreSQL verbatim as a syntax error, and an unquoted mixed-case
   view folds to lowercase and disappears. Fix with `provider.Dialect.BooleanLiteral` /
   `QuoteSchema` / `QuoteIdentifier` — **not** with a platform declaration.
2. **Is it a provisioning failure?** `PostgreSQLDataProvider.Config` returns `false` rather than
   throwing; the bootstrap converts that into a loud error naming the database and schema.
3. **Only once 1 and 2 are excluded** is it a genuine SS/PG parity bug — which is what the lane
   exists to surface, and it belongs red until fixed or tracked.

> **Why the suite can now run on PostgreSQL at all.** Three code blockers were removed in #3257:
> the testing CLI gained a platform branch and a PG driver (`mj-provider.ts` +
> `optionalDependencies`); `UserCache` gained a platform-neutral `RefreshFromRows(users, roles, provider)`
> that both backends feed (replacing the mssql-only `Refresh(pool)` monopoly, and the two production
> sites that had been smashing the private `_users` field to work around it); and the driver gained a
> real `'Skipped'` status, so a gated or platform-excluded test no longer reports as `Passed`.
>
> That last one also uncovered two things CI had never actually been running: `metadata-consistency`
> (MC1–MC6 and MC8 — MC7 is deliberately unimplemented) had **never executed on either platform** — `ctx.Pool` comes from the active bootstrap
> context and the `mj test` CLI did not publish one, so the pool was undefined on SQL Server too and
> every check skipped-as-pass — and the 47 pre-existing mutation-tier checks had never run in CI at all. Both now do.

---

## Creating the Release

### Step 9: Create PR from `next` → `main`

> **Important:** All changes from the previous steps (metadata migration scripts, new changesets, AI model updates) must already be committed and pushed to `next` before creating this PR.

1. Open a PR: `next` → `main`
2. The **"Generate Release Notes"** workflow (`generate-release-notes.yml`) will auto-populate the PR title (e.g., `v5.6.0`) and description with structured release notes
3. Wait for the generated PR message to appear
4. Wait for **all CI checks** to pass:
   - `changes.yml` — validates migration filenames, version patterns, schema placeholder usage. **This is the only workflow that triggers on the release PR itself** (it's the one workflow listening on PRs into `main`).
   - Everything else you see on the PR is **surfaced from the push-to-`next` run on the same head SHA** — `test.yml` (unit tests), `integration.yml` ("Integration Tier", deterministic suite — **two jobs, SQL Server and PostgreSQL, both must be green**), `build.yml`, and `migrations.yml` / `pg-migrations.yml` when migrations changed. If any of those are missing rather than green, the `next` tip never got a clean run — go back to Step 1.

   > Two traps in this list: the hardcoded-UUID scan for migrations is now an **advisory, non-blocking** step *inside* `changes.yml` (the old `claude.yml` workflow was deleted) — it posts a sticky PR comment plus a `::warning` and **never fails the job**, so you must read it, not just wait for green. And `dependency-check.yml` only triggers on PRs into `next`, so it will not appear on this PR at all.

   **Which absences are expected.** "Missing rather than green means go back to Step 1" applies only to checks that *should* have run. Two legitimately never appear on a release PR, and reading their absence as a failure will send you chasing nothing:

   | Check | Why it's absent |
   |---|---|
   | `build.yml` ("Build all packages for testing") | Path-filtered to `package-lock.json` and `packages/**`. A release whose only changes are `migrations/`, `migrations-pg/` and `metadata/` does not trigger it. Confirm it was green on the last commit that *did* touch `packages/**` |
   | `dependency-check.yml` | Triggers on PRs into `next` only |

   To read the advisory UUID scan when no PR comment appears (a clean scan *clears* its comment rather than posting one), check the job log — the step is `Check migration ID determinism (hard-coded UUIDs, not NEWID())`, and the following step being `Clear stale non-deterministic ID comment` is the clean outcome.

### Step 10: Merge the PR

Once all checks pass, merge the PR into `main`.

---

## Post-Merge: Automated Pipeline

Merging to `main` triggers a chain of automated workflows. Monitor each one.

> ## 🚨 Do not cancel `publish.yml`
>
> **GitHub's "Cancel workflow" button has no confirmation dialog.** One click, immediate, no undo — and `publish.yml` spends most of its runtime inside a loop publishing ~300 packages to npm. A cancel during that loop leaves the **fixed-version group split across two versions on npm**, and npm has no transaction to roll back.
>
> This happened in v5.49.0: an accidental click mid-publish left `@memberjunction/core` and `@memberjunction/global` at the new version while `@memberjunction/cli`, `@memberjunction/sqlserver-dataprovider` and the release's new package stayed behind. The version-bump commit, the git tag, and the `main` → `next` back-merge never ran.
>
> **Recovery — it is recoverable, do not panic:**
>
> ```bash
> gh run rerun <run-id> --failed     # re-runs only the failed job; test-migrations is not repeated
> ```
>
> `changeset publish` **skips versions already on npm**, so the re-run publishes only the remainder and then proceeds to bump, tag, and back-merge. Afterwards, verify explicitly rather than trusting the exit code:
>
> ```bash
> npm view @memberjunction/cli version                              # expect the new version
> git fetch origin --tags && git tag --sort=-creatordate | head -1  # expect vX.Y.Z
> git show origin/main:packages/MJCore/package.json | grep version  # expect the new version
> ```
>
> If you want to prevent this structurally, a GitHub **environment with a required reviewer** on the publish job makes the dangerous phase distinct from the harmless build phase.

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

### 10c. `docs.yml` — Build & Deploy the Documentation Site

**Triggered by:** `publish.yml` completion — **and** any push to `main` touching a docs source (`docs-site/**`, `guides/**`, `README.md`, `DEPLOYMENT.md`, `UPGRADE-v5.0.md`, `CONTRIBUTING.md`, `metadata/README.md`, `.claude/skills/**`) — **and** manual `workflow_dispatch`, when you need the site refreshed without waiting for a release.

Runs `npm ci` → `npm run build` → `npx typedoc` → installs and unit-tests [`docs-site/`](docs-site) → ingest + Astro build → copies the TypeDoc output to `dist/api` → deploys to GitHub Pages. Publishes **https://docs.memberjunction.org** (custom domain via [`docs-site/public/CNAME`](docs-site/public/CNAME), served at the domain root with `DOCS_BASE: /`; the old `memberjunction.github.io/MJ/` now redirects here). The API reference for every shipped package (`typedoc.json` `entryPoints: ["packages/**"]`, excluding CLI/CodeGen/MJAPI/MJExplorer and generated packages) is attached at **https://docs.memberjunction.org/api**.

**The site is compiled from the repo — there is no site to edit.** [`docs-site/scripts/ingest.mjs`](docs-site/scripts/ingest.mjs) turns every `guides/*.md`, every `packages/**/README.md`, and five root docs (this file among them) into pages; repo-relative links are rewritten to site links when the target is itself a page and to commit-pinned GitHub links otherwise. Nothing here is a per-release step — but it does mean **a stale README ships as stale public documentation**, and that copy-pasting prose into `docs-site/` is always the wrong fix. Correct the source file instead.

> This workflow failed silently on every release from v5.45.1 through v5.48.0 — the published docs sat weeks stale while each release otherwise looked green, because `docs.yml` is downstream of the tag and nobody checks it. **Look at its result, not just `publish.yml`'s.**

> **Both 10b and 10c chain off `publish.yml` *completion*, not success.** If `publish.yml` is cancelled or fails, these fire anyway and fail with nothing to install or build — that failure is **collateral, not a real defect**. After re-running `publish.yml` successfully, both trigger again; judge them on the *later* run.
>
> For 10c specifically, also check *which trigger* the run you are looking at came from. `docs.yml` now fires on doc pushes to `main` and on manual dispatch as well, so a green `docs.yml` in the list may be an unrelated docs deploy rather than your release's. Match it to the release run before ticking the checklist.

### Post-Merge Checklist

- [ ] `publish.yml` completes successfully (npm packages published, tag created)
- [ ] `docker.yml` completes successfully (Docker images pushed)
- [ ] `docs.yml` completes successfully (https://docs.memberjunction.org rebuilt, `/api` included)
- [ ] `main` auto-merged back into `next` (includes lock file updates)
- [ ] **`next` branch build passes** after the auto-merge — the lock file and version updates can sometimes cause issues, so always verify `build.yml` passes on `next` after a release

---

## Post-Release Updates

> ### ⚠️ Removed step — "Update MJ Documentation Site" (the download-page edit)
>
> Older releases had a step here to update a per-version download link on the ReadMe docs site. **It no longer exists.** The versioned distribution zip (`Distributions/MemberJunction_Code_Bootstrap.zip`) was retired — the `Distributions/` folder is gone — and `mj install` sparse-fetches from the tagged source on demand, so there is no per-version URL to update each release. The old **Downloads** page (URL slug `quickstart-download`) is hidden/unpublished; its content moved to **"Installation in Minutes"**, which points users at `npx @memberjunction/cli install`.
>
> **Nothing to do here per release.** The only residual concern is drift: if "Installation in Minutes" ever shows a hardcoded version link, fix it — but that's a rare one-off, not a release task, so it is no longer a numbered step.

### Step 11: Update Changelog

**Wait until ALL of the following are complete before saving:**
- [ ] npm packages published
- [ ] Docker images pushed

> Saving the changelog **publishes it and notifies your users.** There is no draft-then-notify-later. Everything must be live first.

**Where the content comes from:** the release notes were already written for you. `generate-release-notes.yml` rewrote the `next → main` PR's title and body when you opened it (Step 9), producing a structured `# <headline>` / `## New Features` / `## Improvements` / `## Bug Fixes` document. That PR body **is** the changelog entry.

```bash
gh pr view <release-pr-number> --json body --jq .body | pbcopy
```

**Then, in ReadMe:**

1. Left sidebar → **Changelog**
2. Create a **new** entry (do not edit the previous release's)
3. **Title:** `vX.Y.Z` — match the existing convention
4. **Body:** paste. ReadMe renders markdown natively, so backticks and bold survive
5. Publish

> Two things worth doing before you publish. The body opens with an H1 headline, which may duplicate the entry title — check how the previous release's entry handled it and match. And **skim the Bug Fixes section for accuracy**: the notes are generated from the diff, and this is the one release artifact that goes to users under your name.

> **There is no GitHub Release.** No workflow creates one — `ci/commit_push.mjs` pushes the `vX.Y.Z` *tag* only, and a repo-wide search for `gh release create` / `action-gh-release` finds nothing. Release information lives in three places: this ReadMe changelog entry (users), the release PR body (the source text), and per-package `CHANGELOG.md` files written by changesets (developers).

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
| `docs.yml` | After `publish.yml`, doc pushes to `main`, manual dispatch | Build & deploy docs.memberjunction.org (site + `/api`) |
| `docs-site-ci.yml` | PR touching a docs source | Fast (~2 min) "does the docs site still build" check |
| `generate-release-notes.yml` | PR to `main` | Auto-generate PR description |
| `integration.yml` | PR to `next` + push to `next` | Deterministic integration tier, run twice — once against a fresh SQL Server, once against a fresh PostgreSQL (both blocking) |

### Where release information lives

| Artifact | Location | Produced by |
|---|---|---|
| **Release notes** (the text you paste into chat / the changelog) | Body of the `next → main` PR | `generate-release-notes.yml`, on PR open |
| Per-package changelogs | `packages/*/CHANGELOG.md` | changesets, in the `RELEASING: Releasing N package(s)` commit |
| npm packages | `latest` dist-tag | `publish.yml` |
| Git tag `vX.Y.Z` | repo tags | `ci/commit_push.mjs` |
| Docker images | Docker Hub `memberjunction/api`, Azure ACR | `docker.yml` |
| API docs | https://memberjunction.github.io/MJ/ | `docs.yml` |
| Public changelog | ReadMe → Changelog | **manual, Step 11** |
| ~~GitHub Release~~ | — | **nothing creates one** |

```bash
gh pr view <release-pr> --json body --jq .body     # the release notes
git show <releasing-commit>:packages/MJCore/CHANGELOG.md | head -40
git log v5.48.0..v5.49.0 --oneline | wc -l          # raw commit count for a release
```

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

# Seed the integration metadata — REQUIRED before Step 4 (IT01-IT68 Tests, the two tier suites,
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

# MemberJunction Release & Deployment Guide

This document is the **build-engineering guide**: the deep checklist that prepares release *content* — metadata-sync migrations, the integration-suite gate, PostgreSQL parity, npm placeholders for new packages. All `@memberjunction/*` packages are versioned together (fixed group via changesets), and the monorepo builds with **pnpm** (version pinned by `packageManager` in `package.json`; the lockfile is `pnpm-lock.yaml`).

> ### Which document do you need?
>
> Since the 6.x era opened (Aug 2026), MJ ships on two channels and there are four distinct release operations. **Pressing the buttons is not this document's job:**
>
> | You are… | Read |
> |---|---|
> | Running a routine Edge release (one button), an LTS candidate cut, a line patch release, or a certification flip | [`guides/RELEASE_ENGINEERING_RUNBOOK.md`](guides/RELEASE_ENGINEERING_RUNBOOK.md) — the operator manual |
> | Looking for policy — channels, certification gates, support windows, backport rules | [`plans/lts-process.md`](plans/lts-process.md) (canon) |
> | Decoding a version string or choosing a channel | [`VERSIONING.md`](VERSIONING.md); machine-readable release state in [`release-lines.json`](release-lines.json) |
> | Preparing the release content itself — metadata sync, integration gate, PG migrations, new packages | **This document** (Steps 0–8) |
>
> **When do Steps 0–8 run?** They are content-prep, not button-prep: run them whenever their inputs have changed — pending `metadata/` changes need a Metadata_Sync migration (Step 3), new SS migrations need PG counterparts (Step 8), new packages need npm placeholders (Step 5) — *before the release that ships that content, whichever channel it ships on*. The LTS candidate cut assumes all of this is already done. **Nothing downstream re-checks this list** — CI going green says nothing about whether Steps 0–8 were run, and Step 3 in particular has no automated detection at all.

> ### 🤖 If you are an AI coding agent running this release
>
> **Build a persistent checklist of all 12 steps (0–11) before you start, and tick each one off as it completes.** A release spans hours, several CI waits, and a Docker workbench session, so steps get silently skipped — **Step 5 was nearly missed in v5.49.0** precisely because it sits between two long-running steps and has no CI equivalent to remind you.
>
> Include the sub-steps that are separately skippable: 3.8 (commit the mj-sync writeback), 4.2 (seed integration metadata), 4.2b (the `UserSetting` floor), 5 (new-package npm placeholders), 7's parity gate, and 8's content verification.
>
> Step 5 and Step 8's content checks are the ones with no automated backstop. If you skip a CI-covered step, something goes red. If you skip those, nothing does.

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

| Type | Branch flow | Versioning | How it ships |
|------|------|-----------|------------|
| **Routine Edge release** | `release/*` prep branch → `main`, then auto back-merge to `next` | `6.Y.0-edge.N` — changesets pre-mode; the stream targets the next line's tuple | Reviewed PR into `main` (runbook op. 1). Prep happens on the branch, so `next` is never frozen |
| **LTS candidate cut** | tip of `next` → branch `lts/6.Y` | `6.Y.0` — the pre-exit dance | Scripted-manual (runbook op. 2). **Never through `next → main`** — the era gate refuses it |
| **LTS line patch** | `lts/*` branch only | `6.Y.Z` — patch-only; DB-touching patches carry their §12 label | **One button**: Actions → "Publish LTS line release" (runbook op. 3) |
| **New era (major)** | — | `7.0.0-edge.0` opens the era | Era open — a genuine infrastructure-contract change, never a routine release |

> In pre-mode, `changeset version` computes the version — the old "minor if new migrations, else patch" auto-detect in `publish.yml` applies only outside pre-mode. Migrations still require a minor-or-higher tuple, which every `X.Y.0-edge.N` release satisfies by construction; on lines they ride labeled patches (process doc §12). Dist-tags: routine publishes carry `--tag edge`, line publishes `--tag lts-<line>`, and **npm `latest` moves only at certification** (`ci/dist-tag-all.mjs`). You must still ensure the changesets are correct (see Step 3).

---

## Pre-Release Checklist

> ### 🚨 Everything below happens on a release-prep branch, not on `next`
>
> Cut it from the `next` commit you intend to release, and land every Step 2–8 commit there:
>
> ```bash
> git fetch origin next
> git checkout -b release/vX.Y-prep origin/next
> git push -u origin release/vX.Y-prep     # same-named remote tracking, per the branch rules
> git rev-parse --short HEAD               # the release base — record it
> ```
>
> **That branch merges into `main` (Step 9), and `publish.yml` back-merges it to `next`.**
> It does not merge into `next` first.
>
> ```
> next ──●──────────────────────────●────────────►   keeps moving throughout
>        │ cut here                  ▲
>        └── release/vX.Y-prep ──────┼──► PR → main ──► publish.yml
>                  (Steps 2–8)       └────────── back-merge main → next
> ```
>
> **Nobody has to stop merging while you do this, and `next` is never frozen.** Prep spans
> hours. Because the branch was cut at a known commit, whatever lands on `next` afterwards
> simply rides the *next* release — the branch **is** the pin. `next` also stays free of
> release-prep churn, which is the other half of why prep lives here.
>
> **Reading the steps below:** where they say "commit/push to `next`" (Step 3.8, Step 6),
> commit to your prep branch instead. The steps use `next` as shorthand for "the branch
> that becomes the release."

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

**5. If you are releasing from a FRESH CLONE, four things are missing that nothing tells you about.** Each is gitignored, so the repo looks complete and fails later, in a place that does not name the cause.

- **The repo must be BUILT before Step 3.** `mj` is a workspace package; without `packages/MJCLI/dist` the CLI loads but registers no subcommands, so `npx mj migrate` fails with a bare `Error: command migrate not found` — which reads like a bad install, not a missing build. Run `pnpm install && pnpm run build` first. This effectively moves Step 7 to the front on a fresh clone; that is fine, and Step 7 re-runs cheaply from cache.
- **`packages/MJAPI/.env` must exist**, as a symlink to the repo-root `.env` (`ln -s ../../.env .env`). Without it MJAPI dies at boot on `dbDatabase / dbUsername / dbPassword … Required`, which reads as a config-file problem rather than a missing file. Working clones have this symlink; a fresh one does not.
- **`packages/MJExplorer/src/environments/environment.ts` must exist**, or any full build fails on `Could not resolve "../environments/environment"`. CI writes this file inline before building — copy that block out of `.github/workflows/test.yml` rather than inventing values.
- **Step 8's converter needs Python + `sqlglot`.** `mj migrate convert` shells out to a Python interpreter and fails with `the interpreter 'python3' has no sqlglot module`. On macOS, PEP 668 blocks a system `pip install`, so make a venv and point the converter at it: `python3 -m venv <dir> && <dir>/bin/pip install 'sqlglot>=27'`, then `export MJ_SQLGLOT_PYTHON=<dir>/bin/python`.

**6. Pointing `mj` at PostgreSQL takes the `DB_*` variables, not the `PG_*` ones — and `.env` beats your shell.** Step 8's verification runs `mj migrate` / `mj sync push` against a PostgreSQL database, and there are three separate traps in getting them there. Each produces an error that names something other than its cause.

- **`mj.config.cjs` reads `DB_HOST` / `DB_PORT` / `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` only.** It never consults `PG_HOST` / `PG_PORT`. (Those exist for CodeGenLib's own config layer — see [`packages/CodeGenLib/CLAUDE.md`](packages/CodeGenLib/CLAUDE.md) — which is a different resolver.) Export only the `PG_*` family and `DB_PORT` stays **1433**, so the PostgreSQL client dials SQL Server, which closes the socket on an unrecognised startup packet. You get `Database connection failed: Connection terminated unexpectedly` — which reads as a flaky database, not a wrong port.
- **`mj migrate` authenticates with the CODEGEN credentials**, because migrations need DDL rights: `CODEGEN_DB_USERNAME` / `CODEGEN_DB_PASSWORD`. Set `DB_USERNAME=postgres` but leave `CODEGEN_DB_USERNAME=sa` and PostgreSQL rejects `sa`. The CLI truncates the message to `password authentication failed for user` **without naming the user**; `docker logs <pg-container>` names it (`FATAL: password authentication failed for user "sa"`) and is the fastest way to see what actually happened.
- **Editing `.env` is the reliable channel, not exporting in the shell.** `mj migrate` loads dotenv in a way that overrides an already-exported variable, so a shell `export` is silently discarded. Do what Step 3.3 does for SQL Server — back the file up, rewrite the values, restore afterwards:

```bash
cp .env .env.release-backup            # restore this when Step 8 is done
# then in .env: DB_PLATFORM=postgresql, DB_HOST, DB_PORT, DB_DATABASE,
#               DB_USERNAME, DB_PASSWORD, CODEGEN_DB_USERNAME, CODEGEN_DB_PASSWORD
```

> Restore `.env` as soon as Step 8's PostgreSQL verification finishes. Leaving it pointed at PostgreSQL makes every later SQL-Server-side command target the wrong platform, and the Step 4 test harness has no platform branch to catch it.

### Step 1: Verify CI on `next`

Before anything else, confirm the `next` branch is healthy:

- [ ] **"Build all packages for testing"** (`build.yml`) — passes on `next`
- [ ] **"Test migrations"** (`migrations.yml`) — passes if migrations were changed
- [ ] **"Unit Tests"** (`test.yml`) — passes on any open PR, and on the **push-to-`next`** run (that unfiltered backstop is the one that actually proves integration-bundle ↔ `MJ: Tests` metadata sibling parity; a metadata-only PR never triggers `test.yml` at all)
- [ ] **"Integration Tier"** (`integration.yml`) — passes on `next`. Runs the deterministic suite against a fresh SQL Server on PRs into `next` plus an unfiltered push-to-`next` backstop. It is **not** a substitute for Step 4: CI runs no MJAPI (so client-transport bundles skip) and no live-model tier.

> **Don't idle here.** These runs take ~15 minutes. **Step 3 (fresh database + migrate + metadata push) is independent of them** — it works on a local scratch database and reads nothing from CI. Start Step 3 while Step 1 runs and check back. The only ordering that matters is that Step 3's results are committed to your prep branch before you open the release PR.
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

1. **Verify MJ CLI is up to date — against the channel of the content you're preparing.** `npm view @memberjunction/cli dist-tags` shows all channels; `latest` is the newest *certified* build, not the newest build. Prefer the repo-local CLI (`npx mj`, wired via the root `@memberjunction/cli` dependency), which rides the workspace version. If you use a global `mj`, install it from the matching tag (`npm install -g @memberjunction/cli@edge` for Edge-era content) — a stale CLI produces stale sync/codegen output
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
   > test-only records — the **IT Tests (78 records as of v6.1.0-edge.2: 63 Deterministic, 15 in
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
   V[YYYYMMDDHHMM]__v[TARGET_LINE].x__Metadata_Sync.sql
   ```
   Examples:
   ```
   V202608041200__v6.1.x__Metadata_Sync.sql
   V202603021058__v5.5.x__Metadata_Sync.sql
   ```
   - Timestamp format: `YYYYMMDDHHMM` (year, month, day, hour, minute)
   - Version: use the **tuple the Edge stream is building toward** — while `next` streams
     `6.1.0-edge.N`, name it `v6.1.x` (matches the existing files in `migrations/v6/`). In the
     classic 5.x era this was "the next minor version"
   - Folder: the highest-numbered `migrations/v*/` era folder (currently `migrations/v6/`)
   - Timestamp must be **strictly greater** than all existing migration timestamps (enforced by CI)
   - **Generate it in UTC — `date -u +%Y%m%d%H%M`.** Migrations are stamped in UTC, and west-of-UTC
     machines produce a *smaller* number than a migration that merged hours earlier the same day, so
     the file sorts before content it must follow and CI rejects it. Seen on this repo: local time
     gave `202608260334` against an existing `V202608260700`. The `MetadataSync_Push_*.sql` file you
     are copying names itself in UTC — reuse that stamp and the two can never disagree:
     ```bash
     ls -t metadata/sql_logging/MetadataSync_Push_*.sql | head -1   # ...Push_2026-08-26T08-33-55-855Z.sql
     TS=$(date -u +%Y%m%d%H%M)                                      # 202608260834
     ls migrations/v6/ | grep -oE '^V[0-9]{12}' | sort | tail -1     # must be < V$TS
     ```
   - **Verify no test-only records leaked in.** No CI check catches this — `changes.yml` validates
     naming, schema placeholders and timestamps only. Grep the newly copied file by name and
     confirm zero hits:
     ```bash
     grep -c '@integration\.test\|Integration Test: RLS Scoped Reader\|IT: Probe Skill' \
       migrations/v6/V<new-timestamp>__v6.X.x__Metadata_Sync.sql   # must print 0
     ```

8. **Commit the migration script to `next`** — push this new migration file to the `next` branch so it ships with the release. **Also commit the mj-sync writeback**: the push back-fills `primaryKey`/`sync` blocks into the new records' metadata JSON files (`metadata/**/.*.json`) — those belong in the same commit so future pushes recognize the records as existing.
9. **Ensure a minor changeset exists** — if changesets only have `patch` bumps, you must add a changeset with `minor` on at least one `@memberjunction/*` package to indicate this is a minor release:
   ```bash
   pnpm run change
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
| `Integration Tests — Deterministic` | 63 | **Required — must be N/N.** Deterministic: any shortfall blocks the release |
| `Integration Tests — Live Model` | 15 | **Required to run and be triaged — but *not* required to be 15/15.** Real LLM calls; see 4.4 |

> ⚠️ **Read the member count out of the database, not out of this table.** The suites grow, and a stale
> number here is worse than no number: it makes a healthy 63/63 look like an eleven-test shortfall and
> sends you hunting for tests that were never missing. The counts above were 52 for most of the 6.1
> cycle and are 63 as of v6.1.0-edge.2. Derive them after seeding (4.2):
>
> ```sql
> SELECT ts.Name, COUNT(tst.ID) FROM __mj.TestSuite ts
> LEFT JOIN __mj.TestSuiteTest tst ON tst.SuiteID = ts.ID
> WHERE ts.Name LIKE 'Integration Tests%' GROUP BY ts.Name;
> ```
>
> The gate is "every member passed", not "a particular number passed".

> **The two tiers have different pass criteria, and conflating them will either block a good release or wave through a bad one.** The deterministic tier is exactly that — every member or stop. The live tier drives real models, and `agents-suite.md` documents run-to-run variance as a known characteristic "surfaced honestly rather than hidden": checks that need the model to take a specific action use a two-phase bounded retry (≤3 attempts) and then fail **loudly** with `model-noncompliance:`. So a live shortfall is not automatically a blocker — every failing live test must be **triaged individually** (see 4.6): `model-noncompliance:` is variance and may be accepted; anything else is a real defect and blocks.

> ⚠️ Do **not** run `mj test suite "Integration Tests"`. That is the empty parent container (zero members); it exits **1** with `No tests found in suite: <id>`. A hyphen typed instead of the em dash also exits 1, with `Test suite not found: <arg>`.

> 🐘 **Run this step against SQL Server — that is the supported path, and it is all this step requires.** Do not try to point Step 4 at a PostgreSQL database: the testing CLI builds an `mssql` pool (`packages/TestingFramework/CLI/src/lib/mj-provider.ts` → `setupSQLServerClient`, no platform branch), so `DB_PLATFORM=postgresql` is never consulted and the run would fail on connection before testing anything. **This is a limitation of the test harness only — it does not affect the release.** PostgreSQL still ships fully: its migrations are converted, verified, and committed in Step 8. See "What PG parity does and does NOT cover today" there.

#### 4.1 Prerequisites (all required — miss one and the suite reports **green without testing**)

1. **Step 3 is done** — `mj migrate` + `mj sync push --dir ./metadata` applied to the scratch database, and your `.env` points at it.

   > 🚨 **Confirm which database this tier is about to mutate, on every run** — the CLI prints `config.dbDatabase: <name>` at startup. Either repoint `.env` (Step 3.3) or set `DB_DATABASE=… npx mj test …` inline; **both work, and the inline form wins.** Until v6.1 it did not: the testing CLI loaded dotenv with `override: true`, so `.env` clobbered the shell variable and the suite ran against whatever `.env` said, while `mj sync push` (whose init hook does not override) honoured the shell variable — so the shortcut appeared to work while seeding and then silently targeted a different database for the run. That asymmetry is fixed; `mj test` now matches `migrate`, `codegen` and `sync push` in letting an explicitly-set variable win. If you are on an older build, check `packages/TestingFramework/CLI/src/utils/config-loader.ts` for `override: true` before relying on the inline form.
2. **The repo is built — and the suite package's `dist/` is *current*.** `pnpm run build`. The suite loads compiled `dist/`, including the private, never-published `@memberjunction/integration-test-suite` package. A `dist/` that merely **exists is not enough**: if it predates the newest `src/checks/*.checks.ts`, every bundle added since compiles to nothing and the run fails with a wall of `Unknown integration check bundle '<name>'` — naming the *newest* bundles while older ones pass. Verify freshness rather than assuming:
   ```bash
   ls -t packages/TestingFramework/integration-test-suite/dist/index.js \
         packages/TestingFramework/integration-test-suite/src/checks/*.checks.ts | head -1
   # Must print the dist file. If a .checks.ts is newest, rebuild THROUGH TURBO:
   npx turbo run build --filter=@memberjunction/integration-test-suite
   ```
   > Rebuild it with turbo, **not** `cd <pkg> && pnpm run build`. The check bundles depend on fixtures and context properties exported by `@memberjunction/testing-integration`; if that sibling is also stale, the direct build dies with dozens of `has no exported member 'AgentLiveFixture'` / `Property 'XFixture' does not exist on type 'IntegrationCheckContext'` errors. Turbo's `dependsOn: ["^build"]` builds the dependency first. A full `pnpm run build` (Step 7) covers this too.
3. **`mj.config.cjs` still carries `testing.checkModules`** (`['@memberjunction/integration-test-suite']`) — that key is how check bundles are discovered.
4. **The integration metadata is seeded** — see 4.2. This is **not** optional any more.
5. **MJAPI is running** against the Step-3 database, with `MJ_API_KEY` set — see 4.3.
6. **Use the repo-local CLI**, from the repo root (`pnpm run test:integration` / `npx mj …`). A globally-installed `mj` cannot load the private suite package.

#### 4.2 Seed the integration metadata (REQUIRED)

`mj test` dispatches from `MJ: Tests` / `MJ: Test Suites` rows that exist **only** in `metadata-optional/integration-test/`. Nothing in `metadata/` and no migration seeds them, so without this push Step 4 exits 1 on suite lookup before a single check runs.

```bash
# AFTER Step 3's `mj migrate` + `mj sync push --dir ./metadata` — order matters, the IT
# records @lookup the "Integration Test" TestType and AI models from the base metadata.
npx mj sync push --dir ./metadata-optional/integration-test --ci
```

This seeds **269 records** (242 earlier in the 6.1 cycle — the suite grows, so trust `Errors 0` over the number): the **78 IT Test records**, the 3 suite rows and their 63 + 15 memberships, the RLS principals (3 synthetic `it-*@integration.test` users + the `Integration Test: RLS Scoped Reader` role + 2 entity-permission grants), and the synthetic AI stack the live tier drives (14 `IT: *` AI Agents — 12 root-level — 14 IT AI Prompts with 42 multi-vendor model bindings + templates, `IT: Probe Skill`, `IT: Integration Test Scope`, and the IT categories). Expect `Errors 0` in the push summary; the created count tracks whatever the suite currently holds.

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

With those rows present all 7 cache-gauntlet checks pass and the tier reaches its full count.

#### 4.3 Start MJAPI (REQUIRED — 19 deterministic tests need it)

19 of the deterministic members are **client-transport** and exercise the real GraphQL wire (IT03, IT15, IT23, IT25–IT28, IT31–IT34, IT37, IT40, IT43–IT45, IT47, IT50, IT52). Start MJAPI against the Step-3 database before running:

```bash
# In a separate shell, pointed at the Step-3 database
cd packages/MJAPI && MJ_DISABLE_TASK_GRAPH_DISPATCHER=1 pnpm start
```

> 🚨 **`MJ_DISABLE_TASK_GRAPH_DISPATCHER=1` is REQUIRED for the deterministic tier, and omitting it produces failures that look exactly like engine defects.** MJServer starts its own `TaskGraphDispatcher` at boot, and a dispatcher claims from the **whole** task table rather than from "its own" graphs. `IT74 - Task Graph Execution` drives its own dispatcher against a stub runner and asserts exactly-once execution, so the server races it for every claim and executes the bundle's tasks with the *real* agent runner. The stub never sees them.
>
> The symptoms are alarming and never mention MJAPI: `every node ran exactly once — expected 4, got 2`, `a graph with an unrecoverable failure rolls up Failed — expected "Failed", got "Complete"`, `no GraphSettled frame was emitted`, `the reclaimed task ran exactly once — expected 1, got 2`. They **reshuffle every run**, because which dispatcher wins each claim is a race — which reads as engine flakiness rather than as interference. Measured on one box: **0/4 runs green with the server dispatcher up, 4/4 with it down.**
>
> Stopping MJAPI is *not* the remedy — the 19 client-transport members need it, and without it they skip-as-PASS. Run the server with its dispatcher suppressed instead.
>
> **Leave the flag OFF for the live-model tier (4.4 #2)**, which drives shipped agents that rely on durable execution.

> ⚠️ **Run it from `packages/MJAPI`, not `pnpm run start:api` from the repo root.** The root script is `turbo start --filter=mj_api`, and **turbo passes through only the environment variables declared in `turbo.json`** — anything else is stripped before the task sees it. Overriding the database with `DB_DATABASE=… pnpm run start:api` therefore fails with `Error parsing config file … "path": ["dbDatabase"] … "received": "undefined"`, which reads like a config-file problem rather than an env-passthrough one. Running from the package directory bypasses turbo entirely and the variables arrive intact.

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

The two failure modes are **asymmetric, and neither shows up in the exit code**:

| Condition | Result |
|---|---|
| MJAPI not reachable | 19 tests **skip-as-PASS** (`SKIPPED (environment gap)`) — a green full-count summary that really ran 19 fewer |
| `MJ_API_KEY` unset or rejected | 19 tests return status `Error` — which **also** exits 0 |

#### 4.4 Run the two suites

```bash
# 1) Deterministic + mutation axis — from the repo root
RUN_MUTATION_TESTS=1 pnpm run test:integration 2>&1 | tee release-deterministic.log
```

`pnpm run test:integration` expands to `MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"`.

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
- **MJAPI refuses to boot with `Schema must contain uniquely named types but contains multiple types named "<X>"`** — a **stale `dist/` orphan**, not a code defect: a resolver whose source was deleted or renamed still has compiled output, and TypeGraphQL loads every resolver in `dist/`, registering the type twice. `tsc` never deletes outputs for removed sources, so another incremental `pnpm run build` will **not** clear it. Find and remove the orphans, then restart:
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

**This must be done before the release that ships this content (Step 9).** A full local build validates compilation across all packages and regenerates bootstrap manifest files that may have drifted across merged PRs.

```bash
# 1. Pull the latest next branch
git checkout next
git pull origin next

# 2. Clean install dependencies
pnpm install

# 3. Full repo build
pnpm run build

# 4. Integration sibling-parity gate (check bundle <-> MJ: Tests metadata drift).
#    --force is required: turbo's `test` inputs are src/**, vitest.config.*, tsconfig* —
#    NOT metadata-optional/** or mj.config.cjs — so a warm cache replays a stale PASS
#    for exactly the metadata-side drift this gate exists to catch.
npx turbo run test --force --filter=@memberjunction/integration-test-suite
```

**Expected behavior:**
- The `pnpm run build` step runs `turbo build` across all `@memberjunction/*` packages
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
> The same reasoning is why a *cosmetic* diff should be left alone: committing it adds release-PR noise for a file CI is about to rewrite anyway. `pnpm-lock.yaml` changes from `pnpm install` fall in the same bucket — `publish.yml` refreshes the lockfile (`pnpm install --lockfile-only`) during the `main` → `next` back-merge.

---

## PostgreSQL Migration Conversion

### Step 8: Convert New Migrations to PostgreSQL (`/pg-migrate-v2`)

**This must be done for every release that adds new migrations** (including the metadata-sync migration from Step 3).

MemberJunction ships migrations for **both** SQL Server and PostgreSQL. SS migrations in `migrations/v5/` are authored first; each needs a validated PostgreSQL counterpart (`.pg.sql`) in `migrations-pg/v5/`. Producing those counterparts is now a standard part of the release process, run via the **`/pg-migrate-v2`** skill (the "split-and-regenerate" pipeline) or its successor runbook **`/pg-migrate-experimental`**, which carries the latest field-tested gotchas (converter dedup mutating committed files, workbench memory limits, scheduled-job OOM, `provisioningGuard`, correct `mj_api`/`mj_explorer` workspace names — see the Gotchas section in `.claude/commands/pg-migrate-experimental.md`). Whichever variant runs, the non-negotiables are the same: **the real gate is a clean `mj migrate` on a fresh PG database**, committed `.pg.sql` files are immutable, and no `.needs-hand` files may remain.

> ⚠️ **Do this after the full build (Step 7) and before the release ships (Step 9).** Every new SS migration must have a committed, verified `.pg.sql` counterpart on `next` before the release that carries it — otherwise PostgreSQL deployments of the release are missing migrations. This applies to **every channel**: an Edge release that ships an SS migration without its counterpart leaves PG deployments gapped just as surely as an LTS one.

**What the skill does** (see `.claude/commands/pg-migrate-v2.md` for the full runbook):

1. Runs entirely inside the `claude-dev` Docker workbench (with SQL Server + PostgreSQL containers), on a dedicated `pg-migrate-v2/<branch>` branch — the host repo stays read-only until the final copy-back.
2. `mj migrate convert --split` classifies each new SS migration and transpiles only the ~2% hand-written DDL via the sqlglot AST dialect; CodeGen objects (views/sprocs/triggers/grants) are **baked inline** into each new migration. Only migrations lacking a `.pg.sql`/`.pg-only.sql` counterpart are converted — committed counterparts are immutable and never reconverted.
3. Any procedural residue the dialect can't auto-translate lands as `.needs-hand` files; these are hand-authored (lifting from the committed ledger where the routine already exists) and renamed to `.pg.sql`.
4. **The real gate:** the converted set is applied to a **fresh** PG database via `mj migrate` → `mj sync push` (no `mj codegen`). A clean apply — not the converter's "0 gaps" summary — is what proves the SQL is correct.
5. Four verification layers run: conversion parity, SS↔PG schema parity, view semantic equivalence, and a CRUD behavioral oracle — followed by full-stack browser smoke + deep CRUD workflow tests (magic-link login, no external IdP).
6. The verified `.pg.sql` files are copied back to the host as **uncommitted** changes for review, along with a `migrations-pg/PG_MIGRATION_REPORT.md`.

**After the skill finishes:** review the converted `.pg.sql` files and the report, then **commit them to `next`** so they ship with the release. Confirm no `.needs-hand` files were copied back (that would mean conversion is incomplete).

#### 🚨 Eight converter behaviours that produce a *plausible* wrong answer

The first four were hit producing v6.1.0-edge.2's counterparts; 5 and 6 producing v6.1.0-edge.3's; 7 and 8 producing v6.1.0-edge.4's. Each yields output that looks finished, and three of them pass the clean-apply gate.

1. **`--bake-codegen` HALTS at a conversion gap, before baking.** It writes a `.needs-hand` file with **no** baked views or functions and stops. So any migration with a gap ships **DDL-only**, and nothing regenerates the CodeGen objects its schema change requires. This is not cosmetic: the DDL lands, base views keep their old column list, metadata and views then disagree, and the failure surfaces far away — `mj sync push` dies on the first entity it touches (`column "<NewColumn>" does not exist`) and the next CodeGen run dies with it. If gapped migrations remain after Phase 2, generate the objects separately with `mj codegen` and ship them as one `.pg-only.sql` stamped **before** the Metadata_Sync migration, which calls routine signatures those objects create.
2. **The split converter emits `Metadata_Sync` as a two-line marker.** It classifies it "regen/reseed only — no DDL to translate" and writes a comment. That is the v5.45 defect (#3253) reproducing itself, and the size check below is what catches it. **`*_Metadata_Sync.sql` goes through the LEGACY converter** — `mj migrate convert --file <name> --source-dir migrations/vN --output-dir migrations-pg/vN`, no `--split`. Compare against the previous release's counterpart: these run to thousands of lines, not two. Note the converter **skips a file that already exists**, so remove the stub before re-converting.
3. **SQL Server `BIT` literals are carried across as `0`/`1`.** PostgreSQL rejects them — `column "AllowsNull" is of type boolean but expression is of type integer`. The baked path emits `TRUE`/`FALSE` correctly; the non-baked path does not, and a gapped migration never reaches the baked path. Both `INSERT … VALUES` positions and `WHERE`/`SET` comparisons are affected. Drive the fix off the live catalogue (`information_schema.columns WHERE data_type='boolean'`) rather than guessing column names.
4. **A drop-guard is dropped while its paired `ADD` survives.** `IF EXISTS (SELECT 1 FROM sys.check_constraints …) DROP CONSTRAINT` vanishes and the bare `ADD CONSTRAINT` remains. **This passes the fresh-database gate** — there is nothing to drop on a fresh database — and fails on every migrate-through deployment, which is the case the gate cannot see. PostgreSQL expresses the guard natively: `ALTER TABLE … DROP CONSTRAINT IF EXISTS …` before the ADD. Grep each new SS migration for `sys.check_constraints` and `sys.extended_properties` and confirm the counterpart accounts for every hit.

5. **A CRUD sproc call is emitted in the wrong argument shape, and only at a boundary.** MJ emits CRUD sprocs two ways: typed arguments plus a `<Col>_Clear` companion per nullable column, or — once an entity's *projected* parameter count reaches 90 (`POSTGRESQL_PROCEDURE_PARAM_LIMIT`, because PostgreSQL caps a function at 100 arguments) — a single `p_data JSONB`. CodeGen decides from the entity's projection and **drops every typed-arg overload** when it switches. The converter historically decided from the arguments of the *call* it was converting, which is a different quantity: a T-SQL `EXEC` may omit parameters that carry defaults, and no call has to pass the `_Clear` companions CodeGen counts. On v6.1.0-edge.3 adding `Entity.Configuration` put `MJ: Entities` exactly in the gap — CodeGen projected 90 and emitted JSONB-only, `__mj.spUpdateEntity` has 93 parameters, and the one `EXEC` in the sync passed 89 — so the sync migration called a signature that no longer existed and `mj migrate` died 12,000 lines from the cause. Fixed in `ExecBlockRule` by resolving the shape from `pg_proc` at apply time instead of guessing (v6.1.0-edge.3). **If you see `function __mj.spXxx(...) does not exist` on a sync migration, check the shape before you touch anything else** — and note that no threshold constant fixes this class, because the converter has no procedure definition in a sync file and `ConversionContext` carries neither arities nor nullability.
6. **`mj codegen` against PostgreSQL is DESTRUCTIVE while an app-owned base view is stale.** `spDeleteUnneededEntityFields` treats a metadata field with no matching base-view column as unneeded and deletes the `EntityField` row; the CRUD routines then regenerate without it. Because PostgreSQL freezes a view's column list at `CREATE` and has no `sp_refreshview`, any app-owned view is stale the moment a release adds a column to its table — so the CodeGen run you make to *produce* the regen objects can silently narrow the metadata first. Observed on edge.3: a run against a stale `vwEntities` deleted six `EntityField` rows and regenerated `spUpdateEntity` with 84 parameters where the committed ledger already had 89. **Repair the app-owned views BEFORE running CodeGen**, and diff `EntityField` counts across the run. Two further ordering facts: CodeGen needs **two passes** when a migration both adds a column and seeds its metadata (the first pass generates routines before its own field-sync has created the row — this is why the T-SQL migrations' own headers describe a first and second `mj codegen`), and on a database that has received the layered-base-view metadata, `mj codegen` **throws outright** (`layered base views are not supported on PostgreSQL`) — issue #3477, which blocks the generation step even though it never affects the release lane, since that lane runs `mj migrate` + `mj sync push` and no CodeGen.

7. **A counterpart can GROW in line count while converting to nothing.** The size-diff below is a
   useful smell test, not a gate, and it has a blind spot: the converter's standard header plus the
   explanatory comments it copies over can outweigh the statements it dropped. On v6.1.0-edge.4,
   `Fix_FileEntityRecordLink_Unique_Key` transpiled to **zero executable statements** while going
   from 111 source lines to 155 — so the counterpart looked *larger* than its source while doing
   nothing at all. Both of its steps sat inside `IF EXISTS (...) BEGIN ... END` guards and the
   converter dropped the guards and the DDL inside them together (defect 4's shape, but with the
   `ADD` inside a guard too, so nothing survived to notice). The fix that was silently discarded was
   real and live on PostgreSQL: a fresh database genuinely held
   `UQ_FileEntityRecordLink_EntityID_FileID UNIQUE ("EntityID","FileID")`, so a file could attach to
   only one record per entity (#3943). **Trust
   [`scripts/check-pg-migration-content.mjs`](scripts/check-pg-migration-content.mjs), which counts
   statements, over any line-count comparison** — it caught this on 7-vs-0 while the size heuristic
   waved it through. Run it before the clean-apply gate, not after: a counterpart that converts to
   nothing applies perfectly.

8. **Not every empty counterpart is a defect — but it has to be DECLARED.** Some SQL Server
   migrations have no PostgreSQL meaning at all, and the honest counterpart is an empty one carrying
   `-- PG-EMPTY-BY-DESIGN: <why, and what carries the change instead>`, which the content gate then
   classifies as a documented no-op rather than a silent emptying. Two from v6.1.0-edge.4, both
   sharing one test — *is the SQL Server mechanism even expressible on PostgreSQL, and if the change
   still matters there, what delivers it?*
   - `spRecompileAllViews_Dependency_Order` — built on `sp_refreshview` and
     `sys.sql_expression_dependencies`, neither of which exists on PostgreSQL. `migrations-pg/v5/R__RefreshMetadata.pg-only.sql`
     already lists the procedure among those it deliberately does not call, so nothing invokes it.
   - `Heal_SPs_IncludedSchemaNames` — the five metadata-support procedures it heals are **CodeGen
     output** on PostgreSQL (`providers/postgresql/metadataSupportObjects.ts`), not migration
     content, and the same PR that added the migration added the new parameter to that generator.
     Transpiling would have overwritten five generated PL/pgSQL routines with T-SQL-shaped ones; the
     converter's own attempt produced a file that would not parse.

   The distinction that matters: defect 7 is a fix that PostgreSQL *needs* and did not get, while
   these are changes PostgreSQL gets **by another route**. Establish which one you are looking at
   before writing either a hand-port or a `PG-EMPTY-BY-DESIGN` marker — checking whether the object
   is CodeGen-owned on PostgreSQL settles it quickly.

#### App-owned base views do not update themselves on PostgreSQL

An entity with `BaseViewGenerated = 0` owns its base view, and CodeGen never rewrites it. On SQL Server a migration keeps it current with `sp_refreshview`. **PostgreSQL has no equivalent** — it expands and freezes the column list at `CREATE` (see [`packages/CodeGenLib/CLAUDE.md`](packages/CodeGenLib/CLAUDE.md)) — so a column added to such an entity never reaches its view.

The consequence is not one missing column: `spDeleteUnneededEntityFields` treats a metadata field with no matching view column as unneeded and **deletes the `EntityField` row**, after which the CRUD routines regenerate without it and `Metadata_Sync` fails on a signature that no longer exists. When a release adds a column to one of these entities, the counterpart must `DROP` and `CREATE` the view. Find them first:

```sql
SELECT "Name" FROM __mj."Entity" WHERE "BaseViewGenerated" = FALSE AND COALESCE("VirtualEntity", FALSE) = FALSE;
```

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

## Shipping the Release

### Step 9: Ship it — merge the prep branch into `main`

**The release is a PR from your `release/*` prep branch into `main`.** Steps 0–8 produced content that must be reviewed — a metadata-sync migration is permanent, append-only history — and the PR is the review instrument. There is no button and no unreviewed path to `main`.

```bash
git push origin release/v6.0-edge-prep
# then open a PR:  release/v6.0-edge-prep → main
```

**This is also what pins the release.** The prep branch was cut from a chosen `next` commit, so the release contains exactly that commit plus your prep — and whatever lands on `next` while you work simply rides the *next* release. **`next` is never frozen**, and no one has to stop merging while you prepare.

> **Why not a `next → main` PR?** It merges whatever `next` holds *at merge time*, so anything merged during the hours of Steps 0–8 ships unvalidated. That's the same drift, just less visible. Branch first; the branch is the pin.

**Candidate cuts and line releases never go this way.** `publish.yml` hard-fails an unsuffixed version on this path — that's the era gate working, not a bug. Candidate cuts follow runbook op. 2 (the pre-exit dance); line releases ship via the **"Publish LTS line release"** button (runbook op. 3) from the `lts/*` branch.

On the release PR:

1. The **"Generate Release Notes"** workflow (`generate-release-notes.yml`) auto-populates the PR title and description with structured release notes. It fires for `next` **and `release/*`** heads — the gate exists so an ordinary PR into `main` can't have its title destructively overwritten, not to restrict which branch releases from.
2. Wait for the generated PR message to appear
3. Wait for **all CI checks** to pass — and confirm they ran against the **current head SHA**:

   > 🚨 **A push to an open release PR does not reliably re-fire its checks.** On v6.1.0-edge.4, merging `next` into the prep branch and pushing left the PR showing its earlier green run for ten minutes and counting, against the *pre-merge* content, while `gh pr checks` reported "no checks reported" and `mergeStateStatus` sat at `CLEAN`. A release PR whose only gate is `changes.yml` is exactly where a stale green is dangerous: it certifies content that is no longer what would merge. Check the SHA rather than the colour, and force a re-run by closing and reopening the PR if the head has no runs:
   >
   > ```bash
   > gh pr view <n> --json headRefOid --jq .headRefOid          # what would merge
   > gh run list --branch <branch> --limit 5 \
   >   --json name,conclusion,headSha \
   >   --template '{{range .}}{{.name}} {{.conclusion}} {{slice .headSha 0 10}}{{"\n"}}{{end}}'
   > gh pr close <n> && gh pr reopen <n>                        # re-fires pull_request workflows
   > ```

   - `changes.yml` — validates migration filenames, version patterns, schema placeholder usage. **This is the only workflow that triggers on the release PR itself** (it's the one workflow listening on PRs into `main`).

     > **Because it listens on PRs into `main` only, it has never seen any migration that merged to `next`** — and it diffs the release PR against `main`, so it inspects *every* migration in the release at once, not just the ones prep added. A migration authored weeks ago can therefore fail here for the first time. v6.1.0-edge.2 hit exactly this: `Retire_Workflows_Application` had hard-coded `[__mj]` in all eight statements since it merged to `next`. **Do not assume a failure here is yours.** A file not yet on `main` has not shipped, so its Flyway checksum is not load-bearing and correcting it in the release branch is safe; a file already on `main` is immutable and needs a forward fix instead.
   - Everything else you see on the PR is **surfaced from the run on the same head SHA** — `test.yml` (unit tests), `integration.yml` ("Integration Tier", deterministic suite), `build.yml`, and `migrations.yml` / `pg-migrations.yml` when migrations changed. If any of those are missing rather than green, that commit never got a clean run — go back to Step 1.

   > Two traps in this list: the hardcoded-UUID scan for migrations is now an **advisory, non-blocking** step *inside* `changes.yml` (the old `claude.yml` workflow was deleted) — it posts a sticky PR comment plus a `::warning` and **never fails the job**, so you must read it, not just wait for green. And `dependency-check.yml` only triggers on PRs into `next`, so it will not appear on this PR at all.

   **Which absences are expected.** "Missing rather than green means go back to Step 1" applies only to checks that *should* have run. Two legitimately never appear on a release PR, and reading their absence as a failure will send you chasing nothing:

   | Check | Why it's absent |
   |---|---|
   | `build.yml` ("Build all packages for testing") | Path-filtered to `packages/**` (its filter also still lists the retired `package-lock.json` — dead since the pnpm cutover). A release whose only changes are `migrations/`, `migrations-pg/` and `metadata/` does not trigger it. Confirm it was green on the last commit that *did* touch `packages/**` |
   | `dependency-check.yml` | Triggers on PRs into `next` only |

   > 🚨 **If the release carries CODE changes, none of those checks ran on them — and this table's advice will tell you they were legitimately absent.** `test.yml`, `integration.yml` and `pg-migrations.yml` all trigger on **`next` only** (PRs into `next`, pushes to `next`); `build.yml` on pushes to `next` under a `packages/**` filter. A `release/*` branch is none of those, so a commit that exists only on the prep branch gets **no CI at all**.
   >
   > The step's model is that prep produces migrations and metadata, where that is harmless. It stops being harmless the moment a fix lands on the prep branch — v6.1.0-edge.2 carried TypeScript changes to four packages, and not one of them was CI-validated before merging to `main`.
   >
   > **When the prep branch touches `packages/**`, run the gates locally against that exact tree and record the results on the PR:**
   >
   > ```bash
   > npx turbo run test:types            # test.yml's spec type-check gate
   > npm test -- --concurrency=4         # test.yml's unit suite
   > RUN_MUTATION_TESTS=1 pnpm run test:integration   # supersets integration.yml (see below)
   > pnpm run build                      # build.yml
   > ```
   >
   > The local integration run is a **superset** of CI's: `integration.yml` omits `RUN_MUTATION_TESTS=1`, so every mutation-gated bundle is silently excluded there and has *never* run in CI. `IT74 - Task Graph Execution` is entirely mutation-gated — without the flag it reports `all 7 check(s) were gated out … verified NOTHING` and exits **0**.
   >
   > Everything does run on `next` after the back-merge, so a red check there is the release's problem arriving late rather than someone else's.

   To read the advisory UUID scan when no PR comment appears (a clean scan *clears* its comment rather than posting one), check the job log — the step is `Check migration ID determinism (hard-coded UUIDs, not NEWID())`, and the following step being `Clear stale non-deterministic ID comment` is the clean outcome.

### Step 10: Merge

Once all checks pass, merge the PR into `main`. The push to `main` triggers `publish.yml` (Step 10a), which does everything else.

---

## Post-Merge: Automated Pipeline

The push to `main` — from the merged release PR — triggers a chain of automated workflows. Monitor each one.

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
> npm view @memberjunction/cli dist-tags                            # expect edge (or lts-*) at the new version — latest UNMOVED
> git fetch origin --tags && git tag --sort=-creatordate | head -1  # expect vX.Y.Z[-edge.N]
> git show origin/main:packages/MJCore/package.json | grep version  # expect the new version
> ```
>
> If you want to prevent this structurally, a GitHub **environment with a required reviewer** on the publish job makes the dangerous phase distinct from the harmless build phase.

### 10a. `publish.yml` — Build & Publish Packages

**Triggered by:** push to `main` (the merged release PR)

This workflow:
1. Runs migration tests against a fresh SQL Server container
2. Validates all `@memberjunction/*` packages exist on npm (see Step 5) and carry `repository.url` for provenance
3. Detects changesets pre-mode and versions accordingly — pre-mode yields the next `X.Y.0-edge.N`; the old migrations-mean-minor auto-detect applies only outside pre-mode
4. **Guards the version grammar** — an unsuffixed version on this path is a hard error directing you to the LTS path in `publish.yml` (candidates and line builds never ship through `next → main`)
5. Builds all packages (`pnpm run build`)
6. Publishes to npm via OIDC with the dist-tag derived from the grammar (`-edge.N` → `--tag edge`); **`latest` never moves here**
7. Pushes the release commit and the `vX.Y.Z[-edge.N]` tag
8. Creates the **GitHub Release** with auto-generated notes — never marked latest; edge builds are flagged prerelease. Certification later promotes the certified build (`gh release edit … --latest`)
9. **Auto-merges `main` back into `next`** and refreshes `pnpm-lock.yaml`

> **The back-merge refuses to guess, and that means it can fail loudly.** It resolves a `pnpm-lock.yaml` conflict by *regenerating* the file from the merged manifests, and **aborts on a conflict in any other file** rather than picking a side — leaving `next` untouched on the remote for a human to resolve.
>
> It previously merged with `-X theirs`, silently resolving every conflicting hunk in `main`'s favour. That was invisible while `next` was frozen for the release (main's source and next's were identical, so the strategy never fired), but with a pinned `ref` letting `next` legitimately run ahead of what shipped, it would silently discard whatever landed after the pin.
>
> **If it aborts, the release itself is fine** — packages are on npm and the tag is pushed; only the back-merge is outstanding. Resolve it by hand:
> ```bash
> git checkout next && git merge origin/main   # resolve conflicts, then:
> pnpm install --lockfile-only && git add pnpm-lock.yaml && git commit
> # `next` is a protected branch: direct pushes are refused with
> #   GH013: Changes must be made through a pull request.
> #   Required status check "Check migrations" is expected.
> # so land the merge commit through a PR rather than pushing it:
> git checkout -b chore/back-merge-v<version> && git push -u origin chore/back-merge-v<version>
> gh pr create --base next --title "chore: back-merge main into next after v<version>"
> ```
> **Expect the conflict to be a real one, and do not resolve it by rote.** `next` legitimately runs ahead of what shipped, so a file both sides touched has two *intentional* versions. In v6.1.0-edge.2 the conflict was in `TaskGraphDispatcher.ts`, where `next` and the release had independently fixed the same bug — `next`'s was the better implementation, so the release's was discarded and its now-orphaned field removed. Taking either side wholesale, or `-X ours`/`-X theirs`, would have shipped dead code or lost the better fix. Build and test the package after resolving.
> A failed lockfile regeneration is tolerated when the merge was clean (an already-published release must not be failed by a registry hiccup) but is **fatal** when it was needed to resolve a conflict, since the committed lockfile is then a placeholder no side vouches for. Nothing is pushed in that case.

### 10b. `docker.yml` — Build & Publish Docker Images

**Triggered by:** `publish.yml` completion, or manual dispatch

Builds and pushes multi-platform Docker images (`linux/amd64`, `linux/arm64`):
- Docker Hub: `memberjunction/api:latest` and `memberjunction/api:v{VERSION}`
- Azure ACR: `askskip.azurecr.io` with same tags

> 🐳 **Docker `:latest` means the same thing npm's `latest` means — newest certified.** The workflow's `channel` job reads the version and **skips any prerelease**, so an Edge release publishes npm packages but produces **no Docker image**. Expect `docker.yml` to report a skipped `api` job on every Edge release; that is the guard working, not a failure.
>
> **What this means in practice during the Edge era:** nothing auto-publishes to Docker. Certified and line builds ship from `lts/*` through `publish.yml`'s LTS path, which does not trigger this workflow — so a certified image is produced by **dispatching `docker.yml` manually against the certified tag**. The guard keys off version grammar, not the trigger, so a manual dispatch accidentally aimed at `next` is skipped too.
>
> **Open:** whether an `:edge` Docker tag is wanted at all, and wiring line publishes to Docker automatically (process doc §15 item 4). Until someone confirms a real need for Edge images, Edge simply doesn't get them.

> **Known issue:** When it does build, this workflow sometimes fails because it tries to install the newly published npm packages before they've fully propagated on the npm registry. If it fails, **re-run the failed job** — it usually succeeds on the second attempt.

### 10c. `docs.yml` — Build & Deploy the Documentation Site

**Triggered by:** `publish.yml` completion — **and** any push to `main` touching a docs source (`docs-site/**`, `guides/**`, `README.md`, `DEPLOYMENT.md`, `UPGRADE-v5.0.md`, `CONTRIBUTING.md`, `metadata/README.md`, `.claude/skills/**`) — **and** manual `workflow_dispatch`, when you need the site refreshed without waiting for a release.

Installs the workspace (`pnpm install --frozen-lockfile` — the workflow auto-detects npm vs pnpm per branch, since `lts/5` predates the cutover) → `pnpm run build` → `npx typedoc` → installs and unit-tests [`docs-site/`](docs-site) (its own npm package with its own lockfile) → ingest + Astro build → copies the TypeDoc output to `dist/api` → deploys to GitHub Pages. Publishes **https://docs.memberjunction.org** (custom domain via [`docs-site/public/CNAME`](docs-site/public/CNAME), served at the domain root with `DOCS_BASE: /`; the old `memberjunction.github.io/MJ/` now redirects here). The API reference for every shipped package (`typedoc.json` `entryPoints: ["packages/**"]`, excluding CLI/CodeGen/MJAPI/MJExplorer and generated packages) is attached at **https://docs.memberjunction.org/api**.

> 🔒 **It does not build the ref that triggered it — it builds `lts/5`.** The checkout step pins `ref: ${{ github.event.inputs.ref || 'lts/5' }}`, so every trigger except a manual dispatch with an explicit `ref` publishes the **certified LTS line**, whatever fired it. That is deliberate: without the pin, `workflow_run` events check out the repo *default* branch (`next`), which during the 6.x era would publish Edge dev content as the public docs.
>
> **The trap is that it still reports green.** A push to `main` touching `releases/**`, `guides/**` or this file fires a deploy that succeeds — having rebuilt lts/5 and ignored your change. So **6.x content does not reach the public site at all right now**, including Edge release notes (Step 11). To publish a change during the Edge era it must reach `lts/5`; to preview one, dispatch manually with `ref` set. Remove the pin when versioned docs (`/v5`, `/v6`) land — the long-standing fix is to resolve the ref from [`release-lines.json`](release-lines.json) rather than hardcode it.

**The site is compiled from the repo — there is no site to edit.** [`docs-site/scripts/ingest.mjs`](docs-site/scripts/ingest.mjs) turns every `guides/*.md`, every `packages/**/README.md`, and five root docs (this file among them) into pages; repo-relative links are rewritten to site links when the target is itself a page and to commit-pinned GitHub links otherwise. Nothing here is a per-release step — but it does mean **a stale README ships as stale public documentation**, and that copy-pasting prose into `docs-site/` is always the wrong fix. Correct the source file instead.

> This workflow failed silently on every release from v5.45.1 through v5.48.0 — the published docs sat weeks stale while each release otherwise looked green, because `docs.yml` is downstream of the tag and nobody checks it. **Look at its result, not just `publish.yml`'s.**

> **Both 10b and 10c chain off `publish.yml` *completion*, not success.** If `publish.yml` is cancelled or fails, these fire anyway and fail with nothing to install or build — that failure is **collateral, not a real defect**. After re-running `publish.yml` successfully, both trigger again; judge them on the *later* run.
>
> For 10c specifically, also check *which trigger* the run you are looking at came from. `docs.yml` now fires on doc pushes to `main` and on manual dispatch as well, so a green `docs.yml` in the list may be an unrelated docs deploy rather than your release's. Match it to the release run before ticking the checklist.

### Post-Merge Checklist

- [ ] `publish.yml` completes successfully (npm packages published, tag created)
- [ ] **Dist-tags landed on the right channel**: `npm view @memberjunction/core dist-tags` — `edge` moved to the new version, **`latest` did not move** (it moves only at certification)
- [ ] **GitHub Release exists** for the new tag, notes auto-generated, marked prerelease (edge) and **not** latest
- [ ] `docker.yml` behaved for the channel: on an **Edge** release its `api` job is **skipped** (correct — Docker `:latest` tracks certified builds); on a certified build dispatched manually, images pushed
- [ ] `docs.yml` completes successfully (https://docs.memberjunction.org rebuilt, `/api` included). **Green here means "the LTS site rebuilt"** — it builds `lts/5`, not your release, so it is not evidence that any 6.x doc change went live (see 10c)
- [ ] `main` auto-merged back into `next` (includes the `pnpm-lock.yaml` refresh). If it **aborted** on a conflict, the release still succeeded — finish the back-merge by hand per 10a step 9
- [ ] **`next` branch build passes** after the auto-merge — the lockfile and version updates can sometimes cause issues, so always verify `build.yml` passes on `next` after a release
- [ ] **Canonical release notes written** — `releases/v<version>.md` committed to `next` via `/notes` (Step 11). Nothing produces this file automatically, and no check fails without it

---

## Post-Release Updates

> ### ⚠️ Removed step — "Update MJ Documentation Site" (the download-page edit)
>
> Older releases had a step here to update a per-version download link on the ReadMe docs site. **It no longer exists.** The versioned distribution zip (`Distributions/MemberJunction_Code_Bootstrap.zip`) was retired — the `Distributions/` folder is gone — and `mj install` sparse-fetches from the tagged source on demand, so there is no per-version URL to update each release. The old **Downloads** page (URL slug `quickstart-download`) is hidden/unpublished; its content moved to **"Installation in Minutes"**, which points users at `npx @memberjunction/cli install`.
>
> **Nothing to do here per release.** The only residual concern is drift: if "Installation in Minutes" ever shows a hardcoded version link, fix it — but that's a rare one-off, not a release task, so it is no longer a numbered step.

### Step 11: Release record & comms

The release record has three layers. **Two are automatic. The third is hand-written, is the canonical one, and is the only part of this step that is actual work.**

1. **Per-package `CHANGELOG.md`** — `changeset version` (inside `publish.yml`) turns each PR's `.changeset/*.md` summary into changelog bullets in every affected package.
2. **The GitHub Release** — `publish.yml` runs `gh release create --generate-notes`, so GitHub compiles a "What's Changed" list from every merged PR since the previous tag. Edge builds are flagged prerelease and never marked latest.
3. **[`releases/v<version>.md`](releases/) — the canonical release notes.** Not optional, and not produced by any workflow.

**Why the automatic layers don't cover it.** Both are machine-compiled from PR titles, so their quality is exactly PR-title quality plus changeset-summary quality — a lazy PR title ships verbatim. [`releases/README.md`](releases/README.md) names the markdown file, not the GitHub Release, as *"the canonical release notes … this directory is the record"*, and [`docs-site/scripts/ingest.mjs`](docs-site/scripts/ingest.mjs) renders every file in that directory at **/releases/**, newest-first with an auto-generated index, no site change needed.

**Write it after `publish.yml` succeeds, not during prep.** The filename carries the published version and `changeset version` doesn't compute that until publish time. It lands as a small PR into `next`:

```bash
npm view @memberjunction/core dist-tags     # the version that actually shipped
# then, in Claude Code:  /notes
```

The `/notes` skill ([`.claude/commands/notes.md`](.claude/commands/notes.md)) builds the file from the diff, the commit messages and the `.changeset/` entries; its H1 (a 6–10 word summary) becomes part of the page title — `v6.1.0-edge.0: <summary>`. Template lives in [`releases/README.md`](releases/README.md). It writes the file but does not commit — review it, then commit and PR it yourself.

> **During the Edge era this file will not appear on the public site, and that is expected — write it anyway.** `docs.yml` checks out `lts/5` on every trigger except a manual dispatch with an explicit `ref`, so the push to `main` touching `releases/**` fires a deploy that goes **green while rebuilding the LTS site**. The 6.x notes are committed but unpublished until versioned docs (`/v5`, `/v6`) land or the pin moves; they render retroactively when that happens. See 10c.
>
> **Line releases are the opposite case.** `lts/5` *is* what the site builds, so a line release's notes go live on push — but they must reach the line branch to do it (PR into `next`, then the `backport lts/5` label). Notes that stop at `next` publish nothing.

**Certified builds get the human layer.** At certification (runbook op. 4): the certified build's GitHub Release is marked **latest**, retitled with "(LTS)", and linked to its scorecard (`certifications/<version>.md`); the certification announcement follows process doc Appendix A.3. That is a certification step, not a per-release one.

> **The ReadMe changelog step is retired.** Older releases hand-pasted the release-PR body into the ReadMe (readme.com) changelog. Public docs now live at **https://docs.memberjunction.org** (built from this repo by `docs.yml`), the GitHub Release is the per-release public record, and the ReadMe site is being wound down — do not create new entries there.

---

## Quick Reference

### Key Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `build.yml` | Push to `next` | Build smoke test |
| `test.yml` | PR to `next` | Unit tests |
| `migrations.yml` | Push to `next` (migrations changed) | Validate migrations |
| `changes.yml` | PR to `next` or `main` | Validate migration naming & changesets |
| `publish.yml` (Edge path) | Push to `main`, or dispatch from `main` with `confirm_branch: main` | Version (pre-mode aware), grammar guard, build, publish to npm on the channel dist-tag, GitHub Release, merge-back |
| `publish.yml` (LTS path) | Manual dispatch **from `next`** with `line_branch: lts/N` + `confirm_branch: lts/N` | Line patch release: the job checks out the line itself, then version → build → publish `--tag lts-<line>` → tag + GitHub Release (never latest). Auto-detects npm (`lts/5`) vs pnpm (6.x-era lines) |
| `backport.yml` | `backport lts/*` label on a merged `next` PR | Opens the cherry-pick PR against the line branch (conflicts → draft PR) |
| `release-lines-guard.yml` | PRs touching, and pushes changing, `release-lines.json` | Status-transition legality; direct pushes may change mechanical fields only |
| `release-test.yml` | Manual dispatch | Release validation suite against a chosen branch |
| `docker.yml` | After `publish.yml` | Build & push Docker images |
| `docs.yml` | After `publish.yml`, doc pushes to `main`, manual dispatch | Build & deploy docs.memberjunction.org (site + `/api`). **Always builds `lts/5`**, not the triggering ref — see 10c |
| `docs-site-ci.yml` | PR touching a docs source | Fast (~2 min) "does the docs site still build" check |
| `generate-release-notes.yml` | PR to `main` | Auto-generate PR description |
| `integration.yml` | PR to `next` + push to `next` | Deterministic integration tier against a fresh SQL Server |

### Where release information lives

| Artifact | Location | Produced by |
|---|---|---|
| **Release notes (canonical)** | [`releases/v<version>.md`](releases/) in this repo — rendered at [docs.memberjunction.org/releases/](https://docs.memberjunction.org/releases/) | **Hand-written via `/notes` in Step 11.** No workflow produces it |
| Release notes (auto, secondary) | The GitHub Release body (auto-generated "What's Changed" from merged PRs) | `publish.yml` (`gh release create --generate-notes`); `generate-release-notes.yml` additionally writes structured notes into the release PR body |
| Per-package changelogs | `packages/*/CHANGELOG.md` | changesets, in the `RELEASING: Releasing N package(s)` commit, from each PR's changeset summary |
| npm packages | `edge` / `lts-<line>` dist-tags — **`latest` moves only at certification** | `publish.yml` (Edge and LTS paths); `ci/dist-tag-all.mjs` at certification |
| Git tag `vX.Y.Z[-edge.N]` | repo tags | `ci/commit_push.mjs` |
| Docker images | Docker Hub `memberjunction/api`, Azure ACR | `docker.yml` — certified builds only; Edge is skipped (see 10b) |
| API docs | https://docs.memberjunction.org/api | `docs.yml` |
| Release/support state | [`release-lines.json`](release-lines.json) | Workflows append mechanical fields; status changes only via CODEOWNERS-gated PR |
| Certification scorecards | `certifications/<version>.md`, linked from the certified GitHub Release | Certification owner |

```bash
cat releases/v6.1.0-edge.0.md                          # the canonical release notes
gh release view v6.1.0-edge.0 --json body --jq .body   # the auto-generated GitHub Release body
git show <releasing-commit>:packages/MJCore/CHANGELOG.md | head -40
git log v5.50.0..v5.51.0 --oneline | wc -l              # raw commit count for a release
```

### Migration Naming Convention

```
V[YYYYMMDDHHMM]__v[MAJOR].[MINOR].x__[Description].sql
```

- `V` prefix (not `B` — that's only for baselines)
- Timestamp: `YYYYMMDDHHMM` — must be strictly greater than all existing timestamps
- Version: the line the release is building toward — `v6.1.x` while `next` streams `6.1.0-edge.N`
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
RUN_MUTATION_TESTS=1 pnpm run test:integration

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
pnpm run change

# Version packages based on changesets (done by CI, rarely manual — and NEVER
# `changeset pre enter`/`exit` outside a candidate cut or era open)
pnpm run version
```

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

> **Work on a release-prep branch, not on `next` directly.** Cut
> `release/vX.Y-prep` from the tip of `next` (`git checkout -b release/vX.Y-prep && git push -u origin release/vX.Y-prep` — same-named remote tracking, per the branch rules), land Steps 2–7's
> commits there, and merge into `next` via a PR (e.g. #3163 for v5.48). This keeps
> `next` green while prep is in flight and gives the release artifacts a reviewable PR.

### Step 1: Verify CI on `next`

Before anything else, confirm the `next` branch is healthy:

- [ ] **"Build all packages for testing"** (`build.yml`) — passes on `next`
- [ ] **"Test migrations"** (`migrations.yml`) — passes if migrations were changed
- [ ] **"Unit Tests"** (`test.yml`) — passes on any open PR

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

#### If no metadata changes:
- Skip this step. Changesets will determine patch vs minor based on what's already been added.

### Step 4: Check for New Packages

**This must be done for every release.**

Follow [NEW_PACKAGE_SETUP.md](NEW_PACKAGE_SETUP.md):

1. Check if any new `@memberjunction/*` packages were added since the last release — the authoritative check is the same script the publish workflow runs:
   ```bash
   ./.github/scripts/validate-npm-packages.sh   # lists every package missing from npm
   ```
2. For each new package, create a placeholder on npm with OIDC trusted publishing:
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

### Step 5: Verify Changesets

Make sure the changeset entries accurately reflect the release:

- **Patch-only changes?** All changesets should say `patch`
- **New migrations or metadata sync?** At least one changeset must say `minor`
- **Breaking changes?** Must have `major` (and deploy manually, not via Actions)

---

## Local Build Validation

### Step 6: Full Repo Build

**This must be done before creating the release PR.** A full local build validates compilation across all packages and regenerates bootstrap manifest files that may have drifted across merged PRs.

```bash
# 1. Pull the latest next branch
git checkout next
git pull origin next

# 2. Clean install dependencies
npm install

# 3. Full repo build
npm run build
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

### Step 7: Convert New Migrations to PostgreSQL (`/pg-migrate-v2`)

**This must be done for every release that adds new migrations** (including the metadata-sync migration from Step 3).

MemberJunction ships migrations for **both** SQL Server and PostgreSQL. SS migrations in `migrations/v5/` are authored first; each needs a validated PostgreSQL counterpart (`.pg.sql`) in `migrations-pg/v5/`. Producing those counterparts is now a standard part of the release process, run via the **`/pg-migrate-v2`** skill (the "split-and-regenerate" pipeline) or its successor runbook **`/pg-migrate-experimental`**, which carries the latest field-tested gotchas (converter dedup mutating committed files, workbench memory limits, scheduled-job OOM, `provisioningGuard`, correct `mj_api`/`mj_explorer` workspace names — see the Gotchas section in `.claude/commands/pg-migrate-experimental.md`). Whichever variant runs, the non-negotiables are the same: **the real gate is a clean `mj migrate` on a fresh PG database**, committed `.pg.sql` files are immutable, and no `.needs-hand` files may remain.

> ⚠️ **Do this after the full build (Step 6) and before the release PR (Step 8).** Every new SS migration in this release must have a committed, verified `.pg.sql` counterpart on `next` before the PR is opened — otherwise PostgreSQL deployments of the release are missing migrations.

**What the skill does** (see `.claude/commands/pg-migrate-v2.md` for the full runbook):

1. Runs entirely inside the `claude-dev` Docker workbench (with SQL Server + PostgreSQL containers), on a dedicated `pg-migrate-v2/<branch>` branch — the host repo stays read-only until the final copy-back.
2. `mj migrate convert --split` classifies each new SS migration and transpiles only the ~2% hand-written DDL via the sqlglot AST dialect; CodeGen objects (views/sprocs/triggers/grants) are **baked inline** into each new migration. Only migrations lacking a `.pg.sql`/`.pg-only.sql` counterpart are converted — committed counterparts are immutable and never reconverted.
3. Any procedural residue the dialect can't auto-translate lands as `.needs-hand` files; these are hand-authored (lifting from the committed ledger where the routine already exists) and renamed to `.pg.sql`.
4. **The real gate:** the converted set is applied to a **fresh** PG database via `mj migrate` → `mj sync push` (no `mj codegen`). A clean apply — not the converter's "0 gaps" summary — is what proves the SQL is correct.
5. Four verification layers run: conversion parity, SS↔PG schema parity, view semantic equivalence, and a CRUD behavioral oracle — followed by full-stack browser smoke + deep CRUD workflow tests (magic-link login, no external IdP).
6. The verified `.pg.sql` files are copied back to the host as **uncommitted** changes for review, along with a `migrations-pg/PG_MIGRATION_REPORT.md`.

**After the skill finishes:** review the converted `.pg.sql` files and the report, then **commit them to `next`** so they're included in the release PR. Confirm no `.needs-hand` files were copied back (that would mean conversion is incomplete).

> **Invariant:** committed `migrations-pg/v5/*.pg.sql` / `*.pg-only.sql` are a deployed historical ledger — byte-for-byte immutable. This step only ever produces PG counterparts for the **new** SS migrations in this release.

---

## Creating the Release

### Step 8: Create PR from `next` → `main`

> **Important:** All changes from the previous steps (metadata migration scripts, new changesets, AI model updates) must already be committed and pushed to `next` before creating this PR.

1. Open a PR: `next` → `main`
2. The **"Generate Release Notes"** workflow (`generate-release-notes.yml`) will auto-populate the PR title (e.g., `v5.6.0`) and description with structured release notes
3. Wait for the generated PR message to appear
4. Wait for **all CI checks** to pass:
   - `changes.yml` — validates migration filenames, version patterns, schema placeholder usage
   - `test.yml` — unit tests
   - `dependency-check.yml` — checks for missing npm dependencies
   - `claude.yml` — reviews migration files for hardcoded UUIDs

### Step 9: Merge the PR

Once all checks pass, merge the PR into `main`.

---

## Post-Merge: Automated Pipeline

Merging to `main` triggers a chain of automated workflows. Monitor each one.

### 9a. `publish.yml` — Build & Publish Packages

**Triggered by:** push to `main`

This workflow:
1. Runs migration tests against a fresh SQL Server container
2. Validates package-lock.json case sensitivity
3. Validates all `@memberjunction/*` packages exist on npm (see Step 4)
4. Determines version bump (minor if new migrations, patch otherwise)
5. Builds all packages
6. Publishes to npm via OIDC
7. Tags the release
8. **Auto-merges `main` back into `next`** and updates lock files

### 9b. `docker.yml` — Build & Publish Docker Images

**Triggered by:** `publish.yml` completion

Builds and pushes multi-platform Docker images (`linux/amd64`, `linux/arm64`):
- Docker Hub: `memberjunction/api:latest` and `memberjunction/api:v{VERSION}`
- Azure ACR: `askskip.azurecr.io` with same tags

> **Known issue:** This workflow sometimes fails because it tries to install the newly published npm packages before they've fully propagated on the npm registry. If it fails, **re-run the failed job** — it usually succeeds on the second attempt.

### 9c. `docs.yml` — Update Package Documentation

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

### Step 10: Update MJ Documentation Site

Go to [ReadMe Dashboard](https://dash.readme.com/):

1. Click **Edit**
2. Navigate to **quickstart-download**
3. Confirm the quickstart points users at the CLI installer — `npx @memberjunction/cli install` (online) or `npx @memberjunction/cli bundle` for an offline zip — rather than a per-version download link.
4. **Save** — this can be done while the post-merge actions are still running

> **Note:** The legacy per-version distribution zip (`Distributions/MemberJunction_Code_Bootstrap.zip`) has been retired. `mj install` now sparse-fetches and assembles the project from the tagged source on demand, so there is no longer a version-specific zip URL to update each release.

### Step 11: Update Changelog

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

# SQL logs appear in
metadata/sql_logging/MetadataSync_Push_*.sql
```

### Changeset Commands

```bash
# Add a new changeset
npm run change

# Version packages based on changesets (done by CI, rarely manual)
npm run version
```

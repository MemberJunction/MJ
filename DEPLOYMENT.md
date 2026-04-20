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

### Step 1: Verify CI on `next`

Before anything else, confirm the `next` branch is healthy:

- [ ] **"Build all packages for testing"** (`build.yml`) — passes on `next`
- [ ] **"Test migrations"** (`migrations.yml`) — passes if migrations were changed
- [ ] **"Unit Tests"** (`test.yml`) — passes on any open PR

### Step 2: Check for New AI Models (Optional but Recommended)

Do this **before** the metadata sync step so new models are included in the migration script.

1. Quick web research across major AI provider release pages:
   - Google (Gemini), OpenAI (GPT), Anthropic (Claude), Mistral, Groq, Meta (Llama), xAI (Grok), DeepSeek
2. Compare against what's already in `metadata/ai-models/.ai-models.json`
3. If new models are worth adding:
   - Use `/add-ai-model` skill or manually edit `metadata/ai-models/.ai-models.json`
   - Run `mj sync push --dir ./metadata` to sync to your local database
   - The changes will be captured in the metadata migration script (next step)

### Step 3: Handle Metadata Changes

Check if there are any pending metadata changes (new/updated records in `metadata/`).

#### If metadata has changed since the last release:

1. **Verify MJ CLI is up to date** — run `mj version` to confirm you're on the latest
2. **Start a fresh database** — spin up a clean SQL Server instance
3. **Update local `.env`** to point to this fresh database
4. **Run migrations** to bring it to the latest version:
   ```bash
   mj migrate
   ```
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

8. **Commit the migration script to `next`** — push this new migration file to the `next` branch so it's included in the release PR
9. **Ensure a minor changeset exists** — if changesets only have `patch` bumps, you must add a changeset with `minor` on at least one `@memberjunction/*` package to indicate this is a minor release:
   ```bash
   npm run change
   # Select at least one package, choose "minor"
   ```

#### If no metadata changes:
- Skip this step. Changesets will determine patch vs minor based on what's already been added.

### Step 4: Check for New Packages

**This must be done for every release.**

Follow [NEW_PACKAGE_SETUP.md](NEW_PACKAGE_SETUP.md):

1. Check if any new `@memberjunction/*` packages were added since the last release
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

## Creating the Release

### Step 6: Create PR from `next` → `main`

> **Important:** All changes from the previous steps (metadata migration scripts, new changesets, AI model updates) must already be committed and pushed to `next` before creating this PR.

1. Open a PR: `next` → `main`
2. The **"Generate Release Notes"** workflow (`generate-release-notes.yml`) will auto-populate the PR title (e.g., `v5.6.0`) and description with structured release notes
3. Wait for the generated PR message to appear
4. Wait for **all CI checks** to pass:
   - `changes.yml` — validates migration filenames, version patterns, schema placeholder usage
   - `test.yml` — unit tests
   - `dependency-check.yml` — checks for missing npm dependencies
   - `claude.yml` — reviews migration files for hardcoded UUIDs

### Step 7: Merge the PR

Once all checks pass, merge the PR into `main`.

---

## Post-Merge: Automated Pipeline

Merging to `main` triggers a chain of automated workflows. Monitor each one.

### 7a. `publish.yml` — Build & Publish Packages

**Triggered by:** push to `main`

This workflow:
1. Runs migration tests against a fresh SQL Server container
2. Validates package-lock.json case sensitivity
3. Validates all `@memberjunction/*` packages exist on npm (see Step 4)
4. Determines version bump (minor if new migrations, patch otherwise)
5. Builds all packages
6. Publishes to npm via OIDC
7. Creates a distribution zip
8. Tags the release
9. **Auto-merges `main` back into `next`** and updates lock files

### 7b. `docker.yml` — Build & Publish Docker Images

**Triggered by:** `publish.yml` completion

Builds and pushes multi-platform Docker images (`linux/amd64`, `linux/arm64`):
- Docker Hub: `memberjunction/api:latest` and `memberjunction/api:v{VERSION}`
- Azure ACR: `askskip.azurecr.io` with same tags

> **Known issue:** This workflow sometimes fails because it tries to install the newly published npm packages before they've fully propagated on the npm registry. If it fails, **re-run the failed job** — it usually succeeds on the second attempt.

### 7c. `docs.yml` — Update Package Documentation

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

### Step 8: Update MJ Documentation Site

Go to [ReadMe Dashboard](https://dash.readme.com/):

1. Click **Edit**
2. Navigate to **quickstart-download**
3. Add a new row for the releasing version
4. Update the download URL with the new version number
5. **Save** — this can be done while the post-merge actions are still running

### Step 9: Update Changelog

**Wait until ALL of the following are complete before saving:**
- [ ] npm packages published
- [ ] Docker images pushed
- [ ] Distribution zip created

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

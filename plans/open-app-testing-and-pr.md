# Open App System — Testing & PR Preparation

## Overview

This document covers how to test the Open App system end-to-end and how to prepare the PR for the `test/open-app-system` branch.

**Branch:** `test/open-app-system` (tracks `origin/test/open-app-system`)
**Base branch:** `next`
**Changed files:** 22 files, ~860 insertions, ~540 deletions (working tree) + prior commits on branch

---

## Part 1: Testing

### 1A. Build the Packages

Both packages must compile cleanly before any testing.

```bash
# Build the Engine (no external deps needed)
cd packages/MJOpenApp/Engine && npm run build

# Build the CLI
cd packages/MJCLI && npm run build
```

Both should exit with 0 errors. If either fails, fix compilation issues before proceeding.

---

### 1B. Unit Tests — No Database Required

These test the pure logic (manifest validation, dependency resolution, version checking). Run from the repo root:

```bash
# Manifest validation (45+ test cases)
npx tsx tests/open-app/test-manifest-validation.ts

# Dependency resolver (13+ test cases)
npx tsx tests/open-app/test-dependency-resolver.ts

# Version checker (20+ test cases)
npx tsx tests/open-app/test-version-checker.ts
```

Each script prints pass/fail for every case and exits non-zero if anything fails.

**What these cover:**
| Test File | What It Validates |
|-----------|-------------------|
| `test-manifest-validation.ts` | Zod schema: valid/invalid names, versions, schemas, colors, tags, package roles, repos, descriptions |
| `test-dependency-resolver.ts` | Topological sort, circular dep detection, already-installed handling, empty deps |
| `test-version-checker.ts` | MJ version compat, dependency version compat, upgrade validation, pre-release handling, caret/tilde ranges |

---

### 1C. CLI Smoke Test — No Database Required

Verifies all 8 `mj app` subcommands load and respond to `--help`:

```bash
bash tests/open-app/test-cli-smoke.sh
```

Tests these commands:
- `mj app install --help`
- `mj app upgrade --help`
- `mj app remove --help`
- `mj app list --help`
- `mj app info --help`
- `mj app disable --help`
- `mj app enable --help`
- `mj app check-updates --help`

Also runs `mj app list` to verify it handles empty state without error.

---

### 1D. End-to-End Lifecycle Test — Requires Database

This is the full lifecycle test against a real MJ database. It exercises the complete install → manage → remove flow.

**Prerequisites:**
1. `mj.config.cjs` configured with valid DB credentials
2. MJ database with v4 migration applied (the `OpenApp` / `OpenAppInstallHistory` / `OpenAppDependency` tables must exist)
3. The sample app repo must be accessible at the GitHub URL
4. `mj` CLI in PATH or built locally

**Run:**
```bash
bash tests/open-app/test-e2e-install.sh https://github.com/MemberJunction/mj-sample-open-app
```

**What it does (12 steps):**

| Step | Command | What It Verifies |
|------|---------|------------------|
| 1 | `mj app list` | Clean state — no `mj-sample-app` installed |
| 2 | `mj app install <repo-url>` | Full install: clone, validate manifest, run migrations, record in DB |
| 3 | `mj app list` | App appears in list with `Active` status |
| 4 | `mj app info mj-sample-app` | Shows version `1.0.0` and schema `sample_app` |
| 5 | `mj app disable mj-sample-app` | Disables the app |
| 6 | `mj app list` | Status shows `Disabled` |
| 7 | `mj app enable mj-sample-app` | Re-enables the app |
| 8 | `mj app list` | Status back to `Active` |
| 9 | `mj app check-updates` | Reports no updates (just installed latest) |
| 10 | `mj app remove mj-sample-app` | Full removal: drop schema, update status to `Removed` |
| 11 | `mj app list` | App no longer appears (filtered out) |
| 12 | Manual SQL check | Verify `sample_app` schema was dropped |

**Manual schema verification** (Step 12 — run in SSMS or Azure Data Studio):
```sql
SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = 'sample_app';
-- Should return 0 rows
```

---

### 1E. Test Execution Order

Run in this order — each tier catches different categories of bugs:

1. **Builds** (1A) — catches type errors, missing imports, broken interfaces
2. **Unit tests** (1B) — catches logic bugs in validation, resolution, version checking
3. **Smoke test** (1C) — catches CLI registration/wiring issues
4. **E2E** (1D) — catches integration issues with DB, GitHub, Skyway migrations

---

## Part 2: PR Preparation

### 2A. Stage and Commit

All changes are currently unstaged. Stage them explicitly (per CLAUDE.md — never use `git add -A`):

```bash
git add \
  migrations/v4/V202602122020__v4.3.x_Open_App_Tracking_Tables.sql \
  package-lock.json \
  packages/CodeGenLib/src/Config/config.ts \
  packages/CodeGenLib/src/Database/manage-metadata.ts \
  packages/MJCLI/src/commands/app/check-updates.ts \
  packages/MJCLI/src/commands/app/info.ts \
  packages/MJCLI/src/commands/app/list.ts \
  packages/MJCLI/src/config.ts \
  packages/MJCLI/src/types/mj-open-app-engine.d.ts \
  packages/MJCLI/src/utils/open-app-context.ts \
  packages/MJExplorer/src/app/generated/open-app-bootstrap.generated.ts \
  packages/MJOpenApp/Engine/package.json \
  packages/MJOpenApp/Engine/src/dependency/dependency-resolver.ts \
  packages/MJOpenApp/Engine/src/index.ts \
  packages/MJOpenApp/Engine/src/install/config-manager.ts \
  packages/MJOpenApp/Engine/src/install/history-recorder.ts \
  packages/MJOpenApp/Engine/src/install/install-orchestrator.ts \
  packages/MJOpenApp/Engine/src/install/migration-runner.ts \
  packages/MJOpenApp/Engine/src/install/schema-manager.ts \
  packages/MJOpenApp/Engine/src/manifest/manifest-schema.ts \
  packages/MJOpenApp/Engine/src/types/open-app-types.ts \
  tests/open-app/sample-app-repo/migrations/V202602120001__v1.0.0_Initial_Schema.sql
```

### 2B. Verify Branch Tracking

Per CLAUDE.md — **always check before pushing**:

```bash
git branch -vv | grep "test/open-app-system"
# Must show: [origin/test/open-app-system]
# If it shows [origin/next] — STOP and fix:
#   git branch --set-upstream-to=origin/test/open-app-system test/open-app-system
```

### 2C. Commit

```bash
git commit -m "$(cat <<'EOF'
Open App: spec alignment fixes + RunView/Metadata refactor

- Refactored engine from MJDataProvider abstraction to direct RunView + Metadata
- Updated OrchestratorContext to use ContextUser (UserInfo) instead of DataProvider + UserId
- Added CodeGen schema exclusion for Open App schemas (manage-metadata.ts)
- Added 'Removed' status to full app lifecycle
- Added bootstrap role startupExport validation (.refine in Zod schema)
- Added object form for dependency repository URLs
- PascalCase keys in mj.config.cjs output
- Updated CLI ambient types and all command files to match engine changes

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

### 2D. Push

```bash
git push
```

Since the branch already tracks `origin/test/open-app-system`, this pushes to the correct remote.

### 2E. Create PR

```bash
gh pr create --base next --title "Open App: spec alignment + RunView/Metadata refactor" --body "$(cat <<'EOF'
## Summary
- Refactored engine from custom `MJDataProvider` abstraction to direct `RunView` + `Metadata` from `@memberjunction/core` for strong typing and consistency
- Updated `OrchestratorContext` interface: replaced `DataProvider` + `UserId` with `ContextUser: UserInfo`
- Added CodeGen automatic schema exclusion for Open App schemas
- Added `Removed` status to complete the app removal lifecycle
- Added Zod `.refine()` validation requiring `startupExport` for bootstrap-role packages
- Added object form support for dependency repository URLs
- PascalCase keys in `mj.config.cjs` output from config-manager

## Changed Packages
- `@memberjunction/mj-open-app-engine` — core refactor (history-recorder, install-orchestrator, types, manifest schema, config-manager, schema-manager, migration-runner, dependency-resolver)
- `@memberjunction/mjcli` — updated context builder, ambient types, and all 3 app commands using data access
- `@memberjunction/codegen-lib` — added `addOpenAppSchemaExclusions()` in manage-metadata.ts + config schema
- Migration: `V202602122020__v4.3.x_Open_App_Tracking_Tables.sql` — CHECK constraint includes `Removed`

## Test plan
- [ ] `cd packages/MJOpenApp/Engine && npm run build` — compiles clean
- [ ] `cd packages/MJCLI && npm run build` — compiles clean
- [ ] `npx tsx tests/open-app/test-manifest-validation.ts` — all pass
- [ ] `npx tsx tests/open-app/test-dependency-resolver.ts` — all pass
- [ ] `npx tsx tests/open-app/test-version-checker.ts` — all pass
- [ ] `bash tests/open-app/test-cli-smoke.sh` — all 8 commands respond
- [ ] `bash tests/open-app/test-e2e-install.sh <repo-url>` — full lifecycle passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Quick Reference — Copy-Paste Commands

```bash
# === FULL TEST SUITE ===
cd packages/MJOpenApp/Engine && npm run build && cd ../../..
cd packages/MJCLI && npm run build && cd ../..
npx tsx tests/open-app/test-manifest-validation.ts
npx tsx tests/open-app/test-dependency-resolver.ts
npx tsx tests/open-app/test-version-checker.ts
bash tests/open-app/test-cli-smoke.sh
bash tests/open-app/test-e2e-install.sh https://github.com/MemberJunction/mj-sample-open-app

# === COMMIT + PUSH + PR ===
git add <files listed above>
git branch -vv | grep "test/open-app-system"
git commit -m "Open App: spec alignment fixes + RunView/Metadata refactor"
git push
gh pr create --base next --title "..." --body "..."
```

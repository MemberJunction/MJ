# Open App CI/CD & GitHub Rulesets Setup Guide (`bizapps-common` Standard)

This guide documents how to set up the **standard MemberJunction Open App CI/CD pipeline and GitHub branch rulesets**, modeled directly on `MemberJunction/bizapps-common` (with the human reviewer requirement removed so PRs are gated by automated checks without blocking on manual review approval).

---

## 1. Pipeline Architecture Overview

Every Open App uses a two-branch (`next` → `main`) Changesets + npm OIDC release pipeline where **no human or workflow ever pushes directly to `next` or `main`**:

```mermaid
flowchart LR
  subgraph Dev["1. Feature Work (into next)"]
    F["Feature Branch<br/>+ changeset"] -->|PR to next| NextGates["Door Gates:<br/>• changes.yml<br/>• build.yml<br/>• repo-checks.yml<br/>• clean-room-gate.yml<br/>• schema-consistency.yml<br/>• caret-pins.yml (advisory)"]
    NextGates -->|Merge| Next["next<br/>(Default Branch)"]
  end

  subgraph Rel["2. Automated Release PR (into main)"]
    Next -->|Triggers version.yml<br/>(GitHub App token)| VP["Version Packages PR<br/>(changeset-release/main → main)<br/>• changeset version<br/>• sync mj-app.json<br/>• refresh pnpm-lock.yaml"]
    VP -->|Runs on PR| MainGates["Release Gates:<br/>• release-readiness.yml (rr:*)<br/>• build.yml (build)<br/>• repo: release seed<br/>• clean-room-gate.yml<br/>• schema-consistency.yml<br/>• caret-pins.yml (advisory)"]
  end

  subgraph Pub["3. Publish & Back-Merge"]
    MainGates -->|release.yml dispatch<br/>(Cut the Release)<br/>merges the PR = Release| Main["main<br/>(Release Branch)"]
    Main -->|Triggers publish.yml| OIDC["npm OIDC Publish<br/>+ git tag vX.Y.Z"]
    OIDC -->|GitHub App opens &<br/>auto-merges PR| BM["release-back-merge/vX.Y.Z → next"]
    BM --> Next
  end
```

### Why this design?
1. **Zero direct pushes (`GH013`-proof)**: GitHub rulesets with required status checks reject direct branch pushes (`GH013`) because a newly pushed SHA has no check runs attached to it yet. Every write to `next` and `main` goes through a Pull Request.
2. **GitHub App token (`blue-cypress-ci-bot`), not `GITHUB_TOKEN`**: PRs opened with `GITHUB_TOKEN` do not trigger GitHub Actions check runs. Using the org's `blue-cypress-ci-bot` App token ensures `version.yml`'s **Version Packages** PR and `publish.yml`'s **back-merge** PR trigger all required status checks automatically.
3. **Version numbers never skip**: `version.yml` bases the **Version Packages** PR on `main` (`changeset-release/main` → `main`) while resetting its tree to `next` + the version bump. Merging that single PR is the release, and that merge is a **`workflow_dispatch`** (`release.yml`, "Cut the Release") run with the App token, never a hand click or an auto-merge: `version.yml` runs on every push to `next`, so auto-merging its PR would turn every merge into a publish. Releasing stays a recorded decision.
4. **OIDC Trusted Publishing**: Packages publish to npm using GitHub OIDC (`id-token: write`) with provenance — no `NPM_TOKEN` secret to rotate.

---

## 2. Files to Copy from `bizapps-common`

From a sibling checkout of `bizapps-common`, copy the following four directories into your Open App repository:

```bash
# Run from the root of your target Open App repository (assuming ../bizapps-common exists)
# Make sure that checkout is on an up-to-date `next` first (`git -C ../bizapps-common fetch origin next:next`);
# a stale feature branch is missing workflows that `origin/next` already carries.
mkdir -p .github/workflows .github/scripts/__tests__ ci/lib scripts .changeset

# 1. Workflows (copy all except mutants.yml unless your repo already has mutation harnesses)
cp ../bizapps-common/.github/workflows/{build,caret-pins,changes,clean-room-gate,publish,release,release-readiness,repo-checks,schema-consistency,verify-release-app-token,version}.yml .github/workflows/

# 2. Shared .github validator scripts + their self-tests
cp ../bizapps-common/.github/scripts/*.{sh,mjs} .github/scripts/
cp ../bizapps-common/.github/scripts/__tests__/* .github/scripts/__tests__/

# 3. Release-readiness & manifest sync scripts
cp ../bizapps-common/ci/*.{sh,mjs} ci/
cp ../bizapps-common/ci/lib/*.sh ci/lib/

# 4. Repo guard & release-seed scripts + their specs
cp ../bizapps-common/scripts/{sync-app-version,check-release-seed-coverage,check-release-seed-cadence,check-release-pushes,check-paths-touched,check-against-published-mj}*.mjs scripts/
```

### What each workflow does

| Workflow File | Trigger | Purpose & Status Check Contexts |
|---|---|---|
| `.github/workflows/changes.yml` | PR → `next` | **Door migration & script checks**: `migration naming`, `migration changeset`, `migration immutability`, `script references`, `Parse migrations (T-SQL syntax check)`. The `migration changeset` job needs `pull-requests: read` + `issues: read` and passes `GH_TOKEN`/`PR_NUMBER`: `check-migration-changeset.sh` only honours the `migration-changeset-exempt` label when whoever applied it holds the Maintain or Admin role (fails closed otherwise). |
| `.github/workflows/build.yml` | Push → `next`, PR → `next`, `main` | **Package & build gate (`build`)**: validates `repository.url`, `files: ["dist"]`, lockfile case-sensitivity self-tests, script specs, `pnpm install --frozen-lockfile`, `pnpm run build:packages`, `pnpm run test`. |
| `.github/workflows/repo-checks.yml` | PR → `next`, `main` | **Repo guards & seed checks**: `repo: guards` (enforces caret peerDependencies on `@memberjunction/*` and sibling `@mj-biz-apps/*`, script self-tests, no direct-push gate) and `repo: release seed` (on PRs to `main`: verifies `check:release-seed` and `check:seed-cadence`). |
| `.github/workflows/schema-consistency.yml` | Push & PR → `next`, `main` | **FK index coverage (`Foreign Key Index Coverage (MC4)`)**: `check-fk-indexes.mjs` asserts every `FOREIGN KEY` in `migrations/` has its CodeGen-standard `IDX_AUTO_MJ_FKEY_{Table}_{Column}` index. Not a required context in the rulesets, but it runs on every PR. |
| `.github/workflows/caret-pins.yml` | PR → `next`, `main` (path-filtered to `package.json` files) | **Advisory (`caret pins (advisory)`)**: `check-caret-pins.mjs` flags `~` or exact ranges outside `devDependencies`/`overrides`. Deliberately **not** required: a red result is fixed, or allow-listed in `.github/caret-pins-allow.json` with a reason. The file is copied byte-for-byte into every bizapps repo. |
| `.github/workflows/clean-room-gate.yml` | Push & PR → `next`, `main` | **Clean-room DB gate (`Clean-room EntityField drift`)**: boots SQL Server 2022, installs MJ core at the `mjVersionRange` floor, runs the app's migrations from scratch, and verifies zero `EntityField` drift between SQL views and metadata. |
| `.github/workflows/version.yml` | Push → `next` | **Maintains the Version Packages PR**: uses `blue-cypress-ci-bot` to open/update `changeset-release/main` → `main` running `pnpm run version:prepare`. |
| `.github/workflows/release-readiness.yml` | PR → `main` | **Release gates (`rr:*`)**: `rr: changesets`, `rr: minor bump`, `rr: metadata shipped`, `rr: pg counterparts`, `rr: release base current`, `rr: migration immutability`, `rr: packages on npm`. |
| `.github/workflows/release.yml` | `workflow_dispatch` | **Cut the Release**: finds the single open `changeset-release/main` → `main` PR (refuses on 0 or >1), waits up to 10 min for its checks to settle, then merges it with a merge commit using the App token and `--match-head-commit`. Takes **no inputs** on purpose: the App's `pull_request`-mode bypass on `protect-main` must only ever merge the branch the changesets action owns. GitHub still enforces `protect-main-checks` on the merge. |
| `.github/workflows/publish.yml` | Push → `main` | **Builds, publishes, tags, and back-merges**: publishes to npm over OIDC, creates and pushes `vX.Y.Z` tag, and opens + auto-merges `release-back-merge/vX.Y.Z` → `next`. |
| `.github/workflows/verify-release-app-token.yml` | `workflow_dispatch` | **Read-only diagnostic**: verifies `vars.APP_CLIENT_ID` and `secrets.APP_PRIVATE_KEY` can mint an installation token for this repo with `contents: write` and `pull-requests: write`. |

---

## 3. Customizing Repo-Specific Values

The 9 core workflows (`changes.yml`, `build.yml`, `caret-pins.yml`, `schema-consistency.yml`, `version.yml`, `release.yml`, `release-readiness.yml`, `publish.yml`, `verify-release-app-token.yml`) and all `ci/*` scripts are **100% repo-agnostic** (they read `packages/Entities/package.json` and `mj-app.json` dynamically).

Only the following places reference `bizapps-common`'s schema name (`__mj_BizAppsCommon`) or optional test harnesses and must be updated for your app:

### 3.1 Replace `__mj_BizAppsCommon` with your app's schema name
Replace `__mj_BizAppsCommon` (and `bizapps_common_cleanroom`) with your app's schema (e.g., `__mj_BizAppsMyApp`) in:
1. `.github/workflows/clean-room-gate.yml` (lines 58, 137, 139)
2. `.github/scripts/check-entityfield-drift.mjs` (line 62: `const APP_SCHEMA = argValue('--schema') || '__mj_BizAppsMyApp';`)
3. `.github/scripts/parse-migrations.mjs` (line 117: default `--schema` fallback)
4. `.github/scripts/__tests__/parse-migrations.spec.mjs` (line 37)

```bash
# Quick replacement example (replace __mj_BizAppsMyApp with your schema name from mj-app.json):
APP_SCHEMA="__mj_BizAppsMyApp"
sed -i '' "s/__mj_BizAppsCommon/${APP_SCHEMA}/g" \
  .github/workflows/clean-room-gate.yml \
  .github/scripts/check-entityfield-drift.mjs \
  .github/scripts/parse-migrations.mjs \
  .github/scripts/__tests__/parse-migrations.spec.mjs
```

### 3.2 If your Open App depends on `bizapps-common` (or another upstream Open App)
In `.github/workflows/clean-room-gate.yml`, if your app's SQL migrations reference tables or views in `__mj_BizAppsCommon`, add a step in `clean-room-gate.yml` right after `Install MJ core` (step `pnpm exec mj migrate --tag ${{ steps.mj.outputs.tag }}`) to migrate `bizapps-common` before running your app's migration chain:

```yaml
      - name: Install MJ core
        run: pnpm exec mj migrate --tag ${{ steps.mj.outputs.tag }} --verbose

      # Add this step if your app depends on bizapps-common in mj-app.json:
      - name: Install upstream Open App (bizapps-common)
        run: |
          DEP_RANGE=$(jq -r '.dependencies["mj-bizapps-common"] // empty' mj-app.json)
          if [ -n "$DEP_RANGE" ]; then
            DEP_VER=$(echo "$DEP_RANGE" | sed -E 's/^[^0-9]*//')
            git clone --depth 1 --branch "v${DEP_VER}" https://github.com/MemberJunction/bizapps-common.git /tmp/bizapps-common
            pnpm exec mj migrate --schema __mj_BizAppsCommon --dir /tmp/bizapps-common/migrations --verbose
          fi

      - name: Apply this repo's migration chain
        run: pnpm exec mj migrate --schema __mj_BizAppsMyApp --dir ./migrations --verbose
```

### 3.3 Adjust `.github/workflows/repo-checks.yml` if you don't use Mutation / Integration Harnesses yet
In `.github/workflows/repo-checks.yml`, the `guards` job runs two steps that assume `bizapps-common`'s mutation and integration harnesses exist:
- `Mutation anchors` (`pnpm run test:mutants:anchors`)
- `Harness self-tests` (`node --test 'packages/*/test-harnesses/*.spec.mjs' 'test-harnesses/*.spec.mjs'`)

If your Open App does not have mutation or integration harness `.spec.mjs` files yet, remove those two steps from `.github/workflows/repo-checks.yml` (keep `Dependency model`, `Script self-tests`, and `Release-push gate`, plus the entire `release-seed` job).

---

## 4. Required Repository Configuration Files

### 4.1 `.changeset/config.json`
Ensure `.changeset/config.json` uses `baseBranch: "next"` and lockstep (`fixed`) versioning across your `@mj-biz-apps/*` packages:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.2/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [["@mj-biz-apps/*"]],
  "linked": [],
  "access": "public",
  "baseBranch": "next",
  "updateInternalDependencies": "patch"
}
```

### 4.2 Root `package.json` Scripts & `devDependencies`
Your root `package.json` must define the scripts invoked by the workflows and guards (replace `myapp` and `__mj_BizAppsMyApp` with your app's package prefix and schema):

```json
{
  "name": "bizapps-myapp",
  "private": true,
  "version": "1.0.0",
  "license": "BUSL-1.1",
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "prebuild": "node -e \"try { require.resolve('turbo') } catch (e) { console.error('\\n❌ Dependencies not installed. Run: pnpm install\\n'); process.exit(1); }\"",
    "build": "pnpm run build:stream",
    "build:stream": "turbo --log-order=stream build --filter=\"@mj-biz-apps/*\"",
    "build:generated": "turbo --log-order=stream build --filter=\"@mj-biz-apps/myapp-entities\" --filter=\"@mj-biz-apps/myapp-actions\"",
    "build:packages": "turbo --log-order=stream build --filter=\"@mj-biz-apps/myapp-*\"",
    "test": "turbo --log-order=stream test --filter=\"@mj-biz-apps/myapp-*\"",
    "mj:migrate": "mj migrate --schema __mj_BizAppsMyApp --dir ./migrations",
    "mj:codegen": "mj codegen",
    "mj:migrate:convert": "mj migrate convert --source-dir ./migrations --output-dir ./migrations-pg --schema __mj_BizAppsMyApp",
    "change": "changeset",
    "version": "changeset version && node scripts/sync-app-version.mjs",
    "version:prepare": "changeset version && node ci/sync-mj-app-version.mjs && pnpm install --lockfile-only",
    "lint:entityfield-drift": "node .github/scripts/check-entityfield-drift.mjs",
    "lint:entityfield-drift:test": "node .github/scripts/check-entityfield-drift.mjs --self-test",
    "check:published-mj": "node scripts/check-against-published-mj.mjs",
    "check:release-seed": "node scripts/check-release-seed-coverage.mjs",
    "check:release-seed:test": "node --test scripts/check-release-seed-coverage.spec.mjs",
    "check:seed-cadence": "node scripts/check-release-seed-cadence.mjs",
    "check:seed-cadence:test": "node --test scripts/check-release-seed-cadence.spec.mjs",
    "lint:paths-touched:test": "node --test scripts/check-paths-touched.spec.mjs",
    "sync-app-version:test": "node --test scripts/sync-app-version.spec.mjs",
    "lint:release-pushes": "node scripts/check-release-pushes.mjs",
    "lint:release-pushes:test": "node --test scripts/check-release-pushes.spec.mjs"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/MemberJunction/bizapps-myapp"
  },
  "packageManager": "pnpm@10.33.0",
  "devDependencies": {
    "@changesets/cli": "^2.29.8",
    "@memberjunction/cli": "^6.1.6",
    "@types/node": "^22.10.0",
    "simple-git": "^3.31.1",
    "tsc-alias": "^1.8.16",
    "turbo": "^2.7.3",
    "typescript": "^5.9.3",
    "zod": "^3.25.76"
  }
}
```

> [!IMPORTANT]
> **Keep `@changesets/cli` on `^2.29.8`**: `version.yml` uses `changesets/action@v1` (`v1.9.0`), which requires Changesets CLI v2 and supports the `branch: main` input that creates the release PR directly against `main`.

### 4.3 `pnpm-workspace.yaml` and `.npmrc`
Ensure `pnpm-workspace.yaml` at the repo root has `linkWorkspacePackages: true` and the standard `onlyBuiltDependencies` list:

```yaml
linkWorkspacePackages: true

onlyBuiltDependencies:
  - '@apollo/protobufjs'
  - '@google/genai'
  - '@parcel/watcher'
  - '@zoom/rtms'
  - browser-tabs-lock
  - core-js
  - core-js-pure
  - esbuild
  - isolated-vm
  - lmdb
  - msgpackr-extract
  - oracledb
  - protobufjs
  - rete
  - sharp
  - tesseract.js

packages:
  - 'packages/*'
```

And `.npmrc`:
```ini
package-manager-strict=false
strict-peer-dependencies=false
auto-install-peers=true
```

### 4.4 Per-Package `package.json` Requirements Enforced by CI
Every publishable package under `packages/*` (`"private": true` packages like `IntegrationTests` are exempt) is checked by CI for:
1. **`packages/Entities/package.json` is the version & MJ floor anchor**: `ci/sync-mj-app-version.mjs` and `scripts/sync-app-version.mjs` read `.version` and `.peerDependencies["@memberjunction/core"]` from `packages/Entities/package.json` to derive `mj-app.json`.
2. **`files` and entrypoint (`validate-package-files.sh`)**: Every publishable package must declare `"files": ["dist"]` (or `"dist/**"`) and `"main"` / `"types"` pointing into `./dist/...`.
3. **`repository.url` (`validate-package-repository.sh`)**: Every publishable package must have `"repository": { "type": "git", "url": "https://github.com/MemberJunction/<repo-name>", "directory": "packages/<Dir>" }` for npm OIDC provenance verification.
4. **Caret `peerDependencies` (`check-dependency-model.mjs`)**: `@memberjunction/*` and other apps' `@mj-biz-apps/*` packages must be declared in `peerDependencies` (and `devDependencies`) using a caret range (`^6.1.6`), **never** in `dependencies`. Intra-repo sibling packages (`@mj-biz-apps/<this-app>-*`) go in `dependencies` with exact versions.

---

## 5. GitHub App & npm OIDC Setup (One-Time Prerequisite)

### 5.1 Grant the Repo Access to `blue-cypress-ci-bot`
The workflows authenticate using the `MemberJunction` org's GitHub App (`blue-cypress-ci-bot`, Integration ID `4705146`):
1. In the `MemberJunction` GitHub Organization settings:
   - Under **Settings → GitHub Apps → `blue-cypress-ci-bot`**, ensure the new repository is included in the App's repository access list.
   - Under **Settings → Actions → Variables / Secrets**, ensure `APP_CLIENT_ID` (org variable) and `APP_PRIVATE_KEY` (org secret) are shared with the repository.
2. Once `.github/workflows/verify-release-app-token.yml` is pushed to the repo, go to **Actions → Verify the release App token → Run workflow**. Confirm it turns green and outputs:
   - `app: blue-cypress-ci-bot`
   - `grants requested: contents: write, pull-requests: write`
3. Releases are cut from **Actions → Cut the Release → Run workflow** once a Version Packages PR is open and green. The same App token does that merge, so if step 2 is green this works too.

### 5.2 Bootstrap Packages on npm & Enable OIDC Trusted Publishing
Because npm OIDC cannot create a brand-new package on first publish (and `rr: packages on npm` blocks the release PR if any non-private package is missing from npm):
1. For each publishable `@mj-biz-apps/*` package in `packages/*/package.json` that does not exist on npm yet, an `@mj-biz-apps` npm org owner runs once:
   ```bash
   npx setup-npm-trusted-publish @mj-biz-apps/<package-name>
   ```
2. On npmjs.com, open `https://www.npmjs.com/package/@mj-biz-apps/<package-name>/access` → **Trusted Publisher** and configure:
   - **Organization / User**: `MemberJunction`
   - **Repository**: `<repo-name>` (e.g., `bizapps-myapp`)
   - **Workflow filename**: `publish.yml`

---

## 6. Exact GitHub Repository Rulesets (Minus Required Reviewer)

First, ensure `next` is set as the repository's **default branch** (`Settings → General → Default branch → next`).

`bizapps-common` uses three active branch rulesets (`protect-next`, `protect-main`, `protect-main-checks`). Below is the **exact same configuration minus the required human reviewer** (`required_approving_review_count: 0`, `require_extra_approval_for_unattributed_changes: false`, `require_code_owner_review: false`, `required_reviewers: []`):

### 6.1 Summary of the 3 Rulesets

| Ruleset Name | Target Branch | Bypass Actors | Rules Enforced | Required Status Check Contexts (GitHub Actions `15368`) |
|---|---|---|---|---|
| **`protect-next`** | `~DEFAULT_BRANCH` (`next`) | • `blue-cypress-ci-bot` App (`pull_request` mode)<br>• Org Admin Teams (`always`) | • Block branch deletion<br>• Block force pushes (`non_fast_forward`)<br>• Require Pull Request (`0` approvals required, dismiss stale reviews on push)<br>• Require status checks (`strict: true` — branch must be up-to-date) | • `migration naming`<br>• `migration changeset`<br>• `script references`<br>• `Parse migrations (T-SQL syntax check)` |
| **`protect-main`** | `refs/heads/main` | • Repository Admin role (`pull_request` mode)<br>• `blue-cypress-ci-bot` App (`pull_request` mode)<br>• Org Admin Teams (`always`) | • Require Pull Request (`0` approvals required, dismiss stale reviews on push) | *(Handled in `protect-main-checks`)* |
| **`protect-main-checks`** | `refs/heads/main` | • Repository Admin role (`pull_request` mode)<br>• Org Admin Teams (`always`) | • Block branch deletion<br>• Block force pushes (`non_fast_forward`)<br>• Require status checks (`strict: false`) | • `rr: changesets`<br>• `rr: minor bump`<br>• `rr: metadata shipped`<br>• `rr: pg counterparts`<br>• `rr: release base current`<br>• `rr: migration immutability`<br>• `rr: packages on npm`<br>• `build` |

> [!NOTE]
> **Why `blue-cypress-ci-bot` is a `pull_request`-mode bypass actor on `protect-main`**: `release.yml` ("Cut the Release") merges the Version Packages PR with the App token. In `bizapps-common` that bypass is what lets the App skip the one-approval rule; with `0` approvals here it is kept so the rulesets stay identical to upstream and still work if a reviewer requirement is added later. Bypass is per-ruleset, which is why `protect-main` holds **only** the `pull_request` rule and `protect-main-checks` holds `deletion`, `non_fast_forward` and the required checks: the App is deliberately **not** a bypass actor on `protect-main-checks`, so a dispatch can never merge a release that fails the gate, nor delete or force-push `main`.
>
> **Why `blue-cypress-ci-bot` is a `pull_request`-mode bypass actor on `protect-next`**: When `publish.yml` finishes publishing to npm on `main`, it uses the App token to open `release-back-merge/vX.Y.Z` → `next` and immediately runs `gh pr merge "$PR_URL" --merge --delete-branch`. Giving `blue-cypress-ci-bot` `pull_request`-mode bypass on `protect-next` allows it to merge that back-merge PR immediately without waiting for `next` status checks to finish, while still forbidding direct pushes to `next`.

---

### 6.2 One-Shot CLI Commands to Create All 3 Rulesets (`gh api`)

You can create the exact three rulesets on any `MemberJunction/<repo>` using the GitHub CLI (`gh`).

```bash
# Set your target repository:
REPO="MemberJunction/bizapps-myapp"

# 0. Ensure `next` is the default branch
gh api -X PATCH "repos/$REPO" -f default_branch="next"
```

#### 1. Create `protect-next` (targets `~DEFAULT_BRANCH`, `0` required reviewers)
```bash
gh api -X POST "repos/$REPO/rulesets" --input - <<'EOF'
{
  "name": "protect-next",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "exclude": [],
      "include": [
        "~DEFAULT_BRANCH"
      ]
    }
  },
  "bypass_actors": [
    {
      "actor_id": 4705146,
      "actor_type": "Integration",
      "bypass_mode": "pull_request"
    },
    {
      "actor_id": 19336784,
      "actor_type": "Team",
      "bypass_mode": "always"
    },
    {
      "actor_id": 20104768,
      "actor_type": "Team",
      "bypass_mode": "always"
    }
  ],
  "rules": [
    {
      "type": "deletion"
    },
    {
      "type": "non_fast_forward"
    },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "required_reviewers": [],
        "require_code_owner_review": false,
        "dismissal_restriction": {
          "enabled": false,
          "allowed_actors": []
        },
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "require_extra_approval_for_unattributed_changes": false,
        "allowed_merge_methods": [
          "merge",
          "squash",
          "rebase"
        ]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          {
            "context": "migration naming",
            "integration_id": 15368
          },
          {
            "context": "migration changeset",
            "integration_id": 15368
          },
          {
            "context": "script references",
            "integration_id": 15368
          },
          {
            "context": "Parse migrations (T-SQL syntax check)",
            "integration_id": 15368
          }
        ]
      }
    }
  ]
}
EOF
```

#### 2. Create `protect-main` (targets `refs/heads/main`, `0` required reviewers)
```bash
gh api -X POST "repos/$REPO/rulesets" --input - <<'EOF'
{
  "name": "protect-main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "exclude": [],
      "include": [
        "refs/heads/main"
      ]
    }
  },
  "bypass_actors": [
    {
      "actor_id": 5,
      "actor_type": "RepositoryRole",
      "bypass_mode": "pull_request"
    },
    {
      "actor_id": 4705146,
      "actor_type": "Integration",
      "bypass_mode": "pull_request"
    },
    {
      "actor_id": 19336784,
      "actor_type": "Team",
      "bypass_mode": "always"
    },
    {
      "actor_id": 20104768,
      "actor_type": "Team",
      "bypass_mode": "always"
    }
  ],
  "rules": [
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "required_reviewers": [],
        "require_code_owner_review": false,
        "dismissal_restriction": {
          "enabled": false,
          "allowed_actors": []
        },
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "require_extra_approval_for_unattributed_changes": false,
        "allowed_merge_methods": [
          "merge",
          "squash",
          "rebase"
        ]
      }
    }
  ]
}
EOF
```

#### 3. Create `protect-main-checks` (targets `refs/heads/main`, enforces `rr:*` + `build`)
```bash
gh api -X POST "repos/$REPO/rulesets" --input - <<'EOF'
{
  "name": "protect-main-checks",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "exclude": [],
      "include": [
        "refs/heads/main"
      ]
    }
  },
  "bypass_actors": [
    {
      "actor_id": 5,
      "actor_type": "RepositoryRole",
      "bypass_mode": "pull_request"
    },
    {
      "actor_id": 19336784,
      "actor_type": "Team",
      "bypass_mode": "always"
    },
    {
      "actor_id": 20104768,
      "actor_type": "Team",
      "bypass_mode": "always"
    }
  ],
  "rules": [
    {
      "type": "deletion"
    },
    {
      "type": "non_fast_forward"
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          {
            "context": "rr: changesets",
            "integration_id": 15368
          },
          {
            "context": "rr: minor bump",
            "integration_id": 15368
          },
          {
            "context": "rr: metadata shipped",
            "integration_id": 15368
          },
          {
            "context": "rr: pg counterparts",
            "integration_id": 15368
          },
          {
            "context": "rr: release base current",
            "integration_id": 15368
          },
          {
            "context": "rr: migration immutability",
            "integration_id": 15368
          },
          {
            "context": "rr: packages on npm",
            "integration_id": 15368
          },
          {
            "context": "build",
            "integration_id": 15368
          }
        ]
      }
    }
  ]
}
EOF
```

> [!TIP]
> **Actor & Integration IDs Reference (`MemberJunction` GitHub Org)**:
> - `integration_id: 15368` — GitHub Actions (global across GitHub)
> - `actor_id: 4705146` (`Integration`) — `blue-cypress-ci-bot` GitHub App
> - `actor_id: 5` (`RepositoryRole`) — Repository Admin role
> - `actor_id: 19336784` & `20104768` (`Team`) — MemberJunction admin teams

---

## 7. Verification Checklist After Setup

1. **Run local self-tests before opening the setup PR**:
   ```bash
   node .github/scripts/check-dependency-model.mjs --self-test
   node .github/scripts/check-dependency-model.mjs
   node .github/scripts/check-caret-pins.mjs --self-test
   node .github/scripts/check-fk-indexes.mjs --self-test
   node .github/scripts/check-fk-indexes.mjs --dir ./migrations
   ./.github/scripts/check-script-references.sh
   ./.github/scripts/validate-package-repository.sh
   ./.github/scripts/validate-package-files.sh
   node --test .github/scripts/__tests__/*.spec.mjs
   node --test scripts/*.spec.mjs
   pnpm run lint:release-pushes
   ```
2. **Merge the CI/CD setup PR to `next` and `main` BEFORE activating the rulesets** (or use admin bypass for the initial bootstrap PR), because required status checks on `next` and `main` can only report once the workflow files exist on the target branch.
3. **Run `Verify the release App token`** from the **Actions** tab (`workflow_dispatch`) and confirm it succeeds.
4. **Apply the 3 rulesets** via the `gh api` commands in §6.2 and verify them with:
   ```bash
   gh api "repos/$REPO/rulesets" --jq '.[] | {id, name, enforcement}'
   ```
5. **Confirm every PR context reports**: open a throwaway PR to `next` and check that `migration naming`, `migration changeset`, `migration immutability`, `script references`, `Parse migrations (T-SQL syntax check)`, `build`, `repo: guards`, `Clean-room EntityField drift`, `Foreign Key Index Coverage (MC4)` and (when a `package.json` changed) `caret pins (advisory)` all appear.
6. **First release**: merge a changeset to `next`, wait for `version.yml` to open the Version Packages PR, then run **Actions → Cut the Release**. `publish.yml` then publishes, tags, and opens the back-merge into `next`.


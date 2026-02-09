# MemberJunction Installation Friction Report (v3.4.0, Windows)

> **Scope**: This report captures friction encountered during a **clean install using the official stable release ZIP (v3.4.0)** on **Windows 10**, following the **"Installation in Minutes / Quick Download"** docs, through **MJAPI + MJExplorer running successfully**.
>
> **Excluded**: Dev-branch/Git repo issues, post-install app development, dashboards, and deeper auth/provider administration beyond what was required to get Explorer running.
>
> **Status**: Living document — expand as more friction is discovered.

---

## Environment

- **OS**: Windows 10 (local machine)
- **Install method**: Official MemberJunction distribution ZIP (stable v3.4.0)
- **Database**: Local SQL Server (SQL authentication)
- **Shell / Tools**: PowerShell, SSMS
- **Node**: v22.x (docs say Node 20+)

---

## Executive Summary

Even when following the quick guide step-by-step, multiple steps required **implicit knowledge** or **trial-and-error** not explicitly captured in docs. The highest-impact friction areas encountered were:

| Category | Severity | What happened |
|---|---|---|
| SQL Server setup | High | SSMS usage and security model assumed; no validation checkpoints |
| Config surface area | High | Multiple config files, overlapping env vars, a filename mismatch in the docs, and no clear "minimal local" template |
| CodeGen reliability / messaging | High | "AFTER command npm failed" looked fatal; MJAPI later failed due to missing generated package until CodeGen rerun |
| Windows compatibility | High | MJExplorer start script used Unix env-var syntax; blocked startup on Windows until patched |
| Order of operations | Medium | Steps not strongly sequenced; running them out of order caused failures that didn't point to the root cause |
| Success checkpoints | Medium | Limited "you're good if you see X" indicators after major steps |
| Dependency security noise | Low | `npm install` reported many vulnerabilities with no guidance on what to do |

---

## Detailed Friction Points

### 1) SSMS / SQL Server Tooling Is Assumed

**Where**: Before MJ setup can begin.

**What happened**
- Docs assume SSMS is already installed and the user is comfortable creating DBs/logins/users.
- Time was lost getting SSMS set up again and recreating the database cleanly.

**Recommendation**
- Add a short **"SQL Server Tooling"** prerequisite subsection:
  - SSMS download link
  - Required SQL Server version callout (docs state SQL Server 2022+)
  - A minimal "connect to server / create database" checklist

---

### 2) SQL Setup Scripts Lack Idempotency and Validation

**Where**: "SQL Server Setup" section.

**What happened**
- The docs do provide T-SQL scripts for creating logins (in `master`) and users (in the target DB), and the instructions do state which context to use. However, in practice the friction was:
  - The scripts are not idempotent — running them twice (e.g., after a failed first attempt) errors on `CREATE LOGIN` / `CREATE USER` if they already exist.
  - No validation step is provided to confirm the setup worked.
  - The context switch from `master` to the target DB is easy to miss in a copy-paste flow, especially for users less familiar with SQL Server's login-vs-user model.
- The docs also mention the `__mj` schema (warning users not to have an existing one), but this is buried in a dense paragraph and easy to overlook.

**Recommendation**
- Improve the existing SQL scripts with `IF NOT EXISTS` guards so they are safe to re-run.
- Add a validation query and an explicit gate after the script:
  ```sql
  USE [YourMemberJunctionDB];
  SELECT name, type_desc
  FROM sys.database_principals
  WHERE name IN ('MJ_CodeGen','MJ_Connect');
  ```
  "**Do not continue** until both show up."
- Give the `__mj` schema warning its own callout or bullet rather than embedding it in a paragraph:
  > If reinstalling into an existing SQL Server instance, a leftover `__mj` schema from a prior attempt can cause silent failures. Drop and recreate the target database for a clean start.

---

### 3) Configuration Files and Variable Names Are Confusing

**Where**: "Initialize database" + later run steps.

**What happened**
- Multiple config surfaces exist and it isn't obvious which is authoritative:
  - `.env`
  - `mj.config.cjs`
  - `install.config.json`
  - `apps/MJExplorer/src/environments/environment.ts` (and `environment.development.ts`)
- The install guide (Step 3) shows both config-file-style keys and `.env` variables in the same block with no clear visual separation or labels indicating which file each belongs to.
- Overlapping settings (DB + auth + ports) led to uncertainty about what actually drives MJAPI vs MJExplorer.
- Auth examples for both Entra and Auth0 are shown side by side with no "choose one" guidance.

**Documentation bug**: The install guide references `mj.config.js` (Step 3), but the actual file in the repository is `mj.config.cjs`. A user following the docs literally would create the wrong file.

**Trust Server Certificate**: The docs do include `dbTrustServerCertificate: Y` and `DB_TRUST_SERVER_CERTIFICATE=Y` in the config example, but there is no callout explaining *when* this is needed. For most local SQL Server installs (non-Azure), this setting is required. It should get its own note rather than being one line among many.

**What we actually changed to get a clean local run**
- `.env` (DB + GraphQL + auth values)
- `apps/MJExplorer/src/environments/environment.ts`:
  - `GRAPHQL_URI: http://localhost:4000/`
  - `REDIRECT_URI: http://localhost:4200/`
- Both `environment.ts` and `environment.development.ts` must have matching values — this is not stated in the docs.

**Recommendation**
- Fix the filename: `mj.config.js` → `mj.config.cjs` in the docs.
- Add a **minimal "local dev" config template** showing only what's required to:
  - connect to local SQL Server
  - start MJAPI
  - start MJExplorer
- Visually separate the config-file block from the `.env` block and label each clearly.
- Add a "Choose Your Auth Provider" note: configure Entra OR Auth0, not both.
- Document config precedence (even a simple statement like: "MJAPI reads `.env`; Explorer reads Angular environment files; CLI reads `mj.config.cjs` / environment variables").
- Add a callout for Trust Server Certificate: "Required for most local (non-Azure) SQL Server installs."
- Note that `environment.ts` and `environment.development.ts` must stay in sync.

---

### 4) Step 4 (`mj install`) — Unclear Relationship to the Rest of the Flow

**Where**: Install guide Step 4.

**What happened**
- The docs describe a Step 4: `mj install`, which "asks you a series of questions" and references an `install.config.json` file.
- During our install, the relationship between this step and the earlier manual config steps (Step 3) was not clear. Specifically:
  - Does `mj install` replace the need to manually edit `.env` and environment files, or is it in addition to them?
  - Does `mj install` run `npm install`, `mj codegen`, and builds internally, or are those still separate manual steps?
  - What happens if you run `mj install` *after* already completing some of those steps manually?

**Recommendation**
- Clarify in the docs what `mj install` actually does (which steps it automates) and what it expects to already be done.
- If `mj install` handles config generation, say so explicitly and remove or mark the manual `.env` editing as an alternative path.
- If `mj install` does NOT handle everything, list exactly which steps still need to be done manually after it runs.

---

### 5) Order of Operations Is Not Enforced

**Where**: Steps 3-5 of the install guide.

**What happened**
- The guide lists steps but does not strongly enforce sequencing. It is not explicit that:
  - Database must be fully reachable before `mj migrate`
  - `npm install` must complete before `mj codegen`
  - `mj codegen` must succeed and produce `mj_generatedentities` before starting MJAPI
  - MJAPI must be running before starting MJExplorer
- Running steps out of order produced errors that didn't point to the root cause. For example, MJAPI crashed with a missing package error that was actually caused by CodeGen not having been run (or not having completed successfully).

**Recommendation**
- Add a numbered checklist with explicit "do not continue until" gates:
  1. Can connect to DB via SSMS
  2. Logins and users exist (validation query passes)
  3. Config files written and validated
  4. `npm install` completed
  5. `mj codegen` completed and `mj_generatedentities` exists
  6. MJAPI shows "Server ready"
  7. Explorer serves the login page

---

### 6) CodeGen "AFTER commands" Looked Like a Hard Failure

**Where**: `mj codegen`

**What happened**
- CodeGen printed multiple lines like:
  - `COMMAND: "npm" FAILED ... Error: Process exited with code 1`
- Immediately after, CodeGen reported completion/success.
- This was ambiguous: is it safe to ignore or not?

**Recommendation**
- If these are non-fatal, label them as **warnings** (and show which AFTER command failed).
- Save the failing AFTER command output to a log file path the user can share.

---

### 7) MJAPI Failed to Start Due to Missing Generated Package

**Where**: `npm run start:api` (MJAPI)

**What happened**
- MJAPI crashed with a missing package error for `mj_generatedentities`.
- Re-running `mj codegen` fixed it and MJAPI started.

**Recommendation**
- Docs should explicitly state a checkpoint:
  - "Verify `node_modules/mj_generatedentities` exists after CodeGen before starting MJAPI."
- MJAPI should detect this and print an actionable error:
  - "Generated entities missing; run `mj codegen`."
- Consider a `prestart` guard that validates CodeGen outputs.

---

### 8) MJExplorer Startup Broken on Windows (Unix env var syntax)

**Where**: `npm run start` in `apps/MJExplorer`

**What happened**
- Explorer's start script used Unix-style env assignment:
  - `NODE_OPTIONS=--max-old-space-size=8192 ng serve`
- On Windows this fails with:
  - `'NODE_OPTIONS' is not recognized...`

**Fix applied**
- Updated `apps/MJExplorer/package.json` start script to:
  - `cross-env NODE_OPTIONS=--max-old-space-size=8192 ng serve`

**Recommendation**
- Ship this fix in the distribution by default (or use a cross-platform script pattern).
- Audit other package scripts for Unix-only patterns.

---

### 9) Port / Redirect URI Alignment Was Easy to Miss

**Where**: Explorer environment configuration

**What happened**
- To successfully load/auth in Explorer, the configured redirect URI must match the actual Explorer origin.
- We ran Explorer on `http://localhost:4200/` and updated `REDIRECT_URI` accordingly.

**Recommendation**
- Add a single, explicit "Ports" section:
  - MJAPI (GraphQL): `http://localhost:4000/`
  - MJExplorer: `http://localhost:4200/`
  - Redirect URI must match the Explorer origin.

---

### 10) MJAPI / Explorer Start Commands Not Specified

**Where**: Install guide Step 5.

**What happened**
- The docs say "run the project either in a debugger environment like VSCode, or just run it with a node command line" but do not provide the actual commands (`npm run start:api`, `npm run start:explorer`, or `ng serve`).
- No expected output is described. Users don't know what "success" looks like.

**Recommendation**
- Provide explicit start commands for both MJAPI and Explorer.
- Add expected success output, e.g.:
  - MJAPI: "You should see `Server ready on port 4000` in the console"
  - Explorer: "Navigate to `http://localhost:4200` and you should see the login page"

---

### 11) `npm install` Vulnerability Counts Create Anxiety

**Where**: After `npm install`

**What happened**
- `npm install` reported many vulnerabilities (including high/critical).
- Install still worked, but it's alarming with no guidance.

**Recommendation**
- Add a note: vulnerability output is common in large workspaces; do not blindly run `npm audit fix --force` because it can break workspace resolution.

---

### 12) Node Version Guidance Could Be Clearer

**Where**: Prerequisites

**What happened**
- Docs say Node 20+, but this install was performed on Node 22.x.
- The process worked but produced deprecation/experimental warnings.

**Recommendation**
- State **recommended** version (e.g., Node 20 LTS) and a **supported** range.
- Add a one-liner: "Warnings on newer Node versions are expected; proceed unless a step fails."

---

## Patterns Observed

1. Docs are written for users already comfortable with SQL Server + Node/monorepos.
2. Missing validation checkpoints increase uncertainty ("did that really work?").
3. Windows needs first-class support (scripts must be cross-platform).
4. Errors rarely point to the fix (e.g., missing generated entities package → "run CodeGen").
5. The boundary between what `mj install` (Step 4) automates and what the user must do manually is unclear.

---

## Quick-Win Candidates

| Item | Why it matters | Effort |
|---|---|---|
| Use `cross-env` in MJExplorer start script | Unblocks Windows out-of-box | Very low |
| Fix `mj.config.js` → `mj.config.cjs` in docs | Prevents wrong filename | Very low |
| Add DB setup validation query + gates | Prevents downstream cryptic failures | Low |
| Add `IF NOT EXISTS` guards to SQL scripts | Makes scripts safe to re-run | Low |
| Add explicit start commands + expected output | Users know what to run and what success looks like | Low |
| Clarify Step 4 (`mj install`) scope | Reduces confusion about what's manual vs automated | Low |
| Add "minimal local config" templates | Reduces config confusion | Low-Medium |
| Clarify CodeGen AFTER command messaging | Prevents false alarm | Low |

---

## Open Items To Confirm Later

- Are there additional generated artifacts that should be validated after CodeGen (beyond `mj_generatedentities`)?
- Should the distribution default Explorer port be 4200 (and align docs + env templates accordingly)?
- What exactly does `mj install` (Step 4 in the current docs) automate, and how does it relate to the proposed `mj install -t <tag>` CLI flow?

---

**Last updated**: 2026-02-09 (living doc)

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

Even when following the quick guide step-by-step, multiple steps required **implicit knowledge** or **trial-and-error** not explicitly captured in docs. The highest-impact friction areas were:

| Category | Severity | What happened |
|---|---|---|
| SQL Server setup | Medium | SSMS usage and security model assumed; no validation checkpoints |
| Config surface area | Medium | Multiple config files, overlapping env vars, a filename mismatch in the docs, and no clear "minimal local" template |
| Windows compatibility | High | MJExplorer start script used Unix env-var syntax; blocked startup on Windows until patched |

---

## Friction Points

### 1) SSMS / SQL Server Tooling Is Assumed

**Where**: Before MJ setup can begin.

**What happened**
- Docs assume SSMS is already installed and the user is comfortable creating DBs/logins/users.

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

### 4) MJExplorer Startup Broken on Windows (Unix env var syntax)

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

## Documentation Improvements

The following items are not major friction points on their own, but each would improve the install guide with relatively low effort. Many of these surfaced during the install but did not block progress.

| Area | What to add | Why |
|---|---|---|
| **Start commands** | Add explicit commands for MJAPI (`npm run start:api`) and Explorer (`npm run start:explorer`). The current docs say "run the project in VSCode or command line" without specifying the actual commands. | Users shouldn't have to guess the commands |
| **Port / URI section** | Add a short "Default Ports" section listing MJAPI (`http://localhost:4000/`), Explorer (`http://localhost:4200/`), and note that the redirect URI must match the Explorer origin. | Reduces config mismatches |
| **npm audit note** | Add a one-liner: "Vulnerability output is common in large workspaces. Do not run `npm audit fix --force` — it can break workspace resolution." | Prevents users from breaking their install out of caution |
| **Order of operations** | Add a brief note reinforcing the required sequence: `npm install` → `mj codegen` → start MJAPI → start Explorer. A "do not continue until" checklist after each major step would help. | Reduces out-of-order errors |
| **`mj install` (Step 4) scope** | Clarify what the existing `mj install` command automates vs what must still be done manually. Currently the boundary between Step 3 (manual config) and Step 4 (`mj install`) is ambiguous. | Reduces confusion about which steps are manual |
| **CodeGen AFTER messaging** | If CodeGen AFTER commands are non-fatal, label them as warnings in the CLI output and note this in the docs so users know they can proceed. | Prevents false alarm on "npm FAILED" output |
| **Generated package checkpoint** | Add a note: "After `mj codegen`, verify `mj_generatedentities` exists before starting MJAPI." This can also be enforced as a `prestart` guard in the CLI automation. | Prevents the opaque missing-package crash |

---

## Patterns Observed

1. Docs are written for users already comfortable with SQL Server + Node/monorepos.
2. Windows needs first-class support (scripts must be cross-platform).
3. The boundary between what `mj install` (Step 4) automates and what the user must do manually is unclear.

---

## Quick-Win Candidates

| Item | Why it matters | Effort |
|---|---|---|
| Use `cross-env` in MJExplorer start script | Unblocks Windows out-of-box | Very low |
| Fix `mj.config.js` → `mj.config.cjs` in docs | Prevents wrong filename | Very low |
| Add DB setup validation query + gates | Prevents downstream cryptic failures | Low |
| Add `IF NOT EXISTS` guards to SQL scripts | Makes scripts safe to re-run | Low |
| Add explicit start commands in docs | Users know what to run | Low |
| Add "minimal local config" templates | Reduces config confusion | Low-Medium |

---

**Last updated**: 2026-02-10 (living doc)

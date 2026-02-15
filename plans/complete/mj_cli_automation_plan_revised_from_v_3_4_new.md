# MJ CLI Automation Plan: `mj install`

> **Goal:** One command that takes a new user from **release ZIP/tag → working MJAPI + MJExplorer** with the fewest manual steps possible, based on the **actual v3.4.0 Windows install friction** we hit.
>
> **Companion doc:** `member_junction_install_friction_report_draft_new.md`
>
> **Scope of this plan:** User-focused installation (stable release). Not dev-contributor workflows.

---

## What we know from the install we just did

- **Windows support needs first-class treatment** (at least for MJExplorer start scripts).
- **Order matters**: `npm install` → `mj codegen` → start MJAPI → start MJExplorer.
- **CodeGen can look "failed" even when it succeeds** due to AFTER-command messaging.
- **MJAPI can fail hard if generated entities package isn't present** (we fixed by re-running `mj codegen`).
- **MJExplorer failed to start on Windows** until we changed the script to use `cross-env`.
- We did **manual edits** to get a successful run:
  - `apps/MJExplorer/package.json`: change `start` from `NODE_OPTIONS=... ng serve` to `cross-env NODE_OPTIONS=... ng serve`
  - `apps/MJExplorer/src/environments/environment.ts` (and `environment.development.ts` matched): updated ports/URIs
  - root `.env`: DB + auth vars
- The current docs (Step 4) already have a `mj install` command that "asks a series of questions" and references `install.config.json`. The proposed `mj install -t <tag>` flow needs to clarify its relationship to this existing command (see Decisions Needed).

This plan aims to automate or eliminate those manual steps.

---

## Design principles

1. **Fail early with actionable messages.** "Missing X → run Y" rather than stack traces.
2. **Idempotent phases.** Re-running should skip what's already correct.
3. **User mode by default.** Optimize for "download ZIP, run installer, open browser."
4. **Windows-first behavior.** Every script we generate must run in PowerShell/cmd.
5. **Keep privileged DB steps reviewable.** Default to generating SQL scripts; auto-run is optional.
6. **Build on what exists.** Improve existing docs scripts and CLI commands rather than rebuilding from scratch.

---

## Command surface

### Primary command

```bash
npm install -g @memberjunction/cli
mj install -t v3.4.0
```

### Core flags (revised)

| Flag | Description | Default |
|---|---|---|
| `-t, --tag <version>` | Release tag to install | **Required** |
| `--dir <path>` | Target directory | current directory |
| `--yes` | Non-interactive mode with safe defaults | off |
| `--config <path>` | Answers file (install.config.json-like) | none |
| `--db-host <host>` | SQL Server host | `localhost` |
| `--db-port <port>` | SQL Server port | `1433` |
| `--db-name <name>` | DB name | prompted |
| `--trust-cert` | Trust SQL cert (local dev) | off (but recommended) |
| `--api-port <port>` | API port | `4000` |
| `--explorer-port <port>` | Explorer port | `4200` |
| `--skip-db` | Skip DB provisioning/script generation | off |
| `--skip-codegen` | Skip `mj codegen` | off |
| `--skip-start` | Don't start MJAPI/MJExplorer | off |
| `--dry-run` | Print plan without executing | off |
| `--verbose` | Verbose logs | off |
| `--resume` | Resume from last checkpoint | on when state file exists |

### Optional phase targeting

```bash
mj doctor
mj install -t v3.4.0 --phase scaffold
mj install -t v3.4.0 --phase db
mj install -t v3.4.0 --phase config
mj install -t v3.4.0 --phase deps
mj install -t v3.4.0 --phase patch
mj install -t v3.4.0 --phase start
```

---

## Checkpoint / resume

Write `.mj-install-state.json` after each phase.

- If the file exists, the installer **auto-resumes** unless the user passes `--no-resume`.
- Each phase includes a **verification** step; if verification fails, phase re-runs.

---

## Phase 0: Preflight (`mj doctor`)

**Purpose:** Catch predictable failures before doing work.

### Checks (based on what actually mattered)

- Node.js present and meets docs requirement (20+). (We ran 22.x successfully; warn on unsupported, don't block unless <20.)
- npm available.
- SQL Server reachable at `host:port`.
- Database exists (or print `CREATE DATABASE` snippet).
- Ports free: API (default 4000), Explorer (default 4200).
- Confirm write permissions in target dir.

**Output example**

```text
MJ Doctor
---------
[PASS] Node.js v22.12.0 (supported: 20+)
[PASS] npm 10.x
[PASS] SQL reachable: localhost:1433
[PASS] DB exists: MemberJunction
[PASS] Port 4000 available
[PASS] Port 4200 available
[INFO] OS: Windows
```

---

## Phase 1: Fetch + Scaffold

1. Resolve tag to a release asset (ZIP).
2. Download to temp.
3. Extract into `--dir`.
4. Write initial state file.

Notes:
- If target dir is non-empty, require confirmation unless `--yes`.

---

## Phase 2: Database provisioning (script-first)

Default behavior: generate a script (`mj-db-setup.sql`) plus a validation script (`mj-db-validate.sql`).

### Script contents

The generated scripts should **improve upon the existing docs scripts** by adding idempotency guards. The current install guide provides `CREATE LOGIN` / `CREATE USER` statements that will error if run twice. The generated scripts should use `IF NOT EXISTS` checks:

```sql
-- In master context
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'MJ_CodeGen')
    CREATE LOGIN [MJ_CodeGen] WITH PASSWORD = '<prompted>';
```

- Create logins in `master` (with `IF NOT EXISTS`).
- Create users in the target DB (with `IF NOT EXISTS`).
- Grant roles (`db_owner` for CodeGen; reader/writer for Connect).

After user runs it, CLI validates by connecting as both users.

Optional future: auto-run if admin creds are supplied.

---

## Phase 3: Config generation (single source → multiple files)

The install should generate/update the minimal set of files we actually used:

- Root `.env` (MJAPI runtime + CodeGen creds)
- Explorer environment file(s):
  - `apps/MJExplorer/src/environments/environment.ts`
  - `apps/MJExplorer/src/environments/environment.development.ts` (keep in sync)

**Note on existing `mj install`**: The current docs (Step 4) describe a `mj install` command that prompts for configuration and references `install.config.json`. This phase should either wrap or replace that existing flow. See Decisions Needed for the decision that needs to be made here.

### Config file overwrite behavior

If config files already exist (e.g., from a prior run or manual editing):
- Show a diff of what would change.
- Prompt before overwriting (unless `--yes`).
- With `--yes`, overwrite silently.

### Values we confirmed in practice

- API port: `GRAPHQL_PORT=4000`
- Explorer port: `4200`
- DB vars: `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`
- CodeGen vars: `CODEGEN_DB_USERNAME`, `CODEGEN_DB_PASSWORD`
- SQL trust: `DB_TRUST_SERVER_CERTIFICATE=true`
- Enable introspection for local: `ENABLE_INTROSPECTION=true`

Auth vars:
- Keep provider handling simple:
  - If the user chooses Entra/MSAL, write `TENANT_ID` + `WEB_CLIENT_ID` (and any required Explorer equivalents).
  - If the user chooses Auth0, write those keys.
  - If "none", generate placeholders and **do not block install**.

### Explorer env file generation

Based on what we used:

- `REDIRECT_URI: http://localhost:<explorerPort>/`
- `GRAPHQL_URI: http://localhost:<apiPort>/` (note: this is what worked for our Explorer build)
- `GRAPHQL_WS_URI: ws://localhost:<apiPort>/`

(If the preferred long-term API endpoint is `/graphql`, the installer should align both sides explicitly. For now, the plan reflects what worked.)

### Config filename correction

The install guide currently references `mj.config.js`, but the actual file is `mj.config.cjs`. The installer should generate the correct filename (`mj.config.cjs`) regardless of what the docs say, and the docs should be corrected separately.

---

## Phase 4: Dependencies

Run `npm install` at repo root.

- Do **not** block on audit output.
- Print a short, calming note if vulnerabilities are reported:
  > "Vulnerability output is common in large workspaces. Do not run `npm audit fix --force`."

---

## Phase 5: Windows patching (make Explorer start work OOTB)

This is the biggest "quick win" we actually validated.

### What the installer should do on Windows

1. Ensure `cross-env` is available (workspace root dev dependency is fine).
2. Patch `apps/MJExplorer/package.json`:

From:

```json
"start": "NODE_OPTIONS=--max-old-space-size=8192 ng serve"
```

To:

```json
"start": "cross-env NODE_OPTIONS=--max-old-space-size=8192 ng serve"
```

3. (Optional) scan for other scripts that use `FOO=bar command` and offer to patch.

Idempotent: if already patched, do nothing.

---

## Phase 6: Start + smoke checks

Start MJAPI and MJExplorer (unless `--skip-start`).

### Pre-start verification

Before attempting to start MJAPI, verify that `mj_generatedentities` exists in `node_modules/`.

- If missing, print: `"Generated entities package not found. Run 'mj codegen' to generate it."`
- Do **not** auto-retry CodeGen at this stage — the user should run it explicitly so they can see the output and catch any real errors.

### MJAPI

- Start command: whatever the release uses (e.g., `npm run start:api`).
- Timeout: **120 seconds**. MJAPI loads metadata on startup and can be slow the first time.
- Success criteria: look for a "ready" log line OR confirm port 4000 responds.

### Explorer

- Start command: `npm run start:explorer` or workspace equivalent.
- Timeout: **210 seconds**. Angular/Vite compilation on first serve is slow.
- Success criteria: HTTP GET `http://localhost:<explorerPort>/` returns 200.

If either fails, print:
- which phase to re-run
- where logs are
- the most likely fixes (ports in use, generated entities missing, Windows NODE_OPTIONS issue)

If timeout is exceeded without a clear error, print:
- "MJAPI/Explorer did not report ready within X seconds. It may still be starting. Check the console output."

---

## `mj doctor` (support-friendly output)

A diagnostic command users can paste into issues.

Include:
- OS
- node/npm
- DB connectivity
- ports
- config presence (`.env`, `mj.config.cjs`)
- config filename check (warn if `mj.config.js` exists instead of `mj.config.cjs`)
- codegen verification (generated entities present)
- last install tag + timestamp

---

## Implementation roadmap (grounded in what we saw)

### Quick wins (S = small, M = medium)

| Item | Size | Impact |
|---|---|---|
| Windows Explorer start script fix (`cross-env`) | S | High — unblocks all Windows users |
| Fix `mj.config.js` → `mj.config.cjs` in docs | S | High — prevents wrong filename |
| Better CodeGen messaging for AFTER steps (warnings vs errors) | S | Medium — reduces false alarm |
| Install docs: explicit sequencing + success signals | S-M | High — biggest doc improvement |
| Config clarity: minimal local `.env` + Explorer env example | M | High — reduces config confusion |

### Medium term

| Item | Size | Impact |
|---|---|---|
| `mj doctor` | M | High — standalone diagnostic for support |
| `mj install --phase config` generator | M | High — eliminates manual config editing |
| DB script generator with validation | M | High — idempotent scripts + connection test |

### Longer-term

| Item | Size | Impact |
|---|---|---|
| Full `mj install -t <tag>` scaffolder + resume | L-XL | Very high — the end goal |

---

## Integration with existing CLI

The new commands (`mj install -t <tag>`, `mj doctor`) will be added to the existing `@memberjunction/cli` package alongside `mj codegen` and `mj migrate`. Before implementation:

- Audit the current CLI entry point and command registration pattern to ensure the new commands follow the same conventions.
- Determine how the proposed `mj install -t <tag>` relates to the existing `mj install` (Step 4 in the current docs). Options include: extending the existing command with a `-t` flag, replacing it, or wrapping it as one phase in the larger flow.
- Ensure `mj doctor` can run independently (no state file or prior install required).

---

## Decisions needed for implementation

1. **Release asset resolution:** Do we have GitHub Releases consistently for each tag with a ZIP asset, or should the CLI also support a direct URL?
2. **Canonical GraphQL URL:** Explorer worked with `GRAPHQL_URI: http://localhost:4000/` in our run; is the intended canonical endpoint `/graphql`? The installer should enforce one consistent convention.
3. **Migrations step in the ZIP flow:** Does `mj install` always run `mj migrate`, or does the ZIP already contain the expected migrations state? This can be decided based on existing CLI behavior.
4. **Relationship to existing `mj install`:** The current install docs (Step 4) describe an `mj install` command that prompts for configuration and uses `install.config.json`. Does the proposed `mj install -t <tag>` replace this, extend it with a `-t` flag, or wrap it as one phase in a larger flow? This needs to be decided before implementation.

---

*This plan is intentionally grounded in the friction we observed on a successful v3.4.0 Windows install. We can expand it after we validate the same flow on Windows 11 and/or Linux.*

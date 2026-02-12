# MemberJunction Installer — Implementation Outline

> **Purpose:** Authoritative implementation spec for `@memberjunction/installer` and the reworked `mj install` / `mj doctor` CLI commands.
>
> **Supersedes:** `mj_cli_automation_plan_revised_from_v_3_4_new.md` (that document captures the friction-driven reasoning; this one is the build plan).
>
> **Companion docs:**
> - `member_junction_install_friction_report_draft_new.md` — friction findings that motivated this work
> - `complete/proposed-auto-cli-guidelines-draft.md` — original guidelines from stakeholder review

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Frontends (thin)                       │
│                                                          │
│  ┌─────────────┐  ┌───────────────┐  ┌───────────────┐  │
│  │  mj install  │  │  VSCode Ext   │  │  Docker /     │  │
│  │  mj doctor   │  │  (MJ/VSCode)  │  │  CI runner    │  │
│  └──────┬───────┘  └──────┬────────┘  └──────┬────────┘  │
│         │                 │                   │           │
│         └────────────┬────┘───────────────────┘           │
│                      │                                    │
│         ┌────────────▼────────────┐                       │
│         │  @memberjunction/       │                       │
│         │  installer              │                       │
│         │  (headless engine)      │                       │
│         └─────────────────────────┘                       │
└──────────────────────────────────────────────────────────┘
```

The engine is headless and event-driven. Frontends subscribe to events to render progress, handle prompts, and display diagnostics. The engine never writes to stdout directly — all output goes through events.

---

## 1. Package Structure: `@memberjunction/installer`

**Location:** `packages/MJInstaller/` — published to npm as `@memberjunction/installer`.

**Consumers:**
- `packages/MJCLI/` — the `mj install` and `mj doctor` commands import the engine directly.
- `MemberJunction/VSCode` repo — the VS Code extension depends on the published npm package and runs it in the extension-host Node context.
- Docker / CI — headless mode via `--config` + `--yes`.

```
packages/MJInstaller/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                        # Public API exports
│   │
│   ├── InstallerEngine.ts              # Orchestrates phases, emits events
│   │
│   ├── phases/
│   │   ├── PreflightPhase.ts           # Phase A: Node, disk, ports, OS
│   │   ├── ScaffoldPhase.ts            # Phase B: Version selection, download, extract
│   │   ├── DatabaseProvisionPhase.ts   # Phase C: SQL script generation + validation
│   │   ├── MigratePhase.ts            # Phase D: mj migrate
│   │   ├── ConfigurePhase.ts           # Phase E: .env + environment files
│   │   ├── PlatformCompatPhase.ts      # Phase F: Cross-platform script checks
│   │   ├── DependencyPhase.ts          # Phase G: npm install + npm run build
│   │   ├── CodeGenPhase.ts             # Phase H: mj codegen + artifact validation
│   │   └── SmokeTestPhase.ts           # Phase I: Start MJAPI + Explorer, verify
│   │
│   ├── adapters/
│   │   ├── GitHubReleaseProvider.ts    # List versions, download ZIP assets
│   │   ├── FileSystemAdapter.ts        # Extract ZIP, write files, check paths
│   │   ├── ProcessRunner.ts            # Spawn child processes, capture output
│   │   └── SqlServerAdapter.ts         # TCP connectivity check, run validation queries
│   │
│   ├── models/
│   │   ├── InstallPlan.ts              # Phase sequence + config for a specific install
│   │   ├── InstallConfig.ts            # User-provided config (DB, auth, ports)
│   │   ├── InstallState.ts             # Checkpoint state for resume
│   │   └── Diagnostics.ts              # mj doctor result model
│   │
│   ├── events/
│   │   └── InstallerEvents.ts          # Event type definitions + emitter
│   │
│   └── errors/
│       └── InstallerError.ts           # Typed errors with phase + suggested fix
```

### Public API

```typescript
// index.ts — the full public surface

export class InstallerEngine {
  /** List available MJ release versions from GitHub */
  ListVersions(): Promise<VersionInfo[]>;

  /** Build a plan (dry-run friendly — no side effects) */
  CreatePlan(input: CreatePlanInput): Promise<InstallPlan>;

  /** Execute an install plan, emitting events throughout */
  Run(plan: InstallPlan, options?: RunOptions): Promise<InstallResult>;

  /** Run diagnostics on an existing or target install directory */
  Doctor(targetDir: string, options?: DoctorOptions): Promise<Diagnostics>;

  /** Subscribe to installer events */
  On(event: InstallerEventType, handler: InstallerEventHandler): void;

  /** Resume a previously interrupted install */
  Resume(stateFile: string, options?: RunOptions): Promise<InstallResult>;
}
```

---

## 2. Event API Contract

The engine communicates exclusively through events. This is the contract that CLI, VSCode, Docker, and tests all build against.

### Event Types

```typescript
type InstallerEventType =
  | 'phase:start'      // A phase is beginning
  | 'phase:end'        // A phase completed (success or failure)
  | 'step:progress'    // Progress within a phase (e.g., "Downloading... 45%")
  | 'log'              // Informational message
  | 'warn'             // Non-fatal warning
  | 'error'            // Error (may or may not be fatal)
  | 'prompt'           // Engine needs user input
  | 'diagnostic';      // Doctor check result

interface PhaseStartEvent {
  Type: 'phase:start';
  Phase: PhaseId;
  Description: string;
}

interface PhaseEndEvent {
  Type: 'phase:end';
  Phase: PhaseId;
  Status: 'completed' | 'failed' | 'skipped';
  DurationMs: number;
  Error?: InstallerError;
}

interface StepProgressEvent {
  Type: 'step:progress';
  Phase: PhaseId;
  Message: string;
  Percent?: number;        // 0-100 if known
}

interface LogEvent {
  Type: 'log';
  Level: 'info' | 'verbose';
  Message: string;
}

interface WarnEvent {
  Type: 'warn';
  Message: string;
  Phase?: PhaseId;
}

interface PromptEvent {
  Type: 'prompt';
  PromptId: string;
  PromptType: 'input' | 'confirm' | 'select';
  Message: string;
  Choices?: { Label: string; Value: string }[];
  Default?: string;
  Resolve: (answer: string) => void;   // Frontend calls this with the user's answer
}

interface DiagnosticEvent {
  Type: 'diagnostic';
  Check: string;
  Status: 'pass' | 'fail' | 'warn' | 'info';
  Message: string;
  SuggestedFix?: string;
}
```

### How frontends use events

**CLI (terminal):**
- `phase:start` → start an `ora` spinner
- `phase:end` → spinner.succeed() or spinner.fail()
- `step:progress` → update spinner text
- `log` → `console.log` (or skip if not `--verbose`)
- `prompt` → render with `@inquirer/prompts`, call `event.Resolve(answer)`
- `diagnostic` → print `[PASS]`/`[FAIL]` lines

**VSCode Extension:**
- `phase:start` → show progress notification
- `step:progress` → update progress bar
- `prompt` → show input box / quick pick dialog, call `event.Resolve(answer)`
- `diagnostic` → populate a webview panel

**Docker / CI:**
- All prompts answered by `--config` file + `--yes` flag
- `prompt` events auto-resolve from config; if no answer available, fail with a clear message

---

## 3. Error Types

```typescript
class InstallerError extends Error {
  Phase: PhaseId;
  Code: string;
  SuggestedFix: string;

  constructor(phase: PhaseId, code: string, message: string, suggestedFix: string) {
    super(message);
    this.Phase = phase;
    this.Code = code;
    this.SuggestedFix = suggestedFix;
  }
}

// Example instances:
// new InstallerError('preflight', 'NODE_VERSION_LOW',
//   'Node.js 20.1.0 found, but >= 22 is required (24 recommended).',
//   'Download Node.js 22 LTS (or 24) from https://nodejs.org')
//
// new InstallerError('codegen', 'GENERATED_ENTITIES_MISSING',
//   'mj_generatedentities not found after CodeGen.',
//   'Run "mj codegen" manually and check for errors in the output.')
//
// new InstallerError('smoke_test', 'API_TIMEOUT',
//   'MJAPI did not report ready within 120 seconds.',
//   'Check the MJAPI console output for errors. Common cause: database connectivity issues.')
```

---

## 4. Phases (Detailed)

### Phase A — Preflight

**Purpose:** Catch predictable failures before downloading or modifying anything.

**Checks:**

| Check | Pass Criteria | Failure Behavior |
|---|---|---|
| Node.js version | >= 22 (hard minimum); recommend 24 if available | Hard stop with download link |
| npm available | `npm --version` succeeds | Hard stop |
| Disk space | >= 2 GB free in target dir | Hard stop |
| Ports available | 4000 and 4200 (or configured ports) not in use | Warn (don't block — user may intend to stop existing processes) |
| SQL Server reachable | TCP connection to host:port succeeds | Warn with connection details; hard stop only if `--skip-db` not set |
| Target DB exists | Query `sys.databases` | Warn and print `CREATE DATABASE` snippet if missing |
| OS detection | Identify Windows / macOS / Linux | Store for Phase F |
| Write permissions | Can write to target directory | Hard stop |

**Version policy:** Node >= 22 is the hard minimum today. If Node 24 is detected, emit an `info` diagnostic recommending it. When MJ formally raises the minimum (likely to 24 for a future release), the constant changes in one place. The engine should also read a `nodeVersion` field from the release manifest if one is included in the ZIP, falling back to the hardcoded default.

### Phase B — Version Selection + Scaffold

**Steps:**
1. If `-t <tag>` provided, resolve to a GitHub release asset URL.
2. If no tag, call `ListVersions()` and emit a `prompt` event for the user to select.
3. Download ZIP to a temp directory (emit `step:progress` with download percentage).
4. Extract into `--dir` (default: current directory).
5. If target dir is non-empty, emit a `prompt` (confirm overwrite) unless `--yes`.
6. Write initial `.mj-install-state.json`.

**Error handling:**
- Tag not found → list available tags, suggest closest match.
- Network failure → print manual download URL as fallback.

### Phase C — Database Provisioning

**Default behavior:** Generate SQL scripts, do not auto-execute.

**Scripts generated:**
- `mj-db-setup.sql` — idempotent (all `IF NOT EXISTS` guarded):
  - Create logins in `master`
  - Create users in target DB
  - Grant roles
- `mj-db-validate.sql` — validation queries

**Flow:**
1. Emit `prompt` for DB credentials (or read from `--config`).
2. Generate scripts with user-provided values.
3. Save scripts to target directory.
4. Emit `prompt`: "Run the script in SSMS, then press Enter to validate."
5. Validate by connecting as `MJ_CodeGen` and `MJ_Connect`.
6. If validation fails, emit error with specific fix.

**Idempotent:** Safe to re-run. `IF NOT EXISTS` guards on all creates.

### Phase D — Migrate

**Steps:**
1. Run `mj migrate` using the release's migration files.
2. Validate that the `__mj` schema and baseline tables exist.

**Notes:**
- If the database already has the `__mj` schema at the expected version, skip.
- Forward compatibility: SQL Server 2025 may introduce new features (e.g., native JSON columns). Migrations should use standard T-SQL that works across 2022 and 2025.

### Phase E — Configure

**Purpose:** Generate all config files from a single prompt flow.

**Files generated/updated:**
- Root `.env` (MJAPI + CodeGen credentials, ports, auth)
- `mj.config.cjs` (CLI configuration — note: correct filename, not `.js`)
- Explorer environment files:
  - `apps/MJExplorer/src/environments/environment.ts`
  - `apps/MJExplorer/src/environments/environment.development.ts`
  - Both must have matching values.

**Prompt flow:**
1. DB connection details (host, port, name, trust cert)
2. CodeGen credentials
3. MJAPI credentials
4. API port (default 4000)
5. Explorer port (default 4200)
6. Auth provider: Entra / Auth0 / None
7. Auth provider-specific values (conditional on choice)
8. Optional: AI API keys (OpenAI, Anthropic, Mistral)
9. Optional: New user creation

**Config overwrite behavior:**
- If files exist, show diff and prompt before overwriting (unless `--yes`).

**Reuse from existing code:** The current `mj install` command's `.env` template, Zod config schema, and `updateEnvironmentFiles()` method are directly reusable here. Move them into this phase as helpers.

### Phase F — Platform Compatibility

This phase has two distinct concerns, split so that the required fix is never blocked by the optional one.

#### F1 — Cross-Platform Script Fix (required)

**Purpose:** Detect and fix Unix-only env var syntax (`FOO=bar command`) in `package.json` scripts so builds and starts work on Windows.

**Steps:**
1. Scan `package.json` `scripts` sections across the workspace for Unix-only env var syntax.
2. If found on Windows:
   - Ensure `cross-env` is a dev dependency (add if missing).
   - Patch affected scripts to use `cross-env`.
   - Report what was changed.
3. If found on macOS/Linux: no action needed (works natively), but emit a `warn` that these scripts won't work on Windows (useful for CI awareness).

**Idempotent:** If scripts already use `cross-env`, skip.

**CI integration (future):** Add a lint rule or CI check that fails if any `package.json` script uses Unix-only env var syntax. This prevents regressions. Not part of the installer itself, but a complementary deliverable.

#### F2 — Heap Size / `NODE_OPTIONS` (optional, auto-detect)

**Purpose:** Handle `--max-old-space-size` flags in scripts. This is separate from the cross-env fix because the heap-size tweaks may be removed entirely in MJ 4.x.

**Behavior:**
- **Do not add** `--max-old-space-size` to any script that doesn't already have it.
- If a script already contains `--max-old-space-size`, leave it in place (Phase F1 will have already ensured it's cross-platform via `cross-env`).
- If Node >= 24 is detected, emit an `info` diagnostic: "Node 24 has improved memory defaults. The `--max-old-space-size` flag in Explorer's start script may no longer be necessary. You can remove it if memory usage is acceptable without it."
- Per stakeholder feedback, MJ 4.x may remove these flags entirely. The installer should never be the source of new memory flags.

### Phase G — Dependencies (Install + Build)

**Steps:**
1. Run `npm install` at repo root.
2. If `npm audit` reports vulnerabilities, emit a `warn` event:
   > "Vulnerability output is common in large workspaces. Do not run `npm audit fix --force`."
3. Run `npm run build` at repo root.
4. Capture build output. If build fails, emit error with the last 50 lines of output.

**Note:** The existing `mj install` only ran `npm install` inside `GeneratedEntities/` and used `npm link` for MJAPI/Explorer. The new flow runs `npm install` at the repo root (workspace-aware) which handles all packages. The `npm link` steps from the old code may no longer be needed — verify during implementation.

### Phase H — CodeGen + Validation

**Steps:**
1. Run `mj codegen`.
2. Handle AFTER command output:
   - If AFTER commands fail, emit `warn` (not error).
   - Write full AFTER command output to `./logs/mj-codegen-after.log`.
3. Verify required artifacts exist:
   - `mj_generatedentities` package
   - Generated TypeScript files in expected locations
   - Manifest files
4. If artifacts missing:
   - Retry `mj codegen` **once**.
   - If still missing after retry, hard stop with actionable error.

**Reuse from existing code:** The current `mj install` calls `this.config.runCommand('codegen')`. The engine should invoke CodeGen through the same mechanism or import `@memberjunction/codegen-lib` directly.

### Phase I — Start + Smoke Test

**Pre-start verification:**
- Confirm `mj_generatedentities` exists before starting MJAPI.
- If missing, emit error suggesting `mj codegen`.

**MJAPI:**
- Start command: `npm run start:api` (or release equivalent).
- Timeout: **120 seconds** (metadata loading can be slow on first run).
- Success: "ready" log line detected OR port responds to HTTP.

**Explorer:**
- Start command: `npm run start:explorer`.
- Timeout: **210 seconds** (Angular/Vite first compilation is slow).
- Success: HTTP GET `http://localhost:<explorerPort>/` returns 200.

**On success:**
```
MJ Install Complete
-------------------
[PASS] Database connected
[PASS] Migrations applied
[PASS] CodeGen verified
[PASS] MJAPI running on http://localhost:4000
[PASS] MJExplorer running on http://localhost:4200

Next steps:
  1. Open http://localhost:4200 in your browser
  2. Log in with your configured auth provider
```

**On failure:** Emit error with phase to re-run, log locations, and most likely fixes.

---

## 5. Checkpoint / Resume

Write `.mj-install-state.json` after each phase completes:

```json
{
  "Tag": "v3.4.0",
  "StartedAt": "2025-01-15T10:30:00Z",
  "Phases": {
    "preflight": { "Status": "completed", "CompletedAt": "..." },
    "scaffold": { "Status": "completed", "CompletedAt": "..." },
    "database": { "Status": "failed", "Error": "Connection refused", "FailedAt": "..." },
    "migrate": { "Status": "pending" },
    "configure": { "Status": "pending" },
    "platform": { "Status": "pending" },
    "dependencies": { "Status": "pending" },
    "codegen": { "Status": "pending" },
    "smoke_test": { "Status": "pending" }
  }
}
```

- `Run()` auto-detects the state file and resumes from the first non-completed phase.
- `--no-resume` flag forces a fresh start.
- Failed phases re-run from the beginning of that phase.

---

## 6. CLI Command Changes

### `mj install` (reworked)

```
packages/MJCLI/src/commands/install/index.ts
```

The command becomes a thin wrapper:

```typescript
export default class Install extends Command {
  static description = 'Install MemberJunction from a release';

  static flags = {
    tag: Flags.string({ char: 't', description: 'Release tag (e.g., v4.0.0)' }),
    dir: Flags.string({ description: 'Target directory', default: '.' }),
    yes: Flags.boolean({ description: 'Non-interactive mode' }),
    config: Flags.string({ description: 'Config file path' }),
    'dry-run': Flags.boolean({ description: 'Show plan without executing' }),
    verbose: Flags.boolean({ char: 'v', description: 'Verbose output' }),
    'skip-start': Flags.boolean({ description: 'Skip MJAPI/Explorer startup' }),
    'skip-db': Flags.boolean({ description: 'Skip database provisioning' }),
    legacy: Flags.boolean({ description: 'Run legacy ZIP-style installer (deprecated)', hidden: true }),
    'no-resume': Flags.boolean({ description: 'Ignore checkpoint, start fresh' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Install);

    if (flags.legacy) {
      // Run the old interactive installer for transition period
      return this.RunLegacyInstall();
    }

    const engine = new InstallerEngine();

    // Wire up events to CLI output
    engine.On('phase:start', (e) => spinner.start(e.Description));
    engine.On('phase:end', (e) => e.Status === 'completed' ? spinner.succeed() : spinner.fail());
    engine.On('prompt', (e) => this.HandlePrompt(e));
    engine.On('log', (e) => this.log(e.Message));
    // ... etc

    // Build and run the plan
    const plan = await engine.CreatePlan({ Tag: flags.tag, Dir: flags.dir, ... });

    if (flags['dry-run']) {
      this.log(plan.Summarize());
      return;
    }

    await engine.Run(plan);
  }
}
```

**Behavior:**
- `mj install` (no tag) → calls `ListVersions()` to fetch available releases from GitHub, displays them in a numbered list (most recent first), and emits a `prompt` event for the user to select a version. After selection, proceeds with the full install flow.
- `mj install -t v4.0.0` → skips version selection entirely, resolves the tag to a GitHub release asset, and installs that specific release directly.
- `mj install --legacy` → runs the old ZIP-style interactive installer for a short transition period. This mode does **not** fetch releases from GitHub or download tags — it only supports the existing local-ZIP-based flow. Hidden flag, deprecated after 1-2 releases, then removed.
- `mj install --dry-run` → shows the plan without executing

### `mj doctor` (new)

```
packages/MJCLI/src/commands/doctor/index.ts
```

```typescript
export default class Doctor extends Command {
  static description = 'Diagnose MemberJunction installation';

  static flags = {
    dir: Flags.string({ description: 'Target directory to diagnose', default: '.' }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed output' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Doctor);
    const engine = new InstallerEngine();

    engine.On('diagnostic', (e) => {
      const icon = { pass: '[PASS]', fail: '[FAIL]', warn: '[WARN]', info: '[INFO]' }[e.Status];
      this.log(`${icon} ${e.Message}`);
    });

    const result = await engine.Doctor(flags.dir);

    if (result.HasFailures) {
      this.log('\nSuggested fixes:');
      result.Failures.forEach(f => this.log(`  - ${f.SuggestedFix}`));
    }
  }
}
```

**Checks:**
- OS, Node.js version, npm version
- DB connectivity + login validation
- Port availability
- Config file presence (`.env`, `mj.config.cjs`)
- Config filename check (warn if `mj.config.js` exists instead of `.cjs`)
- CodeGen artifacts present (`mj_generatedentities`)
- Last install state (tag + timestamp from `.mj-install-state.json`)

---

## 7. VSCode Extension Integration

**Repository:** `github.com/MemberJunction/VSCode`

**Dependency:** `@memberjunction/installer` (runs in extension-host Node context)

**Integration pattern:**
1. Extension imports `InstallerEngine` from the published package.
2. Subscribes to events and renders them in VS Code UI:
   - `phase:start` / `phase:end` → progress notification
   - `step:progress` → progress bar
   - `prompt` → VS Code input box / quick pick
   - `diagnostic` → webview panel
   - `error` → error notification with action buttons
3. Commands registered in VS Code:
   - "MJ: Install MemberJunction" → wizard UI
   - "MJ: Run Doctor" → diagnostic panel
   - "MJ: Resume Install" → resume from checkpoint

**Implementation note:** The event API contract (Section 2) is the interface boundary. The extension team can build against it as soon as it stabilizes in Milestone 1.

---

## 8. Docker Support

### Dev/Test Docker Compose

```
docker/install-test/
├── docker-compose.yml
├── Dockerfile.installer        # Node image + MJ CLI
├── install.config.json         # Pre-filled config for headless install
└── init-db.sql                 # Create target database on startup
```

**Compose services:**

| Service | Image | Purpose |
|---|---|---|
| `sqlserver` | `mcr.microsoft.com/mssql/server:2022-latest` | Database (health check: `SELECT 1`) |
| `mj-install` | Custom (Dockerfile.installer) | Runs `mj install -t <tag> --yes --config install.config.json` |
| `mj-api` | Reuse from `docker/MJAPI/` or start from install dir | MJAPI (depends on install success) |
| `mj-explorer` | Node or nginx | Explorer (depends on API health) |

**Usage:**
```bash
cd docker/install-test
docker compose up
# Full MJ environment running at localhost:4000 (API) and localhost:4200 (Explorer)
```

**Forward compatibility:** Use `mcr.microsoft.com/mssql/server:2025-latest` as an alternate target for testing SQL Server 2025 compatibility. The compose file can accept a build arg to select the SQL Server version.

### Key requirement

The installer engine must run headless with `--config` and `--yes`. All `prompt` events auto-resolve from the config file. If a required prompt has no answer in the config, the engine emits an error (not a hang).

---

## 9. Forward Compatibility

### Node.js

- **Hard minimum today:** Node >= 22.
- **Recommended:** Node 24 (when available as LTS, expected October 2026). If Node 24 is detected, the preflight phase emits an `info` diagnostic acknowledging the recommendation.
- **Approach:** The preflight check reads the minimum Node version from a constant (`MIN_NODE_VERSION = 22`). When MJ formally raises the minimum (likely to 24 for a future release), change the constant. The engine should also check for a `nodeVersion` field in the release manifest (if one is included in the ZIP), allowing different releases to declare different requirements.
- **What to watch for:**
  - `--max-old-space-size` may become unnecessary with Node 24's improved defaults. Phase F2 handles this as an advisory, not a required change.
  - ESM changes in Node 24 may affect module resolution. Test `npm install` and `npm run build` on Node 24 during development.

### SQL Server

- **Baseline:** SQL Server 2022 (this is the version the installer generates scripts for and tests against).
- **Compatibility target:** SQL Server 2025. The installer should not hard-check for a specific SQL Server version — the preflight phase validates connectivity and login permissions, not server version. Standard T-SQL used in migrations is backward- and forward-compatible.
- **What to watch for:**
  - New JSON column types or features in 2025 may be useful for future migrations but should not be required (to maintain 2022 compat).
  - Connection driver (`tedious` / `mssql`) versions may need updates for 2025-specific TLS or auth changes.
  - The Docker Compose setup should test against both 2022 and 2025 images.

---

## 10. Handling Today's `mj install` Code

### What to keep (move into engine)

| Existing code | Where it goes |
|---|---|
| Zod config schema (`configSchema`) | `models/InstallConfig.ts` — extend and reuse |
| `.env` template generation | `phases/ConfigurePhase.ts` |
| `updateEnvironmentFiles()` (regex replace in Angular env files) | `phases/ConfigurePhase.ts` |
| `checkNodeVersion()` | `phases/PreflightPhase.ts` |
| `checkAvailableDiskSpace()` | `phases/PreflightPhase.ts` |
| `verifyDirs()` | `phases/ScaffoldPhase.ts` (post-extract verification) |
| `renameFolderToMJ_BASE()` | `phases/ConfigurePhase.ts` |
| `updateConfigNewUserSetup()` (AST-based mj.config.cjs update) | `phases/ConfigurePhase.ts` |
| Interactive prompt flow | `phases/ConfigurePhase.ts` (via `prompt` events) |
| `this.config.runCommand('codegen')` | `phases/CodeGenPhase.ts` |

### What to drop

- `npm link` for GeneratedEntities/GeneratedActions — the new flow uses `npm install` at repo root (workspace-aware), which handles linking. Verify during implementation and remove if redundant.

### CLI compatibility

- `mj install` = new engine-based install (default). Fetches releases from GitHub (or installs a specific tag with `-t`).
- `mj install --legacy` = old ZIP-style interactive installer. Does **not** download tags or fetch releases — it only works with a local ZIP that the user has already extracted. Hidden flag, deprecated, removed after 1-2 releases.

---

## 11. Milestones

### Milestone 1 — Engine Skeleton + Doctor + Version Listing

**Deliverables:**
- `@memberjunction/installer` package skeleton with event API contract
- `InstallerEngine` class with `ListVersions()`, `CreatePlan()`, and `Doctor()`
- Phase A (Preflight) fully implemented
- Phase B (Scaffold) — version listing and download (extract can follow)
- `mj doctor` CLI command wired to the engine
- Event API contract documented and stable (so VSCode extension team can start)
- `.mj-install-state.json` read/write logic

**Why first:** `mj doctor` is immediately useful on its own. The event API contract enables parallel work on the VSCode extension.

### Milestone 2 — DB + Migrate + Config

**Deliverables:**
- Phase C (Database Provisioning) — script generation + validation
- Phase D (Migrate) — `mj migrate` orchestration + validation
- Phase E (Configure) — config file generation from single prompt flow
- Existing `mj install` code migrated into engine phases

**Parallelism:** Phases C, D, and E are largely independent of each other and can be developed concurrently.

### Milestone 3 — Build + CodeGen + Smoke Tests

**Deliverables:**
- Phase F (Platform Compatibility) — cross-platform script checks
- Phase G (Dependencies) — `npm install` + `npm run build`
- Phase H (CodeGen) — `mj codegen` + artifact validation
- Phase I (Smoke Test) — start MJAPI + Explorer, verify
- Full `mj install -t <tag>` end-to-end flow working
- Checkpoint/resume fully functional

### Milestone 4 — VSCode Extension + Docker CI

**Deliverables:**
- VSCode extension wrapping the installer engine (Install wizard, Doctor panel)
- `docker/install-test/` Docker Compose setup
- CI integration test running the full install in Docker
- Cross-platform script lint rule (optional)

**Note:** VSCode extension skeleton can start during Milestone 2 once the event API is stable. Docker Compose can start during Milestone 3 to serve as the test harness.

---

## 12. Decisions Needed Before Implementation

1. **Release asset resolution:** Do GitHub Releases consistently include a ZIP asset for each tag? Or should `ListVersions()` also support a direct URL for manual download?

2. **Canonical GraphQL URL:** During the v3.4.0 install, Explorer worked with `GRAPHQL_URI: http://localhost:4000/` (root path). Is this the intended convention, or should it be `/graphql`? The installer should enforce one consistent default.

3. **`npm link` still needed?** The old installer used `npm link` to connect GeneratedEntities into MJAPI/Explorer. The new flow runs `npm install` at the workspace root. Need to verify whether workspace linking makes `npm link` redundant.

4. **Existing `mj install` transition period:** How long should `--legacy` be supported? Recommendation: 1-2 releases, then remove.

---

*This outline is the build plan. The companion friction report documents why each decision was made.*

1) Where to put the object model (installer engine)
Create a new package (recommended)

packages/MJInstaller (published as @memberjunction/installer)

Why this is the right place:

CLI + VSCode extension can both call it directly.

Keeps business logic out of command glue code.

Makes Docker/testing easier (one engine, multiple frontends).

Folder sketch

packages/MJInstaller/src/

index.ts (public API)

InstallerEngine.ts (orchestrates phases)

phases/ (each phase in its own file)

adapters/

GitHubReleaseProvider.ts (list versions, download zip)

FileSystem.ts

ProcessRunner.ts

SqlServer.ts

Docker.ts (optional)

models/

InstallPlan.ts

InstallConfig.ts

InstallState.ts

Diagnostics.ts

events/

InstallerEvents.ts (progress + logs)

errors/ (typed errors with “next step” guidance)

Public API shape (simple + high-leverage)

listVersions(): Promise<VersionInfo[]>

createPlan(input): Promise<InstallPlan> (dry-run friendly)

run(plan, options): Promise<InstallResult>

doctor(targetDir, options): Promise<Diagnostics>

Important: make it “headless” + event-driven (so CLI prints to terminal, VSCode shows progress UI, tests can assert events).

2) Reworking mj install (CLI command)
Keep command entry at:

@memberjunction/packages/MJCLI/src/commands/install

But change it so it becomes thin:

parse args

call installer engine

render progress

exit codes

New behavior

mj install (no tag) → fetch versions, show most recent first, user selects

mj install -t v4.0.0 → installs that release

mj install --legacy → runs current ZIP-style interactive installer (for a short transition window)

Suggested flags (keep minimal at first)

-t, --tag <vX.Y.Z>

--dir <path>

--yes

--config <file> (optional)

--dry-run

--verbose

--skip-start / --skip-docker (later)

3) Phases to implement in the installer engine
Phase A — Version selection + scaffold (NEW)

List releases (GitHub tags/releases)

Download ZIP asset for chosen tag

Extract into target dir

Write install.state.json checkpoint

Phase B — Preflight (upgrade mj doctor into engine capability)

Node version check (per Robert: Node 24 min, and document it)

Disk space check

Port checks (4000/4200 defaults)

SQL Server connectivity check (host/port reachable)

OS + shell detection

Clear, actionable “fix it” messages

Phase C — Database provisioning (script-first, opt-in auto-exec)

Generate mj-db-setup.sql (master + db context)

Validate users/logins exist

Optional: run script if admin creds provided (later)

Phase D — Migrate

Run mj migrate (from the extracted release)

Validate expected schemas/tables exist (at least __mj baseline)

Phase E — Configure

Generate .env + explorer environment config from one model

Make auth provider selection explicit (Entra/Auth0/none)

Make redirect/ports consistent

Phase F — Install/build

npm install at repo root

npm run build at repo root

Capture and summarize failures

Phase G — CodeGen + validation

Even if some of your earlier CodeGen issues weren’t perfectly reproducible, the validation step is still worth it (it’s a “guardrail”, not “I struggled”):

run mj codegen

verify required artifacts exist

if missing, show exactly what to do next (or retry once)

Phase H — Start + smoke test

start API

probe GET / or POST /graphql (and accept “auth required” as a pass for connectivity)

start Explorer

verify HTTP 200 on homepage

Phase I — Windows/mac/linux compatibility checks

Instead of hardcoding a Windows patch forever:

add a “scripts are cross-platform” check in CI

if any scripts use Unix-only env var syntax, fail fast with a message pointing to cross-env

(And per Robert: in 4.x you might remove heap-size tweaks entirely — so the installer should avoid adding memory flags by default.)

4) What to do with today’s mj install code
Keep parts that are genuinely useful

From what you already found, the existing ZIP-oriented install does:

prompt/config gathering

writes .env

updates explorer environment values

links GeneratedEntities into MJAPI/MJExplorer

calls mj codegen

That’s still useful logic — just move it into the new library as:

legacyInstall(config) or “Phase Configure/Phase CodeGen helpers”

CLI compatibility strategy

mj install = new scaffolded install

mj install --legacy = current behavior (kept for 1–2 releases, then deprecate)

5) VSCode extension integration plan
Goal

VSCode extension is just a UI wrapper around the same engine.

How it calls the engine (best option)

The extension depends on @memberjunction/installer and runs it in an extension-host node context.

It subscribes to installer events:

phase start/end

step progress

logs

prompts (render in UI)

UI features (incremental)

“Install MJ” wizard

pick version (drop-down from listVersions)

choose folder

fill config

“Doctor” panel

“Upgrade” flow later (same engine + different plan)

6) Docker support

You can treat Docker as a first-class test target without making it the only way.

Two deliverables:

Dev/test docker-compose for repeatable installs (SQL Server + MJ install)

Optional: a “full install” docker image that runs the installer and exposes Explorer/API (nice-to-have but powerful for CI)

Key point: make the installer engine able to run in a container with no UI, using --config and --yes.

7) Proposed work breakdown (practical milestones)
Milestone 1 (fastest value)

New @memberjunction/installer package skeleton

mj install lists versions + downloads/extracts to --dir

mj doctor integrated (Node 24 + port + disk + SQL reachability)

Installer state/checkpoint file

Milestone 2

DB script generation + validation

mj migrate orchestration

Config generation from a single model

Milestone 3

Root npm install + npm run build

mj codegen + artifact validation

Start + smoke tests

Milestone 4

VSCode extension UI wrapper using the installer package

CI: cross-platform script checks + docker-based integration test
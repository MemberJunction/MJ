# @memberjunction/cli

The official command-line interface for MemberJunction (`mj`). Provides a unified entry point for installation, database migrations, code generation, metadata synchronization, Open App lifecycle management, AI & agent harness operations, rubrics, testing, durable work queues, diagnostic bundles, SQL dialect conversion, repo standards enforcement, and multi-repo local development workspaces.

## Architecture

```mermaid
graph TD
    subgraph "@memberjunction/cli (mj)"
        A[CLI Entry Point] --> B[Commands]
        B --> C["Lifecycle: install, update, bundle, bump, clean, dev"]
        B --> D["Database & Code: migrate, codegen, baseline, sql-convert, translate-sql, sql-audit"]
        B --> E["Metadata & Queries: sync, query, querygen, dbdoc, cache, artifacts, user"]
        B --> F["Apps & Quality: app, standards, doctor, diag, explorer, plugin"]
        B --> G["AI, Testing & Ops: ai, agent, harness, rubric, test, queue, usage"]

        A --> M[Hooks]
        M --> N[init]
        M --> O[prerun]
        M --> P2[postrun]
    end

    subgraph "Underlying Engines"
        P["@memberjunction/codegen-lib"]
        Q["@memberjunction/metadata-sync"]
        R["@memberjunction/testing-cli"]
        S["@memberjunction/db-auto-doc"]
        T["@memberjunction/query-gen"]
        U["@memberjunction/ai-cli & ai-agent-harness"]
        V["@memberjunction/open-app-engine & installer"]
        W["@memberjunction/work-queue-engine & diagnostics & standards"]
    end

    D --> P
    E --> Q
    G --> R
    E --> S
    E --> T
    G --> U
    F --> V
    F --> W

    style A fill:#2d6a9f,stroke:#1a4971,color:#fff
    style C fill:#2d8659,stroke:#1a5c3a,color:#fff
    style D fill:#2d8659,stroke:#1a5c3a,color:#fff
    style E fill:#7c5295,stroke:#563a6b,color:#fff
    style F fill:#7c5295,stroke:#563a6b,color:#fff
    style G fill:#b8762f,stroke:#8a5722,color:#fff
```

## Overview

The `mj` CLI is built on the [oclif](https://oclif.io/) framework and delegates each command domain to specialized MemberJunction packages. Lightweight commands (such as `usage`, `harness`, `dev workspace`, `diag`, `standards`, `migrate`, `cache`, `doctor`, and `install`) bypass the full server bootstrap so they start in milliseconds.

## Installation

```bash
# Global (recommended)
npm install -g @memberjunction/cli

# Local
npm install --save-dev @memberjunction/cli
```

**Requires Node.js 20.0.0 or higher.**

## Using `mj` from an agent or CI

`mj` detects whether a human is present and behaves accordingly. Nothing changes for
someone typing at a terminal; everything changes for a program.

### Prompting follows the terminal

A command prompts when stdin and stdout are both real terminals. When either is piped
or redirected, when a CI environment variable is set, or when `TERM=dumb`, it does not —
and a command that needs a value it wasn't given fails immediately, naming the flag that
supplies it, rather than blocking on stdin forever:

```console
$ mj sync init                         # at a terminal: prompts, exactly as before

$ mj sync init < /dev/null             # spawned by an agent
 ›   Error: An entity-directory choice is required and this run has no interactive
 ›   terminal. Pass --setup-entity=ai-prompts|other|no.
 ›   Try this: Pass --setup-entity=ai-prompts|other|no.
$ echo $?
1

$ mj sync init --setup-entity=no       # scripted: runs unattended anywhere
```

Override the detection in either direction with `--interactive` / `--no-interactive`, or
pin it for a whole shell session with `MJ_CLI_INTERACTIVE=0` (or `1`). An agent harness
that shells out through a pty should set `MJ_CLI_INTERACTIVE=0` so its subprocesses can
never block on a question.

### Output follows the pipe

With no explicit `--format`, `mj` writes human output to a terminal and JSON to a pipe —
banner, spinners and color are suppressed automatically when stdout is redirected.

```bash
mj usage                       # human-readable domain map
mj usage | jq '.data.domains'  # JSON envelope, no flag needed
mj codegen --format=text > build.log   # force human output into a file
export MJ_CLI_FORMAT=json      # pin the format for a whole session
```

`--format` accepts `text | json | md` everywhere. The older per-family spellings
(`console`/`markdown` under `mj test *`, `compact`/`table` under `mj ai *`) still work and
still win over auto-detection when passed explicitly.

> **Note on `-o`:** `-o` means *output format* in the `mj ai` family and *output file path*
> in `mj test`, `mj diag`, `mj queue export-topology`, `mj querygen export`, `mj sql-convert`,
> `mj sql-audit`, `mj translate-sql`, and `mj bundle`. Prefer `--format` for output format —
> it means the same thing across commands.

### Discovering commands without burning context

`mj usage` is a two-tier progressive-disclosure surface. Tier 1 is a compact domain map;
tier 2 is one domain's commands, flags, examples, and expected runtime. Reading the full
oclif help tree instead costs roughly 13–15k tokens.

```bash
mj usage                       # every domain + a one-line summary + a runtime class
mj sync usage                  # every mj sync command, its flags and examples
mj harness usage --format=json # the same, machine-readable
```

Each entry carries a **runtime hint** (`fast` | `moderate` | `slow` | `variable`, often with
a typical duration) so a caller wrapping `mj` in a timeout can budget correctly instead of
killing a healthy long-running command. Commands also emit a `{"event":"start", ...}` line
on stderr before doing work.

### The result envelope

Commands built on `BaseCLIPlugin` emit a versioned envelope on stdout, with all progress and
logging on stderr:

```json
{"version":"1","success":false,"command":"sync:push","durationSeconds":1.2,
 "errors":[{"context":"metadata/entities","message":"No mj.config.cjs found.",
            "code":"E_NO_CONFIG","suggestion":"Run `mj sync init` in this directory first."}]}
```

`code` is stable and safe to branch on; `message` is free to be reworded. `version` lets a
caller detect a contract change rather than silently mis-parsing.

## Configuration

Uses [cosmiconfig](https://github.com/davidtheclark/cosmiconfig) to find configuration:

- `mj.config.js` / `mj.config.cjs`
- `.mjrc` / `.mjrc.json` / `.mjrc.yaml`
- `package.json` (in `"mj"` property)

### Database Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | SQL Server hostname or IP |
| `DB_PORT` | `1433` | SQL Server port |
| `DB_DATABASE` | | Database name |
| `CODEGEN_DB_USERNAME` | | SQL Server login |
| `CODEGEN_DB_PASSWORD` | | SQL Server password |
| `DB_ENCRYPT` | `true` | Encrypt the connection (required for Azure SQL) |
| `DB_TRUST_SERVER_CERTIFICATE` | `false` | Trust self-signed certificates (set `true` for local dev) |

These can also be set in `mj.config.cjs` as `dbHost`, `dbPort`, `dbDatabase`, `codeGenLogin`, `codeGenPassword`, `dbEncrypt`, and `dbTrustServerCertificate`.

### Open App packages and `--no-app-packages`

Every heavy command (anything that is not `version`, `help`, `migrate`, `clean`, `bump`, `install`,
`dbdoc *`, `harness *`, `diag *`, `dev *`, or `* usage`) imports, before it opens a database,
the host's generated packages and the installed Open Apps' server packages named in `mj.config.cjs`
— so `mj sync push`, `mj app …`, `mj test` and `mj ai` construct an app's real entity subclasses
rather than a generic `BaseEntity`. The command's process ID is `cli:<command>` (`cli:sync:push`),
which entries can be scoped to with `Processes` / `ExcludeProcesses` and `dynamicPackages.policy`:

```javascript
// mj.config.cjs
dynamicPackages: {
  server: [
    { PackageName: '@acme/seed-hooks', StartupExport: 'LoadSeedHooks', Processes: ['cli:sync'] },
  ],
  policy: { 'cli:codegen': 'none' },
}
```

`--no-app-packages` (global, any command) or `MJ_DYNAMIC_PACKAGES=none` skips them for one run;
`--verbose` prints what loaded on stderr. Full model:
[`guides/DYNAMIC_PACKAGE_LOADING_GUIDE.md`](../../guides/DYNAMIC_PACKAGE_LOADING_GUIDE.md).

### Keeping the machine awake

`mj install`, `mj app install`, `mj app upgrade` and `mj migrate` run for many minutes against the
database. If the machine sleeps mid-run, every in-flight request times out on wake and the step is
rolled back. On macOS these commands therefore hold a `caffeinate` assertion for as long as the
CLI process lives (it ends with the command). Set `MJ_ALLOW_SLEEP=1` to opt out. Nothing holds
Windows or Linux machines awake, so on every platform these commands start with a one-line warning
not to let the machine sleep (or, on a Mac, close the lid) until they finish.

## Commands

### Quick Domain Index

Every domain also provides `mj <domain> usage` for progressive-disclosure discovery.

| Domain | Summary | Runtime |
|--------|---------|---------|
| [`mj agent`](#mj-agent) | Initialize a Citizen Agent Builder environment with Docker setup | `slow` |
| [`mj ai`](#mj-ai) | Run and audit AI agents, prompts, and actions from the terminal | `variable` |
| [`mj app`](#mj-app) | Install, upgrade, enable, disable, and remove MJ Open Apps | `slow` |
| [`mj artifacts`](#mj-artifacts) | Maintenance operations over stored conversation artifacts | `moderate` |
| [`mj baseline`](#mj-baseline) | Build, compare, and round-trip deterministic database baseline SQL scripts | `slow` |
| [`mj bump`](#mj-bump) | Bump `@memberjunction/*` dependency versions across `package.json` files | `fast` |
| [`mj bundle`](#mj-bundle) | Create self-contained distribution zips for offline/air-gapped installs | `moderate` |
| [`mj cache`](#mj-cache) | Inspect and clear the shared Redis server cache (`REDIS_URL`) | `fast` |
| [`mj clean`](#mj-clean) | Reset a MemberJunction database to a pre-installation state | `fast` |
| [`mj codegen`](#mj-codegen) | Run CodeGen, emit class registration manifests, and run v5.0 rename helpers | `slow` |
| [`mj dbdoc`](#mj-dbdoc) | Generate and export AI-authored database documentation and sample queries | `slow` |
| [`mj dev`](#mj-dev) | Generate, inspect, health-check, and clean cross-repo pnpm dev workspaces | `variable` |
| [`mj diag`](#mj-diag) | Inspect, scrub, analyze, export, and keygen `.mjdiag` diagnostic bundles | `fast` |
| [`mj doctor`](#mj-doctor) | Diagnose a local MJ environment and scan/fix value-list drift | `moderate` |
| [`mj explorer`](#mj-explorer) | Run MJ Explorer post-build tasks (service worker check, public page HTML) | `fast` |
| [`mj harness`](#mj-harness) | Manage multi-account CLI subscription pools, balancing strategies, and cooldowns | `fast` |
| [`mj install`](#mj-install) | Install MemberJunction from a release or seed the Claude Code pack | `slow` |
| [`mj migrate`](#mj-migrate) | Run, create, convert (T-SQL → PostgreSQL), and rebake migrations | `slow` |
| [`mj plugin`](#mj-plugin) | Register third-party CLI plugin packages in `mj-cli-plugins.json` | `fast` |
| [`mj query`](#mj-query) | Refresh saved queries' extracted parameters, fields, entities, and dependencies | `moderate` |
| [`mj querygen`](#mj-querygen) | Generate, validate, and export AI-authored stored query templates | `slow` |
| [`mj queue`](#mj-queue) | Operate the durable work queue (stats, backlog, dead letters, workers, bindings) | `moderate` |
| [`mj rubric`](#mj-rubric) | List, show, diff, validate, and evaluate versioned scoring rubrics | `moderate` |
| [`mj sql-audit`](#mj-sql-audit) | Compare source and target databases for SQL migration verification | `moderate` |
| [`mj sql-convert`](#mj-sql-convert) | Convert SQL files between dialects via the rule-based BatchConverter engine | `moderate` |
| [`mj standards`](#mj-standards) | List, adopt, and enforce MemberJunction repository engineering standards | `moderate` |
| [`mj sync`](#mj-sync) | Synchronize metadata between local JSON files and the database | `variable` |
| [`mj test`](#mj-test) | Run, compare, validate, and manage MJ tests, suites, scripts, and regression stacks | `variable` |
| [`mj translate-sql`](#mj-translate-sql) | Translate SQL fragments and stored metadata SQL between SQL Server and PostgreSQL | `moderate` |
| [`mj update`](#mj-update) | Update installed MJ tooling, including the Claude Code pack | `moderate` |
| [`mj usage`](#mj-usage) | Progressive-disclosure tier-1 domain map for humans and AI agents | `fast` |
| [`mj user`](#mj-user) | Clone an existing or template MJ user with roles, views, or settings | `fast` |

---

### mj agent

Scaffold a local Citizen Agent Builder environment with Docker Compose and optional Open App business context.

#### mj agent init

Alias: `mj ai agents init`

```bash
# Initialize in the current directory and boot the Docker stack
mj agent init

# Initialize into a specific directory without starting containers yet
mj agent init ./my-agent-workspace --no-start

# Specify a custom Open App repository for business context
mj agent init --app https://github.com/acme/sample-data --force
```

| Arg / Flag | Short | Description |
|------------|-------|-------------|
| `[dir]` | | Target directory for the agent builder environment (default: `.`) |
| `--force` | `-f` | Overwrite existing files in target directory |
| `--[no-]start` | `-s` | Start Docker containers and run bootstrap after init (default: `true`) |
| `--app <url>` | | Open App Git URL to install for business context (default: More Cheese) |
| `--skip-docker-check` | | Skip the Docker availability check and assume Docker is running |

---

### mj ai

Run, list, and audit AI agents, prompts, and actions from the terminal (`mj ai` prints topic help). All `mj ai` list/run/audit commands accept `--format <text|json|md>` (preferred) or legacy `-o, --output <compact|json|table>` (`markdown` also supported on `audit agent-run`).

#### mj ai agents list / mj ai agents run

```bash
# List available AI agents
mj ai agents list --format=json

# Execute an agent with an inline prompt or file
mj ai agents run -a "Requirements Expert" -p "Create a dashboard for sales metrics"
mj ai agents run -a "Customer Insight Agent" -f ./prompt.txt --verbose --timeout=600000

# Start an interactive chat session with an agent
mj ai agents run -a "Customer Insight Agent" --chat
```

Key flags on `mj ai agents run`: `-a, --agent <name>` (required), `-p, --prompt <text>`, `-f, --prompt-file <path>`, `-c, --chat` (mutually exclusive), `--format`, `-o, --output`, `-v, --verbose`, `--timeout <ms>` (default `300000`).

#### mj ai prompts list / mj ai prompts run

```bash
# List available AI models (add -v for detailed model info)
mj ai prompts list -v

# Execute a direct prompt with a specific model and system prompt
mj ai prompts run -p "Summarize this architecture" --model "gpt-4" --temperature 0.3
mj ai prompts run -p "Generate a haiku" --system "You are a poet" --max-tokens 100
```

Key flags on `mj ai prompts run`: `-p, --prompt <text>` (required), `-m, --model <name>`, `-s, --system <text>`, `-t, --temperature <val>`, `--max-tokens <n>`, `-c, --configuration <id>`, `--format`, `-o, --output`, `-v, --verbose`, `--timeout <ms>`.

#### mj ai actions list / mj ai actions run

```bash
# List available AI actions
mj ai actions list --format=text

# Execute an action with repeatable key=value parameters (or --dry-run to validate)
mj ai actions run -n "Calculate Expression" --param "Expression=2+2*3" --dry-run
mj ai actions run -n "Get Weather" -p "Location=Boston" --verbose
```

Key flags on `mj ai actions run`: `-n, --name <name>` (required), `-p, --param <key=value>` (repeatable), `--dry-run`, `--format`, `-o, --output`, `-v, --verbose`, `--timeout <ms>`.

#### mj ai audit / mj ai audit agent-run

Audit and analyze AI agent execution runs for debugging and performance analysis (`mj ai audit` shows audit subcommands).

```bash
# Inspect a run summary or export markdown
mj ai audit agent-run <run-id>
mj ai audit agent-run <run-id> --output=markdown

# Drill into a specific 1-based step or show errors only
mj ai audit agent-run <run-id> --step 3 --detail full
mj ai audit agent-run <run-id> --errors

# List recent runs with filters
mj ai audit agent-run --list --agent "Requirements Expert" --status failed --days 7 --limit 25

# Export full audit trace to a JSON file
mj ai audit agent-run <run-id> --export full --file report.json
```

| Arg / Flag | Short | Description |
|------------|-------|-------------|
| `[runId]` | | AI Agent Run ID (UUID); omitted when using `--list` |
| `--step <n>` | `-s` | Show details for a specific 1-based step number |
| `--detail <level>` | `-d` | Step detail level: `minimal \| standard \| detailed \| full` (requires `--step`) |
| `--errors` | `-e` | Show only error details and context |
| `--list` | `-l` | List recent agent runs |
| `--agent <name>` | `-a` | Filter listed runs by agent name (requires `--list`) |
| `--status <val>` | | Filter by status: `success \| failed \| running \| all` (default `all`) |
| `--days <n>` | | Days to look back (default `7`, requires `--list`) |
| `--limit <n>` | | Maximum runs to return (default `50`, requires `--list`) |
| `--export <mode>` | | Export mode: `full \| summary \| steps` (requires `--file`) |
| `--file <path>` | `-f` | Output file path for `--export` |
| `--max-tokens <n>` | | Max tokens per field before truncation (`0` = no limit, default `5000`) |
| `--format` / `-o, --output` | | Output format (`compact \| json \| table \| markdown`) |
| `--verbose` | `-v` | Show detailed diagnostic information |

---

### mj app

Install, upgrade, enable, disable, and remove MJ Open Apps (powered by `@memberjunction/open-app-engine`).

```bash
# List installed apps (add -v for details)
mj app list

# Show detailed info for one app
mj app info acme-crm

# Install from a GitHub repository, a multi-app repo subpath, or a local workspace folder
mj app install https://github.com/acme/mj-crm
mj app install https://github.com/acme/mj-crm --version 1.2.0 --non-interactive
mj app install https://github.com/MemberJunction/Integrations/CRM/HubSpot
mj app install ./openapps/analytics

# Upgrade to a newer version (or --reapply a local folder app without bumping version)
mj app upgrade acme-crm
mj app upgrade acme-crm --version 1.3.0 --non-interactive
mj app upgrade analytics --reapply

# Development only: check an installed app against its default branch (repeatable, or 'all')
mj app upgrade acme-crm --dependencies-from-head mj-common

# Enable / disable without removing
mj app enable acme-crm
mj app disable acme-crm

# Remove (add --keep-data to preserve schema/data, --force to ignore dependents, -y to skip prompt)
mj app remove acme-crm
mj app remove acme-crm --keep-data --yes

# Check which installed apps have newer versions available
mj app check-updates
```

#### Private repositories

Private GitHub repositories return **404, not 403**, when no token is supplied. Provide a token with `repo` scope in one of three ways (in precedence order):

```bash
# 1. mj.config.cjs — per-repository tokens, keyed by repo URL
#    openApps: { github: { tokens: { 'https://github.com/acme/private-app': process.env.APP_TOKEN } } }

# 2. mj.config.cjs — one token for every Open App repo
#    openApps: { github: { token: process.env.GITHUB_TOKEN } }

# 3. Environment variable
GITHUB_TOKEN=$(gh auth token) mj app install https://github.com/acme/private-app
```

#### Internal / dangerous flags

Intentionally omitted from `--help` because standard MJ Open Apps use the `__mj_<AppName>` schema namespace without any flag:

- `--dangerously-ignore-dbl-underscore-schema-rule` — available on `mj app install`, `mj app upgrade`, and `mj app remove`. Permits a `__`-prefixed schema name outside the `__mj_` app namespace. Platform-reserved and MJ-owned schemas (`dbo`, `sys`, `guest`, `db_*`, `public`, `pg_*`, `information_schema`, `__mj`, `__mj_UDT`) remain hard-blocked regardless.

---

### mj artifacts

Maintenance utilities for stored conversation artifacts.

#### mj artifacts reclassify

Upgrade-recovery utility for v5.35 artifact unification. Re-evaluates rows whose `TypeID` still points to the deleted JSON fallback when their content is not JSON. Dry-run by default; pass `--apply` to persist changes through Record Changes.

```bash
# Dry-run preview (inspects up to 100 rows by default)
mj artifacts reclassify

# Apply reclassification for artifacts created after a date
mj artifacts reclassify --since 2026-01-01 --limit 50 --apply --verbose
```

| Flag | Short | Description |
|------|-------|-------------|
| `--conversation-id <id>` | | Scope to artifacts attached to one conversation |
| `--since <iso-date>` | | Scope to artifacts created on or after this ISO date |
| `--limit <n>` | | Maximum rows to inspect (default `100`) |
| `--apply` | | Write changes (dry-run when omitted) |
| `--verbose` | `-v` | Print every candidate row, not just the summary |

---

### mj baseline

Build, compare, and round-trip **baseline migrations** — a single deterministic `B`-prefixed SQL script capturing the end-state (schema + row data) of an entire V-stack so Skyway/Flyway can bootstrap a fresh database without replaying hundreds of historical migrations.

> Niche maintainer command — use `mj migrate` for routine schema changes.

#### Operating modes

| Mode | Trigger | Version source | Timestamp | Output folder |
|------|---------|----------------|-----------|---------------|
| **AUTO — within-major rebaseline** (default) | `--baseline-version` omitted | `Major.Minor` from latest V-file in `--source-dir` | Latest V-file timestamp **+ 1 minute** | Same `migrations/v{N}/` |
| **EXPLICIT — major-boundary baseline** | `--baseline-version M.N` provided | Flag value | `Date.now()` UTC | `migrations/v{N+1}/` |

Filename format: `B{YYYYMMDDHHMM}__v{Major}.{Minor}.x__Baseline.sql`.

#### mj baseline build

```bash
# AUTO within-major rebaseline
mj baseline build --out ./migrations/v5/

# EXPLICIT major-boundary baseline
mj baseline build --baseline-version 6.0 --out ./migrations/v6/

# Schema-only, no INSERT statements
mj baseline build --no-data --out ./baselines/
```

Key flags: `--baseline-version`, `--source-dir`, `--description`, `--database`, `--out`, `--exclude-data <csv>`, `--batch-size <n>` (default `1000`), `--no-data`, `--dry-run`, `--verbose`.

#### mj baseline compare

```bash
# Full object-by-object and row-by-row diff
mj baseline compare --left MJ_BL_Stack --right MJ_BL_New

# Counts-only (fastest) or CI gate with report files
mj baseline compare --left A --right B --row-compare counts
mj baseline compare --left A --right B --fail-on-diff --out ./diffs/
```

Key flags: `--left` (required), `--right` (required), `--dialect <mssql|postgres>`, `--row-compare <full|hash|counts|none>`, `--row-hash-algo <sha256|md5|checksum_agg>`, `--ignore <regex>`, `--sample-limit <n>`, `--out <dir>`, `--fail-on-diff`, `--verbose`.

#### mj baseline roundtrip

```bash
# Build from gold-standard V-stack DB, apply to empty target DB, and verify byte-equivalence
mj baseline roundtrip --source MJ_BL_Stack --target MJ_BL_New
mj baseline roundtrip --baseline-version 6.0 --source MJ_BL_Stack --target MJ_BL_New --keep-target
```

Key flags: `--source` (required), `--target` (required), `--baseline-version`, `--source-dir`, `--description`, `--dialect <mssql|postgres>`, `--out`, `--apply-cmd <template>` (tokens `{file}`, `{database}`), `--row-compare`, `--fail-on-diff` (default `true`), `--keep-target`, `--verbose`.

Related docs: [`packages/MJCLI/src/commands/baseline/PLAN.md`](src/commands/baseline/PLAN.md).

---

### mj bump

Bump `@memberjunction/*` dependency versions in `package.json` files.

```bash
# Bump current directory's package.json to the current CLI version
mj bump

# Dry-run recursively across subdirectories with verbose logging
mj bump -rdv

# Recursively bump to a specific tag and output only modified package paths
mj bump -rqt v6.0.0 | xargs -n1 -I{} npm install --prefix {}
```

| Flag | Short | Description |
|------|-------|-------------|
| `--recursive` | `-r` | Bump versions in current directory and all subdirectories |
| `--tag <ver>` | `-t` | Target version tag (defaults to the CLI's version) |
| `--dry` | `-d` | Dry run without writing `package.json` changes |
| `--quiet` | `-q` | Print only paths of updated packages |
| `--verbose` | `-v` | Enable additional logging |

---

### mj bundle

Create a self-contained MemberJunction distribution zip for offline/air-gapped installations.

```bash
# Bundle latest branch tip into a distribution zip
mj bundle --out ./mj-install.zip

# Bundle a specific release tag with SQL Server + PostgreSQL migrations
mj bundle --tag v5.38.0 --with-migrations --out ./mj-install.zip

# Bundle from local working tree for PostgreSQL only, excluding the Claude Code pack
mj bundle --source . --with-migrations --db-platform postgresql --no-claude-pack --out ./mj-pg.zip
```

| Flag | Short | Description |
|------|-------|-------------|
| `--out <path>` | `-o` | Output zip path (required) |
| `--tag <ver>` | `-t` | Release tag to bundle (defaults to latest branch tip) |
| `--source <dir>` | | Bundle from a local working-tree directory instead of GitHub |
| `--with-migrations` | | Include migration trees for offline `mj migrate` |
| `--db-platform <val>` | | With `--with-migrations`, ship only `sqlserver` or `postgresql` |
| `--no-claude-pack` | | Exclude the Claude Code pack (`CLAUDE.md` + `.claude/`) |
| `--verbose` | `-v` | Show detailed output |

---

### mj cache

Inspect and clear the shared Redis cache (`REDIS_URL`) so every running MJAPI server reloads fresh data from the database.

#### mj cache clear

```bash
# Clear RunView, dataset, and metadata caches
mj cache clear

# Preview target Redis URL and per-category key counts without deleting
mj cache clear --dry-run

# Clear a single category (repeatable) or target a custom Redis URL/prefix
mj cache clear --category RunViewCache --prefix mj
mj cache clear --url redis://localhost:6379
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Report target and key counts per category without deleting |
| `--category <name>` | Specific cache category to clear (repeatable; case-insensitive) |
| `--url <redis-url>` | Redis URL override (default: `REDIS_URL`) |
| `--prefix <str>` | Key prefix override (default: `REDIS_KEY_PREFIX`, else `mj`) |

> `mj migrate`, `mj codegen`, and `mj sync push` clear the shared cache automatically when they modify the database and `REDIS_URL` is configured. Opt out with `--skip-cache-clear` or `MJ_SKIP_SHARED_CACHE_CLEAR=1`.

---

### mj clean

Reset a MemberJunction database to a pre-installation state.

```bash
mj clean
mj clean --verbose
```

Flags: `-v, --verbose`.

---

### mj codegen

Run the full MemberJunction code generation pipeline (metadata sync, SQL objects, TypeScript entity subclasses, Angular forms, GraphQL resolvers, and DB schema JSON).

```bash
# Run full code generation
mj codegen

# Regenerate code files only (skip database metadata/SQL pass) or database-only
mj codegen --skipdb
mj codegen --skipfiles

# Disable AI-driven advanced generation or skip configured shell hooks
mj codegen --no-ai --skip-commands

# Re-emit files for every schema and customize SQL output directory
mj codegen --all-schemas --sql-output-dir ./migrations/codegen
```

Key flags on `mj codegen`: `--skipdb`, `--skipfiles`, `--force-advanced-gen`, `--no-ai` (`MJ_CODEGEN_NO_AI=1`), `--sql-output-dir <dir>`, `--all-schemas`, `--skip-commands` (`MJ_CODEGEN_SKIP_COMMANDS=1`), `--skip-cache-clear`, `--format`, `--no-banner`, `--no-app-packages`, `--[no-]interactive`, `-v, --verbose`.

#### mj codegen manifest

Generate a static class registration manifest so modern bundlers (ESBuild, Vite) do not tree-shake `@RegisterClass`-decorated classes.

```bash
# Default manifest generation
mj codegen manifest

# Generate a supplemental manifest excluding @memberjunction/* packages
mj codegen manifest --exclude-packages @memberjunction --no-sync-deps --output ./src/generated/manifest.ts

# Generate manifest + lazy-loading config + Open App client bootstrap for MJExplorer
mj codegen manifest --appDir ./packages/MJExplorer --output ./packages/MJExplorer/src/app/generated/class-registrations-manifest.ts --exclude-packages @memberjunction --lazy-config ./packages/MJExplorer/src/app/generated/lazy-feature-config.ts --open-app-client-bootstrap --strict
```

| Flag | Short | Description |
|------|-------|-------------|
| `--output <path>` | `-o` | Output manifest path (default `./src/generated/class-registrations-manifest.ts`) |
| `--appDir <dir>` | `-a` | Root directory whose `package.json` dependency tree is scanned |
| `--filter <base>` | `-f` | Only include classes extending this base class (repeatable) |
| `--exclude-packages <prefix>` | `-e` | Skip packages starting with prefix (repeatable) |
| `--no-sync-deps` | | Skip automatic `package.json` dependency reconciliation |
| `--scan-dist` | | Also scan compiled JS in `dist/` for npm-published packages without `src/` |
| `--lazy-config <path>` | | Emit a lazy-loading feature config file (requires `--exclude-packages`) |
| `--strict` | | Fail with non-zero exit if excluded packages have unreachable `@RegisterClass` gaps |
| `--open-app-client-bootstrap` | | Append Open App client side-effect imports and emit `public-pages.generated.ts` |
| `--quiet` / `--verbose` | `-q` / `-v` | Control output verbosity |

#### v5.0 Entity Name Migration Commands

Starting in MemberJunction v5.0, core entity names were normalized with the `"MJ: "` prefix (`"Actions"` → `"MJ: Actions"`) and generated entity classes gained the `MJ` prefix (`ActionEntity` → `MJActionEntity`). These three commands scan in dry-run mode by default and apply changes with `--fix`, building their rename map dynamically from `entity_subclasses.ts`:

- **`mj codegen 5-0-fix-entity-names`** — AST + regex scanner for TypeScript (`.ts`) entity names and class/subclass renames.
- **`mj codegen 5-0-fix-html-entity-names`** — Targeted scanner for Angular HTML templates (`.html`).
- **`mj codegen 5-0-fix-metadata-names`** — Scanner for `metadata/` JSON files (including `.mj-sync.json`, `@lookup:`, and `relatedEntities`).

```bash
# 1. Dry-run scan across code, templates, and metadata
mj codegen 5-0-fix-entity-names --path packages/
mj codegen 5-0-fix-html-entity-names --path packages/Angular/
mj codegen 5-0-fix-metadata-names --path metadata/

# 2. Apply fixes in place
mj codegen 5-0-fix-entity-names --path packages/ --fix
mj codegen 5-0-fix-html-entity-names --path packages/Angular/ --fix
mj codegen 5-0-fix-metadata-names --path metadata/ --fix
```

Common flags across all three commands: `-p, --path <dir|file>`, `--fix`, `--entity-subclasses <path>`, `-q, --quiet`, `-v, --verbose`.

---

### mj dbdoc

AI-powered database documentation and sample-query generator (delegates to `@memberjunction/db-auto-doc`; `mj dbdoc` prints topic help).

```bash
# Initialize a DBAutoDoc project
mj dbdoc init

# Analyze database schema (supports --resume, --config, --skip-sampling)
mj dbdoc analyze --config ./config.json
mj dbdoc analyze --resume ./output/run-6/state.json --skip-sampling

# Check analysis status or reset state
mj dbdoc status --state-file ./db-doc-state.json
mj dbdoc reset --force

# Export documentation (SQL extended properties, Markdown, HTML, CSV, Mermaid ERDs, report)
mj dbdoc export --state-file ./db-doc-state.json --markdown --html --mermaid --erd-mode clusters --erd-columns keys
mj dbdoc export --sql --apply --approved-only --confidence-threshold 0.8

# Generate sample SQL queries from analysis state and export to MJ metadata JSON
mj dbdoc generate-queries --from-state ./output/run-1/state.json --queries-per-table 10
mj dbdoc export-sample-queries --input ./output/sample-queries.json --output ./metadata/queries/.queries.json --separate-sql-files --category "Database Documentation" --status Pending --min-confidence 0.8 --validated-only
```

---

### mj dev

Local multi-repo development tooling (`mj dev` displays domain help). Joins sibling clones (such as MJ and Open App repositories) into a single ephemeral pnpm workspace at their common parent directory so edits are live everywhere in ~1s with zero files committed to any repo. See [`guides/DEV_WORKSPACE_QUICKSTART.md`](../../guides/DEV_WORKSPACE_QUICKSTART.md).

#### mj dev workspace

```bash
# Auto-detect sibling MJ / Open App clones and generate the joined pnpm workspace
mj dev workspace --dir ~/code/mj-workspace

# Customize included/excluded repos or admit app shells
mj dev workspace --dir ~/code/mj-workspace --include bizapps-common --exclude bizapps-sonar
mj dev workspace --dir ~/code/mj-workspace --apps my-app=apps/API,apps/Explorer --clean-members

# Regenerate workspace files without running pnpm install
MJ_DEV_WORKSPACE_DIR=~/code/mj-workspace mj dev workspace --no-install --force
```

| Flag | Description |
|------|-------------|
| `--dir <path>` | Parent directory holding sibling clones (must not be a git repo; env: `MJ_DEV_WORKSPACE_DIR`, default `.`) |
| `--include <dir>` | Repo directory name to include (repeatable) |
| `--exclude <dir>` | Repo directory name to exclude (repeatable) |
| `--apps <member=globs>` | Admit app-shell packages (`<member>=<glob>[,<glob>]`, repeatable) |
| `--[no-]install` | Run `pnpm install` at the parent after generating (default `true`) |
| `--force` | Overwrite existing workspace files (keeps `.bak` copies) |
| `--[no-]clean-members` | Remove member repos' standalone `node_modules` trees before parent install |
| `-v, --verbose` | Show detailed output |

#### mj dev workspace status / doctor / clean

```bash
# Read-only status summary of generated files, lockfile, sentinel, and members
mj dev workspace status --dir ~/code/mj-workspace

# Read-only health check (duplicate singletons, standalone installs, stale builds)
mj dev workspace doctor --dir ~/code/mj-workspace

# Preview teardown, then remove generated workspace residue (repos untouched)
mj dev workspace clean --dir ~/code/mj-workspace --dry-run
mj dev workspace clean --dir ~/code/mj-workspace
```

Flags: `--dir <path>` on all three; `--dry-run` and `--force` on `mj dev workspace clean`.

---

### mj diag

Offline inspection, scrubbing, performance analysis, trace export, and key generation for MemberJunction `.mjdiag` diagnostic bundles (zero server bootstrap). See [`guides/DIAGNOSTIC_BUNDLES_GUIDE.md`](../../guides/DIAGNOSTIC_BUNDLES_GUIDE.md).

All commands that read bundles accept encrypted `MJDB` envelopes via `--private-key-file <path>`, `MJ_DIAG_PRIVATE_KEY` (preferred), or `--private-key <base64>`.

```bash
# Verify archive integrity and inspect bundle manifest/summary
mj diag inspect ./capture.mjdiag
mj diag inspect ./encrypted.mjdiag --private-key-file ./intake.key --json

# Print a merged chronological timeline (client spans, server spans, SQL, breadcrumbs)
mj diag timeline ./capture.mjdiag --limit 100

# List slow client/server spans and SQL queries above a millisecond threshold
mj diag slow ./capture.mjdiag --threshold 250

# Export traces to Chrome Trace Event (ui.perfetto.dev) or OpenTelemetry OTLP JSON
mj diag export ./capture.mjdiag --perfetto -o ./trace-perfetto.json
mj diag export ./capture.mjdiag --otlp -o ./trace-otlp.json

# Re-scrub a bundle archive at Standard or FullRaw profile
mj diag scrub ./capture.mjdiag -o ./scrubbed.mjdiag --profile Standard

# Generate an X25519 collector keypair (and optional Ed25519 signing keypair) for an intake server
mj diag keygen --key-id intake-2026-01 --signing --json
```

| Subcommand | Args & Key Flags |
|------------|------------------|
| `mj diag inspect <file>` | `--json`, `--private-key-file`, `--private-key` |
| `mj diag timeline <file>` | `-n, --limit <n>` (default `50`), `--private-key-file`, `--private-key` |
| `mj diag slow <file>` | `-t, --threshold <ms>` (default `500`), `--private-key-file`, `--private-key` |
| `mj diag export <file>` | `-o, --output <path>` (required), `--perfetto`, `--otlp`, `--private-key-file`, `--private-key` |
| `mj diag scrub <file>` | `-o, --output <path>` (required), `--profile <Standard\|FullRaw>`, `--private-key-file`, `--private-key` |
| `mj diag keygen` | `--key-id <kid>`, `--signing`, `--json` |

---

### mj doctor

Diagnose a MemberJunction installation and check for metadata/data drift.

#### mj doctor

```bash
# Run full installation diagnostics in current directory
mj doctor

# Filter to a specific diagnostic scope or emit machine-readable JSON
mj doctor --dir ./my-mj-project --scope ai --verbose
mj doctor --format json

# Generate a shareable support report (or extended report with service startup logs)
mj doctor --report
mj doctor --report_extended
```

| Flag | Short | Description |
|------|-------|-------------|
| `--dir <path>` | | Target directory to diagnose (default `.`) |
| `--scope <name>` | | Filter diagnostics: `install \| runtime \| ai \| metadata \| agent` |
| `--format` | | Output format (`text \| json \| md`) |
| `--verbose` | `-v` | Show detailed output with inline suggested fixes |
| `--report` | `-r` | Write `mj-diagnostic-report.md` |
| `--report_extended` | | Extended report with config snapshots and startup log capture |

#### mj doctor value-lists

Find database rows whose closed value-list (`ValueListType = List`) fields contain values outside their configured list (which fail validation on next save). Read-only unless `--fix` names specific `Entity.Field` targets.

```bash
# Scan all entities (read-only)
mj doctor value-lists

# Scan specific entities and fail CI if findings exist
mj doctor value-lists --entity "MJ: AI Agents" --format json --fail-on-findings

# Relax named fields to ListOrUserEntry through the entity layer
mj doctor value-lists --fix "Projects.Phase,Projects.Status"
```

Flags: `--entity <name>` (repeatable), `--format`, `--fail-on-findings`, `--fix <Entity.Field,...>` (repeatable).

---

### mj explorer

Post-build tasks for MJ Explorer hosts.

#### mj explorer postbuild

Run as MJ Explorer's `postbuild` script after `ng build`: verifies the service worker cache list, emits one HTML file per public page (`public-pages/<slug>.html` plus `_fallback.html`) from `mj.config` `publicPages` with title/preview/CSP headers, and updates `staticwebapp.config.json` rewrites when present.

```bash
mj explorer postbuild --dir dist/MJExplorer/browser
mj explorer postbuild --dir dist/MJExplorer/browser --quiet
```

Flags: `--dir <path>` (required), `-q, --quiet`.

---

### mj harness

Manage external agent harness CLI subscription account pools, `1 + N` multi-account auto-balancing, interactive logins, and quota cooldown controls (`mj harness` and `mj harness account` print domain/topic help). Works across **Claude Code** (`claude`), **Antigravity** (`agy`), **OpenAI Codex** (`codex`), and **Gemini CLI** (`gemini`) with zero server bootstrap. See [`guides/AGENT_HARNESS_GUIDE.md`](../../guides/AGENT_HARNESS_GUIDE.md).

Pool data is stored under `~/.mj/harness-accounts` by default and can be overridden globally with `MJ_HARNESS_ACCOUNT_POOL_DIR` or per command with `--pool-dir <path>`. Your existing OS `$HOME` login is automatically included as a synthetic `os-default-<vendor>` slot alongside any additional isolated accounts you enroll (`1 + N` hybrid pooling).

#### Practical multi-account setup & balancing workflow

```bash
# 1. Inspect existing OS-default and enrolled slots (also probes live `<binary> --version` health)
mj harness account list
mj harness account list --vendor claude --json

# 2. Enroll extra isolated accounts across vendors (launches each vendor's interactive OAuth login)
mj harness account add claude --label "Pro #2" --weight 2 --priority 50
mj harness account add agy --label "Team Seat"
mj harness account add codex --label "Codex #2" --no-login
mj harness account add gemini --label "Gemini Alt"

# 3. Choose the default pool balancing strategy:
#    least-in-flight (default) | weighted | round-robin | priority-failover
mj harness account set-strategy least-in-flight
mj harness account set-strategy weighted
mj harness account set-strategy round-robin
mj harness account set-strategy priority-failover

# 4. Re-authenticate a slot (clears active cooldown) or manage cooldown / enabled state
mj harness account login claude-pro-2
mj harness account clear-cooldown claude-pro-2
mj harness account disable os-default-claude
mj harness account enable os-default-claude

# 5. Remove an enrolled slot (add --purge-files to delete its isolated directory too)
mj harness account remove codex-codex-2 --purge-files

# 6. Target an isolated pool directory (e.g. per-team or CI runner)
MJ_HARNESS_ACCOUNT_POOL_DIR=/srv/mj-harness-pool mj harness account list
```

#### Auth status & live binary health probing

`mj harness account list` verifies both credential presence and CLI executability (`<binary> --version`) for every listed vendor:

| `AUTH` Status | Meaning |
|---------------|---------|
| `Ready` | Credentials exist for the slot and `<binary> --version` succeeded. |
| `Binary Missing` | Credentials may exist on disk, but the vendor CLI binary is missing or broken (`<binary> --version` failed). Install or repair the CLI before leasing turns. |
| `Needs Login` | CLI binary is runnable, but the slot has no active login session yet (`mj harness account login <slotId>`). |

#### Subcommands & flags

| Subcommand | Args & Key Flags |
|------------|------------------|
| `mj harness account list` | `-v, --vendor <claude\|agy\|codex\|gemini>`, `--json`, `--pool-dir <dir>` |
| `mj harness account add <vendor>` | `-l, --label <name>`, `--slot-id <id>`, `-w, --weight <n>` (default `1`), `-p, --priority <n>` (default `100`), `--no-login`, `--oauth-token <tok>`, `--pool-dir <dir>` |
| `mj harness account login <slotId>` | `--pool-dir <dir>` |
| `mj harness account remove <slotId>` | `--purge-files`, `--pool-dir <dir>` |
| `mj harness account set-strategy <strategy>` | `strategy`: `least-in-flight \| round-robin \| weighted \| priority-failover`; `--pool-dir <dir>` |
| `mj harness account enable <slotId>` | `--pool-dir <dir>` |
| `mj harness account disable <slotId>` | `--pool-dir <dir>` |
| `mj harness account clear-cooldown <slotId>` | `--pool-dir <dir>` |

---

### mj install

Install MemberJunction from a GitHub release, or seed the MemberJunction Claude Code pack into an existing project.

#### mj install

```bash
# Interactive installer (shows version picker)
mj install

# Non-interactive install of a specific release tag (or preview with --dry-run)
mj install -t v6.0.0 --dir ./my-mj-app --yes
mj install --dry-run

# Config-driven install, skipping DB provisioning or startup smoke tests
mj install -c ./install-config.json --skip-db --skip-start --fast
```

Key flags: `-t, --tag <ver>`, `--dir <path>`, `-c, --config <file>`, `--dry-run`, `-y, --yes`, `-v, --verbose`, `--skip-db`, `--skip-start`, `--no-resume`, `--fast`, `--overwrite-config`, `--monorepo`, `--no-claude-pack`.

#### mj install claude

Install or refresh the MemberJunction Claude Code pack (`CLAUDE.md` managed block, `.claude/commands/`, `.claude/skills/`, and `.claude/settings.json`) in a directory.

```bash
mj install claude
mj install claude --dry-run
mj install claude --from ./local-pack --offline --json
```

Key flags: `--dir <path>`, `--major <n>`, `--ref <git-ref>`, `--from <path>`, `--offline`, `--dry-run`, `-y, --yes`, `--force`, `--skip-commands`, `--skip-skills`, `--skip-settings`, `--json`, `-v, --verbose`.

---

### mj migrate

Create, execute, convert, and rebake database migrations (powered by [Skyway](https://github.com/MemberJunction/skyway)). See [`guides/MIGRATION_CODEGEN_WORKFLOW_GUIDE.md`](../../guides/MIGRATION_CODEGEN_WORKFLOW_GUIDE.md).

#### mj migrate

```bash
# Apply pending migrations using mj.config.cjs
mj migrate

# Verify database connectivity and TLS without migrating
mj migrate --check-connection

# Migrate a specific schema and directory (or remote version tag)
mj migrate --schema __my_app --dir ./migrations/v1 --verbose
mj migrate --schema __my_app --tag v1.0.0 --skip-cache-clear
```

| Flag | Short | Description |
|------|-------|-------------|
| `--verbose` | `-v` | Enable detailed logging |
| `--tag <version>` | `-t` | Version tag for remote migrations |
| `--schema <name>` | `-s` | Target schema (overrides `coreSchema` / `mj-app.json` auto-detection; auto-created if missing) |
| `--dir <path>` | | Migration source directory override |
| `--check-connection` | | Verify DB connection and TLS, then exit without migrating |
| `--skip-cache-clear` | | Skip automatic Redis cache clear after applying migrations (`MJ_SKIP_SHARED_CACHE_CLEAR=1`) |

Request timeout defaults to 30 minutes per batch; override with `MJ_MIGRATION_REQUEST_TIMEOUT` (ms) or `dbRequestTimeout` in `mj.config.cjs`.

#### mj migrate create

Scaffold a timestamped migration file for SQL Server or PostgreSQL.

```bash
mj migrate create "Add Priority To Tasks"
mj migrate create "Add Priority To Tasks" --version 6.2 --platform postgresql --dir ./migrations-pg/v6
```

Args & flags: `<description>` (required), `-v, --version <M.N>`, `-p, --platform <sqlserver|postgresql>`, `--dir <path>`, `--x-x`.

#### mj migrate convert

Convert T-SQL migrations to PostgreSQL. The standard path uses `--split` (AST-transpiles hand DDL and converts `mj-sync` logs inline), optionally with `--bake-codegen` to bake native PostgreSQL CodeGen objects inline against a live PG database so deployments run with `mj migrate` alone.

```bash
# Standard split-and-regenerate conversion
mj migrate convert --split --dry-run
mj migrate convert --split --file V202604060452__v5.24.x__KnowledgeHub.sql

# Bake native PostgreSQL CodeGen inline against a seeded PG database
mj migrate convert --split --bake-codegen --source-dir ./migrations/v6 --output-dir ./migrations-pg/v6

# Open App conversion with distinct app schema and core schema
mj migrate convert --split --schema __mj_MyApp --core-schema __mj --source-dir ./migrations/v1 --output-dir ./migrations-pg/v1
```

Key flags: `--source-dir`, `--output-dir`, `--file <name>`, `--schema <name>` (default `__mj`), `--core-schema <name>` (default `__mj`), `--split`, `--bake-codegen`, `--allow-gaps`, `--dry-run`, `--no-header`, `-v, --verbose`.

#### mj migrate rebake

Re-bake post-baseline PostgreSQL migrations with fresh inline native CodeGen while keeping committed hand-written DDL regions byte-for-byte intact.

```bash
# Dry-run preview of post-baseline migrations that would be rebaked
mj migrate rebake --dry-run

# Re-bake all post-baseline migrations and write output
mj migrate rebake --baseline-floor V202605291452 --write

# Capture CodeGen for a single already-applied PG migration
mj migrate rebake --file V202611031700__v6.2.x__Example.sql --capture-only
```

Key flags: `--source-dir`, `--output-dir`, `--schema`, `--core-schema`, `--baseline-floor <ver>`, `--file <name>`, `--capture-only`, `--write`, `--dry-run`.

---

### mj plugin

Register third-party CLI plugins so `mj` loads them automatically at startup.

#### mj plugin add

```bash
mj plugin add @my-org/mj-plugin/plugins
mj plugin add ./local-plugins/my-tool --format json
```

Args & flags: `<package>` (required — npm package name, subpath, or relative path), `--format <text|json>`.

---

### mj query

Saved query metadata maintenance.

#### mj query refresh

Re-establishes saved queries' extracted parameters, fields, entities, and dependencies from their SQL and the database server without modifying the SQL itself. Authored annotations (descriptions and manual parameter metadata) are preserved.

```bash
# Recommended after upgrading: preview first, then apply
mj query refresh --all --dry-run
mj query refresh --all

# Target specific queries by path, category, entity, or ID
mj query refresh --name "MJ/Reports/Top Customers"
mj query refresh --category MJ --with-ai
mj query refresh --entity "MJ: AI Agents" --verbose
```

| Flag | Description |
|------|-------------|
| `--id <id>` | Refresh the query with this ID (repeatable) |
| `--name <name>` | Query name or full path `Category/Sub/Name` (repeatable) |
| `--category <path>` | Category path and all descendant categories |
| `--entity <name>` | Queries that read this entity (repeatable) |
| `--all` | Refresh every query |
| `--dry-run` | Report changes without writing |
| `--with-ai` | Fill empty descriptions via LLM (off by default) |
| `-v, --verbose` | Also list unchanged queries |
| `--format <text\|json>` | Output format (default `text`) |

Exit codes: `0` (all refreshed/unchanged/skipped), `1` (a query failed or `--id`/`--name` matched nothing), `2` (no selector flag given).

---

### mj querygen

AI-assisted stored query template generation, validation, and export (delegates to `@memberjunction/query-gen`).

```bash
# Generate SQL query templates for specific entities
mj querygen generate --entities "Customers,Orders" --max-entities 5 --mode metadata --verbose

# Validate query templates in metadata files
mj querygen validate --path ./metadata/queries --verbose

# Export queries from database to metadata files
mj querygen export --output ./metadata/queries --verbose
```

Key flags on `mj querygen generate`: `-e, --entities <csv>`, `-x, --exclude-entities <csv>`, `-s, --exclude-schemas <csv>`, `-m, --max-entities <n>` (default `3`), `-t, --target-groups <n>` (default `75`), `-r, --max-refinements <n>` (default `3`), `-f, --max-fixes <n>` (default `5`), `--model`, `--vendor`, `-o, --output <dir>`, `--mode <metadata|database|both>`, `-v, --verbose`.

---

### mj queue

Operate MemberJunction's durable work queue (`mj queue` prints domain help and examples). See [`guides/WORK_QUEUE_CONSUMER_GUIDE.md`](../../guides/WORK_QUEUE_CONSUMER_GUIDE.md).

```bash
# Publish one or more messages to a topic (supports partition & dedup keys)
mj queue publish --topic samples.hello --payload '{"name":"Alex"}'
mj queue publish --topic samples.hello --count 5 --partition-key customer-42 --dedup-key batch-1 --attribute source=cli

# Inspect subscription counts, autoscaler backlog, and blocked partitions
mj queue stats
mj queue stats --subscription email.unsubscribe --json
mj queue backlog --subscription venue-import --json
mj queue partitions --subscription integration.apply --condition Blocked

# Inspect, replay, or discard dead-lettered / in-flight deliveries
mj queue dead-letters --subscription integration.apply --page-size 20
mj queue replay --subscription integration.apply --delivery <delivery-id> --note "mapping fixed"
mj queue discard --subscription integration.apply --delivery <delivery-id> --reason "bad batch, republished"

# Run container-job or long-running workers and manual sweeper passes
mj queue work --subscription venue-import --once --max 5 --concurrency 2 --max-duration-ms 3300000
mj queue work --subscription "*" --concurrency 4
mj queue sweep --json

# Cloud transport topology & Terraform binding lifecycle
mj queue export-topology --transport AWS-prod --output infrastructure/work-queue/manifest.json
mj queue import-bindings bindings.json
mj queue validate-bindings --transport AWS-prod
```

| Subcommand | Key Flags / Args |
|------------|------------------|
| `mj queue publish` | `-t, --topic` (req), `-p, --payload`, `-k, --partition-key`, `--dedup-key`, `-a, --attribute <k=v>` (repeatable), `-n, --count`, `--json` |
| `mj queue stats` | `-s, --subscription`, `--json` |
| `mj queue backlog` | `-s, --subscription` (req), `--json` |
| `mj queue partitions` | `-s, --subscription` (req), `--condition <Idle\|InFlight\|Blocked>`, `--cursor`, `--page-size`, `--json` |
| `mj queue dead-letters` | `-s, --subscription` (req), `--cursor`, `--page-size`, `--json` |
| `mj queue replay` | `-s, --subscription` (req), `-d, --delivery` (req), `--note` |
| `mj queue discard` | `-s, --subscription` (req), `-d, --delivery` (req), `-r, --reason` (req) |
| `mj queue work` | `-s, --subscription` (req, or `*`), `--once`, `--max`, `--idle-exit-ms`, `--max-duration-ms`, `--concurrency`, `--shutdown-drain-ms`, `--sweeper-interval-ms`, `--reconcile-interval-ms` |
| `mj queue sweep` | `--json` |
| `mj queue export-topology` | `-t, --transport` (req), `-o, --output` |
| `mj queue import-bindings <file>` | `--json` |
| `mj queue validate-bindings` | `-t, --transport`, `--json` |

---

### mj rubric

List, inspect, diff, validate, and evaluate versioned scoring rubrics (`mj rubric` displays topic help). See [`guides/RUBRICS_GUIDE.md`](../../guides/RUBRICS_GUIDE.md).

```bash
# List all rubrics
mj rubric list

# Show a rubric (optionally pinned to @version) and its criteria
mj rubric show "Agent Quality"
mj rubric show "Agent Quality@1.2.0"

# Diff two versions of a rubric
mj rubric diff "Agent Quality" 1.1.0 1.2.0

# Validate a rubric JSON snapshot file locally (duplicate keys, gates, weights, scales)
mj rubric validate ./rubric-publications/agent-quality.json

# Evaluate a single entity record against a rubric (does not publish)
mj rubric evaluate --rubric "Agent Quality@1.2.0" --entity "MJ: AI Agent Runs" --record <record-id> --evaluator LLM --mode SinglePass
```

Flags on `mj rubric evaluate`: `--rubric <name|id[@ver]>` (required), `--entity <name>` (required), `--record <id>` (required), `--evaluator <LLM|Decision|Agent|Deterministic|custom>` (default `LLM`), `--prompt <name>`, `--model <id>`, `--mode <SinglePass|PerCriterion>`.

---

### mj sql-audit

Compare source and target databases (e.g. SQL Server vs PostgreSQL) for migration verification.

```bash
mj sql-audit --source "mssql://sa:pass@host/db" --target "postgres://user:pass@host:5432/db"
mj sql-audit --source "mssql://..." --target "postgres://..." --source-schema __mj --target-schema __mj --output report.txt
```

Flags: `--source <conn>` (required), `--target <conn>` (required), `--source-schema <name>` (default `__mj`), `--target-schema <name>` (default `__mj`), `-o, --output <file>`.

---

### mj sql-convert

Convert standalone SQL files between database dialects using the rule-based `BatchConverter` engine.

```bash
mj sql-convert ./migration.sql --from tsql --to postgres
mj sql-convert ./migration.sql --from tsql --to postgres --output converted.sql --schema my_schema --no-header --verbose
```

Args & flags: `<source>` (required), `--from <dialect>` (required), `--to <dialect>` (required), `-o, --output <path>`, `--schema <name>` (default `__mj`), `--no-header`, `--no-post-process`, `-v, --verbose`.

---

### mj standards

List, adopt, and check MemberJunction repository engineering standards (such as `ui-layers`, `naming-conventions`, `polymorphic-fk`, `migration-existence-guards`, `readable-status-values`, `migration-string-collation`, `agent-skill-governance`, and `limits-literals`).

```bash
# List all available standards and this repository's adoption stance
mj standards list --verbose

# Run all adopted standards (or target one check; add --strict to fail on warnings)
mj standards check
mj standards check --check naming-conventions --strict
mj standards check --quiet

# Adopt standards into a repository (config + optional GitHub Actions workflow + npm script)
mj standards adopt --ci github --declare-compliant
mj standards adopt --upgrade --dry-run
```

| Subcommand | Key Flags |
|------------|-----------|
| `mj standards list` | `--cwd <dir>`, `-v, --verbose` |
| `mj standards check` | `--cwd <dir>`, `--check <id>` (repeatable), `--strict`, `--quiet` |
| `mj standards adopt` | `--cwd <dir>`, `--check <id>` (repeatable), `--ci <github\|none>`, `--[no-]npm-script`, `--declare-compliant`, `--upgrade`, `--dry-run` |

---

### mj sync

Synchronize metadata between local JSON files and the database (delegates to `@memberjunction/metadata-sync`).

```bash
# Initialize a metadata directory (prompts at a terminal; scriptable with --setup-entity)
mj sync init
mj sync init --setup-entity=ai-prompts
mj sync init --setup-entity=other --entity="MJ: AI Models" --dir=ai-models --no-interactive

# Check status of local files vs database
mj sync status --dir="ai-prompts" --verbose

# Pull metadata from database to local files
mj sync pull --entity="MJ: AI Prompts" --dry-run
mj sync pull --entity="MJ: AI Prompts" --incremental --merge-strategy=merge --backup-before-update

# Push local metadata files to database (atomic single transaction by default)
mj sync push --dir="metadata" --dry-run
mj sync push --dir="metadata" --ci --incremental
mj sync push --isolated-transactions --parallel-batch-size=10 --change-detail

# Validate metadata files and optionally write a markdown report
mj sync validate --dir="metadata" --save-report --output=validation-report.md

# Watch for file changes and sync automatically
mj sync watch --dir="ai-prompts" --debounce=1000

# Reset stored metadata sections on local files
mj sync file-reset --dir="ai-prompts" --sections="dependencies,references" --dry-run
```

---

### mj test

Execute, compare, validate, and manage MemberJunction tests, suites, replay scripts, rubric criteria, and Docker-based Explorer regression runs (`mj test` prints domain help; delegates to `@memberjunction/testing-cli`).

#### Core test execution & reporting

```bash
# Run a single test by ID or name (supports --rubric, --checks-module, --oracles-module, --dry-run)
mj test run <test-id>
mj test run --name="Active Members Count" --environment=staging --format=json --output=results.json

# Run a test suite (supports parallel execution, sharding, flaky-check, transport & test filters)
mj test suite <suite-id> --parallel --max-parallel=4 --shard=1/3
mj test suite --name="Agent Quality Suite" --flaky-check=3 --transport=server
mj test suite --name="MJ Explorer Regression Suite" --test="T001 - Login Smoke"

# List tests, suites, or test types
mj test list
mj test list --suites --tag=smoke --status=active
mj test list --types

# View test execution history
mj test history --test=<test-id> --recent=20 --from=2026-01-01

# Compare test runs (DB mode by ID/version/commit/--latest, or offline --from-json)
mj test compare --latest --format=markdown --output=report.md
mj test compare <run-id-1> <run-id-2> --diff-only
mj test compare --from-json baseline.json --from-json latest.json

# Print per-criterion rubric breakdown for a test run
mj test report <run-id>

# Validate test definitions without executing
mj test validate --all --save-report --output=validation-report.md

# Promote a test's inline judge criteria into a Draft rubric and bind Test.RubricID
mj test promote-criteria <test-id>
mj test promote-criteria "Reply check"

# Review, promote, or discard pending recorded replay scripts
mj test scripts
mj test scripts --test "T042 - Filter Grid" --promote
mj test scripts --test "T042 - Filter Grid" --discard
mj test scripts --promote --yes --format=md --output=drift.md
```

#### mj test regression

Docker-based LLM-driven browser regression testing for MJ Explorer and external web apps (`mj test regression` prints subcommand overview).

```bash
# Scaffold a bundled regression-suite mode template
mj test regression init --list
mj test regression init generic-web

# Author a new regression test entry
mj test regression new --name "Form builder clones a form" --priority P1 --tags form-builder \
  --start-path /app/form-builder --goal "Clone Contact Form and verify the copy opens in the editor." \
  --criteria "A form named Copy of Contact Form is listed"

# Build images (runs gen-forms automatically when .docker-generated/ is empty) or regenerate forms directly
mj test regression build
mj test regression build mjexplorer --skip-gen-forms
mj test regression gen-forms

# Run self-contained local stack (Mode A) or against a .bacpac database
mj test regression up
mj test regression up --test="T001 - Login Smoke" --detach
mj test regression up --bacpac=./db.bacpac --suite="My Suite" --metadata=./my-suite-metadata

# Run against a remote URL or compose overlay (Mode B/C/D)
mj test regression remote --target=staging-mj
mj test regression remote --target=./app/target.json --overlay=./app/docker-compose.app.yml --env-file=./.env

# Compare recent runs, export a self-contained HTML report, and tear down
mj test regression compare --diff-only
mj test regression export --run=run-20260526T220118Z
mj test regression down --keep-volumes
```

---

### mj translate-sql

Translate SQL fragments and stored MJ metadata SQL (`queries`, `views`, `filters`, or `all`) between SQL Server and PostgreSQL.

```bash
# Preview translations across all stored SQL metadata
mj translate-sql --from sqlserver --to postgresql --dry-run

# Translate stored queries only or generate a review report without DB writes
mj translate-sql --from sqlserver --to postgresql --scope queries
mj translate-sql --from sqlserver --to postgresql --scope all --review --output ./reports

# Translate a single inline SQL fragment
mj translate-sql --from sqlserver --to postgresql --sql "SELECT TOP 10 [Name] FROM [Users]"
```

Flags: `--from <sqlserver|postgresql>` (required), `--to <sqlserver|postgresql>` (required), `--scope <queries|views|filters|all>` (default `all`), `--sql <fragment>`, `--dry-run`, `--review`, `-o, --output <dir>`, `--force`.

---

### mj update

Update installed MemberJunction developer tooling.

#### mj update claude

Check for or apply updates to the MemberJunction Claude Code pack in a repository.

```bash
mj update claude --check
mj update claude
mj update claude --refresh-commands --refresh-skills --allow-major --json
```

Key flags: `--dir <path>`, `--major <n>`, `--ref <git-ref>`, `--from <path>`, `--offline`, `--check`, `--dry-run`, `-y, --yes`, `--force`, `--skip-commands`, `--skip-skills`, `--skip-settings`, `--refresh-commands`, `--refresh-skills`, `--allow-major`, `--json`, `-v, --verbose`.

---

### mj usage

Tier-1 progressive-disclosure command map for AI agents and developers. Lists every command domain with its one-line summary and runtime class, then directs callers to `mj <domain> usage`.

```bash
mj usage
mj usage --format=json
mj usage --format=md
```

Flags: `--format <text|json|md>` (defaults to `text` on a terminal and `json` when stdout is piped).

---

### mj user

User administration utilities.

#### mj user clone

Create a new MemberJunction user as a copy of an existing user (defaults to the `template` preset for template users).

```bash
# Dry-run preview of cloning a template user
mj user clone --from demo.user@example.org --email jane@example.com --first Jane --last Doe --dry-run

# Clone a user with views or settings preset, optionally leaving inactive for review
mj user clone --from alice@example.com --email bob@example.com --first Bob --last Lee --preset with-settings --inactive
```

| Flag | Description |
|------|-------------|
| `--from <email>` | Email of the source user to copy (required) |
| `--email <email>` | Sign-in email of the new user (required) |
| `--first <name>` | First name of the new user (required) |
| `--last <name>` | Last name of the new user (required) |
| `--preset <name>` | Clone preset: `template` (default), `with-views`, `with-settings`, or `none` |
| `--inactive` | Leave the newly created user inactive for review |
| `--dry-run` | Preview what would be copied without creating records |

---

## Hooks

| Hook | Timing | Purpose |
|------|--------|---------|
| `init` | Before any command | Loads configuration, initializes environment |
| `prerun` | Before command execution | Validates configuration, loads bootstrap & dynamic packages for non-light commands |
| `postrun` | After command execution | Releases wake locks and performs post-command cleanup |

## Plugin System

The CLI includes these oclif plugins:

- `@oclif/plugin-help` — Auto-generated help text
- `@oclif/plugin-version` — Version display
- `@oclif/plugin-warn-if-update-available` — Update notifications (checks daily)

Third-party CLI plugins can be registered via `mj plugin add <package>` in `mj-cli-plugins.json`.

## Dependencies

| Package | Purpose |
|---------|---------|
| `@memberjunction/ai-agent-harness` | Multi-account CLI harness pool and runtime integration |
| `@memberjunction/ai-cli` | AI agent, prompt, action, and audit operations |
| `@memberjunction/cli-core` | Shared CLI plugin contract, envelopes, and usage registry |
| `@memberjunction/codegen-lib` | Code generation engine and manifest scanner |
| `@memberjunction/config` | Configuration management |
| `@memberjunction/db-auto-doc` | AI-powered database documentation |
| `@memberjunction/diagnostics` | `.mjdiag` archive verification, scrubbing, timeline, and export |
| `@memberjunction/installer` | Release installation, offline bundling, and environment doctor |
| `@memberjunction/metadata-sync` | Metadata synchronization |
| `@memberjunction/open-app-engine` | Open App lifecycle management |
| `@memberjunction/query-gen` | AI query template generation |
| `@memberjunction/record-cloning` | Entity/user cloning engine |
| `@memberjunction/redis-provider` | Shared Redis cache inspection and invalidation |
| `@memberjunction/server-bootstrap-lite` | Lightweight server initialization |
| `@memberjunction/skyway-core` | Database migration execution |
| `@memberjunction/sql-converter` | Rule-based SQL dialect conversion and auditing |
| `@memberjunction/standards` | Repository engineering standards engine |
| `@memberjunction/testing-cli` | Testing framework CLI |
| `@memberjunction/work-queue-engine` | Durable work queue operations |
| `@oclif/core` | CLI framework |

## License

Business Source License 1.1 — see [LICENSE](../../LICENSE) for details.

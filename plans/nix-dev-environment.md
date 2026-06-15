# Nix-First MJ Dev Environment

**Branch:** `plan/nix-dev-environment`
**Status:** Draft — plan only, no implementation yet.
**Author:** Pranav (with Claude)
**Date:** 2026-06-15
**Replaces:** `MAC_SETUP_GUIDE` (PostgreSQL path only; SQL Server path unchanged)
**Related:** `feature/auth0-magic-link` (may eventually eliminate the remaining auth manual step)

---

## 1. Problem

The MAC_SETUP_GUIDE is ~1,000 lines covering 20 steps: Homebrew, Node.js 24, Git, Docker Desktop, SQL Server 2022 (with Rosetta), two SQL logins, SSMS/Azure Data Studio, sqlcmd, repo clone, MJ CLI, two `.env` files, manual `CREATE DATABASE` + `CREATE USER` SQL, `mj migrate`, build. A new hire spends half a day on tooling before writing a line of code.

Two specific compounding problems:

1. **`DatabaseProvisionPhase` can't script the DB setup end-to-end.** It generates `mj-db-setup.sql` and asks the user to run it in SSMS manually — because SQL Server on Mac requires Docker + Rosetta, and there's no programmatic `CREATE LOGIN` path without a sysadmin connection that itself requires SSMS to establish first. The install phase is literally `prompt: "run this script in SSMS"`.

2. **Parallel worktrees need separate databases.** The current worktree helper (`mj-parallel`) provisions a separate SQL Server Docker container per worktree — ports, Docker volumes, Docker network aliases — to avoid state collisions between `feature/A` and `feature/B`. This is the right idea but the Docker layer is clunky and fragile.

**PostgreSQL solves both.** `psql -c "CREATE ROLE..."` is scriptable with zero GUI. And `devenv.nix`'s `services.postgres` starts an isolated PG instance per-worktree in `.devenv/postgres/` with its own port — no Docker, no port management, no shared state.

The goal: **`devenv up` (or `nix develop`) replaces the entire MAC_SETUP_GUIDE for the PostgreSQL path.** SQL Server devs keep the existing Docker path unchanged.

---

## 2. Confirmed Decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | PostgreSQL via Nix `services.postgres`, not Docker | No Rosetta, no container lifecycle, PG is scriptable (`psql -c`), runs natively on Apple Silicon |
| D2 | SQL Server path unchanged | It works; existing Docker/SSMS setup is the correct story for SQL Server customers |
| D3 | Per-worktree isolated PG in `.devenv/postgres/` | Each `cd worktree && devenv up` starts its own PG on its own port — zero collision |
| D4 | `direnv` + `.envrc` activates the shell on `cd` | No manual `devenv shell`; the environment appears when you enter the directory |
| D5 | `DatabaseProvisionPhase` gets a `PostgresAdapter` alongside `SqlServerAdapter` | Executes `psql -c "CREATE ROLE…"` directly; replaces the SSMS-prompt path for PG |
| D6 | New `db_type: 'postgres' \| 'sqlserver'` field in `InstallConfig` | Single discriminator; installer picks the right adapter; Flyway config generated accordingly |
| D7 | `devenv.nix` + `flake.nix` committed to repo root | Nix config is version-controlled; `direnv allow` is the only per-machine step |
| D8 | Auth is still manual | Azure AD / MSAL app registration can't be automated; one step remains; magic-link may eventually eliminate it |
| D9 | MJ CLI via `shellHook` `npm i -g @memberjunction/cli` | Simpler than packaging it as a Nix derivation for v1; can be nix-packaged later |
| D10 | Worktree helper `mj-worktree-up` script automates port allocation | Wraps `git worktree add` + port selection + `devenv up` so new worktrees are one command |

---

## 3. What `devenv up` Does (End-User Story)

**Before (today, SQL Server, ~20 steps):**
```
Install Homebrew → install Node 24 → install Git → install Docker Desktop →
pull SQL Server image → configure Rosetta → start container → open SSMS →
CREATE LOGIN [MJ_CodeGen] → CREATE LOGIN [MJ_Connect] → CREATE DATABASE →
CREATE USER x2 → EXEC sp_addrolemember x3 → clone repo →
npm i -g @memberjunction/cli → write .env → ln -s .env packages/MJAPI/.env →
edit environment.ts → mj migrate → npm ci → npm run build →
(configure Azure AD — still manual)
```

**After (PostgreSQL + Nix, 4 steps):**
```
curl -L https://nixos.org/nix/install | sh    # one-time: install Nix
brew install devenv direnv                      # one-time: devenv + direnv
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc   # one-time: hook direnv

cd ~/Projects/MJ/MJ
direnv allow && devenv up
# ↳ Node 24, PG 16, MJ CLI all arrive
# ↳ PG starts in .devenv/postgres/, creates DB + roles
# ↳ mj migrate runs automatically
# ↳ npm ci runs automatically

# Then: configure Azure AD (still manual, one-time)
# Then: npm run build && npm run start:api && npm run start:explorer
```

---

## 4. Architecture

### 4.1 `devenv.nix` (repo root)

```nix
{ pkgs, config, ... }: {
  packages = [ pkgs.nodejs_24 pkgs.git ];

  services.postgres = {
    enable = true;
    package = pkgs.postgresql_16;
    dataDir = "${config.env.DEVENV_ROOT}/.devenv/postgres";
    port = 5432;           # overridable in .envrc (see §4.3)
    initialDatabases = [{ name = "MemberJunction"; }];
    initialScript = ''
      CREATE ROLE mj_codegen WITH LOGIN PASSWORD 'dev_codegen';
      CREATE ROLE mj_connect  WITH LOGIN PASSWORD 'dev_connect';
      GRANT ALL ON DATABASE "MemberJunction" TO mj_codegen;
      GRANT CONNECT         ON DATABASE "MemberJunction" TO mj_connect;
    '';
  };

  enterShell = ''
    export DB_TYPE=postgres
    export DB_HOST=localhost
    export DB_PORT=${toString config.services.postgres.port}
    export DB_DATABASE=MemberJunction
    export CODEGEN_DB_USERNAME=mj_codegen
    export CODEGEN_DB_PASSWORD=dev_codegen
    export DB_USERNAME=mj_connect
    export DB_PASSWORD=dev_connect
    export GRAPHQL_PORT=4000
    export MJ_CORE_SCHEMA=__mj

    # Install MJ CLI if not present
    if ! command -v mj &>/dev/null; then
      echo "Installing @memberjunction/cli..."
      npm install -g @memberjunction/cli --silent
    fi

    # One-time npm install
    if [ ! -f node_modules/.mj_install_done ]; then
      npm ci && touch node_modules/.mj_install_done
    fi

    # One-time migration (idempotent — Flyway no-ops on already-applied scripts)
    if [ ! -f .devenv/.mj_migrated ]; then
      echo "Running mj migrate (first time)..."
      mj migrate && touch .devenv/.mj_migrated
    fi

    echo ""
    echo "MJ dev environment ready."
    echo "  npm run build       — compile all packages"
    echo "  npm run start:api   — start MJAPI on :4000"
    echo "  npm run start:explorer — start Explorer on :4200"
    echo ""
  '';
}
```

The `DEVENV_ROOT` variable is set by devenv to the directory containing `devenv.nix`, so `.devenv/postgres/` is always local to that worktree — even if multiple worktrees share the same parent.

### 4.2 `flake.nix` (repo root)

Thin wrapper so `nix develop` works without devenv, for users who prefer plain Nix flakes:

```nix
{
  description = "MemberJunction dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.11";
    devenv.url  = "github:cachix/devenv";
  };

  outputs = { self, nixpkgs, devenv, ... }:
    let
      systems = [ "aarch64-darwin" "x86_64-darwin" "x86_64-linux" "aarch64-linux" ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f system);
    in {
      devShells = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system};
        in {
          default = devenv.lib.mkShell { inherit pkgs; config = import ./devenv.nix; };
        });
    };
}
```

### 4.3 `.envrc` template (checked in at repo root)

```bash
# .envrc — direnv activates this when you cd into the directory.
# Override the PG port here for parallel worktrees (see mj-worktree-up).
export DEVENV_POSTGRES_PORT=5432   # change to 5433, 5434, etc. per worktree

use devenv
```

`direnv allow` is the only per-machine command needed after cloning. `.envrc` is version-controlled; port overrides go in `.envrc.local` (gitignored).

### 4.4 `.gitignore` additions

```gitignore
# Nix / devenv
.devenv/
.direnv/
.envrc.local
```

---

## 5. Installer Changes (`DatabaseProvisionPhase`)

### 5.1 New `db_type` field in `InstallConfig`

```typescript
// packages/MJInstaller/src/models/InstallConfig.ts

export interface InstallConfig {
  // ... existing fields ...

  /**
   * Database engine selection.
   * - `'sqlserver'` (default) — SQL Server via `DatabaseHost`/`DatabasePort`.
   *   Generates `mj-db-setup.sql` + prompts user to run in SSMS.
   * - `'postgres'` — PostgreSQL. `DatabaseProvisionPhase` executes
   *   `psql -c "CREATE ROLE..."` directly; no SSMS prompt.
   */
  DatabaseType: 'sqlserver' | 'postgres';

  /** Default schema name. `__mj` for SQL Server, `__mj` for PG (same). */
  MJCoreSchema: string;
}
```

### 5.2 `PostgresAdapter` (~30 lines, replaces ~200 lines of T-SQL string generation)

```typescript
// packages/MJInstaller/src/adapters/PostgresAdapter.ts

import { execSync } from 'node:child_process';

export interface PgConnectivityResult {
  Reachable: boolean;
  ErrorMessage?: string;
  LatencyMs: number;
}

/**
 * Lightweight adapter for PostgreSQL connectivity checks and role provisioning.
 *
 * Uses the `psql` CLI (available via Nix pkgs.postgresql_16) — no npm driver
 * dependency. This matches the philosophy of SqlServerAdapter (raw TCP for
 * connectivity, no full driver) while also enabling actual role creation,
 * which SQL Server cannot do without sysadmin credentials and a GUI.
 */
export class PostgresAdapter {
  /** Test connectivity by running `psql -c "SELECT 1"`. */
  async CheckConnectivity(host: string, port: number): Promise<PgConnectivityResult> {
    const start = Date.now();
    try {
      execSync(
        `psql -h ${host} -p ${port} -U postgres -c "SELECT 1" -q -t`,
        { stdio: 'pipe', timeout: 5000 }
      );
      return { Reachable: true, LatencyMs: Date.now() - start };
    } catch (err) {
      return {
        Reachable: false,
        ErrorMessage: err instanceof Error ? err.message : String(err),
        LatencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Create roles and grant database permissions — fully scriptable, no SSMS.
   *
   * Idempotent: uses `CREATE ROLE IF NOT EXISTS` and `DO $$ ... IF NOT EXISTS`.
   * Runs as the postgres superuser, which is available in the devenv PG instance.
   */
  async ProvisionDatabase(params: {
    host: string;
    port: number;
    dbName: string;
    codeGenUser: string;
    codeGenPassword: string;
    apiUser: string;
    apiPassword: string;
  }): Promise<void> {
    const { host, port, dbName, codeGenUser, codeGenPassword, apiUser, apiPassword } = params;
    const psql = (sql: string) =>
      execSync(`psql -h ${host} -p ${port} -U postgres -c "${sql.replace(/"/g, '\\"')}" -q`, {
        stdio: 'pipe',
      });

    // Idempotent role creation
    psql(`DO $$ BEGIN
           IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${codeGenUser}')
           THEN CREATE ROLE ${codeGenUser} WITH LOGIN PASSWORD '${codeGenPassword}'; END IF;
         END $$`);
    psql(`DO $$ BEGIN
           IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${apiUser}')
           THEN CREATE ROLE ${apiUser}  WITH LOGIN PASSWORD '${apiPassword}'; END IF;
         END $$`);
    psql(`GRANT ALL ON DATABASE "${dbName}" TO ${codeGenUser}`);
    psql(`GRANT CONNECT ON DATABASE "${dbName}" TO ${apiUser}`);
  }
}
```

### 5.3 Updated `DatabaseProvisionPhase.Run()`

The existing `Run()` checks `config.DatabaseType` at the top and dispatches:

```typescript
async Run(context: DatabaseProvisionContext): Promise<DatabaseProvisionResult> {
  if (context.Config.DatabaseType === 'postgres') {
    return this.runPostgres(context);
  }
  return this.runSqlServer(context);  // existing path, unchanged
}
```

`runPostgres()` calls `PostgresAdapter.ProvisionDatabase()` directly — no script files, no SSMS prompt, no `promptForScriptExecution`. It returns `{ ScriptsGenerated: [], ValidationPassed: true }`. The existing `runSqlServer()` is the current `Run()` body, extracted verbatim.

### 5.4 Flyway config for PG

`MigratePhase` already calls `mj migrate`, which invokes Flyway. Flyway supports PG natively. The configure phase generates the right Flyway URL based on `DatabaseType`:

```
# SQL Server (current)
url=jdbc:sqlserver://localhost:1433;databaseName=MemberJunction;trustServerCertificate=true

# PostgreSQL (new)
url=jdbc:postgresql://localhost:5432/MemberJunction
```

The migrations themselves need PG-compatible SQL (see §7 Open Questions — this is the largest unknown).

---

## 6. Worktree Story

### 6.1 The unlock

Today, every worktree shares the same SQL Server Docker container. Running `mj migrate` in `feature/A` while `feature/B` is mid-migration corrupts both. The `mj-parallel` skill provisions a separate container per worktree, but Docker overhead is real: images cached but containers started from scratch, port management is custom bash, teardown is manual.

With `devenv.nix`:
- `cd MJ-feature-A && devenv up` → PG starts in `MJ-feature-A/.devenv/postgres/` on port 5432
- `cd MJ-feature-B && devenv up` → PG starts in `MJ-feature-B/.devenv/postgres/` on port 5433
- `direnv` activates the environment automatically on `cd` — `DB_PORT` points at the local instance
- Teardown: `devenv down` or just `cd` away (PG stops when no process holds it)

Each worktree is a hermetically isolated dev environment. No Docker. No shared state.

### 6.2 `mj-worktree-up` helper script

Committed to `scripts/mj-worktree-up` (executable):

```bash
#!/usr/bin/env bash
# Usage: ./scripts/mj-worktree-up <branch-name> [--port <N>]
# Creates a git worktree for <branch-name>, allocates an isolated PG port,
# writes .envrc.local with the port override, and runs devenv up.

set -euo pipefail
BRANCH="${1:?Usage: mj-worktree-up <branch-name> [--port N]}"
PORT="${3:-}"

# Find the next free port in the 5433–5500 range if not specified
if [ -z "$PORT" ]; then
  PORT=5432
  for p in $(seq 5433 5500); do
    if ! lsof -i ":$p" &>/dev/null; then PORT=$p; break; fi
  done
fi

WORKTREE_DIR="../MJ-${BRANCH//\//-}"

echo "Creating worktree at $WORKTREE_DIR on branch $BRANCH (PG port $PORT)"
git worktree add "$WORKTREE_DIR" -b "$BRANCH"

# Write port override
cat > "$WORKTREE_DIR/.envrc.local" <<EOF
export DEVENV_POSTGRES_PORT=$PORT
EOF

cd "$WORKTREE_DIR"
direnv allow
devenv up --detach   # start PG in background

echo ""
echo "Worktree ready: $WORKTREE_DIR"
echo "  cd $WORKTREE_DIR"
echo "  npm run build && npm run start:api"
```

`devenv up --detach` starts the PG service in the background; the developer enters the directory and the shell activates via direnv automatically.

---

## 7. What Gets Deleted

Once this lands, the MAC_SETUP_GUIDE shrinks from 20 steps to 3 for PG users:

1. **Install Nix + devenv + direnv** (one-time, 3 commands)
2. **`cd MJ && direnv allow && devenv up`** (environment, PG, CLI, migrate, npm ci — all automatic)
3. **Configure Azure AD** (still manual; one-time per developer account)

The Homebrew, Docker, SQL Server, SSMS, sqlcmd, manual `CREATE LOGIN`, `CREATE DATABASE`, `CREATE USER`, `.env` authoring, and symlink sections are gone. The `mj-parallel` Docker-based skill becomes optional legacy.

---

## 8. Implementation Phases

### Phase 1 — `PostgresAdapter` + `db_type` in installer (~1 day)
*The core installer change that makes PG a first-class install target.*

1. Add `DatabaseType: 'sqlserver' | 'postgres'` to `InstallConfig` + `InstallConfigDefaults`.
2. Add `MJCoreSchema` field (default `'__mj'`; same for both DB types but explicit).
3. Write `PostgresAdapter` in `packages/MJInstaller/src/adapters/PostgresAdapter.ts`.
4. Extract `runSqlServer()` from `DatabaseProvisionPhase.Run()` (no behavior change).
5. Add `runPostgres()` that calls `PostgresAdapter.ProvisionDatabase()` — no script files, no SSMS prompt.
6. Update `ConfigurePhase` to write the right Flyway JDBC URL based on `DatabaseType`.
7. Update `PreflightPhase` to check for `psql` binary when `DatabaseType === 'postgres'`.
8. Add unit tests for `PostgresAdapter` (mock `execSync`) and the dispatch logic.
9. Update existing `DatabaseProvisionPhase.test.ts` — add PG path coverage.

Files touched: `InstallConfig.ts`, `DatabaseProvisionPhase.ts`, `PostgresAdapter.ts` (new), `ConfigurePhase.ts`, `PreflightPhase.ts`, `InstallerEngine.ts` (minor: `CreatePlan` PG flag).

### Phase 2 — `devenv.nix` + `flake.nix` + `.envrc` (~half day)
*The developer-facing entry point.*

1. Commit `devenv.nix` to repo root with `services.postgres` + `enterShell`.
2. Commit `flake.nix` wrapping devenv.
3. Commit `.envrc` template (references `$DEVENV_POSTGRES_PORT` from `.envrc.local`).
4. Add `.devenv/`, `.direnv/`, `.envrc.local` to `.gitignore`.
5. Smoke-test on Apple Silicon: `devenv up` → PG starts → `mj migrate` succeeds → MJAPI boots.

Files: `devenv.nix` (new), `flake.nix` (new), `.envrc` (new), `.gitignore` (edit).

### Phase 3 — `mj-worktree-up` helper + updated onboarding doc (~half day)
*The worktree ergonomics and the new 3-step guide.*

1. Write `scripts/mj-worktree-up` (executable bash, port auto-allocation, direnv allow).
2. Write `docs/ONBOARDING_NIX.md` — the new 3-step guide for PostgreSQL devs.
3. Update `MAC_SETUP_GUIDE` header: "SQL Server path — if you're using PostgreSQL, see ONBOARDING_NIX.md".
4. Remove the `mj-parallel` Docker provisioner from the active skill list (keep code, mark deprecated).

---

## 9. Open Questions

| ID | Question | Stakes |
|----|----------|--------|
| O1 | **Migration SQL compatibility.** MJ migrations are authored in T-SQL (SQL Server dialect): `NEWSEQUENTIALID()`, `DATETIMEOFFSET`, `NVARCHAR`, `GO` batches, `sys.schemas` system views. PG does not understand any of these. The `pg-split-and-regenerate` project (`feature/pg-split-and-regenerate`) is in progress and uses sqlglot to transpile the ~2% hand-authored DDL. Is that branch close enough to unblock the PG migration path, or does Phase 1 ship with a `[PG migrations require pg-split branch]` caveat? | Blocking for "works out of the box" |
| O2 | **`mj codegen` against PG.** CodeGen uses `mssql`/`tedious` to read SQL Server system views. Does it have a PG data provider path? If not, CodeGen is blocked on PG and the Nix environment only takes you to "migrated DB + running MJAPI" — CodeGen still needs SQL Server. | Blocking for full PG developer parity |
| O3 | **`psql` as installer dependency.** `PostgresAdapter` calls `execSync('psql ...')`. In a Nix shell, `psql` is always present (`pkgs.postgresql_16` includes it). But the installer also runs outside Nix (e.g., a bare Mac, a Docker CI container). Should `PostgresAdapter` fall back to a JS PG client (`pg` npm package) when `psql` is not in PATH, or add `psql` as an installer prereq and fail fast in `PreflightPhase`? | Installer robustness |
| O4 | **`devenv up --detach` and shell activation.** `devenv up` without `--detach` blocks the terminal (PG runs in the foreground). With `--detach` the PG process is a background daemon. `direnv` + `use devenv` handles the shell environment but may not auto-start detached services. Needs hands-on testing to verify the activation flow is seamless. | Developer experience |
| O5 | **Windows.** This plan is macOS/Linux only (Nix does not run on Windows natively, only via WSL2). Windows devs keep the SQL Server path. Should the onboarding doc note WSL2 + Nix as a supported option? | Scope |

---

## 10. Non-Goals (Explicitly Out of Scope)

- **Packaging `mj` CLI as a Nix derivation.** `shellHook` `npm i -g` works for v1. Proper Nix packaging is a future optimization.
- **Automating Azure AD app registration.** It requires an Entra admin. The auth step stays manual.
- **Migrating existing SQL Server databases to PG.** The PG path is new installs only.
- **Replacing `mj-parallel` for SQL Server users.** The Docker-based parallel worktree skill stays as-is for SQL Server.
- **CI/CD.** The plan targets local developer machines. CI uses the Docker workbench image with SQL Server; no change there.

# devenv.nix — MemberJunction Nix-based development environment.
#
# Usage:
#   devenv up          — start PostgreSQL, install deps, run migrations
#   devenv shell       — enter the dev shell without starting services
#   direnv allow       — auto-activate the shell on `cd` (requires direnv)
#
# Per-worktree isolation: each git worktree gets its own PG data directory
# in .devenv/postgres/ with its own port. Override DEVENV_POSTGRES_PORT in
# .envrc.local to avoid port conflicts between parallel worktrees.
#
# SQL Server users: this file is PostgreSQL-only. See docker/CLAUDE.md for
# the SQL Server Docker path (unchanged).
{ pkgs, config, ... }:
let
  pgPort = if builtins.getEnv "DEVENV_POSTGRES_PORT" != ""
    then builtins.fromJSON (builtins.getEnv "DEVENV_POSTGRES_PORT")
    else 5432;
in
{
  # ── Packages ────────────────────────────────────────────────────────────────
  # Node 24 and git are pinned here. psql comes from services.postgres.
  packages = [
    pkgs.nodejs_24
    pkgs.git
  ];

  # ── PostgreSQL service ───────────────────────────────────────────────────────
  # Each worktree gets its own isolated PG data dir via DEVENV_STATE (which
  # devenv sets to .devenv/state/ inside the worktree root). PGDATA is
  # automatically set to $DEVENV_STATE/postgres — no dataDir option needed.
  services.postgres = {
    enable = true;
    package = pkgs.postgresql_16;
    port = pgPort;
    initialDatabases = [{ name = "MemberJunction"; }];
    # Idempotent role setup — runs only on first init of this PGDATA
    initialScript = ''
      CREATE ROLE mj_codegen WITH LOGIN PASSWORD 'dev_codegen';
      CREATE ROLE mj_connect  WITH LOGIN PASSWORD 'dev_connect';
      GRANT ALL PRIVILEGES ON DATABASE "MemberJunction" TO mj_codegen;
      GRANT CONNECT         ON DATABASE "MemberJunction" TO mj_connect;
    '';
  };

  # ── Shell environment ────────────────────────────────────────────────────────
  # These env vars are exported into the shell automatically.
  # MJAPI and mj codegen read DB_* from the environment (or .env file).
  env = {
    DB_TYPE     = "postgres";
    DB_HOST     = "localhost";
    DB_PORT     = toString pgPort;
    DB_DATABASE = "MemberJunction";
    CODEGEN_DB_USERNAME = "mj_codegen";
    CODEGEN_DB_PASSWORD = "dev_codegen";
    DB_USERNAME = "mj_connect";
    DB_PASSWORD = "dev_connect";
    GRAPHQL_PORT = "4000";
    MJ_CORE_SCHEMA = "__mj";
  };

  # ── Shell hook — runs once on shell entry ────────────────────────────────────
  enterShell = ''
    # Install MJ CLI if not already present
    if ! command -v mj &>/dev/null; then
      echo "Installing @memberjunction/cli..."
      npm install -g @memberjunction/cli --silent
    fi

    # One-time npm ci (sentinel file prevents re-running on every shell entry)
    if [ ! -f node_modules/.mj_install_done ]; then
      echo "Running npm ci..."
      npm ci && touch node_modules/.mj_install_done
    fi

    echo ""
    echo "MJ dev environment ready (PostgreSQL on port ${toString pgPort})."
    echo "  mj migrate               — run database migrations (first time)"
    echo "  npm run build            — compile all packages"
    echo "  npm run start:api        — start MJAPI on :4000"
    echo "  npm run start:explorer   — start Explorer on :4200"
    echo ""
  '';
}

#!/bin/bash
# ─── MJ Database Bootstrap ──────────────────────────────────────────────────
# Creates the MJ database and runs MJ's Skyway migrations (via `mj migrate`) to
# set up the full schema.
#
# Usage:
#   db-bootstrap                    # Uses DB_DATABASE from environment (default: MJ_Workbench)
#   db-bootstrap MyCustomDB         # Creates and migrates a specific database
#   db-bootstrap --migrate-only     # Skip creation, just run migrations
#
set -e

DB_NAME="${1:-${DB_DATABASE:-MJ_Workbench}}"
MIGRATE_ONLY=false

if [ "$1" = "--migrate-only" ]; then
    MIGRATE_ONLY=true
    DB_NAME="${DB_DATABASE:-MJ_Workbench}"
fi

MJ_DIR="/workspace/MJ"
SQL_HOST="${DB_HOST:-sql-claude}"
SQL_USER="${DB_USER:-sa}"
SQL_PASS="${DB_PASSWORD:-Claude2Sql99}"

echo ""
echo "  MJ Database Bootstrap"
echo "  ─────────────────────────────────────────"
echo "  Server:   $SQL_HOST"
echo "  Database: $DB_NAME"
echo "  ─────────────────────────────────────────"
echo ""

# ─── Create database if it doesn't exist ─────────────────────────────────────
if [ "$MIGRATE_ONLY" = false ]; then
    echo "Checking if database '$DB_NAME' exists..."
    RESULT=$(sqlcmd -S "$SQL_HOST" -U "$SQL_USER" -P "$SQL_PASS" -C -h -1 -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM sys.databases WHERE name = '$DB_NAME'" 2>/dev/null | tr -d '[:space:]')

    if [ "$RESULT" = "0" ]; then
        echo "  Creating database '$DB_NAME'..."
        sqlcmd -S "$SQL_HOST" -U "$SQL_USER" -P "$SQL_PASS" -C -Q "CREATE DATABASE [$DB_NAME]"
        echo "  Database created."
    else
        echo "  Database '$DB_NAME' already exists."
    fi
    echo ""
fi

# ─── Run migrations via MJ's Skyway engine (`mj migrate`) ────────────────────
if [ -d "$MJ_DIR" ]; then
    echo "Running migrations (mj / Skyway)..."
    cd "$MJ_DIR"

    # Ensure the .env points to the right database — `mj migrate` reads DB connection
    # and baseline config from mj.config.cjs / .env in this directory.
    if [ -f .env ]; then
        # Update DB_DATABASE in .env if different
        if grep -q "^DB_DATABASE=" .env; then
            sed -i "s/^DB_DATABASE=.*/DB_DATABASE=$DB_NAME/" .env
        else
            echo "DB_DATABASE=$DB_NAME" >> .env
        fi
    fi

    # Use MJ's Skyway engine (the current, supported migration path) rather than the
    # raw Flyway CLI. Skyway leaves unknown ${...} template content in migration SQL
    # literal; raw Flyway treats it as an unresolved placeholder and aborts (e.g.
    # "No value provided for placeholder: ${dateFns.format(rangeStart, 'MMM d, yyyy')}").
    # The globally-installed `mj` CLI auto-selects the highest baseline from the
    # migrations folder — no need to pass baselineVersion/url/user explicitly.
    mj migrate 2>&1 || {
        echo ""
        echo "  Migration failed. Check the mj migrate output above for details."
        echo "  Common issues:"
        echo "    - SQL Server not ready: wait a few seconds and retry"
        echo "    - Schema conflicts: check if __mj schema already has a different baseline"
        echo "    - Stale global CLI: run 'npm update -g @memberjunction/cli'"
        exit 1
    }

    cd /workspace
    echo ""
    echo "  Database bootstrap complete!"
else
    echo "  MJ repo not found at $MJ_DIR"
    echo "  Clone it first: git clone --branch next https://github.com/MemberJunction/MJ.git $MJ_DIR"
    exit 1
fi

echo ""
echo "  Next steps:"
echo "    mjapi     # Start MJAPI (default host port :4000)"
echo "    mjui      # Start MJ Explorer (default host port :4200)"
echo ""

#!/bin/bash
# ─── MJ Database Bootstrap ──────────────────────────────────────────────────
# Creates the MJ database and runs Flyway migrations to set up the full schema.
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

# ─── Run Flyway migrations via MJ CLI ────────────────────────────────────────
if [ -d "$MJ_DIR" ]; then
    echo "Running MJ migrations..."
    cd "$MJ_DIR"

    # Ensure the .env points to the right database
    if [ -f .env ]; then
        # Update DB_DATABASE in .env if different
        if grep -q "^DB_DATABASE=" .env; then
            sed -i "s/^DB_DATABASE=.*/DB_DATABASE=$DB_NAME/" .env
        else
            echo "DB_DATABASE=$DB_NAME" >> .env
        fi
    fi

    # Run migrations using MJ CLI
    mj migrate 2>&1 || {
        echo ""
        echo "  Migration failed. You can also run Flyway directly:"
        echo "    cd $MJ_DIR && flyway migrate \\"
        echo "      -url=\"jdbc:sqlserver://$SQL_HOST:1433;databaseName=$DB_NAME;trustServerCertificate=true\" \\"
        echo "      -user=$SQL_USER -password=$SQL_PASS \\"
        echo "      -locations=filesystem:./migrations"
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
echo "    cd $MJ_DIR && npm run start:api     # Start MJAPI on port 4000 (host: 4100)"
echo "    cd $MJ_DIR && npm run start:explorer # Start Explorer on port 4200 (host: 4300)"
echo ""

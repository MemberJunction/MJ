#!/bin/bash
# ─── MJ PostgreSQL Database Bootstrap ──────────────────────────────────────────
# Verifies the PostgreSQL database is ready and the __mj schema exists.
# The database and schema are created automatically by docker-entrypoint-initdb.d
# scripts on first container start, so this mostly validates connectivity and
# runs any pending migrations.
#
# Usage:
#   db-bootstrap-pg                     # Validate PG is ready, run migrations
#   db-bootstrap-pg --status            # Just check connectivity
#
set -e

PG_HOST="${PG_HOST:-postgres-claude}"
PG_PORT="${PG_PORT:-5432}"
PG_USER="${PG_USER:-mj_admin}"
PG_PASSWORD="${PG_PASSWORD:-Claude2Pg99}"
PG_DATABASE="${PG_DATABASE:-MJ_Workbench_PG}"
MJ_DIR="/workspace/MJ"

export PGPASSWORD="$PG_PASSWORD"

echo ""
echo "  MJ PostgreSQL Bootstrap"
echo "  ─────────────────────────────────────────"
echo "  Server:   $PG_HOST:$PG_PORT"
echo "  Database: $PG_DATABASE"
echo "  User:     $PG_USER"
echo "  ─────────────────────────────────────────"
echo ""

# ─── Check connectivity ────────────────────────────────────────────────────────
echo "Checking PostgreSQL connectivity..."
if ! pg_isready -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" -q; then
    echo "  ERROR: PostgreSQL is not ready at $PG_HOST:$PG_PORT"
    echo "  Make sure the postgres-claude container is running."
    exit 1
fi
echo "  PostgreSQL is ready."

# ─── Verify __mj schema exists ─────────────────────────────────────────────────
SCHEMA_EXISTS=$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" \
    -t -A -c "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = '__mj'" 2>/dev/null)

if [ "$SCHEMA_EXISTS" = "1" ]; then
    echo "  Schema __mj exists."
else
    echo "  Creating __mj schema..."
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" \
        -c "CREATE SCHEMA IF NOT EXISTS __mj;"
    echo "  Schema __mj created."
fi
echo ""

# ─── Status-only mode ──────────────────────────────────────────────────────────
if [ "$1" = "--status" ]; then
    echo "  Tables in __mj schema:"
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" \
        -c "SELECT tablename FROM pg_tables WHERE schemaname = '__mj' ORDER BY tablename;" 2>/dev/null || echo "  (none)"
    echo ""
    TABLE_COUNT=$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" \
        -t -A -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname = '__mj'" 2>/dev/null)
    echo "  Total tables: $TABLE_COUNT"
    exit 0
fi

# ─── Run PostgreSQL migrations ─────────────────────────────────────────────────
PG_MIGRATIONS_DIR="$MJ_DIR/migrations-postgres"

if [ -d "$PG_MIGRATIONS_DIR" ]; then
    echo "Running PostgreSQL migrations from $PG_MIGRATIONS_DIR..."
    echo ""

    # Execute migration files in sorted order
    # Convention: same as Flyway/Skyway naming (V, B, R prefixes)
    for SQL_FILE in $(find "$PG_MIGRATIONS_DIR" -name "*.sql" -type f | sort); do
        FILENAME=$(basename "$SQL_FILE")
        echo "  Executing: $FILENAME"
        psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DATABASE" \
            -f "$SQL_FILE" -v ON_ERROR_STOP=1 2>&1 | tail -3
        echo ""
    done

    echo "  Migrations complete!"
else
    echo "  No PostgreSQL migrations directory found at $PG_MIGRATIONS_DIR"
    echo "  This is expected if you haven't generated the PostgreSQL baseline yet."
    echo ""
    echo "  The postgres-implementation branch will create this directory."
fi

echo ""
echo "  PostgreSQL shortcuts:"
echo "    pgcli         → psql connected to $PG_DATABASE"
echo "    pgq \"SQL\"     → run inline query"
echo "    pgtables      → list tables in __mj schema"
echo "    pgviews       → list views in __mj schema"
echo "    pgfuncs       → list functions in __mj schema"
echo ""

#!/usr/bin/env bash
# Recreate the BigSchemaDemo schemas (and optionally the private database).
#
# This script NEVER touches anyone else's database. It reads DB_* from the
# worktree .env (or --env-file) and refuses to run if DB_DATABASE is a
# well-known shared name (MJ_6_1_0, MJ_DEV, …).
#
# Usage:
#   ./recreate.sh                          # generate smoke? no — standard SQL + apply
#   ./recreate.sh --profile smoke          # 36 tables, seconds
#   ./recreate.sh --profile standard       # 2,880 tables
#   ./recreate.sh --recreate-database      # DROP + CREATE the private DB first
#   ./recreate.sh --bootstrap              # after create: mj migrate + codegen + sync
#
# Always run from this folder or any cwd — paths are resolved from $0.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROFILE="standard"
ENV_FILE="$REPO_ROOT/.env"
RECREATE_DB=0
BOOTSTRAP=0
GENERATE=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --recreate-database) RECREATE_DB=1; shift ;;
    --bootstrap) BOOTSTRAP=1; RECREATE_DB=1; shift ;;
    --no-generate) GENERATE=0; shift ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

# Load KEY=value lines. Strips a single pair of wrapping quotes so values
# written as DB_DATABASE = 'Foo' still work.
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$ ]]; then
    key="${BASH_REMATCH[1]}"
    val="${BASH_REMATCH[2]}"
    val="${val%\"}"; val="${val#\"}"
    val="${val%\'}"; val="${val#\'}"
    export "$key=$val"
  fi
done < "$ENV_FILE"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-1433}"
DB_USERNAME="${DB_USERNAME:-sa}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_DATABASE="${DB_DATABASE:-}"

if [[ -z "$DB_DATABASE" ]]; then
  echo "DB_DATABASE is empty in $ENV_FILE" >&2
  exit 1
fi

case "$DB_DATABASE" in
  MJ_6_1_0|MJ_DEV|MJ_6_0_0|master|tempdb|model|msdb)
    echo "Refusing to run BigSchemaDemo against shared database '$DB_DATABASE'." >&2
    echo "Point the worktree .env at a private name such as MJ_6_1_0_BIG_SCHEMA_CODEGEN." >&2
    exit 1
    ;;
esac

if ! command -v sqlcmd >/dev/null 2>&1; then
  echo "sqlcmd is required on PATH" >&2
  exit 1
fi

SQLCMD=(sqlcmd -S "${DB_HOST},${DB_PORT}" -U "$DB_USERNAME" -P "$DB_PASSWORD" -C -b)

run_sql() {
  "${SQLCMD[@]}" "$@"
}

if [[ $GENERATE -eq 1 ]]; then
  echo "Generating SQL for profile=$PROFILE"
  node "$SCRIPT_DIR/generate.mjs" --profile "$PROFILE"
fi

SQL_DIR="$SCRIPT_DIR/sql/$PROFILE"
if [[ ! -d "$SQL_DIR" ]]; then
  echo "SQL directory missing: $SQL_DIR (run generate.mjs)" >&2
  exit 1
fi

if [[ $RECREATE_DB -eq 1 ]]; then
  echo "Recreating database [$DB_DATABASE] on ${DB_HOST},${DB_PORT}"
  run_sql -d master -Q "IF DB_ID(N'$DB_DATABASE') IS NOT NULL BEGIN ALTER DATABASE [$DB_DATABASE] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$DB_DATABASE]; END; CREATE DATABASE [$DB_DATABASE];"
fi

if [[ $BOOTSTRAP -eq 1 ]]; then
  echo "Bootstrapping MemberJunction into [$DB_DATABASE] (migrate → codegen --skipfiles → sync → codegen --skipdb)"
  (
    cd "$REPO_ROOT"
    npx mj migrate
    npx mj codegen --skipfiles
    npx mj sync push --dir=metadata --ci
    npx mj codegen --skipdb
  )
fi

echo "Applying BigSchemaDemo profile=$PROFILE to [$DB_DATABASE]"
# Drop first so the run is idempotent on an existing private DB.
for file in 00_drop.sql 01_schemas.sql 02_tables.sql 03_fks.sql 04_seed.sql; do
  echo "  $file"
  run_sql -d "$DB_DATABASE" -i "$SQL_DIR/$file"
done

echo "Done. Schemas are bsd_* in [$DB_DATABASE]."
echo "Next (from the worktree root, using THIS .env):"
echo "  npx mj codegen"
echo "Demo schemas should be routed via schemaOutput / includeSchemas — see README.md."

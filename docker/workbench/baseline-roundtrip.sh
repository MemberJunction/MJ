#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────
# baseline-roundtrip
#
# End-to-end deterministic baseline test inside the Claude Dev Workbench.
#
# Two modes:
#   1. AUTO (within-major rebaseline) — default when --baseline-version is omitted.
#      Scans the source migrations dir, picks the latest V-file, and uses its
#      Major.Minor as the new baseline version (with timestamp = latest V's
#      timestamp + 1 minute). Output sorts after the V-stack it succeeds.
#
#   2. EXPLICIT (major-boundary baseline) — when --baseline-version M.N is given.
#      Used to start a brand-new major version (e.g., v6.0). Output uses now() as
#      the timestamp.
#
# Steps (mssql):
#   1. Drop+create scratch DB MJ_BL_Stack
#   2. flyway migrate against MJ_BL_Stack (the V-stack gold standard)
#   3. mj baseline build → emits B<ts>__v<ver>.x__Baseline.sql
#   4. Drop+create scratch DB MJ_BL_New
#   5. Apply the new baseline file to MJ_BL_New (sqlcmd -i)
#   6. mj baseline compare --left MJ_BL_Stack --right MJ_BL_New --row-compare full
#   7. Tee the report to /workspace/MJ/.workbench/baseline-compare-<ts>.{json,md}
#
# Steps (postgres): same shape, with `mj migrate convert` producing the PG
# baseline before apply, and migrations-pg as the V-stack source.
# ──────────────────────────────────────────────────────────────────────────
set -e

DIALECT="mssql"
BASELINE_VERSION=""
SOURCE_DIR=""
DESCRIPTION="MemberJunction Baseline"
KEEP_DBS=0
ROW_COMPARE="full"
MIGRATIONS_DIR=""
OUT_DIR="/workspace/MJ/.workbench"

usage() {
  cat <<EOF
Usage: baseline-roundtrip [--baseline-version <Major.Minor>] [options]

Default mode is AUTO: derive the baseline version + timestamp from the latest
V-file in --source-dir (within-major rebaseline). Pass --baseline-version to
force EXPLICIT mode (major-boundary baseline).

Options:
  --dialect mssql|postgres   default: mssql
  --baseline-version <x.y>   optional; omit for auto/within-major mode
  --source-dir <path>        directory to scan for V-files (auto mode).
                             default: /workspace/MJ/migrations/v<latest>
  --description <text>       header description
  --migrations <path>        override flyway migrations source for phase 2
                             (default: /workspace/MJ/migrations)
  --row-compare <mode>       full|hash|counts|none (default: full)
  --keep-dbs                 don't drop scratch DBs after run
  --out <dir>                report output dir (default: /workspace/MJ/.workbench)
  -h, --help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dialect) DIALECT="$2"; shift 2 ;;
    --baseline-version) BASELINE_VERSION="$2"; shift 2 ;;
    --source-dir) SOURCE_DIR="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    --migrations) MIGRATIONS_DIR="$2"; shift 2 ;;
    --row-compare) ROW_COMPARE="$2"; shift 2 ;;
    --keep-dbs) KEEP_DBS=1; shift ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 1 ;;
  esac
done

mkdir -p "$OUT_DIR"

STACK_DB="MJ_BL_Stack"
NEW_DB="MJ_BL_New"
TS=$(date -u +%Y%m%d%H%M%S)
MJ_DIR="/workspace/MJ"

# Default --source-dir to the highest migrations/v*/ if not provided.
if [[ -z "$SOURCE_DIR" && -d "$MJ_DIR/migrations" ]]; then
  CANDIDATE=$(ls -1d "$MJ_DIR/migrations"/v* 2>/dev/null | sort -t v -k2 -n | tail -n1 || true)
  if [[ -n "$CANDIDATE" && -d "$CANDIDATE" ]]; then
    SOURCE_DIR="$CANDIDATE"
  fi
fi

if [[ -z "$BASELINE_VERSION" ]]; then
  MODE="AUTO (within-major)"
  if [[ -z "$SOURCE_DIR" ]]; then
    echo "ERROR: AUTO mode requires --source-dir or a discoverable migrations/v*/ directory"
    exit 1
  fi
  BASELINE_LABEL="auto from $SOURCE_DIR"
else
  MODE="EXPLICIT (major-boundary)"
  BASELINE_LABEL="v${BASELINE_VERSION}.x"
fi

cat <<EOF
╔══════════════════════════════════════════════════════════════════════════╗
║  Baseline Roundtrip                                                      ║
╠══════════════════════════════════════════════════════════════════════════╣
║  Mode              : ${MODE}
║  Dialect           : ${DIALECT}
║  Baseline          : ${BASELINE_LABEL}
║  Source dir        : ${SOURCE_DIR:-<none>}
║  Stack (gold) DB   : ${STACK_DB}
║  Target (new) DB   : ${NEW_DB}
║  Row compare       : ${ROW_COMPARE}
║  Output            : ${OUT_DIR}
╚══════════════════════════════════════════════════════════════════════════╝
EOF

# Clear any prior B-files in OUT_DIR so the post-build glob picks up THIS run's file.
rm -f "$OUT_DIR"/B*__Baseline.sql 2>/dev/null || true

build_args=()
if [[ -n "$BASELINE_VERSION" ]]; then
  build_args+=(--baseline-version "$BASELINE_VERSION")
fi
if [[ -n "$SOURCE_DIR" ]]; then
  build_args+=(--source-dir "$SOURCE_DIR")
fi
build_args+=(--description "$DESCRIPTION" --out "$OUT_DIR" --verbose)

if [[ "$DIALECT" == "mssql" ]]; then
  : "${DB_HOST:=sql-claude}"
  : "${DB_USER:=sa}"
  : "${DB_PASSWORD:=Claude2Sql99}"
  : "${MIGRATIONS_DIR:=$MJ_DIR/migrations}"

  drop_create_mssql() {
    local DB="$1"
    sqlcmd -S "$DB_HOST" -U "$DB_USER" -P "$DB_PASSWORD" -C -b -Q "
      IF DB_ID('$DB') IS NOT NULL BEGIN
        ALTER DATABASE [$DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
        DROP DATABASE [$DB];
      END
      CREATE DATABASE [$DB];"
  }

  echo ""; echo "▸ Phase 1: drop+create $STACK_DB"
  drop_create_mssql "$STACK_DB"

  echo "▸ Phase 2: apply V-stack to $STACK_DB (flyway)"
  flyway migrate \
    -url="jdbc:sqlserver://${DB_HOST}:1433;databaseName=${STACK_DB};trustServerCertificate=true" \
    -user="${DB_USER}" -password="${DB_PASSWORD}" \
    -schemas=__mj -createSchemas=true \
    -baselineVersion=202602061600 -baselineOnMigrate=true \
    -locations="filesystem:${MIGRATIONS_DIR}"

  echo "▸ Phase 3: build baseline from $STACK_DB"
  cd "$MJ_DIR/packages/MJCLI"
  DB_DATABASE="$STACK_DB" CODEGEN_DB_USERNAME="$DB_USER" CODEGEN_DB_PASSWORD="$DB_PASSWORD" \
    DB_HOST="$DB_HOST" \
    mj baseline build \
      --database "$STACK_DB" \
      "${build_args[@]}"

  BASELINE_FILE=$(ls -1t "$OUT_DIR"/B*__Baseline.sql 2>/dev/null | head -n1)
  if [[ -z "$BASELINE_FILE" ]]; then
    echo "ERROR: baseline build did not produce a B*__Baseline.sql file in $OUT_DIR"
    exit 1
  fi
  echo "  ✓ Baseline file: $BASELINE_FILE"

  echo "▸ Phase 4: drop+create $NEW_DB"
  drop_create_mssql "$NEW_DB"

  echo "▸ Phase 5: apply baseline to $NEW_DB"
  sqlcmd -S "$DB_HOST" -U "$DB_USER" -P "$DB_PASSWORD" -C -d "$NEW_DB" -b -i "$BASELINE_FILE"

  echo "▸ Phase 6: compare $STACK_DB ↔ $NEW_DB"
  DB_HOST="$DB_HOST" CODEGEN_DB_USERNAME="$DB_USER" CODEGEN_DB_PASSWORD="$DB_PASSWORD" \
    DB_DATABASE="$STACK_DB" \
    mj baseline compare \
      --left "$STACK_DB" --right "$NEW_DB" \
      --dialect mssql \
      --row-compare "$ROW_COMPARE" \
      --out "$OUT_DIR" \
      --fail-on-diff

elif [[ "$DIALECT" == "postgres" ]]; then
  : "${PG_HOST:=postgres-claude}"
  : "${PG_PORT:=5432}"
  : "${PG_USER:=mj_admin}"
  : "${PG_PASSWORD:=Claude2Pg99}"
  : "${MIGRATIONS_DIR:=$MJ_DIR/migrations-pg/v5}"

  export PGPASSWORD="$PG_PASSWORD"
  drop_create_pg() {
    local DB="$1"
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 -c "
      DROP DATABASE IF EXISTS \"$DB\";
      CREATE DATABASE \"$DB\";"
  }

  echo ""; echo "▸ Phase 1: drop+create $STACK_DB (PG)"
  drop_create_pg "$STACK_DB"

  echo "▸ Phase 2: apply V-stack to $STACK_DB (mj migrate)"
  PG_DATABASE="$STACK_DB" mj migrate --verbose

  echo "▸ Phase 3: build baseline (T-SQL) from a parallel MSSQL gold DB"
  echo "    NOTE: PG roundtrip currently requires running the MSSQL leg first."
  echo "    A future iteration will introspect PG natively to emit a PG baseline."
  echo "    For now: run baseline-roundtrip --dialect mssql first; we then "
  echo "    convert the resulting T-SQL via 'mj migrate convert' and apply."

  TSQL_BASELINE=$(ls -1t "$OUT_DIR"/B*__Baseline.sql 2>/dev/null | head -n1 || true)
  if [[ -z "$TSQL_BASELINE" ]]; then
    echo "ERROR: no T-SQL baseline file found in $OUT_DIR. Run --dialect mssql first."
    exit 1
  fi

  PG_BASELINE="${TSQL_BASELINE%.sql}.pg.sql"
  echo "▸ Phase 4: convert to PG via mj migrate convert"
  mj migrate convert --input "$TSQL_BASELINE" --output "$PG_BASELINE"

  echo "▸ Phase 5: drop+create $NEW_DB and apply"
  drop_create_pg "$NEW_DB"
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$NEW_DB" -v ON_ERROR_STOP=1 -f "$PG_BASELINE"

  echo "▸ Phase 6: compare $STACK_DB ↔ $NEW_DB (PG)"
  DB_HOST="$PG_HOST" CODEGEN_DB_USERNAME="$PG_USER" CODEGEN_DB_PASSWORD="$PG_PASSWORD" \
    DB_DATABASE="$STACK_DB" \
    mj baseline compare \
      --left "$STACK_DB" --right "$NEW_DB" \
      --dialect postgres \
      --row-compare "$ROW_COMPARE" \
      --out "$OUT_DIR" \
      --fail-on-diff

else
  echo "ERROR: unknown --dialect $DIALECT (expected mssql or postgres)"
  exit 1
fi

if [[ "$KEEP_DBS" == "0" ]]; then
  echo ""
  echo "▸ Cleanup: dropping scratch DBs (use --keep-dbs to retain)"
  if [[ "$DIALECT" == "mssql" ]]; then
    sqlcmd -S "$DB_HOST" -U "$DB_USER" -P "$DB_PASSWORD" -C -b -Q "
      IF DB_ID('$STACK_DB') IS NOT NULL BEGIN ALTER DATABASE [$STACK_DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$STACK_DB]; END;
      IF DB_ID('$NEW_DB') IS NOT NULL BEGIN ALTER DATABASE [$NEW_DB] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [$NEW_DB]; END;"
  else
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$STACK_DB\";"
    psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$NEW_DB\";"
  fi
fi

echo ""
echo "✓ Baseline roundtrip complete. Reports in $OUT_DIR"

#!/bin/bash
# Fresh-install bootstrap for the split-and-regenerate PG pipeline — REPO-ONLY:
# every input is a committed file; no fixture database required.
#
#   ./scripts/pgdiff-bootstrap.sh <db> <astDir> [packFile]
#
# Builds a working, codegen-complete PG database from AST-converted migrations:
#   1. fresh <db> + latest AST baseline (full schema AND metadata seed — baselines
#      keep their metadata DML through the transpiler, so codegen can boot)
#   2. bootstrap pack: metadata-layer views + functions (vwEntities /
#      vwSQLTablesAndEntities / introspection fns) extracted from the latest
#      COMMITTED PG baseline in migrations-pg/v5 — these query sys.* on SQL Server
#      so they can't be transpiled; their PG versions are versioned source
#   3. post-baseline V migrations (new-entity registration INSERTs land on the
#      seeded metadata), then the pack re-applies — transpiled ALTER COLUMNs drop
#      dependent views (codegen rebuilds them, but a few are read by codegen's own
#      startup, e.g. vwApplicationSettings)
#   4. roles + introspection helper + Owner user (scripts/pg-bootstrap-helpers.sql)
#   5. mj codegen, AWAITED (scripts/pg-codegen-await.mjs), DB-side only (--skipfiles)
#
# Container: postgres-claude on :5433, user mj_admin. Timing for each step is printed.
set -u
DB="${1:?database}"; AST="${2:?dir of .pg.sql}"
PACK="${3:-$(ls migrations-pg/v5/B*.pg.sql 2>/dev/null | sort | tail -1)}"
[ -z "$PACK" ] && { echo "no committed PG baseline found for the bootstrap pack"; exit 1; }
PSQL="docker exec -i -e PGPASSWORD=Claude2Pg99 postgres-claude psql -U mj_admin"
T0=$(date +%s)
step() { echo; echo "[$1] $2  (t+$(( $(date +%s) - T0 ))s)"; }

step 1/5 "fresh $DB + latest AST baseline (schema + metadata seed)"
# DROP/CREATE can't run in a transaction block — separate -c calls.
$PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB;" >/dev/null
$PSQL -d postgres -c "CREATE DATABASE $DB;" >/dev/null
$PSQL -d "$DB" -c "CREATE SCHEMA IF NOT EXISTS __mj; CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null
LATEST_B=$(ls "$AST"/B*.pg.sql 2>/dev/null | sort | tail -1)
[ -z "$LATEST_B" ] && { echo "no baseline found in $AST"; exit 1; }
STAGE_B=/tmp/_bootstrap_b; rm -rf "$STAGE_B"; mkdir -p "$STAGE_B"; cp "$LATEST_B" "$STAGE_B/"
# SQL Server CHECK string-lists compare case-INsensitively (collation), PG's don't —
# so a baseline can carry data its own CHECK rejects on PG (EntityField.CodeType has
# 'Typescript' rows vs the CHECK's 'TypeScript'). One bad row aborts a whole multi-row
# INSERT and silently loses ~1k metadata rows. These value-list CHECKs are
# codegen-owned (regenerated from EntityFieldValue in step 5) — strip them from the
# staged copy rather than lose seed rows.
STAGED="$STAGE_B/$(basename "$LATEST_B")" python3 - <<'EOF'
import os, re
p = os.environ['STAGED']
src = open(p).read()
stripped, n = re.subn(r',?\s*CONSTRAINT\s+"CK_EntityField_CodeType"\s+CHECK\s*\((?:[^()]|\([^()]*\))*\)', '', src)
open(p, 'w').write(stripped)
print(f"stripped {n} codegen-owned CHECK constraint(s) from the staged baseline")
EOF
echo "baseline: $(basename "$LATEST_B")"
./scripts/pgdiff-apply-psql.sh "$DB" "$STAGE_B" /tmp/pgdiff/bootstrap-baseline.txt
echo "Entity rows from baseline seed: $($PSQL -d "$DB" -tA -c 'SELECT COUNT(*) FROM __mj."Entity";')"

step 2/5 "bootstrap pack: metadata-layer views + functions (from $(basename "$PACK"))"
# Keep only view/function/procedure definitions; apply twice continue-on-error so
# view-on-view dependencies settle. Generated objects that fail are fine — codegen
# regenerates them in step 5; what MUST land is the vwEntities metadata layer.
PACK_FILE="$PACK" python3 - <<'EOF'
import os, re
src = open(os.environ['PACK_FILE']).read()
stmts = re.split(r'\n(?=CREATE )', src)
keep = [s for s in stmts if re.match(r'CREATE (OR REPLACE )?(VIEW|FUNCTION|PROCEDURE)\b', s)]
open('/tmp/_bootstrap_pack.sql', 'w').write('\n'.join(keep))
print(f"bootstrap pack: {len(keep)} view/function definitions")
EOF
docker cp /tmp/_bootstrap_pack.sql postgres-claude:/tmp/_bootstrap_pack.sql >/dev/null
$PSQL -d "$DB" -v ON_ERROR_STOP=0 -f /tmp/_bootstrap_pack.sql >/dev/null 2>&1
$PSQL -d "$DB" -v ON_ERROR_STOP=0 -f /tmp/_bootstrap_pack.sql >/dev/null 2>/tmp/_pack_errs.txt
echo "pack applied (residual errors on 2nd pass: $(grep -c ERROR /tmp/_pack_errs.txt || true) — codegen regenerates those)"

step 3/5 "post-baseline V migrations + pack re-apply"
B_TS=$(basename "$LATEST_B" | sed -E 's/^B([0-9]+)__.*/\1/')
STAGE_V=/tmp/_bootstrap_v; rm -rf "$STAGE_V"; mkdir -p "$STAGE_V"
# Include committed `.pg-only.sql` files (PG-specific hand-authored content — the
# scheduling/watchdog sprocs and maintenance-fn updates ship there) alongside the
# converted V*.pg.sql.
for f in "$AST"/V*.pg.sql migrations-pg/v5/V*.pg-only.sql; do
  [ -e "$f" ] || continue
  ts=$(basename "$f" | sed -E 's/^V([0-9]+)__.*/\1/')
  [ "$ts" -gt "$B_TS" ] && cp "$f" "$STAGE_V/"
done
echo "applying $(ls "$STAGE_V" | wc -l | tr -d ' ') post-baseline migrations"
./scripts/pgdiff-apply-psql.sh "$DB" "$STAGE_V" /tmp/pgdiff/bootstrap-postv.txt
echo "Entity rows after V migrations: $($PSQL -d "$DB" -tA -c 'SELECT COUNT(*) FROM __mj."Entity";')"
# Restore metadata-layer views dropped by transpiled ALTER COLUMN pg_depend blocks.
$PSQL -d "$DB" -v ON_ERROR_STOP=0 -f /tmp/_bootstrap_pack.sql >/dev/null 2>&1
$PSQL -d "$DB" -v ON_ERROR_STOP=0 -f /tmp/_bootstrap_pack.sql >/dev/null 2>&1
echo "pack re-applied post-V (views now: $($PSQL -d "$DB" -tA -c "SELECT COUNT(*) FROM information_schema.views WHERE table_schema='__mj';"))"

step 4/5 "roles + introspection helper + Owner user"
docker cp ./scripts/pg-bootstrap-helpers.sql postgres-claude:/tmp/_helpers.sql >/dev/null
$PSQL -d "$DB" -v ON_ERROR_STOP=0 -f /tmp/_helpers.sql >/dev/null 2>&1
$PSQL -d "$DB" -c "
  INSERT INTO __mj.\"User\" (\"ID\",\"Name\",\"Email\",\"Type\",\"IsActive\",\"LinkedRecordType\")
  VALUES ('00000000-0000-0000-0000-000000000002','Owner','owner@memberjunction.local','Owner',TRUE,'None')
  ON CONFLICT (\"ID\") DO NOTHING;" >/dev/null

step 5/5 "mj codegen (awaited, DB-side only)"
DB_PLATFORM=postgresql DB_HOST=localhost DB_PORT=5433 DB_DATABASE="$DB" \
DB_USERNAME=mj_admin DB_PASSWORD=Claude2Pg99 \
CODEGEN_DB_USERNAME=mj_admin CODEGEN_DB_PASSWORD=Claude2Pg99 \
MJ_CORE_SCHEMA=__mj \
node scripts/pg-codegen-await.mjs --skipfiles
CODEGEN_RC=$?

ENTITIES=$($PSQL -d "$DB" -tA -c 'SELECT COUNT(*) FROM __mj."Entity";')
FNS=$($PSQL -d "$DB" -tA -c "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema='__mj';")
echo
echo "bootstrap done in $(( $(date +%s) - T0 ))s. Entity=$ENTITIES functions=$FNS codegen_rc=$CODEGEN_RC"
exit $CODEGEN_RC

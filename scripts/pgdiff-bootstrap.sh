#!/bin/bash
# Fresh-install bootstrap for the split-and-regenerate PG pipeline.
#
#   ./scripts/pgdiff-bootstrap.sh <db> <astDir> <oracleDB>
#
# Builds a working, codegen-complete PG database from AST-converted migrations:
#   1. fresh <db> + LATEST baseline only (full schema snapshot)
#   2. bootstrap pack: metadata-layer views + functions dumped from <oracleDB>
#      (vwEntities/vwSQLTablesAndEntities/introspection fns — these query sys.* on
#      SQL Server so they can't be transpiled; the oracle's PG versions are the fixture)
#   3. seed the MJ_Metadata dataset tables from <oracleDB> (codegen loads metadata via
#      the Dataset, and requires Entity rows to PRE-exist — see project notes)
#   4. apply the post-baseline V migrations — AFTER the metadata seed, so their
#      entity-REGISTRATION INSERTs (new entities the stale oracle lacks) land with
#      their FK parents (Role/Application/Entity) present
#   5. roles + introspection helper + Owner user; then mj codegen, AWAITED
#      (scripts/pg-codegen-await.mjs), DB-side only (--skipfiles)
#
# Container: postgres-claude on :5433, user mj_admin. Timing for each step is printed.
set -u
DB="${1:?database}"; AST="${2:?dir of .pg.sql}"; ORACLE="${3:?oracle db (pg_known_good)}"
PSQL="docker exec -i -e PGPASSWORD=Claude2Pg99 postgres-claude psql -U mj_admin"
T0=$(date +%s)
step() { echo; echo "[$1] $2  (t+$(( $(date +%s) - T0 ))s)"; }

step 1/5 "fresh $DB + latest AST baseline"
# DROP/CREATE can't run in a transaction block — separate -c calls.
$PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB;" >/dev/null
$PSQL -d postgres -c "CREATE DATABASE $DB;" >/dev/null
$PSQL -d "$DB" -c "CREATE SCHEMA IF NOT EXISTS __mj; CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null
LATEST_B=$(ls "$AST"/B*.pg.sql 2>/dev/null | sort | tail -1)
[ -z "$LATEST_B" ] && { echo "no baseline found in $AST"; exit 1; }
STAGE_B=/tmp/_bootstrap_b; rm -rf "$STAGE_B"; mkdir -p "$STAGE_B"; cp "$LATEST_B" "$STAGE_B/"
echo "baseline: $(basename "$LATEST_B")"
./scripts/pgdiff-apply-psql.sh "$DB" "$STAGE_B" /tmp/pgdiff/bootstrap-baseline.txt

step 2/5 "bootstrap pack: metadata-layer views + functions (from $ORACLE)"
# Dump only views/functions from the oracle; apply twice continue-on-error so
# view-on-view dependencies settle. Generated objects that fail here are fine —
# codegen regenerates them in step 5.
docker exec -e PGPASSWORD=Claude2Pg99 postgres-claude pg_dump -U mj_admin -d "$ORACLE" \
  --schema-only --schema=__mj --no-owner --no-privileges > /tmp/_oracle_schema.sql
python3 - <<'EOF'
import re
src = open('/tmp/_oracle_schema.sql').read()
# Keep CREATE [OR REPLACE] VIEW / FUNCTION / PROCEDURE statements only.
stmts = re.split(r'\n(?=CREATE )', src)
keep = [s for s in stmts if re.match(r'CREATE (OR REPLACE )?(VIEW|FUNCTION|PROCEDURE)\b', s)]
open('/tmp/_oracle_viewsfns.sql', 'w').write('\n'.join(keep))
print(f"bootstrap pack: {len(keep)} view/function definitions")
EOF
docker cp /tmp/_oracle_viewsfns.sql postgres-claude:/tmp/_oracle_viewsfns.sql >/dev/null
$PSQL -d "$DB" -v ON_ERROR_STOP=0 -f /tmp/_oracle_viewsfns.sql >/dev/null 2>&1
$PSQL -d "$DB" -v ON_ERROR_STOP=0 -f /tmp/_oracle_viewsfns.sql >/dev/null 2>/tmp/_pack_errs.txt
echo "pack applied (residual errors on 2nd pass: $(grep -c ERROR /tmp/_pack_errs.txt || true) — codegen regenerates those)"

step 3/5 "seed core metadata data (MJ_Metadata dataset tables from $ORACLE)"
# The dataset's table list comes from the oracle itself. EntityField's CodeType CHECK
# is dropped first (oracle data predates a casing fix; codegen regenerates the CHECK).
TABLES=$($PSQL -d "$ORACLE" -tA -c "
  SELECT DISTINCT e.\"BaseTable\" FROM __mj.\"DatasetItem\" di
  JOIN __mj.\"Dataset\" d ON d.\"ID\" = di.\"DatasetID\"
  JOIN __mj.\"Entity\" e ON e.\"ID\" = di.\"EntityID\"
  WHERE d.\"Name\" = 'MJ_Metadata' AND e.\"SchemaName\" = '__mj';" | grep -v '^$')
TABLES="Dataset DatasetItem $TABLES"
# Stale-oracle data can violate CHECKs whose widening migration is POST-baseline
# (applied in step 4, after this seed): CodeType ('Typescript' casing) and
# ExtendedType ('Icon' added by the v5.39 Widen migration, which re-creates the
# CHECK itself in step 4). One violating row aborts the whole COPY for that table.
$PSQL -d "$DB" -c "ALTER TABLE __mj.\"EntityField\" DROP CONSTRAINT IF EXISTS \"CK_EntityField_CodeType\";
ALTER TABLE __mj.\"EntityField\" DROP CONSTRAINT IF EXISTS \"CK_EntityField_ExtendedType\";" >/dev/null 2>&1
# Build pg_dump args as an array passed straight to docker exec — no sh -c layer,
# so the case-preserving quotes inside each --table pattern survive intact.
DUMP_ARGS=(pg_dump -U mj_admin -d "$ORACLE" --data-only --no-owner)
for t in $TABLES; do DUMP_ARGS+=("--table=__mj.\"$t\""); done
docker exec -e PGPASSWORD=Claude2Pg99 postgres-claude "${DUMP_ARGS[@]}" > /tmp/_oracle_seed.sql
docker cp /tmp/_oracle_seed.sql postgres-claude:/tmp/_oracle_seed.sql >/dev/null
# session_replication_role=replica skips FK enforcement during the bulk load (the DB
# is baseline-only at this point, so the seed tables are empty — no PK collisions)
$PSQL -d "$DB" -v ON_ERROR_STOP=0 -c "SET session_replication_role = replica;" \
  -f /tmp/_oracle_seed.sql > /dev/null 2>/tmp/_seed_errs.txt || true
echo "seeded $(echo $TABLES | wc -w | tr -d ' ') tables (errors: $(grep -c ERROR /tmp/_seed_errs.txt || true)); Entity rows: $($PSQL -d "$DB" -tA -c 'SELECT COUNT(*) FROM __mj."Entity";')"

step 4/5 "post-baseline V migrations (registration INSERTs land on seeded metadata)"
B_TS=$(basename "$LATEST_B" | sed -E 's/^B([0-9]+)__.*/\1/')
STAGE_V=/tmp/_bootstrap_v; rm -rf "$STAGE_V"; mkdir -p "$STAGE_V"
for f in "$AST"/V*.pg.sql; do
  ts=$(basename "$f" | sed -E 's/^V([0-9]+)__.*/\1/')
  [ "$ts" -gt "$B_TS" ] && cp "$f" "$STAGE_V/"
done
echo "applying $(ls "$STAGE_V" | wc -l | tr -d ' ') post-baseline migrations"
./scripts/pgdiff-apply-psql.sh "$DB" "$STAGE_V" /tmp/pgdiff/bootstrap-postv.txt
echo "Entity rows after V migrations: $($PSQL -d "$DB" -tA -c 'SELECT COUNT(*) FROM __mj."Entity";')"
# Transpiled ALTER COLUMNs drop dependent views (pg_depend DO blocks) — codegen
# regenerates them, but a few are read by codegen's OWN startup (vwApplicationSettings
# via the dataset status check). Re-apply the oracle view/function pack to restore them.
$PSQL -d "$DB" -v ON_ERROR_STOP=0 -f /tmp/_oracle_viewsfns.sql >/dev/null 2>&1
$PSQL -d "$DB" -v ON_ERROR_STOP=0 -f /tmp/_oracle_viewsfns.sql >/dev/null 2>&1
echo "view/function pack re-applied post-V (views now: $($PSQL -d "$DB" -tA -c "SELECT COUNT(*) FROM information_schema.views WHERE table_schema='__mj';"))"

step 5a/5 "roles + introspection helper + Owner user"
docker cp ./scripts/pg-bootstrap-helpers.sql postgres-claude:/tmp/_helpers.sql >/dev/null
$PSQL -d "$DB" -v ON_ERROR_STOP=0 -f /tmp/_helpers.sql >/dev/null 2>&1
$PSQL -d "$DB" -c "
  INSERT INTO __mj.\"User\" (\"ID\",\"Name\",\"Email\",\"Type\",\"IsActive\",\"LinkedRecordType\")
  VALUES ('00000000-0000-0000-0000-000000000002','Owner','owner@memberjunction.local','Owner',TRUE,'None')
  ON CONFLICT (\"ID\") DO NOTHING;" >/dev/null

step 5b/5 "mj codegen (awaited, DB-side only)"
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

#!/usr/bin/env bash
# ============================================================================
# Split-and-Regenerate PARALLEL PILOT — schema-parity drift vs pg-migrate.
#
# Runs the AST converter on the SAME migration set pg-migrate uses, builds its
# OWN fresh PG database, and diffs the resulting __mj schema against the database
# pg-migrate produced. Read-only against the pg-migrate DB — it is never mutated.
#
# NO WIRE CROSSING:
#   - different code path: AST dialect (mj_postgres.py) vs pg-migrate's stock
#     sqlglot (server.py) + SQLConverter rules — separate entry points.
#   - different database: this builds <astDB>; pg-migrate owns <pgMigrateDB>.
#   - this script only READS <pgMigrateDB> (snapshot queries), never writes it.
#
# Usage:
#   scripts/pg-parallel-pilot.sh <pgMigrateDB> [astDB] [migrationsDir]
#     <pgMigrateDB>   name of the DB pg-migrate built (read-only, for comparison)
#     [astDB]         DB this pilot creates/overwrites   (default: pg_pilot_ast)
#     [migrationsDir] T-SQL source migrations            (default: migrations/v5)
#
# Assumes the docker workbench PG container `postgres-claude` (mj_admin/Claude2Pg99,
# host port 5433) — the same container the pg-migrate Docker flow uses. Override
# PGUSER/PGPASS/PGCONTAINER env vars if your setup differs.
# ============================================================================
set -u
PGMIG="${1:?usage: pg-parallel-pilot.sh <pgMigrateDB> [astDB] [migrationsDir]}"
ASTDB="${2:-pg_pilot_ast}"
SRC="${3:-migrations/v5}"
CONTAINER="${PGCONTAINER:-postgres-claude}"
PGUSER="${PGUSER:-mj_admin}"; PGPASS="${PGPASS:-Claude2Pg99}"
OUT=/tmp/pg-pilot; mkdir -p "$OUT"
PGX="docker exec -e PGPASSWORD=$PGPASS $CONTAINER"
HR() { printf '%s\n' "------------------------------------------------------------"; }

echo "AST parallel pilot:  source=$SRC   astDB=$ASTDB   compareAgainst=$PGMIG (read-only)"; HR

echo "[1/4] AST convert (split-and-regenerate dialect)"
rm -rf "$OUT/ast-out"
node scripts/pgdiff-convert-ast.mjs "$SRC" "$OUT/ast-out" 2>/dev/null | grep -E 'conversion ===|needsHand \(' || true

echo "[2/4] build fresh $ASTDB + apply converted DDL (faithful: latest baseline + subsequent)"
$PGX psql -U "$PGUSER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$ASTDB' AND pid<>pg_backend_pid();" >/dev/null 2>&1
$PGX psql -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS $ASTDB;" >/dev/null
$PGX psql -U "$PGUSER" -d postgres -c "CREATE DATABASE $ASTDB OWNER $PGUSER;" >/dev/null
$PGX psql -U "$PGUSER" -d "$ASTDB" -c 'CREATE EXTENSION IF NOT EXISTS "pgcrypto"; CREATE SCHEMA IF NOT EXISTS __mj;' >/dev/null
PGCONTAINER="$CONTAINER" PGUSER="$PGUSER" PGPASS="$PGPASS" ./scripts/pgdiff-apply-faithful.sh "$ASTDB" "$OUT/ast-out" "$OUT/apply-errors.txt" 2>/dev/null | tail -1

echo "[3/4] snapshot both schemas (__mj base tables + columns + comments)"
./scripts/pgdiff-snapshot.sh "$ASTDB" "$OUT/AST"
./scripts/pgdiff-snapshot.sh "$PGMIG" "$OUT/PGM"

echo "[4/4] DRIFT REPORT (AST vs pg-migrate)"; HR
TA=$(wc -l <"$OUT/AST.tables.txt"|tr -d ' '); TP=$(wc -l <"$OUT/PGM.tables.txt"|tr -d ' ')
echo "tables:   AST=$TA   pg-migrate=$TP"
echo "  only in pg-migrate (AST missing): $(comm -23 "$OUT/PGM.tables.txt" "$OUT/AST.tables.txt" | grep -v flyway_schema_history | tr '\n' ' ')"
echo "  only in AST (extra):              $(comm -13 "$OUT/PGM.tables.txt" "$OUT/AST.tables.txt" | tr '\n' ' ')"
# column drift restricted to shared tables (converter's job = tables+columns)
comm -12 "$OUT/PGM.tables.txt" "$OUT/AST.tables.txt" > "$OUT/_shared.txt"
awk -F'|' 'NR==FNR{s[$1]=1;next}($1 in s)' "$OUT/_shared.txt" "$OUT/PGM.cols.txt" | cut -d'|' -f1,2 | sort -u > "$OUT/_pgm.cn"
awk -F'|' 'NR==FNR{s[$1]=1;next}($1 in s)' "$OUT/_shared.txt" "$OUT/AST.cols.txt" | cut -d'|' -f1,2 | sort -u > "$OUT/_ast.cn"
echo "columns (shared tables): missing in AST=$(comm -23 "$OUT/_pgm.cn" "$OUT/_ast.cn"|wc -l|tr -d ' ')  extra in AST=$(comm -13 "$OUT/_pgm.cn" "$OUT/_ast.cn"|wc -l|tr -d ' ')"
echo "  missing columns:"; comm -23 "$OUT/_pgm.cn" "$OUT/_ast.cn" | sed 's/^/    /' | head -30
# type drift
awk -F'|' 'NR==FNR{a[$1"|"$2]=$3;next}{k=$1"|"$2; if(k in a && a[k]!=$3) print "    "$1"."$2"  pg-migrate="a[k]" AST="$3}' \
  <(awk -F'|' 'NR==FNR{s[$1]=1;next}($1 in s)' "$OUT/_shared.txt" "$OUT/PGM.cols.txt") \
  <(awk -F'|' 'NR==FNR{s[$1]=1;next}($1 in s)' "$OUT/_shared.txt" "$OUT/AST.cols.txt") > "$OUT/_typediff.txt" 2>/dev/null
echo "type mismatches (shared cols): $(wc -l <"$OUT/_typediff.txt"|tr -d ' ')"; head -20 "$OUT/_typediff.txt"
HR
echo "AST apply errors (continue-on-error): $(grep -c 'ERROR:' "$OUT/apply-errors.txt" 2>/dev/null) total / $(grep 'ERROR:' "$OUT/apply-errors.txt" 2>/dev/null|grep -vc 'already exists') non-benign  (detail: $OUT/apply-errors.txt)"
echo "snapshots + report artifacts in $OUT/"

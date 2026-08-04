#!/usr/bin/env bash
# ============================================================================
# Full-schema parity: regenerated PG (split-and-regenerate) vs SQL Server oracle.
# Name-level diff of __mj tables, FK constraints, views, and CRUD sprocs/functions
# built from the SAME migration set on each platform. Tables + FKs are the headline
# structural parity; views/routines differ in count by platform representation
# (PG emits trigger functions + CRUD as FUNCTIONs), so we diff by NAME set.
#
#   scripts/pg-ss-parity.sh [pgDb] [ssDb]
# ============================================================================
set -u
PGDB="${1:-mj_pg_540}"; SSDB="${2:-MJ_SS_540}"
OUT=/tmp/pg-ss-parity; mkdir -p "$OUT"
PGX="docker exec -e PGPASSWORD=Claude2Pg99 postgres-claude psql -U mj_admin -d $PGDB -tAc"
SS() { sqlcmd -S localhost,14334 -U SA -P 'MagicLink2026!Strong' -C -h -1 -W -d "$SSDB" -Q "SET NOCOUNT ON; $1" 2>/dev/null | sed '/^$/d' | sed 's/[[:space:]]*$//'; }
HR(){ printf '%s\n' "--------------------------------------------------------------"; }

# ---- tables ----
SS "SELECT t.name FROM sys.tables t JOIN sys.schemas s ON t.schema_id=s.schema_id WHERE s.name='__mj' ORDER BY t.name;" | sort > "$OUT/ss.tables"
$PGX "SELECT table_name FROM information_schema.tables WHERE table_schema='__mj' AND table_type='BASE TABLE' ORDER BY 1;" | sort > "$OUT/pg.tables"
# ---- FK constraint names ----
SS "SELECT f.name FROM sys.foreign_keys f JOIN sys.schemas s ON f.schema_id=s.schema_id WHERE s.name='__mj' ORDER BY f.name;" | sort > "$OUT/ss.fks"
$PGX "SELECT constraint_name FROM information_schema.table_constraints WHERE constraint_schema='__mj' AND constraint_type='FOREIGN KEY' ORDER BY 1;" | sort > "$OUT/pg.fks"
# ---- views ----
SS "SELECT v.name FROM sys.views v JOIN sys.schemas s ON v.schema_id=s.schema_id WHERE s.name='__mj' ORDER BY v.name;" | sort > "$OUT/ss.views"
$PGX "SELECT table_name FROM information_schema.views WHERE table_schema='__mj' ORDER BY 1;" | sort > "$OUT/pg.views"
# ---- CRUD sprocs (SS procedures) vs PG functions named spCreate/spUpdate/spDelete ----
SS "SELECT p.name FROM sys.procedures p JOIN sys.schemas s ON p.schema_id=s.schema_id WHERE s.name='__mj' AND (p.name LIKE 'spCreate%' OR p.name LIKE 'spUpdate%' OR p.name LIKE 'spDelete%') ORDER BY p.name;" | sort > "$OUT/ss.crud"
$PGX "SELECT routine_name FROM information_schema.routines WHERE routine_schema='__mj' AND (routine_name LIKE 'spCreate%' OR routine_name LIKE 'spUpdate%' OR routine_name LIKE 'spDelete%') ORDER BY 1;" | sort > "$OUT/pg.crud"

report() { # name  ss_file  pg_file
  local n="$1" sf="$2" pf="$3"
  local sc pc only_ss only_pg
  sc=$(wc -l <"$sf"|tr -d ' '); pc=$(wc -l <"$pf"|tr -d ' ')
  only_ss=$(comm -23 "$sf" "$pf"); only_pg=$(comm -13 "$sf" "$pf")
  printf '%-8s SS=%-5s PG=%-5s  matched=%s\n' "$n" "$sc" "$pc" "$(comm -12 "$sf" "$pf"|wc -l|tr -d ' ')"
  [ -n "$only_ss" ] && { echo "   only in SS:"; echo "$only_ss" | sed 's/^/      /'; }
  [ -n "$only_pg" ] && { echo "   only in PG:"; echo "$only_pg" | sed 's/^/      /'; }
}

echo "FULL-SCHEMA PARITY  PG=$PGDB  vs  SS=$SSDB   (__mj schema)"; HR
report tables "$OUT/ss.tables" "$OUT/pg.tables"
report FKs    "$OUT/ss.fks"    "$OUT/pg.fks"
report views  "$OUT/ss.views"  "$OUT/pg.views"
report sprocs "$OUT/ss.crud"   "$OUT/pg.crud"
HR
echo "artifacts in $OUT/"

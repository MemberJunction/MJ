#!/bin/bash
# Snapshot PostgreSQL schema in __mj — outputs sorted lists for diff comparison.
# Usage: ./snapshot-pg.sh <db-name> <output-prefix>
DB=${1:-mj_v5_30_test_pg}
PREFIX=${2:-/tmp/eq/pg-snap}
mkdir -p "$(dirname "$PREFIX")"
PSQL='/c/Program Files/PostgreSQL/18/bin/psql.exe'
export PGPASSWORD='z2qXgNvvstcc'

run_q() {
  "$PSQL" -h localhost -U postgres -d "$DB" -t -A -F '|' -c "$1" 2>&1
}

# Tables
run_q "SELECT table_name FROM information_schema.tables WHERE table_schema='__mj' AND table_type='BASE TABLE' ORDER BY 1" \
  | grep -v "^$" | sort -u > "${PREFIX}.tables.txt"

# Columns — restrict to BASE TABLEs only (information_schema.columns also lists view cols).
run_q "SELECT c.table_name||'|'||c.column_name||'|'||c.data_type||'|'||CASE WHEN c.is_nullable='YES' THEN '1' ELSE '0' END
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
       WHERE c.table_schema='__mj' AND t.table_type='BASE TABLE'
       ORDER BY c.table_name, c.ordinal_position" \
  | grep -v "^$" | sort -u > "${PREFIX}.cols.txt"

# Constraints (PK/FK/UQ/CHECK)
run_q "SELECT tc.table_name||'|'||tc.constraint_name||'|'||
              CASE tc.constraint_type
                WHEN 'PRIMARY KEY' THEN 'PK'
                WHEN 'FOREIGN KEY' THEN 'F'
                WHEN 'UNIQUE' THEN 'UQ'
                WHEN 'CHECK' THEN 'C'
                ELSE tc.constraint_type
              END
       FROM information_schema.table_constraints tc
       WHERE tc.table_schema='__mj'
       ORDER BY 1" \
  | grep -v "^$" | sort -u > "${PREFIX}.cons.txt"

# Functions (PG has functions, no SPs distinction)
run_q "SELECT p.proname||'|F'
       FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
       WHERE n.nspname='__mj' AND p.prokind='f'
       ORDER BY p.proname" \
  | grep -v "^$" | sort -u > "${PREFIX}.routines.txt"

# Views
run_q "SELECT viewname FROM pg_views WHERE schemaname='__mj' ORDER BY viewname" \
  | grep -v "^$" | sort -u > "${PREFIX}.views.txt"

# Indexes (non-PK/UQ)
run_q "SELECT t.relname||'|'||i.relname||'|'||CASE WHEN ix.indisunique THEN '1' ELSE '0' END
       FROM pg_index ix
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname='__mj' AND NOT ix.indisprimary AND NOT ix.indisunique
       ORDER BY t.relname, i.relname" \
  | grep -v "^$" | sort -u > "${PREFIX}.idx.txt"

echo "PG snapshot written: ${PREFIX}.{tables,cols,cons,routines,views,idx}.txt"
wc -l "${PREFIX}".*.txt

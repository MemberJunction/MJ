#!/bin/bash
set -u
DB="${1:?database}"; PREFIX="${2:?output-prefix}"; mkdir -p "$(dirname "$PREFIX")"
q() { docker exec -e PGPASSWORD=Claude2Pg99 postgres-claude psql -U mj_admin -d "$DB" -tAF '|' -c "$1" 2>/dev/null | grep -v '^$' | sort -u; }
q "SELECT table_name FROM information_schema.tables WHERE table_schema='__mj' AND table_type='BASE TABLE'" > "${PREFIX}.tables.txt"
q "SELECT c.table_name||'|'||c.column_name||'|'||c.data_type FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name WHERE c.table_schema='__mj' AND t.table_type='BASE TABLE'" > "${PREFIX}.cols.txt"
q "SELECT routine_name FROM information_schema.routines WHERE routine_schema='__mj'" > "${PREFIX}.routines.txt"
q "SELECT table_name FROM information_schema.views WHERE table_schema='__mj'" > "${PREFIX}.views.txt"
q "SELECT c.relname||'.'||a.attname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped WHERE n.nspname='__mj' AND c.relkind='r' AND col_description(c.oid,a.attnum) IS NOT NULL" > "${PREFIX}.comments.txt"
echo "snapshot $DB → $PREFIX (tables=$(wc -l <${PREFIX}.tables.txt|tr -d ' ') cols=$(wc -l <${PREFIX}.cols.txt|tr -d ' ') routines=$(wc -l <${PREFIX}.routines.txt|tr -d ' ') views=$(wc -l <${PREFIX}.views.txt|tr -d ' ') comments=$(wc -l <${PREFIX}.comments.txt|tr -d ' '))"

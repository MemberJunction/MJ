#!/bin/bash
# Faithful baseline reproduction: substitute ${flyway:defaultSchema} -> __mj and
# psql -f each .pg.sql in version order, CONTINUING past errors (ON_ERROR_STOP off).
# This mirrors how the 275-tables / 80-errors metric was produced.
set -u
DB="${1:?database}"; DIR="${2:?dir of .pg.sql}"
ERRLOG="${3:-/tmp/pgdiff/apply-errors.txt}"; mkdir -p "$(dirname "$ERRLOG")"; : > "$ERRLOG"
TMP=/tmp/_pgapply; rm -rf "$TMP"; mkdir -p "$TMP"
files=$(ls "$DIR"/*.pg.sql | sort)
total=0; errfiles=0
for f in $files; do
  base=$(basename "$f")
  # both raw placeholder and the sqlglot-mangled form collapse to __mj
  sed -e 's/\${flyway:defaultSchema}/__mj/g' -e 's/__mj_flyway_default_schema__/__mj/g' "$f" > "$TMP/$base"
  out=$(docker exec -i -e PGPASSWORD=Claude2Pg99 postgres-claude psql -U mj_admin -d "$DB" -v ON_ERROR_STOP=0 -q -f - < "$TMP/$base" 2>&1)
  n=$(printf '%s\n' "$out" | grep -c 'ERROR:')
  if [ "$n" -gt 0 ]; then errfiles=$((errfiles+1)); { echo "### $base ($n errors)"; printf '%s\n' "$out" | grep 'ERROR:'; echo; } >> "$ERRLOG"; fi
  total=$((total+n))
done
echo "apply done: files_with_errors=$errfiles  total_ERROR_lines=$total  (detail: $ERRLOG)"

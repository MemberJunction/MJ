#!/bin/bash
# Faithful fresh-install apply: the LATEST baseline (highest-versioned B*.pg.sql) +
# every V*.pg.sql migration AFTER it, in version order. This mirrors what a real
# `mj migrate` does on an empty DB — older baselines are superseded full-schema
# snapshots baked into the newest, so applying them too just produces overlap noise.
set -u
DB="${1:?database}"; SRC="${2:?dir of .pg.sql}"; ERRLOG="${3:-/tmp/pgdiff/apply-faithful.txt}"
STAGE=/tmp/_faithful; rm -rf "$STAGE"; mkdir -p "$STAGE"
latest_b=$(ls "$SRC"/B*.pg.sql 2>/dev/null | sort | tail -1)
[ -z "$latest_b" ] && { echo "no baseline found"; exit 1; }
cp "$latest_b" "$STAGE/"
b_ts=$(basename "$latest_b" | sed -E 's/^B([0-9]+)__.*/\1/')
for f in "$SRC"/V*.pg.sql; do
  ts=$(basename "$f" | sed -E 's/^V([0-9]+)__.*/\1/')
  [ "$ts" -gt "$b_ts" ] && cp "$f" "$STAGE/"
done
echo "faithful set: $(basename "$latest_b") + $(( $(ls "$STAGE"|wc -l) - 1 )) subsequent V migrations"
exec ./scripts/pgdiff-apply-psql.sh "$DB" "$STAGE" "$ERRLOG"

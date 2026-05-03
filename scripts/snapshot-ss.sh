#!/bin/bash
# Snapshot SQL Server schema in __mj — outputs sorted lists for diff comparison.
# Usage: ./snapshot-ss.sh <db-name> <output-prefix>
DB=${1:-mj_v5_30_test_ss}
PREFIX=${2:-/tmp/eq/ss-snap}
mkdir -p "$(dirname "$PREFIX")"

run_q() {
  MSYS_NO_PATHCONV=1 docker exec mj-sql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'z2qXgNvvstcc' -C -d "$DB" -h-1 -W -s '|' -Q "$1" 2>&1
}

# Tables
run_q "SELECT name FROM sys.tables WHERE schema_id=SCHEMA_ID('__mj') ORDER BY name" \
  | grep -v "rows affected" | grep -v "^$" | sort -u > "${PREFIX}.tables.txt"

# Columns: table|column|type|nullable
run_q "SELECT t.name + '|' + c.name + '|' + tp.name + '|' + CAST(c.is_nullable AS varchar)
       FROM sys.columns c
       JOIN sys.tables t ON c.object_id = t.object_id
       JOIN sys.types tp ON c.user_type_id = tp.user_type_id
       WHERE SCHEMA_NAME(t.schema_id)='__mj'
       ORDER BY t.name, c.column_id" \
  | grep -v "rows affected" | grep -v "^$" | sort -u > "${PREFIX}.cols.txt"

# Constraints: PK/FK/UQ/CHECK. COLLATE forces a single collation on the UNION ALL.
run_q "SELECT (t.name + '|' + kc.name + '|' + CAST(kc.type AS varchar(2))) COLLATE DATABASE_DEFAULT
       FROM sys.key_constraints kc JOIN sys.tables t ON kc.parent_object_id = t.object_id
       WHERE SCHEMA_NAME(t.schema_id)='__mj'
       UNION ALL
       SELECT (t.name + '|' + fk.name + '|F') COLLATE DATABASE_DEFAULT
       FROM sys.foreign_keys fk JOIN sys.tables t ON fk.parent_object_id = t.object_id
       WHERE SCHEMA_NAME(t.schema_id)='__mj'
       UNION ALL
       SELECT (t.name + '|' + cc.name + '|C') COLLATE DATABASE_DEFAULT
       FROM sys.check_constraints cc JOIN sys.tables t ON cc.parent_object_id = t.object_id
       WHERE SCHEMA_NAME(t.schema_id)='__mj'" \
  | grep -v "rows affected" | grep -v "^$" | sort -u > "${PREFIX}.cons.txt"

# Routines (SPs + functions). LTRIM/RTRIM trims char(2) padding on type code.
# COLLATE forces a single collation since name and type can disagree.
run_q "SELECT (name + '|' + LTRIM(RTRIM(type))) COLLATE DATABASE_DEFAULT FROM sys.objects
       WHERE SCHEMA_NAME(schema_id)='__mj' AND type IN ('P','FN','IF','TF')" \
  | grep -v "rows affected" | grep -v "^$" | sort -u > "${PREFIX}.routines.txt"

# Views
run_q "SELECT name FROM sys.views WHERE SCHEMA_NAME(schema_id)='__mj' ORDER BY name" \
  | grep -v "rows affected" | grep -v "^$" | sort -u > "${PREFIX}.views.txt"

# Indexes (excluding PK/UQ which are in cons.txt)
run_q "SELECT t.name + '|' + i.name + '|' + CAST(i.is_unique AS varchar)
       FROM sys.indexes i JOIN sys.tables t ON i.object_id = t.object_id
       WHERE SCHEMA_NAME(t.schema_id)='__mj' AND i.is_primary_key=0 AND i.is_unique_constraint=0 AND i.name IS NOT NULL
       ORDER BY t.name, i.name" \
  | grep -v "rows affected" | grep -v "^$" | sort -u > "${PREFIX}.idx.txt"

echo "SS snapshot written: ${PREFIX}.{tables,cols,cons,routines,views,idx}.txt"
wc -l "${PREFIX}".*.txt

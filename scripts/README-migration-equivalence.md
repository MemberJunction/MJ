# Migration Equivalence Verification

When porting a SQL Server migration to PostgreSQL, you need to verify the two
files produce the same logical schema state. The `snapshot-ss.sh` and
`snapshot-pg.sh` scripts in this directory help with that.

## Workflow

The pattern: snapshot before, apply, snapshot after, diff per platform, then
diff the deltas across platforms.

```bash
# 1. Stand up two scratch DBs at the same baseline
#    SS: docker SQL Server with all migrations applied through the migration BEFORE the one you're porting
#    PG: a fresh PG with the same baseline (apply baseline.pg.sql + all V*.pg.sql before your target)

# 2. Snapshot both BEFORE
bash scripts/snapshot-ss.sh mj_test_ss /tmp/before-ss
bash scripts/snapshot-pg.sh mj_test_pg /tmp/before-pg

# 3. Apply your migration
#    SS: pipe the .sql through sqlcmd (with `SET QUOTED_IDENTIFIER ON; SET ANSI_NULLS ON; GO` prepended)
#    PG: psql -f your-converted.pg.sql

# 4. Snapshot both AFTER
bash scripts/snapshot-ss.sh mj_test_ss /tmp/after-ss
bash scripts/snapshot-pg.sh mj_test_pg /tmp/after-pg

# 5. Compute per-platform deltas
for type in tables cols cons routines views idx; do
  comm -13 <(sort /tmp/before-ss.$type.txt) <(sort /tmp/after-ss.$type.txt) > /tmp/ss-delta.$type.txt
  comm -13 <(sort /tmp/before-pg.$type.txt) <(sort /tmp/after-pg.$type.txt) > /tmp/pg-delta.$type.txt
done

# 6. Inspect the deltas — counts and contents should match (modulo type aliases)
wc -l /tmp/ss-delta.*.txt /tmp/pg-delta.*.txt
diff /tmp/ss-delta.tables.txt /tmp/pg-delta.tables.txt
# … etc per category
```

## What gets captured

Each snapshot script writes 6 sorted text files: `tables`, `cols`, `cons`,
`routines`, `views`, `idx`. Pipe-delimited where applicable.

Format:
- `tables.txt`: `TableName`
- `cols.txt`: `TableName|ColumnName|Type|Nullable(0|1)`
- `cons.txt`: `TableName|ConstraintName|TypeCode (PK|F|UQ|C)`
- `routines.txt`: `Name|TypeCode (P|FN|IF|TF on SS; F on PG)`
- `views.txt`: `ViewName`
- `idx.txt`: `TableName|IndexName|Unique(0|1)` (excludes PK/UQ — those are in cons.txt)

## Cross-platform type normalization

When diffing across platforms, expect these aliases — both sides describe the
same logical type:

| SQL Server | PostgreSQL |
|---|---|
| `nvarchar`, `varchar` | `character varying`, `text` (NVARCHAR(MAX) → TEXT) |
| `uniqueidentifier` | `uuid` |
| `bit` | `boolean` |
| `datetimeoffset` | `timestamp with time zone` |
| `datetime`, `datetime2` | `timestamp` (without time zone) |
| `int` | `integer` |
| `decimal`, `numeric`, `money` | `numeric` |

Also expect PG to surface implicit `NOT NULL` CHECK constraints that SS doesn't
list separately (e.g. `MyTable_MyCol_not_null`) — these are platform artifacts,
not real differences.

## Constraint name case-folding (known issue)

The SQLConverter doesn't currently quote `CONSTRAINT` names. PG case-folds
unquoted identifiers, so `CONSTRAINT PK_FooBar` ends up as `pk_foobar` in PG
while SS preserves `PK_FooBar`. The constraints exist with the same scope and
behavior — only the names differ. Tracked for v5.30.1; doesn't affect equivalence
verification because applications don't reference these names.

# Docker CC Task: SQL Converter Reconversion, Verification & Fix Loop

## Context — READ THIS FIRST

You are a Claude Code agent running inside the MemberJunction Docker workbench. A **supervisor CC** running in the IDE is directing your work. Your job is to execute the SQL Converter pipeline on the `postgres-5-0-implementation` branch.

**Before doing anything else**, read the session continuation brief:
```
/workspace/MJ/plans/postgres/SQL_CONVERTER_SESSION_CONTINUATION.md
```

That file explains the full architecture, all fixes made so far, and the verification checks.

## Cardinal Rule

**NEVER manually fix the converted output scripts. ALWAYS fix the converter toolchain, rebuild, retest, reconvert, and verify.** The whole point is that the tool must produce correct output automatically.

## Setup

```bash
cd /workspace/MJ

# Switch to the feature branch with all toolchain fixes
git fetch origin
git checkout postgres-5-0-implementation
git pull origin postgres-5-0-implementation

# Verify the branch
git log --oneline -3

# Install dependencies and build the converter
npm install
cd packages/SQLConverter && npm run build && npm run test
# Expected: 676 tests passing
cd /workspace/MJ
```

## Phase 1: Reconvert All 15 Migration Files

```bash
cd /workspace/MJ
for f in migrations/v5/*.sql; do
  base=$(basename "$f" .sql)
  echo "Converting: $base"
  npx --no mj sql-convert "$f" --from tsql --to postgres -o "migrations/pg/v5/${base}.pg.sql"
  echo "---"
done
```

## Phase 2: Quick Verification Checks

Run these immediately after reconversion:

```bash
echo "=== Checking for stale @ID variables ==="
grep -rn '@ID' migrations/pg/v5/*Metadata_Sync*.pg.sql || echo "PASS: No stale @ID"

echo "=== Checking for skipped procedures ==="
grep -rn 'SKIPPED.*Procedure' migrations/pg/v5/*.pg.sql || echo "PASS: No skipped procedures"

echo "=== Checking string concat in Schema_Based_ClassName ==="
grep -n 'GetClassNameSchemaPrefix.*+' migrations/pg/v5/V202602190836*.pg.sql || echo "PASS: No + concat"

echo "=== Checking for sys.indexes ==="
grep -n 'sys\.indexes' migrations/pg/v5/*.pg.sql || echo "PASS: No sys.indexes"

echo "=== Checking header text ==="
head -3 migrations/pg/v5/V202602131500*.pg.sql
# Should say "MemberJunction PostgreSQL Migration", NOT "Baseline"

echo "=== Checking metadata sync has content ==="
wc -l migrations/pg/v5/*Metadata_Sync*.pg.sql
# Should be hundreds of lines each, NOT empty/minimal
```

If ALL checks pass, commit this milestone:
```bash
git add migrations/pg/v5/*.pg.sql
git commit -m "chore: reconvert all v5 PG migrations with latest toolchain fixes

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin postgres-5-0-implementation
```

## Phase 3: Statement-by-Statement Audit

For EACH of the 15 migration files, compare the SQL Server source against the PostgreSQL output. Look for:

1. **Remaining `+` operators** that should be `||` (string concat)
2. **`[bracket]` identifiers** outside string literals and `$$`-quoted blocks
3. **SQL Server types** still present: `NVARCHAR`, `UNIQUEIDENTIFIER`, `BIT`, `DATETIME`, `MONEY`, `FLOAT(53)`
4. **Missing statements** — compare statement counts between source and output
5. **`@` prefixed variables** in PG output (should be `p_` or `v_`)
6. **`sys.` catalog references** outside of intentionally skipped blocks
7. **T-SQL functions** not converted: `ISNULL()` (→ `COALESCE()`), `IIF()` (→ `CASE WHEN`), `SCOPE_IDENTITY()`, `@@ROWCOUNT`
8. **`EXEC` calls** that should be `PERFORM` or `SELECT`
9. **Unterminated or malformed** `$$`-quoted blocks
10. **Missing `RETURNS SETOF`** on functions that should return result sets

### Systematic comparison approach

For each file pair, do:
```bash
# Count GO-delimited statements in source
grep -c '^GO$' migrations/v5/FILENAME.sql

# Count major statements in PG output (CREATE, INSERT, DO $$, etc.)
grep -cE '^(CREATE|ALTER|INSERT|UPDATE|DELETE|DO \$\$|DROP|GRANT|COMMENT)' migrations/pg/v5/FILENAME.pg.sql
```

Report findings as a structured list:
- File name
- Source statement count vs output statement count
- Any issues found (with line numbers)
- Severity: CRITICAL (wrong output), WARNING (cosmetic), INFO (acceptable)

## Phase 4: Fix → Rebuild → Retest → Reconvert Loop

For each CRITICAL issue found in Phase 3:

1. **Identify** which rule/helper needs fixing (see architecture in continuation brief)
2. **Fix** the toolchain code in `packages/SQLConverter/src/rules/`
3. **Add or update tests** in `packages/SQLConverter/src/__tests__/`
4. **Rebuild**: `cd packages/SQLConverter && npm run build`
5. **Retest**: `npm run test` (must be 676+ tests, all passing)
6. **Reconvert** the affected file(s)
7. **Verify** the fix in the output

After fixing a batch of issues, commit the milestone:
```bash
git add packages/SQLConverter/src/
git add migrations/pg/v5/*.pg.sql
git commit -m "fix: [describe what was fixed in the toolchain]

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin postgres-5-0-implementation
```

## Phase 5: PostgreSQL Execution Test (if PG container available)

If the `postgres-claude` container is running:

```bash
# Check PG connectivity
pg_isready -h postgres-claude -U mj_admin -d MJ_Workbench_PG

# Run each migration file against PG in order
export PGPASSWORD=Claude2Pg99
for f in migrations/pg/v5/B*.pg.sql migrations/pg/v5/V*.pg.sql; do
  echo "Executing: $(basename $f)"
  psql -h postgres-claude -U mj_admin -d MJ_Workbench_PG \
    -f "$f" -v ON_ERROR_STOP=1 2>&1 | tail -5
  echo "---"
done
```

If any migration fails:
1. Note the exact error message and line number
2. Trace it back to the source T-SQL statement
3. Fix the **toolchain**, not the output (cardinal rule)
4. Rebuild, retest, reconvert, re-execute

## Known Acceptable Limitations

These are NOT bugs — don't try to fix them:

1. **Bare `EXEC spRecompileAllViews`** → Classified as `SKIP_SQLSERVER` (correct: no PG equivalent)
2. **V202602191500 (Fix_Entity_Name_References_In_JSON_Config)** → Complex cursor/dynamic SQL that the converter correctly skips. Would need a hand-written PG equivalent.
3. **Empty sections** in output (Tables, Views, FK Constraints, Grants, Comments) → These are always emitted for consistency. If the source file doesn't have those statement types, sections are empty. This is correct.
4. **String data inside SET values** → Metadata sync files contain SQL query text as string values. The converter preserves this as-is — it's data, not structural SQL.

## Databases Available

### SQL Server (reference)
- **Host**: `sql-claude`
- **Port**: `1433`
- **User**: `sa` / `Claude2Sql99`
- **Database**: `MJ_Workbench`
- **CLI**: `sqlcmd -S sql-claude -U sa -P Claude2Sql99 -C -d MJ_Workbench`

### PostgreSQL (target)
- **Host**: `postgres-claude`
- **Port**: `5432`
- **User**: `mj_admin` / `Claude2Pg99`
- **Database**: `MJ_Workbench_PG`
- **Schema**: `__mj`
- **CLI**: `PGPASSWORD=Claude2Pg99 psql -h postgres-claude -U mj_admin -d MJ_Workbench_PG`

## Key Files

- **Toolchain source**: `packages/SQLConverter/src/rules/*.ts`
- **Tests**: `packages/SQLConverter/src/__tests__/*.test.ts`
- **Source migrations**: `migrations/v5/*.sql` (15 files)
- **Output migrations**: `migrations/pg/v5/*.pg.sql` (15 files)
- **Session brief**: `plans/postgres/SQL_CONVERTER_SESSION_CONTINUATION.md`

## Communication

After each phase, summarize what you found/fixed. The supervisor CC will pull your commits and review. Push commits at these milestones:
1. After Phase 2 (initial reconversion verified)
2. After each batch of Phase 4 fixes
3. After Phase 5 (PG execution test results)

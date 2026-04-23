# Testing the PostgreSQL Migration Files

A step-by-step guide for reviewing this PR by taking a fresh PostgreSQL database all the way to a running MemberJunction instance.

This guide is self-contained — you don't need any other scripts from other branches.

---

## Why this guide exists

This PR adds 75 PostgreSQL migration files — 32 modifications to existing `.pg.sql` files and 43 new `.pg.sql` files covering the v5.12.x–v5.26.x range.

All files were produced by the MJ T-SQL→PostgreSQL converter (from a companion source-code PR). This guide shows how to verify that the migrations work end-to-end: DDL applies cleanly, the resulting schema supports CodeGen, CodeGen produces valid stored procedures, and MJAPI boots against the resulting database.

---

## Related unmerged work (important)

This PR depends on two other unmerged PRs. You don't strictly need them to run the steps below — this guide uses only raw `psql` to apply migrations, which has no external dependencies beyond the PostgreSQL client. But if you want to also test the tooling that will eventually drive this workflow, pull them:

1. **Skyway multi-DB provider support** — adds `skyway-postgres` and `skyway-sqlserver` packages. Lives in a separate `skyway` repo, in an open PR. Not yet published to npm.
2. **MJ source-code PR (companion to this one)** — contains the T-SQL→PG converter fixes that produced these migration files, plus the MJCLI integration for `mj migrate`. On branch `claude/study-pg-migrations-tooling-OUKTx` in this repo.

For reviewing just this PR's migration content, you only need this branch plus PostgreSQL and a psql client. No npm installs required for Steps 1–5 and 7.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| PostgreSQL | 14+ (17 tested) | Target database |
| `psql` client | any | Applying migrations and verification queries |
| Node.js | 20+ (24 tested) | **Step 6 only** (CodeGen); skip if you only want to test migration DDL |
| `@memberjunction/cli` | 5.24.0+ | **Step 6 only** (CodeGen) |

You'll need a PostgreSQL superuser (or at minimum, a user that can `CREATE DATABASE`, `CREATE ROLE`, and `CREATE EXTENSION`).

---

## Step 1: Create a fresh database

```bash
# Replace <PGUSER>/<PGPASS> with your credentials
PGPASSWORD='<PGPASS>' psql -h localhost -U <PGUSER> -c "DROP DATABASE IF EXISTS mj_pg_review"
PGPASSWORD='<PGPASS>' psql -h localhost -U <PGUSER> -c "CREATE DATABASE mj_pg_review"
```

**Why fresh?** Applying migrations to a database that already has partial state will skip or fail migrations. A fresh DB ensures you see exactly what the full migration set produces.

---

## Step 2: Checkout the PR branch

```bash
cd /path/to/your/MJ/checkout
git fetch origin
git checkout claude/pg-migration-files-regeneration
```

You should now see 75 staged/committed files under `migrations-pg/v5/`. Count them:

```bash
ls migrations-pg/v5/*.pg.sql | wc -l         # should be ~74
ls migrations-pg/v5/*.pg-only.sql | wc -l    # should be ~1
```

---

## Step 3: Apply the migrations (first pass — DDL)

This step uses raw `psql` to apply each `.pg.sql` file in order — no dependencies beyond the PostgreSQL client. The migration files already have the `${flyway:defaultSchema}` placeholder replaced (they use literal `__mj` schema references), so psql can run them directly.

### Option A: Bash/Git Bash

Save as `apply-migrations.sh` in the repo root (any directory works — just needs the right relative path to `migrations-pg/v5/`):

```bash
#!/usr/bin/env bash
# Applies all .pg.sql files in order, stopping on the first error.
# Creates schema_history tracking so reruns skip already-applied migrations.

set -e
: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGDATABASE:=mj_pg_review}"
: "${PGUSER:?must set PGUSER}"
: "${PGPASSWORD:?must set PGPASSWORD}"

export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD

# Create schema + history table if missing (idempotent)
psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS __mj;
CREATE TABLE IF NOT EXISTS __mj.migration_history (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL
);
SQL

# Apply baseline first if never applied
BASELINE="migrations-pg/v5/B202602151200__v5.0__Baseline.pg.sql"
if [ -f "$BASELINE" ]; then
  APPLIED=$(psql -tA -c "SELECT 1 FROM __mj.migration_history WHERE filename = '$(basename $BASELINE)' AND success")
  if [ -z "$APPLIED" ]; then
    echo "→ Applying baseline: $(basename $BASELINE)"
    psql -v ON_ERROR_STOP=1 -f "$BASELINE" >/dev/null
    psql -c "INSERT INTO __mj.migration_history (filename, success) VALUES ('$(basename $BASELINE)', TRUE)"
    echo "  OK"
  fi
fi

# Apply V-migrations in sorted (version) order
for f in $(ls migrations-pg/v5/V*.sql 2>/dev/null | sort); do
  name=$(basename "$f")
  APPLIED=$(psql -tA -c "SELECT 1 FROM __mj.migration_history WHERE filename = '$name' AND success")
  if [ -n "$APPLIED" ]; then
    continue
  fi
  echo "→ $name"
  if psql -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1; then
    psql -c "INSERT INTO __mj.migration_history (filename, success) VALUES ('$name', TRUE)"
    echo "  OK"
  else
    echo "  FAIL — stopping"
    psql -v ON_ERROR_STOP=1 -f "$f" 2>&1 | tail -5
    psql -c "INSERT INTO __mj.migration_history (filename, success) VALUES ('$name', FALSE) ON CONFLICT (filename) DO UPDATE SET success = FALSE, applied_at = NOW()"
    exit 1
  fi
done
echo ""
echo "=== All pending migrations applied ==="
```

Run it:

```bash
chmod +x apply-migrations.sh
PGUSER=<PGUSER> PGPASSWORD='<PGPASS>' ./apply-migrations.sh
```

### Option B: Windows PowerShell equivalent

```powershell
$env:PGHOST = "localhost"
$env:PGPORT = "5432"
$env:PGDATABASE = "mj_pg_review"
$env:PGUSER = "<PGUSER>"
$env:PGPASSWORD = "<PGPASS>"

# Create history table
psql -v ON_ERROR_STOP=1 -c "CREATE SCHEMA IF NOT EXISTS __mj; CREATE TABLE IF NOT EXISTS __mj.migration_history (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), success BOOLEAN NOT NULL);"

# Apply baseline
psql -v ON_ERROR_STOP=1 -f "migrations-pg/v5/B202602151200__v5.0__Baseline.pg.sql"
psql -c "INSERT INTO __mj.migration_history (filename, success) VALUES ('B202602151200__v5.0__Baseline.pg.sql', TRUE) ON CONFLICT DO NOTHING;"

# Apply V-migrations
Get-ChildItem migrations-pg/v5/V*.sql | Sort-Object Name | ForEach-Object {
    $name = $_.Name
    $applied = psql -tA -c "SELECT 1 FROM __mj.migration_history WHERE filename = '$name' AND success"
    if ($applied) { return }
    Write-Host "→ $name"
    psql -v ON_ERROR_STOP=1 -f $_.FullName
    if ($LASTEXITCODE -eq 0) {
        psql -c "INSERT INTO __mj.migration_history (filename, success) VALUES ('$name', TRUE) ON CONFLICT DO NOTHING;"
        Write-Host "  OK"
    } else {
        Write-Host "  FAIL — stopping"
        exit 1
    }
}
```

### Expected outcome — first pass

You should see ~69 migrations apply successfully in 10–30 seconds, then a controlled failure:

```
→ V202604031940__v5.23.x__Metadata_Sync.pg.sql
  FAIL — stopping
ERROR:  function __mj.spCreateAIModel(...) does not exist
```

**This is expected and documented.** The failure happens at the first `Metadata_Sync` migration that calls a stored procedure with parameters including columns added by earlier migrations. The stored procedure's signature is out of date because CodeGen hasn't run yet. Steps 5–7 fix this.

If you see a different error (before V202604031940), that's a real bug worth flagging.

### Alternative: use the Skyway tooling (requires unmerged PRs)

If you want to validate the tooling path that will eventually replace the raw psql approach, check out the two related PRs locally:

```bash
# 1. Clone Skyway repo and check out the multi-DB PR branch
git clone https://github.com/MemberJunction/Skyway.git /path/to/skyway
cd /path/to/skyway
git checkout feature/multi-db-provider-support
npm install && npm run build

# 2. npm link the skyway-postgres package into this repo
cd /path/to/skyway/packages/postgres
npm link
cd /path/to/this/MJ/checkout
npm link @memberjunction/skyway-postgres @memberjunction/skyway-core

# 3. Check out the MJ source-code PR (for the converter and mj migrate integration)
git checkout claude/study-pg-migrations-tooling-OUKTx
cd packages/SQLConverter && npm run build
cd ../MJCLI && npm run build

# 4. Now you can use `mj migrate` with dbPlatform: 'postgresql'
```

Skip this if you just want to validate the migration files.

---

## Step 4: Install PG-specific bootstrap

Five CodeGen helper stored procedures and three database roles are needed before CodeGen can run against PostgreSQL. These are documented requirements (not from this PR) but needed for the end-to-end test.

Save the following as `pg-bootstrap.sql`:

```sql
-- 1. Database roles referenced by GRANT statements in migrations/CodeGen
DO $$ BEGIN
  CREATE ROLE "cdp_UI" NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE "cdp_Developer" NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE "cdp_Integration" NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
GRANT USAGE ON SCHEMA __mj TO "cdp_UI", "cdp_Developer", "cdp_Integration";
GRANT SELECT ON ALL TABLES IN SCHEMA __mj TO "cdp_UI";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA __mj TO "cdp_Developer";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA __mj TO "cdp_Integration";

-- 2. spGetPrimaryKeyForTable — required by CodeGen entity validation
CREATE OR REPLACE FUNCTION __mj."spGetPrimaryKeyForTable"(
  p_schema_name text, p_table_name text
) RETURNS TABLE("ColumnName" text, "DataType" text) AS $$
BEGIN
  RETURN QUERY
  SELECT kcu.column_name::text, c.data_type::text
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.columns c
    ON c.table_schema = kcu.table_schema AND c.table_name = kcu.table_name
    AND c.column_name = kcu.column_name
  WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = p_schema_name AND tc.table_name = p_table_name
  ORDER BY kcu.ordinal_position;
END;
$$ LANGUAGE plpgsql;

-- 3. Five CodeGen helper stored procedures (stubs — CodeGen replaces real logic on first run)
CREATE OR REPLACE FUNCTION __mj."spUpdateExistingEntitiesFromSchema"(p_ExcludeSchemas TEXT DEFAULT 'sys,staging')
RETURNS VOID AS $$
BEGIN
  UPDATE __mj."Entity" e
  SET "Description" = d.description
  FROM (
    SELECT n.nspname AS schema_name, c.relname AS table_name, pd.description
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_description pd ON pd.objoid = c.oid AND pd.objsubid = 0
    WHERE c.relkind = 'r' AND pd.description IS NOT NULL
    AND n.nspname NOT IN (SELECT unnest(string_to_array(p_ExcludeSchemas, ',')))
  ) d
  WHERE e."SchemaName" = d.schema_name AND e."BaseTable" = d.table_name
  AND (e."Description" IS NULL OR e."Description" = '');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateExistingEntityFieldsFromSchema"(p_ExcludeSchemas TEXT DEFAULT 'sys,staging')
RETURNS VOID AS $$
BEGIN
  UPDATE __mj."EntityField" ef
  SET
    "Type" = c.data_type,
    "Length" = COALESCE(c.character_maximum_length, c.numeric_precision, 0),
    "Precision" = COALESCE(c.numeric_precision, 0),
    "Scale" = COALESCE(c.numeric_scale, 0),
    "AllowsNull" = (c.is_nullable = 'YES'),
    "DefaultValue" = COALESCE(c.column_default, '')
  FROM __mj."Entity" e
  JOIN information_schema.columns c
    ON c.table_schema = e."SchemaName" AND c.table_name = e."BaseTable" AND c.column_name = ef."Name"
  WHERE ef."EntityID" = e."ID"
    AND ef."IsVirtual" = FALSE
    AND e."SchemaName" NOT IN (SELECT unnest(string_to_array(p_ExcludeSchemas, ',')));
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spSetDefaultColumnWidthWhereNeeded"()
RETURNS VOID AS $$
BEGIN
  UPDATE __mj."EntityField"
  SET "DefaultColumnWidth" = CASE
    WHEN "Type" IN ('uniqueidentifier','uuid') THEN 150
    WHEN "Type" IN ('int','integer','smallint','tinyint') THEN 80
    WHEN "Type" IN ('bit','boolean') THEN 60
    WHEN "Type" LIKE '%date%' OR "Type" LIKE '%time%' THEN 150
    WHEN "Length" > 0 AND "Length" <= 50 THEN GREATEST("Length" * 10, 80)
    WHEN "Length" > 50 THEN 200
    ELSE 150
  END
  WHERE ("DefaultColumnWidth" IS NULL OR "DefaultColumnWidth" = 0);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateSchemaInfoFromDatabase"()
RETURNS VOID AS $$
BEGIN
  INSERT INTO __mj."SchemaInfo" ("SchemaName")
  SELECT schema_name FROM information_schema.schemata
  WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
    AND schema_name NOT IN (SELECT "SchemaName" FROM __mj."SchemaInfo")
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteUnneededEntityFields"(p_ExcludeSchemas TEXT DEFAULT 'sys,staging')
RETURNS VOID AS $$
BEGIN
  DELETE FROM __mj."EntityField" ef
  WHERE ef."IsVirtual" = FALSE
    AND NOT EXISTS (
      SELECT 1 FROM __mj."Entity" e
      JOIN information_schema.columns c
        ON c.table_schema = e."SchemaName" AND c.table_name = e."BaseTable" AND c.column_name = ef."Name"
      WHERE e."ID" = ef."EntityID"
    )
    AND EXISTS (
      SELECT 1 FROM __mj."Entity" e2
      WHERE e2."ID" = ef."EntityID"
        AND e2."SchemaName" NOT IN (SELECT unnest(string_to_array(p_ExcludeSchemas, ',')))
    );
END;
$$ LANGUAGE plpgsql;
```

Apply it:

```bash
PGPASSWORD='<PGPASS>' psql -h localhost -U <PGUSER> -d mj_pg_review -f pg-bootstrap.sql
```

---

## Step 5: Seed a test user

Save as `seed-user.sql`:

```sql
-- Seed a System user with Developer and UI roles
INSERT INTO __mj."User" ("ID", "Name", "Email", "Type", "IsActive", "LinkedRecordType")
VALUES ('00000000-0000-0000-0000-000000000001', 'System', 'system@test.local', 'User', TRUE, 'None')
ON CONFLICT ("ID") DO UPDATE SET "IsActive" = TRUE;

DO $$
DECLARE
  v_role_id UUID;
BEGIN
  SELECT "ID" INTO v_role_id FROM __mj."Role" WHERE "Name" = 'Developer' LIMIT 1;
  IF v_role_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM __mj."UserRole"
    WHERE "UserID" = '00000000-0000-0000-0000-000000000001' AND "RoleID" = v_role_id
  ) THEN
    INSERT INTO __mj."UserRole" ("ID", "UserID", "RoleID")
    VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_role_id);
  END IF;

  SELECT "ID" INTO v_role_id FROM __mj."Role" WHERE "Name" = 'UI' LIMIT 1;
  IF v_role_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM __mj."UserRole"
    WHERE "UserID" = '00000000-0000-0000-0000-000000000001' AND "RoleID" = v_role_id
  ) THEN
    INSERT INTO __mj."UserRole" ("ID", "UserID", "RoleID")
    VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', v_role_id);
  END IF;
END $$;

-- Prevent duplicate user creation on login (PG baseline is missing this index — flagged issue)
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_User_Email" ON __mj."User" ("Email");
```

Apply:

```bash
PGPASSWORD='<PGPASS>' psql -h localhost -U <PGUSER> -d mj_pg_review -f seed-user.sql
```

---

## Step 6: Run CodeGen

CodeGen reads entity metadata from the DB, generates stored procedures with current column signatures, and creates views. This is what unblocks the Metadata_Sync migrations in step 7.

The easiest way to run it is via the published `@memberjunction/cli`:

```bash
DB_TYPE=postgresql \
DB_HOST=localhost DB_PORT=5432 \
DB_DATABASE=mj_pg_review \
DB_USERNAME=<PGUSER> DB_PASSWORD='<PGPASS>' \
CODEGEN_DB_USERNAME=<PGUSER> CODEGEN_DB_PASSWORD='<PGPASS>' \
PG_HOST=localhost PG_PORT=5432 \
PG_DATABASE=mj_pg_review \
PG_USERNAME=<PGUSER> PG_PASSWORD='<PGPASS>' \
MJ_CORE_SCHEMA=__mj \
npx @memberjunction/cli codegen
```

### Expected outcome

You'll see many `zero-length delimited identifier` warnings during metadata loading — these are known cosmetic warnings (coworker issue #37 in the 58-issue audit), non-fatal. After ~60–90 seconds you should see:

```
[Info] MJ CodeGen Complete! 292 entities processed in 76.2s
```

### Known one-liner issues you may need to patch

If you're running against `@memberjunction/cli@5.24.0` specifically, two minor patches are needed in `node_modules/` (these are fixed in the companion source-code PR, not yet published to npm):

1. `node_modules/@memberjunction/codegen-lib/dist/Database/providers/postgresql/PostgreSQLCodeGenProvider.js` around line 855 — add `'LENGTH'` to the SQL keywords set: change `'LEN', 'DATALENGTH',` to `'LEN', 'LENGTH', 'DATALENGTH',`

2. `node_modules/@memberjunction/postgresql-dataprovider/dist/PostgreSQLDataProvider.js` — in `quoteFieldNamesInToken`, change the regex from `\\b${fieldName}\\b` to `\\b${fieldName}\\b(?!\\s*\\()` (negative lookahead so function calls aren't quoted as column names)

Without these patches CodeGen stops with `function LENGTH(character varying) does not exist`.

---

## Step 7: Apply the remaining migrations (second pass)

Now that CodeGen has regenerated stored procedures with current column signatures, the Metadata_Sync migrations can call them successfully. Run the same `apply-migrations.sh` (or PowerShell) script from Step 3 — it will skip the migrations already recorded in `__mj.migration_history` and pick up from where it left off:

```bash
# Bash
PGUSER=<PGUSER> PGPASSWORD='<PGPASS>' ./apply-migrations.sh

# PowerShell — just re-run the same commands from Step 3, Option B
```

### Expected outcome — second pass

All 8 remaining migrations apply in a few seconds:

```
→ V202604031940__v5.23.x__Metadata_Sync.pg.sql
  OK
→ V202604060452__v5.24.x__KnowledgeHub_Integrated_Migration.pg.sql
  OK
...
=== SUCCESS: 8 applied, version 202604101200 ===
```

Final schema is at version **`V202604101200__v5.26.x__Application_Roles.pg.sql`** — full parity with the T-SQL migration set.

---

## Step 8: Verify the final state

Quick schema counts:

```bash
PGPASSWORD='<PGPASS>' psql -h localhost -U <PGUSER> -d mj_pg_review <<'SQL'
SELECT 'Tables' AS object_type, COUNT(*) FROM information_schema.tables
  WHERE table_schema = '__mj' AND table_type = 'BASE TABLE'
UNION ALL SELECT 'Views', COUNT(*) FROM information_schema.views WHERE table_schema = '__mj'
UNION ALL SELECT 'Functions', COUNT(*) FROM information_schema.routines
  WHERE routine_schema = '__mj' AND routine_type = 'FUNCTION'
UNION ALL SELECT 'Triggers', COUNT(*) FROM information_schema.triggers
  WHERE trigger_schema = '__mj'
UNION ALL SELECT 'Entities', COUNT(*) FROM __mj."Entity"
UNION ALL SELECT 'EntityFields', COUNT(*) FROM __mj."EntityField";
SQL
```

Expected (ballpark — exact numbers depend on CodeGen output):
- Tables: ~290
- Views: ~290 (one per entity: `vw<EntityName>`)
- Functions: ~1200 (4 per entity: `fn_create_*`, `fn_update_*`, `fn_delete_*`, `fn_trg_update_*` + ~60 helpers/utilities)
- Triggers: ~290 (one `__mj_UpdatedAt` trigger per entity)
- Entities: ~292
- EntityFields: ~3900–4100

Verified counts on a fresh `mj_pg_dev` after the full two-pass workflow: 294 tables / 299 views / 1225 functions / 292 triggers / 292 entities / 4060 EntityFields.

---

## Step 9 (optional): Boot MJAPI

If you want to verify the schema supports the full application stack, point MJAPI at this database. You'll need a distribution-style MJ install (monorepo won't work due to the known `skyway-postgres` workspace resolution issue).

From `/path/to/mj-distribution/`:

```bash
# apps/MJAPI/.env:
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=mj_pg_review
DB_USERNAME=<PGUSER>
DB_PASSWORD='<PGPASS>'
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=mj_pg_review
PG_USERNAME=<PGUSER>
PG_PASSWORD='<PGPASS>'
MJ_CORE_SCHEMA=__mj
GRAPHQL_PORT=4001

# Start MJAPI:
cd apps/MJAPI
npm start
```

Once up (look for `Starting MemberJunction Server`), test it:

```bash
curl http://localhost:4001/
# Expected response: {"error":"Authentication failed"}
# (This is correct — unauthenticated request rejected by auth middleware)
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Step 3 fails before `202604031940` | Real regression in a DDL migration | Capture the error, check which migration, flag on the PR |
| Step 3 fails AT `202604031940` with `spCreateAIModel does not exist` | **Expected** — this is where the two-pass workflow kicks in | Continue to Step 4 |
| `function LENGTH(character varying) does not exist` during CodeGen | Published 5.24.0 `_SQL_KEYWORDS` set missing `LENGTH` | Apply the one-liner patch from Step 6 |
| `zero-length delimited identifier at or near ""` warnings | Known cosmetic issue from PG baseline — doesn't block functionality | Ignore |
| Step 7 fails after Step 6 succeeds | CodeGen didn't regenerate the specific proc the migration needs | Check that `mj codegen` completed without exiting early |
| MJAPI crashes immediately on start | Missing `PG_*` env vars | Both `DB_*` and `PG_*` need to be set (legacy fallback pattern) |
| `@memberjunction/skyway-postgres` not found on npm | That package lives in the unmerged Skyway PR and hasn't been published yet | This guide uses raw `psql` for migration application specifically to avoid this dependency. If you want the Skyway path, see the "Alternative" block at the end of Step 3 for how to link it locally |

---

## What "passing" means

At minimum, a reviewer should confirm:

1. ✅ **Step 3 reaches `202604031940`** — all DDL migrations apply cleanly
2. ✅ **Step 6 completes with "292 entities processed"** — CodeGen produces all derived SQL objects
3. ✅ **Step 7 reaches `202604101200`** — all Metadata_Sync migrations apply against CodeGen-produced procs
4. ✅ **Step 8 shows expected object counts** — schema is shape-matched to SQL Server equivalent
5. ✅ **Step 9 boots MJAPI and returns `{"error":"Authentication failed"}`** — schema supports the runtime

If all five pass, the migration set is correct and the PR is safe to merge.

---

## What NOT to expect

- **Don't expect single-pass migration to work.** The two-pass (migrate → codegen → migrate) flow is the intended workflow on both platforms. On SQL Server it happens implicitly across CodeGen runs in normal development. On a single-shot batch application against a fresh PG DB, you see the dependency explicitly.

- **Don't expect byte-identical output to SQL Server.** PostgreSQL uses functions (`fn_create_*`) instead of procedures (`spCreate*`). View names retain PascalCase but need quoting. `bit` → `boolean`, `UNIQUEIDENTIFIER` → `UUID`, etc.

- **Don't expect the monorepo to work out-of-the-box for Step 6.** The MJ monorepo has workspace resolution issues with the local-only `skyway-postgres` package. Use a distribution-style install for CodeGen and MJAPI (see `mj-testing/fresh-install` as a reference).

---

## Reproducibility

The migration files are a deterministic function of the T-SQL input and the converter. To verify they weren't hand-edited beyond the one documented Sequence bump:

```bash
# From the source-code PR branch (claude/study-pg-migrations-tooling-OUKTx):
git checkout claude/study-pg-migrations-tooling-OUKTx
cd packages/SQLConverter && npm run build
cd ../.. && node scripts/convert-missing-pg-migrations.mjs

# Every regenerated .pg.sql file should match this PR's output byte-for-byte,
# except for V202603131800 (Sequence 100048 → 100051, documented).
```

That's the trust chain: this PR's content = `converter(T-SQL migrations) + 1 documented sequence bump`. If you regenerate and see only that one difference, the migrations are verified correct.

# PostgreSQL Parity Test: Sample CRM Application

## Mission

You are a Claude Code agent running inside the MemberJunction Docker workbench. Your task is to execute a **real-world PostgreSQL parity test** by building a sample CRM application schema and verifying that MemberJunction produces identical results whether backed by SQL Server or PostgreSQL.

This test validates the entire vertical slice: migration authoring -> SQL conversion -> migration execution -> CodeGen -> MJAPI runtime -> MJExplorer UI.

## Environment

### SQL Server (source of truth)
- **Host**: `sql-claude` / **Port**: `1433`
- **User**: `sa` / **Password**: `Claude2Sql99`
- **Database**: `MJ_Workbench` (existing, fully bootstrapped)
- **CLI**: `sqlmj` or `sqlq "<query>"`

### PostgreSQL (test target)
- **Host**: `postgres-claude` / **Port**: `5432`
- **User**: `mj_admin` / **Password**: `Claude2Pg99`
- **Database**: `MJ_Workbench_PG` (existing, fully bootstrapped with __mj schema)
- **CLI**: `pgcli` or `pgq "<query>"`

### Ports (Sequential Approach - One DB at a Time)
- MJAPI: `4000` (default, used for whichever DB is being tested)
- MJExplorer: `4200` (default, used for whichever DB is being tested)
- Switch between DBs by updating .env and restarting MJAPI

### Git
- **Branch**: `postgres-5-0-implementation` (continue on this branch)
- **Commit after each phase** and push to remote

## Background

PR #1985 implements PostgreSQL multi-database support for MemberJunction. Previous sessions (1-11) achieved:
- Zero-error SQL conversion across baseline and all 6 incremental migrations
- 586+ unit tests passing in the SQLConverter package
- Cross-database verification showing 98%+ parity on the __mj core schema
- Full-stack MJAPI + MJExplorer running against PostgreSQL with E2E screenshots
- Last commit: `48febdffc` fix(postgres): prevent quoteIdentifiersInSQL from corrupting string values

**What hasn't been tested**: A user-defined business application schema going through the full MJ pipeline on both databases. This test fills that gap.

---

## Phase 1: Write the SQL Server Migration (CRM Schema)

Create a new migration file at:
```
/workspace/MJ/migrations/v5/V202602240001__v5.3.x__Sample_CRM_Schema.sql
```

### Schema: `sample_crm`

Design a realistic CRM schema with 12 tables:

#### Table Definitions

1. **Company** - ID (UNIQUEIDENTIFIER PK DEFAULT NEWSEQUENTIALID()), Name (NVARCHAR 200 NOT NULL), Industry (NVARCHAR 100), Website (NVARCHAR 500), Phone (NVARCHAR 50), AnnualRevenue (DECIMAL 18,2), EmployeeCount (INT), Status (NVARCHAR 20) CHECK ('Active','Inactive','Prospect','Churned'), Notes (NVARCHAR MAX), CreatedByUserID (UNIQUEIDENTIFIER FK -> __mj.User)

2. **Contact** - ID, CompanyID (FK -> Company NOT NULL), FirstName (NVARCHAR 100 NOT NULL), LastName (NVARCHAR 100 NOT NULL), Email (NVARCHAR 200), Phone (NVARCHAR 50), Title (NVARCHAR 100), Department (NVARCHAR 100), ReportsToContactID (FK -> Contact NULLABLE, self-referential), IsPrimary (BIT DEFAULT 0), Status (NVARCHAR 20 CHECK same as Company), Notes (NVARCHAR MAX), CreatedByUserID (FK -> __mj.User)

3. **Deal** - ID, CompanyID (FK NOT NULL), ContactID (FK NOT NULL), Name (NVARCHAR 200 NOT NULL), Amount (DECIMAL 18,2), Stage (NVARCHAR 50) CHECK ('Lead','Qualified','Proposal','Negotiation','Closed Won','Closed Lost'), Probability (INT CHECK >= 0 AND <= 100), ExpectedCloseDate (DATETIME), ActualCloseDate (DATETIME NULL), AssignedToUserID (UNIQUEIDENTIFIER FK -> __mj.User), Notes (NVARCHAR MAX), CreatedByUserID (FK -> __mj.User)

4. **Activity** - ID, Type (NVARCHAR 20 NOT NULL) CHECK ('Call','Email','Meeting','Note','Task'), Subject (NVARCHAR 500 NOT NULL), Description (NVARCHAR MAX), ActivityDate (DATETIME DEFAULT GETUTCDATE()), DurationMinutes (INT NULL), CompanyID (FK NULL), ContactID (FK NULL), DealID (FK NULL), CompletedAt (DATETIME NULL), CreatedByUserID (FK -> __mj.User)

5. **Product** - ID, Name (NVARCHAR 200 NOT NULL), SKU (NVARCHAR 50 UNIQUE), Description (NVARCHAR MAX), UnitPrice (DECIMAL 18,2 NOT NULL), IsActive (BIT DEFAULT 1), Category (NVARCHAR 100)

6. **DealProduct** - ID, DealID (FK NOT NULL), ProductID (FK NOT NULL), Quantity (INT DEFAULT 1), UnitPrice (DECIMAL 18,2 NOT NULL), Discount (DECIMAL 5,2 DEFAULT 0 CHECK >= 0 AND <= 100), UNIQUE(DealID, ProductID)

7. **Tag** - ID, Name (NVARCHAR 100 NOT NULL UNIQUE), Color (NVARCHAR 7) -- hex color

8. **CompanyTag** - ID, CompanyID (FK NOT NULL), TagID (FK NOT NULL), UNIQUE(CompanyID, TagID)

9. **ContactTag** - ID, ContactID (FK NOT NULL), TagID (FK NOT NULL), UNIQUE(ContactID, TagID)

10. **DealTag** - ID, DealID (FK NOT NULL), TagID (FK NOT NULL), UNIQUE(DealID, TagID)

11. **Pipeline** - ID, Name (NVARCHAR 200 NOT NULL), Description (NVARCHAR MAX), IsDefault (BIT DEFAULT 0)

12. **PipelineStage** - ID, PipelineID (FK NOT NULL), Name (NVARCHAR 100 NOT NULL), DisplayOrder (INT NOT NULL), Probability (INT DEFAULT 0 CHECK >= 0 AND <= 100), UNIQUE(PipelineID, Name)

### Migration Requirements
- `CREATE SCHEMA sample_crm;` at the top
- Use `${flyway:defaultSchema}` for __mj schema FK references (to User table)
- All PKs: `UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID()`
- Add `sp_addextendedproperty` for EVERY table and EVERY column with meaningful descriptions
- Do NOT add `__mj_CreatedAt` / `__mj_UpdatedAt` columns (CodeGen handles these)
- Do NOT add FK indexes (CodeGen handles these)
- Use hardcoded UUIDs for seed data (deterministic, not NEWID())
- Insert ~20-30 rows of realistic seed data: 5 Companies, 10 Contacts, 6 Deals, 5 Products, 8 Activities, 4 Tags, junction table rows, 2 Pipelines with stages
- Register the schema in SchemaInfo with a hardcoded UUID

### Commit Checkpoint
```bash
git add migrations/v5/V202602240001__v5.3.x__Sample_CRM_Schema.sql
git commit -m "feat(test): add Sample CRM schema migration for PG parity testing"
git push
```

---

## Phase 2: Convert Migration to PostgreSQL

Use the SQL converter (TypeScript pipeline) to produce the PG version.

First, check what conversion tools are available:
```bash
# Check if mj CLI has the sql-convert command
mj --help 2>/dev/null | grep -i convert

# Check BatchConverter
ls packages/SQLConverter/src/rules/BatchConverter.ts

# Check the CLI entry point
ls packages/SQLConverter/src/cli.ts 2>/dev/null
ls packages/MJCli/src/commands/ | grep -i convert
```

Use whichever approach works. The output should go to:
```
migrations-postgres/v5/V202602240001__v5.3.x__Sample_CRM_Schema_PG.sql
```

### Verify the Conversion
Review the output for:
- Type mappings: UNIQUEIDENTIFIER->UUID, NVARCHAR->VARCHAR, BIT->BOOLEAN, DECIMAL->NUMERIC, DATETIME->TIMESTAMP
- NEWSEQUENTIALID() -> gen_random_uuid()
- GETUTCDATE() -> NOW() AT TIME ZONE 'UTC' or CURRENT_TIMESTAMP
- CHECK constraints preserved
- sp_addextendedproperty -> COMMENT ON
- INSERT seed data: N'strings' -> 'strings', 0/1 BIT -> false/true BOOLEAN
- Schema references: sample_crm maintained

### Commit Checkpoint
```bash
git add migrations-postgres/v5/V202602240001__v5.3.x__Sample_CRM_Schema_PG.sql
git commit -m "feat(test): convert CRM schema migration to PostgreSQL"
git push
```

---

## Phase 3: Apply Migrations to Both Databases

### SQL Server
```bash
sqlcmd -S sql-claude -U sa -P Claude2Sql99 -C -d MJ_Workbench \
  -v flyway:defaultSchema=__mj \
  -i migrations/v5/V202602240001__v5.3.x__Sample_CRM_Schema.sql \
  2>&1 | tee /workspace/phase3-sqlserver-apply.log

# Verify
sqlq "SELECT COUNT(*) AS table_count FROM sys.tables WHERE schema_id = SCHEMA_ID('sample_crm')"
sqlq "SELECT name FROM sys.tables WHERE schema_id = SCHEMA_ID('sample_crm') ORDER BY name"
```

### PostgreSQL
```bash
# Replace ${flyway:defaultSchema} with __mj if the converter didn't do it
sed 's/${flyway:defaultSchema}/__mj/g' \
  migrations-postgres/v5/V202602240001__v5.3.x__Sample_CRM_Schema_PG.sql \
  > /tmp/crm_pg_ready.sql

PGPASSWORD=Claude2Pg99 psql -h postgres-claude -U mj_admin -d MJ_Workbench_PG \
  -f /tmp/crm_pg_ready.sql \
  2>&1 | tee /workspace/phase3-postgres-apply.log

# Verify
pgq "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = 'sample_crm'"
pgq "SELECT table_name FROM information_schema.tables WHERE table_schema = 'sample_crm' ORDER BY table_name"
```

### Cross-Check
```bash
# Compare table counts
echo "=== TABLE COUNT COMPARISON ===" > /workspace/phase3-comparison.log
echo "SQL Server:" >> /workspace/phase3-comparison.log
sqlq "SELECT COUNT(*) FROM sys.tables WHERE schema_id = SCHEMA_ID('sample_crm')" >> /workspace/phase3-comparison.log
echo "PostgreSQL:" >> /workspace/phase3-comparison.log
pgq "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'sample_crm'" >> /workspace/phase3-comparison.log

# Compare row counts per table
echo "=== ROW COUNT COMPARISON ===" >> /workspace/phase3-comparison.log
for table in Company Contact Deal Activity Product DealProduct Tag CompanyTag ContactTag DealTag Pipeline PipelineStage; do
  echo "--- $table ---" >> /workspace/phase3-comparison.log
  sqlq "SELECT COUNT(*) AS sql_count FROM sample_crm.[$table]" >> /workspace/phase3-comparison.log
  pgq "SELECT COUNT(*) AS pg_count FROM sample_crm.\"$table\"" >> /workspace/phase3-comparison.log
done

cat /workspace/phase3-comparison.log
```

### Commit Checkpoint
Commit any migration fixes.

---

## Phase 4: Run CodeGen Against SQL Server + Snapshot

### Prepare
Verify .env points to SQL Server:
```bash
grep DB_HOST /workspace/MJ/.env
# Expected: DB_HOST=sql-claude
```

### Run CodeGen
```bash
cd /workspace/MJ
mj codegen 2>&1 | tee /workspace/phase4-codegen-sqlserver.log
```

### Capture Metadata Snapshot
```bash
mkdir -p /workspace/snapshots

# Entities
sqlq "SET NOCOUNT ON; SELECT e.Name, e.BaseTable, e.SchemaName, e.Description, e.IncludeInAPI \
      FROM __mj.vwEntities e WHERE e.SchemaName = 'sample_crm' ORDER BY e.Name" \
  -s "," -W > /workspace/snapshots/sqlserver-entities.csv

# Fields
sqlq "SET NOCOUNT ON; SELECT e.Name AS EntityName, ef.Name AS FieldName, ef.Type, ef.Length, \
      ef.AllowsNull, ef.DefaultValue, ef.Description, ef.IsPrimaryKey, ef.IsUnique \
      FROM __mj.vwEntityFields ef JOIN __mj.vwEntities e ON ef.EntityID = e.ID \
      WHERE e.SchemaName = 'sample_crm' ORDER BY e.Name, ef.Sequence" \
  -s "," -W > /workspace/snapshots/sqlserver-fields.csv

# Relationships
sqlq "SET NOCOUNT ON; SELECT pe.Name AS ParentEntity, ce.Name AS RelatedEntity, er.Type, \
      er.BundleInAPI, er.DisplayName \
      FROM __mj.vwEntityRelationships er \
      JOIN __mj.vwEntities pe ON er.EntityID = pe.ID \
      JOIN __mj.vwEntities ce ON er.RelatedEntityID = ce.ID \
      WHERE pe.SchemaName = 'sample_crm' OR ce.SchemaName = 'sample_crm' \
      ORDER BY pe.Name, ce.Name" \
  -s "," -W > /workspace/snapshots/sqlserver-relationships.csv

# Generated views
sqlq "SET NOCOUNT ON; SELECT name FROM sys.views WHERE schema_id = SCHEMA_ID('sample_crm') ORDER BY name" \
  > /workspace/snapshots/sqlserver-views.txt

# Generated stored procedures
sqlq "SET NOCOUNT ON; SELECT name FROM sys.procedures WHERE schema_id = SCHEMA_ID('sample_crm') ORDER BY name" \
  > /workspace/snapshots/sqlserver-procs.txt
```

### Commit Checkpoint
```bash
git add packages/MJCoreEntities/src/generated/ snapshots/
git commit -m "feat(test): CodeGen run against SQL Server with CRM schema + metadata snapshots"
git push
```

---

## Phase 5: Run CodeGen Against PostgreSQL + Diff

### Switch to PostgreSQL Config
```bash
cp /workspace/MJ/.env /workspace/MJ/.env.sqlserver

# Check how previous sessions configured PG - look at existing .env variants
ls /workspace/MJ/.env* 2>/dev/null
cat /workspace/MJ/.env.postgres 2>/dev/null || echo "No .env.postgres found"

# Look at how MJAPI detects PG vs SQL Server
grep -r "DATABASE_PLATFORM\|DB_PLATFORM\|PROVIDER_TYPE\|postgresql" \
  /workspace/MJ/packages/MJServer/src/ --include="*.ts" -l
```

Configure .env for PostgreSQL (based on what previous sessions used).

### Run CodeGen
```bash
cd /workspace/MJ
mj codegen 2>&1 | tee /workspace/phase5-codegen-postgres.log
```

### Capture PostgreSQL Metadata Snapshot
```bash
# Entities (using vwEntities view which should exist in PG too)
pgq "COPY (SELECT \"Name\", \"BaseTable\", \"SchemaName\", \"Description\", \"IncludeInAPI\" \
     FROM __mj.\"vwEntities\" WHERE \"SchemaName\" = 'sample_crm' \
     ORDER BY \"Name\") TO STDOUT WITH CSV" \
  > /workspace/snapshots/postgres-entities.csv

# Fields
pgq "COPY (SELECT e.\"Name\" AS entity_name, ef.\"Name\" AS field_name, ef.\"Type\", ef.\"Length\", \
     ef.\"AllowsNull\", ef.\"DefaultValue\", ef.\"Description\", ef.\"IsPrimaryKey\", ef.\"IsUnique\" \
     FROM __mj.\"vwEntityFields\" ef JOIN __mj.\"vwEntities\" e ON ef.\"EntityID\" = e.\"ID\" \
     WHERE e.\"SchemaName\" = 'sample_crm' ORDER BY e.\"Name\", ef.\"Sequence\") TO STDOUT WITH CSV" \
  > /workspace/snapshots/postgres-fields.csv

# Relationships
pgq "COPY (SELECT pe.\"Name\" AS parent_entity, ce.\"Name\" AS related_entity, er.\"Type\", \
     er.\"BundleInAPI\", er.\"DisplayName\" \
     FROM __mj.\"vwEntityRelationships\" er \
     JOIN __mj.\"vwEntities\" pe ON er.\"EntityID\" = pe.\"ID\" \
     JOIN __mj.\"vwEntities\" ce ON er.\"RelatedEntityID\" = ce.\"ID\" \
     WHERE pe.\"SchemaName\" = 'sample_crm' OR ce.\"SchemaName\" = 'sample_crm' \
     ORDER BY pe.\"Name\", ce.\"Name\") TO STDOUT WITH CSV" \
  > /workspace/snapshots/postgres-relationships.csv

# Generated functions (PG equivalent of views + procs)
pgq "SELECT routine_name FROM information_schema.routines \
     WHERE routine_schema = 'sample_crm' ORDER BY routine_name" \
  > /workspace/snapshots/postgres-functions.txt

pgq "SELECT table_name FROM information_schema.views \
     WHERE table_schema = 'sample_crm' ORDER BY table_name" \
  > /workspace/snapshots/postgres-views.txt
```

### Diff Everything
```bash
echo "=== ENTITY COMPARISON ===" > /workspace/snapshots/DIFF_REPORT.txt
diff /workspace/snapshots/sqlserver-entities.csv /workspace/snapshots/postgres-entities.csv \
  >> /workspace/snapshots/DIFF_REPORT.txt 2>&1 || echo "(differences found)" >> /workspace/snapshots/DIFF_REPORT.txt

echo "" >> /workspace/snapshots/DIFF_REPORT.txt
echo "=== FIELD COMPARISON ===" >> /workspace/snapshots/DIFF_REPORT.txt
diff /workspace/snapshots/sqlserver-fields.csv /workspace/snapshots/postgres-fields.csv \
  >> /workspace/snapshots/DIFF_REPORT.txt 2>&1 || echo "(differences found)" >> /workspace/snapshots/DIFF_REPORT.txt

echo "" >> /workspace/snapshots/DIFF_REPORT.txt
echo "=== RELATIONSHIP COMPARISON ===" >> /workspace/snapshots/DIFF_REPORT.txt
diff /workspace/snapshots/sqlserver-relationships.csv /workspace/snapshots/postgres-relationships.csv \
  >> /workspace/snapshots/DIFF_REPORT.txt 2>&1 || echo "(differences found)" >> /workspace/snapshots/DIFF_REPORT.txt

cat /workspace/snapshots/DIFF_REPORT.txt
```

Classify every variance as **Bug**, **Expected**, or **Enhancement**.

### Commit Checkpoint
```bash
git add snapshots/ -A
git commit -m "test(postgres): CodeGen parity comparison - SQL Server vs PostgreSQL"
git push
```

---

## Phase 6: MJAPI Runtime Testing Against SQL Server

### Prepare
```bash
# Kill any existing MJAPI/Explorer processes
pkill -f "node.*index.ts" 2>/dev/null || true
pkill -f "ng serve" 2>/dev/null || true
sleep 5

# Restore SQL Server config
cp /workspace/MJ/.env.sqlserver /workspace/MJ/.env
```

### Start MJAPI (SQL Server)
```bash
cd /workspace/MJ/packages/MJAPI
nohup node --experimental-specifier-resolution=node --import ./register.js \
  -r dotenv/config ./src/index.ts > /workspace/mjapi-sqlserver-test.log 2>&1 &
MJAPI_PID=$!

# Wait for ready (look for "listening" or "ready" in log)
sleep 30
tail -10 /workspace/mjapi-sqlserver-test.log
```

### Test CRM Entities via GraphQL API
Test each CRM entity through the GraphQL API. For each entity, test:
1. **List/RunView** - Retrieve all records
2. **Get by ID** - Retrieve a specific record by its seeded UUID
3. **Create** - Create a new test record
4. **Update** - Modify the created record
5. **Verify** - Re-fetch and confirm changes persisted

Save all API responses to `/workspace/api-tests/sqlserver/`

### Optional: Playwright UI Testing
If time permits and Explorer is already running:
```bash
# Start Explorer
cd /workspace/MJ/packages/MJExplorer
nohup npx ng serve --host 0.0.0.0 --port 4200 > /workspace/explorer-sqlserver.log 2>&1 &
sleep 60

# Run Playwright tests
mkdir -p /workspace/e2e-screenshots/sqlserver
pwopen http://localhost:4200
# Login, navigate to CRM entities, take screenshots
```

### Stop Services
```bash
kill $MJAPI_PID 2>/dev/null || true
pkill -f "ng serve" 2>/dev/null || true
```

---

## Phase 7: MJAPI Runtime Testing Against PostgreSQL

### Start MJAPI (PostgreSQL)
```bash
# Switch to PG config
# (use whatever .env.postgres config was established in Phase 5)

cd /workspace/MJ/packages/MJAPI
nohup node --experimental-specifier-resolution=node --import ./register.js \
  -r dotenv/config ./src/index.ts > /workspace/mjapi-postgres-test.log 2>&1 &
MJAPI_PID=$!

sleep 30
tail -10 /workspace/mjapi-postgres-test.log
```

### Run Same API Tests
Repeat the exact same GraphQL test sequence from Phase 6.
Save responses to `/workspace/api-tests/postgres/`

### Diff API Responses
```bash
# Compare each entity's response
for entity in Company Contact Deal Activity Product DealProduct Tag CompanyTag ContactTag DealTag Pipeline PipelineStage; do
  echo "=== $entity ===" >> /workspace/api-tests/DIFF_REPORT.txt
  diff /workspace/api-tests/sqlserver/${entity}.json /workspace/api-tests/postgres/${entity}.json \
    >> /workspace/api-tests/DIFF_REPORT.txt 2>&1
done
```

### Optional: Playwright UI Testing on PG
Same as Phase 6 but save screenshots to `/workspace/e2e-screenshots/postgres/`

---

## Phase 8: Generate Comparison Report

Create: `/workspace/MJ/plans/postgres/CRM_PARITY_REPORT.md`

### Report Template

```
# Sample CRM PostgreSQL Parity Report

## Executive Summary
[PASS/FAIL] - [One sentence overall assessment]

## Test Environment
- SQL Server: 2022 on sql-claude container
- PostgreSQL: 16 on postgres-claude container
- MJ Branch: postgres-5-0-implementation
- Commit: [latest commit hash]
- Date: [execution date]
- CRM Schema: 12 tables, ~30 seed data rows

## Phase 1-3: Migration Results
### Schema Creation
| Check | SQL Server | PostgreSQL | Status |
|-------|-----------|------------|--------|
| Schema created | Yes | Yes | ? |
| Tables created | 12 | ? | ? |
| CHECK constraints | N | ? | ? |
| FK constraints | N | ? | ? |
| Unique constraints | N | ? | ? |
| Extended props/COMMENTs | N | ? | ? |
| Seed data rows | N | ? | ? |

### Conversion Issues (if any)
[List any issues the SQL converter had with the CRM migration]

## Phase 4-5: CodeGen Comparison
### Entity Discovery
| Check | SQL Server | PostgreSQL | Status |
|-------|-----------|------------|--------|
| Entities found | 12 | ? | ? |
| Total fields | N | ? | ? |
| Relationships | N | ? | ? |
| Views generated | 12 | ? | ? |
| SPs/Functions | 36+ | ? | ? |

### Field-Level Comparison
| Entity | Field | SQL Server Type | PG Type | Match | Notes |
|--------|-------|----------------|---------|-------|-------|
[Every field for every entity]

### Relationship Comparison
[All detected relationships on both platforms]

## Phase 6-7: Runtime Comparison
### API Tests
| Operation | SQL Server | PostgreSQL | Status |
|-----------|-----------|------------|--------|
| List all Companies | ? rows | ? rows | ? |
| Get Company by ID | ? | ? | ? |
| Create Company | ? | ? | ? |
| Update Company | ? | ? | ? |
[Repeat for other key entities]

### UI Tests (if performed)
[Screenshot comparisons or descriptions]

## Bugs Found
| # | Sev | Phase | Component | Description | Impact |
|---|-----|-------|-----------|-------------|--------|

## Expected Platform Differences
| # | Category | SQL Server | PostgreSQL | Why Expected |
|---|----------|-----------|------------|--------------|

## Recommendations
1. [Next steps]
2. [Areas needing more testing]
3. [Bugs to fix before merge]
```

### Commit Final Report
```bash
git add plans/postgres/CRM_PARITY_REPORT.md
git add snapshots/ api-tests/ e2e-screenshots/ 2>/dev/null || true
git commit -m "test(postgres): CRM parity test complete - [PASS/FAIL]"
git push
```

---

## Success Criteria

**PASS** if ALL true:
1. Both migrations apply with zero errors
2. CodeGen produces same entity count on both platforms
3. CodeGen produces same field count per entity on both
4. All field types are semantically equivalent
5. All relationships detected on both platforms
6. CRUD operations work via GraphQL on both platforms
7. Seed data is queryable and correct on both

**FAIL** if ANY true:
1. Migration fails on one platform but not the other
2. CodeGen discovers different entity counts
3. A field is missing or fundamentally wrong type
4. CRUD operation works on SQL Server but fails on PostgreSQL
5. MJExplorer shows errors unique to PostgreSQL

---

## Estimated Duration

| Phase | Time |
|-------|------|
| Phase 1: Write SQL Server migration | 30-45 min |
| Phase 2: Convert to PostgreSQL | 10-15 min |
| Phase 3: Apply migrations | 10-15 min |
| Phase 4: CodeGen SQL Server + snapshot | 15-20 min |
| Phase 5: CodeGen PostgreSQL + diff | 20-30 min |
| Phase 6: API test SQL Server | 20-30 min |
| Phase 7: API test PostgreSQL | 20-30 min |
| Phase 8: Report | 15-20 min |
| **Total** | **~2.5-3.5 hours** |

---

## Agent Notes

- **Commit after every phase** - sessions can die mid-way
- **Log everything** to /workspace/ files
- **Don't fix converter bugs inline** - document them in the report
- **DO fix trivial migration bugs** (typos, missing semicolons)
- **Check for running processes** before starting new ones (`ps aux | grep node`)
- **Auth0 login**: read TEST_UID/TEST_PWD from .env if needed
- **Update docker-agent-notes.md** after each phase
- **Use aliases**: sqlq, pgq, sqlmj, pgcli, pwopen, pwsnap, etc.

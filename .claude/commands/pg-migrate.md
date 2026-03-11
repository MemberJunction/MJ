# PostgreSQL Migration Sync

Fully automated, unattended pipeline that converts SQL Server migrations to PostgreSQL, validates them, and produces a comprehensive parity report. Designed to run overnight without user interaction.

**You (local Claude Code) are the orchestrator.** You manage Docker, delegate all heavy work to Claude Code running autonomously inside the `claude-dev` container, and report results to the user. You NEVER manually edit migration files or fix SQL — all fixes go through the toolchain. If the toolchain can't handle a pattern, you document it for user review.

## Delegation Pattern

All heavy work runs inside Docker via Claude Code with `--dangerously-skip-permissions`. The pattern for delegating a task:

1. **Write a task prompt** to a temp file on the host
2. **Copy it into the container**: `docker cp /tmp/pg-migrate-task.txt claude-dev:/tmp/task.txt`
3. **Launch CC in Docker**: `docker exec -d claude-dev bash -c 'cd /workspace/MJ && claude --dangerously-skip-permissions -p "$(cat /tmp/task.txt)" > /tmp/result.txt 2>&1 && echo __DONE__ >> /tmp/result.txt'`
4. **Poll for completion**: Check for `__DONE__` marker in `/tmp/result.txt` every 30 seconds via `docker exec claude-dev bash -c "tail -1 /tmp/result.txt 2>/dev/null"`
5. **Read the result**: `docker exec claude-dev bash -c "cat /tmp/result.txt"`

Use unique filenames per phase (e.g., `/tmp/task-phase2.txt`, `/tmp/result-phase2.txt`) to avoid collisions.

**IMPORTANT**: Each task prompt you send to CC in Docker must be fully self-contained — include all context, file paths, exact commands, and expected outcomes. CC in Docker has no memory of previous phases.

---

## Phase 0: Environment Setup

### Step 0a: Start Docker workbench with PostgreSQL

```bash
cd docker/workbench && docker compose --profile postgres up -d --build
```

Wait for both databases to be healthy:
```bash
# SQL Server
docker exec sql-claude bash -c 'until /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -C -Q "SELECT 1" &>/dev/null; do sleep 2; done'
# PostgreSQL
docker exec postgres-claude bash -c 'until pg_isready -U mj_admin -d MJ_Workbench_PG; do sleep 2; done'
```

### Step 0b: Initialize the container environment

The container entrypoint is `tail -f /dev/null` (keeps it alive). Run essential setup:
```bash
docker exec claude-dev bash -c "npm update -g @anthropic-ai/claude-code @memberjunction/cli 2>/dev/null || true"
```

### Step 0c: Sync the repo inside Docker on a dedicated branch

Docker always works on a **dedicated branch** named `pg-migrate/<source-branch>` to keep the local branch clean. All conversion work, toolchain fixes, and test databases happen on this branch. Files are copied back to the host repo in Phase 5.

```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
CURRENT_SHA=$(git rev-parse HEAD)
PG_BRANCH="pg-migrate/${CURRENT_BRANCH}"

# If /workspace/MJ doesn't exist yet, clone it
docker exec claude-dev bash -c "test -d /workspace/MJ/.git || git clone https://github.com/MemberJunction/MJ.git /workspace/MJ"

# Fetch, checkout source branch to get latest code, then create/reset the pg-migrate branch
docker exec claude-dev bash -c "cd /workspace/MJ && git fetch origin && git stash 2>/dev/null; git checkout $CURRENT_BRANCH 2>/dev/null || git checkout -b $CURRENT_BRANCH origin/$CURRENT_BRANCH; git reset --hard $CURRENT_SHA; git checkout -B $PG_BRANCH"
```

### Step 0d: Check Claude Code authentication inside Docker

```bash
docker exec claude-dev bash -c 'echo "Reply with exactly: AUTH_OK" | claude --dangerously-skip-permissions -p 2>&1 | head -20'
```

**If the output contains `AUTH_OK`**: CC is authenticated, continue.

**If not**: Stop and tell the user:
> Claude Code inside Docker is not authenticated. Please run:
> ```
> docker exec -it claude-dev claude
> ```
> Complete OAuth login, then run `/pg-migrate` again.

**Do NOT proceed past this point if CC in Docker is not authenticated.** This is a hard gate.

### Step 0e: Build required packages inside Docker

```bash
docker exec claude-dev bash -c "cd /workspace/MJ && npm install && npx turbo build --filter=@memberjunction/sql-converter --filter=@memberjunction/cli --filter=@memberjunction/sqlglot-ts --filter=@memberjunction/sql-dialect"
```

Verify the build succeeded before continuing.

---

## Phase 1: Discover Missing Migrations

Run this locally (on the host) since it's just file comparison:

```bash
# Find SQL Server migrations with no PG equivalent
comm -23 \
  <(ls migrations/v5/*.sql | xargs -I{} basename {} .sql | sort) \
  <(ls migrations-pg/v5/*.pg.sql | xargs -I{} basename {} .pg.sql | sort)
```

Also note PG-only files (in `migrations-pg/v5/` with no SQL Server source) — these are intentional PG-specific patches; preserve them.

Report: "Found N migrations needing PG conversion" with the full list.

If zero missing, skip to Phase 3. **Phase 3 and Phase 4 ALWAYS run** — even when all conversions succeed perfectly, these phases provide essential confidence that the full migration stack works end-to-end.

---

## Phase 2: Convert and Validate (Delegated to CC in Docker)

This is the core phase. Build the task prompt below, substituting `{{MISSING_FILES_LIST}}` with the numbered list from Phase 1. Send to CC in Docker using the delegation pattern.

### Phase 2 Task Prompt

```
You are running inside the claude-dev Docker container with the MJ repo at /workspace/MJ.

Your job: Convert SQL Server migrations to PostgreSQL and validate them. Work through each file in order. Never manually edit converted files — always fix the toolchain and re-convert.

CRITICAL: ONLY convert the files listed below. Do NOT re-convert any existing .pg.sql files that are already present in migrations-pg/v5/. Even if the toolchain has improved, re-converting old migrations is a breaking change. Only new/missing migrations should be converted.

CRITICAL: Your converted output MUST NOT contain any "-- TODO:" comments. If the sql-convert tool produces TODO comments, that means the toolchain has a bug. You must fix the relevant rule in packages/SQLConverter/src/rules/, rebuild, and re-convert. Never accept TODO comments in output — they represent unconverted SQL that will be silently skipped.

## Database Connections
- PostgreSQL: host=postgres-claude, port=5432, user=mj_admin, password=Claude2Pg99 (use PGPASSWORD env var)
- SQL Server: host=sql-claude, port=1433, user=sa, password=Claude2Sql99
  - sqlcmd: /opt/mssql-tools18/bin/sqlcmd -S sql-claude -U sa -P Claude2Sql99 -C

## Files to Convert (in order)
{{MISSING_FILES_LIST}}

## For Each File

### Step 1: Convert
```bash
npx mj sql-convert migrations/v5/FILENAME.sql --from tsql --to postgres --output migrations-pg/v5/FILENAME.pg.sql --schema __mj --verbose
```

### Step 2: Inspect
Read the converted file. Check for:
- Empty output or very small output relative to input
- `-- TODO:` comments (UNACCEPTABLE — fix the toolchain rule and re-convert)
- Unconverted T-SQL syntax (remaining [brackets], NVARCHAR, sp_addextendedproperty)
- Missing semicolons or malformed PL/pgSQL

### Step 3: Test on fresh PG database
Drop and recreate a test database, then run ALL PG v5 migrations through the current file:

```bash
export PGPASSWORD=Claude2Pg99
psql -h postgres-claude -U mj_admin -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'MJ_Migrate_Test' AND pid <> pg_backend_pid();" 2>/dev/null
psql -h postgres-claude -U mj_admin -d postgres -c "DROP DATABASE IF EXISTS \"MJ_Migrate_Test\";"
psql -h postgres-claude -U mj_admin -d postgres -c "CREATE DATABASE \"MJ_Migrate_Test\";"
for f in $(ls /workspace/MJ/migrations-pg/v5/*.pg.sql | sort); do
  echo "Running: $(basename $f)"
  psql -h postgres-claude -U mj_admin -d MJ_Migrate_Test -f "$f" 2>&1 | tail -5
done
```

### Step 4: Handle failures
If migration fails:
1. Capture the exact error
2. Identify which SQLConverter rule should handle the pattern
3. Fix the rule in packages/SQLConverter/src/rules/ or ExpressionHelpers.ts or PostProcessor.ts
4. Rebuild: cd packages/SQLConverter && npm run build
5. Run tests: cd packages/SQLConverter && npm run test (ALL tests must pass)
6. Re-convert the file (back to Step 1)
7. Re-test migrations (back to Step 3)
8. If still failing after 3 attempts for the same pattern, log it as MANUAL_REVIEW_NEEDED and move on

### Step 5: Log result
For each file, record: filename, status (PASS/FAIL), error details if any, toolchain fixes applied

## After All Files

Verify zero TODO comments:
```bash
grep -c "TODO:" /workspace/MJ/migrations-pg/v5/*.pg.sql | grep -v ':0$'
```
If any remain, fix the toolchain and re-convert the affected files.

Write a JSON summary to /tmp/phase2-result.json:
{
  "files": [
    {"name": "filename.sql", "status": "PASS|FAIL", "attempts": N, "error": "...", "toolchainFixes": ["description"]},
    ...
  ],
  "toolchainChanges": [
    {"file": "path/to/changed/file", "description": "what was changed and why"},
    ...
  ],
  "manualReviewNeeded": [
    {"file": "migration.sql", "error": "...", "pattern": "the SQL pattern that failed", "attempts": ["what was tried"]},
    ...
  ]
}

Also write a human-readable summary to /tmp/phase2-summary.txt.

IMPORTANT: When you are completely finished, write the word PIPELINE_DONE as the very last line of your output.
```

After sending this task, poll for completion. When done, read `/tmp/phase2-result.json` and `/tmp/phase2-summary.txt` from the container. Report progress to the user.

**Orchestrator validation after Phase 2**: Before proceeding, the orchestrator MUST verify zero TODOs by running `grep -r "TODO:" migrations-pg/v5/*.pg.sql` on the Docker container. If any remain, send a follow-up fix task to CC in Docker.

---

## Phase 3: Full Parity Comparison

### Phase 3 Task Prompt

```
You are running inside the claude-dev Docker container with the MJ repo at /workspace/MJ.

Your job: Run a schema parity comparison between SQL Server and PostgreSQL using ONLY v5 migrations.

## Database Connections
- PostgreSQL: host=postgres-claude, port=5432, user=mj_admin, password=Claude2Pg99 (use PGPASSWORD)
- SQL Server: host=sql-claude, port=1433, user=sa, password=Claude2Sql99
  - sqlcmd: /opt/mssql-tools18/bin/sqlcmd -S sql-claude -U sa -P Claude2Sql99 -C

## Step 1: Fresh SQL Server database with v5 migrations

```bash
/opt/mssql-tools18/bin/sqlcmd -S sql-claude -U sa -P Claude2Sql99 -C -Q "IF DB_ID('MJ_Compare_SQL') IS NOT NULL BEGIN ALTER DATABASE MJ_Compare_SQL SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE MJ_Compare_SQL; END; CREATE DATABASE MJ_Compare_SQL;"
```

Then create __mj schema and run v5 migrations:
```bash
/opt/mssql-tools18/bin/sqlcmd -S sql-claude -U sa -P Claude2Sql99 -C -d MJ_Compare_SQL -Q "CREATE SCHEMA __mj;"
for f in $(ls /workspace/MJ/migrations/v5/*.sql | sort); do
  echo "Running: $(basename $f)"
  /opt/mssql-tools18/bin/sqlcmd -S sql-claude -U sa -P Claude2Sql99 -C -d MJ_Compare_SQL -i "$f" 2>&1 | tail -3
done
```

## Step 2: Fresh PostgreSQL database with v5 PG migrations

```bash
export PGPASSWORD=Claude2Pg99
psql -h postgres-claude -U mj_admin -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'MJ_Compare_PG' AND pid <> pg_backend_pid();" 2>/dev/null
psql -h postgres-claude -U mj_admin -d postgres -c "DROP DATABASE IF EXISTS \"MJ_Compare_PG\";"
psql -h postgres-claude -U mj_admin -d postgres -c "CREATE DATABASE \"MJ_Compare_PG\";"

for f in $(ls /workspace/MJ/migrations-pg/v5/*.pg.sql | sort); do
  echo "Running: $(basename $f)"
  psql -h postgres-claude -U mj_admin -d MJ_Compare_PG -f "$f" 2>&1 | tail -3
done
```

NOTE: Some PG migrations may produce errors for columns/tables that already exist from the baseline. Log these but continue — they're expected for idempotent migrations running after a baseline.

## Step 3: Compare schemas

Run these comparison queries:

### Tables
SQL Server: SELECT COUNT(*) FROM MJ_Compare_SQL.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '__mj' AND TABLE_TYPE = 'BASE TABLE'
PostgreSQL: SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '__mj' AND table_type = 'BASE TABLE'

### Views
SQL Server: SELECT COUNT(*) FROM MJ_Compare_SQL.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '__mj' AND TABLE_TYPE = 'VIEW'
PostgreSQL: SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '__mj' AND table_type = 'VIEW'

### Routines
SQL Server: SELECT COUNT(*) FROM MJ_Compare_SQL.INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = '__mj'
PostgreSQL: SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = '__mj'

### Tables in one but not the other
Get table lists from both and compare.

### Column count per table
SQL Server: SELECT TABLE_NAME, COUNT(*) FROM MJ_Compare_SQL.INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '__mj' GROUP BY TABLE_NAME ORDER BY TABLE_NAME
PostgreSQL: SELECT table_name, COUNT(*) FROM information_schema.columns WHERE table_schema = '__mj' GROUP BY table_name ORDER BY table_name

### Foreign keys
SQL Server: SELECT COUNT(*) FROM MJ_Compare_SQL.INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = '__mj' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
PostgreSQL: SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = '__mj' AND constraint_type = 'FOREIGN KEY'

## Step 4: Write results

Write to /tmp/phase3-result.json:
```json
{
  "sqlServer": {"tables": N, "views": N, "routines": N, "foreignKeys": N},
  "postgres": {"tables": N, "views": N, "routines": N, "foreignKeys": N},
  "tablesOnlyInSqlServer": [],
  "tablesOnlyInPostgres": [],
  "viewsOnlyInSqlServer": [],
  "viewsOnlyInPostgres": [],
  "columnMismatches": [{"table": "name", "sqlServer": N, "postgres": N}],
  "migrationErrors": {"sqlServer": [], "postgres": []}
}
```

Also write to /tmp/phase3-summary.txt.

IMPORTANT: When you are completely finished, write the word PIPELINE_DONE as the very last line of your output.
```

Poll for completion, read results, report to user.

---

## Phase 4: Smoke Testing

**ALWAYS run this phase** regardless of Phase 3 results. Even with perfect parity, smoke tests validate end-to-end functionality with the application layer.

### Phase 4 Task Prompt

```
You are running inside the claude-dev Docker container with the MJ repo at /workspace/MJ.

Your job: Start MJAPI against the PostgreSQL database and run smoke tests to validate the PG migration stack works end-to-end with the application layer.

## Database
The Phase 3 database MJ_Compare_PG on postgres-claude already has all v5 migrations applied. Use it.

- PostgreSQL: host=postgres-claude, port=5432, user=mj_admin, password=Claude2Pg99, database=MJ_Compare_PG

## Step 1: Build MJAPI and dependencies

```bash
cd /workspace/MJ
npx turbo build --filter=@memberjunction/server --filter=@memberjunction/server-bootstrap --filter=@memberjunction/mjapi
```

## Step 2: Configure MJAPI for PostgreSQL

Read the existing .env at /workspace/MJ/packages/MJAPI/.env to understand the variable names used. Then override the database connection settings to point to PostgreSQL (MJ_Compare_PG). Also check mj.config.cjs at the repo root.

Key settings to configure (adapt variable names to match what the .env uses):
- DB_HOST=postgres-claude
- DB_PORT=5432
- DB_USERNAME=mj_admin
- DB_PASSWORD=Claude2Pg99
- DB_DATABASE=MJ_Compare_PG

## Step 3: Start MJAPI

```bash
cd /workspace/MJ/packages/MJAPI
npm run start &
MJAPI_PID=$!
```

Wait up to 120 seconds for MJAPI to be listening. Check for "listening" or "ready" in output, or poll localhost:4000.

If MJAPI fails to start, capture the full error output — that IS the smoke test result.

## Step 4: Smoke Tests via GraphQL

Once MJAPI is running, test the GraphQL API directly with curl:

### Test 1: GraphQL Introspection
```bash
curl -s -X POST http://localhost:4000/ \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { queryType { name } mutationType { name } } }"}' | head -200
```
Expected: Returns schema info with query and mutation types.

### Test 2: Entity Metadata Query
```bash
curl -s -X POST http://localhost:4000/ \
  -H "Content-Type: application/json" \
  -d '{"query":"{ GetEntityByName(EntityName: \"Actions\") { ID Name SchemaName } }"}' | head -200
```
Expected: Returns entity metadata for Actions.

### Test 3: RunViewByName (read data)
```bash
curl -s -X POST http://localhost:4000/ \
  -H "Content-Type: application/json" \
  -d '{"query":"{ RunViewByName(input: { ViewName: \"All Actions\", MaxRows: 5 }) { TotalRowCount Results } }"}' | head -500
```
Expected: Returns rows from the Actions table.

### Test 4: List Entities
```bash
curl -s -X POST http://localhost:4000/ \
  -H "Content-Type: application/json" \
  -d '{"query":"{ AllEntities { ID Name Description } }"}' | head -500
```
Expected: Returns list of all entities.

### Test 5: Multiple entity views
```bash
for entity in "Users" "Entities" "Applications" "AI Models"; do
  echo "--- Testing: $entity ---"
  curl -s -X POST http://localhost:4000/ \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"{ RunViewByName(input: { ViewName: \\\"All ${entity}\\\", MaxRows: 3 }) { TotalRowCount } }\"}" | head -100
  echo
done
```

### Test 6: Health endpoint
```bash
curl -s http://localhost:4000/health 2>/dev/null || echo "No health endpoint"
```

NOTE: Some tests may require authentication. If you get auth errors, document which tests need auth and which work without it. The key test is whether MJAPI starts successfully and can connect to the PG database.

## Step 5: Cleanup
```bash
kill $MJAPI_PID 2>/dev/null
```

## Step 6: Write Results

Write to /tmp/phase4-result.json:
```json
{
  "mjapiStarted": true/false,
  "startupError": "error message if failed to start",
  "tests": [
    {"name": "GRAPHQL_INTROSPECTION", "status": "PASS|FAIL|SKIP", "details": "..."},
    {"name": "ENTITY_METADATA", "status": "PASS|FAIL|SKIP", "details": "..."},
    {"name": "RUN_VIEW", "status": "PASS|FAIL|SKIP", "details": "..."},
    {"name": "LIST_ENTITIES", "status": "PASS|FAIL|SKIP", "details": "..."},
    {"name": "ENTITY_VIEWS", "status": "PASS|FAIL|SKIP", "details": "..."},
    {"name": "HEALTH_CHECK", "status": "PASS|FAIL|SKIP", "details": "..."}
  ],
  "overallPass": true/false,
  "notes": "any additional observations"
}
```

Also write human-readable summary to /tmp/phase4-summary.txt.

IMPORTANT: When you are completely finished, write the word PIPELINE_DONE as the very last line of your output.
```

Poll for completion, read results.

---

## Phase 5: Report Generation and File Sync

### Step 5a: Copy converted migrations back to host

The Docker workspace is a named volume, so files don't automatically appear on the host. Copy them:

```bash
# Copy only NEW .pg.sql files (don't overwrite existing ones unless they were converted this run)
docker cp claude-dev:/workspace/MJ/migrations-pg/v5/ /path/to/host/MJ/migrations-pg/v5/
```

Use the actual host repo path. Only copy `.pg.sql` files that are new or changed.

Also copy any toolchain changes (SQLConverter rule fixes) back:
```bash
# Copy individual changed files, not the whole directory (to avoid nested directory issues)
for f in $(docker exec claude-dev bash -c "ls /workspace/MJ/packages/SQLConverter/src/rules/"); do
  docker cp "claude-dev:/workspace/MJ/packages/SQLConverter/src/rules/$f" "/path/to/host/MJ/packages/SQLConverter/src/rules/$f"
done
```

### Step 5b: Generate the final report

Assemble results from all phases into a comprehensive markdown report. Save to `migrations-pg/PG_MIGRATION_REPORT.md` on the **host** repo.

**Report structure:**

```markdown
# PostgreSQL Migration Parity Report
Generated: [timestamp]
Branch: [current branch]
Host: Docker workbench (claude-dev)

## Summary
- Total SQL Server v5 migrations: X
- Previously converted: Y
- Newly converted this run: Z
- Conversion failures (manual review): N
- TODO comments remaining: 0 (MUST be zero)
- SQLConverter tests: N/N passing
- Schema parity: Tables X/X, Views X/X
- Column mismatches: N tables (see details)
- Smoke tests: X/Y passed

## Migration Conversion Results
| # | Migration File | Status | Attempts | Notes |
|---|---------------|--------|----------|-------|

## Toolchain Fixes Applied
[List any changes made to SQLConverter rules, with file paths and descriptions]

## Schema Parity Comparison
| Metric | SQL Server | PostgreSQL | Match |
|--------|-----------|-----------|-------|

## Column Mismatches
| Table | SQL Server | PostgreSQL | Cause |
|-------|-----------|-----------|-------|

## Known Migration Errors (non-blocking)
**PostgreSQL:** [list]
**SQL Server:** [list]

## Smoke Test Results
| Test | Result | Details |
|------|--------|---------|

## PG-Only Migrations (Preserved)
[List any migrations in migrations-pg/ that have no SQL Server source]

## Action Items
[Prioritized list of issues to resolve]
```

### Step 5c: Present summary to user

Print a concise summary in chat with:
- How many migrations were converted
- Any failures requiring manual review
- Schema parity status
- Smoke test results
- Path to the full report
- Reminder that user can review and then ask you to commit/push

---

## Important Rules

1. **NEVER manually edit converted `.pg.sql` files** — always fix the toolchain and re-convert
2. **NEVER skip a migration** — process them in strict version order
3. **Always use a fresh database** for migration testing — drop and recreate each time
4. **All heavy work happens inside Docker** — never run migrations, SQL, or conversion on the host
5. **Preserve existing PG-only migrations** — files in `migrations-pg/v5/` with no SQL Server source are intentional
6. **NEVER re-convert existing migrations without explicit user approval** — Only convert NEW migrations (those discovered in Phase 1 as missing PG equivalents). Existing `.pg.sql` files that already work MUST NOT be re-run through the toolchain, even if the toolchain has improved. Re-converting old migrations is a breaking change once they've been deployed to any environment. If toolchain improvements would benefit old files, flag this to the user and let them decide.
7. **Copy results back to host** — Docker uses a named volume, so `docker cp` is needed to get files onto the host filesystem
8. **Discover CLI syntax dynamically** — if `mj sql-convert` or `mj migrate` flags differ from examples, use `--help` first
9. **Run SQLConverter unit tests** after any toolchain fix to prevent regressions
10. **Idempotent** — running again only processes migrations still missing PG equivalents
11. **Log everything** — all command output feeds into the final report
12. **Auth gate** — if CC in Docker isn't authenticated, stop immediately and tell the user how to fix it
13. **Self-contained task prompts** — each prompt sent to CC in Docker must include ALL context; it has no memory between phases
14. **Poll patiently** — CC in Docker may take hours for large conversion runs; poll every 30-60 seconds without timeout

## Quality Gates (CRITICAL)

### Zero TODO Comments Allowed
**Converted `.pg.sql` files MUST NOT contain any `-- TODO:` comments.** TODO comments indicate the SQLConverter failed to convert a SQL pattern and commented it out instead. This is unacceptable — every T-SQL statement must be properly converted to working PostgreSQL.

**After Phase 2 conversion, the orchestrator (you) MUST run this validation:**
```bash
docker exec claude-dev bash -c 'grep -c "TODO:" /workspace/MJ/migrations-pg/v5/*.pg.sql | grep -v ":0$"'
```

If ANY TODO comments are found:
1. **Do NOT proceed to Phase 3** — the conversions are incomplete
2. Identify the SQLConverter rule producing the TODO (search `packages/SQLConverter/src/rules/` for the TODO text)
3. Send a follow-up fix task to CC in Docker with the specific TODO patterns to eliminate
4. Re-convert ALL affected files
5. Re-run the full migration set on a fresh PG database
6. Re-check for TODO comments
7. Only proceed when zero TODOs remain

### Full Migration Stack Validation
After all conversions pass the TODO check, the full PG migration set (baseline + all migrations) must run on a fresh database as part of Phase 3. Phase 3 ALWAYS runs, even when Phase 2 has zero new files.

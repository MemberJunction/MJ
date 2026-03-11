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

Use unique filenames per phase (e.g., `/tmp/task-phase1.txt`, `/tmp/result-phase1.txt`) to avoid collisions.

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
docker compose -f docker/workbench/docker-compose.yml exec sql-claude bash -c 'until /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -C -Q "SELECT 1" &>/dev/null; do sleep 2; done'
# PostgreSQL
docker compose -f docker/workbench/docker-compose.yml exec postgres-claude bash -c 'until pg_isready -U mj_admin -d MJ_Workbench_PG; do sleep 2; done'
```

### Step 0b: Initialize the container environment

The container entrypoint is `tail -f /dev/null` (keeps it alive). Run essential setup:
```bash
# Install/update tools
docker exec claude-dev bash -c "npm update -g @anthropic-ai/claude-code @memberjunction/cli 2>/dev/null || true"
```

### Step 0c: Sync the repo inside Docker

Ensure the Docker copy of MJ matches the host's current branch:
```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
CURRENT_SHA=$(git rev-parse HEAD)

# If /workspace/MJ doesn't exist yet, clone it
docker exec claude-dev bash -c "test -d /workspace/MJ/.git || git clone https://github.com/MemberJunction/MJ.git /workspace/MJ"

# Fetch and checkout the same branch and commit
docker exec claude-dev bash -c "cd /workspace/MJ && git fetch origin && git checkout $CURRENT_BRANCH 2>/dev/null || git checkout -b $CURRENT_BRANCH origin/$CURRENT_BRANCH && git reset --hard $CURRENT_SHA"
```

### Step 0d: Check Claude Code authentication inside Docker

Test if CC in Docker can run a trivial prompt:
```bash
docker exec claude-dev bash -c 'echo "Reply with exactly: AUTH_OK" | claude --dangerously-skip-permissions -p 2>&1 | head -20'
```

**If the output contains `AUTH_OK`**: CC is authenticated, continue.

**If the output contains an authentication error, OAuth prompt, or doesn't contain `AUTH_OK`**: Stop and tell the user:

> Claude Code inside Docker is not authenticated. Please run:
> ```
> docker exec -it claude-dev claude
> ```
> This will open an interactive session where you can complete OAuth login. Once authenticated, run `/pg-migrate` again.

**Do NOT proceed past this point if CC in Docker is not authenticated.** This is a hard gate.

### Step 0e: Build required packages inside Docker

```bash
docker exec claude-dev bash -c "cd /workspace/MJ && npm install && npx turbo build --filter=@memberjunction/sql-converter --filter=@memberjunction/cli --filter=@memberjunction/sqlglot-ts --filter=@memberjunction/sql-dialect"
```

Verify the build succeeded before continuing.

---

## Phase 1: Discover Missing Migrations

Run this locally (on the host) since it's just file comparison:

**Logic:**
- For each `*.sql` file in `migrations/v5/`, check if `migrations-pg/v5/` has a file with the same base name but `.pg.sql` extension
- Example: `V202603021058__v5.5.x__Metadata_Sync.sql` → look for `V202603021058__v5.5.x__Metadata_Sync.pg.sql`
- Build an ordered list of missing files (sorted by filename, which is version-ordered)
- Also note PG-only files (in `migrations-pg/v5/` with no SQL Server source) — these are intentional PG-specific patches; preserve them

```bash
# Find SQL Server migrations with no PG equivalent
comm -23 \
  <(ls migrations/v5/*.sql | xargs -I{} basename {} .sql | sort) \
  <(ls migrations-pg/v5/*.pg.sql | xargs -I{} basename {} .pg.sql | sort)
```

Report: "Found N migrations needing PG conversion" with the full list.

If zero missing, skip to Phase 3.

---

## Phase 2: Convert and Validate (Delegated to CC in Docker)

This is the core phase. Send a **single comprehensive task** to CC in Docker that covers all missing migrations. This allows CC in Docker to iterate autonomously without round-trips.

Write a task prompt and send it to CC in Docker using the delegation pattern. The task prompt should be:

---

**BEGIN TASK PROMPT FOR CC IN DOCKER** (adapt the file list dynamically):

```
You are running inside the claude-dev Docker container with the MJ repo at /workspace/MJ.

Your job: Convert SQL Server migrations to PostgreSQL and validate them. Work through each file in order. Never manually edit converted files — always fix the toolchain and re-convert.

## Tools Available
- `npx mj sql-convert <input> --from tsql --to postgres --output <output> --schema __mj --verbose` — converts a single migration file
- `flyway` or `npx mj migrate` — runs migrations against a database
- Check `npx mj sql-convert --help` and `npx mj migrate --help` for exact flags

## Database Connections
- PostgreSQL: host=postgres-claude, port=5432, user=mj_admin, password=Claude2Pg99
- SQL Server: host=sql-claude, port=1433, user=sa, password=Claude2Sql99

## Files to Convert (in order)
[INSERT DYNAMIC LIST OF MISSING FILES HERE, e.g.:]
1. V202603021058__v5.5.x__Metadata_Sync.sql
2. V202603021401__v5.6.x__Grant_UI_Role_Agent_Permissions.sql
...

## For Each File

### Step 1: Convert
Run: npx mj sql-convert migrations/v5/FILENAME.sql --from tsql --to postgres --output migrations-pg/v5/FILENAME.pg.sql --schema __mj --verbose

### Step 2: Inspect
Read the converted file. Check for:
- Empty output or very small output relative to input
- Error comments or unconverted T-SQL syntax (e.g., remaining [brackets], NVARCHAR, sp_addextendedproperty)
- Missing semicolons or malformed PL/pgSQL

### Step 3: Test on fresh PG database
Drop and recreate a test database, then run ALL PG migrations through the current file:

psql -h postgres-claude -U mj_admin -d postgres -c "DROP DATABASE IF EXISTS \"MJ_Migrate_Test\";"
psql -h postgres-claude -U mj_admin -d postgres -c "CREATE DATABASE \"MJ_Migrate_Test\";"

Then run migrations. Try mj migrate first, fall back to flyway if needed. Discover exact syntax via --help.

### Step 4: Handle failures
If migration fails:
1. Capture the exact error
2. Identify which SQLConverter rule should handle the pattern
3. Fix the rule in packages/SQLConverter/src/rules/ or ExpressionHelpers.ts or PostProcessor.ts
4. Rebuild: cd packages/SQLConverter && npm run build
5. Run tests: cd packages/SQLConverter && npm run test (tests must pass)
6. Re-convert the file (back to Step 1)
7. Re-test migrations (back to Step 3)
8. If still failing after 3 attempts for the same pattern, log it as MANUAL_REVIEW_NEEDED and move on

### Step 5: Log result
For each file, record: filename, status (PASS/FAIL), error details if any, toolchain fixes applied

## After All Files

Write a JSON summary to /tmp/phase2-result.json:
{
  "files": [
    {"name": "filename.sql", "status": "PASS|FAIL", "attempts": N, "error": "...", "toolchainFixes": ["description of fix 1", ...]},
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
```

**END TASK PROMPT**

---

After sending this task, poll for completion. CC in Docker may run for a long time (minutes to hours depending on how many files and how many toolchain fixes are needed).

When done, read `/tmp/phase2-result.json` and `/tmp/phase2-summary.txt` from the container:
```bash
docker exec claude-dev cat /tmp/phase2-result.json
docker exec claude-dev cat /tmp/phase2-summary.txt
```

Report progress to the user.

---

## Phase 3: Full Parity Comparison

Send another task to CC in Docker:

**Task prompt:**

```
You are running inside claude-dev with MJ at /workspace/MJ.

Run a full schema parity comparison between SQL Server and PostgreSQL after all migrations.

## Step 1: Fresh SQL Server database
Create a fresh SQL Server database and run all SQL Server migrations:
- Use db-bootstrap or flyway against sql-claude
- Database name: MJ_Compare_SQL
- Migrations location: migrations/v5

## Step 2: Fresh PostgreSQL database
Create a fresh PG database and run all PG migrations:
- Drop/create MJ_Compare_PG on postgres-claude
- Run: psql -h postgres-claude -U mj_admin -d postgres -c "DROP DATABASE IF EXISTS \"MJ_Compare_PG\";" && psql -h postgres-claude -U mj_admin -d postgres -c "CREATE DATABASE \"MJ_Compare_PG\";"
- Run all migrations from migrations-pg/v5 against MJ_Compare_PG

## Step 3: Compare
Run comparison queries on both databases and compare:
1. Table count (INFORMATION_SCHEMA.TABLES where schema = '__mj')
2. Column count per table
3. View count
4. Stored procedure count (SQL Server) vs function count (PostgreSQL)
5. Row count per table (for tables with data)
6. Index count per table
7. Foreign key count per table

## Step 4: Produce report
Write results to /tmp/phase3-result.json:
{
  "sqlServer": {"tables": N, "views": N, "procedures": N, "totalRows": N},
  "postgres": {"tables": N, "views": N, "functions": N, "totalRows": N},
  "match": true/false,
  "variances": [
    {"type": "table|view|procedure|rows|columns", "object": "name", "sqlServer": "value", "postgres": "value", "likelyCause": "..."},
    ...
  ]
}
Also write human-readable summary to /tmp/phase3-summary.txt.
```

Poll for completion, read results, report to user.

---

## Phase 4: Smoke Testing

**Only run if Phase 3 passes with zero or minor variances.**

Send a task to CC in Docker:

**Task prompt:**

```
You are running inside claude-dev with MJ at /workspace/MJ.

Start MJAPI and MJExplorer against the PostgreSQL database and run headless browser smoke tests.

## Step 1: Configure and start MJAPI for PostgreSQL
Modify or override the .env to point to PostgreSQL:
- DB_HOST=postgres-claude
- DB_PORT=5432
- DB_USER=mj_admin
- DB_PASSWORD=Claude2Pg99
- DB_DATABASE=MJ_Compare_PG

Start MJAPI (port 4000) and wait for it to be listening.
Start MJExplorer (port 4200) and wait for compilation to complete.

## Step 2: Browser smoke tests
Use playwright-cli for headless browser testing.

Load credentials from .env (TEST_UID, TEST_PWD) for the da-robot-tester account.

Open http://localhost:4200 and run these tests:

1. LOGIN: Fill in test credentials on Auth0 login page, submit, verify redirect to app
2. DATA_EXPLORER: Navigate to Data Explorer, verify grid loads with data
3. OPEN_ACTION: Open an Action record, verify form fields display correctly
4. EDIT_ACTION: Make a small edit to an Action, save, verify save succeeds
5. OPEN_CATEGORY: Open an Action Category record, verify it loads
6. EDIT_CATEGORY: Edit and save, verify Record Changes are tracked
7. ADMIN_ERD: Navigate to Admin area, verify ERD diagram renders
8. CHAT_SAGE: Open Chat/Sage, verify interface loads, send "hello" message
9. ENTITY_LISTS: Navigate to 3-4 different entity lists, verify grids render
10. CONSOLE_ERRORS: Check browser console for JavaScript errors throughout

For each test, record PASS/FAIL with details.

## Step 3: Cleanup
Kill MJAPI and Explorer processes. Close the browser.

## Step 4: Results
Write to /tmp/phase4-result.json:
{
  "tests": [
    {"name": "LOGIN", "status": "PASS|FAIL|SKIP", "details": "..."},
    ...
  ],
  "consoleErrors": ["error1", "error2"],
  "overallPass": true/false
}
Also write human-readable summary to /tmp/phase4-summary.txt.
```

Poll for completion, read results.

---

## Phase 5: Report Generation and File Sync

### Step 5a: Copy converted migrations back to host

The Docker workspace is a named volume, so files don't automatically appear on the host. Copy them:

```bash
# For each newly converted file, copy from Docker to host
docker cp claude-dev:/workspace/MJ/migrations-pg/v5/ /path/to/host/MJ/migrations-pg/v5/
```

Use the actual host repo path. Only copy `.pg.sql` files that are new or changed.

Also copy any toolchain changes (SQLConverter rule fixes) back:
```bash
docker cp claude-dev:/workspace/MJ/packages/SQLConverter/src/ /path/to/host/MJ/packages/SQLConverter/src/
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
- Total SQL Server migrations: X
- Previously converted: Y
- Newly converted this run: Z
- Conversion failures (manual review): N
- Schema parity: PASS/FAIL (N variances)
- Smoke tests: X/Y passed

## Migration Conversion Results
| # | Migration File | Status | Attempts | Notes |
|---|---------------|--------|----------|-------|
| 1 | V20260302... | PASS | 1 | Converted cleanly |
| 2 | V20260304... | PASS | 3 | Required toolchain fix |
| 3 | V20260308... | FAIL | 3 | Manual review needed |

## Toolchain Fixes Applied
[List any changes made to SQLConverter rules, with file paths and descriptions]

## Schema Parity Comparison
| Metric | SQL Server | PostgreSQL | Match |
|--------|-----------|-----------|-------|
| Tables | 150 | 150 | YES |
| Views | 200 | 198 | NO |
| Procedures/Functions | 300 | 298 | NO |
| Total Data Rows | 5000 | 5000 | YES |

## Variances Detail
[For each variance: object name, difference, likely cause, suggested resolution]

## Manual Review Needed
[For each unresolved item: file, error, SQL pattern, what was attempted]

## Smoke Test Results
| Test | Result | Details |
|------|--------|---------|
| Login | PASS | |
| Data Explorer | PASS | |
| ... | ... | ... |

## PG-Only Migrations (Preserved)
[List any migrations in migrations-pg/ that have no SQL Server source — these are intentional]
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
6. **Copy results back to host** — Docker uses a named volume, so `docker cp` is needed to get files onto the host filesystem
7. **Discover CLI syntax dynamically** — if `mj sql-convert` or `mj migrate` flags differ from examples, use `--help` first
8. **Run SQLConverter unit tests** after any toolchain fix to prevent regressions
9. **Idempotent** — running again only processes migrations still missing PG equivalents
10. **Log everything** — all command output feeds into the final report
11. **Auth gate** — if CC in Docker isn't authenticated, stop immediately and tell the user how to fix it
12. **Self-contained task prompts** — each prompt sent to CC in Docker must include ALL context; it has no memory between phases
13. **Poll patiently** — CC in Docker may take hours for large conversion runs; poll every 30-60 seconds without timeout

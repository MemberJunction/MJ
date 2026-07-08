# PostgreSQL Migration Sync (v2 — split-and-regenerate)

Converts new SQL Server migrations to PostgreSQL via the **split-and-regenerate**
pipeline (`mj migrate convert --split`), finishes the small hand-authored
residue, proves the result by applying it to a fresh PG database, then runs the
full parity / verification / full-stack smoke / CRUD validation.

**All work runs inside the `claude-dev` Docker container** (on a dedicated
branch) — the host repo is untouched until Phase 5 copies the converted files
back. Conversion + deploy + verification are deterministic CLI commands the
orchestrator runs via `docker exec`; gap hand-authoring and the browser phases
are delegated to Claude Code running inside the container.

---

## How the pipeline works

`mj migrate convert --split` classifies each migration and transpiles only the
~2% hand-written DDL via the sqlglot AST dialect. CodeGen objects (views / sprocs
/ triggers / grants) are **baked inline** into each new migration at conversion
time (`--bake-codegen`, see Step 1d); mj-sync metadata is re-seeded by `mj sync
push`. One `--split` run converts everything lacking a `.pg.sql`/`.pg-only.sql`
counterpart; baselines already have committed `.pg.sql` counterparts and are
**not** reconverted.

**Deploy is `mj migrate` + `mj sync push` — never `mj codegen`.** New migrations
carry their CodeGen baked inline (Step 1d), so applying the `.pg.sql` set yields the
correct schema directly.

The real gate is **`mj migrate` applying cleanly to a fresh PG DB**, then
`mj sync push` completing — the converter's "0 gaps" summary is structural only
and does NOT prove the SQL applies. Hand-authoring the procedural residue
(`.needs-hand` files) is the **expected, supported** last mile; only fix the AST
dialect when a gap is a genuine transpiler limitation affecting many files.

**Load-bearing invariant:** committed `migrations-pg/v5/*.pg.sql` and
`*.pg-only.sql` are a deployed historical ledger — **byte-for-byte immutable**.
This flow only ever produces PG counterparts for **new** SS migrations. Never
reconvert an existing `.pg.sql`.

---

## The three conversion outputs

`mj migrate convert --split` writes into `migrations-pg/v5/`:

- **`<name>.pg.sql`** — fully converted, ready to commit.
- **`<name>.pg.sql.needs-hand`** — a migration containing hand-written
  `PROCEDURE`/`FUNCTION`/`TRIGGER` the AST dialect won't auto-translate. Contains
  the DDL it *could* convert plus a `NEEDS HAND-AUTHORING` comment block. It is
  **deliberately not** a discoverable `.pg.sql`, so Flyway/Skyway won't apply a
  half-migration. **Finish the PL/pgSQL and rename it to `.pg.sql`.**
- **`conversion-gaps.report.json`** — consolidated machine-readable gap list
  (`needs-hand-authoring` routines + `unhandled {kind, snippet}` statements).
  Drive any LLM-assisted finishing from this file.
- **`CodeGen_Run_*.pg.sql`** — a tiny (~130-byte) marker for CodeGen-only runs
  ("no DDL to translate — regenerated natively via `mj codegen`"). Harmless and
  expected; leave it.

The run exits **non-zero on any gap** unless `--allow-gaps` is passed.

---

## Database naming convention

- **`MJ_PG_X_Y_Z`** — primary versioned PG database for a run (e.g. `MJ_PG_5_41_0`). Version from the latest migration's tag.
- **`MJ_PG_Migrate_Test`** — scratch DB for fresh-apply gating (dropped/recreated each run).
- **`MJ_SQL_Compare`** — SQL Server comparison DB for parity.

Determine the target version at the start (run on host — just file inspection):
```bash
LATEST_VERSION=$(ls migrations/v5/*.sql migrations-pg/v5/*.pg.sql migrations-pg/v5/*.pg-only.sql 2>/dev/null | sort | tail -1 | grep -oE 'v[0-9]+\.[0-9]+' | head -1 | sed 's/v//' | tr '.' '_')
PG_DB_NAME="MJ_PG_${LATEST_VERSION}_0"
echo "Target PG database: $PG_DB_NAME"
```
Pass `{{PG_DB_NAME}}` to the delegated Docker tasks.

---

## Orchestration model

**You (local Claude Code) are the orchestrator.** All execution happens in the
container; the host is read-only until Phase 5.

- **Deterministic phases (1 convert, 3 deploy + verify): orchestrator runs them
  via `docker exec`** — no nested Claude, no completion-marker polling.
- **Judgment phases (2 gap-authoring, 4 + 4b browser smoke/CRUD): delegated to
  Claude Code inside `claude-dev`** — these need in-container file edits or a
  browser-driving agent. Use the delegation pattern below.

### Delegation pattern (Phases 2, 4, 4b)

1. Write a self-contained task prompt to a temp file on the host
2. `docker cp /tmp/pg-v2-task.txt claude-dev:/tmp/task.txt`
3. `docker exec -d claude-dev bash -c 'cd /workspace/MJ && claude --dangerously-skip-permissions -p "$(cat /tmp/task.txt)" > /tmp/result.txt 2>&1 && echo __DONE__ >> /tmp/result.txt'`
4. Poll for `__DONE__` in `/tmp/result.txt` every 30–60s (no timeout — runs can take a while)
5. Read `/tmp/result.txt`

Use unique filenames per phase. Each delegated prompt must be fully
self-contained — CC in Docker has no memory between phases.

---

## Phase 0: Environment Setup

### Step 0a: Start the Docker workbench with PostgreSQL

The pipeline needs BOTH SQL Server and PostgreSQL. The PG container is opt-in via
the `postgres` profile:

```bash
cd docker/workbench && docker compose --profile postgres up -d --build
```

Wait for both healthy:
```bash
docker exec sql-claude bash -c 'until /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -C -Q "SELECT 1" &>/dev/null; do sleep 2; done'
docker exec postgres-claude bash -c 'until pg_isready -U mj_admin; do sleep 2; done'
```

### Step 0b: Initialize the container

```bash
docker exec claude-dev bash -c "npm update -g @anthropic-ai/claude-code @memberjunction/cli 2>/dev/null || true"
```

### Step 0c: Sync the repo inside Docker on a dedicated branch

Docker works on a dedicated branch `pg-migrate-v2/<source-branch>` so the local
branch stays clean. All conversion and validation happen here; converted files
are copied back to the host in Phase 5.

```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
CURRENT_SHA=$(git rev-parse HEAD)
PG_BRANCH="pg-migrate-v2/${CURRENT_BRANCH}"

docker exec claude-dev bash -c "test -d /workspace/MJ/.git || git clone https://github.com/MemberJunction/MJ.git /workspace/MJ"
docker exec claude-dev bash -c "cd /workspace/MJ && git fetch origin && git stash 2>/dev/null; git checkout $CURRENT_BRANCH 2>/dev/null || git checkout -b $CURRENT_BRANCH origin/$CURRENT_BRANCH; git reset --hard $CURRENT_SHA; git checkout -B $PG_BRANCH"
```

### Step 0d: Build required packages inside Docker

```bash
docker exec claude-dev bash -c "cd /workspace/MJ && npm install && npx turbo build --filter=@memberjunction/sql-converter --filter=@memberjunction/cli --filter=@memberjunction/sqlglot-ts --filter=@memberjunction/sql-dialect --filter=@memberjunction/codegen-lib"
```

### Step 0e: Python + sqlglot in the container

`mj migrate convert --split` and the view-equivalence harness need Python 3 +
`sqlglot`. Create a venv the harness's default path expects:

```bash
docker exec claude-dev bash -c "test -x /tmp/sqlglot-venv/bin/python3 || (python3 -m venv /tmp/sqlglot-venv && /tmp/sqlglot-venv/bin/pip install sqlglot)"
docker exec claude-dev bash -c "/tmp/sqlglot-venv/bin/python3 -c 'import sqlglot; print(\"sqlglot\", sqlglot.__version__)'"
```
The convert/verify commands below set `MJ_SQLGLOT_PYTHON=/tmp/sqlglot-venv/bin/python3`
and `SQLGLOT_PYTHON=/tmp/sqlglot-venv/bin/python3`.

### Step 0f: Auth gate for Docker Claude (needed for Phases 2, 4, 4b)

```bash
docker exec claude-dev bash -c 'echo "Reply with exactly: AUTH_OK" | claude --dangerously-skip-permissions -p 2>&1 | head -20'
```

If the output does **not** contain `AUTH_OK`, stop and tell the user to run
`docker exec -it claude-dev claude`, complete OAuth, then re-run `/pg-migrate-v2`.
This is a hard gate — gap-authoring and the browser phases all delegate to CC in
Docker. Do not proceed past this point unauthenticated.

### Step 0g: Browser-login strategy — magic-link by default (self-contained, no external IdP)

> **The recurring "login worked last week, not this week" trap — and why we don't
> depend on an external IdP anymore.** MJExplorer's auth config lives in the GITIGNORED
> `environment.development.ts`. The workbench entrypoint only makes it `AUTH_TYPE:'auth0'`
> when `docker/workbench/.env` carries `TEST_AUTH0_*`; absent those, Explorer falls back
> to the committed `environment.ts` (`AUTH_TYPE:'msal'`, Azure AD), and any hardcoded
> Auth0 login fails with *"username may be incorrect."* The pipeline only ever "worked"
> on leftover volume state. **Depending on Auth0/MSAL for headless automated login is the
> fragility.** The fix: log in with **magic-link**, which needs no external IdP, works
> **regardless of `AUTH_TYPE`** (the Explorer magic-link provider activates on a `#token=`
> fragment even under MSAL — see `mjexplorer-magic-link-provider.service.ts`), and mints a
> real session for an **existing seeded DB user**. This is **proven** to work headlessly on
> PostgreSQL and is the default for Phases 4/4b. (Auth0 remains an OPTIONAL path for anyone
> who wants to exercise the real IdP — see the note at the end of this step.)

No preflight credentials are required for the default (magic-link) path — the login is
provisioned in Phase 4 against the target DB. The only prerequisite is that
`magicLink.enabled: true` in the config the container's MJAPI reads (`mj.config.cjs`
ships it enabled for the dev/e2e flow; verify once):

```bash
docker exec claude-dev bash -lc 'grep -A2 "magicLink:" /workspace/MJ/mj.config.cjs | grep -q "enabled: true" && echo "magic-link enabled" || echo "SET magicLink.enabled=true in mj.config.cjs"'
```

> **Optional — real-IdP (Auth0) testing.** To exercise the actual Auth0 flow instead of
> magic-link, set `TEST_AUTH0_DOMAIN`/`TEST_AUTH0_CLIENT_ID`/`TEST_AUTH0_CLIENT_SECRET`/
> `TEST_UID`/`TEST_PWD` in `docker/workbench/.env`, `docker compose --profile postgres up
> -d --build` (entrypoint regenerates the Explorer env as Auth0), then log in with
> `$TEST_UID`/`$TEST_PWD`. This needs a live Auth0 tenant + test account; magic-link needs
> neither, so prefer it for routine runs.

---

## Phase 1: Convert with `--split` (in Docker)

### Step 1a: Seed the container with the host's current conversion state ("pick up where we are")

The container was reset to the committed SHA in Phase 0c, so it does NOT yet have
your host working-tree progress (the `.needs-hand` files / partial `.pg.sql` /
gap report from a prior `mj migrate convert --split` run). Copy the host's
current `migrations-pg/v5/` into the container so the run resumes from where you
are rather than re-deriving from committed state:

```bash
docker cp migrations-pg/v5/. claude-dev:/workspace/MJ/migrations-pg/v5/
```

> ⚠️ This overlays the host's working-tree state, including any modifications to
> already-committed `.pg.sql` files. Before relying on the result, confirm the
> only changes vs. the committed ledger are NEW files + `.needs-hand` files —
> existing committed `.pg.sql` must stay byte-for-byte (Rule 1). Surface any
> unexpected modification to the user instead of proceeding silently:
> ```bash
> docker exec claude-dev bash -c "cd /workspace/MJ && git status --porcelain migrations-pg/v5/ | grep -E '^ ?M ' | grep -E '\.pg\.sql$'"
> ```

### Step 1b: Run the converter

```bash
docker exec claude-dev bash -lc 'cd /workspace/MJ && MJ_SQLGLOT_PYTHON=/tmp/sqlglot-venv/bin/python3 npx mj migrate convert --split --verbose 2>&1 | tee /tmp/v2-convert.log'
#   --file V2026..__x.sql   convert one file
#   --dry-run               classify only, write nothing
#   --allow-gaps            exit 0 despite gaps (still emits .needs-hand + report)
```

If CLI flags differ from the above, run `mj migrate convert --help` in the
container first (discover syntax dynamically). The run converts every SS
migration in `migrations/v5/` lacking a `.pg.sql`/`.pg-only.sql` counterpart, and
exits non-zero if any gap remains (`--split` is idempotent — already-converted
files are skipped).

### Step 1c: Read the gap report

```bash
docker exec claude-dev bash -c "cat /workspace/MJ/migrations-pg/v5/conversion-gaps.report.json"
docker exec claude-dev bash -c "ls /workspace/MJ/migrations-pg/v5/*.pg.sql.needs-hand 2>/dev/null"
```

Summarize for the user: clean conversions, `needs-hand-authoring` routines, and
`unhandled` statement kinds. **Category-M metadata** `unhandled` entries (e.g.
`/* Set field properties for entity */`, `/* Set categories for N fields */`
`UPDATE __mj."EntityField" …`) are re-seeded by `mj sync push` in Phase 3 — they
are NOT blockers. Genuine blockers are the `needs-hand-authoring` routines.

If there are zero `.needs-hand` files, skip Phase 2.

### Step 1d: Bake CodeGen inline into the NEW migrations (`convert --bake-codegen`)

CodeGen objects are baked **inline** into each newly-converted migration so the set deploys with
`mj migrate` alone — no `mj codegen` at deploy. With `--bake-codegen`, convert advances
a working PG DB by applying the migration's hand DDL, then captures native **per-entity** CodeGen
(base view / CRUD sprocs / triggers / grants) for the entities that migration touched and writes them
into the `.pg.sql`. A migration with a transpile gap (hand-procedural / collation-dependent) keeps its
hand-authored form and bakes CodeGen around it.

```bash
docker exec claude-dev bash -lc '
cd /workspace/MJ
# working DB seeded to the latest committed state; bakes only the NEW migration(s)
export DB_PLATFORM=postgresql PG_HOST=postgres-claude PG_PORT=5432 \
  PG_DATABASE=MJ_PG_Rebake PG_USERNAME=mj_admin PG_PASSWORD=Claude2Pg99 \
  CODEGEN_DB_USERNAME=mj_admin CODEGEN_DB_PASSWORD=Claude2Pg99 MJ_CORE_SCHEMA=__mj
MJ_SQLGLOT_PYTHON=/tmp/sqlglot-venv/bin/python3 npx mj migrate convert --split --bake-codegen --verbose
'
```

Only bake the NEW migration(s) you just converted. **Never run `mj migrate rebake` across the
committed set** — committed `.pg.sql` are immutable (Rule 1); `rebake` is only for re-capturing a
single migration's baked block in place.

---

## Phase 2: Resolve gaps — hand-author the residue (delegated to Docker Claude)

Delegate to CC in Docker (it has in-container Read/Edit/Write across the full
repo at `/workspace/MJ` and can lift existing implementations from the committed
ledger). Build the prompt below and send via the delegation pattern.

### Phase 2 Task Prompt

```
You are running inside the claude-dev Docker container with the MJ repo at /workspace/MJ.

Your job: Finish the PostgreSQL hand-authoring residue from `mj migrate convert --split`. Each migrations-pg/v5/*.pg.sql.needs-hand file is a migration whose hand-written PROCEDURE/FUNCTION/TRIGGER the AST dialect could not auto-translate. Author the PL/pgSQL, then rename the file to .pg.sql. Never touch any already-clean committed .pg.sql.

## Inputs
- Gap report: /workspace/MJ/migrations-pg/v5/conversion-gaps.report.json
- The .needs-hand files it lists. Each has the DDL it COULD convert + a "NEEDS HAND-AUTHORING" comment block marking what you must write.

## For each .needs-hand file

### Step 1: LIFT FROM THE COMMITTED LEDGER FIRST
Many of these routines were hand-ported in earlier releases and already exist in committed migrations-pg/v5/*.pg.sql. Search before translating from scratch:
  grep -rl '<RoutineName>' /workspace/MJ/migrations-pg/v5/*.pg.sql
If a correct PG implementation exists, lift it (adjusting only for this migration's context).

### Step 2: Translate T-SQL → PL/pgSQL (if not liftable)
- CREATE PROCEDURE → CREATE OR REPLACE FUNCTION … RETURNS … LANGUAGE plpgsql
- @param → named params; DECLARE @x T → DECLARE x T; in a DECLARE block
- SELECT @x = … → SELECT … INTO x; IF…BEGIN…END → IF … THEN … END IF;
- Quote identifiers (__mj."Table", "Column"); GETUTCDATE()/SYSUTCDATETIME() → now() at time zone 'utc' (or clock_timestamp() where the original used a non-deterministic "now")
- MIRROR THE ORIGINAL'S ATOMICITY SEMANTICS EXACTLY. A token-checked lease/lock renewal MUST keep its `WHERE … LockToken = @ExpectedToken` guard verbatim (lost-mutex protection). Do not "simplify" predicates.
- Preserve the GRANT EXECUTE … TO "cdp_Developer"/"cdp_Integration" and COMMENT ON lines already present in the file.

Replace the NEEDS HAND-AUTHORING comment block with the authored routine in place.

### Step 3: Rename
  git mv migrations-pg/v5/<name>.pg.sql.needs-hand migrations-pg/v5/<name>.pg.sql
(or plain mv if untracked)

## Known Category-C source migrations (your gap report shows which are in scope)
V202602131500 Entity_Name_Normalization_And_ClassName_Prefix_Fix   FUNCTION StripToAlphanumeric
V202602190836 Schema_Based_ClassName_Prefix                         FUNCTION
V202602191500 Fix_Entity_Name_References_In_JSON_Config             PROCEDURE
V202603231200 Update_CompanyIntegration_StoredProcs                 PROCEDURE
V202604090003 Geo_Features_Tables_And_Functions                     FUNCTION
V202604191502 Extend_spCreateRecordChange_Internal_For_Restore      PROCEDURE
V202604261352 Scoped_EntityField_SPs                                PROC
V202605091143 Add_IsComputed_To_EntityField                         PROC
V202605281538 Fix_AllowUpdateAPI_On_Virtual_Transition              PROC
V202606022336 Scheduling_Engine_Atomic_Sprocs                       PROCEDURE
V202606040230 AgentRunWatchdog_Maintenance_Sprocs                   PROCEDURE
Prioritize routines with confirmed runtime impact: spAcquireScheduledJobLock, spSweepStaleAIAgentRuns, spStampAIAgentRunHeartbeat, spExtendScheduledJobLease.

## Step 4: Confirm structural cleanliness
  cd /workspace/MJ && MJ_SQLGLOT_PYTHON=/tmp/sqlglot-venv/bin/python3 npx mj migrate convert --split --verbose
Then verify NO .needs-hand files remain:
  ls migrations-pg/v5/*.pg.sql.needs-hand 2>/dev/null && echo STILL_HAVE_GAPS || echo NO_GAPS_REMAIN

## Step 5: Write results to /tmp/phase2-result.json
{ "routines": [{"file":"V….pg.sql","routine":"spX","liftedFromLedger":true|false,"sourceLedgerFile":"…","notes":"…"}],
  "needsHandRemaining": 0,
  "convertExitClean": true }
Also write /tmp/phase2-summary.txt.

IMPORTANT: When completely finished, write PIPELINE_DONE as the very last line of your output.
```

### Orchestrator validation after Phase 2

```bash
docker exec claude-dev bash -c "ls /workspace/MJ/migrations-pg/v5/*.pg.sql.needs-hand 2>/dev/null && echo 'REJECTED: needs-hand files remain' || echo 'OK: no needs-hand files'"
```
Reject and re-send if any `.needs-hand` file remains or `needsHandRemaining != 0`.

> ⚠️ A clean exit / empty gap report is **necessary but NOT sufficient** — it only
> proves the converter could classify everything, not that the SQL applies.
> **The real gate is Phase 3.**

---

## Phase 3: Deploy gate + verification (in Docker)

The acceptance test: apply the converted set to a fresh PG database via the
two-pass flow, then run the four verification layers. Files are already in the
container — no copy needed.

### Step 3a: Fresh PG database + bootstrap roles

```bash
docker exec claude-dev bash -lc '
export PGPASSWORD=Claude2Pg99
psql -h postgres-claude -U mj_admin -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '"'"'MJ_PG_Migrate_Test'"'"' AND pid <> pg_backend_pid();" 2>/dev/null
psql -h postgres-claude -U mj_admin -d postgres -c "DROP DATABASE IF EXISTS \"MJ_PG_Migrate_Test\";"
psql -h postgres-claude -U mj_admin -d postgres -c "CREATE DATABASE \"MJ_PG_Migrate_Test\";"
psql -h postgres-claude -U mj_admin -d MJ_PG_Migrate_Test <<BOOT
DO \$b\$ BEGIN CREATE ROLE "cdp_UI" NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$b\$;
DO \$b\$ BEGIN CREATE ROLE "cdp_Developer" NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$b\$;
DO \$b\$ BEGIN CREATE ROLE "cdp_Integration" NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END \$b\$;
GRANT USAGE ON SCHEMA public TO "cdp_UI", "cdp_Developer", "cdp_Integration";
BOOT
'
```

### Step 3b: Deploy — THE GATE (`migrate → sync push`, NO codegen)

`mj migrate` applies the `.pg.sql` set (schema + each migration's baked CodeGen) and yields the
correct schema directly — **no `mj codegen` step**. Only `mj sync push` (metadata re-seed) follows.

`DB_PLATFORM=postgresql` triggers the PG provider and auto-swaps
`migrations/` → `migrations-pg/`.

```bash
docker exec claude-dev bash -lc '
cd /workspace/MJ
export DB_PLATFORM=postgresql DB_HOST=postgres-claude DB_PORT=5432 \
  DB_DATABASE=MJ_PG_Migrate_Test DB_ENCRYPT=false DB_TRUST_SERVER_CERTIFICATE=true \
  CODEGEN_DB_USERNAME=mj_admin CODEGEN_DB_PASSWORD=Claude2Pg99 MJ_CORE_SCHEMA=__mj

# 1. Apply schema + inline-baked CodeGen objects (all .pg.sql, in order, via Skyway). No codegen.
npx mj migrate --verbose 2>&1 | tee /tmp/v2-migrate.log

# 2. Seed metadata to current state (--ci = non-interactive)
npx mj sync push --dir metadata --ci 2>&1 | tee /tmp/v2-syncpush.log
'
```

**Gate criteria — ALL must hold before proceeding:**
1. `mj migrate` applies every migration with **no errors** (`/tmp/v2-migrate.log`) — including the
   baked views/sprocs/triggers/grants, with **no `mj codegen` step**.
2. `mj sync push` completes without errors.

If `mj migrate` fails on a converted file: capture the exact error, then either
(a) a hand-authoring bug in a `.needs-hand`-derived `.pg.sql` → re-delegate Phase 2
to fix that routine, or (b) a genuine AST-dialect limitation affecting many files
→ fix `packages/SQLGlotTS/src/python/mj_postgres.py` (or the relevant dialect
rule) in the container, rebuild, re-run `--split` for the affected file. **Never**
hand-patch a committed clean `.pg.sql`.

### Step 3c: Promote to the versioned DB

Once the gate passes against `MJ_PG_Migrate_Test`, build the canonical
`{{PG_DB_NAME}}` the same way (drop/recreate/bootstrap/two-pass) — Phases 4/4b
run against it.

### Step 3d: Verification layer 1 — conversion parity

```bash
docker exec claude-dev bash -lc 'cd /workspace/MJ && node scripts/check-pg-migration-parity.mjs 2>&1 | tee /tmp/v2-parity.log'
```
Zero-diff regression + file parity. Exits non-zero on real divergence.

### Step 3e: Verification layer 2 — SS↔PG schema parity

Build a fresh SQL Server comparison DB from the SS v5 migrations, then compare
schema counts + object lists against `{{PG_DB_NAME}}` (confirms end-state
schemas match).

```bash
docker exec claude-dev bash -lc '
/opt/mssql-tools18/bin/sqlcmd -S sql-claude -U sa -P Claude2Sql99 -C -Q "IF DB_ID('"'"'MJ_SQL_Compare'"'"') IS NOT NULL BEGIN ALTER DATABASE MJ_SQL_Compare SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE MJ_SQL_Compare; END; CREATE DATABASE MJ_SQL_Compare;"
/opt/mssql-tools18/bin/sqlcmd -S sql-claude -U sa -P Claude2Sql99 -C -d MJ_SQL_Compare -I -Q "CREATE SCHEMA __mj;"
cd /workspace/MJ
DB_PLATFORM=sqlserver DB_HOST=sql-claude DB_PORT=1433 DB_DATABASE=MJ_SQL_Compare \
  DB_ENCRYPT=false DB_TRUST_SERVER_CERTIFICATE=true \
  CODEGEN_DB_USERNAME=sa CODEGEN_DB_PASSWORD=Claude2Sql99 npx mj migrate --verbose
'
```

Then run the comparison queries against `MJ_SQL_Compare` (SS) vs `{{PG_DB_NAME}}` (PG):

| Object | SQL Server | PostgreSQL |
|---|---|---|
| Tables | `SELECT COUNT(*) FROM MJ_SQL_Compare.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='__mj' AND TABLE_TYPE='BASE TABLE'` | `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='__mj' AND table_type='BASE TABLE'` |
| Views | `…TABLE_TYPE='VIEW'` | `…table_type='VIEW'` |
| Routines | `SELECT COUNT(*) FROM …INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA='__mj'` | `SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema='__mj'` |
| Foreign keys | `…TABLE_CONSTRAINTS WHERE CONSTRAINT_TYPE='FOREIGN KEY'` | `…table_constraints WHERE constraint_type='FOREIGN KEY'` |

Every difference must be explained by a documented known-benign bucket — e.g.
CodeGen `fn_*_get_root_id` self-FK helpers add routines on PG; `MJ: List
Invitations.ExpiresAt` type drift. Any UNEXPLAINED difference is a bug.

### Step 3f: Verification layer 3 — view semantic equivalence

```bash
docker exec claude-dev bash -lc 'cd /workspace/MJ && SQLGLOT_PYTHON=/tmp/sqlglot-venv/bin/python3 PG_CONTAINER=postgres-claude EQUIV_DB={{PG_DB_NAME}} node scripts/ss-pg-view-equivalence.mjs 2>&1 | tee /tmp/v2-view-equiv.log'
```
Report on `realDiffers` (must be empty). `cosmeticOnly` (alias quoting/case) and
`createFailed` (recursive-CTE / `sys.*` catalog views production never
transpiles) are known-benign — do not chase.

### Step 3g: Verification layer 4 — CRUD behavioral oracle

```bash
docker exec claude-dev bash -lc 'cd /workspace/MJ && PG_CONTAINER=postgres-claude ORACLE_DB={{PG_DB_NAME}} node scripts/pg-crud-oracle.mjs 2>&1 | tee /tmp/v2-crud-oracle.log'
```
Behavioral create→update→delete per entity. Must be **0 failures**; 4 documented
skips are expected (`p_data`/`p_entityname` custom proc shapes; `MJ: Entities` /
`MJ: Entity Fields`). Full report: `/tmp/pg-crud-oracle-report.json`.

**Proceed to Phase 4 only when 3b gate passed and 3d–3g are green (modulo
known-benign buckets).**

---

## Phase 4: Full-Stack Browser Smoke Testing (delegated to Docker Claude)

Validate the full app stack
(MJAPI + MJExplorer + Playwright) against `{{PG_DB_NAME}}`. Two tiers: API smoke
(curl) and browser smoke (Playwright). Both MUST run; SKIP is not an allowed
status.

### Phase 4 Task Prompt

```
You are running inside the claude-dev Docker container with the MJ repo at /workspace/MJ.

Your job: Run FULL STACK smoke tests against the PostgreSQL database {{PG_DB_NAME}} — both API-level and browser-level.

## Database
{{PG_DB_NAME}} on postgres-claude already has all v5 migrations applied (CodeGen objects are baked into the migrations — no separate codegen step) + metadata seed. Use it.
- PostgreSQL: host=postgres-claude, port=5432, user=mj_admin, password=Claude2Pg99, database={{PG_DB_NAME}}

## Browser login — MAGIC-LINK (default, self-contained; NEVER hardcode an IdP account)
Log in via magic-link minted against an EXISTING seeded DB user (Step 5) — no Auth0/MSAL
account, no `TEST_*` creds, works under any `AUTH_TYPE`. A hardcoded external IdP account
is exactly what broke prior runs (an Auth0 account rejected by an MSAL-configured Explorer).

**Access model — this is FULL access, not a restricted guest.** A *named* magic-link (email
identity mode = the default) inherits the target user's **full DB roles** at request time
(`context.ts` builds the session with `userRecord.UserRoles`; only `mj_anon` sessions are
scope-restricted). So the session authorizes identically to that user logging in via
Auth0/MSAL — enough for the whole UI suite (grids, records, admin surfaces, CRUD). The
invite's `RoleID`/`ApplicationID` are only landing hints; they do NOT cap a named session.
**Rule: the access ceiling = the user you mint for.** Pick a broad-role user (e.g. one with
UI + Developer, or an Owner/admin) to exercise everything. Do NOT use anonymous mode
(`mj_anon`) for testing — that IS the restricted external-guest path.

(Optional real-IdP path: if you deliberately set `TEST_AUTH0_*` + `TEST_UID`/`TEST_PWD` and
rebuilt so Explorer serves Auth0, you may instead drive the Auth0 Universal Login with
`$TEST_UID`/`$TEST_PWD` — but magic-link is the default and needs nothing external.)

## TIER 1: API smoke

### Step 1: Build MJAPI
cd /workspace/MJ && npx turbo build --filter=@memberjunction/server --filter=@memberjunction/server-bootstrap --filter=@memberjunction/mjapi

### Step 2: Configure + start MJAPI for PG
Read /workspace/MJ/packages/MJAPI/.env and mj.config.cjs for variable names. Override DB connection to point at PostgreSQL {{PG_DB_NAME}} (DB_PLATFORM=postgresql, DB_HOST=postgres-claude, DB_PORT=5432, DB_USERNAME/PG_USERNAME=mj_admin, DB_PASSWORD/PG_PASSWORD=Claude2Pg99, DB_DATABASE/PG_DATABASE={{PG_DB_NAME}}, MJ_CORE_SCHEMA=__mj, GRAPHQL_PORT=4000).
cd /workspace/MJ/packages/MJAPI && npm run start > /tmp/mjapi.log 2>&1 &
Wait up to 120s for http://localhost:4000/ to respond. If it never starts, capture /tmp/mjapi.log — that is a Tier 1 failure; skip to results.

### Step 3: API smoke tests via curl (PASS/FAIL each)
- API_INTROSPECTION:   { __schema { queryType { name } mutationType { name } } }
- API_ENTITY_METADATA: { GetEntityByName(EntityName: "Actions") { ID Name SchemaName } }
- API_RUN_VIEW:        { RunViewByName(input: { ViewName: "All Actions", MaxRows: 5 }) { TotalRowCount Results } }
- API_LIST_ENTITIES:   { AllEntities { ID Name Description } }
- API_MULTI_VIEW:      RunViewByName "All Users", "All Entities", "All Applications", "All AI Models" (MaxRows 3 each)
Document which queries need auth vs. work anonymously.

## TIER 2: Browser smoke (Playwright) — MANDATORY, NO SKIPPING
Only proceed if MJAPI started. SKIP is not allowed — every test is PASS or FAIL.

### Step 4: npx playwright install chromium  (|| npx playwright install --with-deps chromium)

### Step 5: Mint a magic-link session (self-contained — no external IdP)
This is the RELIABLE login: it needs no Auth0/MSAL account, works under any `AUTH_TYPE`
(the Explorer magic-link provider activates on the `#token=` fragment even under MSAL),
and mints a real session for an EXISTING seeded user. **Proven headless on PostgreSQL.**
There is no authenticated admin to call `POST /magic-link/create`, so insert the invite
row directly. All commands run in the container against {{PG_DB_NAME}}.

```bash
# a. Verify magic-link routes are mounted (jwks 200; redeem GET = interstitial 200, NOT 401):
curl -s -o /dev/null -w "jwks=%{http_code}\n" localhost:4000/magic-link/jwks.json
curl -s -o /dev/null -w "redeem=%{http_code}\n" "localhost:4000/magic-link/redeem?token=probe"
#   401 on redeem ⇒ magic-link not enabled in the config MJAPI actually read → set
#   magicLink.enabled=true in mj.config.cjs and restart MJAPI before continuing.

# b. Pick an EXISTING user with the most roles (boots the shell cleanly), plus an app + a role it holds:
psql -h postgres-claude -U mj_admin -d {{PG_DB_NAME}} -tAc "SELECT u.\"ID\", u.\"Email\", count(ur.\"ID\") FROM __mj.\"User\" u LEFT JOIN __mj.\"UserRole\" ur ON ur.\"UserID\"=u.\"ID\" WHERE u.\"IsActive\" GROUP BY u.\"ID\",u.\"Email\" ORDER BY 3 DESC LIMIT 3;"
psql -h postgres-claude -U mj_admin -d {{PG_DB_NAME}} -tAc "SELECT \"ID\",\"Name\" FROM __mj.\"Application\" LIMIT 1;"   # ApplicationID
# RoleID: any role the chosen user has (e.g. its 'UI' role via UserRole join).

# c. Generate a token + matching hash (server stores base64url(sha256(rawToken))):
node -e 'const c=require("crypto");const raw="mj_ml_"+c.randomBytes(32).toString("hex");console.log(raw+"|"+c.createHash("sha256").update(raw).digest("base64url"))'
#   -> RAW|HASH   (keep RAW for the browser; insert HASH)

# d. Insert the invite (substitute HASH, the chosen USER_ID / APP_ID / ROLE_ID):
psql -h postgres-claude -U mj_admin -d {{PG_DB_NAME}} -c "INSERT INTO __mj.\"MagicLinkInvite\" (\"TokenHash\",\"Email\",\"ApplicationID\",\"RoleID\",\"ExpiresAt\",\"CreatedByUserID\",\"MaxUses\",\"UseCount\",\"Status\") VALUES ('<HASH>','<user email>','<APP_ID>','<ROLE_ID>', now()+interval '1 day','<USER_ID>',1,0,'Active');"
echo "<RAW>" > /tmp/ml_browser_token.txt   # the browser script reads this
```
(Sanity: `POST` redeeming a token returns `{"success":true,"token":"eyJ…"}` — a live proof the PG atomic-consume works; the pre-#3075 T-SQL consume returned `errorCode:"consumed"` with no token. Mint a FRESH token for the browser, since redeem is single-use.)

### Step 6: Build + serve MJExplorer on 4200
`--configuration=development` is REQUIRED so the app boots with a real dev config. The
served `AUTH_TYPE` does NOT matter for magic-link — the provider activates on the
`#token=` fragment regardless (msal/auth0/any). No Auth0 env provisioning needed.
```bash
cd /workspace/MJ && npx turbo build --filter=@memberjunction/ng-explorer
cd /workspace/MJ/packages/MJExplorer
NODE_OPTIONS=--max-old-space-size=16384 npx ng serve --port 4200 --host 0.0.0.0 --configuration=development > /tmp/mjexplorer.log 2>&1 &
```
Wait up to 180s for http://localhost:4200/. If it never compiles/serves, capture /tmp/mjexplorer.log — Tier 2 failure.

### Step 7: Playwright login — DETERMINISTIC SCRIPT with a shell assertion (VERIFIED working)
BROWSER_LOGIN is where prior runs silently lied ("Welcome Back" text matched *on the login
page* → false PASS → phantom "0 rows"). Drive login with the script below (place it inside
`/workspace/MJ` so ESM resolves `node_modules/playwright`, e.g. `/workspace/MJ/pg-login.mjs`).
It redeems the magic link → `#token` → shell, asserts a POSITIVE shell-only signal, and
hard-FAILs otherwise. **This exact flow is verified working headless on PG.**
```js
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const RAW = readFileSync('/tmp/ml_browser_token.txt','utf8').trim();
const b = await chromium.launch(); const pg = await b.newPage();
const shot = n => pg.screenshot({ path:`/tmp/login-${n}.png`, fullPage:true }).catch(()=>{});
try {
  // NEGATIVE CHECK first: before login the shell must be ABSENT (proves no false-positive).
  await pg.goto('http://localhost:4200/', { waitUntil:'domcontentloaded' });
  await pg.waitForTimeout(4000);
  const preShell = await pg.locator('mj-shell').first().isVisible().catch(()=>false);
  if (preShell) { console.log('LOGIN_FAIL negative-check: shell present before auth'); process.exit(1); }
  // Redeem: GET interstitial → click Continue (POST) → 302 → Explorer #token.
  await pg.goto(`http://localhost:4000/magic-link/redeem?token=${RAW}`, { waitUntil:'domcontentloaded' });
  const cont = pg.locator('button, input[type=submit], a').filter({ hasText:/continue|sign ?in|proceed/i }).first();
  if (await cont.isVisible().catch(()=>false)) await cont.click();
  else { const f = pg.locator('form').first(); if (await f.count()) await f.evaluate(el=>el.submit()); }
  await pg.waitForURL(/localhost:4200/, { timeout:60000 });
  await pg.waitForSelector('mj-shell', { timeout:90000 }).catch(()=>{});   // shell bootstraps async
  await pg.waitForLoadState('networkidle').catch(()=>{});
  await pg.waitForTimeout(3000);
  await shot('post');
  const url = pg.url();
  const onIdp = /auth0\.com|login\.microsoftonline\.com/i.test(url);
  const loginFormPresent = await pg.locator('input[type="password"]').first().isVisible().catch(()=>false);
  // `mj-shell` = MJExplorer's authenticated shell root (rendered inside <mj-explorer-app>
  // only AFTER auth; absent on the login screen). VERIFIED live.
  const shellPresent = await pg.locator('mj-shell').first().isVisible().catch(()=>false);
  const ok = shellPresent && !onIdp && !loginFormPresent && /localhost:4200/.test(url);
  if (!ok) { console.log('LOGIN_FAIL', JSON.stringify({url,onIdp,loginFormPresent,shellPresent})); console.log('DOM', (await pg.content()).slice(0,2000)); process.exit(1); }
  console.log('LOGIN_OK', url);
} catch (e) { await shot('err'); console.log('LOGIN_FAIL', String(e)); process.exit(1); }
finally { await b.close(); }
```
Run: `cd /workspace/MJ && node pg-login.mjs`. `LOGIN_OK` + exit 0 ⇒ BROWSER_LOGIN PASS; any `LOGIN_FAIL`/non-zero ⇒ **FAIL** (attach `/tmp/login-*.png` — do NOT paper over it). PASS is the shell assertion, never matched page text. Tests IN ORDER:
- BROWSER_LOAD: app origin responds before login
- BROWSER_LOGIN (MANDATORY): script above returns `LOGIN_OK`
- BROWSER_DATA: authenticated shell renders real DB data. **Reliable check:** assert seeded values are visible in the shell (e.g. a known user email `page.locator('body').innerText()` contains it) — this is verified working. NOTE: the landing surface (Identity & Access) is a *custom* editor, not an ag-grid.
- BROWSER_ENTITY_GRID: to exercise the ag-grid data view, navigate via **in-app UI clicks** (Data Explorer → an entity), NOT a cold-load deep link — a fresh `page.goto('/…/view/…')` does NOT mount the entity-viewer (shell URL updates but the tab content doesn't hydrate). When mounted, the grid container is `.mj-ag-grid` and data rows are `.ag-row` (ag-grid; verified from source). Assert `.ag-row` count > 0.
- BROWSER_OPEN_RECORD: open a record form via in-app click; fields populated
- BROWSER_CONSOLE: report critical JS errors across the run

### Step 8: Cleanup — kill MJAPI + MJExplorer, close playwright.

### Step 9: Write /tmp/phase4-result.json
{ "tier1": {"mjapiStarted": bool, "startupError": "...", "tests": [{"name","status":"PASS|FAIL","details"}]},
  "tier2": {"explorerStarted": bool, "loginMethod": "magic-link|auth0", "loginUser": "<authenticated email>", "startupError": "...",
            "loginSucceeded": bool, "loginAssertion": {"url":"...","onIdp":bool,"loginFormPresent":bool,"shellPresent":bool},
            "tests": [...], "consoleErrors": [], "screenshots": []},
  "overallPass": bool, "notes": "..." }
`loginSucceeded` MUST reflect the scripted shell assertion (LOGIN_OK), never a text match. Status MUST be PASS or FAIL only — SKIP is not allowed. Also write /tmp/phase4-summary.txt.

IMPORTANT: When completely finished, write PIPELINE_DONE as the very last line of your output.
```

### Orchestrator validation after Phase 4
Reject and re-run if: any test status is `SKIP`; `tier2.loginSucceeded` is false;
or any test in the schema is missing.
```bash
docker exec claude-dev bash -c 'python3 -c "
import json; r=json.load(open(\"/tmp/phase4-result.json\"))
sk=[t[\"name\"] for tier in [\"tier1\",\"tier2\"] for t in r.get(tier,{}).get(\"tests\",[]) if t[\"status\"]==\"SKIP\"]
print(\"REJECTED skipped:\",sk) if sk else print(\"VALIDATED: no skips\")"'
```

---

## Phase 4b: Deep CRUD Workflow Testing (delegated to Docker Claude)

Validate data mutation, navigation, and Record Changes audit tracking against
PG. Reuses the MJAPI/MJExplorer from Phase 4 (restart with the same PG config if
stopped).

### Phase 4b Task Prompt

```
You are running inside the claude-dev Docker container with the MJ repo at /workspace/MJ.

Your job: Run a DEEP CRUD workflow test against PostgreSQL {{PG_DB_NAME}} using Playwright. MJAPI (:4000) and MJExplorer (:4200) should already be running from Phase 4; if not, start them with the same PG config (DB_PLATFORM=postgresql, PG_HOST=postgres-claude, PG_DATABASE={{PG_DB_NAME}}, MJ_CORE_SCHEMA=__mj; Explorer with --configuration=development).

## Auth: reuse the Phase 4 MAGIC-LINK login. Mint a FRESH invite (Phase 4 Step 5 recipe — the last token was single-use and is consumed), write RAW to /tmp/ml_browser_token.txt, and run the deterministic /workspace/MJ/pg-login.mjs (shell-assertion gated). NEVER hardcode an IdP account. CRUD_LOGIN PASSes only on LOGIN_OK, never on matched page text.
## DB: postgres-claude:5432, mj_admin / Claude2Pg99, {{PG_DB_NAME}}

Run these tests IN ORDER (PASS/FAIL only — no SKIP). Navigate via IN-APP UI CLICKS (Data Explorer → entity), not cold-load deep links — a fresh page.goto to a view URL does not mount the ag-grid:
- CRUD_LOGIN: run pg-login.mjs; reach app shell (positive `mj-shell` assertion, not text)
- CRUD_NAVIGATE_TO_ACTIONS: Data Explorer → Actions list shows a grid of rows (`.ag-row` > 0)
- CRUD_OPEN_ACTION_RECORD: open first Action; form loads with populated fields; note Category
- CRUD_NAVIGATE_TO_CATEGORY: open the Action's Action Category record; note its Name
- CRUD_EDIT_CATEGORY_NAME: append " - PG Test" to the Name, Save, confirm no error
- CRUD_VERIFY_NAME_CHANGED: navigate away + back; grid shows the appended name
- CRUD_CHECK_RECORD_CHANGES: open the record's Record Changes / History; confirm an entry shows the Name change with old/new values and a recent timestamp
- CRUD_REVERT_NAME: remove " - PG Test", Save, confirm original restored
- CRUD_CONSOLE_CHECK: report critical JS errors (watch for __mj_CreatedAt, "Cannot return null", non-nullable field, save failures)

## Write /tmp/phase4b-result.json
{ "tests": [{"name","status":"PASS|FAIL","details"}],
  "overallPass": bool,
  "categoryEdited": {"original","modified","reverted":bool},
  "recordChangeDetected": bool, "consoleErrors": [], "notes": "..." }
Status MUST be PASS or FAIL only. Also write /tmp/phase4b-summary.txt.

IMPORTANT: When completely finished, write PIPELINE_DONE as the very last line of your output.
```

### Orchestrator validation after Phase 4b
All 9 tests PASS/FAIL (no SKIP); `recordChangeDetected === true` (proves PG
triggers + audit tracking); `categoryEdited.reverted === true`; no critical
console errors. Debug and re-run if any fail.

---

## Phase 5: Copy back to host, report, summarize

### Step 5a: Copy converted migrations back to the host

The work lived in the container's named volume — bring the converted files onto
the host filesystem. Copy only `.pg.sql` files (new + hand-authored); the
container should have **no** `.needs-hand` files left.

```bash
docker cp claude-dev:/workspace/MJ/migrations-pg/v5/. ./migrations-pg/v5/
# Sanity: no half-migrations made it back
ls migrations-pg/v5/*.pg.sql.needs-hand 2>/dev/null && echo "WARNING: needs-hand files copied back — Phase 2 incomplete" || echo "clean: no needs-hand files"
```

If you fixed the AST dialect in the container this run, also copy that back:
```bash
docker cp claude-dev:/workspace/MJ/packages/SQLGlotTS/src/python/mj_postgres.py packages/SQLGlotTS/src/python/mj_postgres.py
```

Retrieve the phase result JSONs for the report:
```bash
for p in phase2 phase4 phase4b; do docker cp "claude-dev:/tmp/${p}-result.json" "/tmp/${p}-result.json" 2>/dev/null; done
```

### Step 5b: Generate the report

Assemble all phases into `migrations-pg/PG_MIGRATION_REPORT.md` on the host:

```markdown
# PostgreSQL Migration Report (v2 — split-and-regenerate)
Generated: [timestamp]   Branch: [branch]

## Summary
- New SS migrations converted this run: Z
- Clean .pg.sql: A    Hand-authored from .needs-hand: B
- Conversion gaps remaining: 0 (structural)
- Fresh-DB deploy gate (migrate → sync push, NO codegen): PASS/FAIL
- Conversion parity (check-pg-migration-parity): PASS/FAIL
- SS↔PG schema parity: Tables X/X, Views X/X, Routines X/X (+N benign CodeGen fns), FKs X/X
- View semantic equivalence: realDiffers=[]  (cosmeticOnly N, createFailed N benign)
- CRUD oracle: N pass / 0 fail / 4 documented skips
- Full-stack smoke (Phase 4): X/Y    Deep CRUD (Phase 4b): X/9

## Files converted this run
| File | Outcome (clean / hand-authored) | Notes |

## Hand-authored routines (Category-C)
| Routine | Source migration | Lifted from ledger? | Notes |

## SS↔PG schema parity
| Metric | SQL Server | PostgreSQL | Match / benign cause |

## Verification harness results
[check-pg-migration-parity, ss-pg-view-equivalence, pg-crud-oracle — pass/fail + benign buckets]

## Known-benign / accepted differences
[CodeGen self-FK helper routines; List Invitations.ExpiresAt type drift; cosmetic view aliasing; etc.]

## Action items
[Prioritized]
```

### Step 5c: Present a concise summary in chat

Report: how many migrations converted, which routines were hand-authored (and
whether lifted from the ledger), the deploy-gate result, the four verification
layers, smoke/CRUD results, path to the full report, and a reminder that the
user can review and then ask you to commit/push. **Do not commit** — the converted
files are now on the host as uncommitted changes for the user to review.

---

## Important Rules

1. **Committed `.pg.sql` / `.pg-only.sql` are immutable.** Convert only NEW SS migrations. Never reconvert or hand-patch an existing clean `.pg.sql`. Baselines (`B*`) already have committed PG counterparts — never reconvert them. In Phase 1a, surface any host modification to an existing committed `.pg.sql` instead of laundering it through.
2. **The real gate is a clean fresh-DB deploy (Phase 3b), not the "0 gaps" summary.** "0 gaps" is structural; only `migrate → sync push` (NO codegen) on a fresh DB proves it applies.
3. **Hand-authoring `.needs-hand` routines is expected** — the supported last mile, not a converter failure. Lift from the committed ledger first; mirror atomicity semantics exactly. Only touch the AST dialect (`mj_postgres.py`) when a gap is a genuine transpiler limitation affecting many files.
4. **`mj codegen` await caveat** — always use `scripts/pg-codegen-await.mjs`; the bare CLI can fire-and-forget and exit-0 as a silent no-op.
5. **Category-M metadata gaps are not blockers** — `/* Set field properties */` / `/* Set categories for N fields */` `UPDATE __mj."EntityField"` statements are re-seeded by `mj sync push`, not transpiled. Don't treat their `unhandled` report entries as failures.
6. **Everything runs in Docker; host is read-only until Phase 5.** Phase 1a seeds the container from the host's working tree; Phase 5 copies converted files back. Never edit migration files on the host mid-run.
7. **Always use a fresh database** for the deploy gate and parity — drop and recreate each time.
8. **No SKIP statuses** in Phase 4/4b — every test is PASS or FAIL; reject and re-run otherwise.
9. **Self-contained delegated prompts** — Phases 2/4/4b prompts must include all context; CC in Docker has no memory between phases.
10. **Discover CLI syntax dynamically** — if `mj migrate convert`, `mj migrate`, `mj codegen`, or `mj sync push` flags differ from examples, run `--help` first.
11. **Poll patiently** — delegated phases can take a while; poll for `__DONE__` every 30–60s with no timeout.
12. **Auth gate (Phase 0f)** — if CC in Docker isn't authenticated, stop immediately; Phases 2/4/4b all delegate to it.
13. **Browser login = magic-link by default (self-contained). Don't depend on an external IdP.** Explorer's auth provider lives in the GITIGNORED `environment.development.ts`, so an Auth0/MSAL login depends on non-reproducible volume state — that's why "it worked last week, not this week." Magic-link sidesteps this entirely: mint an invite for an existing seeded user (Phase 4 Step 5) and redeem it — the provider activates on the `#token=` fragment under ANY `AUTH_TYPE`, needs no external account, and is DB-agnostic (PG-safe since #3075). It is VERIFIED working headless on PG. Auth0 is an optional path only if you deliberately supply `TEST_AUTH0_*` creds + rebuild. **Never hardcode an IdP email/password.**
14. **A login PASSes only on a positive authenticated-shell assertion — never on matched page text.** Prior runs matched "Welcome Back" *on the login page* and reported false success + phantom "0 rows". Use the deterministic login script (place it at `/workspace/MJ/pg-login.mjs` so ESM resolves `node_modules/playwright`): negative-check (shell absent pre-login) → redeem → `mj-shell` present + off the IdP domain + no password field. On failure, FAIL loudly with screenshots + DOM dump. Grid checks assert `.ag-row` count > 0 — but reach the grid via **in-app clicks**, not a cold-load `goto` (which won't mount the entity-viewer).
15. **Don't commit** — leave converted files as uncommitted host changes for the user to review.

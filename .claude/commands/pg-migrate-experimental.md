# PostgreSQL migration sync (experimental)

This runbook converts new SQL Server migrations to PostgreSQL, proves them on a
fresh database, and verifies parity and the full stack.

All work runs in the `claude-dev` Docker container. The host stays untouched
until the final copy-back. You run the deterministic steps from local Claude
Code using `docker exec`. You delegate browser testing to Claude Code inside the
container.

Run steps in parallel wherever you can. Never tear down a database or server you
will reuse. The slowest steps are the MJAPI and MJExplorer builds and the SQL
Server comparison database. Start them early so they finish while you convert and
run the gate.

---

## The one decision: delta or baseline

Two kinds of new migration need converting. They take different paths.

Delta migrations (`V*`) are the common case. Most runs are only these. `mj
migrate convert --split` transpiles the hand-written DDL, bakes CodeGen inline,
and reseeds metadata. This path is fast and well-trodden. Use Path A.

A new baseline (`B*`) is rare — one comes along every few releases. You cannot
bake it with `--split --bake-codegen`. MJ base views join other base views to get
foreign-key name fields, and per-entity name-order baking emits forward
references that fail on a fresh database. Use the pg_dump snapshot recipe
instead. Use Path B.

---

## Scope: only convert what a fresh install applies

The biggest time-waster is analysing migrations that do not matter. The one thing
that puts a SQL Server migration in scope is this: it has no matching `.pg.sql`
yet. That is the whole test. Do not filter by the baseline timestamp alone.

The baseline is not the cut-off. The deltas between the baseline and now already
have their own `.pg.sql` files, so they are done. You only convert the SQL Server
migrations that nobody has converted yet.

Take a worked example. The committed baseline is 5.38. You are building 5.45. The
5.38 to 5.44 migrations all have `.pg.sql` files already. So only the 5.45
migrations are in scope. Do not touch anything from 5.38 to 5.44.

A pre-baseline `V*` or `CodeGen_Run_*` file that has no `.pg.sql` is noise. Skyway
never applies it, because the baseline already absorbed it. Ignore it.

```bash
# In scope = SS migrations in migrations/v5 that have NO matching .pg.sql in migrations-pg/v5.
# In practice these are the newest ones — everything already converted has a .pg.sql sibling.
# A new B*.sql with no .pg.sql = Path B. A new V*.sql with no .pg.sql = Path A.
```

Report the in-scope set — usually 1 to 3 files — before you do anything. If a new
`B*` baseline is in scope, say so. It changes the plan.

---

## Phase 0 — set up and start the long builds now

```bash
# containers (PG is opt-in via the postgres profile)
cd docker/workbench && docker compose --profile postgres up -d --build   # skip if already up
docker exec sql-claude bash -c 'until /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -C -Q "SELECT 1" &>/dev/null; do sleep 2; done'
docker exec postgres-claude bash -c 'until pg_isready -U mj_admin; do sleep 2; done'
```

Sync the container to the host's exact tree on a dedicated branch. The host branch
may not be on origin. If `git reset --hard <sha>` fails, reset to `origin/next`
and apply a patch with `git am` from `format-patch origin/next..HEAD`. Then run:

```bash
# build the converter toolchain
docker exec claude-dev bash -lc "cd /workspace/MJ && npm install && npx turbo build --filter=@memberjunction/sql-converter --filter=@memberjunction/cli --filter=@memberjunction/sqlglot-ts --filter=@memberjunction/sql-dialect --filter=@memberjunction/codegen-lib"
# python + sqlglot venv (convert/verify need it)
docker exec claude-dev bash -lc "test -x /tmp/sqlglot-venv/bin/python3 || (python3 -m venv /tmp/sqlglot-venv && /tmp/sqlglot-venv/bin/pip install sqlglot)"
# auth gate for delegated browser phase — must print AUTH_OK, else stop and have the user run `docker exec -it claude-dev claude` to OAuth
docker exec claude-dev bash -lc 'echo "Reply with exactly: AUTH_OK" | claude --dangerously-skip-permissions -p 2>&1 | tail -3'
# magic-link must be enabled for the browser phase
docker exec claude-dev bash -lc "grep -A3 'magicLink:' /workspace/MJ/mj.config.cjs | grep -q 'enabled: true' || sed -i '0,/enabled: false,/{s/    enabled: false,/    enabled: true,/}' /workspace/MJ/mj.config.cjs"
```

Start the slow builds in the background now. They run through Phases 1 to 3.

```bash
# MJAPI + MJExplorer builds — needed only at the browser phase, so build them while you convert
docker exec -d claude-dev bash -lc 'cd /workspace/MJ && npx turbo build --filter=@memberjunction/server --filter=@memberjunction/server-bootstrap --filter=@memberjunction/mjapi --filter=@memberjunction/ng-explorer > /tmp/app-build.log 2>&1 && echo APP_BUILD_DONE >> /tmp/app-build.log'
```

Set the environment for every PG `mj` command once, then reuse it:

```
DB_PLATFORM=postgresql DB_HOST=postgres-claude DB_PORT=5432 DB_USERNAME=mj_admin DB_PASSWORD=Claude2Pg99 \
DB_ENCRYPT=false DB_TRUST_SERVER_CERTIFICATE=true PG_HOST=postgres-claude PG_PORT=5432 \
PG_USERNAME=mj_admin PG_PASSWORD=Claude2Pg99 CODEGEN_DB_USERNAME=mj_admin CODEGEN_DB_PASSWORD=Claude2Pg99 \
MJ_CORE_SCHEMA=__mj MJ_SQLGLOT_PYTHON=/tmp/sqlglot-venv/bin/python3
# (set DB_DATABASE / PG_DATABASE per step)
```

---

## Path A — delta migrations (common and fast)

```bash
docker exec claude-dev bash -lc 'cd /workspace/MJ && MJ_SQLGLOT_PYTHON=/tmp/sqlglot-venv/bin/python3 npx mj migrate convert --split --bake-codegen --file <V…sql> --verbose'
```

### Metadata-sync migrations

Convert metadata-sync migrations (`*_Metadata_Sync.sql`) with the legacy
converter — `mj migrate convert` without `--split`. Do not use the `--split` path.

These migrations produce no CodeGen output. But you must keep their metadata DML
and make it self-seeding. Do not let it collapse into a reseed marker of about
130 bytes.

Here is why the legacy path is correct. The mj-sync grammar is `DECLARE
@x_<hash>; SET @x=…; EXEC __mj.spCreate/Update… @x`. The v2 AST dialect cannot
transpile it — every `DECLARE` block lands in `unhandled`. So `--split` emits a
marker and silently defers the data to `mj sync push`. The legacy regex converter
transpiles it correctly into self-seeding blocks: `DO $mj$ … PERFORM
__mj."spCreateAIModel"(p_ID := …) … END $mj$;`. This is how the committed v5.43
and v5.44 `_Metadata_Sync.pg.sql` files were built. Versions 5.45 and later
regressed to markers.

A marker makes `mj migrate` silently depend on `mj sync push` for that data. That
is the trap that leaves a migrate-only database missing curated rows (see Path B,
step 1). A later sync push that reseeds the same rows is fine, because the upsert
is idempotent. So a self-seeding migration and a later push do not conflict.

```bash
npx mj migrate convert --file <V…_Metadata_Sync.sql>   # NO --split → real DO/PERFORM DML, not a marker
```

### A `.needs-hand` output

A `.needs-hand` output is a hand-written procedure, function, or trigger the AST
cannot translate. Lift the PG version from the committed ledger first:

```bash
grep -rl '<RoutineName>' migrations-pg/v5/*.pg.sql
```

Most were hand-ported in an earlier release. Copy any atomicity guards — token or
lock `WHERE` clauses — exactly. Then rename `.needs-hand` to `.pg.sql`.

### Live database for the bake

`--bake-codegen` needs a live PG working database seeded to the prior state. Use
the environment above and point `PG_DATABASE` at a scratch database seeded by `mj
migrate`.

Category-M metadata gaps do not block you. These are `UPDATE …EntityField`
statements and `/* Set field properties */` comments. `mj sync push` reseeds them
at deploy.

---

## Path B — new baseline (rare) using a pg_dump snapshot

A baseline is a dependency-ordered pg_dump of a working database at the
baseline's version. It is correct by construction. It takes about 10 lines of
bash — no bake, no hand-authoring.

### Step 1: seed a scratch database to the baseline version

Use `mj migrate` and `mj codegen`.

```bash
# fresh MJ_PG_Rebake + roles (cdp_UI/cdp_Developer/cdp_Integration NOLOGIN + GRANT USAGE ON SCHEMA public)
# apply committed .pg.sql with ts <= baseline ts (move any newer .pg.sql aside first so migrate stops at the baseline point):
DB_DATABASE=MJ_PG_Rebake PG_DATABASE=MJ_PG_Rebake npx mj migrate
# CRITICAL: transpile-only deltas leave CodeGen views MISSING (e.g. vwScopedPromptConfigs).
# Run codegen to fill them, else sync push at deploy dies with "relation … does not exist":
DB_DATABASE=MJ_PG_Rebake PG_DATABASE=MJ_PG_Rebake node scripts/pg-codegen-await.mjs --skipfiles
```

### Step 2: dump three sections

Exclude Skyway's tracking table from all three.

```bash
EX="--exclude-table=__mj.flyway_schema_history"
pg_dump -h postgres-claude -U mj_admin -d MJ_PG_Rebake --schema-only --schema=__mj --no-owner $EX --section=pre-data  > /tmp/pre.sql
pg_dump -h postgres-claude -U mj_admin -d MJ_PG_Rebake --data-only  --schema=__mj --no-owner $EX --inserts --rows-per-insert=500 > /tmp/data.sql
pg_dump -h postgres-claude -U mj_admin -d MJ_PG_Rebake --schema-only --schema=__mj --no-owner $EX --section=post-data > /tmp/post.sql
```

### Step 3: assemble header, pre-data, data, then post-data

Put the data between pre-data and post-data so it lands before the constraints. A
CHECK constraint is enforced on every INSERT that follows it. Historical rows that
pass SQL Server's case-insensitive collation fail on PG. Committed baselines add
constraints after the data and mark them `NOT VALID`, and pg_dump preserves that
order.

Strip pg_dump's `\restrict` and `\unrestrict` psql meta-commands, because Skyway
uses a raw SQL driver. Make `CREATE SCHEMA` idempotent.

```bash
strip(){ grep -v '^\\' "$1" | sed 's/CREATE SCHEMA __mj;/CREATE SCHEMA IF NOT EXISTS __mj;/'; }
{ printf 'CREATE EXTENSION IF NOT EXISTS "pgcrypto";\nCREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n\n';
  strip /tmp/pre.sql;
  echo; echo '-- ===== metadata seed (before constraints) ====='; echo;
  strip /tmp/data.sql | sed -n '/^INSERT INTO/,$p';
  echo; echo '-- ===== post-data (indexes / constraints / triggers) ====='; echo;
  strip /tmp/post.sql;
} > migrations-pg/v5/<B…>.pg.sql
```

Take the tables from the dump — the AST hand-body drops `__mj_CreatedAt` and
`__mj_UpdatedAt` on some entities such as SystemEvent. Take the data from the dump
too, because it holds complete structural metadata for all entities.

> You do not need a v5.x baseline to ship the next release on PG. The prior
> committed baseline and the delta chain already reach the target schema. The
> baseline is a convenience snapshot. Only build it when a new `B*.sql` is
> genuinely in scope.

---

## Phase 3 — deploy gate and verification

Start the SQL Server comparison database build now. It is independent, so it runs
during the gate.

```bash
docker exec -d claude-dev bash -lc '/opt/mssql-tools18/bin/sqlcmd -S sql-claude -U sa -P Claude2Sql99 -C -Q "IF DB_ID(''MJ_SQL_Compare'') IS NOT NULL BEGIN ALTER DATABASE MJ_SQL_Compare SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE MJ_SQL_Compare; END; CREATE DATABASE MJ_SQL_Compare;" && /opt/mssql-tools18/bin/sqlcmd -S sql-claude -U sa -P Claude2Sql99 -C -d MJ_SQL_Compare -I -Q "CREATE SCHEMA __mj;" && cd /workspace/MJ && DB_PLATFORM=sqlserver DB_HOST=sql-claude DB_PORT=1433 DB_DATABASE=MJ_SQL_Compare DB_USERNAME=sa DB_PASSWORD=Claude2Sql99 DB_ENCRYPT=false DB_TRUST_SERVER_CERTIFICATE=true CODEGEN_DB_USERNAME=sa CODEGEN_DB_PASSWORD=Claude2Sql99 MJ_CORE_SCHEMA=__mj npx mj migrate > /tmp/ss-compare.log 2>&1 && echo SS_DONE >> /tmp/ss-compare.log'
```

### The gate

Create a fresh PG database, `MJ_PG_Gate`, and bootstrap its roles. Apply the whole
set, then reseed. The browser phase reuses this database, so do not drop it.

```bash
# 1. mj migrate — applies the NEW baseline (Skyway auto-selects the highest B*) + deltas. Must be clean.
DB_DATABASE=MJ_PG_Gate PG_DATABASE=MJ_PG_Gate npx mj migrate --verbose
# 2. mj sync push — reseed metadata. MUST set DB_USERNAME/PASSWORD (else it falls back to SQL Server `sa`)
#    AND MJ_BOT_CONTEXT_USER_EMAIL=<an Owner user's email> (it runs as "User: System" and the Dashboard
#    server subclass blocks System from editing owner-owned dashboards). Find one:
#      psql … -tAc "SELECT \"Email\" FROM __mj.\"User\" WHERE \"IsActive\" AND \"Type\"='Owner' LIMIT 1"
DB_DATABASE=MJ_PG_Gate PG_DATABASE=MJ_PG_Gate MJ_BOT_CONTEXT_USER_EMAIL=<owner> npx mj sync push --dir metadata --ci
```

The gate passes when `mj migrate` applies with no errors. A residual sync-push
dashboard block is a known permission-model interaction, not a schema defect.
Note it and continue.

### Verification layers

Run each layer as soon as its inputs are ready. Run L1 immediately. Run L4 after
the gate. Run L2 and L3 after the SQL Server database finishes building.

#### L1 file parity

Run `node scripts/check-pg-migration-parity.mjs`. It needs no database, so run it
immediately.

#### L2 counts: SQL Server against PG

Compare the `__mj` table, view, routine, and foreign-key counts between
`MJ_SQL_Compare` and `MJ_PG_Gate`. Tables, views, and foreign keys must match
exactly. Routines will not match: PG adds trigger functions and `fn_*_GetRootID`
helpers, and SQL Server triggers are not routines. This difference is benign.
Reconcile the delta, do not chase it. A difference of one entity for `SystemEvent`
is a known first-run quirk.

#### L3 view equivalence

Run `scripts/ss-pg-view-equivalence.mjs` from the host. It uses `docker exec`,
which fails inside `claude-dev`. Skip it for a snapshot baseline, because those
views are pg_dump-native and trivially valid. `realDiffers` must be empty.

#### L4 CRUD oracle

Run from the host:

```bash
PG_CONTAINER=postgres-claude ORACLE_DB=MJ_PG_Gate PG_USER=mj_admin PG_PASSWORD=Claude2Pg99 node scripts/pg-crud-oracle.mjs
```

This proves the write path: the create, update, and delete sprocs. Expect about
zero real failures and a few documented skips. Wide-entity `(p_id,p_data)` shape
mismatches and whole-table-recompute-trigger value differences (APIScope FullPath)
are harness artifacts, not defects.

---

## Phase 4 — full-stack browser test

Use one agent. The servers are already built. Log in as the Owner user.

Do not build, start, or tear down the servers twice. The builds finished during
Phases 1 to 3. Wait for `APP_BUILD_DONE` in `/tmp/app-build.log`. Delegate one
agent. It starts MJAPI and MJExplorer against `MJ_PG_Gate` once and runs the API
smoke test, the browser smoke test, and the deep CRUD test in a single session.

Log in with a magic-link as the Owner user (`Type='Owner'`). Never use a guest. A
low-privilege user cannot edit entities, and that wasted a whole cycle. The
running server cannot see permission grants made after startup, because UserCache
is loaded at startup. Do not restart to fix permissions. Pick the Owner up front.
Magic-link works under any `AUTH_TYPE`. It activates on the `#token=` fragment and
needs no external identity provider.

To delegate, write a self-contained prompt to a file, copy it in with `docker cp`,
then run it and watch for `__DONE__` with the Monitor tool. Do not poll in
blocking sleep loops.

```bash
docker exec -d claude-dev bash -c 'cd /workspace/MJ && claude --dangerously-skip-permissions -p "$(cat /tmp/task.txt)" > /tmp/result.txt 2>&1 && echo __DONE__ >> /tmp/result.txt'
```

If the delegated agent gets stuck retrying a permission workaround, kill it. It
picked the wrong user.

The agent's prompt must tell it to report PASS or FAIL only, never SKIP. It must
specify these steps.

1. Start MJAPI with `GRAPHQL_PORT=4000`, the PG environment, and `PG_DATABASE=MJ_PG_Gate`. Start MJExplorer with `ng serve --port 4200 --host 0.0.0.0 --configuration=development`. Wait for both to be ready.
2. Run the API smoke test with curl. Introspection may be disabled in production, so prove the data plane instead. Call `RunDynamicView` for `EntityName` `MJ: Users`, `MJ: Entities`, or `MJ: AI Models` with a magic-link Bearer JWT. `GetAllEntities` needs the `x-mj-api-key` header. Entities use the `MJ:` prefix, for example `MJ: Actions`.
3. Mint a magic-link for the Owner. Set RAW to `mj_ml_<32 hex>` and HASH to `base64url(sha256(RAW))`. Insert a row into `__mj."MagicLinkInvite"`. Write RAW to `/tmp/ml_browser_token.txt`.
4. Run the login script at `/workspace/MJ/pg-login.mjs`. First confirm the shell is absent before auth. Redeem the link. Then assert that `mj-shell` is present, that the page is off the identity-provider domain, and that there is no password field. Base PASS on the shell assertion, never on matched page text. Take a screenshot if it fails.
5. Run the browser tests through in-app clicks, not cold-load deep links, because deep links do not mount the grid. Load the app, log in, then confirm data renders by asserting a seeded value. Open the entity grid and check `.ag-row > 0`. Open a record, edit a text field, and select Save, which succeeds as the Owner. Verify the Record Changes audit row, then revert. The Record Changes step proves the PG audit triggers. If the UI panel is unreachable, verify directly with `SELECT … FROM __mj."RecordChange" WHERE "RecordID" …`.
6. Write `/tmp/phase4-result.json` with a PASS or FAIL for every test, plus `overallPass` and `loginSucceeded` from the shell assertion. Clean up the servers when done. End with `PIPELINE_DONE`.

---

## Phase 5 — copy back and report

```bash
docker exec claude-dev bash -lc 'ls /workspace/MJ/migrations-pg/v5/*.needs-hand 2>/dev/null && echo GAPS_REMAIN || echo clean'   # must be clean
docker cp claude-dev:/workspace/MJ/migrations-pg/v5/<new .pg.sql files> ./migrations-pg/v5/
# converter source edits (if any dialect/converter fix) — copy those back too
git status --porcelain migrations-pg/ packages/SQLConverter/ packages/MJCLI/    # confirm NO existing .pg.sql modified
```

Report the files you converted, the gate result, the 4 verification layers, the
browser result, and the known-benign buckets. Do not commit. Leave the converted
files as uncommitted host changes for the user to review.

---

## Gotchas

Each of these cost real time. Heed them.

- Scope by the newest PG baseline timestamp. Pre-baseline `V*` and `CodeGen_Run` files are noise.
- A baseline is not a `--bake-codegen` job. Use the Path B snapshot recipe, because base-view dependency order cannot be baked per entity.
- Seed the snapshot source with `mj migrate` and `mj codegen`. Migrate alone leaves transpile-only deltas' views missing, such as `vwScopedPromptConfigs`.
- For `mj sync push`, set `DB_USERNAME`, `DB_PASSWORD`, and `MJ_BOT_CONTEXT_USER_EMAIL` to an Owner. Otherwise it connects as `sa`, runs as System, and dies on owner-owned dashboards.
- For pg_dump, exclude `__mj.flyway_schema_history`, strip `\restrict` and `\unrestrict`, and make `CREATE SCHEMA` idempotent. The data section goes between pre-data and post-data.
- For the browser test, use the Owner user, build the servers once and early and in parallel, and never restart to fix permissions. Kill a delegated agent that loops on a permission workaround.
- Run the L3 and L4 scripts from the host, because they use `docker exec`. L1 needs no database. L2 needs the SQL Server compare database, so build it in parallel.
- The real gate is a clean `mj migrate` on a fresh database. A "0 gaps" result from convert is structural only.
- Committed `.pg.sql` and `.pg-only.sql` files are immutable. Only ever produce PG counterparts for new SQL Server migrations. Never reconvert or hand-patch a committed one.
- For `mj codegen`, always use `scripts/pg-codegen-await.mjs`. The bare CLI can fire-and-forget and exit 0 as a silent no-op.

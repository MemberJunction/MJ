# Hybrid e2e — environment bring-up RUNBOOK (no guessing)

> **Purpose.** This is the EXACT, ordered recipe to stand up a SQL Server MJAPI and run a
> connector's hybrid `connector-e2e` (real MJ engine → real SQL Server: ApplyAll → sync →
> upsert → contentHash → incremental → delta-CRUD → idempotent). It was distilled the hard
> way (2026-06-05, PropFuel). **A future agent must follow these steps verbatim and NEVER
> re-derive them.** Each step lists the failure you get if you skip it, so the recipe is
> self-explaining. The ONLY assumption is: **the Docker daemon is up.** Nothing else may be
> assumed running.
>
> **Dialect: SQL Server (SS-primary).** The connectors-registry is SS-primary and the SS env
> bring-up is proven working (PropFuel ran the connector-e2e live on SQL Server). **Postgres is
> SUSPENDED** for the per-connector loop: fresh-DB PG codegen is broken (the v5.34/v5.37
> PG-baseline issue), which fails the §1→§7 bring-up for a framework reason on EVERY connector,
> not a connector reason. Re-enable PG only once the PG-baseline fix lands.

## Golden rules (the things that cost hours to discover)
1. **NEVER launch MJAPI with `npm run start` or the `ts-node` register.** `ts-node@10.9.2` is
   **broken on Node 24** — you get an opaque `[Object: null prototype] {}` crash at module
   load with no message. **Always launch via `tsx`** (`node_modules/.bin/tsx`, the modern
   loader). It gives real errors and works on Node 24.
2. **The repo may be 90% unbuilt.** A long-running host MJAPI keeps its old build in memory;
   a *fresh* launch needs `dist/`. If you see `ERR_MODULE_NOT_FOUND` for `@memberjunction/*`
   or `mj_generatedentities`, run a full **`npx turbo build`** first (≈40s warm, minutes cold).
3. **The MJAPI class-registration manifest must exist** at
   `packages/MJAPI/src/generated/class-registrations-manifest.ts`. The `prestart` that makes
   it calls `mj codegen manifest`, but a **globally-installed `mj` may be a STALE version**
   (e.g. 5.36.0) that lacks the subcommand. **Always generate it with the LOCAL CLI:**
   `node packages/MJCLI/bin/run.js codegen manifest …` (see step 2). If missing →
   `ERR_MODULE_NOT_FOUND: class-registrations-manifest.js`.
4. **Set the generic `DB_*` keys + `DB_PLATFORM=sqlserver`.** Config validation requires
   `DB_DATABASE`/`DB_USERNAME`/`DB_PASSWORD` — missing any → `Configuration validation failed`
   (Zod "Required").
5. **`MJ_BASE_ENCRYPTION_KEY` can be GENERATED** for a fresh test instance — it only needs to
   be *a* valid 32-byte base64 key; it decrypts nothing pre-existing because the mock e2e
   creates its own connection. Do NOT scrape a real key from another process.
6. **advancedGeneration defaults ON** → in-process CodeGen at MJAPI startup calls a
   credential-less AI model and sinks CodeGen in a keyless env. **Set
   `advancedGeneration.enableAdvancedGeneration: false` in `mj.config.cjs`** before launch.
7. **MJAPI must be launched WITH `MJ_API_KEY` in its env.** MJAPI validates the GraphQL
   `x-mj-api-key` header against `process.env.MJ_API_KEY` (config.ts:339). The connector-e2e
   and the broker job must use the **exact same** key value MJAPI was started with.

## Coordinates (workbench defaults — public, in docker-compose.yml; NOT secrets)
| Thing | Value |
|---|---|
| SQL Server host:port | `localhost:1444` (container `sql-claude`, 1433→1444) |
| SQL Server db / user / pass | `MJ_SS_E2E` / `sa` / `Claude2Sql99` |
| MJ schema | `__mj` |
| MJAPI port (fresh, won't collide with host `:4000`) | `4007` |
| Test `MJ_API_KEY` | any value you choose (it's YOUR fresh MJAPI); a known workbench dummy is `sk-proj-2-3-4-5-6-7-8-9-10-11-12-13-14-16-17-18-19-20-21-22-23-24-25-26-27-28-29` |

## Step 0 — BASELINE A FRESH SS DB (never reuse a leftover) — THE critical step
> **Hard-won lesson (2026-06-05):** do NOT point the e2e at a pre-existing DB. Leftover/degraded
> DBs accumulate **malformed entities** (entities with 0 EntityField metadata / no PK). The
> in-process RSU CodeGen runs a Post-CodeGen CRUD validation across ALL entities and **fails
> fatally** ("In-process CodeGen failed" → ApplyAll fails) if ANY entity is malformed — even
> ones unrelated to the connector. A **freshly-baselined** DB is clean **by construction**, so
> RSU/ApplyAll just works. This is the reproducible, no-source, no-hack fix. ALWAYS baseline fresh.
```bash
docker info >/dev/null 2>&1 || { echo "Docker daemon DOWN — cannot proceed"; exit 1; }
docker ps --format '{{.Names}}' | grep -q '^sql-claude$' \
  || (cd docker/workbench && docker compose up -d sql-claude)

SQLCMD() { docker exec sql-claude /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'Claude2Sql99' -C "$@"; }

# 0a. Create a FRESH empty DB (drop any prior run's DB):
SQLCMD -Q "IF DB_ID('MJ_SS_E2E') IS NOT NULL BEGIN ALTER DATABASE MJ_SS_E2E SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE MJ_SS_E2E; END;"
SQLCMD -Q "CREATE DATABASE MJ_SS_E2E;"

# 0b. Baseline it (SQL Server migrations, authored dialect): ~8s, current version.
DB_PLATFORM=sqlserver DB_HOST=localhost DB_PORT=1444 DB_DATABASE=MJ_SS_E2E DB_USERNAME=sa DB_PASSWORD=Claude2Sql99 \
  DB_TRUST_SERVER_CERTIFICATE=true MJ_CORE_SCHEMA=__mj CODEGEN_DB_USERNAME=sa CODEGEN_DB_PASSWORD=Claude2Sql99 \
  node packages/MJCLI/bin/run.js migrate --dir ./migrations/v5

# 0c. VERIFY IT'S CLEAN — this MUST be 0. If not, the baseline is degraded; do not proceed.
SQLCMD -d MJ_SS_E2E -h -1 -Q "SET NOCOUNT ON; SELECT count(*) FROM __mj.Entity e WHERE NOT EXISTS(SELECT 1 FROM __mj.EntityField f WHERE f.EntityID=e.ID);"
# (a clean fresh baseline → 0 malformed; a degraded reused DB → >0)

# 0d. VERIFY the schema POPULATED (migrate applies baseline rank-1 + incrementals → ~374 __mj
# tables / ~372 entities). A correctly-migrated fresh DB looks like: tables ~374, entities ~372.
SQLCMD -d MJ_SS_E2E -h -1 -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM __mj.Entity;"   # MUST be ~370+
# 🚨 QUERY-CONTEXT GOTCHA (a real false-negative that aborted a working run): NEVER verify with
# `SELECT COUNT(*) FROM sys.tables WHERE schema_id=SCHEMA_ID('__mj')` UNLESS the connection's
# current DB is MJ_SS_E2E. SCHEMA_ID('__mj') resolves in the CONNECTION's default DB (master →
# NULL → a false 0), even if you three-part-prefix `MJ_SS_E2E.sys.tables`. ALWAYS pass
# `-d MJ_SS_E2E` (as above) or use fully-qualified `MJ_SS_E2E.__mj.<Table>` names. `mj migrate`
# printing "N applied" + exit 0 is authoritative; a `SCHEMA_ID` "0" without -d is the bug, not migrate.
```
**Use `MJ_SS_E2E` (the fresh DB) for EVERY subsequent step** — set `DB_DATABASE` and
`HS_LIVE_DB_NAME` to it, not a reused workbench DB.

### Step 0c — seed the connector metadata with a REAL `mj sync push` (MANDATORY — never hand-SQL it)

A freshly-baselined DB does **NOT** contain a newly-built connector's metadata (the baseline's
Metadata-Sync migration only carries connectors that shipped in that baseline). You MUST push it.

> 🚫 **DO NOT manually `INSERT` the Integration / IntegrationObject / IntegrationObjectField rows via
> SQL.** A hand-SQL insert silently drops `Configuration.BackingSObject` and the nested 600+ IOFs, so
> discovery falls back to friendly names → `no fixture for /sobjects/<FriendlyName>/describe` → **0
> fields → 0 tables → 0 rows**. There is NO "tooling constraint" that justifies the bypass — the push
> below works. A run that substitutes manual SQL is a SHORTCUT and its result is void.

`mj sync push` needs the entity-dir nesting, so push from a scoped temp dir mirroring it (this avoids
dragging in every other vendor's metadata):

```bash
VENDOR=<vendor>            # e.g. fonteva
rm -rf /tmp/${VENDOR}-push && mkdir -p /tmp/${VENDOR}-push/integrations/${VENDOR}
printf '{ "version": "1.0", "directoryOrder": ["integrations"] }\n' > /tmp/${VENDOR}-push/.mj-sync.json
cp metadata/integrations/.mj-sync.json                         /tmp/${VENDOR}-push/integrations/.mj-sync.json
cp metadata/integrations/${VENDOR}/.${VENDOR}.integration.json /tmp/${VENDOR}-push/integrations/${VENDOR}/

# If a PRIOR build of this connector is already in the DB, delete its full graph first (FK order),
# else the push collides on UQ_Integration_Name:
SQLCMD -d MJ_SS_E2E -Q "SET NOCOUNT ON; DECLARE @iid UNIQUEIDENTIFIER=(SELECT ID FROM __mj.Integration WHERE Name='<IntegrationName>');
  DELETE crd FROM __mj.CompanyIntegrationRunDetail crd JOIN __mj.CompanyIntegrationRun r ON crd.CompanyIntegrationRunID=r.ID JOIN __mj.CompanyIntegration ci ON r.CompanyIntegrationID=ci.ID WHERE ci.IntegrationID=@iid;
  DELETE r FROM __mj.CompanyIntegrationRun r JOIN __mj.CompanyIntegration ci ON r.CompanyIntegrationID=ci.ID WHERE ci.IntegrationID=@iid;
  DELETE FROM __mj.CompanyIntegration WHERE IntegrationID=@iid;
  DELETE iof FROM __mj.IntegrationObjectField iof JOIN __mj.IntegrationObject io ON iof.IntegrationObjectID=io.ID WHERE io.IntegrationID=@iid;
  DELETE FROM __mj.IntegrationObject WHERE IntegrationID=@iid; DELETE FROM __mj.Integration WHERE ID=@iid;"

DB_PLATFORM=sqlserver DB_HOST=localhost DB_PORT=1444 DB_DATABASE=MJ_SS_E2E DB_USERNAME=sa \
DB_PASSWORD=Claude2Sql99 DB_TRUST_SERVER_CERTIFICATE=1 \
  mj sync push --dir /tmp/${VENDOR}-push --no-validate     # expect: "✅ Push completed successfully"
```

**Verify the push actually landed the fields** (the anti-shortcut gate — IOF count MUST be > 0):
```bash
SQLCMD -d MJ_SS_E2E -h -1 -W -Q "SET NOCOUNT ON;
  SELECT 'IOF', COUNT(*) FROM __mj.IntegrationObjectField iof JOIN __mj.IntegrationObject io ON iof.IntegrationObjectID=io.ID JOIN __mj.Integration i ON io.IntegrationID=i.ID AND i.Name='<IntegrationName>';
  SELECT 'IO_with_BackingSObject', COUNT(*) FROM __mj.IntegrationObject io JOIN __mj.Integration i ON io.IntegrationID=i.ID AND i.Name='<IntegrationName>' WHERE io.Configuration LIKE '%BackingSObject%';"
```
A `0` for either is a FAILED push — fix it (do NOT proceed, and do NOT hand-SQL a substitute).

## Step 1 — build (only if a fresh MJAPI launch errors on a missing module)
```bash
npx turbo build            # warm ≈40s; gets @memberjunction/* + mj_generatedentities dist/
```

## Step 2 — generate the MJAPI manifest with the LOCAL CLI (never the global `mj`)
```bash
node packages/MJCLI/bin/run.js codegen manifest \
  --exclude-packages @memberjunction \
  --appDir ./packages/MJAPI \
  --output ./packages/MJAPI/src/generated/class-registrations-manifest.ts
```

## Step 3 — advancedGen OFF (one-time edit; idempotent)
Ensure `mj.config.cjs` has `advancedGeneration: { enableAdvancedGeneration: false, batchSize: 15 }`.

## Step 4 — launch the SQL Server MJAPI on :4007 via tsx (NOT ts-node, NOT npm start)
```bash
cd packages/MJAPI
lsof -nP -iTCP:4007 -sTCP:LISTEN -t | xargs -r kill 2>/dev/null   # free the port
GENKEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
TEST_KEY=sk-proj-2-3-4-5-6-7-8-9-10-11-12-13-14-16-17-18-19-20-21-22-23-24-25-26-27-28-29
DB_PLATFORM=sqlserver \
DB_HOST=localhost DB_PORT=1444 DB_DATABASE=MJ_SS_E2E DB_USERNAME=sa DB_PASSWORD=Claude2Sql99 \
CODEGEN_DB_USERNAME=sa CODEGEN_DB_PASSWORD=Claude2Sql99 \
DB_TRUST_SERVER_CERTIFICATE=true DB_ENCRYPT=false MJ_CODEGEN_NO_AFTER=1 ALLOW_RUNTIME_SCHEMA_UPDATE=1 \
GRAPHQL_PORT=4007 MJ_API_KEY="$TEST_KEY" MJ_BASE_ENCRYPTION_KEY="$GENKEY" NODE_ENV=development \
nohup ../../node_modules/.bin/tsx src/index.ts > /tmp/ss-mjapi-4007.log 2>&1 &
# 🚨 ALLOW_RUNTIME_SCHEMA_UPDATE=1 IS MANDATORY. ApplyAll's Runtime Schema Update (which creates the
# connector's entity tables + triggers the in-process RSU CodeGen) is GATED on this flag — without it
# ApplyAll fails immediately with "Runtime Schema Update is disabled. Set ALLOW_RUNTIME_SCHEMA_UPDATE=1
# to enable." and the sync never starts (verified 2026-07-09 on the HLV build).
# 🚨 CODEGEN_DB_USERNAME/CODEGEN_DB_PASSWORD ARE MANDATORY. The in-process RSU CodeGen spawns a CHILD
# process (.rsu_codegen_*.mjs) that reads its DB login from mj.config.cjs `codeGenLogin`/`codeGenPassword`
# = process.env.CODEGEN_DB_USERNAME/CODEGEN_DB_PASSWORD — NOT DB_USERNAME/DB_PASSWORD. Without them the
# child dies "ConnectionError: Login failed for user ''." AFTER creating the entity TABLES but BEFORE it
# generates the views/sprocs → ApplyAll fails "CodeGen failed" → 0 rows. Set them to the same sa creds as
# DB_USERNAME/DB_PASSWORD (verified 2026-07-09 on the HLV build).
# 🚨 MJ_CODEGEN_NO_AFTER=1 IS MANDATORY at MJAPI launch. mj.config.cjs reads it to return `commands: []`
# so the in-process RSU CodeGen (which ApplyAll triggers when it registers the connector's new entities)
# SKIPS its post-generation AFTER commands — the `npm run build`×N + `npm start` that would otherwise run.
# Those AFTER commands are REDUNDANT during the e2e (MJAPI is already up; the entity views/sprocs are
# applied by the codegen's OWN SQL-execution step, which runs BEFORE the AFTER commands) and they FAIL FAST
# (each `npm` exits in ~0.08s → "Process exited with code 254") in the tsx-launched MJAPI's child-process
# env → the RSU reports `RunCodeGen:failed` EVEN THOUGH `ExecuteMigration:success` (the SQL WAS applied) →
# ApplyAll is falsely reported failed → the sync aborts with entityMapCount:0 / 0 rows. Setting =1 makes the
# RSU codegen stop after SQL execution → RunCodeGen:success → ApplyAll succeeds → the sync lands rows.
# (Verified 2026-07-09 on the HLV build: without it the tables ARE created but ApplyAll false-fails on the
# npm AFTER-command; with it the RSU completes cleanly.)
# 🚨 DB_TRUST_SERVER_CERTIFICATE MUST be `true` (or `1`), NEVER `Y`. mj.config.cjs parses this as
# `=== '1' || === 'true'` — so `Y` silently becomes trustServerCertificate=FALSE. MJAPI's own pooled
# connection tolerates that (DB_ENCRYPT=false skips TLS for it), but the IN-PROCESS RSU CodeGen that
# ApplyAll triggers uses its OWN CodeGenLib connection which STILL rejects the self-signed cert with
# trust=false — it then GENERATES the new connector entities' view/sproc SQL to disk but FAILS TO APPLY
# it to the DB (a swallowed "self-signed certificate" connection error). The sync then dies with
# "Cannot find object 'vwXxx'/'spCreateXxx'" and lands 0 rows (applyAllRan:false). With `=true` the RSU
# CodeGen connects + applies the entity SQL. DB_ENCRYPT=false alone does NOT fix codegen — trust=true is
# required (verified 2026-07-09 on the HLV build: `mj codegen` failed on the cert with `Y`, succeeded
# with `true`, creating vwRanks/spCreateAddon/vwDiscussions).
```
MJAPI validates the GraphQL `x-mj-api-key` header against `MJ_API_KEY` — it MUST be in this
launch env (golden rule 7). Wait for health (boot runs in-process CodeGen — allow ~30–60s). A
non-fatal `EADDRINUSE` for a *secondary* instance-B/WS port is fine; the main GraphQL still binds:
```bash
until curl -s --max-time 5 http://localhost:4007/ -H 'Content-Type: application/json' \
  -H "x-mj-api-key: $TEST_KEY" -d '{"query":"{ __typename }"}' | grep -q '"__typename"'; do sleep 3; done
echo "SS MJAPI healthy on :4007"
```

## Step 5 — resolve coordinates from the SS DB (+ create a Company if none)
```bash
SQL1() { docker exec sql-claude /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'Claude2Sql99' -C -h -1 -W -Q "SET NOCOUNT ON; $1"; }
INTEGRATION=$(SQL1 "SELECT TOP 1 CONVERT(varchar(36),ID) FROM __mj.Integration WHERE Name='<IntegrationName>';")
# CREDTYPE = the connector's OWN declared credential type — read it from the Integration row's
# CredentialTypeID (which Step 0c's `mj sync push` resolved from the metadata's @lookup). NEVER
# hardcode a `LIKE '%API Key%'` lookup: a Salesforce-OAuth connector (Fonteva/Nimble AMS) uses
# `Salesforce JWT Bearer`, and grabbing the wrong type led to a dash-less-GUID
# `Conversion failed ... to uniqueidentifier` crash at CreateConnection.
CREDTYPE=$(SQL1 "SELECT CONVERT(varchar(36),CredentialTypeID) FROM __mj.Integration WHERE Name='<IntegrationName>';")
COMPANY=$(SQL1 "SELECT TOP 1 CONVERT(varchar(36),ID) FROM __mj.Company;")
if [ -z "$COMPANY" ]; then
  SQL1 "INSERT INTO __mj.Company (ID,Name,Description) VALUES (NEWID(),'MJ E2E Test Co','hybrid e2e');"
  COMPANY=$(SQL1 "SELECT TOP 1 CONVERT(varchar(36),ID) FROM __mj.Company;")
fi
```

## Step 6 — run the connector-e2e (MOCK mode = credential-free) on SQL Server
Requires correct **file-feed/HTTP fixtures** at
`packages/Integration/connectors/test/fixtures/<connector>/fixtures/fixtures.json`
(see CONNECTOR_E2E.md; config-driven base-URL connectors use ORIGIN mode:
`"Transport":"http"`, `"ConfigUrlKey":"<the config key the connector reads, e.g. BaseURL>"`,
`Routes` mirroring the connector's real endpoints, `Objects`, `DeltaPasses`). **Do NOT reuse a
stale fixtures file from a prior (different-shape) scaffold — author one for the SHIPPED connector.**
```bash
DB_PASSWORD=Claude2Sql99 MJ_API_KEY=$TEST_KEY \
E2E_CONNECTOR=<connector> E2E_INTEGRATION=<IntegrationName> E2E_MODE=mock E2E_PLATFORM=sqlserver \
HS_LIVE_GRAPHQL_URL=http://localhost:4007/ HS_LIVE_PLATFORM=sqlserver HS_LIVE_MJ_SCHEMA=__mj \
HS_LIVE_DB_HOST=localhost HS_LIVE_DB_PORT=1444 HS_LIVE_DB_NAME=MJ_SS_E2E HS_LIVE_DB_USER=sa \
HS_LIVE_COMPANY_ID=$COMPANY HS_LIVE_CREDTYPE_ID=$CREDTYPE \
node packages/Integration/connectors/test/run-plan.mjs connector-e2e
```
The scrubbed JSON result carries `steps.{setup,forward,delta,idempotent,teardown}`. **Assert
OUTCOMES, not "ran":** `forward.completeness` (rowcounts match), `forward.incremental.narrowed`,
`delta.*` (create/update/delete), `idempotent.*` (2nd sync = 0 row delta).

## Step 6-live — broker-credentialed live mode (when proving live vendor reads)
Set `E2E_MODE=live` and run via the **credential broker** (separate-user mailbox) so the vendor
token never enters agent context: submit `{task:'connector-e2e-live'}` (writes:false) to
`$MJ_CRED_MAILBOX/jobs`, poll the scrubbed result. Same DB assertions; the vendor side is
read-only (never ack/write). The broker's launching env must carry THREE secrets —
`CONNECTOR_API_KEY` (vendor token), `DB_PASSWORD` (the SS `sa` password), and `MJ_API_KEY`
(**the exact value MJAPI was started with**) — and the job env sets `HS_LIVE_PLATFORM=sqlserver`
plus `HS_LIVE_OBJECTS=<the connector's real stream names>`. See
`.claude/rules/connector-test-conventions.md` § "SQL Server live-run setup" +
`launch-broker.sh` for the full secret-passing recipe.

## Step 7 — teardown
```bash
lsof -nP -iTCP:4007 -sTCP:LISTEN -t | xargs -r kill 2>/dev/null    # stop the SS MJAPI
# leave sql-claude up (cheap) OR: (cd docker/workbench && docker compose down)
```

## Failure → fix quick-reference
| Symptom | Cause | Fix |
|---|---|---|
| `[Object: null prototype] {}` at run_main | ts-node@10.9.2 on Node 24 | launch via `tsx` (step 4) |
| `ERR_MODULE_NOT_FOUND @memberjunction/* or mj_generatedentities` | repo unbuilt | `npx turbo build` (step 1) |
| `ERR_MODULE_NOT_FOUND class-registrations-manifest.js` | manifest not generated (stale global `mj`) | local CLI (step 2) |
| `Configuration validation failed` (dbDatabase/dbUsername/dbPassword Required) | `DB_*` unset | set `DB_*` + `DB_PLATFORM=sqlserver` (step 4) |
| GraphQL `x-mj-api-key` rejected / 401 | MJAPI launched without `MJ_API_KEY` | launch WITH `MJ_API_KEY` in env (step 4, golden rule 7) |
| `Invalid Vertex AI credentials` flood during CodeGen | advancedGen ON in keyless env | `enableAdvancedGeneration:false` (step 3) |
| `EADDRINUSE :::4007` but GraphQL still answers | secondary instance-B/WS bind | ignore; main GraphQL is up |
| connector-e2e mock 404s on the connector's real paths | stale/wrong fixtures | author file-feed/HTTP fixtures for the SHIPPED connector (step 6) |

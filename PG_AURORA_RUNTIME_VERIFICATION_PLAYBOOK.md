# PostgreSQL / Aurora RDS Runtime Verification Playbook

This branch (`test/pg-aurora-runtime-verification`) integrates all five PG-correctness
fix branches on top of latest `next` and exists **only** to stand up a real PostgreSQL
(Aurora RDS) environment and prove each fix — plus the capabilities claimed to already
work — at runtime. It is **not** intended to merge; each fix merges via its own PR after
runtime sign-off.

## Fixes under test (one branch each, all merged here)

| # | Branch | Concern |
|---|--------|---------|
| 1 | `fix/pg-runtime-tsql-date-functions` | T-SQL date funcs (`GETUTCDATE`/`GETDATE`/`DATEADD`) in runtime `ExtraFilter` → translated for PG + 4 call sites de-T-SQL'd |
| 2 | `fix/pg-core-codegen-type-correctness` | `uuid` PK recognition (entityInfo/baseEntity), geocoding view `NVARCHAR`→dialect cast, action `Libraries` null-guard |
| 3 | `fix/openapp-pg-schema-install` | `mj app install` schema create/drop + migrations on PG |
| 4 | `fix/dbautodoc-pg-writeback` | DBAutoDoc `COMMENT ON` write-back + `init` provider prompt |
| 5 | `fix/scheduling-pg-heartbeat-lease` | Heartbeat lease extend dialect routing + PG `GET DIAGNOSTICS` forward-fix |

## What is already proven (credential-free, in-repo)

Unit tests pass on this branch for every fix (run `npm test` per package or the
filtered set below). What remains is **runtime** proof against a live PG/Aurora DB.

```bash
# Re-run all the fix unit suites at once
npx turbo run test --filter=@memberjunction/postgresql-dataprovider \
  --filter=@memberjunction/core --filter=@memberjunction/open-app-engine \
  --filter=@memberjunction/db-auto-doc --filter=@memberjunction/scheduling-engine
```

Expected: PG provider 140, MJCore entityInfo suite (incl. IsUniqueIdentifier uuid),
OpenApp 149, DBAutoDoc SQLGenerator 17, scheduling heartbeat 11 — all green.

---

## 0. Prerequisites

- A PostgreSQL 15+ instance. For Aurora: an Aurora PostgreSQL cluster reachable from
  the test host; capture host/port/db/user/password. For local: `docker run` Postgres.
- Node 20+, the repo built once (`npm install` already done in this clone).
- AI key for advancedGeneration / agent tests — **the operator supplies this via env
  var**; do not read or commit it. (`AI_VENDOR_API_KEY__<vendor>` or per `mj.config.cjs`.)
- HubSpot test credentials for the RSU test (operator-supplied, broker-held).

### 0a. Local Postgres (fast path)

```bash
docker run -d --name mj-pg-verify \
  -e POSTGRES_PASSWORD=mjpgpass -e POSTGRES_DB=MJ_PG_E2E \
  -p 5444:5432 postgres:16
```

### 0b. Aurora RDS

Use the cluster writer endpoint as host, port 5432, an empty database `MJ_PG_E2E`
(create it first), and a user with DDL rights. SSL is typically required — set
`DB_SSL=true` / the provider SSL options. Note managed PG does **not** grant
`pg_catalog` writes (the baseline already accounts for this — native TRUE/FALSE inserts).

---

## 1. Configure MJ for PostgreSQL

Edit `mj.config.cjs` (or env) to point at the PG database and select the PG dialect.
Key settings:

```js
module.exports = {
  dbHost: process.env.DB_HOST,          // local: localhost  | aurora: <writer-endpoint>
  dbPort: Number(process.env.DB_PORT),  // 5444 local        | 5432 aurora
  dbDatabase: 'MJ_PG_E2E',
  dbUsername: process.env.DB_USER,
  dbPassword: process.env.DB_PASSWORD,  // operator-supplied; never commit
  dbDatabaseType: 'postgresql',         // <-- selects the PG dialect/provider
  dbTrustServerCertificate: true,       // local; for Aurora use proper SSL
  // advancedGeneration OFF for the first pass so a missing AI key can't sink CodeGen:
  advancedGeneration: { enableAdvancedGeneration: false, batchSize: 15 },
  // ... codegen/output settings as usual
};
```

> Switching dialect behind the same endpoint? Clear the browser cache / use incognito
> (the GraphQL client caches metadata; SS upper-cases UUIDs, PG lower-cases them).

---

## 2. Bring up the schema (migrate → sync push → codegen)

Run **in this exact order** against the empty PG database. `mj` is the MJCLI
(`npx mj ...` from repo root, or the built CLI).

```bash
# (a) Migrate — applies migrations-pg/v5 (incl. the PR5 forward-fix V202606161200)
npx mj migrate

# (b) Push metadata
npx mj sync push --dir=metadata

# (c) CodeGen — NEVER skip; this proves PR2's geocoding view + uuid handling on PG.
#     advancedGeneration is OFF (step 1), so a keyless run won't fail here.
npx mj codegen
```

**Pass criteria for this section (already exercises PR2 + the PG codegen path):**
- `mj migrate` applies cleanly through the new `V202606161200` forward-fix with no errors.
- `mj codegen` completes with **entities registered > 0** (a fresh PG that "registers 0
  entities" is the old baseline defect, not these fixes — confirm you're on a current
  PG baseline).
- No `type "nvarchar" does not exist` / `operator does not exist` errors during view
  generation. **To actively exercise PR5's geocoding fix**, enable `SupportsGeoCoding=1`
  on one entity (metadata) before codegen and confirm `vwXxx` builds with `VARCHAR`/`||`
  (not `NVARCHAR`/`+`). Inspect the generated PG view SQL.

---

## 3. Build + start API and Explorer

```bash
# Build everything (or at least the API + its deps)
npx turbo build --filter=mj_api --filter=@memberjunction/ng-explorer

# Start API (note GraphQL port) and Explorer as background processes
cd packages/MJAPI && npm run start          # serves GraphQL (default :4000, or GRAPHQL_PORT)
cd packages/MJExplorer && npm run start      # serves UI (:4200/:4201)
```

Wait for `listening on` (API) and a successful Vite compile (Explorer). Health-check the
API with a GraphQL ping or `curl` to the GraphQL endpoint (a 200/401 means it's up).

---

## 4. Per-concern runtime verification

Each row is an independent runtime check. UI checks use Playwright CLI
(`npx playwright-cli ... --profile .playwright-cli/profile http://localhost:<port>`).
Record pass/fail + evidence (no errors in API log, expected rows, screenshots).

### 4.1 PR1 — runtime ExtraFilter date functions (P0)
- **Access Control (the core one):** exercise a record-level permission path that calls
  `AccessControlRuleProvider.GetUserResources` / `GetPermissionsSharedWithUser`
  (e.g. open a shared resource / "Shared with me"). **Before fix:** PG errors
  `function getutcdate() does not exist`. **Pass:** query returns, no PG function error
  in the API log.
- **MCP dashboard:** open the MCP dashboard's execution-log tab (loads the "last 7 days"
  filter). **Pass:** loads, no `DATEADD`/`getutcdate` error.
- **Entity-communication preview:** open a template preview surface. **Pass:** active
  templates load, no `getdate()` error.
- **Archiving:** trigger an archive run for a config with `RetentionDays` set. **Pass:**
  eligible records load, no `DATEADD` error.
- **Framework backstop:** additionally run a `RunView` with a raw
  `ExtraFilter: "<dateCol> > GETUTCDATE()"` against PG and confirm it now succeeds
  (translated), proving the provider-level translation independent of the call sites.

### 4.2 PR2 — uuid PK + geocoding view + Libraries guard
- **uuid PK / AI Agent Run (the claimed-working capability):** with the operator's AI key
  set and `advancedGeneration` left OFF for now, create + run an AI Agent
  (Explorer chat or `mj ai`-style invocation). **Pass:** an `MJ: AI Agent Runs` row is
  created with a valid UUID PK and the run completes — proving client-side UUID generation
  on PG. Repeat creating any record via Explorer to confirm inserts work broadly.
- **Geocoding view:** covered in §2 (enable `SupportsGeoCoding`, codegen builds the view).
- **Action Libraries guard:** run `mj codegen` for an environment that includes a
  Generated action with **no** libraries. **Pass:** action subclass generation does not
  throw.

### 4.3 PR3 — OpenApp install on PG
- Run `mj app install <a-test-open-app>` against the PG environment (an app that has a
  `schema` + `migrations` block). **Pass:**
  - schema existence check runs via `information_schema.schemata` (no `sys.schemas` error),
  - `CREATE SCHEMA "<name>"` succeeds,
  - app migrations run via the **PostgreSQL** Skyway provider,
  - `mj app remove` drops the schema via `DROP SCHEMA "<name>" CASCADE`.

### 4.4 PR4 — DBAutoDoc against PG/Aurora
- `db-auto-doc init` → choose **postgresql**; confirm config has `provider: postgresql`,
  `port: 5432`, and no encrypt/trust prompts.
- `db-auto-doc analyze` against the PG DB (read path) → completes.
- `db-auto-doc export --sql --apply` → **Pass:** generated `extended-props.sql` contains
  `COMMENT ON SCHEMA/TABLE/COLUMN ... IS '...'` (no `sp_addextendedproperty`/`GO`), and
  `--apply` runs against PG without error. Verify a comment landed (`\d+`/`obj_description`).

### 4.5 PR5 — scheduled jobs + heartbeat (claimed-working capability)
- **Scheduling core (claimed working):** create a scheduled job and let the engine
  acquire → run → release → update stats. **Pass:** job runs on PG; the stats sproc
  resolves (no `function ... is not unique`), confirming the v5.41 PG fixes.
- **Heartbeat (PR5):** exercise a long-running job that calls `context.heartbeat()` (or
  invoke `spExtendScheduledJobLease` directly via a job that opts in). **Pass:** the lease
  extends — the function returns `Extended = 1` (not NULL) and the call uses the PG
  `SELECT * FROM __mj."spExtendScheduledJobLease"($1,$2,$3)` form (no `EXEC` error).

### 4.6 advancedGeneration (claimed-working capability)
- After the keyless pass is green, set `advancedGeneration.enableAdvancedGeneration = true`,
  supply the AI key (operator), **restart MJAPI**, and re-run `mj codegen`. **Pass:**
  advanced (AI-enriched) generation completes on PG with no dialect errors. (advancedGen
  is dialect-independent enrichment; this confirms it co-exists with the PG path.)

### 4.7 RSU with HubSpot data (claimed-working capability)
- With operator/broker-held HubSpot credentials, run the Integration RSU flow
  (`IntegrationApplyAllBatch` → sync) for HubSpot against the PG database. **Pass:**
  tables are created/registered, records sync, UUID PKs populate, incremental watermark
  advances — no PG dialect errors in the run artifact. Use the existing connector e2e
  harness (`packages/Integration/connectors/test/`) pointed at the PG env.

---

## 5. Sign-off → open the PRs

When every §4 check passes (capture NL result + evidence per check), each fix branch is
cleared to open as its **own** PR against `next`:

- `fix/pg-runtime-tsql-date-functions`
- `fix/pg-core-codegen-type-correctness`
- `fix/openapp-pg-schema-install`
- `fix/dbautodoc-pg-writeback`
- `fix/scheduling-pg-heartbeat-lease`

Open them only after explicit go-ahead (one approval per PR). This integration branch is
discarded — do not merge it.

## Appendix — quick dialect sanity checks (psql)

```sql
-- Default Environment row seeded (chat/agent depend on it)
SELECT "ID","Name","IsDefault" FROM __mj."Environment" WHERE "ID"='F51358F3-9447-4176-B313-BF8025FD8D09';
-- CodeGen sprocs present (fresh-PG baseline health)
SELECT proname FROM pg_proc WHERE pronamespace='__mj'::regnamespace AND proname LIKE 'spCreate%' LIMIT 5;
-- Heartbeat fn returns INTEGER (PR5 forward-fix applied)
\df __mj."spExtendScheduledJobLease"
```

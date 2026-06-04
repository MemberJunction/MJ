# Postgres Dual-Dialect Runbook — standing up PG + running the §7 connector E2E

> The `testing-agent` runs the canonical §1→§7 live E2E (`connector-test-conventions.md` +
> `floor/phase0-slots.json` `e2eLivePhases`) on **two** dialects. SQL Server is the default;
> **§7 re-runs the entire applicable suite on Postgres** and `floor-check` rejects the run if any
> `dualDialect:true` phase is proven on only one dialect (`e2e-dual-dialect-missing`). This is the
> exact, no-discovery-required path to get Postgres up and prove the Postgres half. Everything the
> migration needs is converted automatically — you do **not** author PG SQL by hand.

## 0. The one thing that makes PG "free": automatic conversion

MJ stores migrations in **SQL Server dialect** under `migrations/v5/`. `mj migrate` **converts them to
Postgres at run time** when `dbPlatform:'postgresql'`. `mj codegen` is PG-aware the same way. So the
Postgres run is the *same commands* as SQL Server with the platform flag flipped — no separate PG
migration set, no hand-edited DDL. **Never edit the SQLConverter or a converted PG statement**; if the
converter chokes on an unrelated core migration, capture it and report it — it's a converter edge case,
not a connector regression.

## 1. Stand up Postgres (pick one — both end at the same connection)

**A. Workbench profile (preferred inside the Docker workbench):**
```bash
cd docker/workbench
docker compose --profile postgres up -d postgres-claude     # postgres:16-bookworm
```
Connection (container network): host `postgres-claude`, port `5432`. From the host: `localhost:5433`.

**B. Plain container (outside the workbench):**
```bash
docker run -d --name postgres-claude -e POSTGRES_USER=mj_admin -e POSTGRES_PASSWORD=Claude2Pg99 \
  -e POSTGRES_DB=MJ_Workbench_PG -e POSTGRES_INITDB_ARGS=--data-checksums -p 5433:5432 postgres:16-bookworm
```

Canonical credentials (override via `PG_USER`/`PG_PASSWORD`/`PG_DATABASE`/`PG_HOST_PORT`):

| Field | Value |
|-------|-------|
| host | `postgres-claude` (workbench net) or `localhost` (host) |
| port | `5432` (container) / `5433` (host-mapped) |
| user | `mj_admin` |
| password | `Claude2Pg99` |
| database | `MJ_Workbench_PG` |
| schema | `__mj` |

Reachability check (must print `1`):
```bash
PGPASSWORD=Claude2Pg99 psql -h localhost -p 5433 -U mj_admin -d MJ_Workbench_PG -c "SELECT 1;"
```

> **Always test against a fresh, empty PG database.** Drop + recreate (or `DROP SCHEMA __mj CASCADE`)
> before §1 so the run is a clean all-CREATE, exactly like SQL Server.

## 2. Point MJ at Postgres (two knobs)

- `mj.config.cjs` (repo root): `dbPlatform: 'postgresql'` — this is what `mj migrate`/`mj codegen` read to
  drive conversion + PG-aware generation.
- `packages/MJAPI/.env` (gitignored — keep it untracked):
  ```
  DB_PLATFORM=postgresql
  DB_TYPE=pg
  DB_HOST=localhost        # or postgres-claude inside the workbench net
  DB_PORT=5433             # or 5432 inside the net
  DB_DATABASE=MJ_Workbench_PG
  DB_USERNAME=mj_admin
  DB_PASSWORD=Claude2Pg99
  DB_TRUST_SERVER_CERTIFICATE=true
  CODEGEN_DB_USERNAME=mj_admin
  CODEGEN_DB_PASSWORD=Claude2Pg99
  # plus the existing ENCRYPTION_KEY / MJ_API_KEY already in this file
  ```

> **🚨 advancedGen gate — REQUIRED on any keyless env, or `ApplyAll` will fail.** `ApplyAll` triggers an
> in-process CodeGen whose OPTIONAL AI "advanced generation" step **defaults to ON** (`enableAdvancedGeneration`
> defaults to `true` in the CodeGen config schema). With **no AI credentials** that step calls a keyless model,
> throws `Invalid Vertex AI credentials`, and **sinks the whole CodeGen → `ApplyAll`/Phase-A fail**. The agent
> almost never has live AI keys, so on a keyless run you MUST, in `mj.config.cjs`:
> ```js
> advancedGeneration: { enableAdvancedGeneration: false, batchSize: 15 },
> ```
> **then RESTART the MJAPI** — the in-process CodeGen reads this config at MJAPI startup, so editing it without a
> restart changes nothing (you'll see `Invalid Vertex AI credentials` keep climbing in the MJAPI log). Core
> entity/SP/view generation is unaffected; only AI enrichment is skipped. Verify: after the restart, a fresh
> `pull-ref` ApplyAll completes (`11/0`) with **zero** new `Invalid Vertex AI credentials` lines. Only keep
> advancedGen ON where real AI keys are present (the keyed/broker MJAPI).

## 3. §1 bring-up — the exact order (run verbatim, on this branch)

```bash
# fresh empty PG DB already ensured (step 1)
npx mj migrate          # converts SQLServer migrations → PG and applies them
npx mj sync push        # seeds metadata (incl. the connector's Integration/IntegrationObject rows)
npx mj codegen          # PG-aware: __mj entity classes + DB objects on Postgres
# build + start the keyed MJAPI/MJExplorer (operator launches MJAPI WITH the LLM keys; you never read them)
# obtain the GQL API key WITHOUT reading/exposing it (§0), then create the initial Company record
```
Gotcha (same as the integration framework's PG runs): a fresh PG DB has `__mj` but **no per-connector dest
`Entity` rows** until the connection's `ApplyAll` runs — that's Phase A's job, not a manual step.

## 4. Seed the connection once → reference mode (token-free, structurally unreadable)

Seed through the **credential broker** exactly as on SQL Server (you write a job file with ENV-VAR *names*;
the broker dereferences the secret; you get a token-scrubbed result with a `companyIntegrationID`). From
then on every phase runs in **reference mode** against that `CIID` — no secret enters agent context. The
seed/broker mechanics are identical across dialects; only `HS_LIVE_PLATFORM=postgresql` and the DB-direct
PG creds change.

## 5. Run §1→§7 on Postgres — and emit the dual-dialect evidence

Run the same per-connector live harness you ran on SQL Server with the platform + PG DB-direct creds
swapped in (the harness drives everything through the MJ GraphQL API; the DB-direct creds are only your
*assertion* reads):
```bash
export PGH=localhost PGP=5433 PGU=mj_admin PGW=Claude2Pg99 PGD=MJ_Workbench_PG
env HS_LIVE_GRAPHQL_URL=http://localhost:4001/ HS_LIVE_PLATFORM=postgresql HS_LIVE_CIID=$CIID \
    HS_LIVE_DB_HOST=$PGH HS_LIVE_DB_PORT=$PGP HS_LIVE_DB_NAME=$PGD HS_LIVE_DB_USER=$PGU DB_PASSWORD=$PGW \
    node -r dotenv/config packages/Integration/connectors/test/<vendor>-live-harness.mjs
```

For **every** `e2eLivePhases` entry with `dualDialect:true`, your `testing-agent` T10/T11 result MUST carry a
`livePhaseLog` entry with `dialect:'postgres'` **in addition to** the `sqlserver` one — same `phaseId`/`order`,
each with NL + JSON + pass/fail. `floor-check` reads both and fails the run on `e2e-dual-dialect-missing` if a
`dualDialect` phase appears for only one dialect. Assert **outcomes** (ground-truth counts, second-layer
non-empty, record-map 1:1), never `Status==='Success'` (the silent-fail rule).

## 6. Postgres-specific gotchas (the only real deltas vs SQL Server)

1. **UUID case.** SQL Server returns UUIDs upper-case, Postgres lower-case. Every UUID comparison in
   assertions goes through `UUIDsEqual` / `NormalizeUUID` — never `===`. A run that passes on SQL Server and
   fails only on PG comparisons is almost always this.
2. **Switching platforms behind one endpoint → clear the client cache.** If you point the same MJExplorer at
   PG after SQL Server, clear the browser cache / use incognito (the GraphQL client caches metadata + UUID
   casing).
3. **Composite-PK association tables.** PG CRUD generation for composite PKs is the fix proven in the
   framework PR (`PostgreSQLCodeGenProvider`); confirm association/junction tables are **non-empty** after a
   sync whose parents have data — that's the §3.6 DAG assertion and the canonical PG-only failure if the
   connector's parent ordering is wrong.
4. **TLS.** Local workbench PG runs without TLS; managed PG (Aurora/RDS, Azure) needs `DB_ENCRYPT=true`. Flag
   anything that wouldn't hold on production managed Postgres.
5. **Converter is build-time.** If `mj migrate` reports a converter issue, capture + report; do not hand-edit
   the converted SQL or the SQLConverter.

## 7. What "Postgres-proven" means

A connector is dual-dialect green only when the **same applicable §1→§7 subset** ran on both SQL Server and
Postgres, each `dualDialect` phase has a `postgres` `livePhaseLog` entry with real outcome evidence, and
`floor-check` reports no `e2e-dual-dialect-missing` / `e2e-phase-missing` / `e2e-skip-without-reason`. Until
then the Postgres half is unproven and the connector cannot graduate.

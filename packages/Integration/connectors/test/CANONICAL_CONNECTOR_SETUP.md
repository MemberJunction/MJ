# CANONICAL Connector Setup — env bring-up before ANY connector logic

**This is THE setup. Run it EXACTLY, for every connector, then go straight to the connector-logic
instructions. Do NOT re-derive any step — every line + gotcha below cost real time to learn (proven
end-to-end on PropFuel, 2026-06-09, SQL Server).**

The chain, in order, each step gating the next:
**fresh DB → `mj migrate` → connector metadata → `mj sync push` → `mj codegen` → `turbo build --filter=mj_api` → `pm2 restart mjapi` → (connector logic).**

---

## Invariants (never violate)

- **Branch**: the connector feature branch (e.g. `connectors/<vendor>-…`). **NEVER `next`.** RSU git target (`RSU_GIT_TARGET_BRANCH`) is also the feature branch, **never `next`**.
- **Only two files are editable for setup**: `.env` and `mj.config.cjs`. **Never alter framework code** to make setup work.
- **Credentials are broker-held** (separate `mjbroker` OS user). The agent never sees token bytes; used at TEST time only, never at build.

## `.env` (repo root) — required keys

- DB: `DB_PLATFORM=sqlserver`, `DB_HOST=localhost`, `DB_PORT=1444`, `DB_DATABASE=MJ_SS_E2E`, `DB_USERNAME=sa`, `DB_PASSWORD=<sa pw>`, **`DB_TRUST_SERVER_CERTIFICATE=1`** (the digit `1`, NOT `Y` — `Y` fails TLS in the `mj` CLI), `CODEGEN_DB_USERNAME` / `CODEGEN_DB_PASSWORD`.
- `GRAPHQL_PORT=4007`, `MJ_CORE_SCHEMA=__mj`, `NODE_ENV=development`.
- `MJ_API_KEY=<key>` (MJAPI validates the `x-mj-api-key` header against this), `MJ_BASE_ENCRYPTION_KEY=<key>`.
- RSU: `ALLOW_RUNTIME_SCHEMA_UPDATE=1`, `RSU_PM2_PROCESS_NAME=mjapi`, `RSU_WORK_DIR=/tmp/rsu-isolated`, `RSU_ADDITIONAL_SCHEMA_INFO_PATH=<repo>/metadata/integrations/additionalSchemaInfo.json`, `RSU_MIGRATIONS_PATH=migrations/v5`, `RSU_GIT_REPO_URL`, `RSU_GIT_LOCAL_PATH`, **`RSU_GIT_TARGET_BRANCH=<feature branch>`** (never `next`), `RSU_GIT_MERGE_STRATEGY=direct`.

## `mj.config.cjs`

- **`advancedGeneration: { enableAdvancedGeneration: false, batchSize: 15 }`** — MUST be off. On + keyless → `Invalid Vertex AI credentials` sinks the entire codegen. Read at MJAPI **startup**, so restart MJAPI after changing it. (advancedGen is optional AI enrichment; it does not affect connector correctness.)

---

## The ordered sequence

Every `mj`/`turbo` command runs from the repo root with the env loaded:
`set -a; . ./.env; set +a; export DB_TRUST_SERVER_CERTIFICATE=1`

1. **Fresh SQL Server DB.** Docker container `sql-claude` @ `localhost:1444`, db `MJ_SS_E2E`, user `sa`. Drop + recreate empty (or reuse ONLY if verified clean — a degraded DB sinks `ApplyAll`/codegen).
2. **`npx mj migrate --dir ./migrations/v5`** — migrate to the latest `next`. Verify it reached the newest migration version. (Bring `next` in without overriding integration work first.)
3. **Connector metadata.** Author/reconcile per [`.claude/rules/metadata-file-conventions.md`](../../../../.claude/rules/metadata-file-conventions.md) — the **Preflight** (real columns only, valid enums/CHECK, `@parent:ID` FKs, `@lookup` targets exist) and **Rebuilding-an-already-seeded-connector** sections. **If the integration was already seeded** (prior migration/build), delete the stale IO/IOF **exactly** as canonized there: top-level `deleteRecord:{delete:true}` records in a `MJ: Integration Objects` entity dir + `--delete-db-only` + a **delete-only** push (separate from the upsert). Keep the new rows.
4. **`npx mj sync push`** — **SCOPED to this connector only** (isolated temp dir mirroring `<root>/<entityDir>/…` with a copy of the root `.mj-sync.json` + the entity `.mj-sync.json`; or `--include`). Never push all of `metadata/` (drags in ~24 other vendors + unrelated `deleteRecord` markers, e.g. 149 in `.hubspot-actions.json`). Include the connector's credential type, ordered before `integrations` via `directoryOrder`.
5. **`npx mj codegen`** — advancedGen OFF. Expect: `SQL CodeGen completed`, `Post-CodeGen CRUD validation passed`, `Advanced generation completed (0.0s)`, **0 errors**.
6. **`npx turbo build --filter=mj_api`** — builds MJAPI + its full dependency graph in order (cached; prebuild regenerates the class manifests). Expect `Tasks: N successful`, 0 `error TS`. (MJAPI runs from `src` via a TS loader, but imports dep **dists** — so the dep rebuild is the part that matters.)
7. **`pm2 restart mjapi`** — NOT `npm start` (manifests already built in step 6; `pm2 restart` does not run npm prestart, which is fine). Wait for listen without shell sleep: `curl --retry 45 --retry-delay 2 --retry-connrefused -s -o /dev/null -w "%{http_code}" http://localhost:4007/` → **HTTP `401` = HEALTHY** (listening + `MJ_API_KEY` auth gate working). Confirm the out-log shows `🚀 Server ready at http://localhost:4007/` + `RSU … initialized` (DDL provider, in-process CodeGen runner, output dirs, additionalSchemaInfo path) and **no real boot errors** (an auth `401` / "Missing token" from the health curl is expected, not a boot failure).

## Per-connector runtime bring-up (after the env is up) — proven on PropFuel 2026-06-10

8. **Create the Company** (the tenant the connection attaches to) → `companyID` — one MJ `Company` row (`Name` + `Description`); SQL or GraphQL. No secret.
9. **Broker creates the CompanyIntegration + encrypted credential.** The vendor token lives ONLY in the broker (separate OS user; `propfuel.env` is `Permission denied` to the agent). The broker calls `IntegrationCreateConnection(CompanyID, IntegrationID, CredentialTypeID, CredentialValues, Configuration)` with the token from its **own env** (`E2E_TOKEN_KEY` names the secret key, e.g. `Token`; `E2E_LIVE_CONFIG` carries non-secret config e.g. `{"AccountID":"2019"}`); MJAPI encrypts it and returns the `CompanyIntegrationID`. The agent never sees the token — every later step references the connection **by ID** and MJAPI decrypts server-side, so the agent drives them over GraphQL with `MJ_API_KEY` and no vendor token.
10. **Re-discover** → `IntegrationRefreshConnectorSchema(companyIntegrationID)` runs the creation pipeline (ConnectionTest → Introspect via `DiscoverFieldsViaStream` → Persist → soft-PK classify): it streams the live feed, infers fields + a **statistics-based soft PK** from the partly-streamed sample, and persists IO/IOF as `Discovered`. For a spec-less feed the **data types ARE the objects** (e.g. `checkin_questions`/`clicks`/`opens`), discovered from the filename suffix — NOT the single generic declared meta-IO.
11. **ApplyAll the DISCOVERED objects** → `IntegrationApplyAll(input:{CompanyIntegrationID, SourceObjects:[<the discovered data-type objects>], StartSync:false}, platform:"sqlserver", skipGitCommit:true, skipRestart:true)` builds a vessel per object (entity + table + entity map) via in-process RSU CodeGen. ApplyAll the **discovered typed objects**, NEVER the generic declared meta-IO (0 fields → `0 entity maps created`). `skipRestart:true` keeps the HTTP call alive through the RSU step; verify `Success:true` + N entity maps created.
12. **StartSync** → run the sync (ApplyAll with `StartSync:true`, or the dedicated sync mutation) to pull the feed into the vessels; **assert ground-truth rowcounts per object** — `Processed:0` on a feed that has data is a red flag, not a pass.

## Then → connector logic, per the user's instructions.

---

## Gotchas (do NOT relearn these)

- `DB_TRUST_SERVER_CERTIFICATE=1` (digit), not `Y` — else `mj` CLI TLS handshake fails.
- advancedGen OFF or keyless codegen dies on Vertex AI.
- `mj sync push` is **upsert-by-PK with NO prune** → stale rows linger. Deletes fire **only for TOP-LEVEL** `deleteRecord` (the audit quick-scan gate ignores nested deletes). `--delete-db-only` is required to sweep dependent IOF (`CascadeDeletes=0`, so no auto-cascade; the audit reverse-topo-orders IOF before IO). Separate delete from upsert or you hit `UQ_IntegrationObject_Name`. (Full rules in metadata-file-conventions.md.)
- **Scope the push** (temp dir / `--include`) — never the whole `metadata/`.
- `curl :4007 → 401` is **success** (auth gate), not failure.
- The `mj sync push` validator wants a root `.mj-sync.json` at the `--dir` root AND the entity `.mj-sync.json` in a child dir; discovery scans `--dir`'s **children** for the entity marker.
- **Discovered string fields must seed a bounded `nvarchar(450)`, never `NVARCHAR(MAX)`** — a MAX column can't be a key (SQL Server 900-byte index limit), which breaks PK creation and idempotent re-apply (`450→MAX` ALTER skipped → CodeGen fails). Set in TWO spots: `BaseIntegrationConnector.DiscoverFieldsViaStream` defaults `field.MaxLength = c.Inferred.MaxLength ?? 450` (450 = the largest a key can be, so any field stays PK-eligible), AND `IntegrationSchemaSync.PersistDiscoveredSchema` writes that onto `IOF.Length` (it otherwise persists only `Type`, so the length is dropped and the column defaults to MAX). `buildTargetConfigs` reads `IOF.Length` → `nvarchar(N)`; null → `NVARCHAR(MAX)`.
- **ApplyAll the DISCOVERED data-type objects, not the generic declared meta-IO** (the meta-IO has 0 fields → `0 entity maps created`, a hollow pass).
- **Credential boundary**: `IntegrationCreateConnection` is the ONLY step needing the raw vendor token (the broker supplies it from its own env); discover / ApplyAll / sync all run on the **stored** credential by `CompanyIntegrationID` (MJAPI decrypts server-side), so the agent drives them over GraphQL with `MJ_API_KEY` and never handles the vendor token.
- **A green stage with `Processed:0` (or `Success:true` + `0 entity maps`) is a RED FLAG, not a pass** — assert real counts, and watch for `referenceMode:true` hollow-passing on a leftover/stale CIID.

---

## FAST e2e test-harness bring-up (bulk-insert path) — for `/test-connector`, NOT production deploy

The canonical sequence above is the PRODUCTION setup. For the **credential-free e2e matrix** (running `run-connector-campaign.mjs` across many connectors), step 4's `mj sync push` of the **full** `metadata/` catalog is the bottleneck — its per-record save+capture path takes **~hours** for ~5k IO / ~100k IOF. The harness ships a faster, equivalent bring-up (proven 2026-06-22, SQL Server). It deploys the **same** metadata; only the write path differs.

1. **`overnight-setup.sh`** (one-time, fresh DB) — fresh `MJ_SS_E2E` → `mj migrate` → `mj sync push` → `mj codegen` → start MJAPI :4007. (Or `deploy-only.sh` when the DB is already migrated.)
2. **`bulk-insert-connectors.mjs`** — deploys ALL connectors' Integration/IntegrationObject/IntegrationObjectField rows DIRECTLY via `mssql` bulk insert (~2.3 s for the integration rows vs ~2 hr via `mj sync push`). Resolves `@lookup`/`@parent`/`@file`, generates UUIDs, deletes prior rows by Integration Name (idempotent). Scans `metadata/integrations/*` for the connector set (override via `CONNECTORS=` env). It does **NOT** touch `MetadataSync` — it's a standalone test tool; the framework stays stock. CredentialTypes + `integration-object-deletes` still go through a scoped `mj sync push`.
3. **Restart MJAPI** after bulk-insert so its engine cache picks up the new Integration rows. (Per-connector CodeGen happens later, at ApplyAll time, inside the campaign — not here.)
4. **`reset-to-core.mjs`** — between connectors in a sweep: drops every NON-core (connector) Entity + its physical schema, returning the DB to the core `__mj` baseline so each connector's ApplyAll re-CodeGens over a SMALL entity set (core + itself), not an ever-growing accumulation. Excludes `__mj%` schemas (never drops framework tables). Keeps the IntegrationObject/IntegrationObjectField metadata (only the materialized entities/tables are dropped).
5. **`loop-connectors.sh [conn,conn,…|<all>]`** — per connector: `reset-to-core` → restart MJAPI → `run-connector-campaign.mjs <conn>` → save real proof to `overnight-proof/<conn>/` + `SUMMARY.md`. Reset-between-each is what keeps ApplyAll CodeGen fast + isolates each connector.

All five scripts are path-portable (repo root derived from script location; override via `MJ_REPO_ROOT`) + env-overridable (`DB_HOST`/`DB_PORT`/`DB_DATABASE`/`DB_PASSWORD`). The connector matrix (`run-connector-campaign.mjs`) regenerates fixtures from the CURRENTLY-DEPLOYED metadata and auto-derives each connector's lifecycle capability block (discovery/write/incremental) from the deployed schema + source — so cells 9 (write) / 10-11 (discovery) RUN where genuinely supported, and skip-with-reason otherwise.

> **Why bulk-insert is sound, not a shortcut:** it writes the IDENTICAL IntegrationObject/IntegrationObjectField rows `mj sync push` would, resolving the same `@lookup`/`@parent`/`@file` refs to the same UUIDs. The connector's RUNTIME behavior (discover/ApplyAll/sync/CRUD) is exercised over GraphQL exactly as production. Only the build-time metadata SEED is accelerated; nothing in the connector code path is mocked or bypassed.

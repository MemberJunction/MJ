# Integration Framework — Canonical Live Test Design (HubSpot vehicle)

> **What this actually tests:** the *framework*, not HubSpot. HubSpot is the vehicle; the
> subject under test is the engine's mechanics — record-map identity resolution, field
> mapping, watermarks, content-hash skip, keyset completeness, orphan/soft-delete, push
> round-trips, conflict resolution, structured emissions, adaptive rate limiting — exercised
> end-to-end through the **real GraphQL API** against **real data** on **both SQL Server and
> Postgres**. This is the template every other connector's live test inherits: the
> connector-specific bits (objects, fields, auth) vary, but the framework assertions below are
> identical and reusable.

## 0. Hard constraints (non-negotiable)

1. **Credential safety.** The agent NEVER reads the HubSpot token or the MJAPI auth secret.
   Both stay behind the broker (root-owned mode-600 / out-of-sandbox broker process). Every
   harness reads secrets `process.env.X` **by name** and scrubs every value out of all output.
   The agent only drops job files and reads token-redacted JSON results.
2. **Test portal, not client data** — but still: **never alter `Users`/owner records**, and
   **every record the test CREATES in HubSpot is DELETED at the end** (tracked by a unique
   per-run marker so cleanup is exact; deletes only ever touch test-created rows).
3. **Read before write.** The write/CRUD/bidirectional phases run only after the read/pull path
   is proven, and only with `allowWrite: true` (the broker refuses writes otherwise).
4. **Both dialects.** Every framework assertion is verified on SQL Server AND Postgres; results
   must be identical (modulo UUID case — compare with `UUIDsEqual`).

## 1. Coverage model — the 2^N matrix

Coverage is the cross-product of these orthogonal dimensions. Not every cell is independently
run (some are dominated or invalid — e.g. conflict-mode only applies to bidirectional), but the
matrix is the checklist: every dimension value appears in combination, nothing is "assumed".

| # | Dimension | Values |
|---|-----------|--------|
| D1 | Direction | pull (forward) · push (backward) · bidirectional |
| D2 | Sync mode | full · incremental (watermark) |
| D3 | Object class | CRM standard (contacts/companies/deals) · CRM w/ associations · non-CRM |
| D4 | Volume regime | small (< 10k, single window) · large (> 10k, keyset re-anchor) |
| D5 | Same-timestamp cluster | absent · present (> 10k sharing one `hs_lastmodifieddate`) |
| D6 | Re-sync state | first (no watermark) · re-sync unchanged (content-hash skip) · re-sync changed (delta only) |
| D7 | Delete handling | none · soft-delete/tombstone · orphan detection (full-sync sweep) |
| D8 | Conflict (bidir only) | SourceWins · DestWins · MostRecent |
| D9 | Rate pressure | normal · induced (drive 429s, verify adaptive backoff) |
| D10 | Dialect | SQL Server · Postgres |

The user's "order of 2^N" = full combinatorial intent across D1–D10. The harness runs a curated
spanning set that touches every value of every dimension at least once and every *pair* that can
interact (e.g. large × same-timestamp, incremental × content-hash, bidirectional × each conflict
mode), then the high-value full crosses (large × incremental × dual-dialect).

## 2. Framework-mechanics assertion catalog (the "huge detail / don't miss a spot")

Each run asserts the following. These are the reusable, connector-agnostic checks.

### 2.1 Data completeness — "ensure all data gets synced in"
- **Count parity:** for each object, `HubSpot total (API)` == `destination MJ table row count`
  after a clean full sync. Zero tolerance for silent loss.
- **No silent skips:** sum of `RecordsCreated + RecordsUpdated + RecordsSkipped(known-reason) +
  RecordsErrored(surfaced)` reconciles to records fetched; every `Skipped` has a structured
  reason (no anonymous drops).
- **Coverage of the large path:** a > 10k object (and a same-timestamp cluster) lands **all** rows
  — proves the keyset re-anchor on real data. Record wall-clock vs. record count for the speedup.

### 2.2 Record-map integrity (CompanyIntegrationRecordMap)
- Every synced external record has **exactly one** record-map row on the identity triple
  `(CompanyIntegrationID, EntityID, ExternalSystemRecordID)` — **no duplicates** (the new unique
  identity index; assert count of map rows == count of distinct external ids).
- `ExternalSystemRecordID ↔ EntityRecordID` is correct and stable: a re-sync **reuses** the same
  map rows (no new rows, no orphaned maps).
- After push (create-in-MJ → HubSpot), a map row is created linking the new external id back.

### 2.3 Field-mapping fidelity
- A sampled set of records: each mapped destination field value equals the HubSpot source value
  per the FieldMap (transforms applied, types coerced — §10 PostProcess). Includes a custom field
  and a key field.

### 2.4 Watermark + incremental
- After a clean sync the Pull watermark is set; an immediate incremental re-sync fetches ~0 and
  writes 0 (watermark filter works, no full re-scan).
- Modify N records in HubSpot → next incremental fetches exactly those N (± boundary), writes N.

### 2.5 Content-hash skip
- Re-sync with **no** source changes writes 0 (every record skipped by content hash, not re-written)
  — assert `RecordsUpdated == 0`, record-map `__mj_UpdatedAt` unchanged.
- Re-sync after changing M records writes exactly M.

### 2.6 Keyset completeness + speedup (the "fancy stuff")
- On the large/same-timestamp object: all rows present (2.1), AND the run shows the keyset
  re-anchor firing in the structured emissions (the `keyset-paginating` log / window re-anchors),
  AND it completes in **one** sync (not the old multi-cycle stall). Capture timing.

### 2.7 Associations + DAG ordering + FK
- Association object (e.g. `assoc_contacts_companies`) populates `(from_id, to_id)` pairs; parents
  (contacts/companies) were synced **first** (DAG order); FK columns both non-null. Count parity
  vs. the v4 batch/read pair count.

### 2.8 Deletes — soft-delete / tombstone / orphan
- Archive a (test-created) record in HubSpot → next sync marks it tombstoned/soft-deleted in MJ
  (ledger columns `IsTombstoned`/`DeletedDetectedAt`), not hard-deleted (unless DeleteBehavior says so).
- Full-sync orphan sweep: a record removed from the source set is detected (ORPHANS_DETECTED
  surfaced) and handled per DeleteBehavior — never a catastrophic mass-delete on a partial fetch.

### 2.9 Push (backward) round-trip
- Create a **test-marked** record in MJ → push (WriteRecord/ProcessPushSync) → it appears in
  HubSpot → next pull links it by identity (no duplicate map, no echo loop — engine filters its
  own changes). Update in MJ → pushes the delta. Then **delete the test record** (cleanup).

### 2.10 Conflict resolution (bidirectional)
- Change the same record on both sides; assert the configured policy wins: SourceWins (external),
  DestWins (MJ), MostRecent (by modstamp). Verify no lost-update for the losing side's *other* fields.

### 2.11 Structured emissions (§11) over GQL
- The run's progress is observable via the GQL subscription AND the pollable run-events query:
  per-batch progress, the structured `SyncWarning`s (ZERO_PARENTS, SECOND_LAYER_EMPTY,
  DEPENDENCY_LAYERING_DEGRADED, ORPHANS_DETECTED, PUSH_SKIPPED), final per-entity counts, and
  `EntitiesCreated/NotCreated` from the RSU apply. Nothing silent.

### 2.12 Adaptive rate limiting
- Under induced pressure (tight interval / many objects), the adaptive token-bucket + AIMD
  concurrency back off on 429 (honor Retry-After) and ramp on success; **all data still lands**
  (no dropped records, no unhandled 429 failures). Capture the backoff/ramp from emissions.

### 2.13 Dual-dialect parity
- §2.1–2.12 hold identically on SQL Server and Postgres; row counts and field values match across
  the two (UUID-case-insensitive).

## 3. Phased run order (safety + dependency ordering)

1. **P0 Setup** (read-only): CreateConnection (token injected at DB level by broker, never in a
   query) → discover objects/fields → CreateEntityMaps + FieldMaps → ApplyAll (create dest tables)
   on both dialects.
2. **P1 Pull/full** (read-only): contacts → companies → deals → associations. Assert 2.1, 2.2,
   2.3, 2.7, 2.11, 2.13. *Proves completeness + record maps on real data.*
3. **P2 Incremental + content-hash** (read-only): immediate re-sync (0 writes), then mutate-in-source
   path is exercised in P4. Assert 2.4, 2.5.
4. **P3 Scale + rate** (read-only): large object + same-timestamp cluster + induced rate pressure.
   Assert 2.6, 2.12. *Proves the keyset fix + adaptive limiter on real data.*
5. **P4 Push/CRUD** (`allowWrite`): create/update/delete **test-marked** records in MJ, push to
   HubSpot, pull back. Assert 2.9. **Cleanup deletes all test-created rows.**
6. **P5 Bidirectional + conflict** (`allowWrite`): assert 2.10, 2.8 delete handling. Cleanup.
7. **P6 Teardown**: delete test entity maps/connection (optionally keep tables for inspection),
   verify no test pollution remains in HubSpot (the per-run marker query returns 0).

## 4. Cleanup discipline (so the test portal stays clean)

- Every created HubSpot record carries a unique property/value marker `mj_test_run = <runId>`.
- Teardown queries `mj_test_run = <runId>` and deletes exactly those — **only** test-created rows,
  **never** users/owners, **never** pre-existing data.
- Cleanup runs in `finally` so a mid-run failure still purges; the final report includes a
  `cleanup: { created: N, deleted: N, remaining: 0 }` proof.

## 5. What each phase proves (PR-evidence prep)

| Phase | Proves (for "what is this PR actually proving") |
|-------|--------------------------------------------------|
| P1 | Real data syncs in completely; record maps are 1:1 and correct; associations fill via DAG order; both dialects |
| P2 | Incremental + content-hash actually skip unchanged work (efficiency claim is real) |
| P3 | Keyset re-anchor fixes the >10k / same-timestamp data-loss on REAL data; adaptive rate limiting holds under pressure |
| P4 | Backward (push) works; identity round-trips with no duplicate maps or echo loops |
| P5 | Bidirectional conflict resolution + delete handling behave per policy |
| all | The structured GQL emissions make every step observable — nothing silent |

## 6. HOW — concrete GQL lifecycle + run recipe

Implemented in [`gql-live-harness.mjs`](gql-live-harness.mjs) (IO-injected orchestration, unit-tested
by [`gql-live-harness.selftest.mjs`](gql-live-harness.selftest.mjs)) + [`gql-live-adapters.mjs`](gql-live-adapters.mjs)
(real fetch/DB/HubSpot adapters). Wired into [`plans.mjs`](plans.mjs) as two broker plans.

### 6.1 GQL lifecycle (exact ops, verified against the live resolver — `schema.graphql` is stale for the §11 run-observe trio)
- **Setup:** `IntegrationCreateConnection(input:{CompanyID, IntegrationID, CredentialTypeID, CredentialName, CredentialValues:JSON({apiKey})}, testConnection:true, runSchemaRefresh:true)` → `CompanyIntegrationID`, `CredentialID`. Then `IntegrationApplyAll(input:{CompanyIntegrationID, SourceObjects:[{SourceObjectName}], DefaultSyncDirection:"Pull", StartSync:false}, platform, skipGitCommit:true, skipRestart:true)` → `EntityMapsCreated[]{EntityMapID, EntityName, SourceObjectName}`. Cross-check `IntegrationListEntityMaps`.
- **Trigger:** `IntegrationStartSync(companyIntegrationID, fullSync, syncDirection:"Pull"|"Push"|"Bidirectional", entityMapIDs?)` → `RunID` (race-prone → fall back to `IntegrationListRuns(inFlightOnly:true, limit:1)[0].RunID`). Single-record CRUD: `IntegrationWriteRecord(companyIntegrationID, objectName, operation:"create"|"update"|"delete", externalID?, attributes:JSON)` → `ExternalID, StatusCode`.
- **Observe:** poll `IntegrationTailRunEvents(runID, sinceSeq)` until `IsInFlight==false` (keyset-by-seq), accumulating `records.batch.complete` Counts, `warning`/`Level=warn` (structured `SyncWarning`s), `external.call.retry` (rate-limit), `checkpoint` `ResumableStateJSON` (keyset/resume). Final `IntegrationGetRun(runID)` → `Run{Counts, WarningCount, Warnings, ExitReason}`.
- **Teardown (FK-safe):** delete each created external record by captured `ExternalID` → `IntegrationDeleteEntityMaps(entityMapIDs)` → `IntegrationDeleteConnection(companyIntegrationID, deleteData:false)`. **Engine-direct gaps** (no GQL op): the `Credential` row (broker `DELETE`s by `CredentialID`) and dropping generated tables (optional, disposable workbench).

### 6.2 Assertions are DB-direct (not GQL)
`skipRestart:true` means the running MJAPI's GQL schema does NOT include the new dynamic entities, so count-parity + record-map integrity are checked by direct SQL via the broker's DB creds: resolve `(SchemaName, BaseTable, ID)` from `__mj.Entity` by `EntityName`, then `COUNT(*)` the destination table and `COUNT(*) / COUNT(DISTINCT ExternalSystemRecordID)` on `__mj.CompanyIntegrationRecordMap`. HubSpot side count = direct v3 `?limit=1 → total`.

### 6.3 Run recipe (you launch; the agent never sees the token)
Two plans: **`hubspot-live-pull`** (`writes:false`, forward only — runs unprompted) and **`hubspot-live-matrix`** (`writes:true` — broker requires `allowWrite:true`; run only after pull is green).

Secrets (in the launching/broker process env only, never the agent): `HUBSPOT_API_KEY`, `HS_LIVE_DB_PASS` (workbench DB password). Non-secret config (env): `HS_LIVE_GRAPHQL_URL`, `HS_LIVE_PLATFORM` (`sqlserver`|`postgresql`), `HS_LIVE_COMPANY_ID`, `HS_LIVE_CREDTYPE_ID`, `HS_LIVE_INTEGRATION_ID` (or resolved by name), `HS_LIVE_DB_HOST/PORT/NAME/USER`, `HS_LIVE_OBJECTS`.

```bash
# SQL Server (MJAPI on :4000 bound to sql-claude) — FORWARD path, read-only, unprompted:
sudo bash -c 'set -a; . /etc/mj-hubspot.env; . /etc/mj-livetest.env; set +a; \
  HS_LIVE_PLATFORM=sqlserver HS_LIVE_GRAPHQL_URL=http://localhost:4000/ \
  exec node packages/Integration/connectors/test/run-plan.mjs hubspot-live-pull'
# Postgres (second MJAPI on :4001 bound to postgres-claude, `--profile postgres` up):
#   HS_LIVE_PLATFORM=postgresql HS_LIVE_GRAPHQL_URL=http://localhost:4001/ ... hubspot-live-pull
# After pull is green on BOTH dialects, the matrix (writes), with the broker's allowWrite gate:
#   ... hubspot-live-matrix     (job file carries "allowWrite": true)
```

Paste the token-scrubbed JSON result back; the agent analyzes it (per-object completeness, record-map
1:1, watermark/content-hash deltas, keyset re-anchor evidence, retry/rate-limit counts, cleanup proof).

### 6.4 Dual-dialect = two MJAPI instances
`ApplyAll`/`StartSync` target the MJAPI process's own bound DB; there is no per-request dialect switch.
Reaching both dialects = run each plan twice, once per `(HS_LIVE_GRAPHQL_URL, HS_LIVE_PLATFORM)` pair.
Correlate run/map IDs across dialects with `UUIDsEqual` semantics (SQL Server upper / Postgres lower).

### 6.5 Pre-run checklist (from the harness adversarial review — `fix-then-run`, fixes applied)
Required env in the launching/broker process (only the first two are secrets, scrubbed):
`HUBSPOT_API_KEY`, `HS_LIVE_DB_PASS`, `HS_LIVE_COMPANY_ID` (MJ Company ID), `HS_LIVE_CREDTYPE_ID`
(MJ CredentialType ID for the api-token credential), `HS_LIVE_DB_NAME`, `HS_LIVE_DB_HOST/PORT/USER`,
`HS_LIVE_GRAPHQL_URL`, `HS_LIVE_PLATFORM`. (`HS_LIVE_INTEGRATION_ID` optional — resolved by name 'HubSpot'.)

Confirm before the first credentialed run:
1. **First run targets SQL Server** (`HS_LIVE_PLATFORM=sqlserver`). Defer Postgres to a later run; on the
   first PG run, preflight one entity's `SchemaName`/`BaseTable` casing (MJ-on-PG quoting is the one
   unverified assumption) before trusting PG counts.
2. **MJAPI auth mode.** The plans send no `Authorization` header (correct for the no-auth dev workbench).
   If the target MJAPI enforces auth, every op 401s — add `mjToken: 'HS_LIVE_MJ_TOKEN'` to the plan's
   `secrets` and the header is sent automatically.
3. **DB-password leak check (one-time).** The scrubber is exact-substring; do one deliberate bad-password
   connect and eyeball the scrubbed JSON to confirm the driver doesn't emit an encoded password.
4. **Quiet portal for parity.** Completeness gates on `rows == HubSpot total` (plus the drift-free internal
   `rows == record-map total == distinct`). On an actively-mutating portal the live total can drift between
   sync and count; a quiet/dedicated test portal makes parity exact. A parity-only failure with the
   internal 1:1 intact = investigate drift, not necessarily real loss.

Fixes already applied from the review: incremental assertion is now real (`forward.incremental.narrowed`:
incremental must process fewer records than the full pull); `result.ok` is computed AFTER teardown so a
failed cleanup turns the run red; a successful create with no `ExternalID` fails loud with an orphan
warning; SQL identifiers from metadata are validated before interpolation.

### 6.6 Reference mode — "use it, never read it" (the agent runs it token-free)
The HubSpot token is encrypted at rest in the DB `Credential` and decrypted **server-side** on every
sync. So the only step that ever needs the plaintext is a one-time seed; after that the test runs purely
by `CompanyIntegrationID` and the token never enters the agent's process.

- **Seed once** (someone holding the token, e.g. under sudo, or via the MJExplorer "Create Connection" UI):
  `run-plan.mjs hubspot-seed-connection` → returns `companyIntegrationID`. The token enters only this step.
- **Run token-free** (the agent): set `HS_LIVE_CIID=<that id>` and run `hubspot-live-pull-ref`
  (or `hubspot-live-matrix-ref --allow-write`). The plan declares **no `HUBSPOT_API_KEY` secret**, so the
  token is structurally unreadable; completeness uses the drift-free internal record-map 1:1 + a clean
  full run (no external-API parity, since that would need the token). Teardown **preserves** the seeded
  connection + encrypted credential (only the maps created this run are cleaned up).

**Credential boundary (strict):** for the token-free run the agent needs `MJ_API_KEY` (MJAPI `x-mj-api-key`
auth) and the workbench DB password (row counts) — both used by-name and scrubbed from output. It must
**NOT** receive `MJ_BASE_ENCRYPTION_KEY` (that + DB read could decrypt the token, defeating the guarantee)
or any AI-vendor key. So provide a **minimal** cred set, never the full `packages/MJAPI/.env`. The DB
password alone is safe — the `Credential.Values` blob is unreadable without the encryption key.

# Integration Framework — 2^N Live Test Matrix (SQL Server + Postgres)

The concrete, runnable test plan for the major-enhancement PR (#2752). Every test names: what it
**proves** (→ an item in `INTEGRATION_ADDITIONS.md`), the **setup**, the **action** (GraphQL op, the
source of truth), the **assertions** (DB‑direct + structured‑output), and **flags**:
`[both‑dialects]` · `[needs‑HS‑data]` (requires creating data in HubSpot first — saved for the morning) ·
`[needs‑restart]` (interrupt/restart MJAPI) · `[write]` (mutates the test portal; cleaned up; never Users).

> **Credential safety:** all runs go through the broker — secrets live only in the broker process; the
> agent submits job files and reads token‑scrubbed JSON. The key value is never read. **Never delete
> Users/owners or pre‑existing data**; only test‑created records, tracked by captured ExternalID.

## Dimensions (the N)
D1 direction (pull · push · bidirectional) · D2 mode (full · incremental) · D3 change‑state (unchanged ·
changed · added · deleted · duplicate) · D4 detection (watermark · content‑hash · Merkle · keyset) ·
D5 object‑class (CRM · association · non‑CRM) · D6 DeleteBehavior (soft · hard · none) · D7 conflict
(SourceWins · DestWins · MostRecent · Manual) · D8 rate (normal · induced) · D9 resilience (clean ·
interrupt/restart · injected‑error) · D10 dialect (SQL Server · Postgres) · D11 value‑edge (null ·
over‑length · type‑coerce). The runnable set is a spanning cover of every value + the high‑value crosses.

---

## Phase 0 — Clean‑DB setup & onboarding (per the spec)
Run on an **empty** SQL Server DB, then replicate on **Postgres**.

- **P0.0 Build + bootstrap** `[needs‑user]` — empty DB → `mj migrate` → `mj sync push` → `mj codegen` on
  this branch → build packages → start MJAPI + MJExplorer. (Environment step; you drive it.)
- **P0.1 System API key** — obtain `MJ_API_KEY` for `x-mj-api-key` (loaded into the broker, never the agent).
- **P0.2 Create Company** — a test Company row (GQL/metadata). Capture CompanyID.
- **P0.3 Create connection + test** `[write‑to‑nothing, read‑only externally]` —
  `IntegrationCreateConnection(input:{CompanyID, IntegrationID(HubSpot), CredentialTypeID, CredentialValues:JSON({apiKey})}, testConnection:true, runSchemaRefresh:true)`.
  **Assert:** Success; one `CompanyIntegration` row; `Credential.Values` non‑empty + **encrypted** (not the
  plaintext key); `ConnectionTestSuccess=true`. *(You don't need to be present — the broker injects the key.)*
- **P0.4 Metadata refresh** — `runSchemaRefresh` (or `IntegrationRefreshConnectorSchema`).
  **Assert:** `IntegrationObject`/`IntegrationObjectField` row counts == `SchemaRefresh.ObjectsCreated/FieldsCreated`;
  custom objects/fields persisted; every field has a canonical Type; watermark‑field metadata present where
  applicable; **PK classification ran** → `additionalSchemaInfo.json` has a PK nominee per object, and objects
  without a hard PK appear with confidence/strategy; structured `pk.classifier.result` events emitted.
- **P0.5 ApplyAllBatch** `[both‑dialects]` — `IntegrationApplyAllBatch` over all selectable objects
  (generalized ApplyAll, so this indirectly tests ApplyAll). **Observe via subscription** + tail.
  **Assert:** tables created (both dialects: `information_schema` shows the table + 11 `__mj_integration_*`
  columns + UNIQUE soft‑PK, no native PK); `EntityMapsCreated[]` returned; **structured report** at the end
  (per‑object created/skipped + reason; `EntitiesNotCreated(reason)` for any without a soft PK); subscription
  carried sufficient progress (stage events + counts + a terminal result). *Confirm the subscription info is
  sufficient — if not, that's a finding.*

---

## Phase 1 — Sync matrix (the big one)

### A. Completeness & "all data lands"  → A1,B1,N6
- **T‑A1** Full pull of contacts/companies/deals/associations `[both‑dialects]`.
  **Assert:** `COUNT(*) [hubspot].[<table>]` == source total (HubSpot API total / sync `TotalKnown`); every row's
  `__mj_integration_LastSyncedAt` in the run window; `IntegrationGetRun.Counts.processed == succeeded+failed+skipped`;
  `CompanyIntegrationRun.TotalRecords == succeeded`. Record‑map 1:1 (see B).

### B. Identity & idempotency  → C1,C2,C5
- **T‑B1** Sync twice, no changes. **Assert:** exactly **one** `CompanyIntegrationRecordMap` row per
  `(CI,Entity,ExternalSystemRecordID)`; `COUNT(DISTINCT EntityRecordID)` per external id == 1; no new MJ rows;
  destination row count unchanged.
- **T‑B2 Duplicate reaction** `[needs‑HS‑data]` — create two HubSpot records that map to the same identity
  (or the same key‑field value). **Assert:** the unique identity index prevents a second record‑map row; the
  engine's reaction (merge/skip/error) is the documented one; no duplicate MJ rows.
- **T‑B3** Association composite PK `[needs‑HS‑data]` — create contact↔company assoc. **Assert:** ExternalID
  `left|right`, flattened `{contact_id,company_id,type}`; one map row.

### C. Change detection & efficiency (watermark‑first)  → B1,B3,B4,B5
- **T‑C1 Timestamp watermark incremental** `[needs‑HS‑data]` — full sync; modify N contacts; incremental sync.
  **Assert:** `CompanyIntegrationSyncWatermark.WatermarkType='Timestamp'`, value advances ≥ the edit time;
  the connector issues a server‑side GTE filter (not a full list — visible in `external.call` events);
  exactly ~N processed; a third no‑change sync processes ~0.
- **T‑C2 Watermark fallback‑save** — sync a modstamp‑less object; **assert** a watermark row exists afterward
  (so the next run doesn't re‑scan from scratch).
- **T‑C3 content‑hash skip‑unchanged** — on a no‑watermark object, sync twice unchanged. **Assert:**
  `__mj_integration_ContentHash` is 64‑hex; 2nd run `RecordsSkipped == total`, `RecordsUpdated == 0`,
  record‑map `__mj_UpdatedAt` unchanged.
- **T‑C4 Merkle partition reconcile** (opt‑in; set `Configuration.partitionReconcile=true` via GQL
  `IntegrationUpdateEntityMaps`) — sync to seed the rollup snapshot; change M records in one partition; re‑sync.
  **Assert:** `sync.partition.reconcile` event shows only the changed partition deep‑applied, the rest skipped;
  `WatermarkType='ChangeToken'` rollup snapshot stored; `fullSync=true` re‑applies **all** partitions (drift repair).

### D. Keyset & restart resilience  → B5,B6,M1  `[needs‑restart]`
- **T‑D1** On a keyset object, **restart MJAPI mid‑sync**; resume. **Assert (via logs/artifacts):**
  `WatermarkType='Cursor'` held the AfterKey at interruption; resume re‑seeks from it — **no duplicate, no
  gap** straddling the cursor; clean completion nulls the cursor. Checkpoint events every 25 batches.
- **T‑D2 Orphaned‑run resume** — kill a sync with some maps done; restart. **Assert:** "Found orphaned sync"
  log; completed maps not reprocessed; the same run record completes with cumulative totals.

### E. Bidirectional, write‑back & conflict  → A2,A3,D1‑D4,F1  `[write]`
- **T‑E1 Push create/update** — create a **test‑marked** MJ record → push. **Assert:** HubSpot receives it
  (re‑fetch confirms); `Direction='Push'` watermark advances; map row links the new ExternalID; pull dedups.
- **T‑E2 3‑way merge** — sync (snapshot saved); change field A in MJ + field B in HubSpot; push. **Assert:**
  HubSpot gets **only** A; B preserved; both‑change‑same → no push (converged). `LastSyncedSnapshot` is the ancestor.
- **T‑E3 Conflict policies** — edit the **same** field on both sides; run with each policy. **Assert:**
  MostRecent → later timestamp wins; SourceWins/DestWins → the named side; Manual → `SyncStatus='Conflict'` +
  structured event, record skipped. PUSH_SKIPPED surfaced on a forced 403.
- **T‑E4 Cleanup** — delete every test‑created HubSpot record by captured ExternalID; verify 0 remain.

### F. Deletes & tombstoning  → E1‑E4  `[write]` (delete only test‑created records; **never Users**)
- **T‑F1 Orphan soft‑delete** — full sync; archive/delete a **test‑created** record in HubSpot; re‑sync.
  **Assert:** MJ row `__mj_integration_IsTombstoned=true` + `DeletedDetectedAt` in the run window; record‑map
  retained; `ORPHANS_DETECTED` warning with count; run stays Success.
- **T‑F2 DeleteBehavior** — configure SoftDelete vs HardDelete vs DoNothing on separate maps; delete externally;
  full sync. **Assert:** tombstoned / physically gone / untouched respectively.
- **T‑F3 Incremental delete detection** `[connector‑specific]` — archived‑record fetch marks `IsDeleted=true`.
  **Assert:** the deleted records flow through the delete pipeline on the incremental run. *(Caveat: be careful
  with HubSpot archive semantics — purge‑after‑retention, restore; flagged.)*

### G. DAG dependency ordering  → G1‑G3
- **T‑G1 Parent‑before‑child order** — sync contacts + companies + `assoc_contacts_companies`. **Assert (run
  timestamps):** each parent map finishes before the association map starts; association rows populate with
  both FK ids; counts ∝ real associations.
- **T‑G2 Contract warnings** — sync the association **without** parents → `ZERO_PARENTS` (Data: parentObjectName,
  parentRecordCount=0); a misconfigured cycle → `DEPENDENCY_LAYERING_DEGRADED`; both visible via `IntegrationGetRun.Warnings`,
  run still Success (not silently empty).

### H. Rate limiting & concurrency  → H1‑H3,I1‑I3
- **T‑H1 No‑over‑429 / no‑over‑slow** — drive a paged fetch; **assert:** median request spacing ≈ the connector's
  policy (e.g. ~100ms), 429 count stays low, throughput doesn't collapse regardless of the ceiling. Count
  `external.call.retry` events; confirm a 429 backs off (Retry‑After) and recovers (ramp).
- **T‑H2 Per‑credential isolation** — two CompanyIntegrations on HubSpot don't share a bucket (separate keys).
- **T‑H3 Per‑layer concurrency** — set syncConcurrency; **assert:** `peakInFlight <= MaxConcurrencyHint`; a 429
  halves the cap; a plain data (FK/validation) error does **not** halve it (failed++ only).

### I. Resilience / mid‑sync failure / infinite‑pagination  → M1,M2,K3 (extra grace work)
- **T‑I1 Injected fetch error mid‑sync** — **assert:** the run records a structured error, partial set is NOT
  used for orphan deletion (fetchCompletedCleanly=false), watermark/snapshot not advanced, next sync recovers.
- **T‑I2 Strategy rotation** — switch an object between watermark / content‑hash / keyset across runs; **assert**
  no data loss across the transition (the engine treats the prior snapshot/cursor safely).
- **T‑I3 Infinite‑pagination guard** — a connector returning the same batch / never advancing the cursor.
  **Assert:** the duplicate‑batch fingerprint guard + MAX_BATCHES cap stop it cleanly with a surfaced reason
  (no hang, no infinite loop); content‑hash keeps the wasted writes at zero.
- **T‑I4 Schema‑not‑generated** — sync an entity whose spCreate is absent. **Assert:** one entity‑level error,
  remaining records skipped, sync continues to the next map; CodeGen + re‑sync succeeds.
- **General grace:** every connector‑level failure yields **useful structured info** (codes, counts, stage) and
  never aborts the whole run silently — vital since many connectors will be published.

### J. Value handling (SQL Server + Postgres)  → L1,L2,I6
- **T‑J1 Type coercion** `[both‑dialects]` `[needs‑HS‑data]` — records with formatted numerics/booleans/dates,
  empty strings, and over‑length values. **Assert:** numerics/booleans/dates normalized; empty → null;
  over‑length truncated to column length **without splitting a surrogate pair**; **no SQL write error** on
  either dialect. *(Note the I6 cleanup: dialect‑driven coercion belongs in the SQL write layer.)*

### K. Generated Actions & agent invocation  → P2
- **T‑K1** Confirm the connector's objects produced **MJ Actions**. **Assert:** Action rows exist for the
  CRUD/sync operations; an agent (via MJ AI) can discover + invoke a generated Action and the call executes
  (observe the action‑execution log + result). *(Tests whether MJ AI lets us invoke agents against the
  generated actions.)*

---

## Saved for the morning (need data changes in HubSpot first — you offered to help)
T‑B2 (duplicate records), T‑B3 (assoc create), T‑C1 (modify N for incremental), T‑F1/F2/F3 (delete test
records), T‑J1 (edge‑value records), and any large‑volume case for keyset/Merkle (>10k same‑timestamp). I'll
provide the exact HubSpot API calls to seed these so cleanup is exact.

## Dual‑database replication
Run **Phase 0 + Phase 1 entirely on SQL Server first**, then **repeat the identical matrix on Postgres**
(a second MJAPI bound to the PG instance; `HS_LIVE_PLATFORM=postgresql`). The Postgres‑only assertions that
MUST hold: every DDL/DML op succeeds (J2 dual‑dialect SQL, J6 view‑drop‑before‑ALTER), every column that
lands on SQL Server lands on Postgres with the dialect‑correct type, and every sync/CRUD case produces the
same row counts + structured outcomes (correlate IDs with `UUIDsEqual` — SQL Server upper / PG lower).
The goal stated for this work: **everything — every sync, DDL AND DML — works on Postgres.**

## Result format (delivered tomorrow)
For each test: a row with `{ id, name, proves, status: pass|fail|blocked, dialect, summaryNLP, evidence }`
where `evidence` carries the **scrubbed JSON payloads** (the `IntegrationGetRun` result, the DB count rows,
the relevant `progress.jsonl` events) and `summaryNLP` is a plain‑English statement of what was observed. A
top‑level `summary.md` (what happened, per phase) accompanies a `results.json` (the machine payloads).

# Integration Framework — Testable Capabilities (what the HubSpot live test should prove)

Code-grounded inventory of what this branch (`feat/integration-framework-expansion`) added, framed by the
**observable signal** a black-box live test (drive the GraphQL API + read the DB) would check. Use this to
design the test. `NEW` = added on this branch; `pre` = pre-existing framework behavior.

## Discussion notes / corrections (from review)
- **Decision order is watermark-first.** A source's "modified-since" watermark is the PRIMARY incremental
  mechanism and is always used when one exists. content-hash, keyset, and partition/Merkle hash-diff are
  STRICTLY fallbacks for sources with no usable watermark. Order: (1) watermark → only *fetch* changed;
  (2) no watermark → content-hash → only *write* changed; (3) no watermark + large → keyset (resumable seek
  scan) + partition-diff (skip unchanged batches).
- **content-hash vs Merkle:** content-hash is per-record write-skip (WIRED, working). Merkle/partition-diff
  is the *batch* version — one rollup comparison skips a whole partition, zoom in only where it differs;
  it is BUILT (HashDiff module) but NOT yet wired as an active sync mode. Don't assert Merkle is live yet.
- **identity+index vs content-hash:** different keys, they compose. Identity `(CompanyIntegration, Entity,
  ExternalSystemRecordID)` + unique index = *who* the record is → dedup (one map per external record) + fast
  row lookup. content-hash = *what* it contains → did it change. The index finds the row; the hash decides
  write-or-skip. Dedup = identity; change-detection = hash (never the reverse).
- **Two capabilities to ADD to the list below:** (a) **generated Actions** — the connector auto-generates MJ
  Actions for its objects so they're callable by agents/workflows; (b) **metadata refresh** — re-introspect a
  live connection and persist new/changed objects + fields + re-classify soft PKs.
- **Per-record sync-metadata is the substrate, not a separate feature** — it's the storage (ancestor snapshot,
  external version, tombstone flags) that makes bidirectional merge + conflict + delete-tracking work.
- **Destination coercion belongs in the SQL-dialect write layer, not a connector hook.** Truncate-to-column,
  type-fit, empty→null depend on the *target* DB, so they should be driven by the dialect abstraction at
  runtime. Source-side normalization belongs in the Transform pipeline. The connector `PostProcessRecord`
  hook is the wrong home for dialect-dependent coercion — flagged for cleanup.
- **Completeness in production = observability, not counting the API.** The count-vs-API comparison is a TEST
  technique; in production the value is the structured per-run counts + warnings that tell you, loudly,
  whether a sync got everything.
- **Connector-agnostic framing:** every capability below is an *engine* change; the connector is only the
  vehicle. The lone connector-specific item is the 10k-search-cap re-anchor. Delete-detection semantics
  (archived-record handling, purge/restore edge cases) are also per-connector and need per-connector care.
- **Postgres is the #1 test axis:** everything — every sync, DDL AND DML, in every Integrations case — must
  work on Postgres. Prove the full matrix on Postgres; SQL Server is the parity check.

## The headline new capabilities (plain language)
1. **Real bidirectional sync** — pushes MJ changes back to HubSpot with a true **3-way field-level merge**
   (ancestor snapshot vs MJ edits vs live external record); concurrent edits on both sides reconcile
   field-by-field instead of one side blindly overwriting.
2. **Conflict resolution policy** — SourceWins / DestWins / MostRecent / Manual; Manual conflicts are
   quarantined (`SyncStatus='Conflict'`) and surfaced, not silently lost.
3. **Correct-at-scale, no-watermark sync** — content-hash skip-unchanged, Merkle-style partition hash-diff,
   keyset checkpoint-resume robust to mid-stream insert/delete, and HubSpot's **10k-search-cap re-anchoring**
   that **loud-fails** rather than silently losing records.
4. **Per-credential adaptive rate limiting + per-layer AIMD concurrency** — backs off only on real 429s (not
   data errors), ramps toward each connector's ceiling, batch writes; two clients on one vendor no longer
   share a throttle budget.
5. **DAG-layered sync** — parents before children/associations automatically, with explicit
   `ZERO_PARENTS` / `SECOND_LAYER_EMPTY` / `DEPENDENCY_LAYERING_DEGRADED` warnings instead of silently-empty
   association tables.
6. **Soft-delete / tombstone lifecycle** — full-sync orphan detection marks upstream-deleted records
   (`IsTombstoned` + `DeletedDetectedAt`) per a configurable `DeleteBehavior`; HubSpot archived-record fetch
   detects deletes incrementally.
7. **11-column per-record integration sync-metadata** on every synced row (sync status, last-synced snapshot for
   merge, external version/OCC, last-writer-direction, tombstone, reconcile/delete timestamps) — the
   substrate that makes change-detection, conflict merge, and delete-tracking observable in the DB.
8. **Full dual-dialect (SQL Server + Postgres) schema creation AND evolution** — soft PK/FK, bounded typing
   (no blanket NVARCHAR(MAX)), legacy-table standard-column backfill, and the Postgres view-drop-before-ALTER
   fix that survives the dollar-aware migration chunker.
9. **RSU schema pipeline** (migration → CodeGen → compile → restart → git) reports exactly which integration
   entities CodeGen created vs skipped and why.
10. **Complete GraphQL lifecycle surface + durable run artifacts** (manifest/progress.jsonl/result),
    queryable via `IntegrationListRuns/GetRun/TailRunEvents`, pushed live via the `IntegrationProgress`
    subscription, all row-level authed.
11. **Type-driven PostProcessRecord hook** — coerces empties→null, normalizes numerics/booleans/dates,
    truncates over-length strings (surrogate-pair-aware) after transform, before write.

## Testable capabilities → observable signal → suggested assertion

### Completeness  (does ALL data land?)
- **Full pull materializes every record** [NEW] — `COUNT(*) [hubspot].[Contact]` == HubSpot total;
  every row's `__mj_integration_LastSyncedAt` in the run window.
- **Counts reconcile** [NEW] — `IntegrationGetRun.Counts {Processed,Succeeded,Failed,Skipped}`,
  `processed == succeeded+failed+skipped`; `CompanyIntegrationRun.TotalRecords == succeeded` on a clean pull.
- **Object catalog** [NEW] — `IntegrationListSourceObjects` returns 130+ objects with `AlreadyPersisted` +
  `IntegrationObjectID`; aligns with `COUNT(*) IntegrationObject`.

### Identity / Record-maps  (1:1, no dups)
- **Idempotent upsert-by-triple** [NEW] — sync twice → exactly **one** `CompanyIntegrationRecordMap` row per
  `(CompanyIntegrationID, EntityID, ExternalSystemRecordID)`; `COUNT(DISTINCT EntityRecordID)` for an external id == 1.
- **hs_object_id synthetic PK** [pre] — `ExternalID` stable across fetches; `IntegrationObjectField` for
  `hs_object_id` has IsPrimaryKey/IsUniqueKey/IsReadOnly = 1.
- **Composite PK for associations** [NEW] — `assoc_contacts_companies` ExternalID `'100|200'`, flattened to
  `{contact_id, company_id, association_type}`; 3 fields, 2 PK.
- **Create/Update/Skip/Delete classification** [NEW] — `sync.record.decision` ChangeType per match path.

### Incremental / Watermark
- **Timestamp watermark advance** [NEW] — `CompanyIntegrationSyncWatermark.WatermarkType='Timestamp'`,
  value advances; HubSpot issues a `search` GTE filter (not a full list); no-change re-run → 0 fetched.
- **Full-vs-incremental + fullSyncEvery cadence** [NEW] — every Nth run fires orphan detection
  (`ORPHANS_DETECTED`); `FullSync=true` overrides cadence.

### Keyset / Scale
- **Keyset checkpoint-resume** [NEW] — `WatermarkType='Cursor'` holds last AfterKey on interrupt, null on
  clean scan; resume → no dup, no gap straddling the cursor; `sync.resume.keyset` event.
- **HubSpot 10k re-anchoring** [NEW] — >10k same-date → log "keyset-paginating by (dateField, hs_object_id)",
  all records land; stall with no anchor → **thrown** "cannot advance without risking silent record loss".
- **25-batch durable checkpoint** [pre] — `progress.jsonl` checkpoint every 25 batches; restart re-fetches
  only from the last checkpoint.

### Content-hash
- **Skip-unchanged** [NEW] — `__mj_integration_ContentHash` = 64-hex; 2nd no-change sync → RecordsSkipped == total, 0 writes.
- **Partition hash-diff / Merkle** [NEW] — `diffPartitions` returns only changed partition keys; rollup
  invariant to record order.

### Deletes / Tombstone
- **Orphan soft-delete** [NEW] — `__mj_integration_IsTombstoned=true` + `DeletedDetectedAt`; record-map row
  retained; `ORPHANS_DETECTED` warning with count.
- **DeleteBehavior policy** [NEW] — SoftDelete (tombstone) / HardDelete (row gone) / DoNothing (untouched).
- **HubSpot archived detection** [NEW] — `archived:true` search appends `IsDeleted=true` records → tombstoned.

### Per-record sync-metadata
- **11 `__mj_integration_*` columns populated** [NEW] — incl. `LastSyncedSnapshot` (JSON ancestor for merge),
  `ExternalVersion` (OCC), `LastWriterDirection='Pull'`.

### Push / Bidirectional / Conflict  (the highest-risk NEW surface — needs writes)
- **Push CRUD** [NEW] — external receives Create/Update/Delete; `Direction='Push'` watermark advances.
- **Bidirectional** [NEW] — Pull then Push on one map; both watermark rows exist.
- **3-way field-level merge** [NEW] — only MJ-changed fields pushed; external-only changes preserved;
  both-changed-same converges (no push).
- **Conflict policy** [NEW] — MostRecent compares `__mj_UpdatedAt` vs external ModifiedAt; Manual →
  `SyncStatus='Conflict'` + event.
- **PUSH_SKIPPED warnings** [NEW] — 403/unsupported/empty-merge surfaced with statusCode, not silent.

### Associations / DAG
- **DAG layering** [NEW] — parents finish (timestamp) before children/associations start.
- **ZERO_PARENTS / SECOND_LAYER_EMPTY / DEPENDENCY_LAYERING_DEGRADED** [NEW] — explicit on empty-child / cycle.
- **v4 batch/read flatten** [NEW] — parent ids from local DB → flat left/right/type rows.

### Rate-limiting
- **Per-CompanyIntegration token-bucket AIMD** [NEW] — 429 cuts rate + freezes for Retry-After, success ramps;
  two CIs don't share a bucket.
- **Connector rate contract** [NEW] — HubSpot `RateLimitPolicy` (~10/s, burst 100), `ExtractRetryAfterMs`
  (429→10s, undefined for FK/validation), `MaxConcurrencyHint=4`.
- **Adaptive per-layer concurrency** [NEW] — halves only on throttle (not data errors); `peakInFlight<=hint`.
- **Batch writes** [NEW] — network calls ≈ records/batchSize; partial-batch failure isolates the bad record.

### Schema / DDL / Dual-dialect
- **CREATE TABLE + 11 standard columns + soft PK (UNIQUE, no native PK)** [NEW] — both dialects; idempotent re-run.
- **Dual-dialect SQL** [NEW] — MSSQL [brackets]/NVARCHAR/DATETIMEOFFSET/BIT vs PG "quotes"/VARCHAR/TIMESTAMPTZ/BOOLEAN; no cross-contamination; bounded typing.
- **Schema evolution** [NEW] — added cols → ALTER ADD; removed → DEPRECATED comment (never DROP).
- **Standard-column backfill** [NEW] — `EnsureStandardColumns` ALTER-ADDs missing of the 11 on legacy tables.
- **Postgres Bug 5a** [NEW] — `DO $mj_dropviews$ … $mj_dropviews$` before ALTER TYPE; survives the $-aware chunker.
- **Access gate** [NEW] — `__mj` writes require `IntegrationWriteAllowed=true` or BuildSchema errors.
- **RSU EntitiesCreated/NotCreated(reason)** [NEW] — per-entity CodeGen outcome.
- **Schema-not-generated fail-fast** [NEW] — one entity-level error, rest skipped, sync continues.

### Type-coercion / Batched-atomicity / Resilience / Emissions
- **Type coercion + safe truncation** [NEW] — ''→null, normalized numerics/bools/dates, surrogate-safe truncation.
- **PostProcessRecord hook** [NEW] — once per record, after transform, before write.
- **Batched atomicity (≤500)** [NEW] — batch error rolls back all 500, no partial writes.
- **Resume orphaned runs on restart** [NEW] — only incomplete maps resume; same run record, no dup creation.
- **Durable artifacts** [NEW] — manifest/progress.jsonl(monotonic seq)/result.json survive restart.
- **Run-query GQL + subscription** [NEW] — ListRuns/GetRun/TailRunEvents(sinceSeq) + IntegrationProgress WS, row-authed.
- **Structured SyncWarnings aggregated** [NEW] — codes in result.json + GQL Warnings; run stays Success.

## Decisions that are yours (let's discuss before I build)
1. **Direction/depth** — Pull only, or also Push + Bidirectional? (The 3-way merge + conflict policies are the
   highest-risk NEW capabilities and can ONLY be proven with writes to HubSpot.)
2. **Objects** — a representative slice (contacts + companies + deals + assoc_contacts_companies proves DAG +
   associations + sync-metadata), or the full 130+ catalog?
3. **Scale** — keyset 10k re-anchor + checkpoint-resume need >10k records (same-timestamp) + a killed run. Build
   such a dataset, or prove keyset/resume at unit level + prove the rest live?
4. **Deletes** — OK to delete real HubSpot records to observe tombstoning? Which DeleteBehavior?
5. **Rate-limit** — drive real 429s (burns quota/time) or assert the contract + spacing under normal load?
6. **Dialect** — SQL Server, Postgres, or both? (Dual-dialect DDL + Bug 5a only observable on the matching backend.)
7. **RSU restart** — real restart+git (`skipRestart=false`) or `skipRestart=true` to keep the session stable?
8. **"Believable"** — DB assertions (counts, sync-metadata, watermarks, tombstones) / GQL artifacts (Counts, Warnings,
   ExitReason) / live write-back verification against the HubSpot API — which combination earns your trust?

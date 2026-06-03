# Integration Framework — Itemized List of Everything Added

Every discrete addition on `feat/integration-framework-expansion`, numbered for reference (say "test J4").
All items are **engine / framework** changes (connector-agnostic) unless marked **[connector-specific]**.
Status flags: **NEW** = added this branch · **pre** = pre-existing · **WIRED** = active in the live sync path ·
**BUILT** = code exists but not yet wired into a live path.

---

## A. Sync directions & modes
- **A1** Pull sync (external → MJ). pre/WIRED.
- **A2** Push sync (MJ → external): detects MJ-side changes since a push watermark, issues Create/Update/Delete. **NEW/WIRED.**
- **A3** Bidirectional sync (pull then push on the same entity map; separate Pull + Push watermark rows). **NEW/WIRED.**
- **A4** Full vs incremental selection per run (FullSync flag). NEW/WIRED.
- **A5** Scheduled periodic full reconcile via `Configuration.fullSyncEvery=N` (every Nth run is a full sync). **NEW/WIRED.**

## B. Change detection & efficiency (decision order: watermark first, rest are fallbacks)
- **B1** Timestamp **watermark** incremental — only fetch records modified since the stored value; watermark advances each run. **PRIMARY.** NEW/WIRED.
- **B2** Watermark fallback-save — even an empty/modstamp-less clean fetch writes a watermark row (stops re-scanning empty objects). NEW/WIRED.
- **B3** **content-hash** skip-unchanged — when no watermark, fetch all but skip the DB *write* for records whose content hash is unchanged (`__mj_integration_ContentHash`, SHA-256). **NEW/WIRED.**
- **B4** **Partition / Merkle hash-diff** — batch version of B3: bucket by stable identity, fold each bucket's content hashes into an order-independent rollup, diff vs last sync's snapshot (stored on the watermark record, `WatermarkType='ChangeToken'`), deep-apply ONLY changed/added partitions. `fullSync` re-applies all (drift repair). Opt-in via entity-map `Configuration.partitionReconcile` (GQL-set). Orphan sweep over the full fetched-id set still catches deletes. **NEW/WIRED (opt-in; buffers the full set in RAM — for watermark-less small/medium objects).**
- **B5** **Keyset / seek resume** — large/no-watermark scans page by `WHERE <stableKey> > AfterKey ORDER BY <stableKey>`; robust to mid-stream insert/delete. **NEW/WIRED-as-mechanism, opt-in per connector (dormant until a connector declares StableOrderingKey).**
- **B6** Keyset checkpoint-resume across restart — interrupted scan persists its AfterKey to a `WatermarkType='Cursor'` row; clean scan clears it; next run resumes with no gap/overlap. **NEW/WIRED (engine), opt-in.**
- **B7** Durable mid-sync checkpoint every 25 batches (afterKey + watermark + batchIndex) to `progress.jsonl`. NEW/WIRED.

## C. Identity & idempotency
- **C1** Idempotent **upsert-by-identity-triple** `(CompanyIntegrationID, EntityID, ExternalSystemRecordID)` — re-sync never makes a duplicate MJ row or duplicate record-map row. NEW/WIRED.
- **C2** **Identity unique index** on that triple — DB-level dedup + O(log n) per-record lookup (vs O(n) scan). **NEW — ships as a migration (you apply).**
- **C3** Record-classification: key-field match → record-map triple → Create / Update / Skip / Delete decision. NEW/WIRED.
- **C4** **Synthetic content-hash PK** — records with no usable PK get a stable content-derived ExternalID (requires all composite-key parts present). NEW/WIRED.
- **C5** **Composite PK for association/junction objects** — `left|right` ExternalID, flattened to `{left_id, right_id, type}`. NEW/WIRED.

## D. Bidirectional merge & conflict
- **D1** **3-way field-level merge** on push — ancestor snapshot vs MJ vs external, per field; push only MJ-changed fields, never clobber external-only changes. **NEW/WIRED.**
- **D2** Conflict detection — same field changed on both sides since the ancestor. NEW/WIRED.
- **D3** Conflict-resolution policy — **SourceWins / DestWins / MostRecent / Manual** (Manual quarantines: `SyncStatus='Conflict'` + event). NEW/WIRED.
- **D4** **PUSH_SKIPPED** structured warning — push silent-skips (403, unsupported op, empty merge) surfaced with statusCode/operation/reason, not silent counter bumps. NEW/WIRED.

## E. Deletes & tombstoning
- **E1** Orphan detection on full sync — records absent from the source set are detected; **ORPHANS_DETECTED** warning with count; only on a *clean* full fetch (never on a partial). NEW/WIRED.
- **E2** Soft-delete / **tombstone** — sets `__mj_integration_IsTombstoned=true` + `DeletedDetectedAt`; record-map retained. NEW/WIRED.
- **E3** **DeleteBehavior** policy per entity map — SoftDelete / DoNothing / HardDelete. NEW/WIRED.
- **E4** Incremental delete detection **[connector-specific]** — e.g. an "archived records" fetch marking `IsDeleted=true` on the final incremental page → routed through the delete pipeline. NEW/WIRED. (Per-connector caveats: purge-after-retention, restore/un-archive, separate pagination.)

## F. Per-record sync-state columns (the substrate for B/C/D/E)
- **F1** Standard sync-state columns written on every create/update: SyncStatus, LastSyncedAt, **LastSyncedSnapshot** (JSON ancestor for D1), **ExternalVersion** (OCC), LastSeenModifiedValue, LastReconciledAt, **LastWriterDirection**, **IsTombstoned**, **DeletedDetectedAt**, plus ContentHash (B3) — **11 `__mj_integration_*` columns total** (6 new this branch). NEW/WIRED.

## G. Associations & DAG ordering
- **G1** **DAG dependency layering** — parents sync before children/associations; maps within a layer run concurrently, layers sequential. NEW/WIRED.
- **G2** Dependency-degradation + empty-child warnings: **ZERO_PARENTS**, **SECOND_LAYER_EMPTY**, **DEPENDENCY_LAYERING_DEGRADED** (cycle/flat fallback). NEW/WIRED.
- **G3** Association fetch flattening **[connector-specific]** — parent IDs sourced from the local DB, batch-read results flattened to flat left/right/type rows. NEW/WIRED.

## H. Rate limiting & concurrency
- **H1** **Per-CompanyIntegration token-bucket AIMD rate limiter** — keyed per credential (two clients on one vendor don't share a budget); 429 multiplicatively cuts + freezes for Retry-After, success additively ramps. **NEW/WIRED.**
- **H2** **Adaptive per-layer concurrency (AIMD)** — ramps toward the connector's MaxConcurrencyHint; halves only on throttle, NOT on plain data errors; parks on macrotasks. NEW/WIRED.
- **H3** Rate outcome fed from both fetch and push CRUD calls. NEW/WIRED.

## I. Composable connector contract (additive getters/methods on the base connector)
- **I1** `RateLimitPolicy` (TokensPerSec / Burst / backoff). NEW.
- **I2** `ExtractRetryAfterMs(error)` — positive ms only for throttles, undefined for FK/validation errors. NEW.
- **I3** `MaxConcurrencyHint`. NEW.
- **I4** `StableOrderingKey(object)` — opt-in keyset (enables B5/B6). NEW.
- **I5** `SupportsBatchWrite` + `BatchCreate/BatchUpdate/BatchDeleteRecords` — default single-record loop. **NEW/WIRED (default loop); batch path BUILT, used only if a connector opts in.**
- **I6** `PostProcessRecord(record)` — per-record hook. NEW/WIRED. **(Flagged for cleanup: dialect-dependent coercion should move to the SQL-dialect write layer; source normalization to Transform.)**
- **I7** `FetchContext.AfterKeyValue` + `FetchBatchResult.NextAfterKeyValue` (keyset threading) + `FetchBatchResult.Warnings` (connector → structured warning). NEW/WIRED.

## J. Schema creation, evolution & dual-dialect
- **J1** **CREATE TABLE** for a discovered object with a **soft PK** (UNIQUE constraint, no native PRIMARY KEY) + the 11 standard columns. NEW/WIRED.
- **J2** **Dual-dialect DDL** — SQL Server (`[brackets]`, NVARCHAR, DATETIMEOFFSET, BIT, IF OBJECT_ID, GO) vs Postgres (`"quotes"`, VARCHAR/TEXT, TIMESTAMPTZ, BOOLEAN, IF NOT EXISTS); no cross-contamination. **NEW/WIRED.**
- **J3** **Generous bounded typing** — string columns sized in [255, 4000] / MAX|TEXT from observed data, never blanket NVARCHAR(MAX). NEW/WIRED.
- **J4** **Schema evolution** on re-sync — new fields → ALTER ADD; type/nullability change → ALTER; removed field → DEPRECATED comment only (never DROP, no data loss). NEW/WIRED.
- **J5** **Standard-column backfill** (EnsureStandardColumns) — ALTER-ADDs any of the 11 missing from a legacy table. NEW/WIRED.
- **J6** **Postgres view-drop-before-ALTER** (Bug 5a) — `DO $mj_dropviews$ … $mj_dropviews$` drops dependent views via pg_depend before ALTER COLUMN TYPE; survives the **$-aware statement chunker** (`splitSqlStatementsDollarAware`). **NEW/WIRED (Postgres).**
- **J7** Soft PK / soft FK emitted to `additionalSchemaInfo` (not DB constraints) + preserved through evolution. NEW/WIRED.
- **J8** Access gate — writes to the `__mj` schema require an `IntegrationWriteAllowed=true` setting or BuildSchema fails before producing a migration. NEW/WIRED.

## K. RSU schema pipeline (runtime schema update)
- **K1** End-to-end pipeline: migration → DDL apply → CodeGen → compile → (optional restart) → (optional git commit). NEW/WIRED.
- **K2** **EntitiesCreated / EntitiesNotCreated(reason)** report — which integration entities CodeGen made vs skipped and why (e.g. "no primary key"). NEW/WIRED.
- **K3** Schema-not-generated fail-fast — missing spCreate/spUpdate → one entity-level error, remaining records skipped, sync continues to the next map (no per-record spam). NEW/WIRED.

## L. Value handling
- **L1** Type coercion / normalization — empty-string/NaN/Infinity → null; numeric/boolean/date strings normalized. NEW/WIRED. **(See I6 cleanup note: belongs in Transform + dialect write layer.)**
- **L2** Safe field truncation to target column length — surrogate-pair-aware (won't split a UTF-16 char). NEW/WIRED. **(Dialect-driven — belongs in the SQL write layer.)**
- **L3** Batched atomicity — ≤500-record batches; a batch error rolls back the whole batch (all reported errored, no partial writes); good batches commit atomically. NEW/WIRED.

## M. Resilience & resume
- **M1** Resume orphaned runs on process restart — only incomplete entity maps resume, using the existing run record (no duplicate creation, no watermark re-scan). NEW/WIRED.
- **M2** Abort/cancel — CancelSync aborts after the current batch; run Status='Cancelled'. pre/WIRED.

## N. Structured output (the primary way we observe + test)
- **N1** Durable run artifacts per run: `manifest.json` + `progress.jsonl` (one JSON/line, strictly monotonic `seq`) + `result.json` (success, exitReason, durationMs, aggregateCounts, warnings) — survive an MJAPI restart. **NEW/WIRED.**
- **N2** GraphQL run-query surface: **IntegrationListRuns / IntegrationGetRun / IntegrationTailRunEvents(sinceSeq)** — counts, warnings, exitReason, checkpoints, retry events; row-level auth. **NEW/WIRED.**
- **N3** Live GraphQL **subscription** `IntegrationProgress` — pushes events filtered by runID / companyIntegrationID / topic over PubSub. NEW/WIRED.
- **N4** **Structured SyncWarning codes** aggregated into the run result: ZERO_PARENTS, SECOND_LAYER_EMPTY, DEPENDENCY_LAYERING_DEGRADED, ORPHANS_DETECTED, PUSH_SKIPPED. Warnings never flip the run to failed. NEW/WIRED.
- **N5** Live in-memory progress snapshot: **IntegrationGetSyncProgress** (entity-maps done/total, records created/updated/errored, elapsed). NEW/WIRED.
- **N6** Aggregate counts reconcile: `processed == succeeded + failed + skipped`; mirrored to GQL + `CompanyIntegrationRun.TotalRecords`. NEW/WIRED.

## O. Lifecycle GraphQL operations
- **O1** **IntegrationCreateConnection** — creates CompanyIntegration + **encrypted** Credential; optional auto schema-refresh (ObjectsCreated/FieldsCreated/PKVerdicts). NEW/WIRED.
- **O2** **IntegrationListSourceObjects** — full catalog with AlreadyPersisted + IntegrationObjectID (single cheap describe). NEW/WIRED.
- **O3** **IntegrationApplyAll / ApplySchema / CreateEntityMaps** — stand up tables + entity/field maps. NEW/WIRED.
- **O4** **IntegrationStartSync** (pull/push/bidirectional, fullSync, entityMapIDs scope). NEW/WIRED.
- **O5** **IntegrationWriteRecord** — single-record create/update/delete to the external system. NEW/WIRED.
- **O6** **IntegrationListEntityMaps / ListFieldMaps**, status queries. NEW/WIRED.
- **O7** **IntegrationDeleteEntityMaps / DeleteConnection** — transactional cascade cleanup. NEW/WIRED.

## P. Discovery, metadata & generated actions
- **P1** **Metadata refresh** — re-introspect a live connection and persist new/changed objects + fields; re-run soft-PK classification (`IntegrationRefreshConnectorSchema` / the creation pipeline). **NEW/WIRED.** *(was missing from the earlier list)*
- **P2** **Generated Actions** — the connector auto-generates MJ Actions for its objects so they're callable by agents/workflows. **NEW.** *(was missing from the earlier list)*
- **P3** Soft-PK classifier — classifies a probable PK per discovered object with confidence/strategy; emits structured `pk.classifier.result` events; canonical field types persisted. NEW/WIRED.
- **P4** Discovered objects/fields persisted to IntegrationObject / IntegrationObjectField with IsCustom/MetadataSource flags (static-provable vs runtime-discovered). NEW/WIRED.

## Q. Connector implementations (the vehicles — connector-specific)
- **Q1** HubSpot connector: 130-object catalog (CRM / non-CRM / ~31 associations), v4 association batch/read, FetchChanges routing (full-load / search-incremental / non-CRM / association). **[connector-specific] NEW.**
- **Q2** HubSpot **10k-search-cap keyset re-anchor** — applies the engine keyset mechanism (B5) to HubSpot's 10k search window; loud-fails rather than silently losing records. **[connector-specific] NEW/WIRED.**
- **Q3** HubSpot §7 overrides: RateLimitPolicy, ExtractRetryAfterMs, MaxConcurrencyHint. **[connector-specific] NEW.**
- **Q4** ~24 other connectors slot into the new contract (backwards-compatible defaults); 8 enriched. **[connector-specific] NEW.**

---

### Quick "what to test" anchors
- **Completeness:** A1, B1, N6, E1.
- **Identity/no-dupes:** C1, C2, C5.
- **Incremental efficiency:** B1, B3 (and B4/B5/B6 as fallbacks/scale).
- **Bidirectional/conflict (highest-risk new surface, needs writes):** A2, A3, D1–D4, F1.
- **Deletes:** E1–E4.
- **Associations/ordering:** G1–G3.
- **Rate/concurrency:** H1–H3, I1–I3.
- **Schema (Postgres = #1 axis):** J1–J8, K1–K3 — every DDL/DML case on Postgres.
- **Observability (how we watch all of it):** N1–N6.
- **Discovery/actions:** O1–O2, P1–P4.

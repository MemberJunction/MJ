# @memberjunction/integration-schema-builder

## 5.43.0

### Patch Changes

- b98366b: Integration framework hardening for wide-catalog and multi-level connectors (extracted from the 20-connector close-out; no connector-specific code).
  - **Wide-table safety (dialect-driven in-row size + column-count limits).** The row-size knowledge now lives in the dialect abstraction, not in platform string-branching: `SQLDialect` gains `MaxInRowSizeBytes` (SQL Server `8060`, PostgreSQL `null`), `MaxColumnCount` (SQL Server `1024`, PostgreSQL `1600`), and `EstimateInRowBytes(rawSqlType)` (SQL Server's per-type in-row footprint; base default a conservative off-row pointer). `SchemaBuilder` consumes these via `GetDialect()` — for a dialect with a hard in-row limit it keeps all primary-key columns + a declared-priority core subset within budget, defers the rest (they still sync and land in `__mj_integration_CustomOverflow`), and emits a structured warning instead of shipping a table that fails every `INSERT` with `Cannot create a row of size … greater than 8060`; a dialect with no in-row limit (PostgreSQL/TOAST) only gets a soft advisory near its column-count cap. `IntegrationEngine` adds an env-clamped per-table column ceiling (`MJ_INTEGRATION_MAX_COLUMNS_PER_TABLE`, max 1000 = SQL Server's 1024 minus framework column headroom) so column-count-driven failures degrade to a reversible auto-disable at apply time. Proven on netFORUM (wide objects 8/17 → 15/17, zero 8060 INSERT failures); 17 row-size unit tests.
  - **Multi-level template-var traversal.** `BaseRESTIntegrationConnector.ResolveParentForVar` adds a per-variable parent map (`Configuration.parentObjectNames` `{ "<var>": "<SiblingObject>" }`, with optional `parentObjectIDFieldNames`), checked before the existing single-valued `parentObjectName`. This lets a path with more than one template variable (e.g. `/events/{eventCode}/sessions/{sessionCode}/…`) resolve each variable to its own parent object instead of collapsing both to one parent and tripping the `PARENT_CYCLE` guard (→ 0 rows). Backward-compatible: connectors that declare no `parentObjectNames` are unaffected.
  - **Large-catalog ApplyAll performance.** `IntegrationDiscoveryResolver.createEntityAndFieldMaps` reuses the already-in-memory persisted field schema (built in Phase 1) instead of issuing a live per-object `DiscoverFields` describe in a sequential loop, and resolves the target entity via an `O(1)` `schema.table → EntityInfo` map instead of an `O(N²)` scan. This removes the per-object round-trips and ~millions of comparisons that pushed very large catalogs (e.g. Salesforce's ~1,695 objects) past the client timeout with zero maps created.

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [b98366b]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/sql-dialect@5.43.0
  - @memberjunction/integration-engine@5.43.0
  - @memberjunction/schema-engine@5.43.0

## 5.42.0

### Minor Changes

- 6ac8ca4: feat(integration): v2 integration framework + unified connector set (GrowthZone, OpenWater, ORCID, PropFuel, Path LMS)

  Consolidated integration-v2 work — framework hardening + five connectors — proven end-to-end via the
  GraphQL stand-up path (clean DB, CreateConnection → ApplyAll → StartSync) on SQL Server.

  **Integration core (`integration-engine`, `integration-engine-base`, `integration-schema-builder`):**
  - Deterministic §4 content-hash identity stamp for keyless rows (stable storage key + idempotent re-sync).
  - Door-before-child dependency ordering derived from soft-FK `parentObjectName`/`ReferencedType` — children
    land in one pass (no ZERO_PARENTS, no second-sync self-heal).
  - Adaptive rate-limit hooks (`RateLimitAcquire`/`Report`/`MaxConcurrency`) on `FetchContext`.
  - Shared `auth-helpers` (`OAuth2TokenManager`); `KeySerialization`/`RecordFlatten` committed (were
    imported-but-untracked — fresh clones could not build); `IntegrationEngineBase.SeedForTesting` for
    offline replay harnesses.

  **Schema correctness + sizing (`integration-engine`, `integration-schema-builder`):**
  - `json`/`text`/`array`/`object` and unsized strings map to `NVARCHAR(MAX)`/unbounded text instead of
    being collapsed to `nvarchar(255)` — a nested-array JSON or long field routinely exceeds 255 and was
    dropped at sync time (OpenWater `Program.rounds` went from **0** rows to all of them). Bounded scalar
    strings keep a small, space-efficient size (255 floor; declared length + headroom when the source
    reports one; PK strings capped at the dialect index-key limit). Soft-PK columns are emitted nullable.
  - String-overflow is **skip-and-surface** (`STRING_OVERFLOW_SKIPPED` SyncWarning via the new
    `StringOverflowError`), not truncate or fail-the-batch.
  - **Active-only materialization (phantom-skip):** `buildSourceSchemaFromPersistedRows` materializes only
    `Status='Active'` objects/fields — no empty phantom tables, no wasted per-entity CodeGen/advancedGen cost.

  **StartSync honesty (`server`):**
  - `IntegrationStartSync` no longer returns optimistic `{Success:true, RunID:null}` for fast/no-op syncs;
    it resolves the run by recency over a bounded poll (real `RunID`), and returns `Success:false` with a
    message when no run record appears.

  **Soft-PK config cache (`codegen-lib`):**
  - `RunInProcess` invalidates `ManageMetadataBase`'s soft-PK/FK config cache per in-process run — the
    path-keyed cache went stale in the long-lived MJAPI RSU CodeGen path ("No primary key found" → entity
    never created → 0 rows synced until restart). Deterministic; the CLI `Run()` path is unchanged.

  **Unified connector set (`integration-connectors`):**
  - **GrowthZone** — OAuth2, 38 objects, idempotency + probe-amended pagination metadata.
  - **OpenWater** — 25 objects, OpenAPI-complete.
  - **ORCID** — 12 per-record objects, public-API live-verified.
  - **PropFuel** — file-feed slice (rich REST API documented out-of-scope).
  - **Path LMS (Blue Sky eLearn)** — GraphQL Reporting API, pull-only; GraphQL over `/graphql`, two-step
    app-credential → bearer auth; credential-free discovery from the public SpectaQL schema (84 record
    types / 1175 fields); per-object `AccessPath` walks the 16 GraphQL query doors to leaf records;
    content-hash idempotency.
  - All five validated under the v2 architecture (RealityProbe / completeness-diff / T12 idempotency).

  **Migration + metadata (additive schema → minor):** ships forward migration(s) + integration metadata
  seeds; additive only — no column drops, narrowing, renames, or new required params — backward-compatible
  **minor** per the publish-then-no-breaking-changes policy.

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [6ac8ca4]
- Updated dependencies [6520bea]
- Updated dependencies [5ebf0e9]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
  - @memberjunction/core@5.42.0
  - @memberjunction/integration-engine@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/schema-engine@5.42.0
  - @memberjunction/sql-dialect@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/integration-engine@5.41.0
  - @memberjunction/schema-engine@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/integration-engine@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/global@5.40.2
- @memberjunction/schema-engine@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/integration-engine@5.40.1
  - @memberjunction/schema-engine@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
  - @memberjunction/core@5.40.0
  - @memberjunction/integration-engine@5.40.0
  - @memberjunction/schema-engine@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [a1e2776]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [ae74fd5]
- Updated dependencies [9bc2916]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/integration-engine@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/schema-engine@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/integration-engine@5.38.0
  - @memberjunction/schema-engine@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/integration-engine@5.37.0
  - @memberjunction/schema-engine@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core@5.36.0
  - @memberjunction/integration-engine@5.36.0
  - @memberjunction/schema-engine@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [c1f1cad]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/integration-engine@5.35.0
  - @memberjunction/schema-engine@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/integration-engine@5.34.1
  - @memberjunction/schema-engine@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/integration-engine@5.34.0
  - @memberjunction/schema-engine@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/integration-engine@5.33.0
  - @memberjunction/schema-engine@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/integration-engine@5.32.0
  - @memberjunction/schema-engine@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
- Updated dependencies [dfab537]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/integration-engine@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/schema-engine@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/integration-engine@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/schema-engine@5.30.1

## 5.30.0

### Patch Changes

- 9154ac7: feat(integration): Salesforce + Sage Intacct pipeline hardening

  **This is in-progress work — not ready to merge.** PR is open for incremental review and discussion.

  ### Sage Intacct connector
  - Range-chunked walk over `RECORDNO` for numeric-PK objects, replacing the previous PK-cursor strategy that silently dropped records when SI's natural scan order wasn't PK-ascending.
  - Upper-bound discovery via exponential probe so termination is exact (not heuristic).
  - Sub-range verification on every completed chunk (independent count of two halves must sum to the parent's count) to catch SI inconsistencies that would otherwise silently undercount.
  - Discovery-probe retry with backoff for transport-only errors; immediate fail-stop on SI API errors (permissions, schema, syntax).
  - `WHENMODIFIED` filter values normalized to SI's `MM/DD/YYYY HH:mm:ss` format — the engine sometimes passes ISO 8601 which SI rejects with `DL02000001`.
  - Bumped `DEFAULT_PAGE_SIZE` from 100 to 1000 (proven safe via probing); legacy single-pull path now hard-fails on full-page-no-resultId instead of silently dropping records via PK-cursor.

  ### Salesforce connector
  - Removed dead `queryLocator` member field. `if (this.queryLocator && ctx.CurrentCursor)` was always false (member never assigned), so every "next batch" call re-executed the original SOQL and returned the same first page until the engine's duplicate-batch guard aborted the entity. Continuation now uses `ctx.CurrentCursor` directly via `FetchNextPage`.
  - Per-batch dedup by `Id` for system metadata sObjects (TabDefinition, FormulaFunctionAllowedType) where SF returns multiple records sharing the placeholder Id `000000000000000AAA`. Drops are logged once per object instead of producing N per-record `UQ_<table>_PK` constraint violations.
  - Removed the over-aggressive `!obj.createable` filter on `isUserRelevantSObject`. Many SF objects are flagged non-createable but carry real customer data (rollups, attachment-link junctions, history-style records).
  - `BuildSOQLQuery` no longer emits `LIMIT batchSize` — that was silently capping every full result set at the page size. Pagination is via SF's native `done` / `nextRecordsUrl`.
  - Watermark comparison uses `>=` instead of `>` so records modified at exactly the watermark instant aren't dropped on the next sync.

  ### IntegrationEngine
  - New typed `SchemaNotGeneratedError` (and `detectSchemaNotGenerated` helper) — `CreateRecord`/`UpdateRecord` now detect the SQL Server `Could not find stored procedure` pattern, throw the typed error, and `ProcessPullSync` fail-stops the entire EntityMap with one `[CONFIGURATION_ERROR]` log line + remaining records marked skipped. Previously every record produced an identical per-record error, drowning sync reports in O(records) duplicates.

  ### Picker → ApplyAll resolver fixes (`IntegrationDiscoveryResolver`)
  - New `resolveSourceObjectsToNames` per-item ID/Name fallback resolver. The old `resolveSourceObjectNames` only honored the IDs path and silently discarded any selection that arrived with `SourceObjectName` only (typical for newly-discovered objects with no IntegrationObject row yet). Real-world impact: 1,156 picker selections were collapsing to 420 IntegrationObjects to 181 generated tables. `LogError` now fires on truly unresolvable selections.
  - `buildTargetConfigs` collects every silent skip into three buckets (`notInSchema`, `noFields`, `noPK`) and emits a single summary line per call: `[buildTargetConfigs summary] requested=X, accepted=Y, dropped=Z (...)`. Lossy stages in the pipeline are now greppable.

  ### SchemaEngine RSU pipeline
  - `executeMigration` chunks oversized migration SQL (>32KB) into batches of 25 statements per `ExecuteSQL` call. Salesforce-class schemas (1100+ tables) produce migrations with 17K+ ALTER TABLE statements as a single batch, which exceeded mssql's client request timeout (30s). Each chunk now resets the timeout clock.

  ### Other
  - `IntegrationSchemaSync` and `IntegrationApplyAllBatch` plumbing for filtered IntrospectSchema flow (Salesforce-only path that describes selected objects rather than a full-org probe).
  - Integration dashboard UI tweaks (connections page rendering for high-FK supertype entities).

- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [9154ac7]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
- Updated dependencies [216ddc3]
  - @memberjunction/core@5.30.0
  - @memberjunction/integration-engine@5.30.0
  - @memberjunction/schema-engine@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
  - @memberjunction/core@5.29.0
  - @memberjunction/schema-engine@5.29.0
  - @memberjunction/integration-engine@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- 1d62875: feat: bidirectional sync engine, HubSpot/YM connector improvements, RSU #2239 fixes
  - Integration engine now respects SyncDirection (Pull/Push/Bidirectional) on entity maps
  - Push sync uses Record Changes to detect MJ-side modifications, reverse-maps fields, and calls connector CRUD methods
  - Separate Push watermarks tracked alongside Pull watermarks
  - New IntegrationWriteRecord GraphQL mutation for ad-hoc writes to any connector
  - HubSpot: 130 objects with full field metadata; association CRUD via v4 PUT/DELETE API; composite hs_object_id for association sync
  - YourMembership: 228 objects with accurate PKs across all endpoints; 400 errors now surfaced (not silently swallowed); DateTime.MinValue → null conversion
  - SchemaBuilder logs DDL history to \_\_mj_integration.SchemaHistory (separate schema, not surfaced as MJ Application)
  - IntegrationObject.IsCustom column added to distinguish static vs runtime-discovered objects
  - RSU #2239: in-process SQL execution for CodeGen (no sqlcmd dependency)
  - RSU #2239: RSU_RESTART_COMMAND env var override for non-PM2 environments
  - SQLServerDataProvider: incremental schema sync improvements

- Updated dependencies [1d62875]
- Updated dependencies [115e4da]
  - @memberjunction/integration-engine@5.28.0
  - @memberjunction/schema-engine@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/integration-engine@5.27.1
  - @memberjunction/schema-engine@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/integration-engine@5.27.0
- @memberjunction/global@5.27.0
- @memberjunction/schema-engine@5.27.0

## 5.26.0

### Patch Changes

- @memberjunction/integration-engine@5.26.0
- @memberjunction/schema-engine@5.26.0
- @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- @memberjunction/integration-engine@5.25.0
- @memberjunction/schema-engine@5.25.0
- @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- @memberjunction/integration-engine@5.24.0
- @memberjunction/schema-engine@5.24.0
- @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
  - @memberjunction/global@5.23.0
  - @memberjunction/integration-engine@5.23.0
  - @memberjunction/schema-engine@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [f2a6bec]
  - @memberjunction/global@5.22.0
  - @memberjunction/integration-engine@5.22.0
  - @memberjunction/schema-engine@5.22.0

## 5.21.0

### Patch Changes

- @memberjunction/integration-engine@5.21.0
- @memberjunction/schema-engine@5.21.0
- @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- @memberjunction/integration-engine@5.20.0
- @memberjunction/schema-engine@5.20.0
- @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/integration-engine@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/schema-engine@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/integration-engine@5.18.0
- @memberjunction/schema-engine@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Minor Changes

- bbfbf5e: Runtime Schema Update (RSU) system with 32 integration lifecycle API endpoints, schema evolution, sync cancellation, watermark filtering, progress polling, and cascade delete fixes.

### Patch Changes

- Updated dependencies [bbfbf5e]
  - @memberjunction/schema-engine@5.17.0
  - @memberjunction/integration-engine@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- @memberjunction/integration-engine@5.16.0
- @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- @memberjunction/integration-engine@5.15.0
- @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/integration-engine@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
  - @memberjunction/global@5.13.0
  - @memberjunction/integration-engine@5.13.0

## 5.12.0

### Minor Changes

- 6f9350c: migration

### Patch Changes

- Updated dependencies [6f9350c]
- Updated dependencies [257512b]
  - @memberjunction/integration-engine@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- @memberjunction/integration-engine@5.11.0
- @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/integration-engine@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- @memberjunction/integration-engine@5.10.0
- @memberjunction/global@5.10.0

## 5.9.0

### Minor Changes

- 89b6abe: migration

### Patch Changes

- Updated dependencies [89b6abe]
- Updated dependencies [194ddf2]
  - @memberjunction/integration-engine@5.9.0
  - @memberjunction/global@5.9.0

## 5.8.0

### Patch Changes

- @memberjunction/integration-engine@5.8.0
- @memberjunction/global@5.8.0

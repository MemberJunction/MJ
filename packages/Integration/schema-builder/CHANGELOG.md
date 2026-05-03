# @memberjunction/integration-schema-builder

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

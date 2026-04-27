---
"@memberjunction/integration-connectors": minor
"@memberjunction/integration-engine": minor
"@memberjunction/integration-schema-builder": patch
"@memberjunction/server": patch
"@memberjunction/schema-engine": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ng-dashboards": patch
---

feat(integration): Salesforce + Sage Intacct pipeline hardening

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

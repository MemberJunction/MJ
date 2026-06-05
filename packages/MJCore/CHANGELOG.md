# Change Log - @memberjunction/core

## 5.39.0

### Minor Changes

- 361eb4c: Azure-safe principal creation in baseline emitter, plus a freshly-generated v5.38.x baseline (`B202605291452__v5.38.x__Baseline.sql`).
  - `emitPrincipals` now wraps cross-database `master.*` lookups inside `sp_executesql N'...'` string literals so Azure SQL's submission-time parser can't reject the batch. The `SERVERPROPERTY('EngineEdition') = 5` check sets `@associate = 1` on Azure, so the `master.dbo.syslogins` path never executes there — but only the dynamic-SQL wrapper prevents the parser from rejecting the batch before the IF can short-circuit it.
  - New emitter test (`keeps cross-DB references inside string literals (Azure-safe)`) strips quoted literals from the emitted SQL and asserts zero `master.*` references survive outside string literals — regressions surface immediately.
  - New v5.38.x baseline ships with the fix: 0 `master.*` refs outside string literals, 4 `sp_executesql` wrappers (one per SQL user), byte-equivalent to a V-stack-built source DB (0 object/row diffs across 46,432 rows). Previously published v5.34.x and v5.37.x baselines are intentionally untouched — Skyway auto-picks the latest baseline for fresh installs.

- f4bf584: feat(core): BaseEngineRegistry cross-engine cache reverse-lookup + `ExtendedType='Icon'`
  - **`BaseEngineRegistry.FindCachedEntity<T>(entityName, { unfilteredOnly? })`** and
    **`TryGetCachedRecords<T>(...)`** — let UI/code ask "is this entity already fully
    cached by a loaded `BaseEngine`?" and use the live array (favoring unfiltered,
    authoritative sets). Returns the engine, its property config, the live records, and
    whether the cache is unfiltered. Powers instant, DB-free dropdowns for cached entities.
  - **`EntityFieldInfo.ExtendedType`** (`EntityFieldExtendedType`) gains `'Icon'`, marking a
    field whose value is a FontAwesome class for per-row icon rendering.

- ae74fd5: Auto-detect and render Markdown/HTML in long-text form fields. `MjFormFieldComponent`
  now honors an explicit `EntityField.ExtendedType` (`Markdown`/`HTML`/`Code`) and, when it
  is null, runs lightweight client-side content detection on eligible long-text fields
  (TS-type string with `MaxLength >= 255` or unlimited — generic across SQL Server/PostgreSQL).
  Read mode renders `<mj-markdown>` for Markdown, DOMPurify-sanitized `[innerHTML]` for HTML
  (via the new `mjSafeRichHtml` pipe — see below), and a read-only `<mj-code-editor>` for code;
  edit mode uses `<mj-code-editor>` with syntax highlighting for non-plain modes (mode frozen at
  edit entry), while plain fields keep the existing textbox/textarea.

  Widens the `EntityFieldExtendedType` union and the `CK_EntityField_ExtendedType` CHECK
  constraint to include `Markdown` and `HTML` (migration included — run CodeGen after applying
  to regenerate `EntityFieldEntity` types and metadata).

  Adds a reusable, dependency-free `detectRichTextFormat(value, maxScanLength?)` text classifier
  to `@memberjunction/global` (defaults to scanning the first 500 characters) so any consumer can
  sniff Markdown/HTML/plain content.

  Adds reusable safe-HTML rendering to `@memberjunction/ng-shared-generic`: a `PurifyRichTextHtml()`
  function and an `mjSafeRichHtml` pure pipe backed by DOMPurify (HTML + SVG profiles). Unlike
  Angular's built-in `[innerHTML]` sanitizer (which strips all SVG and inline styles), this keeps
  safe inline SVG and richer markup while still removing `<script>`, `on*` handlers, and
  `javascript:`/`data:` URLs — so it's safe for untrusted content yet renders richer HTML. Any
  Angular component can use `[innerHTML]="value | mjSafeRichHtml"`.

- 9bc2916: feat(core): `EntitySaveOptions.OnValidated` — optimistic-UI render hook

  An optional callback on `BaseEntity.Save()` that fires after all pre-flight checks pass
  (`Validate`, `ValidateAsync`, PreSave hooks) but **before** the database write — the
  "render only once known-valid" moment for optimistic UI. Fires exactly once; skipped on
  not-dirty, failed validation, and `ReplayOnly` (which bypasses validation); a thrown
  callback is swallowed + logged so a UI bug can never abort the persist. `Save()`'s boolean
  return contract is unchanged, and there is no server-side behavior change.

- a101a34: Drop the SQL Server MS_Description extended property on ConversationDetailAttachment to the DEPRECATED notice text so R\_\_RefreshMetadata propagates it into Entity.Description on every migrate cycle — eliminating the drift that the metadata-sync file alone could not fix.

### Patch Changes

- 3c53858: feat(forms): inline "create new" from FK fields (event-based) + fold Allow\*API into entity permissions

  When the related record you need isn't in a foreign-key dropdown, you can now create it
  inline. A sticky "➕ Create …" footer (always visible at the bottom of the dropdown,
  prefilled with whatever you typed) requests creation; the new record is auto-selected into
  the field once saved. Gated on create permission + a new `@Input() AllowFKCreate` (default
  true); surface configurable via `@Input() FKCreatePresentation: 'dialog' | 'slide-in'`.

  **`@memberjunction/ng-base-forms`** — the Generic FK field stays generic: it only _emits_ a
  new `create-related` `FormNavigationEvent` (carrying the entity, prefill `NewRecordValues`,
  preferred presentation, provider, and a `Complete(record)` callback). It does **not** open
  the form itself — that would couple a generic component to the app-level form presenter.

  **`@memberjunction/ng-explorer-core`** — `SingleRecordComponent` handles the new
  `create-related` event: opens the related entity's form via `MJFormPresenterService`
  (dialog/slide-in, prefilled), then calls `event.Complete(savedRecord)` so the field selects it.

  **`@memberjunction/core`** — `EntityInfo.GetUserPermisions()` now folds the entity's
  `Allow{Create,Update,Delete}API` flags into the corresponding `Can*` results. An API-driven
  action requires both a role grant **and** the entity allowing that action at all, so a user
  can no longer be reported as able to create/update/delete records of an entity whose API for
  that action is disabled. (Read is unchanged — it has no `Allow*API` flag.)

- Updated dependencies [ae74fd5]
  - @memberjunction/global@5.39.0
  - @memberjunction/sql-dialect@5.39.0

## 5.38.0

### Minor Changes

- 748b2e7: Add deterministic baseline migration toolchain (`mj baseline build` / `compare` / `roundtrip`): introspects + emits the full MSSQL schema (tables, views, procedures, functions, triggers, UDTs, extended properties, database principals, role memberships, and object/schema/type/database permissions) with proven byte-equivalence via the row-by-row comparator. AUTO within-major rebaseline mode derives `Major.Minor` and a `latestV+1m` timestamp from the source migrations directory. Ships with workbench end-to-end script and a `/create-new-baseline-migration` slash-command driver.
- ce7d2f5: Fix non-idempotent metadata sync for `.your-membership.json`: three Integration Object Field records each shared a `primaryKey.ID` with another field in the same file (`OrderID`/`InvoiceID`, and two `Id`/`CampaignId` pairs), so `mj sync push` routed two distinct records to the same DB row and their sync blocks ping-ponged on every run. Reassigned a fresh unique `primaryKey.ID` to the duplicate (`IsPrimaryKey:false`) record in each pair so every field has its own identity. `mj sync push` matches records to rows solely by `primaryKey` (no natural-key fallback), so each record must carry a unique key to be idempotent.
- 6a3ac36: Fix AllowUpdateAPI clearing when EntityField transitions to virtual, use subqueries for organic key INSERTs for portable SQL, prevent permanent engine failure when MJAPI is temporarily unavailable, and centralize RLS exemption check in GetUserRowLevelSecurityWhereClause

### Patch Changes

- 4ee0b06: - `@memberjunction/core`: Add `deferredDelay` configuration parameter to `@RegisterForStartup` options, allowing background engine loading to be delayed by a specified duration in milliseconds.
  - `@memberjunction/aiengine`: Implement `IStartupSink` and annotate the server-side `AIEngine` with `@RegisterForStartup` as a deferred engine with a 15-second delay to automatically load metadata and pre-warm embedding models/vector caches in the background.
- 275afda: DBAutoDoc organic-key detection + PR #2193 per-column normalization:
  - **Organic-key detection phase** in DBAutoDoc's analyze pipeline (optional, off by default): prefilter → per-table LLM normalize (business-space descriptions + concept names + per-column normalization strategy + organic-key gate) → embed → agglomerative cluster → concept-name split → FK-graph transitive bridges → emit to `additionalSchemaInfo.json`. Runs on MemberJunction's AI infrastructure (`BaseLLM` / `BaseEmbeddings` via the ClassFactory), no standalone provider clients.
  - **Per-column normalization**: each emitted `EntityOrganicKey` carries its own normalization function for its column, so a cluster of differently-formatted columns (e.g. phone numbers across systems) each canonicalize to a shared form. Runtime (`EntityInfo.BuildOrganicKeyViewParams`) applies each side's own expression at match time, looking up the spoke entity's organic key by name.

- c0b40c0: `mj sync push` performance overhaul and a related `BaseEntity` fix for fixed-width string columns.

  Measured on a representative ~36,500-record `metadata/` tree (mostly idempotent, including a `metadata/integrations/` dir with 23,789 records):
  - Full sync (incl. integrations): ~6m 49s → **~1m 4s** (~6.5×)
  - Partial sync (excluding integrations): ~1m 37s → **~30.5s** (~3.2×)

  ### `@memberjunction/metadata-sync`
  - **`SyncMetadataEngine`** (new, extends `BaseEngine`) preloads every touched entity once via `BaseEngine.Load` and exposes the result through dynamic per-entity property slots that the sync path consults instead of round-tripping the DB per record. Preload is _unfiltered_ — metadata entities are bounded by design and loading all rows is faster than computing a giant `WHERE … IN (…)` clause, plus it lets `@lookup:` resolution hit the cache even for records not in local files. Oversize warning fires above 100,000 rows on any single entity.
  - **O(1) PK index** built after preload completes. Each per-entity slot is mirrored into a `Map<serializedPK, BaseEntity>`; `loadEntity` uses it for hash lookups instead of the previous `Array.find(... serializePrimaryKey(GetAll()))` scan. This was the single biggest fix — on `MJ: Integration Object Fields` the naïve scan was ~1.2B comparisons (~38 min); the Map drops it to seconds. Self-healing array-scan fallback handles drift from `BaseEngine` event-driven slot mutations.
  - **Resolved-lookup + file content caches**. Resolved `@lookup:` keys memoized in a per-entity-scoped `Map<lookupKey, ID>`; parsed `@include`-preprocessed file contents memoized and invalidated at every write site so multi-pass writes always see fresh contents.
  - **Skip preload for unresolved PK refs** (`@lookup:` / `@parent:` / `@root:` / `@file:` / `@env:` / `@template:`) — those values resolve later in the per-record path. Without this guard the preload would inline literal `@lookup:…` strings into a `WHERE ID = '…'` filter and SQL Server would reject the uniqueidentifier cast.
  - `SyncEngine.getProvider()` is now the single entry point for provider plumbing in cache and lookup writes — no more reaching for `Metadata.Provider` directly.

  ### `@memberjunction/core`, `@memberjunction/sql-dialect`

  Fixed-width / space-padded character types (`nchar`/`char` on SQL Server; `char`/`character`/`bpchar` on PostgreSQL) used to surface their storage padding through `BaseEntity.Get`, causing `Dirty` to compare `"Input     "` against `"Input"` and false-positive every record as dirty. Once preload populated the in-memory comparison this manifested as thousands of spurious "updates" per sync (~4,279 on `MJ: Action Params` alone).
  - New `IsFixedWidthStringSQLType` predicate in `@memberjunction/sql-dialect` plus an abstract `FixedWidthStringTypeNames` getter on `SQLDialect` so the list of fixed-width type names stays in one place per dialect.
  - New `EntityFieldInfo.FixedWidthColumn` getter delegating to the predicate.
  - `EntityField.Value` setter and `BaseEntity.Get` raw fast-path now rtrim string values when `FixedWidthColumn` is true, memoizing back into `_raw` so the trim runs at most once per field per record.

  The `BaseEntity` change is independent of MetadataSync but was exposed by the preload work and is required for the "Unchanged" counts in `mj sync` to be accurate.

- d5a51b3: Optimize metadata loading and caching performance in MJCore:
  - Group fields, values, permissions, settings, and organic keys in `PostProcessEntityMetadata` using pre-indexed Maps, reducing the linking phase from `O(N × M)` to `O(N + M)`.
  - Pre-index batch results in `executeSmartCacheCheck` for direct Map lookups, reducing per-batch lookup cost from `O(N²)` to `O(N)`.
  - `InvalidateEntityCaches` now consults the existing entity→fingerprint reverse index (with remote-storage fallback) instead of linearly scanning the full cache registry, so invalidation cost scales with matched entries rather than total registry size.
- ebb0e3d: Eliminate provider.Refresh() from query save/delete paths, introduce MJQueryEntityExtended with child-relationship getters and business logic, migrate all QueryInfo consumers outside MJCore to use QueryEngine and entity types, remove dead QueryCacheManager, and replace 12 redundant RunView calls with QueryEngine cache reads. Fixes major performance bottleneck on large-entity deployments where every query save reloaded the entire metadata graph.
- Updated dependencies [30f598d]
- Updated dependencies [c0b40c0]
- Updated dependencies [3d739a3]
  - @memberjunction/global@5.38.0
  - @memberjunction/sql-dialect@5.38.0

## 5.37.0

### Minor Changes

- 4f15f31: Add Feedback Explorer dashboard with 1–10 conversation-rating modal persisting to ConversationDetail, plus a migration granting the UI role Create/Update on MJ: User Settings so user-scoped preferences (e.g. Agent Feedback consent) stop silently failing.

### Patch Changes

- @memberjunction/global@5.37.0
- @memberjunction/sql-dialect@5.37.0

## 5.36.0

### Patch Changes

- 70fce34: Fix MJAPI heap leak by eliminating per-request `SQLServerDataProvider` retention in `BaseEngine` caches. `applyImmediateMutation` now clones entities before storing them so saver providers aren't pinned via `_provider` back-refs. The engine provider-instance cache is now keyed by `IMetadataProvider.InstanceConnectionString` (promoted onto the interface) instead of by provider object identity, and `SetProvider` is first-wins so transient per-request providers can't displace persistent ones.
- 4d16916: Fix dashboard resource navigation to parse OpenEntityRecord recordId as a URL segment so single-PK composite keys round-trip correctly (was producing malformed `ID|ID|<value>` URLs and dropping the record ID), plus add regression tests for `CompositeKey.LoadFromURLSegment`.
  - @memberjunction/global@5.36.0
  - @memberjunction/sql-dialect@5.36.0

## 5.35.0

### Minor Changes

- 6fa8e13: Grant the Developer role CanDelete on the ~218 entities where it previously had Create/Update but not Delete, restricted to developer-owned configuration and metadata. Audit logs, OAuth runtime state, global system config, and end-user-owned content remain locked.
- c1f1cad: Add pluggable geocoding provider abstraction with Google, Geocod.io, and HERE implementations (expands GeoCodeSource enum and adds provider registry). Polish the Home dashboard pin empty state with a dismissible "Don't show this again" preference persisted via UserInfoEngine, and speed up the Add Pin panel by reading from cached DashboardEngine, UserViewEngine, QueryEngine, and ActionEngineBase singletons instead of firing fresh RunViews on every open, with background pre-warm on home load.
- 207cba4: Scope the Developer delete-permission grant migration to the `__mj` schema so it never touches customer-defined schemas, and flip CodeGen's default `CanDelete` for the Developer role to `true` so newly registered entities ship with the Developer role's full CRUD permissions.

### Patch Changes

- 9580189: Fix keyset (AfterKey) pagination infinite loop in vector sync. `GenerateRunViewFingerprint` omitted `AfterKey`, so sequential keyset pages produced identical fingerprints and the dedup/linger layer returned page N's result for page N+1, freezing the seek cursor (observed on multi-page entities like a 2k-row Members table). The fingerprint now includes `AfterKey` (appended only when present, so non-keyset fingerprints are unchanged), fixing all keyset callers. The vectorizer's page reads now also set `BypassCache` since full-table sweeps read each page once, and `EntityVectorSyncer` halts with a clear error if the cursor ever fails to advance.
- aedd4dc: Bubble save SQL composition up to GenericDatabaseProvider as a single orchestrator; SQL Server and Postgres providers now contribute four dialect hooks instead of duplicating the generator. Fixes a PG UPDATE bug where PK wasn't tail appended
- Updated dependencies [ac4b9a5]
  - @memberjunction/global@5.35.0
  - @memberjunction/sql-dialect@5.35.0

## 5.34.1

### Patch Changes

- 3a35358: Surface engine load health in System Diagnostics with per-property success/failure status and error messages, add recovery telemetry to ApplicationManager, cache architecture fixes including schema hash staleness detection, empty result timestamp handling, and timestamp precision tolerance
  - @memberjunction/global@5.34.1
  - @memberjunction/sql-dialect@5.34.1

## 5.34.0

### Minor Changes

- 003317f: Add `EntityField.IsComputed` flag to distinguish SQL Server computed columns and PostgreSQL generated columns from view-only virtual columns. Both flavors continue to be flagged `IsVirtual = 1`, so every existing IsVirtual consumer (sproc generation, GraphQL input types, IS-A inheritance, RLS, form generation) is unchanged. The new flag refines base-view JOIN-target selection in CodeGen — when an FK's related Name Field is `IsComputed = 1`, the generated view joins to the related entity's base table instead of its view, avoiding unnecessary view materialization and unblocking self-referencing FKs whose Name Field is computed. Includes the SQL Server migration that adds the column, extends the `vwSQLColumnsAndEntityFields` metadata view, and updates `spUpdateExistingEntityFieldsFromSchema` to sync the flag from the catalog. The CodeGenLib PostgreSQL provider's pending-fields query already projects `IsComputed`; the corresponding PG view + sproc updates and the PG migration counterpart are produced by the version build / release pipeline (SQLConverter + pg-migrate skill) and are not included here. After deploying, run CodeGen once to repopulate `IsComputed` and regenerate base views that depend on entities with computed Name Fields.
- cfffb6d: Add keyset (seek) pagination to `RunView` via the new `RunViewParams.AfterKey: CompositeKey` field. Iterating large entities (background jobs, scheduled actions, bulk processing) now stays O(log N) per page regardless of depth — `StartRow`-based OFFSET pagination is unchanged and remains the right choice for UI grids.

  **Framework changes**
  - New `RunViewParams.AfterKey: CompositeKey` accepted by all RunView entry points (TS, GraphQL, REST flows that go through RunView).
  - New exported error class `AfterKeyNotSupportedError` (with `Reason` codes `CompositePK | UnsupportedPKType | IncompatibleOrderBy | StartRowConflict | AfterKeyShape`).
  - New exported helper `IsKeysetPaginationOrderableType(sqlType)` and constant `KEYSET_PAGINATION_ORDERABLE_PK_TYPES`.
  - Keyset queries bypass server cache (read + write) automatically — they're inherently single-use so caching is pure overhead.
  - v1 constraint: single-column PK only. Composite-PK entities throw `AfterKeyNotSupportedError` with `Reason: 'CompositePK'`.

  **Migrated callers (now use keyset by default when entity has a single-column PK)**
  - `ScheduledGeocodingAction` (`processMissingForEntity`) — falls back to OFFSET on composite-PK entities.
  - `VectorBase.PageRecordsByEntityID` + `EntityVectorSyncer.startDataPaging` — auto-promotes to keyset when possible. New helper `VectorBase.CanUseKeysetPagination()`. New optional `PageRecordsParams.AfterKey`.

  **Metadata**
  - `Geocoding Maintenance` scheduled job cron updated to weekly (Saturdays 2 AM UTC); description reworded to not hard-code a cadence. Administrators can adjust the `CronExpression` as needed.

  **Documentation**
  - New guide: `guides/KEYSET_PAGINATION_GUIDE.md`.
  - `CLAUDE.md` performance section updated.

  **Out of scope for v1**
  - `ExternalChangeDetection.ChangeDetector` uses `RunQuery` (saved queries with arbitrary SQL), which the framework can't safely rewrite. Stays on OFFSET; tracked as a follow-up.

  **Backwards compatibility**
  - Fully additive. Existing callers that don't pass `AfterKey` are unaffected.

### Patch Changes

- e999e0d: Add cross-server cache invalidation via shared storage provider, fix "No Applications Available" after browser refresh, use cacheSettings.verboseLogging for Redis provider, add ParameterHints to override LLM-generated sampleValues, and thread forceRefresh as BypassCache through BaseEngine config loading
- ae5cfbd: Search Scopes & RAG+ — multi-phase ship

  A bundled feature release across the search pipeline (Phases 2A–6 of
  the Search Scopes & RAG+ initiative). Highlights:

  **SearchEngine pipeline**
  - New `SimpleVectorDatabase` in-process driver — points
    `VectorDBBase` at any entity column with an `EmbeddingVector`
    field. Suitable for dev / agent-memory / small-medium corpora.
    Constructor accepts an empty/missing API key (in-process driver
    has no remote auth target).
  - `VectorDBBase.QueryIndex(params, contextUser?)` — `contextUser`
    is now a proper second parameter instead of being smuggled
    through `filter.__contextUser`. Pinecone/Qdrant/pgvector ignore
    it (they auth via API key); in-process drivers use it for
    RunView's server-side RLS guard. Method-level pattern matches
    MJ's `RunView(params, contextUser)` and `GetEntityObject(name,
contextUser)` conventions.
  - `SearchFusion` — multi-provider score evidence is now preserved
    through RRF. Previously the second provider's `ScoreBreakdown`
    contribution was silently dropped when the same RecordID
    appeared in two provider lists, causing the merged item to
    rank below single-provider hits. Records that match in
    Vector + Entity now carry both contributions and rank
    correctly.
  - Defensive sanitation in `Fuse()` — items with non-finite Score
    (NaN, Infinity), empty/non-string RecordID, or null payloads are
    filtered before fusion. Closes a class of failure modes from
    misbehaving 3rd-party providers.
  - Tier-1 input edge cases hardened — null/undefined/non-string
    Query no longer TypeErrors, surfaces a clean Failure result.
    `EntitySearchProvider` now strips SQL LIKE wildcards (`%`, `_`,
    `[`, `]`) from user input — `Query="%"` no longer matches every
    row through the LIKE-injection vector.
  - Streaming search — `SearchEngine.streamSearch()` v2 emits
    provider events as soon as each provider promise settles
    (concurrent emission), not in registration order.

  **Permission gate (Phase 2A)**
  - `SearchScopePermissionResolver` enforces a 6-step decision tree:
    AgentNone → AgentAssignedNotListed → DirectGrant → RoleGrant →
    AgentUnscopedAll → NoGrant.
  - `AIAgent.SearchScopeAccess` enum (`'None' | 'All' | 'Assigned'`)
    controls agent-side fallback when no per-user/per-role grant
    applies. `BypassCache` propagates through the dedup-linger cache
    so freshly-revoked grants take effect immediately.
  - New tests + agent scenarios cover all 13 permission-matrix cells
    (PM-01..PM-13).

  **Reranker catalog (Phase 2D)**
  - 4 reranker drivers — Cohere, Voyage, OpenAI judge, BGE local —
    all with `@RegisterClass(BaseReRanker, ...)`. Per-search
    `RerankerBudgetGuard` caps API spend; `EstimateCostCents` and
    `CostReporter` per driver. Graceful degradation when the
    upstream SDK rejects/times out/returns malformed responses.

  **Observability (Phase 3)**
  - `MJSearchExecutionLog` — every `Search()` invocation writes one
    row with Status / ResultCount / TotalDurationMs / RerankerCostCents
    / ProvidersJSON (per-source hit counts) / AIAgentID attribution.
    Forbidden gate decisions log `Status='Forbidden'` rows.
  - Knowledge Hub Config dashboard subtab visualizes the log:
    hit-rate, p50/p95 latency, top failure reasons, top users, total
    reranker cost.

  **External providers (Phase 5)**
  - 4 search providers — Elasticsearch, Typesense, Azure AI Search,
    OpenSearch — all with `@RegisterClass(BaseSearchProvider, ...)`.
  - New `AvailableSearchProviders` GraphQL query exposes the
    `BaseSearchProvider.GetAvailableProviders()` runtime catalog to
    the SearchScope form's provider dropdown (P5.5).

  **Angular / UI**
  - Custom `MJSearchScopeFormComponentExtended` (P2D.7 / P4) — fusion
    weights sliders, reranker dropdown, live-preview panel, A/B
    Kendall-tau similarity, CSV export of last 500 invocations.
  - Custom `MJSearchScopeProviderFormComponentExtended` (P5.5) —
    provider dropdown sourced from `MJ: Search Providers` rows,
    annotated with whether each provider's DriverClass is currently
    registered with the server's ClassFactory.
  - Streaming search consumer in `SearchService.StreamSearch()` —
    Angular Observable surface for the `StreamScopedSearch`
    mutation + `SearchStreamEvents` subscription.

  **Migration**
  - `V202605081416__v5.34.x__Search_Scopes_And_RAG_Plus.sql` —
    consolidated. Contains six DDL sections (Phase 1 baseline,
    `SearchScopePermission`, `SearchScope.RerankerBudgetCents`,
    `SearchExecutionLog`, `SearchScopeTestQuery`, unique-constraint
    fix) followed by five CodeGen runs that regenerate the entity
    metadata, sprocs, views, and permission grants for all of the
    above.

  **Test suite**
  - 17 end-to-end agent scenarios (s01–s17) under `agent-scenarios/`,
    driving real LLM tool-calls (Sage agent) against the SearchEngine
    - multi-provider RRF + reranker pipeline. 95 assertions; all PASS.
  - `@memberjunction/search-engine` vitest: 237 unit tests across 21
    files, all PASS. Covers fusion, providers (real + external),
    rerankers, scope template renderer, parent-ID metadata,
    streaming, permission resolver, edge cases, mid-flight failures.

  **Documentation**
  - `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` — comprehensive guide
    covering scope creation, agent integration, permission resolution,
    multi-scope fusion, reranker catalog, observability, external
    providers, how-to templates for adding a new provider /
    reranker / artifact tool library / vector index over an
    embedded entity column. Documents the embedding-regeneration
    contract for ops.

  See `RAG_plan.md` for the full multi-phase plan and `plans/
search-scopes-rag-plus/what-we-built.md` for the customer-facing
  summary.

- 6d8ee1a: no migration
- 72cb92e: Optimize component loading pipeline: remove 163 MB MJ: Components bulk load from ComponentMetadataEngine, add ComponentMetadataEngineServer for server-only use, add generic cache API to LocalCacheManager with server-side registry caching (page refresh component load reduced from 12-20s to ~70ms), add hash-based 304 support for registry fetches, remove proprietary spec caching to client database, and optimize Component Studio to load lightweight summaries on demand.
- Updated dependencies [7d8a0f9]
- Updated dependencies [389d356]
  - @memberjunction/sql-dialect@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Minor Changes

- 95eb27e: fix delete SP cascade updates to pass \_Clear flag for tolerant update SPs, preventing FK constraint violations when deleting conversations and other entities with nullable FK references (patch)
- 5cc5326: PostgreSQL end-to-end support — first MJ release where a fresh PG database can be migrated, codegen'd against, signed into, and synced from `mj sync push` without manual intervention. Plus a structural cleanup pass over how the stack handles the database-platform vocabulary and dialect-aware SQL.

  ### PG fresh-install path
  - **`@memberjunction/postgresql-dataprovider`** — replaces the `Nested transactions are not yet supported` throw with full SAVEPOINT-based nesting (mirrors SQL Server's depth/savepoint model). Adds the missing `ValidateDeleteResult` override that the Phase-2 Save/Delete refactor introduced for SS but skipped for PG, so `BaseEntity.Delete()` correctly recognizes successful deletes on PG. RDS-compatible startup wrapper (no `pg_catalog` writes, rejected by managed PG). Per-connection transaction mutex prevents interleaved BEGIN on shared connections during `mj sync` fan-out.
  - **`@memberjunction/sql-converter`** — new `ConditionalDDLRule` handlers for SS-only patterns that previously survived into PG output untranslated: `IF NOT EXISTS (sys.schemas …) EXEC('CREATE SCHEMA [X]')` → `CREATE SCHEMA IF NOT EXISTS "X"`, and `sp_addextendedproperty` schema descriptions → `COMMENT ON SCHEMA "X" IS '...'`. Function-output now emits a `DROP FUNCTION IF EXISTS` guard before recreate so re-runs don't trip "function … is not unique." `ADD COLUMN IF NOT EXISTS` for idempotent column-add migrations. `bit`-parameter body coercion + tagged dollar-quoting on `DO` blocks containing nested `$$`.
  - **`@memberjunction/codegen-lib`** — PG `CodeGenProvider` emits `spCreate*` / `spUpdate*` / `spDelete*` matching the SS-ported baseline (was `fn_create_<snake>`). `pgDialect.ParameterRef` produces `p_<flat lowercase>` matching baseline + runtime `buildCRUDParams`. Without these, every `Save()` against PG failed with `function does not exist`. Pre-pass in `spUpdateExistingEntityFieldsFromSchema` reseats stale negative `Sequence` values from prior interrupted runs at the tail of each entity's positive range, eliminating `UQ_EntityField_EntityID_Sequence` collisions on re-runs. PG-output statement termination — `;` after `INSERT`, `ALTER`, etc. so generated `CodeGen_Run_*.pg.sql` replays cleanly.
  - **`@memberjunction/cli`** (`mj migrate`) — fresh-PG-install blockers: now reads `DB_PLATFORM` from env to select dialect (was config-only); auto-defaults `dbPort` to 5432/1433 based on inferred platform; defaults `BaselineVersion` to `'1'` (Skyway sentinel meaning "auto-select highest-versioned `B__` baseline file"). Without these, `mj migrate` against a PG `.env` silently constructed a `SqlServerProvider`.

  ### Single source of truth for database-platform vocabulary

  Addresses code-review feedback that the stack had three parallel definitions of the same concept and a normalizer in the middle "translating" between them.
  - **`@memberjunction/global`** — new canonical `DatabasePlatform` type (`'sqlserver' | 'postgresql'`) and `resolveDbPlatformFromEnv()` helper that reads from `DB_PLATFORM`. STRICT — only the canonical pair is recognized; legacy aliases (`mssql`, `postgres`, `pg`) are no longer honored, and unrecognized non-empty values **throw** rather than silently falling back to `'sqlserver'`. The earlier dev-only `DB_TYPE` env var is no longer consulted.
  - **`@memberjunction/core`** and **`@memberjunction/sql-dialect`** — both packages re-export `DatabasePlatform` from global instead of defining their own copies.
  - **`@memberjunction/codegen-lib`** — config schema drops `dbType` entirely. `dbPlatform` is the only field. The `dbType()` exported helper is renamed to `dbPlatform()`. `normalizeDbPlatformAndType()` and its tests are deleted.
  - **`@memberjunction/cli`** and **`@memberjunction/server`** — drop their local `resolveDbPlatformFromEnv` copies in favor of the global helper. MJServer's `getDbType()` is now a 1-line wrapper.

  ### SQLDialect as the single source of truth for SQL type ↔ category mapping

  Replaces 5+ hand-coded SQL type-name lists scattered across the codebase ("when you see this pattern repeat, alarm bells").
  - **`@memberjunction/sql-dialect`** — each dialect now exposes 11 typed getters listing the SQL type names IT uses for each conceptual category: `BooleanTypeNames`, `StringTypeNames`, `DateTypeNames`, `IntegerTypeNames`, `FloatTypeNames`, `UuidTypeNames`, `BinaryTypeNames`, `JsonTypeNames`, `CurrencyTypeNames`, `IntervalTypeNames`, `NetworkTypeNames`. New `typeClassification.ts` module unions both dialects into cross-platform predicates (`IsBooleanSQLType`, `IsStringSQLType`, …, plus `IsNumericSQLType` aggregate). New `LowerCase(expr)` method on the base dialect (default `LOWER(${expr})`, ANSI-portable) replaces hardcoded `LOWER(...)` strings in callers. New `BooleanParameterType()` returns `'bit'` on SS, `'boolean'` on PG — used by codegen to emit dialect-correct tolerant-SP `_Clear` parameter declarations. Adding a future dialect = implementing the getters; no other site changes.
  - **`@memberjunction/core`** — `DatabaseProviderBase` gains a `Dialect: SQLDialect` getter, lazily resolved from `PlatformKey`. Server-side code can now write `provider.Dialect.BooleanLiteral(true)` etc. without independently importing `GetDialect`. `util.ts` `TypeScriptTypeFromSQLType` and `FormatValueInternal` rewritten over the predicates — ~70 lines of hardcoded switches collapse to ~25 lines of dispatches. New dep on `@memberjunction/sql-dialect`.
  - **`@memberjunction/codegen-lib`** — `getTypeGraphQLFieldString` 50-line switch replaced with predicate dispatch. `createNewUser.ts` boolean filter that previously avoided dialect-specific SQL via client-side `.filter()` post-pass now uses `dialect.BooleanLiteral(true)` and filters server-side.
  - **`@memberjunction/metadata-sync`** — `sync-engine.ts` lookup-filter type detection uses `IsUuidSQLType` / `IsDateSQLType` instead of a hand-maintained `!== 'uuid' && !== 'datetime' && …` chain. `LOWER()` wrapping goes through `dialect.LowerCase()`. `PushService.ts:isTextLikeColumn` is now a one-liner over `IsStringSQLType`. New dep on `@memberjunction/sql-dialect`.
  - **`@memberjunction/server`** — `auth/newUsers.ts` and `resolvers/IntegrationDiscoveryResolver.ts` boolean filters that previously loaded all rows + filtered client-side now run server-side via `provider.Dialect.BooleanLiteral(true)`.
  - **`@memberjunction/core-entities-server`** — `MJApplicationEntityServer.server.ts` IsActive filter on Users moved server-side via `provider.Dialect.BooleanLiteral(true)`. `MJTemplateContentEntityServer.server.ts` AI enrichment now wrapped in a SAVEPOINT so failures don't poison the outer Save tx (PG's whole-tx-aborts-on-stmt-error policy made this fatal where SS treated it as a per-stmt skip).

  ### Cross-dialect runtime fixes
  - **`@memberjunction/sql-dialect`** — `pgDialect.ParameterRef` flat-lowercase contract; PG type → GraphQL `String` mapping for `character`, `varchar`, `citext`. `sqlDialect.ts` runtime SQL emission: `INTEGER`, `DOUBLE`, `PRECISION`, `BYTEA`, `OID`, `REGCLASS`, `REGPROC`, `NAME` added to `autoQuoteIdentifiers` keyword set so casts in hand-written SQL (`CAST(x AS INTEGER)`) stop being quoted as user-defined types. New `coerceBooleanLiteralsInSQL` pass rewrites SS bit literals (`Bool = 1` / `= 0` / `!= 1` / `<> 0`) to `TRUE`/`FALSE` for fields whose `TSType` is Boolean — fixes `operator does not exist: boolean = integer` for `ExtraFilter` clauses across engines, agents, and dashboards.
  - **`@memberjunction/codegen-lib`** — `applyPermissions` inner catch was binding `e` and shadowing the outer `EntityInfo` loop variable, producing `Error executing permissions file ... for entity undefined` log lines. Renamed to `sqlError` with `instanceof Error` typed message extraction.
  - **`@memberjunction/metadata-sync`** — `mj sync push` tolerates UUID case mismatches (PG returns lowercase, SS returns uppercase) on lookup resolution. `@file:` JSON references serialize to `jsonb` correctly on PG (was double-stringifying via the SS path).
  - **`@memberjunction/core`** (`baseEntity.ts`) — string default values now strip PG's typed-literal wrapper (`'Single'::character varying` → `Single`) before assignment so `MaxLength` validation doesn't fail on the wrapper length.
  - **`@memberjunction/core`** (`entityInfo.ts`) — multi-`IsNameField` resolution rule: when more than one field is marked, prefer the one literally named `Name`. Without this rule the pick depended on insertion order (PG returns DisplayName first, SS returns Name first), producing wrong codegen view aliases on PG.

  ### Breaking changes (for direct config consumers)
  - Any user `mj.config.cjs` with `dbType: 'mssql'` or `dbType: 'postgresql'` must rename to `dbPlatform: 'sqlserver'` or `dbPlatform: 'postgresql'`. The `dbType` field is removed.
  - Any user `.env` with `DB_TYPE=...` must rename it to `DB_PLATFORM=...`. The legacy `DB_TYPE` env var is no longer consulted at all (no fallback). `DB_PLATFORM` accepts only `sqlserver` or `postgresql` (case-insensitive); legacy aliases (`mssql`, `postgres`, `pg`) and any other non-empty value throw a clear "Invalid DB_PLATFORM value" error at startup rather than silently routing the wrong provider.
  - Both `dbType`/`DB_TYPE` were dev-only additions during PG support development (Feb 2026, first appeared in v5.30.0). They were never documented as customer-facing and never exposed a stable contract.

  ### Validation
  - 2,536 unit tests passing across the 8 affected packages (`@memberjunction/global` 381, `@memberjunction/core` 1099, `@memberjunction/sql-dialect` 213, `@memberjunction/codegen-lib` 435, `@memberjunction/metadata-sync` 220, `@memberjunction/server` 188), 0 failed.
  - Fresh-DB PostgreSQL replay clean: `DROP SCHEMA __mj CASCADE` → `mj migrate` applies 127/127 migrations, produces 316 `spCreate*` + 319 `spUpdate*` functions, with 0 `EntityField` rows in the staging-band Sequence range.

- 7e4957d: Universal search performance + correctness fix: honor `EntityField.UserSearchPredicateAPI`, escape LIKE metacharacters, add resilience layer, and stop CodeGen from re-introducing invalid search flags.

  **Why:** `LIKE '%term%'` was the only SQL the data provider ever generated for non-FTX entities, regardless of the configured predicate. CodeGen has been populating `UserSearchPredicateAPI` (Exact / BeginsWith / EndsWith / Contains) for months, but the runtime was discarding it. Combined with primary keys, non-text columns, and `nvarchar(MAX)` columns being auto-flagged as searchable, every keystroke against the global search box produced unindexed scans across tables of arbitrary size.

  **`@memberjunction/generic-database-provider`** — `GenericDatabaseProvider.createViewUserSearchSQL` now:
  - Honors `UserSearchPredicateAPI`: `Exact` emits `= N'term'` (index-seekable), `BeginsWith` emits `LIKE N'term%' ESCAPE '\'` (index-seekable), `EndsWith` emits `LIKE N'%term' ESCAPE '\'`, and the default `Contains` emits `LIKE N'%term%' ESCAPE '\'`. `UserSearchParamFormatAPI` still wins when set.
  - Escapes LIKE metacharacters (`%`, `_`, `[`, `]`, `\`) in user input with `ESCAPE '\'`. Previously a query of `50%` was treated as a wildcard.
  - Skips fields that aren't sensible text-search targets (non-text types; unbounded text on non-FTX entities) so an OR'd OR-predicate isn't built around an implicit per-row CONVERT.
  - Emits `N''` Unicode literals throughout to avoid collation surprises.

  **`@memberjunction/core`** — adds `EntityFieldInfo.UserSearchPredicateAPI: string` so consumers see the value the runtime now honors. Default `'Contains'`.

  **`@memberjunction/search-engine`** — Resilience layer:
  - `EntitySearchProvider`, `FullTextSearchProvider`, and `SearchEngine.Search` reject queries shorter than 3 characters early — these always fan out to full-database scans across every searchable entity.
  - `EntitySearchProvider` wraps each per-entity RunView in a 5-second hard timeout. A slow entity no longer holds up the whole fan-out; the other entities' results still land for the user. The underlying SQL keeps running on the server until it finishes (Request cancellation is a follow-up).
  - `SearchEngine.Search` has an in-process LRU result cache keyed by `(userID, query, MaxResults, MinScore, Filters)` with a 30s TTL and 500-entry cap. Preview-mode searches skip the cache. New `ClearResultCache()` admin/test hook.

  **`@memberjunction/codegen-lib`** — CodeGen guardrails so the metadata stays clean:
  - `applySearchableFieldUpdates` now refuses to set `IncludeInUserSearchAPI = 1` on primary keys, non-text columns, or unbounded text columns whose parent entity has `FullTextSearchEnabled = 0`. The LLM can still propose them; CodeGen drops the proposal silently.
  - `applyEntitySearchConfig` refuses to flip `AllowUserSearchAPI` from `0` to `1` on entities whose names match log/audit/run-history patterns (`*Logs`, `*Audit*`, `*Record Changes`, `*Runs`, `*Run Steps/Messages/History`, `*Execution Logs`). It still allows the LLM to _disable_ search on any entity.

  **Migrations (run via Flyway in the same release):**
  - `migrations/v5/V202605041250__v5.33.x__Search_Hygiene_For_Mj_Schema_And_Field_Types.sql` — disables `AllowUserSearchAPI` on 40 `__mj` log / audit / run-history / snapshot entities (Record Changes, Audit Logs, AI Agent + Prompt Runs, Company Integration Runs/Details/API Logs, Error Logs, Action Execution Logs, Test/Workflow/Recommendation/Scheduled/Duplicate Runs, User View Runs/Details, Report Snapshots, Archive Runs/Details, etc.) and clears `IncludeInUserSearchAPI` on PKs, non-text columns, and non-FTX unbounded text columns system-wide. Freezes the corresponding `AutoUpdate*` flags so CodeGen doesn't re-promote any of these silently.
  - `migrations/v5/V202605041300__v5.33.x__EntityField_UserSearchPredicateAPI_Check_Constraint.sql` — adds a trusted CHECK constraint enforcing the four documented values. Defensively normalizes any out-of-band rows to `'Contains'` first.

  **Behavior change to call out:** any caller that previously relied on `%` or `_` in a `UserSearchString` being interpreted as a SQL wildcard will now match those characters literally. There were no such known callers in the MJ ecosystem; this aligns the runtime with the documented contract.

### Patch Changes

- 74b0be0: Tolerate non-ISO `maxUpdatedAt` values in the smart cache check so a malformed timestamp degrades to a cache miss instead of throwing `Invalid time value`. Also expand the MJAPI GraphQL operation log so nested variables render as truncated JSON instead of Node's `[Object]` placeholders.
- Updated dependencies [5cc5326]
- Updated dependencies [312fcee]
- Updated dependencies [7add405]
  - @memberjunction/sql-dialect@5.33.0
  - @memberjunction/global@5.33.0

## 5.32.0

### Minor Changes

- a7e8b3b: fix(geo): prevent OOM crash loops in ScheduledGeocodingAction by paginating RunView calls (500 records/page), replacing N+1 per-record SQL queries with a bulk Map lookup, adding a safety MaxTotal default of 50,000, and fixing a race condition in CreateGeoCodeRow on concurrent batch inserts
- b9c67ac: Remove stale MSGraph Migration

### Patch Changes

- @memberjunction/global@5.32.0

## 5.31.0

### Minor Changes

- 60e7541: Add --incremental flag for push/pull, lazy embedding loading, indexed batch context lookups, batched pull queries
- 17b8087: no migration but marking as minor due to cache bump stuff added here, good practice, but we're on a minor bump anyway
- 5db36d9: Fix RLS filter target for Unified Permissions Phase 2: rewrite the two `RowLevelSecurityFilter` rows seeded by V202604241700 to reference `__mj.vwAIAgentRuns` instead of the unschema-qualified base table `AIAgentRun`. The original values failed at runtime for UI-role users reading `MJ: AI Agent Run Steps` and `MJ: AI Prompt Runs` because the bare table name didn't resolve and, even schema-qualified, the role lacks SELECT on the base table — only the view.

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- 18be074: Fix boundary wildcard stripping in sqlLike filters, fix QueryProcessor default value handling for array-typed parameters, add Chart.js canvas container and no-unwrap-utility-libs lint rules to react-test-harness, and fix SimpleChart label leak through onDataPointClick
- 6779c1e: Lazy field hydration in BaseEntity + smarter engine startup (~30x warm-load speedup, ~14s to ~470ms). Defers per-row Field construction until something mutates or walks Fields, removes a speculative per-view fast-start path, adds a `deferred` flag to `@RegisterForStartup` and an `EnsureLoaded()` shortcut on `BaseEngine` / `AIEngine`. DeveloperModeService and WorkspaceStateManager swapped weak `Get`/`Set` calls for typed accessors. EnsureLoaded calls added at AI engine consumption sites.
- de34786: Add `GetItems<T>(keys, category?)` batched read to `ILocalStorageProvider`. IndexedDB implementation uses a single read transaction with N parallel `get()` calls; Redis uses one `MGET` command. Used internally by `LocalCacheManager.GetRunViewResults` to batch the smart-cache-check warm-load reads (eliminating ~85 sequential per-key IDB transactions per coalesced engine bundle), the dataset-cache load (eliminating 3 redundant data-key reads per cached dataset access), and the metadata-snapshot bootstrap (3 keys → 1 batched read). Also fixes `IsDatasetCached` to probe via the tiny `_date` key instead of pulling the multi-MB dataset blob just for an existence check. No on-disk schema change; no version bump needed for the IDB schema. 28 new unit tests cover generic contract behavior, IDB single-transaction verification, and Redis MGET semantics including per-key error tolerance and deduplication.
- Updated dependencies [7ed7a4b]
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/global@5.30.1

## 5.30.0

### Minor Changes

- 68bf87f: Archive entity CodeGen migration with updated views/SPs, field display name corrections, and RuntimeActionConfiguration type fix
- 4729398: Runtime Actions — Phase 1 complete. Introduces `Action.Type='Runtime'`, a new action type where agents dynamically generate, test, and persist JavaScript actions that execute in MJ's isolated-vm sandbox with a permissioned bridge to metadata, views, queries, entity CRUD, other actions, agents, and AI prompts. Ships the v5.29.x migration (new `RuntimeActionConfiguration`, universal `MaxExecutionTimeMS`, and `CreatedByAgentID` columns on `Action`), the JSONType-authored config interface, the Zod validator with drift detection, the bidirectional IPC bridge in WorkerPool, the full `utilities.*` handler surface, the ActionSmith meta-agent with `Create Runtime Action` / `Test Runtime Action` helpers, Agent Manager wiring, the generic `Execute Agent` action, and Runtime-aware approval UI enhancements. Minor bumps across all touched packages because the schema migration + metadata records are coupled surface changes.
- c199f3b: Phase 2 of the unified permissions architecture: introduces the `IPermissionProvider` interface with 9 domain providers (Entity, Application Role, Dashboard, Resource, Artifact, AI Agent, Collection, Query, Access Control Rule) aggregated by a new `PermissionEngine` singleton, adds explicit Allow/Deny support to `EntityPermission`, and ships the Permissions admin dashboard. Includes migrations for the Permission Domain catalog, EntityPermission.Type column, Dashboard FK cascade delete, ResourcePermission.SharedByUserID, and UI role permission fixes.

### Patch Changes

- 963f2df: Gate the PreRunView/PreRunViews Fields-override on cache eligibility
- b1f32a4: Tighten the fast-startup window so all parallel engine loads share the local cache, defer background metadata validation until after StartupManager finishes, parallelize per-param IndexedDB cache checks, gzip-compress AllMetadata in localStorage, scope UserInfoEngine loads by UserID on the Network provider, and replace GeoDataEngine's Web Worker boundary parser with synchronous parsing to avoid an 11+s structured-clone stall.
  - @memberjunction/global@5.30.0

## 5.29.0

### Minor Changes

- e02e24e: Query rendering pipeline redesign: fix Bug D (Nunjucks expression inside SQL string literal breaks ORDER BY detection), consolidate duplicated ORDER BY logic into shared analyzer, add RenderPipeline entry point with diagnostic tracing, introduce structural parser and symbol table for composition IR, and integrate SQL dialect objects throughout the parser removing all hardcoded dialect switch statements. SQL comments are now stripped before template evaluation instead of escaped. Production callers (RunQuery, TestQuerySQL) delegate to RenderPipeline. 65+ new tests including recursive CTEs, PostgreSQL dialect variants, and comment-stripping coverage.

  Query dashboard and form UI improvements: replace flat category dropdowns with hierarchical tree dropdowns, default new query category to active folder context, add per-folder create buttons, expose Reusable/CacheEnabled/AuditQueryRuns fields in entity form Details panel, add saving indicator with spinner overlay, fix sub-entity delete by reloading fresh entity copies, and fix tree dropdown not showing pre-selected text for branch-only configurations. Fix extraction pipeline not cleaning up stale Query Fields and Query Entities when extraction produces no results, with 9 regression tests.

### Patch Changes

- @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- 115e4da: Hot-path optimizations and a new BaseEngine observable API.

  **Performance (bundled from #2397, #2405, #2406, #2417):**
  - `BaseEntity.GetFieldByName` and new `GetFieldByCodeName` back Fields lookups with lazy `Map` caches — O(1) in place of O(N) `.find()` scans inside `SetMany`, setters, and serialization. Caches clear on `init()` so re-initialized entities see fresh fields.
  - `Metadata.EntityByName`/`EntityByID` fall back to a lazy `Map` when the provider doesn't own the lookup. UUID keys are normalized so SQL-Server-upper-case and PostgreSQL-lower-case resolve the same entry. Invalidated on `Refresh()`.
  - `BaseInfo.copyInitData` uses `hasOwnProperty` instead of scanning `Object.keys(this)`, and short-circuits the `DefaultValue` case-insensitive match with an exact-equality fast path plus a length pre-check before falling back to `toLowerCase`.
  - `RunView`/`RunViews` post-cache field filtering caches per-call key-to-keep decisions so repeated keys across rows avoid re-lowercasing and re-lookup.

  **BaseEngine observable properties:**
  - New `BaseEngine.ObserveProperty<E>(propertyName)` returns an `Observable<E[]>` backed by a lazy `BehaviorSubject`. Unobserved properties pay zero runtime cost.
  - Five mutation paths (`applyImmediateMutation` add/remove, `LoadSingleEntityConfig`, `LoadMultipleEntityConfigs`, remote-record-data handling) now emit via `emitPropertyChange` so subscribers receive array updates.
  - `UserInfoEngine` exposes `UserNotifications$`, `UserFavorites$`, `UserApplications$` as convenience accessors.

  Fully test-covered: 918/918 tests pass in `@memberjunction/core` including new coverage for each cache and for the observable lifecycle.
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/global@5.27.0

## 5.26.0

### Minor Changes

- a1002f4: - Entities now expose AllowCaching as the runtime source of truth for

### Patch Changes

- @memberjunction/global@5.26.0

## 5.25.0

### Minor Changes

- fc8cd52: Autotagging pipeline with run tracking, retry, and tag merge/delete; taxonomy server-side SQL aggregates; vector sync credential engine integration; search resolver and organic key support; unit test fixes across geo-core, ai-vector-sync, MJServer, and UUID compliance.

### Patch Changes

- @memberjunction/global@5.25.0

## 5.24.0

### Minor Changes

- c318a0c: metadata + migrations in this PR == minor

### Patch Changes

- 1912726: Add sqlLikeContains, sqlLikeBegins, and sqlLikeEnds template filters for platform-aware LIKE pattern matching
  - @memberjunction/global@5.24.0

## 5.23.0

### Minor Changes

- 513b20c: migration/metadata
- 44bc22b: JSONType strong typing system: adds JSONType, JSONTypeIsArray, and JSONTypeDefinition metadata.

### Patch Changes

- 247df16: Fix server-side RunView cache write asymmetry that caused repeated DB queries during metadata sync, add deterministic Nunjucks template parameter extraction via AST, support comma-delimited multi-value fields in validation, and redesign QueryPagingEngine to append paging directly instead of wrapping in CTEs (fixing ORDER BY on non-projected columns and apostrophe-in-comments bugs).
- 9250070: Update default configs for local cache manager.
- Updated dependencies [247df16]
  - @memberjunction/global@5.23.0

## 5.22.0

### Patch Changes

- 6a5093b: no migration
- e123e4b: bug fixes for RunView cache, Data Explorer, and MCP OAuth scopes
- Updated dependencies [f2a6bec]
  - @memberjunction/global@5.22.0

## 5.21.0

### Patch Changes

- c7dfb20: no migration/metadata changes (yet)
  - @memberjunction/global@5.21.0

## 5.20.0

### Minor Changes

- 2298f8a: Metadata Migration for v5.20.0

### Patch Changes

- @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- 9881045: no metadata or migration files, patch release
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- 2387400: Migrated singleton classes to BaseSingleton pattern and extracted auth providers into standalone package
- 11dba07: no migration
  - @memberjunction/global@5.16.0

## 5.15.0

### Minor Changes

- 662d56b: migration + metadata

### Patch Changes

- d01f697: MJ SQL Parser: unified parser for SQL + Nunjucks templates + composition tokens. Replaces fragmented regex-based SQL parsing across 6 packages with a single MJSQLParser class providing AST-based tokenization, placeholder substitution, CTE extraction, ORDER BY remapping, and deterministic parameter/field extraction. Moves QueryPagingEngine from MJCore to GenericDatabaseProvider with AST-based paging. Fixes backtick quoting, table-qualified ORDER BY remapping, trailing semicolon, and FOR XML parsing bugs.
  - @memberjunction/global@5.15.0

## 5.14.0

### Minor Changes

- 140fc6d: Add HubSpot v4 association fetch, fix empty-string-to-null coercion for HubSpot datetime fields, widen GetCachedObject/GetCachedFields visibility to protected, and fix OpenAI streaming max_completion_tokens parameter

### Patch Changes

- 69b5af4: Add TestQuerySQL resolver and client method for query execution testing, refactor CreateQueryResolver into QuerySystemUserResolver composing CodeGen-generated MJQuery\_ types, add lightweight query catalog for collision detection, unit tests for transitive template composition and ORDER BY stripping, and updated class registration manifests
  - @memberjunction/global@5.14.0

## 5.13.0

### Minor Changes

- d0d9eba: Add metadata migration script for v5.13.0

### Patch Changes

- f72b538: Replace HookRegistry and DynamicPackageLoader with @RegisterClass + ClassFactory middleware pattern, and add GetResolverPaths() to BaseServerMiddleware for auto-discovery of middleware-contributed GraphQL resolvers
- Updated dependencies [f72b538]
  - @memberjunction/global@5.13.0

## 5.12.0

### Minor Changes

- 05f19ff: Add composable query system with semantic catalog search, CTE composition engine, server-side paging, query caching with TTL/dependency invalidation, and agent directive surfacing. Includes QueryCacheManager wrapper over LocalCacheManager, QueryPagingEngine for SQL-level OFFSET/FETCH paging, QueryCompositionEngine for platform-aware CTE generation, and SearchQueryCatalog action for vector-based query discovery. Renames PaginationComponent to DataPagerComponent and extracts into shared module.
- d92502e: migration/metadata

### Patch Changes

- @memberjunction/global@5.12.0

## 5.11.0

### Minor Changes

- a4c3c81: migration/metadata

### Patch Changes

- @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/global@5.10.1

## 5.10.0

### Minor Changes

- f2df653: Add ExternalReferenceID column to AIAgentRun for cross-system run correlation and wire it through Skip proxy. Fix CodeGen validator duplicate generation and cleanup existing duplicates.

### Patch Changes

- 75dd36b: no migration
  - @memberjunction/global@5.10.0

## 5.9.0

### Minor Changes

- 194ddf2: Add Redis-backed ILocalStorageProvider with cross-server cache invalidation via pub/sub

### Patch Changes

- Updated dependencies [194ddf2]
  - @memberjunction/global@5.9.0

## 5.8.0

### Minor Changes

- 0753249: Add metadata migration script for v5.8.0

### Patch Changes

- @memberjunction/global@5.8.0

## 5.7.0

### Minor Changes

- 642c4df: Remove migration script V202603021400**v5.6.x**Optimize_RecordChange_Detection_Index because it would significantly increase database size and cause migration timeouts for AIDP upgrades (it adds an index on RecordChange that included FullRecordJSON).

### Patch Changes

- @memberjunction/global@5.7.0

## 5.6.0

### Minor Changes

- 4547d05: Grant UI role Create/Update permissions on 9 agent and conversation entities so end users can use agents like Sage

### Patch Changes

- 76eaabc: Fix SQL validation regex to allow legitimate string values containing SQL keywords, add PlatformSQL support to GraphQLSystemUserClient input types, and mark 25 deprecated AI model-vendor inference pairs as Inactive
  - @memberjunction/global@5.6.0

## 5.5.0

### Minor Changes

- a1648c5: Add MiniMax AI provider package, add MiniMax and Gemini 3.1 Pro models to AI model catalog, fix ng-conversations to prevent client from overwriting server-completed conversation details, and align metadata files with SQL logger output to prevent phantom mj-sync updates
- ee9f788: migrations - postgres sql support!

### Patch Changes

- 2b1d842: Add Qwen 3.5 Plus AI model metadata and revert diagnostic logging for component registry loading
- df2457c: no migration, just small code changes
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/global@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- @memberjunction/global@5.3.0

## 5.2.0

### Minor Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- 06d889c: metadata -> migration
- 3542cb6: metadata -> migration

### Patch Changes

- @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Minor Changes

- a3e7cb6: migration

### Patch Changes

- Updated dependencies [4aa1b54]
  - @memberjunction/global@5.0.0

## 4.4.0

### Minor Changes

- bef7f69: Migration for metadata sync

### Patch Changes

- 61079e9: just a plan
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/global@4.3.1

## 4.3.0

### Minor Changes

- 564e1af: migration

### Patch Changes

- @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/global@4.2.0

## 4.1.0

### Minor Changes

- 77839a9: Enable cascade deletes for AI Agent and Prompt entities, add cross-file dependency detection and --delete-db-only flag to MetadataSync for proper deletion ordering, fix CodeGen duplicate variable names for self-referential FKs, add requireConnectivity config to QueryGen, and add Gemini JSON parser support to DBAutoDoc.
- 5af036f: Migration for metadata

### Patch Changes

- @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- 718b0ee: migration
- e06f81c: changed SO much!

### Patch Changes

- 5c7f6ab: EntityByName
- Updated dependencies [8366d44]
- Updated dependencies [718b0ee]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/global@4.0.0

## 3.4.0

### Minor Changes

- a3961d5: feat(codegen): Add soft PK/FK support for messy databases

### Patch Changes

- @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/global@3.0.0

## 2.133.0

### Minor Changes

- c00bd13: Add metadata migration script for 2.133.0

### Patch Changes

- @memberjunction/global@2.133.0

## 2.132.0

### Minor Changes

- 55a2b08: Migration

### Patch Changes

- @memberjunction/global@2.132.0

## 2.131.0

### Minor Changes

- 280a4c7: Add Cerebras as AI inference provider for GLM-4.7 model and improve MetadataSync with recursive @file reference resolution in checksum calculations

### Patch Changes

- 81598e3: no migration just code
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/global@2.130.1

## 2.130.0

### Minor Changes

- 9f2ece4: Migration
- 02e84a2: Add GPT Codex models (5.2-codex, 5.1-codex-max, 5.1-codex-mini), implement SimpleChart stackBy property for stacked bar/column charts, add @file: directive support for component code references, reorganize component metadata with comprehensive documentation, and fix metadata-sync validation for glob patterns with \*\*/ prefix

### Patch Changes

- @memberjunction/global@2.130.0

## 2.129.0

### Minor Changes

- c391d7d: Migration
- 8c412cf: migration
- fbae243: migration
- c7e38aa: migration
- 7a39231: Add Vertex AI provider with Google GenAI SDK integration, resolve database connection timeout, and improve conversation UI

### Patch Changes

- 0fb62af: Move GraphQL type name utilities to @memberjunction/core and clean up unused imports
- 7d42aa5: Fix non-deterministic entity ordering in metadata system and remove redundant entity sorting in CodeGen
- Updated dependencies [fbae243]
- Updated dependencies [c7e38aa]
  - @memberjunction/global@2.129.0

## 2.128.0

### Minor Changes

- f407abe: Add EffortLevel support to AIPromptModel with priority hierarchy and fix GPT 5.2 naming convention to align with standards

### Patch Changes

- @memberjunction/global@2.128.0

## 2.127.0

### Minor Changes

- c7c3378: Fix memory leaks and improve conversation naming performance
- b748848: Add Gemini 3 Flash and GPT-5.2 AI models, enhance QueryGen with graph-based entity targeting, AI-powered semantic query naming, and optional external SQL file generation

### Patch Changes

- Updated dependencies [c7c3378]
  - @memberjunction/global@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/global@2.126.1

## 2.126.0

### Minor Changes

- 703221e: Migration

### Patch Changes

- @memberjunction/global@2.126.0

## 2.125.0

### Minor Changes

- bd4aa3d: Migration file

### Patch Changes

- @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- 75058a9: Fix metadata provider race conditions, add EntityDataGrid component validation, and enforce Component entity Specification field as single source of truth
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/global@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/global@2.122.1

## 2.122.0

### Minor Changes

- 6de83ec: Add component linter enhancements with type inference and control flow analysis, DBAutoDoc query generation features, MCP server diagnostic tools, metadata sync improvements, and enhanced JWKS client with HTTP keep-alive connections and connection pooling to prevent socket hangups
- c989c45: migration

### Patch Changes

- @memberjunction/global@2.122.0

## 2.121.0

### Minor Changes

- a2bef0a: Refactor component-linter with fixture-based testing infrastructure, fix agent execution error handling and payload propagation, add Gemini API parameter fixes, and improve vendor failover with VendorValidationError type
- 7d5a046: Migration to add missing core entity fields.

### Patch Changes

- @memberjunction/global@2.121.0

## 2.120.0

### Minor Changes

- 3074b66: Add agent run auditing and debugging tools, enhance AI agent execution history with search and pagination, improve query parameter extraction and validation, and add linter validation for missing query names
- 60a1831: Fix WebSocket subscription lifecycle management in GraphQL data provider, add Gemini 3 Pro model with 1M token context window, enhance component linter to detect invalid property access on RunQuery/RunView results, and fix testing dashboard dialog rendering issues

### Patch Changes

- 5dc805c: just a prototype
  - @memberjunction/global@2.120.0

## 2.119.0

### Minor Changes

- 7dd7cca: Migration

### Patch Changes

- @memberjunction/global@2.119.0

## 2.118.0

### Minor Changes

- 78721d8: Migration to minor version.

### Patch Changes

- @memberjunction/global@2.118.0

## 2.117.0

### Minor Changes

- 8c092ec: Migration

### Patch Changes

- @memberjunction/global@2.117.0

## 2.116.0

### Minor Changes

- 81bb7a4: Update SingleRecordView Generic Component (metadata)

### Patch Changes

- Updated dependencies [a8d5592]
  - @memberjunction/global@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/global@2.114.0

## 2.113.2

### Patch Changes

- 61d1df4: Bump patch version
  - @memberjunction/global@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [c126b59]
  - @memberjunction/global@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/global@2.110.1

## 2.110.0

### Patch Changes

- @memberjunction/global@2.110.0

## 2.109.0

### Patch Changes

- @memberjunction/global@2.109.0

## 2.108.0

### Patch Changes

- @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/global@2.106.0

## 2.105.0

### Patch Changes

- @memberjunction/global@2.105.0

## 2.104.0

### Patch Changes

- Updated dependencies [2ff5428]
  - @memberjunction/global@2.104.0

## 2.103.0

### Minor Changes

- bd75336: ix: Improve React component system registry handling and chart
  flexibility
  - Enhanced component manager to optimize pre-registered component loading
    by skipping redundant fetches
  - Fixed SimpleChart component to accept any field for grouping, not just
    numeric fields
  - Removed backup metadata file to clean up repository
  - Added support for components with pre-populated code in the registry
  - Improved dependency resolution for local registry components
  - Better logging for component loading optimization paths

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [addf572]
  - @memberjunction/global@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/global@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/global@2.100.1

## 2.100.0

### Minor Changes

- 5f76e3a: feat: Add standard MJ components with improved framework
  patterns

  ### Summary

  Introduces four new standard MemberJunction components that
  follow established framework patterns for library access,
  metadata usage, and component composition.

  ### New Components
  - **SimpleChart**: Lightweight charting component with
    automatic data aggregation, smart chart type selection, and
    proper date formatting
  - **SimpleDrilldownChart**: Extends SimpleChart with integrated
    drill-down capability to show detailed records in a DataGrid
  - **OpenRecordButton**: Smart navigation button that uses
    entity metadata to automatically detect primary keys
  - **SingleRecordView**: Metadata-driven record display with
    multiple layout options and optional OpenRecord button
    integration

### Patch Changes

- @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- 8bbb0a9: - Updated RunView resolver and GraphQL data provider to work with any
  primary key configuration
  - Changed from hardcoded "ID" field to dynamic PrimaryKey array from
    entity metadata
  - Added utility functions for handling primary key values in client code
  - Supports single non-ID primary keys (e.g., ProductID) and composite
    primary keys
  - Fixes compatibility with databases like AdventureWorks that use
    non-standard primary key names
  - @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/global@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/global@2.97.0

## 2.96.0

### Minor Changes

- 01dcfde: migration

### Patch Changes

- @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- a54c014: duck typing
  - @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- f8757aa: bug fixes
  - @memberjunction/global@2.93.0

## 2.92.0

### Minor Changes

- 8fb03df: migrations
- 5817bac: migration

### Patch Changes

- @memberjunction/global@2.92.0

## 2.91.0

### Patch Changes

- f703033: Implement extensible N-provider authentication architecture
  - Created shared authentication types in @memberjunction/core for use
    across frontend and backend
  - Refactored authentication to support multiple providers using MJGlobal
    ClassFactory pattern
  - Implemented dynamic provider discovery and registration without
    modifying core code
  - Added support for multiple concurrent auth providers via authProviders
    array configuration
  - Replaced static method with cleaner property pattern for Angular
    provider dependencies
  - Eliminated code duplication and removed unused configuration methods
  - Maintained full backward compatibility with existing auth
    implementations

  This enables teams to add custom authentication providers (SAML,
  proprietary SSO, etc.)
  without forking or modifying the core authentication modules.
  - @memberjunction/global@2.91.0

## 2.90.0

### Minor Changes

- 146ebcc: migration

### Patch Changes

- @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- @memberjunction/global@2.88.0

## 2.87.0

### Minor Changes

- 58a00df: Removed broken migration

### Patch Changes

- @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- @memberjunction/global@2.85.0

## 2.84.0

### Minor Changes

- 0b9d691: Changes to MJCore/SQLServerDataProvider/GraphQLDataProvider to ensure that calls handle pre/post processing of RunView/RunViews properly regardless of entry point to the provider.

### Patch Changes

- @memberjunction/global@2.84.0

## 2.83.0

### Minor Changes

- e2e0415: Bump to version 2.83.0 to align with migration file versioning

### Patch Changes

- @memberjunction/global@2.83.0

## 2.82.0

### Patch Changes

- @memberjunction/global@2.82.0

## 2.81.0

### Minor Changes

- 971c5d4: feat: implement query audit logging and TTL-based caching

  Add comprehensive audit logging and caching capabilities to the
  MemberJunction Query system:
  - Add ForceAuditLog and AuditLogDescription parameters to RunQuery for
    granular audit control
  - Implement TTL-based result caching with LRU eviction strategy for
    improved performance
  - Add cache configuration columns to Query and QueryCategory entities
  - Support category-level cache configuration inheritance
  - Update GraphQL resolvers to handle new audit and cache fields
  - Refactor RunQuery method into logical helper methods for better
    maintainability
  - Follow established RunView pattern for fire-and-forget audit logging

### Patch Changes

- 6d2d478: feat: AI Agent UI improvements and server-side context fixes
  - Enhanced AI Agent dialogs with resizable and draggable functionality
    using Kendo UI Window component
  - Improved dialog positioning with consistent center placement and proper
    container context
  - Fixed prompt selector in AI Agent form for better user experience
  - Added missing contextUser parameter to GetEntityObject calls in
    BaseResolver for proper multi-user isolation
  - Fixed createRecordAccessAuditLogRecord calls in generated resolvers to
    include provider argument
  - Added JSDoc documentation to ViewInfo class properties for better code
    documentation
  - Applied consistent dialog styling across all AI Agent management
    components
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/global@2.80.1

## 2.80.0

### Patch Changes

- 7c5f844: Bug fixes for SQLServerDataProvider and fix ability to use other providers for MD refreshes up and down the stack
  - @memberjunction/global@2.80.0

## 2.79.0

### Patch Changes

- Updated dependencies [907e73f]
  - @memberjunction/global@2.79.0

## 2.78.0

### Patch Changes

- @memberjunction/global@2.78.0

## 2.77.0

### Minor Changes

- d8f14a2: significant changes in all of these
- c91269e: migration file for permissions driving minor bump

### Patch Changes

- @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- 7dabb22: feat: add hierarchical CategoryName support for query lookup

  Adds support for hierarchical category paths in query lookup operations.
  The CategoryName parameter now accepts filesystem-like paths (e.g.,
  "/MJ/AI/Agents/") that walk through the QueryCategory parent-child
  relationships.

  ### New Features
  - **Hierarchical Path Resolution**: CategoryName now supports paths like
    "/MJ/AI/Agents/" that are parsed by splitting on "/" and walking down the
    category hierarchy using ParentID relationships
  - **CategoryPath Property**: Added CategoryPath getter to QueryInfo class
    that returns the full hierarchical path for any query
  - **Backward Compatibility**: Existing simple CategoryName usage (e.g.,
    "Agents") continues to work unchanged
  - @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- @memberjunction/global@2.75.0

## 2.74.0

### Minor Changes

- d316670: migration - MJCore

### Patch Changes

- @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0

## 2.69.1

### Patch Changes

- 2aebdf5: Patch to repackage failed deployment run
  - @memberjunction/global@2.69.1

## 2.69.0

### Minor Changes

- 79e8509: Several changes to improve validation functionality

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/global@2.69.0

## 2.68.0

### Patch Changes

- b10b7e6: tweaks to EntityField active status assertion - enabled supression per field instance
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/global@2.67.0

## 2.66.0

### Patch Changes

- @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [619488f]
  - @memberjunction/global@2.65.0

## 2.64.0

### Patch Changes

- @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1

## 2.63.0

### Patch Changes

- @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/global@2.61.0

## 2.60.0

### Minor Changes

- e512e4e: metadata + core + ai changes

### Patch Changes

- b5fa80a: Improvements to boolean and numeric handling in EntityField Dirty and Set methods
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/global@2.59.0

## 2.58.0

### Patch Changes

- def26fe: Added UUID generation to BaseEntity for entities that have single-column pkey that is uniqueidentifier type
  - @memberjunction/global@2.58.0

## 2.57.0

### Minor Changes

- 0ba485f: various bug fixes

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/global@2.57.0

## 2.56.0

### Patch Changes

- @memberjunction/global@2.56.0

## 2.55.0

### Patch Changes

- @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- 20f424d: DatabaseProviderBase added and changes to SQLServerDataProvider to fix transaction handling
  - @memberjunction/global@2.54.0

## 2.53.0

### Minor Changes

- bddc4ea: LoadFromData() changed to async, various other changes

### Patch Changes

- @memberjunction/global@2.53.0

## 2.52.0

### Minor Changes

- e926106: Significant improvements to AI functionality

### Patch Changes

- @memberjunction/global@2.52.0

## 2.51.0

### Minor Changes

- 7a9b88e: AI Improvements

### Patch Changes

- @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/global@2.50.0

## 2.49.0

### Minor Changes

- cc52ced: Significant changes all around
- db17ed7: Further Updates
- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [cc52ced]
- Updated dependencies [62cf1b6]
  - @memberjunction/global@2.49.0

## 2.48.0

### Minor Changes

- bb01fcf: bug fixes but bumping minor version here since we have a migration in this PR

### Patch Changes

- @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/global@2.46.0

## 2.45.0

### Patch Changes

- @memberjunction/global@2.45.0

## 2.44.0

### Patch Changes

- fbc30dc: Documentation
  - @memberjunction/global@2.44.0

## 2.43.0

### Minor Changes

- 1629c04: Templates Improvements + EntityField.Status Column added with related changes

### Patch Changes

- @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/global@2.42.1

## 2.42.0

### Patch Changes

- @memberjunction/global@2.42.0

## 2.41.0

### Patch Changes

- 3be3f71: Patched sql stored procedure name for tables with name colisions.
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- @memberjunction/global@2.40.0

## 2.39.0

### Patch Changes

- @memberjunction/global@2.39.0

## 2.38.0

### Patch Changes

- @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/global@2.37.1

## 2.37.0

### Patch Changes

- @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- 9d709e2: Implemented optional async Validate mechanism for any BaseEntity sub-class to be part of the Save() pipeline.
  - @memberjunction/global@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- 160f24f: Tweak to default value handling for EntityField class
- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
  - @memberjunction/global@2.36.0

## 2.35.1

### Patch Changes

- 3e7ec64: Strong typing for transaction item callback function and fix bug in SQL Server Data Provider caused by weak typing
  - @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/global@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/global@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/global@2.34.1

## 2.34.0

### Patch Changes

- 785f06a: Improvements to Ask Skip and Skip Chat components for HTML Reports
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- @memberjunction/global@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/global@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/global@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/global@2.32.0

## 2.31.0

### Patch Changes

- @memberjunction/global@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [a3ab749]
  - @memberjunction/global@2.30.0

## 2.29.2

### Patch Changes

- 07bde92: New CodeGen Advanced Generation Functionality and supporting metadata schema changes
- 64aa7f0: New query for 2.29.0 to get version history since we aren't using an entity for flyway data anymore. Improvements to query execution to support query execution by name as well as by ID, and general cleanup (code wasn't working before as query ID wasn't enclosed in quotes from days of INT ID types)
- 69c3505: bumped package-lock for 2.280
  - @memberjunction/global@2.29.2

## 2.28.0

### Minor Changes

- 8259093: Communication Provider now supports forwarding messages

### Patch Changes

- @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/global@2.27.1

## 2.27.0

### Patch Changes

- 54ab868: Added LogDebug
  - @memberjunction/global@2.27.0

## 2.26.1

### Patch Changes

- @memberjunction/global@2.26.1

## 2.26.0

### Minor Changes

- 23801c5: Changes to use of TransactionGroup to use await at all times.Fixed up some metadata bugs in the \_\_mj schema that somehow existed from prior builds.Cleaned up SQL Server Data Provider handling of virtual fields in track record changesFixed CodeGen to not emit null wrapped as a string that was happening in some casesHardened MJCore.BaseEntity to treat a string with the word null in it as same as a true null value (in case someone throws that into the DB)

### Patch Changes

- @memberjunction/global@2.26.0

## 2.25.0

### Minor Changes

- 26c990d: - Add Conversations to Resource Types Entity* Update User View Grid to fix multi-edit bug* Transaction Management Changes - fixes bug in #803 - but not new feature in there* Clean bug in Notification Service to only show user-centric messages* Add Sharing dialog to Skip Chat component

### Patch Changes

- fd07dcd: Sparse Updates for Create/Update Mutations via CodeGen
- 86e6d3b: Finished debug for Variables support in transaction groups!
  - @memberjunction/global@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/global@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [9cb85cc]
  - @memberjunction/global@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/global@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/global@2.23.1

## 2.23.0

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/global@2.23.0

## 2.22.2

### Patch Changes

- 94ebf81: Add override for node typings
  - @memberjunction/global@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/global@2.22.1

## 2.22.0

### Minor Changes

- a598f1a: Added a repeatable migration to maintain database metadata

### Patch Changes

- Updated dependencies [9660275]
  - @memberjunction/global@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:27 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

### Patches

- Bump @memberjunction/global to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:04 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.20.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/global to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/global to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/global to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/global to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:48 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/global to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/global to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Bump @memberjunction/global to v2.18.0

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Bump @memberjunction/global to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:27 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/global to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Bump @memberjunction/global to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:28 GMT

### Patches

- Applying package updates [skip ci] (craig@memberjunction.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump patch version (craig@memberjunction.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump patch version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Bump @memberjunction/global to v2.14.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/global to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:44 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/global to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Bump @memberjunction/global to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/global to v2.13.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.12.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.11.0

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Bump @memberjunction/global to v2.10.0

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Bump @memberjunction/global to v2.9.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Bump @memberjunction/global to v2.8.0

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Bump @memberjunction/global to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.7.0

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Bump @memberjunction/global to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:03 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Bump @memberjunction/global to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/global to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:06 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.5.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Bump @memberjunction/global to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.3.1

## 2.2.2

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

### Patches

- Bump @memberjunction/global to v2.3.0

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.2.1

## 2.2.0

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Bump @memberjunction/global to v2.2.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/global to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/global to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Bump @memberjunction/global to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/global to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:27 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Minor changes

- Bump @memberjunction/global to v1.8.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.7.1

Wed, 12 Jun 2024 20:13:28 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.7.1

## 1.7.0

Wed, 12 Jun 2024 18:53:38 GMT

### Minor changes

- Bump @memberjunction/global to v1.7.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.6.1

Tue, 11 Jun 2024 06:50:06 GMT

### Patches

- Bump @memberjunction/global to v1.6.1

## 1.6.0

Tue, 11 Jun 2024 04:59:29 GMT

### Minor changes

- Bump @memberjunction/global to v1.6.0

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.5.3

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Bump @memberjunction/global to v1.5.2

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Bump @memberjunction/global to v1.5.1

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.5.0

## 1.4.1

Fri, 07 Jun 2024 04:36:53 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.4.1

## 1.4.0

Sat, 25 May 2024 15:30:17 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.4.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.3.3

Thu, 23 May 2024 18:35:52 GMT

### Patches

- Bump @memberjunction/global to v1.3.3

## 1.3.2

Thu, 23 May 2024 14:19:50 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.3.2

## 1.3.1

Thu, 23 May 2024 02:29:25 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.3.1

## 1.3.0

Wed, 22 May 2024 02:26:03 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Overhaul the way we vectorize records (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.3.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.2.2

Thu, 02 May 2024 19:46:38 GMT

### Patches

- Bump @memberjunction/global to v1.2.2

## 1.2.1

Thu, 02 May 2024 16:46:11 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.2.1

## 1.2.0

Mon, 29 Apr 2024 18:51:58 GMT

### Minor changes

- Bump @memberjunction/global to v1.2.0

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Bump @memberjunction/global to v1.1.3

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Bump @memberjunction/global to v1.1.2

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Bump @memberjunction/global to v1.1.1

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Bump @memberjunction/global to v1.1.0

## 1.0.11

Wed, 24 Apr 2024 20:57:41 GMT

### Patches

- - bug fixes in Skip UI \* added exception handling to ReportResolver (97354817+AN-BC@users.noreply.github.com)
- - Completed removed Kendo SVG Icons and standardized on Font Awesome. Done for consistency, simplicity and also because Kendo SVG Icons seem to be having a major impact on rendering performance/resizing/etc * In several areas while removing KendoSVG and replacing with Font Awesome, implemented the new Angular 17 style control flow (@if instead of *ngIf as an example) (97354817+AN-BC@users.noreply.github.com)
- - Added support for BaseFieldComponent to show or not show its label \* Added more JSDoc documentation to classes within MJCore and MJGlobal (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.0.11

## 1.0.9

Sun, 14 Apr 2024 15:50:05 GMT

### Patches

- Bump @memberjunction/global to v1.0.9

## 1.0.8

Sat, 13 Apr 2024 02:32:44 GMT

### Patches

- Update build and publish automation (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.0.8

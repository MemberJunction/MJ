# @memberjunction/integration-engine

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

- 6520bea: Add MemberSuite (AMS) integration connector — REST API v2, 196 objects / ~6,000 fields extracted credential-free from MemberSuite's public module swaggers (CRM/membership/events/fundraising/financial). Signed-request auth via auth-helpers, narrow Activity/Certification write surface, runtime custom-field/saved-search discovery, full-record pass-through. Adds the `MemberSuite API` credential type. Also adds the additive `OAuth2TokenRequest.ExtraParams` field required by the existing RhythmConnector (engine patch).
- 5ebf0e9: Add the netFORUM Enterprise (Community Brands AMS) connector — xWeb SOAP/XML route.
  - **`NetForumConnector`** (`@memberjunction/integration-connectors`): integrates netFORUM Enterprise via the xWeb SOAP/XML web service (`netForumXML.asmx`), implemented as SOAP-over-HTTP on `BaseRESTIntegrationConnector`. Two-step `Authenticate` token auth; `GetQuery`/`GetQueryDefinition`/`ExecuteMethod` reads; per-facade `*_last_updated_dt` incremental watermarks; facade CRUD where the xWeb docs establish it. The standard Enterprise object model (34 Integration Objects) is Declared from the public xWeb WSDL; customer-specific queries/views/custom columns are runtime-discovered via `GetQueryDefinition` (`DiscoveryIsAuthoritative=false`), never baked into the connector.
  - **`@memberjunction/integration-engine`**: adds the optional `OAuth2TokenRequest.ExtraParams` field (extra `application/x-www-form-urlencoded` grant-body params, e.g. Auth0 `audience`), forwarded by `OAuth2TokenManager` with standard params taking precedence. This is the engine half of the OAuth2 change `RhythmConnector` already depends on.

  > **Note:** netFORUM's denormalized facades (e.g. `Individual`, `FundraisingGift`) can exceed SQL Server's hard 1024-column-per-table limit when fully flattened; those objects need column-overflow handling at the framework level before they can materialize as single tables.

- Updated dependencies [9b9b484]
- Updated dependencies [6ac8ca4]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/integration-engine-base@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/integration-pk-classifier@5.42.0
  - @memberjunction/integration-progress-artifacts@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/integration-engine-base@5.41.0
  - @memberjunction/integration-pk-classifier@5.41.0
  - @memberjunction/integration-progress-artifacts@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/integration-engine-base@5.40.2
- @memberjunction/integration-pk-classifier@5.40.2
- @memberjunction/integration-progress-artifacts@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/integration-engine-base@5.40.1
  - @memberjunction/integration-pk-classifier@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/integration-progress-artifacts@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/integration-engine-base@5.40.0
  - @memberjunction/integration-pk-classifier@5.40.0
  - @memberjunction/integration-progress-artifacts@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Minor Changes

- db4addf: feat(integration): Integration Framework Expansion — schema + metadata-driven CRUD base class, generated layer, cross-dialect hardening, and field-mapping cache

  End-to-end increment expanding the integration framework: new per-operation write metadata on the schema, a generic metadata-driven CRUD base class, the regenerated entity/GraphQL/form layers that expose it, plus the cross-dialect (PostgreSQL + SQL Server) bug fixes and a field-mapping performance cache found while proving it live.

  **Schema (v5.39.x migration)**
  - `IntegrationObject`: explicit per-operation write columns — `CreateAPIPath`/`Method`/`BodyShape`/`BodyKey`/`IDLocation`, `UpdateAPIPath`/`Method`/`BodyShape`/`BodyKey`/`IDLocation`, `DeleteAPIPath`/`DeleteIDLocation`. The legacy `WriteAPIPath`/`WriteMethod` are kept one release as deprecated aliases.
  - `IntegrationObject`: `IncrementalWatermarkField` — vendor cursor/timestamp field name driving the incremental sync filter.
  - `IntegrationObject` + `IntegrationObjectField`: `MetadataSource` enum `{Declared, Discovered, Custom}` — provenance for merge precedence in `IntegrationSchemaSync`.

  All schema changes are additive (new nullable fields + a new enum field) — no existing field is removed, renamed, or narrowed — so the bumps are **minor**.

  **Engine / base class (`@memberjunction/integration-engine`)**
  - `ExternalFieldSchema`: add `IsPrimaryKey` (distinct from `IsUniqueKey`). Fixes an `IntrospectSchema` bug where `IsPrimaryKey` was incorrectly mapped from `IsUniqueKey` — an object can have multiple unique fields but only one primary key.
  - `BaseRESTIntegrationConnector`: new `TransformRecord` hook — optional per-record customization seam between `NormalizeResponse` and `ToExternalRecord` (default identity); override for vendor-specific record-level shape changes.
  - `BaseRESTIntegrationConnector`: generic metadata-driven CRUD — `CreateRecord`/`UpdateRecord`/`DeleteRecord`/`GetRecord` read the per-operation columns and execute generically. Concrete connectors override only when an API is genuinely idiosyncratic. Replaces the hand-rolled write logic previously duplicated across every concrete connector.
  - `FieldMappingEngine`: cache compiled `custom`-transform expressions instead of recompiling `new Function` once per field per record. A batch of N records sharing an expression compiles it once and executes the cached function N times, dropping per-record cost from `O(compile + execute)` to `O(execute)`. The cache stores a typed `CompiledExpression = (value, fields) => unknown` (no weak typing), caches compile failures too (a malformed expression is compiled once and the resulting `Error` re-thrown from cache per record, leaving `OnError` `Fail`/`Null`/`Skip` semantics unchanged), and is bounded by `MJLruCache` (1000-entry default) since the owning `IntegrationEngine` is a process-lifetime singleton.

  **Generated layer (CodeGen for the v5.39.x migration)**
  - `@memberjunction/core-entities` — `IntegrationObjectEntity` / `IntegrationObjectFieldEntity` gain strongly-typed accessors for the per-operation write columns, `IncrementalWatermarkField`, and the `MetadataSource` enum (`'Declared' | 'Discovered' | 'Custom'`).
  - `@memberjunction/server` — regenerated resolvers / GraphQL types expose the new fields.
  - `@memberjunction/ng-core-entity-forms` — regenerated `MJ: Integration Objects` / `MJ: Integration Object Fields` forms render the new fields.

  **Cross-dialect hardening (PostgreSQL + SQL Server)**

  Bugs found and fixed while proving the framework end-to-end on both dialects with live generated actions:
  - `@memberjunction/codegen-lib` — PostgreSQL CRUD generation emitted the primary-key column twice for composite-PK entities, so association/junction tables never synced on PG; `PostgreSQLCodeGenProvider` now treats a multi-column PK as strategy-handled. Soft-PK/FK application uses dialect-aware identifier quoting and boolean literals (`this.dialect.QuoteIdentifier` / `BooleanLiteral`) so the pass runs correctly on PostgreSQL.
  - `@memberjunction/server` — wired the PostgreSQL branch of the in-process CodeGen runner (`RuntimeSchemaManager.SetCodeGenRunner`) that previously existed only for SQL Server, so runtime schema sync no longer falls back to a hang-prone child process on PG. `IntegrationDiscoveryResolver` entity/field-map creation is now create-or-reuse (idempotent on re-apply), and its idempotency + operational list reads use `BypassCache` so create-vs-update decisions read committed state.
  - `@memberjunction/integration-engine` — `MatchEngine.FindRecordMapEntry` and the bulk record-map load now read committed state (`BypassCache`), fixing duplicate-create after a direct-DB change; watermark save/load is idempotent to avoid a transaction-abort on retry. `LoadRunConfiguration` and every remaining operational decision-read — the upsert-by-identity record-map lookup, field-maps, the full-vs-incremental gate, write-back external-id lookup, orphan-sweep, and orphaned-run resume — now also `BypassCache`. This closes a Postgres-only gap where a freshly-toggled entity-map `Configuration` (e.g. enabling partition/Merkle reconcile) was read stale → the ChangeToken rollup was silently never written on PG, and removes the broader read-stale-then-decide bug class so the read-your-own-writes pipeline always decides from committed state on both dialects.
  - `@memberjunction/core-actions` — the generated integration-action executor used stale entity names (`'Integrations'`, `'Company Integrations'`); corrected to `'MJ: Integrations'` / `'MJ: Company Integrations'` so `List`/`Get` invoke successfully.
  - `@memberjunction/core-entities-server` — declares its previously-undeclared `@memberjunction/integration-pk-classifier` dependency (used by the server-side LLM PK-detection callback), fixing the missing-dependency check; covers the integration server-entity behavior (`MJCompanyIntegrationEntityServer`, `IntegrationLLMPKCallback`).
  - Multi-provider safety — the post-pipeline metadata `Refresh()` calls in `IntegrationDiscoveryResolver` and `MJCompanyIntegrationEntityServer` now refresh the request's own provider (`provider ?? new Metadata()`) instead of the global default, satisfying the `MultiProviderCompliance` gate and refreshing the correct cache under a non-default provider.
  - Dialect layer (`@memberjunction/sql-dialect`) — statement splitting for runtime schema migrations is now a dialect concern: `SplitStatements` (naive `;`-split on the base, dollar-quote-aware override on PostgreSQL so `DO $$…$$` blocks stay intact) instead of living in the schema-engine runtime.

### Patch Changes

- a1e2776: Add an idempotent `Upsert` verb to integration connectors, implemented for HubSpot contacts.

  **Engine** (`integration-engine`): a new CRUD verb alongside Create/Update/Delete — a `SupportsUpsert` capability getter and a default-throwing `Upsert(ctx)` on `BaseIntegrationConnector`, a new `UpsertRecordContext` type (carries `Attributes` plus an optional `IDProperty` override of the upsert key), and an optional `UpsertKey` field on `IntegrationObjectInfo` so objects can declare their natural unique business key. Purely additive: existing connectors inherit the throwing default, `UpsertKey` is optional, and the action-generator verb set is unchanged (no auto-generated Upsert action).

  **HubSpot** (`integration-connectors`): `HubSpotConnector` overrides `Upsert` for contacts. This defines an error out of existence — a search-then-create sequence has a window in which a concurrent writer can create the same email-keyed contact, yielding `409 Contact already exists`; rather than catch and special-case that 409, `Upsert` issues a single idempotent call to `POST /crm/v3/objects/<object>/batch/upsert` with a batch of one (`idProperty`/`id` per input, `id` = the upsert-key value), which creates-on-missing and updates-on-existing without a 409, removing the race window entirely. The `idProperty` defaults from the object's `UpsertKey` metadata (`email` for contacts) and is overridable per call. It uses the write-verb error pattern: it never trusts a bare 2xx (a batch envelope reporting `numErrors`, a non-`COMPLETE` status, empty `results`, or a result with no object id all surface as `Success:false`), and a missing key/value fails with a 400 before any API call.

  Note: the single-record `PATCH /crm/v3/objects/contacts/{email}?idProperty=email` was verified live to NOT create-on-missing (404), so the batch/upsert-of-one is the correct single-call idempotent path; the documented multi-input batch caveats (whole-batch 409, no partial upserts) do not apply at size one.

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/integration-engine-base@5.39.0
  - @memberjunction/integration-pk-classifier@5.39.0
  - @memberjunction/integration-progress-artifacts@5.39.0

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
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/integration-engine-base@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/integration-engine-base@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/integration-engine-base@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/integration-engine-base@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/integration-engine-base@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/integration-engine-base@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/integration-engine-base@5.33.0
  - @memberjunction/core-entities@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/integration-engine-base@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/integration-engine-base@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/integration-engine-base@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Minor Changes

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

### Patch Changes

- 216ddc3: Wrap sequential Save/Delete looops in atomic transcatoins (TransactionGroup client-side BeginTransaction/Commit/Rollback server-side)
- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/integration-engine-base@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/integration-engine-base@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/integration-engine-base@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/integration-engine-base@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/integration-engine-base@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/integration-engine-base@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/integration-engine-base@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/integration-engine-base@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/integration-engine-base@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/integration-engine-base@5.22.0
  - @memberjunction/core-entities@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/integration-engine-base@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/integration-engine-base@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/integration-engine-base@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [d2c4e54]
  - @memberjunction/integration-engine-base@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0

## 5.17.0

### Minor Changes

- bbfbf5e: Runtime Schema Update (RSU) system with 32 integration lifecycle API endpoints, schema evolution, sync cancellation, watermark filtering, progress polling, and cascade delete fixes.

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/integration-engine-base@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/integration-engine-base@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/integration-engine-base@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Minor Changes

- 140fc6d: Add HubSpot v4 association fetch, fix empty-string-to-null coercion for HubSpot datetime fields, widen GetCachedObject/GetCachedFields visibility to protected, and fix OpenAI streaming max_completion_tokens parameter
- 6489cd8: metadata

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/integration-engine-base@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/integration-engine-base@5.13.0
  - @memberjunction/core-entities@5.13.0

## 5.12.0

### Minor Changes

- 6f9350c: migration
- 257512b: feat: Integration scheduled job type, YM/HubSpot connector improvements, CodeGen custom view refresh
  - Add ScheduledJobRunID FK to CompanyIntegrationRun and ScheduledJobID FK to CompanyIntegration (migration v5.12.x)
  - Add Integration Sync scheduled job type metadata
  - Pass contextUser through HubSpot credential loading for proper server-side data isolation
  - Make YM connector performance defaults (retries, timeouts, batch size, throttle) overrideable per Configuration JSON
  - CodeGen now auto-emits sp_refreshview for custom base views (BaseViewGenerated=false) so devs don't need to add it manually to migrations
  - BaseIntegrationPointAction scaffold for future write-back actions

### Patch Changes

- Updated dependencies [6f9350c]
- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/integration-engine-base@5.12.0
  - @memberjunction/core@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/integration-engine-base@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/integration-engine-base@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/integration-engine-base@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Minor Changes

- 89b6abe: migration

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/integration-engine-base@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/global@5.8.0

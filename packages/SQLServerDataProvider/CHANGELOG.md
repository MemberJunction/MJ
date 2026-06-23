# Change Log - @memberjunction/sqlserver-dataprovider

## 5.42.0

### Patch Changes

- 5ada858: Fix value mis-routing in the save / record-change capture table (`@ResultTable`). The capture column list was built in EntityField **Sequence** order, but the positional `INSERT INTO @ResultTable EXEC` copies the base view's `SELECT [base].*, <joins>` output (base columns first, virtual/related fields last). For entities where CodeGen sequenced a base column **after** a virtual field (newly-added columns get a `maxSequence + 100000` offset), the two orders diverged and values landed in the wrong column — producing truncation or string→bit type-conversion errors on save. The capture list is now emitted base-columns-first then virtual fields, matching the view. This is a stable partition: byte-for-byte identical output for every entity whose virtual fields already sort last (the overwhelming majority), and a correction only for the affected entities.
- Updated dependencies [9b9b484]
- Updated dependencies [37c73f6]
- Updated dependencies [0c6bf61]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/generic-database-provider@5.42.0
  - @memberjunction/actions@5.42.0
  - @memberjunction/aiengine@5.42.0
  - @memberjunction/ai-vectordb@5.42.0
  - @memberjunction/ai-vector-dupe@5.42.0
  - @memberjunction/actions-base@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/encryption@5.42.0
  - @memberjunction/queue@5.42.0
  - @memberjunction/query-processor@5.42.0
  - @memberjunction/ai@5.42.0
  - @memberjunction/ai-provider-bundle@5.42.0
  - @memberjunction/sql-dialect@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [d38ecbb]
- Updated dependencies [1e81848]
- Updated dependencies [2e48d1a]
- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ai-vector-dupe@5.41.0
  - @memberjunction/ai@5.41.0
  - @memberjunction/aiengine@5.41.0
  - @memberjunction/generic-database-provider@5.41.0
  - @memberjunction/ai-provider-bundle@5.41.0
  - @memberjunction/ai-vectordb@5.41.0
  - @memberjunction/actions-base@5.41.0
  - @memberjunction/actions@5.41.0
  - @memberjunction/encryption@5.41.0
  - @memberjunction/queue@5.41.0
  - @memberjunction/query-processor@5.41.0
  - @memberjunction/global@5.41.0
  - @memberjunction/sql-dialect@5.41.0

## 5.40.2

### Patch Changes

- Updated dependencies [da2ee38]
  - @memberjunction/ai-vector-dupe@5.40.2
  - @memberjunction/ai@5.40.2
  - @memberjunction/aiengine@5.40.2
  - @memberjunction/ai-provider-bundle@5.40.2
  - @memberjunction/ai-vectordb@5.40.2
  - @memberjunction/actions-base@5.40.2
  - @memberjunction/actions@5.40.2
  - @memberjunction/encryption@5.40.2
  - @memberjunction/generic-database-provider@5.40.2
  - @memberjunction/core@5.40.2
  - @memberjunction/core-entities@5.40.2
  - @memberjunction/global@5.40.2
  - @memberjunction/queue@5.40.2
  - @memberjunction/query-processor@5.40.2
  - @memberjunction/sql-dialect@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/aiengine@5.40.1
  - @memberjunction/ai-vectordb@5.40.1
  - @memberjunction/ai-vector-dupe@5.40.1
  - @memberjunction/actions-base@5.40.1
  - @memberjunction/actions@5.40.1
  - @memberjunction/encryption@5.40.1
  - @memberjunction/generic-database-provider@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/queue@5.40.1
  - @memberjunction/query-processor@5.40.1
  - @memberjunction/ai-provider-bundle@5.40.1
  - @memberjunction/ai@5.40.1
  - @memberjunction/global@5.40.1
  - @memberjunction/sql-dialect@5.40.1

## 5.40.0

### Patch Changes

- 804f9f6: Security audit fixes: parameterize SQL queries in GraphQL resolvers to prevent injection, validate entity read permissions on query execution, centralize permission logic in UserCanRun with recursive dependency checks, and fix UUID/multi-provider compliance violations.
- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/generic-database-provider@5.40.0
  - @memberjunction/aiengine@5.40.0
  - @memberjunction/ai-vectordb@5.40.0
  - @memberjunction/ai-vector-dupe@5.40.0
  - @memberjunction/actions-base@5.40.0
  - @memberjunction/actions@5.40.0
  - @memberjunction/encryption@5.40.0
  - @memberjunction/queue@5.40.0
  - @memberjunction/query-processor@5.40.0
  - @memberjunction/ai-provider-bundle@5.40.0
  - @memberjunction/ai@5.40.0
  - @memberjunction/global@5.40.0
  - @memberjunction/sql-dialect@5.40.0

## 5.39.0

### Patch Changes

- 7dfacc7: Add support for storing and querying embeddings inside the application's own database instead of a separate vector service. `VectorDBBase` gains an `IColocatedVectorHost` adapter (implemented by the PostgreSQL and SQL Server data providers) and a `ColocatedQuery` API; the new `PgVectorColocated` provider does vector + keyword (RRF) search in one statement, and the new `@memberjunction/ai-vectors-sqlserver` package adds a SQL Server 2025 native `VECTOR` provider with sibling-table and entity-column storage modes. `VectorSearchProvider` and `EntityVectorSyncer` route these indexes through the borrowed connection.
- eaee99f: fix: re-throw connection errors from RunView/RunQuery instead of swallowing into Success=false

  Preserve mssql ConnectionError type through executeSQLCore so GenericDatabaseProvider can structurally detect infrastructure failures (DB unreachable, pool closed) and re-throw them from InternalRunView and InternalRunQuery. Previously these were silently converted to { Success: false }, making it impossible for callers to distinguish "database is down" from "query returned no results."

- Updated dependencies [26761b8]
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [7dfacc7]
- Updated dependencies [eaee99f]
- Updated dependencies [2d1b4e1]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [a2aecc7]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/actions@5.39.0
  - @memberjunction/core@5.39.0
  - @memberjunction/ai-vectordb@5.39.0
  - @memberjunction/generic-database-provider@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0
  - @memberjunction/aiengine@5.39.0
  - @memberjunction/ai-vector-dupe@5.39.0
  - @memberjunction/actions-base@5.39.0
  - @memberjunction/encryption@5.39.0
  - @memberjunction/queue@5.39.0
  - @memberjunction/query-processor@5.39.0
  - @memberjunction/ai-provider-bundle@5.39.0
  - @memberjunction/sql-dialect@5.39.0

## 5.38.0

### Patch Changes

- ebb0e3d: Eliminate provider.Refresh() from query save/delete paths, introduce MJQueryEntityExtended with child-relationship getters and business logic, migrate all QueryInfo consumers outside MJCore to use QueryEngine and entity types, remove dead QueryCacheManager, and replace 12 redundant RunView calls with QueryEngine cache reads. Fixes major performance bottleneck on large-entity deployments where every query save reloaded the entire metadata graph.
- Updated dependencies [6b6c321]
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
  - @memberjunction/aiengine@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/generic-database-provider@5.38.0
  - @memberjunction/sql-dialect@5.38.0
  - @memberjunction/query-processor@5.38.0
  - @memberjunction/ai-vector-dupe@5.38.0
  - @memberjunction/queue@5.38.0
  - @memberjunction/actions-base@5.38.0
  - @memberjunction/actions@5.38.0
  - @memberjunction/encryption@5.38.0
  - @memberjunction/ai@5.38.0
  - @memberjunction/ai-provider-bundle@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [1af94d0]
- Updated dependencies [4f15f31]
- Updated dependencies [f5531e0]
  - @memberjunction/actions@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/generic-database-provider@5.37.0
  - @memberjunction/aiengine@5.37.0
  - @memberjunction/ai-vector-dupe@5.37.0
  - @memberjunction/actions-base@5.37.0
  - @memberjunction/encryption@5.37.0
  - @memberjunction/queue@5.37.0
  - @memberjunction/query-processor@5.37.0
  - @memberjunction/ai-provider-bundle@5.37.0
  - @memberjunction/ai@5.37.0
  - @memberjunction/global@5.37.0
  - @memberjunction/sql-dialect@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/aiengine@5.36.0
  - @memberjunction/ai-vector-dupe@5.36.0
  - @memberjunction/actions-base@5.36.0
  - @memberjunction/actions@5.36.0
  - @memberjunction/encryption@5.36.0
  - @memberjunction/generic-database-provider@5.36.0
  - @memberjunction/queue@5.36.0
  - @memberjunction/query-processor@5.36.0
  - @memberjunction/ai-provider-bundle@5.36.0
  - @memberjunction/ai@5.36.0
  - @memberjunction/global@5.36.0
  - @memberjunction/sql-dialect@5.36.0

## 5.35.0

### Patch Changes

- aedd4dc: Bubble save SQL composition up to GenericDatabaseProvider as a single orchestrator; SQL Server and Postgres providers now contribute four dialect hooks instead of duplicating the generator. Fixes a PG UPDATE bug where PK wasn't tail appended
- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [6f083dd]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/generic-database-provider@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/aiengine@5.35.0
  - @memberjunction/ai-vector-dupe@5.35.0
  - @memberjunction/actions-base@5.35.0
  - @memberjunction/actions@5.35.0
  - @memberjunction/encryption@5.35.0
  - @memberjunction/queue@5.35.0
  - @memberjunction/query-processor@5.35.0
  - @memberjunction/ai-provider-bundle@5.35.0
  - @memberjunction/ai@5.35.0
  - @memberjunction/sql-dialect@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/generic-database-provider@5.34.1
  - @memberjunction/aiengine@5.34.1
  - @memberjunction/ai-vector-dupe@5.34.1
  - @memberjunction/actions-base@5.34.1
  - @memberjunction/actions@5.34.1
  - @memberjunction/encryption@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/queue@5.34.1
  - @memberjunction/query-processor@5.34.1
  - @memberjunction/ai-provider-bundle@5.34.1
  - @memberjunction/ai@5.34.1
  - @memberjunction/global@5.34.1
  - @memberjunction/sql-dialect@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
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

- 6d8ee1a: no migration
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/aiengine@5.34.0
  - @memberjunction/ai-provider-bundle@5.34.0
  - @memberjunction/ai-vector-dupe@5.34.0
  - @memberjunction/actions-base@5.34.0
  - @memberjunction/actions@5.34.0
  - @memberjunction/encryption@5.34.0
  - @memberjunction/generic-database-provider@5.34.0
  - @memberjunction/query-processor@5.34.0
  - @memberjunction/sql-dialect@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/queue@5.34.0
  - @memberjunction/ai@5.34.0

## 5.33.0

### Patch Changes

- 312fcee: Fix two runtime SQL paths that referenced an entity's `BaseTable` directly, which fails under tightened DB grants (the runtime app user has SELECT only on BaseViews and EXECUTE on CRUD sprocs). Both paths now read from `BaseView` and route their identifier, string-literal, and bounded-string-cast generation through `SQLDialect` so the same code produces correct SQL on SQL Server, PostgreSQL, and any future supported platform.

  Adds three new helpers to `SQLDialect`: `QuoteStringLiteral` (concrete, both dialects share `''`-doubling escape), `QuoteColumnAlias` (abstract — bare on SQL Server, double-quoted on PG to preserve case), and `CastToBoundedString` (concrete, composed from existing `ResolveAbstractType` so it emits `NVARCHAR(450)` on SQL Server and `VARCHAR(450)` on PG).

  Refactored sites: `ScheduledGeocodingAction` orphan-cleanup `NOT EXISTS` filter, and `BuildChildDiscoverySQL` (IS-A subtype probe) on both `SQLServerDataProvider` and `PostgreSQLDataProvider` — the latter two also fix the runtime-failing `FROM [schema].[BaseTable]` shape that fired on every IS-A entity load and on the `FindISAChildEntity` GraphQL resolver.

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [312fcee]
- Updated dependencies [7e4957d]
- Updated dependencies [f94ebd6]
- Updated dependencies [7add405]
- Updated dependencies [b0329f6]
- Updated dependencies [fad046c]
  - @memberjunction/core@5.33.0
  - @memberjunction/generic-database-provider@5.33.0
  - @memberjunction/sql-dialect@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/aiengine@5.33.0
  - @memberjunction/ai-vector-dupe@5.33.0
  - @memberjunction/actions-base@5.33.0
  - @memberjunction/actions@5.33.0
  - @memberjunction/encryption@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/queue@5.33.0
  - @memberjunction/query-processor@5.33.0
  - @memberjunction/ai@5.33.0
  - @memberjunction/ai-provider-bundle@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/aiengine@5.32.0
  - @memberjunction/ai-vector-dupe@5.32.0
  - @memberjunction/actions-base@5.32.0
  - @memberjunction/actions@5.32.0
  - @memberjunction/encryption@5.32.0
  - @memberjunction/generic-database-provider@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/queue@5.32.0
  - @memberjunction/query-processor@5.32.0
  - @memberjunction/ai-provider-bundle@5.32.0
  - @memberjunction/ai@5.32.0
  - @memberjunction/global@5.32.0
  - @memberjunction/sql-dialect@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- 18be074: Fix boundary wildcard stripping in sqlLike filters, fix QueryProcessor default value handling for array-typed parameters, add Chart.js canvas container and no-unwrap-utility-libs lint rules to react-test-harness, and fix SimpleChart label leak through onDataPointClick
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [84494bb]
- Updated dependencies [9457655]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/ai@5.31.0
  - @memberjunction/aiengine@5.31.0
  - @memberjunction/ai-provider-bundle@5.31.0
  - @memberjunction/ai-vector-dupe@5.31.0
  - @memberjunction/actions-base@5.31.0
  - @memberjunction/actions@5.31.0
  - @memberjunction/encryption@5.31.0
  - @memberjunction/generic-database-provider@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/queue@5.31.0
  - @memberjunction/query-processor@5.31.0
  - @memberjunction/sql-dialect@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai@5.30.1
- @memberjunction/aiengine@5.30.1
- @memberjunction/ai-provider-bundle@5.30.1
- @memberjunction/ai-vector-dupe@5.30.1
- @memberjunction/actions-base@5.30.1
- @memberjunction/actions@5.30.1
- @memberjunction/encryption@5.30.1
- @memberjunction/generic-database-provider@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/queue@5.30.1
- @memberjunction/query-processor@5.30.1
- @memberjunction/sql-dialect@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [70c054d]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [4e2da93]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
- Updated dependencies [216ddc3]
  - @memberjunction/aiengine@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/ai-provider-bundle@5.30.0
  - @memberjunction/actions-base@5.30.0
  - @memberjunction/actions@5.30.0
  - @memberjunction/encryption@5.30.0
  - @memberjunction/ai-vector-dupe@5.30.0
  - @memberjunction/generic-database-provider@5.30.0
  - @memberjunction/queue@5.30.0
  - @memberjunction/query-processor@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/global@5.30.0
  - @memberjunction/sql-dialect@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/sql-dialect@5.29.0
  - @memberjunction/generic-database-provider@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/aiengine@5.29.0
  - @memberjunction/ai-vector-dupe@5.29.0
  - @memberjunction/actions-base@5.29.0
  - @memberjunction/actions@5.29.0
  - @memberjunction/encryption@5.29.0
  - @memberjunction/queue@5.29.0
  - @memberjunction/query-processor@5.29.0
  - @memberjunction/ai-provider-bundle@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/actions@5.28.0
  - @memberjunction/aiengine@5.28.0
  - @memberjunction/ai-vector-dupe@5.28.0
  - @memberjunction/actions-base@5.28.0
  - @memberjunction/encryption@5.28.0
  - @memberjunction/generic-database-provider@5.28.0
  - @memberjunction/queue@5.28.0
  - @memberjunction/query-processor@5.28.0
  - @memberjunction/ai-provider-bundle@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/global@5.28.0
  - @memberjunction/sql-dialect@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/aiengine@5.27.1
  - @memberjunction/ai-vector-dupe@5.27.1
  - @memberjunction/actions-base@5.27.1
  - @memberjunction/actions@5.27.1
  - @memberjunction/encryption@5.27.1
  - @memberjunction/generic-database-provider@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/queue@5.27.1
  - @memberjunction/query-processor@5.27.1
  - @memberjunction/ai-provider-bundle@5.27.1
  - @memberjunction/sql-dialect@5.27.1

## 5.27.0

### Patch Changes

- Updated dependencies [4357090]
  - @memberjunction/generic-database-provider@5.27.0
  - @memberjunction/ai@5.27.0
  - @memberjunction/aiengine@5.27.0
  - @memberjunction/ai-provider-bundle@5.27.0
  - @memberjunction/ai-vector-dupe@5.27.0
  - @memberjunction/actions-base@5.27.0
  - @memberjunction/actions@5.27.0
  - @memberjunction/encryption@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/core-entities@5.27.0
  - @memberjunction/global@5.27.0
  - @memberjunction/queue@5.27.0
  - @memberjunction/query-processor@5.27.0
  - @memberjunction/sql-dialect@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/aiengine@5.26.0
  - @memberjunction/ai-vector-dupe@5.26.0
  - @memberjunction/actions-base@5.26.0
  - @memberjunction/actions@5.26.0
  - @memberjunction/encryption@5.26.0
  - @memberjunction/generic-database-provider@5.26.0
  - @memberjunction/queue@5.26.0
  - @memberjunction/query-processor@5.26.0
  - @memberjunction/ai-provider-bundle@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/global@5.26.0
  - @memberjunction/sql-dialect@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [008a62d]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/generic-database-provider@5.25.0
  - @memberjunction/actions@5.25.0
  - @memberjunction/aiengine@5.25.0
  - @memberjunction/ai-vector-dupe@5.25.0
  - @memberjunction/actions-base@5.25.0
  - @memberjunction/encryption@5.25.0
  - @memberjunction/queue@5.25.0
  - @memberjunction/query-processor@5.25.0
  - @memberjunction/ai-provider-bundle@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/global@5.25.0
  - @memberjunction/sql-dialect@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ai-vector-dupe@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/aiengine@5.24.0
  - @memberjunction/actions@5.24.0
  - @memberjunction/ai-provider-bundle@5.24.0
  - @memberjunction/actions-base@5.24.0
  - @memberjunction/encryption@5.24.0
  - @memberjunction/generic-database-provider@5.24.0
  - @memberjunction/queue@5.24.0
  - @memberjunction/query-processor@5.24.0
  - @memberjunction/ai@5.24.0
  - @memberjunction/global@5.24.0
  - @memberjunction/sql-dialect@5.24.0

## 5.23.0

### Patch Changes

- 247df16: Fix server-side RunView cache write asymmetry that caused repeated DB queries during metadata sync, add deterministic Nunjucks template parameter extraction via AST, support comma-delimited multi-value fields in validation, and redesign QueryPagingEngine to append paging directly instead of wrapping in CTEs (fixing ORDER BY on non-projected columns and apostrophe-in-comments bugs).
- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/generic-database-provider@5.23.0
  - @memberjunction/ai-vector-dupe@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/aiengine@5.23.0
  - @memberjunction/actions-base@5.23.0
  - @memberjunction/actions@5.23.0
  - @memberjunction/encryption@5.23.0
  - @memberjunction/queue@5.23.0
  - @memberjunction/query-processor@5.23.0
  - @memberjunction/ai@5.23.0
  - @memberjunction/ai-provider-bundle@5.23.0
  - @memberjunction/sql-dialect@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [a42aba6]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/ai-vector-dupe@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/aiengine@5.22.0
  - @memberjunction/actions@5.22.0
  - @memberjunction/generic-database-provider@5.22.0
  - @memberjunction/actions-base@5.22.0
  - @memberjunction/encryption@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/queue@5.22.0
  - @memberjunction/query-processor@5.22.0
  - @memberjunction/ai-provider-bundle@5.22.0
  - @memberjunction/ai@5.22.0
  - @memberjunction/sql-dialect@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
- Updated dependencies [72fc93b]
  - @memberjunction/ai-vector-dupe@5.21.0
  - @memberjunction/core@5.21.0
  - @memberjunction/query-processor@5.21.0
  - @memberjunction/ai-provider-bundle@5.21.0
  - @memberjunction/aiengine@5.21.0
  - @memberjunction/actions-base@5.21.0
  - @memberjunction/actions@5.21.0
  - @memberjunction/encryption@5.21.0
  - @memberjunction/generic-database-provider@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/queue@5.21.0
  - @memberjunction/ai@5.21.0
  - @memberjunction/global@5.21.0
  - @memberjunction/sql-dialect@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [cc954e1]
- Updated dependencies [2298f8a]
  - @memberjunction/generic-database-provider@5.20.0
  - @memberjunction/core@5.20.0
  - @memberjunction/aiengine@5.20.0
  - @memberjunction/ai-vector-dupe@5.20.0
  - @memberjunction/actions-base@5.20.0
  - @memberjunction/actions@5.20.0
  - @memberjunction/encryption@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/queue@5.20.0
  - @memberjunction/query-processor@5.20.0
  - @memberjunction/ai-provider-bundle@5.20.0
  - @memberjunction/ai@5.20.0
  - @memberjunction/global@5.20.0
  - @memberjunction/sql-dialect@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai@5.19.0
- @memberjunction/aiengine@5.19.0
- @memberjunction/ai-provider-bundle@5.19.0
- @memberjunction/ai-vector-dupe@5.19.0
- @memberjunction/actions-base@5.19.0
- @memberjunction/actions@5.19.0
- @memberjunction/encryption@5.19.0
- @memberjunction/generic-database-provider@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/queue@5.19.0
- @memberjunction/query-processor@5.19.0
- @memberjunction/sql-dialect@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/aiengine@5.18.0
- @memberjunction/actions@5.18.0
- @memberjunction/generic-database-provider@5.18.0
- @memberjunction/ai-vector-dupe@5.18.0
- @memberjunction/queue@5.18.0
- @memberjunction/ai-provider-bundle@5.18.0
- @memberjunction/ai@5.18.0
- @memberjunction/actions-base@5.18.0
- @memberjunction/encryption@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/core-entities@5.18.0
- @memberjunction/global@5.18.0
- @memberjunction/query-processor@5.18.0
- @memberjunction/sql-dialect@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [4b6fd2a]
- Updated dependencies [9881045]
  - @memberjunction/generic-database-provider@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/aiengine@5.17.0
  - @memberjunction/ai-vector-dupe@5.17.0
  - @memberjunction/actions-base@5.17.0
  - @memberjunction/actions@5.17.0
  - @memberjunction/encryption@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/queue@5.17.0
  - @memberjunction/query-processor@5.17.0
  - @memberjunction/ai-provider-bundle@5.17.0
  - @memberjunction/ai@5.17.0
  - @memberjunction/global@5.17.0
  - @memberjunction/sql-dialect@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/aiengine@5.16.0
  - @memberjunction/ai-vector-dupe@5.16.0
  - @memberjunction/actions-base@5.16.0
  - @memberjunction/actions@5.16.0
  - @memberjunction/encryption@5.16.0
  - @memberjunction/generic-database-provider@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/queue@5.16.0
  - @memberjunction/query-processor@5.16.0
  - @memberjunction/ai-provider-bundle@5.16.0
  - @memberjunction/ai@5.16.0
  - @memberjunction/global@5.16.0
  - @memberjunction/sql-dialect@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [5e85b29]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/core@5.15.0
  - @memberjunction/generic-database-provider@5.15.0
  - @memberjunction/ai@5.15.0
  - @memberjunction/ai-provider-bundle@5.15.0
  - @memberjunction/aiengine@5.15.0
  - @memberjunction/ai-vector-dupe@5.15.0
  - @memberjunction/actions-base@5.15.0
  - @memberjunction/actions@5.15.0
  - @memberjunction/encryption@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/queue@5.15.0
  - @memberjunction/query-processor@5.15.0
  - @memberjunction/global@5.15.0
  - @memberjunction/sql-dialect@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/generic-database-provider@5.14.0
  - @memberjunction/query-processor@5.14.0
  - @memberjunction/actions-base@5.14.0
  - @memberjunction/actions@5.14.0
  - @memberjunction/aiengine@5.14.0
  - @memberjunction/ai-vector-dupe@5.14.0
  - @memberjunction/encryption@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/queue@5.14.0
  - @memberjunction/ai-provider-bundle@5.14.0
  - @memberjunction/ai@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/aiengine@5.13.0
  - @memberjunction/ai-vector-dupe@5.13.0
  - @memberjunction/actions-base@5.13.0
  - @memberjunction/actions@5.13.0
  - @memberjunction/encryption@5.13.0
  - @memberjunction/generic-database-provider@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/queue@5.13.0
  - @memberjunction/query-processor@5.13.0
  - @memberjunction/ai@5.13.0
  - @memberjunction/ai-provider-bundle@5.13.0

## 5.12.0

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/aiengine@5.12.0
  - @memberjunction/generic-database-provider@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ai-vector-dupe@5.12.0
  - @memberjunction/actions-base@5.12.0
  - @memberjunction/actions@5.12.0
  - @memberjunction/encryption@5.12.0
  - @memberjunction/queue@5.12.0
  - @memberjunction/query-processor@5.12.0
  - @memberjunction/ai-provider-bundle@5.12.0
  - @memberjunction/ai@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Minor Changes

- a4c3c81: migration/metadata

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/generic-database-provider@5.11.0
  - @memberjunction/core@5.11.0
  - @memberjunction/query-processor@5.11.0
  - @memberjunction/aiengine@5.11.0
  - @memberjunction/ai-vector-dupe@5.11.0
  - @memberjunction/actions-base@5.11.0
  - @memberjunction/actions@5.11.0
  - @memberjunction/encryption@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/queue@5.11.0
  - @memberjunction/ai-provider-bundle@5.11.0
  - @memberjunction/ai@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai@5.10.1
- @memberjunction/aiengine@5.10.1
- @memberjunction/ai-provider-bundle@5.10.1
- @memberjunction/ai-vector-dupe@5.10.1
- @memberjunction/actions-base@5.10.1
- @memberjunction/actions@5.10.1
- @memberjunction/encryption@5.10.1
- @memberjunction/generic-database-provider@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/queue@5.10.1
- @memberjunction/query-processor@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/aiengine@5.10.0
  - @memberjunction/ai-vector-dupe@5.10.0
  - @memberjunction/actions-base@5.10.0
  - @memberjunction/actions@5.10.0
  - @memberjunction/encryption@5.10.0
  - @memberjunction/generic-database-provider@5.10.0
  - @memberjunction/queue@5.10.0
  - @memberjunction/query-processor@5.10.0
  - @memberjunction/ai-provider-bundle@5.10.0
  - @memberjunction/ai@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- 194ddf2: Add Redis-backed ILocalStorageProvider with cross-server cache invalidation via pub/sub
- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/generic-database-provider@5.9.0
  - @memberjunction/aiengine@5.9.0
  - @memberjunction/ai-vector-dupe@5.9.0
  - @memberjunction/actions-base@5.9.0
  - @memberjunction/actions@5.9.0
  - @memberjunction/encryption@5.9.0
  - @memberjunction/queue@5.9.0
  - @memberjunction/ai@5.9.0
  - @memberjunction/query-processor@5.9.0
  - @memberjunction/ai-provider-bundle@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [064cf3a]
- Updated dependencies [0753249]
  - @memberjunction/generic-database-provider@5.8.0
  - @memberjunction/core@5.8.0
  - @memberjunction/aiengine@5.8.0
  - @memberjunction/ai-vector-dupe@5.8.0
  - @memberjunction/actions-base@5.8.0
  - @memberjunction/actions@5.8.0
  - @memberjunction/encryption@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/queue@5.8.0
  - @memberjunction/query-processor@5.8.0
  - @memberjunction/ai-provider-bundle@5.8.0
  - @memberjunction/ai@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ai@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/aiengine@5.7.0
  - @memberjunction/ai-vector-dupe@5.7.0
  - @memberjunction/actions@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/queue@5.7.0
  - @memberjunction/actions-base@5.7.0
  - @memberjunction/encryption@5.7.0
  - @memberjunction/generic-database-provider@5.7.0
  - @memberjunction/query-processor@5.7.0
  - @memberjunction/ai-provider-bundle@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/aiengine@5.6.0
  - @memberjunction/ai-vector-dupe@5.6.0
  - @memberjunction/actions-base@5.6.0
  - @memberjunction/actions@5.6.0
  - @memberjunction/encryption@5.6.0
  - @memberjunction/generic-database-provider@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/queue@5.6.0
  - @memberjunction/query-processor@5.6.0
  - @memberjunction/ai-provider-bundle@5.6.0
  - @memberjunction/ai@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Minor Changes

- ee9f788: migrations - postgres sql support!

### Patch Changes

- 7ca2459: Viewing System fixes, CodeGen cleanup, startup performance
- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/ai-provider-bundle@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ai@5.5.0
  - @memberjunction/aiengine@5.5.0
  - @memberjunction/ai-vector-dupe@5.5.0
  - @memberjunction/actions-base@5.5.0
  - @memberjunction/actions@5.5.0
  - @memberjunction/encryption@5.5.0
  - @memberjunction/generic-database-provider@5.5.0
  - @memberjunction/queue@5.5.0
  - @memberjunction/query-processor@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai@5.4.1
- @memberjunction/aiengine@5.4.1
- @memberjunction/ai-provider-bundle@5.4.1
- @memberjunction/ai-vector-dupe@5.4.1
- @memberjunction/actions-base@5.4.1
- @memberjunction/actions@5.4.1
- @memberjunction/encryption@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1
- @memberjunction/queue@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/aiengine@5.4.0
  - @memberjunction/ai-vector-dupe@5.4.0
  - @memberjunction/actions-base@5.4.0
  - @memberjunction/actions@5.4.0
  - @memberjunction/encryption@5.4.0
  - @memberjunction/queue@5.4.0
  - @memberjunction/ai-provider-bundle@5.4.0
  - @memberjunction/ai@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai@5.3.1
- @memberjunction/aiengine@5.3.1
- @memberjunction/ai-provider-bundle@5.3.1
- @memberjunction/ai-vector-dupe@5.3.1
- @memberjunction/actions-base@5.3.1
- @memberjunction/actions@5.3.1
- @memberjunction/encryption@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1
- @memberjunction/queue@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/aiengine@5.3.0
  - @memberjunction/ai-vector-dupe@5.3.0
  - @memberjunction/actions-base@5.3.0
  - @memberjunction/actions@5.3.0
  - @memberjunction/encryption@5.3.0
  - @memberjunction/queue@5.3.0
  - @memberjunction/ai-provider-bundle@5.3.0
  - @memberjunction/ai@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Minor Changes

- 06d889c: metadata -> migration
- 3542cb6: metadata -> migration

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/aiengine@5.2.0
  - @memberjunction/ai-vector-dupe@5.2.0
  - @memberjunction/actions-base@5.2.0
  - @memberjunction/actions@5.2.0
  - @memberjunction/encryption@5.2.0
  - @memberjunction/queue@5.2.0
  - @memberjunction/ai-provider-bundle@5.2.0
  - @memberjunction/ai@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai@5.1.0
  - @memberjunction/aiengine@5.1.0
  - @memberjunction/ai-vector-dupe@5.1.0
  - @memberjunction/actions-base@5.1.0
  - @memberjunction/actions@5.1.0
  - @memberjunction/encryption@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/queue@5.1.0
  - @memberjunction/ai-provider-bundle@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Minor Changes

- a3e7cb6: migration

### Patch Changes

- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ai@5.0.0
  - @memberjunction/aiengine@5.0.0
  - @memberjunction/ai-provider-bundle@5.0.0
  - @memberjunction/ai-vector-dupe@5.0.0
  - @memberjunction/actions-base@5.0.0
  - @memberjunction/actions@5.0.0
  - @memberjunction/encryption@5.0.0
  - @memberjunction/global@5.0.0
  - @memberjunction/queue@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
- Updated dependencies [3bab2cd]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-provider-bundle@4.4.0
  - @memberjunction/aiengine@4.4.0
  - @memberjunction/ai-vector-dupe@4.4.0
  - @memberjunction/actions-base@4.4.0
  - @memberjunction/actions@4.4.0
  - @memberjunction/encryption@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/queue@4.4.0
  - @memberjunction/ai@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai@4.3.1
- @memberjunction/aiengine@4.3.1
- @memberjunction/ai-provider-bundle@4.3.1
- @memberjunction/ai-vector-dupe@4.3.1
- @memberjunction/actions-base@4.3.1
- @memberjunction/actions@4.3.1
- @memberjunction/encryption@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1
- @memberjunction/queue@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/aiengine@4.3.0
  - @memberjunction/ai-vector-dupe@4.3.0
  - @memberjunction/actions-base@4.3.0
  - @memberjunction/actions@4.3.0
  - @memberjunction/encryption@4.3.0
  - @memberjunction/queue@4.3.0
  - @memberjunction/ai-provider-bundle@4.3.0
  - @memberjunction/ai@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai@4.2.0
- @memberjunction/aiengine@4.2.0
- @memberjunction/ai-provider-bundle@4.2.0
- @memberjunction/ai-vector-dupe@4.2.0
- @memberjunction/actions-base@4.2.0
- @memberjunction/actions@4.2.0
- @memberjunction/encryption@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0
- @memberjunction/queue@4.2.0

## 4.1.0

### Patch Changes

- f54a9e4: no migration
- 9fab8ca: ESM Compatibility
- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/aiengine@4.1.0
  - @memberjunction/ai-vector-dupe@4.1.0
  - @memberjunction/actions-base@4.1.0
  - @memberjunction/actions@4.1.0
  - @memberjunction/encryption@4.1.0
  - @memberjunction/queue@4.1.0
  - @memberjunction/ai-provider-bundle@4.1.0
  - @memberjunction/ai@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- 65b4274: migration
- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [2f86270]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/aiengine@4.0.0
  - @memberjunction/ai@4.0.0
  - @memberjunction/ai-provider-bundle@4.0.0
  - @memberjunction/ai-vector-dupe@4.0.0
  - @memberjunction/actions-base@4.0.0
  - @memberjunction/actions@4.0.0
  - @memberjunction/encryption@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0
  - @memberjunction/queue@4.0.0

## 3.4.0

### Minor Changes

- 3a71e4e: Fix large text field corruptions, cross-platform improvements, more robust environment variable parsing for boolean values

### Patch Changes

- 18b4e65: Add field-level encryption for credential values with automatic decryption, Box.com OAuth credential type, comprehensive JSON Schema validation, and fix credential editor to prevent "undefined" text in fields
- Updated dependencies [d596467]
- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/ai-provider-bundle@3.4.0
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/queue@3.4.0
  - @memberjunction/actions@3.4.0
  - @memberjunction/aiengine@3.4.0
  - @memberjunction/ai-vector-dupe@3.4.0
  - @memberjunction/actions-base@3.4.0
  - @memberjunction/encryption@3.4.0
  - @memberjunction/ai@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
- Updated dependencies [da33601]
- Updated dependencies [3f17579]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/encryption@3.3.0
  - @memberjunction/aiengine@3.3.0
  - @memberjunction/ai-vector-dupe@3.3.0
  - @memberjunction/actions-base@3.3.0
  - @memberjunction/actions@3.3.0
  - @memberjunction/queue@3.3.0
  - @memberjunction/ai-provider-bundle@3.3.0
  - @memberjunction/ai@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/aiengine@3.2.0
  - @memberjunction/ai-vector-dupe@3.2.0
  - @memberjunction/actions-base@3.2.0
  - @memberjunction/actions@3.2.0
  - @memberjunction/encryption@3.2.0
  - @memberjunction/queue@3.2.0
  - @memberjunction/ai-provider-bundle@3.2.0
  - @memberjunction/ai@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ai@3.1.1
- @memberjunction/aiengine@3.1.1
- @memberjunction/ai-provider-bundle@3.1.1
- @memberjunction/ai-vector-dupe@3.1.1
- @memberjunction/actions-base@3.1.1
- @memberjunction/actions@3.1.1
- @memberjunction/encryption@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/global@3.1.1
- @memberjunction/queue@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai@3.0.0
- @memberjunction/aiengine@3.0.0
- @memberjunction/ai-provider-bundle@3.0.0
- @memberjunction/ai-vector-dupe@3.0.0
- @memberjunction/actions-base@3.0.0
- @memberjunction/actions@3.0.0
- @memberjunction/encryption@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/global@3.0.0
- @memberjunction/queue@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/aiengine@2.133.0
  - @memberjunction/ai-vector-dupe@2.133.0
  - @memberjunction/actions-base@2.133.0
  - @memberjunction/actions@2.133.0
  - @memberjunction/encryption@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/queue@2.133.0
  - @memberjunction/ai-provider-bundle@2.133.0
  - @memberjunction/ai@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/aiengine@2.132.0
  - @memberjunction/ai-vector-dupe@2.132.0
  - @memberjunction/actions-base@2.132.0
  - @memberjunction/actions@2.132.0
  - @memberjunction/encryption@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/queue@2.132.0
  - @memberjunction/ai-provider-bundle@2.132.0
  - @memberjunction/ai@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/aiengine@2.131.0
  - @memberjunction/ai-vector-dupe@2.131.0
  - @memberjunction/actions-base@2.131.0
  - @memberjunction/actions@2.131.0
  - @memberjunction/encryption@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/queue@2.131.0
  - @memberjunction/ai-provider-bundle@2.131.0
  - @memberjunction/ai@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/ai@2.130.1
- @memberjunction/aiengine@2.130.1
- @memberjunction/ai-provider-bundle@2.130.1
- @memberjunction/ai-vector-dupe@2.130.1
- @memberjunction/actions-base@2.130.1
- @memberjunction/actions@2.130.1
- @memberjunction/encryption@2.130.1
- @memberjunction/core@2.130.1
- @memberjunction/core-entities@2.130.1
- @memberjunction/global@2.130.1
- @memberjunction/queue@2.130.1

## 2.130.0

### Minor Changes

- 83ae347: migrations

### Patch Changes

- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/ai@2.130.0
  - @memberjunction/aiengine@2.130.0
  - @memberjunction/ai-provider-bundle@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/ai-vector-dupe@2.130.0
  - @memberjunction/actions@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/queue@2.130.0
  - @memberjunction/actions-base@2.130.0
  - @memberjunction/encryption@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Minor Changes

- fbae243: migration
- c7e38aa: migration

### Patch Changes

- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/encryption@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/aiengine@2.129.0
  - @memberjunction/ai-provider-bundle@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/ai-vector-dupe@2.129.0
  - @memberjunction/actions-base@2.129.0
  - @memberjunction/actions@2.129.0
  - @memberjunction/queue@2.129.0
  - @memberjunction/ai@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
- Updated dependencies [5f70858]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/ai-provider-bundle@2.128.0
  - @memberjunction/aiengine@2.128.0
  - @memberjunction/ai-vector-dupe@2.128.0
  - @memberjunction/actions-base@2.128.0
  - @memberjunction/actions@2.128.0
  - @memberjunction/queue@2.128.0
  - @memberjunction/ai@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/aiengine@2.127.0
  - @memberjunction/actions@2.127.0
  - @memberjunction/ai-vector-dupe@2.127.0
  - @memberjunction/actions-base@2.127.0
  - @memberjunction/queue@2.127.0
  - @memberjunction/ai@2.127.0
  - @memberjunction/ai-provider-bundle@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/ai@2.126.1
- @memberjunction/aiengine@2.126.1
- @memberjunction/ai-provider-bundle@2.126.1
- @memberjunction/ai-vector-dupe@2.126.1
- @memberjunction/actions-base@2.126.1
- @memberjunction/actions@2.126.1
- @memberjunction/core@2.126.1
- @memberjunction/core-entities@2.126.1
- @memberjunction/global@2.126.1
- @memberjunction/queue@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [703221e]
  - @memberjunction/core@2.126.0
  - @memberjunction/aiengine@2.126.0
  - @memberjunction/ai-vector-dupe@2.126.0
  - @memberjunction/actions-base@2.126.0
  - @memberjunction/actions@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/queue@2.126.0
  - @memberjunction/ai-provider-bundle@2.126.0
  - @memberjunction/ai@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/aiengine@2.125.0
  - @memberjunction/ai-vector-dupe@2.125.0
  - @memberjunction/actions-base@2.125.0
  - @memberjunction/actions@2.125.0
  - @memberjunction/queue@2.125.0
  - @memberjunction/ai-provider-bundle@2.125.0
  - @memberjunction/ai@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/aiengine@2.124.0
  - @memberjunction/ai-vector-dupe@2.124.0
  - @memberjunction/actions-base@2.124.0
  - @memberjunction/actions@2.124.0
  - @memberjunction/queue@2.124.0
  - @memberjunction/ai-provider-bundle@2.124.0
  - @memberjunction/ai@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai@2.123.1
- @memberjunction/aiengine@2.123.1
- @memberjunction/ai-provider-bundle@2.123.1
- @memberjunction/ai-vector-dupe@2.123.1
- @memberjunction/actions-base@2.123.1
- @memberjunction/actions@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1
- @memberjunction/queue@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/aiengine@2.123.0
- @memberjunction/actions@2.123.0
- @memberjunction/ai-vector-dupe@2.123.0
- @memberjunction/queue@2.123.0
- @memberjunction/ai-provider-bundle@2.123.0
- @memberjunction/ai@2.123.0
- @memberjunction/actions-base@2.123.0
- @memberjunction/core@2.123.0
- @memberjunction/core-entities@2.123.0
- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
- Updated dependencies [81f0c44]
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/ai-provider-bundle@2.122.2
  - @memberjunction/actions@2.122.2
  - @memberjunction/ai-vector-dupe@2.122.2
  - @memberjunction/aiengine@2.122.2
  - @memberjunction/actions-base@2.122.2
  - @memberjunction/queue@2.122.2
  - @memberjunction/ai@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/ai@2.122.1
- @memberjunction/aiengine@2.122.1
- @memberjunction/ai-provider-bundle@2.122.1
- @memberjunction/ai-vector-dupe@2.122.1
- @memberjunction/actions@2.122.1
- @memberjunction/core@2.122.1
- @memberjunction/core-entities@2.122.1
- @memberjunction/global@2.122.1
- @memberjunction/queue@2.122.1

## 2.122.0

### Patch Changes

- 6de83ec: Add component linter enhancements with type inference and control flow analysis, DBAutoDoc query generation features, MCP server diagnostic tools, metadata sync improvements, and enhanced JWKS client with HTTP keep-alive connections and connection pooling to prevent socket hangups
- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/aiengine@2.122.0
  - @memberjunction/ai-vector-dupe@2.122.0
  - @memberjunction/actions@2.122.0
  - @memberjunction/queue@2.122.0
  - @memberjunction/ai-provider-bundle@2.122.0
  - @memberjunction/ai@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/ai@2.121.0
  - @memberjunction/aiengine@2.121.0
  - @memberjunction/ai-vector-dupe@2.121.0
  - @memberjunction/actions@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/queue@2.121.0
  - @memberjunction/ai-provider-bundle@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/aiengine@2.120.0
  - @memberjunction/ai-vector-dupe@2.120.0
  - @memberjunction/actions@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/queue@2.120.0
  - @memberjunction/ai@2.120.0
  - @memberjunction/ai-provider-bundle@2.120.0
  - @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- Updated dependencies [7dd7cca]
  - @memberjunction/core@2.119.0
  - @memberjunction/aiengine@2.119.0
  - @memberjunction/ai-vector-dupe@2.119.0
  - @memberjunction/actions@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/queue@2.119.0
  - @memberjunction/ai@2.119.0
  - @memberjunction/ai-provider-bundle@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Patch Changes

- Updated dependencies [264c57a]
- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/aiengine@2.118.0
  - @memberjunction/ai-vector-dupe@2.118.0
  - @memberjunction/actions@2.118.0
  - @memberjunction/queue@2.118.0
  - @memberjunction/ai@2.118.0
  - @memberjunction/ai-provider-bundle@2.118.0
  - @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [8c092ec]
  - @memberjunction/core@2.117.0
  - @memberjunction/aiengine@2.117.0
  - @memberjunction/ai-vector-dupe@2.117.0
  - @memberjunction/actions@2.117.0
  - @memberjunction/core-entities@2.117.0
  - @memberjunction/queue@2.117.0
  - @memberjunction/ai@2.117.0
  - @memberjunction/ai-provider-bundle@2.117.0
  - @memberjunction/global@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [81bb7a4]
- Updated dependencies [a8d5592]
  - @memberjunction/core@2.116.0
  - @memberjunction/global@2.116.0
  - @memberjunction/aiengine@2.116.0
  - @memberjunction/ai-vector-dupe@2.116.0
  - @memberjunction/actions@2.116.0
  - @memberjunction/core-entities@2.116.0
  - @memberjunction/queue@2.116.0
  - @memberjunction/ai@2.116.0
  - @memberjunction/ai-provider-bundle@2.116.0

## 2.115.0

### Patch Changes

- Updated dependencies [2e0fe8b]
  - @memberjunction/aiengine@2.115.0
  - @memberjunction/ai-vector-dupe@2.115.0
  - @memberjunction/actions@2.115.0
  - @memberjunction/queue@2.115.0
  - @memberjunction/ai@2.115.0
  - @memberjunction/ai-provider-bundle@2.115.0
  - @memberjunction/core@2.115.0
  - @memberjunction/core-entities@2.115.0
  - @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/ai@2.114.0
- @memberjunction/aiengine@2.114.0
- @memberjunction/ai-provider-bundle@2.114.0
- @memberjunction/ai-vector-dupe@2.114.0
- @memberjunction/actions@2.114.0
- @memberjunction/core@2.114.0
- @memberjunction/core-entities@2.114.0
- @memberjunction/global@2.114.0
- @memberjunction/queue@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/aiengine@2.113.2
  - @memberjunction/ai-vector-dupe@2.113.2
  - @memberjunction/actions@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/queue@2.113.2
  - @memberjunction/ai@2.113.2
  - @memberjunction/ai-provider-bundle@2.113.2
  - @memberjunction/global@2.113.2

## 2.112.0

### Patch Changes

- e237ca9: - Optimize AIEngine embedding generation to eliminate wasteful auto-refresh regeneration (~3s → <1ms)
  - Enhance Skip artifact retrieval with optimized query and conversationDetailID for reliable modification workflow
  - Add Query Parameter Processor to SQLServerDataProvider index exports
  - Replace 4 RunView calls with single optimized query for Skip artifact retrieval
- Updated dependencies [e237ca9]
- Updated dependencies [c126b59]
  - @memberjunction/aiengine@2.112.0
  - @memberjunction/global@2.112.0
  - @memberjunction/ai-vector-dupe@2.112.0
  - @memberjunction/actions@2.112.0
  - @memberjunction/queue@2.112.0
  - @memberjunction/ai@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0
  - @memberjunction/ai-provider-bundle@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ai@2.110.1
- @memberjunction/aiengine@2.110.1
- @memberjunction/ai-provider-bundle@2.110.1
- @memberjunction/ai-vector-dupe@2.110.1
- @memberjunction/actions@2.110.1
- @memberjunction/core@2.110.1
- @memberjunction/core-entities@2.110.1
- @memberjunction/global@2.110.1
- @memberjunction/queue@2.110.1

## 2.110.0

### Patch Changes

- 02d72ff: - Sort Zod schema entity field values by sequence in CodeGen for consistent ordering
  - Add unique constraints to QueryCategory and Query tables to prevent duplicates
  - Improve concurrent query creation handling in CreateQueryResolver
  - Fix metadata provider usage in entity server classes
  - Remove automatic error logging from SQLServerDataProvider
- Updated dependencies [02d72ff]
- Updated dependencies [d2d7ab9]
- Updated dependencies [c8b9aca]
  - @memberjunction/core-entities@2.110.0
  - @memberjunction/aiengine@2.110.0
  - @memberjunction/ai-vector-dupe@2.110.0
  - @memberjunction/actions@2.110.0
  - @memberjunction/queue@2.110.0
  - @memberjunction/ai@2.110.0
  - @memberjunction/ai-provider-bundle@2.110.0
  - @memberjunction/core@2.110.0
  - @memberjunction/global@2.110.0

## 2.109.0

### Patch Changes

- Updated dependencies [6e45c17]
- Updated dependencies [a38989b]
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/aiengine@2.109.0
  - @memberjunction/ai-vector-dupe@2.109.0
  - @memberjunction/actions@2.109.0
  - @memberjunction/queue@2.109.0
  - @memberjunction/ai@2.109.0
  - @memberjunction/ai-provider-bundle@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0

## 2.108.0

### Patch Changes

- Updated dependencies [687e2ae]
- Updated dependencies [656d86c]
  - @memberjunction/aiengine@2.108.0
  - @memberjunction/ai@2.108.0
  - @memberjunction/actions@2.108.0
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/ai-vector-dupe@2.108.0
  - @memberjunction/queue@2.108.0
  - @memberjunction/ai-provider-bundle@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/ai@2.107.0
- @memberjunction/aiengine@2.107.0
- @memberjunction/ai-provider-bundle@2.107.0
- @memberjunction/ai-vector-dupe@2.107.0
- @memberjunction/actions@2.107.0
- @memberjunction/core@2.107.0
- @memberjunction/core-entities@2.107.0
- @memberjunction/global@2.107.0
- @memberjunction/queue@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ai@2.106.0
- @memberjunction/aiengine@2.106.0
- @memberjunction/ai-provider-bundle@2.106.0
- @memberjunction/ai-vector-dupe@2.106.0
- @memberjunction/actions@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/core-entities@2.106.0
- @memberjunction/global@2.106.0
- @memberjunction/queue@2.106.0

## 2.105.0

### Patch Changes

- 9b67e0c: This release addresses critical stability issues across build processes, runtime execution, and AI model management in the MemberJunction platform. The changes focus on three main areas: production build reliability, database migration consistency, and intelligent AI error handling.

  Resolved critical issues where Angular production builds with optimization enabled would remove essential classes through aggressive tree-shaking. Moved `TemplateEntityExtended` to `@memberjunction/core-entities` and created new `@memberjunction/ai-provider-bundle` package to centralize AI provider loading while maintaining clean separation between core infrastructure and provider implementations. Added `LoadEntityCommunicationsEngineClient()` calls to prevent removal of inherited singleton methods. These changes prevent runtime errors in production deployments where previously registered classes would become inaccessible, while improving architectural separation of concerns.

  Enhanced CodeGen SQL generation to use `IF OBJECT_ID()` patterns instead of `DROP ... IF EXISTS` syntax, fixing silent failures with Flyway placeholder substitution. Improved validator generation to properly handle nullable fields and correctly set `result.Success` status. Centralized GraphQL type name generation using schema-aware naming (`{schema}_{basetable}_`) to eliminate type collisions between entities with identical base table names across different schemas. These changes ensure reliable database migrations and prevent recurring cascade delete regressions.

  Implemented sophisticated error classification with new `NoCredit` error type for billing failures, message-first error detection, and permissive failover for 403 errors. Added hierarchical configuration-aware failover that respects configuration boundaries (Production vs Development models) while maintaining candidate list caching for performance. Enhanced error analysis to properly classify credit/quota issues and enable appropriate failover behavior.

  Improved model selection caching by checking all candidates for valid API keys instead of stopping at first match, ensuring retry logic has access to complete list of viable model/vendor combinations. Added `extractValidCandidates()` method to `AIModelSelectionInfo` class and `buildCandidatesFromSelectionInfo()` helper to properly reconstruct candidate lists from selection metadata during hierarchical template execution.

  Enhanced error-based retry and failover with intelligent handling for authentication and rate limit errors. Authentication errors now trigger vendor-level filtering (excluding all models from vendors with invalid API keys) and immediate failover to different vendors. Rate limit errors now retry the same model/vendor using configurable `MaxRetries` (default: 3) with backoff delay based on `RetryStrategy` (Fixed/Linear/Exponential) before failing over. Improved log messages with human-readable formatting showing model/vendor names, time in seconds, and clear status indicators. Fixed MJCLI sync commands to properly propagate exit codes for CI/CD integration.

- Updated dependencies [4807f35]
- Updated dependencies [9b67e0c]
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/ai@2.105.0
  - @memberjunction/aiengine@2.105.0
  - @memberjunction/ai-provider-bundle@2.105.0
  - @memberjunction/queue@2.105.0
  - @memberjunction/actions@2.105.0
  - @memberjunction/ai-vector-dupe@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Patch Changes

- 6e7f14a: Fix stored procedure name construction for entities with special characters in
  names. Changed fallback logic to use `BaseTableCodeName` instead of `ClassName`
  when `spCreate`, `spUpdate`, or `spDelete` fields are null. This prevents
  incorrect SP names like `spUpdateMJ_ComponentLibraries` (from ClassName) and
  ensures correct names like `spUpdateComponentLibrary` (from BaseTableCodeName)
  that match actual database stored procedures.
- Updated dependencies [2ff5428]
- Updated dependencies [9ad6353]
  - @memberjunction/global@2.104.0
  - @memberjunction/core-entities@2.104.0
  - @memberjunction/actions@2.104.0
  - @memberjunction/ai@2.104.0
  - @memberjunction/aiengine@2.104.0
  - @memberjunction/ai-vector-dupe@2.104.0
  - @memberjunction/core@2.104.0
  - @memberjunction/queue@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
- Updated dependencies [3ba01de]
- Updated dependencies [a38eec3]
  - @memberjunction/core@2.103.0
  - @memberjunction/ai-vector-dupe@2.103.0
  - @memberjunction/actions@2.103.0
  - @memberjunction/core-entities@2.103.0
  - @memberjunction/aiengine@2.103.0
  - @memberjunction/global@2.103.0
  - @memberjunction/ai@2.103.0
  - @memberjunction/queue@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/core-entities@2.100.3
- @memberjunction/aiengine@2.100.3
- @memberjunction/ai-vector-dupe@2.100.3
- @memberjunction/actions@2.100.3
- @memberjunction/queue@2.100.3
- @memberjunction/ai@2.100.3
- @memberjunction/core@2.100.3
- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/ai@2.100.2
- @memberjunction/aiengine@2.100.2
- @memberjunction/ai-vector-dupe@2.100.2
- @memberjunction/actions@2.100.2
- @memberjunction/core@2.100.2
- @memberjunction/core-entities@2.100.2
- @memberjunction/global@2.100.2
- @memberjunction/queue@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/ai@2.100.1
- @memberjunction/aiengine@2.100.1
- @memberjunction/ai-vector-dupe@2.100.1
- @memberjunction/actions@2.100.1
- @memberjunction/core@2.100.1
- @memberjunction/core-entities@2.100.1
- @memberjunction/global@2.100.1
- @memberjunction/queue@2.100.1

## 2.100.0

### Patch Changes

- Updated dependencies [5f76e3a]
- Updated dependencies [ffc2c1a]
  - @memberjunction/core@2.100.0
  - @memberjunction/core-entities@2.100.0
  - @memberjunction/aiengine@2.100.0
  - @memberjunction/ai-vector-dupe@2.100.0
  - @memberjunction/actions@2.100.0
  - @memberjunction/queue@2.100.0
  - @memberjunction/ai@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- Updated dependencies [eb7677d]
- Updated dependencies [8bbb0a9]
  - @memberjunction/core-entities@2.99.0
  - @memberjunction/core@2.99.0
  - @memberjunction/aiengine@2.99.0
  - @memberjunction/ai-vector-dupe@2.99.0
  - @memberjunction/actions@2.99.0
  - @memberjunction/queue@2.99.0
  - @memberjunction/ai@2.99.0
  - @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/ai@2.98.0
- @memberjunction/aiengine@2.98.0
- @memberjunction/ai-vector-dupe@2.98.0
- @memberjunction/actions@2.98.0
- @memberjunction/core@2.98.0
- @memberjunction/core-entities@2.98.0
- @memberjunction/global@2.98.0
- @memberjunction/queue@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/core-entities@2.97.0
- @memberjunction/aiengine@2.97.0
- @memberjunction/ai-vector-dupe@2.97.0
- @memberjunction/actions@2.97.0
- @memberjunction/queue@2.97.0
- @memberjunction/ai@2.97.0
- @memberjunction/core@2.97.0
- @memberjunction/global@2.97.0

## 2.96.0

### Patch Changes

- Updated dependencies [01dcfde]
  - @memberjunction/core@2.96.0
  - @memberjunction/aiengine@2.96.0
  - @memberjunction/ai-vector-dupe@2.96.0
  - @memberjunction/actions@2.96.0
  - @memberjunction/core-entities@2.96.0
  - @memberjunction/queue@2.96.0
  - @memberjunction/ai@2.96.0
  - @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- Updated dependencies [a54c014]
  - @memberjunction/core@2.95.0
  - @memberjunction/aiengine@2.95.0
  - @memberjunction/ai-vector-dupe@2.95.0
  - @memberjunction/actions@2.95.0
  - @memberjunction/core-entities@2.95.0
  - @memberjunction/queue@2.95.0
  - @memberjunction/ai@2.95.0
  - @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/core-entities@2.94.0
- @memberjunction/aiengine@2.94.0
- @memberjunction/ai-vector-dupe@2.94.0
- @memberjunction/actions@2.94.0
- @memberjunction/queue@2.94.0
- @memberjunction/ai@2.94.0
- @memberjunction/core@2.94.0
- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- f8757aa: bug fixes
- Updated dependencies [f8757aa]
- Updated dependencies [103e4a9]
- Updated dependencies [7f465b5]
  - @memberjunction/core@2.93.0
  - @memberjunction/core-entities@2.93.0
  - @memberjunction/aiengine@2.93.0
  - @memberjunction/ai-vector-dupe@2.93.0
  - @memberjunction/actions@2.93.0
  - @memberjunction/queue@2.93.0
  - @memberjunction/ai@2.93.0
  - @memberjunction/global@2.93.0

## 2.92.0

### Minor Changes

- 8fb03df: migrations

### Patch Changes

- Updated dependencies [8fb03df]
- Updated dependencies [5817bac]
  - @memberjunction/core@2.92.0
  - @memberjunction/core-entities@2.92.0
  - @memberjunction/aiengine@2.92.0
  - @memberjunction/ai-vector-dupe@2.92.0
  - @memberjunction/actions@2.92.0
  - @memberjunction/queue@2.92.0
  - @memberjunction/ai@2.92.0
  - @memberjunction/global@2.92.0

## 2.91.0

### Patch Changes

- Updated dependencies [f703033]
- Updated dependencies [6476d74]
  - @memberjunction/core@2.91.0
  - @memberjunction/core-entities@2.91.0
  - @memberjunction/aiengine@2.91.0
  - @memberjunction/ai-vector-dupe@2.91.0
  - @memberjunction/actions@2.91.0
  - @memberjunction/queue@2.91.0
  - @memberjunction/ai@2.91.0
  - @memberjunction/global@2.91.0

## 2.90.0

### Patch Changes

- Updated dependencies [146ebcc]
- Updated dependencies [d5d26d7]
- Updated dependencies [1e7eb76]
  - @memberjunction/aiengine@2.90.0
  - @memberjunction/core@2.90.0
  - @memberjunction/core-entities@2.90.0
  - @memberjunction/ai-vector-dupe@2.90.0
  - @memberjunction/actions@2.90.0
  - @memberjunction/queue@2.90.0
  - @memberjunction/ai@2.90.0
  - @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- 34d456e: Patch issues with GraphQLClientUser creating and running queries.
- Updated dependencies [d1911ed]
  - @memberjunction/core-entities@2.89.0
  - @memberjunction/aiengine@2.89.0
  - @memberjunction/actions@2.89.0
  - @memberjunction/ai-vector-dupe@2.89.0
  - @memberjunction/queue@2.89.0
  - @memberjunction/ai@2.89.0
  - @memberjunction/core@2.89.0
  - @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- 56257ed: Fix RunView pagination implementation
  - Added StartRow parameter support for server-side pagination
  - Fixed SQL generation to prevent TOP and OFFSET/FETCH conflicts
  - Improved total row count calculation for paginated queries
  - Ensures proper parameter passing through GraphQL to SQL layer

  Fixes issue where pagination parameters were lost in the RunView processing chain, preventing proper
  server-side pagination from working.

- Updated dependencies [df4031f]
  - @memberjunction/core-entities@2.88.0
  - @memberjunction/aiengine@2.88.0
  - @memberjunction/ai-vector-dupe@2.88.0
  - @memberjunction/actions@2.88.0
  - @memberjunction/queue@2.88.0
  - @memberjunction/ai@2.88.0
  - @memberjunction/core@2.88.0
  - @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- Updated dependencies [58a00df]
  - @memberjunction/core@2.87.0
  - @memberjunction/aiengine@2.87.0
  - @memberjunction/ai-vector-dupe@2.87.0
  - @memberjunction/actions@2.87.0
  - @memberjunction/core-entities@2.87.0
  - @memberjunction/queue@2.87.0
  - @memberjunction/ai@2.87.0
  - @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- Updated dependencies [7dd2409]
  - @memberjunction/core-entities@2.86.0
  - @memberjunction/aiengine@2.86.0
  - @memberjunction/ai-vector-dupe@2.86.0
  - @memberjunction/actions@2.86.0
  - @memberjunction/queue@2.86.0
  - @memberjunction/ai@2.86.0
  - @memberjunction/core@2.86.0
  - @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- Updated dependencies [a96c1a7]
- Updated dependencies [747455a]
  - @memberjunction/ai@2.85.0
  - @memberjunction/core-entities@2.85.0
  - @memberjunction/aiengine@2.85.0
  - @memberjunction/ai-vector-dupe@2.85.0
  - @memberjunction/actions@2.85.0
  - @memberjunction/queue@2.85.0
  - @memberjunction/core@2.85.0
  - @memberjunction/global@2.85.0

## 2.84.0

### Minor Changes

- 0b9d691: Changes to MJCore/SQLServerDataProvider/GraphQLDataProvider to ensure that calls handle pre/post processing of RunView/RunViews properly regardless of entry point to the provider.

### Patch Changes

- Updated dependencies [0b9d691]
  - @memberjunction/core@2.84.0
  - @memberjunction/aiengine@2.84.0
  - @memberjunction/ai-vector-dupe@2.84.0
  - @memberjunction/actions@2.84.0
  - @memberjunction/core-entities@2.84.0
  - @memberjunction/queue@2.84.0
  - @memberjunction/ai@2.84.0
  - @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- Updated dependencies [e2e0415]
- Updated dependencies [1dc69bf]
  - @memberjunction/core@2.83.0
  - @memberjunction/aiengine@2.83.0
  - @memberjunction/ai-vector-dupe@2.83.0
  - @memberjunction/actions@2.83.0
  - @memberjunction/core-entities@2.83.0
  - @memberjunction/queue@2.83.0
  - @memberjunction/ai@2.83.0
  - @memberjunction/global@2.83.0

## 2.82.0

### Patch Changes

- Updated dependencies [2186d7b]
- Updated dependencies [975e8d1]
  - @memberjunction/core-entities@2.82.0
  - @memberjunction/aiengine@2.82.0
  - @memberjunction/ai-vector-dupe@2.82.0
  - @memberjunction/actions@2.82.0
  - @memberjunction/queue@2.82.0
  - @memberjunction/ai@2.82.0
  - @memberjunction/core@2.82.0
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

- Updated dependencies [6d2d478]
- Updated dependencies [e623f99]
- Updated dependencies [971c5d4]
  - @memberjunction/core@2.81.0
  - @memberjunction/core-entities@2.81.0
  - @memberjunction/aiengine@2.81.0
  - @memberjunction/ai-vector-dupe@2.81.0
  - @memberjunction/actions@2.81.0
  - @memberjunction/queue@2.81.0
  - @memberjunction/ai@2.81.0
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/ai@2.80.1
- @memberjunction/aiengine@2.80.1
- @memberjunction/ai-vector-dupe@2.80.1
- @memberjunction/actions@2.80.1
- @memberjunction/core@2.80.1
- @memberjunction/core-entities@2.80.1
- @memberjunction/global@2.80.1
- @memberjunction/queue@2.80.1

## 2.80.0

### Patch Changes

- 7c5f844: Bug fixes for SQLServerDataProvider and fix ability to use other providers for MD refreshes up and down the stack
- Updated dependencies [7c5f844]
- Updated dependencies [d03dfae]
  - @memberjunction/core@2.80.0
  - @memberjunction/core-entities@2.80.0
  - @memberjunction/aiengine@2.80.0
  - @memberjunction/ai-vector-dupe@2.80.0
  - @memberjunction/actions@2.80.0
  - @memberjunction/queue@2.80.0
  - @memberjunction/ai@2.80.0
  - @memberjunction/global@2.80.0

## 2.79.0

### Patch Changes

- Updated dependencies [4bf2634]
- Updated dependencies [907e73f]
- Updated dependencies [bad1a60]
  - @memberjunction/core-entities@2.79.0
  - @memberjunction/global@2.79.0
  - @memberjunction/ai@2.79.0
  - @memberjunction/actions@2.79.0
  - @memberjunction/aiengine@2.79.0
  - @memberjunction/ai-vector-dupe@2.79.0
  - @memberjunction/queue@2.79.0
  - @memberjunction/core@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [ef7c014]
- Updated dependencies [06088e5]
  - @memberjunction/ai@2.78.0
  - @memberjunction/core-entities@2.78.0
  - @memberjunction/aiengine@2.78.0
  - @memberjunction/ai-vector-dupe@2.78.0
  - @memberjunction/actions@2.78.0
  - @memberjunction/queue@2.78.0
  - @memberjunction/core@2.78.0
  - @memberjunction/global@2.78.0

## 2.77.0

### Minor Changes

- d8f14a2: significant changes in all of these
- c91269e: migration file for permissions driving minor bump

### Patch Changes

- 476a458: minor comment
- Updated dependencies [d8f14a2]
- Updated dependencies [8ee0d86]
- Updated dependencies [c91269e]
  - @memberjunction/core@2.77.0
  - @memberjunction/core-entities@2.77.0
  - @memberjunction/aiengine@2.77.0
  - @memberjunction/ai-vector-dupe@2.77.0
  - @memberjunction/actions@2.77.0
  - @memberjunction/queue@2.77.0
  - @memberjunction/ai@2.77.0
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

- Updated dependencies [4b27b3c]
- Updated dependencies [7dabb22]
- Updated dependencies [ffda243]
  - @memberjunction/core-entities@2.76.0
  - @memberjunction/core@2.76.0
  - @memberjunction/aiengine@2.76.0
  - @memberjunction/ai-vector-dupe@2.76.0
  - @memberjunction/actions@2.76.0
  - @memberjunction/queue@2.76.0
  - @memberjunction/ai@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- @memberjunction/actions@2.75.0
- @memberjunction/ai@2.75.0
- @memberjunction/aiengine@2.75.0
- @memberjunction/ai-vector-dupe@2.75.0
- @memberjunction/core@2.75.0
- @memberjunction/core-entities@2.75.0
- @memberjunction/global@2.75.0
- @memberjunction/queue@2.75.0

## 2.74.0

### Patch Changes

- Updated dependencies [b70301e]
- Updated dependencies [d316670]
  - @memberjunction/core-entities@2.74.0
  - @memberjunction/core@2.74.0
  - @memberjunction/aiengine@2.74.0
  - @memberjunction/ai-vector-dupe@2.74.0
  - @memberjunction/actions@2.74.0
  - @memberjunction/queue@2.74.0
  - @memberjunction/ai@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- Updated dependencies [26c2b03]
- Updated dependencies [e99336f]
- Updated dependencies [eebfb9a]
  - @memberjunction/aiengine@2.73.0
  - @memberjunction/core-entities@2.73.0
  - @memberjunction/ai@2.73.0
  - @memberjunction/ai-vector-dupe@2.73.0
  - @memberjunction/actions@2.73.0
  - @memberjunction/queue@2.73.0
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- Updated dependencies [636b6ee]
  - @memberjunction/core-entities@2.72.0
  - @memberjunction/aiengine@2.72.0
  - @memberjunction/ai-vector-dupe@2.72.0
  - @memberjunction/actions@2.72.0
  - @memberjunction/queue@2.72.0
  - @memberjunction/ai@2.72.0
  - @memberjunction/core@2.72.0
  - @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0
  - @memberjunction/ai@2.71.0
  - @memberjunction/aiengine@2.71.0
  - @memberjunction/ai-vector-dupe@2.71.0
  - @memberjunction/actions@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/core-entities@2.71.0
  - @memberjunction/queue@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/ai@2.70.0
  - @memberjunction/aiengine@2.70.0
  - @memberjunction/ai-vector-dupe@2.70.0
  - @memberjunction/actions@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/core-entities@2.70.0
  - @memberjunction/queue@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/aiengine@2.69.1
  - @memberjunction/ai-vector-dupe@2.69.1
  - @memberjunction/actions@2.69.1
  - @memberjunction/core-entities@2.69.1
  - @memberjunction/queue@2.69.1
  - @memberjunction/ai@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0
  - @memberjunction/actions@2.69.0
  - @memberjunction/aiengine@2.69.0
  - @memberjunction/ai-vector-dupe@2.69.0
  - @memberjunction/core-entities@2.69.0
  - @memberjunction/queue@2.69.0
  - @memberjunction/ai@2.69.0

## 2.68.0

### Minor Changes

- a6b43d0: major changes to spDelete handling

### Patch Changes

- Updated dependencies [b10b7e6]
  - @memberjunction/core@2.68.0
  - @memberjunction/actions@2.68.0
  - @memberjunction/aiengine@2.68.0
  - @memberjunction/ai-vector-dupe@2.68.0
  - @memberjunction/core-entities@2.68.0
  - @memberjunction/queue@2.68.0
  - @memberjunction/ai@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- 1fbfc26: handle flyway templates like ${id} becoming

## 2.66.0

### Patch Changes

- Updated dependencies [7e22e3e]
  - @memberjunction/actions@2.66.0
  - @memberjunction/aiengine@2.66.0
  - @memberjunction/ai-vector-dupe@2.66.0
  - @memberjunction/queue@2.66.0
  - @memberjunction/ai@2.66.0
  - @memberjunction/core@2.66.0
  - @memberjunction/core-entities@2.66.0
  - @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- 619488f: Pattern filtering for sql logging
- Updated dependencies [1d034b7]
- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/ai@2.65.0
  - @memberjunction/global@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/aiengine@2.65.0
  - @memberjunction/ai-vector-dupe@2.65.0
  - @memberjunction/actions@2.65.0
  - @memberjunction/queue@2.65.0
  - @memberjunction/core@2.65.0

## 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/aiengine@2.64.0
  - @memberjunction/ai-vector-dupe@2.64.0
  - @memberjunction/actions@2.64.0
  - @memberjunction/queue@2.64.0
  - @memberjunction/ai@2.64.0
  - @memberjunction/core@2.64.0
  - @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/ai@2.63.1
  - @memberjunction/aiengine@2.63.1
  - @memberjunction/ai-vector-dupe@2.63.1
  - @memberjunction/actions@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1
  - @memberjunction/queue@2.63.1

## 2.63.0

### Patch Changes

- Updated dependencies [28e8a85]
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/aiengine@2.63.0
  - @memberjunction/actions@2.63.0
  - @memberjunction/ai-vector-dupe@2.63.0
  - @memberjunction/queue@2.63.0
  - @memberjunction/ai@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/ai@2.62.0
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/actions@2.62.0
  - @memberjunction/aiengine@2.62.0
  - @memberjunction/ai-vector-dupe@2.62.0
  - @memberjunction/queue@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- Updated dependencies [51b2b47]
  - @memberjunction/actions@2.61.0
  - @memberjunction/aiengine@2.61.0
  - @memberjunction/ai-vector-dupe@2.61.0
  - @memberjunction/queue@2.61.0
  - @memberjunction/ai@2.61.0
  - @memberjunction/core@2.61.0
  - @memberjunction/core-entities@2.61.0
  - @memberjunction/global@2.61.0

## 2.60.0

### Patch Changes

- Updated dependencies [b5fa80a]
- Updated dependencies [e30ee12]
- Updated dependencies [e512e4e]
  - @memberjunction/core@2.60.0
  - @memberjunction/core-entities@2.60.0
  - @memberjunction/aiengine@2.60.0
  - @memberjunction/actions@2.60.0
  - @memberjunction/ai-vector-dupe@2.60.0
  - @memberjunction/queue@2.60.0
  - @memberjunction/ai@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/ai@2.59.0
- @memberjunction/aiengine@2.59.0
- @memberjunction/ai-vector-dupe@2.59.0
- @memberjunction/actions@2.59.0
- @memberjunction/core@2.59.0
- @memberjunction/core-entities@2.59.0
- @memberjunction/global@2.59.0
- @memberjunction/queue@2.59.0

## 2.58.0

### Patch Changes

- def26fe: Added UUID generation to BaseEntity for entities that have single-column pkey that is uniqueidentifier type
- Updated dependencies [def26fe]
- Updated dependencies [db88416]
  - @memberjunction/core@2.58.0
  - @memberjunction/ai@2.58.0
  - @memberjunction/aiengine@2.58.0
  - @memberjunction/ai-vector-dupe@2.58.0
  - @memberjunction/actions@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/queue@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Minor Changes

- 0ba485f: various bug fixes

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/global@2.57.0
  - @memberjunction/aiengine@2.57.0
  - @memberjunction/ai-vector-dupe@2.57.0
  - @memberjunction/actions@2.57.0
  - @memberjunction/queue@2.57.0
  - @memberjunction/ai@2.57.0

## 2.56.0

### Patch Changes

- Updated dependencies [bf24cae]
  - @memberjunction/actions@2.56.0
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/aiengine@2.56.0
  - @memberjunction/ai-vector-dupe@2.56.0
  - @memberjunction/queue@2.56.0
  - @memberjunction/ai@2.56.0
  - @memberjunction/core@2.56.0
  - @memberjunction/global@2.56.0

## 2.55.0

### Minor Changes

- c3a49ff: Agent Manager + SQL Server fix + fix deps in core-entity-forms

### Patch Changes

- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
  - @memberjunction/ai@2.55.0
  - @memberjunction/aiengine@2.55.0
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/ai-vector-dupe@2.55.0
  - @memberjunction/actions@2.55.0
  - @memberjunction/queue@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- dfca664: **SQLServerDataProvider Changes:**
  - SQLServerTransactionGroup now immediately rolls back and stops processing on first operation failure
  - Enhanced error handling to prevent double rollback attempts
  - Improved error messages to clearly indicate when transactions are rolled back

- 1273b07: fix transaction handling
- Updated dependencies [20f424d]
- Updated dependencies [a6f553e]
- Updated dependencies [0f6e995]
- Updated dependencies [0046359]
  - @memberjunction/core@2.54.0
  - @memberjunction/aiengine@2.54.0
  - @memberjunction/ai-vector-dupe@2.54.0
  - @memberjunction/actions@2.54.0
  - @memberjunction/core-entities@2.54.0
  - @memberjunction/queue@2.54.0
  - @memberjunction/ai@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- Updated dependencies [bddc4ea]
- Updated dependencies [390f587]
- Updated dependencies [b5560c0]
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/actions@2.53.0
  - @memberjunction/aiengine@2.53.0
  - @memberjunction/ai-vector-dupe@2.53.0
  - @memberjunction/queue@2.53.0
  - @memberjunction/ai@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Patch Changes

- Updated dependencies [e926106]
- Updated dependencies [760e844]
  - @memberjunction/ai@2.52.0
  - @memberjunction/aiengine@2.52.0
  - @memberjunction/ai-vector-dupe@2.52.0
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/actions@2.52.0
  - @memberjunction/queue@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Patch Changes

- Updated dependencies [4a79606]
- Updated dependencies [faf513c]
- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
- Updated dependencies [0ddb438]
  - @memberjunction/ai@2.51.0
  - @memberjunction/aiengine@2.51.0
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/actions@2.51.0
  - @memberjunction/ai-vector-dupe@2.51.0
  - @memberjunction/queue@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/ai@2.50.0
- @memberjunction/aiengine@2.50.0
- @memberjunction/ai-vector-dupe@2.50.0
- @memberjunction/actions@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/global@2.50.0
- @memberjunction/queue@2.50.0

## 2.49.0

### Minor Changes

- cc52ced: Significant changes all around
- db17ed7: Further Updates
- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [2f974e2]
- Updated dependencies [cc52ced]
- Updated dependencies [ca3365f]
- Updated dependencies [b5d9fbd]
- Updated dependencies [db17ed7]
- Updated dependencies [62cf1b6]
  - @memberjunction/core-entities@2.49.0
  - @memberjunction/core@2.49.0
  - @memberjunction/global@2.49.0
  - @memberjunction/actions@2.49.0
  - @memberjunction/ai@2.49.0
  - @memberjunction/aiengine@2.49.0
  - @memberjunction/ai-vector-dupe@2.49.0
  - @memberjunction/queue@2.49.0

## 2.48.0

### Patch Changes

- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
  - @memberjunction/core@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/aiengine@2.48.0
  - @memberjunction/ai-vector-dupe@2.48.0
  - @memberjunction/actions@2.48.0
  - @memberjunction/queue@2.48.0
  - @memberjunction/ai@2.48.0
  - @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- 3f31192: bug fixes for date handling ISO strings for null dates
  - @memberjunction/aiengine@2.47.0
  - @memberjunction/ai-vector-dupe@2.47.0
  - @memberjunction/actions@2.47.0
  - @memberjunction/queue@2.47.0
  - @memberjunction/ai@2.47.0
  - @memberjunction/core@2.47.0
  - @memberjunction/core-entities@2.47.0
  - @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/ai@2.46.0
- @memberjunction/aiengine@2.46.0
- @memberjunction/ai-vector-dupe@2.46.0
- @memberjunction/actions@2.46.0
- @memberjunction/core@2.46.0
- @memberjunction/core-entities@2.46.0
- @memberjunction/global@2.46.0
- @memberjunction/queue@2.46.0

## 2.45.0

### Patch Changes

- Updated dependencies [21d456d]
- Updated dependencies [556ee8d]
  - @memberjunction/ai@2.45.0
  - @memberjunction/aiengine@2.45.0
  - @memberjunction/core-entities@2.45.0
  - @memberjunction/ai-vector-dupe@2.45.0
  - @memberjunction/actions@2.45.0
  - @memberjunction/queue@2.45.0
  - @memberjunction/core@2.45.0
  - @memberjunction/global@2.45.0

## 2.44.0

### Patch Changes

- Updated dependencies [f7aec1c]
- Updated dependencies [fbc30dc]
- Updated dependencies [9f02cd8]
- Updated dependencies [99b27c5]
- Updated dependencies [091c5f6]
  - @memberjunction/aiengine@2.44.0
  - @memberjunction/ai@2.44.0
  - @memberjunction/core@2.44.0
  - @memberjunction/core-entities@2.44.0
  - @memberjunction/ai-vector-dupe@2.44.0
  - @memberjunction/actions@2.44.0
  - @memberjunction/queue@2.44.0
  - @memberjunction/global@2.44.0

## 2.43.0

### Patch Changes

- Updated dependencies [1629c04]
  - @memberjunction/core@2.43.0
  - @memberjunction/aiengine@2.43.0
  - @memberjunction/ai-vector-dupe@2.43.0
  - @memberjunction/actions@2.43.0
  - @memberjunction/core-entities@2.43.0
  - @memberjunction/queue@2.43.0
  - @memberjunction/ai@2.43.0
  - @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/ai@2.42.1
- @memberjunction/aiengine@2.42.1
- @memberjunction/ai-vector-dupe@2.42.1
- @memberjunction/actions@2.42.1
- @memberjunction/core@2.42.1
- @memberjunction/core-entities@2.42.1
- @memberjunction/global@2.42.1
- @memberjunction/queue@2.42.1

## 2.42.0

### Minor Changes

- 5c4ff39: bug fix for DatasetTimestamp comparison

### Patch Changes

- Updated dependencies [d49f25c]
  - @memberjunction/ai@2.42.0
  - @memberjunction/aiengine@2.42.0
  - @memberjunction/ai-vector-dupe@2.42.0
  - @memberjunction/actions@2.42.0
  - @memberjunction/queue@2.42.0
  - @memberjunction/core@2.42.0
  - @memberjunction/core-entities@2.42.0
  - @memberjunction/global@2.42.0

## 2.41.0

### Patch Changes

- 3be3f71: Patched sql stored procedure name for tables with name colisions.
- Updated dependencies [3be3f71]
- Updated dependencies [9d3b577]
- Updated dependencies [276371d]
- Updated dependencies [7e0523d]
  - @memberjunction/core@2.41.0
  - @memberjunction/ai@2.41.0
  - @memberjunction/core-entities@2.41.0
  - @memberjunction/aiengine@2.41.0
  - @memberjunction/ai-vector-dupe@2.41.0
  - @memberjunction/actions@2.41.0
  - @memberjunction/queue@2.41.0
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- Updated dependencies [b6ce661]
  - @memberjunction/ai@2.40.0
  - @memberjunction/aiengine@2.40.0
  - @memberjunction/ai-vector-dupe@2.40.0
  - @memberjunction/actions@2.40.0
  - @memberjunction/queue@2.40.0
  - @memberjunction/core@2.40.0
  - @memberjunction/core-entities@2.40.0
  - @memberjunction/global@2.40.0

## 2.39.0

### Patch Changes

- Updated dependencies [f73ea0e]
- Updated dependencies [e93f580]
- Updated dependencies [c9ccc36]
  - @memberjunction/ai@2.39.0
  - @memberjunction/aiengine@2.39.0
  - @memberjunction/core-entities@2.39.0
  - @memberjunction/ai-vector-dupe@2.39.0
  - @memberjunction/actions@2.39.0
  - @memberjunction/queue@2.39.0
  - @memberjunction/core@2.39.0
  - @memberjunction/global@2.39.0

## 2.38.0

### Patch Changes

- Updated dependencies [c835ded]
  - @memberjunction/core-entities@2.38.0
  - @memberjunction/aiengine@2.38.0
  - @memberjunction/ai-vector-dupe@2.38.0
  - @memberjunction/actions@2.38.0
  - @memberjunction/queue@2.38.0
  - @memberjunction/ai@2.38.0
  - @memberjunction/core@2.38.0
  - @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/ai@2.37.1
- @memberjunction/aiengine@2.37.1
- @memberjunction/ai-vector-dupe@2.37.1
- @memberjunction/actions@2.37.1
- @memberjunction/core@2.37.1
- @memberjunction/core-entities@2.37.1
- @memberjunction/global@2.37.1
- @memberjunction/queue@2.37.1

## 2.37.0

### Patch Changes

- Updated dependencies [1418b71]
  - @memberjunction/core-entities@2.37.0
  - @memberjunction/aiengine@2.37.0
  - @memberjunction/ai-vector-dupe@2.37.0
  - @memberjunction/actions@2.37.0
  - @memberjunction/queue@2.37.0
  - @memberjunction/ai@2.37.0
  - @memberjunction/core@2.37.0
  - @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- Updated dependencies [d9defc9]
- Updated dependencies [9d709e2]
- Updated dependencies [577cc6a]
- Updated dependencies [b45b336]
  - @memberjunction/ai@2.36.1
  - @memberjunction/core@2.36.1
  - @memberjunction/aiengine@2.36.1
  - @memberjunction/ai-vector-dupe@2.36.1
  - @memberjunction/actions@2.36.1
  - @memberjunction/queue@2.36.1
  - @memberjunction/core-entities@2.36.1
  - @memberjunction/global@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
- Updated dependencies [160f24f]
  - @memberjunction/ai-vector-dupe@2.36.0
  - @memberjunction/actions@2.36.0
  - @memberjunction/core-entities@2.36.0
  - @memberjunction/aiengine@2.36.0
  - @memberjunction/global@2.36.0
  - @memberjunction/ai@2.36.0
  - @memberjunction/queue@2.36.0
  - @memberjunction/core@2.36.0

## 2.35.1

### Patch Changes

- 3e7ec64: Strong typing for transaction item callback function and fix bug in SQL Server Data Provider caused by weak typing
- Updated dependencies [3e7ec64]
  - @memberjunction/core@2.35.1
  - @memberjunction/aiengine@2.35.1
  - @memberjunction/ai-vector-dupe@2.35.1
  - @memberjunction/actions@2.35.1
  - @memberjunction/core-entities@2.35.1
  - @memberjunction/queue@2.35.1
  - @memberjunction/ai@2.35.1
  - @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/ai-vector-dupe@2.35.0
- @memberjunction/ai@2.35.0
- @memberjunction/aiengine@2.35.0
- @memberjunction/actions@2.35.0
- @memberjunction/core@2.35.0
- @memberjunction/core-entities@2.35.0
- @memberjunction/global@2.35.0
- @memberjunction/queue@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/ai@2.34.2
- @memberjunction/aiengine@2.34.2
- @memberjunction/ai-vector-dupe@2.34.2
- @memberjunction/actions@2.34.2
- @memberjunction/core@2.34.2
- @memberjunction/core-entities@2.34.2
- @memberjunction/global@2.34.2
- @memberjunction/queue@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/ai@2.34.1
- @memberjunction/aiengine@2.34.1
- @memberjunction/ai-vector-dupe@2.34.1
- @memberjunction/actions@2.34.1
- @memberjunction/core@2.34.1
- @memberjunction/core-entities@2.34.1
- @memberjunction/global@2.34.1
- @memberjunction/queue@2.34.1

## 2.34.0

### Patch Changes

- Updated dependencies [e60f326]
- Updated dependencies [785f06a]
- Updated dependencies [b48d6b4]
- Updated dependencies [4c7f532]
- Updated dependencies [54ac86c]
  - @memberjunction/core-entities@2.34.0
  - @memberjunction/core@2.34.0
  - @memberjunction/ai@2.34.0
  - @memberjunction/aiengine@2.34.0
  - @memberjunction/ai-vector-dupe@2.34.0
  - @memberjunction/actions@2.34.0
  - @memberjunction/queue@2.34.0
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- 02d7391: Claude Code Performance Optimizations for MJServer and SQLServerDataProvider as proposed
- Updated dependencies [efafd0e]
  - @memberjunction/ai@2.33.0
  - @memberjunction/ai-vector-dupe@2.33.0
  - @memberjunction/aiengine@2.33.0
  - @memberjunction/actions@2.33.0
  - @memberjunction/queue@2.33.0
  - @memberjunction/core@2.33.0
  - @memberjunction/core-entities@2.33.0
  - @memberjunction/global@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/ai@2.32.2
- @memberjunction/aiengine@2.32.2
- @memberjunction/ai-vector-dupe@2.32.2
- @memberjunction/actions@2.32.2
- @memberjunction/core@2.32.2
- @memberjunction/core-entities@2.32.2
- @memberjunction/global@2.32.2
- @memberjunction/queue@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/ai@2.32.1
- @memberjunction/aiengine@2.32.1
- @memberjunction/ai-vector-dupe@2.32.1
- @memberjunction/actions@2.32.1
- @memberjunction/core@2.32.1
- @memberjunction/core-entities@2.32.1
- @memberjunction/global@2.32.1
- @memberjunction/queue@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/ai@2.32.0
- @memberjunction/aiengine@2.32.0
- @memberjunction/ai-vector-dupe@2.32.0
- @memberjunction/actions@2.32.0
- @memberjunction/core@2.32.0
- @memberjunction/core-entities@2.32.0
- @memberjunction/global@2.32.0
- @memberjunction/queue@2.32.0

## 2.31.0

### Patch Changes

- Updated dependencies [67c0b7f]
  - @memberjunction/aiengine@2.31.0
  - @memberjunction/ai-vector-dupe@2.31.0
  - @memberjunction/actions@2.31.0
  - @memberjunction/queue@2.31.0
  - @memberjunction/ai@2.31.0
  - @memberjunction/core@2.31.0
  - @memberjunction/core-entities@2.31.0
  - @memberjunction/global@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [8f71da0]
- Updated dependencies [a3ab749]
- Updated dependencies [63dc5a9]
  - @memberjunction/actions@2.30.0
  - @memberjunction/aiengine@2.30.0
  - @memberjunction/core-entities@2.30.0
  - @memberjunction/global@2.30.0
  - @memberjunction/ai-vector-dupe@2.30.0
  - @memberjunction/queue@2.30.0
  - @memberjunction/ai@2.30.0
  - @memberjunction/core@2.30.0

## 2.29.2

### Patch Changes

- 64aa7f0: New query for 2.29.0 to get version history since we aren't using an entity for flyway data anymore. Improvements to query execution to support query execution by name as well as by ID, and general cleanup (code wasn't working before as query ID wasn't enclosed in quotes from days of INT ID types)
- Updated dependencies [07bde92]
- Updated dependencies [64aa7f0]
- Updated dependencies [69c3505]
  - @memberjunction/core@2.29.2
  - @memberjunction/core-entities@2.29.2
  - @memberjunction/aiengine@2.29.2
  - @memberjunction/ai-vector-dupe@2.29.2
  - @memberjunction/actions@2.29.2
  - @memberjunction/queue@2.29.2
  - @memberjunction/ai@2.29.2
  - @memberjunction/global@2.29.2

## 2.28.0

### Patch Changes

- Updated dependencies [8259093]
  - @memberjunction/core@2.28.0
  - @memberjunction/aiengine@2.28.0
  - @memberjunction/ai-vector-dupe@2.28.0
  - @memberjunction/actions@2.28.0
  - @memberjunction/core-entities@2.28.0
  - @memberjunction/queue@2.28.0
  - @memberjunction/ai@2.28.0
  - @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/ai@2.27.1
- @memberjunction/aiengine@2.27.1
- @memberjunction/ai-vector-dupe@2.27.1
- @memberjunction/actions@2.27.1
- @memberjunction/core@2.27.1
- @memberjunction/core-entities@2.27.1
- @memberjunction/global@2.27.1
- @memberjunction/queue@2.27.1

## 2.27.0

### Patch Changes

- Updated dependencies [54ab868]
- Updated dependencies [b4d3cbc]
- Updated dependencies [5a81451]
  - @memberjunction/core@2.27.0
  - @memberjunction/ai@2.27.0
  - @memberjunction/core-entities@2.27.0
  - @memberjunction/aiengine@2.27.0
  - @memberjunction/ai-vector-dupe@2.27.0
  - @memberjunction/actions@2.27.0
  - @memberjunction/queue@2.27.0
  - @memberjunction/global@2.27.0

## 2.26.1

### Patch Changes

- @memberjunction/ai@2.26.1
- @memberjunction/aiengine@2.26.1
- @memberjunction/ai-vector-dupe@2.26.1
- @memberjunction/actions@2.26.1
- @memberjunction/core@2.26.1
- @memberjunction/core-entities@2.26.1
- @memberjunction/global@2.26.1
- @memberjunction/queue@2.26.1

## 2.26.0

### Minor Changes

- 23801c5: Changes to use of TransactionGroup to use await at all times.Fixed up some metadata bugs in the \_\_mj schema that somehow existed from prior builds.Cleaned up SQL Server Data Provider handling of virtual fields in track record changesFixed CodeGen to not emit null wrapped as a string that was happening in some casesHardened MJCore.BaseEntity to treat a string with the word null in it as same as a true null value (in case someone throws that into the DB)

### Patch Changes

- Updated dependencies [23801c5]
  - @memberjunction/core@2.26.0
  - @memberjunction/aiengine@2.26.0
  - @memberjunction/ai-vector-dupe@2.26.0
  - @memberjunction/actions@2.26.0
  - @memberjunction/core-entities@2.26.0
  - @memberjunction/queue@2.26.0
  - @memberjunction/ai@2.26.0
  - @memberjunction/global@2.26.0

## 2.25.0

### Minor Changes

- 26c990d: - Add Conversations to Resource Types Entity* Update User View Grid to fix multi-edit bug* Transaction Management Changes - fixes bug in #803 - but not new feature in there* Clean bug in Notification Service to only show user-centric messages* Add Sharing dialog to Skip Chat component

### Patch Changes

- 0647504: support new TransactionItem constructor in SQLServerDataProvider
- 824eca2: Transaction Group improvements
- 86e6d3b: Finished debug for Variables support in transaction groups!
- Updated dependencies [fd07dcd]
- Updated dependencies [26c990d]
- Updated dependencies [86e6d3b]
  - @memberjunction/core@2.25.0
  - @memberjunction/aiengine@2.25.0
  - @memberjunction/ai-vector-dupe@2.25.0
  - @memberjunction/actions@2.25.0
  - @memberjunction/core-entities@2.25.0
  - @memberjunction/queue@2.25.0
  - @memberjunction/ai@2.25.0
  - @memberjunction/global@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/ai@2.24.1
- @memberjunction/aiengine@2.24.1
- @memberjunction/ai-vector-dupe@2.24.1
- @memberjunction/actions@2.24.1
- @memberjunction/core@2.24.1
- @memberjunction/core-entities@2.24.1
- @memberjunction/global@2.24.1
- @memberjunction/queue@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [9cb85cc]
- Updated dependencies [7c6ff41]
  - @memberjunction/global@2.24.0
  - @memberjunction/core-entities@2.24.0
  - @memberjunction/ai@2.24.0
  - @memberjunction/aiengine@2.24.0
  - @memberjunction/ai-vector-dupe@2.24.0
  - @memberjunction/actions@2.24.0
  - @memberjunction/core@2.24.0
  - @memberjunction/queue@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/ai@2.23.2
- @memberjunction/aiengine@2.23.2
- @memberjunction/ai-vector-dupe@2.23.2
- @memberjunction/actions@2.23.2
- @memberjunction/core@2.23.2
- @memberjunction/core-entities@2.23.2
- @memberjunction/global@2.23.2
- @memberjunction/queue@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/ai@2.23.1
- @memberjunction/aiengine@2.23.1
- @memberjunction/ai-vector-dupe@2.23.1
- @memberjunction/actions@2.23.1
- @memberjunction/core@2.23.1
- @memberjunction/core-entities@2.23.1
- @memberjunction/global@2.23.1
- @memberjunction/queue@2.23.1

## 2.23.0

### Minor Changes

- 09d3fa9: Defaulting cache refresh interval to disabled to allow database pausing unless refresh is explicitly set.

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/global@2.23.0
  - @memberjunction/ai@2.23.0
  - @memberjunction/aiengine@2.23.0
  - @memberjunction/ai-vector-dupe@2.23.0
  - @memberjunction/actions@2.23.0
  - @memberjunction/core@2.23.0
  - @memberjunction/core-entities@2.23.0
  - @memberjunction/queue@2.23.0

## 2.22.2

### Patch Changes

- Updated dependencies [94ebf81]
  - @memberjunction/core@2.22.2
  - @memberjunction/aiengine@2.22.2
  - @memberjunction/ai-vector-dupe@2.22.2
  - @memberjunction/actions@2.22.2
  - @memberjunction/core-entities@2.22.2
  - @memberjunction/queue@2.22.2
  - @memberjunction/ai@2.22.2
  - @memberjunction/global@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/ai@2.22.1
- @memberjunction/aiengine@2.22.1
- @memberjunction/ai-vector-dupe@2.22.1
- @memberjunction/actions@2.22.1
- @memberjunction/core@2.22.1
- @memberjunction/core-entities@2.22.1
- @memberjunction/global@2.22.1
- @memberjunction/queue@2.22.1

## 2.22.0

### Patch Changes

- Updated dependencies [a598f1a]
- Updated dependencies [9660275]
  - @memberjunction/core@2.22.0
  - @memberjunction/global@2.22.0
  - @memberjunction/aiengine@2.22.0
  - @memberjunction/ai-vector-dupe@2.22.0
  - @memberjunction/actions@2.22.0
  - @memberjunction/core-entities@2.22.0
  - @memberjunction/queue@2.22.0
  - @memberjunction/ai@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.21.0
- Bump @memberjunction/ai to v2.21.0
- Bump @memberjunction/ai-vector-dupe to v2.21.0
- Bump @memberjunction/aiengine to v2.21.0
- Bump @memberjunction/core to v2.21.0
- Bump @memberjunction/core-entities to v2.21.0
- Bump @memberjunction/global to v2.21.0
- Bump @memberjunction/queue to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

### Patches

- Bump @memberjunction/actions to v2.20.3
- Bump @memberjunction/ai to v2.20.3
- Bump @memberjunction/ai-vector-dupe to v2.20.3
- Bump @memberjunction/aiengine to v2.20.3
- Bump @memberjunction/core to v2.20.3
- Bump @memberjunction/core-entities to v2.20.3
- Bump @memberjunction/global to v2.20.3
- Bump @memberjunction/queue to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Bump @memberjunction/actions to v2.20.2
- Bump @memberjunction/ai to v2.20.2
- Bump @memberjunction/ai-vector-dupe to v2.20.2
- Bump @memberjunction/aiengine to v2.20.2
- Bump @memberjunction/core to v2.20.2
- Bump @memberjunction/core-entities to v2.20.2
- Bump @memberjunction/global to v2.20.2
- Bump @memberjunction/queue to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/actions to v2.20.1
- Bump @memberjunction/ai to v2.20.1
- Bump @memberjunction/ai-vector-dupe to v2.20.1
- Bump @memberjunction/aiengine to v2.20.1
- Bump @memberjunction/core to v2.20.1
- Bump @memberjunction/core-entities to v2.20.1
- Bump @memberjunction/global to v2.20.1
- Bump @memberjunction/queue to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:03 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.20.0
- Bump @memberjunction/ai to v2.20.0
- Bump @memberjunction/ai-vector-dupe to v2.20.0
- Bump @memberjunction/aiengine to v2.20.0
- Bump @memberjunction/core to v2.20.0
- Bump @memberjunction/core-entities to v2.20.0
- Bump @memberjunction/global to v2.20.0
- Bump @memberjunction/queue to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/actions to v2.19.5
- Bump @memberjunction/ai to v2.19.5
- Bump @memberjunction/ai-vector-dupe to v2.19.5
- Bump @memberjunction/aiengine to v2.19.5
- Bump @memberjunction/core to v2.19.5
- Bump @memberjunction/core-entities to v2.19.5
- Bump @memberjunction/global to v2.19.5
- Bump @memberjunction/queue to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/actions to v2.19.4
- Bump @memberjunction/ai to v2.19.4
- Bump @memberjunction/ai-vector-dupe to v2.19.4
- Bump @memberjunction/aiengine to v2.19.4
- Bump @memberjunction/core to v2.19.4
- Bump @memberjunction/core-entities to v2.19.4
- Bump @memberjunction/global to v2.19.4
- Bump @memberjunction/queue to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/actions to v2.19.3
- Bump @memberjunction/ai to v2.19.3
- Bump @memberjunction/ai-vector-dupe to v2.19.3
- Bump @memberjunction/aiengine to v2.19.3
- Bump @memberjunction/core to v2.19.3
- Bump @memberjunction/core-entities to v2.19.3
- Bump @memberjunction/global to v2.19.3
- Bump @memberjunction/queue to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/actions to v2.19.2
- Bump @memberjunction/ai to v2.19.2
- Bump @memberjunction/ai-vector-dupe to v2.19.2
- Bump @memberjunction/aiengine to v2.19.2
- Bump @memberjunction/core to v2.19.2
- Bump @memberjunction/core-entities to v2.19.2
- Bump @memberjunction/global to v2.19.2
- Bump @memberjunction/queue to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/actions to v2.19.1
- Bump @memberjunction/ai to v2.19.1
- Bump @memberjunction/ai-vector-dupe to v2.19.1
- Bump @memberjunction/aiengine to v2.19.1
- Bump @memberjunction/core to v2.19.1
- Bump @memberjunction/core-entities to v2.19.1
- Bump @memberjunction/global to v2.19.1
- Bump @memberjunction/queue to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:47 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.19.0
- Bump @memberjunction/ai to v2.19.0
- Bump @memberjunction/ai-vector-dupe to v2.19.0
- Bump @memberjunction/aiengine to v2.19.0
- Bump @memberjunction/core to v2.19.0
- Bump @memberjunction/core-entities to v2.19.0
- Bump @memberjunction/global to v2.19.0
- Bump @memberjunction/queue to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.18.3
- Bump @memberjunction/ai to v2.18.3
- Bump @memberjunction/ai-vector-dupe to v2.18.3
- Bump @memberjunction/aiengine to v2.18.3
- Bump @memberjunction/core to v2.18.3
- Bump @memberjunction/core-entities to v2.18.3
- Bump @memberjunction/global to v2.18.3
- Bump @memberjunction/queue to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/actions to v2.18.2
- Bump @memberjunction/ai to v2.18.2
- Bump @memberjunction/ai-vector-dupe to v2.18.2
- Bump @memberjunction/aiengine to v2.18.2
- Bump @memberjunction/core to v2.18.2
- Bump @memberjunction/core-entities to v2.18.2
- Bump @memberjunction/global to v2.18.2
- Bump @memberjunction/queue to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/actions to v2.18.1
- Bump @memberjunction/ai to v2.18.1
- Bump @memberjunction/ai-vector-dupe to v2.18.1
- Bump @memberjunction/aiengine to v2.18.1
- Bump @memberjunction/core to v2.18.1
- Bump @memberjunction/core-entities to v2.18.1
- Bump @memberjunction/global to v2.18.1
- Bump @memberjunction/queue to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Bump @memberjunction/actions to v2.18.0
- Bump @memberjunction/ai to v2.18.0
- Bump @memberjunction/ai-vector-dupe to v2.18.0
- Bump @memberjunction/aiengine to v2.18.0
- Bump @memberjunction/core to v2.18.0
- Bump @memberjunction/core-entities to v2.18.0
- Bump @memberjunction/global to v2.18.0
- Bump @memberjunction/queue to v2.18.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Bump @memberjunction/actions to v2.17.0
- Bump @memberjunction/ai to v2.17.0
- Bump @memberjunction/ai-vector-dupe to v2.17.0
- Bump @memberjunction/aiengine to v2.17.0
- Bump @memberjunction/core to v2.17.0
- Bump @memberjunction/core-entities to v2.17.0
- Bump @memberjunction/global to v2.17.0
- Bump @memberjunction/queue to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:27 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.16.1
- Bump @memberjunction/ai to v2.16.1
- Bump @memberjunction/ai-vector-dupe to v2.16.1
- Bump @memberjunction/aiengine to v2.16.1
- Bump @memberjunction/core to v2.16.1
- Bump @memberjunction/core-entities to v2.16.1
- Bump @memberjunction/global to v2.16.1
- Bump @memberjunction/queue to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Bump @memberjunction/actions to v2.16.0
- Bump @memberjunction/ai to v2.16.0
- Bump @memberjunction/ai-vector-dupe to v2.16.0
- Bump @memberjunction/aiengine to v2.16.0
- Bump @memberjunction/core to v2.16.0
- Bump @memberjunction/core-entities to v2.16.0
- Bump @memberjunction/global to v2.16.0
- Bump @memberjunction/queue to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:27 GMT

### Patches

- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.15.2
- Bump @memberjunction/ai to v2.15.2
- Bump @memberjunction/ai-vector-dupe to v2.15.2
- Bump @memberjunction/aiengine to v2.15.2
- Bump @memberjunction/core to v2.15.2
- Bump @memberjunction/core-entities to v2.15.2
- Bump @memberjunction/global to v2.15.2
- Bump @memberjunction/queue to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.14.0
- Bump @memberjunction/ai to v2.14.0
- Bump @memberjunction/ai-vector-dupe to v2.14.0
- Bump @memberjunction/aiengine to v2.14.0
- Bump @memberjunction/core to v2.14.0
- Bump @memberjunction/core-entities to v2.14.0
- Bump @memberjunction/global to v2.14.0
- Bump @memberjunction/queue to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/actions to v2.13.4
- Bump @memberjunction/ai to v2.13.4
- Bump @memberjunction/ai-vector-dupe to v2.13.4
- Bump @memberjunction/aiengine to v2.13.4
- Bump @memberjunction/core to v2.13.4
- Bump @memberjunction/core-entities to v2.13.4
- Bump @memberjunction/global to v2.13.4
- Bump @memberjunction/queue to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:45 GMT

### Patches

- Bump @memberjunction/actions to v2.13.3
- Bump @memberjunction/ai to v2.13.3
- Bump @memberjunction/ai-vector-dupe to v2.13.3
- Bump @memberjunction/aiengine to v2.13.3
- Bump @memberjunction/core to v2.13.3
- Bump @memberjunction/core-entities to v2.13.3
- Bump @memberjunction/global to v2.13.3
- Bump @memberjunction/queue to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/actions to v2.13.2
- Bump @memberjunction/ai to v2.13.2
- Bump @memberjunction/ai-vector-dupe to v2.13.2
- Bump @memberjunction/aiengine to v2.13.2
- Bump @memberjunction/core to v2.13.2
- Bump @memberjunction/core-entities to v2.13.2
- Bump @memberjunction/global to v2.13.2
- Bump @memberjunction/queue to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Bump @memberjunction/actions to v2.13.1
- Bump @memberjunction/ai to v2.13.1
- Bump @memberjunction/ai-vector-dupe to v2.13.1
- Bump @memberjunction/aiengine to v2.13.1
- Bump @memberjunction/core to v2.13.1
- Bump @memberjunction/core-entities to v2.13.1
- Bump @memberjunction/global to v2.13.1
- Bump @memberjunction/queue to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/actions to v2.13.0
- Bump @memberjunction/ai to v2.13.0
- Bump @memberjunction/ai-vector-dupe to v2.13.0
- Bump @memberjunction/aiengine to v2.13.0
- Bump @memberjunction/core to v2.13.0
- Bump @memberjunction/core-entities to v2.13.0
- Bump @memberjunction/global to v2.13.0
- Bump @memberjunction/queue to v2.13.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.12.0
- Bump @memberjunction/ai to v2.12.0
- Bump @memberjunction/ai-vector-dupe to v2.12.0
- Bump @memberjunction/aiengine to v2.12.0
- Bump @memberjunction/core to v2.12.0
- Bump @memberjunction/core-entities to v2.12.0
- Bump @memberjunction/global to v2.12.0
- Bump @memberjunction/queue to v2.12.0

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Bump @memberjunction/actions to v2.11.0
- Bump @memberjunction/ai to v2.11.0
- Bump @memberjunction/ai-vector-dupe to v2.11.0
- Bump @memberjunction/aiengine to v2.11.0
- Bump @memberjunction/core to v2.11.0
- Bump @memberjunction/core-entities to v2.11.0
- Bump @memberjunction/global to v2.11.0
- Bump @memberjunction/queue to v2.11.0

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Bump @memberjunction/actions to v2.10.0
- Bump @memberjunction/ai to v2.10.0
- Bump @memberjunction/ai-vector-dupe to v2.10.0
- Bump @memberjunction/aiengine to v2.10.0
- Bump @memberjunction/core to v2.10.0
- Bump @memberjunction/core-entities to v2.10.0
- Bump @memberjunction/global to v2.10.0
- Bump @memberjunction/queue to v2.10.0

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Bump @memberjunction/actions to v2.9.0
- Bump @memberjunction/ai to v2.9.0
- Bump @memberjunction/ai-vector-dupe to v2.9.0
- Bump @memberjunction/aiengine to v2.9.0
- Bump @memberjunction/core to v2.9.0
- Bump @memberjunction/core-entities to v2.9.0
- Bump @memberjunction/global to v2.9.0
- Bump @memberjunction/queue to v2.9.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Bump @memberjunction/actions to v2.8.0
- Bump @memberjunction/ai to v2.8.0
- Bump @memberjunction/ai-vector-dupe to v2.8.0
- Bump @memberjunction/aiengine to v2.8.0
- Bump @memberjunction/core to v2.8.0
- Bump @memberjunction/core-entities to v2.8.0
- Bump @memberjunction/global to v2.8.0
- Bump @memberjunction/queue to v2.8.0

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.7.1
- Bump @memberjunction/ai to v2.7.1
- Bump @memberjunction/ai-vector-dupe to v2.7.1
- Bump @memberjunction/aiengine to v2.7.1
- Bump @memberjunction/core to v2.7.1
- Bump @memberjunction/core-entities to v2.7.1
- Bump @memberjunction/global to v2.7.1
- Bump @memberjunction/queue to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.7.0
- Bump @memberjunction/ai to v2.7.0
- Bump @memberjunction/ai-vector-dupe to v2.7.0
- Bump @memberjunction/aiengine to v2.7.0
- Bump @memberjunction/core to v2.7.0
- Bump @memberjunction/core-entities to v2.7.0
- Bump @memberjunction/global to v2.7.0
- Bump @memberjunction/queue to v2.7.0

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Bump @memberjunction/actions to v2.6.1
- Bump @memberjunction/ai to v2.6.1
- Bump @memberjunction/ai-vector-dupe to v2.6.1
- Bump @memberjunction/aiengine to v2.6.1
- Bump @memberjunction/core to v2.6.1
- Bump @memberjunction/core-entities to v2.6.1
- Bump @memberjunction/global to v2.6.1
- Bump @memberjunction/queue to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:39 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.6.0
- Bump @memberjunction/ai to v2.6.0
- Bump @memberjunction/ai-vector-dupe to v2.6.0
- Bump @memberjunction/aiengine to v2.6.0
- Bump @memberjunction/core to v2.6.0
- Bump @memberjunction/core-entities to v2.6.0
- Bump @memberjunction/global to v2.6.0
- Bump @memberjunction/queue to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:02 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Bump @memberjunction/actions to v2.5.2
- Bump @memberjunction/ai to v2.5.2
- Bump @memberjunction/ai-vector-dupe to v2.5.2
- Bump @memberjunction/aiengine to v2.5.2
- Bump @memberjunction/core to v2.5.2
- Bump @memberjunction/core-entities to v2.5.2
- Bump @memberjunction/global to v2.5.2
- Bump @memberjunction/queue to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/actions to v2.5.1
- Bump @memberjunction/ai to v2.5.1
- Bump @memberjunction/ai-vector-dupe to v2.5.1
- Bump @memberjunction/aiengine to v2.5.1
- Bump @memberjunction/core to v2.5.1
- Bump @memberjunction/core-entities to v2.5.1
- Bump @memberjunction/global to v2.5.1
- Bump @memberjunction/queue to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:06 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.5.0
- Bump @memberjunction/ai to v2.5.0
- Bump @memberjunction/ai-vector-dupe to v2.5.0
- Bump @memberjunction/aiengine to v2.5.0
- Bump @memberjunction/core to v2.5.0
- Bump @memberjunction/core-entities to v2.5.0
- Bump @memberjunction/global to v2.5.0
- Bump @memberjunction/queue to v2.5.0

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Bump @memberjunction/actions to v2.4.1
- Bump @memberjunction/ai to v2.4.1
- Bump @memberjunction/ai-vector-dupe to v2.4.1
- Bump @memberjunction/aiengine to v2.4.1
- Bump @memberjunction/core to v2.4.1
- Bump @memberjunction/core-entities to v2.4.1
- Bump @memberjunction/global to v2.4.1
- Bump @memberjunction/queue to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.4.0
- Bump @memberjunction/ai to v2.4.0
- Bump @memberjunction/ai-vector-dupe to v2.4.0
- Bump @memberjunction/aiengine to v2.4.0
- Bump @memberjunction/core to v2.4.0
- Bump @memberjunction/core-entities to v2.4.0
- Bump @memberjunction/global to v2.4.0
- Bump @memberjunction/queue to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Bump @memberjunction/actions to v2.3.3
- Bump @memberjunction/ai to v2.3.3
- Bump @memberjunction/ai-vector-dupe to v2.3.3
- Bump @memberjunction/aiengine to v2.3.3
- Bump @memberjunction/core to v2.3.3
- Bump @memberjunction/core-entities to v2.3.3
- Bump @memberjunction/global to v2.3.3
- Bump @memberjunction/queue to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.3.2
- Bump @memberjunction/ai to v2.3.2
- Bump @memberjunction/ai-vector-dupe to v2.3.2
- Bump @memberjunction/aiengine to v2.3.2
- Bump @memberjunction/core to v2.3.2
- Bump @memberjunction/core-entities to v2.3.2
- Bump @memberjunction/global to v2.3.2
- Bump @memberjunction/queue to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.3.1
- Bump @memberjunction/ai to v2.3.1
- Bump @memberjunction/ai-vector-dupe to v2.3.1
- Bump @memberjunction/aiengine to v2.3.1
- Bump @memberjunction/core to v2.3.1
- Bump @memberjunction/core-entities to v2.3.1
- Bump @memberjunction/global to v2.3.1
- Bump @memberjunction/queue to v2.3.1

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Bump @memberjunction/actions to v2.3.0
- Bump @memberjunction/ai to v2.3.0
- Bump @memberjunction/ai-vector-dupe to v2.3.0
- Bump @memberjunction/aiengine to v2.3.0
- Bump @memberjunction/core to v2.2.2
- Bump @memberjunction/core-entities to v2.3.0
- Bump @memberjunction/global to v2.3.0
- Bump @memberjunction/queue to v2.3.0

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.2.1
- Bump @memberjunction/ai to v2.2.1
- Bump @memberjunction/ai-vector-dupe to v2.2.1
- Bump @memberjunction/aiengine to v2.2.1
- Bump @memberjunction/core to v2.2.1
- Bump @memberjunction/core-entities to v2.2.1
- Bump @memberjunction/global to v2.2.1
- Bump @memberjunction/queue to v2.2.1

## 2.2.0

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Bump @memberjunction/actions to v2.2.0
- Bump @memberjunction/ai to v2.2.0
- Bump @memberjunction/ai-vector-dupe to v2.2.0
- Bump @memberjunction/aiengine to v2.2.0
- Bump @memberjunction/core to v2.2.0
- Bump @memberjunction/core-entities to v2.1.6
- Bump @memberjunction/global to v2.2.0
- Bump @memberjunction/queue to v2.2.0

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/actions to v2.1.5
- Bump @memberjunction/ai to v2.1.5
- Bump @memberjunction/ai-vector-dupe to v2.1.5
- Bump @memberjunction/aiengine to v2.1.5
- Bump @memberjunction/core to v2.1.5
- Bump @memberjunction/core-entities to v2.1.5
- Bump @memberjunction/global to v2.1.5
- Bump @memberjunction/queue to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/actions to v2.1.4
- Bump @memberjunction/ai to v2.1.4
- Bump @memberjunction/ai-vector-dupe to v2.1.4
- Bump @memberjunction/aiengine to v2.1.4
- Bump @memberjunction/core to v2.1.4
- Bump @memberjunction/core-entities to v2.1.4
- Bump @memberjunction/global to v2.1.4
- Bump @memberjunction/queue to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Bump @memberjunction/actions to v2.1.3
- Bump @memberjunction/ai to v2.1.3
- Bump @memberjunction/ai-vector-dupe to v2.1.3
- Bump @memberjunction/aiengine to v2.1.3
- Bump @memberjunction/core to v2.1.3
- Bump @memberjunction/core-entities to v2.1.3
- Bump @memberjunction/global to v2.1.3
- Bump @memberjunction/queue to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Bump @memberjunction/actions to v2.1.2
- Bump @memberjunction/ai to v2.1.2
- Bump @memberjunction/ai-vector-dupe to v2.1.2
- Bump @memberjunction/aiengine to v2.1.2
- Bump @memberjunction/core to v2.1.2
- Bump @memberjunction/core-entities to v2.1.2
- Bump @memberjunction/global to v2.1.2
- Bump @memberjunction/queue to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/actions to v2.1.1
- Bump @memberjunction/ai to v2.1.1
- Bump @memberjunction/ai-vector-dupe to v2.1.1
- Bump @memberjunction/aiengine to v2.1.1
- Bump @memberjunction/core to v2.1.1
- Bump @memberjunction/core-entities to v2.1.1
- Bump @memberjunction/global to v2.1.1
- Bump @memberjunction/queue to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:28 GMT

### Patches

- Bump @memberjunction/actions to v1.8.1
- Bump @memberjunction/ai to v1.8.1
- Bump @memberjunction/ai-vector-dupe to v1.8.1
- Bump @memberjunction/aiengine to v1.8.1
- Bump @memberjunction/core to v1.8.1
- Bump @memberjunction/core-entities to v1.8.1
- Bump @memberjunction/global to v1.8.1
- Bump @memberjunction/queue to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Minor changes

- Bump @memberjunction/actions to v1.8.0
- Bump @memberjunction/ai to v1.8.0
- Bump @memberjunction/ai-vector-dupe to v1.8.0
- Bump @memberjunction/aiengine to v1.8.0
- Bump @memberjunction/core to v1.8.0
- Bump @memberjunction/core-entities to v1.8.0
- Bump @memberjunction/global to v1.8.0
- Bump @memberjunction/queue to v1.8.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.7.1

Wed, 12 Jun 2024 20:13:28 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v1.7.1
- Bump @memberjunction/ai to v1.7.1
- Bump @memberjunction/ai-vector-dupe to v1.7.1
- Bump @memberjunction/aiengine to v1.7.1
- Bump @memberjunction/core to v1.7.1
- Bump @memberjunction/core-entities to v1.7.1
- Bump @memberjunction/global to v1.7.1
- Bump @memberjunction/queue to v1.7.1

## 1.6.2

Wed, 12 Jun 2024 18:53:39 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v1.7.0
- Bump @memberjunction/ai to v1.7.0
- Bump @memberjunction/ai-vector-dupe to v1.7.0
- Bump @memberjunction/aiengine to v1.7.0
- Bump @memberjunction/core to v1.7.0
- Bump @memberjunction/core-entities to v1.7.0
- Bump @memberjunction/global to v1.7.0
- Bump @memberjunction/queue to v1.7.0

## 1.6.1

Tue, 11 Jun 2024 06:50:06 GMT

### Patches

- Bump @memberjunction/actions to v1.6.1
- Bump @memberjunction/ai to v1.6.1
- Bump @memberjunction/ai-vector-dupe to v1.6.1
- Bump @memberjunction/aiengine to v1.6.1
- Bump @memberjunction/core to v1.6.1
- Bump @memberjunction/core-entities to v1.6.1
- Bump @memberjunction/global to v1.6.1
- Bump @memberjunction/queue to v1.6.1

## 1.6.0

Tue, 11 Jun 2024 04:59:29 GMT

### Minor changes

- Bump @memberjunction/actions to v1.6.0
- Bump @memberjunction/ai to v1.6.0
- Bump @memberjunction/ai-vector-dupe to v1.6.0
- Bump @memberjunction/aiengine to v1.6.0
- Bump @memberjunction/core to v1.6.0
- Bump @memberjunction/core-entities to v1.6.0
- Bump @memberjunction/global to v1.6.0
- Bump @memberjunction/queue to v1.6.0

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v1.5.3
- Bump @memberjunction/ai to v1.5.3
- Bump @memberjunction/ai-vector-dupe to v1.5.3
- Bump @memberjunction/aiengine to v1.5.3
- Bump @memberjunction/core to v1.5.3
- Bump @memberjunction/core-entities to v1.5.3
- Bump @memberjunction/global to v1.5.3
- Bump @memberjunction/queue to v1.5.3

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Bump @memberjunction/ai to v1.5.2
- Bump @memberjunction/actions to v1.5.2
- Bump @memberjunction/aiengine to v1.5.2
- Bump @memberjunction/core to v1.5.2
- Bump @memberjunction/core-entities to v1.5.2
- Bump @memberjunction/global to v1.5.2
- Bump @memberjunction/queue to v1.5.2
- Bump @memberjunction/ai-vector-dupe to v1.5.2

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Bump @memberjunction/ai to v1.5.1
- Bump @memberjunction/actions to v1.5.1
- Bump @memberjunction/aiengine to v1.5.1
- Bump @memberjunction/core to v1.5.1
- Bump @memberjunction/core-entities to v1.5.1
- Bump @memberjunction/global to v1.5.1
- Bump @memberjunction/queue to v1.5.1
- Bump @memberjunction/ai-vector-dupe to v1.5.1

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.5.0
- Bump @memberjunction/actions to v1.5.0
- Bump @memberjunction/aiengine to v1.5.0
- Bump @memberjunction/core to v1.5.0
- Bump @memberjunction/core-entities to v1.5.0
- Bump @memberjunction/global to v1.5.0
- Bump @memberjunction/queue to v1.5.0
- Bump @memberjunction/ai-vector-dupe to v1.5.0

## 1.4.1

Fri, 07 Jun 2024 04:36:53 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.4.1
- Bump @memberjunction/actions to v1.4.1
- Bump @memberjunction/aiengine to v1.4.1
- Bump @memberjunction/core to v1.4.1
- Bump @memberjunction/core-entities to v1.4.1
- Bump @memberjunction/global to v1.4.1
- Bump @memberjunction/queue to v1.4.1
- Bump @memberjunction/ai-vector-dupe to v1.4.1

## 1.4.0

Sat, 25 May 2024 15:30:16 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.4.0
- Bump @memberjunction/aiengine to v1.4.0
- Bump @memberjunction/core to v1.4.0
- Bump @memberjunction/core-entities to v1.4.0
- Bump @memberjunction/global to v1.4.0
- Bump @memberjunction/queue to v1.4.0
- Bump @memberjunction/ai-vector-dupe to v1.4.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.3.3

Thu, 23 May 2024 18:35:52 GMT

### Patches

- Bump @memberjunction/ai to v1.3.3
- Bump @memberjunction/aiengine to v1.3.3
- Bump @memberjunction/core to v1.3.3
- Bump @memberjunction/core-entities to v1.3.3
- Bump @memberjunction/global to v1.3.3
- Bump @memberjunction/queue to v1.3.3
- Bump @memberjunction/ai-vector-dupe to v1.3.3

## 1.3.2

Thu, 23 May 2024 14:19:50 GMT

### Patches

- Bump @memberjunction/ai to v1.3.2
- Bump @memberjunction/aiengine to v1.3.2
- Bump @memberjunction/core to v1.3.2
- Bump @memberjunction/core-entities to v1.3.2
- Bump @memberjunction/global to v1.3.2
- Bump @memberjunction/queue to v1.3.2
- Bump @memberjunction/ai-vector-dupe to v1.3.2

## 1.3.1

Thu, 23 May 2024 02:29:25 GMT

### Patches

- Bump @memberjunction/ai to v1.3.1
- Bump @memberjunction/aiengine to v1.3.1
- Bump @memberjunction/core to v1.3.1
- Bump @memberjunction/core-entities to v1.3.1
- Bump @memberjunction/global to v1.3.1
- Bump @memberjunction/queue to v1.3.1
- Bump @memberjunction/ai-vector-dupe to v1.3.1

## 1.3.0

Wed, 22 May 2024 02:26:03 GMT

### Minor changes

- Overhaul the way we vectorize records (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.3.0
- Bump @memberjunction/aiengine to v1.3.0
- Bump @memberjunction/core to v1.3.0
- Bump @memberjunction/core-entities to v1.3.0
- Bump @memberjunction/global to v1.3.0
- Bump @memberjunction/queue to v1.3.0
- Bump @memberjunction/ai-vector-dupe to v1.3.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.2.2

Thu, 02 May 2024 19:46:38 GMT

### Patches

- Bump @memberjunction/ai to v1.2.2
- Bump @memberjunction/aiengine to v1.2.2
- Bump @memberjunction/core to v1.2.2
- Bump @memberjunction/core-entities to v1.2.2
- Bump @memberjunction/global to v1.2.2
- Bump @memberjunction/queue to v1.2.2
- Bump @memberjunction/ai-vector-dupe to v1.2.2

## 1.2.1

Thu, 02 May 2024 16:46:11 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.2.1
- Bump @memberjunction/aiengine to v1.2.1
- Bump @memberjunction/core to v1.2.1
- Bump @memberjunction/core-entities to v1.2.1
- Bump @memberjunction/global to v1.2.1
- Bump @memberjunction/queue to v1.2.1
- Bump @memberjunction/ai-vector-dupe to v1.2.1

## 1.2.0

Mon, 29 Apr 2024 18:51:58 GMT

### Minor changes

- Bump @memberjunction/ai to v1.2.0
- Bump @memberjunction/aiengine to v1.2.0
- Bump @memberjunction/core to v1.2.0
- Bump @memberjunction/core-entities to v1.2.0
- Bump @memberjunction/global to v1.2.0
- Bump @memberjunction/queue to v1.2.0
- Bump @memberjunction/ai-vector-dupe to v1.2.0

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Bump @memberjunction/ai to v1.1.3
- Bump @memberjunction/aiengine to v1.1.3
- Bump @memberjunction/core to v1.1.3
- Bump @memberjunction/core-entities to v1.1.3
- Bump @memberjunction/global to v1.1.3
- Bump @memberjunction/queue to v1.1.3
- Bump @memberjunction/ai-vector-dupe to v1.1.3

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Bump @memberjunction/ai to v1.1.2
- Bump @memberjunction/aiengine to v1.1.2
- Bump @memberjunction/core to v1.1.2
- Bump @memberjunction/core-entities to v1.1.2
- Bump @memberjunction/global to v1.1.2
- Bump @memberjunction/queue to v1.1.2
- Bump @memberjunction/ai-vector-dupe to v1.1.2

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Bump @memberjunction/ai to v1.1.1
- Bump @memberjunction/aiengine to v1.1.1
- Bump @memberjunction/core to v1.1.1
- Bump @memberjunction/core-entities to v1.1.1
- Bump @memberjunction/global to v1.1.1
- Bump @memberjunction/queue to v1.1.1
- Bump @memberjunction/ai-vector-dupe to v1.1.1

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Bump @memberjunction/ai to v1.1.0
- Bump @memberjunction/aiengine to v1.1.0
- Bump @memberjunction/core to v1.1.0
- Bump @memberjunction/core-entities to v1.1.0
- Bump @memberjunction/global to v1.1.0
- Bump @memberjunction/queue to v1.1.0
- Bump @memberjunction/ai-vector-dupe to v1.1.0

## 1.0.11

Wed, 24 Apr 2024 20:57:42 GMT

### Patches

- - bug fixes in Skip UI \* added exception handling to ReportResolver (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.0.11
- Bump @memberjunction/aiengine to v1.0.11
- Bump @memberjunction/core to v1.0.11
- Bump @memberjunction/core-entities to v1.0.11
- Bump @memberjunction/global to v1.0.11
- Bump @memberjunction/queue to v1.0.11
- Bump @memberjunction/ai-vector-dupe to v1.0.11

## 1.0.9

Sun, 14 Apr 2024 15:50:05 GMT

### Patches

- Bump @memberjunction/ai to v1.0.9
- Bump @memberjunction/aiengine to v1.0.9
- Bump @memberjunction/core to v1.0.9
- Bump @memberjunction/core-entities to v1.0.9
- Bump @memberjunction/global to v1.0.9
- Bump @memberjunction/queue to v1.0.9
- Bump @memberjunction/ai-vector-dupe to v1.0.9

## 1.0.8

Sat, 13 Apr 2024 02:32:44 GMT

### Patches

- Update build and publish automation (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.0.8
- Bump @memberjunction/aiengine to v1.0.8
- Bump @memberjunction/core to v1.0.8
- Bump @memberjunction/core-entities to v1.0.8
- Bump @memberjunction/global to v1.0.8
- Bump @memberjunction/queue to v1.0.8
- Bump @memberjunction/ai-vector-dupe to v1.0.8
  +'{ so it doesn't break flyway
  - @memberjunction/ai@2.67.0
  - @memberjunction/aiengine@2.67.0
  - @memberjunction/ai-vector-dupe@2.67.0
  - @memberjunction/actions@2.67.0
  - @memberjunction/core@2.67.0
  - @memberjunction/core-entities@2.67.0
  - @memberjunction/global@2.67.0
  - @memberjunction/queue@2.67.0

## 2.66.0

### Patch Changes

- Updated dependencies [7e22e3e]
  - @memberjunction/actions@2.66.0
  - @memberjunction/aiengine@2.66.0
  - @memberjunction/ai-vector-dupe@2.66.0
  - @memberjunction/queue@2.66.0
  - @memberjunction/ai@2.66.0
  - @memberjunction/core@2.66.0
  - @memberjunction/core-entities@2.66.0
  - @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- 619488f: Pattern filtering for sql logging
- Updated dependencies [1d034b7]
- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/ai@2.65.0
  - @memberjunction/global@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/aiengine@2.65.0
  - @memberjunction/ai-vector-dupe@2.65.0
  - @memberjunction/actions@2.65.0
  - @memberjunction/queue@2.65.0
  - @memberjunction/core@2.65.0

## 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/aiengine@2.64.0
  - @memberjunction/ai-vector-dupe@2.64.0
  - @memberjunction/actions@2.64.0
  - @memberjunction/queue@2.64.0
  - @memberjunction/ai@2.64.0
  - @memberjunction/core@2.64.0
  - @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/ai@2.63.1
  - @memberjunction/aiengine@2.63.1
  - @memberjunction/ai-vector-dupe@2.63.1
  - @memberjunction/actions@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1
  - @memberjunction/queue@2.63.1

## 2.63.0

### Patch Changes

- Updated dependencies [28e8a85]
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/aiengine@2.63.0
  - @memberjunction/actions@2.63.0
  - @memberjunction/ai-vector-dupe@2.63.0
  - @memberjunction/queue@2.63.0
  - @memberjunction/ai@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/ai@2.62.0
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/actions@2.62.0
  - @memberjunction/aiengine@2.62.0
  - @memberjunction/ai-vector-dupe@2.62.0
  - @memberjunction/queue@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- Updated dependencies [51b2b47]
  - @memberjunction/actions@2.61.0
  - @memberjunction/aiengine@2.61.0
  - @memberjunction/ai-vector-dupe@2.61.0
  - @memberjunction/queue@2.61.0
  - @memberjunction/ai@2.61.0
  - @memberjunction/core@2.61.0
  - @memberjunction/core-entities@2.61.0
  - @memberjunction/global@2.61.0

## 2.60.0

### Patch Changes

- Updated dependencies [b5fa80a]
- Updated dependencies [e30ee12]
- Updated dependencies [e512e4e]
  - @memberjunction/core@2.60.0
  - @memberjunction/core-entities@2.60.0
  - @memberjunction/aiengine@2.60.0
  - @memberjunction/actions@2.60.0
  - @memberjunction/ai-vector-dupe@2.60.0
  - @memberjunction/queue@2.60.0
  - @memberjunction/ai@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/ai@2.59.0
- @memberjunction/aiengine@2.59.0
- @memberjunction/ai-vector-dupe@2.59.0
- @memberjunction/actions@2.59.0
- @memberjunction/core@2.59.0
- @memberjunction/core-entities@2.59.0
- @memberjunction/global@2.59.0
- @memberjunction/queue@2.59.0

## 2.58.0

### Patch Changes

- def26fe: Added UUID generation to BaseEntity for entities that have single-column pkey that is uniqueidentifier type
- Updated dependencies [def26fe]
- Updated dependencies [db88416]
  - @memberjunction/core@2.58.0
  - @memberjunction/ai@2.58.0
  - @memberjunction/aiengine@2.58.0
  - @memberjunction/ai-vector-dupe@2.58.0
  - @memberjunction/actions@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/queue@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Minor Changes

- 0ba485f: various bug fixes

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/global@2.57.0
  - @memberjunction/aiengine@2.57.0
  - @memberjunction/ai-vector-dupe@2.57.0
  - @memberjunction/actions@2.57.0
  - @memberjunction/queue@2.57.0
  - @memberjunction/ai@2.57.0

## 2.56.0

### Patch Changes

- Updated dependencies [bf24cae]
  - @memberjunction/actions@2.56.0
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/aiengine@2.56.0
  - @memberjunction/ai-vector-dupe@2.56.0
  - @memberjunction/queue@2.56.0
  - @memberjunction/ai@2.56.0
  - @memberjunction/core@2.56.0
  - @memberjunction/global@2.56.0

## 2.55.0

### Minor Changes

- c3a49ff: Agent Manager + SQL Server fix + fix deps in core-entity-forms

### Patch Changes

- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
  - @memberjunction/ai@2.55.0
  - @memberjunction/aiengine@2.55.0
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/ai-vector-dupe@2.55.0
  - @memberjunction/actions@2.55.0
  - @memberjunction/queue@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- dfca664: **SQLServerDataProvider Changes:**
  - SQLServerTransactionGroup now immediately rolls back and stops processing on first operation failure
  - Enhanced error handling to prevent double rollback attempts
  - Improved error messages to clearly indicate when transactions are rolled back

- 1273b07: fix transaction handling
- Updated dependencies [20f424d]
- Updated dependencies [a6f553e]
- Updated dependencies [0f6e995]
- Updated dependencies [0046359]
  - @memberjunction/core@2.54.0
  - @memberjunction/aiengine@2.54.0
  - @memberjunction/ai-vector-dupe@2.54.0
  - @memberjunction/actions@2.54.0
  - @memberjunction/core-entities@2.54.0
  - @memberjunction/queue@2.54.0
  - @memberjunction/ai@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- Updated dependencies [bddc4ea]
- Updated dependencies [390f587]
- Updated dependencies [b5560c0]
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/actions@2.53.0
  - @memberjunction/aiengine@2.53.0
  - @memberjunction/ai-vector-dupe@2.53.0
  - @memberjunction/queue@2.53.0
  - @memberjunction/ai@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Patch Changes

- Updated dependencies [e926106]
- Updated dependencies [760e844]
  - @memberjunction/ai@2.52.0
  - @memberjunction/aiengine@2.52.0
  - @memberjunction/ai-vector-dupe@2.52.0
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/actions@2.52.0
  - @memberjunction/queue@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Patch Changes

- Updated dependencies [4a79606]
- Updated dependencies [faf513c]
- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
- Updated dependencies [0ddb438]
  - @memberjunction/ai@2.51.0
  - @memberjunction/aiengine@2.51.0
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/actions@2.51.0
  - @memberjunction/ai-vector-dupe@2.51.0
  - @memberjunction/queue@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/ai@2.50.0
- @memberjunction/aiengine@2.50.0
- @memberjunction/ai-vector-dupe@2.50.0
- @memberjunction/actions@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/global@2.50.0
- @memberjunction/queue@2.50.0

## 2.49.0

### Minor Changes

- cc52ced: Significant changes all around
- db17ed7: Further Updates
- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [2f974e2]
- Updated dependencies [cc52ced]
- Updated dependencies [ca3365f]
- Updated dependencies [b5d9fbd]
- Updated dependencies [db17ed7]
- Updated dependencies [62cf1b6]
  - @memberjunction/core-entities@2.49.0
  - @memberjunction/core@2.49.0
  - @memberjunction/global@2.49.0
  - @memberjunction/actions@2.49.0
  - @memberjunction/ai@2.49.0
  - @memberjunction/aiengine@2.49.0
  - @memberjunction/ai-vector-dupe@2.49.0
  - @memberjunction/queue@2.49.0

## 2.48.0

### Patch Changes

- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
  - @memberjunction/core@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/aiengine@2.48.0
  - @memberjunction/ai-vector-dupe@2.48.0
  - @memberjunction/actions@2.48.0
  - @memberjunction/queue@2.48.0
  - @memberjunction/ai@2.48.0
  - @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- 3f31192: bug fixes for date handling ISO strings for null dates
  - @memberjunction/aiengine@2.47.0
  - @memberjunction/ai-vector-dupe@2.47.0
  - @memberjunction/actions@2.47.0
  - @memberjunction/queue@2.47.0
  - @memberjunction/ai@2.47.0
  - @memberjunction/core@2.47.0
  - @memberjunction/core-entities@2.47.0
  - @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/ai@2.46.0
- @memberjunction/aiengine@2.46.0
- @memberjunction/ai-vector-dupe@2.46.0
- @memberjunction/actions@2.46.0
- @memberjunction/core@2.46.0
- @memberjunction/core-entities@2.46.0
- @memberjunction/global@2.46.0
- @memberjunction/queue@2.46.0

## 2.45.0

### Patch Changes

- Updated dependencies [21d456d]
- Updated dependencies [556ee8d]
  - @memberjunction/ai@2.45.0
  - @memberjunction/aiengine@2.45.0
  - @memberjunction/core-entities@2.45.0
  - @memberjunction/ai-vector-dupe@2.45.0
  - @memberjunction/actions@2.45.0
  - @memberjunction/queue@2.45.0
  - @memberjunction/core@2.45.0
  - @memberjunction/global@2.45.0

## 2.44.0

### Patch Changes

- Updated dependencies [f7aec1c]
- Updated dependencies [fbc30dc]
- Updated dependencies [9f02cd8]
- Updated dependencies [99b27c5]
- Updated dependencies [091c5f6]
  - @memberjunction/aiengine@2.44.0
  - @memberjunction/ai@2.44.0
  - @memberjunction/core@2.44.0
  - @memberjunction/core-entities@2.44.0
  - @memberjunction/ai-vector-dupe@2.44.0
  - @memberjunction/actions@2.44.0
  - @memberjunction/queue@2.44.0
  - @memberjunction/global@2.44.0

## 2.43.0

### Patch Changes

- Updated dependencies [1629c04]
  - @memberjunction/core@2.43.0
  - @memberjunction/aiengine@2.43.0
  - @memberjunction/ai-vector-dupe@2.43.0
  - @memberjunction/actions@2.43.0
  - @memberjunction/core-entities@2.43.0
  - @memberjunction/queue@2.43.0
  - @memberjunction/ai@2.43.0
  - @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/ai@2.42.1
- @memberjunction/aiengine@2.42.1
- @memberjunction/ai-vector-dupe@2.42.1
- @memberjunction/actions@2.42.1
- @memberjunction/core@2.42.1
- @memberjunction/core-entities@2.42.1
- @memberjunction/global@2.42.1
- @memberjunction/queue@2.42.1

## 2.42.0

### Minor Changes

- 5c4ff39: bug fix for DatasetTimestamp comparison

### Patch Changes

- Updated dependencies [d49f25c]
  - @memberjunction/ai@2.42.0
  - @memberjunction/aiengine@2.42.0
  - @memberjunction/ai-vector-dupe@2.42.0
  - @memberjunction/actions@2.42.0
  - @memberjunction/queue@2.42.0
  - @memberjunction/core@2.42.0
  - @memberjunction/core-entities@2.42.0
  - @memberjunction/global@2.42.0

## 2.41.0

### Patch Changes

- 3be3f71: Patched sql stored procedure name for tables with name colisions.
- Updated dependencies [3be3f71]
- Updated dependencies [9d3b577]
- Updated dependencies [276371d]
- Updated dependencies [7e0523d]
  - @memberjunction/core@2.41.0
  - @memberjunction/ai@2.41.0
  - @memberjunction/core-entities@2.41.0
  - @memberjunction/aiengine@2.41.0
  - @memberjunction/ai-vector-dupe@2.41.0
  - @memberjunction/actions@2.41.0
  - @memberjunction/queue@2.41.0
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- Updated dependencies [b6ce661]
  - @memberjunction/ai@2.40.0
  - @memberjunction/aiengine@2.40.0
  - @memberjunction/ai-vector-dupe@2.40.0
  - @memberjunction/actions@2.40.0
  - @memberjunction/queue@2.40.0
  - @memberjunction/core@2.40.0
  - @memberjunction/core-entities@2.40.0
  - @memberjunction/global@2.40.0

## 2.39.0

### Patch Changes

- Updated dependencies [f73ea0e]
- Updated dependencies [e93f580]
- Updated dependencies [c9ccc36]
  - @memberjunction/ai@2.39.0
  - @memberjunction/aiengine@2.39.0
  - @memberjunction/core-entities@2.39.0
  - @memberjunction/ai-vector-dupe@2.39.0
  - @memberjunction/actions@2.39.0
  - @memberjunction/queue@2.39.0
  - @memberjunction/core@2.39.0
  - @memberjunction/global@2.39.0

## 2.38.0

### Patch Changes

- Updated dependencies [c835ded]
  - @memberjunction/core-entities@2.38.0
  - @memberjunction/aiengine@2.38.0
  - @memberjunction/ai-vector-dupe@2.38.0
  - @memberjunction/actions@2.38.0
  - @memberjunction/queue@2.38.0
  - @memberjunction/ai@2.38.0
  - @memberjunction/core@2.38.0
  - @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/ai@2.37.1
- @memberjunction/aiengine@2.37.1
- @memberjunction/ai-vector-dupe@2.37.1
- @memberjunction/actions@2.37.1
- @memberjunction/core@2.37.1
- @memberjunction/core-entities@2.37.1
- @memberjunction/global@2.37.1
- @memberjunction/queue@2.37.1

## 2.37.0

### Patch Changes

- Updated dependencies [1418b71]
  - @memberjunction/core-entities@2.37.0
  - @memberjunction/aiengine@2.37.0
  - @memberjunction/ai-vector-dupe@2.37.0
  - @memberjunction/actions@2.37.0
  - @memberjunction/queue@2.37.0
  - @memberjunction/ai@2.37.0
  - @memberjunction/core@2.37.0
  - @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- Updated dependencies [d9defc9]
- Updated dependencies [9d709e2]
- Updated dependencies [577cc6a]
- Updated dependencies [b45b336]
  - @memberjunction/ai@2.36.1
  - @memberjunction/core@2.36.1
  - @memberjunction/aiengine@2.36.1
  - @memberjunction/ai-vector-dupe@2.36.1
  - @memberjunction/actions@2.36.1
  - @memberjunction/queue@2.36.1
  - @memberjunction/core-entities@2.36.1
  - @memberjunction/global@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
- Updated dependencies [160f24f]
  - @memberjunction/ai-vector-dupe@2.36.0
  - @memberjunction/actions@2.36.0
  - @memberjunction/core-entities@2.36.0
  - @memberjunction/aiengine@2.36.0
  - @memberjunction/global@2.36.0
  - @memberjunction/ai@2.36.0
  - @memberjunction/queue@2.36.0
  - @memberjunction/core@2.36.0

## 2.35.1

### Patch Changes

- 3e7ec64: Strong typing for transaction item callback function and fix bug in SQL Server Data Provider caused by weak typing
- Updated dependencies [3e7ec64]
  - @memberjunction/core@2.35.1
  - @memberjunction/aiengine@2.35.1
  - @memberjunction/ai-vector-dupe@2.35.1
  - @memberjunction/actions@2.35.1
  - @memberjunction/core-entities@2.35.1
  - @memberjunction/queue@2.35.1
  - @memberjunction/ai@2.35.1
  - @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/ai-vector-dupe@2.35.0
- @memberjunction/ai@2.35.0
- @memberjunction/aiengine@2.35.0
- @memberjunction/actions@2.35.0
- @memberjunction/core@2.35.0
- @memberjunction/core-entities@2.35.0
- @memberjunction/global@2.35.0
- @memberjunction/queue@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/ai@2.34.2
- @memberjunction/aiengine@2.34.2
- @memberjunction/ai-vector-dupe@2.34.2
- @memberjunction/actions@2.34.2
- @memberjunction/core@2.34.2
- @memberjunction/core-entities@2.34.2
- @memberjunction/global@2.34.2
- @memberjunction/queue@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/ai@2.34.1
- @memberjunction/aiengine@2.34.1
- @memberjunction/ai-vector-dupe@2.34.1
- @memberjunction/actions@2.34.1
- @memberjunction/core@2.34.1
- @memberjunction/core-entities@2.34.1
- @memberjunction/global@2.34.1
- @memberjunction/queue@2.34.1

## 2.34.0

### Patch Changes

- Updated dependencies [e60f326]
- Updated dependencies [785f06a]
- Updated dependencies [b48d6b4]
- Updated dependencies [4c7f532]
- Updated dependencies [54ac86c]
  - @memberjunction/core-entities@2.34.0
  - @memberjunction/core@2.34.0
  - @memberjunction/ai@2.34.0
  - @memberjunction/aiengine@2.34.0
  - @memberjunction/ai-vector-dupe@2.34.0
  - @memberjunction/actions@2.34.0
  - @memberjunction/queue@2.34.0
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- 02d7391: Claude Code Performance Optimizations for MJServer and SQLServerDataProvider as proposed
- Updated dependencies [efafd0e]
  - @memberjunction/ai@2.33.0
  - @memberjunction/ai-vector-dupe@2.33.0
  - @memberjunction/aiengine@2.33.0
  - @memberjunction/actions@2.33.0
  - @memberjunction/queue@2.33.0
  - @memberjunction/core@2.33.0
  - @memberjunction/core-entities@2.33.0
  - @memberjunction/global@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/ai@2.32.2
- @memberjunction/aiengine@2.32.2
- @memberjunction/ai-vector-dupe@2.32.2
- @memberjunction/actions@2.32.2
- @memberjunction/core@2.32.2
- @memberjunction/core-entities@2.32.2
- @memberjunction/global@2.32.2
- @memberjunction/queue@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/ai@2.32.1
- @memberjunction/aiengine@2.32.1
- @memberjunction/ai-vector-dupe@2.32.1
- @memberjunction/actions@2.32.1
- @memberjunction/core@2.32.1
- @memberjunction/core-entities@2.32.1
- @memberjunction/global@2.32.1
- @memberjunction/queue@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/ai@2.32.0
- @memberjunction/aiengine@2.32.0
- @memberjunction/ai-vector-dupe@2.32.0
- @memberjunction/actions@2.32.0
- @memberjunction/core@2.32.0
- @memberjunction/core-entities@2.32.0
- @memberjunction/global@2.32.0
- @memberjunction/queue@2.32.0

## 2.31.0

### Patch Changes

- Updated dependencies [67c0b7f]
  - @memberjunction/aiengine@2.31.0
  - @memberjunction/ai-vector-dupe@2.31.0
  - @memberjunction/actions@2.31.0
  - @memberjunction/queue@2.31.0
  - @memberjunction/ai@2.31.0
  - @memberjunction/core@2.31.0
  - @memberjunction/core-entities@2.31.0
  - @memberjunction/global@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [8f71da0]
- Updated dependencies [a3ab749]
- Updated dependencies [63dc5a9]
  - @memberjunction/actions@2.30.0
  - @memberjunction/aiengine@2.30.0
  - @memberjunction/core-entities@2.30.0
  - @memberjunction/global@2.30.0
  - @memberjunction/ai-vector-dupe@2.30.0
  - @memberjunction/queue@2.30.0
  - @memberjunction/ai@2.30.0
  - @memberjunction/core@2.30.0

## 2.29.2

### Patch Changes

- 64aa7f0: New query for 2.29.0 to get version history since we aren't using an entity for flyway data anymore. Improvements to query execution to support query execution by name as well as by ID, and general cleanup (code wasn't working before as query ID wasn't enclosed in quotes from days of INT ID types)
- Updated dependencies [07bde92]
- Updated dependencies [64aa7f0]
- Updated dependencies [69c3505]
  - @memberjunction/core@2.29.2
  - @memberjunction/core-entities@2.29.2
  - @memberjunction/aiengine@2.29.2
  - @memberjunction/ai-vector-dupe@2.29.2
  - @memberjunction/actions@2.29.2
  - @memberjunction/queue@2.29.2
  - @memberjunction/ai@2.29.2
  - @memberjunction/global@2.29.2

## 2.28.0

### Patch Changes

- Updated dependencies [8259093]
  - @memberjunction/core@2.28.0
  - @memberjunction/aiengine@2.28.0
  - @memberjunction/ai-vector-dupe@2.28.0
  - @memberjunction/actions@2.28.0
  - @memberjunction/core-entities@2.28.0
  - @memberjunction/queue@2.28.0
  - @memberjunction/ai@2.28.0
  - @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/ai@2.27.1
- @memberjunction/aiengine@2.27.1
- @memberjunction/ai-vector-dupe@2.27.1
- @memberjunction/actions@2.27.1
- @memberjunction/core@2.27.1
- @memberjunction/core-entities@2.27.1
- @memberjunction/global@2.27.1
- @memberjunction/queue@2.27.1

## 2.27.0

### Patch Changes

- Updated dependencies [54ab868]
- Updated dependencies [b4d3cbc]
- Updated dependencies [5a81451]
  - @memberjunction/core@2.27.0
  - @memberjunction/ai@2.27.0
  - @memberjunction/core-entities@2.27.0
  - @memberjunction/aiengine@2.27.0
  - @memberjunction/ai-vector-dupe@2.27.0
  - @memberjunction/actions@2.27.0
  - @memberjunction/queue@2.27.0
  - @memberjunction/global@2.27.0

## 2.26.1

### Patch Changes

- @memberjunction/ai@2.26.1
- @memberjunction/aiengine@2.26.1
- @memberjunction/ai-vector-dupe@2.26.1
- @memberjunction/actions@2.26.1
- @memberjunction/core@2.26.1
- @memberjunction/core-entities@2.26.1
- @memberjunction/global@2.26.1
- @memberjunction/queue@2.26.1

## 2.26.0

### Minor Changes

- 23801c5: Changes to use of TransactionGroup to use await at all times.Fixed up some metadata bugs in the \_\_mj schema that somehow existed from prior builds.Cleaned up SQL Server Data Provider handling of virtual fields in track record changesFixed CodeGen to not emit null wrapped as a string that was happening in some casesHardened MJCore.BaseEntity to treat a string with the word null in it as same as a true null value (in case someone throws that into the DB)

### Patch Changes

- Updated dependencies [23801c5]
  - @memberjunction/core@2.26.0
  - @memberjunction/aiengine@2.26.0
  - @memberjunction/ai-vector-dupe@2.26.0
  - @memberjunction/actions@2.26.0
  - @memberjunction/core-entities@2.26.0
  - @memberjunction/queue@2.26.0
  - @memberjunction/ai@2.26.0
  - @memberjunction/global@2.26.0

## 2.25.0

### Minor Changes

- 26c990d: - Add Conversations to Resource Types Entity* Update User View Grid to fix multi-edit bug* Transaction Management Changes - fixes bug in #803 - but not new feature in there* Clean bug in Notification Service to only show user-centric messages* Add Sharing dialog to Skip Chat component

### Patch Changes

- 0647504: support new TransactionItem constructor in SQLServerDataProvider
- 824eca2: Transaction Group improvements
- 86e6d3b: Finished debug for Variables support in transaction groups!
- Updated dependencies [fd07dcd]
- Updated dependencies [26c990d]
- Updated dependencies [86e6d3b]
  - @memberjunction/core@2.25.0
  - @memberjunction/aiengine@2.25.0
  - @memberjunction/ai-vector-dupe@2.25.0
  - @memberjunction/actions@2.25.0
  - @memberjunction/core-entities@2.25.0
  - @memberjunction/queue@2.25.0
  - @memberjunction/ai@2.25.0
  - @memberjunction/global@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/ai@2.24.1
- @memberjunction/aiengine@2.24.1
- @memberjunction/ai-vector-dupe@2.24.1
- @memberjunction/actions@2.24.1
- @memberjunction/core@2.24.1
- @memberjunction/core-entities@2.24.1
- @memberjunction/global@2.24.1
- @memberjunction/queue@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [9cb85cc]
- Updated dependencies [7c6ff41]
  - @memberjunction/global@2.24.0
  - @memberjunction/core-entities@2.24.0
  - @memberjunction/ai@2.24.0
  - @memberjunction/aiengine@2.24.0
  - @memberjunction/ai-vector-dupe@2.24.0
  - @memberjunction/actions@2.24.0
  - @memberjunction/core@2.24.0
  - @memberjunction/queue@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/ai@2.23.2
- @memberjunction/aiengine@2.23.2
- @memberjunction/ai-vector-dupe@2.23.2
- @memberjunction/actions@2.23.2
- @memberjunction/core@2.23.2
- @memberjunction/core-entities@2.23.2
- @memberjunction/global@2.23.2
- @memberjunction/queue@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/ai@2.23.1
- @memberjunction/aiengine@2.23.1
- @memberjunction/ai-vector-dupe@2.23.1
- @memberjunction/actions@2.23.1
- @memberjunction/core@2.23.1
- @memberjunction/core-entities@2.23.1
- @memberjunction/global@2.23.1
- @memberjunction/queue@2.23.1

## 2.23.0

### Minor Changes

- 09d3fa9: Defaulting cache refresh interval to disabled to allow database pausing unless refresh is explicitly set.

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/global@2.23.0
  - @memberjunction/ai@2.23.0
  - @memberjunction/aiengine@2.23.0
  - @memberjunction/ai-vector-dupe@2.23.0
  - @memberjunction/actions@2.23.0
  - @memberjunction/core@2.23.0
  - @memberjunction/core-entities@2.23.0
  - @memberjunction/queue@2.23.0

## 2.22.2

### Patch Changes

- Updated dependencies [94ebf81]
  - @memberjunction/core@2.22.2
  - @memberjunction/aiengine@2.22.2
  - @memberjunction/ai-vector-dupe@2.22.2
  - @memberjunction/actions@2.22.2
  - @memberjunction/core-entities@2.22.2
  - @memberjunction/queue@2.22.2
  - @memberjunction/ai@2.22.2
  - @memberjunction/global@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/ai@2.22.1
- @memberjunction/aiengine@2.22.1
- @memberjunction/ai-vector-dupe@2.22.1
- @memberjunction/actions@2.22.1
- @memberjunction/core@2.22.1
- @memberjunction/core-entities@2.22.1
- @memberjunction/global@2.22.1
- @memberjunction/queue@2.22.1

## 2.22.0

### Patch Changes

- Updated dependencies [a598f1a]
- Updated dependencies [9660275]
  - @memberjunction/core@2.22.0
  - @memberjunction/global@2.22.0
  - @memberjunction/aiengine@2.22.0
  - @memberjunction/ai-vector-dupe@2.22.0
  - @memberjunction/actions@2.22.0
  - @memberjunction/core-entities@2.22.0
  - @memberjunction/queue@2.22.0
  - @memberjunction/ai@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.21.0
- Bump @memberjunction/ai to v2.21.0
- Bump @memberjunction/ai-vector-dupe to v2.21.0
- Bump @memberjunction/aiengine to v2.21.0
- Bump @memberjunction/core to v2.21.0
- Bump @memberjunction/core-entities to v2.21.0
- Bump @memberjunction/global to v2.21.0
- Bump @memberjunction/queue to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

### Patches

- Bump @memberjunction/actions to v2.20.3
- Bump @memberjunction/ai to v2.20.3
- Bump @memberjunction/ai-vector-dupe to v2.20.3
- Bump @memberjunction/aiengine to v2.20.3
- Bump @memberjunction/core to v2.20.3
- Bump @memberjunction/core-entities to v2.20.3
- Bump @memberjunction/global to v2.20.3
- Bump @memberjunction/queue to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Bump @memberjunction/actions to v2.20.2
- Bump @memberjunction/ai to v2.20.2
- Bump @memberjunction/ai-vector-dupe to v2.20.2
- Bump @memberjunction/aiengine to v2.20.2
- Bump @memberjunction/core to v2.20.2
- Bump @memberjunction/core-entities to v2.20.2
- Bump @memberjunction/global to v2.20.2
- Bump @memberjunction/queue to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/actions to v2.20.1
- Bump @memberjunction/ai to v2.20.1
- Bump @memberjunction/ai-vector-dupe to v2.20.1
- Bump @memberjunction/aiengine to v2.20.1
- Bump @memberjunction/core to v2.20.1
- Bump @memberjunction/core-entities to v2.20.1
- Bump @memberjunction/global to v2.20.1
- Bump @memberjunction/queue to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:03 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.20.0
- Bump @memberjunction/ai to v2.20.0
- Bump @memberjunction/ai-vector-dupe to v2.20.0
- Bump @memberjunction/aiengine to v2.20.0
- Bump @memberjunction/core to v2.20.0
- Bump @memberjunction/core-entities to v2.20.0
- Bump @memberjunction/global to v2.20.0
- Bump @memberjunction/queue to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/actions to v2.19.5
- Bump @memberjunction/ai to v2.19.5
- Bump @memberjunction/ai-vector-dupe to v2.19.5
- Bump @memberjunction/aiengine to v2.19.5
- Bump @memberjunction/core to v2.19.5
- Bump @memberjunction/core-entities to v2.19.5
- Bump @memberjunction/global to v2.19.5
- Bump @memberjunction/queue to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/actions to v2.19.4
- Bump @memberjunction/ai to v2.19.4
- Bump @memberjunction/ai-vector-dupe to v2.19.4
- Bump @memberjunction/aiengine to v2.19.4
- Bump @memberjunction/core to v2.19.4
- Bump @memberjunction/core-entities to v2.19.4
- Bump @memberjunction/global to v2.19.4
- Bump @memberjunction/queue to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/actions to v2.19.3
- Bump @memberjunction/ai to v2.19.3
- Bump @memberjunction/ai-vector-dupe to v2.19.3
- Bump @memberjunction/aiengine to v2.19.3
- Bump @memberjunction/core to v2.19.3
- Bump @memberjunction/core-entities to v2.19.3
- Bump @memberjunction/global to v2.19.3
- Bump @memberjunction/queue to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/actions to v2.19.2
- Bump @memberjunction/ai to v2.19.2
- Bump @memberjunction/ai-vector-dupe to v2.19.2
- Bump @memberjunction/aiengine to v2.19.2
- Bump @memberjunction/core to v2.19.2
- Bump @memberjunction/core-entities to v2.19.2
- Bump @memberjunction/global to v2.19.2
- Bump @memberjunction/queue to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/actions to v2.19.1
- Bump @memberjunction/ai to v2.19.1
- Bump @memberjunction/ai-vector-dupe to v2.19.1
- Bump @memberjunction/aiengine to v2.19.1
- Bump @memberjunction/core to v2.19.1
- Bump @memberjunction/core-entities to v2.19.1
- Bump @memberjunction/global to v2.19.1
- Bump @memberjunction/queue to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:47 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.19.0
- Bump @memberjunction/ai to v2.19.0
- Bump @memberjunction/ai-vector-dupe to v2.19.0
- Bump @memberjunction/aiengine to v2.19.0
- Bump @memberjunction/core to v2.19.0
- Bump @memberjunction/core-entities to v2.19.0
- Bump @memberjunction/global to v2.19.0
- Bump @memberjunction/queue to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.18.3
- Bump @memberjunction/ai to v2.18.3
- Bump @memberjunction/ai-vector-dupe to v2.18.3
- Bump @memberjunction/aiengine to v2.18.3
- Bump @memberjunction/core to v2.18.3
- Bump @memberjunction/core-entities to v2.18.3
- Bump @memberjunction/global to v2.18.3
- Bump @memberjunction/queue to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/actions to v2.18.2
- Bump @memberjunction/ai to v2.18.2
- Bump @memberjunction/ai-vector-dupe to v2.18.2
- Bump @memberjunction/aiengine to v2.18.2
- Bump @memberjunction/core to v2.18.2
- Bump @memberjunction/core-entities to v2.18.2
- Bump @memberjunction/global to v2.18.2
- Bump @memberjunction/queue to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/actions to v2.18.1
- Bump @memberjunction/ai to v2.18.1
- Bump @memberjunction/ai-vector-dupe to v2.18.1
- Bump @memberjunction/aiengine to v2.18.1
- Bump @memberjunction/core to v2.18.1
- Bump @memberjunction/core-entities to v2.18.1
- Bump @memberjunction/global to v2.18.1
- Bump @memberjunction/queue to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Bump @memberjunction/actions to v2.18.0
- Bump @memberjunction/ai to v2.18.0
- Bump @memberjunction/ai-vector-dupe to v2.18.0
- Bump @memberjunction/aiengine to v2.18.0
- Bump @memberjunction/core to v2.18.0
- Bump @memberjunction/core-entities to v2.18.0
- Bump @memberjunction/global to v2.18.0
- Bump @memberjunction/queue to v2.18.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Bump @memberjunction/actions to v2.17.0
- Bump @memberjunction/ai to v2.17.0
- Bump @memberjunction/ai-vector-dupe to v2.17.0
- Bump @memberjunction/aiengine to v2.17.0
- Bump @memberjunction/core to v2.17.0
- Bump @memberjunction/core-entities to v2.17.0
- Bump @memberjunction/global to v2.17.0
- Bump @memberjunction/queue to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:27 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.16.1
- Bump @memberjunction/ai to v2.16.1
- Bump @memberjunction/ai-vector-dupe to v2.16.1
- Bump @memberjunction/aiengine to v2.16.1
- Bump @memberjunction/core to v2.16.1
- Bump @memberjunction/core-entities to v2.16.1
- Bump @memberjunction/global to v2.16.1
- Bump @memberjunction/queue to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Bump @memberjunction/actions to v2.16.0
- Bump @memberjunction/ai to v2.16.0
- Bump @memberjunction/ai-vector-dupe to v2.16.0
- Bump @memberjunction/aiengine to v2.16.0
- Bump @memberjunction/core to v2.16.0
- Bump @memberjunction/core-entities to v2.16.0
- Bump @memberjunction/global to v2.16.0
- Bump @memberjunction/queue to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:27 GMT

### Patches

- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.15.2
- Bump @memberjunction/ai to v2.15.2
- Bump @memberjunction/ai-vector-dupe to v2.15.2
- Bump @memberjunction/aiengine to v2.15.2
- Bump @memberjunction/core to v2.15.2
- Bump @memberjunction/core-entities to v2.15.2
- Bump @memberjunction/global to v2.15.2
- Bump @memberjunction/queue to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.14.0
- Bump @memberjunction/ai to v2.14.0
- Bump @memberjunction/ai-vector-dupe to v2.14.0
- Bump @memberjunction/aiengine to v2.14.0
- Bump @memberjunction/core to v2.14.0
- Bump @memberjunction/core-entities to v2.14.0
- Bump @memberjunction/global to v2.14.0
- Bump @memberjunction/queue to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/actions to v2.13.4
- Bump @memberjunction/ai to v2.13.4
- Bump @memberjunction/ai-vector-dupe to v2.13.4
- Bump @memberjunction/aiengine to v2.13.4
- Bump @memberjunction/core to v2.13.4
- Bump @memberjunction/core-entities to v2.13.4
- Bump @memberjunction/global to v2.13.4
- Bump @memberjunction/queue to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:45 GMT

### Patches

- Bump @memberjunction/actions to v2.13.3
- Bump @memberjunction/ai to v2.13.3
- Bump @memberjunction/ai-vector-dupe to v2.13.3
- Bump @memberjunction/aiengine to v2.13.3
- Bump @memberjunction/core to v2.13.3
- Bump @memberjunction/core-entities to v2.13.3
- Bump @memberjunction/global to v2.13.3
- Bump @memberjunction/queue to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/actions to v2.13.2
- Bump @memberjunction/ai to v2.13.2
- Bump @memberjunction/ai-vector-dupe to v2.13.2
- Bump @memberjunction/aiengine to v2.13.2
- Bump @memberjunction/core to v2.13.2
- Bump @memberjunction/core-entities to v2.13.2
- Bump @memberjunction/global to v2.13.2
- Bump @memberjunction/queue to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Bump @memberjunction/actions to v2.13.1
- Bump @memberjunction/ai to v2.13.1
- Bump @memberjunction/ai-vector-dupe to v2.13.1
- Bump @memberjunction/aiengine to v2.13.1
- Bump @memberjunction/core to v2.13.1
- Bump @memberjunction/core-entities to v2.13.1
- Bump @memberjunction/global to v2.13.1
- Bump @memberjunction/queue to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/actions to v2.13.0
- Bump @memberjunction/ai to v2.13.0
- Bump @memberjunction/ai-vector-dupe to v2.13.0
- Bump @memberjunction/aiengine to v2.13.0
- Bump @memberjunction/core to v2.13.0
- Bump @memberjunction/core-entities to v2.13.0
- Bump @memberjunction/global to v2.13.0
- Bump @memberjunction/queue to v2.13.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.12.0
- Bump @memberjunction/ai to v2.12.0
- Bump @memberjunction/ai-vector-dupe to v2.12.0
- Bump @memberjunction/aiengine to v2.12.0
- Bump @memberjunction/core to v2.12.0
- Bump @memberjunction/core-entities to v2.12.0
- Bump @memberjunction/global to v2.12.0
- Bump @memberjunction/queue to v2.12.0

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Bump @memberjunction/actions to v2.11.0
- Bump @memberjunction/ai to v2.11.0
- Bump @memberjunction/ai-vector-dupe to v2.11.0
- Bump @memberjunction/aiengine to v2.11.0
- Bump @memberjunction/core to v2.11.0
- Bump @memberjunction/core-entities to v2.11.0
- Bump @memberjunction/global to v2.11.0
- Bump @memberjunction/queue to v2.11.0

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Bump @memberjunction/actions to v2.10.0
- Bump @memberjunction/ai to v2.10.0
- Bump @memberjunction/ai-vector-dupe to v2.10.0
- Bump @memberjunction/aiengine to v2.10.0
- Bump @memberjunction/core to v2.10.0
- Bump @memberjunction/core-entities to v2.10.0
- Bump @memberjunction/global to v2.10.0
- Bump @memberjunction/queue to v2.10.0

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Bump @memberjunction/actions to v2.9.0
- Bump @memberjunction/ai to v2.9.0
- Bump @memberjunction/ai-vector-dupe to v2.9.0
- Bump @memberjunction/aiengine to v2.9.0
- Bump @memberjunction/core to v2.9.0
- Bump @memberjunction/core-entities to v2.9.0
- Bump @memberjunction/global to v2.9.0
- Bump @memberjunction/queue to v2.9.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Bump @memberjunction/actions to v2.8.0
- Bump @memberjunction/ai to v2.8.0
- Bump @memberjunction/ai-vector-dupe to v2.8.0
- Bump @memberjunction/aiengine to v2.8.0
- Bump @memberjunction/core to v2.8.0
- Bump @memberjunction/core-entities to v2.8.0
- Bump @memberjunction/global to v2.8.0
- Bump @memberjunction/queue to v2.8.0

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.7.1
- Bump @memberjunction/ai to v2.7.1
- Bump @memberjunction/ai-vector-dupe to v2.7.1
- Bump @memberjunction/aiengine to v2.7.1
- Bump @memberjunction/core to v2.7.1
- Bump @memberjunction/core-entities to v2.7.1
- Bump @memberjunction/global to v2.7.1
- Bump @memberjunction/queue to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.7.0
- Bump @memberjunction/ai to v2.7.0
- Bump @memberjunction/ai-vector-dupe to v2.7.0
- Bump @memberjunction/aiengine to v2.7.0
- Bump @memberjunction/core to v2.7.0
- Bump @memberjunction/core-entities to v2.7.0
- Bump @memberjunction/global to v2.7.0
- Bump @memberjunction/queue to v2.7.0

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Bump @memberjunction/actions to v2.6.1
- Bump @memberjunction/ai to v2.6.1
- Bump @memberjunction/ai-vector-dupe to v2.6.1
- Bump @memberjunction/aiengine to v2.6.1
- Bump @memberjunction/core to v2.6.1
- Bump @memberjunction/core-entities to v2.6.1
- Bump @memberjunction/global to v2.6.1
- Bump @memberjunction/queue to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:39 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.6.0
- Bump @memberjunction/ai to v2.6.0
- Bump @memberjunction/ai-vector-dupe to v2.6.0
- Bump @memberjunction/aiengine to v2.6.0
- Bump @memberjunction/core to v2.6.0
- Bump @memberjunction/core-entities to v2.6.0
- Bump @memberjunction/global to v2.6.0
- Bump @memberjunction/queue to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:02 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Bump @memberjunction/actions to v2.5.2
- Bump @memberjunction/ai to v2.5.2
- Bump @memberjunction/ai-vector-dupe to v2.5.2
- Bump @memberjunction/aiengine to v2.5.2
- Bump @memberjunction/core to v2.5.2
- Bump @memberjunction/core-entities to v2.5.2
- Bump @memberjunction/global to v2.5.2
- Bump @memberjunction/queue to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/actions to v2.5.1
- Bump @memberjunction/ai to v2.5.1
- Bump @memberjunction/ai-vector-dupe to v2.5.1
- Bump @memberjunction/aiengine to v2.5.1
- Bump @memberjunction/core to v2.5.1
- Bump @memberjunction/core-entities to v2.5.1
- Bump @memberjunction/global to v2.5.1
- Bump @memberjunction/queue to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:06 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.5.0
- Bump @memberjunction/ai to v2.5.0
- Bump @memberjunction/ai-vector-dupe to v2.5.0
- Bump @memberjunction/aiengine to v2.5.0
- Bump @memberjunction/core to v2.5.0
- Bump @memberjunction/core-entities to v2.5.0
- Bump @memberjunction/global to v2.5.0
- Bump @memberjunction/queue to v2.5.0

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Bump @memberjunction/actions to v2.4.1
- Bump @memberjunction/ai to v2.4.1
- Bump @memberjunction/ai-vector-dupe to v2.4.1
- Bump @memberjunction/aiengine to v2.4.1
- Bump @memberjunction/core to v2.4.1
- Bump @memberjunction/core-entities to v2.4.1
- Bump @memberjunction/global to v2.4.1
- Bump @memberjunction/queue to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.4.0
- Bump @memberjunction/ai to v2.4.0
- Bump @memberjunction/ai-vector-dupe to v2.4.0
- Bump @memberjunction/aiengine to v2.4.0
- Bump @memberjunction/core to v2.4.0
- Bump @memberjunction/core-entities to v2.4.0
- Bump @memberjunction/global to v2.4.0
- Bump @memberjunction/queue to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Bump @memberjunction/actions to v2.3.3
- Bump @memberjunction/ai to v2.3.3
- Bump @memberjunction/ai-vector-dupe to v2.3.3
- Bump @memberjunction/aiengine to v2.3.3
- Bump @memberjunction/core to v2.3.3
- Bump @memberjunction/core-entities to v2.3.3
- Bump @memberjunction/global to v2.3.3
- Bump @memberjunction/queue to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.3.2
- Bump @memberjunction/ai to v2.3.2
- Bump @memberjunction/ai-vector-dupe to v2.3.2
- Bump @memberjunction/aiengine to v2.3.2
- Bump @memberjunction/core to v2.3.2
- Bump @memberjunction/core-entities to v2.3.2
- Bump @memberjunction/global to v2.3.2
- Bump @memberjunction/queue to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.3.1
- Bump @memberjunction/ai to v2.3.1
- Bump @memberjunction/ai-vector-dupe to v2.3.1
- Bump @memberjunction/aiengine to v2.3.1
- Bump @memberjunction/core to v2.3.1
- Bump @memberjunction/core-entities to v2.3.1
- Bump @memberjunction/global to v2.3.1
- Bump @memberjunction/queue to v2.3.1

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Bump @memberjunction/actions to v2.3.0
- Bump @memberjunction/ai to v2.3.0
- Bump @memberjunction/ai-vector-dupe to v2.3.0
- Bump @memberjunction/aiengine to v2.3.0
- Bump @memberjunction/core to v2.2.2
- Bump @memberjunction/core-entities to v2.3.0
- Bump @memberjunction/global to v2.3.0
- Bump @memberjunction/queue to v2.3.0

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.2.1
- Bump @memberjunction/ai to v2.2.1
- Bump @memberjunction/ai-vector-dupe to v2.2.1
- Bump @memberjunction/aiengine to v2.2.1
- Bump @memberjunction/core to v2.2.1
- Bump @memberjunction/core-entities to v2.2.1
- Bump @memberjunction/global to v2.2.1
- Bump @memberjunction/queue to v2.2.1

## 2.2.0

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Bump @memberjunction/actions to v2.2.0
- Bump @memberjunction/ai to v2.2.0
- Bump @memberjunction/ai-vector-dupe to v2.2.0
- Bump @memberjunction/aiengine to v2.2.0
- Bump @memberjunction/core to v2.2.0
- Bump @memberjunction/core-entities to v2.1.6
- Bump @memberjunction/global to v2.2.0
- Bump @memberjunction/queue to v2.2.0

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/actions to v2.1.5
- Bump @memberjunction/ai to v2.1.5
- Bump @memberjunction/ai-vector-dupe to v2.1.5
- Bump @memberjunction/aiengine to v2.1.5
- Bump @memberjunction/core to v2.1.5
- Bump @memberjunction/core-entities to v2.1.5
- Bump @memberjunction/global to v2.1.5
- Bump @memberjunction/queue to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/actions to v2.1.4
- Bump @memberjunction/ai to v2.1.4
- Bump @memberjunction/ai-vector-dupe to v2.1.4
- Bump @memberjunction/aiengine to v2.1.4
- Bump @memberjunction/core to v2.1.4
- Bump @memberjunction/core-entities to v2.1.4
- Bump @memberjunction/global to v2.1.4
- Bump @memberjunction/queue to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Bump @memberjunction/actions to v2.1.3
- Bump @memberjunction/ai to v2.1.3
- Bump @memberjunction/ai-vector-dupe to v2.1.3
- Bump @memberjunction/aiengine to v2.1.3
- Bump @memberjunction/core to v2.1.3
- Bump @memberjunction/core-entities to v2.1.3
- Bump @memberjunction/global to v2.1.3
- Bump @memberjunction/queue to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Bump @memberjunction/actions to v2.1.2
- Bump @memberjunction/ai to v2.1.2
- Bump @memberjunction/ai-vector-dupe to v2.1.2
- Bump @memberjunction/aiengine to v2.1.2
- Bump @memberjunction/core to v2.1.2
- Bump @memberjunction/core-entities to v2.1.2
- Bump @memberjunction/global to v2.1.2
- Bump @memberjunction/queue to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/actions to v2.1.1
- Bump @memberjunction/ai to v2.1.1
- Bump @memberjunction/ai-vector-dupe to v2.1.1
- Bump @memberjunction/aiengine to v2.1.1
- Bump @memberjunction/core to v2.1.1
- Bump @memberjunction/core-entities to v2.1.1
- Bump @memberjunction/global to v2.1.1
- Bump @memberjunction/queue to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:28 GMT

### Patches

- Bump @memberjunction/actions to v1.8.1
- Bump @memberjunction/ai to v1.8.1
- Bump @memberjunction/ai-vector-dupe to v1.8.1
- Bump @memberjunction/aiengine to v1.8.1
- Bump @memberjunction/core to v1.8.1
- Bump @memberjunction/core-entities to v1.8.1
- Bump @memberjunction/global to v1.8.1
- Bump @memberjunction/queue to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Minor changes

- Bump @memberjunction/actions to v1.8.0
- Bump @memberjunction/ai to v1.8.0
- Bump @memberjunction/ai-vector-dupe to v1.8.0
- Bump @memberjunction/aiengine to v1.8.0
- Bump @memberjunction/core to v1.8.0
- Bump @memberjunction/core-entities to v1.8.0
- Bump @memberjunction/global to v1.8.0
- Bump @memberjunction/queue to v1.8.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.7.1

Wed, 12 Jun 2024 20:13:28 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v1.7.1
- Bump @memberjunction/ai to v1.7.1
- Bump @memberjunction/ai-vector-dupe to v1.7.1
- Bump @memberjunction/aiengine to v1.7.1
- Bump @memberjunction/core to v1.7.1
- Bump @memberjunction/core-entities to v1.7.1
- Bump @memberjunction/global to v1.7.1
- Bump @memberjunction/queue to v1.7.1

## 1.6.2

Wed, 12 Jun 2024 18:53:39 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v1.7.0
- Bump @memberjunction/ai to v1.7.0
- Bump @memberjunction/ai-vector-dupe to v1.7.0
- Bump @memberjunction/aiengine to v1.7.0
- Bump @memberjunction/core to v1.7.0
- Bump @memberjunction/core-entities to v1.7.0
- Bump @memberjunction/global to v1.7.0
- Bump @memberjunction/queue to v1.7.0

## 1.6.1

Tue, 11 Jun 2024 06:50:06 GMT

### Patches

- Bump @memberjunction/actions to v1.6.1
- Bump @memberjunction/ai to v1.6.1
- Bump @memberjunction/ai-vector-dupe to v1.6.1
- Bump @memberjunction/aiengine to v1.6.1
- Bump @memberjunction/core to v1.6.1
- Bump @memberjunction/core-entities to v1.6.1
- Bump @memberjunction/global to v1.6.1
- Bump @memberjunction/queue to v1.6.1

## 1.6.0

Tue, 11 Jun 2024 04:59:29 GMT

### Minor changes

- Bump @memberjunction/actions to v1.6.0
- Bump @memberjunction/ai to v1.6.0
- Bump @memberjunction/ai-vector-dupe to v1.6.0
- Bump @memberjunction/aiengine to v1.6.0
- Bump @memberjunction/core to v1.6.0
- Bump @memberjunction/core-entities to v1.6.0
- Bump @memberjunction/global to v1.6.0
- Bump @memberjunction/queue to v1.6.0

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v1.5.3
- Bump @memberjunction/ai to v1.5.3
- Bump @memberjunction/ai-vector-dupe to v1.5.3
- Bump @memberjunction/aiengine to v1.5.3
- Bump @memberjunction/core to v1.5.3
- Bump @memberjunction/core-entities to v1.5.3
- Bump @memberjunction/global to v1.5.3
- Bump @memberjunction/queue to v1.5.3

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Bump @memberjunction/ai to v1.5.2
- Bump @memberjunction/actions to v1.5.2
- Bump @memberjunction/aiengine to v1.5.2
- Bump @memberjunction/core to v1.5.2
- Bump @memberjunction/core-entities to v1.5.2
- Bump @memberjunction/global to v1.5.2
- Bump @memberjunction/queue to v1.5.2
- Bump @memberjunction/ai-vector-dupe to v1.5.2

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Bump @memberjunction/ai to v1.5.1
- Bump @memberjunction/actions to v1.5.1
- Bump @memberjunction/aiengine to v1.5.1
- Bump @memberjunction/core to v1.5.1
- Bump @memberjunction/core-entities to v1.5.1
- Bump @memberjunction/global to v1.5.1
- Bump @memberjunction/queue to v1.5.1
- Bump @memberjunction/ai-vector-dupe to v1.5.1

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.5.0
- Bump @memberjunction/actions to v1.5.0
- Bump @memberjunction/aiengine to v1.5.0
- Bump @memberjunction/core to v1.5.0
- Bump @memberjunction/core-entities to v1.5.0
- Bump @memberjunction/global to v1.5.0
- Bump @memberjunction/queue to v1.5.0
- Bump @memberjunction/ai-vector-dupe to v1.5.0

## 1.4.1

Fri, 07 Jun 2024 04:36:53 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.4.1
- Bump @memberjunction/actions to v1.4.1
- Bump @memberjunction/aiengine to v1.4.1
- Bump @memberjunction/core to v1.4.1
- Bump @memberjunction/core-entities to v1.4.1
- Bump @memberjunction/global to v1.4.1
- Bump @memberjunction/queue to v1.4.1
- Bump @memberjunction/ai-vector-dupe to v1.4.1

## 1.4.0

Sat, 25 May 2024 15:30:16 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.4.0
- Bump @memberjunction/aiengine to v1.4.0
- Bump @memberjunction/core to v1.4.0
- Bump @memberjunction/core-entities to v1.4.0
- Bump @memberjunction/global to v1.4.0
- Bump @memberjunction/queue to v1.4.0
- Bump @memberjunction/ai-vector-dupe to v1.4.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.3.3

Thu, 23 May 2024 18:35:52 GMT

### Patches

- Bump @memberjunction/ai to v1.3.3
- Bump @memberjunction/aiengine to v1.3.3
- Bump @memberjunction/core to v1.3.3
- Bump @memberjunction/core-entities to v1.3.3
- Bump @memberjunction/global to v1.3.3
- Bump @memberjunction/queue to v1.3.3
- Bump @memberjunction/ai-vector-dupe to v1.3.3

## 1.3.2

Thu, 23 May 2024 14:19:50 GMT

### Patches

- Bump @memberjunction/ai to v1.3.2
- Bump @memberjunction/aiengine to v1.3.2
- Bump @memberjunction/core to v1.3.2
- Bump @memberjunction/core-entities to v1.3.2
- Bump @memberjunction/global to v1.3.2
- Bump @memberjunction/queue to v1.3.2
- Bump @memberjunction/ai-vector-dupe to v1.3.2

## 1.3.1

Thu, 23 May 2024 02:29:25 GMT

### Patches

- Bump @memberjunction/ai to v1.3.1
- Bump @memberjunction/aiengine to v1.3.1
- Bump @memberjunction/core to v1.3.1
- Bump @memberjunction/core-entities to v1.3.1
- Bump @memberjunction/global to v1.3.1
- Bump @memberjunction/queue to v1.3.1
- Bump @memberjunction/ai-vector-dupe to v1.3.1

## 1.3.0

Wed, 22 May 2024 02:26:03 GMT

### Minor changes

- Overhaul the way we vectorize records (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.3.0
- Bump @memberjunction/aiengine to v1.3.0
- Bump @memberjunction/core to v1.3.0
- Bump @memberjunction/core-entities to v1.3.0
- Bump @memberjunction/global to v1.3.0
- Bump @memberjunction/queue to v1.3.0
- Bump @memberjunction/ai-vector-dupe to v1.3.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.2.2

Thu, 02 May 2024 19:46:38 GMT

### Patches

- Bump @memberjunction/ai to v1.2.2
- Bump @memberjunction/aiengine to v1.2.2
- Bump @memberjunction/core to v1.2.2
- Bump @memberjunction/core-entities to v1.2.2
- Bump @memberjunction/global to v1.2.2
- Bump @memberjunction/queue to v1.2.2
- Bump @memberjunction/ai-vector-dupe to v1.2.2

## 1.2.1

Thu, 02 May 2024 16:46:11 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.2.1
- Bump @memberjunction/aiengine to v1.2.1
- Bump @memberjunction/core to v1.2.1
- Bump @memberjunction/core-entities to v1.2.1
- Bump @memberjunction/global to v1.2.1
- Bump @memberjunction/queue to v1.2.1
- Bump @memberjunction/ai-vector-dupe to v1.2.1

## 1.2.0

Mon, 29 Apr 2024 18:51:58 GMT

### Minor changes

- Bump @memberjunction/ai to v1.2.0
- Bump @memberjunction/aiengine to v1.2.0
- Bump @memberjunction/core to v1.2.0
- Bump @memberjunction/core-entities to v1.2.0
- Bump @memberjunction/global to v1.2.0
- Bump @memberjunction/queue to v1.2.0
- Bump @memberjunction/ai-vector-dupe to v1.2.0

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Bump @memberjunction/ai to v1.1.3
- Bump @memberjunction/aiengine to v1.1.3
- Bump @memberjunction/core to v1.1.3
- Bump @memberjunction/core-entities to v1.1.3
- Bump @memberjunction/global to v1.1.3
- Bump @memberjunction/queue to v1.1.3
- Bump @memberjunction/ai-vector-dupe to v1.1.3

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Bump @memberjunction/ai to v1.1.2
- Bump @memberjunction/aiengine to v1.1.2
- Bump @memberjunction/core to v1.1.2
- Bump @memberjunction/core-entities to v1.1.2
- Bump @memberjunction/global to v1.1.2
- Bump @memberjunction/queue to v1.1.2
- Bump @memberjunction/ai-vector-dupe to v1.1.2

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Bump @memberjunction/ai to v1.1.1
- Bump @memberjunction/aiengine to v1.1.1
- Bump @memberjunction/core to v1.1.1
- Bump @memberjunction/core-entities to v1.1.1
- Bump @memberjunction/global to v1.1.1
- Bump @memberjunction/queue to v1.1.1
- Bump @memberjunction/ai-vector-dupe to v1.1.1

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Bump @memberjunction/ai to v1.1.0
- Bump @memberjunction/aiengine to v1.1.0
- Bump @memberjunction/core to v1.1.0
- Bump @memberjunction/core-entities to v1.1.0
- Bump @memberjunction/global to v1.1.0
- Bump @memberjunction/queue to v1.1.0
- Bump @memberjunction/ai-vector-dupe to v1.1.0

## 1.0.11

Wed, 24 Apr 2024 20:57:42 GMT

### Patches

- - bug fixes in Skip UI \* added exception handling to ReportResolver (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.0.11
- Bump @memberjunction/aiengine to v1.0.11
- Bump @memberjunction/core to v1.0.11
- Bump @memberjunction/core-entities to v1.0.11
- Bump @memberjunction/global to v1.0.11
- Bump @memberjunction/queue to v1.0.11
- Bump @memberjunction/ai-vector-dupe to v1.0.11

## 1.0.9

Sun, 14 Apr 2024 15:50:05 GMT

### Patches

- Bump @memberjunction/ai to v1.0.9
- Bump @memberjunction/aiengine to v1.0.9
- Bump @memberjunction/core to v1.0.9
- Bump @memberjunction/core-entities to v1.0.9
- Bump @memberjunction/global to v1.0.9
- Bump @memberjunction/queue to v1.0.9
- Bump @memberjunction/ai-vector-dupe to v1.0.9

## 1.0.8

Sat, 13 Apr 2024 02:32:44 GMT

### Patches

- Update build and publish automation (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.0.8
- Bump @memberjunction/aiengine to v1.0.8
- Bump @memberjunction/core to v1.0.8
- Bump @memberjunction/core-entities to v1.0.8
- Bump @memberjunction/global to v1.0.8
- Bump @memberjunction/queue to v1.0.8
- Bump @memberjunction/ai-vector-dupe to v1.0.8

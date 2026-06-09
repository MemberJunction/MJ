# @memberjunction/generic-database-provider

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/aiengine@5.40.1
  - @memberjunction/ai-vectors-memory@5.40.1
  - @memberjunction/actions-base@5.40.1
  - @memberjunction/actions@5.40.1
  - @memberjunction/encryption@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/queue@5.40.1
  - @memberjunction/query-processor@5.40.1
  - @memberjunction/geo-core@5.40.1
  - @memberjunction/global@5.40.1
  - @memberjunction/sql-dialect@5.40.1
  - @memberjunction/sql-parser@5.40.1

## 5.40.0

### Minor Changes

- 43e6c0f: MJ-issued magic-link sessions for external, app-scoped users: passwordless, single-use (or multi-use) invite links that sign external users into MJExplorer confined to one application and a per-link role. MJ issues and validates its own RS256 session tokens (published via JWKS, accepted by the standard auth-provider path), so there's no external IdP dependency or per-user IdP cost. Invite scope (app, role, expiry, max uses) is configured per link, with support for per-invite app/role, resource-scoped RLS sharing, and anonymous sessions — a shared Anonymous principal whose scope rides per-session JWT claims rather than DB roles, so concurrent anonymous visitors can't accrete privileges.

  Also includes two framework changes made along the way:
  - **RunView server-cache RLS fix:** the cache fingerprint now incorporates the per-user Row-Level-Security where-clause, so an RLS-scoped read can no longer be served an unscoped cached result. No-op for users without an RLS filter (byte-identical fingerprint), so normal caching is untouched.
  - **BaseEngine degrades gracefully under restricted roles:** a config load that fails because the current user lacks Read permission is now treated as a permanent condition — the property loads empty and the engine is marked loaded — instead of looping on "not marking as loaded", which previously hung the MJExplorer shell for least-privilege users (e.g. magic-link guests). Only genuinely transient failures (network, server restart) keep retrying.

### Patch Changes

- 804f9f6: Security audit fixes: parameterize SQL queries in GraphQL resolvers to prevent injection, validate entity read permissions on query execution, centralize permission logic in UserCanRun with recursive dependency checks, and fix UUID/multi-provider compliance violations.
- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/aiengine@5.40.0
  - @memberjunction/ai-vectors-memory@5.40.0
  - @memberjunction/actions-base@5.40.0
  - @memberjunction/actions@5.40.0
  - @memberjunction/encryption@5.40.0
  - @memberjunction/queue@5.40.0
  - @memberjunction/query-processor@5.40.0
  - @memberjunction/geo-core@5.40.0
  - @memberjunction/global@5.40.0
  - @memberjunction/sql-dialect@5.40.0
  - @memberjunction/sql-parser@5.40.0

## 5.39.0

### Patch Changes

- eaee99f: fix: re-throw connection errors from RunView/RunQuery instead of swallowing into Success=false

  Preserve mssql ConnectionError type through executeSQLCore so GenericDatabaseProvider can structurally detect infrastructure failures (DB unreachable, pool closed) and re-throw them from InternalRunView and InternalRunQuery. Previously these were silently converted to { Success: false }, making it impossible for callers to distinguish "database is down" from "query returned no results."

- 2d1b4e1: Use `UUIDsEqual()` instead of `===` for the AIModel ID comparison in `searchEntitiesSemanticPass`, fixing the repo-wide UUID-comparison compliance check.
- Updated dependencies [26761b8]
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
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
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/aiengine@5.39.0
  - @memberjunction/ai-vectors-memory@5.39.0
  - @memberjunction/actions-base@5.39.0
  - @memberjunction/encryption@5.39.0
  - @memberjunction/queue@5.39.0
  - @memberjunction/query-processor@5.39.0
  - @memberjunction/geo-core@5.39.0
  - @memberjunction/sql-dialect@5.39.0
  - @memberjunction/sql-parser@5.39.0

## 5.38.0

### Patch Changes

- 6a3ac36: Fix AllowUpdateAPI clearing when EntityField transitions to virtual, use subqueries for organic key INSERTs for portable SQL, prevent permanent engine failure when MJAPI is temporarily unavailable, and centralize RLS exemption check in GetUserRowLevelSecurityWhereClause
- 3d739a3: refactor(sql-parser): instance-based parser with dialect adapters, parse-preprocessing, instance-based count SQL, and a render-pipeline write-statement guard
  - **`SQLParser` is now instance-based** (`new SQLParser(sql, dialect)`). AST inspection/mutation (`IsValid`, `StatementKind`, `HasWriteStatement`, `OuterCap`, `SetOuterCap`, `ClearOuterCap`, `ClearOrderBy`, `ToSQL`) and extraction (`ExtractCTEs`, `ExtractTableRefs`, `ExtractColumnRefs`, `ExtractSelectColumns`) are instance members; pure string/token utilities (`ParseSQL`, `SqlifyAST`, `StripComments`, `Tokenize`, `Analyze`, `HasUnwrappableTrailingClause`, `HasStackedStatements`, the MJ-template helpers, …) remain static.
  - **Dialect-neutral row caps via an internal `ASTDialectAdapter`** (keyed by `ParserDialect`). The exported `SQLOuterCap` (with its `kind: 'top' | 'limit'`) is replaced by `RowCapInfo` with an explicit `form: 'numeric' | 'percent' | 'opaque'` discriminant. The `isSQLServerDialect()` quote-probe and the `dialect.PlatformKey === 'sqlserver'` branch in the row-cap path are gone (`outerWrap` now uses `dialect.LimitClause()`).
  - **Parse-preprocessing fallback** in the constructor: on a direct-parse failure it aliases bracket-quoted identifiers with parser-defeating characters (`[Active People]`, `[my-cte]`) and splits a trailing `OPTION (...)` clause, then restores both on `ToSQL`. This lets Skip-style CTE queries and `OPTION` queries reach the precise AST row-cap path (`TOP N` / `LIMIT N`) instead of the OFFSET/FETCH or outer-wrap fallback.
  - **Instance-based count SQL**: `QueryPagingEngine`'s count builder is unified onto the instance API (`ExtractCTEs` + `ClearOuterCap` + `ClearOrderBy` + `ToSQL`), removing the last `as unknown as Record<string, unknown>` cast and raw AST field pokes from the engine. The count now strips the outer cap on **both** dialects, so a paged query's `COUNT(*)` reflects the full set — fixing a PostgreSQL inconsistency where an explicit `LIMIT` previously yielded a capped count (SQL Server already stripped `TOP`).
  - **Render-pipeline safety guard** (`RenderPipeline.Run`): a rendered query must be a single read statement, enforced by two complementary checks. (1) `SQLParser.HasWriteStatement` (AST) rejects a write _type_ anywhere — DML (INSERT/UPDATE/DELETE/MERGE/REPLACE), DDL (DROP/CREATE/ALTER/TRUNCATE/RENAME), or EXEC/CALL/GRANT/REVOKE/USE — catching single writes and parseable stacked writes (`SELECT 1; DROP TABLE x`). (2) `SQLParser.HasStackedStatements` (token scan) rejects any internal statement-separating `;`, catching stacked payloads that don't parse (`SELECT 1; EXEC xp_cmdshell '…'`, `SELECT 1; WAITFOR DELAY '…'`) — the class an AST scan misses because the whole string fails to parse. Both are precise: the `REPLACE()` string function and parenthesized SELECTs pass, and a single trailing `;` is fine; only genuine multi-statement inputs (including `SET` / `DECLARE` prefixes) are rejected. (The broad dangerous-keyword scan stays on the ad-hoc execution path, where input is untrusted free text.)
  - **`SQLExpressionValidator`**: `FOR` is now allowed in `full_query` context so `FOR JSON` / `FOR XML` queries aren't wrongly rejected (`FOR UPDATE` remains blocked via the independent `UPDATE` keyword).

  No behavior change for already-valid read queries; preprocessing only widens AST coverage, the count fix only affects paged queries that carried an explicit cap, and the guard only rejects writes/stacked statements. All consumers (`queryPagingEngine`, `queryCompositionEngine`, `query-extraction`, `manage-metadata`, `structuralParser`) migrated to the instance API.

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
  - @memberjunction/sql-dialect@5.38.0
  - @memberjunction/sql-parser@5.38.0
  - @memberjunction/query-processor@5.38.0
  - @memberjunction/queue@5.38.0
  - @memberjunction/actions-base@5.38.0
  - @memberjunction/actions@5.38.0
  - @memberjunction/encryption@5.38.0
  - @memberjunction/geo-core@5.38.0

## 5.37.0

### Patch Changes

- f5531e0: Refactor the SQL render pipeline's row-cap path to be AST-based. Add `SQLParser.StripComments`, a token-aware comment stripper that preserves string literals and quoted identifiers (including SQL Server brackets) and handles nested block comments. Replace the regex-based `applyMaxRows` in `RenderPipeline` with `QueryPagingEngine.WrapWithMaxRows`, which injects `TOP`/`LIMIT` via the AST and falls back to OFFSET/FETCH for parser-unsupported CTE shapes. Throw on `MaxRows + Paging` conflicts instead of silently overriding. Route `AdhocQueryResolver` through `RenderPipeline.Run` so composition macros, templates, and row capping run consistently with saved queries.
- Updated dependencies [1af94d0]
- Updated dependencies [4f15f31]
- Updated dependencies [f5531e0]
  - @memberjunction/actions@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/sql-parser@5.37.0
  - @memberjunction/aiengine@5.37.0
  - @memberjunction/actions-base@5.37.0
  - @memberjunction/encryption@5.37.0
  - @memberjunction/queue@5.37.0
  - @memberjunction/query-processor@5.37.0
  - @memberjunction/geo-core@5.37.0
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
  - @memberjunction/actions-base@5.36.0
  - @memberjunction/actions@5.36.0
  - @memberjunction/encryption@5.36.0
  - @memberjunction/queue@5.36.0
  - @memberjunction/geo-core@5.36.0
  - @memberjunction/query-processor@5.36.0
  - @memberjunction/global@5.36.0
  - @memberjunction/sql-dialect@5.36.0
  - @memberjunction/sql-parser@5.36.0

## 5.35.0

### Patch Changes

- 6f083dd: Rewrite `RenderPipeline.applyMaxRows` to inject the row cap (`TOP N` for SQL Server, `LIMIT N` for PostgreSQL) via an AST rewrite instead of a string-anchored regex. CTE queries (`WITH … SELECT …`) and queries whose CTE definitions contain their own `TOP N` now correctly receive the outer cap on the outermost SELECT. Queries that already specify an outermost `TOP` / `LIMIT` are left untouched, and shapes the parser can't represent at the top level (UNION/INTERSECT/EXCEPT, vendor-specific syntax, sqlify round-trip failures) fall back to a `SELECT TOP N * FROM (<original>) AS _capped` wrap.
- aedd4dc: Bubble save SQL composition up to GenericDatabaseProvider as a single orchestrator; SQL Server and Postgres providers now contribute four dialect hooks instead of duplicating the generator. Fixes a PG UPDATE bug where PK wasn't tail appended
- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [7332992]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/geo-core@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/aiengine@5.35.0
  - @memberjunction/actions-base@5.35.0
  - @memberjunction/actions@5.35.0
  - @memberjunction/encryption@5.35.0
  - @memberjunction/queue@5.35.0
  - @memberjunction/query-processor@5.35.0
  - @memberjunction/sql-dialect@5.35.0
  - @memberjunction/sql-parser@5.35.0

## 5.34.1

### Patch Changes

- 3a35358: Surface engine load health in System Diagnostics with per-property success/failure status and error messages, add recovery telemetry to ApplicationManager, cache architecture fixes including schema hash staleness detection, empty result timestamp handling, and timestamp precision tolerance
- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/aiengine@5.34.1
  - @memberjunction/actions-base@5.34.1
  - @memberjunction/actions@5.34.1
  - @memberjunction/encryption@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/queue@5.34.1
  - @memberjunction/query-processor@5.34.1
  - @memberjunction/geo-core@5.34.1
  - @memberjunction/global@5.34.1
  - @memberjunction/sql-dialect@5.34.1
  - @memberjunction/sql-parser@5.34.1

## 5.34.0

### Minor Changes

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
  - @memberjunction/aiengine@5.34.0
  - @memberjunction/actions-base@5.34.0
  - @memberjunction/actions@5.34.0
  - @memberjunction/encryption@5.34.0
  - @memberjunction/query-processor@5.34.0
  - @memberjunction/sql-dialect@5.34.0
  - @memberjunction/sql-parser@5.34.0
  - @memberjunction/geo-core@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/queue@5.34.0

## 5.33.0

### Minor Changes

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

- b0329f6: PG: JSON-arg CRUD sprocs for wide entities + Bug 5 four-pass fix + codegen lookup fixes (#2552)

### Patch Changes

- 74b0be0: Tolerate non-ISO `maxUpdatedAt` values in the smart cache check so a malformed timestamp degrades to a cache miss instead of throwing `Invalid time value`. Also expand the MJAPI GraphQL operation log so nested variables render as truncated JSON instead of Node's `[Object]` placeholders.
- f94ebd6: Fix silent NVARCHAR(4000) truncation in `_escapeFlywaySyntaxInStrings` that corrupted component Specifications with many `${…}` template-literal expressions on Flyway apply. Interleave `CAST(N'' AS NVARCHAR(MAX))` between every split so the concat chain inherits NVARCHAR(MAX) precedence and the full literal value survives.
- 7add405: Lift Flyway placeholder escaping from `SqlLogger` into the `SQLDialect` abstraction. Each dialect now declares its own `EscapeFlywayStringInterpolation` form (SQL Server interleaves a `CAST(N'' AS NVARCHAR(MAX))` to defeat the NVARCHAR(4000) concat cap; PostgreSQL uses a plain `||` split since TEXT has no length cap), so the shared `SqlLoggingSessionImpl` can be used safely across providers without hard-coding T-SQL syntax.
- fad046c: Repair createViewUserSearchSQL.test.ts so its assertions actually run. The test factory was setting EntityInfo's getter-only properties (FirstPrimaryKey, Fields) via Object.assign, which threw TypeError before any assertion executed. Switched to seeding the private \_Fields backing store with a synthetic primary-key field so both getters resolve naturally, and corrected each assertion's parenthesization to match the SUT's actual (defensive, pre-existing) per-field paren wrap.
- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [312fcee]
- Updated dependencies [7e4957d]
- Updated dependencies [7add405]
  - @memberjunction/core@5.33.0
  - @memberjunction/sql-dialect@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/aiengine@5.33.0
  - @memberjunction/actions-base@5.33.0
  - @memberjunction/actions@5.33.0
  - @memberjunction/encryption@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/queue@5.33.0
  - @memberjunction/query-processor@5.33.0
  - @memberjunction/geo-core@5.33.0
  - @memberjunction/sql-parser@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/geo-core@5.32.0
  - @memberjunction/aiengine@5.32.0
  - @memberjunction/actions-base@5.32.0
  - @memberjunction/actions@5.32.0
  - @memberjunction/encryption@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/queue@5.32.0
  - @memberjunction/query-processor@5.32.0
  - @memberjunction/global@5.32.0
  - @memberjunction/sql-dialect@5.32.0
  - @memberjunction/sql-parser@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
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
  - @memberjunction/aiengine@5.31.0
  - @memberjunction/actions-base@5.31.0
  - @memberjunction/actions@5.31.0
  - @memberjunction/encryption@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/queue@5.31.0
  - @memberjunction/query-processor@5.31.0
  - @memberjunction/sql-dialect@5.31.0
  - @memberjunction/sql-parser@5.31.0
  - @memberjunction/geo-core@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/aiengine@5.30.1
- @memberjunction/actions-base@5.30.1
- @memberjunction/actions@5.30.1
- @memberjunction/encryption@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/queue@5.30.1
- @memberjunction/query-processor@5.30.1
- @memberjunction/sql-dialect@5.30.1
- @memberjunction/sql-parser@5.30.1
- @memberjunction/geo-core@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
- Updated dependencies [216ddc3]
  - @memberjunction/aiengine@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/actions-base@5.30.0
  - @memberjunction/actions@5.30.0
  - @memberjunction/encryption@5.30.0
  - @memberjunction/queue@5.30.0
  - @memberjunction/geo-core@5.30.0
  - @memberjunction/query-processor@5.30.0
  - @memberjunction/global@5.30.0
  - @memberjunction/sql-dialect@5.30.0
  - @memberjunction/sql-parser@5.30.0

## 5.29.0

### Patch Changes

- e02e24e: Query rendering pipeline redesign: fix Bug D (Nunjucks expression inside SQL string literal breaks ORDER BY detection), consolidate duplicated ORDER BY logic into shared analyzer, add RenderPipeline entry point with diagnostic tracing, introduce structural parser and symbol table for composition IR, and integrate SQL dialect objects throughout the parser removing all hardcoded dialect switch statements. SQL comments are now stripped before template evaluation instead of escaped. Production callers (RunQuery, TestQuerySQL) delegate to RenderPipeline. 65+ new tests including recursive CTEs, PostgreSQL dialect variants, and comment-stripping coverage.

  Query dashboard and form UI improvements: replace flat category dropdowns with hierarchical tree dropdowns, default new query category to active folder context, add per-folder create buttons, expose Reusable/CacheEnabled/AuditQueryRuns fields in entity form Details panel, add saving indicator with spinner overlay, fix sub-entity delete by reloading fresh entity copies, and fix tree dropdown not showing pre-selected text for branch-only configurations. Fix extraction pipeline not cleaning up stale Query Fields and Query Entities when extraction produces no results, with 9 regression tests.

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/sql-dialect@5.29.0
  - @memberjunction/sql-parser@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/aiengine@5.29.0
  - @memberjunction/actions-base@5.29.0
  - @memberjunction/actions@5.29.0
  - @memberjunction/encryption@5.29.0
  - @memberjunction/queue@5.29.0
  - @memberjunction/query-processor@5.29.0
  - @memberjunction/geo-core@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/actions@5.28.0
  - @memberjunction/aiengine@5.28.0
  - @memberjunction/actions-base@5.28.0
  - @memberjunction/encryption@5.28.0
  - @memberjunction/queue@5.28.0
  - @memberjunction/query-processor@5.28.0
  - @memberjunction/geo-core@5.28.0
  - @memberjunction/global@5.28.0
  - @memberjunction/sql-dialect@5.28.0
  - @memberjunction/sql-parser@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/aiengine@5.27.1
  - @memberjunction/actions-base@5.27.1
  - @memberjunction/actions@5.27.1
  - @memberjunction/encryption@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/queue@5.27.1
  - @memberjunction/query-processor@5.27.1
  - @memberjunction/geo-core@5.27.1
  - @memberjunction/sql-dialect@5.27.1
  - @memberjunction/sql-parser@5.27.1

## 5.27.0

### Patch Changes

- 4357090: Repair three query composition pipeline regressions surfaced by Skip-Brain, clear test feedback dialog state when switching conversations, strip tag IDs from taxonomy context injected into LLM prompts, exclude in-progress runs from last-run-date lookups, and replace direct UUID equality checks with `UUIDsEqual()` in the AI analytics dashboards to comply with the cross-platform UUID compliance test.
- Updated dependencies [4357090]
  - @memberjunction/sql-parser@5.27.0
  - @memberjunction/aiengine@5.27.0
  - @memberjunction/actions-base@5.27.0
  - @memberjunction/actions@5.27.0
  - @memberjunction/encryption@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/core-entities@5.27.0
  - @memberjunction/global@5.27.0
  - @memberjunction/queue@5.27.0
  - @memberjunction/query-processor@5.27.0
  - @memberjunction/sql-dialect@5.27.0
  - @memberjunction/geo-core@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/aiengine@5.26.0
  - @memberjunction/actions-base@5.26.0
  - @memberjunction/actions@5.26.0
  - @memberjunction/encryption@5.26.0
  - @memberjunction/queue@5.26.0
  - @memberjunction/geo-core@5.26.0
  - @memberjunction/query-processor@5.26.0
  - @memberjunction/global@5.26.0
  - @memberjunction/sql-dialect@5.26.0
  - @memberjunction/sql-parser@5.26.0

## 5.25.0

### Patch Changes

- fc8cd52: Autotagging pipeline with run tracking, retry, and tag merge/delete; taxonomy server-side SQL aggregates; vector sync credential engine integration; search resolver and organic key support; unit test fixes across geo-core, ai-vector-sync, MJServer, and UUID compliance.
- Updated dependencies [fc8cd52]
- Updated dependencies [4f8e980]
- Updated dependencies [d6370e8]
- Updated dependencies [008a62d]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/geo-core@5.25.0
  - @memberjunction/sql-parser@5.25.0
  - @memberjunction/actions@5.25.0
  - @memberjunction/aiengine@5.25.0
  - @memberjunction/actions-base@5.25.0
  - @memberjunction/encryption@5.25.0
  - @memberjunction/queue@5.25.0
  - @memberjunction/query-processor@5.25.0
  - @memberjunction/global@5.25.0
  - @memberjunction/sql-dialect@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/aiengine@5.24.0
  - @memberjunction/actions@5.24.0
  - @memberjunction/actions-base@5.24.0
  - @memberjunction/encryption@5.24.0
  - @memberjunction/queue@5.24.0
  - @memberjunction/query-processor@5.24.0
  - @memberjunction/global@5.24.0
  - @memberjunction/sql-dialect@5.24.0
  - @memberjunction/sql-parser@5.24.0

## 5.23.0

### Patch Changes

- 247df16: Fix server-side RunView cache write asymmetry that caused repeated DB queries during metadata sync, add deterministic Nunjucks template parameter extraction via AST, support comma-delimited multi-value fields in validation, and redesign QueryPagingEngine to append paging directly instead of wrapping in CTEs (fixing ORDER BY on non-projected columns and apostrophe-in-comments bugs).
- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/aiengine@5.23.0
  - @memberjunction/actions-base@5.23.0
  - @memberjunction/actions@5.23.0
  - @memberjunction/encryption@5.23.0
  - @memberjunction/queue@5.23.0
  - @memberjunction/query-processor@5.23.0
  - @memberjunction/sql-dialect@5.23.0
  - @memberjunction/sql-parser@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/sql-parser@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/aiengine@5.22.0
  - @memberjunction/actions@5.22.0
  - @memberjunction/actions-base@5.22.0
  - @memberjunction/encryption@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/queue@5.22.0
  - @memberjunction/query-processor@5.22.0
  - @memberjunction/sql-dialect@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
- Updated dependencies [72fc93b]
  - @memberjunction/core@5.21.0
  - @memberjunction/query-processor@5.21.0
  - @memberjunction/aiengine@5.21.0
  - @memberjunction/actions-base@5.21.0
  - @memberjunction/actions@5.21.0
  - @memberjunction/encryption@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/queue@5.21.0
  - @memberjunction/global@5.21.0
  - @memberjunction/sql-dialect@5.21.0
  - @memberjunction/sql-parser@5.21.0

## 5.20.0

### Patch Changes

- cc954e1: fix: prevent NVARCHAR truncation when escaping Flyway placeholders in long string literals
- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/aiengine@5.20.0
  - @memberjunction/actions-base@5.20.0
  - @memberjunction/actions@5.20.0
  - @memberjunction/encryption@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/queue@5.20.0
  - @memberjunction/query-processor@5.20.0
  - @memberjunction/global@5.20.0
  - @memberjunction/sql-dialect@5.20.0
  - @memberjunction/sql-parser@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/aiengine@5.19.0
- @memberjunction/actions-base@5.19.0
- @memberjunction/actions@5.19.0
- @memberjunction/encryption@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/queue@5.19.0
- @memberjunction/query-processor@5.19.0
- @memberjunction/sql-dialect@5.19.0
- @memberjunction/sql-parser@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [931740a]
  - @memberjunction/sql-parser@5.18.0
  - @memberjunction/aiengine@5.18.0
  - @memberjunction/actions@5.18.0
  - @memberjunction/queue@5.18.0
  - @memberjunction/actions-base@5.18.0
  - @memberjunction/encryption@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0
  - @memberjunction/query-processor@5.18.0
  - @memberjunction/sql-dialect@5.18.0

## 5.17.0

### Patch Changes

- 4b6fd2a: Add composable query passthrough parameter bubbling, deterministic field type resolution from dependency queries and entity metadata, MJLexer-based template variable manipulation, and refactor MJQueryEntityServer into a 5-stage extraction pipeline
- Updated dependencies [4b6fd2a]
- Updated dependencies [9881045]
  - @memberjunction/sql-parser@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/aiengine@5.17.0
  - @memberjunction/actions-base@5.17.0
  - @memberjunction/actions@5.17.0
  - @memberjunction/encryption@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/queue@5.17.0
  - @memberjunction/query-processor@5.17.0
  - @memberjunction/global@5.17.0
  - @memberjunction/sql-dialect@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/aiengine@5.16.0
  - @memberjunction/actions-base@5.16.0
  - @memberjunction/actions@5.16.0
  - @memberjunction/encryption@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/queue@5.16.0
  - @memberjunction/query-processor@5.16.0
  - @memberjunction/global@5.16.0
  - @memberjunction/sql-dialect@5.16.0
  - @memberjunction/sql-parser@5.16.0

## 5.15.0

### Patch Changes

- 5e85b29: Fix nested WITH syntax error by hoisting inner CTEs from dependency queries, and disable External Change Detection scheduled job to prevent OOM crash-restart cycles
- d01f697: MJ SQL Parser: unified parser for SQL + Nunjucks templates + composition tokens. Replaces fragmented regex-based SQL parsing across 6 packages with a single MJSQLParser class providing AST-based tokenization, placeholder substitution, CTE extraction, ORDER BY remapping, and deterministic parameter/field extraction. Moves QueryPagingEngine from MJCore to GenericDatabaseProvider with AST-based paging. Fixes backtick quoting, table-qualified ORDER BY remapping, trailing semicolon, and FOR XML parsing bugs.
- Updated dependencies [662d56b]
- Updated dependencies [5e85b29]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/sql-parser@5.15.0
  - @memberjunction/aiengine@5.15.0
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

- 69b5af4: Add TestQuerySQL resolver and client method for query execution testing, refactor CreateQueryResolver into QuerySystemUserResolver composing CodeGen-generated MJQuery\_ types, add lightweight query catalog for collision detection, unit tests for transitive template composition and ORDER BY stripping, and updated class registration manifests
- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/query-processor@5.14.0
  - @memberjunction/actions-base@5.14.0
  - @memberjunction/actions@5.14.0
  - @memberjunction/aiengine@5.14.0
  - @memberjunction/encryption@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/queue@5.14.0
  - @memberjunction/global@5.14.0
  - @memberjunction/sql-dialect@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/aiengine@5.13.0
  - @memberjunction/actions-base@5.13.0
  - @memberjunction/actions@5.13.0
  - @memberjunction/encryption@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/queue@5.13.0
  - @memberjunction/query-processor@5.13.0

## 5.12.0

### Minor Changes

- 05f19ff: Add composable query system with semantic catalog search, CTE composition engine, server-side paging, query caching with TTL/dependency invalidation, and agent directive surfacing. Includes QueryCacheManager wrapper over LocalCacheManager, QueryPagingEngine for SQL-level OFFSET/FETCH paging, QueryCompositionEngine for platform-aware CTE generation, and SearchQueryCatalog action for vector-based query discovery. Renames PaginationComponent to DataPagerComponent and extracts into shared module.

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/aiengine@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/actions-base@5.12.0
  - @memberjunction/actions@5.12.0
  - @memberjunction/encryption@5.12.0
  - @memberjunction/queue@5.12.0
  - @memberjunction/query-processor@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Minor Changes

- a4c3c81: migration/metadata

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/query-processor@5.11.0
  - @memberjunction/aiengine@5.11.0
  - @memberjunction/actions-base@5.11.0
  - @memberjunction/actions@5.11.0
  - @memberjunction/encryption@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/queue@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/aiengine@5.10.1
- @memberjunction/actions-base@5.10.1
- @memberjunction/actions@5.10.1
- @memberjunction/encryption@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/queue@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/aiengine@5.10.0
  - @memberjunction/actions-base@5.10.0
  - @memberjunction/actions@5.10.0
  - @memberjunction/encryption@5.10.0
  - @memberjunction/queue@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Minor Changes

- 194ddf2: Add Redis-backed ILocalStorageProvider with cross-server cache invalidation via pub/sub

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/aiengine@5.9.0
  - @memberjunction/actions-base@5.9.0
  - @memberjunction/actions@5.9.0
  - @memberjunction/encryption@5.9.0
  - @memberjunction/queue@5.9.0

## 5.8.0

### Patch Changes

- 064cf3a: Make API key generation configurable via mj.config.cjs, fix codegen TVF sync and EntityRelationship deduplication, fix SQL logger post-processing, preserve version range prefixes in CLI bump command, and fix SkipProxyAgent crash on error responses
- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/aiengine@5.8.0
  - @memberjunction/actions-base@5.8.0
  - @memberjunction/actions@5.8.0
  - @memberjunction/encryption@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/queue@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/aiengine@5.7.0
  - @memberjunction/actions@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/queue@5.7.0
  - @memberjunction/actions-base@5.7.0
  - @memberjunction/encryption@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/aiengine@5.6.0
  - @memberjunction/actions-base@5.6.0
  - @memberjunction/actions@5.6.0
  - @memberjunction/encryption@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/queue@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/aiengine@5.5.0
  - @memberjunction/actions-base@5.5.0
  - @memberjunction/actions@5.5.0
  - @memberjunction/encryption@5.5.0
  - @memberjunction/queue@5.5.0

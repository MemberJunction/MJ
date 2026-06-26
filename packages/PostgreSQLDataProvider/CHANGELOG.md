# @memberjunction/postgresql-dataprovider

## 5.43.0

### Patch Changes

- fe89e68: Post-merge follow-up to PR #2854 (`refactor(codegen-lib): multi-provider SetupDataSource + PostgreSQL pool symmetry`), addressing review feedback. Bug-fix scope only — no migration, no schema changes — so this is patch under the same convention PR #2854 followed.

  **Behavior fixes (silent regressions introduced by PR #2854):**
  - **PG\_\* env-var precedence regressed when `dbPlatform` was set only in `mj.config.cjs`.** `_resolveConnEnv()` keyed its PG** check on `_IS_PG_DEFAULT`, which derives from `process.env.DB_PLATFORM` alone. A user who set `dbPlatform: 'postgresql'` in their `mj.config.cjs` (no `DB_PLATFORM` env var) and supplied the host via `PG_HOST` would silently connect to `localhost`. New helper `applyPlatformDependentEnvVars()` runs *after\* `mergeConfigs(DEFAULT_CODEGEN_CONFIG, userConfig)` to re-apply PG*\* precedence to any field the user didn't explicitly set in `mj.config.cjs`, restoring the pre-refactor behavior (`process.env.PG_HOST ?? configInfo.dbHost`). Wired into both the module-load merge and `initializeConfig()`.
  - **SSL silently flipped on in `NODE_ENV=production`.** PR #2854's `buildPgConfig()` didn't set `SSL`, so `PGConnectionManager.Initialize()`'s `ssl: config.SSL ?? (process.env.NODE_ENV === 'production')` default kicked in — flipping codegen against non-SSL/locally-bridged PostgreSQL from off (the pre-refactor inline `pg.Pool` behavior) to on under any production shell. `buildPgConfig()` now passes `SSL: false` by default and exposes a new optional `codegenPool.ssl` knob (boolean or pg-ssl object) for callers that genuinely need SSL.
  - **`statement_timeout` GUC missed the verify-SELECT-1 connection.** The runtime `connect` listener was attached _after_ `PGConnectionManager.Initialize()` had already opened, used, and released the first physical connection for its `SELECT 1` health check. That first warm client gets reused later without the GUC. The fix carries the timeout via the libpq `-c statement_timeout=<ms>` startup option (new optional `PGConnectionConfig.Options` field, threaded into the `pg.Pool` config), so every backend honors it from query #1 — including the verify connection. The runtime listener is removed entirely; the connect-string path is both correct and simpler.

  **Warning hygiene:**
  - The PG*\*/DB*\* precedence `console.warn` is now de-duplicated across the
    module-load merge, the post-merge `applyPlatformDependentEnvVars` pass,
    and any subsequent `initializeConfig()` calls. Without de-dup, a single
    env-var divergence would emit 2–3 identical warnings; now it emits once
    per `<pgEnv>:<ssEnv>` pair per process. A module-level set tracks which
    pairs have already warned.

  **Doc / API clarity:**
  - `codegenPool` JSDoc + CLAUDE.md now spell out per-provider applicability: `statementTimeoutMs` is cross-platform; `max` / `min` / `idleTimeoutMillis` / `connectionTimeoutMillis` / `ssl` are PG-only today. Previously the docs claimed cross-platform application of pool-sizing knobs, but only `statementTimeoutMs` is wired into `buildSqlConfig()` — so a user setting `codegenPool.max: 50` for SQL Server was silently ignored.
  - Added a `KEEP IN SYNC` comment near `DEFAULT_CODEGEN_CONFIG` pointing to `applyPlatformDependentEnvVars`'s `overrides` table — the two share the same set of PG*\*/DB*\* env-var pairs and must be updated together.
  - Fixed JSDoc typo `@memberjunction/postgresql-data-provider` → `@memberjunction/postgresql-dataprovider`.

  **Test quality:**
  - `setupDataSource.test.ts` now exercises the actual `resolveCodeGenDatabaseProvider()` function the orchestrator delegates to, instead of re-implementing the factory call inline. The orchestrator's "not registered → throw with descriptive message" branch is now genuinely covered — previously the assertions would have kept passing even if the real method had drifted. The dispatch logic was extracted from `RunCodeGenBase.setupDataSource()` into a free function on `codeGenDatabaseProvider.ts` to make this possible without forcing the test to import the heavy `runCodeGen.ts` module.
  - New `db-connection.test.ts` covers the SQL Server `codegenPool.statementTimeoutMs` → `dbRequestTimeout` → 120000 precedence chain — previously only validated E2E. `buildSqlConfig` is exported for the test (sole production caller remains `MSSQLConnection()`).
  - New `applyPlatformDependentEnvVars.test.ts` covers the helper added by this PR: short-circuit on non-PG `dbPlatform`, PG\_\* override semantics, user-explicit precedence, non-numeric PG_PORT handling, and warning de-dup (single warning across multiple `initializeConfig()` calls). The function is exported solely for testing — production code only calls it internally.

  **`@memberjunction/postgresql-dataprovider`:** additive — `PGConnectionConfig` gains an optional `Options` field threaded into `pg.PoolConfig.options`. Existing consumers that don't set it see identical behavior.

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [b98366b]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/sql-dialect@5.43.0
  - @memberjunction/ai-vectordb@5.43.0
  - @memberjunction/generic-database-provider@5.43.0
  - @memberjunction/query-processor@5.43.0

## 5.42.0

### Patch Changes

- b7092ca: PostgreSQL runtime correctness, found during fresh-DB PG end-to-end testing:
  - **codegen-lib**: clean MJAPI engine load on PostgreSQL — `AutoUpdatePath` written as a
    dialect-correct boolean literal, plus a PG-only migration removing orphan related-entity-name
    virtual EntityField rows whose column the generated PG base view never emits (these crashed
    EntityActionEngine / AI Credential Bindings / Scheduling with `column "..." does not exist`).
  - **open-app-engine**: app uninstall now deletes all FK-dependent metadata (Entity Field Values,
    Entity Settings) in dependency order and reports a real failure instead of swallowing errors
    into a false "success".
  - **postgresql-dataprovider**: dialect-correct per-field entity-search predicate (no `N'...'`
    literal prefix, no `ESCAPE` clause) — fixes `syntax error at or near "ESCAPE"` on live search.

- 6d970cd: Runtime SQL dialect correctness on PostgreSQL:
  - **scheduling-engine**: PostgreSQL-correct heartbeat lease extension — affected-rowcount handling +
    mixed-case column quoting in `spExtendScheduledJobLease`, with a PG-only migration. _(migration → minor)_
  - **postgresql-dataprovider** + call-sites (archiving-engine, core-entities, ng-dashboards,
    ng-entity-communications): translate T-SQL date functions (`GETDATE()`, `DATEADD`, etc.) in
    runtime SQL clauses to PostgreSQL equivalents. _(code → patch)_

- Updated dependencies [9b9b484]
- Updated dependencies [0c6bf61]
- Updated dependencies [2f225e4]
- Updated dependencies [0fa3cbc]
  - @memberjunction/core@5.42.0
  - @memberjunction/generic-database-provider@5.42.0
  - @memberjunction/ai-vectordb@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/query-processor@5.42.0
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
  - @memberjunction/generic-database-provider@5.41.0
  - @memberjunction/ai-vectordb@5.41.0
  - @memberjunction/query-processor@5.41.0
  - @memberjunction/global@5.41.0
  - @memberjunction/sql-dialect@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai-vectordb@5.40.2
- @memberjunction/generic-database-provider@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/global@5.40.2
- @memberjunction/query-processor@5.40.2
- @memberjunction/sql-dialect@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-vectordb@5.40.1
  - @memberjunction/generic-database-provider@5.40.1
  - @memberjunction/query-processor@5.40.1
  - @memberjunction/global@5.40.1
  - @memberjunction/sql-dialect@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
  - @memberjunction/core@5.40.0
  - @memberjunction/generic-database-provider@5.40.0
  - @memberjunction/ai-vectordb@5.40.0
  - @memberjunction/query-processor@5.40.0
  - @memberjunction/global@5.40.0
  - @memberjunction/sql-dialect@5.40.0

## 5.39.0

### Patch Changes

- 7dfacc7: Add support for storing and querying embeddings inside the application's own database instead of a separate vector service. `VectorDBBase` gains an `IColocatedVectorHost` adapter (implemented by the PostgreSQL and SQL Server data providers) and a `ColocatedQuery` API; the new `PgVectorColocated` provider does vector + keyword (RRF) search in one statement, and the new `@memberjunction/ai-vectors-sqlserver` package adds a SQL Server 2025 native `VECTOR` provider with sibling-table and entity-column storage modes. `VectorSearchProvider` and `EntityVectorSyncer` route these indexes through the borrowed connection.
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [7dfacc7]
- Updated dependencies [eaee99f]
- Updated dependencies [2d1b4e1]
- Updated dependencies [3c53858]
- Updated dependencies [ae74fd5]
- Updated dependencies [9bc2916]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/ai-vectordb@5.39.0
  - @memberjunction/generic-database-provider@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/query-processor@5.39.0
  - @memberjunction/sql-dialect@5.39.0

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
  - @memberjunction/generic-database-provider@5.38.0
  - @memberjunction/sql-dialect@5.38.0
  - @memberjunction/query-processor@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
- Updated dependencies [f5531e0]
  - @memberjunction/core@5.37.0
  - @memberjunction/generic-database-provider@5.37.0
  - @memberjunction/query-processor@5.37.0
  - @memberjunction/global@5.37.0
  - @memberjunction/sql-dialect@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core@5.36.0
  - @memberjunction/generic-database-provider@5.36.0
  - @memberjunction/query-processor@5.36.0
  - @memberjunction/global@5.36.0
  - @memberjunction/sql-dialect@5.36.0

## 5.35.0

### Patch Changes

- aedd4dc: Bubble save SQL composition up to GenericDatabaseProvider as a single orchestrator; SQL Server and Postgres providers now contribute four dialect hooks instead of duplicating the generator. Fixes a PG UPDATE bug where PK wasn't tail appended
- Updated dependencies [6fa8e13]
- Updated dependencies [c1f1cad]
- Updated dependencies [6f083dd]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/generic-database-provider@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/query-processor@5.35.0
  - @memberjunction/sql-dialect@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/generic-database-provider@5.34.1
  - @memberjunction/query-processor@5.34.1
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
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/generic-database-provider@5.34.0
  - @memberjunction/query-processor@5.34.0
  - @memberjunction/sql-dialect@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Minor Changes

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

- b0329f6: PG: JSON-arg CRUD sprocs for wide entities + Bug 5 four-pass fix + codegen lookup fixes (#2552)

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
  - @memberjunction/query-processor@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/generic-database-provider@5.32.0
  - @memberjunction/query-processor@5.32.0
  - @memberjunction/global@5.32.0
  - @memberjunction/sql-dialect@5.32.0

## 5.31.0

### Minor Changes

- 3c5176f: Bring MJ to a state where it runs end-to-end on PostgreSQL — including managed PG services (RDS, Aurora, Cloud SQL, Azure) — on a developer machine and in self-hosted environments.

  **Runtime (`@memberjunction/postgresql-dataprovider`):** new `autoQuoteIdentifiers` tokenizer in `ExecuteSQL` auto-quotes mixed-case identifiers in raw SQL (PascalCase columns, `vw*` views) so hand-written queries from MJ resolvers, engines, and dashboards work on PG without per-call quoting. Conservative — only quotes PascalCase or lowercase-first identifiers preceded by `.` (object refs). 30 new tokenizer tests covering keywords, dollar-quoted blocks, positional `$N` params, string literals, `[bracketed]` SQL Server identifiers, and the regression cases from Memory Manager and ConversationEngine flows.

  **Converter (`@memberjunction/sql-converter`):** `quoteAsAliases` regex made case-insensitive on the `AS` keyword (caught the `vwEntityPermissions.RoleName` alias case-fold bug). `SequenceDeduplicator` now auto-detects and fixes EntityField sequence collisions as a post-conversion step. Heavy regression tests gated behind `process.env.CI === 'true'` (with `CI_HEAVY_REGRESSION=true` opt-out for nightly) — pg-migrations.yml workflow already does the equivalent gate at the workflow level.

  **CodeGen (`@memberjunction/codegen-lib`):** CodeGen audit SQL output now routes to `migrations-pg/v5/` when `dbPlatform=postgresql` (was always going to `migrations/v5/`).

  **CLI (`@memberjunction/cli`):** consumes published Skyway 0.6.0 multi-dialect packages (`skyway-core`, `skyway-sqlserver`, `skyway-postgres`).

  **Managed-PG support:** historical PG migrations rewritten to drop the `pg_cast` UPDATE that required superuser, with INSERT VALUES tuples / WHERE-comparisons / CHECK constraints rewritten to use BOOLEAN literals (`TRUE`/`FALSE`) directly. 50 files touched in the companion `pg-migration-files` PR; 10,967 INSERT tuples + 3,510 comparisons + 9 CHECK constraints fixed.

  The actual PG migration content — v5.0 baseline + every V\*.pg.sql for v5.0–v5.30 — ships in the companion `pg-migration-files` PR. The two PRs merge together.

  See `migrations-pg/TESTING_GUIDE.md` for the verification strategy used during this PR's development (per-migration audit, schema dump diff, snapshot scripts, autoQuoter coverage).

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [7ed7a4b]
- Updated dependencies [9457655]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/generic-database-provider@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/query-processor@5.31.0
  - @memberjunction/sql-dialect@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/generic-database-provider@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/query-processor@5.30.1
- @memberjunction/sql-dialect@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core@5.30.0
  - @memberjunction/generic-database-provider@5.30.0
  - @memberjunction/query-processor@5.30.0
  - @memberjunction/global@5.30.0
  - @memberjunction/sql-dialect@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
  - @memberjunction/core@5.29.0
  - @memberjunction/sql-dialect@5.29.0
  - @memberjunction/generic-database-provider@5.29.0
  - @memberjunction/query-processor@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/generic-database-provider@5.28.0
  - @memberjunction/query-processor@5.28.0
  - @memberjunction/global@5.28.0
  - @memberjunction/sql-dialect@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/generic-database-provider@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/query-processor@5.27.1
  - @memberjunction/sql-dialect@5.27.1

## 5.27.0

### Patch Changes

- Updated dependencies [4357090]
  - @memberjunction/generic-database-provider@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/global@5.27.0
  - @memberjunction/query-processor@5.27.0
  - @memberjunction/sql-dialect@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [a1002f4]
  - @memberjunction/core@5.26.0
  - @memberjunction/generic-database-provider@5.26.0
  - @memberjunction/query-processor@5.26.0
  - @memberjunction/global@5.26.0
  - @memberjunction/sql-dialect@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
  - @memberjunction/core@5.25.0
  - @memberjunction/generic-database-provider@5.25.0
  - @memberjunction/query-processor@5.25.0
  - @memberjunction/global@5.25.0
  - @memberjunction/sql-dialect@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/generic-database-provider@5.24.0
  - @memberjunction/query-processor@5.24.0
  - @memberjunction/global@5.24.0
  - @memberjunction/sql-dialect@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/generic-database-provider@5.23.0
  - @memberjunction/query-processor@5.23.0
  - @memberjunction/sql-dialect@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/generic-database-provider@5.22.0
  - @memberjunction/query-processor@5.22.0
  - @memberjunction/sql-dialect@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
- Updated dependencies [72fc93b]
  - @memberjunction/core@5.21.0
  - @memberjunction/query-processor@5.21.0
  - @memberjunction/generic-database-provider@5.21.0
  - @memberjunction/global@5.21.0
  - @memberjunction/sql-dialect@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [cc954e1]
- Updated dependencies [2298f8a]
  - @memberjunction/generic-database-provider@5.20.0
  - @memberjunction/core@5.20.0
  - @memberjunction/query-processor@5.20.0
  - @memberjunction/global@5.20.0
  - @memberjunction/sql-dialect@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/generic-database-provider@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/query-processor@5.19.0
- @memberjunction/sql-dialect@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/generic-database-provider@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/global@5.18.0
- @memberjunction/query-processor@5.18.0
- @memberjunction/sql-dialect@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [4b6fd2a]
- Updated dependencies [9881045]
  - @memberjunction/generic-database-provider@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/query-processor@5.17.0
  - @memberjunction/global@5.17.0
  - @memberjunction/sql-dialect@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/generic-database-provider@5.16.0
  - @memberjunction/query-processor@5.16.0
  - @memberjunction/global@5.16.0
  - @memberjunction/sql-dialect@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [5e85b29]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/generic-database-provider@5.15.0
  - @memberjunction/query-processor@5.15.0
  - @memberjunction/global@5.15.0
  - @memberjunction/sql-dialect@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/generic-database-provider@5.14.0
  - @memberjunction/query-processor@5.14.0
  - @memberjunction/global@5.14.0
  - @memberjunction/sql-dialect@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/generic-database-provider@5.13.0
  - @memberjunction/query-processor@5.13.0
  - @memberjunction/sql-dialect@5.13.0

## 5.12.0

### Minor Changes

- 8ca8698: pg migrations

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
  - @memberjunction/core@5.12.0
  - @memberjunction/generic-database-provider@5.12.0
  - @memberjunction/query-processor@5.12.0
  - @memberjunction/global@5.12.0
  - @memberjunction/sql-dialect@5.12.0

## 5.11.0

### Minor Changes

- a4c3c81: migration/metadata

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/generic-database-provider@5.11.0
  - @memberjunction/core@5.11.0
  - @memberjunction/query-processor@5.11.0
  - @memberjunction/global@5.11.0
  - @memberjunction/sql-dialect@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/generic-database-provider@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/query-processor@5.10.1
- @memberjunction/sql-dialect@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/generic-database-provider@5.10.0
  - @memberjunction/query-processor@5.10.0
  - @memberjunction/global@5.10.0
  - @memberjunction/sql-dialect@5.10.0

## 5.9.0

### Patch Changes

- 194ddf2: Add Redis-backed ILocalStorageProvider with cross-server cache invalidation via pub/sub
- Updated dependencies [194ddf2]
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/generic-database-provider@5.9.0
  - @memberjunction/query-processor@5.9.0
  - @memberjunction/sql-dialect@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [064cf3a]
- Updated dependencies [0753249]
  - @memberjunction/generic-database-provider@5.8.0
  - @memberjunction/core@5.8.0
  - @memberjunction/query-processor@5.8.0
  - @memberjunction/global@5.8.0
  - @memberjunction/sql-dialect@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/generic-database-provider@5.7.0
  - @memberjunction/query-processor@5.7.0
  - @memberjunction/global@5.7.0
  - @memberjunction/sql-dialect@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/generic-database-provider@5.6.0
  - @memberjunction/query-processor@5.6.0
  - @memberjunction/global@5.6.0
  - @memberjunction/sql-dialect@5.6.0

## 5.5.0

### Minor Changes

- ee9f788: migrations - postgres sql support!

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/sql-dialect@5.5.0
  - @memberjunction/generic-database-provider@5.5.0
  - @memberjunction/query-processor@5.5.0

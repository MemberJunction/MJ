# @memberjunction/sql-dialect

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.

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

### Patch Changes

- 312fcee: Fix two runtime SQL paths that referenced an entity's `BaseTable` directly, which fails under tightened DB grants (the runtime app user has SELECT only on BaseViews and EXECUTE on CRUD sprocs). Both paths now read from `BaseView` and route their identifier, string-literal, and bounded-string-cast generation through `SQLDialect` so the same code produces correct SQL on SQL Server, PostgreSQL, and any future supported platform.

  Adds three new helpers to `SQLDialect`: `QuoteStringLiteral` (concrete, both dialects share `''`-doubling escape), `QuoteColumnAlias` (abstract — bare on SQL Server, double-quoted on PG to preserve case), and `CastToBoundedString` (concrete, composed from existing `ResolveAbstractType` so it emits `NVARCHAR(450)` on SQL Server and `VARCHAR(450)` on PG).

  Refactored sites: `ScheduledGeocodingAction` orphan-cleanup `NOT EXISTS` filter, and `BuildChildDiscoverySQL` (IS-A subtype probe) on both `SQLServerDataProvider` and `PostgreSQLDataProvider` — the latter two also fix the runtime-failing `FROM [schema].[BaseTable]` shape that fired on every IS-A entity load and on the `FindISAChildEntity` GraphQL resolver.

- 7add405: Lift Flyway placeholder escaping from `SqlLogger` into the `SQLDialect` abstraction. Each dialect now declares its own `EscapeFlywayStringInterpolation` form (SQL Server interleaves a `CAST(N'' AS NVARCHAR(MAX))` to defeat the NVARCHAR(4000) concat cap; PostgreSQL uses a plain `||` split since TEXT has no length cap), so the shared `SqlLoggingSessionImpl` can be used safely across providers without hard-coding T-SQL syntax.

## 5.32.0

## 5.31.0

### Minor Changes

- 9457655: lift CRUD-routine generation to the base class via new SQLDialect abstractions (IsNull, ParameterRef, ParameterDefault, NullLiteral, EmptyUUIDLiteral) so SP generation logic lives once and dialects override only what's syntax-specific

### Patch Changes

- 7ed7a4b: no metadata/migration changes

## 5.30.1

## 5.30.0

## 5.29.0

### Patch Changes

- e02e24e: Query rendering pipeline redesign: fix Bug D (Nunjucks expression inside SQL string literal breaks ORDER BY detection), consolidate duplicated ORDER BY logic into shared analyzer, add RenderPipeline entry point with diagnostic tracing, introduce structural parser and symbol table for composition IR, and integrate SQL dialect objects throughout the parser removing all hardcoded dialect switch statements. SQL comments are now stripped before template evaluation instead of escaped. Production callers (RunQuery, TestQuerySQL) delegate to RenderPipeline. 65+ new tests including recursive CTEs, PostgreSQL dialect variants, and comment-stripping coverage.

  Query dashboard and form UI improvements: replace flat category dropdowns with hierarchical tree dropdowns, default new query category to active folder context, add per-folder create buttons, expose Reusable/CacheEnabled/AuditQueryRuns fields in entity form Details panel, add saving indicator with spinner overlay, fix sub-entity delete by reloading fresh entity copies, and fix tree dropdown not showing pre-selected text for branch-only configurations. Fix extraction pipeline not cleaning up stale Query Fields and Query Entities when extraction produces no results, with 9 regression tests.

## 5.28.0

## 5.27.1

## 5.27.0

## 5.26.0

## 5.25.0

## 5.24.0

## 5.23.0

## 5.22.0

## 5.21.0

## 5.20.0

## 5.19.0

## 5.18.0

## 5.17.0

## 5.16.0

## 5.15.0

## 5.14.0

## 5.13.0

## 5.12.0

## 5.11.0

## 5.10.1

## 5.10.0

## 5.9.0

## 5.8.0

## 5.7.0

## 5.6.0

## 5.5.0

### Minor Changes

- ee9f788: migrations - postgres sql support!

### Patch Changes

- df2457c: no migration, just small code changes

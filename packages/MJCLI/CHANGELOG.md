# Change Log - @memberjunction/cli

## 5.40.2

### Patch Changes

- 3da89ef: Add configurable CORS origins and opt-in rate limiting to MJ Server, add client-side permission evaluation for component artifacts, and fix CI publish failures in light-command and db-auto-doc bootstrap
- Updated dependencies [3da89ef]
  - @memberjunction/db-auto-doc@5.40.2
  - @memberjunction/sqlserver-dataprovider@5.40.2
  - @memberjunction/ai-cli@5.40.2
  - @memberjunction/codegen-lib@5.40.2
  - @memberjunction/metadata-sync@5.40.2
  - @memberjunction/server-bootstrap-lite@5.40.2
  - @memberjunction/query-gen@5.40.2
  - @memberjunction/testing-cli@5.40.2
  - @memberjunction/config@5.40.2
  - @memberjunction/generic-database-provider@5.40.2
  - @memberjunction/core@5.40.2
  - @memberjunction/installer@5.40.2
  - @memberjunction/open-app-engine@5.40.2
  - @memberjunction/sql-converter@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-cli@5.40.1
  - @memberjunction/codegen-lib@5.40.1
  - @memberjunction/db-auto-doc@5.40.1
  - @memberjunction/generic-database-provider@5.40.1
  - @memberjunction/metadata-sync@5.40.1
  - @memberjunction/open-app-engine@5.40.1
  - @memberjunction/query-gen@5.40.1
  - @memberjunction/sqlserver-dataprovider@5.40.1
  - @memberjunction/server-bootstrap-lite@5.40.1
  - @memberjunction/testing-cli@5.40.1
  - @memberjunction/config@5.40.1
  - @memberjunction/installer@5.40.1
  - @memberjunction/sql-converter@5.40.1

## 5.40.0

### Patch Changes

- 9233802: Convert and validate the consolidated baseline in the PostgreSQL migration pipeline. GrantRule now skips `GRANT CONNECT` (no PG equivalent) and ProcedureToFunctionRule skips CRUD sprocs whose `RETURNS SETOF` view is a deprecated/orphaned entity view — both emit `-- SKIPPED (INTENTIONAL)` markers instead of apply-failing SQL. Fix the MJCLI baseline roundtrip's PG conversion (it called nonexistent `--input/--output` flags) and correct the migrate-convert baseline JSDoc.
- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
- Updated dependencies [9233802]
  - @memberjunction/core@5.40.0
  - @memberjunction/codegen-lib@5.40.0
  - @memberjunction/generic-database-provider@5.40.0
  - @memberjunction/sqlserver-dataprovider@5.40.0
  - @memberjunction/server-bootstrap-lite@5.40.0
  - @memberjunction/sql-converter@5.40.0
  - @memberjunction/ai-cli@5.40.0
  - @memberjunction/db-auto-doc@5.40.0
  - @memberjunction/metadata-sync@5.40.0
  - @memberjunction/open-app-engine@5.40.0
  - @memberjunction/query-gen@5.40.0
  - @memberjunction/testing-cli@5.40.0
  - @memberjunction/config@5.40.0
  - @memberjunction/installer@5.40.0

## 5.39.0

### Patch Changes

- 361eb4c: Azure-safe principal creation in baseline emitter, plus a freshly-generated v5.38.x baseline (`B202605291452__v5.38.x__Baseline.sql`).
  - `emitPrincipals` now wraps cross-database `master.*` lookups inside `sp_executesql N'...'` string literals so Azure SQL's submission-time parser can't reject the batch. The `SERVERPROPERTY('EngineEdition') = 5` check sets `@associate = 1` on Azure, so the `master.dbo.syslogins` path never executes there — but only the dynamic-SQL wrapper prevents the parser from rejecting the batch before the IF can short-circuit it.
  - New emitter test (`keeps cross-DB references inside string literals (Azure-safe)`) strips quoted literals from the emitted SQL and asserts zero `master.*` references survive outside string literals — regressions surface immediately.
  - New v5.38.x baseline ships with the fix: 0 `master.*` refs outside string literals, 4 `sp_executesql` wrappers (one per SQL user), byte-equivalent to a V-stack-built source DB (0 object/row diffs across 46,432 rows). Previously published v5.34.x and v5.37.x baselines are intentionally untouched — Skyway auto-picks the latest baseline for fresh installs.

- cd4f6e7: Remote distribution fetch for `mj install`, plus a new `mj bundle` command.
  - `mj install` (distribution mode) now blobless-sparse-checks-out the source at the resolved tag and assembles the distribution layout on demand, replacing the committed bootstrap zip.
  - New `mj bundle` builds a self-contained distribution zip for offline/air-gapped installs. `--with-migrations` ships both the SQL Server (`migrations/`) and PostgreSQL (`migrations-pg/`) trees by default; `--db-platform sqlserver|postgresql` narrows to one.
  - `mj migrate` fetches only the migration slice it needs. It first reads the database's current version from the Skyway history table and chooses accordingly: a **fresh** database gets `baseline + tail`, while an **existing** database is upgraded with the versioned migrations _after_ its current version (no baseline) — fixing a gap where upgrading a database that sits below a newer baseline silently skipped the intermediate migrations. The detected version is shown in the CLI output.
  - `mj migrate` also runs a TLS-aware connection preflight (also available standalone via `--check-connection`) that surfaces an actionable hint — e.g. set `DB_TRUST_SERVER_CERTIFICATE=1` for a self-signed cert — instead of a cryptic mid-migration error.
  - The installer-generated MJExplorer environment files are emitted `as const` so union fields keep their literal types.

- Updated dependencies [26761b8]
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [7dfacc7]
- Updated dependencies [eaee99f]
- Updated dependencies [2d1b4e1]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [ae74fd5]
- Updated dependencies [9bc2916]
- Updated dependencies [cd4f6e7]
- Updated dependencies [a101a34]
  - @memberjunction/metadata-sync@5.39.0
  - @memberjunction/core@5.39.0
  - @memberjunction/sqlserver-dataprovider@5.39.0
  - @memberjunction/server-bootstrap-lite@5.39.0
  - @memberjunction/generic-database-provider@5.39.0
  - @memberjunction/codegen-lib@5.39.0
  - @memberjunction/installer@5.39.0
  - @memberjunction/ai-cli@5.39.0
  - @memberjunction/db-auto-doc@5.39.0
  - @memberjunction/open-app-engine@5.39.0
  - @memberjunction/query-gen@5.39.0
  - @memberjunction/testing-cli@5.39.0
  - @memberjunction/config@5.39.0
  - @memberjunction/sql-converter@5.39.0

## 5.38.0

### Patch Changes

- 67d6562: Add full-stack MJ Explorer regression test suite — Docker-based runner with Computer Use engine, parallel workers via HeadlessBrowserEngine, bacpac mode, standalone compose for external use, and `mj test regression init` templates (remote-mj, generic-web, bring-your-own-app, static-file-server). Includes ephemeral workspace guard for cross-test isolation and stabilizes the suite at 25/25.
- 748b2e7: Add deterministic baseline migration toolchain (`mj baseline build` / `compare` / `roundtrip`): introspects + emits the full MSSQL schema (tables, views, procedures, functions, triggers, UDTs, extended properties, database principals, role memberships, and object/schema/type/database permissions) with proven byte-equivalence via the row-by-row comparator. AUTO within-major rebaseline mode derives `Major.Minor` and a `latestV+1m` timestamp from the source migrations directory. Ships with workbench end-to-end script and a `/create-new-baseline-migration` slash-command driver.
- 48dc77a: Add full-stack regression test suite for MJ Explorer driven by the Computer Use engine. New `Drag` browser action with smooth multi-step mouse motion, parallel browser worker contexts shared across tests with auto-rotation after 20 uses, JSON-on-disk run comparison via `mj test compare --from-json`, and `--dry-run` / `--parallel` / `--flaky-check` flags on the testing CLI.
- ebb0e3d: Eliminate provider.Refresh() from query save/delete paths, introduce MJQueryEntityExtended with child-relationship getters and business logic, migrate all QueryInfo consumers outside MJCore to use QueryEngine and entity types, remove dead QueryCacheManager, and replace 12 redundant RunView calls with QueryEngine cache reads. Fixes major performance bottleneck on large-entity deployments where every query save reloaded the entire metadata graph.
- Updated dependencies [67d6562]
- Updated dependencies [4ee0b06]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [21d967f]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [48dc77a]
- Updated dependencies [ebb0e3d]
  - @memberjunction/metadata-sync@5.38.0
  - @memberjunction/testing-cli@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/db-auto-doc@5.38.0
  - @memberjunction/codegen-lib@5.38.0
  - @memberjunction/generic-database-provider@5.38.0
  - @memberjunction/open-app-engine@5.38.0
  - @memberjunction/sqlserver-dataprovider@5.38.0
  - @memberjunction/query-gen@5.38.0
  - @memberjunction/server-bootstrap-lite@5.38.0
  - @memberjunction/ai-cli@5.38.0
  - @memberjunction/sql-converter@5.38.0
  - @memberjunction/config@5.38.0
  - @memberjunction/installer@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [464f30c]
- Updated dependencies [baf3032]
- Updated dependencies [4f15f31]
- Updated dependencies [f5531e0]
  - @memberjunction/server-bootstrap-lite@5.37.0
  - @memberjunction/codegen-lib@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/generic-database-provider@5.37.0
  - @memberjunction/ai-cli@5.37.0
  - @memberjunction/db-auto-doc@5.37.0
  - @memberjunction/metadata-sync@5.37.0
  - @memberjunction/query-gen@5.37.0
  - @memberjunction/sqlserver-dataprovider@5.37.0
  - @memberjunction/open-app-engine@5.37.0
  - @memberjunction/testing-cli@5.37.0
  - @memberjunction/config@5.37.0
  - @memberjunction/installer@5.37.0
  - @memberjunction/sql-converter@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [1c0fce9]
- Updated dependencies [e215af2]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/server-bootstrap-lite@5.36.0
  - @memberjunction/codegen-lib@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/metadata-sync@5.36.0
  - @memberjunction/db-auto-doc@5.36.0
  - @memberjunction/ai-cli@5.36.0
  - @memberjunction/generic-database-provider@5.36.0
  - @memberjunction/query-gen@5.36.0
  - @memberjunction/sqlserver-dataprovider@5.36.0
  - @memberjunction/testing-cli@5.36.0
  - @memberjunction/open-app-engine@5.36.0
  - @memberjunction/config@5.36.0
  - @memberjunction/installer@5.36.0
  - @memberjunction/sql-converter@5.36.0

## 5.35.0

### Patch Changes

- 32c4a02: Unify artifact and attachment delivery paths for AI agents. Seperate artifact storage from rendering. Every attachement now creates paired Artifact + ArtifactVersion and routing functions exist to replace hardcoded MIME allowlist. Unregistered file types are rejected at upload time unless the agent opts into AcceptUnregisteredFiles. Adds wildecard MIME resolver. `mj artifacts reclassify` for legacy rows
- Updated dependencies [6fa8e13]
- Updated dependencies [c1f1cad]
- Updated dependencies [6f083dd]
- Updated dependencies [39710b1]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/server-bootstrap-lite@5.35.0
  - @memberjunction/generic-database-provider@5.35.0
  - @memberjunction/open-app-engine@5.35.0
  - @memberjunction/codegen-lib@5.35.0
  - @memberjunction/sqlserver-dataprovider@5.35.0
  - @memberjunction/ai-cli@5.35.0
  - @memberjunction/db-auto-doc@5.35.0
  - @memberjunction/metadata-sync@5.35.0
  - @memberjunction/query-gen@5.35.0
  - @memberjunction/testing-cli@5.35.0
  - @memberjunction/config@5.35.0
  - @memberjunction/installer@5.35.0
  - @memberjunction/sql-converter@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [16e799c]
  - @memberjunction/core@5.34.1
  - @memberjunction/generic-database-provider@5.34.1
  - @memberjunction/codegen-lib@5.34.1
  - @memberjunction/ai-cli@5.34.1
  - @memberjunction/db-auto-doc@5.34.1
  - @memberjunction/metadata-sync@5.34.1
  - @memberjunction/open-app-engine@5.34.1
  - @memberjunction/query-gen@5.34.1
  - @memberjunction/sqlserver-dataprovider@5.34.1
  - @memberjunction/server-bootstrap-lite@5.34.1
  - @memberjunction/testing-cli@5.34.1
  - @memberjunction/config@5.34.1
  - @memberjunction/installer@5.34.1
  - @memberjunction/sql-converter@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [5d6110f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [1b258e6]
- Updated dependencies [e999e0d]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/ai-cli@5.34.0
  - @memberjunction/codegen-lib@5.34.0
  - @memberjunction/config@5.34.0
  - @memberjunction/db-auto-doc@5.34.0
  - @memberjunction/generic-database-provider@5.34.0
  - @memberjunction/installer@5.34.0
  - @memberjunction/metadata-sync@5.34.0
  - @memberjunction/open-app-engine@5.34.0
  - @memberjunction/query-gen@5.34.0
  - @memberjunction/sql-converter@5.34.0
  - @memberjunction/sqlserver-dataprovider@5.34.0
  - @memberjunction/server-bootstrap-lite@5.34.0
  - @memberjunction/testing-cli@5.34.0
  - @memberjunction/core@5.34.0

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

- 80d3814: bump skyway deps to 0.6.1
- Updated dependencies [95eb27e]
- Updated dependencies [8836d2d]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [312fcee]
- Updated dependencies [af7180f]
- Updated dependencies [7e4957d]
- Updated dependencies [f94ebd6]
- Updated dependencies [7add405]
- Updated dependencies [c8039b3]
- Updated dependencies [b0329f6]
- Updated dependencies [fad046c]
  - @memberjunction/core@5.33.0
  - @memberjunction/codegen-lib@5.33.0
  - @memberjunction/db-auto-doc@5.33.0
  - @memberjunction/generic-database-provider@5.33.0
  - @memberjunction/sql-converter@5.33.0
  - @memberjunction/metadata-sync@5.33.0
  - @memberjunction/sqlserver-dataprovider@5.33.0
  - @memberjunction/ai-cli@5.33.0
  - @memberjunction/open-app-engine@5.33.0
  - @memberjunction/query-gen@5.33.0
  - @memberjunction/server-bootstrap-lite@5.33.0
  - @memberjunction/testing-cli@5.33.0
  - @memberjunction/config@5.33.0
  - @memberjunction/installer@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
- Updated dependencies [ef8f900]
  - @memberjunction/core@5.32.0
  - @memberjunction/codegen-lib@5.32.0
  - @memberjunction/server-bootstrap-lite@5.32.0
  - @memberjunction/ai-cli@5.32.0
  - @memberjunction/db-auto-doc@5.32.0
  - @memberjunction/metadata-sync@5.32.0
  - @memberjunction/open-app-engine@5.32.0
  - @memberjunction/query-gen@5.32.0
  - @memberjunction/sqlserver-dataprovider@5.32.0
  - @memberjunction/testing-cli@5.32.0
  - @memberjunction/config@5.32.0
  - @memberjunction/installer@5.32.0
  - @memberjunction/sql-converter@5.32.0

## 5.31.0

### Minor Changes

- 60e7541: Add --incremental flag for push/pull, lazy embedding loading, indexed batch context lookups, batched pull queries

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- 3c5176f: Bring MJ to a state where it runs end-to-end on PostgreSQL — including managed PG services (RDS, Aurora, Cloud SQL, Azure) — on a developer machine and in self-hosted environments.

  **Runtime (`@memberjunction/postgresql-dataprovider`):** new `autoQuoteIdentifiers` tokenizer in `ExecuteSQL` auto-quotes mixed-case identifiers in raw SQL (PascalCase columns, `vw*` views) so hand-written queries from MJ resolvers, engines, and dashboards work on PG without per-call quoting. Conservative — only quotes PascalCase or lowercase-first identifiers preceded by `.` (object refs). 30 new tokenizer tests covering keywords, dollar-quoted blocks, positional `$N` params, string literals, `[bracketed]` SQL Server identifiers, and the regression cases from Memory Manager and ConversationEngine flows.

  **Converter (`@memberjunction/sql-converter`):** `quoteAsAliases` regex made case-insensitive on the `AS` keyword (caught the `vwEntityPermissions.RoleName` alias case-fold bug). `SequenceDeduplicator` now auto-detects and fixes EntityField sequence collisions as a post-conversion step. Heavy regression tests gated behind `process.env.CI === 'true'` (with `CI_HEAVY_REGRESSION=true` opt-out for nightly) — pg-migrations.yml workflow already does the equivalent gate at the workflow level.

  **CodeGen (`@memberjunction/codegen-lib`):** CodeGen audit SQL output now routes to `migrations-pg/v5/` when `dbPlatform=postgresql` (was always going to `migrations/v5/`).

  **CLI (`@memberjunction/cli`):** consumes published Skyway 0.6.0 multi-dialect packages (`skyway-core`, `skyway-sqlserver`, `skyway-postgres`).

  **Managed-PG support:** historical PG migrations rewritten to drop the `pg_cast` UPDATE that required superuser, with INSERT VALUES tuples / WHERE-comparisons / CHECK constraints rewritten to use BOOLEAN literals (`TRUE`/`FALSE`) directly. 50 files touched in the companion `pg-migration-files` PR; 10,967 INSERT tuples + 3,510 comparisons + 9 CHECK constraints fixed.

  The actual PG migration content — v5.0 baseline + every V\*.pg.sql for v5.0–v5.30 — ships in the companion `pg-migration-files` PR. The two PRs merge together.

  See `migrations-pg/TESTING_GUIDE.md` for the verification strategy used during this PR's development (per-migration audit, schema dump diff, snapshot scripts, autoQuoter coverage).

- Updated dependencies [7ed7a4b]
- Updated dependencies [9457655]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [3c5176f]
- Updated dependencies [e545a51]
- Updated dependencies [132ce24]
- Updated dependencies [b3d88ff]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/ai-cli@5.31.0
  - @memberjunction/codegen-lib@5.31.0
  - @memberjunction/config@5.31.0
  - @memberjunction/db-auto-doc@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/installer@5.31.0
  - @memberjunction/metadata-sync@5.31.0
  - @memberjunction/open-app-engine@5.31.0
  - @memberjunction/query-gen@5.31.0
  - @memberjunction/sql-converter@5.31.0
  - @memberjunction/sqlserver-dataprovider@5.31.0
  - @memberjunction/server-bootstrap-lite@5.31.0
  - @memberjunction/testing-cli@5.31.0

## 5.30.1

### Patch Changes

- 1826093: Fix migration V202604260056 failure on existing databases by replacing hardcoded CHECK constraint names with dynamic lookups via sys.check_constraints
  - @memberjunction/ai-cli@5.30.1
  - @memberjunction/codegen-lib@5.30.1
  - @memberjunction/config@5.30.1
  - @memberjunction/db-auto-doc@5.30.1
  - @memberjunction/core@5.30.1
  - @memberjunction/installer@5.30.1
  - @memberjunction/metadata-sync@5.30.1
  - @memberjunction/open-app-engine@5.30.1
  - @memberjunction/query-gen@5.30.1
  - @memberjunction/sql-converter@5.30.1
  - @memberjunction/sqlserver-dataprovider@5.30.1
  - @memberjunction/server-bootstrap-lite@5.30.1
  - @memberjunction/testing-cli@5.30.1

## 5.30.0

### Patch Changes

- 29a1fad: no migration/metadata, just da patch
- 0279a5c: Open App: exact version pins, per-repo tokens, and workspace-wide prefix bumps
  - `--version` flag now pins packages to exact versions (no ^ prefix) and validates the GitHub tag exists before proceeding
  - Per-repo GitHub token map (`openApps.github.tokens`) for multi-private-repo dependency chains
  - `GetLatestVersion` falls back to tags when no GitHub Releases exist
  - Schema reuse when `createIfNotExists: true` and schema already exists (adopts sidestep installs)
  - Don't pass `--registry` for default npm registry (fixes private scoped package auth)
  - Prevent duplicate `dynamicPackages.server` entries on re-install
  - npm install failures demoted to warnings when package.json was updated (auth issues don't abort install)
  - `packages.prefix` manifest field for workspace-wide dependency bumps during install/upgrade

- fe35537: Scope CodeGen Pass 2 entity field management to changed entities. Adds optional `@EntityIDs` (comma-delimited UUID list) parameter to `spDeleteUnneededEntityFields` and `spUpdateExistingEntityFieldsFromSchema`; adds `--forced-advanced-gen` CLI flag for bypassing scoped behavior in regression testing.
- Updated dependencies [366e646]
- Updated dependencies [8980b38]
- Updated dependencies [68bf87f]
- Updated dependencies [29a1fad]
- Updated dependencies [963f2df]
- Updated dependencies [0279a5c]
- Updated dependencies [4729398]
- Updated dependencies [fe35537]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
- Updated dependencies [216ddc3]
  - @memberjunction/server-bootstrap-lite@5.30.0
  - @memberjunction/codegen-lib@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/open-app-engine@5.30.0
  - @memberjunction/query-gen@5.30.0
  - @memberjunction/db-auto-doc@5.30.0
  - @memberjunction/metadata-sync@5.30.0
  - @memberjunction/ai-cli@5.30.0
  - @memberjunction/sqlserver-dataprovider@5.30.0
  - @memberjunction/testing-cli@5.30.0
  - @memberjunction/config@5.30.0
  - @memberjunction/installer@5.30.0
  - @memberjunction/sql-converter@5.30.0

## 5.29.0

### Patch Changes

- bc0b6b3: feat(codegen): add `--skipfiles` flag for DB-only CodeGen runs

  Adds the inverse of the existing `--skipdb` flag so CodeGen's database and file-generation phases can be driven independently:
  - `mj codegen` → DB writes + file generation (existing default)
  - `mj codegen --skipdb` → file generation only (existing)
  - `mj codegen --skipfiles` → DB writes only (new)
  - `mj codegen --skipdb --skipfiles` → both phases skipped (valid combination)

  Useful for migration-dependent DB touch-ups, CI pipelines that only need SPs/views/permissions refreshed, and reset-and-rebuild scenarios where re-running file generation would conflict with stub files already on disk.

  Also adds `skip_file_generation` (default `false`) to the CodeGen default settings, mirroring the existing `skip_database_generation` config key — so the behavior can be controlled from `mj.config.cjs` as well as the CLI.

  Also fixes a pre-existing CLI bug: the `codegen` command was reading `this.flags.skipDb` (camelCase), which did not match the flag key `skipdb`, so `--skipdb` was always being passed as `undefined` from the CLI layer. Corrected to `this.flags.skipdb`.

  Closes #2440

- Updated dependencies [5c7a57f]
- Updated dependencies [e02e24e]
- Updated dependencies [bc0b6b3]
  - @memberjunction/server-bootstrap-lite@5.29.0
  - @memberjunction/core@5.29.0
  - @memberjunction/codegen-lib@5.29.0
  - @memberjunction/db-auto-doc@5.29.0
  - @memberjunction/metadata-sync@5.29.0
  - @memberjunction/ai-cli@5.29.0
  - @memberjunction/query-gen@5.29.0
  - @memberjunction/sqlserver-dataprovider@5.29.0
  - @memberjunction/testing-cli@5.29.0
  - @memberjunction/sql-converter@5.29.0
  - @memberjunction/config@5.29.0
  - @memberjunction/installer@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [0779734]
- Updated dependencies [1d62875]
- Updated dependencies [115e4da]
  - @memberjunction/codegen-lib@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/ai-cli@5.28.0
  - @memberjunction/query-gen@5.28.0
  - @memberjunction/db-auto-doc@5.28.0
  - @memberjunction/metadata-sync@5.28.0
  - @memberjunction/sqlserver-dataprovider@5.28.0
  - @memberjunction/server-bootstrap-lite@5.28.0
  - @memberjunction/testing-cli@5.28.0
  - @memberjunction/config@5.28.0
  - @memberjunction/installer@5.28.0
  - @memberjunction/sql-converter@5.28.0

## 5.27.1

### Patch Changes

- @memberjunction/codegen-lib@5.27.1
- @memberjunction/db-auto-doc@5.27.1
- @memberjunction/core@5.27.1
- @memberjunction/metadata-sync@5.27.1
- @memberjunction/query-gen@5.27.1
- @memberjunction/sqlserver-dataprovider@5.27.1
- @memberjunction/testing-cli@5.27.1
- @memberjunction/server-bootstrap-lite@5.27.1
- @memberjunction/ai-cli@5.27.1
- @memberjunction/config@5.27.1
- @memberjunction/installer@5.27.1
- @memberjunction/sql-converter@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/server-bootstrap-lite@5.27.0
- @memberjunction/metadata-sync@5.27.0
- @memberjunction/sqlserver-dataprovider@5.27.0
- @memberjunction/ai-cli@5.27.0
- @memberjunction/codegen-lib@5.27.0
- @memberjunction/db-auto-doc@5.27.0
- @memberjunction/query-gen@5.27.0
- @memberjunction/testing-cli@5.27.0
- @memberjunction/config@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/installer@5.27.0
- @memberjunction/sql-converter@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/server-bootstrap-lite@5.26.0
  - @memberjunction/codegen-lib@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-cli@5.26.0
  - @memberjunction/metadata-sync@5.26.0
  - @memberjunction/query-gen@5.26.0
  - @memberjunction/sqlserver-dataprovider@5.26.0
  - @memberjunction/testing-cli@5.26.0
  - @memberjunction/db-auto-doc@5.26.0
  - @memberjunction/config@5.26.0
  - @memberjunction/installer@5.26.0
  - @memberjunction/sql-converter@5.26.0

## 5.25.0

### Patch Changes

- f322a53: Add dual-mode installer supporting both distribution and monorepo installation methods.
- Updated dependencies [fc8cd52]
- Updated dependencies [4f8e980]
- Updated dependencies [f322a53]
  - @memberjunction/core@5.25.0
  - @memberjunction/server-bootstrap-lite@5.25.0
  - @memberjunction/codegen-lib@5.25.0
  - @memberjunction/installer@5.25.0
  - @memberjunction/ai-cli@5.25.0
  - @memberjunction/db-auto-doc@5.25.0
  - @memberjunction/metadata-sync@5.25.0
  - @memberjunction/query-gen@5.25.0
  - @memberjunction/sqlserver-dataprovider@5.25.0
  - @memberjunction/testing-cli@5.25.0
  - @memberjunction/config@5.25.0
  - @memberjunction/sql-converter@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/codegen-lib@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/server-bootstrap-lite@5.24.0
  - @memberjunction/ai-cli@5.24.0
  - @memberjunction/query-gen@5.24.0
  - @memberjunction/sqlserver-dataprovider@5.24.0
  - @memberjunction/metadata-sync@5.24.0
  - @memberjunction/db-auto-doc@5.24.0
  - @memberjunction/testing-cli@5.24.0
  - @memberjunction/config@5.24.0
  - @memberjunction/installer@5.24.0
  - @memberjunction/sql-converter@5.24.0

## 5.23.0

### Patch Changes

- 247df16: Fix server-side RunView cache write asymmetry that caused repeated DB queries during metadata sync, add deterministic Nunjucks template parameter extraction via AST, support comma-delimited multi-value fields in validation, and redesign QueryPagingEngine to append paging directly instead of wrapping in CTEs (fixing ORDER BY on non-projected columns and apostrophe-in-comments bugs).
- b589bef: Switch installer from distribution bootstrap ZIP to full monorepo source download. The installer now downloads the complete MemberJunction repository via GitHub's codeload CDN (not rate-limited) instead of the smaller bootstrap distribution ZIP.
- Updated dependencies [247df16]
- Updated dependencies [37dc301]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [b589bef]
  - @memberjunction/core@5.23.0
  - @memberjunction/metadata-sync@5.23.0
  - @memberjunction/codegen-lib@5.23.0
  - @memberjunction/sqlserver-dataprovider@5.23.0
  - @memberjunction/installer@5.23.0
  - @memberjunction/ai-cli@5.23.0
  - @memberjunction/db-auto-doc@5.23.0
  - @memberjunction/query-gen@5.23.0
  - @memberjunction/server-bootstrap-lite@5.23.0
  - @memberjunction/testing-cli@5.23.0
  - @memberjunction/config@5.23.0
  - @memberjunction/sql-converter@5.23.0

## 5.22.0

### Patch Changes

- f2a6bec: Universal lazy loading via ClassFactory async API. Fixes HomeApplication being tree-shaken by moving lazy loading from consumer-specific retry patterns into ClassFactory itself with RegisterLazyLoader, CreateInstanceAsync, and GetRegistrationAsync. Lazy config now uses compound keys (BaseClassName::Key) to support any base class. Adds coverage audit to codegen to detect gaps.
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [a42aba6]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/server-bootstrap-lite@5.22.0
  - @memberjunction/codegen-lib@5.22.0
  - @memberjunction/ai-cli@5.22.0
  - @memberjunction/query-gen@5.22.0
  - @memberjunction/db-auto-doc@5.22.0
  - @memberjunction/metadata-sync@5.22.0
  - @memberjunction/sqlserver-dataprovider@5.22.0
  - @memberjunction/testing-cli@5.22.0
  - @memberjunction/config@5.22.0
  - @memberjunction/installer@5.22.0
  - @memberjunction/sql-converter@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/server-bootstrap-lite@5.21.0
  - @memberjunction/sqlserver-dataprovider@5.21.0
  - @memberjunction/query-gen@5.21.0
  - @memberjunction/ai-cli@5.21.0
  - @memberjunction/codegen-lib@5.21.0
  - @memberjunction/db-auto-doc@5.21.0
  - @memberjunction/metadata-sync@5.21.0
  - @memberjunction/testing-cli@5.21.0
  - @memberjunction/config@5.21.0
  - @memberjunction/installer@5.21.0
  - @memberjunction/sql-converter@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/metadata-sync@5.20.0
  - @memberjunction/sqlserver-dataprovider@5.20.0
  - @memberjunction/ai-cli@5.20.0
  - @memberjunction/server-bootstrap-lite@5.20.0
  - @memberjunction/codegen-lib@5.20.0
  - @memberjunction/db-auto-doc@5.20.0
  - @memberjunction/query-gen@5.20.0
  - @memberjunction/testing-cli@5.20.0
  - @memberjunction/config@5.20.0
  - @memberjunction/installer@5.20.0
  - @memberjunction/sql-converter@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai-cli@5.19.0
- @memberjunction/server-bootstrap-lite@5.19.0
- @memberjunction/db-auto-doc@5.19.0
- @memberjunction/codegen-lib@5.19.0
- @memberjunction/metadata-sync@5.19.0
- @memberjunction/testing-cli@5.19.0
- @memberjunction/config@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/installer@5.19.0
- @memberjunction/query-gen@5.19.0
- @memberjunction/sql-converter@5.19.0
- @memberjunction/sqlserver-dataprovider@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/ai-cli@5.18.0
- @memberjunction/server-bootstrap-lite@5.18.0
- @memberjunction/codegen-lib@5.18.0
- @memberjunction/query-gen@5.18.0
- @memberjunction/metadata-sync@5.18.0
- @memberjunction/db-auto-doc@5.18.0
- @memberjunction/testing-cli@5.18.0
- @memberjunction/sqlserver-dataprovider@5.18.0
- @memberjunction/config@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/installer@5.18.0
- @memberjunction/sql-converter@5.18.0

## 5.17.0

### Patch Changes

- 5ff5f32: use createRequire for ESM-compatible require in getMJVersion
- Updated dependencies [001fd3e]
- Updated dependencies [9881045]
  - @memberjunction/codegen-lib@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/metadata-sync@5.17.0
  - @memberjunction/sqlserver-dataprovider@5.17.0
  - @memberjunction/ai-cli@5.17.0
  - @memberjunction/server-bootstrap-lite@5.17.0
  - @memberjunction/db-auto-doc@5.17.0
  - @memberjunction/query-gen@5.17.0
  - @memberjunction/testing-cli@5.17.0
  - @memberjunction/config@5.17.0
  - @memberjunction/installer@5.17.0
  - @memberjunction/sql-converter@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/ai-cli@5.16.0
  - @memberjunction/codegen-lib@5.16.0
  - @memberjunction/db-auto-doc@5.16.0
  - @memberjunction/metadata-sync@5.16.0
  - @memberjunction/query-gen@5.16.0
  - @memberjunction/sqlserver-dataprovider@5.16.0
  - @memberjunction/server-bootstrap-lite@5.16.0
  - @memberjunction/testing-cli@5.16.0
  - @memberjunction/config@5.16.0
  - @memberjunction/installer@5.16.0
  - @memberjunction/sql-converter@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/codegen-lib@5.15.0
  - @memberjunction/ai-cli@5.15.0
  - @memberjunction/db-auto-doc@5.15.0
  - @memberjunction/metadata-sync@5.15.0
  - @memberjunction/query-gen@5.15.0
  - @memberjunction/sqlserver-dataprovider@5.15.0
  - @memberjunction/server-bootstrap-lite@5.15.0
  - @memberjunction/testing-cli@5.15.0
  - @memberjunction/config@5.15.0
  - @memberjunction/installer@5.15.0
  - @memberjunction/sql-converter@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/server-bootstrap-lite@5.14.0
  - @memberjunction/ai-cli@5.14.0
  - @memberjunction/codegen-lib@5.14.0
  - @memberjunction/db-auto-doc@5.14.0
  - @memberjunction/metadata-sync@5.14.0
  - @memberjunction/query-gen@5.14.0
  - @memberjunction/sqlserver-dataprovider@5.14.0
  - @memberjunction/testing-cli@5.14.0
  - @memberjunction/config@5.14.0
  - @memberjunction/installer@5.14.0
  - @memberjunction/sql-converter@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/db-auto-doc@5.13.0
  - @memberjunction/ai-cli@5.13.0
  - @memberjunction/codegen-lib@5.13.0
  - @memberjunction/metadata-sync@5.13.0
  - @memberjunction/query-gen@5.13.0
  - @memberjunction/sqlserver-dataprovider@5.13.0
  - @memberjunction/server-bootstrap-lite@5.13.0
  - @memberjunction/testing-cli@5.13.0
  - @memberjunction/config@5.13.0
  - @memberjunction/installer@5.13.0
  - @memberjunction/sql-converter@5.13.0

## 5.12.0

### Patch Changes

- 714e42d: Add diagnostic report generation to `mj doctor` command. `--report` generates a basic diagnostic report (`mj-diagnostic-report.md`) with environment info, install state, and check results. `--report_extended` adds sanitized configuration file snapshots and service startup log capture (`mj-diagnostic-report-extended.md`). Passwords and secrets are automatically redacted. Also fixes process cleanup after service log capture and corrects key file detection for distribution installs.
- 7def002: Fix ExternalChangeDetection unquoted string IDs and log spam, add /healthcheck endpoint before auth middleware, return TechnicalDescription in CreateQuery/UpdateQuery mutations, and improve MJCLI config validation errors with env var hints
- Updated dependencies [217bca4]
- Updated dependencies [21a04c1]
- Updated dependencies [05f19ff]
- Updated dependencies [714e42d]
- Updated dependencies [257512b]
- Updated dependencies [7def002]
- Updated dependencies [d92502e]
- Updated dependencies [1e5d181]
  - @memberjunction/codegen-lib@5.12.0
  - @memberjunction/core@5.12.0
  - @memberjunction/installer@5.12.0
  - @memberjunction/server-bootstrap-lite@5.12.0
  - @memberjunction/ai-cli@5.12.0
  - @memberjunction/db-auto-doc@5.12.0
  - @memberjunction/metadata-sync@5.12.0
  - @memberjunction/query-gen@5.12.0
  - @memberjunction/sqlserver-dataprovider@5.12.0
  - @memberjunction/testing-cli@5.12.0
  - @memberjunction/config@5.12.0
  - @memberjunction/sql-converter@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/sql-converter@5.11.0
  - @memberjunction/sqlserver-dataprovider@5.11.0
  - @memberjunction/metadata-sync@5.11.0
  - @memberjunction/ai-cli@5.11.0
  - @memberjunction/codegen-lib@5.11.0
  - @memberjunction/db-auto-doc@5.11.0
  - @memberjunction/query-gen@5.11.0
  - @memberjunction/server-bootstrap-lite@5.11.0
  - @memberjunction/testing-cli@5.11.0
  - @memberjunction/config@5.11.0
  - @memberjunction/installer@5.11.0

## 5.10.1

### Patch Changes

- Updated dependencies [a4ac83d]
  - @memberjunction/codegen-lib@5.10.1
  - @memberjunction/ai-cli@5.10.1
  - @memberjunction/config@5.10.1
  - @memberjunction/db-auto-doc@5.10.1
  - @memberjunction/core@5.10.1
  - @memberjunction/installer@5.10.1
  - @memberjunction/metadata-sync@5.10.1
  - @memberjunction/query-gen@5.10.1
  - @memberjunction/sql-converter@5.10.1
  - @memberjunction/sqlserver-dataprovider@5.10.1
  - @memberjunction/server-bootstrap-lite@5.10.1
  - @memberjunction/testing-cli@5.10.1

## 5.10.0

### Patch Changes

- f2df653: Add ExternalReferenceID column to AIAgentRun for cross-system run correlation and wire it through Skip proxy. Fix CodeGen validator duplicate generation and cleanup existing duplicates.
- Updated dependencies [f2df653]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/codegen-lib@5.10.0
  - @memberjunction/ai-cli@5.10.0
  - @memberjunction/db-auto-doc@5.10.0
  - @memberjunction/metadata-sync@5.10.0
  - @memberjunction/query-gen@5.10.0
  - @memberjunction/sqlserver-dataprovider@5.10.0
  - @memberjunction/server-bootstrap-lite@5.10.0
  - @memberjunction/testing-cli@5.10.0
  - @memberjunction/config@5.10.0
  - @memberjunction/installer@5.10.0
  - @memberjunction/sql-converter@5.10.0

## 5.9.0

### Minor Changes

- 6214edf: feat: Provider-agnostic OpenApp Engine with configurable project layouts, package manager auto-detection, Azure SQL support, and MJ version fallback detection

### Patch Changes

- Updated dependencies [f991f6d]
- Updated dependencies [194ddf2]
  - @memberjunction/codegen-lib@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/sqlserver-dataprovider@5.9.0
  - @memberjunction/ai-cli@5.9.0
  - @memberjunction/server-bootstrap-lite@5.9.0
  - @memberjunction/metadata-sync@5.9.0
  - @memberjunction/query-gen@5.9.0
  - @memberjunction/testing-cli@5.9.0
  - @memberjunction/db-auto-doc@5.9.0
  - @memberjunction/config@5.9.0
  - @memberjunction/installer@5.9.0
  - @memberjunction/sql-converter@5.9.0

## 5.8.0

### Patch Changes

- 064cf3a: Make API key generation configurable via mj.config.cjs, fix codegen TVF sync and EntityRelationship deduplication, fix SQL logger post-processing, preserve version range prefixes in CLI bump command, and fix SkipProxyAgent crash on error responses
- Updated dependencies [064cf3a]
- Updated dependencies [0753249]
  - @memberjunction/codegen-lib@5.8.0
  - @memberjunction/core@5.8.0
  - @memberjunction/metadata-sync@5.8.0
  - @memberjunction/sqlserver-dataprovider@5.8.0
  - @memberjunction/server-bootstrap-lite@5.8.0
  - @memberjunction/ai-cli@5.8.0
  - @memberjunction/db-auto-doc@5.8.0
  - @memberjunction/query-gen@5.8.0
  - @memberjunction/testing-cli@5.8.0
  - @memberjunction/config@5.8.0
  - @memberjunction/installer@5.8.0
  - @memberjunction/sql-converter@5.8.0

## 5.7.0

### Patch Changes

- 178e891: Add configurable migration request timeout via `dbRequestTimeout` in mj.config.cjs and `MJ_MIGRATION_REQUEST_TIMEOUT` environment variable. Passes `RequestTimeout` through to Skyway-Core's database connection options, allowing long-running migrations (e.g., large index builds) to complete without hitting the default 5-minute timeout.
- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/ai-cli@5.7.0
  - @memberjunction/codegen-lib@5.7.0
  - @memberjunction/db-auto-doc@5.7.0
  - @memberjunction/query-gen@5.7.0
  - @memberjunction/sqlserver-dataprovider@5.7.0
  - @memberjunction/server-bootstrap-lite@5.7.0
  - @memberjunction/metadata-sync@5.7.0
  - @memberjunction/testing-cli@5.7.0
  - @memberjunction/config@5.7.0
  - @memberjunction/installer@5.7.0
  - @memberjunction/sql-converter@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ai-cli@5.6.0
  - @memberjunction/codegen-lib@5.6.0
  - @memberjunction/db-auto-doc@5.6.0
  - @memberjunction/metadata-sync@5.6.0
  - @memberjunction/query-gen@5.6.0
  - @memberjunction/sqlserver-dataprovider@5.6.0
  - @memberjunction/server-bootstrap-lite@5.6.0
  - @memberjunction/testing-cli@5.6.0
  - @memberjunction/config@5.6.0
  - @memberjunction/installer@5.6.0
  - @memberjunction/sql-converter@5.6.0

## 5.5.0

### Patch Changes

- 7ca2459: Viewing System fixes, CodeGen cleanup, startup performance
- 1d3dec4: Add new headless, event-driven installer engine for MemberJunction. Features 9-phase install pipeline (preflight, scaffold, configure, database, platform compat, dependencies, migrate, codegen, smoke test), checkpoint/resume via state file, non-interactive CI/Docker mode (`--yes` + `--config`), `mj doctor` diagnostics, `--fast` optimistic mode, known-issue patching system, stdout-based service readiness detection, cross-platform Windows compatibility fixes, and 425 unit tests across 20 Vitest test files.
- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [7ca2459]
- Updated dependencies [bf2c142]
- Updated dependencies [ee9f788]
- Updated dependencies [1d3dec4]
- Updated dependencies [df2457c]
- Updated dependencies [6421543]
  - @memberjunction/core@5.5.0
  - @memberjunction/server-bootstrap-lite@5.5.0
  - @memberjunction/sqlserver-dataprovider@5.5.0
  - @memberjunction/codegen-lib@5.5.0
  - @memberjunction/sql-converter@5.5.0
  - @memberjunction/installer@5.5.0
  - @memberjunction/ai-cli@5.5.0
  - @memberjunction/config@5.5.0
  - @memberjunction/db-auto-doc@5.5.0
  - @memberjunction/metadata-sync@5.5.0
  - @memberjunction/query-gen@5.5.0
  - @memberjunction/testing-cli@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai-cli@5.4.1
- @memberjunction/codegen-lib@5.4.1
- @memberjunction/config@5.4.1
- @memberjunction/db-auto-doc@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/metadata-sync@5.4.1
- @memberjunction/query-gen@5.4.1
- @memberjunction/sqlserver-dataprovider@5.4.1
- @memberjunction/server-bootstrap-lite@5.4.1
- @memberjunction/testing-cli@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/codegen-lib@5.4.0
  - @memberjunction/server-bootstrap-lite@5.4.0
  - @memberjunction/metadata-sync@5.4.0
  - @memberjunction/ai-cli@5.4.0
  - @memberjunction/query-gen@5.4.0
  - @memberjunction/sqlserver-dataprovider@5.4.0
  - @memberjunction/testing-cli@5.4.0
  - @memberjunction/db-auto-doc@5.4.0
  - @memberjunction/config@5.4.0
  - @memberjunction/core@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai-cli@5.3.1
- @memberjunction/codegen-lib@5.3.1
- @memberjunction/config@5.3.1
- @memberjunction/db-auto-doc@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/metadata-sync@5.3.1
- @memberjunction/query-gen@5.3.1
- @memberjunction/sqlserver-dataprovider@5.3.1
- @memberjunction/server-bootstrap-lite@5.3.1
- @memberjunction/testing-cli@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [24d54d2]
  - @memberjunction/codegen-lib@5.3.0
  - @memberjunction/metadata-sync@5.3.0
  - @memberjunction/ai-cli@5.3.0
  - @memberjunction/server-bootstrap-lite@5.3.0
  - @memberjunction/query-gen@5.3.0
  - @memberjunction/sqlserver-dataprovider@5.3.0
  - @memberjunction/testing-cli@5.3.0
  - @memberjunction/db-auto-doc@5.3.0
  - @memberjunction/config@5.3.0
  - @memberjunction/core@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
- Updated dependencies [8d26189]
  - @memberjunction/codegen-lib@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/server-bootstrap-lite@5.2.0
  - @memberjunction/sqlserver-dataprovider@5.2.0
  - @memberjunction/query-gen@5.2.0
  - @memberjunction/ai-cli@5.2.0
  - @memberjunction/metadata-sync@5.2.0
  - @memberjunction/testing-cli@5.2.0
  - @memberjunction/db-auto-doc@5.2.0
  - @memberjunction/config@5.2.0

## 5.1.0

### Minor Changes

- 61079e9: Add Open App system for installing, managing, and removing third-party apps via `mj app` CLI commands. Includes manifest validation, dependency resolution, schema isolation, migration execution, npm package management, and config-manager integration.

### Patch Changes

- Updated dependencies [f426d43]
- Updated dependencies [ae7e9e7]
  - @memberjunction/codegen-lib@5.1.0
  - @memberjunction/server-bootstrap-lite@5.1.0
  - @memberjunction/metadata-sync@5.1.0
  - @memberjunction/db-auto-doc@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/query-gen@5.1.0
  - @memberjunction/sqlserver-dataprovider@5.1.0
  - @memberjunction/testing-cli@5.1.0
  - @memberjunction/ai-cli@5.1.0
  - @memberjunction/config@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- 93e1367: Replace flyway with skyway
- Updated dependencies [737b56b]
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/server-bootstrap-lite@5.0.0
  - @memberjunction/core@5.0.0
  - @memberjunction/sqlserver-dataprovider@5.0.0
  - @memberjunction/ai-cli@5.0.0
  - @memberjunction/codegen-lib@5.0.0
  - @memberjunction/config@5.0.0
  - @memberjunction/db-auto-doc@5.0.0
  - @memberjunction/metadata-sync@5.0.0
  - @memberjunction/query-gen@5.0.0
  - @memberjunction/testing-cli@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-cli@4.4.0
  - @memberjunction/codegen-lib@4.4.0
  - @memberjunction/db-auto-doc@4.4.0
  - @memberjunction/metadata-sync@4.4.0
  - @memberjunction/query-gen@4.4.0
  - @memberjunction/sqlserver-dataprovider@4.4.0
  - @memberjunction/server-bootstrap-lite@4.4.0
  - @memberjunction/testing-cli@4.4.0
  - @memberjunction/config@4.4.0

## 4.3.1

### Patch Changes

- f1b4a98: Restore singleton packages as regular dependencies in Angular Bootstrap and Explorer packages, and fix false positive error detection in CLI migrate command.
- 690f6e0: no migration
- Updated dependencies [86f6f48]
- Updated dependencies [690f6e0]
  - @memberjunction/codegen-lib@4.3.1
  - @memberjunction/ai-cli@4.3.1
  - @memberjunction/testing-cli@4.3.1
  - @memberjunction/config@4.3.1
  - @memberjunction/db-auto-doc@4.3.1
  - @memberjunction/core@4.3.1
  - @memberjunction/metadata-sync@4.3.1
  - @memberjunction/query-gen@4.3.1
  - @memberjunction/sqlserver-dataprovider@4.3.1
  - @memberjunction/server-bootstrap-lite@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/ai-cli@4.3.0
  - @memberjunction/server-bootstrap-lite@4.3.0
  - @memberjunction/metadata-sync@4.3.0
  - @memberjunction/codegen-lib@4.3.0
  - @memberjunction/db-auto-doc@4.3.0
  - @memberjunction/query-gen@4.3.0
  - @memberjunction/sqlserver-dataprovider@4.3.0
  - @memberjunction/testing-cli@4.3.0
  - @memberjunction/config@4.3.0

## 4.2.0

### Patch Changes

- Updated dependencies [65ac988]
  - @memberjunction/codegen-lib@4.2.0
  - @memberjunction/ai-cli@4.2.0
  - @memberjunction/config@4.2.0
  - @memberjunction/db-auto-doc@4.2.0
  - @memberjunction/core@4.2.0
  - @memberjunction/metadata-sync@4.2.0
  - @memberjunction/query-gen@4.2.0
  - @memberjunction/sqlserver-dataprovider@4.2.0
  - @memberjunction/server-bootstrap-lite@4.2.0
  - @memberjunction/testing-cli@4.2.0

## 4.1.0

### Patch Changes

- 77839a9: Enable cascade deletes for AI Agent and Prompt entities, add cross-file dependency detection and --delete-db-only flag to MetadataSync for proper deletion ordering, fix CodeGen duplicate variable names for self-referential FKs, add requireConnectivity config to QueryGen, and add Gemini JSON parser support to DBAutoDoc.
- 9fab8ca: ESM Compatibility
- Updated dependencies [f54a9e4]
- Updated dependencies [77839a9]
- Updated dependencies [9fab8ca]
- Updated dependencies [5af036f]
  - @memberjunction/sqlserver-dataprovider@4.1.0
  - @memberjunction/core@4.1.0
  - @memberjunction/codegen-lib@4.1.0
  - @memberjunction/db-auto-doc@4.1.0
  - @memberjunction/metadata-sync@4.1.0
  - @memberjunction/query-gen@4.1.0
  - @memberjunction/server-bootstrap-lite@4.1.0
  - @memberjunction/ai-cli@4.1.0
  - @memberjunction/testing-cli@4.1.0
  - @memberjunction/config@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- e9659be: Fix build error and eliminate warnings.
- Updated dependencies [e9659be]
- Updated dependencies [65b4274]
- Updated dependencies [8366d44]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/metadata-sync@4.0.0
  - @memberjunction/sqlserver-dataprovider@4.0.0
  - @memberjunction/ai-cli@4.0.0
  - @memberjunction/codegen-lib@4.0.0
  - @memberjunction/config@4.0.0
  - @memberjunction/db-auto-doc@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/query-gen@4.0.0
  - @memberjunction/testing-cli@4.0.0
  - @memberjunction/server-bootstrap-lite@4.0.0

## 3.4.0

### Minor Changes

- 3a71e4e: Fix large text field corruptions, cross-platform improvements, more robust environment variable parsing for boolean values

### Patch Changes

- b0944c9: Add multi-schema support with configurable schema placeholders to MJCLI migrate command, add configurable entity package name to CodeGen, and fix node-flyway diagnostic issues
- e552e5f: no migration
- Updated dependencies [b0944c9]
- Updated dependencies [3a71e4e]
- Updated dependencies [18b4e65]
- Updated dependencies [e552e5f]
- Updated dependencies [38d9596]
- Updated dependencies [a3961d5]
  - @memberjunction/codegen-lib@3.4.0
  - @memberjunction/sqlserver-dataprovider@3.4.0
  - @memberjunction/metadata-sync@3.4.0
  - @memberjunction/db-auto-doc@3.4.0
  - @memberjunction/query-gen@3.4.0
  - @memberjunction/config@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/ai-cli@3.4.0
  - @memberjunction/testing-cli@3.4.0

## 3.3.0

### Patch Changes

- @memberjunction/ai-cli@3.3.0
- @memberjunction/codegen-lib@3.3.0
- @memberjunction/metadata-sync@3.3.0
- @memberjunction/query-gen@3.3.0
- @memberjunction/sqlserver-dataprovider@3.3.0
- @memberjunction/testing-cli@3.3.0
- @memberjunction/db-auto-doc@3.3.0
- @memberjunction/config@3.3.0
- @memberjunction/core@3.3.0

## 3.2.0

### Patch Changes

- 011c820: Improve migration error diagnostics and fix parent agent chat handling to respect sub-agent responses
- Updated dependencies [cbd2714]
- Updated dependencies [454d2dd]
  - @memberjunction/metadata-sync@3.2.0
  - @memberjunction/db-auto-doc@3.2.0
  - @memberjunction/ai-cli@3.2.0
  - @memberjunction/codegen-lib@3.2.0
  - @memberjunction/query-gen@3.2.0
  - @memberjunction/sqlserver-dataprovider@3.2.0
  - @memberjunction/testing-cli@3.2.0
  - @memberjunction/config@3.2.0
  - @memberjunction/core@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/metadata-sync@3.1.1
- @memberjunction/ai-cli@3.1.1
- @memberjunction/codegen-lib@3.1.1
- @memberjunction/config@3.1.1
- @memberjunction/db-auto-doc@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/query-gen@3.1.1
- @memberjunction/sqlserver-dataprovider@3.1.1
- @memberjunction/testing-cli@3.1.1

## 3.0.0

### Major Changes

- f25f757: The foundation for MemberJunction v3.0's improved architecture, making it easier for developers to adopt and customize MJ for their needs.

### Patch Changes

- 736e035: Point to the correct version of the v3 baseline db migration script
- Updated dependencies [f25f757]
  - @memberjunction/metadata-sync@3.0.0
  - @memberjunction/codegen-lib@3.0.0
  - @memberjunction/config@3.0.0
  - @memberjunction/ai-cli@3.0.0
  - @memberjunction/db-auto-doc@3.0.0
  - @memberjunction/core@3.0.0
  - @memberjunction/query-gen@3.0.0
  - @memberjunction/sqlserver-dataprovider@3.0.0
  - @memberjunction/testing-cli@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/ai-cli@2.133.0
  - @memberjunction/codegen-lib@2.133.0
  - @memberjunction/db-auto-doc@2.133.0
  - @memberjunction/metadata-sync@2.133.0
  - @memberjunction/query-gen@2.133.0
  - @memberjunction/sqlserver-dataprovider@2.133.0
  - @memberjunction/testing-cli@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/ai-cli@2.132.0
  - @memberjunction/codegen-lib@2.132.0
  - @memberjunction/db-auto-doc@2.132.0
  - @memberjunction/metadata-sync@2.132.0
  - @memberjunction/query-gen@2.132.0
  - @memberjunction/sqlserver-dataprovider@2.132.0
  - @memberjunction/testing-cli@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/metadata-sync@2.131.0
  - @memberjunction/ai-cli@2.131.0
  - @memberjunction/codegen-lib@2.131.0
  - @memberjunction/db-auto-doc@2.131.0
  - @memberjunction/query-gen@2.131.0
  - @memberjunction/sqlserver-dataprovider@2.131.0
  - @memberjunction/testing-cli@2.131.0

## 2.130.1

### Patch Changes

- Updated dependencies [8884553]
- Updated dependencies [cdea2b7]
  - @memberjunction/db-auto-doc@2.130.1
  - @memberjunction/metadata-sync@2.130.1
  - @memberjunction/ai-cli@2.130.1
  - @memberjunction/codegen-lib@2.130.1
  - @memberjunction/core@2.130.1
  - @memberjunction/query-gen@2.130.1
  - @memberjunction/sqlserver-dataprovider@2.130.1
  - @memberjunction/testing-cli@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/sqlserver-dataprovider@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/metadata-sync@2.130.0
  - @memberjunction/ai-cli@2.130.0
  - @memberjunction/codegen-lib@2.130.0
  - @memberjunction/db-auto-doc@2.130.0
  - @memberjunction/query-gen@2.130.0
  - @memberjunction/testing-cli@2.130.0

## 2.129.0

### Minor Changes

- 8e2ec79: migration

### Patch Changes

- Updated dependencies [20c360f]
- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [0fb62af]
- Updated dependencies [b684942]
- Updated dependencies [8e2ec79]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/metadata-sync@2.129.0
  - @memberjunction/core@2.129.0
  - @memberjunction/sqlserver-dataprovider@2.129.0
  - @memberjunction/codegen-lib@2.129.0
  - @memberjunction/ai-cli@2.129.0
  - @memberjunction/db-auto-doc@2.129.0
  - @memberjunction/query-gen@2.129.0
  - @memberjunction/testing-cli@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
  - @memberjunction/core@2.128.0
  - @memberjunction/ai-cli@2.128.0
  - @memberjunction/codegen-lib@2.128.0
  - @memberjunction/db-auto-doc@2.128.0
  - @memberjunction/metadata-sync@2.128.0
  - @memberjunction/query-gen@2.128.0
  - @memberjunction/sqlserver-dataprovider@2.128.0
  - @memberjunction/testing-cli@2.128.0

## 2.127.0

### Patch Changes

- b748848: Add Gemini 3 Flash and GPT-5.2 AI models, enhance QueryGen with graph-based entity targeting, AI-powered semantic query naming, and optional external SQL file generation
- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/core@2.127.0
  - @memberjunction/query-gen@2.127.0
  - @memberjunction/ai-cli@2.127.0
  - @memberjunction/codegen-lib@2.127.0
  - @memberjunction/db-auto-doc@2.127.0
  - @memberjunction/metadata-sync@2.127.0
  - @memberjunction/sqlserver-dataprovider@2.127.0
  - @memberjunction/testing-cli@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/metadata-sync@2.126.1
- @memberjunction/ai-cli@2.126.1
- @memberjunction/codegen-lib@2.126.1
- @memberjunction/db-auto-doc@2.126.1
- @memberjunction/core@2.126.1
- @memberjunction/query-gen@2.126.1
- @memberjunction/sqlserver-dataprovider@2.126.1
- @memberjunction/testing-cli@2.126.1

## 2.126.0

### Patch Changes

- 142c950: Add new QueryGen package for AI-powered SQL query generation with retry mechanisms, vector similarity search, entity grouping, query validation and refinement, hierarchical category management, and configurable metadata export
- Updated dependencies [eae1a1f]
- Updated dependencies [142c950]
- Updated dependencies [703221e]
  - @memberjunction/db-auto-doc@2.126.0
  - @memberjunction/query-gen@2.126.0
  - @memberjunction/core@2.126.0
  - @memberjunction/ai-cli@2.126.0
  - @memberjunction/codegen-lib@2.126.0
  - @memberjunction/metadata-sync@2.126.0
  - @memberjunction/sqlserver-dataprovider@2.126.0
  - @memberjunction/testing-cli@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/ai-cli@2.125.0
  - @memberjunction/codegen-lib@2.125.0
  - @memberjunction/db-auto-doc@2.125.0
  - @memberjunction/metadata-sync@2.125.0
  - @memberjunction/sqlserver-dataprovider@2.125.0
  - @memberjunction/testing-cli@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
- Updated dependencies [4be0ffa]
  - @memberjunction/core@2.124.0
  - @memberjunction/metadata-sync@2.124.0
  - @memberjunction/ai-cli@2.124.0
  - @memberjunction/codegen-lib@2.124.0
  - @memberjunction/db-auto-doc@2.124.0
  - @memberjunction/sqlserver-dataprovider@2.124.0
  - @memberjunction/testing-cli@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai-cli@2.123.1
- @memberjunction/codegen-lib@2.123.1
- @memberjunction/db-auto-doc@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/metadata-sync@2.123.1
- @memberjunction/sqlserver-dataprovider@2.123.1
- @memberjunction/testing-cli@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/ai-cli@2.123.0
- @memberjunction/codegen-lib@2.123.0
- @memberjunction/testing-cli@2.123.0
- @memberjunction/sqlserver-dataprovider@2.123.0
- @memberjunction/metadata-sync@2.123.0
- @memberjunction/db-auto-doc@2.123.0
- @memberjunction/core@2.123.0

## 2.122.2

### Patch Changes

- Updated dependencies [81f0c44]
  - @memberjunction/ai-cli@2.122.2
  - @memberjunction/codegen-lib@2.122.2
  - @memberjunction/db-auto-doc@2.122.2
  - @memberjunction/metadata-sync@2.122.2
  - @memberjunction/sqlserver-dataprovider@2.122.2
  - @memberjunction/testing-cli@2.122.2
  - @memberjunction/core@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/ai-cli@2.122.1
- @memberjunction/codegen-lib@2.122.1
- @memberjunction/db-auto-doc@2.122.1
- @memberjunction/core@2.122.1
- @memberjunction/metadata-sync@2.122.1
- @memberjunction/sqlserver-dataprovider@2.122.1
- @memberjunction/testing-cli@2.122.1

## 2.122.0

### Patch Changes

- 6de83ec: Add component linter enhancements with type inference and control flow analysis, DBAutoDoc query generation features, MCP server diagnostic tools, metadata sync improvements, and enhanced JWKS client with HTTP keep-alive connections and connection pooling to prevent socket hangups
- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
- Updated dependencies [390070c]
  - @memberjunction/core@2.122.0
  - @memberjunction/db-auto-doc@2.122.0
  - @memberjunction/metadata-sync@2.122.0
  - @memberjunction/sqlserver-dataprovider@2.122.0
  - @memberjunction/codegen-lib@2.122.0
  - @memberjunction/ai-cli@2.122.0
  - @memberjunction/testing-cli@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/db-auto-doc@2.121.0
  - @memberjunction/ai-cli@2.121.0
  - @memberjunction/codegen-lib@2.121.0
  - @memberjunction/metadata-sync@2.121.0
  - @memberjunction/sqlserver-dataprovider@2.121.0
  - @memberjunction/testing-cli@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/ai-cli@2.120.0
  - @memberjunction/codegen-lib@2.120.0
  - @memberjunction/metadata-sync@2.120.0
  - @memberjunction/sqlserver-dataprovider@2.120.0
  - @memberjunction/testing-cli@2.120.0
  - @memberjunction/db-auto-doc@2.120.0

## 2.119.0

### Patch Changes

- ed2394c: Add sample query generation feature with configurable maxTokens and maxTables options, fix config validation errors for commands that don't need database connection, and update DBAutoDoc documentation
- Updated dependencies [7dd7cca]
- Updated dependencies [ed2394c]
- Updated dependencies [139fd77]
- Updated dependencies [0a133df]
  - @memberjunction/core@2.119.0
  - @memberjunction/codegen-lib@2.119.0
  - @memberjunction/db-auto-doc@2.119.0
  - @memberjunction/ai-cli@2.119.0
  - @memberjunction/metadata-sync@2.119.0
  - @memberjunction/sqlserver-dataprovider@2.119.0
  - @memberjunction/testing-cli@2.119.0

## 2.118.0

### Minor Changes

- a49a7a8: migration

### Patch Changes

- Updated dependencies [a2901ff]
- Updated dependencies [a49a7a8]
- Updated dependencies [41c5b8d]
- Updated dependencies [78721d8]
- Updated dependencies [1bb5c29]
  - @memberjunction/db-auto-doc@2.118.0
  - @memberjunction/testing-cli@2.118.0
  - @memberjunction/metadata-sync@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/ai-cli@2.118.0
  - @memberjunction/codegen-lib@2.118.0
  - @memberjunction/sqlserver-dataprovider@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [8c092ec]
- Updated dependencies [24b0734]
  - @memberjunction/core@2.117.0
  - @memberjunction/codegen-lib@2.117.0
  - @memberjunction/ai-cli@2.117.0
  - @memberjunction/metadata-sync@2.117.0
  - @memberjunction/sqlserver-dataprovider@2.117.0
  - @memberjunction/db-auto-doc@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [723a32d]
- Updated dependencies [81bb7a4]
- Updated dependencies [a860a7d]
- Updated dependencies [85542e4]
  - @memberjunction/codegen-lib@2.116.0
  - @memberjunction/core@2.116.0
  - @memberjunction/ai-cli@2.116.0
  - @memberjunction/metadata-sync@2.116.0
  - @memberjunction/sqlserver-dataprovider@2.116.0
  - @memberjunction/db-auto-doc@2.116.0

## 2.115.0

### Patch Changes

- Updated dependencies [c29e21b]
  - @memberjunction/codegen-lib@2.115.0
  - @memberjunction/ai-cli@2.115.0
  - @memberjunction/sqlserver-dataprovider@2.115.0
  - @memberjunction/metadata-sync@2.115.0
  - @memberjunction/db-auto-doc@2.115.0
  - @memberjunction/core@2.115.0

## 2.114.0

### Patch Changes

- Updated dependencies [8f91cbe]
  - @memberjunction/codegen-lib@2.114.0
  - @memberjunction/ai-cli@2.114.0
  - @memberjunction/db-auto-doc@2.114.0
  - @memberjunction/core@2.114.0
  - @memberjunction/metadata-sync@2.114.0
  - @memberjunction/sqlserver-dataprovider@2.114.0

## 2.113.2

### Patch Changes

- @memberjunction/ai-cli@2.113.2
- @memberjunction/codegen-lib@2.113.2
- @memberjunction/metadata-sync@2.113.2
- @memberjunction/sqlserver-dataprovider@2.113.2
- @memberjunction/db-auto-doc@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [e237ca9]
  - @memberjunction/sqlserver-dataprovider@2.112.0
  - @memberjunction/ai-cli@2.112.0
  - @memberjunction/codegen-lib@2.112.0
  - @memberjunction/metadata-sync@2.112.0
  - @memberjunction/db-auto-doc@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ai-cli@2.110.1
- @memberjunction/codegen-lib@2.110.1
- @memberjunction/db-auto-doc@2.110.1
- @memberjunction/metadata-sync@2.110.1
- @memberjunction/sqlserver-dataprovider@2.110.1

## 2.110.0

### Patch Changes

- Updated dependencies [02d72ff]
  - @memberjunction/sqlserver-dataprovider@2.110.0
  - @memberjunction/codegen-lib@2.110.0
  - @memberjunction/ai-cli@2.110.0
  - @memberjunction/metadata-sync@2.110.0
  - @memberjunction/db-auto-doc@2.110.0

## 2.109.0

### Patch Changes

- Updated dependencies [1c155fb]
  - @memberjunction/metadata-sync@2.109.0
  - @memberjunction/ai-cli@2.109.0
  - @memberjunction/codegen-lib@2.109.0
  - @memberjunction/sqlserver-dataprovider@2.109.0
  - @memberjunction/db-auto-doc@2.109.0

## 2.108.0

### Patch Changes

- 1fa712a: Add improved logging for individual record errors.
- Updated dependencies [1fa712a]
- Updated dependencies [8a53629]
  - @memberjunction/metadata-sync@2.108.0
  - @memberjunction/ai-cli@2.108.0
  - @memberjunction/codegen-lib@2.108.0
  - @memberjunction/sqlserver-dataprovider@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/ai-cli@2.107.0
- @memberjunction/codegen-lib@2.107.0
- @memberjunction/metadata-sync@2.107.0
- @memberjunction/sqlserver-dataprovider@2.107.0

## 2.106.0

### Patch Changes

- Updated dependencies [3ca1b36]
  - @memberjunction/codegen-lib@2.106.0
  - @memberjunction/metadata-sync@2.106.0
  - @memberjunction/ai-cli@2.106.0
  - @memberjunction/sqlserver-dataprovider@2.106.0

## 2.105.0

### Patch Changes

- 9b67e0c: This release addresses critical stability issues across build processes, runtime execution, and AI model management in the MemberJunction platform. The changes focus on three main areas: production build reliability, database migration consistency, and intelligent AI error handling.

  Resolved critical issues where Angular production builds with optimization enabled would remove essential classes through aggressive tree-shaking. Moved `TemplateEntityExtended` to `@memberjunction/core-entities` and created new `@memberjunction/ai-provider-bundle` package to centralize AI provider loading while maintaining clean separation between core infrastructure and provider implementations. Added `LoadEntityCommunicationsEngineClient()` calls to prevent removal of inherited singleton methods. These changes prevent runtime errors in production deployments where previously registered classes would become inaccessible, while improving architectural separation of concerns.

  Enhanced CodeGen SQL generation to use `IF OBJECT_ID()` patterns instead of `DROP ... IF EXISTS` syntax, fixing silent failures with Flyway placeholder substitution. Improved validator generation to properly handle nullable fields and correctly set `result.Success` status. Centralized GraphQL type name generation using schema-aware naming (`{schema}_{basetable}_`) to eliminate type collisions between entities with identical base table names across different schemas. These changes ensure reliable database migrations and prevent recurring cascade delete regressions.

  Implemented sophisticated error classification with new `NoCredit` error type for billing failures, message-first error detection, and permissive failover for 403 errors. Added hierarchical configuration-aware failover that respects configuration boundaries (Production vs Development models) while maintaining candidate list caching for performance. Enhanced error analysis to properly classify credit/quota issues and enable appropriate failover behavior.

  Improved model selection caching by checking all candidates for valid API keys instead of stopping at first match, ensuring retry logic has access to complete list of viable model/vendor combinations. Added `extractValidCandidates()` method to `AIModelSelectionInfo` class and `buildCandidatesFromSelectionInfo()` helper to properly reconstruct candidate lists from selection metadata during hierarchical template execution.

  Enhanced error-based retry and failover with intelligent handling for authentication and rate limit errors. Authentication errors now trigger vendor-level filtering (excluding all models from vendors with invalid API keys) and immediate failover to different vendors. Rate limit errors now retry the same model/vendor using configurable `MaxRetries` (default: 3) with backoff delay based on `RetryStrategy` (Fixed/Linear/Exponential) before failing over. Improved log messages with human-readable formatting showing model/vendor names, time in seconds, and clear status indicators. Fixed MJCLI sync commands to properly propagate exit codes for CI/CD integration.

- Updated dependencies [dc50349]
- Updated dependencies [9b67e0c]
- Updated dependencies [f215288]
  - @memberjunction/codegen-lib@2.105.0
  - @memberjunction/sqlserver-dataprovider@2.105.0
  - @memberjunction/ai-cli@2.105.0
  - @memberjunction/metadata-sync@2.105.0

## 2.104.0

### Patch Changes

- 3f71ef4: Add new storage actions and external API integrations
  - Add 13 individual file storage actions
  - Add Gamma API integration for AI-powered presentation generation
  - Add Perplexity Search action for AI-powered web search with
    citations
  - Add centralized configuration system for MJStorage drivers and
    Core Actions
  - Complete Box SDK v10 migration for BoxFileStorage driver
  - Fix Box storage driver API endpoint errors (405 Method Not
    Allowed)
  - Fix CLI action parameter passing bug

- Updated dependencies [883933e]
- Updated dependencies [6e7f14a]
  - @memberjunction/codegen-lib@2.104.0
  - @memberjunction/sqlserver-dataprovider@2.104.0
  - @memberjunction/ai-cli@2.104.0
  - @memberjunction/metadata-sync@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- fcdc151: Modified bump command to skip core and global when bumping versions. Core and Global will be pinned at v2.100.3.
- Updated dependencies [addf572]
  - @memberjunction/sqlserver-dataprovider@2.103.0
  - @memberjunction/metadata-sync@2.103.0
  - @memberjunction/codegen-lib@2.103.0
  - @memberjunction/ai-cli@2.103.0

## 2.100.3

### Patch Changes

- Updated dependencies [30afb26]
  - @memberjunction/metadata-sync@2.100.3
  - @memberjunction/ai-cli@2.100.3
  - @memberjunction/codegen-lib@2.100.3
  - @memberjunction/sqlserver-dataprovider@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/ai-cli@2.100.2
- @memberjunction/codegen-lib@2.100.2
- @memberjunction/metadata-sync@2.100.2
- @memberjunction/sqlserver-dataprovider@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/ai-cli@2.100.1
- @memberjunction/codegen-lib@2.100.1
- @memberjunction/metadata-sync@2.100.1
- @memberjunction/sqlserver-dataprovider@2.100.1

## 2.100.0

### Patch Changes

- @memberjunction/ai-cli@2.100.0
- @memberjunction/codegen-lib@2.100.0
- @memberjunction/metadata-sync@2.100.0
- @memberjunction/sqlserver-dataprovider@2.100.0

## 2.99.0

### Patch Changes

- @memberjunction/ai-cli@2.99.0
- @memberjunction/codegen-lib@2.99.0
- @memberjunction/metadata-sync@2.99.0
- @memberjunction/sqlserver-dataprovider@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/ai-cli@2.98.0
- @memberjunction/codegen-lib@2.98.0
- @memberjunction/metadata-sync@2.98.0
- @memberjunction/sqlserver-dataprovider@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/ai-cli@2.97.0
- @memberjunction/codegen-lib@2.97.0
- @memberjunction/metadata-sync@2.97.0
- @memberjunction/sqlserver-dataprovider@2.97.0

## 2.96.0

### Patch Changes

- d7b5647: feat(metadata-sync): add deleteRecord feature for removing records via sync
  - Added deleteRecord directive to mark records for deletion in JSON files
  - Records with deleteRecord.delete=true are deleted during push operations
  - After successful deletion, adds deletedAt timestamp to track when deleted

- Updated dependencies [d7b5647]
- Updated dependencies [8e1c946]
  - @memberjunction/metadata-sync@2.96.0
  - @memberjunction/ai-cli@2.96.0
  - @memberjunction/codegen-lib@2.96.0
  - @memberjunction/sqlserver-dataprovider@2.96.0

## 2.95.0

### Patch Changes

- @memberjunction/ai-cli@2.95.0
- @memberjunction/codegen-lib@2.95.0
- @memberjunction/metadata-sync@2.95.0
- @memberjunction/sqlserver-dataprovider@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/ai-cli@2.94.0
- @memberjunction/codegen-lib@2.94.0
- @memberjunction/metadata-sync@2.94.0
- @memberjunction/sqlserver-dataprovider@2.94.0

## 2.93.0

### Patch Changes

- Updated dependencies [f8757aa]
- Updated dependencies [103e4a9]
  - @memberjunction/sqlserver-dataprovider@2.93.0
  - @memberjunction/metadata-sync@2.93.0
  - @memberjunction/codegen-lib@2.93.0
  - @memberjunction/ai-cli@2.93.0

## 2.92.0

### Patch Changes

- Updated dependencies [8fb03df]
  - @memberjunction/sqlserver-dataprovider@2.92.0
  - @memberjunction/ai-cli@2.92.0
  - @memberjunction/codegen-lib@2.92.0
  - @memberjunction/metadata-sync@2.92.0

## 2.91.0

### Patch Changes

- Updated dependencies [70bf265]
  - @memberjunction/codegen-lib@2.91.0
  - @memberjunction/ai-cli@2.91.0
  - @memberjunction/metadata-sync@2.91.0
  - @memberjunction/sqlserver-dataprovider@2.91.0

## 2.90.0

### Patch Changes

- @memberjunction/codegen-lib@2.90.0
- @memberjunction/sqlserver-dataprovider@2.90.0
- @memberjunction/ai-cli@2.90.0
- @memberjunction/metadata-sync@2.90.0

## 2.89.0

### Patch Changes

- Updated dependencies [34d456e]
  - @memberjunction/sqlserver-dataprovider@2.89.0
  - @memberjunction/ai-cli@2.89.0
  - @memberjunction/codegen-lib@2.89.0
  - @memberjunction/metadata-sync@2.89.0

## 2.88.0

### Patch Changes

- Updated dependencies [56257ed]
  - @memberjunction/sqlserver-dataprovider@2.88.0
  - @memberjunction/ai-cli@2.88.0
  - @memberjunction/codegen-lib@2.88.0
  - @memberjunction/metadata-sync@2.88.0

## 2.87.0

### Patch Changes

- @memberjunction/ai-cli@2.87.0
- @memberjunction/codegen-lib@2.87.0
- @memberjunction/metadata-sync@2.87.0
- @memberjunction/sqlserver-dataprovider@2.87.0

## 2.86.0

### Patch Changes

- Updated dependencies [7675555]
  - @memberjunction/metadata-sync@2.86.0
  - @memberjunction/ai-cli@2.86.0
  - @memberjunction/codegen-lib@2.86.0
  - @memberjunction/sqlserver-dataprovider@2.86.0

## 2.85.0

### Patch Changes

- Updated dependencies [9b74582]
  - @memberjunction/metadata-sync@2.85.0
  - @memberjunction/ai-cli@2.85.0
  - @memberjunction/codegen-lib@2.85.0
  - @memberjunction/sqlserver-dataprovider@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [0b9d691]
  - @memberjunction/sqlserver-dataprovider@2.84.0
  - @memberjunction/ai-cli@2.84.0
  - @memberjunction/codegen-lib@2.84.0
  - @memberjunction/metadata-sync@2.84.0

## 2.83.0

### Patch Changes

- @memberjunction/ai-cli@2.83.0
- @memberjunction/codegen-lib@2.83.0
- @memberjunction/metadata-sync@2.83.0
- @memberjunction/sqlserver-dataprovider@2.83.0

## 2.82.0

### Patch Changes

- Updated dependencies [2ebf9c7]
  - @memberjunction/codegen-lib@2.82.0
  - @memberjunction/metadata-sync@2.82.0
  - @memberjunction/ai-cli@2.82.0
  - @memberjunction/sqlserver-dataprovider@2.82.0

## 2.81.0

### Patch Changes

- Updated dependencies [6d2d478]
- Updated dependencies [76cf3e3]
- Updated dependencies [971c5d4]
  - @memberjunction/codegen-lib@2.81.0
  - @memberjunction/sqlserver-dataprovider@2.81.0
  - @memberjunction/ai-cli@2.81.0
  - @memberjunction/metadata-sync@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/ai-cli@2.80.1
- @memberjunction/codegen-lib@2.80.1
- @memberjunction/metadata-sync@2.80.1
- @memberjunction/sqlserver-dataprovider@2.80.1

## 2.80.0

### Patch Changes

- Updated dependencies [7c5f844]
  - @memberjunction/sqlserver-dataprovider@2.80.0
  - @memberjunction/ai-cli@2.80.0
  - @memberjunction/codegen-lib@2.80.0
  - @memberjunction/metadata-sync@2.80.0

## 2.79.0

### Patch Changes

- @memberjunction/ai-cli@2.79.0
- @memberjunction/codegen-lib@2.79.0
- @memberjunction/metadata-sync@2.79.0
- @memberjunction/sqlserver-dataprovider@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [ef7c014]
- Updated dependencies [d9abd67]
- Updated dependencies [4652675]
  - @memberjunction/ai-cli@2.78.0
  - @memberjunction/codegen-lib@2.78.0
  - @memberjunction/sqlserver-dataprovider@2.78.0
  - @memberjunction/metadata-sync@2.78.0

## 2.77.0

### Patch Changes

- Updated dependencies [476a458]
- Updated dependencies [d8f14a2]
- Updated dependencies [8ee0d86]
- Updated dependencies [c91269e]
  - @memberjunction/sqlserver-dataprovider@2.77.0
  - @memberjunction/codegen-lib@2.77.0
  - @memberjunction/metadata-sync@2.77.0

## 2.76.0

### Patch Changes

- Updated dependencies [7dabb22]
  - @memberjunction/sqlserver-dataprovider@2.76.0
  - @memberjunction/metadata-sync@2.76.0
  - @memberjunction/codegen-lib@2.76.0

## 2.75.0

### Patch Changes

- Updated dependencies [9ccd145]
- Updated dependencies [4ee29f2]
  - @memberjunction/codegen-lib@2.75.0
  - @memberjunction/metadata-sync@2.75.0
  - @memberjunction/sqlserver-dataprovider@2.75.0

## 2.74.0

### Patch Changes

- Updated dependencies [b70301e]
  - @memberjunction/codegen-lib@2.74.0
  - @memberjunction/metadata-sync@2.74.0
  - @memberjunction/sqlserver-dataprovider@2.74.0

## 2.73.0

### Patch Changes

- @memberjunction/codegen-lib@2.73.0
- @memberjunction/sqlserver-dataprovider@2.73.0
- @memberjunction/metadata-sync@2.73.0

## 2.72.0

### Patch Changes

- @memberjunction/codegen-lib@2.72.0
- @memberjunction/metadata-sync@2.72.0
- @memberjunction/sqlserver-dataprovider@2.72.0

## 2.71.0

### Patch Changes

- e75f0a4: Major AI Agent and AI Prompt Management Enhancements
  - **AI Agent Forms**: Complete redesign with comprehensive sub-agent creation, advanced settings management, and transaction-based persistence
  - **AI Prompt Forms**: Implemented atomic "Create New Prompt" feature with template linking and proper MemberJunction navigation
  - **User Permissions**: Added comprehensive user permission reflection across AI forms and dashboards
  - **UX Improvements**: Enhanced prompt selector with visual indicators for already linked prompts, proper cancel/revert functionality
  - **Template Management**: Resolved template management issues with improved template editor and selector dialogs
  - **Sub-Agent System**: Full implementation of sub-agent selector with deferred transactions and database constraint compliance
  - **Advanced Settings**: New dialogs for AI Agent prompts, sub-agents, and actions with modern UI components
  - **CLI**: Fixed AUTH0 environment variable casing in install command

  This release significantly improves the AI management experience with better transaction handling, user permissions, and modern UI components.

- 5a127bb: Remove status badge dots
- Updated dependencies [5a127bb]
  - @memberjunction/codegen-lib@2.71.0
  - @memberjunction/metadata-sync@2.71.0
  - @memberjunction/sqlserver-dataprovider@2.71.0

## 2.70.0

### Patch Changes

- @memberjunction/codegen-lib@2.70.0
- @memberjunction/metadata-sync@2.70.0
- @memberjunction/sqlserver-dataprovider@2.70.0

## 2.69.1

### Patch Changes

- @memberjunction/codegen-lib@2.69.1
- @memberjunction/metadata-sync@2.69.1
- @memberjunction/sqlserver-dataprovider@2.69.1

## 2.69.0

### Patch Changes

- @memberjunction/codegen-lib@2.69.0
- @memberjunction/metadata-sync@2.69.0
- @memberjunction/sqlserver-dataprovider@2.69.0

## 2.68.0

### Patch Changes

- 035690c: MetadataSync pull operations major improvements
  - **JSON Property Ordering**: Fixed inconsistent JSON property ordering
    across metadata files by implementing JsonWriteHelper with
    deterministic serialization
  - **File Write Batching**: Replaced individual file writes with
    batching system for 90% performance improvement and eliminated write
    conflicts
  - **RelatedEntities Support**: Added complete support for pulling
    related entities as embedded collections with foreign key references
    (@parent:ID syntax)
  - **Field Configuration Options**:
    - Added `ignoreNullFields` option to exclude null values during pull
      operations
    - Added `ignoreVirtualFields` option to exclude virtual fields from
      pulled data
  - **ExternalizeFields Implementation**: Complete field externalization
    functionality with:
    - Configurable file patterns with placeholders ({Name}, {ID}, etc.)
    - Smart merge strategy support preserving existing @file: references
    - Enhanced checksum calculation including external file content
    - Automatic JSON formatting and filename sanitization

  - **Change Detection**: Fixed checksum calculation for related entities
    to prevent unnecessary timestamp updates
  - **Bug Fixes**: Resolved critical issue where new record operations
    overwrote existing record updates in batch system

  These improvements provide robust, performant, and feature-complete
  metadata synchronization with proper change tracking and file
  organization.

- Updated dependencies [035690c]
- Updated dependencies [a6b43d0]
- Updated dependencies [23250f1]
- Updated dependencies [732c04a]
  - @memberjunction/metadata-sync@2.68.0
  - @memberjunction/sqlserver-dataprovider@2.68.0
  - @memberjunction/codegen-lib@2.68.0

## 2.67.0

### Patch Changes

- Updated dependencies [1fbfc26]
  - @memberjunction/sqlserver-dataprovider@2.67.0
  - @memberjunction/codegen-lib@2.67.0
  - @memberjunction/metadata-sync@2.67.0

## 2.66.0

### Patch Changes

- Updated dependencies [7e22e3e]
  - @memberjunction/codegen-lib@2.66.0
  - @memberjunction/sqlserver-dataprovider@2.66.0
  - @memberjunction/metadata-sync@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/metadata-sync@2.65.0
  - @memberjunction/sqlserver-dataprovider@2.65.0
  - @memberjunction/codegen-lib@2.65.0

## 2.64.0

### Patch Changes

- @memberjunction/codegen-lib@2.64.0
- @memberjunction/metadata-sync@2.64.0
- @memberjunction/sqlserver-dataprovider@2.64.0

## 2.63.1

### Patch Changes

- @memberjunction/codegen-lib@2.63.1
- @memberjunction/metadata-sync@2.63.1
- @memberjunction/sqlserver-dataprovider@2.63.1

## 2.63.0

### Patch Changes

- Updated dependencies [00e19b4]
  - @memberjunction/metadata-sync@2.63.0
  - @memberjunction/codegen-lib@2.63.0
  - @memberjunction/sqlserver-dataprovider@2.63.0

## 2.62.0

### Patch Changes

- @memberjunction/codegen-lib@2.62.0
- @memberjunction/sqlserver-dataprovider@2.62.0
- @memberjunction/metadata-sync@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/codegen-lib@2.61.0
- @memberjunction/sqlserver-dataprovider@2.61.0
- @memberjunction/metadata-sync@2.61.0

## 2.60.0

### Patch Changes

- Updated dependencies [6eabd10]
  - @memberjunction/codegen-lib@2.60.0
  - @memberjunction/metadata-sync@2.60.0
  - @memberjunction/sqlserver-dataprovider@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/codegen-lib@2.59.0
- @memberjunction/metadata-sync@2.59.0
- @memberjunction/sqlserver-dataprovider@2.59.0

## 2.58.0

### Patch Changes

- Updated dependencies [def26fe]
- Updated dependencies [a5f0905]
- Updated dependencies [264bdc9]
  - @memberjunction/metadata-sync@2.58.0
  - @memberjunction/sqlserver-dataprovider@2.58.0
  - @memberjunction/codegen-lib@2.58.0

## 2.57.0

### Minor Changes

- 0ba485f: various bug fixes

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/metadata-sync@2.57.0
  - @memberjunction/sqlserver-dataprovider@2.57.0
  - @memberjunction/codegen-lib@2.57.0

## 2.56.0

### Patch Changes

- 17c7634: Integrate MetadataSync commands into MJCLI
  - Refactored MetadataSync from standalone CLI to reusable library
  - Moved all sync commands under `mj sync` namespace in MJCLI
  - Added service-based architecture for better modularity
  - Removed oclif dependencies from MetadataSync package

- Updated dependencies [17c7634]
  - @memberjunction/metadata-sync@2.56.0
  - @memberjunction/codegen-lib@2.56.0
  - @memberjunction/sqlserver-dataprovider@2.56.0

## 2.55.0

### Patch Changes

- Updated dependencies [9232ce9]
  - @memberjunction/codegen-lib@2.55.0

## 2.54.0

### Patch Changes

- @memberjunction/codegen-lib@2.54.0

## 2.53.0

### Patch Changes

- @memberjunction/codegen-lib@2.53.0

## 2.52.0

### Patch Changes

- @memberjunction/codegen-lib@2.52.0

## 2.51.0

### Patch Changes

- @memberjunction/codegen-lib@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/codegen-lib@2.50.0

## 2.49.0

### Minor Changes

- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [72cbb2c]
- Updated dependencies [62cf1b6]
  - @memberjunction/codegen-lib@2.49.0

## 2.48.0

### Patch Changes

- @memberjunction/codegen-lib@2.48.0

## 2.47.0

### Patch Changes

- Updated dependencies [31afe2a]
- Updated dependencies [6e60efe]
  - @memberjunction/codegen-lib@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/codegen-lib@2.46.0

## 2.45.0

### Patch Changes

- @memberjunction/codegen-lib@2.45.0

## 2.44.0

### Patch Changes

- @memberjunction/codegen-lib@2.44.0

## 2.43.0

### Patch Changes

- Updated dependencies [1629c04]
  - @memberjunction/codegen-lib@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/codegen-lib@2.42.1

## 2.42.0

### Patch Changes

- @memberjunction/codegen-lib@2.42.0

## 2.41.0

### Patch Changes

- @memberjunction/codegen-lib@2.41.0

## 2.40.0

### Patch Changes

- @memberjunction/codegen-lib@2.40.0

## 2.39.0

### Patch Changes

- @memberjunction/codegen-lib@2.39.0

## 2.38.0

### Patch Changes

- @memberjunction/codegen-lib@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/codegen-lib@2.37.1

## 2.37.0

### Patch Changes

- @memberjunction/codegen-lib@2.37.0

## 2.36.1

### Patch Changes

- @memberjunction/codegen-lib@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
  - @memberjunction/codegen-lib@2.36.0

## 2.35.1

### Patch Changes

- @memberjunction/codegen-lib@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/codegen-lib@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/codegen-lib@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/codegen-lib@2.34.1

## 2.34.0

### Patch Changes

- @memberjunction/codegen-lib@2.34.0

## 2.33.0

### Patch Changes

- @memberjunction/codegen-lib@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/codegen-lib@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/codegen-lib@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/codegen-lib@2.32.0

## 2.31.0

### Patch Changes

- Updated dependencies [946b64e]
- Updated dependencies [45a552e]
  - @memberjunction/codegen-lib@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [90dd865]
- Updated dependencies [a3ab749]
  - @memberjunction/codegen-lib@2.30.0

## 2.29.2

### Patch Changes

- 7a9ee63: Adjust exports to avoid loading config during build
- Updated dependencies [07bde92]
- Updated dependencies [598b9b5]
  - @memberjunction/codegen-lib@2.29.2

## 2.28.0

### Patch Changes

- @memberjunction/codegen-lib@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/codegen-lib@2.27.1

## 2.27.0

### Patch Changes

- @memberjunction/codegen-lib@2.27.0

## 2.26.1

### Patch Changes

- Updated dependencies [896ada0]
- Updated dependencies [a8ff81f]
  - @memberjunction/codegen-lib@2.26.1

## 2.26.0

### Patch Changes

- Updated dependencies [23801c5]
  - @memberjunction/codegen-lib@2.26.0

## 2.25.0

### Patch Changes

- Updated dependencies [fd07dcd]
  - @memberjunction/codegen-lib@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/codegen-lib@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [b5d480c]
- Updated dependencies [871fa69]
- Updated dependencies [93d3ee2]
  - @memberjunction/codegen-lib@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/codegen-lib@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/codegen-lib@2.23.1

## 2.23.0

### Minor Changes

- cae74af: Added some better handling of the tag argument for `mj migrate` so semver strings like `2.22.2` work as well as properly formatted tags like `v2.22.2`.

  #### Unrelated tweak that triggers a minor version

  Also added a flyway variable to the repeatable metadata maintenance migration to ensure it runs every time (not just every time its checksum changes).

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/codegen-lib@2.23.0

## 2.22.2

### Patch Changes

- @memberjunction/codegen-lib@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/codegen-lib@2.22.1

## 2.22.0

### Patch Changes

- Updated dependencies [9660275]
  - @memberjunction/codegen-lib@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

### Patches

- Bump @memberjunction/codegen-lib to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:04 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:48 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Bump @memberjunction/codegen-lib to v2.18.0

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Bump @memberjunction/codegen-lib to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:28 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Bump @memberjunction/codegen-lib to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:29 GMT

### Patches

- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Bump @memberjunction/codegen-lib to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:44 GMT

### Patches

- Applying package updates [skip ci] (craig@memberjunction.com)
- Applying package updates [skip ci] (craig@memberjunction.com)
- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.13.3

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)

## 2.6.0

Sat, 28 Sep 2024 00:19:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

## 2.5.2

Sat, 28 Sep 2024 00:06:03 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

## 2.5.0

Fri, 20 Sep 2024 16:17:07 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.7.0

Wed, 12 Jun 2024 18:53:38 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.5.3

Tue, 11 Jun 2024 04:01:38 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)

## 1.4.0

Sat, 25 May 2024 15:30:17 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Add more validation in install script (craig.adam@bluecypress.io)

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Check node version in install (closes #161) (craig.adam@bluecypress.io)

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Add CLI package (craig.adam@bluecypress.io)

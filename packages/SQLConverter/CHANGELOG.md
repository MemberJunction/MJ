# @memberjunction/sql-converter

## 5.43.0

### Patch Changes

- Updated dependencies [b98366b]
  - @memberjunction/sql-dialect@5.43.0
  - @memberjunction/sqlglot-ts@5.43.0

## 5.42.0

### Patch Changes

- 2f225e4: CodeGen + SS→PG converter type-correctness on PostgreSQL:
  - **codegen-lib / core / actions-base**: core + codegen type correctness on PostgreSQL, plus a
    PG-only migration repairing TypeScript that the SS→PG baseline conversion corrupted in
    GeneratedCode rows. _(migration → minor)_
  - **sql-converter**: never quote identifiers inside string literals during SS→PG conversion. _(code → patch)_

- 8f7260b: Add inline CodeGen baking for PostgreSQL migrations (`mj migrate convert --bake-codegen` and `mj migrate rebake`) plus a one-time PG CodeGen cutover migration and a repeatable `EntityField.AllowsNull` self-heal, enabling codegen-free PostgreSQL deploys (`mj migrate` + `mj sync push`, no `mj codegen`).
- eea5b15: Split-and-regenerate PostgreSQL migration pipeline: regenerate the machine-generated bulk of each migration and transpile only hand-authored DDL via AST-based SQLGlot dialect transforms, replacing the brittle regex-based pg-migrate path. Adds statement-level classification for unbannered baselines and end-to-end AST transforms covering the remaining DDL edge cases.
- Updated dependencies [8f7260b]
- Updated dependencies [eea5b15]
  - @memberjunction/sqlglot-ts@5.42.0
  - @memberjunction/sql-dialect@5.42.0

## 5.41.0

### Patch Changes

- @memberjunction/sql-dialect@5.41.0
- @memberjunction/sqlglot-ts@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/sql-dialect@5.40.2
- @memberjunction/sqlglot-ts@5.40.2

## 5.40.1

### Patch Changes

- @memberjunction/sql-dialect@5.40.1
- @memberjunction/sqlglot-ts@5.40.1

## 5.40.0

### Patch Changes

- 9233802: Convert and validate the consolidated baseline in the PostgreSQL migration pipeline. GrantRule now skips `GRANT CONNECT` (no PG equivalent) and ProcedureToFunctionRule skips CRUD sprocs whose `RETURNS SETOF` view is a deprecated/orphaned entity view — both emit `-- SKIPPED (INTENTIONAL)` markers instead of apply-failing SQL. Fix the MJCLI baseline roundtrip's PG conversion (it called nonexistent `--input/--output` flags) and correct the migrate-convert baseline JSDoc.
  - @memberjunction/sql-dialect@5.40.0
  - @memberjunction/sqlglot-ts@5.40.0

## 5.39.0

### Patch Changes

- @memberjunction/sql-dialect@5.39.0
- @memberjunction/sqlglot-ts@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [c0b40c0]
  - @memberjunction/sql-dialect@5.38.0
  - @memberjunction/sqlglot-ts@5.38.0

## 5.37.0

### Patch Changes

- @memberjunction/sql-dialect@5.37.0
- @memberjunction/sqlglot-ts@5.37.0

## 5.36.0

### Patch Changes

- @memberjunction/sql-dialect@5.36.0
- @memberjunction/sqlglot-ts@5.36.0

## 5.35.0

### Patch Changes

- @memberjunction/sql-dialect@5.35.0
- @memberjunction/sqlglot-ts@5.35.0

## 5.34.1

### Patch Changes

- @memberjunction/sql-dialect@5.34.1
- @memberjunction/sqlglot-ts@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
  - @memberjunction/sql-dialect@5.34.0
  - @memberjunction/sqlglot-ts@5.34.0

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

- Updated dependencies [5cc5326]
- Updated dependencies [312fcee]
- Updated dependencies [7add405]
  - @memberjunction/sql-dialect@5.33.0
  - @memberjunction/sqlglot-ts@5.33.0

## 5.32.0

### Patch Changes

- @memberjunction/sql-dialect@5.32.0
- @memberjunction/sqlglot-ts@5.32.0

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
  - @memberjunction/sql-dialect@5.31.0
  - @memberjunction/sqlglot-ts@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/sql-dialect@5.30.1
- @memberjunction/sqlglot-ts@5.30.1

## 5.30.0

### Patch Changes

- @memberjunction/sql-dialect@5.30.0
- @memberjunction/sqlglot-ts@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
  - @memberjunction/sql-dialect@5.29.0
  - @memberjunction/sqlglot-ts@5.29.0

## 5.28.0

### Patch Changes

- @memberjunction/sql-dialect@5.28.0
- @memberjunction/sqlglot-ts@5.28.0

## 5.27.1

### Patch Changes

- @memberjunction/sql-dialect@5.27.1
- @memberjunction/sqlglot-ts@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/sql-dialect@5.27.0
- @memberjunction/sqlglot-ts@5.27.0

## 5.26.0

### Patch Changes

- @memberjunction/sql-dialect@5.26.0
- @memberjunction/sqlglot-ts@5.26.0

## 5.25.0

### Patch Changes

- @memberjunction/sql-dialect@5.25.0
- @memberjunction/sqlglot-ts@5.25.0

## 5.24.0

### Patch Changes

- @memberjunction/sql-dialect@5.24.0
- @memberjunction/sqlglot-ts@5.24.0

## 5.23.0

### Patch Changes

- @memberjunction/sql-dialect@5.23.0
- @memberjunction/sqlglot-ts@5.23.0

## 5.22.0

### Patch Changes

- @memberjunction/sql-dialect@5.22.0
- @memberjunction/sqlglot-ts@5.22.0

## 5.21.0

### Patch Changes

- @memberjunction/sql-dialect@5.21.0
- @memberjunction/sqlglot-ts@5.21.0

## 5.20.0

### Patch Changes

- @memberjunction/sql-dialect@5.20.0
- @memberjunction/sqlglot-ts@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/sql-dialect@5.19.0
- @memberjunction/sqlglot-ts@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/sql-dialect@5.18.0
- @memberjunction/sqlglot-ts@5.18.0

## 5.17.0

### Patch Changes

- @memberjunction/sql-dialect@5.17.0
- @memberjunction/sqlglot-ts@5.17.0

## 5.16.0

### Patch Changes

- @memberjunction/sql-dialect@5.16.0
- @memberjunction/sqlglot-ts@5.16.0

## 5.15.0

### Patch Changes

- @memberjunction/sql-dialect@5.15.0
- @memberjunction/sqlglot-ts@5.15.0

## 5.14.0

### Patch Changes

- @memberjunction/sql-dialect@5.14.0
- @memberjunction/sqlglot-ts@5.14.0

## 5.13.0

### Patch Changes

- @memberjunction/sql-dialect@5.13.0
- @memberjunction/sqlglot-ts@5.13.0

## 5.12.0

### Patch Changes

- @memberjunction/sql-dialect@5.12.0
- @memberjunction/sqlglot-ts@5.12.0

## 5.11.0

### Minor Changes

- a4c3c81: migration/metadata

### Patch Changes

- @memberjunction/sql-dialect@5.11.0
- @memberjunction/sqlglot-ts@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/sql-dialect@5.10.1
- @memberjunction/sqlglot-ts@5.10.1

## 5.10.0

### Patch Changes

- @memberjunction/sql-dialect@5.10.0
- @memberjunction/sqlglot-ts@5.10.0

## 5.9.0

### Patch Changes

- @memberjunction/sql-dialect@5.9.0
- @memberjunction/sqlglot-ts@5.9.0

## 5.8.0

### Patch Changes

- @memberjunction/sql-dialect@5.8.0
- @memberjunction/sqlglot-ts@5.8.0

## 5.7.0

### Patch Changes

- @memberjunction/sql-dialect@5.7.0
- @memberjunction/sqlglot-ts@5.7.0

## 5.6.0

### Patch Changes

- @memberjunction/sql-dialect@5.6.0
- @memberjunction/sqlglot-ts@5.6.0

## 5.5.0

### Minor Changes

- ee9f788: migrations - postgres sql support!

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/sql-dialect@5.5.0
  - @memberjunction/sqlglot-ts@5.5.0

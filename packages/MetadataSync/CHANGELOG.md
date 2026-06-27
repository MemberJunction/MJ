# @memberjunction/metadata-sync

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [fe89e68]
- Updated dependencies [9f6aa87]
- Updated dependencies [b98366b]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
- Updated dependencies [4e05350]
  - @memberjunction/core@5.43.0
  - @memberjunction/postgresql-dataprovider@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/sql-dialect@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/sqlserver-dataprovider@5.43.0
  - @memberjunction/generic-database-provider@5.43.0
  - @memberjunction/graphql-dataprovider@5.43.0
  - @memberjunction/core-entities-server@5.43.0
  - @memberjunction/server-bootstrap-lite@5.43.0
  - @memberjunction/cli-core@5.43.0
  - @memberjunction/config@5.43.0

## 5.42.0

### Patch Changes

- a72af01: Batch the deletion-audit database lookups so a large `mj sync push` no longer appears to hang for tens of minutes.
  - **FK reference scan (`DatabaseReferenceScanner.scanForReferences`)**: group records-to-delete by entity and issue one `RunView` per (target entity, referencing FK field) using a chunked `IN (...)` filter, instead of one serial query per (record × referencing field). Found rows are attributed back to the exact deleted record via the FK value (case-insensitive, to handle SQL Server upper / PostgreSQL lower GUIDs). Metadata membership is resolved via a precomputed O(1) `Set` rather than re-scanning every metadata record per reference.
  - **Existence check (`DeletionAuditor.checkRecordExistence`)**: single-primary-key entities are resolved with batched `IN (...)` queries instead of one `loadEntity` round-trip per record; composite-key / unknown entities keep the per-record fallback. Safe defaults preserved — a record whose key can't be determined, or whose query fails, is treated as still-existing so a real delete is never silently skipped.
  - The batched queries pass `IgnoreMaxRows: true` so a scan matching more rows than the referencing entity's `UserViewMaxRows` cap is not silently truncated (which would miss references).

  No behavioral change to the audit output; tests added for both batched paths.

- 34152e1: Pluggable mj CLI with AI agent and automation friendly output: new cli-core package (BaseCLIPlugin + runtime host), json formatting for machine readable output and two tier progressive disclosure. with per-command runtime/timeout hints, and a fix for sync/push/pull hanging on DB-pool teardown after emitting results
- Updated dependencies [9b9b484]
- Updated dependencies [5ada858]
- Updated dependencies [5fde509]
- Updated dependencies [4ec1732]
- Updated dependencies [2f225e4]
- Updated dependencies [b7092ca]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
- Updated dependencies [34152e1]
  - @memberjunction/core@5.42.0
  - @memberjunction/generic-database-provider@5.42.0
  - @memberjunction/server-bootstrap-lite@5.42.0
  - @memberjunction/sqlserver-dataprovider@5.42.0
  - @memberjunction/graphql-dataprovider@5.42.0
  - @memberjunction/postgresql-dataprovider@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/core-entities-server@5.42.0
  - @memberjunction/cli-core@5.42.0
  - @memberjunction/config@5.42.0
  - @memberjunction/sql-dialect@5.42.0

## 5.41.0

### Minor Changes

- cd6c5f0: Realtime AI Agents wave 3: consolidated v5.41 migration (sessions, channels, co-agent schema) with the AIAgentCoAgent affinity registry replacing AIAgentPairedAgent — typed relationship vocabulary (CoAgent implemented; Peer/Delegate/Fallback/Reviewer/Observer reserved), type-level co-agent defaults as junction rows (removing the only FK cycle in core MJ), and the full code sweep (engine cache, resolver resolution chain, server-side invariants, client pairing reads, regenerated manifests). Realtime UX: progressive-disclosure voice console with persisted captions preference, user-owned composer and tabs toggles, audio-reactive visuals; whiteboard pages/multi-select and review-persistence fixes. Gemini Live triggering turns ride realtime text so widget clicks/typed input/narration speak immediately on native-audio models. CodeGen: single-winner IsNameField enforcement with eligibility guardrail fixes, SCC-based cycle diagnostics, and clean-database bootstrap robustness (conditional engine registry datasets).
- a5f5472: Remote Browser channel + new realtime voice providers + computer-use enrichment.
  - **Remote Browser channel** (`@memberjunction/remote-browser-*`): an in-house realtime channel where an agent drives a live, CDP-connected browser while it talks (sales demos, support walkthroughs, trainer agents). New `AIRemoteBrowserProvider` registry (migration V202606161000) with JSONType capability gating; a universal `remote-browser-base` (driver family + `RemoteBrowserEngineBase`), a shared `remote-browser-cdp` kit (one lossless action mapper + `CdpRemoteBrowserSession`), a `remote-browser-server` engine + `RemoteBrowserChannel` (control arbiter, control modes AgentOnly/ViewOnly/Collaborative vs strategies ComputerUse/NativeAI), and five thin backends (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).
  - **computer-use** enriched additively into a complete browser-I/O + perception engine: CSS-selector-aware actions, CDP screencast, MouseMove, accessibility-snapshot/QueryElement/GetVisibleText/GetTitle/WaitForLoadState — every consumer benefits, existing vision/coordinate path unchanged.
  - **New realtime model providers**: xAI Grok Voice (`@memberjunction/ai-xai`, OpenAI-Realtime-compatible) and Inworld (`@memberjunction/ai-inworld`), with vendor/model seeds.
  - **Console logging improvements** across `@memberjunction/ai-core-plus`, `ai-engine-base`, `ai-prompts`, `aiengine`, `cli`, `generic-database-provider`, `metadata-sync`, and the bootstrap/forms packages.

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [1e81848]
- Updated dependencies [2e48d1a]
- Updated dependencies [34d17e2]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/core-entities-server@5.41.0
  - @memberjunction/graphql-dataprovider@5.41.0
  - @memberjunction/server-bootstrap-lite@5.41.0
  - @memberjunction/generic-database-provider@5.41.0
  - @memberjunction/postgresql-dataprovider@5.41.0
  - @memberjunction/sqlserver-dataprovider@5.41.0
  - @memberjunction/config@5.41.0
  - @memberjunction/global@5.41.0
  - @memberjunction/sql-dialect@5.41.0

## 5.40.2

### Patch Changes

- Updated dependencies [da2ee38]
  - @memberjunction/core-entities-server@5.40.2
  - @memberjunction/sqlserver-dataprovider@5.40.2
  - @memberjunction/server-bootstrap-lite@5.40.2
  - @memberjunction/config@5.40.2
  - @memberjunction/generic-database-provider@5.40.2
  - @memberjunction/graphql-dataprovider@5.40.2
  - @memberjunction/core@5.40.2
  - @memberjunction/core-entities@5.40.2
  - @memberjunction/global@5.40.2
  - @memberjunction/postgresql-dataprovider@5.40.2
  - @memberjunction/sql-dialect@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/generic-database-provider@5.40.1
  - @memberjunction/graphql-dataprovider@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/core-entities-server@5.40.1
  - @memberjunction/postgresql-dataprovider@5.40.1
  - @memberjunction/sqlserver-dataprovider@5.40.1
  - @memberjunction/server-bootstrap-lite@5.40.1
  - @memberjunction/config@5.40.1
  - @memberjunction/global@5.40.1
  - @memberjunction/sql-dialect@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [7bbfd62]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/generic-database-provider@5.40.0
  - @memberjunction/sqlserver-dataprovider@5.40.0
  - @memberjunction/graphql-dataprovider@5.40.0
  - @memberjunction/server-bootstrap-lite@5.40.0
  - @memberjunction/core-entities-server@5.40.0
  - @memberjunction/postgresql-dataprovider@5.40.0
  - @memberjunction/config@5.40.0
  - @memberjunction/global@5.40.0
  - @memberjunction/sql-dialect@5.40.0

## 5.39.0

### Minor Changes

- 26761b8: fix(actions): surface real action errors instead of swallowing them

  `ActionEngine.InternalRunAction`'s catch block called `LogError(message, e)`, but `LogError`'s second positional parameter is `logToFileName` — so the thrown `Error` was consumed as a (non-string) filename and never printed. Every failed action logged only `Error running action <name>:` with no message or stack. It now uses `LogErrorEx({ message, error })` so the real message and stack trace are logged, and the returned result `Message` handles non-`Error` throws.

  feat(metadata-sync): only warn about missing required fields for NEW records

  The "Required field X is missing" best-practice warning fired for existing records too (e.g. `BaseView` on `MJ: Entities`), even though the value is already persisted in the DB. Since metadata files commonly set only a subset of fields on an update, this produced noise that masked genuine warnings. The validator now threads the record's `primaryKey` presence down to the required-field check and runs it only for new (unsaved) records.

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [f60e340]
- Updated dependencies [7dfacc7]
- Updated dependencies [eaee99f]
- Updated dependencies [2d1b4e1]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/graphql-dataprovider@5.39.0
  - @memberjunction/postgresql-dataprovider@5.39.0
  - @memberjunction/sqlserver-dataprovider@5.39.0
  - @memberjunction/server-bootstrap-lite@5.39.0
  - @memberjunction/generic-database-provider@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/core-entities-server@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/config@5.39.0
  - @memberjunction/sql-dialect@5.39.0

## 5.38.0

### Patch Changes

- 67d6562: Add full-stack MJ Explorer regression test suite — Docker-based runner with Computer Use engine, parallel workers via HeadlessBrowserEngine, bacpac mode, standalone compose for external use, and `mj test regression init` templates (remote-mj, generic-web, bring-your-own-app, static-file-server). Includes ephemeral workspace guard for cross-test isolation and stabilizes the suite at 25/25.
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

- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [b26d0ee]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/generic-database-provider@5.38.0
  - @memberjunction/sql-dialect@5.38.0
  - @memberjunction/graphql-dataprovider@5.38.0
  - @memberjunction/core-entities-server@5.38.0
  - @memberjunction/sqlserver-dataprovider@5.38.0
  - @memberjunction/server-bootstrap-lite@5.38.0
  - @memberjunction/postgresql-dataprovider@5.38.0
  - @memberjunction/config@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [464f30c]
- Updated dependencies [dadbde9]
- Updated dependencies [4f15f31]
- Updated dependencies [f5531e0]
  - @memberjunction/server-bootstrap-lite@5.37.0
  - @memberjunction/graphql-dataprovider@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/generic-database-provider@5.37.0
  - @memberjunction/core-entities-server@5.37.0
  - @memberjunction/sqlserver-dataprovider@5.37.0
  - @memberjunction/postgresql-dataprovider@5.37.0
  - @memberjunction/config@5.37.0
  - @memberjunction/global@5.37.0
  - @memberjunction/sql-dialect@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [f29b7c0]
- Updated dependencies [1c0fce9]
- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/graphql-dataprovider@5.36.0
  - @memberjunction/server-bootstrap-lite@5.36.0
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/generic-database-provider@5.36.0
  - @memberjunction/core-entities-server@5.36.0
  - @memberjunction/sqlserver-dataprovider@5.36.0
  - @memberjunction/postgresql-dataprovider@5.36.0
  - @memberjunction/config@5.36.0
  - @memberjunction/global@5.36.0
  - @memberjunction/sql-dialect@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [6f083dd]
- Updated dependencies [77e4782]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/server-bootstrap-lite@5.35.0
  - @memberjunction/generic-database-provider@5.35.0
  - @memberjunction/graphql-dataprovider@5.35.0
  - @memberjunction/core-entities-server@5.35.0
  - @memberjunction/postgresql-dataprovider@5.35.0
  - @memberjunction/sqlserver-dataprovider@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/config@5.35.0
  - @memberjunction/sql-dialect@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [8695f65]
  - @memberjunction/core@5.34.1
  - @memberjunction/generic-database-provider@5.34.1
  - @memberjunction/graphql-dataprovider@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/core-entities-server@5.34.1
  - @memberjunction/postgresql-dataprovider@5.34.1
  - @memberjunction/sqlserver-dataprovider@5.34.1
  - @memberjunction/server-bootstrap-lite@5.34.1
  - @memberjunction/config@5.34.1
  - @memberjunction/global@5.34.1
  - @memberjunction/sql-dialect@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [4b8d9ed]
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/core-entities-server@5.34.0
  - @memberjunction/config@5.34.0
  - @memberjunction/generic-database-provider@5.34.0
  - @memberjunction/postgresql-dataprovider@5.34.0
  - @memberjunction/sql-dialect@5.34.0
  - @memberjunction/sqlserver-dataprovider@5.34.0
  - @memberjunction/server-bootstrap-lite@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/graphql-dataprovider@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

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

- Updated dependencies [97ed790]
- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [312fcee]
- Updated dependencies [7e4957d]
- Updated dependencies [f94ebd6]
- Updated dependencies [7add405]
- Updated dependencies [b0329f6]
- Updated dependencies [fad046c]
  - @memberjunction/graphql-dataprovider@5.33.0
  - @memberjunction/core@5.33.0
  - @memberjunction/generic-database-provider@5.33.0
  - @memberjunction/postgresql-dataprovider@5.33.0
  - @memberjunction/sql-dialect@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/core-entities-server@5.33.0
  - @memberjunction/sqlserver-dataprovider@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/server-bootstrap-lite@5.33.0
  - @memberjunction/config@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/server-bootstrap-lite@5.32.0
  - @memberjunction/generic-database-provider@5.32.0
  - @memberjunction/graphql-dataprovider@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/core-entities-server@5.32.0
  - @memberjunction/postgresql-dataprovider@5.32.0
  - @memberjunction/sqlserver-dataprovider@5.32.0
  - @memberjunction/config@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Minor Changes

- 60e7541: Add --incremental flag for push/pull, lazy embedding loading, indexed batch context lookups, batched pull queries

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- b3d88ff: Fix MetadataSync push skipping unchanged records unconditionally -- record level skip is now correctly gated behind --incremental
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [3c5176f]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/core-entities-server@5.31.0
  - @memberjunction/graphql-dataprovider@5.31.0
  - @memberjunction/config@5.31.0
  - @memberjunction/generic-database-provider@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/postgresql-dataprovider@5.31.0
  - @memberjunction/sqlserver-dataprovider@5.31.0
  - @memberjunction/server-bootstrap-lite@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/config@5.30.1
- @memberjunction/generic-database-provider@5.30.1
- @memberjunction/graphql-dataprovider@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/core-entities-server@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/sqlserver-dataprovider@5.30.1
- @memberjunction/server-bootstrap-lite@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [366e646]
- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [9154ac7]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/server-bootstrap-lite@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core-entities-server@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/graphql-dataprovider@5.30.0
  - @memberjunction/generic-database-provider@5.30.0
  - @memberjunction/sqlserver-dataprovider@5.30.0
  - @memberjunction/config@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [5c7a57f]
- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
- Updated dependencies [98bad3a]
  - @memberjunction/server-bootstrap-lite@5.29.0
  - @memberjunction/core@5.29.0
  - @memberjunction/generic-database-provider@5.29.0
  - @memberjunction/core-entities-server@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/graphql-dataprovider@5.29.0
  - @memberjunction/sqlserver-dataprovider@5.29.0
  - @memberjunction/config@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/core-entities-server@5.28.0
  - @memberjunction/generic-database-provider@5.28.0
  - @memberjunction/graphql-dataprovider@5.28.0
  - @memberjunction/sqlserver-dataprovider@5.28.0
  - @memberjunction/server-bootstrap-lite@5.28.0
  - @memberjunction/config@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
- Updated dependencies [6c39ff0]
  - @memberjunction/global@5.27.1
  - @memberjunction/graphql-dataprovider@5.27.1
  - @memberjunction/generic-database-provider@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/core-entities-server@5.27.1
  - @memberjunction/sqlserver-dataprovider@5.27.1
  - @memberjunction/server-bootstrap-lite@5.27.1
  - @memberjunction/config@5.27.1

## 5.27.0

### Patch Changes

- Updated dependencies [4357090]
  - @memberjunction/generic-database-provider@5.27.0
  - @memberjunction/core-entities-server@5.27.0
  - @memberjunction/server-bootstrap-lite@5.27.0
  - @memberjunction/sqlserver-dataprovider@5.27.0
  - @memberjunction/config@5.27.0
  - @memberjunction/graphql-dataprovider@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/core-entities@5.27.0
  - @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/server-bootstrap-lite@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/generic-database-provider@5.26.0
  - @memberjunction/graphql-dataprovider@5.26.0
  - @memberjunction/core-entities-server@5.26.0
  - @memberjunction/sqlserver-dataprovider@5.26.0
  - @memberjunction/config@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/core-entities-server@5.25.0
  - @memberjunction/generic-database-provider@5.25.0
  - @memberjunction/graphql-dataprovider@5.25.0
  - @memberjunction/server-bootstrap-lite@5.25.0
  - @memberjunction/sqlserver-dataprovider@5.25.0
  - @memberjunction/config@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/graphql-dataprovider@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/core-entities-server@5.24.0
  - @memberjunction/server-bootstrap-lite@5.24.0
  - @memberjunction/sqlserver-dataprovider@5.24.0
  - @memberjunction/generic-database-provider@5.24.0
  - @memberjunction/config@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- 247df16: Fix server-side RunView cache write asymmetry that caused repeated DB queries during metadata sync, add deterministic Nunjucks template parameter extraction via AST, support comma-delimited multi-value fields in validation, and redesign QueryPagingEngine to append paging directly instead of wrapping in CTEs (fixing ORDER BY on non-projected columns and apostrophe-in-comments bugs).
- 9250070: Update default configs for local cache manager.
- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [1d1e02e]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities-server@5.23.0
  - @memberjunction/generic-database-provider@5.23.0
  - @memberjunction/sqlserver-dataprovider@5.23.0
  - @memberjunction/graphql-dataprovider@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/server-bootstrap-lite@5.23.0
  - @memberjunction/config@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [a42aba6]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/server-bootstrap-lite@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/graphql-dataprovider@5.22.0
  - @memberjunction/core-entities-server@5.22.0
  - @memberjunction/generic-database-provider@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/sqlserver-dataprovider@5.22.0
  - @memberjunction/config@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/core-entities-server@5.21.0
  - @memberjunction/server-bootstrap-lite@5.21.0
  - @memberjunction/sqlserver-dataprovider@5.21.0
  - @memberjunction/generic-database-provider@5.21.0
  - @memberjunction/graphql-dataprovider@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/config@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [cc954e1]
- Updated dependencies [2298f8a]
  - @memberjunction/generic-database-provider@5.20.0
  - @memberjunction/core@5.20.0
  - @memberjunction/core-entities-server@5.20.0
  - @memberjunction/sqlserver-dataprovider@5.20.0
  - @memberjunction/server-bootstrap-lite@5.20.0
  - @memberjunction/graphql-dataprovider@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/config@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/server-bootstrap-lite@5.19.0
- @memberjunction/config@5.19.0
- @memberjunction/generic-database-provider@5.19.0
- @memberjunction/graphql-dataprovider@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/core-entities-server@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/sqlserver-dataprovider@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [931740a]
  - @memberjunction/core-entities-server@5.18.0
  - @memberjunction/server-bootstrap-lite@5.18.0
  - @memberjunction/graphql-dataprovider@5.18.0
  - @memberjunction/generic-database-provider@5.18.0
  - @memberjunction/sqlserver-dataprovider@5.18.0
  - @memberjunction/config@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [4b6fd2a]
- Updated dependencies [bbfbf5e]
- Updated dependencies [9881045]
  - @memberjunction/generic-database-provider@5.17.0
  - @memberjunction/core-entities-server@5.17.0
  - @memberjunction/graphql-dataprovider@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/sqlserver-dataprovider@5.17.0
  - @memberjunction/server-bootstrap-lite@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/config@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [179a4ce]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/graphql-dataprovider@5.16.0
  - @memberjunction/generic-database-provider@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/core-entities-server@5.16.0
  - @memberjunction/sqlserver-dataprovider@5.16.0
  - @memberjunction/server-bootstrap-lite@5.16.0
  - @memberjunction/config@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [5e85b29]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/generic-database-provider@5.15.0
  - @memberjunction/core-entities-server@5.15.0
  - @memberjunction/graphql-dataprovider@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/sqlserver-dataprovider@5.15.0
  - @memberjunction/server-bootstrap-lite@5.15.0
  - @memberjunction/config@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/generic-database-provider@5.14.0
  - @memberjunction/graphql-dataprovider@5.14.0
  - @memberjunction/server-bootstrap-lite@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/core-entities-server@5.14.0
  - @memberjunction/sqlserver-dataprovider@5.14.0
  - @memberjunction/config@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/generic-database-provider@5.13.0
  - @memberjunction/graphql-dataprovider@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/core-entities-server@5.13.0
  - @memberjunction/sqlserver-dataprovider@5.13.0
  - @memberjunction/server-bootstrap-lite@5.13.0
  - @memberjunction/config@5.13.0

## 5.12.0

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [7def002]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/core-entities-server@5.12.0
  - @memberjunction/generic-database-provider@5.12.0
  - @memberjunction/graphql-dataprovider@5.12.0
  - @memberjunction/server-bootstrap-lite@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/sqlserver-dataprovider@5.12.0
  - @memberjunction/config@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/generic-database-provider@5.11.0
  - @memberjunction/graphql-dataprovider@5.11.0
  - @memberjunction/core@5.11.0
  - @memberjunction/sqlserver-dataprovider@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/core-entities-server@5.11.0
  - @memberjunction/server-bootstrap-lite@5.11.0
  - @memberjunction/config@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/config@5.10.1
- @memberjunction/generic-database-provider@5.10.1
- @memberjunction/graphql-dataprovider@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/core-entities-server@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/sqlserver-dataprovider@5.10.1
- @memberjunction/server-bootstrap-lite@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [4e298b7]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/graphql-dataprovider@5.10.0
  - @memberjunction/generic-database-provider@5.10.0
  - @memberjunction/core-entities-server@5.10.0
  - @memberjunction/sqlserver-dataprovider@5.10.0
  - @memberjunction/server-bootstrap-lite@5.10.0
  - @memberjunction/config@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/generic-database-provider@5.9.0
  - @memberjunction/sqlserver-dataprovider@5.9.0
  - @memberjunction/server-bootstrap-lite@5.9.0
  - @memberjunction/graphql-dataprovider@5.9.0
  - @memberjunction/core-entities-server@5.9.0
  - @memberjunction/config@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [064cf3a]
- Updated dependencies [de9f2c0]
- Updated dependencies [0753249]
  - @memberjunction/generic-database-provider@5.8.0
  - @memberjunction/graphql-dataprovider@5.8.0
  - @memberjunction/core@5.8.0
  - @memberjunction/sqlserver-dataprovider@5.8.0
  - @memberjunction/server-bootstrap-lite@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/core-entities-server@5.8.0
  - @memberjunction/config@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/core-entities-server@5.7.0
  - @memberjunction/sqlserver-dataprovider@5.7.0
  - @memberjunction/server-bootstrap-lite@5.7.0
  - @memberjunction/generic-database-provider@5.7.0
  - @memberjunction/graphql-dataprovider@5.7.0
  - @memberjunction/config@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/graphql-dataprovider@5.6.0
  - @memberjunction/generic-database-provider@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/core-entities-server@5.6.0
  - @memberjunction/sqlserver-dataprovider@5.6.0
  - @memberjunction/server-bootstrap-lite@5.6.0
  - @memberjunction/config@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [7ca2459]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/graphql-dataprovider@5.5.0
  - @memberjunction/server-bootstrap-lite@5.5.0
  - @memberjunction/sqlserver-dataprovider@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/core-entities-server@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/config@5.5.0
  - @memberjunction/generic-database-provider@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/config@5.4.1
- @memberjunction/graphql-dataprovider@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/core-entities-server@5.4.1
- @memberjunction/global@5.4.1
- @memberjunction/sqlserver-dataprovider@5.4.1
- @memberjunction/server-bootstrap-lite@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [8a11457]
- Updated dependencies [c9a760c]
  - @memberjunction/graphql-dataprovider@5.4.0
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/server-bootstrap-lite@5.4.0
  - @memberjunction/core-entities-server@5.4.0
  - @memberjunction/sqlserver-dataprovider@5.4.0
  - @memberjunction/config@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/config@5.3.1
- @memberjunction/graphql-dataprovider@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/core-entities-server@5.3.1
- @memberjunction/global@5.3.1
- @memberjunction/sqlserver-dataprovider@5.3.1
- @memberjunction/server-bootstrap-lite@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [a6aea29]
- Updated dependencies [1692c53]
  - @memberjunction/graphql-dataprovider@5.3.0
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/server-bootstrap-lite@5.3.0
  - @memberjunction/core-entities-server@5.3.0
  - @memberjunction/sqlserver-dataprovider@5.3.0
  - @memberjunction/config@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core-entities-server@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/server-bootstrap-lite@5.2.0
  - @memberjunction/graphql-dataprovider@5.2.0
  - @memberjunction/sqlserver-dataprovider@5.2.0
  - @memberjunction/config@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [f426d43]
- Updated dependencies [61079e9]
  - @memberjunction/server-bootstrap-lite@5.1.0
  - @memberjunction/global@5.1.0
  - @memberjunction/graphql-dataprovider@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/core-entities-server@5.1.0
  - @memberjunction/sqlserver-dataprovider@5.1.0
  - @memberjunction/config@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [737b56b]
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/graphql-dataprovider@5.0.0
  - @memberjunction/server-bootstrap-lite@5.0.0
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/sqlserver-dataprovider@5.0.0
  - @memberjunction/config@5.0.0
  - @memberjunction/core-entities-server@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/graphql-dataprovider@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/core-entities-server@4.4.0
  - @memberjunction/sqlserver-dataprovider@4.4.0
  - @memberjunction/server-bootstrap-lite@4.4.0
  - @memberjunction/config@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/config@4.3.1
- @memberjunction/graphql-dataprovider@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/core-entities-server@4.3.1
- @memberjunction/global@4.3.1
- @memberjunction/sqlserver-dataprovider@4.3.1
- @memberjunction/server-bootstrap-lite@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/graphql-dataprovider@4.3.0
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/server-bootstrap-lite@4.3.0
  - @memberjunction/core-entities-server@4.3.0
  - @memberjunction/sqlserver-dataprovider@4.3.0
  - @memberjunction/config@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/config@4.2.0
- @memberjunction/graphql-dataprovider@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/core-entities-server@4.2.0
- @memberjunction/global@4.2.0
- @memberjunction/sqlserver-dataprovider@4.2.0
- @memberjunction/server-bootstrap-lite@4.2.0

## 4.1.0

### Patch Changes

- 77839a9: Enable cascade deletes for AI Agent and Prompt entities, add cross-file dependency detection and --delete-db-only flag to MetadataSync for proper deletion ordering, fix CodeGen duplicate variable names for self-referential FKs, add requireConnectivity config to QueryGen, and add Gemini JSON parser support to DBAutoDoc.
- Updated dependencies [f54a9e4]
- Updated dependencies [77839a9]
- Updated dependencies [9fab8ca]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/sqlserver-dataprovider@4.1.0
  - @memberjunction/core@4.1.0
  - @memberjunction/server-bootstrap-lite@4.1.0
  - @memberjunction/core-entities-server@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/graphql-dataprovider@4.1.0
  - @memberjunction/config@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- e9659be: Fix build error and eliminate warnings.
- Updated dependencies [2f86270]
- Updated dependencies [65b4274]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/core-entities-server@4.0.0
  - @memberjunction/graphql-dataprovider@4.0.0
  - @memberjunction/sqlserver-dataprovider@4.0.0
  - @memberjunction/config@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0
  - @memberjunction/server-bootstrap-lite@4.0.0

## 3.4.0

### Patch Changes

- 3a71e4e: Fix large text field corruptions, cross-platform improvements, more robust environment variable parsing for boolean values
- Updated dependencies [3a71e4e]
- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/sqlserver-dataprovider@3.4.0
  - @memberjunction/config@3.4.0
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/core-entities-server@3.4.0
  - @memberjunction/graphql-dataprovider@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/graphql-dataprovider@3.3.0
  - @memberjunction/core-entities-server@3.3.0
  - @memberjunction/sqlserver-dataprovider@3.3.0
  - @memberjunction/config@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- cbd2714: Improve error handling and stability across Skip integration, component artifacts, and metadata sync
- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/graphql-dataprovider@3.2.0
  - @memberjunction/core-entities-server@3.2.0
  - @memberjunction/sqlserver-dataprovider@3.2.0
  - @memberjunction/config@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- Updated dependencies [8c0b624]
  - @memberjunction/graphql-dataprovider@3.1.1
  - @memberjunction/config@3.1.1
  - @memberjunction/core@3.1.1
  - @memberjunction/core-entities@3.1.1
  - @memberjunction/core-entities-server@3.1.1
  - @memberjunction/global@3.1.1
  - @memberjunction/sqlserver-dataprovider@3.1.1

## 3.0.0

### Major Changes

- f25f757: The foundation for MemberJunction v3.0's improved architecture, making it easier for developers to adopt and customize MJ for their needs.

### Patch Changes

- @memberjunction/graphql-dataprovider@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/core-entities-server@3.0.0
- @memberjunction/global@3.0.0
- @memberjunction/sqlserver-dataprovider@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/graphql-dataprovider@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/core-entities-server@2.133.0
  - @memberjunction/sqlserver-dataprovider@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/graphql-dataprovider@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/core-entities-server@2.132.0
  - @memberjunction/sqlserver-dataprovider@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- 280a4c7: Add Cerebras as AI inference provider for GLM-4.7 model and improve MetadataSync with recursive @file reference resolution in checksum calculations
- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/graphql-dataprovider@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/core-entities-server@2.131.0
  - @memberjunction/sqlserver-dataprovider@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- cdea2b7: no migration
  - @memberjunction/graphql-dataprovider@2.130.1
  - @memberjunction/core@2.130.1
  - @memberjunction/core-entities@2.130.1
  - @memberjunction/core-entities-server@2.130.1
  - @memberjunction/global@2.130.1
  - @memberjunction/sqlserver-dataprovider@2.130.1

## 2.130.0

### Patch Changes

- 02e84a2: Add GPT Codex models (5.2-codex, 5.1-codex-max, 5.1-codex-mini), implement SimpleChart stackBy property for stacked bar/column charts, add @file: directive support for component code references, reorganize component metadata with comprehensive documentation, and fix metadata-sync validation for glob patterns with \*\*/ prefix
- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/graphql-dataprovider@2.130.0
  - @memberjunction/sqlserver-dataprovider@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/core-entities-server@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Minor Changes

- 8e2ec79: migration

### Patch Changes

- 20c360f: Fix metadata sync pull operations to correctly process all records and preserve timestamps when data hasn't changed
- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/sqlserver-dataprovider@2.129.0
  - @memberjunction/graphql-dataprovider@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/core-entities-server@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/graphql-dataprovider@2.128.0
  - @memberjunction/core-entities-server@2.128.0
  - @memberjunction/sqlserver-dataprovider@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/graphql-dataprovider@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/core-entities-server@2.127.0
  - @memberjunction/sqlserver-dataprovider@2.127.0

## 2.126.1

### Patch Changes

- Updated dependencies [d6ae2a0]
  - @memberjunction/graphql-dataprovider@2.126.1
  - @memberjunction/core@2.126.1
  - @memberjunction/core-entities@2.126.1
  - @memberjunction/core-entities-server@2.126.1
  - @memberjunction/global@2.126.1
  - @memberjunction/sqlserver-dataprovider@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [703221e]
  - @memberjunction/core@2.126.0
  - @memberjunction/core-entities-server@2.126.0
  - @memberjunction/graphql-dataprovider@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/sqlserver-dataprovider@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/graphql-dataprovider@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/core-entities-server@2.125.0
  - @memberjunction/sqlserver-dataprovider@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- 4be0ffa: no migration
- Updated dependencies [75058a9]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/graphql-dataprovider@2.124.0
  - @memberjunction/core-entities-server@2.124.0
  - @memberjunction/sqlserver-dataprovider@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/graphql-dataprovider@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/core-entities-server@2.123.1
- @memberjunction/global@2.123.1
- @memberjunction/sqlserver-dataprovider@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/graphql-dataprovider@2.123.0
- @memberjunction/core-entities-server@2.123.0
- @memberjunction/sqlserver-dataprovider@2.123.0
- @memberjunction/core@2.123.0
- @memberjunction/core-entities@2.123.0
- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
- Updated dependencies [3d763e9]
- Updated dependencies [81f0c44]
  - @memberjunction/graphql-dataprovider@2.122.2
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/core-entities-server@2.122.2
  - @memberjunction/sqlserver-dataprovider@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/graphql-dataprovider@2.122.1
- @memberjunction/core@2.122.1
- @memberjunction/core-entities@2.122.1
- @memberjunction/core-entities-server@2.122.1
- @memberjunction/global@2.122.1
- @memberjunction/sqlserver-dataprovider@2.122.1

## 2.122.0

### Patch Changes

- 6de83ec: Add component linter enhancements with type inference and control flow analysis, DBAutoDoc query generation features, MCP server diagnostic tools, metadata sync improvements, and enhanced JWKS client with HTTP keep-alive connections and connection pooling to prevent socket hangups
- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/graphql-dataprovider@2.122.0
  - @memberjunction/core-entities-server@2.122.0
  - @memberjunction/sqlserver-dataprovider@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/graphql-dataprovider@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/core-entities-server@2.121.0
  - @memberjunction/sqlserver-dataprovider@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/graphql-dataprovider@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/core-entities-server@2.120.0
  - @memberjunction/sqlserver-dataprovider@2.120.0
  - @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- Updated dependencies [7dd7cca]
  - @memberjunction/core@2.119.0
  - @memberjunction/graphql-dataprovider@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/core-entities-server@2.119.0
  - @memberjunction/sqlserver-dataprovider@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Minor Changes

- 1bb5c29: migration

### Patch Changes

- 41c5b8d: Implement comprehensive reverse dependency deletion system with cascading delete support, deletion auditing, and three-phase transaction processing. Records marked for deletion now trigger automatic dependency analysis, generate detailed audit reports, and are deleted in safe topological order. Deletion timestamps are written to metadata files after successful database operations. Includes protection against auto-creating records marked for deletion and automatic cleanup of SQL log files on user cancellation.
- Updated dependencies [264c57a]
- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/core-entities-server@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/graphql-dataprovider@2.118.0
  - @memberjunction/sqlserver-dataprovider@2.118.0
  - @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [8c092ec]
  - @memberjunction/core@2.117.0
  - @memberjunction/graphql-dataprovider@2.117.0
  - @memberjunction/core-entities@2.117.0
  - @memberjunction/core-entities-server@2.117.0
  - @memberjunction/sqlserver-dataprovider@2.117.0
  - @memberjunction/global@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [81bb7a4]
- Updated dependencies [a8d5592]
  - @memberjunction/core@2.116.0
  - @memberjunction/global@2.116.0
  - @memberjunction/graphql-dataprovider@2.116.0
  - @memberjunction/core-entities@2.116.0
  - @memberjunction/core-entities-server@2.116.0
  - @memberjunction/sqlserver-dataprovider@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/core-entities-server@2.115.0
- @memberjunction/sqlserver-dataprovider@2.115.0
- @memberjunction/graphql-dataprovider@2.115.0
- @memberjunction/core@2.115.0
- @memberjunction/core-entities@2.115.0
- @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/graphql-dataprovider@2.114.0
- @memberjunction/core@2.114.0
- @memberjunction/core-entities@2.114.0
- @memberjunction/core-entities-server@2.114.0
- @memberjunction/global@2.114.0
- @memberjunction/sqlserver-dataprovider@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/graphql-dataprovider@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/core-entities-server@2.113.2
  - @memberjunction/sqlserver-dataprovider@2.113.2
  - @memberjunction/global@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [e237ca9]
- Updated dependencies [c126b59]
  - @memberjunction/sqlserver-dataprovider@2.112.0
  - @memberjunction/global@2.112.0
  - @memberjunction/core-entities-server@2.112.0
  - @memberjunction/graphql-dataprovider@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/graphql-dataprovider@2.110.1
- @memberjunction/core@2.110.1
- @memberjunction/core-entities@2.110.1
- @memberjunction/core-entities-server@2.110.1
- @memberjunction/global@2.110.1
- @memberjunction/sqlserver-dataprovider@2.110.1

## 2.110.0

### Patch Changes

- Updated dependencies [02d72ff]
- Updated dependencies [d2d7ab9]
- Updated dependencies [c8b9aca]
  - @memberjunction/core-entities@2.110.0
  - @memberjunction/sqlserver-dataprovider@2.110.0
  - @memberjunction/core-entities-server@2.110.0
  - @memberjunction/graphql-dataprovider@2.110.0
  - @memberjunction/core@2.110.0
  - @memberjunction/global@2.110.0

## 2.109.0

### Minor Changes

- 1c155fb: Migration

### Patch Changes

- Updated dependencies [6e45c17]
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/graphql-dataprovider@2.109.0
  - @memberjunction/core-entities-server@2.109.0
  - @memberjunction/sqlserver-dataprovider@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0

## 2.108.0

### Minor Changes

- 8a53629: Migration

### Patch Changes

- 1fa712a: Add improved logging for individual record errors.
- Updated dependencies [656d86c]
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/core-entities-server@2.108.0
  - @memberjunction/sqlserver-dataprovider@2.108.0
  - @memberjunction/graphql-dataprovider@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/graphql-dataprovider@2.107.0
- @memberjunction/core@2.107.0
- @memberjunction/core-entities@2.107.0
- @memberjunction/core-entities-server@2.107.0
- @memberjunction/global@2.107.0
- @memberjunction/sqlserver-dataprovider@2.107.0

## 2.106.0

### Patch Changes

- 3ca1b36: Fix: Database default value handling in CodeGen and MetadataSync This changeset fixes issues with non-nullable fields that have database-defined default values. CodeGen now properly handles NULL parameters for these fields by wrapping them in ISNULL checks in stored procedures, and MetadataSync correctly applies defaults from .mj-sync.json configuration files.
  - @memberjunction/graphql-dataprovider@2.106.0
  - @memberjunction/core@2.106.0
  - @memberjunction/core-entities@2.106.0
  - @memberjunction/core-entities-server@2.106.0
  - @memberjunction/global@2.106.0
  - @memberjunction/sqlserver-dataprovider@2.106.0

## 2.105.0

### Patch Changes

- Updated dependencies [4807f35]
- Updated dependencies [9b67e0c]
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/core-entities-server@2.105.0
  - @memberjunction/sqlserver-dataprovider@2.105.0
  - @memberjunction/graphql-dataprovider@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Patch Changes

- Updated dependencies [2ff5428]
- Updated dependencies [4567af3]
- Updated dependencies [9ad6353]
- Updated dependencies [6e7f14a]
  - @memberjunction/global@2.104.0
  - @memberjunction/core-entities-server@2.104.0
  - @memberjunction/graphql-dataprovider@2.104.0
  - @memberjunction/core-entities@2.104.0
  - @memberjunction/sqlserver-dataprovider@2.104.0
  - @memberjunction/core@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
- Updated dependencies [3ba01de]
- Updated dependencies [a38eec3]
  - @memberjunction/core@2.103.0
  - @memberjunction/sqlserver-dataprovider@2.103.0
  - @memberjunction/core-entities-server@2.103.0
  - @memberjunction/graphql-dataprovider@2.103.0
  - @memberjunction/core-entities@2.103.0
  - @memberjunction/global@2.103.0

## 2.100.3

### Patch Changes

- 30afb26: Add alwaysPush flag for push command
  - @memberjunction/core-entities@2.100.3
  - @memberjunction/graphql-dataprovider@2.100.3
  - @memberjunction/core-entities-server@2.100.3
  - @memberjunction/sqlserver-dataprovider@2.100.3
  - @memberjunction/core@2.100.3
  - @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/graphql-dataprovider@2.100.2
- @memberjunction/core@2.100.2
- @memberjunction/core-entities@2.100.2
- @memberjunction/core-entities-server@2.100.2
- @memberjunction/global@2.100.2
- @memberjunction/sqlserver-dataprovider@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/graphql-dataprovider@2.100.1
- @memberjunction/core@2.100.1
- @memberjunction/core-entities@2.100.1
- @memberjunction/core-entities-server@2.100.1
- @memberjunction/global@2.100.1
- @memberjunction/sqlserver-dataprovider@2.100.1

## 2.100.0

### Patch Changes

- Updated dependencies [5f76e3a]
- Updated dependencies [b3132ec]
- Updated dependencies [ffc2c1a]
  - @memberjunction/core@2.100.0
  - @memberjunction/graphql-dataprovider@2.100.0
  - @memberjunction/core-entities@2.100.0
  - @memberjunction/core-entities-server@2.100.0
  - @memberjunction/sqlserver-dataprovider@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- Updated dependencies [eb7677d]
- Updated dependencies [8bbb0a9]
  - @memberjunction/core-entities@2.99.0
  - @memberjunction/graphql-dataprovider@2.99.0
  - @memberjunction/core@2.99.0
  - @memberjunction/core-entities-server@2.99.0
  - @memberjunction/sqlserver-dataprovider@2.99.0
  - @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/graphql-dataprovider@2.98.0
- @memberjunction/core@2.98.0
- @memberjunction/core-entities@2.98.0
- @memberjunction/core-entities-server@2.98.0
- @memberjunction/global@2.98.0
- @memberjunction/sqlserver-dataprovider@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/core-entities@2.97.0
- @memberjunction/graphql-dataprovider@2.97.0
- @memberjunction/core-entities-server@2.97.0
- @memberjunction/sqlserver-dataprovider@2.97.0
- @memberjunction/core@2.97.0
- @memberjunction/global@2.97.0

## 2.96.0

### Minor Changes

- 8e1c946: migration

### Patch Changes

- d7b5647: feat(metadata-sync): add deleteRecord feature for removing records via sync
  - Added deleteRecord directive to mark records for deletion in JSON files
  - Records with deleteRecord.delete=true are deleted during push operations
  - After successful deletion, adds deletedAt timestamp to track when deleted

- Updated dependencies [01dcfde]
  - @memberjunction/core@2.96.0
  - @memberjunction/graphql-dataprovider@2.96.0
  - @memberjunction/core-entities@2.96.0
  - @memberjunction/core-entities-server@2.96.0
  - @memberjunction/sqlserver-dataprovider@2.96.0
  - @memberjunction/global@2.96.0

## Unreleased

### Minor Changes

- **deleteRecord Feature**: Added support for deleting records from the database through the metadata sync tool
  - New `deleteRecord` directive allows marking records for deletion in JSON files
  - Records are deleted when `deleteRecord.delete` is set to `true`
  - After successful deletion, the tool updates the JSON with a `deletedAt` timestamp
  - Delete operations are included in SQL logs when SQL logging is enabled
  - Supports dry-run mode to preview deletions without executing them
  - Handles foreign key constraint errors gracefully with helpful error messages
  - Primary key is required to identify which record to delete
  - Once deleted (indicated by `deletedAt`), subsequent push operations skip the deletion
  - Takes precedence over normal create/update operations when present

### Implementation Details

- Modified `PushService.ts` to detect and process deleteRecord directives
- Added new `processDeleteRecord` method to handle deletion logic
- Updated `RecordData` interface to include optional `deleteRecord` field
- Modified `JsonWriteHelper` to properly serialize the deleteRecord field
- Delete operations generate appropriate SQL DELETE statements in migration logs
- Error handling provides detailed context for troubleshooting failed deletions

## 2.95.0

### Patch Changes

- Updated dependencies [a54c014]
  - @memberjunction/core@2.95.0
  - @memberjunction/graphql-dataprovider@2.95.0
  - @memberjunction/core-entities@2.95.0
  - @memberjunction/core-entities-server@2.95.0
  - @memberjunction/sqlserver-dataprovider@2.95.0
  - @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/core-entities@2.94.0
- @memberjunction/graphql-dataprovider@2.94.0
- @memberjunction/core-entities-server@2.94.0
- @memberjunction/sqlserver-dataprovider@2.94.0
- @memberjunction/core@2.94.0
- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- 103e4a9: Added comprehensive tracking fields to AI execution entities:
  - **AIAgentRun**: Added `RunName`, `Comment`, and `ParentID` fields for better run identification and hierarchical tracking
  - **AIPromptRun**: Added `RunName`, `Comment`, and `ParentID` fields for consistent tracking across prompt executions
  - **AIAgentRunStep**: Added `Comment` and `ParentID` fields for detailed step-level tracking
  - **Flow Agent Type**: Added support for Chat message handling to properly bubble up messages from sub-agents to users
  - **Action Execution**: Enhanced action execution logging by capturing input data (action name and parameters) in step entities
  - **CodeGen SQL Execution**: Fixed QUOTED_IDENTIFIER issues by adding `-I` flag to sqlcmd execution (required for indexed views and computed columns)
  - **MetadataSync Push Service**: Improved error reporting with detailed context for field processing failures, lookup failures, and save errors
  - Database migration `V202508231445__v2.93.0` adds the new tracking fields with proper constraints and metadata
  - Updated all generated entity classes, GraphQL types, and Angular forms to support the new fields
  - Enhanced error diagnostics in push service to help identify root causes of sync failures

- Updated dependencies [f8757aa]
- Updated dependencies [bfcd737]
- Updated dependencies [103e4a9]
- Updated dependencies [7f465b5]
  - @memberjunction/core@2.93.0
  - @memberjunction/sqlserver-dataprovider@2.93.0
  - @memberjunction/graphql-dataprovider@2.93.0
  - @memberjunction/core-entities@2.93.0
  - @memberjunction/core-entities-server@2.93.0
  - @memberjunction/global@2.93.0

## 2.92.0

### Patch Changes

- Updated dependencies [8fb03df]
- Updated dependencies [5817bac]
  - @memberjunction/core@2.92.0
  - @memberjunction/sqlserver-dataprovider@2.92.0
  - @memberjunction/core-entities@2.92.0
  - @memberjunction/core-entities-server@2.92.0
  - @memberjunction/graphql-dataprovider@2.92.0
  - @memberjunction/global@2.92.0

## 2.91.0

### Patch Changes

- Updated dependencies [f703033]
- Updated dependencies [6476d74]
  - @memberjunction/core@2.91.0
  - @memberjunction/core-entities@2.91.0
  - @memberjunction/core-entities-server@2.91.0
  - @memberjunction/graphql-dataprovider@2.91.0
  - @memberjunction/sqlserver-dataprovider@2.91.0
  - @memberjunction/global@2.91.0

## 2.90.0

### Patch Changes

- Updated dependencies [146ebcc]
- Updated dependencies [d5d26d7]
- Updated dependencies [1e7eb76]
  - @memberjunction/core@2.90.0
  - @memberjunction/core-entities@2.90.0
  - @memberjunction/core-entities-server@2.90.0
  - @memberjunction/sqlserver-dataprovider@2.90.0
  - @memberjunction/graphql-dataprovider@2.90.0
  - @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- Updated dependencies [d1911ed]
- Updated dependencies [34d456e]
- Updated dependencies [604ef0c]
  - @memberjunction/core-entities@2.89.0
  - @memberjunction/sqlserver-dataprovider@2.89.0
  - @memberjunction/graphql-dataprovider@2.89.0
  - @memberjunction/core-entities-server@2.89.0
  - @memberjunction/core@2.89.0
  - @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- Updated dependencies [56257ed]
- Updated dependencies [df4031f]
  - @memberjunction/sqlserver-dataprovider@2.88.0
  - @memberjunction/graphql-dataprovider@2.88.0
  - @memberjunction/core-entities@2.88.0
  - @memberjunction/core-entities-server@2.88.0
  - @memberjunction/core@2.88.0
  - @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- Updated dependencies [58a00df]
  - @memberjunction/core@2.87.0
  - @memberjunction/graphql-dataprovider@2.87.0
  - @memberjunction/core-entities@2.87.0
  - @memberjunction/core-entities-server@2.87.0
  - @memberjunction/sqlserver-dataprovider@2.87.0
  - @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- 7675555: Fix critical MetadataSync issues with parent-child dependencies and record processing

  **Fixed Issues:**
  1. **One Record Per Run Bug**: Fixed issue where only one new related entity was processed per sync run when multiple records were added
  2. **Parent-Child Dependencies**: Resolved "@parent:ID reference not found" errors by ensuring parents are saved before children
  3. **Complex Lookup Resolution**: Enhanced dependency analyzer to handle compound lookups with @parent references (e.g., `Name=X&AgentID=@parent:AgentID`)
  4. **Sync Metadata Regression**: Restored proper behavior where lastModified timestamps only update for actually changed records

  **Technical Changes:**
  - Use unique record IDs for batch context tracking instead of complex key building
  - Parents are now saved and added to batch context before processing children
  - Enhanced RecordDependencyAnalyzer to resolve @parent references within lookup criteria
  - Restored dirty checking and file content checksum comparison before updating sync metadata
  - Preserve original field values with @ references when writing back to files

  This ensures MetadataSync correctly handles complex entity hierarchies with proper dependency ordering.

- Updated dependencies [7dd2409]
  - @memberjunction/core-entities@2.86.0
  - @memberjunction/core-entities-server@2.86.0
  - @memberjunction/graphql-dataprovider@2.86.0
  - @memberjunction/sqlserver-dataprovider@2.86.0
  - @memberjunction/core@2.86.0
  - @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- 9b74582: Improved metadata sync push functionality with better dependency ordering and cleaner logging

  ## Changes

  ### Dependency Ordering
  - Added RecordDependencyAnalyzer to handle complex nested entity relationships
  - Records are now processed in correct dependency order using topological sorting
  - Supports @lookup, @parent, @root references and direct foreign keys
  - Handles circular dependencies gracefully with warnings

  ### Logging Improvements
  - Fixed confusing "Error in BaseEntity.Load" messages for missing records
  - Now shows clear messages like "Creating missing [Entity] record with primaryKey {...}"
  - Provides better visibility into what records are being created vs updated

  ### Code Cleanup
  - Removed 700+ lines of unused legacy code from PushService
  - Removed unused template processing methods from SyncEngine
  - Fixed parameter ordering in processFileContentWithIncludes method
  - Simplified initialize method in SyncEngine

  These improvements make the metadata sync tool more reliable when dealing with complex entity relationships and provide clearer feedback during push operations.

- Updated dependencies [747455a]
  - @memberjunction/core-entities@2.85.0
  - @memberjunction/sqlserver-dataprovider@2.85.0
  - @memberjunction/graphql-dataprovider@2.85.0
  - @memberjunction/core-entities-server@2.85.0
  - @memberjunction/core@2.85.0
  - @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [0b9d691]
  - @memberjunction/graphql-dataprovider@2.84.0
  - @memberjunction/core@2.84.0
  - @memberjunction/sqlserver-dataprovider@2.84.0
  - @memberjunction/core-entities@2.84.0
  - @memberjunction/core-entities-server@2.84.0
  - @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- Updated dependencies [e2e0415]
  - @memberjunction/core@2.83.0
  - @memberjunction/graphql-dataprovider@2.83.0
  - @memberjunction/core-entities@2.83.0
  - @memberjunction/core-entities-server@2.83.0
  - @memberjunction/sqlserver-dataprovider@2.83.0
  - @memberjunction/global@2.83.0

## 2.82.0

### Patch Changes

- Updated dependencies [c35f869]
- Updated dependencies [2186d7b]
- Updated dependencies [975e8d1]
  - @memberjunction/graphql-dataprovider@2.82.0
  - @memberjunction/core-entities@2.82.0
  - @memberjunction/core-entities-server@2.82.0
  - @memberjunction/sqlserver-dataprovider@2.82.0
  - @memberjunction/core@2.82.0
  - @memberjunction/global@2.82.0

## 2.81.0

### Patch Changes

- Updated dependencies [6d2d478]
- Updated dependencies [e623f99]
- Updated dependencies [971c5d4]
  - @memberjunction/core@2.81.0
  - @memberjunction/core-entities@2.81.0
  - @memberjunction/core-entities-server@2.81.0
  - @memberjunction/sqlserver-dataprovider@2.81.0
  - @memberjunction/graphql-dataprovider@2.81.0
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/graphql-dataprovider@2.80.1
- @memberjunction/core@2.80.1
- @memberjunction/core-entities@2.80.1
- @memberjunction/core-entities-server@2.80.1
- @memberjunction/global@2.80.1
- @memberjunction/sqlserver-dataprovider@2.80.1

## 2.80.0

### Patch Changes

- Updated dependencies [3073dc3]
- Updated dependencies [7c5f844]
- Updated dependencies [44a749c]
- Updated dependencies [d03dfae]
  - @memberjunction/core-entities-server@2.80.0
  - @memberjunction/graphql-dataprovider@2.80.0
  - @memberjunction/core@2.80.0
  - @memberjunction/core-entities@2.80.0
  - @memberjunction/sqlserver-dataprovider@2.80.0
  - @memberjunction/global@2.80.0

## 2.79.0

### Patch Changes

- Updated dependencies [4bf2634]
- Updated dependencies [907e73f]
  - @memberjunction/core-entities@2.79.0
  - @memberjunction/core-entities-server@2.79.0
  - @memberjunction/global@2.79.0
  - @memberjunction/graphql-dataprovider@2.79.0
  - @memberjunction/sqlserver-dataprovider@2.79.0
  - @memberjunction/core@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [06088e5]
  - @memberjunction/core-entities@2.78.0
  - @memberjunction/sqlserver-dataprovider@2.78.0
  - @memberjunction/core-entities-server@2.78.0
  - @memberjunction/graphql-dataprovider@2.78.0
  - @memberjunction/core@2.78.0
  - @memberjunction/global@2.78.0

## 2.77.0

### Patch Changes

- Updated dependencies [476a458]
- Updated dependencies [d8f14a2]
- Updated dependencies [8ee0d86]
- Updated dependencies [c91269e]
  - @memberjunction/sqlserver-dataprovider@2.77.0
  - @memberjunction/core@2.77.0
  - @memberjunction/graphql-dataprovider@2.77.0
  - @memberjunction/core-entities@2.77.0
  - @memberjunction/core-entities-server@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- Updated dependencies [f1e5990]
- Updated dependencies [4b27b3c]
- Updated dependencies [087595d]
- Updated dependencies [7dabb22]
- Updated dependencies [ffda243]
  - @memberjunction/graphql-dataprovider@2.76.0
  - @memberjunction/core-entities@2.76.0
  - @memberjunction/core-entities-server@2.76.0
  - @memberjunction/core@2.76.0
  - @memberjunction/sqlserver-dataprovider@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- Updated dependencies [66640d6]
- Updated dependencies [6a65fad]
  - @memberjunction/graphql-dataprovider@2.75.0
  - @memberjunction/core-entities-server@2.75.0
  - @memberjunction/sqlserver-dataprovider@2.75.0
  - @memberjunction/core@2.75.0
  - @memberjunction/core-entities@2.75.0
  - @memberjunction/global@2.75.0

## 2.74.0

### Patch Changes

- Updated dependencies [b70301e]
- Updated dependencies [d316670]
  - @memberjunction/core-entities@2.74.0
  - @memberjunction/core-entities-server@2.74.0
  - @memberjunction/core@2.74.0
  - @memberjunction/graphql-dataprovider@2.74.0
  - @memberjunction/sqlserver-dataprovider@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- Updated dependencies [e99336f]
  - @memberjunction/core-entities@2.73.0
  - @memberjunction/core-entities-server@2.73.0
  - @memberjunction/sqlserver-dataprovider@2.73.0
  - @memberjunction/graphql-dataprovider@2.73.0
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- Updated dependencies [636b6ee]
  - @memberjunction/core-entities@2.72.0
  - @memberjunction/graphql-dataprovider@2.72.0
  - @memberjunction/core-entities-server@2.72.0
  - @memberjunction/sqlserver-dataprovider@2.72.0
  - @memberjunction/core@2.72.0
  - @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0
  - @memberjunction/graphql-dataprovider@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/core-entities@2.71.0
  - @memberjunction/core-entities-server@2.71.0
  - @memberjunction/sqlserver-dataprovider@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/graphql-dataprovider@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/core-entities@2.70.0
  - @memberjunction/core-entities-server@2.70.0
  - @memberjunction/sqlserver-dataprovider@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/graphql-dataprovider@2.69.1
  - @memberjunction/core-entities@2.69.1
  - @memberjunction/core-entities-server@2.69.1
  - @memberjunction/sqlserver-dataprovider@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0
  - @memberjunction/core-entities-server@2.69.0
  - @memberjunction/graphql-dataprovider@2.69.0
  - @memberjunction/core-entities@2.69.0
  - @memberjunction/sqlserver-dataprovider@2.69.0

## 2.68.0

### Minor Changes

- 732c04a: migration

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

- Updated dependencies [a6b43d0]
- Updated dependencies [b10b7e6]
- Updated dependencies [0f38a61]
  - @memberjunction/sqlserver-dataprovider@2.68.0
  - @memberjunction/core@2.68.0
  - @memberjunction/core-entities-server@2.68.0
  - @memberjunction/graphql-dataprovider@2.68.0
  - @memberjunction/core-entities@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- Updated dependencies [1fbfc26]
  - @memberjunction/sqlserver-dataprovider@2.67.0
  - @memberjunction/core-entities-server@2.67.0
  - @memberjunction/graphql-dataprovider@2.67.0
  - @memberjunction/core@2.67.0
  - @memberjunction/core-entities@2.67.0
  - @memberjunction/global@2.67.0

## 2.66.0

### Patch Changes

- Updated dependencies [7e22e3e]
  - @memberjunction/core-entities-server@2.66.0
  - @memberjunction/graphql-dataprovider@2.66.0
  - @memberjunction/sqlserver-dataprovider@2.66.0
  - @memberjunction/core@2.66.0
  - @memberjunction/core-entities@2.66.0
  - @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- 619488f: Pattern filtering for sql logging
- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/global@2.65.0
  - @memberjunction/sqlserver-dataprovider@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/core-entities-server@2.65.0
  - @memberjunction/graphql-dataprovider@2.65.0
  - @memberjunction/core@2.65.0

## 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/core-entities-server@2.64.0
  - @memberjunction/graphql-dataprovider@2.64.0
  - @memberjunction/sqlserver-dataprovider@2.64.0
  - @memberjunction/core@2.64.0
  - @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/graphql-dataprovider@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1
  - @memberjunction/core-entities-server@2.63.1
  - @memberjunction/sqlserver-dataprovider@2.63.1

## 2.63.0

### Patch Changes

- 00e19b4: fix up directoryOrder support for root level metadata sync
- Updated dependencies [28e8a85]
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/core-entities-server@2.63.0
  - @memberjunction/graphql-dataprovider@2.63.0
  - @memberjunction/sqlserver-dataprovider@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/core-entities-server@2.62.0
  - @memberjunction/sqlserver-dataprovider@2.62.0
  - @memberjunction/graphql-dataprovider@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/core-entities-server@2.61.0
- @memberjunction/sqlserver-dataprovider@2.61.0
- @memberjunction/graphql-dataprovider@2.61.0
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
  - @memberjunction/core-entities-server@2.60.0
  - @memberjunction/graphql-dataprovider@2.60.0
  - @memberjunction/sqlserver-dataprovider@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/graphql-dataprovider@2.59.0
- @memberjunction/core@2.59.0
- @memberjunction/core-entities@2.59.0
- @memberjunction/core-entities-server@2.59.0
- @memberjunction/global@2.59.0
- @memberjunction/sqlserver-dataprovider@2.59.0

## 2.58.0

### Minor Changes

- a5f0905: Metadata fixes requires a minor bump
- 264bdc9: Migration Data Fixes

### Patch Changes

- def26fe: Added UUID generation to BaseEntity for entities that have single-column pkey that is uniqueidentifier type
- Updated dependencies [def26fe]
  - @memberjunction/core@2.58.0
  - @memberjunction/sqlserver-dataprovider@2.58.0
  - @memberjunction/graphql-dataprovider@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/core-entities-server@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Minor Changes

- 0ba485f: various bug fixes

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/core-entities-server@2.57.0
  - @memberjunction/global@2.57.0
  - @memberjunction/sqlserver-dataprovider@2.57.0
  - @memberjunction/graphql-dataprovider@2.57.0

## 2.56.0

### Patch Changes

- 17c7634: Integrate MetadataSync commands into MJCLI
  - Refactored MetadataSync from standalone CLI to reusable library
  - Moved all sync commands under `mj sync` namespace in MJCLI
  - Added service-based architecture for better modularity
  - Removed oclif dependencies from MetadataSync package

- Updated dependencies [bf24cae]
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/core-entities-server@2.56.0
  - @memberjunction/sqlserver-dataprovider@2.56.0
  - @memberjunction/graphql-dataprovider@2.56.0
  - @memberjunction/core@2.56.0
  - @memberjunction/global@2.56.0

## 2.55.0

### Minor Changes

- 49a4bd2: Migration file for new metadata for demo marketing agent along with metadata sync tool improvement

### Patch Changes

- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
  - @memberjunction/sqlserver-dataprovider@2.55.0
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/core-entities-server@2.55.0
  - @memberjunction/graphql-dataprovider@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- 98ef1f7: Loop Agent Type improvement + Metadata Sync tool Feeature for @include
- Updated dependencies [20f424d]
- Updated dependencies [dfca664]
- Updated dependencies [1273b07]
  - @memberjunction/core@2.54.0
  - @memberjunction/sqlserver-dataprovider@2.54.0
  - @memberjunction/graphql-dataprovider@2.54.0
  - @memberjunction/core-entities@2.54.0
  - @memberjunction/core-entities-server@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- Updated dependencies [bddc4ea]
- Updated dependencies [720aa19]
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/graphql-dataprovider@2.53.0
  - @memberjunction/core-entities-server@2.53.0
  - @memberjunction/sqlserver-dataprovider@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Minor Changes

- e926106: Significant improvements to AI functionality

### Patch Changes

- Updated dependencies [e926106]
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/sqlserver-dataprovider@2.52.0
  - @memberjunction/core-entities-server@2.52.0
  - @memberjunction/graphql-dataprovider@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Patch Changes

- Updated dependencies [4a79606]
- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
  - @memberjunction/core-entities-server@2.51.0
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/sqlserver-dataprovider@2.51.0
  - @memberjunction/graphql-dataprovider@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/graphql-dataprovider@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/core-entities-server@2.50.0
- @memberjunction/global@2.50.0
- @memberjunction/sqlserver-dataprovider@2.50.0

## 2.49.0

### Minor Changes

- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- 9350c54: Enhance error handling and add comprehensive user guidance
  - Improve error message formatting across all CLI commands to show readable errors instead of "[object
    Object]"
  - Add extensive documentation for creating error-free entity files with step-by-step guides
  - Include entity structure discovery guidance and troubleshooting reference
  - Fix common configuration mistakes in test data and examples
  - Add AI/LLM guidelines to prevent future automation errors

- ec4807f: Add recursive patterns support for self-referencing entities in pull commands. Enable automatic hierarchy traversal with `recursive: true` flag, eliminating manual nesting level configuration. Includes configurable depth limits, circular reference protection, and maintains backward compatibility with existing configurations.
- Updated dependencies [2f974e2]
- Updated dependencies [cc52ced]
- Updated dependencies [ca3365f]
- Updated dependencies [db17ed7]
- Updated dependencies [62cf1b6]
  - @memberjunction/core-entities@2.49.0
  - @memberjunction/core@2.49.0
  - @memberjunction/core-entities-server@2.49.0
  - @memberjunction/global@2.49.0
  - @memberjunction/sqlserver-dataprovider@2.49.0
  - @memberjunction/graphql-dataprovider@2.49.0

## 2.48.0

### Patch Changes

- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
  - @memberjunction/core@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/core-entities-server@2.48.0
  - @memberjunction/graphql-dataprovider@2.48.0
  - @memberjunction/sqlserver-dataprovider@2.48.0

## 2.47.0

### Patch Changes

- Updated dependencies [3f31192]
  - @memberjunction/sqlserver-dataprovider@2.47.0
  - @memberjunction/core-entities-server@2.47.0
  - @memberjunction/graphql-dataprovider@2.47.0
  - @memberjunction/core@2.47.0
  - @memberjunction/core-entities@2.47.0

## 2.46.0

### Patch Changes

- Updated dependencies [fa98215]
  - @memberjunction/core-entities-server@2.46.0
  - @memberjunction/graphql-dataprovider@2.46.0
  - @memberjunction/core@2.46.0
  - @memberjunction/core-entities@2.46.0
  - @memberjunction/sqlserver-dataprovider@2.46.0

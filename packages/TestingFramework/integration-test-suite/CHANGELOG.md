# @memberjunction/integration-test-suite

## 6.1.0-edge.3

### Minor Changes

- f5ec13b: Fix the queue engine's terminal-status write, and stop MJAPI's task-graph dispatcher from competing with a test harness.

  **`QueueBase` could never record a task outcome.** `StartTask` discarded the boolean `Save()` return, so the terminal-status write failed silently: the row kept whatever status it held before the run while the in-memory task still reported `Complete`. Underneath it, no role held `CanUpdate` on `MJ: Queue Tasks` or `MJ: Queues`, so CodeGen had never emitted an update grant and `spUpdateQueueTask` carried no `EXECUTE` grant at all. The Developer + Integration CRUD grants are now in `metadata/entity-permissions`, matching every other engine-written entity (`MJ: Tasks`, `MJ: Scheduled Jobs`, `MJ: Action Execution Logs`), with a migration that applies the SQL grants directly — a fresh install runs `migrate` + `sync push` and no CodeGen, so metadata alone would leave the permission correct in Explorer and broken at runtime.

  **`MJ_DISABLE_TASK_GRAPH_DISPATCHER` opts a server out of claiming.** A dispatcher claims from the whole `Task` table rather than from "its own" graphs, so a second dispatcher on the same database is a competitor — correct in production, and wrong for a harness that injects a stub runner and then asserts which tasks its own runner executed. Tasks MJAPI won were executed with the real agent runner and never reached the stub, which the harness read as "never ran". Immediately-eligible root tasks lose that race most often, so it presented as an intermittent failure.

  Also in the integration suite: the RLS fixture now carries the clauses discovery compared (a client-transport check cannot re-derive them and was reporting a cache leak that did not exist), the auth-validation fixtures supply every shipped provider's required config fields, the cache-gauntlet anti-vacuity floors are created rather than assumed, and the task-graph checks wait for the child read-back instead of silently undercounting.

- ae2baef: Content vectors: declare the entity on the content source, and let `explicit` omit the per-vector key

  Minor rather than patch on both: this adds a property to the `ContentSource.Configuration` JSONType, so
  it changes metadata rather than code alone.

  `VectorSearchProvider` could attribute a match two ways: an `Entity` key in the vector's own metadata,
  or an Entity Document targeting the index. Neither covers the ContentSource pipeline running
  `fieldStrategy: 'explicit'`, where metadata carries only the configured fields — `ContentSourceID` is
  present, the identity keys are not — and where the caller may not use Entity Documents at all.

  That gap is not cosmetic. `SearchEngine.filterEntityResults` groups results by `EntityName` and
  resolves each group with `EntityByName()` to evaluate CanRead and row-level security. An unresolvable
  name yields no `EntityInfo`, the method returns before admitting the group, and **the results are
  silently discarded** — `Residual permission filter removed N result(s)` is the only trace.

  A content source can now declare what its vectors are, via `VectorEntityName` on its `Configuration`
  JSON — the same place every other per-source vector knob already lives (`EnableVectorization`,
  `VectorIDStrategy`, `ChunkTextStorage`, `VectorMetadata`). When a match omits `Entity`, its
  `ContentSourceID` resolves through `KnowledgeHubMetadataEngine.GetContentSourceByID()` — an O(1) lookup
  against an already-cached collection — to that declaration.

  **The declaration is validated before it is trusted, twice.** Whatever it resolves to becomes the
  entity whose CanRead and row-level security `filterEntityResults` evaluates, and that method never
  checks the matched record ids belong to it. So the name must (a) resolve in metadata — an unresolvable
  name would otherwise silently delete a source's results rather than mislabel them — and (b) be one of
  `MJ: Content Items` / `MJ: Content Item Chunks`, or an IS-A subtype of one. Without (b) an arbitrary
  entity name in a writable configuration blob would decide which permissions apply. The canonical name
  from metadata is what gets used, so casing and whitespace cannot fork the grouping.

  Two properties worth calling out, because they are why this sits where it does rather than being
  inferred from somewhere else:
  - **Per match, not per index.** One vector index can serve many content sources, so an index-wide
    answer is wrong as soon as a second source shares the index. `ContentSourceID` travels on the vector.
  - **Declared, not guessed** — and validated, per above. Since attribution decides _which_ entity's
    permissions are evaluated, an inferred or unchecked name would put the wrong object's rules in front
    of the records — worse than no attribution, which merely drops them.

  Declaring it per source also lets a source name an **ISA extension** instead of the base entity it
  inherits from. That distinction is a security one: row-level security typically lives on the
  extension, so a hardcoded or index-wide base-entity name evaluates the wrong entity's RLS.

  Resolution order is most-specific-first: the match's own `Entity` key, then its content source's
  declaration, then the index's Entity Documents, then `'Unknown'` as before. A source that declares
  nothing — or declares something that fails validation — is simply absent from the lookup, so its matches
  behave exactly as they do today.

  Also fixed, both pre-existing:
  - `convertMatches` applied the resolved fallback with `??` while the "does this match need one" test is
    falsy, so an `Entity: ''` resolved a name and then discarded it — the result was dropped with the
    resolution already paid for.
  - `convertMatches` had the same `??` on `RecordID`, so a producer writing `RecordID: ''` shipped an empty
    record id instead of falling through to the vector's own id — dropped by the permission filter on an
    `IN ('')`, or returned as a result that cannot be opened.

  `extractDisplayTitle` is deliberately left reading `meta['Entity']` rather than the resolved name, with a
  comment saying so. It looks like an oversight and is not: when the metadata carries no name fields it
  falls through to `` `${fallbackEntity} Record` ``, and that string is the sentinel
  `SearchEnricher.resolveRecordNames` matches to replace the title with the live name from the database.
  Feeding the resolved entity in makes the name-field branch succeed off the embedding-time snapshot, the
  sentinel never forms, and a renamed record shows a stale title until it is re-embedded.

  Failures decline rather than guess, and each declines narrowly: a source whose `Configuration` will not
  parse is skipped on its own (one guard per source, not one around the batch, so a single bad blob cannot
  downgrade every match after it to a different entity's permissions), and a `KnowledgeHubMetadataEngine`
  load that is **permission-constrained** declines explicitly instead of reading its empty collections as
  "nothing declared" — otherwise attribution would silently depend on who was searching.

  **Attribution failure is now audible.** A batch containing matches that no step could name logs the
  count, the index, a sample of vector ids, and the three ways to fix it — once per index per batch, and
  only when it happens. Before this, such matches were discarded by `filterEntityResults` with no log on
  that path at all; the sole trace was the aggregate `Residual permission filter removed N result(s)`,
  whose wording blames incomplete provider push-down. So the one signal a deployment got pointed away from
  the cause, which is why "vectors are in the index and never surface" was undiagnosable.

  **And the write side can now drop the key.** With a declaration in place, `'explicit'` genuinely omits
  `Entity` and writes `ContentSourceID` instead — the source becomes the single place the answer lives
  rather than a string repeated on every vector. Previously the key could not be removed by configuration
  at all on this pipeline: it is written _before_ the `explicit` early return (the EntityDocument pipeline
  has it the other way around), and there is no `IncludeEntity` toggle beside `IncludeEntityIcon` /
  `IncludeUpdatedAt` / `IncludeTags` / `IncludeText`.

  The declaration is validated where it is written, not only where it is read. It must resolve in
  metadata, and it must name `MJ: Content Item Chunks` or an IS-A subtype — because omission requires
  `'alwaysChunk'`, which makes every vector a chunk row whose id is a chunk key. A name that fails either
  check keeps the `Entity` key and logs once per run. This fails _safe_ rather than closed, and
  deliberately so: the reader can only refuse a bad declaration after the fact, by which point the vectors
  carry no entity at all, so correcting the configuration would not recover them without a re-embed.

  Omission is therefore gated on all four of `'explicit'`, a declaration resolving to the chunk entity,
  `ChunkTextStorage: 'alwaysChunk'` and `VectorIDStrategy: 'recordId'`, with
  `ContentSourceID` then written unconditionally. Each condition keeps the guarantee that every vector
  carries either `Entity` or a key that resolves to a declared entity:
  - **`'mixed'`** emits ContentItem-level vectors for single-chunk items and ContentItemChunk-level vectors
    for the rest — two entities from one source, which one declaration cannot describe.
  - **`'hash'`** leaves no recoverable record id, since `'explicit'` drops `RecordID` too and the vector's
    own id is a digest rather than the row's. Attribution would succeed and then hand search an id that
    resolves against no row — the same disappearance, one step later.
  - **Other field strategies** document a populated metadata set; dropping a key their consumers are told
    is always present would be a behavior change for them.

  Anything else keeps writing `Entity` exactly as before, and existing vectors are untouched — they keep
  resolving through their stored key (resolution step 1), so no re-index is required.

  Integration coverage comes with it: `IT — content-vectorization` gains CV7 (a declaring source omits
  `Entity`, promotes `ContentSourceID`, and its vector id is the chunk row's PK) and CV8 (three refusal
  paths — no opt-in, an unresolvable name, and a declaration naming the item entity — each keep the key).

  No schema change and no migration. It does add a property to the `ContentSource.Configuration` JSONType,
  so `mj sync push` + `mj codegen` are needed before the typed accessor exists; until then both sides read
  it through a locally-declared interface that is deleted at that point. Behaviour is unchanged for callers
  whose matches carry `Entity` metadata and for any index resolving through an Entity Document.

### Patch Changes

- f5ec13b: Move the shared LLM conformance suite out of the runtime `@memberjunction/ai` package, and gate silent skip-growth in the integration registry (review fixes for #3542).

  **Conformance suite relocated to `@memberjunction/unit-testing`.** The shared BaseLLM
  streaming/ChatResult conformance suite and its OpenAI-compatible seam mock previously lived in
  `@memberjunction/ai/src/test-support/` and were consumed through a deep `@memberjunction/ai/dist/test-support/*.js`
  import — reaching past the package's public API into its build output, which resolved only because
  `@memberjunction/ai` has no `exports` map, and which shipped test code plus an optional `vitest`
  peer dependency inside the runtime package. Both files (and the suite's own reference regression
  test) now live in `@memberjunction/unit-testing`, are exported from its index
  (`RunLLMConformanceSuite`, `CreateOpenAICompatibleSeamMock`, and their types), and the eight
  provider conformance suites import them from `@memberjunction/unit-testing`. `@memberjunction/ai`
  no longer ships `dist/test-support/*` and no longer declares the optional `vitest` peer. No runtime
  behavior changes; test-only wiring.

  **Skip-growth is now gated, not just reported.** `check-registry.test.ts` gained a snapshot of the
  exact set of checks that self-skip out of the deterministic lane (every `RequiresMutation` and
  `RequiresLiveModel` check across all bundles). A change that makes a check newly self-skip — or
  silently un-gates one — now fails the unit tests with a paste-ready diff, instead of only shrinking
  the CI step-summary. Also corrected a stale `task-graph-execution` count (26 → 27) in the
  all-bundle coverage-loss guard that had drifted after a `next` merge added TX27.

- c581b4f: Close the #3874 adversarial review. SkipRelatedCollections persists embeds while collections stay with the caller. The graph-node recursion guard is private on BaseEntity (IsGraphNodeSave is gone from EntitySaveOptions). Result serialize adopts saved peers; a rolled-back graph reverts in-memory saved/dirty so retry works. Two same-entity embeds no longer false-cycle. Ensure, Load, NewRecord FK, CodeName emission, core-schema imports, IT85/EE5, graph-view UUID links, focal-node dblclick, and default excludeSchemas no longer dropping core form tabs.
- 2741d46: Make the deterministic integration tier runnable against PostgreSQL, and fix the runtime and conversion defects that running it exposed.

  **Why.** MJ #3257 records that the integration suite is meant to run twice per build — once per backend — and that this was never implemented. PostgreSQL therefore shipped with migration parity verified and _runtime_ parity unverified. This change makes the tier run on PostgreSQL for the first time and fixes what that surfaced: **49 of 61 deterministic bundles now pass on PostgreSQL** (measured, MJAPI live; 61/61 executed, none skipped).

  **Harness (closes the #3257 blocker list).** `testing-cli` now branches on platform instead of unconditionally building an `mssql` pool: `mj-provider.ts` gains a PostgreSQL path (dynamic import, declared as an optionalDependency so SQL-Server-only consumers never resolve `pg`) with a PG-native user-cache load, `MJConfig` gains `dbPlatform`, and `getContextUser()` resolves the same user on both backends — System by name, then the well-known System ID, then the first active Owner, with `.trim()` because `Type` is space-padded in both ledgers. `mj.config.cjs` gains `dbPlatform` and a platform-aware `dbPort` default; with `DB_PLATFORM` unset both are exactly the previous SQL Server behaviour.

  **Runtime dialect leaks.**
  - `SQLDialect` gains `AffectedRowCountSQL()`. `TaskClaimStore` was emitting `SELECT @@ROWCOUNT`, which is T-SQL only — on PostgreSQL the `@@` is consumed as a parameter marker and the bare `ROWCOUNT` folds to lowercase, so _every_ guarded write failed with `column "rowcount" does not exist` (7,168 occurrences in one tier run, now zero). SQL Server keeps `@@ROWCOUNT`; PostgreSQL uses a data-modifying CTE.
  - `MJDashboardEntityExtended` no longer denies the owner. `Validate()` is synchronous and reads `DashboardEngine`'s cache directly, so in any process using the default `task` startup mode — where engine pre-warm is deferred — an unloaded cache was indistinguishable from "you have no permission", and `mj sync push` failed on a dashboard whose `UserID` _was_ the pushing user. Ownership is now answered from the row itself, which needs no cache; a non-owner still falls through to the engine and is refused when it is cold. `Delete()`, being async, loads the engine for the non-owner case and short-circuits for the owner, so a merely _stale_ cache — a dashboard created since the last `Config()` is absent from the backing array — cannot refuse its own owner either.

    Ownership is read from the **persisted** `UserID` (`GetFieldByName('UserID').OldValue`), never the in-memory one. `UserID` is a settable field on `UpdateMJDashboardInput`, and `ResolverBase.UpdateRecord` loads the row and then applies the client's values _before_ `Save()` runs `Validate()` — so an owner check written against `this.UserID` would be satisfied by a value the caller supplied in the same request. Since this class **is** the permission gate for dashboards, that would let any user who can load one send `UpdateMJDashboard(ID: <someone else's>, UserID: <self>)` and take the record. Transferring ownership is separately gated to the owner, so a user holding `CanEdit` through a share can edit but not appropriate. `MJDashboardEntityExtended.ownership.test.ts` covers both directions, including that the engine is still consulted for the attacker case.

  **Conversion (T-SQL → PostgreSQL).** Five defects, each caught only by applying the output to a fresh database — the converter reported `0 errors` every time:
  - CASE-expression keywords were quoted as identifiers inside `CHECK` bodies (`"CASE" "WHEN" …`), so the migration would not parse. The missing keyword set was derived by intersecting 2,084 `CHECK` bodies across 67 shipped migrations against the dialect keyword list: exactly `CASE`, `WHEN`, `THEN`, `ELSE`, `END`.
  - Every `IF EXISTS (…)` batch was classified `SKIP_SQLSERVER` and silently discarded. A guarded `DROP CONSTRAINT` therefore vanished — with exit code 0 — and the paired `ADD CONSTRAINT` later in the same migration failed with "already exists". The rewrite discards the guard, so it fires **only when the guard is a catalog probe** (`sys.check_constraints` / `key_constraints` / `foreign_keys` / `default_constraints` / `objects`) — the form that exists purely because SQL Server has no `DROP CONSTRAINT IF EXISTS`. A guard on data (`IF EXISTS (SELECT 1 FROM Payment WHERE Status = 'Legacy')`) is a real condition; dropping it would make PostgreSQL drop unconditionally while SQL Server does not. Those keep falling through to the generic path, which comments out what it cannot express. This mirrors the `sys.indexes` gate the conditional-index rule already had.
  - `CREATE SCHEMA` is folded to lowercase to match its unquoted references — `convertIdentifiers` emits the schema half of `[X].[Y]` bare, so a quoted `CREATE` and a bare reference name two different schemas. **`__mj_UDT` is exempt**, because it is the one schema with a producer outside the migration set: the Database Designer creates it, and every table in it, through `UDT_SCHEMA_NAME` — quoted and case-preserved, as do `CreateSchemaDDL`, `QuoteSchema` and the schema-builder's `QuotePostgres`. Folding it would leave the runtime writing into a schema no migration made, and would orphan every UDT entity from its table in `vwSQLTablesAndEntities`, which joins `nspname = e."SchemaName"` case-sensitively. Nothing wants the folded spelling: across `migrations-pg/` there is not one unquoted `__mj_udt` reference, and all 272 other occurrences of the name are prose or JSON string content. No reconciliation DDL is emitted for any schema — a guard at that point would land in the converted output of the migration that CREATES the schema, the one file every affected database has already applied and Flyway will never re-run, so it could only ever fire on a database that does not need it.
  - T-SQL table variables became the invalid declaration `v_X TABLE;`; they now become `CREATE TEMP TABLE … ON COMMIT DROP`.
  - `DELETE alias FROM … JOIN …` passed through as T-SQL; it now becomes PostgreSQL's `DELETE … USING` (the UPDATE analogue already existed).
  - `WITH CHECK ADD CONSTRAINT` survived on non-FK constraints, and `END ELSE BEGIN` left stray tokens. A subtler one: the `DECLARE` indent capture also matched a preceding blank line, which pushed the declaration out of the `DECLARE` section and into the block body.

  **Also fixed.** `spDeleteEntityWithCoreDependencies` could not be invoked on PostgreSQL — `callRoutineSQL` always emitted `SELECT * FROM fn(...)`, which PostgreSQL rejects for a `RETURNS SETOF record` routine with no OUT parameters, so entity pruning silently died and cascaded into 22 missing CRUD routines. `callRoutineSQL` gains an optional `expectsResultSet`; SQL Server ignores it. CodeGen's PostgreSQL audit-SQL folder swap was pinned to `v5` by exact match, so on v6 it wrote into the SQL Server tree. `applyLLMPrimaryKeys` validated primary-key names case-insensitively but then used the model's spelling in the `UPDATE`, matching zero rows on PostgreSQL while reporting success — it now uses the matched column's actual name.

  **Repeatable metadata refresh.** `R__RefreshMetadata` on PostgreSQL now also clears orphaned `EntityField` rows, as the SQL Server file has always done. Without it a from-scratch PostgreSQL database ends up with metadata describing columns its own base views do not have, and every read of those views fails.

  **Two test-authoring fixes, not product changes.** The aggregates bundle passed `MAX(__mj_UpdatedAt)` unquoted and the open-app-teardown fixture called `SYSDATETIMEOFFSET()`; both are SQL-Server-only spellings and are now dialect-quoted.

  **On the `migrations-pg/v6/**`files in this PR.**`CLAUDE.md`says a feature PR ships the T-SQL migration only and that PG counterparts are regenerated by the build engineer at release time. The five files here are`mj migrate convert`output, not hand-authored, and they exist because the tier cannot run on PostgreSQL without them — that is the whole subject of the change. They need the build engineer's sign-off before merge, and should be regenerated rather than merged if the release conversion runs first. Existing`migrations-pg`output is deliberately **not** regenerated against the converter changes above: the v5 files are frozen baselines, and the`\_\_mj_UDT` exemption above means the converter's new output agrees with what they already installed.

  SQL Server is unaffected: every changed path is either PostgreSQL-only or a same-output refactor. Unit tests across the touched packages pass — SQLDialect 404, SQLConverter 1139, MJCoreEntities 597, CodeGenLib 808, TaskGraph 60, testing-cli 23 — zero failures in any of them.

- Updated dependencies [834f8d7]
- Updated dependencies [5ef97ff]
- Updated dependencies [d4a5b4c]
- Updated dependencies [f5ec13b]
- Updated dependencies [199eb2b]
- Updated dependencies [f80bdb7]
- Updated dependencies [407f2f7]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [49f3592]
- Updated dependencies [1fdd5d0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [f5ec13b]
- Updated dependencies [2e2879e]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [2741d46]
- Updated dependencies [b6416f4]
- Updated dependencies [bc45ded]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [d0a2a55]
- Updated dependencies [ae2baef]
- Updated dependencies [4b1257f]
- Updated dependencies [6cd337d]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/aiengine@6.1.0-edge.3
  - @memberjunction/ai-agents@6.1.0-edge.3
  - @memberjunction/scheduling-engine@6.1.0-edge.3
  - @memberjunction/codegen-lib@6.1.0-edge.3
  - @memberjunction/content-autotagging@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/task-graph@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/graphql-dataprovider@6.1.0-edge.3
  - @memberjunction/generic-database-provider@6.1.0-edge.3
  - @memberjunction/ai-prompts@6.1.0-edge.3
  - @memberjunction/metadata-sync@6.1.0-edge.3
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.3
  - @memberjunction/storage@6.1.0-edge.3
  - @memberjunction/api-keys@6.1.0-edge.3
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.3
  - @memberjunction/open-app-engine@6.1.0-edge.3
  - @memberjunction/auth-providers@6.1.0-edge.3
  - @memberjunction/queue@6.1.0-edge.3
  - @memberjunction/testing-integration@6.1.0-edge.3
  - @memberjunction/search-engine@6.1.0-edge.3
  - @memberjunction/ai-agent-harness@6.1.0-edge.3
  - @memberjunction/ai-engine-base@6.1.0-edge.3
  - @memberjunction/predictive-studio@6.1.0-edge.3
  - @memberjunction/ai-bridge-base@6.1.0-edge.3
  - @memberjunction/ai-bridge-server@6.1.0-edge.3
  - @memberjunction/actions-base@6.1.0-edge.3
  - @memberjunction/actions@6.1.0-edge.3
  - @memberjunction/communication-types@6.1.0-edge.3
  - @memberjunction/communication-engine@6.1.0-edge.3
  - @memberjunction/notifications@6.1.0-edge.3
  - @memberjunction/communication-ms-graph@6.1.0-edge.3
  - @memberjunction/communication-expo-push@6.1.0-edge.3
  - @memberjunction/communication-gmail@6.1.0-edge.3
  - @memberjunction/communication-sendgrid@6.1.0-edge.3
  - @memberjunction/communication-twilio@6.1.0-edge.3
  - @memberjunction/conversations-runtime@6.1.0-edge.3
  - @memberjunction/query-processor@6.1.0-edge.3
  - @memberjunction/record-set-processor-base@6.1.0-edge.3
  - @memberjunction/record-set-processor@6.1.0-edge.3
  - @memberjunction/redis-provider@6.1.0-edge.3
  - @memberjunction/templates-base-types@6.1.0-edge.3
  - @memberjunction/templates@6.1.0-edge.3
  - @memberjunction/predictive-studio-core@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- 006fb69: Enforce the #3251 deterministic-suite ordering invariant with a test rather than a convention: every
  server-transport bundle must sequence before every client-transport one, so a client-bundle failure
  is unambiguously a client-seam failure and not fallout from server-transport state left behind
  earlier in the run.

  The rule had already been violated once (IT71 at sequence 34, tied with the first client bundle) and
  went unnoticed until a program wrap-up. Three companion assertions stop the interesting one passing
  vacuously — non-empty membership, a declared transport on every member, and a real sequence on every
  member. Verified by reproducing the original mistake and confirming it fails.

- d8adda1: **BREAKING — `UserCache` moved packages. Update the import, not just the call.**

  `UserCache` now lives in `@memberjunction/generic-database-provider`. It is no longer exported
  from `@memberjunction/sqlserver-dataprovider`, and there is deliberately **no re-export shim**,
  so every import of the symbol must be repointed or it will fail to resolve:

  ```diff
  - import { UserCache } from '@memberjunction/sqlserver-dataprovider';
  + import { UserCache } from '@memberjunction/generic-database-provider';
  ```

  `Refresh` is now dialect-neutral and takes the configured provider rather than an
  `mssql.ConnectionPool`:

  ```diff
  - await UserCache.Instance.Refresh(pool, intervalMs);
  + await UserCache.Instance.Refresh(provider, intervalMs);
  ```

  **These are two separate breaks, and the first is much wider than the second.** The import path
  affects _every_ consumer of the symbol — reads included. The signature affects only the handful
  of callers of `Refresh`. Anything that imports `UserCache` merely to call `Users`,
  `GetSystemUser()` or `UserByName()` still has to change its import, so a consumer who reads only
  "the signature changed" will treat this as a no-op and fail to build. In this repo the split was
  56 files versus 9 call sites.

  Packages that import `UserCache` must also declare `@memberjunction/generic-database-provider`
  as a dependency — pnpm resolves strictly, so an undeclared import fails rather than falling
  through to a hoisted copy.

  **Check for dynamic imports too**, not just static ones. `await import('@memberjunction/sqlserver-dataprovider')`
  destructuring `UserCache` breaks the same way, and a grep for `import { … } from` will not find it.

  **Unchanged:** the read surface (`Users`, `GetSystemUser`, `UserByName`, `SYSTEM_USER_ID`), and
  the class name. The name is load-bearing — `BaseSingleton` keys its global store on the
  constructor name, so keeping it `UserCache` preserves singleton identity across the move.

  **Also fixed:** `_users` now initializes to `[]`. It previously stayed `undefined` after a
  `Refresh` that never ran or that failed (failures are swallowed into `LogError`), so
  `GetSystemUser()` threw a `TypeError` off `.find()` instead of returning `undefined` as its
  callers already assume.

  **Why:** the cache was dialect-neutral except for that one `mssql` type, which left PostgreSQL
  with no user cache at all and produced four separate hand-rolled "read `vwUsers` + `vwUserRoles`,
  build `UserInfo[]`" implementations — one of which reached into the singleton's private field
  through a cast from another package. Those are all removed, and a PostgreSQL process that never
  goes through the server bootstrap now has a system user.

- ca4feb4: Workflow cost becomes a projection of the run tree, and a graph now runs in the order it was drawn.

  **Cost is the tree, not arithmetic beside it.** `AIAgentRun`'s four `…Rollup` columns are now written from `SumAgentRunTreeCost(LoadAgentRunTree(runID))` at settlement — one basis (per-node own spend), prompt-aware through `Configuration.runtime.promptRunID`, and structurally incapable of disagreeing with what the run viewer shows. The previous per-child loop filtered on `AgentRunID`, so every Prompt step's spend was absent, and mixed a descendant-inclusive number with an own-spend one. The tree now also carries the prompt/completion token split so all four columns share a basis. Writing the sum back makes the column an _output_ of the tree, which is non-circular only because the query reads own cost and never a rollup — stated in the query header and pinned by a test that plants an absurd rollup on a real run. When the tree cannot be summed (load failure, depth cap, graph not reachable), the columns are **cleared** rather than left holding a stale total from an earlier settlement.

  **A loop's passes exist.** The run tree reaches nested work through six relationships and a loop iteration was none of them, so a `While` that spent real money across three passes reported one childless node with no cost. The dispatcher now records one entry per pass (`ITaskStepRuntime.iterations`) and the tree expands them into nodes. On a real workflow this moved `TotalCostRollup` from `0.00049725` to `0.00555375` — the loop had been spent and not counted.

  **A graph is dispatched only once its edges exist.** Children and dependencies are now written in one transaction. Previously a poll could land between the two writes, see tasks with no prerequisites, and claim the whole graph at once — observed running a closing branch before the draft it was meant to judge existed, then reporting Complete.

  **Steps see their payload.** A step with no input mapping fell back to the raw input instead of the merged payload, so a Prompt step — which declares no mapping by design — rendered `{{ _CURRENT_PAYLOAD }}` as `{}` and wrote from an empty brief. Separately, a step with no output mapping _replaced_ the payload with its own output rather than merging; for a loop, whose output is a summary, that discarded everything the iterations had established and made a downstream `payload.x === true` edge unreachable.

  **An output mapping that names a parameter the step never returns now says so** (`unmapped`), naming what the step did return, instead of skipping in silence.

  **Human steps**: a cancelled request re-raises instead of stalling forever; cancelling a graph withdraws its open requests instead of leaving them in someone's inbox; cross-user `assignToUserID` is refused at submission rather than silently reassigned to the submitter; and a step can declare `expiresInHours`, which finally makes the existing expiry machinery reachable.

  **Web Search** captured each result with a non-greedy match that stopped at the first nested `</div>`, cutting the snippet out of every result — ten well-formed hits carrying no content. Results are now sliced between block starts, and an all-snippets-empty parse is reported rather than returned silently.

  **Testing**: a bundle whose every check is gated out now records an explicit skip naming the flag that would run it, instead of reporting PASS with zero checks executed.

- Updated dependencies [d430fa5]
- Updated dependencies [c49a34a]
- Updated dependencies [71817db]
- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [59def38]
- Updated dependencies [6bb2e1f]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [aa4fbe9]
- Updated dependencies [9fc0e2d]
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [e26c866]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [82a8585]
- Updated dependencies [d8adda1]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/codegen-lib@6.1.0-edge.2
  - @memberjunction/search-engine@6.1.0-edge.2
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/ai-agents@6.1.0-edge.2
  - @memberjunction/actions-base@6.1.0-edge.2
  - @memberjunction/actions@6.1.0-edge.2
  - @memberjunction/generic-database-provider@6.1.0-edge.2
  - @memberjunction/scheduling-engine@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/task-graph@6.1.0-edge.2
  - @memberjunction/open-app-engine@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/graphql-dataprovider@6.1.0-edge.2
  - @memberjunction/testing-integration@6.1.0-edge.2
  - @memberjunction/ai-engine-base@6.1.0-edge.2
  - @memberjunction/aiengine@6.1.0-edge.2
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.2
  - @memberjunction/metadata-sync@6.1.0-edge.2
  - @memberjunction/notifications@6.1.0-edge.2
  - @memberjunction/ai-agent-harness@6.1.0-edge.2
  - @memberjunction/predictive-studio@6.1.0-edge.2
  - @memberjunction/ai-prompts@6.1.0-edge.2
  - @memberjunction/ai-bridge-base@6.1.0-edge.2
  - @memberjunction/ai-bridge-server@6.1.0-edge.2
  - @memberjunction/api-keys@6.1.0-edge.2
  - @memberjunction/communication-types@6.1.0-edge.2
  - @memberjunction/communication-engine@6.1.0-edge.2
  - @memberjunction/communication-ms-graph@6.1.0-edge.2
  - @memberjunction/communication-sendgrid@6.1.0-edge.2
  - @memberjunction/content-autotagging@6.1.0-edge.2
  - @memberjunction/conversations-runtime@6.1.0-edge.2
  - @memberjunction/query-processor@6.1.0-edge.2
  - @memberjunction/record-set-processor@6.1.0-edge.2
  - @memberjunction/templates-base-types@6.1.0-edge.2
  - @memberjunction/templates@6.1.0-edge.2
  - @memberjunction/communication-expo-push@6.1.0-edge.2
  - @memberjunction/communication-gmail@6.1.0-edge.2
  - @memberjunction/communication-twilio@6.1.0-edge.2
  - @memberjunction/record-set-processor-base@6.1.0-edge.2
  - @memberjunction/predictive-studio-core@6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

- 394d276: **IT74 executes task graphs for real, and fixes the three production bugs that found.**

  IT71 has eighteen checks and not one of them runs a graph — nine assert metadata, nine verify the rows a save produces. Everything past "the rows are correct" was unit-tested against fixtures and never against SQL Server. IT74 stands up a real `TaskGraphDispatcher` with a stub `TaskAgentRunner` injected through its existing seam, so the claim protocol, condition evaluator and rollup all run with no model calls, no tokens and no network.

  **The dispatcher read its own work queue through a stale cache.** `TaskClaimStore` mutates task rows via direct SQL — correct, since the CAS guarantee _is_ the database's atomicity — but direct DML fires no invalidation, and the discovery queries used `RunView` without `BypassCache`. Completions written on the claim path stayed invisible, so `loadGraphState` kept seeing `In Progress` and graphs never rolled up.

  **A graph that succeeded could never settle.** `findActiveGraphIDs` selected graphs by non-terminal _children_, so the moment the last child completed the graph left that set — and the pass that would have rolled the parent up never saw it. Every fully-successful graph stayed `In Progress` forever and its continuation never fired. A _failing_ graph happened to survive, because blocking its dependents left them non-terminal for one more pass, which is why the bug hid behind a passing failure-path test.

  **A not-taken branch ran instead of being skipped.** A definitely-false edge condition was resolved by _dropping_ the edge — which removes the dependent's only prerequisite and makes it eligible in the very next wave, potentially before the node that gated it. The code's own argument against dropping unevaluable edges ("a prerequisite silently disappears and the dependent task runs early") applies verbatim to the false case. Such a dependent is now recorded unreachable and blocked, and only when _every_ route in was cut.

  Also hardened: `ComputeParentRollup` treats an empty child set as Complete-and-terminal, which is right for a childless graph and catastrophic for one whose reload came back empty transiently — it would mark live work finished and fire its continuation. The outer guard covered the first load only.

  `TaskGraphDispatcherConfig.PollIntervalSeconds` is new (default 5, unchanged behavior). The interval was hardcoded; five seconds is right for production, where steps are agent runs, but it made a four-node graph take twenty seconds to observe.

- 394d276: Phase 1 of the unified workflow DAG engine program (plan: PR #3456) — makes the task substrate tell the truth about what actually happened.

  **Payloads become columns.** `Task` gains `InputPayload`, `OutputPayload`, `ErrorMessage`, and `AgentRunID`. Inputs and outputs previously rode inside `Task.Description` behind `__TASK_METADATA__` / `__TASK_OUTPUT__` markers, which leaked orchestration plumbing into search results and the task detail panel. A one-time migration backfill converts existing marker rows into the new columns and strips the markers; there is deliberately **no fallback parse** in code, because a fallback with no backfill never dies. The backfill is conservative — a row whose marker text doesn't parse as JSON is left byte-for-byte intact for inspection rather than silently discarded.

  **Failures propagate instead of stalling.** A `Failed` dependency used to leave its dependents `Pending` forever: they never became eligible, so the graph appeared to finish while work silently never ran — and the parent was marked `Complete` at 100% regardless. Now failure propagates transitively to `Blocked`, and the parent rolls its children up honestly (`Failed` > `Blocked` > `Cancelled` > `Complete`, with progress counting only completed children). Completion notifications fire only for genuinely successful graphs.

  **Bad graphs are rejected before they are persisted.** Dependency cycles are detected at creation (a cyclic graph could previously be saved and then deadlock silently), and a graph naming an unknown agent is now an error rather than being logged-and-skipped — which used to execute the graph with holes where the caller's tasks should have been.

  **Waves run in parallel.** Eligible tasks execute with bounded concurrency (5) rather than one at a time, and each pass loads the graph once instead of issuing a dependency query per candidate task. Stalled graphs — pending work, nothing runnable, nothing in flight — are now detected and logged rather than exiting quietly.

  **The Gantt links the right run.** `Task.AgentRunID` records the specific run that executed each task. The UI previously joined tasks to runs through the shared `ConversationDetailID`, so every sibling task in a graph resolved to the _same_ agent run; the link was wrong for all but one. `Blocked` and `Failed` also now render distinctly instead of inheriting the pending treatment.

  **New pure graph algorithms** in `@memberjunction/ai-core-plus` (`computeEligibleTasks`, `computeTasksToBlock`, `computeParentRollup`, `detectCycle`, `isGraphStalled`, `findUnknownDependencyRefs`) — dependency-free, operating on plain shapes rather than entities, with 44 unit tests. Phase 2's durable dispatcher consumes these unchanged rather than reimplementing eligibility and propagation.

  **Also:** dispatcher claim columns (`ClaimedBy`, `ClaimExpiresAt`) and their supporting indexes land now so Phase 2 adds the dispatcher without further schema churn — nothing reads them yet. `AIAgentRunStep.StepType` gains `TaskGraph`. New deterministic integration bundle `task-graph-orchestration` (TG1–TG4) covering cycle rejection, unknown-agent rejection, payload columns, and the new schema's presence in generated metadata.

- 394d276: Phase 2 of the unified workflow DAG engine program (plan: PR #3456) — task-graph execution moves server-side and becomes invocation-agnostic.

  **New package `@memberjunction/task-graph`.** Deliberately not AI-prefixed (D11): an LLM, deterministic code, or a human UI can all construct and submit a DAG. It contains `TaskGraphSpec` (the one fully-qualified contract every producer authors against, D16), a pure validator, `TaskGraphService` (submission), `TaskClaimStore` (the CAS claim protocol), and `TaskGraphDispatcher` (durable execution). Graph _semantics_ stay in the Phase 1 pure algorithms in `ai-core-plus` — eligibility, failure propagation, parent rollup and stall detection are consumed unchanged, so the in-run and durable executors cannot drift apart.

  **Submission is split from execution (D2).** `TaskGraphService.Submit` validates, resolves agents, persists parent + children + edges, and returns. Nothing waits for the work. That is what makes every channel equal (D1).

  **BREAKING: `ExecuteTaskGraph` is removed (D12).** It awaited an entire multi-step workflow inside one long-lived GraphQL request, so a page reload lost the awaited promise, a server restart orphaned every in-flight task, and no channel but Explorer could reach the substrate. Replaced by `SubmitTaskGraph`, `CancelTaskGraph`, and `RetryTask`. Accepted deliberately in the open v6 window; its sole known caller — the Explorer conversation client — becomes an observer in this same change.

  **The durable dispatcher.** A compare-and-swap claim protocol over `ClaimedBy`/`ClaimExpiresAt` (the columns Phase 1 landed): claiming is a single guarded `UPDATE ... WHERE Status='Pending'` whose rowcount decides the winner, so two instances never run the same task without a distributed lock manager. Long tasks heartbeat to extend their claim; startup and periodic reconciliation return expired claims to `Pending`, which is what turns a crash from "work stranded forever" into "work resumes". Per D20 _every_ state transition is guarded on `ClaimedBy=@me`, not just the initial claim, because `MJ: Tasks` stays user-writable — a stale executor's completion write fails cleanly instead of double-completing. Human tasks are exempt from reclamation: a task parked on a person legitimately has no claim, and reclaiming it would reset an approval out from under the user.

  **Server-side detection at three seams.** Task graphs emitted in an agent's payload are now detected and submitted from the MJServer run path, `BaseMessagingAdapter` (ahead of the existing text-regex delegation, since a structured graph is unambiguous), and the Scheduling drivers. Previously only the Explorer client looked, so **Slack/Teams and scheduled routines silently dropped every graph an agent emitted** — the plan's core verified gap. The detection shim is explicitly temporary and dies in Phase 3 when `Tasks` becomes a typed `nextStep`.

  **Provider isolation.** The dispatcher mints a fresh provider per task via an injected `ProviderFactory`, so parallel tasks never share a transaction scope. MJServer supplies the implementation, keeping the dependency MJServer → task-graph and never the reverse.

  **Also:** 18 new unit tests for the validator; integration bundle grows with the three seam checks deferred from Phase 1 (cycle rejection, unknown-agent rejection, payload columns), now targeting `TaskGraphService`'s public API.

- 394d276: Phase 3 of the unified workflow DAG engine program (plan: PR #3456) — durable task graphs become a first-class agent primitive.

  **`'Tasks'` joins the Loop response union.** An opted-in agent emits `nextStep.type = 'Tasks'` with a `TaskGraphSpec` and the framework does the rest. The distinction from `subAgents[]` is durability, not parallelism: `subAgents[]` is ephemeral fan-out that blocks the run and dies with it, while a task graph becomes real Task rows a server-side dispatcher owns — visible in the Tasks UI, resumable after a restart, able to wait on a human.

  **The capability is gated, and the gate is enforced rather than advisory.** `enableTaskGraphs` defaults to **false**, unlike every other Loop prompt parameter. The others only shape the prompt — turning one off saves tokens and an agent that emits the feature anyway still works. This one governs whether an agent may create durable rows that outlive its run, execute on a dispatcher under the submitting user, and spawn further agent runs. So beyond omitting the type from the prompt, `LoopAgentType` _rejects_ a `'Tasks'` step from a disabled agent with a corrective that steers it back to Sub-Agent/Actions. The gate fails closed: an absent flag, an absent params bag, and the string `"true"` are all refusals.

  This matters more than it looks, because `HarnessAgentType extends LoopAgentType` and intentionally inherits `DetermineNextStep` — so the primitive reaches external agent harnesses (Claude Code / Codex / Pi running inside MJ) the moment it reaches Loop agents. That inheritance is the design working, but it moves the gate from a nice property of one class to the thing standing between a sandboxed external CLI and durable server-side work. It is therefore tested through the harness path, with the inheritance itself pinned so a later override cannot silently move those assertions onto a different code path.

  **`TaskGraphSpec` and its validator move to `@memberjunction/ai-core-plus`,** next to the pure graph algorithms they belong with. That is what lets the agent framework validate a graph without depending on the durable-execution package — which would otherwise drag the entity layer and the dispatcher into every context that merely runs an agent, including unit tests with no database. The Loop type validates against the identical contract the server re-validates at submission (D16), so a graph cannot pass one check and fail a different one later.

  **Single-node constant folding (D9), recorded rather than silent.** A one-node graph with no edges, an agent assignee and default continuation is rewritten into an ordinary in-run sub-agent call — don't spin up loop machinery for a loop of one. The `TaskGraph` run step is written either way, carrying the spec, a `folded` flag and the reason. Three consequences: run forensics show why a graph did or didn't reach the dispatcher; a user who edits a two-node graph down to one can read the durability change off the run record instead of inferring it; and Save as Workflow (D17) attaches to the recorded spec, so the single-node case — the shape most likely worth promoting — stays promotable. `durable: true` opts back into a Task row.

  **Submission crosses a registered seam.** `TaskGraphSubmitter` is declared in `ai-core-plus` and implemented in `@memberjunction/task-graph`, resolved through the ClassFactory. A host with no durable-execution package gets `null` and the agent reports an honest failure — what must never happen is a graph vanishing quietly while the model believes it scheduled work.

  **Continuation contract.** The parent Task row durably carries `continuation`, `reinvokeDepth` and the delivery marker, because the dispatcher instance that finishes a graph is routinely not the one that accepted it. Delivery marks _before_ it acts: the worst case becomes a missed notification visible in the task record rather than a notification repeated on every reconciliation sweep forever — which, for `reinvoke`, would be an unbounded agent-run loop. Chains are capped at 5 hops, bounded separately from task-nesting depth because they are different loops; at the cap the mode degrades to `message` so results still reach the user. `'reinvoke'` itself is not wired here — it would invert the dependency to task-graph → ai-agents — and lands in Phase 4 where the dispatcher already holds an execution engine.

  **Sage and the Workflow Planner stop payload-smuggling.** Both prompts move from `payloadChangeRequest.newElements.taskGraph` to the real `nextStep`, and the temporary server-side payload sniff introduced in Phase 2 is deleted along with its messaging and scheduling call sites — the primitive submits inside the run, so channel seams no longer need to look.

  **Launch opt-ins (D3):** Sage, Workflow Planner, Query Builder, and the Research Agent with its four sub-agents. Workflow Planner is not on the plan's opt-in list, but emitting task graphs is that agent's entire job, so leaving it gated would have broken it outright.

  **Coverage:** 43 new unit tests (18 Loop, 5 harness, 20 continuation-metadata) and a new integration check, TG8, asserting both directions the metadata gate can be wrong — an opt-in that was never pushed leaves an agent unable to delegate at all, and a Loop _type_ default left on would hand durable reach to every Loop agent in the install at once. IT71 runs 8/8.

- 394d276: Phase 4 of the unified workflow DAG engine program (plan: PR #3456) — convergence. Design-time flows and runtime task graphs stop being two graph models and become one.

  **One traversal engine, `GraphTraversalEngine`.** Flow agents and task graphs were always the same shape — nodes, conditional edges, joins — reached from opposite directions. `FlowAgentType` did not merely have its own copy of the traversal rules; it had **four**, written out separately for the post-prompt, post-action, initial-step and skip-recursion paths. They had already drifted: the skip recursion omits the inactive-destination fallback the other three have, so a skipped node routed differently from a normal one for reasons nobody chose. Both executors now consume one dependency-free engine — graph storage arrives through a synchronous repository seam, condition evaluation through an injected evaluator — so the in-run and durable executors keep completely different state backends while sharing one definition of the rules.

  **Four behaviors deliberately changed, each pinned by a named test** so a future "restore parity" pass has to argue with a test rather than quietly undo a fix:
  1. **Fan-out follows every satisfied edge.** The old code fetched the full edge list and then indexed `[0]`, silently discarding the rest — a genuine fan-out ran one branch and dropped the others with no diagnostic.
  2. **A missing destination is a rejection, not a fatal error.** Previously an _inactive_ destination fell through to the next alternate while a _dangling_ one failed the graph outright. A data problem should not be more fatal than a deliberately disabled step.
  3. **A condition that throws is distinguishable from one that evaluated false.** Both still refuse the edge — a malformed expression must never become an accidental `true` — but a graph stalled by a typo no longer looks identical to one that finished normally.
  4. **Results are addressed by node id.** The old lookup read the tail of the execution path, which was deduped on revisit, so a condition on a loop-back edge silently read a _different_ node's output.

  Also not ported: the `Priority <= 0` fallback branch, which was unreachable. Unconditional edges are collected in the main pass, so it could only run when every edge had a condition — in which case it matched nothing. Fallbacks work, and always did, via an unconditional low-priority edge.

  **Frontier, joins and concurrency.** `TraversalState` tracks a set of active nodes rather than a single program counter. AND-joins (matching `Prerequisite`) are the default and OR-joins map to `Optional` — which is _why_ the two models converge: "wait for every predecessor" is the same rule in both. A predecessor that failed, or that can no longer be reached, counts as settled rather than pending, so an AND-join behind an untaken branch cannot deadlock.

  **Flow gets a params bag.** `traversalMode` defaults to `'sequential'`, and that default is load-bearing: existing flows have fan-out shapes drawn in the editor that have never actually run in parallel, and flipping the default would start executing branches their authors have never seen run. Graphs built from a `TaskGraphSpec` always run parallel regardless.

  **Conditional edges for durable graphs** (migration: `TaskDependency.Condition`, NULL = unconditional, so no existing graph changes meaning). Same column shape and same grammar as `AIAgentStepPath.Condition` — deliberately, because if the two needed different storage then Save as Workflow would need a translation layer and the models had not really converged. The dispatcher resolves conditions by _dropping_ edges rather than adding a second rule to eligibility, which keeps one definition of "ready". One asymmetry is intentional: where the flow executor skips an edge whose condition cannot be evaluated, the dispatcher **keeps** it — there, dropping a prerequisite would run a dependent task early, turning a typo into out-of-order execution, whereas keeping it stalls the graph visibly.

  **Human tasks are announced.** A human task becoming eligible is the moment its assignee can finally act, and nothing else in the system knew that moment had arrived — the task sat `Pending` behind prerequisites and no save touched it when they cleared. Without a notification the workflow simply stopped, waiting on someone who was never told. The dispatcher now sends one through `NotificationEngine` (new metadata-seeded `Task Assignment` type) exactly once, marked durably so a restart cannot resend. Assignment stays self-only until the authorization model in #3524 lands.

  **`continuation: 'reinvoke'` is now delivered**, via a `TaskContinuationDeliverer` seam. Deferred out of Phase 3 because implementing it inside the dispatcher would have inverted the dependency to task-graph → ai-agents; the seam keeps the direction correct, and a host that cannot start agent turns degrades to a message rather than dropping the outcome of work that genuinely ran.

  **Save as Workflow (D17)** — `ConvertTaskGraphToAgentSpec` projects a runtime graph onto a Flow `AgentSpec`. That it is a projection and not a translation is the empirical test of whether the convergence was real. The one inversion: `dependsOn` points backwards, a flow path points forwards. Losses are **returned, never swallowed** — a conversion that quietly dropped a human approval step would hand someone a workflow that skips an approval they believed they had saved.

  **`TaskOrchestrator` retired.** Phase 2 orphaned it; it had zero callers and was not even exported.

  **Coverage:** 47 new unit tests (29 traversal engine, 18 converter) plus integration checks TG9 (conditional edges round-trip) and TG10 (the notification type is seeded). IT71 runs 10/10.

  Two latent test failures fixed along the way, both of which were hiding: `flow-agent-type.test.ts` (18 parity tests) stopped collecting once the adapters pulled `core-entities` into its module graph, and IT71 had a metadata record but was **never joined to the integration suite**, so it would not have run in the deterministic tier at all.

- 394d276: Phase 7 of the unified workflow DAG engine program (plan: PR #3456) — Track D, the trigger layer. Everything here closes a gap where something _claimed_ to work and did not.

  **Entity-change triggers only bind where an agent can safely run.** A `WorkflowSpec` trigger passed its `invocationType` straight through, and `Validate` / `BeforeCreate` / `BeforeUpdate` / `BeforeDelete` are real invocation names — so a workflow could bind an unbounded agent run _inside_ a user's save, in the held transaction, with the power to abort it. Validation now refuses anything but the `After*` forms, and the shorthand an author writes (`Update`) resolves to `AfterUpdate` rather than drifting from the name the platform actually fires. That drift was live: the contract documented `Create | Update | Delete`, none of which the platform matches, so the first trigger ever saved through it failed to resolve.

  **Trigger scope stopped being decorative.** `scopeEntityName` / `scopeRecordID` were declared, documented, accepted by validation — and then referenced nowhere in reconciliation. A workflow the author scoped to one record fired on _every_ record of the entity while the UI showed it as scoped. They now reconcile onto the binding's own `ScopeEntityID` / `ScopeRecordID`, which the engine's scope resolver already honored. `filter` is **refused** rather than accepted-and-ignored: narrowing by predicate needs the before/after values of a change, a contract that does not exist yet, and a workflow runs an agent — over-firing costs real money. Accepting it later is additive; the reverse would break specs already published against it.

  **An entity may bind the same action more than once (`UQ_EntityAction_ActionID_EntityID` dropped).** The v5.37.x junction sweep added that constraint under a stated scope of _"pure junction tables — two foreign-key columns plus ID/Sequence/timestamps, with no other meaningful data columns."_ `EntityAction` never met it: even then it carried `Status`, `Sequence` and `LoggingMode` and owned three child collections. Three months later #3408 added `ScopeEntityID`/`ScopeRecordID` so a binding could attach to "this Deal Type" — a feature the constraint makes unusable, since one binding per (entity, action) means one scope, so "every Deal" and "this Deal Type" cannot coexist. It also forced a single param set, filter set and scope to be shared across _every_ event an action responds to, making "on create run agent X, on update run agent Y" unexpressible. `V202608080100__v6.1.x__Drop_EntityAction_Uniqueness` removes it with no replacement; a narrower index would still refuse two unscoped bindings differing only by invocation type. Nothing in the runtime assumed uniqueness — every accessor already returns a collection and `HandleEntityActions` already iterates — so this is schema-only. Each workflow now owns its own binding, matched on the agent it dispatches to plus its scope; reusing a shared row would have rewritten `AgentID` and silently repointed one workflow's trigger at another's agent.

  **A self-trigger guard, because enrich-and-write-back is the normal shape.** "When a ticket changes, summarize it and store the summary" saves the ticket, which re-fires the action, forever. `EntityActionDispatchGuard` keys every automatic dispatch by `(entity action, entity, record)` and tracks origin through the async call tree with `AsyncLocalStorage`, so re-entry is detected however deep inside an agent run the write-back happens — no call site threads anything. Re-entry is **suppressed**, not deferred: queuing it would turn an infinite loop into an infinite sequence. A merely _overlapping_ save is a different problem with the same key, so it **coalesces** — latest wins, one pending rerun, and a burst of ten saves collapses to two runs instead of ten. Only after-hooks are guarded; `Validate` and `Before*` participate in the save and must neither be skipped nor deferred. Work that has detached from the async context (a durable task graph, a queued job) declares its origin explicitly through the new `EntitySaveOptions.OriginatingEntityActionIDs`.

  **Scheduled-job notifications actually send.** `NotificationManager` logged `"Would send notification to user …"` while `NotificationEngine` sat one package away. It now delivers for real, and composes the two people who have a say: the job's `NotifyViaEmail` / `NotifyViaInApp` toggles are a **ceiling**, the recipient's preferences decide within it. Neither existing knob expressed that — `forceDeliveryChannels` would let a job override a recipient's opt-out, and omitting the toggles would let a type default fire a channel the job never asked for. `SendNotificationParams.allowedDeliveryChannels` is the new primitive; it can only subtract, which is what makes it safe to expose.

  **"Execute Scheduled Job Now" runs the job.** It used to insert a `Status='Running'` run row and report success. Nothing consumed those rows — the poller selects jobs by _schedule_, never by pending run record — so the action left a row that said Running forever and ran nothing. It now executes through `SchedulingEngine`, and a failed job is a failed action rather than a successful insert. `Wait=false` starts it without blocking.

  **The dispatcher has somewhere to deliver.** `StartTaskGraphDispatcher` constructed it with no continuation deliverer at all, so a finished graph logged its outcome, marked itself delivered, and said nothing to the conversation that asked for it. `TaskGraphContinuationDeliverer` posts the roll-up with per-step detail. `Reinvoke` stays unimplemented on purpose: a safe one needs the new agent run to remember it was a continuation at depth N so `MAX_REINVOKE_DEPTH` can stop the chain, and nothing durable records that — a cap that never trips is worse than degrading to a message.

  **IT71 grows to 16 checks.** TG14 drives the save-to-binding round trip that Phase 6 owed; TG15 pins that a scoped trigger actually narrows; TG16 pins that two workflows on one entity keep separate bindings pointing at their own agents, and that re-saving finds its own row rather than adding a third. TG14 caught a second real bug on its first run — the invocation-type mismatch above — and TG16 is what surfaced the unique constraint.

- 394d276: Phase 8 of the unified workflow DAG engine program (plan: PR #3456) — the remaining Track D mechanisms, plus the observability decision that had been open across three reviews.

  **A live signal from the dispatcher.** The choice was between claim-store cache invalidation and semantic frames; frames won because a consumer should render "step 3 of 7 running" from the event itself rather than re-reading Task rows and diffing them to guess what changed. `TaskGraphObserver` emits `TaskStarted` / `TaskCompleted` / `TaskFailed` / `TaskBlocked` / `TaskAwaitingHuman` / `GraphSettled`, and MJServer publishes them on a new `taskGraphFrames(parentTaskId)` subscription.

  Addressed by **`ParentTaskID`, deliberately not by session**: a durable graph outlives the tab that submitted it and may be started by a schedule with no session at all, so keying on the graph means "watch this workflow run" works for whoever is permitted to see it, whenever they arrive — including after a refresh, which a session-keyed push cannot survive. Emit points sit where the fact is already true: `TaskStarted` after the claim is held, `Task{Completed,Failed}` only once the guarded write lands, `GraphSettled` outside the continuation's once-only CAS. The observer is optional and its errors are swallowed in one place, because a frame is commentary on work and must never stall or fail a graph.

  Delivery **fails closed**. A `parentTaskId` is discoverable, so without a connection-identity check anyone holding one could watch another user's workflow, per-step error messages included. Ownership rides on the frame — resolved once per graph and memoized, since a subscription filter runs per frame and synchronously, and a database round trip there would make watching a run cost more than running it. It lives in the parent's durable metadata rather than a column because `Task.UserID` already means "the person this task waits on"; setting it on a parent would make every graph look like a human task.

  **`MAX_REINVOKE_DEPTH` finally compares against a real number.** Phase 3 shipped the cap and Phase 4 shipped the metadata carrying `reinvokeDepth`, but the value was permanently zero: `Submit` reads it from its caller, `BaseAgent` never passed one, and a reinvoked agent had no way to know it _was_ a continuation. Phase 7 therefore left `Reinvoke` unimplemented on purpose — a cap that never fires is worse than one continuation mode being unavailable, because the failure mode is an unbounded chain of real agent runs. `AIAgentRun.ContinuationDepth` closes the loop: the deliverer stamps depth + 1 on the run it starts, `BaseAgent` passes its own run's depth into any graph it submits, and the chain is bounded. `Reinvoke` degrades to posting whenever it cannot restart a turn (no submitting run, run or agent unloadable) and never throws, since the dispatcher calls it inside the delivery CAS.

  **Scheduled jobs answer what to do about fire times they missed.** `MissedRunPolicy` — `RunOnce` (default), `RunAll`, `Skip`. The default is not a preference: `updateJobStatistics` already computed the next run from _now_, so a job whose `NextRunAt` had passed ran once and jumped forward. That is `RunOnce`, and defaulting to `Skip` would have silently stopped every existing job in every install from catching up. `RunAll` is safe to offer because its next run is computed from the occurrence just consumed, so a week-long outage walks one occurrence per poll tick rather than firing 168 jobs at once. "Missed" is defined cron-relatively — a _later_ occurrence has also come due — rather than by a grace window, which would misjudge a per-minute job after a short pause and a monthly job that is a week late in opposite directions.

  The decision **fails open** throughout: it can only ever withhold a run the schedule already said was due, so an unparseable cron or a helper returning anything but a date lets the job through. And it is **synchronous** on purpose — it runs immediately before lock acquisition, where an added microtask reorders against the sweep's fire-and-forget cleanup; only the skip branch writes, and that is awaited separately.

  **One-shot scheduling needed no new schedule shape.** `Status='Expired'` had been a declared value that nothing ever set. `isJobDue` already refused a job past its `EndAt`, so such a job stopped running on its own — but stayed `Active` forever, permanently inert, and kept driving `UpdatePollingInterval`, so "cron at T plus `EndAt` just after T" left the whole scheduler polling at that job's cadence for a job that would never run again. Retiring it is the fix; "run once at T" was already expressible. Deliberately narrow: only `Active`/`Pending` transition, because a `Paused` job was put there by a person, and only `EndAt` triggers it, since a cron always has a next occurrence and inferring exhaustion would be guessing.

  **IT71 grows to 18.** TG17 asserts the new schema through the ORM rather than trusting the migration — the pair that drifted in Phase 4 when a migration applied but CodeGen ran against a stale definition. TG18 saves a job with `RunAll`, reloads it to prove the value survives the CHECK constraint, and saves a policy-less job to prove the `RunOnce` default.

- 394d276: Phase 6 (Track E) — **`WorkflowSpec`: one object binding WHAT runs to WHEN it runs.**

  `TaskGraphSpec` answered _what_ a workflow does; the scheduling and entity-action substrates answered _when_ something fires. Nothing expressed both at once, so "a workflow" was not a thing anyone could hand over — it was a graph plus a separately-configured trigger that only a human knew were related.

  **`graph` is `TaskGraphSpec` verbatim, not a copy.** That is why this composes rather than translates: a graph authored on the canvas, emitted by an agent, or promoted from a past run is _already_ this shape. A parallel graph type would have re-created the drift Phase 4 spent itself removing.

  **No new storage, and that is the design.** There is no `Workflow` table. A workflow's WHAT is a Flow agent; its WHEN is a Scheduled Job. `WorkflowSpecSync` **reconciles** those, following the pattern `MJRecordProcessEntityServer.Save()` already proved — resolve the type, find the rows this definition owns, upsert or disable. Inventing a `Workflow` row would create a second definition of "a scheduled thing" and give the scheduler two masters that can disagree.

  Rows are owned by a marker inside their own `Configuration`, not by name, so **renaming a workflow cannot orphan its schedule** and leave a second one firing beside the new row. A trigger the spec no longer names is **disabled, not deleted** — the row carries run counts, last-run and next-run, which are the only record it ever fired.

  **Order is load-bearing.** The agent persists _before_ triggers reconcile, because a Scheduled Job needs its ID to point at. Reversed, you get a job referencing an agent that does not exist — a schedule that fires forever and does nothing, with no error anyone sees. Validation runs before either, so a rejected save leaves no orphan agent behind.

  **Two operations, because drafting and committing are different acts.** `Workflow.Validate` writes nothing, so an agent can iterate a draft before anything reaches the scheduler — the draft-then-confirm shape dry-run and Plan Mode established. `Workflow.Save` commits. Both run the identical validator, so a workflow that validates cannot be rejected on save for a different reason. Together they close the "agents cannot schedule anything" hole: today `Create Scheduled Job` cannot even set `Configuration`.

  **Agent persistence crosses a seam.** `AgentSpecSync` is the one place that writes an agent; importing it into the execution substrate would invert the dependency, so the host registers a writer instead. A host without one gets an honest failure rather than a half-saved workflow. The writer reuses Phase 4's `ConvertTaskGraphToAgentSpec` unchanged — "save a runtime graph as a workflow" and "persist a workflow's graph" turn out to be the same operation, which is the practical payoff of the convergence.

  **A discovery worth recording:** `AgentScheduledJobDriver` has existed since the scheduling engine shipped, and `ScheduledJobType.DriverClass` is UNIQUE — so the `Agent` job type was already seeded. The substrate for scheduling an agent was there all along; only the authoring surface was missing. TG12 now pins that seed, because without it a scheduled workflow throws at the moment a user is least able to interpret it.

  **Draft is the default status**, not Active. Every authoring surface — the canvas, a chat card, an agent's MCP call — produces something the author has not yet watched run against real data.

  **Entity-change triggers reconcile too.** My first pass deferred these to Track D on the belief that entity-action invocation was not wired. AN-BC challenged that and was right: `HandleEntityActions` has fired entity actions from the save pipeline all along — validate, before/after save, before/after delete — and `Execute Agent` exists as the dispatch target, written for exactly this. Nothing was missing but the **binding row**. `WorkflowSpecSync` now creates the three rows that express "when an Invoice is updated, run Execute Agent with this agent": the `EntityAction`, the `EntityActionInvocation`, and an `EntityActionParam` carrying the agent. Idempotent by lookup rather than delete-and-recreate, because re-saving a workflow must not detach and re-attach a live trigger — a change landing in that window would be missed.

  40 new unit tests (29 validator, 11 sync) plus integration checks TG11 and TG12. IT71 runs 12/12.

### Patch Changes

- 394d276: Fix multi-provider and UUID-comparison compliance violations that failed the repo-wide MJGlobal compliance scanners. `HarnessAgentBase` now uses its bound provider (`this.ProviderToUse`) instead of `new Metadata()` and `UUIDsEqual` for the template-ID lookup; the task-graph orchestration integration checks use `ctx.Provider.EntityByName(...)` instead of `new Metadata()`.
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/actions@6.1.0-edge.1
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.1
  - @memberjunction/ai-agent-harness@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ai-agents@6.1.0-edge.1
  - @memberjunction/open-app-engine@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/task-graph@6.1.0-edge.1
  - @memberjunction/graphql-dataprovider@6.1.0-edge.1
  - @memberjunction/scheduling-engine@6.1.0-edge.1
  - @memberjunction/notifications@6.1.0-edge.1
  - @memberjunction/content-autotagging@6.1.0-edge.1
  - @memberjunction/predictive-studio@6.1.0-edge.1
  - @memberjunction/codegen-lib@6.1.0-edge.1
  - @memberjunction/record-set-processor@6.1.0-edge.1
  - @memberjunction/aiengine@6.1.0-edge.1
  - @memberjunction/search-engine@6.1.0-edge.1
  - @memberjunction/ai-engine-base@6.1.0-edge.1
  - @memberjunction/ai-prompts@6.1.0-edge.1
  - @memberjunction/ai-bridge-base@6.1.0-edge.1
  - @memberjunction/ai-bridge-server@6.1.0-edge.1
  - @memberjunction/api-keys@6.1.0-edge.1
  - @memberjunction/actions-base@6.1.0-edge.1
  - @memberjunction/communication-types@6.1.0-edge.1
  - @memberjunction/communication-engine@6.1.0-edge.1
  - @memberjunction/communication-ms-graph@6.1.0-edge.1
  - @memberjunction/communication-expo-push@6.1.0-edge.1
  - @memberjunction/communication-gmail@6.1.0-edge.1
  - @memberjunction/communication-sendgrid@6.1.0-edge.1
  - @memberjunction/communication-twilio@6.1.0-edge.1
  - @memberjunction/conversations-runtime@6.1.0-edge.1
  - @memberjunction/metadata-sync@6.1.0-edge.1
  - @memberjunction/query-processor@6.1.0-edge.1
  - @memberjunction/record-set-processor-base@6.1.0-edge.1
  - @memberjunction/templates-base-types@6.1.0-edge.1
  - @memberjunction/templates@6.1.0-edge.1
  - @memberjunction/testing-integration@6.1.0-edge.1
  - @memberjunction/ai@6.1.0-edge.1
  - @memberjunction/predictive-studio-core@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [e4a6fa3]
- Updated dependencies [cd520e2]
- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [fe7bd9d]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [0acf96e]
- Updated dependencies [8d0d45a]
- Updated dependencies [1100077]
- Updated dependencies [e76b195]
  - @memberjunction/api-keys@6.1.0-edge.0
  - @memberjunction/codegen-lib@6.1.0-edge.0
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/actions@6.1.0-edge.0
  - @memberjunction/actions-base@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.0
  - @memberjunction/search-engine@6.1.0-edge.0
  - @memberjunction/testing-integration@6.1.0-edge.0
  - @memberjunction/aiengine@6.1.0-edge.0
  - @memberjunction/ai-agents@6.1.0-edge.0
  - @memberjunction/ai-engine-base@6.1.0-edge.0
  - @memberjunction/ai-core-plus@6.1.0-edge.0
  - @memberjunction/predictive-studio@6.1.0-edge.0
  - @memberjunction/ai-prompts@6.1.0-edge.0
  - @memberjunction/ai-bridge-base@6.1.0-edge.0
  - @memberjunction/ai-bridge-server@6.1.0-edge.0
  - @memberjunction/communication-types@6.1.0-edge.0
  - @memberjunction/communication-engine@6.1.0-edge.0
  - @memberjunction/notifications@6.1.0-edge.0
  - @memberjunction/communication-ms-graph@6.1.0-edge.0
  - @memberjunction/communication-sendgrid@6.1.0-edge.0
  - @memberjunction/content-autotagging@6.1.0-edge.0
  - @memberjunction/conversations-runtime@6.1.0-edge.0
  - @memberjunction/graphql-dataprovider@6.1.0-edge.0
  - @memberjunction/metadata-sync@6.1.0-edge.0
  - @memberjunction/open-app-engine@6.1.0-edge.0
  - @memberjunction/query-processor@6.1.0-edge.0
  - @memberjunction/record-set-processor@6.1.0-edge.0
  - @memberjunction/scheduling-engine@6.1.0-edge.0
  - @memberjunction/templates-base-types@6.1.0-edge.0
  - @memberjunction/templates@6.1.0-edge.0
  - @memberjunction/communication-expo-push@6.1.0-edge.0
  - @memberjunction/communication-gmail@6.1.0-edge.0
  - @memberjunction/communication-twilio@6.1.0-edge.0
  - @memberjunction/record-set-processor-base@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/predictive-studio-core@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-agents@6.0.0
  - @memberjunction/ai-engine-base@6.0.0
  - @memberjunction/ai-core-plus@6.0.0
  - @memberjunction/aiengine@6.0.0
  - @memberjunction/predictive-studio@6.0.0
  - @memberjunction/ai-prompts@6.0.0
  - @memberjunction/ai-bridge-base@6.0.0
  - @memberjunction/ai-bridge-server@6.0.0
  - @memberjunction/api-keys@6.0.0
  - @memberjunction/actions-base@6.0.0
  - @memberjunction/actions@6.0.0
  - @memberjunction/codegen-lib@6.0.0
  - @memberjunction/communication-types@6.0.0
  - @memberjunction/communication-engine@6.0.0
  - @memberjunction/notifications@6.0.0
  - @memberjunction/communication-ms-graph@6.0.0
  - @memberjunction/communication-expo-push@6.0.0
  - @memberjunction/communication-gmail@6.0.0
  - @memberjunction/communication-sendgrid@6.0.0
  - @memberjunction/communication-twilio@6.0.0
  - @memberjunction/content-autotagging@6.0.0
  - @memberjunction/conversations-runtime@6.0.0
  - @memberjunction/graphql-dataprovider@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/metadata-sync@6.0.0
  - @memberjunction/open-app-engine@6.0.0
  - @memberjunction/query-processor@6.0.0
  - @memberjunction/record-set-processor-base@6.0.0
  - @memberjunction/record-set-processor@6.0.0
  - @memberjunction/sqlserver-dataprovider@6.0.0
  - @memberjunction/scheduling-engine@6.0.0
  - @memberjunction/search-engine@6.0.0
  - @memberjunction/templates-base-types@6.0.0
  - @memberjunction/templates@6.0.0
  - @memberjunction/testing-integration@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/predictive-studio-core@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- aa4fbcd: Fix the live-agent harness reaching prompt runs through a column that does not exist, and stop it swallowing the failure

  Three live-harness helpers filtered `MJ: AI Prompt Runs` on `AgentRunID`. That column is not on
  `AIPromptRun` — its only agent-facing field is `AgentID`. A prompt run is reachable from its agent
  run only through the step that invoked it: an `MJ: AI Agent Run Steps` row whose `TargetLogID` is
  the prompt run's ID.

  The reason a nonexistent column survived in committed code is the second half. `RunView` does not
  throw — it returns `Success: false` with an `ErrorMessage` — and each helper coalesced that to `[]`,
  making a SQL error indistinguishable from "this run made no model calls". Callers read zero prompt
  runs and either passed vacuously or failed on an unrelated-looking assertion. The swallow was the
  actual defect; the wrong column name only exploited it.

  Which step types carry a prompt run is the other half of the rule, and `Prompt` alone is wrong.
  base-agent writes a prompt run's id into `TargetLogID` on three step types: `Prompt` (the ordinary
  model call), `Compaction` (cross-turn conversation compaction), and `Tool` (a conversation tool call
  that made its own model call, deliberately with no duplicate `Prompt` step — so a Prompt-only rule
  cannot reach it by any route). Two named sets now encode this, because the correct answer differs by
  purpose: `PROMPT_RUN_BEARING_STEP_TYPES` (all three) for deletion, which must be exhaustive or it
  orphans rows, and `ROLLUP_BEARING_STEP_TYPES` (`Prompt` + `Compaction`) for token reads, mirroring
  the step types base-agent actually counts toward `AIAgentRun.TotalTokensUsed`. A single blanket
  filter would have fixed the orphaning and broken the token reconciliation in the same stroke.

  The linkage rule now exists once, in `promptRunIdsFromSteps`, instead of being restated in four
  places with three of them wrong. `deepDeleteRunTrees` resolves prompt runs _before_ deleting steps —
  the previous order deleted the steps first and destroyed the only path to those rows, so teardown
  silently leaked every prompt run it claimed to purge. `requireRows` replaces the swallow in the read
  helpers; teardown paths stay non-throwing by design but now log rather than going quiet.

  `RS7` asserted a short-circuit with a 2-char query while `SearchEngine.MIN_TERM_LENGTH` is now 2
  (lowered from 3 so short queries like "AI" and "US" are searchable), so it no longer described
  product behavior. It now probes with a single character, below both the old and current thresholds,
  testing the short-circuit rather than tracking the threshold's value. `SR5` had already been changed
  this way when the 3-to-2 fix landed; `RS7` was missed because its bundle is live-model tier and the
  deterministic gate never runs it.

  Adds `prompt-run-linkage.test.ts`. Its unit tests pin the linkage rule and the loud-failure
  property, but neither can catch someone re-adding an `AgentRunID` filter — only a real database
  rejects that, and the live tier is triage-only, so the regression would ship exactly as it did the
  first time. The file therefore also scans the check sources, the same filesystem-drift technique
  `sibling-parity.test.ts` uses for bundle-to-metadata parity.

- c382605: Fix realtime relayed-tool dispatch for scoped anonymous magic-link sessions (#3371): delegated agent runs, co-agent observability writes (creation, transcript/tool-turn appends, usage accumulation, finalize), and recording uploads now execute under the system user once session ownership is proven — gated on MagicLinkScope, excluding public web-widget guests, and failing closed to the caller when no system user is available. The session's `allowedAgents` colleague union is now CanRun-gated against the original caller before dispatch, so elevation cannot widen agent authority, and delegated runs carry the visitor's id as `userId` so run attribution and context-memory scope stay the person's. Adds the IT68 scoped-anon-elevation deterministic integration bundle proving the permission contract on a live database.
- Updated dependencies [c382605]
- Updated dependencies [1e048ef]
- Updated dependencies [a8fc549]
  - @memberjunction/ai-agents@5.51.0
  - @memberjunction/codegen-lib@5.51.0
  - @memberjunction/core@5.51.0
  - @memberjunction/predictive-studio@5.51.0
  - @memberjunction/record-set-processor@5.51.0
  - @memberjunction/scheduling-engine@5.51.0
  - @memberjunction/ai-engine-base@5.51.0
  - @memberjunction/ai-core-plus@5.51.0
  - @memberjunction/aiengine@5.51.0
  - @memberjunction/ai-prompts@5.51.0
  - @memberjunction/ai-bridge-base@5.51.0
  - @memberjunction/ai-bridge-server@5.51.0
  - @memberjunction/api-keys@5.51.0
  - @memberjunction/actions-base@5.51.0
  - @memberjunction/actions@5.51.0
  - @memberjunction/communication-types@5.51.0
  - @memberjunction/communication-engine@5.51.0
  - @memberjunction/notifications@5.51.0
  - @memberjunction/communication-ms-graph@5.51.0
  - @memberjunction/communication-expo-push@5.51.0
  - @memberjunction/communication-gmail@5.51.0
  - @memberjunction/communication-sendgrid@5.51.0
  - @memberjunction/communication-twilio@5.51.0
  - @memberjunction/content-autotagging@5.51.0
  - @memberjunction/conversations-runtime@5.51.0
  - @memberjunction/graphql-dataprovider@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/metadata-sync@5.51.0
  - @memberjunction/open-app-engine@5.51.0
  - @memberjunction/query-processor@5.51.0
  - @memberjunction/record-set-processor-base@5.51.0
  - @memberjunction/sqlserver-dataprovider@5.51.0
  - @memberjunction/search-engine@5.51.0
  - @memberjunction/templates-base-types@5.51.0
  - @memberjunction/templates@5.51.0
  - @memberjunction/testing-integration@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/predictive-studio-core@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- 623dfc5: Break CodeGen FK cycle between AIAgentRun, AIPromptRun, and ConversationDetail. Move SummaryPromptRunID from ConversationDetail to a new ConversationCompactionRun audit table. Remove AgentRunID from AIPromptRun (derivable via AIAgentRunStep.TargetLogID). Remove agentRunId from AIPromptParams and all write sites across the prompt/agent stack.
- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [54a037f]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [a3bd648]
- Updated dependencies [c221553]
- Updated dependencies [fab223d]
- Updated dependencies [a7dfaf5]
- Updated dependencies [d79dd11]
- Updated dependencies [86832fa]
- Updated dependencies [deb02b4]
- Updated dependencies [8b4c6b2]
- Updated dependencies [918563e]
- Updated dependencies [0686d52]
- Updated dependencies [c7b6710]
- Updated dependencies [764d6f6]
- Updated dependencies [408e4bf]
- Updated dependencies [0ba33b3]
- Updated dependencies [03fc891]
- Updated dependencies [76c0ffb]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai-agents@5.50.0
  - @memberjunction/ai-core-plus@5.50.0
  - @memberjunction/ai-prompts@5.50.0
  - @memberjunction/codegen-lib@5.50.0
  - @memberjunction/content-autotagging@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/testing-integration@5.50.0
  - @memberjunction/open-app-engine@5.50.0
  - @memberjunction/communication-types@5.50.0
  - @memberjunction/communication-ms-graph@5.50.0
  - @memberjunction/search-engine@5.50.0
  - @memberjunction/communication-gmail@5.50.0
  - @memberjunction/communication-sendgrid@5.50.0
  - @memberjunction/actions-base@5.50.0
  - @memberjunction/predictive-studio-core@5.50.0
  - @memberjunction/metadata-sync@5.50.0
  - @memberjunction/ai-engine-base@5.50.0
  - @memberjunction/aiengine@5.50.0
  - @memberjunction/predictive-studio@5.50.0
  - @memberjunction/ai-bridge-base@5.50.0
  - @memberjunction/ai-bridge-server@5.50.0
  - @memberjunction/api-keys@5.50.0
  - @memberjunction/actions@5.50.0
  - @memberjunction/communication-engine@5.50.0
  - @memberjunction/notifications@5.50.0
  - @memberjunction/conversations-runtime@5.50.0
  - @memberjunction/graphql-dataprovider@5.50.0
  - @memberjunction/query-processor@5.50.0
  - @memberjunction/record-set-processor@5.50.0
  - @memberjunction/sqlserver-dataprovider@5.50.0
  - @memberjunction/scheduling-engine@5.50.0
  - @memberjunction/templates-base-types@5.50.0
  - @memberjunction/templates@5.50.0
  - @memberjunction/communication-expo-push@5.50.0
  - @memberjunction/communication-twilio@5.50.0
  - @memberjunction/record-set-processor-base@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- 8d2a454: Correct the release runbook's integration-testing step for the post-#3228 suite, and fix three stale sibling docs. Documentation only — no runtime code changes.

  `DEPLOYMENT.md` Step 4 described a world that no longer exists: it told the build engineer to run `RUN_MUTATION_TESTS=1 RUN_AGENT_TESTS=1 npm run test:integration` and claimed an aggregator collapsed all tiers into one exit code. That command runs **zero** live-model tests — `test:integration` is hardcoded to `mj test suite "Integration Tests — Deterministic"`, the live tests live in a **sibling** suite, and `mj test suite` does not recurse into child suites, so the runbook reported "all three tiers passed" while one never ran. The aggregator (`run-all.ts`) was deleted in the July-2026 restructure.

  Every command and behavior in the rewritten step was verified by executing it against a live throwaway database rather than inferred from source. That surfaced corrections that source-reading alone had gotten wrong:
  - **Seeding is mandatory, not optional.** The old text said skipping `metadata-optional/integration-test` "keeps the suite green"; an unseeded database actually exits **1** with `Test suite not found`. The suite/Test rows exist only in that root.
  - **Two false-green paths, neither visible in the exit code.** With MJAPI down, the 19 client-transport bundles **skip-as-PASS** (a green 52/52 that ran 33 tests); with `MJ_API_KEY` missing they return status `Error` — and `failedTests` counts only `Failed`, so both exit **0**. The step now requires `N === M === 52` plus a DB-side status tally, because the console prints `✗ FAILED` for `Error` too.
  - **`RUN_AGENT_TESTS` is default-ON** (`IsTierEnabled` returns `!== '0'`), so `=1` is a no-op and `=0` silently yields a green 15/15 that executed nothing.
  - **Missing provider keys FAIL the live tier, they do not skip** — verified by blanking `AI_VENDOR_API_KEY__*`. The build-engineering runbook claimed a clean skip, which would have made a keyless CI leg look safe.
  - **A virgin release database cannot reach 52/52.** `IT29 - Cache Gauntlet` enforces an anti-vacuity floor requiring `MJ: User Settings` to already hold ≥2 rows, so a fresh Step-3 database yields 51/52 until a baseline is seeded.
  - Counts and budgets corrected against reality: IT01–IT66 (67 records, 52 + 15), 242 seeded records, deterministic ≈133s, live ≈570s. `[COST]` reports `$0.0000` even on real model calls, so it must not be read as spend.

  Also documents two environment traps that cost real debugging time: the testing CLI loads dotenv with `override: true` (so an inline `DB_DATABASE=…` is silently ignored for `mj test` while it works for `mj sync push` — a mutating run against the wrong database), and a stale `dist/` orphan whose source was deleted will block MJAPI from booting entirely with a duplicate-GraphQL-type error that rebuilding does not clear.

  Finally, records the SQL Server / PostgreSQL parity position honestly: migration parity is verified every release (Step 8), but **runtime** parity is not — the integration suite cannot run on PostgreSQL today. The testing CLI builds an mssql pool and declares no PG driver, and `UserCache.Refresh` is mssql-typed and issues T-SQL, so the context-user cache stays empty regardless of database contents. Provisioning a PG database does not enable it; it needs a code + dependency change. The section is explicitly scoped so it reads as a roadmap gap and never as a reason to halt a release.

  Sibling docs corrected: `guides/INTEGRATION_TESTING_QUICKSTART.md` (member counts and tier-gating table), `.github/workflows/integration.yml` (stale IT-range comments), and `packages/TestingFramework/integration-test-suite/docs/build-engineering-runbook.md` (the credential-skip claim, `RUN_AGENT_TESTS` semantics, bundle count and measured duration).

- 887c80a: Add the required `repository` block to `@memberjunction/integration-test-suite`. The `validate-package-repository.sh` CI gate requires every `@memberjunction/*` package to declare `repository.url` for npm sigstore provenance; this package shipped without it and was failing the build and publish workflows.
- 8af6663: Skip `private: true` packages in `validate-npm-packages.sh`, the `publish.yml` gate that checks every `@memberjunction/*` package already exists on npm.

  The gate exists to predict whether `npm run change publish` will succeed, but it filtered only on the `@memberjunction/` scope and never read `.private`. Changesets never publishes a private package (`@changesets/cli`: `packages.filter(pkg => !pkg.packageJson.private)`), so for a private package the gate was asking a question with no bearing on the outcome it gates, and failing the release over the answer.

  The gap had been masked by workarounds rather than hit: `@memberjunction/mobile-app` and `@memberjunction/ng-test-utils` are both `private: true` yet sit on npm at `0.0.0` and `0.0.1`, throwaway placeholders published purely to satisfy this check. They have stayed frozen at those versions ever since while the in-repo versions moved on, which is what a placeholder for a private package always decays into. `@memberjunction/integration-test-suite` is the first private package added since, so v5.49.0 is the first release where the gate actually fails.

  Skips are logged rather than silent, so an accidental `"private": true` on a package that should ship is still visible in CI output — preserving the only real signal the old behavior provided, without blocking the release on it. The gate still fails correctly for genuinely missing public packages.

- 838c6c7: Skip `private: true` packages in `validate-package-repository.sh`, matching the rule PR #3236 established in `validate-npm-packages.sh` — so both publish gates now answer "is this a package we publish?" the same way.

  The gate requires `repository.url` for npm sigstore provenance, which only applies to published packages: npm refuses to attest a private package, and changesets never publishes one (`@changesets/cli`: `packages.filter(pkg => !pkg.packageJson.private)`). Requiring the field on a private package forced inert metadata — `@memberjunction/integration-test-suite` had a `repository` block added purely to satisfy this gate, hours before the sibling gate was fixed properly.

  Skips are logged rather than silent, mirroring the sibling gate. Unlike the npm-existence gate (network-bound), this script is pure-local, so it now has a fixture-based vitest suite in `.github/scripts/__tests__/` covering the skip, the not-blunted property (private skip + public failure in one run), and predicate parity with changesets truthiness.

  Also updates `DEPLOYMENT.md` Step 5 and `NEW_PACKAGE_SETUP.md`, which still described the pre-#3236 behavior ("lists every package missing from npm") — the script now lists every _publishable_ package missing, and private packages need no placeholder.

- Updated dependencies [486b276]
- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [0e52ff6]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [3d0255b]
- Updated dependencies [243523e]
- Updated dependencies [88d707b]
- Updated dependencies [7db8ef5]
- Updated dependencies [a7733a9]
- Updated dependencies [3b23275]
- Updated dependencies [505c8b5]
- Updated dependencies [ebe5b88]
- Updated dependencies [a9ec419]
- Updated dependencies [6c910ef]
- Updated dependencies [42a680a]
- Updated dependencies [88d707b]
- Updated dependencies [70113b1]
- Updated dependencies [1a15bd2]
- Updated dependencies [f1ab36f]
- Updated dependencies [4a03c37]
- Updated dependencies [38c69a6]
- Updated dependencies [7d6e8fb]
- Updated dependencies [b64efd1]
- Updated dependencies [d23aa89]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [04cdd67]
- Updated dependencies [5473e9a]
- Updated dependencies [38c220c]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [373c5f6]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [fc1c693]
- Updated dependencies [70c658c]
- Updated dependencies [9d6e3d9]
- Updated dependencies [78a5e44]
  - @memberjunction/codegen-lib@5.49.0
  - @memberjunction/core@5.49.0
  - @memberjunction/ai-agents@5.49.0
  - @memberjunction/ai-core-plus@5.49.0
  - @memberjunction/ai-prompts@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/graphql-dataprovider@5.49.0
  - @memberjunction/testing-integration@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/communication-types@5.49.0
  - @memberjunction/communication-engine@5.49.0
  - @memberjunction/communication-sendgrid@5.49.0
  - @memberjunction/communication-gmail@5.49.0
  - @memberjunction/communication-twilio@5.49.0
  - @memberjunction/communication-ms-graph@5.49.0
  - @memberjunction/communication-expo-push@5.49.0
  - @memberjunction/scheduling-engine@5.49.0
  - @memberjunction/actions@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/api-keys@5.49.0
  - @memberjunction/metadata-sync@5.49.0
  - @memberjunction/predictive-studio@5.49.0
  - @memberjunction/predictive-studio-core@5.49.0
  - @memberjunction/search-engine@5.49.0
  - @memberjunction/sqlserver-dataprovider@5.49.0
  - @memberjunction/templates@5.49.0
  - @memberjunction/ai-engine-base@5.49.0
  - @memberjunction/aiengine@5.49.0
  - @memberjunction/ai-bridge-base@5.49.0
  - @memberjunction/ai-bridge-server@5.49.0
  - @memberjunction/actions-base@5.49.0
  - @memberjunction/notifications@5.49.0
  - @memberjunction/conversations-runtime@5.49.0
  - @memberjunction/open-app-engine@5.49.0
  - @memberjunction/query-processor@5.49.0
  - @memberjunction/record-set-processor-base@5.49.0
  - @memberjunction/record-set-processor@5.49.0
  - @memberjunction/templates-base-types@5.49.0

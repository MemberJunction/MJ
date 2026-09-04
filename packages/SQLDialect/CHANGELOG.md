# @memberjunction/sql-dialect

## 6.1.0-edge.5

### Minor Changes

- 4eb87c5: Fix three PostgreSQL conversion defects that each surfaced only when a converted migration was **applied**, not when it was converted — the converter reported "0 gaps" for all three.

  **1. `MERGE` and `MATCHED` were read as identifiers.** Every other word in a `MERGE` statement was already in the quoting keyword sets — `USING`, `ON`, `WHEN`, `THEN`, `NOT`, `INSERT`, `UPDATE`, `SET`, `VALUES`, `AS` — so a converted `MERGE` came out as `"MERGE" __mj."X" AS tgt … WHEN "MATCHED" THEN UPDATE` and PostgreSQL rejected it with `syntax error at or near ""MERGE""`. Structurally the rest of the statement already transpiled to valid PG 15+ `MERGE`; these two tokens were the only thing wrong.

  **2. `INTO` is optional in T-SQL's `MERGE` and required in PostgreSQL's.** `MERGE [dbo].[T] AS tgt` transpiled token-for-token into something PostgreSQL rejects at the _target name_ rather than at `MERGE` — `syntax error at or near "__mj"`, pointing one token past the actual problem. The bare form is now rewritten to `MERGE INTO`. The rewrite is anchored to statement position so the word `MERGE` in a migration's own prose ("re-runnable: MERGE on fixed UUIDs") is not rewritten into "MERGE INTO on fixed UUIDs".

  **3. BIT literals in entity-registration INSERTs on the `--split` path.** CodeGen registers a new entity by INSERTing into `Entity` / `EntityField` / `EntityPermission` — long-lived core-metadata tables that no migration re-creates, so the AST dialect never sees a `CREATE TABLE` for them, has no column types to infer, and emits a BIT literal as the integer it looks like. Applying the result failed with `column "IncludeInAPI" is of type boolean but expression is of type integer`. The rule-based (legacy) path already seeds this catalog through `createConversionContext`; the split path assembles its output from the transpiler directly and bypassed it, so **every** migration registering a new entity produced a file that failed on its first apply.

  `assemblePgSQL` now applies the core-metadata boolean catalog. Ordering is load-bearing and was wrong in the first cut: the INSERT matcher keys on a `schema.Table` reference whose schema is word characters, so while the table is still `${flyway:defaultSchema}."Entity"` it matches nothing and the coercion silently no-ops. It runs **after** schema substitution, and a regression test pins that by asserting on a macro-carrying input. Rewriting is by ordinal position against known-boolean columns, so a non-boolean integer in the same tuple (`UserViewMaxRows`) and a table outside the catalog are both left alone.

  Related but distinct from the `--bake-codegen` registry fix ("Seed the BIT/BOOLEAN registry from the live catalog"), which repaired the same class of failure on the bake path; this one repairs the split-assembly path, which bake cannot reach when a migration has a transpile gap.

## 6.1.0-edge.4

### Patch Changes

- 647bd71: Enable layered base views on PostgreSQL. CodeGen writes the inner view and restars the application-owned outer wrapper so `g.*` re-expands after inner regeneration (no more throw). New pg-only migration ships `spRebindLayeredOuterView` plus core MJ inner/outer views. Open App `mj migrate` rebinds layered outers in the app schema before field heal.

## 6.1.0-edge.3

### Minor Changes

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

### Patch Changes

- 1fdd5d0: Fix PostgreSQL identifier quoting for column names that collide with SQL keywords, and consolidate the two divergent tokenizers into one shared implementation.

  **The defect.** PostgreSQL identifier auto-quoting used a keyword denylist matched case-INsensitively: a PascalCase word was quoted unless it appeared in a hardcoded keyword set. The set of SQL keywords and the set of MJ column names overlap, so every name in the intersection was emitted unquoted, folded to lowercase on PostgreSQL, and failed with `column "..." does not exist`. Eleven such columns ship in the baseline schema — `Name` (on 175 tables), `Values` (the field-level-encrypted column on `__mj."Credential"`), `Length`, `Precision`, `Log`, `Rank`, `Action`, `Columns`, `Language`, `Month`, and `Text`. SQL Server resolves identifiers case-insensitively, so T-SQL-first authoring never surfaced any of it; the failures only appeared on live PostgreSQL deployments. Addresses MJ #3604, #3590, #3691.

  **The fix.** Keywords are now matched **case-sensitively, in their ALL-CAPS form only**. This generalizes a mechanism that already existed for exactly two words (`TYPE` and `DATA`, which were special-cased by hand for the same reason) to the whole keyword set. Dialects always emit keywords upper-case, so the keyword spelling and the column spelling are textually distinct: `TEXT` is the type, `Text` is the column. Critically, an ALL-CAPS word that is _not_ a keyword is still an identifier — `ID` and `URL` are all-caps by nature, so the rule is `!(isAllUpper && isKeyword)`, not a pure case rule. `SELECT Length, LENGTH(Name)` now correctly yields `SELECT "Length", LENGTH("Name")`.

  **Structural change.** There were two copies of the tokenizer — one in `PostgreSQLCodeGenProvider.quoteSQLForExecution` (all codegen-time SQL, via `ManageMetadataBase.qsql()`) and one in `PostgreSQLDataProvider.autoQuoteIdentifiers` (every runtime raw-SQL statement, via `ExecuteSQL`) — with a comment instructing that they be kept in sync by hand. They had already diverged: 289 keywords versus 312, plus a case-sensitive tier and a dot-qualified-identifier rule present only at runtime. Both now delegate to `AutoQuotePostgreSQLIdentifiers` in `@memberjunction/sql-dialect`, which carries the union of both keyword sets. Two consequences worth noting: codegen-time SQL gains the dot-qualification rule, so `__mj.vwFoo` no longer folds to lowercase during codegen; and runtime gains the transaction-control keywords (`CONSTRAINTS`, `IMMEDIATE`, `DEFERRED`, `SAVEPOINT`, `RELEASE`) that previously existed only in the codegen copy.

  **Compatibility.** A word immediately followed by `(` is treated as a function call and left unquoted, unless it is dot-qualified. Without this, mixed-case function spellings that used to work (`Coalesce(`, `IsNull(`) would have broken under case-sensitive matching; it additionally fixes ALL-CAPS functions that were simply missing from the keyword set (`JSONB_BUILD_OBJECT(` was previously quoted, and failed). The dot exception preserves quoting for MJ's own stored procedures, which are created with quoted mixed-case names.

  Separately, a small tier of structural words stays case-insensitive so SQL authored **outside** this repository keeps parsing — a stored `MJ: Queries` body, a saved `UserView.WhereClause`, a GraphQL `ExtraFilter`, none of which this change can reach and fix. It is the predicate vocabulary only: `AND OR NOT IS NULL LIKE ILIKE IN BETWEEN EXISTS ASC DESC NULLS FIRST LAST`.

  The reverse lookup that recognizes the _follower_ of a contextual pair declines to pair with a key that is dot-qualified or already quoted, and refuses to read backwards across a `--` comment. Both make it the true mirror of the forward lookup: without the first, `t.Order By Name` produced a different result on a second pass, violating the module's stated `f(f(x)) === f(x)`; without the second, a comment line ending in the word `order` left a real column named `By` on the next line unquoted.

  A second, **contextual** tier covers the two-word clause forms without giving up column names: `Order`/`Group` are structural only before `By`, and `Left`/`Right`/`Full`/`Inner`/`Cross`/`Outer` only before `Join`/`Outer`. Both halves of a matched pair are recognized, and it chains through `Full Outer Join`. Everywhere else they are ordinary identifiers, so `SELECT Order FROM …` and `Left(Name, 3)` both still work.

  **A dot-qualified word is an identifier**, checked before the structural and contextual tiers. No SQL dialect has a _structural_ keyword after a `.`, so this makes it impossible for a word added to those sets to fold a legitimate `alias.Column`.

  The ALL-CAPS keyword tier is the one exception, and it is deliberately evaluated first. Several entries exist _specifically_ for their dot-qualified form — `INFORMATION_SCHEMA.COLUMNS`, `.TABLES`, `.ROUTINES` — and the catalog's real relation names are lower case, so quoting the right-hand half yields `INFORMATION_SCHEMA."COLUMNS"`, which does not resolve. CodeGen executes that exact SQL through `qsql()` on every PostgreSQL run (`manage-metadata.ts`, three call sites, two of them unconditional), so an unconditional dot rule turns a working CodeGen run into a hard failure. Because tier 1 is case-SENSITIVE it cannot swallow a real column: `Case` is not `CASE`, so `e.Case` still falls through to the dot rule and quotes. Verified against the newest PostgreSQL baseline — the only ALL-CAPS columns in the shipped schema are `ID, URL, URI, ISO2, ISO3, SQL, BCMID, ISO3166_2`, none of them keywords.

  **Known limitation, deliberately not fixed.** Mixed-case clause keywords beyond the predicate vocabulary do not survive: a stored query body written `Select … From … Where …` fails on PostgreSQL. Widening the case-insensitive tier to the full clause skeleton was tried and reverted. That tier is evaluated case-insensitively, so adding `CASE`/`END`/`LIMIT`/`OFFSET` made those unquotable as column names — reintroducing, for 20 words, exactly the defect class this change eliminates. And it did not even work: `Cast(Amount As Decimal)`, `Insert Into Target (Name)` and `Select Top 10` all still failed, because mixed-case SQL needs a parser rather than a bigger denylist. The failure is a loud syntax error, not silently wrong rows, and rewriting the keywords in upper case fixes it.

  A CI test derives every column name from the newest shipped PostgreSQL baseline's `CREATE TABLE __mj."…"` blocks and fails the build if one collides with the case-insensitive tier. Its scope is exactly that — core-schema columns as of the last baseline; columns added by later migrations, and non-`__mj` schemas, are not covered by it. That scope is adequate for a tier this small (no predicate-vocabulary word can be a column name in any schema) and would not have been for the reverted widening.

  **Comments, template tags and literal prefixes.** The tokenizer is a parity machine, and three regions it did not recognize could invert that parity for the rest of a statement. `--` and (nesting) `/* */` comments are now skipped — an apostrophe inside a comment used to open a string-literal scan that ran to the _opening_ quote of the next real literal, after which literals and code swapped roles. Against this repository's own shipped query SQL that rewrote literal **values**: `WHERE ars."StepType" = 'Prompt'` became `= '"Prompt"'` (no rows), and the `jsonb_build_object` keys in `get-conversation-complete.pg.sql` became `'"ID"'` (JSON whose keys are `"\"ID\""`, so every consumer reading `.ID` got undefined) — all because line 10 of `calculate-ai-agent-run-cost.pg.sql` contains the word `doesn't` in a comment. Nunjucks tags (`{{ … }}`, `{% … %}`, `{# … #}`) are now skipped too, since the names inside them are query PARAMETER names matched exactly at render time and `{{ "ConversationID" | sqlString }}` never substitutes. `E'…'` / `N'…'` / `U&'…'` literal prefixes are recognized as part of the literal rather than tokenized as a word (previously `"E"'…'`), with backslash escapes honoured for the `E` form only. An unterminated `{{`/`{%` now emits its delimiters and resumes scanning rather than consuming the rest of the statement, matching what the dollar-quote branch already did for a missing close tag.

  `""` inside an already-quoted identifier is now consumed explicitly as an escape. This one is **defensive, not a bug fix**: the previous code stopped at the first `"` and then immediately re-entered the same branch at the second, pushing each span verbatim, so the two partitions concatenated identically. Brute-forcing 600,000 inputs over an alphabet built from that construct produced zero differences in output. The explicit form is easier to reason about; nothing observable changed, and the "known limitation" note it replaces was describing a failure that never occurred.

  A test runs the tokenizer over every shipped `metadata/queries/SQL/*.pg.sql` and asserts that string literals and template tags come back byte-identical and that the pass is idempotent, using a literal scanner written independently of the implementation. A second suite covers the quoting-policy tiers directly — dot-qualified words, both halves of each contextual pair, the words that must still quote when their partner is absent, literal prefixes, and the unterminated-delimiter cases — because those decide keyword-vs-identifier and are the only ones whose mistakes can make a real column unreachable.

  **Behavior changes to be aware of.** Both `autoQuoteIdentifiers` and `quoteSQLForExecution` are public methods whose output changes: identifiers that were previously emitted bare are now quoted. Two specific cases are worth calling out. A mixed-case cast type now quotes — write `x::text` or `x::TEXT` rather than `x::Text`, since `Text` is a real column name and must quote. And `INSERT INTO Target(Cols)` with no space before the paren leaves the table name unquoted, because a bare word before `(` is indistinguishable from a call; the spaced form `INSERT INTO Target (Cols)` quotes correctly. A third case, added after review: a **column alias** that collides with a keyword now quotes, which changes the KEY a driver returns. `SELECT COUNT(*) AS Count` previously emitted `Count` bare and PostgreSQL folded the result key to `count`; it now emits `AS "Count"` and the key is `Count`. The same applies to `AS Name`, `AS Type`, `AS Rank` and `AS Value`. The new behaviour is the correct one — it matches the declared `QueryField` name — but a consumer reading the folded lowercase key will break. The only in-repo occurrence is `SQLServerCodeGenProvider.ts:1235`, which is not on this path; stored `Query.SQL` rows in consumer databases can carry such aliases.

  Note also that the compatibility claim below is about **fragments**, not full statements: a stored `UserView.OrderBy` / `ExtraFilter` fragment keeps working, but a complete statement written in Title Case (`Select Name From … Where …`) does not — its keywords quote and it fails. That form previously worked. It does not occur in this repository, and the fix would be worse than the problem, so it is documented rather than changed.

  Neither of the first two patterns occurs in this repository. Note the scope of that check: `autoQuoteIdentifiers` runs inside `ExecuteSQL`, so it also processes hand-written SQL originating in CONSUMER repositories (bizapps and client apps), which were not surveyed. Consumers carrying either spelling will see their output change. SQL Server output is unchanged — `SQLServerCodeGenProvider.quoteSQLForExecution` remains the identity function and shares no code with this path.

  **Coverage.** 404 tests across the package (87 on the shared tokenizer directly), plus delegation suites through both providers' real entry points (the codegen tokenizer had no test coverage at all before this). A CI test extracts all 4,616 column definitions from the shipped PostgreSQL baseline and asserts each one survives quoting, so a newly added colliding column fails the build instead of shipping. Both entry points are additionally proven end-to-end against a live PostgreSQL server, including a control assertion that the same SQL unquoted still fails.

## 6.1.0-edge.2

## 6.1.0-edge.1

## 6.1.0-edge.0

## 6.0.0

## 5.51.0

## 5.50.0

## 5.49.0

## 5.48.0

## 5.47.0

### Patch Changes

- 06a1e44: Make the Open-App metadata teardown dialect-driven with full PostgreSQL parity. The FK-graph cascade in `RemoveAppEntityMetadata` (introduced for SQL Server) now runs on **both SQL Server and PostgreSQL**: identifier quoting comes from the provider's `SQLDialect` (`QuoteSchema`/`QuoteIdentifier`) and the FK-graph catalog query comes from a new `SQLDialect.ForeignKeyGraphSQL(schema)` (SQL Server `sys.foreign_keys`; PostgreSQL `pg_catalog.pg_constraint`, with source-column nullability + composite-FK column-count). Previously PostgreSQL fell back to a hardcoded ~6-entity delete list that **under-deleted** (missing e.g. `RecordChange`), so a used PG app could fail remove/reinstall on a foreign-key violation — that path is now the same complete cascade as SQL Server. The provider-selection gate is `has-a-Dialect` (no longer `!== 'postgresql'`), and only a caller that passes no provider uses the legacy entity-layer fallback. Polymorphic tables are covered via their real single-column `EntityID` FK (nullable → `SET NULL`, NOT-NULL → `DELETE`); the FK-less `RecordID` string half is out of scope (a separate single-record-delete concern).
- 31da520: Open-App teardown review follow-ups. Completes the "Dialect owns it" direction and hardens the seam:
  - **`SQLDialect.AtomicBatchScript(statements)`** (new, SS + PG) now owns the all-or-nothing transaction/session wrapper, so `buildTeardownBatchScript` no longer sniffs `PlatformKey` — the last platform branch leaves the OpenApp engine.
  - `RemoveAppEntityMetadata` is now exported from the package index; a deterministic, self-cleaning **integration suite** (`open-app-teardown-tests.ts`, registered in `run-all.ts`) codifies the used-app remove/reinstall scenario (blocking `RecordChange` + link-less fixed-GUID `Application` → clean teardown → re-create without `PK_Application` collision).
  - `RemoveApp` now passes the context's bound provider (not `undefined`) into `RemoveAppEntityMetadata`, so its metadata reads honor the multi-provider rule instead of the process-global `Metadata`.
  - **PostgreSQL schema-name case-sensitivity** (found via a full PG install → remove lifecycle — the true test of PG parity): PostgreSQL folds unquoted identifiers, so an app whose manifest declares schema `__mj_BizAppsTasks` is created + registered on the `Entity` rows as `__mj_bizappstasks`, while the `OpenApp` record keeps the manifest casing. `RemoveAppEntityMetadata`'s case-sensitive `SchemaName = '…'` therefore matched **zero** entities on PG — the teardown silently cleared nothing yet reported success (masked on SQL Server by case-insensitive collation). The entity lookup, the SchemaInfo cleanup, and `buildRootDoomedPredicate` now compare `LOWER(SchemaName) = LOWER(…)`, so the teardown works on PostgreSQL. Without this, the FK-graph PG "parity" was mechanism-correct but never actually deleted anything for a real CLI-installed app.
  - **Reinstall idempotency** (found via a full install → remove → reinstall lifecycle): `mj app remove` soft-removes (keeps the `OpenApp` row + its `OpenAppDependency` rows), so a reinstall reused that record and the blind dependency insert collided on `UQ_OpenAppDep`. `RecordInstallationAtomically` now clears any pre-existing dependency rows for the app in the same transaction group before re-recording (delete-then-insert, atomic — mirrors the upgrade path). Reinstall of a previously-removed app now succeeds.
  - SQL Server `ForeignKeyGraphSQL` gains `ORDER BY fk.name` (deterministic edge/statement order) and a note that disabled FKs are intentionally included (conservative-safe).
  - Docs corrected to match the has-a-Dialect gate (both dialects run the cascade); the migration-declared-`Application` scan is documented as SQL-Server-only (a PostgreSQL follow-up); `RunFkGraphTeardown`/`RemoveAppEntityMetadata` now warn that the raw-SQL teardown bypasses the `BaseEntity` pipeline (no cache invalidation) for in-process callers; the cross-schema-FK limitation and the downloaded-migrations temp-dir cleanup are addressed.

## 5.46.0

## 5.45.1

## 5.45.0

## 5.44.0

## 5.43.0

### Patch Changes

- b98366b: Integration framework hardening for wide-catalog and multi-level connectors (extracted from the 20-connector close-out; no connector-specific code).
  - **Wide-table safety (dialect-driven in-row size + column-count limits).** The row-size knowledge now lives in the dialect abstraction, not in platform string-branching: `SQLDialect` gains `MaxInRowSizeBytes` (SQL Server `8060`, PostgreSQL `null`), `MaxColumnCount` (SQL Server `1024`, PostgreSQL `1600`), and `EstimateInRowBytes(rawSqlType)` (SQL Server's per-type in-row footprint; base default a conservative off-row pointer). `SchemaBuilder` consumes these via `GetDialect()` — for a dialect with a hard in-row limit it keeps all primary-key columns + a declared-priority core subset within budget, defers the rest (they still sync and land in `__mj_integration_CustomOverflow`), and emits a structured warning instead of shipping a table that fails every `INSERT` with `Cannot create a row of size … greater than 8060`; a dialect with no in-row limit (PostgreSQL/TOAST) only gets a soft advisory near its column-count cap. `IntegrationEngine` adds an env-clamped per-table column ceiling (`MJ_INTEGRATION_MAX_COLUMNS_PER_TABLE`, max 1000 = SQL Server's 1024 minus framework column headroom) so column-count-driven failures degrade to a reversible auto-disable at apply time. Proven on netFORUM (wide objects 8/17 → 15/17, zero 8060 INSERT failures); 17 row-size unit tests.
  - **Multi-level template-var traversal.** `BaseRESTIntegrationConnector.ResolveParentForVar` adds a per-variable parent map (`Configuration.parentObjectNames` `{ "<var>": "<SiblingObject>" }`, with optional `parentObjectIDFieldNames`), checked before the existing single-valued `parentObjectName`. This lets a path with more than one template variable (e.g. `/events/{eventCode}/sessions/{sessionCode}/…`) resolve each variable to its own parent object instead of collapsing both to one parent and tripping the `PARENT_CYCLE` guard (→ 0 rows). Backward-compatible: connectors that declare no `parentObjectNames` are unaffected.
  - **Large-catalog ApplyAll performance.** `IntegrationDiscoveryResolver.createEntityAndFieldMaps` reuses the already-in-memory persisted field schema (built in Phase 1) instead of issuing a live per-object `DiscoverFields` describe in a sequential loop, and resolves the target entity via an `O(1)` `schema.table → EntityInfo` map instead of an `O(N²)` scan. This removes the per-object round-trips and ~millions of comparisons that pushed very large catalogs (e.g. Salesforce's ~1,695 objects) past the client timeout with zero maps created.

## 5.42.0

## 5.41.0

## 5.40.2

## 5.40.1

## 5.40.0

## 5.39.0

## 5.38.0

### Patch Changes

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

## 5.37.0

## 5.36.0

## 5.35.0

## 5.34.1

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

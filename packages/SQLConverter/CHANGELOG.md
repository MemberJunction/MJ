# @memberjunction/sql-converter

## 6.1.0-edge.4

### Patch Changes

- 698aeaf: A statement the converter could not parse now fails the run.

  Two rules write a marker comment into their own output at the point where they knowingly could not produce SQL — `DeclareDmlBlockRule` emits `-- Could not parse: …` and `BatchConverter` emits `-- ERROR converting batch …` — and then return normally. On the legacy `migrate convert` path the batch was therefore counted as `Converted`, so a file that PostgreSQL rejects was reported as `Files: 1 (1 OK, 0 errors)` and the command exited 0. The unusable `.pg.sql` was then committed like any other.

  The markers now live in one place (`CONVERSION_GAP_MARKERS`), the assembled output is scanned for exactly those strings, and matches are counted as `Gaps`. Adding a marker to that list is all a new rule needs to have its gaps reported — an emitter and the scan cannot drift apart, which is the failure mode that made this invisible in the first place.

  `Gaps` is deliberately distinct from `Errors`: an error is a throw the converter CAUGHT and already counted as a failure, while a gap is output it knowingly could not produce, where the rule returned normally and nothing downstream ever learned the file was unusable. An errored batch leaves a marker too, so it is counted in both channels — the scan reports what is actually in the file.

  `decideLegacyConvertExit` fails the run on gaps unless `--allow-gaps` is passed, which finally gives that flag meaning on the legacy path. It never suppresses a caught error, and when both are present the message names both.

- Updated dependencies [647bd71]
  - @memberjunction/sql-dialect@6.1.0-edge.4
  - @memberjunction/sqlglot-ts@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- 07cb22e: Fix `$`-sequence corruption in `String.prototype.replace` calls carrying runtime data (#3171).

  `replace(search, replacement)` treats `$$`, `$&`, `` $` ``, `$'` and `$1`–`$99` as metacharacters when `replacement` is a **string**. Every site below passed runtime data there, so a `$` in that data was silently executed rather than inserted. The `$&`/`` $` ``/`$'` forms are worse than value corruption: they splice surrounding text _into_ the value. All are fixed by passing a replacement **function**, whose return value is used literally.
  - **`@memberjunction/installer` — corrupted secrets (highest impact).** Re-running `mj install` syncs the root `.env` into MJAPI's. A DB password containing `$&` had the _stale_ MJAPI password spliced into it; ``$` `` spliced in the preceding `.env` line. The result was a wrong secret written to disk with no error, surfacing later as "MJAPI can't connect". Only the replace branch was affected — fresh installs (append branch, string concatenation) were always correct, which is why this survived. Also fixes the `newUserSetup` block (embeds user name/email) and the `mjRepoVersion` and Explorer `environment.ts` patchers.
  - **`@memberjunction/core` — rewritten RLS predicates.** `RowLevelSecurityFilterInfo.MarkupFilterText` substitutes user properties, magic-link scope and `{{Acting*}}` tokens into row-level-security filters. A `$` in any of them rewrote the predicate — the exact outcome the neighbouring `'`-escaping exists to prevent. This feeds `GetEffectiveRowFilterWhereClause`, used across RunView reads, Create and Update. Also fixes organic-key `Custom` normalization, which builds a SQL `WHERE` from a data value.
  - **`@memberjunction/generic-database-provider`, `@memberjunction/postgresql-dataprovider`** — end-user search terms substituted into `UserSearchParamFormatAPI` predicates, plus view-template inner SQL and PG identifier quoting. Also `QueryCompositionEngine.renameSQLIdentifier`, which rewrites CTE identifiers in composed queries: the search side was regex-escaped but the replacement side was not, so a `$` in a deconflicted CTE name (SQL Server bracketed and PG quoted identifiers both permit one) was expanded into the executed SQL.
  - **`@memberjunction/ai-prompts`, `@memberjunction/computer-use`, `@memberjunction/ai-vector-sync`, `@memberjunction/aiengine`, `@memberjunction/ai-agents`** — assistant prefill text (routinely contains `$$` for LaTeX or currency), computer-use goals/URLs/step summaries, embedding-document field values, and entity field values, all interpolated into prompts and templates.
  - **`@memberjunction/metadata-sync`** — parameter values in the debug SQL log.
  - **`@memberjunction/testing-engine`** — test input/expected/actual values into the LLM-judge prompt, and parameter values into `SQLValidatorOracle`'s generated SQL.
  - **`@memberjunction/sql-converter`** — the configured schema name substituted into emitted PostgreSQL view SQL, in both `ViewRule` and its previously-missed twin in `InsertRule`. The schema is now escaped on the _search_ side too: a `$` in it acted as an end-anchor, so the pattern matched nothing and the conversion silently emitted no rewrite.
  - **`@memberjunction/sql-parser`** — `restoreAliases` swaps generated aliases back to the caller's original bracketed identifiers. Two of its three branches used `split`/`join` and were already safe; the third expanded `$`-sequences, so `[a$'b]` spliced surrounding SQL into an identifier. The aliasing path fires precisely _because_ an identifier contains a non-word character, so the input that triggers aliasing is the input that corrupted the restore. Reached from the public `ToSQL()`.
  - **`@memberjunction/sqlserver-dataprovider`** — batch execution rewrites `@name` placeholders to `@q<N>_name`; the parameter name went into the `RegExp` unescaped, so a `$` in it prevented the rewrite entirely and mssql failed with "Must declare the scalar variable". Sibling of the PostgreSQL `escapeRegExp` fix below.
  - **`@memberjunction/react-linter`** — component data substituted into diagnostic messages.
  - **`@memberjunction/actions-bizapps-social`, `@memberjunction/ai-cli`** — hardened a numeric-only site; documented the AICLI JSON highlighter's `$1` back-references as intentional.

  Also fixes a **test-tooling safety defect** found while verifying the above on a clean database: `@memberjunction/testing-cli` loaded `.env` with `dotenv.config({ override: true })`, so a variable already set in the environment was overwritten. `DB_DATABASE=MJ_scratch mj test …` was silently discarded and the suite ran — **including mutation tests** — against whatever `.env` pointed at. That made the "one database per agent" rule unenforceable by environment variable and diverged from every other `mj` command (`migrate`, `codegen`, `sync push` all honour the environment). `override` is now dotenv's default `false`, so `.env` still fills in anything unset but an explicit value wins. Guarded by a unit test. **Note the inverse hazard when upgrading:** any environment that exports `DB_*` globally — a Docker image, a CI container, a stale `export` in a shell profile — now wins over `.env`, where `.env` used to be authoritative. If a `mj test` run suddenly targets an unexpected database, check the exported environment first; the CLI prints `config.dbDatabase: <name>` at startup.

  And an adjacent defect found while testing the above: `PostgreSQLDataProvider.quoteFieldNamesInToken` interpolated a field name into a `RegExp` **without escaping regex metacharacters**, so a column named `a.b` matched (and wrongly quoted) unrelated text like `axb`, and a column containing `$` was never matched at all — which had also made the replacement-side fix on that line unreachable. Field names are now escaped before interpolation.

  Also adds `.github/scripts/check-dynamic-replace.mjs`, a CI gate that flags `.replace()`/`.replaceAll()` whose replacement is neither a string literal nor a function. No existing lint rule covered this — the React `string-replace-all-occurrences` rule only ever inspects the _search_ argument. The gate is line-aware (only lines a change touches), since ~100 pre-existing sites remain and a bare identifier holding a function reference is indistinguishable from one holding a string; `--all` is available for auditing. Regression tests now push `$$`, `$&`, `` $` ``, `$'` and `$1` through each fixed path.

  Also fixes a **silently inert security check** found while verifying the above. `BaseTestDriver.Provider` fell back to `new Metadata() as unknown as IMetadataProvider`. `Metadata` is a facade that proxies a hand-maintained subset of members to the global provider, not a provider itself, and the cast is the only reason the compiler accepted it. Members it does not proxy read `undefined` — `RowLevelSecurityFilters` among them. The integration suite's `discoverTokenFilter` reads exactly that property to find a `{{UserID}}`-scoped filter, so it always found none: the `rls-isolation` RLS1/RLS2 token-substitution checks skipped-as-pass **on every database**, while the bundle reported green. There were 13 filters present, 5 of them `{{UserID}}`-scoped. The fallback now returns the global provider, which is what the getter's own doc comment always promised, and both checks now execute. A new `rls-isolation` check (RLS11) additionally pushes `$$`, `$&`, `` $` ``, `$'` and `$1` through a substituted user property and executes the resulting predicate, so the RLS half of this fix has live coverage rather than unit coverage alone.

- a788e27: Fix converted metadata-sync migrations calling PostgreSQL CRUD sprocs in the wrong argument shape, which made a release fail to apply on PostgreSQL with `function __mj.spUpdateEntity(...) does not exist`.

  MJ emits CRUD sprocs in one of two shapes. Narrow entities get typed arguments plus a `<Col>_Clear` companion per nullable column; entities whose projected parameter count reaches `POSTGRESQL_PROCEDURE_PARAM_LIMIT` (90) get a single `p_data JSONB` argument instead, because PostgreSQL caps a function at 100 arguments. `ExecBlockRule` chose between the two by counting the arguments **of the call it was converting**.

  That is the wrong quantity. The shape is a property of the _function_, and a call is not a reliable witness to it:
  - A T-SQL `EXEC` may omit parameters that carry defaults, so a call can be narrower than the procedure it targets.
  - CodeGen decides JSON-arg from the entity's _projected_ parameter count, which counts `_Clear` companions no call is obliged to pass.

  Adding `Entity.Configuration` in v6.1.0-edge.3 landed `MJ: Entities` squarely in the resulting gap. CodeGen projected 90 and emitted `spUpdateEntity(p_data JSONB)` — dropping every typed-arg overload as it did so — while `__mj.spUpdateEntity` on SQL Server has 93 parameters and the single `EXEC` in that release's metadata sync passes 89. Deciding from 89 emitted a typed-arg call against a function that now accepts only JSONB. Nothing in the converted output looked wrong; `mj migrate` simply died on the sync migration, 12,000 lines from the cause.

  No amount of threshold tuning fixes this. `>=` instead of `>` does not help (89 is still below 90), and the converter cannot reproduce CodeGen's projection: a metadata-sync file contains only `EXEC`s, never a `CREATE PROCEDURE`, and `ConversionContext` carries neither procedure arities nor column nullability. Any constant chosen here is a guess that drifts the next time an entity gains a column.

  So the converter no longer guesses. When the call count does not settle the shape, it emits **both** calls under a `pg_proc` lookup that resolves the shape at apply time:

  ```sql
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '__mj' AND p.proname = 'spUpdateEntity'
       AND p.pronargs = 1 AND p.proargtypes[0] = 'jsonb'::regtype
  ) THEN
    PERFORM __mj."spUpdateEntity"(p_data := jsonb_build_object(...));
  ELSE
    PERFORM __mj."spUpdateEntity"(p_ParentID := ..., ...);
  END IF;
  ```

  This is correct against either shape and stays correct as entities widen, which a threshold cannot. Only the taken branch is ever planned — PL/pgSQL plans a statement on first execution, not when the enclosing `DO` block is compiled — so the untaken branch's call does not need to resolve. Calls that exceed the limit on their own are unchanged: no typed-arg function can exist at that width, so they still emit JSON-arg unconditionally with no lookup.

  The `_Clear` handling is unchanged and differs per branch by design: the JSON branch drops those flags, because in JSON-arg shape a present key already means "set this column" — the full-record semantics metadata sync expresses — while the typed branch still passes them.

  Verified end to end: the full v6.1.0-edge.3 migration set (63 migrations) applies to a fresh `postgres:17` database and `mj sync push` then writes 13,849 records with zero errors. New `ExecBlockRule` tests cover the boundary, both branches, and the `_Clear` asymmetry; the 216-case historical conversion suite is unchanged.

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

- 2741d46: Correct T-SQL→PostgreSQL conversion defects that broke open-app installs.

  Parse-level: `DECLARE @x <type> = (SELECT ...)` items (and everything depending on
  them) are no longer dropped, `SET @x = ...` becomes an assignment rather than a PG
  configuration statement, BIT literals in every `INSERT ... VALUES` of a block cast to
  `TRUE`/`FALSE`, and a `SELECT TOP n` inside a DECLARE initializer converts to `LIMIT n`
  on the same line instead of reaching PostgreSQL as a syntax error.

  Identifier folding: a guarded `CREATE SCHEMA` is matched against code only, so a
  comment mentioning the phrase can no longer capture the schema name; constraint names
  are quoted consistently by one shared helper across `CREATE TABLE` inline constraints
  and `ALTER TABLE ADD`/`DROP CONSTRAINT`, so a widened CHECK actually replaces the
  narrow one instead of silently leaving both; and view alias references are quoted only
  when the alias's own definition is case-preserved (`AS <alias>`), leaving implicit
  `FROM x alias` definitions — the form MJ's baseline views use — folded on both sides.

  A guarded `CREATE SCHEMA` whose name is a migration placeholder (`${mjSchema}_Foo`) is
  emitted unquoted, lowercasing only the literal text outside the placeholder span, so it
  matches the unquoted references the identifier converter emits for the same schema. It
  was previously quoted, which created the schema case-preserved while every reference
  folded to lowercase — the same mismatch, in exactly the case the placeholder exists to
  serve.

  Verified end to end against PostgreSQL 17: an open-app migration that produced five
  hard errors before now applies cleanly with the expected rows, widened CHECK, and
  boolean values; and the real `__mj.vwEntityRelationships` / `__mj.vwEntities`
  definitions from the committed baseline still create.

- Updated dependencies [1fdd5d0]
- Updated dependencies [2741d46]
  - @memberjunction/sql-dialect@6.1.0-edge.3
  - @memberjunction/sqlglot-ts@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- @memberjunction/sql-dialect@6.1.0-edge.2
- @memberjunction/sqlglot-ts@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- @memberjunction/sql-dialect@6.1.0-edge.1
- @memberjunction/sqlglot-ts@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- @memberjunction/sql-dialect@6.1.0-edge.0
- @memberjunction/sqlglot-ts@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/sql-dialect@6.0.0
- @memberjunction/sqlglot-ts@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/sql-dialect@5.51.0
- @memberjunction/sqlglot-ts@5.51.0

## 5.50.0

### Patch Changes

- ae992d2: fix(migrate-convert): stop `mj migrate convert` silently dropping statements and emitting empty PG migrations while reporting success (#3252)

  The split-and-regenerate converter could emit empty or broken `.pg.sql` migrations while printing `unhandled stmts: 0` and exiting 0. Three independent root causes are fixed at the dialect, classifier, and bake-path layers:
  - **RC1 — block-less `IF NOT EXISTS(...) CREATE INDEX ...;`** (the v5.49 FK-index shape) fell through to sqlglot, parsed as `exp.IfBlock`, and emitted a bare `;` with no gap reported. The `IF-EXISTS` envelope now captures a block-less guard's single governed statement (so `sys.indexes`/`columns`/`tables` guards translate to the same `DO $$ … pg_indexes … END IF $$` as the `BEGIN…END` form), an `exp.If`/`exp.IfBlock` guard plus an EMPTY-EMISSION postcondition report any node that renders to nothing instead of dropping it, and an inline named `DEFAULT` constraint (`CONSTRAINT [DF_x] DEFAULT (75)` — invalid PG) has its name stripped.
  - **RC2 — a hand-written trigger classified as a CodeGen object and silently dropped** (the file reported a clean `converted` with empty T-SQL). The bare `trg` alternative was removed from the CodeGen-name convention (ledger-verified safe), and an unbannered file now requires a `vw*`/`sp*`/`fn*` object before flipping into statement-mode, so a lone trigger/index can't route a hand-authored file into the drop path.
  - **RC3 — the `--bake-codegen` path applied gappy SQL to the working DB and crashed with zero artifacts.** Forward-mode baking now gates on conversion gaps before touching the working DB, the CLI halts at the first bake-mode gap with a guaranteed non-zero exit, forces a `.needs-hand` artifact for any gap, writes an artifact (never a bare error) on any failure, and rejects `--allow-gaps` together with `--bake-codegen`.

  Adds a soft statement-accounting reconciliation: the dialect self-checks `parsed == emitted + unhandled + dropped` (surfacing an `ACCOUNTING-LEAK` gap, never raising), and each conversion carries a coarse source→output reconciliation that flags substantive T-SQL producing empty output. Validated by a full-ledger sweep over all 201 v5 migrations: zero crashes, zero accounting leaks, zero bare-`;` bodies, zero reconciliation false-positives.

- f749574: fix(pg-migrations): reseed v5.45's curated metadata on PostgreSQL and stop the legacy converter dropping mj-sync record deletions (#3253)

  `V202607071019__v5.45.x__Metadata_Sync.pg.sql` shipped as a **126-byte marker** against a
  12,041-line T-SQL source, so every PostgreSQL database that migrated through v5.45 is missing
  that release's curated metadata. The blast radius is wider than the marker suggests: the v5.46
  PG baseline was dumped from a database that had itself migrated through the marker, so it
  inherited the hole — **0 of 161** v5.45-created rows are present in it, against 261/261 for
  v5.44. **Fresh installs are affected too**, not just migrate-through deployments.

  `V202607271005__v5.50.x__Reseed_v545_Metadata.pg-only.sql` heals both populations forward.
  Committed `.pg.sql` files are Flyway-checksummed and immutable, so the marker and the baseline
  are never rewritten (`DEPLOYMENT.md ("How to heal a ledger gap")` records the
  decision and the three rejected alternatives). The migration runs on every database, gapped or
  whole: 161 creates each guarded by an `IF EXISTS` primary-key check, 13 updates replayed
  unconditionally (idempotent by value), and 1 `IF EXISTS`-guarded delete.

  **20 v5.45 updates are deliberately absent.** The reseed is timestamped after v5.49's sync, so
  replaying a v5.45 update whose target row a later release re-updated full-row would _revert_
  newer state. Each drop asserts its own safety — the later sync's field set must be a superset
  of v5.45's, or generation fails. The 7,153-line migration is generated by
  `scripts/generate-v545-metadata-reseed.mjs` and reproduces byte-for-byte, so the script is what
  gets reviewed, not the SQL.

  Investigating the gap surfaced a second defect in the legacy converter — the path the release
  runbook _mandates_ for `*_Metadata_Sync.sql`. mj-sync emits a record deletion as a bare
  `EXEC [schema].[spDeleteX] @ID = '<uuid>'` with no `DECLARE` block, which fell through to the
  generic bare-`EXEC` skip and vanished into an anonymous "skipped" count while the run exited 0.
  **Not one of 196 deletions across 10 releases (v5.9 through v5.45) ever reached a committed PG
  counterpart.** v5.45 is not where this started; it is where it became visible, because that
  release's counterpart collapsed to a marker.

  Two changes fix it. `StatementClassifier` routes mj-sync's delete signature — a single
  `@ID = '<uuid literal>'` argument — to `EXEC_BLOCK`; requiring the full signature is what keeps
  CodeGen's maintenance procs (`spDeleteUnneededEntityFields`,
  `spUpdateEntityFieldRelatedEntityNameFieldMap`) skipping, since the sp-name prefix alone cannot
  discriminate them. That alone recovered only **16 of 196** — the rest come from an older mj-sync
  that wrote an entire session as one `GO`-less batch, where a delete trailing a save was swallowed
  by the preceding block, again with no `SKIPPED` trace. `ExecBlockRule.splitIntoBlocks` now starts
  a new block at a line-leading `EXEC` once the current block already holds a complete one. Result:
  **196 of 196, zero errors** — and the fix now holds regardless of how mj-sync batches its output,
  rather than only for the single-delete-per-`GO` shape that happens to be current.

  `ExecBlockRule`'s convertibility guard changes shape as a consequence. A block with no `DECLARE`
  was previously unconvertible by definition, which is precisely what dropped the deletes; it now
  converts when the block needs no variables, and still skips **visibly** when it would otherwise
  assign to variables it never declared. That second half matters: a block whose `DECLARE` the
  parser cannot read (a dotted user type, say) yields zero declared vars, and emitting its `SET`s
  anyway produces PL/pgSQL that fails at apply time with `"p_x" is not a known variable` — strictly
  worse than a skip a reader can see.

  **The converter change is additive, and that is verified rather than asserted.** Both builds were
  run over all 49 metadata syncs and every non-delete `DO $mj$` block body compared element-wise:
  byte-identical. The only difference across the corpus is 196 deletions appearing.

  `scripts/check-pg-migration-content.mjs` gains a delete-parity gate so this cannot recur silently —
  issue ask (3) asked for tooling rather than something remembered by whoever runs the release. It is
  deliberately separate from the existing content check: that one is a magnitude detector, and a sync
  with 194 saves that loses its single deletion still scores hundreds of statements on both sides.
  That is exactly how 196 deletions went unnoticed — one missing statement moves the file size by
  ~90 bytes. The 10 historical gaps are grandfathered as a ratchet, with a warning if any ever stops
  being a gap; a new entry means the converter dropped a statement.

  The reseed generator gains the assertion its update path always had. PostgreSQL's generated
  `spUpdateX` silently no-ops on a missing row (`GET DIAGNOSTICS ROW_COUNT = 0 → RETURN`), so on a
  gapped database every v5.46–v5.49 update aimed at a v5.45-created row already did nothing, without
  a trace. Creating that row now from v5.45's values would make the loss permanent and invisible.
  Zero of the 161 creates are currently affected — which is why it needed asserting rather than
  assuming, since nothing else would notice if that changed.

  Verified on a live `postgres:16` across both gapped populations (migrate-through from the v5.38
  baseline, and a fresh install from the v5.46 baseline): all 161 rows absent pre-reseed and present
  post-reseed, the superseded row retaining its **v5.49** value rather than reverting, the
  `ComponentRegistry` row deleted, and a second apply completing with zero errors and zero state
  changes. **No `mj sync push` is required** — `mj migrate` alone converges every population.

- 45d762d: Add a content gate for converted PostgreSQL migrations. `mj migrate convert` can emit an
  empty `.pg.sql` while printing `unhandled stmts: 0` and exiting `0`, and nothing caught it —
  **an empty migration applies perfectly cleanly, so the fresh-database apply that the release
  process treats as authoritative is structurally incapable of failing on it.** The parity check
  only asserts the counterpart file exists.

  This already shipped once. `V202607071019__v5.45.x__Metadata_Sync.pg.sql` is 126 bytes against
  a 12,041-line T-SQL source, so PostgreSQL deployments migrating through v5.45 silently received
  none of that release's curated metadata (#3253). The same behavior recurred three times during
  the v5.49.0 build — header-only stubs, and one file with six bare `;` where six `CREATE INDEX`
  statements belonged. It was found by hand-diffing line counts against sources.

  `scripts/check-pg-migration-content.mjs` now runs in `pg-migrations.yml` before the apply step,
  so a failure points at conversion rather than at SQL. Two design points:
  - **It counts statements, not lines.** The bare-`;` output was 23 lines carrying zero statements;
    a line-count heuristic scores that 23 and passes it. Header boilerplate is excluded, since every
    converted file has it regardless of whether content survived.
  - **The rule is "empty AND undeclared".** Some counterparts are correctly empty — the SQL Server
    migration may alter a routine PostgreSQL maintains in TypeScript (`metadataSupportObjects.ts`).
    A blunt "empty fails" rule would produce false positives and get disabled, so an intentional
    no-op declares itself with `-- PG-EMPTY-BY-DESIGN: <reason>`. The judgement stays with the
    author; the check only enforces that it was recorded.

  Five pre-existing empty counterparts are grandfathered with written reasons, because committed
  `.pg.sql` files are Flyway-checksummed and immutable — editing one breaks `mj migrate` on any
  deployment that already applied it. It is a ratchet rather than an amnesty: the v5.45 entry
  records that it is **not** correct. Investigating another entry narrowed the problem — `v5.38
Fix_AllowUpdateAPI_On_Virtual_Transition`, previously suspected as a second escape, is correctly
  empty, so confirmed shipped escapes drop from two to one.

  The detector self-tests against the real failure shapes, and that step is wired into CI too: a
  neutered comparison and a broken declaration-token regex were both verified to fail it. Without
  it a broken detector would pass everything silently.

  This compensates for the converter defect rather than fixing it (#3252, #3254) — `mj migrate
convert` still writes empty files while reporting success. The `/pg-migrate-experimental` runbook
  and `DEPLOYMENT.md` Step 8 gain the same content check plus a recipe for recovering counterparts
  that feature PRs authored and later deleted by policy.

- aa491dc: Fix 25 tables of drift in the SS→PG boolean-column catalog, and close the hole that hid it.

  `CORE_METADATA_BOOLEAN_COLUMNS` tells the converter which baseline-table columns are PG `BOOLEAN`
  so SQL Server `BIT` literals (`0`/`1`) get rewritten to `FALSE`/`TRUE`. When an entry is missing,
  the literal passes through unchanged and the migration fails **at apply time** with
  `column "X" is of type boolean but expression is of type integer` — never at conversion time.

  The catalog had drifted from the v5.46 baseline by **25 tables**: 21 absent entirely
  (`RemoteOperation`, `RecordProcess`, `ProcessRun`, `AISkillPermission`, `SignatureProvider`,
  `ExternalDataSourceType`, `ViewType`, …) plus missing columns on `AIAgent`
  (`AllowMemoryWrite`, `SupportsPlanMode`, `RequirePlanMode`), `AIAgentRun` (`PlanMode`),
  `ScheduledJob` (`RunImmediatelyIfNeverRun`) and `IntegrationObject` (`SupportsCreate`,
  `SupportsUpdate`, `SupportsDelete`, `ContentHashApplicable`).

  The root cause was in the file's own regeneration recipe: it matched the type name as `/BOOLEAN/`,
  uppercase-only. pg_dump-style baselines spell it lowercase, so re-running the recipe produced an
  **empty** result and the catalog silently stopped tracking the schema. The recipe is now
  case-insensitive and documents why.

  A new test re-derives the catalog from the newest `B*__Baseline.pg.sql` and fails on any gap, so
  this cannot drift silently again. The change is purely additive — no existing entry was removed.

  Found while converting a connector migration that set `IntegrationObject.SupportsCreate`:
  `SupportsWrite` in the same `UPDATE` converted correctly while `SupportsCreate` did not.

- Updated dependencies [ae992d2]
  - @memberjunction/sqlglot-ts@5.50.0
  - @memberjunction/sql-dialect@5.50.0

## 5.49.0

### Minor Changes

- 7d6e8fb: Large-schema CodeGen fix (PostgreSQL): filter system namespaces (`pg_catalog`, `information_schema`, `pg_toast*`, `pg_temp*`) in the four catalog-introspection views (`vwForeignKeys`, `vwTablePrimaryKeys`, `vwTableUniqueKeys`, `vwSQLTablesAndEntities`). They previously scanned the entire cluster catalog with no namespace filter, so `vwSQLColumnsAndEntityFields` paid per-column introspection for every system relation — a cost that grows as CodeGen inflates the catalog mid-run. MJ entities can never live in system namespaces, so no legitimate row is dropped.

  The fix is applied in BOTH channels so it survives a PG baseline regeneration: the migration patches the deployed views, and `@memberjunction/sql-converter`'s `CatalogViewRule` (the generator that emits these views when a PG baseline is cut) now emits the same filter — previously only the migration carried it, so the next regenerated baseline would have silently reverted the fix.

### Patch Changes

- c5e4b9e: Agent conversation compaction: durable cross-turn summaries stored on the conversation (Sequence + SummaryPromptRunID, budget knobs on AIAgentType/AIAgent, Compaction run steps), conversation-history retrieval tools (getMessageBySequence, getMessagesByRange, searchConversation, summarizeRange), edit handling with OriginalMessageChanged flagging and a wired chat edit affordance, plus hardening fixes: failed message expansions now surface a reason to the model (breaks an unbounded retry loop), json5 ESM import fix restores the local JSON-repair tier, and SQLConverter no longer truncates PG column comments at escaped apostrophes.
  - @memberjunction/sql-dialect@5.49.0
  - @memberjunction/sqlglot-ts@5.49.0

## 5.48.0

### Patch Changes

- @memberjunction/sql-dialect@5.48.0
- @memberjunction/sqlglot-ts@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [073842c]
- Updated dependencies [06a1e44]
- Updated dependencies [31da520]
  - @memberjunction/sqlglot-ts@5.47.0
  - @memberjunction/sql-dialect@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/sql-dialect@5.46.0
- @memberjunction/sqlglot-ts@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/sql-dialect@5.45.1
- @memberjunction/sqlglot-ts@5.45.1

## 5.45.0

### Patch Changes

- @memberjunction/sql-dialect@5.45.0
- @memberjunction/sqlglot-ts@5.45.0

## 5.44.0

### Patch Changes

- @memberjunction/sql-dialect@5.44.0
- @memberjunction/sqlglot-ts@5.44.0

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

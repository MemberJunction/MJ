# @memberjunction/testing-cli

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [afd6fd6]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/generic-database-provider@6.1.0-edge.5
  - @memberjunction/testing-engine@6.1.0-edge.5
  - @memberjunction/testing-engine-base@6.1.0-edge.5
  - @memberjunction/testing-integration@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [6cbed1d]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.4
  - @memberjunction/testing-engine@6.1.0-edge.4
  - @memberjunction/generic-database-provider@6.1.0-edge.4
  - @memberjunction/testing-engine-base@6.1.0-edge.4
  - @memberjunction/testing-integration@6.1.0-edge.4

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

- f5ec13b: Harden `SafeExpressionEvaluator` against a sandbox escape, and correct Skipped-status reporting.

  **`SafeExpressionEvaluator` sandbox escape closed.** The previous defense was a textual denylist,
  which a split-token expression walked straight through:
  `[]["cons"+"tructor"]["cons"+"tructor"]("return process.pid")()` spells none of the banned words yet
  climbs `[].constructor.constructor` to the `Function` constructor and reaches `process` — a
  confirmed arbitrary-code route from any metadata-authored expression (field rules, flow/loop agent
  conditions, task-graph conditions). Validation is now a **structural AST allowlist**: the expression
  is parsed and every node checked before compilation, rejecting computed member access whose key is
  not a literal (the concatenation route), `.constructor`/`__proto__`/`prototype` access, any call
  outside the safe-method and safe-global lists, and host-global identifiers. Because the check is structural it cannot
  be defeated by string assembly, and it also stops the denylist's over-rejection of legitimate data —
  `name == 'constructor'` and a field named `window` are now valid again. `validateSyntax` continues to
  parse-without-executing on top of it.

  **The expression grammar NARROWED, and callers should read this list.** The old denylist enforced
  almost nothing, so the accepted surface was in practice "whatever `new Function` compiles". The
  structural allowlist accepts what the evaluator's contract always documented — comparisons, logical
  ops, dotted/indexed access, the `SAFE_METHODS` list, arrow-function array callbacks, `typeof` — plus
  optional chaining (`payload?.customer?.tier`) and the safe globals below. **Now refused**, where the
  denylist let them through: `in` / `instanceof`, regex literals (`/x/.test(y)`), and string/array
  methods outside `SAFE_METHODS` (`.split()`, `.replace()`, `.slice()`, `.substring()`, `.match()`,
  `.join()`). No metadata shipped in this repo uses any of them; installations authoring their own
  expressions (field rules, flow/loop agent conditions, task-graph conditions) should audit the columns
  that store them before upgrading.

  **Ambient globals stay callable, and the list now has ONE owner.** `SAFE_EXPRESSION_GLOBALS` in
  `@memberjunction/global` — `Math`, `Number`, `String`, `Boolean`, `Array`, `Object`, `JSON`, `Date`,
  `parseInt`, `parseFloat`, `isNaN`, `isFinite` — may be called as namespace methods (`Math.abs(...)`,
  `Object.keys(...)`, `JSON.stringify(...)`, `Array.isArray(...)`, `Date.now()`) or as bare functions
  (`Number(...)`, `parseInt(...)`, `isNaN(...)`). Receiver and method are both fixed identifiers, so
  none of the four invariants that close the escape is weakened. `ai-core-plus`'s task-graph door now
  imports that set instead of keeping its own copy: `1efc248ac5` shipped the decision that the door
  must not refuse `Number(payload.count) > 3` or `Math.abs(output.delta) < 5`, and a second curated
  list is how the two halves came apart. `RESOLVABLE_GLOBALS` is removed from
  `@memberjunction/ai-core-plus`; import `SAFE_EXPRESSION_GLOBALS` from `@memberjunction/global`. The
  pinning test now CALLS every entry — it previously only read each name (`Math !== undefined`), which
  is why a screen that refused `Math.abs(x)` passed it.

  **A policy refusal now HOLDS a task-graph edge instead of rerouting it.** `IsBrokenGuard` recognises
  the evaluator's refusal message, so a stored graph carrying a construct this build no longer accepts
  stalls visibly rather than taking a different path with no recorded cause — the dispatcher logs a
  reason only on `hold`.

  **Skipped test status wired through reporting.** `MJ: Test Suite Runs` now records `SkippedTests`
  and `ErrorTests` (previously left NULL); the CLI single-test and suite-markdown formatters render
  Skipped as SKIP rather than FAIL and keep skips out of the Failures section; and the exported
  summary aggregator counts skips separately and averages over the executed set.

- Updated dependencies [834f8d7]
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
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [e68d90d]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [f5ec13b]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [f5ec13b]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/generic-database-provider@6.1.0-edge.3
  - @memberjunction/testing-engine@6.1.0-edge.3
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.3
  - @memberjunction/testing-integration@6.1.0-edge.3
  - @memberjunction/testing-engine-base@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

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

- Updated dependencies [255d506]
- Updated dependencies [59def38]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [e26c866]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [d8adda1]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/generic-database-provider@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/testing-integration@6.1.0-edge.2
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.2
  - @memberjunction/testing-engine@6.1.0-edge.2
  - @memberjunction/testing-engine-base@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/testing-engine@6.1.0-edge.1
  - @memberjunction/testing-engine-base@6.1.0-edge.1
  - @memberjunction/testing-integration@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- 8d0d45a: build: declare dependencies that npm's hoisting was silently supplying, as part of the monorepo's cutover to pnpm.

  Under npm, a package could import a module it never declared and still resolve it, because npm flattens everything into the workspace-root `node_modules`. pnpm's strict, isolated linking gives a package only what it declares — so each of these was a latent bug that happened to work. They are fixed here independently of the package manager; nothing about the published API changes.

  Added declarations: `@types/mssql` (codegen-lib, sqlserver-dataprovider, testing-cli, testing-integration, react-test-harness), `@types/pg` (codegen-lib), `@types/express` (messaging-adapters, server-extensions-core), `@types/fs-extra` (codegen-lib), `@types/babel__traverse` (react-linter), `ora` (ai-cli), `glob` (react-test-harness), `tslib` (ng-bootstrap, which compiles with `importHelpers`), `@auth0/auth0-spa-js` (ng-auth-services), `@memberjunction/core-entities` + `@memberjunction/global` + `@memberjunction/aiengine` (cli), and `@memberjunction/ng-react` (ng-explorer-core, reached from a generated file).

  Two changes are more than a declaration:
  - **`@memberjunction/server`**: `@types/express` moves `^4.17.25` → `^5.0.6`. The package declares `express@^5.2.1` at runtime, so it was only compiling because hoisting supplied the v5 types that six sibling packages declare. The types now match the express it actually runs.
  - **`@memberjunction/ng-auth-services`**: `angularProviderFactory` gains an explicit `Provider[]` return type. Declaring `@auth0/auth0-spa-js` alone does not resolve TS2742 — the emitted declaration file still needed a nameable type rather than one inferred through a transitive package path.
  - **`@memberjunction/scheduled-actions-server`**: drops `@types/axios`, a deprecated stub package that carries no type definitions; its presence made TypeScript auto-include it and then fail to find any types. axios ships its own.

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [fe7bd9d]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [8d0d45a]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.0
  - @memberjunction/testing-integration@6.1.0-edge.0
  - @memberjunction/testing-engine@6.1.0-edge.0
  - @memberjunction/testing-engine-base@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/sqlserver-dataprovider@6.0.0
  - @memberjunction/testing-engine@6.0.0
  - @memberjunction/testing-engine-base@6.0.0
  - @memberjunction/testing-integration@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/testing-engine@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/sqlserver-dataprovider@5.51.0
  - @memberjunction/testing-engine-base@5.51.0
  - @memberjunction/testing-integration@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [fab223d]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/testing-integration@5.50.0
  - @memberjunction/testing-engine@5.50.0
  - @memberjunction/sqlserver-dataprovider@5.50.0
  - @memberjunction/testing-engine-base@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- 1a15bd2: Add the **"Integration Test" `TestType`** — a headless, metadata-driven integration tier that runs the real MJ provider stack (live SQL Server / GraphQL, real cache managers + engines, real entity saves; no browser, no mocks) inside the Testing Framework, focused first on cache-integrity. The standalone `tsx` cache suites in `packages/MJServer/integration-test-scripts/` are graduated into first-class check bundles on one shared registry, so the same definitions run identically via the `npm run test:integration` aggregator **and** via `mj test` / `TestRun` (the `IntegrationTestDriver`) — a single source of truth.

  **New package `@memberjunction/testing-integration`.** Dedicated-process bootstrap that installs an instrumented `LocalCacheManager` as the first caller (`bootstrapIntegrationServer` / `bootstrapIntegrationClient` / `installInstrumentedCacheFirst`, gated by `MJ_INTEGRATION_TEST=1`); the `IntegrationCheckRegistry` + `NamedCheck` contract; the `InstrumentedLocalStorageProvider` / `UniqueFilter` / `TestRunner` / `ai-verify` proof primitives; and the `IntegrationTestDriver` (`@RegisterClass(BaseTestDriver, 'IntegrationTestDriver')`), which dispatches a Test's configured bundles against one bootstrapped context and maps each check to an `OracleResult`. `@memberjunction/testing-cli`'s run/suite commands install the instrumented cache first under `MJ_INTEGRATION_TEST=1` (byte-for-byte unchanged otherwise); the old `lib/harness.ts` becomes a thin re-export shim. The pre-built `@memberjunction/server-bootstrap` class-registration manifest is regenerated (and the package gains a `@memberjunction/testing-integration` dependency) so `IntegrationTestDriver` is registered in-process and survives tree-shaking.

  **Graduated check bundles (single source of truth).** Every standalone suite is now a thin dispatcher of a registry bundle with a metadata `Test` record (IT01–IT23) joined to an "Integration Tests" suite:
  - **Deterministic server:** `server-cache` (S1–S31), `runquery-cache`, `dataset-cache`, `aggregates-cache` (AGG1–3), `record-process`, `record-process-facade`, `scheduled-jobs`, `field-rules-bulk-update`, `remote-operations`, `ai-skills`, `api-keys`, `predictive-studio` seams, `rls-isolation` (RLS1–RLS10 — the two overlapping RLS implementations were merged into one canonical bundle), plus the final three graduated in this pass: `lists` (LS1–3, keyset pagination), `open-app-teardown` (OAT1–2, the FK-graph cascade + link-less Application cleanup — adds a `@memberjunction/open-app-engine` dependency), and `user-routines` (UR1–16, the entity servers + dispatcher end-to-end).
  - **Deterministic client** (needs a live MJAPI; skips cleanly otherwise): `remote-op-wire-progress` (the client bootstrap now derives a `ws(s)://` subscription URL from the HTTP endpoint so the RO-3 progress WebSocket actually connects — it previously passed an empty `wsurl` and threw `Invalid URL` the moment a live MJAPI was reachable, so the check could never pass), and `rls-isolation-client` (RLS7 — the client smart-cache companion to `rls-isolation`, now given its own seeded-Skip IT record instead of being a driver-only orphan).
  - **Live-model** (`RUN_AGENT_TESTS`): `prompt-runner`, `agent-runner`, `concurrent`, `remote-op-ai-authoring`.

  **tsx↔metadata sibling parity is now enforced.** The check logic lives once in a registry bundle; its two "siblings" are a `tsx` dispatcher script and a metadata `Test` record — both thin pointers. A new `sibling-parity.test.ts` drift-check (unit test) fails the build if any registered bundle is missing a dispatcher or an IT record, or if either points at a non-existent bundle (a small, reasoned `NO_TSX_DISPATCHER` allowlist covers deliberately driver/MJAPI-only bundles like `rls-isolation-client`). Backed by a new `IntegrationCheckRegistry.GetBundleNames()`; the coverage-loss guard was extended to the three new bundles. This closed the last three un-graduated `tsx` suites and the one registry-only bundle so all bundles now have both siblings.

  **Tiering & gating.** A single tier model (`tiers.ts`: `deterministic` | `mutation` | `live-model`, with `IsTierEnabled()` reading `RUN_MUTATION_TESTS` / `RUN_AGENT_TESTS`) is honored identically by the aggregator and the driver, so a flag skip-passes the same way on both paths.

  **Engine-level fixture lifecycle.** A per-bundle `BundleLifecycle` (Setup → run → Teardown in FK-safe order) plus suite-scoped `SuiteFixtureContext` (`@memberjunction/testing-engine-base`) with additive `BaseTestDriver.SetupSuite()` / `TeardownSuite()` hooks; `TestEngine.RunSuite` guarantees teardown + run-status update in a `finally` (pass / fail / thrown `Execute` / timeout), and a thrown `Execute` now resolves to a `Status='Error'` `TestRun` instead of wedging `'Running'`. Mutating suites self-clean identically on both front-ends.

  **RLS / multi-user cache isolation.** New version-controlled seed metadata — a purpose-built **"Integration Test: RLS Scoped Reader"** role (scoped read on `MJ: AI Agent Runs` via `UserID = '{{UserID}}'` and nothing else) plus three inert, login-less test accounts — so the strongest RLS checks (fingerprint divergence / server-superset no-cross-serve / live no-leak) **execute for real** instead of skipping on an admin-only DB. Accounts are `Type='User'`, no auth linkage, clearly named, safe to delete. **The test-only integration records — the IT01–IT23 Tests, the integration suite, AND these RLS principals — live in a dedicated optional sibling root `metadata-optional/integration-test/`, NOT the default-pushed `metadata/` tree**, so none of it (least of all the synthetic `IsActive` accounts) ever reaches a production DB that only syncs `metadata/`. (The inert `Integration Test` TestType definition stays in normal `metadata/test-types/` — it's just a type row, no data or security surface — and the IT records `@lookup` it by name.) Seed the optional records with `mj sync push --dir=metadata-optional/integration-test`; the RLS checks skip-as-pass (with the exact push command logged) when absent.

  **Dashboard legibility.** The custom `MJ: Test Runs` form's `getCheckResults()` now reads `ResultDetails` as the bare `OracleResult[]` the engine actually writes (fixing per-check rendering for all engine runs; mapping extracted into an Angular-free, unit-tested `test-run-checks.ts`), and the runs view binds `<mj-execution-context>` to the run's machine/CI fields. The Test Run dialog's "Execution Failed" banner no longer renders empty — a `failureMessage` getter falls back through top-level `errorMessage` → a synthesized per-test summary → the single test's message → a generic note (applies to every TestType).

  **CI / release gate.** New `run-all.ts` aggregator + root `npm run test:integration` spawn each deterministic server suite in its own process (so each owns `LocalCacheManager.Initialize` as first caller) and collapse the per-suite `0/1/2` exit codes into one. The deterministic SQL Server tier is a blocking PR gate.

  **Cross-platform & cross-server seams.** `DbConfig` gains a `Platform` field (`DB_PLATFORM` ∈ {sqlserver, postgresql}, default sqlserver) and `bootstrapIntegrationServer` dispatches accordingly (the PG path ships behind the tracked PG user-cache prerequisite; no PG CI lane yet). A `RUN_CROSS_SERVER=1` spec proves a `Save()` in one MJAPI invalidates a cached read in a second sharing one DB + Redis.

  **RunView cache-layer fixes (`@memberjunction/core`).** Four real bugs the new suites surfaced, fixed in `localCacheManager.ts` + `providerBase.ts`:
  - **SECURITY:** the cache-hit path returned _before_ the DB provider's read-permission gate, so a user lacking `CanRead` could be served rows a permitted user had warmed (an observed cross-user data leak). `PreRunView` and the `RunViews` batch now skip the cache when the user lacks read permission on the entity, falling through to the DB path's proper denial (server-cache S31).
  - **SECURITY:** closed the **ViewID-only** variant of that bypass. The S31 gate keys off the entity resolved from `params.EntityName`; a `ViewID`/`ViewName`-only request (the Explorer-standard saved-view shape) resolved no entity there, so a read-denied user could still hit a slot a permitted user warmed for the same ViewID. `ProviderBase.cacheDeniedForViewOnlyRequest` (both cache paths) now resolves `ViewEntity` synchronously and applies the `CanRead` gate, or **fails closed** for a `ViewID`/`ViewName`-only request whose entity is only known after the async view lookup the cache-hit path skips. This also closes the RLS cross-serve for view-by-ID (two differently-scoped users no longer share a ViewID slot). Pinned by `providerBase.viewOnlyCacheGate.test.ts` + integration check server-cache **S31b** (**operators: prioritize this upgrade — S31 + S31b are both data-leak fixes**).
  - **SECURITY:** a **stored view's identity** now participates in the RunView cache fingerprint (`vw:` segment). A saved view carries its own server-side `WhereClause` that is not reflected in `params.ExtraFilter`, so a filtered view and a plain unfiltered read of the same entity previously produced identical fingerprints and cross-served — the view was handed the unfiltered slot and returned rows _outside its own WhereClause_. Keyed by ViewID / ViewName / ViewEntity PK, appended only when a view identifier is present → plain entity+filter fingerprints stay byte-identical, no cache invalidation (server-cache S29).
  - **`IgnoreMaxRows`** now participates in the RunView cache fingerprint, so an `IgnoreMaxRows` request no longer collides with (and is served) the capped slot for the same entity. Appended only when true → existing fingerprints stay byte-identical, no cache invalidation (server-cache S28).
  - **`AggregateResults`** are remapped to the caller's requested order on a cache hit; the aggregate fingerprint is order-insensitive by design, so a reordered request must not inherit the warming caller's order (aggregates-cache AGG3).

  **Review-response hardening (PR #3020).** Beyond S31b above: a lifecycle bundle's `Setup` and `Teardown` now run inside ONE `try/finally` on both front-ends (driver + tsx dispatchers), and every mutating fixture publishes its handle up-front + populates it as records are created — so a mid-`Setup` crash still tears down whatever was created instead of orphaning it (`runquery-cache` aligned to the shared lifecycle pattern). A single hung check is now bounded by the remaining run budget (a per-check race) instead of running past the driver timeout forever. The integration CI gate's trigger surface was widened (`migrations/**`, the `metadata-optional/**` root, `mj.config.cjs`/`tsconfig*`/`turbo.json`) and given a `push:` backstop mirroring the unit-test gate; the non-`Active` suite-membership exclusion is now surfaced with a concise always-on log; the testing CLI fails fast when it cannot install the instrumented cache first; and the sibling-parity drift-check was extended to cover the `run-all.ts` aggregator wiring and suite-join membership. `mj sync push` now honors `MJ_MIGRATION_REQUEST_TIMEOUT` (MetadataSync's env-driven config defaults, mirroring MJCLI) so the CI metadata push gets the same cold-server request-timeout headroom as `mj migrate` — mssql's 15s default could otherwise abort the push mid-transaction under embedding-on-save + engine-load latency on a cold runner.

  One related cache gap is **deliberately deferred** and documented in-check as a self-healing skip-as-pass: cross-entity **denormalization** invalidation (server-cache S30) — renaming a parent record does not invalidate cached child rows that denormalize its name, because invalidation keys on the changed entity, not on dependent entities. Fixing it requires fanning invalidation out to dependent entities (a broad, higher-risk change), tracked separately; the check re-arms automatically once that lands.

  All changes are additive / back-compat. Verified live against `mj_integrations` via both the `tsx` scripts and the `IntegrationTestDriver` (server-cache 31/31 with `RUN_MUTATION_TESTS`, aggregates-cache 3/3, rls-isolation 9/9; MJCore unit tests 1484/1484, testing-integration 145/145, testing-engine 45/45, testing-cli 23/23); golden-equivalence (`scripts/integration-golden-diff.mjs`) enforces no coverage loss between the two front-ends.

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [0e52ff6]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [3d0255b]
- Updated dependencies [243523e]
- Updated dependencies [505c8b5]
- Updated dependencies [88d707b]
- Updated dependencies [1a15bd2]
- Updated dependencies [f1ab36f]
- Updated dependencies [4a03c37]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/testing-integration@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/testing-engine@5.49.0
  - @memberjunction/testing-engine-base@5.49.0
  - @memberjunction/sqlserver-dataprovider@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/sqlserver-dataprovider@5.48.0
  - @memberjunction/testing-engine@5.48.0
  - @memberjunction/testing-engine-base@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
- Updated dependencies [936a286]
  - @memberjunction/core@5.47.0
  - @memberjunction/sqlserver-dataprovider@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/testing-engine@5.47.0
  - @memberjunction/testing-engine-base@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/sqlserver-dataprovider@5.46.0
  - @memberjunction/testing-engine@5.46.0
  - @memberjunction/testing-engine-base@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/testing-engine@5.45.1
- @memberjunction/sqlserver-dataprovider@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1
- @memberjunction/testing-engine-base@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/sqlserver-dataprovider@5.45.0
  - @memberjunction/testing-engine@5.45.0
  - @memberjunction/testing-engine-base@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/testing-engine@5.44.0
  - @memberjunction/sqlserver-dataprovider@5.44.0
  - @memberjunction/testing-engine-base@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
- Updated dependencies [4e05350]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/sqlserver-dataprovider@5.43.0
  - @memberjunction/testing-engine@5.43.0
  - @memberjunction/testing-engine-base@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [5ada858]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/sqlserver-dataprovider@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/testing-engine@5.42.0
  - @memberjunction/testing-engine-base@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/sqlserver-dataprovider@5.41.0
  - @memberjunction/testing-engine@5.41.0
  - @memberjunction/testing-engine-base@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/sqlserver-dataprovider@5.40.2
- @memberjunction/testing-engine@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2
- @memberjunction/testing-engine-base@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/sqlserver-dataprovider@5.40.1
  - @memberjunction/testing-engine@5.40.1
  - @memberjunction/testing-engine-base@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/sqlserver-dataprovider@5.40.0
  - @memberjunction/testing-engine@5.40.0
  - @memberjunction/testing-engine-base@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [7dfacc7]
- Updated dependencies [eaee99f]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/sqlserver-dataprovider@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/testing-engine@5.39.0
  - @memberjunction/testing-engine-base@5.39.0

## 5.38.0

### Patch Changes

- 67d6562: Add full-stack MJ Explorer regression test suite — Docker-based runner with Computer Use engine, parallel workers via HeadlessBrowserEngine, bacpac mode, standalone compose for external use, and `mj test regression init` templates (remote-mj, generic-web, bring-your-own-app, static-file-server). Includes ephemeral workspace guard for cross-test isolation and stabilizes the suite at 25/25.
- 48dc77a: Add full-stack regression test suite for MJ Explorer driven by the Computer Use engine. New `Drag` browser action with smooth multi-step mouse motion, parallel browser worker contexts shared across tests with auto-rotation after 20 uses, JSON-on-disk run comparison via `mj test compare --from-json`, and `--dry-run` / `--parallel` / `--flaky-check` flags on the testing CLI.
- Updated dependencies [67d6562]
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [48dc77a]
- Updated dependencies [ebb0e3d]
  - @memberjunction/testing-engine@5.38.0
  - @memberjunction/testing-engine-base@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/sqlserver-dataprovider@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/testing-engine@5.37.0
  - @memberjunction/sqlserver-dataprovider@5.37.0
  - @memberjunction/testing-engine-base@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/sqlserver-dataprovider@5.36.0
  - @memberjunction/testing-engine@5.36.0
  - @memberjunction/testing-engine-base@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/sqlserver-dataprovider@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/testing-engine@5.35.0
  - @memberjunction/testing-engine-base@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/sqlserver-dataprovider@5.34.1
  - @memberjunction/testing-engine@5.34.1
  - @memberjunction/testing-engine-base@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

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
  - @memberjunction/sqlserver-dataprovider@5.34.0
  - @memberjunction/testing-engine@5.34.0
  - @memberjunction/testing-engine-base@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [312fcee]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/sqlserver-dataprovider@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/testing-engine@5.33.0
  - @memberjunction/testing-engine-base@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/sqlserver-dataprovider@5.32.0
  - @memberjunction/testing-engine@5.32.0
  - @memberjunction/testing-engine-base@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/sqlserver-dataprovider@5.31.0
  - @memberjunction/testing-engine@5.31.0
  - @memberjunction/testing-engine-base@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/sqlserver-dataprovider@5.30.1
- @memberjunction/testing-engine@5.30.1
- @memberjunction/testing-engine-base@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/testing-engine@5.30.0
  - @memberjunction/sqlserver-dataprovider@5.30.0
  - @memberjunction/testing-engine-base@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/sqlserver-dataprovider@5.29.0
  - @memberjunction/testing-engine@5.29.0
  - @memberjunction/testing-engine-base@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/testing-engine@5.28.0
  - @memberjunction/sqlserver-dataprovider@5.28.0
  - @memberjunction/testing-engine-base@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/sqlserver-dataprovider@5.27.1
  - @memberjunction/testing-engine@5.27.1
  - @memberjunction/testing-engine-base@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/sqlserver-dataprovider@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0
- @memberjunction/testing-engine@5.27.0
- @memberjunction/testing-engine-base@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/testing-engine@5.26.0
  - @memberjunction/sqlserver-dataprovider@5.26.0
  - @memberjunction/testing-engine-base@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/sqlserver-dataprovider@5.25.0
  - @memberjunction/testing-engine@5.25.0
  - @memberjunction/testing-engine-base@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/testing-engine@5.24.0
  - @memberjunction/sqlserver-dataprovider@5.24.0
  - @memberjunction/testing-engine-base@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/sqlserver-dataprovider@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/testing-engine@5.23.0
  - @memberjunction/testing-engine-base@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/testing-engine@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/sqlserver-dataprovider@5.22.0
  - @memberjunction/testing-engine-base@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/sqlserver-dataprovider@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/testing-engine@5.21.0
  - @memberjunction/testing-engine-base@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/sqlserver-dataprovider@5.20.0
  - @memberjunction/testing-engine@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/testing-engine-base@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/testing-engine@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/sqlserver-dataprovider@5.19.0
- @memberjunction/testing-engine-base@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/testing-engine@5.18.0
- @memberjunction/sqlserver-dataprovider@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/core-entities@5.18.0
- @memberjunction/global@5.18.0
- @memberjunction/testing-engine-base@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/sqlserver-dataprovider@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/testing-engine@5.17.0
  - @memberjunction/testing-engine-base@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/sqlserver-dataprovider@5.16.0
  - @memberjunction/testing-engine@5.16.0
  - @memberjunction/testing-engine-base@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/sqlserver-dataprovider@5.15.0
  - @memberjunction/testing-engine@5.15.0
  - @memberjunction/testing-engine-base@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/sqlserver-dataprovider@5.14.0
  - @memberjunction/testing-engine@5.14.0
  - @memberjunction/testing-engine-base@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/sqlserver-dataprovider@5.13.0
  - @memberjunction/testing-engine@5.13.0
  - @memberjunction/testing-engine-base@5.13.0

## 5.12.0

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/sqlserver-dataprovider@5.12.0
  - @memberjunction/testing-engine@5.12.0
  - @memberjunction/testing-engine-base@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/sqlserver-dataprovider@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/testing-engine@5.11.0
  - @memberjunction/testing-engine-base@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/sqlserver-dataprovider@5.10.1
- @memberjunction/testing-engine@5.10.1
- @memberjunction/testing-engine-base@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/sqlserver-dataprovider@5.10.0
  - @memberjunction/testing-engine@5.10.0
  - @memberjunction/testing-engine-base@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/sqlserver-dataprovider@5.9.0
  - @memberjunction/testing-engine@5.9.0
  - @memberjunction/testing-engine-base@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/sqlserver-dataprovider@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/testing-engine@5.8.0
  - @memberjunction/testing-engine-base@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/sqlserver-dataprovider@5.7.0
  - @memberjunction/testing-engine@5.7.0
  - @memberjunction/testing-engine-base@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/sqlserver-dataprovider@5.6.0
  - @memberjunction/testing-engine@5.6.0
  - @memberjunction/testing-engine-base@5.6.0
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
  - @memberjunction/sqlserver-dataprovider@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/testing-engine@5.5.0
  - @memberjunction/testing-engine-base@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1
- @memberjunction/sqlserver-dataprovider@5.4.1
- @memberjunction/testing-engine@5.4.1
- @memberjunction/testing-engine-base@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/sqlserver-dataprovider@5.4.0
  - @memberjunction/testing-engine@5.4.0
  - @memberjunction/testing-engine-base@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1
- @memberjunction/sqlserver-dataprovider@5.3.1
- @memberjunction/testing-engine@5.3.1
- @memberjunction/testing-engine-base@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/testing-engine@5.3.0
  - @memberjunction/sqlserver-dataprovider@5.3.0
  - @memberjunction/testing-engine-base@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/sqlserver-dataprovider@5.2.0
  - @memberjunction/testing-engine@5.2.0
  - @memberjunction/testing-engine-base@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/sqlserver-dataprovider@5.1.0
  - @memberjunction/testing-engine@5.1.0
  - @memberjunction/testing-engine-base@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/sqlserver-dataprovider@5.0.0
  - @memberjunction/global@5.0.0
  - @memberjunction/testing-engine@5.0.0
  - @memberjunction/testing-engine-base@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/sqlserver-dataprovider@4.4.0
  - @memberjunction/testing-engine@4.4.0
  - @memberjunction/testing-engine-base@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- 690f6e0: no migration
  - @memberjunction/core@4.3.1
  - @memberjunction/core-entities@4.3.1
  - @memberjunction/global@4.3.1
  - @memberjunction/sqlserver-dataprovider@4.3.1
  - @memberjunction/testing-engine@4.3.1
  - @memberjunction/testing-engine-base@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/testing-engine@4.3.0
  - @memberjunction/sqlserver-dataprovider@4.3.0
  - @memberjunction/testing-engine-base@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0
- @memberjunction/sqlserver-dataprovider@4.2.0
- @memberjunction/testing-engine@4.2.0
- @memberjunction/testing-engine-base@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [f54a9e4]
- Updated dependencies [77839a9]
- Updated dependencies [9fab8ca]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/sqlserver-dataprovider@4.1.0
  - @memberjunction/core@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/testing-engine@4.1.0
  - @memberjunction/testing-engine-base@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [65b4274]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [58ec618]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/sqlserver-dataprovider@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0
  - @memberjunction/testing-engine@4.0.0
  - @memberjunction/testing-engine-base@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [3a71e4e]
- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/sqlserver-dataprovider@3.4.0
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/testing-engine@3.4.0
  - @memberjunction/testing-engine-base@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/testing-engine@3.3.0
  - @memberjunction/sqlserver-dataprovider@3.3.0
  - @memberjunction/testing-engine-base@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/sqlserver-dataprovider@3.2.0
  - @memberjunction/testing-engine@3.2.0
  - @memberjunction/testing-engine-base@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/global@3.1.1
- @memberjunction/sqlserver-dataprovider@3.1.1
- @memberjunction/testing-engine@3.1.1
- @memberjunction/testing-engine-base@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/global@3.0.0
- @memberjunction/sqlserver-dataprovider@3.0.0
- @memberjunction/testing-engine@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/sqlserver-dataprovider@2.133.0
  - @memberjunction/testing-engine@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/sqlserver-dataprovider@2.132.0
  - @memberjunction/testing-engine@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/sqlserver-dataprovider@2.131.0
  - @memberjunction/testing-engine@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/core@2.130.1
- @memberjunction/core-entities@2.130.1
- @memberjunction/global@2.130.1
- @memberjunction/sqlserver-dataprovider@2.130.1
- @memberjunction/testing-engine@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/sqlserver-dataprovider@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/testing-engine@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Patch Changes

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
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/testing-engine@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/sqlserver-dataprovider@2.128.0
  - @memberjunction/testing-engine@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/testing-engine@2.127.0
  - @memberjunction/sqlserver-dataprovider@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/core@2.126.1
- @memberjunction/core-entities@2.126.1
- @memberjunction/global@2.126.1
- @memberjunction/sqlserver-dataprovider@2.126.1
- @memberjunction/testing-engine@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [703221e]
  - @memberjunction/core@2.126.0
  - @memberjunction/testing-engine@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/sqlserver-dataprovider@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/sqlserver-dataprovider@2.125.0
  - @memberjunction/testing-engine@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/sqlserver-dataprovider@2.124.0
  - @memberjunction/testing-engine@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1
- @memberjunction/sqlserver-dataprovider@2.123.1
- @memberjunction/testing-engine@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/testing-engine@2.123.0
- @memberjunction/sqlserver-dataprovider@2.123.0
- @memberjunction/core@2.123.0
- @memberjunction/core-entities@2.123.0
- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- Updated dependencies [81f0c44]
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/sqlserver-dataprovider@2.122.2
  - @memberjunction/testing-engine@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/core@2.122.1
- @memberjunction/core-entities@2.122.1
- @memberjunction/global@2.122.1
- @memberjunction/sqlserver-dataprovider@2.122.1
- @memberjunction/testing-engine@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/sqlserver-dataprovider@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/testing-engine@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/testing-engine@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/sqlserver-dataprovider@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/sqlserver-dataprovider@2.120.0
  - @memberjunction/testing-engine@2.120.0
  - @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- Updated dependencies [7dd7cca]
  - @memberjunction/core@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/sqlserver-dataprovider@2.119.0
  - @memberjunction/testing-engine@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Minor Changes

- a49a7a8: migration
- 1bb5c29: migration

### Patch Changes

- Updated dependencies [264c57a]
- Updated dependencies [a49a7a8]
- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
- Updated dependencies [1bb5c29]
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/testing-engine@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/sqlserver-dataprovider@2.118.0
  - @memberjunction/global@2.118.0

# @memberjunction/sql-parser

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [cc36de5]
- Updated dependencies [914e6ff]
- Updated dependencies [5b41d48]
  - @memberjunction/sql-dialect@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- c7d1170: Security: client SQL fragments reach RunView only through the base-view clause screen. The screen moves from MJServer's `ResolverBase` into `@memberjunction/generic-database-provider` as `ClientClauseScreen`, and the provider exposes it as `ScreenClientClause`. It now also guards `RunViewsWithCacheCheck` (which also gets the `view:batch` API-key scope check), every ad-hoc list source by default (client-supplied, from the list and audience actions, or rebuilt from a stored list snapshot), the REST view routes (which also refuse a `ViewEntity` that was not loaded as an entity), and a saved view's stored WhereClause and sort (on save, and again when the view runs). The screen refuses a subquery over an entity the acting user reads under a row filter (role row-level security or an API-key row filter) or with denied fields, the queried entity included, because a subquery reads the base view without them; the ad-hoc SQL screen uses the same rule. Both screens read table references from a walk of the whole parse tree (subqueries in CASE branches, HAVING and window clauses included, and every FROM item even when an alias repeats), refuse SQL whose SELECT keywords the walk does not account for, refuse a table function in FROM unless it is an unqualified built-in that reads only its arguments, and skip only the parse wrapper's own FROM item. `SQLParser.IdentifierAliases` exposes the names a fallback parse renamed, so bracket-quoted CTE names still resolve. The fallback takes those names from a prefix the SQL does not contain and keeps each one a separate token, so every name in that map is one the parser renamed. `SQLParser.IsIdentifierAliasName` reports that name form, and both screens refuse client SQL that uses it. The ad-hoc SQL screen exempts a FROM item as a CTE reference only when it is unqualified (`dbo` counts as a schema), is in the scope of a WITH that declares the name (its own SELECT or an enclosing one; a CTE body sees the CTEs before it, itself on SQL Server, and every CTE of a PostgreSQL WITH RECURSIVE list), and matches by the dialect's identifier rules (case-insensitive on SQL Server; on PostgreSQL unquoted names fold to lower case and quoted names match exactly). The parse-tree walk takes time linear in the size of the parse tree, and the fallback renaming and the forbidden-function check take time linear in the size of the SQL. A schema-qualified table reference, `dbo` included, resolves only to an entity in that schema. Client clauses may no longer call the functions the dialect forbids in caller SQL (`CallerSQLForbiddenFunctions`), and that shared list now also covers `pg_sleep*` on PostgreSQL and `OPENXML` on SQL Server. The rubric comparison matrix and the conversations UI (the tasks view, task search and the agent artifact lookup) now read the IDs they filter by with their own RunView instead of a subquery over those views; the conversations Tasks tab rebuilds that filter on every load and refresh. On PostgreSQL the screen reads `[Name]` bracket identifiers as the PostgreSQL provider does. Every RunView caller also gets a bracket- and `E''`-aware check that refuses statement separators and comments in filter, sort and search fragments, and a view ID is spliced into SQL only when it is a GUID. A stacked statement hidden from the keyword denylist by a quote inside a bracket identifier no longer reaches the database on these paths.
- 79d4f27: Security (C9): a client filter fragment must now be one balanced SQL expression, read the way the database reads it, so it cannot close the parentheses the server wraps it in and take server-side row filters out of force. Text the lexer cannot read with certainty is refused.
  - **`IsBalancedSQLFragment` (sql-parser).** Reads a WHERE fragment with the dialect's lexer and refuses it when it closes a parenthesis it did not open, leaves one open, ends inside an unterminated string literal, quoted identifier or comment, contains `;`, or contains a comment (allowed only with the new `AllowComments` option, which the provider uses for admin-written custom view WhereClauses). On PostgreSQL it also refuses characters outside ASCII outside string literals and quoted identifiers, dollar-quoted strings and any other `$` outside a name, an escape string followed by another string literal, and a string placed directly after a name containing `@` or `#` (or a number ending in `e`).
  - **`SplitTopLevelAndTerms` (sql-parser).** Splits a fragment at its top-level ANDs (not inside parentheses, CASE … END or a BETWEEN, and on PostgreSQL not inside a SQL Server-style `[…]` name), or returns `null` when it has a top-level OR.
  - **`LexSQL` (sql-parser).** A `--` line comment now ends at a CR as well as an LF, as on SQL Server and PostgreSQL.
  - **MJServer boundary screen.** `assertClientClauseUsesEntityBaseViews` checks the fragment on its own before its wrapped parse, so `1=1) OR (1=1` is refused for `ExtraFilter`, `OrderBy` and `OverrideExcludeFilter` on `RunDynamicView`, `RunViews`, `RunViewByID` and `RunViewByName`. It also refuses a backslash inside a quoted string or identifier, because the screen's parser reads `\'` inside a plain literal as an escaped quote where SQL Server and PostgreSQL do not.
  - **Provider WHERE assembly.** `GenericDatabaseProvider` checks `ExtraFilter`, `OverrideExcludeFilter` and a stored view's rendered `WhereClause` with its own dialect before splicing them next to row-level security, API-key row filters and guest scope, on every RunView path including `RunViewsWithCacheCheck` and `GetRunViewsDatabaseStatus`. When the platform rewrite (`TransformExternalSQLClause`) changes an `ExtraFilter` made of top-level AND terms, the new `PrepareExtraFilterSQL` rewrites, checks and parenthesizes each term on its own, so a predicate a PreRunView hook ANDed on stays a separate term. New protected helpers: `AssertClauseBalanced`, `PrepareExtraFilterSQL`.
  - **Multi-tenancy hook.** `CreateTenantPreRunViewHook` refuses a filter that fails the check and builds `(<ExtraFilter>) AND (<tenant predicate>)`, with the tenant predicate in its own parentheses.

- d1b1958: Follow-up hardening and unit tests for TestQuerySQL and dashboard WebURL panels:
  - **SQLParser niladic user functions (`@memberjunction/sql-parser`)**: Support standard SQL niladic user functions (`CURRENT_USER`, `SESSION_USER`, `SYSTEM_USER`) without parentheses in both `TransactSQL` and `PostgresQL` dialects and round-trip via `ToSQL()` without `()`, fixing `TestQuerySQL` read-only authorization (`RRC5`) on queries selecting `CURRENT_USER`.
  - **TestQuerySQLResolver (`@memberjunction/server`)**: Pass `OriginalSQL: input.SQL` to `RenderPipeline.Run`, use `context.userPayload?.userRecord`, and add unit tests covering read-only authorization and niladic user functions.
  - **WebURLPartComponent (`@memberjunction/ng-dashboard-viewer`)**: Reset `ErrorMessage` on reload, clear `loadCheckTimeout` in `cleanup()`, add `rel="noopener noreferrer"` on external panel links, and add unit test coverage.

- Updated dependencies [c7d1170]
  - @memberjunction/sql-dialect@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- e1942c7: Close stacked-SQL injection through RunView `Aggregates[].expression`. The provider no longer runs a caller's aggregate text. Each expression must be a single aggregate function call over the entity's columns, and the query runs the SQL that the new `CheckAggregateExpression` (in `@memberjunction/sql-parser`) rebuilds from the checked parse tree, with the dialect's quoting. Any other expression returns a per-aggregate error, and the rows and the other aggregates still load. Some expressions that used to run are now refused: arithmetic or functions around the aggregate call (`SUM(x) + 1`, `ROUND(AVG(x), 2)`, `SUM(x) / COUNT(*)`), `CONVERT` (use `CAST`), window clauses, PostgreSQL `FILTER (WHERE …)` and `EXTRACT`, a backslash inside a quoted string or identifier, and `COUNT_BIG(*)` and `TRY_CAST`, which the parser cannot read. The GraphQL boundary screen that guards ExtraFilter and OrderBy now also screens aggregate expressions. `SQLParser.HasStackedStatements` now reads tokens with the dialect's lexer, so a statement separator after a PostgreSQL `E'…'` string is no longer missed. A column reference in an aggregate resolves by `IdentifierMatches` (new in `@memberjunction/sql-dialect`), the rule the field-level security check reports with, so it resolves only to a column that check would report for that reference; a reference that rule does not match to a column is refused, even where the database would resolve it, and on an entity whose columns differ only by case a reference that is not the exact spelling of one of them is refused. A `LIKE … ESCAPE` clause is refused rather than dropped, a parenthesized `NOT (…)` keeps its grouping in the rebuilt SQL, and the lexer reads a PostgreSQL dollar-quote tag that contains non-ASCII letters.
- Updated dependencies [20650af]
- Updated dependencies [e1942c7]
  - @memberjunction/sql-dialect@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- 28c92e0: Saved queries, ad-hoc SQL and composed queries now render and run correctly on SQL Server and PostgreSQL in the shapes that previously failed or returned the wrong rows.
  - **Row caps and paging.** A query's own `TOP` / `LIMIT` / `OFFSET … FETCH` is kept: when the caller also passes `MaxRows`, the smaller wins and `TotalRowCount` follows. CTEs, `WITH RECURSIVE`, query hints, `SELECT DISTINCT`, set operations, `TOP PERCENT` / `WITH TIES` and SQL the parser cannot read are paged and capped by editing the statement in place, or as a derived table, instead of being rewritten from the syntax tree. Ad-hoc SQL with `MaxRows` is paged in the database instead of fetching every row. A requested cap that cannot be applied is logged; paging a `FOR JSON` / `FOR XML` query fails with an error that says so.
  - **Composition.** A dependency's trailing `;`, SQL Server `OPTION (…)` hints, template tags (`{% if %}` and similar) and doubled quotes in static values now compose correctly. The real composition token is resolved, not a copy in a comment or string literal. Composing into an outer `WITH` / `WITH RECURSIVE` produces one valid clause, and a dependency CTE that shares a name with one of the outer query's CTEs is renamed instead of declared twice. A query that references the same dependency twice saves one dependency row.
  - **PostgreSQL.** Pools get the `statement_timeout` and `idle_in_transaction_session_timeout` that match SQL Server's request timeout. Caller-supplied SQL runs in a rolled-back read-only transaction, and the read-only provider gets its own pool on the read-only login. Column references are read as names, and comment stripping no longer breaks dollar-quoted and `E''` strings.
  - **Caller-supplied SQL** must be a single read query. Ad-hoc SQL over GraphQL (`ExecuteAdhocQuery`) now runs through the read-only provider's own ad-hoc path, so it works on PostgreSQL too and pages the same way everywhere. `RunQueryParams.TimeoutSeconds` (ad-hoc SQL) and `ExecuteSQLOptions.timeoutMs` set a per-call limit that the database enforces: the request is cancelled on SQL Server, and `statement_timeout` applies on PostgreSQL. That limit can shorten the server's own limit but never lengthen it.
  - **What caller-supplied SQL may call.** Ad-hoc SQL, `TestQuerySQL` and query specs are refused when they call a function that runs SQL given as a string, or reads files or other databases (on PostgreSQL `query_to_xml` and its family, `ts_stat` and `ts_rewrite`, `dblink`, the server-file and large-object functions, and server-administration functions; on SQL Server `OPENROWSET`, `OPENQUERY`, `OPENDATASOURCE` and the trace and audit file readers). The list is the new `SQLDialect.CallerSQLForbiddenFunctions`. On PostgreSQL, advisory locks taken by such SQL are released before its connection returns to the pool, and MJAPI warns at startup when the read-only login can read base tables or server files.
  - **Dialects.** The rendering pipeline reads `SQLDialect` members (`SelectListPagingOrderBy`, `PagingRequiresOrderBy`, `QueryHintKeyword`, `SupportsEscapeStringLiterals`, `SupportsDollarQuotedStrings`, `StringLiteralPrefix`, `EscapeLikePattern`, `BooleanParameterValue`) instead of checking the platform name, so a new dialect declares its behaviour in one class.
  - **Text filters.** `sqlString` / `sqlIn` keep non-ASCII text on SQL Server, and the LIKE filters escape `[` (SQL Server) and `\` (PostgreSQL). SQL Server bracket-quoted identifiers escape `]`.
  - `RunQueryParams.MaxRows` documents that there is no default row limit, and that `MaxRows` limits the rows returned, not the work the database does.

- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
  - @memberjunction/sql-dialect@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- @memberjunction/sql-dialect@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

- Updated dependencies [80905a1]
  - @memberjunction/sql-dialect@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- 5513c2a: fix: three defects found by the 6.2.0-edge.0 integration gate.
  - `SearchEntities` over GraphQL returned empty results on any server without a read-only database login: the resolver asked for the read-only provider with no fallback and got `null`.
  - Query SQL that wraps a template value in quotes (`= '{{ X }}'`, `LIKE '%{{ X }}%'`) lost its deterministic field extraction: placeholder substitution added a second pair of quotes, so the SQL no longer parsed.
  - A record saved inside a transaction that rolled back stayed in `BaseEngine` caches. Immediate cache mutations now follow the saving transaction: applied on commit, dropped on rollback.
  - `registerTestLLM` now returns a `restore()` for long-lived processes that cannot reset singletons.
  - @memberjunction/sql-dialect@6.2.0-edge.0

## 6.1.0

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

- 806e7f2: Replace the GraphQL ExtraFilter SELECT/EXISTS keyword ban with an AST screen that allows `IN (SELECT … FROM <entity BaseView>)` and still rejects base tables (`__mj.User`). Uses `@memberjunction/sql-parser` (same wrap as EDS `assertReadOnlyClause`). SQLParser now walks `expr.value` so `IN (SELECT …)` subqueries are visible to ExtractTableRefs.
- Updated dependencies [c996a56]
- Updated dependencies [647bd71]
- Updated dependencies [9f73528]
- Updated dependencies [1fdd5d0]
- Updated dependencies [44fca09]
- Updated dependencies [2741d46]
- Updated dependencies [4eb87c5]
  - @memberjunction/sql-dialect@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [c996a56]
- Updated dependencies [44fca09]
  - @memberjunction/sql-dialect@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- 806e7f2: Replace the GraphQL ExtraFilter SELECT/EXISTS keyword ban with an AST screen that allows `IN (SELECT … FROM <entity BaseView>)` and still rejects base tables (`__mj.User`). Uses `@memberjunction/sql-parser` (same wrap as EDS `assertReadOnlyClause`). SQLParser now walks `expr.value` so `IN (SELECT …)` subqueries are visible to ExtractTableRefs.
- Updated dependencies [9f73528]
  - @memberjunction/sql-dialect@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [4eb87c5]
  - @memberjunction/sql-dialect@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [647bd71]
  - @memberjunction/sql-dialect@6.1.0-edge.4

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

- Updated dependencies [1fdd5d0]
- Updated dependencies [2741d46]
  - @memberjunction/sql-dialect@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- @memberjunction/sql-dialect@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- @memberjunction/sql-dialect@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- @memberjunction/sql-dialect@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/sql-dialect@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/sql-dialect@5.51.0

## 5.50.0

### Patch Changes

- @memberjunction/sql-dialect@5.50.0

## 5.49.0

### Patch Changes

- 6c910ef: Dialect-aware query extraction with QuerySQL-triggered re-extraction, PG double-quoted identifier unwrapping in SQL parser, lazy-load QueryEngine in MJQuerySQLEntityServer, and suppress full_access scope probe from API key usage logs
  - @memberjunction/sql-dialect@5.49.0

## 5.48.0

### Patch Changes

- @memberjunction/sql-dialect@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [06a1e44]
- Updated dependencies [31da520]
  - @memberjunction/sql-dialect@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/sql-dialect@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/sql-dialect@5.45.1

## 5.45.0

### Patch Changes

- @memberjunction/sql-dialect@5.45.0

## 5.44.0

### Patch Changes

- @memberjunction/sql-dialect@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [b98366b]
  - @memberjunction/sql-dialect@5.43.0

## 5.42.0

### Patch Changes

- @memberjunction/sql-dialect@5.42.0

## 5.41.0

### Patch Changes

- @memberjunction/sql-dialect@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/sql-dialect@5.40.2

## 5.40.1

### Patch Changes

- @memberjunction/sql-dialect@5.40.1

## 5.40.0

### Patch Changes

- @memberjunction/sql-dialect@5.40.0

## 5.39.0

### Patch Changes

- @memberjunction/sql-dialect@5.39.0

## 5.38.0

### Patch Changes

- 3d739a3: refactor(sql-parser): instance-based parser with dialect adapters, parse-preprocessing, instance-based count SQL, and a render-pipeline write-statement guard
  - **`SQLParser` is now instance-based** (`new SQLParser(sql, dialect)`). AST inspection/mutation (`IsValid`, `StatementKind`, `HasWriteStatement`, `OuterCap`, `SetOuterCap`, `ClearOuterCap`, `ClearOrderBy`, `ToSQL`) and extraction (`ExtractCTEs`, `ExtractTableRefs`, `ExtractColumnRefs`, `ExtractSelectColumns`) are instance members; pure string/token utilities (`ParseSQL`, `SqlifyAST`, `StripComments`, `Tokenize`, `Analyze`, `HasUnwrappableTrailingClause`, `HasStackedStatements`, the MJ-template helpers, …) remain static.
  - **Dialect-neutral row caps via an internal `ASTDialectAdapter`** (keyed by `ParserDialect`). The exported `SQLOuterCap` (with its `kind: 'top' | 'limit'`) is replaced by `RowCapInfo` with an explicit `form: 'numeric' | 'percent' | 'opaque'` discriminant. The `isSQLServerDialect()` quote-probe and the `dialect.PlatformKey === 'sqlserver'` branch in the row-cap path are gone (`outerWrap` now uses `dialect.LimitClause()`).
  - **Parse-preprocessing fallback** in the constructor: on a direct-parse failure it aliases bracket-quoted identifiers with parser-defeating characters (`[Active People]`, `[my-cte]`) and splits a trailing `OPTION (...)` clause, then restores both on `ToSQL`. This lets Skip-style CTE queries and `OPTION` queries reach the precise AST row-cap path (`TOP N` / `LIMIT N`) instead of the OFFSET/FETCH or outer-wrap fallback.
  - **Instance-based count SQL**: `QueryPagingEngine`'s count builder is unified onto the instance API (`ExtractCTEs` + `ClearOuterCap` + `ClearOrderBy` + `ToSQL`), removing the last `as unknown as Record<string, unknown>` cast and raw AST field pokes from the engine. The count now strips the outer cap on **both** dialects, so a paged query's `COUNT(*)` reflects the full set — fixing a PostgreSQL inconsistency where an explicit `LIMIT` previously yielded a capped count (SQL Server already stripped `TOP`).
  - **Render-pipeline safety guard** (`RenderPipeline.Run`): a rendered query must be a single read statement, enforced by two complementary checks. (1) `SQLParser.HasWriteStatement` (AST) rejects a write _type_ anywhere — DML (INSERT/UPDATE/DELETE/MERGE/REPLACE), DDL (DROP/CREATE/ALTER/TRUNCATE/RENAME), or EXEC/CALL/GRANT/REVOKE/USE — catching single writes and parseable stacked writes (`SELECT 1; DROP TABLE x`). (2) `SQLParser.HasStackedStatements` (token scan) rejects any internal statement-separating `;`, catching stacked payloads that don't parse (`SELECT 1; EXEC xp_cmdshell '…'`, `SELECT 1; WAITFOR DELAY '…'`) — the class an AST scan misses because the whole string fails to parse. Both are precise: the `REPLACE()` string function and parenthesized SELECTs pass, and a single trailing `;` is fine; only genuine multi-statement inputs (including `SET` / `DECLARE` prefixes) are rejected. (The broad dangerous-keyword scan stays on the ad-hoc execution path, where input is untrusted free text.)
  - **`SQLExpressionValidator`**: `FOR` is now allowed in `full_query` context so `FOR JSON` / `FOR XML` queries aren't wrongly rejected (`FOR UPDATE` remains blocked via the independent `UPDATE` keyword).

  No behavior change for already-valid read queries; preprocessing only widens AST coverage, the count fix only affects paged queries that carried an explicit cap, and the guard only rejects writes/stacked statements. All consumers (`queryPagingEngine`, `queryCompositionEngine`, `query-extraction`, `manage-metadata`, `structuralParser`) migrated to the instance API.

- Updated dependencies [c0b40c0]
  - @memberjunction/sql-dialect@5.38.0

## 5.37.0

### Patch Changes

- f5531e0: Refactor the SQL render pipeline's row-cap path to be AST-based. Add `SQLParser.StripComments`, a token-aware comment stripper that preserves string literals and quoted identifiers (including SQL Server brackets) and handles nested block comments. Replace the regex-based `applyMaxRows` in `RenderPipeline` with `QueryPagingEngine.WrapWithMaxRows`, which injects `TOP`/`LIMIT` via the AST and falls back to OFFSET/FETCH for parser-unsupported CTE shapes. Throw on `MaxRows + Paging` conflicts instead of silently overriding. Route `AdhocQueryResolver` through `RenderPipeline.Run` so composition macros, templates, and row capping run consistently with saved queries.
  - @memberjunction/sql-dialect@5.37.0

## 5.36.0

### Patch Changes

- @memberjunction/sql-dialect@5.36.0

## 5.35.0

### Patch Changes

- @memberjunction/sql-dialect@5.35.0

## 5.34.1

### Patch Changes

- @memberjunction/sql-dialect@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
  - @memberjunction/sql-dialect@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [5cc5326]
- Updated dependencies [312fcee]
- Updated dependencies [7add405]
  - @memberjunction/sql-dialect@5.33.0

## 5.32.0

### Patch Changes

- @memberjunction/sql-dialect@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- 18be074: Fix boundary wildcard stripping in sqlLike filters, fix QueryProcessor default value handling for array-typed parameters, add Chart.js canvas container and no-unwrap-utility-libs lint rules to react-test-harness, and fix SimpleChart label leak through onDataPointClick
- Updated dependencies [7ed7a4b]
- Updated dependencies [9457655]
  - @memberjunction/sql-dialect@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/sql-dialect@5.30.1

## 5.30.0

### Patch Changes

- @memberjunction/sql-dialect@5.30.0

## 5.29.0

### Patch Changes

- e02e24e: Query rendering pipeline redesign: fix Bug D (Nunjucks expression inside SQL string literal breaks ORDER BY detection), consolidate duplicated ORDER BY logic into shared analyzer, add RenderPipeline entry point with diagnostic tracing, introduce structural parser and symbol table for composition IR, and integrate SQL dialect objects throughout the parser removing all hardcoded dialect switch statements. SQL comments are now stripped before template evaluation instead of escaped. Production callers (RunQuery, TestQuerySQL) delegate to RenderPipeline. 65+ new tests including recursive CTEs, PostgreSQL dialect variants, and comment-stripping coverage.

  Query dashboard and form UI improvements: replace flat category dropdowns with hierarchical tree dropdowns, default new query category to active folder context, add per-folder create buttons, expose Reusable/CacheEnabled/AuditQueryRuns fields in entity form Details panel, add saving indicator with spinner overlay, fix sub-entity delete by reloading fresh entity copies, and fix tree dropdown not showing pre-selected text for branch-only configurations. Fix extraction pipeline not cleaning up stale Query Fields and Query Entities when extraction produces no results, with 9 regression tests.

- Updated dependencies [e02e24e]
  - @memberjunction/sql-dialect@5.29.0

## 5.28.0

## 5.27.1

## 5.27.0

### Patch Changes

- 4357090: Repair three query composition pipeline regressions surfaced by Skip-Brain, clear test feedback dialog state when switching conversations, strip tag IDs from taxonomy context injected into LLM prompts, exclude in-progress runs from last-run-date lookups, and replace direct UUID equality checks with `UUIDsEqual()` in the AI analytics dashboards to comply with the cross-platform UUID compliance test.

## 5.26.0

## 5.25.0

### Patch Changes

- fc8cd52: Autotagging pipeline with run tracking, retry, and tag merge/delete; taxonomy server-side SQL aggregates; vector sync credential engine integration; search resolver and organic key support; unit test fixes across geo-core, ai-vector-sync, MJServer, and UUID compliance.

## 5.24.0

## 5.23.0

## 5.22.0

### Patch Changes

- cf91278: Fix NVARCHAR(MAX) mangling in SQL parser, resolve Invalid string length error in AI monitoring dashboard, add unit tests for AI agent components, and add replaceElements guidance for loop agent prompts

## 5.21.0

## 5.20.0

## 5.19.0

## 5.18.0

### Patch Changes

- 931740a: Fix SQLParser to extract parameters from Jinja2 control flow conditions ({% if %}/{% elif %}) and remove hardcoded golden-queries reusability check from QueryEntityServer.

## 5.17.0

### Patch Changes

- 4b6fd2a: Add composable query passthrough parameter bubbling, deterministic field type resolution from dependency queries and entity metadata, MJLexer-based template variable manipulation, and refactor MJQueryEntityServer into a 5-stage extraction pipeline

## 5.16.0

## 5.15.0

### Patch Changes

- 5e85b29: Fix nested WITH syntax error by hoisting inner CTEs from dependency queries, and disable External Change Detection scheduled job to prevent OOM crash-restart cycles
- d01f697: MJ SQL Parser: unified parser for SQL + Nunjucks templates + composition tokens. Replaces fragmented regex-based SQL parsing across 6 packages with a single MJSQLParser class providing AST-based tokenization, placeholder substitution, CTE extraction, ORDER BY remapping, and deterministic parameter/field extraction. Moves QueryPagingEngine from MJCore to GenericDatabaseProvider with AST-based paging. Fixes backtick quoting, table-qualified ORDER BY remapping, trailing semicolon, and FOR XML parsing bugs.

## 5.14.0

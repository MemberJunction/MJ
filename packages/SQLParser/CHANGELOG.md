# @memberjunction/sql-parser

## 5.51.4

### Patch Changes

- 6140c8f: Close stacked-SQL injection through RunView `Aggregates[].expression`. The provider no longer runs a caller's aggregate text. Each expression must be a single aggregate function call over the entity's columns, and the query runs the SQL that the new `CheckAggregateExpression` (in `@memberjunction/sql-parser`) rebuilds from the checked parse tree, with the dialect's quoting. Any other expression returns a per-aggregate error, and the rows and the other aggregates still load. Some expressions that used to run are now refused: arithmetic or functions around the aggregate call (`SUM(x) + 1`, `ROUND(AVG(x), 2)`, `SUM(x) / COUNT(*)`), `CONVERT` (use `CAST`), window clauses, PostgreSQL `FILTER (WHERE …)` and `EXTRACT`, a backslash inside a quoted string or identifier, and `COUNT_BIG(*)` and `TRY_CAST`, which the parser cannot read. The GraphQL boundary screen that guards ExtraFilter and OrderBy now also screens aggregate expressions. `SQLParser.HasStackedStatements` now reads tokens with the dialect's lexer, so a statement separator after a PostgreSQL `E'…'` string is no longer missed. A column reference in an aggregate resolves by `IdentifierMatches` (new in `@memberjunction/sql-dialect`): a reference that rule does not match to a column is refused, even where the database would resolve it (a look-alike letter such as U+212A KELVIN SIGN never stands in for `k`), and on an entity whose columns differ only by case a reference that is not the exact spelling of one of them is refused. A `LIKE … ESCAPE` clause is refused rather than dropped, a parenthesized `NOT (…)` keeps its grouping in the rebuilt SQL, and the lexer reads a PostgreSQL dollar-quote tag that contains non-ASCII letters.
- 714400d: Security: client SQL fragments reach RunView only through the base-view clause screen. The screen moves from MJServer's `ResolverBase` into `@memberjunction/generic-database-provider` as `ClientClauseScreen`, and the provider exposes it as `ScreenClientClause`. It now also guards `RunViewsWithCacheCheck` (which also gets the `view:batch` API-key scope check), every ad-hoc list source by default (client-supplied, from the list and audience actions, or rebuilt from a stored list snapshot), the REST view routes (which also refuse a `ViewEntity` that was not loaded as an entity), and a saved view's stored WhereClause and sort (on save, and again when the view runs). The screen refuses a subquery over an entity the acting user reads under a row filter (role row-level security), the queried entity included, because a subquery reads the base view without it; the ad-hoc SQL screen uses the same rule. Both screens read table references from a walk of the whole parse tree (subqueries in CASE branches, HAVING and window clauses included, and every FROM item even when an alias repeats), refuse SQL whose SELECT keywords the walk does not account for, refuse a table function in FROM unless it is an unqualified built-in that reads only its arguments, and skip only the parse wrapper's own FROM item. `SQLParser.IdentifierAliases` exposes the names a fallback parse renamed, so bracket-quoted CTE names still resolve. The fallback takes those names from a prefix the SQL does not contain and keeps each one a separate token, so every name in that map is one the parser renamed. `SQLParser.IsIdentifierAliasName` reports that name form, and both screens refuse client SQL that uses it. The ad-hoc SQL screen exempts a FROM item as a CTE reference only when it is unqualified (`dbo` counts as a schema), is in the scope of a WITH that declares the name (its own SELECT or an enclosing one; a CTE body sees the CTEs before it, itself on SQL Server, and every CTE of a PostgreSQL WITH RECURSIVE list), and matches by the dialect's identifier rules (case-insensitive on SQL Server; on PostgreSQL unquoted names fold to lower case and quoted names match exactly). The parse-tree walk takes time linear in the size of the parse tree, and the fallback renaming and the forbidden-function check take time linear in the size of the SQL. A schema-qualified table reference, `dbo` included, resolves only to an entity in that schema. Client clauses may no longer call the functions the dialect forbids in caller SQL (`CallerSQLForbiddenFunctions`), and that shared list now also covers `pg_sleep*` on PostgreSQL and `OPENXML` on SQL Server. Only an Owner-type user may create or change a view with `CustomWhereClause` enabled; such a view's WhereClause is the one stored clause the screen leaves out. On PostgreSQL the screen reads `[Name]` bracket identifiers as the PostgreSQL provider does. Every RunView caller also gets a bracket- and `E''`-aware check that refuses statement separators and comments in filter, sort and search fragments, and a view ID is spliced into SQL only when it is a GUID. A stacked statement hidden from the keyword denylist by a quote inside a bracket identifier no longer reaches the database on these paths.
- adf661f: Security (C9): a client filter fragment must now be one balanced SQL expression, read the way the database reads it, so it cannot close the parentheses the server wraps it in and take server-side row filters out of force. Text the lexer cannot read with certainty is refused.
  - **`IsBalancedSQLFragment` (sql-parser).** Reads a WHERE fragment with the dialect's lexer and refuses it when it closes a parenthesis it did not open, leaves one open, ends inside an unterminated string literal, quoted identifier or comment, contains `;`, or contains a comment (allowed only with the new `AllowComments` option, which the provider uses for admin-written custom view WhereClauses). On PostgreSQL it also refuses characters outside ASCII outside string literals and quoted identifiers, dollar-quoted strings and any other `$` outside a name, an escape string followed by another string literal, and a string placed directly after a name containing `@` or `#` (or a number ending in `e`).
  - **`SplitTopLevelAndTerms` (sql-parser).** Splits a fragment at its top-level ANDs (not inside parentheses, CASE … END or a BETWEEN, and on PostgreSQL not inside a SQL Server-style `[…]` name), or returns `null` when it has a top-level OR.
  - **`LexSQL` (sql-parser).** A `--` line comment now ends at a CR as well as an LF, as on SQL Server and PostgreSQL.
  - **MJServer boundary screen.** `assertClientClauseUsesEntityBaseViews` checks the fragment on its own before its wrapped parse, so `1=1) OR (1=1` is refused for `ExtraFilter`, `OrderBy` and `OverrideExcludeFilter` on `RunDynamicView`, `RunViews`, `RunViewByID` and `RunViewByName`. It also refuses a backslash inside a quoted string or identifier, because the screen's parser reads `\'` inside a plain literal as an escaped quote where SQL Server and PostgreSQL do not.
  - **Provider WHERE assembly.** `GenericDatabaseProvider` checks `ExtraFilter`, `OverrideExcludeFilter` and a stored view's rendered `WhereClause` with its own dialect before splicing them next to row-level security (which also carries guest scope), on every RunView path including the cache check in `RunViewsWithCacheCheck`. When the platform rewrite (`TransformExternalSQLClause`) changes an `ExtraFilter` made of top-level AND terms, the new `PrepareExtraFilterSQL` rewrites, checks and parenthesizes each term on its own, so a predicate a PreRunView hook ANDed on stays a separate term. New protected helpers: `AssertClauseBalanced`, `PrepareExtraFilterSQL`.
  - **Multi-tenancy hook.** `createTenantPreRunViewHook` refuses a filter that fails the check and builds `(<ExtraFilter>) AND (<tenant predicate>)`, with the tenant predicate in its own parentheses.

- 3fa4b09: Security hardening across the data layer: escape/validate composite-key values before SQL interpolation, enforce CanRead on subquery/ad-hoc query entity targets, SELECT-only validation on GetData, bracket-safe SQL Server identifier quoting, and JSON-safe codegen description emission.
- f324af2: Saved queries, ad-hoc SQL and composed queries now render and run correctly on SQL Server and PostgreSQL in the shapes that previously failed or returned the wrong rows.
  - **Row caps and paging.** A query's own `TOP` / `LIMIT` / `OFFSET … FETCH` is kept: when the caller also passes `MaxRows`, the smaller wins and `TotalRowCount` follows. CTEs, `WITH RECURSIVE`, query hints, `SELECT DISTINCT`, set operations, `TOP PERCENT` / `WITH TIES` and SQL the parser cannot read are paged and capped by editing the statement in place, or as a derived table, instead of being rewritten from the syntax tree. Ad-hoc SQL with `MaxRows` is paged in the database instead of fetching every row. A requested cap that cannot be applied is logged; paging a `FOR JSON` / `FOR XML` query fails with an error that says so.
  - **Composition.** A dependency's trailing `;`, SQL Server `OPTION (…)` hints, template tags (`{% if %}` and similar) and doubled quotes in static values now compose correctly. The real composition token is resolved, not a copy in a comment or string literal. Composing into an outer `WITH` / `WITH RECURSIVE` produces one valid clause, and a dependency CTE that shares a name with one of the outer query's CTEs is renamed instead of declared twice. A query that references the same dependency twice saves one dependency row.
  - **PostgreSQL.** Pools get the `statement_timeout` and `idle_in_transaction_session_timeout` that match SQL Server's request timeout. Caller-supplied SQL runs in a rolled-back read-only transaction, and the read-only provider gets its own pool on the read-only login. Column references are read as names, and comment stripping no longer breaks dollar-quoted and `E''` strings.
  - **Caller-supplied SQL** must be a single read query. Ad-hoc SQL over GraphQL (`ExecuteAdhocQuery`) now runs through the read-only provider's own ad-hoc path, so it works on PostgreSQL too and pages the same way everywhere. `RunQueryParams.TimeoutSeconds` (ad-hoc SQL) and `ExecuteSQLOptions.timeoutMs` set a per-call limit that the database enforces: the request is cancelled on SQL Server, and `statement_timeout` applies on PostgreSQL. That limit can shorten the server's own limit but never lengthen it.
  - **What caller-supplied SQL may call.** Ad-hoc SQL, `TestQuerySQL` and query specs are refused when they call a function that runs SQL given as a string, or reads files or other databases (on PostgreSQL `query_to_xml` and its family, `ts_stat` and `ts_rewrite`, `dblink`, the server-file and large-object functions, and server-administration functions; on SQL Server `OPENROWSET`, `OPENQUERY`, `OPENDATASOURCE` and the trace and audit file readers). The list is the new `SQLDialect.CallerSQLForbiddenFunctions`. On PostgreSQL, advisory locks taken by such SQL are released before its connection returns to the pool, and MJAPI warns at startup when the read-only login can read base tables or server files.
  - **Dialects.** The rendering pipeline reads `SQLDialect` members (`SelectListPagingOrderBy`, `PagingRequiresOrderBy`, `QueryHintKeyword`, `SupportsEscapeStringLiterals`, `SupportsDollarQuotedStrings`, `StringLiteralPrefix`, `EscapeLikePattern`, `BooleanParameterValue`) instead of checking the platform name, so a new dialect declares its behaviour in one class.
  - **Text filters.** `sqlString` / `sqlIn` keep non-ASCII text on SQL Server, and the LIKE filters escape `[` (SQL Server) and `\` (PostgreSQL). SQL Server bracket-quoted identifiers escape `]`.
  - `RunQueryParams.MaxRows` documents that there is no default row limit, and that `MaxRows` limits the rows returned, not the work the database does.

- Updated dependencies [7ea6fe6]
- Updated dependencies [6140c8f]
- Updated dependencies [714400d]
- Updated dependencies [3fa4b09]
- Updated dependencies [f324af2]
  - @memberjunction/sql-dialect@5.51.4

## 5.51.3

### Patch Changes

- @memberjunction/sql-dialect@5.51.3

## 5.51.2

### Patch Changes

- @memberjunction/sql-dialect@5.51.2

## 5.51.1

### Patch Changes

- @memberjunction/sql-dialect@5.51.1

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

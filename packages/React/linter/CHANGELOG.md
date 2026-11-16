# @memberjunction/react-linter

## 6.3.0-edge.0

### Minor Changes

- 8bd2fab: Fix false positives in the runtime and type rules found in Skip's audits of AI-generated components. `required-queries-not-called` recognizes RunQuery through any reference to the rq service (`utilitiesRef.current.rq`, an alias of it, a destructured or renamed `rq`) and optional calls. `query-result-field-access-validation` tracks query result variables by binding, so a same-named variable in another function no longer inherits the query's fields. `noisy-settings-updates` flags a save only when its handler is wired to a per-keystroke event (onInput, or onChange on a text input, textarea or Input-like component), so a save on Enter from a key handler is no longer flagged. It recognizes `onSaveUserSettings?.(...)` and `useCallback` handlers, skips a save inside a `setTimeout` or `debounce` callback, and its debounce check now works (it compared against `"[object Object]"`). `component-usage-without-destructuring` accepts `components || {}`, `components ?? {}` and `props.components`.

  Fix type-inference false positives in `type-mismatch-operation` and `type-compatibility`. A variable is now typed where it is read (its enclosing functions) instead of taking the type of any same-named variable elsewhere, so `m - 1` in `for (let m = 1; ...)` is no longer "arithmetic on object" because a helper declared `const m = ... || {}`. String-method checks respect `typeof` guards like the arithmetic checks do, and a guard in a ternary's test now narrows its consequent (`typeof a === 'string' ? a.localeCompare(b) : a - b`). A state setter called with a functional updater (`setPage(p => p + 1)`) no longer types the state as a function, and a later write of another type (an assignment, or `setTier(null)`) widens the variable's type instead of replacing it. `for...of` / `for...in` variables are unknown, not undefined.

### Patch Changes

- Updated dependencies [62eca59]
- Updated dependencies [4d2c52d]
- Updated dependencies [7ed32af]
- Updated dependencies [567d7b9]
- Updated dependencies [c07f654]
- Updated dependencies [9ec4dce]
- Updated dependencies [0d484c2]
- Updated dependencies [03bb8b6]
- Updated dependencies [a01e840]
- Updated dependencies [6555a44]
- Updated dependencies [0ebebfe]
- Updated dependencies [9eb002d]
- Updated dependencies [1dd1af1]
- Updated dependencies [87ac205]
- Updated dependencies [18bb8fa]
- Updated dependencies [6049806]
- Updated dependencies [63636e0]
- Updated dependencies [abb285b]
- Updated dependencies [4884a47]
- Updated dependencies [5c3d369]
- Updated dependencies [b2789ee]
- Updated dependencies [31cc053]
- Updated dependencies [2641e47]
- Updated dependencies [b332459]
- Updated dependencies [100b9c2]
- Updated dependencies [6bd8271]
- Updated dependencies [6c6f0dc]
- Updated dependencies [6fd9fb7]
- Updated dependencies [70b5e38]
- Updated dependencies [28cec7d]
- Updated dependencies [b68d388]
- Updated dependencies [66fcfde]
- Updated dependencies [5c4fa7c]
- Updated dependencies [8c3c8a4]
- Updated dependencies [fbbc06a]
- Updated dependencies [7ace3ee]
- Updated dependencies [2b349b9]
- Updated dependencies [d87bb40]
- Updated dependencies [c889b72]
  - @memberjunction/core@6.3.0-edge.0
  - @memberjunction/core-entities@6.3.0-edge.0
  - @memberjunction/react-runtime@6.3.0-edge.0
  - @memberjunction/global@6.3.0-edge.0
  - @memberjunction/sql-dialect@6.3.0-edge.0
  - @memberjunction/sql-parser@6.3.0-edge.0
  - @memberjunction/interactive-component-types@6.3.0-edge.0

## 6.2.0

### Minor Changes

- 4b9542c: SQL pipeline redesign. Stored queries are now written in a specified language, the MJ Query language (`guides/MJ_QUERY_LANGUAGE.md`), which is checked when a query is saved and before every render. Queries are rendered, then composed, behind a lexer-based safety gate, with per-request dialects, paging, materialized reads and field-level security applied to the rendered statement. A query's fields, parameters and entities now come from the database server's description of the query and from MJ's template parser, and any saved query can be refreshed on demand with `mj query refresh`, the `Query.RefreshExtraction` remote operation, or "Refresh metadata" in Explorer.

  ### New features

  **SQL parsing and dialects** (`@memberjunction/sql-parser`, `@memberjunction/sql-dialect`). SQL dialects are split into facets, and query-only dialects cover external data sources. `@memberjunction/sql-parser` gains a dialect-aware lexer (`SqlTokens`), `QueryTemplate` (the MJ Query language parser and save-time checks), the tolerant structural parser `SqlDocument` with its analyses, `EditSet` transforms that edit the SQL as written instead of regenerating it, and `StrictFragmentValidator`, the fail-closed screen for caller-supplied SQL fragments. The language includes `<name>.length` (`{% if Codes and Codes.length > 0 %}`) and the inline if (`{{ MaxRows | sqlNumber if MaxRows else 12 }}`), which many stored queries use; any other attribute access is refused.

  **Query metadata in the schema** (`@memberjunction/core-entities`). The schema records what the database server reports about a query's output: `QueryField` gains `SourceEntityFieldID` (linked to the entity field, cleared when that field is deleted), `IsNullable` and `SourceObjectName`, and `DetectionMethod` allows `Database` and `Parser`; `Query` gains `ExtractedSQLHash`, `ExtractionStatus` (`OK`, `Warning`, `Error`, `Skipped`) and `ExtractionMessage`. `MJ: Queries` declares `Parameters`, `Fields` and `Entities` collections, so a query and the child rows it declares save as one graph, and declared rows win over extraction for the same name. Query field nullability and source entity field are part of a query's definition signature.

  **Metadata sync** (`@memberjunction/metadata-sync`). `mj sync push` saves `relatedEntities` groups through a parent's declared collection, in the parent's graph save, and `mj sync pull` writes new records in the `collections` format. The `relatedEntities` file format keeps working.

  **Extraction on save** (`@memberjunction/core-entities-server`, `@memberjunction/server`). Saving a new or edited query extracts its metadata from the database server's description of the query (the base render and one render per `{% if %}` branch) and from MJ's template parser: output fields with exact types, nullability and their source entity field, parameters with composition pass-throughs, the entities it reads (`DetectionMethod` `Parser` on parameters and entity links), and its dependencies. Facts are corrected on every row; authored annotations (descriptions, a `Manual` parameter's type, default, sample and filters) are kept. Doc comments (`{# @param / @field #}`, trailing `--:`) count as authored, and an authored parameter the SQL no longer uses is kept and flagged. `UsesTemplate` comes from the lexer, and `ExtractedSQLHash`, `ExtractionStatus` and `ExtractionMessage` record each run: external-data-source queries are `Skipped`, and a describe failure is an `Error` that keeps the stored rows. The derived rows are written as the system user, and the LLM only fills empty descriptions after the save commits (skipped with `SkipEntityAIActions`). `MJQueryEntityServer.ExtractionOverride` (`Auto` / `Skip` / `Force`) controls extraction per save, and `SkipEmbeddings` is honoured. A query that reads a table named by a template parameter (the External Change Detection queries) keeps its declared fields instead of describing a sample table.

  **Refresh without changing SQL** (`@memberjunction/core-entities-server`, `@memberjunction/cli`, `@memberjunction/codegen-lib`). `QueryExtractionService` (`RefreshQuery`, `RefreshQueries` by ID, name or full path, category path, entity read, or all) runs the same extraction a save runs: one transaction per query, the queries a composition depends on first, a dry run that reports the changes without writing, and an optional LLM description pass. Each query gets a report: its outcome, the child rows added, updated and removed, flagged parameters and the run's diagnostics. The entry points are the `Query.RefreshExtraction` remote operation (long-running with progress; API keys need the new `query:refresh` scope), `mj query refresh [--id|--name|--category|--entity|--all] [--dry-run] [--with-ai] [--format text|json]`, and a CodeGen pass that re-binds the queries reading an entity whose fields were added, dropped or changed type. That pass records a query the change broke as an `Error` with the server's message, and warns when a query authorized by its role list gains a field-restricted column.

  **Explorer** (`@memberjunction/ng-core-entity-forms`, `@memberjunction/ng-query-viewer`, `@memberjunction/ng-dashboards`, `@memberjunction/ng-artifacts`, `@memberjunction/ng-code-editor`). The query form saves the query with its parameters, fields and entity links as one graph save; a refused save lists each finding with its rule code, line, column and fix, and marks it in the SQL editor (`<mj-code-editor>` gains `SetDiagnosticMarkers` and `RevealPosition`). The form shows the extraction status and message, and its field and parameter grids show how each row was detected, nullability and the source entity field (as a link) or server-reported object; facts are read-only and annotations editable. "Refresh metadata" in the form and in the Query Browser (the selected query, a category, or all) always runs a dry run first, shows live progress and a per-query report with change counts and a drill-in, then applies on request; a user setting skips the dry run for single-query refreshes. The save-query dialog, the data artifact's "update query" and the Query Browser editor show the server's findings instead of a generic failure; findings travel as text lines read with `ParseQuerySaveMessage` / `ParseQueryDiagnostics`.

  ### Improvements
  - **Shipped queries declare their metadata** (`metadata/queries`). Every shipped query declares its parameters and output fields, with field facts taken from the database server's description; primary keys reuse the IDs earlier releases gave the rows. `GetAgentRunTree` filters its parameters, the composition demo names its targets by full path, and 17 shipped queries gain PostgreSQL variants.
  - **External Change Detection queries take server-set values** (`@memberjunction/external-change-detection`). Every value is a server-set parameter, identifiers are quoted with `sqlIdentifier`, and `ChangeDetector` passes them as `ServerParameters`.
  - **Extraction reads the database, not the cache** (`@memberjunction/core-entities-server`). A query's stored child rows are read from the database on the save's transaction, so a dialect variant saved in the same push no longer overwrites them, and extraction uses the saving provider's platform.
  - **Materialized reads bind typed, named parameters** (`@memberjunction/generic-database-provider`), typed from the snapshot table's columns, so the database can use its indexes. Rows are unchanged.
  - **Paging and materialization edit the SQL as written** (`@memberjunction/generic-database-provider`, `@memberjunction/materialization`, `@memberjunction/codegen-lib`). Row caps, ORDER BY removal and CTE hoisting no longer regenerate the statement, so `CountSQL`, the persisted materialization `BroadSQL` and `StripTopLevelOrderBy` output keep the author's text; a `WITH`-headed source no longer lands inside a derived table, and a dependency's ORDER BY under TOP is kept.
  - **Engines coalesce remote reloads** (`@memberjunction/core`). When a burst of remote cache invalidations arrives without row data, a `BaseEngine` config reloads at most twice (one reload in flight plus one trailing reload) instead of once per event; invalidations that carry row data are still applied in place.
  - **Engines space out repeated reloads** (`@memberjunction/core`). When a stream of remote or peer changes keeps a `BaseEngine` config reloading, the next reload now starts at least `BaseEngine.ExternalChangeFollowUpDelayMs` (default 1 s) after the previous one ended, and every change that arrives meanwhile shares it. A steady stream costs about one reload per second instead of reloads back to back, each reading the whole table; the first reload after a quiet second still starts at once.
  - **The testing CLI starts engines the same way on PostgreSQL and SQL Server** (`@memberjunction/testing-cli`), so engines bind to the direct provider on both platforms.

  ### Bug fixes
  - **Query child rows past 1,000 are reconciled** (`@memberjunction/core-entities-server`, `@memberjunction/server`). Extraction, refresh, the CodeGen re-bind and the query resolvers read a query's stored rows without the entity's default row cap, so a query with more than 1,000 stale fields is cleaned up in one save and `mj query refresh --all` sees every query.
  - **`CreateQueryExtended` with `AutoResolveCollision` gives every concurrent request its own query** (#6007), and its existence checks read the database uncached. `CreateQueryExtended` / `UpdateQueryExtended` return every column of the child rows.
  - **Composed queries render correctly in cases that failed before**: doubled quotes in composed string arguments, `NaN` from untyped arithmetic, a query starting with `;`, and a caller's `null` reaching a composing query's template (`default(…)` now applies).
  - **Extraction fixes**: a refresh reports and writes a field whose nullability changed between unknown and known; an outer parameter read only by an arithmetic composition argument takes the number type of the parameter it feeds; describe renders give untyped and array parameters numeric samples; describing a statement with a leading or trailing `;` works on PostgreSQL; `MJQueryEntityServer` saved through a network provider leaves extraction to the server; doc-comment continuation lines lose their alignment spaces.
  - **Multiple row-level security filters are grouped in parentheses** (#4078) by `EntityInfo.GetUserRowLevelSecurityWhereClause`, so an `OR` between two filters no longer escapes the surrounding condition.
  - **The legacy extractors stop reporting phantom tables**: `ExtractTableRefs` / `Parse().Tables` no longer return CTE names, read nothing from comments or string literals, and no longer invent a `dbo` schema on PostgreSQL; `ExtractSelectColumns` / `ExtractColumnRefs` return results for SQL node-sql-parser rejects; `ExtractCTEs` returns each CTE's exact source text.

  ### Upgrade Notes

  **Run a query refresh after upgrading.** Two migrations apply on `mj migrate` (`Query_Extraction_Metadata` and `Query_Child_Detection_Methods`). After migrating, refresh every saved query so its fields, parameters, entities and extraction columns are established from its SQL and the database server:

  ```bash
  mj query refresh --all --dry-run   # review: writes nothing
  mj query refresh --all             # apply
  ```

  - The dry run lists each query as would-refresh or unchanged, with the field, parameter and entity rows it would add, update or remove, and its diagnostics. `--verbose` also lists unchanged queries; `--format json` gives a machine-readable report.
  - Expect most queries to show corrected field facts: exact types where a placeholder such as `decimal(18,2)` was stored, nullability, a linked source entity field, missing columns added, and columns collected from inside a CTE removed. Field descriptions and other authored values are kept.
  - The real run writes those rows and sets each query's `ExtractionStatus` (`OK`, `Warning`, `Error` or `Skipped`) and `ExtractionMessage`. It never changes a query's SQL. A dry run afterwards should report every query unchanged.
  - `mj query refresh` runs in process as the system user. A refresh started from Explorer or the `Query.RefreshExtraction` remote operation needs Update on `MJ: Queries`, Create/Update/Delete on `MJ: Query Fields`, `MJ: Query Parameters`, `MJ: Query Entities` and `MJ: Query Dependencies`, and read access to the entities the queries read; queries the caller may not refresh are reported as not permitted and left alone. The command exits non-zero when a query fails, or when a query named with `--id` or `--name` cannot be refreshed.
  - Client query caches miss once after the upgrade, because a query's definition signature now includes its field facts.

  **Saved queries with a template tag inside quotes stop running until they are fixed.** A saved query that writes a value tag inside a SQL string literal, such as `WHERE Region = '{{ Region }}'`, or inside a quoted identifier, such as `SELECT [{{ Col }}]` (`"{{ Col }}"` on PostgreSQL, backticks on MySQL and Databricks), is now refused on every run, not only when its SQL is saved: the value is pasted between the quotes without escaping, so a value containing the closing quote can change the statement. The refusal names the query, each tag's parameter, line and column, and the fix; a query with both kinds gets one message covering both. To find them, run `mj query refresh --all --dry-run`: they are listed as `Error` (`MJQ_TAG_IN_STRING_LITERAL` or `MJQ_TAG_IN_QUOTED_IDENTIFIER`). The fix is one line per tag. For a string literal, replace `'{{ Region }}'` with `{{ Region | sqlString }}` and drop the surrounding quotes (`sqlString` adds the quotes and escapes the value); use `sqlLikeContains` for `'%{{ x }}%'`, and `sqlNumber`, `sqlDate` or `sqlBoolean` when the value is not text. For a quoted identifier, replace `[{{ Col }}]` with `{{ Col | sqlIdentifier }}` and drop the brackets or quotes (`sqlIdentifier` quotes the name for the database and accepts only letters, digits and underscores). A caller who may not run the query still gets the not-found message.

  **Saved queries to review after the refresh.** These kinds of existing queries may report `Warning` or `Error`. Unless noted, they keep running as before, but a save that changes their SQL is refused until it is fixed; the message names the rule and the fix (`guides/MJ_QUERY_LANGUAGE.md` lists every rule, and which ones also stop a run).
  - A query that composes another query and relies on a same-named parameter flowing into it without passing it: `Warning` (`MJQ_COMPOSITION_IMPLICIT_ARGUMENT`), **and its results change** (see below).
  - A template tag inside a string literal (`'{{ x }}'`) or a quoted identifier (`[{{ x }}]`): **refused at run time** (see above).
  - A string, array or date value written into the SQL without an MJ SQL filter (`sqlString`, `sqlIn`, `sqlDate`, …), unless the parameter is server-set.
  - A composition reference whose category path is partial or wrong, or a composition outside a FROM / JOIN table position.
  - Two output columns with the same name (compared case-insensitively).
  - Arithmetic inside `{{ }}`, a non-literal `default(…)`, or a filter that does not match the parameter's type.
  - Template syntax outside the language: macros, includes, function calls, an unknown filter or `Context.*` token, member access other than `.length`, or a composition reference that names no existing query: **refused at run time**, because the template is checked before it is rendered. The dry run shows these as `Error`.
  - A query that writes, runs more than one statement, starts with `SET` / `DECLARE`, or calls a function the dialect forbids: **refused at run time** as well as at save.
  - A query whose SQL no longer runs against the current schema (a dropped or renamed column): `Error`, with the database server's message; its stored rows are kept.
  - A query against an external data source: `Skipped` (it is not described).

  **Behaviour changes.**
  - **Composition arguments must be listed explicitly.** A composed query only receives the arguments written in its reference, as in `{{query:"Path/Name(StartDate=StartDate)"}}`. An inner parameter that is not passed is absent (its `{% if %}` blocks are false), even when the outer query has a parameter of the same name. Before, same-named values could flow in by accident. A query that relied on that now returns the inner query's unfiltered rows; add the arguments to its reference. An unpassed _required_ parameter is an error, and a composed query's required parameters are now checked at run time.
  - **Composition lookup needs the category path.** The name-only fallback is gone. A new or edited query must give the full path; at run time an existing query whose partial path matches exactly one query still runs, and a warning is logged.
  - **New save-time refusals.** A new or edited query that breaks a rule of the MJ Query language, writes, or repeats an output column name is not saved: `Save()` fails, and `CreateQueryExtended` / `UpdateQueryExtended` return `Success: false` with each finding (rule code, line, column, fix). Agents and tools that create queries must handle the refusal. Existing queries keep running unless they use syntax outside the language (listed above); the refresh reports them.
  - **`.length` and the inline if are supported.** `{% if Codes and Codes.length > 0 %}` and `{{ X | sqlNumber if X else 12 }}` keep working; no other member access is allowed.
  - **Field-level security applies to queries.** A query is checked against the running user's field permissions on the rendered statement. When the query names a field the user may not read, the run is refused with the same message as a query that does not exist (`Query 'X' does not exist or you do not have permission to run it.`), so code that matched the old "Denied entities" text must change. A restricted field reached only through `SELECT *` or `alias.*` is dropped from that user's results instead of refusing the query, so result columns can differ per user. Queries authorized through Query Permissions (definer's rights) are unchanged. The Explorer grid builds its columns from the result, so a dropped column never appears.
  - **Extraction no longer overwrites what people wrote.** A parameter's authored type, required flag, default, sample and description are kept, and `DetectionMethod` is no longer forced to `AI`. Field facts (name, order, type, nullability, source, computed flag) follow the database server, and `SourceFieldName` is always the real entity field name, never the output alias. The LLM writes descriptions only, after the save commits, so descriptions are not yet present in the `CreateQueryExtended` result.
  - **`UsesTemplate` is a fact about the SQL.** A failed extraction no longer sets it to `false`, and a query with template syntax is rendered whatever the stored flag says.
  - **Rendering uses the request's dialect.** Template filters follow the provider that runs the query, not a process-wide platform, so one process can serve SQL Server and PostgreSQL providers.
  - **Composed SQL text differs.** `RenderedSQL`, `RenderResult.FinalSQL` and the paging `CountSQL` keep the same columns and rows but may differ in CTE names and whitespace, and a branch not taken emits no CTE. In `RenderResult.Trace`, `AfterComposition` and `AfterTemplates` both hold the assembled SQL, because templates are now rendered before composition. CodeGen may rewrite persisted `BroadSQL` text on its next run.
  - **The query form saves child rows with the query.** In Explorer, adding a parameter or field is saved when the query is saved, not immediately.
  - **Legacy extractor results change** as listed under Bug fixes: callers that subtracted CTE names keep working, code that expected them, or compared `SchemaName` with `'dbo'` to mean "unqualified", should be checked. `ExtractTemplateExpressions`, `ExtractCompositionRefs` and `ExtractParameterInfo` no longer report tags written inside SQL comments; `Tokenize` is unchanged.

  **Deprecations.** These keep working, unchanged, through 6.x and are removed no earlier than 7.0. Each JSDoc names its replacement.
  - `SQLParser` (`@memberjunction/sql-parser`), static and instance members: read SQL with `SqlDocument.Parse(sql, dialect)` (`TableReferences()`, `ColumnReferences()`, `OutputItems()`, `CTEs()`, `TopLevelOrderBy()`, `RowCaps()`, `StatementKinds()`, `HasStackedStatements()`), read templates with `QueryTemplate.Parse(sql, dialect)` (`Parameters()`, `CompositionReferences()`, its nodes), and change SQL with `EditSet` and the transforms (`StripOrderBy`, `SetRowCap`, `ReplaceSelectList`, `AppendTail`, `HoistCTEs`, `RenameCTE`, `WrapAsDerivedTable`). `Astify`, `ParseSQL`, `SqlifyAST`, `WalkAST` and the node-sql-parser AST stay for callers that walk that tree.
  - `SQLParser.HasWriteStatement` must not be used to decide whether SQL is safe to run (it returns false when it cannot parse). Use `IsReadOnlyQuery`, `SqlDocument.IsReadOnly()`, or `StrictFragmentValidator.ValidateReadOnlyStatement` for untrusted SQL.
  - `LexSQL`, `SignificantTokens`, `IsKeyword` → `SqlTokens.Lex(sql, dialect)`; `SplitLeadingCTEs` → `SqlDocument.CTEs()` or `HoistCTEs`; `AnalyzePagingShape` → `SqlDocument` analyses and the transforms; `AnalyzeTopLevelOrderBy`, `HasTopLevelOrderBy`, `ExtractOrderBy`, `FindOrderByStatement`, `IsOrderByLegalInCTE` → `SqlDocument.TopLevelOrderBy()` and `StripOrderBy`; `ParseToIR` / `RenderIR` → `QueryTemplate` and `EditSet`; `CheckAggregateExpression` → `StrictFragmentValidator.ValidateAggregateExpression`. `IsReadOnlyQuery` is not deprecated.
  - `SQLParserDialect` (`@memberjunction/sql-dialect`) → `ParserDialect` or a `QueryDialect`.
  - `RunQuerySQLFilterManager.SetPlatform` (`@memberjunction/core`): a render for a known provider passes its dialect instead.
  - `RunExtractionPipeline` (`@memberjunction/core-entities-server`): saves now extract with `ComputeQueryExtraction` and `WriteExtractedChildRows`.
  - `ClientClauseScreen.AstContainsWriteNode` → `StrictFragmentValidator.ValidateReadOnlyStatement`; `QueryPagingEngine.StripTopClause` → `SqlDocument.RowCaps()` and an `EditSet`; the `isPostgres` option of `buildMaterializedReadQuery` → pass the dialect (`@memberjunction/generic-database-provider`).

  **Security.** This release closes several ways a saved query, a query specification or caller-supplied SQL could get past the read-only check, and makes it fail closed: every query path now runs the same lexer-based check on the rendered statement, and writes and forbidden function calls are refused when a query is saved. Template values that were written into shipped queries without escaping are now filtered or server-set. Field-level security is enforced on query results, and the refresh service and the Explorer query views show nothing about fields or entities a user may not read. Deployments should upgrade; no configuration is needed beyond the refresh above.

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

- 38099f7: React test harness reports what it knows about a failure instead of collapsing it. Field-access violations carry a structured `Details` object with up to three existing fields that resemble the one the component read (`SimilarFields`, from the new `FindSimilarNames` helper) and the complete list of valid fields (`AvailableFields`). A component that fails to register is reported once per component, naming the component and the phase that failed, instead of as one JSON blob. Harness setup failures and unusable component roots get their own rules (`harness-setup-error`, `component-load-error`). A call to a utility the harness was not given (such as `utilities.ai` with no AI tools) is now a medium `sandbox-utility-unavailable` warning, not a critical error that blames the component.

  The linter now follows query and view rows to where generated components read them, so a misnamed field is reported in far more of the places it occurs. It follows rows through a `|| []` or `?? []` fallback, through React state set inside an effect (including `React.useMemo` / `React.useState`), through spread copies such as `[...rows].sort(...)`, and into lodash iteratees such as `_.sumBy(rows, r => ...)`. Variables are now resolved in the scope that reads them, so two callbacks that each name a parameter `row` no longer share a type; this removes false reports where one callback's row type was applied to another.

  "Invalid JSX element type" errors are graded by volume instead of discarded. A few occurrences stay a non-blocking `low` violation (a child component resolving a moment late); 25 or more of the same error is `high` and fails the run, where before a component could throw hundreds and still report success. The detector no longer flags `React.memo`, `forwardRef`, `lazy` or context components, which are valid element types. Text extraction in `AssertionHelpers` and category-path trimming no longer use regular expressions that slow down quadratically on adversarial input, and the unsafe-array-operations suggestion makes every bracket access optional (`data?.[0]?.[1]`), not only the first.

  The `type-mismatch-operation` and `type-compatibility` rules no longer report an array method called on a type that has it too: `Map#forEach`, `Set#forEach`, and `slice`, `concat`, `includes`, `indexOf`, `lastIndexOf` and `at` on strings. Both rules now share one list of array methods instead of two that had drifted apart.

- cfb3aab: A semantic validator can now opt in to checking a prop the parent does not pass, by overriding `EvaluatesAbsentProp` to return `true`. It is then also called for a missing prop, with `context.PropertyPresent === false` and `context.propertyValue === undefined`, except when the element spreads props. Validators that do not opt in behave as before and run only for passed props.
- fb7ac5d: Export the semantic-validator API from the package root: `SemanticValidator`, `SemanticValidatorRegistry`, and the types `ValidationContext`, `EntityMetadata`, `EntityFieldInfo`, `QueryMetadata`, `QueryParameter`, `DynamicValue` and `ExtractedValue`. Apps that register a custom constraint validator no longer need to deep-import compiled `dist/` paths.
- Updated dependencies [0d81c53]
- Updated dependencies [1419ba7]
- Updated dependencies [a709bb6]
- Updated dependencies [39b35f1]
- Updated dependencies [e97d95c]
- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [a50948e]
- Updated dependencies [2552b1e]
- Updated dependencies [25bb295]
- Updated dependencies [432cb73]
- Updated dependencies [3080e83]
- Updated dependencies [4c6a28b]
- Updated dependencies [c93c0f8]
- Updated dependencies [6c36fb6]
- Updated dependencies [0eeb89d]
- Updated dependencies [ecf36eb]
- Updated dependencies [cc36de5]
- Updated dependencies [9cb815b]
- Updated dependencies [709de1a]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [1d6e3e8]
- Updated dependencies [d2db108]
- Updated dependencies [dfe40a4]
- Updated dependencies [d43d86e]
- Updated dependencies [a3539d2]
- Updated dependencies [db39145]
- Updated dependencies [41274aa]
- Updated dependencies [91cba84]
- Updated dependencies [b14c72f]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [c671f85]
- Updated dependencies [49f26d9]
- Updated dependencies [5e4205c]
- Updated dependencies [7be1684]
- Updated dependencies [21f9e15]
- Updated dependencies [1090caa]
- Updated dependencies [c8c48e1]
- Updated dependencies [f2248d5]
- Updated dependencies [81aea34]
- Updated dependencies [7384dd6]
- Updated dependencies [6849b00]
- Updated dependencies [67f6c85]
- Updated dependencies [ac9b00b]
- Updated dependencies [eb3a8d3]
- Updated dependencies [5465489]
- Updated dependencies [3bace5a]
- Updated dependencies [88e6902]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [e1fd4c1]
- Updated dependencies [4248fb3]
- Updated dependencies [e1dd673]
- Updated dependencies [d29b5c2]
- Updated dependencies [59e32e0]
- Updated dependencies [d122a41]
- Updated dependencies [0a7c255]
- Updated dependencies [0adaf76]
- Updated dependencies [0ff7523]
- Updated dependencies [d86bcbc]
- Updated dependencies [307da67]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [d6b39c4]
- Updated dependencies [5f0baf7]
- Updated dependencies [f65fec7]
- Updated dependencies [ef43cf3]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [cb205de]
- Updated dependencies [b44c7cf]
- Updated dependencies [0c634ba]
- Updated dependencies [a6f8c1c]
- Updated dependencies [56d7614]
- Updated dependencies [223669e]
- Updated dependencies [683f652]
- Updated dependencies [914e6ff]
- Updated dependencies [a8be410]
- Updated dependencies [7316ac3]
- Updated dependencies [2274f42]
- Updated dependencies [9ce7cf4]
- Updated dependencies [0fb3649]
- Updated dependencies [131f3c4]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [705ab4e]
- Updated dependencies [a7da50b]
- Updated dependencies [0f04590]
- Updated dependencies [5fed75a]
- Updated dependencies [4c0eaec]
- Updated dependencies [1cb1d52]
- Updated dependencies [f26084f]
- Updated dependencies [db39145]
- Updated dependencies [f48dffc]
- Updated dependencies [41c2c08]
- Updated dependencies [630bb88]
- Updated dependencies [e69634e]
- Updated dependencies [9160fd9]
- Updated dependencies [6779eed]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [29b6ec3]
- Updated dependencies [44faf83]
- Updated dependencies [17cc774]
- Updated dependencies [dae1d31]
- Updated dependencies [bfd67c6]
- Updated dependencies [80905a1]
- Updated dependencies [4c97994]
- Updated dependencies [397ae9a]
- Updated dependencies [08b3d7b]
- Updated dependencies [20650af]
- Updated dependencies [7e72c86]
- Updated dependencies [a17a228]
- Updated dependencies [6b08ebf]
- Updated dependencies [5fed75a]
- Updated dependencies [ee1f0d9]
- Updated dependencies [ce758af]
- Updated dependencies [89a5b59]
- Updated dependencies [1ea4085]
- Updated dependencies [aee2d53]
- Updated dependencies [8420f36]
- Updated dependencies [4ef13d6]
- Updated dependencies [25f7b82]
- Updated dependencies [8b90b41]
- Updated dependencies [104125c]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [d296edd]
- Updated dependencies [66fd011]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [509d2aa]
- Updated dependencies [68f5c01]
- Updated dependencies [196160a]
- Updated dependencies [5513c2a]
- Updated dependencies [90829e3]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [8c120db]
- Updated dependencies [9a2d7cc]
- Updated dependencies [3ab85f9]
- Updated dependencies [aac148b]
- Updated dependencies [17a4137]
- Updated dependencies [e1942c7]
- Updated dependencies [b4afc13]
- Updated dependencies [c7d1170]
- Updated dependencies [79d4f27]
- Updated dependencies [36a3f9e]
- Updated dependencies [539dfe3]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [60bd774]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [ac18db8]
- Updated dependencies [35da130]
- Updated dependencies [5b41d48]
- Updated dependencies [bd83dec]
- Updated dependencies [81c5f3f]
- Updated dependencies [c4a4eb9]
- Updated dependencies [28395e0]
- Updated dependencies [4b9542c]
- Updated dependencies [28c92e0]
- Updated dependencies [5f707d1]
- Updated dependencies [369e229]
- Updated dependencies [ba00ac7]
- Updated dependencies [8a5d2c0]
- Updated dependencies [d13cf6b]
- Updated dependencies [aca4317]
- Updated dependencies [d52f9ba]
- Updated dependencies [ec97ad4]
- Updated dependencies [0e5a4cd]
- Updated dependencies [d1b1958]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [718b01c]
- Updated dependencies [57fea6a]
- Updated dependencies [374b1a4]
- Updated dependencies [2c590b0]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [2854a2e]
- Updated dependencies [b0b2cc9]
- Updated dependencies [dc38250]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0
  - @memberjunction/global@6.2.0
  - @memberjunction/core@6.2.0
  - @memberjunction/sql-dialect@6.2.0
  - @memberjunction/interactive-component-types@6.2.0
  - @memberjunction/react-runtime@6.2.0
  - @memberjunction/sql-parser@6.2.0

## 6.2.0-edge.8

### Patch Changes

- Updated dependencies [6c36fb6]
- Updated dependencies [9cb815b]
- Updated dependencies [d2db108]
- Updated dependencies [c671f85]
- Updated dependencies [6849b00]
- Updated dependencies [59e32e0]
- Updated dependencies [5f0baf7]
- Updated dependencies [a6f8c1c]
- Updated dependencies [56d7614]
- Updated dependencies [9ce7cf4]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [e69634e]
- Updated dependencies [539dfe3]
- Updated dependencies [ac18db8]
  - @memberjunction/core@6.2.0-edge.8
  - @memberjunction/core-entities@6.2.0-edge.8
  - @memberjunction/global@6.2.0-edge.8
  - @memberjunction/interactive-component-types@6.2.0-edge.8
  - @memberjunction/react-runtime@6.2.0-edge.8
  - @memberjunction/sql-dialect@6.2.0-edge.8
  - @memberjunction/sql-parser@6.2.0-edge.8

## 6.2.0-edge.7

### Minor Changes

- 4b9542c: SQL pipeline redesign. Stored queries are now written in a specified language, the MJ Query language (`guides/MJ_QUERY_LANGUAGE.md`), which is checked when a query is saved and before every render. Queries are rendered, then composed, behind a lexer-based safety gate, with per-request dialects, paging, materialized reads and field-level security applied to the rendered statement. A query's fields, parameters and entities now come from the database server's description of the query and from MJ's template parser, and any saved query can be refreshed on demand with `mj query refresh`, the `Query.RefreshExtraction` remote operation, or "Refresh metadata" in Explorer.

  ### New features

  **SQL parsing and dialects** (`@memberjunction/sql-parser`, `@memberjunction/sql-dialect`). SQL dialects are split into facets, and query-only dialects cover external data sources. `@memberjunction/sql-parser` gains a dialect-aware lexer (`SqlTokens`), `QueryTemplate` (the MJ Query language parser and save-time checks), the tolerant structural parser `SqlDocument` with its analyses, `EditSet` transforms that edit the SQL as written instead of regenerating it, and `StrictFragmentValidator`, the fail-closed screen for caller-supplied SQL fragments. The language includes `<name>.length` (`{% if Codes and Codes.length > 0 %}`) and the inline if (`{{ MaxRows | sqlNumber if MaxRows else 12 }}`), which many stored queries use; any other attribute access is refused.

  **Query metadata in the schema** (`@memberjunction/core-entities`). The schema records what the database server reports about a query's output: `QueryField` gains `SourceEntityFieldID` (linked to the entity field, cleared when that field is deleted), `IsNullable` and `SourceObjectName`, and `DetectionMethod` allows `Database` and `Parser`; `Query` gains `ExtractedSQLHash`, `ExtractionStatus` (`OK`, `Warning`, `Error`, `Skipped`) and `ExtractionMessage`. `MJ: Queries` declares `Parameters`, `Fields` and `Entities` collections, so a query and the child rows it declares save as one graph, and declared rows win over extraction for the same name. Query field nullability and source entity field are part of a query's definition signature.

  **Metadata sync** (`@memberjunction/metadata-sync`). `mj sync push` saves `relatedEntities` groups through a parent's declared collection, in the parent's graph save, and `mj sync pull` writes new records in the `collections` format. The `relatedEntities` file format keeps working.

  **Extraction on save** (`@memberjunction/core-entities-server`, `@memberjunction/server`). Saving a new or edited query extracts its metadata from the database server's description of the query (the base render and one render per `{% if %}` branch) and from MJ's template parser: output fields with exact types, nullability and their source entity field, parameters with composition pass-throughs, the entities it reads (`DetectionMethod` `Parser` on parameters and entity links), and its dependencies. Facts are corrected on every row; authored annotations (descriptions, a `Manual` parameter's type, default, sample and filters) are kept. Doc comments (`{# @param / @field #}`, trailing `--:`) count as authored, and an authored parameter the SQL no longer uses is kept and flagged. `UsesTemplate` comes from the lexer, and `ExtractedSQLHash`, `ExtractionStatus` and `ExtractionMessage` record each run: external-data-source queries are `Skipped`, and a describe failure is an `Error` that keeps the stored rows. The derived rows are written as the system user, and the LLM only fills empty descriptions after the save commits (skipped with `SkipEntityAIActions`). `MJQueryEntityServer.ExtractionOverride` (`Auto` / `Skip` / `Force`) controls extraction per save, and `SkipEmbeddings` is honoured. A query that reads a table named by a template parameter (the External Change Detection queries) keeps its declared fields instead of describing a sample table.

  **Refresh without changing SQL** (`@memberjunction/core-entities-server`, `@memberjunction/cli`, `@memberjunction/codegen-lib`). `QueryExtractionService` (`RefreshQuery`, `RefreshQueries` by ID, name or full path, category path, entity read, or all) runs the same extraction a save runs: one transaction per query, the queries a composition depends on first, a dry run that reports the changes without writing, and an optional LLM description pass. Each query gets a report: its outcome, the child rows added, updated and removed, flagged parameters and the run's diagnostics. The entry points are the `Query.RefreshExtraction` remote operation (long-running with progress; API keys need the new `query:refresh` scope), `mj query refresh [--id|--name|--category|--entity|--all] [--dry-run] [--with-ai] [--format text|json]`, and a CodeGen pass that re-binds the queries reading an entity whose fields were added, dropped or changed type. That pass records a query the change broke as an `Error` with the server's message, and warns when a query authorized by its role list gains a field-restricted column.

  **Explorer** (`@memberjunction/ng-core-entity-forms`, `@memberjunction/ng-query-viewer`, `@memberjunction/ng-dashboards`, `@memberjunction/ng-artifacts`, `@memberjunction/ng-code-editor`). The query form saves the query with its parameters, fields and entity links as one graph save; a refused save lists each finding with its rule code, line, column and fix, and marks it in the SQL editor (`<mj-code-editor>` gains `SetDiagnosticMarkers` and `RevealPosition`). The form shows the extraction status and message, and its field and parameter grids show how each row was detected, nullability and the source entity field (as a link) or server-reported object; facts are read-only and annotations editable. "Refresh metadata" in the form and in the Query Browser (the selected query, a category, or all) always runs a dry run first, shows live progress and a per-query report with change counts and a drill-in, then applies on request; a user setting skips the dry run for single-query refreshes. The save-query dialog, the data artifact's "update query" and the Query Browser editor show the server's findings instead of a generic failure; findings travel as text lines read with `ParseQuerySaveMessage` / `ParseQueryDiagnostics`.

  ### Improvements
  - **Shipped queries declare their metadata** (`metadata/queries`). Every shipped query declares its parameters and output fields, with field facts taken from the database server's description; primary keys reuse the IDs earlier releases gave the rows. `GetAgentRunTree` filters its parameters, the composition demo names its targets by full path, and 17 shipped queries gain PostgreSQL variants.
  - **External Change Detection queries take server-set values** (`@memberjunction/external-change-detection`). Every value is a server-set parameter, identifiers are quoted with `sqlIdentifier`, and `ChangeDetector` passes them as `ServerParameters`.
  - **Extraction reads the database, not the cache** (`@memberjunction/core-entities-server`). A query's stored child rows are read from the database on the save's transaction, so a dialect variant saved in the same push no longer overwrites them, and extraction uses the saving provider's platform.
  - **Materialized reads bind typed, named parameters** (`@memberjunction/generic-database-provider`), typed from the snapshot table's columns, so the database can use its indexes. Rows are unchanged.
  - **Paging and materialization edit the SQL as written** (`@memberjunction/generic-database-provider`, `@memberjunction/materialization`, `@memberjunction/codegen-lib`). Row caps, ORDER BY removal and CTE hoisting no longer regenerate the statement, so `CountSQL`, the persisted materialization `BroadSQL` and `StripTopLevelOrderBy` output keep the author's text; a `WITH`-headed source no longer lands inside a derived table, and a dependency's ORDER BY under TOP is kept.
  - **Engines coalesce remote reloads** (`@memberjunction/core`). When a burst of remote cache invalidations arrives without row data, a `BaseEngine` config reloads at most twice (one reload in flight plus one trailing reload) instead of once per event; invalidations that carry row data are still applied in place.
  - **Engines space out repeated reloads** (`@memberjunction/core`). When a stream of remote or peer changes keeps a `BaseEngine` config reloading, the next reload now starts at least `BaseEngine.ExternalChangeFollowUpDelayMs` (default 1 s) after the previous one ended, and every change that arrives meanwhile shares it. A steady stream costs about one reload per second instead of reloads back to back, each reading the whole table; the first reload after a quiet second still starts at once.
  - **The testing CLI starts engines the same way on PostgreSQL and SQL Server** (`@memberjunction/testing-cli`), so engines bind to the direct provider on both platforms.

  ### Bug fixes
  - **Query child rows past 1,000 are reconciled** (`@memberjunction/core-entities-server`, `@memberjunction/server`). Extraction, refresh, the CodeGen re-bind and the query resolvers read a query's stored rows without the entity's default row cap, so a query with more than 1,000 stale fields is cleaned up in one save and `mj query refresh --all` sees every query.
  - **`CreateQueryExtended` with `AutoResolveCollision` gives every concurrent request its own query** (#6007), and its existence checks read the database uncached. `CreateQueryExtended` / `UpdateQueryExtended` return every column of the child rows.
  - **Composed queries render correctly in cases that failed before**: doubled quotes in composed string arguments, `NaN` from untyped arithmetic, a query starting with `;`, and a caller's `null` reaching a composing query's template (`default(…)` now applies).
  - **Extraction fixes**: a refresh reports and writes a field whose nullability changed between unknown and known; an outer parameter read only by an arithmetic composition argument takes the number type of the parameter it feeds; describe renders give untyped and array parameters numeric samples; describing a statement with a leading or trailing `;` works on PostgreSQL; `MJQueryEntityServer` saved through a network provider leaves extraction to the server; doc-comment continuation lines lose their alignment spaces.
  - **Multiple row-level security filters are grouped in parentheses** (#4078) by `EntityInfo.GetUserRowLevelSecurityWhereClause`, so an `OR` between two filters no longer escapes the surrounding condition.
  - **The legacy extractors stop reporting phantom tables**: `ExtractTableRefs` / `Parse().Tables` no longer return CTE names, read nothing from comments or string literals, and no longer invent a `dbo` schema on PostgreSQL; `ExtractSelectColumns` / `ExtractColumnRefs` return results for SQL node-sql-parser rejects; `ExtractCTEs` returns each CTE's exact source text.

  ### Upgrade Notes

  **Run a query refresh after upgrading.** Two migrations apply on `mj migrate` (`Query_Extraction_Metadata` and `Query_Child_Detection_Methods`). After migrating, refresh every saved query so its fields, parameters, entities and extraction columns are established from its SQL and the database server:

  ```bash
  mj query refresh --all --dry-run   # review: writes nothing
  mj query refresh --all             # apply
  ```

  - The dry run lists each query as would-refresh or unchanged, with the field, parameter and entity rows it would add, update or remove, and its diagnostics. `--verbose` also lists unchanged queries; `--format json` gives a machine-readable report.
  - Expect most queries to show corrected field facts: exact types where a placeholder such as `decimal(18,2)` was stored, nullability, a linked source entity field, missing columns added, and columns collected from inside a CTE removed. Field descriptions and other authored values are kept.
  - The real run writes those rows and sets each query's `ExtractionStatus` (`OK`, `Warning`, `Error` or `Skipped`) and `ExtractionMessage`. It never changes a query's SQL. A dry run afterwards should report every query unchanged.
  - `mj query refresh` runs in process as the system user. A refresh started from Explorer or the `Query.RefreshExtraction` remote operation needs Update on `MJ: Queries`, Create/Update/Delete on `MJ: Query Fields`, `MJ: Query Parameters`, `MJ: Query Entities` and `MJ: Query Dependencies`, and read access to the entities the queries read; queries the caller may not refresh are reported as not permitted and left alone. The command exits non-zero when a query fails, or when a query named with `--id` or `--name` cannot be refreshed.
  - Client query caches miss once after the upgrade, because a query's definition signature now includes its field facts.

  **Saved queries with a template tag inside quotes stop running until they are fixed.** A saved query that writes a value tag inside a SQL string literal, such as `WHERE Region = '{{ Region }}'`, or inside a quoted identifier, such as `SELECT [{{ Col }}]` (`"{{ Col }}"` on PostgreSQL, backticks on MySQL and Databricks), is now refused on every run, not only when its SQL is saved: the value is pasted between the quotes without escaping, so a value containing the closing quote can change the statement. The refusal names the query, each tag's parameter, line and column, and the fix; a query with both kinds gets one message covering both. To find them, run `mj query refresh --all --dry-run`: they are listed as `Error` (`MJQ_TAG_IN_STRING_LITERAL` or `MJQ_TAG_IN_QUOTED_IDENTIFIER`). The fix is one line per tag. For a string literal, replace `'{{ Region }}'` with `{{ Region | sqlString }}` and drop the surrounding quotes (`sqlString` adds the quotes and escapes the value); use `sqlLikeContains` for `'%{{ x }}%'`, and `sqlNumber`, `sqlDate` or `sqlBoolean` when the value is not text. For a quoted identifier, replace `[{{ Col }}]` with `{{ Col | sqlIdentifier }}` and drop the brackets or quotes (`sqlIdentifier` quotes the name for the database and accepts only letters, digits and underscores). A caller who may not run the query still gets the not-found message.

  **Saved queries to review after the refresh.** These kinds of existing queries may report `Warning` or `Error`. Unless noted, they keep running as before, but a save that changes their SQL is refused until it is fixed; the message names the rule and the fix (`guides/MJ_QUERY_LANGUAGE.md` lists every rule, and which ones also stop a run).
  - A query that composes another query and relies on a same-named parameter flowing into it without passing it: `Warning` (`MJQ_COMPOSITION_IMPLICIT_ARGUMENT`), **and its results change** (see below).
  - A template tag inside a string literal (`'{{ x }}'`) or a quoted identifier (`[{{ x }}]`): **refused at run time** (see above).
  - A string, array or date value written into the SQL without an MJ SQL filter (`sqlString`, `sqlIn`, `sqlDate`, …), unless the parameter is server-set.
  - A composition reference whose category path is partial or wrong, or a composition outside a FROM / JOIN table position.
  - Two output columns with the same name (compared case-insensitively).
  - Arithmetic inside `{{ }}`, a non-literal `default(…)`, or a filter that does not match the parameter's type.
  - Template syntax outside the language: macros, includes, function calls, an unknown filter or `Context.*` token, member access other than `.length`, or a composition reference that names no existing query: **refused at run time**, because the template is checked before it is rendered. The dry run shows these as `Error`.
  - A query that writes, runs more than one statement, starts with `SET` / `DECLARE`, or calls a function the dialect forbids: **refused at run time** as well as at save.
  - A query whose SQL no longer runs against the current schema (a dropped or renamed column): `Error`, with the database server's message; its stored rows are kept.
  - A query against an external data source: `Skipped` (it is not described).

  **Behaviour changes.**
  - **Composition arguments must be listed explicitly.** A composed query only receives the arguments written in its reference, as in `{{query:"Path/Name(StartDate=StartDate)"}}`. An inner parameter that is not passed is absent (its `{% if %}` blocks are false), even when the outer query has a parameter of the same name. Before, same-named values could flow in by accident. A query that relied on that now returns the inner query's unfiltered rows; add the arguments to its reference. An unpassed _required_ parameter is an error, and a composed query's required parameters are now checked at run time.
  - **Composition lookup needs the category path.** The name-only fallback is gone. A new or edited query must give the full path; at run time an existing query whose partial path matches exactly one query still runs, and a warning is logged.
  - **New save-time refusals.** A new or edited query that breaks a rule of the MJ Query language, writes, or repeats an output column name is not saved: `Save()` fails, and `CreateQueryExtended` / `UpdateQueryExtended` return `Success: false` with each finding (rule code, line, column, fix). Agents and tools that create queries must handle the refusal. Existing queries keep running unless they use syntax outside the language (listed above); the refresh reports them.
  - **`.length` and the inline if are supported.** `{% if Codes and Codes.length > 0 %}` and `{{ X | sqlNumber if X else 12 }}` keep working; no other member access is allowed.
  - **Field-level security applies to queries.** A query is checked against the running user's field permissions on the rendered statement. When the query names a field the user may not read, the run is refused with the same message as a query that does not exist (`Query 'X' does not exist or you do not have permission to run it.`), so code that matched the old "Denied entities" text must change. A restricted field reached only through `SELECT *` or `alias.*` is dropped from that user's results instead of refusing the query, so result columns can differ per user. Queries authorized through Query Permissions (definer's rights) are unchanged. The Explorer grid builds its columns from the result, so a dropped column never appears.
  - **Extraction no longer overwrites what people wrote.** A parameter's authored type, required flag, default, sample and description are kept, and `DetectionMethod` is no longer forced to `AI`. Field facts (name, order, type, nullability, source, computed flag) follow the database server, and `SourceFieldName` is always the real entity field name, never the output alias. The LLM writes descriptions only, after the save commits, so descriptions are not yet present in the `CreateQueryExtended` result.
  - **`UsesTemplate` is a fact about the SQL.** A failed extraction no longer sets it to `false`, and a query with template syntax is rendered whatever the stored flag says.
  - **Rendering uses the request's dialect.** Template filters follow the provider that runs the query, not a process-wide platform, so one process can serve SQL Server and PostgreSQL providers.
  - **Composed SQL text differs.** `RenderedSQL`, `RenderResult.FinalSQL` and the paging `CountSQL` keep the same columns and rows but may differ in CTE names and whitespace, and a branch not taken emits no CTE. In `RenderResult.Trace`, `AfterComposition` and `AfterTemplates` both hold the assembled SQL, because templates are now rendered before composition. CodeGen may rewrite persisted `BroadSQL` text on its next run.
  - **The query form saves child rows with the query.** In Explorer, adding a parameter or field is saved when the query is saved, not immediately.
  - **Legacy extractor results change** as listed under Bug fixes: callers that subtracted CTE names keep working, code that expected them, or compared `SchemaName` with `'dbo'` to mean "unqualified", should be checked. `ExtractTemplateExpressions`, `ExtractCompositionRefs` and `ExtractParameterInfo` no longer report tags written inside SQL comments; `Tokenize` is unchanged.

  **Deprecations.** These keep working, unchanged, through 6.x and are removed no earlier than 7.0. Each JSDoc names its replacement.
  - `SQLParser` (`@memberjunction/sql-parser`), static and instance members: read SQL with `SqlDocument.Parse(sql, dialect)` (`TableReferences()`, `ColumnReferences()`, `OutputItems()`, `CTEs()`, `TopLevelOrderBy()`, `RowCaps()`, `StatementKinds()`, `HasStackedStatements()`), read templates with `QueryTemplate.Parse(sql, dialect)` (`Parameters()`, `CompositionReferences()`, its nodes), and change SQL with `EditSet` and the transforms (`StripOrderBy`, `SetRowCap`, `ReplaceSelectList`, `AppendTail`, `HoistCTEs`, `RenameCTE`, `WrapAsDerivedTable`). `Astify`, `ParseSQL`, `SqlifyAST`, `WalkAST` and the node-sql-parser AST stay for callers that walk that tree.
  - `SQLParser.HasWriteStatement` must not be used to decide whether SQL is safe to run (it returns false when it cannot parse). Use `IsReadOnlyQuery`, `SqlDocument.IsReadOnly()`, or `StrictFragmentValidator.ValidateReadOnlyStatement` for untrusted SQL.
  - `LexSQL`, `SignificantTokens`, `IsKeyword` → `SqlTokens.Lex(sql, dialect)`; `SplitLeadingCTEs` → `SqlDocument.CTEs()` or `HoistCTEs`; `AnalyzePagingShape` → `SqlDocument` analyses and the transforms; `AnalyzeTopLevelOrderBy`, `HasTopLevelOrderBy`, `ExtractOrderBy`, `FindOrderByStatement`, `IsOrderByLegalInCTE` → `SqlDocument.TopLevelOrderBy()` and `StripOrderBy`; `ParseToIR` / `RenderIR` → `QueryTemplate` and `EditSet`; `CheckAggregateExpression` → `StrictFragmentValidator.ValidateAggregateExpression`. `IsReadOnlyQuery` is not deprecated.
  - `SQLParserDialect` (`@memberjunction/sql-dialect`) → `ParserDialect` or a `QueryDialect`.
  - `RunQuerySQLFilterManager.SetPlatform` (`@memberjunction/core`): a render for a known provider passes its dialect instead.
  - `RunExtractionPipeline` (`@memberjunction/core-entities-server`): saves now extract with `ComputeQueryExtraction` and `WriteExtractedChildRows`.
  - `ClientClauseScreen.AstContainsWriteNode` → `StrictFragmentValidator.ValidateReadOnlyStatement`; `QueryPagingEngine.StripTopClause` → `SqlDocument.RowCaps()` and an `EditSet`; the `isPostgres` option of `buildMaterializedReadQuery` → pass the dialect (`@memberjunction/generic-database-provider`).

  **Security.** This release closes several ways a saved query, a query specification or caller-supplied SQL could get past the read-only check, and makes it fail closed: every query path now runs the same lexer-based check on the rendered statement, and writes and forbidden function calls are refused when a query is saved. Template values that were written into shipped queries without escaping are now filtered or server-set. Field-level security is enforced on query results, and the refresh service and the Explorer query views show nothing about fields or entities a user may not read. Deployments should upgrade; no configuration is needed beyond the refresh above.

### Patch Changes

- 38099f7: React test harness reports what it knows about a failure instead of collapsing it. Field-access violations carry a structured `Details` object with up to three existing fields that resemble the one the component read (`SimilarFields`, from the new `FindSimilarNames` helper) and the complete list of valid fields (`AvailableFields`). A component that fails to register is reported once per component, naming the component and the phase that failed, instead of as one JSON blob. Harness setup failures and unusable component roots get their own rules (`harness-setup-error`, `component-load-error`). A call to a utility the harness was not given (such as `utilities.ai` with no AI tools) is now a medium `sandbox-utility-unavailable` warning, not a critical error that blames the component.

  The linter now follows query and view rows to where generated components read them, so a misnamed field is reported in far more of the places it occurs. It follows rows through a `|| []` or `?? []` fallback, through React state set inside an effect (including `React.useMemo` / `React.useState`), through spread copies such as `[...rows].sort(...)`, and into lodash iteratees such as `_.sumBy(rows, r => ...)`. Variables are now resolved in the scope that reads them, so two callbacks that each name a parameter `row` no longer share a type; this removes false reports where one callback's row type was applied to another.

  "Invalid JSX element type" errors are graded by volume instead of discarded. A few occurrences stay a non-blocking `low` violation (a child component resolving a moment late); 25 or more of the same error is `high` and fails the run, where before a component could throw hundreds and still report success. The detector no longer flags `React.memo`, `forwardRef`, `lazy` or context components, which are valid element types. Text extraction in `AssertionHelpers` and category-path trimming no longer use regular expressions that slow down quadratically on adversarial input, and the unsafe-array-operations suggestion makes every bracket access optional (`data?.[0]?.[1]`), not only the first.

  The `type-mismatch-operation` and `type-compatibility` rules no longer report an array method called on a type that has it too: `Map#forEach`, `Set#forEach`, and `slice`, `concat`, `includes`, `indexOf`, `lastIndexOf` and `at` on strings. Both rules now share one list of array methods instead of two that had drifted apart.

- Updated dependencies [1419ba7]
- Updated dependencies [c93c0f8]
- Updated dependencies [ecf36eb]
- Updated dependencies [91cba84]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [c8c48e1]
- Updated dependencies [3bace5a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [d6b39c4]
- Updated dependencies [f65fec7]
- Updated dependencies [0fb3649]
- Updated dependencies [4c0eaec]
- Updated dependencies [6779eed]
- Updated dependencies [397ae9a]
- Updated dependencies [89a5b59]
- Updated dependencies [4ef13d6]
- Updated dependencies [8b90b41]
- Updated dependencies [509d2aa]
- Updated dependencies [9a2d7cc]
- Updated dependencies [36a3f9e]
- Updated dependencies [bd83dec]
- Updated dependencies [81c5f3f]
- Updated dependencies [c4a4eb9]
- Updated dependencies [28395e0]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [aca4317]
- Updated dependencies [b0b2cc9]
  - @memberjunction/global@6.2.0-edge.7
  - @memberjunction/core-entities@6.2.0-edge.7
  - @memberjunction/core@6.2.0-edge.7
  - @memberjunction/interactive-component-types@6.2.0-edge.7
  - @memberjunction/react-runtime@6.2.0-edge.7
  - @memberjunction/sql-parser@6.2.0-edge.7
  - @memberjunction/sql-dialect@6.2.0-edge.7

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [0ff7523]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [dae1d31]
- Updated dependencies [4c97994]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [68f5c01]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/sql-dialect@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/react-runtime@6.2.0-edge.6
  - @memberjunction/interactive-component-types@6.2.0-edge.6
  - @memberjunction/sql-parser@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- cfb3aab: A semantic validator can now opt in to checking a prop the parent does not pass, by overriding `EvaluatesAbsentProp` to return `true`. It is then also called for a missing prop, with `context.PropertyPresent === false` and `context.propertyValue === undefined`, except when the element spreads props. Validators that do not opt in behave as before and run only for passed props.
- fb7ac5d: Export the semantic-validator API from the package root: `SemanticValidator`, `SemanticValidatorRegistry`, and the types `ValidationContext`, `EntityMetadata`, `EntityFieldInfo`, `QueryMetadata`, `QueryParameter`, `DynamicValue` and `ExtractedValue`. Apps that register a custom constraint validator no longer need to deep-import compiled `dist/` paths.
- Updated dependencies [0d81c53]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [db39145]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [5465489]
- Updated dependencies [d29b5c2]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [2274f42]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [7e72c86]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [8420f36]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [c7d1170]
- Updated dependencies [79d4f27]
- Updated dependencies [5f707d1]
- Updated dependencies [d1b1958]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/sql-parser@6.2.0-edge.5
  - @memberjunction/sql-dialect@6.2.0-edge.5
  - @memberjunction/react-runtime@6.2.0-edge.5
  - @memberjunction/interactive-component-types@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- Updated dependencies [a709bb6]
- Updated dependencies [432cb73]
- Updated dependencies [1d6e3e8]
- Updated dependencies [49f26d9]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [7316ac3]
- Updated dependencies [08b3d7b]
- Updated dependencies [20650af]
- Updated dependencies [1ea4085]
- Updated dependencies [aee2d53]
- Updated dependencies [25f7b82]
- Updated dependencies [90829e3]
- Updated dependencies [aac148b]
- Updated dependencies [e1942c7]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/sql-dialect@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/sql-parser@6.2.0-edge.4
  - @memberjunction/react-runtime@6.2.0-edge.4
  - @memberjunction/interactive-component-types@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [ec97ad4]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/interactive-component-types@6.2.0-edge.3
  - @memberjunction/sql-dialect@6.2.0-edge.3
  - @memberjunction/sql-parser@6.2.0-edge.3
  - @memberjunction/react-runtime@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [2552b1e]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [0adaf76]
- Updated dependencies [ef43cf3]
- Updated dependencies [b44c7cf]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/interactive-component-types@6.2.0-edge.2
  - @memberjunction/react-runtime@6.2.0-edge.2
  - @memberjunction/sql-dialect@6.2.0-edge.2
  - @memberjunction/sql-parser@6.2.0-edge.2

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

- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [307da67]
- Updated dependencies [a7da50b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/interactive-component-types@6.2.0-edge.1
  - @memberjunction/react-runtime@6.2.0-edge.1
  - @memberjunction/sql-dialect@6.2.0-edge.1
  - @memberjunction/sql-parser@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [9160fd9]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [2c590b0]
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/react-runtime@6.2.0-edge.0
  - @memberjunction/sql-parser@6.2.0-edge.0
  - @memberjunction/interactive-component-types@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0
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

- 8d0d45a: build: declare dependencies that npm's hoisting was silently supplying, as part of the monorepo's cutover to pnpm.

  Under npm, a package could import a module it never declared and still resolve it, because npm flattens everything into the workspace-root `node_modules`. pnpm's strict, isolated linking gives a package only what it declares — so each of these was a latent bug that happened to work. They are fixed here independently of the package manager; nothing about the published API changes.

  Added declarations: `@types/mssql` (codegen-lib, sqlserver-dataprovider, testing-cli, testing-integration, react-test-harness), `@types/pg` (codegen-lib), `@types/express` (messaging-adapters, server-extensions-core), `@types/fs-extra` (codegen-lib), `@types/babel__traverse` (react-linter), `ora` (ai-cli), `glob` (react-test-harness), `tslib` (ng-bootstrap, which compiles with `importHelpers`), `@auth0/auth0-spa-js` (ng-auth-services), `@memberjunction/core-entities` + `@memberjunction/global` + `@memberjunction/aiengine` (cli), and `@memberjunction/ng-react` (ng-explorer-core, reached from a generated file).

  Two changes are more than a declaration:
  - **`@memberjunction/server`**: `@types/express` moves `^4.17.25` → `^5.0.6`. The package declares `express@^5.2.1` at runtime, so it was only compiling because hoisting supplied the v5 types that six sibling packages declare. The types now match the express it actually runs.
  - **`@memberjunction/ng-auth-services`**: `angularProviderFactory` gains an explicit `Provider[]` return type. Declaring `@auth0/auth0-spa-js` alone does not resolve TS2742 — the emitted declaration file still needed a nameable type rather than one inferred through a transitive package path.

  (A third change in this set applied to `@memberjunction/scheduled-actions-server` — dropping `@types/axios`, a deprecated stub carrying no type definitions. That package has since been removed from the workspace, so its entry is no longer part of this changeset.)

- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [1940a4d]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [e2ad3c0]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [2412415]
- Updated dependencies [06ccfb2]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [43f9133]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2cc08e1]
- Updated dependencies [a5f92d2]
- Updated dependencies [2d14c62]
- Updated dependencies [394d276]
- Updated dependencies [c996a56]
- Updated dependencies [de6eb14]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [8ec1515]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [1fa6f6b]
- Updated dependencies [806e7f2]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [394d276]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [c643ba3]
- Updated dependencies [e9e9873]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [be0bdb2]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [1fdd5d0]
- Updated dependencies [44fca09]
- Updated dependencies [2741d46]
- Updated dependencies [4eb87c5]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [80fcb61]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [0db4f4f]
- Updated dependencies [53d256f]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fefca2]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [5c6e36c]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/sql-parser@6.1.0
  - @memberjunction/sql-dialect@6.1.0
  - @memberjunction/react-runtime@6.1.0
  - @memberjunction/interactive-component-types@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [076fa5d]
- Updated dependencies [44fca09]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/sql-dialect@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/react-runtime@6.1.0-edge.7
  - @memberjunction/interactive-component-types@6.1.0-edge.7
  - @memberjunction/sql-parser@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [806e7f2]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [80fcb61]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/sql-parser@6.1.0-edge.6
  - @memberjunction/sql-dialect@6.1.0-edge.6
  - @memberjunction/react-runtime@6.1.0-edge.6
  - @memberjunction/interactive-component-types@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [4eb87c5]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/sql-dialect@6.1.0-edge.5
  - @memberjunction/react-runtime@6.1.0-edge.5
  - @memberjunction/interactive-component-types@6.1.0-edge.5
  - @memberjunction/sql-parser@6.1.0-edge.5

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
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/sql-dialect@6.1.0-edge.4
  - @memberjunction/react-runtime@6.1.0-edge.4
  - @memberjunction/interactive-component-types@6.1.0-edge.4
  - @memberjunction/sql-parser@6.1.0-edge.4

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
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [1fdd5d0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/sql-parser@6.1.0-edge.3
  - @memberjunction/sql-dialect@6.1.0-edge.3
  - @memberjunction/react-runtime@6.1.0-edge.3
  - @memberjunction/interactive-component-types@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/react-runtime@6.1.0-edge.2
  - @memberjunction/interactive-component-types@6.1.0-edge.2
  - @memberjunction/sql-dialect@6.1.0-edge.2
  - @memberjunction/sql-parser@6.1.0-edge.2

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
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/interactive-component-types@6.1.0-edge.1
  - @memberjunction/react-runtime@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1
  - @memberjunction/sql-dialect@6.1.0-edge.1
  - @memberjunction/sql-parser@6.1.0-edge.1

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
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [5c6e36c]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/interactive-component-types@6.1.0-edge.0
  - @memberjunction/react-runtime@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0
  - @memberjunction/sql-dialect@6.1.0-edge.0
  - @memberjunction/sql-parser@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/interactive-component-types@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/react-runtime@6.0.0
  - @memberjunction/global@6.0.0
  - @memberjunction/sql-dialect@6.0.0
  - @memberjunction/sql-parser@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/react-runtime@5.51.0
  - @memberjunction/interactive-component-types@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/global@5.51.0
  - @memberjunction/sql-dialect@5.51.0
  - @memberjunction/sql-parser@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/react-runtime@5.50.0
  - @memberjunction/interactive-component-types@5.50.0
  - @memberjunction/global@5.50.0
  - @memberjunction/sql-dialect@5.50.0
  - @memberjunction/sql-parser@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [6c910ef]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/sql-parser@5.49.0
  - @memberjunction/interactive-component-types@5.49.0
  - @memberjunction/react-runtime@5.49.0
  - @memberjunction/sql-dialect@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/interactive-component-types@5.48.0
  - @memberjunction/react-runtime@5.48.0
  - @memberjunction/global@5.48.0
  - @memberjunction/sql-dialect@5.48.0
  - @memberjunction/sql-parser@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
- Updated dependencies [06a1e44]
- Updated dependencies [31da520]
  - @memberjunction/core@5.47.0
  - @memberjunction/sql-dialect@5.47.0
  - @memberjunction/interactive-component-types@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/react-runtime@5.47.0
  - @memberjunction/sql-parser@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/interactive-component-types@5.46.0
  - @memberjunction/react-runtime@5.46.0
  - @memberjunction/global@5.46.0
  - @memberjunction/sql-dialect@5.46.0
  - @memberjunction/sql-parser@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/react-runtime@5.45.1
- @memberjunction/interactive-component-types@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1
- @memberjunction/sql-dialect@5.45.1
- @memberjunction/sql-parser@5.45.1

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
  - @memberjunction/interactive-component-types@5.45.0
  - @memberjunction/react-runtime@5.45.0
  - @memberjunction/sql-dialect@5.45.0
  - @memberjunction/sql-parser@5.45.0

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
  - @memberjunction/react-runtime@5.44.0
  - @memberjunction/interactive-component-types@5.44.0
  - @memberjunction/sql-dialect@5.44.0
  - @memberjunction/sql-parser@5.44.0

## 5.43.0

### Patch Changes

- a975e3d: Eliminate React linter form-lifecycle false positives and guard against no-op saves in the interactive form component.
- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [b98366b]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/sql-dialect@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/interactive-component-types@5.43.0
  - @memberjunction/react-runtime@5.43.0
  - @memberjunction/sql-parser@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [438ce4a]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/react-runtime@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/interactive-component-types@5.42.0
  - @memberjunction/sql-dialect@5.42.0
  - @memberjunction/sql-parser@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [cd6c5f0]
- Updated dependencies [133dfa7]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/react-runtime@5.41.0
  - @memberjunction/interactive-component-types@5.41.0
  - @memberjunction/global@5.41.0
  - @memberjunction/sql-dialect@5.41.0
  - @memberjunction/sql-parser@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/interactive-component-types@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2
- @memberjunction/react-runtime@5.40.2
- @memberjunction/sql-dialect@5.40.2
- @memberjunction/sql-parser@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/interactive-component-types@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/react-runtime@5.40.1
  - @memberjunction/global@5.40.1
  - @memberjunction/sql-dialect@5.40.1
  - @memberjunction/sql-parser@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/interactive-component-types@5.40.0
  - @memberjunction/react-runtime@5.40.0
  - @memberjunction/global@5.40.0
  - @memberjunction/sql-dialect@5.40.0
  - @memberjunction/sql-parser@5.40.0

## 5.39.0

### Patch Changes

- 315ff4d: feat(react-linter): match `React.useX(...)` member-expression hook calls

  The `react-hooks-rules` rule previously matched only bare-identifier hook calls (`useEffect`, `useState`, ...). LLM-generated code routinely emits the `React.useEffect`-style member-expression form, which slipped through entirely. The `CallExpression` visitor now has a parallel branch matching `object='React'` + property in the hooks list. All 5 downstream violation checks (nested-function, conditional, loop, try/catch, early-return-then-hook) now fire on the `React.`-prefixed form too.

  feat(react-runtime): emit Babel sourcemaps by default; expose on `CompiledComponent`

  `DEFAULT_COMPILER_CONFIG.sourceMaps` is flipped from `false` to `true`. `transpileComponent` now returns `{ code, map }` instead of just the code string, and `compile()` attaches the map to the returned `CompiledComponent` as a new optional `sourceMap` field. Lets downstream tools translate runtime stack-frame line numbers back to original JSX positions.

  feat(react-test-harness): preserve runtime stacks; classify hook-rule warnings
  - Each compiled component's sourcemap is stashed on `window.__testHarnessSourceMaps[componentName]` and surfaced as a new optional `sourceMaps?: Record<string, any>` field on `ComponentExecutionResult`.
  - Runtime errors aggregated from `collectRuntimeErrors` now retain their `stack` and `componentStack` properties (previously stripped during normalization).
  - The `console.error` override recognizes React dev-mode Rules-of-Hooks warning strings (`"Rendered more hooks than during the previous render"`, etc.) and promotes them from generic warnings to test-failing critical errors with rule type `'react-hooks-rules'`.

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [315ff4d]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/react-runtime@5.39.0
  - @memberjunction/interactive-component-types@5.39.0
  - @memberjunction/sql-dialect@5.39.0
  - @memberjunction/sql-parser@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [d285996]
- Updated dependencies [6a3ac36]
- Updated dependencies [918d663]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/interactive-component-types@5.38.0
  - @memberjunction/sql-dialect@5.38.0
  - @memberjunction/sql-parser@5.38.0
  - @memberjunction/react-runtime@5.38.0

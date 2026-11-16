# @memberjunction/materialization

## 6.2.2

### Patch Changes

- Updated dependencies [47303ff]
- Updated dependencies [215696a]
- Updated dependencies [7110d1b]
- Updated dependencies [ce47382]
  - @memberjunction/core@6.2.2
  - @memberjunction/sql-parser@6.2.2
  - @memberjunction/core-entities@6.2.2
  - @memberjunction/global@6.2.2
  - @memberjunction/sql-dialect@6.2.2

## 6.2.1

### Patch Changes

- Updated dependencies [41142bd]
  - @memberjunction/core@6.2.1
  - @memberjunction/core-entities@6.2.1
  - @memberjunction/global@6.2.1
  - @memberjunction/sql-dialect@6.2.1
  - @memberjunction/sql-parser@6.2.1

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

- 9a2d7cc: RunView's `TotalRowCount` contract is now explicit: a number is always a real total, and `undefined` means the caller passed `SkipTotalRowCount: true`.

  **Contract change.** `RunViewResult.TotalRowCount` is now optional (`TotalRowCount?: number`). With `SkipTotalRowCount: true` it is always `undefined`, including on a page that was not full, where it used to be the number of rows returned. A caller that needs a total must not pass the flag. Strict TypeScript consumers that read the field will see a compile error; a call without the flag always gets a number, so `?? 0` is safe there. `ResultType: 'count_only'` ignores the flag and always counts.

  `MaxRows: 1` is no longer special-cased: a full page of one row now runs the same count as any other full page and reports the real total. Callers that only read `Results` should pass `SkipTotalRowCount: true` to avoid that second query; about 270 such reads in this repo now do. `SkipTotalRowCount` is now sent over GraphQL, so browser callers can use it too.

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

- 9a2d7cc: RunView's `TotalRowCount` contract is now explicit: a number is always a real total, and `undefined` means the caller passed `SkipTotalRowCount: true`.

  **Contract change.** `RunViewResult.TotalRowCount` is now optional (`TotalRowCount?: number`). With `SkipTotalRowCount: true` it is always `undefined`, including on a page that was not full, where it used to be the number of rows returned. A caller that needs a total must not pass the flag. Strict TypeScript consumers that read the field will see a compile error; a call without the flag always gets a number, so `?? 0` is safe there. `ResultType: 'count_only'` ignores the flag and always counts.

  `MaxRows: 1` is no longer special-cased: a full page of one row now runs the same count as any other full page and reports the real total. Callers that only read `Results` should pass `SkipTotalRowCount: true` to avoid that second query; about 270 such reads in this repo now do. `SkipTotalRowCount` is now sent over GraphQL, so browser callers can use it too.

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
  - @memberjunction/sql-parser@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

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
  - @memberjunction/sql-dialect@6.2.0-edge.3
  - @memberjunction/sql-parser@6.2.0-edge.3

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
  - @memberjunction/sql-parser@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0
  - @memberjunction/sql-dialect@6.2.0-edge.0

## 6.1.0

### Minor Changes

- 7300953: Query & Entity Materialization — snapshot a stored Query's result (or an entity's base view) into a physical table that IS its own read-only entity, refreshed on a schedule with an atomic wrapper-view swap. Base-view (entity) materialization is cross-engine (SQL Server + PostgreSQL); query materialization runs on SQL Server today and becomes cross-engine once the pre-existing `spCreateVirtualEntity` support proc is ported to PostgreSQL (tracked with the broader PG parity effort). The refresh SQL and read path are cross-engine on both.
  - **New `@memberjunction/materialization`** package: the refresh engine (`MaterializationRefresher`) — full-rebuild (shadow table + atomic view swap), `DirtyGroupRecompute` and MERGE-upsert `Incremental` strategies for keyed aggregations, combined-key `SHA2_256` surrogate hashing, and the advisory `MaterializationFreshness` mixed-freshness inspector.
  - **CodeGen** (`codegen-lib`): materializes flagged stored Queries + entity base views (cross-engine DDL, wrapper view, read-only Virtual Entity minting, migration-reuse detection); parameterization (row-filter → materialize-broad + read-time predicate); aggregation-key auto-detection; RLS-downgrade gate; and `DriftHold` flag-and-hold drift detection.
  - **Read path**: `RunViewParams.DataSource: 'Live' | 'Materialized'` (`core`) routed by `GenericDatabaseProvider.GetEffectiveBaseView`, plumbed through the GraphQL layer (`server`, `graphql-dataprovider`).
  - **Scheduling** (`scheduling-engine`): `MaterializationRefreshScheduledJobDriver` sweeps due materializations (skips `Disabled`/`DriftHold`).
  - **`core-entities` / `ng-core-entity-forms`**: generated `MJ: Materialized Results` + `MJ: Materialized Result Queries` (join) entities + `Query.IsMaterialized` + forms. The MR↔Query link lives in the `MaterializedResultQuery` join table — there is no `MaterializedResult.SourceQueryID` / `Query.MaterializedResultID` FK — avoiding the circular dependency of the direct-FK design.

  See `plans/query-entity-materialization.md` for the full design.

### Patch Changes

- be0bdb2: Follow-up hardening for Query & Entity Materialization (#3735). Each item below fails toward doing the
  wrong thing rather than doing nothing, so none of them surface as an error in normal operation.

  **Row-restriction gates read both fence layers.** MJ enforces row restrictions in two AND-composed
  layers — role RLS and API-key row filters — and the mint, drift and runtime Leak-1 gates each re-derived
  a role-only predicate inline. An entity fenced _only_ by an API-key row filter therefore read as
  unrestricted; because the mint gives the materialized entity a NEW EntityID, the key's EntityID-keyed
  binding stops matching it, and the principal is served a full unscoped snapshot of rows it cannot read
  live. All gates now compose both layers, and an unproven layer counts as restricted.

  **Lost provenance is now drift.** Deleting a source query cascade-deletes the `MaterializedResultQuery`
  join row while the snapshot, the minted entity and its read grants all survive — which silently disarmed
  both the RLS re-check and the read-grant re-narrow, leaving the unscoped snapshot serving indefinitely.
  It now revokes read and holds.

  **A zero-row external query no longer destroys the snapshot.** Columns are derived from the returned
  rows, so an empty result built a surrogate-only shadow, dropped the canonical table and renamed that
  shell into its place — every subsequent read failing on a missing column while the refresh reported
  success. An empty result now refuses the rebuild and leaves the existing snapshot serving.

  **The refresher snapshots the statement the read path executes.** Reads resolve SQL through
  `GetPlatformSQL(PlatformKey)`; the refresher snapshotted the base `SQL`, so a query carrying a
  per-platform variant was materialized from a different statement than live serves.

  **`XACT_ABORT` no longer escapes onto the pooled connection.** The swap, recompute and dirty-group
  batches each set it ON and never restored it. SET options persist for the session, so unrelated requests
  handed the same physical connection inherited it — turning their recoverable statement-level errors into
  full transaction aborts, far from anything to do with materialization.

  **The DDL identifier guard no longer opens on its own failure.** `assertSafeObjectNames` throws on a
  tampered `SchemaName`, but the failure path then passed that same rejected name to the best-effort shadow
  cleanup, which interpolated it raw into `DROP TABLE`/`OBJECT_ID`. The cleanup now re-checks and declines.

  **Two analyzers that produced silently wrong rows.** A `UNION`/`EXCEPT`/`INTERSECT` parses to a single
  `select` root whose `groupby` and `columns` describe only the first branch, so a set operation yielded an
  aggregation key covering one branch and the incremental MERGE collided both branches on the same hash.
  And a row-filter predicate was bound to an output column by bare name, which cannot tell `o.Status` from
  `c.Status` across a join, nor an alias from the column it rebinds.

  **Missing manifest registrations.** Neither new `@RegisterClass` class was in the pre-built manifests, so
  a bundled MJAPI tree-shook both away: the refresh driver never resolved, nothing was ever refreshed, and
  `Status` stayed `Active` while the read paths served mint-time data forever.

  **Read-routing distinguishes a failed lookup from "not materialized".** Only three roles hold `CanRead`
  on `MJ: Materialized Results`, so a restricted user silently got live data for every materialized request
  while an admin got the snapshot. The live fallback is correct and unchanged; the silence was the defect.

  **Note on coverage.** The predicate-binding proof and the join-qualifier requirement are deliberately
  conservative and will refuse shapes that previously qualified: a row-filter query whose predicate or
  projection is unqualified across a join now stays live-only, and an aggregation over a join with an
  unqualified `GROUP BY` loses its incremental key and falls back to `FullRebuild`. Both refusals are
  logged with the specific reason. Falling back to live is always correct — but a query that silently gets
  slower is easier to diagnose knowing this changed.

- cf2484c: Review follow-ups to #4358 and #4366.
  - `EntityPermissionInfo.IsDeny` — one predicate for "this is a Deny row" (case- and whitespace-insensitive; blank Type is Allow), used by `GetUserPermisions` and now by both RLS readers: `UserExemptFromRowLevelSecurity` and `GetUserRowLevelSecurityInfo` skip Deny rows, so a set `Can*` flag on a Deny row is never read as a grant. Unreachable in practice (a user carrying a Deny row fails the permission gate first), but the methods now implement the invariant their docs state. Tests cover the Deny axis with typed builders.
  - The materialization leak gate's comments no longer claim parity with the runtime RLS reader; they say the gate is deliberately wider.
  - Input dialog: `box-sizing: border-box` parity with the rating dialog. The dialog container documents its contract — component bodies pad themselves.

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

## 6.1.0-edge.7

### Patch Changes

- cf2484c: Review follow-ups to #4358 and #4366.
  - `EntityPermissionInfo.IsDeny` — one predicate for "this is a Deny row" (case- and whitespace-insensitive; blank Type is Allow), used by `GetUserPermisions` and now by both RLS readers: `UserExemptFromRowLevelSecurity` and `GetUserRowLevelSecurityInfo` skip Deny rows, so a set `Can*` flag on a Deny row is never read as a grant. Unreachable in practice (a user carrying a Deny row fails the permission gate first), but the methods now implement the invariant their docs state. Tests cover the Deny axis with typed builders.
  - The materialization leak gate's comments no longer claim parity with the runtime RLS reader; they say the gate is deliberately wider.
  - Input dialog: `box-sizing: border-box` parity with the rating dialog. The dialog container documents its contract — component bodies pad themselves.

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
  - @memberjunction/sql-parser@6.1.0-edge.4

## 6.1.0-edge.3

### Minor Changes

- 7300953: Query & Entity Materialization — snapshot a stored Query's result (or an entity's base view) into a physical table that IS its own read-only entity, refreshed on a schedule with an atomic wrapper-view swap. Base-view (entity) materialization is cross-engine (SQL Server + PostgreSQL); query materialization runs on SQL Server today and becomes cross-engine once the pre-existing `spCreateVirtualEntity` support proc is ported to PostgreSQL (tracked with the broader PG parity effort). The refresh SQL and read path are cross-engine on both.
  - **New `@memberjunction/materialization`** package: the refresh engine (`MaterializationRefresher`) — full-rebuild (shadow table + atomic view swap), `DirtyGroupRecompute` and MERGE-upsert `Incremental` strategies for keyed aggregations, combined-key `SHA2_256` surrogate hashing, and the advisory `MaterializationFreshness` mixed-freshness inspector.
  - **CodeGen** (`codegen-lib`): materializes flagged stored Queries + entity base views (cross-engine DDL, wrapper view, read-only Virtual Entity minting, migration-reuse detection); parameterization (row-filter → materialize-broad + read-time predicate); aggregation-key auto-detection; RLS-downgrade gate; and `DriftHold` flag-and-hold drift detection.
  - **Read path**: `RunViewParams.DataSource: 'Live' | 'Materialized'` (`core`) routed by `GenericDatabaseProvider.GetEffectiveBaseView`, plumbed through the GraphQL layer (`server`, `graphql-dataprovider`).
  - **Scheduling** (`scheduling-engine`): `MaterializationRefreshScheduledJobDriver` sweeps due materializations (skips `Disabled`/`DriftHold`).
  - **`core-entities` / `ng-core-entity-forms`**: generated `MJ: Materialized Results` + `MJ: Materialized Result Queries` (join) entities + `Query.IsMaterialized` + forms. The MR↔Query link lives in the `MaterializedResultQuery` join table — there is no `MaterializedResult.SourceQueryID` / `Query.MaterializedResultID` FK — avoiding the circular dependency of the direct-FK design.

  See `plans/query-entity-materialization.md` for the full design.

### Patch Changes

- be0bdb2: Follow-up hardening for Query & Entity Materialization (#3735). Each item below fails toward doing the
  wrong thing rather than doing nothing, so none of them surface as an error in normal operation.

  **Row-restriction gates read both fence layers.** MJ enforces row restrictions in two AND-composed
  layers — role RLS and API-key row filters — and the mint, drift and runtime Leak-1 gates each re-derived
  a role-only predicate inline. An entity fenced _only_ by an API-key row filter therefore read as
  unrestricted; because the mint gives the materialized entity a NEW EntityID, the key's EntityID-keyed
  binding stops matching it, and the principal is served a full unscoped snapshot of rows it cannot read
  live. All gates now compose both layers, and an unproven layer counts as restricted.

  **Lost provenance is now drift.** Deleting a source query cascade-deletes the `MaterializedResultQuery`
  join row while the snapshot, the minted entity and its read grants all survive — which silently disarmed
  both the RLS re-check and the read-grant re-narrow, leaving the unscoped snapshot serving indefinitely.
  It now revokes read and holds.

  **A zero-row external query no longer destroys the snapshot.** Columns are derived from the returned
  rows, so an empty result built a surrogate-only shadow, dropped the canonical table and renamed that
  shell into its place — every subsequent read failing on a missing column while the refresh reported
  success. An empty result now refuses the rebuild and leaves the existing snapshot serving.

  **The refresher snapshots the statement the read path executes.** Reads resolve SQL through
  `GetPlatformSQL(PlatformKey)`; the refresher snapshotted the base `SQL`, so a query carrying a
  per-platform variant was materialized from a different statement than live serves.

  **`XACT_ABORT` no longer escapes onto the pooled connection.** The swap, recompute and dirty-group
  batches each set it ON and never restored it. SET options persist for the session, so unrelated requests
  handed the same physical connection inherited it — turning their recoverable statement-level errors into
  full transaction aborts, far from anything to do with materialization.

  **The DDL identifier guard no longer opens on its own failure.** `assertSafeObjectNames` throws on a
  tampered `SchemaName`, but the failure path then passed that same rejected name to the best-effort shadow
  cleanup, which interpolated it raw into `DROP TABLE`/`OBJECT_ID`. The cleanup now re-checks and declines.

  **Two analyzers that produced silently wrong rows.** A `UNION`/`EXCEPT`/`INTERSECT` parses to a single
  `select` root whose `groupby` and `columns` describe only the first branch, so a set operation yielded an
  aggregation key covering one branch and the incremental MERGE collided both branches on the same hash.
  And a row-filter predicate was bound to an output column by bare name, which cannot tell `o.Status` from
  `c.Status` across a join, nor an alias from the column it rebinds.

  **Missing manifest registrations.** Neither new `@RegisterClass` class was in the pre-built manifests, so
  a bundled MJAPI tree-shook both away: the refresh driver never resolved, nothing was ever refreshed, and
  `Status` stayed `Active` while the read paths served mint-time data forever.

  **Read-routing distinguishes a failed lookup from "not materialized".** Only three roles hold `CanRead`
  on `MJ: Materialized Results`, so a restricted user silently got live data for every materialized request
  while an admin got the snapshot. The live fallback is correct and unchanged; the silence was the defect.

  **Note on coverage.** The predicate-binding proof and the join-qualifier requirement are deliberately
  conservative and will refuse shapes that previously qualified: a row-filter query whose predicate or
  projection is unqualified across a join now stays live-only, and an aggregation over a join with an
  unqualified `GROUP BY` loses its incremental key and falls back to `FullRebuild`. Both refusals are
  logged with the specific reason. Falling back to live is always correct — but a query that silently gets
  slower is easier to diagnose knowing this changed.

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

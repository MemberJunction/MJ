# Change Log - @memberjunction/external-change-detection

## 6.2.1

### Patch Changes

- Updated dependencies [41142bd]
  - @memberjunction/core@6.2.1
  - @memberjunction/sqlserver-dataprovider@6.2.1
  - @memberjunction/encryption@6.2.1
  - @memberjunction/core-entities@6.2.1
  - @memberjunction/global@6.2.1
  - @memberjunction/sql-dialect@6.2.1

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

- 36a3f9e: Security hardening across SQL filter construction, expression sandboxing, token verification, fail-closed endpoints, and client URL/selector screening:
  - **Pure AST transform evaluation (`@memberjunction/global`)**: Replace `new Function` in `FieldTransformEngine` with an Acorn-based AST interpreter (`SafeTransformAstEvaluator`) that blocks prototype climbs, ambient global callback smuggling, and dynamic code generation, while supporting standard string/array transform methods (`split`, `slice`, `join`, `substring`, `replace`, `padStart`, `padEnd`, etc.). Harden `SafeExpressionEvaluator` against higher-order callback smuggling.
  - **SQL filter & token hardening (`@memberjunction/server`, `@memberjunction/external-change-detection`, `@memberjunction/metadata-sync`)**: Enforce strict UUID shape validation and SQL string escaping on `ExtraFilter` interpolations across resolvers and REST handlers, reject non-primitive/non-literal primary key and lookup filter values in `MetadataSync`, perform non-short-circuiting constant-time access-token lookups in `GetDataResolver` with full token redaction from error messages, derive a domain-separated HS256 media-access signing subkey from `MJ_BASE_ENCRYPTION_KEY`, and default `SetupRESTEndpoints` to disabled (`enabled: false`).
  - **Fail-closed registry auth (`@memberjunction/component-registry-server`)**: Refuse requests by default in `ComponentRegistryAPIServer.checkAPIKey` until overridden by a subclass, and protect both `/components` and `/feedback` routes when `requireAuth` is enabled.
  - **Client URL-scheme & DOM selector screening (`@memberjunction/ng-core-entity-forms`, `@memberjunction/ng-conversations`, `@memberjunction/react-runtime`)**: Screen media and subresource URLs to `http:` / `https:` (rejecting `javascript:`, `data:`, `blob:`, and scheme-relative `//` targets) across viewer, open-in-tab, download, session-state rehydration, and dynamic `<script>` / `<link>` loaders, and replace interpolated `document.querySelector` URL lookups with direct attribute comparison.

- Updated dependencies [3b0e8db]
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
- Updated dependencies [fcf8e1c]
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
- Updated dependencies [be3dae0]
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
- Updated dependencies [bdea87a]
- Updated dependencies [4b9542c]
- Updated dependencies [28c92e0]
- Updated dependencies [5f707d1]
- Updated dependencies [091e7ea]
- Updated dependencies [369e229]
- Updated dependencies [ba00ac7]
- Updated dependencies [8a5d2c0]
- Updated dependencies [d13cf6b]
- Updated dependencies [aca4317]
- Updated dependencies [d52f9ba]
- Updated dependencies [ec97ad4]
- Updated dependencies [0e5a4cd]
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
  - @memberjunction/sqlserver-dataprovider@6.2.0
  - @memberjunction/core-entities@6.2.0
  - @memberjunction/global@6.2.0
  - @memberjunction/core@6.2.0
  - @memberjunction/sql-dialect@6.2.0
  - @memberjunction/encryption@6.2.0

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
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.8
  - @memberjunction/encryption@6.2.0-edge.8
  - @memberjunction/sql-dialect@6.2.0-edge.8

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

- 36a3f9e: Security hardening across SQL filter construction, expression sandboxing, token verification, fail-closed endpoints, and client URL/selector screening:
  - **Pure AST transform evaluation (`@memberjunction/global`)**: Replace `new Function` in `FieldTransformEngine` with an Acorn-based AST interpreter (`SafeTransformAstEvaluator`) that blocks prototype climbs, ambient global callback smuggling, and dynamic code generation, while supporting standard string/array transform methods (`split`, `slice`, `join`, `substring`, `replace`, `padStart`, `padEnd`, etc.). Harden `SafeExpressionEvaluator` against higher-order callback smuggling.
  - **SQL filter & token hardening (`@memberjunction/server`, `@memberjunction/external-change-detection`, `@memberjunction/metadata-sync`)**: Enforce strict UUID shape validation and SQL string escaping on `ExtraFilter` interpolations across resolvers and REST handlers, reject non-primitive/non-literal primary key and lookup filter values in `MetadataSync`, perform non-short-circuiting constant-time access-token lookups in `GetDataResolver` with full token redaction from error messages, derive a domain-separated HS256 media-access signing subkey from `MJ_BASE_ENCRYPTION_KEY`, and default `SetupRESTEndpoints` to disabled (`enabled: false`).
  - **Fail-closed registry auth (`@memberjunction/component-registry-server`)**: Refuse requests by default in `ComponentRegistryAPIServer.checkAPIKey` until overridden by a subclass, and protect both `/components` and `/feedback` routes when `requireAuth` is enabled.
  - **Client URL-scheme & DOM selector screening (`@memberjunction/ng-core-entity-forms`, `@memberjunction/ng-conversations`, `@memberjunction/react-runtime`)**: Screen media and subresource URLs to `http:` / `https:` (rejecting `javascript:`, `data:`, `blob:`, and scheme-relative `//` targets) across viewer, open-in-tab, download, session-state rehydration, and dynamic `<script>` / `<link>` loaders, and replace interpolated `document.querySelector` URL lookups with direct attribute comparison.

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
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [aca4317]
- Updated dependencies [b0b2cc9]
  - @memberjunction/global@6.2.0-edge.7
  - @memberjunction/core-entities@6.2.0-edge.7
  - @memberjunction/core@6.2.0-edge.7
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.7
  - @memberjunction/encryption@6.2.0-edge.7
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
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.6
  - @memberjunction/sql-dialect@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/encryption@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- Updated dependencies [3b0e8db]
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
- Updated dependencies [5f707d1]
- Updated dependencies [091e7ea]
- Updated dependencies [dc38250]
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.5
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/sql-dialect@6.2.0-edge.5
  - @memberjunction/encryption@6.2.0-edge.5

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
- Updated dependencies [fcf8e1c]
- Updated dependencies [d86bcbc]
- Updated dependencies [7316ac3]
- Updated dependencies [be3dae0]
- Updated dependencies [08b3d7b]
- Updated dependencies [20650af]
- Updated dependencies [1ea4085]
- Updated dependencies [aee2d53]
- Updated dependencies [25f7b82]
- Updated dependencies [90829e3]
- Updated dependencies [aac148b]
- Updated dependencies [e1942c7]
- Updated dependencies [bdea87a]
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
  - @memberjunction/encryption@6.2.0-edge.4
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.4
  - @memberjunction/sql-dialect@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4

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
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.3
  - @memberjunction/sql-dialect@6.2.0-edge.3
  - @memberjunction/encryption@6.2.0-edge.3

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
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/encryption@6.2.0-edge.2
  - @memberjunction/sql-dialect@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

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
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.1
  - @memberjunction/encryption@6.2.0-edge.1

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
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.0
  - @memberjunction/encryption@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0
  - @memberjunction/sql-dialect@6.2.0-edge.0

## 6.1.0

### Patch Changes

- 92f2ac9: Repo-wide sweep of code that assumed an entity's primary key is a single column named `ID`, plus a `PrimaryKeyCompliance` gate in `@memberjunction/core` so the pattern cannot come back.

  MJ supports primary keys with any column name(s) and type(s). Every MJ core entity happens to use `ID`, so hardcoding it works across the whole core product and silently breaks on customer entities mapped from external schemas — `Load()` rejects the invented field name, or a composite key is truncated to its first column. #4179 (search result click-through) was one instance; this sweep found the same shape in ~90 files and fixes all of it on top of the `CompositeKey.FromURLSegment` / `FromEntityRecord` / `ToCompactURLSegment` primitives introduced with that fix.

  **What changed, by kind**
  - **Literal `ID` key construction** (`{ FieldName: 'ID', Value: x }`, `LoadFromSingleKeyValuePair('ID', …)`, `FromKeyValuePair('ID', …)`) — ~135 sites. Where the entity is a literal MJ core entity the key is now `CompositeKey.FromID(x)`, the one sanctioned way to say "this entity's key is `ID`". Where the entity is a variable (an event's `EntityName`, an `entityInfo`, a configured entity) the key is `CompositeKey.FromURLSegment(entityInfo, recordId)`, which reads a bare value or a `F1|v1||F2|v2` segment against the entity's real primary key(s).
  - **`PrimaryKeys[0]` → `FirstPrimaryKey`** — 39 sites. Same semantics, a named accessor the gate can track. IS-A shared-key and keyset uses are annotated `// first-pk-ok`.
  - **Real defects fixed** (arbitrary entity keyed as `ID`): Mobile app record load/edit/offline sync; the generic form overlay; the ERD "open record" path; version-history label/diff/micro-view links (which stripped `ID|` off a stored key and re-wrapped the value as `ID`); `RestoreEngine` and `buildPrimaryKeyForLoad`; the Apollo enrichment connector (six `GetEntityObject(configuredEntity, FromID(record.ID))` calls); geocoding record reload; List Detail record-open (composite keys now open instead of showing a notice); `EmbeddedRecord`; `DatabaseReferenceScanner`; hardcoded `ID` filters on a variable entity in Data Explorer's record load, Predictive Studio's label lookup, the realtime-widget visitor identity lookup, `DuplicateRecordDetector.LoadRecordsByListID`, and MetadataSync's `@lookup` GUID conversion.
  - **REST API**: `EntityCRUDHandler` / `RESTEndpointHandler` built the key from the `:id` segment for single-column keys only and threw "Composite primary keys are not supported". Both now accept a bare value or a URL-encoded `Field1|Value1||Field2|Value2` segment. Single-column behavior is unchanged.
  - **One serializer instead of eight**: `ListOperations.serializeRecordId`, `list-set-operations.serializeRecordId`, RecordSetProcessor's `serializeRecordId`, `GetListRecordsAction`'s inline copy, `MJListDetailEntityExtended.BuildRecordID` / `GetCompositeKey`, `record.util.buildCompositeKey`, `VersionHistory.buildCompositeKeyFromRecord` and `ChangeDetector.buildDeleteItem` all delegate to `CompositeKey.FromEntityRecord(...).ToCompactURLSegment()` / `FromURLSegment(...)`. Output is byte-identical for single-column keys.

  **`FirstPrimaryKey` triage** — every one of the ~390 `FirstPrimaryKey` / `FromID` uses in the repo was read in context and either rewritten or annotated with a reason (154 annotations). Real defects found and fixed along the way, all of the shape "first key column used as the whole key" on an entity that can be composite-keyed:
  - **Data providers**: the deterministic `ORDER BY` fallback for row-limited queries ordered by the first key column only, leaving composite-key pages in undefined order; it now orders by every key column. Saved-view run logging / exclusion and the `{%UserView%}` template subquery, whose persisted `RecordID` cannot hold a composite key, now refuse loudly instead of excluding wrong rows. The dependency-link subquery now predicates on the full key. Single-column SQL is byte-identical.
  - **CodeGen**: generated cascade delete/update procs bound the child FK to `@<firstPK>` regardless of which parent key column the FK references; a composite key containing an identity column dropped the other key columns from the generated INSERT (both providers); the PostgreSQL JSON-arg `spCreate` inserted only the first key column; the generated join-grid/timeline filters and the GraphQL audit-log `RecordID` truncated composite keys. Single-key generator output verified byte-identical against `HEAD` (168 shapes).
  - **Smart cache** (`ProviderBase` differential merge): keyed rows on the first PK, so composite-key deletes never applied and rows sharing the first column collapsed.
  - **Integration push sync**: composed record identity from the first key column while the record map stores all columns joined, so every already-synced composite-key row was re-created externally as a duplicate on each full push; the changed-record path silently dropped rows.
  - **Scheduled geocoding orphan cleanup** (destructive): compared a cast of the first key column to a `RecordID` holding all columns, so every geocode row for a composite-key entity was deleted on each run.
  - **Lists**: list membership, export and add-record paths filtered on the first key column and wrote only its value into `ListDetail.RecordID`; Explorer "open record" paths on user-selected entities, duplicate detection, omnibar record search, Data Explorer deep links, the sharing center revoke, recent-access, tree dropdowns, the mobile app's record ids and offline queue.
  - **AI**: duplicate detection, vector sync record ids, Predictive Studio list scope and write-back; the Recommendations engine also wrote a record id into `SourceEntityID` (an FK to Entities) and never set `SourceEntityRecordID`.
  - **Apollo enrichment**: `Accounts` (a customer entity) loaded by literal `ID`; the contacts path read its key off an entity that had never been loaded.
  - Every `entityInfo.FirstPrimaryKey?.Name ?? 'ID'` fallback is gone; where the entity can be missing the code now fails loudly instead of inventing `ID`.

  **The gate** — `packages/MJCore/src/__tests__/PrimaryKeyCompliance.test.ts`, modelled on `MultiProviderCompliance` / `UUIDCompliance`:
  1. _Strict_: a key built with a literal `ID` field name. Marker `// pk-literal-ok: <reason>`.
  2. _Strict_: `PrimaryKeys[0]` / `PrimaryKeys.at(0)`.
  3. _Strict_: `FirstPrimaryKey` and `CompositeKey.FromID(`. These are legitimate only where MJ is single-column by design (foreign-key targets, keyset `ORDER BY` / `AfterKey`, IS-A shared keys, core entities), so every use must be self-evidently on a core entity or say why: `FromID` is exempt when a `'MJ: …'` entity literal is on the same line or within 8 lines above (the `GetEntityObject` / `OpenEntityRecord` naming the core entity); everything else carries `// first-pk-ok: <reason>` on the same line, reason mandatory.
  4. _Strict_: an `ID = …` / `ID IN (…)` `ExtraFilter` or `Fields: ['ID']` within eight lines of an `EntityName:` that is a variable rather than a string literal or ALL_CAPS constant. Marker `// pk-filter-ok: <reason>`.

  Generated code, tests, `dist/`, and the `TestingFramework` / `UnitTesting` packages are not scanned. The rule is written up in `.claude/rules/data-access.md` § "Primary keys: never assume a column named ID". There is no baseline file: all four gates are strict.

  No public signatures change; every edit is additive or a same-shape substitution, so this is `patch` throughout.

- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [afd6fd6]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [1940a4d]
- Updated dependencies [489aecd]
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
- Updated dependencies [fe7bd9d]
- Updated dependencies [8ec1515]
- Updated dependencies [eb962a1]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [1fa6f6b]
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
- Updated dependencies [6cbed1d]
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
- Updated dependencies [8d0d45a]
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
- Updated dependencies [f2f1491]
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
- Updated dependencies [d8adda1]
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
  - @memberjunction/sqlserver-dataprovider@6.1.0
  - @memberjunction/sql-dialect@6.1.0
  - @memberjunction/encryption@6.1.0

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
  - @memberjunction/encryption@6.1.0-edge.7
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- 92f2ac9: Repo-wide sweep of code that assumed an entity's primary key is a single column named `ID`, plus a `PrimaryKeyCompliance` gate in `@memberjunction/core` so the pattern cannot come back.

  MJ supports primary keys with any column name(s) and type(s). Every MJ core entity happens to use `ID`, so hardcoding it works across the whole core product and silently breaks on customer entities mapped from external schemas — `Load()` rejects the invented field name, or a composite key is truncated to its first column. #4179 (search result click-through) was one instance; this sweep found the same shape in ~90 files and fixes all of it on top of the `CompositeKey.FromURLSegment` / `FromEntityRecord` / `ToCompactURLSegment` primitives introduced with that fix.

  **What changed, by kind**
  - **Literal `ID` key construction** (`{ FieldName: 'ID', Value: x }`, `LoadFromSingleKeyValuePair('ID', …)`, `FromKeyValuePair('ID', …)`) — ~135 sites. Where the entity is a literal MJ core entity the key is now `CompositeKey.FromID(x)`, the one sanctioned way to say "this entity's key is `ID`". Where the entity is a variable (an event's `EntityName`, an `entityInfo`, a configured entity) the key is `CompositeKey.FromURLSegment(entityInfo, recordId)`, which reads a bare value or a `F1|v1||F2|v2` segment against the entity's real primary key(s).
  - **`PrimaryKeys[0]` → `FirstPrimaryKey`** — 39 sites. Same semantics, a named accessor the gate can track. IS-A shared-key and keyset uses are annotated `// first-pk-ok`.
  - **Real defects fixed** (arbitrary entity keyed as `ID`): Mobile app record load/edit/offline sync; the generic form overlay; the ERD "open record" path; version-history label/diff/micro-view links (which stripped `ID|` off a stored key and re-wrapped the value as `ID`); `RestoreEngine` and `buildPrimaryKeyForLoad`; the Apollo enrichment connector (six `GetEntityObject(configuredEntity, FromID(record.ID))` calls); geocoding record reload; List Detail record-open (composite keys now open instead of showing a notice); `EmbeddedRecord`; `DatabaseReferenceScanner`; hardcoded `ID` filters on a variable entity in Data Explorer's record load, Predictive Studio's label lookup, the realtime-widget visitor identity lookup, `DuplicateRecordDetector.LoadRecordsByListID`, and MetadataSync's `@lookup` GUID conversion.
  - **REST API**: `EntityCRUDHandler` / `RESTEndpointHandler` built the key from the `:id` segment for single-column keys only and threw "Composite primary keys are not supported". Both now accept a bare value or a URL-encoded `Field1|Value1||Field2|Value2` segment. Single-column behavior is unchanged.
  - **One serializer instead of eight**: `ListOperations.serializeRecordId`, `list-set-operations.serializeRecordId`, RecordSetProcessor's `serializeRecordId`, `GetListRecordsAction`'s inline copy, `MJListDetailEntityExtended.BuildRecordID` / `GetCompositeKey`, `record.util.buildCompositeKey`, `VersionHistory.buildCompositeKeyFromRecord` and `ChangeDetector.buildDeleteItem` all delegate to `CompositeKey.FromEntityRecord(...).ToCompactURLSegment()` / `FromURLSegment(...)`. Output is byte-identical for single-column keys.

  **`FirstPrimaryKey` triage** — every one of the ~390 `FirstPrimaryKey` / `FromID` uses in the repo was read in context and either rewritten or annotated with a reason (154 annotations). Real defects found and fixed along the way, all of the shape "first key column used as the whole key" on an entity that can be composite-keyed:
  - **Data providers**: the deterministic `ORDER BY` fallback for row-limited queries ordered by the first key column only, leaving composite-key pages in undefined order; it now orders by every key column. Saved-view run logging / exclusion and the `{%UserView%}` template subquery, whose persisted `RecordID` cannot hold a composite key, now refuse loudly instead of excluding wrong rows. The dependency-link subquery now predicates on the full key. Single-column SQL is byte-identical.
  - **CodeGen**: generated cascade delete/update procs bound the child FK to `@<firstPK>` regardless of which parent key column the FK references; a composite key containing an identity column dropped the other key columns from the generated INSERT (both providers); the PostgreSQL JSON-arg `spCreate` inserted only the first key column; the generated join-grid/timeline filters and the GraphQL audit-log `RecordID` truncated composite keys. Single-key generator output verified byte-identical against `HEAD` (168 shapes).
  - **Smart cache** (`ProviderBase` differential merge): keyed rows on the first PK, so composite-key deletes never applied and rows sharing the first column collapsed.
  - **Integration push sync**: composed record identity from the first key column while the record map stores all columns joined, so every already-synced composite-key row was re-created externally as a duplicate on each full push; the changed-record path silently dropped rows.
  - **Scheduled geocoding orphan cleanup** (destructive): compared a cast of the first key column to a `RecordID` holding all columns, so every geocode row for a composite-key entity was deleted on each run.
  - **Lists**: list membership, export and add-record paths filtered on the first key column and wrote only its value into `ListDetail.RecordID`; Explorer "open record" paths on user-selected entities, duplicate detection, omnibar record search, Data Explorer deep links, the sharing center revoke, recent-access, tree dropdowns, the mobile app's record ids and offline queue.
  - **AI**: duplicate detection, vector sync record ids, Predictive Studio list scope and write-back; the Recommendations engine also wrote a record id into `SourceEntityID` (an FK to Entities) and never set `SourceEntityRecordID`.
  - **Apollo enrichment**: `Accounts` (a customer entity) loaded by literal `ID`; the contacts path read its key off an entity that had never been loaded.
  - Every `entityInfo.FirstPrimaryKey?.Name ?? 'ID'` fallback is gone; where the entity can be missing the code now fails loudly instead of inventing `ID`.

  **The gate** — `packages/MJCore/src/__tests__/PrimaryKeyCompliance.test.ts`, modelled on `MultiProviderCompliance` / `UUIDCompliance`:
  1. _Strict_: a key built with a literal `ID` field name. Marker `// pk-literal-ok: <reason>`.
  2. _Strict_: `PrimaryKeys[0]` / `PrimaryKeys.at(0)`.
  3. _Strict_: `FirstPrimaryKey` and `CompositeKey.FromID(`. These are legitimate only where MJ is single-column by design (foreign-key targets, keyset `ORDER BY` / `AfterKey`, IS-A shared keys, core entities), so every use must be self-evidently on a core entity or say why: `FromID` is exempt when a `'MJ: …'` entity literal is on the same line or within 8 lines above (the `GetEntityObject` / `OpenEntityRecord` naming the core entity); everything else carries `// first-pk-ok: <reason>` on the same line, reason mandatory.
  4. _Strict_: an `ID = …` / `ID IN (…)` `ExtraFilter` or `Fields: ['ID']` within eight lines of an `EntityName:` that is a variable rather than a string literal or ALL_CAPS constant. Marker `// pk-filter-ok: <reason>`.

  Generated code, tests, `dist/`, and the `TestingFramework` / `UnitTesting` packages are not scanned. The rule is written up in `.claude/rules/data-access.md` § "Primary keys: never assume a column named ID". There is no baseline file: all four gates are strict.

  No public signatures change; every edit is additive or a same-shape substitution, so this is `patch` throughout.

- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [489aecd]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
- Updated dependencies [eb962a1]
- Updated dependencies [8d880cc]
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
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.6
  - @memberjunction/sql-dialect@6.1.0-edge.6
  - @memberjunction/encryption@6.1.0-edge.6

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
- Updated dependencies [4eb87c5]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/sql-dialect@6.1.0-edge.5
  - @memberjunction/encryption@6.1.0-edge.5

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
  - @memberjunction/sql-dialect@6.1.0-edge.4
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.4
  - @memberjunction/encryption@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

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
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.3
  - @memberjunction/sql-dialect@6.1.0-edge.3
  - @memberjunction/encryption@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [d8adda1]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.2
  - @memberjunction/encryption@6.1.0-edge.2
  - @memberjunction/sql-dialect@6.1.0-edge.2

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
  - @memberjunction/encryption@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1
  - @memberjunction/sql-dialect@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

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
  - @memberjunction/encryption@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0
  - @memberjunction/sql-dialect@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/encryption@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/sqlserver-dataprovider@6.0.0
  - @memberjunction/global@6.0.0
  - @memberjunction/sql-dialect@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/encryption@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/sqlserver-dataprovider@5.51.0
  - @memberjunction/global@5.51.0
  - @memberjunction/sql-dialect@5.51.0

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
  - @memberjunction/encryption@5.50.0
  - @memberjunction/sqlserver-dataprovider@5.50.0
  - @memberjunction/global@5.50.0
  - @memberjunction/sql-dialect@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
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
  - @memberjunction/sqlserver-dataprovider@5.49.0
  - @memberjunction/encryption@5.49.0
  - @memberjunction/sql-dialect@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/sqlserver-dataprovider@5.48.0
  - @memberjunction/encryption@5.48.0
  - @memberjunction/global@5.48.0
  - @memberjunction/sql-dialect@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
- Updated dependencies [06a1e44]
- Updated dependencies [31da520]
- Updated dependencies [936a286]
  - @memberjunction/core@5.47.0
  - @memberjunction/sql-dialect@5.47.0
  - @memberjunction/sqlserver-dataprovider@5.47.0
  - @memberjunction/encryption@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/encryption@5.46.0
  - @memberjunction/sqlserver-dataprovider@5.46.0
  - @memberjunction/global@5.46.0
  - @memberjunction/sql-dialect@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/sqlserver-dataprovider@5.45.1
- @memberjunction/encryption@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1
- @memberjunction/sql-dialect@5.45.1

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
  - @memberjunction/encryption@5.45.0
  - @memberjunction/sqlserver-dataprovider@5.45.0
  - @memberjunction/sql-dialect@5.45.0

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
  - @memberjunction/sqlserver-dataprovider@5.44.0
  - @memberjunction/encryption@5.44.0
  - @memberjunction/sql-dialect@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [b98366b]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
- Updated dependencies [4e05350]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/sql-dialect@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/sqlserver-dataprovider@5.43.0
  - @memberjunction/encryption@5.43.0

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
  - @memberjunction/encryption@5.42.0
  - @memberjunction/sql-dialect@5.42.0

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
  - @memberjunction/encryption@5.41.0
  - @memberjunction/sqlserver-dataprovider@5.41.0
  - @memberjunction/global@5.41.0
  - @memberjunction/sql-dialect@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/sqlserver-dataprovider@5.40.2
- @memberjunction/encryption@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2
- @memberjunction/sql-dialect@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/encryption@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/sqlserver-dataprovider@5.40.1
  - @memberjunction/global@5.40.1
  - @memberjunction/sql-dialect@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/sqlserver-dataprovider@5.40.0
  - @memberjunction/encryption@5.40.0
  - @memberjunction/global@5.40.0
  - @memberjunction/sql-dialect@5.40.0

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
  - @memberjunction/encryption@5.39.0
  - @memberjunction/sql-dialect@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/sql-dialect@5.38.0
  - @memberjunction/sqlserver-dataprovider@5.38.0
  - @memberjunction/encryption@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/sqlserver-dataprovider@5.37.0
  - @memberjunction/encryption@5.37.0
  - @memberjunction/global@5.37.0
  - @memberjunction/sql-dialect@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/encryption@5.36.0
  - @memberjunction/sqlserver-dataprovider@5.36.0
  - @memberjunction/global@5.36.0
  - @memberjunction/sql-dialect@5.36.0

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
  - @memberjunction/encryption@5.35.0
  - @memberjunction/sql-dialect@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/encryption@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/sqlserver-dataprovider@5.34.1
  - @memberjunction/global@5.34.1
  - @memberjunction/sql-dialect@5.34.1

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
  - @memberjunction/encryption@5.34.0
  - @memberjunction/sql-dialect@5.34.0
  - @memberjunction/sqlserver-dataprovider@5.34.0
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
- Updated dependencies [7add405]
  - @memberjunction/core@5.33.0
  - @memberjunction/sql-dialect@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/sqlserver-dataprovider@5.33.0
  - @memberjunction/encryption@5.33.0
  - @memberjunction/core-entities@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/encryption@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/sqlserver-dataprovider@5.32.0
  - @memberjunction/global@5.32.0
  - @memberjunction/sql-dialect@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [9457655]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/encryption@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/sql-dialect@5.31.0
  - @memberjunction/sqlserver-dataprovider@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/encryption@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/sql-dialect@5.30.1
- @memberjunction/sqlserver-dataprovider@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
- Updated dependencies [216ddc3]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/encryption@5.30.0
  - @memberjunction/sqlserver-dataprovider@5.30.0
  - @memberjunction/global@5.30.0
  - @memberjunction/sql-dialect@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/sql-dialect@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/encryption@5.29.0
  - @memberjunction/sqlserver-dataprovider@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/encryption@5.28.0
  - @memberjunction/sqlserver-dataprovider@5.28.0
  - @memberjunction/global@5.28.0
  - @memberjunction/sql-dialect@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/encryption@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/sqlserver-dataprovider@5.27.1
  - @memberjunction/sql-dialect@5.27.1

## 5.27.0

### Patch Changes

- 1d9aa53: Fix double-encryption of fields with Encrypt=1 during External Change Detection replay. buildEntityFromRow now decrypts $ENC$ values before loading into the replay entity so Save() re-encrypts plaintext instead of wrapping already-encrypted ciphertext. Adds a new @memberjunction/encryption dependency (was already transitively available). Fixes #2367.
  - @memberjunction/sqlserver-dataprovider@5.27.0
  - @memberjunction/encryption@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/core-entities@5.27.0
  - @memberjunction/global@5.27.0
  - @memberjunction/sql-dialect@5.27.0

## 5.26.0

### Minor Changes

- a1002f4: - Entities now expose AllowCaching as the runtime source of truth for

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/sqlserver-dataprovider@5.26.0
  - @memberjunction/global@5.26.0
  - @memberjunction/sql-dialect@5.26.0

## 5.25.0

### Patch Changes

- fc8cd52: Autotagging pipeline with run tracking, retry, and tag merge/delete; taxonomy server-side SQL aggregates; vector sync credential engine integration; search resolver and organic key support; unit test fixes across geo-core, ai-vector-sync, MJServer, and UUID compliance.
- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/sqlserver-dataprovider@5.25.0
  - @memberjunction/global@5.25.0
  - @memberjunction/sql-dialect@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/sqlserver-dataprovider@5.24.0
  - @memberjunction/global@5.24.0
  - @memberjunction/sql-dialect@5.24.0

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
  - @memberjunction/sql-dialect@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/sqlserver-dataprovider@5.22.0
  - @memberjunction/sql-dialect@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/sqlserver-dataprovider@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/global@5.21.0
  - @memberjunction/sql-dialect@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/sqlserver-dataprovider@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/global@5.20.0
  - @memberjunction/sql-dialect@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/sql-dialect@5.19.0
- @memberjunction/sqlserver-dataprovider@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/sqlserver-dataprovider@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/core-entities@5.18.0
- @memberjunction/global@5.18.0
- @memberjunction/sql-dialect@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/sqlserver-dataprovider@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/global@5.17.0
  - @memberjunction/sql-dialect@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/sqlserver-dataprovider@5.16.0
  - @memberjunction/global@5.16.0
  - @memberjunction/sql-dialect@5.16.0

## 5.15.0

### Patch Changes

- 2488c5c: Fix External Change Detection OOM crashes by replacing unbounded OR-clause record fetching with paginated detection queries (ot.\* + ORDER BY), interleaved per-entity detect-replay to bound memory, and dynamic concurrency based on table row counts. Adds production safety mechanisms: circuit breaker, cooldown pause, and heap guard.
- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/sqlserver-dataprovider@5.15.0
  - @memberjunction/global@5.15.0
  - @memberjunction/sql-dialect@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/sqlserver-dataprovider@5.14.0
  - @memberjunction/global@5.14.0
  - @memberjunction/sql-dialect@5.14.0

## 5.13.0

### Patch Changes

- 9474e4a: Fix transaction race condition in ExternalChangeDetection concurrent replay by creating per-save provider instances with independent transaction state, sharing the singleton's connection pool
- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/sqlserver-dataprovider@5.13.0
  - @memberjunction/sql-dialect@5.13.0

## 5.12.0

### Patch Changes

- 7def002: Fix ExternalChangeDetection unquoted string IDs and log spam, add /healthcheck endpoint before auth middleware, return TechnicalDescription in CreateQuery/UpdateQuery mutations, and improve MJCLI config validation errors with env var hints
- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/sqlserver-dataprovider@5.12.0
  - @memberjunction/global@5.12.0
  - @memberjunction/sql-dialect@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/sqlserver-dataprovider@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/global@5.11.0
  - @memberjunction/sql-dialect@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/sql-dialect@5.10.1
- @memberjunction/sqlserver-dataprovider@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/sqlserver-dataprovider@5.10.0
  - @memberjunction/global@5.10.0
  - @memberjunction/sql-dialect@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/sqlserver-dataprovider@5.9.0
  - @memberjunction/sql-dialect@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/sqlserver-dataprovider@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/global@5.8.0
  - @memberjunction/sql-dialect@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/sqlserver-dataprovider@5.7.0
  - @memberjunction/global@5.7.0
  - @memberjunction/sql-dialect@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/sqlserver-dataprovider@5.6.0
  - @memberjunction/global@5.6.0
  - @memberjunction/sql-dialect@5.6.0

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

## 5.4.1

### Patch Changes

- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1
- @memberjunction/sqlserver-dataprovider@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/sqlserver-dataprovider@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1
- @memberjunction/sqlserver-dataprovider@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/sqlserver-dataprovider@5.3.0
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
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/sqlserver-dataprovider@5.1.0

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

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/sqlserver-dataprovider@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1
- @memberjunction/sqlserver-dataprovider@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/sqlserver-dataprovider@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0
- @memberjunction/sqlserver-dataprovider@4.2.0

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
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/sqlserver-dataprovider@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [3a71e4e]
- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/sqlserver-dataprovider@3.4.0
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/sqlserver-dataprovider@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/sqlserver-dataprovider@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/global@3.1.1
- @memberjunction/sqlserver-dataprovider@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/global@3.0.0
- @memberjunction/sqlserver-dataprovider@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/sqlserver-dataprovider@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/sqlserver-dataprovider@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/sqlserver-dataprovider@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/core@2.130.1
- @memberjunction/core-entities@2.130.1
- @memberjunction/global@2.130.1
- @memberjunction/sqlserver-dataprovider@2.130.1

## 2.130.0

### Patch Changes

- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/sqlserver-dataprovider@2.130.0
  - @memberjunction/core@2.130.0
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

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/sqlserver-dataprovider@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/sqlserver-dataprovider@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/core@2.126.1
- @memberjunction/core-entities@2.126.1
- @memberjunction/global@2.126.1
- @memberjunction/sqlserver-dataprovider@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [703221e]
  - @memberjunction/core@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/sqlserver-dataprovider@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/sqlserver-dataprovider@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/sqlserver-dataprovider@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1
- @memberjunction/sqlserver-dataprovider@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/sqlserver-dataprovider@2.123.0
- @memberjunction/core@2.123.0
- @memberjunction/core-entities@2.123.0
- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- Updated dependencies [81f0c44]
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/sqlserver-dataprovider@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/core@2.122.1
- @memberjunction/core-entities@2.122.1
- @memberjunction/global@2.122.1
- @memberjunction/sqlserver-dataprovider@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/sqlserver-dataprovider@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
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
  - @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- Updated dependencies [7dd7cca]
  - @memberjunction/core@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/sqlserver-dataprovider@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Patch Changes

- Updated dependencies [264c57a]
- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/sqlserver-dataprovider@2.118.0
  - @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [8c092ec]
  - @memberjunction/core@2.117.0
  - @memberjunction/core-entities@2.117.0
  - @memberjunction/sqlserver-dataprovider@2.117.0
  - @memberjunction/global@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [81bb7a4]
- Updated dependencies [a8d5592]
  - @memberjunction/core@2.116.0
  - @memberjunction/global@2.116.0
  - @memberjunction/core-entities@2.116.0
  - @memberjunction/sqlserver-dataprovider@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/sqlserver-dataprovider@2.115.0
- @memberjunction/core@2.115.0
- @memberjunction/core-entities@2.115.0
- @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/core@2.114.0
- @memberjunction/core-entities@2.114.0
- @memberjunction/global@2.114.0
- @memberjunction/sqlserver-dataprovider@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/sqlserver-dataprovider@2.113.2
  - @memberjunction/global@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [e237ca9]
- Updated dependencies [c126b59]
  - @memberjunction/sqlserver-dataprovider@2.112.0
  - @memberjunction/global@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/core@2.110.1
- @memberjunction/core-entities@2.110.1
- @memberjunction/global@2.110.1
- @memberjunction/sqlserver-dataprovider@2.110.1

## 2.110.0

### Patch Changes

- Updated dependencies [02d72ff]
- Updated dependencies [d2d7ab9]
- Updated dependencies [c8b9aca]
  - @memberjunction/core-entities@2.110.0
  - @memberjunction/sqlserver-dataprovider@2.110.0
  - @memberjunction/core@2.110.0
  - @memberjunction/global@2.110.0

## 2.109.0

### Patch Changes

- Updated dependencies [6e45c17]
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/sqlserver-dataprovider@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0

## 2.108.0

### Patch Changes

- Updated dependencies [656d86c]
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/sqlserver-dataprovider@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/core@2.107.0
- @memberjunction/core-entities@2.107.0
- @memberjunction/global@2.107.0
- @memberjunction/sqlserver-dataprovider@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/core@2.106.0
- @memberjunction/core-entities@2.106.0
- @memberjunction/global@2.106.0
- @memberjunction/sqlserver-dataprovider@2.106.0

## 2.105.0

### Patch Changes

- Updated dependencies [4807f35]
- Updated dependencies [9b67e0c]
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/sqlserver-dataprovider@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Patch Changes

- Updated dependencies [2ff5428]
- Updated dependencies [9ad6353]
- Updated dependencies [6e7f14a]
  - @memberjunction/global@2.104.0
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
  - @memberjunction/core-entities@2.103.0
  - @memberjunction/global@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/core-entities@2.100.3
- @memberjunction/sqlserver-dataprovider@2.100.3
- @memberjunction/core@2.100.3
- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/core@2.100.2
- @memberjunction/core-entities@2.100.2
- @memberjunction/global@2.100.2
- @memberjunction/sqlserver-dataprovider@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/core@2.100.1
- @memberjunction/core-entities@2.100.1
- @memberjunction/global@2.100.1
- @memberjunction/sqlserver-dataprovider@2.100.1

## 2.100.0

### Patch Changes

- Updated dependencies [5f76e3a]
- Updated dependencies [ffc2c1a]
  - @memberjunction/core@2.100.0
  - @memberjunction/core-entities@2.100.0
  - @memberjunction/sqlserver-dataprovider@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- Updated dependencies [eb7677d]
- Updated dependencies [8bbb0a9]
  - @memberjunction/core-entities@2.99.0
  - @memberjunction/core@2.99.0
  - @memberjunction/sqlserver-dataprovider@2.99.0
  - @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/core@2.98.0
- @memberjunction/core-entities@2.98.0
- @memberjunction/global@2.98.0
- @memberjunction/sqlserver-dataprovider@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/core-entities@2.97.0
- @memberjunction/sqlserver-dataprovider@2.97.0
- @memberjunction/core@2.97.0
- @memberjunction/global@2.97.0

## 2.96.0

### Patch Changes

- Updated dependencies [01dcfde]
  - @memberjunction/core@2.96.0
  - @memberjunction/core-entities@2.96.0
  - @memberjunction/sqlserver-dataprovider@2.96.0
  - @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- Updated dependencies [a54c014]
  - @memberjunction/core@2.95.0
  - @memberjunction/core-entities@2.95.0
  - @memberjunction/sqlserver-dataprovider@2.95.0
  - @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/core-entities@2.94.0
- @memberjunction/sqlserver-dataprovider@2.94.0
- @memberjunction/core@2.94.0
- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- Updated dependencies [f8757aa]
- Updated dependencies [103e4a9]
- Updated dependencies [7f465b5]
  - @memberjunction/core@2.93.0
  - @memberjunction/sqlserver-dataprovider@2.93.0
  - @memberjunction/core-entities@2.93.0
  - @memberjunction/global@2.93.0

## 2.92.0

### Patch Changes

- Updated dependencies [8fb03df]
- Updated dependencies [5817bac]
  - @memberjunction/core@2.92.0
  - @memberjunction/sqlserver-dataprovider@2.92.0
  - @memberjunction/core-entities@2.92.0
  - @memberjunction/global@2.92.0

## 2.91.0

### Patch Changes

- Updated dependencies [f703033]
- Updated dependencies [6476d74]
  - @memberjunction/core@2.91.0
  - @memberjunction/core-entities@2.91.0
  - @memberjunction/sqlserver-dataprovider@2.91.0
  - @memberjunction/global@2.91.0

## 2.90.0

### Patch Changes

- Updated dependencies [146ebcc]
- Updated dependencies [d5d26d7]
- Updated dependencies [1e7eb76]
  - @memberjunction/core@2.90.0
  - @memberjunction/core-entities@2.90.0
  - @memberjunction/sqlserver-dataprovider@2.90.0
  - @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- Updated dependencies [d1911ed]
- Updated dependencies [34d456e]
  - @memberjunction/core-entities@2.89.0
  - @memberjunction/sqlserver-dataprovider@2.89.0
  - @memberjunction/core@2.89.0
  - @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- Updated dependencies [56257ed]
- Updated dependencies [df4031f]
  - @memberjunction/sqlserver-dataprovider@2.88.0
  - @memberjunction/core-entities@2.88.0
  - @memberjunction/core@2.88.0
  - @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- Updated dependencies [58a00df]
  - @memberjunction/core@2.87.0
  - @memberjunction/core-entities@2.87.0
  - @memberjunction/sqlserver-dataprovider@2.87.0
  - @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- Updated dependencies [7dd2409]
  - @memberjunction/core-entities@2.86.0
  - @memberjunction/sqlserver-dataprovider@2.86.0
  - @memberjunction/core@2.86.0
  - @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- Updated dependencies [747455a]
  - @memberjunction/core-entities@2.85.0
  - @memberjunction/sqlserver-dataprovider@2.85.0
  - @memberjunction/core@2.85.0
  - @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [0b9d691]
  - @memberjunction/core@2.84.0
  - @memberjunction/sqlserver-dataprovider@2.84.0
  - @memberjunction/core-entities@2.84.0
  - @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- Updated dependencies [e2e0415]
  - @memberjunction/core@2.83.0
  - @memberjunction/core-entities@2.83.0
  - @memberjunction/sqlserver-dataprovider@2.83.0
  - @memberjunction/global@2.83.0

## 2.82.0

### Patch Changes

- Updated dependencies [2186d7b]
- Updated dependencies [975e8d1]
  - @memberjunction/core-entities@2.82.0
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
  - @memberjunction/sqlserver-dataprovider@2.81.0
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/core@2.80.1
- @memberjunction/core-entities@2.80.1
- @memberjunction/global@2.80.1
- @memberjunction/sqlserver-dataprovider@2.80.1

## 2.80.0

### Patch Changes

- Updated dependencies [7c5f844]
- Updated dependencies [d03dfae]
  - @memberjunction/core@2.80.0
  - @memberjunction/core-entities@2.80.0
  - @memberjunction/sqlserver-dataprovider@2.80.0
  - @memberjunction/global@2.80.0

## 2.79.0

### Patch Changes

- Updated dependencies [4bf2634]
- Updated dependencies [907e73f]
  - @memberjunction/core-entities@2.79.0
  - @memberjunction/global@2.79.0
  - @memberjunction/sqlserver-dataprovider@2.79.0
  - @memberjunction/core@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [06088e5]
  - @memberjunction/core-entities@2.78.0
  - @memberjunction/sqlserver-dataprovider@2.78.0
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
  - @memberjunction/core-entities@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- Updated dependencies [4b27b3c]
- Updated dependencies [7dabb22]
- Updated dependencies [ffda243]
  - @memberjunction/core-entities@2.76.0
  - @memberjunction/core@2.76.0
  - @memberjunction/sqlserver-dataprovider@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- @memberjunction/sqlserver-dataprovider@2.75.0
- @memberjunction/core@2.75.0
- @memberjunction/core-entities@2.75.0
- @memberjunction/global@2.75.0

## 2.74.0

### Patch Changes

- Updated dependencies [b70301e]
- Updated dependencies [d316670]
  - @memberjunction/core-entities@2.74.0
  - @memberjunction/core@2.74.0
  - @memberjunction/sqlserver-dataprovider@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- Updated dependencies [e99336f]
  - @memberjunction/core-entities@2.73.0
  - @memberjunction/sqlserver-dataprovider@2.73.0
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- Updated dependencies [636b6ee]
  - @memberjunction/core-entities@2.72.0
  - @memberjunction/sqlserver-dataprovider@2.72.0
  - @memberjunction/core@2.72.0
  - @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/core-entities@2.71.0
  - @memberjunction/sqlserver-dataprovider@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/core-entities@2.70.0
  - @memberjunction/sqlserver-dataprovider@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/core-entities@2.69.1
  - @memberjunction/sqlserver-dataprovider@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0
  - @memberjunction/core-entities@2.69.0
  - @memberjunction/sqlserver-dataprovider@2.69.0

## 2.68.0

### Patch Changes

- Updated dependencies [a6b43d0]
- Updated dependencies [b10b7e6]
  - @memberjunction/sqlserver-dataprovider@2.68.0
  - @memberjunction/core@2.68.0
  - @memberjunction/core-entities@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- Updated dependencies [1fbfc26]
  - @memberjunction/sqlserver-dataprovider@2.67.0
  - @memberjunction/core@2.67.0
  - @memberjunction/core-entities@2.67.0
  - @memberjunction/global@2.67.0

## 2.66.0

### Patch Changes

- @memberjunction/sqlserver-dataprovider@2.66.0
- @memberjunction/core@2.66.0
- @memberjunction/core-entities@2.66.0
- @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/global@2.65.0
  - @memberjunction/sqlserver-dataprovider@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/core@2.65.0

## 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/sqlserver-dataprovider@2.64.0
  - @memberjunction/core@2.64.0
  - @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1
  - @memberjunction/sqlserver-dataprovider@2.63.1

## 2.63.0

### Patch Changes

- Updated dependencies [28e8a85]
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/sqlserver-dataprovider@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/sqlserver-dataprovider@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/sqlserver-dataprovider@2.61.0
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
  - @memberjunction/sqlserver-dataprovider@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/core@2.59.0
- @memberjunction/core-entities@2.59.0
- @memberjunction/global@2.59.0
- @memberjunction/sqlserver-dataprovider@2.59.0

## 2.58.0

### Patch Changes

- Updated dependencies [def26fe]
  - @memberjunction/core@2.58.0
  - @memberjunction/sqlserver-dataprovider@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/global@2.57.0
  - @memberjunction/sqlserver-dataprovider@2.57.0

## 2.56.0

### Patch Changes

- Updated dependencies [bf24cae]
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/sqlserver-dataprovider@2.56.0
  - @memberjunction/core@2.56.0
  - @memberjunction/global@2.56.0

## 2.55.0

### Patch Changes

- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
  - @memberjunction/sqlserver-dataprovider@2.55.0
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- Updated dependencies [20f424d]
- Updated dependencies [dfca664]
- Updated dependencies [1273b07]
  - @memberjunction/core@2.54.0
  - @memberjunction/sqlserver-dataprovider@2.54.0
  - @memberjunction/core-entities@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- Updated dependencies [bddc4ea]
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/sqlserver-dataprovider@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Patch Changes

- Updated dependencies [e926106]
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/sqlserver-dataprovider@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Patch Changes

- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/sqlserver-dataprovider@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/global@2.50.0
- @memberjunction/sqlserver-dataprovider@2.50.0

## 2.49.0

### Minor Changes

- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [2f974e2]
- Updated dependencies [cc52ced]
- Updated dependencies [ca3365f]
- Updated dependencies [db17ed7]
- Updated dependencies [62cf1b6]
  - @memberjunction/core-entities@2.49.0
  - @memberjunction/core@2.49.0
  - @memberjunction/global@2.49.0
  - @memberjunction/sqlserver-dataprovider@2.49.0

## 2.48.0

### Patch Changes

- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
  - @memberjunction/core@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/sqlserver-dataprovider@2.48.0
  - @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- Updated dependencies [3f31192]
  - @memberjunction/sqlserver-dataprovider@2.47.0
  - @memberjunction/core@2.47.0
  - @memberjunction/core-entities@2.47.0
  - @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/core@2.46.0
- @memberjunction/core-entities@2.46.0
- @memberjunction/global@2.46.0
- @memberjunction/sqlserver-dataprovider@2.46.0

## 2.45.0

### Patch Changes

- Updated dependencies [556ee8d]
  - @memberjunction/core-entities@2.45.0
  - @memberjunction/sqlserver-dataprovider@2.45.0
  - @memberjunction/core@2.45.0
  - @memberjunction/global@2.45.0

## 2.44.0

### Patch Changes

- Updated dependencies [fbc30dc]
- Updated dependencies [99b27c5]
- Updated dependencies [091c5f6]
  - @memberjunction/core@2.44.0
  - @memberjunction/core-entities@2.44.0
  - @memberjunction/sqlserver-dataprovider@2.44.0
  - @memberjunction/global@2.44.0

## 2.43.0

### Patch Changes

- Updated dependencies [1629c04]
  - @memberjunction/core@2.43.0
  - @memberjunction/core-entities@2.43.0
  - @memberjunction/sqlserver-dataprovider@2.43.0
  - @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/core@2.42.1
- @memberjunction/core-entities@2.42.1
- @memberjunction/global@2.42.1
- @memberjunction/sqlserver-dataprovider@2.42.1

## 2.42.0

### Patch Changes

- Updated dependencies [5c4ff39]
  - @memberjunction/sqlserver-dataprovider@2.42.0
  - @memberjunction/core@2.42.0
  - @memberjunction/core-entities@2.42.0
  - @memberjunction/global@2.42.0

## 2.41.0

### Patch Changes

- Updated dependencies [3be3f71]
- Updated dependencies [7e0523d]
  - @memberjunction/core@2.41.0
  - @memberjunction/sqlserver-dataprovider@2.41.0
  - @memberjunction/core-entities@2.41.0
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- @memberjunction/sqlserver-dataprovider@2.40.0
- @memberjunction/core@2.40.0
- @memberjunction/core-entities@2.40.0
- @memberjunction/global@2.40.0

## 2.39.0

### Patch Changes

- Updated dependencies [c9ccc36]
  - @memberjunction/core-entities@2.39.0
  - @memberjunction/sqlserver-dataprovider@2.39.0
  - @memberjunction/core@2.39.0
  - @memberjunction/global@2.39.0

## 2.38.0

### Patch Changes

- Updated dependencies [c835ded]
  - @memberjunction/core-entities@2.38.0
  - @memberjunction/sqlserver-dataprovider@2.38.0
  - @memberjunction/core@2.38.0
  - @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/core@2.37.1
- @memberjunction/core-entities@2.37.1
- @memberjunction/global@2.37.1
- @memberjunction/sqlserver-dataprovider@2.37.1

## 2.37.0

### Patch Changes

- Updated dependencies [1418b71]
  - @memberjunction/core-entities@2.37.0
  - @memberjunction/sqlserver-dataprovider@2.37.0
  - @memberjunction/core@2.37.0
  - @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- Updated dependencies [9d709e2]
  - @memberjunction/core@2.36.1
  - @memberjunction/sqlserver-dataprovider@2.36.1
  - @memberjunction/core-entities@2.36.1
  - @memberjunction/global@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
- Updated dependencies [160f24f]
  - @memberjunction/sqlserver-dataprovider@2.36.0
  - @memberjunction/core-entities@2.36.0
  - @memberjunction/global@2.36.0
  - @memberjunction/core@2.36.0

## 2.35.1

### Patch Changes

- Updated dependencies [3e7ec64]
  - @memberjunction/core@2.35.1
  - @memberjunction/sqlserver-dataprovider@2.35.1
  - @memberjunction/core-entities@2.35.1
  - @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/sqlserver-dataprovider@2.35.0
- @memberjunction/core@2.35.0
- @memberjunction/core-entities@2.35.0
- @memberjunction/global@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/core@2.34.2
- @memberjunction/core-entities@2.34.2
- @memberjunction/global@2.34.2
- @memberjunction/sqlserver-dataprovider@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/core@2.34.1
- @memberjunction/core-entities@2.34.1
- @memberjunction/global@2.34.1
- @memberjunction/sqlserver-dataprovider@2.34.1

## 2.34.0

### Patch Changes

- Updated dependencies [e60f326]
- Updated dependencies [785f06a]
  - @memberjunction/core-entities@2.34.0
  - @memberjunction/core@2.34.0
  - @memberjunction/sqlserver-dataprovider@2.34.0
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- Updated dependencies [02d7391]
  - @memberjunction/sqlserver-dataprovider@2.33.0
  - @memberjunction/core@2.33.0
  - @memberjunction/core-entities@2.33.0
  - @memberjunction/global@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/core@2.32.2
- @memberjunction/core-entities@2.32.2
- @memberjunction/global@2.32.2
- @memberjunction/sqlserver-dataprovider@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/core@2.32.1
- @memberjunction/core-entities@2.32.1
- @memberjunction/global@2.32.1
- @memberjunction/sqlserver-dataprovider@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/core@2.32.0
- @memberjunction/core-entities@2.32.0
- @memberjunction/global@2.32.0
- @memberjunction/sqlserver-dataprovider@2.32.0

## 2.31.0

### Patch Changes

- @memberjunction/sqlserver-dataprovider@2.31.0
- @memberjunction/core@2.31.0
- @memberjunction/core-entities@2.31.0
- @memberjunction/global@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [a3ab749]
  - @memberjunction/core-entities@2.30.0
  - @memberjunction/global@2.30.0
  - @memberjunction/sqlserver-dataprovider@2.30.0
  - @memberjunction/core@2.30.0

## 2.29.2

### Patch Changes

- Updated dependencies [07bde92]
- Updated dependencies [64aa7f0]
- Updated dependencies [69c3505]
  - @memberjunction/core@2.29.2
  - @memberjunction/core-entities@2.29.2
  - @memberjunction/sqlserver-dataprovider@2.29.2
  - @memberjunction/global@2.29.2

## 2.28.0

### Patch Changes

- Updated dependencies [8259093]
  - @memberjunction/core@2.28.0
  - @memberjunction/core-entities@2.28.0
  - @memberjunction/sqlserver-dataprovider@2.28.0
  - @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/core@2.27.1
- @memberjunction/core-entities@2.27.1
- @memberjunction/global@2.27.1
- @memberjunction/sqlserver-dataprovider@2.27.1

## 2.27.0

### Patch Changes

- Updated dependencies [54ab868]
- Updated dependencies [5a81451]
  - @memberjunction/core@2.27.0
  - @memberjunction/core-entities@2.27.0
  - @memberjunction/sqlserver-dataprovider@2.27.0
  - @memberjunction/global@2.27.0

## 2.26.1

### Patch Changes

- @memberjunction/core@2.26.1
- @memberjunction/core-entities@2.26.1
- @memberjunction/global@2.26.1
- @memberjunction/sqlserver-dataprovider@2.26.1

## 2.26.0

### Patch Changes

- Updated dependencies [23801c5]
  - @memberjunction/core@2.26.0
  - @memberjunction/sqlserver-dataprovider@2.26.0
  - @memberjunction/core-entities@2.26.0
  - @memberjunction/global@2.26.0

## 2.25.0

### Patch Changes

- Updated dependencies [0647504]
- Updated dependencies [fd07dcd]
- Updated dependencies [26c990d]
- Updated dependencies [824eca2]
- Updated dependencies [86e6d3b]
  - @memberjunction/sqlserver-dataprovider@2.25.0
  - @memberjunction/core@2.25.0
  - @memberjunction/core-entities@2.25.0
  - @memberjunction/global@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/core@2.24.1
- @memberjunction/core-entities@2.24.1
- @memberjunction/global@2.24.1
- @memberjunction/sqlserver-dataprovider@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [9cb85cc]
- Updated dependencies [7c6ff41]
  - @memberjunction/global@2.24.0
  - @memberjunction/core-entities@2.24.0
  - @memberjunction/core@2.24.0
  - @memberjunction/sqlserver-dataprovider@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/core@2.23.2
- @memberjunction/core-entities@2.23.2
- @memberjunction/global@2.23.2
- @memberjunction/sqlserver-dataprovider@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/core@2.23.1
- @memberjunction/core-entities@2.23.1
- @memberjunction/global@2.23.1
- @memberjunction/sqlserver-dataprovider@2.23.1

## 2.23.0

### Patch Changes

- Updated dependencies [09d3fa9]
- Updated dependencies [38b7507]
  - @memberjunction/sqlserver-dataprovider@2.23.0
  - @memberjunction/global@2.23.0
  - @memberjunction/core@2.23.0
  - @memberjunction/core-entities@2.23.0

## 2.22.2

### Patch Changes

- Updated dependencies [94ebf81]
  - @memberjunction/core@2.22.2
  - @memberjunction/core-entities@2.22.2
  - @memberjunction/sqlserver-dataprovider@2.22.2
  - @memberjunction/global@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/core@2.22.1
- @memberjunction/core-entities@2.22.1
- @memberjunction/global@2.22.1
- @memberjunction/sqlserver-dataprovider@2.22.1

## 2.22.0

### Patch Changes

- Updated dependencies [a598f1a]
- Updated dependencies [9660275]
  - @memberjunction/core@2.22.0
  - @memberjunction/global@2.22.0
  - @memberjunction/core-entities@2.22.0
  - @memberjunction/sqlserver-dataprovider@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.21.0
- Bump @memberjunction/core-entities to v2.21.0
- Bump @memberjunction/global to v2.21.0
- Bump @memberjunction/sqlserver-dataprovider to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

### Patches

- Bump @memberjunction/core to v2.20.3
- Bump @memberjunction/core-entities to v2.20.3
- Bump @memberjunction/global to v2.20.3
- Bump @memberjunction/sqlserver-dataprovider to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Bump @memberjunction/core to v2.20.2
- Bump @memberjunction/core-entities to v2.20.2
- Bump @memberjunction/global to v2.20.2
- Bump @memberjunction/sqlserver-dataprovider to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/core to v2.20.1
- Bump @memberjunction/core-entities to v2.20.1
- Bump @memberjunction/global to v2.20.1
- Bump @memberjunction/sqlserver-dataprovider to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:04 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.20.0
- Bump @memberjunction/core-entities to v2.20.0
- Bump @memberjunction/global to v2.20.0
- Bump @memberjunction/sqlserver-dataprovider to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/core to v2.19.5
- Bump @memberjunction/core-entities to v2.19.5
- Bump @memberjunction/global to v2.19.5
- Bump @memberjunction/sqlserver-dataprovider to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/core to v2.19.4
- Bump @memberjunction/core-entities to v2.19.4
- Bump @memberjunction/global to v2.19.4
- Bump @memberjunction/sqlserver-dataprovider to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/core to v2.19.3
- Bump @memberjunction/core-entities to v2.19.3
- Bump @memberjunction/global to v2.19.3
- Bump @memberjunction/sqlserver-dataprovider to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/core to v2.19.2
- Bump @memberjunction/core-entities to v2.19.2
- Bump @memberjunction/global to v2.19.2
- Bump @memberjunction/sqlserver-dataprovider to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/core to v2.19.1
- Bump @memberjunction/core-entities to v2.19.1
- Bump @memberjunction/global to v2.19.1
- Bump @memberjunction/sqlserver-dataprovider to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:48 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.19.0
- Bump @memberjunction/core-entities to v2.19.0
- Bump @memberjunction/global to v2.19.0
- Bump @memberjunction/sqlserver-dataprovider to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.18.3
- Bump @memberjunction/core-entities to v2.18.3
- Bump @memberjunction/global to v2.18.3
- Bump @memberjunction/sqlserver-dataprovider to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/core to v2.18.2
- Bump @memberjunction/core-entities to v2.18.2
- Bump @memberjunction/global to v2.18.2
- Bump @memberjunction/sqlserver-dataprovider to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/core to v2.18.1
- Bump @memberjunction/core-entities to v2.18.1
- Bump @memberjunction/global to v2.18.1
- Bump @memberjunction/sqlserver-dataprovider to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Bump @memberjunction/core to v2.18.0
- Bump @memberjunction/core-entities to v2.18.0
- Bump @memberjunction/global to v2.18.0
- Bump @memberjunction/sqlserver-dataprovider to v2.18.0

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Bump @memberjunction/core to v2.17.0
- Bump @memberjunction/core-entities to v2.17.0
- Bump @memberjunction/global to v2.17.0
- Bump @memberjunction/sqlserver-dataprovider to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:27 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/core to v2.16.1
- Bump @memberjunction/core-entities to v2.16.1
- Bump @memberjunction/global to v2.16.1
- Bump @memberjunction/sqlserver-dataprovider to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Bump @memberjunction/core to v2.16.0
- Bump @memberjunction/core-entities to v2.16.0
- Bump @memberjunction/global to v2.16.0
- Bump @memberjunction/sqlserver-dataprovider to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:29 GMT

### Patches

- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.15.2
- Bump @memberjunction/core-entities to v2.15.2
- Bump @memberjunction/global to v2.15.2
- Bump @memberjunction/sqlserver-dataprovider to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Bump @memberjunction/core to v2.14.0
- Bump @memberjunction/core-entities to v2.14.0
- Bump @memberjunction/global to v2.14.0
- Bump @memberjunction/sqlserver-dataprovider to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/core to v2.13.4
- Bump @memberjunction/core-entities to v2.13.4
- Bump @memberjunction/global to v2.13.4
- Bump @memberjunction/sqlserver-dataprovider to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:45 GMT

### Patches

- Bump @memberjunction/core to v2.13.3
- Bump @memberjunction/core-entities to v2.13.3
- Bump @memberjunction/global to v2.13.3
- Bump @memberjunction/sqlserver-dataprovider to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/core to v2.13.2
- Bump @memberjunction/core-entities to v2.13.2
- Bump @memberjunction/global to v2.13.2
- Bump @memberjunction/sqlserver-dataprovider to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Bump @memberjunction/core to v2.13.1
- Bump @memberjunction/core-entities to v2.13.1
- Bump @memberjunction/global to v2.13.1
- Bump @memberjunction/sqlserver-dataprovider to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/core to v2.13.0
- Bump @memberjunction/core-entities to v2.13.0
- Bump @memberjunction/global to v2.13.0
- Bump @memberjunction/sqlserver-dataprovider to v2.13.0

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Bump @memberjunction/core to v2.12.0
- Bump @memberjunction/core-entities to v2.12.0
- Bump @memberjunction/global to v2.12.0
- Bump @memberjunction/sqlserver-dataprovider to v2.12.0

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Bump @memberjunction/core to v2.11.0
- Bump @memberjunction/core-entities to v2.11.0
- Bump @memberjunction/global to v2.11.0
- Bump @memberjunction/sqlserver-dataprovider to v2.11.0

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Bump @memberjunction/core to v2.10.0
- Bump @memberjunction/core-entities to v2.10.0
- Bump @memberjunction/global to v2.10.0
- Bump @memberjunction/sqlserver-dataprovider to v2.10.0

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Bump @memberjunction/core to v2.9.0
- Bump @memberjunction/core-entities to v2.9.0
- Bump @memberjunction/global to v2.9.0
- Bump @memberjunction/sqlserver-dataprovider to v2.9.0

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Bump @memberjunction/core to v2.8.0
- Bump @memberjunction/core-entities to v2.8.0
- Bump @memberjunction/global to v2.8.0
- Bump @memberjunction/sqlserver-dataprovider to v2.8.0

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Bump @memberjunction/core to v2.7.1
- Bump @memberjunction/core-entities to v2.7.1
- Bump @memberjunction/global to v2.7.1
- Bump @memberjunction/sqlserver-dataprovider to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.7.0
- Bump @memberjunction/core-entities to v2.7.0
- Bump @memberjunction/global to v2.7.0
- Bump @memberjunction/sqlserver-dataprovider to v2.7.0

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Bump @memberjunction/core to v2.6.1
- Bump @memberjunction/core-entities to v2.6.1
- Bump @memberjunction/global to v2.6.1
- Bump @memberjunction/sqlserver-dataprovider to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:39 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.6.0
- Bump @memberjunction/core-entities to v2.6.0
- Bump @memberjunction/global to v2.6.0
- Bump @memberjunction/sqlserver-dataprovider to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:02 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Bump @memberjunction/core to v2.5.2
- Bump @memberjunction/core-entities to v2.5.2
- Bump @memberjunction/global to v2.5.2
- Bump @memberjunction/sqlserver-dataprovider to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/core to v2.5.1
- Bump @memberjunction/core-entities to v2.5.1
- Bump @memberjunction/global to v2.5.1
- Bump @memberjunction/sqlserver-dataprovider to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:07 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.5.0
- Bump @memberjunction/core-entities to v2.5.0
- Bump @memberjunction/global to v2.5.0
- Bump @memberjunction/sqlserver-dataprovider to v2.5.0

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Bump @memberjunction/core to v2.4.1
- Bump @memberjunction/core-entities to v2.4.1
- Bump @memberjunction/global to v2.4.1
- Bump @memberjunction/sqlserver-dataprovider to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.4.0
- Bump @memberjunction/core-entities to v2.4.0
- Bump @memberjunction/global to v2.4.0
- Bump @memberjunction/sqlserver-dataprovider to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Bump @memberjunction/core to v2.3.3
- Bump @memberjunction/core-entities to v2.3.3
- Bump @memberjunction/global to v2.3.3
- Bump @memberjunction/sqlserver-dataprovider to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Bump @memberjunction/core to v2.3.2
- Bump @memberjunction/core-entities to v2.3.2
- Bump @memberjunction/global to v2.3.2
- Bump @memberjunction/sqlserver-dataprovider to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.3.1
- Bump @memberjunction/core-entities to v2.3.1
- Bump @memberjunction/global to v2.3.1
- Bump @memberjunction/sqlserver-dataprovider to v2.3.1

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Bump @memberjunction/core to v2.2.2
- Bump @memberjunction/core-entities to v2.3.0
- Bump @memberjunction/global to v2.3.0
- Bump @memberjunction/sqlserver-dataprovider to v2.3.0

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Bump @memberjunction/core to v2.2.1
- Bump @memberjunction/core-entities to v2.2.1
- Bump @memberjunction/global to v2.2.1
- Bump @memberjunction/sqlserver-dataprovider to v2.2.1

## 2.2.0

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Bump @memberjunction/core to v2.2.0
- Bump @memberjunction/core-entities to v2.1.6
- Bump @memberjunction/global to v2.2.0
- Bump @memberjunction/sqlserver-dataprovider to v2.2.0

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/core to v2.1.5
- Bump @memberjunction/core-entities to v2.1.5
- Bump @memberjunction/global to v2.1.5
- Bump @memberjunction/sqlserver-dataprovider to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/core to v2.1.4
- Bump @memberjunction/core-entities to v2.1.4
- Bump @memberjunction/global to v2.1.4
- Bump @memberjunction/sqlserver-dataprovider to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Bump @memberjunction/core to v2.1.3
- Bump @memberjunction/core-entities to v2.1.3
- Bump @memberjunction/global to v2.1.3
- Bump @memberjunction/sqlserver-dataprovider to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Bump @memberjunction/core to v2.1.2
- Bump @memberjunction/core-entities to v2.1.2
- Bump @memberjunction/global to v2.1.2
- Bump @memberjunction/sqlserver-dataprovider to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/core to v2.1.1
- Bump @memberjunction/core-entities to v2.1.1
- Bump @memberjunction/global to v2.1.1
- Bump @memberjunction/sqlserver-dataprovider to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:28 GMT

### Patches

- Bump @memberjunction/core to v1.8.1
- Bump @memberjunction/core-entities to v1.8.1
- Bump @memberjunction/global to v1.8.1
- Bump @memberjunction/sqlserver-dataprovider to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Minor changes

- Bump @memberjunction/core to v1.8.0
- Bump @memberjunction/core-entities to v1.8.0
- Bump @memberjunction/global to v1.8.0
- Bump @memberjunction/sqlserver-dataprovider to v1.8.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.7.1

Wed, 12 Jun 2024 20:13:28 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v1.7.1
- Bump @memberjunction/core-entities to v1.7.1
- Bump @memberjunction/global to v1.7.1
- Bump @memberjunction/sqlserver-dataprovider to v1.7.1

## 1.7.0

Wed, 12 Jun 2024 18:53:39 GMT

### Minor changes

- Bump @memberjunction/core to v1.7.0
- Bump @memberjunction/core-entities to v1.7.0
- Bump @memberjunction/global to v1.7.0
- Bump @memberjunction/sqlserver-dataprovider to v1.6.2

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

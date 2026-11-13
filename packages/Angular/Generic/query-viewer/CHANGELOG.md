# @memberjunction/ng-query-viewer

## 6.2.2

### Patch Changes

- Updated dependencies [47303ff]
- Updated dependencies [215696a]
- Updated dependencies [7110d1b]
  - @memberjunction/core@6.2.2
  - @memberjunction/ng-base-types@6.2.2
  - @memberjunction/ng-code-editor@6.2.2
  - @memberjunction/ng-export-service@6.2.2
  - @memberjunction/ng-notifications@6.2.2
  - @memberjunction/ng-shared-generic@6.2.2
  - @memberjunction/core-entities@6.2.2
  - @memberjunction/excel-addin@6.2.2
  - @memberjunction/ng-markdown@6.2.2
  - @memberjunction/ng-ui-components@6.2.2
  - @memberjunction/ng-pagination@6.2.2
  - @memberjunction/export-engine@6.2.2
  - @memberjunction/global@6.2.2

## 6.2.1

### Patch Changes

- Updated dependencies [41142bd]
  - @memberjunction/core@6.2.1
  - @memberjunction/ng-base-types@6.2.1
  - @memberjunction/ng-code-editor@6.2.1
  - @memberjunction/ng-export-service@6.2.1
  - @memberjunction/ng-notifications@6.2.1
  - @memberjunction/ng-shared-generic@6.2.1
  - @memberjunction/core-entities@6.2.1
  - @memberjunction/excel-addin@6.2.1
  - @memberjunction/ng-markdown@6.2.1
  - @memberjunction/ng-ui-components@6.2.1
  - @memberjunction/ng-pagination@6.2.1
  - @memberjunction/export-engine@6.2.1
  - @memberjunction/global@6.2.1

## 6.2.0

### Minor Changes

- 0eeb89d: **AI usage analytics: a trustworthy cost basis, and the dimensions to slice it by (#4396)**

  Cost reporting was wrong in both directions and could not be sliced by the dimensions anyone
  actually asks about. This settles the basis, gives runs the keys they were missing, and rebuilds
  the reporting layer on top.
  - **Cost doctrine.** `guides/AI_USAGE_AND_COST_ANALYTICS_GUIDE.md` states the rules every consumer
    now follows: the additive basis is own cost at the prompt-run grain, `Cost IS NULL` means
    unpriced and is never coalesced to zero, rollups are derived from the hierarchy at query time and
    never summed from stored inclusive columns, and coverage ships beside every cost figure.
  - **Attribution.** `AIPromptRun` gains `UserID`, written when the run is created. The agent run a
    prompt run belongs to is not stored on it: the agent layer owns that link as
    `AIAgentRunStep.TargetLogID`, now indexed, and the fact view resolves it at query time. Cost
    precision is aligned on `decimal(19,8)` across both run tables, and six analytics indexes are
    added. Sub-agent runs now inherit `CompanyID`.
  - **Parallel execution accounting.** The consolidated parent is created before its arms run, so the
    arms persist as `ParallelChild` rows with their own cost and the parent carries none — previously
    the losing arms were never recorded at all.
  - **Semantic layer.** `vwAIUsageFacts` gives one row per prompt run over the base tables, with
    time buckets, every dimension, and the flags that carry semantics no column expresses
    (`IsPriced`, `IsParallelParent`, `IsUnmeasured`, `SourceKind`).
  - **Aggregates.** Eight saved queries in the `AI` category, every cost figure grouped by currency
    and carried with its priced/unpriced counts. They run live; materializing the hourly and daily
    grains is a follow-up.
  - **Honest dashboards.** The seven analytics surfaces read the aggregates instead of pulling
    unbounded raw rows, unpriced cost renders as an em dash rather than `$0.00`, and coverage is
    shown beside every total.
  - **`mj-query-pivot`.** A generic pivot over any saved Query in `@memberjunction/ng-query-viewer`;
    the AI Usage Explorer is a thin configuration of it. `ColumnLabels` titles columns, and
    `HiddenColumns` lets a host group by an ID it does not display (so two records that share a name
    stay apart while only the name shows).

- a4246f5: Properties on dashboards, input mappings, events and wires, and an Interactive Component part (#4789, A15). A dashboard with no properties, mappings or wires renders and saves exactly as before. `minor` because of the new `MJ: Dashboard Part Types` metadata row.
  - `@memberjunction/ng-dashboard-viewer`: a dashboard's config may hold `Properties` (name, type, description, required, and a default: a fixed value or a context token) and `Wires`; a part's config may hold `inputMappings` (`{ Input, Property?, Default? }`). The viewer's new `Properties` input lets a host set values once. Each part declares its inputs (View: its view's properties; Query: its query's parameters; Component: the component's props; Web URL: `{Name}` placeholders, URL-encoded when filled; Artifact: none) and works them out in one order: host value, then a wired event's value, then the property's default, then the mapping's default, then the input's own default. Token defaults are worked out in the browser with the provider's user and the browser's zone. A broken mapping or a required input with no value stops the part with a message naming it; an input only the server may set can't be mapped. Parts raise their events (View `RecordSelected`, Query `RowSelected`, a component's declared events); a wire sets a dashboard property from one of the event's values, never a part input, the host's value always wins, clearing the selection removes the value, and a part never sees the value its own event set. The viewer raises `PanelInteraction` `'record-select'` for a View or Query selection. A save with properties, mappings or wires checks them (`LastSaveError` says why it refused). New: the `Component` part (`ComponentPanelRenderer`, renders a registered component by name and optional version in the React host with `ProviderToUse` for its utilities) and its config panel, the Properties and wires dialog, the Inputs list in the part dialog, and plain-TypeScript models (`DashboardPropertyResolver`, `ResolvePartInputs`, `ValidateDashboardBindings`, `LoadPartInterface`, `PartInputsEditor`).
  - `@memberjunction/ng-query-viewer`: `MappedParameters` input: mapped values override the user's saved values, are never saved into `QueryViewer_<id>_LastParams`, and show read-only. The parameter form's `ReadOnlyParameters` input disables those fields with a lock. A server-set parameter (`IsServerSet`) shows as "Set by server", is not required in the form, and is never sent.
  - `@memberjunction/ng-dashboards`: the dashboard editor gets a Properties button that opens the Properties and wires dialog, passes the dashboard's properties to the part dialog, and shows the viewer's reason when a save is refused.
  - Metadata: a `Component` row in `MJ: Dashboard Part Types`.

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

- f2248d5: Context tokens, the caller's time zone, and provider threading for dashboard parts.
  - `@memberjunction/core` adds the context-token module: the closed `ContextToken` list, `PropertyDefault`, `UserViewProperty`, `ResolvePropertyDefault` / `ResolveContextToken` (user tokens; date tokens worked out in an IANA zone with Monday or Sunday week starts and day to year offsets), `ValidatePropertyDefault`, `IsValidTimeZone` and `GetLocalTimeZone`. `RunViewParams` and `RunQueryParams` gain a server-only `TimeZone`. Nothing reads them yet.
  - `GraphQLDataProvider` sends the runtime's IANA zone as `x-mj-timezone` on every HTTP request; MJServer validates it into `UserPayload.TimeZone`, and the view and query resolvers pass it on as `TimeZone`. An absent or invalid header leaves it unset (UTC).
  - The dashboard viewer hands its `Provider` to the parts it creates, the View, Query and Artifact parts pass it to their viewers, and the query viewer, its grid and info panel, and the entity viewer's recycle bin read through it. With no `Provider` set, behaviour is unchanged.
  - `SERVER_ONLY_RUN_VIEW_PARAMS` / `StripServerOnlyRunViewParams` name the run fields only server code sets. The REST view routes strip them from the request body, and the route's entity name now wins over an `EntityName` in the body (before, the body could replace it and skip the entity allowlist check).
  - **Deployments:** browser requests now carry an `x-mj-timezone` header. MJAPI's CORS setup reflects requested headers, so it needs nothing, but a proxy or gateway that pins `Access-Control-Allow-Headers` must add `x-mj-timezone`, or browser preflights will fail.

- a3d6182: fix: a date-only (SQL `date`) column reads as its stored day in the query viewer, the record change history and restore preview, and the timeline, and exports as `YYYY-MM-DD`

  These paths still formatted a calendar day, which arrives as UTC midnight, in the reader's local zone, so a stored 2026-10-01 read as Sep 30 west of Greenwich: as "Sep 30, 2026" in a query viewer cell and row detail, as "Sep 30, 2026, 7:00 PM" in the change history, and in a "September 30" timeline segment. The query viewer now branches on `IsDateOnlySQLType` and formats with `FormatDateOnly`, and the row detail no longer adds an "hours ago" suffix to a day. The change history and the restore preview share one formatter, so a date-only field shows its day with no time, and the restore preview's live value for a date field is no longer blank. The timeline carries a date-only event as local midnight of its stored day, so its segments and labels land on that day. The export engine gains a `dateonly` column type: CSV and JSON write ISO 8601 `YYYY-MM-DD`, and Excel writes a date cell on the stored day. The entity grid and the query viewer mark SQL `date` columns with it, and the query viewer's export columns now set `dataType` (they set an ignored `type` key before).

  The entity viewer's Timeline view now reads its date field the same way: its rows are plain objects with no entity metadata, so the renderer hands the timeline group the entity (`TimelineGroup.EntityInfo`, used when a record carries none) and drops the time from the card date for a date-only field. The restore preview decides whether a field changed by value, not by its display string, so a timestamp that moved by under a minute is no longer reported unchanged and a snapshot day matches the same live day. The fallback export for Cards, Map and Timeline (the view workspace and Explorer's view resource) types its columns as the grid does, through a shared `ExportColumnTypeForSQLType`, so a date-only field exports as its day there too. The export engine writes a `dateonly` value whose leading `YYYY-MM-DD` is not a real day (`2026-13-45`, `2026-02-30`) as its original text instead of "Invalid Date" or a rolled-over day. The mobile app's entity explorer shows a date-only field in card subtitles and the record detail as its stored day. Closes MJ#4966.

- 555a3f3: Add the Excel add-in's first release: a unified **Export ▾** toolbar menu across entity grids (both `(Default)` entity views and saved views) and query results grids offers **Open in Excel** alongside snapshot export, downloading a connected workbook that holds no rows and fills, in Excel, with what the person who opens it can see. Inside Excel, the MemberJunction task pane supports connecting to any MemberJunction server (via Office Dialog sign-in or external-browser encrypted connection-code handoff), browsing Applications, Entities, Saved Views, and Query Categories/Saved Queries with parameters directly from any workbook, and managing/refreshing all connected worksheets. New packages `@memberjunction/excel-addin` (workbook contract, typed `ExcelAddin.*` Remote Operations, encrypted sign-in handoff, the add-in pane) and `@memberjunction/excel-addin-server` (a Server Extension that serves the add-in and a per-host manifest, plus the operations' server bodies). Excel signs in through Explorer's new `office/connect` page, which Explorer renders on its own like the OAuth callback, and holds a per-user API key scoped to `view:run` and `query:run`. Off until a host configures the `ExcelAddinServerExtension`; see `guides/EXCEL_ADDIN_GUIDE.md`.
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
- Updated dependencies [b5955fb]
- Updated dependencies [d538c14]
- Updated dependencies [a3539d2]
- Updated dependencies [db39145]
- Updated dependencies [41274aa]
- Updated dependencies [0581392]
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
- Updated dependencies [0b509c0]
- Updated dependencies [5465489]
- Updated dependencies [3bace5a]
- Updated dependencies [88e6902]
- Updated dependencies [83486cf]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [e1fd4c1]
- Updated dependencies [a3d6182]
- Updated dependencies [4248fb3]
- Updated dependencies [e1dd673]
- Updated dependencies [d29b5c2]
- Updated dependencies [59e32e0]
- Updated dependencies [8b62f8c]
- Updated dependencies [d122a41]
- Updated dependencies [490cd8d]
- Updated dependencies [0a7c255]
- Updated dependencies [0adaf76]
- Updated dependencies [0ff7523]
- Updated dependencies [d86bcbc]
- Updated dependencies [555a3f3]
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
- Updated dependencies [e225ece]
- Updated dependencies [1cb1d52]
- Updated dependencies [09c7d57]
- Updated dependencies [c271ddf]
- Updated dependencies [ae0a662]
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
- Updated dependencies [7e72c86]
- Updated dependencies [a17a228]
- Updated dependencies [6b08ebf]
- Updated dependencies [5fed75a]
- Updated dependencies [ee1f0d9]
- Updated dependencies [ce758af]
- Updated dependencies [89a5b59]
- Updated dependencies [1ea4085]
- Updated dependencies [aee2d53]
- Updated dependencies [5e1e343]
- Updated dependencies [8420f36]
- Updated dependencies [4ef13d6]
- Updated dependencies [25f7b82]
- Updated dependencies [8b90b41]
- Updated dependencies [104125c]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [db4e210]
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
- Updated dependencies [b4afc13]
- Updated dependencies [36a3f9e]
- Updated dependencies [539dfe3]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [920bef8]
- Updated dependencies [60bd774]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [ac18db8]
- Updated dependencies [35da130]
- Updated dependencies [5b41d48]
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
- Updated dependencies [291485d]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [718b01c]
- Updated dependencies [e7b2ebc]
- Updated dependencies [e0cf9ed]
- Updated dependencies [da449bb]
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
  - @memberjunction/ng-shared-generic@6.2.0
  - @memberjunction/ng-ui-components@6.2.0
  - @memberjunction/ng-markdown@6.2.0
  - @memberjunction/export-engine@6.2.0
  - @memberjunction/excel-addin@6.2.0
  - @memberjunction/ng-export-service@6.2.0
  - @memberjunction/ng-notifications@6.2.0
  - @memberjunction/ng-code-editor@6.2.0
  - @memberjunction/ng-base-types@6.2.0
  - @memberjunction/ng-pagination@6.2.0

## 6.2.0-edge.8

### Patch Changes

- Updated dependencies [6c36fb6]
- Updated dependencies [9cb815b]
- Updated dependencies [d2db108]
- Updated dependencies [c671f85]
- Updated dependencies [6849b00]
- Updated dependencies [0b509c0]
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
  - @memberjunction/ng-markdown@6.2.0-edge.8
  - @memberjunction/global@6.2.0-edge.8
  - @memberjunction/ng-base-types@6.2.0-edge.8
  - @memberjunction/ng-code-editor@6.2.0-edge.8
  - @memberjunction/ng-export-service@6.2.0-edge.8
  - @memberjunction/ng-notifications@6.2.0-edge.8
  - @memberjunction/ng-shared-generic@6.2.0-edge.8
  - @memberjunction/excel-addin@6.2.0-edge.8
  - @memberjunction/ng-ui-components@6.2.0-edge.8
  - @memberjunction/ng-pagination@6.2.0-edge.8
  - @memberjunction/export-engine@6.2.0-edge.8

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

- 555a3f3: Add the Excel add-in's first release: a unified **Export ▾** toolbar menu across entity grids (both `(Default)` entity views and saved views) and query results grids offers **Open in Excel** alongside snapshot export, downloading a connected workbook that holds no rows and fills, in Excel, with what the person who opens it can see. Inside Excel, the MemberJunction task pane supports connecting to any MemberJunction server (via Office Dialog sign-in or external-browser encrypted connection-code handoff), browsing Applications, Entities, Saved Views, and Query Categories/Saved Queries with parameters directly from any workbook, and managing/refreshing all connected worksheets. New packages `@memberjunction/excel-addin` (workbook contract, typed `ExcelAddin.*` Remote Operations, encrypted sign-in handoff, the add-in pane) and `@memberjunction/excel-addin-server` (a Server Extension that serves the add-in and a per-host manifest, plus the operations' server bodies). Excel signs in through Explorer's new `office/connect` page, which Explorer renders on its own like the OAuth callback, and holds a per-user API key scoped to `view:run` and `query:run`. Off until a host configures the `ExcelAddinServerExtension`; see `guides/EXCEL_ADDIN_GUIDE.md`.
- Updated dependencies [1419ba7]
- Updated dependencies [c93c0f8]
- Updated dependencies [ecf36eb]
- Updated dependencies [91cba84]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [c8c48e1]
- Updated dependencies [3bace5a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [555a3f3]
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
- Updated dependencies [da449bb]
- Updated dependencies [b0b2cc9]
  - @memberjunction/global@6.2.0-edge.7
  - @memberjunction/core-entities@6.2.0-edge.7
  - @memberjunction/core@6.2.0-edge.7
  - @memberjunction/excel-addin@6.2.0-edge.7
  - @memberjunction/ng-export-service@6.2.0-edge.7
  - @memberjunction/ng-shared-generic@6.2.0-edge.7
  - @memberjunction/ng-code-editor@6.2.0-edge.7
  - @memberjunction/ng-base-types@6.2.0-edge.7
  - @memberjunction/ng-notifications@6.2.0-edge.7
  - @memberjunction/ng-markdown@6.2.0-edge.7
  - @memberjunction/ng-ui-components@6.2.0-edge.7
  - @memberjunction/ng-pagination@6.2.0-edge.7
  - @memberjunction/export-engine@6.2.0-edge.7

## 6.2.0-edge.6

### Minor Changes

- a4246f5: Properties on dashboards, input mappings, events and wires, and an Interactive Component part (#4789, A15). A dashboard with no properties, mappings or wires renders and saves exactly as before. `minor` because of the new `MJ: Dashboard Part Types` metadata row.
  - `@memberjunction/ng-dashboard-viewer`: a dashboard's config may hold `Properties` (name, type, description, required, and a default: a fixed value or a context token) and `Wires`; a part's config may hold `inputMappings` (`{ Input, Property?, Default? }`). The viewer's new `Properties` input lets a host set values once. Each part declares its inputs (View: its view's properties; Query: its query's parameters; Component: the component's props; Web URL: `{Name}` placeholders, URL-encoded when filled; Artifact: none) and works them out in one order: host value, then a wired event's value, then the property's default, then the mapping's default, then the input's own default. Token defaults are worked out in the browser with the provider's user and the browser's zone. A broken mapping or a required input with no value stops the part with a message naming it; an input only the server may set can't be mapped. Parts raise their events (View `RecordSelected`, Query `RowSelected`, a component's declared events); a wire sets a dashboard property from one of the event's values, never a part input, the host's value always wins, clearing the selection removes the value, and a part never sees the value its own event set. The viewer raises `PanelInteraction` `'record-select'` for a View or Query selection. A save with properties, mappings or wires checks them (`LastSaveError` says why it refused). New: the `Component` part (`ComponentPanelRenderer`, renders a registered component by name and optional version in the React host with `ProviderToUse` for its utilities) and its config panel, the Properties and wires dialog, the Inputs list in the part dialog, and plain-TypeScript models (`DashboardPropertyResolver`, `ResolvePartInputs`, `ValidateDashboardBindings`, `LoadPartInterface`, `PartInputsEditor`).
  - `@memberjunction/ng-query-viewer`: `MappedParameters` input: mapped values override the user's saved values, are never saved into `QueryViewer_<id>_LastParams`, and show read-only. The parameter form's `ReadOnlyParameters` input disables those fields with a lock. A server-set parameter (`IsServerSet`) shows as "Set by server", is not required in the form, and is never sent.
  - `@memberjunction/ng-dashboards`: the dashboard editor gets a Properties button that opens the Properties and wires dialog, passes the dashboard's properties to the part dialog, and shows the viewer's reason when a save is refused.
  - Metadata: a `Component` row in `MJ: Dashboard Part Types`.

### Patch Changes

- f2248d5: Context tokens, the caller's time zone, and provider threading for dashboard parts.
  - `@memberjunction/core` adds the context-token module: the closed `ContextToken` list, `PropertyDefault`, `UserViewProperty`, `ResolvePropertyDefault` / `ResolveContextToken` (user tokens; date tokens worked out in an IANA zone with Monday or Sunday week starts and day to year offsets), `ValidatePropertyDefault`, `IsValidTimeZone` and `GetLocalTimeZone`. `RunViewParams` and `RunQueryParams` gain a server-only `TimeZone`. Nothing reads them yet.
  - `GraphQLDataProvider` sends the runtime's IANA zone as `x-mj-timezone` on every HTTP request; MJServer validates it into `UserPayload.TimeZone`, and the view and query resolvers pass it on as `TimeZone`. An absent or invalid header leaves it unset (UTC).
  - The dashboard viewer hands its `Provider` to the parts it creates, the View, Query and Artifact parts pass it to their viewers, and the query viewer, its grid and info panel, and the entity viewer's recycle bin read through it. With no `Provider` set, behaviour is unchanged.
  - `SERVER_ONLY_RUN_VIEW_PARAMS` / `StripServerOnlyRunViewParams` name the run fields only server code sets. The REST view routes strip them from the request body, and the route's entity name now wins over an `EntityName` in the body (before, the body could replace it and skip the entity allowlist check).
  - **Deployments:** browser requests now carry an `x-mj-timezone` header. MJAPI's CORS setup reflects requested headers, so it needs nothing, but a proxy or gateway that pins `Access-Control-Allow-Headers` must add `x-mj-timezone`, or browser preflights will fail.

- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [b5955fb]
- Updated dependencies [d538c14]
- Updated dependencies [0581392]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [0ff7523]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [09c7d57]
- Updated dependencies [f26084f]
- Updated dependencies [dae1d31]
- Updated dependencies [4c97994]
- Updated dependencies [db4e210]
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
- Updated dependencies [291485d]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/ng-shared-generic@6.2.0-edge.6
  - @memberjunction/ng-ui-components@6.2.0-edge.6
  - @memberjunction/ng-markdown@6.2.0-edge.6
  - @memberjunction/ng-notifications@6.2.0-edge.6
  - @memberjunction/ng-base-types@6.2.0-edge.6
  - @memberjunction/ng-code-editor@6.2.0-edge.6
  - @memberjunction/ng-export-service@6.2.0-edge.6
  - @memberjunction/ng-pagination@6.2.0-edge.6
  - @memberjunction/export-engine@6.2.0-edge.6

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
- Updated dependencies [83486cf]
- Updated dependencies [d29b5c2]
- Updated dependencies [8b62f8c]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [2274f42]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [c271ddf]
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
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/ng-shared-generic@6.2.0-edge.5
  - @memberjunction/ng-ui-components@6.2.0-edge.5
  - @memberjunction/ng-markdown@6.2.0-edge.5
  - @memberjunction/ng-notifications@6.2.0-edge.5
  - @memberjunction/ng-base-types@6.2.0-edge.5
  - @memberjunction/ng-code-editor@6.2.0-edge.5
  - @memberjunction/ng-export-service@6.2.0-edge.5
  - @memberjunction/ng-pagination@6.2.0-edge.5
  - @memberjunction/export-engine@6.2.0-edge.5

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
- Updated dependencies [490cd8d]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [7316ac3]
- Updated dependencies [ae0a662]
- Updated dependencies [08b3d7b]
- Updated dependencies [1ea4085]
- Updated dependencies [aee2d53]
- Updated dependencies [5e1e343]
- Updated dependencies [25f7b82]
- Updated dependencies [90829e3]
- Updated dependencies [aac148b]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [e7b2ebc]
- Updated dependencies [e0cf9ed]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/ng-shared-generic@6.2.0-edge.4
  - @memberjunction/ng-ui-components@6.2.0-edge.4
  - @memberjunction/ng-markdown@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/ng-base-types@6.2.0-edge.4
  - @memberjunction/ng-code-editor@6.2.0-edge.4
  - @memberjunction/ng-notifications@6.2.0-edge.4
  - @memberjunction/ng-export-service@6.2.0-edge.4
  - @memberjunction/ng-pagination@6.2.0-edge.4
  - @memberjunction/export-engine@6.2.0-edge.4

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
  - @memberjunction/ng-ui-components@6.2.0-edge.3
  - @memberjunction/ng-base-types@6.2.0-edge.3
  - @memberjunction/ng-code-editor@6.2.0-edge.3
  - @memberjunction/ng-notifications@6.2.0-edge.3
  - @memberjunction/ng-shared-generic@6.2.0-edge.3
  - @memberjunction/ng-export-service@6.2.0-edge.3
  - @memberjunction/ng-markdown@6.2.0-edge.3
  - @memberjunction/ng-pagination@6.2.0-edge.3
  - @memberjunction/export-engine@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- a3d6182: fix: a date-only (SQL `date`) column reads as its stored day in the query viewer, the record change history and restore preview, and the timeline, and exports as `YYYY-MM-DD`

  These paths still formatted a calendar day, which arrives as UTC midnight, in the reader's local zone, so a stored 2026-10-01 read as Sep 30 west of Greenwich: as "Sep 30, 2026" in a query viewer cell and row detail, as "Sep 30, 2026, 7:00 PM" in the change history, and in a "September 30" timeline segment. The query viewer now branches on `IsDateOnlySQLType` and formats with `FormatDateOnly`, and the row detail no longer adds an "hours ago" suffix to a day. The change history and the restore preview share one formatter, so a date-only field shows its day with no time, and the restore preview's live value for a date field is no longer blank. The timeline carries a date-only event as local midnight of its stored day, so its segments and labels land on that day. The export engine gains a `dateonly` column type: CSV and JSON write ISO 8601 `YYYY-MM-DD`, and Excel writes a date cell on the stored day. The entity grid and the query viewer mark SQL `date` columns with it, and the query viewer's export columns now set `dataType` (they set an ignored `type` key before).

  The entity viewer's Timeline view now reads its date field the same way: its rows are plain objects with no entity metadata, so the renderer hands the timeline group the entity (`TimelineGroup.EntityInfo`, used when a record carries none) and drops the time from the card date for a date-only field. The restore preview decides whether a field changed by value, not by its display string, so a timestamp that moved by under a minute is no longer reported unchanged and a snapshot day matches the same live day. The fallback export for Cards, Map and Timeline (the view workspace and Explorer's view resource) types its columns as the grid does, through a shared `ExportColumnTypeForSQLType`, so a date-only field exports as its day there too. The export engine writes a `dateonly` value whose leading `YYYY-MM-DD` is not a real day (`2026-13-45`, `2026-02-30`) as its original text instead of "Invalid Date" or a rolled-over day. The mobile app's entity explorer shows a date-only field in card subtitles and the record detail as its stored day. Closes MJ#4966.

- Updated dependencies [e97d95c]
- Updated dependencies [2552b1e]
- Updated dependencies [21f9e15]
- Updated dependencies [a3d6182]
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
  - @memberjunction/export-engine@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/ng-ui-components@6.2.0-edge.2
  - @memberjunction/ng-base-types@6.2.0-edge.2
  - @memberjunction/ng-code-editor@6.2.0-edge.2
  - @memberjunction/ng-notifications@6.2.0-edge.2
  - @memberjunction/ng-shared-generic@6.2.0-edge.2
  - @memberjunction/ng-export-service@6.2.0-edge.2
  - @memberjunction/ng-markdown@6.2.0-edge.2
  - @memberjunction/ng-pagination@6.2.0-edge.2

## 6.2.0-edge.1

### Minor Changes

- 0eeb89d: **AI usage analytics: a trustworthy cost basis, and the dimensions to slice it by (#4396)**

  Cost reporting was wrong in both directions and could not be sliced by the dimensions anyone
  actually asks about. This settles the basis, gives runs the keys they were missing, and rebuilds
  the reporting layer on top.
  - **Cost doctrine.** `guides/AI_USAGE_AND_COST_ANALYTICS_GUIDE.md` states the rules every consumer
    now follows: the additive basis is own cost at the prompt-run grain, `Cost IS NULL` means
    unpriced and is never coalesced to zero, rollups are derived from the hierarchy at query time and
    never summed from stored inclusive columns, and coverage ships beside every cost figure.
  - **Attribution.** `AIPromptRun` gains `UserID`, written when the run is created. The agent run a
    prompt run belongs to is not stored on it: the agent layer owns that link as
    `AIAgentRunStep.TargetLogID`, now indexed, and the fact view resolves it at query time. Cost
    precision is aligned on `decimal(19,8)` across both run tables, and six analytics indexes are
    added. Sub-agent runs now inherit `CompanyID`.
  - **Parallel execution accounting.** The consolidated parent is created before its arms run, so the
    arms persist as `ParallelChild` rows with their own cost and the parent carries none — previously
    the losing arms were never recorded at all.
  - **Semantic layer.** `vwAIUsageFacts` gives one row per prompt run over the base tables, with
    time buckets, every dimension, and the flags that carry semantics no column expresses
    (`IsPriced`, `IsParallelParent`, `IsUnmeasured`, `SourceKind`).
  - **Aggregates.** Eight saved queries in the `AI` category, every cost figure grouped by currency
    and carried with its priced/unpriced counts. They run live; materializing the hourly and daily
    grains is a follow-up.
  - **Honest dashboards.** The seven analytics surfaces read the aggregates instead of pulling
    unbounded raw rows, unpriced cost renders as an em dash rather than `$0.00`, and coverage is
    shown beside every total.
  - **`mj-query-pivot`.** A generic pivot over any saved Query in `@memberjunction/ng-query-viewer`;
    the AI Usage Explorer is a thin configuration of it. `ColumnLabels` titles columns, and
    `HiddenColumns` lets a host group by an ID it does not display (so two records that share a name
    stay apart while only the name shows).

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
- Updated dependencies [920bef8]
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/export-engine@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/ng-code-editor@6.2.0-edge.1
  - @memberjunction/ng-export-service@6.2.0-edge.1
  - @memberjunction/ng-markdown@6.2.0-edge.1
  - @memberjunction/ng-notifications@6.2.0-edge.1
  - @memberjunction/ng-shared-generic@6.2.0-edge.1
  - @memberjunction/ng-ui-components@6.2.0-edge.1
  - @memberjunction/ng-base-types@6.2.0-edge.1
  - @memberjunction/ng-pagination@6.2.0-edge.1

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
- Updated dependencies [e225ece]
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
  - @memberjunction/ng-shared-generic@6.2.0-edge.0
  - @memberjunction/ng-base-types@6.2.0-edge.0
  - @memberjunction/ng-code-editor@6.2.0-edge.0
  - @memberjunction/ng-notifications@6.2.0-edge.0
  - @memberjunction/ng-export-service@6.2.0-edge.0
  - @memberjunction/ng-markdown@6.2.0-edge.0
  - @memberjunction/ng-ui-components@6.2.0-edge.0
  - @memberjunction/ng-pagination@6.2.0-edge.0
  - @memberjunction/export-engine@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Patch Changes

- b915983: Align the Angular toolchain on the current 21.x patch line: framework packages 21.1.3 → 21.2.22,
  CLI/builders 21.1.3 → 21.2.23, CDK 21.1.3 → 21.2.14, ng-packagr → 21.2.7, PrimeNG 21.1.1 → 21.1.9.

  This is a patch-level move inside the supported Angular 21 LTS line, not a framework migration.
  It closes every open Angular security advisory on the repository — fifteen distinct GHSAs
  (i18n and template-sanitizer XSS bypasses, service-worker header leakage and credential
  stripping, HttpTransferCache cross-request leakage, and formatDate/number-format DoS), all fixed
  in 21.2.19 or earlier — which together accounted for 438 of the 749 open Dependabot alerts.

  Every published `@memberjunction/ng-*` package's `@angular/*` peer range moves from `^21.1.3`
  (or `^21.0.0`) to `^21.2.22`, so consumers must be on at least that patch. The era-6 platform
  manifest in `release-lines.json` records the new pin; era 5 (the certified 5.51 line) is
  unchanged.

  Also moves the exact `@angular/*` runtime pins that 23 libraries carried in `dependencies`
  into caret `peerDependencies` (adding the missing peers on `ng-react`), so a consumer on any
  in-range Angular 21.2.x build gets a single Angular copy instead of a nested second runtime, and
  drops the unused `primeng` peer from `ng-base-forms` (nothing in the repo imports PrimeNG).

- b895f92: Angular DOM unit-testing — Phase 4 coverage push. Dev-only (test files + test-config/CI-gate scoping); no runtime change.

  Drives the Generic DOM-coverage ratchet (`scripts/dom-test-report.mjs … --max-none`) from **185 → 137** by writing DOM specs, in usage-ranked order, for every Generic Angular component appropriate for a DOM unit test. Highlights:
  - **Highest-leverage primitives** — `MjFormFieldComponent` (the field renderer behind ~4,000 usages) across its read/edit type matrix; the `ui-components` design system (`MJEmptyStateComponent`, the `mj-page-*` chrome family, `MJDropdown`/`MJCombobox`/`MJFilterPopover` via a new CDK-overlay test helper in `ng-test-utils`, the `mj-dialog` family, tabs, filter panel, left-nav).
  - **Form host stack** — `MjRecordFormContainer`, `MjFormToolbar`, `MjEntityFormHost`, `MjIsaRelatedPanel`, `FormPanelSlot`, `ExplorerEntityDataGrid`, `InteractiveForm`.
  - **Viewers, grids & dialogs** — `EntityDataGrid` + `QueryDataGrid` (AG-Grid chrome), `EntityViewer`, `ArtifactViewerPanel`, the ERD component family (`ERDComposite`/`MJEntityERD`/`ERDDiagram`), plus a broad set of panels/editors/dialogs across agents, artifacts, search, composer, list-management, scheduling, record-process-studio, user-routines, entity-action-ux, actions, and testing.
  - **`Angular/Bootstrap` onboarded** — the last untracked library tree gains a DOM test tier (`MJAuthShell`, `MJBootstrap`) and its own `--max-none=0` CI gate, so every shipped Angular library tree (Explorer, Generic, Bootstrap) is now gated.

  Reusable patterns established for the harder components: drive internal state before the first render (`setup`) rather than mutating post-render (unreliable under zoneless CD); stub the heavy core (AG-Grid, React bridge, SVG layout, plugin viewers) and spy async loaders so specs exercise the component's own chrome/wiring; add each component **and its injected services** to enumerated `tsconfig.spec.json` files (or AOT drops decorator metadata → NG0202).

  Deliberately **not** covered, and left at the 137 floor: five integration/e2e-tier orchestrators (`ConversationChatArea`, `MessageInput`, `RealtimeWhiteboardBoard`, `AITestHarness`, `RealtimeSessionOverlay`) — 1,800–4,600-line components with realtime/WebRTC/canvas cores or 14–30 dependencies, which belong in the browser regression suite rather than DOM units.

- b895f92: Angular DOM unit-testing — Phase 4 (gates, guardrails & spec hygiene). Dev-only; no runtime change.
  - **`test:types` spec type-check gate**: each DOM-testing package gains a
    `"test:types": "tsc --noEmit -p tsconfig.spec.json"` script, run as a cached turbo task in CI
    before the vitest suite (both the affected and full-suite paths). Closes the Phase-3 hole where
    vitest/esbuild's transpile-only path let real spec type errors (broken `import type` paths,
    `Subject`-vs-`EventEmitter`) ride green until the `ngc` build failed.
  - **DOM-spec placement guard** (`scripts/check-dom-spec-placement.mjs`, fast pre-build CI step):
    fails when a `*.dom.test.ts` sits inside `__tests__/`, where a dual-preset package silently runs
    it in neither vitest project. Its one real finding — `ng-markdown`'s service DOM spec — was
    relocated next to its source (test-file move only).
  - Fixes the pre-existing latent 2-args-of-3 `MCPDashboardComponent` constructor call in the
    dashboards node test (the gate's prerequisite).
  - **Anti-pattern lint** (`scripts/check-spec-antipatterns.mjs`, CI): bans vacuous assertions,
    skipped specs, blanket schemas, and `any`/`as never` casts in `*.dom.test.ts`. Enabling it drove
    the spec-hygiene cleanup across `ng-agent-requests` / `ng-query-viewer` / `ng-scheduling` /
    `ng-agents` / `ng-record-changes` (blanket schemas → explicit child stubs; `as never` → typed
    doubles) and the Explorer specs (real DOM clicks instead of handler calls, SVG prototype-patch
    teardown, typed context doubles).
  - **Explorer DOM coverage gate**: `classify-explorer-components.mjs --min 85` in CI — a testable
    Explorer component shipped without a DOM spec now fails the PR.

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- Updated dependencies [4273317]
- Updated dependencies [394d276]
- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b915983]
- Updated dependencies [b895f92]
- Updated dependencies [b895f92]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [c1fea88]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [1a2ce13]
- Updated dependencies [4c1de04]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [1940a4d]
- Updated dependencies [07cb22e]
- Updated dependencies [deea1a3]
- Updated dependencies [1d2ffd4]
- Updated dependencies [c09c818]
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
- Updated dependencies [51017a5]
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
- Updated dependencies [e93f221]
- Updated dependencies [8288711]
- Updated dependencies [10cbc60]
- Updated dependencies [be0bdb2]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [d26e202]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [394d276]
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
- Updated dependencies [394d276]
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
  - @memberjunction/ng-shared-generic@6.1.0
  - @memberjunction/ng-ui-components@6.1.0
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/ng-base-types@6.1.0
  - @memberjunction/ng-code-editor@6.1.0
  - @memberjunction/ng-export-service@6.1.0
  - @memberjunction/ng-markdown@6.1.0
  - @memberjunction/ng-notifications@6.1.0
  - @memberjunction/ng-pagination@6.1.0
  - @memberjunction/export-engine@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [076fa5d]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/ng-ui-components@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/ng-base-types@6.1.0-edge.7
  - @memberjunction/ng-code-editor@6.1.0-edge.7
  - @memberjunction/ng-notifications@6.1.0-edge.7
  - @memberjunction/ng-shared-generic@6.1.0-edge.7
  - @memberjunction/ng-export-service@6.1.0-edge.7
  - @memberjunction/ng-markdown@6.1.0-edge.7
  - @memberjunction/ng-pagination@6.1.0-edge.7
  - @memberjunction/export-engine@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- b915983: Align the Angular toolchain on the current 21.x patch line: framework packages 21.1.3 → 21.2.22,
  CLI/builders 21.1.3 → 21.2.23, CDK 21.1.3 → 21.2.14, ng-packagr → 21.2.7, PrimeNG 21.1.1 → 21.1.9.

  This is a patch-level move inside the supported Angular 21 LTS line, not a framework migration.
  It closes every open Angular security advisory on the repository — fifteen distinct GHSAs
  (i18n and template-sanitizer XSS bypasses, service-worker header leakage and credential
  stripping, HttpTransferCache cross-request leakage, and formatDate/number-format DoS), all fixed
  in 21.2.19 or earlier — which together accounted for 438 of the 749 open Dependabot alerts.

  Every published `@memberjunction/ng-*` package's `@angular/*` peer range moves from `^21.1.3`
  (or `^21.0.0`) to `^21.2.22`, so consumers must be on at least that patch. The era-6 platform
  manifest in `release-lines.json` records the new pin; era 5 (the certified 5.51 line) is
  unchanged.

  Also moves the exact `@angular/*` runtime pins that 23 libraries carried in `dependencies`
  into caret `peerDependencies` (adding the missing peers on `ng-react`), so a consumer on any
  in-range Angular 21.2.x build gets a single Angular copy instead of a nested second runtime, and
  drops the unused `primeng` peer from `ng-base-forms` (nothing in the repo imports PrimeNG).

- Updated dependencies [2c826f7]
- Updated dependencies [b915983]
- Updated dependencies [b7819d2]
- Updated dependencies [c1fea88]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [4c1de04]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
- Updated dependencies [51017a5]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [10cbc60]
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
  - @memberjunction/ng-base-types@6.1.0-edge.6
  - @memberjunction/ng-code-editor@6.1.0-edge.6
  - @memberjunction/ng-export-service@6.1.0-edge.6
  - @memberjunction/ng-markdown@6.1.0-edge.6
  - @memberjunction/ng-notifications@6.1.0-edge.6
  - @memberjunction/ng-pagination@6.1.0-edge.6
  - @memberjunction/ng-shared-generic@6.1.0-edge.6
  - @memberjunction/ng-ui-components@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/export-engine@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [4273317]
- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [c09c818]
- Updated dependencies [d66a26a]
- Updated dependencies [e93f221]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/ng-shared-generic@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/ng-ui-components@6.1.0-edge.5
  - @memberjunction/ng-markdown@6.1.0-edge.5
  - @memberjunction/ng-base-types@6.1.0-edge.5
  - @memberjunction/ng-code-editor@6.1.0-edge.5
  - @memberjunction/ng-notifications@6.1.0-edge.5
  - @memberjunction/ng-export-service@6.1.0-edge.5
  - @memberjunction/ng-pagination@6.1.0-edge.5
  - @memberjunction/export-engine@6.1.0-edge.5

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
  - @memberjunction/ng-base-types@6.1.0-edge.4
  - @memberjunction/ng-code-editor@6.1.0-edge.4
  - @memberjunction/ng-notifications@6.1.0-edge.4
  - @memberjunction/ng-shared-generic@6.1.0-edge.4
  - @memberjunction/ng-export-service@6.1.0-edge.4
  - @memberjunction/ng-markdown@6.1.0-edge.4
  - @memberjunction/ng-ui-components@6.1.0-edge.4
  - @memberjunction/ng-pagination@6.1.0-edge.4
  - @memberjunction/export-engine@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [07cb22e]
- Updated dependencies [deea1a3]
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
  - @memberjunction/ng-code-editor@6.1.0-edge.3
  - @memberjunction/ng-base-types@6.1.0-edge.3
  - @memberjunction/ng-notifications@6.1.0-edge.3
  - @memberjunction/ng-ui-components@6.1.0-edge.3
  - @memberjunction/ng-shared-generic@6.1.0-edge.3
  - @memberjunction/ng-export-service@6.1.0-edge.3
  - @memberjunction/ng-markdown@6.1.0-edge.3
  - @memberjunction/ng-pagination@6.1.0-edge.3
  - @memberjunction/export-engine@6.1.0-edge.3

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
  - @memberjunction/ng-base-types@6.1.0-edge.2
  - @memberjunction/ng-code-editor@6.1.0-edge.2
  - @memberjunction/ng-notifications@6.1.0-edge.2
  - @memberjunction/ng-shared-generic@6.1.0-edge.2
  - @memberjunction/ng-export-service@6.1.0-edge.2
  - @memberjunction/ng-markdown@6.1.0-edge.2
  - @memberjunction/ng-ui-components@6.1.0-edge.2
  - @memberjunction/ng-pagination@6.1.0-edge.2
  - @memberjunction/export-engine@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
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
  - @memberjunction/ng-ui-components@6.1.0-edge.1
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ng-base-types@6.1.0-edge.1
  - @memberjunction/ng-code-editor@6.1.0-edge.1
  - @memberjunction/ng-export-service@6.1.0-edge.1
  - @memberjunction/ng-markdown@6.1.0-edge.1
  - @memberjunction/ng-notifications@6.1.0-edge.1
  - @memberjunction/ng-pagination@6.1.0-edge.1
  - @memberjunction/ng-shared-generic@6.1.0-edge.1
  - @memberjunction/export-engine@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- b895f92: Angular DOM unit-testing — Phase 4 coverage push. Dev-only (test files + test-config/CI-gate scoping); no runtime change.

  Drives the Generic DOM-coverage ratchet (`scripts/dom-test-report.mjs … --max-none`) from **185 → 137** by writing DOM specs, in usage-ranked order, for every Generic Angular component appropriate for a DOM unit test. Highlights:
  - **Highest-leverage primitives** — `MjFormFieldComponent` (the field renderer behind ~4,000 usages) across its read/edit type matrix; the `ui-components` design system (`MJEmptyStateComponent`, the `mj-page-*` chrome family, `MJDropdown`/`MJCombobox`/`MJFilterPopover` via a new CDK-overlay test helper in `ng-test-utils`, the `mj-dialog` family, tabs, filter panel, left-nav).
  - **Form host stack** — `MjRecordFormContainer`, `MjFormToolbar`, `MjEntityFormHost`, `MjIsaRelatedPanel`, `FormPanelSlot`, `ExplorerEntityDataGrid`, `InteractiveForm`.
  - **Viewers, grids & dialogs** — `EntityDataGrid` + `QueryDataGrid` (AG-Grid chrome), `EntityViewer`, `ArtifactViewerPanel`, the ERD component family (`ERDComposite`/`MJEntityERD`/`ERDDiagram`), plus a broad set of panels/editors/dialogs across agents, artifacts, search, composer, list-management, scheduling, record-process-studio, user-routines, entity-action-ux, actions, and testing.
  - **`Angular/Bootstrap` onboarded** — the last untracked library tree gains a DOM test tier (`MJAuthShell`, `MJBootstrap`) and its own `--max-none=0` CI gate, so every shipped Angular library tree (Explorer, Generic, Bootstrap) is now gated.

  Reusable patterns established for the harder components: drive internal state before the first render (`setup`) rather than mutating post-render (unreliable under zoneless CD); stub the heavy core (AG-Grid, React bridge, SVG layout, plugin viewers) and spy async loaders so specs exercise the component's own chrome/wiring; add each component **and its injected services** to enumerated `tsconfig.spec.json` files (or AOT drops decorator metadata → NG0202).

  Deliberately **not** covered, and left at the 137 floor: five integration/e2e-tier orchestrators (`ConversationChatArea`, `MessageInput`, `RealtimeWhiteboardBoard`, `AITestHarness`, `RealtimeSessionOverlay`) — 1,800–4,600-line components with realtime/WebRTC/canvas cores or 14–30 dependencies, which belong in the browser regression suite rather than DOM units.

- b895f92: Angular DOM unit-testing — Phase 4 (gates, guardrails & spec hygiene). Dev-only; no runtime change.
  - **`test:types` spec type-check gate**: each DOM-testing package gains a
    `"test:types": "tsc --noEmit -p tsconfig.spec.json"` script, run as a cached turbo task in CI
    before the vitest suite (both the affected and full-suite paths). Closes the Phase-3 hole where
    vitest/esbuild's transpile-only path let real spec type errors (broken `import type` paths,
    `Subject`-vs-`EventEmitter`) ride green until the `ngc` build failed.
  - **DOM-spec placement guard** (`scripts/check-dom-spec-placement.mjs`, fast pre-build CI step):
    fails when a `*.dom.test.ts` sits inside `__tests__/`, where a dual-preset package silently runs
    it in neither vitest project. Its one real finding — `ng-markdown`'s service DOM spec — was
    relocated next to its source (test-file move only).
  - Fixes the pre-existing latent 2-args-of-3 `MCPDashboardComponent` constructor call in the
    dashboards node test (the gate's prerequisite).
  - **Anti-pattern lint** (`scripts/check-spec-antipatterns.mjs`, CI): bans vacuous assertions,
    skipped specs, blanket schemas, and `any`/`as never` casts in `*.dom.test.ts`. Enabling it drove
    the spec-hygiene cleanup across `ng-agent-requests` / `ng-query-viewer` / `ng-scheduling` /
    `ng-agents` / `ng-record-changes` (blanket schemas → explicit child stubs; `as never` → typed
    doubles) and the Explorer specs (real DOM clicks instead of handler calls, SVG prototype-patch
    teardown, typed context doubles).
  - **Explorer DOM coverage gate**: `classify-explorer-components.mjs --min 85` in CI — a testable
    Explorer component shipped without a DOM spec now fails the PR.

- Updated dependencies [b895f92]
- Updated dependencies [b895f92]
- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [d26e202]
- Updated dependencies [27e4d09]
  - @memberjunction/ng-ui-components@6.1.0-edge.0
  - @memberjunction/ng-markdown@6.1.0-edge.0
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/ng-base-types@6.1.0-edge.0
  - @memberjunction/ng-code-editor@6.1.0-edge.0
  - @memberjunction/ng-notifications@6.1.0-edge.0
  - @memberjunction/ng-shared-generic@6.1.0-edge.0
  - @memberjunction/ng-export-service@6.1.0-edge.0
  - @memberjunction/ng-pagination@6.1.0-edge.0
  - @memberjunction/export-engine@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ng-base-types@6.0.0
  - @memberjunction/ng-code-editor@6.0.0
  - @memberjunction/ng-notifications@6.0.0
  - @memberjunction/ng-shared-generic@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/ng-export-service@6.0.0
  - @memberjunction/ng-markdown@6.0.0
  - @memberjunction/ng-pagination@6.0.0
  - @memberjunction/ng-ui-components@6.0.0
  - @memberjunction/export-engine@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ng-base-types@5.51.0
  - @memberjunction/ng-code-editor@5.51.0
  - @memberjunction/ng-notifications@5.51.0
  - @memberjunction/ng-shared-generic@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/ng-export-service@5.51.0
  - @memberjunction/ng-markdown@5.51.0
  - @memberjunction/ng-pagination@5.51.0
  - @memberjunction/ng-ui-components@5.51.0
  - @memberjunction/export-engine@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- 0ba33b3: Client-issue batch fixes. Exports (Query viewer, Data Explorer, and User Views) now cover the FULL result set — capped at 100k with an over-cap warning — instead of just the on-screen page, and the Data Explorer toolbar Export button opens a unified Excel/CSV/JSON dialog for every view type (Grid/Cards/Map/Timeline). UI-role users can now create and manage Lists, with owner-scoped delete (or Developer/Integration) enforced server-side on BOTH Lists and List Details — a List Detail's authorization is scoped through its parent List's owner, so a user can't delete membership rows of lists they don't own. Also: grid quick-filter matches hidden columns, primary-key integer columns render without thousands separators, the Queries search-box icon/placeholder overlap is fixed, and the streaming thinking-tag stripper no longer leaks partial `<think>`/`</think>` tags split across chunks — and now flushes a genuine trailing tag-prefix (e.g. a response ending in `<`) at end of stream instead of dropping it.
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
  - @memberjunction/ng-base-types@5.50.0
  - @memberjunction/ng-code-editor@5.50.0
  - @memberjunction/ng-notifications@5.50.0
  - @memberjunction/ng-shared-generic@5.50.0
  - @memberjunction/ng-export-service@5.50.0
  - @memberjunction/ng-markdown@5.50.0
  - @memberjunction/ng-ui-components@5.50.0
  - @memberjunction/ng-pagination@5.50.0
  - @memberjunction/export-engine@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- b5a8e3f: Fix Query Builder ad-hoc query results being capped at 100 rows with no working pager. The ad-hoc query resolver now paginates the first page (StartRow 0) and reports the true total row count via a COUNT(\*) query instead of a TOP-N cap, and the data grid no longer collapses value-identical rows from queries without an ID column. The artifact viewer title and grid toolbar now show the true total row count.
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
  - @memberjunction/ng-export-service@5.49.0
  - @memberjunction/ng-markdown@5.49.0
  - @memberjunction/ng-shared-generic@5.49.0
  - @memberjunction/ng-ui-components@5.49.0
  - @memberjunction/ng-base-types@5.49.0
  - @memberjunction/ng-code-editor@5.49.0
  - @memberjunction/ng-notifications@5.49.0
  - @memberjunction/ng-pagination@5.49.0
  - @memberjunction/export-engine@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/ng-base-types@5.48.0
  - @memberjunction/ng-code-editor@5.48.0
  - @memberjunction/ng-notifications@5.48.0
  - @memberjunction/ng-shared-generic@5.48.0
  - @memberjunction/ng-markdown@5.48.0
  - @memberjunction/ng-export-service@5.48.0
  - @memberjunction/ng-pagination@5.48.0
  - @memberjunction/ng-ui-components@5.48.0
  - @memberjunction/export-engine@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ng-base-types@5.47.0
  - @memberjunction/ng-code-editor@5.47.0
  - @memberjunction/ng-notifications@5.47.0
  - @memberjunction/ng-shared-generic@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/ng-export-service@5.47.0
  - @memberjunction/ng-markdown@5.47.0
  - @memberjunction/ng-pagination@5.47.0
  - @memberjunction/ng-ui-components@5.47.0
  - @memberjunction/export-engine@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/ng-base-types@5.46.0
  - @memberjunction/ng-code-editor@5.46.0
  - @memberjunction/ng-notifications@5.46.0
  - @memberjunction/ng-shared-generic@5.46.0
  - @memberjunction/ng-export-service@5.46.0
  - @memberjunction/ng-markdown@5.46.0
  - @memberjunction/ng-pagination@5.46.0
  - @memberjunction/ng-ui-components@5.46.0
  - @memberjunction/export-engine@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ng-notifications@5.45.1
- @memberjunction/ng-base-types@5.45.1
- @memberjunction/ng-code-editor@5.45.1
- @memberjunction/ng-export-service@5.45.1
- @memberjunction/ng-markdown@5.45.1
- @memberjunction/ng-pagination@5.45.1
- @memberjunction/ng-shared-generic@5.45.1
- @memberjunction/ng-ui-components@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/export-engine@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [13716e4]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/ng-ui-components@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ng-base-types@5.45.0
  - @memberjunction/ng-code-editor@5.45.0
  - @memberjunction/ng-notifications@5.45.0
  - @memberjunction/ng-shared-generic@5.45.0
  - @memberjunction/ng-export-service@5.45.0
  - @memberjunction/ng-markdown@5.45.0
  - @memberjunction/ng-pagination@5.45.0
  - @memberjunction/export-engine@5.45.0

## 5.44.0

### Patch Changes

- f8be8a0: Consolidate collapsible/disclosure UI onto the canonical `<mj-accordion-panel>` across MJ Explorer, and level up the accordion component itself.

  **`@memberjunction/ng-ui-components` (the component):**
  - New **`MJAccordionModule`** — bundles the panel + all three slot directives (`mjAccordionTitle`, `mjAccordionActions`, `mjAccordionBody`) so consumers import one symbol instead of four (works in both NgModule and standalone `imports`). An NgModule is used because AOT can't expand a value-array across a compiled-package boundary (NG1010) and an `as const` tuple is rejected by the `imports` type (TS2322).
  - New lazy **`[mjAccordionBody]`** slot — heavy bodies (code editors, grids, charts) instantiate on first expand and stay alive for animated re-toggle, so consumers don't have to reason about content weight or hand-write `@if (expanded)`.
  - Hardening: `--sm`/`--disabled`/`--muted-icon` modifiers scoped to child combinators (no nested-panel style bleed); `hasBeenExpanded` made non-public per naming conventions; added a DOM test proving the module exposes every declarable.

  **~50 disclosure surfaces migrated** from bespoke `<div (click)>`-header + `@if` markup to `<mj-accordion-panel>` across 20 Angular packages — dashboard-viewer config panels, DevTools Class Registry, Version History diff/snapshot groups, the test-run dialog, Explorer section toggles (about-dialog, sql-logging, SystemDiagnostics, App Roles, Home add-pin, Integration activity, Actions/Permissions/Credentials/Testing/ComponentStudio), and Generic components (agents, clustering, conversations, search, entity-viewer, filter-builder, record-tags, resource-permissions, core-entity-forms). Each replaces a non-focusable `<div (click)>` header with a real `<button [attr.aria-expanded]>` — a genuine accessibility improvement, not cosmetic — and deletes the per-consumer collapse chrome CSS. Card-based collapsibles, trees, and fill-panes are intentionally out of scope (they route to their own primitives).

  No public API changes in the consumer packages (internal refactor). Verified: all affected package test suites pass, CI UI gates green (design tokens + button overrides), and a full audit confirmed side-effects preserved with two visual regressions caught and fixed (SystemDiagnostics severity tint restored with semantic tokens; cluster-scatter members list scroll-confined via `[Fill]`).
  </content>

- 0476455: Migrate inline empty-state placeholders to the canonical `<mj-empty-state>` component across Explorer and Generic Angular packages (UI-consistency objective O4), wiring the component into the packages that needed it (and adding `@memberjunction/ng-ui-components` as a dependency where missing). Also fixes reset-filter CTA correctness in three picker dialogs (sub-agent selector, add-action, action gallery) where the handler cleared only a subset of the active filter dimensions, and refines the UI adoption measurement script with a transparent three-tier empty-state count (raw widened → non-placeholder false-positives → wrappers-around-migrated → genuine).
- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [f8be8a0]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [1e5e449]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [0476455]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ng-ui-components@5.44.0
  - @memberjunction/ng-notifications@5.44.0
  - @memberjunction/ng-base-types@5.44.0
  - @memberjunction/ng-code-editor@5.44.0
  - @memberjunction/ng-shared-generic@5.44.0
  - @memberjunction/ng-export-service@5.44.0
  - @memberjunction/ng-markdown@5.44.0
  - @memberjunction/ng-pagination@5.44.0
  - @memberjunction/export-engine@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
- Updated dependencies [54183aa]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/ng-pagination@5.43.0
  - @memberjunction/ng-base-types@5.43.0
  - @memberjunction/ng-code-editor@5.43.0
  - @memberjunction/ng-notifications@5.43.0
  - @memberjunction/ng-shared-generic@5.43.0
  - @memberjunction/ng-export-service@5.43.0
  - @memberjunction/ng-markdown@5.43.0
  - @memberjunction/export-engine@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/ng-base-types@5.42.0
  - @memberjunction/ng-code-editor@5.42.0
  - @memberjunction/ng-notifications@5.42.0
  - @memberjunction/ng-shared-generic@5.42.0
  - @memberjunction/ng-export-service@5.42.0
  - @memberjunction/ng-markdown@5.42.0
  - @memberjunction/ng-pagination@5.42.0
  - @memberjunction/export-engine@5.42.0

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
  - @memberjunction/ng-notifications@5.41.0
  - @memberjunction/ng-base-types@5.41.0
  - @memberjunction/ng-code-editor@5.41.0
  - @memberjunction/ng-shared-generic@5.41.0
  - @memberjunction/ng-export-service@5.41.0
  - @memberjunction/ng-markdown@5.41.0
  - @memberjunction/ng-pagination@5.41.0
  - @memberjunction/export-engine@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ng-base-types@5.40.2
- @memberjunction/ng-code-editor@5.40.2
- @memberjunction/ng-export-service@5.40.2
- @memberjunction/ng-markdown@5.40.2
- @memberjunction/ng-notifications@5.40.2
- @memberjunction/ng-pagination@5.40.2
- @memberjunction/ng-shared-generic@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/export-engine@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ng-base-types@5.40.1
  - @memberjunction/ng-code-editor@5.40.1
  - @memberjunction/ng-notifications@5.40.1
  - @memberjunction/ng-shared-generic@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/ng-export-service@5.40.1
  - @memberjunction/ng-markdown@5.40.1
  - @memberjunction/ng-pagination@5.40.1
  - @memberjunction/export-engine@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/ng-base-types@5.40.0
  - @memberjunction/ng-code-editor@5.40.0
  - @memberjunction/ng-notifications@5.40.0
  - @memberjunction/ng-shared-generic@5.40.0
  - @memberjunction/ng-export-service@5.40.0
  - @memberjunction/ng-markdown@5.40.0
  - @memberjunction/ng-pagination@5.40.0
  - @memberjunction/export-engine@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [4bc6fb4]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [5b4102c]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/ng-shared-generic@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ng-markdown@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ng-base-types@5.39.0
  - @memberjunction/ng-code-editor@5.39.0
  - @memberjunction/ng-notifications@5.39.0
  - @memberjunction/ng-export-service@5.39.0
  - @memberjunction/ng-pagination@5.39.0
  - @memberjunction/export-engine@5.39.0

## 5.38.0

### Patch Changes

- ebb0e3d: Eliminate provider.Refresh() from query save/delete paths, introduce MJQueryEntityExtended with child-relationship getters and business logic, migrate all QueryInfo consumers outside MJCore to use QueryEngine and entity types, remove dead QueryCacheManager, and replace 12 redundant RunView calls with QueryEngine cache reads. Fixes major performance bottleneck on large-entity deployments where every query save reloaded the entire metadata graph.
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
  - @memberjunction/ng-code-editor@5.38.0
  - @memberjunction/ng-base-types@5.38.0
  - @memberjunction/ng-notifications@5.38.0
  - @memberjunction/ng-shared-generic@5.38.0
  - @memberjunction/ng-export-service@5.38.0
  - @memberjunction/ng-markdown@5.38.0
  - @memberjunction/ng-pagination@5.38.0
  - @memberjunction/export-engine@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ng-notifications@5.37.0
  - @memberjunction/ng-base-types@5.37.0
  - @memberjunction/ng-code-editor@5.37.0
  - @memberjunction/ng-shared-generic@5.37.0
  - @memberjunction/ng-export-service@5.37.0
  - @memberjunction/ng-markdown@5.37.0
  - @memberjunction/ng-pagination@5.37.0
  - @memberjunction/export-engine@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ng-notifications@5.36.0
  - @memberjunction/ng-base-types@5.36.0
  - @memberjunction/ng-code-editor@5.36.0
  - @memberjunction/ng-shared-generic@5.36.0
  - @memberjunction/ng-export-service@5.36.0
  - @memberjunction/ng-markdown@5.36.0
  - @memberjunction/ng-pagination@5.36.0
  - @memberjunction/export-engine@5.36.0
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
  - @memberjunction/global@5.35.0
  - @memberjunction/ng-base-types@5.35.0
  - @memberjunction/ng-code-editor@5.35.0
  - @memberjunction/ng-notifications@5.35.0
  - @memberjunction/ng-shared-generic@5.35.0
  - @memberjunction/ng-export-service@5.35.0
  - @memberjunction/ng-markdown@5.35.0
  - @memberjunction/ng-pagination@5.35.0
  - @memberjunction/export-engine@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/ng-base-types@5.34.1
  - @memberjunction/ng-code-editor@5.34.1
  - @memberjunction/ng-notifications@5.34.1
  - @memberjunction/ng-shared-generic@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/ng-export-service@5.34.1
  - @memberjunction/ng-markdown@5.34.1
  - @memberjunction/ng-pagination@5.34.1
  - @memberjunction/export-engine@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [b03bfb4]
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/ng-markdown@5.34.0
  - @memberjunction/ng-pagination@5.34.0
  - @memberjunction/ng-base-types@5.34.0
  - @memberjunction/ng-code-editor@5.34.0
  - @memberjunction/ng-export-service@5.34.0
  - @memberjunction/ng-notifications@5.34.0
  - @memberjunction/ng-shared-generic@5.34.0
  - @memberjunction/export-engine@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ng-notifications@5.33.0
  - @memberjunction/ng-base-types@5.33.0
  - @memberjunction/ng-code-editor@5.33.0
  - @memberjunction/ng-shared-generic@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/ng-export-service@5.33.0
  - @memberjunction/ng-markdown@5.33.0
  - @memberjunction/ng-pagination@5.33.0
  - @memberjunction/export-engine@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ng-base-types@5.32.0
  - @memberjunction/ng-code-editor@5.32.0
  - @memberjunction/ng-notifications@5.32.0
  - @memberjunction/ng-shared-generic@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/ng-export-service@5.32.0
  - @memberjunction/ng-markdown@5.32.0
  - @memberjunction/ng-pagination@5.32.0
  - @memberjunction/export-engine@5.32.0
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
- Updated dependencies [0e3365f]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/ng-base-types@5.31.0
  - @memberjunction/ng-code-editor@5.31.0
  - @memberjunction/ng-export-service@5.31.0
  - @memberjunction/ng-markdown@5.31.0
  - @memberjunction/ng-notifications@5.31.0
  - @memberjunction/ng-pagination@5.31.0
  - @memberjunction/ng-shared-generic@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/export-engine@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ng-code-editor@5.30.1
- @memberjunction/ng-export-service@5.30.1
- @memberjunction/ng-markdown@5.30.1
- @memberjunction/ng-notifications@5.30.1
- @memberjunction/ng-pagination@5.30.1
- @memberjunction/ng-shared-generic@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/export-engine@5.30.1
- @memberjunction/global@5.30.1

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
  - @memberjunction/ng-code-editor@5.30.0
  - @memberjunction/ng-notifications@5.30.0
  - @memberjunction/ng-shared-generic@5.30.0
  - @memberjunction/ng-export-service@5.30.0
  - @memberjunction/ng-markdown@5.30.0
  - @memberjunction/ng-pagination@5.30.0
  - @memberjunction/export-engine@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ng-code-editor@5.29.0
  - @memberjunction/ng-notifications@5.29.0
  - @memberjunction/ng-shared-generic@5.29.0
  - @memberjunction/ng-export-service@5.29.0
  - @memberjunction/ng-markdown@5.29.0
  - @memberjunction/ng-pagination@5.29.0
  - @memberjunction/export-engine@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ng-code-editor@5.28.0
  - @memberjunction/ng-notifications@5.28.0
  - @memberjunction/ng-shared-generic@5.28.0
  - @memberjunction/ng-export-service@5.28.0
  - @memberjunction/ng-markdown@5.28.0
  - @memberjunction/ng-pagination@5.28.0
  - @memberjunction/export-engine@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ng-code-editor@5.27.1
  - @memberjunction/ng-notifications@5.27.1
  - @memberjunction/ng-shared-generic@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/ng-export-service@5.27.1
  - @memberjunction/ng-markdown@5.27.1
  - @memberjunction/ng-pagination@5.27.1
  - @memberjunction/export-engine@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ng-code-editor@5.27.0
- @memberjunction/ng-export-service@5.27.0
- @memberjunction/ng-markdown@5.27.0
- @memberjunction/ng-notifications@5.27.0
- @memberjunction/ng-pagination@5.27.0
- @memberjunction/ng-shared-generic@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/export-engine@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/ng-code-editor@5.26.0
  - @memberjunction/ng-shared-generic@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ng-notifications@5.26.0
  - @memberjunction/ng-export-service@5.26.0
  - @memberjunction/ng-markdown@5.26.0
  - @memberjunction/ng-pagination@5.26.0
  - @memberjunction/export-engine@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- fc8cd52: Autotagging pipeline with run tracking, retry, and tag merge/delete; taxonomy server-side SQL aggregates; vector sync credential engine integration; search resolver and organic key support; unit test fixes across geo-core, ai-vector-sync, MJServer, and UUID compliance.
- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/ng-code-editor@5.25.0
  - @memberjunction/ng-notifications@5.25.0
  - @memberjunction/ng-shared-generic@5.25.0
  - @memberjunction/ng-export-service@5.25.0
  - @memberjunction/ng-markdown@5.25.0
  - @memberjunction/ng-pagination@5.25.0
  - @memberjunction/export-engine@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/ng-notifications@5.24.0
  - @memberjunction/ng-code-editor@5.24.0
  - @memberjunction/ng-shared-generic@5.24.0
  - @memberjunction/ng-export-service@5.24.0
  - @memberjunction/ng-markdown@5.24.0
  - @memberjunction/ng-pagination@5.24.0
  - @memberjunction/export-engine@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ng-code-editor@5.23.0
  - @memberjunction/ng-notifications@5.23.0
  - @memberjunction/ng-shared-generic@5.23.0
  - @memberjunction/ng-export-service@5.23.0
  - @memberjunction/ng-markdown@5.23.0
  - @memberjunction/ng-pagination@5.23.0
  - @memberjunction/export-engine@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/ng-code-editor@5.22.0
  - @memberjunction/ng-notifications@5.22.0
  - @memberjunction/ng-shared-generic@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/ng-export-service@5.22.0
  - @memberjunction/ng-markdown@5.22.0
  - @memberjunction/ng-pagination@5.22.0
  - @memberjunction/export-engine@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/ng-code-editor@5.21.0
  - @memberjunction/ng-notifications@5.21.0
  - @memberjunction/ng-shared-generic@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/ng-export-service@5.21.0
  - @memberjunction/ng-markdown@5.21.0
  - @memberjunction/ng-pagination@5.21.0
  - @memberjunction/export-engine@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ng-code-editor@5.20.0
  - @memberjunction/ng-notifications@5.20.0
  - @memberjunction/ng-shared-generic@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/ng-export-service@5.20.0
  - @memberjunction/ng-markdown@5.20.0
  - @memberjunction/ng-pagination@5.20.0
  - @memberjunction/export-engine@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ng-code-editor@5.19.0
- @memberjunction/ng-export-service@5.19.0
- @memberjunction/ng-markdown@5.19.0
- @memberjunction/ng-notifications@5.19.0
- @memberjunction/ng-pagination@5.19.0
- @memberjunction/ng-shared-generic@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/export-engine@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [de310bc]
  - @memberjunction/ng-markdown@5.18.0
  - @memberjunction/ng-notifications@5.18.0
  - @memberjunction/ng-code-editor@5.18.0
  - @memberjunction/ng-export-service@5.18.0
  - @memberjunction/ng-pagination@5.18.0
  - @memberjunction/ng-shared-generic@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/export-engine@5.18.0
  - @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/ng-notifications@5.17.0
  - @memberjunction/ng-code-editor@5.17.0
  - @memberjunction/ng-shared-generic@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/ng-export-service@5.17.0
  - @memberjunction/ng-markdown@5.17.0
  - @memberjunction/ng-pagination@5.17.0
  - @memberjunction/export-engine@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/ng-code-editor@5.16.0
  - @memberjunction/ng-notifications@5.16.0
  - @memberjunction/ng-shared-generic@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/ng-export-service@5.16.0
  - @memberjunction/ng-markdown@5.16.0
  - @memberjunction/ng-pagination@5.16.0
  - @memberjunction/export-engine@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/ng-code-editor@5.15.0
  - @memberjunction/ng-notifications@5.15.0
  - @memberjunction/ng-shared-generic@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/ng-export-service@5.15.0
  - @memberjunction/ng-markdown@5.15.0
  - @memberjunction/ng-pagination@5.15.0
  - @memberjunction/export-engine@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/ng-code-editor@5.14.0
  - @memberjunction/ng-notifications@5.14.0
  - @memberjunction/ng-shared-generic@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/ng-export-service@5.14.0
  - @memberjunction/ng-markdown@5.14.0
  - @memberjunction/ng-pagination@5.14.0
  - @memberjunction/export-engine@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ng-code-editor@5.13.0
  - @memberjunction/ng-notifications@5.13.0
  - @memberjunction/ng-shared-generic@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/ng-export-service@5.13.0
  - @memberjunction/ng-markdown@5.13.0
  - @memberjunction/ng-pagination@5.13.0
  - @memberjunction/export-engine@5.13.0

## 5.12.0

### Minor Changes

- 05f19ff: Add composable query system with semantic catalog search, CTE composition engine, server-side paging, query caching with TTL/dependency invalidation, and agent directive surfacing. Includes QueryCacheManager wrapper over LocalCacheManager, QueryPagingEngine for SQL-level OFFSET/FETCH paging, QueryCompositionEngine for platform-aware CTE generation, and SearchQueryCatalog action for vector-based query discovery. Renames PaginationComponent to DataPagerComponent and extracts into shared module.

### Patch Changes

- a57b8d5: Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
- e87d153: design tokens phase 1
- Updated dependencies [05f19ff]
- Updated dependencies [a57b8d5]
- Updated dependencies [e87d153]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/ng-shared-generic@5.12.0
  - @memberjunction/ng-pagination@5.12.0
  - @memberjunction/ng-code-editor@5.12.0
  - @memberjunction/ng-export-service@5.12.0
  - @memberjunction/ng-markdown@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ng-notifications@5.12.0
  - @memberjunction/export-engine@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Minor Changes

- a4c3c81: migration/metadata

### Patch Changes

- 457afcf: Add create/edit query drawer to Query Browser; fix full record toolbar; suppress duplicate empty state in query grid
- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/ng-notifications@5.11.0
  - @memberjunction/ng-code-editor@5.11.0
  - @memberjunction/ng-shared-generic@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/ng-export-service@5.11.0
  - @memberjunction/ng-markdown@5.11.0
  - @memberjunction/export-engine@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ng-export-service@5.10.1
- @memberjunction/ng-markdown@5.10.1
- @memberjunction/ng-notifications@5.10.1
- @memberjunction/ng-shared-generic@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/export-engine@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- 3df5e4b: no migration
- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/ng-notifications@5.10.0
  - @memberjunction/ng-shared-generic@5.10.0
  - @memberjunction/ng-export-service@5.10.0
  - @memberjunction/ng-markdown@5.10.0
  - @memberjunction/export-engine@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ng-notifications@5.9.0
  - @memberjunction/ng-shared-generic@5.9.0
  - @memberjunction/ng-export-service@5.9.0
  - @memberjunction/export-engine@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/ng-notifications@5.8.0
  - @memberjunction/ng-shared-generic@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/ng-export-service@5.8.0
  - @memberjunction/export-engine@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/ng-notifications@5.7.0
  - @memberjunction/ng-shared-generic@5.7.0
  - @memberjunction/ng-export-service@5.7.0
  - @memberjunction/export-engine@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ng-notifications@5.6.0
  - @memberjunction/ng-shared-generic@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/ng-export-service@5.6.0
  - @memberjunction/export-engine@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ng-export-service@5.5.0
  - @memberjunction/ng-notifications@5.5.0
  - @memberjunction/ng-shared-generic@5.5.0
  - @memberjunction/export-engine@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ng-export-service@5.4.1
- @memberjunction/ng-notifications@5.4.1
- @memberjunction/ng-shared-generic@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/export-engine@5.4.1
- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ng-notifications@5.4.0
  - @memberjunction/ng-shared-generic@5.4.0
  - @memberjunction/ng-export-service@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/export-engine@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ng-export-service@5.3.1
- @memberjunction/ng-notifications@5.3.1
- @memberjunction/ng-shared-generic@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/export-engine@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ng-notifications@5.3.0
  - @memberjunction/ng-shared-generic@5.3.0
  - @memberjunction/ng-export-service@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/export-engine@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Minor Changes

- 06d889c: metadata -> migration
- 3542cb6: metadata -> migration

### Patch Changes

- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/ng-notifications@5.2.0
  - @memberjunction/ng-shared-generic@5.2.0
  - @memberjunction/ng-export-service@5.2.0
  - @memberjunction/export-engine@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ng-notifications@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/ng-shared-generic@5.1.0
  - @memberjunction/ng-export-service@5.1.0
  - @memberjunction/export-engine@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ng-export-service@5.0.0
  - @memberjunction/ng-notifications@5.0.0
  - @memberjunction/ng-shared-generic@5.0.0
  - @memberjunction/export-engine@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ng-notifications@4.4.0
  - @memberjunction/ng-shared-generic@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/ng-export-service@4.4.0
  - @memberjunction/export-engine@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ng-export-service@4.3.1
- @memberjunction/ng-notifications@4.3.1
- @memberjunction/ng-shared-generic@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/export-engine@4.3.1
- @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ng-notifications@4.3.0
  - @memberjunction/ng-shared-generic@4.3.0
  - @memberjunction/ng-export-service@4.3.0
  - @memberjunction/export-engine@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ng-export-service@4.2.0
- @memberjunction/ng-notifications@4.2.0
- @memberjunction/ng-shared-generic@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/export-engine@4.2.0
- @memberjunction/global@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [9fab8ca]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/export-engine@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ng-notifications@4.1.0
  - @memberjunction/ng-shared-generic@4.1.0
  - @memberjunction/ng-export-service@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ng-export-service@4.0.0
  - @memberjunction/ng-notifications@4.0.0
  - @memberjunction/ng-shared-generic@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/export-engine@4.0.0
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/ng-notifications@3.4.0
  - @memberjunction/ng-shared-generic@3.4.0
  - @memberjunction/ng-export-service@3.4.0
  - @memberjunction/export-engine@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/ng-notifications@3.3.0
  - @memberjunction/ng-shared-generic@3.3.0
  - @memberjunction/ng-export-service@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/export-engine@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/ng-notifications@3.2.0
  - @memberjunction/ng-shared-generic@3.2.0
  - @memberjunction/ng-export-service@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/export-engine@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ng-notifications@3.1.1
- @memberjunction/ng-export-service@3.1.1
- @memberjunction/ng-shared-generic@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/export-engine@3.1.1
- @memberjunction/global@3.1.1

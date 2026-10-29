# @memberjunction/sql-dialect

## 6.2.0-edge.6

### Minor Changes

- cc36de5: Add Alternate Base Views (MJ Canon Layer 1): allow entities to register governed SQL views (`MJ: Entity Alternate Base Views`) that maintain 100% column parity with the canonical `BaseView` while returning curated row subsets (such as `Active` members or `Open` orders), with full support across `RunView`, `RunViews`, `BaseEngine`, `LocalCacheManager`, `CodeGen` column-parity validation, `QueryEntity.AlternateBaseViewID` lineage extraction, `QueryGen`, `Lists`, `DataContext`, `GetEntityDetails`, and `MJExplorer` Data Explorer / Entity Viewer.
- 5b41d48: fix: the SQL a prompt is asked to write, and the connection its result is re-executed on, are both chosen from `provider.PlatformKey`

  MemberJunction assumed SQL Server wherever an agent touched SQL. Two faces of the same problem, fixed together.

  **The prompts taught T-SQL unconditionally.** `sql-query-writer` opened with "you are the world's greatest expert in Microsoft SQL Server and T-SQL"; the shipped query-generation prompts taught `ISNULL`, `DATEADD`, `GETDATE` and `[bracketed]` identifiers with no dialect token anywhere under `metadata/prompts`. A PostgreSQL tenant's agent burned LLM turns writing T-SQL, failing, retrying and failing again.

  The dialect now reaches templates as a **system placeholder**, not a registry of TemplateIDs: `_SQL_DIALECT`, `_SQL_DIALECT_NAME` and `_SQL_DIALECT_RULES` resolve on every prompt render from the request's own provider (falling back to `Metadata.Provider`, then to SQL Server). Any template that references them is parameterised — nothing has to be registered, so a template added later cannot be left off a list. `_SQL_DIALECT_RULES` is composed by `SQLDialect.PromptGuidance` from the dialect's own primitives (`QuoteIdentifier`, `LimitClause`, `IsNull`, `DateAddExpression`, `NewUUID`, …), so implementing a dialect is sufficient to get correct guidance — there is no second per-dialect prose table to maintain.

  **The ad-hoc read-only path reached for an mssql pool.** `AdhocQueryResolver.ExecuteAdhocQuery` required a SQL Server `ConnectionPool` from `context.dataSources` before it would run anything. A PostgreSQL provider never populates one, so every ad-hoc query on PG returned "No read-only data source available for ad-hoc query execution" — rendered downstream as "Showing cached data" — even though the `GetReadOnlyProvider` call directly beneath it already knew the tenant was PostgreSQL. Both questions (which dialect to render, and what to execute on) now come from the same read-only provider, and execution goes through `provider.ExecuteSQL`, which every platform implements.

  Also fixed: `Run Ad-hoc Query` resolved `{{query:"..."}}` composition macros against a hardcoded `'sqlserver'`, and `QueryBuilderAgent` re-formatted every tenant's SQL with `sql-formatter`'s `tsql` language.

  **The SQL safety allowlists were T-SQL vocabularies.** `ALLOWED_SQL_FUNCTIONS` (`@memberjunction/global`) and `ALLOWED_SQL_KEYWORDS` (`@memberjunction/core`) listed only SQL Server's read-only names, so an ordinary PostgreSQL expression was refused before it ever reached a database that would have run it: `DATE_TRUNC('month', CreatedAt)` came back as "Function 'DATE_TRUNC' is not allowed", and `ARRAY_AGG(Name)` failed both the function allowlist and the "an aggregate context must contain an aggregate" rule. Both lists now carry the UNION of the supported dialects' read-only vocabulary — deliberately, and documented in the code: these are deny-by-default SAFETY screens, not dialect grammars, and a PostgreSQL name that reaches a SQL Server tenant is rejected by the SQL Server parser on its own. Nothing that writes, escalates, or reaches outside the statement was added, and `DANGEROUS_SQL_KEYWORDS` is still checked first, so a name on the allowlist can never unblock one that is denied.

  **The row cap's safety net still emitted `TOP`.** `ensureRowLimit`'s AST path (`QueryPagingEngine.WrapWithMaxRows`) was already dialect-aware, but the `catch` arm beneath it rewrote `SELECT` to `SELECT TOP n` unconditionally. That arm is reached precisely when the AST path could not understand the SQL — so on a PostgreSQL tenant a query that merely confused the parser came back as SQL that could not parse at all. The fallback now asks the same `resolvePlatform()` seam as the rest of the action, appends `LIMIT n` on PostgreSQL, and treats an existing `LIMIT` as already capped.

  New in `@memberjunction/core`: `ResolvePlatformKey`, `DEFAULT_DATABASE_PLATFORM`, `DescribeSQLDialectForPrompt`, `DescribeSQLDialectName`, `ResolveSQLFormatterLanguage`. New in `@memberjunction/sql-dialect`: `SQLDialect.DisplayName`, `SQLDialect.FormatterLanguage`, `SQLDialect.PromptGuidance`, `IsSupportedPlatform`, `SupportedPlatforms`.

  Behaviour on SQL Server tenants is unchanged: every fallback resolves to `sqlserver`, the historical default.

### Patch Changes

- 914e6ff: Field-level security close-out: a denied value never reaches anyone the rule does not entitle.

  The rule is no longer "API output is the perimeter". A denied value may sit in server memory, but must never reach a principal the rule does not entitle: an API caller, an LLM's context, a message recipient, or a reader of a stored artifact such as an embedding, tag or log. See the rewritten `guides/FIELD_LEVEL_SECURITY_GUIDE.md`, including its new §6 developer checklist, the `.claude/rules/field-security.md` rule and the `mj-field-security` skill.

  **An entity object never holds a value its user is denied.** Every hydration path (`Load`, `LoadFromData`, `Hydrate`, RunView `entity_object`, the IS-A parent merge, `SaveEntityGraph` results and the re-read after `Save()`) leaves a restricted user's denied fields `NotLoaded`. So does `NewRecord()`: a new record holds no default for a field its user may not read, so a browser graph create or a new related row no longer sends one. Setting `ContextCurrentUser` on an object that already holds a record narrows it (and its IS-A parent, embedded records and the children of its loaded related-record collections) to the new user; nothing is widened. A read-only cache collection is deliberately not narrowed: its children are the engine's shared objects, which keep engine width and are never serialized to a client. `LoadFromData` given an entity object reads that object's own `GetAll()`, and `CopyFrom` skips the fields its user may not read instead of stopping at the first one. `GetAll()`, `To()`, `GetDataObject(JSON)`, `Fields[].Value` and `JSON.stringify(entity)` are therefore correct without changes. System-user and unrestricted objects keep the zero-copy fast path; shared cache rows are never modified. New: `ProjectEntityValuesForUser` / `ProjectEntityValueRowsForUser` (the one output projection every transport uses), `AssertClientInputWritableForUser`, and `BaseEntity.IsFieldReadableByActiveUser`.

  **Work on behalf of a user runs as that user.**
  - Entity communication previews and sends read recipients and related data as the sender (previously the system user, which bypassed row-level security, entity permissions and field security). A merge field the sender cannot read renders empty.
  - Templates render with the user of each render instead of the first caller's. Callers must pass that user as `ContextUser` (the Entity Document parser, vector sync and duplicate detection now do). A render with no user still runs, but an extension that needs a user (an `{% AIPrompt %}` tag) fails it with an error instead of hanging or falling back to whichever caller first configured the engine. A template error after an `{% AIPrompt %}` tag now fails the render instead of leaving it waiting forever, and a non-string `AIModel` parameter fails it with a clear message.
  - Entity actions load their record as the caller; `execute-agent` and the agent context injector project engine-cached notes and examples for the run's user.
  - A2A builds each task's entity and agent handlers as the authenticated caller, refuses to run with no resolvable user (or a caller whose cached user record is inactive) instead of picking the first cached user, and keeps each task private to its caller.
  - New `UserScopedCacheKey` (`@memberjunction/global`). The agent data-source cache, the Entity Document placeholder cache and the IS-A subtype lookup cache key on the user, so one user's rows are never served to another. The Entity Document placeholder cache is bounded at 10,000 entries, evicted least-recently-used, since its key changes with every record edit. The in-memory vector index is cached per permission class (entity read, effective row filter, denied vector columns), bounded and evicted least-recently-used, and a save reaches a row-filtered class only if that class can read the row.

  **Every transport projects its output and gates its input:** GraphQL CRUD (including the row `DeleteRecord` returns), transaction groups (including the update delta), `SaveEntityGraph`, File, Query and User View resolvers, entity-action results, agent-run and test-run streams, REST, MCP and A2A. Embedded-record request input and `MergeRecords` field maps reject denied and unknown keys with the same message.

  **Behaviour changes to be aware of:**
  - **Client input naming a field the caller cannot read, or no field at all, is rejected** (`Field 'X' cannot be written on entity 'Y'.`), for callers denied anything on the entity. It was silently dropped before. Well-behaved clients never send such keys.
  - **REST `runView` / `runViews` always return `simple` rows**, whatever `ResultType` the request asks for.
  - **CloudEvents and the debug log carry only the primary key and changed field names** for an entity with field security, never values (save events now carry the changed names captured before the save resets dirty state, so the list is no longer empty). Cache-invalidation broadcasts never carry row data for such an entity, and `MJ: Record Changes` rows never ride the record-data broadcast or CloudEvents.
  - **Entity status messages over the websocket go only to the session whose user owns the object**, and never carry a record payload for a delete, for an entity with field security, or for Record Changes. Previously one subscription per entity relayed every event, deletes included with the whole old row, to whichever session subscribed first.
  - **A field-security refusal throws a `FieldSecurityError` from the provider's RunView path** instead of returning `Success: false`. One refused view in a `RunViews` batch fails only that view: it comes back `Success: false` with the refusal's message, and the other views run.
  - **`RunViewsWithCacheCheck` checks entity Read for every item before anything can be answered from the server cache** (an item sent without `cacheStatus` used to be served another user's cached rows unchecked); view-only requests skip the server cache.
  - **Ad-hoc SQL is restricted for every entity, not only those with field security.** For any caller except the system user, every table the statement reads must be an entity base view the caller can read with no row-level filter and no denied field, because raw SQL applies neither. The system user is exempt only when passed explicitly: ad-hoc SQL with no user is refused instead of running as the process user. The provider checks the rendering it executes on every path, including `ExecuteQueryFromSpec` (`TestQuerySQL` used to check one render and execute another).
  - **An ordinal `OrderBy` item (`OrderBy: "3"`) is refused for callers denied anything on the entity**, since it sorts by a column of `SELECT *` that may be denied. Named sorts are checked as before.
  - **Query templates refuse the non-deterministic `random` filter**, since the SQL a caller is checked against and the SQL that runs are rendered separately.
  - **Saved queries without a role list check entity Read on every entity the SQL reads**, for every caller, with the entities derived from the SQL rather than `QueryEntities`. SQL that cannot be read is refused for a user who cannot read every entity.
  - **For a user carrying any field denial, a saved query without a role-list grant is refused when it reads a relation that is not a CTE or an entity's base view or base table**: custom views, synonyms, table-valued functions, temp tables, names in another database, and `EXEC`/`CALL`. What those read cannot be checked. A query whose role list includes the user still runs. This can break existing saved queries over custom reporting views for restricted users; grant them through `MJ: Query Permissions` after reviewing their SQL.
  - **MCP `Run_*_View` and A2A `QueryEntity` run the client clause screen** on caller filters and sorts, as GraphQL and REST do.
  - **Data Context SQL and query items always re-run**, and entity items whose entity has field security (or for which the reader has a row filter) ignore saved `DataJSON` and re-run for the reader.
  - Non-canonical Access spellings (`'deny'`, `'ALLOW'`) are normalized on save.
  - **An `{% AIPrompt %}` tag whose model is missing or whose model call fails now fails the render**, with a user as without one. It used to write "Error: …" into the output, so a communication that used to send with an error in its body now does not send at all.
  - **An entity communication skips a recipient whose address field the sender cannot read**, reporting `Recipient skipped: the sender cannot read the address field` for that recipient (new `Skipped` / `SkipReason` on each result item) and still sending to the others; the run reports `Success: false` when any recipient was skipped. `RunEntityCommunicationByViewID` refuses a view that does not belong to the requested entity.
  - **The A2A agent card is minimal when `a2aServerSettings.userEmail` is not set**: no entity or agent lists (it was previously built as the system user). Set `userEmail` to a service user to advertise what that user may see. When `userEmail` is set but matches no user, `/a2a/agent-card` answers **503** instead of building the card as someone else.
  - **MCP Create/Update entity tool schemas leave out fields the session user may not write or read**, shared per set of denials. For a caller who is denied at least one field on the entity, the MCP Create and Update tools refuse a key that names a field the caller cannot read, or no field at all, with the same message GraphQL and REST use. For a caller denied nothing, unknown keys are ignored, as REST does. A field the caller can read but not create is accepted on Create and left out by the save, so the column takes its default, as at GraphQL and REST; on Update a field the caller can read but not update is rejected by the save.
  - **External vector index results (`FetchEntityVectors`) are filtered by row-level security**: a match is returned only when the caller can read its record; a match without `RecordID` metadata is dropped.
  - The MCP client's OAuth token cache is keyed by connection and user.
  - **`RunAction` output and the action execution log (`Params`, `ResultParams`) are projected** with the new `ProjectActionParamValuesForUser` (`@memberjunction/actions-base`): for the caller on `RunAction`, for the user the action ran for in the log. An entity object in an output parameter is now sent as its projected field values when the user may read its entity (it was dropped from `RunAction` output, and serialized as internal state in the log); one of an entity the user cannot read stays dropped from `RunAction` output and is logged as `null`. A plain object shaped like a row of an entity the user is denied fields on (it carries the primary key and at least 80% of its keys are that entity's fields) loses the denied keys. That heuristic is a backstop. These are not projected: rows without their primary key or with more extra keys, entity objects and rows nested more than 6 levels deep (`ACTION_PARAM_PROJECTION_MAX_DEPTH`), objects with a `toJSON()` method, instances of other classes (dropped from `RunAction` output, but serialized into the log), JSON-string values and `ActionResult.Message`. The log's `UserID` is the user the action ran for, not the engine's configured user.

  **One parse-based gate on every clause a view runs.** New `FieldSecuritySQLGate` resolves identifiers from the dialect-aware SQL scanner, so names in strings and comments are ignored and quoted, bracketed or look-alike spellings are caught. The provider applies it to `ExtraFilter`, `OrderBy`, aggregates, `OverrideExcludeFilter`, search terms spliced into SQL, and a saved view's stored `WhereClause`/`OrderByClause` (including `CustomWhereClause` views and `ViewID`-only requests; the pre-gate reads a saved view's stored sort through its typed `OrderByClause` property). Entities on an external data source get the same gates on the clauses handed to their driver, and their rows are projected for the caller, `ViewID`-only requests included. A saved view's typed properties may not filter a field the caller cannot read (IS-A included), and the refusal throws `FieldSecurityError`. Whole-row constructs (`SELECT *`, `alias.*`, `FOR JSON/XML`, `CHECKSUM(*)`, `NATURAL JOIN`) and unreadable SQL are refused only for callers denied something. For those callers a column that does not exist produces the same error as a denied one, and a name holding a control, format or default-ignorable character is refused (SQL Server still resolves `[Salary]` with a U+2060 word joiner typed after `Sal` to the real column). `SELECT *` inside `EXISTS (…)` stays allowed only without a set operation (`UNION`/`INTERSECT`/`EXCEPT`) or row-picking `ORDER BY`/`OFFSET`/`FETCH`/`LIMIT`. PostgreSQL `U&"…"` identifiers (any case, optional `UESCAPE`) are decoded and checked as the name they spell; a malformed escape makes the text unreadable, so it is refused. This closes the saved-view filter residual.

  **Saved queries enforce field security.** The SQL a run will execute is checked against the caller's denials in every clause, with the entities taken from the SQL rather than `QueryEntities`; `SELECT *` and untraceable columns fail closed. A query's role list (`MJ: Query Permissions`) still authorizes on its own. Agent SQL artifacts and Data Context SQL items go through the ad-hoc SQL authorizer on the read-only connection.

  **Caches.** Server RunView cache slots are segmented by field-security fingerprint, like row-level security, and read-time projection checks every row. Every server path builds the slot key with one method, `ProviderBase.ComputeRunViewCacheFingerprint`. A browser's cached view results are answered "stale" when the user's field-security key has changed.

  **Datasets** keep one full-width shared cache slot per item: a caller denied fields never has them selected, such a narrowed read is not written to the shared slot, rows are projected for the caller on hits and misses, and item filters are gated. **Record Changes** payloads on `ViewID`-only RunViews are projected per row. A restricted user's own saves and deletes now store full-width Record Change payloads: when the saving object is narrower than the entity, the provider reads the stored row once (on the save's connection) and builds `FullRecordJSON` and the old-values side from it, so the audit trail and recycle-bin restores keep the columns the user could not read; `ChangesJSON` still lists only what changed. The snapshot read selects only the columns the saver may not read, runs only when such a column is missing, and inside a transaction group uses the group's own connection; PostgreSQL deletes snapshot old values the same way as SQL Server. A create no longer records a value for a field the user was not allowed to supply.

  **Derived indexes.** Entity Document template data, vector display metadata, Entity Record Document text, duplicate-detection text and reasoning, the record-process inference default mapping and autotagging content leave out any field not readable by every role: one with a `Deny` or `No Access` read rule, no rules at all, or no `Allow` read rule for a role that can read the entity. The rule is `GetIndexRestrictedFieldNames` in `@memberjunction/core`, shared by every consumer; it returns each field under its `Name` and its `CodeName`, since a row selected with an explicit field list is keyed by code name. Related rows an Entity Document pulls in with `Relationship()` leave out the same fields of the related entity and any field the render's user may not read (the join field is kept, under its name and code name). The record-process inference context document (`Context.EntityDocumentID`) renders without the record's own index-restricted fields (unless `Context.Fields` names the fields) and without the run user's denied fields. The Entity Document placeholder cache keys on a hash of the record values (strings JSON-quoted) as well as the user, so a stripped render never gets back a value cached by an unstripped one. Search results, external vector metadata and duplicate candidates are projected per reader. **Admins must re-index** after upgrading: re-vectorize Entity Documents on FLS entities (rebuild external stores such as Pinecone), re-run Entity autotagging, and review tags produced from restricted text.

  **IS-A children inherit their ancestors' field rules.** `EntityInfo.FieldLevelSecurityApplies` (new) is true when the entity's own flag or any ancestor's is on, and every runtime gate uses it, including the Angular form field's read and write checks. Denied sets inherit, but only on the child's mirrors of parent fields. `ParentChain` caches only a complete chain. A subtype selector reaching a denied field gives "no subtype" instead of throwing.

  **Denied-set memo** keys on per-entity generations (self and ancestors) and the user's roles instead of counts; `EntityInfo.InvalidateFieldSecurityCache()` (new) is for in-place rule edits.

  **Configuration guards.** Re-pointing a rule's `RoleID` or `EntityFieldID` is judged against the target it leaves as well as the one it lands on; `MJ: User Roles` updates that move a system-user assignment run the removal guard; the reconciler skips a refused orphan delete instead of aborting. The guards read the system user's roles and the relevant rules from the database instead of caches, the role-assignment guard runs on every save (including `ReplayOnly`), the role-removal guard also judges entities with field security switched off, and a transaction group holding more than one guarded write that concerns the system user is refused (save them one at a time). Parallel guarded saves in one group are refused after the first: the place is reserved when the check passes and given back when the save is refused, returns false or throws. `BaseEngine` logs once when it loads an entity with field security.

  **Source guard.** `check:guards` gains `FieldSecurityEgressCompliance`, which flags `.GetAll(`, `.GetDataObject(`, `.GetDataObjectJSON(`, `.To(`, `JSON.stringify(<entity or rows>)`, `.Fields.map(f => f.Value)` and view results written straight to an HTTP response, in MJServer (resolvers, REST, `generic`, agent sessions, realtime, services, `index.ts`), the MCP and A2A servers, `AI/Agents`, and the Actions, Communication, Templates, SearchEngine and MessagingAdapters packages, unless the `//` comment directly above the line carries `// fls-guard: <reason>` on a line of its own (a marker trailing code does not count).

  **Integration checks can report Skipped mid-run** (`SkipCheck` in `@memberjunction/testing-integration`); an early return used to score as a pass. The new bundles IT133–IT135, and IT92's FC1–FC6, skip instead of passing when a precondition is missing. A new integration-job step (`.github/scripts/check-fls-wire-bundles-ran.mjs`) fails the job when any IT92 or IT134 check skipped or either bundle ran nothing, and their shared fixture reloads metadata before checking the field-security flag and after its teardown, so a stale flag no longer makes it refuse to run.

  **Upgrading.**
  - **Flush RunView cache keys in a persistent shared cache (Redis) when you deploy.** Before this release a restricted user's cache miss could write narrowed rows into the slot unrestricted users read. Unrestricted users' keys do not change, so those rows would keep being served, missing columns, until a save or eviction cleared them. During a rolling deploy older servers keep writing them, so flush once every server runs this release. Browser (IndexedDB) slots for restricted users re-key on their own; the old ones are simply never read again.
  - **Upgrade clients with the server.** Older `@memberjunction/graphql-dataprovider` builds send every field, denied ones included at their defaults, when a transaction group creates a record, and this server refuses that input for a restricted user. Open browser tabs need a reload, and pinned consumers need the matching client release.

## 6.2.0-edge.5

### Patch Changes

- c7d1170: Security: client SQL fragments reach RunView only through the base-view clause screen. The screen moves from MJServer's `ResolverBase` into `@memberjunction/generic-database-provider` as `ClientClauseScreen`, and the provider exposes it as `ScreenClientClause`. It now also guards `RunViewsWithCacheCheck` (which also gets the `view:batch` API-key scope check), every ad-hoc list source by default (client-supplied, from the list and audience actions, or rebuilt from a stored list snapshot), the REST view routes (which also refuse a `ViewEntity` that was not loaded as an entity), and a saved view's stored WhereClause and sort (on save, and again when the view runs). The screen refuses a subquery over an entity the acting user reads under a row filter (role row-level security or an API-key row filter) or with denied fields, the queried entity included, because a subquery reads the base view without them; the ad-hoc SQL screen uses the same rule. Both screens read table references from a walk of the whole parse tree (subqueries in CASE branches, HAVING and window clauses included, and every FROM item even when an alias repeats), refuse SQL whose SELECT keywords the walk does not account for, refuse a table function in FROM unless it is an unqualified built-in that reads only its arguments, and skip only the parse wrapper's own FROM item. `SQLParser.IdentifierAliases` exposes the names a fallback parse renamed, so bracket-quoted CTE names still resolve. The fallback takes those names from a prefix the SQL does not contain and keeps each one a separate token, so every name in that map is one the parser renamed. `SQLParser.IsIdentifierAliasName` reports that name form, and both screens refuse client SQL that uses it. The ad-hoc SQL screen exempts a FROM item as a CTE reference only when it is unqualified (`dbo` counts as a schema), is in the scope of a WITH that declares the name (its own SELECT or an enclosing one; a CTE body sees the CTEs before it, itself on SQL Server, and every CTE of a PostgreSQL WITH RECURSIVE list), and matches by the dialect's identifier rules (case-insensitive on SQL Server; on PostgreSQL unquoted names fold to lower case and quoted names match exactly). The parse-tree walk takes time linear in the size of the parse tree, and the fallback renaming and the forbidden-function check take time linear in the size of the SQL. A schema-qualified table reference, `dbo` included, resolves only to an entity in that schema. Client clauses may no longer call the functions the dialect forbids in caller SQL (`CallerSQLForbiddenFunctions`), and that shared list now also covers `pg_sleep*` on PostgreSQL and `OPENXML` on SQL Server. The rubric comparison matrix and the conversations UI (the tasks view, task search and the agent artifact lookup) now read the IDs they filter by with their own RunView instead of a subquery over those views; the conversations Tasks tab rebuilds that filter on every load and refresh. On PostgreSQL the screen reads `[Name]` bracket identifiers as the PostgreSQL provider does. Every RunView caller also gets a bracket- and `E''`-aware check that refuses statement separators and comments in filter, sort and search fragments, and a view ID is spliced into SQL only when it is a GUID. A stacked statement hidden from the keyword denylist by a quote inside a bracket identifier no longer reaches the database on these paths.

## 6.2.0-edge.4

### Patch Changes

- 20650af: Fix two ways interactive components fail to open entity records.
  - **sql-dialect** — PostgreSQL `tsvector` and `tsquery` are now string types. They were missing
    from the list, so CodeGen typed the `__mj_fts_vector` column that full-text search adds as a
    GraphQL `Int`. Once the trigger fills it, the value is text, and every load of that entity's
    records fails with `Int cannot represent non-integer value`. Re-run CodeGen to regenerate the
    affected entities.
  - **ng-explorer-core** — the standalone artifact tab (`ArtifactResource`) now handles the viewer
    panel's `openEntityRecord` and `navigationRequest` events, as the conversation view already does.
    Before, a component's `OpenEntityRecord` call in a shared artifact tab did nothing, with no
    console output.

- e1942c7: Close stacked-SQL injection through RunView `Aggregates[].expression`. The provider no longer runs a caller's aggregate text. Each expression must be a single aggregate function call over the entity's columns, and the query runs the SQL that the new `CheckAggregateExpression` (in `@memberjunction/sql-parser`) rebuilds from the checked parse tree, with the dialect's quoting. Any other expression returns a per-aggregate error, and the rows and the other aggregates still load. Some expressions that used to run are now refused: arithmetic or functions around the aggregate call (`SUM(x) + 1`, `ROUND(AVG(x), 2)`, `SUM(x) / COUNT(*)`), `CONVERT` (use `CAST`), window clauses, PostgreSQL `FILTER (WHERE …)` and `EXTRACT`, a backslash inside a quoted string or identifier, and `COUNT_BIG(*)` and `TRY_CAST`, which the parser cannot read. The GraphQL boundary screen that guards ExtraFilter and OrderBy now also screens aggregate expressions. `SQLParser.HasStackedStatements` now reads tokens with the dialect's lexer, so a statement separator after a PostgreSQL `E'…'` string is no longer missed. A column reference in an aggregate resolves by `IdentifierMatches` (new in `@memberjunction/sql-dialect`), the rule the field-level security check reports with, so it resolves only to a column that check would report for that reference; a reference that rule does not match to a column is refused, even where the database would resolve it, and on an entity whose columns differ only by case a reference that is not the exact spelling of one of them is refused. A `LIKE … ESCAPE` clause is refused rather than dropped, a parenthesized `NOT (…)` keeps its grouping in the rebuilt SQL, and the lexer reads a PostgreSQL dollar-quote tag that contains non-ASCII letters.

## 6.2.0-edge.3

### Patch Changes

- 35da130: Security hardening across the data layer: escape/validate composite-key values before SQL interpolation, enforce CanRead on subquery/ad-hoc query entity targets, SELECT-only validation on GetData, bracket-safe SQL Server identifier quoting, and JSON-safe codegen description emission.
- 28c92e0: Saved queries, ad-hoc SQL and composed queries now render and run correctly on SQL Server and PostgreSQL in the shapes that previously failed or returned the wrong rows.
  - **Row caps and paging.** A query's own `TOP` / `LIMIT` / `OFFSET … FETCH` is kept: when the caller also passes `MaxRows`, the smaller wins and `TotalRowCount` follows. CTEs, `WITH RECURSIVE`, query hints, `SELECT DISTINCT`, set operations, `TOP PERCENT` / `WITH TIES` and SQL the parser cannot read are paged and capped by editing the statement in place, or as a derived table, instead of being rewritten from the syntax tree. Ad-hoc SQL with `MaxRows` is paged in the database instead of fetching every row. A requested cap that cannot be applied is logged; paging a `FOR JSON` / `FOR XML` query fails with an error that says so.
  - **Composition.** A dependency's trailing `;`, SQL Server `OPTION (…)` hints, template tags (`{% if %}` and similar) and doubled quotes in static values now compose correctly. The real composition token is resolved, not a copy in a comment or string literal. Composing into an outer `WITH` / `WITH RECURSIVE` produces one valid clause, and a dependency CTE that shares a name with one of the outer query's CTEs is renamed instead of declared twice. A query that references the same dependency twice saves one dependency row.
  - **PostgreSQL.** Pools get the `statement_timeout` and `idle_in_transaction_session_timeout` that match SQL Server's request timeout. Caller-supplied SQL runs in a rolled-back read-only transaction, and the read-only provider gets its own pool on the read-only login. Column references are read as names, and comment stripping no longer breaks dollar-quoted and `E''` strings.
  - **Caller-supplied SQL** must be a single read query. Ad-hoc SQL over GraphQL (`ExecuteAdhocQuery`) now runs through the read-only provider's own ad-hoc path, so it works on PostgreSQL too and pages the same way everywhere. `RunQueryParams.TimeoutSeconds` (ad-hoc SQL) and `ExecuteSQLOptions.timeoutMs` set a per-call limit that the database enforces: the request is cancelled on SQL Server, and `statement_timeout` applies on PostgreSQL. That limit can shorten the server's own limit but never lengthen it.
  - **What caller-supplied SQL may call.** Ad-hoc SQL, `TestQuerySQL` and query specs are refused when they call a function that runs SQL given as a string, or reads files or other databases (on PostgreSQL `query_to_xml` and its family, `ts_stat` and `ts_rewrite`, `dblink`, the server-file and large-object functions, and server-administration functions; on SQL Server `OPENROWSET`, `OPENQUERY`, `OPENDATASOURCE` and the trace and audit file readers). The list is the new `SQLDialect.CallerSQLForbiddenFunctions`. On PostgreSQL, advisory locks taken by such SQL are released before its connection returns to the pool, and MJAPI warns at startup when the read-only login can read base tables or server files.
  - **Dialects.** The rendering pipeline reads `SQLDialect` members (`SelectListPagingOrderBy`, `PagingRequiresOrderBy`, `QueryHintKeyword`, `SupportsEscapeStringLiterals`, `SupportsDollarQuotedStrings`, `StringLiteralPrefix`, `EscapeLikePattern`, `BooleanParameterValue`) instead of checking the platform name, so a new dialect declares its behaviour in one class.
  - **Text filters.** `sqlString` / `sqlIn` keep non-ASCII text on SQL Server, and the LIKE filters escape `[` (SQL Server) and `\` (PostgreSQL). SQL Server bracket-quoted identifiers escape `]`.
  - `RunQueryParams.MaxRows` documents that there is no default row limit, and that `MaxRows` limits the rows returned, not the work the database does.

## 6.2.0-edge.2

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

## 6.2.0-edge.0

## 6.1.0

### Minor Changes

- c996a56: Field-Level Security: per-field Read/Update/Create control by role.

  Field security is switched **on or off per entity**, explicitly, via a new
  `Entity.EnableFieldLevelSecurity` flag. Nothing is inferred from whether permission rows happen to
  exist, so adding a rule can never change access on an entity that has not opted in.

  A new `EntityFieldPermission` table holds one row per (field, role) with three independent
  verbs — `ReadAccess`, `UpdateAccess`, `CreateAccess` — each `Allow`, `Deny`, or `No Access`:
  - **`No Access`** is neutral, and the default. It grants nothing and blocks nothing; another
    role's Allow still wins.
  - **`Allow`** grants the action for that role.
  - **`Deny`** wins over everything. One Deny anywhere across the user's roles beats any number of
    Allows.

  **Read is required for Update and Create.** A field a user cannot see is one they cannot change,
  so this is enforced twice: a CHECK constraint refuses the combination within a row, and the
  aggregation clamps it again across roles — because two individually legal rows held by one user
  (role A grants Read+Update, role B denies Read) would otherwise aggregate to write-only access
  that no constraint could see.

  **Turning the flag on is safe.** It snapshots the entity's existing entity-level permissions into
  per-field rows, so enabling changes nothing until an administrator tightens a specific field.
  Turning it off keeps the rows, inactive, so re-enabling does not lose the configuration. Those rows
  maintain themselves: adding a column, granting a role entity access, or dropping either one is
  reconciled automatically, and an administrator's tightening is never overwritten by that process.

  **Nobody is exempt** — no admin bypass, no Owner carve-out, and no exempt account anywhere in
  permission evaluation. That includes the **MJ system user**, the account the server runs its own
  work as: it is not special-cased at runtime, and gets its access from ordinary `Allow` rows
  written for the standard roles it holds. What is protected instead is the CONFIGURATION — a rule
  that _denies_ anything to a role the system user holds is refused, and so is giving that account a
  role which already denies a field. Grants save normally, since they are what the server's own
  access depends on. Restricting that account would matter because its engine caches are
  process-wide, so a partially loaded cache would reach every user; a configuration rule stops that
  somewhere an administrator can see it, rather than behind a bypass that has to be trusted.
  Primary keys, `__mj_` columns, and the security/identity entities can never be restricted.

  Enforcement (server-side and authoritative):
  - **Reads.** Denied columns are stripped from RunView results on both the cache-hit and cache-miss
    paths, and from single-record GraphQL responses.
  - **The audit trail.** `MJ: Record Changes` rows carry another entity's old and new values, and the
    audit entity's own field security is off — so without a dedicated control, anyone with entity read
    on it could read a denied field straight out of the payload, in the default configuration. Each
    row is now projected against **the entity it is about**, resolved per row from its `EntityID`:
    denied keys are dropped from `ChangesJSON` and `FullRecordJSON`, and `ChangesDescription` is
    withheld entirely. Prose cannot be safely redacted — it would leak on the first value that
    appears in an unexpected form — so it is dropped rather than edited, and callers degrade to a
    generic label. Rows are never hidden: a user denied one field still sees that a record changed,
    when, by whom, and which of the fields they may read. It fails closed when the subject entity
    cannot be resolved, including when a query narrows `Fields` such that no `EntityID` reaches the
    projection — otherwise `Fields: ['ChangesJSON']` would be a one-parameter bypass. Payload queries
    in the platform now select `EntityID` alongside; a saved query reading Record Changes directly is
    not projected, for the same reason no `RunQuery` is. On the write side, an update to a Record
    Change from a caller carrying any denial ignores every payload column the client sends and
    reloads the stored values first — a narrowed payload hydrates as an ordinary loaded value and
    save-SQL generation writes every field, so without this a restricted user editing `Comments`
    would silently overwrite the audit payload with the narrowed copy they were shown. Nothing is
    manufactured anywhere in this path: a reader gets the stored value or a strict subset of it, and
    only the stored value is ever persisted.
  - **Caller-written SQL.** A request is rejected if `ExtraFilter`, `OrderBy`, or an `Aggregates`
    expression names a denied field. Without this, `MIN(Salary)` or `Salary > 200000` reads the
    values back without the column ever appearing in a result. `UserSearchString` is not rejected;
    denied fields are simply excluded from the search.
  - **Writes.** A save that changes a field the user cannot update is rejected. Values a client
    sends for fields it cannot read are ignored — such a field was absent from every payload that
    client received, so any value coming back is fabricated by the transport.
  - **Creates.** A value supplied for a field the user may not create is dropped and the column
    takes its default. This never rejects: an error naming the field would confirm it exists and is
    restricted, and silently defaulting is what an unrestricted user gets by leaving it blank.
  - **Typed accessors.** `BaseEntity.Get()` and `.Set()` throw for a field the user cannot read, so
    a restricted field surfaces as a clear failure rather than a silent blank. Entity forms check
    access before rendering, so a denied field is simply not shown.
  - **Direct database connections (SQL Server only).** CodeGen emits column-level `DENY SELECT` on
    base views for roles with an explicit `ReadAccess = 'Deny'` rule on an enabled entity, restricted
    to custom DBA-created roles, and skips any role a service login belongs to. PostgreSQL emits
    nothing — it has no DENY, so Deny-wins cannot be expressed there. See the guide.

  RunView caching is unchanged for everyone else: the server keeps full-width slots shared across
  users and narrows each response at read time, so a permission change takes effect on the next
  metadata refresh without invalidating cached results. Browsers key their own cache on the fields
  the user may see, so tightening access does not leave a stale column on screen.

  Also in this release:
  - **Permission removal now reaches the database.** CodeGen reads live permission state and
    re-asserts it each run, so deleting a permission row actually revokes the grant or deny.
    Previously CodeGen only ever added grants, so a deleted `EntityPermission` row left its `GRANT`
    in place until the view happened to be rebuilt.
  - **Partial entity objects are now safe.** `EntityField` gains a not-loaded marker, set when the
    data an entity was loaded from left a field out. Such fields are skipped on save, are never
    dirty, and are exempt from the required-field check, so the stored value is kept instead of
    being overwritten with a default. This fixes silent data loss when a user edits an unrelated
    field on a record containing columns they cannot read.
  - **`entity_object` requests always fetch every column the user may see**, whether or not the
    query is cacheable. This was already true on the server but not for clients, so a client could
    build a partial entity and write defaults over real data on the next save.
  - **Server-side `BaseEngine` loads now run as the MJ system user**, regardless of which caller
    reached `Config()` first. Engine data is infrastructure: the cache is process-wide and shared by
    every user of the process, so its contents must not depend on the first caller's permissions — one
    carrying entity denials, RLS row scoping, or field denials would otherwise seal a partial cache
    that then serves everyone until restart. The identity is sticky once applied, so a later
    `Config(forceRefresh, someUser)` cannot pull the shared cache back under that user's permissions.
    Restricting what a given user may SEE stays where it belongs, at the point data is served to them.
    Client-side (`ProviderType.Network`) behavior is unchanged. Resolution goes through a new
    ClassFactory seam, `WellKnownUserSource` in `@memberjunction/core`, whose server-side
    implementation answers from `UserCache`; when nothing is registered — a browser, a test, a
    database with no such row — the engine degrades to acting as the caller exactly as before, with a
    once-per-engine-class warning. This is a pre-existing `BaseEngine` defect fixed alongside field
    security rather than because of it: neither depends on the other, though it is what lets the guide
    say engine caches cannot be narrowed by a restricted caller.

  New guide: `guides/FIELD_LEVEL_SECURITY_GUIDE.md`. Read the configuration limits before
  restricting anything. Saved queries are not field-filtered; run access to a query is the grant.

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

- 4eb87c5: Fix three PostgreSQL conversion defects that each surfaced only when a converted migration was **applied**, not when it was converted — the converter reported "0 gaps" for all three.

  **1. `MERGE` and `MATCHED` were read as identifiers.** Every other word in a `MERGE` statement was already in the quoting keyword sets — `USING`, `ON`, `WHEN`, `THEN`, `NOT`, `INSERT`, `UPDATE`, `SET`, `VALUES`, `AS` — so a converted `MERGE` came out as `"MERGE" __mj."X" AS tgt … WHEN "MATCHED" THEN UPDATE` and PostgreSQL rejected it with `syntax error at or near ""MERGE""`. Structurally the rest of the statement already transpiled to valid PG 15+ `MERGE`; these two tokens were the only thing wrong.

  **2. `INTO` is optional in T-SQL's `MERGE` and required in PostgreSQL's.** `MERGE [dbo].[T] AS tgt` transpiled token-for-token into something PostgreSQL rejects at the _target name_ rather than at `MERGE` — `syntax error at or near "__mj"`, pointing one token past the actual problem. The bare form is now rewritten to `MERGE INTO`. The rewrite is anchored to statement position so the word `MERGE` in a migration's own prose ("re-runnable: MERGE on fixed UUIDs") is not rewritten into "MERGE INTO on fixed UUIDs".

  **3. BIT literals in entity-registration INSERTs on the `--split` path.** CodeGen registers a new entity by INSERTing into `Entity` / `EntityField` / `EntityPermission` — long-lived core-metadata tables that no migration re-creates, so the AST dialect never sees a `CREATE TABLE` for them, has no column types to infer, and emits a BIT literal as the integer it looks like. Applying the result failed with `column "IncludeInAPI" is of type boolean but expression is of type integer`. The rule-based (legacy) path already seeds this catalog through `createConversionContext`; the split path assembles its output from the transpiler directly and bypassed it, so **every** migration registering a new entity produced a file that failed on its first apply.

  `assemblePgSQL` now applies the core-metadata boolean catalog. Ordering is load-bearing and was wrong in the first cut: the INSERT matcher keys on a `schema.Table` reference whose schema is word characters, so while the table is still `${flyway:defaultSchema}."Entity"` it matches nothing and the coercion silently no-ops. It runs **after** schema substitution, and a regression test pins that by asserting on a macro-carrying input. Rewriting is by ordinal position against known-boolean columns, so a non-boolean integer in the same tuple (`UserViewMaxRows`) and a table outside the catalog are both left alone.

  Related but distinct from the `--bake-codegen` registry fix ("Seed the BIT/BOOLEAN registry from the live catalog"), which repaired the same class of failure on the bake path; this one repairs the split-assembly path, which bake cannot reach when a migration has a transpile gap.

### Patch Changes

- 647bd71: Enable layered base views on PostgreSQL. CodeGen writes the inner view and restars the application-owned outer wrapper so `g.*` re-expands after inner regeneration (no more throw). New pg-only migration ships `spRebindLayeredOuterView` plus core MJ inner/outer views. Open App `mj migrate` rebinds layered outers in the app schema before field heal.
- 9f73528: Nested transactions live on GenericDatabaseProvider. Depth 1 is a physical BEGIN; depth 2+ is a dialect savepoint. A savepoint error on a published handle (`ENOTBEGUN`/`EABORT`/`25P01`) throws `DoomedTransactionError` instead of opening a second physical TX (torn write). Nested begin with no physical TX is corruption. Physical hooks are abstract; `AbandonPhysicalTransaction` unpublishes on EABORT; `AfterPhysicalCommit` runs after the mutex. `TransactionDepth` moved to `@memberjunction/core` with deprecated camelCase aliases (`transactionDepth`, `savepointStack`, `inTransaction`, `inNestedTransaction`) for one release. `ResetTransactionState()` replaces poking private fields. Upgraders: read `TransactionDepth` (not a duck-typed `transactionDepth` that would be undefined).
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

- 44fca09: Fix PostgreSQL auto-quoting of `CURRENT_DATE` and the other niladic datetime/identity functions.

  `AutoQuotePostgreSQLIdentifiers` rewrote a bare `CURRENT_DATE` into `"CURRENT_DATE"`, which PostgreSQL then rejects with `column "CURRENT_DATE" does not exist`. These functions are spelled without parentheses, so the word-before-`(` rule never classified them as functions, and they were absent from `PostgreSQLQuotingKeywords` — `CURRENT_TIMESTAMP`, `CURRENT_USER` and `SESSION_USER` were already listed, but their siblings were not.

  Added to the keyword set: `CURRENT_DATE`, `CURRENT_TIME`, `LOCALTIME`, `LOCALTIMESTAMP`, `CURRENT_CATALOG`, `CURRENT_ROLE`, `CURRENT_SCHEMA`.

  This only exempts the ALL-CAPS spelling, so a mixed-case column such as `Current_Date` still quotes normally — the baseline column guard verifies no shipped column collides.

  The reverse guard in `postgresqlAutoQuote.baseline.test.ts` was itself missing these words from its reserved-word oracle, which is why the gap went undetected; it has been extended so the same class of omission fails the build. `USER` is deliberately left out of both: it is reserved in PostgreSQL, but it is a believable ALL-CAPS identifier in customer schemas this repo's baseline cannot see, and nothing in MJ emits a bare `USER`.

  Surfaced in production by a generated query against a PostgreSQL client that used `CURRENT_DATE` in a date predicate.

  ## Same defect class, found by audit rather than by the next outage

  Running realistic PostgreSQL through the tokenizer showed `CURRENT_DATE` was one instance of a broad gap: **45 of 53 common constructs** came back corrupted. Every one hinges on a word that is not followed by `(`, which is the only position rule 3 can rescue. Also added:
  - **Ordered-set aggregates and window frames** — `WITHIN`, `ORDINALITY`, `GROUPING`, `SETS`, `ROLLUP`, `CUBE`, `GROUPS`, `EXCLUDE`, `TIES`. `WITHIN` is the sharpest: `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x)` is how every median is written, and it became `… "WITHIN" GROUP …`.
  - **The rest of PostgreSQL's reserved words** — `LEADING`, `TRAILING`, `PLACING`, `SYMMETRIC`, `ASYMMETRIC`, `NOTNULL`, `NATURAL`, `SIMILAR`, `VERBOSE`, `ANALYZE`, `ANALYSE`, `FREEZE`, `OVERLAPS`, `AUTHORIZATION`, `BINARY`, `COLLATION`. Being reserved is what makes these unconditionally safe: PostgreSQL will not resolve a same-named column bare either, so nothing can be shadowed.
  - **Type names in cast position** — `CHARACTER`, `VARYING`, `BOOL`, `INT2`/`INT4`/`INT8`, `FLOAT4`/`FLOAT8`, `BPCHAR`, `TIMETZ`, `TSVECTOR`, `TSQUERY`, `SMALLSERIAL`, `VARBIT`, `JSONPATH`. `DOUBLE PRECISION` worked only because both halves happened to be listed; `CHARACTER VARYING` did not.
  - **Utility statement verbs** — `REFRESH`, `TRUNCATE`, `EXPLAIN`, `VACUUM`, `REINDEX`, `UNLOGGED`, `PREPARE`, `DEALLOCATE`, plus `ESCAPE`, `UNKNOWN`, `NOWAIT`, `LOCKED`, `CASCADED`, `RESTART`, `STORED`, `OWNED`, `INCLUDING`, `EXCLUDING`, `INHERITS`, `INCREMENT`, `MINVALUE`, `MAXVALUE`, `CYCLE`.

  `ORDINALITY` is worth calling out: `postgresqlDialect.ts` (`ForeignKeyGraphSQL`) and `crossDialect.test.ts` both carry comments saying they _deliberately avoid_ `unnest(...) WITH ORDINALITY` because this tokenizer quoted it. That workaround can now be retired.

  Seventeen non-reserved words are deliberately excluded on the same reasoning as `USER` — `LEVEL`, `MODE`, `OPTION`, `SHARE`, `START`, `CACHE`, `ROLE`, `PASSWORD`, `LOGIN`, `DOMAIN`, `CLUSTER`, `POLICY`, `SEQUENCE`, `LOCAL`, `SKIP`, `EXCLUSIVE`, `SOURCE`. All are legal bare column names in PostgreSQL and believable in a customer schema, and MJ emits none of them through `ExecuteSQL`. A test asserts they stay quoted so the exclusion is deliberate rather than incidental.

  The reserved-word oracle in the baseline test is now transcribed in full rather than sampled, since sampling is precisely what let `CURRENT_DATE` through.

## 6.1.0-edge.7

### Minor Changes

- c996a56: Field-Level Security: per-field Read/Update/Create control by role.

  Field security is switched **on or off per entity**, explicitly, via a new
  `Entity.EnableFieldLevelSecurity` flag. Nothing is inferred from whether permission rows happen to
  exist, so adding a rule can never change access on an entity that has not opted in.

  A new `EntityFieldPermission` table holds one row per (field, role) with three independent
  verbs — `ReadAccess`, `UpdateAccess`, `CreateAccess` — each `Allow`, `Deny`, or `No Access`:
  - **`No Access`** is neutral, and the default. It grants nothing and blocks nothing; another
    role's Allow still wins.
  - **`Allow`** grants the action for that role.
  - **`Deny`** wins over everything. One Deny anywhere across the user's roles beats any number of
    Allows.

  **Read is required for Update and Create.** A field a user cannot see is one they cannot change,
  so this is enforced twice: a CHECK constraint refuses the combination within a row, and the
  aggregation clamps it again across roles — because two individually legal rows held by one user
  (role A grants Read+Update, role B denies Read) would otherwise aggregate to write-only access
  that no constraint could see.

  **Turning the flag on is safe.** It snapshots the entity's existing entity-level permissions into
  per-field rows, so enabling changes nothing until an administrator tightens a specific field.
  Turning it off keeps the rows, inactive, so re-enabling does not lose the configuration. Those rows
  maintain themselves: adding a column, granting a role entity access, or dropping either one is
  reconciled automatically, and an administrator's tightening is never overwritten by that process.

  **Nobody is exempt** — no admin bypass, no Owner carve-out, and no exempt account anywhere in
  permission evaluation. That includes the **MJ system user**, the account the server runs its own
  work as: it is not special-cased at runtime, and gets its access from ordinary `Allow` rows
  written for the standard roles it holds. What is protected instead is the CONFIGURATION — a rule
  that _denies_ anything to a role the system user holds is refused, and so is giving that account a
  role which already denies a field. Grants save normally, since they are what the server's own
  access depends on. Restricting that account would matter because its engine caches are
  process-wide, so a partially loaded cache would reach every user; a configuration rule stops that
  somewhere an administrator can see it, rather than behind a bypass that has to be trusted.
  Primary keys, `__mj_` columns, and the security/identity entities can never be restricted.

  Enforcement (server-side and authoritative):
  - **Reads.** Denied columns are stripped from RunView results on both the cache-hit and cache-miss
    paths, and from single-record GraphQL responses.
  - **The audit trail.** `MJ: Record Changes` rows carry another entity's old and new values, and the
    audit entity's own field security is off — so without a dedicated control, anyone with entity read
    on it could read a denied field straight out of the payload, in the default configuration. Each
    row is now projected against **the entity it is about**, resolved per row from its `EntityID`:
    denied keys are dropped from `ChangesJSON` and `FullRecordJSON`, and `ChangesDescription` is
    withheld entirely. Prose cannot be safely redacted — it would leak on the first value that
    appears in an unexpected form — so it is dropped rather than edited, and callers degrade to a
    generic label. Rows are never hidden: a user denied one field still sees that a record changed,
    when, by whom, and which of the fields they may read. It fails closed when the subject entity
    cannot be resolved, including when a query narrows `Fields` such that no `EntityID` reaches the
    projection — otherwise `Fields: ['ChangesJSON']` would be a one-parameter bypass. Payload queries
    in the platform now select `EntityID` alongside; a saved query reading Record Changes directly is
    not projected, for the same reason no `RunQuery` is. On the write side, an update to a Record
    Change from a caller carrying any denial ignores every payload column the client sends and
    reloads the stored values first — a narrowed payload hydrates as an ordinary loaded value and
    save-SQL generation writes every field, so without this a restricted user editing `Comments`
    would silently overwrite the audit payload with the narrowed copy they were shown. Nothing is
    manufactured anywhere in this path: a reader gets the stored value or a strict subset of it, and
    only the stored value is ever persisted.
  - **Caller-written SQL.** A request is rejected if `ExtraFilter`, `OrderBy`, or an `Aggregates`
    expression names a denied field. Without this, `MIN(Salary)` or `Salary > 200000` reads the
    values back without the column ever appearing in a result. `UserSearchString` is not rejected;
    denied fields are simply excluded from the search.
  - **Writes.** A save that changes a field the user cannot update is rejected. Values a client
    sends for fields it cannot read are ignored — such a field was absent from every payload that
    client received, so any value coming back is fabricated by the transport.
  - **Creates.** A value supplied for a field the user may not create is dropped and the column
    takes its default. This never rejects: an error naming the field would confirm it exists and is
    restricted, and silently defaulting is what an unrestricted user gets by leaving it blank.
  - **Typed accessors.** `BaseEntity.Get()` and `.Set()` throw for a field the user cannot read, so
    a restricted field surfaces as a clear failure rather than a silent blank. Entity forms check
    access before rendering, so a denied field is simply not shown.
  - **Direct database connections (SQL Server only).** CodeGen emits column-level `DENY SELECT` on
    base views for roles with an explicit `ReadAccess = 'Deny'` rule on an enabled entity, restricted
    to custom DBA-created roles, and skips any role a service login belongs to. PostgreSQL emits
    nothing — it has no DENY, so Deny-wins cannot be expressed there. See the guide.

  RunView caching is unchanged for everyone else: the server keeps full-width slots shared across
  users and narrows each response at read time, so a permission change takes effect on the next
  metadata refresh without invalidating cached results. Browsers key their own cache on the fields
  the user may see, so tightening access does not leave a stale column on screen.

  Also in this release:
  - **Permission removal now reaches the database.** CodeGen reads live permission state and
    re-asserts it each run, so deleting a permission row actually revokes the grant or deny.
    Previously CodeGen only ever added grants, so a deleted `EntityPermission` row left its `GRANT`
    in place until the view happened to be rebuilt.
  - **Partial entity objects are now safe.** `EntityField` gains a not-loaded marker, set when the
    data an entity was loaded from left a field out. Such fields are skipped on save, are never
    dirty, and are exempt from the required-field check, so the stored value is kept instead of
    being overwritten with a default. This fixes silent data loss when a user edits an unrelated
    field on a record containing columns they cannot read.
  - **`entity_object` requests always fetch every column the user may see**, whether or not the
    query is cacheable. This was already true on the server but not for clients, so a client could
    build a partial entity and write defaults over real data on the next save.
  - **Server-side `BaseEngine` loads now run as the MJ system user**, regardless of which caller
    reached `Config()` first. Engine data is infrastructure: the cache is process-wide and shared by
    every user of the process, so its contents must not depend on the first caller's permissions — one
    carrying entity denials, RLS row scoping, or field denials would otherwise seal a partial cache
    that then serves everyone until restart. The identity is sticky once applied, so a later
    `Config(forceRefresh, someUser)` cannot pull the shared cache back under that user's permissions.
    Restricting what a given user may SEE stays where it belongs, at the point data is served to them.
    Client-side (`ProviderType.Network`) behavior is unchanged. Resolution goes through a new
    ClassFactory seam, `WellKnownUserSource` in `@memberjunction/core`, whose server-side
    implementation answers from `UserCache`; when nothing is registered — a browser, a test, a
    database with no such row — the engine degrades to acting as the caller exactly as before, with a
    once-per-engine-class warning. This is a pre-existing `BaseEngine` defect fixed alongside field
    security rather than because of it: neither depends on the other, though it is what lets the guide
    say engine caches cannot be narrowed by a restricted caller.

  New guide: `guides/FIELD_LEVEL_SECURITY_GUIDE.md`. Read the configuration limits before
  restricting anything. Saved queries are not field-filtered; run access to a query is the grant.

### Patch Changes

- 44fca09: Fix PostgreSQL auto-quoting of `CURRENT_DATE` and the other niladic datetime/identity functions.

  `AutoQuotePostgreSQLIdentifiers` rewrote a bare `CURRENT_DATE` into `"CURRENT_DATE"`, which PostgreSQL then rejects with `column "CURRENT_DATE" does not exist`. These functions are spelled without parentheses, so the word-before-`(` rule never classified them as functions, and they were absent from `PostgreSQLQuotingKeywords` — `CURRENT_TIMESTAMP`, `CURRENT_USER` and `SESSION_USER` were already listed, but their siblings were not.

  Added to the keyword set: `CURRENT_DATE`, `CURRENT_TIME`, `LOCALTIME`, `LOCALTIMESTAMP`, `CURRENT_CATALOG`, `CURRENT_ROLE`, `CURRENT_SCHEMA`.

  This only exempts the ALL-CAPS spelling, so a mixed-case column such as `Current_Date` still quotes normally — the baseline column guard verifies no shipped column collides.

  The reverse guard in `postgresqlAutoQuote.baseline.test.ts` was itself missing these words from its reserved-word oracle, which is why the gap went undetected; it has been extended so the same class of omission fails the build. `USER` is deliberately left out of both: it is reserved in PostgreSQL, but it is a believable ALL-CAPS identifier in customer schemas this repo's baseline cannot see, and nothing in MJ emits a bare `USER`.

  Surfaced in production by a generated query against a PostgreSQL client that used `CURRENT_DATE` in a date predicate.

  ## Same defect class, found by audit rather than by the next outage

  Running realistic PostgreSQL through the tokenizer showed `CURRENT_DATE` was one instance of a broad gap: **45 of 53 common constructs** came back corrupted. Every one hinges on a word that is not followed by `(`, which is the only position rule 3 can rescue. Also added:
  - **Ordered-set aggregates and window frames** — `WITHIN`, `ORDINALITY`, `GROUPING`, `SETS`, `ROLLUP`, `CUBE`, `GROUPS`, `EXCLUDE`, `TIES`. `WITHIN` is the sharpest: `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x)` is how every median is written, and it became `… "WITHIN" GROUP …`.
  - **The rest of PostgreSQL's reserved words** — `LEADING`, `TRAILING`, `PLACING`, `SYMMETRIC`, `ASYMMETRIC`, `NOTNULL`, `NATURAL`, `SIMILAR`, `VERBOSE`, `ANALYZE`, `ANALYSE`, `FREEZE`, `OVERLAPS`, `AUTHORIZATION`, `BINARY`, `COLLATION`. Being reserved is what makes these unconditionally safe: PostgreSQL will not resolve a same-named column bare either, so nothing can be shadowed.
  - **Type names in cast position** — `CHARACTER`, `VARYING`, `BOOL`, `INT2`/`INT4`/`INT8`, `FLOAT4`/`FLOAT8`, `BPCHAR`, `TIMETZ`, `TSVECTOR`, `TSQUERY`, `SMALLSERIAL`, `VARBIT`, `JSONPATH`. `DOUBLE PRECISION` worked only because both halves happened to be listed; `CHARACTER VARYING` did not.
  - **Utility statement verbs** — `REFRESH`, `TRUNCATE`, `EXPLAIN`, `VACUUM`, `REINDEX`, `UNLOGGED`, `PREPARE`, `DEALLOCATE`, plus `ESCAPE`, `UNKNOWN`, `NOWAIT`, `LOCKED`, `CASCADED`, `RESTART`, `STORED`, `OWNED`, `INCLUDING`, `EXCLUDING`, `INHERITS`, `INCREMENT`, `MINVALUE`, `MAXVALUE`, `CYCLE`.

  `ORDINALITY` is worth calling out: `postgresqlDialect.ts` (`ForeignKeyGraphSQL`) and `crossDialect.test.ts` both carry comments saying they _deliberately avoid_ `unnest(...) WITH ORDINALITY` because this tokenizer quoted it. That workaround can now be retired.

  Seventeen non-reserved words are deliberately excluded on the same reasoning as `USER` — `LEVEL`, `MODE`, `OPTION`, `SHARE`, `START`, `CACHE`, `ROLE`, `PASSWORD`, `LOGIN`, `DOMAIN`, `CLUSTER`, `POLICY`, `SEQUENCE`, `LOCAL`, `SKIP`, `EXCLUSIVE`, `SOURCE`. All are legal bare column names in PostgreSQL and believable in a customer schema, and MJ emits none of them through `ExecuteSQL`. A test asserts they stay quoted so the exclusion is deliberate rather than incidental.

  The reserved-word oracle in the baseline test is now transcribed in full rather than sampled, since sampling is precisely what let `CURRENT_DATE` through.

## 6.1.0-edge.6

### Patch Changes

- 9f73528: Nested transactions live on GenericDatabaseProvider. Depth 1 is a physical BEGIN; depth 2+ is a dialect savepoint. A savepoint error on a published handle (`ENOTBEGUN`/`EABORT`/`25P01`) throws `DoomedTransactionError` instead of opening a second physical TX (torn write). Nested begin with no physical TX is corruption. Physical hooks are abstract; `AbandonPhysicalTransaction` unpublishes on EABORT; `AfterPhysicalCommit` runs after the mutex. `TransactionDepth` moved to `@memberjunction/core` with deprecated camelCase aliases (`transactionDepth`, `savepointStack`, `inTransaction`, `inNestedTransaction`) for one release. `ResetTransactionState()` replaces poking private fields. Upgraders: read `TransactionDepth` (not a duck-typed `transactionDepth` that would be undefined).

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

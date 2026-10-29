# @memberjunction/generic-database-provider

## 6.2.0-edge.6

### Minor Changes

- cc36de5: Add Alternate Base Views (MJ Canon Layer 1): allow entities to register governed SQL views (`MJ: Entity Alternate Base Views`) that maintain 100% column parity with the canonical `BaseView` while returning curated row subsets (such as `Active` members or `Open` orders), with full support across `RunView`, `RunViews`, `BaseEngine`, `LocalCacheManager`, `CodeGen` column-parity validation, `QueryEntity.AlternateBaseViewID` lineage extraction, `QueryGen`, `Lists`, `DataContext`, `GetEntityDetails`, and `MJExplorer` Data Explorer / Entity Viewer.
- 281724a: Round 2 Citizen Agent Builder feedback fixes and local development JWT auth provider (`local`):
  - **Local Development Mock/Test JWT Auth (`local`)**: Added `LocalDevProvider` in `@memberjunction/auth-providers`, `/auth/dev-login` and `/auth/dev-users` endpoints in `@memberjunction/server` backed by `MagicLinkKeyManager` RS256 signing, `MJLocalDevProvider` in `@memberjunction/ng-auth-services`, and `AuthProvider: "local"` support in `@memberjunction/installer`. Enforced strict security guards: server startup refuses to boot if `MJ_DEV_AUTH_ENABLED=true` when `NODE_ENV=production`, and `/auth/dev-login` / `/auth/dev-users` reject any non-localhost request (`X-Forwarded-For`, `Forwarded`, `X-Real-IP`, `CF-Connecting-IP`, `Sec-Fetch-Site: cross-site`, `Host`, `Origin`, `Referer`, and socket remote address).
  - **Single-Tarball OpenApp Archive Download**: Updated `GitHubClient` in `@memberjunction/open-app-engine` to download and extract `.sql` migrations from a single repository `.tar.gz` archive stream (`downloadTarballArchive`) instead of per-directory and per-file Contents/Blob API calls, avoiding anonymous GitHub API rate limits and large-file truncation.
  - **Flow Agent & CLI Execution Fixes**: Enabled in-process `inRun` execution for Flow agents when no `AgentStepNode` task handler is registered, populated `userMessage` and `payload` in Flow prompt step context, supported multiple starting steps and join deferral, added `--prompt-file` (`-f`) to `mj ai agents run`, and wired `ClientClauseScreen` entity-view authorization for ad-hoc queries in `@memberjunction/ai-cli`.
  - **Query Action Output & Truncation**: Updated `RunStoredQueryAction` and `RunAdhocQueryAction` in `@memberjunction/core-actions` to populate structured `Results`, `RowCount`, and `TotalRowCount` output parameters, raised default `ColumnMaxLength` to `500`, and appended `...[truncated]` when values are truncated.
  - **Citizen Builder Template & Turbo Pass-Through**: Updated `citizen-builder` starter template to default to `Loop` agents, bind Docker host ports to `127.0.0.1`, pass `AI_VENDOR_API_KEY__*` and `MJ_*` through `turbo.json`, auto-select free host ports and unique `COMPOSE_PROJECT_NAME` in `mj agent init`, and added `AI_TURBO_ENV_PASSTHROUGH` doctor check in `@memberjunction/installer`.

- 96c44bf: `mj sync push` writes SQL that works on any database, and handles deletes and `@file:` changes correctly.
  - A value that came from an `@lookup`, as a primary key or a foreign key, is captured as a subquery on its natural key instead of this database's ID, so Metadata_Sync migrations update the right row everywhere (#5626, #3619).
  - `--formatAsMigration` rewrites every schema declared in `schemaPlaceholders`, so Open App migrations call core procedures in the core schema (#3618).
  - Deletes run in true dependency order regardless of file order, and a row a cascade already removed is skipped with a warning (#4935).
  - `--incremental` notices when only an `@file:` target changed (#4190). Stored checksums predate this, so the first `--incremental` push after upgrading processes the whole tree once.
  - New `sqlLogging.escapeFlywaySyntax` escapes `${...}` in string data of a plain (non-migration) log; a migration-formatted log always escapes.
  - A seed whose primary key misses but whose natural key matches an existing row fails with a message naming that row; the CodeGen-granted permission seeds are now keyed by natural key (#4400).
  - Template parameter extraction never marks `_`-prefixed system variables as required (#5156).

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

- dae1d31: Omnibus Core, AI/MCP/Agent & Angular Performance & Resource Optimization (Waves 1–3):
  - **Wave 1 (Core Data Access, Server Resolvers & Caching)**:
    - `MJ-CORE-6`: Collapse multi-query `RunView` execution (`viewSQL`, `countSQL`, `aggregateSQL`) into a single `ExecuteSQLBatch` call in `GenericDatabaseProvider`.
    - `MJ-CORE-9`: Resolve `UserView` metadata through `UserViewEngine.Instance` in `ResolverBase` / `RunViewResolver`, pass pre-resolved `ViewEntity` into `RunViewParams`, and reuse a single `Metadata` instance across `ArrayFilterEncryptedFieldsForAPI`.
    - `MJ-CORE-5`: Parallelize `BaseEngine` dataset item entity hydration (`Promise.all`), maintain `_datasetItemMappings` for in-place `AutoRefresh` on dataset-loaded configs, enable `AutoRefresh: true` on `TemplateEngineBase`, and validate Nunjucks compiled template cache against `sourceText`.
  - **Wave 2 (AI, Agents, Prompts, Vectors, MCP & A2A)**:
    - `MJ-AI-5` / `MJ-AI-6`: Replace dynamic `await import('stream')` with static `Readable` import in `MCPServer`, cache compiled `ToolConfig` entries and Zod schemas across sessions (`GetOrBuildCompiledToolConfigs` / `ClearCompiledToolCache`), and route tool handlers through the active request's `SessionContext`.
    - `MJ-AI-7`: Default `EntityVectorSyncer` `delayTimeMS` to `0`, parallelize `saveEntityRecordDocument` with bounded concurrency (`10`), and use `SaveReturnMode: 'datestamps_only'`.
    - `MJ-AI-8`: Thread `provider?: IMetadataProvider` through `RerankObservabilityOptions` and save observability PromptRuns with `SaveReturnMode: 'datestamps_only'`.
    - `MJ-AI-9`: Support single-INSERT pre-completed `AIPromptRun` steps (`completed` option on `createStepEntity`) and coalesce streaming progress chunks at 35ms intervals.
    - `MJ-AI-10` / `MJ-AI-11`: Parallelize `AgentPreExecutionRAG` scope searches (`Promise.all`), isolate `AgentRunWatchdog` sweeps per run (`{ provider, contextUser }`), and pause the watchdog interval when zero runs are active.
    - `MJ-AI-12` / `MJ-AI-13`: Replace 500ms SSE polling in `A2AServer` with event-driven `TaskStore.Subscribe` / `Notify`, cache the discovery `AgentCard`, and wire `TaskStore.CancelTask` (`AbortController`) to `AgentOperations.executeAgent()`.
    - `MJ-AI-14`: Short-circuit `ActionEngineServer.SnapshotInputParams` in $O(1)$ when execution logging is disabled and reuse a single `ClassFactory` action instance per `RunAction` lifecycle.
  - **Wave 3 (Angular Change Detection, Leaks & Algorithmic Hotspots)**:
    - `MJ-NG-4`: Add `ChangeDetectionStrategy.OnPush` and explicit `ChangeDetectorRef.markForCheck()` across `JoinGridComponent`, `SearchSuggestComponent`, `ArtifactTypePluginViewerComponent`, `ActionFormComponent`, `AIPromptFormComponent`, and Explorer AI/Communication dashboards (`AutotaggingPipelineResourceComponent`, `ExecutionMonitoringComponent`, `ModelPromptPriorityMatrixComponent`, `TagsResourceComponent`, `CommunicationMonitorResourceComponent`, `CommunicationLogsResourceComponent`, `CommunicationRunsResourceComponent`).
    - `MJ-NG-5`: Fix timer/listener/subject leaks across `MJNotificationsService`, `MessageListComponent`, `UserNotificationsComponent`, `ActionFormComponent`, `AIPromptFormComponent`, `AutotaggingPipelineResourceComponent`, and `ExecutionMonitoringComponent`.
    - `MJ-NG-6`: Pre-index and memoize hot template/filter/render paths in `ConversationChatAreaComponent`, `WhiteboardBoardComponent`, `EntityDataGridComponent`, `DataExplorerDashboardComponent`, and `MCPDashboardComponent`.

- 8ec184d: Two defects on the shared read path, both in `GenericDatabaseProvider`: a round trip nobody reads, and a SQL statement the database rejects.

  **`MaxRows:1` no longer pays a second sequential `COUNT(*)`.** A row-limited read that comes back full may have been truncated, so the provider buys the real total with a follow-up count — that is what makes Explorer's "100 of 299" correct, and it is unchanged for every limit above 1. At a limit of exactly one row it can only ever confirm a number already in hand, and the callers that use that shape (record-map lookups, single-key resolves) never read `TotalRowCount`. Measured on a live tenant over a 120-second census: 1,000 record-map lookups fired 721 of these counts and 800 row lookups fired 600 — 1,321 extra round trips totalling 9,760 ms, 11.4% of all SQL time in the window. Observable change, confined to `MaxRows:1`: a hit now reports `TotalRowCount: 1` rather than the whole view's row count.

  **User search on a `FullTextSearchEnabled` entity with no `FullTextSearchFunction` returns results instead of a syntax error.** The branch was entered on the flag alone and the function name was interpolated with `?? ''`, emitting `... FROM "schema".""('term')` — rejected on every user search of such an entity, with no fallback. The two columns are independent (the flag can be set by hand, or by a metadata sync before CodeGen has minted the function), so a null/blank name now falls through to the per-field `LIKE` path, which needs no database object. Composed with the existing field-level-security condition, not substituted for it.

- d296edd: - **Record Links Slide-In Drawer, Embeddable `<mj-record-links>` Widget & Core `GetRecordDependencies` Upgrades**:
  - Added `GetRecordDependenciesOptions` (`LinkType?: 'both' | 'hard' | 'soft'`, `IncludeSystemEntities?: boolean`, `EntityNames?: string[]`) and `FieldDisplayName` hydration across `@memberjunction/core`, `@memberjunction/sqlserver-dataprovider`, `@memberjunction/postgresql-dataprovider`, `@memberjunction/graphql-dataprovider`, and `@memberjunction/server`.
  - Updated `BuildSoftLinkDependencySQL` to match both canonical `ID|<guid>` and bare `<guid>` single-PK references and scan physical `[Schema].[BaseTable]` objects instead of views when all referenced columns are non-virtual.
  - Added `<mj-record-links>` and `<mj-record-links-drawer>` plus the built-in **Links** toolbar action (`'links'`) on `<mj-form-toolbar>` and `<mj-record-form-container>`.
  - **Generic `<mj-form-field>` Original-Value Popover, Clean-Field Live Auto-Merge & Dirty-Field Conflict Resolution**:
    - Added a subtle `fa-clock-rotate-left` original-value popover with one-click **Restore** on modified fields in `<mj-form-field>`.
    - Upgraded `record-form-container` and `FormRecordRefreshCoordinator` so remote record updates arriving during Edit Mode auto-merge clean fields in place and surface inline **Keep mine** / **Use new value** conflict resolution cards on dirty fields whose server value changed.
  - **Zero-Restart Cache Auto-Reconciliation (`GetDatasetByName` & `RunViewsWithCacheCheck`)**:
    - Added `lastVerifiedAt` tracking on `LocalCacheManager` RunView slots, bounded server-slot freshness verification (`ServerCacheVerificationTTLMs`), client-monotonicity guard in `RunViewsWithCacheCheck`, `GetDatasetByName` SQL status reconciliation, and per-item row-count verification in `adoptServerMetadata()`.
  - **`polymorphic-fk` Standard Check (`@memberjunction/standards`)**:
    - Added `PolymorphicFKCheck` (`polymorphic-fk`) to enforce that polymorphic Entity+Record FK pairs declare `EntityField.EntityIDFieldName` in metadata.
  - **Calm Voice-First Realtime UI Declutter (`@memberjunction/ng-conversations`)**:
    - Suppressed the top audio-only avatar notice alert by default (`ShowAvatarNotice = false`) and hid the bottom `"Agent can see"` perception chip until the user actively captures their camera or screen (`CameraOn || Sharing`, or `ShowPerceptionChip = true`), while giving `RemoteBrowserChannel` its proper descriptor `SourceID` and `Label` (`Remote Browser`).
    - Deduplicated live speaking/listening status pills between `<mj-realtime-agent-banner>` and the center hero orb (`[HideState]="ShowHero && !PresenterOnStage"`), and tucked inactive Camera/Screen Share controls into the `•••` More menu in orb/compact mode so the primary bottom dock stays a clean 4-button bar (`Mic`, `Captions`, `More •••`, `End call`).
- c65f754: Implement 4-pillar MJServer / MJAPI horizontal and vertical scalability architecture:
  1. **Pluggable Cache Invalidation Broadcast Hierarchy**: Add `BaseCacheInvalidationBroadcastProvider`, default `SequencedRoleBucketBroadcastProvider`, `AzureWebPubSubBroadcastProvider`, `AWSIoTCoreBroadcastProvider`, `GCPPubSubBroadcastProvider`, `CacheInvalidationBroadcastManager`, `GetCacheInvalidationsSince` delta catch-up query, `NegotiateCacheBroadcastConnection` query, `X-MJ-Cache-Seq` / `X-MJ-Server-ID` HTTP response headers, and $O(1)$ per-session `PushStatusUpdates` topic routing (`CreateSessionRoutingPubSub`) with `WeakMap` single-parse JSON memoization.
  2. **Per-Request & Per-Field GraphQL Overhead Elimination**: Apply `VariablesLoggingMiddleware` only to root `Query`/`Mutation`/`Subscription` fields (`ApplyRootVariablesLoggingMiddleware`), use zero-copy prototype delegation (`Object.create(shared)`) in `ProviderBase.CreateSharedMetadataShell`, lazily allocate RxJS transaction subjects in `SQLServerDataProvider`, cache decoded `jwt.JwtPayload` claims in `AuthCache`, and add short-TTL validation caching + `LastUsedAt` write throttling in `APIKeyEngine`.
  3. **Single-Flight `RunView` Coalescing & Bounded Batch Concurrency**: Deduplicate concurrent identical in-flight `InternalRunView` executions on non-transactional providers with deep-cloned result isolation and cap concurrent queries in `InternalRunViews` to `MaxConcurrentViewsPerBatch` (`8`).
  4. **Multi-Replica Horizontal Scaling (`MJ_SERVER_ROLE`)**: Support `'all' | 'api' | 'worker'` server roles (`ResolveServerRole`, `ShouldServeInteractiveTraffic`, `ShouldRunBackgroundWorkers`) to split interactive GraphQL/REST replicas from background job workers.
- 49d0d3c: Server-set query parameters, `Context` in query templates, and fingerprint-bound approvals (#4789 A17). All opt-in: a query with no server-set parameter and no `Context`, run without `RequireApproved`, renders and runs exactly as before.
  - **Server-set parameters.** `QueryParameterInfo.IsServerSet` mirrors the new column. `RunQueryParams.ServerParameters` carries values only server code sets; a caller value (`Parameters`) for a server-set parameter, for a name that reaches a composed query's server-set parameter, or for `Context` is refused with an error naming it, and logged. A required server-set parameter with no server value refuses the run. Server values are left out of `AppliedParameters`, bound in materialized reads, and never read from a GraphQL request. `SERVER_ONLY_RUN_QUERY_PARAMS` / `StripServerOnlyRunQueryParams` name `TimeZone` and `ServerParameters`.
  - **`Context` in templates.** `{{ Context.UserID }}`, `UserEmail`, `UserName`, `Now`, `Today`, `StartOfWeek/Month/Quarter/Year`, worked out on the server from the context user, the clock and the run's `TimeZone` (UTC when unset), and only when the template reads them. Query extraction keeps no parameter row for `Context`.
  - **Approvals.** Queries (`Status`), user views, dashboards and components (`ApprovalStatus`): a save that moves the status to Approved records the context user, the time and a fingerprint of the definition as stored (`ComputeQueryFingerprintAsync` and siblings in `@memberjunction/core-entities`); client values for those columns are ignored. `Get*ApprovalStateAsync` reports `Current`, `Stale` or `NotApproved`. New `MJDashboardEntityServer`. `RunQueryParams.RequireApproved` refuses a run unless the query, and each query it composes, has a current approval.
  - **Caches.** The RunQuery result-cache fingerprint (the `CacheLocal` layer and the external-source cache) now covers `ServerParameters` and the `Context` values a query reads; a result that reads `Context.Now`, and a `RequireApproved` run, are never cached.
  - Integration bundle `query-approvals` (IT120).

- 0a348e2: `RunViewParams.SkipTotalRowCount` — an explicit caller opt-out of the extra COUNT round trip. A row-limited read that comes back exactly full runs the count SQL as a second, sequential query, and a paginated read counts up front; a caller that only consumes `Results` can now skip both. (`next` already skips the full-page count for a `MaxRows: 1` probe; this covers every other read that never reads `TotalRowCount`.) With the flag, `TotalRowCount` is the number of rows returned; `count_only` ignores it. Calls with the flag get their own RunView cache slot (`strc:1`), so a counted and an uncounted result are never served for each other. The integration engine's per-record match lookups set it explicitly.
- 374b1a4: Properties on user views (#4789, A14): a view can declare named, typed inputs, each of which adds one predicate on a field when a run gives it a value or it has a default. A property whose `AllowOverride` is false can be set only by server code. A view without properties runs, saves and caches exactly as before.
  - `@memberjunction/core`: `RunViewParams.Properties` (values a client may set) and `RunViewParams.ServerProperties` (server only; added to `SERVER_ONLY_RUN_VIEW_PARAMS`, so the REST view routes strip it). New `viewProperties` module: `ValidateUserViewProperties` (save-time checks), `ResolveViewPropertyValues` (value from server values, then client values, then the default; refuses unknown names, a client value for a locked property, a wrong type, and a required property with no value, each naming the property) and `BuildViewPropertyFilter` (typed literals through the platform dialect; `IN` takes a list). Both properties maps are part of the result-cache fingerprint and of `RunViewParams.Equals`. In the browser a run carrying properties is never merged with other callers' runs, never cached locally, and never sent through the cache-check transport (which carries dynamic runs only). `IsPropertyValueOfType` is exported from the context-token module.
  - `@memberjunction/core-entities`: `MJUserViewEntityExtended.Validate()` checks the view's `Properties`.
  - `@memberjunction/generic-database-provider`: a stored view's property predicates are ANDed after the view's own clause and `ExtraFilter`, screened, and field-security checked; row-level security applies on top unchanged. Before the cache lookup the provider works out the values (token defaults with the context user and the run's `TimeZone`, UTC when none), so the server cache keys on what the run uses; a run it would refuse skips the cache and is refused with its message.
  - `@memberjunction/server`: `RunViewByIDInput`, `RunViewByNameInput` and `RunViewGenericInput` accept `Properties` (JSON). No input accepts `ServerProperties`. `RunViewByID` / `RunViewByName` now return the provider's `ErrorMessage`.
  - `@memberjunction/graphql-dataprovider`: sends `Properties` on stored-view runs; throws for `Properties` on a dynamic run or any `ServerProperties`.
  - `@memberjunction/ng-entity-viewer`: a view with properties is run by its ID with the new `Properties` input, for every view type, paging, the count and the export; a read-only chip row lists each property (a locked one reads "set by server") and shows a refusal. The view config panel gets a Properties tab (add, edit and remove properties: name, type, description, default as a fixed value or a token with an offset, required, allow override, target field and operator), and the workspace saves them onto the view.
  - `@memberjunction/integration-test-suite`: IT136, `view-properties-client` (VP1–VP5, client transport).

- Updated dependencies [622f166]
- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [142d524]
- Updated dependencies [0ff7523]
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
  - @memberjunction/actions-base@6.2.0-edge.6
  - @memberjunction/aiengine@6.2.0-edge.6
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/sql-dialect@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/ai-vectors-memory@6.2.0-edge.6
  - @memberjunction/actions@6.2.0-edge.6
  - @memberjunction/query-processor@6.2.0-edge.6
  - @memberjunction/encryption@6.2.0-edge.6
  - @memberjunction/queue@6.2.0-edge.6
  - @memberjunction/geo-core@6.2.0-edge.6
  - @memberjunction/sql-parser@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- 3b0e8db: Abstract `SaveReturnMode` return-context resolution (`SaveReturnContext`, `ResolveSaveReturnContext`, `GetDatestampSelectColumnsSQL`) into `GenericDatabaseProvider` and expose the dialect-specific `ProjectSaveCallToDatestamps` hook implemented by both `SQLServerDataProvider` and `PostgreSQLDataProvider`.
- 39b35f1: Real-time task graph workflow UX, continuation synthesis with step outputs and artifacts, single-step delegation folding, per-user runnable agent directory & task graph validation, and a redesigned AI Agent Workflows & Tasks Command Center (#5878).
  - **Single-step task graph folding (`@memberjunction/ai-agents`).** `LoopAgentType.DetermineNextStep` automatically folds single-node `Tasks` emissions with no dependencies into an in-turn `Sub-Agent` step (`terminateAfter: false`) so single-agent delegations complete in a single conversation turn without spawning a background task graph, while preserving durable `Tasks` execution for multi-step (`2+` node) workflows. When an orchestrator with `ArtifactCreationMode = 'Never'` or `'System Only'` delegates a folded step to a specialist agent that produces artifacts, `AgentRunner.ProcessAgentArtifacts` resolves the specialist's `DefaultArtifactTypeID` and creation mode so deliverables are persisted and attached to the conversation message.
  - **Per-user runnable agent directory, pre-submission task graph validation, and sub-agent workflow propagation (`@memberjunction/ai-engine-base`, `@memberjunction/aiengine`, `@memberjunction/ai-core-plus`, `@memberjunction/ai-agents`, `@memberjunction/task-graph`, `@memberjunction/server`).** `AIEngineBase.GetUserRunnableAgentDirectory(user)` caches a per-user directory of active top-level agents permitted by `CanUserRunAgent`, invalidated on agent and permission changes. `BaseAgent` preloads `availableAgentCount` / `availableAgentDetails` into prompt templates, validates `Tasks` step targets before submission (converting unknown or restricted agent/action references into a self-correcting `Retry` step with the user's permitted agent list), propagates `conversationDetailId` and `Paused` workflow-awaiting state from sub-agents (`Workflow Planner`) to parent runs (`Sage`), includes `agentRun.Message` in sub-agent result markdown, and settles/reinvokes ancestor runs along `ParentRunID` in `TaskGraphDispatcher` and `TaskGraphContinuationDeliverer`.
  - **Live task graph telemetry, isolated step artifact persistence, and adaptive continuation delivery (`@memberjunction/server`, `@memberjunction/ai-agents`, `@memberjunction/conversations-runtime`).** `TaskGraphAgentRunner` resolves the originating `ConversationDetailID`, passes `inputArtifacts: []` to isolate task-graph step runs from earlier conversation turn artifacts, and forces `behavior: 'create-new'` when persisting step deliverables so sibling/prior artifacts are never overwritten as `v2`. `AgentRunner.ProcessAgentArtifacts` infers `Research Content` (`report.html`) and extracts `report.name` / `report.description` / `synthesis.executiveSummary` for report-producing specialist steps. `TaskGraphContinuationDeliverer` strips inherited upstream keys from merged `OutputPayload`s, updates the originating workflow message in-place when no intervening messages were sent (`origin.IsLatest`), or posts a bottom continuation reply linked via `ConversationDetail.ParentID` when intervening messages were sent while the workflow ran.
  - **First-class inline Workflow Execution Card, Workflow Context Header, & real-time chat reconciliation (`@memberjunction/ng-conversations`).** `ConversationChatAreaComponent` and `MessageItemComponent` reconcile live `TaskGraphProgress` frames in place, deduplicate parent container tasks from executable step rows, strip inherited upstream payload keys from step summaries, and render a relational `.workflow-continuation-banner` (`Completed workflow · <Name> · View workflow ↑`) on bottom continuation replies that scrolls to and highlights the originating workflow turn.
  - **AI Agent Workflows & Tasks Command Center (`@memberjunction/ng-conversations`, `@memberjunction/ng-tasks`, `@memberjunction/ng-explorer-core`).** Redesigned `TasksFullViewComponent` with a 5-metric KPI telemetry ribbon, instant search and status/agent filters, a **Workflow Cards** DAG view, a second-resolution **Execution Timeline & DAG** waterfall view, and a slide-over **Step Inspector Drawer** with one-click navigation back to the originating conversation.

- a9344ad: The Create row-level-security check now projects NULL fields into its candidate row, as the Update post-image check already does.

  `CheckCreateRLS` left NULL fields out of the synthetic row it tests the filter against, so a create filter that references a nullable column the new row leaves NULL failed with `Invalid column name` instead of evaluating. Example: a create filter `OwnerUserID = '{{UserID}}'` on `MJ: Projects` turned "save a shared folder" (OwnerUserID NULL) into a SQL error rather than a clean "Access denied", and a filter with an `OwnerUserID IS NULL` branch could never pass. NULLs are now emitted as typed `CAST(NULL AS <type>)`, and the now-unused `includeNulls` parameter on `BuildRLSSyntheticRowProjections` is removed.

- a0db1fb: `mj sync` keeps `@env:` references on pull, adds `pushWhen` and `@env:VAR?optional`, and fixes pull, push and validate defects.
  - **Pull keeps `@env:` references.** A file value written as `@env:VAR` keeps the reference after `mj sync pull` under `merge` and `overwrite`, also with `--multi-file`: in a field, inside JSON fields (and their `@file:` JSON side files), in `@lookup:` criteria and create fields, in `collections`/`embeds`/`extension` items, and in `primaryKey`. The resolved value (often a secret) is no longer written into the file. When `VAR` is set and differs from the database, pull warns without printing either value. Pull finds an existing record by the key variable's value. When a top-level record's key variable is not set, pull stops before it writes any file; for a child record's key, it stops with an error that names the file and the variable. Pull also stops before it writes any file when a record file in the folder cannot be read, so it never writes that file's records again as new files.
  - **`pushWhen`.** An entity folder's `.mj-sync.json` can set `"pushWhen": "@env:VAR"`. Push runs over the folder only when `VAR` is `true` or `1`; otherwise it skips and logs the folder and does not fail. `--format=json` lists skipped folders in `data.skippedDirectories`.
  - **`@env:VAR?optional`.** When `VAR` is not set, push leaves the field out of the save and warns, and still pushes the rest of the record.
  - **Fix:** `mj sync pull --merge-strategy`, `--preserve-fields` and `--exclude-fields` were accepted and ignored. They now override the folder's pull settings for the run.
  - **Fix:** `mj sync push --dir=<entity folder>` failed with "No entity directories found". It now pushes that folder, with root settings from the nearest parent root `.mj-sync.json`. `mj sync validate --dir=<entity folder>` now validates that folder (before, it validated only its subfolders).
  - **Fix:** `mergeStrategy: "skip"` rewrote files and counted them as updated. It now leaves them alone and counts them as skipped.
  - **Push does not print `@env:` values:** the verbose diff and the change report show `<hidden>` / `<from @env:VAR>`, and save errors show `<from @env:VAR>` for values of 6 or more characters. In a SQL Server SQL log, push leaves env-sourced fields out (`-- <Entity>.<Field>: not recorded, value comes from @env:VAR`); a replayed create then gets the column default, or fails if the column is NOT NULL with no default. Push warns, with names only, about what it cannot leave out (an env-sourced primary key, a value still in the log, other providers' logs). On create, a `primaryKey` written as `@env:VAR` stays in the file when the database saved the variable's value as the key. Push resolves an `@env:` `primaryKey` of a `collections` child and of a record to delete.
  - **`?optional` in `@lookup:`** is an error in validation and push.
  - **`mj sync watch`** chooses folders as push does, honors `pushWhen` and `?optional`, resolves an `@env:` primary key, matches field names without case as push does (and sets a virtual property such as `TemplateText` as written), and masks `@env:` values in its output. When one file fails, watch prints the error and goes on watching. Its SQL log leaves env-sourced fields out of the SQL statements, but the record-change data in that log can hold the old database value of an env-sourced field.
  - **Fix:** push and watch now apply `.mj-folder.json` defaults, from the sync root down to the record file's folder (a deeper folder wins; any `.mj-folder.json` wins over the entity's `.mj-sync.json` defaults). An unset `?optional` variable in a default skips that default. Validation no longer asks for `entityName` in `.mj-folder.json`.
  - **Fix:** `--update-existing` / `--create-new` (and their `--no-` forms) now reach the pull. `--multi-file` does not use them.
  - **Fix:** `--multi-file` reads an empty target file as no records. With `--since`/`--incremental` it removes the entries of soft-deleted records from the file, and no longer deletes the whole file when a deleted record's `Name` equals the file name.
  - **Fix:** with `--incremental`, a record whose lookup push deferred now gets its deferred fields saved. The record keeps its earlier checksum in the file, so each later `--incremental` push checks it again until the record changes. A deferred child finds its `@parent:` record from the main pass.
  - **Fix:** `mj sync validate` now honors the root `ignoreDirectories` and reads the record files the way push finds them (before, it found none from the usual working folder). Two entries for the same record that set a field to different values are an error that gives the `path:line` of each entry. A `@template:` value is an error, because push does not support it. Because validation now checks record files, `mj sync push --ci` can stop on errors that earlier versions did not find (unknown fields and top-level keys, a `__mj_` field or the primary key in `fields`, `@template:`, `?optional` in `@lookup:`, missing `@file:` targets, conflicting entries); fix the files or use `--no-validate`. A read-only field that push ignores, such as a joined display field that pull writes, is a warning that names `pull.ignoreVirtualFields` for a virtual field and `pull.excludeFields` for another field. Validation matches field names without case, as push does.
  - **`@memberjunction/generic-database-provider`:** `SqlLoggingOptions.TransformStatement` rewrites each statement before the SQL log session reads or prints it.
  - **Fix:** `mj sync watch` sees file changes again. It watches each entity folder and picks the record files push reads (`filePattern`, default `*.json`, dot files included, no `.mj-*.json` files) and `.md`/`.txt`/`.html`/`.liquid`/`.sql` files itself, because chokidar 5 does not support glob patterns. A change event for the content watch itself just wrote is ignored, so one edit gives one sync.
  - **Fix:** `--multi-file` pull also finds an existing record in the folder's other record files, so it keeps that record's `@env:` references instead of writing the database value.
  - **Fix:** pull leaves out a read-only field whose database value holds the value of an `@env:` reference in the record file (for example a key path built from an `@env:` key; a UUID matches without case), and removes such a field that the file already holds, with `merge` too.
  - **Fix:** push and watch leave the SQL-log SET line of a field skipped for an unset `?optional` variable out of the log, by name, so a full-row save does not log the field's database value.
  - **Fix:** push's error for an unset `@env:` variable names the record file with the line where the record starts, the entity and the field (for a composition child, its path such as `collections.Lines[0].fields.Name` and its entity; no line for a file that uses `@include`).

- 7e72c86: Phase 2 fresh efficiency and quality audit across Core Data Primitives, Task Graph Engine, AI Agent Runtime & PayloadManager, High-Volume Telemetry SaveReturnMode, and Angular Chat / Step Inspector UI:
  - **Core Data Primitives (`@memberjunction/core`, `@memberjunction/generic-database-provider`, `@memberjunction/sqlserver-dataprovider`, `@memberjunction/server`, `@memberjunction/templates-base-types`)**:
    - Restore lazy `_raw` `BaseEntity` hydration on `GetEntityObject()` + `LoadFromData()` (`20.87x` faster, `-100%` `EntityField` allocations on read-only `entity_object` views) while guarding subsequent `LoadFromData()` calls on already-loaded instances.
    - Support runtime `options.SaveReturnMode === 'datestamps_only'` projection in `SQLServerDataProvider.WrapSaveCallForResult`.
    - Eliminate duplicate `DiffObjects()` and `CreateUserDescriptionOfChanges()` calls in `GenericDatabaseProvider.Save()`.
    - Add precomputed `FieldMappingPlan` in `ResolverBase.ArrayMapFieldNamesToCodeNames` and `O(1)` `EntityInfo.FieldByCodeName()` lookup.
    - Deduplicate `entity.GetAll()` across `DatabaseProviderBase.Save()` and `BaseEntity.finalizeSave()` via `__mj_preMerged`, mark unpopulated virtual fields `NotLoaded = true` on new `datestamps_only` inserts, compute `ProviderBase.prepareSmartCacheCheckParams` fingerprint before widening `param.Fields`, and avoid double property reads in `NunjucksSandbox.guardMemberLookup`.
  - **Task Graph Engine (`@memberjunction/task-graph`)**:
    - Collapse `TaskGraphDispatcher.pollOnce` from `6 + 13G` to `3 + 2G` DB queries via a single `loadGraphState` per active graph per poll, gate `checkHumanTaskCompletion` with an in-memory `pendingHumanTasks` set, pass pre-hydrated `ClaimedTaskCandidate` into `executeClaimed` (`0` re-queries), parallelize `TaskGraphService.Submit` and `persistComputedLayout`, and complete `AgentSpecSync.LoadFromDatabase` round-trip hydration.
  - **AI Agent Runtime, Prompts & PayloadManager (`@memberjunction/ai-agents`, `@memberjunction/ai-prompts`)**:
    - Gate `BaseAgent.runPostRunCompaction` on `!IsVolatileResultMessage(msg)` and `!msg.toolCalls?.length`, reuse `_promptRunner`, queue compaction steps via `_stepSaveQueue`, and account for compaction steps in `_treeBudget`.
    - Remove synchronous `stepEntity.Save()` queue bypasses in `checkExecutionGuardrails` and `validateSuccessNextStep`, and route `AIPromptRunner.executePromptInParallel` parent completion save through `queuePromptRunCompletionUpdate`.
    - Fix `PayloadManager.mergeAllowedPaths` `arguments[2]` warning bug and cache compiled glob/wildcard `RegExp` and parsed path specs statically (`49,150x` fewer regex compilations).
    - Add `O(1)` reference + metadata snapshot fast path to `BaseAgent.capturePromptStepMessages` (`16.2x` faster) and memoize child template placeholder analysis.
  - **High-Volume Telemetry `SaveReturnMode: 'datestamps_only'` (`@memberjunction/ai-core-plus`, `@memberjunction/ai-agents`, `@memberjunction/ai-prompts`, `@memberjunction/actions`)**:
    - Pass `{ SaveReturnMode: 'datestamps_only' }` in `AgentRunStepSaveQueue`, `BaseAgent._agentRun.Save`, `BaseModelRunner._promptRunQueue`, and `ActionEngineServer._logQueue`.
  - **Angular Chat, Task Graph & Step Inspector (`@memberjunction/ng-conversations`, `@memberjunction/ng-ai-test-harness`, `@memberjunction/ng-core-entity-forms`)**:
    - Memoize `DisplayArtifacts`, `SupportingArtifacts`, and single-pass `buildWorkflowStepSummaries` in `MessageItemComponent`, memoize JSON parsing and graph layout positions in `AIAgentRunStepDetailComponent` and `MJAIAgentRunFormComponentExtended`, add `ShouldReplaceDetailAgentRun` guard and `RefreshRenderedMessage` in `ConversationMessageListComponent`, migrate `artifactPaneWidth` from `localStorage` to `UserInfoEngine`, and remove redundant `MJ: AI Agent Runs` query in `AIAgentRunDataHelper`.

- 006a5e7: A NULL `binary(n)` / `varbinary(n)` field no longer breaks the row-level-security synthetic row on SQL Server.

  The Create and Update post-image RLS checks project NULL fields as typed `CAST(NULL AS <type>)`, with the length taken from `MaxLength`. `MaxLength` is a character count and is 0 for the binary types, so a NULL `varbinary(16)` became `CAST(NULL AS VARBINARY(0))`, which SQL Server rejects, and the save failed with a SQL error. Binary types now keep their byte length (`field.Length`). `varbinary(MAX)` and PostgreSQL (`BYTEA`) were not affected.

- 8c120db: Cached RunQuery results now carry the definition of the query that produced them, so an edited query's old results are no longer served. A read under another definition misses; a client's cache check is answered stale when its slot came from another definition; on a shared cache a mismatch holds back writes instead of deleting the slot. The server where an edit was saved deletes the query's slots, and those of queries that compose it, once the edit settles. Slots are keyed by the resolved query, so requests by ID, by name or by both share one. Query extraction rewrites the shared cache slots once per save instead of once per row. The SQL Server cache-status check now reads the documented `TotalRows` column. A client talking to a server that predates the definition check (during a rolling deploy) retries its cache check without the definition, and tries it again a few minutes later.
- 17a4137: Security: the SQL screens now read quotes, identifiers and comments the way the database does. A new dialect-aware scanner, `ScanSQLForScreening` in `@memberjunction/global`, replaces the regex behind `StripSQLStringLiterals`. It understands T-SQL `[…]` identifiers, double-quoted identifiers, `''` escapes, PostgreSQL `E'…'` and dollar-quoted strings, and `--` and nested block comments. It rejects text it cannot classify, such as an unterminated literal. Before this change, a quote inside a bracket identifier, a comment, or a PostgreSQL string opened a literal the database never saw, so `ValidateUserProvidedSQLClause` and `SQLExpressionValidator` accepted a stacked statement hidden behind it. Providers now pass their dialect to the clause, aggregate and ad-hoc query screens. `SQLValidationOptions.Dialect` and the optional `dialect` argument of `ValidateFullQuery` and `StripSQLStringLiterals` let other callers do the same. Without a dialect, SQL must pass under both SQL Server and PostgreSQL rules. A full query must open with the unquoted keyword `SELECT` or `WITH`, compared in ASCII. The GetData resolver screens exactly the text it runs: it trims the query, and it no longer screens a copy in which literal `\n`, `\r` and `\t` sequences are rewritten. A query that passed only because of that rewriting, such as one whose first real line follows a `--` comment ending in a literal `\n`, is now refused.
- 2ca8690: Security: dataset reads no longer run caller SQL or ignore the caller's permissions. The `GetDatasetByName` and `GetDatasetStatusByName` GraphQL queries now screen every `ItemFilters[].Filter` with the same AST screen as a RunView `ExtraFilter` (one statement, read-only, subqueries only over entity base views the caller can read) and pass the session user to the provider; `GetMultipleDatasetStatusByName` passes it too. With a context user, `GenericDatabaseProvider` now requires read permission on each dataset item's entity, applies the user's read row filter to the item query and its status query, and keys the item's cache slot by that filter. A client filter that fails the provider denylist refuses its item. `MJ_Metadata` stays loadable by every authenticated principal. Dataset rows returned over GraphQL get the same encrypted-field API policy as other read paths.
- c7d1170: Security: client SQL fragments reach RunView only through the base-view clause screen. The screen moves from MJServer's `ResolverBase` into `@memberjunction/generic-database-provider` as `ClientClauseScreen`, and the provider exposes it as `ScreenClientClause`. It now also guards `RunViewsWithCacheCheck` (which also gets the `view:batch` API-key scope check), every ad-hoc list source by default (client-supplied, from the list and audience actions, or rebuilt from a stored list snapshot), the REST view routes (which also refuse a `ViewEntity` that was not loaded as an entity), and a saved view's stored WhereClause and sort (on save, and again when the view runs). The screen refuses a subquery over an entity the acting user reads under a row filter (role row-level security or an API-key row filter) or with denied fields, the queried entity included, because a subquery reads the base view without them; the ad-hoc SQL screen uses the same rule. Both screens read table references from a walk of the whole parse tree (subqueries in CASE branches, HAVING and window clauses included, and every FROM item even when an alias repeats), refuse SQL whose SELECT keywords the walk does not account for, refuse a table function in FROM unless it is an unqualified built-in that reads only its arguments, and skip only the parse wrapper's own FROM item. `SQLParser.IdentifierAliases` exposes the names a fallback parse renamed, so bracket-quoted CTE names still resolve. The fallback takes those names from a prefix the SQL does not contain and keeps each one a separate token, so every name in that map is one the parser renamed. `SQLParser.IsIdentifierAliasName` reports that name form, and both screens refuse client SQL that uses it. The ad-hoc SQL screen exempts a FROM item as a CTE reference only when it is unqualified (`dbo` counts as a schema), is in the scope of a WITH that declares the name (its own SELECT or an enclosing one; a CTE body sees the CTEs before it, itself on SQL Server, and every CTE of a PostgreSQL WITH RECURSIVE list), and matches by the dialect's identifier rules (case-insensitive on SQL Server; on PostgreSQL unquoted names fold to lower case and quoted names match exactly). The parse-tree walk takes time linear in the size of the parse tree, and the fallback renaming and the forbidden-function check take time linear in the size of the SQL. A schema-qualified table reference, `dbo` included, resolves only to an entity in that schema. Client clauses may no longer call the functions the dialect forbids in caller SQL (`CallerSQLForbiddenFunctions`), and that shared list now also covers `pg_sleep*` on PostgreSQL and `OPENXML` on SQL Server. The rubric comparison matrix and the conversations UI (the tasks view, task search and the agent artifact lookup) now read the IDs they filter by with their own RunView instead of a subquery over those views; the conversations Tasks tab rebuilds that filter on every load and refresh. On PostgreSQL the screen reads `[Name]` bracket identifiers as the PostgreSQL provider does. Every RunView caller also gets a bracket- and `E''`-aware check that refuses statement separators and comments in filter, sort and search fragments, and a view ID is spliced into SQL only when it is a GUID. A stacked statement hidden from the keyword denylist by a quote inside a bracket identifier no longer reaches the database on these paths.
- 79d4f27: Security (C9): a client filter fragment must now be one balanced SQL expression, read the way the database reads it, so it cannot close the parentheses the server wraps it in and take server-side row filters out of force. Text the lexer cannot read with certainty is refused.
  - **`IsBalancedSQLFragment` (sql-parser).** Reads a WHERE fragment with the dialect's lexer and refuses it when it closes a parenthesis it did not open, leaves one open, ends inside an unterminated string literal, quoted identifier or comment, contains `;`, or contains a comment (allowed only with the new `AllowComments` option, which the provider uses for admin-written custom view WhereClauses). On PostgreSQL it also refuses characters outside ASCII outside string literals and quoted identifiers, dollar-quoted strings and any other `$` outside a name, an escape string followed by another string literal, and a string placed directly after a name containing `@` or `#` (or a number ending in `e`).
  - **`SplitTopLevelAndTerms` (sql-parser).** Splits a fragment at its top-level ANDs (not inside parentheses, CASE … END or a BETWEEN, and on PostgreSQL not inside a SQL Server-style `[…]` name), or returns `null` when it has a top-level OR.
  - **`LexSQL` (sql-parser).** A `--` line comment now ends at a CR as well as an LF, as on SQL Server and PostgreSQL.
  - **MJServer boundary screen.** `assertClientClauseUsesEntityBaseViews` checks the fragment on its own before its wrapped parse, so `1=1) OR (1=1` is refused for `ExtraFilter`, `OrderBy` and `OverrideExcludeFilter` on `RunDynamicView`, `RunViews`, `RunViewByID` and `RunViewByName`. It also refuses a backslash inside a quoted string or identifier, because the screen's parser reads `\'` inside a plain literal as an escaped quote where SQL Server and PostgreSQL do not.
  - **Provider WHERE assembly.** `GenericDatabaseProvider` checks `ExtraFilter`, `OverrideExcludeFilter` and a stored view's rendered `WhereClause` with its own dialect before splicing them next to row-level security, API-key row filters and guest scope, on every RunView path including `RunViewsWithCacheCheck` and `GetRunViewsDatabaseStatus`. When the platform rewrite (`TransformExternalSQLClause`) changes an `ExtraFilter` made of top-level AND terms, the new `PrepareExtraFilterSQL` rewrites, checks and parenthesizes each term on its own, so a predicate a PreRunView hook ANDed on stays a separate term. New protected helpers: `AssertClauseBalanced`, `PrepareExtraFilterSQL`.
  - **Multi-tenancy hook.** `CreateTenantPreRunViewHook` refuses a filter that fails the check and builds `(<ExtraFilter>) AND (<tenant predicate>)`, with the tenant predicate in its own parentheses.

- 5f707d1: SQL Server entity saves and deletes now send their values as typed parameters instead of pasting them into the batch as literals. The statement keeps its DECLARE / SET / EXEC shape with `SET @Name$ = @p$0`, so its text is the same for every record of an entity (for a given set of fields) and SQL Server reuses one cached plan instead of compiling every save. Each parameter is typed from its column (`nvarchar(100)`, `uniqueidentifier`, `bit`, …); `decimal`, `numeric`, `money` and `smallmoney` are sent as their exact text, because the driver would round them through a double. Record Change values are typed from the Record Changes columns, so their text is stored as Unicode. The SQL log, migration captures, error messages and TransactionGroup items get the literal form: the same statement with the values written back in, as before. `SaveSQLResult`, `DeleteSQLResult`, `ExecuteSQLOptions` and `SaveSQLFragment` gain an optional `literalSQL` for that. Date and time values (`date`, `time`, `datetime`, `datetime2`, `datetimeoffset`, `smalldatetime`) are sent as their ISO-8601 text, so nothing depends on the server's time zone: the stored offset is `+00:00`, seconds round as before, and year-boundary values such as `0001-01-01` and `9999-12-31` still save on servers outside UTC. A number field whose value is not a finite number (an empty string, `abc`) fails the save, as it did before, instead of storing `0` or NULL. `sql_variant` values stay inline literals, so SQL Server still picks their base type from the value. If the startup `datetimeoffset` probe fails, it is retried after 30 seconds rather than on every call. `sysname` columns are sent as text; they used to be written unquoted and fail. The public `GetSaveSQL` returns the statement with its values written in.
- Updated dependencies [0d81c53]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [db39145]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [0cc6b08]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [5465489]
- Updated dependencies [d29b5c2]
- Updated dependencies [0ab85d7]
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
- Updated dependencies [0cc6b08]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [c7d1170]
- Updated dependencies [79d4f27]
- Updated dependencies [5f707d1]
- Updated dependencies [d1b1958]
- Updated dependencies [03c085c]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/actions-base@6.2.0-edge.5
  - @memberjunction/actions@6.2.0-edge.5
  - @memberjunction/aiengine@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/sql-parser@6.2.0-edge.5
  - @memberjunction/sql-dialect@6.2.0-edge.5
  - @memberjunction/ai-vectors-memory@6.2.0-edge.5
  - @memberjunction/encryption@6.2.0-edge.5
  - @memberjunction/queue@6.2.0-edge.5
  - @memberjunction/query-processor@6.2.0-edge.5
  - @memberjunction/geo-core@6.2.0-edge.5

## 6.2.0-edge.4

### Minor Changes

- dde482c: A client's `BypassCache` now reaches the database on the smart-cache-check transport.

  `BaseEngine.Config(true)` in a browser could not escape a stale server cache slot. A `RunView` that
  asks for `BypassCache: true` alongside `CacheLocal: true` is routed down the smart-cache-check
  transport, and that transport never carried `BypassCache` — the client omitted it from its input map
  and the resolver omitted it from the params it handed the provider.

  The omission **inverted** the caller's intent rather than merely losing it. A bypassing param is
  ineligible for a cache status, so none is attached — and a missing `cacheStatus` is also how "the
  client has nothing cached yet" arrives, which is the server's cue to answer from its OWN cache
  without touching the database. So the strongest available "read true database state" landed on the
  one path most likely to avoid one, and a slot left stale by a missed invalidation could not be
  escaped from a client until the process restarted. The field's own documentation says the opposite
  ("the query always hits the database"), as does the GraphQL input type this transport already uses
  ("the pre-check cache lookup is skipped").

  The write half was already correct (`runViewCacheEligible` begins with `!param.BypassCache`), so a
  bypassing result was never stored — only the read was wrong, which is why it looked consistent from
  every individual vantage point.

  Fixed at all three sites: the client sends the field, the resolver forwards it, and a bypassing item
  skips the server-cache consult and goes to the database. No schema change was needed — the input type
  has always declared it.

  This is the third field found missing from the same pair of maps, after `Aggregates` (B40) and
  `DataSource`. The new resolver tests pin all three, so a fourth omission fails in CI rather than in a
  consumer's UI.

- d86bcbc: Engine and shared-cache hardening: phases 1–3 (items 2.1–2.3, 3.1, N7, N11) and the non-breaking part of Phase 5 of `plans/engine-cache-architecture-plan.md`. The related-record collection migration is in its own change.
  - **Polled entities no longer fill Redis with write-only keys.** `MJ: User Routines`, `MJ: AI Agent Session Bridges` and `MJ: Action Execution Logs` are read on a schedule with a timestamp in the filter, so every poll minted a permanent cache key and published it to every server. They are now `AllowCaching = false` (metadata).
  - **Shared cache entries expire (default one hour) without leaking the index.** `RedisLocalStorageProvider` defaults `defaultTTLSeconds` to 3600 (`0` disables it; MJAPI reads `REDIS_TTL_SECONDS` or `cacheSettings.sharedCacheTTLSeconds`). The ever-growing `__categories__` set is gone. RunView entries are indexed per entity in `{prefix}:__group__:RunViewCache:<Entity>`, pruned on read. `ClearCategory` and `GetCategoryKeys` use `SCAN`. `ILocalStorageProvider.SetItem` accepts optional `{ TTLSeconds, IndexGroup }`, and providers may implement `GetIndexGroupKeys`.
  - **A save now reaches cache entries written by other servers**, not only those this process knows about. When a save finds that an indexed entry has expired, it invalidates the entry, so peer engines reload instead of staying stale.
  - **Identical cross-server payloads are skipped.** `BaseEngine` compares the payload's (primary key, `__mj_UpdatedAt`) pairs with the rows it holds, and skips the re-materialization, rebuild and notification when they match. Slot maintenance now stamps `maxUpdatedAt` from the rows rather than the clock.
  - **Permission-constrained engines stay empty.** Payloads from other servers never fill a config the user cannot read. Engines that load before `LocalCacheManager` initializes still register their cross-server callbacks.
  - **A cached slot that expired under a running engine now notifies peers whichever server takes the next save.** Engines hold rows in memory and never re-read their slot, so when a slot expires the save that would normally rewrite it has nothing to rewrite and publishes nothing. The slot's fingerprint is now also recorded when a process _reads_ it — previously only the process that wrote it knew — so the save still invalidates it and every peer reloads. Shared stores only: on a process-local store there are no peers, and indexing reads would suppress the category scan that finds slots persisted from an earlier session.
  - **Degradations are visible in production** through the new `LogWarning`.
  - **The periodic database checks now run only where an entity declares it can drift.** The engine sweep and the user-cache staleness check both compared held rows with the database on a timer. They now visit only entities whose `TrustServerCacheCompletely` is `false` (the user-cache check also runs whenever the cache is shared across processes) — MJ's existing declaration that rows can appear without firing an event (and the flag a database CHECK already requires for `AllowDirectSQLInsert`/`Update`/`Delete`). The user cache's periodic full reload (`databaseSettings.metadataCacheRefreshInterval`, in milliseconds, default 180000) is gated the same way — it previously reloaded every user and role unconditionally, which on its own kept the database awake. The engine sweep visits an untrusted entity only when a loaded engine holds it as a config. Untrusted entities read only through one-off `RunView` calls are never swept. The user-cache staleness check (two aggregate queries) runs on any fleet sharing a cache, because a lost notice would otherwise leave a deactivated user or revoked role in force on a peer. Any recurring query prevents Azure SQL serverless auto-pause, so a deployment that needs the database to idle must set `engineSweepIntervalSeconds` to `0` (with or without Redis, unless no loaded engine holds an untrusted entity) and, on a shared-cache fleet, `userCacheCheckIntervalSeconds` to `0`. `engineSweepIntervalSeconds: 0` / `userCacheCheckIntervalSeconds: 0` still disable the timers outright.
  - **`BaseEngine.GetStateCensus()`** reports what an engine holds, including derived-state counts. It is exposed by the `EngineStateCensus` GraphQL query (system user only).
  - **The CLI clears the shared cache after it changes the database** (closes #4083). When `REDIS_URL` is set (in the environment or the dotenv file the CLI loads; prefix `REDIS_KEY_PREFIX`), `mj sync push`, `mj codegen` and `mj migrate` clear the RunView, query, dataset and metadata categories and the metadata snapshot, so every server reloads its engines and re-checks its metadata.
    - `mj sync push` clears after a successful push **that wrote rows**, and after a failed one **only when it left rows behind**. A cancelled push, or one that created, updated and deleted nothing, does not clear: a no-op push runs in every deploy, and clearing after it would drop every server's cache for nothing. Since #4550 an atomic push (the default) rolls its writes back and says so, so a clean rollback does not clear either. A push whose outcome cannot be read still clears. A non-atomic push that fails reports exactly what stayed committed, and that does clear; an outcome the CLI cannot read clears too.
    - Opt out with `--skip-cache-clear` or `MJ_SKIP_SHARED_CACHE_CLEAR=1`. The new `mj cache clear [--dry-run] [--category]` does the same on demand, for example after direct SQL.
    - `ClearSharedCacheCategories` accepts `IncludeMetadataSnapshot` (default: on when no categories are given).
    - A server that hears the metadata snapshot was removed runs its staleness check (with up to 2 s of random delay, `ProviderBase.PeerMetadataNoticeJitterMs`) and reloads only if the database changed.
  - **The user cache now hears about users created on other servers** (plan §15). `UserCache` is consulted on the authentication path but had no invalidation path at all: it is not a `BaseEngine`, so neither the sweeper nor shared-cache events reached it, and its optional poll is off by default. A user created on one server was invisible to every other server until that server restarted — a newly onboarded organization's first API key was rejected as "invalid or expired" until then.
    - It now reloads when `MJ: Users` or `MJ: User Roles` rows are saved or deleted in this process, and tells other servers through a key-only notice on the shared cache (they reload after a short random delay). A shared-cache clear from the CLI heals it too.
    - `RefreshIfChangedInDatabase()` compares two row counts and the newest `__mj_UpdatedAt` with the database and reloads only on a difference; MJAPI runs it on the new `cacheSettings.userCacheCheckIntervalSeconds` (default 300, 0 disables).
    - New `UserCache.FindUser({ ID | Email })`: a hit is answered from memory, a **miss is checked against the database** instead of being reported as "no such user". Prefer it over `Users.find(...)` on any path that decides whether a request is allowed. MJServer's `verifyUserRecord` uses it.
    - Measured on SQL Server and PostgreSQL with three servers on one Redis: a user created, given a role, or deactivated on one server reaches the others in about a second; with unshared caches (the old behaviour) it never arrives.
  - **`cacheSettings` now take effect.** `LocalCacheManager.Initialize` applies a configuration passed by a later caller, so the settings a host hands to `StartupManager` are no longer dropped because the database provider initialized the cache manager first (every knob — `maxMemoryMB`, `maxPercentOfCachePerEntity`, `defaultTTLSeconds`, `evictionSweepIntervalSeconds`, `verboseLogging` — was inert). `UpdateConfig` re-arms the eviction sweep.
  - **Shared-cache entries are no longer aged out by each process's own clock.** With a store shared across processes, expiry is left to the store; a local `defaultTTLSeconds` would have had every server deleting the same keys on its own schedule and publishing an invalidation for each.
  - **Expiry is per category, and proxy keys never expire on their own.** New `RedisProviderConfig.categoryTTLSeconds` (default `{ default: 0 }`). The metadata timestamps key and a dataset's `_date` key are written after what they vouch for, so a single TTL let them outlive it: a server booting into that window adopted a freshness claim with no payload behind it and served empty metadata as current, and the dataset check threw. A metadata load now adopts stored timestamps only alongside their payload, and `IsDatasetCacheUpToDate` reports out-of-date instead of throwing.
  - **The Redis index-group prune fails closed.** An unusable pipeline reply keeps every member; it previously treated unanswered members as dead and removed live keys from the index, after which a save never invalidated peers' copies of that entity.
  - **Every transaction batches its cache maintenance, not just `BeginEntityTransaction`.** The raw `BeginTransaction` / `CommitTransaction` / `RollbackTransaction` path now opens and settles the same batch, so the 41 call sites that use it — new-user creation on first login, the magic-link service, the roles/users sync resolver, `MergeRecords`, every generated cascade-delete override — get one cache write per slot on commit instead of one per save, and a rollback no longer leaves rows in the shared cache that were never committed. A failed commit invalidates rather than writing.
  - **A transaction handle released or reset with a batch still open no longer disables the cache for its entities.** New `LocalCacheManager.AbandonEntityEventBatch`, called from `ReleaseIndependentInstance` and `ResetTransactionState`: the batch is dropped and its entities invalidated. Previously the batch became unreachable while its entities stayed marked pending, so every cached read of them missed for the life of the process.
  - **The engine sweep writes shared slots under the same lock the event path uses** (new `LocalCacheManager.ReplaceRunViewResultLocked`), so a sweep can no longer clobber a peer's in-flight read-modify-write.
  - **The sweep's freshness probe is robust.** It compares the held newest-`__mj_UpdatedAt` the way SQL `MAX` does (ignoring nulls), so one un-stamped row no longer makes a config reload on every interval forever; it selects `MAX(__mj_UpdatedAt)` only for entities that have the column, comparing by row count alone otherwise; and on SQL Server a failed batched probe falls back to per-item probes instead of failing every entity in the engine.
  - **A reloaded engine property is emitted once, after its derived state is rebuilt**, so subscribers never observe rows with the previous load's derived state.
  - **The user cache waits for the writing transaction before reloading.** A save raises its event inside the transaction that made it, so the reload used to read a database that did not have the row yet — and told other servers to reload early. It now waits for the transaction to settle (bounded), and on a miss reads only that user's roles rather than scanning the whole role table, with the remembered-miss map bounded so repeated lookups of unknown addresses cannot grow it.
  - **`mj migrate` clears the shared cache when it changed something, and only then.** A run that applied no migrations no longer makes the whole fleet drop its cache; a run that applied migrations before failing now does clear, matching `mj sync push`.
  - **`mj cache clear` reports per category and fails loudly.** A category that could not be cleared is warned about and exits non-zero instead of printing a key count and "servers will reload"; an unknown `--category` is rejected rather than silently doing nothing. New `RedisLocalStorageProvider.ClearCategoryChecked`; `SharedCacheCategoryClear` carries `Ok`/`Error`.
  - **Six CLI commands stop paying the full bootstrap.** oclif command ids are colon-separated, so the space-form entries in the light-command list (`cache clear`, `plugin add`, `migrate create`, `migrate convert`, `dev workspace *`, `codegen manifest`, `dbdoc *`) never matched — `cache clear` measured 2.44–2.62 s against 0.17–0.19 s once its id matched, on the same build. A test now fails on an entry that cannot match a real command id.
  - **An emptied Redis index-group set is deleted** rather than left behind as a persistent empty set that a `volatile-*` eviction policy can never reclaim.
  - **A category clear only reloads engines when the RunView category is cleared.** Clearing metadata or datasets no longer triggers a reload per category.
  - **The cache registry stays in each process on a shared store.** New `ILocalStorageProvider.SharedAcrossProcesses`, declared by the Redis provider. Servers no longer overwrite one shared registry key or broadcast it.
  - **Metadata changes reach other servers in seconds, as a small notice.** `RedisLocalStorageProvider` accepts `publishModes` / `defaultPublishMode` (`'full'`, `'notice'` or `'none'` per category). MJAPI publishes RunView rows in full and metadata-snapshot writes as key-only notices; everything else is not published. A server that hears a notice runs its metadata staleness check and adopts the shared snapshot. Previously each metadata save broadcast about 21 MB to every server, and other servers only noticed at the next poll (3 minutes by default). Browsers are now relayed only RunView changes.
  - **`SQLServerDataProvider.RefreshIfNeeded` passes its arguments through**, so event-driven metadata checks are no longer throttled away.
  - **The scheduled-job stale-lease sweep reads the database directly** (`BypassCache`).
  - **Servers load from the shared cache from the start.** A database provider installs `ProviderConfigDataBase.LocalStorageProvider` before loading metadata, and `StartupOptions.cacheManagerConfig` reaches `LocalCacheManager` (MJAPI's `cacheSettings` now take effect). MJAPI builds and subscribes to Redis before connecting to the database. A server that starts after the cache is warm reads metadata and startup-engine data from Redis instead of the database: 14 queries instead of 111 in the fleet test, with no broadcasts.
  - **Concurrent saves on different servers no longer lose rows from a shared cache entry.** `RedisLocalStorageProvider.WithKeyLock` (new optional `ILocalStorageProvider` member) serializes `LocalCacheManager`'s in-place read-modify-write across processes. If the lock cannot be taken, the entry is invalidated instead. One gap remains: a save that waits more than 5 s for the lock invalidates without it, and if the holder then writes a slot built from older rows, that save's row is missing until the slot is next reloaded. This is rarer than before, when there was no lock at all. In the fleet test, concurrent saves previously left the shared entry — and the servers that adopt it — permanently missing rows in up to 80% of rounds; 0 of 20 rounds disagree now.
  - **A PROVIDER transaction updates each cached result once, on commit, and never with rolled-back rows.** `DatabaseProviderBase.BeginEntityTransaction` opens an entity-event batch on the provider. This covers `BeginEntityTransaction` and `RunInEntityTransaction`. Raw `provider.BeginTransaction()` opens the same batch, but `CommitTransaction` closes it before running post-commit tasks, so an engine's `CacheLocal` slot is still rewritten once per save there (100 saves gave 101 slot writes, against 1 under `BeginEntityTransaction`). It does **not** cover `TransactionGroup.Submit()` / the `ExecuteTransactionGroup` resolver, which open a transaction directly on the connection pool rather than through the provider, so each item still publishes its own update — measured on two live servers as 40 rows producing 40 messages and 11.4 MB. That path is #4250. The saves and deletes inside it are recorded, then applied when the outermost scope settles. On commit, each affected RunView cache entry gets one read-modify-write, one write and one publish. On rollback or failure, the affected entries are invalidated. While a batch has pending changes for an entity, cached reads of that entity miss and fills are not stored, so code inside the transaction still reads its own writes. New public `LocalCacheManager.BeginEntityEventBatch` / `EndEntityEventBatch` / `RunInEntityEventBatch` / `IsBatchingEntityEvents` and `ApplyRowChanges`. Measured in the fleet test on one build, 100 records on 3 replicas: saving them one at a time costs 111 slot writes and 9.96 MB published, and every other server does 100 handler calls, ~100 rebuilds and 190 ms of work; the same 100 saves in one `BeginEntityTransaction` cost 12 writes and 3.45 MB, and each peer does 1 handler call, 1 rebuild and 3 ms. Deleting them one at a time costs 100 writes and 6.53 MB against 1 write and 17.5 KB. Before, a rolled-back transaction left its rows in the shared cache. When several cross-server payloads for one engine property arrive together, `BaseEngine` now materializes only the newest.
  - **An operator runbook for enabling sweeping** is in `guides/CACHING_AND_PUBSUB_GUIDE.md`: the four periodic checks and their settings, how to declare an entity as drifting, and why the metadata snapshot must be invalidated for a declaration to take effect (a restart alone is not enough, because a warm-booting server adopts the existing snapshot). Note that enabling the metadata sweep is itself a metadata change, so it needs one explicit `mj cache clear` or `mj sync push` to break the circle; after that it keeps metadata converged on its own.
  - **Metadata changed outside MJ now reaches running servers, if you say it can.** A new metadata sweep (`cacheSettings.metadataSweepIntervalSeconds`, default 300, 0 disables) compares this process's metadata with the database and reloads when it differs. Metadata staleness was otherwise entirely event-driven — a `BaseEntity` write to a member entity, a peer's snapshot notice, or a CLI clear — so metadata written with raw SQL was never noticed by a running process. The sweep reads the database **only when one of the entities the metadata is built from declares `TrustServerCacheCompletely = false`**; on a stock installation none do, so it issues no query and takes no lease. New `ProviderBase.SweepMetadataAgainstDatabase()` and `MetadataMembersDeclaringDrift()`.
  - **Changes made outside MJ now reach running engines.** `BaseEngine.SweepAgainstDatabase()` compares each loaded config's row count and newest `__mj_UpdatedAt` with the database (new optional `IRunViewProvider.GetRunViewsDatabaseStatus`, implemented by `GenericDatabaseProvider`), reloads what differs, and writes the fresh rows to the shared cache once so every server adopts them. `BaseEngineSweeper` runs it on an interval. MJAPI starts it from `cacheSettings.engineSweepIntervalSeconds` (default 300, 0 turns it off). On a shared cache, one server per interval sweeps each engine, using the new optional `ILocalStorageProvider.TryAcquireLease` / `ReleaseLease` (`SET NX PX` on Redis). In the fleet test, a direct SQL change reached every server in 1.28 s and 1.49 s against a 3 s interval, with exactly one replica sweeping and reloading while the others adopted its payload; before, it was never seen. The entity must declare `TrustServerCacheCompletely = false` — see the gating note above.
  - **Servers that start together no longer all query the database.** `StartupManager` takes a shared warm-up lease around engine loading (`StartupOptions.warmupLeaseMs`, default 30 s, 0 turns it off). The first server fills the cache and the others load from it, so fleet boot cost grows by **14 database calls per additional server instead of 111**: three simultaneous servers make 139 calls (111 + 2 x 14) and five make 167 (111 + 4 x 14), with every replica converging on an identical state.
  - **Periodic metadata checks no longer download the whole snapshot.** On a shared cache, each check now reads only the stored timestamps and loads the multi-megabyte snapshot only when another server stored a newer one.
  - **Entity Record Document syncing reads existing documents from the database** (`BypassCache`) instead of writing a cache entry per batch that its own saves discard.
  - **The PostgreSQL integration bootstrap now runs the startup engines**, as MJAPI does, so engine-backed checks run against loaded engines on PostgreSQL.
  - **`TemplateEngineBase`** now groups template content and params in one pass instead of filtering both arrays for every template, which also makes its rebuild idempotent — the shape #4470 fixed in `AIEngineBase`. Engines with non-trivial derived state should carry a unit test that runs the rebuild twice and compares the result; see `baseEngine.derivedStateIdempotency.test.ts`.

### Patch Changes

- fcf8e1c: A value encrypted with a key this install doesn't have now logs one warning per key instead of an error on every load.

  An app can ship values already encrypted with its own key, an MJ Encryption Key whose material only some installs are given (say, an environment variable). On an install without that key, every load of every such row logged `Failed to decrypt field …`, at MJAPI startup too, because the credential engine loads all credentials.
  - **`EncryptionKeyUnavailableError`** (code `ENCRYPTION_KEY_UNAVAILABLE`). `EncryptionEngine` throws it when reading a key fails and the key's source reports it doesn't hold the key (`KeyExists` is false), for example an unset environment variable. Any other failure is thrown as before. The check runs only after a failed read, so a remote key source costs nothing extra on the normal path.
  - **`IsEncryptionKeyUnavailable(err)`** checks the code rather than the class, so it still works when two copies of the package are loaded. **`ReportEncryptionKeyUnavailable(err)`** logs one warning per key per process, naming where the key is looked for.
  - **Decrypt on load** (`GenericDatabaseProvider`) and **API decryption** (`ResolverBase`) report an unavailable key once and leave the value as it was: still encrypted on load, the encrypted sentinel in an API response. Other decrypt failures are still logged as errors.

- e1942c7: Close stacked-SQL injection through RunView `Aggregates[].expression`. The provider no longer runs a caller's aggregate text. Each expression must be a single aggregate function call over the entity's columns, and the query runs the SQL that the new `CheckAggregateExpression` (in `@memberjunction/sql-parser`) rebuilds from the checked parse tree, with the dialect's quoting. Any other expression returns a per-aggregate error, and the rows and the other aggregates still load. Some expressions that used to run are now refused: arithmetic or functions around the aggregate call (`SUM(x) + 1`, `ROUND(AVG(x), 2)`, `SUM(x) / COUNT(*)`), `CONVERT` (use `CAST`), window clauses, PostgreSQL `FILTER (WHERE …)` and `EXTRACT`, a backslash inside a quoted string or identifier, and `COUNT_BIG(*)` and `TRY_CAST`, which the parser cannot read. The GraphQL boundary screen that guards ExtraFilter and OrderBy now also screens aggregate expressions. `SQLParser.HasStackedStatements` now reads tokens with the dialect's lexer, so a statement separator after a PostgreSQL `E'…'` string is no longer missed. A column reference in an aggregate resolves by `IdentifierMatches` (new in `@memberjunction/sql-dialect`), the rule the field-level security check reports with, so it resolves only to a column that check would report for that reference; a reference that rule does not match to a column is refused, even where the database would resolve it, and on an entity whose columns differ only by case a reference that is not the exact spelling of one of them is refused. A `LIKE … ESCAPE` clause is refused rather than dropped, a parenthesized `NOT (…)` keeps its grouping in the rebuilt SQL, and the lexer reads a PostgreSQL dollar-quote tag that contains non-ASCII letters.
- bdea87a: A recorded UPDATE now carries only the fields the save changed, so replaying a Metadata_Sync migration no longer resets the target row's other columns.

  Metadata_Sync migrations are SQL logs of `mj sync push`. The logged form of an update passed every column of the row as it stood in the recording database, even though the push had changed one field. Replayed on a deployment, it overwrote every setting that deployment had tuned on that MJ-owned row. `V202609221852__v6.2.x__Metadata_Sync.sql` changed only `AllowUserSearchAPI` on `MJ: Content Items`, and its replay also reset a consumer's `TrustServerCacheCompletely = 0`. With the cache back on, that consumer's content-vectorizing worker re-read a cached list of pending items and re-embedded the same batch for hours. The same migration rewrote 18 entity rows and 2 entity-field rows in full.
  - **New hook `GenericDatabaseProvider.RenderReplayUpdateSQL(binding, entity, changedFieldValues)`.** It mirrors the create-side `RenderReplaySaveSQL` (#4503) and receives only the parameters whose fields are dirty. The default returns `undefined`, so dialects without an override (PostgreSQL) log exactly what they logged before.
  - **SQL Server overrides it.** The logged update is `EXEC spUpdate<Entity>` with the changed fields plus the primary key. The update procs keep any column whose parameter is not passed (`ISNULL(@p, [Col])`), which is the same contract not-loaded fields already rely on.
    - A field changed to NULL keeps its `_Clear` companion.
    - The replay form reuses the save's variable suffix, so it never consumes an extra `TransactionGroup` ordinal.
    - A save whose changes touch no proc parameter is logged as a SQL comment, because there is nothing to replay.
    - An entity with a hand-written update proc (`spUpdateGenerated` off) keeps the full-row form, because nothing promises that proc keeps unpassed columns.
  - **A forced save keeps the full-row form.** A save with `IgnoreDirtyState` (MetadataSync's `alwaysPush`) asked to re-impose the whole row, so its recording still does.
  - **The executed SQL is unchanged.** Execution still passes every column. Only the log form changed, and only for loggers that write the record-change-free form (`logRecordChangeMetadata` not `true`).

  Behaviour note: a recording now re-imposes only the values that MJ changed. A value MJ did not change, even one that differs on a consumer, is no longer written by the replay. Migrations published before this change still contain full-row updates, so consumers that tune MJ-owned rows should keep re-applying those settings after migrating.

- 68a7e3b: A transaction opened on a shared database provider no longer captures unrelated callers (#4786).

  The transaction now belongs to the async scope that began it (tracked with `AsyncLocalStorage` in `GenericDatabaseProvider`): that scope and everything it starts run on the transaction; any other caller on the same provider instance — another request on the global `Metadata.Provider`, a background timer — runs on the pool. Previously every query issued through the instance while `_transaction` was set ran inside it, so an unrelated read ran on the transaction's connection, an unrelated write was rolled back with it, and reads that queued behind its COMMIT failed with "The ambient transaction ended before this query ran".
  - SQL Server (`ExecuteSQL`, `ExecuteSQLBatch`) and PostgreSQL (`ExecuteSQL`, `RunColocatedSQL`) route to the transaction only for callers in its scope; `ignoreAmbientTransaction` keeps working inside the scope.
  - Savepoint SQL always reaches the handle, whichever scope settles a frame.
  - `RunAfterCommit` / `CapturePostCommitToken` from a caller outside the transaction no longer tie that caller's work to a transaction it is not part of — that work runs now, detached, on the pool, outside every transaction on the instance. If such a task opens its own transaction while another is open on the instance, it joins that one as a savepoint (logged); use an independent instance for that. `PendingIdlePostCommitTaskCount` is deprecated and always 0.
  - A caller outside the scope that _begins_ a transaction while one is open still joins it as a savepoint, now logged once per transaction; it stays in that transaction until the owner ends it.
  - A begin that fails no longer leaves a pending claim behind that would make work forked from the same scope a member of that scope's next transaction.
  - A begin that runs synchronously inside un-awaited work or an event listener makes the launcher part of the transaction (see "Who is in the transaction" in the transactions guide).
  - Work launched inside the scope that runs after it ends runs on the pool, as before, and never joins a later transaction.

- b653746: A capped or paged set operation (`UNION` / `INTERSECT` / `EXCEPT`) that has to be wrapped as a derived table now keeps its ORDER BY valid and its own row cap in force (#3778).

  The derived-table form is used when the set operation's own cap is not a plain row count, for example `TOP` on more than one branch. The set operation's ORDER BY moves outside the derived table, which used to have two problems on SQL Server:
  - **The ORDER BY could not bind.** It was moved as written, so `ORDER BY a.Name` named a branch's table alias outside the scope where that alias exists, and the query failed with `The multi-part identifier "a.Name" could not be bound`. Qualifiers are now dropped (`ORDER BY Name`) so the clause names the derived table's output columns.
  - **The set operation's own `OFFSET … FETCH` was dropped.** The inside was cut at the ORDER BY, so the cap after it was lost and the query returned rows its own cap excludes. That cap is now applied by a second derived table around the set operation, ordered the same way. It cannot stay in the original text: SQL Server refuses the branches' `TOP` and the set operation's `OFFSET` in one subquery.

  The original #3778 case, an unparseable query ordered by an aliased column, was already fixed when the row cap moved to editing the statement in place. Two SQL Server cases are added to the `runquery-rendering` integration bundle.

- b8a9e5e: Remove nested `UUIDsEqual` scans where both lists grow with the data or the code runs on every render. Fix one cross-database lookup bug.
  - **Rubric publish validation could miss advisory parents.** `ValidateRubricTree` looked a raw `parentId` up in a map with normalized keys. On SQL Server (upper-case IDs) the advisory-ancestor walk silently stopped, so a non-advisory criterion under an advisory group was not reported. The map is now a `UUIDMap`.
  - **Per-render getters no longer rescan the entity list.** The Entity form's `FormChromeCandidates`, the Data Explorer's `RecentEntities` / `FavoriteEntities` and the storage admin's `FilteredAccountRows` now read cached or once-built indexes.
  - **Entity lookups by ID** in the ERD, the get-entity-details and list-entities actions, recent-access and the form builder now use the provider's indexed `EntityByID`. The application dialog uses a once-built index.
  - **Other once-built indexes:** tag lookups, permission grantee names, orphaned-conversation owners and flow-editor node moves.
  - `createFakeProvider` (`ng-test-utils`) now implements `EntityByID`, like a real provider.
  - **New helper:** `GroupByUUID(items, getId?)` in `@memberjunction/global` groups items by a UUID in one pass, each group in input order.
  - **Server sites that matched two growing lists:** the user cache (users × user roles), resource-permission deduplication, user/role sync, default-app user applications, scheduled-job statistics, MCP action discovery, REST connector schema introspection and rubric calibration.
  - **Offline tools:** CodeGen relationship sync and CHECK-constraint value lists, CodeGen's related-entity form lookups, and `mj artifacts reclassify`.
  - **Angular screens that scale with the data:** the AI Agent form's linked prompts and actions, the prompt priority matrix, the Testing explorer, the conversations message cache, the Query Browser tree, the Actions overview and categories, the dashboard browser, list-form bulk remove and credentials bulk actions.

  Behaviour is unchanged otherwise, and each site has a test that also passes against the old code.

- Updated dependencies [a709bb6]
- Updated dependencies [432cb73]
- Updated dependencies [1d6e3e8]
- Updated dependencies [49f26d9]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [64b6fa5]
- Updated dependencies [fcf8e1c]
- Updated dependencies [d86bcbc]
- Updated dependencies [af6f892]
- Updated dependencies [7316ac3]
- Updated dependencies [6d5c6ad]
- Updated dependencies [be3dae0]
- Updated dependencies [08b3d7b]
- Updated dependencies [20650af]
- Updated dependencies [1ea4085]
- Updated dependencies [aee2d53]
- Updated dependencies [25f7b82]
- Updated dependencies [90829e3]
- Updated dependencies [aac148b]
- Updated dependencies [a28ce42]
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
  - @memberjunction/aiengine@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/encryption@6.2.0-edge.4
  - @memberjunction/sql-dialect@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/actions@6.2.0-edge.4
  - @memberjunction/sql-parser@6.2.0-edge.4
  - @memberjunction/actions-base@6.2.0-edge.4
  - @memberjunction/queue@6.2.0-edge.4
  - @memberjunction/query-processor@6.2.0-edge.4
  - @memberjunction/geo-core@6.2.0-edge.4
  - @memberjunction/ai-vectors-memory@6.2.0-edge.4

## 6.2.0-edge.3

### Minor Changes

- dfe40a4: Binary fields work end to end, and persisted embeddings gain a binary float32 copy that loads about 14× faster than the JSON one.

  **Binary fields (varbinary / binary / image on SQL Server, bytea on PostgreSQL).** Previously a binary column reached `BaseEntity` as whatever the driver returned. A Node `Buffer` then serialized over GraphQL as `{"type":"Buffer","data":[…]}`, and saves wrote the base64 text into the column. Now a binary field's value is a **base64 string** everywhere above the database: in `BaseEntity`, every cache, RunView results and the GraphQL wire. Providers convert at the boundary. SQL Server binds a `0x…` hex literal, PostgreSQL binds a `Buffer`, and rows read back become base64, including rows returned from a transaction group save. CodeGen now declares a length-less `varbinary` parameter as `varbinary(MAX)`; it used to emit `varbinary`, which T-SQL truncates to one byte. Generated getters document the encoding, and generated forms skip binary fields.
  - **`RunView` omits binary fields by default.** Set `IncludeBinaryFields: true`, or name a binary field in `Fields`, which sets it for you. The flag is part of the cache fingerprint, so the two shapes never share an entry. A single-record `Load()` always includes binary fields. Engine configs take `IncludeBinaryFields: true | 'DatabaseProviderOnly'`; the second loads binary fields only in server processes.
  - **Validation.** Saving a value that is not canonical base64 into a binary field fails `Validate()` with a message naming base64. A value whose decoded length exceeds a fixed-length column also fails.
  - **`@memberjunction/global` codecs.** `BytesToBase64` / `Base64ToBytes` / `TryBase64ToBytes` pick the fastest host implementation: native `Uint8Array.fromBase64`, then Node `Buffer`, then `atob`. On Node, validation is fused into the decode and is fuzz-tested to accept exactly what `IsValidBase64` accepts. `Float32VectorToBase64` / `Base64ToFloat32Vector` handle little-endian float32 vectors. `ReplaceByteArraysWithBase64` makes any raw query row JSON-safe.

  **Binary vector columns (migration `V202610021716`).** These nullable `varbinary(MAX)` companions of the JSON vector columns are added:
  - `EntityRecordDocument.VectorBinary`
  - `EmbeddingVectorBinary` on `AIAgentNote`, `AIAgentExample`, `Query` and `Tag`
  - `Component.FunctionalRequirementsVectorBinary` and `Component.TechnicalDesignVectorBinary`

  Every writer now fills both columns: `BaseEntity.GenerateEmbedding*` (new optional binary field parameter), the note, example, component, query and tag entity servers, `TagEngine`, and the entity vectorizer (`EntityVectorSyncer`). Readers prefer the binary column through the new `ReadStoredVector` and `DecodeVectorBinary` in `@memberjunction/ai-vectors-memory`, and fall back to JSON for rows written before the column existed or for invalid binary values. The readers are `SimpleVectorServiceProvider`, `SimpleVectorDatabase` (new `binaryVectorField` ProviderConfig key), `AIEngine`, `TagEngine`, `TagHealthJob`, `QueryEngineServer` and clustering. For 20,000 × 1,536 vectors, decoding takes 0.28 s, against 3.9 s to parse the JSON.

  Fixes found along the way:
  - Clustering no longer counts a binary-only row as having no vector.
  - A note, example or tag whose stored JSON vector is malformed is now dropped from the in-memory index instead of throwing.
  - A PostgreSQL transaction group post-processes each row with its entity's own provider rather than the process-global one.

- 60bd774: Form contributions can be metadata rows, not only compiled panels, and users can place, share, hide and remove them from the form itself.

  **Contributions from metadata.** A `MJ: Entity Form Contributions` row (migration `V202610051244__v6.2.x__Entity_Form_Contributions`) mounts a `MJ: Components` row (`Type='Widget'`, spec `componentRole: 'form-panel'`) on an entity's form. It carries the same registration bag as `@RegisterClassEx` plus `Presentation`, `Title`, `Icon`, `Configuration`, `Precedence` and User/Role/Global scope. `CollectFormContributionRegistrations` merges rows with class registrations, and the form collapses the list once per resolve (`ResolveFormContributionWinners`): one winner per `ContributionKey`, the higher rank wins, a compiled panel wins a tie against any row, and between rows `User` beats `Role` beats `Global` (`FormContributionOutranks`). `CollectFormPanelRegistrations` stays as a deprecated wrapper that returns compiled registrations only. Wildcard (`'*'`) registrations take part on every form, but their place claims are ignored: one that claims a grid, a section or a tab replaces nothing, and one that names a section to draw in draws at its slot. `InteractiveFormsEngine` caches the rows and the full custom forms (in the browser, the shared ones and the signed-in user's own) and fetches each panel component by ID once (`GetComponentByID`); `InteractiveFormPanelComponent` renders them, and a panel can change only the fields it claims, in edit mode. On the 11 identity, permission and form-metadata entities in `RESTRICTED_FORM_ENTITIES`, only `User` rows and full custom forms render.

  **One rule set, shared by the browser and the server.** The contribution key is derived once (`ResolveContributionWriteKey` in `@memberjunction/interactive-component-types/forms`). `@memberjunction/core-entities` `custom/FormScope/` holds the spec-to-row mapper (`ApplyContributionSpecToRow`), the claim validator (`ContributionClaimRefusal`), the scope rules (`FormScopeWriteRefusal`, which normalizes Scope and fails closed, `ComponentWriteRefusal`, `FormRowComponentRefusal`, `ComponentNameCollisionRefusal`, `IsCallersOwnComponent`, `IsCanonicalFormScope`, `ContributionScopeRank`, `FormContributionOutranks`, `IsSelectableFormOverride`, `FormScopeAllowedOnEntity`, `UserCanManageFormDefaults`), the hide-setting key helpers, and the retire rule (`ActiveContributionSiblings`, which compares keys ignoring case as the SQL Server unique index does).

  **What a panel can stand in for.** One claim per row, enforced by the database: a related grid, one or several field sections (`ReplacesSectionKey`, `ReplacesSectionKeys`), a group of fields (`ReplacesFieldNames`, rendered once inside that section), or a place inside a section (`InSectionKey` + `SectionPosition`). A compiled panel renders at the slot it registered for, and a panel standing in for something takes its place. The `top-area` slot is accepted by the CHECK constraint but no form emits it, so the placement dialog does not offer it.

  **Authoring.** New actions `Create Form Contribution`, `Modify Form Contribution`, `Activate Form Contribution Version`, `Get Form Contributions For Entity` and `Get Form Composition For Entity`. The write actions, and the existing Modify / Activate / Revert Interactive Form actions, change only the caller's own `User` rows; a `Role` or `Global` row returns `FORBIDDEN` for every caller. A spec with more than one claim returns `INVALID_CLAIM` before any write. The contribution actions write the Component and the row in one transaction, and so do the Modify and Activate Interactive Form paths for a full form's Component and override; Create and Revert Interactive Form do not. Modify and Activate Interactive Form set the prior version aside after that transaction, and Activate returns `PERSIST_FAILED`, with the new form already Active, when it cannot. Activating a target that is already Active also sets aside the caller's other Active personal forms for that entity. `Modify Form Contribution` accepts an optional `Precedence`. `Get Form Composition For Entity` answers for the form the user sees as far as metadata can tell (hidden panels, restricted entities, the same collapse; no compiled panels, and no rows while the kill switch is off) and returns `QUERY_FAILED` when a query fails. The artifact viewer previews a form-panel spec and offers **Add to my form**, which opens a placement dialog: the entity's real form, read-only and scaled, with the panel drawn where it will go, the positions the form actually has, order within a position, what it replaces, and draft or active. The dialog starts from the claims the panel proposes that it offers on the open form, and on a full custom form the panel starts as a draft. New `mj-icon-picker` (`@memberjunction/ng-ui-components`) chooses a Font Awesome solid or regular icon by looking at it.

  **Managing a form.** A "Manage this form" drawer lists the form choice and every panel; Escape closes it and focus stays inside it. Any user can hide a panel shared with them and remove their own. Hide and Show change the open form at once: its slot-mounted panels remount, and a stock grid comes back when the panel that took it over is hidden. Publishing a panel or a full custom form to a role or everyone needs the new `Manage Form Defaults` authorization (Developer and Integration; owners count). `MJEntityFormContributionEntityServer` and `MJEntityFormOverrideEntityServer` enforce it on every save, replayed save and delete. Turning a panel on, or publishing it, retires the Active sibling for the same audience and key in the same transaction and sets the panel component's status. The stock UI role can create and update `MJ: Components` (not delete), so any user can create or change their own panel through the actions and turn it on, off or to a draft in the drawer. Without `Manage Form Defaults` the server requires the component to be the caller's own (`IsCallersOwnComponent`): used only by their own personal rows, or used by no row and created by them, as its Internal `Create` record in `MJ: Record Changes` shows. That applies to any update or delete of the component, whatever columns it changes (`MJComponentEntityServer`, `ComponentWriteRefusal`), to a contribution or override row created or re-pointed at it (`FormRowComponentRefusal`), and to reusing its name (`ComponentNameCollisionRefusal`, names compared trimmed and lower-cased, in any namespace, and sent as a Unicode literal on SQL Server); a form can also load a component by name, so a component no row uses still matters. With the grant, a delete or a change to a component's specification, status, name, namespace or type, and pointing a row at it, are refused only when another user's personal row uses the component. The reads run as the caller in one batch, the changed columns come from the stored row, and a failed read refuses the write. Publishing a draft, an off panel or a set-aside form turns it on, and the chooser says so. A set-aside (`Inactive`) shared form is retracted; a set-aside personal form stays in its owner's picker. The placement preview never saves form state.

  **Form context.** The record container publishes its full composition snapshot to `FormCompositionRegistry` (`@memberjunction/ng-base-forms`), where the apply path reads it. Agents get a compact `FormAgentContext` in `AdditionalContext.Form` (entity, record key, form choice, and each section's key, title, variant, hidden flag and holding contribution), published by the record tab while it is the tab on screen. `RecordPrimaryKey` is a `CompositeKey.ToURLSegment()` string, or null for an unsaved record. The `SkipFormContext` mirror in `@askskip/types` must follow this shape.

  **Kill switch.** On a Node host, `MJ_FORMS_METADATA_CONTRIBUTIONS=false` makes the engine on that process load no row. In Explorer, the `MJ: Instance Configurations` key `Forms.MetadataContributions.Enabled` set to `false` turns rows off on every form; the shell applies it after `InstanceConfigEngine.Config()` and before any form opens, it can only turn the source off, and the source stays on when Instance Config fails to load. `Get Form Contributions For Entity` and `Get Form Composition For Entity` list no row when either setting is off and report `MetadataContributionsEnabled`. The write actions still write rows. The seed row reaches a database through `mj sync push`.

  **Section counts and empty sections.** A saved record fetches every related-section count and the tag, attachment and version badges in one `RunViews` call; an all-`count_only` batch runs as one `UNION ALL` statement in `GenericDatabaseProvider`, with each view's security path intact. New `whenEmpty` (`'show'` default | `'hide'` | `'more'`) and `showCount` on `EntityRelationship.Configuration.UI` and on contributions, with entity defaults `UI.Form.RelatedWhenEmpty` and `UI.Form.ShowRelatedCounts`.

  **Fixes.** Eleven compiled panel registrations named their entity without the `MJ: ` prefix: the five overview cards and the realtime panel mounted only through the slot host's loose name match, which the rail did not apply, and the five header panels also used `slot: 'header'`, which is not a `FormPanelSlot`, so they never rendered. All eleven now use `MJ: ` names and the slot host matches names exactly, so the hero headers render above the overview cards on `MJ: Users`, `MJ: Companies`, `MJ: Employees`, `MJ: Conversations` and `MJ: AI Agent Categories`. The overview cards query `MJ: ` entity names (four of them queried unprefixed names and showed empty states), the overview cards and the realtime panel show a load error instead of an empty state when a query fails, and conversation turn pills and counts use the stored `User`/`AI` roles. CodeGen no longer corrupts generated validators that contain escapes, and a table-level validator's metadata guard includes the validator's `Name`.

  **Behaviour changes to know about.** `BaseFormPanel.Validate()` now runs on Save (through `BaseFormComponent.ValidateAsync()`) and may return a Promise. A React panel whose `Validate` throws does not block the save and shows the failure in the panel, as it does an error from `<mj-react-component>`; a field edit from a panel that the record refuses is logged and dropped. After upgrade, editing or deleting an existing `Role` or `Global` full custom form needs `Manage Form Defaults`, and an `mj sync push` of `Global` rows needs a sync user who holds it or is an Owner. The UI role gains Create and Update on `MJ: Components`. Without `Manage Form Defaults`, whatever role grants component rights, a caller can change or delete a component, on any column, only when it is their own (used only by their own personal rows, or used by none and created by them), and two such users cannot give components the same name. With the grant, a delete or a change to one of the five guarded columns (specification, status, name, namespace or type) is refused only when another user's personal row uses the component, and a change to any other column passes. `MJRecordChangeEntityServer` refuses a caller creating a record change whose `Source` is `Internal` and `Type` is `Create` through the API; other record changes, such as version-label snapshots, are unchanged. `mj sync push` runs as the `System` user, which must hold the Developer role and so holds the grant by default; a sync user that is neither an Owner nor a holder of the grant can push changes only to components of its own. Every `mj-form-field` carries `data-field-name` and `data-field-label`. Collapsible-panel move up/down follows the visual order. New user setting `mj.formPanels.hidden.<entity>`; the existing `mj.formVariant.<entity>` is also read by `Get Form Composition For Entity`. `ng-conversations` gains a type-only dependency on `ng-base-forms`. `Get Active Form For Entity` applies the restricted-entity rule, so a Role or Global form on one of those entities is neither active nor listed. A `form-panel` spec must set `entityName`; the artifact viewer no longer falls back to `dataRequirements` for a panel.

  **PostgreSQL.** `UQ_EntityFormContribution_Key` and `UQ_EntityFormContribution_RelatedClaim` include nullable columns (`UserID`, `RoleID`, `RelatedJoinField`). SQL Server treats NULLs as equal in a unique index; PostgreSQL does not, so the converted indexes need `NULLS NOT DISTINCT` (PostgreSQL 15+) or a `COALESCE` expression index to refuse the same duplicates. PostgreSQL also compares the key case-sensitively, so there the case-insensitive retire rule is stricter than the index.

  **Deploy order:** deploy the server code before pushing the metadata. The UI role's grants ship as metadata only: write access to `MJ: Entity Form Contributions` and `MJ: Entity Form Overrides`, and Create and Update on `MJ: Components`. Only the new server subclasses keep that access to the user's own rows and components, so the component guard must be live before the UI role gains Update: apply the release build's consolidated metadata-sync migration together with the server deploy, never before it. A development database that already ran an earlier copy of the migration needs a Flyway repair or a rebuild.

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

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [bea2386]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [ec97ad4]
- Updated dependencies [28df136]
- Updated dependencies [49e0bd8]
  - @memberjunction/aiengine@6.2.0-edge.3
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/ai-vectors-memory@6.2.0-edge.3
  - @memberjunction/actions-base@6.2.0-edge.3
  - @memberjunction/sql-dialect@6.2.0-edge.3
  - @memberjunction/sql-parser@6.2.0-edge.3
  - @memberjunction/query-processor@6.2.0-edge.3
  - @memberjunction/actions@6.2.0-edge.3
  - @memberjunction/queue@6.2.0-edge.3
  - @memberjunction/encryption@6.2.0-edge.3
  - @memberjunction/geo-core@6.2.0-edge.3

## 6.2.0-edge.2

### Minor Changes

- 7e57b48: Support `CloneContext` across the MemberJunction stack (§10.2, §10.3, §15):
  - Add `Clone` to `RecordChange.Source` CHECK constraint and add nullable `ChangeContext` nvarchar(max) column.
  - Declare `IRecordChangeCloneContext` and `IRecordChangeContext` JSONType interfaces with `@lookup` metadata.
  - In `@memberjunction/core`: Add `CloneContext` interface, `RecordChangeSource = 'Clone'`, and `CloneContext` methods on `BaseEntity`; add structured `ChangeContext` serialization on `DatabaseProviderBase.BuildRecordChangePayload`.
  - In database providers (`GenericDatabaseProvider`, `SQLServerDataProvider`, `PostgreSQLDataProvider`): propagate and persist `Source='Clone'` and `ChangeContext` across saves, deletes, and IS-A child/sibling updates. `ChangeContext` is written only when a change carries one, so tracked writes keep working on a PostgreSQL database that doesn't have the column yet.
  - Clone context is set only on the server, by the record-cloning engine. It is deliberately not part of the GraphQL mutation inputs: a client-supplied context would let any caller stamp fabricated clone lineage into Record Changes.
  - In `@memberjunction/server`: an update now applies only the client's field values, not the `OldValues___` / `RestoreContext___` blobs or fields the user may not read.
  - In `@memberjunction/server`: on an entity that doesn't track record changes, an update loaded the client's old values as sent, so date old values (epoch milliseconds on the wire) became Invalid Dates and unchanged date fields read as edited. They are now typed like the field, as the OldValues comparison already did.
  - In `@memberjunction/server`: an update to an `MJ: Record Changes` row always loads the stored row first, so its Comments-only rule compares against the real values rather than client-supplied old values.
- 369e229: Developer can create and update MJ: Row Level Security Filters. Sync push reloads metadata inside its transaction. An IS-A parent's delete returns, a new record does not load a missing child row, the GraphQL provider does not send a second delete, and a parent built by its child stays linked. The chat area accepts ReadOnly. A dialog manages its focus, names itself when it has no title, and leaves Tab inside a modal or an open dropdown or calendar above it. Tab that a dropdown or calendar hands back at the first or last stop wraps inside the dialog, and a dialog that does not trap focus does not let the dialog under it take the page's Tab. A host publishes an in-progress agent turn's live status through AgentRunStatusPublisher, including the completion when a background run fails before it has a run. A reply that finishes before the chat shows it completes without loading the conversation again.

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [2552b1e]
- Updated dependencies [8fd1c46]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [01fafc6]
- Updated dependencies [0adaf76]
- Updated dependencies [ef43cf3]
- Updated dependencies [b44c7cf]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [200e634]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/aiengine@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/actions@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/ai-vectors-memory@6.2.0-edge.2
  - @memberjunction/actions-base@6.2.0-edge.2
  - @memberjunction/encryption@6.2.0-edge.2
  - @memberjunction/queue@6.2.0-edge.2
  - @memberjunction/query-processor@6.2.0-edge.2
  - @memberjunction/geo-core@6.2.0-edge.2
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

- 351ba9f: fix(generic-database-provider): page on MaxRows alone, without requiring StartRow

  `QueryPagingEngine.ShouldPage` required both `MaxRows` and `StartRow`, so a caller asking only to _cap_ a result — rather than to walk pages — fell through to the "execute full query, apply in-memory pagination" fallback. The database returned every row, the whole set crossed the network, and it was trimmed in memory afterwards. A ceiling the database never sees is not a ceiling, and callers could not detect the difference: in that branch `TotalRowCount` is simply the length of the fully-materialized array, so it looks identical to a genuinely paged result. Observed against a live database, a `MaxRows=10` call returned `TotalRowCount: 479` with no `OFFSET`/`FETCH` issued at all.

  The requirement was a scoping decision rather than a rule — the original server-side-paging work framed the feature as pagination and kept the old path "for backward compatibility" for everything else. `RunView` has since settled the same question the other way: `BuildTotalRowCountSQL` treats rows as limited when `usingPagination || maxRowsForQuery > 0`, a fix made because the narrower condition missed every case where `MaxRows` was set without an explicit `StartRow`. This brings `RunQuery` in line with its sibling.

  `MaxRows` alone is now sufficient. An absent `StartRow` means page zero, resolved through the new `QueryPagingEngine.ResolveStartRow` so the sites acting on a true `ShouldPage` cannot read `params.StartRow!` and get `undefined`. A negative `StartRow` is still rejected, and `MaxRows` remains the deciding factor so a `StartRow` alone cannot turn an unbounded query into a truncated one.

  Behavioural consequences for callers that pass `MaxRows` without `StartRow`: they now receive SQL-level paging instead of a full fetch, so far less data moves, but an unordered query's "first N" remains arbitrary (`DefaultPagingOrderBy` is injected when none exists, so the SQL stays valid); those calls populate the paged cache rather than the full-result cache, shifting hit rates; and they now incur `CountSQL`, which re-runs the query's logic to count — paging saves transfer and memory, not database work.

- Updated dependencies [ddcd666]
- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [9b8a84e]
- Updated dependencies [520bd09]
- Updated dependencies [520bd09]
- Updated dependencies [307da67]
- Updated dependencies [a7da50b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
  - @memberjunction/aiengine@6.2.0-edge.1
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/actions-base@6.2.0-edge.1
  - @memberjunction/actions@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/query-processor@6.2.0-edge.1
  - @memberjunction/sql-dialect@6.2.0-edge.1
  - @memberjunction/sql-parser@6.2.0-edge.1
  - @memberjunction/queue@6.2.0-edge.1
  - @memberjunction/encryption@6.2.0-edge.1
  - @memberjunction/geo-core@6.2.0-edge.1
  - @memberjunction/ai-vectors-memory@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- 7be1684: fix: commit and rollback run inside the SQL Server provider's serial SQL queue, and the metadata dataset is read on the pool regardless of the ambient transaction

  `SQLServerDataProvider` drained its instance SQL queue and then committed, leaving a microtask window in which a query enqueued after the drain could still race the handle — `ENOTBEGUN` for a caller that fired without awaiting, and `EINVALIDSTATE` / `ECLOSE` when the framework's own debounced metadata refresh was the concurrent caller. Commit, rollback, and the rollback that abandons a handle after a failed commit are now items in the same strictly serial queue, so ordering is the queue's: everything enqueued before them has finished, everything after runs after. A query bound to a handle the provider owns is rejected with a message naming the cause — instead of reaching mssql as `ENOTBEGUN` on a finished handle — whenever that handle has committed, rolled back, or been doomed by a failed commit by the time the query reaches the front, including a query a caller issues on a handle it kept after the commit completed. A query on an explicit handle a caller passed in is never subject to that check. The provider no longer depends on `uuid`. Closes MJ#4454.

  `ExecuteSQLOptions` and `ExecuteSQLBatchOptions` gain `ignoreAmbientTransaction`, honored by both providers: the statement runs on the pool even while an ambient transaction is open. `GetDatasetByName` and `GetDatasetStatusByName` set it for `MJ_Metadata` only — that dataset is loaded by a timer-driven refresh that is not part of any caller's unit of work — while every other dataset keeps joining the ambient transaction so a caller that writes and then loads inside one transaction still sees its own rows. Closes MJ#4514.

- f48dffc: fix: a failed metadata dataset read no longer replaces loaded metadata with an empty set, and a member-change refresh waits for the ambient transaction

  `GetDatasetByName` treated a thrown data batch as an empty result: every uncached item reported Success with zero rows, the empty rows were written through to the cache, and for `MJ_Metadata` the provider installed a metadata cache with no entities, after which every `EntityByName` in the process failed until restart. A batch failure now fails the affected items and the dataset, carrying the error in `Status`, and caches nothing. `GetAllMetadata` additionally refuses an `Entities` item with no rows, keeping the metadata already loaded. The debounced refresh that runs after a write to a metadata-member entity is timer-driven and could fire while the same provider was committing an ambient transaction, putting the metadata batch on the transaction's connection alongside the COMMIT (tedious `EINVALIDSTATE` / `ECLOSE`, never retried); it now waits for the transaction to end and runs on the pool. Fixes MJ#4486; the residual commit window itself remains MJ#4454.

- 630bb88: Record creates in the SQL log as create-or-update guarded on the primary key (MemberJunction/MJ#4503). The consolidated Metadata_Sync migrations are recordings of `mj sync push`, and a push creates rows with the fixed primary keys from `metadata/**`; replaying an unguarded `spCreate` on a database where a push already created the row failed on the primary key, which is what stopped the CDP upgrade to 6.1.1. SQL Server's logged form of a create is now `IF NOT EXISTS (row with this PK) EXEC spCreate ELSE EXEC spUpdate` with the same named argument list, so a replay converges an existing row to the recorded content (release-owned metadata is overwritten, not skipped). Entities without a generated update proc get the guard with no ELSE branch. Executed SQL is unchanged.

  Two things to know. Convergence has one narrow exception: a NOT NULL column with a non-NULL default whose value is left unset on the recording (uniqueidentifier defaults such as `AIAgent.OwnerUserID`) keeps its existing value on the update branch instead of taking the default. And because the logged text of a create now contains both proc names, a SQL-logging filter pattern such as `*spUpdateX*` also matches that entity's creates; in-repo configs already pair the create and update patterns. The record-change-free form is now offered to the logger for every save, not only for entities that track record changes, so the guard reaches every recording; the logger tags a statement "(core SP call only)" only when the logged text differs from what ran.

- ee1f0d9: Add a provider post-commit queue: `DatabaseProviderBase.RunAfterCommit(task, description, token?)` plus `CapturePostCommitToken()`, which returns a `PostCommitToken` naming the transaction frames open at that moment. Inside a transaction a task waits for the outermost commit and is discarded on rollback, failed commit, abandoned (doomed) transaction, or `ResetTransactionState`; a savepoint rollback discards only the tasks registered inside that savepoint. Work dispatched fire-and-forget by a save registers after the transaction may already have settled, so the entity-action and AI-action dispatchers capture a token before their first `await` and pass it along: the task then follows the transaction that caused it rather than whatever is open when it registers. SQL Server's deferred Entity AI Action queueing uses this, and Durable After\* entity actions with no queue submitter (e.g. `mj sync push`) are handed to it instead of polling `TransactionDepth` on every tick — so they no longer busy-spin during a long transaction, and never fire for rows a rollback removed. A savepoint that rolled back keeps that fate after the outer transaction commits, so work caused inside it is still dropped. A token captured with no transaction open says so, and its task runs rather than being attached to an unrelated transaction that opened in the meantime. A task whose own transaction has committed waits for any unrelated transaction on that provider to end, so its writes are never enlisted in — or rolled back with — a transaction it has nothing to do with.
- 3d633ed: Introduce `TagSearchProvider`, fix search engine zombie leaks, exclude administrative entities from user search, and promote entity-sourced content items.
  - **Tag Search Provider**:
    - Adds `TagSearchProvider` registered under driver class `TagSearchProvider` (SourceType: `tag`, Priority: 3), which matches queries against the taxonomy graph (tags and synonyms) using `TagEngineBase` and retrieves the associated records from `MJ: Tagged Items` and `MJ: Content Item Tags`.
    - Weights retrieved records by multiplying the tag match confidence (0.0 to 1.0) by the tagged item's continuous relevance weight (`TaggedItem.Weight`), surfacing records tagged with a query concept even when the query term does not appear literally in the entity record's text fields.
    - Deduplicates multi-tag matches on the same record (highest score wins) and blends tag candidates with other search sources (vector, full-text, entity LIKE) via Reciprocal Rank Fusion (RRF).
  - **Search Engine Safeguards & 15% Zombie Leak Fix**:
    - In `GenericDatabaseProvider.createViewUserSearchSQL`, returns `'(1=0)'` when a search string is provided but no searchable fields exist (or all are non-text/restricted), preventing unconstrained `SELECT TOP N` queries with no `WHERE` clause.
    - In `EntitySearchProvider.convertResults`, drops records where `matchedFields === 0`, eliminating the 15% base floor score leak on non-matching rows.
    - In `metadata/entities/.entity-search-exclusions.json`, sets `AllowUserSearchAPI = 0` and `AutoUpdateAllowUserSearchAPI = 0` for taxonomy entities (`MJ: Tags`, `MJ: Tagged Items`, `MJ: Tag Synonyms`, `MJ: Tag Scopes`, `MJ: Tag Co Occurrences`), `MJ: Content Items`, and 13 internal/zombie entities (`MJ: Magic Link Invites`, `MJ: Magic Link Invite Allowed Domains`, `MJ: Magic Link Invite Allowed Paths`, `MJ: Magic Link Invite Applications`, `MJ: Magic Link Invite Roles`, `MJ: Magic Link Redemptions`, `MJ: Materialized Results`, `MJ: Materialized Result Queries`, `MJ: RSU Pending Works`, `MJ: AI Skill Search Scopes`, `MJ: Cluster Analysis Clusters`, `MJ: Employees`).
  - **Option B Entity-Sourced Content Item Promotion**:
    - In `SearchEnricher.ExcludeEntitySourcedContentItems`, when vector search surfaces a content item originating from an entity record (via `EntityRecordDocumentID` or `RawMetadata`), promotes the item to the underlying entity (`EntityName`, `RecordID`), preserving score, snippet, and icon while resolving entity record names.
    - Preserves genuine external unstructured content items (PDFs, URLs, markdown documents) as `MJ: Content Items`.
    - In `SearchEngine`, deduplicates results after content promotion so promoted entity records merge cleanly with direct entity matches.

- 2c590b0: `RunView`'s `UserSearchString` is a no-op again on an entity that declares no searchable field, and `EntityInfo` gains a cached `HasSearchFields`.

  `9cf55b750e` made an empty per-field predicate emit `(1=0)`, so a search term against **any** entity with no `IncludeInUserSearchAPI` field returned zero rows instead of being ignored. That blanks a generic grid whose search box sits over an entity nobody configured search fields for, and it broke the pinned integration check `runview-matrix.RVM9`.

  The `(1=0)` fallback is now gated on the entity actually declaring searchable fields, which preserves what that change was for — a term whose candidate fields all dropped out (denied by field-level security, or not sensible text-search targets) still returns zero rows rather than the whole table. An entity with no search surface at all goes back to ignoring the term.

  `EntityInfo.HasSearchFields` answers "does this entity have a search surface at all", computed once per `EntityInfo` and cached like `HasInactiveFields`, so a hot search path never rescans the field list. It is reset wherever `_Fields` is (re)assigned.

  That reset block also now clears `_hasInactiveFields`. `HasInactiveFields` was added three days after the block and never listed in it, so it served stale results after a `_Fields` reassignment — the exact staleness the block exists to prevent.

  Fixes #4581.

- Updated dependencies [abf8778]
- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [37891d3]
- Updated dependencies [6ad6434]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [7658d68]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [2c590b0]
  - @memberjunction/actions-base@6.2.0-edge.0
  - @memberjunction/aiengine@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/actions@6.2.0-edge.0
  - @memberjunction/sql-parser@6.2.0-edge.0
  - @memberjunction/encryption@6.2.0-edge.0
  - @memberjunction/queue@6.2.0-edge.0
  - @memberjunction/query-processor@6.2.0-edge.0
  - @memberjunction/geo-core@6.2.0-edge.0
  - @memberjunction/ai-vectors-memory@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0
  - @memberjunction/sql-dialect@6.2.0-edge.0

## 6.1.0

### Minor Changes

- 394d276: Add **entity companions** and **composite graph saves** to `BaseEntity`, and replace the two transaction mechanisms that were blind to each other with one provider-arbitrated primitive.

  ### Composites

  A parent and its related records can now load, validate and persist as one unit, from one call, on both tiers. Declare a collection on a shared (client + server) entity subclass:

  ```typescript
  public readonly Lines = this.DeclareRelatedRecords<OrderLineEntity>({
      Name: 'Lines',
      RelatedEntity: 'MJ_BizApps_Orders: Order Lines',
      RelatedEntityJoinField: 'OrderHeaderID',
      OrderBy: 'LineNumber ASC',
      Load: 'explicit',                            // 'explicit' | 'immediate' | 'lazy' | 'never'
      OnRemove: 'delete',                          // 'delete' | 'orphan' | 'refuse'
      Sequence: { Field: 'LineNumber', From: 1 },
  });
  ```

  On the server the graph executes locally inside one transaction; from the browser the whole unit of work is routed to the server via the new `MJ.SaveEntityGraph` remote operation, which rebuilds the records as their server-side subclasses and runs the _same_ executor. One cascade implementation, two placements — and **zero changes to any generated GraphQL type**. Every node is persisted through its own `Save()`/`Delete()`, so Record Changes, entity actions, validation, `PreSave` hooks, per-record events and cache invalidation all fire normally; the root additionally raises `graph_save_started` / `graph_save`.

  The option shape mirrors `EntityRelationship` metadata (`RelatedEntity`, `RelatedEntityJoinField`) so the same declaration can be code-generated later — see the schema change below.

  New public API: `EntityCompanion`, `RelatedRecordCollection<T>`, `EntitySavePlan`, `EntityTransactionScope`, `RunInEntityTransaction()`, `SaveEntityGraphOperation`, `LoadRelatedRecordsBatched()`, and on `BaseEntity` — `DeclareRelatedRecords()`, `RegisterCompanion()`, `GetCompanion()`, `Companions`, `HasCompanions`, `SerializeCompanions()`, `DeserializeCompanions()`. `RunViewParams` gains `IncludeRelatedRecords` for batched loading (1+K queries instead of N+1).

  ### Schema

  Adds nullable `EntityRelationship.RelatedRecordCollection` (JSONType `IRelatedRecordCollectionConfig`) — the policy half of a `DeclareRelatedRecords(...)` declaration, so CodeGen can eventually emit these instead of every application hand-writing them. `RelatedEntity` / `RelatedEntityJoinField` are read from the row's existing columns and deliberately not duplicated in the JSON. NULL — every existing row — means "not a declared collection", i.e. exactly current behaviour. CodeGen emission is a follow-up; nothing reads the column yet.

  ### Transaction unification

  `DatabaseProviderBase` gains `BeginEntityTransaction()` / `SupportsEntityTransactions`, delegating to the existing depth-counted `BeginTransaction()` — so it starts a physical transaction _or joins one already in flight_ as a savepoint. Participants never ask who else is in a transaction. IS-A chains now use it.

  This fixes a torn-write defect: `BeginISATransaction()` opened a brand-new physical transaction on the pool with **no depth awareness**, while `BeginTransaction()` (used by every hand-written application cascade) is depth-counted. An IS-A entity saved inside an application transaction therefore wrote into two independent transactions; rolling one back left the other committed, with no error raised.

  ### 🚨 BREAKING

  Removed outright rather than deprecated, since 6.x LTS has not shipped:
  - `IMetadataProvider.BeginISATransaction` / `CommitISATransaction` / `RollbackISATransaction`, and their `SQLServerDataProvider` implementations. **Migration:** use `BeginEntityTransaction()`, or `RunInEntityTransaction(provider, work)` which handles commit/rollback for you.
  - `BaseEntity.ProviderTransaction` and `BaseEntity.PropagateTransactionToParents()`. Nothing set them after the unification, and the provider reads that consumed them were already dead: every `ExecuteSQL` call without an explicit `connectionSource` picks up the provider's ambient transaction, which is what the unified scope opens. **Migration:** none needed for code that goes through `Save()`/`Delete()`; code that hand-routed a record onto a specific transaction handle should open a scope instead.

  ### Behaviour changes for adopters

  No effect on entities without companions:
  - `Dirty` now rolls up companions. A clean parent with new children previously reported `Dirty === false`, took the not-dirty early return, and silently persisted nothing while reporting success.
  - Companion validation runs regardless of `DefaultSkipAsyncValidation`. That flag governs an entity's own async rules; applying it to cross-child invariants silently disabled them — which is how `OrderEntityServer.ValidateAsync` became dead code on every save.

  Additive and opt-in otherwise — single-record saves take the identical code path they did before.

  See `guides/TRANSACTIONS_AND_BATCHING_GUIDE.md` for when to use provider transactions vs Transaction Groups vs entity graphs.

- 59def38: The entity-action substrate finishes what its schema has been promising. Seven pieces, all of which
  share a failure shape: a column, a flag or a field that read as configured and did nothing.

  **Action Filters now actually prevent execution.** `RunAction`'s filter-refusal branch built its
  result, logged it, and then fell through to run the action anyway — there was no `return`. Every
  Action Filter has therefore recorded that it prevented something while preventing nothing, since the
  mechanism shipped. The refusal row is why it went unnoticed: the observable said "prevented" and the
  side effect happened regardless, so #3606's claim that filters fail closed described evaluation,
  which landed, rather than enforcement, which did not. **Anyone relying on an Action Filter to gate an
  action has been getting the action anyway; after this it stops, which is the configured behaviour but
  a visible change.** A prevented run still writes a log row, deliberately — an operator should be able
  to see that a filter refused rather than wonder why nothing happened — so its `Message` is now an
  exported constant, since that is the only thing distinguishing a prevented run from an executed one.

  **Transition filters.** An entity action could see a record's current state and nothing else, so
  "when Status _becomes_ Approved" was indistinguishable from "when Status _is_ Approved" — which is
  true on every subsequent save too. `EntityChangeContext` now carries both sides of the save to where
  filters run, built from `EntityField.OldValue`, which `BaseEntity` has tracked all along and simply
  never carried anywhere. Filter code gets `DidFieldChange`, `DidFieldChangeToValue`, `OldValues` and
  `NewValues` on `ActionFilterContext`. A create reports no changes, because a record whose Status
  started at Approved did not _become_ anything. Comparison is loose across the string boundary
  metadata forces, so a configured `'1'` matches a numeric `1` rather than silently never matching.

  The capture happens as the first statement of `HandleEntityActions`, deliberately before its first
  `await`: After-hooks are fire-and-forget, and the moment that method yields, the save completes and
  reloads the entity, resetting every `OldValue`. Reading `IsCreate` from that same synchronous
  snapshot also closes a latent bug — `entity.IsSaved` was previously read _after_ an await, so a
  create whose save finalized in that window dispatched as `AfterUpdate`.

  **Two filter-substrate fixes fall out of using it for real.** `EntityActionFilter.Status` was never
  consulted, so a `Disabled` binding still gated — and filters fail closed, so that was not an inert
  row but a permanent block whose only symptom is a trigger that quietly stopped firing. And a binding
  pointing at an unresolvable filter used to reach the evaluator as `undefined` and throw there:
  fail-closed by accident, with no usable reason logged. It now returns a failed result naming the
  filter.

  **Workflow triggers accept a filter.** `ValidateWorkflowSpec` refused `WorkflowEntityEventTrigger.filter`
  outright because the contract to honor it did not exist. It now reconciles onto an owned
  `ActionFilter` bound through `EntityActionFilter` — the additive path — and validates that the
  expression parses, because filters fail closed and a syntax error is not a loud failure, it is a
  trigger that silently never fires.

  **Record Process on-change triggers.** `OnChangeEnabled` has described itself as running "per-record
  on save via an owned Entity Action" since the column shipped, and `OnChangeFilter` promised to
  "compile into the owned Entity Action Filter". Neither owned anything. Saving a Record Process now
  reconciles that binding, matching ownership on the `RecordProcessID` param — `Run Record Process` is
  one shared action, so matching on entity + action alone would let a second process silently repoint
  the first one's trigger. `OnChangeFilter` compiles through the same builder workflow triggers use, so
  one expression vocabulary covers both surfaces.

  **Durable `After*` dispatch (D14).** After-hooks are fire-and-forget, so a process dying mid-flight
  loses the action with nothing to retry it. `EntityAction.RunMode = 'Durable'` routes the dispatch to
  the task-graph substrate as a single-node durable graph — the claim protocol, restart recovery and
  orphan reclaim that already exist there — rather than adding a third async substrate. Opt-in per
  binding, because it costs a Task row, a dispatcher hop, and params persisted at rest. When no
  submitter is registered or submission fails, the work runs **inline**: `Durable` asks for the work to
  be harder to lose, so dropping it would make opting in less reliable than leaving it off. New
  `Task.ActionID` widens the assignment exclusivity to three ways, and `TaskGraphSpecNode.actionName`
  joins `agentName`/`assignToUser`.

  Durability replaces _execution_, not _dispatch_: `RunActionParams.DeferExecution` is called by
  `RunAction` in place of running the action, after validation and filters have passed, so a durable
  binding is gated by exactly what an inline one is gated by. Submitting at dispatch time instead —
  which is where this first landed — would have fired a scoped durable trigger for every record of the
  entity and a filtered one on every save.

  **Execution-log retention.** `Action.RetentionPeriod` and `ActionExecutionLog.RetentionPeriod` shipped
  with descriptions and no reader anywhere in the codebase; the log grew forever while the schema
  claimed otherwise. Retention is now stamped onto each row when the run starts — decided at write
  time, so editing an action's retention is a going-forward change rather than a retroactive deletion —
  and a new opt-in `Action Log Retention` scheduled job purges expired rows oldest-first, bounded per
  run, reporting when it stopped at its ceiling rather than because it was finished.

  **The `Validate` invocation hole.** `EntityActionInvocationValidate` overrode single-record invocation
  with a near-copy that had drifted into a strict subset: no scope resolution (so a binding narrowed to
  one record ran `Validate` against every record of the entity) and no provenance (so a whole-record
  parameter was logged raw, ignoring the binding's `LogValue` rows). The override is deleted; the class
  inherits, which is what keeps both facts true for `Validate` permanently rather than until the copies
  drift again.

  **The `RunEntityAction` null contract.** `null` means the action did not run — the binding is scoped
  and this record falls outside it. `HandleEntityActions` guarded for it; the GraphQL resolver did not,
  so an out-of-scope binding surfaced to clients as a server error. The signature now says so and the
  resolver reports it as the ordinary outcome it is.

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

- c996a56: Field-Level Security: NOT NULL columns can now be restricted.

  **BREAKING (GraphQL schema).** Generated object types lose non-nullability on roughly **2,150 of
  4,650 restrictable fields, across all 384 generated object types** — `String!` becomes `String`, and
  likewise for the other scalars. Any external consumer holding GraphQL types generated against the
  previous schema will fail to compile against this one until those types are regenerated; a consumer
  that reads the fields without regenerating sees no runtime change. Input types are **not** affected,
  so no write contract changes. Non-nullability is retained only where field security is structurally
  incapable of stripping a value: primary keys and `__mj_` system columns.

  The guide previously said not to restrict a NOT NULL column, because the generated GraphQL object
  types marked those fields non-nullable and an FLS-omitted value then failed response serialization.
  That constraint is gone, and with it the largest gap in what the feature could actually protect —
  roughly 2,150 of 4,650 restrictable fields were off-limits, including the ~400 foreign-key display
  columns that inherit non-nullability from the key they display ("hide which client this contract
  belongs to" is a common ask, and it did not work).

  The underlying error was one wrong inference. A column's NOT NULL constraint and a GraphQL `!` say
  different things — "no ROW stores an empty value here" versus "every RESPONSE, to every caller,
  carries a value here" — and the second does not follow from the first. They coincided only while
  every caller saw every column of every row they could read, which is exactly what field security
  ends. Generated output types are now non-nullable only where FLS is structurally incapable of
  stripping a field: primary keys and `__mj_` system columns. **Input types are unchanged** — they
  carry the write contract, which the database constraint does still govern.

  Symptoms this removes, all of which required a denied NOT NULL column: single-record loads nulling
  the entire record, typed list queries nulling the entire query, and — the worst — a mutation whose
  write landed in the database while its response failed to serialize, so the client reported a
  failed save for an edit that had actually succeeded.

  **`ReadableFields___`** is added to every generated object type. Deleting a denied key server-side
  is not sufficient on its own: GraphQL emits every field the client _selected_, so a denied field
  that was asked for arrives as an explicit `null` indistinguishable from a genuine one. The client
  cannot settle that from its own metadata — that copy is stale in the window after a permission
  change, and may be filtered away entirely once metadata tiering lands. The server now states it
  in-band for the request that actually ran. It lists **readable** fields rather than denied ones
  deliberately: naming denied fields would hand back precisely what metadata filtering exists to
  withhold.

  Also in this release:
  - **Read-only fields no longer receive write permissions.** A joined display column or computed
    field cannot be written through the API by anyone, so Update and Create verbs on one decide
    nothing. Reconciliation was authoring `Allow` on both across ~1,000 such fields per qualifying
    role — rows that read as granted permissions and were inert. They are now `No Access`, the
    save-time guard refuses a rule that sets them, and the system-user access guard no longer reads
    their absence as lost access. Read is untouched.
  - **Two paths that returned a record's NAME without checking field security are closed.** The
    `GetEntityRecordName` query took no user context at all, so a caller denied read on an entity's
    name field could still obtain it — and the foreign-key control in forms falls through to that
    query _precisely when_ the joined display column is denied, so the fallback that exists to handle
    a denial was the thing that defeated it. Separately, `BaseEntity.GetRecordName()` read through
    `Get()`, which throws for a denied field, and it runs automatically after every load and save —
    so denying an entity's name field made every record on it fail to open. Both now degrade to the
    primary key.
  - **A write refusal on a field you can read now names the missing permission** rather than using
    the ambiguous "does not exist on entity … or you do not have access to it". That wording exists
    to stop a caller probing which columns a deployment treats as sensitive, which is a question
    about fields they cannot _read_; when they can see the field and its value, it only tells them a
    field they are looking at might not exist. Read denials keep the ambiguous wording.
  - **The view-configuration panel no longer offers denied fields as columns.**

- 7300953: Query & Entity Materialization — snapshot a stored Query's result (or an entity's base view) into a physical table that IS its own read-only entity, refreshed on a schedule with an atomic wrapper-view swap. Base-view (entity) materialization is cross-engine (SQL Server + PostgreSQL); query materialization runs on SQL Server today and becomes cross-engine once the pre-existing `spCreateVirtualEntity` support proc is ported to PostgreSQL (tracked with the broader PG parity effort). The refresh SQL and read path are cross-engine on both.
  - **New `@memberjunction/materialization`** package: the refresh engine (`MaterializationRefresher`) — full-rebuild (shadow table + atomic view swap), `DirtyGroupRecompute` and MERGE-upsert `Incremental` strategies for keyed aggregations, combined-key `SHA2_256` surrogate hashing, and the advisory `MaterializationFreshness` mixed-freshness inspector.
  - **CodeGen** (`codegen-lib`): materializes flagged stored Queries + entity base views (cross-engine DDL, wrapper view, read-only Virtual Entity minting, migration-reuse detection); parameterization (row-filter → materialize-broad + read-time predicate); aggregation-key auto-detection; RLS-downgrade gate; and `DriftHold` flag-and-hold drift detection.
  - **Read path**: `RunViewParams.DataSource: 'Live' | 'Materialized'` (`core`) routed by `GenericDatabaseProvider.GetEffectiveBaseView`, plumbed through the GraphQL layer (`server`, `graphql-dataprovider`).
  - **Scheduling** (`scheduling-engine`): `MaterializationRefreshScheduledJobDriver` sweeps due materializations (skips `Disabled`/`DriftHold`).
  - **`core-entities` / `ng-core-entity-forms`**: generated `MJ: Materialized Results` + `MJ: Materialized Result Queries` (join) entities + `Query.IsMaterialized` + forms. The MR↔Query link lives in the `MaterializedResultQuery` join table — there is no `MaterializedResult.SourceQueryID` / `Query.MaterializedResultID` FK — avoiding the circular dependency of the direct-FK design.

  See `plans/query-entity-materialization.md` for the full design.

- 7300953: Query Materialization — Phase 2: parameterized RowFilterBroad read-time injection. A caller can now run a materialized parameterized stored Query with `RunQueryParams.DataSource: 'Materialized'` and the provider serves it from the broad materialized table with the query's row-filter parameters injected as **bound** read-time predicates, falling back to the live query on any uncertainty (serving live is always correct).
  - **`codegen-lib`**: the render-and-diff verifier now captures each row-filter predicate's operator + value shape (normalized to `column <op> value`, flipping `value < column`); `qualifyParameterizedQuery` builds a structured `ReadFilterSpec` and gates it to a safe operator whitelist (`=, !=, <>, <, >, <=, >=, IN, NOT IN` — `LIKE`/`IS`/`BETWEEN` stay live-only); `manage-metadata` persists the spec and enables Bucket-1 materialization. New migration adds `MaterializedResult.ReadFilterSpec` (+ the CodeGen-regenerated view/procs/EntityField).
  - **`core`**: `RunQueryParams.DataSource: 'Live' | 'Materialized'` (mirrors `RunViewParams`).
  - **`generic-database-provider`**: `InternalRunQuery` redirects a `DataSource:'Materialized'` read to `SELECT … FROM <materialized view> WHERE <spec predicates>` with values **bound** (never interpolated), and falls back to live on any doubt — not opted in, not fresh/Active, a parameter absent from the spec, an unsafe operator, or an execution error.
  - **`server` / `graphql-dataprovider`**: `DataSource` threaded through the RunQuery GraphQL surface (singular, batch, cache-check, and SystemUser paths).

  Proven by a differential reconstruction proof (13/13, real SQL Server) and a full provider-level `RunQuery` E2E (16/16). See `plans/query-entity-materialization-phase2.md`. Stacks on the Phase 1 materialization PR (merges after it).

- 394d276: Phase 7 of the unified workflow DAG engine program (plan: PR #3456) — Track D, the trigger layer. Everything here closes a gap where something _claimed_ to work and did not.

  **Entity-change triggers only bind where an agent can safely run.** A `WorkflowSpec` trigger passed its `invocationType` straight through, and `Validate` / `BeforeCreate` / `BeforeUpdate` / `BeforeDelete` are real invocation names — so a workflow could bind an unbounded agent run _inside_ a user's save, in the held transaction, with the power to abort it. Validation now refuses anything but the `After*` forms, and the shorthand an author writes (`Update`) resolves to `AfterUpdate` rather than drifting from the name the platform actually fires. That drift was live: the contract documented `Create | Update | Delete`, none of which the platform matches, so the first trigger ever saved through it failed to resolve.

  **Trigger scope stopped being decorative.** `scopeEntityName` / `scopeRecordID` were declared, documented, accepted by validation — and then referenced nowhere in reconciliation. A workflow the author scoped to one record fired on _every_ record of the entity while the UI showed it as scoped. They now reconcile onto the binding's own `ScopeEntityID` / `ScopeRecordID`, which the engine's scope resolver already honored. `filter` is **refused** rather than accepted-and-ignored: narrowing by predicate needs the before/after values of a change, a contract that does not exist yet, and a workflow runs an agent — over-firing costs real money. Accepting it later is additive; the reverse would break specs already published against it.

  **An entity may bind the same action more than once (`UQ_EntityAction_ActionID_EntityID` dropped).** The v5.37.x junction sweep added that constraint under a stated scope of _"pure junction tables — two foreign-key columns plus ID/Sequence/timestamps, with no other meaningful data columns."_ `EntityAction` never met it: even then it carried `Status`, `Sequence` and `LoggingMode` and owned three child collections. Three months later #3408 added `ScopeEntityID`/`ScopeRecordID` so a binding could attach to "this Deal Type" — a feature the constraint makes unusable, since one binding per (entity, action) means one scope, so "every Deal" and "this Deal Type" cannot coexist. It also forced a single param set, filter set and scope to be shared across _every_ event an action responds to, making "on create run agent X, on update run agent Y" unexpressible. `V202608080100__v6.1.x__Drop_EntityAction_Uniqueness` removes it with no replacement; a narrower index would still refuse two unscoped bindings differing only by invocation type. Nothing in the runtime assumed uniqueness — every accessor already returns a collection and `HandleEntityActions` already iterates — so this is schema-only. Each workflow now owns its own binding, matched on the agent it dispatches to plus its scope; reusing a shared row would have rewritten `AgentID` and silently repointed one workflow's trigger at another's agent.

  **A self-trigger guard, because enrich-and-write-back is the normal shape.** "When a ticket changes, summarize it and store the summary" saves the ticket, which re-fires the action, forever. `EntityActionDispatchGuard` keys every automatic dispatch by `(entity action, entity, record)` and tracks origin through the async call tree with `AsyncLocalStorage`, so re-entry is detected however deep inside an agent run the write-back happens — no call site threads anything. Re-entry is **suppressed**, not deferred: queuing it would turn an infinite loop into an infinite sequence. A merely _overlapping_ save is a different problem with the same key, so it **coalesces** — latest wins, one pending rerun, and a burst of ten saves collapses to two runs instead of ten. Only after-hooks are guarded; `Validate` and `Before*` participate in the save and must neither be skipped nor deferred. Work that has detached from the async context (a durable task graph, a queued job) declares its origin explicitly through the new `EntitySaveOptions.OriginatingEntityActionIDs`.

  **Scheduled-job notifications actually send.** `NotificationManager` logged `"Would send notification to user …"` while `NotificationEngine` sat one package away. It now delivers for real, and composes the two people who have a say: the job's `NotifyViaEmail` / `NotifyViaInApp` toggles are a **ceiling**, the recipient's preferences decide within it. Neither existing knob expressed that — `forceDeliveryChannels` would let a job override a recipient's opt-out, and omitting the toggles would let a type default fire a channel the job never asked for. `SendNotificationParams.allowedDeliveryChannels` is the new primitive; it can only subtract, which is what makes it safe to expose.

  **"Execute Scheduled Job Now" runs the job.** It used to insert a `Status='Running'` run row and report success. Nothing consumed those rows — the poller selects jobs by _schedule_, never by pending run record — so the action left a row that said Running forever and ran nothing. It now executes through `SchedulingEngine`, and a failed job is a failed action rather than a successful insert. `Wait=false` starts it without blocking.

  **The dispatcher has somewhere to deliver.** `StartTaskGraphDispatcher` constructed it with no continuation deliverer at all, so a finished graph logged its outcome, marked itself delivered, and said nothing to the conversation that asked for it. `TaskGraphContinuationDeliverer` posts the roll-up with per-step detail. `Reinvoke` stays unimplemented on purpose: a safe one needs the new agent run to remember it was a continuation at depth N so `MAX_REINVOKE_DEPTH` can stop the chain, and nothing durable records that — a cap that never trips is worse than degrading to a message.

  **IT71 grows to 16 checks.** TG14 drives the save-to-binding round trip that Phase 6 owed; TG15 pins that a scoped trigger actually narrows; TG16 pins that two workflows on one entity keep separate bindings pointing at their own agents, and that re-saving finds its own row rather than adding a third. TG14 caught a second real bug on its first run — the invocation-type mismatch above — and TG16 is what surfaced the unique constraint.

### Patch Changes

- 489aecd: Make SQL Server save-call SQL variable suffixes a deterministic PK hash instead of a random uuid slice, so MetadataSync recaptures of an unchanged tree are byte-identical (loom #12 WP3). The suffix is the first 12 hex of sha1(`schema.table|pk`) with key values normalized (UUIDs lower-cased, Dates as ISO-8601), plus `_n` when the same hash repeats inside one TransactionGroup. The allocator lives on GenericDatabaseProvider (shared GenerateSaveSQL orchestrator); SQLServerDataProvider.RenderSaveCallBinding consumes it. `SQLServerTransactionGroup.scopeItemVariables` now scopes every name in a comma-separated DECLARE list (previously only the first), so batched submits no longer rely on per-item suffixes to keep locals distinct.
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

- 8d880cc: Split geo **read** (`SupportsGeoCoding`, maps, distance, virtual PrimaryAddress / `__mj_Latitude_{FK}`) from geo **write** (GeoCodeSyncService only when 1+ writable Geo\* fields exist; skip provider when native lat/lng already set). mj-sync `push.skipGeoCoding` per entity. Parallel push default 10 uses `CreateIndependentInstance()` (shared pool, own TX) instead of defaulting to 1. Durable AfterCreate without a queue submitter defers until transaction depth is 0 (fire-and-forget), not nested in the save.
- 841e6ea: Harden several SQL text-building paths that substituted values into query strings without parameterization or escaping.

  **`@memberjunction/server`** — `ReportResolver.CreateReportFromConversationDetailID` built its `WHERE` clause via direct string interpolation of the `ConversationDetailID` argument. It now binds the value through `mssql`'s parameterized `request.input(...)` as a `UniqueIdentifier`, consistent with the parameterization pattern already used elsewhere in the package, and gets GUID-format validation as a side effect.

  **`@memberjunction/generic-database-provider`** — `GenericDatabaseProvider.CheckRecordRLS` built its primary-key `WHERE` clause without escaping embedded quotes in the key value, unlike the sibling `Load()` path a few lines above, which already escapes. The RLS-check path now mirrors `Load()`'s escaping so a primary key value containing a quote can't alter the query's structure.

  **`@memberjunction/core`** — `RowLevelSecurityFilterInfo.MarkupFilterText` did two things that could weaken a row-level security filter: it let `undefined` user-property values through as the literal string `"undefined"`, and it never escaped quotes in substituted values. Both are fixed — `undefined` now falls through to the existing unresolved-token handling (same as `null` and object-typed values already did), and substituted values now have embedded single quotes doubled.

  Behavior note for deployments with existing role-based RLS filters: equality-style filters (`Col = '{{UserX}}'`) are unaffected. Filters written in negation form (`<>`, `NOT IN`, `NOT LIKE`) against a user property that can be `undefined` previously matched more rows than intended (a permissive gap) and will now correctly match fewer — reviewed as: users may see fewer rows than before the upgrade, which is the deliberate direction of this fix, not a new restriction to work around.

  **`@memberjunction/ng-react`** — `RuntimeUtilities.provider` was initialized directly from the global `Metadata.Provider` at class-field scope. The value was always overwritten before use by `buildUtilities()`'s existing `provider ?? Metadata.Provider` fallback, so this is a no-behavior-change cleanup that stops the class body from touching the global provider directly.

- 8288711: Fix process-wide server cache corruption, and make the cache structurally unable to be
  corrupted by consumers.

  **Take this bump urgently if you run MJAPI.** `ResolverBase` mapped GraphQL transport field
  names onto the data provider's own result rows, which the server cache holds _by reference_.
  Preparing one GraphQL response therefore rewrote `__mj_CreatedAt` to the wire alias
  `_mj__CreatedAt` **inside the live cache**, and every later read served the corrupted shape —
  failing in `BaseEntity.SetMany` with `Field _mj__CreatedAt does not exist on <Entity>`. The
  cache is process-wide, so a single response poisoned every subsequent request across all
  workers. Fixed by mapping onto copies.

  Fixing it at the reader alone left the whole class of bug open — nothing in the type system or
  the API surface said "this array is shared, do not mutate," and the exposure runs in both
  directions (a cache _hit_ returns the stored array; a cache _miss_ stores the array it is about
  to return). So the cache now defends itself:
  - **`ILocalStorageProvider` gains an optional `readonly SharesReferences?: boolean`**, declaring
    whether a provider hands back live references (the in-memory providers) or serialized copies
    (IndexedDB, localStorage, Redis, MMKV). **Fully backward compatible**: existing implementations
    keep compiling, and omitting the property is not an opt-out — `LocalCacheManager` measures any
    provider that does not declare one (store a sentinel, read it back, compare identity), so a
    provider written before this contract still gets the correct protection instead of silently
    losing it to a falsy default.
  - **`LocalCacheManager` deep-freezes row data at write time** — rows, their nested values, and
    the array itself — but only when the provider shares references. Mutations then throw a
    `TypeError` at the offending line instead of silently corrupting shared state, and cache
    **hits cost nothing extra** (the freeze is a one-time per-write cost). Applied at both write
    funnels: `SetRunViewResult` / `SetRunQueryResult` and `storeCachedResults`, the in-place
    slot-maintenance path that bypasses the first. The freeze lands immediately after the only
    gate that can decline a write (the synchronous oversized-entry check) and **before** the
    awaited eviction steps — callers do not always await these methods, so any yield point
    before the freeze is a window in which shared rows are handed out still mutable. Browser
    clients are untouched (IndexedDB / localStorage serialize), but **Node-side clients — the
    CLI, MetadataSync, and anything else on an in-memory provider — do get the freeze**, so
    "client behavior is unchanged" holds only for the browser. The freeze decision also follows
    the provider across `SetStorageProvider`: MJAPI initializes on the in-memory provider during
    engine loading and swaps to Redis afterward, two providers with opposite semantics in one
    process. The deep-freeze skips **binary payloads**
    (`Buffer`/TypedArray/`ArrayBuffer`, e.g. `varbinary` columns — `Object.freeze` throws on
    non-empty views by spec), freezes parent-first so cycles terminate, and a freeze failure of
    any kind degrades to a logged, unfrozen store — it can never fail a `RunView`/`RunQuery`.
  - **Dataset cache slots get their own key namespace.** `GetDatasetByName` keyed its
    write-through cache with the same fingerprint builder ordinary reads use, passing only
    `{ EntityName, ExtraFilter }` — and every shipped dataset item has a NULL `WhereClause`, so a
    dataset item and a plain unfiltered `RunView` of the same entity produced an IDENTICAL key and
    silently shared one slot. That leaked the `MJ_Metadata` scaffolding exemption below to ordinary
    callers of `MJ: Entities` / `MJ: Entity Fields` (the most-read entities in the process, served
    unfrozen), and in the other direction let an ordinary read repopulate an evicted slot FROZEN so
    the next metadata refresh threw. `GenerateRunViewFingerprint` now takes an optional dataset
    segment, appended only when supplied — ordinary reads keep their exact pre-existing key, so no
    existing cache entry is invalidated.
  - **`CacheWriteOptions.ProviderInternalScaffolding`** exempts slots whose only consumer is the
    provider that wrote them — scoped to the **`MJ_Metadata` dataset only** at its single write
    site. Metadata bootstrap needs this: the provider's own assembly (`PostProcessEntityMetadata`,
    plus `GetAllMetadata`'s Applications assembly) hydrates its object graph by mutating those
    rows in place. Every **other** dataset's cached rows are frozen shared state like any RunView
    result, because `GetDatasetByName` serves them to arbitrary consumers (`BaseEngine.Load` hands
    the live arrays to every engine subclass). The flag is persisted and carried forward through
    slot maintenance so a later save cannot re-freeze the slot.

  Pre-existing consumer bugs surfaced by the freeze and fixed:
  - **`BaseEntity.Get()` wrote to its own source row.** The raw-mode fast path keeps the caller's
    row by reference and `Get()` wrote back into it to memoize a converted `Date` or an rtrimmed
    fixed-width string — so on a cache-served row, _reading_ a `datetime` or `CHAR(n)` field threw.
    This broke AI cost calculation on `MJ: AI Model Costs.Currency`. `Get()` now memoizes into a
    per-instance side table and never writes to the row at all. Gating the write on a once-sampled
    `Object.isFrozen` was not sufficient: the freeze is asynchronous relative to the consumer (cache
    writes are not always awaited), so the sample could be stale by the first read and the write
    still threw. Keeping the memo off the row makes freeze timing irrelevant AND restores the
    optimization for frozen rows, which the isFrozen-guard version had given up.
  - **`ResolverBase.MapFieldNamesToCodeNames` renamed fields on its argument.** Callers pass rows
    straight from `findBy`/`RunView` — the cache's own objects — so with the freeze in place
    `UserByEmail`, `UserByID`, `UserByEmployeeID` and every CodeGen-generated single-record resolver
    over a cached entity threw `Cannot add property _mj__CreatedAt, object is not extensible`
    (reproduced live against a running MJAPI). Before the freeze it did something quieter and worse:
    it rewrote the cached row's keys. It now returns a copy, which fixes every call site at once;
    `ArrayMapFieldNamesToCodeNames` likewise returns a new array of new objects.
  - **`GenericDatabaseProvider.serveFromServerCache` and the smart-cache legs** duplicated
    `CachedRunViewResult` as four inline structural types, which had already caused one silent
    field drop; they now share the canonical type.
  - **The singular server RunView path silently dropped a `PostRunView` hook's returned
    replacement result** (`PostRunView` reassigned a local; `RunView` returned the pre-hook
    reference), while the client and batch paths honored it. The freeze un-masked this: with
    in-place row mutation now throwing, no signature-conformant result-modifying hook worked on
    that path at all. `PostRunView` now copies a hook-supplied replacement onto the result object
    it was handed, so the change reaches the caller — its `Promise<void>` signature is unchanged,
    so external subclasses that override it keep compiling. Hook docs (`PostRunViewHook`,
    `BaseServerMiddleware.PostRunView`) now state that rows may be frozen shared cache state:
    modify by mapping onto copies (`results.Results = results.Results.map(r => ({ ...r, ... }))`)
    or return a new result — never mutate rows in place.
  - **Cache-served reads skipped the `PostRunView` hook chain entirely.** `PostRunView` is the
    OUTPUT half of the data-hook enforcement seam (masking / audit) and hooks receive
    `contextUser`, so masking is per-user while a cache slot is shared — there is no correct way
    to apply it once at write time for a reader who has not arrived yet. Three of the four server
    paths already ran the chain (miss, mixed batch, client smart-cache); the singular cache hit and
    the all-cached batch returned early, so masking depended on whether a _sibling_ view in the same
    batch happened to miss. This looked correct before only by accident: the cache write precedes
    the hooks, so an in-place masking hook wrote through into the cached rows — which both made
    later hits appear masked and baked one user's masking decision into a shared slot. Both hit
    paths now run the chain against the per-hit result wrapper, so a hook's replacement reaches the
    caller and can never write back into the cache. The zero-hook path (the default — no shipped
    middleware overrides `PostRunView`) costs ~80ns, down from ~2.4µs: `GetDataHooks` now memoizes
    the resolved global object store, whose `GetGlobalObjectStore()` probe throws and catches a
    `ReferenceError` on every call under Node (~1.4µs), and the hit paths check for registered hooks
    before awaiting the chain.

  The cache result types stay ordinary mutable arrays, documented as shared-and-frozen: the runtime
  freeze is the enforcement, and a `readonly` marker would have broken existing downstream readers
  without adding protection. **This release contains no breaking changes** — every public signature
  it touches is additive or unchanged.

  Consumer-facing contract, documented in `guides/CACHING_AND_PUBSUB_GUIDE.md`: **treat rows from
  `RunView`/`RunViews`/`RunQuery` as read-only** unless you produced them. Copy before mutating —
  `rows.map(r => ({ ...r }))`, `[...rows].sort(...)`. Narrow-`Fields` requests and
  `ResultType: 'entity_object'` results are unaffected (both get per-caller objects).

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

- f544a93: Event-driven metadata refresh from dataset membership, and an authoritative dataset-status oracle.

  **The problem.** A server process never refreshed its own in-memory metadata after a permission-bearing save it itself processed: the only trigger was the periodic `RefreshIfNeeded()` poller, and its staleness check (`GetDatasetStatusByName` Phase 1) derived each MJ_Metadata item's "remote" timestamp from the server's **own cached dataset slots** — a closed loop. A tightened field-security rule was therefore not enforced over the wire until process restart. Clients had no event-driven metadata refresh at all — a browser loaded metadata once per page load.

  **The fix, in three parts:**
  1. **Dataset-membership-driven refresh (`ProviderBase`).** When a provider loads the MJ_Metadata dataset, it records which entities compose it (`registerMetadataDatasetMembership`; persisted beside the metadata snapshot for warm boots). The existing static write-invalidation fan-out now also routes save/delete/remote-invalidate events to `handleMetadataMemberEntityEvent`: a write to any member entity schedules a refresh of the provider that owns that metadata, gated by a fail-open backend-identity check for multi-provider processes. Membership is the dataset definition itself — adding a `DatasetItem` row extends coverage with no code change, and no entity names are hardcoded anywhere. Scheduling and refresh policy are per-tier: **database providers** debounce briefly (500ms, burst-coalescing, so the enclosing transaction commits first) and hard-`Refresh()` — the writer must not trust any cache for the re-read; **`GraphQLDataProvider`** coalesces into a long randomized window (15–45s, since every browser receives every write broadcast and MJ_Metadata's members include routinely-written entities like dashboards and queries — the window caps each browser at one staleness check and at most one metadata pull per window, jittered so sessions never stampede together) and then runs the staleness check, re-pulling the graph only when genuinely stale. Single-flight guards the reload itself: a refresh request arriving mid-reload queues exactly one follow-up instead of racing a concurrent reload whose older snapshot could win the swap.
  2. **The staleness oracle is authoritative.** `GetDatasetStatusByName` no longer derives status from cached dataset slots — status is always the batched SQL MAX/COUNT per item (the cache remains fully in play for the _data_ reads in `GetDatasetByName`), and the status query now composes the stored item `WhereClause` with the runtime filter, matching the data read (previously the SQL path ignored the stored clause).
  3. **Throttle bypass for event-driven checks.** `CheckToSeeIfRefreshNeeded`/`RefreshIfNeeded` accept an optional `bypassMinCheckInterval`; event-driven callers hold positive evidence a member entity was written, and the 30s min-check throttle would otherwise silently drop the second of two permission changes made inside one window.

  Permission changes are now enforced by the server that processed them within ~1–2 seconds (one full metadata reload per debounced burst, in the background — requests keep serving the old graph until the atomic swap) instead of not until process restart. Other server instances converge on their periodic tick, which the oracle fix makes genuinely reliable. Connected browsers converge within the client coalescing window — display freshness only; enforcement is server-side either way.

- 9f73528: Nested transactions live on GenericDatabaseProvider. Depth 1 is a physical BEGIN; depth 2+ is a dialect savepoint. A savepoint error on a published handle (`ENOTBEGUN`/`EABORT`/`25P01`) throws `DoomedTransactionError` instead of opening a second physical TX (torn write). Nested begin with no physical TX is corruption. Physical hooks are abstract; `AbandonPhysicalTransaction` unpublishes on EABORT; `AfterPhysicalCommit` runs after the mutex. `TransactionDepth` moved to `@memberjunction/core` with deprecated camelCase aliases (`transactionDepth`, `savepointStack`, `inTransaction`, `inNestedTransaction`) for one release. `ResetTransactionState()` replaces poking private fields. Upgraders: read `TransactionDepth` (not a duck-typed `transactionDepth` that would be undefined).
- 44fca09: Applying a `MaxRows` cap no longer rewrites the caller's SQL on PostgreSQL.

  `QueryPagingEngine.applyMaxRowsViaAST` injected the row cap by calling `SetOuterCap` and then re-emitting the entire statement with `SQLParser.ToSQL()`. That is an AST round-trip, and `node-sql-parser` normalizes as it generates — keywords come back upper-cased and identifiers re-quoted. Appending one clause should not rewrite the statement around it.

  On SQL Server the normalization is invisible. On PostgreSQL it is a correctness bug, because the provider's identifier auto-quoter runs afterwards over the now-upper-cased statement and quotes any keyword missing from its allowlist:

  ```
  caller wrote:   ORDER BY x ASC nulls last
  ToSQL emitted:  ORDER BY x ASC NULLS LAST
  auto-quoted to: ORDER BY x ASC "NULLS" "LAST"
  PostgreSQL:     syntax error at or near ""NULLS""
  ```

  The round-trip also rewrote `cp."recordKey"` to `"cp"."recordKey"` and `::integer` to `::INTEGER`.

  Found in production alongside the auto-quoter keyword gaps fixed in `@memberjunction/sql-dialect`. The two are independent halves of the same failure: completing the keyword list makes the upper-cased output harmless, while this makes the output stop changing in the first place — which matters for every caller whose SQL has to survive a cap, not only those using a keyword the allowlist happened to miss.

  Where a trailing `LIMIT N` is provably equivalent to the AST injection — a plain `SELECT` with no existing cap, on a dialect that caps with a suffix, and with no `OFFSET` / `FETCH` / `FOR UPDATE`-style clause that must follow `LIMIT` — the cap is now appended as text and the statement is left byte-identical. Every other shape falls through to the existing AST path unchanged, so this narrows the blast radius without altering any result.

  Deliberately **not** switched to the existing `outerWrap` fallback, which is also text-preserving. Wrapping puts the cap above a subquery's `ORDER BY`, where PostgreSQL does not guarantee the inner ordering survives, so a "top 100 by rank" query could return an arbitrary 100. Inline injection is the semantically correct path and stays the default.

  SQL Server is unaffected: `TOP N` is a prefix that has to sit between `SELECT` and the select list, a position no append can reach, so it continues to use the AST path.

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

- e26c866: Fix keyset (`AfterKey`) pagination returning duplicate rows and silently skipping others.

  A keyset walk was ordered inconsistently across its own pages. Page 1 has no cursor yet, so `usingKeyset` is false and the query fell through to the plain row-limited path — which emitted `SELECT TOP N …` with **no `ORDER BY` at all**, letting the engine return an arbitrary N rows. Page 2 onward then forced `ORDER BY <pk>` plus the seek predicate `<pk> > @afterKey`. Because the two orderings disagreed, rows from page 1 were re-returned on page 2, and rows the arbitrary first page happened to include could be skipped by the walk entirely.

  The fix gives every row-limited query the determinism that OFFSET pagination already had: when `MaxRows` (or the entity's `UserViewMaxRows`) limits the result and the caller supplied no `OrderBy`, the query now orders by the primary key. `TOP N` / `LIMIT N` without an `ORDER BY` is undefined by definition, so this is a general correctness fix rather than a keyset-specific patch — and it makes page 1 of a keyset walk agree with every page after it, since both order by the same PK.

  Verified against real data: a four-page keyset walk over a 32-row universe previously duplicated 4 of the 8 rows on page 2; it now returns all 32 rows exactly once, with none missed. This is the defect behind the long-standing `IT25 - View Execution (client-first)` / `view-execution.V10` integration failure.

  **Behavior note**: this changes _which_ N rows an unordered `MaxRows` query returns. That set was previously undefined and could vary between runs, so no correct caller can have depended on it — but callers that were incidentally observing storage order will now see primary-key order. It also introduces a sort for entities whose primary key is not the clustered index.

- cda0187: Threshold-mode SQL logging (Explorer SQL logging sessions, `mj sync watch`) now emits the batch separator before any statement that would redeclare a variable already declared in the current batch. Save-call variable suffixes are deterministic per record since #4257, so an edit followed by a correction of one record produced two identical `DECLARE` lists in one batch, which SQL Server rejects on replay ("The variable name … has already been declared"). Names are compared case-insensitively and the set resets at each separator; the count-based separator and legacy per-statement mode are unchanged.
- f2f1491: Transaction commit and rollback no longer race a queued query, and a failed commit no longer leaks the transaction.

  Every transactional query on a `SQLServerDataProvider` instance is serialized through its SQL queue, but `CommitPhysicalTransaction` and `RollbackPhysicalTransaction` bypassed it. They approximated "queue drained" by polling a private mssql field for up to 2 seconds, then **gave up silently and committed anyway** — which mssql rejects with `Can't commit transaction. There is a request in progress.` A `finally` then nulled the handle before the base class's abandon could roll it back, so the server-side transaction was left open and the caller's own rollback reported `No active transaction to rollback` on top of the real error. Under runner load that was roughly one in five integration runs failing inside `mj sync push`, across unrelated branches.
  - **`drainSQLQueue()`** waits deterministically for every enqueued transactional query to finish — awaiting the most recently enqueued promise and looping until nothing new arrived — and commit/rollback call it first. No timeout, no private field.
  - **`waitForActiveRequest` now throws** on timeout instead of falling through, naming the actual cause: a request that bypassed the queue.
  - **A failed commit keeps the handle** so `AbandonPhysicalTransaction` can roll the doomed transaction back; it is cleared only on success.
  - **`GenericDatabaseProvider`** treats a rollback issued after a failed outermost commit as already done rather than a second failure, since the abandon already rolled the handle back. The flag resets when the next physical transaction begins.

  See #4447 for the failure analysis and #4454 for the follow-up that routes commit through the queue.

- 905820a: Sync-scoped write-side-effect suppression. Record Changes and geocoding are per-write side effects, but the only way to relieve a high-volume writer of them was turning the entity flags off — which also turns them off for every human and API writer of the same entities, permanently. New `EntitySaveOptions.SkipRecordChanges` / `SkipGeoCoding` (and `EntityDeleteOptions.SkipRecordChanges`) scope the suppression to the individual save: providers omit the audit-row wrap and the geocode side trip for saves that carry the options, and only those. The sync engine sets them on its own writes when the connection asks via `Configuration.writeSideEffects === 'suppressed'` — fail-closed: absent or malformed configuration keeps the side effects on, and a save outside a suppressing sync run can never carry them. Materially identical to flags-off for the sync's writes; invisible to every other writer. The delete option is mirrored onto the GraphQL `DeleteOptionsInput` because the schema-sync gate requires every `EntityDeleteOptions` field to appear there, but it is **not honoured over the wire**: every wire entry point sanitizes it back to false and logs the attempt, because suppressing an audit row is a higher privilege than `entity:delete` — the only authorization a delete mutation performs. That keeps delete at exact parity with save, whose options have no GraphQL input type at all.
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

- 88f8898: Fix Explorer view/grid search returning 0 rows — or refusing outright — for ordinary search terms (#4392).

  `UserSearchString` is not a SQL clause: it is the free text a person typed into a search box. It normally never reaches SQL as a fragment — `GenericDatabaseProvider.createViewUserSearchSQL` builds every predicate itself from `IncludeInUserSearchAPI` metadata and lands the text only inside a string literal, with single quotes doubled and LIKE metacharacters escaped under an explicit `ESCAPE`. Two screens intended for genuine SQL fragments were nonetheless applied to it, and each rejected real searches:
  - **`ResolverBase.screenClientViewClauses`** ran it through the GraphQL-boundary base-view AST screen, which wraps its argument as `SELECT 1 FROM x WHERE (<clause>)` and fails closed when that does not parse. `Marcus Chen` parsed as nothing and `O'Leary` as an unterminated literal, so both were refused; only terms that happened to be valid SQL survived — which made essentially every person-name search return 0 rows.
  - **`GenericDatabaseProvider`** ran it through the `ValidateUserProvidedSQLClause` keyword denylist on the view and count paths. Word-boundary-matched against free text, that refused `Union Pacific`, `Update Request` and `drop shipment`, along with any term containing `;`, `--`, `/*` or `xp_` — and the error reached the grid with a null message, so the search box simply looked broken.

  Both screens are removed from this one input. Every genuine clause fragment is screened exactly as before: `ExtraFilter`, `OrderBy` and `OverrideExcludeFilter` keep the boundary AST screen, and they plus the rendered WHERE clause keep the provider denylist.

  **One exception, deliberately retained.** A field carrying `UserSearchParamFormatAPI` splices the term into an admin-authored format that may place `{0}` _outside_ quotes (` = {0}` on a numeric field is a supported configuration). There the term is not confined to a literal, so `createViewUserSearchSQL` re-applies `ValidateUserProvidedSQLClause` — but only when such a field will actually participate in the search, which means a field excluded by field-level security does not trigger it. Entities without such a field are unaffected.

  **Full-text search behavior change.** For `FullTextSearchEnabled` entities, the boolean-operator detection in the full-text branch is now word-boundary based rather than substring based. Previously `OR` matched inside "c**or**porate" and `AND` inside "st**and**ard", so ordinary two-word searches were emitted with `%` joins (`Corporate%Office`) — not valid full-text syntax. They are now joined correctly (`Corporate AND Office`). Multi-word terms only began reaching this branch once the boundary screen stopped refusing them, so without this the fix would not have applied to full-text entities. Deployments relying on the previous `%`-joined output should re-check their full-text searches.

  Covered by regression tests at the GraphQL boundary (`ResolverBase.filterEscaping.test.ts`), in the generated search SQL including the custom-format and field-level-security interactions (`createViewUserSearchSQL.test.ts`), and end-to-end over the real client transport (integration check `runview-matrix.RVM19`).

- Updated dependencies [394d276]
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
- Updated dependencies [f6a4341]
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
- Updated dependencies [59def38]
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
- Updated dependencies [a2c528f]
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
- Updated dependencies [f5ec13b]
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
- Updated dependencies [1100077]
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
- Updated dependencies [d8adda1]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/actions@6.1.0
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/aiengine@6.1.0
  - @memberjunction/sql-parser@6.1.0
  - @memberjunction/actions-base@6.1.0
  - @memberjunction/sql-dialect@6.1.0
  - @memberjunction/geo-core@6.1.0
  - @memberjunction/queue@6.1.0
  - @memberjunction/ai-vectors-memory@6.1.0
  - @memberjunction/encryption@6.1.0
  - @memberjunction/query-processor@6.1.0

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

- c996a56: Field-Level Security: NOT NULL columns can now be restricted.

  **BREAKING (GraphQL schema).** Generated object types lose non-nullability on roughly **2,150 of
  4,650 restrictable fields, across all 384 generated object types** — `String!` becomes `String`, and
  likewise for the other scalars. Any external consumer holding GraphQL types generated against the
  previous schema will fail to compile against this one until those types are regenerated; a consumer
  that reads the fields without regenerating sees no runtime change. Input types are **not** affected,
  so no write contract changes. Non-nullability is retained only where field security is structurally
  incapable of stripping a value: primary keys and `__mj_` system columns.

  The guide previously said not to restrict a NOT NULL column, because the generated GraphQL object
  types marked those fields non-nullable and an FLS-omitted value then failed response serialization.
  That constraint is gone, and with it the largest gap in what the feature could actually protect —
  roughly 2,150 of 4,650 restrictable fields were off-limits, including the ~400 foreign-key display
  columns that inherit non-nullability from the key they display ("hide which client this contract
  belongs to" is a common ask, and it did not work).

  The underlying error was one wrong inference. A column's NOT NULL constraint and a GraphQL `!` say
  different things — "no ROW stores an empty value here" versus "every RESPONSE, to every caller,
  carries a value here" — and the second does not follow from the first. They coincided only while
  every caller saw every column of every row they could read, which is exactly what field security
  ends. Generated output types are now non-nullable only where FLS is structurally incapable of
  stripping a field: primary keys and `__mj_` system columns. **Input types are unchanged** — they
  carry the write contract, which the database constraint does still govern.

  Symptoms this removes, all of which required a denied NOT NULL column: single-record loads nulling
  the entire record, typed list queries nulling the entire query, and — the worst — a mutation whose
  write landed in the database while its response failed to serialize, so the client reported a
  failed save for an edit that had actually succeeded.

  **`ReadableFields___`** is added to every generated object type. Deleting a denied key server-side
  is not sufficient on its own: GraphQL emits every field the client _selected_, so a denied field
  that was asked for arrives as an explicit `null` indistinguishable from a genuine one. The client
  cannot settle that from its own metadata — that copy is stale in the window after a permission
  change, and may be filtered away entirely once metadata tiering lands. The server now states it
  in-band for the request that actually ran. It lists **readable** fields rather than denied ones
  deliberately: naming denied fields would hand back precisely what metadata filtering exists to
  withhold.

  Also in this release:
  - **Read-only fields no longer receive write permissions.** A joined display column or computed
    field cannot be written through the API by anyone, so Update and Create verbs on one decide
    nothing. Reconciliation was authoring `Allow` on both across ~1,000 such fields per qualifying
    role — rows that read as granted permissions and were inert. They are now `No Access`, the
    save-time guard refuses a rule that sets them, and the system-user access guard no longer reads
    their absence as lost access. Read is untouched.
  - **Two paths that returned a record's NAME without checking field security are closed.** The
    `GetEntityRecordName` query took no user context at all, so a caller denied read on an entity's
    name field could still obtain it — and the foreign-key control in forms falls through to that
    query _precisely when_ the joined display column is denied, so the fallback that exists to handle
    a denial was the thing that defeated it. Separately, `BaseEntity.GetRecordName()` read through
    `Get()`, which throws for a denied field, and it runs automatically after every load and save —
    so denying an entity's name field made every record on it fail to open. Both now degrade to the
    primary key.
  - **A write refusal on a field you can read now names the missing permission** rather than using
    the ambiguous "does not exist on entity … or you do not have access to it". That wording exists
    to stop a caller probing which columns a deployment treats as sensitive, which is a question
    about fields they cannot _read_; when they can see the field and its value, it only tells them a
    field they are looking at might not exist. Read denials keep the ambiguous wording.
  - **The view-configuration panel no longer offers denied fields as columns.**

### Patch Changes

- 44fca09: Applying a `MaxRows` cap no longer rewrites the caller's SQL on PostgreSQL.

  `QueryPagingEngine.applyMaxRowsViaAST` injected the row cap by calling `SetOuterCap` and then re-emitting the entire statement with `SQLParser.ToSQL()`. That is an AST round-trip, and `node-sql-parser` normalizes as it generates — keywords come back upper-cased and identifiers re-quoted. Appending one clause should not rewrite the statement around it.

  On SQL Server the normalization is invisible. On PostgreSQL it is a correctness bug, because the provider's identifier auto-quoter runs afterwards over the now-upper-cased statement and quotes any keyword missing from its allowlist:

  ```
  caller wrote:   ORDER BY x ASC nulls last
  ToSQL emitted:  ORDER BY x ASC NULLS LAST
  auto-quoted to: ORDER BY x ASC "NULLS" "LAST"
  PostgreSQL:     syntax error at or near ""NULLS""
  ```

  The round-trip also rewrote `cp."recordKey"` to `"cp"."recordKey"` and `::integer` to `::INTEGER`.

  Found in production alongside the auto-quoter keyword gaps fixed in `@memberjunction/sql-dialect`. The two are independent halves of the same failure: completing the keyword list makes the upper-cased output harmless, while this makes the output stop changing in the first place — which matters for every caller whose SQL has to survive a cap, not only those using a keyword the allowlist happened to miss.

  Where a trailing `LIMIT N` is provably equivalent to the AST injection — a plain `SELECT` with no existing cap, on a dialect that caps with a suffix, and with no `OFFSET` / `FETCH` / `FOR UPDATE`-style clause that must follow `LIMIT` — the cap is now appended as text and the statement is left byte-identical. Every other shape falls through to the existing AST path unchanged, so this narrows the blast radius without altering any result.

  Deliberately **not** switched to the existing `outerWrap` fallback, which is also text-preserving. Wrapping puts the cap above a subquery's `ORDER BY`, where PostgreSQL does not guarantee the inner ordering survives, so a "top 100 by rank" query could return an arbitrary 100. Inline injection is the semantically correct path and stays the default.

  SQL Server is unaffected: `TOP N` is a prefix that has to sit between `SELECT` and the select list, a position no append can reach, so it continues to use the AST path.

- 88f8898: Fix Explorer view/grid search returning 0 rows — or refusing outright — for ordinary search terms (#4392).

  `UserSearchString` is not a SQL clause: it is the free text a person typed into a search box. It normally never reaches SQL as a fragment — `GenericDatabaseProvider.createViewUserSearchSQL` builds every predicate itself from `IncludeInUserSearchAPI` metadata and lands the text only inside a string literal, with single quotes doubled and LIKE metacharacters escaped under an explicit `ESCAPE`. Two screens intended for genuine SQL fragments were nonetheless applied to it, and each rejected real searches:
  - **`ResolverBase.screenClientViewClauses`** ran it through the GraphQL-boundary base-view AST screen, which wraps its argument as `SELECT 1 FROM x WHERE (<clause>)` and fails closed when that does not parse. `Marcus Chen` parsed as nothing and `O'Leary` as an unterminated literal, so both were refused; only terms that happened to be valid SQL survived — which made essentially every person-name search return 0 rows.
  - **`GenericDatabaseProvider`** ran it through the `ValidateUserProvidedSQLClause` keyword denylist on the view and count paths. Word-boundary-matched against free text, that refused `Union Pacific`, `Update Request` and `drop shipment`, along with any term containing `;`, `--`, `/*` or `xp_` — and the error reached the grid with a null message, so the search box simply looked broken.

  Both screens are removed from this one input. Every genuine clause fragment is screened exactly as before: `ExtraFilter`, `OrderBy` and `OverrideExcludeFilter` keep the boundary AST screen, and they plus the rendered WHERE clause keep the provider denylist.

  **One exception, deliberately retained.** A field carrying `UserSearchParamFormatAPI` splices the term into an admin-authored format that may place `{0}` _outside_ quotes (` = {0}` on a numeric field is a supported configuration). There the term is not confined to a literal, so `createViewUserSearchSQL` re-applies `ValidateUserProvidedSQLClause` — but only when such a field will actually participate in the search, which means a field excluded by field-level security does not trigger it. Entities without such a field are unaffected.

  **Full-text search behavior change.** For `FullTextSearchEnabled` entities, the boolean-operator detection in the full-text branch is now word-boundary based rather than substring based. Previously `OR` matched inside "c**or**porate" and `AND` inside "st**and**ard", so ordinary two-word searches were emitted with `%` joins (`Corporate%Office`) — not valid full-text syntax. They are now joined correctly (`Corporate AND Office`). Multi-word terms only began reaching this branch once the boundary screen stopped refusing them, so without this the fix would not have applied to full-text entities. Deployments relying on the previous `%`-joined output should re-check their full-text searches.

  Covered by regression tests at the GraphQL boundary (`ResolverBase.filterEscaping.test.ts`), in the generated search SQL including the custom-format and field-level-security interactions (`createViewUserSearchSQL.test.ts`), and end-to-end over the real client transport (integration check `runview-matrix.RVM19`).

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
  - @memberjunction/aiengine@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/sql-dialect@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/actions-base@6.1.0-edge.7
  - @memberjunction/actions@6.1.0-edge.7
  - @memberjunction/encryption@6.1.0-edge.7
  - @memberjunction/queue@6.1.0-edge.7
  - @memberjunction/query-processor@6.1.0-edge.7
  - @memberjunction/geo-core@6.1.0-edge.7
  - @memberjunction/ai-vectors-memory@6.1.0-edge.7
  - @memberjunction/sql-parser@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- 489aecd: Make SQL Server save-call SQL variable suffixes a deterministic PK hash instead of a random uuid slice, so MetadataSync recaptures of an unchanged tree are byte-identical (loom #12 WP3). The suffix is the first 12 hex of sha1(`schema.table|pk`) with key values normalized (UUIDs lower-cased, Dates as ISO-8601), plus `_n` when the same hash repeats inside one TransactionGroup. The allocator lives on GenericDatabaseProvider (shared GenerateSaveSQL orchestrator); SQLServerDataProvider.RenderSaveCallBinding consumes it. `SQLServerTransactionGroup.scopeItemVariables` now scopes every name in a comma-separated DECLARE list (previously only the first), so batched submits no longer rely on per-item suffixes to keep locals distinct.
- 8d880cc: Split geo **read** (`SupportsGeoCoding`, maps, distance, virtual PrimaryAddress / `__mj_Latitude_{FK}`) from geo **write** (GeoCodeSyncService only when 1+ writable Geo\* fields exist; skip provider when native lat/lng already set). mj-sync `push.skipGeoCoding` per entity. Parallel push default 10 uses `CreateIndependentInstance()` (shared pool, own TX) instead of defaulting to 1. Durable AfterCreate without a queue submitter defers until transaction depth is 0 (fire-and-forget), not nested in the save.
- f544a93: Event-driven metadata refresh from dataset membership, and an authoritative dataset-status oracle.

  **The problem.** A server process never refreshed its own in-memory metadata after a permission-bearing save it itself processed: the only trigger was the periodic `RefreshIfNeeded()` poller, and its staleness check (`GetDatasetStatusByName` Phase 1) derived each MJ_Metadata item's "remote" timestamp from the server's **own cached dataset slots** — a closed loop. A tightened field-security rule was therefore not enforced over the wire until process restart. Clients had no event-driven metadata refresh at all — a browser loaded metadata once per page load.

  **The fix, in three parts:**
  1. **Dataset-membership-driven refresh (`ProviderBase`).** When a provider loads the MJ_Metadata dataset, it records which entities compose it (`registerMetadataDatasetMembership`; persisted beside the metadata snapshot for warm boots). The existing static write-invalidation fan-out now also routes save/delete/remote-invalidate events to `handleMetadataMemberEntityEvent`: a write to any member entity schedules a refresh of the provider that owns that metadata, gated by a fail-open backend-identity check for multi-provider processes. Membership is the dataset definition itself — adding a `DatasetItem` row extends coverage with no code change, and no entity names are hardcoded anywhere. Scheduling and refresh policy are per-tier: **database providers** debounce briefly (500ms, burst-coalescing, so the enclosing transaction commits first) and hard-`Refresh()` — the writer must not trust any cache for the re-read; **`GraphQLDataProvider`** coalesces into a long randomized window (15–45s, since every browser receives every write broadcast and MJ_Metadata's members include routinely-written entities like dashboards and queries — the window caps each browser at one staleness check and at most one metadata pull per window, jittered so sessions never stampede together) and then runs the staleness check, re-pulling the graph only when genuinely stale. Single-flight guards the reload itself: a refresh request arriving mid-reload queues exactly one follow-up instead of racing a concurrent reload whose older snapshot could win the swap.
  2. **The staleness oracle is authoritative.** `GetDatasetStatusByName` no longer derives status from cached dataset slots — status is always the batched SQL MAX/COUNT per item (the cache remains fully in play for the _data_ reads in `GetDatasetByName`), and the status query now composes the stored item `WhereClause` with the runtime filter, matching the data read (previously the SQL path ignored the stored clause).
  3. **Throttle bypass for event-driven checks.** `CheckToSeeIfRefreshNeeded`/`RefreshIfNeeded` accept an optional `bypassMinCheckInterval`; event-driven callers hold positive evidence a member entity was written, and the 30s min-check throttle would otherwise silently drop the second of two permission changes made inside one window.

  Permission changes are now enforced by the server that processed them within ~1–2 seconds (one full metadata reload per debounced burst, in the background — requests keep serving the old graph until the atomic swap) instead of not until process restart. Other server instances converge on their periodic tick, which the oracle fix makes genuinely reliable. Connected browsers converge within the client coalescing window — display freshness only; enforcement is server-side either way.

- 9f73528: Nested transactions live on GenericDatabaseProvider. Depth 1 is a physical BEGIN; depth 2+ is a dialect savepoint. A savepoint error on a published handle (`ENOTBEGUN`/`EABORT`/`25P01`) throws `DoomedTransactionError` instead of opening a second physical TX (torn write). Nested begin with no physical TX is corruption. Physical hooks are abstract; `AbandonPhysicalTransaction` unpublishes on EABORT; `AfterPhysicalCommit` runs after the mutex. `TransactionDepth` moved to `@memberjunction/core` with deprecated camelCase aliases (`transactionDepth`, `savepointStack`, `inTransaction`, `inNestedTransaction`) for one release. `ResetTransactionState()` replaces poking private fields. Upgraders: read `TransactionDepth` (not a duck-typed `transactionDepth` that would be undefined).
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

- cda0187: Threshold-mode SQL logging (Explorer SQL logging sessions, `mj sync watch`) now emits the batch separator before any statement that would redeclare a variable already declared in the current batch. Save-call variable suffixes are deterministic per record since #4257, so an edit followed by a correction of one record produced two identical `DECLARE` lists in one batch, which SQL Server rejects on replay ("The variable name … has already been declared"). Names are compared case-insensitively and the set resets at each separator; the count-based separator and legacy per-statement mode are unchanged.
- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [f6a4341]
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
  - @memberjunction/aiengine@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/actions@6.1.0-edge.6
  - @memberjunction/geo-core@6.1.0-edge.6
  - @memberjunction/sql-parser@6.1.0-edge.6
  - @memberjunction/sql-dialect@6.1.0-edge.6
  - @memberjunction/ai-vectors-memory@6.1.0-edge.6
  - @memberjunction/queue@6.1.0-edge.6
  - @memberjunction/actions-base@6.1.0-edge.6
  - @memberjunction/encryption@6.1.0-edge.6
  - @memberjunction/query-processor@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- 905820a: Sync-scoped write-side-effect suppression. Record Changes and geocoding are per-write side effects, but the only way to relieve a high-volume writer of them was turning the entity flags off — which also turns them off for every human and API writer of the same entities, permanently. New `EntitySaveOptions.SkipRecordChanges` / `SkipGeoCoding` (and `EntityDeleteOptions.SkipRecordChanges`) scope the suppression to the individual save: providers omit the audit-row wrap and the geocode side trip for saves that carry the options, and only those. The sync engine sets them on its own writes when the connection asks via `Configuration.writeSideEffects === 'suppressed'` — fail-closed: absent or malformed configuration keeps the side effects on, and a save outside a suppressing sync run can never carry them. Materially identical to flags-off for the sync's writes; invisible to every other writer. The delete option is mirrored onto the GraphQL `DeleteOptionsInput` because the schema-sync gate requires every `EntityDeleteOptions` field to appear there, but it is **not honoured over the wire**: every wire entry point sanitizes it back to false and logs the attempt, because suppressing an audit row is a higher privilege than `entity:delete` — the only authorization a delete mutation performs. That keeps delete at exact parity with save, whose options have no GraphQL input type at all.
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
  - @memberjunction/aiengine@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/sql-dialect@6.1.0-edge.5
  - @memberjunction/actions@6.1.0-edge.5
  - @memberjunction/queue@6.1.0-edge.5
  - @memberjunction/actions-base@6.1.0-edge.5
  - @memberjunction/encryption@6.1.0-edge.5
  - @memberjunction/query-processor@6.1.0-edge.5
  - @memberjunction/geo-core@6.1.0-edge.5
  - @memberjunction/ai-vectors-memory@6.1.0-edge.5
  - @memberjunction/sql-parser@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [a2c528f]
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
  - @memberjunction/aiengine@6.1.0-edge.4
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/geo-core@6.1.0-edge.4
  - @memberjunction/sql-dialect@6.1.0-edge.4
  - @memberjunction/actions@6.1.0-edge.4
  - @memberjunction/queue@6.1.0-edge.4
  - @memberjunction/actions-base@6.1.0-edge.4
  - @memberjunction/encryption@6.1.0-edge.4
  - @memberjunction/query-processor@6.1.0-edge.4
  - @memberjunction/ai-vectors-memory@6.1.0-edge.4
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

- 7300953: Query Materialization — Phase 2: parameterized RowFilterBroad read-time injection. A caller can now run a materialized parameterized stored Query with `RunQueryParams.DataSource: 'Materialized'` and the provider serves it from the broad materialized table with the query's row-filter parameters injected as **bound** read-time predicates, falling back to the live query on any uncertainty (serving live is always correct).
  - **`codegen-lib`**: the render-and-diff verifier now captures each row-filter predicate's operator + value shape (normalized to `column <op> value`, flipping `value < column`); `qualifyParameterizedQuery` builds a structured `ReadFilterSpec` and gates it to a safe operator whitelist (`=, !=, <>, <, >, <=, >=, IN, NOT IN` — `LIKE`/`IS`/`BETWEEN` stay live-only); `manage-metadata` persists the spec and enables Bucket-1 materialization. New migration adds `MaterializedResult.ReadFilterSpec` (+ the CodeGen-regenerated view/procs/EntityField).
  - **`core`**: `RunQueryParams.DataSource: 'Live' | 'Materialized'` (mirrors `RunViewParams`).
  - **`generic-database-provider`**: `InternalRunQuery` redirects a `DataSource:'Materialized'` read to `SELECT … FROM <materialized view> WHERE <spec predicates>` with values **bound** (never interpolated), and falls back to live on any doubt — not opted in, not fresh/Active, a parameter absent from the spec, an unsafe operator, or an execution error.
  - **`server` / `graphql-dataprovider`**: `DataSource` threaded through the RunQuery GraphQL surface (singular, batch, cache-check, and SystemUser paths).

  Proven by a differential reconstruction proof (13/13, real SQL Server) and a full provider-level `RunQuery` E2E (16/16). See `plans/query-entity-materialization-phase2.md`. Stacks on the Phase 1 materialization PR (merges after it).

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
- Updated dependencies [f5ec13b]
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
  - @memberjunction/aiengine@6.1.0-edge.3
  - @memberjunction/sql-parser@6.1.0-edge.3
  - @memberjunction/sql-dialect@6.1.0-edge.3
  - @memberjunction/queue@6.1.0-edge.3
  - @memberjunction/ai-vectors-memory@6.1.0-edge.3
  - @memberjunction/actions-base@6.1.0-edge.3
  - @memberjunction/actions@6.1.0-edge.3
  - @memberjunction/encryption@6.1.0-edge.3
  - @memberjunction/query-processor@6.1.0-edge.3
  - @memberjunction/geo-core@6.1.0-edge.3

## 6.1.0-edge.2

### Minor Changes

- 59def38: The entity-action substrate finishes what its schema has been promising. Seven pieces, all of which
  share a failure shape: a column, a flag or a field that read as configured and did nothing.

  **Action Filters now actually prevent execution.** `RunAction`'s filter-refusal branch built its
  result, logged it, and then fell through to run the action anyway — there was no `return`. Every
  Action Filter has therefore recorded that it prevented something while preventing nothing, since the
  mechanism shipped. The refusal row is why it went unnoticed: the observable said "prevented" and the
  side effect happened regardless, so #3606's claim that filters fail closed described evaluation,
  which landed, rather than enforcement, which did not. **Anyone relying on an Action Filter to gate an
  action has been getting the action anyway; after this it stops, which is the configured behaviour but
  a visible change.** A prevented run still writes a log row, deliberately — an operator should be able
  to see that a filter refused rather than wonder why nothing happened — so its `Message` is now an
  exported constant, since that is the only thing distinguishing a prevented run from an executed one.

  **Transition filters.** An entity action could see a record's current state and nothing else, so
  "when Status _becomes_ Approved" was indistinguishable from "when Status _is_ Approved" — which is
  true on every subsequent save too. `EntityChangeContext` now carries both sides of the save to where
  filters run, built from `EntityField.OldValue`, which `BaseEntity` has tracked all along and simply
  never carried anywhere. Filter code gets `DidFieldChange`, `DidFieldChangeToValue`, `OldValues` and
  `NewValues` on `ActionFilterContext`. A create reports no changes, because a record whose Status
  started at Approved did not _become_ anything. Comparison is loose across the string boundary
  metadata forces, so a configured `'1'` matches a numeric `1` rather than silently never matching.

  The capture happens as the first statement of `HandleEntityActions`, deliberately before its first
  `await`: After-hooks are fire-and-forget, and the moment that method yields, the save completes and
  reloads the entity, resetting every `OldValue`. Reading `IsCreate` from that same synchronous
  snapshot also closes a latent bug — `entity.IsSaved` was previously read _after_ an await, so a
  create whose save finalized in that window dispatched as `AfterUpdate`.

  **Two filter-substrate fixes fall out of using it for real.** `EntityActionFilter.Status` was never
  consulted, so a `Disabled` binding still gated — and filters fail closed, so that was not an inert
  row but a permanent block whose only symptom is a trigger that quietly stopped firing. And a binding
  pointing at an unresolvable filter used to reach the evaluator as `undefined` and throw there:
  fail-closed by accident, with no usable reason logged. It now returns a failed result naming the
  filter.

  **Workflow triggers accept a filter.** `ValidateWorkflowSpec` refused `WorkflowEntityEventTrigger.filter`
  outright because the contract to honor it did not exist. It now reconciles onto an owned
  `ActionFilter` bound through `EntityActionFilter` — the additive path — and validates that the
  expression parses, because filters fail closed and a syntax error is not a loud failure, it is a
  trigger that silently never fires.

  **Record Process on-change triggers.** `OnChangeEnabled` has described itself as running "per-record
  on save via an owned Entity Action" since the column shipped, and `OnChangeFilter` promised to
  "compile into the owned Entity Action Filter". Neither owned anything. Saving a Record Process now
  reconciles that binding, matching ownership on the `RecordProcessID` param — `Run Record Process` is
  one shared action, so matching on entity + action alone would let a second process silently repoint
  the first one's trigger. `OnChangeFilter` compiles through the same builder workflow triggers use, so
  one expression vocabulary covers both surfaces.

  **Durable `After*` dispatch (D14).** After-hooks are fire-and-forget, so a process dying mid-flight
  loses the action with nothing to retry it. `EntityAction.RunMode = 'Durable'` routes the dispatch to
  the task-graph substrate as a single-node durable graph — the claim protocol, restart recovery and
  orphan reclaim that already exist there — rather than adding a third async substrate. Opt-in per
  binding, because it costs a Task row, a dispatcher hop, and params persisted at rest. When no
  submitter is registered or submission fails, the work runs **inline**: `Durable` asks for the work to
  be harder to lose, so dropping it would make opting in less reliable than leaving it off. New
  `Task.ActionID` widens the assignment exclusivity to three ways, and `TaskGraphSpecNode.actionName`
  joins `agentName`/`assignToUser`.

  Durability replaces _execution_, not _dispatch_: `RunActionParams.DeferExecution` is called by
  `RunAction` in place of running the action, after validation and filters have passed, so a durable
  binding is gated by exactly what an inline one is gated by. Submitting at dispatch time instead —
  which is where this first landed — would have fired a scoped durable trigger for every record of the
  entity and a filtered one on every save.

  **Execution-log retention.** `Action.RetentionPeriod` and `ActionExecutionLog.RetentionPeriod` shipped
  with descriptions and no reader anywhere in the codebase; the log grew forever while the schema
  claimed otherwise. Retention is now stamped onto each row when the run starts — decided at write
  time, so editing an action's retention is a going-forward change rather than a retroactive deletion —
  and a new opt-in `Action Log Retention` scheduled job purges expired rows oldest-first, bounded per
  run, reporting when it stopped at its ceiling rather than because it was finished.

  **The `Validate` invocation hole.** `EntityActionInvocationValidate` overrode single-record invocation
  with a near-copy that had drifted into a strict subset: no scope resolution (so a binding narrowed to
  one record ran `Validate` against every record of the entity) and no provenance (so a whole-record
  parameter was logged raw, ignoring the binding's `LogValue` rows). The override is deleted; the class
  inherits, which is what keeps both facts true for `Validate` permanently rather than until the copies
  drift again.

  **The `RunEntityAction` null contract.** `null` means the action did not run — the binding is scoped
  and this record falls outside it. `HandleEntityActions` guarded for it; the GraphQL resolver did not,
  so an out-of-scope binding surfaced to clients as a server error. The signature now says so and the
  resolver reports it as the ordinary outcome it is.

### Patch Changes

- 8288711: Fix process-wide server cache corruption, and make the cache structurally unable to be
  corrupted by consumers.

  **Take this bump urgently if you run MJAPI.** `ResolverBase` mapped GraphQL transport field
  names onto the data provider's own result rows, which the server cache holds _by reference_.
  Preparing one GraphQL response therefore rewrote `__mj_CreatedAt` to the wire alias
  `_mj__CreatedAt` **inside the live cache**, and every later read served the corrupted shape —
  failing in `BaseEntity.SetMany` with `Field _mj__CreatedAt does not exist on <Entity>`. The
  cache is process-wide, so a single response poisoned every subsequent request across all
  workers. Fixed by mapping onto copies.

  Fixing it at the reader alone left the whole class of bug open — nothing in the type system or
  the API surface said "this array is shared, do not mutate," and the exposure runs in both
  directions (a cache _hit_ returns the stored array; a cache _miss_ stores the array it is about
  to return). So the cache now defends itself:
  - **`ILocalStorageProvider` gains an optional `readonly SharesReferences?: boolean`**, declaring
    whether a provider hands back live references (the in-memory providers) or serialized copies
    (IndexedDB, localStorage, Redis, MMKV). **Fully backward compatible**: existing implementations
    keep compiling, and omitting the property is not an opt-out — `LocalCacheManager` measures any
    provider that does not declare one (store a sentinel, read it back, compare identity), so a
    provider written before this contract still gets the correct protection instead of silently
    losing it to a falsy default.
  - **`LocalCacheManager` deep-freezes row data at write time** — rows, their nested values, and
    the array itself — but only when the provider shares references. Mutations then throw a
    `TypeError` at the offending line instead of silently corrupting shared state, and cache
    **hits cost nothing extra** (the freeze is a one-time per-write cost). Applied at both write
    funnels: `SetRunViewResult` / `SetRunQueryResult` and `storeCachedResults`, the in-place
    slot-maintenance path that bypasses the first. The freeze lands immediately after the only
    gate that can decline a write (the synchronous oversized-entry check) and **before** the
    awaited eviction steps — callers do not always await these methods, so any yield point
    before the freeze is a window in which shared rows are handed out still mutable. Browser
    clients are untouched (IndexedDB / localStorage serialize), but **Node-side clients — the
    CLI, MetadataSync, and anything else on an in-memory provider — do get the freeze**, so
    "client behavior is unchanged" holds only for the browser. The freeze decision also follows
    the provider across `SetStorageProvider`: MJAPI initializes on the in-memory provider during
    engine loading and swaps to Redis afterward, two providers with opposite semantics in one
    process. The deep-freeze skips **binary payloads**
    (`Buffer`/TypedArray/`ArrayBuffer`, e.g. `varbinary` columns — `Object.freeze` throws on
    non-empty views by spec), freezes parent-first so cycles terminate, and a freeze failure of
    any kind degrades to a logged, unfrozen store — it can never fail a `RunView`/`RunQuery`.
  - **Dataset cache slots get their own key namespace.** `GetDatasetByName` keyed its
    write-through cache with the same fingerprint builder ordinary reads use, passing only
    `{ EntityName, ExtraFilter }` — and every shipped dataset item has a NULL `WhereClause`, so a
    dataset item and a plain unfiltered `RunView` of the same entity produced an IDENTICAL key and
    silently shared one slot. That leaked the `MJ_Metadata` scaffolding exemption below to ordinary
    callers of `MJ: Entities` / `MJ: Entity Fields` (the most-read entities in the process, served
    unfrozen), and in the other direction let an ordinary read repopulate an evicted slot FROZEN so
    the next metadata refresh threw. `GenerateRunViewFingerprint` now takes an optional dataset
    segment, appended only when supplied — ordinary reads keep their exact pre-existing key, so no
    existing cache entry is invalidated.
  - **`CacheWriteOptions.ProviderInternalScaffolding`** exempts slots whose only consumer is the
    provider that wrote them — scoped to the **`MJ_Metadata` dataset only** at its single write
    site. Metadata bootstrap needs this: the provider's own assembly (`PostProcessEntityMetadata`,
    plus `GetAllMetadata`'s Applications assembly) hydrates its object graph by mutating those
    rows in place. Every **other** dataset's cached rows are frozen shared state like any RunView
    result, because `GetDatasetByName` serves them to arbitrary consumers (`BaseEngine.Load` hands
    the live arrays to every engine subclass). The flag is persisted and carried forward through
    slot maintenance so a later save cannot re-freeze the slot.

  Pre-existing consumer bugs surfaced by the freeze and fixed:
  - **`BaseEntity.Get()` wrote to its own source row.** The raw-mode fast path keeps the caller's
    row by reference and `Get()` wrote back into it to memoize a converted `Date` or an rtrimmed
    fixed-width string — so on a cache-served row, _reading_ a `datetime` or `CHAR(n)` field threw.
    This broke AI cost calculation on `MJ: AI Model Costs.Currency`. `Get()` now memoizes into a
    per-instance side table and never writes to the row at all. Gating the write on a once-sampled
    `Object.isFrozen` was not sufficient: the freeze is asynchronous relative to the consumer (cache
    writes are not always awaited), so the sample could be stale by the first read and the write
    still threw. Keeping the memo off the row makes freeze timing irrelevant AND restores the
    optimization for frozen rows, which the isFrozen-guard version had given up.
  - **`ResolverBase.MapFieldNamesToCodeNames` renamed fields on its argument.** Callers pass rows
    straight from `findBy`/`RunView` — the cache's own objects — so with the freeze in place
    `UserByEmail`, `UserByID`, `UserByEmployeeID` and every CodeGen-generated single-record resolver
    over a cached entity threw `Cannot add property _mj__CreatedAt, object is not extensible`
    (reproduced live against a running MJAPI). Before the freeze it did something quieter and worse:
    it rewrote the cached row's keys. It now returns a copy, which fixes every call site at once;
    `ArrayMapFieldNamesToCodeNames` likewise returns a new array of new objects.
  - **`GenericDatabaseProvider.serveFromServerCache` and the smart-cache legs** duplicated
    `CachedRunViewResult` as four inline structural types, which had already caused one silent
    field drop; they now share the canonical type.
  - **The singular server RunView path silently dropped a `PostRunView` hook's returned
    replacement result** (`PostRunView` reassigned a local; `RunView` returned the pre-hook
    reference), while the client and batch paths honored it. The freeze un-masked this: with
    in-place row mutation now throwing, no signature-conformant result-modifying hook worked on
    that path at all. `PostRunView` now copies a hook-supplied replacement onto the result object
    it was handed, so the change reaches the caller — its `Promise<void>` signature is unchanged,
    so external subclasses that override it keep compiling. Hook docs (`PostRunViewHook`,
    `BaseServerMiddleware.PostRunView`) now state that rows may be frozen shared cache state:
    modify by mapping onto copies (`results.Results = results.Results.map(r => ({ ...r, ... }))`)
    or return a new result — never mutate rows in place.
  - **Cache-served reads skipped the `PostRunView` hook chain entirely.** `PostRunView` is the
    OUTPUT half of the data-hook enforcement seam (masking / audit) and hooks receive
    `contextUser`, so masking is per-user while a cache slot is shared — there is no correct way
    to apply it once at write time for a reader who has not arrived yet. Three of the four server
    paths already ran the chain (miss, mixed batch, client smart-cache); the singular cache hit and
    the all-cached batch returned early, so masking depended on whether a _sibling_ view in the same
    batch happened to miss. This looked correct before only by accident: the cache write precedes
    the hooks, so an in-place masking hook wrote through into the cached rows — which both made
    later hits appear masked and baked one user's masking decision into a shared slot. Both hit
    paths now run the chain against the per-hit result wrapper, so a hook's replacement reaches the
    caller and can never write back into the cache. The zero-hook path (the default — no shipped
    middleware overrides `PostRunView`) costs ~80ns, down from ~2.4µs: `GetDataHooks` now memoizes
    the resolved global object store, whose `GetGlobalObjectStore()` probe throws and catches a
    `ReferenceError` on every call under Node (~1.4µs), and the hit paths check for registered hooks
    before awaiting the chain.

  The cache result types stay ordinary mutable arrays, documented as shared-and-frozen: the runtime
  freeze is the enforcement, and a `readonly` marker would have broken existing downstream readers
  without adding protection. **This release contains no breaking changes** — every public signature
  it touches is additive or unchanged.

  Consumer-facing contract, documented in `guides/CACHING_AND_PUBSUB_GUIDE.md`: **treat rows from
  `RunView`/`RunViews`/`RunQuery` as read-only** unless you produced them. Copy before mutating —
  `rows.map(r => ({ ...r }))`, `[...rows].sort(...)`. Narrow-`Fields` requests and
  `ResultType: 'entity_object'` results are unaffected (both get per-caller objects).

- e26c866: Fix keyset (`AfterKey`) pagination returning duplicate rows and silently skipping others.

  A keyset walk was ordered inconsistently across its own pages. Page 1 has no cursor yet, so `usingKeyset` is false and the query fell through to the plain row-limited path — which emitted `SELECT TOP N …` with **no `ORDER BY` at all**, letting the engine return an arbitrary N rows. Page 2 onward then forced `ORDER BY <pk>` plus the seek predicate `<pk> > @afterKey`. Because the two orderings disagreed, rows from page 1 were re-returned on page 2, and rows the arbitrary first page happened to include could be skipped by the walk entirely.

  The fix gives every row-limited query the determinism that OFFSET pagination already had: when `MaxRows` (or the entity's `UserViewMaxRows`) limits the result and the caller supplied no `OrderBy`, the query now orders by the primary key. `TOP N` / `LIMIT N` without an `ORDER BY` is undefined by definition, so this is a general correctness fix rather than a keyset-specific patch — and it makes page 1 of a keyset walk agree with every page after it, since both order by the same PK.

  Verified against real data: a four-page keyset walk over a 32-row universe previously duplicated 4 of the 8 rows on page 2; it now returns all 32 rows exactly once, with none missed. This is the defect behind the long-standing `IT25 - View Execution (client-first)` / `view-execution.V10` integration failure.

  **Behavior note**: this changes _which_ N rows an unordered `MaxRows` query returns. That set was previously undefined and could vary between runs, so no correct caller can have depended on it — but callers that were incidentally observing storage order will now see primary-key order. It also introduces a sort for entities whose primary key is not the clustered index.

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
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [d8adda1]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/actions-base@6.1.0-edge.2
  - @memberjunction/actions@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/aiengine@6.1.0-edge.2
  - @memberjunction/encryption@6.1.0-edge.2
  - @memberjunction/queue@6.1.0-edge.2
  - @memberjunction/query-processor@6.1.0-edge.2
  - @memberjunction/geo-core@6.1.0-edge.2
  - @memberjunction/ai-vectors-memory@6.1.0-edge.2
  - @memberjunction/sql-dialect@6.1.0-edge.2
  - @memberjunction/sql-parser@6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

- 394d276: Add **entity companions** and **composite graph saves** to `BaseEntity`, and replace the two transaction mechanisms that were blind to each other with one provider-arbitrated primitive.

  ### Composites

  A parent and its related records can now load, validate and persist as one unit, from one call, on both tiers. Declare a collection on a shared (client + server) entity subclass:

  ```typescript
  public readonly Lines = this.DeclareRelatedRecords<OrderLineEntity>({
      Name: 'Lines',
      RelatedEntity: 'MJ_BizApps_Orders: Order Lines',
      RelatedEntityJoinField: 'OrderHeaderID',
      OrderBy: 'LineNumber ASC',
      Load: 'explicit',                            // 'explicit' | 'immediate' | 'lazy' | 'never'
      OnRemove: 'delete',                          // 'delete' | 'orphan' | 'refuse'
      Sequence: { Field: 'LineNumber', From: 1 },
  });
  ```

  On the server the graph executes locally inside one transaction; from the browser the whole unit of work is routed to the server via the new `MJ.SaveEntityGraph` remote operation, which rebuilds the records as their server-side subclasses and runs the _same_ executor. One cascade implementation, two placements — and **zero changes to any generated GraphQL type**. Every node is persisted through its own `Save()`/`Delete()`, so Record Changes, entity actions, validation, `PreSave` hooks, per-record events and cache invalidation all fire normally; the root additionally raises `graph_save_started` / `graph_save`.

  The option shape mirrors `EntityRelationship` metadata (`RelatedEntity`, `RelatedEntityJoinField`) so the same declaration can be code-generated later — see the schema change below.

  New public API: `EntityCompanion`, `RelatedRecordCollection<T>`, `EntitySavePlan`, `EntityTransactionScope`, `RunInEntityTransaction()`, `SaveEntityGraphOperation`, `LoadRelatedRecordsBatched()`, and on `BaseEntity` — `DeclareRelatedRecords()`, `RegisterCompanion()`, `GetCompanion()`, `Companions`, `HasCompanions`, `SerializeCompanions()`, `DeserializeCompanions()`. `RunViewParams` gains `IncludeRelatedRecords` for batched loading (1+K queries instead of N+1).

  ### Schema

  Adds nullable `EntityRelationship.RelatedRecordCollection` (JSONType `IRelatedRecordCollectionConfig`) — the policy half of a `DeclareRelatedRecords(...)` declaration, so CodeGen can eventually emit these instead of every application hand-writing them. `RelatedEntity` / `RelatedEntityJoinField` are read from the row's existing columns and deliberately not duplicated in the JSON. NULL — every existing row — means "not a declared collection", i.e. exactly current behaviour. CodeGen emission is a follow-up; nothing reads the column yet.

  ### Transaction unification

  `DatabaseProviderBase` gains `BeginEntityTransaction()` / `SupportsEntityTransactions`, delegating to the existing depth-counted `BeginTransaction()` — so it starts a physical transaction _or joins one already in flight_ as a savepoint. Participants never ask who else is in a transaction. IS-A chains now use it.

  This fixes a torn-write defect: `BeginISATransaction()` opened a brand-new physical transaction on the pool with **no depth awareness**, while `BeginTransaction()` (used by every hand-written application cascade) is depth-counted. An IS-A entity saved inside an application transaction therefore wrote into two independent transactions; rolling one back left the other committed, with no error raised.

  ### 🚨 BREAKING

  Removed outright rather than deprecated, since 6.x LTS has not shipped:
  - `IMetadataProvider.BeginISATransaction` / `CommitISATransaction` / `RollbackISATransaction`, and their `SQLServerDataProvider` implementations. **Migration:** use `BeginEntityTransaction()`, or `RunInEntityTransaction(provider, work)` which handles commit/rollback for you.
  - `BaseEntity.ProviderTransaction` and `BaseEntity.PropagateTransactionToParents()`. Nothing set them after the unification, and the provider reads that consumed them were already dead: every `ExecuteSQL` call without an explicit `connectionSource` picks up the provider's ambient transaction, which is what the unified scope opens. **Migration:** none needed for code that goes through `Save()`/`Delete()`; code that hand-routed a record onto a specific transaction handle should open a scope instead.

  ### Behaviour changes for adopters

  No effect on entities without companions:
  - `Dirty` now rolls up companions. A clean parent with new children previously reported `Dirty === false`, took the not-dirty early return, and silently persisted nothing while reporting success.
  - Companion validation runs regardless of `DefaultSkipAsyncValidation`. That flag governs an entity's own async rules; applying it to cross-child invariants silently disabled them — which is how `OrderEntityServer.ValidateAsync` became dead code on every save.

  Additive and opt-in otherwise — single-record saves take the identical code path they did before.

  See `guides/TRANSACTIONS_AND_BATCHING_GUIDE.md` for when to use provider transactions vs Transaction Groups vs entity graphs.

- 394d276: Phase 7 of the unified workflow DAG engine program (plan: PR #3456) — Track D, the trigger layer. Everything here closes a gap where something _claimed_ to work and did not.

  **Entity-change triggers only bind where an agent can safely run.** A `WorkflowSpec` trigger passed its `invocationType` straight through, and `Validate` / `BeforeCreate` / `BeforeUpdate` / `BeforeDelete` are real invocation names — so a workflow could bind an unbounded agent run _inside_ a user's save, in the held transaction, with the power to abort it. Validation now refuses anything but the `After*` forms, and the shorthand an author writes (`Update`) resolves to `AfterUpdate` rather than drifting from the name the platform actually fires. That drift was live: the contract documented `Create | Update | Delete`, none of which the platform matches, so the first trigger ever saved through it failed to resolve.

  **Trigger scope stopped being decorative.** `scopeEntityName` / `scopeRecordID` were declared, documented, accepted by validation — and then referenced nowhere in reconciliation. A workflow the author scoped to one record fired on _every_ record of the entity while the UI showed it as scoped. They now reconcile onto the binding's own `ScopeEntityID` / `ScopeRecordID`, which the engine's scope resolver already honored. `filter` is **refused** rather than accepted-and-ignored: narrowing by predicate needs the before/after values of a change, a contract that does not exist yet, and a workflow runs an agent — over-firing costs real money. Accepting it later is additive; the reverse would break specs already published against it.

  **An entity may bind the same action more than once (`UQ_EntityAction_ActionID_EntityID` dropped).** The v5.37.x junction sweep added that constraint under a stated scope of _"pure junction tables — two foreign-key columns plus ID/Sequence/timestamps, with no other meaningful data columns."_ `EntityAction` never met it: even then it carried `Status`, `Sequence` and `LoggingMode` and owned three child collections. Three months later #3408 added `ScopeEntityID`/`ScopeRecordID` so a binding could attach to "this Deal Type" — a feature the constraint makes unusable, since one binding per (entity, action) means one scope, so "every Deal" and "this Deal Type" cannot coexist. It also forced a single param set, filter set and scope to be shared across _every_ event an action responds to, making "on create run agent X, on update run agent Y" unexpressible. `V202608080100__v6.1.x__Drop_EntityAction_Uniqueness` removes it with no replacement; a narrower index would still refuse two unscoped bindings differing only by invocation type. Nothing in the runtime assumed uniqueness — every accessor already returns a collection and `HandleEntityActions` already iterates — so this is schema-only. Each workflow now owns its own binding, matched on the agent it dispatches to plus its scope; reusing a shared row would have rewritten `AgentID` and silently repointed one workflow's trigger at another's agent.

  **A self-trigger guard, because enrich-and-write-back is the normal shape.** "When a ticket changes, summarize it and store the summary" saves the ticket, which re-fires the action, forever. `EntityActionDispatchGuard` keys every automatic dispatch by `(entity action, entity, record)` and tracks origin through the async call tree with `AsyncLocalStorage`, so re-entry is detected however deep inside an agent run the write-back happens — no call site threads anything. Re-entry is **suppressed**, not deferred: queuing it would turn an infinite loop into an infinite sequence. A merely _overlapping_ save is a different problem with the same key, so it **coalesces** — latest wins, one pending rerun, and a burst of ten saves collapses to two runs instead of ten. Only after-hooks are guarded; `Validate` and `Before*` participate in the save and must neither be skipped nor deferred. Work that has detached from the async context (a durable task graph, a queued job) declares its origin explicitly through the new `EntitySaveOptions.OriginatingEntityActionIDs`.

  **Scheduled-job notifications actually send.** `NotificationManager` logged `"Would send notification to user …"` while `NotificationEngine` sat one package away. It now delivers for real, and composes the two people who have a say: the job's `NotifyViaEmail` / `NotifyViaInApp` toggles are a **ceiling**, the recipient's preferences decide within it. Neither existing knob expressed that — `forceDeliveryChannels` would let a job override a recipient's opt-out, and omitting the toggles would let a type default fire a channel the job never asked for. `SendNotificationParams.allowedDeliveryChannels` is the new primitive; it can only subtract, which is what makes it safe to expose.

  **"Execute Scheduled Job Now" runs the job.** It used to insert a `Status='Running'` run row and report success. Nothing consumed those rows — the poller selects jobs by _schedule_, never by pending run record — so the action left a row that said Running forever and ran nothing. It now executes through `SchedulingEngine`, and a failed job is a failed action rather than a successful insert. `Wait=false` starts it without blocking.

  **The dispatcher has somewhere to deliver.** `StartTaskGraphDispatcher` constructed it with no continuation deliverer at all, so a finished graph logged its outcome, marked itself delivered, and said nothing to the conversation that asked for it. `TaskGraphContinuationDeliverer` posts the roll-up with per-step detail. `Reinvoke` stays unimplemented on purpose: a safe one needs the new agent run to remember it was a continuation at depth N so `MAX_REINVOKE_DEPTH` can stop the chain, and nothing durable records that — a cap that never trips is worse than degrading to a message.

  **IT71 grows to 16 checks.** TG14 drives the save-to-binding round trip that Phase 6 owed; TG15 pins that a scoped trigger actually narrows; TG16 pins that two workflows on one entity keep separate bindings pointing at their own agents, and that re-saving finds its own row rather than adding a third. TG14 caught a second real bug on its first run — the invocation-type mismatch above — and TG16 is what surfaced the unique constraint.

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
- Updated dependencies [394d276]
  - @memberjunction/actions@6.1.0-edge.1
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/aiengine@6.1.0-edge.1
  - @memberjunction/ai-vectors-memory@6.1.0-edge.1
  - @memberjunction/actions-base@6.1.0-edge.1
  - @memberjunction/encryption@6.1.0-edge.1
  - @memberjunction/queue@6.1.0-edge.1
  - @memberjunction/query-processor@6.1.0-edge.1
  - @memberjunction/geo-core@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1
  - @memberjunction/sql-dialect@6.1.0-edge.1
  - @memberjunction/sql-parser@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- 841e6ea: Harden several SQL text-building paths that substituted values into query strings without parameterization or escaping.

  **`@memberjunction/server`** — `ReportResolver.CreateReportFromConversationDetailID` built its `WHERE` clause via direct string interpolation of the `ConversationDetailID` argument. It now binds the value through `mssql`'s parameterized `request.input(...)` as a `UniqueIdentifier`, consistent with the parameterization pattern already used elsewhere in the package, and gets GUID-format validation as a side effect.

  **`@memberjunction/generic-database-provider`** — `GenericDatabaseProvider.CheckRecordRLS` built its primary-key `WHERE` clause without escaping embedded quotes in the key value, unlike the sibling `Load()` path a few lines above, which already escapes. The RLS-check path now mirrors `Load()`'s escaping so a primary key value containing a quote can't alter the query's structure.

  **`@memberjunction/core`** — `RowLevelSecurityFilterInfo.MarkupFilterText` did two things that could weaken a row-level security filter: it let `undefined` user-property values through as the literal string `"undefined"`, and it never escaped quotes in substituted values. Both are fixed — `undefined` now falls through to the existing unresolved-token handling (same as `null` and object-typed values already did), and substituted values now have embedded single quotes doubled.

  Behavior note for deployments with existing role-based RLS filters: equality-style filters (`Col = '{{UserX}}'`) are unaffected. Filters written in negation form (`<>`, `NOT IN`, `NOT LIKE`) against a user property that can be `undefined` previously matched more rows than intended (a permissive gap) and will now correctly match fewer — reviewed as: users may see fewer rows than before the upgrade, which is the deliberate direction of this fix, not a new restriction to work around.

  **`@memberjunction/ng-react`** — `RuntimeUtilities.provider` was initialized directly from the global `Metadata.Provider` at class-field scope. The value was always overwritten before use by `buildUtilities()`'s existing `provider ?? Metadata.Provider` fallback, so this is a no-behavior-change cleanup that stops the class body from touching the global provider directly.

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [1100077]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/actions@6.1.0-edge.0
  - @memberjunction/actions-base@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/aiengine@6.1.0-edge.0
  - @memberjunction/encryption@6.1.0-edge.0
  - @memberjunction/queue@6.1.0-edge.0
  - @memberjunction/query-processor@6.1.0-edge.0
  - @memberjunction/geo-core@6.1.0-edge.0
  - @memberjunction/ai-vectors-memory@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0
  - @memberjunction/sql-dialect@6.1.0-edge.0
  - @memberjunction/sql-parser@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/aiengine@6.0.0
  - @memberjunction/ai-vectors-memory@6.0.0
  - @memberjunction/actions-base@6.0.0
  - @memberjunction/actions@6.0.0
  - @memberjunction/encryption@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/queue@6.0.0
  - @memberjunction/query-processor@6.0.0
  - @memberjunction/geo-core@6.0.0
  - @memberjunction/global@6.0.0
  - @memberjunction/sql-dialect@6.0.0
  - @memberjunction/sql-parser@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/aiengine@5.51.0
  - @memberjunction/ai-vectors-memory@5.51.0
  - @memberjunction/actions-base@5.51.0
  - @memberjunction/actions@5.51.0
  - @memberjunction/encryption@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/queue@5.51.0
  - @memberjunction/query-processor@5.51.0
  - @memberjunction/geo-core@5.51.0
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
  - @memberjunction/actions-base@5.50.0
  - @memberjunction/aiengine@5.50.0
  - @memberjunction/actions@5.50.0
  - @memberjunction/encryption@5.50.0
  - @memberjunction/queue@5.50.0
  - @memberjunction/query-processor@5.50.0
  - @memberjunction/geo-core@5.50.0
  - @memberjunction/ai-vectors-memory@5.50.0
  - @memberjunction/global@5.50.0
  - @memberjunction/sql-dialect@5.50.0
  - @memberjunction/sql-parser@5.50.0

## 5.49.0

### Patch Changes

- 4c441dd: Close out every open cache-audit defect (B39–B44) plus the reachable differential throw found in adversarial round 3.
  - **B40** — `CacheLocal` + `Aggregates` returned no aggregates at all, even on a cold miss. Three independent drops in one pipe: the client's cache-check input map omitted `Aggregates` from the request, the resolver's coreParams map omitted them again, and the engine's `stale` reply dropped the computed results. All three now forward; the client parses values back to native types. `client-cache` is 13/13 and now registered in the deterministic gate.
  - **B39** — a `ViewID`-only `RunView` failed for _every_ caller (including the view's owner): the internal `MJ: User Views` lookup ran without a context user, and a miss fell through to `undefined` ("Entity undefined not found in metadata"). The user is now threaded through `EntityStatusCheck` → `GetEntityNameFromRunViewParams`, and a genuine miss throws an error naming the view and the cause.
  - **B41** — the differential-merge decline path now performs a **real full fetch** (CacheLocal stripped + BypassCache, so re-entry into the smart-cache transport is structurally impossible) instead of throwing away the caller's whole batch; with that fallback in place, the `hasNarrowingSegment` guard is restored on `ApplyDifferentialUpdate`.
  - **B42** — `OrderBy` (fingerprint segment [2]) joins the maintenance classifier: an in-place upsert appends out of order, so ordered slots invalidate on save (delete still removes in place — removal preserves relative order).
  - **B43** — the RunQuery TTL cache-hit now checks `UserCanRun` before serving; the fingerprint carries no user segment, so user A's warmed slot was served to user B with no permission check. Deny or unresolvable metadata falls through to normal, authorized execution.
  - **B44** — an every-field `Fields` list (the `entity_object` widening) now normalizes to `f:*` in the client fingerprint **only**, restoring in-place maintenance for the client's most common slot shape without touching what is fetched.

  Also: the round-3 finding that the "unreachable" differential throw was in fact reachable (aggregate slots and defensive `MaxRows` caps both failed live) is fixed at the server seam — `RunViewsWithCacheCheck` no longer offers a differential for subset/aggregate-shaped params, falling back to the same full-refresh path its own validation already uses.

- 6d0ec83: Run registered PreRunView AND PostRunView data hooks on the `RunViewsWithCacheCheck` path (engaged by `CacheLocal` RunViews and directly invokable by clients over GraphQL). It previously executed via `buildWhereClauseForCacheCheck` / `InternalRunView` without applying either hook, silently skipping BOTH halves of the enforcement seam: **PreRunView** (input scoping filters middleware injects into `ExtraFilter`) and **PostRunView** (output data masking / audit of the returned rows). PreRunView now runs once per item before the cache-currency check and every execution leg; PostRunView runs once per row-bearing item at the outbound boundary — after projection, per request, never baked into the shared cache — so rows returned via any leg (fresh query, server-cache serve, or differential) get the same masking the hooked non-cached path applies. `current` items carry no rows (the client keeps its cache, masked when an earlier response populated it). RLS, applied deeper in the provider, was never affected. Both `RunPreRunViewHooks` and `RunPostRunViewHooks` are made `protected` on `ProviderBase` for this sibling pipeline. `RunQueriesWithCacheCheck` is deliberately untouched — there is no `PreRunQuery`/`PostRunQuery` hook seam.
- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [7db8ef5]
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
  - @memberjunction/actions@5.49.0
  - @memberjunction/sql-parser@5.49.0
  - @memberjunction/aiengine@5.49.0
  - @memberjunction/ai-vectors-memory@5.49.0
  - @memberjunction/actions-base@5.49.0
  - @memberjunction/encryption@5.49.0
  - @memberjunction/queue@5.49.0
  - @memberjunction/query-processor@5.49.0
  - @memberjunction/geo-core@5.49.0
  - @memberjunction/sql-dialect@5.49.0

## 5.48.0

### Patch Changes

- 09e1b4b: Fix Apply to my Form (resolve spec code, handle Pending overrides, improve # typeahead), auto-add app schemas to excludeSchemas on OpenApp install/upgrade, surface RenderedSQL through RunQueryResult and TestQuerySQL, strip ORDER BY before outer-wrapping unparseable SQL in MaxRows, fix lazy-config loader variable name collisions in codegen manifest, and add read-only provider support and missing SQL function keywords in PostgreSQL provider
- Updated dependencies [09e1b4b]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/aiengine@5.48.0
  - @memberjunction/ai-vectors-memory@5.48.0
  - @memberjunction/actions-base@5.48.0
  - @memberjunction/actions@5.48.0
  - @memberjunction/encryption@5.48.0
  - @memberjunction/queue@5.48.0
  - @memberjunction/query-processor@5.48.0
  - @memberjunction/geo-core@5.48.0
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
  - @memberjunction/aiengine@5.47.0
  - @memberjunction/ai-vectors-memory@5.47.0
  - @memberjunction/actions-base@5.47.0
  - @memberjunction/actions@5.47.0
  - @memberjunction/encryption@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/queue@5.47.0
  - @memberjunction/query-processor@5.47.0
  - @memberjunction/geo-core@5.47.0
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
  - @memberjunction/aiengine@5.46.0
  - @memberjunction/ai-vectors-memory@5.46.0
  - @memberjunction/actions-base@5.46.0
  - @memberjunction/actions@5.46.0
  - @memberjunction/encryption@5.46.0
  - @memberjunction/queue@5.46.0
  - @memberjunction/query-processor@5.46.0
  - @memberjunction/geo-core@5.46.0
  - @memberjunction/global@5.46.0
  - @memberjunction/sql-dialect@5.46.0
  - @memberjunction/sql-parser@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/aiengine@5.45.1
- @memberjunction/queue@5.45.1
- @memberjunction/ai-vectors-memory@5.45.1
- @memberjunction/actions-base@5.45.1
- @memberjunction/actions@5.45.1
- @memberjunction/encryption@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1
- @memberjunction/query-processor@5.45.1
- @memberjunction/sql-dialect@5.45.1
- @memberjunction/sql-parser@5.45.1
- @memberjunction/geo-core@5.45.1

## 5.45.0

### Minor Changes

- f4f11fa: External Data Sources — read MJ entities and queries directly from remote systems (Snowflake, MongoDB, PostgreSQL) without replicating their data into the MJ database.

  An Entity (or Query) that carries an `ExternalDataSourceID` is proxied live to a remote system through a pluggable driver, then returned through MJ's standard typed `RunView` / `RunQuery` / `Load` APIs. Behavior is fully additive: any entity/query with a null `ExternalDataSourceID` is unchanged and never touches the new code path.
  - **`@memberjunction/core`**: new abstract `ExternalDataSourceReadRouter` — the dependency-inversion seam (`RunViewExternal` / `RunQueryExternal` / `GetCacheTTLSeconds`) that lets foundational providers reach the EDS engine via `MJGlobal.ClassFactory` without any compile-time dependency on driver SDKs or the credential subsystem. `EntityInfo` gains `ExternalDataSourceID` / `ExternalObjectName`. `LocalCacheManager.SetRunViewResult` gains an optional `ttlMs` (with read-time expiry) so external reads can be time-bounded like RunQuery already is.
  - **`@memberjunction/core-entities`**: `ReadOnlyExternalBaseEntity` — `BaseEntity` subclass whose `Save`/`Delete` reject (populating `LatestResult`); MJ is never the system of record for external data.
  - **`@memberjunction/external-data-sources`**: the server-only engine — `ExternalDataSourceReadRouterImpl` (registered for the ClassFactory), `BaseExternalDataSourceDriver` contract, and `ExternalDataSourceRouter` (per-source driver + connection-pool cache, credential resolution). `BaseExternalDataSourceDriver` now provides `withConnectionRetry` — on an auth/credential failure it evicts the cached connection (forcing a fresh credential resolve) and retries the read once, self-healing rotated/expired credentials without a process restart; each driver implements `invalidateConnection`.
  - **Drivers** — `@memberjunction/external-data-source-postgres`, `…-snowflake` (PAT auth; `snowflake-sdk` as an optional peer loaded by dynamic import to avoid AWS-SDK version skew), `…-mongodb` (SQL-`WHERE`→Mongo filter translation, document-sampling introspection). Each wraps its read operations in the auth-retry self-heal and closes the evicted connection on the failure path.
  - **`@memberjunction/generic-database-provider`**: external dispatch for `RunView`, `RunQuery`, and single-record `Load` — guarded by an `ExternalDataSourceID` null check so MJ-DB entities are untouched. Browser/Explorer reads flow through the same provider path, so they route externally transparently. External `RunQuery` results are checked against the query's declared `QueryField` metadata (case-insensitive); when a remote object's columns have drifted, a warning is logged naming the missing field(s) while the rows are still returned (non-fatal, per the plan). External reads (both `RunView` and `RunQuery`) are cached with a TTL sourced from the data source's `DefaultCacheTTLSeconds` — external data can't be event-invalidated, so it's time-bounded instead (mitigating per-query cost on warehouses); external `RunView` writes without a TTL are refused to prevent stale-forever entries. External reads also **refuse rather than silently bypass** Row-Level Security — if RLS would filter a user's rows the read is rejected with a clear error (RLS can't be enforced on a remote system; users exempt from RLS pass through), and the external single-record `Load` primary-key filter single-quote-escapes values to block SQL injection. Unsupported external RunView params (AfterKey/keyset pagination, Aggregates, a non-empty UserSearchString) now hard-fail with a clear error instead of being silently dropped — a dropped AfterKey would otherwise return the same page on every call (an infinite loop in deep-pagination jobs). External read results now run through the same row post-processing MJ-DB reads get (field decryption + datetime normalization), so an Encrypt-flagged external field no longer surfaces as ciphertext.
  - **`@memberjunction/codegen-lib`**: external-backed entities now generate to extend `ReadOnlyExternalBaseEntity` (explicit custom subclasses still take precedence), and CodeGen skips all SQL-object generation (sprocs/views/permissions/FK-indexes) for them since no MJ table exists. GraphQL Create/Update/Delete mutation resolvers are still generated (gated only by `Allow*API`, like any entity) — they route through `entity.Save()`/`.Delete()`, which `ReadOnlyExternalBaseEntity` rejects before any sproc is reached, so an attempted write **fails loudly** with the read-only reason rather than silently lacking a resolver. (No sproc is generated for these entities, but none is ever called.)

  Additional hardening: the Postgres driver now **verifies TLS server certificates by default** (`sslRejectUnauthorized`, opt-out only for knowingly-accepted self-signed dev endpoints) instead of silently accepting any certificate; an unbounded external `RunView` (no `MaxRows`) is capped to the entity's `UserViewMaxRows` or a 1000-row default so a single read can't pull an entire remote table; caller-supplied `ExtraFilter` / `OrderBy` clauses are screened for forbidden SQL keywords before reaching the driver (the same screen the MJ-DB path applies); and a saved **UserView** over an external entity now has its stored `WhereClause` / `OrderByClause` folded into the remote read (previously the external dispatch returned before they were applied, so a view silently returned unfiltered, unordered rows).

  Dispatch-completeness fixes (an audit found read paths that bypassed external routing): CodeGen's PostgreSQL phased executor now skips external entities (it previously regenerated view/CRUD DDL and would `CREATE VIEW` against a non-existent base table); datasets fail loud per-item for external-backed entities rather than querying a non-existent MJ base view; `RunViewsWithCacheCheck` routes external entities to the standard external-dispatch path instead of issuing MJ-DB `COUNT/MAX` validation SQL; and external saved queries skip the outer `RunQuery` `CacheLocal` layer so only the TTL-correct `runExternalQueryWithCache` caches them. Two further validation tightenings: a saved view's merged `WhereClause`/`OrderByClause` is now re-screened for forbidden SQL keywords before reaching the driver, and non-quoted (numeric/boolean) primary-key values in the external `Load` filter are type-checked to block unquoted injection. Read-only is also enforced at the **provider layer** — `DatabaseProviderBase.Save`/`Delete` refuse any external-data-source entity regardless of its generated base class (a backstop for the edge case where an explicit custom subclass replaces `ReadOnlyExternalBaseEntity`). And the SQL drivers are **secure-by-default on transport**: Postgres/MongoDB refuse a plaintext connection to a non-local host unless TLS is enabled or `allowInsecureTransport: true` is explicitly set (local hosts stay exempt for dev).

  The starter `ExternalDataSourceType` catalog now seeds **PostgreSQL, Snowflake, and MongoDB** (all `Active` — the shipped drivers), and a developer guide ships at `guides/EXTERNAL_DATA_SOURCES_GUIDE.md`.

  Two new metadata tables (`ExternalDataSource`, `ExternalDataSourceType`) and additive `Entity` / `Query` columns ship in migration `v5.42`. Validated live end-to-end against real Snowflake and MongoDB. SQL Server as an external source is a deliberate fast-follow. Comprehensive unit tests across the engine, drivers, and CodeGen, plus CI-runnable Postgres/MongoDB driver integration suites.

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
  - @memberjunction/aiengine@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ai-vectors-memory@5.45.0
  - @memberjunction/actions-base@5.45.0
  - @memberjunction/actions@5.45.0
  - @memberjunction/encryption@5.45.0
  - @memberjunction/queue@5.45.0
  - @memberjunction/query-processor@5.45.0
  - @memberjunction/geo-core@5.45.0
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
  - @memberjunction/aiengine@5.44.0
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ai-vectors-memory@5.44.0
  - @memberjunction/queue@5.44.0
  - @memberjunction/actions-base@5.44.0
  - @memberjunction/actions@5.44.0
  - @memberjunction/encryption@5.44.0
  - @memberjunction/query-processor@5.44.0
  - @memberjunction/geo-core@5.44.0
  - @memberjunction/sql-dialect@5.44.0
  - @memberjunction/sql-parser@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [b98366b]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/actions@5.43.0
  - @memberjunction/sql-dialect@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/aiengine@5.43.0
  - @memberjunction/ai-vectors-memory@5.43.0
  - @memberjunction/actions-base@5.43.0
  - @memberjunction/encryption@5.43.0
  - @memberjunction/queue@5.43.0
  - @memberjunction/query-processor@5.43.0
  - @memberjunction/geo-core@5.43.0
  - @memberjunction/sql-parser@5.43.0

## 5.42.0

### Minor Changes

- 9b9b484: Field active-status enforcement relocation, plus the "Meet" app rename, quieter operational logging, and a telemetry suppression refinement.

  **Field active-status enforcement (`@memberjunction/core`, `@memberjunction/generic-database-provider`)**
  - Deprecated-field warnings and disabled-field exceptions are now enforced at the field-access boundary genuine code flows through — `BaseEntity.Get()`, `Set()`, and `SetMany()` (what the generated strongly-typed accessors call) — instead of on the low-level `EntityField.Value` accessor. This flips a leaky blocklist (assert on every `.Value` touch, then suppress at each internal call site) into a precise allowlist, and fixes false deprecation warnings emitted on every load/save of a record that merely _contains_ a deprecated column (e.g. `"MJ: AI Agent Runs".AgentState`) even when no code uses it.
  - New memoized `EntityInfo.HasInactiveFields` fast-path gate: entities whose fields are all `Active` (the vast majority) pay only a single cached boolean check in the hot read/write paths.
  - `EntityField.ActiveStatusAssertions` is retained as a `@deprecated` no-op for backward compatibility; the six now-redundant internal suppression toggles were removed. Warning caller strings are now accurate (`BaseEntity.Get`/`Set`) instead of the misleading `"EntityField.Value setter"`.

  **Telemetry (`@memberjunction/core`)**
  - Suppress "load this into a dedicated engine cache" telemetry suggestions for entities that have explicitly opted out of caching (`EntityInfo.AllowCaching = false`), reusing the existing flag as the single source of truth.

  **Quieter operational logging (`@memberjunction/scheduling-engine`, `@memberjunction/ai-agents`, `@memberjunction/server`, `@memberjunction/server-bootstrap`, `@memberjunction/server-bootstrap-lite`)**
  - Scheduled-job no-op runs (e.g. the Agent Memory Manager finding no new activity) now collapse to the engine's `Starting`/`Completed` heartbeat; the per-agent and memory-manager internal traces are verbose-only.
  - Cleaner server startup logging: transient boot spinner, true total timing, less redundant output, and the `CustomColumnPromoter` registration log demoted to verbose-only.

  **"Meet" app + local LiveKit dev (`@memberjunction/ng-explorer-core`, `@memberjunction/livekit-room-server`, `@memberjunction/auth-providers`, `@memberjunction/server`)**
  - Renamed the Realtime app to "Meet", with the Live Room now defaulting to the Realtime co-agent instead of starting with no agent, plus a local LiveKit dev server and supporting docs.

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [37c73f6]
- Updated dependencies [0c6bf61]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/actions@5.42.0
  - @memberjunction/aiengine@5.42.0
  - @memberjunction/ai-vectors-memory@5.42.0
  - @memberjunction/actions-base@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/encryption@5.42.0
  - @memberjunction/queue@5.42.0
  - @memberjunction/query-processor@5.42.0
  - @memberjunction/geo-core@5.42.0
  - @memberjunction/sql-dialect@5.42.0
  - @memberjunction/sql-parser@5.42.0

## 5.41.0

### Minor Changes

- a5f5472: Remote Browser channel + new realtime voice providers + computer-use enrichment.
  - **Remote Browser channel** (`@memberjunction/remote-browser-*`): an in-house realtime channel where an agent drives a live, CDP-connected browser while it talks (sales demos, support walkthroughs, trainer agents). New `AIRemoteBrowserProvider` registry (migration V202606161000) with JSONType capability gating; a universal `remote-browser-base` (driver family + `RemoteBrowserEngineBase`), a shared `remote-browser-cdp` kit (one lossless action mapper + `CdpRemoteBrowserSession`), a `remote-browser-server` engine + `RemoteBrowserChannel` (control arbiter, control modes AgentOnly/ViewOnly/Collaborative vs strategies ComputerUse/NativeAI), and five thin backends (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).
  - **computer-use** enriched additively into a complete browser-I/O + perception engine: CSS-selector-aware actions, CDP screencast, MouseMove, accessibility-snapshot/QueryElement/GetVisibleText/GetTitle/WaitForLoadState — every consumer benefits, existing vision/coordinate path unchanged.
  - **New realtime model providers**: xAI Grok Voice (`@memberjunction/ai-xai`, OpenAI-Realtime-compatible) and Inworld (`@memberjunction/ai-inworld`), with vendor/model seeds.
  - **Console logging improvements** across `@memberjunction/ai-core-plus`, `ai-engine-base`, `ai-prompts`, `aiengine`, `cli`, `generic-database-provider`, `metadata-sync`, and the bootstrap/forms packages.

### Patch Changes

- 8c8b658: Realtime UX wave 2 — the progressive-disclosure console (pure-audio-first overlay with the breathing hero orb, disclosure levels 0–4 ratcheted per-user via UserInfoEngine, gear density escape hatch, unified app-bar, fused composer dock; content never flips the console open — the one auto-reveal is a channel's first agent activity, finished artifacts arrive as glowing unfocused tabs, Activity tab pinned last); audio-reactive call visuals (BaseRealtimeClient GetAudioActivity capability — per-direction RMS + 9-bin spectrum metered on all four drivers via a shared RealtimePcmPlayback master-gain tap / WebRTC stream analysers — driving the hero + app-bar orbs and a true-spectrum EQ through a zero-CD rAF loop, with turn-state fallback). Whiteboard: OneNote-style PAGES (v2 JSON with tolerant v1 migration, AddPage/SwitchPage/RenamePage agent tools, page strip with inline rename + right-click Rename/Delete/New-page context menus, agent-authored page garnish), multi-select (marquee, shift-click, single-undo group drag/delete), hold-to-zoom, multi-page HTML/SVG export, shared active-page note on all item tools, UUIDsEqual compliance. ElevenLabs: tool-schema sanitizer (non-string enums + leaf descriptions, fingerprint-stable) and the absorbed-tool-result voice nudge. Conversations: shared auto-naming helper + race-free realtime naming lifecycle on SessionStarted$, slide-panel splitter rework, angular-split dependency removed. Plus integration-test script groundwork (server/client/runquery cache suites) and cache-layer fixes carried on this branch.
- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/aiengine@5.41.0
  - @memberjunction/ai-vectors-memory@5.41.0
  - @memberjunction/actions-base@5.41.0
  - @memberjunction/actions@5.41.0
  - @memberjunction/encryption@5.41.0
  - @memberjunction/queue@5.41.0
  - @memberjunction/query-processor@5.41.0
  - @memberjunction/geo-core@5.41.0
  - @memberjunction/global@5.41.0
  - @memberjunction/sql-dialect@5.41.0
  - @memberjunction/sql-parser@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/aiengine@5.40.2
- @memberjunction/ai-vectors-memory@5.40.2
- @memberjunction/actions-base@5.40.2
- @memberjunction/actions@5.40.2
- @memberjunction/encryption@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2
- @memberjunction/queue@5.40.2
- @memberjunction/query-processor@5.40.2
- @memberjunction/sql-dialect@5.40.2
- @memberjunction/sql-parser@5.40.2
- @memberjunction/geo-core@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/aiengine@5.40.1
  - @memberjunction/ai-vectors-memory@5.40.1
  - @memberjunction/actions-base@5.40.1
  - @memberjunction/actions@5.40.1
  - @memberjunction/encryption@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/queue@5.40.1
  - @memberjunction/query-processor@5.40.1
  - @memberjunction/geo-core@5.40.1
  - @memberjunction/global@5.40.1
  - @memberjunction/sql-dialect@5.40.1
  - @memberjunction/sql-parser@5.40.1

## 5.40.0

### Minor Changes

- 43e6c0f: MJ-issued magic-link sessions for external, app-scoped users: passwordless, single-use (or multi-use) invite links that sign external users into MJExplorer confined to one application and a per-link role. MJ issues and validates its own RS256 session tokens (published via JWKS, accepted by the standard auth-provider path), so there's no external IdP dependency or per-user IdP cost. Invite scope (app, role, expiry, max uses) is configured per link, with support for per-invite app/role, resource-scoped RLS sharing, and anonymous sessions — a shared Anonymous principal whose scope rides per-session JWT claims rather than DB roles, so concurrent anonymous visitors can't accrete privileges.

  Also includes two framework changes made along the way:
  - **RunView server-cache RLS fix:** the cache fingerprint now incorporates the per-user Row-Level-Security where-clause, so an RLS-scoped read can no longer be served an unscoped cached result. No-op for users without an RLS filter (byte-identical fingerprint), so normal caching is untouched.
  - **BaseEngine degrades gracefully under restricted roles:** a config load that fails because the current user lacks Read permission is now treated as a permanent condition — the property loads empty and the engine is marked loaded — instead of looping on "not marking as loaded", which previously hung the MJExplorer shell for least-privilege users (e.g. magic-link guests). Only genuinely transient failures (network, server restart) keep retrying.

### Patch Changes

- 804f9f6: Security audit fixes: parameterize SQL queries in GraphQL resolvers to prevent injection, validate entity read permissions on query execution, centralize permission logic in UserCanRun with recursive dependency checks, and fix UUID/multi-provider compliance violations.
- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/aiengine@5.40.0
  - @memberjunction/ai-vectors-memory@5.40.0
  - @memberjunction/actions-base@5.40.0
  - @memberjunction/actions@5.40.0
  - @memberjunction/encryption@5.40.0
  - @memberjunction/queue@5.40.0
  - @memberjunction/query-processor@5.40.0
  - @memberjunction/geo-core@5.40.0
  - @memberjunction/global@5.40.0
  - @memberjunction/sql-dialect@5.40.0
  - @memberjunction/sql-parser@5.40.0

## 5.39.0

### Patch Changes

- eaee99f: fix: re-throw connection errors from RunView/RunQuery instead of swallowing into Success=false

  Preserve mssql ConnectionError type through executeSQLCore so GenericDatabaseProvider can structurally detect infrastructure failures (DB unreachable, pool closed) and re-throw them from InternalRunView and InternalRunQuery. Previously these were silently converted to { Success: false }, making it impossible for callers to distinguish "database is down" from "query returned no results."

- 2d1b4e1: Use `UUIDsEqual()` instead of `===` for the AIModel ID comparison in `searchEntitiesSemanticPass`, fixing the repo-wide UUID-comparison compliance check.
- Updated dependencies [26761b8]
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [a2aecc7]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/actions@5.39.0
  - @memberjunction/core@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/aiengine@5.39.0
  - @memberjunction/ai-vectors-memory@5.39.0
  - @memberjunction/actions-base@5.39.0
  - @memberjunction/encryption@5.39.0
  - @memberjunction/queue@5.39.0
  - @memberjunction/query-processor@5.39.0
  - @memberjunction/geo-core@5.39.0
  - @memberjunction/sql-dialect@5.39.0
  - @memberjunction/sql-parser@5.39.0

## 5.38.0

### Patch Changes

- 6a3ac36: Fix AllowUpdateAPI clearing when EntityField transitions to virtual, use subqueries for organic key INSERTs for portable SQL, prevent permanent engine failure when MJAPI is temporarily unavailable, and centralize RLS exemption check in GetUserRowLevelSecurityWhereClause
- 3d739a3: refactor(sql-parser): instance-based parser with dialect adapters, parse-preprocessing, instance-based count SQL, and a render-pipeline write-statement guard
  - **`SQLParser` is now instance-based** (`new SQLParser(sql, dialect)`). AST inspection/mutation (`IsValid`, `StatementKind`, `HasWriteStatement`, `OuterCap`, `SetOuterCap`, `ClearOuterCap`, `ClearOrderBy`, `ToSQL`) and extraction (`ExtractCTEs`, `ExtractTableRefs`, `ExtractColumnRefs`, `ExtractSelectColumns`) are instance members; pure string/token utilities (`ParseSQL`, `SqlifyAST`, `StripComments`, `Tokenize`, `Analyze`, `HasUnwrappableTrailingClause`, `HasStackedStatements`, the MJ-template helpers, …) remain static.
  - **Dialect-neutral row caps via an internal `ASTDialectAdapter`** (keyed by `ParserDialect`). The exported `SQLOuterCap` (with its `kind: 'top' | 'limit'`) is replaced by `RowCapInfo` with an explicit `form: 'numeric' | 'percent' | 'opaque'` discriminant. The `isSQLServerDialect()` quote-probe and the `dialect.PlatformKey === 'sqlserver'` branch in the row-cap path are gone (`outerWrap` now uses `dialect.LimitClause()`).
  - **Parse-preprocessing fallback** in the constructor: on a direct-parse failure it aliases bracket-quoted identifiers with parser-defeating characters (`[Active People]`, `[my-cte]`) and splits a trailing `OPTION (...)` clause, then restores both on `ToSQL`. This lets Skip-style CTE queries and `OPTION` queries reach the precise AST row-cap path (`TOP N` / `LIMIT N`) instead of the OFFSET/FETCH or outer-wrap fallback.
  - **Instance-based count SQL**: `QueryPagingEngine`'s count builder is unified onto the instance API (`ExtractCTEs` + `ClearOuterCap` + `ClearOrderBy` + `ToSQL`), removing the last `as unknown as Record<string, unknown>` cast and raw AST field pokes from the engine. The count now strips the outer cap on **both** dialects, so a paged query's `COUNT(*)` reflects the full set — fixing a PostgreSQL inconsistency where an explicit `LIMIT` previously yielded a capped count (SQL Server already stripped `TOP`).
  - **Render-pipeline safety guard** (`RenderPipeline.Run`): a rendered query must be a single read statement, enforced by two complementary checks. (1) `SQLParser.HasWriteStatement` (AST) rejects a write _type_ anywhere — DML (INSERT/UPDATE/DELETE/MERGE/REPLACE), DDL (DROP/CREATE/ALTER/TRUNCATE/RENAME), or EXEC/CALL/GRANT/REVOKE/USE — catching single writes and parseable stacked writes (`SELECT 1; DROP TABLE x`). (2) `SQLParser.HasStackedStatements` (token scan) rejects any internal statement-separating `;`, catching stacked payloads that don't parse (`SELECT 1; EXEC xp_cmdshell '…'`, `SELECT 1; WAITFOR DELAY '…'`) — the class an AST scan misses because the whole string fails to parse. Both are precise: the `REPLACE()` string function and parenthesized SELECTs pass, and a single trailing `;` is fine; only genuine multi-statement inputs (including `SET` / `DECLARE` prefixes) are rejected. (The broad dangerous-keyword scan stays on the ad-hoc execution path, where input is untrusted free text.)
  - **`SQLExpressionValidator`**: `FOR` is now allowed in `full_query` context so `FOR JSON` / `FOR XML` queries aren't wrongly rejected (`FOR UPDATE` remains blocked via the independent `UPDATE` keyword).

  No behavior change for already-valid read queries; preprocessing only widens AST coverage, the count fix only affects paged queries that carried an explicit cap, and the guard only rejects writes/stacked statements. All consumers (`queryPagingEngine`, `queryCompositionEngine`, `query-extraction`, `manage-metadata`, `structuralParser`) migrated to the instance API.

- ebb0e3d: Eliminate provider.Refresh() from query save/delete paths, introduce MJQueryEntityExtended with child-relationship getters and business logic, migrate all QueryInfo consumers outside MJCore to use QueryEngine and entity types, remove dead QueryCacheManager, and replace 12 redundant RunView calls with QueryEngine cache reads. Fixes major performance bottleneck on large-entity deployments where every query save reloaded the entire metadata graph.
- Updated dependencies [6b6c321]
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
  - @memberjunction/aiengine@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/sql-dialect@5.38.0
  - @memberjunction/sql-parser@5.38.0
  - @memberjunction/query-processor@5.38.0
  - @memberjunction/queue@5.38.0
  - @memberjunction/actions-base@5.38.0
  - @memberjunction/actions@5.38.0
  - @memberjunction/encryption@5.38.0
  - @memberjunction/geo-core@5.38.0

## 5.37.0

### Patch Changes

- f5531e0: Refactor the SQL render pipeline's row-cap path to be AST-based. Add `SQLParser.StripComments`, a token-aware comment stripper that preserves string literals and quoted identifiers (including SQL Server brackets) and handles nested block comments. Replace the regex-based `applyMaxRows` in `RenderPipeline` with `QueryPagingEngine.WrapWithMaxRows`, which injects `TOP`/`LIMIT` via the AST and falls back to OFFSET/FETCH for parser-unsupported CTE shapes. Throw on `MaxRows + Paging` conflicts instead of silently overriding. Route `AdhocQueryResolver` through `RenderPipeline.Run` so composition macros, templates, and row capping run consistently with saved queries.
- Updated dependencies [1af94d0]
- Updated dependencies [4f15f31]
- Updated dependencies [f5531e0]
  - @memberjunction/actions@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/sql-parser@5.37.0
  - @memberjunction/aiengine@5.37.0
  - @memberjunction/actions-base@5.37.0
  - @memberjunction/encryption@5.37.0
  - @memberjunction/queue@5.37.0
  - @memberjunction/query-processor@5.37.0
  - @memberjunction/geo-core@5.37.0
  - @memberjunction/global@5.37.0
  - @memberjunction/sql-dialect@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/aiengine@5.36.0
  - @memberjunction/actions-base@5.36.0
  - @memberjunction/actions@5.36.0
  - @memberjunction/encryption@5.36.0
  - @memberjunction/queue@5.36.0
  - @memberjunction/geo-core@5.36.0
  - @memberjunction/query-processor@5.36.0
  - @memberjunction/global@5.36.0
  - @memberjunction/sql-dialect@5.36.0
  - @memberjunction/sql-parser@5.36.0

## 5.35.0

### Patch Changes

- 6f083dd: Rewrite `RenderPipeline.applyMaxRows` to inject the row cap (`TOP N` for SQL Server, `LIMIT N` for PostgreSQL) via an AST rewrite instead of a string-anchored regex. CTE queries (`WITH … SELECT …`) and queries whose CTE definitions contain their own `TOP N` now correctly receive the outer cap on the outermost SELECT. Queries that already specify an outermost `TOP` / `LIMIT` are left untouched, and shapes the parser can't represent at the top level (UNION/INTERSECT/EXCEPT, vendor-specific syntax, sqlify round-trip failures) fall back to a `SELECT TOP N * FROM (<original>) AS _capped` wrap.
- aedd4dc: Bubble save SQL composition up to GenericDatabaseProvider as a single orchestrator; SQL Server and Postgres providers now contribute four dialect hooks instead of duplicating the generator. Fixes a PG UPDATE bug where PK wasn't tail appended
- Updated dependencies [6fa8e13]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [7332992]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/geo-core@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/aiengine@5.35.0
  - @memberjunction/actions-base@5.35.0
  - @memberjunction/actions@5.35.0
  - @memberjunction/encryption@5.35.0
  - @memberjunction/queue@5.35.0
  - @memberjunction/query-processor@5.35.0
  - @memberjunction/sql-dialect@5.35.0
  - @memberjunction/sql-parser@5.35.0

## 5.34.1

### Patch Changes

- 3a35358: Surface engine load health in System Diagnostics with per-property success/failure status and error messages, add recovery telemetry to ApplicationManager, cache architecture fixes including schema hash staleness detection, empty result timestamp handling, and timestamp precision tolerance
- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/aiengine@5.34.1
  - @memberjunction/actions-base@5.34.1
  - @memberjunction/actions@5.34.1
  - @memberjunction/encryption@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/queue@5.34.1
  - @memberjunction/query-processor@5.34.1
  - @memberjunction/geo-core@5.34.1
  - @memberjunction/global@5.34.1
  - @memberjunction/sql-dialect@5.34.1
  - @memberjunction/sql-parser@5.34.1

## 5.34.0

### Minor Changes

- cfffb6d: Add keyset (seek) pagination to `RunView` via the new `RunViewParams.AfterKey: CompositeKey` field. Iterating large entities (background jobs, scheduled actions, bulk processing) now stays O(log N) per page regardless of depth — `StartRow`-based OFFSET pagination is unchanged and remains the right choice for UI grids.

  **Framework changes**
  - New `RunViewParams.AfterKey: CompositeKey` accepted by all RunView entry points (TS, GraphQL, REST flows that go through RunView).
  - New exported error class `AfterKeyNotSupportedError` (with `Reason` codes `CompositePK | UnsupportedPKType | IncompatibleOrderBy | StartRowConflict | AfterKeyShape`).
  - New exported helper `IsKeysetPaginationOrderableType(sqlType)` and constant `KEYSET_PAGINATION_ORDERABLE_PK_TYPES`.
  - Keyset queries bypass server cache (read + write) automatically — they're inherently single-use so caching is pure overhead.
  - v1 constraint: single-column PK only. Composite-PK entities throw `AfterKeyNotSupportedError` with `Reason: 'CompositePK'`.

  **Migrated callers (now use keyset by default when entity has a single-column PK)**
  - `ScheduledGeocodingAction` (`processMissingForEntity`) — falls back to OFFSET on composite-PK entities.
  - `VectorBase.PageRecordsByEntityID` + `EntityVectorSyncer.startDataPaging` — auto-promotes to keyset when possible. New helper `VectorBase.CanUseKeysetPagination()`. New optional `PageRecordsParams.AfterKey`.

  **Metadata**
  - `Geocoding Maintenance` scheduled job cron updated to weekly (Saturdays 2 AM UTC); description reworded to not hard-code a cadence. Administrators can adjust the `CronExpression` as needed.

  **Documentation**
  - New guide: `guides/KEYSET_PAGINATION_GUIDE.md`.
  - `CLAUDE.md` performance section updated.

  **Out of scope for v1**
  - `ExternalChangeDetection.ChangeDetector` uses `RunQuery` (saved queries with arbitrary SQL), which the framework can't safely rewrite. Stays on OFFSET; tracked as a follow-up.

  **Backwards compatibility**
  - Fully additive. Existing callers that don't pass `AfterKey` are unaffected.

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
  - @memberjunction/aiengine@5.34.0
  - @memberjunction/actions-base@5.34.0
  - @memberjunction/actions@5.34.0
  - @memberjunction/encryption@5.34.0
  - @memberjunction/query-processor@5.34.0
  - @memberjunction/sql-dialect@5.34.0
  - @memberjunction/sql-parser@5.34.0
  - @memberjunction/geo-core@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/queue@5.34.0

## 5.33.0

### Minor Changes

- 7e4957d: Universal search performance + correctness fix: honor `EntityField.UserSearchPredicateAPI`, escape LIKE metacharacters, add resilience layer, and stop CodeGen from re-introducing invalid search flags.

  **Why:** `LIKE '%term%'` was the only SQL the data provider ever generated for non-FTX entities, regardless of the configured predicate. CodeGen has been populating `UserSearchPredicateAPI` (Exact / BeginsWith / EndsWith / Contains) for months, but the runtime was discarding it. Combined with primary keys, non-text columns, and `nvarchar(MAX)` columns being auto-flagged as searchable, every keystroke against the global search box produced unindexed scans across tables of arbitrary size.

  **`@memberjunction/generic-database-provider`** — `GenericDatabaseProvider.createViewUserSearchSQL` now:
  - Honors `UserSearchPredicateAPI`: `Exact` emits `= N'term'` (index-seekable), `BeginsWith` emits `LIKE N'term%' ESCAPE '\'` (index-seekable), `EndsWith` emits `LIKE N'%term' ESCAPE '\'`, and the default `Contains` emits `LIKE N'%term%' ESCAPE '\'`. `UserSearchParamFormatAPI` still wins when set.
  - Escapes LIKE metacharacters (`%`, `_`, `[`, `]`, `\`) in user input with `ESCAPE '\'`. Previously a query of `50%` was treated as a wildcard.
  - Skips fields that aren't sensible text-search targets (non-text types; unbounded text on non-FTX entities) so an OR'd OR-predicate isn't built around an implicit per-row CONVERT.
  - Emits `N''` Unicode literals throughout to avoid collation surprises.

  **`@memberjunction/core`** — adds `EntityFieldInfo.UserSearchPredicateAPI: string` so consumers see the value the runtime now honors. Default `'Contains'`.

  **`@memberjunction/search-engine`** — Resilience layer:
  - `EntitySearchProvider`, `FullTextSearchProvider`, and `SearchEngine.Search` reject queries shorter than 3 characters early — these always fan out to full-database scans across every searchable entity.
  - `EntitySearchProvider` wraps each per-entity RunView in a 5-second hard timeout. A slow entity no longer holds up the whole fan-out; the other entities' results still land for the user. The underlying SQL keeps running on the server until it finishes (Request cancellation is a follow-up).
  - `SearchEngine.Search` has an in-process LRU result cache keyed by `(userID, query, MaxResults, MinScore, Filters)` with a 30s TTL and 500-entry cap. Preview-mode searches skip the cache. New `ClearResultCache()` admin/test hook.

  **`@memberjunction/codegen-lib`** — CodeGen guardrails so the metadata stays clean:
  - `applySearchableFieldUpdates` now refuses to set `IncludeInUserSearchAPI = 1` on primary keys, non-text columns, or unbounded text columns whose parent entity has `FullTextSearchEnabled = 0`. The LLM can still propose them; CodeGen drops the proposal silently.
  - `applyEntitySearchConfig` refuses to flip `AllowUserSearchAPI` from `0` to `1` on entities whose names match log/audit/run-history patterns (`*Logs`, `*Audit*`, `*Record Changes`, `*Runs`, `*Run Steps/Messages/History`, `*Execution Logs`). It still allows the LLM to _disable_ search on any entity.

  **Migrations (run via Flyway in the same release):**
  - `migrations/v5/V202605041250__v5.33.x__Search_Hygiene_For_Mj_Schema_And_Field_Types.sql` — disables `AllowUserSearchAPI` on 40 `__mj` log / audit / run-history / snapshot entities (Record Changes, Audit Logs, AI Agent + Prompt Runs, Company Integration Runs/Details/API Logs, Error Logs, Action Execution Logs, Test/Workflow/Recommendation/Scheduled/Duplicate Runs, User View Runs/Details, Report Snapshots, Archive Runs/Details, etc.) and clears `IncludeInUserSearchAPI` on PKs, non-text columns, and non-FTX unbounded text columns system-wide. Freezes the corresponding `AutoUpdate*` flags so CodeGen doesn't re-promote any of these silently.
  - `migrations/v5/V202605041300__v5.33.x__EntityField_UserSearchPredicateAPI_Check_Constraint.sql` — adds a trusted CHECK constraint enforcing the four documented values. Defensively normalizes any out-of-band rows to `'Contains'` first.

  **Behavior change to call out:** any caller that previously relied on `%` or `_` in a `UserSearchString` being interpreted as a SQL wildcard will now match those characters literally. There were no such known callers in the MJ ecosystem; this aligns the runtime with the documented contract.

- b0329f6: PG: JSON-arg CRUD sprocs for wide entities + Bug 5 four-pass fix + codegen lookup fixes (#2552)

### Patch Changes

- 74b0be0: Tolerate non-ISO `maxUpdatedAt` values in the smart cache check so a malformed timestamp degrades to a cache miss instead of throwing `Invalid time value`. Also expand the MJAPI GraphQL operation log so nested variables render as truncated JSON instead of Node's `[Object]` placeholders.
- f94ebd6: Fix silent NVARCHAR(4000) truncation in `_escapeFlywaySyntaxInStrings` that corrupted component Specifications with many `${…}` template-literal expressions on Flyway apply. Interleave `CAST(N'' AS NVARCHAR(MAX))` between every split so the concat chain inherits NVARCHAR(MAX) precedence and the full literal value survives.
- 7add405: Lift Flyway placeholder escaping from `SqlLogger` into the `SQLDialect` abstraction. Each dialect now declares its own `EscapeFlywayStringInterpolation` form (SQL Server interleaves a `CAST(N'' AS NVARCHAR(MAX))` to defeat the NVARCHAR(4000) concat cap; PostgreSQL uses a plain `||` split since TEXT has no length cap), so the shared `SqlLoggingSessionImpl` can be used safely across providers without hard-coding T-SQL syntax.
- fad046c: Repair createViewUserSearchSQL.test.ts so its assertions actually run. The test factory was setting EntityInfo's getter-only properties (FirstPrimaryKey, Fields) via Object.assign, which threw TypeError before any assertion executed. Switched to seeding the private \_Fields backing store with a synthetic primary-key field so both getters resolve naturally, and corrected each assertion's parenthesization to match the SUT's actual (defensive, pre-existing) per-field paren wrap.
- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [312fcee]
- Updated dependencies [7e4957d]
- Updated dependencies [7add405]
  - @memberjunction/core@5.33.0
  - @memberjunction/sql-dialect@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/aiengine@5.33.0
  - @memberjunction/actions-base@5.33.0
  - @memberjunction/actions@5.33.0
  - @memberjunction/encryption@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/queue@5.33.0
  - @memberjunction/query-processor@5.33.0
  - @memberjunction/geo-core@5.33.0
  - @memberjunction/sql-parser@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/geo-core@5.32.0
  - @memberjunction/aiengine@5.32.0
  - @memberjunction/actions-base@5.32.0
  - @memberjunction/actions@5.32.0
  - @memberjunction/encryption@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/queue@5.32.0
  - @memberjunction/query-processor@5.32.0
  - @memberjunction/global@5.32.0
  - @memberjunction/sql-dialect@5.32.0
  - @memberjunction/sql-parser@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [84494bb]
- Updated dependencies [9457655]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/aiengine@5.31.0
  - @memberjunction/actions-base@5.31.0
  - @memberjunction/actions@5.31.0
  - @memberjunction/encryption@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/queue@5.31.0
  - @memberjunction/query-processor@5.31.0
  - @memberjunction/sql-dialect@5.31.0
  - @memberjunction/sql-parser@5.31.0
  - @memberjunction/geo-core@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/aiengine@5.30.1
- @memberjunction/actions-base@5.30.1
- @memberjunction/actions@5.30.1
- @memberjunction/encryption@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/queue@5.30.1
- @memberjunction/query-processor@5.30.1
- @memberjunction/sql-dialect@5.30.1
- @memberjunction/sql-parser@5.30.1
- @memberjunction/geo-core@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
- Updated dependencies [216ddc3]
  - @memberjunction/aiengine@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/actions-base@5.30.0
  - @memberjunction/actions@5.30.0
  - @memberjunction/encryption@5.30.0
  - @memberjunction/queue@5.30.0
  - @memberjunction/geo-core@5.30.0
  - @memberjunction/query-processor@5.30.0
  - @memberjunction/global@5.30.0
  - @memberjunction/sql-dialect@5.30.0
  - @memberjunction/sql-parser@5.30.0

## 5.29.0

### Patch Changes

- e02e24e: Query rendering pipeline redesign: fix Bug D (Nunjucks expression inside SQL string literal breaks ORDER BY detection), consolidate duplicated ORDER BY logic into shared analyzer, add RenderPipeline entry point with diagnostic tracing, introduce structural parser and symbol table for composition IR, and integrate SQL dialect objects throughout the parser removing all hardcoded dialect switch statements. SQL comments are now stripped before template evaluation instead of escaped. Production callers (RunQuery, TestQuerySQL) delegate to RenderPipeline. 65+ new tests including recursive CTEs, PostgreSQL dialect variants, and comment-stripping coverage.

  Query dashboard and form UI improvements: replace flat category dropdowns with hierarchical tree dropdowns, default new query category to active folder context, add per-folder create buttons, expose Reusable/CacheEnabled/AuditQueryRuns fields in entity form Details panel, add saving indicator with spinner overlay, fix sub-entity delete by reloading fresh entity copies, and fix tree dropdown not showing pre-selected text for branch-only configurations. Fix extraction pipeline not cleaning up stale Query Fields and Query Entities when extraction produces no results, with 9 regression tests.

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/sql-dialect@5.29.0
  - @memberjunction/sql-parser@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/aiengine@5.29.0
  - @memberjunction/actions-base@5.29.0
  - @memberjunction/actions@5.29.0
  - @memberjunction/encryption@5.29.0
  - @memberjunction/queue@5.29.0
  - @memberjunction/query-processor@5.29.0
  - @memberjunction/geo-core@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/actions@5.28.0
  - @memberjunction/aiengine@5.28.0
  - @memberjunction/actions-base@5.28.0
  - @memberjunction/encryption@5.28.0
  - @memberjunction/queue@5.28.0
  - @memberjunction/query-processor@5.28.0
  - @memberjunction/geo-core@5.28.0
  - @memberjunction/global@5.28.0
  - @memberjunction/sql-dialect@5.28.0
  - @memberjunction/sql-parser@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/aiengine@5.27.1
  - @memberjunction/actions-base@5.27.1
  - @memberjunction/actions@5.27.1
  - @memberjunction/encryption@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/queue@5.27.1
  - @memberjunction/query-processor@5.27.1
  - @memberjunction/geo-core@5.27.1
  - @memberjunction/sql-dialect@5.27.1
  - @memberjunction/sql-parser@5.27.1

## 5.27.0

### Patch Changes

- 4357090: Repair three query composition pipeline regressions surfaced by Skip-Brain, clear test feedback dialog state when switching conversations, strip tag IDs from taxonomy context injected into LLM prompts, exclude in-progress runs from last-run-date lookups, and replace direct UUID equality checks with `UUIDsEqual()` in the AI analytics dashboards to comply with the cross-platform UUID compliance test.
- Updated dependencies [4357090]
  - @memberjunction/sql-parser@5.27.0
  - @memberjunction/aiengine@5.27.0
  - @memberjunction/actions-base@5.27.0
  - @memberjunction/actions@5.27.0
  - @memberjunction/encryption@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/core-entities@5.27.0
  - @memberjunction/global@5.27.0
  - @memberjunction/queue@5.27.0
  - @memberjunction/query-processor@5.27.0
  - @memberjunction/sql-dialect@5.27.0
  - @memberjunction/geo-core@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/aiengine@5.26.0
  - @memberjunction/actions-base@5.26.0
  - @memberjunction/actions@5.26.0
  - @memberjunction/encryption@5.26.0
  - @memberjunction/queue@5.26.0
  - @memberjunction/geo-core@5.26.0
  - @memberjunction/query-processor@5.26.0
  - @memberjunction/global@5.26.0
  - @memberjunction/sql-dialect@5.26.0
  - @memberjunction/sql-parser@5.26.0

## 5.25.0

### Patch Changes

- fc8cd52: Autotagging pipeline with run tracking, retry, and tag merge/delete; taxonomy server-side SQL aggregates; vector sync credential engine integration; search resolver and organic key support; unit test fixes across geo-core, ai-vector-sync, MJServer, and UUID compliance.
- Updated dependencies [fc8cd52]
- Updated dependencies [4f8e980]
- Updated dependencies [d6370e8]
- Updated dependencies [008a62d]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/geo-core@5.25.0
  - @memberjunction/sql-parser@5.25.0
  - @memberjunction/actions@5.25.0
  - @memberjunction/aiengine@5.25.0
  - @memberjunction/actions-base@5.25.0
  - @memberjunction/encryption@5.25.0
  - @memberjunction/queue@5.25.0
  - @memberjunction/query-processor@5.25.0
  - @memberjunction/global@5.25.0
  - @memberjunction/sql-dialect@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/aiengine@5.24.0
  - @memberjunction/actions@5.24.0
  - @memberjunction/actions-base@5.24.0
  - @memberjunction/encryption@5.24.0
  - @memberjunction/queue@5.24.0
  - @memberjunction/query-processor@5.24.0
  - @memberjunction/global@5.24.0
  - @memberjunction/sql-dialect@5.24.0
  - @memberjunction/sql-parser@5.24.0

## 5.23.0

### Patch Changes

- 247df16: Fix server-side RunView cache write asymmetry that caused repeated DB queries during metadata sync, add deterministic Nunjucks template parameter extraction via AST, support comma-delimited multi-value fields in validation, and redesign QueryPagingEngine to append paging directly instead of wrapping in CTEs (fixing ORDER BY on non-projected columns and apostrophe-in-comments bugs).
- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/aiengine@5.23.0
  - @memberjunction/actions-base@5.23.0
  - @memberjunction/actions@5.23.0
  - @memberjunction/encryption@5.23.0
  - @memberjunction/queue@5.23.0
  - @memberjunction/query-processor@5.23.0
  - @memberjunction/sql-dialect@5.23.0
  - @memberjunction/sql-parser@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/sql-parser@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/aiengine@5.22.0
  - @memberjunction/actions@5.22.0
  - @memberjunction/actions-base@5.22.0
  - @memberjunction/encryption@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/queue@5.22.0
  - @memberjunction/query-processor@5.22.0
  - @memberjunction/sql-dialect@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
- Updated dependencies [72fc93b]
  - @memberjunction/core@5.21.0
  - @memberjunction/query-processor@5.21.0
  - @memberjunction/aiengine@5.21.0
  - @memberjunction/actions-base@5.21.0
  - @memberjunction/actions@5.21.0
  - @memberjunction/encryption@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/queue@5.21.0
  - @memberjunction/global@5.21.0
  - @memberjunction/sql-dialect@5.21.0
  - @memberjunction/sql-parser@5.21.0

## 5.20.0

### Patch Changes

- cc954e1: fix: prevent NVARCHAR truncation when escaping Flyway placeholders in long string literals
- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/aiengine@5.20.0
  - @memberjunction/actions-base@5.20.0
  - @memberjunction/actions@5.20.0
  - @memberjunction/encryption@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/queue@5.20.0
  - @memberjunction/query-processor@5.20.0
  - @memberjunction/global@5.20.0
  - @memberjunction/sql-dialect@5.20.0
  - @memberjunction/sql-parser@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/aiengine@5.19.0
- @memberjunction/actions-base@5.19.0
- @memberjunction/actions@5.19.0
- @memberjunction/encryption@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/queue@5.19.0
- @memberjunction/query-processor@5.19.0
- @memberjunction/sql-dialect@5.19.0
- @memberjunction/sql-parser@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [931740a]
  - @memberjunction/sql-parser@5.18.0
  - @memberjunction/aiengine@5.18.0
  - @memberjunction/actions@5.18.0
  - @memberjunction/queue@5.18.0
  - @memberjunction/actions-base@5.18.0
  - @memberjunction/encryption@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0
  - @memberjunction/query-processor@5.18.0
  - @memberjunction/sql-dialect@5.18.0

## 5.17.0

### Patch Changes

- 4b6fd2a: Add composable query passthrough parameter bubbling, deterministic field type resolution from dependency queries and entity metadata, MJLexer-based template variable manipulation, and refactor MJQueryEntityServer into a 5-stage extraction pipeline
- Updated dependencies [4b6fd2a]
- Updated dependencies [9881045]
  - @memberjunction/sql-parser@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/aiengine@5.17.0
  - @memberjunction/actions-base@5.17.0
  - @memberjunction/actions@5.17.0
  - @memberjunction/encryption@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/queue@5.17.0
  - @memberjunction/query-processor@5.17.0
  - @memberjunction/global@5.17.0
  - @memberjunction/sql-dialect@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/aiengine@5.16.0
  - @memberjunction/actions-base@5.16.0
  - @memberjunction/actions@5.16.0
  - @memberjunction/encryption@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/queue@5.16.0
  - @memberjunction/query-processor@5.16.0
  - @memberjunction/global@5.16.0
  - @memberjunction/sql-dialect@5.16.0
  - @memberjunction/sql-parser@5.16.0

## 5.15.0

### Patch Changes

- 5e85b29: Fix nested WITH syntax error by hoisting inner CTEs from dependency queries, and disable External Change Detection scheduled job to prevent OOM crash-restart cycles
- d01f697: MJ SQL Parser: unified parser for SQL + Nunjucks templates + composition tokens. Replaces fragmented regex-based SQL parsing across 6 packages with a single MJSQLParser class providing AST-based tokenization, placeholder substitution, CTE extraction, ORDER BY remapping, and deterministic parameter/field extraction. Moves QueryPagingEngine from MJCore to GenericDatabaseProvider with AST-based paging. Fixes backtick quoting, table-qualified ORDER BY remapping, trailing semicolon, and FOR XML parsing bugs.
- Updated dependencies [662d56b]
- Updated dependencies [5e85b29]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/sql-parser@5.15.0
  - @memberjunction/aiengine@5.15.0
  - @memberjunction/actions-base@5.15.0
  - @memberjunction/actions@5.15.0
  - @memberjunction/encryption@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/queue@5.15.0
  - @memberjunction/query-processor@5.15.0
  - @memberjunction/global@5.15.0
  - @memberjunction/sql-dialect@5.15.0

## 5.14.0

### Patch Changes

- 69b5af4: Add TestQuerySQL resolver and client method for query execution testing, refactor CreateQueryResolver into QuerySystemUserResolver composing CodeGen-generated MJQuery\_ types, add lightweight query catalog for collision detection, unit tests for transitive template composition and ORDER BY stripping, and updated class registration manifests
- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/query-processor@5.14.0
  - @memberjunction/actions-base@5.14.0
  - @memberjunction/actions@5.14.0
  - @memberjunction/aiengine@5.14.0
  - @memberjunction/encryption@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/queue@5.14.0
  - @memberjunction/global@5.14.0
  - @memberjunction/sql-dialect@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/aiengine@5.13.0
  - @memberjunction/actions-base@5.13.0
  - @memberjunction/actions@5.13.0
  - @memberjunction/encryption@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/queue@5.13.0
  - @memberjunction/query-processor@5.13.0

## 5.12.0

### Minor Changes

- 05f19ff: Add composable query system with semantic catalog search, CTE composition engine, server-side paging, query caching with TTL/dependency invalidation, and agent directive surfacing. Includes QueryCacheManager wrapper over LocalCacheManager, QueryPagingEngine for SQL-level OFFSET/FETCH paging, QueryCompositionEngine for platform-aware CTE generation, and SearchQueryCatalog action for vector-based query discovery. Renames PaginationComponent to DataPagerComponent and extracts into shared module.

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/aiengine@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/actions-base@5.12.0
  - @memberjunction/actions@5.12.0
  - @memberjunction/encryption@5.12.0
  - @memberjunction/queue@5.12.0
  - @memberjunction/query-processor@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Minor Changes

- a4c3c81: migration/metadata

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/query-processor@5.11.0
  - @memberjunction/aiengine@5.11.0
  - @memberjunction/actions-base@5.11.0
  - @memberjunction/actions@5.11.0
  - @memberjunction/encryption@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/queue@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/aiengine@5.10.1
- @memberjunction/actions-base@5.10.1
- @memberjunction/actions@5.10.1
- @memberjunction/encryption@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/queue@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/aiengine@5.10.0
  - @memberjunction/actions-base@5.10.0
  - @memberjunction/actions@5.10.0
  - @memberjunction/encryption@5.10.0
  - @memberjunction/queue@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Minor Changes

- 194ddf2: Add Redis-backed ILocalStorageProvider with cross-server cache invalidation via pub/sub

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/aiengine@5.9.0
  - @memberjunction/actions-base@5.9.0
  - @memberjunction/actions@5.9.0
  - @memberjunction/encryption@5.9.0
  - @memberjunction/queue@5.9.0

## 5.8.0

### Patch Changes

- 064cf3a: Make API key generation configurable via mj.config.cjs, fix codegen TVF sync and EntityRelationship deduplication, fix SQL logger post-processing, preserve version range prefixes in CLI bump command, and fix SkipProxyAgent crash on error responses
- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/aiengine@5.8.0
  - @memberjunction/actions-base@5.8.0
  - @memberjunction/actions@5.8.0
  - @memberjunction/encryption@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/queue@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/aiengine@5.7.0
  - @memberjunction/actions@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/queue@5.7.0
  - @memberjunction/actions-base@5.7.0
  - @memberjunction/encryption@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/aiengine@5.6.0
  - @memberjunction/actions-base@5.6.0
  - @memberjunction/actions@5.6.0
  - @memberjunction/encryption@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/queue@5.6.0
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
  - @memberjunction/aiengine@5.5.0
  - @memberjunction/actions-base@5.5.0
  - @memberjunction/actions@5.5.0
  - @memberjunction/encryption@5.5.0
  - @memberjunction/queue@5.5.0

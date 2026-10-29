# @memberjunction/search-engine

## 6.2.0-edge.6

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

- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [e8e6cd6]
- Updated dependencies [142d524]
- Updated dependencies [0ff7523]
- Updated dependencies [f7d5ab5]
- Updated dependencies [a65dfb8]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [1141164]
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
- Updated dependencies [c4645bc]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/aiengine@6.2.0-edge.6
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/ai-vectordb@6.2.0-edge.6
  - @memberjunction/ai-prompts@6.2.0-edge.6
  - @memberjunction/storage@6.2.0-edge.6
  - @memberjunction/tag-engine-base@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- 0cc6b08: Storage permissions: close the gaps a review found around `StorageAccessEvaluator`. The rules, in one place:
  - **Account gate everywhere.** Every path that acts on a storage account for a user asks `StorageAccessEvaluator` first — the GraphQL storage routes, and now the File Storage core actions (Get Download URL, Get Object, Get File Content, Get Metadata, List Objects, Search Storage Files, Object/Directory Exists need `Read`; Get Upload URL, Copy, Move, Delete Object, Create/Delete Directory need `Write`), `List Storage Accounts` (lists only accounts the caller may read) and `BaseFileHandlerAction` (`Write` on the account a save lands in; reads go through the file-ID gate). These actions are reachable by any user through `RunAction` and by any agent. An unknown account name and a refused account return the same `ACCESS_DENIED` result. Zero permission rows on an account still means open (the current product rule, unchanged).
  - **File-ID routes gate the account the row resolves to.** `FileStorageEngine.ResolveFileObject` (new) resolves an `MJ: Files` row's provider to its account, requires the caller's access on it, and applies the tracked-file rule to the row's object. `DownloadUrl`, `GetFileContents`, `CreateMediaAccessToken`, `DeleteFile` and the `UpdateFile` rename (`Write`), `ArtifactFileDownloadUrl`, the conversation-attachment blob store, the agent file handler and `ReadRealtimeRecordingFile` use it, so a row whose `ProviderKey`/`Name` aliases another row's object is refused.
  - **Tracked-file rule.** An object backing an `MJ: Files` row may be read, signed, listed, returned by search, overwritten, moved, copied or deleted only when the caller can read that row (the minimum for a write; `CanWrite` is still required). Applied to the Get Object / Get File Content / Get Metadata / Get Download URL / Get Upload URL / Copy / Move / Delete Object actions, `CreatePreAuthDownloadUrl`/`CreatePreAuthUploadUrl`, `DeleteStorageObject`, `MoveStorageObject` and `CopyStorageObject` (source and destination), `CopyObjectBetweenAccounts` (both ends), `UploadFile` (before `PutObject`), and as a filter on `ListStorageObjects`, `SearchAcrossAccounts`, the List Objects / Search Storage Files actions and `SearchEngine`'s storage hits.
  - **Key canonicalization.** Client and stored keys go through one canonicalizer, `FileStorageBase.NormalizeObjectKey` (default: trim, collapse repeated `/`, strip leading/trailing `/`; S3 overrides it to strip its key prefix the way it addresses keys), and are compared case-insensitively (`LOWER(...)` in SQL). Keys with a `.`/`..` segment, a backslash, a percent-encoded `/`, `\`, `.` or control character, or a raw control character are refused outright.
  - **One object-key rule.** `StorageObjectKeyOf` (new) resolves an `MJ: Files` row to `ProviderKey`, or `Name` when `ProviderKey` is null or empty; the tracked-file lookup, `ResolveFileObject`, the file resolver and the conversation-attachment blob store all use it, so a row stored with an empty `ProviderKey` is checked under the same key it is served from.
  - **Cache refresh on a miss runs as the system user.** `FileStorageEngine.RefreshAfterMiss` (new) reloads the account cache as the MJ system user; `ResolveFileObject`, `GetDriver`, `UploadFile`, the file resolver and the realtime recording store use it instead of a forced `Config` as the caller, which emptied the shared cache for everyone when the caller could not read `MJ: File Storage Accounts`. `GetFileContents` reads a row with no `ProviderKey` from its `Name`, as the other file routes do.
  - **No truncation.** Every evaluator read sets `IgnoreMaxRows`, so the entity row cap can no longer drop an account's rows (which read as "zero rows → open") or a tracked file's row; lookups are batched.
  - **Azure pre-authenticated URLs** are blob-scoped service SAS tokens (`r` to download, `cw` to upload) instead of account-wide SAS tokens; expiry is unchanged (10 minutes).
  - **`MJ: Files` storage location is server-owned on existing rows.** `MJFileEntityServer` refuses a save that changes `ProviderID` or `ProviderKey` on an existing row (including `ReplayOnly`) unless trusted server code sets `AllowStorageLocationChange` (registered in both server-bootstrap class manifests). A new row may still carry a client-chosen `ProviderKey` (Explorer's direct-upload path registers its upload that way); the routes' gate above is what makes such a row harmless.
  - **Search details.** `SearchAcrossAccounts` reports accounts in request order and withholds `totalMatches`/`nextPageToken` once hits are dropped; under an `Audience` storage hits are dropped (re-checked for the caller only; per-reader storage checks are a follow-up). `ListStorageObjects` reads the typed `Configuration` property.

  Also fixed: the `List Storage Providers` action could never run. Its class was registered as `List Storage Accounts`, which no metadata row names; it is now registered under the shipped action's `DriverClass`, `List Storage Providers`.

- 0cc6b08: Pre-execution RAG now applies the same scope-permission gate as the Scoped Search action and the GraphQL resolver. Before searching one of an agent's assigned scopes it resolves the effective `SearchScopePermission` for the acting user, with the agent as principal and the run's tenant, and requires a level above `Read`. Requested and persisted conversation skills are already active when pre-execution RAG runs, so the run's skills are passed in as well: when exactly one skill is active it is a second principal, as in the action, so its `SearchScopeAccess` can refuse a scope (`SkillNone`, `SkillAssignedNotListed`) and it is stamped as `AISkillID` on the search and on any `Forbidden` row; when several are active, none is passed. A sub-agent receives the root run's active skills, as it does for the action, so a sub-agent that cannot activate the root's lone active skill has its pre-execution scopes refused (`PrincipalNotActivatable`). Previously every assigned scope was searched for every user before the first tool call — the one scoped search path that never consulted scope permissions.

  A refused scope is skipped (the others still run) and written as one `Forbidden` row in `MJ: Search Execution Logs`, its reason truncated to the column's 500 characters; the console line is verbose-only. A resolver failure skips that scope with a logged error and writes no `Forbidden` row, as the action and the GraphQL resolvers do. A turn with no query text (an empty or multimodal last message on a scope without a query template) skips the scope before the gate, so it neither resolves a permission nor logs a `Forbidden` row with an empty query.

  **Behaviour change for existing configurations.** An agent whose `SearchScopeAccess` is `None` (the column default) no longer gets pre-execution retrieval, and an `Assigned` agent's scopes now need a `MJ: Search Scope Permissions` grant at `Search` or `Manage` for the acting user or one of their roles (or the agent set to `All`), exactly as the Scoped Search action already required. Deployments that attached pre-execution scopes without setting the agent's access or granting the scope will see retrieval stop, with a `Forbidden` row per scope explaining why.

  **Known resolver behaviour, inherited.** For an agent set to `All`, a user or role grant at `Read` on a scope is found before the agent's `All` fallback, so the resolver returns `Read` and the scope is refused: adding a `Read` grant removes pre-execution retrieval of that scope for the users it covers. The Scoped Search action and the GraphQL resolvers behave the same way.

  The agent form and the Knowledge Hub scope-permission grid now say that `Assigned` needs a Search grant for the user or one of their roles, and that pre-execution scopes are searched only for users who may search them. The integration fixture `IT: Integration Test Scope` gains `Search` grants for the `UI`, `Developer` and `Integration` roles, so the scope is searchable by any `UI`-role user wherever the integration fixture is pushed. A new deterministic integration test, `IT117 - Agent Pre-Execution RAG Permission Gate`, runs pre-execution RAG directly (no model) for a permitted run and a refused one.

- 0cc6b08: `SearchParams.Audience` lets a caller name the other people who will see a search's results. When set, the engine runs its permission safety net (entity read, row filters, ownership) once for the caller and once per reader, concurrently, and keeps only the results every reader may read, so a shared conversation's results are the intersection of what its participants may see. The audience is part of the result-cache key, so a search the caller ran alone is never served to a room, nor the reverse. Nothing changes for callers that pass no audience.

  Every reader must be a hydrated `UserInfo` with a non-empty `ID` and a `UserRoles` array. A malformed audience (`Readers` not an array, a `null` reader, a reader with no `ID` or no `UserRoles` array) fails the search with a "SearchEngine: invalid Audience" error instead of being skipped. `UserRoles: []` is legitimate and reads nothing.

  Limits, matching the `SearchParams.Audience` docs and the Search Scopes guide:
  - `storage-file` results are refused under an audience (their permissions are evaluated for the caller only).
  - `streamSearch` `provider` events carry `results: []` under an audience (progress only); results reach the room through `fused`/`final`.
  - Scope entitlement (`SearchScopePermission`), `ServerDerived` dimensions, scope `ExtraFilter`/`MetadataFilter` templates and vector push-down are evaluated for the caller only: hosts must check each reader's scope permission themselves.
  - `SourceCounts` are counted before the permission and audience passes, so they reveal the caller's unfiltered reach.
  - The result cache keys on reader IDs, so within its 30 s TTL a differently hydrated reader with the same `ID` gets the cached verdict.

- 0cc6b08: Search review fixes for bounded scopes and provider trust. Each changes behaviour.

  **A content item promoted to its origin record is held to that record's lane bound.** A `MJ: Content Items` hit derived from an entity record is promoted to that record. Promotion used to run once, after cross-scope fusion, after every lane `ExtraFilter` check. So a vector hit on a content item could become a row of a bounded entity (for example `Contacts` bounded by `OrganizationID`) from outside the bound. For a scoped search, promotion now runs per scope, between two lane checks: the content-item hit is checked against a Content Items lane, then the promoted hit against the origin entity's lane. A promoted hit is never exempt, whichever provider found it. Unscoped and global searches still promote after fusion, and nothing is promoted twice.

  **A promoted hit is verified, not trusted.** It keeps its `ProviderId` for attribution. The new `SearchResultItem.PromotedFromContentItemID` marks it, and the permission pass then verifies the origin row with `PK IN (...)`. A stale document can name an origin record that no longer exists; that hit is now dropped.

  **A provider declares the lane kinds it reads.** New `BaseSearchProvider.ConsumesLaneKinds` (`'ExternalIndex'`, `'Entity'`, `'StorageAccount'`). Every shipped provider sets it. The default is `['ExternalIndex']`, because a third-party provider serves an index of its own `IndexType`. **A custom provider that reads entity or storage lanes must override it, or a scoped search will not call it.** A non-global scope now calls only the listed providers that are configured, available, and have an active lane of a kind they read. A provider whose lane kinds are all empty in a scope is not called, so an older provider that tests `ExternalIndexes?.length` cannot fall back to its default index. `ExplainScope` and the logged scope decision apply the same rule. A `Semantic` (vector) provider row over entity lanes only, as the guide's example used to show, is now reported `Reachable: false` with a diagnostic; before, the dry run said reachable and the search returned nothing. A provider row naming no configured or available provider is reported the same way.

  **`ExplainScope` no longer calls a scope reachable when a lane is broken.** A real search refuses on the first unusable lane. The dry run used to mark that lane `Skipped` and still report the scope reachable through its other lanes. A non-global scope with any skipped lane is now `Reachable: false`, with the diagnostic "a real search would be refused".

  **The lane `ExtraFilter` exemption is a provider capability.** New `BaseSearchProvider.AppliesLaneExtraFilter`, set only by `EntitySearchProvider`, replaces the `instanceof EntitySearchProvider` check. It and `ResultsAreRowsOfLabelledEntity` are both read from the provider the engine stamped on the result. A subclass inherits both and must override them if it changes `Search`.

  **Smaller fixes.**
  - The `path` escaper refuses a value that is `..` or `.`, judged after control characters are stripped. A value that only contains `..`, such as `Acme..Inc`, is kept. `/` and `\` are refused as before.
  - An unresolvable scope's explanation reports `Entitlement.Source: 'ScopeUnresolvable'` (new `EntitlementSource` type) instead of `'NoGrant'`. `SummarizeExplanation` says the scope was refused, not "legacy scope" or "NONE CONFIGURED".
  - A refused search's `MJ: Search Execution Logs` row names the first unresolved scope that has a row, or no scope. Before, it could name a valid scope that was searched beside a missing one.
  - `ScopeConstraints` documents the `[]` versus `undefined` contract on each lane field.

- 0cc6b08: Search results derived from another MJ record are now kept only when the user may read that record. After a content item or chunk passes the entity-level ownership and row-filter check, `SearchEngine` follows it to its `MJ: Entity Record Documents` row (through the root item for a split child, always read via the base `MJ: Content Items`) and verifies the origin record under the origin entity's own permissions and row filters. Content with no Entity Record Document, and every non-content entity, is unaffected in outcome. The gate is the protected `VerifyOriginRecords` hook, so a host can extend it to other derived-content families; it fails closed, scoped to the rows that depended on a failed hop.

  **New requirement for who may see content hits.** The walk runs as the user, so anyone who should see chunk hits now needs read on `MJ: Content Items` (not only on the chunks), and anyone who should see hits derived from a record needs read on `MJ: Entity Record Documents`. Without those, chunk hits are dropped (all of them, for the item hop) or the document-bearing ones are (for the document hop). Field-level security that denies one of the link columns counts as a failed hop, so it drops those rows too rather than passing them as "no origin". Deployments whose users read chunks under a filter that never reached items should add the item grant.

  **Cost.** The hops are sequential `PK IN (...)` reads: a chunk group does up to four (chunks, items, root items, documents) plus one view per origin entity, issued together in one `RunViews` batch; an item group up to three plus that batch; crawled chunk content two. Origin-gate removals are logged separately (`origin-record gate removed N result(s)`), so the residual-filter count still means "push-down is incomplete".

  **Behaviour change for every entity: prefixed record ids are now read, not dropped.** The late permission check parses each result's `RecordID` as a key segment, so a result whose `RecordID` is a prefixed `PK|value` segment (what `CompositeKey.ToRecordID()` writes) is checked against its value and kept when readable. Before, `ID IN ('ID|value')` could never match and such results were dropped as unauthorized; this fixes that over-strict dropping. A composite-key segment that names a field which is not a primary key of the entity is dropped, and never reaches the SQL.

- 0cc6b08: A search scope can now declare its own permission over-fetch multiplier in `ScopeConfig.permissionOverfetchFactor` (the guide already listed the key; nothing read it). The engine resolves the factor as the caller's `SearchParams.PermissionOverfetchFactor`, else the largest factor across the resolved scopes (a scope that declares none counts as the engine default, so one scope's low factor never lowers a neighbour's), else the engine default (2), and holds it to 1–20 whatever the source. The factor is resolved after the result-cache lookup, and `streamSearch`'s per-provider partial events are capped to the caller's `MaxResults`, so a larger factor cannot multiply what a stream client is shown before the permission pass. A scope whose lanes are trimmed heavily by late permission checks can ask providers for more candidates without every caller having to know to pass the parameter. Also fixed: a non-finite caller value or engine default (`NaN`, `Infinity`) used to flow through `??` into the provider `topK`; it is now treated as absent. Scopes that declare nothing behave as before, and so do callers passing a value within 1–20; a caller value above 20 is now clamped to 20, and a numeric string is now ignored rather than coerced (no caller in the repository passes one).
- 0cc6b08: Three search trust fixes. Each changes behaviour.

  **External-index hits are always verified against the entity they name.** The permission pass used to skip its ownership check for any result labelled `SourceType: 'entity'` or `'fulltext'` when no row filter applied. Every shipped external-index provider (Azure AI Search, Typesense, Elasticsearch, OpenSearch) labels its hits `'fulltext'`, with the index name as `EntityName` and the document's own id as `RecordID`. So a document in an index named after an entity the user can read was admitted as that entity's row without being checked. A third-party provider could also label its hits `'entity'`. Trust now follows the provider the engine stamped on the result (`ProviderId`), never the label. The new `BaseSearchProvider.ResultsAreRowsOfLabelledEntity` flag (default `false`) is set only by `EntitySearchProvider` and `FullTextSearchProvider`, which read the entity through `RunView`. Every other result is verified, including one with no `ProviderId` and one whose `ProviderId` names no configured provider. Fusion and dedup keep each result's `ProviderId` paired with its own `EntityName`, `RecordID` and `SourceType`, so a merge never upgrades an external hit to trusted. A merge can still lend a result another item's scores: dedup merges items sharing `EntityName` + `RecordID`, but per-scope RRF merges `ScoreBreakdown` across items that share only a `RecordID`, of any entity. A `MJ: Content Items` hit promoted to its origin record is always verified: its provider never read that row. Cost: one `PK IN (...)` read per labelled entity for each search that returns external-index hits. Hits whose document id is not the MJ primary key of the labelled entity are dropped. The entity and full-text lanes cost nothing extra.

  **Naming a scope that cannot be resolved no longer widens the search to a global one.** An inactive, expired or missing scope in `SearchParams.ScopeIDs` used to be skipped. A search whose scopes were all skipped then ran with no scope at all. The GraphQL paths let a caller with a grant on a dead scope do this, because the scope permission check does not look at scope status. Now, if any named scope cannot be resolved, the search is refused: `Success: false`, an error naming the scope, a `LogError`, a `Failure` row in `MJ: Search Execution Logs`, and no provider runs. One dead scope among several also refuses the search, because dropping it silently would change what the caller asked for. The check runs before the result cache. `ExplainScope` agrees with the search. It now reports an inactive or expired scope as unreachable, by name; before, it explained one as searchable. When one requested scope cannot be resolved, it reports every scope in that dry run as unreachable, with the reason.

  **Streamed `provider` events carry counts only.** `streamSearch` used to put each provider's hits on its `provider` event, before the permission pass. That included rows the caller's row filters would drop, unverified external-index hits, and content whose origin record the caller may not read. `SearchKnowledgeStreamResolver` published those hits to the client. A `provider` event now carries `providerName`, `durationMs` and a new `resultCount` (the provider's hit count, capped at `MaxResults`). `results` is always `[]` and is deprecated. Results arrive only in `fused` and `final`. The GraphQL `SearchStreamNotification` gains `ResultCount` and always sends `Results: []` on a provider event, whatever the engine hands it. `GraphQLSearchClient.StreamSearch` requests `ResultCount` (new exported type `SearchStreamClientEvent`). `SearchService.StreamSearch` forwards it. The search overlay, the search results page and the scope form preview now show each provider's count from it, and render rows from `final` only. Pre-execution RAG's streaming trace and the Scoped Search action's `ProgressEvents` report `resultCount`. Like `SourceCounts`, `resultCount` is counted before the permission and audience passes, so don't show it to a room. This replaces the audience-only withholding of partials. Because a newer client requests `ResultCount`, its stream subscription fails against an older server. The reverse also shows: an older client counts each provider's `Results`, which a newer server always sends empty, so its per-provider chips show 0 until the client is upgraded. Search results themselves are unaffected.

  New deterministic integration bundle `IT118 - Search Provider Trust and Unresolvable Scopes` (`search-provider-trust`, SPT1–SPT2).

- 0cc6b08: A `required` scope dimension that resolves to nothing — an expansion query with no rows, an empty caller set, a blank string, `null` — now refuses the search with a `ScopeDimensionError`, the same way a narrowing that meets to nothing already did. Previously only an _unresolved_ (`undefined`) required dimension was refused, so an empty bound passed through to the lane templates; under the `{% if x | length %}` idiom an empty set removes the clause, and a template without an `{% else %}` then ran unbounded. Dimensions explicitly declared `inheritanceMode: 'cascading'` (where empty is meaningful; their template must carry an `{% else %}<column> IS NULL` branch, as the guide now says) and dimensions that are not `required` are unaffected. The message says whether the caller sent an empty value, the declared `defaultValue` is empty, or nothing is reachable for the user, so an agent that sent an empty argument is told to fix its call rather than that the user has no access. Behaviour change to note: a user whose bound is legitimately empty now gets a refused search (an error result) rather than an empty success — or a widened one, where the template dropped the clause — and in a multi-scope search that refusal fails the whole call, as every `ScopeDimensionError` already does.
- 0cc6b08: A scoped search is now bounded by its scope's rows. An empty configuration means "nothing", never "everything". These are behaviour changes.

  **A non-global scope runs only its enabled provider rows.** A scope with no enabled `MJ: Search Scope Providers` row used to run every provider, so disabling a scope's last provider row widened it to all of them. It now runs no provider and returns nothing. Its scope decision (`SearchExecutionLog.ScopeDecisionJSON`) is `Reachable: false` with a diagnostic, and `ExplainScope` reports the same. **Scopes that relied on "no provider rows means all providers" now return nothing until rows are added.** A non-global scope with no lanes at all also reaches nothing now (`Reachable: false`, `Unbounded: false`). `Unbounded` is now true only for a global scope with no lanes. Global scopes, and searches with no scope, are unchanged.

  **An empty lane list means no results from that provider.** For a non-global scope, `ScopeConstraints.Entities`, `ExternalIndexes` and `StorageAccounts` are now `[]` rather than `undefined` when the scope has no rows of that kind. A provider reads `[]` as "nothing for me" and returns without querying. `undefined` still means unscoped. The changes by provider:
  - The entity, full-text and tag providers search nothing without entity lanes. They used to search every searchable entity.
  - The vector provider searches nothing without `Vector` index rows. It used to search every index, unfiltered.
  - Elasticsearch, OpenSearch, Typesense and Azure AI Search query nothing without rows of their own `IndexType`. They used to fall back to the configured default index with no scope filter, and now use it only for unscoped searches.
  - The storage provider searches nothing without storage lanes. It used to search every account.
  - `BaseSearchProvider.ScopedExternalIndexRows()` gives custom providers the same rule.

  **A lane `ExtraFilter` now applies to every provider's hits for that entity.** Before, only the entity provider applied it. Full-text, tag, vector and 3rd-party hits for the entity are now kept only when the record satisfies the same rendered filter. The engine checks this as the user, with one `PK IN (...) AND (<ExtraFilter>)` RunView per filtered entity per scope, and drops those hits if the check fails. Hits from a provider declaring the new `BaseSearchProvider.AppliesLaneExtraFilter` (only `EntitySearchProvider`) are exempt because that provider already applied the filter. The engine identifies the provider by the `ProviderId` it stamps on each result, not by the declared `SourceType`. **Scopes that configured only an entity lane now return less from other providers.** For a scoped search, `SearchResult.SourceCounts` and the log row's `ProvidersJSON` are counted after this step, while a streamed `provider` event's `resultCount` is counted before it, so the two can differ.

  **A storage lane's `FolderPath` now restricts, and refuses rather than widens.** The search is refused with an error, and `ExplainScope` marks the lane `Skipped` and the scope unreachable, when the FolderPath:
  - renders empty (before, the whole account was searched);
  - renders an empty segment, e.g. `clients/{{ context.X }}` with X absent renders `clients/`, every client's folder;
  - contains a `..` segment.

  The `path` escaper (`EscapePathSegment`) now refuses a value that is `..` or `.`, or contains `/` or `\`. It used to strip `..` and separators, so `..` became nothing and `../other` became `other`. A value that only contains `..`, such as `Acme..Inc`, is an ordinary segment and is kept. The renderer throws only when such a value is actually interpolated into the path. **FolderPath templates that render empty now fail loudly instead of widening.**

  **Restoring the old breadth (optional data step).** A non-global scope that should keep its old reach needs the rows added explicitly: one enabled `MJ: Search Scope Providers` row per provider it should run, and the external-index and storage lanes those providers should search. No migration is needed.

- 0cc6b08: Storage search permissions are now evaluated per search instead of from a startup snapshot. `StorageSearchProvider` no longer loads every `MJ: File Storage Account Permissions` row once under whichever user configured the engine first (a failed load used to open every account to every user until restart); it asks `StorageAccessEvaluator` for the searching user on every search, and reads the searchable accounts from `FileStorageEngine`'s live cache. `SearchEngine`'s late permission filter no longer passes `storage-file` results through: a storage hit is kept only when its engine-stamped `ProviderId` belongs to a `StorageSearchProvider` and its account is readable by the user now, so a `storage-file`-typed hit from any other provider is dropped, as is one that cannot be attributed or evaluated.
- Updated dependencies [0d81c53]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [52b9fd5]
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
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [cd39c95]
- Updated dependencies [2274f42]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [230cdad]
- Updated dependencies [7e72c86]
- Updated dependencies [4e4c82d]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [8420f36]
- Updated dependencies [72dd65c]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [0cc6b08]
- Updated dependencies [03c085c]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/ai-prompts@6.2.0-edge.5
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/aiengine@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/storage@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/ai-vectordb@6.2.0-edge.5
  - @memberjunction/tag-engine-base@6.2.0-edge.5

## 6.2.0-edge.4

### Minor Changes

- f2f6f4b: Search now ranks multi-source results by Reciprocal Rank Fusion end to end, and applies `MinScore` before fusion.
  - **Order:** `SearchFusion.Deduplicate` used to raise each fused score to the max raw `ScoreBreakdown` value and re-sort, which threw away the RRF order (and a reranker's). An exact keyword match, such as a person's full name, ranked below every semantic near-miss. The RRF order is now kept.
  - **`Score`:** the RRF score divided by its maximum (Σ weights of the lanes that returned results / (k + 1), k = 60), in [0, 1]. 1.0 means every such lane ranked it first. It is rank-based, not a confidence. Each provider's raw score stays in `ScoreBreakdown`.
  - **One ranked list per embedding model:** the vector provider used to glue each embedding model's results together unsorted, and RRF now relies on lane order. Each model's results are sorted by its own scores and tagged with a `FusionLane`, and fusion ranks each lane as its own RRF list. Models are merged by rank, never by comparing cosine values on different scales.
  - **Identity:** fusion keys results by `EntityName` + `RecordID` (integer IDs no longer merge across entities) and counts a record once per lane, so `Score` stays within [0, 1].
  - **`MinScore`:** a floor on the semantic (vector) lane's own similarity, applied before fusion and to streamed per-provider results. Keyword, full-text, tag and storage hits have no numeric floor, and the fused `Score` is no longer compared to `MinScore`.
  - **Colocated vector stores (pgvector):** the semantic lane asks for a vector-only search, so the store returns a true similarity (as SQL Server's colocated search already does) instead of its own vector+keyword RRF value. MJ's keyword and full-text lanes do the text matching, so text matches are no longer counted twice, and the semantic floor works on PostgreSQL.
  - **Explorer:** the search page's relevance slider and the search-bar dropdown's relevance filter now judge semantic similarity only (`PassesSemanticFloor`). Filtering on the fused score hid most results when three or more lanes returned hits.
  - **Descriptions:** the `MinScore` parameter of the Search and Scoped Search actions, the `Search.DefaultMinScore` setting, the RAG guide and the agent `filterByScore` tool now describe the new meaning. These are metadata changes, so the changeset is `minor`.

### Patch Changes

- a7fd6e9: Follow-ups from the #4993 review: tests for the semantic floor on the scoped search path (the agent-facing path), a pinned contract for partly tagged `FusionLane` lists, and comments explaining why the server-side `ApplySemanticFloor` may fall back to the raw `Score` while the client-side `PassesSemanticFloor` must not. No behavior change.
- Updated dependencies [a709bb6]
- Updated dependencies [d17de94]
- Updated dependencies [7ada797]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [1da00cb]
- Updated dependencies [92ecdf9]
- Updated dependencies [b699a37]
- Updated dependencies [a4b23b7]
- Updated dependencies [49f26d9]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [bb3028a]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [64b6fa5]
- Updated dependencies [d86bcbc]
- Updated dependencies [af6f892]
- Updated dependencies [432fe69]
- Updated dependencies [4889fb2]
- Updated dependencies [b2441c3]
- Updated dependencies [69e19c5]
- Updated dependencies [7316ac3]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [6d5c6ad]
- Updated dependencies [8bac4d6]
- Updated dependencies [08b3d7b]
- Updated dependencies [5a3de97]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [8704df6]
- Updated dependencies [5345e3d]
- Updated dependencies [1ea4085]
- Updated dependencies [22c9074]
- Updated dependencies [aee2d53]
- Updated dependencies [5dc3752]
- Updated dependencies [6c8798b]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [afe9eb4]
- Updated dependencies [90829e3]
- Updated dependencies [57096ab]
- Updated dependencies [aac148b]
- Updated dependencies [d2cb42e]
- Updated dependencies [cbddadb]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [6b487b8]
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/aiengine@6.2.0-edge.4
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/storage@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/ai-prompts@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/tag-engine-base@6.2.0-edge.4
  - @memberjunction/ai-vectordb@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [0a75bb2]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [279b93e]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [bea2386]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [ec97ad4]
- Updated dependencies [28df136]
- Updated dependencies [49e0bd8]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/aiengine@6.2.0-edge.3
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/tag-engine-base@6.2.0-edge.3
  - @memberjunction/ai-prompts@6.2.0-edge.3
  - @memberjunction/storage@6.2.0-edge.3
  - @memberjunction/ai-vectordb@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- eaa9455: Introduce `AIEmbeddingRunner` extending `BaseModelRunner` with `RequiredModelType = 'Embeddings'`.
  - Implement credential resolution, failover across candidate models/vendors, retry handling, and `MJAIPromptRun` persistence.
  - Deprecate `AIModelRunner.RunEmbedding` and delegate transparently to `AIEmbeddingRunner`.
  - Migrate embedding call sites in `@memberjunction/tag-engine`, `@memberjunction/ai-vector-dupe`, `@memberjunction/ai-vector-sync`, `@memberjunction/content-autotagging`, and `@memberjunction/search-engine` to use `AIEmbeddingRunner`.
  - `AIEmbeddingRunner` runs a driver that needs no API key (`LocalEmbedding`, `OllamaEmbedding`) with no key configured, and follows the prompt's `FailoverStrategy` (`SameModelDifferentVendor` never switches models).
  - With no Embedding prompt, the runner embeds under an unsaved stand-in and writes no run row. `EmbeddingRunParams.SkipRunRecord` skips the row on demand.
  - `TagEngine` embeds tags, queries and new tags with one model (the Tag Semantic Matching prompt's, else the smallest) and persists that ID.
  - Vector search keys its query-embedding cache by model and dimension, not by driver.
- 2854a2e: Address vector indexes by their provider-side name (`ExternalID`), not the MJ display `Name`. Entity vectorization, duplicate detection and the entity-vectors resolver passed `Name`, so any index whose label differs from its provider name (e.g. "More Cheese Content (Pinecone)" vs `morecheese-content`) returned 404 on every upsert/query.

  `AIEngineBase` now owns the single `MJ: Vector Indexes` cache (`VectorIndexes`, `GetVectorIndexByID`) and the one rule for the provider name (`GetProviderIndexName`: ExternalID, falling back to `Name`), proxied on `AIEngine`. `KnowledgeHubMetadataEngine` no longer caches Vector Indexes; its `VectorIndexes` / `GetVectorIndexByID` proxy the AIEngineBase cache. Every caller, including `MJVectorIndexEntityServer`'s delete path, now resolves the provider name through `GetProviderIndexName`.

- 74b3e69: Query Simple Vector Service indexes by Entity Document ID in `VectorSearchProvider` (#4911).

  A vector database that sets `QueryKeyIsEntityDocumentID` (the in-process Simple Vector Service) keys its vectors by Entity Document, not by index name. `VectorSearchProvider` always passed `ExternalID || Name`, so the shipped default index `Default - SVS + gte-small (Local)` failed with "Conversion failed when converting from a character string to uniqueidentifier".

  For such a provider, the search now queries every Active Entity Document that points at the index, read from the `KnowledgeHubMetadataEngine` cache, and keeps the best `topK` across them. Each match is attributed to its document's entity, since these providers return only a `RecordID`. If no Active Entity Document points at the index, that index fails with a clear error instead of reaching the driver with a name. Name-keyed providers are unchanged.

  These providers ignore the metadata filter, so filters are handled before querying. `EntityNames` narrows the documents queried, since each document is one entity. `Tags`, `SourceTypes`, or a scope `MetadataFilter` on the index cannot be applied, so the index is skipped and the reason logged, rather than returning results the filter excludes.

- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [3fbda62]
- Updated dependencies [eaa9455]
- Updated dependencies [ff00d60]
- Updated dependencies [2552b1e]
- Updated dependencies [660ef45]
- Updated dependencies [8fd1c46]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [f3c6161]
- Updated dependencies [01fafc6]
- Updated dependencies [35ffb95]
- Updated dependencies [5148534]
- Updated dependencies [0adaf76]
- Updated dependencies [ce1a5c3]
- Updated dependencies [ef43cf3]
- Updated dependencies [b44c7cf]
- Updated dependencies [861cbf0]
- Updated dependencies [705ab4e]
- Updated dependencies [e51ce8a]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [14e2a3a]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/ai-prompts@6.2.0-edge.2
  - @memberjunction/aiengine@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/tag-engine-base@6.2.0-edge.2
  - @memberjunction/ai-vectordb@6.2.0-edge.2
  - @memberjunction/storage@6.2.0-edge.2

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

- Updated dependencies [ddcd666]
- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [15a4333]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [5da3ad2]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [9b8a84e]
- Updated dependencies [c261eb8]
- Updated dependencies [307da67]
- Updated dependencies [9d4a28a]
- Updated dependencies [a7da50b]
- Updated dependencies [1d43161]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
  - @memberjunction/aiengine@6.2.0-edge.1
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/storage@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/tag-engine-base@6.2.0-edge.1
  - @memberjunction/ai-vectordb@6.2.0-edge.1

## 6.2.0-edge.0

### Minor Changes

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

### Patch Changes

- 7fe994a: The entity search fan-out no longer queries entities that have no search surface.

  `getSearchableEntities` filtered on `AllowUserSearchAPI` alone. An entity can carry that flag while declaring no `IncludeInUserSearchAPI` field at all — CodeGen defaults the entity flag to true, but the per-field flags are only set when smart-field analysis runs, which is off by default. For those entities `UserSearchString` is a documented no-op (#4581/#4582): the provider ignores the term and returns the **unfiltered** table, and `convertResults` then discards every row because `matchedFields` is 0. The round-trip could only ever produce load, never a result — on every keystroke, for every such entity.

  The fan-out now also requires `EntityInfo.HasSearchFields`, the same predicate #4582 added on the data-provider side, so the two layers answer the same question the same way.

  Entities whose candidate fields all drop out _at runtime_ — denied by field-level security, or not text-search targets — are still queried: they return `(1=0)` cheaply, which is a real if empty answer. Only the no-surface case is skipped, matching the (a)/(b) split #4582 established. A full-text entity with no per-field flags is deliberately not exempted either, because this provider could not use its rows; full-text coverage comes from `FullTextSearchProvider`, which calls the provider's `FullTextSearch` directly.

  This is a screen, not a substitute for correct metadata — such entities belong in `.entity-search-exclusions.json`, and today's are already there. It is the backstop that keeps the next one from silently costing every keystroke a round-trip until someone notices.

  **Known limitation:** the screen sits in `getSearchableEntities`, which the scoped path bypasses — `buildScopedEntityList` honours `scopeConstraints.Entities` verbatim. A search scope that names a no-search-surface entity still issues the wasted query. Left as-is deliberately: an admin picking entities explicitly is a different case from the unscoped default, and silently dropping one of their picks is a decision worth making on its own rather than inside this change.

- 8d1a373: Resolve record display names in search preview and display entity friendly names instead of full schema names.
  - **Search Record Display Name Resolution**:
    - In `SearchEngine.ts`, enable enrichment for preview searches on top results so record display names are resolved before preview autocomplete items render.
    - In `SearchEnricher.ts`, resolve missing record names or sentinel titles (`${EntityName} Record`, `${EntityDisplayName} Record`) via `providerToUse.GetEntityRecordNames()`, setting both `RecordName` and `Title` to the live record name.
    - Pass `SearchEngine.ProviderToUse` to `SearchEnricher` to ensure multi-provider alignment.
  - **Entity Display Names**:
    - Add `EntityDisplayName` to search results across `@memberjunction/search-engine`, `@memberjunction/server`, `@memberjunction/graphql-dataprovider`, and `@memberjunction/ng-search`.
    - In `search-suggest.component.html` and `search-results.component.html`, display `EntityDisplayName || EntityName` for both preview results and result cards/detail views.
    - In `SearchService.buildEntityNameFilter`, use entity display names for filter labels and icons while preserving `EntityName` for filtering.

- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [37891d3]
- Updated dependencies [6ad6434]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [7658d68]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [575bfae]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [e962151]
- Updated dependencies [2c590b0]
- Updated dependencies [fc3da91]
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/aiengine@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/tag-engine-base@6.2.0-edge.0
  - @memberjunction/storage@6.2.0-edge.0
  - @memberjunction/ai-vectordb@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Minor Changes

- 71817db: Make the entity-search per-entity timeout configurable and lower its default. `EntitySearchProvider`'s hard per-entity fan-out timeout was a `private static readonly PER_ENTITY_TIMEOUT_MS = 30_000`, so a deployment could not tune it. It is now a **public static `PerEntityTimeoutMS`** (default lowered from 30000ms to **3000ms**), mirroring the existing deployment-adjustable `PerEntityFetchDepth` static.

  The 3s default keeps interactive/omnibar fan-outs responsive by dropping a pathological entity promptly instead of stalling the whole fan-out. Deployments doing large unindexed LIKE scans that need the old behavior can raise it — either by assigning the static at startup or by overriding the default with an environment variable at process start:

  ```ts
  import { EntitySearchProvider } from "@memberjunction/search-engine";
  EntitySearchProvider.PerEntityTimeoutMS = 30_000;
  ```

  ```bash
  # equivalent env-var override, read once when the module loads
  MJ_SEARCH_PER_ENTITY_TIMEOUT_MS=30000
  ```

  All three deployment-adjustable search statics now accept an env-var default override, read once at module load (mirroring the `MJ_INTEGRATION_*` numeric ceilings):

  | Static                                       | Environment variable                        | Default |
  | -------------------------------------------- | ------------------------------------------- | ------- |
  | `EntitySearchProvider.PerEntityTimeoutMS`    | `MJ_SEARCH_PER_ENTITY_TIMEOUT_MS`           | `3000`  |
  | `EntitySearchProvider.PerEntityFetchDepth`   | `MJ_SEARCH_PER_ENTITY_FETCH_DEPTH`          | `15`    |
  | `FullTextSearchProvider.PerEntityFetchDepth` | `MJ_SEARCH_FULLTEXT_PER_ENTITY_FETCH_DEPTH` | `15`    |

  A positive value is floored to an integer. A value that is _present but invalid_ (non-numeric or non-positive) falls back to the built-in default and logs a `warning`-severity message so an ops-side typo surfaces at boot; an unset variable is silent.

  Behavior change: the per-entity timeout now defaults to 3000ms (was 30000ms). The constant also becomes public and writable (formerly private readonly).

- 88d751d: **Scoped Search now carries the skill principal — and judges it.**

  `ScopeDimensionResolver` binds `Principals.SkillID` into a dimension's expansion query, and
  `principalsFrom()` sources that from `SearchParams.AISkillID`. `SearchParams` declares the field and
  `ScopeExplanation.test.ts` asserts on it — but the `Scoped Search` action never set it. The string
  "skill" did not appear in that file. So the slot existed, was typed, was tested, and no caller could
  reach it: a scope whose bound depends on the active skill resolved `SkillID` as null forever.

  Adds an optional `AISkillID` input, threaded onto `SearchParams.AISkillID` the way `AIAgentID`
  already is. Omit it and the skill principal stays null, so no caller gains a skill it did not ask for.

  **Three behaviour changes to note, none of which is the skill threading itself.** First, the
  `AgentUnscopedAll` fallback is now gated on wieldability, so an install where an agent is
  `SearchScopeAccess='All'` _and_ the user holds no direct or role grant previously got `Allowed:
Search` and now additionally requires the agent to be in the metadata cache and runnable by that
  user. This reaches `SearchKnowledge` and `StreamScopedSearch` as well as the action. Second, a
  supplied skill is judged wherever it is named, not only at its `All` fallback: a skill binds into
  the expansion query, whose output _is_ the bound for a `restricts: true` dimension, so judging it
  only where it grants would let a user holding their own grant widen with any skill they named.
  The agent is deliberately NOT judged that way — `AIAgentID` is also attribution, and gating it at
  the point of supply turns an analytics field into a retrieval outage. The skill check does NOT judge the agent —
  `GetSkillsForAgent` filters the user's rights on the SKILL (`AISkillPermissionHelper`), never on
  the agent — so the agent is judged at the fallbacks instead, where it widens. Both `'All'` arms
  consult it, including the skill's: a skill widens through the agent it would activate on, so
  naming a skill must not buy access to an agent the caller may not run. A stale metadata cache is
  distinguished from a denial in the MESSAGE, but it does not buy access: an agent that
  cannot be evaluated cannot back a widening fallback either. (An earlier revision let it through on
  the reasoning that a cache blip should not refuse a user whose own grant covered the scope — which is
  impossible, since a direct or role grant returns before any fallback is reached. What it actually did
  was grant `Search` to users with no grant at all whenever an agent was missing from the cache.)

  Third: **a skill supplied with NO agent is now refused outright**. At base, step 4b granted
  `SkillUnscopedAll` with no agent at all — an agent-free skill id was a standalone grant, so
  'refused' replaces an actual widening, not a no-op. A skill is judged relative to the agent it would activate on, so there is nothing to
  judge it against. The `Scoped Search` action always has an agent, so this is reachable only
  through `ExplainScope({ AISkillID })` with no `AIAgentID` — most likely a preview UI that lets
  a skill be picked before an agent. Such a call now returns `PrincipalNotActivatable` rather
  than quietly resolving on the user's own grant.

  Also at the same call sites: the caller's tenant (`PrimaryScopeRecordID`) now reaches the
  permission decision everywhere it is available — previously every tenant-scoped grant,
  including a tenant-scoped `None` (an explicit per-tenant deny), was discarded before the
  verdict. Denial messages no longer echo principal names back to the caller (ids + `Source`
  only; audit rows and server logs keep the full reason). The GraphQL resolvers refuse a
  supplied-but-unloadable `agentID` instead of silently proceeding with an unjudged principal,
  and the `SearchScopes` listing hides scopes under the same rule (it takes no searchContext, so
  no tenant applies there). The resolver's `ExtraFilter` interpolations now use `EscapeSQLString`.

  **The skill is a principal, so it is also permission-checked.** `SearchScopePermissionResolver`
  already had three rules that only fire when `Skill` is supplied — `SkillNone` and
  `SkillAssignedNotListed` reject a scope the user's own roles allow, and `SkillUnscopedAll` grants one
  they do not. The action never passed it. Threading the ID without the gate would have enabled the
  widening half of a two-part mechanism and left the deciding half unwired, and would have put the
  search at odds with `ExplainScope`, which does pass it — the preview/enforcement drift this code has
  already been bitten by once. So the skill is resolved _before_ the permission check, handed to
  `ResolveEffectivePermission`, and attributed on every denial row.

  A value that is not a UUID, or that will not load, is refused with `INVALID_PARAM` rather than
  dropped: continuing with a null skill would bind an unjudged ID into the expansion query.

  **A principal may only WIDEN if the caller may wield it — checked where it widens.**

  `AgentUnscopedAll` and `SkillUnscopedAll` are the only places a principal changes an outcome: by the
  time they are reached the user has no grant of their own, and `SearchScopeAccess='All'` is about to
  supply one. Both permission models are open by default — no permission rows means anyone may run it —
  so an id a caller merely NAMED could grant `Search` on any scope.

  Two checks do this, split because they answer different questions.
  `skillIsActivatable()` runs wherever a skill is NAMED (step 1e) and asks
  `GetSkillsForAgent(agent, user)` — the same call `BaseAgent.preActivateRequestedSkills` gates real
  activation on. `agentIsWieldable()` runs at the WIDENING fallbacks and asks for Run on the agent.
  Both fallbacks consult it, the skill's included: `GetSkillsForAgent` filters SKILL permissions
  (`AISkillPermissionHelper`) and never `AIAgentPermission`, so vouching for a skill says nothing about
  whether the caller may run the agent it would activate on. Failing either check REFUSES, with
  `PrincipalNotActivatable` — a widening fallback needs the principal positively confirmed, not merely
  un-denied.

  **Deliberately NOT gated at the point the id is supplied.** `AIAgentID` is attribution far more often
  than it is authorization — `agent-pre-execution-rag` threads it purely so `SearchExecutionLog` can
  attribute the search — and gating supply rather than grant turns an analytics field into a retrieval
  outage on any install with explicit `AI Agent Permission` rows. A test pins that a non-`'All'` agent
  supplied WITHOUT a skill never reaches the check — which is the RAG path's shape today. Note a
  non-`'All'` agent DOES reach it when an `'All'` skill is supplied, because that skill widens through
  it; if the RAG path ever starts threading `AISkillID`, this is the interaction to re-examine.

  A stale metadata cache is reported as itself. `GetUserAgentPermissions` throws when the agent is
  absent from `AIEngine.Instance.Agents` and fails closed to all-false, so an agent created after the
  cache loaded would otherwise read as "not permitted" — a metadata-load problem wearing an
  authorization message.

  Because the policy sits in the resolver, `ExplainScope` inherits it: preview and search reach the same
  verdict by running the same code rather than by two copies agreeing.

  **`ExplainScope` inherits the same judgement** (`@memberjunction/search-engine`). It already loaded the skill
  principal and applied its rules, so without this a preview would report `SkillUnscopedAll` as a grant
  while the real search refused — the preview-vs-enforcement drift that file already carries a regression
  test about. Both paths now judge both principals on identical terms, and on the explain path a principal refused
  for a PRINCIPAL-SIDE reason — `PrincipalNotActivatable`, `AgentNone`, `AgentAssignedNotListed`,
  `SkillNone`, `SkillAssignedNotListed` — is no longer bound into dimension resolution;
  `deriveServerValue` parameterises server-authored SQL with it, which is the thing the action refuses
  outright rather than continuing with. A refusal for a USER-side reason (no grant) still binds them,
  deliberately: dropping them there drives the expansion query with nulls, which makes a required
  dimension throw and the explanation announce a dimension failure that does not exist.

  On containment, stated accurately: an expansion query is server-authored SQL, but MJ renders query
  parameters through Nunjucks with `autoescape: false` and escaping is opt-in (`| sqlString`, or a
  declared validation chain). So MJ does not itself guarantee that naming a skill cannot widen or
  inject — the query author does, and the permission gate above is what MJ enforces. Scopes that never
  reference `SkillID` are unaffected in either direction.

- b6416f4: Search: verify that a result group's records belong to the entity it is attributed to

  `SearchEngine.filterEntityResults` groups results by `EntityName`, resolves that entity, checks
  `CanRead`, and then — when the entity has no row filter for the caller, or the caller is exempt from row
  filtering — admitted the whole group without checking the record ids were that entity's records at all.

  `CanRead` establishes that a user may read an entity. It does not establish that a result _is_ one of
  that entity's rows. And `EntityName` is provider output: the vector lane reads it from the vector's own
  `Entity` metadata key, and the 3rd-party lanes (Azure AI Search, Elasticsearch, Typesense, OpenSearch)
  use the index or collection name. Whoever populates an index therefore chose which entity's permissions
  were evaluated for its documents — label an index after an entity the caller can read, and its documents
  were admitted, with each result's Title, Snippet and RawMetadata rendered from that index's own metadata.

  The check now runs for those groups. It is the same query the row-filter path already used — a
  primary-key `IN` against the attributed entity's own view, keeping only the ids that come back — so this
  reuses an existing, tested code path rather than adding a mechanism.

  **Lanes that queried the entity directly are exempt, so the common path costs nothing.** An `entity` or
  `fulltext` result's ids came out of a `RunView` against that entity and are its records by construction.
  Everything else is verified, including any `SourceType` a 3rd-party provider defines — an allowlist, so
  an unanticipated source type is verified by default rather than trusted by default. A mixed group is
  partitioned: the self-evident results pass straight through and only the rest are queried.

  Row-filtered groups behave exactly as before; that path already verified ownership as a side effect of
  filtering. RLS-**exempt** callers are now verified too, deliberately: exemption says which _rows of an
  entity_ a user may see, not whether a result belongs to that entity.

  **Behaviour change worth noting before upgrading:** a deployment that has been returning results whose
  `EntityName` does not match the entity their ids belong to will see those results disappear. That is the
  intent, but it is a change — if search results drop after this upgrade, the labels were wrong, and
  `Residual permission filter removed N result(s)` in the log identifies where.

  `filterByRowLevelSecurity` is renamed `verifyOwnershipAndRowFilters` to match what it now does; it is
  private, so nothing outside the class is affected.

  **Why `minor` rather than `patch`:** this change is code-only, but it ships in the same branch as a
  `metadata/` JSONType addition, and the bump rule is evaluated per branch — see
  `.claude/rules/changesets.md`.

- ae2baef: Content vectors: declare the entity on the content source, and let `explicit` omit the per-vector key

  Minor rather than patch on both: this adds a property to the `ContentSource.Configuration` JSONType, so
  it changes metadata rather than code alone.

  `VectorSearchProvider` could attribute a match two ways: an `Entity` key in the vector's own metadata,
  or an Entity Document targeting the index. Neither covers the ContentSource pipeline running
  `fieldStrategy: 'explicit'`, where metadata carries only the configured fields — `ContentSourceID` is
  present, the identity keys are not — and where the caller may not use Entity Documents at all.

  That gap is not cosmetic. `SearchEngine.filterEntityResults` groups results by `EntityName` and
  resolves each group with `EntityByName()` to evaluate CanRead and row-level security. An unresolvable
  name yields no `EntityInfo`, the method returns before admitting the group, and **the results are
  silently discarded** — `Residual permission filter removed N result(s)` is the only trace.

  A content source can now declare what its vectors are, via `VectorEntityName` on its `Configuration`
  JSON — the same place every other per-source vector knob already lives (`EnableVectorization`,
  `VectorIDStrategy`, `ChunkTextStorage`, `VectorMetadata`). When a match omits `Entity`, its
  `ContentSourceID` resolves through `KnowledgeHubMetadataEngine.GetContentSourceByID()` — an O(1) lookup
  against an already-cached collection — to that declaration.

  **The declaration is validated before it is trusted, twice.** Whatever it resolves to becomes the
  entity whose CanRead and row-level security `filterEntityResults` evaluates, and that method never
  checks the matched record ids belong to it. So the name must (a) resolve in metadata — an unresolvable
  name would otherwise silently delete a source's results rather than mislabel them — and (b) be one of
  `MJ: Content Items` / `MJ: Content Item Chunks`, or an IS-A subtype of one. Without (b) an arbitrary
  entity name in a writable configuration blob would decide which permissions apply. The canonical name
  from metadata is what gets used, so casing and whitespace cannot fork the grouping.

  Two properties worth calling out, because they are why this sits where it does rather than being
  inferred from somewhere else:
  - **Per match, not per index.** One vector index can serve many content sources, so an index-wide
    answer is wrong as soon as a second source shares the index. `ContentSourceID` travels on the vector.
  - **Declared, not guessed** — and validated, per above. Since attribution decides _which_ entity's
    permissions are evaluated, an inferred or unchecked name would put the wrong object's rules in front
    of the records — worse than no attribution, which merely drops them.

  Declaring it per source also lets a source name an **ISA extension** instead of the base entity it
  inherits from. That distinction is a security one: row-level security typically lives on the
  extension, so a hardcoded or index-wide base-entity name evaluates the wrong entity's RLS.

  Resolution order is most-specific-first: the match's own `Entity` key, then its content source's
  declaration, then the index's Entity Documents, then `'Unknown'` as before. A source that declares
  nothing — or declares something that fails validation — is simply absent from the lookup, so its matches
  behave exactly as they do today.

  Also fixed, both pre-existing:
  - `convertMatches` applied the resolved fallback with `??` while the "does this match need one" test is
    falsy, so an `Entity: ''` resolved a name and then discarded it — the result was dropped with the
    resolution already paid for.
  - `convertMatches` had the same `??` on `RecordID`, so a producer writing `RecordID: ''` shipped an empty
    record id instead of falling through to the vector's own id — dropped by the permission filter on an
    `IN ('')`, or returned as a result that cannot be opened.

  `extractDisplayTitle` is deliberately left reading `meta['Entity']` rather than the resolved name, with a
  comment saying so. It looks like an oversight and is not: when the metadata carries no name fields it
  falls through to `` `${fallbackEntity} Record` ``, and that string is the sentinel
  `SearchEnricher.resolveRecordNames` matches to replace the title with the live name from the database.
  Feeding the resolved entity in makes the name-field branch succeed off the embedding-time snapshot, the
  sentinel never forms, and a renamed record shows a stale title until it is re-embedded.

  Failures decline rather than guess, and each declines narrowly: a source whose `Configuration` will not
  parse is skipped on its own (one guard per source, not one around the batch, so a single bad blob cannot
  downgrade every match after it to a different entity's permissions), and a `KnowledgeHubMetadataEngine`
  load that is **permission-constrained** declines explicitly instead of reading its empty collections as
  "nothing declared" — otherwise attribution would silently depend on who was searching.

  **Attribution failure is now audible.** A batch containing matches that no step could name logs the
  count, the index, a sample of vector ids, and the three ways to fix it — once per index per batch, and
  only when it happens. Before this, such matches were discarded by `filterEntityResults` with no log on
  that path at all; the sole trace was the aggregate `Residual permission filter removed N result(s)`,
  whose wording blames incomplete provider push-down. So the one signal a deployment got pointed away from
  the cause, which is why "vectors are in the index and never surface" was undiagnosable.

  **And the write side can now drop the key.** With a declaration in place, `'explicit'` genuinely omits
  `Entity` and writes `ContentSourceID` instead — the source becomes the single place the answer lives
  rather than a string repeated on every vector. Previously the key could not be removed by configuration
  at all on this pipeline: it is written _before_ the `explicit` early return (the EntityDocument pipeline
  has it the other way around), and there is no `IncludeEntity` toggle beside `IncludeEntityIcon` /
  `IncludeUpdatedAt` / `IncludeTags` / `IncludeText`.

  The declaration is validated where it is written, not only where it is read. It must resolve in
  metadata, and it must name `MJ: Content Item Chunks` or an IS-A subtype — because omission requires
  `'alwaysChunk'`, which makes every vector a chunk row whose id is a chunk key. A name that fails either
  check keeps the `Entity` key and logs once per run. This fails _safe_ rather than closed, and
  deliberately so: the reader can only refuse a bad declaration after the fact, by which point the vectors
  carry no entity at all, so correcting the configuration would not recover them without a re-embed.

  Omission is therefore gated on all four of `'explicit'`, a declaration resolving to the chunk entity,
  `ChunkTextStorage: 'alwaysChunk'` and `VectorIDStrategy: 'recordId'`, with
  `ContentSourceID` then written unconditionally. Each condition keeps the guarantee that every vector
  carries either `Entity` or a key that resolves to a declared entity:
  - **`'mixed'`** emits ContentItem-level vectors for single-chunk items and ContentItemChunk-level vectors
    for the rest — two entities from one source, which one declaration cannot describe.
  - **`'hash'`** leaves no recoverable record id, since `'explicit'` drops `RecordID` too and the vector's
    own id is a digest rather than the row's. Attribution would succeed and then hand search an id that
    resolves against no row — the same disappearance, one step later.
  - **Other field strategies** document a populated metadata set; dropping a key their consumers are told
    is always present would be a behavior change for them.

  Anything else keeps writing `Entity` exactly as before, and existing vectors are untouched — they keep
  resolving through their stored key (resolution step 1), so no re-index is required.

  Integration coverage comes with it: `IT — content-vectorization` gains CV7 (a declaring source omits
  `Entity`, promotes `ContentSourceID`, and its vector id is the chunk row's PK) and CV8 (three refusal
  paths — no opt-in, an unresolvable name, and a declaration naming the item entity — each keep the key).

  No schema change and no migration. It does add a property to the `ContentSource.Configuration` JSONType,
  so `mj sync push` + `mj codegen` are needed before the typed accessor exists; until then both sides read
  it through a locally-declared interface that is deleted at that point. Behaviour is unchanged for callers
  whose matches carry `Entity` metadata and for any index resolving through an Entity Document.

### Patch Changes

- 5e987a7: Knowledge Hub + universal search fixes found wiring a Dropbox team-space vault and a website crawl into Pinecone.
  - **storage (Dropbox):** the refresh-token constructor path now marks the driver configured (callers that only construct the driver, like `AutotagCloudStorage`, were rejected with "Missing: Access Token"); optional `STORAGE_DROPBOX_PATH_ROOT` applies an SDK `pathRoot` so Business team-space paths resolve.
  - **content-autotagging:** `AutotagCloudStorage` walks sub-folders under `PathPrefix` instead of one level; the vectorizer addresses the 3rd-party index by `VectorIndex.ExternalID` (fallback `Name`) instead of the display name; invalid-content deletions and failed content-item saves are now logged instead of silent.
  - **search-engine:** `VectorSearchProvider` uses `VectorIndex.ExternalID` for the provider-side index name — the Semantic lane 404'd against Pinecone on every query when the MJ display name differed from the index name.

- 0acf96e: Make the SearchScope permission resolver replaceable.

  `SearchEngine` authorizes every search through `SearchScopePermissionResolver`, which answers from `__mj.SearchScopePermission` rows keyed by `UserID` or by one of the user's MJ Roles. That covers MJ's own permission model completely — but it is not the only shape a permission model can take, and until now it was the only one the search path could consult.

  A consumer whose entitlements are neither a user nor an MJ Role has no row that can express them. Its grants are therefore invisible to the check that actually runs, and the failure is silent in the worst way: the grant is configured, an administrator can see it, and the search simply returns nothing. The resolver was a module-level singleton imported directly by `SearchEngine`, so the only remedies were to project the consumer's model into `SearchScopePermission` as derived per-user rows — permission state that can drift from its source — or to fork the search path.

  This adds the seam that was missing:
  - **`SearchScopePermissionResolverBase`** — the abstract contract registrations bind to.
  - **`SEARCH_SCOPE_PERMISSION_RESOLVER_KEY`** — the ClassFactory key. There is exactly one resolver per deployment (a consumer _replaces_ the policy rather than selecting among several), so a single shared key is the right shape, and it keeps the registry free of the keyless-registration warning.
  - **`GetSearchScopePermissionResolver()`** — returns the highest-priority registration, falling back to MJ's own.

  **Every path that authorizes a scope now goes through the seam**, not just `SearchEngine`. This matters more than it sounds: a seam honoured on some paths and not others is worse than no seam, because the resulting behaviour is inconsistent rather than merely absent — the same grant authorizes a search issued one way and silently denies it issued another. The five call sites are `SearchEngine.searchOneScope`, `SearchKnowledgeResolver` (both the single-scope check and the visible-scope-list filter), `SearchKnowledgeStreamResolver`, and the `__Scoped_Search` core action. The last is the agent-facing path, so an override that did not reach it would be invisible to exactly the callers most likely to need it.

  Resolution happens per call rather than being cached at module load. A registration made during application startup would otherwise be missed depending on import order — a failure mode that presents as "my resolver works in tests but not in the server", which is expensive to diagnose. The class is stateless and construction is trivial, so there is nothing to gain by caching.

  The intended shape for an override is to subclass the stock resolver and compose with it, **passing no priority**:

  ```ts
  @RegisterClass(
    SearchScopePermissionResolverBase,
    SEARCH_SCOPE_PERMISSION_RESOLVER_KEY,
  )
  export class MyResolver extends SearchScopePermissionResolver {
    public override async ResolveEffectivePermission(
      input: ResolvePermissionInput,
    ) {
      const stock = await super.ResolveEffectivePermission(input);
      if (stock.Allowed) return stock; // never narrow what MJ already granted
      return this.myOwnGrantCheck(input); // only ever widen
    }
  }
  ```

  Subclassing is what orders the registration, and it does so more reliably than a number can. `ClassFactory.Register` treats an omitted priority as _one higher than the highest already registered for this (base, key)_, and a subclass cannot be defined without its parent module having loaded first — so MJ's registration always runs before the consumer's, and the consumer always lands above it. The ordering is a side effect of the language rather than a convention anyone has to remember.

  A hardcoded priority forfeits that. Two consumers that pick the same number collide, `Register` warns, and resolution degrades to whichever was registered last — a load-order bug wearing the costume of a configuration value. The priority argument stays for cases where subclassing is genuinely impossible.

  **Nothing changes for existing consumers.** MJ's resolver registers itself as the default, so behaviour is identical when nothing else is registered. `DefaultSearchScopePermissionResolver` is retained and still exported so existing imports keep compiling; it is marked `@deprecated` because it always yields MJ's own implementation and therefore bypasses any registered override.

  The failure posture is unchanged and worth restating for anyone writing an override: `SearchEngine` treats a resolver throw as **denied**, never as allowed. An override that cannot reach its own store must not accidentally open a scope.

  7 tests covering the default, the fallback, an honoured registration, late registration (imperative, because `@RegisterClass` evaluates at module load and so cannot demonstrate lateness), composition with `super`, the deprecated constant, and that a subclass of the stock resolver satisfies the base contract.

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

- 1748491: Search results open for entities whose primary key is not named `ID`, and round-trip composite primary keys end to end.

  Clicking a universal-search result failed with `InnerLoad returned false for key ID=<value>` for any entity whose key column has another name (`individual_id`, `organization_id`, …). Every search navigation site built the key as `{ FieldName: 'ID', Value: RecordID }` or `CompositeKey.FromID(RecordID)`, and `Load()` correctly rejects a field that is not one of the entity's primary keys. MJ supports primary keys with any column name(s) and type(s), so the fix uses the entity's metadata everywhere instead of a literal.

  **The contract.** A search result's `RecordID` is a _compact_ `CompositeKey` segment: the bare value for a single-column key (so `IN (...)` filters, dedup keys and persisted ids are unchanged), the full `Field1|Value1||Field2|Value2` segment for a composite key. `CompositeKey.LoadFromURLSegment(entity, s)` already reads both forms; two new statics make it the one-liner every consumer calls, and one new serializer produces it:
  - `CompositeKey.FromURLSegment(entityInfo, recordId)` — the inverse of the compact form; falls back to an `ID` key only when the entity cannot be resolved.
  - `CompositeKey.FromEntityRecord(entityInfo, row)` — the key from a RunView row using the entity's real primary key column(s).
  - `FieldValueCollection.ToCompactURLSegment()` — bare value for one column, prefixed segment for several (or when a lone value itself contains `|`).
  - `ToWhereClause()` now doubles embedded quotes, since it builds SQL from record ids that can come from an external index.

  **Consumers** (`ng-explorer-core`, `ng-search`): the shell dropdown, the "See all results" page, the omnibar palette (the default search surface — not named in the report), the FK-cell "open related record" path in views and single-search-result, and the two recents name lookups all resolve the key with `FromURLSegment` against the entity's metadata.

  **Producers** (`core`, `search-engine`, `ai-vectors-memory`): `EntitySearchProvider` read `record.ID`, which is `''` for these entities — `SearchFusion` drops empty ids, so the entity lane silently contributed nothing for them; it now builds the key from `PrimaryKeys`. The full-text lane, `SearchEntity`'s lexical pass and its permission filter (`ID IN (...)`, `Fields: ['ID']`), and the in-process `SimpleVectorDatabase` (`row['ID']`, `` `ID|…` ``) do the same. `VectorSearchProvider` no longer flattens a composite key to bare values joined by `||`, which nothing could parse.

  **Permission filter** (`search-engine`): `verifyOwnershipAndRowFilters` verified results with `FirstPrimaryKey IN (...)`. Once composite entities emit real segments that check could never match and — it fails closed — every composite-key result would be dropped as unauthorized. Composite keys now verify with one `(F1=… AND F2=…)` term per record; single-column keys keep the `IN` fast path. Matching is on primary-key values in metadata order, UUID-normalized, so an externally indexed id still matches the row the database returns.

  **Recents** (`ng-shared-generic`): `RecentAccessService` persisted `Values(',')`, which drops field names; composite keys written there could never be reopened. It now writes the compact segment. Existing single-value rows are unchanged and read back as before.

  Also fixed in `core`: `EmbeddedRecord` built its parent-load key with `FromID` for a single-column key, which fails for any embedded entity whose key isn't named `ID`.

- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [f5ec13b]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [1940a4d]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [e2ad3c0]
- Updated dependencies [5ecfdb4]
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
- Updated dependencies [ada8784]
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
- Updated dependencies [11de1a3]
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
- Updated dependencies [5e987a7]
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
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [9cbe17f]
- Updated dependencies [97cbf5f]
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
- Updated dependencies [bc45ded]
- Updated dependencies [28cd302]
- Updated dependencies [29c3dc8]
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
- Updated dependencies [394d276]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/aiengine@6.1.0
  - @memberjunction/ai@6.1.0
  - @memberjunction/storage@6.1.0
  - @memberjunction/ai-vectordb@6.1.0

## 6.1.0-edge.7

### Patch Changes

- 5e987a7: Knowledge Hub + universal search fixes found wiring a Dropbox team-space vault and a website crawl into Pinecone.
  - **storage (Dropbox):** the refresh-token constructor path now marks the driver configured (callers that only construct the driver, like `AutotagCloudStorage`, were rejected with "Missing: Access Token"); optional `STORAGE_DROPBOX_PATH_ROOT` applies an SDK `pathRoot` so Business team-space paths resolve.
  - **content-autotagging:** `AutotagCloudStorage` walks sub-folders under `PathPrefix` instead of one level; the vectorizer addresses the 3rd-party index by `VectorIndex.ExternalID` (fallback `Name`) instead of the display name; invalid-content deletions and failed content-item saves are now logged instead of silent.
  - **search-engine:** `VectorSearchProvider` uses `VectorIndex.ExternalID` for the provider-side index name — the Semantic lane 404'd against Pinecone on every query when the MJ display name differed from the index name.

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [5e987a7]
- Updated dependencies [076fa5d]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/aiengine@6.1.0-edge.7
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/storage@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/ai-vectordb@6.1.0-edge.7

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

- 1748491: Search results open for entities whose primary key is not named `ID`, and round-trip composite primary keys end to end.

  Clicking a universal-search result failed with `InnerLoad returned false for key ID=<value>` for any entity whose key column has another name (`individual_id`, `organization_id`, …). Every search navigation site built the key as `{ FieldName: 'ID', Value: RecordID }` or `CompositeKey.FromID(RecordID)`, and `Load()` correctly rejects a field that is not one of the entity's primary keys. MJ supports primary keys with any column name(s) and type(s), so the fix uses the entity's metadata everywhere instead of a literal.

  **The contract.** A search result's `RecordID` is a _compact_ `CompositeKey` segment: the bare value for a single-column key (so `IN (...)` filters, dedup keys and persisted ids are unchanged), the full `Field1|Value1||Field2|Value2` segment for a composite key. `CompositeKey.LoadFromURLSegment(entity, s)` already reads both forms; two new statics make it the one-liner every consumer calls, and one new serializer produces it:
  - `CompositeKey.FromURLSegment(entityInfo, recordId)` — the inverse of the compact form; falls back to an `ID` key only when the entity cannot be resolved.
  - `CompositeKey.FromEntityRecord(entityInfo, row)` — the key from a RunView row using the entity's real primary key column(s).
  - `FieldValueCollection.ToCompactURLSegment()` — bare value for one column, prefixed segment for several (or when a lone value itself contains `|`).
  - `ToWhereClause()` now doubles embedded quotes, since it builds SQL from record ids that can come from an external index.

  **Consumers** (`ng-explorer-core`, `ng-search`): the shell dropdown, the "See all results" page, the omnibar palette (the default search surface — not named in the report), the FK-cell "open related record" path in views and single-search-result, and the two recents name lookups all resolve the key with `FromURLSegment` against the entity's metadata.

  **Producers** (`core`, `search-engine`, `ai-vectors-memory`): `EntitySearchProvider` read `record.ID`, which is `''` for these entities — `SearchFusion` drops empty ids, so the entity lane silently contributed nothing for them; it now builds the key from `PrimaryKeys`. The full-text lane, `SearchEntity`'s lexical pass and its permission filter (`ID IN (...)`, `Fields: ['ID']`), and the in-process `SimpleVectorDatabase` (`row['ID']`, `` `ID|…` ``) do the same. `VectorSearchProvider` no longer flattens a composite key to bare values joined by `||`, which nothing could parse.

  **Permission filter** (`search-engine`): `verifyOwnershipAndRowFilters` verified results with `FirstPrimaryKey IN (...)`. Once composite entities emit real segments that check could never match and — it fails closed — every composite-key result would be dropped as unauthorized. Composite keys now verify with one `(F1=… AND F2=…)` term per record; single-column keys keep the `IN` fast path. Matching is on primary-key values in metadata order, UUID-normalized, so an externally indexed id still matches the row the database returns.

  **Recents** (`ng-shared-generic`): `RecentAccessService` persisted `Values(',')`, which drops field names; composite keys written there could never be reopened. It now writes the compact segment. Existing single-value rows are unchanged and read back as before.

  Also fixed in `core`: `EmbeddedRecord` built its parent-load key with `FromID` for a single-column key, which fails for any embedded entity whose key isn't named `ID`.

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
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/aiengine@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/storage@6.1.0-edge.6
  - @memberjunction/ai-vectordb@6.1.0-edge.6

## 6.1.0-edge.5

### Minor Changes

- 88d751d: **Scoped Search now carries the skill principal — and judges it.**

  `ScopeDimensionResolver` binds `Principals.SkillID` into a dimension's expansion query, and
  `principalsFrom()` sources that from `SearchParams.AISkillID`. `SearchParams` declares the field and
  `ScopeExplanation.test.ts` asserts on it — but the `Scoped Search` action never set it. The string
  "skill" did not appear in that file. So the slot existed, was typed, was tested, and no caller could
  reach it: a scope whose bound depends on the active skill resolved `SkillID` as null forever.

  Adds an optional `AISkillID` input, threaded onto `SearchParams.AISkillID` the way `AIAgentID`
  already is. Omit it and the skill principal stays null, so no caller gains a skill it did not ask for.

  **Three behaviour changes to note, none of which is the skill threading itself.** First, the
  `AgentUnscopedAll` fallback is now gated on wieldability, so an install where an agent is
  `SearchScopeAccess='All'` _and_ the user holds no direct or role grant previously got `Allowed:
Search` and now additionally requires the agent to be in the metadata cache and runnable by that
  user. This reaches `SearchKnowledge` and `StreamScopedSearch` as well as the action. Second, a
  supplied skill is judged wherever it is named, not only at its `All` fallback: a skill binds into
  the expansion query, whose output _is_ the bound for a `restricts: true` dimension, so judging it
  only where it grants would let a user holding their own grant widen with any skill they named.
  The agent is deliberately NOT judged that way — `AIAgentID` is also attribution, and gating it at
  the point of supply turns an analytics field into a retrieval outage. The skill check does NOT judge the agent —
  `GetSkillsForAgent` filters the user's rights on the SKILL (`AISkillPermissionHelper`), never on
  the agent — so the agent is judged at the fallbacks instead, where it widens. Both `'All'` arms
  consult it, including the skill's: a skill widens through the agent it would activate on, so
  naming a skill must not buy access to an agent the caller may not run. A stale metadata cache is
  distinguished from a denial in the MESSAGE, but it does not buy access: an agent that
  cannot be evaluated cannot back a widening fallback either. (An earlier revision let it through on
  the reasoning that a cache blip should not refuse a user whose own grant covered the scope — which is
  impossible, since a direct or role grant returns before any fallback is reached. What it actually did
  was grant `Search` to users with no grant at all whenever an agent was missing from the cache.)

  Third: **a skill supplied with NO agent is now refused outright**. At base, step 4b granted
  `SkillUnscopedAll` with no agent at all — an agent-free skill id was a standalone grant, so
  'refused' replaces an actual widening, not a no-op. A skill is judged relative to the agent it would activate on, so there is nothing to
  judge it against. The `Scoped Search` action always has an agent, so this is reachable only
  through `ExplainScope({ AISkillID })` with no `AIAgentID` — most likely a preview UI that lets
  a skill be picked before an agent. Such a call now returns `PrincipalNotActivatable` rather
  than quietly resolving on the user's own grant.

  Also at the same call sites: the caller's tenant (`PrimaryScopeRecordID`) now reaches the
  permission decision everywhere it is available — previously every tenant-scoped grant,
  including a tenant-scoped `None` (an explicit per-tenant deny), was discarded before the
  verdict. Denial messages no longer echo principal names back to the caller (ids + `Source`
  only; audit rows and server logs keep the full reason). The GraphQL resolvers refuse a
  supplied-but-unloadable `agentID` instead of silently proceeding with an unjudged principal,
  and the `SearchScopes` listing hides scopes under the same rule (it takes no searchContext, so
  no tenant applies there). The resolver's `ExtraFilter` interpolations now use `EscapeSQLString`.

  **The skill is a principal, so it is also permission-checked.** `SearchScopePermissionResolver`
  already had three rules that only fire when `Skill` is supplied — `SkillNone` and
  `SkillAssignedNotListed` reject a scope the user's own roles allow, and `SkillUnscopedAll` grants one
  they do not. The action never passed it. Threading the ID without the gate would have enabled the
  widening half of a two-part mechanism and left the deciding half unwired, and would have put the
  search at odds with `ExplainScope`, which does pass it — the preview/enforcement drift this code has
  already been bitten by once. So the skill is resolved _before_ the permission check, handed to
  `ResolveEffectivePermission`, and attributed on every denial row.

  A value that is not a UUID, or that will not load, is refused with `INVALID_PARAM` rather than
  dropped: continuing with a null skill would bind an unjudged ID into the expansion query.

  **A principal may only WIDEN if the caller may wield it — checked where it widens.**

  `AgentUnscopedAll` and `SkillUnscopedAll` are the only places a principal changes an outcome: by the
  time they are reached the user has no grant of their own, and `SearchScopeAccess='All'` is about to
  supply one. Both permission models are open by default — no permission rows means anyone may run it —
  so an id a caller merely NAMED could grant `Search` on any scope.

  Two checks do this, split because they answer different questions.
  `skillIsActivatable()` runs wherever a skill is NAMED (step 1e) and asks
  `GetSkillsForAgent(agent, user)` — the same call `BaseAgent.preActivateRequestedSkills` gates real
  activation on. `agentIsWieldable()` runs at the WIDENING fallbacks and asks for Run on the agent.
  Both fallbacks consult it, the skill's included: `GetSkillsForAgent` filters SKILL permissions
  (`AISkillPermissionHelper`) and never `AIAgentPermission`, so vouching for a skill says nothing about
  whether the caller may run the agent it would activate on. Failing either check REFUSES, with
  `PrincipalNotActivatable` — a widening fallback needs the principal positively confirmed, not merely
  un-denied.

  **Deliberately NOT gated at the point the id is supplied.** `AIAgentID` is attribution far more often
  than it is authorization — `agent-pre-execution-rag` threads it purely so `SearchExecutionLog` can
  attribute the search — and gating supply rather than grant turns an analytics field into a retrieval
  outage on any install with explicit `AI Agent Permission` rows. A test pins that a non-`'All'` agent
  supplied WITHOUT a skill never reaches the check — which is the RAG path's shape today. Note a
  non-`'All'` agent DOES reach it when an `'All'` skill is supplied, because that skill widens through
  it; if the RAG path ever starts threading `AISkillID`, this is the interaction to re-examine.

  A stale metadata cache is reported as itself. `GetUserAgentPermissions` throws when the agent is
  absent from `AIEngine.Instance.Agents` and fails closed to all-false, so an agent created after the
  cache loaded would otherwise read as "not permitted" — a metadata-load problem wearing an
  authorization message.

  Because the policy sits in the resolver, `ExplainScope` inherits it: preview and search reach the same
  verdict by running the same code rather than by two copies agreeing.

  **`ExplainScope` inherits the same judgement** (`@memberjunction/search-engine`). It already loaded the skill
  principal and applied its rules, so without this a preview would report `SkillUnscopedAll` as a grant
  while the real search refused — the preview-vs-enforcement drift that file already carries a regression
  test about. Both paths now judge both principals on identical terms, and on the explain path a principal refused
  for a PRINCIPAL-SIDE reason — `PrincipalNotActivatable`, `AgentNone`, `AgentAssignedNotListed`,
  `SkillNone`, `SkillAssignedNotListed` — is no longer bound into dimension resolution;
  `deriveServerValue` parameterises server-authored SQL with it, which is the thing the action refuses
  outright rather than continuing with. A refusal for a USER-side reason (no grant) still binds them,
  deliberately: dropping them there drives the expansion query with nulls, which makes a required
  dimension throw and the explanation announce a dimension failure that does not exist.

  On containment, stated accurately: an expansion query is server-authored SQL, but MJ renders query
  parameters through Nunjucks with `autoescape: false` and escaping is opt-in (`| sqlString`, or a
  declared validation chain). So MJ does not itself guarantee that naming a skill cannot widen or
  inject — the query author does, and the permission gate above is what MJ enforces. Scopes that never
  reference `SkillID` are unaffected in either direction.

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [9cbe17f]
- Updated dependencies [5fc861f]
- Updated dependencies [28cd302]
- Updated dependencies [29c3dc8]
- Updated dependencies [905820a]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/aiengine@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/storage@6.1.0-edge.5
  - @memberjunction/ai-vectordb@6.1.0-edge.5

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
  - @memberjunction/ai@6.1.0-edge.4
  - @memberjunction/aiengine@6.1.0-edge.4
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/storage@6.1.0-edge.4
  - @memberjunction/ai-vectordb@6.1.0-edge.4

## 6.1.0-edge.3

### Minor Changes

- b6416f4: Search: verify that a result group's records belong to the entity it is attributed to

  `SearchEngine.filterEntityResults` groups results by `EntityName`, resolves that entity, checks
  `CanRead`, and then — when the entity has no row filter for the caller, or the caller is exempt from row
  filtering — admitted the whole group without checking the record ids were that entity's records at all.

  `CanRead` establishes that a user may read an entity. It does not establish that a result _is_ one of
  that entity's rows. And `EntityName` is provider output: the vector lane reads it from the vector's own
  `Entity` metadata key, and the 3rd-party lanes (Azure AI Search, Elasticsearch, Typesense, OpenSearch)
  use the index or collection name. Whoever populates an index therefore chose which entity's permissions
  were evaluated for its documents — label an index after an entity the caller can read, and its documents
  were admitted, with each result's Title, Snippet and RawMetadata rendered from that index's own metadata.

  The check now runs for those groups. It is the same query the row-filter path already used — a
  primary-key `IN` against the attributed entity's own view, keeping only the ids that come back — so this
  reuses an existing, tested code path rather than adding a mechanism.

  **Lanes that queried the entity directly are exempt, so the common path costs nothing.** An `entity` or
  `fulltext` result's ids came out of a `RunView` against that entity and are its records by construction.
  Everything else is verified, including any `SourceType` a 3rd-party provider defines — an allowlist, so
  an unanticipated source type is verified by default rather than trusted by default. A mixed group is
  partitioned: the self-evident results pass straight through and only the rest are queried.

  Row-filtered groups behave exactly as before; that path already verified ownership as a side effect of
  filtering. RLS-**exempt** callers are now verified too, deliberately: exemption says which _rows of an
  entity_ a user may see, not whether a result belongs to that entity.

  **Behaviour change worth noting before upgrading:** a deployment that has been returning results whose
  `EntityName` does not match the entity their ids belong to will see those results disappear. That is the
  intent, but it is a change — if search results drop after this upgrade, the labels were wrong, and
  `Residual permission filter removed N result(s)` in the log identifies where.

  `filterByRowLevelSecurity` is renamed `verifyOwnershipAndRowFilters` to match what it now does; it is
  private, so nothing outside the class is affected.

  **Why `minor` rather than `patch`:** this change is code-only, but it ships in the same branch as a
  `metadata/` JSONType addition, and the bump rule is evaluated per branch — see
  `.claude/rules/changesets.md`.

- ae2baef: Content vectors: declare the entity on the content source, and let `explicit` omit the per-vector key

  Minor rather than patch on both: this adds a property to the `ContentSource.Configuration` JSONType, so
  it changes metadata rather than code alone.

  `VectorSearchProvider` could attribute a match two ways: an `Entity` key in the vector's own metadata,
  or an Entity Document targeting the index. Neither covers the ContentSource pipeline running
  `fieldStrategy: 'explicit'`, where metadata carries only the configured fields — `ContentSourceID` is
  present, the identity keys are not — and where the caller may not use Entity Documents at all.

  That gap is not cosmetic. `SearchEngine.filterEntityResults` groups results by `EntityName` and
  resolves each group with `EntityByName()` to evaluate CanRead and row-level security. An unresolvable
  name yields no `EntityInfo`, the method returns before admitting the group, and **the results are
  silently discarded** — `Residual permission filter removed N result(s)` is the only trace.

  A content source can now declare what its vectors are, via `VectorEntityName` on its `Configuration`
  JSON — the same place every other per-source vector knob already lives (`EnableVectorization`,
  `VectorIDStrategy`, `ChunkTextStorage`, `VectorMetadata`). When a match omits `Entity`, its
  `ContentSourceID` resolves through `KnowledgeHubMetadataEngine.GetContentSourceByID()` — an O(1) lookup
  against an already-cached collection — to that declaration.

  **The declaration is validated before it is trusted, twice.** Whatever it resolves to becomes the
  entity whose CanRead and row-level security `filterEntityResults` evaluates, and that method never
  checks the matched record ids belong to it. So the name must (a) resolve in metadata — an unresolvable
  name would otherwise silently delete a source's results rather than mislabel them — and (b) be one of
  `MJ: Content Items` / `MJ: Content Item Chunks`, or an IS-A subtype of one. Without (b) an arbitrary
  entity name in a writable configuration blob would decide which permissions apply. The canonical name
  from metadata is what gets used, so casing and whitespace cannot fork the grouping.

  Two properties worth calling out, because they are why this sits where it does rather than being
  inferred from somewhere else:
  - **Per match, not per index.** One vector index can serve many content sources, so an index-wide
    answer is wrong as soon as a second source shares the index. `ContentSourceID` travels on the vector.
  - **Declared, not guessed** — and validated, per above. Since attribution decides _which_ entity's
    permissions are evaluated, an inferred or unchecked name would put the wrong object's rules in front
    of the records — worse than no attribution, which merely drops them.

  Declaring it per source also lets a source name an **ISA extension** instead of the base entity it
  inherits from. That distinction is a security one: row-level security typically lives on the
  extension, so a hardcoded or index-wide base-entity name evaluates the wrong entity's RLS.

  Resolution order is most-specific-first: the match's own `Entity` key, then its content source's
  declaration, then the index's Entity Documents, then `'Unknown'` as before. A source that declares
  nothing — or declares something that fails validation — is simply absent from the lookup, so its matches
  behave exactly as they do today.

  Also fixed, both pre-existing:
  - `convertMatches` applied the resolved fallback with `??` while the "does this match need one" test is
    falsy, so an `Entity: ''` resolved a name and then discarded it — the result was dropped with the
    resolution already paid for.
  - `convertMatches` had the same `??` on `RecordID`, so a producer writing `RecordID: ''` shipped an empty
    record id instead of falling through to the vector's own id — dropped by the permission filter on an
    `IN ('')`, or returned as a result that cannot be opened.

  `extractDisplayTitle` is deliberately left reading `meta['Entity']` rather than the resolved name, with a
  comment saying so. It looks like an oversight and is not: when the metadata carries no name fields it
  falls through to `` `${fallbackEntity} Record` ``, and that string is the sentinel
  `SearchEnricher.resolveRecordNames` matches to replace the title with the live name from the database.
  Feeding the resolved entity in makes the name-field branch succeed off the embedding-time snapshot, the
  sentinel never forms, and a renamed record shows a stale title until it is re-embedded.

  Failures decline rather than guess, and each declines narrowly: a source whose `Configuration` will not
  parse is skipped on its own (one guard per source, not one around the batch, so a single bad blob cannot
  downgrade every match after it to a different entity's permissions), and a `KnowledgeHubMetadataEngine`
  load that is **permission-constrained** declines explicitly instead of reading its empty collections as
  "nothing declared" — otherwise attribution would silently depend on who was searching.

  **Attribution failure is now audible.** A batch containing matches that no step could name logs the
  count, the index, a sample of vector ids, and the three ways to fix it — once per index per batch, and
  only when it happens. Before this, such matches were discarded by `filterEntityResults` with no log on
  that path at all; the sole trace was the aggregate `Residual permission filter removed N result(s)`,
  whose wording blames incomplete provider push-down. So the one signal a deployment got pointed away from
  the cause, which is why "vectors are in the index and never surface" was undiagnosable.

  **And the write side can now drop the key.** With a declaration in place, `'explicit'` genuinely omits
  `Entity` and writes `ContentSourceID` instead — the source becomes the single place the answer lives
  rather than a string repeated on every vector. Previously the key could not be removed by configuration
  at all on this pipeline: it is written _before_ the `explicit` early return (the EntityDocument pipeline
  has it the other way around), and there is no `IncludeEntity` toggle beside `IncludeEntityIcon` /
  `IncludeUpdatedAt` / `IncludeTags` / `IncludeText`.

  The declaration is validated where it is written, not only where it is read. It must resolve in
  metadata, and it must name `MJ: Content Item Chunks` or an IS-A subtype — because omission requires
  `'alwaysChunk'`, which makes every vector a chunk row whose id is a chunk key. A name that fails either
  check keeps the `Entity` key and logs once per run. This fails _safe_ rather than closed, and
  deliberately so: the reader can only refuse a bad declaration after the fact, by which point the vectors
  carry no entity at all, so correcting the configuration would not recover them without a re-embed.

  Omission is therefore gated on all four of `'explicit'`, a declaration resolving to the chunk entity,
  `ChunkTextStorage: 'alwaysChunk'` and `VectorIDStrategy: 'recordId'`, with
  `ContentSourceID` then written unconditionally. Each condition keeps the guarantee that every vector
  carries either `Entity` or a key that resolves to a declared entity:
  - **`'mixed'`** emits ContentItem-level vectors for single-chunk items and ContentItemChunk-level vectors
    for the rest — two entities from one source, which one declaration cannot describe.
  - **`'hash'`** leaves no recoverable record id, since `'explicit'` drops `RecordID` too and the vector's
    own id is a digest rather than the row's. Attribution would succeed and then hand search an id that
    resolves against no row — the same disappearance, one step later.
  - **Other field strategies** document a populated metadata set; dropping a key their consumers are told
    is always present would be a behavior change for them.

  Anything else keeps writing `Entity` exactly as before, and existing vectors are untouched — they keep
  resolving through their stored key (resolution step 1), so no re-index is required.

  Integration coverage comes with it: `IT — content-vectorization` gains CV7 (a declaring source omits
  `Entity`, promotes `ContentSourceID`, and its vector id is the chunk row's PK) and CV8 (three refusal
  paths — no opt-in, an unresolvable name, and a declaration naming the item entity — each keep the key).

  No schema change and no migration. It does add a property to the `ContentSource.Configuration` JSONType,
  so `mj sync push` + `mj codegen` are needed before the typed accessor exists; until then both sides read
  it through a locally-declared interface that is deleted at that point. Behaviour is unchanged for callers
  whose matches carry `Entity` metadata and for any index resolving through an Entity Document.

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
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
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [bc45ded]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/aiengine@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/storage@6.1.0-edge.3
  - @memberjunction/ai-vectordb@6.1.0-edge.3

## 6.1.0-edge.2

### Minor Changes

- 71817db: Make the entity-search per-entity timeout configurable and lower its default. `EntitySearchProvider`'s hard per-entity fan-out timeout was a `private static readonly PER_ENTITY_TIMEOUT_MS = 30_000`, so a deployment could not tune it. It is now a **public static `PerEntityTimeoutMS`** (default lowered from 30000ms to **3000ms**), mirroring the existing deployment-adjustable `PerEntityFetchDepth` static.

  The 3s default keeps interactive/omnibar fan-outs responsive by dropping a pathological entity promptly instead of stalling the whole fan-out. Deployments doing large unindexed LIKE scans that need the old behavior can raise it — either by assigning the static at startup or by overriding the default with an environment variable at process start:

  ```ts
  import { EntitySearchProvider } from "@memberjunction/search-engine";
  EntitySearchProvider.PerEntityTimeoutMS = 30_000;
  ```

  ```bash
  # equivalent env-var override, read once when the module loads
  MJ_SEARCH_PER_ENTITY_TIMEOUT_MS=30000
  ```

  All three deployment-adjustable search statics now accept an env-var default override, read once at module load (mirroring the `MJ_INTEGRATION_*` numeric ceilings):

  | Static                                       | Environment variable                        | Default |
  | -------------------------------------------- | ------------------------------------------- | ------- |
  | `EntitySearchProvider.PerEntityTimeoutMS`    | `MJ_SEARCH_PER_ENTITY_TIMEOUT_MS`           | `3000`  |
  | `EntitySearchProvider.PerEntityFetchDepth`   | `MJ_SEARCH_PER_ENTITY_FETCH_DEPTH`          | `15`    |
  | `FullTextSearchProvider.PerEntityFetchDepth` | `MJ_SEARCH_FULLTEXT_PER_ENTITY_FETCH_DEPTH` | `15`    |

  A positive value is floored to an integer. A value that is _present but invalid_ (non-numeric or non-positive) falls back to the built-in default and logs a `warning`-severity message so an ops-side typo surfaces at boot; an unset variable is silent.

  Behavior change: the per-entity timeout now defaults to 3000ms (was 30000ms). The constant also becomes public and writable (formerly private readonly).

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/aiengine@6.1.0-edge.2
  - @memberjunction/storage@6.1.0-edge.2
  - @memberjunction/ai-vectordb@6.1.0-edge.2

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
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/storage@6.1.0-edge.1
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ai-vectordb@6.1.0-edge.1
  - @memberjunction/aiengine@6.1.0-edge.1
  - @memberjunction/ai@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- 0acf96e: Make the SearchScope permission resolver replaceable.

  `SearchEngine` authorizes every search through `SearchScopePermissionResolver`, which answers from `__mj.SearchScopePermission` rows keyed by `UserID` or by one of the user's MJ Roles. That covers MJ's own permission model completely — but it is not the only shape a permission model can take, and until now it was the only one the search path could consult.

  A consumer whose entitlements are neither a user nor an MJ Role has no row that can express them. Its grants are therefore invisible to the check that actually runs, and the failure is silent in the worst way: the grant is configured, an administrator can see it, and the search simply returns nothing. The resolver was a module-level singleton imported directly by `SearchEngine`, so the only remedies were to project the consumer's model into `SearchScopePermission` as derived per-user rows — permission state that can drift from its source — or to fork the search path.

  This adds the seam that was missing:
  - **`SearchScopePermissionResolverBase`** — the abstract contract registrations bind to.
  - **`SEARCH_SCOPE_PERMISSION_RESOLVER_KEY`** — the ClassFactory key. There is exactly one resolver per deployment (a consumer _replaces_ the policy rather than selecting among several), so a single shared key is the right shape, and it keeps the registry free of the keyless-registration warning.
  - **`GetSearchScopePermissionResolver()`** — returns the highest-priority registration, falling back to MJ's own.

  **Every path that authorizes a scope now goes through the seam**, not just `SearchEngine`. This matters more than it sounds: a seam honoured on some paths and not others is worse than no seam, because the resulting behaviour is inconsistent rather than merely absent — the same grant authorizes a search issued one way and silently denies it issued another. The five call sites are `SearchEngine.searchOneScope`, `SearchKnowledgeResolver` (both the single-scope check and the visible-scope-list filter), `SearchKnowledgeStreamResolver`, and the `__Scoped_Search` core action. The last is the agent-facing path, so an override that did not reach it would be invisible to exactly the callers most likely to need it.

  Resolution happens per call rather than being cached at module load. A registration made during application startup would otherwise be missed depending on import order — a failure mode that presents as "my resolver works in tests but not in the server", which is expensive to diagnose. The class is stateless and construction is trivial, so there is nothing to gain by caching.

  The intended shape for an override is to subclass the stock resolver and compose with it, **passing no priority**:

  ```ts
  @RegisterClass(
    SearchScopePermissionResolverBase,
    SEARCH_SCOPE_PERMISSION_RESOLVER_KEY,
  )
  export class MyResolver extends SearchScopePermissionResolver {
    public override async ResolveEffectivePermission(
      input: ResolvePermissionInput,
    ) {
      const stock = await super.ResolveEffectivePermission(input);
      if (stock.Allowed) return stock; // never narrow what MJ already granted
      return this.myOwnGrantCheck(input); // only ever widen
    }
  }
  ```

  Subclassing is what orders the registration, and it does so more reliably than a number can. `ClassFactory.Register` treats an omitted priority as _one higher than the highest already registered for this (base, key)_, and a subclass cannot be defined without its parent module having loaded first — so MJ's registration always runs before the consumer's, and the consumer always lands above it. The ordering is a side effect of the language rather than a convention anyone has to remember.

  A hardcoded priority forfeits that. Two consumers that pick the same number collide, `Register` warns, and resolution degrades to whichever was registered last — a load-order bug wearing the costume of a configuration value. The priority argument stays for cases where subclassing is genuinely impossible.

  **Nothing changes for existing consumers.** MJ's resolver registers itself as the default, so behaviour is identical when nothing else is registered. `DefaultSearchScopePermissionResolver` is retained and still exported so existing imports keep compiling; it is marked `@deprecated` because it always yields MJ's own implementation and therefore bypasses any registered override.

  The failure posture is unchanged and worth restating for anyone writing an override: `SearchEngine` treats a resolver throw as **denied**, never as allowed. An override that cannot reach its own store must not accidentally open a scope.

  7 tests covering the default, the fallback, an honoured registration, late registration (imperative, because `@RegisterClass` evaluates at module load and so cannot demonstrate lateness), composition with `super`, the deprecated constant, and that a subclass of the stock resolver satisfies the base contract.

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [1100077]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/aiengine@6.1.0-edge.0
  - @memberjunction/storage@6.1.0-edge.0
  - @memberjunction/ai-vectordb@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/aiengine@6.0.0
  - @memberjunction/ai-vectordb@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/storage@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/aiengine@5.51.0
  - @memberjunction/ai-vectordb@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/storage@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Minor Changes

- 0686d52: Add content cleaning, adaptive-boundary and paged segmentation, and chunk-aware external search mapping — all from PR review feedback.

  **Cleaning is now its own plug-in stage** (`@memberjunction/ai-segmentation`). Segmenting dirty content produces well-bounded garbage: navigation, sidebars, cookie banners, and advertising usually outweigh the article, and because that chrome repeats across every page of a site it yields many near-identical chunks that crowd out real answers.
  - `BaseContentCleaner` — resolved through the class factory like segmenters, via `ResolveContentCleaner` / `SuggestCleanerKey`.
  - `HtmlContentCleaner` (`Html`) — CSS-selector-driven extraction. `IncludeSelectors` is the high-leverage knob: naming the element that holds the content discards everything else without enumerating what to drop. `ExcludeSelectors` handles what survives inside it. An invalid selector is skipped rather than failing the clean, and if cleaning would remove everything the original is returned with a warning.
  - `PlainTextContentCleaner` (`PlainText`) — whitespace normalization and truncation, preserving the paragraph breaks segmenters use as boundaries.

  **`AdaptiveBoundarySegmenter` (`AdaptiveBoundary`)** targets a size and closes on the nearest natural break, escalating through boundary quality: paragraph → sentence → word → hard ceiling. Segment sizes vary on purpose — a slightly short segment ending at a paragraph beats an exactly-sized one ending mid-clause. It also declines to split when the whole text is only modestly over target, avoiding one full chunk plus a context-free runt. `TargetTokens` should be sized to your **queries**, not to the embedding model's context window, which is an upper bound rather than a goal.

  **`PagedContentSegmenter` (`PagedContent`)** emits one segment per page of a paginated source via the new `SegmentationParams.Pages`, preserving `PageNumber` for citation-grade provenance. A page may carry text, a rendered-page media reference, or both — the both case is what allows embedding a PDF page _as an image_ (preserving tables and charts that text extraction flattens) while its text rides along for lexical search. Pages carrying media are never merged, so their provenance stays true.

  **`@memberjunction/search-engine`** gains `ExternalHitMapper`, a shared field mapping now used by all four external providers (Azure AI Search, Elasticsearch, OpenSearch, Typesense) instead of four inline copies. It resolves snippets from `description` and `transcript` in addition to the conventional `content`/`body`/`text`, so a media chunk returns readable text rather than an empty snippet, and recovers chunk provenance (`chunkId`, `modality`, `startMs`/`endMs`, `pageNumber`) into the result's `RawMetadata` — which is what lets a hit deep-link to a moment in a recording or a page in a PDF. Field names are matched across camelCase, PascalCase, and snake_case, and numeric strings are coerced, since external indexes are populated outside MJ.

  Also fixes `BaseSegmenter` rejecting a params object that carried only `Pages`.

- c7b6710: Make Scoped Search dimensions enforceable so a dimension can carry an access decision rather than being a narrowing convenience any caller — including an LLM writing a tool call — could author. `SearchScope.SearchContextConfig` documented `dimensions[]`, `inheritanceMode` and `strictValidation` but no runtime code read any of it.

  A `restricts: true` dimension is now server-derived: a caller-supplied value is discarded, not merged, and the attempt is recorded in provenance. Values are grammar-checked, `freetext` is prohibited in filter positions, and every interpolated value is escaped automatically for its lane's dialect (SQL / OData / JSON / Typesense / path), keyed off the existing `IndexType`. `narrowingOf` is a lattice meet, so a caller may narrow a server bound but never widen it.

  A Skill becomes a search principal alongside an Agent, and scope grants gain a time window plus a tenant key. `RequiredMetadataKeys` catches a filter that rendered _partially_ — the case no other guard can see, where an optional clause vanishes because its dimension was absent or discarded and the lane silently searches wider than intended. Supersession (`advisory` + ordered rules) composes by subtraction and fails soft, deliberately outside the boundary. `ExplainScope()` reports what a search would be able to reach without running one, and the same structure is written to `SearchExecutionLog.ScopeDecisionJSON`.

  Fixes four security bugs, two live on `next`: the result-cache key omitted `ScopeIDs` and `SearchContext` (cross-tenant result leak within the 30s TTL); six provider call sites silently dropped a filter whose rendered value had the wrong shape and then queried unfiltered; a restricting template that rendered to nothing was indistinguishable from one never authored; and `inheritanceMode` was itself declared-and-unread.

  Additive throughout — a scope with no declaration behaves exactly as before, and no existing filter template needs an edit.

### Patch Changes

- 764d6f6: Fix three client-reported issues (search coverage, Configure App dialog, default-app provisioning):
  - **C3 — Search coverage:** decouple the per-entity fetch depth from the global `topK` budget in both `EntitySearchProvider` and `FullTextSearchProvider` (new tunable `PerEntityFetchDepth`, default 15), so multi-entity searches no longer starve individual entities of results. Also lower `MIN_TERM_LENGTH` from 3 to 2 across the engine and both providers so short queries (e.g. "US", "AI") are searchable.
  - **F1 — Configure App dialog glitch:** the `[(ShowDialog)]` setter now emits `ShowDialogChange`, so the app-switcher's flag round-trips correctly; the dialog resets its app lists on open/close and reloads the user's applications on a deferred microtask (avoids `ExpressionChangedAfterItHasBeenCheckedError`). Removed the redundant double-drive in the app switcher.
  - **F2 — Default-app provisioning (`Status = 'Active'` filter):** the JWT new-user provisioning path selected default applications with `DefaultForNewUser` but **without** the `Status = 'Active'` check that the client self-heal path already applied, so an inactive app flagged `DefaultForNewUser` could be provisioned onto new users there. Both paths now use a single shared selector, `UserInfoEngine.GetDefaultApplicationsForNewUser`, which filters to Active + `DefaultForNewUser` in `DefaultSequence` order — eliminating the drift.

- 408e4bf: Use `UUIDsEqual` instead of `===` when matching rendered constraints to their scope rows in `SearchEngine.buildLaneExplanations` (external-index, entity and storage-account lanes).

  PostgreSQL returns UUIDs lowercased where SQL Server returns them uppercased, so on a case mismatch the `find` returned `undefined` and the lane reported `RenderedFilter: null` — `ExplainScope` telling an admin a lane carries no filter when it does. Silent, and a wrong answer from the one feature whose purpose is answering that question. Also unbreaks the `Unit Tests` job on `next`, where the repo's `UUIDCompliance` gate flagged the three comparisons.

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [c221553]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/storage@5.50.0
  - @memberjunction/aiengine@5.50.0
  - @memberjunction/ai-vectordb@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- 15e3017: Add optional embedding dimensions, per-record Pinecone namespace routing, and scope-level provider config support.

  **`@memberjunction/ai`** — Add optional `dimensions` field to `EmbedTextParams`, `EmbedTextsParams`, and `EmbedContentParams`. When provided, overrides the model's native output dimension (only effective on models that support it, e.g. OpenAI `text-embedding-3-*`).

  **`@memberjunction/ai-openai`** — `OpenAIEmbedding.EmbedText` and `embedBatch` now forward `params.dimensions` to the OpenAI embeddings API when set.

  **`@memberjunction/ai-vectordb`** — Three additive changes to the vector DB abstraction layer:
  - `VectorRecord` gains an optional `providerTemporaryDirectives` field — an MJ-internal routing map set by ingestion and stripped before any external upsert.
  - `QueryParamsBase` gains an optional `providerConfig` field — an opaque blob sourced from the scope's rendered `ExternalIndexConfig`, threaded through to the driver at query time.
  - `VectorDBBase` gains a `BuildProviderDirectives(sourceRecord, providerConfig)` hook (default: returns `{}`) that drivers override to extract per-record routing values (e.g. namespace) from the raw source row.
  - `CreateRecord` and `CreateRecords` signatures gain an optional `providerConfig` parameter.

  **`@memberjunction/ai-vectors-pinecone`** — Full namespace routing support:
  - `BuildProviderDirectives` reads `providerConfig.namespaceField`, looks up that field on each source record, and returns `{ namespace: '<value>' }` so records are routed to the correct Pinecone namespace during ingestion.
  - `CreateRecords` groups a mixed batch by namespace and issues one `upsert` per distinct namespace; falls back to a single-namespace path when no per-record directives are present.
  - `QueryIndex` extracts `providerConfig.namespace`, calls `index.namespace(ns)` when present, and strips the field before passing params to the Pinecone SDK.
  - `providerTemporaryDirectives` is stripped from each `VectorRecord` before any upsert call.

  **`@memberjunction/ai-vector-sync`** — Sync pipeline now reads `VectorIndex.Dimensions` and `VectorIndex.ProviderConfig` and threads them through:
  - `Dimensions` is forwarded to `EmbedTexts` so the embedding model produces vectors at the configured size.
  - `ProviderConfig` (parsed from JSON) is forwarded to `upsertBatchToVectorDB`, which passes it to `BuildProviderDirectives` per record and to `CreateRecords`.
  - Metadata value storage is now type-aware: SQL numeric types (`int`, `float`, `decimal`, etc.) are stored as JS numbers; a new `storeAs` field config supports `'epochSeconds'` and `'epochMilliseconds'` for datetime columns, `'number'`, and `'boolean'`.

  **`@memberjunction/search-engine`** — `ExternalIndexConfig` on scope external-index rows is now treated as a Nunjucks template: it is rendered against the caller's `SearchContext` before being JSON-parsed. The rendered object (e.g. `{ namespace: '<orgId>' }`) is forwarded as `providerConfig` through `VectorSearchProvider.queryOneIndex` to the vector DB driver. `VectorIndex.Dimensions` is also forwarded to the query-time embedding call.

- 78a5e44: Vector sync: portable record IDs, minimal-metadata mode, and explicit-inclusion field fixes
  - **New `vectorIdStrategy` on `EntityDocumentConfiguration`** — `'hash'` (default, unchanged SHA-1 behavior) or `'recordId'`, which uses the source record's primary key value directly as the vector database ID. UUIDs are normalized to lowercase for SQL Server / PostgreSQL portability; composite PK values are joined with `||`; empty keys and IDs over the 512-byte provider limit fail loudly.
  - **New `fieldStrategy: 'explicit'`** — vector metadata contains EXACTLY the configured fields: the system-injected keys (`RecordID`, `Entity`, `TemplateID`) are omitted and `includeEntityIcon` / `includeUpdatedAt` flip to opt-in. Existing `'all'` / `'include'` / `'exclude'` strategies are byte-for-byte unchanged.
  - **Explicit inclusion now wins over type heuristics** — under `'include'` / `'explicit'`, fields listed with `included: true` are honored even when the implicit-eligibility filter would skip them (uniqueidentifiers, PKs, `__mj_*` fields). Only genuinely unstorable binary column types are refused, with a logged warning instead of a silent drop. Uniqueidentifier metadata values are normalized to lowercase so metadata filters behave identically across database platforms.
  - **SearchEngine `VectorSearchProvider`** — when a match's metadata omits the `Entity` key (e.g. indexes populated with `fieldStrategy: 'explicit'`), the provider now resolves a fallback entity name from the index's entity documents (cached per index, only when unambiguous) instead of labeling results `Unknown`. Record identity already falls back to the vector ID when `RecordID` metadata is absent.

  Note: switching an already-populated index to `vectorIdStrategy: 'recordId'` orphans vectors written under the old hashed IDs — purge or re-create the index (or use a fresh namespace) when changing strategy.

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [a9ec419]
- Updated dependencies [42a680a]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/ai-vectordb@5.49.0
  - @memberjunction/aiengine@5.49.0
  - @memberjunction/storage@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [c20723a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/aiengine@5.48.0
  - @memberjunction/ai-vectordb@5.48.0
  - @memberjunction/storage@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/aiengine@5.47.0
  - @memberjunction/ai-vectordb@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/storage@5.47.0
  - @memberjunction/ai@5.47.0
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
  - @memberjunction/ai-vectordb@5.46.0
  - @memberjunction/storage@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/aiengine@5.45.1
- @memberjunction/ai@5.45.1
- @memberjunction/ai-vectordb@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/core-entities@5.45.1
- @memberjunction/global@5.45.1
- @memberjunction/storage@5.45.1

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
  - @memberjunction/aiengine@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ai-vectordb@5.45.0
  - @memberjunction/storage@5.45.0
  - @memberjunction/ai@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [89ea055]
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
  - @memberjunction/ai@5.44.0
  - @memberjunction/ai-vectordb@5.44.0
  - @memberjunction/storage@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ai@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/aiengine@5.43.0
  - @memberjunction/ai-vectordb@5.43.0
  - @memberjunction/storage@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [9b9b484]
- Updated dependencies [0c6bf61]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/aiengine@5.42.0
  - @memberjunction/ai-vectordb@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/storage@5.42.0
  - @memberjunction/ai@5.42.0

## 5.41.0

### Patch Changes

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
- Updated dependencies [1568bae]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ai@5.41.0
  - @memberjunction/aiengine@5.41.0
  - @memberjunction/ai-vectordb@5.41.0
  - @memberjunction/storage@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai@5.40.2
- @memberjunction/aiengine@5.40.2
- @memberjunction/ai-vectordb@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2
- @memberjunction/storage@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/aiengine@5.40.1
  - @memberjunction/ai-vectordb@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/storage@5.40.1
  - @memberjunction/ai@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/aiengine@5.40.0
  - @memberjunction/ai-vectordb@5.40.0
  - @memberjunction/storage@5.40.0
  - @memberjunction/ai@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- 7dfacc7: Add support for storing and querying embeddings inside the application's own database instead of a separate vector service. `VectorDBBase` gains an `IColocatedVectorHost` adapter (implemented by the PostgreSQL and SQL Server data providers) and a `ColocatedQuery` API; the new `PgVectorColocated` provider does vector + keyword (RRF) search in one statement, and the new `@memberjunction/ai-vectors-sqlserver` package adds a SQL Server 2025 native `VECTOR` provider with sibling-table and entity-column storage modes. `VectorSearchProvider` and `EntityVectorSyncer` route these indexes through the borrowed connection.
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [7dfacc7]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/ai-vectordb@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0
  - @memberjunction/aiengine@5.39.0
  - @memberjunction/storage@5.39.0

## 5.38.0

### Patch Changes

- 6a3ac36: Fix AllowUpdateAPI clearing when EntityField transitions to virtual, use subqueries for organic key INSERTs for portable SQL, prevent permanent engine failure when MJAPI is temporarily unavailable, and centralize RLS exemption check in GetUserRowLevelSecurityWhereClause
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
  - @memberjunction/ai-vectordb@5.38.0
  - @memberjunction/storage@5.38.0
  - @memberjunction/ai@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/aiengine@5.37.0
  - @memberjunction/ai-vectordb@5.37.0
  - @memberjunction/storage@5.37.0
  - @memberjunction/ai@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/aiengine@5.36.0
  - @memberjunction/storage@5.36.0
  - @memberjunction/ai-vectordb@5.36.0
  - @memberjunction/ai@5.36.0
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
  - @memberjunction/aiengine@5.35.0
  - @memberjunction/ai-vectordb@5.35.0
  - @memberjunction/storage@5.35.0
  - @memberjunction/ai@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/aiengine@5.34.1
  - @memberjunction/ai-vectordb@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/storage@5.34.1
  - @memberjunction/ai@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Minor Changes

- ae5cfbd: Search Scopes & RAG+ — multi-phase ship

  A bundled feature release across the search pipeline (Phases 2A–6 of
  the Search Scopes & RAG+ initiative). Highlights:

  **SearchEngine pipeline**
  - New `SimpleVectorDatabase` in-process driver — points
    `VectorDBBase` at any entity column with an `EmbeddingVector`
    field. Suitable for dev / agent-memory / small-medium corpora.
    Constructor accepts an empty/missing API key (in-process driver
    has no remote auth target).
  - `VectorDBBase.QueryIndex(params, contextUser?)` — `contextUser`
    is now a proper second parameter instead of being smuggled
    through `filter.__contextUser`. Pinecone/Qdrant/pgvector ignore
    it (they auth via API key); in-process drivers use it for
    RunView's server-side RLS guard. Method-level pattern matches
    MJ's `RunView(params, contextUser)` and `GetEntityObject(name,
contextUser)` conventions.
  - `SearchFusion` — multi-provider score evidence is now preserved
    through RRF. Previously the second provider's `ScoreBreakdown`
    contribution was silently dropped when the same RecordID
    appeared in two provider lists, causing the merged item to
    rank below single-provider hits. Records that match in
    Vector + Entity now carry both contributions and rank
    correctly.
  - Defensive sanitation in `Fuse()` — items with non-finite Score
    (NaN, Infinity), empty/non-string RecordID, or null payloads are
    filtered before fusion. Closes a class of failure modes from
    misbehaving 3rd-party providers.
  - Tier-1 input edge cases hardened — null/undefined/non-string
    Query no longer TypeErrors, surfaces a clean Failure result.
    `EntitySearchProvider` now strips SQL LIKE wildcards (`%`, `_`,
    `[`, `]`) from user input — `Query="%"` no longer matches every
    row through the LIKE-injection vector.
  - Streaming search — `SearchEngine.streamSearch()` v2 emits
    provider events as soon as each provider promise settles
    (concurrent emission), not in registration order.

  **Permission gate (Phase 2A)**
  - `SearchScopePermissionResolver` enforces a 6-step decision tree:
    AgentNone → AgentAssignedNotListed → DirectGrant → RoleGrant →
    AgentUnscopedAll → NoGrant.
  - `AIAgent.SearchScopeAccess` enum (`'None' | 'All' | 'Assigned'`)
    controls agent-side fallback when no per-user/per-role grant
    applies. `BypassCache` propagates through the dedup-linger cache
    so freshly-revoked grants take effect immediately.
  - New tests + agent scenarios cover all 13 permission-matrix cells
    (PM-01..PM-13).

  **Reranker catalog (Phase 2D)**
  - 4 reranker drivers — Cohere, Voyage, OpenAI judge, BGE local —
    all with `@RegisterClass(BaseReRanker, ...)`. Per-search
    `RerankerBudgetGuard` caps API spend; `EstimateCostCents` and
    `CostReporter` per driver. Graceful degradation when the
    upstream SDK rejects/times out/returns malformed responses.

  **Observability (Phase 3)**
  - `MJSearchExecutionLog` — every `Search()` invocation writes one
    row with Status / ResultCount / TotalDurationMs / RerankerCostCents
    / ProvidersJSON (per-source hit counts) / AIAgentID attribution.
    Forbidden gate decisions log `Status='Forbidden'` rows.
  - Knowledge Hub Config dashboard subtab visualizes the log:
    hit-rate, p50/p95 latency, top failure reasons, top users, total
    reranker cost.

  **External providers (Phase 5)**
  - 4 search providers — Elasticsearch, Typesense, Azure AI Search,
    OpenSearch — all with `@RegisterClass(BaseSearchProvider, ...)`.
  - New `AvailableSearchProviders` GraphQL query exposes the
    `BaseSearchProvider.GetAvailableProviders()` runtime catalog to
    the SearchScope form's provider dropdown (P5.5).

  **Angular / UI**
  - Custom `MJSearchScopeFormComponentExtended` (P2D.7 / P4) — fusion
    weights sliders, reranker dropdown, live-preview panel, A/B
    Kendall-tau similarity, CSV export of last 500 invocations.
  - Custom `MJSearchScopeProviderFormComponentExtended` (P5.5) —
    provider dropdown sourced from `MJ: Search Providers` rows,
    annotated with whether each provider's DriverClass is currently
    registered with the server's ClassFactory.
  - Streaming search consumer in `SearchService.StreamSearch()` —
    Angular Observable surface for the `StreamScopedSearch`
    mutation + `SearchStreamEvents` subscription.

  **Migration**
  - `V202605081416__v5.34.x__Search_Scopes_And_RAG_Plus.sql` —
    consolidated. Contains six DDL sections (Phase 1 baseline,
    `SearchScopePermission`, `SearchScope.RerankerBudgetCents`,
    `SearchExecutionLog`, `SearchScopeTestQuery`, unique-constraint
    fix) followed by five CodeGen runs that regenerate the entity
    metadata, sprocs, views, and permission grants for all of the
    above.

  **Test suite**
  - 17 end-to-end agent scenarios (s01–s17) under `agent-scenarios/`,
    driving real LLM tool-calls (Sage agent) against the SearchEngine
    - multi-provider RRF + reranker pipeline. 95 assertions; all PASS.
  - `@memberjunction/search-engine` vitest: 237 unit tests across 21
    files, all PASS. Covers fusion, providers (real + external),
    rerankers, scope template renderer, parent-ID metadata,
    streaming, permission resolver, edge cases, mid-flight failures.

  **Documentation**
  - `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` — comprehensive guide
    covering scope creation, agent integration, permission resolution,
    multi-scope fusion, reranker catalog, observability, external
    providers, how-to templates for adding a new provider /
    reranker / artifact tool library / vector index over an
    embedded entity column. Documents the embedding-regeneration
    contract for ops.

  See `RAG_plan.md` for the full multi-phase plan and `plans/
search-scopes-rag-plus/what-we-built.md` for the customer-facing
  summary.

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
  - @memberjunction/ai-vectordb@5.34.0
  - @memberjunction/storage@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0

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

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/aiengine@5.33.0
  - @memberjunction/ai-vectordb@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/storage@5.33.0
  - @memberjunction/ai@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/aiengine@5.32.0
  - @memberjunction/ai-vectordb@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/storage@5.32.0
  - @memberjunction/ai@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [84494bb]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/ai@5.31.0
  - @memberjunction/aiengine@5.31.0
  - @memberjunction/ai-vectordb@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/storage@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai@5.30.1
- @memberjunction/aiengine@5.30.1
- @memberjunction/ai-vectordb@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/storage@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/aiengine@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/storage@5.30.0
  - @memberjunction/ai-vectordb@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/aiengine@5.29.0
  - @memberjunction/ai-vectordb@5.29.0
  - @memberjunction/storage@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/aiengine@5.28.0
  - @memberjunction/ai-vectordb@5.28.0
  - @memberjunction/storage@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/aiengine@5.27.1
  - @memberjunction/ai-vectordb@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/storage@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ai@5.27.0
- @memberjunction/aiengine@5.27.0
- @memberjunction/ai-vectordb@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0
- @memberjunction/storage@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/aiengine@5.26.0
  - @memberjunction/storage@5.26.0
  - @memberjunction/ai-vectordb@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Minor Changes

- e96f683: migration/metadata

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/aiengine@5.25.0
  - @memberjunction/ai-vectordb@5.25.0
  - @memberjunction/storage@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/global@5.25.0

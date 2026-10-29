# @memberjunction/ai-agent-harness

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

- Updated dependencies [622f166]
- Updated dependencies [68bb7e4]
- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [cc41d33]
- Updated dependencies [281724a]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [142d524]
- Updated dependencies [0ff7523]
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
  - @memberjunction/ai-core-plus@6.2.0-edge.6
  - @memberjunction/ai-agents@6.2.0-edge.6
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/templates@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- d26183d: Fix CodeQL insecure-randomness and filesystem-race findings in runtime code (#5574).
  - **Open App installs** download migration and teardown SQL into a fresh private temp directory (`mkdtempSync`) instead of a predictable `mj-app-<name>-<timestamp>` path that reused any directory already there.
  - **Password generation** picks and shuffles characters with `crypto.randomInt`, removing the modulo bias of `randomBytes % length`.
  - **Number pool `Random` selection** and the **Pi harness session id** use `node:crypto` instead of `Math.random`.
  - **SQL log reads** drop the existence check before reading; a missing file is still reported through the existing `ENOENT` handling.

- Updated dependencies [0d81c53]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [fd780a9]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [db39145]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [0cc6b08]
- Updated dependencies [db50c6b]
- Updated dependencies [afc1e0e]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [5465489]
- Updated dependencies [d29b5c2]
- Updated dependencies [0ab85d7]
- Updated dependencies [9d1eb6a]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [2274f42]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [542795b]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [fcc3f03]
- Updated dependencies [230cdad]
- Updated dependencies [7e72c86]
- Updated dependencies [0cc6b08]
- Updated dependencies [4e4c82d]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [8420f36]
- Updated dependencies [72dd65c]
- Updated dependencies [1d29837]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/ai-agents@6.2.0-edge.5
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/ai-core-plus@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/templates@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- Updated dependencies [96d6ec2]
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
- Updated dependencies [b699a37]
- Updated dependencies [bd0ee83]
- Updated dependencies [fd2a410]
- Updated dependencies [0dbd455]
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
- Updated dependencies [d86bcbc]
- Updated dependencies [aaf74ca]
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
- Updated dependencies [8bac4d6]
- Updated dependencies [08b3d7b]
- Updated dependencies [35d3c95]
- Updated dependencies [dbc3462]
- Updated dependencies [5a3de97]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [7177e09]
- Updated dependencies [8704df6]
- Updated dependencies [5345e3d]
- Updated dependencies [1ea4085]
- Updated dependencies [975948b]
- Updated dependencies [22c9074]
- Updated dependencies [88b85fc]
- Updated dependencies [45359c6]
- Updated dependencies [aee2d53]
- Updated dependencies [5dc3752]
- Updated dependencies [8ed4049]
- Updated dependencies [6c8798b]
- Updated dependencies [f0c78c3]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d0df5a1]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [02bb563]
- Updated dependencies [a66f4b0]
- Updated dependencies [afe9eb4]
- Updated dependencies [90829e3]
- Updated dependencies [aac148b]
- Updated dependencies [f2f6f4b]
- Updated dependencies [9ce70b3]
- Updated dependencies [bc0e36f]
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
- Updated dependencies [d2ccfef]
- Updated dependencies [6b487b8]
  - @memberjunction/ai-agents@6.2.0-edge.4
  - @memberjunction/ai-core-plus@6.2.0-edge.4
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/templates@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [b545842]
- Updated dependencies [24ddecc]
- Updated dependencies [279b93e]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [bea2386]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [4840fff]
- Updated dependencies [ec97ad4]
- Updated dependencies [49e0bd8]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/ai-agents@6.2.0-edge.3
  - @memberjunction/ai-core-plus@6.2.0-edge.3
  - @memberjunction/templates@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- 200e634: Round 16 memory-leak audit fixes: bound three previously-unbounded caches and fix a dead process-kill escalation.
  - `RealtimeClientSessionService`'s `sessionWireActionMaps`/`targetWireActionMaps`/`sessionDirectConfigs` and `bridge-room-transcript-sink.ts`'s `roomToConversation`/`writeChains` were plain `Map`s on process-lifetime objects with no session/room-ended hook to evict on — every realtime voice session or meeting room ever handled left a permanent entry. Converted to `MJLruCache` (bounded, TTL'd), mirroring the same file's existing `promptRunWriteChains` pattern.
  - `EntityActionEngineServer.RunEntityAction()` constructed a fresh `EntityActionInvocationBase` on every single dispatch instead of reusing one per invocation type, silently discarding the Script invocation type's own `_scriptCache` before a second lookup could ever hit it. Added an instance cache keyed by `InvocationType.Name`.
  - `ChildProcessExecutor`'s `Kill()` sent only `SIGTERM` with no `SIGKILL` follow-up, on the hot path of every AI-agent CLI turn. Added a `SIGTERM`→5s grace→`SIGKILL` escalation.
  - While testing that escalation, found `WorkerPool.Shutdown()`'s own `SIGTERM`→`SIGKILL` escalation — believed correct since this audit's Round 10 — was dead code: `ChildProcess.killed` is set `true` synchronously once `kill()` sends a signal, not once the process exits, so the old `if (!worker.process.killed)` guard never actually fired `SIGKILL`. Fixed to key off the process's `exit` event instead.

  No behavior changes on any success path; all four packages' full test suites pass with new coverage for each fix.

- Updated dependencies [ca853fc]
- Updated dependencies [f555162]
- Updated dependencies [043f418]
- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [2552b1e]
- Updated dependencies [21f9e15]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [672b4c6]
- Updated dependencies [f3c6161]
- Updated dependencies [0e5ad68]
- Updated dependencies [5148534]
- Updated dependencies [50ba290]
- Updated dependencies [ffb3c0f]
- Updated dependencies [0adaf76]
- Updated dependencies [ce1a5c3]
- Updated dependencies [ef43cf3]
- Updated dependencies [b03a928]
- Updated dependencies [b44c7cf]
- Updated dependencies [0d61b53]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [705ab4e]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [f3fa01e]
- Updated dependencies [3276daa]
- Updated dependencies [d0cea53]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [200e634]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [bb33c77]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/ai-agents@6.2.0-edge.2
  - @memberjunction/ai-core-plus@6.2.0-edge.2
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/templates@6.2.0-edge.2

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
- Updated dependencies [15a4333]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [5da3ad2]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [c261eb8]
- Updated dependencies [307da67]
- Updated dependencies [a7da50b]
- Updated dependencies [1d43161]
- Updated dependencies [7110019]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
- Updated dependencies [c4993f3]
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/ai-agents@6.2.0-edge.1
  - @memberjunction/ai-core-plus@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/templates@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [abf8778]
- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [37891d3]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [e3db74f]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [d665a6e]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
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
  - @memberjunction/ai-agents@6.2.0-edge.0
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/ai-core-plus@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/templates@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Minor Changes

- 394d276: External agent harnesses as a new MJ agent type — plus a cost-guardrail fix that affects every agent

  An MJ agent can now be executed by an **external agent harness** (Claude Code, Codex CLI, OpenCode,
  Gemini CLI, Pi) running in a sandbox, while MemberJunction keeps identity, permissions, governed data
  access, payload contracts, HITL, cost control and run-level audit.

  **A harness turn is protocol-identical to a Loop iteration.** The harness reasons freely inside its
  sandbox, then ends its turn by emitting the same next-step JSON envelope a Loop model emits. MJ
  executes any actions, sub-agents or skills through its own validated machinery and resumes the
  session with the results. That is why every existing guarantee — next-step validation, per-action
  `MaxExecutionsPerRun`, skill gates, plan-mode blocking, `PayloadManager` ACLs,
  `checkExecutionGuardrails`, run-step recording — applies with no new enforcement code, and why there
  is one authority channel to audit rather than two. `HarnessAgentBase` overrides exactly one method,
  `executePrompt`.

  New schema, all additive: `MJ: AI Agent Harnesses` (the registry of launchable harnesses),
  `MJ: AI Agent Credentials` (the grant edge for secrets an agent carries into its sandbox — custody
  stays in `MJ: Credentials`), and `AIAgentRun.ExternalSessionID`. `CapabilitySettings` is a
  strongly-typed JSONType declaring what each adapter **actually implements**, because the runtime
  _emulates what is missing_ — an over-claim is a silent behavioural gap, not an error.

  **Also fixes `MaxCostPerRun` / `MaxTokensPerRun` for every agent type, not just harness agents.**
  The limits are static on the agent and were compared correctly, but the run's accumulated
  `TotalCost` / `TotalTokensUsed` were only written on terminal paths — so mid-run they sat at 0 and
  the checks short-circuited on a falsy zero. The ceilings were evaluated as a run _ended_: reporting,
  not guardrails. A runaway agent burned its whole budget and was told afterwards. Only the iteration
  and time limits actually interrupted a run. The totals are now refreshed before the comparison, with
  regression coverage verified to fail without the fix.

  Sandboxes: the **provider owns process placement**, delivered to adapters as a `SandboxExecutor`, so
  the same adapter runs on a laptop or inside a per-run container without knowing the difference. The
  local provider scopes a workspace directory but does **not** contain the process — `networkPolicy` is
  advisory there, which is documented rather than implied. `DockerSandboxProvider` enforces
  `networkPolicy: 'none'` for real.

  Known gaps, documented in the guide so nobody designs around a guarantee that does not exist:
  `PermissionHooks` is false on every adapter (the `strict` posture needs an MCP permission-prompt tool
  that is a later phase), `mcp-only`/`allowlist` are not packet-enforced, the MCP loopback is not yet
  wired, and `ModelID` uses the declared rather than the harness-reported model.

  Ships **not live**: every harness row is `Inactive` and `Demo Harness Agent` is `Pending`, because
  they depend on external binaries a fresh install will not have.

  See [`guides/AGENT_HARNESS_GUIDE.md`](../guides/AGENT_HARNESS_GUIDE.md).

### Patch Changes

- 394d276: Harness permissions: make policy enforcement a declared capability, and stop trusting prefix-matched command patterns

  MJ's harness permission policy was already abstract — declared in agent metadata, overridable at runtime, translated per-harness through `BaseHarnessAdapter.ApplyPermissionPolicy`. But only `ClaudeCodeCliAdapter` overrode that seam. The other four adapters inherited the inert base default, so a configured `strict` posture was **silently ignored**, and the runtime's warning checked `PermissionHooks` — a different question — so it never fired.

  **New `IHarnessCapabilitySettings.PermissionPolicy`** declares that an adapter actually translates the policy into flags the harness honours. Deliberately separate from `PermissionHooks`, which is about _interactive_ mid-turn approval: Claude Code enforces a static policy while having no hook to pause on, and conflating the two is precisely what hid this. `HarnessAgentBase` now logs an error when a policy is configured against an adapter reporting `false`, so an operator is never left believing something is gated. It warns rather than refusing — an unenforced policy on a properly-provisioned sandbox is still contained by the sandbox, and failing the run would take every unverified adapter offline.

  **Pi now enforces**, using flags verified against a real install (`--tools` / `--exclude-tools`): `strict` → `read,grep,find`; `auto` → additionally `edit,write` but no shell (the `acceptEdits` analogue); `dangerous` → no flag at all. Because Pi gates on **exact tool names**, `strict` is genuinely enforceable there, unlike on Claude Code where it degrades to prompts that have nowhere to go headlessly. MJ's tool vocabulary is translated to Pi's (`Glob`→`find`, `Bash`→`bash`) by the adapter, so a policy is authored once regardless of harness.

  Pi cannot express command-scoped patterns like `Bash(git:*)`, and those **fail closed in both directions**: a command-scoped _allow_ is dropped, because granting the whole tool would hand over strictly more authority than the policy asked for; a command-scoped _deny_ is widened to the whole tool, because denying more than asked is the safe direction.

  Codex, Gemini CLI, OpenCode and the generic stdio adapter declare `PermissionPolicy: false`. Their CLIs' permission flags could not be verified against a real install, and guessing them produces exactly the failure this capability exists to surface — a policy that looks applied and is not.

  **Claude Code's Bash patterns are PREFIX-LITERAL, and that is now documented as a rule rather than a caveat.** Proven live: a `Bash(git:*)` allow paired with a `Bash(git commit:*)` deny let `git -C <path> commit` execute, because any flag before the subcommand defeats the prefix. The run failed only because nothing happened to be staged. So: deny whole tool names — an exact match, no prefix involved — or allow fully-specified commands; never carve dangerous subcommands out of a broad allow. Tool-pattern lists are hygiene, not a security boundary. Real containment comes from the sandbox provider, and the `local` provider offers none.

  The shipped `Demo Harness Agent` follows its own advice: `Read`/`Grep`/`Glob` allowed, `Bash`/`Write`/`Edit`/`NotebookEdit` denied outright.

- 394d276: Harness turns: supply the real response contract, and record inputs/outputs

  Three defects found by running the Demo Harness Agent against Claude Code and asking it "what can you do?" — a one-turn question that took **6 iterations and 152 seconds**.

  **The harness was never shown the response schema.** `HarnessAgentBase` bypasses `AIPromptRunner`, so the agent-type template's `_OUTPUT_EXAMPLE` was never rendered and the harness had to guess. It emitted well-formed JSON with invented step names (`complete`, `respond`, `result`, `undefined`), and `BaseAgent`'s retry feedback taught it the vocabulary one rejection at a time. A model inventing plausible values for a schema it was never shown reads as a sloppy model; it is actually a missing prompt. The turn-end contract now states the real shape explicitly — `taskComplete` for completion, and `nextStep.TYPE` (not `step`) with the actual `Actions | Sub-Agent | Chat | Retry | …` vocabulary — carried directly rather than depending on template rendering.

  **Prompt-step inputs and outputs were blank in the UI.** The synthesized `AIPromptRun` reproduced the accounting fields and dropped the observability ones: `Messages` and `Result` were never set, so every harness prompt step rendered empty while its tokens and cost were correct.

  **Runs reported zero tokens.** `calculateTokenStats` sums the `*Rollup` columns, which were left NULL while only `TokensUsed` was set — a confusing half-truth that looks like a free run rather than an unaccounted one.

  Also corrects `ClaudeCodeCliAdapter.StructuredOutput` to **false**: `--output-format stream-json` structures the transport, not the model's content. Claiming true told the runtime it need not compensate.

  Result on the same prompt: **1 iteration, 9.7s, $0.001056** — down from 6 iterations, 152.8s, $0.029266.

- 394d276: Fix multi-provider and UUID-comparison compliance violations that failed the repo-wide MJGlobal compliance scanners. `HarnessAgentBase` now uses its bound provider (`this.ProviderToUse`) instead of `new Metadata()` and `UUIDsEqual` for the template-ID lookup; the task-graph orchestration integration checks use `ctx.Provider.EntityByName(...)` instead of `new Metadata()`.
- Updated dependencies [634aa8c]
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
- Updated dependencies [79483bf]
- Updated dependencies [4586215]
- Updated dependencies [22ec804]
- Updated dependencies [197fdf8]
- Updated dependencies [f6a4341]
- Updated dependencies [67e4c9e]
- Updated dependencies [8206993]
- Updated dependencies [f5ec13b]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [199eb2b]
- Updated dependencies [1940a4d]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [e2ad3c0]
- Updated dependencies [5ecfdb4]
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
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [ada8784]
- Updated dependencies [8ec1515]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [d907a1b]
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
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [be0bdb2]
- Updated dependencies [a723521]
- Updated dependencies [5f33ca8]
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
- Updated dependencies [9fc0e2d]
- Updated dependencies [97cbf5f]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [0db4f4f]
- Updated dependencies [53d256f]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [9a29da4]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [c11f8c6]
- Updated dependencies [1748491]
- Updated dependencies [4cdfdcf]
- Updated dependencies [35ace7c]
- Updated dependencies [0db6105]
- Updated dependencies [d7feeae]
- Updated dependencies [7fefca2]
- Updated dependencies [a1a8989]
- Updated dependencies [29c3dc8]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [ca3657d]
- Updated dependencies [394d276]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
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
- Updated dependencies [394d276]
- Updated dependencies [1c0d586]
  - @memberjunction/ai-core-plus@6.1.0
  - @memberjunction/ai-agents@6.1.0
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/ai@6.1.0
  - @memberjunction/templates@6.1.0

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
- Updated dependencies [35ace7c]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/ai-agents@6.1.0-edge.7
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/ai-core-plus@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/templates@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [634aa8c]
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
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [a723521]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [c11f8c6]
- Updated dependencies [1748491]
- Updated dependencies [0db6105]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/ai-core-plus@6.1.0-edge.6
  - @memberjunction/ai-agents@6.1.0-edge.6
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/templates@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [79483bf]
- Updated dependencies [22ec804]
- Updated dependencies [8206993]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [5f33ca8]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [29c3dc8]
- Updated dependencies [905820a]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-agents@6.1.0-edge.5
  - @memberjunction/ai-core-plus@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/templates@6.1.0-edge.5

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
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ai-agents@6.1.0-edge.4
  - @memberjunction/ai-core-plus@6.1.0-edge.4
  - @memberjunction/templates@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
- Updated dependencies [199eb2b]
- Updated dependencies [e7f1f88]
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
- Updated dependencies [d907a1b]
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
- Updated dependencies [7a630ba]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ai-agents@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/templates@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [59def38]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [9fc0e2d]
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [d8adda1]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/ai-agents@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/templates@6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

- 394d276: External agent harnesses as a new MJ agent type — plus a cost-guardrail fix that affects every agent

  An MJ agent can now be executed by an **external agent harness** (Claude Code, Codex CLI, OpenCode,
  Gemini CLI, Pi) running in a sandbox, while MemberJunction keeps identity, permissions, governed data
  access, payload contracts, HITL, cost control and run-level audit.

  **A harness turn is protocol-identical to a Loop iteration.** The harness reasons freely inside its
  sandbox, then ends its turn by emitting the same next-step JSON envelope a Loop model emits. MJ
  executes any actions, sub-agents or skills through its own validated machinery and resumes the
  session with the results. That is why every existing guarantee — next-step validation, per-action
  `MaxExecutionsPerRun`, skill gates, plan-mode blocking, `PayloadManager` ACLs,
  `checkExecutionGuardrails`, run-step recording — applies with no new enforcement code, and why there
  is one authority channel to audit rather than two. `HarnessAgentBase` overrides exactly one method,
  `executePrompt`.

  New schema, all additive: `MJ: AI Agent Harnesses` (the registry of launchable harnesses),
  `MJ: AI Agent Credentials` (the grant edge for secrets an agent carries into its sandbox — custody
  stays in `MJ: Credentials`), and `AIAgentRun.ExternalSessionID`. `CapabilitySettings` is a
  strongly-typed JSONType declaring what each adapter **actually implements**, because the runtime
  _emulates what is missing_ — an over-claim is a silent behavioural gap, not an error.

  **Also fixes `MaxCostPerRun` / `MaxTokensPerRun` for every agent type, not just harness agents.**
  The limits are static on the agent and were compared correctly, but the run's accumulated
  `TotalCost` / `TotalTokensUsed` were only written on terminal paths — so mid-run they sat at 0 and
  the checks short-circuited on a falsy zero. The ceilings were evaluated as a run _ended_: reporting,
  not guardrails. A runaway agent burned its whole budget and was told afterwards. Only the iteration
  and time limits actually interrupted a run. The totals are now refreshed before the comparison, with
  regression coverage verified to fail without the fix.

  Sandboxes: the **provider owns process placement**, delivered to adapters as a `SandboxExecutor`, so
  the same adapter runs on a laptop or inside a per-run container without knowing the difference. The
  local provider scopes a workspace directory but does **not** contain the process — `networkPolicy` is
  advisory there, which is documented rather than implied. `DockerSandboxProvider` enforces
  `networkPolicy: 'none'` for real.

  Known gaps, documented in the guide so nobody designs around a guarantee that does not exist:
  `PermissionHooks` is false on every adapter (the `strict` posture needs an MCP permission-prompt tool
  that is a later phase), `mcp-only`/`allowlist` are not packet-enforced, the MCP loopback is not yet
  wired, and `ModelID` uses the declared rather than the harness-reported model.

  Ships **not live**: every harness row is `Inactive` and `Demo Harness Agent` is `Pending`, because
  they depend on external binaries a fresh install will not have.

  See [`guides/AGENT_HARNESS_GUIDE.md`](../guides/AGENT_HARNESS_GUIDE.md).

### Patch Changes

- 394d276: Harness permissions: make policy enforcement a declared capability, and stop trusting prefix-matched command patterns

  MJ's harness permission policy was already abstract — declared in agent metadata, overridable at runtime, translated per-harness through `BaseHarnessAdapter.ApplyPermissionPolicy`. But only `ClaudeCodeCliAdapter` overrode that seam. The other four adapters inherited the inert base default, so a configured `strict` posture was **silently ignored**, and the runtime's warning checked `PermissionHooks` — a different question — so it never fired.

  **New `IHarnessCapabilitySettings.PermissionPolicy`** declares that an adapter actually translates the policy into flags the harness honours. Deliberately separate from `PermissionHooks`, which is about _interactive_ mid-turn approval: Claude Code enforces a static policy while having no hook to pause on, and conflating the two is precisely what hid this. `HarnessAgentBase` now logs an error when a policy is configured against an adapter reporting `false`, so an operator is never left believing something is gated. It warns rather than refusing — an unenforced policy on a properly-provisioned sandbox is still contained by the sandbox, and failing the run would take every unverified adapter offline.

  **Pi now enforces**, using flags verified against a real install (`--tools` / `--exclude-tools`): `strict` → `read,grep,find`; `auto` → additionally `edit,write` but no shell (the `acceptEdits` analogue); `dangerous` → no flag at all. Because Pi gates on **exact tool names**, `strict` is genuinely enforceable there, unlike on Claude Code where it degrades to prompts that have nowhere to go headlessly. MJ's tool vocabulary is translated to Pi's (`Glob`→`find`, `Bash`→`bash`) by the adapter, so a policy is authored once regardless of harness.

  Pi cannot express command-scoped patterns like `Bash(git:*)`, and those **fail closed in both directions**: a command-scoped _allow_ is dropped, because granting the whole tool would hand over strictly more authority than the policy asked for; a command-scoped _deny_ is widened to the whole tool, because denying more than asked is the safe direction.

  Codex, Gemini CLI, OpenCode and the generic stdio adapter declare `PermissionPolicy: false`. Their CLIs' permission flags could not be verified against a real install, and guessing them produces exactly the failure this capability exists to surface — a policy that looks applied and is not.

  **Claude Code's Bash patterns are PREFIX-LITERAL, and that is now documented as a rule rather than a caveat.** Proven live: a `Bash(git:*)` allow paired with a `Bash(git commit:*)` deny let `git -C <path> commit` execute, because any flag before the subcommand defeats the prefix. The run failed only because nothing happened to be staged. So: deny whole tool names — an exact match, no prefix involved — or allow fully-specified commands; never carve dangerous subcommands out of a broad allow. Tool-pattern lists are hygiene, not a security boundary. Real containment comes from the sandbox provider, and the `local` provider offers none.

  The shipped `Demo Harness Agent` follows its own advice: `Read`/`Grep`/`Glob` allowed, `Bash`/`Write`/`Edit`/`NotebookEdit` denied outright.

- 394d276: Harness turns: supply the real response contract, and record inputs/outputs

  Three defects found by running the Demo Harness Agent against Claude Code and asking it "what can you do?" — a one-turn question that took **6 iterations and 152 seconds**.

  **The harness was never shown the response schema.** `HarnessAgentBase` bypasses `AIPromptRunner`, so the agent-type template's `_OUTPUT_EXAMPLE` was never rendered and the harness had to guess. It emitted well-formed JSON with invented step names (`complete`, `respond`, `result`, `undefined`), and `BaseAgent`'s retry feedback taught it the vocabulary one rejection at a time. A model inventing plausible values for a schema it was never shown reads as a sloppy model; it is actually a missing prompt. The turn-end contract now states the real shape explicitly — `taskComplete` for completion, and `nextStep.TYPE` (not `step`) with the actual `Actions | Sub-Agent | Chat | Retry | …` vocabulary — carried directly rather than depending on template rendering.

  **Prompt-step inputs and outputs were blank in the UI.** The synthesized `AIPromptRun` reproduced the accounting fields and dropped the observability ones: `Messages` and `Result` were never set, so every harness prompt step rendered empty while its tokens and cost were correct.

  **Runs reported zero tokens.** `calculateTokenStats` sums the `*Rollup` columns, which were left NULL while only `TokensUsed` was set — a confusing half-truth that looks like a free run rather than an unaccounted one.

  Also corrects `ClaudeCodeCliAdapter.StructuredOutput` to **false**: `--output-format stream-json` structures the transport, not the model's content. Claiming true told the runtime it need not compensate.

  Result on the same prompt: **1 iteration, 9.7s, $0.001056** — down from 6 iterations, 152.8s, $0.029266.

- 394d276: Fix multi-provider and UUID-comparison compliance violations that failed the repo-wide MJGlobal compliance scanners. `HarnessAgentBase` now uses its bound provider (`this.ProviderToUse`) instead of `new Metadata()` and `UUIDsEqual` for the template-ID lookup; the task-graph orchestration integration checks use `ctx.Provider.EntityByName(...)` instead of `new Metadata()`.
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
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ai-agents@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/templates@6.1.0-edge.1
  - @memberjunction/ai@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

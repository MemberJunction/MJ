# @memberjunction/integration-test-suite

## 6.2.0-edge.6

### Patch Changes

- 622f166: An agent run can fix some of an action's input parameters so the model can neither see nor change them (`ExecuteAgentParams.boundActionParams`, A16 of #4789).
  - **`boundActionParams`** is `Record<actionID, Record<parameterName, value>>`. A bound parameter is left out of the action's description in the prompt catalog (including a narrowed catalog), out of its native tool schema, out of the result echoed to the model, out of the model-facing invocation record, and out of what Find Candidate Actions / Find Best Action report (they read the bindings from the action `Context` as `BoundActionParams`). At dispatch the bound value replaces whatever the model (or a Flow step's input mapping) sent under that name; the override is logged with the run and step IDs, and the model's value is never passed on. Bindings reach every sub-agent run and the realtime delegation target, as `actionChanges` do.
  - **Refusals.** A required parameter bound to `null`/`undefined`, or a binding that names no input parameter of the action, refuses the call before it reaches the engine: the reason is logged for the operator, the model is told only that the action is unavailable, and the action is locked out for the rest of the run like a fatal configuration failure (the circuit breaker short-circuits later calls). A binding keyed by anything other than a known Action ID fails the run at its start. An optional parameter bound to nothing is hidden and the action receives no value for it.
  - **Fail closed.** A run with bindings has task graphs withheld (`enableTaskGraphs` is ignored and a graph the model emits anyway fails the step), because a graph's action nodes are dispatched outside the agent's binding gate.
  - **Audit.** `ActionParam` gains an optional `Bound` marker that the action execution log's `Params` keeps (through redaction too), and the agent run step's `InputData` lists the bound names.
  - **Nothing changes without bindings:** the catalog, the tool schema, the dispatched parameters and the action context are byte-for-byte what they were. `ExecuteSingleActionOptions.StepID` is new and optional.
  - **Limits, documented on the field:** a run stores its bindings on `MJ: AI Agent Runs.BoundActionParams`, and a run that continues another (`lastRunId`, including a resume from a stored request) applies them when its caller passes none (`actionChanges` are not persisted, so a resumed run starts without them); the realtime client-direct action path and the `Execute Agent` action (along with Loop, Conditional, Retry and Parallel Execute when run without a `RunScope` that refuses them) dispatch without forwarding `boundActionParams`; an action's own message text may mention a bound value.
  - Two deterministic integration checks (`agent-loop-standin` ALS12, ALS13) cover the dispatched bound value with its `Bound` log marker and the refusal lockout.

  New exports from `@memberjunction/ai-agents`: `BindingsForAction`, `UnboundParams`, `IsBoundParamName`, `ApplyBoundActionParams`, `BoundParamsApplication`, `ActionBindings`. New type in `@memberjunction/ai-core-plus`: `BoundActionParams`.

- 68bb7e4: A run's bound action parameters are stored on its `MJ: AI Agent Runs` row, and a run that continues another (`lastRunId`, including a resume after `ask_user`) applies that run's bindings when its caller passes none. Before, a resumed or continued run started unbound, so the model could see and set the parameters its original caller hid. Reading the earlier run fails the new run rather than starting it unbound.
- 11f51a9: IT127, the `calendar-event-links` integration bundle: a user holding only the UI role reads `MJ: Calendar Event Links` and `MJ: Calendar Sync States` over GraphQL and cannot create either; and, through a test-only calendar provider, a linked event keeps its iCalendar UID and compact record key, sync delivers a moved time and an RSVP to the record's handler and stores the new token, a refused token falls back to a full sync of the window, a record whose entity has no handler gets only its link updated, and cancelling marks the link Cancelled.
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

- 49d0d3c: Server-set query parameters, `Context` in query templates, and fingerprint-bound approvals (#4789 A17). All opt-in: a query with no server-set parameter and no `Context`, run without `RequireApproved`, renders and runs exactly as before.
  - **Server-set parameters.** `QueryParameterInfo.IsServerSet` mirrors the new column. `RunQueryParams.ServerParameters` carries values only server code sets; a caller value (`Parameters`) for a server-set parameter, for a name that reaches a composed query's server-set parameter, or for `Context` is refused with an error naming it, and logged. A required server-set parameter with no server value refuses the run. Server values are left out of `AppliedParameters`, bound in materialized reads, and never read from a GraphQL request. `SERVER_ONLY_RUN_QUERY_PARAMS` / `StripServerOnlyRunQueryParams` name `TimeZone` and `ServerParameters`.
  - **`Context` in templates.** `{{ Context.UserID }}`, `UserEmail`, `UserName`, `Now`, `Today`, `StartOfWeek/Month/Quarter/Year`, worked out on the server from the context user, the clock and the run's `TimeZone` (UTC when unset), and only when the template reads them. Query extraction keeps no parameter row for `Context`.
  - **Approvals.** Queries (`Status`), user views, dashboards and components (`ApprovalStatus`): a save that moves the status to Approved records the context user, the time and a fingerprint of the definition as stored (`ComputeQueryFingerprintAsync` and siblings in `@memberjunction/core-entities`); client values for those columns are ignored. `Get*ApprovalStateAsync` reports `Current`, `Stale` or `NotApproved`. New `MJDashboardEntityServer`. `RunQueryParams.RequireApproved` refuses a run unless the query, and each query it composes, has a current approval.
  - **Caches.** The RunQuery result-cache fingerprint (the `CacheLocal` layer and the external-source cache) now covers `ServerParameters` and the `Context` values a query reads; a result that reads `Context.Now`, and a `RequireApproved` run, are never cached.
  - Integration bundle `query-approvals` (IT120).

- 5931f0d: Only the server writes an agent's reply (A19, second half). In `MJ: Conversation Details`, a reply (`Role` `AI` or
  `Error`, compared trimmed and in any case) is created, and what it says changed (`Message`, `Status`, `Error`, the
  response form and commands, `AgentID`, attachments and the other authored fields), only on an entity instance server
  code has marked with `MJConversationDetailEntityExtended.MarkServerAuthoredReply()`. The marker is not a field, so no
  GraphQL input, `OldValues___` or transaction variable can set it; a person's save of a reply is refused, and so is an
  unmarked save as the system user. A marked write still needs its user to own the conversation or hold a grant on it.
  The owner's rating, pinning, hiding and other bookkeeping keep the conversation-level rules.

  **Breaking API changes:**
  - `RunAIAgentFromConversationDetail` takes `userMessageId` (the person's saved message) in place of
    `conversationDetailId` (a reply row the caller created). The server creates the reply row (`ParentID` the user's
    message) before the run and names it in the fire-and-forget acknowledgement, `result` =
    `{ accepted, fireAndForget, conversationDetailId, createdAt }`; every progress, streaming and partial-result message
    now carries `conversationDetailId` too. Three optional arguments say where the reply sits: `replyParentId` (a message
    of the same conversation the caller can read; checked by the server), `announcedByAgentId` (an active agent whose
    fixed line "Continuing with **{agent}** for refinement..." the server posts first; the ack then names it as
    `announcementDetailId`), and `replyBranchId` (a fork of the conversation whose path contains the user's message, used
    when Regenerate or a forked turn runs on a newly created branch while the user's message remains on its original
    branch). `GraphQLAIClient.RunAIAgentFromConversationDetail` takes `userMessageId`, `onAccepted`, and optional
    `replyParentId` / `announcedByAgentId` / `replyBranchId`; `AgentClientSession.RunAgentFromConversationDetail` takes
    `UserMessageId`, `OnAccepted`, and optional `ReplyParentId` / `AnnouncedByAgentId` / `ReplyBranchId`
    (`RunAgentParams.ConversationDetailId` is now `UserMessageId`); `ConversationAgentRunner.ProcessMessage` drops
    `conversationDetailId` for `onReplyAccepted` and optional `ReplyBranchID`. `AgentRunner.CreateAgentReplyDetail()`
    creates a reply row and `RunAgentInConversation` takes it as `agentResponseDetail`. `FireAndForgetHelper` gains an
    opt-in `deferMessagesUntilAck`.
  - `RunAIAgent` and `RunAIAgentSystemUser` with a caller-supplied `conversationDetailId` no longer write progress or
    results into that row: `AgentRunner` only marks reply rows it creates itself, so a write into a caller-named detail ID
    is refused by the gate with `"Only the server writes an agent's reply."` Callers that want a server-written
    conversation reply must use `RunAIAgentFromConversationDetail` with `userMessageId` (or, in server code, pass a
    server-created row via `AgentRunner.CreateAgentReplyDetail()` / `agentResponseDetail`).
  - `TaskContinuationParams.SubmittedByUserID` (`string | null`) in `@memberjunction/task-graph` is now a **required**
    member on `TaskContinuationParams`, carrying the user who submitted the task graph so continuation delivery writes as
    the submitter rather than the conversation's owner.

  MJ's chat no longer creates or saves reply rows: it shows an unsaved "Starting…" placeholder until the
  acknowledgement, keys the turn's task and completion by the acknowledged ID, starts the reply's timer at the row's
  server creation time, and reloads the reply the server wrote. A delegate's reply still threads under the manager's
  reply, and the manager's "Continuing with X for refinement..." line still shows, both now written by the server; a
  failed reply is shown with the chat's usual `❌ **{agent}** failed` header, formatted when it renders. A delegate's
  failed first attempt is hidden when its retry takes over. `TaskGraph.Submit` takes an optional `postStatusMessage`:
  the server then writes the workflow's status bubble under the given reply (only facts it knows: the task count and
  whether the submission was accepted, never the spec's name or reasoning), binds the graph to it, and returns its ID as
  `statusConversationDetailID`; MJ's chat uses it in place of its own status row. The realtime
  session's transcript, tool and anchor rows, the task-graph outcome (now written as the **submitter**, `SubmittedByUserID`,
  because `TaskGraph.Submit` accepts any conversation detail ID and writing as the conversation owner would let an Edit
  grantee or non-owner post as the owner; a graph with no resolvable submitter is refused by the conversation gate and
  logged), the orphaned-reply reconciler, bridge transcripts and realtime agent transcripts all write as marked server
  code. The web widget and the mobile app stop creating reply rows.

  ### Migration Guide
  1. **Client conversation turns (`RunAIAgentFromConversationDetail` / `RunAgentFromConversationDetail`):** Stop
     pre-creating `Role = 'AI'` / `'Error'` `MJ: Conversation Details` rows (which `Validate()` now refuses unless
     authored on the server with `MarkServerAuthoredReply()`) and pass the saved `Role = 'User'` message ID instead:

  ```ts
  // Before
  const aiReply = await md.GetEntityObject<MJConversationDetailEntity>(
    "MJ: Conversation Details",
  );
  aiReply.ConversationID = conversationId;
  aiReply.ParentID = userMessage.ID;
  aiReply.Role = "AI";
  aiReply.Status = "In-Progress";
  await aiReply.Save();

  const result = await session.RunAgentFromConversationDetail({
    ConversationDetailId: aiReply.ID,
    AgentId: agentId,
  });

  // After
  const result = await session.RunAgentFromConversationDetail({
    UserMessageId: userMessage.ID,
    AgentId: agentId,
    OnAccepted: ({ ConversationDetailId, CreatedAt }) => {
      // Key streaming progress and completion tracking by ConversationDetailId
    },
  });
  ```

  2. **`RunAIAgent` / `RunAIAgentSystemUser` callers passing `conversationDetailId`:** Passing a caller-supplied
     `conversationDetailId` to `RunAIAgent` or `RunAIAgentSystemUser` no longer writes progress or results into that row
     (refused with `"Only the server writes an agent's reply."`). Use `RunAIAgentFromConversationDetail` with
     `userMessageId` for client-initiated conversation replies, or in server-side code create the reply with
     `AgentRunner.CreateAgentReplyDetail()` and pass it as `agentResponseDetail` to `RunAgentInConversation`.
  3. **Custom `ITaskContinuationDeliverer` / `TaskContinuationParams` callers (`@memberjunction/task-graph`):** Include the
     required `SubmittedByUserID: string | null` field when constructing `TaskContinuationParams`:

  ```ts
  const continuationParams: TaskContinuationParams = {
    // ...existing fields
    SubmittedByUserID: currentUser.ID,
  };
  ```

- 374b1a4: Properties on user views (#4789, A14): a view can declare named, typed inputs, each of which adds one predicate on a field when a run gives it a value or it has a default. A property whose `AllowOverride` is false can be set only by server code. A view without properties runs, saves and caches exactly as before.
  - `@memberjunction/core`: `RunViewParams.Properties` (values a client may set) and `RunViewParams.ServerProperties` (server only; added to `SERVER_ONLY_RUN_VIEW_PARAMS`, so the REST view routes strip it). New `viewProperties` module: `ValidateUserViewProperties` (save-time checks), `ResolveViewPropertyValues` (value from server values, then client values, then the default; refuses unknown names, a client value for a locked property, a wrong type, and a required property with no value, each naming the property) and `BuildViewPropertyFilter` (typed literals through the platform dialect; `IN` takes a list). Both properties maps are part of the result-cache fingerprint and of `RunViewParams.Equals`. In the browser a run carrying properties is never merged with other callers' runs, never cached locally, and never sent through the cache-check transport (which carries dynamic runs only). `IsPropertyValueOfType` is exported from the context-token module.
  - `@memberjunction/core-entities`: `MJUserViewEntityExtended.Validate()` checks the view's `Properties`.
  - `@memberjunction/generic-database-provider`: a stored view's property predicates are ANDed after the view's own clause and `ExtraFilter`, screened, and field-security checked; row-level security applies on top unchanged. Before the cache lookup the provider works out the values (token defaults with the context user and the run's `TimeZone`, UTC when none), so the server cache keys on what the run uses; a run it would refuse skips the cache and is refused with its message.
  - `@memberjunction/server`: `RunViewByIDInput`, `RunViewByNameInput` and `RunViewGenericInput` accept `Properties` (JSON). No input accepts `ServerProperties`. `RunViewByID` / `RunViewByName` now return the provider's `ErrorMessage`.
  - `@memberjunction/graphql-dataprovider`: sends `Properties` on stored-view runs; throws for `Properties` on a dynamic run or any `ServerProperties`.
  - `@memberjunction/ng-entity-viewer`: a view with properties is run by its ID with the new `Properties` input, for every view type, paging, the count and the export; a read-only chip row lists each property (a locked one reads "set by server") and shows a refusal. The view config panel gets a Properties tab (add, edit and remove properties: name, type, description, default as a fixed value or a token with an offset, required, allow override, target field and operator), and the workspace saves them onto the view.
  - `@memberjunction/integration-test-suite`: IT136, `view-properties-client` (VP1–VP5, client transport).

- Updated dependencies [622f166]
- Updated dependencies [68bb7e4]
- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [c4645bc]
- Updated dependencies [709de1a]
- Updated dependencies [35012c0]
- Updated dependencies [d43d86e]
- Updated dependencies [f7a43b2]
- Updated dependencies [cc41d33]
- Updated dependencies [281724a]
- Updated dependencies [6770aad]
- Updated dependencies [c0ebd70]
- Updated dependencies [ea1a2fb]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [e8e6cd6]
- Updated dependencies [142d524]
- Updated dependencies [6ecb767]
- Updated dependencies [0ff7523]
- Updated dependencies [0ff7523]
- Updated dependencies [f7d5ab5]
- Updated dependencies [a65dfb8]
- Updated dependencies [9241c65]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [96c44bf]
- Updated dependencies [1141164]
- Updated dependencies [0c8adca]
- Updated dependencies [dae1d31]
- Updated dependencies [10ba687]
- Updated dependencies [edb0eaf]
- Updated dependencies [cc9fa3c]
- Updated dependencies [4c97994]
- Updated dependencies [a8bda68]
- Updated dependencies [74a3420]
- Updated dependencies [f75f559]
- Updated dependencies [ff73341]
- Updated dependencies [8ec184d]
- Updated dependencies [db4e210]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [fd84ab1]
- Updated dependencies [0e93e1f]
- Updated dependencies [68f5c01]
- Updated dependencies [663ff80]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [c4645bc]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
- Updated dependencies [ced8414]
  - @memberjunction/ai-core-plus@6.2.0-edge.6
  - @memberjunction/ai-agents@6.2.0-edge.6
  - @memberjunction/actions-base@6.2.0-edge.6
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/aiengine@6.2.0-edge.6
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/core-entities-server@6.2.0-edge.6
  - @memberjunction/generic-database-provider@6.2.0-edge.6
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.6
  - @memberjunction/graphql-dataprovider@6.2.0-edge.6
  - @memberjunction/codegen-lib@6.2.0-edge.6
  - @memberjunction/testing-integration@6.2.0-edge.6
  - @memberjunction/livekit-room-server@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.6
  - @memberjunction/ai-anthropic@6.2.0-edge.6
  - @memberjunction/communication-types@6.2.0-edge.6
  - @memberjunction/communication-ms-graph@6.2.0-edge.6
  - @memberjunction/communication-gmail@6.2.0-edge.6
  - @memberjunction/communication-engine@6.2.0-edge.6
  - @memberjunction/ai-bridge-server@6.2.0-edge.6
  - @memberjunction/telephony-adapters@6.2.0-edge.6
  - @memberjunction/credentials@6.2.0-edge.6
  - @memberjunction/ai-engine-base@6.2.0-edge.6
  - @memberjunction/auth-providers@6.2.0-edge.6
  - @memberjunction/open-app-engine@6.2.0-edge.6
  - @memberjunction/content-pipeline-base@6.2.0-edge.6
  - @memberjunction/content-pipeline@6.2.0-edge.6
  - @memberjunction/record-set-processor-base@6.2.0-edge.6
  - @memberjunction/record-set-processor@6.2.0-edge.6
  - @memberjunction/content-autotagging@6.2.0-edge.6
  - @memberjunction/ai-vectordb@6.2.0-edge.6
  - @memberjunction/ai-prompts@6.2.0-edge.6
  - @memberjunction/ai-vector-dupe@6.2.0-edge.6
  - @memberjunction/storage@6.2.0-edge.6
  - @memberjunction/metadata-sync@6.2.0-edge.6
  - @memberjunction/actions@6.2.0-edge.6
  - @memberjunction/ai-agent-harness@6.2.0-edge.6
  - @memberjunction/feature-pipelines-engine@6.2.0-edge.6
  - @memberjunction/postgresql-dataprovider@6.2.0-edge.6
  - @memberjunction/query-processor@6.2.0-edge.6
  - @memberjunction/scheduling-engine@6.2.0-edge.6
  - @memberjunction/search-engine@6.2.0-edge.6
  - @memberjunction/templates@6.2.0-edge.6
  - @memberjunction/templates-base-types@6.2.0-edge.6
  - @memberjunction/ai-gemini@6.2.0-edge.6
  - @memberjunction/ai-openai@6.2.0-edge.6
  - @memberjunction/ai-openrouter@6.2.0-edge.6
  - @memberjunction/predictive-studio-core@6.2.0-edge.6
  - @memberjunction/predictive-studio@6.2.0-edge.6
  - @memberjunction/api-keys@6.2.0-edge.6
  - @memberjunction/task-graph@6.2.0-edge.6
  - @memberjunction/conversations-runtime@6.2.0-edge.6
  - @memberjunction/predictive-studio-truth-suite@6.2.0-edge.6
  - @memberjunction/rubrics@6.2.0-edge.6
  - @memberjunction/testing-engine@6.2.0-edge.6
  - @memberjunction/encryption@6.2.0-edge.6
  - @memberjunction/ai-cloudflare@6.2.0-edge.6
  - @memberjunction/ai-inception@6.2.0-edge.6
  - @memberjunction/ai-systemone@6.2.0-edge.6
  - @memberjunction/queue@6.2.0-edge.6
  - @memberjunction/unit-testing@6.2.0-edge.6
  - @memberjunction/feature-pipelines@6.2.0-edge.6
  - @memberjunction/ai-bridge-base@6.2.0-edge.6
  - @memberjunction/notifications@6.2.0-edge.6
  - @memberjunction/communication-sendgrid@6.2.0-edge.6
  - @memberjunction/testing-engine-base@6.2.0-edge.6
  - @memberjunction/work-queue-engine@6.2.0-edge.6
  - @memberjunction/communication-expo-push@6.2.0-edge.6
  - @memberjunction/communication-twilio@6.2.0-edge.6
  - @memberjunction/redis-provider@6.2.0-edge.6
  - @memberjunction/rubrics-base@6.2.0-edge.6
  - @memberjunction/work-queue-server@6.2.0-edge.6
  - @memberjunction/work-queue-core@6.2.0-edge.6

## 6.2.0-edge.5

### Minor Changes

- 5fed75a: Agent runs no longer write `AIAgentRun.Result`; use `FinalPayload`, which holds the same value. The `Result` column remains, deprecated, for existing rows.

  New column `AIAgentRunStep.PayloadAtStartSourceStepID`. When a step starts from the same payload an earlier step in the run ended with, `PayloadAtStart` is stored as NULL and this column points at that step. Readers resolve the value with `ResolvePayloadAtStart` / `ApplyResolvedPayloadAtStart` from `@memberjunction/ai-core-plus`. External API clients that read `PayloadAtStart` directly must follow the pointer.

- 5fed75a: Prompt runs store less template data in `AIPromptRun.Messages` (#5526). `Messages` always holds the messages the model received. The template inputs (`data`, `templateData`) are stored per a capture mode: `None` (default: top-level keys and byte sizes only), `Referenced` (only keys the prompt's templates read) or `Full`. Set it per prompt with the new `AIPrompt.TemplateDataCapture` column, per call with `AIPromptParams.TemplateDataCapture`, or per server with `aiPromptRuns.templateDataCapture` in mj.config.cjs. `_CURRENT_PAYLOAD` is never stored; agent-run steps hold the payload. New `TemplateEngineServer.GetReferencedVariables()` lists the variables a template reads.

  **API note:** clients that read `data` or `templateData` out of `AIPromptRun.Messages` get less than before.
  - The capture mode comes from the call, then the prompt, then the server default. The most specific prompt wins: the run's child prompts come before its main prompt. So for a Loop or Harness agent, a value on the agent's own prompt beats a value on the agent-type system prompt.
  - In `None` mode (the default), `Messages` holds no `data` or `templateData`, only the `dataShape` sizes. `ParseMessagesData().inputData` and `GetDataContext()` return null.
  - In `Referenced` mode, clients find only the keys that the templates read.
  - `data` never holds `_CURRENT_PAYLOAD`, in any mode, `Full` included.
  - `ParseMessagesData()` now also returns `dataCapture`, `dataShape` and `dataCaptureNote`.
  - If the capture step fails, the run still saves, with `dataCapture: 'None'`, a fixed `dataCaptureNote` and no template data.
  - The `GetReferencedVariables()` result has `ParseFailed: true` when a template does not parse.

- ce758af: Feature Pipelines: keyed, versioned Feature Values and honest runs (migration `V202610201100__v6.2.x__Feature_Value_Key_And_Versions.sql`).
  - Feature Values upsert on a key (record, feature, pipeline version, prompt version, primary model, parameters, input); a value a person entered (`Source='Human'`) is never overwritten unless the run sets `overwriteHumanValues`. Child write-back can `reconcile` rows on a key.
  - `MJ: Feature Pipeline Versions` registers each pipeline pin; a gated pipeline runs only under a version whose golden-set result meets its threshold. The `Steward Feature Pipeline Version` Action (`StewardFeaturePipelineVersionAction`) and `Feature Pipeline Version Steward` Record Process (`WorkType='Action'`, scheduled via `RecordProcessScheduledJobDriver`) evaluate and backfill changed versions; golden sets carry a label-quality record, `Required` and `ExpectAbstain` cases.
  - New `@memberjunction/feature-pipelines-engine` package houses server-side Feature Pipeline execution (`InferProcessor`, `BaseFeaturePipelineDriver`, `LLMFeaturePipelineDriver`, `DecisionFeaturePipelineDriver`, `FeaturePipelineEscalation`, `FeaturePipelineHumanValueGuard`, `FeaturePipelineErrors`), golden-set testing (`FeaturePipelineGoldenSetDriver`, `golden-set-scoring`, `golden-label-quality`), and version stewardship (`FeaturePipelineVersionSteward`, `StewardFeaturePipelineVersionAction`, `RegisterInferRecordProcessor`), keeping `@memberjunction/record-set-processor-base`, `@memberjunction/record-set-processor`, `@memberjunction/scheduling-engine`, and `@memberjunction/testing-engine` free of Feature Pipeline dependencies.
  - Outputs are checked against `lookup` constraints (per item with `ItemRef`); an output below its `MinConfidence` is withheld (`OnLowConfidence: 'null'`); `Context.RecordAsUserMessage` sends the record as a JSON user turn.
  - Dry runs write nothing, preview only what the real write would change, cap at 25 records and report `WouldRefuse`; a Feature Pipeline run with a failed record ends `Failed` with a `FeaturePipelineRunResult` summary; the breaker counts attempted records.
  - An output may omit its write target (builder target mode `Feature value only (no write-back)`): the answer is stored in `MJ: Feature Values` only, typed by its constraint (`numeric`/`money`, `boolean`, `date`), and no entity field is written. The Bulk Operations dry-run dialog shows each as a `<Feature> (feature value)` row with the previous and proposed value, and loads only the non-skipped details so a large scope counts every changed record.
  - A Feature Values panel on every record form shows the latest answer per pipeline and feature (Source, Confidence, version, Computed, Reasoning) and expands to its history; a latest answer that withheld its value reads "no value". `@memberjunction/ng-base-forms` re-resolves the form chrome when a panel mounts after first render, so a late panel gets its left-nav entry.
  - The Version Steward beats on a timer while its backfill runs, defers a backfill while a run is Running, marks only a clean run as backfilled, and ignores a Running Process Run not checkpointed for 30 minutes. A Feature Value insert that loses the race on its key to an equal value is `Unchanged`.
  - Bedrock sends a configured temperature of 0 as 0 (F-FP-13).
  - `AIPromptParams.templateAutoescape` (set by the Feature Pipeline drivers) renders a prompt template without HTML escaping; a Feature Pipeline run reads its prompt's template from the database at run start, so a template edit takes effect on the next run.
  - API moves & PascalCase standardization: `WriteBackResult`, `TagWriteBackPreview`, `FieldRulesResultPayload`, and `MetadataProviderCapabilities` live in `@memberjunction/record-set-processor-base`; `FeaturePipelineRunResults` lives in `@memberjunction/feature-pipelines`; `RunRecordProcessOptions`, `RecordProcessorContext`, `RecordSetProcessOptions`, `ProcessRunSummary`, and `WriteBackValuePreview` use `PascalCase` properties across `@memberjunction/record-set-processor-base` and `@memberjunction/record-set-processor`.

### Patch Changes

- 0cc6b08: Review fixes for agent run audiences and run scope. No migration, no metadata change.
  - **Audience validation.** A `Mode` naming something `Object.prototype` carries (`'toString'`, `'constructor'`, `'__proto__'`...) passed validation and added no reader, so every gate was skipped. It now fails the run like any unknown mode.
  - **Task graphs in a tenant-scoped run.** A graph's action and agent nodes run with no `RunScope` and no run context, so a Scoped Search node searched outside the run's tenant. Graphs are now withheld, and a model-written graph refused, when the audience adds a reader or the run's validated scope carries a tenant or a secondary dimension. The predicate is `ActionRunScopeIsBounded`, new in actions-base.
  - **The Search action in a tenant-scoped run** is refused (`RUN_SCOPE_UNSUPPORTED`) and the model is pointed at Scoped Search. Search takes no tenant, so it would search across tenants.
  - **One scope for the whole run.** Notes and examples, pre-execution RAG, scoped prompt parts and scoped prompt configs read the scope `initializeAgentRun` validated. That is the scope on the run row and on every action dispatch: trimmed, with `ScopeConfig` defaults applied. A `SecondaryScopes` value that is not a plain object is logged and ignored, not cast.
  - **More paths under an audience.** Client tools are not offered and a client-tools step is refused. The caller's app context is not injected. Memory writes are not saved. Scoped Search's streamed `ProgressEvents`, and the RAG streaming trace, carry no provider counts. No `MJ: AI Agent Requests` row is raised for a Chat or Plan step: answered on the dashboard or the API, it would resume the run without the audience, and no existing field can carry the audience without misusing one the UI shows. The room still answers in the conversation.
  - **Lockout wording.** An action refused for the audience (`AUDIENCE_UNSUPPORTED`) is locked out under a new `'audience'` circuit-breaker reason. The model is told it is unavailable in a shared conversation, not that it hit a configuration or credential error.
  - **Malformed audiences on actions.** `ActionEngine.CheckAudience` refuses every action under a malformed audience. Search and Scoped Search test `!== undefined`, so a `null` audience no longer runs an unbounded search or returns `SourceCounts`.
  - **Execute Agent** passes the calling run's `RunScope` and audience to the nested run as first-class fields. It still does not declare `SupportsAudience`, so it is refused under an audience.
  - **Sub-agent template parameters** also lose the host-only browser, conversation and realtime keys (`HOST_ONLY_AGENT_RUN_DATA_KEYS`, `WithoutHostOnlyAgentRunDataKeys` in ai-core-plus): `clientTools`, `sessionID`, `appContext`, `applicationId`, `conversationId`, `targetAgentID`, `agentSessionId`, `recording` and `realtime*`.
  - **Smaller fixes.**
    - Hydrated readers are cleared when the run ends.
    - Dispatch readers exclude the user the action actually runs as.
    - Inactive users are documented as accepted readers.
    - `Forbidden` rows for a refused reader name the reader's ID and the verdict `Source` only.
    - The `ActionRunScopeValue` drift-guard TSDoc is corrected.
    - Scoped Search's `INVALID_PARAM` messages say exactly what to pass.
  - **Tests.** Unit tests in each package, and `agent-run-audience` (IT119) gains AU8 (prototype-name mode) and AU9 (Search refused in a tenant-scoped run).

  Follow-up: the Scoped Search parameter descriptions in `metadata/actions/.scoped-search.json` are stale. They describe the tenant as supplied per call and say malformed `SecondaryScopes` are skipped. Update them in a metadata PR (a `minor` changeset).

- 0cc6b08: Agent runs bounded by an audience (A6, run level). `ExecuteAgentParams.Audience` (`{ Mode: 'Caller' | 'Intersection', UserIDs }`) names everyone besides the caller who will see a run's output — a shared conversation's other participants — and the run then shows only what the caller **and** every reader may see. It is server-only: a typed field, never read from `data`, so no GraphQL, MCP or A2A client can set it.
  - **Validation and hydration.** `BaseAgent` validates the audience and loads each reader from the server's `UserCache` right after the permission check, refreshing the cache once for an unknown ID. A malformed audience, or an ID no user has, fails the run before any prompt, as a refused permission does. An `'Intersection'` whose only reader is the caller behaves exactly as `'Caller'`. Sub-agents and realtime delegation targets inherit the audience and hydrate it again. `ResolveAudienceUsers` is the override point. Adds a dependency on `@memberjunction/generic-database-provider` (for `UserCache`).
  - **Pre-execution RAG** runs the scope-permission gate for every reader (the reader as `User`, the caller as `ContextUser`); a refused reader skips the scope and writes a `Forbidden` search-log row naming them. Both `Search` and `streamSearch` carry `SearchParams.Audience`.
  - **Notes and examples**: under an audience only shared ones (`UserID` empty) are injected, via a new `SharedOnly` option on `AgentContextInjector` that filters `UserID == null` explicitly on the cache and semantic paths (an undefined `userId` does not mean "shared only" to `AIEngine`'s base filter).
  - **Skipped or refused**: agent data-source preloading and the previous turn's tool-result carry-forward are skipped; task graphs are withheld (a copy of the cached prompt params) and a model-written graph is refused; session-driven (realtime / voice / bridge) runs are refused.
  - **Actions**: `RunActionParams.Audience` is set per dispatch (never on the shared `Context`). `ActionEngineServer.RunAction` refuses, with result code `AUDIENCE_UNSUPPORTED` and without running the action or writing an execution log row, every action whose class does not declare `BaseAction.SupportsAudience` (new, default `false`) and every runtime-defined or deferred action, and normalizes the audience for an action it lets through. `BaseAgent` locks a refused action out for the run. The Search and Scoped Search actions declare support: they pass the audience to the search, Scoped Search runs the per-reader scope gate, and both withhold `SourceCounts`. New in `@memberjunction/actions-base`: `ActionRunAudience`, `ActionAudienceReaders`, `ActionAudienceAddsReader`, `AUDIENCE_UNSUPPORTED_RESULT_CODE`, and `ActionResult.ResultCode` (the raw result code, set whether or not it matches a metadata result code).

  Deferred and documented (TSDoc, `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md`): per-reader scope expansion queries (`ScopeDimensionResolver` binds one `UserID`); `Union`, anchor and narrowing modes (use `PrimaryScope*` / `SecondaryScopes`); a resumed run (`MJAIAgentRequestEntityServer.resumeAgent`) runs as the responder with no audience, because persisting the audience needs a column — an open design point shared with bound action parameters; conversation history and artifacts remain the host's to choose. Agents whose work needs actions other than the two search actions are refused those actions in shared rooms, by design.

  Tests: unit suites for each package, and a new deterministic integration bundle `agent-run-audience` (IT119, AU1–AU6). No migration.

- 0cc6b08: Behaviour change: an agent run now reads its scope and agent-type parameters from `data` only when the server says it may, whatever started the run. The reserved keys are `PrimaryScopeEntityName`, `PrimaryScopeEntityID`, `PrimaryScopeRecordID`, `SecondaryScopes` and `__agentTypePromptParams`. `BaseAgent.Execute` removes them from every run's `data` unless the params set the new server-only `ExecuteAgentParams.TrustReservedRunData`. It logs the removed key names, never the values. The GraphQL resolvers used to strip these keys themselves; the Execute Agent action, MCP (`Run_Agent`, `Execute_*_Agent`), A2A and the Runtime Action bridge (`utilities.agents.Run`) passed them through. That let any user, or a model calling Execute Agent inside a run, choose a run's tenant or turn on task graphs. Now:
  - **Who loses a scope in `data`.** A browser, an Execute Agent action call (from `RunAction`, a user routine or a model), an MCP or A2A request, and a Runtime Action script. Their other `data` keys are unchanged.
  - **Who keeps it.** MJServer's agent-run resolvers set `TrustReservedRunData` for the system user and for API keys holding the `agent:trusted` scope, never for a browser or a widget guest; they now forward `data` as sent. A sub-agent and a realtime delegation target inherit their parent's marker. The model-authored template parameters merged into a sub-agent's `data` still lose the reserved keys either way.
  - **What server code does instead.** It sets the first-class `PrimaryScopeEntityName` / `PrimaryScopeRecordID` / `SecondaryScopes` fields, or sets `TrustReservedRunData` when `data` comes from a caller it trusts.
  - **Shared rule.** `WithAgentRunDataTrustApplied` in ai-core-plus is the one implementation. `AgentRunner`'s returning-visitor scope and `ExecuteSingleAction` called outside a run use it too, so an untrusted data scope no longer suppresses a widget guest's derived visitor scope.
  - **Tests.** Tests that pass `__agentTypePromptParams` as a per-run override now set the marker. The agent memory scoping doc states the rule.

- a531771: `check-registry.test.ts` pins 116 bundles, the count after #5590 (IT114, `ai-vendor-effort`) and #5647 (IT122, `agent-prompt-cancellation`) each added one. Both raised the pin from 114 to 115 on their own branches, so `next` failed "expected 115 but got 116" once both merged.
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

- ac9b00b: Who a conversation message is from (A19, the rules for people's messages). On the server, for a person's message (`Role`
  `User`, compared trimmed and in any case) in `MJ: Conversation Details`, the conversation's owner and grantees alike
  post only as themselves: a new message naming another person's `UserID` is refused, and a grantee's message with no
  `UserID` is saved with the grantee's (an empty one reads as the owner). Only a message's author changes who wrote it and
  what it says (`UserID`, `Message`, `ArtifactID`, `ArtifactVersionID`, `MediaType`, `ParentID`); no one changes a
  message's role to or from `User` or moves a person's message to another conversation or fork (`ConversationID`,
  `BranchID`); only its author or the conversation's owner deletes it. The system user is exempt from these authorship
  rules but, as before, still needs to own the conversation or hold a grant on it (the boundary for anonymous visitors
  elevated to the system user, MJ#4791). A person who cannot read an existing conversation can no longer write to it.
  GraphQL updates of `MJ: Conversation Details` always load the stored row, so a client's `OldValues___` cannot claim a
  message's author, role or rating. A conversation message whose row (`ID`), author, text, rating, conversation or fork a
  TransactionGroup `Use` variable fills in is refused for people (for the system user, its row, conversation or rating),
  and `ExecuteTransactionGroup` now registers a group's variables before any item is saved (an invalid `ItemIndex` fails
  before any write). Agent replies keep today's rules until MJ's chat stops writing them from the browser.
- 55184f1: `effortLevel` now controls how much Gemini and Vertex models think (#5171, and the Gemini part of #5530).

  **Behavior change:** prompts, prompt-model rows and agents that already set an effort level on a Gemini model will start thinking at that level. Until now the value never reached Google, so every Gemini prompt ran at the model's default. A prompt at effort 10 on a model whose default is high becomes faster and cheaper and may answer worse; re-evaluate such prompts after upgrading. Prompts with no effort level are unchanged.
  - **The thinking setting is sent with each request**, on streaming and non-streaming calls, for `GeminiLLM` and `VertexLLM`.
  - **Gemini 3 and later**, and unversioned ids such as `gemini-flash-latest`, get `thinkingLevel`. Effort 1–33 is `LOW`, 34–66 `MEDIUM`, 67–100 `HIGH`, the same bands the OpenAI, Groq and Cerebras drivers use. A number never maps to `MINIMAL`, which several models reject (Gemini 3.8 Flash among them); a named effort (`minimal`, `low`, `medium`, `high`, and other vendors' `none` / `xhigh` / `max`) is sent as that level.
  - **Gemini 2.5** gets `thinkingBudget`: 1024, 8192 or 24576 tokens by band, 512 for `minimal`. Earlier models and Gemma get no thinking setting, with a one-time warning when an effort is set.
  - **A level the model rejects does not fail the request.** On a 400 the request is sent once more: a rejected `MINIMAL` with `LOW` (Gemini 3.8 Flash accepts only low, medium and high), any other setting without one. If that succeeds, the replacement is used for that setting on that driver and model for the rest of the process, with a one-time warning; other levels are still sent as asked.
  - **Thought summaries are requested** whenever a thinking setting is sent, and every thought part is kept (non-streaming kept only the first).
  - **Thinking tokens count as completion tokens.** Google bills `thoughtsTokenCount` as output, but it was left out of `ModelUsage.completionTokens`, so reported tokens and cost for thinking Gemini models were too low and now rise to match the bill.

  **New live integration test, IT114 - AI Vendor Effort Levels** (Live Model suite). It runs a seeded probe prompt (`IT: Effort Probe`) through `AIPromptRunner` on each effort-capable model the environment has a credential for, and records the request bodies the drivers' SDKs send. Gemini and Vertex are checked strictly (thinking setting sent, `minimal` never fails, thinking tokens counted); every other driver is surveyed and its findings logged, with known gaps listed in the bundle. Models with no credential are skipped.

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

- 0cc6b08: Pre-execution RAG now applies the same scope-permission gate as the Scoped Search action and the GraphQL resolver. Before searching one of an agent's assigned scopes it resolves the effective `SearchScopePermission` for the acting user, with the agent as principal and the run's tenant, and requires a level above `Read`. Requested and persisted conversation skills are already active when pre-execution RAG runs, so the run's skills are passed in as well: when exactly one skill is active it is a second principal, as in the action, so its `SearchScopeAccess` can refuse a scope (`SkillNone`, `SkillAssignedNotListed`) and it is stamped as `AISkillID` on the search and on any `Forbidden` row; when several are active, none is passed. A sub-agent receives the root run's active skills, as it does for the action, so a sub-agent that cannot activate the root's lone active skill has its pre-execution scopes refused (`PrincipalNotActivatable`). Previously every assigned scope was searched for every user before the first tool call — the one scoped search path that never consulted scope permissions.

  A refused scope is skipped (the others still run) and written as one `Forbidden` row in `MJ: Search Execution Logs`, its reason truncated to the column's 500 characters; the console line is verbose-only. A resolver failure skips that scope with a logged error and writes no `Forbidden` row, as the action and the GraphQL resolvers do. A turn with no query text (an empty or multimodal last message on a scope without a query template) skips the scope before the gate, so it neither resolves a permission nor logs a `Forbidden` row with an empty query.

  **Behaviour change for existing configurations.** An agent whose `SearchScopeAccess` is `None` (the column default) no longer gets pre-execution retrieval, and an `Assigned` agent's scopes now need a `MJ: Search Scope Permissions` grant at `Search` or `Manage` for the acting user or one of their roles (or the agent set to `All`), exactly as the Scoped Search action already required. Deployments that attached pre-execution scopes without setting the agent's access or granting the scope will see retrieval stop, with a `Forbidden` row per scope explaining why.

  **Known resolver behaviour, inherited.** For an agent set to `All`, a user or role grant at `Read` on a scope is found before the agent's `All` fallback, so the resolver returns `Read` and the scope is refused: adding a `Read` grant removes pre-execution retrieval of that scope for the users it covers. The Scoped Search action and the GraphQL resolvers behave the same way.

  The agent form and the Knowledge Hub scope-permission grid now say that `Assigned` needs a Search grant for the user or one of their roles, and that pre-execution scopes are searched only for users who may search them. The integration fixture `IT: Integration Test Scope` gains `Search` grants for the `UI`, `Developer` and `Integration` roles, so the scope is searchable by any `UI`-role user wherever the integration fixture is pushed. A new deterministic integration test, `IT117 - Agent Pre-Execution RAG Permission Gate`, runs pre-execution RAG directly (no model) for a permitted run and a refused one.

- 4e4c82d: A cancelled model call now stops where it is: it is never failed over or retried, a call cancelled in flight is reported as `Cancelled` (a non-chat call cancelled before it starts is refused before a run row exists), and the cancellation reaches the vendor's SDK so the request is torn down rather than abandoned (#5548, #3132).

  **Prompts and agents (#5548)**
  - **No failover walk after a cancel.** `ExecuteWithFailover` stops before each candidate once the caller's token is aborted, and after any attempt that fails while it is aborted or that reports a cancellation. Before, one abort walked every model candidate (113 real driver calls in a live test) and logged an `[ERROR] [ModelExecution]` with a stack trace for each. Real failures before the cancel are still recorded as failover attempts. A timeout is not a cancellation and still fails over.
  - **Logged once, recorded as cancelled.** One info line instead of an error per candidate. The prompt run is saved `Cancelled` / `user_requested`, and the `AIPromptRunResult` carries `status: 'Cancelled'` and `cancelled: true`.
  - **Agent runs end Cancelled.** `BaseAgent` checks the token before treating a failed prompt as a failure, and before counting a failed step toward the consecutive-failure limit, so a run cancelled mid-prompt no longer ends `Failed`. A final answer that had already finished when Stop landed still completes the run.
  - **Failover fields persist.** A prompt run's `FailoverAttempts`, `FailoverErrors`, `FailoverDurations`, `TotalFailoverDuration` and failed-over `ModelID` / `VendorID` were written while its `Running` INSERT could still be in flight, and the INSERT's reload reset them, so a run that failed over could be saved with `FailoverAttempts = 0`. They are now set again in the queued finalize update, after the reload. This affected every runner, not only cancellation.

  **Cancellation in `@memberjunction/ai` (#3132)**
  - **`AIErrorType` has `'Cancelled'`**: Fatal and never failed over. `ErrorAnalyzer` on its own classifies an error named `AbortError`, `APIUserAbortError` or `RequestAbortedError` as `Cancelled`. The signal-aware helpers that `BaseLLM`, `BaseDecision` and every runner use (`BuildCancellationErrorInfo`) decide by why the signal was aborted, so an abort caused by a timeout stays a retriable `NetworkError`. A timeout is recognized by the abort reason's type — a `TimeoutError`, or a reason flagged `IsTimeout` (new `TimeoutAbortReason`; `AIPromptTimeoutError` sets it) — never by the words of a caller's reason.
  - **Shared helpers** (exported): `IsAbortError`, `IsTimeoutAbort`, `IsRequestAborted`, `BuildCancellationErrorInfo`, `IsCancellationErrorInfo`, `DescribeCancellation`, `CreateCancellationError`, `ThrowIfAborted`, `AbortableDelay`, and the `REQUEST_CANCELLED_CODE` / `REQUEST_TIMEOUT_CODE` codes.
  - **`BaseLLM` owns chat cancellation, per request.** It answers an already-aborted request without calling the driver, turns an abort (thrown, or a failed result while the signal is aborted) into one cancelled result, and decides a streaming cancellation from the request's own signal, so drivers no longer keep cancellation state on a shared instance. New protected `BuildCancelledChatResult`, `IsCancellationError` and the `IsProviderAbortError` hook. A pre-aborted streaming request now resolves cancelled on every driver instead of rejecting with a generic error.
  - **Every chat driver uses it.** The duplicated cancelled-result builders, predicates and stream-cancel flags are gone from Anthropic, Azure, Bedrock, Betty, BettyBot, Cerebras, Fireworks, Gemini (and Vertex), Groq, Inception, LMStudio, Mistral, Ollama and OpenAI (and its subclasses). Anthropic, Bedrock, Gemini, Mistral and Ollama used to report a cancel as a retriable `Unknown` error. Cancel messages now read "Request was cancelled[: reason]".
  - **Bedrock streaming** iterated the response envelope instead of its body, so every streaming call failed with "stream is not async iterable". Fixed.
  - `BaseDecision` and the decision runner classify an aborted decision by its signal, so a timeout fails over and a cancel does not.

  **Non-chat models**
  - **Media** (text-to-speech, speech-to-text, video): the driver params carry `CancellationToken`, the runner passes the call's bound signal, and the OpenAI, Groq, ElevenLabs and HeyGen drivers forward it. `MediaOperation.Invoke` takes the signal as a third argument.
  - **Embeddings, rerank and image generation** gain timeout and cancellation: `TimeoutMS` / `CancellationToken` on their run options, a pre-aborted run refused before a run row exists, a cancelled run recorded `Cancelled` and not failed over, and a timeout failed over. The param types gain `CancellationToken`, and the OpenAI, Azure, Bedrock, Cohere, Gemini, Mistral, Ollama and local embedding drivers, the Cohere, LLM and decision rerankers, and the OpenAI, Gemini and FLUX image drivers forward it. A cancelled `BaseEmbeddings.EmbedTexts` now throws a cancellation error instead of returning an empty result. The local embedding model can only stop between texts or batches.

  **Testing**
  - `TestLLM` gains a `hangUntilAborted` outcome. The LLM conformance suite drops `PreAbortedStreamingBehavior`: every driver must resolve a pre-aborted request as `Cancelled`.
  - New integration bundle **IT122 - Agent Prompt Cancellation**: a real agent run cancelled mid-call stops at that call and is recorded cancelled throughout.

- a9614be: Saving a query with `SkipEntityAIActions` now skips the LLM enrichment step of query extraction.

  Every save of a new query, or of a query whose SQL changed, runs the extraction pipeline, and with an AI vendor key present that includes an awaited LLM call (the `SQL Query Parameter Extraction` prompt) to describe parameters and fields. Nothing could turn it off. `MJQueryEntityServer.Save()` and the re-extraction a matching `MJ: Query SQLs` dialect save triggers now honour `EntitySaveOptions.SkipEntityAIActions`: the deterministic extraction still runs and writes parameters, fields, entities and dependencies, with heuristic descriptions in place of the LLM's, exactly as when the call fails. Without the option nothing changes. `RerunExtraction()` takes an optional `skipAIEnrichment` argument.

  The integration bundles that create queries (runquery-rendering, runquery-cache, runquery-features, materialized-read, server-cache) now save them with this option through a shared `FixtureQuerySaveOptions()`. They assert only on deterministic extraction, and the deterministic tier is meant to need no credentials, but with keys present IT102 made about 80 paid LLM calls and timed out at 300 s. It now passes 13/13 in 39 s with keys present.

- 1a46274: The performance and agent overhead benchmark integration test is now IT128. It shipped as IT123, a number "IT123 - Search Scope Bound" already used; IT124 through IT127 are claimed by open PRs. The test and its suite row keep their primary keys, so a sync renames them in place.

  The benchmark's exported report types (`PrimitiveBenchmarkMetrics`, `AgentRunTreeMetrics`, `PerformanceBenchmarkReport`) now use PascalCase member names, as the naming-conventions standard requires. Their 33 camelCase members failed the adopted-standards gate on every PR that touches a package's TypeScript. The keys in the JSON report the benchmark writes change with them (`wallTimeMs` is now `WallTimeMs`, and so on).

- ba61c0b: Role row-level-security filters that use subqueries, or that are shared across several entities, can be edited again once permission rows reference them. Editing such a filter's `FilterText` (through the entity layer or `mj sync push`) used to be refused by the checks built for API-key row filters, which treat every word of a subquery as a column and require every referrer to be on one entity. A filter referenced only by role permission rows is now screened for dangerous SQL (subqueries and function calls allowed; DDL/DML/EXEC, comments, semicolons and system catalogs still refused) and compiled against the base view of every entity that references it, so a bad column, table or function is still refused with the database's own error. A filter referenced by any API-key or API-application scope rule keeps the strict API-key rules unchanged. New mutation-gated integration checks RF1–RF3 in the `rls-isolation` bundle cover the edit, the read restriction for users whose only role carries the filter, and both negative cases.
- 0cc6b08: The Scoped Search action takes its tenant from the agent run, not from the model (A12.14).

  **Behaviour change.** Inside an agent run, the run's scope is authoritative for Scoped Search. A `PrimaryScopeRecordID` the run does not carry (a different tenant, or any tenant when the run has none) is refused with `INVALID_PARAM` and a `Forbidden` search-log row; with no `PrimaryScopeRecordID` the action searches the run's tenant. `SecondaryScopes` may restate a dimension the run sets only with an equal value; a dimension the run does not set is still added. The host sets the run's scope (`ExecuteAgentParams.PrimaryScopeEntityName` / `PrimaryScopeRecordID` / `SecondaryScopes`), never the model. The resolved tenant goes into both the permission decision and the search, so omitting it no longer drops tenant-scoped deny rows from the decision. A single agent run can no longer search several tenants by passing different values; run one run per tenant. Direct action calls outside an agent run are unaffected.

  **Malformed `SecondaryScopes` now refuses.** Input that is not valid JSON, is not an object, or holds a value other than a string, number, boolean or string array is refused with `INVALID_PARAM`, inside and outside a run. Before, it was logged and dropped, so the search ran without those dimensions. An object value is now accepted as well as a JSON string.
  - **`@memberjunction/actions-base`**: new `RunActionParams.RunScope` (`ActionRunScope`, `ActionRunScopeValue`). It is the run's tenant and secondary dimensions, set per dispatch beside `Audience`, never on the shared `Context`. Fields are `null` when the run is unscoped; the field is absent outside an agent run.
  - **`@memberjunction/ai-agents`**: `ExecuteSingleAction` always stamps `RunScope`. Inside `Execute` it uses the scope `initializeAgentRun` validated and wrote to the run row, with the agent's `ScopeConfig` defaults applied; called directly, it resolves the scope from its params the same way. `ExecuteSubAgent` strips the reserved run-data keys from the model-authored `templateParameters` before merging them into the child's `data`, and logs the key names once. The reserved keys are the scope family and `__agentTypePromptParams`. Without this a model could set a sub-agent's tenant whenever the parent's scope arrived through `data`. The parent's own `data` is passed on unchanged.
  - **`@memberjunction/ai-core-plus`**: new `RESERVED_AGENT_RUN_DATA_KEYS` and `WithoutReservedAgentRunDataKeys`. `@memberjunction/server`'s agent-run `data` guard now uses this shared list instead of its own copy.
  - **`@memberjunction/core-actions`**: Scoped Search resolves the tenant (`resolveTenant`). Forbidden rows now record the tenant they were judged under. TSDoc and `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` updated.

  Tests: unit tests in each package, and a new check in the deterministic `agent-run-audience` bundle (IT119, AU7). No migration.

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

- 0cc6b08: Three search trust fixes. Each changes behaviour.

  **External-index hits are always verified against the entity they name.** The permission pass used to skip its ownership check for any result labelled `SourceType: 'entity'` or `'fulltext'` when no row filter applied. Every shipped external-index provider (Azure AI Search, Typesense, Elasticsearch, OpenSearch) labels its hits `'fulltext'`, with the index name as `EntityName` and the document's own id as `RecordID`. So a document in an index named after an entity the user can read was admitted as that entity's row without being checked. A third-party provider could also label its hits `'entity'`. Trust now follows the provider the engine stamped on the result (`ProviderId`), never the label. The new `BaseSearchProvider.ResultsAreRowsOfLabelledEntity` flag (default `false`) is set only by `EntitySearchProvider` and `FullTextSearchProvider`, which read the entity through `RunView`. Every other result is verified, including one with no `ProviderId` and one whose `ProviderId` names no configured provider. Fusion and dedup keep each result's `ProviderId` paired with its own `EntityName`, `RecordID` and `SourceType`, so a merge never upgrades an external hit to trusted. A merge can still lend a result another item's scores: dedup merges items sharing `EntityName` + `RecordID`, but per-scope RRF merges `ScoreBreakdown` across items that share only a `RecordID`, of any entity. A `MJ: Content Items` hit promoted to its origin record is always verified: its provider never read that row. Cost: one `PK IN (...)` read per labelled entity for each search that returns external-index hits. Hits whose document id is not the MJ primary key of the labelled entity are dropped. The entity and full-text lanes cost nothing extra.

  **Naming a scope that cannot be resolved no longer widens the search to a global one.** An inactive, expired or missing scope in `SearchParams.ScopeIDs` used to be skipped. A search whose scopes were all skipped then ran with no scope at all. The GraphQL paths let a caller with a grant on a dead scope do this, because the scope permission check does not look at scope status. Now, if any named scope cannot be resolved, the search is refused: `Success: false`, an error naming the scope, a `LogError`, a `Failure` row in `MJ: Search Execution Logs`, and no provider runs. One dead scope among several also refuses the search, because dropping it silently would change what the caller asked for. The check runs before the result cache. `ExplainScope` agrees with the search. It now reports an inactive or expired scope as unreachable, by name; before, it explained one as searchable. When one requested scope cannot be resolved, it reports every scope in that dry run as unreachable, with the reason.

  **Streamed `provider` events carry counts only.** `streamSearch` used to put each provider's hits on its `provider` event, before the permission pass. That included rows the caller's row filters would drop, unverified external-index hits, and content whose origin record the caller may not read. `SearchKnowledgeStreamResolver` published those hits to the client. A `provider` event now carries `providerName`, `durationMs` and a new `resultCount` (the provider's hit count, capped at `MaxResults`). `results` is always `[]` and is deprecated. Results arrive only in `fused` and `final`. The GraphQL `SearchStreamNotification` gains `ResultCount` and always sends `Results: []` on a provider event, whatever the engine hands it. `GraphQLSearchClient.StreamSearch` requests `ResultCount` (new exported type `SearchStreamClientEvent`). `SearchService.StreamSearch` forwards it. The search overlay, the search results page and the scope form preview now show each provider's count from it, and render rows from `final` only. Pre-execution RAG's streaming trace and the Scoped Search action's `ProgressEvents` report `resultCount`. Like `SourceCounts`, `resultCount` is counted before the permission and audience passes, so don't show it to a room. This replaces the audience-only withholding of partials. Because a newer client requests `ResultCount`, its stream subscription fails against an older server. The reverse also shows: an older client counts each provider's `Results`, which a newer server always sends empty, so its per-provider chips show 0 until the client is upgraded. Search results themselves are unaffected.

  New deterministic integration bundle `IT118 - Search Provider Trust and Unresolvable Scopes` (`search-provider-trust`, SPT1–SPT2).

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

- 5f707d1: SQL Server entity saves and deletes now send their values as typed parameters instead of pasting them into the batch as literals. The statement keeps its DECLARE / SET / EXEC shape with `SET @Name$ = @p$0`, so its text is the same for every record of an entity (for a given set of fields) and SQL Server reuses one cached plan instead of compiling every save. Each parameter is typed from its column (`nvarchar(100)`, `uniqueidentifier`, `bit`, …); `decimal`, `numeric`, `money` and `smallmoney` are sent as their exact text, because the driver would round them through a double. Record Change values are typed from the Record Changes columns, so their text is stored as Unicode. The SQL log, migration captures, error messages and TransactionGroup items get the literal form: the same statement with the values written back in, as before. `SaveSQLResult`, `DeleteSQLResult`, `ExecuteSQLOptions` and `SaveSQLFragment` gain an optional `literalSQL` for that. Date and time values (`date`, `time`, `datetime`, `datetime2`, `datetimeoffset`, `smalldatetime`) are sent as their ISO-8601 text, so nothing depends on the server's time zone: the stored offset is `+00:00`, seconds round as before, and year-boundary values such as `0001-01-01` and `9999-12-31` still save on servers outside UTC. A number field whose value is not a finite number (an empty string, `abc`) fails the save, as it did before, instead of storing `0` or NULL. `sql_variant` values stay inline literals, so SQL Server still picks their base type from the value. If the startup `datetimeoffset` probe fails, it is retried after 30 seconds rather than on every call. `sysname` columns are sent as text; they used to be written unquoted and fail. The public `GetSaveSQL` returns the statement with its values written in.
- 0cc6b08: Add storage checks ST7 (an unknown account is refused with the same access-denied message as a restricted one) and ST8 (on a fixture account: zero permission rows are open, a role restriction refuses the seeded no-grant user while the context user passes, CanWrite is decided separately, and a grant added or revoked mid-check is seen on the next call; fixture rows are deleted and asserted gone). The storage bundle count is now 8.
- Updated dependencies [3b0e8db]
- Updated dependencies [0d81c53]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [fd780a9]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [52b9fd5]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [db39145]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [8443fd2]
- Updated dependencies [2ed72d8]
- Updated dependencies [832c63c]
- Updated dependencies [d26183d]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [db50c6b]
- Updated dependencies [afc1e0e]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [5465489]
- Updated dependencies [a9344ad]
- Updated dependencies [c6b4b85]
- Updated dependencies [d29b5c2]
- Updated dependencies [17c36d1]
- Updated dependencies [1419678]
- Updated dependencies [0ab85d7]
- Updated dependencies [9d1eb6a]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [cd39c95]
- Updated dependencies [55184f1]
- Updated dependencies [e5675dc]
- Updated dependencies [c6d1232]
- Updated dependencies [2274f42]
- Updated dependencies [35ed364]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [542795b]
- Updated dependencies [db39145]
- Updated dependencies [a0db1fb]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [fcc3f03]
- Updated dependencies [230cdad]
- Updated dependencies [7e72c86]
- Updated dependencies [0cc6b08]
- Updated dependencies [4e4c82d]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [a9614be]
- Updated dependencies [2a7a098]
- Updated dependencies [8420f36]
- Updated dependencies [72dd65c]
- Updated dependencies [e38710c]
- Updated dependencies [1d29837]
- Updated dependencies [006a5e7]
- Updated dependencies [ba61c0b]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [2ca8690]
- Updated dependencies [74d44e1]
- Updated dependencies [c7d1170]
- Updated dependencies [79d4f27]
- Updated dependencies [5f707d1]
- Updated dependencies [091e7ea]
- Updated dependencies [0cc6b08]
- Updated dependencies [3cb20c0]
- Updated dependencies [e1f2583]
- Updated dependencies [8389c99]
- Updated dependencies [03c085c]
- Updated dependencies [dc38250]
  - @memberjunction/generic-database-provider@6.2.0-edge.5
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.5
  - @memberjunction/postgresql-dataprovider@6.2.0-edge.5
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/ai-agents@6.2.0-edge.5
  - @memberjunction/ai-prompts@6.2.0-edge.5
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/testing-integration@6.2.0-edge.5
  - @memberjunction/ai-core-plus@6.2.0-edge.5
  - @memberjunction/actions-base@6.2.0-edge.5
  - @memberjunction/actions@6.2.0-edge.5
  - @memberjunction/ai-engine-base@6.2.0-edge.5
  - @memberjunction/aiengine@6.2.0-edge.5
  - @memberjunction/task-graph@6.2.0-edge.5
  - @memberjunction/conversations-runtime@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/graphql-dataprovider@6.2.0-edge.5
  - @memberjunction/communication-types@6.2.0-edge.5
  - @memberjunction/communication-ms-graph@6.2.0-edge.5
  - @memberjunction/communication-gmail@6.2.0-edge.5
  - @memberjunction/core-entities-server@6.2.0-edge.5
  - @memberjunction/scheduling-engine@6.2.0-edge.5
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.5
  - @memberjunction/codegen-lib@6.2.0-edge.5
  - @memberjunction/open-app-engine@6.2.0-edge.5
  - @memberjunction/telephony-adapters@6.2.0-edge.5
  - @memberjunction/ai-agent-harness@6.2.0-edge.5
  - @memberjunction/record-set-processor@6.2.0-edge.5
  - @memberjunction/storage@6.2.0-edge.5
  - @memberjunction/search-engine@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/livekit-room-server@6.2.0-edge.5
  - @memberjunction/content-autotagging@6.2.0-edge.5
  - @memberjunction/ai-gemini@6.2.0-edge.5
  - @memberjunction/metadata-sync@6.2.0-edge.5
  - @memberjunction/ai-systemone@6.2.0-edge.5
  - @memberjunction/ai-inception@6.2.0-edge.5
  - @memberjunction/ai-cloudflare@6.2.0-edge.5
  - @memberjunction/templates-base-types@6.2.0-edge.5
  - @memberjunction/ai-anthropic@6.2.0-edge.5
  - @memberjunction/ai-openai@6.2.0-edge.5
  - @memberjunction/unit-testing@6.2.0-edge.5
  - @memberjunction/templates@6.2.0-edge.5
  - @memberjunction/feature-pipelines@6.2.0-edge.5
  - @memberjunction/feature-pipelines-engine@6.2.0-edge.5
  - @memberjunction/predictive-studio@6.2.0-edge.5
  - @memberjunction/record-set-processor-base@6.2.0-edge.5
  - @memberjunction/notifications@6.2.0-edge.5
  - @memberjunction/work-queue-engine@6.2.0-edge.5
  - @memberjunction/work-queue-server@6.2.0-edge.5
  - @memberjunction/ai-bridge-base@6.2.0-edge.5
  - @memberjunction/ai-bridge-server@6.2.0-edge.5
  - @memberjunction/ai-vector-dupe@6.2.0-edge.5
  - @memberjunction/api-keys@6.2.0-edge.5
  - @memberjunction/communication-engine@6.2.0-edge.5
  - @memberjunction/communication-sendgrid@6.2.0-edge.5
  - @memberjunction/credentials@6.2.0-edge.5
  - @memberjunction/encryption@6.2.0-edge.5
  - @memberjunction/queue@6.2.0-edge.5
  - @memberjunction/query-processor@6.2.0-edge.5
  - @memberjunction/rubrics@6.2.0-edge.5
  - @memberjunction/testing-engine@6.2.0-edge.5
  - @memberjunction/ai-openrouter@6.2.0-edge.5
  - @memberjunction/auth-providers@6.2.0-edge.5
  - @memberjunction/communication-expo-push@6.2.0-edge.5
  - @memberjunction/communication-twilio@6.2.0-edge.5
  - @memberjunction/redis-provider@6.2.0-edge.5
  - @memberjunction/rubrics-base@6.2.0-edge.5
  - @memberjunction/predictive-studio-core@6.2.0-edge.5
  - @memberjunction/work-queue-core@6.2.0-edge.5

## 6.2.0-edge.4

### Minor Changes

- d17de94: MJAPI records a person's choice of whether agents may see their camera and shared screen in a LiveKit room. The new `SetLiveKitAgentVision` mutation works out the participant from the signed-in user (no identity is sent), sets their `mj.agentCanSee` attribute through LiveKit's server SDK with the new `LiveKitParticipantService` (a participant's token can't change its own attributes), and writes an `MJ: Audit Logs` row of the new `Realtime Agent Vision Consent` type whether LiveKit applied the change or refused it. `GraphQLLiveKitClient.SetAgentVision` calls it, and `AgentVisionAttributes` in `@memberjunction/ai` builds the attribute change. Integration test IT113 drives it over the wire. Minor because it adds an audit log type under `metadata/`.
- f0c78c3: Realtime session events and mid-session identity verification (server side), with a typed client.
  - **Session events** (`@memberjunction/ai-core-plus`, `@memberjunction/server`). A framework-neutral event contract (`RealtimeSessionEvent`, an extensible payload map whose first type is `identity.verified`, and a validating `ParseRealtimeSessionEvent`), a `RealtimeSessionEventService` apps publish through, and a `RealtimeSessionEvents(agentSessionId)` GraphQL subscription. It is authorized twice: when it opens and for every event. The session's `UserID` must be the caller's; an anonymous widget guest must also present a signed per-session scope matching the session's conversation. A refusal reads "not found" whether the session is missing or simply not the caller's.
  - **Identity verification** (`@memberjunction/server`). A person proves they control an email address without leaving the conversation: `RequestRealtimeSessionVerification`, `SubmitRealtimeSessionVerificationCode` and `RealtimeSessionVerificationStatus`, plus the public `GET/POST /realtime/verify` link routes (GET only renders a confirm button, so mail scanners cannot consume the link). Single use, expiring, constant-time compared. Policy: `requireBusinessDomain`, `consumerDomains`, `blockedDomains`, `linkTtlMinutes`, `maxSendsPerSession`, `maxCodeAttempts`, `unverifiedMaxSeconds`, `verifiedMaxSeconds`, plus per-IP, per-domain, per-address and per-session limits. On success the session is marked verified, its deadline extended, `identity.verified` published and an audit entry written. It never creates an MJ user or changes the session's principal. Off by default; needs `realtime.identityVerification.enabled`, a `communicationProvider` and an `hmacSecret` (at least 16 characters). `deliveryMode: 'dry-run'` builds and logs the email without delivering it, for rehearsal and integration environments. See `packages/MJServer/src/realtimeSessions/README.md`.
  - **The typed code is keyed.** The six-digit code is stored as an HMAC under a server-only secret, because the session's owner can read their own session row and an unkeyed hash of a six-digit code can be reversed offline.
  - **Server-decided session state is protected** (`@memberjunction/core-entities-server`). `MJAIAgentSessionEntityServer` refuses any write to `Config.identityVerification` or `Config.maxSessionDeadlineIso` that does not come from trusted server code, including from the session's own owner. Without it the owner could forge a verified identity or move their own deadline.
  - **`StartRealtimeClientSession`** stamps the verification policy snapshot and the unverified duration cap on any principal, and carries a verified identity forward from `lastSessionId` when the caller is authorized on it. It also stops dropping `Config` keys (`directActions`, `mediaCollectionID`) when it records the run ids.
  - **`AppContext.ClientIp`** (`@memberjunction/server`) carries `req.ip` for abuse limits.
  - **`GraphQLRealtimeSessionClient`** (`@memberjunction/graphql-dataprovider`). The typed transport for the three operations and the subscription: `RequestVerification`, `SubmitVerificationCode`, `GetVerificationStatus`, `SubscribeToSessionEvents` and `SubscribeToSessionEventsOfType`. It never throws, never logs the email address or code, parses `PayloadJson` with `ParseRealtimeSessionEvent` and passes unknown event types through so a newer server cannot break an older client. It reuses `GraphQLDataProvider.Subscribe`.
  - **Metadata.** Adds the audit log type "Realtime Identity Verified".
  - **Integration tests** (`@memberjunction/integration-test-suite`). IT111 (server transport) proves the session guard in process and seeds the server-decided fixtures; IT112 (client transport) drives verification end to end over the GraphQL wire and a real HTTP GET and POST of `/realtime/verify`.

### Patch Changes

- 6cd23e1: A call whose agent asked for a live avatar it can't show says so once. Core gains `RealtimeAvatarStatus`, `ClientRealtimeSessionConfig.AvatarStatus`, `BaseRealtimeModel.SupportsAvatarOutput(model)` (default `false`; Gemini answers from its Live profile) and `ParseRealtimeAvatarStatus`, and the browser-side reason `downgraded` becomes `host` and `browser` (the Gemini and Gemini Enterprise browser clients log the new reason). Both Gemini drivers (`GeminiRealtime`, and `GeminiEnterpriseRealtime` in `@memberjunction/ai-vertex`) return their avatar decision on the mint, through the protected `AvatarStatusFor`; `RealtimeClientSessionService.PrepareClientSession` merges it with the persona resolution (`endpoint` first, then `no-binding` / `unknown-avatar`, else the driver's decision), logs one line, and returns `AvatarStatus`, which MJServer sends as `StartRealtimeClientSessionResult.AvatarStatusJson`. The stock launcher asks for the field and drops it alone against a server that predates it. After the call connects, the runtime publishes `AvatarNotice$` (`host` when the app asked for no agent video, `browser` when the track did not go live, else the status's reason), once per call, and clears it when the call ends. `ng-realtime-media` holds the wording (`AvatarNoticeText`, "Audio only: …", per-reason host overrides) and declares `@memberjunction/ai`; the call overlay shows it as a small info `mj-alert` under the banner in both chromes, with a dismiss button, hiding after 10 s, never in review (`AvatarNoticeLabels` overrides the words). Calls whose agent asked for no avatar look as before. Integration check RD13 also checks that a voiced agent without a face on the session's vendor asks for no avatar and reports `no-binding`.
- de2dc2f: Avatar video in realtime usage and cost. The Gemini browser client counts the seconds of avatar video a model turn generated from the fragments' durations (Core's fragmented MP4 reader gains track timescales and `Fmp4VideoSeconds`), until `generationComplete` (an interrupted turn counts what arrived before `interrupted`), and emits them once, as amounts, in `OutputTokenDetails.VideoSeconds`; it also reads Google's response-side token split, VIDEO included (`RealtimeUsageModalityDetail.VideoTokens`). The runtime relays the full input and output detail blocks, and an update that carries only video seconds; `RelayRealtimeUsage` takes them as an optional `usageDetailsJson` argument, and `AccumulatePromptRunUsage` adds them into the co-agent prompt run's `ModelSpecificResponseDetails.RealtimeUsage` record, with the stored video seconds capped at the run's elapsed time plus 30 seconds. At finalize, a run whose model vendor configuration has `Realtime.Pricing.AvatarVideoOutput` (per minute) is priced at its cost row plus a video line, the video's output tokens leave the cost row's output bucket, and the lines are written under `CostLines`; without that price the run prices as before. The agent-run analytics cost card shows the avatar video on its own line and no longer prices the video's tokens as output. Integration check RD16 stores a minute of avatar usage on a co-agent-shaped prompt run for Gemini 3.8 Live on Vertex AI, finalizes it, and checks its cost lines.
- fd2a410: A bridged realtime session (a meeting bot, a phone call) now stores the usage its model session reports while closing, so a meeting's last avatar seconds are stored and priced (#5355).

  Closing a bridged session finalized its co-agent runs first and closed the model session after. What the model session reported while closing reached a usage recorder that was already closed and was dropped: a Gemini avatar session reports its last seconds of video then, about 10 s of 145 s in a live meeting.
  - The `Close()` that `WireBridgeRealtimeSession` wraps now cancels pending narration, closes the model session, waiting up to `BRIDGE_SESSION_CLOSE_WAIT_MS` (5 s), and then finalizes the runs, whether the close finished, failed or ran out of time. A failed close still rejects, after the finalize; a close that runs out of time is logged, and what it reports later is not stored.
  - A model session the bridge replaces when the bot takes the avatar down closes the same way, so its last seconds stay on its own run.
  - Usage reported after the runs were finalized is still not stored.
  - Integration check RD15's stand-in session reports 1.5 s more video while it closes. The run must store 4 s, and on a model-vendor pair with an avatar video price (Gemini 3.8 Live on Vertex AI) price the 4 s on its video line.

- 0dbd455: A realtime session that runs on the server (a LiveKit meeting bot, a phone call, a Teams meeting) now records its model usage, as browser calls do.

  Until now nothing subscribed a bridged session's usage events: its co-agent prompt run finished with zero tokens and no cost, so meetings and calls showed only their delegated runs' cost.
  - `WireBridgeRealtimeSession` subscribes the session's `OnUsage` and adds the usage to the session's co-agent prompt run through `AccumulatePromptRunUsage`, 10 s after the first unwritten update and once more before the run is finalized. The run is priced at finalize from its final counts, and the co-agent run's totals follow.
  - Per-modality usage goes into the run's `RealtimeUsage` record (`ModelSpecificResponseDetails`), with the same rules browser calls use (`AddRealtimeUsageRecord`, `MergeRealtimeUsageRecord`).
  - The record gains `DurationSeconds`, the provider's session duration so far (GPT-Live reports it): a running total that keeps the larger value. Only a server-side session writes it; `ParseRealtimeUsageRecord` drops it from a relayed record.
  - A replaced model session (a recovery after the model dropped) keeps its usage on its own run; the replacement records on its own.
  - Usage a session reports after its run was finalized is not stored, and the first such update is logged. Up to 10 s of usage per live session can be lost when MJAPI stops without closing its sessions.
  - The Gemini server driver now reports the response's split by modality (`responseTokensDetails`) as `OutputTokenDetails`, beside the prompt's split, and VIDEO tokens as `VideoTokens` in both directions (the browser client's table: TEXT, AUDIO, IMAGE, VIDEO). A report whose counts are all in other modalities keeps no block.
  - New deterministic check RD15: a bridged session's usage lands on its co-agent prompt run before finalize prices it, and usage after close is not stored.

- c87f87a: Give the dataset cache one category, so its warm-serve path works again

  Six functions on `ProviderBase` touch the dataset cache and only the warm read in
  `GetAndCacheDatasetByName` named a category (`'DatasetCache'`); the write and the other four readers
  passed none and so landed in `default`. Every storage provider isolates by category — Redis keys are
  `{prefix}:{category}:{key}`, browser localStorage `[mj]:[category]:[key]`, IndexedDB a dedicated
  object store — so the read looked in a namespace nothing wrote to and missed on every transport since
  `987a126aab` (2026-05-02). The fallback refetched and rewrote the cache, so the system was slow rather
  than wrong, which is why it went unnoticed: nothing asserted that a second call did not hit the server.

  All six now share `ProviderBase.DatasetCacheCategory`, which also makes
  `mj cache clear --category DatasetCache` honest — it previously reported a successful clear of 0 keys
  while the dataset sat in `default`. Dataset keys an older build left there are still swept by a full
  clear, so no migration is needed. Expiry is unchanged: `CacheDataset` already passed explicit TTLs,
  and a per-write TTL wins over any category setting.

  Fixing the category switches on a freshness comparison that had not run in five months, and the two
  copies of it had drifted: the warm path dereferenced `cachedDataset.Results` unguarded, so a cached
  blob without `Results` threw instead of refetching — on the metadata bootstrap path. Both paths now
  call one `DatasetRowCountsMatch`, preserving the two behaviours that matter: a status with no
  per-entity counts is judged on its timestamp alone (returning false there makes such a dataset
  permanently stale), and a missing blob with counts to compare means refetch.

  Also widens `CacheDataset`'s `itemFilters` to optional on `ProviderBase`, `Metadata` and
  `IMetadataProvider`, matching every sibling method and the implementation's own handling of a falsy
  value, and adds integration check `dataset-cache.DS4`, which distinguishes a warm call that was served
  from one that silently refetched — something DS1 through DS3 could not do.

- 91be34f: Gemini Live on Gemini Enterprise (Vertex AI): a server driver and a browser driver. `GeminiEnterpriseRealtime` (`@memberjunction/ai-vertex`) reads `AI_VENDOR_API_KEY__GeminiEnterpriseRealtime` (or a run's key), a JSON string in the shapes `VertexLLM` takes: an inline service account, a key-file path (environment key only), or neither for Application Default Credentials. A client-direct session goes through MJAPI's realtime relay: the mint issues one relay session per call, whose policy writes the Live setup from the connect config and adds a `google-auth-library` bearer token (scope `cloud-platform`) on each upstream open, never at the mint. The browser gets the relay URL, with the ticket in its path, and a pact whose config holds only the response modalities and the avatar's name: no system prompt, no tools, no credential. The upstream is the Vertex AI `v1` Live socket on the location's host (`us` and `eu` on `aiplatform.<location>.rep.googleapis.com`); the mint warns when the location is not `us`, `eu` or `us-central1`. A bridged session uses `@google/genai` in Vertex mode, audio only. The constructor never throws; a key that cannot be read fails the session with a reason that quotes none of it. `GeminiEnterpriseRealtimeClient` (`'gemini-enterprise'`, `@memberjunction/ai-realtime-client`) runs the web SDK in Vertex mode against the relay URL with a placeholder API key that never leaves the page, always states its response modalities (VIDEO while it shows the avatar), and resumes on the same URL. Both Vertex drivers now read their key through shared helpers (`ParseVertexAICredentials`, `VertexKeySourceOf`, `CreateVertexAuthClient`, `VertexGenAIOptions`) and build the `google-auth-library` client themselves instead of passing the deprecated `keyFile` or `credentials` options to `GoogleAuth`: an inline service account becomes a `JWT` client with the `cloud-platform` scope, and a key without credentials still uses Application Default Credentials. **Change to run-key handling in `VertexLLM`: a key may name a key file (`keyFilePath`) only when it is the driver's environment key (`AI_VENDOR_API_KEY__VertexLLM`; `AI_VENDOR_API_KEY__GeminiEnterpriseRealtime` for the realtime driver), byte for byte. A run's key (`apiKeys`), an MJ Credential (the Google Cloud Platform credential type's Key File Path) or any other key that names a key file is refused when the client is created, with an error that does not quote the path; use an inline service account (`serviceAccountJson`) or Application Default Credentials instead.** Environment keys behave as before: MJ reads the key file and builds the client for its `type` (service account, authorized user, impersonated service account, external account, GDCH). The file is now read when the client is created rather than at the first request, and its errors no longer quote the path. `GeminiRealtime` gains the protected `SessionPactFor`. The realtime runtime keeps the new client from being tree-shaken, and the server and browser class-registration manifests register the two drivers. Integration checks RD13 (the avatar from the voiced agent's persona, through the session prep) and RD14 (every realtime vendor DriverClass resolves). Nothing selects the Enterprise driver until its vendor row ships.
- 08a4cfc: The meeting bot publishes an agent's avatar. Before an agent's meeting session opens, the room coordinator asks the native room module whether the bot can publish one (`describeAvatarVideo`: `@livekit/rtc-node` with video publishing, and ffmpeg 4.2 or later with the H.264 and AAC decoders, from `MJ_FFMPEG_PATH` or the `PATH`, probed once per thread); only then does the session ask for it (`RealtimeAvatarSettings.Delivery: 'room'`, threaded through the bridged session prep), and the Gemini driver grants it on an endpoint that renders avatars (VIDEO, the avatar at 2 Mbps), with the decision on `IRealtimeSession.AvatarStatus`. A granted bridged Gemini session sends the avatar's fragmented MP4 as typed frames through `IRealtimeSession.OnVideoFrame`, plays PCM only before a turn's first video, drops media from `interrupted` to that turn's `turnComplete`, and reports the avatar video it generated as `OutputTokenDetails.VideoSeconds` deltas through `OnUsage` (counted up to `generationComplete`). The engine sends the pieces on `video-out` with their MIME type; in a full-duplex multi-agent room each piece passes the floor gate by its audio's duration (`FullDuplexTurnGate.OnOutputDuration`). The LiveKit bridge routes `video/mp4` frames to the room client (`publishAvatarMedia`), which reads them with Core's fMP4 reader (`ReadFmp4Fragment`, `AvccToAnnexB`, `AdtsHeader`, and `Fmp4AudioSeconds` beside AV9's `Fmp4VideoSeconds`; `ReadFmp4Init` also reads a track's size, the trex sample size and flags, the H.264 parameter sets and the AAC config), decodes them in two long-lived ffmpeg child processes, queues the voice on the bot's audio track and shows each frame on a camera track (`agent-avatar`, LiveKit's default simulcast, published at the first frame) when the voice's playout reaches the frame's timestamp. A barge-in drops the queued frames and fences both decoders; the last frame stays on screen. A decoder that dies is restarted; three failures of one decoder within 60 s, or a refused camera track, take the avatar down: the track is unpublished, the bot sets `mj.agentAvatar` to `audio-only:<reason>` (agent bot tokens now carry `canUpdateOwnMetadata`), and the engine replaces the model session with an audio-only one (`StartBridgeSessionParams.RecoverRealtimeSessionWithoutAvatar`). The bot's join token carries `mj.agentAvatar` (`on`, or `audio-only:<reason>` with `decoder-missing` when the host has no usable ffmpeg); Core adds the attribute helpers and the reasons `decoder-missing`, `decoder-failed` and `publish-failed`, which `ParseRealtimeAvatarStatus` reads and `REALTIME_AVATAR_UNAVAILABLE_REASONS` lists (from the same table); the call and mobile notices word them "Audio only for {Agent}: the avatar couldn't be shown in this meeting". `GeminiEnterpriseRealtime` renders a bridged session's avatar the same way. With the media worker on, the pieces are transferred to the worker, a restarted worker gets the stream's init again, and one restarted after a take-down joins audio only. Integration check RD17 (the LiveKit provider allows video out, and the native module answers the avatar probe). The MJAPI image can install a pinned LGPL static ffmpeg (BtbN) checked against its sha256; it is off by default (`INSTALL_FFMPEG=false`, so meetings stay audio only): fill in the pin values and build with `--build-arg INSTALL_FFMPEG=true` to turn it on.
- ebd4972: `realtime-deterministic.RD13` and `RD18` turn avatar video on the way a deployment does: through the voiced agent's own `TypeConfiguration`, on a tagged fixture agent each check creates and deletes, since the runtime override can no longer turn `realtime.video.enabled` on. RD13 also checks the new rule: with the agent's setting off, an override of `enabled: true` asks for no avatar, and one that also picks the avatar says why (`video-off`).
- 0d0ba18: An app that shows no agent video now tells the mint, and the mint asks the model for no avatar. Every browser session counted as one that could show an avatar, so a video-enabled agent's call from the embeddable widget or the mobile app, which have no channel that shows the agent's video, was steered to a model that renders avatars and minted with the avatar asked for; the browser then dropped it at connect (`host`). `StartRealtimeClientSession` takes `showsAgentVideo`: with `false` the session prep (`PrepareClientSessionInput.ShowsAgentVideo`) asks the driver for no avatar, keeps the avatar persona's voice, prefers no avatar model in the default model walk, and returns `AvatarStatusJson` with the existing reason `host` ("Audio only: this app can't show the avatar"); absent or `true` behaves as before. The argument only ever turns video off. The realtime runtime works it out from the session's channels before the mint: when no channel that could be in the session shows the agent's video (an Avatar channel switched off in the registry counts as none), the launch request carries `ShowsAgentVideo: false` (`RealtimeSessionLaunchRequest.ShowsAgentVideo`) and the stock launcher sends `showsAgentVideo: false`; a host whose Avatar channel can show it sends nothing new. The embeddable support widget's guest mint always sends it. Against a server that predates the argument, both mint without it, once, and remember (the launcher's fallback pattern). Integration check RD13 also checks that an app without agent video asks for no avatar and keeps the persona's voice.
- 7177e09: A realtime model shows an agent's avatar only when its `MJ: AI Model Modalities` Video/Output row allows video and the endpoint profile of its driver renders avatars. A row with `IsSupported` false turns video off: the session prep asks the driver for no avatar, logs one line, and the call's status says `endpoint` ("this voice model can't show an avatar"); a model with no row is left to its driver's profile, as before. The rows are read from the AI engine's cache (`ReadRealtimeVideoOutputRow`, `RealtimeModelShowsAvatar`). A co-agent with video on, when no model is named (no runtime pick and no `realtime.modelPreference`), takes the first candidate that shows an avatar, trying each model's keyed vendor rows by Priority (`RealtimeClientSessionService.ResolveAvatarRealtimeModel`, `ListRealtimeVendorsForModel`); when none does, it keeps the model it would have taken, audio only, with one log line. A server-side session (`PrepareClientSessionInput.ServerSide`, set by `BaseAgent`'s bridge prep) gets the preference only when its host publishes the avatar into a room (`AvatarDelivery: 'room'`). Integration check RD18 drives the gate through real metadata: Gemini 3.8 Live on Vertex AI asks for the avatar, a tagged model on the same endpoint whose row has `IsSupported` false asks for none, and without that row it asks again.
- 8704df6: A phone call never asks the model for an avatar. A caller hears the agent and sees no video, but a voiced agent whose persona has a face still asked for its avatar on a phone call: on a carrier call (Twilio, Vonage, RingCentral) the Gemini driver refused it as `bridged` and logged that on every call, and on a call that reached a LiveKit room through SIP the room coordinator asked for room delivery whenever its host could publish, so the model rendered avatar video, billed per minute, that the caller never saw. The session prep now decides before the driver: a session marked as a phone call (`PrepareClientSessionInput.PhoneCall`, set from `params.data.realtimePhoneCall`, which `CreateBridgeRealtimeSession` sets from `BridgeRealtimeSessionContext.PhoneCall`) carries no avatar request, keeps the avatar persona's voice so the agent sounds the same as in a call that shows its face, and the default model walk prefers no avatar model for it. The telephony call starter marks every carrier call as a phone call; the room call starter passes its channel to the coordinator (`AgentRoomHostOptions.Channel`), which on `'phone'` skips the native module's avatar probe, passes no room delivery, and marks the session (`RealtimeSessionStartContext.PhoneCall`). Core gains the reason `'phone'` (`RealtimeAvatarUnavailableReason`, read by `ParseRealtimeAvatarStatus` and the bot attribute reader); a phone call's bridged session reports `{ Requested: true, Granted: false, Reason: 'phone' }` as its `AvatarStatus`, so a SIP call's bot joins with `mj.agentAvatar` `audio-only:phone`, and the notice reads "Audio only for {Agent}: the avatar isn't shown on phone calls" (`ng-realtime-media` and the mobile app's copy). The `bridged` reason now covers only a server-side session whose host can't publish video into a room. Integration check RD13 also checks that a phone call in a room that could publish the avatar asks for none and keeps the persona's voice.
- 382b9aa: Users can change their own avatar on deployments that do not let them update `MJ: Users`.

  My Profile and the login avatar sync used to save the caller's own `MJ: Users` row, which needs Update permission on `MJ: Users`. A locked-down deployment cannot grant that: a row filter restricts rows, not columns, so a user who may update their own row may also rewrite their own `Email`. There, every avatar save failed ("Failed to save avatar") and the login sync failed silently.
  - `@memberjunction/server`: new `UpdateMyAvatar(ImageURL, IconClass)` mutation returning `UpdateMyAvatarResult { Success, ErrorMessage }`. The caller comes only from the request; their own row is loaded as the system user and only `UserImageURL` and `UserImageIconClass` are written. Input is validated by the exported `ValidateAvatarInput`: a PNG/JPEG/GIF/WEBP base64 data URI of at most 200KB decoded, or an absolute http(s) URL of at most 2048 characters; a lower-case Font Awesome class list of at most 100 characters. `javascript:`, SVG and every other `data:` type are refused. Null clears a column. Scope-limited (magic-link) sessions are refused: an anonymous guest is the shared Anonymous user. Save failures return a generic message; the detail is logged.
  - `@memberjunction/ng-user-avatar`: `UserAvatarService.UpdateMyAvatar(imageURL, iconClass, provider?)` calls the mutation. `SyncFromImageUrl` uses it instead of `user.Save()`, refuses any user other than the signed-in one, and reloads the entity afterwards. The package now depends on `@memberjunction/graphql-dataprovider`.
  - `@memberjunction/ng-explorer-settings`: My Profile save and Revert to Default use the mutation, reload the user afterwards, and show the server's message on failure.
  - `@memberjunction/ng-explorer-core`: after an avatar change the shell also refreshes the user menu's context user entity, so `GetUserDisplayInfo()` stops returning the old avatar.
  - `@memberjunction/integration-test-suite`: IT106 (`self-avatar-client`, AV1–AV6, mutation tier) proves the mutation over the wire for a user without and a user with Update on `MJ: Users`, using two new seeded `it-avatar-*` users in `metadata-optional/integration-test`. `fls-client.checks.ts` now exports its user-API-key helpers for reuse.

  Behaviour change: an avatar image larger than 200KB, or one served as a non-image content type, is now refused by the server, including on the login sync.

- b653746: A capped or paged set operation (`UNION` / `INTERSECT` / `EXCEPT`) that has to be wrapped as a derived table now keeps its ORDER BY valid and its own row cap in force (#3778).

  The derived-table form is used when the set operation's own cap is not a plain row count, for example `TOP` on more than one branch. The set operation's ORDER BY moves outside the derived table, which used to have two problems on SQL Server:
  - **The ORDER BY could not bind.** It was moved as written, so `ORDER BY a.Name` named a branch's table alias outside the scope where that alias exists, and the query failed with `The multi-part identifier "a.Name" could not be bound`. Qualifiers are now dropped (`ORDER BY Name`) so the clause names the derived table's output columns.
  - **The set operation's own `OFFSET … FETCH` was dropped.** The inside was cut at the ORDER BY, so the cap after it was lost and the query returned rows its own cap excludes. That cap is now applied by a second derived table around the set operation, ordered the same way. It cannot stay in the original text: SQL Server refuses the branches' `TOP` and the set operation's `OFFSET` in one subquery.

  The original #3778 case, an unparseable query ordered by an aliased column, was already fixed when the row cap moved to editing the statement in place. Two SQL Server cases are added to the `runquery-rendering` integration bundle.

- 57fea6a: `UserInfoEngine` no longer caches `MJ: User Record Logs`. A row in that table is written every time a user opens a record, which makes it a poor fit for an engine cache. On the server the engine loaded every user's logs with no filter. So every record open became an in-memory update and a cross-server publish on every MJAPI, and the logs grew without bound in each process's memory. Nothing on the server read them. The entity also ships with `TrustServerCacheCompletely = false`, so it was the one engine config the periodic engine sweep queried on a stock installation.
  - **New:** `UserInfoEngine.LoadRecentRecordLogs(maxItems, contextUser?, provider?)` queries a user's logs, newest first, limited to `maxItems`. It does not need `Config()` to have run. It returns `[]` when there is no user, and when the query fails (the error is logged).
  - **Removed:** the `UserRecordLogs` getter and `GetRecentRecordsForEntity()`. Nothing in MJ called `GetRecentRecordsForEntity()`. Callers of `UserRecordLogs` move to `await LoadRecentRecordLogs(n)`.
  - **Callers updated:** `RecentAccessService.LoadRecentItems`, the omnibar's `#` empty state, `SearchService.GetRecentlyOpenedRecords` and the Data Explorer's recent records now query on demand. Each passes its own provider. "Recents" now costs one small indexed query when it is shown, instead of a cache read.
  - **22 log, run and audit entities no longer take part in caching** (`AllowCaching = false` in `metadata/entities/.audit-related-entities.json`). They were marked `TrustServerCacheCompletely = false`, which kept them out of the server RunView cache, but every save still went through the cache machinery. These tables are written constantly and read with filters that any write invalidates, so caching them costs work on every write and almost never hits. `AllowCaching = false` says "don't cache this" directly and skips that work. Their `TrustServerCacheCompletely` values are unchanged. `MJ: Record Changes` keeps `AllowCaching` as it was. `MJ: Action Execution Logs` is not changed here.
  - **Integration checks S25 and C12** used `MJ: Audit Logs` as their example of a cacheable but untrusted entity. They now enable `AllowCaching` on the test process's in-memory metadata for their own duration and restore it, so they still exercise the trust branch. Nothing is written to the database.

- Updated dependencies [96d6ec2]
- Updated dependencies [a709bb6]
- Updated dependencies [d17de94]
- Updated dependencies [7ada797]
- Updated dependencies [51c469d]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [822ed69]
- Updated dependencies [1da00cb]
- Updated dependencies [92ecdf9]
- Updated dependencies [1aa4e00]
- Updated dependencies [acf0f5b]
- Updated dependencies [989f7fe]
- Updated dependencies [b699a37]
- Updated dependencies [bd0ee83]
- Updated dependencies [fd2a410]
- Updated dependencies [0dbd455]
- Updated dependencies [5b2162c]
- Updated dependencies [dde482c]
- Updated dependencies [a4b23b7]
- Updated dependencies [49f26d9]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [1a091ac]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [bb3028a]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [1a95eaf]
- Updated dependencies [0a7c255]
- Updated dependencies [64b6fa5]
- Updated dependencies [fcf8e1c]
- Updated dependencies [d86bcbc]
- Updated dependencies [79b3816]
- Updated dependencies [ef182be]
- Updated dependencies [af6f892]
- Updated dependencies [59d47d5]
- Updated dependencies [aaf74ca]
- Updated dependencies [432fe69]
- Updated dependencies [4889fb2]
- Updated dependencies [b2441c3]
- Updated dependencies [69e19c5]
- Updated dependencies [7316ac3]
- Updated dependencies [91be34f]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [e533f99]
- Updated dependencies [0c68021]
- Updated dependencies [1b4c9f5]
- Updated dependencies [1c76559]
- Updated dependencies [97bbca4]
- Updated dependencies [c28e243]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [69bf67c]
- Updated dependencies [95e5dd9]
- Updated dependencies [97a85b9]
- Updated dependencies [75814f5]
- Updated dependencies [3f41313]
- Updated dependencies [6d5c6ad]
- Updated dependencies [7d5097d]
- Updated dependencies [8bac4d6]
- Updated dependencies [be3dae0]
- Updated dependencies [c0ebd97]
- Updated dependencies [7dc604e]
- Updated dependencies [08b3d7b]
- Updated dependencies [35d3c95]
- Updated dependencies [33bd959]
- Updated dependencies [dbc3462]
- Updated dependencies [21175fa]
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
- Updated dependencies [6ec7778]
- Updated dependencies [ed326fb]
- Updated dependencies [afe9eb4]
- Updated dependencies [90829e3]
- Updated dependencies [31057d8]
- Updated dependencies [57096ab]
- Updated dependencies [1ef460d]
- Updated dependencies [aac148b]
- Updated dependencies [a7fd6e9]
- Updated dependencies [f2f6f4b]
- Updated dependencies [a28ce42]
- Updated dependencies [9ce70b3]
- Updated dependencies [bc0e36f]
- Updated dependencies [e1942c7]
- Updated dependencies [d2cb42e]
- Updated dependencies [cbddadb]
- Updated dependencies [bdea87a]
- Updated dependencies [63479a1]
- Updated dependencies [5fcc7b0]
- Updated dependencies [d52f9ba]
- Updated dependencies [ed8a189]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [b653746]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [d2ccfef]
- Updated dependencies [6b487b8]
  - @memberjunction/ai-agents@6.2.0-edge.4
  - @memberjunction/ai-core-plus@6.2.0-edge.4
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/ai-engine-base@6.2.0-edge.4
  - @memberjunction/aiengine@6.2.0-edge.4
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/livekit-room-server@6.2.0-edge.4
  - @memberjunction/graphql-dataprovider@6.2.0-edge.4
  - @memberjunction/core-entities-server@6.2.0-edge.4
  - @memberjunction/ai-bridge-base@6.2.0-edge.4
  - @memberjunction/ai-bridge-server@6.2.0-edge.4
  - @memberjunction/storage@6.2.0-edge.4
  - @memberjunction/open-app-engine@6.2.0-edge.4
  - @memberjunction/generic-database-provider@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/ai-openrouter@6.2.0-edge.4
  - @memberjunction/ai-prompts@6.2.0-edge.4
  - @memberjunction/ai-cloudflare@6.2.0-edge.4
  - @memberjunction/ai-systemone@6.2.0-edge.4
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.4
  - @memberjunction/codegen-lib@6.2.0-edge.4
  - @memberjunction/rubrics@6.2.0-edge.4
  - @memberjunction/redis-provider@6.2.0-edge.4
  - @memberjunction/ai-vector-dupe@6.2.0-edge.4
  - @memberjunction/encryption@6.2.0-edge.4
  - @memberjunction/testing-integration@6.2.0-edge.4
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.4
  - @memberjunction/scheduling-engine@6.2.0-edge.4
  - @memberjunction/templates-base-types@6.2.0-edge.4
  - @memberjunction/telephony-adapters@6.2.0-edge.4
  - @memberjunction/testing-engine@6.2.0-edge.4
  - @memberjunction/conversations-runtime@6.2.0-edge.4
  - @memberjunction/metadata-sync@6.2.0-edge.4
  - @memberjunction/predictive-studio@6.2.0-edge.4
  - @memberjunction/record-set-processor@6.2.0-edge.4
  - @memberjunction/record-set-processor-base@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/notifications@6.2.0-edge.4
  - @memberjunction/search-engine@6.2.0-edge.4
  - @memberjunction/actions@6.2.0-edge.4
  - @memberjunction/templates@6.2.0-edge.4
  - @memberjunction/postgresql-dataprovider@6.2.0-edge.4
  - @memberjunction/ai-agent-harness@6.2.0-edge.4
  - @memberjunction/task-graph@6.2.0-edge.4
  - @memberjunction/content-autotagging@6.2.0-edge.4
  - @memberjunction/api-keys@6.2.0-edge.4
  - @memberjunction/actions-base@6.2.0-edge.4
  - @memberjunction/communication-types@6.2.0-edge.4
  - @memberjunction/communication-engine@6.2.0-edge.4
  - @memberjunction/communication-ms-graph@6.2.0-edge.4
  - @memberjunction/communication-sendgrid@6.2.0-edge.4
  - @memberjunction/credentials@6.2.0-edge.4
  - @memberjunction/queue@6.2.0-edge.4
  - @memberjunction/query-processor@6.2.0-edge.4
  - @memberjunction/work-queue-engine@6.2.0-edge.4
  - @memberjunction/ai-anthropic@6.2.0-edge.4
  - @memberjunction/unit-testing@6.2.0-edge.4
  - @memberjunction/work-queue-server@6.2.0-edge.4
  - @memberjunction/auth-providers@6.2.0-edge.4
  - @memberjunction/communication-expo-push@6.2.0-edge.4
  - @memberjunction/communication-gmail@6.2.0-edge.4
  - @memberjunction/communication-twilio@6.2.0-edge.4
  - @memberjunction/rubrics-base@6.2.0-edge.4
  - @memberjunction/predictive-studio-core@6.2.0-edge.4
  - @memberjunction/work-queue-core@6.2.0-edge.4

## 6.2.0-edge.3

### Minor Changes

- 0f04590: JSONType accessors are now live views, and JSONTypes can opt in to validation.

  **Bug fix (silent data loss).** The generated `<Field>Object` accessor parsed the JSON once and only re-serialized in its setter, so `rec.ConfigObject.Pct = 5` or `rec.ItemsObject.push(x)` edited a throwaway copy and `Save()` wrote nothing. Accessors now delegate to new `BaseEntity.GetJSONFieldObject` / `SetJSONFieldObject` (backed by `JSONFieldBinding`): in-place edits at any depth dirty the raw field and persist, no-op writes stay clean, references re-parse and detach when the raw text is replaced by `Load`/`Set`/`Revert`, and a pre-`Validate()`/`Save()` flush catches edits made through the caller's own reference after assignment.

  **`ToPlainJSON<T>`** (`@memberjunction/core`) returns a plain deep copy. `structuredClone`, `postMessage` and IndexedDB reject a live value, so `MJComputerUse` `LoadScript` and `BaseAgent.cloneSubAgentPayload` now use it (the latter falls back to a JSON clone instead of returning the original).

  **Opt-in validation (CodeGen).** `@mjValidate [warn]` on a JSONType's root interface emits a structural Zod schema and a generated `Validate()` check; JSON-Schema-style tags (`@minimum`, `@pattern`, `@format`, ...) and `@CHECK ts:(...)` / `@CHECK (SQL)` rules refine it. SQL rules are translated by the new `CodeGen: JSON Check Parser` prompt, compile-checked, and cached in `GeneratedCode` under the new `CodeGen: JSON Validators` category. Untagged JSONTypes generate exactly what they did, apart from the accessor delegation.

  Ships new metadata (prompt, template, GeneratedCode category) and two integration tests (IT99, IT100). See `guides/JSONTYPE_GUIDE.md`.

  **Hardening from local verification.** Opted-in schemas compile in non-strict packages (`z.lazy(...) as z.ZodType<T>`; MJCoreEntities builds without `strictNullChecks`, where the annotation form failed). `@CHECK ts:` expressions are type-checked at CodeGen time and skipped with an error instead of breaking the build. Enum references are prefixed. Shared helper schemas and a definition bound to both an opted-in and an untagged root are emitted once. An invalid `@pattern` is reported at CodeGen time. The test-case sandbox bounds microtasks. The translation cache key includes the value's shape (and the entity for `row.` rules). A newly translated rule is emitted in the same full run.

  **`SQLServerDataProvider.Refresh()` now really reloads.** It was a silent no-op while any save was in flight, so a caller refreshing right after a fire-and-forget save kept stale metadata. Refresh now waits (bounded) for in-flight saves, saves are counted instead of toggling one flag, and `DatabaseProviderBase.Save` resumes exactly once per suspend.

  **Entity viewer:** grid state handed to the grid and config panel is a detached copy, so reordering aggregates no longer dirties the view on Cancel.

- b545842: Rubric evaluators are pluggable. `RubricEngine` creates the evaluator a call names through the class factory (`BaseRubricEvaluator`), so a host can register its own and run it from `EvaluateRecord`, an agent-rubric link's `EvaluatorConfig`, a calibration test, the Evaluate Record Against Rubric action, or `mj rubric evaluate`. Adds a `Decision` evaluator that scores every level-scale criterion as a typed Score question on a Decision-type model (Default Decision: Jev, then LLM Decision) in one call. The LLM evaluator now honors `PromptID`/`PromptName`, `ModelID`, `Mode`, and `Samples`. Self-check, production sampling, and the rubric test oracle honor the link's whole evaluator selection. Evaluations record the evaluator's own type and name, and `AIPromptRunID`/`AIAgentRunID` now point at the run that produced the evaluation instead of the subject. The minor bump is for the updated Evaluate Record Against Rubric action metadata.

  The LLM evaluator's prompts are now metadata. It builds template data and composes three stored prompts into one call: **Rubric Evaluator** (the parent, which owns the JSON reply contract), a **judge** rendered into its `judgePrompt` slot through the prompt runner's child-prompt composition, and **Rubric Criterion**, which renders each criterion (the Decision evaluator asks the same text). The subject is a separate, nonce-delimited user message. `PromptID`/`PromptName` now name the judge; `SystemPromptID`/`Name`, `CriterionPromptID`/`Name`, and `ModelSelection` are new settings. The packaged template copy and `RenderRubricEvaluatorPrompt`, `BuildRubricEvaluatorMessages`, and `FillRubricEvaluatorTemplate` are removed; `BuildCriteriaPromptData`, `PromptData`, `RenderCriteriaText`, and `BuildSubjectMessage` replace them, and `RubricPromptService` gains `RenderCriteria` and `Preview`. Sixteen judge prompts ship, a default and one per core agent (Research Agent and its sub-agents, Sage, Query Builder, Query Strategist, ActionSmith, SkillSmith, Codesmith, Database Designer, Duplicate Resolution, Infographic), every core agent's rubric link names its own, and Sage gains an **Assistant reply** rubric and a Core agent rubrics test. The `llm-judge` oracle runs through the same prompts and accepts a `judgePrompt` config. Agent evaluation tests now propagate the agent link's evaluator configuration to implicit rubric oracles, conversational agent responses fall back to `Message` when `FinalPayload` is empty, and `TraceValidatorOracle` orders step records by `StepNumber` instead of `Sequence`.

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

- 49e0bd8: Add the MemberJunction Durable Work Queue and Messaging Framework:
  - **Core & Data Layer**: Transport-neutral queue contracts, database schema and entities for transports, topics, subscriptions, messages, deliveries, and deduplication ledger, backed by guarded-write stored procedures (`spWorkQueue*`) with SQL Server and PostgreSQL support.
  - **Transports**: Native Database transport driver, consumer, and operator; AWS transport (`@memberjunction/work-queue-aws` with SNS topic publishing, SQS FIFO consumer, visibility-timeout leases, dead-letter redrive, binding validation, and LocalStack conformance); and in-memory reference transport.
  - **Runtime & Host**: Competing-consumer `WorkQueueHost` (supporting continuous daemon and one-shot `RunOnce` container modes), `WorkQueueSweeper` (handling lease expiry and retention purging under a distributed sweep lock), REST publish endpoint (`POST /work-queue/topics/{topic}/messages` with API-key and scope authorization), and seven Remote Operations for operator control (`WorkQueue.GetSubscriptionStats`, `ReplayDeadLetter`, `DiscardDelivery`, `ValidateBindings`, etc.).
  - **Operator Surface**: Explorer `WorkQueueDashboard` with Overview, Dead Letters (envelope/payload inspection and replay/discard), Partitions (blocked, in-flight, and idle keys), and Bindings validation tabs, plus a new "Work Queue" application record.
  - **Tooling & Samples**: `mj queue` CLI commands (stats, dead-letters, partitions, replay, discard, backlog, work, export-topology, import-bindings, validate-bindings) and `@memberjunction/work-queue-samples` (`HelloWorldHandler` with sample topologies).

### Patch Changes

- 2413728: The bundle-count guard in `check-registry.test.ts` pins `realtime-deterministic` at 12 checks. #5042 added RD10–RD12 without raising the pin from 9, which failed Unit Tests on `next`.
- f029ec6: Renumber the RunQuery rendering integration bundles from IT99/IT100 to IT102/IT103. #5040 and #4830 both claimed IT99 and IT100, which failed the bundle-numbering and bundle-count guards on `next`. The PostgreSQL migration lane now runs the matrix bundle under its new name.
- 28c92e0: Saved queries, ad-hoc SQL and composed queries now render and run correctly on SQL Server and PostgreSQL in the shapes that previously failed or returned the wrong rows.
  - **Row caps and paging.** A query's own `TOP` / `LIMIT` / `OFFSET … FETCH` is kept: when the caller also passes `MaxRows`, the smaller wins and `TotalRowCount` follows. CTEs, `WITH RECURSIVE`, query hints, `SELECT DISTINCT`, set operations, `TOP PERCENT` / `WITH TIES` and SQL the parser cannot read are paged and capped by editing the statement in place, or as a derived table, instead of being rewritten from the syntax tree. Ad-hoc SQL with `MaxRows` is paged in the database instead of fetching every row. A requested cap that cannot be applied is logged; paging a `FOR JSON` / `FOR XML` query fails with an error that says so.
  - **Composition.** A dependency's trailing `;`, SQL Server `OPTION (…)` hints, template tags (`{% if %}` and similar) and doubled quotes in static values now compose correctly. The real composition token is resolved, not a copy in a comment or string literal. Composing into an outer `WITH` / `WITH RECURSIVE` produces one valid clause, and a dependency CTE that shares a name with one of the outer query's CTEs is renamed instead of declared twice. A query that references the same dependency twice saves one dependency row.
  - **PostgreSQL.** Pools get the `statement_timeout` and `idle_in_transaction_session_timeout` that match SQL Server's request timeout. Caller-supplied SQL runs in a rolled-back read-only transaction, and the read-only provider gets its own pool on the read-only login. Column references are read as names, and comment stripping no longer breaks dollar-quoted and `E''` strings.
  - **Caller-supplied SQL** must be a single read query. Ad-hoc SQL over GraphQL (`ExecuteAdhocQuery`) now runs through the read-only provider's own ad-hoc path, so it works on PostgreSQL too and pages the same way everywhere. `RunQueryParams.TimeoutSeconds` (ad-hoc SQL) and `ExecuteSQLOptions.timeoutMs` set a per-call limit that the database enforces: the request is cancelled on SQL Server, and `statement_timeout` applies on PostgreSQL. That limit can shorten the server's own limit but never lengthen it.
  - **What caller-supplied SQL may call.** Ad-hoc SQL, `TestQuerySQL` and query specs are refused when they call a function that runs SQL given as a string, or reads files or other databases (on PostgreSQL `query_to_xml` and its family, `ts_stat` and `ts_rewrite`, `dblink`, the server-file and large-object functions, and server-administration functions; on SQL Server `OPENROWSET`, `OPENQUERY`, `OPENDATASOURCE` and the trace and audit file readers). The list is the new `SQLDialect.CallerSQLForbiddenFunctions`. On PostgreSQL, advisory locks taken by such SQL are released before its connection returns to the pool, and MJAPI warns at startup when the read-only login can read base tables or server files.
  - **Dialects.** The rendering pipeline reads `SQLDialect` members (`SelectListPagingOrderBy`, `PagingRequiresOrderBy`, `QueryHintKeyword`, `SupportsEscapeStringLiterals`, `SupportsDollarQuotedStrings`, `StringLiteralPrefix`, `EscapeLikePattern`, `BooleanParameterValue`) instead of checking the platform name, so a new dialect declares its behaviour in one class.
  - **Text filters.** `sqlString` / `sqlIn` keep non-ASCII text on SQL Server, and the LIKE filters escape `[` (SQL Server) and `\` (PostgreSQL). SQL Server bracket-quoted identifiers escape `]`.
  - `RunQueryParams.MaxRows` documents that there is no default row limit, and that `MaxRows` limits the rows returned, not the work the database does.

- eeee8d4: Telephony Step 6 Integration Verification: add RD10, RD11, and RD12 deterministic integration checks, relocate RoomAuthorizationService to LiveKitRoomServer for reuse, fix virtual PhoneNumber sequence in MJ: Interactions and base view alignment, and update live call checklist.
- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies
- Updated dependencies [49e0bd8]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [54f4bc1]
- Updated dependencies [0618369]
- Updated dependencies [0a75bb2]
- Updated dependencies [fe39606]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [b545842]
- Updated dependencies [24ddecc]
- Updated dependencies [279b93e]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [be15f39]
- Updated dependencies [bea2386]
- Updated dependencies [d046715]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [e4654c8]
- Updated dependencies [e4654c8]
- Updated dependencies [997fe44]
- Updated dependencies [3204a32]
- Updated dependencies [a8e162d]
- Updated dependencies [1595b7d]
- Updated dependencies [d0a8dbf]
- Updated dependencies [4840fff]
- Updated dependencies [ec97ad4]
- Updated dependencies [8db8973]
- Updated dependencies [b1b6d3d]
- Updated dependencies [eeee8d4]
- Updated dependencies [506f170]
- Updated dependencies [28df136]
- Updated dependencies [49e0bd8]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/aiengine@6.2.0-edge.3
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/generic-database-provider@6.2.0-edge.3
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.3
  - @memberjunction/graphql-dataprovider@6.2.0-edge.3
  - @memberjunction/codegen-lib@6.2.0-edge.3
  - @memberjunction/ai-engine-base@6.2.0-edge.3
  - @memberjunction/ai-agents@6.2.0-edge.3
  - @memberjunction/livekit-room-server@6.2.0-edge.3
  - @memberjunction/ai-prompts@6.2.0-edge.3
  - @memberjunction/testing-engine@6.2.0-edge.3
  - @memberjunction/redis-provider@6.2.0-edge.3
  - @memberjunction/testing-integration@6.2.0-edge.3
  - @memberjunction/ai-anthropic@6.2.0-edge.3
  - @memberjunction/rubrics@6.2.0-edge.3
  - @memberjunction/ai-bridge-base@6.2.0-edge.3
  - @memberjunction/ai-bridge-server@6.2.0-edge.3
  - @memberjunction/ai-core-plus@6.2.0-edge.3
  - @memberjunction/actions-base@6.2.0-edge.3
  - @memberjunction/telephony-adapters@6.2.0-edge.3
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.3
  - @memberjunction/query-processor@6.2.0-edge.3
  - @memberjunction/metadata-sync@6.2.0-edge.3
  - @memberjunction/task-graph@6.2.0-edge.3
  - @memberjunction/open-app-engine@6.2.0-edge.3
  - @memberjunction/work-queue-core@6.2.0-edge.3
  - @memberjunction/work-queue-engine@6.2.0-edge.3
  - @memberjunction/work-queue-server@6.2.0-edge.3
  - @memberjunction/ai-agent-harness@6.2.0-edge.3
  - @memberjunction/predictive-studio@6.2.0-edge.3
  - @memberjunction/ai-vector-dupe@6.2.0-edge.3
  - @memberjunction/actions@6.2.0-edge.3
  - @memberjunction/communication-ms-graph@6.2.0-edge.3
  - @memberjunction/content-autotagging@6.2.0-edge.3
  - @memberjunction/queue@6.2.0-edge.3
  - @memberjunction/record-set-processor@6.2.0-edge.3
  - @memberjunction/search-engine@6.2.0-edge.3
  - @memberjunction/templates@6.2.0-edge.3
  - @memberjunction/unit-testing@6.2.0-edge.3
  - @memberjunction/api-keys@6.2.0-edge.3
  - @memberjunction/communication-types@6.2.0-edge.3
  - @memberjunction/communication-engine@6.2.0-edge.3
  - @memberjunction/notifications@6.2.0-edge.3
  - @memberjunction/communication-sendgrid@6.2.0-edge.3
  - @memberjunction/conversations-runtime@6.2.0-edge.3
  - @memberjunction/storage@6.2.0-edge.3
  - @memberjunction/scheduling-engine@6.2.0-edge.3
  - @memberjunction/templates-base-types@6.2.0-edge.3
  - @memberjunction/auth-providers@6.2.0-edge.3
  - @memberjunction/communication-expo-push@6.2.0-edge.3
  - @memberjunction/communication-gmail@6.2.0-edge.3
  - @memberjunction/communication-twilio@6.2.0-edge.3
  - @memberjunction/record-set-processor-base@6.2.0-edge.3
  - @memberjunction/rubrics-base@6.2.0-edge.3
  - @memberjunction/predictive-studio-core@6.2.0-edge.3

## 6.2.0-edge.2

### Minor Changes

- 28fdf22: Add a `Decision Eval` test type that measures typed decisions against labels inside MJ's test harness, with a suite generator and a scorecard for agreement, repeatability and calibration. The conversation-routing decision's builders (and `IsAgentAllowed`) move from `@memberjunction/ng-conversations` to `@memberjunction/ai-core-plus`, so the chat and the harness build the decision with the same code; import them from there.
- 0e5ad68: Agents: one master switch for decision-model use, the Loop prompt param `decisionsEnabled`, `false` by default. Unless it is `true`, an agent never asks a decision model on its own, whatever its other settings say. Inline `decisions` get no docs and no response field (even with `includeResponseTypeDefinition.decisions: true` set explicitly), and any request the model sends anyway is skipped. `finishIf` is treated as `finishIfMode: 'off'`. Decision discovery, the payload change check, catalog narrowing (which then describes the whole catalog) and the Memory Manager's note gate do not run. With `decisionsEnabled: true`, each of those works as before and keeps its own setting, each still off by default.

  Set it in an agent's `AgentTypePromptParams`, or for one run in `data.__agentTypePromptParams`. `decisionsEnabled` is declared in the Loop agent type's `PromptParamsSchema` with a default of `false`, and each of the settings it governs now says it needs it. Explicit uses do not read it: a Flow or task-graph Decision step, the Run Decision action, and the other direct callers of `AgentDecisionService` and `AIDecisionRunner`.

  Integration tests: a new deterministic bundle, `agent-decisions-switch` (IT97, nine checks), runs real agents with the switch off, on in an agent's params, and flipped for one run, on scripted chat replies and a stand-in decision driver, so no model is called. It covers the five loop uses, the Memory Manager's note gate, and a Flow agent's Decision step, which the switch leaves alone.

  Prompt params: the alignment of `includeResponseTypeDefinition` now works on a copy, so it no longer writes into a run's `data.__agentTypePromptParams`. Sub-agents inherit that object, so before this a parent with the switch off could turn a sub-agent's `decisions` and `finishIf` fields off.

  Test doubles: `RegisterTestLLM` and the decision stand-in now register above every existing registration for a name, so a registration made after an earlier restore still wins over the real driver that restore put back.

- 4d647e6: Add Rubrics, a core way to score any record against a published set of weighted criteria.

  What ships:
  - Schema for rubrics, versions, criteria, scales, anchors, bands, evaluations, and score rows, plus layered consensus views. Published versions are frozen. Raw writes to a frozen row throw 51101–51110. A draft version delete is an `INSTEAD OF DELETE` trigger. `MJ: Test Rubrics` is deprecated in metadata.
  - `RubricScoring` and `RubricVersionDiff` in `@memberjunction/rubrics-base`. The outcome ladder is Incomplete, NotApplicableFailure, GateFailed, Passed or BelowThreshold, then Scored. The publish base is the highest Published or Retired version.
  - `@memberjunction/rubrics`: LLM, agent, deterministic, and human evaluators. Actions are Evaluate Record Against Rubric, Get Rubric, Get Rubric Subject, Get Rubric Consensus, Create Rubric Draft, and Submit Human Rubric. Create Rubric Draft and the architect import do not publish. The evaluation agent does not call Get Rubric Consensus.
  - Presentational widgets in `@memberjunction/ng-rubrics`, Explorer forms, and a Rubrics application. The agent form has a Rubrics tab.
  - Six guide-example rubrics stay Draft. Seven agent rubrics publish at 1.0.0 and bind to their agents. Marketing Agent is not bound. Shipped self-check links and the sampling job stay Disabled. A test that already has an `llm-judge` oracle keeps it.
  - Testing: rubric resolution, a `rubric` oracle, judge calibration, per-criterion spread on `--flaky-check`, `mj rubric`, and `mj test promote-criteria`. `Test.RubricID` and `TestSuite.RubricID` select a rubric. `TestSuiteRun.Score` is stored.
  - The deterministic integration bundle is IT98 at sequence 49.

  `GeneratePluralName` keeps the head of a name verbatim and pluralizes only the tail, preserving that tail's case. A linear scan finds the tail, so `user_profile` and `userProfile` no longer produce the same view name, a leading character such as Ä stays on the head, and `Contact Person` pluralizes to `Contact People`. The base view for a criterion is `vwRubricCriteria`.

### Patch Changes

- ffb3c0f: The Decision Eval harness can now measure Sage's agent-discovery decision (`agent-discovery`), beside a `semantic-search` baseline of what `Find Candidate Agents` ranked first, with a labelled-corpus generator and discovery metrics in the scorecard. `@memberjunction/ai-agents` now exports the discovery helpers, including `BuildDecisionDiscoveryOptionSet`, which `BaseAgent` and the harness both use to build the options. The discovery eval times the whole discovery, options and semantic search included, as production's 1,500 ms timeout does, and counts an answer that arrives later as not injected.
- 72e9538: The content-vectorization integration checks stub `AIEmbeddingRunner.prototype.RunEmbedding`, which the autotag pipeline now calls, instead of `AIModelRunner`'s, and drop the stub for the removed `createEmbeddingInstance` seam.
- 726f1be: IT56 PG4 delegates to a seeded `IT: Payload Empty-Grant Child` (PayloadUpstreamPaths=[]) instead of overriding `IT: Payload Child` at run time. A run-time save reaches the server's cached agent only after its debounced engine refresh, so the run merged with the child's seeded grant and PG4 failed on cache timing rather than on the payload guard.
- 9ada46e: IT67 (Content Vectorization) refreshes the AIEngineBase cache after creating its fixture vector indexes. The Vector Indexes cache moved to AIEngineBase, which applies save events only as a debounced full refresh, so the checks looked the new index up before it landed and CV1–CV9 failed.
- 55c1c58: Add the `record-cloning` integration bundle (`IT96 - Record Cloning`, client transport): RC1 to RC9 from the record cloning plan (user, prompt and action clones, dry run, authorization refusal, rollback, provenance, stale plan hash, Record Change annotation) plus RC10 to RC12, read-only plans against the live database (unlisted relationships skipped, company integrations and encrypted values kept out of a scheduled job plan, and the user settings exclusions). `IntegrationCheckContext` gains a `RecordCloningFixture`.
- Updated dependencies [ca853fc]
- Updated dependencies [f555162]
- Updated dependencies [043f418]
- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [3fbda62]
- Updated dependencies [eaa9455]
- Updated dependencies [ff00d60]
- Updated dependencies [2552b1e]
- Updated dependencies [660ef45]
- Updated dependencies [8fd1c46]
- Updated dependencies [1580f34]
- Updated dependencies [21f9e15]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [72d8a40]
- Updated dependencies [664baea]
- Updated dependencies [672b4c6]
- Updated dependencies [f3c6161]
- Updated dependencies [0e5ad68]
- Updated dependencies [01fafc6]
- Updated dependencies [35ffb95]
- Updated dependencies [5148534]
- Updated dependencies [50ba290]
- Updated dependencies [ffb3c0f]
- Updated dependencies [cf97480]
- Updated dependencies [0adaf76]
- Updated dependencies [5ee02db]
- Updated dependencies [ce1a5c3]
- Updated dependencies [e9bdb16]
- Updated dependencies [513e608]
- Updated dependencies [ef43cf3]
- Updated dependencies [1d38a22]
- Updated dependencies [b03a928]
- Updated dependencies [ea4080e]
- Updated dependencies [b44c7cf]
- Updated dependencies [0d61b53]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [7e57b48]
- Updated dependencies [861cbf0]
- Updated dependencies [9096523]
- Updated dependencies [705ab4e]
- Updated dependencies [e51ce8a]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [f3fa01e]
- Updated dependencies [3276daa]
- Updated dependencies [125f40a]
- Updated dependencies [d0cea53]
- Updated dependencies [d4e30c3]
- Updated dependencies [e9ab27b]
- Updated dependencies [7e57b48]
- Updated dependencies [2ceedb4]
- Updated dependencies [55c1c58]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [14e2a3a]
- Updated dependencies [5986939]
- Updated dependencies [200e634]
- Updated dependencies [4d647e6]
- Updated dependencies [7bcba8c]
- Updated dependencies [c35f7e5]
- Updated dependencies [bb33c77]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
- Updated dependencies [74b3e69]
  - @memberjunction/ai-agents@6.2.0-edge.2
  - @memberjunction/ai-core-plus@6.2.0-edge.2
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/ai-prompts@6.2.0-edge.2
  - @memberjunction/ai-vector-dupe@6.2.0-edge.2
  - @memberjunction/content-autotagging@6.2.0-edge.2
  - @memberjunction/search-engine@6.2.0-edge.2
  - @memberjunction/aiengine@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/graphql-dataprovider@6.2.0-edge.2
  - @memberjunction/codegen-lib@6.2.0-edge.2
  - @memberjunction/testing-engine@6.2.0-edge.2
  - @memberjunction/record-set-processor-base@6.2.0-edge.2
  - @memberjunction/record-set-processor@6.2.0-edge.2
  - @memberjunction/unit-testing@6.2.0-edge.2
  - @memberjunction/redis-provider@6.2.0-edge.2
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.2
  - @memberjunction/conversations-runtime@6.2.0-edge.2
  - @memberjunction/task-graph@6.2.0-edge.2
  - @memberjunction/open-app-engine@6.2.0-edge.2
  - @memberjunction/generic-database-provider@6.2.0-edge.2
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.2
  - @memberjunction/testing-integration@6.2.0-edge.2
  - @memberjunction/metadata-sync@6.2.0-edge.2
  - @memberjunction/actions@6.2.0-edge.2
  - @memberjunction/ai-agent-harness@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/rubrics@6.2.0-edge.2
  - @memberjunction/rubrics-base@6.2.0-edge.2
  - @memberjunction/scheduling-engine@6.2.0-edge.2
  - @memberjunction/ai-engine-base@6.2.0-edge.2
  - @memberjunction/predictive-studio@6.2.0-edge.2
  - @memberjunction/templates@6.2.0-edge.2
  - @memberjunction/ai-bridge-base@6.2.0-edge.2
  - @memberjunction/ai-bridge-server@6.2.0-edge.2
  - @memberjunction/api-keys@6.2.0-edge.2
  - @memberjunction/actions-base@6.2.0-edge.2
  - @memberjunction/auth-providers@6.2.0-edge.2
  - @memberjunction/communication-types@6.2.0-edge.2
  - @memberjunction/communication-engine@6.2.0-edge.2
  - @memberjunction/notifications@6.2.0-edge.2
  - @memberjunction/communication-ms-graph@6.2.0-edge.2
  - @memberjunction/communication-expo-push@6.2.0-edge.2
  - @memberjunction/communication-gmail@6.2.0-edge.2
  - @memberjunction/communication-sendgrid@6.2.0-edge.2
  - @memberjunction/communication-twilio@6.2.0-edge.2
  - @memberjunction/queue@6.2.0-edge.2
  - @memberjunction/storage@6.2.0-edge.2
  - @memberjunction/query-processor@6.2.0-edge.2
  - @memberjunction/templates-base-types@6.2.0-edge.2
  - @memberjunction/ai-anthropic@6.2.0-edge.2
  - @memberjunction/predictive-studio-core@6.2.0-edge.2

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

- 520bd09: Durable entity actions (`EntityAction.RunMode = 'Durable'`) now receive their declared parameters by name (#4794).

  `BuildDurableDeferral` stored the redacted parameters in `Task.InputPayload` as a `LoggedParam[]` array, while `TaskGraphActionRunner` reads that payload back as a name → value object. Every released build with durable dispatch (v6.1.0 onward, including 6.1.4) hit the same failure: the dispatcher's `mergedPayload` only merges plain objects, so it silently dropped the array and the action received NONE of its params. Parameters named `0…n` would only appear if the array reached `TaskGraphActionRunner.buildParams` directly, bypassing that drop. Either way every durable binding ran without its inputs, e.g. `Common.LogActivity` failing with `TypeCode is required. | Title is required.`
  - `@memberjunction/actions-base`: new `RedactParamsToRecord()` beside `RedactParamsToJSON()`. It applies the same redaction rules and returns `{ Name: Value }`, omitting suppressed parameters, which then arrive at the action as absent rather than as a redaction stub.
  - `@memberjunction/actions`: `BuildDurableDeferral` submits that record.
  - `@memberjunction/task-graph`: a task whose `InputPayload` is not a name → value object now **fails** with a message naming the task, instead of running with its input silently dropped.
  - `@memberjunction/server`: round-trip regression test through `TaskGraphActionRunner`.
  - `@memberjunction/integration-test-suite`: EA6 now rejects an array `RedactedParams` and checks a bound param arrives by name.

  **Upgrade note:** durable tasks queued before this fix still carry array payloads. They now fail loudly (`Task <id> has an InputPayload that is an array; expected a name → value object…`) instead of running with no inputs. Re-trigger the source save if that work matters, or — from the Workflows run view — use the failed step's **Edit input & retry** control to replace the stored array with a name → value object and retry it in place.

  A durable binding never receives a whole record: `Entity Object` / `Entity Object Data` bindings are always stripped from the durable payload. Pass a key (e.g. `Entity Field 'ID'`) and load the record in the action.

- d40a8cb: Fix three live-tier false failures left by the naming refactor: IT56 PG2/PG7 read the payload-guard audit through a hand-copied PascalCase mirror of PayloadManager's camelCase `PayloadChangeResultSummary`, so every violation read back empty; IT54 SA4 forwarded a stale `conversationId` option that `RunAgentOverWire` no longer reads, so the run was never linked to its conversation. Checks now read the audit via `ReadPayloadAudit`, typed against the product's own summary type, and `runAndVerify` takes the shared `WireRunOptions`, so either drift now fails to compile.
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
- Updated dependencies [48f77ea]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [5da3ad2]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [9b8a84e]
- Updated dependencies [c261eb8]
- Updated dependencies [520bd09]
- Updated dependencies [520bd09]
- Updated dependencies [307da67]
- Updated dependencies [7110019]
- Updated dependencies [9d4a28a]
- Updated dependencies [a7da50b]
- Updated dependencies [1d43161]
- Updated dependencies [7110019]
- Updated dependencies [f2a4171]
- Updated dependencies [e482249]
- Updated dependencies [37e2f6b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
- Updated dependencies [9845c00]
- Updated dependencies [351ba9f]
- Updated dependencies [c4993f3]
  - @memberjunction/aiengine@6.2.0-edge.1
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/ai-agent-harness@6.2.0-edge.1
  - @memberjunction/ai-agents@6.2.0-edge.1
  - @memberjunction/ai-core-plus@6.2.0-edge.1
  - @memberjunction/ai-prompts@6.2.0-edge.1
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/conversations-runtime@6.2.0-edge.1
  - @memberjunction/graphql-dataprovider@6.2.0-edge.1
  - @memberjunction/actions-base@6.2.0-edge.1
  - @memberjunction/actions@6.2.0-edge.1
  - @memberjunction/task-graph@6.2.0-edge.1
  - @memberjunction/communication-engine@6.2.0-edge.1
  - @memberjunction/storage@6.2.0-edge.1
  - @memberjunction/auth-providers@6.2.0-edge.1
  - @memberjunction/ai-anthropic@6.2.0-edge.1
  - @memberjunction/codegen-lib@6.2.0-edge.1
  - @memberjunction/ai-bridge-base@6.2.0-edge.1
  - @memberjunction/ai-bridge-server@6.2.0-edge.1
  - @memberjunction/api-keys@6.2.0-edge.1
  - @memberjunction/communication-gmail@6.2.0-edge.1
  - @memberjunction/communication-ms-graph@6.2.0-edge.1
  - @memberjunction/communication-types@6.2.0-edge.1
  - @memberjunction/content-autotagging@6.2.0-edge.1
  - @memberjunction/generic-database-provider@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/metadata-sync@6.2.0-edge.1
  - @memberjunction/notifications@6.2.0-edge.1
  - @memberjunction/open-app-engine@6.2.0-edge.1
  - @memberjunction/predictive-studio@6.2.0-edge.1
  - @memberjunction/predictive-studio-core@6.2.0-edge.1
  - @memberjunction/query-processor@6.2.0-edge.1
  - @memberjunction/record-set-processor@6.2.0-edge.1
  - @memberjunction/record-set-processor-base@6.2.0-edge.1
  - @memberjunction/search-engine@6.2.0-edge.1
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.1
  - @memberjunction/templates@6.2.0-edge.1
  - @memberjunction/testing-engine@6.2.0-edge.1
  - @memberjunction/testing-integration@6.2.0-edge.1
  - @memberjunction/unit-testing@6.2.0-edge.1
  - @memberjunction/queue@6.2.0-edge.1
  - @memberjunction/ai-engine-base@6.2.0-edge.1
  - @memberjunction/communication-sendgrid@6.2.0-edge.1
  - @memberjunction/scheduling-engine@6.2.0-edge.1
  - @memberjunction/templates-base-types@6.2.0-edge.1
  - @memberjunction/communication-expo-push@6.2.0-edge.1
  - @memberjunction/communication-twilio@6.2.0-edge.1
  - @memberjunction/redis-provider@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- af57e8d: A transaction group whose rows are refused server-side no longer reports success.

  Fixes [#4309](https://github.com/MemberJunction/MJ/issues/4309).

  `BaseEntity.Save()` and `Delete()` report a logical refusal by **returning `false`** — they do not throw — and a refused row is never enrolled in the group, because `TransactionGroup.AddTransaction(...)` is reached only from inside `ProviderToUse.Save()`/`Delete()`. `ExecuteTransactionGroup` discarded that boolean, which produced two wrong outcomes:
  - **Every row refused** — the server's group arrived at `Submit()` empty, took its legitimate "nothing to do" branch and returned `true`, and the resolver reported `Success: true` while serialising each entity's never-persisted **in-memory** state into `ResultsJSON`. The client's per-item test (`resultObject !== null`) could not tell that apart from a real row, so `Submit()` returned `true` to the caller.
  - **Only some rows refused** — the survivors committed and the caller still saw unqualified success, with the refused rows silently gone.

  Nothing was ever written that should not have been: the guards did their job, and this was a false success report rather than a security bypass. But an administrator performing a bulk operation the server refused in full was told the opposite of what happened, and every server-side `Validate()` guard inherited the behaviour.

  **`@memberjunction/server`** — `ExecuteTransactionGroup` now captures what `Save()`/`Delete()` return and, when any row was refused, logs which ones and returns `PrepareReturnValue(false, …)` **before** `tg.Submit()`. Nothing has been written at that point (enrolment is deferral), so a partially-refused group fails whole rather than committing the survivors.

  The predicate is the **return value**, not whether the group ended up empty: a row that is not dirty also fails to enrol and correctly returns `true`, and an empty group legitimately means "nothing to do" for a caller that enrolled nothing (pinned by `transaction-groups.TG1`). That is also why the fix belongs in the resolver rather than `TransactionGroupBase.Submit()` — the resolver is the only layer that still knows _which_ row was refused and why.

  **`@memberjunction/graphql-dataprovider`** — `GraphQLTransactionGroup.HandleSubmit` now copies the server's own failure result for each item onto that item's entity, so `BaseEntity.LatestResult` carries the reason a UI needs instead of the generic "Transaction group failed". It only ever _upgrades_ the message: every item of a failed group reports `Success: false` (the provider registers an entity's result before enrolling the row and only flips it in the transaction callback), so a result with no message or errors is left alone.

  **`@memberjunction/server`** — a second fix on the same path: `ExecuteTransactionGroup` called the **async** `entity.GetDataObject()` without `await` when assembling a `Delete` item's result, so `PrepareReturnValue` serialised a `Promise` and **every** `Delete` in a transaction group returned `ResultsJSON: ["{}"]` — successful ones included. Neither `tsc` nor a floating-promise lint could see it, because the array is typed `any[]` and pushing a promise is not a floating promise. The empty payload also reached `GraphQLDataProvider`'s own `Delete` transaction callback, which validates a commit with `pk.Value !== results[pk.FieldName]`; against `{}` every key mismatched, so a delete that **did** commit reported `Transaction failed to commit` on its entity. Deletes now report the row they removed.

  **`@memberjunction/ng-explorer-settings`** — the reason now reaches the operator, which is what #4309's _"Verify by"_ asks for: _"step 5 must now show an error naming the refused user(s) and the rule."_ Both Explorer surfaces that submit `MJ: User Roles` transaction groups — bulk **Assign Role** and the single-user dialog — took the `!await tg.Submit()` branch and threw a hardcoded "all changes have been rolled back", never reading the `LatestResult` the provider had just populated. They now keep their enrolled rows and read the server's reason back off them, so the screen names the refused user and the rule it broke. A shared `serverRefusalReasons` helper holds the one piece of knowledge both need, including which messages are the provider's own placeholders rather than a reason worth showing.

  **`@memberjunction/integration-test-suite`** — `transaction-groups.TG6`'s third assertion could never fail. It searched the joined `ErrorMessages` for the substring `name` to prove the refusal reason had travelled, but each entry is a whole serialized `BaseEntityResult`, which always carries `OriginalValues: [{FieldName, …}]` — and `"FieldName"` lowercases to `"fieldname"`, which contains `"name"`. Strip every reason from the payload and the check still passed. It now extracts only the reason-bearing fields (`Message`, `Error`, `Errors[].Message`) and asserts both that a reason exists at all and that it names the offending column.

  No public interface changed. One existing test expectation did change, deliberately: `TransactionGroupResolver.refusals.test.ts`'s fake declared `GetDataObject()` **synchronous**, diverging from the real `Promise<any>` signature — which is exactly why the suite could not see the missing `await`. The fake now matches production.

- Updated dependencies [abf8778]
- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [37891d3]
- Updated dependencies [6ad6434]
- Updated dependencies [ee5c033]
- Updated dependencies [ce55864]
- Updated dependencies [662d47e]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [42d701e]
- Updated dependencies [6e6e3f1]
- Updated dependencies [8f23b23]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [e3db74f]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [d665a6e]
- Updated dependencies [6fd16d2]
- Updated dependencies [5df9486]
- Updated dependencies [c157749]
- Updated dependencies [f48dffc]
- Updated dependencies [2771f01]
- Updated dependencies [630bb88]
- Updated dependencies [7658d68]
- Updated dependencies [44faf83]
- Updated dependencies [58faa68]
- Updated dependencies [bfd67c6]
- Updated dependencies [575bfae]
- Updated dependencies [e6c8f53]
- Updated dependencies [a17a228]
- Updated dependencies [6e6e3f1]
- Updated dependencies [ee1f0d9]
- Updated dependencies [d61b425]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [7fe994a]
- Updated dependencies [8d1a373]
- Updated dependencies [8a5d2c0]
- Updated dependencies [3d633ed]
- Updated dependencies [e7a0efe]
- Updated dependencies [e962151]
- Updated dependencies [af57e8d]
- Updated dependencies [2c590b0]
- Updated dependencies [fc3da91]
  - @memberjunction/ai-agents@6.2.0-edge.0
  - @memberjunction/actions-base@6.2.0-edge.0
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/aiengine@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/ai-prompts@6.2.0-edge.0
  - @memberjunction/ai-core-plus@6.2.0-edge.0
  - @memberjunction/codegen-lib@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/generic-database-provider@6.2.0-edge.0
  - @memberjunction/sqlserver-dataprovider@6.2.0-edge.0
  - @memberjunction/testing-engine@6.2.0-edge.0
  - @memberjunction/metadata-sync@6.2.0-edge.0
  - @memberjunction/content-autotagging@6.2.0-edge.0
  - @memberjunction/record-set-processor@6.2.0-edge.0
  - @memberjunction/open-app-engine@6.2.0-edge.0
  - @memberjunction/server-bootstrap-lite@6.2.0-edge.0
  - @memberjunction/graphql-dataprovider@6.2.0-edge.0
  - @memberjunction/conversations-runtime@6.2.0-edge.0
  - @memberjunction/predictive-studio-core@6.2.0-edge.0
  - @memberjunction/predictive-studio@6.2.0-edge.0
  - @memberjunction/actions@6.2.0-edge.0
  - @memberjunction/ai-engine-base@6.2.0-edge.0
  - @memberjunction/unit-testing@6.2.0-edge.0
  - @memberjunction/search-engine@6.2.0-edge.0
  - @memberjunction/task-graph@6.2.0-edge.0
  - @memberjunction/ai-agent-harness@6.2.0-edge.0
  - @memberjunction/scheduling-engine@6.2.0-edge.0
  - @memberjunction/ai-bridge-server@6.2.0-edge.0
  - @memberjunction/communication-ms-graph@6.2.0-edge.0
  - @memberjunction/queue@6.2.0-edge.0
  - @memberjunction/templates@6.2.0-edge.0
  - @memberjunction/ai-bridge-base@6.2.0-edge.0
  - @memberjunction/api-keys@6.2.0-edge.0
  - @memberjunction/communication-types@6.2.0-edge.0
  - @memberjunction/communication-engine@6.2.0-edge.0
  - @memberjunction/notifications@6.2.0-edge.0
  - @memberjunction/communication-sendgrid@6.2.0-edge.0
  - @memberjunction/storage@6.2.0-edge.0
  - @memberjunction/query-processor@6.2.0-edge.0
  - @memberjunction/templates-base-types@6.2.0-edge.0
  - @memberjunction/testing-integration@6.2.0-edge.0
  - @memberjunction/auth-providers@6.2.0-edge.0
  - @memberjunction/communication-expo-push@6.2.0-edge.0
  - @memberjunction/communication-gmail@6.2.0-edge.0
  - @memberjunction/communication-twilio@6.2.0-edge.0
  - @memberjunction/record-set-processor-base@6.2.0-edge.0
  - @memberjunction/redis-provider@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Minor Changes

- 076fa5d: Add a provider-neutral native tool-calling surface to `BaseLLM`, implement it in the Anthropic, OpenAI and Gemini drivers, give the prompt stack its own configuration bag, and gate the whole thing behind metadata in the prompt runner . MJ's LLM providers have described agent actions as prose in the system prompt and parsed a JSON envelope back; newer agentically-trained models increasingly fight that, and the prose action catalog is most of a 56–104KB Loop system prompt. This lands the plumbing, end to end and switched off. **Nothing in the tool-calling path changes behavior on merge.** The catalog now records which models and vendor servings _can_ do native tool calling — that is the audit this branch produced — but every one of them carries `LLM.DefaultToNativeToolCalling: false`, no prompt sets `LLM.UseNativeToolCalling`, and no MJ caller passes tools, so the gate resolves false on every existing path and each run takes exactly the code it takes today. Capability is a statement of fact and is safe to ship; policy is the switch, and it is off. The first behavior change is a deliberate one: flipping the policy on a specific model, and a caller that supplies tools.

  **Model selection does change on merge, and is not gated.** Query Builder and the Research Agent family (7 agents, 8 prompts) move from `Gemini 3.5 Flash` to `Gemini 3.8 Flash` — 16 `ModelID` changes across 8 prompt seed files. The Flash-Lite rows that outranked them are set `Status: "Inactive"` rather than deleted, because `mj sync push` never deletes; removing the rows from JSON would have left those agents on Flash-Lite in every existing database. Once this metadata is pushed, those eight prompts are served by a different model than they are today.

  `ChatParams` gains `tools` (declarations as JSON Schema — the one format all three vendors accept), `toolChoice` (`'auto' | 'none' | 'required' | { name }`) and `parallelToolCalls`. Responses normalize to `ChatCompletionMessage.toolCalls` with **parsed** arguments plus a `'tool_calls'` finish reason; a turn can carry text _and_ calls, because all three providers structurally allow it, and nothing may assume text exists on a tool-call turn. Multi-turn tool use round-trips through a new `tool` message role and `tool_result` content block, which reuse the existing content-block serialization so tool turns persist correctly in message logs. `BaseLLM.SupportsTools` declares whether a driver has the mapping (default `false`); a driver without it ignores declarations rather than failing.

  **Schema — a JSON bag at the prompt layers.** `AIPrompt.PromptConfiguration` and `AIPromptModel.PromptConfiguration` (`nvarchar(max) NULL`) mirror the model catalog's `ModelConfiguration` cascade, resolving prompt-model over prompt over catalog. This resolves the plan's open question in favour of a bag over bit columns: `AIPrompt` already carries fifty-odd columns, and a bag lets the shape keep adapting without a migration per knob — a knob graduates to a real column when it needs a foreign key or becomes a first-class platform concept. It is named `PromptConfiguration` rather than `Configuration` because `AIPromptModel.ConfigurationID` already makes CodeGen emit a `Configuration` display column in the base view, which a same-named base column would collide with.

  **One source of truth for the modality sections.** `metadata/entities/JSONType-interfaces/IAIConfiguration.ts` now defines `LLMConfigurationSettings`, `RealtimeConfigurationSettings`, `VisionConfigurationSettings` and `AudioConfigurationSettings` once, plus one outer type per column (`IAIModelConfiguration`, `IAIPromptConfiguration`, `IAIPromptModelConfiguration`); all five `EntityField` rows point at that single file. It has to be one file because `JSONTypeDefinition` is stored verbatim and emitted inline per entity — a definition cannot import a sibling. The package-side mirror in `@memberjunction/ai` matches, keeping `AIModelConfiguration` and the existing resolver exports intact (the old section names remain as deprecated aliases). Two typed flags join the `LLM` section: `SupportsNativeToolCalling` (capability — a hard gate) and `DefaultToNativeToolCalling` (policy), joined at the prompt layers by `UseNativeToolCalling` (preference). All are tri-state — absent means _inherit_, distinct from an explicit `false` that overrides a lower layer.

  **Guard.** An assistant turn must carry `toolCalls` for the `tool_result` answering it to be valid; forgetting to copy them is the easy mistake, and Anthropic rejects it with an error naming only an opaque id. `validateToolConversation` now catches orphaned results at the MJ boundary with a message that says what to fix, run from `BaseLLM.ChatCompletion` for tool-capable drivers.

  **Shared conformance suite.** `RunLLMToolCallingConformanceSuite` in `@memberjunction/unit-testing` asserts the provider-independent half of the contract — capability declaration, parsed arguments, the `'tool_calls'` finish reason, text-and-calls coexistence, a text-free call counting as success, the streaming downgrade, and the orphan guard — and is adopted by all three tool-capable drivers. It is a separate entry point from the streaming/cancellation suite so a driver can conform on tools without first scripting a mock for every streaming path. Provider-specific request mapping stays in each driver's own tests.

  Per-provider notes. Anthropic coalesces consecutive tool turns into the single user turn its API requires, so parallel-call results are not orphaned by the role-alternation filler, and drops the empty text block a tool-only turn would otherwise send. OpenAI expands one tool turn into its per-result `tool` messages and surfaces a call whose arguments are malformed JSON rather than dropping it — the agent loop must be able to see a bad call, not silently nothing. Gemini's "no output received from model" guard now accepts a tool call as output; without that, every clean text-free tool call would have been reported as a failed generation. Drivers extending `OpenAILLM` inherit the mapping (OpenRouter, xAI, Zhipu, MiniMax, LlamaCpp); `ai-inception` overrides `SupportsTools` back to false, since Mercury Edit is a next-edit-prediction model on a custom endpoint that takes no `tools` parameter.

  Native tool calling is non-streaming: when a caller requests streaming with tools declared, `BaseLLM` takes the non-streaming path and records `streamingSuppressedForTools` on the result, mirroring the existing streaming-unsupported fallback.

  `ai-cerebras` and `ai-lmstudio` pass MJ roles straight to SDKs that accept only system/user/assistant; both now narrow through the new `toClassicChatMessageRole` helper, which maps `tool` to `user` — the role a tool result reads as to a provider with no tool support.

  **Gating (layer 3).** `AIPromptRunner` is the only layer that reads metadata to decide whether tools go out. The decision itself is a pure function, `ResolveNativeToolCalling`, so the design's truth table is asserted directly rather than through the runner. It resolves inside `executeModel` — per model call, not once per run — because failover can move a run to a (model, vendor) whose capability differs, and the failover loop already threads each candidate's own `AIPromptModel` row so a candidate with no such row contributes no override. Callers supply tools through new `AIPromptParams.tools` / `toolChoice` / `parallelToolCalls`; the runner never invents them. The gate is wrapped so that any failure to resolve configuration degrades to the envelope path — an opt-in enhancement must never fail a run that would otherwise succeed.

  **Instrumentation and fallback (layer 4).** New `AIPromptRun.ToolCallingMode` column (`'Native' | 'Envelope' | 'NativeFallback'`, CHECK-constrained) records which path each run took, so the envelope-vs-native comparison is queryable from run history. It is a column rather than a bag key precisely because its purpose is to be filtered and grouped across many runs. When a native call fails in a _tools-specific_ way — the provider rejecting the declarations, an unusable tool call, a tool-related discarded turn — the runner retries once with tools stripped and records `NativeFallback`. That classification is deliberately narrow and biased toward missing a tool failure rather than catching an unrelated one: a rate limit or context-length error must reach the existing retry/failover logic unchanged. The retry shares the original call's timeout budget rather than silently doubling the caller's timeout.

  **Provider probe.** `integration-test-suite/rigs/native-tool-matrix.ts` sweeps each tool-capable driver directly against live providers across {no tools | auto | none | required | named} × {responseFormat Any | JSON} × an optional thinking axis, recording call well-formedness, parallel count, text/call coexistence, envelope compliance, forcing adherence, finish reason and prompt tokens. It answers the plan's §5.6 and §9.3 open questions with data rather than inference, and it is deliberately not a test: it reports rates, asserts nothing, is dry-run by default, and `mj test` never dispatches it. The evaluators live apart from the runner in `src/native-tool-matrix/` as framework-free pure functions with 37 unit tests, so the measuring instrument is verified on every PR without spending a token. The first sweep against Google found: forcing semantics are 100% honored; **forced tool choice combined with JSON mode is a hard 400 on every current Gemini model**, not just 2.x as the audit had it, which constrains the per-step forcing policy; and Gemini 3.7 Flash under JSON mode answers a tool question natively while ignoring the requested envelope entirely — the malformed-response mechanism reproduced in three calls at the driver layer. It also confirms two PR 2 decisions were load-bearing: text NEVER accompanied a tool call on Google (so the "no text on a tool-call turn" rule is the only case there), and the extended Gemini empty-output guard would otherwise have failed every successful tool call in the sweep.

  **Prompt-exemplar audit (plan open question §9.4).** Every JSON exemplar in `metadata/prompts/` — the shapes agent prompts show models and the `OutputExample` values injected into them — was checked against `LoopAgentResponse`, the validator, and the dispatcher. 20 defects across 8 files, **13 of which made a forced retry the guaranteed outcome of following the prompt**: `message` nested inside `nextStep` on a Chat step (it is top-level; the runtime retries without it) across seven research-agent exemplars, `"type": "Action"` with `action: {name, input}` across six Codesmith exemplars — one labelled "✅ CORRECT Response" — a lowercase `"chat"` the validator accepts case-insensitively and the dispatcher then cannot switch on, and `nextStep: {type: "Success"}` beside `taskComplete: true`. Separately, `database-schema-designer.example.json` had four trailing commas and did not parse: since `AIPromptRunner` parses `OutputExample` as a validation schema and that prompt is `ValidationBehavior: 'Strict'`, **every run of `Database Schema Designer - Main Prompt` failed validation regardless of what the model produced**. Also fixed: raw newlines inside a JSON string, a `//` comment inside an exemplar, bare `...` array placeholders, and invented keys that were silently dropped (`subAgent.payload`, `suggestedResponses`, and Codesmith's `finalCode`/`result`/`iterations`, now written through `payloadChangeRequest` under the names its own `FinalPayloadValidation` requires).

  To stop the class from returning, `LOOP_NEXT_STEP_TYPES` is now exported from `loop-agent-response-type.ts` with two-way compile-time checks against the interface union (a plain `readonly T[]` annotation accepts a subset, so it catches an invented value but not a forgotten one — both directions are asserted), `LoopAgentType.isValidLoopResponse` derives its accept-list from it instead of restating it, and `ai-agents` gains `loop-exemplar-conformance.test.ts`, which brace-matches every shipped exemplar out of `metadata/prompts/` — blockquotes stripped, so quoted and nested-fence exemplars are covered — and fails per offending exemplar. Full findings: prompt-exemplar audit.

  **Two repairs found while building the above.** `integration-test-suite/rigs/lib/harness.ts` re-exported `createRunQueryFixtures` / `teardownRunQueryFixtures`, which had moved into this package's own `runquery-cache` checks. A named re-export of a binding the source module does not provide is an ESM _link-time_ error, so it did not fail where it was written — it took down **all six rigs** that import the shim, before a line of their own code ran, and `tsc` never saw it because `rigs/` sits outside the package's tsconfig `include`. No rig ever used either symbol; removing the two lines revives every rig (verified by linking all sixteen). `src/__tests__/rig-harness-shim.test.ts` guards it by checking each forwarded name against the package's real exports — note that merely importing the shim under vitest does **not** reproduce the failure, because Vite transforms rather than links, so the name check is the part that bites.

  The matrix rig also now proves a credential before spending a sweep on it. A revoked key previously produced one identical 401 per cell — 186 across the two Claude rows — burying the real findings and reporting models as 100%-failed that were never actually asked anything; it now costs one eight-token preflight call per model, plus a mid-sweep abort after three consecutive auth failures, and the run ends by naming every unmeasured model so a partial scorecard cannot pass for a complete one. The classifier (`src/native-tool-matrix/credentials.ts`) is deliberately conservative — a rate limit, quota, unknown model or 5xx is not an auth failure, since a false positive discards a model that would have produced data — and is unit-tested against all three providers' verbatim rejection messages and against near-misses like a token count containing "1401".

  **The Action→tool mapping, measured before the framework implements it — and corrected.** The matrix grew a second scenario family that builds tools from **real `ActionParam` rows** (snapshotted into a fixture so the probe stays database-free) using a faithful restatement of the Action→`ChatTool` table, then asked providers what they make of it. Two results. First, the `Scalar` → `{type: ["string","number","boolean"]}` union type — which appears to contradict §8.2's own "stay inside the cross-provider common subset" rule, since OpenAPI has no union type — measured clean: identical error counts to a conservative `{type:"string"}` arm across 192 calls, and 6/6 tool selection among three real MJ Actions. It stands as written. Second, and less comfortably, `ValueType: 'Other'` → `{type:"object"}` does **not** hold. `Run Ad-hoc Query.Query` is `Other` but carries a SQL string, and typing it as an object makes models emit `Query: {}` — a well-formed, dispatchable, useless call that no well-formedness oracle would catch. Usable arguments: **60% as specified, 100% mapped to `{type:"string"}`** on identical prompts. The mapping has been corrected (`Other`/`MediaOutput` → string; `Simple Object`/`BaseEntity Sub-Class` stay object), its "exact parity with the prose catalog" claim retracted, and the `ValueSchema`-on-`ActionParam` question reopened — the baseline turns out to recover that case only by _guessing_ a type, which is precisely what `ValueSchema` would make unnecessary. The mapping ships here as a tested rig-side module, not as the framework's generator; `observedArguments` was added to the observation record because a failed matcher says fidelity was lost while only the payload says how.

  **The baseline eval harness.** The harness that has to exist _before_ the feature can be measured now exists.

  `trace-validate-sub-agents` (**T1**) is implemented and registered. It was referenced by shipped metadata that never had an implementation: both stock research-agent tests weight it at 0.25 and 0.3, the engine logged `Oracle not found`, and that fraction of each test's score silently vanished while the tests reported green on the rest. It walks the run tree through the **Sub-Agent step's `TargetLogID`** rather than `AIAgentRun.ParentRunID` — the generated ORM is explicit that ParentRunID "records parentage but is not a link the tree traverses" — recursing so a required agent two levels down still counts, and gives partial credit across the `requiredAgents` / `forbiddenAgents` / `minIterations` checks a test configures.

  `PromptEvalDriver` + the `Prompt Eval` test type (**T2**) evaluate ONE model decision from frozen mid-loop state. No action executes: the runner returns the reply and deterministic oracles read it. It is separate from `AgentEvalDriver` because a loop confounds the measurement — a run that recovered on iteration three answers a different question than "does this model, in this state, choose action B". Three easily-missed execution details are handled explicitly: an explicit `contextUser` (#3251), `AIEngine.Config()` before the first run, and `WaitForPendingPromptRunSaves()` before any oracle reads a prompt run back.

  `agent-decision-match` and `response-well-formed` (**T3**) are the decision oracles. The first reads a decision off **whichever channel the model used** — envelope `nextStep.actions[]` or native `ChatToolCall[]` — and scores it against an encoding-independent expectation, which is what makes a baseline cell and a native cell comparable on an identical corpus case. Its details carry the components apart (decision kind / action accuracy / param fidelity / per-matcher outcomes) so §6.1's metrics aggregate out of stored `ResultDetails` without re-running a single model call. The second measures the malformed class on its own, because "malformed rate fell" and "decision accuracy rose" are different claims.

  The corpus (**T4**) ships as golden files under `metadata-optional/prompt-eval-corpus/` with a validating loader, eight starter cases spanning the plan's categories against real shipped agents, and a generator that expands corpus × matrix into `MJ: Tests` records with stable per-cell IDs (so regeneration updates rather than orphans, and `mj test history` survives) plus an estimated-token manifest per run. Verified end to end: 8 cases generate, push, and validate through the real `mj test` pipeline against the registered driver.

  Everything scoring-related lives in `Engine/src/eval/` as **framework-free pure functions** per test plan §2.1 — no import from the testing engine anywhere in that directory — so the same logic runs behind the `IOracle` wrappers today and would run unchanged under the documented bespoke-runner fallback. 45 unit tests pin the instrument, including the rule that a corpus expectation may never name `nextStep` or `toolCalls`.

  **Corpus and harness verification.** The corpus is 57 golden cases spanning every category the test plan's §4.3 table names, written against the real shipped agents and their actual action names: first-step selection, mid-loop params, error recovery, disambiguation across Sage's 26-action catalog, parallel fan-out, sub-agent dispatch through Marketing's five specialists, terminal synthesis, clarify, payload change, forced control flow at the iteration ceiling, and six adversarial cases that specifically detect the malformed shapes MJ's own exemplars taught before the audit.

  A pinned matrix (`matrix/envelope-baseline.json`) fixes the (model, vendor) pairs by catalog ID rather than by name, so a rerun months later addresses the same rows; expanding corpus × matrix yields **399 test records, all validating through `mj test`**.

  `prompt-eval-harness` (IT87) verifies the instrument in the deterministic tier, for zero tokens: every case names capabilities that actually exist (PE1 — which caught two unsatisfiable cases the moment it was written), the generated records have not drifted from the golden files AND cover the pinned matrix in full (PE2 — which caught real drift on its first real run, and whose matrix half exists because a suite generated against the wrong matrix passes every other check while measuring the wrong models under the right name), every expectation is decidable (PE3), a scripted correct reply scores correct through the **real `AIPromptRunner`** with `TestLLM` registered over the driver classes (PE4), five distinct malformed shapes are provably caught (PE5), and a wrong-but-well-formed reply separates decision accuracy from malformed rate (PE6). PE5 is the load-bearing negative: a harness that cannot fail on demand makes every rate it reports a fiction.

  One evaluator gap closed along the way: an undispatchable `nextStep.type` — `'Success'`, or a lower-cased `'chat'` — previously scored as well-formed even though the runtime rejects it into a forced Retry. `evaluateWellFormed` now checks the raw step type against `LOOP_NEXT_STEP_TYPES`, derived from the agent framework rather than restated.

  The deterministic tier is 65/71 with the new bundle in it, 558 oracle results, zero failures.

  **The cost manifest is measured, not guessed.** It originally priced a run at a flat 12,000 tokens of composed prompt per call. Measuring the real templates showed that to be **38% low** — the Loop agent-type system prompt _alone_ is ~12,700 tokens (50KB, consistent with the issue's 56–104KB claim) before any agent's own prompt or its action catalog. Per-agent sizes now range 12.7k (an agent with no actions) to 33k (Report Writer), and the generator reads them from a committed `matrix/prompt-size-baseline.json` regenerated by `rigs/measure-prompt-sizes.cjs`. A full baseline run at N=20 is **~158M prompt tokens, not ~96M** — and that still reads low, since it is chars/4 over raw metadata rather than the rendered catalog. A cost manifest wrong by 64% is worse than none, because it gets believed.

  **The matrix is pinned to the deployed configuration, at N=3, for ~$11.** Two problems with the first pinning, both caught by asking what it would cost. First, it pinned one model per generation per developer — right for the provider probe, wrong for a baseline whose stated job is _"the quantified current-state of the framework"_: only 2 of 15 corpus agents had even one of those models in their real configuration, so it would have measured models nobody deploys. The cells are now the (model, vendor) pairs the agents actually run on, ranked by adoption, led by **GPT-OSS-120B on Cerebras — which all 15 corpus agents list**.

  Second, N=20 was over-specified. The plan justifies it from an experiment that ran 40 repetitions of _one_ prompt, where repetition was the only source of variation; here the corpus is the variation, and 57 cases × N=3 gives 171 observations per cell — well past what a two-proportion test on the aggregate needs. Escalating to N=20 belongs on the (case, cell) pairs that come back non-unanimous, which is the only place more repetition resolves anything.

  GPT 5.5 / 5.5 Instant are excluded on cost: at \$5/\$30 per 1M they were \$121 of a \$196 run, two thirds of the bill for one sixth of the cells. Aggregator pairs (Vertex, Bedrock, OpenRouter, Azure) are deferred to a run where vendor divergence is the thing being measured.

  The manifest now prices in **dollars per cell**, reading `AIModelCost` at pin time so the estimate works offline — a token count nobody can convert is a cost control nobody uses. The full baseline: **285 cells, ~$11.36**, down from $196.

  **A finding that outlives the baseline:** `CerebrasLLM` and `GroqLLM` extend `BaseLLM` directly rather than `OpenAILLM`, so `SupportsTools` is `false` on both. GPT-OSS-120B — the single most-deployed model across the corpus agents — **cannot do native tool calling in MJ today at all**; the gate would resolve `Envelope` whatever metadata is set. Irrelevant to an envelope-only baseline, but it means the primary deployed configuration is not reachable without driver work on those two providers.

  **Native tool calling on Cerebras and Groq — the deployed workhorse.** `CerebrasLLM` and `GroqLLM` extend `BaseLLM` directly rather than `OpenAILLM`, so unlike OpenRouter/xAI/Zhipu/MiniMax/LlamaCpp they inherited nothing and reported `SupportsTools: false`. That mattered more than the provider count suggests: **GPT-OSS-120B on Cerebras is the single most-deployed model across MJ's shipped agents** (all 15 in the eval corpus list it; Groq is second at 11), so the one configuration the feature most needed to reach was the one it could not — the capability gate resolved to the envelope no matter what metadata said.

  Rather than write the mapping a third and fourth time, it now lives once in `@memberjunction/ai` as `openAICompatibleTools.ts`, and **OpenAI delegates to it too**. That format is the de-facto standard — Groq, Cerebras, Fireworks, xAI, Together, LM Studio, DeepSeek, Moonshot, Z.AI, MiniMax and OpenRouter all speak it — and the mapping has three details that are easy to get quietly wrong: arguments cross the wire as a JSON **string**; one MJ tool turn expands into **N** provider `tool` messages; and a call with malformed arguments must be **surfaced**, because an agent loop that sees nothing cannot tell "said nothing" from "said something broken". Four copies of that would drift. The wire types carry an open index signature deliberately — several provider SDKs declare their own with one, and a closed type is not assignable to an open one.

  Two provider-specific facts are encoded rather than assumed. **Groq does not support parallel tool calls on the gpt-oss family** — precisely what MJ deploys most — so `parallel_tool_calls` is forwarded only when a caller sets it explicitly, never inferred. **Cerebras can emit a call to a tool that was never declared**; the shared extractor surfaces it rather than dropping it, so the agent loop can reject it by name instead of receiving silence.

  One latent bug fixed on the way: Groq's converter appended a dummy `"OK"` user message whenever the last turn was not from a user. After tool results that would have separated them from the assistant call they answer — the same hazard as the Anthropic alternation filler — so the filler now skips a turn ending in tool results. Its multimodal branch also cast the role through with `as`, which would have sent a raw `tool` role the API rejects; it narrows through `toClassicChatMessageRole` now.

  Both drivers adopt `RunLLMToolCallingConformanceSuite`, and their `@memberjunction/ai` test mocks import the real mapping by path rather than re-mocking it — a mocked copy would be exactly the second implementation the shared module exists to prevent.

  **Reachable, not enabled.** This makes the deployed configuration _reachable_; whether anything uses it is the policy flag's business, and that ships off (see the capability audit below).

  **`reasoning_effort` gained the two levels it was missing.** `OpenAILLM.getReasoningLevel` accepted `low`/`medium`/`high` or a number and threw on anything else, so OpenAI's `xhigh` and `none` were unreachable through MJ — verified against the live API, whose own rejection message enumerates `none, low, medium, high, xhigh`. Both are now accepted **by name only**: MJ's numeric 1-100 scale is a cross-provider convention whose three bands are replicated in the Groq and Cerebras drivers, so re-banding it to make room would silently reclassify every documented `effortLevel: 85` and mean something different per provider. `AIPromptParams.effortLevel` widens to `number | string` to carry a named level (`.toString()` on the runner's path already handled both); `AIPromptRun.EffortLevel` is a numeric column with a 1-100 CHECK, so a named level is deliberately not persisted there. The GPT-OSS path writes `Reasoning: <level>` into the system prompt rather than sending an API field, and harmony defines only three levels, so it clamps `xhigh`→`high` and `none`→`low`.

  **The hybrid agent loop, opt-in and inert.** Actions are now declarable as native tools and a tool call _is_ an Actions step. `buildActionToolSet` (§8.2) maps `ActionParam` metadata onto JSON Schema using the two mappings measurement settled — `Scalar` keeps the union type, and every opaque `ValueType` becomes `string` rather than `object`, which took usable arguments from 60% to 100% on `Run Ad-hoc Query.Query`. Only `Input`/`Both` params are declared, and a post-sanitization tool-name collision is a hard error at build time, because two Actions sharing one tool name would dispatch whichever registered last — a routing bug that presents as a model error. `LoopAgentType` checks native tool calls **before** the envelope (§8.1): Measurement showed that a model given tools answers through them and stops emitting the envelope entirely on some providers, so the two cannot be asked for in one turn. A call naming an undeclared tool is a Retry naming it, never a silent drop — Cerebras does this at roughly one forced call in six. The loop template drops its action catalog and the `'Actions'` step type under `_NATIVE_TOOL_CALLING` (§8.4), which is where the 56–104KB prompt reduction comes from; the flag is set from the gate's **real** decision before rendering, not from the caller's intent, so a prompt can never suppress its catalog while the model receives no tools. `AIAgentRunStep` gains `ToolCallingMode` and `NativeToolCallCount` (§8.5) so a comparison groups by its independent variable instead of reconstructing it through a lossy join.

  **The capability audit, and the policy that ships off.** `metadata/ai-models/.ai-models.json` now carries `ModelConfiguration.LLM` on **139 model rows** — `SupportsNativeToolCalling: true`, plus `NativeControlFlow: 'implicit'` and `NativeToolResults: true` describing which protocol that model can hold — and **83 vendor-level rows** that override it to `false` for a serving path verified not to accept tools. Those three are statements of fact about a model, and the gate treats capability as a hard gate that no policy can override, so recording them turns nothing on. Every one of the 139 also carries `DefaultToNativeToolCalling: false`: written explicitly rather than omitted, because "we know this model can, and we are choosing not to yet" is the thing a reader needs to see, and flipping it later is then a one-word edit per row rather than a new key. No prompt carries a `UseNativeToolCalling` preference. That is the measurement's own recommendation applied as written: revert the preference, keep the capability flags.

  `BaseAgentType.SupportsNativeToolCalls` (false; `true` on `LoopAgentType`, inherited by Harness) gates whether `BaseAgent` declares an agent's Actions as tools at all — without it a catalog default would have offered tools to the four Flow agents with Actions, whose type cannot read a call back and would have turned every such reply into a Retry.

  A full-corpus comparison then ran both arms — four times at N=3, 1,026 observations each, no observations lost — and returned **NO-GO on all three providers on every run**. The decomposition (results §9) is the useful part. Native tool calling delivers exactly the gain it should: given that an action is the right answer, GPT 5.6-luna acts 76% of the time through the envelope and 96% with tools declared, and every native turn that picks the right tool fills it correctly. That gain is then spent, almost to the turn, on two losses. Tool _selection_ got worse — the same confusion pairs as the envelope, confused more — and richer declarations fixed it only in compact form (outputs and result codes as names, +6 to +11pp on two models) while full-detail prose reversed the gain and cost the smallest model ~700 tokens a call. And models call a tool on 5–20% of turns whose right answer is chat, completion or delegation; that number did not move across four runs and two interventions, is concentrated in five specific corpus cases, and is the blocker. **The prompt-size premise did not hold** on any run: tokens fell on one model and rose on the other two. The single largest source of "wrong tool" in every arm is the action catalog itself — `Search Query Catalog`'s description prescribes search-before-SQL and the corpus expects direct SQL — which is a product question, not a model one. The recommendation on the record is to revert the prompt-level `UseNativeToolCalling` before merge and keep the capability flags, which change nothing on their own.

  **Tool declarations now carry what the prose catalog carries.** `buildToolFromAction` folds output params and result codes into the description, restoring the rule the file already stated (never less informative than the prose). The description ceiling is 1,024 characters as a _measured operating point_ — no provider enforces a limit anywhere near it (all three accepted 8,000 on a live probe), but the compact form measured better than full detail and the code comment says so. `resolveToolChoiceForTurn` forces `'none'` on the last permitted iteration, where a tool call would be executed and discarded; that is correct and unit-tested, and could not affect the single-decision corpus.

  **Six defects the measurement surfaced, all fixed here.** A tool-call-only turn carries no text, and the runner scored that as `No output received from model` — a warning on every native turn, and under `ValidationBehavior: 'Strict'` a retry that could never succeed; tool calls now count as output. The Layer-4 fallback only inspected a _returned_ failed result, but OpenAI's SDK _raises_ its 400, so a tools rejection bypassed the strip-and-retry entirely and hard-failed the run; both shapes now take the same one-shot retry. OpenAI additionally rejects tools alongside `reasoning_effort` on `/v1/chat/completions`, so **native tool calling and reasoning are mutually exclusive on OpenAI until the driver speaks the Responses API** — the earlier probe missed this by testing a non-reasoning model. `CerebrasLLM` drops `response_format` when a request declares tools, which Cerebras rejects outright. On the harness side, `PromptEvalConfig` gained the `toolCallingMode` axis it was always documented to have (an `envelope` cell withholds the declarations the composer attached, which is the gate's `toolsProvided` term and the only difference between the arms); the decision normalizer maps sanitized tool names back to Action names through the framework's own binding table, without which a corpus expectation written as `Execute Code` scores a correct `execute_code` call as the wrong action; and pinned matrix cells now decline vendor failover, after a first attempt lost 42% of its observations to rows that had quietly failed over to a different vendor and were recorded under the pinned one's label.

  `FailoverConfiguration` is now exported from `@memberjunction/ai-prompts` — it is the return type of `getFailoverConfiguration`, a `protected` method documented as an override point, which a subclass outside the package could not name.

  **Implicit control flow (opt-in, and off).** Under `LLM.NativeControlFlow: 'implicit'` the loop stops splitting its turn between two channels: sub-agents are declared as `delegate_to_<name>` tools, `payload_change_request` and `ask_user` join them, a tool call continues the loop, and **plain text with no call ends the turn as task completion**. The Loop agent-type template renders that protocol instead of the `'Actions'`/`'Sub-Agent'`/`'Chat'` step types, which is the rest of the prompt reduction the hybrid could not reach — the hybrid still had to describe the envelope because completion lived there. `ToolCallingMode` gains `'NativeImplicit'` so the two native protocols are distinguishable in run history rather than both reading as `Native`.

  **Tool results as tool turns.** When the catalog says `LLM.NativeToolResults`, a step's action results go back as native `tool` turns answering the assistant's call turn, instead of the markdown "Action results:" user message. `AIAgentRunStep.NativeToolResultsSent` records which encoding a step used, so the scorecard can tell them apart without reconstructing them from `AIPromptRun.Messages`. The two encodings are one function apart: `EncodeToolTurnsAsText` in `@memberjunction/ai` converts native tool turns back to the markdown form, and both the envelope fallback retry and the eval harness's history builder now call it rather than carrying their own copy — the fallback previously stripped the _declarations_ while leaving native `tool` turns in the history, which is a shape no envelope-path provider accepts.

  **Declaration control, per agent and per action.** `AIAgent.DeclareActionsAsNativeTools` and `AIAgentAction.DeclareAsNativeTool` (both `BIT NOT NULL DEFAULT 1`) decide whether an agent's Actions are _supplied_ as tools, independent of whether the gate would use them. Measurement found this was the missing switch: the Research Agent's prompt says it never does work itself, yet declaring its one action made GPT 5.6-luna use it on 7 of 9 turns against 0 of 9 on the envelope. Declaration turns a dormant capability into an active one and no prompt text can undo it, because the prompt already says never. `metadata/agents/.research-agent.json` sets the agent-level flag to `false` for exactly that reason. `AIAgentRunStep.NativeDualChannel` counts the other half of the same finding: turns that carried a tool call _and_ a complete Loop envelope, where the loop takes the call and discards the envelope silently.

  **Provider repairs found by running it.** Gemini rejects a request whose `contents` do not begin with a user turn, and a Skip-style caller that puts everything in the system instruction sends none — every such run died on a 400 naming `function call turn comes immediately after a user turn`. `geminiMessageSpacing` now prepends a minimal user turn when the first turn is the model's. Anthropic gained a `thinking-config` module so a thinking request and tool declarations no longer contradict each other in the mapping.

  **One step-save defect.** `AIAgentRunStep.StepName` is 255 characters and the loop writes a failure message into it; a 327-character provider error therefore failed the step save, and the run reported "2 step record save(s) failed" while hiding the actual error. `BaseAgent.fitStepName` truncates to the column's declared `MaxLength` read off the entity, so the row saves and the message is still readable.

  **Two toolchain repairs, unrelated to the feature but on its path.** `mj dev workspace` generated a root manifest with a `pnpm` block that pnpm 10.33 ignores — settings have to live in `pnpm-workspace.yaml` — and could not express a consumer-scoped override, so a member repo's own copy of a package lost to another member's `workspace:*`. The generator now emits its settings into the workspace file, pins patched packages to their patch version, and resolves duplicate providers with `parent>child` selectors pointing at the owning member. It also relaxes `strict-peer-dependencies` from `true` to `false` in the process: a mixed workspace resolving published `@mj-biz-apps/*` against linked MJ source now reports its peer gaps and completes, where it previously failed the install on peers no member can fix. Separately, `mj app install` resolved hook modules from the repo root only, which fails whenever the app's packages live in an installed tree or a dev-workspace parent; `ResolveHookModule` now walks the installed app packages, the server/client workspaces and the repo root, and names every base it tried when it fails.

  **Schema ships as one migration.** The seven migrations this work accumulated are consolidated into `V202609122036__v6.1.x__Native_Tool_Calling.sql` — hand-written DDL for all four groups above, then the CodeGen fold, generated from a from-scratch database so the tail reflects `next`'s schema rather than overwriting the procs `next`'s own migrations regenerate. The PostgreSQL counterpart is deferred to the release build, per `migrations/CLAUDE.md`.

- 798e015: IT56/PG7: gate self-write compliance on BOTH scripted writes, not just the restricted one.

  `IT: Self-Write Restricted` is prompted to emit `notes.a` (allowed) and `config.b` (restricted) in a single `payloadChangeRequest`. PG7's `runWithCompliance` phase watched only for the restricted half, so a model that emitted `config.b` and dropped `notes.a` passed the compliance gate and then failed the next assertion with `the ALLOWED notes.a self-write did not land — expected "IT-NOTES-OK", got undefined` — a bare value assertion that reads as an engine defect.

  It is not one. Driving the agent directly, a fully compliant response yields `FinalPayload {"notes":{"a":"IT-NOTES-OK"}}` with `config` correctly absent: the allowed path applies and the restricted path is blocked, exactly as designed. The failure was partial model non-compliance that the predicate could not see.

  Requiring both markers makes that case report `model-noncompliance:` like the other eight checks in the bundle instead of accusing the engine.

- f5ec13b: Fix the queue engine's terminal-status write, and stop MJAPI's task-graph dispatcher from competing with a test harness.

  **`QueueBase` could never record a task outcome.** `StartTask` discarded the boolean `Save()` return, so the terminal-status write failed silently: the row kept whatever status it held before the run while the in-memory task still reported `Complete`. Underneath it, no role held `CanUpdate` on `MJ: Queue Tasks` or `MJ: Queues`, so CodeGen had never emitted an update grant and `spUpdateQueueTask` carried no `EXECUTE` grant at all. The Developer + Integration CRUD grants are now in `metadata/entity-permissions`, matching every other engine-written entity (`MJ: Tasks`, `MJ: Scheduled Jobs`, `MJ: Action Execution Logs`), with a migration that applies the SQL grants directly — a fresh install runs `migrate` + `sync push` and no CodeGen, so metadata alone would leave the permission correct in Explorer and broken at runtime.

  **`MJ_DISABLE_TASK_GRAPH_DISPATCHER` opts a server out of claiming.** A dispatcher claims from the whole `Task` table rather than from "its own" graphs, so a second dispatcher on the same database is a competitor — correct in production, and wrong for a harness that injects a stub runner and then asserts which tasks its own runner executed. Tasks MJAPI won were executed with the real agent runner and never reached the stub, which the harness read as "never ran". Immediately-eligible root tasks lose that race most often, so it presented as an intermittent failure.

  Also in the integration suite: the RLS fixture now carries the clauses discovery compared (a client-transport check cannot re-derive them and was reporting a cache leak that did not exist), the auth-validation fixtures supply every shipped provider's required config fields, the cache-gauntlet anti-vacuity floors are created rather than assumed, and the task-graph checks wait for the child read-back instead of silently undercounting.

- 394d276: **IT74 executes task graphs for real, and fixes the three production bugs that found.**

  IT71 has eighteen checks and not one of them runs a graph — nine assert metadata, nine verify the rows a save produces. Everything past "the rows are correct" was unit-tested against fixtures and never against SQL Server. IT74 stands up a real `TaskGraphDispatcher` with a stub `TaskAgentRunner` injected through its existing seam, so the claim protocol, condition evaluator and rollup all run with no model calls, no tokens and no network.

  **The dispatcher read its own work queue through a stale cache.** `TaskClaimStore` mutates task rows via direct SQL — correct, since the CAS guarantee _is_ the database's atomicity — but direct DML fires no invalidation, and the discovery queries used `RunView` without `BypassCache`. Completions written on the claim path stayed invisible, so `loadGraphState` kept seeing `In Progress` and graphs never rolled up.

  **A graph that succeeded could never settle.** `findActiveGraphIDs` selected graphs by non-terminal _children_, so the moment the last child completed the graph left that set — and the pass that would have rolled the parent up never saw it. Every fully-successful graph stayed `In Progress` forever and its continuation never fired. A _failing_ graph happened to survive, because blocking its dependents left them non-terminal for one more pass, which is why the bug hid behind a passing failure-path test.

  **A not-taken branch ran instead of being skipped.** A definitely-false edge condition was resolved by _dropping_ the edge — which removes the dependent's only prerequisite and makes it eligible in the very next wave, potentially before the node that gated it. The code's own argument against dropping unevaluable edges ("a prerequisite silently disappears and the dependent task runs early") applies verbatim to the false case. Such a dependent is now recorded unreachable and blocked, and only when _every_ route in was cut.

  Also hardened: `ComputeParentRollup` treats an empty child set as Complete-and-terminal, which is right for a childless graph and catastrophic for one whose reload came back empty transiently — it would mark live work finished and fire its continuation. The outer guard covered the first load only.

  `TaskGraphDispatcherConfig.PollIntervalSeconds` is new (default 5, unchanged behavior). The interval was hardcoded; five seconds is right for production, where steps are agent runs, but it made a four-node graph take twenty seconds to observe.

- 394d276: Phase 1 of the unified workflow DAG engine program (plan: PR #3456) — makes the task substrate tell the truth about what actually happened.

  **Payloads become columns.** `Task` gains `InputPayload`, `OutputPayload`, `ErrorMessage`, and `AgentRunID`. Inputs and outputs previously rode inside `Task.Description` behind `__TASK_METADATA__` / `__TASK_OUTPUT__` markers, which leaked orchestration plumbing into search results and the task detail panel. A one-time migration backfill converts existing marker rows into the new columns and strips the markers; there is deliberately **no fallback parse** in code, because a fallback with no backfill never dies. The backfill is conservative — a row whose marker text doesn't parse as JSON is left byte-for-byte intact for inspection rather than silently discarded.

  **Failures propagate instead of stalling.** A `Failed` dependency used to leave its dependents `Pending` forever: they never became eligible, so the graph appeared to finish while work silently never ran — and the parent was marked `Complete` at 100% regardless. Now failure propagates transitively to `Blocked`, and the parent rolls its children up honestly (`Failed` > `Blocked` > `Cancelled` > `Complete`, with progress counting only completed children). Completion notifications fire only for genuinely successful graphs.

  **Bad graphs are rejected before they are persisted.** Dependency cycles are detected at creation (a cyclic graph could previously be saved and then deadlock silently), and a graph naming an unknown agent is now an error rather than being logged-and-skipped — which used to execute the graph with holes where the caller's tasks should have been.

  **Waves run in parallel.** Eligible tasks execute with bounded concurrency (5) rather than one at a time, and each pass loads the graph once instead of issuing a dependency query per candidate task. Stalled graphs — pending work, nothing runnable, nothing in flight — are now detected and logged rather than exiting quietly.

  **The Gantt links the right run.** `Task.AgentRunID` records the specific run that executed each task. The UI previously joined tasks to runs through the shared `ConversationDetailID`, so every sibling task in a graph resolved to the _same_ agent run; the link was wrong for all but one. `Blocked` and `Failed` also now render distinctly instead of inheriting the pending treatment.

  **New pure graph algorithms** in `@memberjunction/ai-core-plus` (`computeEligibleTasks`, `computeTasksToBlock`, `computeParentRollup`, `detectCycle`, `isGraphStalled`, `findUnknownDependencyRefs`) — dependency-free, operating on plain shapes rather than entities, with 44 unit tests. Phase 2's durable dispatcher consumes these unchanged rather than reimplementing eligibility and propagation.

  **Also:** dispatcher claim columns (`ClaimedBy`, `ClaimExpiresAt`) and their supporting indexes land now so Phase 2 adds the dispatcher without further schema churn — nothing reads them yet. `AIAgentRunStep.StepType` gains `TaskGraph`. New deterministic integration bundle `task-graph-orchestration` (TG1–TG4) covering cycle rejection, unknown-agent rejection, payload columns, and the new schema's presence in generated metadata.

- 394d276: Phase 2 of the unified workflow DAG engine program (plan: PR #3456) — task-graph execution moves server-side and becomes invocation-agnostic.

  **New package `@memberjunction/task-graph`.** Deliberately not AI-prefixed (D11): an LLM, deterministic code, or a human UI can all construct and submit a DAG. It contains `TaskGraphSpec` (the one fully-qualified contract every producer authors against, D16), a pure validator, `TaskGraphService` (submission), `TaskClaimStore` (the CAS claim protocol), and `TaskGraphDispatcher` (durable execution). Graph _semantics_ stay in the Phase 1 pure algorithms in `ai-core-plus` — eligibility, failure propagation, parent rollup and stall detection are consumed unchanged, so the in-run and durable executors cannot drift apart.

  **Submission is split from execution (D2).** `TaskGraphService.Submit` validates, resolves agents, persists parent + children + edges, and returns. Nothing waits for the work. That is what makes every channel equal (D1).

  **BREAKING: `ExecuteTaskGraph` is removed (D12).** It awaited an entire multi-step workflow inside one long-lived GraphQL request, so a page reload lost the awaited promise, a server restart orphaned every in-flight task, and no channel but Explorer could reach the substrate. Replaced by `SubmitTaskGraph`, `CancelTaskGraph`, and `RetryTask`. Accepted deliberately in the open v6 window; its sole known caller — the Explorer conversation client — becomes an observer in this same change.

  **The durable dispatcher.** A compare-and-swap claim protocol over `ClaimedBy`/`ClaimExpiresAt` (the columns Phase 1 landed): claiming is a single guarded `UPDATE ... WHERE Status='Pending'` whose rowcount decides the winner, so two instances never run the same task without a distributed lock manager. Long tasks heartbeat to extend their claim; startup and periodic reconciliation return expired claims to `Pending`, which is what turns a crash from "work stranded forever" into "work resumes". Per D20 _every_ state transition is guarded on `ClaimedBy=@me`, not just the initial claim, because `MJ: Tasks` stays user-writable — a stale executor's completion write fails cleanly instead of double-completing. Human tasks are exempt from reclamation: a task parked on a person legitimately has no claim, and reclaiming it would reset an approval out from under the user.

  **Server-side detection at three seams.** Task graphs emitted in an agent's payload are now detected and submitted from the MJServer run path, `BaseMessagingAdapter` (ahead of the existing text-regex delegation, since a structured graph is unambiguous), and the Scheduling drivers. Previously only the Explorer client looked, so **Slack/Teams and scheduled routines silently dropped every graph an agent emitted** — the plan's core verified gap. The detection shim is explicitly temporary and dies in Phase 3 when `Tasks` becomes a typed `nextStep`.

  **Provider isolation.** The dispatcher mints a fresh provider per task via an injected `ProviderFactory`, so parallel tasks never share a transaction scope. MJServer supplies the implementation, keeping the dependency MJServer → task-graph and never the reverse.

  **Also:** 18 new unit tests for the validator; integration bundle grows with the three seam checks deferred from Phase 1 (cycle rejection, unknown-agent rejection, payload columns), now targeting `TaskGraphService`'s public API.

- 394d276: Phase 3 of the unified workflow DAG engine program (plan: PR #3456) — durable task graphs become a first-class agent primitive.

  **`'Tasks'` joins the Loop response union.** An opted-in agent emits `nextStep.type = 'Tasks'` with a `TaskGraphSpec` and the framework does the rest. The distinction from `subAgents[]` is durability, not parallelism: `subAgents[]` is ephemeral fan-out that blocks the run and dies with it, while a task graph becomes real Task rows a server-side dispatcher owns — visible in the Tasks UI, resumable after a restart, able to wait on a human.

  **The capability is gated, and the gate is enforced rather than advisory.** `enableTaskGraphs` defaults to **false**, unlike every other Loop prompt parameter. The others only shape the prompt — turning one off saves tokens and an agent that emits the feature anyway still works. This one governs whether an agent may create durable rows that outlive its run, execute on a dispatcher under the submitting user, and spawn further agent runs. So beyond omitting the type from the prompt, `LoopAgentType` _rejects_ a `'Tasks'` step from a disabled agent with a corrective that steers it back to Sub-Agent/Actions. The gate fails closed: an absent flag, an absent params bag, and the string `"true"` are all refusals.

  This matters more than it looks, because `HarnessAgentType extends LoopAgentType` and intentionally inherits `DetermineNextStep` — so the primitive reaches external agent harnesses (Claude Code / Codex / Pi running inside MJ) the moment it reaches Loop agents. That inheritance is the design working, but it moves the gate from a nice property of one class to the thing standing between a sandboxed external CLI and durable server-side work. It is therefore tested through the harness path, with the inheritance itself pinned so a later override cannot silently move those assertions onto a different code path.

  **`TaskGraphSpec` and its validator move to `@memberjunction/ai-core-plus`,** next to the pure graph algorithms they belong with. That is what lets the agent framework validate a graph without depending on the durable-execution package — which would otherwise drag the entity layer and the dispatcher into every context that merely runs an agent, including unit tests with no database. The Loop type validates against the identical contract the server re-validates at submission (D16), so a graph cannot pass one check and fail a different one later.

  **Single-node constant folding (D9), recorded rather than silent.** A one-node graph with no edges, an agent assignee and default continuation is rewritten into an ordinary in-run sub-agent call — don't spin up loop machinery for a loop of one. The `TaskGraph` run step is written either way, carrying the spec, a `folded` flag and the reason. Three consequences: run forensics show why a graph did or didn't reach the dispatcher; a user who edits a two-node graph down to one can read the durability change off the run record instead of inferring it; and Save as Workflow (D17) attaches to the recorded spec, so the single-node case — the shape most likely worth promoting — stays promotable. `durable: true` opts back into a Task row.

  **Submission crosses a registered seam.** `TaskGraphSubmitter` is declared in `ai-core-plus` and implemented in `@memberjunction/task-graph`, resolved through the ClassFactory. A host with no durable-execution package gets `null` and the agent reports an honest failure — what must never happen is a graph vanishing quietly while the model believes it scheduled work.

  **Continuation contract.** The parent Task row durably carries `continuation`, `reinvokeDepth` and the delivery marker, because the dispatcher instance that finishes a graph is routinely not the one that accepted it. Delivery marks _before_ it acts: the worst case becomes a missed notification visible in the task record rather than a notification repeated on every reconciliation sweep forever — which, for `reinvoke`, would be an unbounded agent-run loop. Chains are capped at 5 hops, bounded separately from task-nesting depth because they are different loops; at the cap the mode degrades to `message` so results still reach the user. `'reinvoke'` itself is not wired here — it would invert the dependency to task-graph → ai-agents — and lands in Phase 4 where the dispatcher already holds an execution engine.

  **Sage and the Workflow Planner stop payload-smuggling.** Both prompts move from `payloadChangeRequest.newElements.taskGraph` to the real `nextStep`, and the temporary server-side payload sniff introduced in Phase 2 is deleted along with its messaging and scheduling call sites — the primitive submits inside the run, so channel seams no longer need to look.

  **Launch opt-ins (D3):** Sage, Workflow Planner, Query Builder, and the Research Agent with its four sub-agents. Workflow Planner is not on the plan's opt-in list, but emitting task graphs is that agent's entire job, so leaving it gated would have broken it outright.

  **Coverage:** 43 new unit tests (18 Loop, 5 harness, 20 continuation-metadata) and a new integration check, TG8, asserting both directions the metadata gate can be wrong — an opt-in that was never pushed leaves an agent unable to delegate at all, and a Loop _type_ default left on would hand durable reach to every Loop agent in the install at once. IT71 runs 8/8.

- 394d276: Phase 4 of the unified workflow DAG engine program (plan: PR #3456) — convergence. Design-time flows and runtime task graphs stop being two graph models and become one.

  **One traversal engine, `GraphTraversalEngine`.** Flow agents and task graphs were always the same shape — nodes, conditional edges, joins — reached from opposite directions. `FlowAgentType` did not merely have its own copy of the traversal rules; it had **four**, written out separately for the post-prompt, post-action, initial-step and skip-recursion paths. They had already drifted: the skip recursion omits the inactive-destination fallback the other three have, so a skipped node routed differently from a normal one for reasons nobody chose. Both executors now consume one dependency-free engine — graph storage arrives through a synchronous repository seam, condition evaluation through an injected evaluator — so the in-run and durable executors keep completely different state backends while sharing one definition of the rules.

  **Four behaviors deliberately changed, each pinned by a named test** so a future "restore parity" pass has to argue with a test rather than quietly undo a fix:
  1. **Fan-out follows every satisfied edge.** The old code fetched the full edge list and then indexed `[0]`, silently discarding the rest — a genuine fan-out ran one branch and dropped the others with no diagnostic.
  2. **A missing destination is a rejection, not a fatal error.** Previously an _inactive_ destination fell through to the next alternate while a _dangling_ one failed the graph outright. A data problem should not be more fatal than a deliberately disabled step.
  3. **A condition that throws is distinguishable from one that evaluated false.** Both still refuse the edge — a malformed expression must never become an accidental `true` — but a graph stalled by a typo no longer looks identical to one that finished normally.
  4. **Results are addressed by node id.** The old lookup read the tail of the execution path, which was deduped on revisit, so a condition on a loop-back edge silently read a _different_ node's output.

  Also not ported: the `Priority <= 0` fallback branch, which was unreachable. Unconditional edges are collected in the main pass, so it could only run when every edge had a condition — in which case it matched nothing. Fallbacks work, and always did, via an unconditional low-priority edge.

  **Frontier, joins and concurrency.** `TraversalState` tracks a set of active nodes rather than a single program counter. AND-joins (matching `Prerequisite`) are the default and OR-joins map to `Optional` — which is _why_ the two models converge: "wait for every predecessor" is the same rule in both. A predecessor that failed, or that can no longer be reached, counts as settled rather than pending, so an AND-join behind an untaken branch cannot deadlock.

  **Flow gets a params bag.** `traversalMode` defaults to `'sequential'`, and that default is load-bearing: existing flows have fan-out shapes drawn in the editor that have never actually run in parallel, and flipping the default would start executing branches their authors have never seen run. Graphs built from a `TaskGraphSpec` always run parallel regardless.

  **Conditional edges for durable graphs** (migration: `TaskDependency.Condition`, NULL = unconditional, so no existing graph changes meaning). Same column shape and same grammar as `AIAgentStepPath.Condition` — deliberately, because if the two needed different storage then Save as Workflow would need a translation layer and the models had not really converged. The dispatcher resolves conditions by _dropping_ edges rather than adding a second rule to eligibility, which keeps one definition of "ready". One asymmetry is intentional: where the flow executor skips an edge whose condition cannot be evaluated, the dispatcher **keeps** it — there, dropping a prerequisite would run a dependent task early, turning a typo into out-of-order execution, whereas keeping it stalls the graph visibly.

  **Human tasks are announced.** A human task becoming eligible is the moment its assignee can finally act, and nothing else in the system knew that moment had arrived — the task sat `Pending` behind prerequisites and no save touched it when they cleared. Without a notification the workflow simply stopped, waiting on someone who was never told. The dispatcher now sends one through `NotificationEngine` (new metadata-seeded `Task Assignment` type) exactly once, marked durably so a restart cannot resend. Assignment stays self-only until the authorization model in #3524 lands.

  **`continuation: 'reinvoke'` is now delivered**, via a `TaskContinuationDeliverer` seam. Deferred out of Phase 3 because implementing it inside the dispatcher would have inverted the dependency to task-graph → ai-agents; the seam keeps the direction correct, and a host that cannot start agent turns degrades to a message rather than dropping the outcome of work that genuinely ran.

  **Save as Workflow (D17)** — `ConvertTaskGraphToAgentSpec` projects a runtime graph onto a Flow `AgentSpec`. That it is a projection and not a translation is the empirical test of whether the convergence was real. The one inversion: `dependsOn` points backwards, a flow path points forwards. Losses are **returned, never swallowed** — a conversion that quietly dropped a human approval step would hand someone a workflow that skips an approval they believed they had saved.

  **`TaskOrchestrator` retired.** Phase 2 orphaned it; it had zero callers and was not even exported.

  **Coverage:** 47 new unit tests (29 traversal engine, 18 converter) plus integration checks TG9 (conditional edges round-trip) and TG10 (the notification type is seeded). IT71 runs 10/10.

  Two latent test failures fixed along the way, both of which were hiding: `flow-agent-type.test.ts` (18 parity tests) stopped collecting once the adapters pulled `core-entities` into its module graph, and IT71 had a metadata record but was **never joined to the integration suite**, so it would not have run in the deterministic tier at all.

- 394d276: Phase 7 of the unified workflow DAG engine program (plan: PR #3456) — Track D, the trigger layer. Everything here closes a gap where something _claimed_ to work and did not.

  **Entity-change triggers only bind where an agent can safely run.** A `WorkflowSpec` trigger passed its `invocationType` straight through, and `Validate` / `BeforeCreate` / `BeforeUpdate` / `BeforeDelete` are real invocation names — so a workflow could bind an unbounded agent run _inside_ a user's save, in the held transaction, with the power to abort it. Validation now refuses anything but the `After*` forms, and the shorthand an author writes (`Update`) resolves to `AfterUpdate` rather than drifting from the name the platform actually fires. That drift was live: the contract documented `Create | Update | Delete`, none of which the platform matches, so the first trigger ever saved through it failed to resolve.

  **Trigger scope stopped being decorative.** `scopeEntityName` / `scopeRecordID` were declared, documented, accepted by validation — and then referenced nowhere in reconciliation. A workflow the author scoped to one record fired on _every_ record of the entity while the UI showed it as scoped. They now reconcile onto the binding's own `ScopeEntityID` / `ScopeRecordID`, which the engine's scope resolver already honored. `filter` is **refused** rather than accepted-and-ignored: narrowing by predicate needs the before/after values of a change, a contract that does not exist yet, and a workflow runs an agent — over-firing costs real money. Accepting it later is additive; the reverse would break specs already published against it.

  **An entity may bind the same action more than once (`UQ_EntityAction_ActionID_EntityID` dropped).** The v5.37.x junction sweep added that constraint under a stated scope of _"pure junction tables — two foreign-key columns plus ID/Sequence/timestamps, with no other meaningful data columns."_ `EntityAction` never met it: even then it carried `Status`, `Sequence` and `LoggingMode` and owned three child collections. Three months later #3408 added `ScopeEntityID`/`ScopeRecordID` so a binding could attach to "this Deal Type" — a feature the constraint makes unusable, since one binding per (entity, action) means one scope, so "every Deal" and "this Deal Type" cannot coexist. It also forced a single param set, filter set and scope to be shared across _every_ event an action responds to, making "on create run agent X, on update run agent Y" unexpressible. `V202608080100__v6.1.x__Drop_EntityAction_Uniqueness` removes it with no replacement; a narrower index would still refuse two unscoped bindings differing only by invocation type. Nothing in the runtime assumed uniqueness — every accessor already returns a collection and `HandleEntityActions` already iterates — so this is schema-only. Each workflow now owns its own binding, matched on the agent it dispatches to plus its scope; reusing a shared row would have rewritten `AgentID` and silently repointed one workflow's trigger at another's agent.

  **A self-trigger guard, because enrich-and-write-back is the normal shape.** "When a ticket changes, summarize it and store the summary" saves the ticket, which re-fires the action, forever. `EntityActionDispatchGuard` keys every automatic dispatch by `(entity action, entity, record)` and tracks origin through the async call tree with `AsyncLocalStorage`, so re-entry is detected however deep inside an agent run the write-back happens — no call site threads anything. Re-entry is **suppressed**, not deferred: queuing it would turn an infinite loop into an infinite sequence. A merely _overlapping_ save is a different problem with the same key, so it **coalesces** — latest wins, one pending rerun, and a burst of ten saves collapses to two runs instead of ten. Only after-hooks are guarded; `Validate` and `Before*` participate in the save and must neither be skipped nor deferred. Work that has detached from the async context (a durable task graph, a queued job) declares its origin explicitly through the new `EntitySaveOptions.OriginatingEntityActionIDs`.

  **Scheduled-job notifications actually send.** `NotificationManager` logged `"Would send notification to user …"` while `NotificationEngine` sat one package away. It now delivers for real, and composes the two people who have a say: the job's `NotifyViaEmail` / `NotifyViaInApp` toggles are a **ceiling**, the recipient's preferences decide within it. Neither existing knob expressed that — `forceDeliveryChannels` would let a job override a recipient's opt-out, and omitting the toggles would let a type default fire a channel the job never asked for. `SendNotificationParams.allowedDeliveryChannels` is the new primitive; it can only subtract, which is what makes it safe to expose.

  **"Execute Scheduled Job Now" runs the job.** It used to insert a `Status='Running'` run row and report success. Nothing consumed those rows — the poller selects jobs by _schedule_, never by pending run record — so the action left a row that said Running forever and ran nothing. It now executes through `SchedulingEngine`, and a failed job is a failed action rather than a successful insert. `Wait=false` starts it without blocking.

  **The dispatcher has somewhere to deliver.** `StartTaskGraphDispatcher` constructed it with no continuation deliverer at all, so a finished graph logged its outcome, marked itself delivered, and said nothing to the conversation that asked for it. `TaskGraphContinuationDeliverer` posts the roll-up with per-step detail. `Reinvoke` stays unimplemented on purpose: a safe one needs the new agent run to remember it was a continuation at depth N so `MAX_REINVOKE_DEPTH` can stop the chain, and nothing durable records that — a cap that never trips is worse than degrading to a message.

  **IT71 grows to 16 checks.** TG14 drives the save-to-binding round trip that Phase 6 owed; TG15 pins that a scoped trigger actually narrows; TG16 pins that two workflows on one entity keep separate bindings pointing at their own agents, and that re-saving finds its own row rather than adding a third. TG14 caught a second real bug on its first run — the invocation-type mismatch above — and TG16 is what surfaced the unique constraint.

- 394d276: Phase 8 of the unified workflow DAG engine program (plan: PR #3456) — the remaining Track D mechanisms, plus the observability decision that had been open across three reviews.

  **A live signal from the dispatcher.** The choice was between claim-store cache invalidation and semantic frames; frames won because a consumer should render "step 3 of 7 running" from the event itself rather than re-reading Task rows and diffing them to guess what changed. `TaskGraphObserver` emits `TaskStarted` / `TaskCompleted` / `TaskFailed` / `TaskBlocked` / `TaskAwaitingHuman` / `GraphSettled`, and MJServer publishes them on a new `taskGraphFrames(parentTaskId)` subscription.

  Addressed by **`ParentTaskID`, deliberately not by session**: a durable graph outlives the tab that submitted it and may be started by a schedule with no session at all, so keying on the graph means "watch this workflow run" works for whoever is permitted to see it, whenever they arrive — including after a refresh, which a session-keyed push cannot survive. Emit points sit where the fact is already true: `TaskStarted` after the claim is held, `Task{Completed,Failed}` only once the guarded write lands, `GraphSettled` outside the continuation's once-only CAS. The observer is optional and its errors are swallowed in one place, because a frame is commentary on work and must never stall or fail a graph.

  Delivery **fails closed**. A `parentTaskId` is discoverable, so without a connection-identity check anyone holding one could watch another user's workflow, per-step error messages included. Ownership rides on the frame — resolved once per graph and memoized, since a subscription filter runs per frame and synchronously, and a database round trip there would make watching a run cost more than running it. It lives in the parent's durable metadata rather than a column because `Task.UserID` already means "the person this task waits on"; setting it on a parent would make every graph look like a human task.

  **`MAX_REINVOKE_DEPTH` finally compares against a real number.** Phase 3 shipped the cap and Phase 4 shipped the metadata carrying `reinvokeDepth`, but the value was permanently zero: `Submit` reads it from its caller, `BaseAgent` never passed one, and a reinvoked agent had no way to know it _was_ a continuation. Phase 7 therefore left `Reinvoke` unimplemented on purpose — a cap that never fires is worse than one continuation mode being unavailable, because the failure mode is an unbounded chain of real agent runs. `AIAgentRun.ContinuationDepth` closes the loop: the deliverer stamps depth + 1 on the run it starts, `BaseAgent` passes its own run's depth into any graph it submits, and the chain is bounded. `Reinvoke` degrades to posting whenever it cannot restart a turn (no submitting run, run or agent unloadable) and never throws, since the dispatcher calls it inside the delivery CAS.

  **Scheduled jobs answer what to do about fire times they missed.** `MissedRunPolicy` — `RunOnce` (default), `RunAll`, `Skip`. The default is not a preference: `updateJobStatistics` already computed the next run from _now_, so a job whose `NextRunAt` had passed ran once and jumped forward. That is `RunOnce`, and defaulting to `Skip` would have silently stopped every existing job in every install from catching up. `RunAll` is safe to offer because its next run is computed from the occurrence just consumed, so a week-long outage walks one occurrence per poll tick rather than firing 168 jobs at once. "Missed" is defined cron-relatively — a _later_ occurrence has also come due — rather than by a grace window, which would misjudge a per-minute job after a short pause and a monthly job that is a week late in opposite directions.

  The decision **fails open** throughout: it can only ever withhold a run the schedule already said was due, so an unparseable cron or a helper returning anything but a date lets the job through. And it is **synchronous** on purpose — it runs immediately before lock acquisition, where an added microtask reorders against the sweep's fire-and-forget cleanup; only the skip branch writes, and that is awaited separately.

  **One-shot scheduling needed no new schedule shape.** `Status='Expired'` had been a declared value that nothing ever set. `isJobDue` already refused a job past its `EndAt`, so such a job stopped running on its own — but stayed `Active` forever, permanently inert, and kept driving `UpdatePollingInterval`, so "cron at T plus `EndAt` just after T" left the whole scheduler polling at that job's cadence for a job that would never run again. Retiring it is the fix; "run once at T" was already expressible. Deliberately narrow: only `Active`/`Pending` transition, because a `Paused` job was put there by a person, and only `EndAt` triggers it, since a cron always has a next occurrence and inferring exhaustion would be guessing.

  **IT71 grows to 18.** TG17 asserts the new schema through the ORM rather than trusting the migration — the pair that drifted in Phase 4 when a migration applied but CodeGen ran against a stale definition. TG18 saves a job with `RunAll`, reloads it to prove the value survives the CHECK constraint, and saves a policy-less job to prove the `RunOnce` default.

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

- 394d276: Phase 6 (Track E) — **`WorkflowSpec`: one object binding WHAT runs to WHEN it runs.**

  `TaskGraphSpec` answered _what_ a workflow does; the scheduling and entity-action substrates answered _when_ something fires. Nothing expressed both at once, so "a workflow" was not a thing anyone could hand over — it was a graph plus a separately-configured trigger that only a human knew were related.

  **`graph` is `TaskGraphSpec` verbatim, not a copy.** That is why this composes rather than translates: a graph authored on the canvas, emitted by an agent, or promoted from a past run is _already_ this shape. A parallel graph type would have re-created the drift Phase 4 spent itself removing.

  **No new storage, and that is the design.** There is no `Workflow` table. A workflow's WHAT is a Flow agent; its WHEN is a Scheduled Job. `WorkflowSpecSync` **reconciles** those, following the pattern `MJRecordProcessEntityServer.Save()` already proved — resolve the type, find the rows this definition owns, upsert or disable. Inventing a `Workflow` row would create a second definition of "a scheduled thing" and give the scheduler two masters that can disagree.

  Rows are owned by a marker inside their own `Configuration`, not by name, so **renaming a workflow cannot orphan its schedule** and leave a second one firing beside the new row. A trigger the spec no longer names is **disabled, not deleted** — the row carries run counts, last-run and next-run, which are the only record it ever fired.

  **Order is load-bearing.** The agent persists _before_ triggers reconcile, because a Scheduled Job needs its ID to point at. Reversed, you get a job referencing an agent that does not exist — a schedule that fires forever and does nothing, with no error anyone sees. Validation runs before either, so a rejected save leaves no orphan agent behind.

  **Two operations, because drafting and committing are different acts.** `Workflow.Validate` writes nothing, so an agent can iterate a draft before anything reaches the scheduler — the draft-then-confirm shape dry-run and Plan Mode established. `Workflow.Save` commits. Both run the identical validator, so a workflow that validates cannot be rejected on save for a different reason. Together they close the "agents cannot schedule anything" hole: today `Create Scheduled Job` cannot even set `Configuration`.

  **Agent persistence crosses a seam.** `AgentSpecSync` is the one place that writes an agent; importing it into the execution substrate would invert the dependency, so the host registers a writer instead. A host without one gets an honest failure rather than a half-saved workflow. The writer reuses Phase 4's `ConvertTaskGraphToAgentSpec` unchanged — "save a runtime graph as a workflow" and "persist a workflow's graph" turn out to be the same operation, which is the practical payoff of the convergence.

  **A discovery worth recording:** `AgentScheduledJobDriver` has existed since the scheduling engine shipped, and `ScheduledJobType.DriverClass` is UNIQUE — so the `Agent` job type was already seeded. The substrate for scheduling an agent was there all along; only the authoring surface was missing. TG12 now pins that seed, because without it a scheduled workflow throws at the moment a user is least able to interpret it.

  **Draft is the default status**, not Active. Every authoring surface — the canvas, a chat card, an agent's MCP call — produces something the author has not yet watched run against real data.

  **Entity-change triggers reconcile too.** My first pass deferred these to Track D on the belief that entity-action invocation was not wired. AN-BC challenged that and was right: `HandleEntityActions` has fired entity actions from the save pipeline all along — validate, before/after save, before/after delete — and `Execute Agent` exists as the dispatch target, written for exactly this. Nothing was missing but the **binding row**. `WorkflowSpecSync` now creates the three rows that express "when an Invoice is updated, run Execute Agent with this agent": the `EntityAction`, the `EntityActionInvocation`, and an `EntityActionParam` carrying the agent. Idempotent by lookup rather than delete-and-recreate, because re-saving a workflow must not detach and re-attach a live trigger — a change landing in that window would be missed.

  40 new unit tests (29 validator, 11 sync) plus integration checks TG11 and TG12. IT71 runs 12/12.

### Patch Changes

- f5ec13b: Move the shared LLM conformance suite out of the runtime `@memberjunction/ai` package, and gate silent skip-growth in the integration registry (review fixes for #3542).

  **Conformance suite relocated to `@memberjunction/unit-testing`.** The shared BaseLLM
  streaming/ChatResult conformance suite and its OpenAI-compatible seam mock previously lived in
  `@memberjunction/ai/src/test-support/` and were consumed through a deep `@memberjunction/ai/dist/test-support/*.js`
  import — reaching past the package's public API into its build output, which resolved only because
  `@memberjunction/ai` has no `exports` map, and which shipped test code plus an optional `vitest`
  peer dependency inside the runtime package. Both files (and the suite's own reference regression
  test) now live in `@memberjunction/unit-testing`, are exported from its index
  (`RunLLMConformanceSuite`, `CreateOpenAICompatibleSeamMock`, and their types), and the eight
  provider conformance suites import them from `@memberjunction/unit-testing`. `@memberjunction/ai`
  no longer ships `dist/test-support/*` and no longer declares the optional `vitest` peer. No runtime
  behavior changes; test-only wiring.

  **Skip-growth is now gated, not just reported.** `check-registry.test.ts` gained a snapshot of the
  exact set of checks that self-skip out of the deterministic lane (every `RequiresMutation` and
  `RequiresLiveModel` check across all bundles). A change that makes a check newly self-skip — or
  silently un-gates one — now fails the unit tests with a paste-ready diff, instead of only shrinking
  the CI step-summary. Also corrected a stale `task-graph-execution` count (26 → 27) in the
  all-bundle coverage-loss guard that had drifted after a `next` merge added TX27.

- 1a2ce13: Pricing for models that aren't billed by the token, and OpenAI as a second Whisper provider.

  **The problem.** MJ's pricing _schema_ was always general — a cost row names a price unit type, and the unit type names a `DriverClass` the ClassFactory resolves. The _execution layer_ was not: `BasePriceUnitType` took two token counts, only the three token drivers were ever registered, and `MJAIPromptRunEntityServer` refused to cost any run reporting zero tokens. So the three continuous-media unit types that already shipped — `Per Image`, `Per Minute`, `Per Hour` — resolved to nothing, and every run priced by one was silently uncosted. Six ACTIVE image cost rows were in that state. (Bug register B60.)

  Speech-to-text made it concrete: Groq bills Whisper by the audio-hour, the just-landed `GroqAudioGenerator` requested `response_format: 'json'` which discards the duration entirely, and the two Whisper models shipped with no cost rows because there was no honest way to write one.

  **Usage grows a second axis.** `ModelUsage` gains `unitKind` (`'Tokens' | 'Seconds' | 'Characters' | 'Images'`), `inputUnits` and `outputUnits`, plus a `ModelUsage.ForMedia(kind, input, output?)` constructor. Continuous quantities are deliberately _not_ folded into the token fields: a run reporting 90 "tokens" that means 90 minutes corrupts `TokensUsed`, every rollup above it, and every dashboard downstream. `SpeechResult` gains `usage?`, matching `ImageGenerationResult`.

  Quantities are always recorded in the **base** measure, never the billing measure — audio billed per hour is still recorded in seconds, and the driver converts. That is what lets one measured duration be priced against a per-minute row from one vendor and a per-hour row from another.

  **Pricing takes quantities.** `BasePriceUnitType` gains a `UnitKind` getter (defaulting to `'Tokens'`, so external subclasses need no change) and `CalculateCost(activeCost, usage)`, the preferred entry point — its default delegates to the existing cache-aware path, so every current driver behaves identically. `TimePerMinutePriceUnitType`, `TimePerHourPriceUnitType` and `PerImagePriceUnitType` register against the unit types that were already seeded, closing the driver half of B60.

  Each driver also exposes `UnitsPerBillingUnit` — 1,000,000 for a per-million-token rate, 3,600 for per-hour, 1 for per-image — so a divisor exists in exactly one place per driver. `TOKEN_PRICE_UNIT_TYPE_DIVISORS` is _derived_ from the driver instances rather than restated, which makes drift between the exported table and the arithmetic that prices every run impossible instead of merely detectable. The map deliberately covers only the token drivers: a missing key is the signal for a consumer doing token-rate math to SKIP a row priced by audio duration, not to fall back to a per-token divisor.

  `BasePriceUnitType` is marked `@RequiresSubclass()`. `ClassFactory.CreateInstance` has never returned `null` for an unregistered key — it falls back to `new BaseClass(...)` — so `if (!calculator)` was a dead branch that installed a hollow object whose only pricing method is `undefined`, surfacing as a `TypeError` inside cost math rather than "this driver is not registered". The new `UnitKind` default made that hollow instance _more_ convincing, since it answers `'Tokens'` and so passes the measure check before throwing. `GetPriceCalculator` now resolves via `TryCreateInstance` and reports the failure, so its documented `null` return is real.

  `AIEngineBase.CalculateModelCost(modelID, vendorID, usage)` is a new costing surface for callers holding a result but no prompt run — transcription and image actions, downstream apps. It returns `null`, having logged why, when there is no active cost row in the measure the run recorded, no registered driver, or a mismatch between what the run measured and what the row prices. A null means "we don't know what this cost" and must never be read as zero.

  **Cost-row selection is measure-aware.** `GetActiveModelCost` takes an optional `usageKind` and excludes rows priced in any other measure before the most-recently-started tiebreak. Without it the effective key is `(Model, Vendor, ProcessingType)`, which cannot represent a model billing in two measures — per-image output alongside per-token prompt — so which measure you got was a sort-order coin flip that was then refused downstream and reported as a pricing gap. The measure is now established _before_ a row is chosen. Omitting the argument keeps the previous behaviour, and no shipped model+vendor carries two measures today, so nothing changes for existing data.

  **The measure is a first-class row, not a string.** A new `MJ: AI Usage Types` entity (`Tokens`, `Seconds`, `Characters`, `Images`) is what a run and a price unit type point at, so "what does this price buy" is answerable by a join instead of by convention. An earlier revision carried it as `AIPromptRun.UnitsKind NVARCHAR(20)` behind a CHECK constraint, which made the set of measures a property of a constraint on one column: nothing else in the schema could reference a measure, and adding one meant editing a CHECK on a table with nothing to do with pricing.

  Note the usage type and the price unit type answer **different** questions and stay separate: `AIUsageType` is the BASE measure of a quantity, while `AIModelPriceUnitType` is the BILLING unit and its scale. Audio is recorded in `Seconds` and billed `Per Hour`. Collapsing them would force a new usage type per billing granularity.

  **The measure lives on `AIModelPriceUnitType`, and nowhere else.** It gains `UsageTypeID` — so a cost row has exactly one place to look for its measure, reached through its `UnitTypeID`, and the FK there means whatever it finds is a real catalog row rather than a string. `AIModelCost` deliberately carries **no** usage-type column: it would be a second copy of a derivable fact, and nothing would arbitrate a cost row claiming `Seconds` while its unit type says `Tokens` — which is precisely the comparison the safety checks depend on. Single-sourcing makes that contradiction unrepresentable rather than merely unlikely.

  **The divisor becomes data, which closes B60's class rather than its instance.** `AIModelPriceUnitType.UnitsPerBillingUnit` (`CHECK > 0`) holds the number that converts base measure to billed unit — 1,000,000 for per-1M-tokens, 3,600 for per-hour, 1 for per-image. That number previously existed _only_ inside a TypeScript class, and that is the root cause of B60: `Per Image` / `Per Minute` / `Per Hour` were seeded as data by one person while the driver classes were never written by another, and the seam was silent for months. A new `LinearPriceUnitType` (`DriverClass = 'Linear'`) reads both columns off its own row, so a linear billing unit — "Per 1,000 Characters" — now ships as one seeded row with no class, no registration and no build. `DriverClass` remains the escape hatch for genuinely non-linear pricing (tiered rates, per-image-by-resolution, minimum-billing increments like the Groq 10-second floor). An _unregistered_ driver still refuses to price, deliberately: `DriverClass` is NOT NULL, so an unrecognised name is ambiguous between "a new linear unit" and "a non-linear driver whose code is missing", and pricing the second linearly would produce a confident wrong number.

  **`AIModelPriceType` is demoted alongside.** It was a NOT NULL FK that nothing prices, filters or branches on, while `AIModelPriceUnitType` carried the real contract — three vocabularies for one concept, with the _mandatory_ one the one nothing read. Adding a usage type without demoting it would have locked that ambiguity in permanently. Not dropped (NOT NULL, 235 metadata rows, and dropping is on the Forbidden list in `PUBLISH_NO_BREAK_POLICY.md`): the field is flagged `Status = 'Deprecated'`, removed from the generated form (`IncludeInGeneratedForm = 0`, which is the step that actually ends the ambiguity rather than documenting it), and has `AutoUpdateDescription` cleared so CodeGen cannot overwrite the demotion text — all declared in `metadata/entities`, where field-level editorial decisions belong, rather than as EntityField UPDATEs in a migration. The migration keeps only the schema half: a database default of `Tokens`, so new cost rows need not name a value from the vocabulary they are being told to ignore.

  **Prompt runs can record it.** `AIPromptRun` gains `InputUnitsUsed`, `OutputUnitsUsed` (both `CHECK >= 0`) and `UsageTypeID`, where NULL means token-billed — which is what every row written before the column existed IS, since the schema had no way to say anything else. That reading happens at exactly one seam (`MJAIPromptRunEntityServer.RecordedUsage`) rather than in four places, so the rest of the runtime still sees a definite measure. The save-time cost gate passes on units as well as tokens, and refuses — loudly — to price a run whose measure disagrees with its cost row's, rather than dividing seconds by a million and reporting the ~$0 that produces. No units rollup was added: units of different kinds cannot be summed, so cost remains the universal aggregate.

  **The catalog rows are declarative metadata, and that is what makes the new columns nullable.** The four measures live in `metadata/ai-usage-types`, and the measure + divisor for all six shipped billing units in `metadata/ai-model-price-unit-types` — seeded and backfilled by `mj sync push`, not by INSERT and UPDATE statements in the migration, so they are reviewable data in the same form as the rest of the catalog. Metadata is pushed by the release-time consolidated `*__Metadata_Sync.sql`, which by construction carries a later timestamp than any migration a PR can author, so a NOT NULL column defaulted to the Tokens row would fail the from-scratch build on the ADD itself: SQL Server materialises the default into every existing row and the foreign key has nothing to resolve. Nullable + FK is the strongest guarantee available before the seed exists — any non-null value is a real measure — and the runtime is written to that contract rather than around it: a price unit type with no measure refuses to price rather than guessing Tokens. Tightening both `UsageTypeID` columns to NOT NULL is a one-statement follow-up in the release _after_ the one that ships the seed.

  A clean-room bootstrap also found that `sp_updateextendedproperty` throws when the property does not already exist, so the demotion uses drop-then-add — the same fresh-install-only class as the `EntityField.Sequence` trap in `migrations/CLAUDE.md`.

  **`ModelUsageUnitKind` must stay a superset of the `AIUsageType` catalog, and the catalog rows are the source.** `MJAIPromptRunEntityServer` resolves a run's `UsageTypeID` to the catalog row's `Name` and hands that string straight to `ModelUsageUnitKind`. Nothing about that is checked by the compiler — the name arrives as a plain `string` from a database row — so seeding a usage type whose name the union does not carry produces no build error, just a runtime hole on exactly the rows using the new measure. `MODEL_USAGE_UNIT_KINDS` exists so a test can assert the two agree by reading the seed file rather than restating it. `Characters` is present for that reason and has no pricing driver yet, which is not a defect: the costing path refuses to price a measure no driver claims and logs why, which is strictly better than a plausible wrong number. A compile-time assignability pin backs this up (Vitest does not typecheck by default, which is how a narrowing slipped through once).

  **Providers.** Groq now requests `verbose_json` and reports the duration it was already being billed for, summed across split pieces. If any piece fails to report one, usage is left undefined rather than under-reported — a partial sum understates the bill while looking complete. `OpenAIAudioGenerator.SpeechToText` is implemented (it previously threw), with the same 25MB ceiling, the same injected `AudioSplitter`, and the same duration capture. The split-and-join loop moved onto `BaseAudioGenerator.TranscribeWithSplitting` so both providers share one implementation.

  **Cost rows now ship** for Groq Whisper Large v3 ($0.111/audio-hour) and Turbo ($0.04/audio-hour), verified against Groq's published pricing. `Whisper 1` is a **new** model rather than a vendor row on Whisper Large v3: OpenAI's endpoint serves the large-v2 checkpoint, and attaching it to the v3 record would misreport which weights transcribed a given run. It carries a $0.006/minute cost row.

  **Also:** the AC1 integration check flips from warning to hard assert now that every shipped unit type resolves — a future unit type added without a driver reddens the deterministic tier instead of scrolling past. The assert is scoped to unit types an **Active cost row actually references**, since those are the ones whose missing driver silently uncosts real runs; a custom unit type awaiting its driver, referenced by nothing, is reported rather than failed.

  A new **AC7** check is the monitoring counterpart to the whole refusal doctrine. Everything here turns a wrong number into a `NULL`, which is right — but a null plus a `LogError` in a server log is invisible, and that is precisely how B60 survived months with six dormant ACTIVE image cost rows. AC7 asks the question nothing asked: completed runs that did measurable work and carry no cost. It grades the two populations differently — no active cost row in the run's measure is a pricing-coverage gap and is reported; an active cost row in that measure _existing_ while the run is still uncosted means the pipeline had everything it needed and produced nothing, which is asserted.

  The two Explorer cost dashboards no longer carry their own copy of the divisor table. They now resolve a cost row's scale through its unit type's `DriverClass` against the exported `TOKEN_PRICE_UNIT_TYPE_DIVISORS`, and skip rows priced by a non-token unit type rather than defaulting them to the per-1M divisor — which had been dividing an hourly audio rate by a million. Both local tables were keyed by unit-type _display name_ using names (`Per Million Tokens`) that never matched the seeded ones (`Per 1M Tokens`), so every lookup missed and only the per-1M fallback made the numbers come out right; keying off the driver class removes both the miss and the fallback that hid it.

  Pricing also refuses, rather than reporting $0, when a run records continuous units without a resolvable usage type to name their measure — the same "we don't know what this cost" rule the rest of the path follows.

  Both transcription providers request `verbose_json` only for models that accept it. OpenAI's GPT-4o transcription models reject it outright, so they fall back to `json` and report no duration instead of failing the transcription; Groq's STT surface is Whisper-only today, so the guard there is prospective — matched on `includes('whisper')`, because `distil-whisper-large-v3-en` does support `verbose_json` and a `startsWith` test would strip its duration and leave every run through it uncosted. A reported duration of exactly `0` now leaves usage undefined rather than producing a measure with no quantity, which the pricing layer would refuse and log as a fault for genuinely silent audio.

  The PostgreSQL counterpart to the migration is deferred to the release build, per `migrations/CLAUDE.md`.

- c581b4f: Close the #3874 adversarial review. SkipRelatedCollections persists embeds while collections stay with the caller. The graph-node recursion guard is private on BaseEntity (IsGraphNodeSave is gone from EntitySaveOptions). Result serialize adopts saved peers; a rolled-back graph reverts in-memory saved/dirty so retry works. Two same-entity embeds no longer false-cycle. Ensure, Load, NewRecord FK, CodeName emission, core-schema imports, IT85/EE5, graph-view UUID links, focal-node dblclick, and default excludeSchemas no longer dropping core form tabs.
- 8f63b57: Stop `rigs/lib/harness.ts` forwarding two symbols the framework package does not export.

  The shim re-exported `createRunQueryFixtures` and `teardownRunQueryFixtures` from
  `@memberjunction/testing-integration`. They are defined in `@memberjunction/integration-test-suite`
  (`src/checks/runquery-cache.checks.ts`) — the framework package ships content-free by design — so
  the module threw `SyntaxError: The requested module '@memberjunction/testing-integration' does not
provide an export named 'createRunQueryFixtures'` at load, taking down every rig that imports the
  shim before a single assertion ran. That is the nightly `Cross-server invalidation rig` failure,
  plus five hand-run `ps-live-*` rigs.

  Nothing consumed either symbol through the shim, and forwarding them contradicted the file's own
  stated rule ("Every symbol forwarded here is DEFINED in `@memberjunction/testing-integration`"), so
  they are removed rather than re-pointed. All 23 remaining forwarded symbols resolve against the
  package's 90 exports.

  Also removes the dangling comment in `testing-integration/src/index.ts` that still described the
  removed re-exports — that sentence is why a consumer went on importing a symbol that had moved.

- b42c125: Two silent failures made loud: the manifest generator's unbuilt-package fallback, and UR13's race with the live routine dispatcher.

  **The manifest generator no longer guesses when a lazy package hasn't been built.** `resolveSubpathExportsDetailed()` resolves a package's lazy-loading subpaths by reading the `.d.ts` each `exports` entry's `types` field names, and skips any it cannot find. On an unbuilt workspace it finds none, returns an empty map, and the package falls through to the whole-package branch of `groupClassesIntoChunks()` — which replaces its per-subpath lazy chunks with one eager chunk. The result is valid TypeScript that compiles and passes review with its code splitting quietly removed. Running `mj codegen manifest` against an unbuilt tree collapsed `ng-dashboards`' twelve per-dashboard chunks into a single import and deleted 254 lines from `lazy-feature-config.ts` without a single warning.

  `resolveLazySubpathExports()` now throws instead, naming the package and the directory it searched.

  The guard is deliberately narrow, because "declares subpaths that didn't resolve" is a much weaker signal than it first appears — two innocent cases produce it:
  - Every ng-packagr output publishes `"./package.json": { "default": "./package.json" }`, an entry with no `types` field that resolution skips by design. Only entries carrying `types` are counted.
  - A subpath whose `.d.ts` declares no classes is skipped exactly like a missing one. `BootstrapLite`'s `./mj-class-registrations` is a real example — a generated manifest of const arrays, built and present, with nothing to reach.

  So the check fires only for a package that actually **contributes lazy classes**, since that is the only case where an empty map mis-groups anything. A package contributing no classes has nothing to lose to the fallback.

  **UR13 no longer races the product it is testing.** The check asserted an exact global run-row count for a routine that the shipped `User Routine Dispatcher` scheduled job — `Status=Active`, per-minute cron — is equally entitled to claim. `ConcurrencyMode=Skip` cannot prevent the overlap: it serialises _scheduled_ runs against each other, while the check constructs a driver in-process against a fabricated `MJScheduledJobEntity` that is never saved, so the engine cannot see it. The scheduler polls on a timer anchored to MJAPI's boot rather than to the wall clock, so whether a sweep lands inside the bundle's ~3-second window varies run to run — which is why this failed on `next` after a slow boot with no relevant code change.

  It now snapshots the run rows before the pass and asserts on the delta, which is strictly stronger than what it replaced:
  - `Details.RoutinesRun === 1` states the no-double-run property directly against _our_ sweep, where it is deterministic, rather than inferring it from a row count anyone may write to.
  - Every new run row must satisfy the OnChange contract, not just the one at index 1 — all of them replay the same expression, so the property has to hold for each regardless of which dispatcher produced it.

  `UR11` and `UR14` share the same exposure and are left alone here; they are not currently failing, and the durable fix for them is a fixture-level decision (pausing the live dispatcher for the bundle) that belongs to the suite's owner.

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

- 394d276: Fix multi-provider and UUID-comparison compliance violations that failed the repo-wide MJGlobal compliance scanners. `HarnessAgentBase` now uses its bound provider (`this.ProviderToUse`) instead of `new Metadata()` and `UUIDsEqual` for the template-ID lookup; the task-graph orchestration integration checks use `ctx.Provider.EntityByName(...)` instead of `new Metadata()`.
- 512bb53: Security: close the role-elevation path on `MJ: Roles` and `MJ: User Roles` (issue #4282).

  Issue #4260 closed the `User.Type` route to elevated capability. Role assignment is the platform's other authority mechanism and was unguarded: no server-side entity subclass existed for either entity, so `ClassFactory` resolved the generated classes, whose `Validate()` knows nothing about who is calling. On a baseline seed — and verified against a live database — the `Developer` and `Integration` roles hold unfiltered `CanCreate`/`CanUpdate`/`CanDelete` on both entities. Reproduced end to end on the real stack before the fix: a caller whose `Type` is `'User'`, holding only `Developer` and `UI`, inserted a row granting itself `Integration` (`Validate()` passed, `Save()` returned `true`), and separately created a brand-new role.

  **`MJUserRoleEntityServer`** — a non-Owner may only grant, move or revoke a role they themselves hold. That subset rule is a ceiling: whatever a non-Owner does through this entity, the authority they hand out is authority they already had, so no sequence of calls lets a caller exceed their own grant. Delegated administration, IdP/group sync and onboarding automation — the legitimate non-Owner uses `User.Type` does not have — all keep working. On an update the pre-save `RoleID` is checked as well as the new one, so an assignment cannot be repointed to strip someone of a role the caller does not hold. `UserID` is deliberately not frozen: moving a grant between users stays inside the same ceiling. One consequence of that is chosen knowingly rather than incidental — because revocation shares the granting ceiling, a non-Owner may repoint or delete **any** user's assignment of a role the caller also holds, including an Owner's. That is not escalation: Owner authority lives in `User.Type`, which #4260 froze, and not in a role. It does let one non-Owner strip peers of a role they share, which is deprivation rather than elevation — reversible by an Owner and recorded in Record Changes. Narrowing revocation to the caller's own row would close it only by breaking delegated administration, the legitimate non-Owner use this rule exists to preserve.

  **`MJRoleEntityServer`** — a non-Owner may not create, change or delete a role. Every field on this entity is authority-bearing: `Name` is what user/role synchronization matches on, `DirectoryID` maps an external directory group to the role, and `SQLName` decides which database role CodeGen grants object rights to.

  Both guards override `Save()` and `Delete()` alongside `Validate()`, so the rules hold on every write path — GraphQL resolvers, Remote Operations, the Create/Update/Delete Record actions, metadata sync, one-off scripts — and cannot be switched off by the `ReplayOnly` save option, which skips `Validate()` while still performing the write. Both are pure: they read only the record's own field state and the caller's already-cached roles, so they cost nothing per save and are unit-testable without a database.

  **Upgrade notes.**
  - **Explorer's role-management screen stops working for non-Owner administrators.** It has no Owner gate of its own today, so a Developer-role non-Owner reaches it in practice; creating, renaming and deleting roles from it are now refused with a message naming the rule. This is the same trade-off #4260 accepted for the user-management screen.
  - **Explorer's bulk role assignment now checks each `Save()` return.** `executeBulkRoleAssign` enrols each row in a transaction group, where `Save()` reports only _enrolment_ — the provider queues the item locally and returns `true` without a round trip. A row refused **client-side** (a `CheckPermissions` denial or a field-rule failure) does return `false` and is never enrolled; that return was ignored, so an all-refused batch left the group empty, and an empty group's `Submit()` returns `true` for having nothing to do — the screen reported success having assigned nothing. It now collects each such refusal with the user it applies to and surfaces them.

    To be precise about what this does **not** cover: the role-elevation guard added here is server-side only (`@memberjunction/core-entities-server` is not a browser dependency), so it refuses during `Submit()`, not during `Save()` — and that refusal currently reaches the user nowhere at all. `ExecuteTransactionGroup` on the server discards its own `Save()`/`Delete()` return values, so a refused row never enrols in the server's group either; an all-refused batch submits an empty group, whose `Submit()` returns `true` for having nothing to do, and the screen closes with no message. Verified end to end against a live server: a non-Owner assigning a role they do not hold is correctly **refused** — no row is written, the guard works — but is **reported as success**. This is a pre-existing gap in that resolver (it predates this PR and equally affects `MJ: Users` via issue #4260), tracked as issue #4309 and deliberately not closed here.

  - **`AssignUserRolesAction` now fails the whole batch when the caller does not hold the role.** The core action (`CoreActions/src/custom/user-management/assign-user-roles.action.ts`) builds its `MJ: User Roles` object with `params.ContextUser` and assigns atomically, so a refused `Save()` rolls the transaction back and the action returns `Success: false` with `ResultCode: 'FAILED'` carrying the guard's message. Nothing is partially assigned and nothing is swallowed — unlike the transaction-group paths above, this one already reports its refusal. The "onboarding automation" the subset rule preserves is therefore preserved exactly where the automation's context user holds the role being granted: an automation running as a non-Owner that grants roles its own context user does not hold must be given those roles, or an Owner context user.
  - **`SyncRoles` / `SyncUsers` / `SyncRolesAndUsers` are unaffected on a default install** — all three carry `@RequireSystemUser()`, and `getSystemUser()` resolves the seeded `Type='Owner'` system user. A deployment whose system user is **not** an Owner will see those sync paths fail closed at the save, loudly rather than silently, for the same reason #4260 documented.
  - **Not closed by this change:** `MJ: Entity Permissions` carries the same unfiltered `Developer`/`Integration` grant, so a holder of either role can still widen a role's permissions directly. That is an independent route with its own decision to make about the invariant, so it is deliberately out of scope here rather than fixed in passing; this changeset does not claim to close it.

  New unit coverage in MJCoreEntitiesServer (41 tests across both guards, including the pre-fix reproduction) and a new deterministic integration bundle, **IT89 — Role Privilege Elevation Guard** (`role-elevation`, RE1–RE6), which proves the ClassFactory wiring and both guards against a real provider the way IT88 does for `MJ: Users`.

- 006fb69: Enforce the #3251 deterministic-suite ordering invariant with a test rather than a convention: every
  server-transport bundle must sequence before every client-transport one, so a client-bundle failure
  is unambiguously a client-seam failure and not fallout from server-transport state left behind
  earlier in the run.

  The rule had already been violated once (IT71 at sequence 34, tied with the first client bundle) and
  went unnoticed until a program wrap-up. Three companion assertions stop the interesting one passing
  vacuously — non-empty membership, a declared transport on every member, and a real sequence on every
  member. Verified by reproducing the original mistake and confirming it fails.

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

- ca4feb4: Workflow cost becomes a projection of the run tree, and a graph now runs in the order it was drawn.

  **Cost is the tree, not arithmetic beside it.** `AIAgentRun`'s four `…Rollup` columns are now written from `SumAgentRunTreeCost(LoadAgentRunTree(runID))` at settlement — one basis (per-node own spend), prompt-aware through `Configuration.runtime.promptRunID`, and structurally incapable of disagreeing with what the run viewer shows. The previous per-child loop filtered on `AgentRunID`, so every Prompt step's spend was absent, and mixed a descendant-inclusive number with an own-spend one. The tree now also carries the prompt/completion token split so all four columns share a basis. Writing the sum back makes the column an _output_ of the tree, which is non-circular only because the query reads own cost and never a rollup — stated in the query header and pinned by a test that plants an absurd rollup on a real run. When the tree cannot be summed (load failure, depth cap, graph not reachable), the columns are **cleared** rather than left holding a stale total from an earlier settlement.

  **A loop's passes exist.** The run tree reaches nested work through six relationships and a loop iteration was none of them, so a `While` that spent real money across three passes reported one childless node with no cost. The dispatcher now records one entry per pass (`ITaskStepRuntime.iterations`) and the tree expands them into nodes. On a real workflow this moved `TotalCostRollup` from `0.00049725` to `0.00555375` — the loop had been spent and not counted.

  **A graph is dispatched only once its edges exist.** Children and dependencies are now written in one transaction. Previously a poll could land between the two writes, see tasks with no prerequisites, and claim the whole graph at once — observed running a closing branch before the draft it was meant to judge existed, then reporting Complete.

  **Steps see their payload.** A step with no input mapping fell back to the raw input instead of the merged payload, so a Prompt step — which declares no mapping by design — rendered `{{ _CURRENT_PAYLOAD }}` as `{}` and wrote from an empty brief. Separately, a step with no output mapping _replaced_ the payload with its own output rather than merging; for a loop, whose output is a summary, that discarded everything the iterations had established and made a downstream `payload.x === true` edge unreachable.

  **An output mapping that names a parameter the step never returns now says so** (`unmapped`), naming what the step did return, instead of skipping in silence.

  **Human steps**: a cancelled request re-raises instead of stalling forever; cancelling a graph withdraws its open requests instead of leaving them in someone's inbox; cross-user `assignToUserID` is refused at submission rather than silently reassigned to the submitter; and a step can declare `expiresInHours`, which finally makes the existing expiry machinery reachable.

  **Web Search** captured each result with a non-greedy match that stopped at the first nested `</div>`, cutting the snippet out of every result — ten well-formed hits carrying no content. Results are now sliced between block starts, and an all-snippets-empty parse is reported rather than returned silently.

  **Testing**: a bundle whose every check is gated out now records an explicit skip naming the flag that would run it, instead of reporting PASS with zero checks executed.

- Updated dependencies [394d276]
- Updated dependencies [634aa8c]
- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [e4a6fa3]
- Updated dependencies [f5e91a7]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [afd6fd6]
- Updated dependencies [c42c0e8]
- Updated dependencies [79483bf]
- Updated dependencies [d735407]
- Updated dependencies [4586215]
- Updated dependencies [22ec804]
- Updated dependencies [d430fa5]
- Updated dependencies [319a7ed]
- Updated dependencies [2f305df]
- Updated dependencies [197fdf8]
- Updated dependencies [099b4d9]
- Updated dependencies [cd520e2]
- Updated dependencies [5ef97ff]
- Updated dependencies [62e0707]
- Updated dependencies [6673f51]
- Updated dependencies [c49a34a]
- Updated dependencies [d1d74c2]
- Updated dependencies [0312b22]
- Updated dependencies [f6a4341]
- Updated dependencies [d4a5b4c]
- Updated dependencies [b8c2e33]
- Updated dependencies [d38845a]
- Updated dependencies [67e4c9e]
- Updated dependencies [8206993]
- Updated dependencies [71817db]
- Updated dependencies [f5ec13b]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [199eb2b]
- Updated dependencies [f80bdb7]
- Updated dependencies [407f2f7]
- Updated dependencies [1940a4d]
- Updated dependencies [489aecd]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [8643a3d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [41b0d28]
- Updated dependencies [e2ad3c0]
- Updated dependencies [9fe3019]
- Updated dependencies [5ecfdb4]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [59def38]
- Updated dependencies [2412415]
- Updated dependencies [06ccfb2]
- Updated dependencies [047a80f]
- Updated dependencies [9699d0e]
- Updated dependencies [887ba9c]
- Updated dependencies [394d276]
- Updated dependencies [43f9133]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2cc08e1]
- Updated dependencies [ddf8621]
- Updated dependencies
- Updated dependencies [a5f92d2]
- Updated dependencies [2d14c62]
- Updated dependencies [394d276]
- Updated dependencies [c996a56]
- Updated dependencies [de6eb14]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [6bb2e1f]
- Updated dependencies [052b4c7]
- Updated dependencies [fe7bd9d]
- Updated dependencies [ada8784]
- Updated dependencies [8ec1515]
- Updated dependencies [eb962a1]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [394d276]
- Updated dependencies [50860ad]
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
- Updated dependencies [8f63b57]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
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
- Updated dependencies [e68d90d]
- Updated dependencies [8288711]
- Updated dependencies [6cbed1d]
- Updated dependencies [b42c125]
- Updated dependencies [f4fedab]
- Updated dependencies [be0bdb2]
- Updated dependencies [c679e8d]
- Updated dependencies [a723521]
- Updated dependencies [5f33ca8]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [328a98d]
- Updated dependencies [a4bb2f7]
- Updated dependencies [48ff99f]
- Updated dependencies [770cfca]
- Updated dependencies [ee85060]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [7857d8e]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [49f3592]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [23c2521]
- Updated dependencies [1fdd5d0]
- Updated dependencies [aa4fbe9]
- Updated dependencies [44fca09]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [0acf96e]
- Updated dependencies [8d0d45a]
- Updated dependencies [394d276]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [f5ec13b]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [2e2879e]
- Updated dependencies [6b971ab]
- Updated dependencies [9cbe17f]
- Updated dependencies [9fc0e2d]
- Updated dependencies [97cbf5f]
- Updated dependencies [b46330e]
- Updated dependencies [8b78695]
- Updated dependencies [cdd25c0]
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
- Updated dependencies [512bb53]
- Updated dependencies [e26c866]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [de343b5]
- Updated dependencies [2741d46]
- Updated dependencies [5fc861f]
- Updated dependencies [c11f8c6]
- Updated dependencies [88d751d]
- Updated dependencies [1748491]
- Updated dependencies [1100077]
- Updated dependencies [b6416f4]
- Updated dependencies [4cdfdcf]
- Updated dependencies [35ace7c]
- Updated dependencies [0db6105]
- Updated dependencies [d7feeae]
- Updated dependencies [7fefca2]
- Updated dependencies [bae672c]
- Updated dependencies [cda0187]
- Updated dependencies [f2f1491]
- Updated dependencies [a1a8989]
- Updated dependencies [bc45ded]
- Updated dependencies [28cd302]
- Updated dependencies [29c3dc8]
- Updated dependencies [e76b195]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [ca3657d]
- Updated dependencies [82a8585]
- Updated dependencies [394d276]
- Updated dependencies [1bd9674]
- Updated dependencies [394d276]
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
- Updated dependencies [394d276]
- Updated dependencies [ac96bb6]
- Updated dependencies [f5ec13b]
- Updated dependencies [d8adda1]
- Updated dependencies [88f8898]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [ae2baef]
- Updated dependencies [394d276]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [6cd337d]
- Updated dependencies [394d276]
- Updated dependencies [1c0d586]
  - @memberjunction/actions@6.1.0
  - @memberjunction/ai-core-plus@6.1.0
  - @memberjunction/ai-agents@6.1.0
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/aiengine@6.1.0
  - @memberjunction/scheduling-engine@6.1.0
  - @memberjunction/ai-engine-base@6.1.0
  - @memberjunction/ai@6.1.0
  - @memberjunction/codegen-lib@6.1.0
  - @memberjunction/server-bootstrap-lite@6.1.0
  - @memberjunction/api-keys@6.1.0
  - @memberjunction/storage@6.1.0
  - @memberjunction/sqlserver-dataprovider@6.1.0
  - @memberjunction/generic-database-provider@6.1.0
  - @memberjunction/metadata-sync@6.1.0
  - @memberjunction/content-autotagging@6.1.0
  - @memberjunction/communication-types@6.1.0
  - @memberjunction/communication-ms-graph@6.1.0
  - @memberjunction/communication-gmail@6.1.0
  - @memberjunction/search-engine@6.1.0
  - @memberjunction/unit-testing@6.1.0
  - @memberjunction/task-graph@6.1.0
  - @memberjunction/graphql-dataprovider@6.1.0
  - @memberjunction/ai-prompts@6.1.0
  - @memberjunction/testing-engine@6.1.0
  - @memberjunction/open-app-engine@6.1.0
  - @memberjunction/testing-integration@6.1.0
  - @memberjunction/actions-base@6.1.0
  - @memberjunction/ai-agent-harness@6.1.0
  - @memberjunction/redis-provider@6.1.0
  - @memberjunction/auth-providers@6.1.0
  - @memberjunction/record-set-processor@6.1.0
  - @memberjunction/record-set-processor-base@6.1.0
  - @memberjunction/predictive-studio@6.1.0
  - @memberjunction/queue@6.1.0
  - @memberjunction/communication-sendgrid@6.1.0
  - @memberjunction/conversations-runtime@6.1.0
  - @memberjunction/notifications@6.1.0
  - @memberjunction/templates@6.1.0
  - @memberjunction/ai-bridge-base@6.1.0
  - @memberjunction/ai-bridge-server@6.1.0
  - @memberjunction/communication-engine@6.1.0
  - @memberjunction/communication-expo-push@6.1.0
  - @memberjunction/communication-twilio@6.1.0
  - @memberjunction/query-processor@6.1.0
  - @memberjunction/templates-base-types@6.1.0
  - @memberjunction/predictive-studio-core@6.1.0

## 6.1.0-edge.7

### Minor Changes

- 076fa5d: Add a provider-neutral native tool-calling surface to `BaseLLM`, implement it in the Anthropic, OpenAI and Gemini drivers, give the prompt stack its own configuration bag, and gate the whole thing behind metadata in the prompt runner . MJ's LLM providers have described agent actions as prose in the system prompt and parsed a JSON envelope back; newer agentically-trained models increasingly fight that, and the prose action catalog is most of a 56–104KB Loop system prompt. This lands the plumbing, end to end and switched off. **Nothing in the tool-calling path changes behavior on merge.** The catalog now records which models and vendor servings _can_ do native tool calling — that is the audit this branch produced — but every one of them carries `LLM.DefaultToNativeToolCalling: false`, no prompt sets `LLM.UseNativeToolCalling`, and no MJ caller passes tools, so the gate resolves false on every existing path and each run takes exactly the code it takes today. Capability is a statement of fact and is safe to ship; policy is the switch, and it is off. The first behavior change is a deliberate one: flipping the policy on a specific model, and a caller that supplies tools.

  **Model selection does change on merge, and is not gated.** Query Builder and the Research Agent family (7 agents, 8 prompts) move from `Gemini 3.5 Flash` to `Gemini 3.8 Flash` — 16 `ModelID` changes across 8 prompt seed files. The Flash-Lite rows that outranked them are set `Status: "Inactive"` rather than deleted, because `mj sync push` never deletes; removing the rows from JSON would have left those agents on Flash-Lite in every existing database. Once this metadata is pushed, those eight prompts are served by a different model than they are today.

  `ChatParams` gains `tools` (declarations as JSON Schema — the one format all three vendors accept), `toolChoice` (`'auto' | 'none' | 'required' | { name }`) and `parallelToolCalls`. Responses normalize to `ChatCompletionMessage.toolCalls` with **parsed** arguments plus a `'tool_calls'` finish reason; a turn can carry text _and_ calls, because all three providers structurally allow it, and nothing may assume text exists on a tool-call turn. Multi-turn tool use round-trips through a new `tool` message role and `tool_result` content block, which reuse the existing content-block serialization so tool turns persist correctly in message logs. `BaseLLM.SupportsTools` declares whether a driver has the mapping (default `false`); a driver without it ignores declarations rather than failing.

  **Schema — a JSON bag at the prompt layers.** `AIPrompt.PromptConfiguration` and `AIPromptModel.PromptConfiguration` (`nvarchar(max) NULL`) mirror the model catalog's `ModelConfiguration` cascade, resolving prompt-model over prompt over catalog. This resolves the plan's open question in favour of a bag over bit columns: `AIPrompt` already carries fifty-odd columns, and a bag lets the shape keep adapting without a migration per knob — a knob graduates to a real column when it needs a foreign key or becomes a first-class platform concept. It is named `PromptConfiguration` rather than `Configuration` because `AIPromptModel.ConfigurationID` already makes CodeGen emit a `Configuration` display column in the base view, which a same-named base column would collide with.

  **One source of truth for the modality sections.** `metadata/entities/JSONType-interfaces/IAIConfiguration.ts` now defines `LLMConfigurationSettings`, `RealtimeConfigurationSettings`, `VisionConfigurationSettings` and `AudioConfigurationSettings` once, plus one outer type per column (`IAIModelConfiguration`, `IAIPromptConfiguration`, `IAIPromptModelConfiguration`); all five `EntityField` rows point at that single file. It has to be one file because `JSONTypeDefinition` is stored verbatim and emitted inline per entity — a definition cannot import a sibling. The package-side mirror in `@memberjunction/ai` matches, keeping `AIModelConfiguration` and the existing resolver exports intact (the old section names remain as deprecated aliases). Two typed flags join the `LLM` section: `SupportsNativeToolCalling` (capability — a hard gate) and `DefaultToNativeToolCalling` (policy), joined at the prompt layers by `UseNativeToolCalling` (preference). All are tri-state — absent means _inherit_, distinct from an explicit `false` that overrides a lower layer.

  **Guard.** An assistant turn must carry `toolCalls` for the `tool_result` answering it to be valid; forgetting to copy them is the easy mistake, and Anthropic rejects it with an error naming only an opaque id. `validateToolConversation` now catches orphaned results at the MJ boundary with a message that says what to fix, run from `BaseLLM.ChatCompletion` for tool-capable drivers.

  **Shared conformance suite.** `RunLLMToolCallingConformanceSuite` in `@memberjunction/unit-testing` asserts the provider-independent half of the contract — capability declaration, parsed arguments, the `'tool_calls'` finish reason, text-and-calls coexistence, a text-free call counting as success, the streaming downgrade, and the orphan guard — and is adopted by all three tool-capable drivers. It is a separate entry point from the streaming/cancellation suite so a driver can conform on tools without first scripting a mock for every streaming path. Provider-specific request mapping stays in each driver's own tests.

  Per-provider notes. Anthropic coalesces consecutive tool turns into the single user turn its API requires, so parallel-call results are not orphaned by the role-alternation filler, and drops the empty text block a tool-only turn would otherwise send. OpenAI expands one tool turn into its per-result `tool` messages and surfaces a call whose arguments are malformed JSON rather than dropping it — the agent loop must be able to see a bad call, not silently nothing. Gemini's "no output received from model" guard now accepts a tool call as output; without that, every clean text-free tool call would have been reported as a failed generation. Drivers extending `OpenAILLM` inherit the mapping (OpenRouter, xAI, Zhipu, MiniMax, LlamaCpp); `ai-inception` overrides `SupportsTools` back to false, since Mercury Edit is a next-edit-prediction model on a custom endpoint that takes no `tools` parameter.

  Native tool calling is non-streaming: when a caller requests streaming with tools declared, `BaseLLM` takes the non-streaming path and records `streamingSuppressedForTools` on the result, mirroring the existing streaming-unsupported fallback.

  `ai-cerebras` and `ai-lmstudio` pass MJ roles straight to SDKs that accept only system/user/assistant; both now narrow through the new `toClassicChatMessageRole` helper, which maps `tool` to `user` — the role a tool result reads as to a provider with no tool support.

  **Gating (layer 3).** `AIPromptRunner` is the only layer that reads metadata to decide whether tools go out. The decision itself is a pure function, `ResolveNativeToolCalling`, so the design's truth table is asserted directly rather than through the runner. It resolves inside `executeModel` — per model call, not once per run — because failover can move a run to a (model, vendor) whose capability differs, and the failover loop already threads each candidate's own `AIPromptModel` row so a candidate with no such row contributes no override. Callers supply tools through new `AIPromptParams.tools` / `toolChoice` / `parallelToolCalls`; the runner never invents them. The gate is wrapped so that any failure to resolve configuration degrades to the envelope path — an opt-in enhancement must never fail a run that would otherwise succeed.

  **Instrumentation and fallback (layer 4).** New `AIPromptRun.ToolCallingMode` column (`'Native' | 'Envelope' | 'NativeFallback'`, CHECK-constrained) records which path each run took, so the envelope-vs-native comparison is queryable from run history. It is a column rather than a bag key precisely because its purpose is to be filtered and grouped across many runs. When a native call fails in a _tools-specific_ way — the provider rejecting the declarations, an unusable tool call, a tool-related discarded turn — the runner retries once with tools stripped and records `NativeFallback`. That classification is deliberately narrow and biased toward missing a tool failure rather than catching an unrelated one: a rate limit or context-length error must reach the existing retry/failover logic unchanged. The retry shares the original call's timeout budget rather than silently doubling the caller's timeout.

  **Provider probe.** `integration-test-suite/rigs/native-tool-matrix.ts` sweeps each tool-capable driver directly against live providers across {no tools | auto | none | required | named} × {responseFormat Any | JSON} × an optional thinking axis, recording call well-formedness, parallel count, text/call coexistence, envelope compliance, forcing adherence, finish reason and prompt tokens. It answers the plan's §5.6 and §9.3 open questions with data rather than inference, and it is deliberately not a test: it reports rates, asserts nothing, is dry-run by default, and `mj test` never dispatches it. The evaluators live apart from the runner in `src/native-tool-matrix/` as framework-free pure functions with 37 unit tests, so the measuring instrument is verified on every PR without spending a token. The first sweep against Google found: forcing semantics are 100% honored; **forced tool choice combined with JSON mode is a hard 400 on every current Gemini model**, not just 2.x as the audit had it, which constrains the per-step forcing policy; and Gemini 3.7 Flash under JSON mode answers a tool question natively while ignoring the requested envelope entirely — the malformed-response mechanism reproduced in three calls at the driver layer. It also confirms two PR 2 decisions were load-bearing: text NEVER accompanied a tool call on Google (so the "no text on a tool-call turn" rule is the only case there), and the extended Gemini empty-output guard would otherwise have failed every successful tool call in the sweep.

  **Prompt-exemplar audit (plan open question §9.4).** Every JSON exemplar in `metadata/prompts/` — the shapes agent prompts show models and the `OutputExample` values injected into them — was checked against `LoopAgentResponse`, the validator, and the dispatcher. 20 defects across 8 files, **13 of which made a forced retry the guaranteed outcome of following the prompt**: `message` nested inside `nextStep` on a Chat step (it is top-level; the runtime retries without it) across seven research-agent exemplars, `"type": "Action"` with `action: {name, input}` across six Codesmith exemplars — one labelled "✅ CORRECT Response" — a lowercase `"chat"` the validator accepts case-insensitively and the dispatcher then cannot switch on, and `nextStep: {type: "Success"}` beside `taskComplete: true`. Separately, `database-schema-designer.example.json` had four trailing commas and did not parse: since `AIPromptRunner` parses `OutputExample` as a validation schema and that prompt is `ValidationBehavior: 'Strict'`, **every run of `Database Schema Designer - Main Prompt` failed validation regardless of what the model produced**. Also fixed: raw newlines inside a JSON string, a `//` comment inside an exemplar, bare `...` array placeholders, and invented keys that were silently dropped (`subAgent.payload`, `suggestedResponses`, and Codesmith's `finalCode`/`result`/`iterations`, now written through `payloadChangeRequest` under the names its own `FinalPayloadValidation` requires).

  To stop the class from returning, `LOOP_NEXT_STEP_TYPES` is now exported from `loop-agent-response-type.ts` with two-way compile-time checks against the interface union (a plain `readonly T[]` annotation accepts a subset, so it catches an invented value but not a forgotten one — both directions are asserted), `LoopAgentType.isValidLoopResponse` derives its accept-list from it instead of restating it, and `ai-agents` gains `loop-exemplar-conformance.test.ts`, which brace-matches every shipped exemplar out of `metadata/prompts/` — blockquotes stripped, so quoted and nested-fence exemplars are covered — and fails per offending exemplar. Full findings: prompt-exemplar audit.

  **Two repairs found while building the above.** `integration-test-suite/rigs/lib/harness.ts` re-exported `createRunQueryFixtures` / `teardownRunQueryFixtures`, which had moved into this package's own `runquery-cache` checks. A named re-export of a binding the source module does not provide is an ESM _link-time_ error, so it did not fail where it was written — it took down **all six rigs** that import the shim, before a line of their own code ran, and `tsc` never saw it because `rigs/` sits outside the package's tsconfig `include`. No rig ever used either symbol; removing the two lines revives every rig (verified by linking all sixteen). `src/__tests__/rig-harness-shim.test.ts` guards it by checking each forwarded name against the package's real exports — note that merely importing the shim under vitest does **not** reproduce the failure, because Vite transforms rather than links, so the name check is the part that bites.

  The matrix rig also now proves a credential before spending a sweep on it. A revoked key previously produced one identical 401 per cell — 186 across the two Claude rows — burying the real findings and reporting models as 100%-failed that were never actually asked anything; it now costs one eight-token preflight call per model, plus a mid-sweep abort after three consecutive auth failures, and the run ends by naming every unmeasured model so a partial scorecard cannot pass for a complete one. The classifier (`src/native-tool-matrix/credentials.ts`) is deliberately conservative — a rate limit, quota, unknown model or 5xx is not an auth failure, since a false positive discards a model that would have produced data — and is unit-tested against all three providers' verbatim rejection messages and against near-misses like a token count containing "1401".

  **The Action→tool mapping, measured before the framework implements it — and corrected.** The matrix grew a second scenario family that builds tools from **real `ActionParam` rows** (snapshotted into a fixture so the probe stays database-free) using a faithful restatement of the Action→`ChatTool` table, then asked providers what they make of it. Two results. First, the `Scalar` → `{type: ["string","number","boolean"]}` union type — which appears to contradict §8.2's own "stay inside the cross-provider common subset" rule, since OpenAPI has no union type — measured clean: identical error counts to a conservative `{type:"string"}` arm across 192 calls, and 6/6 tool selection among three real MJ Actions. It stands as written. Second, and less comfortably, `ValueType: 'Other'` → `{type:"object"}` does **not** hold. `Run Ad-hoc Query.Query` is `Other` but carries a SQL string, and typing it as an object makes models emit `Query: {}` — a well-formed, dispatchable, useless call that no well-formedness oracle would catch. Usable arguments: **60% as specified, 100% mapped to `{type:"string"}`** on identical prompts. The mapping has been corrected (`Other`/`MediaOutput` → string; `Simple Object`/`BaseEntity Sub-Class` stay object), its "exact parity with the prose catalog" claim retracted, and the `ValueSchema`-on-`ActionParam` question reopened — the baseline turns out to recover that case only by _guessing_ a type, which is precisely what `ValueSchema` would make unnecessary. The mapping ships here as a tested rig-side module, not as the framework's generator; `observedArguments` was added to the observation record because a failed matcher says fidelity was lost while only the payload says how.

  **The baseline eval harness.** The harness that has to exist _before_ the feature can be measured now exists.

  `trace-validate-sub-agents` (**T1**) is implemented and registered. It was referenced by shipped metadata that never had an implementation: both stock research-agent tests weight it at 0.25 and 0.3, the engine logged `Oracle not found`, and that fraction of each test's score silently vanished while the tests reported green on the rest. It walks the run tree through the **Sub-Agent step's `TargetLogID`** rather than `AIAgentRun.ParentRunID` — the generated ORM is explicit that ParentRunID "records parentage but is not a link the tree traverses" — recursing so a required agent two levels down still counts, and gives partial credit across the `requiredAgents` / `forbiddenAgents` / `minIterations` checks a test configures.

  `PromptEvalDriver` + the `Prompt Eval` test type (**T2**) evaluate ONE model decision from frozen mid-loop state. No action executes: the runner returns the reply and deterministic oracles read it. It is separate from `AgentEvalDriver` because a loop confounds the measurement — a run that recovered on iteration three answers a different question than "does this model, in this state, choose action B". Three easily-missed execution details are handled explicitly: an explicit `contextUser` (#3251), `AIEngine.Config()` before the first run, and `WaitForPendingPromptRunSaves()` before any oracle reads a prompt run back.

  `agent-decision-match` and `response-well-formed` (**T3**) are the decision oracles. The first reads a decision off **whichever channel the model used** — envelope `nextStep.actions[]` or native `ChatToolCall[]` — and scores it against an encoding-independent expectation, which is what makes a baseline cell and a native cell comparable on an identical corpus case. Its details carry the components apart (decision kind / action accuracy / param fidelity / per-matcher outcomes) so §6.1's metrics aggregate out of stored `ResultDetails` without re-running a single model call. The second measures the malformed class on its own, because "malformed rate fell" and "decision accuracy rose" are different claims.

  The corpus (**T4**) ships as golden files under `metadata-optional/prompt-eval-corpus/` with a validating loader, eight starter cases spanning the plan's categories against real shipped agents, and a generator that expands corpus × matrix into `MJ: Tests` records with stable per-cell IDs (so regeneration updates rather than orphans, and `mj test history` survives) plus an estimated-token manifest per run. Verified end to end: 8 cases generate, push, and validate through the real `mj test` pipeline against the registered driver.

  Everything scoring-related lives in `Engine/src/eval/` as **framework-free pure functions** per test plan §2.1 — no import from the testing engine anywhere in that directory — so the same logic runs behind the `IOracle` wrappers today and would run unchanged under the documented bespoke-runner fallback. 45 unit tests pin the instrument, including the rule that a corpus expectation may never name `nextStep` or `toolCalls`.

  **Corpus and harness verification.** The corpus is 57 golden cases spanning every category the test plan's §4.3 table names, written against the real shipped agents and their actual action names: first-step selection, mid-loop params, error recovery, disambiguation across Sage's 26-action catalog, parallel fan-out, sub-agent dispatch through Marketing's five specialists, terminal synthesis, clarify, payload change, forced control flow at the iteration ceiling, and six adversarial cases that specifically detect the malformed shapes MJ's own exemplars taught before the audit.

  A pinned matrix (`matrix/envelope-baseline.json`) fixes the (model, vendor) pairs by catalog ID rather than by name, so a rerun months later addresses the same rows; expanding corpus × matrix yields **399 test records, all validating through `mj test`**.

  `prompt-eval-harness` (IT87) verifies the instrument in the deterministic tier, for zero tokens: every case names capabilities that actually exist (PE1 — which caught two unsatisfiable cases the moment it was written), the generated records have not drifted from the golden files AND cover the pinned matrix in full (PE2 — which caught real drift on its first real run, and whose matrix half exists because a suite generated against the wrong matrix passes every other check while measuring the wrong models under the right name), every expectation is decidable (PE3), a scripted correct reply scores correct through the **real `AIPromptRunner`** with `TestLLM` registered over the driver classes (PE4), five distinct malformed shapes are provably caught (PE5), and a wrong-but-well-formed reply separates decision accuracy from malformed rate (PE6). PE5 is the load-bearing negative: a harness that cannot fail on demand makes every rate it reports a fiction.

  One evaluator gap closed along the way: an undispatchable `nextStep.type` — `'Success'`, or a lower-cased `'chat'` — previously scored as well-formed even though the runtime rejects it into a forced Retry. `evaluateWellFormed` now checks the raw step type against `LOOP_NEXT_STEP_TYPES`, derived from the agent framework rather than restated.

  The deterministic tier is 65/71 with the new bundle in it, 558 oracle results, zero failures.

  **The cost manifest is measured, not guessed.** It originally priced a run at a flat 12,000 tokens of composed prompt per call. Measuring the real templates showed that to be **38% low** — the Loop agent-type system prompt _alone_ is ~12,700 tokens (50KB, consistent with the issue's 56–104KB claim) before any agent's own prompt or its action catalog. Per-agent sizes now range 12.7k (an agent with no actions) to 33k (Report Writer), and the generator reads them from a committed `matrix/prompt-size-baseline.json` regenerated by `rigs/measure-prompt-sizes.cjs`. A full baseline run at N=20 is **~158M prompt tokens, not ~96M** — and that still reads low, since it is chars/4 over raw metadata rather than the rendered catalog. A cost manifest wrong by 64% is worse than none, because it gets believed.

  **The matrix is pinned to the deployed configuration, at N=3, for ~$11.** Two problems with the first pinning, both caught by asking what it would cost. First, it pinned one model per generation per developer — right for the provider probe, wrong for a baseline whose stated job is _"the quantified current-state of the framework"_: only 2 of 15 corpus agents had even one of those models in their real configuration, so it would have measured models nobody deploys. The cells are now the (model, vendor) pairs the agents actually run on, ranked by adoption, led by **GPT-OSS-120B on Cerebras — which all 15 corpus agents list**.

  Second, N=20 was over-specified. The plan justifies it from an experiment that ran 40 repetitions of _one_ prompt, where repetition was the only source of variation; here the corpus is the variation, and 57 cases × N=3 gives 171 observations per cell — well past what a two-proportion test on the aggregate needs. Escalating to N=20 belongs on the (case, cell) pairs that come back non-unanimous, which is the only place more repetition resolves anything.

  GPT 5.5 / 5.5 Instant are excluded on cost: at \$5/\$30 per 1M they were \$121 of a \$196 run, two thirds of the bill for one sixth of the cells. Aggregator pairs (Vertex, Bedrock, OpenRouter, Azure) are deferred to a run where vendor divergence is the thing being measured.

  The manifest now prices in **dollars per cell**, reading `AIModelCost` at pin time so the estimate works offline — a token count nobody can convert is a cost control nobody uses. The full baseline: **285 cells, ~$11.36**, down from $196.

  **A finding that outlives the baseline:** `CerebrasLLM` and `GroqLLM` extend `BaseLLM` directly rather than `OpenAILLM`, so `SupportsTools` is `false` on both. GPT-OSS-120B — the single most-deployed model across the corpus agents — **cannot do native tool calling in MJ today at all**; the gate would resolve `Envelope` whatever metadata is set. Irrelevant to an envelope-only baseline, but it means the primary deployed configuration is not reachable without driver work on those two providers.

  **Native tool calling on Cerebras and Groq — the deployed workhorse.** `CerebrasLLM` and `GroqLLM` extend `BaseLLM` directly rather than `OpenAILLM`, so unlike OpenRouter/xAI/Zhipu/MiniMax/LlamaCpp they inherited nothing and reported `SupportsTools: false`. That mattered more than the provider count suggests: **GPT-OSS-120B on Cerebras is the single most-deployed model across MJ's shipped agents** (all 15 in the eval corpus list it; Groq is second at 11), so the one configuration the feature most needed to reach was the one it could not — the capability gate resolved to the envelope no matter what metadata said.

  Rather than write the mapping a third and fourth time, it now lives once in `@memberjunction/ai` as `openAICompatibleTools.ts`, and **OpenAI delegates to it too**. That format is the de-facto standard — Groq, Cerebras, Fireworks, xAI, Together, LM Studio, DeepSeek, Moonshot, Z.AI, MiniMax and OpenRouter all speak it — and the mapping has three details that are easy to get quietly wrong: arguments cross the wire as a JSON **string**; one MJ tool turn expands into **N** provider `tool` messages; and a call with malformed arguments must be **surfaced**, because an agent loop that sees nothing cannot tell "said nothing" from "said something broken". Four copies of that would drift. The wire types carry an open index signature deliberately — several provider SDKs declare their own with one, and a closed type is not assignable to an open one.

  Two provider-specific facts are encoded rather than assumed. **Groq does not support parallel tool calls on the gpt-oss family** — precisely what MJ deploys most — so `parallel_tool_calls` is forwarded only when a caller sets it explicitly, never inferred. **Cerebras can emit a call to a tool that was never declared**; the shared extractor surfaces it rather than dropping it, so the agent loop can reject it by name instead of receiving silence.

  One latent bug fixed on the way: Groq's converter appended a dummy `"OK"` user message whenever the last turn was not from a user. After tool results that would have separated them from the assistant call they answer — the same hazard as the Anthropic alternation filler — so the filler now skips a turn ending in tool results. Its multimodal branch also cast the role through with `as`, which would have sent a raw `tool` role the API rejects; it narrows through `toClassicChatMessageRole` now.

  Both drivers adopt `RunLLMToolCallingConformanceSuite`, and their `@memberjunction/ai` test mocks import the real mapping by path rather than re-mocking it — a mocked copy would be exactly the second implementation the shared module exists to prevent.

  **Reachable, not enabled.** This makes the deployed configuration _reachable_; whether anything uses it is the policy flag's business, and that ships off (see the capability audit below).

  **`reasoning_effort` gained the two levels it was missing.** `OpenAILLM.getReasoningLevel` accepted `low`/`medium`/`high` or a number and threw on anything else, so OpenAI's `xhigh` and `none` were unreachable through MJ — verified against the live API, whose own rejection message enumerates `none, low, medium, high, xhigh`. Both are now accepted **by name only**: MJ's numeric 1-100 scale is a cross-provider convention whose three bands are replicated in the Groq and Cerebras drivers, so re-banding it to make room would silently reclassify every documented `effortLevel: 85` and mean something different per provider. `AIPromptParams.effortLevel` widens to `number | string` to carry a named level (`.toString()` on the runner's path already handled both); `AIPromptRun.EffortLevel` is a numeric column with a 1-100 CHECK, so a named level is deliberately not persisted there. The GPT-OSS path writes `Reasoning: <level>` into the system prompt rather than sending an API field, and harmony defines only three levels, so it clamps `xhigh`→`high` and `none`→`low`.

  **The hybrid agent loop, opt-in and inert.** Actions are now declarable as native tools and a tool call _is_ an Actions step. `buildActionToolSet` (§8.2) maps `ActionParam` metadata onto JSON Schema using the two mappings measurement settled — `Scalar` keeps the union type, and every opaque `ValueType` becomes `string` rather than `object`, which took usable arguments from 60% to 100% on `Run Ad-hoc Query.Query`. Only `Input`/`Both` params are declared, and a post-sanitization tool-name collision is a hard error at build time, because two Actions sharing one tool name would dispatch whichever registered last — a routing bug that presents as a model error. `LoopAgentType` checks native tool calls **before** the envelope (§8.1): Measurement showed that a model given tools answers through them and stops emitting the envelope entirely on some providers, so the two cannot be asked for in one turn. A call naming an undeclared tool is a Retry naming it, never a silent drop — Cerebras does this at roughly one forced call in six. The loop template drops its action catalog and the `'Actions'` step type under `_NATIVE_TOOL_CALLING` (§8.4), which is where the 56–104KB prompt reduction comes from; the flag is set from the gate's **real** decision before rendering, not from the caller's intent, so a prompt can never suppress its catalog while the model receives no tools. `AIAgentRunStep` gains `ToolCallingMode` and `NativeToolCallCount` (§8.5) so a comparison groups by its independent variable instead of reconstructing it through a lossy join.

  **The capability audit, and the policy that ships off.** `metadata/ai-models/.ai-models.json` now carries `ModelConfiguration.LLM` on **139 model rows** — `SupportsNativeToolCalling: true`, plus `NativeControlFlow: 'implicit'` and `NativeToolResults: true` describing which protocol that model can hold — and **83 vendor-level rows** that override it to `false` for a serving path verified not to accept tools. Those three are statements of fact about a model, and the gate treats capability as a hard gate that no policy can override, so recording them turns nothing on. Every one of the 139 also carries `DefaultToNativeToolCalling: false`: written explicitly rather than omitted, because "we know this model can, and we are choosing not to yet" is the thing a reader needs to see, and flipping it later is then a one-word edit per row rather than a new key. No prompt carries a `UseNativeToolCalling` preference. That is the measurement's own recommendation applied as written: revert the preference, keep the capability flags.

  `BaseAgentType.SupportsNativeToolCalls` (false; `true` on `LoopAgentType`, inherited by Harness) gates whether `BaseAgent` declares an agent's Actions as tools at all — without it a catalog default would have offered tools to the four Flow agents with Actions, whose type cannot read a call back and would have turned every such reply into a Retry.

  A full-corpus comparison then ran both arms — four times at N=3, 1,026 observations each, no observations lost — and returned **NO-GO on all three providers on every run**. The decomposition (results §9) is the useful part. Native tool calling delivers exactly the gain it should: given that an action is the right answer, GPT 5.6-luna acts 76% of the time through the envelope and 96% with tools declared, and every native turn that picks the right tool fills it correctly. That gain is then spent, almost to the turn, on two losses. Tool _selection_ got worse — the same confusion pairs as the envelope, confused more — and richer declarations fixed it only in compact form (outputs and result codes as names, +6 to +11pp on two models) while full-detail prose reversed the gain and cost the smallest model ~700 tokens a call. And models call a tool on 5–20% of turns whose right answer is chat, completion or delegation; that number did not move across four runs and two interventions, is concentrated in five specific corpus cases, and is the blocker. **The prompt-size premise did not hold** on any run: tokens fell on one model and rose on the other two. The single largest source of "wrong tool" in every arm is the action catalog itself — `Search Query Catalog`'s description prescribes search-before-SQL and the corpus expects direct SQL — which is a product question, not a model one. The recommendation on the record is to revert the prompt-level `UseNativeToolCalling` before merge and keep the capability flags, which change nothing on their own.

  **Tool declarations now carry what the prose catalog carries.** `buildToolFromAction` folds output params and result codes into the description, restoring the rule the file already stated (never less informative than the prose). The description ceiling is 1,024 characters as a _measured operating point_ — no provider enforces a limit anywhere near it (all three accepted 8,000 on a live probe), but the compact form measured better than full detail and the code comment says so. `resolveToolChoiceForTurn` forces `'none'` on the last permitted iteration, where a tool call would be executed and discarded; that is correct and unit-tested, and could not affect the single-decision corpus.

  **Six defects the measurement surfaced, all fixed here.** A tool-call-only turn carries no text, and the runner scored that as `No output received from model` — a warning on every native turn, and under `ValidationBehavior: 'Strict'` a retry that could never succeed; tool calls now count as output. The Layer-4 fallback only inspected a _returned_ failed result, but OpenAI's SDK _raises_ its 400, so a tools rejection bypassed the strip-and-retry entirely and hard-failed the run; both shapes now take the same one-shot retry. OpenAI additionally rejects tools alongside `reasoning_effort` on `/v1/chat/completions`, so **native tool calling and reasoning are mutually exclusive on OpenAI until the driver speaks the Responses API** — the earlier probe missed this by testing a non-reasoning model. `CerebrasLLM` drops `response_format` when a request declares tools, which Cerebras rejects outright. On the harness side, `PromptEvalConfig` gained the `toolCallingMode` axis it was always documented to have (an `envelope` cell withholds the declarations the composer attached, which is the gate's `toolsProvided` term and the only difference between the arms); the decision normalizer maps sanitized tool names back to Action names through the framework's own binding table, without which a corpus expectation written as `Execute Code` scores a correct `execute_code` call as the wrong action; and pinned matrix cells now decline vendor failover, after a first attempt lost 42% of its observations to rows that had quietly failed over to a different vendor and were recorded under the pinned one's label.

  `FailoverConfiguration` is now exported from `@memberjunction/ai-prompts` — it is the return type of `getFailoverConfiguration`, a `protected` method documented as an override point, which a subclass outside the package could not name.

  **Implicit control flow (opt-in, and off).** Under `LLM.NativeControlFlow: 'implicit'` the loop stops splitting its turn between two channels: sub-agents are declared as `delegate_to_<name>` tools, `payload_change_request` and `ask_user` join them, a tool call continues the loop, and **plain text with no call ends the turn as task completion**. The Loop agent-type template renders that protocol instead of the `'Actions'`/`'Sub-Agent'`/`'Chat'` step types, which is the rest of the prompt reduction the hybrid could not reach — the hybrid still had to describe the envelope because completion lived there. `ToolCallingMode` gains `'NativeImplicit'` so the two native protocols are distinguishable in run history rather than both reading as `Native`.

  **Tool results as tool turns.** When the catalog says `LLM.NativeToolResults`, a step's action results go back as native `tool` turns answering the assistant's call turn, instead of the markdown "Action results:" user message. `AIAgentRunStep.NativeToolResultsSent` records which encoding a step used, so the scorecard can tell them apart without reconstructing them from `AIPromptRun.Messages`. The two encodings are one function apart: `EncodeToolTurnsAsText` in `@memberjunction/ai` converts native tool turns back to the markdown form, and both the envelope fallback retry and the eval harness's history builder now call it rather than carrying their own copy — the fallback previously stripped the _declarations_ while leaving native `tool` turns in the history, which is a shape no envelope-path provider accepts.

  **Declaration control, per agent and per action.** `AIAgent.DeclareActionsAsNativeTools` and `AIAgentAction.DeclareAsNativeTool` (both `BIT NOT NULL DEFAULT 1`) decide whether an agent's Actions are _supplied_ as tools, independent of whether the gate would use them. Measurement found this was the missing switch: the Research Agent's prompt says it never does work itself, yet declaring its one action made GPT 5.6-luna use it on 7 of 9 turns against 0 of 9 on the envelope. Declaration turns a dormant capability into an active one and no prompt text can undo it, because the prompt already says never. `metadata/agents/.research-agent.json` sets the agent-level flag to `false` for exactly that reason. `AIAgentRunStep.NativeDualChannel` counts the other half of the same finding: turns that carried a tool call _and_ a complete Loop envelope, where the loop takes the call and discards the envelope silently.

  **Provider repairs found by running it.** Gemini rejects a request whose `contents` do not begin with a user turn, and a Skip-style caller that puts everything in the system instruction sends none — every such run died on a 400 naming `function call turn comes immediately after a user turn`. `geminiMessageSpacing` now prepends a minimal user turn when the first turn is the model's. Anthropic gained a `thinking-config` module so a thinking request and tool declarations no longer contradict each other in the mapping.

  **One step-save defect.** `AIAgentRunStep.StepName` is 255 characters and the loop writes a failure message into it; a 327-character provider error therefore failed the step save, and the run reported "2 step record save(s) failed" while hiding the actual error. `BaseAgent.fitStepName` truncates to the column's declared `MaxLength` read off the entity, so the row saves and the message is still readable.

  **Two toolchain repairs, unrelated to the feature but on its path.** `mj dev workspace` generated a root manifest with a `pnpm` block that pnpm 10.33 ignores — settings have to live in `pnpm-workspace.yaml` — and could not express a consumer-scoped override, so a member repo's own copy of a package lost to another member's `workspace:*`. The generator now emits its settings into the workspace file, pins patched packages to their patch version, and resolves duplicate providers with `parent>child` selectors pointing at the owning member. It also relaxes `strict-peer-dependencies` from `true` to `false` in the process: a mixed workspace resolving published `@mj-biz-apps/*` against linked MJ source now reports its peer gaps and completes, where it previously failed the install on peers no member can fix. Separately, `mj app install` resolved hook modules from the repo root only, which fails whenever the app's packages live in an installed tree or a dev-workspace parent; `ResolveHookModule` now walks the installed app packages, the server/client workspaces and the repo root, and names every base it tried when it fails.

  **Schema ships as one migration.** The seven migrations this work accumulated are consolidated into `V202609122036__v6.1.x__Native_Tool_Calling.sql` — hand-written DDL for all four groups above, then the CodeGen fold, generated from a from-scratch database so the tail reflects `next`'s schema rather than overwriting the procs `next`'s own migrations regenerate. The PostgreSQL counterpart is deferred to the release build, per `migrations/CLAUDE.md`.

### Patch Changes

- 8f63b57: Stop `rigs/lib/harness.ts` forwarding two symbols the framework package does not export.

  The shim re-exported `createRunQueryFixtures` and `teardownRunQueryFixtures` from
  `@memberjunction/testing-integration`. They are defined in `@memberjunction/integration-test-suite`
  (`src/checks/runquery-cache.checks.ts`) — the framework package ships content-free by design — so
  the module threw `SyntaxError: The requested module '@memberjunction/testing-integration' does not
provide an export named 'createRunQueryFixtures'` at load, taking down every rig that imports the
  shim before a single assertion ran. That is the nightly `Cross-server invalidation rig` failure,
  plus five hand-run `ps-live-*` rigs.

  Nothing consumed either symbol through the shim, and forwarding them contradicted the file's own
  stated rule ("Every symbol forwarded here is DEFINED in `@memberjunction/testing-integration`"), so
  they are removed rather than re-pointed. All 23 remaining forwarded symbols resolve against the
  package's 90 exports.

  Also removes the dangling comment in `testing-integration/src/index.ts` that still described the
  removed re-exports — that sentence is why a consumer went on importing a symbol that had moved.

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [099b4d9]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [8f63b57]
- Updated dependencies [5e987a7]
- Updated dependencies [076fa5d]
- Updated dependencies [44fca09]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [35ace7c]
- Updated dependencies [88f8898]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/ai-engine-base@6.1.0-edge.7
  - @memberjunction/aiengine@6.1.0-edge.7
  - @memberjunction/ai-agents@6.1.0-edge.7
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/codegen-lib@6.1.0-edge.7
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/generic-database-provider@6.1.0-edge.7
  - @memberjunction/graphql-dataprovider@6.1.0-edge.7
  - @memberjunction/testing-integration@6.1.0-edge.7
  - @memberjunction/storage@6.1.0-edge.7
  - @memberjunction/content-autotagging@6.1.0-edge.7
  - @memberjunction/search-engine@6.1.0-edge.7
  - @memberjunction/unit-testing@6.1.0-edge.7
  - @memberjunction/testing-engine@6.1.0-edge.7
  - @memberjunction/ai-prompts@6.1.0-edge.7
  - @memberjunction/ai-core-plus@6.1.0-edge.7
  - @memberjunction/open-app-engine@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/ai-agent-harness@6.1.0-edge.7
  - @memberjunction/predictive-studio@6.1.0-edge.7
  - @memberjunction/ai-bridge-base@6.1.0-edge.7
  - @memberjunction/ai-bridge-server@6.1.0-edge.7
  - @memberjunction/api-keys@6.1.0-edge.7
  - @memberjunction/actions-base@6.1.0-edge.7
  - @memberjunction/actions@6.1.0-edge.7
  - @memberjunction/communication-types@6.1.0-edge.7
  - @memberjunction/communication-engine@6.1.0-edge.7
  - @memberjunction/notifications@6.1.0-edge.7
  - @memberjunction/communication-ms-graph@6.1.0-edge.7
  - @memberjunction/communication-sendgrid@6.1.0-edge.7
  - @memberjunction/conversations-runtime@6.1.0-edge.7
  - @memberjunction/queue@6.1.0-edge.7
  - @memberjunction/metadata-sync@6.1.0-edge.7
  - @memberjunction/query-processor@6.1.0-edge.7
  - @memberjunction/record-set-processor@6.1.0-edge.7
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.7
  - @memberjunction/scheduling-engine@6.1.0-edge.7
  - @memberjunction/task-graph@6.1.0-edge.7
  - @memberjunction/templates-base-types@6.1.0-edge.7
  - @memberjunction/templates@6.1.0-edge.7
  - @memberjunction/auth-providers@6.1.0-edge.7
  - @memberjunction/communication-expo-push@6.1.0-edge.7
  - @memberjunction/communication-gmail@6.1.0-edge.7
  - @memberjunction/communication-twilio@6.1.0-edge.7
  - @memberjunction/record-set-processor-base@6.1.0-edge.7
  - @memberjunction/redis-provider@6.1.0-edge.7
  - @memberjunction/predictive-studio-core@6.1.0-edge.7

## 6.1.0-edge.6

### Minor Changes

- 798e015: IT56/PG7: gate self-write compliance on BOTH scripted writes, not just the restricted one.

  `IT: Self-Write Restricted` is prompted to emit `notes.a` (allowed) and `config.b` (restricted) in a single `payloadChangeRequest`. PG7's `runWithCompliance` phase watched only for the restricted half, so a model that emitted `config.b` and dropped `notes.a` passed the compliance gate and then failed the next assertion with `the ALLOWED notes.a self-write did not land — expected "IT-NOTES-OK", got undefined` — a bare value assertion that reads as an engine defect.

  It is not one. Driving the agent directly, a fully compliant response yields `FinalPayload {"notes":{"a":"IT-NOTES-OK"}}` with `config` correctly absent: the allowed path applies and the restricted path is blocked, exactly as designed. The failure was partial model non-compliance that the predicate could not see.

  Requiring both markers makes that case report `model-noncompliance:` like the other eight checks in the bundle instead of accusing the engine.

### Patch Changes

- 512bb53: Security: close the role-elevation path on `MJ: Roles` and `MJ: User Roles` (issue #4282).

  Issue #4260 closed the `User.Type` route to elevated capability. Role assignment is the platform's other authority mechanism and was unguarded: no server-side entity subclass existed for either entity, so `ClassFactory` resolved the generated classes, whose `Validate()` knows nothing about who is calling. On a baseline seed — and verified against a live database — the `Developer` and `Integration` roles hold unfiltered `CanCreate`/`CanUpdate`/`CanDelete` on both entities. Reproduced end to end on the real stack before the fix: a caller whose `Type` is `'User'`, holding only `Developer` and `UI`, inserted a row granting itself `Integration` (`Validate()` passed, `Save()` returned `true`), and separately created a brand-new role.

  **`MJUserRoleEntityServer`** — a non-Owner may only grant, move or revoke a role they themselves hold. That subset rule is a ceiling: whatever a non-Owner does through this entity, the authority they hand out is authority they already had, so no sequence of calls lets a caller exceed their own grant. Delegated administration, IdP/group sync and onboarding automation — the legitimate non-Owner uses `User.Type` does not have — all keep working. On an update the pre-save `RoleID` is checked as well as the new one, so an assignment cannot be repointed to strip someone of a role the caller does not hold. `UserID` is deliberately not frozen: moving a grant between users stays inside the same ceiling. One consequence of that is chosen knowingly rather than incidental — because revocation shares the granting ceiling, a non-Owner may repoint or delete **any** user's assignment of a role the caller also holds, including an Owner's. That is not escalation: Owner authority lives in `User.Type`, which #4260 froze, and not in a role. It does let one non-Owner strip peers of a role they share, which is deprivation rather than elevation — reversible by an Owner and recorded in Record Changes. Narrowing revocation to the caller's own row would close it only by breaking delegated administration, the legitimate non-Owner use this rule exists to preserve.

  **`MJRoleEntityServer`** — a non-Owner may not create, change or delete a role. Every field on this entity is authority-bearing: `Name` is what user/role synchronization matches on, `DirectoryID` maps an external directory group to the role, and `SQLName` decides which database role CodeGen grants object rights to.

  Both guards override `Save()` and `Delete()` alongside `Validate()`, so the rules hold on every write path — GraphQL resolvers, Remote Operations, the Create/Update/Delete Record actions, metadata sync, one-off scripts — and cannot be switched off by the `ReplayOnly` save option, which skips `Validate()` while still performing the write. Both are pure: they read only the record's own field state and the caller's already-cached roles, so they cost nothing per save and are unit-testable without a database.

  **Upgrade notes.**
  - **Explorer's role-management screen stops working for non-Owner administrators.** It has no Owner gate of its own today, so a Developer-role non-Owner reaches it in practice; creating, renaming and deleting roles from it are now refused with a message naming the rule. This is the same trade-off #4260 accepted for the user-management screen.
  - **Explorer's bulk role assignment now checks each `Save()` return.** `executeBulkRoleAssign` enrols each row in a transaction group, where `Save()` reports only _enrolment_ — the provider queues the item locally and returns `true` without a round trip. A row refused **client-side** (a `CheckPermissions` denial or a field-rule failure) does return `false` and is never enrolled; that return was ignored, so an all-refused batch left the group empty, and an empty group's `Submit()` returns `true` for having nothing to do — the screen reported success having assigned nothing. It now collects each such refusal with the user it applies to and surfaces them.

    To be precise about what this does **not** cover: the role-elevation guard added here is server-side only (`@memberjunction/core-entities-server` is not a browser dependency), so it refuses during `Submit()`, not during `Save()` — and that refusal currently reaches the user nowhere at all. `ExecuteTransactionGroup` on the server discards its own `Save()`/`Delete()` return values, so a refused row never enrols in the server's group either; an all-refused batch submits an empty group, whose `Submit()` returns `true` for having nothing to do, and the screen closes with no message. Verified end to end against a live server: a non-Owner assigning a role they do not hold is correctly **refused** — no row is written, the guard works — but is **reported as success**. This is a pre-existing gap in that resolver (it predates this PR and equally affects `MJ: Users` via issue #4260), tracked as issue #4309 and deliberately not closed here.

  - **`AssignUserRolesAction` now fails the whole batch when the caller does not hold the role.** The core action (`CoreActions/src/custom/user-management/assign-user-roles.action.ts`) builds its `MJ: User Roles` object with `params.ContextUser` and assigns atomically, so a refused `Save()` rolls the transaction back and the action returns `Success: false` with `ResultCode: 'FAILED'` carrying the guard's message. Nothing is partially assigned and nothing is swallowed — unlike the transaction-group paths above, this one already reports its refusal. The "onboarding automation" the subset rule preserves is therefore preserved exactly where the automation's context user holds the role being granted: an automation running as a non-Owner that grants roles its own context user does not hold must be given those roles, or an Owner context user.
  - **`SyncRoles` / `SyncUsers` / `SyncRolesAndUsers` are unaffected on a default install** — all three carry `@RequireSystemUser()`, and `getSystemUser()` resolves the seeded `Type='Owner'` system user. A deployment whose system user is **not** an Owner will see those sync paths fail closed at the save, loudly rather than silently, for the same reason #4260 documented.
  - **Not closed by this change:** `MJ: Entity Permissions` carries the same unfiltered `Developer`/`Integration` grant, so a holder of either role can still widen a role's permissions directly. That is an independent route with its own decision to make about the invariant, so it is deliberately out of scope here rather than fixed in passing; this changeset does not claim to close it.

  New unit coverage in MJCoreEntitiesServer (41 tests across both guards, including the pre-fix reproduction) and a new deterministic integration bundle, **IT89 — Role Privilege Elevation Guard** (`role-elevation`, RE1–RE6), which proves the ClassFactory wiring and both guards against a real provider the way IT88 does for `MJ: Users`.

- Updated dependencies [634aa8c]
- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [319a7ed]
- Updated dependencies [2f305df]
- Updated dependencies [197fdf8]
- Updated dependencies [62e0707]
- Updated dependencies [6673f51]
- Updated dependencies [d1d74c2]
- Updated dependencies [0312b22]
- Updated dependencies [f6a4341]
- Updated dependencies [b8c2e33]
- Updated dependencies [d38845a]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [489aecd]
- Updated dependencies [41b0d28]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [ddf8621]
- Updated dependencies [2d14c62]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [eb962a1]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [c679e8d]
- Updated dependencies [a723521]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [328a98d]
- Updated dependencies [a4bb2f7]
- Updated dependencies [770cfca]
- Updated dependencies [ee85060]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [cdd25c0]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [512bb53]
- Updated dependencies [c11f8c6]
- Updated dependencies [1748491]
- Updated dependencies [0db6105]
- Updated dependencies [7fefca2]
- Updated dependencies [cda0187]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [ac96bb6]
  - @memberjunction/ai-core-plus@6.1.0-edge.6
  - @memberjunction/ai-agents@6.1.0-edge.6
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/aiengine@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/codegen-lib@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/metadata-sync@6.1.0-edge.6
  - @memberjunction/actions@6.1.0-edge.6
  - @memberjunction/communication-types@6.1.0-edge.6
  - @memberjunction/communication-ms-graph@6.1.0-edge.6
  - @memberjunction/communication-gmail@6.1.0-edge.6
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.6
  - @memberjunction/generic-database-provider@6.1.0-edge.6
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.6
  - @memberjunction/testing-integration@6.1.0-edge.6
  - @memberjunction/auth-providers@6.1.0-edge.6
  - @memberjunction/graphql-dataprovider@6.1.0-edge.6
  - @memberjunction/open-app-engine@6.1.0-edge.6
  - @memberjunction/record-set-processor@6.1.0-edge.6
  - @memberjunction/record-set-processor-base@6.1.0-edge.6
  - @memberjunction/content-autotagging@6.1.0-edge.6
  - @memberjunction/predictive-studio@6.1.0-edge.6
  - @memberjunction/search-engine@6.1.0-edge.6
  - @memberjunction/ai-agent-harness@6.1.0-edge.6
  - @memberjunction/ai-engine-base@6.1.0-edge.6
  - @memberjunction/ai-prompts@6.1.0-edge.6
  - @memberjunction/conversations-runtime@6.1.0-edge.6
  - @memberjunction/scheduling-engine@6.1.0-edge.6
  - @memberjunction/task-graph@6.1.0-edge.6
  - @memberjunction/templates@6.1.0-edge.6
  - @memberjunction/ai-bridge-server@6.1.0-edge.6
  - @memberjunction/queue@6.1.0-edge.6
  - @memberjunction/ai-bridge-base@6.1.0-edge.6
  - @memberjunction/api-keys@6.1.0-edge.6
  - @memberjunction/actions-base@6.1.0-edge.6
  - @memberjunction/communication-engine@6.1.0-edge.6
  - @memberjunction/notifications@6.1.0-edge.6
  - @memberjunction/communication-sendgrid@6.1.0-edge.6
  - @memberjunction/storage@6.1.0-edge.6
  - @memberjunction/query-processor@6.1.0-edge.6
  - @memberjunction/templates-base-types@6.1.0-edge.6
  - @memberjunction/communication-expo-push@6.1.0-edge.6
  - @memberjunction/communication-twilio@6.1.0-edge.6
  - @memberjunction/redis-provider@6.1.0-edge.6
  - @memberjunction/predictive-studio-core@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- 1a2ce13: Pricing for models that aren't billed by the token, and OpenAI as a second Whisper provider.

  **The problem.** MJ's pricing _schema_ was always general — a cost row names a price unit type, and the unit type names a `DriverClass` the ClassFactory resolves. The _execution layer_ was not: `BasePriceUnitType` took two token counts, only the three token drivers were ever registered, and `MJAIPromptRunEntityServer` refused to cost any run reporting zero tokens. So the three continuous-media unit types that already shipped — `Per Image`, `Per Minute`, `Per Hour` — resolved to nothing, and every run priced by one was silently uncosted. Six ACTIVE image cost rows were in that state. (Bug register B60.)

  Speech-to-text made it concrete: Groq bills Whisper by the audio-hour, the just-landed `GroqAudioGenerator` requested `response_format: 'json'` which discards the duration entirely, and the two Whisper models shipped with no cost rows because there was no honest way to write one.

  **Usage grows a second axis.** `ModelUsage` gains `unitKind` (`'Tokens' | 'Seconds' | 'Characters' | 'Images'`), `inputUnits` and `outputUnits`, plus a `ModelUsage.ForMedia(kind, input, output?)` constructor. Continuous quantities are deliberately _not_ folded into the token fields: a run reporting 90 "tokens" that means 90 minutes corrupts `TokensUsed`, every rollup above it, and every dashboard downstream. `SpeechResult` gains `usage?`, matching `ImageGenerationResult`.

  Quantities are always recorded in the **base** measure, never the billing measure — audio billed per hour is still recorded in seconds, and the driver converts. That is what lets one measured duration be priced against a per-minute row from one vendor and a per-hour row from another.

  **Pricing takes quantities.** `BasePriceUnitType` gains a `UnitKind` getter (defaulting to `'Tokens'`, so external subclasses need no change) and `CalculateCost(activeCost, usage)`, the preferred entry point — its default delegates to the existing cache-aware path, so every current driver behaves identically. `TimePerMinutePriceUnitType`, `TimePerHourPriceUnitType` and `PerImagePriceUnitType` register against the unit types that were already seeded, closing the driver half of B60.

  Each driver also exposes `UnitsPerBillingUnit` — 1,000,000 for a per-million-token rate, 3,600 for per-hour, 1 for per-image — so a divisor exists in exactly one place per driver. `TOKEN_PRICE_UNIT_TYPE_DIVISORS` is _derived_ from the driver instances rather than restated, which makes drift between the exported table and the arithmetic that prices every run impossible instead of merely detectable. The map deliberately covers only the token drivers: a missing key is the signal for a consumer doing token-rate math to SKIP a row priced by audio duration, not to fall back to a per-token divisor.

  `BasePriceUnitType` is marked `@RequiresSubclass()`. `ClassFactory.CreateInstance` has never returned `null` for an unregistered key — it falls back to `new BaseClass(...)` — so `if (!calculator)` was a dead branch that installed a hollow object whose only pricing method is `undefined`, surfacing as a `TypeError` inside cost math rather than "this driver is not registered". The new `UnitKind` default made that hollow instance _more_ convincing, since it answers `'Tokens'` and so passes the measure check before throwing. `GetPriceCalculator` now resolves via `TryCreateInstance` and reports the failure, so its documented `null` return is real.

  `AIEngineBase.CalculateModelCost(modelID, vendorID, usage)` is a new costing surface for callers holding a result but no prompt run — transcription and image actions, downstream apps. It returns `null`, having logged why, when there is no active cost row in the measure the run recorded, no registered driver, or a mismatch between what the run measured and what the row prices. A null means "we don't know what this cost" and must never be read as zero.

  **Cost-row selection is measure-aware.** `GetActiveModelCost` takes an optional `usageKind` and excludes rows priced in any other measure before the most-recently-started tiebreak. Without it the effective key is `(Model, Vendor, ProcessingType)`, which cannot represent a model billing in two measures — per-image output alongside per-token prompt — so which measure you got was a sort-order coin flip that was then refused downstream and reported as a pricing gap. The measure is now established _before_ a row is chosen. Omitting the argument keeps the previous behaviour, and no shipped model+vendor carries two measures today, so nothing changes for existing data.

  **The measure is a first-class row, not a string.** A new `MJ: AI Usage Types` entity (`Tokens`, `Seconds`, `Characters`, `Images`) is what a run and a price unit type point at, so "what does this price buy" is answerable by a join instead of by convention. An earlier revision carried it as `AIPromptRun.UnitsKind NVARCHAR(20)` behind a CHECK constraint, which made the set of measures a property of a constraint on one column: nothing else in the schema could reference a measure, and adding one meant editing a CHECK on a table with nothing to do with pricing.

  Note the usage type and the price unit type answer **different** questions and stay separate: `AIUsageType` is the BASE measure of a quantity, while `AIModelPriceUnitType` is the BILLING unit and its scale. Audio is recorded in `Seconds` and billed `Per Hour`. Collapsing them would force a new usage type per billing granularity.

  **The measure lives on `AIModelPriceUnitType`, and nowhere else.** It gains `UsageTypeID` — so a cost row has exactly one place to look for its measure, reached through its `UnitTypeID`, and the FK there means whatever it finds is a real catalog row rather than a string. `AIModelCost` deliberately carries **no** usage-type column: it would be a second copy of a derivable fact, and nothing would arbitrate a cost row claiming `Seconds` while its unit type says `Tokens` — which is precisely the comparison the safety checks depend on. Single-sourcing makes that contradiction unrepresentable rather than merely unlikely.

  **The divisor becomes data, which closes B60's class rather than its instance.** `AIModelPriceUnitType.UnitsPerBillingUnit` (`CHECK > 0`) holds the number that converts base measure to billed unit — 1,000,000 for per-1M-tokens, 3,600 for per-hour, 1 for per-image. That number previously existed _only_ inside a TypeScript class, and that is the root cause of B60: `Per Image` / `Per Minute` / `Per Hour` were seeded as data by one person while the driver classes were never written by another, and the seam was silent for months. A new `LinearPriceUnitType` (`DriverClass = 'Linear'`) reads both columns off its own row, so a linear billing unit — "Per 1,000 Characters" — now ships as one seeded row with no class, no registration and no build. `DriverClass` remains the escape hatch for genuinely non-linear pricing (tiered rates, per-image-by-resolution, minimum-billing increments like the Groq 10-second floor). An _unregistered_ driver still refuses to price, deliberately: `DriverClass` is NOT NULL, so an unrecognised name is ambiguous between "a new linear unit" and "a non-linear driver whose code is missing", and pricing the second linearly would produce a confident wrong number.

  **`AIModelPriceType` is demoted alongside.** It was a NOT NULL FK that nothing prices, filters or branches on, while `AIModelPriceUnitType` carried the real contract — three vocabularies for one concept, with the _mandatory_ one the one nothing read. Adding a usage type without demoting it would have locked that ambiguity in permanently. Not dropped (NOT NULL, 235 metadata rows, and dropping is on the Forbidden list in `PUBLISH_NO_BREAK_POLICY.md`): the field is flagged `Status = 'Deprecated'`, removed from the generated form (`IncludeInGeneratedForm = 0`, which is the step that actually ends the ambiguity rather than documenting it), and has `AutoUpdateDescription` cleared so CodeGen cannot overwrite the demotion text — all declared in `metadata/entities`, where field-level editorial decisions belong, rather than as EntityField UPDATEs in a migration. The migration keeps only the schema half: a database default of `Tokens`, so new cost rows need not name a value from the vocabulary they are being told to ignore.

  **Prompt runs can record it.** `AIPromptRun` gains `InputUnitsUsed`, `OutputUnitsUsed` (both `CHECK >= 0`) and `UsageTypeID`, where NULL means token-billed — which is what every row written before the column existed IS, since the schema had no way to say anything else. That reading happens at exactly one seam (`MJAIPromptRunEntityServer.RecordedUsage`) rather than in four places, so the rest of the runtime still sees a definite measure. The save-time cost gate passes on units as well as tokens, and refuses — loudly — to price a run whose measure disagrees with its cost row's, rather than dividing seconds by a million and reporting the ~$0 that produces. No units rollup was added: units of different kinds cannot be summed, so cost remains the universal aggregate.

  **The catalog rows are declarative metadata, and that is what makes the new columns nullable.** The four measures live in `metadata/ai-usage-types`, and the measure + divisor for all six shipped billing units in `metadata/ai-model-price-unit-types` — seeded and backfilled by `mj sync push`, not by INSERT and UPDATE statements in the migration, so they are reviewable data in the same form as the rest of the catalog. Metadata is pushed by the release-time consolidated `*__Metadata_Sync.sql`, which by construction carries a later timestamp than any migration a PR can author, so a NOT NULL column defaulted to the Tokens row would fail the from-scratch build on the ADD itself: SQL Server materialises the default into every existing row and the foreign key has nothing to resolve. Nullable + FK is the strongest guarantee available before the seed exists — any non-null value is a real measure — and the runtime is written to that contract rather than around it: a price unit type with no measure refuses to price rather than guessing Tokens. Tightening both `UsageTypeID` columns to NOT NULL is a one-statement follow-up in the release _after_ the one that ships the seed.

  A clean-room bootstrap also found that `sp_updateextendedproperty` throws when the property does not already exist, so the demotion uses drop-then-add — the same fresh-install-only class as the `EntityField.Sequence` trap in `migrations/CLAUDE.md`.

  **`ModelUsageUnitKind` must stay a superset of the `AIUsageType` catalog, and the catalog rows are the source.** `MJAIPromptRunEntityServer` resolves a run's `UsageTypeID` to the catalog row's `Name` and hands that string straight to `ModelUsageUnitKind`. Nothing about that is checked by the compiler — the name arrives as a plain `string` from a database row — so seeding a usage type whose name the union does not carry produces no build error, just a runtime hole on exactly the rows using the new measure. `MODEL_USAGE_UNIT_KINDS` exists so a test can assert the two agree by reading the seed file rather than restating it. `Characters` is present for that reason and has no pricing driver yet, which is not a defect: the costing path refuses to price a measure no driver claims and logs why, which is strictly better than a plausible wrong number. A compile-time assignability pin backs this up (Vitest does not typecheck by default, which is how a narrowing slipped through once).

  **Providers.** Groq now requests `verbose_json` and reports the duration it was already being billed for, summed across split pieces. If any piece fails to report one, usage is left undefined rather than under-reported — a partial sum understates the bill while looking complete. `OpenAIAudioGenerator.SpeechToText` is implemented (it previously threw), with the same 25MB ceiling, the same injected `AudioSplitter`, and the same duration capture. The split-and-join loop moved onto `BaseAudioGenerator.TranscribeWithSplitting` so both providers share one implementation.

  **Cost rows now ship** for Groq Whisper Large v3 ($0.111/audio-hour) and Turbo ($0.04/audio-hour), verified against Groq's published pricing. `Whisper 1` is a **new** model rather than a vendor row on Whisper Large v3: OpenAI's endpoint serves the large-v2 checkpoint, and attaching it to the v3 record would misreport which weights transcribed a given run. It carries a $0.006/minute cost row.

  **Also:** the AC1 integration check flips from warning to hard assert now that every shipped unit type resolves — a future unit type added without a driver reddens the deterministic tier instead of scrolling past. The assert is scoped to unit types an **Active cost row actually references**, since those are the ones whose missing driver silently uncosts real runs; a custom unit type awaiting its driver, referenced by nothing, is reported rather than failed.

  A new **AC7** check is the monitoring counterpart to the whole refusal doctrine. Everything here turns a wrong number into a `NULL`, which is right — but a null plus a `LogError` in a server log is invisible, and that is precisely how B60 survived months with six dormant ACTIVE image cost rows. AC7 asks the question nothing asked: completed runs that did measurable work and carry no cost. It grades the two populations differently — no active cost row in the run's measure is a pricing-coverage gap and is reported; an active cost row in that measure _existing_ while the run is still uncosted means the pipeline had everything it needed and produced nothing, which is asserted.

  The two Explorer cost dashboards no longer carry their own copy of the divisor table. They now resolve a cost row's scale through its unit type's `DriverClass` against the exported `TOKEN_PRICE_UNIT_TYPE_DIVISORS`, and skip rows priced by a non-token unit type rather than defaulting them to the per-1M divisor — which had been dividing an hourly audio rate by a million. Both local tables were keyed by unit-type _display name_ using names (`Per Million Tokens`) that never matched the seeded ones (`Per 1M Tokens`), so every lookup missed and only the per-1M fallback made the numbers come out right; keying off the driver class removes both the miss and the fallback that hid it.

  Pricing also refuses, rather than reporting $0, when a run records continuous units without a resolvable usage type to name their measure — the same "we don't know what this cost" rule the rest of the path follows.

  Both transcription providers request `verbose_json` only for models that accept it. OpenAI's GPT-4o transcription models reject it outright, so they fall back to `json` and report no duration instead of failing the transcription; Groq's STT surface is Whisper-only today, so the guard there is prospective — matched on `includes('whisper')`, because `distil-whisper-large-v3-en` does support `verbose_json` and a `startsWith` test would strip its duration and leave every run through it uncosted. A reported duration of exactly `0` now leaves usage undefined rather than producing a measure with no quantity, which the pricing layer would refuse and log as a fault for genuinely silent audio.

  The PostgreSQL counterpart to the migration is deferred to the release build, per `migrations/CLAUDE.md`.

- b42c125: Two silent failures made loud: the manifest generator's unbuilt-package fallback, and UR13's race with the live routine dispatcher.

  **The manifest generator no longer guesses when a lazy package hasn't been built.** `resolveSubpathExportsDetailed()` resolves a package's lazy-loading subpaths by reading the `.d.ts` each `exports` entry's `types` field names, and skips any it cannot find. On an unbuilt workspace it finds none, returns an empty map, and the package falls through to the whole-package branch of `groupClassesIntoChunks()` — which replaces its per-subpath lazy chunks with one eager chunk. The result is valid TypeScript that compiles and passes review with its code splitting quietly removed. Running `mj codegen manifest` against an unbuilt tree collapsed `ng-dashboards`' twelve per-dashboard chunks into a single import and deleted 254 lines from `lazy-feature-config.ts` without a single warning.

  `resolveLazySubpathExports()` now throws instead, naming the package and the directory it searched.

  The guard is deliberately narrow, because "declares subpaths that didn't resolve" is a much weaker signal than it first appears — two innocent cases produce it:
  - Every ng-packagr output publishes `"./package.json": { "default": "./package.json" }`, an entry with no `types` field that resolution skips by design. Only entries carrying `types` are counted.
  - A subpath whose `.d.ts` declares no classes is skipped exactly like a missing one. `BootstrapLite`'s `./mj-class-registrations` is a real example — a generated manifest of const arrays, built and present, with nothing to reach.

  So the check fires only for a package that actually **contributes lazy classes**, since that is the only case where an empty map mis-groups anything. A package contributing no classes has nothing to lose to the fallback.

  **UR13 no longer races the product it is testing.** The check asserted an exact global run-row count for a routine that the shipped `User Routine Dispatcher` scheduled job — `Status=Active`, per-minute cron — is equally entitled to claim. `ConcurrencyMode=Skip` cannot prevent the overlap: it serialises _scheduled_ runs against each other, while the check constructs a driver in-process against a fabricated `MJScheduledJobEntity` that is never saved, so the engine cannot see it. The scheduler polls on a timer anchored to MJAPI's boot rather than to the wall clock, so whether a sweep lands inside the bundle's ~3-second window varies run to run — which is why this failed on `next` after a slow boot with no relevant code change.

  It now snapshots the run rows before the pass and asserts on the delta, which is strictly stronger than what it replaced:
  - `Details.RoutinesRun === 1` states the no-double-run property directly against _our_ sweep, where it is deterministic, rather than inferring it from a row count anyone may write to.
  - Every new run row must satisfy the OnChange contract, not just the one at index 1 — all of them replay the same expression, so the property has to hold for each regardless of which dispatcher produced it.

  `UR11` and `UR14` share the same exposure and are left alone here; they are not currently failing, and the durable fix for them is a fixture-level decision (pausing the live dispatcher for the bundle) that belongs to the suite's owner.

- Updated dependencies [b1b24d7]
- Updated dependencies [afd6fd6]
- Updated dependencies [c42c0e8]
- Updated dependencies [79483bf]
- Updated dependencies [d735407]
- Updated dependencies [22ec804]
- Updated dependencies [8206993]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [9fe3019]
- Updated dependencies [047a80f]
- Updated dependencies [887ba9c]
- Updated dependencies
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [b42c125]
- Updated dependencies [5f33ca8]
- Updated dependencies [23c2521]
- Updated dependencies [9cbe17f]
- Updated dependencies [8b78695]
- Updated dependencies [5fc861f]
- Updated dependencies [88d751d]
- Updated dependencies [d7feeae]
- Updated dependencies [28cd302]
- Updated dependencies [29c3dc8]
- Updated dependencies [905820a]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/aiengine@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-agents@6.1.0-edge.5
  - @memberjunction/codegen-lib@6.1.0-edge.5
  - @memberjunction/ai-core-plus@6.1.0-edge.5
  - @memberjunction/ai-engine-base@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/ai-prompts@6.1.0-edge.5
  - @memberjunction/open-app-engine@6.1.0-edge.5
  - @memberjunction/storage@6.1.0-edge.5
  - @memberjunction/communication-sendgrid@6.1.0-edge.5
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.5
  - @memberjunction/search-engine@6.1.0-edge.5
  - @memberjunction/conversations-runtime@6.1.0-edge.5
  - @memberjunction/graphql-dataprovider@6.1.0-edge.5
  - @memberjunction/generic-database-provider@6.1.0-edge.5
  - @memberjunction/scheduling-engine@6.1.0-edge.5
  - @memberjunction/metadata-sync@6.1.0-edge.5
  - @memberjunction/ai-agent-harness@6.1.0-edge.5
  - @memberjunction/predictive-studio@6.1.0-edge.5
  - @memberjunction/ai-bridge-server@6.1.0-edge.5
  - @memberjunction/actions@6.1.0-edge.5
  - @memberjunction/communication-ms-graph@6.1.0-edge.5
  - @memberjunction/content-autotagging@6.1.0-edge.5
  - @memberjunction/queue@6.1.0-edge.5
  - @memberjunction/templates@6.1.0-edge.5
  - @memberjunction/record-set-processor@6.1.0-edge.5
  - @memberjunction/task-graph@6.1.0-edge.5
  - @memberjunction/ai-bridge-base@6.1.0-edge.5
  - @memberjunction/api-keys@6.1.0-edge.5
  - @memberjunction/actions-base@6.1.0-edge.5
  - @memberjunction/communication-types@6.1.0-edge.5
  - @memberjunction/communication-engine@6.1.0-edge.5
  - @memberjunction/notifications@6.1.0-edge.5
  - @memberjunction/query-processor@6.1.0-edge.5
  - @memberjunction/templates-base-types@6.1.0-edge.5
  - @memberjunction/testing-integration@6.1.0-edge.5
  - @memberjunction/auth-providers@6.1.0-edge.5
  - @memberjunction/communication-expo-push@6.1.0-edge.5
  - @memberjunction/communication-gmail@6.1.0-edge.5
  - @memberjunction/communication-twilio@6.1.0-edge.5
  - @memberjunction/record-set-processor-base@6.1.0-edge.5
  - @memberjunction/redis-provider@6.1.0-edge.5
  - @memberjunction/predictive-studio-core@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [f5e91a7]
- Updated dependencies [4586215]
- Updated dependencies [8643a3d]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [50860ad]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [6cbed1d]
- Updated dependencies [f4fedab]
- Updated dependencies [7857d8e]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [6b971ab]
- Updated dependencies [0db4f4f]
- Updated dependencies [bae672c]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/ai@6.1.0-edge.4
  - @memberjunction/aiengine@6.1.0-edge.4
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/codegen-lib@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/open-app-engine@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.4
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.4
  - @memberjunction/content-autotagging@6.1.0-edge.4
  - @memberjunction/metadata-sync@6.1.0-edge.4
  - @memberjunction/ai-agent-harness@6.1.0-edge.4
  - @memberjunction/ai-agents@6.1.0-edge.4
  - @memberjunction/ai-engine-base@6.1.0-edge.4
  - @memberjunction/ai-core-plus@6.1.0-edge.4
  - @memberjunction/predictive-studio@6.1.0-edge.4
  - @memberjunction/ai-prompts@6.1.0-edge.4
  - @memberjunction/ai-bridge-server@6.1.0-edge.4
  - @memberjunction/actions@6.1.0-edge.4
  - @memberjunction/communication-ms-graph@6.1.0-edge.4
  - @memberjunction/queue@6.1.0-edge.4
  - @memberjunction/search-engine@6.1.0-edge.4
  - @memberjunction/templates@6.1.0-edge.4
  - @memberjunction/generic-database-provider@6.1.0-edge.4
  - @memberjunction/record-set-processor@6.1.0-edge.4
  - @memberjunction/task-graph@6.1.0-edge.4
  - @memberjunction/ai-bridge-base@6.1.0-edge.4
  - @memberjunction/api-keys@6.1.0-edge.4
  - @memberjunction/actions-base@6.1.0-edge.4
  - @memberjunction/communication-types@6.1.0-edge.4
  - @memberjunction/communication-engine@6.1.0-edge.4
  - @memberjunction/notifications@6.1.0-edge.4
  - @memberjunction/communication-sendgrid@6.1.0-edge.4
  - @memberjunction/conversations-runtime@6.1.0-edge.4
  - @memberjunction/graphql-dataprovider@6.1.0-edge.4
  - @memberjunction/storage@6.1.0-edge.4
  - @memberjunction/query-processor@6.1.0-edge.4
  - @memberjunction/scheduling-engine@6.1.0-edge.4
  - @memberjunction/templates-base-types@6.1.0-edge.4
  - @memberjunction/testing-integration@6.1.0-edge.4
  - @memberjunction/auth-providers@6.1.0-edge.4
  - @memberjunction/communication-expo-push@6.1.0-edge.4
  - @memberjunction/communication-gmail@6.1.0-edge.4
  - @memberjunction/communication-twilio@6.1.0-edge.4
  - @memberjunction/record-set-processor-base@6.1.0-edge.4
  - @memberjunction/redis-provider@6.1.0-edge.4
  - @memberjunction/predictive-studio-core@6.1.0-edge.4

## 6.1.0-edge.3

### Minor Changes

- f5ec13b: Fix the queue engine's terminal-status write, and stop MJAPI's task-graph dispatcher from competing with a test harness.

  **`QueueBase` could never record a task outcome.** `StartTask` discarded the boolean `Save()` return, so the terminal-status write failed silently: the row kept whatever status it held before the run while the in-memory task still reported `Complete`. Underneath it, no role held `CanUpdate` on `MJ: Queue Tasks` or `MJ: Queues`, so CodeGen had never emitted an update grant and `spUpdateQueueTask` carried no `EXECUTE` grant at all. The Developer + Integration CRUD grants are now in `metadata/entity-permissions`, matching every other engine-written entity (`MJ: Tasks`, `MJ: Scheduled Jobs`, `MJ: Action Execution Logs`), with a migration that applies the SQL grants directly — a fresh install runs `migrate` + `sync push` and no CodeGen, so metadata alone would leave the permission correct in Explorer and broken at runtime.

  **`MJ_DISABLE_TASK_GRAPH_DISPATCHER` opts a server out of claiming.** A dispatcher claims from the whole `Task` table rather than from "its own" graphs, so a second dispatcher on the same database is a competitor — correct in production, and wrong for a harness that injects a stub runner and then asserts which tasks its own runner executed. Tasks MJAPI won were executed with the real agent runner and never reached the stub, which the harness read as "never ran". Immediately-eligible root tasks lose that race most often, so it presented as an intermittent failure.

  Also in the integration suite: the RLS fixture now carries the clauses discovery compared (a client-transport check cannot re-derive them and was reporting a cache leak that did not exist), the auth-validation fixtures supply every shipped provider's required config fields, the cache-gauntlet anti-vacuity floors are created rather than assumed, and the task-graph checks wait for the child read-back instead of silently undercounting.

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

- f5ec13b: Move the shared LLM conformance suite out of the runtime `@memberjunction/ai` package, and gate silent skip-growth in the integration registry (review fixes for #3542).

  **Conformance suite relocated to `@memberjunction/unit-testing`.** The shared BaseLLM
  streaming/ChatResult conformance suite and its OpenAI-compatible seam mock previously lived in
  `@memberjunction/ai/src/test-support/` and were consumed through a deep `@memberjunction/ai/dist/test-support/*.js`
  import — reaching past the package's public API into its build output, which resolved only because
  `@memberjunction/ai` has no `exports` map, and which shipped test code plus an optional `vitest`
  peer dependency inside the runtime package. Both files (and the suite's own reference regression
  test) now live in `@memberjunction/unit-testing`, are exported from its index
  (`RunLLMConformanceSuite`, `CreateOpenAICompatibleSeamMock`, and their types), and the eight
  provider conformance suites import them from `@memberjunction/unit-testing`. `@memberjunction/ai`
  no longer ships `dist/test-support/*` and no longer declares the optional `vitest` peer. No runtime
  behavior changes; test-only wiring.

  **Skip-growth is now gated, not just reported.** `check-registry.test.ts` gained a snapshot of the
  exact set of checks that self-skip out of the deterministic lane (every `RequiresMutation` and
  `RequiresLiveModel` check across all bundles). A change that makes a check newly self-skip — or
  silently un-gates one — now fails the unit tests with a paste-ready diff, instead of only shrinking
  the CI step-summary. Also corrected a stale `task-graph-execution` count (26 → 27) in the
  all-bundle coverage-loss guard that had drifted after a `next` merge added TX27.

- c581b4f: Close the #3874 adversarial review. SkipRelatedCollections persists embeds while collections stay with the caller. The graph-node recursion guard is private on BaseEntity (IsGraphNodeSave is gone from EntitySaveOptions). Result serialize adopts saved peers; a rolled-back graph reverts in-memory saved/dirty so retry works. Two same-entity embeds no longer false-cycle. Ensure, Load, NewRecord FK, CodeName emission, core-schema imports, IT85/EE5, graph-view UUID links, focal-node dblclick, and default excludeSchemas no longer dropping core form tabs.
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

- Updated dependencies [834f8d7]
- Updated dependencies [5ef97ff]
- Updated dependencies [d4a5b4c]
- Updated dependencies [f5ec13b]
- Updated dependencies [199eb2b]
- Updated dependencies [f80bdb7]
- Updated dependencies [407f2f7]
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
- Updated dependencies [49f3592]
- Updated dependencies [1fdd5d0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [f5ec13b]
- Updated dependencies [2e2879e]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [2741d46]
- Updated dependencies [b6416f4]
- Updated dependencies [bc45ded]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [d0a2a55]
- Updated dependencies [ae2baef]
- Updated dependencies [4b1257f]
- Updated dependencies [6cd337d]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/aiengine@6.1.0-edge.3
  - @memberjunction/ai-agents@6.1.0-edge.3
  - @memberjunction/scheduling-engine@6.1.0-edge.3
  - @memberjunction/codegen-lib@6.1.0-edge.3
  - @memberjunction/content-autotagging@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/task-graph@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/graphql-dataprovider@6.1.0-edge.3
  - @memberjunction/generic-database-provider@6.1.0-edge.3
  - @memberjunction/ai-prompts@6.1.0-edge.3
  - @memberjunction/metadata-sync@6.1.0-edge.3
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.3
  - @memberjunction/storage@6.1.0-edge.3
  - @memberjunction/api-keys@6.1.0-edge.3
  - @memberjunction/server-bootstrap-lite@6.1.0-edge.3
  - @memberjunction/open-app-engine@6.1.0-edge.3
  - @memberjunction/auth-providers@6.1.0-edge.3
  - @memberjunction/queue@6.1.0-edge.3
  - @memberjunction/testing-integration@6.1.0-edge.3
  - @memberjunction/search-engine@6.1.0-edge.3
  - @memberjunction/ai-agent-harness@6.1.0-edge.3
  - @memberjunction/ai-engine-base@6.1.0-edge.3
  - @memberjunction/predictive-studio@6.1.0-edge.3
  - @memberjunction/ai-bridge-base@6.1.0-edge.3
  - @memberjunction/ai-bridge-server@6.1.0-edge.3
  - @memberjunction/actions-base@6.1.0-edge.3
  - @memberjunction/actions@6.1.0-edge.3
  - @memberjunction/communication-types@6.1.0-edge.3
  - @memberjunction/communication-engine@6.1.0-edge.3
  - @memberjunction/notifications@6.1.0-edge.3
  - @memberjunction/communication-ms-graph@6.1.0-edge.3
  - @memberjunction/communication-expo-push@6.1.0-edge.3
  - @memberjunction/communication-gmail@6.1.0-edge.3
  - @memberjunction/communication-sendgrid@6.1.0-edge.3
  - @memberjunction/communication-twilio@6.1.0-edge.3
  - @memberjunction/conversations-runtime@6.1.0-edge.3
  - @memberjunction/query-processor@6.1.0-edge.3
  - @memberjunction/record-set-processor-base@6.1.0-edge.3
  - @memberjunction/record-set-processor@6.1.0-edge.3
  - @memberjunction/redis-provider@6.1.0-edge.3
  - @memberjunction/templates-base-types@6.1.0-edge.3
  - @memberjunction/templates@6.1.0-edge.3
  - @memberjunction/predictive-studio-core@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- 006fb69: Enforce the #3251 deterministic-suite ordering invariant with a test rather than a convention: every
  server-transport bundle must sequence before every client-transport one, so a client-bundle failure
  is unambiguously a client-seam failure and not fallout from server-transport state left behind
  earlier in the run.

  The rule had already been violated once (IT71 at sequence 34, tied with the first client bundle) and
  went unnoticed until a program wrap-up. Three companion assertions stop the interesting one passing
  vacuously — non-empty membership, a declared transport on every member, and a real sequence on every
  member. Verified by reproducing the original mistake and confirming it fails.

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

- ca4feb4: Workflow cost becomes a projection of the run tree, and a graph now runs in the order it was drawn.

  **Cost is the tree, not arithmetic beside it.** `AIAgentRun`'s four `…Rollup` columns are now written from `SumAgentRunTreeCost(LoadAgentRunTree(runID))` at settlement — one basis (per-node own spend), prompt-aware through `Configuration.runtime.promptRunID`, and structurally incapable of disagreeing with what the run viewer shows. The previous per-child loop filtered on `AgentRunID`, so every Prompt step's spend was absent, and mixed a descendant-inclusive number with an own-spend one. The tree now also carries the prompt/completion token split so all four columns share a basis. Writing the sum back makes the column an _output_ of the tree, which is non-circular only because the query reads own cost and never a rollup — stated in the query header and pinned by a test that plants an absurd rollup on a real run. When the tree cannot be summed (load failure, depth cap, graph not reachable), the columns are **cleared** rather than left holding a stale total from an earlier settlement.

  **A loop's passes exist.** The run tree reaches nested work through six relationships and a loop iteration was none of them, so a `While` that spent real money across three passes reported one childless node with no cost. The dispatcher now records one entry per pass (`ITaskStepRuntime.iterations`) and the tree expands them into nodes. On a real workflow this moved `TotalCostRollup` from `0.00049725` to `0.00555375` — the loop had been spent and not counted.

  **A graph is dispatched only once its edges exist.** Children and dependencies are now written in one transaction. Previously a poll could land between the two writes, see tasks with no prerequisites, and claim the whole graph at once — observed running a closing branch before the draft it was meant to judge existed, then reporting Complete.

  **Steps see their payload.** A step with no input mapping fell back to the raw input instead of the merged payload, so a Prompt step — which declares no mapping by design — rendered `{{ _CURRENT_PAYLOAD }}` as `{}` and wrote from an empty brief. Separately, a step with no output mapping _replaced_ the payload with its own output rather than merging; for a loop, whose output is a summary, that discarded everything the iterations had established and made a downstream `payload.x === true` edge unreachable.

  **An output mapping that names a parameter the step never returns now says so** (`unmapped`), naming what the step did return, instead of skipping in silence.

  **Human steps**: a cancelled request re-raises instead of stalling forever; cancelling a graph withdraws its open requests instead of leaving them in someone's inbox; cross-user `assignToUserID` is refused at submission rather than silently reassigned to the submitter; and a step can declare `expiresInHours`, which finally makes the existing expiry machinery reachable.

  **Web Search** captured each result with a non-greedy match that stopped at the first nested `</div>`, cutting the snippet out of every result — ten well-formed hits carrying no content. Results are now sliced between block starts, and an all-snippets-empty parse is reported rather than returned silently.

  **Testing**: a bundle whose every check is gated out now records an explicit skip naming the flag that would run it, instead of reporting PASS with zero checks executed.

- Updated dependencies [d430fa5]
- Updated dependencies [c49a34a]
- Updated dependencies [71817db]
- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [59def38]
- Updated dependencies [6bb2e1f]
- Updated dependencies [11de1a3]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [aa4fbe9]
- Updated dependencies [9fc0e2d]
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [e26c866]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [82a8585]
- Updated dependencies [d8adda1]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/codegen-lib@6.1.0-edge.2
  - @memberjunction/search-engine@6.1.0-edge.2
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/ai-agents@6.1.0-edge.2
  - @memberjunction/actions-base@6.1.0-edge.2
  - @memberjunction/actions@6.1.0-edge.2
  - @memberjunction/generic-database-provider@6.1.0-edge.2
  - @memberjunction/scheduling-engine@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/task-graph@6.1.0-edge.2
  - @memberjunction/open-app-engine@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/graphql-dataprovider@6.1.0-edge.2
  - @memberjunction/testing-integration@6.1.0-edge.2
  - @memberjunction/ai-engine-base@6.1.0-edge.2
  - @memberjunction/aiengine@6.1.0-edge.2
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.2
  - @memberjunction/metadata-sync@6.1.0-edge.2
  - @memberjunction/notifications@6.1.0-edge.2
  - @memberjunction/ai-agent-harness@6.1.0-edge.2
  - @memberjunction/predictive-studio@6.1.0-edge.2
  - @memberjunction/ai-prompts@6.1.0-edge.2
  - @memberjunction/ai-bridge-base@6.1.0-edge.2
  - @memberjunction/ai-bridge-server@6.1.0-edge.2
  - @memberjunction/api-keys@6.1.0-edge.2
  - @memberjunction/communication-types@6.1.0-edge.2
  - @memberjunction/communication-engine@6.1.0-edge.2
  - @memberjunction/communication-ms-graph@6.1.0-edge.2
  - @memberjunction/communication-sendgrid@6.1.0-edge.2
  - @memberjunction/content-autotagging@6.1.0-edge.2
  - @memberjunction/conversations-runtime@6.1.0-edge.2
  - @memberjunction/query-processor@6.1.0-edge.2
  - @memberjunction/record-set-processor@6.1.0-edge.2
  - @memberjunction/templates-base-types@6.1.0-edge.2
  - @memberjunction/templates@6.1.0-edge.2
  - @memberjunction/communication-expo-push@6.1.0-edge.2
  - @memberjunction/communication-gmail@6.1.0-edge.2
  - @memberjunction/communication-twilio@6.1.0-edge.2
  - @memberjunction/record-set-processor-base@6.1.0-edge.2
  - @memberjunction/predictive-studio-core@6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

- 394d276: **IT74 executes task graphs for real, and fixes the three production bugs that found.**

  IT71 has eighteen checks and not one of them runs a graph — nine assert metadata, nine verify the rows a save produces. Everything past "the rows are correct" was unit-tested against fixtures and never against SQL Server. IT74 stands up a real `TaskGraphDispatcher` with a stub `TaskAgentRunner` injected through its existing seam, so the claim protocol, condition evaluator and rollup all run with no model calls, no tokens and no network.

  **The dispatcher read its own work queue through a stale cache.** `TaskClaimStore` mutates task rows via direct SQL — correct, since the CAS guarantee _is_ the database's atomicity — but direct DML fires no invalidation, and the discovery queries used `RunView` without `BypassCache`. Completions written on the claim path stayed invisible, so `loadGraphState` kept seeing `In Progress` and graphs never rolled up.

  **A graph that succeeded could never settle.** `findActiveGraphIDs` selected graphs by non-terminal _children_, so the moment the last child completed the graph left that set — and the pass that would have rolled the parent up never saw it. Every fully-successful graph stayed `In Progress` forever and its continuation never fired. A _failing_ graph happened to survive, because blocking its dependents left them non-terminal for one more pass, which is why the bug hid behind a passing failure-path test.

  **A not-taken branch ran instead of being skipped.** A definitely-false edge condition was resolved by _dropping_ the edge — which removes the dependent's only prerequisite and makes it eligible in the very next wave, potentially before the node that gated it. The code's own argument against dropping unevaluable edges ("a prerequisite silently disappears and the dependent task runs early") applies verbatim to the false case. Such a dependent is now recorded unreachable and blocked, and only when _every_ route in was cut.

  Also hardened: `ComputeParentRollup` treats an empty child set as Complete-and-terminal, which is right for a childless graph and catastrophic for one whose reload came back empty transiently — it would mark live work finished and fire its continuation. The outer guard covered the first load only.

  `TaskGraphDispatcherConfig.PollIntervalSeconds` is new (default 5, unchanged behavior). The interval was hardcoded; five seconds is right for production, where steps are agent runs, but it made a four-node graph take twenty seconds to observe.

- 394d276: Phase 1 of the unified workflow DAG engine program (plan: PR #3456) — makes the task substrate tell the truth about what actually happened.

  **Payloads become columns.** `Task` gains `InputPayload`, `OutputPayload`, `ErrorMessage`, and `AgentRunID`. Inputs and outputs previously rode inside `Task.Description` behind `__TASK_METADATA__` / `__TASK_OUTPUT__` markers, which leaked orchestration plumbing into search results and the task detail panel. A one-time migration backfill converts existing marker rows into the new columns and strips the markers; there is deliberately **no fallback parse** in code, because a fallback with no backfill never dies. The backfill is conservative — a row whose marker text doesn't parse as JSON is left byte-for-byte intact for inspection rather than silently discarded.

  **Failures propagate instead of stalling.** A `Failed` dependency used to leave its dependents `Pending` forever: they never became eligible, so the graph appeared to finish while work silently never ran — and the parent was marked `Complete` at 100% regardless. Now failure propagates transitively to `Blocked`, and the parent rolls its children up honestly (`Failed` > `Blocked` > `Cancelled` > `Complete`, with progress counting only completed children). Completion notifications fire only for genuinely successful graphs.

  **Bad graphs are rejected before they are persisted.** Dependency cycles are detected at creation (a cyclic graph could previously be saved and then deadlock silently), and a graph naming an unknown agent is now an error rather than being logged-and-skipped — which used to execute the graph with holes where the caller's tasks should have been.

  **Waves run in parallel.** Eligible tasks execute with bounded concurrency (5) rather than one at a time, and each pass loads the graph once instead of issuing a dependency query per candidate task. Stalled graphs — pending work, nothing runnable, nothing in flight — are now detected and logged rather than exiting quietly.

  **The Gantt links the right run.** `Task.AgentRunID` records the specific run that executed each task. The UI previously joined tasks to runs through the shared `ConversationDetailID`, so every sibling task in a graph resolved to the _same_ agent run; the link was wrong for all but one. `Blocked` and `Failed` also now render distinctly instead of inheriting the pending treatment.

  **New pure graph algorithms** in `@memberjunction/ai-core-plus` (`computeEligibleTasks`, `computeTasksToBlock`, `computeParentRollup`, `detectCycle`, `isGraphStalled`, `findUnknownDependencyRefs`) — dependency-free, operating on plain shapes rather than entities, with 44 unit tests. Phase 2's durable dispatcher consumes these unchanged rather than reimplementing eligibility and propagation.

  **Also:** dispatcher claim columns (`ClaimedBy`, `ClaimExpiresAt`) and their supporting indexes land now so Phase 2 adds the dispatcher without further schema churn — nothing reads them yet. `AIAgentRunStep.StepType` gains `TaskGraph`. New deterministic integration bundle `task-graph-orchestration` (TG1–TG4) covering cycle rejection, unknown-agent rejection, payload columns, and the new schema's presence in generated metadata.

- 394d276: Phase 2 of the unified workflow DAG engine program (plan: PR #3456) — task-graph execution moves server-side and becomes invocation-agnostic.

  **New package `@memberjunction/task-graph`.** Deliberately not AI-prefixed (D11): an LLM, deterministic code, or a human UI can all construct and submit a DAG. It contains `TaskGraphSpec` (the one fully-qualified contract every producer authors against, D16), a pure validator, `TaskGraphService` (submission), `TaskClaimStore` (the CAS claim protocol), and `TaskGraphDispatcher` (durable execution). Graph _semantics_ stay in the Phase 1 pure algorithms in `ai-core-plus` — eligibility, failure propagation, parent rollup and stall detection are consumed unchanged, so the in-run and durable executors cannot drift apart.

  **Submission is split from execution (D2).** `TaskGraphService.Submit` validates, resolves agents, persists parent + children + edges, and returns. Nothing waits for the work. That is what makes every channel equal (D1).

  **BREAKING: `ExecuteTaskGraph` is removed (D12).** It awaited an entire multi-step workflow inside one long-lived GraphQL request, so a page reload lost the awaited promise, a server restart orphaned every in-flight task, and no channel but Explorer could reach the substrate. Replaced by `SubmitTaskGraph`, `CancelTaskGraph`, and `RetryTask`. Accepted deliberately in the open v6 window; its sole known caller — the Explorer conversation client — becomes an observer in this same change.

  **The durable dispatcher.** A compare-and-swap claim protocol over `ClaimedBy`/`ClaimExpiresAt` (the columns Phase 1 landed): claiming is a single guarded `UPDATE ... WHERE Status='Pending'` whose rowcount decides the winner, so two instances never run the same task without a distributed lock manager. Long tasks heartbeat to extend their claim; startup and periodic reconciliation return expired claims to `Pending`, which is what turns a crash from "work stranded forever" into "work resumes". Per D20 _every_ state transition is guarded on `ClaimedBy=@me`, not just the initial claim, because `MJ: Tasks` stays user-writable — a stale executor's completion write fails cleanly instead of double-completing. Human tasks are exempt from reclamation: a task parked on a person legitimately has no claim, and reclaiming it would reset an approval out from under the user.

  **Server-side detection at three seams.** Task graphs emitted in an agent's payload are now detected and submitted from the MJServer run path, `BaseMessagingAdapter` (ahead of the existing text-regex delegation, since a structured graph is unambiguous), and the Scheduling drivers. Previously only the Explorer client looked, so **Slack/Teams and scheduled routines silently dropped every graph an agent emitted** — the plan's core verified gap. The detection shim is explicitly temporary and dies in Phase 3 when `Tasks` becomes a typed `nextStep`.

  **Provider isolation.** The dispatcher mints a fresh provider per task via an injected `ProviderFactory`, so parallel tasks never share a transaction scope. MJServer supplies the implementation, keeping the dependency MJServer → task-graph and never the reverse.

  **Also:** 18 new unit tests for the validator; integration bundle grows with the three seam checks deferred from Phase 1 (cycle rejection, unknown-agent rejection, payload columns), now targeting `TaskGraphService`'s public API.

- 394d276: Phase 3 of the unified workflow DAG engine program (plan: PR #3456) — durable task graphs become a first-class agent primitive.

  **`'Tasks'` joins the Loop response union.** An opted-in agent emits `nextStep.type = 'Tasks'` with a `TaskGraphSpec` and the framework does the rest. The distinction from `subAgents[]` is durability, not parallelism: `subAgents[]` is ephemeral fan-out that blocks the run and dies with it, while a task graph becomes real Task rows a server-side dispatcher owns — visible in the Tasks UI, resumable after a restart, able to wait on a human.

  **The capability is gated, and the gate is enforced rather than advisory.** `enableTaskGraphs` defaults to **false**, unlike every other Loop prompt parameter. The others only shape the prompt — turning one off saves tokens and an agent that emits the feature anyway still works. This one governs whether an agent may create durable rows that outlive its run, execute on a dispatcher under the submitting user, and spawn further agent runs. So beyond omitting the type from the prompt, `LoopAgentType` _rejects_ a `'Tasks'` step from a disabled agent with a corrective that steers it back to Sub-Agent/Actions. The gate fails closed: an absent flag, an absent params bag, and the string `"true"` are all refusals.

  This matters more than it looks, because `HarnessAgentType extends LoopAgentType` and intentionally inherits `DetermineNextStep` — so the primitive reaches external agent harnesses (Claude Code / Codex / Pi running inside MJ) the moment it reaches Loop agents. That inheritance is the design working, but it moves the gate from a nice property of one class to the thing standing between a sandboxed external CLI and durable server-side work. It is therefore tested through the harness path, with the inheritance itself pinned so a later override cannot silently move those assertions onto a different code path.

  **`TaskGraphSpec` and its validator move to `@memberjunction/ai-core-plus`,** next to the pure graph algorithms they belong with. That is what lets the agent framework validate a graph without depending on the durable-execution package — which would otherwise drag the entity layer and the dispatcher into every context that merely runs an agent, including unit tests with no database. The Loop type validates against the identical contract the server re-validates at submission (D16), so a graph cannot pass one check and fail a different one later.

  **Single-node constant folding (D9), recorded rather than silent.** A one-node graph with no edges, an agent assignee and default continuation is rewritten into an ordinary in-run sub-agent call — don't spin up loop machinery for a loop of one. The `TaskGraph` run step is written either way, carrying the spec, a `folded` flag and the reason. Three consequences: run forensics show why a graph did or didn't reach the dispatcher; a user who edits a two-node graph down to one can read the durability change off the run record instead of inferring it; and Save as Workflow (D17) attaches to the recorded spec, so the single-node case — the shape most likely worth promoting — stays promotable. `durable: true` opts back into a Task row.

  **Submission crosses a registered seam.** `TaskGraphSubmitter` is declared in `ai-core-plus` and implemented in `@memberjunction/task-graph`, resolved through the ClassFactory. A host with no durable-execution package gets `null` and the agent reports an honest failure — what must never happen is a graph vanishing quietly while the model believes it scheduled work.

  **Continuation contract.** The parent Task row durably carries `continuation`, `reinvokeDepth` and the delivery marker, because the dispatcher instance that finishes a graph is routinely not the one that accepted it. Delivery marks _before_ it acts: the worst case becomes a missed notification visible in the task record rather than a notification repeated on every reconciliation sweep forever — which, for `reinvoke`, would be an unbounded agent-run loop. Chains are capped at 5 hops, bounded separately from task-nesting depth because they are different loops; at the cap the mode degrades to `message` so results still reach the user. `'reinvoke'` itself is not wired here — it would invert the dependency to task-graph → ai-agents — and lands in Phase 4 where the dispatcher already holds an execution engine.

  **Sage and the Workflow Planner stop payload-smuggling.** Both prompts move from `payloadChangeRequest.newElements.taskGraph` to the real `nextStep`, and the temporary server-side payload sniff introduced in Phase 2 is deleted along with its messaging and scheduling call sites — the primitive submits inside the run, so channel seams no longer need to look.

  **Launch opt-ins (D3):** Sage, Workflow Planner, Query Builder, and the Research Agent with its four sub-agents. Workflow Planner is not on the plan's opt-in list, but emitting task graphs is that agent's entire job, so leaving it gated would have broken it outright.

  **Coverage:** 43 new unit tests (18 Loop, 5 harness, 20 continuation-metadata) and a new integration check, TG8, asserting both directions the metadata gate can be wrong — an opt-in that was never pushed leaves an agent unable to delegate at all, and a Loop _type_ default left on would hand durable reach to every Loop agent in the install at once. IT71 runs 8/8.

- 394d276: Phase 4 of the unified workflow DAG engine program (plan: PR #3456) — convergence. Design-time flows and runtime task graphs stop being two graph models and become one.

  **One traversal engine, `GraphTraversalEngine`.** Flow agents and task graphs were always the same shape — nodes, conditional edges, joins — reached from opposite directions. `FlowAgentType` did not merely have its own copy of the traversal rules; it had **four**, written out separately for the post-prompt, post-action, initial-step and skip-recursion paths. They had already drifted: the skip recursion omits the inactive-destination fallback the other three have, so a skipped node routed differently from a normal one for reasons nobody chose. Both executors now consume one dependency-free engine — graph storage arrives through a synchronous repository seam, condition evaluation through an injected evaluator — so the in-run and durable executors keep completely different state backends while sharing one definition of the rules.

  **Four behaviors deliberately changed, each pinned by a named test** so a future "restore parity" pass has to argue with a test rather than quietly undo a fix:
  1. **Fan-out follows every satisfied edge.** The old code fetched the full edge list and then indexed `[0]`, silently discarding the rest — a genuine fan-out ran one branch and dropped the others with no diagnostic.
  2. **A missing destination is a rejection, not a fatal error.** Previously an _inactive_ destination fell through to the next alternate while a _dangling_ one failed the graph outright. A data problem should not be more fatal than a deliberately disabled step.
  3. **A condition that throws is distinguishable from one that evaluated false.** Both still refuse the edge — a malformed expression must never become an accidental `true` — but a graph stalled by a typo no longer looks identical to one that finished normally.
  4. **Results are addressed by node id.** The old lookup read the tail of the execution path, which was deduped on revisit, so a condition on a loop-back edge silently read a _different_ node's output.

  Also not ported: the `Priority <= 0` fallback branch, which was unreachable. Unconditional edges are collected in the main pass, so it could only run when every edge had a condition — in which case it matched nothing. Fallbacks work, and always did, via an unconditional low-priority edge.

  **Frontier, joins and concurrency.** `TraversalState` tracks a set of active nodes rather than a single program counter. AND-joins (matching `Prerequisite`) are the default and OR-joins map to `Optional` — which is _why_ the two models converge: "wait for every predecessor" is the same rule in both. A predecessor that failed, or that can no longer be reached, counts as settled rather than pending, so an AND-join behind an untaken branch cannot deadlock.

  **Flow gets a params bag.** `traversalMode` defaults to `'sequential'`, and that default is load-bearing: existing flows have fan-out shapes drawn in the editor that have never actually run in parallel, and flipping the default would start executing branches their authors have never seen run. Graphs built from a `TaskGraphSpec` always run parallel regardless.

  **Conditional edges for durable graphs** (migration: `TaskDependency.Condition`, NULL = unconditional, so no existing graph changes meaning). Same column shape and same grammar as `AIAgentStepPath.Condition` — deliberately, because if the two needed different storage then Save as Workflow would need a translation layer and the models had not really converged. The dispatcher resolves conditions by _dropping_ edges rather than adding a second rule to eligibility, which keeps one definition of "ready". One asymmetry is intentional: where the flow executor skips an edge whose condition cannot be evaluated, the dispatcher **keeps** it — there, dropping a prerequisite would run a dependent task early, turning a typo into out-of-order execution, whereas keeping it stalls the graph visibly.

  **Human tasks are announced.** A human task becoming eligible is the moment its assignee can finally act, and nothing else in the system knew that moment had arrived — the task sat `Pending` behind prerequisites and no save touched it when they cleared. Without a notification the workflow simply stopped, waiting on someone who was never told. The dispatcher now sends one through `NotificationEngine` (new metadata-seeded `Task Assignment` type) exactly once, marked durably so a restart cannot resend. Assignment stays self-only until the authorization model in #3524 lands.

  **`continuation: 'reinvoke'` is now delivered**, via a `TaskContinuationDeliverer` seam. Deferred out of Phase 3 because implementing it inside the dispatcher would have inverted the dependency to task-graph → ai-agents; the seam keeps the direction correct, and a host that cannot start agent turns degrades to a message rather than dropping the outcome of work that genuinely ran.

  **Save as Workflow (D17)** — `ConvertTaskGraphToAgentSpec` projects a runtime graph onto a Flow `AgentSpec`. That it is a projection and not a translation is the empirical test of whether the convergence was real. The one inversion: `dependsOn` points backwards, a flow path points forwards. Losses are **returned, never swallowed** — a conversion that quietly dropped a human approval step would hand someone a workflow that skips an approval they believed they had saved.

  **`TaskOrchestrator` retired.** Phase 2 orphaned it; it had zero callers and was not even exported.

  **Coverage:** 47 new unit tests (29 traversal engine, 18 converter) plus integration checks TG9 (conditional edges round-trip) and TG10 (the notification type is seeded). IT71 runs 10/10.

  Two latent test failures fixed along the way, both of which were hiding: `flow-agent-type.test.ts` (18 parity tests) stopped collecting once the adapters pulled `core-entities` into its module graph, and IT71 had a metadata record but was **never joined to the integration suite**, so it would not have run in the deterministic tier at all.

- 394d276: Phase 7 of the unified workflow DAG engine program (plan: PR #3456) — Track D, the trigger layer. Everything here closes a gap where something _claimed_ to work and did not.

  **Entity-change triggers only bind where an agent can safely run.** A `WorkflowSpec` trigger passed its `invocationType` straight through, and `Validate` / `BeforeCreate` / `BeforeUpdate` / `BeforeDelete` are real invocation names — so a workflow could bind an unbounded agent run _inside_ a user's save, in the held transaction, with the power to abort it. Validation now refuses anything but the `After*` forms, and the shorthand an author writes (`Update`) resolves to `AfterUpdate` rather than drifting from the name the platform actually fires. That drift was live: the contract documented `Create | Update | Delete`, none of which the platform matches, so the first trigger ever saved through it failed to resolve.

  **Trigger scope stopped being decorative.** `scopeEntityName` / `scopeRecordID` were declared, documented, accepted by validation — and then referenced nowhere in reconciliation. A workflow the author scoped to one record fired on _every_ record of the entity while the UI showed it as scoped. They now reconcile onto the binding's own `ScopeEntityID` / `ScopeRecordID`, which the engine's scope resolver already honored. `filter` is **refused** rather than accepted-and-ignored: narrowing by predicate needs the before/after values of a change, a contract that does not exist yet, and a workflow runs an agent — over-firing costs real money. Accepting it later is additive; the reverse would break specs already published against it.

  **An entity may bind the same action more than once (`UQ_EntityAction_ActionID_EntityID` dropped).** The v5.37.x junction sweep added that constraint under a stated scope of _"pure junction tables — two foreign-key columns plus ID/Sequence/timestamps, with no other meaningful data columns."_ `EntityAction` never met it: even then it carried `Status`, `Sequence` and `LoggingMode` and owned three child collections. Three months later #3408 added `ScopeEntityID`/`ScopeRecordID` so a binding could attach to "this Deal Type" — a feature the constraint makes unusable, since one binding per (entity, action) means one scope, so "every Deal" and "this Deal Type" cannot coexist. It also forced a single param set, filter set and scope to be shared across _every_ event an action responds to, making "on create run agent X, on update run agent Y" unexpressible. `V202608080100__v6.1.x__Drop_EntityAction_Uniqueness` removes it with no replacement; a narrower index would still refuse two unscoped bindings differing only by invocation type. Nothing in the runtime assumed uniqueness — every accessor already returns a collection and `HandleEntityActions` already iterates — so this is schema-only. Each workflow now owns its own binding, matched on the agent it dispatches to plus its scope; reusing a shared row would have rewritten `AgentID` and silently repointed one workflow's trigger at another's agent.

  **A self-trigger guard, because enrich-and-write-back is the normal shape.** "When a ticket changes, summarize it and store the summary" saves the ticket, which re-fires the action, forever. `EntityActionDispatchGuard` keys every automatic dispatch by `(entity action, entity, record)` and tracks origin through the async call tree with `AsyncLocalStorage`, so re-entry is detected however deep inside an agent run the write-back happens — no call site threads anything. Re-entry is **suppressed**, not deferred: queuing it would turn an infinite loop into an infinite sequence. A merely _overlapping_ save is a different problem with the same key, so it **coalesces** — latest wins, one pending rerun, and a burst of ten saves collapses to two runs instead of ten. Only after-hooks are guarded; `Validate` and `Before*` participate in the save and must neither be skipped nor deferred. Work that has detached from the async context (a durable task graph, a queued job) declares its origin explicitly through the new `EntitySaveOptions.OriginatingEntityActionIDs`.

  **Scheduled-job notifications actually send.** `NotificationManager` logged `"Would send notification to user …"` while `NotificationEngine` sat one package away. It now delivers for real, and composes the two people who have a say: the job's `NotifyViaEmail` / `NotifyViaInApp` toggles are a **ceiling**, the recipient's preferences decide within it. Neither existing knob expressed that — `forceDeliveryChannels` would let a job override a recipient's opt-out, and omitting the toggles would let a type default fire a channel the job never asked for. `SendNotificationParams.allowedDeliveryChannels` is the new primitive; it can only subtract, which is what makes it safe to expose.

  **"Execute Scheduled Job Now" runs the job.** It used to insert a `Status='Running'` run row and report success. Nothing consumed those rows — the poller selects jobs by _schedule_, never by pending run record — so the action left a row that said Running forever and ran nothing. It now executes through `SchedulingEngine`, and a failed job is a failed action rather than a successful insert. `Wait=false` starts it without blocking.

  **The dispatcher has somewhere to deliver.** `StartTaskGraphDispatcher` constructed it with no continuation deliverer at all, so a finished graph logged its outcome, marked itself delivered, and said nothing to the conversation that asked for it. `TaskGraphContinuationDeliverer` posts the roll-up with per-step detail. `Reinvoke` stays unimplemented on purpose: a safe one needs the new agent run to remember it was a continuation at depth N so `MAX_REINVOKE_DEPTH` can stop the chain, and nothing durable records that — a cap that never trips is worse than degrading to a message.

  **IT71 grows to 16 checks.** TG14 drives the save-to-binding round trip that Phase 6 owed; TG15 pins that a scoped trigger actually narrows; TG16 pins that two workflows on one entity keep separate bindings pointing at their own agents, and that re-saving finds its own row rather than adding a third. TG14 caught a second real bug on its first run — the invocation-type mismatch above — and TG16 is what surfaced the unique constraint.

- 394d276: Phase 8 of the unified workflow DAG engine program (plan: PR #3456) — the remaining Track D mechanisms, plus the observability decision that had been open across three reviews.

  **A live signal from the dispatcher.** The choice was between claim-store cache invalidation and semantic frames; frames won because a consumer should render "step 3 of 7 running" from the event itself rather than re-reading Task rows and diffing them to guess what changed. `TaskGraphObserver` emits `TaskStarted` / `TaskCompleted` / `TaskFailed` / `TaskBlocked` / `TaskAwaitingHuman` / `GraphSettled`, and MJServer publishes them on a new `taskGraphFrames(parentTaskId)` subscription.

  Addressed by **`ParentTaskID`, deliberately not by session**: a durable graph outlives the tab that submitted it and may be started by a schedule with no session at all, so keying on the graph means "watch this workflow run" works for whoever is permitted to see it, whenever they arrive — including after a refresh, which a session-keyed push cannot survive. Emit points sit where the fact is already true: `TaskStarted` after the claim is held, `Task{Completed,Failed}` only once the guarded write lands, `GraphSettled` outside the continuation's once-only CAS. The observer is optional and its errors are swallowed in one place, because a frame is commentary on work and must never stall or fail a graph.

  Delivery **fails closed**. A `parentTaskId` is discoverable, so without a connection-identity check anyone holding one could watch another user's workflow, per-step error messages included. Ownership rides on the frame — resolved once per graph and memoized, since a subscription filter runs per frame and synchronously, and a database round trip there would make watching a run cost more than running it. It lives in the parent's durable metadata rather than a column because `Task.UserID` already means "the person this task waits on"; setting it on a parent would make every graph look like a human task.

  **`MAX_REINVOKE_DEPTH` finally compares against a real number.** Phase 3 shipped the cap and Phase 4 shipped the metadata carrying `reinvokeDepth`, but the value was permanently zero: `Submit` reads it from its caller, `BaseAgent` never passed one, and a reinvoked agent had no way to know it _was_ a continuation. Phase 7 therefore left `Reinvoke` unimplemented on purpose — a cap that never fires is worse than one continuation mode being unavailable, because the failure mode is an unbounded chain of real agent runs. `AIAgentRun.ContinuationDepth` closes the loop: the deliverer stamps depth + 1 on the run it starts, `BaseAgent` passes its own run's depth into any graph it submits, and the chain is bounded. `Reinvoke` degrades to posting whenever it cannot restart a turn (no submitting run, run or agent unloadable) and never throws, since the dispatcher calls it inside the delivery CAS.

  **Scheduled jobs answer what to do about fire times they missed.** `MissedRunPolicy` — `RunOnce` (default), `RunAll`, `Skip`. The default is not a preference: `updateJobStatistics` already computed the next run from _now_, so a job whose `NextRunAt` had passed ran once and jumped forward. That is `RunOnce`, and defaulting to `Skip` would have silently stopped every existing job in every install from catching up. `RunAll` is safe to offer because its next run is computed from the occurrence just consumed, so a week-long outage walks one occurrence per poll tick rather than firing 168 jobs at once. "Missed" is defined cron-relatively — a _later_ occurrence has also come due — rather than by a grace window, which would misjudge a per-minute job after a short pause and a monthly job that is a week late in opposite directions.

  The decision **fails open** throughout: it can only ever withhold a run the schedule already said was due, so an unparseable cron or a helper returning anything but a date lets the job through. And it is **synchronous** on purpose — it runs immediately before lock acquisition, where an added microtask reorders against the sweep's fire-and-forget cleanup; only the skip branch writes, and that is awaited separately.

  **One-shot scheduling needed no new schedule shape.** `Status='Expired'` had been a declared value that nothing ever set. `isJobDue` already refused a job past its `EndAt`, so such a job stopped running on its own — but stayed `Active` forever, permanently inert, and kept driving `UpdatePollingInterval`, so "cron at T plus `EndAt` just after T" left the whole scheduler polling at that job's cadence for a job that would never run again. Retiring it is the fix; "run once at T" was already expressible. Deliberately narrow: only `Active`/`Pending` transition, because a `Paused` job was put there by a person, and only `EndAt` triggers it, since a cron always has a next occurrence and inferring exhaustion would be guessing.

  **IT71 grows to 18.** TG17 asserts the new schema through the ORM rather than trusting the migration — the pair that drifted in Phase 4 when a migration applied but CodeGen ran against a stale definition. TG18 saves a job with `RunAll`, reloads it to prove the value survives the CHECK constraint, and saves a policy-less job to prove the `RunOnce` default.

- 394d276: Phase 6 (Track E) — **`WorkflowSpec`: one object binding WHAT runs to WHEN it runs.**

  `TaskGraphSpec` answered _what_ a workflow does; the scheduling and entity-action substrates answered _when_ something fires. Nothing expressed both at once, so "a workflow" was not a thing anyone could hand over — it was a graph plus a separately-configured trigger that only a human knew were related.

  **`graph` is `TaskGraphSpec` verbatim, not a copy.** That is why this composes rather than translates: a graph authored on the canvas, emitted by an agent, or promoted from a past run is _already_ this shape. A parallel graph type would have re-created the drift Phase 4 spent itself removing.

  **No new storage, and that is the design.** There is no `Workflow` table. A workflow's WHAT is a Flow agent; its WHEN is a Scheduled Job. `WorkflowSpecSync` **reconciles** those, following the pattern `MJRecordProcessEntityServer.Save()` already proved — resolve the type, find the rows this definition owns, upsert or disable. Inventing a `Workflow` row would create a second definition of "a scheduled thing" and give the scheduler two masters that can disagree.

  Rows are owned by a marker inside their own `Configuration`, not by name, so **renaming a workflow cannot orphan its schedule** and leave a second one firing beside the new row. A trigger the spec no longer names is **disabled, not deleted** — the row carries run counts, last-run and next-run, which are the only record it ever fired.

  **Order is load-bearing.** The agent persists _before_ triggers reconcile, because a Scheduled Job needs its ID to point at. Reversed, you get a job referencing an agent that does not exist — a schedule that fires forever and does nothing, with no error anyone sees. Validation runs before either, so a rejected save leaves no orphan agent behind.

  **Two operations, because drafting and committing are different acts.** `Workflow.Validate` writes nothing, so an agent can iterate a draft before anything reaches the scheduler — the draft-then-confirm shape dry-run and Plan Mode established. `Workflow.Save` commits. Both run the identical validator, so a workflow that validates cannot be rejected on save for a different reason. Together they close the "agents cannot schedule anything" hole: today `Create Scheduled Job` cannot even set `Configuration`.

  **Agent persistence crosses a seam.** `AgentSpecSync` is the one place that writes an agent; importing it into the execution substrate would invert the dependency, so the host registers a writer instead. A host without one gets an honest failure rather than a half-saved workflow. The writer reuses Phase 4's `ConvertTaskGraphToAgentSpec` unchanged — "save a runtime graph as a workflow" and "persist a workflow's graph" turn out to be the same operation, which is the practical payoff of the convergence.

  **A discovery worth recording:** `AgentScheduledJobDriver` has existed since the scheduling engine shipped, and `ScheduledJobType.DriverClass` is UNIQUE — so the `Agent` job type was already seeded. The substrate for scheduling an agent was there all along; only the authoring surface was missing. TG12 now pins that seed, because without it a scheduled workflow throws at the moment a user is least able to interpret it.

  **Draft is the default status**, not Active. Every authoring surface — the canvas, a chat card, an agent's MCP call — produces something the author has not yet watched run against real data.

  **Entity-change triggers reconcile too.** My first pass deferred these to Track D on the belief that entity-action invocation was not wired. AN-BC challenged that and was right: `HandleEntityActions` has fired entity actions from the save pipeline all along — validate, before/after save, before/after delete — and `Execute Agent` exists as the dispatch target, written for exactly this. Nothing was missing but the **binding row**. `WorkflowSpecSync` now creates the three rows that express "when an Invoice is updated, run Execute Agent with this agent": the `EntityAction`, the `EntityActionInvocation`, and an `EntityActionParam` carrying the agent. Idempotent by lookup rather than delete-and-recreate, because re-saving a workflow must not detach and re-attach a live trigger — a change landing in that window would be missed.

  40 new unit tests (29 validator, 11 sync) plus integration checks TG11 and TG12. IT71 runs 12/12.

### Patch Changes

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
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.1
  - @memberjunction/ai-agent-harness@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ai-agents@6.1.0-edge.1
  - @memberjunction/open-app-engine@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/task-graph@6.1.0-edge.1
  - @memberjunction/graphql-dataprovider@6.1.0-edge.1
  - @memberjunction/scheduling-engine@6.1.0-edge.1
  - @memberjunction/notifications@6.1.0-edge.1
  - @memberjunction/content-autotagging@6.1.0-edge.1
  - @memberjunction/predictive-studio@6.1.0-edge.1
  - @memberjunction/codegen-lib@6.1.0-edge.1
  - @memberjunction/record-set-processor@6.1.0-edge.1
  - @memberjunction/aiengine@6.1.0-edge.1
  - @memberjunction/search-engine@6.1.0-edge.1
  - @memberjunction/ai-engine-base@6.1.0-edge.1
  - @memberjunction/ai-prompts@6.1.0-edge.1
  - @memberjunction/ai-bridge-base@6.1.0-edge.1
  - @memberjunction/ai-bridge-server@6.1.0-edge.1
  - @memberjunction/api-keys@6.1.0-edge.1
  - @memberjunction/actions-base@6.1.0-edge.1
  - @memberjunction/communication-types@6.1.0-edge.1
  - @memberjunction/communication-engine@6.1.0-edge.1
  - @memberjunction/communication-ms-graph@6.1.0-edge.1
  - @memberjunction/communication-expo-push@6.1.0-edge.1
  - @memberjunction/communication-gmail@6.1.0-edge.1
  - @memberjunction/communication-sendgrid@6.1.0-edge.1
  - @memberjunction/communication-twilio@6.1.0-edge.1
  - @memberjunction/conversations-runtime@6.1.0-edge.1
  - @memberjunction/metadata-sync@6.1.0-edge.1
  - @memberjunction/query-processor@6.1.0-edge.1
  - @memberjunction/record-set-processor-base@6.1.0-edge.1
  - @memberjunction/templates-base-types@6.1.0-edge.1
  - @memberjunction/templates@6.1.0-edge.1
  - @memberjunction/testing-integration@6.1.0-edge.1
  - @memberjunction/ai@6.1.0-edge.1
  - @memberjunction/predictive-studio-core@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [e4a6fa3]
- Updated dependencies [cd520e2]
- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [fe7bd9d]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [0acf96e]
- Updated dependencies [8d0d45a]
- Updated dependencies [1100077]
- Updated dependencies [e76b195]
  - @memberjunction/api-keys@6.1.0-edge.0
  - @memberjunction/codegen-lib@6.1.0-edge.0
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/actions@6.1.0-edge.0
  - @memberjunction/actions-base@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.0
  - @memberjunction/search-engine@6.1.0-edge.0
  - @memberjunction/testing-integration@6.1.0-edge.0
  - @memberjunction/aiengine@6.1.0-edge.0
  - @memberjunction/ai-agents@6.1.0-edge.0
  - @memberjunction/ai-engine-base@6.1.0-edge.0
  - @memberjunction/ai-core-plus@6.1.0-edge.0
  - @memberjunction/predictive-studio@6.1.0-edge.0
  - @memberjunction/ai-prompts@6.1.0-edge.0
  - @memberjunction/ai-bridge-base@6.1.0-edge.0
  - @memberjunction/ai-bridge-server@6.1.0-edge.0
  - @memberjunction/communication-types@6.1.0-edge.0
  - @memberjunction/communication-engine@6.1.0-edge.0
  - @memberjunction/notifications@6.1.0-edge.0
  - @memberjunction/communication-ms-graph@6.1.0-edge.0
  - @memberjunction/communication-sendgrid@6.1.0-edge.0
  - @memberjunction/content-autotagging@6.1.0-edge.0
  - @memberjunction/conversations-runtime@6.1.0-edge.0
  - @memberjunction/graphql-dataprovider@6.1.0-edge.0
  - @memberjunction/metadata-sync@6.1.0-edge.0
  - @memberjunction/open-app-engine@6.1.0-edge.0
  - @memberjunction/query-processor@6.1.0-edge.0
  - @memberjunction/record-set-processor@6.1.0-edge.0
  - @memberjunction/scheduling-engine@6.1.0-edge.0
  - @memberjunction/templates-base-types@6.1.0-edge.0
  - @memberjunction/templates@6.1.0-edge.0
  - @memberjunction/communication-expo-push@6.1.0-edge.0
  - @memberjunction/communication-gmail@6.1.0-edge.0
  - @memberjunction/communication-twilio@6.1.0-edge.0
  - @memberjunction/record-set-processor-base@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/predictive-studio-core@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-agents@6.0.0
  - @memberjunction/ai-engine-base@6.0.0
  - @memberjunction/ai-core-plus@6.0.0
  - @memberjunction/aiengine@6.0.0
  - @memberjunction/predictive-studio@6.0.0
  - @memberjunction/ai-prompts@6.0.0
  - @memberjunction/ai-bridge-base@6.0.0
  - @memberjunction/ai-bridge-server@6.0.0
  - @memberjunction/api-keys@6.0.0
  - @memberjunction/actions-base@6.0.0
  - @memberjunction/actions@6.0.0
  - @memberjunction/codegen-lib@6.0.0
  - @memberjunction/communication-types@6.0.0
  - @memberjunction/communication-engine@6.0.0
  - @memberjunction/notifications@6.0.0
  - @memberjunction/communication-ms-graph@6.0.0
  - @memberjunction/communication-expo-push@6.0.0
  - @memberjunction/communication-gmail@6.0.0
  - @memberjunction/communication-sendgrid@6.0.0
  - @memberjunction/communication-twilio@6.0.0
  - @memberjunction/content-autotagging@6.0.0
  - @memberjunction/conversations-runtime@6.0.0
  - @memberjunction/graphql-dataprovider@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/metadata-sync@6.0.0
  - @memberjunction/open-app-engine@6.0.0
  - @memberjunction/query-processor@6.0.0
  - @memberjunction/record-set-processor-base@6.0.0
  - @memberjunction/record-set-processor@6.0.0
  - @memberjunction/sqlserver-dataprovider@6.0.0
  - @memberjunction/scheduling-engine@6.0.0
  - @memberjunction/search-engine@6.0.0
  - @memberjunction/templates-base-types@6.0.0
  - @memberjunction/templates@6.0.0
  - @memberjunction/testing-integration@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/predictive-studio-core@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- aa4fbcd: Fix the live-agent harness reaching prompt runs through a column that does not exist, and stop it swallowing the failure

  Three live-harness helpers filtered `MJ: AI Prompt Runs` on `AgentRunID`. That column is not on
  `AIPromptRun` — its only agent-facing field is `AgentID`. A prompt run is reachable from its agent
  run only through the step that invoked it: an `MJ: AI Agent Run Steps` row whose `TargetLogID` is
  the prompt run's ID.

  The reason a nonexistent column survived in committed code is the second half. `RunView` does not
  throw — it returns `Success: false` with an `ErrorMessage` — and each helper coalesced that to `[]`,
  making a SQL error indistinguishable from "this run made no model calls". Callers read zero prompt
  runs and either passed vacuously or failed on an unrelated-looking assertion. The swallow was the
  actual defect; the wrong column name only exploited it.

  Which step types carry a prompt run is the other half of the rule, and `Prompt` alone is wrong.
  base-agent writes a prompt run's id into `TargetLogID` on three step types: `Prompt` (the ordinary
  model call), `Compaction` (cross-turn conversation compaction), and `Tool` (a conversation tool call
  that made its own model call, deliberately with no duplicate `Prompt` step — so a Prompt-only rule
  cannot reach it by any route). Two named sets now encode this, because the correct answer differs by
  purpose: `PROMPT_RUN_BEARING_STEP_TYPES` (all three) for deletion, which must be exhaustive or it
  orphans rows, and `ROLLUP_BEARING_STEP_TYPES` (`Prompt` + `Compaction`) for token reads, mirroring
  the step types base-agent actually counts toward `AIAgentRun.TotalTokensUsed`. A single blanket
  filter would have fixed the orphaning and broken the token reconciliation in the same stroke.

  The linkage rule now exists once, in `promptRunIdsFromSteps`, instead of being restated in four
  places with three of them wrong. `deepDeleteRunTrees` resolves prompt runs _before_ deleting steps —
  the previous order deleted the steps first and destroyed the only path to those rows, so teardown
  silently leaked every prompt run it claimed to purge. `requireRows` replaces the swallow in the read
  helpers; teardown paths stay non-throwing by design but now log rather than going quiet.

  `RS7` asserted a short-circuit with a 2-char query while `SearchEngine.MIN_TERM_LENGTH` is now 2
  (lowered from 3 so short queries like "AI" and "US" are searchable), so it no longer described
  product behavior. It now probes with a single character, below both the old and current thresholds,
  testing the short-circuit rather than tracking the threshold's value. `SR5` had already been changed
  this way when the 3-to-2 fix landed; `RS7` was missed because its bundle is live-model tier and the
  deterministic gate never runs it.

  Adds `prompt-run-linkage.test.ts`. Its unit tests pin the linkage rule and the loud-failure
  property, but neither can catch someone re-adding an `AgentRunID` filter — only a real database
  rejects that, and the live tier is triage-only, so the regression would ship exactly as it did the
  first time. The file therefore also scans the check sources, the same filesystem-drift technique
  `sibling-parity.test.ts` uses for bundle-to-metadata parity.

- c382605: Fix realtime relayed-tool dispatch for scoped anonymous magic-link sessions (#3371): delegated agent runs, co-agent observability writes (creation, transcript/tool-turn appends, usage accumulation, finalize), and recording uploads now execute under the system user once session ownership is proven — gated on MagicLinkScope, excluding public web-widget guests, and failing closed to the caller when no system user is available. The session's `allowedAgents` colleague union is now CanRun-gated against the original caller before dispatch, so elevation cannot widen agent authority, and delegated runs carry the visitor's id as `userId` so run attribution and context-memory scope stay the person's. Adds the IT68 scoped-anon-elevation deterministic integration bundle proving the permission contract on a live database.
- Updated dependencies [c382605]
- Updated dependencies [1e048ef]
- Updated dependencies [a8fc549]
  - @memberjunction/ai-agents@5.51.0
  - @memberjunction/codegen-lib@5.51.0
  - @memberjunction/core@5.51.0
  - @memberjunction/predictive-studio@5.51.0
  - @memberjunction/record-set-processor@5.51.0
  - @memberjunction/scheduling-engine@5.51.0
  - @memberjunction/ai-engine-base@5.51.0
  - @memberjunction/ai-core-plus@5.51.0
  - @memberjunction/aiengine@5.51.0
  - @memberjunction/ai-prompts@5.51.0
  - @memberjunction/ai-bridge-base@5.51.0
  - @memberjunction/ai-bridge-server@5.51.0
  - @memberjunction/api-keys@5.51.0
  - @memberjunction/actions-base@5.51.0
  - @memberjunction/actions@5.51.0
  - @memberjunction/communication-types@5.51.0
  - @memberjunction/communication-engine@5.51.0
  - @memberjunction/notifications@5.51.0
  - @memberjunction/communication-ms-graph@5.51.0
  - @memberjunction/communication-expo-push@5.51.0
  - @memberjunction/communication-gmail@5.51.0
  - @memberjunction/communication-sendgrid@5.51.0
  - @memberjunction/communication-twilio@5.51.0
  - @memberjunction/content-autotagging@5.51.0
  - @memberjunction/conversations-runtime@5.51.0
  - @memberjunction/graphql-dataprovider@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/metadata-sync@5.51.0
  - @memberjunction/open-app-engine@5.51.0
  - @memberjunction/query-processor@5.51.0
  - @memberjunction/record-set-processor-base@5.51.0
  - @memberjunction/sqlserver-dataprovider@5.51.0
  - @memberjunction/search-engine@5.51.0
  - @memberjunction/templates-base-types@5.51.0
  - @memberjunction/templates@5.51.0
  - @memberjunction/testing-integration@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/predictive-studio-core@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- 623dfc5: Break CodeGen FK cycle between AIAgentRun, AIPromptRun, and ConversationDetail. Move SummaryPromptRunID from ConversationDetail to a new ConversationCompactionRun audit table. Remove AgentRunID from AIPromptRun (derivable via AIAgentRunStep.TargetLogID). Remove agentRunId from AIPromptParams and all write sites across the prompt/agent stack.
- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [54a037f]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [a3bd648]
- Updated dependencies [c221553]
- Updated dependencies [fab223d]
- Updated dependencies [a7dfaf5]
- Updated dependencies [d79dd11]
- Updated dependencies [86832fa]
- Updated dependencies [deb02b4]
- Updated dependencies [8b4c6b2]
- Updated dependencies [918563e]
- Updated dependencies [0686d52]
- Updated dependencies [c7b6710]
- Updated dependencies [764d6f6]
- Updated dependencies [408e4bf]
- Updated dependencies [0ba33b3]
- Updated dependencies [03fc891]
- Updated dependencies [76c0ffb]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai-agents@5.50.0
  - @memberjunction/ai-core-plus@5.50.0
  - @memberjunction/ai-prompts@5.50.0
  - @memberjunction/codegen-lib@5.50.0
  - @memberjunction/content-autotagging@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/testing-integration@5.50.0
  - @memberjunction/open-app-engine@5.50.0
  - @memberjunction/communication-types@5.50.0
  - @memberjunction/communication-ms-graph@5.50.0
  - @memberjunction/search-engine@5.50.0
  - @memberjunction/communication-gmail@5.50.0
  - @memberjunction/communication-sendgrid@5.50.0
  - @memberjunction/actions-base@5.50.0
  - @memberjunction/predictive-studio-core@5.50.0
  - @memberjunction/metadata-sync@5.50.0
  - @memberjunction/ai-engine-base@5.50.0
  - @memberjunction/aiengine@5.50.0
  - @memberjunction/predictive-studio@5.50.0
  - @memberjunction/ai-bridge-base@5.50.0
  - @memberjunction/ai-bridge-server@5.50.0
  - @memberjunction/api-keys@5.50.0
  - @memberjunction/actions@5.50.0
  - @memberjunction/communication-engine@5.50.0
  - @memberjunction/notifications@5.50.0
  - @memberjunction/conversations-runtime@5.50.0
  - @memberjunction/graphql-dataprovider@5.50.0
  - @memberjunction/query-processor@5.50.0
  - @memberjunction/record-set-processor@5.50.0
  - @memberjunction/sqlserver-dataprovider@5.50.0
  - @memberjunction/scheduling-engine@5.50.0
  - @memberjunction/templates-base-types@5.50.0
  - @memberjunction/templates@5.50.0
  - @memberjunction/communication-expo-push@5.50.0
  - @memberjunction/communication-twilio@5.50.0
  - @memberjunction/record-set-processor-base@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- 8d2a454: Correct the release runbook's integration-testing step for the post-#3228 suite, and fix three stale sibling docs. Documentation only — no runtime code changes.

  `DEPLOYMENT.md` Step 4 described a world that no longer exists: it told the build engineer to run `RUN_MUTATION_TESTS=1 RUN_AGENT_TESTS=1 npm run test:integration` and claimed an aggregator collapsed all tiers into one exit code. That command runs **zero** live-model tests — `test:integration` is hardcoded to `mj test suite "Integration Tests — Deterministic"`, the live tests live in a **sibling** suite, and `mj test suite` does not recurse into child suites, so the runbook reported "all three tiers passed" while one never ran. The aggregator (`run-all.ts`) was deleted in the July-2026 restructure.

  Every command and behavior in the rewritten step was verified by executing it against a live throwaway database rather than inferred from source. That surfaced corrections that source-reading alone had gotten wrong:
  - **Seeding is mandatory, not optional.** The old text said skipping `metadata-optional/integration-test` "keeps the suite green"; an unseeded database actually exits **1** with `Test suite not found`. The suite/Test rows exist only in that root.
  - **Two false-green paths, neither visible in the exit code.** With MJAPI down, the 19 client-transport bundles **skip-as-PASS** (a green 52/52 that ran 33 tests); with `MJ_API_KEY` missing they return status `Error` — and `failedTests` counts only `Failed`, so both exit **0**. The step now requires `N === M === 52` plus a DB-side status tally, because the console prints `✗ FAILED` for `Error` too.
  - **`RUN_AGENT_TESTS` is default-ON** (`IsTierEnabled` returns `!== '0'`), so `=1` is a no-op and `=0` silently yields a green 15/15 that executed nothing.
  - **Missing provider keys FAIL the live tier, they do not skip** — verified by blanking `AI_VENDOR_API_KEY__*`. The build-engineering runbook claimed a clean skip, which would have made a keyless CI leg look safe.
  - **A virgin release database cannot reach 52/52.** `IT29 - Cache Gauntlet` enforces an anti-vacuity floor requiring `MJ: User Settings` to already hold ≥2 rows, so a fresh Step-3 database yields 51/52 until a baseline is seeded.
  - Counts and budgets corrected against reality: IT01–IT66 (67 records, 52 + 15), 242 seeded records, deterministic ≈133s, live ≈570s. `[COST]` reports `$0.0000` even on real model calls, so it must not be read as spend.

  Also documents two environment traps that cost real debugging time: the testing CLI loads dotenv with `override: true` (so an inline `DB_DATABASE=…` is silently ignored for `mj test` while it works for `mj sync push` — a mutating run against the wrong database), and a stale `dist/` orphan whose source was deleted will block MJAPI from booting entirely with a duplicate-GraphQL-type error that rebuilding does not clear.

  Finally, records the SQL Server / PostgreSQL parity position honestly: migration parity is verified every release (Step 8), but **runtime** parity is not — the integration suite cannot run on PostgreSQL today. The testing CLI builds an mssql pool and declares no PG driver, and `UserCache.Refresh` is mssql-typed and issues T-SQL, so the context-user cache stays empty regardless of database contents. Provisioning a PG database does not enable it; it needs a code + dependency change. The section is explicitly scoped so it reads as a roadmap gap and never as a reason to halt a release.

  Sibling docs corrected: `guides/INTEGRATION_TESTING_QUICKSTART.md` (member counts and tier-gating table), `.github/workflows/integration.yml` (stale IT-range comments), and `packages/TestingFramework/integration-test-suite/docs/build-engineering-runbook.md` (the credential-skip claim, `RUN_AGENT_TESTS` semantics, bundle count and measured duration).

- 887c80a: Add the required `repository` block to `@memberjunction/integration-test-suite`. The `validate-package-repository.sh` CI gate requires every `@memberjunction/*` package to declare `repository.url` for npm sigstore provenance; this package shipped without it and was failing the build and publish workflows.
- 8af6663: Skip `private: true` packages in `validate-npm-packages.sh`, the `publish.yml` gate that checks every `@memberjunction/*` package already exists on npm.

  The gate exists to predict whether `npm run change publish` will succeed, but it filtered only on the `@memberjunction/` scope and never read `.private`. Changesets never publishes a private package (`@changesets/cli`: `packages.filter(pkg => !pkg.packageJson.private)`), so for a private package the gate was asking a question with no bearing on the outcome it gates, and failing the release over the answer.

  The gap had been masked by workarounds rather than hit: `@memberjunction/mobile-app` and `@memberjunction/ng-test-utils` are both `private: true` yet sit on npm at `0.0.0` and `0.0.1`, throwaway placeholders published purely to satisfy this check. They have stayed frozen at those versions ever since while the in-repo versions moved on, which is what a placeholder for a private package always decays into. `@memberjunction/integration-test-suite` is the first private package added since, so v5.49.0 is the first release where the gate actually fails.

  Skips are logged rather than silent, so an accidental `"private": true` on a package that should ship is still visible in CI output — preserving the only real signal the old behavior provided, without blocking the release on it. The gate still fails correctly for genuinely missing public packages.

- 838c6c7: Skip `private: true` packages in `validate-package-repository.sh`, matching the rule PR #3236 established in `validate-npm-packages.sh` — so both publish gates now answer "is this a package we publish?" the same way.

  The gate requires `repository.url` for npm sigstore provenance, which only applies to published packages: npm refuses to attest a private package, and changesets never publishes one (`@changesets/cli`: `packages.filter(pkg => !pkg.packageJson.private)`). Requiring the field on a private package forced inert metadata — `@memberjunction/integration-test-suite` had a `repository` block added purely to satisfy this gate, hours before the sibling gate was fixed properly.

  Skips are logged rather than silent, mirroring the sibling gate. Unlike the npm-existence gate (network-bound), this script is pure-local, so it now has a fixture-based vitest suite in `.github/scripts/__tests__/` covering the skip, the not-blunted property (private skip + public failure in one run), and predicate parity with changesets truthiness.

  Also updates `DEPLOYMENT.md` Step 5 and `NEW_PACKAGE_SETUP.md`, which still described the pre-#3236 behavior ("lists every package missing from npm") — the script now lists every _publishable_ package missing, and private packages need no placeholder.

- Updated dependencies [486b276]
- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [0e52ff6]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [3d0255b]
- Updated dependencies [243523e]
- Updated dependencies [88d707b]
- Updated dependencies [7db8ef5]
- Updated dependencies [a7733a9]
- Updated dependencies [3b23275]
- Updated dependencies [505c8b5]
- Updated dependencies [ebe5b88]
- Updated dependencies [a9ec419]
- Updated dependencies [6c910ef]
- Updated dependencies [42a680a]
- Updated dependencies [88d707b]
- Updated dependencies [70113b1]
- Updated dependencies [1a15bd2]
- Updated dependencies [f1ab36f]
- Updated dependencies [4a03c37]
- Updated dependencies [38c69a6]
- Updated dependencies [7d6e8fb]
- Updated dependencies [b64efd1]
- Updated dependencies [d23aa89]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [04cdd67]
- Updated dependencies [5473e9a]
- Updated dependencies [38c220c]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [373c5f6]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [fc1c693]
- Updated dependencies [70c658c]
- Updated dependencies [9d6e3d9]
- Updated dependencies [78a5e44]
  - @memberjunction/codegen-lib@5.49.0
  - @memberjunction/core@5.49.0
  - @memberjunction/ai-agents@5.49.0
  - @memberjunction/ai-core-plus@5.49.0
  - @memberjunction/ai-prompts@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/graphql-dataprovider@5.49.0
  - @memberjunction/testing-integration@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/communication-types@5.49.0
  - @memberjunction/communication-engine@5.49.0
  - @memberjunction/communication-sendgrid@5.49.0
  - @memberjunction/communication-gmail@5.49.0
  - @memberjunction/communication-twilio@5.49.0
  - @memberjunction/communication-ms-graph@5.49.0
  - @memberjunction/communication-expo-push@5.49.0
  - @memberjunction/scheduling-engine@5.49.0
  - @memberjunction/actions@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/api-keys@5.49.0
  - @memberjunction/metadata-sync@5.49.0
  - @memberjunction/predictive-studio@5.49.0
  - @memberjunction/predictive-studio-core@5.49.0
  - @memberjunction/search-engine@5.49.0
  - @memberjunction/sqlserver-dataprovider@5.49.0
  - @memberjunction/templates@5.49.0
  - @memberjunction/ai-engine-base@5.49.0
  - @memberjunction/aiengine@5.49.0
  - @memberjunction/ai-bridge-base@5.49.0
  - @memberjunction/ai-bridge-server@5.49.0
  - @memberjunction/actions-base@5.49.0
  - @memberjunction/notifications@5.49.0
  - @memberjunction/conversations-runtime@5.49.0
  - @memberjunction/open-app-engine@5.49.0
  - @memberjunction/query-processor@5.49.0
  - @memberjunction/record-set-processor-base@5.49.0
  - @memberjunction/record-set-processor@5.49.0
  - @memberjunction/templates-base-types@5.49.0

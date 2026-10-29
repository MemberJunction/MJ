# @memberjunction/ai-prompts

## 6.2.0-edge.6

### Patch Changes

- e8e6cd6: Enforce credential expiration in `CredentialEngine`.

  `Credential.ExpiresAt` has existed since v2.129, the credential editor lets you set it, and the Credentials dashboard counts expired and expiring-soon credentials. Nothing enforced it. `CredentialEngine.getCredential()` filtered on `IsActive` only, so an expired credential resolved and was handed to callers exactly like a live one — despite the column's own description promising that "expired credentials are treated as inactive". Operators could see an expiry date in the UI and reasonably believe it meant something.

  **Enforcement.** Expiry is now evaluated in `getCredential()`, at resolution time rather than at cache-load time — the engine caches credential rows for the life of the process, so a credential that lapses between two calls is caught on the second call rather than staying live until the next refresh. The check runs before the values are decrypted, so a blocked credential never reaches the caller.

  **Policy** is configurable via `CredentialEngine.Instance.ExpirationConfig`:
  - `policy: 'block'` (default) throws `CredentialExpiredError`.
  - `policy: 'warn'` returns the credential flagged and logged — an escape hatch for cleaning up stale expiry dates, not a safe steady state.
  - `graceMs` (default `0`) lets a `'block'` policy tolerate a short, noisy overrun where a hard cutoff at the expiry instant is riskier than the overrun. Grace never changes the reported status: a credential inside grace still reports `expired`, so dashboards and audit logs stay truthful.
  - `warningWindowMs` (default 30 days, matching the dashboard's existing "expiring soon" KPI window) controls when a credential begins reporting `expiring-soon` and warning. It never blocks.

  **Typed errors.** `CredentialExpiredError` and `CredentialNotFoundError` (both extending `CredentialResolutionError`) let callers tell a credential that needs rotating from one that does not exist — previously both surfaced as "Credential not found", sending operators hunting for a record that was sitting right there. `CredentialNotFoundError`'s message is byte-identical to the string thrown before, so callers matching on message text keep working.

  **Lookup semantics.** `getCredentialByName()` and `getDefaultCredentialForType()` now exclude expired credentials. `getCredentialById()` deliberately does not: addressing by primary key is an exact request, and rotation tooling must be able to load an expired record in order to replace it. The same need is served per-call by the new `expirationPolicy` option.

  **Consolidation.** `AIPromptRunner` had hand-rolled `new Date(c.ExpiresAt) < new Date()` comparisons in two places and none on its resolve-by-ID path — the inconsistency that having no shared primitive produces. Both now call `CredentialEngine.GetExpirationStatus()`, so the failover path honors the same window and grace period the engine applies.

  `ResolvedCredential` gains `expirationStatus` and `daysUntilExpiration`, and every resolution records its expiration status in the audit log so an auditor can answer "was any credential used while expired?".

  ⚠️ **Behavior change.** Under the default `'block'` policy, an expired credential that previously resolved now throws. Any deployment carrying stale `ExpiresAt` values will see failures on upgrade where it previously saw silent success. This is the intended correction — the credential was already expired and the platform was ignoring it — but it is worth an inventory query before rolling out:

  ```sql
  SELECT ID, Name, ExpiresAt FROM __mj.Credential
  WHERE IsActive = 1 AND ExpiresAt IS NOT NULL AND ExpiresAt <= SYSDATETIMEOFFSET();
  ```

  Deployments that need a staged rollout can start on `policy: 'warn'` (or a non-zero `graceMs`) and tighten once that query comes back empty.

- a65dfb8: `FailoverMaxAttempts` was read into `failoverConfig.maxAttempts` and then consulted by nobody — its only readers have no callers — so `executeModelWithFailover` walked the FULL priority-ordered candidate list, which for a prompt without `RequireSpecificModels` is every active model of the prompt's type crossed with every active inference vendor (317 entries on a stock tenant), with `executeWithValidationRetries` wrapping the whole walk in `MaxRetries + 1` passes. The cap is now applied where calls are issued: it counts only requests a provider actually saw, so a keyless tail costs nothing, and a non-positive configured value is treated as unconfigured rather than as "no calls allowed".

  The failover budget bounds what a prompt SPENDS, not who it asks. A priority-ordered candidate list is usually the same driver class repeated across vendors and models, so three attempts are three requests to one upstream having one bad minute, and the prompt fails without any other provider being asked. That is the ordinary shape on a tenant fronted by a single metered provider, not an edge case.

  When every attempt so far went to ONE driver class, the walk now continues **without spending** — same-class candidates are skipped, not called — until the first credentialed candidate on a different class, and allows exactly one call there. The extra call adds its own class to the attempted set, so `size === 1` is false at every later candidate: the ceiling is `FailoverMaxAttempts + 1` and never more, the scan issues no requests of its own, the credential skip still applies (a keyless provider is never called to satisfy the rule), and `lastError` semantics are unchanged. A walk that already spread across several providers is unaffected.

  The "no suitable model found" message now names the distinct driver classes behind the candidate list and which of them hold credentials, so a failure reads `101 candidates over 1 driver class (OpenRouterLLM); credentialed: none` instead of a bare candidate count that reads like a misconfigured chain. Candidates the short-circuit never probed are reported as such, so `credentialed: none` is not over-read. `AIModelSelectionInfo.modelsConsidered[]` gains an optional `driverClass`, also persisted in `AIPromptRun.ModelSelection`; the message is unchanged for callers that record none.

  The message builder moved out of `AIPromptRunner` into `no-model-found-message.ts`. As a private method its only coverage was a re-implementation of it inside the test file, which asserted against its own copy — those tests now import the production function.

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

- 1141164: Native tool calling: run the Loop agent as a provider-native tool loop.
  - **History ordering.** A generic Retry on a native tool-call turn answers each call with an `is_error` tool result carrying the reason instead of a "Retrying due to" user message, and `reconcileUnansweredToolCalls` inserts its synthetic results directly after the call turn. Anthropic and OpenAI rejected the old call → user message → result order with a 400.
  - **Replayed thinking stays valid on Claude 5.x.** A native run on a driver whose replayed reasoning needs the history before it unchanged (`BaseLLM.ReplayedReasoningRequiresStablePrefix`, true for Anthropic) keeps its runtime-state fragments (append-only), so a thinking block is never replayed behind a history that dropped the fragment it was made with. When an earlier message is rewritten anyway (expiry, compaction, message expansion, context recovery), the reasoning of every call turn after it is dropped instead of replayed; when the system prompt or tools change (a skill activating mid-run), the prompt runner sends the request without replayed reasoning (`AIPromptParams.ReplayedReasoningPrefix`, `GetSentPrefixFingerprint`). A compacted message is not compacted again on later turns. An expired native tool turn is compacted in its action's own mode, AI summary included.
  - **Thinking across tool turns.** `ChatMessage.reasoning` / `ChatCompletionMessage.reasoning` carry provider reasoning blocks. Anthropic captures every `thinking` (with signature) and `redacted_thinking` block, replays them ahead of the `tool_use` blocks, and sends the interleaved-thinking beta for budget-form thinking with tools. Gemini keeps thought parts and signed text parts and replays them in order. The Loop agent carries reasoning onto the replayed call turn.
  - **Per-agent native control** in `TypeConfiguration.NativeControl`: turn off `payload_change_request` or `ask_user`, end the run in plain text (`Terminal: 'text'`, final turn `toolChoice: 'none'`), declare `complete_task.payloadChangeRequest` as an object, opt into the tools-only prompt (`NativeOnly`) and into compaction of older tool-call arguments (`CompactToolArguments`).
  - **Agent-local tools.** `BaseAgent.GetAgentTools` declares tools that read and write the agent's own state. Calls run in order as `Tool` run steps, their `PayloadChange` is applied through PayloadManager under `PayloadSelfWritePaths`, and errors return as `is_error` results.
  - **One control plane (opt-in).** Under `NativeOnly` the Loop system prompt teaches tools only, and the scratchpad, durable memory, artifact tools, conversation-history tools and decisions are native tools answered on the same turn. Envelope and hybrid prompts render byte-identically to before.
  - **Turn shapes.** By default each control call is alone on its turn, as before; the agent's own tools ride along with Actions or a delegation. `NativeControl.RelaxedTurnShapes` opts in to mixed turns: several `payload_change_request` calls apply in order, writes then `ask_user` or `complete_task` finish on that turn (a failed write declines them), and a delegation, `ask_user` or `complete_task` beside Actions is answered as not run, to be made again once the Actions' results are read. A `complete_task` refused by validation, unmet minimum executions or a self-check is answered with the feedback, as an error. A Retry never answers a call twice, and every result for a call turn travels in the one tool turn after it. `parallelToolCalls` is left to each provider's default. A failed Action's guidance rides in its own `is_error` result, and `uncrushedActions` exempts named Actions from result crushing.
  - **Corrective retries match the agent.** The unknown-tool, unreadable-JSON and rejected-call retries name `complete_task` only when it is declared, the envelope only when the agent has one, and only the tools the turn's request carried. Framework tools do not dispatch on a hybrid turn, and the loop reads a turn's tool-calling mode from the chat result.
  - **Prompt runs record their tool-calling path reliably.** `AIPromptRun.ToolCallingMode` is set inside the run's finalize step, so a model call that returns before the run's initial INSERT completes no longer loses it to the INSERT's reload (it was persisted as NULL, on the prompt run and on the agent run step that copies it).
  - **Fallback and providers.** The native-to-envelope fallback triggers on a 400/422 or any error not clearly about something else (rate limit, authentication, cancellation, context length) whose text names the tools payload; tool turns encoded as text keep their calls; failover re-renders the prompt and its child prompts when it changes the tool-calling path, on the parallel path too, keeps the original text if the re-render fails, and records what was sent on the prompt run; the tools-stripped retry is sent the envelope prompt; a Strict validation retry never discards a tool-call turn. Gemini `UNEXPECTED_TOOL_CALL` and unparseable OpenAI-compatible arguments are reported as rejected calls with what the model sent, except on a request that declared no tools, and a signature on an empty text part is kept. Gemini now returns every visible text part of a reply, not only the first. OpenAI-compatible `null` arguments read as an empty argument set. Anthropic folds a user message that follows tool results into their turn instead of adding an assistant "OK" (which ended the tool loop and dropped its thinking), turns budget-form thinking off, with a warning, for a request whose open tool loop has no thinking to replay, honours `enableCaching: false`, and puts a cache breakpoint on a request ending in a tool turn.

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

- Updated dependencies [622f166]
- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [cc41d33]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [e8e6cd6]
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
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/aiengine@6.2.0-edge.6
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/credentials@6.2.0-edge.6
  - @memberjunction/ai-engine-base@6.2.0-edge.6
  - @memberjunction/templates@6.2.0-edge.6
  - @memberjunction/templates-base-types@6.2.0-edge.6

## 6.2.0-edge.5

### Minor Changes

- 0d81c53: Action params can declare a JSON Schema for their value, and native tool calling now follows each agent's own prompt configuration and every LLM's stated capability (#5050, #5508, #5610).
  - **`ActionParam.ValueSchema`** (#5050). A new nullable column holds a JSON Schema fragment for one param's value, limited to the subset every tool-calling provider accepts: `type`, `description`, `enum`, `items`, `properties`, `required`. CodeGen emits a typed `ValueSchemaObject` accessor (`MJActionParamEntity_IActionParamValueSchema`). When it is set, the native tool builder declares it in place of the coarse `ValueType` mapping. For an `IsArray` param it describes one element. Keywords outside the subset are dropped before the declaration goes out, and text that is not valid JSON falls back to `ValueType` with a warning. Params without a schema are declared exactly as before.
  - **Argument coercion follows the schema, on every path.** `CoerceActionArguments` coerces each argument against the same schema its declaration used, at any depth, and `BaseAgent.ExecuteSingleAction` now applies it before every dispatch, so envelope-mode and Flow calls get the same types as native ones. JSON text becomes an object or array, `"10"` becomes a number and `"true"` becomes a boolean, but only where the schema does not allow strings. This replaces the `Simple Object`-only JSON decoding. New exports from `@memberjunction/ai-agents`: `SanitizeValueSchema`, `ResolveParamElementSchema`, `GetStoredValueSchema`, `CoerceValueToSchema`, `DescribeValueSchemaInline`, `ParamValueSchema`.
  - **Stock actions backfilled.** `ValueSchema` is set on 33 params of actions stock agents use, where the action code accepts the native type: Create SVG Chart, Create SVG Diagram, Web Search, Web Page Content, Text Analyzer, Find Candidate Agents, Find Candidate Actions and Get Weather (enums, integers, numbers, booleans, string arrays, and Create SVG Chart's `Data` objects).
  - **The prose action catalog shows the schema too**, as a compact type such as `{TopCount: integer, Sort?: string}` or `"asc"|"desc"`, so the envelope path tells the model what the native declaration does.
  - **The agent's own prompt counts for native tool calling** (#5508). On a hierarchical run (an agent type's system prompt with the agent's prompt as its child), the gate used to read only the parent's `PromptConfiguration`, so `LLM.UseNativeToolCalling` set on an agent's prompt was ignored. The cascade is now parent prompt, then child prompt, then the selected AI Prompt Model row, merged per key.
  - **Every LLM states `LLM.SupportsNativeToolCalling`** (#5610). Gemini 3.8 Flash, which Google now serves for `gemini-3.7-flash`, gets the same native block as 3.7 Flash. The other 20 records that left it unset now say `true` or `false`. Vendor rows on drivers that cannot send tools (Azure, Bedrock, Fireworks, Mistral, LM Studio, Cohere) say `false`, which also corrects Mistral Large 4. A test in `@memberjunction/ai` fails when an LLM leaves the flag unset, or when an active vendor row resolves to `true` on a driver that ignores tools.
  - **Live integration test IT129** (`native-tool-calling-live`). Real Loop agents call an Action in native and envelope mode across one model per tool-capable driver, and the test reads the recorded `ToolCallingMode` and the arguments each Action received from its execution log. It covers native mode set on the agent's own prompt, envelope mode, the stock Create SVG Chart backfill, and a vendor row without tool support running envelope. Models without a credential, retired models and accounts without balance are skipped and logged. `@memberjunction/testing-integration` adds the `NativeToolCallingLiveFixture` slot to `IntegrationCheckContext`.

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

- 52b9fd5: Mark `AIPromptRunner`'s no-provider `Metadata` fallback as reviewed, so the repo-wide multi-provider compliance scan passes again. No behavior change.
- 5465489: Less work on the entity-load and agent hot paths, plus fixes to how fields a load omitted behave.
  - **`BaseEntity.GetAll()`** reads a record that hasn't built its fields yet straight from the loaded row, with the same date parsing and fixed-width trimming as `Get()`. It no longer builds every field just to serialize it.
  - **Loaded records skip metadata defaults** when their fields are built. Each loaded value replaces the default anyway, and a field the row didn't include is marked not loaded, so it no longer holds a default nobody loaded. New records still get their defaults.
  - **Fields a load or `Hydrate()` omitted hold nothing.** Reloading a record now clears the previous record's value from a field the new row leaves out, and `Hydrate()` no longer leaves a default there. An explicit write onto such a field, even null, makes it dirty and reaches the save, and a null on a NOT NULL field fails validation. `Revert()` puts such a field back to not loaded, and leaves fields that were never loaded alone. A row keyed by a field's `CodeName` (for example `Due_Date` for `Due Date`) now loads that field.
  - **`BaseEngine`** reads its own configs on every entity save or delete event instead of deep-copying them through `JSON.stringify` each time. **`LocalCacheManager`** totals entry sizes directly when deciding whether to evict.
  - **`PayloadManager`** copies payloads with a faster deep clone, doesn't clone the parent payload twice on a wildcard merge, and compiles each allowed-path pattern to a regex once. A backslash in a pattern now matches literally instead of acting as a regex escape. `DeepMerge` now merges only plain objects: a `Date` or class instance in the source replaces the destination value instead of collapsing to `{}`.
  - **`AIPromptRunner`** parses output that starts with `{` or `[` with `JSON.parse` before falling back to `CleanJSON`, which re-serialized valid JSON and parsed it a second time.

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

- Updated dependencies [0d81c53]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
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
- Updated dependencies [230cdad]
- Updated dependencies [7e72c86]
- Updated dependencies [4e4c82d]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [2a7a098]
- Updated dependencies [8420f36]
- Updated dependencies [72dd65c]
- Updated dependencies [1d29837]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [0cc6b08]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [e1f2583]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/ai-core-plus@6.2.0-edge.5
  - @memberjunction/ai-engine-base@6.2.0-edge.5
  - @memberjunction/aiengine@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/templates-base-types@6.2.0-edge.5
  - @memberjunction/templates@6.2.0-edge.5
  - @memberjunction/credentials@6.2.0-edge.5

## 6.2.0-edge.4

### Minor Changes

- 10c2311: Add the Clef and Kev decision models and two drivers to reach them. `CloudflareDecision`, in the new `@memberjunction/ai-cloudflare` package, calls Cloudflare's Clef and Clef-flash on Workers AI (`@cf/cloudflare/clef`, `@cf/cloudflare/clef-flash`); its account ID comes from a `<accountId>:<apiToken>` key, a credential's `accountId`, or `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_WORKERS_AI_BASE_URL` or a credential's `endpoint` routes it through an AI Gateway. `SystemOneDecision`, in the new `@memberjunction/ai-systemone` package, calls any server with a `/v1/systemone` route (Kev's own server, llama.cpp's `llama-server`, TypeSafe), with the endpoint from an `API Key with Endpoint` credential or `SYSTEMONE_BASE_URL` and an optional bearer token. The System One wire mapping that Jev, Kev and Clef share moves out of `OpenRouterDecision` into a new `BaseSystemOneDecision` in `@memberjunction/ai`; `OpenRouterDecision` keeps its behaviour, statics and constructor, except that a key resolved from an AI Credential binding now sends the credential's `apiKey` as the bearer token instead of the credential's JSON, and a key that starts with `{` but is not valid JSON now fails before any request instead of being sent whole as the token. Metadata adds the `Cloudflare` and `System One Endpoint` vendors, the `Clef` and `Clef-flash` models, and `Kev-0.8B`, `Kev-4B`, `Kev-9B` and `Kev-27B` (Kev-4B also on OpenRouter, as `jaredpalmer/kev-4b-20260924`), with their limits and prices. The `Default Decision` prompt's bindings are unchanged. The one change in default behaviour: as active `Decision` models, the new models join the power-matched fallback candidates of any Decision prompt that does not require specific models, after its bound models, and only when their credentials resolve. `Default Decision` fails over across models (its `FailoverStrategy` is the column default, `SameModelDifferentVendor`, which `AIDecisionRunner` treats as the whole candidate list), so a call reaches one of them when every credentialed candidate ahead of it (Jev, when its key is set, and `LLM Decision`) has failed with an error that allows failover. Kev-4B on OpenRouter resolves with the OpenRouter key Jev already uses. A missing account ID, token or endpoint, or an API key that starts with `{` but is not valid JSON (a legacy `AI_VENDOR_API_KEY__*` value or runtime `apiKeys` entry; bound AI Credentials always arrive as valid JSON), fails a call before any request with a `NoCredentials` error that allows failover, so a misconfigured fallback does not stop the failover loop and a malformed key's text is never sent as a token.

  `BaseModelRunner` in `@memberjunction/ai-prompts` now finds a `ModelVendor` credential binding on any Active row of a model on a vendor, Inference Provider rows first, both when it checks whether a candidate has a credential and when it resolves one. It used to read only the first Active row, so for any model with both a Model Developer row and an Inference Provider row on one vendor (Clef and Clef-flash on Cloudflare, and many existing models, such as Claude 4.5 Opus on Anthropic, Grok 4 on x.ai, Gemini 3 Flash on Google and the OpenAI embedding models), a credential bound to the Inference Provider row was found only when that row happened to load first, which depends on the rows' keys. A binding on another model's row still does not apply. The fix applies to every runner built on `BaseModelRunner` (prompts and agents, embeddings, rerankers, image and media generation, and decisions), not only to decisions.

### Patch Changes

- bb3028a: A Config dashboard's tab has an AI assistant: a resizable side pane that chats, in text or in a Gemini 3.8 Live voice session, with the new **Dashboards Expert** agent, which the Dashboards application pins through its `AgentSettings`.
  - **Client tools.** The tab gives the agent client tools: `GetDashboardState`, `GetDashboardScreenshot` and `SearchSources` read the dashboard and find views, queries, entities and artifacts; `AddPanel`, `RemovePanel`, `MovePanel`, `ResizePanel` and `UpdatePanelSettings` make in-memory edits, one at a time, that put the tab in edit mode and that Cancel discards; and `RequestSaveDashboard` and `RequestPinToHome` ask the user in a confirm dialog, so a save or a Home pin happens only when the user confirms it. The edit and request tools take the `dashboardId` that `GetDashboardState` returns and refuse a call for a dashboard that is no longer open.
  - **`DashboardResource`** (`@memberjunction/ng-explorer-core`, the dashboard tab) adds the AI pane's members: the pane state `ChatOpen`, `CopilotExpanded`, `MainSizePct`, `CopilotSizePct`, `CopilotMinPct`, `CopilotMaxPct` and `ShowCloseChatConfirm`; the chat state `ChatAgentId`, `ChatAgentName`, `ChatAgentError`, `ChatConversation`, `ChatConversationId`, `ChatIsNewConversation`, `ChatPendingMessage`, `ChatPendingAttachments`, `ChatAppContext`, `ChatApplicationId` and `ChatEnvironmentId`; the open save or pin confirm, `AgentConfirm`, with `OnAgentConfirm()`; and the methods `ToggleChat()`, `CloseChat()`, `OnCloseChatConfirmed()`, `OnCloseChatCancelled()`, `ToggleCopilotExpanded()`, `OnCopilotSplitDragEnd()`, `OnChatConversationCreated()`, `OnChatRealtimeConversationReady()`, `OnChatPendingMessageConsumed()`, `OnChatNavigationRequest()` and `OnChatOpenEntityRecord()`.
  - **Layout editor** (`@memberjunction/ng-dashboard-viewer`). The package exports the pure layout editor behind the tab's edit tools (`InsertPanel`, `MovePanel`, `ResizePanel`, `RemovePanelFromLayout`, `SimplifyLayout`, `FindPanelPath`, `DescribePath`, `LayoutEditError`, `PANEL_PLACEMENTS`) and its types `PanelPlacement`, `PanelPosition`, `LayoutPathStep` and `SimplifiedLayoutNode`. `DashboardViewerComponent` adds `ApplyLayout()`, which shows a layout that these functions built, and `GetPanelPath()`, which gives a panel's address in the layout. The viewer's `AddPanel` returns the new panel's ID and honours its position: its optional `location` argument is now a `PanelPosition`, not a `LayoutLocation`, so a caller that passes a `LayoutLocation` must change, and a position that is not valid throws `LayoutEditError`. `UpdatePanelConfig()` now returns a `Promise` that settles when the layout is rebuilt (it rejects when the rebuild fails). A subclass that overrides `AddPanel()` or `addPanel()` must take a `PanelPosition` and return `Promise<string | null>`, and one that overrides `UpdatePanelConfig()` or `updatePanelConfig()` must return `Promise<void>`. Each panel's content element has a `data-panel-id` attribute.
  - **Screenshots** (`@memberjunction/ng-shared`). The package adds `CaptureElementJpeg`, with the types `ElementCaptureOptions` and `ElementCapture`, the defaults `ELEMENT_CAPTURE_DEFAULTS`, and the helpers `ComputePixelRatio()` and `StripDataUrlPrefix()`.
  - **Client tool results.** A client tool result now reaches the model in full: the results of one `ClientTools` step go into one message that expires after 3 turns, and the optional Loop prompt parameter `clientToolResultMaxChars` truncates them with a visible note. In `@memberjunction/ai-agents` it is `LoopAgentTypePromptParams.clientToolResultMaxChars`, and `DEFAULT_LOOP_AGENT_PROMPT_PARAMS` sets it to `-1` (no cap); code that builds its own `Required<LoopAgentTypePromptParams>` must add it.
  - **Images in tool results.** A result can also carry images (`Media`: JPEG, PNG or WebP, at most 4 items of at most 2,000,000 decoded bytes each), which `ParseClientToolMedia` (`@memberjunction/ai-core-plus`) checks in `RespondToClientToolRequest`, a bad item giving a failed tool result; the agent client sends them, and the agent and prompt runner pass them to the model as image blocks that expire after 2 turns, while the step output keeps only their metadata. `@memberjunction/ai-core-plus` adds `ClientToolMediaItem` (`MimeType`, `Base64`, optional `Width` and `Height`), `ClientToolMediaParse` and `CLIENT_TOOL_MEDIA_LIMITS`, and an optional `Media` on `ClientToolResponse` and `ClientToolResultSummary`; `@memberjunction/ai-agent-client` adds an optional `Media` on `ClientToolResult`.
  - **`RespondToClientToolRequest`** (`@memberjunction/server`) takes a new optional GraphQL argument, `media`: a string that holds the images as a JSON array. In TypeScript, `ClientToolRequestResolver.RespondToClientToolRequest()` has the new parameter before the context, so a direct caller that passes the context by position, or a subclass that overrides the method, must change. The agent client's mutation always names the `media` argument, so it needs a server from this release: an older server rejects every client tool response (`Unknown argument "media"`), and each client tool call then fails when it times out. A `result` that is not valid JSON now also gives a failed tool result, so the agent no longer waits for the request to time out.
  - **Media in the agent and prompt runner.** `BaseAgent`'s protected `contentToString()` now turns an image, audio, video or file block into a short stub (for example `[image omitted]`), not its base64 text, and its protected `estimateTokens()` counts each such block as 1,600 tokens. The prompt runner keeps the content blocks that a user message already has when it adds file blocks, and it no longer changes the caller's message objects when it replaces media that the model cannot read.
  - **Voice.** Voice tool results stay text, since the Explorer shell strips `Media` before a realtime session sees them (`WithoutMedia()`, `@memberjunction/ng-explorer-app`). A voice session's delegated run (`invoke-target-agent`) receives the browser session ID and the app context from the session start (`ExecuteRelayedToolInput.BrowserSessionID` and `AppContext`, `@memberjunction/ai-agents`), so the delegated agent can call the page's client tools; a scoped anonymous caller's run, which executes as the system user, gets no app context. The server does not store an app context whose JSON is longer than 256,000 characters, and the delegated runs then get none. A voice session also keeps its direct actions when a delegated run pauses for the user's answer. In `@memberjunction/realtime-runtime`, a surface client tool whose handler returns `Success: false` gives the voice model a failed result, and `RealtimeSessionRuntime.SendVideoFrame` returns whether the frame was sent; a subclass that overrides it must return a `boolean`.
  - **Agent context.** The sub-agent catalog lists only Active relationship targets. The Explorer shell keeps the page's additional context when it rebuilds the app-context snapshot while the page's tab is attached, clears it when the tab is detached, and restores it when the tab is reattached. The client tools a page registered now follow the same rule: only the detach of that page's own tab clears them, so the detach of another tab no longer takes the open dashboard's tools away from the agent. In `@memberjunction/ng-shared`, `AgentContextUpdate` gains `Lifecycle` (`'Detached'` or `'Reattached'`), which `NavigationService.NotifyResourceDetached()` and `NotifyResourceReattached()` set; the detach of another tab now sends an update with only `Caller` and `Lifecycle`, not an empty `AgentClientTools` list.
  - **Chat area** (`@memberjunction/ng-conversations`). The chat area's empty-state composer now receives the host's default agent, application and app context, so a voice call can start before the first message, and the dashboard tab adopts the conversation that call created when it ends.

- 432fe69: Stop logging a failover banner for failovers that never happened.

  The "🔄 Trying candidate N/M" line was keyed off `i > 0`, which is not the same as
  "a previous candidate failed": candidates lacking credentials in the current
  environment are skipped without ever issuing a request, so the first _called_
  candidate is routinely `i > 0`. Successful first-try calls logged
  `🔄 Trying candidate 2/315`. One regression-suite run produced 515 such lines and
  zero real failovers. Now keyed off an actual prior failure.

- 57096ab: Follow-ups from the review of #5063.
  - A rejected model call that carries an `errorMessage` but no `errorInfo` keeps the classification its message implies (`RateLimit`, `Authentication`, `ContextLengthExceeded`). #5063 made it read as `Unknown`/`Transient`, because the raw result has no `message` for `ErrorAnalyzer` to read. Only out-of-tree drivers reject this way.
  - Run Ad-hoc Query no longer drops a failed analysis. With `ReturnType` `analysis only` it now fails (`ANALYSIS_FAILED`, with the reason) instead of returning `SUCCESS` with no analysis; with `data and analysis` it returns the data plus an `AnalysisError` and says why there is no analysis. The analysis fails by design under a `'RuntimeOnly'` credential scope.

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
- Updated dependencies [b699a37]
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
- Updated dependencies [64b6fa5]
- Updated dependencies [d86bcbc]
- Updated dependencies [af6f892]
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
- Updated dependencies [975948b]
- Updated dependencies [22c9074]
- Updated dependencies [88b85fc]
- Updated dependencies [aee2d53]
- Updated dependencies [5dc3752]
- Updated dependencies [6c8798b]
- Updated dependencies [f0c78c3]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [02bb563]
- Updated dependencies [afe9eb4]
- Updated dependencies [90829e3]
- Updated dependencies [aac148b]
- Updated dependencies [9ce70b3]
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
  - @memberjunction/ai-core-plus@6.2.0-edge.4
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/ai-engine-base@6.2.0-edge.4
  - @memberjunction/aiengine@6.2.0-edge.4
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/templates-base-types@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/templates@6.2.0-edge.4
  - @memberjunction/credentials@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- 0a75bb2: A Loop agent run that declares no tools renders its system prompt again. The Loop system prompt reads `_NATIVE_TOOL_CALLING` and `_NATIVE_CONTROL_FLOW` on its first line, so template parameter extraction marks both required, but `AIPromptRunner` set them only when tools were declared, and every such run failed with "Parameter \_NATIVE_TOOL_CALLING is required". The runner now sets both on every hierarchical run, to the envelope path's values (`false`, `'envelope'`) when no tools are declared and the caller supplied none.
- 29b6ec3: fix: native tool calling — object action params, a one-turn `complete_task` finish, an implicit-mode Loop prompt, and Gemini thought signatures across failover

  Found running Skip's Query Writer on Gemini 3 Flash with native implicit control flow. `Simple Object` action params are declared as `object` and a JSON-string argument is decoded before the Action runs (`Other` stays `string`). A new `complete_task` control tool applies the final payload change and completes in one turn; its `payloadChangeRequest` is a JSON string because the forced final turn is schema-constrained and an open object decodes as `{}`, and the final permitted turn now forces `complete_task` instead of `'none'` (downgraded to `'none'` for hybrid models). The Loop system prompt's implicit mode no longer tells the model to answer in a JSON envelope, and unreadable JSON text is a Retry rather than a final answer that drops its payload. The Gemini driver records where a thought signature was minted and replays it only there, so a failover between Google AI Studio and Vertex AI no longer fails with a 400 "Corrupted thought signature." A model that rejects a forced tool choice gets `'auto'` instead: Claude Opus 5.5 and Sonnet 5.5 through a new catalog flag, `LLM.SupportsForcedToolChoice: false`, and any Claude request using budget thinking in the Anthropic driver. Envelope and hybrid prompts render byte-identically.

- bea2386: A run can now be restricted to the credentials its caller supplied, so a customer's work never silently runs on the platform's AI keys.

  Key resolution matched per driver class and fell back to the platform for any class the run did not key. A host running work on a customer's own key had no way to say "only these keys": when the customer's Google key was rejected, failover moved to Vertex, found no customer key, and finished the run on the platform's account — reporting success. Internal prompts that dropped `apiKeys` (AI JSON repair, the parallel result selector) reached the platform key the same way with no failover at all.
  - **`CredentialScope: 'Any' | 'RuntimeOnly'`** (`AICredentialScope` in `@memberjunction/ai`) on `ExecuteAgentParams` and `AIModelRunParams` (so `AIPromptParams`). Omitting the parameter means `'Any'`, which resolves keys as before (the fixes below change some defaults regardless). `'RuntimeOnly'` allows only `apiKeys` and a prompt's per-request `credentialId`: every platform source — `AICredentialBinding`s, the vendor's default credential and `AI_VENDOR_API_KEY__*` — is skipped.
  - Every scope decision goes through `CredentialScopeAllows(scope, source)` in `@memberjunction/ai`, where `source` is an `AICredentialSource` — `'Runtime'`, `'PlatformCredential'` or `'Environment'`. Its exhaustive switch makes a new scope value a compile error until it is answered, and an unknown value at runtime throws rather than falling back to the platform.
  - Enforced in `BaseModelRunner.HasCredentialsAvailable` and `ResolveCredentialForExecution`, which every runner shares. Because candidate selection uses the first, failover stays on vendors the caller keyed; a run they do not cover fails with "No suitable model found … credential scope is RuntimeOnly" instead of running on the platform's key.
  - `BaseAgent` carries the scope to every prompt, sub-agent, action, realtime delegate and realtime session in the run. `GetAIAPIKey` and `MakeAIAPIKeyResolver` take an optional `scope`; `RealtimeClientSessionService` drops its `getAPIKeyForDriver` seam under `'RuntimeOnly'`; image and media runner params gain `CredentialScope`.
  - `@memberjunction/actions-base`: `RunActionParams.CredentialScope` (`RuntimeCredentialScope`). Under `'RuntimeOnly'` the `RuntimeAPIKeyResolver`'s answer is final. `Generate Image` honours it, and Summarize Content, Run Ad-hoc Query, Execute AI Prompt and Execute Agent forward it to the prompt or agent they run — they are not handed the run's keys, so under `'RuntimeOnly'` they fail rather than spend the platform's.
  - Decision calls (FinishIf, decision requests, discovery, catalog narrowing, the payload change check) carry the run's execution scope through `AgentDecisionService` (`AgentDecisionAskParams.ExecutionScope`) to `AIDecisionRunner`, and `LLMDecision`'s own chat prompt runs under it (`LLMDecision.ExecutionScope`). Self-check rubrics do too: `ProviderRubricEngine`, `ProviderPromptService` and `ProviderDecisionService` take an optional execution scope, and the rubric evaluation agent runs under it.
  - A model driver is never constructed without a key under a scope that rules out environment keys: the OpenAI and Anthropic SDKs read `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` themselves when handed none, which parallel prompt tasks could reach.
  - Not covered by the scope: retrieval reranking and embeddings outside a prompt run (platform infrastructure), and agent-harness credential grants.
  - **Prompts started on a run's behalf now run under its scope** — user, provider, configuration, `apiKeys`, `credentialId`, `CredentialScope` — via the new `PickPromptExecutionScope` / `AIPromptExecutionScope`: AI JSON repair, the parallel `PromptSelector` judge, `BaseAgent`'s summarize-range and message-compaction sub-calls, conversation compaction (`CompactIfNeededInput.ExecutionScope`) and conversation naming. Each forwarded `contextUser` at most, so each ran on platform keys and the default configuration inside a customer's run. This applies whatever the scope.
  - `ErrorAnalyzer` classifies Google's invalid-key and expired-key responses ("API key not valid" / `API_KEY_INVALID`, "API key expired" / `API_KEY_EXPIRED`, HTTP 400) as `Authentication`. It fell through to `VendorValidationError`, so an invalid key failed over to another vendor instead of failing.
  - **A failed streaming call keeps its driver's classification.** `BaseLLM` rejects a failed stream with its `ChatResult`, not an `Error`. The prompt runner analyzed that object afresh, so an invalid key the driver classified `Authentication`/`Fatal` became `Unknown`/`Transient` with no message: failover continued onto the same dead key, agents retried the step up to their consecutive-failure limit, and every run recorded "Unknown error". `ErrorAnalyzer` now returns an `errorInfo` the value already carries, and the runner records a rejected `ChatResult` as an `Error` with its real message; any other rejected value is classified as itself before it is wrapped. Affects any streamed prompt with a non-retryable error, whatever the credential scope.

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
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
  - @memberjunction/ai-engine-base@6.2.0-edge.3
  - @memberjunction/ai-core-plus@6.2.0-edge.3
  - @memberjunction/templates@6.2.0-edge.3
  - @memberjunction/credentials@6.2.0-edge.3
  - @memberjunction/templates-base-types@6.2.0-edge.3

## 6.2.0-edge.2

### Minor Changes

- 79279f2: Text-to-speech, speech-to-text and video now have runners, like chat, embeddings and images.
  - **`AITextToSpeechRunner`** (`TTS` models), **`AISpeechToTextRunner`** (`Speech to Text` models) and **`AIVideoRunner`** (`Video` models) select a model from a carrier prompt's bindings, or a pinned `ModelID`, resolve its credential, fail over, and record every call as an AI Prompt Run. The run row never holds audio or video. Text-to-speech records the characters sent in the `Characters` measure unless the driver reports its own quantity; speech-to-text records the audio's seconds when the provider reports them; video records seconds only when a driver reports them, which HeyGen's does not. They share their lifecycle through a new `BaseMediaRunner`.
  - New metadata: the `Default Text To Speech`, `Default Speech To Text` and `Default Video Generation` prompts, which the runners use when no prompt is named.
  - **`BaseAudioGenerator` is split** into `BaseTextToSpeech` and `BaseSpeechToText`. `BaseAudioGenerator` is deprecated but keeps working: it implements both, and every driver still extends it and stays registered against it under the same key. `OpenAIAudioGenerator` also registers against both new classes, `ElevenLabsAudioGenerator` against `BaseTextToSpeech`, and `GroqAudioGenerator` against `BaseSpeechToText`. The split-and-join transcription loop is also exported as `TranscribeAudioWithSplitting`.
  - `VideoResult` gains an optional `usage`, for a driver that reports the video's length.
  - `SpeechResult` and `VideoResult` gain an optional `errorInfo`. The OpenAI, ElevenLabs, Groq and HeyGen audio and video drivers now fill it from the error their SDK threw, keeping its HTTP status, so a caller can tell a rejected request from an outage. The runners fail over on it: a 400 or 422 no longer fails over to every other candidate.
  - The media runners take `TimeoutMS` and `CancellationToken`, which bound each driver call as `timeoutMS` and `cancellationToken` bound a chat call.
  - `BaseModelRunner` gains `ResolveUsageToRecord` and `ApplyUsageToRunRecord`, which the image runner now uses too, so every non-chat runner records units the same way.

  Nothing called the audio or video drivers before, so no existing caller changes behavior.

- 3fbda62: Add `AIDecisionRunner`, which runs typed decisions (Likelihood, Choice, Score) on `Decision`-type models with model selection, failover, model limits and prompt-run telemetry, together with the `LLM Decision` model (under the `MemberJunction` vendor) and the `Default Decision` prompt. A higher-priority model skipped for lack of a credential is logged once per process, naming the `AI_VENDOR_API_KEY__<DRIVERCLASS>` variable that would enable it.
- ff00d60: Image generation now runs through a new `AIImageGenerationRunner`, which records every call as an AI Prompt Run and fails over between the image models that the new `Default Image Generation` prompt binds. Each run records the images it returned, so the models' existing `Per Image` cost rows price it. Run rows also record the calling agent. The Generate Image action uses the runner. With no Model named, the prompt's bindings choose; their first choice is the model the action picked before, and failover can reach the other vendor with the run's own key. A named Model is pinned, and fails over only between its own vendors. The action's key now ranks as it does for chat prompts: a credential binding, or a default credential of the vendor's credential type, wins over it. A call with no key the action can resolve now reaches the runner, where a binding may still apply. If none does, it fails with `GENERATION_FAILED` instead of `ACTION_FAILED`.
- 861cbf0: Follow-ups from the image runner review:
  - **Prompt model pinning**: Set `RequireSpecificModels: true` on the `Default Image Generation` carrier prompt (`metadata/prompts/.default-image-generation-prompt.json`), ensuring `AIImageGenerationRunner` only selects models explicitly bound to the prompt with supported drivers rather than falling back to unbound image models.
  - **`ResolveImageGenerationAPIKey` JSDoc**: Marked `ResolveImageGenerationAPIKey` in `@memberjunction/core-actions` as `@deprecated` with updated documentation clarifying it is retained for backwards compatibility, pointing callers to `BuildImageGenerationAPIKeys`.

- e51ce8a: Add `LLMDecision`, a `BaseDecision` driver that answers typed decision questions (Likelihood, Choice, Score) with a chat model through an MJ prompt, and the `LLM Decision` prompt it runs, bound to GPT-OSS-120B on Cerebras and Groq with GPT 5.5 Instant as the fallback. Choice and Score replies are normalised into probability distributions before `BaseDecision` validates them. A missing option or level counts as 0, but a value the model wrote that is not a usable number (such as `"80%"`, `null`, a negative, or a Likelihood of `85`) fails the decision instead of being guessed at.
- 14e2a3a: Retires the AI Prompt "Job Function and Seniority Derivation" (`7C46041F`) from MJ core (#4918). bizapps-common ships the same prompt with the same ID, so installing common on MJ 6.2 failed with a duplicate primary key. The prompt and its template, template content and template parameter are marked `deleteRecord`; the next metadata sync deletes them, and the prompt's two AI Prompt Models go with it through `spDeleteAIPrompt`'s cascade.

  Known gap: a database that already has bizapps-common 5.47 installed cannot upgrade to 6.2, because `V202609221852__v6.2.x__Metadata_Sync.sql` inserts a prompt model that duplicates common's on `UQ_AIPromptModel_Prompt_Model_Vendor_ConfigID` before this delete can run. Don't work around it by deleting common's prompt model, and don't fix it by guarding that migration's inserts alone. Once the migration completes on such a database, it overwrites common's prompt with MJ's version, and the metadata sync's `spDeleteAIPrompt` then deletes it: the prompt, its prompt models, prompt runs and result cache. It also sets `PromptID` to NULL on common's record processes. Tracked in #4939.

### Patch Changes

- eaa9455: Introduce `AIEmbeddingRunner` extending `BaseModelRunner` with `RequiredModelType = 'Embeddings'`.
  - Implement credential resolution, failover across candidate models/vendors, retry handling, and `MJAIPromptRun` persistence.
  - Deprecate `AIModelRunner.RunEmbedding` and delegate transparently to `AIEmbeddingRunner`.
  - Migrate embedding call sites in `@memberjunction/tag-engine`, `@memberjunction/ai-vector-dupe`, `@memberjunction/ai-vector-sync`, `@memberjunction/content-autotagging`, and `@memberjunction/search-engine` to use `AIEmbeddingRunner`.
  - `AIEmbeddingRunner` runs a driver that needs no API key (`LocalEmbedding`, `OllamaEmbedding`) with no key configured, and follows the prompt's `FailoverStrategy` (`SameModelDifferentVendor` never switches models).
  - With no Embedding prompt, the runner embeds under an unsaved stand-in and writes no run row. `EmbeddingRunParams.SkipRunRecord` skips the row on demand.
  - `TagEngine` embeds tags, queries and new tags with one model (the Tag Semantic Matching prompt's, else the smallest) and persists that ID.
  - Vector search keys its query-embedding cache by model and dimension, not by driver.
- 660ef45: Add a `RunDecision` GraphQL mutation and `GraphQLAIClient.RunDecision`, so browser code can run a typed decision in one round trip, under the same authorization as `RunAIPrompt`: the API-key `prompt:execute` scope is checked against the ID of the prompt that runs. The mutation refuses scope-limited sessions, and bounds the state and question sizes and the model-call timeout on the server. The `Run Decision` action's question validation moves unchanged to `ParseDecisionQuestions` in `@memberjunction/ai-prompts`, which the action and the mutation now share.
- 35ffb95: A decision answered by `LLMDecision` now carries its chat model's cost: the chat prompt's run is a child of the decision's run, and its cost is recorded as the decision run's `DescendantCost` and `TotalCost`, so an agent's `MaxCostPerRun` counts it. The cost is booked as a descendant only when the chat run was actually linked as a child; when the decision run's own INSERT failed, it stays the decision run's own `Cost`. When a decision fails over, every linked attempt's cost is kept, not only the answering attempt's. Once the chat run is saved, its saved cost is the one reported, so a runner-reported cost of 0 that the server reprices no longer overwrites the rollup.
- 5148534: A rerank answered by `LLMReranker` now carries its chat model's cost: the chat prompt's run is a child of the rerank's run, and its cost is recorded as the rerank run's `DescendantCost` and `TotalCost`. `RerankResponse` gains an optional `Usage`, which a reranker driver sets when it knows its call's tokens and cost.
- Updated dependencies [f555162]
- Updated dependencies [043f418]
- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [2552b1e]
- Updated dependencies [8fd1c46]
- Updated dependencies [21f9e15]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [f3c6161]
- Updated dependencies [01fafc6]
- Updated dependencies [5148534]
- Updated dependencies [0adaf76]
- Updated dependencies [ce1a5c3]
- Updated dependencies [ef43cf3]
- Updated dependencies [b44c7cf]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [705ab4e]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [bb33c77]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/ai-core-plus@6.2.0-edge.2
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/aiengine@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/ai-engine-base@6.2.0-edge.2
  - @memberjunction/templates@6.2.0-edge.2
  - @memberjunction/credentials@6.2.0-edge.2
  - @memberjunction/templates-base-types@6.2.0-edge.2

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

- 1d43161: Move the Loop agent's volatile runtime state out of the system prompt so provider prompt caches survive across iterations. Until now the Loop agent system prompt rendered the current date/time, Scratchpad State and Payload at its tail, and because those blocks change every iteration the provider's prefix cache broke before it reached the conversation history; measured on Sage the cached share of input was 37% and the entire history was re-read on every step. The template no longer renders those blocks. Instead `BaseAgent.preparePromptParams` builds the same content into a `<mj-runtime-state>` fragment appended as the final `user` message of each request, and the system prompt carries a static pointer telling the model where to find it. At send time the fragment tag literal is escaped in every history message so no tool result or user text can pose as framework state. This is framework behaviour, not a per-agent setting: there is no placement parameter. The fragment is emitted only when the system prompt template carries the `<mj-runtime-state>` pointer. A template that still embeds the state blocks (a database whose template has not yet synced, or the Flow template) gets no fragment, so the transition cannot produce duplicated state; a template with neither (the Harness system prompt, or a custom prompt run without the Loop system prompt) gets none either, so no agent receives an unexplained block. Only a failed template lookup fails open. `specializationPlacement` (`auto`, `systemPrompt`, `trailingMessage`) relocates the agent's own child prompt into the fragment when it contains volatile placeholders, so a per-iteration date in a child prompt cannot silently reintroduce the cache break. `AIPromptRunner` exposes `RenderChildPromptTemplates` publicly for the relocation path, and `AgentChatMessageMetadata` gains a `volatileState` flag so provider adapters can recognise the fragment.

  Two boundaries keep the fragment where it belongs. `prepareSubAgentMessages` drops `volatileState` messages before any message mode slices the parent history, so a sub-agent never sees the parent's payload, scratchpad or specialization and its `MaxMessages` window is spent on real turns. Under append-only retention, context recovery now frees retained fragments first — oldest first, all but the newest — before it touches tool results, and `TrimLastUserMessage` skips them, so a long run cannot overflow on state the next request re-sends anyway; the fragment carries `turnAdded` for the lifecycle. All placeholder names, tag literals and headings live in one `constants.ts`, and the unsync guard's markers are overridable through the protected `volatileTemplateMarkers` getter. The fragment is carried across iterations in a provider-aware way. Providers with block-level or sliding prefix caches (Anthropic, Gemini, Cerebras) get replace-in-place: only the latest fragment is attached, keeping the history compact. OpenAI and xAI (Grok) automatic caches reuse a prior request only when its entire prompt is a byte prefix of the new one, so for OpenAI and xAI prior fragments are retained and the new one appended, making each request an exact prefix extension of the last. The mode is chosen once per run by the new Loop agent prompt param `trailingStateMode` (`auto`, `appendOnly`, `replace`). Which providers need which is metadata, not code: `auto` reads the new `PrefixPromptCache` boolean from the model catalog's `ModelConfiguration` cascade through `BaseAgent.resolvePrefixPromptCache` and `AIEngine.GetEffectiveModelConfiguration`, for the model of the runtime override or of the first iteration's selection, then freezes that answer so a mid-run failover cannot flip the layout; `true` means append-only, anything else replace-in-place. The cascade gains a vendor layer for this: a migration adds a `Configuration` bag to `AIVendor` (JSONType `IAIVendorConfiguration`, a general-purpose vendor bag whose `ModelDefaults` key is a model-configuration bag), and the engine now resolves Model Types < Models < Vendors' `Configuration.ModelDefaults` < Model Vendors: the vendor default is the host-wide default for every model it serves and beats the model's own bag, merged per key, with the model-vendor row as the tie-breaker. `metadata/ai-vendors` sets `PrefixPromptCache: true` under `Configuration.ModelDefaults` on the OpenAI and x.ai vendor rows; every model they serve inherits it, and a model-vendor row can override it for one model on a host that diverges. `@memberjunction/ai` gains `AIVendorConfiguration` and `ParseVendorConfiguration` alongside. There is no vendor-name or driver-class matching. Turn 1, before any selection is known, uses replace-in-place; if turn 2 resolves to append-only, turn 1's fragment is spliced back at the turn-1 boundary, which reproduces the bytes an append-only turn 1 would have sent, so nothing is lost by deferring. The explicit values exist for a serving path whose catalog rows carry no strategy yet. `@memberjunction/ai` gains the framework-generic half of that: the `LLMConfigurationSettings.PrefixPromptCache` field and `IsPrefixPromptCache` in `modelConfiguration.ts`, and on `BaseLLM` the protected `isVolatileStateMessage` (the `volatileState` metadata flag), `trailingVolatileStateIndex` and `splitTrailingVolatileState` seam, with `VolatileStateMessageMetadata` and `TrailingVolatileStateSplit` as the shared shapes. The Anthropic adapter (`@memberjunction/ai-anthropic`) overrides `isVolatileStateMessage` to keep its tag-literal fallback and uses the split to recognise a trailing fragment, whether it is the last message or is followed by an assistant prefill, placing its ephemeral cache breakpoint on the last real history message instead and inserting an `OK` assistant turn when needed to preserve role alternation, so the stable history caches and only the fragment (and any prefill) is re-processed. Measured live on Sage on iterations 3 and later: Claude Sonnet 4.6, Opus 5, and Opus 5.5 from 0% to 78–90% cached, Grok 4.7 from 21% to 91%, GPT 5.6 from 0% to 78%, Gemini 2.5/3.8 Flash from 30–37% to 66–75%, Cerebras GPT-OSS-120B from 65% to 96%; prompt cost per million tokens fell 37–80% depending on provider.

  Action execution gains a run-scoped circuit breaker in `BaseAgent.ExecuteSingleAction`, prompted by a bug this work exposed: `executeActionsStep` reported an action whose `ActionResult.Success` was `false` as successful, so agents retried unconfigured tools indefinitely. The step result now carries the action's real outcome, and the circuit breaker's three rules, checked fatal → identical-arguments → budget, bound retries. A fatal configuration error (API key missing or invalid, "not configured", credentials missing, "authentication failed") disables the action for the rest of the run; HTTP 401/403, "unauthorized" and "forbidden" are deliberately not fatal because they are usually per-resource or transient, and neither is a failure the model can fix itself: a message that names a parameter, or a call whose own arguments carried a credential (password, API key, token), falls through to the attempt budget instead. The identical-arguments rule: two failures with identical arguments (`IDENTICAL_FAILURE_THRESHOLD`) block further calls with those arguments, while different arguments still dispatch; argument identity is `normalizeActionParams`, keys sorted at every depth, in three protected layers a subclass can override. The attempt budget: five consecutive failures across any arguments (`ACTION_FAILURE_BUDGET`) disable the action for the run. A success resets both counters. Blocked calls return a `CircuitBreakerActionResult` in 0ms that names the rule that fired, and a `user`-role guidance message (`[CRITICAL/ACTION_UNAVAILABLE]`, `[CRITICAL/REPEATED_IDENTICAL_CALL]`, `[CRITICAL/ATTEMPTS_EXHAUSTED]` or `[WARNING/ACTION_FAILURE]`) is appended to the history so the model pivots instead of looping; the budget rule is reported ahead of the identical-arguments rule, since once the budget is spent no change of arguments can help. Calls made by the pipeline executor and by ForEach / While iterations bypass the breaker via a new optional `ExecuteSingleActionOptions.skipCircuitBreaker`, since those loops already account for failures per element, expect elements to be independent, and have no model in the loop to act on the guidance. Flow agents are exempt the same way through `BaseAgentType.UsesActionCircuitBreaker` (default true, false on `FlowAgentType`): their action nodes are chosen by the graph, whose failure paths may legitimately re-run a node with the same inputs, and no model reads a directive there, so the main loop passes the exemption and suppresses the directive for such steps. Metadata: the Loop agent type's `PromptParamsSchema` gains `specializationPlacement` and `trailingStateMode` and loses `volatileStatePlacement`; the system prompt template drops its volatile tail.

### Patch Changes

- 5da3ad2: Replace six regular expressions that CodeQL flagged as polynomial (`js/polynomial-redos`) with linear scans that match exactly the same text. Crafted provider error messages or prompt text could make the old expressions take quadratic time.
  - `ErrorAnalyzer` (`@memberjunction/ai`): the "missing field/property" checks and the JSON extraction from an error message. A third check, `/\w+\s+is\s+required/`, is removed: it only ran when the message didn't contain "required", so it could never match.
  - `AIPromptRunner` (`@memberjunction/ai-prompts`): trimming spaces and tabs from each stop sequence (still keeping leading and trailing newlines), and reading the MIME type from an artifact-manifest line.

  No behavior change. Each replacement is tested against the expression it replaces on a generated corpus, and against the repeated-input shapes CodeQL reported.

- 7110019: Removes dead failover candidate-building code from `AIPromptRunner`, and pins model type as a hard boundary for failover with a test.

  The typed-decision plan (#4660, Phase 0, Task 0.2) identified a failover type filter that compared model-type **name strings** from a denormalised view column, while the other three candidate filters compare `AIModelTypeID` with `UUIDsEqual`. That filter lived in `buildFailoverCandidates` (and its helper `createCandidatesFromModels`), and **nothing calls either method**. The live failover path, `executeModelWithFailover` → `selectFailoverCandidates`, only reorders and filters the `allCandidates` list produced by model selection, which already filters by type ID. So for a prompt whose `AIModelTypeID` is set, failover never crossed types, and the name-string comparison was unreachable. A prompt whose `AIModelTypeID` is null is treated as "any type" by selection, and so by failover, before and after this change; the runner's `RequiredModelType` floor, later in this series, closes that case.
  - Removes two unused protected methods, `buildFailoverCandidates` and `createCandidatesFromModels`, and the doc comment that still listed them, so Task 0.3 has less to move into the shared runner base. Nothing in MJ called them, so runtime behaviour is unchanged. A subclass that overrode either method must drop the override (TypeScript reports TS4113), and one that called it through `super` must stop.
  - Adds `AIPromptRunner.failover.test.ts` › "failover never crosses model types". For a prompt whose `AIModelTypeID` is the LLM type, a credentialed embeddings model out-ranks every LLM in the catalog, every LLM call fails, and the test asserts the runner walks the LLM candidates without ever calling the embeddings model. Removing the ID filter from `getModelPoolForStrategy` makes it fail, with the embeddings model tried first.

- 7110019: Extract `BaseModelRunner` and shared model-run types. A behaviour-neutral move (typed-decision plan, #4660, Phase 0 Task 0.3).
  - Move shared parameter/result types to `@memberjunction/ai-core-plus`
  - Introduce `BaseModelRunner` abstract base in `@memberjunction/ai-prompts`. It declares `RequiredModelType`, a model-type name that a later change in this series enforces; nothing reads it yet. Its protected API is still settling across that series.
  - Reparent `AIPromptRunner` onto `BaseModelRunner` (behavior-neutral). `AIPromptRunner` still logs uncategorized errors under `AIPromptRunner`; a runner that does not override `DefaultLogCategory` logs them under `BaseModelRunner`.
- f2a4171: A runner's `RequiredModelType` is now a hard floor on model selection. For `AIPromptRunner` that type is `LLM`.
  - A prompt whose `AIModelTypeID` is empty now draws only models of the runner's required type. Previously it could select a model of any type, such as an embeddings or realtime model with a high `PowerRank`.
  - A prompt whose `AIModelTypeID` names a different type now fails with an error naming both types, instead of running.
  - Prompt model bindings (`AIPromptModel`) that point at a model of another type are skipped, and the skip is logged.
  - An explicit model override (`override.modelId`, a scoped prompt config's `ModelID`, an eval matrix cell) that names a model of another type now fails with an error naming both types, instead of running a different model.

  On a clean install no shipped prompt is affected: every stock prompt leaves `AIModelTypeID` empty, and the only non-LLM bindings are the two embedding prompts, which the embeddings runner runs rather than `AIPromptRunner`.

- e482249: The failover loop moves into `BaseModelRunner` as a generic `ExecuteWithFailover` for prompt-based runners, with no behaviour change. The runner supplies the model call on each candidate and the final error result as callbacks; `AIPromptRunner.executeModelWithFailover` keeps its signature and delegates to it. `processFailoverError`, `updatePromptRunWithFailoverFailure` and `createFailoverErrorResult` are `private` again, as they were before `BaseModelRunner`.
- 37e2f6b: Refactor the prompt-run persistence lifecycle: the chat-specific request and result fields move from `BaseModelRunner` to `AIPromptRunner`, and `BaseModelRunner` gains `CreateRunRecord` and `FinalizeRunRecord` for prompt-based runners.
  - `FinalizeRunRecord` takes the call's outcome and writes `Success` and `Status` (`Completed` or `Failed`) itself, before the runner's result callback runs, so no runner can leave a row at `Running`.
  - Every `MJ: AI Prompt Runs` field the chat runner writes has the same value as before. The one difference is on an error path: if the chat runner's result callback throws, the row now ends `Completed` or `Failed` instead of staying `Running` (the error is still logged under `PromptRunUpdate`).
  - `createPromptRun` and `updatePromptRun` keep their signatures and are `private` again, as they were before `BaseModelRunner`.
  - The five members `BaseModelRunner` shares with its subclasses that had `private` camelCase names before it existed are PascalCase, like the rest of its protected API: `BuildModelVendorCandidates`, `HasCredentialsAvailable`, `ResolveCredentialForExecution`, `IsInferenceProvider`, `ApplyRetryDelay`. None has shipped, so there are no deprecated aliases.

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
- Updated dependencies [a7da50b]
- Updated dependencies [1d43161]
- Updated dependencies [7110019]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
  - @memberjunction/aiengine@6.2.0-edge.1
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/ai-core-plus@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/credentials@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/templates@6.2.0-edge.1
  - @memberjunction/ai-engine-base@6.2.0-edge.1
  - @memberjunction/templates-base-types@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- b518dfa: fix(ai): a vendor spend cap now fails over instead of failing the prompt silently.
  - `ErrorAnalyzer` classified Anthropic's "You have reached your specified API usage limits" (sent as HTTP 400 `invalid_request_error`) as `InvalidRequest`, which may not fail over — so every prompt whose top candidate was a capped vendor failed outright. It is now `NoCredit`, which fails over to the next vendor.
  - `AIPromptRunner` returned a failed result that could not fail over through its success path with nothing logged. It still returns it as-is, but now logs the error type, message, prompt, model and vendor.

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
  - @memberjunction/ai-core-plus@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/ai-engine-base@6.2.0-edge.0
  - @memberjunction/templates@6.2.0-edge.0
  - @memberjunction/credentials@6.2.0-edge.0
  - @memberjunction/templates-base-types@6.2.0-edge.0
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

### Patch Changes

- 1940a4d: Recover LLM responses broken by a single unescaped character, and stop misreporting why they broke.

  Models embed rich markdown in JSON string fields — mermaid diagrams, HTML mockups, code samples — and reliably escape most of it. One missed quote inside a 25KB response invalidates the whole document. Three defects meant that was unrecoverable and misdiagnosed.

  **`CleanJSON` discarded the response over an interior fence.** Once the top-level parse failed for any reason, fence extraction ran unconditionally. That regex has no idea it is looking inside a string value, so a ` ```mermaid ` fence embedded in a markdown field matched, its contents were extracted, the JSON envelope was thrown away, and `CleanJSON` recursed into the fragment. A 28KB agent response with one unescaped quote at offset 23011 was reported as `Unexpected token 'm', "mermaid\ns"...`. Fence extraction now skips input already shaped like a JSON envelope — a genuinely fence-wrapped response starts with the fence and a prose-buried one starts with prose, so neither is affected. The throw also carries the untouched parse error as `cause`.

  **The repair chain reasoned from the wrong error.** `attemptJSONRepair` received whatever escaped `JSON.parse(CleanJSON(rawOutput))`, which may describe one of `CleanJSON`'s intermediate transforms rather than the model's actual output. That message was handed to the AI repair prompt as `ERROR_MESSAGE`, recorded on the prompt run, and re-thrown — so a model was asked to fix an unexpected `'m'` in a mermaid fragment when the real defect was one quote at a known offset, in text it was never shown. `resolveTrueParseError` now derives the error from the raw output directly.

  **Nothing could repair an unescaped quote.** JSON5's leniency covers trailing commas, comments and unquoted keys, but an unescaped `"` terminates a string in JSON5 exactly as in JSON, leaving only an LLM round-trip on the full payload. New `RepairJSONEscaping()` in `@memberjunction/global` is error-driven and deterministic: read the failure offset, walk back to the character that ended the string early, escape it, re-parse, repeat. Every pass is validated by a real parse, so it cannot pattern-match its way to a wrong answer the way a global regex rewrite would, and it gives up rather than guessing when it cannot make progress. It runs in `attemptJSONRepair` between the JSON5 and AI stages — microseconds against an LLM round-trip, and it cannot invent content. `_jsonRepairInfo` gains a `LexicalEscaping` method and records the offsets escaped, because that repair infers intent and should never be invisible.

  Replayed against 16 real failing production payloads: 16/16 recovered, 180 characters escaped, 12ms total. Each repair verified escapes-only — removing the inserted backslashes reconstructs the original byte-for-byte — with a valid response shape. Against 34 already-valid payloads, 20 containing markdown fences: zero false positives. The production failure that motivated this had burned all ten agent retries, roughly four minutes and 79K completion tokens, before terminating; it now recovers in 0.61ms with the AI stage never reached.

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
- Updated dependencies [4586215]
- Updated dependencies [22ec804]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
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
- Updated dependencies [a77afac]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
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
- Updated dependencies [1748491]
- Updated dependencies [1100077]
- Updated dependencies [4cdfdcf]
- Updated dependencies [0db6105]
- Updated dependencies [d7feeae]
- Updated dependencies [7fefca2]
- Updated dependencies [a1a8989]
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
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [394d276]
- Updated dependencies [1c0d586]
  - @memberjunction/ai-core-plus@6.1.0
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/aiengine@6.1.0
  - @memberjunction/ai-engine-base@6.1.0
  - @memberjunction/ai@6.1.0
  - @memberjunction/credentials@6.1.0
  - @memberjunction/templates@6.1.0
  - @memberjunction/templates-base-types@6.1.0

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
  - @memberjunction/ai-engine-base@6.1.0-edge.7
  - @memberjunction/aiengine@6.1.0-edge.7
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/ai-core-plus@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/credentials@6.1.0-edge.7
  - @memberjunction/templates-base-types@6.1.0-edge.7
  - @memberjunction/templates@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [634aa8c]
- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
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
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [a77afac]
- Updated dependencies [98841bb]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [0db6105]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/ai-core-plus@6.1.0-edge.6
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/aiengine@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/credentials@6.1.0-edge.6
  - @memberjunction/ai-engine-base@6.1.0-edge.6
  - @memberjunction/templates@6.1.0-edge.6
  - @memberjunction/templates-base-types@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- 1940a4d: Recover LLM responses broken by a single unescaped character, and stop misreporting why they broke.

  Models embed rich markdown in JSON string fields — mermaid diagrams, HTML mockups, code samples — and reliably escape most of it. One missed quote inside a 25KB response invalidates the whole document. Three defects meant that was unrecoverable and misdiagnosed.

  **`CleanJSON` discarded the response over an interior fence.** Once the top-level parse failed for any reason, fence extraction ran unconditionally. That regex has no idea it is looking inside a string value, so a ` ```mermaid ` fence embedded in a markdown field matched, its contents were extracted, the JSON envelope was thrown away, and `CleanJSON` recursed into the fragment. A 28KB agent response with one unescaped quote at offset 23011 was reported as `Unexpected token 'm', "mermaid\ns"...`. Fence extraction now skips input already shaped like a JSON envelope — a genuinely fence-wrapped response starts with the fence and a prose-buried one starts with prose, so neither is affected. The throw also carries the untouched parse error as `cause`.

  **The repair chain reasoned from the wrong error.** `attemptJSONRepair` received whatever escaped `JSON.parse(CleanJSON(rawOutput))`, which may describe one of `CleanJSON`'s intermediate transforms rather than the model's actual output. That message was handed to the AI repair prompt as `ERROR_MESSAGE`, recorded on the prompt run, and re-thrown — so a model was asked to fix an unexpected `'m'` in a mermaid fragment when the real defect was one quote at a known offset, in text it was never shown. `resolveTrueParseError` now derives the error from the raw output directly.

  **Nothing could repair an unescaped quote.** JSON5's leniency covers trailing commas, comments and unquoted keys, but an unescaped `"` terminates a string in JSON5 exactly as in JSON, leaving only an LLM round-trip on the full payload. New `RepairJSONEscaping()` in `@memberjunction/global` is error-driven and deterministic: read the failure offset, walk back to the character that ended the string early, escape it, re-parse, repeat. Every pass is validated by a real parse, so it cannot pattern-match its way to a wrong answer the way a global regex rewrite would, and it gives up rather than guessing when it cannot make progress. It runs in `attemptJSONRepair` between the JSON5 and AI stages — microseconds against an LLM round-trip, and it cannot invent content. `_jsonRepairInfo` gains a `LexicalEscaping` method and records the offsets escaped, because that repair infers intent and should never be invisible.

  Replayed against 16 real failing production payloads: 16/16 recovered, 180 characters escaped, 12ms total. Each repair verified escapes-only — removing the inserted backslashes reconstructs the original byte-for-byte — with a valid response shape. Against 34 already-valid payloads, 20 containing markdown fences: zero false positives. The production failure that motivated this had burned all ten agent retries, roughly four minutes and 79K completion tokens, before terminating; it now recovers in 0.61ms with the AI stage never reached.

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [22ec804]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [905820a]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/aiengine@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-core-plus@6.1.0-edge.5
  - @memberjunction/ai-engine-base@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/templates@6.1.0-edge.5
  - @memberjunction/credentials@6.1.0-edge.5
  - @memberjunction/templates-base-types@6.1.0-edge.5

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
  - @memberjunction/ai-engine-base@6.1.0-edge.4
  - @memberjunction/ai-core-plus@6.1.0-edge.4
  - @memberjunction/templates@6.1.0-edge.4
  - @memberjunction/credentials@6.1.0-edge.4
  - @memberjunction/templates-base-types@6.1.0-edge.4

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
  - @memberjunction/aiengine@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/ai-engine-base@6.1.0-edge.3
  - @memberjunction/credentials@6.1.0-edge.3
  - @memberjunction/templates-base-types@6.1.0-edge.3
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
- Updated dependencies [97cbf5f]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/ai-engine-base@6.1.0-edge.2
  - @memberjunction/aiengine@6.1.0-edge.2
  - @memberjunction/credentials@6.1.0-edge.2
  - @memberjunction/templates-base-types@6.1.0-edge.2
  - @memberjunction/templates@6.1.0-edge.2

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
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/aiengine@6.1.0-edge.1
  - @memberjunction/ai-engine-base@6.1.0-edge.1
  - @memberjunction/credentials@6.1.0-edge.1
  - @memberjunction/templates-base-types@6.1.0-edge.1
  - @memberjunction/templates@6.1.0-edge.1
  - @memberjunction/ai@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

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
  - @memberjunction/ai-engine-base@6.1.0-edge.0
  - @memberjunction/ai-core-plus@6.1.0-edge.0
  - @memberjunction/credentials@6.1.0-edge.0
  - @memberjunction/templates-base-types@6.1.0-edge.0
  - @memberjunction/templates@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-engine-base@6.0.0
  - @memberjunction/ai-core-plus@6.0.0
  - @memberjunction/aiengine@6.0.0
  - @memberjunction/credentials@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/templates-base-types@6.0.0
  - @memberjunction/templates@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ai-engine-base@5.51.0
  - @memberjunction/ai-core-plus@5.51.0
  - @memberjunction/aiengine@5.51.0
  - @memberjunction/credentials@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/templates-base-types@5.51.0
  - @memberjunction/templates@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Minor Changes

- 12691e3: Content autotagging: metadata-driven vector config, chunk purge + backfill, and parity with the entity-vectorization pipeline

  Brings the ContentSource / autotag embedding pipeline (`AutotagBaseEngine`) up to parity with the
  EntityDocument pipeline, and wires up chunk lifecycle operations. All additive and opt-in — existing
  setups behave identically. No schema/migration changes (config rides the `Configuration` JSONType).
  - **Metadata-driven vector config** on the `Configuration` JSONType of both `ContentSource` and
    `ContentType` (ContentSource overrides ContentType, then a hardcoded default):
    - **`VectorIDStrategy`** (`'hash' | 'recordId'`, default `'recordId'`): `'recordId'` uses each
      chunk's own id as its vector-DB id (purge-safe); `'hash'` is 5.49 EntityDocument parity and
      unsafe with re-chunk + purge (documented).
    - **`ChunkTextStorage`** (`'mixed' | 'alwaysChunk'`, default `'alwaysChunk'`): `'alwaysChunk'`
      writes a `ContentItemChunk` row for every item and leaves `ContentItem.VectorRecordID` null;
      `'mixed'` keeps single-chunk items' text/vector on the ContentItem.
    - **`VectorMetadata`** — full structural parity with the entity pipeline's metadata control:
      `FieldStrategy: 'all' | 'include' | 'exclude' | 'explicit'` (unset ⇒ the curated content
      default, preserving historical behavior), per-field `Fields` overrides
      (`Included`/`TruncationLimit`/`StoreAs`), `DefaultTruncationLimit`,
      and `IncludeEntityIcon`/`IncludeUpdatedAt`/`IncludeTags`/`IncludeText` toggles. The runner mirrors
      the entity side's decomposition (system/icon/updatedAt/display-field helpers, StoreAs coercion,
      UUID normalization, truncation) driven off the ContentItem entity. Content-specific deviations:
      `Entity` is always kept under `'explicit'` (so results stay labeled; record id recovers from the
      vector id under the default `recordId` strategy), and `Tags` (not a ContentItem field) is a
      toggle rather than a discovered field.
  - **Chunk-Identity Contract** — chunk vectors now carry their own identity: `Entity='MJ: Content
Item Chunks'`, `RecordID=<ContentItemChunk.ID>`, `ContentItemID`, `Sequence`. The chunk row PK is
    minted up front and used as its identity (and, under `recordId`, its vector id), so a scoped
    search hit returns the matched **chunk** id (not just the parent content item id) with no
    search-side changes. Item-level ('mixed' single-chunk) vectors keep `MJ: Content Items` identity.
  - **`AutotagBaseEngine.EmbedPendingChunks(user, {maxItems})`** — (re)embeds persisted
    `ContentItemChunk` rows whose `EmbeddingStatus='Pending'`, for migration backfill and error
    recovery. Bounded per run + rate-limited; best-effort per chunk.
  - **Embedding dimensions** — the resolved infrastructure now carries `MJ: Vector Indexes.Dimensions`
    and threads it into the embedding call (new optional `Dimensions` on `AIModelRunner`'s
    `EmbeddingRunParams`, forwarded to `EmbedTexts`), so reduced-dimension indexes work in the autotag
    path and the dedup-check query embeds at the matching size.
  - **Provider routing** — the resolved infrastructure carries the parsed `VectorIndex.ProviderConfig`;
    per-record `providerTemporaryDirectives` are built via `VectorDBBase.BuildProviderDirectives`
    (e.g. Pinecone namespace from a configured source field) and `providerConfig` is passed to
    `CreateRecords`. Only invoked when the index actually has a ProviderConfig.
  - **`AutotagBaseEngine.PurgeDeletedChunks`** is now triggerable: the Autotag/Vectorize action gains
    optional **`Purge`** (Phase 4) and **`EmbedPendingChunks`** (Phase 3) params, both independent of
    Vectorize, both bounded by `MaxItems`, both best-effort.

  Behavior note: the default `ChunkTextStorage='alwaysChunk'` + `VectorIDStrategy='recordId'` means
  newly-embedded single-chunk items now get a `ContentItemChunk` row with a unique vector id instead
  of an item-level hash id. Already-embedded (`EmbeddingStatus='Complete'`) items are not reprocessed,
  so existing data is untouched until re-embedded; set `ChunkTextStorage='mixed'` per source to retain
  the item-level single-chunk behavior.

### Patch Changes

- 623dfc5: Break CodeGen FK cycle between AIAgentRun, AIPromptRun, and ConversationDetail. Move SummaryPromptRunID from ConversationDetail to a new ConversationCompactionRun audit table. Remove AgentRunID from AIPromptRun (derivable via AIAgentRunStep.TargetLogID). Remove agentRunId from AIPromptParams and all write sites across the prompt/agent stack.
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
  - @memberjunction/ai-core-plus@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/ai-engine-base@5.50.0
  - @memberjunction/aiengine@5.50.0
  - @memberjunction/credentials@5.50.0
  - @memberjunction/templates-base-types@5.50.0
  - @memberjunction/templates@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- c5e4b9e: Agent conversation compaction: durable cross-turn summaries stored on the conversation (Sequence + SummaryPromptRunID, budget knobs on AIAgentType/AIAgent, Compaction run steps), conversation-history retrieval tools (getMessageBySequence, getMessagesByRange, searchConversation, summarizeRange), edit handling with OriginalMessageChanged flagging and a wired chat edit affordance, plus hardening fixes: failed message expansions now surface a reason to the model (breaks an unbounded retry loop), json5 ESM import fix restores the local JSON-repair tier, and SQLConverter no longer truncates PG column comments at escaped apostrophes.
- b52ffa8: Fix four silent-failure bugs found while triaging the open issue backlog. Each one looked correct from the outside while doing nothing, or doing the wrong thing, at runtime. No schema changes.

  **`BaseLLM` silently truncated streamed responses (`@memberjunction/ai`).** The streaming chunk loop caught any mid-stream error, logged it, and then finalized the response as a **success**. A dropped connection, a provider fault, or an abort part-way through a stream produced truncated content that the caller was told was complete — under every provider, for every streaming consumer. Genuine failures now surface as failures; cancellation is still routed to the driver's `finalizeStreamingResponse`, since providers differ on whether an abort throws there or simply ends iteration.

  **No LLM driver honored `ChatParams.cancellationToken`** (13 provider packages). The field existed on `ChatParams` and zero drivers read it, so an aborted or timed-out request abandoned the promise while the socket kept streaming and pinning buffers. Now forwarded to the SDK across all 19 drivers — 13 fixed directly, the remaining 6 inheriting from `OpenAILLM` / `GeminiLLM` — on both the streaming and non-streaming paths. The mechanism differs per provider and was verified rather than assumed — Bedrock takes `abortSignal` (not `signal`); Ollama has no per-request hook at all, so the signal is threaded through a custom `fetch`; and `Inception` overrides both chat paths without calling `super`, so it does not inherit the fix from `OpenAILLM` despite appearing to. An abort is reported `Fatal` / `canFailover: false`, because `ErrorAnalyzer` otherwise classifies it as retriable — meaning a request the user just cancelled would have been retried.

  **Prompt execution could not be bounded (`@memberjunction/ai-prompts`, `@memberjunction/ai-core-plus`).** On the single-model path the model call was awaited with no bound unless the caller hand-supplied an `AbortSignal`, so a hung provider connection never resolved. Adds a per-request `AIPromptParams.timeoutMS` and a typed `AIPromptTimeoutError` that `ErrorAnalyzer` classifies as retriable, so a timeout now flows into the existing retry/failover machinery instead of hanging. The timeout and any caller-supplied token compose — neither is discarded. Enforcement lives in `executeModel`, the one method the parallel coordinator also inherits, so the single-model and parallel paths cannot diverge. (Issue #3064 was filed as "`AIPromptRunner` does not enforce `AIPrompt.TimeoutMS`", but that column does not exist — the bound could not be expressed at all. A prompt-level column is tracked separately in #3133.)

  **A malformed deny-list silently disarmed the Predictive Studio leakage guard** (`@memberjunction/predictive-studio*`, `@memberjunction/core-entities-server`, `@memberjunction/ng-dashboards`). Pasting a bracketed list into the pipeline editor produced `DenyFields: ["[CheckInTime", …, "Status]"]`; the deny-set then matched nothing, so the most dangerous leak columns trained completely unguarded and the save was accepted. The editor no longer manufactures the bad input, a new `MJMLTrainingPipelineEntityServer.ValidateAsync` rejects it at save, and the dominance threshold is clamped at enforcement time so rows written before this validation existed cannot disable the guard. Also unifies `DEFAULT_DOMINANCE_THRESHOLD`, which was defined twice with different values (`0.85` vs `0.6`) — agent-authored pipelines had been held to a materially laxer guard than hand-authored ones.

  **Dead CSS shipped to production (`@memberjunction/ng-dashboards`, `@memberjunction/ng-conversations`).** These packages build with bare `ngc` — no Sass step — so `styleUrls` content is embedded verbatim. Native CSS nesting makes `&:hover` accidentally work, but it cannot do string concatenation, so every `&__elem` / `&--modifier` rule was silently dropped. Three components were affected. **This resurrects styling that has never rendered**: the realtime media-surface tab bar had no active-tab indicator, and evidence playback had no active-turn highlight and no played-progress color on its waveform. A new `check:ui-ngc-scss` CI gate prevents the trap re-arming.

  Also fixes `@memberjunction/ai-azure`, whose unit tests had never actually run — the package had test files and a vitest config but no `test` script.

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
- Updated dependencies [9d6e3d9]
  - @memberjunction/core@5.49.0
  - @memberjunction/ai-core-plus@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/templates@5.49.0
  - @memberjunction/ai-engine-base@5.49.0
  - @memberjunction/aiengine@5.49.0
  - @memberjunction/credentials@5.49.0
  - @memberjunction/templates-base-types@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [c20723a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/ai-engine-base@5.48.0
  - @memberjunction/ai-core-plus@5.48.0
  - @memberjunction/aiengine@5.48.0
  - @memberjunction/credentials@5.48.0
  - @memberjunction/templates-base-types@5.48.0
  - @memberjunction/templates@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ai-engine-base@5.47.0
  - @memberjunction/ai-core-plus@5.47.0
  - @memberjunction/aiengine@5.47.0
  - @memberjunction/credentials@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/templates-base-types@5.47.0
  - @memberjunction/templates@5.47.0
  - @memberjunction/ai@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- ef3e802: feat(prompt-config): scope-aware prompt run-settings override (ScopedPromptConfig + resolver)

  The run-settings sibling of `ScopedPromptPart`. Where `ScopedPromptPart` scope-overrides a
  prompt's TEXT, `ScopedPromptConfig` scope-overrides a prompt's RUN SETTINGS — model/vendor, AI
  configuration, sampling knobs (temperature/topP/topK/minP/penalties/seed/stopSequences),
  response format, and effort level — for an `AIPrompt`, narrowed by the SAME polymorphic scope the
  agent runtime already carries (`PrimaryScopeEntity`/`PrimaryScopeRecordID` + `SecondaryScopes`).
  Any MJ app can tune which model a prompt runs on and how it samples, per scope, by editing rows.
  - **Entity** `__mj.ScopedPromptConfig` — scope columns (mirroring `ScopedPromptPart`) + nullable
    override columns; `Status`/`Priority`. Whole-row-wins by specificity (SecondaryScopes match >
    PrimaryScopeRecord > global, tie-broken by `Priority`); each non-null column overrides the
    prompt default, a NULL column inherits it.
  - **`ScopedPromptConfigResolver`** (`@memberjunction/ai-agents`) — cached on `AIEngine`
    (`ScopedPromptConfigs`); pluggable via `@RegisterClass`; resolves the single most-specific
    in-scope config. `ApplyScopedPromptConfig` overlays it onto the run params
    (model/vendor → `override`, configuration → `configurationId`, effort → `effortLevel`, sampling
    knobs → `additionalParameters`).
  - **`BaseAgent` wiring** — `preparePromptParams` resolves + applies the config using the run's
    existing scope, right before the params are returned. **Runtime-explicit overrides still win.**
  - `StopSequences` overlays as a trimmed `string[]` (the comma-delimited column is split before it
    reaches `additionalParameters`, matching the runner's array contract — not the raw string).
  - Unit tests for the resolver (cascade / priority / status / null-column inherit / runtime-wins,
    plus the StopSequences-array and ResponseFormat mappings).
  - **`@memberjunction/ai-prompts`** — two `AIPromptRunner` fixes:
    1. **Response format override is honored** — the run now prefers `additionalParameters.responseFormat`
       (set by `ApplyScopedPromptConfig`) over the prompt's own `ResponseFormat`, keeping `'Any'`-means-
       silent semantics. Previously a `ScopedPromptConfig.ResponseFormat` was a no-op (the runner only
       read `prompt.ResponseFormat`).
    2. **`Messages` logging** — records caller-supplied `conversationMessages` to `AIPromptRun.Messages`
       even without a template-rendered system prompt (previously dropped for the
       `templateMessageRole='none'` path, leaving `Messages` null).

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/ai-engine-base@5.46.0
  - @memberjunction/aiengine@5.46.0
  - @memberjunction/ai-core-plus@5.46.0
  - @memberjunction/credentials@5.46.0
  - @memberjunction/templates-base-types@5.46.0
  - @memberjunction/templates@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- Updated dependencies [572d219]
  - @memberjunction/ai-core-plus@5.45.1
  - @memberjunction/ai-engine-base@5.45.1
  - @memberjunction/aiengine@5.45.1
  - @memberjunction/templates@5.45.1
  - @memberjunction/ai@5.45.1
  - @memberjunction/credentials@5.45.1
  - @memberjunction/core@5.45.1
  - @memberjunction/core-entities@5.45.1
  - @memberjunction/global@5.45.1
  - @memberjunction/templates-base-types@5.45.1

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
- Updated dependencies [ad9f4a3]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/ai-engine-base@5.45.0
  - @memberjunction/aiengine@5.45.0
  - @memberjunction/ai-core-plus@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/credentials@5.45.0
  - @memberjunction/templates-base-types@5.45.0
  - @memberjunction/templates@5.45.0
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
  - @memberjunction/ai-engine-base@5.44.0
  - @memberjunction/ai-core-plus@5.44.0
  - @memberjunction/aiengine@5.44.0
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ai@5.44.0
  - @memberjunction/templates@5.44.0
  - @memberjunction/credentials@5.44.0
  - @memberjunction/templates-base-types@5.44.0

## 5.43.0

### Minor Changes

- 9f6aa87: Generic fire-and-forget save queue, realtime multi-agent floor control, and telemetry fixes.

  **Generic fire-and-forget save queue** (`@memberjunction/global`, `@memberjunction/core`, + adopters) — de-duplicates the hand-rolled "INSERT (fire-and-forget) → chained UPDATE" persistence pattern and makes the "stuck at Running" race structurally impossible:
  - `KeyedSerialTaskQueue` (`@memberjunction/global`) — entity-agnostic per-key serial task chain: same-key tasks serialize, different keys run concurrently, failures are tallied for `flush()` and never propagate. Self-bounding (in-flight set + failure counters), so a long-lived queue that never flushes doesn't grow.
  - `BaseEntitySaveQueue` (`@memberjunction/core`) — entity façade: `Insert` / `Update(entity, applyMutation?)` / `Flush`, with an optional `onError` hook for structured logging. `Update`'s mutation runs _inside_ the post-INSERT task, so it can never be reverted by the INSERT's reload.
  - Adopted in all three hand-rolled copies + the new consumer: `GenericProcessRunTracker` (`@memberjunction/record-set-processor`), `AgentRunStepSaveQueue` (`@memberjunction/ai-core-plus`), `ActionEngine`'s execution log (`@memberjunction/actions`), and `AIPromptRunner` / `AIModelRunner` (`@memberjunction/ai-prompts`). Also fixes a pre-existing `MJLruCache` mock gap in the Actions/Engine test suite.

  **Realtime** (`@memberjunction/ai`, `@memberjunction/ai-bridge-server`, `@memberjunction/ai-gemini`, `@memberjunction/ai-openai`, `@memberjunction/livekit-room-server`, `@memberjunction/ng-livekit-room`) — multi-agent floor control, Gemini meeting mode, the session capability surface with first-agent re-gating, and an idle reaper.

  **Telemetry / core** (`@memberjunction/core`, `@memberjunction/server`) — cacheability-aware duplicate-RunView suggestion for `AllowCaching=false` entities; fixes the telemetry pagination-fingerprint false-duplicate and batches the janitor channel reads.

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ai-core-plus@5.43.0
  - @memberjunction/ai@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/ai-engine-base@5.43.0
  - @memberjunction/aiengine@5.43.0
  - @memberjunction/credentials@5.43.0
  - @memberjunction/templates-base-types@5.43.0
  - @memberjunction/templates@5.43.0

## 5.42.0

### Patch Changes

- 256ab06: Fix agent-run steps (and prompt runs) occasionally stuck at `Status='Running'` / `CompletedAt=NULL`.

  When a step finished fast enough that its fire-and-forget INSERT was still in flight, the in-memory
  finalize mutation (`Completed`) was reverted by the INSERT's post-save reload
  (`BaseEntity.finalizeSave` → `init()` + `SetMany(insertedRow)`), and the chained force-persisted UPDATE
  then wrote the stale `Running` row. Predominantly hit fast Actions, but any fast step (e.g. a
  quick/cached prompt) could be affected.

  The fire-and-forget save queue now applies finalize/`TargetLogID` mutations INSIDE the post-INSERT
  continuation (after the reload), so they survive: `AgentRunStepSaveQueue.QueueUpdate` gains an optional
  `applyMutation` callback, `finalizeAgentRunStep` gains a `completedAt` option for deterministic re-apply,
  and `BaseAgent.finalizeStepEntity` + the three `TargetLogID` callback sites re-assert their values
  post-INSERT. `AIPromptRunner.updatePromptRun` now awaits the initial INSERT before mutating the final
  state. This mirrors the already-correct `ActionEngine.finalizeActionLog` pattern (which has zero stuck
  rows). Adds regression tests covering the race and the legacy clobber.

  Also removes a per-chunk `console.log` in `RunAIAgentResolver`'s streaming callback (debug noise that
  became hot once single-model prompt streaming was enabled).

- c871a4d: Reuse model selection's credential probes in the failover loop instead of recomputing them.

  `selectModelWithAPIKeyTracked` already walks the priority-ordered candidate list and probes
  `hasCredentialsAvailable` until it finds the highest-priority credentialed candidate. Last night's
  failover fix (skip uncredentialed candidates) re-derived those same probes from scratch inside
  `executeModelWithFailover`, duplicating work selection had already done.

  `selectModel` now threads the credential-availability it computed (keyed `driverClass:modelID:vendorId`,
  the same key the failover loop uses) through `ModelSelectionResult` →
  `executeWithValidationRetries` → `executeModelWithFailover`, which seeds its failover credential cache
  from it. On the happy path failover does ZERO redundant `hasCredentialsAvailable` calls; the
  not-evaluated tail (intentionally absent from the map, preserving the selection short-circuit) is still
  probed lazily only if a real failure forces failover to walk down to it. No behavior change — purely
  removes recomputation. Adds regression tests covering the reuse, the seeded-map authority, and the
  lazy tail probe.

  Also unifies the parallel execution path with the single-model path to eliminate logic drift.
  `ParallelExecutionCoordinator` now extends `AIPromptRunner` and delegates each task's model call to
  the inherited `executeModel`, so credential resolution (full hierarchical chain, not just legacy env
  keys), driver/vendor selection, ChatParams construction (temperature/topP/effort/stop/response-format/
  prefill), media handling, and streaming all live in ONE place. This removes the coordinator's duplicate
  `buildMessageArray`/`Provider`/credential logic, fixes the `model.DriverClass` fallback that diverged
  from the single path, and fixes a latent bug where per-task model parameters mutated the shared params
  object. The base resolves the coordinator via the ClassFactory (`@RegisterClass`) to avoid a circular
  import. Streaming is now also wired on the single-model path (`params.onStreaming`), which previously
  hardcoded `StreamingEnabled = false`. Adds tests that lock in the inheritance/delegation so the paths
  can't silently drift again.

- d185a5c: Fix model vendor driver resolution by threading full ModelSelectionResult through the execution pipeline instead of discarding and re-deriving vendor data at the ExecutePrompt → executeSinglePrompt boundary
- Updated dependencies [256ab06]
- Updated dependencies [9b9b484]
- Updated dependencies [e7c2437]
- Updated dependencies [37c73f6]
- Updated dependencies [0c6bf61]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/ai-core-plus@5.42.0
  - @memberjunction/core@5.42.0
  - @memberjunction/templates@5.42.0
  - @memberjunction/aiengine@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/ai-engine-base@5.42.0
  - @memberjunction/credentials@5.42.0
  - @memberjunction/templates-base-types@5.42.0
  - @memberjunction/ai@5.42.0

## 5.41.0

### Minor Changes

- a5f5472: Remote Browser channel + new realtime voice providers + computer-use enrichment.
  - **Remote Browser channel** (`@memberjunction/remote-browser-*`): an in-house realtime channel where an agent drives a live, CDP-connected browser while it talks (sales demos, support walkthroughs, trainer agents). New `AIRemoteBrowserProvider` registry (migration V202606161000) with JSONType capability gating; a universal `remote-browser-base` (driver family + `RemoteBrowserEngineBase`), a shared `remote-browser-cdp` kit (one lossless action mapper + `CdpRemoteBrowserSession`), a `remote-browser-server` engine + `RemoteBrowserChannel` (control arbiter, control modes AgentOnly/ViewOnly/Collaborative vs strategies ComputerUse/NativeAI), and five thin backends (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).
  - **computer-use** enriched additively into a complete browser-I/O + perception engine: CSS-selector-aware actions, CDP screencast, MouseMove, accessibility-snapshot/QueryElement/GetVisibleText/GetTitle/WaitForLoadState — every consumer benefits, existing vision/coordinate path unchanged.
  - **New realtime model providers**: xAI Grok Voice (`@memberjunction/ai-xai`, OpenAI-Realtime-compatible) and Inworld (`@memberjunction/ai-inworld`), with vendor/model seeds.
  - **Console logging improvements** across `@memberjunction/ai-core-plus`, `ai-engine-base`, `ai-prompts`, `aiengine`, `cli`, `generic-database-provider`, `metadata-sync`, and the bootstrap/forms packages.

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
- Updated dependencies [4b3fb9d]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ai@5.41.0
  - @memberjunction/aiengine@5.41.0
  - @memberjunction/ai-engine-base@5.41.0
  - @memberjunction/ai-core-plus@5.41.0
  - @memberjunction/credentials@5.41.0
  - @memberjunction/templates-base-types@5.41.0
  - @memberjunction/templates@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai-engine-base@5.40.2
- @memberjunction/ai@5.40.2
- @memberjunction/ai-core-plus@5.40.2
- @memberjunction/aiengine@5.40.2
- @memberjunction/credentials@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2
- @memberjunction/templates-base-types@5.40.2
- @memberjunction/templates@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-engine-base@5.40.1
  - @memberjunction/ai-core-plus@5.40.1
  - @memberjunction/aiengine@5.40.1
  - @memberjunction/credentials@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/templates-base-types@5.40.1
  - @memberjunction/templates@5.40.1
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
  - @memberjunction/ai-engine-base@5.40.0
  - @memberjunction/ai-core-plus@5.40.0
  - @memberjunction/aiengine@5.40.0
  - @memberjunction/credentials@5.40.0
  - @memberjunction/templates-base-types@5.40.0
  - @memberjunction/templates@5.40.0
  - @memberjunction/ai@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Minor Changes

- 1b0f355: Loop agent prompt improvements for cache optimization. Capture cache-read and cache-write token counts from every LLM provider that reports them (Anthropic, OpenAI, Gemini, Groq, Cerebras, Fireworks, Azure, Bedrock) and surface them on AI Prompt Runs and Agent Runs. Adds `CacheReadTokens`/`CacheWriteTokens` columns to `AIPromptRun` (migration included — run CodeGen after applying), normalizes cache-token accounting in `baseModel` so usage totals are consistent across providers, and enables Gemini implicit/explicit cache reporting. The Prompt Run form and Agent Run analytics now display cache hit/write token breakdown
- 34fe6d1: Capture and surface AI prompt-cache cost across providers — OpenRouter provider-reported cost passthrough; per-model cache read/write pricing on AI Model Costs with cache-aware cost calculation; cache-token rollups on AI Prompt Runs and Agent Runs; and cache hit-rate + dollar-savings analytics across the AI dashboards (Cost & Budget, Model Performance, Prompt Runs, Usage Patterns, Executive Summary) and the prompt-run / agent-run detail views. Includes a migration adding cache columns — run CodeGen after applying.

### Patch Changes

- 8c39dd9: Wire Prompt.ModelSpecificResponseFormat through AIPromptRunner to the Gemini provider, and map responseFormat correctly so JSON mode sets responseMimeType=application/json and ModelSpecific applies the prompt-supplied config (e.g. responseSchema) to the Gemini model options.
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [d1cc0ad]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/ai-core-plus@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0
  - @memberjunction/ai-engine-base@5.39.0
  - @memberjunction/aiengine@5.39.0
  - @memberjunction/credentials@5.39.0
  - @memberjunction/templates-base-types@5.39.0
  - @memberjunction/templates@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [6b6c321]
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [8bd97f3]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/ai-core-plus@5.38.0
  - @memberjunction/aiengine@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/ai-engine-base@5.38.0
  - @memberjunction/templates@5.38.0
  - @memberjunction/credentials@5.38.0
  - @memberjunction/templates-base-types@5.38.0
  - @memberjunction/ai@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [22b775f]
- Updated dependencies [4f15f31]
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ai-engine-base@5.37.0
  - @memberjunction/aiengine@5.37.0
  - @memberjunction/templates@5.37.0
  - @memberjunction/credentials@5.37.0
  - @memberjunction/templates-base-types@5.37.0
  - @memberjunction/ai@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ai-engine-base@5.36.0
  - @memberjunction/ai-core-plus@5.36.0
  - @memberjunction/aiengine@5.36.0
  - @memberjunction/credentials@5.36.0
  - @memberjunction/templates-base-types@5.36.0
  - @memberjunction/templates@5.36.0
  - @memberjunction/ai@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- 32c4a02: Unify artifact and attachment delivery paths for AI agents. Seperate artifact storage from rendering. Every attachement now creates paired Artifact + ArtifactVersion and routing functions exist to replace hardcoded MIME allowlist. Unregistered file types are rejected at upload time unless the agent opts into AcceptUnregisteredFiles. Adds wildecard MIME resolver. `mj artifacts reclassify` for legacy rows
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
  - @memberjunction/ai-core-plus@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/ai-engine-base@5.35.0
  - @memberjunction/aiengine@5.35.0
  - @memberjunction/credentials@5.35.0
  - @memberjunction/templates-base-types@5.35.0
  - @memberjunction/templates@5.35.0
  - @memberjunction/ai@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [5abf790]
  - @memberjunction/core@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/ai-engine-base@5.34.1
  - @memberjunction/aiengine@5.34.1
  - @memberjunction/credentials@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/templates-base-types@5.34.1
  - @memberjunction/templates@5.34.1
  - @memberjunction/ai@5.34.1
  - @memberjunction/global@5.34.1

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
  - @memberjunction/ai-engine-base@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/aiengine@5.34.0
  - @memberjunction/credentials@5.34.0
  - @memberjunction/templates-base-types@5.34.0
  - @memberjunction/templates@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0

## 5.33.0

### Minor Changes

- 7716c98: metadata

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ai-engine-base@5.33.0
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/aiengine@5.33.0
  - @memberjunction/credentials@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/templates-base-types@5.33.0
  - @memberjunction/templates@5.33.0
  - @memberjunction/ai@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ai-engine-base@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/aiengine@5.32.0
  - @memberjunction/credentials@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/templates-base-types@5.32.0
  - @memberjunction/templates@5.32.0
  - @memberjunction/ai@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- 6779c1e: Lazy field hydration in BaseEntity + smarter engine startup (~30x warm-load speedup, ~14s to ~470ms). Defers per-row Field construction until something mutates or walks Fields, removes a speculative per-view fast-start path, adds a `deferred` flag to `@RegisterForStartup` and an `EnsureLoaded()` shortcut on `BaseEngine` / `AIEngine`. DeveloperModeService and WorkspaceStateManager swapped weak `Get`/`Set` calls for typed accessors. EnsureLoaded calls added at AI engine consumption sites.
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
  - @memberjunction/ai-engine-base@5.31.0
  - @memberjunction/ai@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/aiengine@5.31.0
  - @memberjunction/credentials@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/templates-base-types@5.31.0
  - @memberjunction/templates@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-engine-base@5.30.1
- @memberjunction/ai@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/aiengine@5.30.1
- @memberjunction/credentials@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/templates-base-types@5.30.1
- @memberjunction/templates@5.30.1

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
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/ai-engine-base@5.30.0
  - @memberjunction/templates@5.30.0
  - @memberjunction/credentials@5.30.0
  - @memberjunction/templates-base-types@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ai-engine-base@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/aiengine@5.29.0
  - @memberjunction/credentials@5.29.0
  - @memberjunction/templates-base-types@5.29.0
  - @memberjunction/templates@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Minor Changes

- fdab4bb: Set PrefillFallbackMode to Ignore on all prompts that use AssistantPrefill.

  The SystemInstruction fallback injects stop sequences on models that don't support native prefill (Gemini/Vertex), which can truncate JSON responses containing markdown code fences. Setting fallback to Ignore means prefill only activates on models that natively support it and is silently skipped elsewhere. Also removes prefill+stop sequences entirely from the Loop and Flow Agent Type system prompts, which are too broadly used to safely apply stop sequences.

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ai-engine-base@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/aiengine@5.28.0
  - @memberjunction/credentials@5.28.0
  - @memberjunction/templates-base-types@5.28.0
  - @memberjunction/templates@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai-engine-base@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/ai-core-plus@5.27.1
  - @memberjunction/aiengine@5.27.1
  - @memberjunction/credentials@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/templates-base-types@5.27.1
  - @memberjunction/templates@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ai-engine-base@5.27.0
- @memberjunction/ai@5.27.0
- @memberjunction/ai-core-plus@5.27.0
- @memberjunction/aiengine@5.27.0
- @memberjunction/credentials@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0
- @memberjunction/templates-base-types@5.27.0
- @memberjunction/templates@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-engine-base@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/aiengine@5.26.0
  - @memberjunction/credentials@5.26.0
  - @memberjunction/templates-base-types@5.26.0
  - @memberjunction/templates@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/ai-engine-base@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/aiengine@5.25.0
  - @memberjunction/credentials@5.25.0
  - @memberjunction/templates-base-types@5.25.0
  - @memberjunction/templates@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Minor Changes

- c318a0c: metadata + migrations in this PR == minor

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/ai-engine-base@5.24.0
  - @memberjunction/aiengine@5.24.0
  - @memberjunction/templates@5.24.0
  - @memberjunction/credentials@5.24.0
  - @memberjunction/templates-base-types@5.24.0
  - @memberjunction/ai@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- 247df16: Fix server-side RunView cache write asymmetry that caused repeated DB queries during metadata sync, add deterministic Nunjucks template parameter extraction via AST, support comma-delimited multi-value fields in validation, and redesign QueryPagingEngine to append paging directly instead of wrapping in CTEs (fixing ORDER BY on non-projected columns and apostrophe-in-comments bugs).
- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [1d1e02e]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/ai-engine-base@5.23.0
  - @memberjunction/aiengine@5.23.0
  - @memberjunction/credentials@5.23.0
  - @memberjunction/templates-base-types@5.23.0
  - @memberjunction/templates@5.23.0
  - @memberjunction/ai@5.23.0

## 5.22.0

### Patch Changes

- 0b23772: Ensure agents use an isolated per-request database provider instead of the shared global singleton.
- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/ai-engine-base@5.22.0
  - @memberjunction/aiengine@5.22.0
  - @memberjunction/templates@5.22.0
  - @memberjunction/credentials@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/templates-base-types@5.22.0
  - @memberjunction/ai@5.22.0

## 5.21.0

### Minor Changes

- 845c980: migration

### Patch Changes

- Updated dependencies [c7dfb20]
- Updated dependencies [76cd2bc]
  - @memberjunction/core@5.21.0
  - @memberjunction/ai-core-plus@5.21.0
  - @memberjunction/aiengine@5.21.0
  - @memberjunction/ai-engine-base@5.21.0
  - @memberjunction/credentials@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/templates-base-types@5.21.0
  - @memberjunction/templates@5.21.0
  - @memberjunction/ai@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ai-engine-base@5.20.0
  - @memberjunction/ai-core-plus@5.20.0
  - @memberjunction/aiengine@5.20.0
  - @memberjunction/credentials@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/templates-base-types@5.20.0
  - @memberjunction/templates@5.20.0
  - @memberjunction/ai@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai-engine-base@5.19.0
- @memberjunction/ai@5.19.0
- @memberjunction/ai-core-plus@5.19.0
- @memberjunction/aiengine@5.19.0
- @memberjunction/credentials@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/templates-base-types@5.19.0
- @memberjunction/templates@5.19.0

## 5.18.0

### Minor Changes

- 48f7296: Add assistant prefill + stop sequences for JSON prompts response

### Patch Changes

- Updated dependencies [322dac6]
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/ai-engine-base@5.18.0
  - @memberjunction/aiengine@5.18.0
  - @memberjunction/templates@5.18.0
  - @memberjunction/ai@5.18.0
  - @memberjunction/credentials@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0
  - @memberjunction/templates-base-types@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/ai-engine-base@5.17.0
  - @memberjunction/ai-core-plus@5.17.0
  - @memberjunction/aiengine@5.17.0
  - @memberjunction/credentials@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/templates-base-types@5.17.0
  - @memberjunction/templates@5.17.0
  - @memberjunction/ai@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/ai-engine-base@5.16.0
  - @memberjunction/ai-core-plus@5.16.0
  - @memberjunction/aiengine@5.16.0
  - @memberjunction/credentials@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/templates-base-types@5.16.0
  - @memberjunction/templates@5.16.0
  - @memberjunction/ai@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Minor Changes

- c3e8b94: metadata updates and migration

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/core@5.15.0
  - @memberjunction/ai@5.15.0
  - @memberjunction/ai-core-plus@5.15.0
  - @memberjunction/ai-engine-base@5.15.0
  - @memberjunction/aiengine@5.15.0
  - @memberjunction/credentials@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/templates-base-types@5.15.0
  - @memberjunction/templates@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/ai-engine-base@5.14.0
  - @memberjunction/ai-core-plus@5.14.0
  - @memberjunction/aiengine@5.14.0
  - @memberjunction/credentials@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/templates-base-types@5.14.0
  - @memberjunction/templates@5.14.0
  - @memberjunction/ai@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ai-engine-base@5.13.0
  - @memberjunction/ai-core-plus@5.13.0
  - @memberjunction/aiengine@5.13.0
  - @memberjunction/credentials@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/templates-base-types@5.13.0
  - @memberjunction/templates@5.13.0
  - @memberjunction/ai@5.13.0

## 5.12.0

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/aiengine@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ai-engine-base@5.12.0
  - @memberjunction/ai-core-plus@5.12.0
  - @memberjunction/credentials@5.12.0
  - @memberjunction/templates-base-types@5.12.0
  - @memberjunction/templates@5.12.0
  - @memberjunction/ai@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/ai-engine-base@5.11.0
  - @memberjunction/ai-core-plus@5.11.0
  - @memberjunction/aiengine@5.11.0
  - @memberjunction/credentials@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/templates-base-types@5.11.0
  - @memberjunction/templates@5.11.0
  - @memberjunction/ai@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai-engine-base@5.10.1
- @memberjunction/ai@5.10.1
- @memberjunction/ai-core-plus@5.10.1
- @memberjunction/aiengine@5.10.1
- @memberjunction/credentials@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/templates-base-types@5.10.1
- @memberjunction/templates@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/ai-engine-base@5.10.0
  - @memberjunction/ai-core-plus@5.10.0
  - @memberjunction/aiengine@5.10.0
  - @memberjunction/credentials@5.10.0
  - @memberjunction/templates-base-types@5.10.0
  - @memberjunction/templates@5.10.0
  - @memberjunction/ai@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ai-engine-base@5.9.0
  - @memberjunction/ai-core-plus@5.9.0
  - @memberjunction/aiengine@5.9.0
  - @memberjunction/credentials@5.9.0
  - @memberjunction/templates-base-types@5.9.0
  - @memberjunction/templates@5.9.0
  - @memberjunction/ai@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/ai-engine-base@5.8.0
  - @memberjunction/ai-core-plus@5.8.0
  - @memberjunction/aiengine@5.8.0
  - @memberjunction/credentials@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/templates-base-types@5.8.0
  - @memberjunction/templates@5.8.0
  - @memberjunction/ai@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- f52e156: Fix agent infinite retry loop and OOM crash when API credentials are missing by adding NoCredentials error classification, max consecutive failure safety net, and descriptive error propagation to the UI. Fix artifact collection removal UI update, artifact pane width reset on conversation switch, and component spec caching to survive render errors.
- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ai@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/ai-engine-base@5.7.0
  - @memberjunction/ai-core-plus@5.7.0
  - @memberjunction/aiengine@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/templates@5.7.0
  - @memberjunction/credentials@5.7.0
  - @memberjunction/templates-base-types@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ai-engine-base@5.6.0
  - @memberjunction/ai-core-plus@5.6.0
  - @memberjunction/aiengine@5.6.0
  - @memberjunction/credentials@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/templates-base-types@5.6.0
  - @memberjunction/templates@5.6.0
  - @memberjunction/ai@5.6.0
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
  - @memberjunction/ai-engine-base@5.5.0
  - @memberjunction/ai@5.5.0
  - @memberjunction/ai-core-plus@5.5.0
  - @memberjunction/aiengine@5.5.0
  - @memberjunction/credentials@5.5.0
  - @memberjunction/templates-base-types@5.5.0
  - @memberjunction/templates@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai-engine-base@5.4.1
- @memberjunction/ai@5.4.1
- @memberjunction/ai-core-plus@5.4.1
- @memberjunction/aiengine@5.4.1
- @memberjunction/credentials@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1
- @memberjunction/templates-base-types@5.4.1
- @memberjunction/templates@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ai-engine-base@5.4.0
  - @memberjunction/ai-core-plus@5.4.0
  - @memberjunction/aiengine@5.4.0
  - @memberjunction/credentials@5.4.0
  - @memberjunction/templates-base-types@5.4.0
  - @memberjunction/templates@5.4.0
  - @memberjunction/ai@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai-engine-base@5.3.1
- @memberjunction/ai@5.3.1
- @memberjunction/ai-core-plus@5.3.1
- @memberjunction/aiengine@5.3.1
- @memberjunction/credentials@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1
- @memberjunction/templates-base-types@5.3.1
- @memberjunction/templates@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ai-engine-base@5.3.0
  - @memberjunction/ai-core-plus@5.3.0
  - @memberjunction/aiengine@5.3.0
  - @memberjunction/credentials@5.3.0
  - @memberjunction/templates-base-types@5.3.0
  - @memberjunction/templates@5.3.0
  - @memberjunction/ai@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/ai-engine-base@5.2.0
  - @memberjunction/ai-core-plus@5.2.0
  - @memberjunction/aiengine@5.2.0
  - @memberjunction/templates-base-types@5.2.0
  - @memberjunction/templates@5.2.0
  - @memberjunction/credentials@5.2.0
  - @memberjunction/ai@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai-engine-base@5.1.0
  - @memberjunction/ai@5.1.0
  - @memberjunction/ai-core-plus@5.1.0
  - @memberjunction/aiengine@5.1.0
  - @memberjunction/credentials@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/templates-base-types@5.1.0
  - @memberjunction/templates@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ai-engine-base@5.0.0
  - @memberjunction/ai@5.0.0
  - @memberjunction/ai-core-plus@5.0.0
  - @memberjunction/aiengine@5.0.0
  - @memberjunction/credentials@5.0.0
  - @memberjunction/global@5.0.0
  - @memberjunction/templates-base-types@5.0.0
  - @memberjunction/templates@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-engine-base@4.4.0
  - @memberjunction/ai-core-plus@4.4.0
  - @memberjunction/aiengine@4.4.0
  - @memberjunction/credentials@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/templates-base-types@4.4.0
  - @memberjunction/templates@4.4.0
  - @memberjunction/ai@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai-engine-base@4.3.1
- @memberjunction/ai@4.3.1
- @memberjunction/ai-core-plus@4.3.1
- @memberjunction/aiengine@4.3.1
- @memberjunction/credentials@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1
- @memberjunction/templates-base-types@4.3.1
- @memberjunction/templates@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ai-engine-base@4.3.0
  - @memberjunction/ai-core-plus@4.3.0
  - @memberjunction/aiengine@4.3.0
  - @memberjunction/credentials@4.3.0
  - @memberjunction/templates-base-types@4.3.0
  - @memberjunction/templates@4.3.0
  - @memberjunction/ai@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai-engine-base@4.2.0
- @memberjunction/ai@4.2.0
- @memberjunction/ai-core-plus@4.2.0
- @memberjunction/aiengine@4.2.0
- @memberjunction/credentials@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0
- @memberjunction/templates-base-types@4.2.0
- @memberjunction/templates@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [9fab8ca]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/templates@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ai-engine-base@4.1.0
  - @memberjunction/ai-core-plus@4.1.0
  - @memberjunction/aiengine@4.1.0
  - @memberjunction/credentials@4.1.0
  - @memberjunction/templates-base-types@4.1.0
  - @memberjunction/ai@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [2f86270]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/aiengine@4.0.0
  - @memberjunction/ai-engine-base@4.0.0
  - @memberjunction/ai@4.0.0
  - @memberjunction/ai-core-plus@4.0.0
  - @memberjunction/credentials@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0
  - @memberjunction/templates-base-types@4.0.0
  - @memberjunction/templates@4.0.0

## 3.4.0

### Patch Changes

- d596467: Add Fireworks.ai LLM provider package with Kimi K2.5 model support, fix AI prompts failover bug, and add Jest testing infrastructure
- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/templates@3.4.0
  - @memberjunction/aiengine@3.4.0
  - @memberjunction/ai-engine-base@3.4.0
  - @memberjunction/ai-core-plus@3.4.0
  - @memberjunction/credentials@3.4.0
  - @memberjunction/templates-base-types@3.4.0
  - @memberjunction/ai@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
- Updated dependencies [da33601]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/credentials@3.3.0
  - @memberjunction/ai-engine-base@3.3.0
  - @memberjunction/ai-core-plus@3.3.0
  - @memberjunction/aiengine@3.3.0
  - @memberjunction/templates-base-types@3.3.0
  - @memberjunction/templates@3.3.0
  - @memberjunction/ai@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/ai-engine-base@3.2.0
  - @memberjunction/ai-core-plus@3.2.0
  - @memberjunction/aiengine@3.2.0
  - @memberjunction/credentials@3.2.0
  - @memberjunction/templates-base-types@3.2.0
  - @memberjunction/templates@3.2.0
  - @memberjunction/ai@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ai-engine-base@3.1.1
- @memberjunction/ai@3.1.1
- @memberjunction/ai-core-plus@3.1.1
- @memberjunction/aiengine@3.1.1
- @memberjunction/credentials@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/global@3.1.1
- @memberjunction/templates-base-types@3.1.1
- @memberjunction/templates@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai-engine-base@3.0.0
- @memberjunction/ai@3.0.0
- @memberjunction/ai-core-plus@3.0.0
- @memberjunction/aiengine@3.0.0
- @memberjunction/credentials@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/global@3.0.0
- @memberjunction/templates-base-types@3.0.0
- @memberjunction/templates@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/ai-engine-base@2.133.0
  - @memberjunction/ai-core-plus@2.133.0
  - @memberjunction/aiengine@2.133.0
  - @memberjunction/credentials@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/templates-base-types@2.133.0
  - @memberjunction/templates@2.133.0
  - @memberjunction/ai@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/ai-engine-base@2.132.0
  - @memberjunction/ai-core-plus@2.132.0
  - @memberjunction/aiengine@2.132.0
  - @memberjunction/credentials@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/templates-base-types@2.132.0
  - @memberjunction/templates@2.132.0
  - @memberjunction/ai@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/ai-engine-base@2.131.0
  - @memberjunction/ai-core-plus@2.131.0
  - @memberjunction/aiengine@2.131.0
  - @memberjunction/credentials@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/templates-base-types@2.131.0
  - @memberjunction/templates@2.131.0
  - @memberjunction/ai@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/ai-engine-base@2.130.1
- @memberjunction/ai@2.130.1
- @memberjunction/ai-core-plus@2.130.1
- @memberjunction/aiengine@2.130.1
- @memberjunction/credentials@2.130.1
- @memberjunction/core@2.130.1
- @memberjunction/core-entities@2.130.1
- @memberjunction/global@2.130.1
- @memberjunction/templates-base-types@2.130.1
- @memberjunction/templates@2.130.1

## 2.130.0

### Minor Changes

- 83ae347: migrations

### Patch Changes

- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/ai-engine-base@2.130.0
  - @memberjunction/ai@2.130.0
  - @memberjunction/ai-core-plus@2.130.0
  - @memberjunction/aiengine@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/templates@2.130.0
  - @memberjunction/credentials@2.130.0
  - @memberjunction/templates-base-types@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Minor Changes

- 6ce6e67: migration
- c7e38aa: migration

### Patch Changes

- Updated dependencies [c391d7d]
- Updated dependencies [ff1e35b]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [6ce6e67]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/credentials@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/ai-core-plus@2.129.0
  - @memberjunction/ai-engine-base@2.129.0
  - @memberjunction/aiengine@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/templates-base-types@2.129.0
  - @memberjunction/templates@2.129.0
  - @memberjunction/ai@2.129.0

## 2.128.0

### Patch Changes

- f407abe: Add EffortLevel support to AIPromptModel with priority hierarchy and fix GPT 5.2 naming convention to align with standards
- Updated dependencies [f407abe]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/ai-engine-base@2.128.0
  - @memberjunction/ai-core-plus@2.128.0
  - @memberjunction/aiengine@2.128.0
  - @memberjunction/templates-base-types@2.128.0
  - @memberjunction/templates@2.128.0
  - @memberjunction/ai@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [0e56e97]
- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/ai-core-plus@2.127.0
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/aiengine@2.127.0
  - @memberjunction/ai-engine-base@2.127.0
  - @memberjunction/templates-base-types@2.127.0
  - @memberjunction/templates@2.127.0
  - @memberjunction/ai@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/ai-engine-base@2.126.1
- @memberjunction/ai@2.126.1
- @memberjunction/ai-core-plus@2.126.1
- @memberjunction/aiengine@2.126.1
- @memberjunction/core@2.126.1
- @memberjunction/core-entities@2.126.1
- @memberjunction/global@2.126.1
- @memberjunction/templates-base-types@2.126.1
- @memberjunction/templates@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [703221e]
  - @memberjunction/core@2.126.0
  - @memberjunction/ai-engine-base@2.126.0
  - @memberjunction/ai-core-plus@2.126.0
  - @memberjunction/aiengine@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/templates-base-types@2.126.0
  - @memberjunction/templates@2.126.0
  - @memberjunction/ai@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/ai-engine-base@2.125.0
  - @memberjunction/ai-core-plus@2.125.0
  - @memberjunction/aiengine@2.125.0
  - @memberjunction/templates-base-types@2.125.0
  - @memberjunction/templates@2.125.0
  - @memberjunction/ai@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- 629cf5a: no migration
- Updated dependencies [75058a9]
- Updated dependencies [cabe329]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/ai-core-plus@2.124.0
  - @memberjunction/ai-engine-base@2.124.0
  - @memberjunction/aiengine@2.124.0
  - @memberjunction/templates-base-types@2.124.0
  - @memberjunction/templates@2.124.0
  - @memberjunction/ai@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai-engine-base@2.123.1
- @memberjunction/ai@2.123.1
- @memberjunction/ai-core-plus@2.123.1
- @memberjunction/aiengine@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1
- @memberjunction/templates-base-types@2.123.1
- @memberjunction/templates@2.123.1

## 2.123.0

### Patch Changes

- Updated dependencies [0944f59]
  - @memberjunction/ai-core-plus@2.123.0
  - @memberjunction/aiengine@2.123.0
  - @memberjunction/templates@2.123.0
  - @memberjunction/ai-engine-base@2.123.0
  - @memberjunction/ai@2.123.0
  - @memberjunction/core@2.123.0
  - @memberjunction/core-entities@2.123.0
  - @memberjunction/global@2.123.0
  - @memberjunction/templates-base-types@2.123.0

## 2.122.2

### Patch Changes

- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
- Updated dependencies [81f0c44]
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/ai-engine-base@2.122.2
  - @memberjunction/ai-core-plus@2.122.2
  - @memberjunction/aiengine@2.122.2
  - @memberjunction/templates-base-types@2.122.2
  - @memberjunction/templates@2.122.2
  - @memberjunction/ai@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/ai@2.122.1
- @memberjunction/ai-core-plus@2.122.1
- @memberjunction/aiengine@2.122.1
- @memberjunction/core@2.122.1
- @memberjunction/core-entities@2.122.1
- @memberjunction/global@2.122.1
- @memberjunction/templates-base-types@2.122.1
- @memberjunction/templates@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/ai-core-plus@2.122.0
  - @memberjunction/aiengine@2.122.0
  - @memberjunction/templates-base-types@2.122.0
  - @memberjunction/templates@2.122.0
  - @memberjunction/ai@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- a2bef0a: Refactor component-linter with fixture-based testing infrastructure, fix agent execution error handling and payload propagation, add Gemini API parameter fixes, and improve vendor failover with VendorValidationError type
- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/ai@2.121.0
  - @memberjunction/ai-core-plus@2.121.0
  - @memberjunction/aiengine@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/templates-base-types@2.121.0
  - @memberjunction/templates@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/ai-core-plus@2.120.0
  - @memberjunction/aiengine@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/templates-base-types@2.120.0
  - @memberjunction/templates@2.120.0
  - @memberjunction/ai@2.120.0
  - @memberjunction/global@2.120.0

## 2.119.0

### Minor Changes

- efc6451: migration

### Patch Changes

- Updated dependencies [7dd7cca]
- Updated dependencies [0a133df]
  - @memberjunction/core@2.119.0
  - @memberjunction/ai-core-plus@2.119.0
  - @memberjunction/aiengine@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/templates-base-types@2.119.0
  - @memberjunction/templates@2.119.0
  - @memberjunction/ai@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Patch Changes

- Updated dependencies [264c57a]
- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/ai-core-plus@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/aiengine@2.118.0
  - @memberjunction/templates-base-types@2.118.0
  - @memberjunction/templates@2.118.0
  - @memberjunction/ai@2.118.0
  - @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [8c092ec]
  - @memberjunction/core@2.117.0
  - @memberjunction/ai-core-plus@2.117.0
  - @memberjunction/aiengine@2.117.0
  - @memberjunction/core-entities@2.117.0
  - @memberjunction/templates-base-types@2.117.0
  - @memberjunction/templates@2.117.0
  - @memberjunction/ai@2.117.0
  - @memberjunction/global@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [81bb7a4]
- Updated dependencies [a8d5592]
  - @memberjunction/core@2.116.0
  - @memberjunction/global@2.116.0
  - @memberjunction/ai-core-plus@2.116.0
  - @memberjunction/aiengine@2.116.0
  - @memberjunction/core-entities@2.116.0
  - @memberjunction/templates-base-types@2.116.0
  - @memberjunction/templates@2.116.0
  - @memberjunction/ai@2.116.0

## 2.115.0

### Patch Changes

- Updated dependencies [2e0fe8b]
  - @memberjunction/aiengine@2.115.0
  - @memberjunction/templates@2.115.0
  - @memberjunction/ai@2.115.0
  - @memberjunction/ai-core-plus@2.115.0
  - @memberjunction/core@2.115.0
  - @memberjunction/core-entities@2.115.0
  - @memberjunction/global@2.115.0
  - @memberjunction/templates-base-types@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/ai@2.114.0
- @memberjunction/ai-core-plus@2.114.0
- @memberjunction/aiengine@2.114.0
- @memberjunction/core@2.114.0
- @memberjunction/core-entities@2.114.0
- @memberjunction/global@2.114.0
- @memberjunction/templates-base-types@2.114.0
- @memberjunction/templates@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/ai-core-plus@2.113.2
  - @memberjunction/aiengine@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/templates-base-types@2.113.2
  - @memberjunction/templates@2.113.2
  - @memberjunction/ai@2.113.2
  - @memberjunction/global@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [e237ca9]
- Updated dependencies [c126b59]
- Updated dependencies [ed74bb8]
  - @memberjunction/aiengine@2.112.0
  - @memberjunction/global@2.112.0
  - @memberjunction/ai-core-plus@2.112.0
  - @memberjunction/templates@2.112.0
  - @memberjunction/ai@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0
  - @memberjunction/templates-base-types@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ai@2.110.1
- @memberjunction/ai-core-plus@2.110.1
- @memberjunction/aiengine@2.110.1
- @memberjunction/core@2.110.1
- @memberjunction/core-entities@2.110.1
- @memberjunction/global@2.110.1
- @memberjunction/templates-base-types@2.110.1
- @memberjunction/templates@2.110.1

## 2.110.0

### Patch Changes

- Updated dependencies [02d72ff]
- Updated dependencies [d2d7ab9]
- Updated dependencies [c8b9aca]
  - @memberjunction/core-entities@2.110.0
  - @memberjunction/ai-core-plus@2.110.0
  - @memberjunction/aiengine@2.110.0
  - @memberjunction/templates-base-types@2.110.0
  - @memberjunction/templates@2.110.0
  - @memberjunction/ai@2.110.0
  - @memberjunction/core@2.110.0
  - @memberjunction/global@2.110.0

## 2.109.0

### Patch Changes

- Updated dependencies [6e45c17]
- Updated dependencies [a38989b]
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/ai-core-plus@2.109.0
  - @memberjunction/aiengine@2.109.0
  - @memberjunction/templates-base-types@2.109.0
  - @memberjunction/templates@2.109.0
  - @memberjunction/ai@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0

## 2.108.0

### Patch Changes

- Updated dependencies [687e2ae]
- Updated dependencies [d205a6c]
- Updated dependencies [656d86c]
  - @memberjunction/aiengine@2.108.0
  - @memberjunction/ai-core-plus@2.108.0
  - @memberjunction/ai@2.108.0
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/templates@2.108.0
  - @memberjunction/templates-base-types@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/ai@2.107.0
- @memberjunction/ai-core-plus@2.107.0
- @memberjunction/aiengine@2.107.0
- @memberjunction/core@2.107.0
- @memberjunction/core-entities@2.107.0
- @memberjunction/global@2.107.0
- @memberjunction/templates-base-types@2.107.0
- @memberjunction/templates@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ai@2.106.0
- @memberjunction/ai-core-plus@2.106.0
- @memberjunction/aiengine@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/core-entities@2.106.0
- @memberjunction/global@2.106.0
- @memberjunction/templates-base-types@2.106.0
- @memberjunction/templates@2.106.0

## 2.105.0

### Patch Changes

- 9b67e0c: This release addresses critical stability issues across build processes, runtime execution, and AI model management in the MemberJunction platform. The changes focus on three main areas: production build reliability, database migration consistency, and intelligent AI error handling.

  Resolved critical issues where Angular production builds with optimization enabled would remove essential classes through aggressive tree-shaking. Moved `TemplateEntityExtended` to `@memberjunction/core-entities` and created new `@memberjunction/ai-provider-bundle` package to centralize AI provider loading while maintaining clean separation between core infrastructure and provider implementations. Added `LoadEntityCommunicationsEngineClient()` calls to prevent removal of inherited singleton methods. These changes prevent runtime errors in production deployments where previously registered classes would become inaccessible, while improving architectural separation of concerns.

  Enhanced CodeGen SQL generation to use `IF OBJECT_ID()` patterns instead of `DROP ... IF EXISTS` syntax, fixing silent failures with Flyway placeholder substitution. Improved validator generation to properly handle nullable fields and correctly set `result.Success` status. Centralized GraphQL type name generation using schema-aware naming (`{schema}_{basetable}_`) to eliminate type collisions between entities with identical base table names across different schemas. These changes ensure reliable database migrations and prevent recurring cascade delete regressions.

  Implemented sophisticated error classification with new `NoCredit` error type for billing failures, message-first error detection, and permissive failover for 403 errors. Added hierarchical configuration-aware failover that respects configuration boundaries (Production vs Development models) while maintaining candidate list caching for performance. Enhanced error analysis to properly classify credit/quota issues and enable appropriate failover behavior.

  Improved model selection caching by checking all candidates for valid API keys instead of stopping at first match, ensuring retry logic has access to complete list of viable model/vendor combinations. Added `extractValidCandidates()` method to `AIModelSelectionInfo` class and `buildCandidatesFromSelectionInfo()` helper to properly reconstruct candidate lists from selection metadata during hierarchical template execution.

  Enhanced error-based retry and failover with intelligent handling for authentication and rate limit errors. Authentication errors now trigger vendor-level filtering (excluding all models from vendors with invalid API keys) and immediate failover to different vendors. Rate limit errors now retry the same model/vendor using configurable `MaxRetries` (default: 3) with backoff delay based on `RetryStrategy` (Fixed/Linear/Exponential) before failing over. Improved log messages with human-readable formatting showing model/vendor names, time in seconds, and clear status indicators. Fixed MJCLI sync commands to properly propagate exit codes for CI/CD integration.

- Updated dependencies [4807f35]
- Updated dependencies [9b67e0c]
  - @memberjunction/ai-core-plus@2.105.0
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/ai@2.105.0
  - @memberjunction/aiengine@2.105.0
  - @memberjunction/templates-base-types@2.105.0
  - @memberjunction/templates@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Minor Changes

- aafa827: Fix issues with Effort Level support for Anthropic and OpenAI Models

### Patch Changes

- 4567af3: **Component Feedback System (Registry-Agnostic)**

  Implement comprehensive component feedback system that works across any component registry (Skip, MJ Central, etc.) with support for custom feedback handlers.
  - Add skip-component-feedback-panel component with sliding panel UI (444 lines CSS, 161 lines HTML, 274 lines TS)
  - Add star ratings (0-5 scale), comments, and component hierarchy visualization
  - Add FeedbackHandler interface for customizable feedback logic per registry
  - Add ComponentFeedbackParams and ComponentFeedbackResponse types with full parameter set
  - Add POST /api/v1/feedback endpoint to ComponentRegistryAPIServer
  - Add submitFeedback() method to ComponentRegistryClient SDK
  - Add SendComponentFeedback mutation to ComponentRegistryResolver (replaces AskSkipResolver implementation)
  - Use ComponentRegistryClient SDK with REGISTRY*URI_OVERRIDE*_ and REGISTRY*API_KEY*_ support
  - Update skip-artifact-viewer to use GraphQLComponentRegistryClient for feedback submission
  - Extract registry name from component spec with fallback to 'Skip'
  - Update dynamic-ui-component and linear-report with component hierarchy tracking
  - Pass conversationID and authenticated user email for contact resolution

  **React Runtime Debug Logging Enhancements**

  Restore debug logging with production guards for better debugging capabilities.
  - Restore 12 debug console.log statements throughout React runtime (prop-builder, component-hierarchy)
  - Wrap all debug logs with LogStatus/GetProductionStatus checks
  - Add comprehensive README.md documentation (95 lines) for debug configuration
  - Logs only execute when not in production mode
  - Update ReactDebugConfig with enhanced environment variable support

  **AI Prompt Error Handling Improvements**

  Replace hardcoded error truncation with configurable maxErrorLength parameter.
  - Add maxErrorLength?: number property to AIPromptParams class
  - Update AIPromptRunner.logError() to accept maxErrorLength in options
  - Thread maxErrorLength through 18 logError calls throughout AIPromptRunner
  - Remove hardcoded MAX_ERROR_LENGTH constant (500 chars)
  - When undefined (default), errors are returned in full for debugging
  - When set, errors are truncated with "... [truncated]" suffix

  **Bug Fixes**
  - Fix AI parameter extraction edge cases in AIPromptRunner and QueryEntity
  - Fix mj.config.cjs configuration
  - Fix component hierarchy tracking in dynamic reports

  Addresses PR #1426 comments #5, #7, and #8

- Updated dependencies [2ff5428]
- Updated dependencies [4567af3]
- Updated dependencies [9ad6353]
  - @memberjunction/global@2.104.0
  - @memberjunction/ai-core-plus@2.104.0
  - @memberjunction/core-entities@2.104.0
  - @memberjunction/ai@2.104.0
  - @memberjunction/aiengine@2.104.0
  - @memberjunction/core@2.104.0
  - @memberjunction/templates-base-types@2.104.0
  - @memberjunction/templates@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
- Updated dependencies [3ba01de]
- Updated dependencies [a38eec3]
  - @memberjunction/core@2.103.0
  - @memberjunction/templates-base-types@2.103.0
  - @memberjunction/templates@2.103.0
  - @memberjunction/core-entities@2.103.0
  - @memberjunction/ai-core-plus@2.103.0
  - @memberjunction/aiengine@2.103.0
  - @memberjunction/global@2.103.0
  - @memberjunction/ai@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/core-entities@2.100.3
- @memberjunction/ai-core-plus@2.100.3
- @memberjunction/aiengine@2.100.3
- @memberjunction/templates-base-types@2.100.3
- @memberjunction/templates@2.100.3
- @memberjunction/ai@2.100.3
- @memberjunction/core@2.100.3
- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/ai@2.100.2
- @memberjunction/ai-core-plus@2.100.2
- @memberjunction/aiengine@2.100.2
- @memberjunction/core@2.100.2
- @memberjunction/core-entities@2.100.2
- @memberjunction/global@2.100.2
- @memberjunction/templates-base-types@2.100.2
- @memberjunction/templates@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/ai@2.100.1
- @memberjunction/ai-core-plus@2.100.1
- @memberjunction/aiengine@2.100.1
- @memberjunction/core@2.100.1
- @memberjunction/core-entities@2.100.1
- @memberjunction/global@2.100.1
- @memberjunction/templates-base-types@2.100.1
- @memberjunction/templates@2.100.1

## 2.100.0

### Patch Changes

- Updated dependencies [5f76e3a]
- Updated dependencies [ffc2c1a]
  - @memberjunction/core@2.100.0
  - @memberjunction/core-entities@2.100.0
  - @memberjunction/ai-core-plus@2.100.0
  - @memberjunction/aiengine@2.100.0
  - @memberjunction/templates-base-types@2.100.0
  - @memberjunction/templates@2.100.0
  - @memberjunction/ai@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- Updated dependencies [eb7677d]
- Updated dependencies [8bbb0a9]
  - @memberjunction/core-entities@2.99.0
  - @memberjunction/core@2.99.0
  - @memberjunction/ai-core-plus@2.99.0
  - @memberjunction/aiengine@2.99.0
  - @memberjunction/templates-base-types@2.99.0
  - @memberjunction/templates@2.99.0
  - @memberjunction/ai@2.99.0
  - @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/ai@2.98.0
- @memberjunction/ai-core-plus@2.98.0
- @memberjunction/aiengine@2.98.0
- @memberjunction/core@2.98.0
- @memberjunction/core-entities@2.98.0
- @memberjunction/global@2.98.0
- @memberjunction/templates-base-types@2.98.0
- @memberjunction/templates@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/core-entities@2.97.0
- @memberjunction/ai-core-plus@2.97.0
- @memberjunction/aiengine@2.97.0
- @memberjunction/templates-base-types@2.97.0
- @memberjunction/templates@2.97.0
- @memberjunction/ai@2.97.0
- @memberjunction/core@2.97.0
- @memberjunction/global@2.97.0

## 2.96.0

### Minor Changes

- 8f34e55: migration

### Patch Changes

- Updated dependencies [01dcfde]
  - @memberjunction/core@2.96.0
  - @memberjunction/ai-core-plus@2.96.0
  - @memberjunction/aiengine@2.96.0
  - @memberjunction/core-entities@2.96.0
  - @memberjunction/templates-base-types@2.96.0
  - @memberjunction/templates@2.96.0
  - @memberjunction/ai@2.96.0
  - @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- Updated dependencies [a54c014]
  - @memberjunction/core@2.95.0
  - @memberjunction/ai-core-plus@2.95.0
  - @memberjunction/aiengine@2.95.0
  - @memberjunction/core-entities@2.95.0
  - @memberjunction/templates-base-types@2.95.0
  - @memberjunction/templates@2.95.0
  - @memberjunction/ai@2.95.0
  - @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/core-entities@2.94.0
- @memberjunction/ai-core-plus@2.94.0
- @memberjunction/aiengine@2.94.0
- @memberjunction/templates-base-types@2.94.0
- @memberjunction/templates@2.94.0
- @memberjunction/ai@2.94.0
- @memberjunction/core@2.94.0
- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- Updated dependencies [f8757aa]
- Updated dependencies [103e4a9]
- Updated dependencies [7f465b5]
  - @memberjunction/core@2.93.0
  - @memberjunction/core-entities@2.93.0
  - @memberjunction/ai-core-plus@2.93.0
  - @memberjunction/aiengine@2.93.0
  - @memberjunction/templates-base-types@2.93.0
  - @memberjunction/templates@2.93.0
  - @memberjunction/ai@2.93.0
  - @memberjunction/global@2.93.0

## 2.92.0

### Patch Changes

- Updated dependencies [8fb03df]
- Updated dependencies [5817bac]
  - @memberjunction/core@2.92.0
  - @memberjunction/core-entities@2.92.0
  - @memberjunction/ai-core-plus@2.92.0
  - @memberjunction/aiengine@2.92.0
  - @memberjunction/templates-base-types@2.92.0
  - @memberjunction/templates@2.92.0
  - @memberjunction/ai@2.92.0
  - @memberjunction/global@2.92.0

## 2.91.0

### Patch Changes

- Updated dependencies [f703033]
- Updated dependencies [6476d74]
  - @memberjunction/core@2.91.0
  - @memberjunction/core-entities@2.91.0
  - @memberjunction/ai-core-plus@2.91.0
  - @memberjunction/aiengine@2.91.0
  - @memberjunction/templates-base-types@2.91.0
  - @memberjunction/templates@2.91.0
  - @memberjunction/ai@2.91.0
  - @memberjunction/global@2.91.0

## 2.90.0

### Patch Changes

- Updated dependencies [146ebcc]
- Updated dependencies [d5d26d7]
- Updated dependencies [1e7eb76]
  - @memberjunction/aiengine@2.90.0
  - @memberjunction/core@2.90.0
  - @memberjunction/core-entities@2.90.0
  - @memberjunction/templates@2.90.0
  - @memberjunction/ai-core-plus@2.90.0
  - @memberjunction/templates-base-types@2.90.0
  - @memberjunction/ai@2.90.0
  - @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- Updated dependencies [d1911ed]
  - @memberjunction/ai-core-plus@2.89.0
  - @memberjunction/core-entities@2.89.0
  - @memberjunction/aiengine@2.89.0
  - @memberjunction/templates-base-types@2.89.0
  - @memberjunction/templates@2.89.0
  - @memberjunction/ai@2.89.0
  - @memberjunction/core@2.89.0
  - @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- Updated dependencies [df4031f]
  - @memberjunction/core-entities@2.88.0
  - @memberjunction/ai-core-plus@2.88.0
  - @memberjunction/aiengine@2.88.0
  - @memberjunction/templates-base-types@2.88.0
  - @memberjunction/templates@2.88.0
  - @memberjunction/ai@2.88.0
  - @memberjunction/core@2.88.0
  - @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- Updated dependencies [58a00df]
  - @memberjunction/core@2.87.0
  - @memberjunction/ai-core-plus@2.87.0
  - @memberjunction/aiengine@2.87.0
  - @memberjunction/core-entities@2.87.0
  - @memberjunction/templates-base-types@2.87.0
  - @memberjunction/templates@2.87.0
  - @memberjunction/ai@2.87.0
  - @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- Updated dependencies [7dd2409]
  - @memberjunction/core-entities@2.86.0
  - @memberjunction/ai-core-plus@2.86.0
  - @memberjunction/aiengine@2.86.0
  - @memberjunction/templates-base-types@2.86.0
  - @memberjunction/templates@2.86.0
  - @memberjunction/ai@2.86.0
  - @memberjunction/core@2.86.0
  - @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- Updated dependencies [a96c1a7]
- Updated dependencies [747455a]
  - @memberjunction/ai@2.85.0
  - @memberjunction/core-entities@2.85.0
  - @memberjunction/ai-core-plus@2.85.0
  - @memberjunction/aiengine@2.85.0
  - @memberjunction/templates@2.85.0
  - @memberjunction/templates-base-types@2.85.0
  - @memberjunction/core@2.85.0
  - @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [0b9d691]
  - @memberjunction/core@2.84.0
  - @memberjunction/ai-core-plus@2.84.0
  - @memberjunction/aiengine@2.84.0
  - @memberjunction/core-entities@2.84.0
  - @memberjunction/templates-base-types@2.84.0
  - @memberjunction/templates@2.84.0
  - @memberjunction/ai@2.84.0
  - @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- Updated dependencies [e2e0415]
- Updated dependencies [1dc69bf]
  - @memberjunction/core@2.83.0
  - @memberjunction/aiengine@2.83.0
  - @memberjunction/ai-core-plus@2.83.0
  - @memberjunction/core-entities@2.83.0
  - @memberjunction/templates-base-types@2.83.0
  - @memberjunction/templates@2.83.0
  - @memberjunction/ai@2.83.0
  - @memberjunction/global@2.83.0

## 2.82.0

### Minor Changes

- 975e8d1: migration

### Patch Changes

- Updated dependencies [2186d7b]
- Updated dependencies [975e8d1]
  - @memberjunction/core-entities@2.82.0
  - @memberjunction/ai-core-plus@2.82.0
  - @memberjunction/aiengine@2.82.0
  - @memberjunction/templates-base-types@2.82.0
  - @memberjunction/templates@2.82.0
  - @memberjunction/ai@2.82.0
  - @memberjunction/core@2.82.0
  - @memberjunction/global@2.82.0

## 2.81.0

### Patch Changes

- Updated dependencies [6d2d478]
- Updated dependencies [e623f99]
- Updated dependencies [971c5d4]
  - @memberjunction/core@2.81.0
  - @memberjunction/core-entities@2.81.0
  - @memberjunction/ai-core-plus@2.81.0
  - @memberjunction/aiengine@2.81.0
  - @memberjunction/templates-base-types@2.81.0
  - @memberjunction/templates@2.81.0
  - @memberjunction/ai@2.81.0
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/ai@2.80.1
- @memberjunction/ai-core-plus@2.80.1
- @memberjunction/aiengine@2.80.1
- @memberjunction/core@2.80.1
- @memberjunction/core-entities@2.80.1
- @memberjunction/global@2.80.1
- @memberjunction/templates-base-types@2.80.1
- @memberjunction/templates@2.80.1

## 2.80.0

### Patch Changes

- Updated dependencies [7c5f844]
- Updated dependencies [d03dfae]
  - @memberjunction/core@2.80.0
  - @memberjunction/core-entities@2.80.0
  - @memberjunction/ai-core-plus@2.80.0
  - @memberjunction/aiengine@2.80.0
  - @memberjunction/templates-base-types@2.80.0
  - @memberjunction/templates@2.80.0
  - @memberjunction/ai@2.80.0
  - @memberjunction/global@2.80.0

## 2.79.0

### Minor Changes

- 4bf2634: migrations

### Patch Changes

- Updated dependencies [4bf2634]
- Updated dependencies [907e73f]
- Updated dependencies [bad1a60]
  - @memberjunction/core-entities@2.79.0
  - @memberjunction/global@2.79.0
  - @memberjunction/ai@2.79.0
  - @memberjunction/ai-core-plus@2.79.0
  - @memberjunction/aiengine@2.79.0
  - @memberjunction/templates-base-types@2.79.0
  - @memberjunction/templates@2.79.0
  - @memberjunction/core@2.79.0

## 2.78.0

### Minor Changes

- ef7c014: migration file

### Patch Changes

- Updated dependencies [ef7c014]
- Updated dependencies [06088e5]
  - @memberjunction/ai@2.78.0
  - @memberjunction/core-entities@2.78.0
  - @memberjunction/ai-core-plus@2.78.0
  - @memberjunction/aiengine@2.78.0
  - @memberjunction/templates@2.78.0
  - @memberjunction/templates-base-types@2.78.0
  - @memberjunction/core@2.78.0
  - @memberjunction/global@2.78.0

## 2.77.0

### Patch Changes

- Updated dependencies [d8f14a2]
- Updated dependencies [8ee0d86]
- Updated dependencies [c91269e]
  - @memberjunction/core@2.77.0
  - @memberjunction/core-entities@2.77.0
  - @memberjunction/ai-core-plus@2.77.0
  - @memberjunction/aiengine@2.77.0
  - @memberjunction/templates-base-types@2.77.0
  - @memberjunction/templates@2.77.0
  - @memberjunction/ai@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- Updated dependencies [4b27b3c]
- Updated dependencies [7dabb22]
- Updated dependencies [ffda243]
  - @memberjunction/core-entities@2.76.0
  - @memberjunction/core@2.76.0
  - @memberjunction/ai-core-plus@2.76.0
  - @memberjunction/aiengine@2.76.0
  - @memberjunction/templates-base-types@2.76.0
  - @memberjunction/templates@2.76.0
  - @memberjunction/ai@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Minor Changes

- 9ccd145: migration

### Patch Changes

- @memberjunction/ai@2.75.0
- @memberjunction/ai-core-plus@2.75.0
- @memberjunction/aiengine@2.75.0
- @memberjunction/core@2.75.0
- @memberjunction/core-entities@2.75.0
- @memberjunction/global@2.75.0
- @memberjunction/templates-base-types@2.75.0
- @memberjunction/templates@2.75.0

## 2.74.0

### Minor Changes

- 9ff358d: migration

### Patch Changes

- Updated dependencies [b70301e]
- Updated dependencies [d316670]
  - @memberjunction/core-entities@2.74.0
  - @memberjunction/core@2.74.0
  - @memberjunction/ai-core-plus@2.74.0
  - @memberjunction/aiengine@2.74.0
  - @memberjunction/templates-base-types@2.74.0
  - @memberjunction/templates@2.74.0
  - @memberjunction/ai@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Minor Changes

- eab6a48: migration files
- 9801456: migration

### Patch Changes

- eebfb9a: Add comprehensive context length handling with intelligent model
  selection

  This release adds sophisticated context length management to prevent
  infinite retry loops when AI models encounter context length exceeded
  errors.

  **New Features:**
  - **ContextLengthExceeded Error Type**: New error classification for
    context length exceeded errors
  - **Smart Failover Logic**: Automatically switches to models with larger
    context windows when context errors occur
  - **Proactive Model Selection**: Estimates token usage and selects
    appropriate models before execution
  - **Context-Aware Sorting**: Prioritizes models by context window size
    during failover

  **Enhanced Components:**
  - **ErrorAnalyzer**: Detects context_length_exceeded errors from
    provider codes, error messages, and JSON objects
  - **AIPromptRunner**: Adds token estimation, context validation, and
    intelligent model reselection
  - **Failover System**: Context-aware candidate selection with detailed
    logging

  **Key Improvements:**
  - Prevents infinite agent stalling on context length exceeded errors
  - Reduces API costs by avoiding repeated failed attempts with
    insufficient context models
  - Improves reliability through proactive context length validation
  - Provides detailed logging for monitoring and debugging

  **Breaking Changes:**
  - None - all changes are backward compatible

  **Migration Notes:**
  - No migration required - existing code will automatically benefit from
    enhanced context handling
  - Models with MaxInputTokens/MaxOutputTokens configured will be
    prioritized appropriately
  - Context length validation occurs transparently during prompt execution

  This resolves the critical issue where agents would infinitely retry
  prompts that exceed model context limits, improving system reliability
  and reducing unnecessary API calls.

- Updated dependencies [26c2b03]
- Updated dependencies [e99336f]
- Updated dependencies [eebfb9a]
  - @memberjunction/aiengine@2.73.0
  - @memberjunction/core-entities@2.73.0
  - @memberjunction/ai@2.73.0
  - @memberjunction/templates@2.73.0
  - @memberjunction/ai-core-plus@2.73.0
  - @memberjunction/templates-base-types@2.73.0
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- Updated dependencies [636b6ee]
  - @memberjunction/core-entities@2.72.0
  - @memberjunction/ai-core-plus@2.72.0
  - @memberjunction/aiengine@2.72.0
  - @memberjunction/templates-base-types@2.72.0
  - @memberjunction/templates@2.72.0
  - @memberjunction/ai@2.72.0
  - @memberjunction/core@2.72.0
  - @memberjunction/global@2.72.0

## 2.71.0

### Minor Changes

- 91188ab: migration file + various improvements and reorganization

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0
  - @memberjunction/ai@2.71.0
  - @memberjunction/ai-core-plus@2.71.0
  - @memberjunction/aiengine@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/core-entities@2.71.0
  - @memberjunction/templates-base-types@2.71.0
  - @memberjunction/templates@2.71.0

## 2.70.0

### Minor Changes

- c9d86cd: migration

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/ai-core-plus@2.70.0
  - @memberjunction/ai@2.70.0
  - @memberjunction/aiengine@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/core-entities@2.70.0
  - @memberjunction/templates-base-types@2.70.0
  - @memberjunction/templates@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/ai-core-plus@2.69.1
  - @memberjunction/aiengine@2.69.1
  - @memberjunction/core-entities@2.69.1
  - @memberjunction/templates-base-types@2.69.1
  - @memberjunction/templates@2.69.1
  - @memberjunction/ai@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Minor Changes

- 79e8509: Several changes to improve validation functionality

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0
  - @memberjunction/ai-core-plus@2.69.0
  - @memberjunction/aiengine@2.69.0
  - @memberjunction/core-entities@2.69.0
  - @memberjunction/templates-base-types@2.69.0
  - @memberjunction/templates@2.69.0
  - @memberjunction/ai@2.69.0

## 2.68.0

### Patch Changes

- 6fa0b2d: child template rendering fix
- Updated dependencies [b10b7e6]
  - @memberjunction/core@2.68.0
  - @memberjunction/ai-core-plus@2.68.0
  - @memberjunction/aiengine@2.68.0
  - @memberjunction/core-entities@2.68.0
  - @memberjunction/templates-base-types@2.68.0
  - @memberjunction/templates@2.68.0
  - @memberjunction/ai@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/ai@2.67.0
- @memberjunction/ai-core-plus@2.67.0
- @memberjunction/aiengine@2.67.0
- @memberjunction/core@2.67.0
- @memberjunction/core-entities@2.67.0
- @memberjunction/global@2.67.0
- @memberjunction/templates-base-types@2.67.0
- @memberjunction/templates@2.67.0

## 2.66.0

### Patch Changes

- @memberjunction/ai-core-plus@2.66.0
- @memberjunction/aiengine@2.66.0
- @memberjunction/templates@2.66.0
- @memberjunction/ai@2.66.0
- @memberjunction/core@2.66.0
- @memberjunction/core-entities@2.66.0
- @memberjunction/global@2.66.0
- @memberjunction/templates-base-types@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [1d034b7]
- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/ai@2.65.0
  - @memberjunction/ai-core-plus@2.65.0
  - @memberjunction/global@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/aiengine@2.65.0
  - @memberjunction/templates@2.65.0
  - @memberjunction/core@2.65.0
  - @memberjunction/templates-base-types@2.65.0

## 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/ai-core-plus@2.64.0
  - @memberjunction/aiengine@2.64.0
  - @memberjunction/templates-base-types@2.64.0
  - @memberjunction/templates@2.64.0
  - @memberjunction/ai@2.64.0
  - @memberjunction/core@2.64.0
  - @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/ai@2.63.1
  - @memberjunction/ai-core-plus@2.63.1
  - @memberjunction/aiengine@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1
  - @memberjunction/templates-base-types@2.63.1
  - @memberjunction/templates@2.63.1

## 2.63.0

### Patch Changes

- Updated dependencies [28e8a85]
  - @memberjunction/ai-core-plus@2.63.0
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/aiengine@2.63.0
  - @memberjunction/templates-base-types@2.63.0
  - @memberjunction/templates@2.63.0
  - @memberjunction/ai@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Minor Changes

- 4a4b488: Failover support

### Patch Changes

- c995603: Better Error Handling and Failover in AI core and Promts
- Updated dependencies [c995603]
  - @memberjunction/ai@2.62.0
  - @memberjunction/ai-core-plus@2.62.0
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/aiengine@2.62.0
  - @memberjunction/templates@2.62.0
  - @memberjunction/templates-base-types@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- Updated dependencies [51b2b47]
  - @memberjunction/ai-core-plus@2.61.0
  - @memberjunction/aiengine@2.61.0
  - @memberjunction/templates@2.61.0
  - @memberjunction/ai@2.61.0
  - @memberjunction/core@2.61.0
  - @memberjunction/core-entities@2.61.0
  - @memberjunction/global@2.61.0
  - @memberjunction/templates-base-types@2.61.0

## 2.60.0

### Minor Changes

- e512e4e: metadata + core + ai changes

### Patch Changes

- Updated dependencies [bb46c63]
- Updated dependencies [b5fa80a]
- Updated dependencies [e30ee12]
- Updated dependencies [e512e4e]
  - @memberjunction/ai-core-plus@2.60.0
  - @memberjunction/core@2.60.0
  - @memberjunction/core-entities@2.60.0
  - @memberjunction/aiengine@2.60.0
  - @memberjunction/templates-base-types@2.60.0
  - @memberjunction/templates@2.60.0
  - @memberjunction/ai@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/ai@2.59.0
- @memberjunction/ai-core-plus@2.59.0
- @memberjunction/aiengine@2.59.0
- @memberjunction/core@2.59.0
- @memberjunction/core-entities@2.59.0
- @memberjunction/global@2.59.0
- @memberjunction/templates-base-types@2.59.0
- @memberjunction/templates@2.59.0

## 2.58.0

### Minor Changes

- db88416: migrations

### Patch Changes

- Updated dependencies [def26fe]
- Updated dependencies [db88416]
  - @memberjunction/core@2.58.0
  - @memberjunction/ai@2.58.0
  - @memberjunction/ai-core-plus@2.58.0
  - @memberjunction/aiengine@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/templates-base-types@2.58.0
  - @memberjunction/templates@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/global@2.57.0
  - @memberjunction/aiengine@2.57.0
  - @memberjunction/templates-base-types@2.57.0
  - @memberjunction/templates@2.57.0
  - @memberjunction/ai@2.57.0

## 2.56.0

### Patch Changes

- Updated dependencies [bf24cae]
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/aiengine@2.56.0
  - @memberjunction/templates-base-types@2.56.0
  - @memberjunction/templates@2.56.0
  - @memberjunction/ai@2.56.0
  - @memberjunction/core@2.56.0
  - @memberjunction/global@2.56.0

## 2.55.0

### Patch Changes

- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
  - @memberjunction/ai@2.55.0
  - @memberjunction/aiengine@2.55.0
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/templates@2.55.0
  - @memberjunction/templates-base-types@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- c96d6dd: various
- Updated dependencies [20f424d]
- Updated dependencies [a6f553e]
- Updated dependencies [0f6e995]
- Updated dependencies [0046359]
  - @memberjunction/core@2.54.0
  - @memberjunction/aiengine@2.54.0
  - @memberjunction/core-entities@2.54.0
  - @memberjunction/templates-base-types@2.54.0
  - @memberjunction/templates@2.54.0
  - @memberjunction/ai@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- Updated dependencies [bddc4ea]
- Updated dependencies [390f587]
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/templates@2.53.0
  - @memberjunction/aiengine@2.53.0
  - @memberjunction/templates-base-types@2.53.0
  - @memberjunction/ai@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Patch Changes

- Updated dependencies [e926106]
  - @memberjunction/ai@2.52.0
  - @memberjunction/aiengine@2.52.0
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/templates@2.52.0
  - @memberjunction/templates-base-types@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Patch Changes

- 4a79606: **Breaking circular dependency between AI packages**

  Resolves a circular dependency that was preventing `@memberjunction/core-entities-server` and other packages from
  building during `npm install`.

  **Root Cause:**
  - `@memberjunction/aiengine` imported `AIPromptRunResult` from `@memberjunction/ai-prompts`
  - `@memberjunction/ai-prompts` depended on `@memberjunction/aiengine` in package.json
  - This circular dependency blocked the build chain

  **Solution:**
  - Moved `AIPromptRunResult` and related types to `@memberjunction/ai` as shared types
  - Updated all packages to import from the shared location instead of creating circular references
  - Added comprehensive build failure debugging guide to development documentation

  **Packages Fixed:**
  - `@memberjunction/core-entities-server` now builds successfully
  - All AI packages (`aiengine`, `ai-prompts`, `ai-agents`) build without circular dependency issues
  - Build order now resolves properly in the monorepo

- Updated dependencies [4a79606]
- Updated dependencies [faf513c]
- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
  - @memberjunction/ai@2.51.0
  - @memberjunction/aiengine@2.51.0
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/templates@2.51.0
  - @memberjunction/templates-base-types@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/ai@2.50.0
- @memberjunction/aiengine@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/global@2.50.0
- @memberjunction/templates-base-types@2.50.0
- @memberjunction/templates@2.50.0

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
  - @memberjunction/ai@2.49.0
  - @memberjunction/aiengine@2.49.0
  - @memberjunction/templates-base-types@2.49.0
  - @memberjunction/templates@2.49.0

## 2.48.0

### Minor Changes

- 031e724: Implement agent architecture separation of concerns
  - **NEW**: Add BaseAgent class for domain-specific prompt execution
  - **NEW**: Add ConductorAgent for autonomous orchestration decisions and action planning
  - **NEW**: Add AgentRunner class to coordinate BaseAgent + ConductorAgent interactions
  - **NEW**: Add AgentFactory with `GetConductorAgent()` and `GetAgentRunner()` methods using MJGlobal
    class factory
  - **NEW**: Add comprehensive execution tracking with AIAgentRun and AIAgentRunStep entities
  - **NEW**: Support parallel and sequential action execution with proper ordering
  - **NEW**: Structured JSON response format for deterministic decision parsing
  - **NEW**: Database persistence for execution history and step tracking
  - **NEW**: Cancellation and progress monitoring support
  - **NEW**: Context compression for long conversations
  - **NEW**: Template rendering with data context

  This implements clean separation of concerns:
  - BaseAgent: Domain-specific execution only (~500 lines)
  - ConductorAgent: Orchestration decisions with structured responses
  - AgentRunner: Coordination layer providing unified user interface

  Includes comprehensive TypeScript typing and MemberJunction framework integration.

### Patch Changes

- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
  - @memberjunction/core@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/aiengine@2.48.0
  - @memberjunction/templates@2.48.0
  - @memberjunction/ai@2.48.0
  - @memberjunction/global@2.48.0

## 2.47.0

### Minor Changes

- 4c4751c: Changed datetime2 to datetimeoffset for RunAt/CompletedAt columns in the AIPromptRun table

### Patch Changes

- 3621e2f: Tweaks to prompt interface
  - @memberjunction/aiengine@2.47.0
  - @memberjunction/templates@2.47.0
  - @memberjunction/ai@2.47.0
  - @memberjunction/core@2.47.0
  - @memberjunction/core-entities@2.47.0
  - @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/ai@2.46.0
- @memberjunction/aiengine@2.46.0
- @memberjunction/core@2.46.0
- @memberjunction/core-entities@2.46.0
- @memberjunction/global@2.46.0
- @memberjunction/templates@2.46.0

## 2.45.0

### Minor Changes

- 21d456d: Metadata and functional improvements for AI system (mainly parallelization and logging)

### Patch Changes

- Updated dependencies [21d456d]
- Updated dependencies [556ee8d]
  - @memberjunction/ai@2.45.0
  - @memberjunction/aiengine@2.45.0
  - @memberjunction/core-entities@2.45.0
  - @memberjunction/templates@2.45.0
  - @memberjunction/core@2.45.0
  - @memberjunction/global@2.45.0

## 2.44.0

### Minor Changes

- f7aec1c: Moved functionality around in the AI packages to reflect new organization plus elim cyclical dep issue with @memberjunction/templates engine

### Patch Changes

- Updated dependencies [f7aec1c]
- Updated dependencies [fbc30dc]
- Updated dependencies [d723c0c]
- Updated dependencies [9f02cd8]
- Updated dependencies [99b27c5]
- Updated dependencies [091c5f6]
  - @memberjunction/aiengine@2.44.0
  - @memberjunction/ai@2.44.0
  - @memberjunction/core@2.44.0
  - @memberjunction/core-entities@2.44.0
  - @memberjunction/templates@2.44.0
  - @memberjunction/global@2.44.0

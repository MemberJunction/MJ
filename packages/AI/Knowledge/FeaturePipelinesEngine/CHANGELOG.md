# @memberjunction/feature-pipelines-engine

## 6.3.0-edge.0

### Minor Changes

- 31cc053: Add durable HITL feedback and agent tree budgets, `AgentContextAssembler`, `AgentStepDispatcher`, `DurableEntityA2ATaskStore`, `TaskSecurityEnvelope` least-privilege and taint enforcement, TaskGraph saga compensation with idempotent retries, `GraphEngine` and `CanonGraphEngine` semantic graph runtime with server entity validation, `GetGraphContextAction`, `GraphSearchProvider` RRF search lane, `graphExpand` pipeline stage, and Predictive Studio shadow scoring with PSI drift detection.

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
- Updated dependencies [d073171]
- Updated dependencies [16ac431]
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
- Updated dependencies [0693b9b]
- Updated dependencies [b332459]
- Updated dependencies [100b9c2]
- Updated dependencies [6bd8271]
- Updated dependencies [6fd9fb7]
- Updated dependencies [70b5e38]
- Updated dependencies [755b210]
- Updated dependencies [7eff627]
- Updated dependencies [b5df80e]
- Updated dependencies [28cec7d]
- Updated dependencies [b9fda3f]
- Updated dependencies [9c4f458]
- Updated dependencies [b68d388]
- Updated dependencies [5c4fa7c]
- Updated dependencies [8c3c8a4]
- Updated dependencies [fbbc06a]
- Updated dependencies [7ace3ee]
- Updated dependencies [2b349b9]
- Updated dependencies [07b7840]
- Updated dependencies [d87bb40]
- Updated dependencies [c889b72]
  - @memberjunction/core@6.3.0-edge.0
  - @memberjunction/core-entities@6.3.0-edge.0
  - @memberjunction/global@6.3.0-edge.0
  - @memberjunction/testing-engine@6.3.0-edge.0
  - @memberjunction/aiengine@6.3.0-edge.0
  - @memberjunction/actions@6.3.0-edge.0
  - @memberjunction/ai-core-plus@6.3.0-edge.0
  - @memberjunction/feature-pipelines@6.3.0-edge.0
  - @memberjunction/ai@6.3.0-edge.0
  - @memberjunction/record-set-processor@6.3.0-edge.0
  - @memberjunction/entity-documents@6.3.0-edge.0
  - @memberjunction/ai-prompts@6.3.0-edge.0
  - @memberjunction/actions-base@6.3.0-edge.0
  - @memberjunction/record-set-processor-base@6.3.0-edge.0
  - @memberjunction/templates@6.3.0-edge.0
  - @memberjunction/testing-engine-base@6.3.0-edge.0

## 6.2.0

### Minor Changes

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

- 9a2d7cc: RunView's `TotalRowCount` contract is now explicit: a number is always a real total, and `undefined` means the caller passed `SkipTotalRowCount: true`.

  **Contract change.** `RunViewResult.TotalRowCount` is now optional (`TotalRowCount?: number`). With `SkipTotalRowCount: true` it is always `undefined`, including on a page that was not full, where it used to be the number of rows returned. A caller that needs a total must not pass the flag. Strict TypeScript consumers that read the field will see a compile error; a call without the flag always gets a number, so `?? 0` is safe there. `ResultType: 'count_only'` ignores the flag and always counts.

  `MaxRows: 1` is no longer special-cased: a full page of one row now runs the same count as any other full page and reports the real total. Callers that only read `Results` should pass `SkipTotalRowCount: true` to avoid that second query; about 270 such reads in this repo now do. `SkipTotalRowCount` is now sent over GraphQL, so browser callers can use it too.

- Updated dependencies [0d81c53]
- Updated dependencies [abf8778]
- Updated dependencies [ddcd666]
- Updated dependencies [622f166]
- Updated dependencies [f555162]
- Updated dependencies [54f6563]
- Updated dependencies [043f418]
- Updated dependencies [1419ba7]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [96d6ec2]
- Updated dependencies [a709bb6]
- Updated dependencies [39b35f1]
- Updated dependencies [d17de94]
- Updated dependencies [7ada797]
- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [3fbda62]
- Updated dependencies [eaa9455]
- Updated dependencies [ff00d60]
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
- Updated dependencies [293c316]
- Updated dependencies [b518dfa]
- Updated dependencies [0eeb89d]
- Updated dependencies [ecf36eb]
- Updated dependencies [52b9fd5]
- Updated dependencies [cc36de5]
- Updated dependencies [9cb815b]
- Updated dependencies [709de1a]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [37891d3]
- Updated dependencies [6ad6434]
- Updated dependencies [155aa45]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [15a4333]
- Updated dependencies [d2db108]
- Updated dependencies [dfe40a4]
- Updated dependencies [1da00cb]
- Updated dependencies [d43d86e]
- Updated dependencies [b699a37]
- Updated dependencies [a3539d2]
- Updated dependencies [db39145]
- Updated dependencies [41274aa]
- Updated dependencies [a4b23b7]
- Updated dependencies [91cba84]
- Updated dependencies [b14c72f]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [c671f85]
- Updated dependencies [49f26d9]
- Updated dependencies [660ef45]
- Updated dependencies [961d529]
- Updated dependencies [5e4205c]
- Updated dependencies [10c2311]
- Updated dependencies [8fd1c46]
- Updated dependencies [5da3ad2]
- Updated dependencies [8f370b3]
- Updated dependencies [0cc6b08]
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
- Updated dependencies [953086f]
- Updated dependencies [e8e6cd6]
- Updated dependencies [142d524]
- Updated dependencies [bb3028a]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [e1fd4c1]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [72d8a40]
- Updated dependencies [e1dd673]
- Updated dependencies [664baea]
- Updated dependencies [f3c6161]
- Updated dependencies [01fafc6]
- Updated dependencies [9b8a84e]
- Updated dependencies [35ffb95]
- Updated dependencies [5148534]
- Updated dependencies [d29b5c2]
- Updated dependencies [c261eb8]
- Updated dependencies [59e32e0]
- Updated dependencies [50ba290]
- Updated dependencies [ffb3c0f]
- Updated dependencies [d122a41]
- Updated dependencies [0a7c255]
- Updated dependencies [0adaf76]
- Updated dependencies [0ff7523]
- Updated dependencies [520bd09]
- Updated dependencies [520bd09]
- Updated dependencies [ce1a5c3]
- Updated dependencies [64b6fa5]
- Updated dependencies [d86bcbc]
- Updated dependencies [42d701e]
- Updated dependencies [307da67]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [af6f892]
- Updated dependencies [a65dfb8]
- Updated dependencies [7110019]
- Updated dependencies [d6b39c4]
- Updated dependencies [5f0baf7]
- Updated dependencies [f65fec7]
- Updated dependencies [513e608]
- Updated dependencies [ef43cf3]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [cb205de]
- Updated dependencies [b44c7cf]
- Updated dependencies [0ab85d7]
- Updated dependencies [0c634ba]
- Updated dependencies [a6f8c1c]
- Updated dependencies [432fe69]
- Updated dependencies [56d7614]
- Updated dependencies [223669e]
- Updated dependencies [683f652]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [914e6ff]
- Updated dependencies [4889fb2]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [b2441c3]
- Updated dependencies [69e19c5]
- Updated dependencies [7316ac3]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [2274f42]
- Updated dependencies [9ce7cf4]
- Updated dependencies [0fb3649]
- Updated dependencies [131f3c4]
- Updated dependencies [861cbf0]
- Updated dependencies [9096523]
- Updated dependencies [6fd16d2]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [705ab4e]
- Updated dependencies [a7da50b]
- Updated dependencies [0f04590]
- Updated dependencies [e533f99]
- Updated dependencies [5fed75a]
- Updated dependencies [e51ce8a]
- Updated dependencies [4c0eaec]
- Updated dependencies [1cb1d52]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [1d43161]
- Updated dependencies [0a75bb2]
- Updated dependencies [f26084f]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [fe39606]
- Updated dependencies [db39145]
- Updated dependencies [f48dffc]
- Updated dependencies [41c2c08]
- Updated dependencies [630bb88]
- Updated dependencies [e69634e]
- Updated dependencies [7658d68]
- Updated dependencies [7110019]
- Updated dependencies [f2a4171]
- Updated dependencies [e482249]
- Updated dependencies [37e2f6b]
- Updated dependencies [6779eed]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [6d5c6ad]
- Updated dependencies [29b6ec3]
- Updated dependencies [0b406e8]
- Updated dependencies [1141164]
- Updated dependencies [44faf83]
- Updated dependencies [230cdad]
- Updated dependencies [17cc774]
- Updated dependencies [dae1d31]
- Updated dependencies [bfd67c6]
- Updated dependencies [8bac4d6]
- Updated dependencies [575bfae]
- Updated dependencies [c018cb9]
- Updated dependencies [365e3a1]
- Updated dependencies [80905a1]
- Updated dependencies [4c97994]
- Updated dependencies [397ae9a]
- Updated dependencies [08b3d7b]
- Updated dependencies [7e72c86]
- Updated dependencies [e9ab27b]
- Updated dependencies [b545842]
- Updated dependencies [a17a228]
- Updated dependencies [21175fa]
- Updated dependencies [6b08ebf]
- Updated dependencies [4e4c82d]
- Updated dependencies [5fed75a]
- Updated dependencies [ee1f0d9]
- Updated dependencies [ce758af]
- Updated dependencies [89a5b59]
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
- Updated dependencies [373b180]
- Updated dependencies [6b0de38]
- Updated dependencies [aee2d53]
- Updated dependencies [279b93e]
- Updated dependencies [5dc3752]
- Updated dependencies [8420f36]
- Updated dependencies [6c8798b]
- Updated dependencies [f0c78c3]
- Updated dependencies [4ef13d6]
- Updated dependencies [72dd65c]
- Updated dependencies [25f7b82]
- Updated dependencies [8b90b41]
- Updated dependencies [35ed7b5]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [02bb563]
- Updated dependencies [104125c]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [d296edd]
- Updated dependencies [66fd011]
- Updated dependencies [6a5fb64]
- Updated dependencies [fd84ab1]
- Updated dependencies [0e93e1f]
- Updated dependencies [509d2aa]
- Updated dependencies [68f5c01]
- Updated dependencies [196160a]
- Updated dependencies [afe9eb4]
- Updated dependencies [5513c2a]
- Updated dependencies [90829e3]
- Updated dependencies [1d29837]
- Updated dependencies [14e2a3a]
- Updated dependencies [5986939]
- Updated dependencies [200e634]
- Updated dependencies [31057d8]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [8c120db]
- Updated dependencies [57096ab]
- Updated dependencies [bea2386]
- Updated dependencies [9a2d7cc]
- Updated dependencies [3ab85f9]
- Updated dependencies [aac148b]
- Updated dependencies [0cc6b08]
- Updated dependencies [a28ce42]
- Updated dependencies [17a4137]
- Updated dependencies [9ce70b3]
- Updated dependencies [b4afc13]
- Updated dependencies [36a3f9e]
- Updated dependencies [539dfe3]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [d2cb42e]
- Updated dependencies [cbddadb]
- Updated dependencies [60bd774]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [ac18db8]
- Updated dependencies [35da130]
- Updated dependencies [c4645bc]
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
- Updated dependencies [e962151]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [718b01c]
- Updated dependencies [57fea6a]
- Updated dependencies [374b1a4]
- Updated dependencies [2c590b0]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [c8fb9d7]
- Updated dependencies [2854a2e]
- Updated dependencies [03c085c]
- Updated dependencies [28df136]
- Updated dependencies [6b487b8]
- Updated dependencies [b0b2cc9]
- Updated dependencies [dc38250]
- Updated dependencies [fc3da91]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0
  - @memberjunction/ai-prompts@6.2.0
  - @memberjunction/ai@6.2.0
  - @memberjunction/actions-base@6.2.0
  - @memberjunction/aiengine@6.2.0
  - @memberjunction/ai-core-plus@6.2.0
  - @memberjunction/actions@6.2.0
  - @memberjunction/global@6.2.0
  - @memberjunction/core@6.2.0
  - @memberjunction/record-set-processor@6.2.0
  - @memberjunction/record-set-processor-base@6.2.0
  - @memberjunction/testing-engine@6.2.0
  - @memberjunction/feature-pipelines@6.2.0
  - @memberjunction/testing-engine-base@6.2.0
  - @memberjunction/entity-documents@6.2.0
  - @memberjunction/templates@6.2.0

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
- Updated dependencies [365e3a1]
- Updated dependencies [373b180]
- Updated dependencies [539dfe3]
- Updated dependencies [ac18db8]
  - @memberjunction/core@6.2.0-edge.8
  - @memberjunction/core-entities@6.2.0-edge.8
  - @memberjunction/aiengine@6.2.0-edge.8
  - @memberjunction/global@6.2.0-edge.8
  - @memberjunction/actions-base@6.2.0-edge.8
  - @memberjunction/actions@6.2.0-edge.8
  - @memberjunction/ai-core-plus@6.2.0-edge.8
  - @memberjunction/testing-engine-base@6.2.0-edge.8
  - @memberjunction/testing-engine@6.2.0-edge.8
  - @memberjunction/ai-prompts@6.2.0-edge.8
  - @memberjunction/entity-documents@6.2.0-edge.8
  - @memberjunction/feature-pipelines@6.2.0-edge.8
  - @memberjunction/record-set-processor-base@6.2.0-edge.8
  - @memberjunction/record-set-processor@6.2.0-edge.8
  - @memberjunction/templates@6.2.0-edge.8
  - @memberjunction/ai@6.2.0-edge.8

## 6.2.0-edge.7

### Patch Changes

- 9a2d7cc: RunView's `TotalRowCount` contract is now explicit: a number is always a real total, and `undefined` means the caller passed `SkipTotalRowCount: true`.

  **Contract change.** `RunViewResult.TotalRowCount` is now optional (`TotalRowCount?: number`). With `SkipTotalRowCount: true` it is always `undefined`, including on a page that was not full, where it used to be the number of rows returned. A caller that needs a total must not pass the flag. Strict TypeScript consumers that read the field will see a compile error; a call without the flag always gets a number, so `?? 0` is safe there. `ResultType: 'count_only'` ignores the flag and always counts.

  `MaxRows: 1` is no longer special-cased: a full page of one row now runs the same count as any other full page and reports the real total. Callers that only read `Results` should pass `SkipTotalRowCount: true` to avoid that second query; about 270 such reads in this repo now do. `SkipTotalRowCount` is now sent over GraphQL, so browser callers can use it too.

- Updated dependencies [54f6563]
- Updated dependencies [1419ba7]
- Updated dependencies [c93c0f8]
- Updated dependencies [ecf36eb]
- Updated dependencies [91cba84]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [8f370b3]
- Updated dependencies [c8c48e1]
- Updated dependencies [3bace5a]
- Updated dependencies [953086f]
- Updated dependencies [f4cd5fb]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [d6b39c4]
- Updated dependencies [f65fec7]
- Updated dependencies [0fb3649]
- Updated dependencies [4c0eaec]
- Updated dependencies [6779eed]
- Updated dependencies [0b406e8]
- Updated dependencies [c018cb9]
- Updated dependencies [397ae9a]
- Updated dependencies [89a5b59]
- Updated dependencies [6b0de38]
- Updated dependencies [4ef13d6]
- Updated dependencies [8b90b41]
- Updated dependencies [509d2aa]
- Updated dependencies [9a2d7cc]
- Updated dependencies [36a3f9e]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [aca4317]
- Updated dependencies [c8fb9d7]
- Updated dependencies [b0b2cc9]
  - @memberjunction/actions@6.2.0-edge.7
  - @memberjunction/actions-base@6.2.0-edge.7
  - @memberjunction/ai-core-plus@6.2.0-edge.7
  - @memberjunction/global@6.2.0-edge.7
  - @memberjunction/ai@6.2.0-edge.7
  - @memberjunction/aiengine@6.2.0-edge.7
  - @memberjunction/core-entities@6.2.0-edge.7
  - @memberjunction/core@6.2.0-edge.7
  - @memberjunction/ai-prompts@6.2.0-edge.7
  - @memberjunction/testing-engine@6.2.0-edge.7
  - @memberjunction/entity-documents@6.2.0-edge.7
  - @memberjunction/feature-pipelines@6.2.0-edge.7
  - @memberjunction/record-set-processor@6.2.0-edge.7
  - @memberjunction/record-set-processor-base@6.2.0-edge.7
  - @memberjunction/templates@6.2.0-edge.7
  - @memberjunction/testing-engine-base@6.2.0-edge.7

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
- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
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
- Updated dependencies [fd84ab1]
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
  - @memberjunction/actions-base@6.2.0-edge.6
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/aiengine@6.2.0-edge.6
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/record-set-processor-base@6.2.0-edge.6
  - @memberjunction/record-set-processor@6.2.0-edge.6
  - @memberjunction/ai-prompts@6.2.0-edge.6
  - @memberjunction/actions@6.2.0-edge.6
  - @memberjunction/entity-documents@6.2.0-edge.6
  - @memberjunction/templates@6.2.0-edge.6
  - @memberjunction/testing-engine@6.2.0-edge.6
  - @memberjunction/feature-pipelines@6.2.0-edge.6
  - @memberjunction/testing-engine-base@6.2.0-edge.6

## 6.2.0-edge.5

### Minor Changes

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

- Updated dependencies [0d81c53]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
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
- Updated dependencies [0ab85d7]
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
- Updated dependencies [8420f36]
- Updated dependencies [72dd65c]
- Updated dependencies [1d29837]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [0cc6b08]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [03c085c]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/ai-prompts@6.2.0-edge.5
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/ai-core-plus@6.2.0-edge.5
  - @memberjunction/actions-base@6.2.0-edge.5
  - @memberjunction/actions@6.2.0-edge.5
  - @memberjunction/aiengine@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/record-set-processor@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/templates@6.2.0-edge.5
  - @memberjunction/feature-pipelines@6.2.0-edge.5
  - @memberjunction/record-set-processor-base@6.2.0-edge.5
  - @memberjunction/entity-documents@6.2.0-edge.5
  - @memberjunction/testing-engine@6.2.0-edge.5
  - @memberjunction/testing-engine-base@6.2.0-edge.5

# @memberjunction/ai-agents

## 6.2.0-edge.6

### Minor Changes

- cc41d33: Chief of Staff Phase 2: Executive Cockpit, event-driven agent wakes, and a per-user OAuth prototype.
  - **Executive Cockpit (`ChiefOfStaffDashboardComponent`, `@memberjunction/ng-dashboards`).** A new Explorer surface registered as `ChiefOfStaffDashboard` with four tabs: an overview of counts, Priorities & OKRs built from `MJ_BizApps_Tasks: Tasks` when that OpenApp is installed, Approvals & Wakes (one-click Approve/Reject on pending `MJ: AI Agent Requests`, Wake Now / pause / resume on `MJ: User Routines` of type `AgentWake`), and a Governance tab that edits the user's `MJ: AI Agent User Policies` row. Tab, health filter and search round-trip through query params. The cockpit publishes read-only agent context and navigation tools; approvals, policy saves, wakes and task edits are deliberately not exposed to the agent. Metadata adds an opt-in `Chief of Staff` application whose only nav item is the cockpit.
  - **Event-driven agent wakes (`AgentWakeTriggerService`, `@memberjunction/ai-agents`).** When an action-created `MJ: AI Agent Requests` row moves from `Requested` to `Approved`, `Rejected` or `Responded`, or a new inter-agent request is created, `MJAIAgentRequestEntityServer.Save()` upserts a one-shot `AgentWake` routine with the resolved request in `resumeState`, so the owning user's agent runs on the dispatcher's next sweep instead of waiting for its cron. A routing method for inbound utility-mailbox email is included but has no ingestion caller yet.
  - **Per-user OAuth 2.0 (3LO) prototype (`CommunicationUserOAuthService`, `@memberjunction/core-actions`; `@memberjunction/credentials`).** PKCE S256 authorization flow with four enterprise gates (admin opt-in, allowed email domains, allowed tenant IDs, strict principal match) and owner-bound credential storage: `CredentialEngine.StoreUserDelegatedCredential` / `GetUserDelegatedCredential` / `RevokeUserDelegatedCredential`, with `CredentialOwnerMismatchError` thrown when a delegated credential is resolved by a different user. Off by default: the administrator gates (`AllowUserDelegatedOAuth`, `AllowedEmailDomains`, `AllowedOAuthTenantIDs`) live on `MJ: Communication Providers` and credentials are stored through `CredentialEngine`; there are no API routes or token transport implementation yet, and no communication provider consumes the stored token.
  - **Chief of Staff actions.** Approval requests created by the calendar/email, inter-agent and outbound-call actions now carry the `Approval` request type. The agent prompt template and action descriptions name the BizApps entities correctly (`MJ_BizApps_Tasks: Tasks`, `MJ_BizApps_Issues: Issues`) and warn against querying system catalogs.
  - **Review follow-ups.** The approval-creating actions resolve the `Approval` type through `AIEngine.Instance.ResolveAgentRequestTypeID` (the request-type cache shipped with the CRUD key-shape fix) instead of a hardcoded id (new result code `REQUEST_TYPE_NOT_FOUND`); the cockpit resolves the agent by name too. The inter-agent and outbound-call actions are renamed after what they do: `Send Inter-Agent Request` (`SendInterAgentRequestAction`, envelope type `InterAgentCoordinationEnvelope`, delivery mode `InterAgent`; the previous `InterAgentCoS` value is still accepted on in-flight rows) and `Prepare Outbound Call Brief` (`PrepareOutboundCallBriefAction`, `OutboundCallBrief`). `AgentWakeTriggerService` resolves inbound-mailbox senders through `UserCache` (roles loaded) and serializes wake upserts per user, agent and workstream. `CredentialEngine` hides `UserOAuth3LO:*` rows from the shared accessors (`Credentials`, `GetCredentialById`, `GetCredentialByName`, `GetDefaultCredentialForType`), checks the stored owner before overwriting a delegated row, and serializes the delegated create path.

- 281724a: Round 2 Citizen Agent Builder feedback fixes and local development JWT auth provider (`local`):
  - **Local Development Mock/Test JWT Auth (`local`)**: Added `LocalDevProvider` in `@memberjunction/auth-providers`, `/auth/dev-login` and `/auth/dev-users` endpoints in `@memberjunction/server` backed by `MagicLinkKeyManager` RS256 signing, `MJLocalDevProvider` in `@memberjunction/ng-auth-services`, and `AuthProvider: "local"` support in `@memberjunction/installer`. Enforced strict security guards: server startup refuses to boot if `MJ_DEV_AUTH_ENABLED=true` when `NODE_ENV=production`, and `/auth/dev-login` / `/auth/dev-users` reject any non-localhost request (`X-Forwarded-For`, `Forwarded`, `X-Real-IP`, `CF-Connecting-IP`, `Sec-Fetch-Site: cross-site`, `Host`, `Origin`, `Referer`, and socket remote address).
  - **Single-Tarball OpenApp Archive Download**: Updated `GitHubClient` in `@memberjunction/open-app-engine` to download and extract `.sql` migrations from a single repository `.tar.gz` archive stream (`downloadTarballArchive`) instead of per-directory and per-file Contents/Blob API calls, avoiding anonymous GitHub API rate limits and large-file truncation.
  - **Flow Agent & CLI Execution Fixes**: Enabled in-process `inRun` execution for Flow agents when no `AgentStepNode` task handler is registered, populated `userMessage` and `payload` in Flow prompt step context, supported multiple starting steps and join deferral, added `--prompt-file` (`-f`) to `mj ai agents run`, and wired `ClientClauseScreen` entity-view authorization for ad-hoc queries in `@memberjunction/ai-cli`.
  - **Query Action Output & Truncation**: Updated `RunStoredQueryAction` and `RunAdhocQueryAction` in `@memberjunction/core-actions` to populate structured `Results`, `RowCount`, and `TotalRowCount` output parameters, raised default `ColumnMaxLength` to `500`, and appended `...[truncated]` when values are truncated.
  - **Citizen Builder Template & Turbo Pass-Through**: Updated `citizen-builder` starter template to default to `Loop` agents, bind Docker host ports to `127.0.0.1`, pass `AI_VENDOR_API_KEY__*` and `MJ_*` through `turbo.json`, auto-select free host ports and unique `COMPOSE_PROJECT_NAME` in `mj agent init`, and added `AI_TURBO_ENV_PASSTHROUGH` doctor check in `@memberjunction/installer`.

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

- 68f5c01: Recording-ledger columns of `MJ: AI Agent Sessions` are no longer updatable through an entity save (#6010).
  - `RecordingStatus`, `RecordingExpectedShards`, `RecordingCapturedSamples`, `RecordingGaps`, `RecordingAssemblyVersion`, `RecordingFileID` and `RecordingMedia` carry `AllowUpdateAPI=false` (`metadata/entities/.ai-agent-session-recording-ledger-fields.json`). The regenerated `spCreate`/`spUpdateAIAgentSession` leave them out, so a stale session save (from any entity class, an app's own subclass included) can no longer clear a terminal stamp and mislabel a complete recording as `Partial`. The generated `MJAIAgentSessionEntity` drops their setters and the GraphQL create/update inputs drop the fields. `RecordingStartedAt` stays updatable.
  - New proc `spStampAIAgentSessionRecordingFile` and `IRealtimeRecordingLedger.StampFile(sessionID, { fileID?, media?, startedAt? })` write the recording file, media kind and t0. The end-of-call upload and the recording-start stamp use it.
  - `MJAIAgentSessionEntityServer` no longer overrides `Save`; it keeps only the protected-`Config`-keys guard.

  Migration: `V202610222240__v6.2.x__Recording_Ledger_Columns_Not_Entity_Updatable.sql`. Run `mj sync push` with the release metadata so the field flags land with the regenerated procs. Apply the migration and the metadata push together: between `mj migrate` and `mj sync push`, every session save fails because the entity still sends parameters the regenerated procs no longer accept.

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
- 709de1a: Anonymous realtime sessions are now isolated per visitor (#4931). Before, every anonymous visitor (a web-widget guest or an anonymous magic-link invitee) authenticated as the one shared Anonymous user, and the realtime session write gates compared only that user id, so a visitor who learned another visitor's session id could relay into it, close it, heartbeat it, drive its remote browser, or restore its state into a new session.
  - `UserInfo.AnonymousVisitorID` (`@memberjunction/core`) carries the token's `mj_sid`. An anonymous token without `mj_sid` is refused at sign-in.
  - One scope identity per session (`ResolveSessionScopeIdentity`, `@memberjunction/server`): the token's resource scope (`MagicLinkScope.ResourceID`) when it carries one, else the anonymous visitor's `mj_sid`. `SessionManager` stamps it as the session conversation's `ExternalID`, and `AuthorizeSessionAccess` compares it. A widget guest's resource scope is its `mj_sid`; redemptions of one resource-scoped anonymous invite share that scope by design and keep matching the `{{ScopeResourceID}}` row filters; redemptions of an unscoped multi-use invite are told apart by `mj_sid`.
  - All five write gates (`LoadOwnedRealtimeSession`, `AgentSessionResolver`, `RemoteBrowserActionResolver`, and the `lastSessionId` restore paths in `RealtimeClientSessionResolver`) go through `AuthorizeSessionAccess`.
  - `MJ: Conversations` and `MJ: AI Agent Sessions` (`@memberjunction/core-entities-server`) refuse an anonymous visitor changing `ExternalID` / `ConversationID` on an existing row, so the ownership key cannot be rewritten through generic CRUD under a role whose row filter is by user id. That includes a transaction group's `'Use'` variable on the key or on `ID`, which sets its field after validation; the protected-`Config` check on `MJ: AI Agent Sessions` also refuses a `'Use'` variable on `Config` or `ID`.
  - A named user with a resource-scoped link may also use its own session on a conversation that carries no scope stamp (one started from the Conversations app) when it can read that conversation; a conversation stamped with another scope, or one it cannot read, is still refused. `LoadSessionConversationScope` reports whether the read succeeded.
  - `SessionManager.CreateSession` refuses an anonymous caller that supplies a conversation it cannot read or whose `ExternalID` is not its own scope identity.
  - `POST /widget/session/refresh` now requires the current guest token as `Authorization: Bearer <token>` (accepted up to 300 s after it expires) plus a `DPoP` proof signed by the key the widget registered at mint (`proofKey` in the mint body; its RFC 7638 thumbprint is the token's `cnf.jkt`). It keeps the token's `mj_sid`, so a refreshed guest keeps its session, its row filters and its session-events subscription. A guest session ends 12 h after its first mint (`mj_sid_iat`, `MAX_GUEST_SESSION_SECONDS`); no token outlives that, and refresh is refused once less than 120 s remain (`MIN_REFRESHED_TOKEN_SECONDS`), so the widget's last refresh restarts the session instead of looping into the rate limiter. The proof protocol (`CreateProofOfPossessionKey`, `CreateProofOfPossessionJwt`, `VerifyProofOfPossessionJwt`, `ComputeJwkThumbprint`) is in `@memberjunction/global`. `WidgetKeyClient` (`@memberjunction/ng-realtime-widget`) and `WidgetSessionClient` (`@memberjunction/realtime-widget`) register the key and sign each refresh. When the server refuses a refresh (401/403), the web widget mints a new session and tells the visitor; `WidgetSessionError` carries the status. Both clients sign the refresh proof on the server's clock, learned from each issued token's `iat` (the HTTP `Date` header is not readable cross-origin), and the web widget times its refresh on it too, so a visitor whose device clock is minutes off keeps one session instead of restarting it at each refresh. The key needs Web Crypto, which browsers expose only in a secure context, so both widgets now need a host page served over HTTPS (or `localhost`); on a plain `http://` page the web widget shows nothing and logs `[mj-widget] The support widget needs a secure context …` to the console (`StartEmbeddedWidget`, which the embed bundle runs, never rejects).
  - A web-widget guest's text chat shows the agent's reply again. The agent runs as the system user, but since MJ#4791 only a conversation's owner (or a grantee) may write its messages, so every reply save was refused and the widget waited forever. `AgentRunner.RunAgentInConversation` takes a `ConversationWriter` (`@memberjunction/ai-agents`); `ElevateUserPayload` records the guest as `UserPayload.ElevatedFrom`, and `RunAIAgentResolver` passes it, so the reply is written as the guest and the run's own records as the system user. The run's status events (progress, streaming, completion, the liveness pulse) are stamped with the same guest (`StatusUpdateOwnerID`), so the guest's socket receives them; before, they carried the system user's id and the `statusUpdates` filter dropped every one. For an anonymous visitor the owner key is its user id plus its scope identity (`StatusUpdateOwnerKey`), and the filter rebuilds the same key from the connection, so a visitor who sends another visitor's (client-chosen) `x-session-id` does not receive that visitor's events.
  - `@memberjunction/realtime-widget`'s `build` now also runs `bundle`, so `dist/embed/mj-widget.js` is rebuilt with the package instead of only when someone remembers the separate step.
  - When the agent's reply cannot be saved, `RunAgentInConversation` now throws with the reason instead of only logging it. It still runs the artifact and media steps first, so the run's artifacts and `AIAgentRunMedia` are kept; for a caller-supplied `conversationDetailId` (which can never take the reply) it links nothing to that row and keeps only the `AIAgentRunMedia` rows. `RunAIAgentResolver` publishes a failed completion with the reason whenever a run throws, so a fire-and-forget client (the web widget, Explorer) learns of the failure at once instead of waiting out its idle timeout and then reconciling the run as a success.

  **Deploy together:** a widget bundle older than this release cannot refresh and gets 403 at its first refresh; a self-hosted copy of `mj-widget.js` must be replaced with the one this release builds. Guest tokens issued before the deploy carry no `cnf`, so they cannot be refreshed; the updated web widget then starts a new session. An anonymous magic-link session without a resource scope that was started before the deploy is refused after it; the visitor starts a new session.

- 142d524: Record CRUD actions accept every primary-key shape and fail fast on unknown fields; agent request types are cached on the AI engine.
  - `Get Record`, `Update Record` and `Delete Record` now accept the `PrimaryKey` parameter as a plain key-column map, the `CompositeKey` `{ KeyValuePairs }` shape, a JSON string of either, or (single-column keys only) the bare key value, which is mapped onto the entity's key column whatever it is called. A bare value for a composite key is rejected with the required columns listed, and a partial key reports every missing column at once.
  - `Create Record` and `Update Record` return `INVALID_FIELD_NAMES` (with the valid updatable field names) when `Fields` names a field the entity does not have, instead of dropping it and reporting success. Field names resolve case-insensitively against entity metadata, which also covers dynamic entities without a generated class.
  - `AIEngineBase` caches `MJ: AI Agent Request Types` and exposes `AgentRequestTypes`, `GetAgentRequestTypeByName` and the async `ResolveAgentRequestTypeID(name, contextUser)` (ensures the engine is loaded, returns the ID or `null`); `AIEngine` delegates to them and `BaseAgent` resolves a request's type through `ResolveAgentRequestTypeID` instead of a private per-run query.

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

- Updated dependencies [622f166]
- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [cc41d33]
- Updated dependencies [281724a]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [e8e6cd6]
- Updated dependencies [142d524]
- Updated dependencies [6ecb767]
- Updated dependencies [0ff7523]
- Updated dependencies [0ff7523]
- Updated dependencies [f7d5ab5]
- Updated dependencies [a65dfb8]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [96c44bf]
- Updated dependencies [1141164]
- Updated dependencies [dae1d31]
- Updated dependencies [4c97994]
- Updated dependencies [8ec184d]
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
  - @memberjunction/actions-base@6.2.0-edge.6
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/aiengine@6.2.0-edge.6
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/generic-database-provider@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/ai-engine-base@6.2.0-edge.6
  - @memberjunction/ai-prompts@6.2.0-edge.6
  - @memberjunction/ai-vector-dupe@6.2.0-edge.6
  - @memberjunction/ai-vector-sync@6.2.0-edge.6
  - @memberjunction/storage@6.2.0-edge.6
  - @memberjunction/actions@6.2.0-edge.6
  - @memberjunction/search-engine@6.2.0-edge.6
  - @memberjunction/templates@6.2.0-edge.6
  - @memberjunction/ai-reranker@6.2.0-edge.6
  - @memberjunction/rubrics@6.2.0-edge.6
  - @memberjunction/context-crush@6.2.0-edge.6

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

- 39b35f1: Real-time task graph workflow UX, continuation synthesis with step outputs and artifacts, single-step delegation folding, per-user runnable agent directory & task graph validation, and a redesigned AI Agent Workflows & Tasks Command Center (#5878).
  - **Single-step task graph folding (`@memberjunction/ai-agents`).** `LoopAgentType.DetermineNextStep` automatically folds single-node `Tasks` emissions with no dependencies into an in-turn `Sub-Agent` step (`terminateAfter: false`) so single-agent delegations complete in a single conversation turn without spawning a background task graph, while preserving durable `Tasks` execution for multi-step (`2+` node) workflows. When an orchestrator with `ArtifactCreationMode = 'Never'` or `'System Only'` delegates a folded step to a specialist agent that produces artifacts, `AgentRunner.ProcessAgentArtifacts` resolves the specialist's `DefaultArtifactTypeID` and creation mode so deliverables are persisted and attached to the conversation message.
  - **Per-user runnable agent directory, pre-submission task graph validation, and sub-agent workflow propagation (`@memberjunction/ai-engine-base`, `@memberjunction/aiengine`, `@memberjunction/ai-core-plus`, `@memberjunction/ai-agents`, `@memberjunction/task-graph`, `@memberjunction/server`).** `AIEngineBase.GetUserRunnableAgentDirectory(user)` caches a per-user directory of active top-level agents permitted by `CanUserRunAgent`, invalidated on agent and permission changes. `BaseAgent` preloads `availableAgentCount` / `availableAgentDetails` into prompt templates, validates `Tasks` step targets before submission (converting unknown or restricted agent/action references into a self-correcting `Retry` step with the user's permitted agent list), propagates `conversationDetailId` and `Paused` workflow-awaiting state from sub-agents (`Workflow Planner`) to parent runs (`Sage`), includes `agentRun.Message` in sub-agent result markdown, and settles/reinvokes ancestor runs along `ParentRunID` in `TaskGraphDispatcher` and `TaskGraphContinuationDeliverer`.
  - **Live task graph telemetry, isolated step artifact persistence, and adaptive continuation delivery (`@memberjunction/server`, `@memberjunction/ai-agents`, `@memberjunction/conversations-runtime`).** `TaskGraphAgentRunner` resolves the originating `ConversationDetailID`, passes `inputArtifacts: []` to isolate task-graph step runs from earlier conversation turn artifacts, and forces `behavior: 'create-new'` when persisting step deliverables so sibling/prior artifacts are never overwritten as `v2`. `AgentRunner.ProcessAgentArtifacts` infers `Research Content` (`report.html`) and extracts `report.name` / `report.description` / `synthesis.executiveSummary` for report-producing specialist steps. `TaskGraphContinuationDeliverer` strips inherited upstream keys from merged `OutputPayload`s, updates the originating workflow message in-place when no intervening messages were sent (`origin.IsLatest`), or posts a bottom continuation reply linked via `ConversationDetail.ParentID` when intervening messages were sent while the workflow ran.
  - **First-class inline Workflow Execution Card, Workflow Context Header, & real-time chat reconciliation (`@memberjunction/ng-conversations`).** `ConversationChatAreaComponent` and `MessageItemComponent` reconcile live `TaskGraphProgress` frames in place, deduplicate parent container tasks from executable step rows, strip inherited upstream payload keys from step summaries, and render a relational `.workflow-continuation-banner` (`Completed workflow · <Name> · View workflow ↑`) on bottom continuation replies that scrolls to and highlights the originating workflow turn.
  - **AI Agent Workflows & Tasks Command Center (`@memberjunction/ng-conversations`, `@memberjunction/ng-tasks`, `@memberjunction/ng-explorer-core`).** Redesigned `TasksFullViewComponent` with a 5-metric KPI telemetry ribbon, instant search and status/agent filters, a **Workflow Cards** DAG view, a second-resolution **Execution Timeline & DAG** waterfall view, and a slide-over **Step Inspector Drawer** with one-click navigation back to the originating conversation.

- b14c72f: Add the personal Chief of Staff (`Chief of Staff`) AI agent, per-user narrowed governance (`MJ: AI Agent User Policies` + `AgentUserPolicyEngine`), 3-Tier Wake Gate on `MJ: User Routines` (`RoutineType = 'AgentWake'`), user-scoped calendar/email/availability actions (`EnterpriseMailboxSecurityGate`), and Communication Dashboard enterprise governance cards.
- 5fed75a: Agent runs no longer write `AIAgentRun.Result`; use `FinalPayload`, which holds the same value. The `Result` column remains, deprecated, for existing rows.

  New column `AIAgentRunStep.PayloadAtStartSourceStepID`. When a step starts from the same payload an earlier step in the run ended with, `PayloadAtStart` is stored as NULL and this column points at that step. Readers resolve the value with `ResolvePayloadAtStart` / `ApplyResolvedPayloadAtStart` from `@memberjunction/ai-core-plus`. External API clients that read `PayloadAtStart` directly must follow the pointer.

- 8420f36: Client-direct realtime recordings no longer depend on the browser surviving the end of the call (#5294).
  - **Opus shards during the call.** The browser captures at 48 kHz into one continuous Opus encoder (WebCodecs, or libopus WebAssembly in a Worker where WebCodecs cannot encode Opus) and uploads a 5 s `MJOPUS1` shard as raw bytes to `POST /realtime/recording/:agentSessionId/shard/:index`. Each shard is kept in IndexedDB until the server acknowledges it, so shards survive network drops and reloads and are uploaded on the next page load.
  - **Keepalive terminal.** End, `pagehide` and `visibilitychange`→hidden send `POST /realtime/recording/:agentSessionId/end` with the last partial window as a `keepalive` request, then re-send every unacknowledged shard with `keepalive`. A hidden tab's terminal carries `final=false`: the server stamps the counts but assembles only after the grace period, so switching tabs does not rewrite the recording. `EndRealtimeSession()` waits for the terminal's acknowledgement for at most 3 s. The whole-call `UploadRealtimeRecording` upload and the `beforeunload` prompt are gone from new clients. The mutations remain for older clients.
  - **Server ledger and assembly.** Migration `V202610151535` adds `RecordingStatus`, `RecordingExpectedShards`, `RecordingCapturedSamples`, `RecordingGaps` and `RecordingAssemblyVersion` to `AIAgentSession`, and the new `MJ: AI Agent Session Recording Shards` entity, written through guarded stored procedures. MJAPI assembles `recording.wav` and `peaks.json` within seconds of the terminal. A recording with missing shards is assembled as `Partial` after `realtime.recordingAssemblyGraceSeconds` (default 90): each gap is silence and is listed in `RecordingGaps`. The session janitor assembles sessions that never sent a terminal. Recovery of legacy `seg-*.pcm` storage shards is unchanged.
  - **Breaking for custom hosts:** `IRealtimeSessionRecorder` now returns Opus packets (`TakeEncodedPackets()`, `Stop(): Promise<number>`) instead of base64 audio. `BrowserRecordingUnloadGuard` is removed. A host that wires its own page-lifecycle events calls `SendRecordingTerminal({ Final: false })` when the page is hidden and `SendRecordingTerminal()` on `pagehide`.

### Patch Changes

- 0cc6b08: `AgentRunner` reads a file-backed artifact's bytes through `FileStorageEngine.ResolveFileObject` (the storage-account gate and the tracked-file rule), like every other file-ID route, instead of taking the provider's first account straight to the driver. The file ID is validated as a UUID and escaped before it reaches SQL (it was interpolated raw). The reader is now a protected extension point, `DownloadArtifactFileContent`.
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

- fd780a9: An agent's conversation response no longer stays "In-Progress" after the run finishes.

  `AgentRunner.RunAgentInConversation` saves each progress message to the agent-response conversation detail, then writes the final status when the run ends. It waited for in-flight progress saves with `EnsureSaveComplete()`, which resolves on the entity's `save` event — and `BaseEntity` raises that event before the save finishes committing. A progress save still committing when the run ended was therefore in flight when the final update called `Save()`, and `BaseEntity.Save()` hands a concurrent caller the in-flight save's promise, so the final `Status`/`Message` were never written: the detail kept `Status: 'In-Progress'` and the last progress message. Progress saves now run one at a time on a promise chain that the final update awaits before saving; a failed progress save is logged and does not break the chain.

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

- db50c6b: `complete_task` no longer throws away a finished answer because the model wrote part of its `payloadChangeRequest` layout as escape sequences.

  `payloadChangeRequest` is a JSON string argument, so the model writes JSON inside a string. In long payloads the model sometimes switches, partway through, to writing the document's own newlines as `\n` escapes, usually right after a long string value such as a SQL query (`"…ASC"\n    }\n  }\n}`). `JSON.parse` rejected the whole payload, the step became a Retry, and on the forced final turn the iteration limit then failed a run that had a correct answer in hand. Gemini 3.8 Flash did exactly this.
  - **Repair.** New `DecodeJSONArgument` (in `native-tools/json-argument.ts`) parses normally first. Only if that fails does it turn `\n`, `\r` and `\t` escapes that sit outside string literals back into whitespace and parse again. A backslash is never valid JSON outside a string, so the repair cannot change the meaning of a document that was already valid, and escapes inside strings are untouched. Each repair is logged.
  - **A useful retry.** When the payload still cannot be parsed, the Retry message now ends with `Problem: <the parser's error>` instead of only saying the argument must be an object.

- afc1e0e: Shorten post-action streaming progress message from "Analyzing results from N completed action(s) to formulate response" to "Analyzing results from N completed action(s)".
- 81aea34: Enable full-conversation artifact manifest visibility (`artifactId`, `versionId`, `versionNumber`, `description`, `title`, and table/row summaries), `artifactDirective` forwarding across `LoopAgentResponse`/`LoopAgentType`/`BaseAgent` (including alpha-ID resolution to UUIDs and clean base payloads for `create-new`), `Data` artifact extract rules and payload title/description fallback on `MJ: Artifacts` and `MJ: Artifact Versions`, `QueryBuilderAgent` single-table vs. multi-table normalization on `Chat` and `Success` steps, and conversation artifact panel auto-opening on active branch paths.
- 5465489: Less work on the entity-load and agent hot paths, plus fixes to how fields a load omitted behave.
  - **`BaseEntity.GetAll()`** reads a record that hasn't built its fields yet straight from the loaded row, with the same date parsing and fixed-width trimming as `Get()`. It no longer builds every field just to serialize it.
  - **Loaded records skip metadata defaults** when their fields are built. Each loaded value replaces the default anyway, and a field the row didn't include is marked not loaded, so it no longer holds a default nobody loaded. New records still get their defaults.
  - **Fields a load or `Hydrate()` omitted hold nothing.** Reloading a record now clears the previous record's value from a field the new row leaves out, and `Hydrate()` no longer leaves a default there. An explicit write onto such a field, even null, makes it dirty and reaches the save, and a null on a NOT NULL field fails validation. `Revert()` puts such a field back to not loaded, and leaves fields that were never loaded alone. A row keyed by a field's `CodeName` (for example `Due_Date` for `Due Date`) now loads that field.
  - **`BaseEngine`** reads its own configs on every entity save or delete event instead of deep-copying them through `JSON.stringify` each time. **`LocalCacheManager`** totals entry sizes directly when deciding whether to evict.
  - **`PayloadManager`** copies payloads with a faster deep clone, doesn't clone the parent payload twice on a wildcard merge, and compiles each allowed-path pattern to a regex once. A backslash in a pattern now matches literally instead of acting as a regex escape. `DeepMerge` now merges only plain objects: a `Date` or class instance in the source replaces the destination value instead of collapsing to `{}`.
  - **`AIPromptRunner`** parses output that starts with `{` or `[` with `JSON.parse` before falling back to `CleanJSON`, which re-serialized valid JSON and parsed it a second time.

- 0ab85d7: Document the core performance work merged in #5729, which shipped without a changeset, and fix two defects it introduced. (The Source guards nested-scan failure #5729 caused was fixed separately in `fc7108fca1`.)

  **What #5729 changed**
  - Agent run steps store less. A step whose end payload repeats an earlier step's stored end now points at that step through the new `AIAgentRunStep.PayloadAtEndSourceStepID` column instead of storing a second copy, the same way `PayloadAtStartSourceStepID` already works for start payloads. Prompt steps no longer store the volatile `<mj-runtime-state>` messages, and later Prompt steps of a run store only the messages added since the previous Prompt step.
  - Core data access, caching and lookups are faster: indexed lookups replace linear scans in entity metadata, `BaseAIEngine`, the action engine and the class factory, and entity, cache, template and agent-runtime hot paths do less work per call.

  **Fixes**
  - `ActionEngineBase` lookup indexes now stay current after a save or delete. BaseEngine applies these changes to the cached arrays in place, and the params and result-code indexes were rebuilt only when the array was replaced, so they kept the old rows until restart. A param switched to `LogValue = false` kept being logged in plaintext to `ActionExecutionLog.Params`, a new `LogValue = false` param was not redacted, `GetActionByName` returned a renamed action's old entity, and `GetResultCode` missed new codes. The engine now discards its indexes on every data change, and the next lookup rebuilds them.
  - Resuming a stopped agent run now rebuilds the message stack the run actually had. Prompt steps stored only new messages even after the loop had replaced, removed or rewritten earlier ones (expiry stubs, expiry removal, compaction, expansion), so a resume brought back expired or removed messages. A Prompt step now stores only the new messages when the earlier ones are unchanged, and stores the full stack otherwise. A resume starts from the latest full stack and appends the later additions. Runs recorded before this change still resume as before.

  **Migration note for development databases**
  Migration `V202610141910__v6.2.x__AIAgentRunStep_PayloadAtEndSourceStepID.sql` sorts below `V202610151535`, which merged first. Released databases (`6.2.0-edge.4` is at `V202610131859`) apply both, in order, on upgrade. A development database migrated from `next` after `V202610151535` landed but before #5729 merged has `V202610151535` applied and `V202610141910` pending, and `mj migrate` refuses to run: `Detected resolved migration not applied to database: 202610141910. To allow out-of-order migrations, set outOfOrder to true.` To fix it, set `outOfOrder: true` in `mj.config.cjs`, run `mj migrate` once, then remove the setting.

- 9d1eb6a: fix(ai-agents): eliminate redundant agent names and awkward spliced phrases in streaming progress messages
  - Added `BaseAgent.buildPromptProgressMessage` so prompt re-execution progress messages use `previousDecision.retryReason` (or `retryInstructions`) directly instead of splicing complete sentences inside `"Running <Agent> with context from ..."`.
  - Omitted redundant agent names in initial prompt, initialization, and fallback progress messages when `_depth > 0`, since `formatHierarchicalMessage` already prefixes the sub-agent breadcrumb (`Query Strategist: Running initial prompt...` instead of `Query Strategist: Running Query Strategist's initial prompt...`).
  - Added descriptive `retryReason` strings when child, parallel, or related sub-agents complete (`Reviewing results from <SubAgent>`), and pluralized `1 completed action` vs `N completed actions` cleanly.

- 542795b: Memory-leak audit round 19 fixes.
  - **Ollama**: a request carrying a cancellation token no longer leaves abort listeners on that (long-lived) token. Each request adds one listener, removed when the call or stream ends, and early stream termination safely invokes `iterator.return()` without masking stream errors.
  - **Client tools & Realtime session signals**: `ClientToolRequestManager` session tool definitions are now an LRU with a 6 h idle TTL, capped at 1,000 sessions and 200 tools per session. `RealtimeClientSessionService.combineSignals` now pairs its combined `AbortSignal` with a `Dispose` callback called in `finally` so reused caller signals do not accumulate abort listeners across relayed tool calls.
  - **MCP client**: a failed `connect` now closes the transport it created (falling back to `transport.close()` directly if the client has no attached transport), so a stdio server's child process or an SSE/HTTP stream is no longer orphaned.
  - **Timers**: `ParallelExecuteAction` and the conversation-naming helper clear their timeout timer when the work finishes first.
  - **Dev Tools**: `EventMonitorComponent` and the 7 sibling DevTools `BaseResourceComponent` subclasses call `super.ngOnInit()` / `super.ngOnDestroy()`.

- fcc3f03: Clears the two Source guards failures on `next` from #5910 and #5912.
  - **Saving a chat task graph as a workflow** runs the save operation through the conversation's own provider (`ProviderToUse`), not the global `Metadata.Provider`. With several connections open, the global provider could route the save to the wrong server.
  - **Flow agents with several starting steps** check completed steps against a `UUIDSet` built once, instead of scanning the completed list with `UUIDsEqual` for every pending start step and every incoming join edge. Step IDs still match case-insensitively.

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

- 72dd65c: Adds `realtime.session.transcriptionLanguages`, a caption-language hint for realtime voice sessions, and makes a rejected Gemini Live connect fail instead of hang.
  - Gemini Live captions both sides of a call with its own transcription, and with no hint it guesses each utterance's language, so an English call could show captions in Arabic, Tamil or Korean script. `"transcriptionLanguages": ["en-US"]` (BCP-47 codes) under `realtime.session` is sent as `languageCodes` on both caption streams. It is a hint, not a lock: other languages still caption in their own script. Unset, nothing changes.
  - Set it on the target agent's `TypeConfiguration` (agent types without a `ConfigSchema`), an agent type's `DefaultConfiguration`, or a runtime override. A Realtime-type co-agent cannot save it yet: that type's schema does not declare `realtime.session`, which was already true for every session key.
  - The OpenAI-protocol drivers scrub the key, and the other drivers drop it with the rest of the shared session keys.
  - The relay's Live setup writer now keeps `languageCodes` on the Developer API, as SDK 2.14+ does, so relayed sessions carry the hint too.
  - Raises `@google/genai` from `^2.8.0` to `^2.16.0`, because SDKs before 2.14.0 throw on `languageCodes`. Set the key only after every browser bundle that opens Gemini sessions is rebuilt on this release.
  - A Gemini Live connect now rejects with the close reason when the socket errors or closes before setup completes, in the server and browser drivers for both the Developer API and Gemini Enterprise. Before, a close before the socket opened hung on any SDK, and from SDK 2.11 so did a rejected key, model or setup field.

- 1d29837: System placeholders now resolve in scoped prompt parts. After `BaseAgent.InjectScopedPromptParts` adds the parts (including from a subclass override), the agent passes the added messages to the new `SystemPlaceholderManager.ReplaceAvailablePlaceholders`, which replaces each bare token such as `{{ _CURRENT_DATE }}` with its value. Part text is not rendered as a template: every other character, including other `{{ ... }}` text, filters and tags, is sent as written, and so is a token that cannot be resolved before the prompt runs (prompt and Execution Context placeholders, or a user one without a context user). System placeholders declare what they need with the new optional `requires` field; one without it resolves only through `ResolveAllPlaceholders`, as before. Code that assembles parts itself with `PromptComponentResolver.AssembleMessages` can pass the result to `ReplaceAvailablePlaceholders` to get the same behavior.
- 0cc6b08: The Scoped Search action takes its tenant from the agent run, not from the model (A12.14).

  **Behaviour change.** Inside an agent run, the run's scope is authoritative for Scoped Search. A `PrimaryScopeRecordID` the run does not carry (a different tenant, or any tenant when the run has none) is refused with `INVALID_PARAM` and a `Forbidden` search-log row; with no `PrimaryScopeRecordID` the action searches the run's tenant. `SecondaryScopes` may restate a dimension the run sets only with an equal value; a dimension the run does not set is still added. The host sets the run's scope (`ExecuteAgentParams.PrimaryScopeEntityName` / `PrimaryScopeRecordID` / `SecondaryScopes`), never the model. The resolved tenant goes into both the permission decision and the search, so omitting it no longer drops tenant-scoped deny rows from the decision. A single agent run can no longer search several tenants by passing different values; run one run per tenant. Direct action calls outside an agent run are unaffected.

  **Malformed `SecondaryScopes` now refuses.** Input that is not valid JSON, is not an object, or holds a value other than a string, number, boolean or string array is refused with `INVALID_PARAM`, inside and outside a run. Before, it was logged and dropped, so the search ran without those dimensions. An object value is now accepted as well as a JSON string.
  - **`@memberjunction/actions-base`**: new `RunActionParams.RunScope` (`ActionRunScope`, `ActionRunScopeValue`). It is the run's tenant and secondary dimensions, set per dispatch beside `Audience`, never on the shared `Context`. Fields are `null` when the run is unscoped; the field is absent outside an agent run.
  - **`@memberjunction/ai-agents`**: `ExecuteSingleAction` always stamps `RunScope`. Inside `Execute` it uses the scope `initializeAgentRun` validated and wrote to the run row, with the agent's `ScopeConfig` defaults applied; called directly, it resolves the scope from its params the same way. `ExecuteSubAgent` strips the reserved run-data keys from the model-authored `templateParameters` before merging them into the child's `data`, and logs the key names once. The reserved keys are the scope family and `__agentTypePromptParams`. Without this a model could set a sub-agent's tenant whenever the parent's scope arrived through `data`. The parent's own `data` is passed on unchanged.
  - **`@memberjunction/ai-core-plus`**: new `RESERVED_AGENT_RUN_DATA_KEYS` and `WithoutReservedAgentRunDataKeys`. `@memberjunction/server`'s agent-run `data` guard now uses this shared list instead of its own copy.
  - **`@memberjunction/core-actions`**: Scoped Search resolves the tenant (`resolveTenant`). Forbidden rows now record the tenant they were judged under. TSDoc and `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` updated.

  Tests: unit tests in each package, and a new check in the deterministic `agent-run-audience` bundle (IT119, AU7). No migration.

- 0cc6b08: Three search trust fixes. Each changes behaviour.

  **External-index hits are always verified against the entity they name.** The permission pass used to skip its ownership check for any result labelled `SourceType: 'entity'` or `'fulltext'` when no row filter applied. Every shipped external-index provider (Azure AI Search, Typesense, Elasticsearch, OpenSearch) labels its hits `'fulltext'`, with the index name as `EntityName` and the document's own id as `RecordID`. So a document in an index named after an entity the user can read was admitted as that entity's row without being checked. A third-party provider could also label its hits `'entity'`. Trust now follows the provider the engine stamped on the result (`ProviderId`), never the label. The new `BaseSearchProvider.ResultsAreRowsOfLabelledEntity` flag (default `false`) is set only by `EntitySearchProvider` and `FullTextSearchProvider`, which read the entity through `RunView`. Every other result is verified, including one with no `ProviderId` and one whose `ProviderId` names no configured provider. Fusion and dedup keep each result's `ProviderId` paired with its own `EntityName`, `RecordID` and `SourceType`, so a merge never upgrades an external hit to trusted. A merge can still lend a result another item's scores: dedup merges items sharing `EntityName` + `RecordID`, but per-scope RRF merges `ScoreBreakdown` across items that share only a `RecordID`, of any entity. A `MJ: Content Items` hit promoted to its origin record is always verified: its provider never read that row. Cost: one `PK IN (...)` read per labelled entity for each search that returns external-index hits. Hits whose document id is not the MJ primary key of the labelled entity are dropped. The entity and full-text lanes cost nothing extra.

  **Naming a scope that cannot be resolved no longer widens the search to a global one.** An inactive, expired or missing scope in `SearchParams.ScopeIDs` used to be skipped. A search whose scopes were all skipped then ran with no scope at all. The GraphQL paths let a caller with a grant on a dead scope do this, because the scope permission check does not look at scope status. Now, if any named scope cannot be resolved, the search is refused: `Success: false`, an error naming the scope, a `LogError`, a `Failure` row in `MJ: Search Execution Logs`, and no provider runs. One dead scope among several also refuses the search, because dropping it silently would change what the caller asked for. The check runs before the result cache. `ExplainScope` agrees with the search. It now reports an inactive or expired scope as unreachable, by name; before, it explained one as searchable. When one requested scope cannot be resolved, it reports every scope in that dry run as unreachable, with the reason.

  **Streamed `provider` events carry counts only.** `streamSearch` used to put each provider's hits on its `provider` event, before the permission pass. That included rows the caller's row filters would drop, unverified external-index hits, and content whose origin record the caller may not read. `SearchKnowledgeStreamResolver` published those hits to the client. A `provider` event now carries `providerName`, `durationMs` and a new `resultCount` (the provider's hit count, capped at `MaxResults`). `results` is always `[]` and is deprecated. Results arrive only in `fused` and `final`. The GraphQL `SearchStreamNotification` gains `ResultCount` and always sends `Results: []` on a provider event, whatever the engine hands it. `GraphQLSearchClient.StreamSearch` requests `ResultCount` (new exported type `SearchStreamClientEvent`). `SearchService.StreamSearch` forwards it. The search overlay, the search results page and the scope form preview now show each provider's count from it, and render rows from `final` only. Pre-execution RAG's streaming trace and the Scoped Search action's `ProgressEvents` report `resultCount`. Like `SourceCounts`, `resultCount` is counted before the permission and audience passes, so don't show it to a room. This replaces the audience-only withholding of partials. Because a newer client requests `ResultCount`, its stream subscription fails against an older server. The reverse also shows: an older client counts each provider's `Results`, which a newer server always sends empty, so its per-provider chips show 0 until the client is upgraded. Search results themselves are unaffected.

  New deterministic integration bundle `IT118 - Search Provider Trust and Unresolvable Scopes` (`search-provider-trust`, SPT1–SPT2).

- Updated dependencies [3b0e8db]
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
- Updated dependencies [0cc6b08]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [5465489]
- Updated dependencies [a9344ad]
- Updated dependencies [d29b5c2]
- Updated dependencies [0ab85d7]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [cd39c95]
- Updated dependencies [2274f42]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [db39145]
- Updated dependencies [a0db1fb]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [230cdad]
- Updated dependencies [7e72c86]
- Updated dependencies [0cc6b08]
- Updated dependencies [4e4c82d]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [2a7a098]
- Updated dependencies [8420f36]
- Updated dependencies [72dd65c]
- Updated dependencies [1d29837]
- Updated dependencies [006a5e7]
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
- Updated dependencies [c7d1170]
- Updated dependencies [79d4f27]
- Updated dependencies [5f707d1]
- Updated dependencies [0cc6b08]
- Updated dependencies [e1f2583]
- Updated dependencies [03c085c]
- Updated dependencies [dc38250]
  - @memberjunction/generic-database-provider@6.2.0-edge.5
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/ai-prompts@6.2.0-edge.5
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/ai-core-plus@6.2.0-edge.5
  - @memberjunction/actions-base@6.2.0-edge.5
  - @memberjunction/actions@6.2.0-edge.5
  - @memberjunction/ai-engine-base@6.2.0-edge.5
  - @memberjunction/aiengine@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/storage@6.2.0-edge.5
  - @memberjunction/search-engine@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/ai-reranker@6.2.0-edge.5
  - @memberjunction/templates@6.2.0-edge.5
  - @memberjunction/ai-vector-sync@6.2.0-edge.5
  - @memberjunction/ai-vector-dupe@6.2.0-edge.5
  - @memberjunction/rubrics@6.2.0-edge.5
  - @memberjunction/context-crush@6.2.0-edge.5

## 6.2.0-edge.4

### Minor Changes

- 1d6e3e8: The avatar video price can be per token (#5312). `Realtime.Pricing.AvatarVideoOutput.Unit` accepts `'Per 1M Tokens'` beside `'Per Minute'`, in Core's configuration types, the AI configuration JSON type and the generated entity types. At that unit, pricing puts the run's output video tokens (`RealtimeUsage.Output.VideoTokens`) on the video cost line, measured in tokens; the tokens still leave the cost row's output bucket. A run that stored video seconds but no video tokens is priced as before, with one log line. A per-minute price prices the stored seconds exactly as before. The stored output video tokens are now capped like the seconds: at 6,192 tokens a second of the run's elapsed time plus 30 seconds, with a log line when the cap applies. Gemini 3.8 Live's Vertex AI row is seeded at $1.00 per 1M tokens: Google bills avatar video only while the avatar speaks, and the stored seconds also count the idle avatar between answers.
- 7384dd6: Conversation forks: a conversation is Main (the messages with no branch) plus forks (`MJ: Conversation Branches`). A fork starts at a message and shows as a chip under it (kind icon, up to three avatars, message count, name, last activity); it opens as a full view where the inherited history sits faded behind a dashed rail, up to a fork marker, and the fork's own messages behind a solid rail. "Fork from here" on one of your own messages opens a new fork that replaces that message at once (it starts from the message before it, the composer starts with the message's text, the fork is created on the first send and named from that message, and leaving without sending creates nothing), Edit ("Save as fork"; the original message stays) and Regenerate (the first answer stays) each start a fork. A Forks button lists every fork, nested under its parent, with All and Mine filters. Everyone who can see a conversation sees its forks and who started each one. What a person is looking at is per person and in memory; nothing about the view is stored on the conversation, and changing the view ends an active voice session.
  - New entity `MJ: Conversation Branches` with `Kind` (Fork, Edit, Regenerate; default Fork), `SourceDetailID` and `UserID`; new columns `ConversationDetail.BranchID` and `ConversationDetail.ReplacedAt` (migration, so `minor`).
  - New authorization `Conversations: Fork`, granted to the UI role. The server refuses to create a fork for a person without it; deny it to a role to turn forking off for that role's members. Each person can also switch forking off in My Profile ("Fork when I edit or regenerate"; user setting `mj.conversations.forking.v1`).
  - When forking is off for a person, Edit and Regenerate change the latest turn in place: Regenerate (latest answer) and "Save and resend" (latest user message) hide the current answer and run the agent again; earlier user messages can still be edited ("Save", shown as edited). A replaced answer keeps its row (`ReplacedAt` and `HiddenToUser` set) and is left out of the chat, export, pins, the mobile transcript, rubric subjects, the returning-visitor recap and every agent context read (`ConversationEngine.LiveRowsFilter` and `IsReplacedRow`). A turn a fork depends on is not changed in place.
  - Every writer sets `BranchID` itself (null is Main): the composer and its agent turns, `AgentRunner`, the task-graph deliverer, an agent request resumed from the Agent Requests dashboard or API (the fork of the message that started the run) and realtime transcripts (a voice session's fork is fixed when it starts). The server no longer stamps it and refuses a `BranchID` that names a fork of another conversation.
  - A fork that still has its own messages or child forks cannot be deleted on its own (its messages would move into Main); deleting the conversation deletes its forks and messages.
  - `ConversationEngine` gains `CreateFork`, `ForkPointFrom`, `EditForkPoint`, `RegenerateForkPoint`, `SourceRowsFilter`, `BuildForkSummaries`, `LoadForkSummaries`, `ForkDisplayName`, `LiveRowsFilter` and `IsReplacedRow`.
  - **Removed public Angular API** (the ParentID-based thread panel; a host app that binds any of these must drop the binding): `ConversationChatAreaComponent`'s `ThreadId` input and `ThreadOpened`/`ThreadClosed` outputs; the `ThreadPanelComponent` export; `ConversationWorkspaceComponent`'s `OpenThread`, `CloseThread` and `SelectedThreadId`; `ChatConversationsResource`'s `SelectedThreadId`, `OnThreadOpened` and `OnThreadClosed`; `MessageListComponent`'s `ReplyInThread` and `ViewThread` outputs. Their deprecated camelCase aliases (`threadId`, `threadOpened`, `threadClosed`, `openThread`, `closeThread`, `selectedThreadId`, `onThreadOpened`, `onThreadClosed`, `replyInThread`, `viewThread`) are removed with them.

  Message-anchored scope: every reader of one conversation reads one path through `ConversationScope` (`LoadScope`, `TrunkScope`, `ScopeFilter`, `ScopeSubquery`, `IsInScope`, `FilterToScope`, `ArtifactVersionScopeFilter`): the open view in the chat (window, pins, artifacts, agent polling, export, voice start), and Main for the mobile app, the realtime widget, meeting transcripts, the conversation overview, rubric subjects and the returning-visitor recap. Artifact history is path-aware: the viewer takes a `Scope` input and lists only the versions a message on the path links (any direction) or that no message links, labels a gap as `v4 · from v2`, and falls back to the newest visible version with a notice. Search results carry the fork of each hit; opening one opens that fork, or Main. Skip requests carry `conversationBranchID` from the reply's fork, so Skip Brain keeps one mirror record per path.

- 975948b: Realtime Channels v2, third phase: verb-level exposure policy, an Angular adapter that wraps an existing component as a channel, an opt-in DOM rasterizer, a sample game channel, and the channels guide. Existing channels, tool names and hosts are unchanged.

  `minor` because this branch edits `metadata/` earlier (see the first two phases) and adds two new packages. There is no migration and no new entity column.
  - **Verb results obey exposure** (`@memberjunction/ai-core-plus`, `@memberjunction/realtime-runtime`, `@memberjunction/ng-conversations`). A verb whose result carries what the channel holds declares `ReturnsChannelData: 'state' | 'pixels'` on its descriptor entry. When the channel's effective exposure is below that level the dispatcher, and the native-tool route for a channel mounted at start, refuse the whole call with `exposure_restricted` (policy, not redaction: the verb is refused whole and its result is never filtered); the check comes after `InvokableBy` and before parameter validation, so a malformed call cannot probe a withheld verb. The catalog note and the `exposure_changed` note list the verbs that are unavailable and why. New pure helpers `IsVerbWithheld`, `WithheldVerbs` and `DescribeWithheldVerb`; `BuildToolBackedVerbs` accepts a per-verb flag map. Remote Browser flags `GetPageText` and `AchieveGoal` (`'state'`) and `DescribePage` and `LocateElement` (`'pixels'`); the Interactive Component channel flags `GetDataState`, `Validate`, `IsDirty` and custom methods with a non-void return type (merged verb offers are withheld only when every offer is flagged). This replaces the earlier statement that exposure is not a redaction layer over verb results.
  - **`AngularComponentChannel<TComponent>`** (new package `@memberjunction/ng-realtime-channels`). Wraps an existing Angular component as a channel surface without rewriting it: a descriptor plus `ReadSurfaceState`, `ApplySurfaceVerb` and `SurfaceEvents`, and optional `OnSurfaceOpen`, `SurfaceCompletion`, `OnSurfaceBound` and `SurfaceElement`. It owns binding and unbinding, change-driven perception (an event emitted while the agent's verb runs is attributed to the agent), verb resolution, validation and serialization, completion, state of record, and pictures. A verb that arrives before the surface exists waits, bounded (5 s), for the real component and otherwise fails with `surface_unavailable`; it neither runs against a hidden instance nor is acknowledged and applied later.
  - **Opt-in DOM rasterizer** (`@memberjunction/ng-realtime-channels`). `EnableChannelFrameCapture()` registers a bounded `html-to-image` based capturer (3000 nodes, 4 s, one capture at a time, 1024 px longest edge, no web fonts) that fails soft and turns itself off after repeated or unrecoverable failures, logging one reason. Core ships none by default; Explorer opts in (`@memberjunction/ng-explorer-app`), and the Interactive Component channel sources pictures only while the user allows pixels and a video track is up. `InteractiveComponentFrameCapture` is now `ChannelFrameCapture` in the new package, and `html-to-image` moved with it.
  - **Sample channel** (new package `@memberjunction/ng-realtime-channel-examples`). A tic-tac-toe channel built only through the adapter, not a dependency of anything and loaded only when a host imports it, with tests that play whole games (user win, agent win, draw) against the real component with interleaved user clicks and agent verbs, plus collapse and re-expand, resume, exposure and pictures.
  - **Guide.** `guides/REALTIME_CHANNELS_GUIDE.md` (indexed in `guides/README.md`): the contract, writing a channel from scratch, wrapping a component, scoping, opening on demand, visual perception, the Interactive Component channel, publishing from an Open App, and testing.
  - **Per-verb timeout in the adapter** (`@memberjunction/ng-realtime-channels`). `AngularComponentChannel.VerbTimeoutMs` (15 s, overridable) bounds `ApplySurfaceVerb`. On timeout the call fails with `verb_timeout` and a message the agent can act on, the serialized queue is released and the timeout is logged once with the channel and verb. A late result is never delivered, a late failure is logged, and a late success is recorded as a change so the next perception note shows the real state; nothing is rolled back.
  - **Generic `ClientOnlyChannelServer`** (`@memberjunction/ai-agents`, loaded by `@memberjunction/server`). `MJ: AI Agent Channels.ServerPluginClass` is required, so a channel that runs entirely in the browser sets it to `ClientOnlyChannelServer` instead of writing an empty plugin. It takes its channel name from the registry row, contributes no server tools and does not rewrite saves. `InteractiveComponentChannelServer` and `IdentityVerificationChannelServer` are now thin subclasses of it that keep their existing registry keys and behavior.

- 22c9074: Realtime Channels v2, second phase: an Interactive Component channel, several video sources with one arbiter, and exposure policy. Existing channels, tool names and hosts are unchanged.

  `minor` because the branch edits `metadata/` (a new `MJ: AI Agent Channels` row, and `Privacy.ZeroDataRetention` and `RequireZeroDataRetentionFor` in the `IAIConfiguration` / `IAgentSettings` JSON types). There is no migration and no new entity column.
  - **Interactive Component channel** (`@memberjunction/ng-conversations`, `@memberjunction/ai-agents`, `@memberjunction/ng-react`). Shows any component artifact next to the call and lets the agent operate it. Multi-instance, opt-in, on-demand. Its contract is derived from the component's spec: custom methods and the standard methods it supports become verbs with parameter schemas, `getCurrentDataState` becomes the instance's data, spec events become channel events, spec properties become the schema of the opening inputs. Built-ins: `open`, `show_version` (swaps an open instance to another version of its own artifact in place, keeping its id), `close`. Artifacts load through the signed-in user's own access. Delegated component artifacts can open automatically (`channels.config.InteractiveComponent.autoOpenDelegatedComponents`, off by default), and a newer version of an open component replaces it in place. `MJReactComponent` gains a public `Refresh()`. New `InteractiveComponentChannelServer` and a `MJ: AI Agent Channels` row.
  - **Multi-instance and delegated-artifact hooks** (`@memberjunction/realtime-runtime`). `OnOpen` can name the instance it created; `Complete` and `EmitChannelEvent` take an optional instance. A channel can ask to be offered the artifacts of a delegated run (`AcceptsDelegationArtifacts` / `OnDelegationArtifacts`); the runtime mounts it if needed and reveals its tab.
  - **Several video sources** (`@memberjunction/ai`, `@memberjunction/ai-gemini`, `@memberjunction/ai-realtime-client`). Tracks carry a `SourceID` and `Label`; model profiles declare `MaxInboundVideoStreams` (1 for Gemini 3.8 Live and Extended Thinking, 0 without video input) and negotiation caps the streams to it. `SendVideoFrame(data, mime, sourceId?)`. `VideoSourceArbiter` is the single writer of inbound video: it passes every enabled source through on a multi-stream model; on a one-stream model it picks by a policy that is data (user pick, most recent capture, focused surface, newest), tells the model `[The agent is now viewing: <label>]` on every switch, and paces to the negotiated rate. The channel video bridge now registers with the arbiter; its exports are unchanged.
  - **"Agent can see" and exposure policy** (`@memberjunction/ai-core-plus`, `@memberjunction/ai-agents`, `@memberjunction/realtime-runtime`, `@memberjunction/ng-conversations`). The realtime overlay shows which sources the agent can see, with a switch per source, remembered per user per channel. A channel's exposure is the lowest of its own ceiling, the agent's `channels.config.<Key>.maxExposure`, a zero-data-retention requirement and the user's choice; the server decides all but the last and returns it in the session policy. `requireZeroDataRetentionFor: ['state' | 'pixels']` lowers exposure when the session model's configuration does not declare `Privacy.ZeroDataRetention: true`, and the agent is told why. Exposure gates what is volunteered to the model (state notes and frames), and, for a verb that declares `ReturnsChannelData`, what the agent may ask for (the verb is refused whole below its level; see the third phase).
  - **Session tuning.** `realtime.session.unverifiedMaxSeconds` and `verifiedMaxSeconds` (positive integers) pass through the configuration cascade; `channels.config.<Key>` reaches a channel intact.

- 88b85fc: Realtime Channels v2, first phase: a self-describing channel contract, per-agent/app/host channel scoping, a validated `ContextTool` proxy, and a lifted visual-perception pump. Existing channels, tool names and hosts are unchanged.

  `minor` because the branch edits `metadata/entities/JSONType-interfaces/IAgentSettings.ts` (the new `Realtime.Channels` block); there is no migration, and no new entity column.
  - **Channel descriptors** (`@memberjunction/ai-core-plus`, `@memberjunction/realtime-runtime`). `RealtimeChannelDescriptor` (nouns, verbs with parameter schemas and `InvokableBy`, events, inputs/output, display policy, default availability, exposure ceiling) and the new `BaseRealtimeChannelClient` members `GetDescriptor`, `GetState`, `ApplyVerb`, `Events$`, `Output$`, `Open`, `Complete`, `InstanceId`. A channel that implements only the original members is synthesized a descriptor, so nothing changes for it. The Whiteboard, Remote Browser, Media and Client Context channels ship authored descriptors; their native tool names are unchanged. Perception notes are structured and debounced (`[channel:<Key>#<instance>] state_changed {…}`, a snapshot first and then deltas).
  - **Channel scoping.** Code default, then agent (`realtime.channels` in the configuration cascade), then app (`Application.AgentSettings.Realtime.Channels`), then host-declared channels (`StartRealtimeSession(…, { HostChannels })`, which work on connect-only providers with no registry rows). `IsActive = false` on a registry row remains a master kill switch. At mint the browser reports its candidates (`channelCandidatesJson`) and the server returns the resolved policy (`ClientPolicyJson`), narrows the declared tools to match, persists the in-scope channel keys on the session, and drops the excluded channels' server plugins. A client with no server policy resolves the same scope locally, and a client against an older server falls back to the original mint mutation.
  - **`ContextTool` proxy.** Accepts `target: { channel, instance? }`; a targeted call is validated against the addressed verb's parameter schema and returns a structured, model-recoverable error on failure. `on-demand` channels are opened mid-session with `action: "open"`. A catalog note rendered from the descriptors tells the model which channels exist.
  - **App client tools.** `Application.AgentSettings.ClientTools` is now read by the realtime path and resolved through `ResolveClientTools`. `RegisterAppClientTools(tools, owner?)` is owner-keyed (new `UnregisterAppClientTools` / `ClearAppClientTools`); Explorer registers its globals and the active surface under separate owners and clears the previous app's surface tools on an app switch (previously they lingered). `FormatClientToolsForPrompt` is removed: it never had a caller.
  - **Visual perception.** The Whiteboard's change-driven frame pump now lives in the base channel (`EnableVisualPerception`); frames are tagged with the change id of the state they describe. The Whiteboard's behavior is unchanged.
  - **Session config rewrites no longer drop fields.** `RealtimeClientSessionResolver` rebuilt the persisted session config field by field on the run-id and pending-feedback rewrites, dropping `mediaCollectionID` and `directActions`; it now carries the existing config forward.

- 02bb563: `<mj-realtime-widget>`, the `IdentityVerification` channel, session events in the runtime, and a session-launcher seam.
  - **Session launcher** (`@memberjunction/realtime-runtime`). `IRealtimeSessionLauncher` is the one place a session is minted. `DefaultRealtimeSessionLauncher` is the stock `StartRealtimeClientSession` mutation with the channel candidates and client policy, unchanged, including the fallback for servers that predate channel scoping. Set `RealtimeSessionRuntime.Launcher` to mint through your own endpoint without wrapping the provider in a Proxy; set it to `null` to restore the default.
  - **Session events in the runtime** (`@memberjunction/realtime-runtime`). The runtime subscribes for the life of the session (tolerating a provider with no subscriptions), exposes `SessionEvents$`, and routes events to per-type handlers. `identity.verified` sends the agent a context note (JSON-framed so user-entered text cannot break out), optionally asks it to speak (`IdentityVerifiedSpokenResponse`), and moves the client deadline from the payload; the server stays authoritative and the deadline only ever moves later. On a reconnect it re-subscribes and reads `GetVerificationStatus` once, so a verification that completed while offline is still announced, flagged `Recovered`. Channels receive `SessionEvents$` on their context. Also adds `OpenChannel(key, inputs)`.
  - **`IdentityVerification` channel** (`@memberjunction/ng-conversations`, `@memberjunction/ai-agents`, `@memberjunction/server`). An opt-in v2 channel with nouns name, email and status and verbs `fill` (agent or user), `confirm` (**the user only**, refused for the agent in the channel itself, not just the surface), `submit`, `resend` and `enter_code`. A value the agent fills is marked as a suggestion until the user confirms it. The code is never stored and never reaches the agent. The surface is a small accessible Angular component using only design tokens and `mjButton`. A thin server plugin keeps no PII on the channel row. Ships with its `metadata/ai-agent-channels` row.
  - **`@memberjunction/ng-realtime-widget`** (new package). `<mj-realtime-widget>` as an Angular component and as a one-script custom element (`dist/element/mj-realtime-widget.js`: Angular linker, no `unsafe-eval`, CSP nonce, guarded define). Auth modes `widget-key`, `invite-token`, `token` and a JS-only `launcher`; a consent gate before the microphone; resume and tab-close cleanup; `--mj-*` theming; attributes, properties, methods (`start`, `end`, `openChannel`, `sendContextNote`, `requestSpokenResponse`, `registerChannel`) and bubbling, composed DOM events (`mj-ready`, `mj-session-started`, `mj-session-ended`, `mj-phase-changed`, `mj-verified`, `mj-session-event`, `mj-channel-opened`, `mj-channel-event`, `mj-channel-output`, `mj-error`). It hosts the existing realtime overlay by deep import, so the heavy `ConversationsModule` barrel stays out of the bundle. A static sample page and an embed guide ship in the package.
  - **A small shell and a lazily loaded call** (`@memberjunction/ng-realtime-widget`). The one-script embed is now a classic-script **shell** (about 8 KB gzipped, no Angular) that defines the element, exposes the whole contract and draws the start button, the consent notice and the status screens, plus the **call** (Angular, the realtime overlay, runtime, drivers, built-in channels) as split ES modules fetched relative to the shell's own URL on `start()`, `auto-start`, or a `preload` hint (`none|hover|idle|eager`, default `hover`, a `modulepreload` link that downloads without running). Declining consent downloads nothing. Calls made before the call code loads are specified and tested: `openChannel` and `sendContextNote` queue (notes are capped and never replayed into the next call), `requestSpokenResponse` is never queued, `end()` abandons a pending start. The Interactive Component channel is its own lazily loaded chunk, loaded only when it could be in the session. New attributes: `perception` (`on|off|ask`, default `ask`; pre-sets the person's exposure choice and is reported by a new `mj-perception-changed` event), `frame-capture` (a marked hook for Phase 2's rasterizer), `preload`, `session-url`. The build fails if the shell exceeds its size budget or a heavy dependency leaks into it. The bundle test boots the shell under a no-eval window, calls `start()`, and proves the call chunk loads.
  - **`frame-capture` loads the DOM rasterizer lazily** (`@memberjunction/ng-realtime-widget`). The attribute calls `EnableChannelFrameCapture()` from `@memberjunction/ng-realtime-channels` (now a dependency), as its own chunk (16 KB raw / 6.6 KB gzipped, `html-to-image` included) loaded before the session is minted, so neither the shell nor a call that does not want frames pays for it. If it cannot be loaded the widget warns once and channels stay state-only; a capturer the page registered itself is respected.
  - **Runtime hooks** (`@memberjunction/realtime-runtime`). `ChannelClassLoader` lets a host load channel code on demand (called with the `ClientPluginClass` keys of every channel about to be resolved; a failure is logged, never fatal), and `ExposurePreferences` exposes the current store so a host can layer over it.
  - **Event payload** (`@memberjunction/ai-core-plus`). `IdentityVerifiedEventPayload` gains an optional `Recovered` flag, validated by `IsIdentityVerifiedEventPayload`.

### Patch Changes

- 96d6ec2: A Stop button on an in-progress agent reply now actually stops the run, the stop keeps the work, and the next turn continues from it instead of starting over.
  - **Stop reaches the running agent.** The run's row is the control channel: the chat marks the run `Cancelled` with reason `User Request`, and the agent-run watchdog on the process that owns the run polls for that (every 3 seconds, `cancellationPollIntervalMs`) and aborts the run's own cancellation token. `BaseAgent` already honors that token throughout its loop and forwards it into prompts and actions, so the in-flight step ends and the run finalizes as Cancelled. Because the row is the channel, this works whichever MJAPI replica owns the run. `AgentRunWatchdog.Track` takes the run's `AbortController`; `RequestCancel` and `IsStoppable` cover in-process callers; `AgentRunWatchdog.UserCancelAbortReason` is the reason the agent sees. The watchdog's reads (this poll and the tracked-set prune) go through `RunView` over the entity, with the fields named and the cache bypassed; only its batched writes remain stored-proc calls.
  - **The stopped run records the reason and the payload.** The cancelled result sets `CancellationReason` from the abort reason (`User Request`, `Timeout`, or `System`) rather than overwriting the UI's write with null, and promotes the last completed step's `PayloadAtEnd` to `FinalPayload` so the next turn, chained by `LastRunID`, starts from where the stopped one left off.
  - **The reply reads as stopped, not failed.** `AgentRunner.ResolveFinalDetailState` marks a user-stopped reply `Complete` with "Stopped by user" instead of `Error` with the cancellation text.
  - **The button.** `mj-conversation-message-item` shows a Stop control beside the time pill while the reply is in progress (hidden for read-only viewers, and when the host sets `AllowStopRun` false on the chat area), reads "Stopping…" until the message leaves In-Progress, and offers itself again after 15 s if the stop did not take. It follows the package's Before/After pair: a click fires the cancelable `BeforeStopClicked` (`BeforeStopClickedEventArgs`, with the reply's detail id and the run id when known); if no listener cancels, the request is relayed to the chat area, which stops the run and fires `AfterStopClicked` (`AfterStopClickedEventArgs`, with whether the run's row was marked Cancelled). The list relays it as `StopMessage`; the chat area resolves the run (mapped, or by the reply's detail id) and calls `AgentStateService.CancelAgent`, which now loads the row fresh, refuses a run that already finished, and records the reason. New: `AgentStateService.CancelAgentForDetail`.
  - **The next turn continues the stopped work.** Observed before: a stopped Sage run had five weather lookups and fifteen searches done, and "keep going" redid every one, because the settled-run carry-forward skips a Cancelled run and only ever carried inline Tool steps. Now, when the agent's newest root run in the conversation is one the user stopped, `BaseAgent.injectStoppedRunResults` carries that run's completed Actions and Tool step results into the new run's context with a note to continue rather than restart (`BuildStoppedRunResultsMessage`, same gates and size budget as the settled path), and `RunAIAgentFromConversationDetail` chains the new run to it by `LastRunID`, rolling the stopped run's `FinalPayload` in when the caller supplied no payload. A caller-supplied `lastRunId` still wins, and a run that arrives chained (`lastRunId` set, by the resolver or a client) checks that one row instead of searching the conversation again, so the predecessor is resolved once per turn. Both lookups read the database (`BypassCache`), since the row they look for was written by the Stop button moments before. New type `StoppedRunStepRecord`.
  - **The next turn resumes the stopped run's own stack by default.** `ExecuteAgentParams.stopContinuationMode` (`StopContinuationMode`: `'full_stack'` | `'summary'`, default `BaseAgent.DefaultStopContinuationMode = 'full_stack'`) picks how a user-stopped predecessor carries forward. Full stack: the stopped run's turns come back in the shape the loop wrote them while running. Its last prompt step recorded the run's message stack, its first prompt step recorded where the run started, and the difference is the run's own turns. The last decision and the actions that finished after it are rebuilt with the loop's own builders, now shared as `buildActionInvocationMessage` and `buildActionResultsMessage`. An action the stop cut off is listed as not executed, native tool calls are answered, and runtime-state fragments are left for the new run to add. The turns are spliced in ahead of the stopped run's reply and the user's new message, followed by `BaseAgent.StoppedRunResumeNotice`. The steps load in the pre-execution parallel phase and the splice happens once that phase settles, so it never races the memory and RAG injections. When the stack cannot be resumed, or resuming throws, the run falls back to the summary. `'summary'` keeps the earlier behavior. An empirical A/B across Sage, Query Builder and Research Agent favored the full stack on speed, tokens and cost.
  - **A stopped run is resumed only on its own branch path.** With conversation branching, a run stopped on a sibling branch is not the next turn's history. `MJAIAgentRunEntityExtended.BuildReplyOnBranchPathFilter` is the one predicate for "this run replied on this turn's branch path and no rerun replaced its answer"; `BuildStoppedPredecessorFilter` applies it (so it now takes the branch and the conversation's branch rows), `BaseAgent.BuildPriorTurnRunFilter` is built on it too, and `RunAIAgentFromConversationDetail` loads the branch rows for a reply on a branch before it looks for a stopped predecessor.
  - **The composer's send slot can be a stop control.** `mj-message-input-box` gains `SendSlotMode` (`'send' | 'stop' | 'stopping'`), `StopCount`, `StopLabel`, `StatusText` and `StatusElapsed`, and emits `StopClicked`. In `stop` mode the same button is red with a stop icon and is always live; above a count of one it widens to "Stop all" with the count; `stopping` disables it with a spinner. A status line renders bottom-left inside the box as a polite live region, with the elapsed time in an `aria-hidden` child so its ticking is never announced; the elapsed time is dropped at 768px and the line truncates at 480px. The box decides none of this: `mj-ai-composer` and `mj-conversation-message-input` pass the inputs and the output straight through, and the chat area decides what they mean.
  - **Stop lives in the composer.** While one reply is in flight the chat area makes the composer's send slot the stop control, labelled "Stop {agent}", with a status line "{agent} is working" and the elapsed time beside it; the per-reply pill is hidden (`InFlightCount` on the message item and list gates it to more than one run). With several replies in flight the slot reads "Stop all N runs", the status line counts agents, and each reply keeps its own pill. A click stops every in-flight run through the same path as the pill (`BeforeStopClicked`, then `OnStopMessage`, then `AfterStopClicked`; a vetoed run stays in flight), the slot reads as stopping until the reply leaves In-Progress, and after the retry window a warning toast says "{agent} did not stop. Try again." After a reply the user stopped, the composer placeholder reads "Continue, or tell {agent} what to do differently". New on the chat area: `InFlightCount`, `SendSlotMode`, `StopCount`, `StopLabel`, `StatusText`, `StatusElapsed`, `StoppingDetailIds`, `OnComposerStopClicked`, `FormatElapsed`.
  - **A stopped reply looks stopped, and offers Continue.** The reply's time pill takes a neutral `stopped` state (never the blue `complete`) reading "Stopped · {elapsed}" with a stop icon; a "{n} steps kept" line shows what the run kept; and on the last message of a conversation the viewer may write to, a Continue control sends "Continue where you left off" through the existing `SuggestedResponseSelected` path, which the chat area sends as the next message and the run chain resumes. The stopped reply text from `AgentRunner.ResolveFinalDetailState` drops its emoji ("Stopped by user", "Stopped: {reason}"). New on the message item: `IsStoppedRun`, `WasStoppedByUser`, `StoppedLineText`, `CanContinueStoppedRun`, `OnContinueClick`, static `ContinueMessage`.
  - **The run-state vocabulary lives on the entity.** `MJAIAgentRunEntityExtended` gains `SettledStatuses`, `CancelledStatus`, `UserRequestCancellationReason`, static `IsUserStopped` with instance `WasStoppedByUser`, and static `BuildStoppedPredecessorFilter`, typed from the entity unions; BaseAgent, the watchdog and the run resolver all use them. The abort-signal reasons are statics on the classes that raise them: `AgentRunWatchdog.UserCancelAbortReason` and `ExternalCancelAbortReason`, `BaseAgent.AgentTimeoutAbortReason`.

  Known limit: the previous `CancelAgent` only wrote the row, which the running agent then overwrote on finish. That path is what this replaces.

- a709bb6: Agents no longer fail when several file storage accounts are active and none is configured as the default. The system fallback now picks the most recently updated account (ties broken by ID) and logs a warning once per agent naming the candidates and where to set `DefaultStorageAccountID`. The logic lives in shared engines so any caller gets the same answer: `FileStorageEngineBase.ActiveAccounts` / `ResolveDefaultAccount()` / `ResolveDefaultAccountID()` pick the system default, and `AIEngineBase.ResolveAgentStorageAccountID()` (delegated from `AIEngine`) runs the full agent → category → agent type → system chain. `BaseAgent.getStorageAccountID` now delegates to it.
- 6cd23e1: A call whose agent asked for a live avatar it can't show says so once. Core gains `RealtimeAvatarStatus`, `ClientRealtimeSessionConfig.AvatarStatus`, `BaseRealtimeModel.SupportsAvatarOutput(model)` (default `false`; Gemini answers from its Live profile) and `ParseRealtimeAvatarStatus`, and the browser-side reason `downgraded` becomes `host` and `browser` (the Gemini and Gemini Enterprise browser clients log the new reason). Both Gemini drivers (`GeminiRealtime`, and `GeminiEnterpriseRealtime` in `@memberjunction/ai-vertex`) return their avatar decision on the mint, through the protected `AvatarStatusFor`; `RealtimeClientSessionService.PrepareClientSession` merges it with the persona resolution (`endpoint` first, then `no-binding` / `unknown-avatar`, else the driver's decision), logs one line, and returns `AvatarStatus`, which MJServer sends as `StartRealtimeClientSessionResult.AvatarStatusJson`. The stock launcher asks for the field and drops it alone against a server that predates it. After the call connects, the runtime publishes `AvatarNotice$` (`host` when the app asked for no agent video, `browser` when the track did not go live, else the status's reason), once per call, and clears it when the call ends. `ng-realtime-media` holds the wording (`AvatarNoticeText`, "Audio only: …", per-reason host overrides) and declares `@memberjunction/ai`; the call overlay shows it as a small info `mj-alert` under the banner in both chromes, with a dismiss button, hiding after 10 s, never in review (`AvatarNoticeLabels` overrides the words). Calls whose agent asked for no avatar look as before. Integration check RD13 also checks that a voiced agent without a face on the session's vendor asks for no avatar and reports `no-binding`.
- 51634e7: A picked voice's avatar now shows only when the voiced agent's own video setting is on, so a pick no longer turns on billed avatar video by itself. The runtime override can't turn `realtime.video.enabled` on in `ResolveEffectiveRealtimeConfig` (it can still turn it off), and both override builders (`BuildRealtimeOverridesJson`, `BuildRealtimeConfigOverridesJson`) send the pick as `realtime.video.avatarId` alone. A call that picked an avatar while the setting is off is audio only with the new reason `video-off` (`RealtimeAvatarUnavailableReason`, `ResolveRealtimeAvatar`'s `AvatarPicked`), which stands whatever the model renders; the call and mobile notices say "Audio only: this agent's avatar isn't turned on". An older client reads the reason as unknown and says "Audio only: the avatar can't be shown in this call".
- de2dc2f: Avatar video in realtime usage and cost. The Gemini browser client counts the seconds of avatar video a model turn generated from the fragments' durations (Core's fragmented MP4 reader gains track timescales and `Fmp4VideoSeconds`), until `generationComplete` (an interrupted turn counts what arrived before `interrupted`), and emits them once, as amounts, in `OutputTokenDetails.VideoSeconds`; it also reads Google's response-side token split, VIDEO included (`RealtimeUsageModalityDetail.VideoTokens`). The runtime relays the full input and output detail blocks, and an update that carries only video seconds; `RelayRealtimeUsage` takes them as an optional `usageDetailsJson` argument, and `AccumulatePromptRunUsage` adds them into the co-agent prompt run's `ModelSpecificResponseDetails.RealtimeUsage` record, with the stored video seconds capped at the run's elapsed time plus 30 seconds. At finalize, a run whose model vendor configuration has `Realtime.Pricing.AvatarVideoOutput` (per minute) is priced at its cost row plus a video line, the video's output tokens leave the cost row's output bucket, and the lines are written under `CostLines`; without that price the run prices as before. The agent-run analytics cost card shows the avatar video on its own line and no longer prices the video's tokens as output. Integration check RD16 stores a minute of avatar usage on a co-agent-shaped prompt run for Gemini 3.8 Live on Vertex AI, finalizes it, and checks its cost lines.
- 1da00cb: An agent can now watch a LiveKit meeting. Set `realtime.video.watchMeetings: true` in the voiced agent's `TypeConfiguration`. When its realtime model takes video (Gemini 3.8 Live), the agent's bot joins with the `mj.agentWatches` attribute, so the room offers each person the choice, and reads the camera or shared screen of the people who allow it: one source at a time, at the model's frame rate, as JPEG (cameras scaled to 640 px on the longer side, screens to 1280 px). When a source whose frames reached the model ends (the person withdraws, leaves, stops sharing or turns the camera off), the model is told "[The agent can no longer see: Ada's camera]". In every meeting the bot now unsubscribes from video it does not read. The frame-rate and scaling math moves to `@memberjunction/ai` (`RealtimeVideoFrameIntervalMs`, `ScaleRealtimeVideoFrame`, `InboundVideoRateOf`), and the Gemini driver declares its video rate from the model's profile.
- bd0ee83: A bridged realtime session's `Close()` now resolves only once its co-agent runs are finalized, also when a dropped connection started the finalize (#5394).

  A bridged session finalizes its runs once: from the `Close()` that `WireBridgeRealtimeSession` wraps, or from the driver's `OnClose` when the connection drops. The finalizer returned at once on a second call, so a `Close()` after a drop could resolve while the runs were still being written and priced. Every call now returns the first call's promise, and the first call's `success` still stands.

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

- 0a7c255: Duplicate detection no longer accumulates the whole run in memory, so whole-entity runs can finish.

  `GetDuplicateRecords` batches its work 500 records at a time, but accumulated its **results** for
  the entire run — O(records), not O(batch). On a 61,671-record entity that alone exhausted an 8 GB
  heap and the process died mid-run, so whole-entity detection could not complete at all. Three
  consecutive attempts on one tenant each ended in `FATAL ERROR: Reached heap limit`, while a full
  re-embed over the same records succeeded every time — the cost was in the detection path, not the
  vectorization.

  Retaining every result was never load-bearing: `processBatch` already persists each one as
  `Duplicate Run Detail` / `Duplicate Run Detail Match` rows as it goes, so the array was a second
  copy of durable data, kept only to feed the post-pass auto-merge and a single `.length` read.

  Retention is now capped at 1,000 results. Auto-merge carries only candidates that can actually
  merge — a small fraction by definition, since they must clear the absolute threshold — and still
  runs **once, after the full pass**, so detection continues to see the pre-merge dataset exactly as
  before.

  `PotentialDuplicateResponse` gains two optional fields: `TotalRecordsWithDuplicates` (never capped,
  correct at any scale) and `ResultsTruncated`. Small runs are unaffected — under the cap the
  response is identical to before.

- aaf74ca: A realtime agent start that fails now records the failure on the agent's co-agent run, and a LiveKit room start that can't give the user a token starts nothing.
  - The co-agent run of an agent whose start failed read `Completed`: closing its model session finalized the run as a success, whatever the reason for the close. The LiveKit room coordinator and the phone-call starter now finalize the run as `Failed` first, with the start's error as the `ErrorMessage` of the run, its prompt run and its step; the close then finalizes nothing more.
  - `BridgeRealtimeRuntime.Finalize` and `RealtimeClientSessionService.FinalizeCoAgentRun` take an optional error message for a failed finalize.
  - `LiveKitAgentRoomCoordinator.SetFailedStartRecorder` binds how a failed start is recorded; MJServer binds it to the session runtime's `Finalize(false, error)`. Unbound, a failed start's run reads `Completed`, as before.
  - `StartLiveKitAgentRoomSession` mints the user's client token before it starts the agent. Minted after the agent joined, a token that couldn't be minted failed the start with the agent left in the room, its agent session `Active`, and no bridge id for the UI to stop it by.

- 4c682c1: Browser Gemini Live sessions now continue past Gemini's ~10-minute connection limit and survive a dropped connection. The server driver requests session resumption, and the browser driver moves to a new connection with Google's resumption handle when Google announces the connection is ending (at the next resumable point) or when the socket drops (retrying with back-off). Events from a replaced socket are ignored, so its close no longer ends the session. The timing logic is a new Core helper, `RealtimeSessionResumption`. Sessions on a model declared zero-data-retention (`RealtimeSessionParams.ZeroDataRetention`, set from `Privacy.ZeroDataRetention`) never get resumption, because Google stores resumable session state.
- 08a4cfc: The meeting bot publishes an agent's avatar. Before an agent's meeting session opens, the room coordinator asks the native room module whether the bot can publish one (`describeAvatarVideo`: `@livekit/rtc-node` with video publishing, and ffmpeg 4.2 or later with the H.264 and AAC decoders, from `MJ_FFMPEG_PATH` or the `PATH`, probed once per thread); only then does the session ask for it (`RealtimeAvatarSettings.Delivery: 'room'`, threaded through the bridged session prep), and the Gemini driver grants it on an endpoint that renders avatars (VIDEO, the avatar at 2 Mbps), with the decision on `IRealtimeSession.AvatarStatus`. A granted bridged Gemini session sends the avatar's fragmented MP4 as typed frames through `IRealtimeSession.OnVideoFrame`, plays PCM only before a turn's first video, drops media from `interrupted` to that turn's `turnComplete`, and reports the avatar video it generated as `OutputTokenDetails.VideoSeconds` deltas through `OnUsage` (counted up to `generationComplete`). The engine sends the pieces on `video-out` with their MIME type; in a full-duplex multi-agent room each piece passes the floor gate by its audio's duration (`FullDuplexTurnGate.OnOutputDuration`). The LiveKit bridge routes `video/mp4` frames to the room client (`publishAvatarMedia`), which reads them with Core's fMP4 reader (`ReadFmp4Fragment`, `AvccToAnnexB`, `AdtsHeader`, and `Fmp4AudioSeconds` beside AV9's `Fmp4VideoSeconds`; `ReadFmp4Init` also reads a track's size, the trex sample size and flags, the H.264 parameter sets and the AAC config), decodes them in two long-lived ffmpeg child processes, queues the voice on the bot's audio track and shows each frame on a camera track (`agent-avatar`, LiveKit's default simulcast, published at the first frame) when the voice's playout reaches the frame's timestamp. A barge-in drops the queued frames and fences both decoders; the last frame stays on screen. A decoder that dies is restarted; three failures of one decoder within 60 s, or a refused camera track, take the avatar down: the track is unpublished, the bot sets `mj.agentAvatar` to `audio-only:<reason>` (agent bot tokens now carry `canUpdateOwnMetadata`), and the engine replaces the model session with an audio-only one (`StartBridgeSessionParams.RecoverRealtimeSessionWithoutAvatar`). The bot's join token carries `mj.agentAvatar` (`on`, or `audio-only:<reason>` with `decoder-missing` when the host has no usable ffmpeg); Core adds the attribute helpers and the reasons `decoder-missing`, `decoder-failed` and `publish-failed`, which `ParseRealtimeAvatarStatus` reads and `REALTIME_AVATAR_UNAVAILABLE_REASONS` lists (from the same table); the call and mobile notices word them "Audio only for {Agent}: the avatar couldn't be shown in this meeting". `GeminiEnterpriseRealtime` renders a bridged session's avatar the same way. With the media worker on, the pieces are transferred to the worker, a restarted worker gets the stream's init again, and one restarted after a take-down joins audio only. Integration check RD17 (the LiveKit provider allows video out, and the native module answers the avatar probe). The MJAPI image can install a pinned LGPL static ffmpeg (BtbN) checked against its sha256; it is off by default (`INSTALL_FFMPEG=false`, so meetings stay audio only): fill in the pin values and build with `--build-arg INSTALL_FFMPEG=true` to turn it on.
- 35d3c95: A realtime session now asks for a live avatar when the voiced agent's video setting is on (`realtime.video.enabled`) and a face resolves: `realtime.video.avatarId` when it names a Video persona binding the model supports on the vendor, else the voiced agent's persona (its default first), else the co-agent's. The model's own first persona is never used, so an agent with no persona gets no face. The avatar persona's voice on the same vendor becomes the session's voice, unless a voice was picked in this call. The session params carry the request (`Avatar`), and the mint log names the avatar or the reason there is none. Whether the session can render it is the driver's call; on the Gemini Developer API it stays audio. New: `ResolveRealtimeAvatar`.
- dbc3462: The realtime picker marks the voices that come with an avatar. `GetRealtimeModelVoices` lists one voice per persona, keyed by `PersonaID`, so two personas that share a voice (a voice, and the same voice with a face) both list. A persona voice also carries the `APIName` of the same persona's preset Video binding on the model's vendor (`AvatarID`) and the persona's `PreviewImageURL`; a binding on another vendor or a custom avatar doesn't count, and a voice only the driver declares carries none of the three. A driver voice is now left out only when a persona offers the same voice without a face, so a voice stays pickable without its face. The GraphQL voice option (`RealtimeVoiceOptionResult`) and the client's `RealtimeVoiceOption` carry the three as nullable fields, and the client selects them. For holders of `Realtime: Advanced Session Controls`, the picker's voice list is now an `mj-dropdown` with one option per persona: a camera icon on voices with an avatar, the persona's preview image when it has one, and a hint under the list ("Comes with an avatar") when the picked voice has a face. A pick sends the voice id, plus the avatar (`RealtimeAgentPick.PreferredAvatarId`) when the persona has a face; the override envelope from both builders (`BuildRealtimeConfigOverridesJson`, `BuildRealtimeOverridesJson`) carries it as `realtime.video.avatarId`. The session asks for that face only when the voiced agent's own video setting is on and it names a Video binding on the vendor it resolves. The meeting room's voice lists (the add-agent list in `mj-livekit-agent-room` and the pre-join list on the Meet page) also key their options by persona, so two personas sharing a voice no longer collide and only the picked one shows picked; either still sends the voice id (`AddVoiceOption`, `SelectedVoiceOption`).
- 0d0ba18: An app that shows no agent video now tells the mint, and the mint asks the model for no avatar. Every browser session counted as one that could show an avatar, so a video-enabled agent's call from the embeddable widget or the mobile app, which have no channel that shows the agent's video, was steered to a model that renders avatars and minted with the avatar asked for; the browser then dropped it at connect (`host`). `StartRealtimeClientSession` takes `showsAgentVideo`: with `false` the session prep (`PrepareClientSessionInput.ShowsAgentVideo`) asks the driver for no avatar, keeps the avatar persona's voice, prefers no avatar model in the default model walk, and returns `AvatarStatusJson` with the existing reason `host` ("Audio only: this app can't show the avatar"); absent or `true` behaves as before. The argument only ever turns video off. The realtime runtime works it out from the session's channels before the mint: when no channel that could be in the session shows the agent's video (an Avatar channel switched off in the registry counts as none), the launch request carries `ShowsAgentVideo: false` (`RealtimeSessionLaunchRequest.ShowsAgentVideo`) and the stock launcher sends `showsAgentVideo: false`; a host whose Avatar channel can show it sends nothing new. The embeddable support widget's guest mint always sends it. Against a server that predates the argument, both mint without it, once, and remember (the launcher's fallback pattern). Integration check RD13 also checks that an app without agent video asks for no avatar and keeps the persona's voice.
- b6fcb30: A meeting now says why an agent's avatar isn't shown when the model's driver renders no avatar. When the voiced agent's persona has a face (a Video binding) on a vendor whose realtime driver renders none, the session prep asks that driver for the avatar, and every driver except Gemini's ignores the request and reports no `AvatarStatus`. A bridged session then had no status, the LiveKit room's bot joined without `mj.agentAvatar`, and the room showed no notice, where a browser call in the same case says `endpoint`. `WireBridgeRealtimeSession` (`ResolveBridgedAvatarStatus`) now gives a session whose driver was asked for an avatar and reported nothing a status: `bridged` when the host publishes no avatar into a room (the room then names its own reason, such as `decoder-missing`), else `endpoint` when the model shows no avatar (`RealtimeModelShowsAvatar`: its Video/Output row and the driver's `SupportsAvatarOutput`). The bot joins with `mj.agentAvatar` `audio-only:endpoint`, and the room shows its existing notice, "Audio only for {Agent}: this voice model can't show an avatar". A status the driver reported (a grant, or one of the Gemini driver's reasons) is unchanged, and a driver whose model shows avatars and reports nothing still gets no status. Core's documentation of `IRealtimeSession.AvatarStatus` and `BaseRealtimeModel.SupportsAvatarOutput` says so.
- f73e192: A meeting now says why an agent's avatar isn't shown when the session prep decided it. A server-side (bridged) session reported only the prep's `phone` reason: when the prep asked the driver for no avatar because the voiced agent's persona has no face for the model's vendor (`no-binding`), the agent names an avatar the vendor doesn't have (`unknown-avatar`), or the model's Video/Output row turns video off (`endpoint`), the driver reported nothing, so the LiveKit room's bot joined without `mj.agentAvatar` and the room showed the agent's voice with no notice. `WireBridgeRealtimeSession` now gives such a session the status its prep decided: `phone` first; then `bridged` when the host publishes no avatar into a room, which is what the driver says when asked there (the room names its own reason, such as `decoder-missing`); then `endpoint` when the model shows no avatar, as a browser call says; else the prep's reason. The bot joins with `mj.agentAvatar` `audio-only:<reason>` and the room shows its existing notice, such as "Audio only for {Agent}: this agent has no avatar for this voice model". A session whose prep asked the driver for an avatar keeps the driver's status, so a granted avatar is unchanged. Core's `IRealtimeSession.AvatarStatus` documentation names the reasons the prep reports.
- 7177e09: A realtime model shows an agent's avatar only when its `MJ: AI Model Modalities` Video/Output row allows video and the endpoint profile of its driver renders avatars. A row with `IsSupported` false turns video off: the session prep asks the driver for no avatar, logs one line, and the call's status says `endpoint` ("this voice model can't show an avatar"); a model with no row is left to its driver's profile, as before. The rows are read from the AI engine's cache (`ReadRealtimeVideoOutputRow`, `RealtimeModelShowsAvatar`). A co-agent with video on, when no model is named (no runtime pick and no `realtime.modelPreference`), takes the first candidate that shows an avatar, trying each model's keyed vendor rows by Priority (`RealtimeClientSessionService.ResolveAvatarRealtimeModel`, `ListRealtimeVendorsForModel`); when none does, it keeps the model it would have taken, audio only, with one log line. A server-side session (`PrepareClientSessionInput.ServerSide`, set by `BaseAgent`'s bridge prep) gets the preference only when its host publishes the avatar into a room (`AvatarDelivery: 'room'`). Integration check RD18 drives the gate through real metadata: Gemini 3.8 Live on Vertex AI asks for the avatar, a tagged model on the same endpoint whose row has `IsSupported` false asks for none, and without that row it asks again.
- 8704df6: A phone call never asks the model for an avatar. A caller hears the agent and sees no video, but a voiced agent whose persona has a face still asked for its avatar on a phone call: on a carrier call (Twilio, Vonage, RingCentral) the Gemini driver refused it as `bridged` and logged that on every call, and on a call that reached a LiveKit room through SIP the room coordinator asked for room delivery whenever its host could publish, so the model rendered avatar video, billed per minute, that the caller never saw. The session prep now decides before the driver: a session marked as a phone call (`PrepareClientSessionInput.PhoneCall`, set from `params.data.realtimePhoneCall`, which `CreateBridgeRealtimeSession` sets from `BridgeRealtimeSessionContext.PhoneCall`) carries no avatar request, keeps the avatar persona's voice so the agent sounds the same as in a call that shows its face, and the default model walk prefers no avatar model for it. The telephony call starter marks every carrier call as a phone call; the room call starter passes its channel to the coordinator (`AgentRoomHostOptions.Channel`), which on `'phone'` skips the native module's avatar probe, passes no room delivery, and marks the session (`RealtimeSessionStartContext.PhoneCall`). Core gains the reason `'phone'` (`RealtimeAvatarUnavailableReason`, read by `ParseRealtimeAvatarStatus` and the bot attribute reader); a phone call's bridged session reports `{ Requested: true, Granted: false, Reason: 'phone' }` as its `AvatarStatus`, so a SIP call's bot joins with `mj.agentAvatar` `audio-only:phone`, and the notice reads "Audio only for {Agent}: the avatar isn't shown on phone calls" (`ng-realtime-media` and the mobile app's copy). The `bridged` reason now covers only a server-side session whose host can't publish video into a room. Integration check RD13 also checks that a phone call in a room that could publish the avatar asks for none and keeps the persona's voice.
- 45359c6: Fixed two bugs in the co-agent run that every voice session records. Both were found on a production call that ran 17 minutes on Gemini Live: the session showed $0.03, and its co-agent run was marked Failed.
  - **Its cost was never recorded.** The realtime model's usage builds up on the co-agent's prompt run, which prices itself, but the co-agent's agent run kept `TotalCost` and `Total*TokensUsed` at 0. Anything that adds up agent runs left the voice model out. The realtime analytics dashboard showed only the delegated runs: $0.03 for a call whose model cost $0.81.
    - `FinalizeCoAgentRun` now copies the prompt run's tokens and cost onto the co-agent run, as an agent loop does from its prompt runs.
    - The copy happens whatever the run's status, so a run that was already ended still gets its cost.
  - **The run watchdog force-failed long calls.** Because no agent loop owns the co-agent run, nothing stamped its liveness heartbeat. The watchdog failed every call that ran past about 5 minutes ("no liveness heartbeat … owning process presumed dead") while the call carried on.
    - The run is now registered with `AgentRunWatchdog` when it is created.
    - It is registered again on each persisted session heartbeat (`SessionManager`, via the new `RealtimeClientSessionService.KeepCoAgentRunAlive`), so whichever server instance the session talks to keeps it fresh.
    - It is unregistered once the run is finalized.

- aee2d53: Full-duplex realtime models improvements, speech-tuned Meet room options, audio telemetry, and disconnect reason handling:
  - **FullDuplex metadata**: Added `FullDuplex?: boolean` to Realtime section of `IAIModelConfiguration` with cascaded metadata resolution and helper `ResolveIsModelFullDuplex`. Seeded metadata for full-duplex models (Gemini 3.8 Live family, GPT-Live 1).
  - **Coordinator turn-taking tools & ResolveHostTools seam**: Withhold turn-taking tools (`turnTakingTools = []`) when model is full-duplex. Added `ResolveHostTools` callback seam to `PrepareClientSessionInput` allowing dynamic resolution of host tools based on resolved model/vendor/driver before session startup.
  - **Energy gate bypass**: Bypassed `FullDuplexTurnGate` and `HumanSpeechDetector` for full-duplex models by default unless `MJ_REALTIME_MODERATOR_MODE=on`.
  - **Speech-tuned Meet RoomOptions**: Configured speech defaults (`dtx: false`, `red: true`, `audioPreset: AudioPresets.speech`, `audioCaptureDefaults`) overridable via `RoomOptions` input.
  - **Audio telemetry**: Added inbound inter-frame gap histogram per participant, outbound `queuedDuration` and underrun tracking, event-loop delay p99 (`perf_hooks.monitorEventLoopDelay`) with 30s rolling window, and speech-to-audio latency logging.
  - **LiveKit disconnect reason**: Mapped `null`/`undefined` disconnect reason from `livekit-client` to `'connection-lost'` rather than `'client-initiated'`.
  - **Interaction lifecycle**: Added optional `Status` override on `CloseInteractionParams`.

- 8ed4049: Realtime call recordings: the crash-recovery `seg-*` shards are now actually deleted once the consolidated recording is stored. `DeleteRealtimeRecordingSegments` listed the session folder without a trailing slash, so delimiter-based storage drivers (S3, Google Cloud Storage) returned the folder as a common prefix and no objects, and every shard was left behind with nothing logged.
- 35ed7b5: `IRealtimeSession.SendInput` takes one `RealtimeInputFrame` (`Data`, `Kind`, and optional `MimeType` and `TimestampMs`) instead of `(chunk, kind?)`. A realtime driver outside this repo must change its `SendInput` signature, and a caller passes `{ Data: chunk, Kind: 'audio' }`. The bridge engine passes each inbound frame's type and capture time, and `BridgeMediaFrame` gains an optional `MimeType`. The server Gemini Live driver sends a JPEG or PNG video frame as video instead of as audio, sends audio in the PCM format the frame names, and drops a frame it cannot send, reporting each type once. The other drivers behave as before.
- d0df5a1: A conformance kit for realtime video providers. The new `@memberjunction/ai-realtime-client/testing` subpath exports `RunRealtimeVideoConformance(driverFactory)`, which runs 17 checks (`VC01`-`VC15`, `VF01`-`VF02`) against a provider's client driver and resolves to a result per check (Passed, Failed with the rule, or Skipped with the reason), and `ListRealtimeVideoConformanceChecks(driverFactory)`, which gives a test runner one test per check. The kit needs no test framework. A provider writes a harness (`IRealtimeVideoConformanceHarness`): what its server mints, its client driver with a fake transport and its creation seams wired to the kit's recorders (`RecordingVideoPlayout`, and `RecordingPcmPlayback`, which is also a playback clock), and the model's side of the wire, its video as Core's `RealtimeVideoFrame`s (fragmented MP4, encoded chunks or images; traits `VideoFrameKind`, `TimedVoice`). The checks cover what a session hands the host (an audio-only session no video, a granted avatar once, none when the host doesn't show it or the browser can't play it), where the model's parts go (video to its player in order and typed as sent, never to the voice; an unknown type nowhere, reported once), barge-in, turn ends, a video that carries the voice, a timed voice as the player's clock, generated video seconds, resumes and Disconnect. Fixtures include `ConformanceChunkFrames` and `ConformanceImageFrame`. The package's tests run it against Gemini (Developer, and Enterprise on a relay session), OpenAI, and a synthetic provider built only on the package's public API (fMP4, chunk and image runs). The main entry and `/media` don't export the kit. `BaseRealtimeClient`'s driver obligations gain #12 (the agent's video keeps the voice's rules). In `@memberjunction/ai-agents`, `GetRealtimeModelVoices` marks a persona voice with its avatar (`AvatarID`, which the picker shows as "Comes with an avatar") only when the model shows avatars on that vendor (`RealtimeModelShowsAvatar`: its Video/Output row and its driver's endpoint profile).
- d853bf8: A channel's frames sent through its context's `SendVideoFrame` (`RealtimeChannelContext`, `@memberjunction/realtime-runtime`) now go through the session's `VideoSourceArbiter` as the channel's own source, under the id its frame bridge uses (`<channel key>#<instance>`): they reach the model only while the arbiter picks that source, the model is told when it switches, and nothing is sent while the channel's exposure is below pixels. Before, they went straight to the model. The member is deprecated in favour of `ChannelInboundVideoBridge`; the context's `Client` still writes past the arbiter, as does the runtime's own `SendVideoFrame`, whose TSDoc now says so.

  Deprecated, with nothing reading them: `RealtimeVideoConfig.provider` and `providers` (`@memberjunction/ai-agents`). The model is chosen with `realtime.modelPreference`, or with `realtime.video.enabled` the first model that shows an avatar; an avatar's settings are its persona binding's `VendorSettings.Avatar`. A session whose configuration sets either key logs one line per agent naming them, and `FindDeprecatedRealtimeVideoKeys` reports them as data. The TSDoc of `enabled` and `avatarId` now says what they do: `enabled` asks for an avatar and does not start the camera, and `avatarId` names one of the model's Video persona bindings.

  Also deprecated: `BaseRealtimeModel.SupportsVideo` (`@memberjunction/ai`), which no driver overrides and nothing reads (video is declared by `Capabilities.SupportedInboundTracks` / `SupportedOutboundTracks` and `SupportsAvatarOutput`); `LiveKitAudioMeter` and `LiveKitAudioMeterFrame` (`@memberjunction/livekit-room-core`) in favour of `AudioLevelSmoother`, which gives the same frames with the room's settings (the `AUDIO_METER_*` constants stay); and `CreateCameraCapture` (`@memberjunction/ai-realtime-client`) in favour of `LocalMediaController` and `FrameSampler`.

  Removed, since no release shipped it: `ToScreenShareCaptureOptions` from `@memberjunction/livekit-room-core`.

- a66f4b0: A realtime recording whose end-of-call upload never arrived is now recovered from its crash-recovery shards. The session janitor finds closed sessions with a recording start but no recording file, rebuilds a `recording-recovered-<epoch ms>-<random hex>.wav` (a new name per attempt; missing shards filled with estimated silence), stamps it on the session unless the session already has a recording (re-checked just before the stamp; best effort, not a compare-and-set), and only then deletes the shards. Shards written before this change carry no rate in their name; on storage that keeps no content type (Box) their rate is inferred from shard size. One session's recovery is abandoned after 10 minutes, so a storage call that never answers cannot stop later recoveries.
- f2f6f4b: Search now ranks multi-source results by Reciprocal Rank Fusion end to end, and applies `MinScore` before fusion.
  - **Order:** `SearchFusion.Deduplicate` used to raise each fused score to the max raw `ScoreBreakdown` value and re-sort, which threw away the RRF order (and a reranker's). An exact keyword match, such as a person's full name, ranked below every semantic near-miss. The RRF order is now kept.
  - **`Score`:** the RRF score divided by its maximum (Σ weights of the lanes that returned results / (k + 1), k = 60), in [0, 1]. 1.0 means every such lane ranked it first. It is rank-based, not a confidence. Each provider's raw score stays in `ScoreBreakdown`.
  - **One ranked list per embedding model:** the vector provider used to glue each embedding model's results together unsorted, and RRF now relies on lane order. Each model's results are sorted by its own scores and tagged with a `FusionLane`, and fusion ranks each lane as its own RRF list. Models are merged by rank, never by comparing cosine values on different scales.
  - **Identity:** fusion keys results by `EntityName` + `RecordID` (integer IDs no longer merge across entities) and counts a record once per lane, so `Score` stays within [0, 1].
  - **`MinScore`:** a floor on the semantic (vector) lane's own similarity, applied before fusion and to streamed per-provider results. Keyword, full-text, tag and storage hits have no numeric floor, and the fused `Score` is no longer compared to `MinScore`.
  - **Colocated vector stores (pgvector):** the semantic lane asks for a vector-only search, so the store returns a true similarity (as SQL Server's colocated search already does) instead of its own vector+keyword RRF value. MJ's keyword and full-text lanes do the text matching, so text matches are no longer counted twice, and the semantic floor works on PostgreSQL.
  - **Explorer:** the search page's relevance slider and the search-bar dropdown's relevance filter now judge semantic similarity only (`PassesSemanticFloor`). Filtering on the fused score hid most results when three or more lanes returned hits.
  - **Descriptions:** the `MinScore` parameter of the Search and Scoped Search actions, the `Search.DefaultMinScore` setting, the RAG guide and the agent `filterByScore` tool now describe the new meaning. These are metadata changes, so the changeset is `minor`.

- bc0e36f: Security (C3): the realtime relay no longer takes authority from a session's `Config` JSON, which the session owner can edit through the generic entity API. `ExecuteRealtimeSessionTool` re-checks `CanRun` on the session's target agent for the caller on every call. Direct actions are no longer read from `Config`: the service uses the actions it projected for the session at start, or the target agent's own metadata when it holds no projection for the session. The co-agent, prompt, step and paused run ids in `Config` are used only when they are records of the session at the time of use (new `SessionRunIDVerifier`, which reads the database on every use and keeps no result), on the relay, prompt-run mirror, close, heartbeat and remote-browser goal paths. `BaseAgent` rejects a `lastRunId` that is not a UUID before it reaches a filter.

  Behaviour change: scope-limited callers (anonymous and resource-scoped magic-link sessions, including public web-widget guests) get no direct actions. Their sessions are prepared without direct-action tools (new `PrepareClientSessionInput.ExcludeDirectActions`), and a relayed direct-action call from them is refused before any elevation, so the co-agent delegates through `invoke-target-agent` instead.

- d2ccfef: Vertex AI now takes a Gemini 3.8 Live co-agent session only when the session will show an avatar (the video setting is on and the session can show one), or when it is the only keyed vendor. `RealtimeClientSessionService.resolveVendorAndInstantiate` takes a `showsAvatar` flag, threaded from `resolveModelForSession` through the runtime pick, the configured `modelPreference` and the default walk: when the highest-Priority keyed vendor renders avatars and the session won't show one, another keyed vendor that renders none is taken (the Gemini Developer API), and the other way round. Audio-only calls, phone calls and apps without agent video so stay off Vertex AI's relay cap and activity-only turn coverage when the Google key is set. The agent-run path (`BaseAgent.executeRealtimeSession`) follows the same rule through the shared `ChooseRealtimeVendorForAvatar`: a run shows an avatar when the agent's video setting is on and its host publishes the avatar into a room (`realtimeAvatarDelivery: 'room'`, not a phone call).
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
- Updated dependencies [1a95eaf]
- Updated dependencies [0a7c255]
- Updated dependencies [64b6fa5]
- Updated dependencies [d86bcbc]
- Updated dependencies [ef182be]
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
- Updated dependencies [57096ab]
- Updated dependencies [aac148b]
- Updated dependencies [a7fd6e9]
- Updated dependencies [f2f6f4b]
- Updated dependencies [a28ce42]
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
  - @memberjunction/storage@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/ai-prompts@6.2.0-edge.4
  - @memberjunction/rubrics@6.2.0-edge.4
  - @memberjunction/ai-vector-dupe@6.2.0-edge.4
  - @memberjunction/ai-vector-sync@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/search-engine@6.2.0-edge.4
  - @memberjunction/actions@6.2.0-edge.4
  - @memberjunction/templates@6.2.0-edge.4
  - @memberjunction/ai-reranker@6.2.0-edge.4
  - @memberjunction/actions-base@6.2.0-edge.4
  - @memberjunction/context-crush@6.2.0-edge.4

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

- 29b6ec3: fix: native tool calling — object action params, a one-turn `complete_task` finish, an implicit-mode Loop prompt, and Gemini thought signatures across failover

  Found running Skip's Query Writer on Gemini 3 Flash with native implicit control flow. `Simple Object` action params are declared as `object` and a JSON-string argument is decoded before the Action runs (`Other` stays `string`). A new `complete_task` control tool applies the final payload change and completes in one turn; its `payloadChangeRequest` is a JSON string because the forced final turn is schema-constrained and an open object decodes as `{}`, and the final permitted turn now forces `complete_task` instead of `'none'` (downgraded to `'none'` for hybrid models). The Loop system prompt's implicit mode no longer tells the model to answer in a JSON envelope, and unreadable JSON text is a Retry rather than a final answer that drops its payload. The Gemini driver records where a thought signature was minted and replays it only there, so a failover between Google AI Studio and Vertex AI no longer fails with a 400 "Corrupted thought signature." A model that rejects a forced tool choice gets `'auto'` instead: Claude Opus 5.5 and Sonnet 5.5 through a new catalog flag, `LLM.SupportsForcedToolChoice: false`, and any Claude request using budget thinking in the Anthropic driver. Envelope and hybrid prompts render byte-identically.

- b545842: Rubric evaluators are pluggable. `RubricEngine` creates the evaluator a call names through the class factory (`BaseRubricEvaluator`), so a host can register its own and run it from `EvaluateRecord`, an agent-rubric link's `EvaluatorConfig`, a calibration test, the Evaluate Record Against Rubric action, or `mj rubric evaluate`. Adds a `Decision` evaluator that scores every level-scale criterion as a typed Score question on a Decision-type model (Default Decision: Jev, then LLM Decision) in one call. The LLM evaluator now honors `PromptID`/`PromptName`, `ModelID`, `Mode`, and `Samples`. Self-check, production sampling, and the rubric test oracle honor the link's whole evaluator selection. Evaluations record the evaluator's own type and name, and `AIPromptRunID`/`AIAgentRunID` now point at the run that produced the evaluation instead of the subject. The minor bump is for the updated Evaluate Record Against Rubric action metadata.

  The LLM evaluator's prompts are now metadata. It builds template data and composes three stored prompts into one call: **Rubric Evaluator** (the parent, which owns the JSON reply contract), a **judge** rendered into its `judgePrompt` slot through the prompt runner's child-prompt composition, and **Rubric Criterion**, which renders each criterion (the Decision evaluator asks the same text). The subject is a separate, nonce-delimited user message. `PromptID`/`PromptName` now name the judge; `SystemPromptID`/`Name`, `CriterionPromptID`/`Name`, and `ModelSelection` are new settings. The packaged template copy and `RenderRubricEvaluatorPrompt`, `BuildRubricEvaluatorMessages`, and `FillRubricEvaluatorTemplate` are removed; `BuildCriteriaPromptData`, `PromptData`, `RenderCriteriaText`, and `BuildSubjectMessage` replace them, and `RubricPromptService` gains `RenderCriteria` and `Preview`. Sixteen judge prompts ship, a default and one per core agent (Research Agent and its sub-agents, Sage, Query Builder, Query Strategist, ActionSmith, SkillSmith, Codesmith, Database Designer, Duplicate Resolution, Infographic), every core agent's rubric link names its own, and Sage gains an **Assistant reply** rubric and a Core agent rubrics test. The `llm-judge` oracle runs through the same prompts and accepts a `judgePrompt` config. Agent evaluation tests now propagate the agent link's evaluator configuration to implicit rubric oracles, conversational agent responses fall back to `Message` when `FinalPayload` is empty, and `TraceValidatorOracle` orders step records by `StepNumber` instead of `Sequence`.

- 24ddecc: The Realtime Co-Agent system prompt now tells the agent how to work visually on the shared whiteboard. The guidance applies only when the session has `Whiteboard_*` tools.
  - **Choosing a medium for diagrams.** Simple sketches (about six boxes or fewer, one flow, notes on the user's drawing) use native board items: shapes, connectors, notes and text. Medium and complex diagrams (architecture, sequence, ER and org diagrams, timelines, charts, anything with roughly eight or more nodes or that needs precise layout) go in a single `Whiteboard_AddHtml` widget holding a hand-written inline SVG. That SVG uses a `viewBox` that scales, suits the widget's white background, labels nodes and edges, and is revised in place with `Whiteboard_UpdateContent`.
  - **A creative partner out of the box.** The prompt describes what HTML widgets make possible (clickable mockups, step-through explainers, slider-driven what-if playgrounds, quizzes and drag-to-sort exercises, mind maps and option cards, and charts of real data the target agent fetched) and encourages the agent to offer a visual when one would help. Any made-up figures in a mockup must be labeled as sample data.
  - **Sandbox rules a widget must follow.** Vanilla code only with no network; no `alert`, `confirm`, `prompt`, pop-ups or storage; `MJWhiteboard.submit` for input the agent needs; labeled controls so background interaction notes make sense; and carrying the user's current choices into a revised widget, because `Whiteboard_UpdateContent` resets its state.
  - **Conversation habits.** Narrate while a large widget generates, then walk the user through it, react to submissions without commenting on every click, and never read markup aloud.

  Metadata only (`metadata/prompts/templates/Voice Co-Agent - System Prompt.template.md`), no code change.

### Patch Changes

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

- 4840fff: Phone calls now get the same agent as the browser path, survive a dropped model connection, and can transfer, send DTMF and hang up.
  - **One co-agent resolution for every host.** The MJServer resolver's chain (explicit, the target's `DefaultCoAgentID`, the type default, then the global Realtime Co-Agent) and its `CanRun` filter on delegation agents moved to `ResolveRealtimeCoAgentID` / `FilterAllowedAgentsByCanRun` in `@memberjunction/ai-agents`. Twilio, Vonage and RingCentral use them, and the dialled agent is now the TARGET voiced by the co-agent instead of being used as both.
  - **Caller identity extension point.** `BaseCallerIdentityResolver` (register under `TelephonyCallerIdentity`) lets a host say who an inbound caller is. MJ core knows nothing about contacts; the default treats every caller as anonymous, and the model is told the caller ID is unverified.
  - **Phone-aware agent.** The model is told it is on a phone call and gets `transfer_call`, `send_dtmf` and `end_call` tools, offered per the carrier's `CallTransfer` / `DTMF` features. A transfer destination goes through the same E.164 and allow/block-list policy as an outbound dial. Keypad presses from the caller reach the model as one note per burst.
  - **Transfers go to a configured directory only.** `telephony.transferTargets` (`{ name, number, description? }`) lists where the agent may transfer a call; the tool takes a name, never a number, so an unverified caller cannot get free forwarding to an arbitrary number. Entries are validated against the outbound policy at startup, and with none configured the tool is not offered.
  - **Barge-in follows the browser policy.** Talking over the agent drops queued progress narration but does not cancel delegated work; the new `cancel_pending_work` tool is the explicit cancel.
  - **Transfer and DTMF no longer end the call.** Twilio sends DTMF as in-band tones instead of replacing the TwiML, and a transferred or goodbyed call is handed to the carrier rather than hung up when the media stream stops. Vonage uses its DTMF API; RingCentral detaches without a BYE.
  - **Model-drop recovery.** A lost realtime model session is reopened once with the conversation so far; if that fails the caller hears a carrier-side message (Twilio `<Say>`, Vonage `talk`) and the call ends. No retry loop.
  - **Spoken progress.** Delegations narrate progress on bridged calls.
  - **Transcript in the call's own conversation**, attributed to the dialled agent, instead of a shared "Meeting Room" conversation.
  - **Cleanup.** `ReconcileOrphans` runs at startup and every 10 minutes; ended calls close their `MJ: AI Agent Sessions` row; live calls heartbeat it so the host janitor does not close a long call.
  - **`telephony.maxConcurrentCalls` (default 25).** Over the cap an inbound caller hears "all agents are busy" and an outbound request is refused with `at-capacity`. Set it at or below the realtime model plan's concurrent-session limit.
  - **RingCentral `HealthCheck`** reports unhealthy when SIP registration failed or has been pending past a minute, with the reason.
  - **Audio.** A stateful per-direction resampler with a low-pass filter replaces the stateless one, removing frame-edge clicks and aliasing when 24 kHz model audio is sent at 8 kHz.
  - **Fixes.** Inbound bridge rows are stamped `InboundRoute` / `Active` rather than `OnDemand` / `Passive`; the roster no longer swaps the agent's and the caller's numbers; and the Twilio signature URL is the public URL's origin plus the request path, so a public URL ending in `/graphql` no longer double-counts the path.

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [0a75bb2]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [b545842]
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
  - @memberjunction/ai-vector-sync@6.2.0-edge.3
  - @memberjunction/ai-prompts@6.2.0-edge.3
  - @memberjunction/rubrics@6.2.0-edge.3
  - @memberjunction/ai-core-plus@6.2.0-edge.3
  - @memberjunction/actions-base@6.2.0-edge.3
  - @memberjunction/ai-reranker@6.2.0-edge.3
  - @memberjunction/ai-vector-dupe@6.2.0-edge.3
  - @memberjunction/actions@6.2.0-edge.3
  - @memberjunction/search-engine@6.2.0-edge.3
  - @memberjunction/templates@6.2.0-edge.3
  - @memberjunction/storage@6.2.0-edge.3
  - @memberjunction/context-crush@6.2.0-edge.3

## 6.2.0-edge.2

### Minor Changes

- ca853fc: Agents can now narrow the actions, sub-agents and skills their prompt describes: set `maxActionsInPrompt` or `maxSubAgentsInPrompt` to a positive number and, once per run, one decision call keeps the items most useful for the opening request, plus any with `MinExecutionsPerRun` and the Find Candidate tools. Each narrowed list starts with a line saying how many items it hides and how to reach them: hidden sub-agents and skills are named, and hidden actions are found with Find Candidate Actions, so actions are narrowed only when the agent has that action. It is off by default, only hides entries (anything permitted can still be called, and the counts stay whole), and shows the full catalog if the decision fails. Narrowing is prose-only: with native tool calling, every action and sub-agent is still declared as a tool. The two params' descriptions in the Loop agent type's `PromptParamsSchema` (metadata) now describe this, replacing the old "0 to hide, or the first N" meaning, which was never implemented.
- 672b4c6: Adds a `DecisionReranker` and a `Decision Reranker` model: it scores each candidate note with one typed-decision Likelihood question, and an agent opts in by pointing its `RerankerConfiguration.rerankerModelId` at the model. Examples can now be reranked too, with the same reranker, when an agent's reranker configuration sets `rerankExamples` to true; it is off by default. The examples rerank records a `Rerank Examples` step on the agent run, linked to its prompt run, as the notes rerank records `Rerank Notes`.

  A rerank's prompt runs (the decision runs, or `LLMReranker`'s chat run) are children of the rerank's run, whose cost and token rollups include them, and the rerank's run step joins the agent run's steps, so the agent run's cost and token totals and its `MaxCostPerRun` / `MaxTokensPerRun` guardrails count the rerank.

  A `DecisionReranker` rerank has a time budget, 15 seconds unless `RerankerConfiguration.decisionTimeoutMS` sets another: when it runs out the decision calls are aborted and the rerank fails, so the agent falls back as `fallbackOnError` says. When no decision model declares `MaxQuestionsPerCall`, each decision call carries at most 20 documents, or `RerankerConfiguration.decisionMaxDocumentsPerCall`, and a larger rerank is split across parallel calls.

  When no candidate reaches `minRelevanceThreshold`, the agent keeps the vector search results instead of injecting nothing. For a `DecisionReranker`, whose probabilities are not calibrated, 0.1 is the recommended threshold.

  `RerankerService.GetReranker` builds a `DecisionReranker` without a prompt ID, as its docs say: it asks the decision prompt its model-vendor `APIName` names, or `Default Decision`.

- 0e5ad68: Agents: one master switch for decision-model use, the Loop prompt param `decisionsEnabled`, `false` by default. Unless it is `true`, an agent never asks a decision model on its own, whatever its other settings say. Inline `decisions` get no docs and no response field (even with `includeResponseTypeDefinition.decisions: true` set explicitly), and any request the model sends anyway is skipped. `finishIf` is treated as `finishIfMode: 'off'`. Decision discovery, the payload change check, catalog narrowing (which then describes the whole catalog) and the Memory Manager's note gate do not run. With `decisionsEnabled: true`, each of those works as before and keeps its own setting, each still off by default.

  Set it in an agent's `AgentTypePromptParams`, or for one run in `data.__agentTypePromptParams`. `decisionsEnabled` is declared in the Loop agent type's `PromptParamsSchema` with a default of `false`, and each of the settings it governs now says it needs it. Explicit uses do not read it: a Flow or task-graph Decision step, the Run Decision action, and the other direct callers of `AgentDecisionService` and `AIDecisionRunner`.

  Integration tests: a new deterministic bundle, `agent-decisions-switch` (IT97, nine checks), runs real agents with the switch off, on in an agent's params, and flipped for one run, on scripted chat replies and a stand-in decision driver, so no model is called. It covers the five loop uses, the Memory Manager's note gate, and a Flow agent's Decision step, which the switch leaves alone.

  Prompt params: the alignment of `includeResponseTypeDefinition` now works on a copy, so it no longer writes into a run's `data.__agentTypePromptParams`. Sub-agents inherit that object, so before this a parent with the switch off could turn a sub-agent's `decisions` and `finishIf` fields off.

  Test doubles: `RegisterTestLLM` and the decision stand-in now register above every existing registration for a name, so a registration made after an earlier restore still wins over the real driver that restore put back.

- 26c0178: Flow agents gain a Decision step: one typed decision call whose outgoing paths route on its answers through the `decisions` condition root (`decisions.<key>.<question>`), both when the flow is dispatched as a task graph and when it runs in-run. An answer that fell below its question's `minConfidence`, or was never given, holds every condition that reads it, so a flow never guesses a branch; a failed decision call is a failed step, whose recovery path is taken whatever its rank. A state that is missing or empty, `{}` included, fails the step the same way in both modes, before any model is asked. A flow with a Decision step is validated the same way in both modes before its first step. Saving a task graph as a workflow now keeps its Decision nodes as Decision steps. Saving a workflow through Agent Manager now resolves the actions and prompts its steps name, so a saved Action step keeps its action and a Decision step keeps its prompt, and an action it cannot resolve is reported.
- 96daca8: Loop agents can ask typed decision questions (Likelihood, Choice, Score) through a new `decisions` field in their response. A fast decision model answers them inline on the same turn, at no LLM-turn cost, and the answers arrive on the next turn, as artifact tool results do. A request can target literal text, a payload path, or each item of a payload array. **Opt-in per agent:** set `includeDecisionsDocs: true` in the agent's `AgentTypePromptParams` (the default is `false`). That adds the decisions docs to its loop system prompt and the `decisions` field to its response type. Setting `includeResponseTypeDefinition.decisions: true` on its own adds the field without the docs. A `decisions` field from an agent that has neither is skipped. **Data flow:** each request sends its state (literal text, or the payload values it names) to the `Default Decision` prompt's model: Jev, via OpenRouter, first, and LLM Decision on failover. Set `decisionPromptName` to route them to a different prompt.

  Each decision call is linked to its Decision step, so it counts toward the run's cost and token totals and their `MaxCostPerRun` / `MaxTokensPerRun` limits. At most 8 requests run per turn (`decisionsMaxRequests`), a malformed request fails on its own without losing the turn, and decisions sent with a step that ends the run (a passing `finishIf`, a sub-agent's `terminateAfter`, or client tools with `taskComplete`) are skipped rather than paid for and never read.

- aa912ca: Loop agents can attach conditional completion gates (`finishIf`) to `Actions` steps and to a single `Sub-Agent` (not parallel `subAgents`). When the step completes successfully, a dedicated fast decision model evaluates the specified Likelihood questions against the step outputs. If all criteria meet or exceed the threshold (default 0.90), the agent completes immediately with the specified message, saving an entire turn of LLM latency and cost. The gate is skipped when an action returns `AIDirectives`, so the agent still reads them.

  **Off by default: gates are opt-in per agent**, through the new `finishIfMode` prompt param in the agent's `AgentTypePromptParams`:
  - `off` (the default): the model is not taught `finishIf`, and a gate it writes anyway is never evaluated.
  - `shadow`: the model writes gates, and each one is evaluated and recorded as a `Finish check` step, but it never ends the run. Use it to measure an agent's gates on real traffic, at the cost of one decision call per gate.
  - `on`: a passing gate ends the run with the model's pre-written message.

  A replay of recorded action rounds found that a gate at the 0.90 threshold would have ended 22% of the rounds where the agent went on to act, so turn an agent `on` only after its shadow results look right. In `on` mode a gate can only end a run early, and only when every action succeeded and every answer clears the threshold; every gate is logged as a `Finish check` step. **Data flow** (in `shadow` and `on`): each gate sends the step's results (action outputs, or the sub-agent's result) to the `Default Decision` prompt's model: Jev, via OpenRouter, first, and LLM Decision on failover.

- f3fa01e: finishIf: a `finishIfMode` that is set but is not `off`, `shadow` or `on` (for example `"On"` or `"true"`) still turns the agent's gates off, but it now logs a warning naming the agent and the value it got. The warning is logged once per agent and value, not on every turn. A run request can set the value, so the warning shows at most its first 100 characters (and its length), and at most 1,000 agent and value pairs are remembered as reported, the least recently seen dropped first. Shadow mode after a sub-agent is now covered by a test.

  Loop-agent decisions: decision requests held back until their step had run are now logged as skipped when the run is cancelled, or when an error is thrown out of the step loop, as well as when the step ends the run. Each held request is logged exactly once, and the log line says how the run ended. Nothing new is sent; this only makes the log complete.

  Loop-agent decisions: one turn's decision requests now make at most `decisionsMaxCallsPerTurn` decision calls in total (default 100), counting every `forEachItemIn` item. Before, only the number of requests was capped (8), so one turn could send up to 800 calls before the run's cost guardrails, checked between steps, could stop them. The budget is handed out in request order before any call is made. A `forEachItemIn` request it cuts short asks its first items and reports the rest in `skippedCount`, and a request it leaves no calls for is not run and gets a failed result saying why, as a request over the request cap does. With a budget of 0, decision calls are off for the agent, and that result says so rather than inviting the agent to ask again next turn. `decisionsMaxCallsPerTurn` is declared in the Loop agent type's `PromptParamsSchema`.

  Loop-agent decisions ship opt-in (`includeDecisionsDocs: true`, default `false`). Measured on the Prompt Eval corpus (68 cases, four models, 1,632 runs), the docs added about 1,200 prompt tokens to every turn, changed no decision, and no model wrote a `decisions` request. `includeDecisionsDocs` is declared in the Loop agent type's `PromptParamsSchema` with a default of `false`.

- d0cea53: Loop agents can opt in to a payload change check with the `payloadFeedbackCheck` prompt param (off by default, and declared in the Loop agent type's params schema): when the payload analyzer flags one of the agent's own changes, one typed decision call asks whether each change was intended, and the changes judged unintended are listed on the agent's next turn so it can confirm them or put them back. Nothing is reverted automatically. A step that ends the run is not checked, the call is bounded at 30 seconds, and when it fails or times out every change is accepted. The call's prompt run is linked to its `Payload change check` step, so the run's cost and token totals count it.

  `PayloadFeedbackManager.QueryAgent` (and the deprecated `queryAgent`) now asks typed decisions instead of the `Payload Change Feedback Query` prompt, whose metadata is removed. **Its second parameter changed type**: it was a `Record<string, unknown>` conversation context that it never read, and is now a `PayloadFeedbackContext` (the agent's reasoning and message for the step, the reasoning for the change, the agent ID and a cancellation signal). A caller that passed a conversation record should pass those fields instead. The constructor takes an optional `AgentDecisionService`, and `LastDecisionResult` exposes the last call's result so a caller can link its prompt run.

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

- bb33c77: Loop agents can now suggest the agent to delegate to before their first prompt: with the new `decisionDiscovery` prompt param on (off by default), one decision over the agents the user may run and the host allows adds a `<suggested_agent>` message when it is confident, and Sage's prompt delegates to that agent directly instead of calling Find Candidate Agents first. It asks only about a conversation's opening request, and only when at least three agents are left to choose from. The agent run-permission filter the Find Candidate Agents actions use now lives on `AIAgentPermissionHelper` (`FilterRunnableAgents`, `IsDirectlyDiscoverable`), so both offer the same agents.

### Patch Changes

- ff3097d: Realtime voice sessions started from an agent run now resolve their vendor key against the run's API keys, and the Computer Use engine gains a key-resolver seam (not yet wired in MJ).

  `ExecuteAgentParams.apiKeys` already reaches every prompt's legacy key tier, and (as of #4611) is offered to every action as `RunActionParams.RuntimeAPIKeyResolver`. Realtime resolved against the environment alone, so a run carrying a customer's key still opened its voice session on the platform's.
  - **`@memberjunction/ai`** — `AIAPIKeyResolver` (driver class in, key out) and `MakeAIAPIKeyResolver(apiKeys?)`, which applies `GetAIAPIKey`'s order: the list's key for that driver class, else the platform's. Passing nothing yields the platform lookup. For prompts that order is only the legacy tier (`AIPromptRunner` tries MJ Credentials first), and realtime does not consult MJ Credentials. `RealtimeAPIKeyResolver` becomes an alias of `AIAPIKeyResolver`. `@memberjunction/actions-base` keeps its own identical `RuntimeAPIKeyResolver`, and the prompt runner still takes the key list.
  - **`@memberjunction/ai-agents`** — `BaseAgent.resolveRealtimeModel` (the server-run realtime session) resolves against `params.apiKeys`. `PrepareClientSessionInput.APIKeys` carries them into `RealtimeClientSessionService`, and `BaseAgent.StartBridgeRealtimeSession` fills it. There the order is run key, then the service's overridable `getAPIKeyForDriver` seam (by default the environment key), on all three model-selection branches, with vendor selection and the mint sharing that one chain. `CreateBridgeRealtimeSession` (the LiveKit / telephony factory) passes no `apiKeys`, so sessions it opens stay on platform keys, and the browser-initiated session mutation never sets them. `GetRealtimeModelVoices` takes an optional resolver as a seam; its only caller, the voice-picker query, has no run context and passes none.
  - **`@memberjunction/computer-use`** — `RunComputerUseParams.APIKeyResolver`: an optional resolver that the engine's direct-LLM funnel (used when the controller and judge models are pinned) asks first, falling back to the platform key. Nothing in MJ sets it yet. `ComputerUseAction` does not forward it, and `MJComputerUseEngine`'s default path runs stored prompts through `AIPromptRunner`, which does not consult it. So browser-agent runs started from MJ are unchanged.

  **Vendor selection is affected, deliberately.** Realtime picks the first vendor whose key resolves, so a run that brings a key for a vendor the deployment holds no platform key for now reaches that vendor. That is a routing change, not only a billing one.

  No behaviour change for a session with no runtime keys, including one on a service subclass that overrides `getAPIKeyForDriver`.

- 50ba290: Sage's agent-discovery decision now judges its answers calibrated per decision model, at a threshold set from the agent-discovery Decision Eval: `DECISION_DISCOVERY_MIN_CONFIDENCE` is 0.85, and `DECISION_DISCOVERY_CALIBRATION` holds the fitted Platt parameters for Jev and LLM Decision. Each calibration applies only to the exact model it was fitted on, through `FindDecisionCalibration` (`@memberjunction/ai-core-plus`): Jev at its pinned `typesafe/jev-1.13-20260917`, and LLM Decision only when its GPT-OSS-120B chat model answered. An answer from a model with no calibration is treated as unsure, and discovery warns once per such model. The Decision Eval records whether production would inject through the same calibrated path.
- ffb3c0f: The Decision Eval harness can now measure Sage's agent-discovery decision (`agent-discovery`), beside a `semantic-search` baseline of what `Find Candidate Agents` ranked first, with a labelled-corpus generator and discovery metrics in the scorecard. `@memberjunction/ai-agents` now exports the discovery helpers, including `BuildDecisionDiscoveryOptionSet`, which `BaseAgent` and the harness both use to build the options. The discovery eval times the whole discovery, options and semantic search included, as production's 1,500 ms timeout does, and counts an answer that arrives later as not injected.
- b03a928: feat(ai-agents): export the finishIf gate's pure parts, so an eval can apply exactly production's rule

  The finishIf gate's state formatting, question building, verdict and validation now live in one pure module, `finish-if-state.ts`, and `BaseAgent` and `LoopAgentType` call it. Nothing the gate does changes; a test pinned the formatter's output before the move.
  - `FormatActionForFinishIf`, `FormatSubAgentForFinishIf` and `CapFinishIfState` build the state the decision model reads, with `FINISH_IF_STATE_MAX` (16,000) and `FINISH_IF_STATE_EXCERPT` (2,000).
  - `BuildFinishIfQuestions` maps the questions onto `q1`, `q2`, … Likelihood questions.
  - `JudgeFinishIf` is the pass/fail rule: every question needs a Likelihood answer that reaches the threshold, so a missing answer, an answer of another kind or a non-numeric probability fails it. With no question at all it fails closed (production never asks an empty set: `IsValidFinishIf` requires one).
  - `IsValidFinishIf` is the loop agent type's check: one to three non-empty questions and a non-empty message.

  The finishIf replay eval (`integration-test-suite/rigs/finishif-replay.ts`) uses them to replay the gate on recorded runs.

- b44c7cf: Realtime voice sessions from magic-link (anonymous) users now save their hidden tool-execution and artifact-anchor conversation turns. These were refused because they were written as the system user, who does not own the conversation. A refused conversation-detail write now reports why, instead of logging "unknown error" (#4791). Agent runs started from a conversation now include that reason when saving their conversation messages fails.
- 0d61b53: Fix vectorization into a colocated vector database (SQL Server 2025 `VECTOR`, pgvector colocated) when the syncer is built without a provider (#4910).

  `VectorBase.Provider` fell back to the `Metadata` wrapper instead of a real `IMetadataProvider`. The wrapper fails `IsColocatedVectorHost`, so `TryWireColocatedHost` never wired a host and every upsert failed with "requires a host connection". The fallback is now `Metadata.Provider`, and the `as unknown as` casts are gone.

  The callers that build an `EntityVectorSyncer` now pass the provider they already hold: `VectorizeEntityResolver` (the request's provider), `KnowledgeAgent` (the tool call's provider, also for `DuplicateRecordDetector`), the `Vectorize Entity` and `Autotag and Vectorize Content` actions (`params.Provider`), and `KnowledgePipeline`, which gains an optional constructor provider.

- 3276daa: The Memory Manager can gate extracted notes on a typed decision instead of the extraction prompt's self-reported confidence (`EnableDecisionGate`, or `enableDecisionGate` in `params.data`; off by default). Each candidate note is asked as its own Likelihood, calibrated per model, and kept at a calibrated 0.6. Only Jev is calibrated: measured on 337 labelled notes, it kept 6.2% of conversation-only notes at 96.1% precision, where a proxy self-report scorer kept 40.0% at 85.3%. The proxy scores notes in a separate call, with a different rubric from the `Extract Notes` template and none of its skip rules, so production's own filter probably keeps fewer of those notes. A batch answered by an uncalibrated model, or a failed call, falls back to the self-reported rule. Only a caller that passes `data` can turn the gate on today, such as the Execute Agent action or the MCP server's agent tool. The scheduled Memory Manager job passes no `data`, so it can't opt in yet.
  - The decision's run step joins the agent run's steps and carries the decision's prompt run, so the run's cost and token totals count the gate.
  - Each note is judged against the conversation it came from: one decision per conversation, with that conversation's excerpt formatted as the measurement's corpus was (`FormatMemoryNoteExcerpt`, `GroupMemoryNotesByConversation`). A note that names none of several conversations keeps the self-reported rule.
  - A note the calibrated model gave no usable answer for keeps the self-reported rule, as a failed call's batch does. Corrective notes mined from failed runs are not gated, since the gate was measured on conversation notes only. The gate's calls take the run's cancellation signal.

- 200e634: Round 16 memory-leak audit fixes: bound three previously-unbounded caches and fix a dead process-kill escalation.
  - `RealtimeClientSessionService`'s `sessionWireActionMaps`/`targetWireActionMaps`/`sessionDirectConfigs` and `bridge-room-transcript-sink.ts`'s `roomToConversation`/`writeChains` were plain `Map`s on process-lifetime objects with no session/room-ended hook to evict on — every realtime voice session or meeting room ever handled left a permanent entry. Converted to `MJLruCache` (bounded, TTL'd), mirroring the same file's existing `promptRunWriteChains` pattern.
  - `EntityActionEngineServer.RunEntityAction()` constructed a fresh `EntityActionInvocationBase` on every single dispatch instead of reusing one per invocation type, silently discarding the Script invocation type's own `_scriptCache` before a second lookup could ever hit it. Added an instance cache keyed by `InvocationType.Name`.
  - `ChildProcessExecutor`'s `Kill()` sent only `SIGTERM` with no `SIGKILL` follow-up, on the hot path of every AI-agent CLI turn. Added a `SIGTERM`→5s grace→`SIGKILL` escalation.
  - While testing that escalation, found `WorkerPool.Shutdown()`'s own `SIGTERM`→`SIGKILL` escalation — believed correct since this audit's Round 10 — was dead code: `ChildProcess.killed` is set `true` synchronously once `kill()` sends a signal, not once the process exits, so the old `if (!worker.process.killed)` guard never actually fired `SIGKILL`. Fixed to key off the process's `exit` event instead.

  No behavior changes on any success path; all four packages' full test suites pass with new coverage for each fix.

- Updated dependencies [f555162]
- Updated dependencies [043f418]
- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [3fbda62]
- Updated dependencies [eaa9455]
- Updated dependencies [ff00d60]
- Updated dependencies [2552b1e]
- Updated dependencies [4b680f9]
- Updated dependencies [660ef45]
- Updated dependencies [8fd1c46]
- Updated dependencies [ed77dd7]
- Updated dependencies [21f9e15]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [672b4c6]
- Updated dependencies [f3c6161]
- Updated dependencies [01fafc6]
- Updated dependencies [35ffb95]
- Updated dependencies [5148534]
- Updated dependencies [cf97480]
- Updated dependencies [0adaf76]
- Updated dependencies [5ee02db]
- Updated dependencies [ce1a5c3]
- Updated dependencies [ef43cf3]
- Updated dependencies [b44c7cf]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [861cbf0]
- Updated dependencies [705ab4e]
- Updated dependencies [e51ce8a]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
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
- Updated dependencies [fb267da]
- Updated dependencies [2854a2e]
- Updated dependencies [74b3e69]
  - @memberjunction/ai-core-plus@6.2.0-edge.2
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/ai-prompts@6.2.0-edge.2
  - @memberjunction/ai-vector-dupe@6.2.0-edge.2
  - @memberjunction/ai-vector-sync@6.2.0-edge.2
  - @memberjunction/search-engine@6.2.0-edge.2
  - @memberjunction/aiengine@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/ai-reranker@6.2.0-edge.2
  - @memberjunction/actions@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/rubrics@6.2.0-edge.2
  - @memberjunction/ai-engine-base@6.2.0-edge.2
  - @memberjunction/templates@6.2.0-edge.2
  - @memberjunction/actions-base@6.2.0-edge.2
  - @memberjunction/storage@6.2.0-edge.2
  - @memberjunction/context-crush@6.2.0-edge.2

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

- eb3a8d3: feat(conversations): host rules for chats with several people

  `mj-conversation-chat-area` gains opt-in inputs, one reworked event, a hook and a slot, so a host can run a chat between several people without forking the chat area. Every default keeps today's behavior.

  **Inputs — `ng-conversations`.** Set on `mj-conversation-chat-area` (and on `mj-message-input` directly):
  - `AgentReplyMode` — `'Always'` (default) answers every message; `'MentionOnly'` answers only a message that tags an agent and posts any other message with no turn at all: no reply row, no placeholder, no turn events.
  - `AllowedAgentIDs` — the agents that may answer. Narrows the composer's `@` list, every route (tagged agent, continuity, pinned and host default agents, the conversation manager), the manager's delegation — including each agent step of a workflow it plans — and the pin and voice pickers. Null allows every agent; an empty list allows none.
  - `MentionPeople` — the people the `@` list offers (today it offers only the current user). Each composer keeps its own list: two composers on one page never see each other's.
  - `AgentHistoryFrom` — the first moment of the conversation an agent turn may read (see below).
  - `AgentTurnHandler` — an async hook that runs the turn on the host's server instead of MJ's path, once per turn, before any reply row exists. The chat area shows the rows it reports.
  - `AutoNameConversation` — turns MJ's auto-naming of a new conversation off (text and voice).

  **Behavior change: `BeforeAgentTurn`.** It now fires once per turn on every route, before any row exists, and carries the resolved `AgentId`, `AgentName`, `Route` and `UserMessageId`. A listener can cancel the turn or send it to another allowed agent with `RedirectAgentId`. Canceling now leaves nothing behind. Previously the event fired only on the conversation manager's route, after that route's placeholder row was saved, and a cancel left the row behind, marked "Turn canceled before agent invocation". `AfterAgentTurn` now fires on every route too.

  **Slot.** `composerExtra` renders host UI directly above the composer, wherever the chat area shows one, with an `IMJChatComposerExtraContext`.

  **History floor — `server`, `core-entities`, `ai-core-plus`, `ai-agents`, clients.** `RunAIAgentFromConversationDetail` takes a new nullable `agentHistoryFrom` argument (ISO-8601). The server loads the agent's history from that moment and uses no summary of earlier messages; an unreadable value fails the request. The run carries it as `ExecuteAgentParams.ConversationHistoryFrom`, so the conversation-history tools, the conversation's artifacts, cross-turn compaction (skipped) and the carried-forward tool results of the previous turn (not carried) hold it too. `ConversationEngine.LoadWindowRowsFresh` and `AssembleContextWindow` accept the floor, and `ConversationEngine.HistoryFromFilter` writes it. The GraphQL client names the argument only when a floor is set, so a client that sets none keeps working against an older MJAPI.

  **Runtime — `conversations-runtime`.** `MentionAutocomplete.GetSuggestions` takes an optional per-call `MentionSuggestionScope`; `ConversationAgentRunner.processMessage` takes `AllowedAgentIDs` (narrows the manager's `ALL_AVAILABLE_AGENTS`) and `AgentHistoryFrom`.

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

- c4993f3: A `While` loop whose condition cannot be evaluated now fails instead of silently succeeding.

  `executeWhileIterations` treated "the evaluator could not evaluate the condition" exactly like "the condition is false". It broke out of the loop, discarded the evaluator's error, and `completeWhileLoop` finalized the step as a success, reporting "after 0 iteration(s)". A malformed or disallowed condition — an assignment, a parse error, a property read on `undefined` — produced a green, zero-iteration loop with the cause recorded nowhere.
  - An unevaluable condition is now recorded as a loop error carrying the evaluator's message, so the loop step finalizes with `success: false`.
  - If the condition fails before the first iteration, the loop returns a `Failed` step with that message instead of completing.
  - If it fails mid-loop, the earlier results are kept, and the loop-results message the model sees lists the condition error under `Errors`.
  - A Loop agent's model is now shown the error whenever a loop fails before its first iteration: a `While` condition that cannot be evaluated, an invalid `While` or `ForEach` configuration, or a `ForEach` collection that is not an array. It arrives as the usual loop-results message, with the error under `Errors`. A Loop agent answers a `Failed` step by prompting again, and nothing on that path showed the model the step's error, so it got another turn with nothing new to go on.
  - Loop step error messages (`While` and `ForEach`) now render each error's text. Joining the raw error objects had written `[object Object]` into the step's `ErrorMessage`.

  **What you will notice:** a Flow agent whose `While` condition cannot be evaluated, and which has no outgoing path from that step, now ends `Failed` where it used to end `Success`. A Loop agent whose model writes such a condition sees the evaluator's error on its next turn.

  A loop whose condition evaluates normally behaves exactly as before, including the message returned to the model.

  From the typed-decision plan (#4660), Phase 0 Task 0.8.

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
  - @memberjunction/aiengine@6.2.0-edge.1
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/ai-core-plus@6.2.0-edge.1
  - @memberjunction/ai-prompts@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/actions-base@6.2.0-edge.1
  - @memberjunction/actions@6.2.0-edge.1
  - @memberjunction/storage@6.2.0-edge.1
  - @memberjunction/ai-reranker@6.2.0-edge.1
  - @memberjunction/ai-vector-sync@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/search-engine@6.2.0-edge.1
  - @memberjunction/templates@6.2.0-edge.1
  - @memberjunction/ai-vector-dupe@6.2.0-edge.1
  - @memberjunction/ai-engine-base@6.2.0-edge.1
  - @memberjunction/context-crush@6.2.0-edge.1

## 6.2.0-edge.0

### Minor Changes

- b87e4ac: feat(ai): Gemini 3.8 Live multimodal realtime streaming, video tracks, asynchronous reasoning, and per-model legality

  This release adds comprehensive support for Google's Gemini 3.8 Live multimodal realtime models (`gemini-3.8-live` and `gemini-3.8-live-extended-thinking`), including a first-class media plane for video/audio tracks, non-blocking tool execution, thought summaries, session continuity, and complete catalog metadata.

  In `@memberjunction/server`, the default configuration for `realtime.enabled` is flipped from `false` to `true`, enabling the `/realtime/sdp-exchange` WebRTC broker endpoint on all MemberJunction API servers by default (configurable via `MJ_REALTIME_ENABLED`).

  ### Phase Summary:
  - **Phase A (Contracts & Media Plane)**: Introduced directional media tracks (`RealtimeTrackDescriptor`, `RealtimeTrackDirection`), open modality vocabulary via `RealtimeModalityRegistry`, track negotiation in `BaseRealtimeClient`, and channel track sourcing/sinking (`GetSourcedTracks`/`GetSunkTracks`).
  - **Phase B (Audio Retrofit & SDK Convergence)**: Upgraded and converged `@google/genai` to `^2.8.0` across dependents.
  - **Phase C (Gemini Live Config Legality)**: Added per-model legality enforcement in `GeminiRealtime`: stripped `enable_affective_dialog`, preserved `proactive_audio: true` while rejecting `false`, enforced `thinkingConfig` rules (omitted on 3.8-live, validated levels low/medium/high and rejected `minimal` on Extended Thinking), explicit turn coverage, local refusal of `BLOCKING` tools on Extended Thinking, default `NON_BLOCKING` state on all declarations, and config bag sanitization.
  - **Phase D (Async Tool Execution & Idle Contract)**: Implemented per-model idle detection honoring `IdleSignal` (`generationComplete` for 3.8-live, `interactionStatus` for Extended Thinking); decoupled tool call arrival from response activity so generation is not falsely interrupted; drained `queuedSends` only on true idle or turn complete; integrated `RealtimeToolBatchBarrier` for parallel/out-of-order tool calls; and added function scheduling resolution (`__mj_scheduling` / `scheduling` with `INTERRUPT`/`INTERRUPTED` support).
  - **Phase E (Extended Thinking & Narration)**: Routed model thought parts (`IsThought: true`) to `ThoughtNarration$` and created immutable narration delegation cards (`Kind: 'narration'`), keeping scratch thoughts distinct from spoken responses and user-cancelable actions.
  - **Phase F (Video Tracks & Session Continuity)**: Implemented video frame capture (`getDisplayMedia`/`getUserMedia` in `src/media/frameCapture.ts`), throttled inbound video frame transmission via `ChannelInboundVideoBridge` (whiteboard and remote browser channels), and resilient session continuity across the vendor session cap via `sessionResumptionUpdate` / `goAway`.
  - **Phase G (Metadata & Release)**: Added declarative catalog metadata and multi-channel pricing for `Gemini 3.8 Live` and `Gemini 3.8 Live Extended Thinking` in `metadata/ai-models/.ai-models.json`.

  ### Reviewer Punch List Resolutions:
  - **Items 16–18 (Scheduling)**: Supported `__mj_scheduling` alongside `scheduling`, sanitized payload keys, accepted both `INTERRUPT` and `INTERRUPTED`, and added diagnostic warnings on unknown values.
  - **Item 19 (Non-blocking getter)**: Extracted and centralized `isNonBlocking` getter on `GeminiRealtimeClient`.
  - **Item 20 (Generation Complete)**: Ensured `handleGenerationComplete` updates `responseActive` without prematurely draining queued sends.
  - **Items 21–23 (Thought Narration)**: Cleanly separated thought summaries from spoken narrations and the ephemeral live note across `RealtimeSessionService` and `RealtimeSessionState`.
  - **Item 24 (Activity Rail)**: Restricted open-run button rendering to agent runs (`card.Kind === 'agent' && !!card.RunID`).
  - **Items 25–27 (Video Bridge & Throttle)**: Separated `sendFrameDirect`, resolved throttle contention between bridge and driver with jitter headroom, added graceful headless DOM detection, and guarded against unimplemented `SendVideoFrame`.
  - **Item 28 (File organization)**: Moved `frameCapture.ts` from `audio/` to `media/` with clean import paths.
  - **C5a–C5c (Config Sanitization & Tool Behavior)**: Stated explicit tool behavior on all declarations, warned on unknown values, and added `tooling`, `toolBehavior`, and `functionCallingBehavior` to `REALTIME_SHARED_CONFIG_KEYS`.

### Patch Changes

- abf8778: Actions inside an agent run now receive the run's runtime API keys, so a run on a customer's key generates its images on that key too.

  `ExecuteAgentParams.apiKeys` already reaches every prompt (`AIPromptRunner` → `GetAIAPIKey(driverClass, apiKeys)`), but `BaseAgent` never handed it to actions, and `Generate Image` called `GetAIAPIKey(driverClass)` with no second argument — so a run whose prompts used a customer's OpenAI key still generated images on the platform's.
  - `BaseAgent.ExecuteSingleAction` hands each action a SCOPED RESOLVER on the new `RunActionParams.RuntimeAPIKeyResolver` (a `RuntimeAPIKeyResolver` from `@memberjunction/actions-base`) when the run has runtime keys — one driver class in, one key out. Per dispatch, not on `Context`: the context is one object shared by every action in the run and copied into sub-agent runs, so the resolver is bound to the action it was handed to even under parallel dispatch. The key list itself is never handed to an action, so none can enumerate the run's credentials; a new `actionMayUseRuntimeAPIKey(action, driverClass, params)` hook (default: allow) lets an agent refuse a class to an action, a refusal being the platform key, not an error. Every resolution is logged by action and driver class (never the key). Absent when the run has no keys, so no action has to special-case it.
  - `Generate Image` asks the resolver for its own driver class and falls back to `GetAIAPIKey(driverClass)` — per driver class, exactly as prompts do. Also fixes the vendor-name fallback, which found a key and then passed the empty one to the generator.
  - `@memberjunction/actions-base`: `RunActionParams.RuntimeAPIKeyResolver` + the `RuntimeAPIKeyResolver` type; `RunActionParams.Context` documents the well-known keys BaseAgent stamps.

  No behaviour change for a run with no runtime keys.

- e3db74f: Flow agents can be sub-agents and return their result again (#4555). A Flow agent run with a `parentRun`, or with `agentTypeParams.executionMode: 'inRun'`, now walks its steps in-process and returns the final payload, including `startAtStep`. A top-level run with no option set is still dispatched to the task-graph dispatcher. Each run records which mode it used as a `Decision` step.
- d665a6e: feat(ai): Gemini Live direct tools support, prompt framing alignment, and change-driven remote browser screencast deduplication
  - Declared `SupportsDynamicToolSet = true` on `GeminiRealtime` and its session capabilities so target agent direct action tools are projected into Gemini Live sessions.
  - Fixed `hasDirectTools` calculation in `RealtimeClientSessionService` to consider `input.ExtraTools` (whiteboard, browser, media, context tools), ensuring interactive surface tools prevent the negative "do not attempt to do the work yourself" prompt guidance.
  - Implemented change-driven screencast frame deduplication in `RemoteBrowserChannel` with a 15-second heartbeat, preserving ~15k tokens/min on static pages while maintaining instant visual push on user interactions.
  - Reworded `ResolveGeminiThinkingLevel` fallback warning and added `CompileBrowserDelegationPolicy` doc clarification per PR review feedback.
  - Added Node < 23 `CloseEvent` compatibility polyfills in `ai-realtime-client` test suites.

- e962151: refactor(ai-realtime): thread HasToolFraming boolean, document SendText barrier commentary queueing, and document tool batch dedupe lifetime rule
  - Added `HasToolFraming?: boolean` to `RealtimeSessionParams` in `@memberjunction/ai` (Core), replacing prompt substring sniffing with an explicit caller-asserted parameter while retaining substring sniffing as a fallback.
  - Set `HasToolFraming: true` in `RealtimeClientSessionService.buildSessionParams` for companion co-agent sessions.
  - Added comprehensive unit tests in `@memberjunction/ai-openai` verifying that `HasToolFraming` explicitly controls standalone delegation policy compilation.
  - Documented in `OpenAILiveClient.SendText` that user typed input is appended to commentary rather than dropped when the tool barrier is active, draining with the tool batch's `response.create`.
  - Documented the shared lifetime rule for `emittedToolCallIds` and `toolBatchBarrier` across declaration and clear sites.
  - Added `"engines": { "node": ">=24" }` to root `package.json` and `packages/AI/RealtimeClient/package.json`.
  - Recorded Item 43 design note for `RequiresConsent` in `plans/realtime/gemini-3-8-live.md`.

- Updated dependencies [abf8778]
- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [37891d3]
- Updated dependencies [6ad6434]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [42d701e]
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
- Updated dependencies [7fe994a]
- Updated dependencies [8d1a373]
- Updated dependencies [8a5d2c0]
- Updated dependencies [3d633ed]
- Updated dependencies [e962151]
- Updated dependencies [2c590b0]
- Updated dependencies [6ab86a7]
- Updated dependencies [fc3da91]
  - @memberjunction/actions-base@6.2.0-edge.0
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/aiengine@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/ai-prompts@6.2.0-edge.0
  - @memberjunction/ai-core-plus@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/ai-vector-sync@6.2.0-edge.0
  - @memberjunction/ai-vector-dupe@6.2.0-edge.0
  - @memberjunction/actions@6.2.0-edge.0
  - @memberjunction/ai-engine-base@6.2.0-edge.0
  - @memberjunction/search-engine@6.2.0-edge.0
  - @memberjunction/ai-reranker@6.2.0-edge.0
  - @memberjunction/templates@6.2.0-edge.0
  - @memberjunction/storage@6.2.0-edge.0
  - @memberjunction/context-crush@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Minor Changes

- a987913: Implement modality inheritance, AI Persona metadata catalog, and persona resolution across BaseAIEngine and realtime agents.
  - BaseAIEngine: implement modality inheritance according to Agent -> Model -> System -> Default precedence, honoring InheritTypeModalities, AIModelType default input/output modalities, and junction IsSupported = 0 / IsAllowed = 0 vetoes.
  - BaseAIEngine: cache and resolve AI Personas (GetModelPersonas, GetAgentPersonas, ResolveAgentPersona) incorporating agent style overrides and sequence ordering.
  - AIEngine: delegate persona and modality getters and helper methods to BaseAIEngine.
  - AIAgents: update GetRealtimeModelVoices to consult metadata personas first before falling back to driver SupportedVoices.
  - Metadata: seed canonical modalities (metadata/ai-modalities/) and initial personas (metadata/ai-personas/, metadata/ai-persona-vendors/, metadata/ai-model-personas/, metadata/ai-agent-personas/).
  - JSONType: simplify IAIPersonaVendorSettings to eliminate duplicate flat members and vendor namespacing.

- 0d3094c: **A skill can stay active for a conversation, not just a run.**

  A skill activates for one run: `requestedSkillIDs` is a per-call input and the activated set dies
  with the run. That is right for a one-shot capability and wrong for a skill that behaves as a
  mode — a persona, or an assistant whose reply carries a menu that is pressed on the NEXT turn, when
  nothing would re-activate it. Every conversational agent with a mode was re-implementing a
  (conversation, skill) table and merging it into the request by hand.

  Two additive, opt-in pieces (migration `V202609031400__v6.1.x__Conversation_Scoped_Skill_Activation`):
  - `AISkill.ActivationScope` — `Run` (default, today's behaviour) or `Conversation`.
  - `MJ: Conversation Skills` — one row per (conversation, skill), `Active` or `Ended`, with the run
    that activated it as provenance.

  `BaseAgent` does the rest. At the start of every root run that has a `conversationId`, the
  conversation's Active skills join `requestedSkillIDs` (every availability gate still applies on
  every run). When a `Conversation`-scoped skill activates — by request or by the agent's own choice —
  its row is written or re-activated. A persisted skill that a gate refuses this turn is simply not
  activated and gets no note (the user never mentioned it); its row stays Active, because a gate miss
  can be transient and ending the row would be silent, permanent loss of a mode. Retiring a mode is an
  explicit act. An explicitly requested skill that is refused still gets the system note.
  `BaseAgent.EndConversationSkill(conversationId, skillId, user)` is the app's "leave the mode"
  gesture. All three steps are protected/public and fail soft: losing a persisted skill means the user
  re-invokes it, never that the turn fails.

  Precedent: `UserRoutine.RequestedSkillIDs` (v5.45) persists a pre-selection on the owning record and
  threads it per run; this is the same idea keyed on the conversation. First-adopter feedback (Betty).
  A composer chip that shows the conversation's active skills and ends one on removal is the natural
  UI follow-up; the server side works for every client and bridge without it.

  Also: `mj sync pull` now round-trips a skill's `MJ: AI Skill Search Scopes` rows (under
  `metadata/ai-skills`) and an agent's `MJ: AI Agent Skills` grants (under `metadata/agents`, for the
  agents that directory pulls) — pull-config additions only; push already accepted both.

- 5ecfdb4: Realtime voice agents can now **speak first**.

  Conversation-start behavior is not instruction-following: an ElevenLabs realtime agent with no `first_message` produces no audio at all until it receives user audio, whatever the persona prompt says. Every ElevenLabs realtime session therefore opened in silence, waiting for the human to guess they should talk (issue #3557).
  - **`ElevenLabsRealtime`** now sends an `agent.first_message` conversation-config override, built alongside the existing prompt and voice overrides, so both topologies (server-bridged and client-direct) carry it. The managed agent enables the override, and — because `OverridesSatisfied` requires it too — an agent provisioned by an earlier MJ version is re-PATCHed on next use instead of silently dropping it forever (the failure mode behind #3374). Omitting it preserves today's wait-for-the-user behavior exactly.
  - **New persona slot `realtime.voice.default.firstMessage`** authors the opening utterance without naming a vendor, filed onto whichever driver resolves under the neutral `firstMessage` key — the same shape as the agnostic `voice`. It reaches both realtime host paths (`BaseAgent` server-bridged and `RealtimeClientSessionService` client-direct). The text is spoken VERBATIM; it is the literal opening line, not guidance about how to open.
  - **`AssemblyAIRealtime`** honors the same neutral `firstMessage` key for its `greeting` wire slot. The legacy `greeting` config key still works; `firstMessage` wins when it carries something. Both go through the same trim-and-drop-blank rule as the ElevenLabs driver, so one authored value means the same thing whichever vendor runs — in particular a blank `firstMessage` reads as "none authored" and does not suppress a valid legacy `greeting`.
  - **`firstMessage` is registered in `REALTIME_SHARED_CONFIG_KEYS`**, and the drivers that do not consume it now scrub it. Because an agnostic persona slot is filed onto _whichever_ driver resolves, an unregistered neutral key survives each driver's residual-bag spread and reaches the provider as an unknown session field — it was reaching the OpenAI (and xAI) `session.update` payload on both topologies, and Inworld's raw-override loop was copying it onto the session verbatim. On the OpenAI-protocol endpoints a malformed session object is rejected wholesale, taking the prompt and tools with it. Inworld now scrubs the whole shared vocabulary, closing the same class of leak for the other shared keys too.

  Drivers without a provider-native opening utterance ignore the key and open silently, as before.

- 48ff99f: Add `ModelConfiguration` — a per-modality, strongly-typed JSON configuration bag on the AI model catalog — at three levels forming an inherit-with-override cascade: `AIModelType` < `AIModel` < `AIModelVendor`, resolved base-first with per-key deep merge. One interface (`IAIModelConfiguration`: `LLM` / `Realtime` / `Vision` / `Audio` sections) is shared by all three levels via MJ's JSONType mechanism, so CodeGen emits typed `ModelConfigurationObject` accessors on all three entities. This generalizes the scalar cascade those tables already carry (`SupportsPrefill` / `PrefillFallbackText`): new session/call-time capability knobs now land as typed properties in one bag instead of a column per knob. Existing capability columns are untouched. `AIEngine.GetEffectiveModelConfiguration(modelID, modelVendorID)` is the single canonical read path; the pure `ParseModelConfiguration` / `ResolveEffectiveModelConfiguration` live in `@memberjunction/ai`.

  First consumer: realtime turn detection. `Realtime.TurnDetection` (`Mode: 'default' | 'serverVad' | 'semanticVad' | 'native'`, plus eagerness / threshold / silence tuning) flows catalog → session config bag → provider wire block on both realtime topologies, with precedence `profile default < ModelConfiguration cascade < realtime.session.turnDetection < runtime configOverridesJson`. Profiles declare `supportedTurnModes` and translate through the shared `MapNormalizedTurnDetection`; an unsupported mode is diagnostic-logged and falls back to the profile default, so a shared model catalog never rejects a session on any provider. Non-protocol drivers scrub the key. Turn detection was previously hardcoded per provider profile, so smarter models had no way to opt into their smarter turn modes.

  Fixes a latent bug: a live `Reconfigure` (the meeting-mode auto-response flip) hardcoded `server_vad`, silently downgrading any session running a non-server-VAD turn mode. It now rebuilds the session's actual resolved mode, with meeting-mode floor control composed on top.

  GPT Realtime 2.1 and 2.1-mini are seeded to `semanticVad` (eagerness `auto`) at the model level — the one behavior-affecting change here. Everything else is behavior-neutral while `ModelConfiguration` is `NULL`.

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

- 9fc0e2d: Carry an authored realtime voice to any provider, not just OpenAI — both override builders filed the voice under a hardcoded `openai` provider key, so a session resolving to ElevenLabs, Gemini, Inworld, AssemblyAI or HuggingFace silently got nothing: the setting stayed visible in the effective config and never reached a driver. On the default-model path the framework picks the vendor itself and never disclosed which, making a provider-keyed voice unauthorable rather than merely wrong. Adds the provider-agnostic `realtime.voice.default.voice` slot, filed onto whichever driver resolves — every realtime driver already reads the same neutral `voice` bag key by design (ElevenLabs maps it to `tts.voice_id` on the wire), so no per-driver accessor is needed. Precedence is per-key: the agnostic value wins `voice` while a matching `providers.<key>` bag still contributes its other settings, so a runtime pick beats a vendor-pinned value in agent metadata. With no agnostic voice authored, behavior is unchanged. Also ends the silence around it — the mint log now carries the resolved driver and the voice that reached it, both realtime surfaces log when authored provider bags matched nothing, and the resolved `DriverClass` is surfaced to the browser on `StartRealtimeClientSessionResult` — and consolidates three byte-identical copies of the vendor-selection walk into one `SelectRealtimeVendorForModel`.

  Minor rather than patch because the change is additive to the public API: `SelectRealtimeVendorForModel`, `RealtimeVendorSelection`, `MatchProviderVoiceSettings` and `WarnOnUnmatchedProviderVoice` are newly exported from `@memberjunction/ai-agents`, and `RealtimeClientSessionPrepResult` / `StartRealtimeClientSessionResult` gain `DriverClass`.

  Three compatibility notes, in rough order of how likely they are to bite:
  1. **Deploy the client and server together.** A new `@memberjunction/ng-conversations` against an older MJAPI silently drops a picked voice for **every** provider including OpenAI, because the older server's `normalizeVoice` does not carry `default.voice` through the cascade — a regression of currently-working behavior, so a same-version bump is not enough if the two deploy independently. The reverse (old client, new server) is safe: the `providers.openai` shape is still honored.
  2. **The agent-type `ConfigSchema` reaches a database only via `mj sync push`.** The schema gains the agnostic slot and marks `providers.*.voiceId` deprecated (no driver has ever read it). Until that push runs, authoring `realtime.voice.default.voice` in an agent's `TypeConfiguration` **fails the save** — the old schema validates `voice.default` with `additionalProperties: false`. Runtime overrides are unaffected; they bypass that validator.
  3. **Bridge hosts that supply a voice without pinning a model now forward that id to whatever vendor wins the priority walk.** `BridgeRealtimeSessionContext.RealtimeVoice` is host-supplied (LiveKit/Twilio/Teams) and independent of the model pin, so a previously inert misconfiguration becomes reachable: an OpenAI voice name like `echo` reaching ElevenLabs is sent as `tts.voice_id`, and an invalid voice id there fails the session rather than degrading. An agnostic voice is only as portable as the id itself — pin the model alongside the voice, or author per-vendor ids under `providers.<key>`.

  One gap found here was closed separately in the same release: **Gemini** consumed the neutral `voice` key no further than its config object — `buildConnectConfig` assigned the bag onto a `LiveConnectConfig` with no `voice` property, so the value was dropped before the wire. `@memberjunction/ai-gemini` now maps it to `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName` on both topologies (#3721). Separately, only `OpenAIRealtime`, `xAIRealtime` and `HuggingFaceRealtime` declare `SupportedVoices` (HuggingFace returns none) and the native picker's dropdown is gated on that list, so for the vendors this unblocks the voice is reachable through agent metadata and programmatic hosts rather than the picker.

- 4cdfdcf: **A skill can bundle an action without putting it into the agent's run.**

  Bundling an action into a skill (an `MJ: AI Skill Actions` row) put the action into the activating
  agent's run — described to the model and executable — for the rest of the run. A skill whose reply
  carries a menu (buttons the application wires to an action, pressed by the person on the next turn)
  wants the association without the model ever calling the action on its own mid-conversation (#4226).
  - `AISkillAction.ExposeToModel` (BIT, NOT NULL, default 1). `1` is today's behaviour. `0` keeps the
    action bundled — SKILL.md export, tooling — but out of the run: not described to the model and not
    executable by the agent; application code invokes it through the Actions API.
  - `AIEngineBase.GetSkillExposedActionIDs(skillID)` returns the `ExposeToModel` subset;
    `BaseAgent.enableSkillCapabilities` pushes that subset onto the run. `GetSkillActionIDs` (every
    bundled action) is unchanged.
  - SKILL.md round-trips the flag: the frontmatter gains an optional `codeOnlyActions` list (names, a
    subset of `actions`), written on export for rows with the flag off and applied on import; a file
    without the key leaves surviving rows' flags as they were.

  Migration `V202609111449__v6.1.x__Skill_Action_Expose_To_Model.sql` (additive, defaulted; existing
  rows keep today's behaviour).

- 29c3dc8: A failed upload reports the driver's real cause instead of "Storage upload failed."

  A realtime recording upload surfaced to the client as `{"Success":false,"FileID":null,"ErrorMessage":"Storage upload failed."}` while the actual cause was Google's, and was actionable: _"Service Accounts do not have storage quota. Leverage shared drives instead."_ Four layers each discarded it — the Drive driver's catch reduced the SDK error to a bare `console.error` and `return false`; `FileStorageEngine.UploadFile` threw a path-only generic; `storeRealtimeRecording` logged and then returned `string | null`, so the reason it had just logged could not leave; and the resolver reported the generic. The layer people see is the fourth; the information died at the first.

  **`PutObject`'s `Promise<boolean>` contract is deliberately untouched.** `FileStorageBase` documents boolean-means-success and every driver implements it, so making it throw would break every driver and caller. Every `return false` / `return true` in the driver is byte-for-byte what it was — this is only about not _erasing_ the cause on the way up.

  The Drive driver gains `describeGoogleApiError`, which extracts named fields (`code`, `message`, `errors[].reason`, `errors[].message`, `response.data.error.message`) — an allowlist rather than a dump, because MJStorage ships `rawErrorLogging.guard.test.ts` forbidding drivers from logging a vendor error wholesale. The four catches that rethrow a generic now append the cause, matching the precedent already in that file at `CreatePreAuthDownloadUrl`.

  **Breaking for direct callers of `storeRealtimeRecording`** (hence minor on `@memberjunction/ai-agents`): it returns `{ FileID, ErrorMessage }` rather than `string | null`. A caller that used the returned id directly now reads `.FileID`; the null check becomes a check on `FileID`, with `ErrorMessage` carrying the reason that was previously unreachable.

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

- 394d276: Phase 8 of the unified workflow DAG engine program (plan: PR #3456) — the remaining Track D mechanisms, plus the observability decision that had been open across three reviews.

  **A live signal from the dispatcher.** The choice was between claim-store cache invalidation and semantic frames; frames won because a consumer should render "step 3 of 7 running" from the event itself rather than re-reading Task rows and diffing them to guess what changed. `TaskGraphObserver` emits `TaskStarted` / `TaskCompleted` / `TaskFailed` / `TaskBlocked` / `TaskAwaitingHuman` / `GraphSettled`, and MJServer publishes them on a new `taskGraphFrames(parentTaskId)` subscription.

  Addressed by **`ParentTaskID`, deliberately not by session**: a durable graph outlives the tab that submitted it and may be started by a schedule with no session at all, so keying on the graph means "watch this workflow run" works for whoever is permitted to see it, whenever they arrive — including after a refresh, which a session-keyed push cannot survive. Emit points sit where the fact is already true: `TaskStarted` after the claim is held, `Task{Completed,Failed}` only once the guarded write lands, `GraphSettled` outside the continuation's once-only CAS. The observer is optional and its errors are swallowed in one place, because a frame is commentary on work and must never stall or fail a graph.

  Delivery **fails closed**. A `parentTaskId` is discoverable, so without a connection-identity check anyone holding one could watch another user's workflow, per-step error messages included. Ownership rides on the frame — resolved once per graph and memoized, since a subscription filter runs per frame and synchronously, and a database round trip there would make watching a run cost more than running it. It lives in the parent's durable metadata rather than a column because `Task.UserID` already means "the person this task waits on"; setting it on a parent would make every graph look like a human task.

  **`MAX_REINVOKE_DEPTH` finally compares against a real number.** Phase 3 shipped the cap and Phase 4 shipped the metadata carrying `reinvokeDepth`, but the value was permanently zero: `Submit` reads it from its caller, `BaseAgent` never passed one, and a reinvoked agent had no way to know it _was_ a continuation. Phase 7 therefore left `Reinvoke` unimplemented on purpose — a cap that never fires is worse than one continuation mode being unavailable, because the failure mode is an unbounded chain of real agent runs. `AIAgentRun.ContinuationDepth` closes the loop: the deliverer stamps depth + 1 on the run it starts, `BaseAgent` passes its own run's depth into any graph it submits, and the chain is bounded. `Reinvoke` degrades to posting whenever it cannot restart a turn (no submitting run, run or agent unloadable) and never throws, since the dispatcher calls it inside the delivery CAS.

  **Scheduled jobs answer what to do about fire times they missed.** `MissedRunPolicy` — `RunOnce` (default), `RunAll`, `Skip`. The default is not a preference: `updateJobStatistics` already computed the next run from _now_, so a job whose `NextRunAt` had passed ran once and jumped forward. That is `RunOnce`, and defaulting to `Skip` would have silently stopped every existing job in every install from catching up. `RunAll` is safe to offer because its next run is computed from the occurrence just consumed, so a week-long outage walks one occurrence per poll tick rather than firing 168 jobs at once. "Missed" is defined cron-relatively — a _later_ occurrence has also come due — rather than by a grace window, which would misjudge a per-minute job after a short pause and a monthly job that is a week late in opposite directions.

  The decision **fails open** throughout: it can only ever withhold a run the schedule already said was due, so an unparseable cron or a helper returning anything but a date lets the job through. And it is **synchronous** on purpose — it runs immediately before lock acquisition, where an added microtask reorders against the sweep's fire-and-forget cleanup; only the skip branch writes, and that is awaited separately.

  **One-shot scheduling needed no new schedule shape.** `Status='Expired'` had been a declared value that nothing ever set. `isJobDue` already refused a job past its `EndAt`, so such a job stopped running on its own — but stayed `Active` forever, permanently inert, and kept driving `UpdatePollingInterval`, so "cron at T plus `EndAt` just after T" left the whole scheduler polling at that job's cadence for a job that would never run again. Retiring it is the fix; "run once at T" was already expressible. Deliberately narrow: only `Active`/`Pending` transition, because a `Paused` job was put there by a person, and only `EndAt` triggers it, since a cron always has a next occurrence and inferring exhaustion would be guessing.

  **IT71 grows to 18.** TG17 asserts the new schema through the ORM rather than trusting the migration — the pair that drifted in Phase 4 when a migration applied but CodeGen ran against a stale definition. TG18 saves a job with `RunAll`, reloads it to prove the value survives the CHECK constraint, and saves a policy-less job to prove the `RunOnce` default.

- 1c0d586: Flow agents now execute on the durable task-graph dispatcher instead of walking their own graph
  inside an agent run.

  `FlowAgentType.DetermineInitialStep` compiles the agent's steps and paths into a `TaskGraphSpec` and
  returns a `Tasks` step; `BaseAgent.executeTasksStep` submits it and detaches. From there a workflow
  is `Task` rows owned by a server-side dispatcher, with the same claiming, conditions, skip cascade,
  retry and failure semantics as any other graph — one traversal engine rather than two that drift.
  The in-run walker is retained as the reference implementation the compiler is checked against, but
  refuses at its single choke point, so a workflow that runs at all provably ran on the new engine.

  Also in this change:
  - `Task` gains `StepType`, `PromptID` and a typed `Configuration` bag (`ITaskStepConfiguration`)
    carrying kind-specific settings, the payload mappings, the execution policy and the author's
    canvas layout. `CK_Task_Assignment` now counts `PromptID`.
  - Payload mapping semantics are lifted into `@memberjunction/ai-core-plus` so both engines share one
    dialect — the `*` wildcard, case-insensitive result lookup, `[]` append, `$message` fields, and the
    `static:` / `payload.` / `data.` / `context.` prefixes.
  - `ForEach` and `While` steps run through a new `TaskLoopExecutor`: bounds (`maxIterations: 0` means
    unlimited), `continueOnError`, delay, and parallel batches that keep results in **iteration** order.
  - New deterministic DAG layout (`LayoutTaskGraph` / `LayoutGraphNodes` / `GraphLayoutBounds`) — a
    `Task` row has no position columns, so a run view previously drew every node on the origin.
  - A settled graph credits its spending back to the submitting run through the `…Rollup` columns on
    `AIAgentRun`, which existed since v3 and were never written. `TotalCost` keeps its current meaning.
  - `TaskGraphActionRunner` returns a flat, name-addressable result instead of an `ActionParam[]`, so
    output mappings resolve and branch conditions can be evaluated.
  - `GetTaskGraphSubmitter()` now honours its documented contract and returns `null` when no
    durable-execution package is loaded, instead of an instantiated abstract base.

  New guide: `guides/WORKFLOW_AND_TASK_GRAPH_GUIDE.md`.

### Patch Changes

- 634aa8c: Let an agent tell the framework whether its payload is a **new** artifact or a **new version** of an existing one, instead of leaving that to be inferred at the write.

  `ProcessAgentArtifacts` chose its target from continuity signals alone: an explicit `sourceArtifactId`, else the previous artifact on the conversation detail. Both signals say only "this conversation already has an artifact" — neither distinguishes a restyle of the current component from a request for a different one. So an agent that produced an unrelated deliverable mid-conversation had it saved as version N of whatever came before (Skip-Brain #529).

  `BaseAgentNextStep` and `ExecuteAgentResult` now carry an optional `ArtifactDirective`: `create-new`, `version-source` (with an optional `targetArtifactId`), or `suppress`. `planArtifactTarget()` is exported from `@memberjunction/ai-agents` so the resulting precedence is testable without a database.

  Precedence is deliberately narrow — the directive is advice from an agent, not a command, and is consulted only **after** the checks that already existed, so it can never widen what a caller or an agent's configuration refused:
  1. `createArtifacts === false` → nothing written; a directive cannot re-enable creation.
  2. `ArtifactCreationMode: 'Never'` → nothing written.
  3. The directive.
  4. **No directive → the historical chain, byte-for-byte unchanged.** Every existing agent is unaffected.

  `suppress` covers everything the step would persist as an artifact — the payload, and the artifacts wrapping any generated files or media. The run's media audit rows are still written: suppression governs what the user is shown, not lineage.

  **Every field of a directive is model output, and is treated as such.** A named `targetArtifactId` is honored only if it is a UUID-shaped string naming an artifact that exists AND that the run's user either owns or holds an explicit `CanEdit` grant on — otherwise the run falls back to the caller's `sourceArtifactId`, then to the historical chain. Without the ownership test, an agent could name any artifact id in the instance and have the run's payload appended to it, because `vwArtifacts` has no per-user predicate and a successful load proves only that a row exists. Existence and authorization resolve in one `RunViews` round trip rather than through `BaseEntity.Load`, which throws on a permission denial or a transient fault where this path needs a fallback. A directive's `name` is trimmed and clamped to its 255-character column rather than rejected, so an over-long model-written title costs a truncation instead of the entire artifact. Provenance ('did the agent name this id, or did the caller?') is carried on the plan instead of inferred by comparing values, so an agent echoing the run's own source id no longer routes a caller-supplied id through the model-output guards — nor lets a rejected id reappear through the fallback. A `targetArtifactId` that is not a string is discarded by `planArtifactTarget` itself, at the boundary that introduces it, so the plan's id is always a string by the time the runner vets its shape, existence and authorization; the discarded value is logged.

  A `behavior` this consumer cannot parse discards the **whole** directive, not just its targeting: `name` and `description` go with it, and the artifact falls back to the extracted-name pass exactly as it would with no directive at all. Trusting the free-text half of an object whose one enumerated field is unparseable would mean a directive the log says is being ignored still renaming the artifact.

  Ids reaching a `RunView.ExtraFilter` are now escaped **where the filter is built** rather than at one audited call site, so `GetMaxVersionForArtifact`, `CheckForDuplicateVersion` and `FindPreviousArtifactForMessage` are safe for every caller, including the `sourceArtifactId` that arrives from the GraphQL boundary. `ExtraFilter` has no parameterized form and the upstream clause validator permits `OR`, so this was a real predicate-injection surface.

  An artifact directive governs the payload of the agent that issued it and never crosses the parent/child boundary. A sub-agent's directive is logged and dropped rather than inherited by the parent's terminal step, which carries a merged payload and would otherwise be written onto an artifact the child named. Conversely, the two places that rebuild an agent's OWN terminal step — the client-tools `terminateAfterExecution` branch and `executeChatStep` — now carry the directive instead of dropping it.

  Two supporting changes ride along:
  - **`PayloadManager` no longer leaves data-free shells in arrays.** When a sub-agent returns a _shorter_ array than the parent holds, every scalar under the vacated index is deleted — and `_.unset` removes leaves while leaving the containers that held them. The result is an element that carries no data but is not key-free, which the previous `Object.keys().length === 0` cleanup could not see. Such elements are now pruned by a sweep **scoped to the indices this merge actually vacated**, so the recursive emptiness test cannot reach elements the merge never touched: a legitimate all-null record elsewhere in the payload, or one whose deletion the upstream-path guardrail refused, survives exactly as before. The global key-less-`{}` cleanup is unchanged. The scoped sweep also closes the hole `_.unset` leaves when a scalar array is shortened, and prunes a fully vacated NESTED array — a latent defect that predates this work and that the recursive test now covers. Before this, a sub-agent legitimately removing one item from a structured array left a nameless residue that downstream consumers read as a real record; for component pipelines that meant a crash at the last step, after the full generation run.
  - **`ng-conversations` stops guessing which artifact to open.** The chat area snapshots artifact versions before a turn and diffs after, with _created_ beating _bumped_, so a newly created artifact wins the panel over one that merely gained a version — including when the panel is already open on something else, which the previous `!showArtifactPanel` gate suppressed. Because the panel is no longer gated on being closed, the decision is applied only while the conversation it was computed for is still on screen and only while the user has not made a selection of their own in the meantime; a run that finishes during a conversation switch or a scroll-up no longer mistakes artifacts arriving in the map for artifacts the run created. A creation is also chosen by the newest version's timestamp rather than by whichever conversation detail the map happened to iterate last, and artifact ids are grouped as UUIDs wherever they are deduplicated, so the two casings the two database engines return can no longer render one artifact as two cards. Dead `targetArtifactVersionId` plumbing in the message input is left intact on this line, where the Check Sage Intent prompt populates it.

  The artifact viewer no longer loads twice per open or refresh: switching artifact and version together delivered both inputs in one change-detection pass and its two independent `ngOnChanges` branches each ran a full load, the second without a cancellation token. Its refresh guard also compares artifact ids as UUIDs now, so a refresh is no longer dropped when the two sides picked the id up from differently-cased sources.

- 834f8d7: Fix a `TypeError` that could kill an agent mid-run during context assembly, and take down scheduled-job dispatch entirely (`__mj_CreatedAt?.getTime is not a function`, `job.NextRunAt.getTime is not a function`).

  Two defects, one crash:
  - **`BaseEngine.OnExternalCacheChange` poisoned `entity_object` caches (the root cause).** When a cross-server cache-change event carried a payload, its rows — plain JSON objects, since cache payloads are serialized — were assigned straight into the engine property. For a config whose effective `ResultType` is `entity_object` (the default), that silently replaced the array's `BaseEntity` instances with plain objects, so `BaseEntity`'s coercing accessors were bypassed and a date field declared `Date` held a raw ISO string. Rows are now materialized via `TransformSimpleObjectToEntityObject` — the same conversion RunView's own cache-hit path uses — before assignment, with `'simple'` configs still passing through untouched and any failure degrading to the pre-existing full reload. Because materialization is async, the payload branch now claims a refresh generation (`beginConfigRefresh`/`isLatestConfigRefresh`, as `LoadSingleConfig` already does) so overlapping cache events cannot commit out of order. This affects **every** engine with `CacheLocal: true`.
  - **Unguarded `Date` method calls on those fields (the crash sites).** Optional chaining does not protect them — `"…"?.getTime` is `undefined`, and calling it throws. A new `ToEpochMs(value)` helper is exported from `@memberjunction/global` (a pure date utility — it needs no entity or metadata concepts) and now backs every affected read across four engines: `AgentContextInjector.sortExamples`/`sortNotes`, `AIEngine.fallbackGetNotesFromCache`/`fallbackGetExamplesFromCache`, `ConversationEngine.sortConversations`, and the scheduling engine's `isJobDue` plus its `NextRunAt`/`EndAt` diagnostics. It also closes a latent issue in the previous form: an Invalid `Date`'s `getTime()` returns `NaN`, which `?? 0` did not catch, yielding an incoherent comparator.

  Two exposures worth calling out. `AIEngine.fallbackGetNotesFromCache` is reached whenever the note vector service is uninitialized or a query embedding fails, so semantic retrieval with real input text could crash too — not just the empty-input path. And `SchedulingEngine.isJobDue` throws on the _first_ job in the dispatch loop, so a poisoned cache stopped **all** scheduled jobs from running, on every poll, until the cache reloaded.

  `isJobDue` also had a silent variant of the same bug: `evalTime < job.StartAt` does not throw on a string — relational operators coerce toward numbers, an ISO string yields `NaN`, and every comparison is false — so `StartAt`/`EndAt` activation windows silently stopped being enforced and a job could fire outside its range with nothing in the logs. Those comparisons now go through `ToEpochMs` as well.

  Making the cache-event path work also exposed a filtering gap (caught in review): `SchedulingEngineBase` loads `MJ: Scheduled Jobs` unfiltered and applies its Active-only invariant in memory, but only re-applied it on entity events — not after a cross-server cache event, whose payload carries every row. In a multi-instance deployment, one server's engine load could therefore hand another server's dispatch loop Disabled/Paused/Pending jobs. The engine now re-applies the filter (and notifies `JobsChanged$`) after `OnExternalCacheChange`, and `isJobDue` independently refuses non-Active jobs so dispatch can never depend on the array staying pre-filtered.

- 79483bf: A bridged realtime seat now runs its OWN agent class instead of silently falling back to plain BaseAgent (#4111)

  `CreateBridgeRealtimeSession` picked the agent class with `agent.DriverClass || agentType?.DriverClass`.
  `AIAgentType.DriverClass` names a **`BaseAgentType`** subclass — the three shipped values are
  `LoopAgentType`, `FlowAgentType`, `RealtimeAgentType` — while the key this call needs is a
  **`BaseAgent`** one. Separate ClassFactory registries, matched by exact key against the base class
  name, so the fallback could never resolve: dead code that looked alive. It bit the common case,
  because most agents declare no `DriverClass` of their own (that is what makes an agent data rather
  than code).

  With no registration and no `@RequiresSubclass` marker, `ClassFactory` returns an instance of the
  base itself, so every such seat silently ran the plain `BaseAgent`, dropping the subclass behaviour it
  was configured for — one generic assistant voice for every seat in a room meant to hold distinct
  characters. Both guards below the call were unreachable: `if (!instance) throw` because an instance is
  always produced, and `if (!driverClass) throw` because the wrong-registry lookup always produced a
  truthy key. The only signal was a single `ClassFactory` `console.warn`, deduped per base+key and
  capped at three per base — effectively invisible in a busy log.

  The agent's own `DriverClass` is now used when it has one, resolved through `TryCreateInstance` so an
  unregistered key raises instead of installing a base-class fallback that answers plausibly. An agent
  with no `DriverClass` gets `new BaseAgent()` — constructed directly, deliberately not
  `CreateInstance(BaseAgent, null)`, because a null key makes `GetAllRegistrations` skip the key filter
  and return the highest-priority registered subclass, i.e. an arbitrary agent. The unreachable
  `no DriverClass` throw is gone.

  Dropping the agent-type fallback loses nothing: agent-type behaviour is resolved separately inside
  `BaseAgent` via `BaseAgentType.GetAgentTypeInstance`, so a seat on the plain `BaseAgent` still gets
  Loop/Realtime type semantics.

- f6a4341: The three live-database harness scripts (`memory-write-smoke.ts`, `contextcrush-smoke.ts` in ai-agents; `entity-action-workflow-integration.ts` in actions) decide TLS for Azure SQL with an anchored host check (`endsWith`) instead of a substring match. Not part of the published output; recorded for the release notes.
- 8206993: `configOverridesJson` names the keys it is about to ignore.

  `StartRealtimeClientSession` accepts `configOverridesJson`, gates it behind the `Realtime: Advanced Session Controls` authorization, and threads it through `PrepareClientSession` — but `normalizeConfig` reads only `merged['realtime']` and returns an object built exclusively from that section. Every other top-level key was discarded with no error, no warning and no log. Authorization-gating a field implies the payload matters, which is what made the silence expensive: a caller sending `{"realtime":{…},"caliber":{…}}` had it serialize, pass the gate, cross the wire and vanish, with its own tests correctly asserting it built the payload right. Every such session ran on default configuration.

  `realtime-coagent-config.ts` is deliberately framework-free — no DB, no metadata provider, no logging imports, every function a pure transformation — so it does not learn to log. It reports the drops as data:

  ```typescript
  export type IgnoredRealtimeConfigReason =
    | "unknown-section"
    | "unknown-key"
    | "wrong-type";
  export interface IgnoredRealtimeConfigKey {
    readonly path: string;
    readonly reason: IgnoredRealtimeConfigReason;
  }
  export function FindIgnoredRealtimeConfigKeys(
    overridesJson: string | null | undefined,
  ): readonly IgnoredRealtimeConfigKey[];
  export const REALTIME_CONFIG_SECTION_KEYS: readonly (keyof RealtimeConfigSection)[];
  ```

  and `assertRuntimeOverridesAuthorized` — which already logs — does the talking.

  **Warns rather than rejects.** Rejection is stricter and defensible in a major; in a patch it would turn a previously-accepted payload into a hard error for callers that cannot be seen from here. The reasoning sits at the call site so the next reader knows rejection was considered.

  **Reported after the authorization decision, not before.** A payload that fails the gate already throws a structured error, so reporting drops for a request that never ran would be noise. Silence only ever existed for _accepted_ payloads.

- 199eb2b: Debug a Flow agent from the Agent form Run dialog. Debug starts the graph paused at Submit (`$.debug.paused` on the parent row — Pause-after-submit races the dispatcher). The harness and Runs console share a VS Code-style icon toolbar and a red-circle breakpoint toggle. The invocation-envelope sanitizer from #3783 is preserved.
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

- b9de989: **An action's file output can say it is a download: `FileOutputRef.visibility`.**

  MJ turns every action `FileOutput` into an artifact with `Visibility = 'Always'`, hard-coded on the
  file path. For a file the user asked to download and will open elsewhere — an exported CSV, a PDF —
  that produces a message card whose viewer is empty for types with no plugin, and the host has no
  way to say otherwise short of rewriting the artifact after the fact.

  `FileOutputRef` gains an optional `visibility` (`'Always' | 'System Only'`, parsed by
  `ParseFileOutputRef`, ignored when malformed), and `AgentRunner` threads it to the artifact it
  creates for the file, defaulting to `Always` as before. `System Only` is the chat's existing switch:
  the artifact, its version and its download URL exist, but the message shows no card unless the host
  opts in with `showSystemArtifacts`. First-adopter feedback.

- a723521: Store agent-generated media in configured file storage, not inline

  `CreateMediaArtifacts` wrote every image, audio and video artifact inline as a
  `data:<mime>;base64,...` string in `ArtifactVersion.Content`, regardless of whether a file storage
  account was configured — while `ProcessFileArtifacts`, handling file outputs a few lines away,
  honoured it. Media now takes the same route: upload to the resolved storage account when one is
  configured, and fall back to inline when it is not, or when the upload fails.

  This was an omission rather than a decision. The method was added to migrate media off the
  deprecated `ConversationDetailAttachment` table and inherited that path's inline behaviour; the
  storage branch had landed in its sibling six weeks earlier. Both call the same
  `createArtifactWithVersion` helper, so the two looked consistent. Nothing downstream required
  inline media — `gatherConversationArtifacts` and all three Angular viewers already branch on
  `ContentMode === 'File'`.

  The cost was silent: a generated image is routinely several megabytes, and inline storage puts that
  base64 in a SQL column and ships it in full on every read of the row. In one production database,
  35 images accounted for 129 MB of `ArtifactVersion.Content`.

  `CreateMediaArtifacts` takes the resolved storage account as a new optional final parameter, so
  existing callers are unaffected — omitting it falls back to the first active account.

- 5f33ca8: Slack and Teams adapters: first production bring-up

  Defects found running the adapters against a real MJ app — one Slack app per agent
  (Socket Mode) plus Teams via Bot Framework.

  **Startup and identity**
  - Users are resolved via `UserCache.Instance`. `new UserCache()` returned the shared
    singleton and then re-initialized it empty, so no messaging extension could start
    and the whole server lost its user cache until the next refresh.
  - Running one platform app per agent no longer causes bots to cross-talk in shared
    channels: thread replies are answered only by the addressed bot, bot-authored
    messages are excluded from history and thread affinity, and a new
    `DisableDelegation` setting stops a pinned bot from handing off.
  - A bot recognises its own replies. Slack publishes two identifiers for one bot and
    returns the `bot_id` (with no `user`) for any message posted with a username
    override — which every agent reply uses, since per-agent identity is the point of
    one app per agent. Comparing only against `auth.test()`'s `user_id` therefore never
    matched, so the thread gate above declined threads the bot was actively holding and
    the agent lost its own turns from context.

  **Delivery**
  - Generated files and images are delivered as real attachments. Adapters may
    implement `uploadMediaOutputs` (Slack does, and needs the `files:write` scope);
    inlined `data:` URIs are decoded; and the run's canonical `fileOutputs` are used
    rather than depending on the model to inline them.
  - A non-public button URL no longer fails the entire Slack message — it degrades to
    a link, so a localhost `ExplorerBaseURL` stops suppressing replies outright.
  - The artifact link points at the file the agent produced rather than its internal
    payload, and `System Only` artifacts are no longer linked. Callers relying on
    `artifactInfo` being the payload artifact now receive the file artifact when a run
    produced one.
  - `ng-artifacts`: downloading a file artifact returns real bytes under its own MIME
    type and filename, instead of a `.txt` file full of base64.
  - `ng-explorer-core`: a conversation deep link opened cold now honours the URL rather
    than restoring the previously-viewed conversation.

  **Slack**
  - Interactivity works in Socket Mode; previously every button and modal was inert, so
    human-in-the-loop form flows dead-ended.
  - Message text is capped at the real `text` limit rather than the block-payload limit,
    which was failing long responses with `msg_too_long`.
  - Modal placeholders are truncated to 150 characters; an over-long one failed the whole
    `views.open` and left a button that looked dead.

  **Teams**
  - `MentionedAgentNames` is populated, so a named agent is reachable at all — previously
    every Teams turn ran the default agent.
  - Response forms route the answer back to the agent that asked, via `mj_agent`.
  - Buttons are built only over `http:`/`https:` URLs. Teams silently ignores `data:`/`blob:`/`file:`
    (so "Download document" was dead by construction whenever MJ inlined the artifact) and hands
    unknown schemes such as `javascript:` or `ms-msdt:` to the OS URI handler, so the check is an
    allow-list. Dropped buttons become a note pointing at the artifact link; localhost stays allowed.
  - A response form's submitted agent name is validated against the known agents before it is used
    to route, rather than trusted from the client-controlled submit payload.
  - Deep links no longer assume `resourceId` is present, now that a Record can be
    addressed by `keys`.

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

- 7a630ba: Three writes take an object the CALLER built and stringify it straight into a database row — an agent run's `Data` and `StartingPayload`, and a task graph's invocation envelope — and all three take it from `ExecuteAgentParams`, whose own documentation says the value may be a class instance holding "external service credentials or connection information". One of the three was guarded, after it killed agent runs at submit time with `Converting circular structure to JSON`. The other two were not.

  That combination fails two ways, and the second is worse: it **throws** on anything holding a socket, a pool or a provider, and it **leaks** when serialization happens to succeed, writing whatever the object held into a row that outlives the run. The first is loud and gets fixed; the second is silent and does not.

  `SanitizeForPersistence` / `StringifyForPersistence` now carry the rules in one place, and all three writes use them. JSON data survives (primitives, arrays, plain objects, `Date` as ISO, anything with `toJSON`); class instances, functions, sockets and cycles are refused whole rather than unwrapped — walking a socket's own properties would "work" and would persist its internals, which is the leak. Every drop is reported by path and logged, because a value that silently vanished is the failure one layer down: a reader hunting a field the writer discarded, or a condition reading absent-data and taking a branch nobody can explain.

  Also: the flow differential suite gains its first **failure oracle**. It could not express `'edges'` semantics — the dialect where a flow routes around its own failure — because the simulator treated "which origin statuses may decide an exclusive group" as a constant where the dispatcher treats it as the graph's dialect. With that modelled, a fixture whose step fails and whose recovery path runs is now compared walker-against-compiled, and the comment states why `'block'` has no oracle by construction: the walker routes on failure, so there is nothing to compare a compiled `'block'` graph against (IT74's TX19 pins that side instead). And the all-`Optional` node's wave-1 behaviour — the consequence the spec doc calls out as surprising and nothing asserted — is now pinned, so an OR-join implemented later reads as a deliberate semantic change rather than a bug fix.

  **Two behaviour changes worth knowing about, both deliberate.** A class instance is now refused _whole_ and reported by path, where `JSON.stringify` would have persisted its own enumerable properties — so an agent whose payload legitimately is a class instance will find that payload dropped rather than partially recorded, with the path named in the log. Dropping loudly is the intended posture: the alternative persists whatever the object happened to hold. And `toJSON` is no longer consulted for anything but `Date`, because deferring to a method on the object being guarded hands the decision back to the party the module does not trust — a `toJSON() { return {...this} }`, a common convenience, published its own credentials silently and with an empty `DroppedPaths`.

  Also worth knowing: sanitizing **invokes getters**, once per property, so a payload holding lazily-opened resources can open one by being written down. Refusing class instances removes most of that surface, since their getters are never reached.

- c11f8c6: **The skill principal of a Scoped Search is bound to the agent run, not to a model-authored parameter.**

  `BaseAgent.ExecuteSingleAction` now stamps `Context.ActiveSkillIDs` — the skills the run has actually
  activated so far — onto every action call, alongside the existing `AgentID`. An empty array means
  "inside an agent run, with no skill active", which is a different fact from having no agent context.

  `Scoped Search` reads it. Inside a run, a named `AISkillID` that the run never activated is refused with
  `INVALID_PARAM`, and when exactly one skill is active and none is named, that skill becomes the
  principal. Outside a run the explicit input is unchanged. The reason is the one the BC-SaaS
  capability resolver already states for the active skill: it "must be server-derived, never
  caller-supplied — a model naming a skill would let it widen its own reach". Since a skill's
  `SearchScopeAccess` and its scope grants can widen a bound, and inside a Loop agent the `AISkillID`
  input is filled by the model, the run has to be the authority. With several skills active and none
  named, no default is picked and the search proceeds with no skill principal (logged as verbose).

  Also: `_activatedSkillIDs` and `_skillInvocations` on `BaseAgent` are now `protected` (with a
  read-only `ActivatedSkillIDs` getter), so a subclass that layers its own activation policy — a
  tenant licensing check, an entitlement model — can see what actually activated without intercepting
  `enableSkillCapabilities`. First-adopter feedback from Betty, where the search sub-agent's principal
  was being set by hand from a re-derived copy of this state.

- 35ace7c: SKILL.md: a known list key in block form with no items (`codeOnlyActions:` with its names deleted) now parses as an explicit empty list instead of an absent key, so removing the last `codeOnlyActions` name and re-importing puts that action back into the agent's run rather than silently carrying the old code-only flag. `codeOnlyActions` warnings now quote the name the author typed instead of the resolved GUID.
- 0db6105: **One seam for an application's skill-availability policy: `BaseAgent.filterAvailableSkills`.**

  MJ decides whether a skill is available in four sites — the prompt catalog the model is offered,
  the validation/execution of a model-initiated `Skill` step, and the pre-activation of a user's
  explicit `/skill` request — each through MJ's own gates (AcceptsSkills, Status, agent grant, user Run
  permission, the ActivationMode double gate). An application with a policy MJ has no table for — a
  tenant licensing model, a per-organization entitlement — could previously hook only the requested
  path (by overriding `preActivateRequestedSkills`), so a self-activating agent would be OFFERED a skill
  the policy would then refuse.

  `protected async filterAvailableSkills(skills, purpose, agent, contextUser)` is now called at all
  four sites, after MJ's gates and before anything activates. The default is the identity. The new
  `SkillAvailabilityPurpose` type (`'catalog' | 'auto-activation' | 'requested'`) says why it is being
  asked. Overrides return a subset, cache their lookups (the catalog is rebuilt every prompt turn), and
  fail closed. Guide §1.2b documents it. First-adopter feedback: an entitlement gate that could cover requested activation only.

- d7feeae: Stop Explorer from showing "Unknown error" with a stuck Running timer when a Skip/sub-agent transport path fails. Pass the real error through invokeSubAgent, keep In-Progress when the agent may still be running, and persist Failed/Error on the run and conversation detail if executeAIAgent throws.
- 6d7d3da: Task-graph engine hardening, Round 3 — the residual gaps in Round 2's own fixes, found by a three-track adversarial review of the merged engine. The pattern this round is not new seams but **incomplete closures**: six Round 2 fixes worked at their own anchor and left the layer just outside it open.

  **R3-1 — an early finish could discard a step that was already running.** R2-10 moved the sibling skips after `CompleteClaimed` on the premise that "siblings are Pending and unclaimed until the skip lands". They are not: task execution is not awaited, so the deciding instance's own poll tick runs concurrently with its skip loop, and the decision existed only in that instance's memory — no claim filter anywhere could know about it. A sibling claimed mid-loop had `In Progress` reverted to `Skipped` and its claim cleared _while its agent body ran_: side effects fired, completion refused, output discarded, graph settled `Complete` with nothing recording it. The early finish now declares itself durably before mutating anything (so every instance's claim filter sees it) and every skip is a guarded single statement that refuses a task something else has taken.

  **R3-2 — R2-4 gated one dialect and left the other blind.** Under `failureSemantics: 'block'` — the spec default, so every agent-emitted graph — a `Failed` origin's ordinary conditional edge that read false was dropped, its target skipped rather than blocked, and the dropped edge severed the block cascade's forward walk. `Skipped` satisfies prerequisites, so a join fed by an independent healthy route executed downstream of an unhandled failure while the parent still rolled up `Failed`. R2-3 made this _more_ reachable, not less: a failed step rarely has output, so the null-safe envelope answers positive conditions with a confident false→drop where they previously threw→held visibly. `Cancelled` is now decided once and written into the spec: it never decides an ordinary edge under either dialect.

  **R3-3 — the documented `data`/`context` conditions never worked on the dispatcher.** They resolved against the origin _step's_ output rather than the invocation's parameters, so every `data.x` comparison read `undefined`, came out false, and silently took a branch the legacy walker never took — on every invocation, with the validator blessing the condition at the door. An invocation envelope is now threaded from the agent through submit, the parent's metadata, and condition evaluation. Round 1's carried-forward D2 lands as code. `stepResult.step` also now carries a status word rather than the step's name, matching what the flow engine actually exposes — the documented `stepResult.step === 'Success'` was false for every step before this.

  **Also fixed:** a `Stop()` during boot no longer has its timers reinstalled by `Start()`'s own continuation (R3-4); concurrent human-step notifications no longer leave a duplicate, un-answerable inbox item — collapsing them belongs to the sweep over _waiting_ steps rather than to the raise, because a task is notified exactly once and the raise never runs again afterwards, so a duplicate that outlived its own raise was previously unreachable by the only code that could have closed it (R3-5); the data-absence classifier is inverted so it cannot rot per operator — a `ReferenceError` is a broken guard, everything else is absent data (R3-6); the determinism tiebreak is ordinal rather than locale-collated, so two hosts with different `LANG` cannot resolve the same tie differently (R3-7); a transient cost-rollup failure defers delivery instead of claiming the marker and locking a wrong total in forever (R3-8); `Cancel`'s child writes are guarded statements that cannot overwrite an outcome that landed first (R3-9); nested cancel is type-scoped and its depth cap actually engages (R3-10); and a host with the dispatcher disabled now refuses graph submissions instead of accepting work nobody will run (R3-11).

  **Smaller:** `deliverContinuation` returned `undefined` after every successful delivery, costing a spurious settle pass per graph (C1, with `noImplicitReturns` now on for the package); the default dispatcher instance id gains real entropy, because host+pid collides under systemd, pm2 and containers — and a shared id defeats every ownership guard at once (C2); the run's rollup and lifecycle writes are column-scoped (C4); and the drain's heartbeat purge no longer races the registration it is purging (C5).

  **Wrap-up fixes (post-round):** the claim protocol's lease now lives entirely on the database clock — `ClaimExpiresAt` is written (`DATEADD` over `SYSUTCDATETIME`) and compared in SQL time, so NTP skew between dispatcher hosts can no longer reclaim a live lease or extend a dead one. And the `TaskGraph.Submit` remote operation stops dropping `reinvokeDepth` (the runaway-loop cap now counts remote continuation hops) and gains the R3-3 `invocation` envelope so `data.*`/`context.*` conditions work for MCP-submitted flows; the operation's metadata contract carries both fields (hence this release's `minor`).

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

- Updated dependencies [394d276]
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
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [4586215]
- Updated dependencies [22ec804]
- Updated dependencies [197fdf8]
- Updated dependencies [f6a4341]
- Updated dependencies [67e4c9e]
- Updated dependencies [71817db]
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
- Updated dependencies [0acf96e]
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
- Updated dependencies [9a29da4]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [88d751d]
- Updated dependencies [1748491]
- Updated dependencies [1100077]
- Updated dependencies [b6416f4]
- Updated dependencies [4cdfdcf]
- Updated dependencies [0db6105]
- Updated dependencies [d7feeae]
- Updated dependencies [7fefca2]
- Updated dependencies [a1a8989]
- Updated dependencies [bc45ded]
- Updated dependencies [28cd302]
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
- Updated dependencies [ae2baef]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [394d276]
- Updated dependencies [1c0d586]
  - @memberjunction/actions@6.1.0
  - @memberjunction/ai-core-plus@6.1.0
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/aiengine@6.1.0
  - @memberjunction/ai-engine-base@6.1.0
  - @memberjunction/ai@6.1.0
  - @memberjunction/storage@6.1.0
  - @memberjunction/search-engine@6.1.0
  - @memberjunction/ai-prompts@6.1.0
  - @memberjunction/ai-vector-sync@6.1.0
  - @memberjunction/actions-base@6.1.0
  - @memberjunction/ai-vector-dupe@6.1.0
  - @memberjunction/ai-reranker@6.1.0
  - @memberjunction/templates@6.1.0
  - @memberjunction/context-crush@6.1.0

## 6.1.0-edge.7

### Minor Changes

- a987913: Implement modality inheritance, AI Persona metadata catalog, and persona resolution across BaseAIEngine and realtime agents.
  - BaseAIEngine: implement modality inheritance according to Agent -> Model -> System -> Default precedence, honoring InheritTypeModalities, AIModelType default input/output modalities, and junction IsSupported = 0 / IsAllowed = 0 vetoes.
  - BaseAIEngine: cache and resolve AI Personas (GetModelPersonas, GetAgentPersonas, ResolveAgentPersona) incorporating agent style overrides and sequence ordering.
  - AIEngine: delegate persona and modality getters and helper methods to BaseAIEngine.
  - AIAgents: update GetRealtimeModelVoices to consult metadata personas first before falling back to driver SupportedVoices.
  - Metadata: seed canonical modalities (metadata/ai-modalities/) and initial personas (metadata/ai-personas/, metadata/ai-persona-vendors/, metadata/ai-model-personas/, metadata/ai-agent-personas/).
  - JSONType: simplify IAIPersonaVendorSettings to eliminate duplicate flat members and vendor namespacing.

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

- 4cdfdcf: **A skill can bundle an action without putting it into the agent's run.**

  Bundling an action into a skill (an `MJ: AI Skill Actions` row) put the action into the activating
  agent's run — described to the model and executable — for the rest of the run. A skill whose reply
  carries a menu (buttons the application wires to an action, pressed by the person on the next turn)
  wants the association without the model ever calling the action on its own mid-conversation (#4226).
  - `AISkillAction.ExposeToModel` (BIT, NOT NULL, default 1). `1` is today's behaviour. `0` keeps the
    action bundled — SKILL.md export, tooling — but out of the run: not described to the model and not
    executable by the agent; application code invokes it through the Actions API.
  - `AIEngineBase.GetSkillExposedActionIDs(skillID)` returns the `ExposeToModel` subset;
    `BaseAgent.enableSkillCapabilities` pushes that subset onto the run. `GetSkillActionIDs` (every
    bundled action) is unchanged.
  - SKILL.md round-trips the flag: the frontmatter gains an optional `codeOnlyActions` list (names, a
    subset of `actions`), written on export for rows with the flag off and applied on import; a file
    without the key leaves surviving rows' flags as they were.

  Migration `V202609111449__v6.1.x__Skill_Action_Expose_To_Model.sql` (additive, defaulted; existing
  rows keep today's behaviour).

### Patch Changes

- 35ace7c: SKILL.md: a known list key in block form with no items (`codeOnlyActions:` with its names deleted) now parses as an explicit empty list instead of an absent key, so removing the last `codeOnlyActions` name and re-importing puts that action back into the agent's run rather than silently carrying the old code-only flag. `codeOnlyActions` warnings now quote the name the author typed instead of the resolved GUID.
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
  - @memberjunction/ai-engine-base@6.1.0-edge.7
  - @memberjunction/aiengine@6.1.0-edge.7
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/storage@6.1.0-edge.7
  - @memberjunction/search-engine@6.1.0-edge.7
  - @memberjunction/ai-prompts@6.1.0-edge.7
  - @memberjunction/ai-core-plus@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/ai-reranker@6.1.0-edge.7
  - @memberjunction/ai-vector-dupe@6.1.0-edge.7
  - @memberjunction/ai-vector-sync@6.1.0-edge.7
  - @memberjunction/actions-base@6.1.0-edge.7
  - @memberjunction/actions@6.1.0-edge.7
  - @memberjunction/templates@6.1.0-edge.7
  - @memberjunction/context-crush@6.1.0-edge.7

## 6.1.0-edge.6

### Minor Changes

- 0d3094c: **A skill can stay active for a conversation, not just a run.**

  A skill activates for one run: `requestedSkillIDs` is a per-call input and the activated set dies
  with the run. That is right for a one-shot capability and wrong for a skill that behaves as a
  mode — a persona, or an assistant whose reply carries a menu that is pressed on the NEXT turn, when
  nothing would re-activate it. Every conversational agent with a mode was re-implementing a
  (conversation, skill) table and merging it into the request by hand.

  Two additive, opt-in pieces (migration `V202609031400__v6.1.x__Conversation_Scoped_Skill_Activation`):
  - `AISkill.ActivationScope` — `Run` (default, today's behaviour) or `Conversation`.
  - `MJ: Conversation Skills` — one row per (conversation, skill), `Active` or `Ended`, with the run
    that activated it as provenance.

  `BaseAgent` does the rest. At the start of every root run that has a `conversationId`, the
  conversation's Active skills join `requestedSkillIDs` (every availability gate still applies on
  every run). When a `Conversation`-scoped skill activates — by request or by the agent's own choice —
  its row is written or re-activated. A persisted skill that a gate refuses this turn is simply not
  activated and gets no note (the user never mentioned it); its row stays Active, because a gate miss
  can be transient and ending the row would be silent, permanent loss of a mode. Retiring a mode is an
  explicit act. An explicitly requested skill that is refused still gets the system note.
  `BaseAgent.EndConversationSkill(conversationId, skillId, user)` is the app's "leave the mode"
  gesture. All three steps are protected/public and fail soft: losing a persisted skill means the user
  re-invokes it, never that the turn fails.

  Precedent: `UserRoutine.RequestedSkillIDs` (v5.45) persists a pre-selection on the owning record and
  threads it per run; this is the same idea keyed on the conversation. First-adopter feedback (Betty).
  A composer chip that shows the conversation's active skills and ends one on removal is the natural
  UI follow-up; the server side works for every client and bridge without it.

  Also: `mj sync pull` now round-trips a skill's `MJ: AI Skill Search Scopes` rows (under
  `metadata/ai-skills`) and an agent's `MJ: AI Agent Skills` grants (under `metadata/agents`, for the
  agents that directory pulls) — pull-config additions only; push already accepted both.

### Patch Changes

- 634aa8c: Let an agent tell the framework whether its payload is a **new** artifact or a **new version** of an existing one, instead of leaving that to be inferred at the write.

  `ProcessAgentArtifacts` chose its target from continuity signals alone: an explicit `sourceArtifactId`, else the previous artifact on the conversation detail. Both signals say only "this conversation already has an artifact" — neither distinguishes a restyle of the current component from a request for a different one. So an agent that produced an unrelated deliverable mid-conversation had it saved as version N of whatever came before (Skip-Brain #529).

  `BaseAgentNextStep` and `ExecuteAgentResult` now carry an optional `ArtifactDirective`: `create-new`, `version-source` (with an optional `targetArtifactId`), or `suppress`. `planArtifactTarget()` is exported from `@memberjunction/ai-agents` so the resulting precedence is testable without a database.

  Precedence is deliberately narrow — the directive is advice from an agent, not a command, and is consulted only **after** the checks that already existed, so it can never widen what a caller or an agent's configuration refused:
  1. `createArtifacts === false` → nothing written; a directive cannot re-enable creation.
  2. `ArtifactCreationMode: 'Never'` → nothing written.
  3. The directive.
  4. **No directive → the historical chain, byte-for-byte unchanged.** Every existing agent is unaffected.

  `suppress` covers everything the step would persist as an artifact — the payload, and the artifacts wrapping any generated files or media. The run's media audit rows are still written: suppression governs what the user is shown, not lineage.

  **Every field of a directive is model output, and is treated as such.** A named `targetArtifactId` is honored only if it is a UUID-shaped string naming an artifact that exists AND that the run's user either owns or holds an explicit `CanEdit` grant on — otherwise the run falls back to the caller's `sourceArtifactId`, then to the historical chain. Without the ownership test, an agent could name any artifact id in the instance and have the run's payload appended to it, because `vwArtifacts` has no per-user predicate and a successful load proves only that a row exists. Existence and authorization resolve in one `RunViews` round trip rather than through `BaseEntity.Load`, which throws on a permission denial or a transient fault where this path needs a fallback. A directive's `name` is trimmed and clamped to its 255-character column rather than rejected, so an over-long model-written title costs a truncation instead of the entire artifact. Provenance ('did the agent name this id, or did the caller?') is carried on the plan instead of inferred by comparing values, so an agent echoing the run's own source id no longer routes a caller-supplied id through the model-output guards — nor lets a rejected id reappear through the fallback. A `targetArtifactId` that is not a string is discarded by `planArtifactTarget` itself, at the boundary that introduces it, so the plan's id is always a string by the time the runner vets its shape, existence and authorization; the discarded value is logged.

  A `behavior` this consumer cannot parse discards the **whole** directive, not just its targeting: `name` and `description` go with it, and the artifact falls back to the extracted-name pass exactly as it would with no directive at all. Trusting the free-text half of an object whose one enumerated field is unparseable would mean a directive the log says is being ignored still renaming the artifact.

  Ids reaching a `RunView.ExtraFilter` are now escaped **where the filter is built** rather than at one audited call site, so `GetMaxVersionForArtifact`, `CheckForDuplicateVersion` and `FindPreviousArtifactForMessage` are safe for every caller, including the `sourceArtifactId` that arrives from the GraphQL boundary. `ExtraFilter` has no parameterized form and the upstream clause validator permits `OR`, so this was a real predicate-injection surface.

  An artifact directive governs the payload of the agent that issued it and never crosses the parent/child boundary. A sub-agent's directive is logged and dropped rather than inherited by the parent's terminal step, which carries a merged payload and would otherwise be written onto an artifact the child named. Conversely, the two places that rebuild an agent's OWN terminal step — the client-tools `terminateAfterExecution` branch and `executeChatStep` — now carry the directive instead of dropping it.

  Two supporting changes ride along:
  - **`PayloadManager` no longer leaves data-free shells in arrays.** When a sub-agent returns a _shorter_ array than the parent holds, every scalar under the vacated index is deleted — and `_.unset` removes leaves while leaving the containers that held them. The result is an element that carries no data but is not key-free, which the previous `Object.keys().length === 0` cleanup could not see. Such elements are now pruned by a sweep **scoped to the indices this merge actually vacated**, so the recursive emptiness test cannot reach elements the merge never touched: a legitimate all-null record elsewhere in the payload, or one whose deletion the upstream-path guardrail refused, survives exactly as before. The global key-less-`{}` cleanup is unchanged. The scoped sweep also closes the hole `_.unset` leaves when a scalar array is shortened, and prunes a fully vacated NESTED array — a latent defect that predates this work and that the recursive test now covers. Before this, a sub-agent legitimately removing one item from a structured array left a nameless residue that downstream consumers read as a real record; for component pipelines that meant a crash at the last step, after the full generation run.
  - **`ng-conversations` stops guessing which artifact to open.** The chat area snapshots artifact versions before a turn and diffs after, with _created_ beating _bumped_, so a newly created artifact wins the panel over one that merely gained a version — including when the panel is already open on something else, which the previous `!showArtifactPanel` gate suppressed. Because the panel is no longer gated on being closed, the decision is applied only while the conversation it was computed for is still on screen and only while the user has not made a selection of their own in the meantime; a run that finishes during a conversation switch or a scroll-up no longer mistakes artifacts arriving in the map for artifacts the run created. A creation is also chosen by the newest version's timestamp rather than by whichever conversation detail the map happened to iterate last, and artifact ids are grouped as UUIDs wherever they are deduplicated, so the two casings the two database engines return can no longer render one artifact as two cards. Dead `targetArtifactVersionId` plumbing in the message input is left intact on this line, where the Check Sage Intent prompt populates it.

  The artifact viewer no longer loads twice per open or refresh: switching artifact and version together delivered both inputs in one change-detection pass and its two independent `ngOnChanges` branches each ran a full load, the second without a cancellation token. Its refresh guard also compares artifact ids as UUIDs now, so a refresh is no longer dropped when the two sides picked the id up from differently-cased sources.

- f6a4341: The three live-database harness scripts (`memory-write-smoke.ts`, `contextcrush-smoke.ts` in ai-agents; `entity-action-workflow-integration.ts` in actions) decide TLS for Azure SQL with an anchored host check (`endsWith`) instead of a substring match. Not part of the published output; recorded for the release notes.
- b9de989: **An action's file output can say it is a download: `FileOutputRef.visibility`.**

  MJ turns every action `FileOutput` into an artifact with `Visibility = 'Always'`, hard-coded on the
  file path. For a file the user asked to download and will open elsewhere — an exported CSV, a PDF —
  that produces a message card whose viewer is empty for types with no plugin, and the host has no
  way to say otherwise short of rewriting the artifact after the fact.

  `FileOutputRef` gains an optional `visibility` (`'Always' | 'System Only'`, parsed by
  `ParseFileOutputRef`, ignored when malformed), and `AgentRunner` threads it to the artifact it
  creates for the file, defaulting to `Always` as before. `System Only` is the chat's existing switch:
  the artifact, its version and its download URL exist, but the message shows no card unless the host
  opts in with `showSystemArtifacts`. First-adopter feedback.

- a723521: Store agent-generated media in configured file storage, not inline

  `CreateMediaArtifacts` wrote every image, audio and video artifact inline as a
  `data:<mime>;base64,...` string in `ArtifactVersion.Content`, regardless of whether a file storage
  account was configured — while `ProcessFileArtifacts`, handling file outputs a few lines away,
  honoured it. Media now takes the same route: upload to the resolved storage account when one is
  configured, and fall back to inline when it is not, or when the upload fails.

  This was an omission rather than a decision. The method was added to migrate media off the
  deprecated `ConversationDetailAttachment` table and inherited that path's inline behaviour; the
  storage branch had landed in its sibling six weeks earlier. Both call the same
  `createArtifactWithVersion` helper, so the two looked consistent. Nothing downstream required
  inline media — `gatherConversationArtifacts` and all three Angular viewers already branch on
  `ContentMode === 'File'`.

  The cost was silent: a generated image is routinely several megabytes, and inline storage puts that
  base64 in a SQL column and ships it in full on every read of the row. In one production database,
  35 images accounted for 129 MB of `ArtifactVersion.Content`.

  `CreateMediaArtifacts` takes the resolved storage account as a new optional final parameter, so
  existing callers are unaffected — omitting it falls back to the first active account.

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

- c11f8c6: **The skill principal of a Scoped Search is bound to the agent run, not to a model-authored parameter.**

  `BaseAgent.ExecuteSingleAction` now stamps `Context.ActiveSkillIDs` — the skills the run has actually
  activated so far — onto every action call, alongside the existing `AgentID`. An empty array means
  "inside an agent run, with no skill active", which is a different fact from having no agent context.

  `Scoped Search` reads it. Inside a run, a named `AISkillID` that the run never activated is refused with
  `INVALID_PARAM`, and when exactly one skill is active and none is named, that skill becomes the
  principal. Outside a run the explicit input is unchanged. The reason is the one the BC-SaaS
  capability resolver already states for the active skill: it "must be server-derived, never
  caller-supplied — a model naming a skill would let it widen its own reach". Since a skill's
  `SearchScopeAccess` and its scope grants can widen a bound, and inside a Loop agent the `AISkillID`
  input is filled by the model, the run has to be the authority. With several skills active and none
  named, no default is picked and the search proceeds with no skill principal (logged as verbose).

  Also: `_activatedSkillIDs` and `_skillInvocations` on `BaseAgent` are now `protected` (with a
  read-only `ActivatedSkillIDs` getter), so a subclass that layers its own activation policy — a
  tenant licensing check, an entitlement model — can see what actually activated without intercepting
  `enableSkillCapabilities`. First-adopter feedback from Betty, where the search sub-agent's principal
  was being set by hand from a re-derived copy of this state.

- 0db6105: **One seam for an application's skill-availability policy: `BaseAgent.filterAvailableSkills`.**

  MJ decides whether a skill is available in four sites — the prompt catalog the model is offered,
  the validation/execution of a model-initiated `Skill` step, and the pre-activation of a user's
  explicit `/skill` request — each through MJ's own gates (AcceptsSkills, Status, agent grant, user Run
  permission, the ActivationMode double gate). An application with a policy MJ has no table for — a
  tenant licensing model, a per-organization entitlement — could previously hook only the requested
  path (by overriding `preActivateRequestedSkills`), so a self-activating agent would be OFFERED a skill
  the policy would then refuse.

  `protected async filterAvailableSkills(skills, purpose, agent, contextUser)` is now called at all
  four sites, after MJ's gates and before anything activates. The default is the identity. The new
  `SkillAvailabilityPurpose` type (`'catalog' | 'auto-activation' | 'requested'`) says why it is being
  asked. Overrides return a subset, cache their lookups (the catalog is rebuilt every prompt turn), and
  fail closed. Guide §1.2b documents it. First-adopter feedback: an entitlement gate that could cover requested activation only.

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
  - @memberjunction/actions@6.1.0-edge.6
  - @memberjunction/ai-vector-dupe@6.1.0-edge.6
  - @memberjunction/ai-vector-sync@6.1.0-edge.6
  - @memberjunction/search-engine@6.1.0-edge.6
  - @memberjunction/ai-engine-base@6.1.0-edge.6
  - @memberjunction/ai-prompts@6.1.0-edge.6
  - @memberjunction/ai-reranker@6.1.0-edge.6
  - @memberjunction/templates@6.1.0-edge.6
  - @memberjunction/actions-base@6.1.0-edge.6
  - @memberjunction/storage@6.1.0-edge.6
  - @memberjunction/context-crush@6.1.0-edge.6

## 6.1.0-edge.5

### Minor Changes

- 29c3dc8: A failed upload reports the driver's real cause instead of "Storage upload failed."

  A realtime recording upload surfaced to the client as `{"Success":false,"FileID":null,"ErrorMessage":"Storage upload failed."}` while the actual cause was Google's, and was actionable: _"Service Accounts do not have storage quota. Leverage shared drives instead."_ Four layers each discarded it — the Drive driver's catch reduced the SDK error to a bare `console.error` and `return false`; `FileStorageEngine.UploadFile` threw a path-only generic; `storeRealtimeRecording` logged and then returned `string | null`, so the reason it had just logged could not leave; and the resolver reported the generic. The layer people see is the fourth; the information died at the first.

  **`PutObject`'s `Promise<boolean>` contract is deliberately untouched.** `FileStorageBase` documents boolean-means-success and every driver implements it, so making it throw would break every driver and caller. Every `return false` / `return true` in the driver is byte-for-byte what it was — this is only about not _erasing_ the cause on the way up.

  The Drive driver gains `describeGoogleApiError`, which extracts named fields (`code`, `message`, `errors[].reason`, `errors[].message`, `response.data.error.message`) — an allowlist rather than a dump, because MJStorage ships `rawErrorLogging.guard.test.ts` forbidding drivers from logging a vendor error wholesale. The four catches that rethrow a generic now append the cause, matching the precedent already in that file at `CreatePreAuthDownloadUrl`.

  **Breaking for direct callers of `storeRealtimeRecording`** (hence minor on `@memberjunction/ai-agents`): it returns `{ FileID, ErrorMessage }` rather than `string | null`. A caller that used the returned id directly now reads `.FileID`; the null check becomes a check on `FileID`, with `ErrorMessage` carrying the reason that was previously unreachable.

### Patch Changes

- 79483bf: A bridged realtime seat now runs its OWN agent class instead of silently falling back to plain BaseAgent (#4111)

  `CreateBridgeRealtimeSession` picked the agent class with `agent.DriverClass || agentType?.DriverClass`.
  `AIAgentType.DriverClass` names a **`BaseAgentType`** subclass — the three shipped values are
  `LoopAgentType`, `FlowAgentType`, `RealtimeAgentType` — while the key this call needs is a
  **`BaseAgent`** one. Separate ClassFactory registries, matched by exact key against the base class
  name, so the fallback could never resolve: dead code that looked alive. It bit the common case,
  because most agents declare no `DriverClass` of their own (that is what makes an agent data rather
  than code).

  With no registration and no `@RequiresSubclass` marker, `ClassFactory` returns an instance of the
  base itself, so every such seat silently ran the plain `BaseAgent`, dropping the subclass behaviour it
  was configured for — one generic assistant voice for every seat in a room meant to hold distinct
  characters. Both guards below the call were unreachable: `if (!instance) throw` because an instance is
  always produced, and `if (!driverClass) throw` because the wrong-registry lookup always produced a
  truthy key. The only signal was a single `ClassFactory` `console.warn`, deduped per base+key and
  capped at three per base — effectively invisible in a busy log.

  The agent's own `DriverClass` is now used when it has one, resolved through `TryCreateInstance` so an
  unregistered key raises instead of installing a base-class fallback that answers plausibly. An agent
  with no `DriverClass` gets `new BaseAgent()` — constructed directly, deliberately not
  `CreateInstance(BaseAgent, null)`, because a null key makes `GetAllRegistrations` skip the key filter
  and return the highest-priority registered subclass, i.e. an arbitrary agent. The unreachable
  `no DriverClass` throw is gone.

  Dropping the agent-type fallback loses nothing: agent-type behaviour is resolved separately inside
  `BaseAgent` via `BaseAgentType.GetAgentTypeInstance`, so a seat on the plain `BaseAgent` still gets
  Loop/Realtime type semantics.

- 8206993: `configOverridesJson` names the keys it is about to ignore.

  `StartRealtimeClientSession` accepts `configOverridesJson`, gates it behind the `Realtime: Advanced Session Controls` authorization, and threads it through `PrepareClientSession` — but `normalizeConfig` reads only `merged['realtime']` and returns an object built exclusively from that section. Every other top-level key was discarded with no error, no warning and no log. Authorization-gating a field implies the payload matters, which is what made the silence expensive: a caller sending `{"realtime":{…},"caliber":{…}}` had it serialize, pass the gate, cross the wire and vanish, with its own tests correctly asserting it built the payload right. Every such session ran on default configuration.

  `realtime-coagent-config.ts` is deliberately framework-free — no DB, no metadata provider, no logging imports, every function a pure transformation — so it does not learn to log. It reports the drops as data:

  ```typescript
  export type IgnoredRealtimeConfigReason =
    | "unknown-section"
    | "unknown-key"
    | "wrong-type";
  export interface IgnoredRealtimeConfigKey {
    readonly path: string;
    readonly reason: IgnoredRealtimeConfigReason;
  }
  export function FindIgnoredRealtimeConfigKeys(
    overridesJson: string | null | undefined,
  ): readonly IgnoredRealtimeConfigKey[];
  export const REALTIME_CONFIG_SECTION_KEYS: readonly (keyof RealtimeConfigSection)[];
  ```

  and `assertRuntimeOverridesAuthorized` — which already logs — does the talking.

  **Warns rather than rejects.** Rejection is stricter and defensible in a major; in a patch it would turn a previously-accepted payload into a hard error for callers that cannot be seen from here. The reasoning sits at the call site so the next reader knows rejection was considered.

  **Reported after the authorization decision, not before.** A payload that fails the gate already throws a structured error, so reporting drops for a request that never ran would be noise. Silence only ever existed for _accepted_ payloads.

- 5f33ca8: Slack and Teams adapters: first production bring-up

  Defects found running the adapters against a real MJ app — one Slack app per agent
  (Socket Mode) plus Teams via Bot Framework.

  **Startup and identity**
  - Users are resolved via `UserCache.Instance`. `new UserCache()` returned the shared
    singleton and then re-initialized it empty, so no messaging extension could start
    and the whole server lost its user cache until the next refresh.
  - Running one platform app per agent no longer causes bots to cross-talk in shared
    channels: thread replies are answered only by the addressed bot, bot-authored
    messages are excluded from history and thread affinity, and a new
    `DisableDelegation` setting stops a pinned bot from handing off.
  - A bot recognises its own replies. Slack publishes two identifiers for one bot and
    returns the `bot_id` (with no `user`) for any message posted with a username
    override — which every agent reply uses, since per-agent identity is the point of
    one app per agent. Comparing only against `auth.test()`'s `user_id` therefore never
    matched, so the thread gate above declined threads the bot was actively holding and
    the agent lost its own turns from context.

  **Delivery**
  - Generated files and images are delivered as real attachments. Adapters may
    implement `uploadMediaOutputs` (Slack does, and needs the `files:write` scope);
    inlined `data:` URIs are decoded; and the run's canonical `fileOutputs` are used
    rather than depending on the model to inline them.
  - A non-public button URL no longer fails the entire Slack message — it degrades to
    a link, so a localhost `ExplorerBaseURL` stops suppressing replies outright.
  - The artifact link points at the file the agent produced rather than its internal
    payload, and `System Only` artifacts are no longer linked. Callers relying on
    `artifactInfo` being the payload artifact now receive the file artifact when a run
    produced one.
  - `ng-artifacts`: downloading a file artifact returns real bytes under its own MIME
    type and filename, instead of a `.txt` file full of base64.
  - `ng-explorer-core`: a conversation deep link opened cold now honours the URL rather
    than restoring the previously-viewed conversation.

  **Slack**
  - Interactivity works in Socket Mode; previously every button and modal was inert, so
    human-in-the-loop form flows dead-ended.
  - Message text is capped at the real `text` limit rather than the block-payload limit,
    which was failing long responses with `msg_too_long`.
  - Modal placeholders are truncated to 150 characters; an over-long one failed the whole
    `views.open` and left a button that looked dead.

  **Teams**
  - `MentionedAgentNames` is populated, so a named agent is reachable at all — previously
    every Teams turn ran the default agent.
  - Response forms route the answer back to the agent that asked, via `mj_agent`.
  - Buttons are built only over `http:`/`https:` URLs. Teams silently ignores `data:`/`blob:`/`file:`
    (so "Download document" was dead by construction whenever MJ inlined the artifact) and hands
    unknown schemes such as `javascript:` or `ms-msdt:` to the OS URI handler, so the check is an
    allow-list. Dropped buttons become a note pointing at the artifact link; localhost stays allowed.
  - A response form's submitted agent name is validated against the known agents before it is used
    to route, rather than trusted from the client-controlled submit payload.
  - Deep links no longer assume `resourceId` is present, now that a Record can be
    addressed by `keys`.

- d7feeae: Stop Explorer from showing "Unknown error" with a stuck Running timer when a Skip/sub-agent transport path fails. Pass the real error through invokeSubAgent, keep In-Progress when the agent may still be running, and persist Failed/Error on the run and conversation detail if executeAIAgent throws.
- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [22ec804]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [9cbe17f]
- Updated dependencies [5fc861f]
- Updated dependencies [88d751d]
- Updated dependencies [d7feeae]
- Updated dependencies [28cd302]
- Updated dependencies [29c3dc8]
- Updated dependencies [905820a]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/aiengine@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-core-plus@6.1.0-edge.5
  - @memberjunction/ai-engine-base@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/ai-prompts@6.1.0-edge.5
  - @memberjunction/storage@6.1.0-edge.5
  - @memberjunction/search-engine@6.1.0-edge.5
  - @memberjunction/ai-reranker@6.1.0-edge.5
  - @memberjunction/ai-vector-dupe@6.1.0-edge.5
  - @memberjunction/ai-vector-sync@6.1.0-edge.5
  - @memberjunction/actions@6.1.0-edge.5
  - @memberjunction/templates@6.1.0-edge.5
  - @memberjunction/actions-base@6.1.0-edge.5
  - @memberjunction/context-crush@6.1.0-edge.5

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
  - @memberjunction/ai-prompts@6.1.0-edge.4
  - @memberjunction/ai-reranker@6.1.0-edge.4
  - @memberjunction/ai-vector-dupe@6.1.0-edge.4
  - @memberjunction/ai-vector-sync@6.1.0-edge.4
  - @memberjunction/actions@6.1.0-edge.4
  - @memberjunction/search-engine@6.1.0-edge.4
  - @memberjunction/templates@6.1.0-edge.4
  - @memberjunction/actions-base@6.1.0-edge.4
  - @memberjunction/storage@6.1.0-edge.4
  - @memberjunction/context-crush@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- 834f8d7: Fix a `TypeError` that could kill an agent mid-run during context assembly, and take down scheduled-job dispatch entirely (`__mj_CreatedAt?.getTime is not a function`, `job.NextRunAt.getTime is not a function`).

  Two defects, one crash:
  - **`BaseEngine.OnExternalCacheChange` poisoned `entity_object` caches (the root cause).** When a cross-server cache-change event carried a payload, its rows — plain JSON objects, since cache payloads are serialized — were assigned straight into the engine property. For a config whose effective `ResultType` is `entity_object` (the default), that silently replaced the array's `BaseEntity` instances with plain objects, so `BaseEntity`'s coercing accessors were bypassed and a date field declared `Date` held a raw ISO string. Rows are now materialized via `TransformSimpleObjectToEntityObject` — the same conversion RunView's own cache-hit path uses — before assignment, with `'simple'` configs still passing through untouched and any failure degrading to the pre-existing full reload. Because materialization is async, the payload branch now claims a refresh generation (`beginConfigRefresh`/`isLatestConfigRefresh`, as `LoadSingleConfig` already does) so overlapping cache events cannot commit out of order. This affects **every** engine with `CacheLocal: true`.
  - **Unguarded `Date` method calls on those fields (the crash sites).** Optional chaining does not protect them — `"…"?.getTime` is `undefined`, and calling it throws. A new `ToEpochMs(value)` helper is exported from `@memberjunction/global` (a pure date utility — it needs no entity or metadata concepts) and now backs every affected read across four engines: `AgentContextInjector.sortExamples`/`sortNotes`, `AIEngine.fallbackGetNotesFromCache`/`fallbackGetExamplesFromCache`, `ConversationEngine.sortConversations`, and the scheduling engine's `isJobDue` plus its `NextRunAt`/`EndAt` diagnostics. It also closes a latent issue in the previous form: an Invalid `Date`'s `getTime()` returns `NaN`, which `?? 0` did not catch, yielding an incoherent comparator.

  Two exposures worth calling out. `AIEngine.fallbackGetNotesFromCache` is reached whenever the note vector service is uninitialized or a query embedding fails, so semantic retrieval with real input text could crash too — not just the empty-input path. And `SchedulingEngine.isJobDue` throws on the _first_ job in the dispatch loop, so a poisoned cache stopped **all** scheduled jobs from running, on every poll, until the cache reloaded.

  `isJobDue` also had a silent variant of the same bug: `evalTime < job.StartAt` does not throw on a string — relational operators coerce toward numbers, an ISO string yields `NaN`, and every comparison is false — so `StartAt`/`EndAt` activation windows silently stopped being enforced and a job could fire outside its range with nothing in the logs. Those comparisons now go through `ToEpochMs` as well.

  Making the cache-event path work also exposed a filtering gap (caught in review): `SchedulingEngineBase` loads `MJ: Scheduled Jobs` unfiltered and applies its Active-only invariant in memory, but only re-applied it on entity events — not after a cross-server cache event, whose payload carries every row. In a multi-instance deployment, one server's engine load could therefore hand another server's dispatch loop Disabled/Paused/Pending jobs. The engine now re-applies the filter (and notifies `JobsChanged$`) after `OnExternalCacheChange`, and `isJobDue` independently refuses non-Active jobs so dispatch can never depend on the array staying pre-filtered.

- 199eb2b: Debug a Flow agent from the Agent form Run dialog. Debug starts the graph paused at Submit (`$.debug.paused` on the parent row — Pause-after-submit races the dispatcher). The harness and Runs console share a VS Code-style icon toolbar and a red-circle breakpoint toggle. The invocation-envelope sanitizer from #3783 is preserved.
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

- 7a630ba: Three writes take an object the CALLER built and stringify it straight into a database row — an agent run's `Data` and `StartingPayload`, and a task graph's invocation envelope — and all three take it from `ExecuteAgentParams`, whose own documentation says the value may be a class instance holding "external service credentials or connection information". One of the three was guarded, after it killed agent runs at submit time with `Converting circular structure to JSON`. The other two were not.

  That combination fails two ways, and the second is worse: it **throws** on anything holding a socket, a pool or a provider, and it **leaks** when serialization happens to succeed, writing whatever the object held into a row that outlives the run. The first is loud and gets fixed; the second is silent and does not.

  `SanitizeForPersistence` / `StringifyForPersistence` now carry the rules in one place, and all three writes use them. JSON data survives (primitives, arrays, plain objects, `Date` as ISO, anything with `toJSON`); class instances, functions, sockets and cycles are refused whole rather than unwrapped — walking a socket's own properties would "work" and would persist its internals, which is the leak. Every drop is reported by path and logged, because a value that silently vanished is the failure one layer down: a reader hunting a field the writer discarded, or a condition reading absent-data and taking a branch nobody can explain.

  Also: the flow differential suite gains its first **failure oracle**. It could not express `'edges'` semantics — the dialect where a flow routes around its own failure — because the simulator treated "which origin statuses may decide an exclusive group" as a constant where the dispatcher treats it as the graph's dialect. With that modelled, a fixture whose step fails and whose recovery path runs is now compared walker-against-compiled, and the comment states why `'block'` has no oracle by construction: the walker routes on failure, so there is nothing to compare a compiled `'block'` graph against (IT74's TX19 pins that side instead). And the all-`Optional` node's wave-1 behaviour — the consequence the spec doc calls out as surprising and nothing asserted — is now pinned, so an OR-join implemented later reads as a deliberate semantic change rather than a bug fix.

  **Two behaviour changes worth knowing about, both deliberate.** A class instance is now refused _whole_ and reported by path, where `JSON.stringify` would have persisted its own enumerable properties — so an agent whose payload legitimately is a class instance will find that payload dropped rather than partially recorded, with the path named in the log. Dropping loudly is the intended posture: the alternative persists whatever the object happened to hold. And `toJSON` is no longer consulted for anything but `Date`, because deferring to a method on the object being guarded hands the decision back to the party the module does not trust — a `toJSON() { return {...this} }`, a common convenience, published its own credentials silently and with an empty `DroppedPaths`.

  Also worth knowing: sanitizing **invokes getters**, once per property, so a payload holding lazily-opened resources can open one by being written down. Refusing class instances removes most of that surface, since their getters are never reached.

- 6d7d3da: Task-graph engine hardening, Round 3 — the residual gaps in Round 2's own fixes, found by a three-track adversarial review of the merged engine. The pattern this round is not new seams but **incomplete closures**: six Round 2 fixes worked at their own anchor and left the layer just outside it open.

  **R3-1 — an early finish could discard a step that was already running.** R2-10 moved the sibling skips after `CompleteClaimed` on the premise that "siblings are Pending and unclaimed until the skip lands". They are not: task execution is not awaited, so the deciding instance's own poll tick runs concurrently with its skip loop, and the decision existed only in that instance's memory — no claim filter anywhere could know about it. A sibling claimed mid-loop had `In Progress` reverted to `Skipped` and its claim cleared _while its agent body ran_: side effects fired, completion refused, output discarded, graph settled `Complete` with nothing recording it. The early finish now declares itself durably before mutating anything (so every instance's claim filter sees it) and every skip is a guarded single statement that refuses a task something else has taken.

  **R3-2 — R2-4 gated one dialect and left the other blind.** Under `failureSemantics: 'block'` — the spec default, so every agent-emitted graph — a `Failed` origin's ordinary conditional edge that read false was dropped, its target skipped rather than blocked, and the dropped edge severed the block cascade's forward walk. `Skipped` satisfies prerequisites, so a join fed by an independent healthy route executed downstream of an unhandled failure while the parent still rolled up `Failed`. R2-3 made this _more_ reachable, not less: a failed step rarely has output, so the null-safe envelope answers positive conditions with a confident false→drop where they previously threw→held visibly. `Cancelled` is now decided once and written into the spec: it never decides an ordinary edge under either dialect.

  **R3-3 — the documented `data`/`context` conditions never worked on the dispatcher.** They resolved against the origin _step's_ output rather than the invocation's parameters, so every `data.x` comparison read `undefined`, came out false, and silently took a branch the legacy walker never took — on every invocation, with the validator blessing the condition at the door. An invocation envelope is now threaded from the agent through submit, the parent's metadata, and condition evaluation. Round 1's carried-forward D2 lands as code. `stepResult.step` also now carries a status word rather than the step's name, matching what the flow engine actually exposes — the documented `stepResult.step === 'Success'` was false for every step before this.

  **Also fixed:** a `Stop()` during boot no longer has its timers reinstalled by `Start()`'s own continuation (R3-4); concurrent human-step notifications no longer leave a duplicate, un-answerable inbox item — collapsing them belongs to the sweep over _waiting_ steps rather than to the raise, because a task is notified exactly once and the raise never runs again afterwards, so a duplicate that outlived its own raise was previously unreachable by the only code that could have closed it (R3-5); the data-absence classifier is inverted so it cannot rot per operator — a `ReferenceError` is a broken guard, everything else is absent data (R3-6); the determinism tiebreak is ordinal rather than locale-collated, so two hosts with different `LANG` cannot resolve the same tie differently (R3-7); a transient cost-rollup failure defers delivery instead of claiming the marker and locking a wrong total in forever (R3-8); `Cancel`'s child writes are guarded statements that cannot overwrite an outcome that landed first (R3-9); nested cancel is type-scoped and its depth cap actually engages (R3-10); and a host with the dispatcher disabled now refuses graph submissions instead of accepting work nobody will run (R3-11).

  **Smaller:** `deliverContinuation` returned `undefined` after every successful delivery, costing a spurious settle pass per graph (C1, with `noImplicitReturns` now on for the package); the default dispatcher instance id gains real entropy, because host+pid collides under systemd, pm2 and containers — and a shared id defeats every ownership guard at once (C2); the run's rollup and lifecycle writes are column-scoped (C4); and the drain's heartbeat purge no longer races the registration it is purging (C5).

  **Wrap-up fixes (post-round):** the claim protocol's lease now lives entirely on the database clock — `ClaimExpiresAt` is written (`DATEADD` over `SYSUTCDATETIME`) and compared in SQL time, so NTP skew between dispatcher hosts can no longer reclaim a live lease or extend a dead one. And the `TaskGraph.Submit` remote operation stops dropping `reinvokeDepth` (the runaway-loop cap now counts remote continuation hops) and gains the R3-3 `invocation` envelope so `data.*`/`context.*` conditions work for MCP-submitted flows; the operation's metadata contract carries both fields (hence this release's `minor`).

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
- Updated dependencies [b6416f4]
- Updated dependencies [bc45ded]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [d0a2a55]
- Updated dependencies [ae2baef]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/aiengine@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/ai-prompts@6.1.0-edge.3
  - @memberjunction/ai-vector-sync@6.1.0-edge.3
  - @memberjunction/storage@6.1.0-edge.3
  - @memberjunction/search-engine@6.1.0-edge.3
  - @memberjunction/ai-engine-base@6.1.0-edge.3
  - @memberjunction/ai-reranker@6.1.0-edge.3
  - @memberjunction/ai-vector-dupe@6.1.0-edge.3
  - @memberjunction/actions-base@6.1.0-edge.3
  - @memberjunction/actions@6.1.0-edge.3
  - @memberjunction/templates@6.1.0-edge.3
  - @memberjunction/context-crush@6.1.0-edge.3

## 6.1.0-edge.2

### Minor Changes

- 5ecfdb4: Realtime voice agents can now **speak first**.

  Conversation-start behavior is not instruction-following: an ElevenLabs realtime agent with no `first_message` produces no audio at all until it receives user audio, whatever the persona prompt says. Every ElevenLabs realtime session therefore opened in silence, waiting for the human to guess they should talk (issue #3557).
  - **`ElevenLabsRealtime`** now sends an `agent.first_message` conversation-config override, built alongside the existing prompt and voice overrides, so both topologies (server-bridged and client-direct) carry it. The managed agent enables the override, and — because `OverridesSatisfied` requires it too — an agent provisioned by an earlier MJ version is re-PATCHed on next use instead of silently dropping it forever (the failure mode behind #3374). Omitting it preserves today's wait-for-the-user behavior exactly.
  - **New persona slot `realtime.voice.default.firstMessage`** authors the opening utterance without naming a vendor, filed onto whichever driver resolves under the neutral `firstMessage` key — the same shape as the agnostic `voice`. It reaches both realtime host paths (`BaseAgent` server-bridged and `RealtimeClientSessionService` client-direct). The text is spoken VERBATIM; it is the literal opening line, not guidance about how to open.
  - **`AssemblyAIRealtime`** honors the same neutral `firstMessage` key for its `greeting` wire slot. The legacy `greeting` config key still works; `firstMessage` wins when it carries something. Both go through the same trim-and-drop-blank rule as the ElevenLabs driver, so one authored value means the same thing whichever vendor runs — in particular a blank `firstMessage` reads as "none authored" and does not suppress a valid legacy `greeting`.
  - **`firstMessage` is registered in `REALTIME_SHARED_CONFIG_KEYS`**, and the drivers that do not consume it now scrub it. Because an agnostic persona slot is filed onto _whichever_ driver resolves, an unregistered neutral key survives each driver's residual-bag spread and reaches the provider as an unknown session field — it was reaching the OpenAI (and xAI) `session.update` payload on both topologies, and Inworld's raw-override loop was copying it onto the session verbatim. On the OpenAI-protocol endpoints a malformed session object is rejected wholesale, taking the prompt and tools with it. Inworld now scrubs the whole shared vocabulary, closing the same class of leak for the other shared keys too.

  Drivers without a provider-native opening utterance ignore the key and open silently, as before.

- 48ff99f: Add `ModelConfiguration` — a per-modality, strongly-typed JSON configuration bag on the AI model catalog — at three levels forming an inherit-with-override cascade: `AIModelType` < `AIModel` < `AIModelVendor`, resolved base-first with per-key deep merge. One interface (`IAIModelConfiguration`: `LLM` / `Realtime` / `Vision` / `Audio` sections) is shared by all three levels via MJ's JSONType mechanism, so CodeGen emits typed `ModelConfigurationObject` accessors on all three entities. This generalizes the scalar cascade those tables already carry (`SupportsPrefill` / `PrefillFallbackText`): new session/call-time capability knobs now land as typed properties in one bag instead of a column per knob. Existing capability columns are untouched. `AIEngine.GetEffectiveModelConfiguration(modelID, modelVendorID)` is the single canonical read path; the pure `ParseModelConfiguration` / `ResolveEffectiveModelConfiguration` live in `@memberjunction/ai`.

  First consumer: realtime turn detection. `Realtime.TurnDetection` (`Mode: 'default' | 'serverVad' | 'semanticVad' | 'native'`, plus eagerness / threshold / silence tuning) flows catalog → session config bag → provider wire block on both realtime topologies, with precedence `profile default < ModelConfiguration cascade < realtime.session.turnDetection < runtime configOverridesJson`. Profiles declare `supportedTurnModes` and translate through the shared `MapNormalizedTurnDetection`; an unsupported mode is diagnostic-logged and falls back to the profile default, so a shared model catalog never rejects a session on any provider. Non-protocol drivers scrub the key. Turn detection was previously hardcoded per provider profile, so smarter models had no way to opt into their smarter turn modes.

  Fixes a latent bug: a live `Reconfigure` (the meeting-mode auto-response flip) hardcoded `server_vad`, silently downgrading any session running a non-server-VAD turn mode. It now rebuilds the session's actual resolved mode, with meeting-mode floor control composed on top.

  GPT Realtime 2.1 and 2.1-mini are seeded to `semanticVad` (eagerness `auto`) at the model level — the one behavior-affecting change here. Everything else is behavior-neutral while `ModelConfiguration` is `NULL`.

- 9fc0e2d: Carry an authored realtime voice to any provider, not just OpenAI — both override builders filed the voice under a hardcoded `openai` provider key, so a session resolving to ElevenLabs, Gemini, Inworld, AssemblyAI or HuggingFace silently got nothing: the setting stayed visible in the effective config and never reached a driver. On the default-model path the framework picks the vendor itself and never disclosed which, making a provider-keyed voice unauthorable rather than merely wrong. Adds the provider-agnostic `realtime.voice.default.voice` slot, filed onto whichever driver resolves — every realtime driver already reads the same neutral `voice` bag key by design (ElevenLabs maps it to `tts.voice_id` on the wire), so no per-driver accessor is needed. Precedence is per-key: the agnostic value wins `voice` while a matching `providers.<key>` bag still contributes its other settings, so a runtime pick beats a vendor-pinned value in agent metadata. With no agnostic voice authored, behavior is unchanged. Also ends the silence around it — the mint log now carries the resolved driver and the voice that reached it, both realtime surfaces log when authored provider bags matched nothing, and the resolved `DriverClass` is surfaced to the browser on `StartRealtimeClientSessionResult` — and consolidates three byte-identical copies of the vendor-selection walk into one `SelectRealtimeVendorForModel`.

  Minor rather than patch because the change is additive to the public API: `SelectRealtimeVendorForModel`, `RealtimeVendorSelection`, `MatchProviderVoiceSettings` and `WarnOnUnmatchedProviderVoice` are newly exported from `@memberjunction/ai-agents`, and `RealtimeClientSessionPrepResult` / `StartRealtimeClientSessionResult` gain `DriverClass`.

  Three compatibility notes, in rough order of how likely they are to bite:
  1. **Deploy the client and server together.** A new `@memberjunction/ng-conversations` against an older MJAPI silently drops a picked voice for **every** provider including OpenAI, because the older server's `normalizeVoice` does not carry `default.voice` through the cascade — a regression of currently-working behavior, so a same-version bump is not enough if the two deploy independently. The reverse (old client, new server) is safe: the `providers.openai` shape is still honored.
  2. **The agent-type `ConfigSchema` reaches a database only via `mj sync push`.** The schema gains the agnostic slot and marks `providers.*.voiceId` deprecated (no driver has ever read it). Until that push runs, authoring `realtime.voice.default.voice` in an agent's `TypeConfiguration` **fails the save** — the old schema validates `voice.default` with `additionalProperties: false`. Runtime overrides are unaffected; they bypass that validator.
  3. **Bridge hosts that supply a voice without pinning a model now forward that id to whatever vendor wins the priority walk.** `BridgeRealtimeSessionContext.RealtimeVoice` is host-supplied (LiveKit/Twilio/Teams) and independent of the model pin, so a previously inert misconfiguration becomes reachable: an OpenAI voice name like `echo` reaching ElevenLabs is sent as `tts.voice_id`, and an invalid voice id there fails the session rather than degrading. An agnostic voice is only as portable as the id itself — pin the model alongside the voice, or author per-vendor ids under `providers.<key>`.

  One gap found here was closed separately in the same release: **Gemini** consumed the neutral `voice` key no further than its config object — `buildConnectConfig` assigned the bag onto a `LiveConnectConfig` with no `voice` property, so the value was dropped before the wire. `@memberjunction/ai-gemini` now maps it to `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName` on both topologies (#3721). Separately, only `OpenAIRealtime`, `xAIRealtime` and `HuggingFaceRealtime` declare `SupportedVoices` (HuggingFace returns none) and the native picker's dropdown is gated on that list, so for the vendors this unblocks the voice is reachable through agent metadata and programmatic hosts rather than the picker.

- 1c0d586: Flow agents now execute on the durable task-graph dispatcher instead of walking their own graph
  inside an agent run.

  `FlowAgentType.DetermineInitialStep` compiles the agent's steps and paths into a `TaskGraphSpec` and
  returns a `Tasks` step; `BaseAgent.executeTasksStep` submits it and detaches. From there a workflow
  is `Task` rows owned by a server-side dispatcher, with the same claiming, conditions, skip cascade,
  retry and failure semantics as any other graph — one traversal engine rather than two that drift.
  The in-run walker is retained as the reference implementation the compiler is checked against, but
  refuses at its single choke point, so a workflow that runs at all provably ran on the new engine.

  Also in this change:
  - `Task` gains `StepType`, `PromptID` and a typed `Configuration` bag (`ITaskStepConfiguration`)
    carrying kind-specific settings, the payload mappings, the execution policy and the author's
    canvas layout. `CK_Task_Assignment` now counts `PromptID`.
  - Payload mapping semantics are lifted into `@memberjunction/ai-core-plus` so both engines share one
    dialect — the `*` wildcard, case-insensitive result lookup, `[]` append, `$message` fields, and the
    `static:` / `payload.` / `data.` / `context.` prefixes.
  - `ForEach` and `While` steps run through a new `TaskLoopExecutor`: bounds (`maxIterations: 0` means
    unlimited), `continueOnError`, delay, and parallel batches that keep results in **iteration** order.
  - New deterministic DAG layout (`LayoutTaskGraph` / `LayoutGraphNodes` / `GraphLayoutBounds`) — a
    `Task` row has no position columns, so a run view previously drew every node on the origin.
  - A settled graph credits its spending back to the submitting run through the `…Rollup` columns on
    `AIAgentRun`, which existed since v3 and were never written. `TotalCost` keeps its current meaning.
  - `TaskGraphActionRunner` returns a flat, name-addressable result instead of an `ActionParam[]`, so
    output mappings resolve and branch conditions can be evaluated.
  - `GetTaskGraphSubmitter()` now honours its documented contract and returns `null` when no
    durable-execution package is loaded, instead of an instantiated abstract base.

  New guide: `guides/WORKFLOW_AND_TASK_GRAPH_GUIDE.md`.

### Patch Changes

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

- Updated dependencies [71817db]
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
- Updated dependencies [d8adda1]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/search-engine@6.1.0-edge.2
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/actions-base@6.1.0-edge.2
  - @memberjunction/actions@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/ai-engine-base@6.1.0-edge.2
  - @memberjunction/aiengine@6.1.0-edge.2
  - @memberjunction/storage@6.1.0-edge.2
  - @memberjunction/ai-vector-dupe@6.1.0-edge.2
  - @memberjunction/ai-prompts@6.1.0-edge.2
  - @memberjunction/ai-reranker@6.1.0-edge.2
  - @memberjunction/ai-vector-sync@6.1.0-edge.2
  - @memberjunction/templates@6.1.0-edge.2
  - @memberjunction/context-crush@6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

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

- 394d276: Phase 8 of the unified workflow DAG engine program (plan: PR #3456) — the remaining Track D mechanisms, plus the observability decision that had been open across three reviews.

  **A live signal from the dispatcher.** The choice was between claim-store cache invalidation and semantic frames; frames won because a consumer should render "step 3 of 7 running" from the event itself rather than re-reading Task rows and diffing them to guess what changed. `TaskGraphObserver` emits `TaskStarted` / `TaskCompleted` / `TaskFailed` / `TaskBlocked` / `TaskAwaitingHuman` / `GraphSettled`, and MJServer publishes them on a new `taskGraphFrames(parentTaskId)` subscription.

  Addressed by **`ParentTaskID`, deliberately not by session**: a durable graph outlives the tab that submitted it and may be started by a schedule with no session at all, so keying on the graph means "watch this workflow run" works for whoever is permitted to see it, whenever they arrive — including after a refresh, which a session-keyed push cannot survive. Emit points sit where the fact is already true: `TaskStarted` after the claim is held, `Task{Completed,Failed}` only once the guarded write lands, `GraphSettled` outside the continuation's once-only CAS. The observer is optional and its errors are swallowed in one place, because a frame is commentary on work and must never stall or fail a graph.

  Delivery **fails closed**. A `parentTaskId` is discoverable, so without a connection-identity check anyone holding one could watch another user's workflow, per-step error messages included. Ownership rides on the frame — resolved once per graph and memoized, since a subscription filter runs per frame and synchronously, and a database round trip there would make watching a run cost more than running it. It lives in the parent's durable metadata rather than a column because `Task.UserID` already means "the person this task waits on"; setting it on a parent would make every graph look like a human task.

  **`MAX_REINVOKE_DEPTH` finally compares against a real number.** Phase 3 shipped the cap and Phase 4 shipped the metadata carrying `reinvokeDepth`, but the value was permanently zero: `Submit` reads it from its caller, `BaseAgent` never passed one, and a reinvoked agent had no way to know it _was_ a continuation. Phase 7 therefore left `Reinvoke` unimplemented on purpose — a cap that never fires is worse than one continuation mode being unavailable, because the failure mode is an unbounded chain of real agent runs. `AIAgentRun.ContinuationDepth` closes the loop: the deliverer stamps depth + 1 on the run it starts, `BaseAgent` passes its own run's depth into any graph it submits, and the chain is bounded. `Reinvoke` degrades to posting whenever it cannot restart a turn (no submitting run, run or agent unloadable) and never throws, since the dispatcher calls it inside the delivery CAS.

  **Scheduled jobs answer what to do about fire times they missed.** `MissedRunPolicy` — `RunOnce` (default), `RunAll`, `Skip`. The default is not a preference: `updateJobStatistics` already computed the next run from _now_, so a job whose `NextRunAt` had passed ran once and jumped forward. That is `RunOnce`, and defaulting to `Skip` would have silently stopped every existing job in every install from catching up. `RunAll` is safe to offer because its next run is computed from the occurrence just consumed, so a week-long outage walks one occurrence per poll tick rather than firing 168 jobs at once. "Missed" is defined cron-relatively — a _later_ occurrence has also come due — rather than by a grace window, which would misjudge a per-minute job after a short pause and a monthly job that is a week late in opposite directions.

  The decision **fails open** throughout: it can only ever withhold a run the schedule already said was due, so an unparseable cron or a helper returning anything but a date lets the job through. And it is **synchronous** on purpose — it runs immediately before lock acquisition, where an added microtask reorders against the sweep's fire-and-forget cleanup; only the skip branch writes, and that is awaited separately.

  **One-shot scheduling needed no new schedule shape.** `Status='Expired'` had been a declared value that nothing ever set. `isJobDue` already refused a job past its `EndAt`, so such a job stopped running on its own — but stayed `Active` forever, permanently inert, and kept driving `UpdatePollingInterval`, so "cron at T plus `EndAt` just after T" left the whole scheduler polling at that job's cadence for a job that would never run again. Retiring it is the fix; "run once at T" was already expressible. Deliberately narrow: only `Active`/`Pending` transition, because a `Paused` job was put there by a person, and only `EndAt` triggers it, since a cron always has a next occurrence and inferring exhaustion would be guessing.

  **IT71 grows to 18.** TG17 asserts the new schema through the ORM rather than trusting the migration — the pair that drifted in Phase 4 when a migration applied but CodeGen ran against a stale definition. TG18 saves a job with `RunAll`, reloads it to prove the value survives the CHECK constraint, and saves a policy-less job to prove the `RunOnce` default.

### Patch Changes

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
  - @memberjunction/storage@6.1.0-edge.1
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/aiengine@6.1.0-edge.1
  - @memberjunction/search-engine@6.1.0-edge.1
  - @memberjunction/ai-engine-base@6.1.0-edge.1
  - @memberjunction/ai-prompts@6.1.0-edge.1
  - @memberjunction/ai-reranker@6.1.0-edge.1
  - @memberjunction/ai-vector-dupe@6.1.0-edge.1
  - @memberjunction/ai-vector-sync@6.1.0-edge.1
  - @memberjunction/actions-base@6.1.0-edge.1
  - @memberjunction/templates@6.1.0-edge.1
  - @memberjunction/context-crush@6.1.0-edge.1
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
- Updated dependencies [0acf96e]
- Updated dependencies [1100077]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/actions@6.1.0-edge.0
  - @memberjunction/actions-base@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/search-engine@6.1.0-edge.0
  - @memberjunction/aiengine@6.1.0-edge.0
  - @memberjunction/ai-engine-base@6.1.0-edge.0
  - @memberjunction/ai-core-plus@6.1.0-edge.0
  - @memberjunction/ai-prompts@6.1.0-edge.0
  - @memberjunction/ai-reranker@6.1.0-edge.0
  - @memberjunction/ai-vector-dupe@6.1.0-edge.0
  - @memberjunction/ai-vector-sync@6.1.0-edge.0
  - @memberjunction/storage@6.1.0-edge.0
  - @memberjunction/templates@6.1.0-edge.0
  - @memberjunction/context-crush@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-engine-base@6.0.0
  - @memberjunction/ai-core-plus@6.0.0
  - @memberjunction/aiengine@6.0.0
  - @memberjunction/ai-prompts@6.0.0
  - @memberjunction/ai-reranker@6.0.0
  - @memberjunction/ai-vector-dupe@6.0.0
  - @memberjunction/ai-vector-sync@6.0.0
  - @memberjunction/actions-base@6.0.0
  - @memberjunction/actions@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/storage@6.0.0
  - @memberjunction/search-engine@6.0.0
  - @memberjunction/templates@6.0.0
  - @memberjunction/context-crush@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- c382605: Fix realtime relayed-tool dispatch for scoped anonymous magic-link sessions (#3371): delegated agent runs, co-agent observability writes (creation, transcript/tool-turn appends, usage accumulation, finalize), and recording uploads now execute under the system user once session ownership is proven — gated on MagicLinkScope, excluding public web-widget guests, and failing closed to the caller when no system user is available. The session's `allowedAgents` colleague union is now CanRun-gated against the original caller before dispatch, so elevation cannot widen agent authority, and delegated runs carry the visitor's id as `userId` so run attribution and context-memory scope stay the person's. Adds the IT68 scoped-anon-elevation deterministic integration bundle proving the permission contract on a live database.
- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ai-engine-base@5.51.0
  - @memberjunction/ai-core-plus@5.51.0
  - @memberjunction/aiengine@5.51.0
  - @memberjunction/ai-prompts@5.51.0
  - @memberjunction/ai-reranker@5.51.0
  - @memberjunction/ai-vector-dupe@5.51.0
  - @memberjunction/ai-vector-sync@5.51.0
  - @memberjunction/actions-base@5.51.0
  - @memberjunction/actions@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/storage@5.51.0
  - @memberjunction/search-engine@5.51.0
  - @memberjunction/templates@5.51.0
  - @memberjunction/context-crush@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

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
- Updated dependencies [0686d52]
- Updated dependencies [c7b6710]
- Updated dependencies [764d6f6]
- Updated dependencies [408e4bf]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai-core-plus@5.50.0
  - @memberjunction/ai-prompts@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/search-engine@5.50.0
  - @memberjunction/actions-base@5.50.0
  - @memberjunction/storage@5.50.0
  - @memberjunction/ai-engine-base@5.50.0
  - @memberjunction/aiengine@5.50.0
  - @memberjunction/ai-reranker@5.50.0
  - @memberjunction/ai-vector-dupe@5.50.0
  - @memberjunction/ai-vector-sync@5.50.0
  - @memberjunction/actions@5.50.0
  - @memberjunction/templates@5.50.0
  - @memberjunction/context-crush@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Minor Changes

- bc388e3: Realtime QA hardening — every finding from the adversarial audit of the driver-family consolidation (PR #3177) plus the broader co-agent architecture, fixed with regression tests (plan: `plans/complete/realtime-qa-hardening.md`).

  **Regression fixes (A-items)** — bodyless provider `error` frames are recoverable again on raw-WS providers (adapter synthesizes the payload; transport failures stay fatal); `Capabilities.CanReconfigureTurnMode` is profile-gated (`supportsLiveReconfigure` — HuggingFace now truthfully reports false and `Reconfigure` no-ops); protected wire fields (`type`/`instructions`/`tools`) can no longer be overridden through the open Config bag (closing a strict-endpoint session.update kill vector) while the documented `audio` override remains; the client-direct minted `SessionConfig` now applies the residual bag with the same construction order as server-bridged (the two topologies are actually identical); deferred-config listener cleanup on early teardown; family-wide empty-transcript suppression; settle-handle + adapter buffer hygiene.

  **Robustness (B-items)** — connect/readiness deadlines everywhere (client WS `connectTimeoutMs` covering open + `session.created`, with socket-death/`Disconnect` releasing the awaited `Connect`; server `configReadinessTimeoutMs` rejecting `WaitForConfigApplied` on silent endpoints without cancelling the deferred apply); stale-`response.done` protection (a cancelled turn's trailing done can't release the busy lock under a locally-initiated replacement); TRUE-barge-in drops queued tool-result auto-triggers (the model never speaks over a user who took the floor; delivery via the user's next turn); WebRTC remote-stream handlers cleared on Disconnect; WS sends gated on socket-open.

  **Architecture (C-items)** — `realtime.session` tuning config (`effortLevel`/`parallelToolCalls`/`mcpTools`/`inputTranscriptionModel`) now flows config→bag→driver on BOTH topologies (`GetSessionTuningSettings`; the PR #3177 driver features are live end-to-end); per-modality usage detail (`RealtimeUsage.Input/OutputTokenDetails`) captured by the OpenAI driver, accumulated by the runner, and persisted on the realtime `AIPromptRun` for multi-channel cost attribution; HF proxy hardening (optional `MJ_REALTIME_PROXY_ALLOWED_ORIGINS` allowlist, upstream-open deadline, bounded pre-open buffer); the session runner observes the chained cancellation signal and performs bounded transport reconnects (default 1, `MaxTransportReconnects`); MCP approval requests are auto-DENIED so the turn continues instead of dead-air blocking; Gemini scrubs+warns on foreign OpenAI-protocol/transport keys (`REALTIME_SHARED_CONFIG_KEYS` exported from Core); `RealtimeTranscript.ReplacesPrevious` added for streamed-final providers.

  Suite totals after the wave: ai-openai 147, ai-realtime-client 391, ai-agents 1653, ai-gemini 87, ai-xai 50, ai-huggingface 34, MJServer proxy 8 — all passing.

  **Second-pass re-audit fixes**: a follow-up adversarial audit of the hardening itself found the C1 fix was inert (the new realtime.session field was never propagated through the effective-config resolver — now fixed with normalizeSession), plus untested edges introduced by the B2 counter (permanent wedge on a rejected response.create — now self-heals on the error frame), the C7 reconnect (abort/Stop race leaking a live session; stale call_id relayed to the fresh session; no re-entrancy/identity guard — all fixed), the client connect deadline (timer leak on synchronous socket-construction throw), reused-instance socket handling (old socket late close corrupting the new session), the C4 abort window (abort during StartSession lost), model not being a protected wire field, and ReplacesPrevious being ignored at the transcript-persist site. All fixed with regression + interaction-seam tests.

  **Fifth-pass re-audit fixes**: a five-reviewer verification pass found one reachable correctness bug and closed two latent transcript fragilities. (1) The pass-4 client `onErrorFrame` fix cleared the pending narration kind only when no confirmed response was active, so a narration create rejected while a cancelled response drained mistagged the next delegated-answer turn as ephemeral (dropping its transcript) — the kind is now cleared unconditionally on the rejecting error. (2) The transcript in-flight-row bookkeeping moved to an `{id, open}` model so a turn that emits both an interim delta and repeated streamed completeds still collapses to one row, and a short assistant final no longer suppresses the next turn's interim streaming row. Coverage added for the `confirmedResponseActive` busy-lock guard and the per-turn `ReplacesPrevious` reset (xAI + HuggingFace).

  **Fourth-pass re-audit fixes**: a four-reviewer pass found one regression from the third-pass work and several reachable pre-existing defects, all fixed with regression tests. (1) The third-pass usage un-gate let a trailing usage frame accumulate after `Stop()` and arm a post-finalize checkpoint timer — now gated on the runner lifecycle (`!stopped`) instead. (2) `RealtimeTranscript.ReplacesPrevious` is now wired END-TO-END: the shared server session flags the 2nd+ streamed user transcription completed (Grok streams repeated growing finals) and `persistRealtimeTranscript` uses status-disambiguated reuse, so server-bridged Grok/ElevenLabs no longer mint a duplicate `ConversationDetail` per caption (previously the flag was only ever set client-side). (3) The client `onErrorFrame` self-heal now clears the eager `responseActive`/narration phantom left by a rejected local `response.create` (a `confirmedResponseActive` flag distinguishes it from a live VAD turn) so `IsBusy` no longer wedges on compat endpoints. (4) The tool broker aborts EVERY concurrent delegation on barge-in (was: only the newest, orphaning the rest). (5) The HuggingFace server session declares its native 16 kHz sample rate (was: bridge fell back to 24 kHz into a 16 kHz pipeline). (6) A stuck delegate can no longer leak stale narration-burst timing across a reconnect (burst state reset decoupled from the delegation counter).

  **Third-pass re-audit fixes**: a third adversarial pass against the latest `next` found three residual seams: (1) the C8 transcript-persist fix only bound the in-flight key on the INTERIM branch, so a FINALS-ONLY streamed provider (e.g. Grok user captions, ElevenLabs corrections) that never emits an interim delta still minted a duplicate `ConversationDetail` row per correction — the create+finalize branch now binds the key too; (2) the C7 reconnect blanket-zeroed the runner's shared `activeDelegations` counter, which — combined with each aborted delegation's self-decrementing `finally` — could double-decrement and steal a CONCURRENT post-reconnect delegation's narration burst; the reset is gone (frames self-unwind); (3) `OnUsage` was identity-gated like every other handler, so a trailing usage frame flushed on the just-dropped socket was silently discarded — usage is runner-GLOBAL (cumulative) and is now un-gated. Plus a bounded-worst-case characterization test for the S1 self-heal. All fixed with regression + interaction-seam tests.

### Patch Changes

- c5e4b9e: Agent conversation compaction: durable cross-turn summaries stored on the conversation (Sequence + SummaryPromptRunID, budget knobs on AIAgentType/AIAgent, Compaction run steps), conversation-history retrieval tools (getMessageBySequence, getMessagesByRange, searchConversation, summarizeRange), edit handling with OriginalMessageChanged flagging and a wired chat edit affordance, plus hardening fixes: failed message expansions now surface a reason to the model (breaks an unbounded retry loop), json5 ESM import fix restores the local JSON-repair tier, and SQLConverter no longer truncates PG column comments at escaped apostrophes.
- 5473e9a: Filter the `since` parameter through `sqlDate` in the PostgreSQL dialect of the `GetConversationsForMemoryManager` query, which Memory Manager runs via `RunQuery` (`memory-manager-agent.ts:704`).

  The PG template interpolated the parameter straight into the SQL string (`>= '{{ since }}'`). The SQL Server sibling was fixed in `7cd4953574` (2026-07-18); that commit touched only `get-conversations-for-memory-manager.sql`, so the `.pg.sql` file kept the raw interpolation it has carried since it was added on 2026-04-28, and the two dialects drifted apart.

  `sqlDate` parses the value as a `Date`, throws on unparseable input, and returns `'${date.toISOString()}'` — it emits its own quotes, so the manual quotes in the old line were wrong twice over: the value was unfiltered, and a filtered value would have been double-quoted. The filter is dialect-agnostic (unlike `sqlBoolean` and `sqlIdentifier`, it has no platform-aware override in `RunQuerySQLFilterManager`), so the same filter is correct for both engines. The file already used `{{ agentIds | sqlIn }}`, so the filter mechanism was live here and `since` was simply the one that was missed.

  Metadata-only change — it reaches the database through the release's consolidated `mj sync push`, not through a migration.

- 373c5f6: Fix a concurrency race that could persist a realtime transcript turn twice.

  The session runner dispatches provider transcript frames fire-and-forget (`void this.handleTranscript(t)`), so frames for the same role are processed concurrently. `persistRealtimeTranscript` did a check-then-act on the in-flight turn map that spanned `await`s (GetEntityObject / Load / Save), so two captions arriving a few milliseconds apart could both observe "no tracked row yet", both take the create branch, and write the turn twice.

  Observed live against a streamed Grok session: one user utterance produced two byte-identical `ConversationDetail` rows, the duplicate created 17ms _before_ the first row's final update. Streamed-caption providers (Grok) are the most exposed since they emit many finals per turn, but the interim-racing-its-own-final variant applies to any provider.

  Transcript persistence is now serialized per role through a promise chain, making the read-modify-write atomic with respect to other frames of the same role. Roles remain independent and are not serialized against each other. A frame that fails no longer strands the rest of its role's queue.

  Adds regression coverage for concurrent (non-awaited) frames — overlapping streamed captions, an interim racing its final, cross-role independence, and failure isolation. This class of bug was invisible to the existing suite, which drove every persist call sequentially.

  Also bounds session teardown against a stuck write: `Stop()` now drains queued transcript writes after the provider session closes (so no new frames can arrive) and before the result is built — so tail writes land and the turn count doesn't undercount — under a hard timeout (`TranscriptFlushTimeoutMs`, default 5s). A hung or rejected drain is logged and teardown finalizes anyway; losing a tail write is strictly better than wedging the session.

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [7db8ef5]
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
- Updated dependencies [78a5e44]
  - @memberjunction/core@5.49.0
  - @memberjunction/ai-core-plus@5.49.0
  - @memberjunction/ai-prompts@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/actions@5.49.0
  - @memberjunction/ai-vector-sync@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/search-engine@5.49.0
  - @memberjunction/templates@5.49.0
  - @memberjunction/ai-engine-base@5.49.0
  - @memberjunction/aiengine@5.49.0
  - @memberjunction/ai-reranker@5.49.0
  - @memberjunction/ai-vector-dupe@5.49.0
  - @memberjunction/actions-base@5.49.0
  - @memberjunction/storage@5.49.0
  - @memberjunction/context-crush@5.49.0

## 5.48.0

### Patch Changes

- 2143b98: Fix realtime agent media library failing with "Entity AI Agents not found in metadata" — the agent lookup in `resolveAgentMediaCollectionID` used the pre-v5 unprefixed entity name `'AI Agents'` instead of the canonical `'MJ: AI Agents'`, so an agent's media kit (`DefaultMediaCollectionID` collection) silently never loaded at realtime session start. Adds a regression test pinning the canonical entity name.
- Updated dependencies [09e1b4b]
- Updated dependencies [c20723a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/ai-engine-base@5.48.0
  - @memberjunction/ai-core-plus@5.48.0
  - @memberjunction/aiengine@5.48.0
  - @memberjunction/ai-prompts@5.48.0
  - @memberjunction/ai-reranker@5.48.0
  - @memberjunction/ai-vector-dupe@5.48.0
  - @memberjunction/ai-vector-sync@5.48.0
  - @memberjunction/actions-base@5.48.0
  - @memberjunction/actions@5.48.0
  - @memberjunction/storage@5.48.0
  - @memberjunction/search-engine@5.48.0
  - @memberjunction/templates@5.48.0
  - @memberjunction/context-crush@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ai-engine-base@5.47.0
  - @memberjunction/ai-core-plus@5.47.0
  - @memberjunction/aiengine@5.47.0
  - @memberjunction/ai-prompts@5.47.0
  - @memberjunction/ai-reranker@5.47.0
  - @memberjunction/ai-vector-dupe@5.47.0
  - @memberjunction/ai-vector-sync@5.47.0
  - @memberjunction/actions-base@5.47.0
  - @memberjunction/actions@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/storage@5.47.0
  - @memberjunction/search-engine@5.47.0
  - @memberjunction/templates@5.47.0
  - @memberjunction/context-crush@5.47.0
  - @memberjunction/ai@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/ai-engine-base@5.46.0
  - @memberjunction/aiengine@5.46.0
  - @memberjunction/ai-prompts@5.46.0
  - @memberjunction/ai-core-plus@5.46.0
  - @memberjunction/ai-reranker@5.46.0
  - @memberjunction/ai-vector-dupe@5.46.0
  - @memberjunction/ai-vector-sync@5.46.0
  - @memberjunction/actions-base@5.46.0
  - @memberjunction/actions@5.46.0
  - @memberjunction/storage@5.46.0
  - @memberjunction/search-engine@5.46.0
  - @memberjunction/templates@5.46.0
  - @memberjunction/context-crush@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- Updated dependencies [572d219]
  - @memberjunction/ai-core-plus@5.45.1
  - @memberjunction/ai-engine-base@5.45.1
  - @memberjunction/aiengine@5.45.1
  - @memberjunction/ai-prompts@5.45.1
  - @memberjunction/ai-reranker@5.45.1
  - @memberjunction/ai-vector-dupe@5.45.1
  - @memberjunction/ai-vector-sync@5.45.1
  - @memberjunction/templates@5.45.1
  - @memberjunction/search-engine@5.45.1
  - @memberjunction/context-crush@5.45.1
  - @memberjunction/ai@5.45.1
  - @memberjunction/actions-base@5.45.1
  - @memberjunction/actions@5.45.1
  - @memberjunction/core@5.45.1
  - @memberjunction/core-entities@5.45.1
  - @memberjunction/global@5.45.1
  - @memberjunction/storage@5.45.1

## 5.45.0

### Minor Changes

- 19ec4b0: Phase 2 of the core AI Skill library: seven new skills (Document Builder, Communications, Data Import & Transform, File Management, Scheduling & Automation, Lists & Audiences, Code & Computation) with externalized instruction templates and bundled actions/sub-agents; the SkillSmith meta-agent (interviews, discovers bundle members, drafts guardrailed instructions, persists skills as Pending for review); and MJAISkillEntityServer, which defaults AISkill.CreatedByUserID to the context user so programmatic creation paths (Create Record action, scripts) work without knowing the acting user's ID.
- b2927f1: Omnibus fixes: (1) skill-granted sub-agent execution — resolveSubAgentByName now resolves from the same runtime-effective set the prompt offers and validation approves (skill activations / subAgentChanges), the resolved entity threads into child dispatch, and execution-time not-found retries are bounded by the shared validation-retry cap with a self-correcting available-sub-agents message (fixes an infinite delegation loop observed live on Research Agent → Infographic Agent); (2) RunView dedup/linger cache write-invalidation on entity events (@memberjunction/core); (3) regenerated class-registration manifests.
- 6125dcd: Skill activation governance & observability (v5.45): double activation gate (AISkill.ActivationMode × AIAgent.SkillActivationMode, both defaulting to RequestedOnly — self-activation requires Auto×Auto; /skill user requests unaffected) via new GetAutoActivatableSkillsForAgent; AIAgent.RequirePlanMode forces plan mode on every root run; AIAgentRun.PlanMode stamps plan-mode runs; plan-mode runs block skill activations after approval (re-plan required); AIAgentRunStep.Skills JSON records per-step AgentSkillInvocation provenance (activation type, gate values, agent-stated reason) on Skill/Prompt/Actions/Sub-Agent steps with native-grant precedence; agent-run UX gains a Plan Mode header chip, Skill/Plan step icons, per-step skill chips, and a Skills drill-in tab with provenance cards.

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
  - @memberjunction/ai-prompts@5.45.0
  - @memberjunction/ai-reranker@5.45.0
  - @memberjunction/ai-vector-dupe@5.45.0
  - @memberjunction/ai-vector-sync@5.45.0
  - @memberjunction/actions-base@5.45.0
  - @memberjunction/actions@5.45.0
  - @memberjunction/storage@5.45.0
  - @memberjunction/search-engine@5.45.0
  - @memberjunction/templates@5.45.0
  - @memberjunction/ai@5.45.0
  - @memberjunction/context-crush@5.45.0

## 5.44.0

### Minor Changes

- eb38a42: Agent media library: a realtime agent can now draw on a curated, governed **media kit** during a conversation — a `MJ: Collections` of `MJ: Artifacts` bound to the agent via the new `AIAgent.DefaultMediaCollectionID`, with per-membership `ContextDescription` ("when to show it") and `Preload` on `MJ: Collection Artifacts`. The `MediaChannelServer` resolves the kit at session start and feeds the model a manifest so it can surface items via the existing `Media_ShowMedia` tool. Additive only; reuses Files/streaming/viewers/versioning/permissions (no new top-level entity). Requires the companion migration + CodeGen.
- 3633fbb: Agent Skills, Plan Mode, and realtime widget UX.

  **Agent Skills** — portable `SKILL.md` import/export, a first-class Skill step wired into the Loop agent runtime, Skills engine caching + agent-gating resolution, the `AI Skills` resource type with "Can Share Skills" authorization, and the AI Skill sharing panel in the entity forms. Includes the skill-markdown converter/operations and the generated entity + resolver surface for the new Skill entities.

  **Plan Mode** — a human-in-the-loop plan-approval gate for the Loop agent (server + client), threaded through the agent client session/types, the GraphQL AI client, and the conversations composer/message-input UI so a run can pause for plan review before executing.

  **Realtime voice widget UX** — fixes and consolidation in `@memberjunction/ng-conversations`:
  - Fixed `NG0100 ExpressionChangedAfterItHasBeenCheckedError` when opening the Details panel (defer the `ResizeObserver` seed + callback to a microtask).
  - The surface/Details panel is now an independent right-hand peek gated on available width (not console chrome / text-reveal), so opening Details keeps the glowing orb and toggling captions off no longer removes the panel; the orb also returns immediately on captions-off.
  - Type-to-compose: any printable keystroke opens the composer and seeds itself as the first character (removed the dedicated "T" hotkey + hint).
  - Control consolidation: the banner is now state + window-chrome only (removed duplicate Captions/End controls, folded "pure audio" into the gear's Density = Simple); Captions is promoted to a first-class control in the compact lean dock.

  **Remote Browser** — `RemoteBrowserSnapshot` now honors its documented best-effort contract: it returns an empty snapshot instead of throwing when the underlying browser adapter has been torn down, so the client's periodic live-view poll never surfaces a recurring GraphQL error (with unit coverage).

- d88568e: Add agent token-optimization primitives and framework wiring (Headroom-inspired).

  New package `@memberjunction/context-crush` — dependency-light, framework-agnostic token-optimization primitives:
  - `CrushJSON` / `DescribeCrush` — deterministic, byte-stable structural JSON compression (array-of-objects → columns/rows, null elision, string interning, budget guard) with a reversible legend.
  - `PartitionStablePrefix` — splits a conversation into a cache-stable prefix and a volatile tail.
  - `CrushCode` (subpath `@memberjunction/context-crush/code`) — AST-aware SQL/TypeScript reduction that preserves signatures and collapses non-focal bodies.

  `@memberjunction/ai-agents` wiring:
  - Action-result summaries structurally compress large inline JSON values — whether an output param is a raw object/array **or a JSON string** (many actions `JSON.stringify` their payload, e.g. `run-adhoc-query`'s `Results`); default on, opt out per agent via `crushActionResults: false`.
  - `pruneAndCompactExpiredMessages` now confines pruning/compaction to the volatile tail, preserving the provider KV-cache prefix; overflow recovery still reaches the prefix when required.
  - Opt-in AST reduction of large _code-string_ action results, enabled per agent type via the `crushCodeLang` prompt param (`'sql'` | `'typescript'`); not wired to any agent by default.
  - `MemoryManagerAgent` now mines failed runs for corrective `Issue`/`Context` notes (never `Constraint`), tagged `Ephemeral` so they decay unless reinforced, with full run-step observability. The selector keys on the run's own failure signals — `Status IN ('Failed','Cancelled')` **or** `Success = 0` (subsuming the safety-net and context-recovery failures the engine records as `Status='Failed'`).

  Credits the Headroom project (Apache-2.0) as the conceptual source; all primitives are independent TypeScript re-implementations.

- 1367fbb: AI Skill permissions (full agent parity) + `/skill` composer invocation. Skills now use the same dedicated-table, **open-by-default** permission model as AI Agents via `MJ: AI Skill Permissions`: a cached runtime helper (`AISkillPermissionHelper`, open-by-default) and a unified-engine provider (`AISkillPermissionProvider`, closed-by-default / Sharing Center), grantee-exclusivity enforced by `MJAISkillPermissionEntityServer`, and a `GetSkillsForAgent(agent, user?)` filter so the model's skill catalog is intersected with the acting user's Run permission. The old `AI Skills` Resource-Type sharing is retired in favor of a skill-scoped permissions grid (`SkillPermissionsPanel`/`Dialog`/`Service`), with the `Can Share Skills` authorization repointed to it. End users invoke a skill for a message by typing `/skill-name` in the conversation composer (mirrors `@agent`/`#entity`; picker filtered by permission, chips use `AISkill.IconClass`/`Color`); selected IDs thread through the client → resolver → runtime chain as `ExecuteAgentParams.requestedSkillIDs` (both the `RunAIAgent` and `RunAIAgentFromConversationDetail` mutations), and `BaseAgent.preActivateRequestedSkills` activates them at run start only if they survive the guard (agent-accepted ∩ user-permitted). Requires the companion Agent Skills migration + CodeGen.
- 91842c3: Seed the core AI Skill library: first 3 shipped skills (Web Research, Data Analysis & Queries, Data Visualization) with externalized instruction templates, bundled actions, and bundled sub-agents (Query Strategist, Infographic Agent). Wires the ai-skills metadata directory into the sync directoryOrder and adds junction/lookup pull config.
- 6f74b17: Add an LLM/agentic reasoning pass on top of the embedding/vector duplicate-detection pipeline — "vectors filter, reasoning validates". A small/fast LLM judges high-probability vector candidates (Merge / NotDuplicate / Uncertain) to shrink the human-review set, strengthening or weakening the vector score rather than replacing it. Adds a dual-provider reasoning seam (Prompt/Agent), per-entity gating (EnableLLMReasoning, ReasoningThreshold, AutomationLevel), per-candidate verdict/audit columns, the new @memberjunction/record-comparison engine + resolver/client, and an in-place reasoning UI in the duplicates dashboard. Fully back-compat: EnableLLMReasoning defaults to 0, leaving the vector-only path byte-for-byte unchanged.
- aa9102d: feat(media+realtime): generic media player, end-to-end media streaming, and the realtime/LiveKit recording stack

  A new media + recording platform spanning the player, storage, server, and the realtime/voice stack.

  **Generic media player (`@memberjunction/ng-media-player`, new package)** — a framework-agnostic
  `mj-media-player` (transport, click/drag scrubber, playback speed, ±skip, keyboard, fullscreen,
  multi-track video grid, a real decoded audio waveform that doubles as the scrubber and accepts
  precomputed `MediaTrack.Peaks`, a time-synced clickable transcript, loading/buffering state with an
  `aria-live` status, cancelable `Before*` events, and an imperative API) plus an MJStorage-bound
  `mj-storage-media-player` that resolves a `FileID` to an authenticated, range-streamed source. The
  artifact audio/video viewers and previews now embed it.

  **MJStorage streaming (`@memberjunction/storage`)** — `FileStorageBase.GetObjectStream` +
  `SupportsStreaming` + `StreamingNotSupportedError`, implemented for all seven drivers (Box, AWS S3,
  Azure, GCS, Google Drive, SharePoint, Dropbox).

  **Authenticated media delivery (`@memberjunction/server`)** — a `CreateMediaAccessToken` mutation
  (short-lived, permission-gated, returns precomputed waveform peaks) and a `GET /media/:fileId?token=`
  HTTP-Range streaming route — any stored asset is served to the browser by `FileID` with real
  streaming + permissions, no public links.

  **Realtime co-agent recording (`@memberjunction/ng-conversations`, `@memberjunction/ai-realtime-client`,
  `@memberjunction/ai-agents`)** — client-direct sessions record a seekable 16-bit WAV with capture-time
  waveform peaks (a `peaks.json` sidecar); the agent's remote audio is mixed in when its WebRTC track
  lands (`OnRemoteMediaStream`/`AttachRemoteStream`); transcript cue timing anchors to real audio onset
  across tool-call gaps; recorded sessions stream back through the player. Plus reactive fixes
  (`ConversationEngine.EnsureConversationLoaded` in `@memberjunction/core-entities`) so new conversations
  and recordings appear without a refresh.

  **LiveKit meeting recording (`@memberjunction/livekit-room-server`, `@memberjunction/server`,
  `@memberjunction/graphql-dataprovider`, `@memberjunction/ng-mj-livekit-room`)** — egress output is
  registered as an `MJ: Files` row linked to the Meeting-Room `Conversation` (new `RecordingFileID` /
  `EgressID`), with point-at-sink or copy-to-canonical storage, and played back in the Meet UI.

  **Realtime surface-tab overhaul (`@memberjunction/ng-conversations`)** — channel tabs appear only once
  used (Whiteboard excepted), each color/icon-coded; the Activity tab is gated, restyled, and
  right-aligned; agent-run artifacts move out of per-artifact tabs into the Activity tab with a
  resizable, `UserInfoEngine`-persisted split viewer.

  The Media channel can now show MJStorage files (`fileId`) in addition to URLs. The realtime
  recordings dashboard (`@memberjunction/ng-dashboards`) and CodeGen-regenerated entity forms
  (`@memberjunction/ng-core-entity-forms`) reflect the new recording fields.

- 2f926df: feat(prompt-parts): scope-aware, pluggable prompt construction (ScopedPromptPart + PromptComponentResolver)

  Adds a first-class, scope-aware prompt-construction primitive to MJ core. `ScopedPromptPart` is a
  small, named, role-tagged fragment of prompt text attached to an `AIPrompt` and optionally narrowed
  by the **same polymorphic scope the agent runtime already carries for memory** (`PrimaryScopeEntity`/
  `PrimaryScopeRecordID` + `SecondaryScopes`). Any MJ app can control LLM behavior per scope by editing
  rows, not code.
  - **Entity + controls:** `__mj.ScopedPromptPart` with `Name`, `Role`, `Sort`, `Text`, `Status`, the
    polymorphic scope columns, and the resolver controls `MergeBehavior` (`Override` | `Append`) and
    `Priority`. The inclusion rule is data-driven, not hardcoded.
  - **Resolution + assembly:** cached on `AIEngine` (`ScopedPromptParts`); resolved by
    `PromptComponentResolver` — a **template-method** class whose protected hooks (`getCandidates`,
    `isInScope`, `score`, `selectIncluded`, `order`) are the extension points. Within a part `Name`,
    the most-specific scope wins (`Override`) or all in-scope parts accumulate (`Append`); distinct
    names compose additively. Roles are preserved (System/User/Assistant) — assembled messages drive
    the model directly, not flattened.
  - **Pluggable:** the agent runtime obtains the resolver via
    `MJGlobal.ClassFactory.CreateInstance(PromptComponentResolver)`, so a downstream consumer can
    `@RegisterClass(PromptComponentResolver) class X extends PromptComponentResolver { … }` and override
    the protected hooks for custom inclusion/scope logic — **no core change required**.
  - **Agent wiring:** `BaseAgent` resolves + injects scoped parts (role-faithful) alongside memory/RAG,
    using the run's existing primary/secondary scopes.

  Verified by unit tests (`PromptComponentResolver`) and a full agent run demonstrating the scope cascade.

### Patch Changes

- 5396d90: Add permission-constrained engine loading to BaseEngine — pre-checks entity read permissions during Config() and skips all entity configs (all-or-nothing) when the user lacks access, preventing endless retry loops and console error flooding for org-scoped SaaS users. Engine getters now use GetConfigData() which throws a typed PermissionConstrainedError instead of silently returning empty arrays. Also fixes unsafe GetHighestPowerModel/GetHighestPowerLLM return types and resolves FK_AIAgentRunStep_ParentID race in fire-and-forget step saves.
- Updated dependencies [3633fbb]
- Updated dependencies [d88568e]
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
  - @memberjunction/context-crush@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ai@5.44.0
  - @memberjunction/ai-vector-dupe@5.44.0
  - @memberjunction/storage@5.44.0
  - @memberjunction/ai-prompts@5.44.0
  - @memberjunction/ai-reranker@5.44.0
  - @memberjunction/ai-vector-sync@5.44.0
  - @memberjunction/templates@5.44.0
  - @memberjunction/search-engine@5.44.0
  - @memberjunction/actions-base@5.44.0
  - @memberjunction/actions@5.44.0

## 5.43.0

### Minor Changes

- aa21fef: Flow agent loop fixes: correct loop-body action resolution + static collections
  - **Fix**: ForEach/While loop-body **Action** steps now resolve against the standard Action registry (`ActionEngineServer.Instance.Actions`) instead of the legacy AI Actions collection (`AIEngine.Instance.Actions`). Previously any flow loop over a normal Action (e.g. Google Custom Search) failed with "Action not found for loop body" even though the action existed and ran fine as a non-loop step.
  - **Feature**: ForEach `collectionPath` now supports a `static:[...]` literal collection (e.g. `static:[1,2,3,4,5]`), letting a flow iterate a fixed list/range without a prior step to build the array in the payload.

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ai-core-plus@5.43.0
  - @memberjunction/actions@5.43.0
  - @memberjunction/ai-prompts@5.43.0
  - @memberjunction/ai@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/ai-engine-base@5.43.0
  - @memberjunction/aiengine@5.43.0
  - @memberjunction/ai-reranker@5.43.0
  - @memberjunction/ai-vector-dupe@5.43.0
  - @memberjunction/ai-vector-sync@5.43.0
  - @memberjunction/actions-base@5.43.0
  - @memberjunction/storage@5.43.0
  - @memberjunction/search-engine@5.43.0
  - @memberjunction/templates@5.43.0

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

- 4ec1732: Make the Meet app's LiveKit Live Room work end-to-end (default agent resolution, realtime model fallback, real backing session row, bridge-driver registration, connect timeout, and active device selection), then build it into a multi-party experience: a pre-join agent picker, threading a target agent so the co-agent actually responds, in-room add/remove of agents, and shareable human invite links. Also improves Entity Vector Sync with a concise per-document summary, verbose-gated pipeline logging, and a batched Entity Record Document existence read that replaces an N+1 query storm.

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

- e7c2437: Goal-driven browser control — blend computer-use with the remote browser so a realtime agent (or human) sets a high-level goal ("log into this site and open the latest invoice") and computer-use plans + executes it, instead of issuing granular actions.
  - **`@memberjunction/remote-browser-base`**: `IRemoteBrowserSession.RunComputerUseGoal(goal, options)` + `RemoteBrowserGoalResult` / `RunComputerUseGoalOptions` (with `OnProgress`, `Signal`, `ContextUser`, and `AgentRunID`/`AgentRunStepID` for narration, barge-in, per-user execution, and run-step observability). The `ComputerUse` vs `NativeAI` strategy is resolved by the existing `resolveControlStrategy`.
  - **`@memberjunction/remote-browser-cdp`**: `CdpRemoteBrowserSession.RunComputerUseGoal` drives MJ computer-use against the session's **own** already-attached `PlaywrightBrowserAdapter` (the same instance/CDP connection the human watches — no second browser), behind an injectable `ComputerUseGoalRun` seam (`SetGoalEngineFactory`). **Model-blind credential injection**: a `Context` object's `{{label}}` tokens are substituted with real values in a _cloned_ action at the CDP boundary, so neither the realtime model nor the computer-use controller ever sees the value (the recorded/logged action stays templated).
  - **`@memberjunction/remote-browser-server`**: `RemoteBrowserEngine.AchieveGoal(agentSessionID, goal, opts)` + the pure, testable `dispatchRemoteBrowserGoal()` strategy switch. **Collaborative pause-on-takeover**: a granted human takeover (or session end) aborts the in-flight goal so the computer-use loop pauses cooperatively rather than racing the human on the shared browser.
  - **`@memberjunction/computer-use-engine`**: controller auto-selection now prefers the highest-power LLM that advertises **Image input** modality (vision-capable), falling back to the plain highest-power LLM so selection never hard-fails (`pickHighestPowerVisionLLM`). New `AgentRunStepTracker` nests a child `Prompt` step per controller/judge prompt under the goal's parent step (linking each prompt run via `TargetLogID`), with the per-prompt step writes **fire-and-forget** (queued, flushed once at goal end) so an N-iteration goal pays no synchronous DB round-trips on its hot loop.
  - **`@memberjunction/ai-core-plus`**: new shared, single-source-of-truth step machinery — `initAgentRunStep` / `finalizeAgentRunStep` (field-level create/finalize semantics) AND `AgentRunStepSaveQueue` (the fire-and-forget INSERT/chained-UPDATE/`IgnoreDirtyState`/flush orchestration), reused by both `BaseAgent` and the Computer Use tracker (no copy-paste).
  - **`@memberjunction/ai-agents`**: `BaseAgent` refactored to delegate step field population to the shared helpers AND its save orchestration to the shared `AgentRunStepSaveQueue` (behavior-preserving; full 1348-test suite green).
  - **`@memberjunction/server`**: `ExecuteRemoteBrowserGoal` GraphQL mutation **+ production binding** — `MJProgressComputerUseEngine` (MJ prompt-runner routing, vision-model auto-selection, media persistence, progress narration) is bound to the CDP goal-engine seam at startup via `BindRemoteBrowserGoalEngine`. **Run-step observability**: the resolver creates one parent "Browser goal" `Tool` step on the realtime co-agent run (`beginBrowserGoalStep`) and threads it down so the goal's prompt runs nest under it.
  - **`@memberjunction/ng-conversations`**: `browser_AchieveGoal` realtime tool + channel route to the goal mutation.

  77 new unit tests (cdp 22, remote-browser-server 7, computer-use-engine 15, ai-core-plus 16 step helpers + save-queue, @memberjunction/server 15 goal-engine glue, ai-agents 2 createStepEntity nesting/target/InputData paths) plus the full 1350-test ai-agents suite green after the behavior-preserving refactor. Credentials use MJ's model-blind context-variable injection. No migrations. Live browser + LLM validation is the only step deferred — see `plans/realtime/computer-use-remote-browser-blend.md`.

- 0c6bf61: Entity Vector Sync: ship standard Search Entity Documents, no-op cleanly when none are configured, and remove a duplicate metadata load at startup.

  **`@memberjunction/ai-vector-sync` (minor — ships new seed metadata; downstream installs must run `mj sync push` / a metadata migration to pick up the standard Search Entity Documents):**
  - Adds a standard set of Active `Search`-type Entity Documents — `MJ: Entities`, `MJ: AI Agents`, `MJ: Actions`, `MJ: AI Prompts`, `MJ: AI Models` — under `/metadata/entity-documents/` (+ Nunjucks templates and a folder README), all on the in-process `Simple Vector Service Provider` + `gte-small (Local)` stack (no API key, no per-token cost). Semantic / hybrid `Provider.SearchEntity` now works out of the box for these core catalogs.
  - `EntityVectorSyncer.GetActiveEntityDocuments` returns `[]` (logging a warning for an unknown/misspelled type name) instead of throwing when no Active documents of the requested type exist, so unattended callers don't hard-fail on an empty/fresh DB.

  **`@memberjunction/core-actions` (patch):** `VectorizeEntityAction` returns `Success`/`ResultCode: "NO_DOCUMENTS"` (a benign no-op) when there are no Active Entity Documents of the requested type — so the daily `Entity Vector Sync` scheduled job no longer reports a _failed_ run on a fresh DB — and captures `Config()`/lookup errors as a legible `FAILED` result instead of an uncaught throw. Also fixes a latent `error as any`.

  **`@memberjunction/aiengine` + `@memberjunction/ai-agents` (patch — startup perf / telemetry):** `AIEngine.RefreshActions` now reuses already-cached `MJ: Actions` metadata via `BaseEngineRegistry.TryGetCachedRecords` instead of loading a second copy into `ActionEngineBase` (a separate singleton from the server-side `ActionEngineServer`); `BaseAgent.initializeEngines` loads `ActionEngineServer` before `AIEngine` so the registry hit lands. Together these eliminate the duplicate 6-entity `RunViews` batch (and its "Duplicate RunView Detected" telemetry warning) at agent/scheduled-job startup.

  **Keyless local vector providers (`@memberjunction/ai-vectordb`, `@memberjunction/ai-vectors-memory`, `@memberjunction/ai-vector-dupe` — patch):** `VectorDBBase` gains a `RequiresAPIKey` capability (default `true`); `SimpleVectorServiceProvider` overrides it to `false` since it's in-process (reads vectors from `MJ: Entity Record Documents.VectorJSON`, no external service). Both the Entity Vector Sync pipeline and the duplicate-record detector now consult `RequiresAPIKey` (in addition to the existing colocated-query exemption) before rejecting a provider for a missing key — fixing a spurious `No API Key found for Vector Database SimpleVectorServiceProvider` that blocked the standard Search docs above from vectorizing. The dupe detector also no longer pre-throws on a missing embedding key, so local embedding models (e.g. `gte-small (Local)`) work there too, matching the sync pipeline.

  Adds 14 unit tests (9 covering the VectorizeEntityAction no-op / failure-aggregation / error-capture / param-shaping paths; 3 covering `RefreshActions` registry-reuse vs. base-engine fallback; 2 covering the `RequiresAPIKey` default + `SimpleVectorServiceProvider` override). No code migrations; the only downstream action is the metadata sync noted above. Docs updated: `ENTITY_SEARCH_GUIDE.md`, `@memberjunction/ai-vector-sync` README, `metadata/entity-documents/README.md`, `CACHING_AND_PUBSUB_GUIDE.md`, and JSDoc.

- 78f834d: Wire the realtime-session factory so a LiveKit-bridged agent actually talks. Adds `BaseAgent.StartBridgeRealtimeSession()` — opens a raw `IRealtimeSession` for the agent (reusing the same model resolution + system-prompt/memory assembly as the client-direct realtime path, minus the RealtimeSessionRunner since the bridge engine owns turn-taking) — and `CreateBridgeRealtimeSession`, the provider-agnostic factory that resolves the agent + instantiates its `BaseAgent` and calls it. `RealtimeBridgeResolver` binds the factory onto `LiveKitAgentRoomCoordinator` at module load. The coordinator now threads `NativeModuleSpecifier` (default `@memberjunction/ai-bridge-livekit-native`, overridable via `LIVEKIT_NATIVE_MODULE` env / `SetNativeModuleSpecifier`) into the bridge session Configuration so the native room client loads. Completes the agent-talking path for the LiveKit bridge.
- 008f449: Serve Memory Manager maintenance reads from the AIEngine cache instead of per-cycle `RunView`/`RunViews` calls. The scheduled Memory Manager job (every ~15 min) was re-querying `MJ: AI Agent Notes` and `MJ: AI Agent Examples` — entities `AIEngineBase` already holds fully in memory and keeps current via `BaseEntity` events — tripping the "Entity Already in Engine" redundancy telemetry on every run. The consolidation event-trigger count, the orphan-prune, TTL-expiry, and decay-candidate scans, and the **hardening pass** (the provisional-note load, `Status='Provisional' AND AuthorType='Agent'`) now filter/sort/cap the cached arrays in-memory. The scan-only paths project to plain rows (mutation re-`Load()`s fresh owned entities, so cached instances are never aliased); the hardening pass operates on the cached note entities directly and saves them — consistent with the existing dedupe-save path, which already saves cached note instances returned by `FindSimilarAgentNotes`. The cache-miss note-resolver fallback and transactional `MJ: AI Agent Runs` reads intentionally remain DB queries.
- Updated dependencies [256ab06]
- Updated dependencies [c871a4d]
- Updated dependencies [9b9b484]
- Updated dependencies [d185a5c]
- Updated dependencies [e7c2437]
- Updated dependencies [37c73f6]
- Updated dependencies [0c6bf61]
- Updated dependencies [4ec1732]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/ai-core-plus@5.42.0
  - @memberjunction/ai-prompts@5.42.0
  - @memberjunction/core@5.42.0
  - @memberjunction/actions@5.42.0
  - @memberjunction/templates@5.42.0
  - @memberjunction/ai-vector-sync@5.42.0
  - @memberjunction/aiengine@5.42.0
  - @memberjunction/ai-vector-dupe@5.42.0
  - @memberjunction/actions-base@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/ai-engine-base@5.42.0
  - @memberjunction/ai-reranker@5.42.0
  - @memberjunction/storage@5.42.0
  - @memberjunction/search-engine@5.42.0
  - @memberjunction/ai@5.42.0

## 5.41.0

### Minor Changes

- 6f227ab: Realtime voice co-agent: direct channel control, full observability, Grok client-direct, and channel onboarding.
  - **Direct channel control** — the voice co-agent now drives interactive channels (the `browser_` and `Whiteboard_` tools) DIRECTLY instead of delegating every request to the target agent. The framing was fixed in both the client-direct path (`realtime-client-session-service.ts`, the path actually used) and the server-bridged path (`base-agent.ts`). A one-line mint log now surfaces the exact tools + framing reaching the model.
  - **Auto/Default model resolution** — now walks candidate Realtime models by power and returns the first that fully resolves to a usable client-direct driver, instead of dead-ending on a keyless or non-client-direct top pick (e.g. a newly-seeded Grok/Inworld model outranking GPT Realtime).
  - **Co-agent observability** — the co-agent's long-lived `AIPromptRun` now captures the full conversation: transcript turns AND channel tool calls (recorded run-only as `🔧 <tool> … → <result>`), closing the gap where the run held only token totals. Observability parity with every other MJ agent run.
  - **Grok Voice client-direct** — implemented xAI's OpenAI-Realtime-compatible client-direct topology: server ephemeral-token mint (`CreateClientSession` + `SupportsClientDirect`) plus a new browser-side WebSocket-audio client driver in `@memberjunction/ai-realtime-client` (registered under `Provider: 'xai'`). Grok is now selectable for voice sessions.
  - **Channel onboarding** — a first-run intro/details panel generalized to any interactive channel (Whiteboard, Remote Browser, future ones) via an optional `GetOnboardingDetails()` on `BaseRealtimeChannelClient`; excluded for the base Voice channel and persisted per-user via `UserInfoEngine`.
  - **Fix** — NG0100 `ExpressionChangedAfterItHasBeenCheckedError` on channel reveal (agent-activity tab mutations now deferred to a microtask).

- cd6c5f0: Realtime AI Agents wave 3: consolidated v5.41 migration (sessions, channels, co-agent schema) with the AIAgentCoAgent affinity registry replacing AIAgentPairedAgent — typed relationship vocabulary (CoAgent implemented; Peer/Delegate/Fallback/Reviewer/Observer reserved), type-level co-agent defaults as junction rows (removing the only FK cycle in core MJ), and the full code sweep (engine cache, resolver resolution chain, server-side invariants, client pairing reads, regenerated manifests). Realtime UX: progressive-disclosure voice console with persisted captions preference, user-owned composer and tabs toggles, audio-reactive visuals; whiteboard pages/multi-select and review-persistence fixes. Gemini Live triggering turns ride realtime text so widget clicks/typed input/narration speak immediately on native-audio models. CodeGen: single-winner IsNameField enforcement with eligibility guardrail fixes, SCC-based cycle diagnostics, and clean-database bootstrap robustness (conditional engine registry datasets).

### Patch Changes

- 659ee5b: Realtime co-agent pairing & type configuration. New `MJ: AI Agent Paired Agents` junction (opt-in: a co-agent with zero rows stays universal — today's zero-config default unchanged; rows restrict + prebuild its target list with an IsDefault preselection), `AIAgent.TypeConfiguration` (agent-type-specific JSON: realtime model preference, per-provider voice, tone/speaking style, override policy, narration pacing), and `AIAgentType.ConfigSchema`/`DefaultConfiguration` (the type publishes a JSON Schema + type-level defaults; effective config = type defaults <- agent config <- runtime overrides, deep-merged per key, server-authoritative). Runtime overrides ride a new `configOverridesJson` session-start argument gated by the seeded `Realtime: Advanced Session Controls` authorization (Developer-mapped) — enforced server-side, disclosed client-side (unauthorized users silently get defaults). ValidateAsync server subclasses enforce ConfigSchema conformance, Realtime-type co-agents, and at-most-one-default-per-co-agent. Conversations UX: co-agent picker for everyone with more than one permitted co-agent (persisted via UserInfoEngine), pairing-constrained target selection, authorization-gated model/config override pickers.
- cc604aa: Agent in-flight memory writes: agents can commit durable cross-run memories mid-run via the memoryWrites loop-response field, gated by AIAgent.AllowMemoryWrite (ON by default — opt out per agent). Writes land as immediately-injectable Provisional agent notes (new Status value, with AuthorType provenance) under framework-enforced guards (descriptive types only, scope clamp, exact-restatement dedupe with same-run supersede, per-run cap, TTL), inject with recency-wins precedence and per-note recorded dates, and are hardened or pruned by a new Memory Manager pass each cycle. Cross-run dedupe requires exact normalized restatement so corrections are never silently absorbed into a stale note; the loop-agent prompt instructs agents not to claim a memory was saved before its result message arrives.
- 15b743b: Real-Time AI Agents — Sessions, Channels & the Realtime Model (plans/ai-agent-sessions.md). Adds the AIAgentSession/AIAgentChannel/AIAgentSessionChannel schema (+ AgentSessionID on AIAgentRun/ConversationDetail, CloseReason on AIAgentSession); the BaseRealtimeModel server primitive with OpenAIRealtime + GeminiRealtime drivers (server-bridged StartSession and client-direct ephemeral-token CreateClientSession, optional SendContextNote/RequestSpokenUpdate interim updates); the new @memberjunction/ai-realtime-client package with the BaseRealtimeClient browser abstraction + OpenAI/Gemini client drivers resolved via ClassFactory by provider key; the Realtime agent type + Voice Co-Agent with RealtimeSessionRunner/RealtimeToolBroker, AgentMemoryContextBuilder extraction, server session lifecycle (SessionManager, SessionJanitor, start/close/heartbeat + client-direct resolvers with delegated-run progress streaming, AwaitingFeedback resume, co-agent observability runs, user-selectable realtime model); the full-panel realtime voice call UX in ng-conversations (phone trigger + agent/model picker, banner/thread/activity rail, delegation working/result cards with provenance, ephemeral paced first-person progress narration driven by DB prompt templates, in-call text composer); Realtime Voice admin (AI Analytics dashboard sections, session/channel custom forms, agent Runs|Sessions execution history); and Query Builder/Strategist reliability fixes (entity catalog in prompt, Get Entity Details sample caps + semantic fallback, plan formatting). Also: the standalone @memberjunction/ng-whiteboard package (collaborative board with agent tool API, sandboxed interactive widgets + input bridge, markdown panels, exports, cancelable before/after events); ElevenLabs Agents + AssemblyAI Voice Agent realtime provider pairs (4-provider matrix, zero contract changes); session review mode with multi-leg resume carryover (timeline dividers, artifact junction closure, prior-transcript model hydration); delegation cancel channel; usage telemetry relay; Realtime Co-Agent rename with run-step/prompt-run observability.
- 1568bae: Realtime ledger completion + two field bugs. SERVER CHANNEL PLUGIN HALF: `ServerPluginClass` is now consumed — `BaseRealtimeChannelServer` lifecycle contract in @memberjunction/ai, `RealtimeChannelServerHost` (ClassFactory resolution mirroring the client half, per-session instances, failure-isolated hooks, post-close dispose linger) in ai-agents with a `WhiteboardChannelServer` reference impl that validates/canonicalizes landed board saves, wired through SessionManager create/close and the channel-state save path. TRANSCRIPT CORRECTIONS END-TO-END: `RealtimeClientTranscript.ReplacesPrevious` (stamped by the ElevenLabs driver on `agent_response_correction`) replaces the caption in place and `RelayRealtimeTranscript(replacesPrevious)` updates the persisted turn instead of appending. ASSEMBLYAI RESUME WINDOW: one-shot `session.resume` reattach on unexpected socket drop (mic/playout survive; failed/second drop falls through to the old fatal path). WHITEBOARD: widget srcdoc rebuilt per mount via a view-scoped pure pipe — SVG charts survive page switches/lazy remounts, and mounted widgets no longer reload on unrelated journal ops (the old journal-invalidated identity cache was both stale on remount and over-eager on 'replace'). CONVERSATIONS: surface-panel (re)creation lands on the marquee channel tab (the whiteboard) instead of the Activity rail, the agent's first stroke reveals synchronously, and session review now merges channel states across ALL chain legs (newest leg with a saved board wins) so resumed sessions never hide an earlier leg's drawing. Plus Per-Minute/Per-Hour AI model price unit types seeded via metadata.
- Updated dependencies [8fd6f59]
- Updated dependencies [d38ecbb]
- Updated dependencies [1e81848]
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
  - @memberjunction/ai-vector-dupe@5.41.0
  - @memberjunction/ai-vector-sync@5.41.0
  - @memberjunction/ai@5.41.0
  - @memberjunction/aiengine@5.41.0
  - @memberjunction/ai-engine-base@5.41.0
  - @memberjunction/ai-core-plus@5.41.0
  - @memberjunction/ai-prompts@5.41.0
  - @memberjunction/ai-reranker@5.41.0
  - @memberjunction/actions-base@5.41.0
  - @memberjunction/actions@5.41.0
  - @memberjunction/storage@5.41.0
  - @memberjunction/search-engine@5.41.0
  - @memberjunction/templates@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- Updated dependencies [da2ee38]
  - @memberjunction/ai-vector-dupe@5.40.2
  - @memberjunction/ai-engine-base@5.40.2
  - @memberjunction/ai@5.40.2
  - @memberjunction/ai-core-plus@5.40.2
  - @memberjunction/aiengine@5.40.2
  - @memberjunction/ai-prompts@5.40.2
  - @memberjunction/ai-reranker@5.40.2
  - @memberjunction/ai-vector-sync@5.40.2
  - @memberjunction/actions-base@5.40.2
  - @memberjunction/actions@5.40.2
  - @memberjunction/core@5.40.2
  - @memberjunction/core-entities@5.40.2
  - @memberjunction/global@5.40.2
  - @memberjunction/storage@5.40.2
  - @memberjunction/search-engine@5.40.2
  - @memberjunction/templates@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-engine-base@5.40.1
  - @memberjunction/ai-core-plus@5.40.1
  - @memberjunction/aiengine@5.40.1
  - @memberjunction/ai-prompts@5.40.1
  - @memberjunction/ai-reranker@5.40.1
  - @memberjunction/ai-vector-dupe@5.40.1
  - @memberjunction/ai-vector-sync@5.40.1
  - @memberjunction/actions-base@5.40.1
  - @memberjunction/actions@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/storage@5.40.1
  - @memberjunction/search-engine@5.40.1
  - @memberjunction/templates@5.40.1
  - @memberjunction/ai@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Minor Changes

- 6ea4de7: Stop loop-agent JSON format drift and add infinite-loop guardrails. Framework action and sub-agent delegation records are now written to the conversation as user-role environment annotations instead of assistant-role prose, so models no longer imitate the framework's narration and drift out of the required JSON envelope. The unparseable-output retry feedback is now a directive demanding JSON-only output, and a consecutive-unproductive-retries guardrail (cap 10) prevents parse-failure retry loops. Also sets MaxIterationsPerRun=50 on the Query Strategist agent metadata.

### Patch Changes

- f2cca15: Fix research-agent reports being dropped from chat, add pluggable inline artifact previews, and correct Prompt Run token display.
- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/ai-engine-base@5.40.0
  - @memberjunction/ai-core-plus@5.40.0
  - @memberjunction/aiengine@5.40.0
  - @memberjunction/ai-prompts@5.40.0
  - @memberjunction/ai-reranker@5.40.0
  - @memberjunction/ai-vector-dupe@5.40.0
  - @memberjunction/ai-vector-sync@5.40.0
  - @memberjunction/actions-base@5.40.0
  - @memberjunction/actions@5.40.0
  - @memberjunction/storage@5.40.0
  - @memberjunction/search-engine@5.40.0
  - @memberjunction/templates@5.40.0
  - @memberjunction/ai@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Minor Changes

- 3d4510c: Add an agent-run watchdog that prevents `AIAgentRun` records from being left in `Status='Running'` after a process restart, crash/OOM, or a failed terminal-state write. While a run is in flight the owning process stamps a new `LastHeartbeatAt` column; a staleness-based sweep (once on boot and on a timer) force-fails any `Running` run whose heartbeat has gone stale, and a graceful-shutdown handler cancels the in-flight runs the process owns. All timing is anchored to the database clock and the sweep only ever touches `Status='Running'` rows, so it is safe across multiple MJAPI instances behind a load balancer. Also adds an optional, opt-in `Agent Run Sweep` scheduled-job type (`AgentRunSweepScheduledJobDriver`) that runs the same idempotent sweep through MJ's scheduler for audit/observability.
- d1cc0ad: agents can run a multi-step, server-side dataflow over their Actions and artifact tools in a single turn, with only the final result entering the context window. Stages pass structured JSON (PowerShell-style) and bind to fields via a safe, eval-free path grammar; operators include where/select/sort/groupBy/distinct/first/last/count/jsonpath/lines/grep/head/tail, plus map and let. Requested via nextStep.type: 'Pipeline'.
- 34fe6d1: Capture and surface AI prompt-cache cost across providers — OpenRouter provider-reported cost passthrough; per-model cache read/write pricing on AI Model Costs with cache-aware cost calculation; cache-token rollups on AI Prompt Runs and Agent Runs; and cache hit-rate + dollar-savings analytics across the AI dashboards (Cost & Budget, Model Performance, Prompt Runs, Usage Patterns, Executive Summary) and the prompt-run / agent-run detail views. Includes a migration adding cache columns — run CodeGen after applying.

### Patch Changes

- Updated dependencies [26761b8]
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [7dfacc7]
- Updated dependencies [3c53858]
- Updated dependencies [d1cc0ad]
- Updated dependencies [db4addf]
- Updated dependencies [8c39dd9]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [a2aecc7]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/actions@5.39.0
  - @memberjunction/core@5.39.0
  - @memberjunction/ai-vector-sync@5.39.0
  - @memberjunction/search-engine@5.39.0
  - @memberjunction/ai-core-plus@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ai-prompts@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0
  - @memberjunction/ai-engine-base@5.39.0
  - @memberjunction/aiengine@5.39.0
  - @memberjunction/ai-reranker@5.39.0
  - @memberjunction/ai-vector-dupe@5.39.0
  - @memberjunction/actions-base@5.39.0
  - @memberjunction/storage@5.39.0
  - @memberjunction/templates@5.39.0

## 5.38.0

### Minor Changes

- 8bd97f3: fix: image display + artifact/attachment unification cleanup
  - Add ImageArtifactViewerPlugin for raster image artifacts
  - Remove persist gate so agent-generated media always persists as artifacts
  - AgentRunner writes media artifacts directly (bypass deprecated ConversationDetailAttachment)
  - Remove deprecated SuggestedResponses feature (superseded by ResponseForm)
  - Backfill migration for legacy ConversationDetailAttachment rows
  - Remove all back-compat reads from deprecated ConversationDetailAttachment

### Patch Changes

- 6b6c321: Agent latency optimizations and parallel sub-agent execution:
  - **Embedding cache** (`AIEngine.EmbedText`): Replaced unbounded `Map` + FIFO eviction with `MJLruCache` (5000-entry LRU). Cache key now `${modelId}|sha256(text)` so a large text doesn't pin its full string. Cache stores in-flight `Promise<EmbedTextResult>` so concurrent callers share one ONNX inference instead of racing. Failed/empty-vector results evict on settle. Empty/whitespace text short-circuits to `null` without invoking the provider. Options `{ bypassCache: true }` / `{ noCache: true }` and `ClearEmbeddingCache()` exposed.
  - **AgentDataPreloader**: Data-source preload now runs with a bounded concurrency cap (default 10) via a new `resolveDataSources` helper so a long source list can't saturate the DB pool.
  - **Non-blocking step saves**: New `queueStepSave` chains saves on the same step ID (UPDATE can't race INSERT) while letting saves on different steps run concurrently. Failures are logged via `LogError` with `LatestResult.CompleteMessage`. `finalizeAgentRun` drains pending saves via `Promise.allSettled` (not `Promise.all`, which swallowed failures after the first rejection), folds failure counts into `agentRun.ErrorMessage`, and clears both `_pendingSaves` and `_stepSavePromises` so reused instances don't leak settled promises.
  - **Parallel sub-agent execution**: Loop agents can now return a `subAgents` array on `nextStep` to fan out to multiple sub-agents at once. Bounded fan-out concurrency (default 5). Each sub-agent receives a deep-cloned input payload (structuredClone with JSON fallback) so siblings can't see each other's in-flight mutations. Delegation messages + progress events are pushed synchronously in source order before any await, so transcript order is deterministic regardless of completion order. Per-sub-agent step `PayloadAtEnd` records that sub-agent's own contribution (not the cumulative merged state) for audit visibility. Termination semantics: parent terminates only when a _successful_ sub-agent requested `terminateAfter: true`; failing sub-agents fall through to `Retry` so the parent can react. Aggregated `user` summary message appended to the parent conversation.
  - **Driver sub-class surface**: Promoted to `protected` for driver sub-classes (e.g. Skip) — the step lifecycle triad (`createStepEntity` / `finalizeStepEntity` / `queueStepSave`), hierarchy display helpers (`formatHierarchicalMessage`, `buildHierarchicalStep`), dispatch utilities (`mapWithConcurrency`, `resolveSubAgentByName`, `cloneSubAgentPayload`, `incrementExecutionCount`, `getExecutionCount`), and read-only state getters (`Depth`, `AgentHierarchy`, `ParentStepCounts`, `FileOutputs`).
  - **Loop agent prompt template** updated to advertise the new `subAgents` array variant alongside `subAgent`, with the parallel-fan-out and success-only-terminate semantics documented so LLMs emit the new shape correctly.

  Tests: `@memberjunction/ai-agents` 806 pass (was 799 — added 7), `@memberjunction/aiengine` 74 pass (was 70 — added 4).

- b2e6782: Propagate `inputArtifacts` from a parent agent to its sub-agents so delegates inherit the artifact manifest and tools (e.g. a Codesmith delegate can read a Data Snapshot the parent references). Add `group_aggregate`, `compute` (safe arithmetic expression parser), `filter`, and `percentile` tools to the DataSnapshot artifact tool library. Improve client-side snapshot capture to wait for actual rows (not just registered tables) and bump the capture timeout to 15s so query-backed / server-paged components have time to load.
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
  - @memberjunction/search-engine@5.38.0
  - @memberjunction/ai-engine-base@5.38.0
  - @memberjunction/ai-prompts@5.38.0
  - @memberjunction/ai-reranker@5.38.0
  - @memberjunction/ai-vector-sync@5.38.0
  - @memberjunction/templates@5.38.0
  - @memberjunction/ai-vector-dupe@5.38.0
  - @memberjunction/actions-base@5.38.0
  - @memberjunction/actions@5.38.0
  - @memberjunction/storage@5.38.0
  - @memberjunction/ai@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [22b775f]
- Updated dependencies [1af94d0]
- Updated dependencies [4f15f31]
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/actions@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ai-engine-base@5.37.0
  - @memberjunction/aiengine@5.37.0
  - @memberjunction/ai-prompts@5.37.0
  - @memberjunction/ai-reranker@5.37.0
  - @memberjunction/ai-vector-sync@5.37.0
  - @memberjunction/templates@5.37.0
  - @memberjunction/ai-vector-dupe@5.37.0
  - @memberjunction/actions-base@5.37.0
  - @memberjunction/storage@5.37.0
  - @memberjunction/search-engine@5.37.0
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
  - @memberjunction/ai-prompts@5.36.0
  - @memberjunction/ai-reranker@5.36.0
  - @memberjunction/ai-vector-dupe@5.36.0
  - @memberjunction/ai-vector-sync@5.36.0
  - @memberjunction/actions-base@5.36.0
  - @memberjunction/actions@5.36.0
  - @memberjunction/storage@5.36.0
  - @memberjunction/search-engine@5.36.0
  - @memberjunction/templates@5.36.0
  - @memberjunction/ai@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Minor Changes

- e9d4b1c: Add missing `Memory Manager - Detect Contradictions` prompt metadata record so the agent's contradiction-detection phase actually runs instead of silently no-opping. Existing installs must run `mj sync push --dir=metadata --include="prompts"` (or the migration on next release) to seed the new prompt + prompt-model bindings; without it the phase remains disabled.

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
  - @memberjunction/ai-prompts@5.35.0
  - @memberjunction/ai-vector-sync@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/ai-engine-base@5.35.0
  - @memberjunction/aiengine@5.35.0
  - @memberjunction/ai-reranker@5.35.0
  - @memberjunction/ai-vector-dupe@5.35.0
  - @memberjunction/actions-base@5.35.0
  - @memberjunction/actions@5.35.0
  - @memberjunction/storage@5.35.0
  - @memberjunction/search-engine@5.35.0
  - @memberjunction/templates@5.35.0
  - @memberjunction/ai@5.35.0

## 5.34.1

### Patch Changes

- 5abf790: fix(ai-agents): preserve context class identity through action and data preload pipelines

  `ExecuteSingleAction` was spreading `params.context` into a plain object to stamp `AgentID`, which destroyed class instances (getters, methods, prototype chain). This broke downstream consumers like Skip's `SkipAgentContext` whose `skipAPIRequest` getter became `undefined` after spreading. Similarly, `preloadAgentData` was spreading `params.context` when merging preloaded data.

  Fixed by mutating properties directly onto the original context object instead of spreading. Also changed `InjectContextMemory` to use `agent.RerankerConfiguration` property instead of `agent.Get('RerankerConfiguration')`. Added JSDoc to `ExecuteAgentParams.context` documenting that `TContext` may be a class instance and must never be spread. Added 20 unit tests covering context identity preservation.

- Updated dependencies [3a35358]
- Updated dependencies [5abf790]
  - @memberjunction/core@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/ai-engine-base@5.34.1
  - @memberjunction/aiengine@5.34.1
  - @memberjunction/ai-prompts@5.34.1
  - @memberjunction/ai-reranker@5.34.1
  - @memberjunction/ai-vector-dupe@5.34.1
  - @memberjunction/ai-vector-sync@5.34.1
  - @memberjunction/actions-base@5.34.1
  - @memberjunction/actions@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/storage@5.34.1
  - @memberjunction/search-engine@5.34.1
  - @memberjunction/templates@5.34.1
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
  - @memberjunction/ai-engine-base@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/aiengine@5.34.0
  - @memberjunction/ai-prompts@5.34.0
  - @memberjunction/ai-reranker@5.34.0
  - @memberjunction/ai-vector-dupe@5.34.0
  - @memberjunction/ai-vector-sync@5.34.0
  - @memberjunction/actions-base@5.34.0
  - @memberjunction/actions@5.34.0
  - @memberjunction/storage@5.34.0
  - @memberjunction/search-engine@5.34.0
  - @memberjunction/templates@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
- Updated dependencies [7716c98]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ai-prompts@5.33.0
  - @memberjunction/ai-engine-base@5.33.0
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/aiengine@5.33.0
  - @memberjunction/ai-reranker@5.33.0
  - @memberjunction/ai-vector-dupe@5.33.0
  - @memberjunction/ai-vector-sync@5.33.0
  - @memberjunction/actions-base@5.33.0
  - @memberjunction/actions@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/storage@5.33.0
  - @memberjunction/ai@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ai-engine-base@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/aiengine@5.32.0
  - @memberjunction/ai-prompts@5.32.0
  - @memberjunction/ai-reranker@5.32.0
  - @memberjunction/ai-vector-dupe@5.32.0
  - @memberjunction/ai-vector-sync@5.32.0
  - @memberjunction/actions-base@5.32.0
  - @memberjunction/actions@5.32.0
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
  - @memberjunction/ai-engine-base@5.31.0
  - @memberjunction/ai@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/aiengine@5.31.0
  - @memberjunction/ai-prompts@5.31.0
  - @memberjunction/ai-reranker@5.31.0
  - @memberjunction/ai-vector-dupe@5.31.0
  - @memberjunction/ai-vector-sync@5.31.0
  - @memberjunction/actions-base@5.31.0
  - @memberjunction/actions@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/storage@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-engine-base@5.30.1
- @memberjunction/ai@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/aiengine@5.30.1
- @memberjunction/ai-prompts@5.30.1
- @memberjunction/ai-reranker@5.30.1
- @memberjunction/ai-vector-dupe@5.30.1
- @memberjunction/ai-vector-sync@5.30.1
- @memberjunction/actions-base@5.30.1
- @memberjunction/actions@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/storage@5.30.1

## 5.30.0

### Minor Changes

- c2c5892: Activate Memory Manager consolidation pipeline with drift prevention, entity-attribute contradiction detection, Ebbinghaus decay-based archival, protection tiers, and composite importance scoring. Adds the `AIAgentNote` consolidation schema (`ConsolidatedIntoNoteID`, `ConsolidationCount`, `DerivedFromNoteIDs`, `ProtectionTier`, `ImportanceScore`) and enforces the vector-store Status invariant write-side in `MJAIAgentNoteEntityServer.Save()` / `.Delete()` so revoked notes are removed from retrieval without an MJAPI restart. Expands Memory Manager observability with per-phase run-step payloads: `scoreDistribution`, `entityTriplesExtracted`, `decayScoreDistribution`, `protectedPreserved`, `ephemeralAccelerated`, consolidation `triggerType` (forced/time/event/count), a new `Verify Consolidation Output` phase-level run step, and per-cluster `Process Consolidation Cluster` child steps. Adds 95th-percentile uniqueness outlier auto-protection in importance scoring. Deprecates the Memory Cleanup Agent in favor of the unified Memory Manager pipeline.
- 4729398: Runtime Actions — Phase 1 complete. Introduces `Action.Type='Runtime'`, a new action type where agents dynamically generate, test, and persist JavaScript actions that execute in MJ's isolated-vm sandbox with a permissioned bridge to metadata, views, queries, entity CRUD, other actions, agents, and AI prompts. Ships the v5.29.x migration (new `RuntimeActionConfiguration`, universal `MaxExecutionTimeMS`, and `CreatedByAgentID` columns on `Action`), the JSONType-authored config interface, the Zod validator with drift detection, the bidirectional IPC bridge in WorkerPool, the full `utilities.*` handler surface, the ActionSmith meta-agent with `Create Runtime Action` / `Test Runtime Action` helpers, Agent Manager wiring, the generic `Execute Agent` action, and Runtime-aware approval UI enhancements. Minor bumps across all touched packages because the schema migration + metadata records are coupled surface changes.

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
  - @memberjunction/actions-base@5.30.0
  - @memberjunction/actions@5.30.0
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/ai-engine-base@5.30.0
  - @memberjunction/ai-prompts@5.30.0
  - @memberjunction/ai-reranker@5.30.0
  - @memberjunction/ai-vector-dupe@5.30.0
  - @memberjunction/ai-vector-sync@5.30.0
  - @memberjunction/storage@5.30.0
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
  - @memberjunction/ai-prompts@5.29.0
  - @memberjunction/ai-reranker@5.29.0
  - @memberjunction/ai-vector-dupe@5.29.0
  - @memberjunction/ai-vector-sync@5.29.0
  - @memberjunction/actions-base@5.29.0
  - @memberjunction/actions@5.29.0
  - @memberjunction/storage@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [fdab4bb]
- Updated dependencies [115e4da]
  - @memberjunction/ai-prompts@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ai-reranker@5.28.0
  - @memberjunction/ai-vector-sync@5.28.0
  - @memberjunction/actions@5.28.0
  - @memberjunction/ai-engine-base@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/aiengine@5.28.0
  - @memberjunction/ai-vector-dupe@5.28.0
  - @memberjunction/actions-base@5.28.0
  - @memberjunction/storage@5.28.0
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
  - @memberjunction/ai-prompts@5.27.1
  - @memberjunction/ai-reranker@5.27.1
  - @memberjunction/ai-vector-dupe@5.27.1
  - @memberjunction/ai-vector-sync@5.27.1
  - @memberjunction/actions-base@5.27.1
  - @memberjunction/actions@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/storage@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ai-engine-base@5.27.0
- @memberjunction/ai@5.27.0
- @memberjunction/ai-core-plus@5.27.0
- @memberjunction/aiengine@5.27.0
- @memberjunction/ai-prompts@5.27.0
- @memberjunction/ai-reranker@5.27.0
- @memberjunction/ai-vector-dupe@5.27.0
- @memberjunction/ai-vector-sync@5.27.0
- @memberjunction/actions-base@5.27.0
- @memberjunction/actions@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0
- @memberjunction/storage@5.27.0

## 5.26.0

### Patch Changes

- 55de456: Fix missing dependencies across 17 packages that accumulated while knip dependency checking was silently broken. Repair knip infrastructure: disable crashing vitest plugin, harden CI workflow to fail-fast on tool crashes instead of silently passing, and fix hardcoded Angular version in auto-fix script.
- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-engine-base@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/aiengine@5.26.0
  - @memberjunction/ai-prompts@5.26.0
  - @memberjunction/ai-reranker@5.26.0
  - @memberjunction/ai-vector-dupe@5.26.0
  - @memberjunction/ai-vector-sync@5.26.0
  - @memberjunction/actions-base@5.26.0
  - @memberjunction/actions@5.26.0
  - @memberjunction/storage@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Minor Changes

- 008a62d: Add file based artifact I/O
- 62af878: Split Sage prompt into Sage + Workflow Planner sub-agent for reduced token usage and faster responses

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [008a62d]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/actions@5.25.0
  - @memberjunction/ai-engine-base@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/aiengine@5.25.0
  - @memberjunction/ai-prompts@5.25.0
  - @memberjunction/ai-reranker@5.25.0
  - @memberjunction/ai-vector-dupe@5.25.0
  - @memberjunction/actions-base@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Minor Changes

- c318a0c: metadata + migrations in this PR == minor

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/ai-prompts@5.24.0
  - @memberjunction/ai-vector-dupe@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/ai-engine-base@5.24.0
  - @memberjunction/aiengine@5.24.0
  - @memberjunction/ai-reranker@5.24.0
  - @memberjunction/actions@5.24.0
  - @memberjunction/actions-base@5.24.0
  - @memberjunction/ai@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Minor Changes

- 513b20c: migration/metadata

### Patch Changes

- 247df16: Fix server-side RunView cache write asymmetry that caused repeated DB queries during metadata sync, add deterministic Nunjucks template parameter extraction via AST, support comma-delimited multi-value fields in validation, and redesign QueryPagingEngine to append paging directly instead of wrapping in CTEs (fixing ORDER BY on non-projected columns and apostrophe-in-comments bugs).
- 1d1e02e: Knowledge Hub Phase 2: autotagging pipeline, duplicate detection dashboards, and client tool invocation system.

  Autotagging: Run Pipeline button with real-time progress, direct vectorization of content items (bypasses entity documents), pipeline stage visualization, Gemini 3 Flash tagging.

  Duplicate Detection: Run Detection button with entity document picker, progress via PubSub, Kanban approve/reject with persistence.

  Client Tools: New 'ClientTools' step type in BaseAgent enabling browser-side tool invocation (navigation, UI display, tab switching) during agent execution. Includes ClientToolRequestManager server singleton, GraphQL subscription transport, runtime tool decoration, three-level timeout, loop agent integration, and 646-line documentation guide.

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [1d1e02e]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/ai-prompts@5.23.0
  - @memberjunction/ai-vector-dupe@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/ai-engine-base@5.23.0
  - @memberjunction/aiengine@5.23.0
  - @memberjunction/ai-reranker@5.23.0
  - @memberjunction/actions-base@5.23.0
  - @memberjunction/actions@5.23.0
  - @memberjunction/ai@5.23.0

## 5.22.0

### Minor Changes

- 21e0b69: Auto-inject current date/time into Loop Agent system prompt
- a42aba6: metadata

### Patch Changes

- 0b23772: Ensure agents use an isolated per-request database provider instead of the shared global singleton.
- cf91278: Fix NVARCHAR(MAX) mangling in SQL parser, resolve Invalid string length error in AI monitoring dashboard, add unit tests for AI agent components, and add replaceElements guidance for loop agent prompts
- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [a42aba6]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/ai-prompts@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/ai-vector-dupe@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/ai-engine-base@5.22.0
  - @memberjunction/aiengine@5.22.0
  - @memberjunction/ai-reranker@5.22.0
  - @memberjunction/actions@5.22.0
  - @memberjunction/actions-base@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/ai@5.22.0

## 5.21.0

### Patch Changes

- b29716c: no metadata/migration
- 76cd2bc: no migration/metadata changes
- Updated dependencies [c7dfb20]
- Updated dependencies [76cd2bc]
- Updated dependencies [845c980]
  - @memberjunction/core@5.21.0
  - @memberjunction/ai-core-plus@5.21.0
  - @memberjunction/ai-prompts@5.21.0
  - @memberjunction/aiengine@5.21.0
  - @memberjunction/ai-engine-base@5.21.0
  - @memberjunction/ai-reranker@5.21.0
  - @memberjunction/actions-base@5.21.0
  - @memberjunction/actions@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/ai@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- 7ab01a8: Fix 'Retry' nextStep type handling for message expansion in LoopAgentType to prevent skipped messages during agent loop iterations
- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ai-engine-base@5.20.0
  - @memberjunction/ai-core-plus@5.20.0
  - @memberjunction/aiengine@5.20.0
  - @memberjunction/ai-prompts@5.20.0
  - @memberjunction/ai-reranker@5.20.0
  - @memberjunction/actions-base@5.20.0
  - @memberjunction/actions@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/ai@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Minor Changes

- f9001de: metadata

### Patch Changes

- @memberjunction/ai-engine-base@5.19.0
- @memberjunction/ai@5.19.0
- @memberjunction/ai-core-plus@5.19.0
- @memberjunction/aiengine@5.19.0
- @memberjunction/ai-prompts@5.19.0
- @memberjunction/ai-reranker@5.19.0
- @memberjunction/actions-base@5.19.0
- @memberjunction/actions@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Minor Changes

- 322dac6: metadata update
- 5f91957: metadata update

### Patch Changes

- ee4bf94: no migration
- Updated dependencies [322dac6]
- Updated dependencies [48f7296]
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/ai-prompts@5.18.0
  - @memberjunction/ai-engine-base@5.18.0
  - @memberjunction/aiengine@5.18.0
  - @memberjunction/ai-reranker@5.18.0
  - @memberjunction/actions@5.18.0
  - @memberjunction/ai@5.18.0
  - @memberjunction/actions-base@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/ai-engine-base@5.17.0
  - @memberjunction/ai-core-plus@5.17.0
  - @memberjunction/aiengine@5.17.0
  - @memberjunction/ai-prompts@5.17.0
  - @memberjunction/ai-reranker@5.17.0
  - @memberjunction/actions-base@5.17.0
  - @memberjunction/actions@5.17.0
  - @memberjunction/core-entities@5.17.0
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
  - @memberjunction/ai-prompts@5.16.0
  - @memberjunction/ai-reranker@5.16.0
  - @memberjunction/actions-base@5.16.0
  - @memberjunction/actions@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/ai@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/core@5.15.0
  - @memberjunction/ai@5.15.0
  - @memberjunction/ai-core-plus@5.15.0
  - @memberjunction/ai-prompts@5.15.0
  - @memberjunction/ai-engine-base@5.15.0
  - @memberjunction/aiengine@5.15.0
  - @memberjunction/ai-reranker@5.15.0
  - @memberjunction/actions-base@5.15.0
  - @memberjunction/actions@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/actions-base@5.14.0
  - @memberjunction/actions@5.14.0
  - @memberjunction/ai-engine-base@5.14.0
  - @memberjunction/ai-core-plus@5.14.0
  - @memberjunction/aiengine@5.14.0
  - @memberjunction/ai-prompts@5.14.0
  - @memberjunction/ai-reranker@5.14.0
  - @memberjunction/core-entities@5.14.0
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
  - @memberjunction/ai-prompts@5.13.0
  - @memberjunction/ai-reranker@5.13.0
  - @memberjunction/actions-base@5.13.0
  - @memberjunction/actions@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/ai@5.13.0

## 5.12.0

### Minor Changes

- 05f19ff: Add composable query system with semantic catalog search, CTE composition engine, server-side paging, query caching with TTL/dependency invalidation, and agent directive surfacing. Includes QueryCacheManager wrapper over LocalCacheManager, QueryPagingEngine for SQL-level OFFSET/FETCH paging, QueryCompositionEngine for platform-aware CTE generation, and SearchQueryCatalog action for vector-based query discovery. Renames PaginationComponent to DataPagerComponent and extracts into shared module.
- d92502e: migration/metadata

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
  - @memberjunction/ai-prompts@5.12.0
  - @memberjunction/ai-reranker@5.12.0
  - @memberjunction/actions-base@5.12.0
  - @memberjunction/actions@5.12.0
  - @memberjunction/ai@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Minor Changes

- 0dca9db: Update Research Writer Prompts to use Gemini.

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/ai-engine-base@5.11.0
  - @memberjunction/ai-core-plus@5.11.0
  - @memberjunction/aiengine@5.11.0
  - @memberjunction/ai-prompts@5.11.0
  - @memberjunction/ai-reranker@5.11.0
  - @memberjunction/actions-base@5.11.0
  - @memberjunction/actions@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/ai@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai-engine-base@5.10.1
- @memberjunction/ai@5.10.1
- @memberjunction/ai-core-plus@5.10.1
- @memberjunction/aiengine@5.10.1
- @memberjunction/ai-prompts@5.10.1
- @memberjunction/ai-reranker@5.10.1
- @memberjunction/actions-base@5.10.1
- @memberjunction/actions@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1

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
  - @memberjunction/ai-prompts@5.10.0
  - @memberjunction/ai-reranker@5.10.0
  - @memberjunction/actions-base@5.10.0
  - @memberjunction/actions@5.10.0
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
  - @memberjunction/ai-prompts@5.9.0
  - @memberjunction/ai-reranker@5.9.0
  - @memberjunction/actions-base@5.9.0
  - @memberjunction/actions@5.9.0
  - @memberjunction/ai@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/ai-engine-base@5.8.0
  - @memberjunction/ai-core-plus@5.8.0
  - @memberjunction/aiengine@5.8.0
  - @memberjunction/ai-prompts@5.8.0
  - @memberjunction/ai-reranker@5.8.0
  - @memberjunction/actions-base@5.8.0
  - @memberjunction/actions@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/ai@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- f52e156: Fix agent infinite retry loop and OOM crash when API credentials are missing by adding NoCredentials error classification, max consecutive failure safety net, and descriptive error propagation to the UI. Fix artifact collection removal UI update, artifact pane width reset on conversation switch, and component spec caching to survive render errors.
- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ai@5.7.0
  - @memberjunction/ai-prompts@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/ai-engine-base@5.7.0
  - @memberjunction/ai-core-plus@5.7.0
  - @memberjunction/aiengine@5.7.0
  - @memberjunction/ai-reranker@5.7.0
  - @memberjunction/actions@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/actions-base@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ai-engine-base@5.6.0
  - @memberjunction/ai-core-plus@5.6.0
  - @memberjunction/aiengine@5.6.0
  - @memberjunction/ai-prompts@5.6.0
  - @memberjunction/ai-reranker@5.6.0
  - @memberjunction/actions-base@5.6.0
  - @memberjunction/actions@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/ai@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- 7ca2459: Viewing System fixes, CodeGen cleanup, startup performance
- 2973c64: no migration, just small code changes
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
  - @memberjunction/ai-prompts@5.5.0
  - @memberjunction/ai-reranker@5.5.0
  - @memberjunction/actions-base@5.5.0
  - @memberjunction/actions@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai-engine-base@5.4.1
- @memberjunction/ai@5.4.1
- @memberjunction/ai-core-plus@5.4.1
- @memberjunction/aiengine@5.4.1
- @memberjunction/ai-prompts@5.4.1
- @memberjunction/ai-reranker@5.4.1
- @memberjunction/actions-base@5.4.1
- @memberjunction/actions@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1

## 5.4.0

### Minor Changes

- bc993b8: migration file due to metadata update (fix entity name in AI Agent data preloading for DB Research Agent)

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ai-engine-base@5.4.0
  - @memberjunction/ai-core-plus@5.4.0
  - @memberjunction/aiengine@5.4.0
  - @memberjunction/ai-prompts@5.4.0
  - @memberjunction/ai-reranker@5.4.0
  - @memberjunction/actions-base@5.4.0
  - @memberjunction/actions@5.4.0
  - @memberjunction/ai@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai-engine-base@5.3.1
- @memberjunction/ai@5.3.1
- @memberjunction/ai-core-plus@5.3.1
- @memberjunction/aiengine@5.3.1
- @memberjunction/ai-prompts@5.3.1
- @memberjunction/ai-reranker@5.3.1
- @memberjunction/actions-base@5.3.1
- @memberjunction/actions@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Minor Changes

- ebf057a: migration

### Patch Changes

- 1692c53: Viewing System fixes for sorting and filtering. Memory manager SQL fix.
- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ai-engine-base@5.3.0
  - @memberjunction/ai-core-plus@5.3.0
  - @memberjunction/aiengine@5.3.0
  - @memberjunction/ai-prompts@5.3.0
  - @memberjunction/ai-reranker@5.3.0
  - @memberjunction/actions-base@5.3.0
  - @memberjunction/actions@5.3.0
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
  - @memberjunction/ai-prompts@5.2.0
  - @memberjunction/ai-reranker@5.2.0
  - @memberjunction/actions-base@5.2.0
  - @memberjunction/actions@5.2.0
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
  - @memberjunction/ai-prompts@5.1.0
  - @memberjunction/ai-reranker@5.1.0
  - @memberjunction/actions-base@5.1.0
  - @memberjunction/actions@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0

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
  - @memberjunction/ai-prompts@5.0.0
  - @memberjunction/ai-reranker@5.0.0
  - @memberjunction/actions-base@5.0.0
  - @memberjunction/actions@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-engine-base@4.4.0
  - @memberjunction/ai-core-plus@4.4.0
  - @memberjunction/aiengine@4.4.0
  - @memberjunction/ai-prompts@4.4.0
  - @memberjunction/ai-reranker@4.4.0
  - @memberjunction/actions-base@4.4.0
  - @memberjunction/actions@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/ai@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai-engine-base@4.3.1
- @memberjunction/ai@4.3.1
- @memberjunction/ai-core-plus@4.3.1
- @memberjunction/aiengine@4.3.1
- @memberjunction/ai-prompts@4.3.1
- @memberjunction/ai-reranker@4.3.1
- @memberjunction/actions-base@4.3.1
- @memberjunction/actions@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1

## 4.3.0

### Minor Changes

- 6f4d33f: Fix Memory Manager contradiction handling: collapse duplicate merge candidates to create one replacement note instead of duplicates, update dedup prompt to distinguish additive preferences from true duplicates, skip dedup for merge notes, revoke-and-create instead of in-place overwrite, add verbose support from UI, and fallback gracefully when merge targets are missing

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ai-engine-base@4.3.0
  - @memberjunction/ai-core-plus@4.3.0
  - @memberjunction/aiengine@4.3.0
  - @memberjunction/ai-prompts@4.3.0
  - @memberjunction/ai-reranker@4.3.0
  - @memberjunction/actions-base@4.3.0
  - @memberjunction/actions@4.3.0
  - @memberjunction/ai@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai-engine-base@4.2.0
- @memberjunction/ai@4.2.0
- @memberjunction/ai-core-plus@4.2.0
- @memberjunction/aiengine@4.2.0
- @memberjunction/ai-prompts@4.2.0
- @memberjunction/ai-reranker@4.2.0
- @memberjunction/actions-base@4.2.0
- @memberjunction/actions@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ai-engine-base@4.1.0
  - @memberjunction/ai-core-plus@4.1.0
  - @memberjunction/aiengine@4.1.0
  - @memberjunction/ai-prompts@4.1.0
  - @memberjunction/ai-reranker@4.1.0
  - @memberjunction/actions-base@4.1.0
  - @memberjunction/actions@4.1.0
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
  - @memberjunction/ai-prompts@4.0.0
  - @memberjunction/ai-reranker@4.0.0
  - @memberjunction/actions-base@4.0.0
  - @memberjunction/actions@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [d596467]
- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/ai-prompts@3.4.0
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/ai-reranker@3.4.0
  - @memberjunction/actions@3.4.0
  - @memberjunction/aiengine@3.4.0
  - @memberjunction/ai-engine-base@3.4.0
  - @memberjunction/ai-core-plus@3.4.0
  - @memberjunction/actions-base@3.4.0
  - @memberjunction/ai@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- 4bbb600: Refactor agent note sorting to use cached note type priorities for improved performance
- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/ai-engine-base@3.3.0
  - @memberjunction/ai-core-plus@3.3.0
  - @memberjunction/aiengine@3.3.0
  - @memberjunction/ai-prompts@3.3.0
  - @memberjunction/ai-reranker@3.3.0
  - @memberjunction/actions-base@3.3.0
  - @memberjunction/actions@3.3.0
  - @memberjunction/ai@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- 011c820: Improve migration error diagnostics and fix parent agent chat handling to respect sub-agent responses
- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/ai-engine-base@3.2.0
  - @memberjunction/ai-core-plus@3.2.0
  - @memberjunction/aiengine@3.2.0
  - @memberjunction/ai-prompts@3.2.0
  - @memberjunction/actions-base@3.2.0
  - @memberjunction/actions@3.2.0
  - @memberjunction/ai@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ai-engine-base@3.1.1
- @memberjunction/ai@3.1.1
- @memberjunction/ai-core-plus@3.1.1
- @memberjunction/aiengine@3.1.1
- @memberjunction/ai-prompts@3.1.1
- @memberjunction/actions-base@3.1.1
- @memberjunction/actions@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai-engine-base@3.0.0
- @memberjunction/ai@3.0.0
- @memberjunction/ai-core-plus@3.0.0
- @memberjunction/aiengine@3.0.0
- @memberjunction/ai-prompts@3.0.0
- @memberjunction/actions-base@3.0.0
- @memberjunction/actions@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/global@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/ai-engine-base@2.133.0
  - @memberjunction/ai-core-plus@2.133.0
  - @memberjunction/aiengine@2.133.0
  - @memberjunction/ai-prompts@2.133.0
  - @memberjunction/actions-base@2.133.0
  - @memberjunction/actions@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/ai@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/ai-engine-base@2.132.0
  - @memberjunction/ai-core-plus@2.132.0
  - @memberjunction/aiengine@2.132.0
  - @memberjunction/ai-prompts@2.132.0
  - @memberjunction/actions-base@2.132.0
  - @memberjunction/actions@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/ai@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Minor Changes

- d3d2926: migration

### Patch Changes

- 3604aa1: Fix Conversations Performance: Replace Timer Polling with PubSub + Fix Race Conditions
- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/ai-engine-base@2.131.0
  - @memberjunction/ai-core-plus@2.131.0
  - @memberjunction/aiengine@2.131.0
  - @memberjunction/ai-prompts@2.131.0
  - @memberjunction/actions-base@2.131.0
  - @memberjunction/actions@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/ai@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/ai-engine-base@2.130.1
- @memberjunction/ai@2.130.1
- @memberjunction/ai-core-plus@2.130.1
- @memberjunction/aiengine@2.130.1
- @memberjunction/ai-prompts@2.130.1
- @memberjunction/actions-base@2.130.1
- @memberjunction/actions@2.130.1
- @memberjunction/core@2.130.1
- @memberjunction/core-entities@2.130.1
- @memberjunction/global@2.130.1

## 2.130.0

### Minor Changes

- 83ae347: migrations

### Patch Changes

- f4e1f05: Fix Conversation UI issue after browser refresh
- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/ai-engine-base@2.130.0
  - @memberjunction/ai@2.130.0
  - @memberjunction/ai-core-plus@2.130.0
  - @memberjunction/aiengine@2.130.0
  - @memberjunction/ai-prompts@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/actions@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/actions-base@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Minor Changes

- c7e38aa: migration

### Patch Changes

- 573179f: Fix Conversation UI issues with Browser Refresh
- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [6ce6e67]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/ai-core-plus@2.129.0
  - @memberjunction/ai-prompts@2.129.0
  - @memberjunction/ai-engine-base@2.129.0
  - @memberjunction/aiengine@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/actions-base@2.129.0
  - @memberjunction/actions@2.129.0
  - @memberjunction/ai@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
  - @memberjunction/core@2.128.0
  - @memberjunction/ai-prompts@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/ai-engine-base@2.128.0
  - @memberjunction/ai-core-plus@2.128.0
  - @memberjunction/aiengine@2.128.0
  - @memberjunction/actions-base@2.128.0
  - @memberjunction/actions@2.128.0
  - @memberjunction/ai@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- 0e56e97: no migration for this set of commits
- Updated dependencies [0e56e97]
- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/ai-core-plus@2.127.0
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/aiengine@2.127.0
  - @memberjunction/ai-prompts@2.127.0
  - @memberjunction/actions@2.127.0
  - @memberjunction/ai-engine-base@2.127.0
  - @memberjunction/actions-base@2.127.0
  - @memberjunction/ai@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/ai-engine-base@2.126.1
- @memberjunction/ai@2.126.1
- @memberjunction/ai-core-plus@2.126.1
- @memberjunction/aiengine@2.126.1
- @memberjunction/ai-prompts@2.126.1
- @memberjunction/actions-base@2.126.1
- @memberjunction/actions@2.126.1
- @memberjunction/core@2.126.1
- @memberjunction/core-entities@2.126.1
- @memberjunction/global@2.126.1

## 2.126.0

### Minor Changes

- d424fce: migration for metadata for Sage change

### Patch Changes

- Updated dependencies [703221e]
  - @memberjunction/core@2.126.0
  - @memberjunction/ai-engine-base@2.126.0
  - @memberjunction/ai-core-plus@2.126.0
  - @memberjunction/aiengine@2.126.0
  - @memberjunction/ai-prompts@2.126.0
  - @memberjunction/actions-base@2.126.0
  - @memberjunction/actions@2.126.0
  - @memberjunction/core-entities@2.126.0
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
  - @memberjunction/ai-prompts@2.125.0
  - @memberjunction/actions-base@2.125.0
  - @memberjunction/actions@2.125.0
  - @memberjunction/ai@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Minor Changes

- cabe329: migration due to tweak in loop agent system prompt (migration needs to be created)

### Patch Changes

- 4b2181d: no migration
- Updated dependencies [75058a9]
- Updated dependencies [cabe329]
- Updated dependencies [629cf5a]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/ai-core-plus@2.124.0
  - @memberjunction/ai-prompts@2.124.0
  - @memberjunction/ai-engine-base@2.124.0
  - @memberjunction/aiengine@2.124.0
  - @memberjunction/actions-base@2.124.0
  - @memberjunction/actions@2.124.0
  - @memberjunction/ai@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai-engine-base@2.123.1
- @memberjunction/ai@2.123.1
- @memberjunction/ai-core-plus@2.123.1
- @memberjunction/aiengine@2.123.1
- @memberjunction/ai-prompts@2.123.1
- @memberjunction/actions-base@2.123.1
- @memberjunction/actions@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1

## 2.123.0

### Minor Changes

- 0944f59: migrations

### Patch Changes

- Updated dependencies [0944f59]
  - @memberjunction/ai-core-plus@2.123.0
  - @memberjunction/aiengine@2.123.0
  - @memberjunction/ai-prompts@2.123.0
  - @memberjunction/actions@2.123.0
  - @memberjunction/ai-engine-base@2.123.0
  - @memberjunction/ai@2.123.0
  - @memberjunction/actions-base@2.123.0
  - @memberjunction/core@2.123.0
  - @memberjunction/core-entities@2.123.0
  - @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
- Updated dependencies [81f0c44]
  - @memberjunction/ai-prompts@2.122.2
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/actions@2.122.2
  - @memberjunction/ai-engine-base@2.122.2
  - @memberjunction/ai-core-plus@2.122.2
  - @memberjunction/aiengine@2.122.2
  - @memberjunction/actions-base@2.122.2
  - @memberjunction/ai@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/ai@2.122.1
- @memberjunction/ai-core-plus@2.122.1
- @memberjunction/aiengine@2.122.1
- @memberjunction/ai-prompts@2.122.1
- @memberjunction/actions-base@2.122.1
- @memberjunction/actions@2.122.1
- @memberjunction/core@2.122.1
- @memberjunction/core-entities@2.122.1
- @memberjunction/global@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/ai-core-plus@2.122.0
  - @memberjunction/aiengine@2.122.0
  - @memberjunction/ai-prompts@2.122.0
  - @memberjunction/actions-base@2.122.0
  - @memberjunction/actions@2.122.0
  - @memberjunction/ai@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- a2bef0a: Refactor component-linter with fixture-based testing infrastructure, fix agent execution error handling and payload propagation, add Gemini API parameter fixes, and improve vendor failover with VendorValidationError type
- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/ai@2.121.0
  - @memberjunction/ai-prompts@2.121.0
  - @memberjunction/ai-core-plus@2.121.0
  - @memberjunction/aiengine@2.121.0
  - @memberjunction/actions-base@2.121.0
  - @memberjunction/actions@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- 3074b66: Add agent run auditing and debugging tools, enhance AI agent execution history with search and pagination, improve query parameter extraction and validation, and add linter validation for missing query names
- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/ai-core-plus@2.120.0
  - @memberjunction/aiengine@2.120.0
  - @memberjunction/ai-prompts@2.120.0
  - @memberjunction/actions-base@2.120.0
  - @memberjunction/actions@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/ai@2.120.0
  - @memberjunction/global@2.120.0

## 2.119.0

### Minor Changes

- 62790f4: migration

### Patch Changes

- 0a133df: Agent Conversation UI Improvement
- Updated dependencies [7dd7cca]
- Updated dependencies [0a133df]
- Updated dependencies [efc6451]
  - @memberjunction/core@2.119.0
  - @memberjunction/ai-core-plus@2.119.0
  - @memberjunction/ai-prompts@2.119.0
  - @memberjunction/aiengine@2.119.0
  - @memberjunction/actions-base@2.119.0
  - @memberjunction/actions@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/ai@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Minor Changes

- a2901ff: migration
- 264c57a: migration
- a49a7a8: migration
- 096ece6: migration
- 7dcfd9c: migration

### Patch Changes

- Updated dependencies [264c57a]
- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/ai-core-plus@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/aiengine@2.118.0
  - @memberjunction/ai-prompts@2.118.0
  - @memberjunction/actions-base@2.118.0
  - @memberjunction/actions@2.118.0
  - @memberjunction/ai@2.118.0
  - @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- 36db9d9: Fix agent failure propagation and Flow agent error handling

  **Flow Agent Improvements:**
  - Handle 'Failed' steps in PreProcessNextStep to enable conditional failure path navigation
  - Properly terminate when step fails with no recovery path
  - Navigate to failure handler steps when recovery paths exist
  - Add logging for failure recovery path evaluation

  **Base Agent Improvements:**
  - Capture error messages from child and related sub-agent failures
  - Extract errorMessage from subAgentResult.agentRun.ErrorMessage
  - Prioritize finalStep.errorMessage over finalStep.message in finalizeAgentRun
  - Ensure error context propagates up the agent hierarchy

  These changes enable Flow agents to detect sub-agent failures, evaluate

- Updated dependencies [8c092ec]
  - @memberjunction/core@2.117.0
  - @memberjunction/ai-core-plus@2.117.0
  - @memberjunction/aiengine@2.117.0
  - @memberjunction/ai-prompts@2.117.0
  - @memberjunction/actions-base@2.117.0
  - @memberjunction/actions@2.117.0
  - @memberjunction/core-entities@2.117.0
  - @memberjunction/ai@2.117.0
  - @memberjunction/global@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [81bb7a4]
- Updated dependencies [88f60e7]
- Updated dependencies [a8d5592]
  - @memberjunction/core@2.116.0
  - @memberjunction/actions-base@2.116.0
  - @memberjunction/global@2.116.0
  - @memberjunction/ai-core-plus@2.116.0
  - @memberjunction/aiengine@2.116.0
  - @memberjunction/ai-prompts@2.116.0
  - @memberjunction/actions@2.116.0
  - @memberjunction/core-entities@2.116.0
  - @memberjunction/ai@2.116.0

## 2.115.0

### Minor Changes

- c29e21b: migration

### Patch Changes

- 6378103: Fix Flow Agent path condition evaluation by storing step results before path traversal
- Updated dependencies [2e0fe8b]
  - @memberjunction/aiengine@2.115.0
  - @memberjunction/ai-prompts@2.115.0
  - @memberjunction/actions@2.115.0
  - @memberjunction/ai@2.115.0
  - @memberjunction/ai-core-plus@2.115.0
  - @memberjunction/actions-base@2.115.0
  - @memberjunction/core@2.115.0
  - @memberjunction/core-entities@2.115.0
  - @memberjunction/global@2.115.0

## 2.114.0

### Minor Changes

- 683eaeb: migration
- 7f46575: Migration
- 9af02f0: Migration

### Patch Changes

- @memberjunction/ai@2.114.0
- @memberjunction/ai-core-plus@2.114.0
- @memberjunction/aiengine@2.114.0
- @memberjunction/ai-prompts@2.114.0
- @memberjunction/actions-base@2.114.0
- @memberjunction/actions@2.114.0
- @memberjunction/core@2.114.0
- @memberjunction/core-entities@2.114.0
- @memberjunction/global@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/ai-core-plus@2.113.2
  - @memberjunction/aiengine@2.113.2
  - @memberjunction/ai-prompts@2.113.2
  - @memberjunction/actions-base@2.113.2
  - @memberjunction/actions@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/ai@2.113.2
  - @memberjunction/global@2.113.2

## 2.112.0

### Minor Changes

- 2ac2120: migration

### Patch Changes

- ed74bb8: Add parallel execution support for ForEach loops in Agent framework

  ## New Features

  ### Parallel ForEach Execution
  - Added `executionMode` field to `ForEachOperation` interface ('sequential' | 'parallel')
  - Added `maxConcurrency` field to control batch size for parallel execution (default: 10)
  - Implemented batched parallel execution with sequential result application
  - Results collected in parallel then applied to payload in original order
  - Provides 5-10x performance improvement for I/O-bound operations

  ### Performance Improvements
  - Web scraping: 10x faster for independent URL fetching
  - Document processing: 10x faster for batch file operations
  - API calls: Dramatic speedup for independent requests
  - Maintains correctness through sequential payload updates

  ### Safety Features
  - Default executionMode is 'sequential' for backward compatibility
  - Parallel execution collects results concurrently but applies payload changes sequentially
  - Order preservation ensures output mapping works correctly
  - Error handling respects `continueOnError` flag

  ## Updated Documentation
  - Comprehensive guide in `guide-to-iterative-operations-in-agents.md`
  - Updated TypeScript interfaces with new fields
  - Added usage examples for both Flow and Loop agents
  - Max concurrency guidelines by operation type
  - Database migration to update Loop Agent Type system prompt

  ## Usage Example

  ```typescript
  // Loop Agent requesting parallel execution
  {
      "taskComplete": false,
      "message": "Fetching 50 search results",
      "nextStep": {
          "type": "ForEach",
          "forEach": {
              "collectionPath": "searchResults",
              "executionMode": "parallel",
              "maxConcurrency": 15,
              "action": {
                  "name": "Get Web Page Content",
                  "params": { "url": "result.url" }
              }
          }
      }
  }
  ```

  ## Breaking Changes

  None - fully backward compatible

- Updated dependencies [e237ca9]
- Updated dependencies [c126b59]
- Updated dependencies [ed74bb8]
  - @memberjunction/aiengine@2.112.0
  - @memberjunction/global@2.112.0
  - @memberjunction/ai-core-plus@2.112.0
  - @memberjunction/ai-prompts@2.112.0
  - @memberjunction/actions@2.112.0
  - @memberjunction/ai@2.112.0
  - @memberjunction/actions-base@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ai@2.110.1
- @memberjunction/ai-core-plus@2.110.1
- @memberjunction/aiengine@2.110.1
- @memberjunction/ai-prompts@2.110.1
- @memberjunction/actions-base@2.110.1
- @memberjunction/actions@2.110.1
- @memberjunction/core@2.110.1
- @memberjunction/core-entities@2.110.1
- @memberjunction/global@2.110.1

## 2.110.0

### Minor Changes

- c8b9aca: Migration

### Patch Changes

- 8f1384a: Deep merge for flow agent prompt execution
- Updated dependencies [02d72ff]
- Updated dependencies [d2d7ab9]
- Updated dependencies [c8b9aca]
  - @memberjunction/core-entities@2.110.0
  - @memberjunction/ai-core-plus@2.110.0
  - @memberjunction/aiengine@2.110.0
  - @memberjunction/ai-prompts@2.110.0
  - @memberjunction/actions-base@2.110.0
  - @memberjunction/actions@2.110.0
  - @memberjunction/ai@2.110.0
  - @memberjunction/core@2.110.0
  - @memberjunction/global@2.110.0

## 2.109.0

### Minor Changes

- e2a6338: migration

### Patch Changes

- Updated dependencies [6e45c17]
- Updated dependencies [a38989b]
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/ai-core-plus@2.109.0
  - @memberjunction/aiengine@2.109.0
  - @memberjunction/ai-prompts@2.109.0
  - @memberjunction/actions-base@2.109.0
  - @memberjunction/actions@2.109.0
  - @memberjunction/ai@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0

## 2.108.0

### Minor Changes

- 5d51137: Major enhancement to the Sage conversation manager agent adding semantic agent search using local embeddings, scheduling job actions, improved prompts, agent permission checking, and user plan confirmation workflow.
- d205a6c: migration
- 656d86c: Migration

### Patch Changes

- 687e2ae: UI Fixes for Conversation Artifacts and Refactoring of the Agent Embedding System
- Updated dependencies [687e2ae]
- Updated dependencies [d205a6c]
- Updated dependencies [656d86c]
  - @memberjunction/aiengine@2.108.0
  - @memberjunction/ai-core-plus@2.108.0
  - @memberjunction/ai@2.108.0
  - @memberjunction/actions-base@2.108.0
  - @memberjunction/actions@2.108.0
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/ai-prompts@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/ai@2.107.0
- @memberjunction/ai-core-plus@2.107.0
- @memberjunction/aiengine@2.107.0
- @memberjunction/ai-prompts@2.107.0
- @memberjunction/actions-base@2.107.0
- @memberjunction/actions@2.107.0
- @memberjunction/core@2.107.0
- @memberjunction/core-entities@2.107.0
- @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ai@2.106.0
- @memberjunction/ai-core-plus@2.106.0
- @memberjunction/aiengine@2.106.0
- @memberjunction/ai-prompts@2.106.0
- @memberjunction/actions-base@2.106.0
- @memberjunction/actions@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/core-entities@2.106.0
- @memberjunction/global@2.106.0

## 2.105.0

### Patch Changes

- d66070e: migration
- Updated dependencies [4807f35]
- Updated dependencies [9b67e0c]
  - @memberjunction/ai-core-plus@2.105.0
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/ai@2.105.0
  - @memberjunction/aiengine@2.105.0
  - @memberjunction/ai-prompts@2.105.0
  - @memberjunction/actions@2.105.0
  - @memberjunction/actions-base@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Patch Changes

- e6df147: Add array indexing support to ActionInputMapping in Flow agents. Flow
  agent ActionInputMapping now supports JavaScript-style array indexing
  syntax (e.g., `payload.array[0]`, `payload.nested.records[5].field`) for
  accessing specific array elements in payload references.
- Updated dependencies [aafa827]
- Updated dependencies [2ff5428]
- Updated dependencies [4567af3]
- Updated dependencies [9ad6353]
  - @memberjunction/ai-prompts@2.104.0
  - @memberjunction/global@2.104.0
  - @memberjunction/ai-core-plus@2.104.0
  - @memberjunction/core-entities@2.104.0
  - @memberjunction/actions@2.104.0
  - @memberjunction/ai@2.104.0
  - @memberjunction/aiengine@2.104.0
  - @memberjunction/actions-base@2.104.0
  - @memberjunction/core@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
- Updated dependencies [3ba01de]
- Updated dependencies [a38eec3]
  - @memberjunction/core@2.103.0
  - @memberjunction/actions@2.103.0
  - @memberjunction/core-entities@2.103.0
  - @memberjunction/actions-base@2.103.0
  - @memberjunction/ai-core-plus@2.103.0
  - @memberjunction/ai-prompts@2.103.0
  - @memberjunction/aiengine@2.103.0
  - @memberjunction/global@2.103.0
  - @memberjunction/ai@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/core-entities@2.100.3
- @memberjunction/ai-core-plus@2.100.3
- @memberjunction/aiengine@2.100.3
- @memberjunction/ai-prompts@2.100.3
- @memberjunction/actions-base@2.100.3
- @memberjunction/actions@2.100.3
- @memberjunction/ai@2.100.3
- @memberjunction/core@2.100.3
- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/ai@2.100.2
- @memberjunction/ai-core-plus@2.100.2
- @memberjunction/aiengine@2.100.2
- @memberjunction/ai-prompts@2.100.2
- @memberjunction/actions-base@2.100.2
- @memberjunction/actions@2.100.2
- @memberjunction/core@2.100.2
- @memberjunction/core-entities@2.100.2
- @memberjunction/global@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/ai@2.100.1
- @memberjunction/ai-core-plus@2.100.1
- @memberjunction/aiengine@2.100.1
- @memberjunction/ai-prompts@2.100.1
- @memberjunction/actions-base@2.100.1
- @memberjunction/actions@2.100.1
- @memberjunction/core@2.100.1
- @memberjunction/core-entities@2.100.1
- @memberjunction/global@2.100.1

## 2.100.0

### Patch Changes

- Updated dependencies [5f76e3a]
- Updated dependencies [ffc2c1a]
  - @memberjunction/core@2.100.0
  - @memberjunction/core-entities@2.100.0
  - @memberjunction/ai-core-plus@2.100.0
  - @memberjunction/aiengine@2.100.0
  - @memberjunction/ai-prompts@2.100.0
  - @memberjunction/actions-base@2.100.0
  - @memberjunction/actions@2.100.0
  - @memberjunction/ai@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Minor Changes

- eb7677d: feat(ai-agents): Add ChatHandlingOption for flexible Chat step
  handling
  - Add ChatHandlingOption field to AIAgent table with values:
    Success, Failed, Retry
  - Implement Chat step remapping in
    BaseAgent.validateChatNextStep() based on agent configuration
  - Fix executeChatStep to mark Chat steps as successful
    (they're valid terminal states for user interaction)
  - Remove complex sub-agent Chat handling from FlowAgentType in
    favor of agent-level configuration
  - Enables agents like Requirements Expert to request user
    clarification without breaking parent flows
  - Parent agents can control whether Chat steps should continue
    (Success), fail (Failed), or retry (Retry)

- 830815e: migration

### Patch Changes

- Updated dependencies [eb7677d]
- Updated dependencies [8bbb0a9]
  - @memberjunction/core-entities@2.99.0
  - @memberjunction/core@2.99.0
  - @memberjunction/ai-core-plus@2.99.0
  - @memberjunction/aiengine@2.99.0
  - @memberjunction/ai-prompts@2.99.0
  - @memberjunction/actions-base@2.99.0
  - @memberjunction/actions@2.99.0
  - @memberjunction/ai@2.99.0
  - @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/ai@2.98.0
- @memberjunction/ai-core-plus@2.98.0
- @memberjunction/aiengine@2.98.0
- @memberjunction/ai-prompts@2.98.0
- @memberjunction/actions-base@2.98.0
- @memberjunction/actions@2.98.0
- @memberjunction/core@2.98.0
- @memberjunction/core-entities@2.98.0
- @memberjunction/global@2.98.0

## 2.97.0

### Minor Changes

- dc497d5: migration

### Patch Changes

- @memberjunction/core-entities@2.97.0
- @memberjunction/ai-core-plus@2.97.0
- @memberjunction/aiengine@2.97.0
- @memberjunction/ai-prompts@2.97.0
- @memberjunction/actions-base@2.97.0
- @memberjunction/actions@2.97.0
- @memberjunction/ai@2.97.0
- @memberjunction/core@2.97.0
- @memberjunction/global@2.97.0

## 2.96.0

### Patch Changes

- Updated dependencies [01dcfde]
- Updated dependencies [8f34e55]
  - @memberjunction/core@2.96.0
  - @memberjunction/ai-prompts@2.96.0
  - @memberjunction/ai-core-plus@2.96.0
  - @memberjunction/aiengine@2.96.0
  - @memberjunction/actions-base@2.96.0
  - @memberjunction/actions@2.96.0
  - @memberjunction/core-entities@2.96.0
  - @memberjunction/ai@2.96.0
  - @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- Updated dependencies [a54c014]
  - @memberjunction/core@2.95.0
  - @memberjunction/ai-core-plus@2.95.0
  - @memberjunction/aiengine@2.95.0
  - @memberjunction/ai-prompts@2.95.0
  - @memberjunction/actions-base@2.95.0
  - @memberjunction/actions@2.95.0
  - @memberjunction/core-entities@2.95.0
  - @memberjunction/ai@2.95.0
  - @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/core-entities@2.94.0
- @memberjunction/ai-core-plus@2.94.0
- @memberjunction/aiengine@2.94.0
- @memberjunction/ai-prompts@2.94.0
- @memberjunction/actions-base@2.94.0
- @memberjunction/actions@2.94.0
- @memberjunction/ai@2.94.0
- @memberjunction/core@2.94.0
- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- 103e4a9: Added comprehensive tracking fields to AI execution entities:
  - **AIAgentRun**: Added `RunName`, `Comment`, and `ParentID` fields for better run identification and hierarchical tracking
  - **AIPromptRun**: Added `RunName`, `Comment`, and `ParentID` fields for consistent tracking across prompt executions
  - **AIAgentRunStep**: Added `Comment` and `ParentID` fields for detailed step-level tracking
  - **Flow Agent Type**: Added support for Chat message handling to properly bubble up messages from sub-agents to users
  - **Action Execution**: Enhanced action execution logging by capturing input data (action name and parameters) in step entities
  - **CodeGen SQL Execution**: Fixed QUOTED_IDENTIFIER issues by adding `-I` flag to sqlcmd execution (required for indexed views and computed columns)
  - **MetadataSync Push Service**: Improved error reporting with detailed context for field processing failures, lookup failures, and save errors
  - Database migration `V202508231445__v2.93.0` adds the new tracking fields with proper constraints and metadata
  - Updated all generated entity classes, GraphQL types, and Angular forms to support the new fields
  - Enhanced error diagnostics in push service to help identify root causes of sync failures

- Updated dependencies [f8757aa]
- Updated dependencies [103e4a9]
- Updated dependencies [7f465b5]
  - @memberjunction/core@2.93.0
  - @memberjunction/core-entities@2.93.0
  - @memberjunction/ai-core-plus@2.93.0
  - @memberjunction/aiengine@2.93.0
  - @memberjunction/ai-prompts@2.93.0
  - @memberjunction/actions-base@2.93.0
  - @memberjunction/actions@2.93.0
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
  - @memberjunction/ai-prompts@2.92.0
  - @memberjunction/actions-base@2.92.0
  - @memberjunction/actions@2.92.0
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
  - @memberjunction/ai-prompts@2.91.0
  - @memberjunction/actions-base@2.91.0
  - @memberjunction/actions@2.91.0
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
  - @memberjunction/ai-prompts@2.90.0
  - @memberjunction/actions@2.90.0
  - @memberjunction/ai-core-plus@2.90.0
  - @memberjunction/actions-base@2.90.0
  - @memberjunction/ai@2.90.0
  - @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- Updated dependencies [d1911ed]
  - @memberjunction/ai-core-plus@2.89.0
  - @memberjunction/core-entities@2.89.0
  - @memberjunction/aiengine@2.89.0
  - @memberjunction/ai-prompts@2.89.0
  - @memberjunction/actions@2.89.0
  - @memberjunction/actions-base@2.89.0
  - @memberjunction/ai@2.89.0
  - @memberjunction/core@2.89.0
  - @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- Updated dependencies [df4031f]
  - @memberjunction/core-entities@2.88.0
  - @memberjunction/ai-core-plus@2.88.0
  - @memberjunction/aiengine@2.88.0
  - @memberjunction/ai-prompts@2.88.0
  - @memberjunction/actions-base@2.88.0
  - @memberjunction/actions@2.88.0
  - @memberjunction/ai@2.88.0
  - @memberjunction/core@2.88.0
  - @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- Updated dependencies [58a00df]
  - @memberjunction/core@2.87.0
  - @memberjunction/ai-core-plus@2.87.0
  - @memberjunction/aiengine@2.87.0
  - @memberjunction/ai-prompts@2.87.0
  - @memberjunction/actions-base@2.87.0
  - @memberjunction/actions@2.87.0
  - @memberjunction/core-entities@2.87.0
  - @memberjunction/ai@2.87.0
  - @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- Updated dependencies [7dd2409]
  - @memberjunction/core-entities@2.86.0
  - @memberjunction/ai-core-plus@2.86.0
  - @memberjunction/aiengine@2.86.0
  - @memberjunction/ai-prompts@2.86.0
  - @memberjunction/actions-base@2.86.0
  - @memberjunction/actions@2.86.0
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
  - @memberjunction/ai-prompts@2.85.0
  - @memberjunction/actions@2.85.0
  - @memberjunction/actions-base@2.85.0
  - @memberjunction/core@2.85.0
  - @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [0b9d691]
  - @memberjunction/core@2.84.0
  - @memberjunction/ai-core-plus@2.84.0
  - @memberjunction/aiengine@2.84.0
  - @memberjunction/ai-prompts@2.84.0
  - @memberjunction/actions-base@2.84.0
  - @memberjunction/actions@2.84.0
  - @memberjunction/core-entities@2.84.0
  - @memberjunction/ai@2.84.0
  - @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- 1dc69bf: Agent Type State
- 1eebeda: small changes no migration
- Updated dependencies [e2e0415]
- Updated dependencies [1dc69bf]
  - @memberjunction/core@2.83.0
  - @memberjunction/aiengine@2.83.0
  - @memberjunction/ai-core-plus@2.83.0
  - @memberjunction/ai-prompts@2.83.0
  - @memberjunction/actions-base@2.83.0
  - @memberjunction/actions@2.83.0
  - @memberjunction/core-entities@2.83.0
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
  - @memberjunction/ai-prompts@2.82.0
  - @memberjunction/aiengine@2.82.0
  - @memberjunction/actions-base@2.82.0
  - @memberjunction/actions@2.82.0
  - @memberjunction/ai@2.82.0
  - @memberjunction/core@2.82.0
  - @memberjunction/global@2.82.0

## 2.81.0

### Patch Changes

- 42a6954: Add User Onboarding Flow Agent with role assignment improvements
  - Add support for Flow Agent Type to execute flow-specific prompts
    instead of system prompts
  - Fix Flow Agent payload persistence across workflow steps
  - Create assign-user-roles action to support multiple role assignments
  - Update validate-email-unique action with better error handling
  - Enable proper role mapping from user input to database role names

  This enables deterministic workflow execution for user onboarding with
  dynamic role assignment.

- Updated dependencies [6d2d478]
- Updated dependencies [e623f99]
- Updated dependencies [971c5d4]
  - @memberjunction/core@2.81.0
  - @memberjunction/core-entities@2.81.0
  - @memberjunction/ai-core-plus@2.81.0
  - @memberjunction/aiengine@2.81.0
  - @memberjunction/ai-prompts@2.81.0
  - @memberjunction/actions-base@2.81.0
  - @memberjunction/actions@2.81.0
  - @memberjunction/ai@2.81.0
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/ai@2.80.1
- @memberjunction/ai-core-plus@2.80.1
- @memberjunction/aiengine@2.80.1
- @memberjunction/ai-prompts@2.80.1
- @memberjunction/actions-base@2.80.1
- @memberjunction/actions@2.80.1
- @memberjunction/core@2.80.1
- @memberjunction/core-entities@2.80.1
- @memberjunction/global@2.80.1

## 2.80.0

### Patch Changes

- Updated dependencies [7c5f844]
- Updated dependencies [d03dfae]
  - @memberjunction/core@2.80.0
  - @memberjunction/core-entities@2.80.0
  - @memberjunction/ai-core-plus@2.80.0
  - @memberjunction/aiengine@2.80.0
  - @memberjunction/ai-prompts@2.80.0
  - @memberjunction/actions-base@2.80.0
  - @memberjunction/actions@2.80.0
  - @memberjunction/ai@2.80.0
  - @memberjunction/global@2.80.0

## 2.79.0

### Minor Changes

- 4bf2634: migrations

### Patch Changes

- db0e5ed: Nested object handling in flow agent's action input mapping.
- Updated dependencies [4bf2634]
- Updated dependencies [907e73f]
- Updated dependencies [bad1a60]
  - @memberjunction/ai-prompts@2.79.0
  - @memberjunction/core-entities@2.79.0
  - @memberjunction/global@2.79.0
  - @memberjunction/ai@2.79.0
  - @memberjunction/ai-core-plus@2.79.0
  - @memberjunction/actions@2.79.0
  - @memberjunction/aiengine@2.79.0
  - @memberjunction/actions-base@2.79.0
  - @memberjunction/core@2.79.0

## 2.78.0

### Minor Changes

- ef7c014: migration file

### Patch Changes

- Updated dependencies [ef7c014]
- Updated dependencies [06088e5]
  - @memberjunction/ai@2.78.0
  - @memberjunction/ai-prompts@2.78.0
  - @memberjunction/core-entities@2.78.0
  - @memberjunction/ai-core-plus@2.78.0
  - @memberjunction/aiengine@2.78.0
  - @memberjunction/actions@2.78.0
  - @memberjunction/actions-base@2.78.0
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
  - @memberjunction/ai-prompts@2.77.0
  - @memberjunction/actions-base@2.77.0
  - @memberjunction/actions@2.77.0
  - @memberjunction/ai@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Minor Changes

- 4b27b3c: migration file so minor bump
- ffda243: migration

### Patch Changes

- b9a94a9: Bug fix
- Updated dependencies [4b27b3c]
- Updated dependencies [7dabb22]
- Updated dependencies [ffda243]
  - @memberjunction/core-entities@2.76.0
  - @memberjunction/core@2.76.0
  - @memberjunction/ai-core-plus@2.76.0
  - @memberjunction/aiengine@2.76.0
  - @memberjunction/ai-prompts@2.76.0
  - @memberjunction/actions-base@2.76.0
  - @memberjunction/actions@2.76.0
  - @memberjunction/ai@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- Updated dependencies [9ccd145]
  - @memberjunction/ai-prompts@2.75.0
  - @memberjunction/actions@2.75.0
  - @memberjunction/ai@2.75.0
  - @memberjunction/ai-core-plus@2.75.0
  - @memberjunction/aiengine@2.75.0
  - @memberjunction/actions-base@2.75.0
  - @memberjunction/core@2.75.0
  - @memberjunction/core-entities@2.75.0
  - @memberjunction/global@2.75.0

## 2.74.0

### Minor Changes

- 9ff358d: migration

### Patch Changes

- Updated dependencies [b70301e]
- Updated dependencies [9ff358d]
- Updated dependencies [d316670]
  - @memberjunction/core-entities@2.74.0
  - @memberjunction/ai-prompts@2.74.0
  - @memberjunction/core@2.74.0
  - @memberjunction/ai-core-plus@2.74.0
  - @memberjunction/aiengine@2.74.0
  - @memberjunction/actions-base@2.74.0
  - @memberjunction/actions@2.74.0
  - @memberjunction/ai@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Minor Changes

- eab6a48: migration files

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
- Updated dependencies [eab6a48]
- Updated dependencies [e99336f]
- Updated dependencies [9801456]
- Updated dependencies [eebfb9a]
  - @memberjunction/aiengine@2.73.0
  - @memberjunction/ai-prompts@2.73.0
  - @memberjunction/core-entities@2.73.0
  - @memberjunction/ai@2.73.0
  - @memberjunction/actions@2.73.0
  - @memberjunction/ai-core-plus@2.73.0
  - @memberjunction/actions-base@2.73.0
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Minor Changes

- 57375c3: migration file to accompany due to Loop Agent Prompt

### Patch Changes

- Updated dependencies [636b6ee]
  - @memberjunction/core-entities@2.72.0
  - @memberjunction/ai-core-plus@2.72.0
  - @memberjunction/aiengine@2.72.0
  - @memberjunction/ai-prompts@2.72.0
  - @memberjunction/actions-base@2.72.0
  - @memberjunction/actions@2.72.0
  - @memberjunction/ai@2.72.0
  - @memberjunction/core@2.72.0
  - @memberjunction/global@2.72.0

## 2.71.0

### Minor Changes

- 91188ab: migration file + various improvements and reorganization

### Patch Changes

- 11e9d0b: tighten up agent params
- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
- Updated dependencies [91188ab]
  - @memberjunction/global@2.71.0
  - @memberjunction/ai@2.71.0
  - @memberjunction/ai-core-plus@2.71.0
  - @memberjunction/aiengine@2.71.0
  - @memberjunction/ai-prompts@2.71.0
  - @memberjunction/actions-base@2.71.0
  - @memberjunction/actions@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/core-entities@2.71.0

## 2.70.0

### Minor Changes

- c9d86cd: migration

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/ai-core-plus@2.70.0
  - @memberjunction/ai-prompts@2.70.0
  - @memberjunction/ai@2.70.0
  - @memberjunction/aiengine@2.70.0
  - @memberjunction/actions-base@2.70.0
  - @memberjunction/actions@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/core-entities@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/ai-core-plus@2.69.1
  - @memberjunction/aiengine@2.69.1
  - @memberjunction/ai-prompts@2.69.1
  - @memberjunction/actions-base@2.69.1
  - @memberjunction/actions@2.69.1
  - @memberjunction/core-entities@2.69.1
  - @memberjunction/ai@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Minor Changes

- 79e8509: Several changes to improve validation functionality
- b4a92ae: schema enhancements for AIAgent and AIAgentRun

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/ai-prompts@2.69.0
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0
  - @memberjunction/actions@2.69.0
  - @memberjunction/ai-core-plus@2.69.0
  - @memberjunction/aiengine@2.69.0
  - @memberjunction/actions-base@2.69.0
  - @memberjunction/core-entities@2.69.0
  - @memberjunction/ai@2.69.0

## 2.68.0

### Minor Changes

- f9625d0: migration
- 9fac8a4: validation behavior for loop agent system prompt changed - migration file drives minor release

### Patch Changes

- 61c6572: improved validation for BaseAgent
- Updated dependencies [6fa0b2d]
- Updated dependencies [b10b7e6]
  - @memberjunction/ai-prompts@2.68.0
  - @memberjunction/core@2.68.0
  - @memberjunction/actions@2.68.0
  - @memberjunction/ai-core-plus@2.68.0
  - @memberjunction/aiengine@2.68.0
  - @memberjunction/actions-base@2.68.0
  - @memberjunction/core-entities@2.68.0
  - @memberjunction/ai@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/ai@2.67.0
- @memberjunction/ai-core-plus@2.67.0
- @memberjunction/aiengine@2.67.0
- @memberjunction/ai-prompts@2.67.0
- @memberjunction/actions-base@2.67.0
- @memberjunction/actions@2.67.0
- @memberjunction/core@2.67.0
- @memberjunction/core-entities@2.67.0
- @memberjunction/global@2.67.0

## 2.66.0

### Minor Changes

- 8d3d322: migration
- a4f3631: minor due to migrations

### Patch Changes

- 1be2d4c: clean up outputdata
- Updated dependencies [7e22e3e]
  - @memberjunction/actions-base@2.66.0
  - @memberjunction/actions@2.66.0
  - @memberjunction/ai-core-plus@2.66.0
  - @memberjunction/aiengine@2.66.0
  - @memberjunction/ai-prompts@2.66.0
  - @memberjunction/ai@2.66.0
  - @memberjunction/core@2.66.0
  - @memberjunction/core-entities@2.66.0
  - @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- 1d034b7: Added features for agent payload manager + api keys for models
- Updated dependencies [1d034b7]
- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/ai@2.65.0
  - @memberjunction/ai-core-plus@2.65.0
  - @memberjunction/global@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/aiengine@2.65.0
  - @memberjunction/ai-prompts@2.65.0
  - @memberjunction/actions@2.65.0
  - @memberjunction/actions-base@2.65.0
  - @memberjunction/core@2.65.0

## 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/ai-core-plus@2.64.0
  - @memberjunction/aiengine@2.64.0
  - @memberjunction/ai-prompts@2.64.0
  - @memberjunction/actions-base@2.64.0
  - @memberjunction/actions@2.64.0
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
  - @memberjunction/ai-prompts@2.63.1
  - @memberjunction/actions-base@2.63.1
  - @memberjunction/actions@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1

## 2.63.0

### Minor Changes

- 28e8a85: Migration included to modify the AIAgentRun table, so minor bump

### Patch Changes

- Updated dependencies [28e8a85]
  - @memberjunction/ai-core-plus@2.63.0
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/aiengine@2.63.0
  - @memberjunction/ai-prompts@2.63.0
  - @memberjunction/actions@2.63.0
  - @memberjunction/actions-base@2.63.0
  - @memberjunction/ai@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [4a4b488]
- Updated dependencies [c995603]
  - @memberjunction/ai-prompts@2.62.0
  - @memberjunction/ai@2.62.0
  - @memberjunction/ai-core-plus@2.62.0
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/actions@2.62.0
  - @memberjunction/aiengine@2.62.0
  - @memberjunction/actions-base@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Minor Changes

- 51b2b47: Improvements to AI Agents and Added Social Actions

### Patch Changes

- Updated dependencies [51b2b47]
  - @memberjunction/ai-core-plus@2.61.0
  - @memberjunction/actions@2.61.0
  - @memberjunction/aiengine@2.61.0
  - @memberjunction/ai-prompts@2.61.0
  - @memberjunction/ai@2.61.0
  - @memberjunction/actions-base@2.61.0
  - @memberjunction/core@2.61.0
  - @memberjunction/core-entities@2.61.0
  - @memberjunction/global@2.61.0

## 2.60.0

### Minor Changes

- e30ee12: migrations
- e512e4e: metadata + core + ai changes

### Patch Changes

- Updated dependencies [bb46c63]
- Updated dependencies [b5fa80a]
- Updated dependencies [e30ee12]
- Updated dependencies [e512e4e]
  - @memberjunction/ai-core-plus@2.60.0
  - @memberjunction/core@2.60.0
  - @memberjunction/core-entities@2.60.0
  - @memberjunction/ai-prompts@2.60.0
  - @memberjunction/aiengine@2.60.0
  - @memberjunction/actions@2.60.0
  - @memberjunction/actions-base@2.60.0
  - @memberjunction/ai@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Minor Changes

- 008fb65: various
- 2d8913a: migrations

### Patch Changes

- @memberjunction/ai@2.59.0
- @memberjunction/ai-core-plus@2.59.0
- @memberjunction/aiengine@2.59.0
- @memberjunction/ai-prompts@2.59.0
- @memberjunction/actions-base@2.59.0
- @memberjunction/actions@2.59.0
- @memberjunction/core@2.59.0
- @memberjunction/core-entities@2.59.0
- @memberjunction/global@2.59.0

## 2.58.0

### Patch Changes

- Updated dependencies [def26fe]
- Updated dependencies [db88416]
  - @memberjunction/core@2.58.0
  - @memberjunction/ai@2.58.0
  - @memberjunction/ai-core-plus@2.58.0
  - @memberjunction/ai-prompts@2.58.0
  - @memberjunction/aiengine@2.58.0
  - @memberjunction/actions-base@2.58.0
  - @memberjunction/actions@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/global@2.57.0
  - @memberjunction/aiengine@2.57.0
  - @memberjunction/ai-prompts@2.57.0
  - @memberjunction/actions-base@2.57.0
  - @memberjunction/actions@2.57.0
  - @memberjunction/ai@2.57.0

## 2.56.0

### Minor Changes

- bf24cae: Various

### Patch Changes

- Updated dependencies [bf24cae]
  - @memberjunction/actions@2.56.0
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/aiengine@2.56.0
  - @memberjunction/ai-prompts@2.56.0
  - @memberjunction/actions-base@2.56.0
  - @memberjunction/ai@2.56.0
  - @memberjunction/core@2.56.0
  - @memberjunction/global@2.56.0

## 2.55.0

### Minor Changes

- c3a49ff: Agent Manager + SQL Server fix + fix deps in core-entity-forms

### Patch Changes

- 967bd1d: bugfix
- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
  - @memberjunction/ai@2.55.0
  - @memberjunction/aiengine@2.55.0
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/ai-prompts@2.55.0
  - @memberjunction/actions@2.55.0
  - @memberjunction/actions-base@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Minor Changes

- 08b032c: agent type metadata updates

### Patch Changes

- a6f553e: Various
- 81913a6: fix JSON of prompt params
- c96d6dd: various
- 0f6e995: improvements
- e267cc4: more generics
- 98ef1f7: Loop Agent Type improvement + Metadata Sync tool Feeature for @include
- 5e2cfa1: export interface properly
- 0046359: More generics
- 91dd7d8: patch data context passing
- Updated dependencies [20f424d]
- Updated dependencies [a6f553e]
- Updated dependencies [c96d6dd]
- Updated dependencies [0f6e995]
- Updated dependencies [0046359]
  - @memberjunction/core@2.54.0
  - @memberjunction/aiengine@2.54.0
  - @memberjunction/ai-prompts@2.54.0
  - @memberjunction/actions-base@2.54.0
  - @memberjunction/actions@2.54.0
  - @memberjunction/core-entities@2.54.0
  - @memberjunction/ai@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- Updated dependencies [bddc4ea]
- Updated dependencies [390f587]
- Updated dependencies [b5560c0]
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/actions@2.53.0
  - @memberjunction/aiengine@2.53.0
  - @memberjunction/ai-prompts@2.53.0
  - @memberjunction/actions-base@2.53.0
  - @memberjunction/ai@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Minor Changes

- 760e844: added context to actions/agents

### Patch Changes

- Updated dependencies [e926106]
- Updated dependencies [760e844]
  - @memberjunction/ai@2.52.0
  - @memberjunction/aiengine@2.52.0
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/actions-base@2.52.0
  - @memberjunction/actions@2.52.0
  - @memberjunction/ai-prompts@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Minor Changes

- 0ddb438: various

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
- Updated dependencies [0ddb438]
  - @memberjunction/ai@2.51.0
  - @memberjunction/aiengine@2.51.0
  - @memberjunction/ai-prompts@2.51.0
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/actions@2.51.0
  - @memberjunction/actions-base@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/ai@2.50.0
- @memberjunction/aiengine@2.50.0
- @memberjunction/ai-prompts@2.50.0
- @memberjunction/actions-base@2.50.0
- @memberjunction/actions@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/global@2.50.0

## 2.49.0

### Minor Changes

- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- 9350c54: Enhance error handling and add comprehensive user guidance
  - Improve error message formatting across all CLI commands to show readable errors instead of "[object
    Object]"
  - Add extensive documentation for creating error-free entity files with step-by-step guides
  - Include entity structure discovery guidance and troubleshooting reference
  - Fix common configuration mistakes in test data and examples
  - Add AI/LLM guidelines to prevent future automation errors

- Updated dependencies [2f974e2]
- Updated dependencies [cc52ced]
- Updated dependencies [ca3365f]
- Updated dependencies [b5d9fbd]
- Updated dependencies [db17ed7]
- Updated dependencies [62cf1b6]
  - @memberjunction/core-entities@2.49.0
  - @memberjunction/core@2.49.0
  - @memberjunction/global@2.49.0
  - @memberjunction/actions@2.49.0
  - @memberjunction/ai@2.49.0
  - @memberjunction/aiengine@2.49.0
  - @memberjunction/ai-prompts@2.49.0
  - @memberjunction/actions-base@2.49.0

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
  - @memberjunction/ai-prompts@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/aiengine@2.48.0
  - @memberjunction/actions-base@2.48.0
  - @memberjunction/actions@2.48.0
  - @memberjunction/ai@2.48.0
  - @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- Updated dependencies [3621e2f]
- Updated dependencies [4c4751c]
  - @memberjunction/ai-prompts@2.47.0
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
- @memberjunction/ai-prompts@2.46.0
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
  - @memberjunction/ai-prompts@2.45.0
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
  - @memberjunction/ai-prompts@2.44.0
  - @memberjunction/ai@2.44.0
  - @memberjunction/core@2.44.0
  - @memberjunction/core-entities@2.44.0
  - @memberjunction/templates@2.44.0
  - @memberjunction/global@2.44.0

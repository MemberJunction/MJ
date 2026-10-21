# @memberjunction/ai-core-plus

## 6.2.0-edge.5

### Minor Changes

- 39b35f1: Real-time task graph workflow UX, continuation synthesis with step outputs and artifacts, single-step delegation folding, per-user runnable agent directory & task graph validation, and a redesigned AI Agent Workflows & Tasks Command Center (#5878).
  - **Single-step task graph folding (`@memberjunction/ai-agents`).** `LoopAgentType.DetermineNextStep` automatically folds single-node `Tasks` emissions with no dependencies into an in-turn `Sub-Agent` step (`terminateAfter: false`) so single-agent delegations complete in a single conversation turn without spawning a background task graph, while preserving durable `Tasks` execution for multi-step (`2+` node) workflows. When an orchestrator with `ArtifactCreationMode = 'Never'` or `'System Only'` delegates a folded step to a specialist agent that produces artifacts, `AgentRunner.ProcessAgentArtifacts` resolves the specialist's `DefaultArtifactTypeID` and creation mode so deliverables are persisted and attached to the conversation message.
  - **Per-user runnable agent directory, pre-submission task graph validation, and sub-agent workflow propagation (`@memberjunction/ai-engine-base`, `@memberjunction/aiengine`, `@memberjunction/ai-core-plus`, `@memberjunction/ai-agents`, `@memberjunction/task-graph`, `@memberjunction/server`).** `AIEngineBase.GetUserRunnableAgentDirectory(user)` caches a per-user directory of active top-level agents permitted by `CanUserRunAgent`, invalidated on agent and permission changes. `BaseAgent` preloads `availableAgentCount` / `availableAgentDetails` into prompt templates, validates `Tasks` step targets before submission (converting unknown or restricted agent/action references into a self-correcting `Retry` step with the user's permitted agent list), propagates `conversationDetailId` and `Paused` workflow-awaiting state from sub-agents (`Workflow Planner`) to parent runs (`Sage`), includes `agentRun.Message` in sub-agent result markdown, and settles/reinvokes ancestor runs along `ParentRunID` in `TaskGraphDispatcher` and `TaskGraphContinuationDeliverer`.
  - **Live task graph telemetry, isolated step artifact persistence, and adaptive continuation delivery (`@memberjunction/server`, `@memberjunction/ai-agents`, `@memberjunction/conversations-runtime`).** `TaskGraphAgentRunner` resolves the originating `ConversationDetailID`, passes `inputArtifacts: []` to isolate task-graph step runs from earlier conversation turn artifacts, and forces `behavior: 'create-new'` when persisting step deliverables so sibling/prior artifacts are never overwritten as `v2`. `AgentRunner.ProcessAgentArtifacts` infers `Research Content` (`report.html`) and extracts `report.name` / `report.description` / `synthesis.executiveSummary` for report-producing specialist steps. `TaskGraphContinuationDeliverer` strips inherited upstream keys from merged `OutputPayload`s, updates the originating workflow message in-place when no intervening messages were sent (`origin.IsLatest`), or posts a bottom continuation reply linked via `ConversationDetail.ParentID` when intervening messages were sent while the workflow ran.
  - **First-class inline Workflow Execution Card, Workflow Context Header, & real-time chat reconciliation (`@memberjunction/ng-conversations`).** `ConversationChatAreaComponent` and `MessageItemComponent` reconcile live `TaskGraphProgress` frames in place, deduplicate parent container tasks from executable step rows, strip inherited upstream payload keys from step summaries, and render a relational `.workflow-continuation-banner` (`Completed workflow · <Name> · View workflow ↑`) on bottom continuation replies that scrolls to and highlights the originating workflow turn.
  - **AI Agent Workflows & Tasks Command Center (`@memberjunction/ng-conversations`, `@memberjunction/ng-tasks`, `@memberjunction/ng-explorer-core`).** Redesigned `TasksFullViewComponent` with a 5-metric KPI telemetry ribbon, instant search and status/agent filters, a **Workflow Cards** DAG view, a second-resolution **Execution Timeline & DAG** waterfall view, and a slide-over **Step Inspector Drawer** with one-click navigation back to the originating conversation.

- b14c72f: Add the personal Chief of Staff (`Chief of Staff`) AI agent, per-user narrowed governance (`MJ: AI Agent User Policies` + `AgentUserPolicyEngine`), 3-Tier Wake Gate on `MJ: User Routines` (`RoutineType = 'AgentWake'`), user-scoped calendar/email/availability actions (`EnterpriseMailboxSecurityGate`), and Communication Dashboard enterprise governance cards.
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

- 8420f36: Client-direct realtime recordings no longer depend on the browser surviving the end of the call (#5294).
  - **Opus shards during the call.** The browser captures at 48 kHz into one continuous Opus encoder (WebCodecs, or libopus WebAssembly in a Worker where WebCodecs cannot encode Opus) and uploads a 5 s `MJOPUS1` shard as raw bytes to `POST /realtime/recording/:agentSessionId/shard/:index`. Each shard is kept in IndexedDB until the server acknowledges it, so shards survive network drops and reloads and are uploaded on the next page load.
  - **Keepalive terminal.** End, `pagehide` and `visibilitychange`→hidden send `POST /realtime/recording/:agentSessionId/end` with the last partial window as a `keepalive` request, then re-send every unacknowledged shard with `keepalive`. A hidden tab's terminal carries `final=false`: the server stamps the counts but assembles only after the grace period, so switching tabs does not rewrite the recording. `EndRealtimeSession()` waits for the terminal's acknowledgement for at most 3 s. The whole-call `UploadRealtimeRecording` upload and the `beforeunload` prompt are gone from new clients. The mutations remain for older clients.
  - **Server ledger and assembly.** Migration `V202610151535` adds `RecordingStatus`, `RecordingExpectedShards`, `RecordingCapturedSamples`, `RecordingGaps` and `RecordingAssemblyVersion` to `AIAgentSession`, and the new `MJ: AI Agent Session Recording Shards` entity, written through guarded stored procedures. MJAPI assembles `recording.wav` and `peaks.json` within seconds of the terminal. A recording with missing shards is assembled as `Partial` after `realtime.recordingAssemblyGraceSeconds` (default 90): each gap is silence and is listed in `RecordingGaps`. The session janitor assembles sessions that never sent a terminal. Recovery of legacy `seg-*.pcm` storage shards is unchanged.
  - **Breaking for custom hosts:** `IRealtimeSessionRecorder` now returns Opus packets (`TakeEncodedPackets()`, `Stop(): Promise<number>`) instead of base64 audio. `BrowserRecordingUnloadGuard` is removed. A host that wires its own page-lifecycle events calls `SendRecordingTerminal({ Final: false })` when the page is hidden and `SendRecordingTerminal()` on `pagehide`.

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

- 81aea34: Enable full-conversation artifact manifest visibility (`artifactId`, `versionId`, `versionNumber`, `description`, `title`, and table/row summaries), `artifactDirective` forwarding across `LoopAgentResponse`/`LoopAgentType`/`BaseAgent` (including alpha-ID resolution to UUIDs and clean base payloads for `create-new`), `Data` artifact extract rules and payload title/description fallback on `MJ: Artifacts` and `MJ: Artifact Versions`, `QueryBuilderAgent` single-table vs. multi-table normalization on `Chat` and `Success` steps, and conversation artifact panel auto-opening on active branch paths.
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

- 1d29837: System placeholders now resolve in scoped prompt parts. After `BaseAgent.InjectScopedPromptParts` adds the parts (including from a subclass override), the agent passes the added messages to the new `SystemPlaceholderManager.ReplaceAvailablePlaceholders`, which replaces each bare token such as `{{ _CURRENT_DATE }}` with its value. Part text is not rendered as a template: every other character, including other `{{ ... }}` text, filters and tags, is sent as written, and so is a token that cannot be resolved before the prompt runs (prompt and Execution Context placeholders, or a user one without a context user). System placeholders declare what they need with the new optional `requires` field; one without it resolves only through `ResolveAllPlaceholders`, as before. Code that assembles parts itself with `PromptComponentResolver.AssembleMessages` can pass the result to `ReplaceAvailablePlaceholders` to get the same behavior.
- 0cc6b08: The Scoped Search action takes its tenant from the agent run, not from the model (A12.14).

  **Behaviour change.** Inside an agent run, the run's scope is authoritative for Scoped Search. A `PrimaryScopeRecordID` the run does not carry (a different tenant, or any tenant when the run has none) is refused with `INVALID_PARAM` and a `Forbidden` search-log row; with no `PrimaryScopeRecordID` the action searches the run's tenant. `SecondaryScopes` may restate a dimension the run sets only with an equal value; a dimension the run does not set is still added. The host sets the run's scope (`ExecuteAgentParams.PrimaryScopeEntityName` / `PrimaryScopeRecordID` / `SecondaryScopes`), never the model. The resolved tenant goes into both the permission decision and the search, so omitting it no longer drops tenant-scoped deny rows from the decision. A single agent run can no longer search several tenants by passing different values; run one run per tenant. Direct action calls outside an agent run are unaffected.

  **Malformed `SecondaryScopes` now refuses.** Input that is not valid JSON, is not an object, or holds a value other than a string, number, boolean or string array is refused with `INVALID_PARAM`, inside and outside a run. Before, it was logged and dropped, so the search ran without those dimensions. An object value is now accepted as well as a JSON string.
  - **`@memberjunction/actions-base`**: new `RunActionParams.RunScope` (`ActionRunScope`, `ActionRunScopeValue`). It is the run's tenant and secondary dimensions, set per dispatch beside `Audience`, never on the shared `Context`. Fields are `null` when the run is unscoped; the field is absent outside an agent run.
  - **`@memberjunction/ai-agents`**: `ExecuteSingleAction` always stamps `RunScope`. Inside `Execute` it uses the scope `initializeAgentRun` validated and wrote to the run row, with the agent's `ScopeConfig` defaults applied; called directly, it resolves the scope from its params the same way. `ExecuteSubAgent` strips the reserved run-data keys from the model-authored `templateParameters` before merging them into the child's `data`, and logs the key names once. The reserved keys are the scope family and `__agentTypePromptParams`. Without this a model could set a sub-agent's tenant whenever the parent's scope arrived through `data`. The parent's own `data` is passed on unchanged.
  - **`@memberjunction/ai-core-plus`**: new `RESERVED_AGENT_RUN_DATA_KEYS` and `WithoutReservedAgentRunDataKeys`. `@memberjunction/server`'s agent-run `data` guard now uses this shared list instead of its own copy.
  - **`@memberjunction/core-actions`**: Scoped Search resolves the tenant (`resolveTenant`). Forbidden rows now record the tenant they were judged under. TSDoc and `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` updated.

  Tests: unit tests in each package, and a new check in the deterministic `agent-run-audience` bundle (IT119, AU7). No migration.

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
- Updated dependencies [230cdad]
- Updated dependencies [7e72c86]
- Updated dependencies [4e4c82d]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [8420f36]
- Updated dependencies [72dd65c]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [0cc6b08]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/actions-base@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/templates-base-types@6.2.0-edge.5

## 6.2.0-edge.4

### Minor Changes

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
- Updated dependencies [a4b23b7]
- Updated dependencies [49f26d9]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
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
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/templates-base-types@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/actions-base@6.2.0-edge.4

## 6.2.0-edge.3

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
- Updated dependencies [49e0bd8]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/actions-base@6.2.0-edge.3
  - @memberjunction/templates-base-types@6.2.0-edge.3

## 6.2.0-edge.2

### Minor Changes

- 043f418: Support Decision steps in Agent Manager: update architect and planning prompt templates, add example JSON output with Decision step and Choice fork paths, and support Decision step round-tripping with configuration normalization and custom prompt IDs. The Architect validates a Flow agent's steps and paths, and those of each Flow child sub-agent, by compiling and validating them with the runtime's own `CompileFlowToTaskGraph` and `ValidateTaskGraphSpec`, and checks that a Decision step's prompt is a Decision prompt. `AgentStep.Configuration` accepts an object as well as JSON text.
- 28fdf22: Add a `Decision Eval` test type that measures typed decisions against labels inside MJ's test harness, with a suite generator and a scorecard for agreement, repeatability and calibration. The conversation-routing decision's builders (and `IsAgentAllowed`) move from `@memberjunction/ng-conversations` to `@memberjunction/ai-core-plus`, so the chat and the harness build the decision with the same code; import them from there.
- 26c0178: Flow agents gain a Decision step: one typed decision call whose outgoing paths route on its answers through the `decisions` condition root (`decisions.<key>.<question>`), both when the flow is dispatched as a task graph and when it runs in-run. An answer that fell below its question's `minConfidence`, or was never given, holds every condition that reads it, so a flow never guesses a branch; a failed decision call is a failed step, whose recovery path is taken whatever its rank. A state that is missing or empty, `{}` included, fails the step the same way in both modes, before any model is asked. A flow with a Decision step is validated the same way in both modes before its first step. Saving a task graph as a workflow now keeps its Decision nodes as Decision steps. Saving a workflow through Agent Manager now resolves the actions and prompts its steps name, so a saved Action step keeps its action and a Decision step keeps its prompt, and an action it cannot resolve is reported.
- 96daca8: Loop agents can ask typed decision questions (Likelihood, Choice, Score) through a new `decisions` field in their response. A fast decision model answers them inline on the same turn, at no LLM-turn cost, and the answers arrive on the next turn, as artifact tool results do. A request can target literal text, a payload path, or each item of a payload array. **Opt-in per agent:** set `includeDecisionsDocs: true` in the agent's `AgentTypePromptParams` (the default is `false`). That adds the decisions docs to its loop system prompt and the `decisions` field to its response type. Setting `includeResponseTypeDefinition.decisions: true` on its own adds the field without the docs. A `decisions` field from an agent that has neither is skipped. **Data flow:** each request sends its state (literal text, or the payload values it names) to the `Default Decision` prompt's model: Jev, via OpenRouter, first, and LLM Decision on failover. Set `decisionPromptName` to route them to a different prompt.

  Each decision call is linked to its Decision step, so it counts toward the run's cost and token totals and their `MaxCostPerRun` / `MaxTokensPerRun` limits. At most 8 requests run per turn (`decisionsMaxRequests`), a malformed request fails on its own without losing the turn, and decisions sent with a step that ends the run (a passing `finishIf`, a sub-agent's `terminateAfter`, or client tools with `taskComplete`) are skipped rather than paid for and never read.

- aa912ca: Loop agents can attach conditional completion gates (`finishIf`) to `Actions` steps and to a single `Sub-Agent` (not parallel `subAgents`). When the step completes successfully, a dedicated fast decision model evaluates the specified Likelihood questions against the step outputs. If all criteria meet or exceed the threshold (default 0.90), the agent completes immediately with the specified message, saving an entire turn of LLM latency and cost. The gate is skipped when an action returns `AIDirectives`, so the agent still reads them.

  **Off by default: gates are opt-in per agent**, through the new `finishIfMode` prompt param in the agent's `AgentTypePromptParams`:
  - `off` (the default): the model is not taught `finishIf`, and a gate it writes anyway is never evaluated.
  - `shadow`: the model writes gates, and each one is evaluated and recorded as a `Finish check` step, but it never ends the run. Use it to measure an agent's gates on real traffic, at the cost of one decision call per gate.
  - `on`: a passing gate ends the run with the model's pre-written message.

  A replay of recorded action rounds found that a gate at the 0.90 threshold would have ended 22% of the rounds where the agent went on to act, so turn an agent `on` only after its shadow results look right. In `on` mode a gate can only end a run early, and only when every action succeeded and every answer clears the threshold; every gate is logged as a `Finish check` step. **Data flow** (in `shadow` and `on`): each gate sends the step's results (action outputs, or the sub-agent's result) to the `Default Decision` prompt's model: Jev, via OpenRouter, first, and LLM Decision on failover.

- d13cf6b: A task-graph node can be a typed `Decision`: `MJ: Tasks.StepType` gains the `Decision` value.
  A Decision node answers its questions in one call, edges route on the answers through the new `decisions` condition root, a fork on a Choice must cover every option at submit, and an answer below its `minConfidence` or from a failed call holds the edge instead of reading as false.
  At submit, a condition may read only a decision certain to have answered by the time its edge is decided, only through the `decisions` root, and only a Choice value the question offers. A below-threshold answer never appears in the step's output, and `Retry` asks a Decision step that is holding one only the questions it is holding, keeping the answers the graph has already acted on.

### Patch Changes

- f555162: Add a `compose:email` actionable command so an agent can hand the user a pre-filled email draft.

  The agent drafts; the user sends. Nothing in this path transmits mail — the host opens the user's
  own compose window via a `mailto:` URL and the user decides whether to send.
  - **ai-core-plus** — `ComposeEmailCommand` joins the `ActionableCommand` union, with `BuildMailtoURL`,
    `MAILTO_MAX_URL_LENGTH` and `IsMailtoURLWithinLimit`. The command carries no target field: which
    compose surface opens is the host's decision, so retargeting later is a one-handler change rather
    than a migration across every agent that emits one.
  - **ng-conversations** — the handler opens the mail client via a synthesized anchor click (not
    `window.open`, which strands an `about:blank` tab on a non-http scheme). Past the length limit it
    refuses to open, copies the body best-effort, and emits for the host to open the draft artifact
    instead: a mail client handed an over-long URL does not error, it opens a draft with the body
    **silently truncated**. The emitted request carries `DraftCopiedToClipboard`, so the host can say
    the clipboard changed without ever claiming a copy that failed. compose:email is logged by type
    only, never with its body or recipients.
  - **ng-explorer-core** — handles the over-length fallback by opening the draft artifact (by
    `artifactId`, else the conversation's most recent) and showing one notification that says why
    the mail client did not open, names the artifact that opened, and says whether the text is on the
    clipboard. A stated `artifactId` that is not loaded opens nothing rather than a different
    artifact, and "nothing to open" is a notification rather than a console warning.
  - **messaging-adapters** — Slack and Teams degrade to a note naming the draft, because a `mailto:`
    URL fails both platforms' button-URL checks and the command would otherwise render as nothing.
    The note carries the label and the route back to Explorer only — never the recipient or subject:
    a channel is a shared, retained surface, and what is safe beside the composing user's own button
    is not safe for every participant.

  The button shows the draft's recipients next to it: it otherwise renders only the agent-authored
  label, so an agent influenced by injected content could pair a benign label with an unexpected
  address and the user would not see it until their own mail client was already populated. The line
  wraps rather than truncating, so a Bcc (listed last) is never cut off.

- f3c6161: Conversation routing acts on calibrated probabilities (plan Task 2.4). `ApplyPlattCalibration` and `PlattCalibration` in `@memberjunction/ai` map a decision model's raw probability to a calibrated one. Routing calibrates the thread Likelihood only for the exact model each fit was made on (`ROUTING_CONTINUES_CALIBRATION`: Jev at `typesafe/jev-1.13-20260917`, and LLM Decision when GPT-OSS-120B answered, fitted by the Phase 2 Decision Eval), and treats any other model's answer as unsure. `FindDecisionCalibration` in `@memberjunction/ai-core-plus` looks a calibration up by the decision model and the model behind it, for any consumer that calibrates. The `RunDecision` mutation and `GraphQLAIClient.RunDecision` return that model as `resolvedModel` / `ResolvedModel`. Routing waits 350 ms instead of 250 ms, which covers about 95% of Jev's answers in-process. The Decision Eval records production's routing verdict with the model that answered and the policy it was reached under, and its scorecard scores that verdict end to end, per run.
- 594f2e0: Flow Agent Editor now supports Decision steps: palette entry with scale icon and teal color, visual node subtitles and warning banners, dedicated properties panel editor for Decision key, prompt picker filtered to Decision model type, state expression, and questions list (Likelihood, Choice, Score) with full CRUD and reordering. Supports "Route on Answer" outgoing path condition builder with live Choice coverage hints. Renaming a Decision step key, a question or an option rewrites the path conditions that read it, once, on commit. The editor checks the flow with the runtime's own compiler and validator as it is edited, and flags each problem on the step or path it is about. ai-core-plus adds writers and rewriters for `decisions` conditions (`DecisionReferenceText`, `DecisionConditionLiteral`, `RewriteDecisionQuestionReferences`, `RewriteDecisionChoiceValues`) and exports the Decision key check (`FlowDecisionKeyProblem`).
- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [2552b1e]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [f3c6161]
- Updated dependencies [5148534]
- Updated dependencies [0adaf76]
- Updated dependencies [ce1a5c3]
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
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/actions-base@6.2.0-edge.2
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

- 7110019: Extract `BaseModelRunner` and shared model-run types. A behaviour-neutral move (typed-decision plan, #4660, Phase 0 Task 0.3).
  - Move shared parameter/result types to `@memberjunction/ai-core-plus`
  - Introduce `BaseModelRunner` abstract base in `@memberjunction/ai-prompts`. It declares `RequiredModelType`, a model-type name that a later change in this series enforces; nothing reads it yet. Its protected API is still settling across that series.
  - Reparent `AIPromptRunner` onto `BaseModelRunner` (behavior-neutral). `AIPromptRunner` still logs uncategorized errors under `AIPromptRunner`; a runner that does not override `DefaultLogCategory` logs them under `BaseModelRunner`.
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
- Updated dependencies [520bd09]
- Updated dependencies [307da67]
- Updated dependencies [a7da50b]
- Updated dependencies [1d43161]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/actions-base@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/templates-base-types@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- 37891d3: Move the conversation-attachment blob seam (`IAttachmentBlobStore`, `AttachmentBlobUploadInput`,
  `AttachmentBlobUploadResult`, `AttachmentBlobStoreUnavailableError`) from `@memberjunction/aiengine`
  to `@memberjunction/ai-core-plus`, next to the placement policy in `ConversationUtility`. `aiengine`
  re-exports it, so existing consumers are unaffected.

  `ng-conversations` implements this seam for the browser and imported the types with `import type`,
  on the reasoning that an erased import costs nothing. It costs nothing at _runtime_ — but the
  class-registration manifest generator walks **package.json**, not imports, so the declared
  dependency was a live edge regardless. When `aiengine` gained a `@memberjunction/storage`
  dependency, that edge carried seven storage-driver classes into the browser manifest and broke the
  MJExplorer bundle on `node:net` / `node:stream` / `node-fetch`.

  The rule this encodes: a browser-reachable package must not _declare_ a server-only dependency,
  even for a type. `ng-conversations` no longer declares `aiengine` at all.

- Updated dependencies [abf8778]
- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
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
  - @memberjunction/actions-base@6.2.0-edge.0
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/templates-base-types@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Minor Changes

- 22ec804: Clickable record-link tokens in Chat messages (`type: "record"`). Agents emit `@{…}` JSON; the renderer turns it into a pill that opens the row via OpenEntityRecord, including composite primary keys. `name` is optional — omit it for an icon-only pill when surrounding prose already names the record. Loop prompt teaches the grammar and asks for world-class UX: prefer icon-only, one citation per record per section.
- e7f1f88: Two defects a dispatched workflow hit end to end — one that killed the run, one that misreported it.

  **The invocation envelope could not be written down.** R3-3 carried `ExecuteAgentParams.context` into the parent task's `InputPayload` verbatim. That parameter is documented as possibly a class instance holding "external service credentials or connection information", so the first real agent run whose context held a socket died at submit time with `Converting circular structure to JSON --> starting at object with constructor 'Socket'` — before any step executed. Had it serialized instead, those credentials would have been written to a row that outlives the run. `SanitizeInvocationEnvelope` now reduces the envelope to what is safe to persist at the durable boundary, so every submission path is covered: JSON data survives (primitives, arrays, plain objects, `Date`, anything with `toJSON`), while class instances, functions, sockets and cycles are refused **and reported by path** — a value that silently vanished is a condition reading absent-data and taking a branch nobody can explain later.

  **Three agents referenced Font Awesome Pro glyphs** (`fa-chart-diagram`, `fa-shield-check`, `fa-chart-mixed`), which render as nothing in the free 6.5.2 build Explorer loads — an empty icon square rather than a missing-icon indicator, since an absent glyph is silently invisible. Swapped for free equivalents in `metadata/agents`. Betty and Skip keep their `mj-icon-*` classes, which are intentional custom styling.

  **A dispatched workflow reported itself finished while it was still running.** The run-tree query joins the submit step to the graph it produced, so one workflow arrives as two rows whose statuses disagree: the step's describes the _submission_ (`Completed` in ~300ms, correctly), while its title names the _graph_, which is still going. The result was "Task Graph: X — Completed" sitting above steps that had not run, contradicting the page header's own "PAUSED / Workflow still running". The timeline now renders the pair as one row that keeps the step's identity — so selection and deep links still resolve — and takes its status and timing from the graph, with submit latency preserved in the subtitle. A failed or in-flight submission keeps its own row, since there is then no graph to inherit from and the submission is the whole story; an unrecognized shape declines to collapse rather than guessing.

  **Action and agent icons, resolved without a hop.** `get-agent-run-tree.sql` now returns `ActionID` and `AgentID` for the nodes that have them — read by joining back to the task (and, for a loop's passes, to the execution log they expanded from), the same way `LoopMode` already is, so none of the CTE's six members change. That removes the join a consumer would otherwise make and fixes the real defect: the same action rendered as two different generic glyphs depending on which arm of the query produced its row, because a graph step and a loop pass arrive by different paths. A task carries its `ActionID` whether or not it ran, so a **skipped** branch can now show which action it would have run — something the execution log can never say, since no log exists for work that did not happen. A `ForEach` keeps its loop icon rather than the icon of the action it repeats.

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

- 9a29da4: Retire the Workflows app; make the Flow agent form first-class.

  The Workflows app owned no storage — a workflow's WHAT is a Flow agent and there is no `Workflow` table — so it was a second list of rows the AI app already listed, fronted by a canvas that duplicated the Flow agent editor and had no Save path at all. Removed, and replaced by making the agent record answer what the app was implicitly about.

  **`@memberjunction/ng-core-entity-forms`** — the AI Agents form is now tabbed: the agent type's designer (any type declaring a `UIFormSectionKey`), Details (the existing accordion set, unchanged), and Invocations. The designer pane is hidden with CSS rather than removed from the DOM, so unsaved canvas edits and canvas viewport state survive a tab switch. The default tab is the first that exists, so a Flow agent opens on its diagram.

  **`@memberjunction/ng-agents`** — new `<mj-agent-invocations>`: a read-only index of every automated pathway that invokes an agent (Scheduled Jobs, User Routines, Entity Action bindings, Record Processes, sub-agent steps and relationships, `ExposeAsAction`). Answers "what runs this when I'm not looking?", which no surface could previously answer from the agent's side.

  **`@memberjunction/ai-core-plus`** — `AgentSpec.Status` and `AgentStep.StepType` now derive from their entity fields instead of restating them. Both had drifted: `Status` declared `'Inactive'`, which `AIAgent.Status` has never accepted, so any caller setting it wrote a value the CHECK constraint rejects; `StepType` omitted `ForEach` and `While`, making loops executable but unauthorable. `AgentStep` gains `LoopBodyType` and `Configuration`, and the action mapping fields now admit the object form that callers already pass.

  **`@memberjunction/ai-agent-manager`** — `AgentSpecSync` round-trips loop fields; new pure `ValidateLoopStep` catches a loop that saves cleanly and then iterates zero times; the Architect's status validator accepts `Disabled` rather than the invalid `Inactive`, and `WorkflowAgentWriter` maps Draft/Paused workflows to `Disabled`.

  **`@memberjunction/ai-mcp-server`** — the `List_Agents` status filter no longer offers `Inactive`, which could never match a row.

  **`@memberjunction/ng-dashboards`** — the Workflows dashboard, its module, its resource component and its `ng-task-graph-editor` dependency are removed. `mj-task-graph-editor` itself is unchanged and keeps its read-only consumers.

  The `Workflow.Draft` / `Workflow.Save` / `Workflow.Validate` Remote Operations are deliberately kept — they are the agent- and MCP-facing contract and matter more now that creation is conversational.

  A migration removes the Workflows Application row from existing databases (idempotent; a no-op on a clean install). The Architect prompt template change requires `mj sync push` to take effect.

- 394d276: Phase 5 of the unified workflow DAG engine program (plan: PR #3456) — a generic graph component whose subject is `TaskGraphSpec`.

  **New package `@memberjunction/ng-task-graph-editor`.** It views and edits **`TaskGraphSpec`** — the one fully-qualified graph contract every producer in the program already authors against (D16) — rather than any particular persistence. A design-time flow, a graph an agent emitted at runtime, a stored workflow definition and a graph someone is drawing from scratch are all the same type here, so one component serves the Flow Agent editor, the Agent Run admin view, conversation plan cards, the Tasks view, and anything downstream.

  **Why a new package rather than extending `ng-flow-editor`.** That package's _generic_ half — `FlowEditorComponent`, `FlowNode`/`FlowConnection`, the Dagre layout and Foblex canvas — is genuinely reusable and is **depended on, not forked**. Its _domain_ half is bound to `AIAgentStep`/`AIAgentStepPath`. Phase 4 established that a runtime task graph and a design-time flow are the same model; an editor that can only speak the agent-entity dialect cannot serve the other provenance, and teaching one component two dialects is exactly how the two drifted apart before the traversal-engine extraction fixed it.

  **Layer discipline (`widgets`).** `"mjUILayer": "widgets"` declared from the first commit. No `@angular/router`, no `@memberjunction/ng-shared`, no `NavigationService`, no global-provider construction. Route-derived state arrives as `@Input()`; navigation _intent_ leaves as an `@Output()` the host acts on, because a widget cannot know whether it sits inside Explorer, a downstream app, or an embedded panel.

  **The event contract is the reusable surface.** Vetoable actions ship as `Before*`/`After*` pairs whose args are **classes** extending `CancellableTaskGraphEventArgs` — `Cancel` has to travel _back_, which a frozen payload cannot do. A canceled `Before*` does not emit its `After*` and does not mutate the spec; that is a contract hosts rely on, and it is pinned by tests, because a refactor that moves the emit above the `Cancel` check yields a component that looks correct and ignores every veto. Informational events (`SpecChanged`, `SelectionChanged`, `ValidationChanged`) are single emitters — no veto is invented for something that cannot be vetoed. Public imperative methods exist for the one case the event contract cannot serve: a host that must `await` a confirmation before acting, since a `Before*` handler cannot await.

  **Validation is the engine's.** Cycles, unknown dependency refs and assignment conflicts come from `ValidateTaskGraphSpec` in `@memberjunction/ai-core-plus` — the same function `LoopAgentType` and `TaskGraphService.Submit` call. A second implementation here would be a second definition of "valid", and a graph that passed on the canvas would be free to fail at submission.

  **A cycle is refused, not merely reported.** A cyclic graph can never execute — nothing ever becomes eligible — so letting the canvas draw one would let someone build a workflow the engine must then reject. The `Before*` event carries `WouldCreateCycle` so the host can _explain_ the refusal rather than let a stroke silently fail to appear.

  **Runtime overlay.** Supplying `RuntimeStatus` turns the same canvas into a live view of the same graph — the convergence point the program was aiming at: one renderer for design time and run time, rather than an editor and a separate Gantt that can disagree. `Blocked` deliberately renders as a _warning_, not an error: nothing went wrong, the graph simply cannot reach it, and showing a failure would send someone hunting for a bug that does not exist.

  **`ConvertAgentSpecToTaskGraph`** (in `ai-core-plus`) completes the round-trip Phase 4 started. Without the inverse, a graph could be _saved_ as a workflow but never _reopened_ on the same canvas, and MJ would need a second flow-shaped renderer — back to two graph UIs that can disagree. Conditions survive the round-trip because both models store the same grammar, which is why `TaskDependency.Condition` was given `AIAgentStepPath.Condition`'s shape in Phase 4.

  **Coverage:** 73 new unit tests in the package (39 adapter, 34 component) plus 7 round-trip tests in `ai-core-plus`. The adapter is deliberately pure and separate from the component so its tests are about graphs rather than about Angular.

- 394d276: Phase 1 of the unified workflow DAG engine program (plan: PR #3456) — makes the task substrate tell the truth about what actually happened.

  **Payloads become columns.** `Task` gains `InputPayload`, `OutputPayload`, `ErrorMessage`, and `AgentRunID`. Inputs and outputs previously rode inside `Task.Description` behind `__TASK_METADATA__` / `__TASK_OUTPUT__` markers, which leaked orchestration plumbing into search results and the task detail panel. A one-time migration backfill converts existing marker rows into the new columns and strips the markers; there is deliberately **no fallback parse** in code, because a fallback with no backfill never dies. The backfill is conservative — a row whose marker text doesn't parse as JSON is left byte-for-byte intact for inspection rather than silently discarded.

  **Failures propagate instead of stalling.** A `Failed` dependency used to leave its dependents `Pending` forever: they never became eligible, so the graph appeared to finish while work silently never ran — and the parent was marked `Complete` at 100% regardless. Now failure propagates transitively to `Blocked`, and the parent rolls its children up honestly (`Failed` > `Blocked` > `Cancelled` > `Complete`, with progress counting only completed children). Completion notifications fire only for genuinely successful graphs.

  **Bad graphs are rejected before they are persisted.** Dependency cycles are detected at creation (a cyclic graph could previously be saved and then deadlock silently), and a graph naming an unknown agent is now an error rather than being logged-and-skipped — which used to execute the graph with holes where the caller's tasks should have been.

  **Waves run in parallel.** Eligible tasks execute with bounded concurrency (5) rather than one at a time, and each pass loads the graph once instead of issuing a dependency query per candidate task. Stalled graphs — pending work, nothing runnable, nothing in flight — are now detected and logged rather than exiting quietly.

  **The Gantt links the right run.** `Task.AgentRunID` records the specific run that executed each task. The UI previously joined tasks to runs through the shared `ConversationDetailID`, so every sibling task in a graph resolved to the _same_ agent run; the link was wrong for all but one. `Blocked` and `Failed` also now render distinctly instead of inheriting the pending treatment.

  **New pure graph algorithms** in `@memberjunction/ai-core-plus` (`computeEligibleTasks`, `computeTasksToBlock`, `computeParentRollup`, `detectCycle`, `isGraphStalled`, `findUnknownDependencyRefs`) — dependency-free, operating on plain shapes rather than entities, with 44 unit tests. Phase 2's durable dispatcher consumes these unchanged rather than reimplementing eligibility and propagation.

  **Also:** dispatcher claim columns (`ClaimedBy`, `ClaimExpiresAt`) and their supporting indexes land now so Phase 2 adds the dispatcher without further schema churn — nothing reads them yet. `AIAgentRunStep.StepType` gains `TaskGraph`. New deterministic integration bundle `task-graph-orchestration` (TG1–TG4) covering cycle rejection, unknown-agent rejection, payload columns, and the new schema's presence in generated metadata.

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

- ca4feb4: Workflow cost becomes a projection of the run tree, and a graph now runs in the order it was drawn.

  **Cost is the tree, not arithmetic beside it.** `AIAgentRun`'s four `…Rollup` columns are now written from `SumAgentRunTreeCost(LoadAgentRunTree(runID))` at settlement — one basis (per-node own spend), prompt-aware through `Configuration.runtime.promptRunID`, and structurally incapable of disagreeing with what the run viewer shows. The previous per-child loop filtered on `AgentRunID`, so every Prompt step's spend was absent, and mixed a descendant-inclusive number with an own-spend one. The tree now also carries the prompt/completion token split so all four columns share a basis. Writing the sum back makes the column an _output_ of the tree, which is non-circular only because the query reads own cost and never a rollup — stated in the query header and pinned by a test that plants an absurd rollup on a real run. When the tree cannot be summed (load failure, depth cap, graph not reachable), the columns are **cleared** rather than left holding a stale total from an earlier settlement.

  **A loop's passes exist.** The run tree reaches nested work through six relationships and a loop iteration was none of them, so a `While` that spent real money across three passes reported one childless node with no cost. The dispatcher now records one entry per pass (`ITaskStepRuntime.iterations`) and the tree expands them into nodes. On a real workflow this moved `TotalCostRollup` from `0.00049725` to `0.00555375` — the loop had been spent and not counted.

  **A graph is dispatched only once its edges exist.** Children and dependencies are now written in one transaction. Previously a poll could land between the two writes, see tasks with no prerequisites, and claim the whole graph at once — observed running a closing branch before the draft it was meant to judge existed, then reporting Complete.

  **Steps see their payload.** A step with no input mapping fell back to the raw input instead of the merged payload, so a Prompt step — which declares no mapping by design — rendered `{{ _CURRENT_PAYLOAD }}` as `{}` and wrote from an empty brief. Separately, a step with no output mapping _replaced_ the payload with its own output rather than merging; for a loop, whose output is a summary, that discarded everything the iterations had established and made a downstream `payload.x === true` edge unreachable.

  **An output mapping that names a parameter the step never returns now says so** (`unmapped`), naming what the step did return, instead of skipping in silence.

  **Human steps**: a cancelled request re-raises instead of stalling forever; cancelling a graph withdraws its open requests instead of leaving them in someone's inbox; cross-user `assignToUserID` is refused at submission rather than silently reassigned to the submitter; and a step can declare `expiresInHours`, which finally makes the existing expiry machinery reachable.

  **Web Search** captured each result with a non-greedy match that stopped at the first nested `</div>`, cutting the snippet out of every result — ten well-formed hits carrying no content. Results are now sliced between block starts, and an all-snippets-empty parse is reported rather than returned silently.

  **Testing**: a bundle whose every check is gated out now records an explicit skip naming the flag that would run it, instead of reporting PASS with zero checks executed.

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

- 199eb2b: Debug a Flow agent from the Agent form Run dialog. Debug starts the graph paused at Submit (`$.debug.paused` on the parent row — Pause-after-submit races the dispatcher). The harness and Runs console share a VS Code-style icon toolbar and a red-circle breakpoint toggle. The invocation-envelope sanitizer from #3783 is preserved.
- 1940a4d: Recover LLM responses broken by a single unescaped character, and stop misreporting why they broke.

  Models embed rich markdown in JSON string fields — mermaid diagrams, HTML mockups, code samples — and reliably escape most of it. One missed quote inside a 25KB response invalidates the whole document. Three defects meant that was unrecoverable and misdiagnosed.

  **`CleanJSON` discarded the response over an interior fence.** Once the top-level parse failed for any reason, fence extraction ran unconditionally. That regex has no idea it is looking inside a string value, so a ` ```mermaid ` fence embedded in a markdown field matched, its contents were extracted, the JSON envelope was thrown away, and `CleanJSON` recursed into the fragment. A 28KB agent response with one unescaped quote at offset 23011 was reported as `Unexpected token 'm', "mermaid\ns"...`. Fence extraction now skips input already shaped like a JSON envelope — a genuinely fence-wrapped response starts with the fence and a prose-buried one starts with prose, so neither is affected. The throw also carries the untouched parse error as `cause`.

  **The repair chain reasoned from the wrong error.** `attemptJSONRepair` received whatever escaped `JSON.parse(CleanJSON(rawOutput))`, which may describe one of `CleanJSON`'s intermediate transforms rather than the model's actual output. That message was handed to the AI repair prompt as `ERROR_MESSAGE`, recorded on the prompt run, and re-thrown — so a model was asked to fix an unexpected `'m'` in a mermaid fragment when the real defect was one quote at a known offset, in text it was never shown. `resolveTrueParseError` now derives the error from the raw output directly.

  **Nothing could repair an unescaped quote.** JSON5's leniency covers trailing commas, comments and unquoted keys, but an unescaped `"` terminates a string in JSON5 exactly as in JSON, leaving only an LLM round-trip on the full payload. New `RepairJSONEscaping()` in `@memberjunction/global` is error-driven and deterministic: read the failure offset, walk back to the character that ended the string early, escape it, re-parse, repeat. Every pass is validated by a real parse, so it cannot pattern-match its way to a wrong answer the way a global regex rewrite would, and it gives up rather than guessing when it cannot make progress. It runs in `attemptJSONRepair` between the JSON5 and AI stages — microseconds against an LLM round-trip, and it cannot invent content. `_jsonRepairInfo` gains a `LexicalEscaping` method and records the offsets escaped, because that repair infers intent and should never be invisible.

  Replayed against 16 real failing production payloads: 16/16 recovered, 180 characters escaped, 12ms total. Each repair verified escapes-only — removing the inserted backslashes reconstructs the original byte-for-byte — with a valid response shape. Against 34 already-valid payloads, 20 containing markdown fences: zero false positives. The production failure that motivated this had burned all ten agent retries, roughly four minutes and 79K completion tokens, before terminating; it now recovers in 0.61ms with the AI stage never reached.

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

- d907a1b: Wire the four unused workflow debug verbs into the Run Console — breakpoints, edge overrides, force-complete, and edit-input — so a held or interesting graph can be stepped without leaving Explorer.
- f5ec13b: Harden `SafeExpressionEvaluator` against a sandbox escape, and correct Skipped-status reporting.

  **`SafeExpressionEvaluator` sandbox escape closed.** The previous defense was a textual denylist,
  which a split-token expression walked straight through:
  `[]["cons"+"tructor"]["cons"+"tructor"]("return process.pid")()` spells none of the banned words yet
  climbs `[].constructor.constructor` to the `Function` constructor and reaches `process` — a
  confirmed arbitrary-code route from any metadata-authored expression (field rules, flow/loop agent
  conditions, task-graph conditions). Validation is now a **structural AST allowlist**: the expression
  is parsed and every node checked before compilation, rejecting computed member access whose key is
  not a literal (the concatenation route), `.constructor`/`__proto__`/`prototype` access, any call
  outside the safe-method and safe-global lists, and host-global identifiers. Because the check is structural it cannot
  be defeated by string assembly, and it also stops the denylist's over-rejection of legitimate data —
  `name == 'constructor'` and a field named `window` are now valid again. `validateSyntax` continues to
  parse-without-executing on top of it.

  **The expression grammar NARROWED, and callers should read this list.** The old denylist enforced
  almost nothing, so the accepted surface was in practice "whatever `new Function` compiles". The
  structural allowlist accepts what the evaluator's contract always documented — comparisons, logical
  ops, dotted/indexed access, the `SAFE_METHODS` list, arrow-function array callbacks, `typeof` — plus
  optional chaining (`payload?.customer?.tier`) and the safe globals below. **Now refused**, where the
  denylist let them through: `in` / `instanceof`, regex literals (`/x/.test(y)`), and string/array
  methods outside `SAFE_METHODS` (`.split()`, `.replace()`, `.slice()`, `.substring()`, `.match()`,
  `.join()`). No metadata shipped in this repo uses any of them; installations authoring their own
  expressions (field rules, flow/loop agent conditions, task-graph conditions) should audit the columns
  that store them before upgrading.

  **Ambient globals stay callable, and the list now has ONE owner.** `SAFE_EXPRESSION_GLOBALS` in
  `@memberjunction/global` — `Math`, `Number`, `String`, `Boolean`, `Array`, `Object`, `JSON`, `Date`,
  `parseInt`, `parseFloat`, `isNaN`, `isFinite` — may be called as namespace methods (`Math.abs(...)`,
  `Object.keys(...)`, `JSON.stringify(...)`, `Array.isArray(...)`, `Date.now()`) or as bare functions
  (`Number(...)`, `parseInt(...)`, `isNaN(...)`). Receiver and method are both fixed identifiers, so
  none of the four invariants that close the escape is weakened. `ai-core-plus`'s task-graph door now
  imports that set instead of keeping its own copy: `1efc248ac5` shipped the decision that the door
  must not refuse `Number(payload.count) > 3` or `Math.abs(output.delta) < 5`, and a second curated
  list is how the two halves came apart. `RESOLVABLE_GLOBALS` is removed from
  `@memberjunction/ai-core-plus`; import `SAFE_EXPRESSION_GLOBALS` from `@memberjunction/global`. The
  pinning test now CALLS every entry — it previously only read each name (`Math !== undefined`), which
  is why a screen that refused `Math.abs(x)` passed it.

  **A policy refusal now HOLDS a task-graph edge instead of rerouting it.** `IsBrokenGuard` recognises
  the evaluator's refusal message, so a stored graph carrying a construct this build no longer accepts
  stalls visibly rather than taking a different path with no recorded cause — the dispatcher logs a
  reason only on `hold`.

  **Skipped test status wired through reporting.** `MJ: Test Suite Runs` now records `SkippedTests`
  and `ErrorTests` (previously left NULL); the CLI single-test and suite-markdown formatters render
  Skipped as SKIP rather than FAIL and keep skips out of the Failures section; and the exported
  summary aggregator counts skips separately and averages over the executed set.

- 7a630ba: Three writes take an object the CALLER built and stringify it straight into a database row — an agent run's `Data` and `StartingPayload`, and a task graph's invocation envelope — and all three take it from `ExecuteAgentParams`, whose own documentation says the value may be a class instance holding "external service credentials or connection information". One of the three was guarded, after it killed agent runs at submit time with `Converting circular structure to JSON`. The other two were not.

  That combination fails two ways, and the second is worse: it **throws** on anything holding a socket, a pool or a provider, and it **leaks** when serialization happens to succeed, writing whatever the object held into a row that outlives the run. The first is loud and gets fixed; the second is silent and does not.

  `SanitizeForPersistence` / `StringifyForPersistence` now carry the rules in one place, and all three writes use them. JSON data survives (primitives, arrays, plain objects, `Date` as ISO, anything with `toJSON`); class instances, functions, sockets and cycles are refused whole rather than unwrapped — walking a socket's own properties would "work" and would persist its internals, which is the leak. Every drop is reported by path and logged, because a value that silently vanished is the failure one layer down: a reader hunting a field the writer discarded, or a condition reading absent-data and taking a branch nobody can explain.

  Also: the flow differential suite gains its first **failure oracle**. It could not express `'edges'` semantics — the dialect where a flow routes around its own failure — because the simulator treated "which origin statuses may decide an exclusive group" as a constant where the dispatcher treats it as the graph's dialect. With that modelled, a fixture whose step fails and whose recovery path runs is now compared walker-against-compiled, and the comment states why `'block'` has no oracle by construction: the walker routes on failure, so there is nothing to compare a compiled `'block'` graph against (IT74's TX19 pins that side instead). And the all-`Optional` node's wave-1 behaviour — the consequence the spec doc calls out as surprising and nothing asserted — is now pinned, so an OR-join implemented later reads as a deliberate semantic change rather than a bug fix.

  **Two behaviour changes worth knowing about, both deliberate.** A class instance is now refused _whole_ and reported by path, where `JSON.stringify` would have persisted its own enumerable properties — so an agent whose payload legitimately is a class instance will find that payload dropped rather than partially recorded, with the path named in the log. Dropping loudly is the intended posture: the alternative persists whatever the object happened to hold. And `toJSON` is no longer consulted for anything but `Date`, because deferring to a method on the object being guarded hands the decision back to the party the module does not trust — a `toJSON() { return {...this} }`, a common convenience, published its own credentials silently and with an empty `DroppedPaths`.

  Also worth knowing: sanitizing **invokes getters**, once per property, so a payload holding lazily-opened resources can open one by being written down. Refusing class instances removes most of that surface, since their getters are never reached.

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
- 1bd9674: Task-graph engine hardening, Phase 1 — four correctness fixes at the seams between the well-built layers. Every one of them failed silently as success: the run reported Complete while the wrong work happened, or the settlement was lost with no error and no stall.

  **P1 — an exclusive loser could skip a task another route still reaches.** A losing edge decided its target's fate rather than its own, so a fork whose loser pointed at a step the winner also reached (directly, or through a join) skipped that step while it was still due to run — and the graph settled Complete with the work never executed. `ResolveExclusiveGroups` no longer seeds a target a kept edge also points at, and `ConfirmSkipSeeds` answers the surviving-route question the dispatcher already asks for ordinary dropped edges.

  **P2 — an unevaluable guard executed the work it was guarding.** A condition that failed to evaluate returned "keep the edge", and since conditions are only evaluated once the origin is terminal, a kept edge from a `Complete` origin is a satisfied prerequisite. The spec layer, the legacy walker and the exclusive path all said the opposite. Unevaluable is now an undecided HOLD, and `IsGraphStalled` counts held tasks so a graph waiting forever stops reporting healthy.

  **P3 — settlement is recoverable.** The post-settlement sequence ran after the parent's terminal write, and a terminal parent matched no sweep query — so a crash in that window left the submitting agent run `Paused` forever, with no cost rollup and no notification. A third sweep arm finds terminal-but-unsettled graphs (wide once at startup, 24h in steady state), the settle sequence is re-entrant, and `Cancel` now defers to the dispatcher instead of writing the parent terminal itself, which makes cancellation deterministic.

  **P4 — the continuation marker is a real compare-and-swap.** It was read-check-write, so two dispatchers could both deliver one settlement — for `reinvoke`, two billed agent turns. It is now a single guarded UPDATE in `TaskClaimStore`, and the parent's status and start-time writes are column-scoped so a full-row save can no longer erase the marker another instance just claimed.

  **A stopped dispatcher now stops writing.** `Stop()` waited on in-flight tasks but not on the timer passes, which are `void`-ed promises nothing held — so it returned mid-pass and that pass went on to settle graphs, emit lifecycle frames and claim new tasks afterwards. Three quiet consequences: a `GraphSettled` frame arriving after every subscriber had gone, a shutting-down process manufacturing the orphaned claims reconciliation exists to clean up, and statements colliding with the host's reuse of the connection. Passes are now drained (they are bookkeeping for work that already happened, so cancelling one would open the very crash window P3 rescues), and no new work is claimed after the decision to stop.

  **Every dispatcher query is scoped to workflow graphs.** `MJ: Tasks` is general-purpose — conversation tasks and users' own to-dos live there too — and the sweep did not filter by task type, so it rolled up and overwrote the status of anything with children. `Submit` has always stamped the `AI Workflow` type, so the discriminator already existed on every dispatcher-owned row; it is now in all three sweep arms and inside the guarded statements that write a payload column.

  **New: an edge condition that cannot be parsed is refused at authoring time.** `SafeExpressionEvaluator.validateSyntax()` compiles an expression without evaluating it, which is what lets the check be syntax-only: unknown identifiers, absent properties and undefined chains all pass, because whether `payload.x.y` resolves is a question about a run that has not happened yet. `ValidateTaskGraphSpec` applies it to dependency conditions and `While` loop conditions, reporting every failure at once and naming the step and the condition text.

  ⚠️ **Migration note.** A saved workflow or flow whose condition never parsed has been failing at run time all along — silently before P2, as a held branch after it. That failure now surfaces at SAVE time instead, so editing an unrelated step in an old flow can newly report an error on a step you did not touch. The message names the step and quotes the condition so the surprise explains itself. Nothing rejects on load, and unknown identifiers are explicitly NOT an error — only expressions that cannot parse at all.

- 9f6a53b: Task-graph engine hardening, Round 2 — the ring of seams one layer out from Round 1's, found by a four-track adversarial review of the merged engine. Same signature as before: the graph looks fine while a run strands forever, or wrong work executes under a clean verdict.

  **R2-1 — a crashed prompt task was unrecoverable and undiagnosable.** Claim reclamation scoped to `AgentID OR ActionID`, a predicate written before the `PromptID` column existed. A Prompt step (and a ForEach/While with a prompt body) carries neither, so once its owner died it was invisible to both reclamation statements and not even reported by the orphan sweep — graph `In Progress` forever, submitting run `Paused` forever, and the stall detector calling it healthy. Every site now asks one shared predicate that says what the engine means, so the next runner column cannot re-open the hole. This also closes Round 1's B4: the human settle and expiry sweeps used a narrower dialect than reopen, so a human task written before `StepType` existed could be asked and then never settled or expired.

  **R2-2 — the delivery marker was claimed by passes that had not actually settled anything.** The settle sequence's steps each swallow their own failures by design, but the rescue sweep's only re-entry key is the marker, and the marker was claimed unconditionally at the end of the same pass. So a crash between steps was recoverable and a _soft failure_ was permanent. The sharpest case needs no failure at all: a fast graph settles before `finalizeAgentRun` has parked its submitting run, so the lifecycle write silently no-ops and the cost write is overwritten by finalize's own full-row save. The run half is now gated on a read-only readiness check and a settle verdict; nothing claims the marker unless the pass genuinely completed, so the sweep re-enters. Bounded at five minutes, because a submitter that died before parking must not hold a completed workflow's outcome hostage.

  **R2-3 — routine data absence was classified as a broken guard.** A condition dereferencing the null output of a step that produced nothing threw, and every throw became a hold — permanent, since a terminal origin's output can never change. The flow engine's `payload` is the agent's accumulated payload, an object, so `payload.approved` there is simply falsy; the dispatcher's null was the divergence. Object-shaped roots are now null-safe, deeper absent chains read as a false verdict, and an unknown _root_ still holds because that genuinely is a broken guard. Conditions on edges out of a **Skipped** origin are no longer evaluated at all — the edge drops, matching the walker, because against an empty envelope a negated condition comes out true and hands a not-taken branch's target a satisfied prerequisite.

  The validator now refuses unknown roots at submit time, reversing a deliberate Round 1 decision: with data absence reading as false, an unknown root is the only remaining way to earn a permanent hold. It stays silent when an expression binds a name of its own (an arrow parameter), so it may miss a typo but never invents one.

  **R2-4 — `failureSemantics: 'block'` did not gate exclusive-group resolution.** The dispatcher passed the same `['Complete','Failed']` set to every graph. Under `'block'` — the spec's default — a Failed origin resolved its fork, the losers were seeded and cascaded to `Skipped`, `Skipped` satisfied dependents, and the removed loser edges severed the block cascade's forward walk, so a join fed by an independent healthy route executed downstream of an unhandled failure while the parent still rolled up `Failed`. The graph's own dialect is now threaded in.

  ⚠️ **Behaviour change at the authoring door.** A spec whose edge condition references a root the runtime does not provide is now refused at save time rather than holding a branch at run time. The message names the step, the dependency and the condition, and lists the roots that are available.

- 6d7d3da: Task-graph engine hardening, Round 3 — the residual gaps in Round 2's own fixes, found by a three-track adversarial review of the merged engine. The pattern this round is not new seams but **incomplete closures**: six Round 2 fixes worked at their own anchor and left the layer just outside it open.

  **R3-1 — an early finish could discard a step that was already running.** R2-10 moved the sibling skips after `CompleteClaimed` on the premise that "siblings are Pending and unclaimed until the skip lands". They are not: task execution is not awaited, so the deciding instance's own poll tick runs concurrently with its skip loop, and the decision existed only in that instance's memory — no claim filter anywhere could know about it. A sibling claimed mid-loop had `In Progress` reverted to `Skipped` and its claim cleared _while its agent body ran_: side effects fired, completion refused, output discarded, graph settled `Complete` with nothing recording it. The early finish now declares itself durably before mutating anything (so every instance's claim filter sees it) and every skip is a guarded single statement that refuses a task something else has taken.

  **R3-2 — R2-4 gated one dialect and left the other blind.** Under `failureSemantics: 'block'` — the spec default, so every agent-emitted graph — a `Failed` origin's ordinary conditional edge that read false was dropped, its target skipped rather than blocked, and the dropped edge severed the block cascade's forward walk. `Skipped` satisfies prerequisites, so a join fed by an independent healthy route executed downstream of an unhandled failure while the parent still rolled up `Failed`. R2-3 made this _more_ reachable, not less: a failed step rarely has output, so the null-safe envelope answers positive conditions with a confident false→drop where they previously threw→held visibly. `Cancelled` is now decided once and written into the spec: it never decides an ordinary edge under either dialect.

  **R3-3 — the documented `data`/`context` conditions never worked on the dispatcher.** They resolved against the origin _step's_ output rather than the invocation's parameters, so every `data.x` comparison read `undefined`, came out false, and silently took a branch the legacy walker never took — on every invocation, with the validator blessing the condition at the door. An invocation envelope is now threaded from the agent through submit, the parent's metadata, and condition evaluation. Round 1's carried-forward D2 lands as code. `stepResult.step` also now carries a status word rather than the step's name, matching what the flow engine actually exposes — the documented `stepResult.step === 'Success'` was false for every step before this.

  **Also fixed:** a `Stop()` during boot no longer has its timers reinstalled by `Start()`'s own continuation (R3-4); concurrent human-step notifications no longer leave a duplicate, un-answerable inbox item — collapsing them belongs to the sweep over _waiting_ steps rather than to the raise, because a task is notified exactly once and the raise never runs again afterwards, so a duplicate that outlived its own raise was previously unreachable by the only code that could have closed it (R3-5); the data-absence classifier is inverted so it cannot rot per operator — a `ReferenceError` is a broken guard, everything else is absent data (R3-6); the determinism tiebreak is ordinal rather than locale-collated, so two hosts with different `LANG` cannot resolve the same tie differently (R3-7); a transient cost-rollup failure defers delivery instead of claiming the marker and locking a wrong total in forever (R3-8); `Cancel`'s child writes are guarded statements that cannot overwrite an outcome that landed first (R3-9); nested cancel is type-scoped and its depth cap actually engages (R3-10); and a host with the dispatcher disabled now refuses graph submissions instead of accepting work nobody will run (R3-11).

  **Smaller:** `deliverContinuation` returned `undefined` after every successful delivery, costing a spurious settle pass per graph (C1, with `noImplicitReturns` now on for the package); the default dispatcher instance id gains real entropy, because host+pid collides under systemd, pm2 and containers — and a shared id defeats every ownership guard at once (C2); the run's rollup and lifecycle writes are column-scoped (C4); and the drain's heartbeat purge no longer races the registration it is purging (C5).

  **Wrap-up fixes (post-round):** the claim protocol's lease now lives entirely on the database clock — `ClaimExpiresAt` is written (`DATEADD` over `SYSUTCDATETIME`) and compared in SQL time, so NTP skew between dispatcher hosts can no longer reclaim a live lease or extend a dead one. And the `TaskGraph.Submit` remote operation stops dropping `reinvokeDepth` (the runaway-loop cap now counts remote continuation hops) and gains the R3-3 `invocation` envelope so `data.*`/`context.*` conditions work for MCP-submitted flows; the operation's metadata contract carries both fields (hence this release's `minor`).

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
  - @memberjunction/ai@6.1.0
  - @memberjunction/actions-base@6.1.0
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
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/actions-base@6.1.0-edge.7
  - @memberjunction/templates-base-types@6.1.0-edge.7

## 6.1.0-edge.6

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
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/actions-base@6.1.0-edge.6
  - @memberjunction/templates-base-types@6.1.0-edge.6

## 6.1.0-edge.5

### Minor Changes

- 22ec804: Clickable record-link tokens in Chat messages (`type: "record"`). Agents emit `@{…}` JSON; the renderer turns it into a pill that opens the row via OpenEntityRecord, including composite primary keys. `name` is optional — omit it for an icon-only pill when surrounding prose already names the record. Loop prompt teaches the grammar and asks for world-class UX: prefer icon-only, one citation per record per section.

### Patch Changes

- 1940a4d: Recover LLM responses broken by a single unescaped character, and stop misreporting why they broke.

  Models embed rich markdown in JSON string fields — mermaid diagrams, HTML mockups, code samples — and reliably escape most of it. One missed quote inside a 25KB response invalidates the whole document. Three defects meant that was unrecoverable and misdiagnosed.

  **`CleanJSON` discarded the response over an interior fence.** Once the top-level parse failed for any reason, fence extraction ran unconditionally. That regex has no idea it is looking inside a string value, so a ` ```mermaid ` fence embedded in a markdown field matched, its contents were extracted, the JSON envelope was thrown away, and `CleanJSON` recursed into the fragment. A 28KB agent response with one unescaped quote at offset 23011 was reported as `Unexpected token 'm', "mermaid\ns"...`. Fence extraction now skips input already shaped like a JSON envelope — a genuinely fence-wrapped response starts with the fence and a prose-buried one starts with prose, so neither is affected. The throw also carries the untouched parse error as `cause`.

  **The repair chain reasoned from the wrong error.** `attemptJSONRepair` received whatever escaped `JSON.parse(CleanJSON(rawOutput))`, which may describe one of `CleanJSON`'s intermediate transforms rather than the model's actual output. That message was handed to the AI repair prompt as `ERROR_MESSAGE`, recorded on the prompt run, and re-thrown — so a model was asked to fix an unexpected `'m'` in a mermaid fragment when the real defect was one quote at a known offset, in text it was never shown. `resolveTrueParseError` now derives the error from the raw output directly.

  **Nothing could repair an unescaped quote.** JSON5's leniency covers trailing commas, comments and unquoted keys, but an unescaped `"` terminates a string in JSON5 exactly as in JSON, leaving only an LLM round-trip on the full payload. New `RepairJSONEscaping()` in `@memberjunction/global` is error-driven and deterministic: read the failure offset, walk back to the character that ended the string early, escape it, re-parse, repeat. Every pass is validated by a real parse, so it cannot pattern-match its way to a wrong answer the way a global regex rewrite would, and it gives up rather than guessing when it cannot make progress. It runs in `attemptJSONRepair` between the JSON5 and AI stages — microseconds against an LLM round-trip, and it cannot invent content. `_jsonRepairInfo` gains a `LexicalEscaping` method and records the offsets escaped, because that repair infers intent and should never be invisible.

  Replayed against 16 real failing production payloads: 16/16 recovered, 180 characters escaped, 12ms total. Each repair verified escapes-only — removing the inserted backslashes reconstructs the original byte-for-byte — with a valid response shape. Against 34 already-valid payloads, 20 containing markdown fences: zero false positives. The production failure that motivated this had burned all ten agent retries, roughly four minutes and 79K completion tokens, before terminating; it now recovers in 0.61ms with the AI stage never reached.

- d7feeae: Stop Explorer from showing "Unknown error" with a stuck Running timer when a Skip/sub-agent transport path fails. Pass the real error through invokeSubAgent, keep In-Progress when the agent may still be running, and persist Failed/Error on the run and conversation detail if executeAIAgent throws.
- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [905820a]
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/actions-base@6.1.0-edge.5
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
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/actions-base@6.1.0-edge.4
  - @memberjunction/templates-base-types@6.1.0-edge.4

## 6.1.0-edge.3

### Minor Changes

- e7f1f88: Two defects a dispatched workflow hit end to end — one that killed the run, one that misreported it.

  **The invocation envelope could not be written down.** R3-3 carried `ExecuteAgentParams.context` into the parent task's `InputPayload` verbatim. That parameter is documented as possibly a class instance holding "external service credentials or connection information", so the first real agent run whose context held a socket died at submit time with `Converting circular structure to JSON --> starting at object with constructor 'Socket'` — before any step executed. Had it serialized instead, those credentials would have been written to a row that outlives the run. `SanitizeInvocationEnvelope` now reduces the envelope to what is safe to persist at the durable boundary, so every submission path is covered: JSON data survives (primitives, arrays, plain objects, `Date`, anything with `toJSON`), while class instances, functions, sockets and cycles are refused **and reported by path** — a value that silently vanished is a condition reading absent-data and taking a branch nobody can explain later.

  **Three agents referenced Font Awesome Pro glyphs** (`fa-chart-diagram`, `fa-shield-check`, `fa-chart-mixed`), which render as nothing in the free 6.5.2 build Explorer loads — an empty icon square rather than a missing-icon indicator, since an absent glyph is silently invisible. Swapped for free equivalents in `metadata/agents`. Betty and Skip keep their `mj-icon-*` classes, which are intentional custom styling.

  **A dispatched workflow reported itself finished while it was still running.** The run-tree query joins the submit step to the graph it produced, so one workflow arrives as two rows whose statuses disagree: the step's describes the _submission_ (`Completed` in ~300ms, correctly), while its title names the _graph_, which is still going. The result was "Task Graph: X — Completed" sitting above steps that had not run, contradicting the page header's own "PAUSED / Workflow still running". The timeline now renders the pair as one row that keeps the step's identity — so selection and deep links still resolve — and takes its status and timing from the graph, with submit latency preserved in the subtitle. A failed or in-flight submission keeps its own row, since there is then no graph to inherit from and the submission is the whole story; an unrecognized shape declines to collapse rather than guessing.

  **Action and agent icons, resolved without a hop.** `get-agent-run-tree.sql` now returns `ActionID` and `AgentID` for the nodes that have them — read by joining back to the task (and, for a loop's passes, to the execution log they expanded from), the same way `LoopMode` already is, so none of the CTE's six members change. That removes the join a consumer would otherwise make and fixes the real defect: the same action rendered as two different generic glyphs depending on which arm of the query produced its row, because a graph step and a loop pass arrive by different paths. A task carries its `ActionID` whether or not it ran, so a **skipped** branch can now show which action it would have run — something the execution log can never say, since no log exists for work that did not happen. A `ForEach` keeps its loop icon rather than the icon of the action it repeats.

### Patch Changes

- 199eb2b: Debug a Flow agent from the Agent form Run dialog. Debug starts the graph paused at Submit (`$.debug.paused` on the parent row — Pause-after-submit races the dispatcher). The harness and Runs console share a VS Code-style icon toolbar and a red-circle breakpoint toggle. The invocation-envelope sanitizer from #3783 is preserved.
- d907a1b: Wire the four unused workflow debug verbs into the Run Console — breakpoints, edge overrides, force-complete, and edit-input — so a held or interesting graph can be stepped without leaving Explorer.
- f5ec13b: Harden `SafeExpressionEvaluator` against a sandbox escape, and correct Skipped-status reporting.

  **`SafeExpressionEvaluator` sandbox escape closed.** The previous defense was a textual denylist,
  which a split-token expression walked straight through:
  `[]["cons"+"tructor"]["cons"+"tructor"]("return process.pid")()` spells none of the banned words yet
  climbs `[].constructor.constructor` to the `Function` constructor and reaches `process` — a
  confirmed arbitrary-code route from any metadata-authored expression (field rules, flow/loop agent
  conditions, task-graph conditions). Validation is now a **structural AST allowlist**: the expression
  is parsed and every node checked before compilation, rejecting computed member access whose key is
  not a literal (the concatenation route), `.constructor`/`__proto__`/`prototype` access, any call
  outside the safe-method and safe-global lists, and host-global identifiers. Because the check is structural it cannot
  be defeated by string assembly, and it also stops the denylist's over-rejection of legitimate data —
  `name == 'constructor'` and a field named `window` are now valid again. `validateSyntax` continues to
  parse-without-executing on top of it.

  **The expression grammar NARROWED, and callers should read this list.** The old denylist enforced
  almost nothing, so the accepted surface was in practice "whatever `new Function` compiles". The
  structural allowlist accepts what the evaluator's contract always documented — comparisons, logical
  ops, dotted/indexed access, the `SAFE_METHODS` list, arrow-function array callbacks, `typeof` — plus
  optional chaining (`payload?.customer?.tier`) and the safe globals below. **Now refused**, where the
  denylist let them through: `in` / `instanceof`, regex literals (`/x/.test(y)`), and string/array
  methods outside `SAFE_METHODS` (`.split()`, `.replace()`, `.slice()`, `.substring()`, `.match()`,
  `.join()`). No metadata shipped in this repo uses any of them; installations authoring their own
  expressions (field rules, flow/loop agent conditions, task-graph conditions) should audit the columns
  that store them before upgrading.

  **Ambient globals stay callable, and the list now has ONE owner.** `SAFE_EXPRESSION_GLOBALS` in
  `@memberjunction/global` — `Math`, `Number`, `String`, `Boolean`, `Array`, `Object`, `JSON`, `Date`,
  `parseInt`, `parseFloat`, `isNaN`, `isFinite` — may be called as namespace methods (`Math.abs(...)`,
  `Object.keys(...)`, `JSON.stringify(...)`, `Array.isArray(...)`, `Date.now()`) or as bare functions
  (`Number(...)`, `parseInt(...)`, `isNaN(...)`). Receiver and method are both fixed identifiers, so
  none of the four invariants that close the escape is weakened. `ai-core-plus`'s task-graph door now
  imports that set instead of keeping its own copy: `1efc248ac5` shipped the decision that the door
  must not refuse `Number(payload.count) > 3` or `Math.abs(output.delta) < 5`, and a second curated
  list is how the two halves came apart. `RESOLVABLE_GLOBALS` is removed from
  `@memberjunction/ai-core-plus`; import `SAFE_EXPRESSION_GLOBALS` from `@memberjunction/global`. The
  pinning test now CALLS every entry — it previously only read each name (`Math !== undefined`), which
  is why a screen that refused `Math.abs(x)` passed it.

  **A policy refusal now HOLDS a task-graph edge instead of rerouting it.** `IsBrokenGuard` recognises
  the evaluator's refusal message, so a stored graph carrying a construct this build no longer accepts
  stalls visibly rather than taking a different path with no recorded cause — the dispatcher logs a
  reason only on `hold`.

  **Skipped test status wired through reporting.** `MJ: Test Suite Runs` now records `SkippedTests`
  and `ErrorTests` (previously left NULL); the CLI single-test and suite-markdown formatters render
  Skipped as SKIP rather than FAIL and keep skips out of the Failures section; and the exported
  summary aggregator counts skips separately and averages over the executed set.

- 7a630ba: Three writes take an object the CALLER built and stringify it straight into a database row — an agent run's `Data` and `StartingPayload`, and a task graph's invocation envelope — and all three take it from `ExecuteAgentParams`, whose own documentation says the value may be a class instance holding "external service credentials or connection information". One of the three was guarded, after it killed agent runs at submit time with `Converting circular structure to JSON`. The other two were not.

  That combination fails two ways, and the second is worse: it **throws** on anything holding a socket, a pool or a provider, and it **leaks** when serialization happens to succeed, writing whatever the object held into a row that outlives the run. The first is loud and gets fixed; the second is silent and does not.

  `SanitizeForPersistence` / `StringifyForPersistence` now carry the rules in one place, and all three writes use them. JSON data survives (primitives, arrays, plain objects, `Date` as ISO, anything with `toJSON`); class instances, functions, sockets and cycles are refused whole rather than unwrapped — walking a socket's own properties would "work" and would persist its internals, which is the leak. Every drop is reported by path and logged, because a value that silently vanished is the failure one layer down: a reader hunting a field the writer discarded, or a condition reading absent-data and taking a branch nobody can explain.

  Also: the flow differential suite gains its first **failure oracle**. It could not express `'edges'` semantics — the dialect where a flow routes around its own failure — because the simulator treated "which origin statuses may decide an exclusive group" as a constant where the dispatcher treats it as the graph's dialect. With that modelled, a fixture whose step fails and whose recovery path runs is now compared walker-against-compiled, and the comment states why `'block'` has no oracle by construction: the walker routes on failure, so there is nothing to compare a compiled `'block'` graph against (IT74's TX19 pins that side instead). And the all-`Optional` node's wave-1 behaviour — the consequence the spec doc calls out as surprising and nothing asserted — is now pinned, so an OR-join implemented later reads as a deliberate semantic change rather than a bug fix.

  **Two behaviour changes worth knowing about, both deliberate.** A class instance is now refused _whole_ and reported by path, where `JSON.stringify` would have persisted its own enumerable properties — so an agent whose payload legitimately is a class instance will find that payload dropped rather than partially recorded, with the path named in the log. Dropping loudly is the intended posture: the alternative persists whatever the object happened to hold. And `toJSON` is no longer consulted for anything but `Date`, because deferring to a method on the object being guarded hands the decision back to the party the module does not trust — a `toJSON() { return {...this} }`, a common convenience, published its own credentials silently and with an empty `DroppedPaths`.

  Also worth knowing: sanitizing **invokes getters**, once per property, so a payload holding lazily-opened resources can open one by being written down. Refusing class instances removes most of that surface, since their getters are never reached.

- 1bd9674: Task-graph engine hardening, Phase 1 — four correctness fixes at the seams between the well-built layers. Every one of them failed silently as success: the run reported Complete while the wrong work happened, or the settlement was lost with no error and no stall.

  **P1 — an exclusive loser could skip a task another route still reaches.** A losing edge decided its target's fate rather than its own, so a fork whose loser pointed at a step the winner also reached (directly, or through a join) skipped that step while it was still due to run — and the graph settled Complete with the work never executed. `ResolveExclusiveGroups` no longer seeds a target a kept edge also points at, and `ConfirmSkipSeeds` answers the surviving-route question the dispatcher already asks for ordinary dropped edges.

  **P2 — an unevaluable guard executed the work it was guarding.** A condition that failed to evaluate returned "keep the edge", and since conditions are only evaluated once the origin is terminal, a kept edge from a `Complete` origin is a satisfied prerequisite. The spec layer, the legacy walker and the exclusive path all said the opposite. Unevaluable is now an undecided HOLD, and `IsGraphStalled` counts held tasks so a graph waiting forever stops reporting healthy.

  **P3 — settlement is recoverable.** The post-settlement sequence ran after the parent's terminal write, and a terminal parent matched no sweep query — so a crash in that window left the submitting agent run `Paused` forever, with no cost rollup and no notification. A third sweep arm finds terminal-but-unsettled graphs (wide once at startup, 24h in steady state), the settle sequence is re-entrant, and `Cancel` now defers to the dispatcher instead of writing the parent terminal itself, which makes cancellation deterministic.

  **P4 — the continuation marker is a real compare-and-swap.** It was read-check-write, so two dispatchers could both deliver one settlement — for `reinvoke`, two billed agent turns. It is now a single guarded UPDATE in `TaskClaimStore`, and the parent's status and start-time writes are column-scoped so a full-row save can no longer erase the marker another instance just claimed.

  **A stopped dispatcher now stops writing.** `Stop()` waited on in-flight tasks but not on the timer passes, which are `void`-ed promises nothing held — so it returned mid-pass and that pass went on to settle graphs, emit lifecycle frames and claim new tasks afterwards. Three quiet consequences: a `GraphSettled` frame arriving after every subscriber had gone, a shutting-down process manufacturing the orphaned claims reconciliation exists to clean up, and statements colliding with the host's reuse of the connection. Passes are now drained (they are bookkeeping for work that already happened, so cancelling one would open the very crash window P3 rescues), and no new work is claimed after the decision to stop.

  **Every dispatcher query is scoped to workflow graphs.** `MJ: Tasks` is general-purpose — conversation tasks and users' own to-dos live there too — and the sweep did not filter by task type, so it rolled up and overwrote the status of anything with children. `Submit` has always stamped the `AI Workflow` type, so the discriminator already existed on every dispatcher-owned row; it is now in all three sweep arms and inside the guarded statements that write a payload column.

  **New: an edge condition that cannot be parsed is refused at authoring time.** `SafeExpressionEvaluator.validateSyntax()` compiles an expression without evaluating it, which is what lets the check be syntax-only: unknown identifiers, absent properties and undefined chains all pass, because whether `payload.x.y` resolves is a question about a run that has not happened yet. `ValidateTaskGraphSpec` applies it to dependency conditions and `While` loop conditions, reporting every failure at once and naming the step and the condition text.

  ⚠️ **Migration note.** A saved workflow or flow whose condition never parsed has been failing at run time all along — silently before P2, as a held branch after it. That failure now surfaces at SAVE time instead, so editing an unrelated step in an old flow can newly report an error on a step you did not touch. The message names the step and quotes the condition so the surprise explains itself. Nothing rejects on load, and unknown identifiers are explicitly NOT an error — only expressions that cannot parse at all.

- 9f6a53b: Task-graph engine hardening, Round 2 — the ring of seams one layer out from Round 1's, found by a four-track adversarial review of the merged engine. Same signature as before: the graph looks fine while a run strands forever, or wrong work executes under a clean verdict.

  **R2-1 — a crashed prompt task was unrecoverable and undiagnosable.** Claim reclamation scoped to `AgentID OR ActionID`, a predicate written before the `PromptID` column existed. A Prompt step (and a ForEach/While with a prompt body) carries neither, so once its owner died it was invisible to both reclamation statements and not even reported by the orphan sweep — graph `In Progress` forever, submitting run `Paused` forever, and the stall detector calling it healthy. Every site now asks one shared predicate that says what the engine means, so the next runner column cannot re-open the hole. This also closes Round 1's B4: the human settle and expiry sweeps used a narrower dialect than reopen, so a human task written before `StepType` existed could be asked and then never settled or expired.

  **R2-2 — the delivery marker was claimed by passes that had not actually settled anything.** The settle sequence's steps each swallow their own failures by design, but the rescue sweep's only re-entry key is the marker, and the marker was claimed unconditionally at the end of the same pass. So a crash between steps was recoverable and a _soft failure_ was permanent. The sharpest case needs no failure at all: a fast graph settles before `finalizeAgentRun` has parked its submitting run, so the lifecycle write silently no-ops and the cost write is overwritten by finalize's own full-row save. The run half is now gated on a read-only readiness check and a settle verdict; nothing claims the marker unless the pass genuinely completed, so the sweep re-enters. Bounded at five minutes, because a submitter that died before parking must not hold a completed workflow's outcome hostage.

  **R2-3 — routine data absence was classified as a broken guard.** A condition dereferencing the null output of a step that produced nothing threw, and every throw became a hold — permanent, since a terminal origin's output can never change. The flow engine's `payload` is the agent's accumulated payload, an object, so `payload.approved` there is simply falsy; the dispatcher's null was the divergence. Object-shaped roots are now null-safe, deeper absent chains read as a false verdict, and an unknown _root_ still holds because that genuinely is a broken guard. Conditions on edges out of a **Skipped** origin are no longer evaluated at all — the edge drops, matching the walker, because against an empty envelope a negated condition comes out true and hands a not-taken branch's target a satisfied prerequisite.

  The validator now refuses unknown roots at submit time, reversing a deliberate Round 1 decision: with data absence reading as false, an unknown root is the only remaining way to earn a permanent hold. It stays silent when an expression binds a name of its own (an arrow parameter), so it may miss a typo but never invents one.

  **R2-4 — `failureSemantics: 'block'` did not gate exclusive-group resolution.** The dispatcher passed the same `['Complete','Failed']` set to every graph. Under `'block'` — the spec's default — a Failed origin resolved its fork, the losers were seeded and cascaded to `Skipped`, `Skipped` satisfied dependents, and the removed loser edges severed the block cascade's forward walk, so a join fed by an independent healthy route executed downstream of an unhandled failure while the parent still rolled up `Failed`. The graph's own dialect is now threaded in.

  ⚠️ **Behaviour change at the authoring door.** A spec whose edge condition references a root the runtime does not provide is now refused at save time rather than holding a branch at run time. The message names the step, the dependency and the condition, and lists the roots that are available.

- 6d7d3da: Task-graph engine hardening, Round 3 — the residual gaps in Round 2's own fixes, found by a three-track adversarial review of the merged engine. The pattern this round is not new seams but **incomplete closures**: six Round 2 fixes worked at their own anchor and left the layer just outside it open.

  **R3-1 — an early finish could discard a step that was already running.** R2-10 moved the sibling skips after `CompleteClaimed` on the premise that "siblings are Pending and unclaimed until the skip lands". They are not: task execution is not awaited, so the deciding instance's own poll tick runs concurrently with its skip loop, and the decision existed only in that instance's memory — no claim filter anywhere could know about it. A sibling claimed mid-loop had `In Progress` reverted to `Skipped` and its claim cleared _while its agent body ran_: side effects fired, completion refused, output discarded, graph settled `Complete` with nothing recording it. The early finish now declares itself durably before mutating anything (so every instance's claim filter sees it) and every skip is a guarded single statement that refuses a task something else has taken.

  **R3-2 — R2-4 gated one dialect and left the other blind.** Under `failureSemantics: 'block'` — the spec default, so every agent-emitted graph — a `Failed` origin's ordinary conditional edge that read false was dropped, its target skipped rather than blocked, and the dropped edge severed the block cascade's forward walk. `Skipped` satisfies prerequisites, so a join fed by an independent healthy route executed downstream of an unhandled failure while the parent still rolled up `Failed`. R2-3 made this _more_ reachable, not less: a failed step rarely has output, so the null-safe envelope answers positive conditions with a confident false→drop where they previously threw→held visibly. `Cancelled` is now decided once and written into the spec: it never decides an ordinary edge under either dialect.

  **R3-3 — the documented `data`/`context` conditions never worked on the dispatcher.** They resolved against the origin _step's_ output rather than the invocation's parameters, so every `data.x` comparison read `undefined`, came out false, and silently took a branch the legacy walker never took — on every invocation, with the validator blessing the condition at the door. An invocation envelope is now threaded from the agent through submit, the parent's metadata, and condition evaluation. Round 1's carried-forward D2 lands as code. `stepResult.step` also now carries a status word rather than the step's name, matching what the flow engine actually exposes — the documented `stepResult.step === 'Success'` was false for every step before this.

  **Also fixed:** a `Stop()` during boot no longer has its timers reinstalled by `Start()`'s own continuation (R3-4); concurrent human-step notifications no longer leave a duplicate, un-answerable inbox item — collapsing them belongs to the sweep over _waiting_ steps rather than to the raise, because a task is notified exactly once and the raise never runs again afterwards, so a duplicate that outlived its own raise was previously unreachable by the only code that could have closed it (R3-5); the data-absence classifier is inverted so it cannot rot per operator — a `ReferenceError` is a broken guard, everything else is absent data (R3-6); the determinism tiebreak is ordinal rather than locale-collated, so two hosts with different `LANG` cannot resolve the same tie differently (R3-7); a transient cost-rollup failure defers delivery instead of claiming the marker and locking a wrong total in forever (R3-8); `Cancel`'s child writes are guarded statements that cannot overwrite an outcome that landed first (R3-9); nested cancel is type-scoped and its depth cap actually engages (R3-10); and a host with the dispatcher disabled now refuses graph submissions instead of accepting work nobody will run (R3-11).

  **Smaller:** `deliverContinuation` returned `undefined` after every successful delivery, costing a spurious settle pass per graph (C1, with `noImplicitReturns` now on for the package); the default dispatcher instance id gains real entropy, because host+pid collides under systemd, pm2 and containers — and a shared id defeats every ownership guard at once (C2); the run's rollup and lifecycle writes are column-scoped (C4); and the drain's heartbeat purge no longer races the registration it is purging (C5).

  **Wrap-up fixes (post-round):** the claim protocol's lease now lives entirely on the database clock — `ClaimExpiresAt` is written (`DATEADD` over `SYSUTCDATETIME`) and compared in SQL time, so NTP skew between dispatcher hosts can no longer reclaim a live lease or extend a dead one. And the `TaskGraph.Submit` remote operation stops dropping `reinvokeDepth` (the runaway-loop cap now counts remote continuation hops) and gains the R3-3 `invocation` envelope so `data.*`/`context.*` conditions work for MCP-submitted flows; the operation's metadata contract carries both fields (hence this release's `minor`).

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
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/actions-base@6.1.0-edge.3
  - @memberjunction/templates-base-types@6.1.0-edge.3

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

- 9a29da4: Retire the Workflows app; make the Flow agent form first-class.

  The Workflows app owned no storage — a workflow's WHAT is a Flow agent and there is no `Workflow` table — so it was a second list of rows the AI app already listed, fronted by a canvas that duplicated the Flow agent editor and had no Save path at all. Removed, and replaced by making the agent record answer what the app was implicitly about.

  **`@memberjunction/ng-core-entity-forms`** — the AI Agents form is now tabbed: the agent type's designer (any type declaring a `UIFormSectionKey`), Details (the existing accordion set, unchanged), and Invocations. The designer pane is hidden with CSS rather than removed from the DOM, so unsaved canvas edits and canvas viewport state survive a tab switch. The default tab is the first that exists, so a Flow agent opens on its diagram.

  **`@memberjunction/ng-agents`** — new `<mj-agent-invocations>`: a read-only index of every automated pathway that invokes an agent (Scheduled Jobs, User Routines, Entity Action bindings, Record Processes, sub-agent steps and relationships, `ExposeAsAction`). Answers "what runs this when I'm not looking?", which no surface could previously answer from the agent's side.

  **`@memberjunction/ai-core-plus`** — `AgentSpec.Status` and `AgentStep.StepType` now derive from their entity fields instead of restating them. Both had drifted: `Status` declared `'Inactive'`, which `AIAgent.Status` has never accepted, so any caller setting it wrote a value the CHECK constraint rejects; `StepType` omitted `ForEach` and `While`, making loops executable but unauthorable. `AgentStep` gains `LoopBodyType` and `Configuration`, and the action mapping fields now admit the object form that callers already pass.

  **`@memberjunction/ai-agent-manager`** — `AgentSpecSync` round-trips loop fields; new pure `ValidateLoopStep` catches a loop that saves cleanly and then iterates zero times; the Architect's status validator accepts `Disabled` rather than the invalid `Inactive`, and `WorkflowAgentWriter` maps Draft/Paused workflows to `Disabled`.

  **`@memberjunction/ai-mcp-server`** — the `List_Agents` status filter no longer offers `Inactive`, which could never match a row.

  **`@memberjunction/ng-dashboards`** — the Workflows dashboard, its module, its resource component and its `ng-task-graph-editor` dependency are removed. `mj-task-graph-editor` itself is unchanged and keeps its read-only consumers.

  The `Workflow.Draft` / `Workflow.Save` / `Workflow.Validate` Remote Operations are deliberately kept — they are the agent- and MCP-facing contract and matter more now that creation is conversational.

  A migration removes the Workflows Application row from existing databases (idempotent; a no-op on a clean install). The Architect prompt template change requires `mj sync push` to take effect.

- ca4feb4: Workflow cost becomes a projection of the run tree, and a graph now runs in the order it was drawn.

  **Cost is the tree, not arithmetic beside it.** `AIAgentRun`'s four `…Rollup` columns are now written from `SumAgentRunTreeCost(LoadAgentRunTree(runID))` at settlement — one basis (per-node own spend), prompt-aware through `Configuration.runtime.promptRunID`, and structurally incapable of disagreeing with what the run viewer shows. The previous per-child loop filtered on `AgentRunID`, so every Prompt step's spend was absent, and mixed a descendant-inclusive number with an own-spend one. The tree now also carries the prompt/completion token split so all four columns share a basis. Writing the sum back makes the column an _output_ of the tree, which is non-circular only because the query reads own cost and never a rollup — stated in the query header and pinned by a test that plants an absurd rollup on a real run. When the tree cannot be summed (load failure, depth cap, graph not reachable), the columns are **cleared** rather than left holding a stale total from an earlier settlement.

  **A loop's passes exist.** The run tree reaches nested work through six relationships and a loop iteration was none of them, so a `While` that spent real money across three passes reported one childless node with no cost. The dispatcher now records one entry per pass (`ITaskStepRuntime.iterations`) and the tree expands them into nodes. On a real workflow this moved `TotalCostRollup` from `0.00049725` to `0.00555375` — the loop had been spent and not counted.

  **A graph is dispatched only once its edges exist.** Children and dependencies are now written in one transaction. Previously a poll could land between the two writes, see tasks with no prerequisites, and claim the whole graph at once — observed running a closing branch before the draft it was meant to judge existed, then reporting Complete.

  **Steps see their payload.** A step with no input mapping fell back to the raw input instead of the merged payload, so a Prompt step — which declares no mapping by design — rendered `{{ _CURRENT_PAYLOAD }}` as `{}` and wrote from an empty brief. Separately, a step with no output mapping _replaced_ the payload with its own output rather than merging; for a loop, whose output is a summary, that discarded everything the iterations had established and made a downstream `payload.x === true` edge unreachable.

  **An output mapping that names a parameter the step never returns now says so** (`unmapped`), naming what the step did return, instead of skipping in silence.

  **Human steps**: a cancelled request re-raises instead of stalling forever; cancelling a graph withdraws its open requests instead of leaving them in someone's inbox; cross-user `assignToUserID` is refused at submission rather than silently reassigned to the submitter; and a step can declare `expiresInHours`, which finally makes the existing expiry machinery reachable.

  **Web Search** captured each result with a non-greedy match that stopped at the first nested `</div>`, cutting the snippet out of every result — ten well-formed hits carrying no content. Results are now sliced between block starts, and an all-snippets-empty parse is reported rather than returned silently.

  **Testing**: a bundle whose every check is gated out now records an explicit skip naming the flag that would run it, instead of reporting PASS with zero checks executed.

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

- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [59def38]
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
  - @memberjunction/actions-base@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/templates-base-types@6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

- 394d276: Phase 5 of the unified workflow DAG engine program (plan: PR #3456) — a generic graph component whose subject is `TaskGraphSpec`.

  **New package `@memberjunction/ng-task-graph-editor`.** It views and edits **`TaskGraphSpec`** — the one fully-qualified graph contract every producer in the program already authors against (D16) — rather than any particular persistence. A design-time flow, a graph an agent emitted at runtime, a stored workflow definition and a graph someone is drawing from scratch are all the same type here, so one component serves the Flow Agent editor, the Agent Run admin view, conversation plan cards, the Tasks view, and anything downstream.

  **Why a new package rather than extending `ng-flow-editor`.** That package's _generic_ half — `FlowEditorComponent`, `FlowNode`/`FlowConnection`, the Dagre layout and Foblex canvas — is genuinely reusable and is **depended on, not forked**. Its _domain_ half is bound to `AIAgentStep`/`AIAgentStepPath`. Phase 4 established that a runtime task graph and a design-time flow are the same model; an editor that can only speak the agent-entity dialect cannot serve the other provenance, and teaching one component two dialects is exactly how the two drifted apart before the traversal-engine extraction fixed it.

  **Layer discipline (`widgets`).** `"mjUILayer": "widgets"` declared from the first commit. No `@angular/router`, no `@memberjunction/ng-shared`, no `NavigationService`, no global-provider construction. Route-derived state arrives as `@Input()`; navigation _intent_ leaves as an `@Output()` the host acts on, because a widget cannot know whether it sits inside Explorer, a downstream app, or an embedded panel.

  **The event contract is the reusable surface.** Vetoable actions ship as `Before*`/`After*` pairs whose args are **classes** extending `CancellableTaskGraphEventArgs` — `Cancel` has to travel _back_, which a frozen payload cannot do. A canceled `Before*` does not emit its `After*` and does not mutate the spec; that is a contract hosts rely on, and it is pinned by tests, because a refactor that moves the emit above the `Cancel` check yields a component that looks correct and ignores every veto. Informational events (`SpecChanged`, `SelectionChanged`, `ValidationChanged`) are single emitters — no veto is invented for something that cannot be vetoed. Public imperative methods exist for the one case the event contract cannot serve: a host that must `await` a confirmation before acting, since a `Before*` handler cannot await.

  **Validation is the engine's.** Cycles, unknown dependency refs and assignment conflicts come from `ValidateTaskGraphSpec` in `@memberjunction/ai-core-plus` — the same function `LoopAgentType` and `TaskGraphService.Submit` call. A second implementation here would be a second definition of "valid", and a graph that passed on the canvas would be free to fail at submission.

  **A cycle is refused, not merely reported.** A cyclic graph can never execute — nothing ever becomes eligible — so letting the canvas draw one would let someone build a workflow the engine must then reject. The `Before*` event carries `WouldCreateCycle` so the host can _explain_ the refusal rather than let a stroke silently fail to appear.

  **Runtime overlay.** Supplying `RuntimeStatus` turns the same canvas into a live view of the same graph — the convergence point the program was aiming at: one renderer for design time and run time, rather than an editor and a separate Gantt that can disagree. `Blocked` deliberately renders as a _warning_, not an error: nothing went wrong, the graph simply cannot reach it, and showing a failure would send someone hunting for a bug that does not exist.

  **`ConvertAgentSpecToTaskGraph`** (in `ai-core-plus`) completes the round-trip Phase 4 started. Without the inverse, a graph could be _saved_ as a workflow but never _reopened_ on the same canvas, and MJ would need a second flow-shaped renderer — back to two graph UIs that can disagree. Conditions survive the round-trip because both models store the same grammar, which is why `TaskDependency.Condition` was given `AIAgentStepPath.Condition`'s shape in Phase 4.

  **Coverage:** 73 new unit tests in the package (39 adapter, 34 component) plus 7 round-trip tests in `ai-core-plus`. The adapter is deliberately pure and separate from the component so its tests are about graphs rather than about Angular.

- 394d276: Phase 1 of the unified workflow DAG engine program (plan: PR #3456) — makes the task substrate tell the truth about what actually happened.

  **Payloads become columns.** `Task` gains `InputPayload`, `OutputPayload`, `ErrorMessage`, and `AgentRunID`. Inputs and outputs previously rode inside `Task.Description` behind `__TASK_METADATA__` / `__TASK_OUTPUT__` markers, which leaked orchestration plumbing into search results and the task detail panel. A one-time migration backfill converts existing marker rows into the new columns and strips the markers; there is deliberately **no fallback parse** in code, because a fallback with no backfill never dies. The backfill is conservative — a row whose marker text doesn't parse as JSON is left byte-for-byte intact for inspection rather than silently discarded.

  **Failures propagate instead of stalling.** A `Failed` dependency used to leave its dependents `Pending` forever: they never became eligible, so the graph appeared to finish while work silently never ran — and the parent was marked `Complete` at 100% regardless. Now failure propagates transitively to `Blocked`, and the parent rolls its children up honestly (`Failed` > `Blocked` > `Cancelled` > `Complete`, with progress counting only completed children). Completion notifications fire only for genuinely successful graphs.

  **Bad graphs are rejected before they are persisted.** Dependency cycles are detected at creation (a cyclic graph could previously be saved and then deadlock silently), and a graph naming an unknown agent is now an error rather than being logged-and-skipped — which used to execute the graph with holes where the caller's tasks should have been.

  **Waves run in parallel.** Eligible tasks execute with bounded concurrency (5) rather than one at a time, and each pass loads the graph once instead of issuing a dependency query per candidate task. Stalled graphs — pending work, nothing runnable, nothing in flight — are now detected and logged rather than exiting quietly.

  **The Gantt links the right run.** `Task.AgentRunID` records the specific run that executed each task. The UI previously joined tasks to runs through the shared `ConversationDetailID`, so every sibling task in a graph resolved to the _same_ agent run; the link was wrong for all but one. `Blocked` and `Failed` also now render distinctly instead of inheriting the pending treatment.

  **New pure graph algorithms** in `@memberjunction/ai-core-plus` (`computeEligibleTasks`, `computeTasksToBlock`, `computeParentRollup`, `detectCycle`, `isGraphStalled`, `findUnknownDependencyRefs`) — dependency-free, operating on plain shapes rather than entities, with 44 unit tests. Phase 2's durable dispatcher consumes these unchanged rather than reimplementing eligibility and propagation.

  **Also:** dispatcher claim columns (`ClaimedBy`, `ClaimExpiresAt`) and their supporting indexes land now so Phase 2 adds the dispatcher without further schema churn — nothing reads them yet. `AIAgentRunStep.StepType` gains `TaskGraph`. New deterministic integration bundle `task-graph-orchestration` (TG1–TG4) covering cycle rejection, unknown-agent rejection, payload columns, and the new schema's presence in generated metadata.

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
  - @memberjunction/actions-base@6.1.0-edge.1
  - @memberjunction/templates-base-types@6.1.0-edge.1
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
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/actions-base@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/templates-base-types@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/actions-base@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/templates-base-types@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/actions-base@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/templates-base-types@5.51.0
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
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/actions-base@5.50.0
  - @memberjunction/templates-base-types@5.50.0
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
  - @memberjunction/core@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/actions-base@5.49.0
  - @memberjunction/templates-base-types@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [c20723a]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/actions-base@5.48.0
  - @memberjunction/templates-base-types@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/actions-base@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/templates-base-types@5.47.0
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
  - @memberjunction/actions-base@5.46.0
  - @memberjunction/templates-base-types@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- 572d219: Render agent final-response streaming in the conversation chat. Adds an optional `kind` discriminator to agent streaming chunks — `'final-response'` marks deltas of the user-facing reply — passed through the server's PubSub payload; the conversation client now routes those chunks, accumulates deltas service-side, renders the growing text in the message bubble, and reconciles with the saved final message on completion. Unmarked streams (e.g. Loop-agent JSON turn envelopes) keep today's behavior exactly (dropped), so agents that don't opt in are unaffected.
  - @memberjunction/ai@5.45.1
  - @memberjunction/actions-base@5.45.1
  - @memberjunction/core@5.45.1
  - @memberjunction/core-entities@5.45.1
  - @memberjunction/global@5.45.1
  - @memberjunction/templates-base-types@5.45.1

## 5.45.0

### Minor Changes

- 6125dcd: Skill activation governance & observability (v5.45): double activation gate (AISkill.ActivationMode × AIAgent.SkillActivationMode, both defaulting to RequestedOnly — self-activation requires Auto×Auto; /skill user requests unaffected) via new GetAutoActivatableSkillsForAgent; AIAgent.RequirePlanMode forces plan mode on every root run; AIAgentRun.PlanMode stamps plan-mode runs; plan-mode runs block skill activations after approval (re-plan required); AIAgentRunStep.Skills JSON records per-step AgentSkillInvocation provenance (activation type, gate values, agent-stated reason) on Skill/Prompt/Actions/Sub-Agent steps with native-grant precedence; agent-run UX gains a Plan Mode header chip, Skill/Plan step icons, per-step skill chips, and a Skills drill-in tab with provenance cards.
- ad9f4a3: Surface dropped skill-activation requests instead of silently ignoring them: new 'skill-activation-refused' message type; BaseAgent injects an explanatory system note + logs a warning when requested skills fail the activation guard; conversations UI shows a warning toast at send time when the mentioned agent can't activate the requested skills.

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
  - @memberjunction/actions-base@5.45.0
  - @memberjunction/templates-base-types@5.45.0
  - @memberjunction/ai@5.45.0

## 5.44.0

### Minor Changes

- 3633fbb: Agent Skills, Plan Mode, and realtime widget UX.

  **Agent Skills** — portable `SKILL.md` import/export, a first-class Skill step wired into the Loop agent runtime, Skills engine caching + agent-gating resolution, the `AI Skills` resource type with "Can Share Skills" authorization, and the AI Skill sharing panel in the entity forms. Includes the skill-markdown converter/operations and the generated entity + resolver surface for the new Skill entities.

  **Plan Mode** — a human-in-the-loop plan-approval gate for the Loop agent (server + client), threaded through the agent client session/types, the GraphQL AI client, and the conversations composer/message-input UI so a run can pause for plan review before executing.

  **Realtime voice widget UX** — fixes and consolidation in `@memberjunction/ng-conversations`:
  - Fixed `NG0100 ExpressionChangedAfterItHasBeenCheckedError` when opening the Details panel (defer the `ResizeObserver` seed + callback to a microtask).
  - The surface/Details panel is now an independent right-hand peek gated on available width (not console chrome / text-reveal), so opening Details keeps the glowing orb and toggling captions off no longer removes the panel; the orb also returns immediately on captions-off.
  - Type-to-compose: any printable keystroke opens the composer and seeds itself as the first character (removed the dedicated "T" hotkey + hint).
  - Control consolidation: the banner is now state + window-chrome only (removed duplicate Captions/End controls, folded "pure audio" into the gear's Density = Simple); Captions is promoted to a first-class control in the compact lean dock.

  **Remote Browser** — `RemoteBrowserSnapshot` now honors its documented best-effort contract: it returns an empty snapshot instead of throwing when the underlying browser adapter has been torn down, so the client's periodic live-view poll never surfaces a recurring GraphQL error (with unit coverage).

- 1367fbb: AI Skill permissions (full agent parity) + `/skill` composer invocation. Skills now use the same dedicated-table, **open-by-default** permission model as AI Agents via `MJ: AI Skill Permissions`: a cached runtime helper (`AISkillPermissionHelper`, open-by-default) and a unified-engine provider (`AISkillPermissionProvider`, closed-by-default / Sharing Center), grantee-exclusivity enforced by `MJAISkillPermissionEntityServer`, and a `GetSkillsForAgent(agent, user?)` filter so the model's skill catalog is intersected with the acting user's Run permission. The old `AI Skills` Resource-Type sharing is retired in favor of a skill-scoped permissions grid (`SkillPermissionsPanel`/`Dialog`/`Service`), with the `Can Share Skills` authorization repointed to it. End users invoke a skill for a message by typing `/skill-name` in the conversation composer (mirrors `@agent`/`#entity`; picker filtered by permission, chips use `AISkill.IconClass`/`Color`); selected IDs thread through the client → resolver → runtime chain as `ExecuteAgentParams.requestedSkillIDs` (both the `RunAIAgent` and `RunAIAgentFromConversationDetail` mutations), and `BaseAgent.preActivateRequestedSkills` activates them at run start only if they survive the guard (agent-accepted ∩ user-permitted). Requires the companion Agent Skills migration + CodeGen.

### Patch Changes

- 5396d90: Add permission-constrained engine loading to BaseEngine — pre-checks entity read permissions during Config() and skips all entity configs (all-or-nothing) when the user lacks access, preventing endless retry loops and console error flooding for org-scoped SaaS users. Engine getters now use GetConfigData() which throws a typed PermissionConstrainedError instead of silently returning empty arrays. Also fixes unsafe GetHighestPowerModel/GetHighestPowerLLM return types and resolves FK_AIAgentRunStep_ParentID race in fire-and-forget step saves.
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
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ai@5.44.0
  - @memberjunction/actions-base@5.44.0
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
  - @memberjunction/ai@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/actions-base@5.43.0
  - @memberjunction/templates-base-types@5.43.0

## 5.42.0

### Minor Changes

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

- Updated dependencies [9b9b484]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/core@5.42.0
  - @memberjunction/actions-base@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/templates-base-types@5.42.0
  - @memberjunction/ai@5.42.0

## 5.41.0

### Minor Changes

- a5f5472: Remote Browser channel + new realtime voice providers + computer-use enrichment.
  - **Remote Browser channel** (`@memberjunction/remote-browser-*`): an in-house realtime channel where an agent drives a live, CDP-connected browser while it talks (sales demos, support walkthroughs, trainer agents). New `AIRemoteBrowserProvider` registry (migration V202606161000) with JSONType capability gating; a universal `remote-browser-base` (driver family + `RemoteBrowserEngineBase`), a shared `remote-browser-cdp` kit (one lossless action mapper + `CdpRemoteBrowserSession`), a `remote-browser-server` engine + `RemoteBrowserChannel` (control arbiter, control modes AgentOnly/ViewOnly/Collaborative vs strategies ComputerUse/NativeAI), and five thin backends (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).
  - **computer-use** enriched additively into a complete browser-I/O + perception engine: CSS-selector-aware actions, CDP screencast, MouseMove, accessibility-snapshot/QueryElement/GetVisibleText/GetTitle/WaitForLoadState — every consumer benefits, existing vision/coordinate path unchanged.
  - **New realtime model providers**: xAI Grok Voice (`@memberjunction/ai-xai`, OpenAI-Realtime-compatible) and Inworld (`@memberjunction/ai-inworld`), with vendor/model seeds.
  - **Console logging improvements** across `@memberjunction/ai-core-plus`, `ai-engine-base`, `ai-prompts`, `aiengine`, `cli`, `generic-database-provider`, `metadata-sync`, and the bootstrap/forms packages.

- 4b3fb9d: Add Skip entity-form support: #entity mentions in conversations, interactive-form host wiring, and reusable form-field components

### Patch Changes

- cc604aa: Agent in-flight memory writes: agents can commit durable cross-run memories mid-run via the memoryWrites loop-response field, gated by AIAgent.AllowMemoryWrite (ON by default — opt out per agent). Writes land as immediately-injectable Provisional agent notes (new Status value, with AuthorType provenance) under framework-enforced guards (descriptive types only, scope clamp, exact-restatement dedupe with same-run supersede, per-run cap, TTL), inject with recency-wins precedence and per-note recorded dates, and are hardened or pruned by a new Memory Manager pass each cycle. Cross-run dedupe requires exact normalized restatement so corrections are never silently absorbed into a stale note; the loop-agent prompt instructs agents not to claim a memory was saved before its result message arrives.
- 15b743b: Real-Time AI Agents — Sessions, Channels & the Realtime Model (plans/ai-agent-sessions.md). Adds the AIAgentSession/AIAgentChannel/AIAgentSessionChannel schema (+ AgentSessionID on AIAgentRun/ConversationDetail, CloseReason on AIAgentSession); the BaseRealtimeModel server primitive with OpenAIRealtime + GeminiRealtime drivers (server-bridged StartSession and client-direct ephemeral-token CreateClientSession, optional SendContextNote/RequestSpokenUpdate interim updates); the new @memberjunction/ai-realtime-client package with the BaseRealtimeClient browser abstraction + OpenAI/Gemini client drivers resolved via ClassFactory by provider key; the Realtime agent type + Voice Co-Agent with RealtimeSessionRunner/RealtimeToolBroker, AgentMemoryContextBuilder extraction, server session lifecycle (SessionManager, SessionJanitor, start/close/heartbeat + client-direct resolvers with delegated-run progress streaming, AwaitingFeedback resume, co-agent observability runs, user-selectable realtime model); the full-panel realtime voice call UX in ng-conversations (phone trigger + agent/model picker, banner/thread/activity rail, delegation working/result cards with provenance, ephemeral paced first-person progress narration driven by DB prompt templates, in-call text composer); Realtime Voice admin (AI Analytics dashboard sections, session/channel custom forms, agent Runs|Sessions execution history); and Query Builder/Strategist reliability fixes (entity catalog in prompt, Get Entity Details sample caps + semantic fallback, plan formatting). Also: the standalone @memberjunction/ng-whiteboard package (collaborative board with agent tool API, sandboxed interactive widgets + input bridge, markdown panels, exports, cancelable before/after events); ElevenLabs Agents + AssemblyAI Voice Agent realtime provider pairs (4-provider matrix, zero contract changes); session review mode with multi-leg resume carryover (timeline dividers, artifact junction closure, prior-transcript model hydration); delegation cancel channel; usage telemetry relay; Realtime Co-Agent rename with run-step/prompt-run observability.
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
  - @memberjunction/actions-base@5.41.0
  - @memberjunction/templates-base-types@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai@5.40.2
- @memberjunction/actions-base@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2
- @memberjunction/templates-base-types@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/actions-base@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/templates-base-types@5.40.1
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
  - @memberjunction/actions-base@5.40.0
  - @memberjunction/templates-base-types@5.40.0
  - @memberjunction/ai@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Minor Changes

- d1cc0ad: agents can run a multi-step, server-side dataflow over their Actions and artifact tools in a single turn, with only the final result entering the context window. Stages pass structured JSON (PowerShell-style) and bind to fields via a safe, eval-free path grammar; operators include where/select/sort/groupBy/distinct/first/last/count/jsonpath/lines/grep/head/tail, plus map and let. Requested via nextStep.type: 'Pipeline'.

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0
  - @memberjunction/actions-base@5.39.0
  - @memberjunction/templates-base-types@5.39.0

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
  - @memberjunction/actions-base@5.38.0
  - @memberjunction/templates-base-types@5.38.0
  - @memberjunction/ai@5.38.0

## 5.37.0

### Patch Changes

- 22b775f: Add `client:capture-data-snapshot` actionable command so agents can request the user's live view of an artifact (including client-side filter/sort/selection state) before answering. Wires the command through SkipProxyAgent and adds a chat-UI handler that captures the snapshot, attaches it as a Data Snapshot artifact, and auto-sends the followup question.
- Updated dependencies [4f15f31]
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/actions-base@5.37.0
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
  - @memberjunction/actions-base@5.36.0
  - @memberjunction/templates-base-types@5.36.0
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
  - @memberjunction/global@5.35.0
  - @memberjunction/actions-base@5.35.0
  - @memberjunction/templates-base-types@5.35.0
  - @memberjunction/ai@5.35.0

## 5.34.1

### Patch Changes

- 5abf790: fix(ai-agents): preserve context class identity through action and data preload pipelines

  `ExecuteSingleAction` was spreading `params.context` into a plain object to stamp `AgentID`, which destroyed class instances (getters, methods, prototype chain). This broke downstream consumers like Skip's `SkipAgentContext` whose `skipAPIRequest` getter became `undefined` after spreading. Similarly, `preloadAgentData` was spreading `params.context` when merging preloaded data.

  Fixed by mutating properties directly onto the original context object instead of spreading. Also changed `InjectContextMemory` to use `agent.RerankerConfiguration` property instead of `agent.Get('RerankerConfiguration')`. Added JSDoc to `ExecuteAgentParams.context` documenting that `TContext` may be a class instance and must never be spread. Added 20 unit tests covering context identity preservation.

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/actions-base@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/templates-base-types@5.34.1
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
  - @memberjunction/actions-base@5.34.0
  - @memberjunction/templates-base-types@5.34.0
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
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/actions-base@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/templates-base-types@5.33.0
  - @memberjunction/ai@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/actions-base@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/templates-base-types@5.32.0
  - @memberjunction/ai@5.32.0
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
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/ai@5.31.0
  - @memberjunction/actions-base@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0
  - @memberjunction/templates-base-types@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai@5.30.1
- @memberjunction/actions-base@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1
- @memberjunction/templates-base-types@5.30.1

## 5.30.0

### Minor Changes

- 4729398: Runtime Actions — Phase 1 complete. Introduces `Action.Type='Runtime'`, a new action type where agents dynamically generate, test, and persist JavaScript actions that execute in MJ's isolated-vm sandbox with a permissioned bridge to metadata, views, queries, entity CRUD, other actions, agents, and AI prompts. Ships the v5.29.x migration (new `RuntimeActionConfiguration`, universal `MaxExecutionTimeMS`, and `CreatedByAgentID` columns on `Action`), the JSONType-authored config interface, the Zod validator with drift detection, the bidirectional IPC bridge in WorkerPool, the full `utilities.*` handler surface, the ActionSmith meta-agent with `Create Runtime Action` / `Test Runtime Action` helpers, Agent Manager wiring, the generic `Execute Agent` action, and Runtime-aware approval UI enhancements. Minor bumps across all touched packages because the schema migration + metadata records are coupled surface changes.

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/actions-base@5.30.0
  - @memberjunction/templates-base-types@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/actions-base@5.29.0
  - @memberjunction/templates-base-types@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/actions-base@5.28.0
  - @memberjunction/templates-base-types@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/actions-base@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/templates-base-types@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ai@5.27.0
- @memberjunction/actions-base@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0
- @memberjunction/templates-base-types@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/actions-base@5.26.0
  - @memberjunction/templates-base-types@5.26.0
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
  - @memberjunction/actions-base@5.25.0
  - @memberjunction/templates-base-types@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Minor Changes

- c318a0c: metadata + migrations in this PR == minor

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/actions-base@5.24.0
  - @memberjunction/templates-base-types@5.24.0
  - @memberjunction/ai@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- 1d1e02e: Knowledge Hub Phase 2: autotagging pipeline, duplicate detection dashboards, and client tool invocation system.

  Autotagging: Run Pipeline button with real-time progress, direct vectorization of content items (bypasses entity documents), pipeline stage visualization, Gemini 3 Flash tagging.

  Duplicate Detection: Run Detection button with entity document picker, progress via PubSub, Kanban approve/reject with persistence.

  Client Tools: New 'ClientTools' step type in BaseAgent enabling browser-side tool invocation (navigation, UI display, tab switching) during agent execution. Includes ClientToolRequestManager server singleton, GraphQL subscription transport, runtime tool decoration, three-level timeout, loop agent integration, and 646-line documentation guide.

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/actions-base@5.23.0
  - @memberjunction/templates-base-types@5.23.0
  - @memberjunction/ai@5.23.0

## 5.22.0

### Patch Changes

- 0b23772: Ensure agents use an isolated per-request database provider instead of the shared global singleton.
- cf91278: Fix NVARCHAR(MAX) mangling in SQL parser, resolve Invalid string length error in AI monitoring dashboard, add unit tests for AI agent components, and add replaceElements guidance for loop agent prompts
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/actions-base@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/templates-base-types@5.22.0
  - @memberjunction/ai@5.22.0

## 5.21.0

### Patch Changes

- 76cd2bc: no migration/metadata changes
- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/actions-base@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/templates-base-types@5.21.0
  - @memberjunction/ai@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/actions-base@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/templates-base-types@5.20.0
  - @memberjunction/ai@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai@5.19.0
- @memberjunction/actions-base@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/templates-base-types@5.19.0

## 5.18.0

### Minor Changes

- 322dac6: metadata update

### Patch Changes

- @memberjunction/ai@5.18.0
- @memberjunction/actions-base@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/core-entities@5.18.0
- @memberjunction/global@5.18.0
- @memberjunction/templates-base-types@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/actions-base@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/templates-base-types@5.17.0
  - @memberjunction/ai@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/actions-base@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/templates-base-types@5.16.0
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
  - @memberjunction/actions-base@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/templates-base-types@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/actions-base@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/templates-base-types@5.14.0
  - @memberjunction/ai@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/actions-base@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/templates-base-types@5.13.0
  - @memberjunction/ai@5.13.0

## 5.12.0

### Patch Changes

- Updated dependencies [05f19ff]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/actions-base@5.12.0
  - @memberjunction/templates-base-types@5.12.0
  - @memberjunction/ai@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/actions-base@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/templates-base-types@5.11.0
  - @memberjunction/ai@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai@5.10.1
- @memberjunction/actions-base@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1
- @memberjunction/templates-base-types@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/actions-base@5.10.0
  - @memberjunction/templates-base-types@5.10.0
  - @memberjunction/ai@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/actions-base@5.9.0
  - @memberjunction/templates-base-types@5.9.0
  - @memberjunction/ai@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/actions-base@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/templates-base-types@5.8.0
  - @memberjunction/ai@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ai@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/actions-base@5.7.0
  - @memberjunction/templates-base-types@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/actions-base@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/templates-base-types@5.6.0
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
  - @memberjunction/ai@5.5.0
  - @memberjunction/actions-base@5.5.0
  - @memberjunction/templates-base-types@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ai@5.4.1
- @memberjunction/actions-base@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1
- @memberjunction/templates-base-types@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/actions-base@5.4.0
  - @memberjunction/templates-base-types@5.4.0
  - @memberjunction/ai@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai@5.3.1
- @memberjunction/actions-base@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1
- @memberjunction/templates-base-types@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/actions-base@5.3.0
  - @memberjunction/templates-base-types@5.3.0
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
  - @memberjunction/actions-base@5.2.0
  - @memberjunction/templates-base-types@5.2.0
  - @memberjunction/ai@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai@5.1.0
  - @memberjunction/actions-base@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/templates-base-types@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ai@5.0.0
  - @memberjunction/actions-base@5.0.0
  - @memberjunction/global@5.0.0
  - @memberjunction/templates-base-types@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/actions-base@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/templates-base-types@4.4.0
  - @memberjunction/ai@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai@4.3.1
- @memberjunction/actions-base@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1
- @memberjunction/templates-base-types@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/actions-base@4.3.0
  - @memberjunction/templates-base-types@4.3.0
  - @memberjunction/ai@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai@4.2.0
- @memberjunction/actions-base@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0
- @memberjunction/templates-base-types@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/actions-base@4.1.0
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

- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ai@4.0.0
  - @memberjunction/actions-base@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0
  - @memberjunction/templates-base-types@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/actions-base@3.4.0
  - @memberjunction/templates-base-types@3.4.0
  - @memberjunction/ai@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/actions-base@3.3.0
  - @memberjunction/templates-base-types@3.3.0
  - @memberjunction/ai@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/actions-base@3.2.0
  - @memberjunction/templates-base-types@3.2.0
  - @memberjunction/ai@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ai@3.1.1
- @memberjunction/actions-base@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/global@3.1.1
- @memberjunction/templates-base-types@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai@3.0.0
- @memberjunction/actions-base@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/global@3.0.0
- @memberjunction/templates-base-types@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/actions-base@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/templates-base-types@2.133.0
  - @memberjunction/ai@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/actions-base@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/templates-base-types@2.132.0
  - @memberjunction/ai@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/actions-base@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/templates-base-types@2.131.0
  - @memberjunction/ai@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/ai@2.130.1
- @memberjunction/actions-base@2.130.1
- @memberjunction/core@2.130.1
- @memberjunction/core-entities@2.130.1
- @memberjunction/global@2.130.1
- @memberjunction/templates-base-types@2.130.1

## 2.130.0

### Minor Changes

- 83ae347: migrations

### Patch Changes

- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/ai@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/actions-base@2.130.0
  - @memberjunction/templates-base-types@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Minor Changes

- 6ce6e67: migration
- c7e38aa: migration

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
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/actions-base@2.129.0
  - @memberjunction/templates-base-types@2.129.0
  - @memberjunction/ai@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/actions-base@2.128.0
  - @memberjunction/ai@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- 0e56e97: no migration for this set of commits
- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/actions-base@2.127.0
  - @memberjunction/ai@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/ai@2.126.1
- @memberjunction/actions-base@2.126.1
- @memberjunction/core@2.126.1
- @memberjunction/core-entities@2.126.1
- @memberjunction/global@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [703221e]
  - @memberjunction/core@2.126.0
  - @memberjunction/actions-base@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/ai@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/actions-base@2.125.0
  - @memberjunction/ai@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Minor Changes

- cabe329: migration due to tweak in loop agent system prompt (migration needs to be created)

### Patch Changes

- Updated dependencies [75058a9]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/actions-base@2.124.0
  - @memberjunction/ai@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai@2.123.1
- @memberjunction/actions-base@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1

## 2.123.0

### Minor Changes

- 0944f59: migrations

### Patch Changes

- @memberjunction/ai@2.123.0
- @memberjunction/actions-base@2.123.0
- @memberjunction/core@2.123.0
- @memberjunction/core-entities@2.123.0
- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- Updated dependencies [81f0c44]
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/actions-base@2.122.2
  - @memberjunction/ai@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/ai@2.122.1
- @memberjunction/actions-base@2.122.1
- @memberjunction/core@2.122.1
- @memberjunction/core-entities@2.122.1
- @memberjunction/global@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/actions-base@2.122.0
  - @memberjunction/ai@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/ai@2.121.0
  - @memberjunction/actions-base@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/actions-base@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/ai@2.120.0
  - @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- 0a133df: Agent Conversation UI Improvement
- Updated dependencies [7dd7cca]
  - @memberjunction/core@2.119.0
  - @memberjunction/actions-base@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/ai@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Minor Changes

- 096ece6: migration

### Patch Changes

- Updated dependencies [264c57a]
- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/actions-base@2.118.0
  - @memberjunction/ai@2.118.0
  - @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [8c092ec]
  - @memberjunction/core@2.117.0
  - @memberjunction/actions-base@2.117.0
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
  - @memberjunction/core-entities@2.116.0
  - @memberjunction/ai@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/ai@2.115.0
- @memberjunction/actions-base@2.115.0
- @memberjunction/core@2.115.0
- @memberjunction/core-entities@2.115.0
- @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/ai@2.114.0
- @memberjunction/actions-base@2.114.0
- @memberjunction/core@2.114.0
- @memberjunction/core-entities@2.114.0
- @memberjunction/global@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/actions-base@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/ai@2.113.2
  - @memberjunction/global@2.113.2

## 2.112.0

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

- Updated dependencies [c126b59]
  - @memberjunction/global@2.112.0
  - @memberjunction/ai@2.112.0
  - @memberjunction/actions-base@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ai@2.110.1
- @memberjunction/actions-base@2.110.1
- @memberjunction/core@2.110.1
- @memberjunction/core-entities@2.110.1
- @memberjunction/global@2.110.1

## 2.110.0

### Minor Changes

- c8b9aca: Migration

### Patch Changes

- Updated dependencies [02d72ff]
- Updated dependencies [d2d7ab9]
- Updated dependencies [c8b9aca]
  - @memberjunction/core-entities@2.110.0
  - @memberjunction/actions-base@2.110.0
  - @memberjunction/ai@2.110.0
  - @memberjunction/core@2.110.0
  - @memberjunction/global@2.110.0

## 2.109.0

### Minor Changes

- a38989b: Migration

### Patch Changes

- Updated dependencies [6e45c17]
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/actions-base@2.109.0
  - @memberjunction/ai@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0

## 2.108.0

### Minor Changes

- d205a6c: migration
- 656d86c: Migration

### Patch Changes

- Updated dependencies [656d86c]
  - @memberjunction/ai@2.108.0
  - @memberjunction/actions-base@2.108.0
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/ai@2.107.0
- @memberjunction/actions-base@2.107.0
- @memberjunction/core@2.107.0
- @memberjunction/core-entities@2.107.0
- @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ai@2.106.0
- @memberjunction/actions-base@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/core-entities@2.106.0
- @memberjunction/global@2.106.0

## 2.105.0

### Minor Changes

- 4807f35: migration

### Patch Changes

- Updated dependencies [4807f35]
- Updated dependencies [9b67e0c]
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/ai@2.105.0
  - @memberjunction/actions-base@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

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
- Updated dependencies [9ad6353]
  - @memberjunction/global@2.104.0
  - @memberjunction/core-entities@2.104.0
  - @memberjunction/ai@2.104.0
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
  - @memberjunction/core-entities@2.103.0
  - @memberjunction/actions-base@2.103.0
  - @memberjunction/global@2.103.0
  - @memberjunction/ai@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/core-entities@2.100.3
- @memberjunction/actions-base@2.100.3
- @memberjunction/ai@2.100.3
- @memberjunction/core@2.100.3
- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/ai@2.100.2
- @memberjunction/actions-base@2.100.2
- @memberjunction/core@2.100.2
- @memberjunction/core-entities@2.100.2
- @memberjunction/global@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/ai@2.100.1
- @memberjunction/actions-base@2.100.1
- @memberjunction/core@2.100.1
- @memberjunction/core-entities@2.100.1
- @memberjunction/global@2.100.1

## 2.100.0

### Patch Changes

- Updated dependencies [5f76e3a]
- Updated dependencies [ffc2c1a]
  - @memberjunction/core@2.100.0
  - @memberjunction/core-entities@2.100.0
  - @memberjunction/actions-base@2.100.0
  - @memberjunction/ai@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- Updated dependencies [eb7677d]
- Updated dependencies [8bbb0a9]
  - @memberjunction/core-entities@2.99.0
  - @memberjunction/core@2.99.0
  - @memberjunction/actions-base@2.99.0
  - @memberjunction/ai@2.99.0
  - @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/ai@2.98.0
- @memberjunction/actions-base@2.98.0
- @memberjunction/core@2.98.0
- @memberjunction/core-entities@2.98.0
- @memberjunction/global@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/core-entities@2.97.0
- @memberjunction/actions-base@2.97.0
- @memberjunction/ai@2.97.0
- @memberjunction/core@2.97.0
- @memberjunction/global@2.97.0

## 2.96.0

### Patch Changes

- Updated dependencies [01dcfde]
  - @memberjunction/core@2.96.0
  - @memberjunction/actions-base@2.96.0
  - @memberjunction/core-entities@2.96.0
  - @memberjunction/ai@2.96.0
  - @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- Updated dependencies [a54c014]
  - @memberjunction/core@2.95.0
  - @memberjunction/actions-base@2.95.0
  - @memberjunction/core-entities@2.95.0
  - @memberjunction/ai@2.95.0
  - @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/core-entities@2.94.0
- @memberjunction/actions-base@2.94.0
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
  - @memberjunction/actions-base@2.93.0
  - @memberjunction/ai@2.93.0
  - @memberjunction/global@2.93.0

## 2.92.0

### Patch Changes

- Updated dependencies [8fb03df]
- Updated dependencies [5817bac]
  - @memberjunction/core@2.92.0
  - @memberjunction/core-entities@2.92.0
  - @memberjunction/actions-base@2.92.0
  - @memberjunction/ai@2.92.0
  - @memberjunction/global@2.92.0

## 2.91.0

### Patch Changes

- Updated dependencies [f703033]
- Updated dependencies [6476d74]
  - @memberjunction/core@2.91.0
  - @memberjunction/core-entities@2.91.0
  - @memberjunction/actions-base@2.91.0
  - @memberjunction/ai@2.91.0
  - @memberjunction/global@2.91.0

## 2.90.0

### Patch Changes

- Updated dependencies [146ebcc]
- Updated dependencies [d5d26d7]
- Updated dependencies [1e7eb76]
  - @memberjunction/core@2.90.0
  - @memberjunction/core-entities@2.90.0
  - @memberjunction/actions-base@2.90.0
  - @memberjunction/ai@2.90.0
  - @memberjunction/global@2.90.0

## 2.89.0

### Minor Changes

- d1911ed: migration

### Patch Changes

- Updated dependencies [d1911ed]
  - @memberjunction/core-entities@2.89.0
  - @memberjunction/actions-base@2.89.0
  - @memberjunction/ai@2.89.0
  - @memberjunction/core@2.89.0
  - @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- Updated dependencies [df4031f]
  - @memberjunction/core-entities@2.88.0
  - @memberjunction/actions-base@2.88.0
  - @memberjunction/ai@2.88.0
  - @memberjunction/core@2.88.0
  - @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- Updated dependencies [58a00df]
  - @memberjunction/core@2.87.0
  - @memberjunction/actions-base@2.87.0
  - @memberjunction/core-entities@2.87.0
  - @memberjunction/ai@2.87.0
  - @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- Updated dependencies [7dd2409]
  - @memberjunction/core-entities@2.86.0
  - @memberjunction/actions-base@2.86.0
  - @memberjunction/ai@2.86.0
  - @memberjunction/core@2.86.0
  - @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- Updated dependencies [a96c1a7]
- Updated dependencies [747455a]
  - @memberjunction/ai@2.85.0
  - @memberjunction/core-entities@2.85.0
  - @memberjunction/actions-base@2.85.0
  - @memberjunction/core@2.85.0
  - @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [0b9d691]
  - @memberjunction/core@2.84.0
  - @memberjunction/actions-base@2.84.0
  - @memberjunction/core-entities@2.84.0
  - @memberjunction/ai@2.84.0
  - @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- Updated dependencies [e2e0415]
  - @memberjunction/core@2.83.0
  - @memberjunction/actions-base@2.83.0
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
  - @memberjunction/actions-base@2.82.0
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
  - @memberjunction/actions-base@2.81.0
  - @memberjunction/ai@2.81.0
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/ai@2.80.1
- @memberjunction/actions-base@2.80.1
- @memberjunction/core@2.80.1
- @memberjunction/core-entities@2.80.1
- @memberjunction/global@2.80.1

## 2.80.0

### Patch Changes

- Updated dependencies [7c5f844]
- Updated dependencies [d03dfae]
  - @memberjunction/core@2.80.0
  - @memberjunction/core-entities@2.80.0
  - @memberjunction/actions-base@2.80.0
  - @memberjunction/ai@2.80.0
  - @memberjunction/global@2.80.0

## 2.79.0

### Minor Changes

- bad1a60: migration

### Patch Changes

- Updated dependencies [4bf2634]
- Updated dependencies [907e73f]
- Updated dependencies [bad1a60]
  - @memberjunction/core-entities@2.79.0
  - @memberjunction/global@2.79.0
  - @memberjunction/ai@2.79.0
  - @memberjunction/actions-base@2.79.0
  - @memberjunction/core@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [ef7c014]
- Updated dependencies [06088e5]
  - @memberjunction/ai@2.78.0
  - @memberjunction/core-entities@2.78.0
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
  - @memberjunction/actions-base@2.77.0
  - @memberjunction/ai@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- Updated dependencies [4b27b3c]
- Updated dependencies [7dabb22]
- Updated dependencies [ffda243]
  - @memberjunction/core-entities@2.76.0
  - @memberjunction/core@2.76.0
  - @memberjunction/actions-base@2.76.0
  - @memberjunction/ai@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- @memberjunction/ai@2.75.0
- @memberjunction/actions-base@2.75.0
- @memberjunction/core@2.75.0
- @memberjunction/core-entities@2.75.0
- @memberjunction/global@2.75.0

## 2.74.0

### Patch Changes

- Updated dependencies [b70301e]
- Updated dependencies [d316670]
  - @memberjunction/core-entities@2.74.0
  - @memberjunction/core@2.74.0
  - @memberjunction/actions-base@2.74.0
  - @memberjunction/ai@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- Updated dependencies [e99336f]
- Updated dependencies [eebfb9a]
  - @memberjunction/core-entities@2.73.0
  - @memberjunction/ai@2.73.0
  - @memberjunction/actions-base@2.73.0
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- Updated dependencies [636b6ee]
  - @memberjunction/core-entities@2.72.0
  - @memberjunction/actions-base@2.72.0
  - @memberjunction/ai@2.72.0
  - @memberjunction/core@2.72.0
  - @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0
  - @memberjunction/ai@2.71.0
  - @memberjunction/actions-base@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/core-entities@2.71.0

## 2.70.0

### Minor Changes

- c9d86cd: migration

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/ai@2.70.0
  - @memberjunction/actions-base@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/core-entities@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/actions-base@2.69.1
  - @memberjunction/core-entities@2.69.1
  - @memberjunction/ai@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0
  - @memberjunction/actions-base@2.69.0
  - @memberjunction/core-entities@2.69.0
  - @memberjunction/ai@2.69.0

## 2.68.0

### Patch Changes

- Updated dependencies [b10b7e6]
  - @memberjunction/core@2.68.0
  - @memberjunction/actions-base@2.68.0
  - @memberjunction/core-entities@2.68.0
  - @memberjunction/ai@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/ai@2.67.0
- @memberjunction/actions-base@2.67.0
- @memberjunction/core@2.67.0
- @memberjunction/core-entities@2.67.0
- @memberjunction/global@2.67.0

## 2.66.0

### Patch Changes

- Updated dependencies [7e22e3e]
  - @memberjunction/actions-base@2.66.0
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
  - @memberjunction/global@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/actions-base@2.65.0
  - @memberjunction/core@2.65.0

## 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/actions-base@2.64.0
  - @memberjunction/ai@2.64.0
  - @memberjunction/core@2.64.0
  - @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/ai@2.63.1
  - @memberjunction/actions-base@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1

## 2.63.0

### Minor Changes

- 28e8a85: Migration included to modify the AIAgentRun table, so minor bump

### Patch Changes

- Updated dependencies [28e8a85]
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/actions-base@2.63.0
  - @memberjunction/ai@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- c995603: Better Error Handling and Failover in AI core and Promts
- Updated dependencies [c995603]
  - @memberjunction/ai@2.62.0
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/actions-base@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Minor Changes

- 51b2b47: Improvements to AI Agents and Added Social Actions

### Patch Changes

- @memberjunction/ai@2.61.0
- @memberjunction/actions-base@2.61.0
- @memberjunction/core@2.61.0
- @memberjunction/core-entities@2.61.0
- @memberjunction/global@2.61.0

## 2.60.0

### Minor Changes

- e30ee12: migrations

### Patch Changes

- bb46c63: added missing deps
- Updated dependencies [b5fa80a]
- Updated dependencies [e30ee12]
- Updated dependencies [e512e4e]
  - @memberjunction/core@2.60.0
  - @memberjunction/core-entities@2.60.0
  - @memberjunction/actions-base@2.60.0
  - @memberjunction/ai@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/ai@2.59.0
- @memberjunction/actions-base@2.59.0
- @memberjunction/core@2.59.0
- @memberjunction/core-entities@2.59.0
- @memberjunction/global@2.59.0

## 2.58.0

### Minor Changes

- db88416: migrations

### Patch Changes

- Updated dependencies [def26fe]
- Updated dependencies [db88416]
  - @memberjunction/core@2.58.0
  - @memberjunction/ai@2.58.0
  - @memberjunction/actions-base@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/global@2.58.0

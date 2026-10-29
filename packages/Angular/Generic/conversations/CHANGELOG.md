# @memberjunction/ng-conversations

## 6.2.0-edge.6

### Minor Changes

- b5c11d3: Adds ElevenLabs' **Eleven Realtime** speech-to-speech models, `eleven_realtime_v1_mini` and `eleven_realtime_v1_max`, as realtime models for voice co-agents, on both the server-bridged and the browser-direct topology.
  - **Server driver `ElevenRealtime`** (`@memberjunction/ai-elevenlabs`). Eleven Realtime follows the OpenAI Realtime spec over a WebSocket, so the driver subclasses the shared `OpenAIRealtime` implementation the way the Grok Voice driver does, with its own provider profile. It differs from OpenAI in two places. ElevenLabs takes its API key as `xi-api-key`, not as a bearer token, so client secrets are minted from `/v1/convai/realtime/client_secrets` with that header, and the server-bridged session mints a secret before opening its socket instead of sending the API key on it. And ElevenLabs' turn eagerness is `low` / `medium` / `high`, so MJ's `auto` is sent as `medium`.
  - **What the profile turns on**, read from the session ElevenLabs echoes back: MCP tools and an output voice (ElevenLabs voice ids) are on. Reasoning effort and parallel tool calls are off: ElevenLabs accepts both fields but does not keep them, and Max's reasoning is not a session setting. No input-transcription model is sent, because the cascade transcribes the user itself.
  - **Browser client `ElevenRealtimeClient`** (`@memberjunction/ai-realtime-client`, provider key `eleven-realtime`): a WebSocket client that authenticates with the minted secret in the `openai-insecure-api-key.` subprotocol, as the `openai` SDK does. It is loaded wherever the other realtime clients are.
  - **Catalog** (metadata): **Eleven Realtime v1 Max** and **Eleven Realtime v1 Mini**, each with Eleven Labs as model developer and as inference provider through `ElevenRealtime`. No cost rows: ElevenLabs published no API pricing at launch.
  - This is a separate product from the ElevenLabs Agents Platform model (`ElevenLabsRealtime`), which is unchanged; its premade voice list now comes from a shared `ElevenLabsPremadeVoices()`.

- 7d9b179: Add 5 record form, grid, version history, and AI overlay capabilities plus human-friendly record tab/browser titles:
  1. **Bidirectional `<mj-record-links>` & Universal `<mj-record-preview-popover>` (`@memberjunction/ng-base-forms`)**:
     - Extend `<mj-record-links>` to surface both **Outgoing ("On This Record")** links from populated hard FK and polymorphic FK fields (`EntityField.EntityIDFieldName`) on the open record and **Incoming ("Linked To This")** dependent records from `GetRecordDependencies`, with direction filter tabs (`All` / `On This Record` / `Linked To This`), search, and expandable entity cards.
     - Add `<mj-record-preview-popover>` hover preview card for FK and polymorphic FK links in `<mj-form-field>` and link items in `<mj-record-links>`, displaying the target record's entity badge, display name, copyable abbreviated primary key pill, top summary fields, last-updated timestamp, and quick navigation.
  2. **Pluggable Form Toolbar Button Registry & Pre-Warmed Link Count Badge (`@memberjunction/ng-base-forms`)**:
     - Introduce `BaseFormToolbarButton` and `FormToolbarButtonRegistry` (`@RegisterClass(BaseFormToolbarButton, buttonKey)`) supporting entity-scoped, pattern-scoped, and global custom toolbar buttons with `Prewarm` / `RefreshState` / `Execute` lifecycles and priority-aware subclass overrides.
     - Pre-warm `LinkCount` and `LinksSummary` when the Links button is pinned for the current user, backed by a 30s TTL dependency cache shared with `<mj-record-links>`.
  3. **World-Class `<mj-record-changes>` Drawer & In-Form "Time Travel" Historical Version Preview (`@memberjunction/ng-record-changes` & `@memberjunction/ng-base-forms`)**:
     - Redesign `<mj-record-changes>` header to show `EntityInfo.DisplayNameOrName`, a compact copyable ID pill, a collapsible Version Labels accordion, and an interactive SVG **Activity Over Time** sparkline bar chart.
     - Add `"Preview in Form"` toggle on version cards in `<mj-record-changes>`, closing the drawer so the form is unobstructed, rehydrating all stored snapshot fields from `FullRecordJSON` onto the entity record (so calculated and dependent fields update live), and rendering a floating glassmorphic **Time-Travel Dock** in `<mj-record-form-container>`.
  4. **Live `<mj-entity-data-grid>` Row Patching & Non-Disruptive Update Pill (`@memberjunction/ng-entity-viewer`)**:
     - Subscribe `<mj-entity-data-grid>` to `MJGlobal` `BaseEntity.BaseEventCode` (`save`, `delete`, `remote-invalidate`) events matching the grid's entity.
     - Patch updated visible rows in place via `gridApi.applyTransaction({ update })` without resetting scroll, sort, or selection, and surface a non-disruptive floating pill when records are created or deleted.
  5. **Active-Record + Links Context in `<mj-chat-agents-overlay>` (`@memberjunction/ng-conversations`, `@memberjunction/ng-base-forms`, `@memberjunction/ng-explorer-core`)**:
     - Enrich `FormCompositionSnapshot` / `FormAgentContext` with `RecordState` (edit mode, dirty fields, conflict state, active time-travel preview) and `Links` (total, outgoing, incoming, top entity groups).
     - Add an `"Ask AI"` button in `<mj-form-toolbar>` that expands the `<mj-chat-agents-overlay>` workspace via `ConversationsRuntime.Instance.Bridge.RequestExpandOverlay()` and displays an **Active Record Context** pill bar in the chat overlay.
  6. **Entity Display Name + Abbreviated UUID for Record Tab Headers & Browser Titles (`@memberjunction/ng-shared`, `@memberjunction/ng-explorer-core`, `@memberjunction/ng-base-forms`)**:
     - Add `FormatEntityRecordDisplayTitle` and `ResolveRecordTabDisplayTitle` so records without a human-readable `NameField` (or whose `NameField` resolves to a raw UUID, such as `MJ: Process Run Details`) display `<Entity Display Name> · <Abbreviated UUID>` (e.g., `Process Run Details · 9FAF60…C577`) across workspace tabs, browser window titles, origin breadcrumbs, and record link/preview cards.

### Patch Changes

- f7d5ab5: Ten small fixes:
  - Vector indexing treats field names with `pin`, `otp`, `passcode` or `biometric` as sensitive (#5670).
  - `DropboxFileStorage.ListObjects` no longer makes an extra account call or logs the account email on every listing (#4440).
  - The folder dialog's "Everyone" hint says a shared folder can't be made private again (#4817), and a stray indent is fixed (#4818).
  - The entity save inconsistency warning is saved to the error log with a code that fits the column, and a failed save logs why (#6024).
  - The SQL converter's jsonb guard compares an unquoted schema name in lower case, matching how PostgreSQL stores it (#5864).
  - CodeGen's built-in feature defaults enable form-layout generation under the name the code checks (#5827), and the validator count no longer counts duplicates (#4376).
  - `mj sync push` honors `sqlLogging.variableBatchThreshold`, default 200, as watch already did (#5556).

- 09c7d57: `<mj-markdown>` images can be capped by the host with the `--mj-markdown-image-max-height` CSS custom property (unset: no cap, as before), and a new `ImageClicked` output reports a clicked or keyboard-activated image (not one inside a link; images stay inert unless the output is bound). The conversation message item binds it and opens the image in the chat's existing image viewer, the same way an attachment thumbnail opens. The image viewer's Download opens a cross-origin image in a new tab instead of navigating the app away (browsers ignore `download` across origins).
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

- cb1e602: Follow-ups to the realtime runtime's new failure teardown. A call that ends over a failure now keeps its end reason when the host reacts to it: the runtime claims its `Error` teardown before it reports the `'error'` state, so a host that ends the call the moment it sees that state (MobileApp's voice screen does) joins that teardown instead of closing the row as `Explicit`. Explorer's chat area now tells the user when a voice call ends over a failure — a dropped connection, a start that failed, or a call that reached its time limit — where the call surface used to vanish without a word. On Gemini Live Extended Thinking, a reply requested as narration stays narration when the server ends the turn and the interaction in one frame (it used to be captioned and saved as a normal turn), and a context note the finished turn already consumed is no longer committed at the end of the interaction, which made the model speak a second, unprompted time; the commit is kept for the non-blocking tool response it exists for.
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

- 718b01c: - Suppress auto-appended related entity sections on custom-layout forms (`MJAIAgentFormComponentExtended`, `MJAIAgentSessionFormComponentExtended`, `MJAIPromptFormComponentExtended`, `MJAIPromptRunFormComponentExtended`, `MJActionFormComponentExtended`, `MJEntityActionFormComponentExtended`, `MJQueryFormComponentExtended`, and `MJTemplateFormComponentExtended`) by overriding `OwnsEntireFormBody` to return `true`.
  - Fix `NG0100: ExpressionChangedAfterItHasBeenCheckedError` on `MJAIAgentRunFormComponentExtended` (`OnPush`) by marking the view for check when `loadRunTree`, `loadAgent`, and `loadCostMetrics` mutate bound component state.
  - Exclude untouched non-Active (`Deprecated`/`Disabled`) fields from `GraphQLDataProvider.Save()` on `Create` so `entity.Get` is not called on untouched deprecated fields (such as `ArtifactID`, `ArtifactVersionID`, and `SuggestedResponses` on `MJ: Conversation Details`).
  - Move diagnostic browser console logs across metadata cache pre-validation, dataset status coalescing, fire-and-forget mutations, workspace bootstrap, agent client sessions, conversation agent routing, conversation streaming, and message input into `LogStatusEx({ ..., verboseOnly: true })`, while keeping the startup GraphQL setup summary log always visible.
  - Add polymorphic foreign key (`EntityField.EntityIDFieldName`) smart link rendering across `<mj-form-field>` (read-mode clickable entity icon + resolved record name + raw ID badge, edit-mode FK autocomplete picker scoped to the sibling `EntityID` field's target entity, and automatic coercion of generated `Type="textarea"` polymorphic `RecordID` fields to `'textbox'`) and `<mj-entity-data-grid>`, `<mj-entity-cards>`, and `<mj-entity-record-detail-panel>` (batch-resolved target record names via `GetEntityRecordNames` and clickable record navigation links, strictly gated on `EntityField.EntityIDFieldName` metadata with no heuristic fallback).
  - Populate `EntityField.EntityIDFieldName` metadata across 45 polymorphic FK fields on 41 core entities (`metadata/entities/.polymorphic-fk-entity-fields.json`).
  - Add cross-tab and cross-session live form auto-refresh in `MjRecordFormContainerComponent` & `GraphQLDataProvider`: generate a unique per-tab runtime `sessionId` so multi-tab edits broadcast across tabs, automatically reload open read-mode forms when a record is saved remotely, pulse-highlight changed `<mj-form-field>` elements for 2.5s, and display a non-intrusive slide-in update pill (with a manual "Reload" action if the user is actively editing).
- Updated dependencies [622f166]
- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [b5955fb]
- Updated dependencies [d538c14]
- Updated dependencies [0581392]
- Updated dependencies [cc41d33]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [142d524]
- Updated dependencies [0ff7523]
- Updated dependencies [b5c11d3]
- Updated dependencies [c4645bc]
- Updated dependencies [5d83ba4]
- Updated dependencies [c4645bc]
- Updated dependencies [a65dfb8]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [b51a540]
- Updated dependencies [09c7d57]
- Updated dependencies [f26084f]
- Updated dependencies [1141164]
- Updated dependencies [dae1d31]
- Updated dependencies [a610c6e]
- Updated dependencies [4c97994]
- Updated dependencies [cb1e602]
- Updated dependencies [c4645bc]
- Updated dependencies [536991a]
- Updated dependencies [7d9b179]
- Updated dependencies [db4e210]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [68f5c01]
- Updated dependencies [36cdad5]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [c159f99]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [c4645bc]
- Updated dependencies [5b41d48]
- Updated dependencies [291485d]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
- Updated dependencies [f125bb4]
- Updated dependencies [4c34ab8]
- Updated dependencies [e600813]
  - @memberjunction/ai-core-plus@6.2.0-edge.6
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/graphql-dataprovider@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/ng-shared-generic@6.2.0-edge.6
  - @memberjunction/ng-ui-components@6.2.0-edge.6
  - @memberjunction/ai-engine-base@6.2.0-edge.6
  - @memberjunction/ai-realtime-client@6.2.0-edge.6
  - @memberjunction/realtime-runtime@6.2.0-edge.6
  - @memberjunction/ng-base-forms@6.2.0-edge.6
  - @memberjunction/ng-markdown@6.2.0-edge.6
  - @memberjunction/ng-notifications@6.2.0-edge.6
  - @memberjunction/ng-artifacts@6.2.0-edge.6
  - @memberjunction/ng-whiteboard@6.2.0-edge.6
  - @memberjunction/ai-agent-client@6.2.0-edge.6
  - @memberjunction/conversations-runtime@6.2.0-edge.6
  - @memberjunction/ng-forms@6.2.0-edge.6
  - @memberjunction/ng-realtime-channels@6.2.0-edge.6
  - @memberjunction/ng-task-graph-editor@6.2.0-edge.6
  - @memberjunction/ng-tasks@6.2.0-edge.6
  - @memberjunction/ng-user-routines@6.2.0-edge.6
  - @memberjunction/ng-realtime-media@6.2.0-edge.6
  - @memberjunction/ng-testing@6.2.0-edge.6
  - @memberjunction/ng-base-types@6.2.0-edge.6
  - @memberjunction/ng-code-editor@6.2.0-edge.6
  - @memberjunction/ng-react@6.2.0-edge.6
  - @memberjunction/ng-resource-permissions@6.2.0-edge.6
  - @memberjunction/ng-composer@6.2.0-edge.6
  - @memberjunction/ng-container-directives@6.2.0-edge.6
  - @memberjunction/ng-media-player@6.2.0-edge.6
  - @memberjunction/interactive-component-types@6.2.0-edge.6
  - @memberjunction/ng-agent-client@6.2.0-edge.6

## 6.2.0-edge.5

### Minor Changes

- 39b35f1: Real-time task graph workflow UX, continuation synthesis with step outputs and artifacts, single-step delegation folding, per-user runnable agent directory & task graph validation, and a redesigned AI Agent Workflows & Tasks Command Center (#5878).
  - **Single-step task graph folding (`@memberjunction/ai-agents`).** `LoopAgentType.DetermineNextStep` automatically folds single-node `Tasks` emissions with no dependencies into an in-turn `Sub-Agent` step (`terminateAfter: false`) so single-agent delegations complete in a single conversation turn without spawning a background task graph, while preserving durable `Tasks` execution for multi-step (`2+` node) workflows. When an orchestrator with `ArtifactCreationMode = 'Never'` or `'System Only'` delegates a folded step to a specialist agent that produces artifacts, `AgentRunner.ProcessAgentArtifacts` resolves the specialist's `DefaultArtifactTypeID` and creation mode so deliverables are persisted and attached to the conversation message.
  - **Per-user runnable agent directory, pre-submission task graph validation, and sub-agent workflow propagation (`@memberjunction/ai-engine-base`, `@memberjunction/aiengine`, `@memberjunction/ai-core-plus`, `@memberjunction/ai-agents`, `@memberjunction/task-graph`, `@memberjunction/server`).** `AIEngineBase.GetUserRunnableAgentDirectory(user)` caches a per-user directory of active top-level agents permitted by `CanUserRunAgent`, invalidated on agent and permission changes. `BaseAgent` preloads `availableAgentCount` / `availableAgentDetails` into prompt templates, validates `Tasks` step targets before submission (converting unknown or restricted agent/action references into a self-correcting `Retry` step with the user's permitted agent list), propagates `conversationDetailId` and `Paused` workflow-awaiting state from sub-agents (`Workflow Planner`) to parent runs (`Sage`), includes `agentRun.Message` in sub-agent result markdown, and settles/reinvokes ancestor runs along `ParentRunID` in `TaskGraphDispatcher` and `TaskGraphContinuationDeliverer`.
  - **Live task graph telemetry, isolated step artifact persistence, and adaptive continuation delivery (`@memberjunction/server`, `@memberjunction/ai-agents`, `@memberjunction/conversations-runtime`).** `TaskGraphAgentRunner` resolves the originating `ConversationDetailID`, passes `inputArtifacts: []` to isolate task-graph step runs from earlier conversation turn artifacts, and forces `behavior: 'create-new'` when persisting step deliverables so sibling/prior artifacts are never overwritten as `v2`. `AgentRunner.ProcessAgentArtifacts` infers `Research Content` (`report.html`) and extracts `report.name` / `report.description` / `synthesis.executiveSummary` for report-producing specialist steps. `TaskGraphContinuationDeliverer` strips inherited upstream keys from merged `OutputPayload`s, updates the originating workflow message in-place when no intervening messages were sent (`origin.IsLatest`), or posts a bottom continuation reply linked via `ConversationDetail.ParentID` when intervening messages were sent while the workflow ran.
  - **First-class inline Workflow Execution Card, Workflow Context Header, & real-time chat reconciliation (`@memberjunction/ng-conversations`).** `ConversationChatAreaComponent` and `MessageItemComponent` reconcile live `TaskGraphProgress` frames in place, deduplicate parent container tasks from executable step rows, strip inherited upstream payload keys from step summaries, and render a relational `.workflow-continuation-banner` (`Completed workflow · <Name> · View workflow ↑`) on bottom continuation replies that scrolls to and highlights the originating workflow turn.
  - **AI Agent Workflows & Tasks Command Center (`@memberjunction/ng-conversations`, `@memberjunction/ng-tasks`, `@memberjunction/ng-explorer-core`).** Redesigned `TasksFullViewComponent` with a 5-metric KPI telemetry ribbon, instant search and status/agent filters, a **Workflow Cards** DAG view, a second-resolution **Execution Timeline & DAG** waterfall view, and a slide-over **Step Inspector Drawer** with one-click navigation back to the originating conversation.

- b14c72f: Add the personal Chief of Staff (`Chief of Staff`) AI agent, per-user narrowed governance (`MJ: AI Agent User Policies` + `AgentUserPolicyEngine`), 3-Tier Wake Gate on `MJ: User Routines` (`RoutineType = 'AgentWake'`), user-scoped calendar/email/availability actions (`EnterpriseMailboxSecurityGate`), and Communication Dashboard enterprise governance cards.
- b4e2ceb: `mj-conversation-chat-area` gets an `AllowForking` input, like `AllowRealtime` and `AllowAttachments`. It defaults to true, so nothing changes unless a host sets it. With `[AllowForking]="false"` the chat offers no fork actions (Fork from here, Edit or Regenerate as a fork), and Edit and Regenerate change the latest turn in place, as they do for a person without the `Conversations: Fork` authorization. It only affects the UI: deny that authorization to a role to stop the server creating forks too.
- 5fed75a: Agent runs no longer write `AIAgentRun.Result`; use `FinalPayload`, which holds the same value. The `Result` column remains, deprecated, for existing rows.

  New column `AIAgentRunStep.PayloadAtStartSourceStepID`. When a step starts from the same payload an earlier step in the run ended with, `PayloadAtStart` is stored as NULL and this column points at that step. Readers resolve the value with `ResolvePayloadAtStart` / `ApplyResolvedPayloadAtStart` from `@memberjunction/ai-core-plus`. External API clients that read `PayloadAtStart` directly must follow the pointer.

- 8420f36: Client-direct realtime recordings no longer depend on the browser surviving the end of the call (#5294).
  - **Opus shards during the call.** The browser captures at 48 kHz into one continuous Opus encoder (WebCodecs, or libopus WebAssembly in a Worker where WebCodecs cannot encode Opus) and uploads a 5 s `MJOPUS1` shard as raw bytes to `POST /realtime/recording/:agentSessionId/shard/:index`. Each shard is kept in IndexedDB until the server acknowledges it, so shards survive network drops and reloads and are uploaded on the next page load.
  - **Keepalive terminal.** End, `pagehide` and `visibilitychange`→hidden send `POST /realtime/recording/:agentSessionId/end` with the last partial window as a `keepalive` request, then re-send every unacknowledged shard with `keepalive`. A hidden tab's terminal carries `final=false`: the server stamps the counts but assembles only after the grace period, so switching tabs does not rewrite the recording. `EndRealtimeSession()` waits for the terminal's acknowledgement for at most 3 s. The whole-call `UploadRealtimeRecording` upload and the `beforeunload` prompt are gone from new clients. The mutations remain for older clients.
  - **Server ledger and assembly.** Migration `V202610151535` adds `RecordingStatus`, `RecordingExpectedShards`, `RecordingCapturedSamples`, `RecordingGaps` and `RecordingAssemblyVersion` to `AIAgentSession`, and the new `MJ: AI Agent Session Recording Shards` entity, written through guarded stored procedures. MJAPI assembles `recording.wav` and `peaks.json` within seconds of the terminal. A recording with missing shards is assembled as `Partial` after `realtime.recordingAssemblyGraceSeconds` (default 90): each gap is silence and is listed in `RecordingGaps`. The session janitor assembles sessions that never sent a terminal. Recovery of legacy `seg-*.pcm` storage shards is unchanged.
  - **Breaking for custom hosts:** `IRealtimeSessionRecorder` now returns Opus packets (`TakeEncodedPackets()`, `Stop(): Promise<number>`) instead of base64 audio. `BrowserRecordingUnloadGuard` is removed. A host that wires its own page-lifecycle events calls `SendRecordingTerminal({ Final: false })` when the page is hidden and `SendRecordingTerminal()` on `pagehide`.

### Patch Changes

- 81aea34: Enable full-conversation artifact manifest visibility (`artifactId`, `versionId`, `versionNumber`, `description`, `title`, and table/row summaries), `artifactDirective` forwarding across `LoopAgentResponse`/`LoopAgentType`/`BaseAgent` (including alpha-ID resolution to UUIDs and clean base payloads for `create-new`), `Data` artifact extract rules and payload title/description fallback on `MJ: Artifacts` and `MJ: Artifact Versions`, `QueryBuilderAgent` single-table vs. multi-table normalization on `Chat` and `Success` steps, and conversation artifact panel auto-opening on active branch paths.
- 9898079: `AllowStopRun` on `mj-conversation-chat-area` now turns off everything about stopping, not just the Stop controls. It defaults to true, so nothing changes unless a host sets it. With `[AllowStopRun]="false"` the chat offers no Stop or Stop all in the composer, no Stop pill on an in-progress reply, no Continue button on a stopped reply, and no "Continue, or tell {agent} what to do differently" placeholder. It only affects the UI: a run stopped from another client still shows as stopped, and the next message still continues it. The input now sits with the other host-level caps (`AllowAttachments`, `AllowPlanMode`, `AllowRealtime`) and is listed in the README's feature toggles.
- 189b702: The composer's status line ("Sage is working" with the elapsed time beside it, "2 agents working", and "Stopping Sage…" after a stop the viewer asked for) now shows whenever a reply is in flight, instead of only while the send slot is Stop. It is information, not a control, so a read-only viewer and a host with `AllowStopRun` off see it too; the Stop control itself is still gated as before. Nothing changes for the default host, where the slot was already Stop whenever the line showed. The elapsed time is its own pill after the text, with no comma, on the info status tokens so it reads in dark mode.
- 0c634ba: Fix Explorer console errors: grant UI role create/update permissions on MJ: User Record Logs and guard RecentAccessService.LogAccess, emit Conversations$ synchronously on optimistic SaveConversation updates and run change detection on conversation rename/creation callbacks to prevent NG0100, fall back to user-settings persistence in EntityViewerComponent when UserCanEdit is false on a loaded UserView, and hide/omit Deprecated and Disabled entity fields in MjFormFieldComponent and AngularClientGeneratorBase.
- 542795b: Memory-leak audit round 19 fixes.
  - **Ollama**: a request carrying a cancellation token no longer leaves abort listeners on that (long-lived) token. Each request adds one listener, removed when the call or stream ends, and early stream termination safely invokes `iterator.return()` without masking stream errors.
  - **Client tools & Realtime session signals**: `ClientToolRequestManager` session tool definitions are now an LRU with a 6 h idle TTL, capped at 1,000 sessions and 200 tools per session. `RealtimeClientSessionService.combineSignals` now pairs its combined `AbortSignal` with a `Dispose` callback called in `finally` so reused caller signals do not accumulate abort listeners across relayed tool calls.
  - **MCP client**: a failed `connect` now closes the transport it created (falling back to `transport.close()` directly if the client has no attached transport), so a stdio server's child process or an SSE/HTTP stream is no longer orphaned.
  - **Timers**: `ParallelExecuteAction` and the conversation-naming helper clear their timeout timer when the work finishes first.
  - **Dev Tools**: `EventMonitorComponent` and the 7 sibling DevTools `BaseResourceComponent` subclasses call `super.ngOnInit()` / `super.ngOnDestroy()`.

- fcc3f03: Clears the two Source guards failures on `next` from #5910 and #5912.
  - **Saving a chat task graph as a workflow** runs the save operation through the conversation's own provider (`ProviderToUse`), not the global `Metadata.Provider`. With several connections open, the global provider could route the save to the wrong server.
  - **Flow agents with several starting steps** check completed steps against a `UUIDSet` built once, instead of scanning the completed list with `UUIDsEqual` for every pending start step and every incoming join edge. Step IDs still match case-insensitively.

- 1214eca: Renames `ConversationChatAreaComponent.openConversationArtifactForCommand` to `OpenConversationArtifactForCommand`, as MJ's naming standard requires for public members. The method came in with #5896 and hasn't been released, so there's no deprecated alias. Its callers in `ChatConversationsResource` are updated. This clears the MJ standards check that has failed on every PR since #5896.
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

- 130cc7e: Opening a record from the Tasks Command Center now builds its key from the entity's real primary key, so a record whose key isn't a single `ID` column opens, and composite keys work. Opening a workflow step's agent run uses `CompositeKey.FromID` for the `MJ: AI Agent Runs` core entity. This clears the Primary Key Compliance gate that #5878 broke.
- 2a7a098: A user who cannot read MJ's AI entities now sees a conversation's messages and its composer. `AIEngineBase` gains `ReadableAgents`: the agents when the user may read them, else none, where `Agents` throws `PermissionConstrainedError`. The mention engine initialises with no agents for such a user instead of throwing, and every agent lookup in the chat area, the message item, the message input, the tasks dropdown, the agent picker, the conversation-agent service and the default-agent resolver reads the agents through it (#5240).
- c7d1170: Security: client SQL fragments reach RunView only through the base-view clause screen. The screen moves from MJServer's `ResolverBase` into `@memberjunction/generic-database-provider` as `ClientClauseScreen`, and the provider exposes it as `ScreenClientClause`. It now also guards `RunViewsWithCacheCheck` (which also gets the `view:batch` API-key scope check), every ad-hoc list source by default (client-supplied, from the list and audience actions, or rebuilt from a stored list snapshot), the REST view routes (which also refuse a `ViewEntity` that was not loaded as an entity), and a saved view's stored WhereClause and sort (on save, and again when the view runs). The screen refuses a subquery over an entity the acting user reads under a row filter (role row-level security or an API-key row filter) or with denied fields, the queried entity included, because a subquery reads the base view without them; the ad-hoc SQL screen uses the same rule. Both screens read table references from a walk of the whole parse tree (subqueries in CASE branches, HAVING and window clauses included, and every FROM item even when an alias repeats), refuse SQL whose SELECT keywords the walk does not account for, refuse a table function in FROM unless it is an unqualified built-in that reads only its arguments, and skip only the parse wrapper's own FROM item. `SQLParser.IdentifierAliases` exposes the names a fallback parse renamed, so bracket-quoted CTE names still resolve. The fallback takes those names from a prefix the SQL does not contain and keeps each one a separate token, so every name in that map is one the parser renamed. `SQLParser.IsIdentifierAliasName` reports that name form, and both screens refuse client SQL that uses it. The ad-hoc SQL screen exempts a FROM item as a CTE reference only when it is unqualified (`dbo` counts as a schema), is in the scope of a WITH that declares the name (its own SELECT or an enclosing one; a CTE body sees the CTEs before it, itself on SQL Server, and every CTE of a PostgreSQL WITH RECURSIVE list), and matches by the dialect's identifier rules (case-insensitive on SQL Server; on PostgreSQL unquoted names fold to lower case and quoted names match exactly). The parse-tree walk takes time linear in the size of the parse tree, and the fallback renaming and the forbidden-function check take time linear in the size of the SQL. A schema-qualified table reference, `dbo` included, resolves only to an entity in that schema. Client clauses may no longer call the functions the dialect forbids in caller SQL (`CallerSQLForbiddenFunctions`), and that shared list now also covers `pg_sleep*` on PostgreSQL and `OPENXML` on SQL Server. The rubric comparison matrix and the conversations UI (the tasks view, task search and the agent artifact lookup) now read the IDs they filter by with their own RunView instead of a subquery over those views; the conversations Tasks tab rebuilds that filter on every load and refresh. On PostgreSQL the screen reads `[Name]` bracket identifiers as the PostgreSQL provider does. Every RunView caller also gets a bracket- and `E''`-aware check that refuses statement separators and comments in filter, sort and search fragments, and a view ID is spliced into SQL only when it is a GUID. A stacked statement hidden from the keyword denylist by a quote inside a bracket identifier no longer reaches the database on these paths.
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
- Updated dependencies [0cc6b08]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [189b702]
- Updated dependencies [5465489]
- Updated dependencies [83486cf]
- Updated dependencies [c6b4b85]
- Updated dependencies [d29b5c2]
- Updated dependencies [8b62f8c]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [60bb4b5]
- Updated dependencies [2274f42]
- Updated dependencies [35ed364]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [c271ddf]
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
- Updated dependencies [7fb8598]
- Updated dependencies [1d29837]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [e1f2583]
- Updated dependencies [dc38250]
- Updated dependencies [1aefcb4]
- Updated dependencies [2f9e209]
- Updated dependencies [382de4d]
- Updated dependencies [8576224]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/ai-core-plus@6.2.0-edge.5
  - @memberjunction/ai-engine-base@6.2.0-edge.5
  - @memberjunction/conversations-runtime@6.2.0-edge.5
  - @memberjunction/ng-tasks@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/graphql-dataprovider@6.2.0-edge.5
  - @memberjunction/ng-user-routines@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/ng-composer@6.2.0-edge.5
  - @memberjunction/ng-shared-generic@6.2.0-edge.5
  - @memberjunction/ng-ui-components@6.2.0-edge.5
  - @memberjunction/ng-base-forms@6.2.0-edge.5
  - @memberjunction/ng-markdown@6.2.0-edge.5
  - @memberjunction/ng-notifications@6.2.0-edge.5
  - @memberjunction/realtime-runtime@6.2.0-edge.5
  - @memberjunction/ai-realtime-client@6.2.0-edge.5
  - @memberjunction/ng-whiteboard@6.2.0-edge.5
  - @memberjunction/ng-testing@6.2.0-edge.5
  - @memberjunction/ng-artifacts@6.2.0-edge.5
  - @memberjunction/ng-base-types@6.2.0-edge.5
  - @memberjunction/ng-code-editor@6.2.0-edge.5
  - @memberjunction/ng-react@6.2.0-edge.5
  - @memberjunction/ng-resource-permissions@6.2.0-edge.5
  - @memberjunction/ng-task-graph-editor@6.2.0-edge.5
  - @memberjunction/ng-realtime-channels@6.2.0-edge.5
  - @memberjunction/ng-realtime-media@6.2.0-edge.5
  - @memberjunction/ai-agent-client@6.2.0-edge.5
  - @memberjunction/ng-forms@6.2.0-edge.5
  - @memberjunction/ng-container-directives@6.2.0-edge.5
  - @memberjunction/ng-media-player@6.2.0-edge.5
  - @memberjunction/interactive-component-types@6.2.0-edge.5
  - @memberjunction/ng-agent-client@6.2.0-edge.5

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

- 666d078: A new realtime channel shows the agent's video when the model sends one (an avatar): **Avatar** (`RealtimeAvatarChannel`), with an `MJ: AI Agent Channels` row on the generic `ClientOnlyChannelServer` whose `UIConfig` places its surface on the stage. It is in every call and inert without video: open from the start, it gives the agent no verbs, nouns or instructions (the agent's channel note leaves it out) and shows the agent nothing. It sinks outbound video, so the session requests the agent's video when it connects; when the video arrives, the runtime marks the channel as used and the overlay brings its surface up where the row places it. The surface (`mj-realtime-avatar-surface`) shows the video in an `mj-media-tile`. `mj-media-tile` now labels a shown avatar "AI-generated video" for as long as it shows one; its chips sit in a row in the tile's top-left corner, so the label and "Sharing" can show together.
- 4889ca0: Two new realtime channels let the agent ask to see the user's camera or screen: **Camera** (`RealtimeCameraChannel`) and **Screen Share** (`RealtimeScreenShareChannel`), with `MJ: AI Agent Channels` rows on the generic `ClientOnlyChannelServer` whose `UIConfig` places their surface in picture-in-picture. Both are opt-in and on demand: the agent opens one with a `reason`, which is the request, and only the user turns the capture on or off. The surface (`mj-realtime-capture-surface`) shows the ask with Turn on camera (or Share your screen) and Not now, then the user's self-view or share preview. The conversations UI brings both channels to its calls (`CONVERSATION_CALL_HOST_CHANNELS`); other hosts get them when their agent or app includes them. A channel's context gains `Captures$`, `StartCapture` and `StopCapture`, so a channel that fronts a capture can follow it and run the user's clicks under the runtime's policy.
- 1ea4085: A realtime channel's surface now shows where its `MJ: AI Agent Channels` row says. The row's `UIConfig` JSON gains `Placement` (`stage`, `pip`, `tab` or `hidden`; the tab when absent) and `AllowedPlacements` (where the user may move it; anywhere when absent), and CodeGen regenerates the typed `UIConfigObject` accessor. The runtime reads each row's placement when it builds the channel (a row whose `UIConfig` is not valid JSON keeps its channel and starts on its tab) and exposes it as `BaseRealtimeChannelClient.SurfacePlacement`. The call overlay starts each surface there, offers only the allowed placements in "Move to…", hides "Bring it here" when the tab is not allowed, and sends a surface leaving the stage to where its channel places it, using the media module's newly exported `PlacementOffStage`. No existing row sets a placement, so every surface still starts on its tab.
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

- e4c355e: The agent's video holds its last frame while a call resumes on a new connection, for up to 5 s, instead of giving way to the orb after a second (#5357). On Gemini Enterprise (Vertex AI) new video comes about 3 s after each move (Google's `goAway`, about every 9 minutes, and any dropped socket), so the avatar's tile showed the orb for about 2 s each time, as if the agent had left. `RealtimeSessionRuntime.Resuming$`, also on `RealtimeChannelContext`, is `true` from a `'connecting'` the driver reports while the call is live until the call is live again, fails or ends; a call's first connect is not a resume. `mj-media-tile` takes `HoldLastFrame`, which keeps the frame on show through a stall, and emits `FramesFlowingChange` when the video's frames stop or come back. The Avatar channel's surface holds from a resume's start until new frames come, `AGENT_VIDEO_RESUME_HOLD_MS` (5 s) pass, or the call fails or ends; the orb then shows if the video is still out of frames. A stall outside a resume still shows the orb after about a second.
- 6dce70c: A call keeps the agent's video in its place while the session resumes on a new connection. A resume (Google's `goAway`, a dropped socket, or the Enterprise relay's new socket) takes the call through `'connecting'`, and the overlay used to swap its hero for the connecting screen then: the video lost its place, and the stage laid it over the whole call, banner and controls included, until the call was back. Now the connecting screen gives way to a hero the agent's video presents in (`RealtimeSessionOverlayComponent.ShowConnectingScreen`), so the video keeps its place and its element, its last frame stays on screen, and its tile says "Connecting". After about a second without a frame, the tile's stall fallback shows the orb in the video's place, as before, and the next frame brings the video back. Video that arrives while a call first connects goes to the hero the same way. The console chrome, a video moved to picture-in-picture and a call with no video still show the connecting screen as before.

  `@memberjunction/ai-realtime-client` has no code change. Its tests now drive a resume with the real `VideoPlayout` (after `goAway`, after a dropped socket, and through the Enterprise relay) and check that the player keeps one element, media source and source buffer, lets the cut turn play out without a flush, appends the new connection's init segment and fragments to the same buffer and plays on from the last frame, and still flushes on barge-in. The test MSE fake now reopens an ended stream on the next append, as browsers do.

- 6cd23e1: A call whose agent asked for a live avatar it can't show says so once. Core gains `RealtimeAvatarStatus`, `ClientRealtimeSessionConfig.AvatarStatus`, `BaseRealtimeModel.SupportsAvatarOutput(model)` (default `false`; Gemini answers from its Live profile) and `ParseRealtimeAvatarStatus`, and the browser-side reason `downgraded` becomes `host` and `browser` (the Gemini and Gemini Enterprise browser clients log the new reason). Both Gemini drivers (`GeminiRealtime`, and `GeminiEnterpriseRealtime` in `@memberjunction/ai-vertex`) return their avatar decision on the mint, through the protected `AvatarStatusFor`; `RealtimeClientSessionService.PrepareClientSession` merges it with the persona resolution (`endpoint` first, then `no-binding` / `unknown-avatar`, else the driver's decision), logs one line, and returns `AvatarStatus`, which MJServer sends as `StartRealtimeClientSessionResult.AvatarStatusJson`. The stock launcher asks for the field and drops it alone against a server that predates it. After the call connects, the runtime publishes `AvatarNotice$` (`host` when the app asked for no agent video, `browser` when the track did not go live, else the status's reason), once per call, and clears it when the call ends. `ng-realtime-media` holds the wording (`AvatarNoticeText`, "Audio only: …", per-reason host overrides) and declares `@memberjunction/ai`; the call overlay shows it as a small info `mj-alert` under the banner in both chromes, with a dismiss button, hiding after 10 s, never in review (`AvatarNoticeLabels` overrides the words). Calls whose agent asked for no avatar look as before. Integration check RD13 also checks that a voiced agent without a face on the session's vendor asks for no avatar and reports `no-binding`.
- 51634e7: A picked voice's avatar now shows only when the voiced agent's own video setting is on, so a pick no longer turns on billed avatar video by itself. The runtime override can't turn `realtime.video.enabled` on in `ResolveEffectiveRealtimeConfig` (it can still turn it off), and both override builders (`BuildRealtimeOverridesJson`, `BuildRealtimeConfigOverridesJson`) send the pick as `realtime.video.avatarId` alone. A call that picked an avatar while the setting is off is audio only with the new reason `video-off` (`RealtimeAvatarUnavailableReason`, `ResolveRealtimeAvatar`'s `AvatarPicked`), which stands whatever the model renders; the call and mobile notices say "Audio only: this agent's avatar isn't turned on". An older client reads the reason as unknown and says "Audio only: the avatar can't be shown in this call".
- a4b23b7: A call whose mint gives an avatar reason this version doesn't know, such as a newer server's, now says it is audio only instead of showing no notice. `ParseRealtimeAvatarStatus` keeps such a status without the reason and marks it `ReasonUnknown` (`ParsedRealtimeAvatarStatus`); a reason that isn't text still reads as no status. The runtime's notice then has no `Reason` (`RealtimeAvatarNotice.Reason` is optional), and the call overlay and the mobile voice screen say "Audio only: the avatar can't be shown in this call" (`AVATAR_NOTICE_CALL_UNKNOWN_REASON_TEXT` in `ng-realtime-media`, with a copy in the mobile app). `AvatarNoticeText` gives a `null` reason that line without `NameAgent` and the meeting's `AVATAR_NOTICE_UNKNOWN_REASON_TEXT` with it, so the meeting room reads as before. A host words it with `unknown` in the call overlay's `AvatarNoticeLabels`, as in the meeting room.
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

- f325baa: Fix (#5153): realtime voice-session recordings on PCM-playback drivers (Gemini Live, ElevenLabs Agents, AssemblyAI, xAI Grok Voice, HuggingFace) contained only the participant's microphone — the agent's turns were digital silence — because the agent audio played through `RealtimePcmPlayback`'s own AudioContext straight to the speakers and was never exposed as a stream the recorder could mix.

  ai-realtime-client: `RealtimePcmPlayback` now also feeds its master gain into a `MediaStreamAudioDestinationNode` exposed by `GetOutputStream()`; every PCM driver publishes it through `GetRemoteMediaStream()` / `OnRemoteMediaStream()`. The remote-stream slot (stream + subscribers + isolated fan-out + per-session reset) moved into `BaseRealtimeClient`, replacing two copies in the OpenAI WebRTC drivers; both methods are now concrete on the base (returning `null` / never firing when a driver has no agent-audio plane), so `?.` call sites keep working.

  ng-conversations: `RealtimeAudioRecorder` keeps recording mic-only (with a warning) when the agent stream cannot be connected — e.g. a browser that refuses a cross-sample-rate MediaStream source — instead of losing the whole recording. It also closes its AudioContext, and wires no microphone, when the call ends while the recorder is still starting (the context is resuming or the capture worklet is loading); before, that context was left open.

  ai: `RealtimeDiagLog` no longer throws `ReferenceError: process is not defined` in the browser. Gemini Live's transport close and error handlers call it first, so an abnormal provider close or a transport error used to throw before the fatal error was emitted, leaving the call stuck in 'listening'. It now returns silently when there is no `process` (diagnostics stay off), and the handlers surface the error.

- dbc3462: The realtime picker marks the voices that come with an avatar. `GetRealtimeModelVoices` lists one voice per persona, keyed by `PersonaID`, so two personas that share a voice (a voice, and the same voice with a face) both list. A persona voice also carries the `APIName` of the same persona's preset Video binding on the model's vendor (`AvatarID`) and the persona's `PreviewImageURL`; a binding on another vendor or a custom avatar doesn't count, and a voice only the driver declares carries none of the three. A driver voice is now left out only when a persona offers the same voice without a face, so a voice stays pickable without its face. The GraphQL voice option (`RealtimeVoiceOptionResult`) and the client's `RealtimeVoiceOption` carry the three as nullable fields, and the client selects them. For holders of `Realtime: Advanced Session Controls`, the picker's voice list is now an `mj-dropdown` with one option per persona: a camera icon on voices with an avatar, the persona's preview image when it has one, and a hint under the list ("Comes with an avatar") when the picked voice has a face. A pick sends the voice id, plus the avatar (`RealtimeAgentPick.PreferredAvatarId`) when the persona has a face; the override envelope from both builders (`BuildRealtimeConfigOverridesJson`, `BuildRealtimeOverridesJson`) carries it as `realtime.video.avatarId`. The session asks for that face only when the voiced agent's own video setting is on and it names a Video binding on the vendor it resolves. The meeting room's voice lists (the add-agent list in `mj-livekit-agent-room` and the pre-join list on the Meet page) also key their options by persona, so two personas sharing a voice no longer collide and only the picked one shows picked; either still sends the voice id (`AddVoiceOption`, `SelectedVoiceOption`).
- 4fb501e: In a realtime call, the camera's self-view says "Agent can see this" only while the model is being sent the camera's frames (#5373). It used to show whenever the camera was on and the Camera channel allowed pixels. On a model that takes one video stream, a screen share started after the camera is what the model is sent, so the badge stayed on while the "Agent can see" chip said "Agent sees: Shared screen". The badge now also needs the camera's source among the session's video sources to be on and active, which is what the chip reads, and it comes back when the user picks the camera. A channel's context gains `VideoSources$` (the runtime's `VideoSources$`), and `REALTIME_CAPTURE_SOURCE_IDS` names the camera's and the screen share's sources (`capture:camera`, `capture:screen`). A host whose channel context has no `VideoSources$` keeps the previous rule.
- c388714: The "Agent can see" chip lets the user pick which source the agent sees when more are on than it sees. Its summary names the source the agent actually sees ("Agent sees: Camera", "Agent sees 2 of 3 sources") instead of counting the sources that are on. Each source that is on but not seen gets a "Show" button, the picked one reads "Viewing now, your pick", and "Let the call choose" clears the pick. The chip raises `SourcePicked` (an id, or `null`), which the call overlay passes to the session's `SelectVideoSource`.
- 5a5f8d5: Captions run over the agent's video. While the avatar presents in the call's hero, turning captions on keeps the hero and shows the newest caption, two lines at most (one in a small tile), over the video's lower third, with the user's marked "You". "Show the conversation" still opens the thread, and without the agent's video captions open the thread as before. The captions are hidden from assistive technology; the thread is the accessible transcript.
- ae78a45: The call's orb stands in for the agent's video. The hero's orb becomes a component, `mj-realtime-agent-orb` (the orb, its sound-wave rings, its turn states and its reactions to the overlay's audio meter, sized by `--mj-realtime-orb-size`), and the hero renders it as before. `mj-media-tile` takes content marked `mjMediaTilePlaceholder` in place of the participant's picture or initials. The Avatar channel's surface puts the orb there, so until the agent's video sends its first frame, and after a second without one, the tile shows the orb, sized to the tile and following the agent's turn. A channel's context gains `ConnectionState$` (the call's state), which the Avatar channel passes to its surface.
- b2f8b5b: The agent's video shows in the agent's place in the call rather than in the focus layout. `BaseRealtimeChannelClient.ShowsAgentVideo` (new) says whether a channel shows the agent's video (it sinks outbound video); the runtime uses it to mark that channel as used when the video arrives. `mj-media-stage` gains `StageSlot`: a stage surface covers that element instead of filling the stage, followed as it moves and resizes, and out of sight while it has no size. The call overlay gives the stage that slot while a channel that shows the agent's video holds the stage: in the hero it takes the orb's place, in the console it is a compact tile above the thread, and the surface carries its own "Move to…" menu. Any other surface on the stage is the focus layout as before. The agent's first video gives its channel a tab without opening the panel.
- 4cff918: The avatar's tile says what the agent is doing. `mj-media-tile` gains `Status`, a short status it shows as a chip after its own labels. The Avatar channel's surface sets it from the call's state (Speaking, Thinking, Listening, Connecting, Connection error), and frames the tile with a ring while the agent speaks, which follows the agent's voice where the call overlay meters it. While the avatar presents in the hero, the hero's own name and state line give way to the tile, and the hero's live region keeps the state for screen readers.
- dcfdda4: A realtime call says when no microphone works, and a pick in the device menu brings the microphone back (#5406). When the microphone in use fails and the fallback to the default fails too, or the last microphone goes away, `Microphone$` now carries a `Failure` (`RealtimeMicrophoneState.Failure`, the controller's reason) until a microphone is on again. `SwitchMicrophone` then opens the picked microphone instead of doing nothing: the runtime follows the controller's current microphone stream, so the driver and the call's recording move to the new stream, which keeps the call's mute and becomes the stream that mute and teardown act on. While the call has no microphone track, `ToggleMute` changes nothing and returns the call's mute instead of `false`. The call overlay shows a warning under the banner while no microphone works (the agent can't hear the user; connect a microphone or choose one from the arrow next to the microphone button, or allow it first when the browser blocked it), and it goes once a microphone is on.
- d714f25: A user can switch microphone and camera during a realtime call (#5371). The runtime gains `SwitchMicrophone(deviceId)` beside `SwitchCamera`, through the host's `LocalMediaController.SwitchDevice`: the new track goes into the same stream with the mute carried over, and the driver and the call's recording move to it. `Microphone$` (`RealtimeMicrophoneState`: the microphone in use and the microphones listed, or `REALTIME_MICROPHONE_NONE`) offers it from the moment the call connects until it ends; a host without a controller gets none. `mj-media-controls` gains an optional device chevron on the microphone (`ShowDeviceMenu`, `Devices`, `SelectedMicrophoneID`, `SelectedCameraID`, `DeviceSelected`) that opens `mj-media-device-menu` above the controls with the microphones and cameras; it lists no speakers, and closes from its close button, the chevron, Escape or a click outside. The call overlay offers it in the composer's strip and lean dock (not the typed-input dock, which also has no Share arrow), listing the call's microphones and, while the camera is open, its cameras; a pick switches through the session and emits `ControlInvoked` with the new `'devices'` id. A narrow lean dock tightens its gaps, and wraps if needed, so the chevron fits.
- 989b3d0: The conversations UI's calls check the camera before the agent sees it. The first time the user turns the camera on in a call, a card over the call ("Check your camera") shows it mirrored, with the cameras to choose from. "Turn on camera" lets the agent see it; "Not now", the close button or Escape turns it off, and declines the agent's request when it asked. `mj-camera-check` gains `ShowControls`, no heading when `Heading` is empty, and a way out (`CancelLabel`, `Cancelled`); given cameras only and no microphone level, it checks the camera alone.
- 891dc77: Realtime drivers can follow a replaced microphone track mid-call. `BaseRealtimeClient` gains the optional `ReplaceMicrophone(micStream)` (driver obligation #10), and every browser driver implements it: the OpenAI WebRTC drivers move their senders with `replaceTrack`, and the PCM-capture drivers (Gemini, ElevenLabs, AssemblyAI, xAI, Hugging Face) rebind the shared capture through the new `IPcmMicCapture.Rebind`. Each rebuilds its input meter on the new track. `IRealtimePeerConnection.addTrack` now returns the sender (`IRealtimeRtpSender`), as the platform API does. `LocalMediaController` keeps a muted microphone muted across a device switch or a lost device. The session recorder gains an optional `ReplaceMicrophone` on `IRealtimeSessionRecorder`, implemented by the browser recorder. The runtime starts calling these when its microphone moves onto the controller.
- 0a952ee: The realtime call overlay's composer shows Camera and Share whenever the call offers them, in all three layouts. A call offers a capture while it is connected, the model takes inbound video (`BaseRealtimeClient.SupportsInboundVideo`, new), the host can open it, and its channel's policy admits it; the runtime publishes this as `CaptureOffers$` (new). The buttons follow `Captures$` and call `StartCamera` / `StopCamera` / `StartScreenShare` (offering the kind of surface picked in the Share menu first) / `StopScreenShare`. The camera is optional in an agent call, so it is neutral while off and filled while on: `mj-media-controls` gains `CameraOptional` for this, and the LiveKit room keeps its red. In the fused dock the Share arrow is left out for room, and on a narrow composer the strip wraps onto a second row and the dock puts its text box on a row of its own (a container query on the composer's width). `RealtimeControlId` gains `camera` and `share`.
- ee81865: The realtime call overlay's controls are now the design system's. In all three of the composer's layouts (the lean dock, the labelled phone-call strip and the fused dock), the microphone is `mj-media-controls`, the call controls the LiveKit room uses, and Captions, Details, Type, the "•••" overflow, hide and End are `mjButton` circles: 52 px in the strip and for the lean dock's microphone and End, 44 px for the lean dock's other controls, 32 px in the fused dock. Captions and Details use the button's own toggle (`Toggleable` / `Selected`, which sets `aria-pressed`). A muted microphone now reads red, as in the room, where it was amber. `mj-media-controls` gains `Size` (its circles' size; the Share arrow stays small) and `ShowLabels` (a short label under each control, which the strip uses).
- a70af2d: The realtime voice picker's "Voice" label and the Realtime Recordings list's audio-only sessions now show their icon. Both used `fa-waveform-lines`, which only Font Awesome Pro has; Explorer loads Font Awesome Free, so the icon rendered blank. Both now use `fa-wave-square`, the wave icon in Font Awesome Free. A unit test in each package fails when a realtime template or component uses an `fa-*` class that Font Awesome Free's stylesheet has no rule for; `@fortawesome/fontawesome-free` 6.7.2, the version the realtime widget vendors, becomes a devDependency of both packages for it.
- 84fc9d4: The realtime overlay's channel surfaces can be moved. "Move to…", beside the active channel tab (and in the call pill while a surface is on the stage), puts a surface on the stage, back on its tab, or out of sight, and "Reset layout" puts every surface back. A surface on the stage is the focus layout: the call column folds away and the pill appears. A channel whose surface is elsewhere says where in its tab, with "Bring it here". Moves are saved per user (`mj.realtime.placement.v1`, through `UserInfoEngine`) and carry over to later sessions.

  `BaseRealtimeChannelClient` gains an optional `OnSurfacePlacementChange(placement)` hook, called right after `BindSurface` with the surface's placement and then on every move. `mj-media-stage` gives each surface's template its `Placement`, and `mj-realtime-channel-pane` passes it on. The whiteboard's header button becomes "Move to stage", or "Back to tab" while the board is on the stage, kept true by the new hook.

- 038f7dc: A call's side panel keeps the user's collapse through a window resize, and comes back at the right width tier. When the call got narrower than the console breakpoint and wider again, the panel was created again expanded although the user had collapsed it and only resized; it now comes back collapsed to its strip. It still comes back expanded after Details, a channel on the stage or a reviewed session turning into a live call, which ask to see the panel, including when one of those happens while the call is too narrow for the panel. `RealtimeSurfaceTabsComponent.Collapsed` is now an input the overlay binds, so a new panel starts as the user left the old one, and `ResolvedRealtimeUi` gains `SurfacePanelWaitsForRoom` (the panel is hidden only for lack of room). Separately, a panel created again on its Activity tab (the channel whose tab was focused left the call while the panel was away) kept the wide width; the overlay now takes the width tier from the tab the panel lands on.
- 87babe6: A call's side panel comes back expanded, at its usual width, after the panel area hides while the panel is collapsed to its strip. The panel area hides when a channel's surface takes the stage, when the call gets narrower than the console breakpoint, when the Details control closes it, and when a reviewed session becomes a live call. The panel is created again each time it comes back, and a new panel starts expanded, but the overlay kept the collapsed state the old panel had reported (`RealtimeSessionOverlayComponent.PanelCollapsed`) and sized the new panel as the 40 px strip, with no resize handle. The overlay now sets `PanelCollapsed` back to `false` when the panel goes away, so the panel's width, its resize handle and what it shows agree when it returns.
- 54cd610: Realtime channel surfaces can go picture-in-picture. "Move to…" gains "Picture-in-picture": the surface floats in a box over the call that the user drags by its bar, resizes from its corner, or moves with the arrow keys (Shift and the arrow keys resize it). Boxes stack upward from the bottom-right corner, newest in the corner, until moved; the one touched last floats highest. A box's bar carries the same "Move to…" menu, and its channel's tab says where it went, with "Bring it here".

  `mj-media-stage` adds the `pip` placement, `PipRects` (where the user put each box, as fractions of the stage), `PipRectChange`, and an `mjMediaStagePipActions` template for the bar's buttons; `MediaStageSurface` gains `Label` and `PipIndex`. The geometry helpers (`DefaultPipBox`, `ClampPipBox`, `MovePipBox`, `ResizePipBox`, `PipBoxToRect`, `PipRectToBox`) are exported. The overlay saves each box per user under `mj.realtime.pip.v1`, and "Reset layout" puts every box back in its corner.

- 1bed7f7: A call's picture-in-picture boxes (the camera, a shared screen) start clear of the call's controls. The call overlay's stage paints over the whole call, controls included, and a box the user has not moved started in the stage's bottom-right corner, so with no side panel open the camera's box covered End call and the controls beside it until the user moved it. `mj-media-stage` gains `PipKeepClear`, an element along the stage's foot that the default boxes start clear of: while the box in the corner would cover any of it, the boxes stack upward from just above it. `DefaultPipBox` takes that element's box as an optional third argument. The call overlay wraps the "Agent can see" chip, the channel strip and the composer in `.call-controls` and passes it to the stage. A box the user moved keeps its saved place, and with the side panel open beside the controls the box keeps its corner over the panel.
- 6328ed3: Realtime call recordings are no longer _silently_ lost when the tab is closed right after End (#5195): the session is left `Closed` and the browser warns before the tab closes. Teardown now closes the session before it uploads the recording, so a tab closed mid-upload leaves the session `Closed` instead of open, and a driver `Disconnect()` that throws no longer skips the close.

  The runtime exposes `SavingRecording$` / `IsSavingRecording`, and `RealtimeSessionService` uses it to show the browser's "Leave site?" prompt while the recording is still uploading (desktop browsers only).

- b6b3990: `RealtimeSessionRuntime` can show the agent the user's camera and a shared screen: `StartCamera(deviceId?)`, `StopCamera()`, `StartScreenShare(options?)` and `StopScreenShare()`, with both reported on `Captures$` (off, starting, on with the stream to show the user, or failed with the reason and a message). A start first makes sure the model takes video, adding the inbound video track only now (`AddTrack`), so a session is not limited or billed for video before anyone shares; then it opens the camera through the host's `ILocalMediaController`, or asks for a screen, window or tab through the host's new optional `IRealtimeMediaHost.RequestDisplayCapture`. The capture becomes a source of the video source arbiter, sampled at the negotiated rate. Stopping undoes it all, and removes the track again when the runtime added it and nothing else is captured; a camera that goes away or a share ended from the browser's bar stops the same way, and the session's end stops both. The browser host implements `RequestDisplayCapture`. No UI uses this yet.
- 20d1f4a: A realtime call keeps going when the microphone changes. `IRealtimeMediaHost` gains an optional `CreateLocalMediaController()`, and the browser host returns a `LocalMediaController`. When a host offers one, the runtime starts the microphone through it instead of `AcquireMicrophone`, moves the driver and the recorder onto the new track when the controller swaps one in (a device switch, or a lost headset replaced by the default), and disposes it at teardown. A failed start keeps the `getUserMedia` error names (`NotAllowedError`, `NotFoundError`, …), so hosts that tell a denied microphone apart work unchanged. A start the host abandoned while the microphone was opening now unwinds without reporting an error. `/media` exports the `ILocalMediaController` interface, which `LocalMediaController` implements, so other hosts and tests can supply their own.
- 6a19f78: A call's Share menu offers "This panel ▸", listing the panels of the page that are on screen: the call's Whiteboard and Explorer's main content ("Main content"). Picking one shares that element alone. A new `[mjSharePanel]="<label>"` directive (with `mjSharePanelIcon`) in `ng-realtime-media` marks a shareable region and registers it with the app's `SharePanelRegistry`, whose `PanelsFor$(host)` lists the panels whose box overlaps the viewport, in page order, leaving out any panel that holds the call itself, and nothing where the browser cannot share a single panel (`Supported`: `getDisplayMedia` plus Element or Region Capture, so Chrome and Edge on the desktop). Registry changes reach its streams in a microtask. A channel opts its call surface in with `BaseRealtimeChannelClient.SurfaceShareable` (default `false`; the Whiteboard channel returns `true`), and the Explorer shell marks `mj-tab-container#mj-main-content`, so `ng-explorer-core` now depends on `ng-realtime-media`. The call overlay passes the list to the composer's Share menus (`RealtimeComposerComponent.SharePanels`), starts `StartScreenShare({ Panel, PanelLabel })` for a pick, and stops the share when the shared panel goes away; a panel only out of sight keeps its share. In `/media`, a panel share now uses Element Capture wherever the browser has it (Chromium 132+), giving the panel `isolation: isolate` inline for the share and its own value back when the share ends, and Region Capture otherwise; `DisplayCaptureOptions.PanelLabel` names the panel and `DisplayCapture.PanelLabel` carries the name. The runtime's share state carries it (`RealtimeCaptureState.PanelLabel`), the agent sees the share as "Whiteboard (shared panel)" in the "Agent can see" chip and its switch note, and `mj-share-preview` reads "Sharing a panel: Whiteboard" (`SharePreviewComponent.PanelLabel`). The Screen Share channel's state still reports `surface: 'tab'`.
- e402de5: Adds the meter smoothing every audio display shares to `@memberjunction/ai-realtime-client/media`: `GateAudioLevel`, `SmoothAudioLevel`, `SmoothAudioBars`, `SynthesizeAudioBars`, and `AudioLevelSmoother`, which smooths one source's level and bars (from its spectrum, or synthesized from the level when it has none). The call overlay's `RealtimeAudioVisualSmoother` in `@memberjunction/ng-conversations` now uses them and produces the same frames as before. Its `GateLevel` and `SmoothLevel` exports are deprecated in favor of the `/media` functions.
- 74d9357: The realtime overlay's channel surfaces (whiteboard, remote browser, media, interactive component) move onto one stage over the call, so they are no longer destroyed and recreated. Focus mode fills the stage with the focused surface: before, it removed the surface panel along with the whiteboard, leaving the call empty. Collapsing or hiding the panel and switching tabs now only hide a surface, so a board keeps its view and a stream keeps playing. A surface is created the first time it is shown and kept until its channel leaves the session; focus also ends when its channel leaves.

  `ng-realtime-media` adds `mj-media-stage` (`MediaStageComponent` with `MediaStageSurfaceDirective`): it shows each surface filling the stage, over a tab slot it follows as the panel resizes or slides, or out of sight, without moving it in the DOM. In `ng-conversations`, a plugin channel's tab pane keeps a slot (`RealtimeSurfaceTabsComponent.ChannelSlotChange`), `RealtimeSurfaceStageModel` decides which surfaces exist and where, and `mj-realtime-channel-pane` follows a new plugin instance by rebinding. The focus pill's exit now restores the panel even for a channel that does not leave focus itself. The channel contract docs in `realtime-runtime` and `ng-realtime-channels` describe the new surface lifecycle.

- a5b4a72: Realtime channels now hear when their surface goes out of sight and comes back, so they can pause work nobody sees. `BaseRealtimeChannelClient.OnSurfaceVisibilityChange(visible)` is a new optional hook (a no-op by default): the host calls it right after `BindSurface` with the surface's current visibility, then on every change. In the realtime overlay a surface is out of sight when the panel is collapsed or hidden, another tab is active, or the call is minimized.

  `mj-media-stage` gives each surface's template whether it is on screen (`Visible` in `MediaStageSurfaceContext`), and counts every surface out of sight while the stage itself has no size. `mj-realtime-channel-pane` takes `Visible` and tells its plugin. The remote browser is the first user: its snapshot poll pauses out of sight and polls again at once when shown, while the pushed screencast and the audio keep running.

- eee025e: A video that stops sending frames gives way to its placeholder. `mj-media-tile` gains `StallAfterMs`: until the video's first frame, and once no frame has come for that long, the video fades out (it stays attached) and the participant's picture or initials fade in, until frames come back; the "AI-generated video" label shows only while the avatar's video does. The tile watches its own `<video>` element through `VideoFrameWatch` (new), which uses `requestVideoFrameCallback` where the browser has it and the moving playback position otherwise, outside Angular's zone. The Avatar channel's surface waits about a second (plan section 5) before it shows the agent's initials.
- afe9eb4: A relayed call (Gemini Enterprise) that reaches its 30-minute cap, or its shorter `MaxSessionSeconds`, now ends with its own message instead of a connection error. MJAPI's relay closes the browser leg with `REALTIME_RELAY_TIME_LIMIT_CLOSE_CODE` (4000, "Call time limit reached"; the upstream still gets 1000). `GeminiRealtimeClient` ends the call on that code with a fatal error whose `Code` is `REALTIME_CLIENT_TIME_LIMIT_ERROR_CODE` (`'time-limit'`), without trying to resume. `RealtimeSessionRuntime.LastSessionError` keeps the call's fatal client error until the next start, and `DescribeCallEnd` words a time-limit end (`REALTIME_CALL_TIME_LIMIT_END`): the call bar and the audio hero say "Time limit reached" (`RealtimeAgentBannerComponent.ErrorLabel`), and the widget (`mj-error` code `time-limit`) and the phone's error screen say "This call reached its time limit. Start a new call to keep talking." The avatar tile's state chip still says "Connection error".
- 0a3a56a: `MediaLayoutPrefs` in `@memberjunction/ai-realtime-client/media` reads and saves a host's layout (its moves and picture-in-picture boxes) in a per-user settings store under the host's own keys. MJ's `UserInfoEngine` is such a store (`MediaLayoutSettings`). A store that is not ready reads as nothing saved and is skipped when writing, and a saved layout keeps the newest `MEDIA_LAYOUT_SAVED_LIMIT` (50) moves and boxes. `RecordPipRect` keeps the boxes the user moved most recently last. The realtime call saves its layout through them, under its existing keys, with nothing changing on screen; the meeting room's MJ host is next.
- 7a08dc1: The realtime call and the meeting room keep and save the user's layout through one shared set of helpers in `@memberjunction/ai-realtime-client/media`: `RecordPlacementMove` and `WithoutStageMoves` keep the moves, `ParsePlacementMoves` / `SerializePlacementMoves` and `ParsePipRects` / `SerializePipRects` give their saved form, and `MediaPipRect` is the saved picture-in-picture box. `ParticipantTileKey`, `ParticipantTileSurface` and `StageParticipantIdentity` let any host show participants as movable tiles, as the meeting room now does through them. Nothing changes on screen.

  Removed, since no release shipped them: the call's own copies of these helpers (`ParseSurfacePlacementPref`, `SerializeSurfacePlacementPref`, `RecordSurfaceMove`, `ParseSurfacePipPref`, `SerializeSurfacePipPref`) and the deprecated `mj-realtime-surface-move-menu` / `RealtimeSurfaceMove` from `@memberjunction/ng-conversations`, and `MediaPipRect` from `@memberjunction/ng-realtime-media`. The call's setting keys (`SURFACE_PLACEMENT_PREF_KEY`, `SURFACE_PIP_PREF_KEY`) stay.

- 005612e: The "Move to…" menu moves into `@memberjunction/ng-realtime-media` as `mj-media-move-menu` (`MediaMoveMenuComponent`, with `MediaMoveRequest` and `MEDIA_MOVE_LABELS`), so the realtime call and the meeting room share one menu. It lists the places a surface may go (stage, picture-in-picture, tab, hidden), the current one disabled, then "Reset layout"; a host can name its places with `Labels` (the room will call the stage "Spotlight"), and each place keeps its icon. The call overlay and its tab strip use it, with no visible change. `mj-realtime-surface-move-menu` (`RealtimeSurfaceMoveMenuComponent`) and `RealtimeSurfaceMove` in `@memberjunction/ng-conversations` are deprecated; the component is now a wrapper around the shared menu with the same inputs and outputs.
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

- e8258a1: `@memberjunction/global` gains set-based UUID helpers, so matching one list against another no longer means a nested `UUIDsEqual` scan (#4719).
  - **Collections:** `UUIDSet` and `UUIDMap` normalize on every insert and lookup, so upper-case and lower-case IDs match without anyone having to remember `NormalizeUUID` on both sides.
  - **Helpers:** `FilterByUUIDs`, `ExcludeByUUIDs`, `CountByUUID` and `IndexByUUID` cover keeping matches, dropping matches, counting per ID and looking up by ID in one linear pass. Each takes an optional ID selector.
  - **Faster `UUIDsEqual`:** it now compares without allocating. It produces exactly the old result, falling back to the old path for non-ASCII input.
  - **New guard:** the UUID compliance scan fails on new nested `UUIDsEqual` scans. The check is AST-based, and a per-file baseline records the sites that predate it.
  - **Adopted:** the sites fixed in #4716 now use the helpers.
  - **Guide:** `guides/UUID_COMPARISON_GUIDE.md` Patterns 5 and 8 are rewritten around the new API.

- Updated dependencies [96d6ec2]
- Updated dependencies [a709bb6]
- Updated dependencies [d17de94]
- Updated dependencies [c8409ce]
- Updated dependencies [7ada797]
- Updated dependencies [51c469d]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [e4c355e]
- Updated dependencies [4412e85]
- Updated dependencies [6dce70c]
- Updated dependencies [8c157aa]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [822ed69]
- Updated dependencies [1da00cb]
- Updated dependencies [b699a37]
- Updated dependencies [0dbd455]
- Updated dependencies [dde482c]
- Updated dependencies [a4b23b7]
- Updated dependencies [676f0dc]
- Updated dependencies [49f26d9]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [6a1a7b6]
- Updated dependencies [1dc0681]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [bb3028a]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [490cd8d]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
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
- Updated dependencies [ae0a662]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [318084b]
- Updated dependencies [69bf67c]
- Updated dependencies [97a85b9]
- Updated dependencies [efe4738]
- Updated dependencies [1403d04]
- Updated dependencies [8bac4d6]
- Updated dependencies [08b3d7b]
- Updated dependencies [dbc3462]
- Updated dependencies [d9da1ad]
- Updated dependencies [1c9ac95]
- Updated dependencies [c5472d2]
- Updated dependencies [4fb501e]
- Updated dependencies [2de7fe0]
- Updated dependencies [5a3de97]
- Updated dependencies [0d0ba18]
- Updated dependencies [666d078]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [ae78a45]
- Updated dependencies [8704df6]
- Updated dependencies [b2f8b5b]
- Updated dependencies [4cff918]
- Updated dependencies [5345e3d]
- Updated dependencies [dcfdda4]
- Updated dependencies [d714f25]
- Updated dependencies [989b3d0]
- Updated dependencies [a35b50f]
- Updated dependencies [368ce6d]
- Updated dependencies [3e7f8c8]
- Updated dependencies [4889ca0]
- Updated dependencies [ca2791b]
- Updated dependencies [1ea4085]
- Updated dependencies [975948b]
- Updated dependencies [22c9074]
- Updated dependencies [88b85fc]
- Updated dependencies [7f243eb]
- Updated dependencies [a3fcce8]
- Updated dependencies [a08ed58]
- Updated dependencies [2bc4677]
- Updated dependencies [42f8016]
- Updated dependencies [6b587b3]
- Updated dependencies [891dc77]
- Updated dependencies [98dbb78]
- Updated dependencies [0a952ee]
- Updated dependencies [ee81865]
- Updated dependencies [72827e6]
- Updated dependencies [aee2d53]
- Updated dependencies [5dc3752]
- Updated dependencies [18c66ce]
- Updated dependencies [5e1e343]
- Updated dependencies [84fc9d4]
- Updated dependencies [54cd610]
- Updated dependencies [1bed7f7]
- Updated dependencies [6328ed3]
- Updated dependencies [b3db2aa]
- Updated dependencies [6c8798b]
- Updated dependencies [b6b3990]
- Updated dependencies [20d1f4a]
- Updated dependencies [f1fb411]
- Updated dependencies [f0c78c3]
- Updated dependencies [6a19f78]
- Updated dependencies [e402de5]
- Updated dependencies [74d9357]
- Updated dependencies [a5b4a72]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d0df5a1]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [44428b5]
- Updated dependencies [1b8791e]
- Updated dependencies [eee025e]
- Updated dependencies [02bb563]
- Updated dependencies [c26b355]
- Updated dependencies [afe9eb4]
- Updated dependencies [90829e3]
- Updated dependencies [d09f068]
- Updated dependencies [161b7bc]
- Updated dependencies [c9e1891]
- Updated dependencies [aac148b]
- Updated dependencies [d2cb42e]
- Updated dependencies [0a3a56a]
- Updated dependencies [7a08dc1]
- Updated dependencies [005612e]
- Updated dependencies [cf50330]
- Updated dependencies [cbddadb]
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
- Updated dependencies [f00d5fc]
- Updated dependencies [6b487b8]
- Updated dependencies [7d4906b]
  - @memberjunction/ai-core-plus@6.2.0-edge.4
  - @memberjunction/ng-composer@6.2.0-edge.4
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/ai-engine-base@6.2.0-edge.4
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/graphql-dataprovider@6.2.0-edge.4
  - @memberjunction/ai-realtime-client@6.2.0-edge.4
  - @memberjunction/ng-realtime-media@6.2.0-edge.4
  - @memberjunction/realtime-runtime@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/ng-base-forms@6.2.0-edge.4
  - @memberjunction/ng-artifacts@6.2.0-edge.4
  - @memberjunction/ai-agent-client@6.2.0-edge.4
  - @memberjunction/ng-shared-generic@6.2.0-edge.4
  - @memberjunction/ng-ui-components@6.2.0-edge.4
  - @memberjunction/ng-markdown@6.2.0-edge.4
  - @memberjunction/conversations-runtime@6.2.0-edge.4
  - @memberjunction/ng-realtime-channels@6.2.0-edge.4
  - @memberjunction/ng-react@6.2.0-edge.4
  - @memberjunction/ng-whiteboard@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/ng-forms@6.2.0-edge.4
  - @memberjunction/ng-task-graph-editor@6.2.0-edge.4
  - @memberjunction/ng-tasks@6.2.0-edge.4
  - @memberjunction/ng-user-routines@6.2.0-edge.4
  - @memberjunction/ng-testing@6.2.0-edge.4
  - @memberjunction/ng-base-types@6.2.0-edge.4
  - @memberjunction/ng-code-editor@6.2.0-edge.4
  - @memberjunction/ng-notifications@6.2.0-edge.4
  - @memberjunction/ng-resource-permissions@6.2.0-edge.4
  - @memberjunction/ng-media-player@6.2.0-edge.4
  - @memberjunction/ng-container-directives@6.2.0-edge.4
  - @memberjunction/interactive-component-types@6.2.0-edge.4
  - @memberjunction/ng-agent-client@6.2.0-edge.4

## 6.2.0-edge.3

### Minor Changes

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

- 5037000: fix(conversations): render a streamed reply in place. A streamed delta no longer replaces the messages array (which rebuilt the whole timeline and armed a scroll-to-bottom timer on every delta); the bubble is refreshed through a new `MessageStreamed` output and `MessageListComponent.RefreshRenderedMessage`, coalesced to one render per animation frame. With `ReadReplyFromTop` the turn lands at its top once, on the first delta, and completion no longer lands it again. The in-progress bubble's 150px status-line cap is lifted while streamed text is shown.
- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [279b93e]
- Updated dependencies [5acbec6]
- Updated dependencies [50a2cf6]
- Updated dependencies [66fd011]
- Updated dependencies [f41442f]
- Updated dependencies [196160a]
- Updated dependencies [bea2386]
- Updated dependencies [d046715]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [72e082b]
- Updated dependencies [28c92e0]
- Updated dependencies [d0a8dbf]
- Updated dependencies [ec97ad4]
- Updated dependencies [b1b6d3d]
- Updated dependencies [49e0bd8]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/graphql-dataprovider@6.2.0-edge.3
  - @memberjunction/ai-engine-base@6.2.0-edge.3
  - @memberjunction/ai-realtime-client@6.2.0-edge.3
  - @memberjunction/realtime-runtime@6.2.0-edge.3
  - @memberjunction/ng-base-forms@6.2.0-edge.3
  - @memberjunction/ai-core-plus@6.2.0-edge.3
  - @memberjunction/interactive-component-types@6.2.0-edge.3
  - @memberjunction/ng-artifacts@6.2.0-edge.3
  - @memberjunction/ng-ui-components@6.2.0-edge.3
  - @memberjunction/ng-testing@6.2.0-edge.3
  - @memberjunction/ng-base-types@6.2.0-edge.3
  - @memberjunction/ng-code-editor@6.2.0-edge.3
  - @memberjunction/ng-notifications@6.2.0-edge.3
  - @memberjunction/ng-resource-permissions@6.2.0-edge.3
  - @memberjunction/ng-shared-generic@6.2.0-edge.3
  - @memberjunction/ng-task-graph-editor@6.2.0-edge.3
  - @memberjunction/ng-tasks@6.2.0-edge.3
  - @memberjunction/ng-user-routines@6.2.0-edge.3
  - @memberjunction/conversations-runtime@6.2.0-edge.3
  - @memberjunction/ai-agent-client@6.2.0-edge.3
  - @memberjunction/ng-agent-client@6.2.0-edge.3
  - @memberjunction/ng-composer@6.2.0-edge.3
  - @memberjunction/ng-container-directives@6.2.0-edge.3
  - @memberjunction/ng-whiteboard@6.2.0-edge.3
  - @memberjunction/ng-media-player@6.2.0-edge.3
  - @memberjunction/ng-forms@6.2.0-edge.3
  - @memberjunction/ng-markdown@6.2.0-edge.3

## 6.2.0-edge.2

### Minor Changes

- 28fdf22: Add a `Decision Eval` test type that measures typed decisions against labels inside MJ's test harness, with a suite generator and a scorecard for agreement, repeatability and calibration. The conversation-routing decision's builders (and `IsAgentAllowed`) move from `@memberjunction/ng-conversations` to `@memberjunction/ai-core-plus`, so the chat and the harness build the decision with the same code; import them from there.
- 369e229: Developer can create and update MJ: Row Level Security Filters. Sync push reloads metadata inside its transaction. An IS-A parent's delete returns, a new record does not load a missing child row, the GraphQL provider does not send a second delete, and a parent built by its child stays linked. The chat area accepts ReadOnly. A dialog manages its focus, names itself when it has no title, and leaves Tab inside a modal or an open dropdown or calendar above it. Tab that a dropdown or calendar hands back at the first or last stop wraps inside the dialog, and a dialog that does not trap focus does not let the dialog under it take the page's Tab. A host publishes an in-progress agent turn's live status through AgentRunStatusPublisher, including the completion when a background run fails before it has a run. A reply that finishes before the chat shows it completes without loading the conversation again.

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

- 75d4e8c: Add an opt-in `EnableDecisionRouting` input to the chat area: an untagged message can ask one fast typed decision which agent in the conversation should answer it, and which artifact version it modifies, instead of always going back to the last agent. Only agents in the person's '@' list (the ones they may run) are offered. It is off by default, and any error, slow answer (over 250 ms) or unsure answer keeps today's routing; a routed turn carries the new `DecisionRouted` route. A host `AgentTurnHandler` receives the artifact version the decision named as the new `AgentTurnRequest.TargetArtifactVersionId`.
- f3c6161: Conversation routing acts on calibrated probabilities (plan Task 2.4). `ApplyPlattCalibration` and `PlattCalibration` in `@memberjunction/ai` map a decision model's raw probability to a calibrated one. Routing calibrates the thread Likelihood only for the exact model each fit was made on (`ROUTING_CONTINUES_CALIBRATION`: Jev at `typesafe/jev-1.13-20260917`, and LLM Decision when GPT-OSS-120B answered, fitted by the Phase 2 Decision Eval), and treats any other model's answer as unsure. `FindDecisionCalibration` in `@memberjunction/ai-core-plus` looks a calibration up by the decision model and the model behind it, for any consumer that calibrates. The `RunDecision` mutation and `GraphQLAIClient.RunDecision` return that model as `resolvedModel` / `ResolvedModel`. Routing waits 350 ms instead of 250 ms, which covers about 95% of Jev's answers in-process. The Decision Eval records production's routing verdict with the model that answered and the policy it was reached under, and its scorecard scores that verdict end to end, per run.
- ea4080e: fix: an agent completion reaches the conversation even when the WebSocket dies without closing (MJ#4222)

  On an unstable connection, sending a message to an agent left the message spinning forever: status updates stopped, the elapsed timer counted up with no ceiling, and no error appeared. The agent ran fine and its answer persisted; only a refresh revealed it.

  The cause was not a missing timeout but a single point of failure. Five recovery mechanisms — graphql-ws `retryAttempts`, `GraphQLDataProvider._socketStateSubject`, Explorer's `ServerConnectivityService`, `ConversationStreaming.scheduleReconnection()` and `FireAndForgetHelper.onStreamEnd` — were all triggered by the socket `closed` event, and the failure mode is precisely "the socket never closes". They failed together. graphql-ws re-arms its keepalive only on pong receipt, so a half-open socket gets one ping and then permanent silence; its own JSDoc says nothing happens automatically if the server never responds.

  **Transport.** `getOrCreateWSClient()` now arms a pong watchdog on each ping it sends and calls `client.terminate()` if no pong returns, producing a real `4499` close that the existing retry apparatus can act on. Each client owns its own pong timer, and a close from a client that has already been replaced is ignored, so one socket can never terminate or disarm its replacement. `connectionAckWaitTimeout` is set, and `keepAlive` drops to 10s, making detection ~14s in practice instead of never. MJServer passes its `useServer` keepAlive explicitly rather than relying on an invisible library default.

  **Recovery triggers.** New `ConversationLiveness` (L0, no Angular) aggregates socket reconnect, stream re-subscribe, tab-visible and browser-online into one coalesced reconciliation request, throttled leading-edge at 500ms. `ng-conversations` adds a root-provided DOM bridge and `ReconcileNow()`, which refreshes agent runs **before** comparing status — without that the comparison reads the stale in-memory map the outage froze and silently no-ops. The reconciliation path runs over HTTP, so it repairs a message while the socket is still dead.

  **Durable read model.** New `TailConversationEvents` query over existing `AIAgentRunStep` rows — no table, no migration. The cursor never rewinds, events are capped at 200, authorization is delegated to `RunView` as the calling user through the request's read-only provider, and not-found and not-authorized are indistinguishable. Only the columns an event carries are read, never the step's input, output or payload columns. A run `Paused` on a still-running workflow reports `IsInFlight: true`, and a failed call does too, because it knows nothing about the run. `FinalPayload` falls back to the conversation detail's message because `AIAgentRun.Result` is agent-dependent and null on many successful runs; callers must decide terminality from `IsInFlight`/`DetailStatus`, never from its presence. `GraphQLConversationClient` and `ConversationTail` hold a per-message cursor that advances only on a successful read. When the tail call fails, for example a new client against an older server, the client completes a message from its run list as it did before.

  **Cross-instance delivery.** Push-status updates now carry `SourceServerId` and fan out over Redis through a generic `PublishMessage`/`SubscribeToChannel` pair on `RedisLocalStorageProvider`, closing the case where the mutation lands on one replica and the browser's socket on another. Inbound messages are type-checked, then republish onto the local topic and still pass the identity filter, so a replica never decides who sees what. Streaming deltas are deliberately not replicated. Measured: 5 push frames delivered cross-replica with Redis, 0 without — and the message still completed without it, so fan-out is a latency optimization rather than a requirement.

  **Deployment order.** A client deployed before the server gets a failed tail call on every reconcile and falls back to the run list, which cannot see the conversation detail's own status. The liveness pulse (`DEFAULT_PULSE_INTERVAL_MS`, 5 min → 60 s in MJServer) and the client's idle window (`DEFAULT_IDLE_TIMEOUT_MS`, 12 min → 3 min in GraphQLDataProvider) are a matched pair in separate packages. Ship the server first or with the client: a client on the 3-minute window against a server still pulsing every 5 minutes times out on every pulse gap. `DEFAULT_MAX_STALL_RECONCILES` stays at 6, so the give-up horizon moves from roughly 72 minutes to roughly 18.

  **Honest UI.** The message time pill degrades `live → checking → stalled`, with thresholds anchored to the agent watchdog's own 30s heartbeat and 5-minute stale threshold rather than invented values. Silence is measured from the last push frame the browser received for the run or the message, including the server's 60s liveness pulse, and from the run's database timestamps when the run was re-read. Progress frames carry the server's in-memory run, whose timestamps do not move until the run ends, so they cannot be the only signal. A row with no MJ agent run, such as one written by a host's own turn handler, stays live while frames that name it arrive. The database timestamp is bounded by how long the component has been watching, so browser-versus-database clock skew cannot invent a stall. While HTTP works, a dead socket alone does not degrade the pill: each reconcile re-reads the run and its fresh heartbeat. The connectivity banner reports the socket. The pill's one-second timer stops whenever nothing is in flight.

  A quiet pill's request for a re-check goes through the same 500ms coalescing trigger as the transport signals, and only one reconcile pass runs at a time. A request that arrives during a pass shares it and schedules one follow-up, so no request is lost and no message is completed twice.

  Also fixes three defects found by manual testing that unit tests missed, each an instance of the same pattern as the original bug — a mechanism wired to a signal the failure mode suppresses: liveness was computed only in `ngDoCheck`, which `detectChanges()` does not re-invoke; `agentRunMap` was absent from `message-list`'s `ngOnChanges`, so a refreshed heartbeat never reached the rendered bubble; and the reconnection backoff reset on every re-subscribe, which succeeds against a dead socket, pinning the delay at its base value and leaving the escalation inert. The backoff escalates to a 60s ceiling and retries for the life of the page; it has no attempt cap, because no host calls `initialize()` outside `ngOnInit`, so a stream that stopped retrying would stay stopped until a reload. Up to 20% is taken off each delay at random so tabs do not retry in lockstep, and the backoff clears when the socket reports `connected`, which follows the server's acknowledgement, so a quiet healthy stream does not start its next outage at the ceiling.

  Two further defects this surfaced, both fixed here. Explorer's connectivity warning cleared on an HTTP 200 from `/healthcheck`, before the socket was back — reachable over HTTP and able to carry frames are different properties, and a half-open socket satisfies the first while dropping every push. The warning now clears when the socket itself reports `connected`, and a `degraded` flag makes that sticky so the transient `unknown` emitted by the service's own `ForceSocketReconnect()` cannot read as recovery. The one exception is a screen with no active subscription: no socket exists there, so no `connected` can arrive, and an HTTP 200 clears the warning. A subscription opened later against a socket that is still down raises it again.

  And a new `OrphanedConversationDetailReconciler` closes conversation details left `In-Progress` by a run that is already over. `AgentRunner` closes the detail as a run's final step, so a process that dies mid-run never reaches it; the agent-run watchdog repairs the run but nothing repaired the detail, which is the row the chat renders from. It runs at boot and every five minutes, asks only for details that have a finished run so stuck rows cannot fill its 200-row window, waits a grace period so it cannot race a normal completion, skips a detail that something else closed after it was listed, and writes as the conversation's OWNER — `MJConversationDetailEntityExtended.Save()` refuses a non-owner without a resource grant, so a maintenance pass running as the system user is silently rejected, returning false with no `LatestResult` to read. Verified against five real orphaned details aged 42 to 246 minutes: all five closed, none left.

- Updated dependencies [f555162]
- Updated dependencies [043f418]
- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [2552b1e]
- Updated dependencies [5114c10]
- Updated dependencies [660ef45]
- Updated dependencies [21f9e15]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [f3c6161]
- Updated dependencies [5148534]
- Updated dependencies [0adaf76]
- Updated dependencies [5ee02db]
- Updated dependencies [ce1a5c3]
- Updated dependencies [ef43cf3]
- Updated dependencies [ea4080e]
- Updated dependencies [b44c7cf]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [7e57b48]
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
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/ng-artifacts@6.2.0-edge.2
  - @memberjunction/graphql-dataprovider@6.2.0-edge.2
  - @memberjunction/realtime-runtime@6.2.0-edge.2
  - @memberjunction/conversations-runtime@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/ng-testing@6.2.0-edge.2
  - @memberjunction/ai-engine-base@6.2.0-edge.2
  - @memberjunction/ng-composer@6.2.0-edge.2
  - @memberjunction/ng-ui-components@6.2.0-edge.2
  - @memberjunction/ng-forms@6.2.0-edge.2
  - @memberjunction/ng-task-graph-editor@6.2.0-edge.2
  - @memberjunction/ng-tasks@6.2.0-edge.2
  - @memberjunction/ai-agent-client@6.2.0-edge.2
  - @memberjunction/ng-base-types@6.2.0-edge.2
  - @memberjunction/ng-code-editor@6.2.0-edge.2
  - @memberjunction/ng-container-directives@6.2.0-edge.2
  - @memberjunction/ng-media-player@6.2.0-edge.2
  - @memberjunction/ng-notifications@6.2.0-edge.2
  - @memberjunction/ng-resource-permissions@6.2.0-edge.2
  - @memberjunction/ng-shared-generic@6.2.0-edge.2
  - @memberjunction/ng-user-routines@6.2.0-edge.2
  - @memberjunction/interactive-component-types@6.2.0-edge.2
  - @memberjunction/ai-realtime-client@6.2.0-edge.2
  - @memberjunction/ng-agent-client@6.2.0-edge.2
  - @memberjunction/ng-whiteboard@6.2.0-edge.2
  - @memberjunction/ng-markdown@6.2.0-edge.2

## 6.2.0-edge.1

### Minor Changes

- 6b08ebf: `Project.OwnerUserID`: conversation folders can be personal. One additive, nullable column — NULL keeps a folder shared with the environment exactly as today; set, the folder belongs to that user.

  The sidebar and the Assign Project picker list only shared folders plus the user's own, for every user. Server-side, the migration attaches a row-level-security filter (`OwnerUserID IS NULL OR OwnerUserID = '{{UserID}}'`) to the UI role's read permission on `MJ: Projects`, so for a user whose every read grant on the entity is filtered, a personal folder's NAME is unreadable through any reader — `RunView`, the entity browser, the Projects grid on the User form — and not merely absent from the sidebar. Developer and Integration stay unfiltered, and RLS exemption is per user: holding either role lifts the filter. With the seeded permissions those are the only roles that can create a folder, so by default the server-side guarantee covers read-only UI users. Hosts that want personal folders private between the people who create them should give those users a role that grants Create/Update on `MJ: Projects` without unfiltered Read, rather than Developer.

  What it does NOT change: a SHARED folder is readable by everyone in the environment, which is what shared means and is the state every folder that already exists is in. This makes personal folders possible; it is not a tenancy model, and tenant separation stays the host's Environment or its own row-level security.

  Visibility is a create-time choice, and one-way afterwards. A personal folder can be shared; a shared folder cannot be taken private, because NULL-means-shared conflates "shared" with "unowned" — sharing erases the owner, so the system cannot tell reclaiming from appropriating, and every folder that exists today would otherwise be one click from belonging to whoever opened its settings first.

  Also: `ConversationEngine` keys its folder cache by user as well as environment, its remote-save handler drops a folder that just became someone else's, and `DeleteProject` reads a folder's children by `ParentID` instead of trusting the now-narrowed cache — an unseen subfolder still holds the RESTRICT foreign key.

### Patch Changes

- 67f6c85: feat: the conversation sidebar gains multi-select (keyboard, mouse and touch), bulk actions, sorting, a search clear button, and multi-resource sharing

  **Selecting.** Ctrl/Cmd-click toggles one conversation, and Shift-click selects the range from the last row picked. A range follows the order the list renders and never reaches rows hidden inside a collapsed folder or section. A Ctrl-click that starts a selection takes the open conversation along, and a Shift-click with nothing picked yet ranges from it. Selecting needs no keyboard: a checkbox appears in a row's left padding when the pointer is over the row, and on every row while a selection exists. On touch, a long-press on a row selects it, after which a tap adds or removes a row. A selected row shows a ticked checkbox and an accent tint; the open conversation keeps its solid fill. Escape, a click on empty space, or deselecting the last row ends selection mode. The ⋯ menu's "Select Conversations" entry is gone.

  **The selection only holds rows on screen.** Select All picks the visible rows. A search edit, a collapse or a grouping change drops the selected rows it hides, and a conversation that leaves the list leaves the selection.

  **The selection bar.** While a selection exists, the search row becomes a bar with the count, Pin or Unpin, Move to folder, Share, Delete and a clear button. The sort buttons stay in place, so the list does not jump.

  **One right-click menu.** It replaces the per-row ⋯ menu's contents and the old bottom selection bar. On a selected row it acts on the whole selection ("3 selected", Pin, Unpin, Move to folder ▸, Share, Delete 3). On any other row it acts on that row alone and leaves the selection untouched. On a folder it offers New Subfolder, Rename and Delete, so the hover icons on folder rows are gone. On empty space it offers New Conversation, New Folder and Select All. The ⋯ button opens the same menu and is always shown on touch screens. The menu stays inside the window, opening upward or moving left near an edge.

  **Who can do what.** Share needs ownership or an Owner grant, the same rule the chat header uses. Move and Pin need ownership or an Edit/Owner grant. Each action is disabled when none of its targets qualify. A row you hold only View access to cannot be dragged into a folder. The conversations an action leaves out are named, with the reason. Folder and pin are still stored on the conversation itself, so a person with Edit access changes them for the owner too; per-user folder and pin is tracked in #4742.

  **Bulk actions and dragging.** Move and Pin keep the selection so a second action can follow. Delete removes only the deleted rows from the selection, so deleting a row outside the selection leaves it alone. Bulk actions report any conversations they could not change. Grabbing a selected row drags the whole selection onto a folder, onto Ungrouped, or onto the conversations inside a folder; grabbing an unselected row drags that row alone. Conversations already in the destination are skipped rather than re-saved.

  **Sorting and search.** A Date / Name button pair sorts the Pinned section, every folder and the Ungrouped list together; clicking the active button flips the direction. The choice is saved with the folder collapse state and group-by mode. The search box gains a clear button, and Escape inside it clears the query.

  **Sharing several resources — `ng-resource-permissions`.** `mj-resource-share-dialog` gains a `Contexts` input for sharing several resources at once. It merges everyone's access across them, labels a person whose access covers only some ("2 of 3") or differs in level ("Mixed"), and applies add, level change and removal across the whole set. `Context` is unchanged, so dashboards and the chat header are not affected. `ResourceLabel` sets the noun in the title, and `Notice` shows a caller-supplied line (the sidebar uses it to report conversations left out). The dialog leaves every resource's owner out of "Add people", and a retry after a partly failed save picks up where it stopped.

  **Engine — `core-entities`.** `ConversationEngine` gains `CanShareConversation` and `CanEditConversation`, the rules above, shared by the chat header and the sidebar. It also gains `MoveMultipleConversationsToProject` and `PinMultipleConversations`. They refuse a View-only conversation without saving it, save one conversation at a time so a single rejection cannot fail the batch, roll a failed conversation's fields back in memory, and emit the updated list once per batch.

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

- 307da67: Make the Chat cross-entity search panel reachable and usable in Explorer.

  `SearchPanelComponent` (search across conversations, messages, artifacts, collections
  and tasks) was only ever rendered by `ConversationWorkspaceComponent`, which has no
  consumers anywhere in the repo — Explorer composes the chat UI from resource wrappers
  instead. The panel therefore never mounted, leaving the feature with no route to it from
  any shipped surface. `ChatConversationsResourceComponent` now renders it.

  The entry point is an escalation row beneath the conversation list, shown only while the
  list's own filter is active: "Search all of Chat for …". It carries the term the user has
  already typed into the panel, so the two scopes read as one continuum rather than two
  identical-looking search boxes offering different reach. `mj-conversation-list` emits the
  new `SearchEscalated` output rather than routing itself, per the widget layer's event
  contract, and `SearchPanelComponent` accepts the term via a new `InitialQuery` input.
  Ctrl+K is deliberately not the shortcut: Explorer's global command palette already owns it.

  Search shows only what the user can already see:
  - **Conversations and messages** match only the conversations the conversation list shows:
    owned by the user or shared with them, not archived, and Global or Both scope. The rule
    lives in the new `ConversationEngine.GetVisibleConversationsFilter`, which
    `LoadConversations` also uses, so the list and search cannot drift apart. Unlike the list
    load, it has no row cap.
  - **Artifacts** match only artifacts the user can read, by the same rule as opening one:
    owner, else an explicit grant, else a read grant on a collection that holds it. The rule
    lives in the new `ArtifactPermissionService.GetReadableArtifactsFilter`.

  Several defects made the surface look wired up while returning nothing:
  - **Message search could never match.** The filter named `vwConversations` in a subquery,
    unqualified, but the SQL login's default schema is `dbo`, so it resolved to nothing and the
    query errored. Every sub-search reports failure as `return []`, so a hard SQL error and
    "no matches" rendered identically. Message search now reads the visible conversation IDs
    first, then filters messages by `ConversationID IN (...)`, so each filter names only its
    own entity's columns and works on SQL Server and PostgreSQL.
  - **Artifact results did not open.** Routing branched on `collectionId` then
    `conversationId`, but the artifact mapper only ever sets `collectionId` — so an
    artifact in no collection matched neither branch and the click did nothing. Artifacts
    need no parent; `NavigationService.OpenArtifact` opens one directly.
  - **Results did not render until an unrelated DOM event.** The emission does not reliably
    schedule a change-detection pass, so results landed on the component while the panel
    kept painting the previous state until a click or keypress triggered the next one.
  - **Quadratic work per keystroke.** `isResultSelected()` is bound once per row and rebuilt
    a flat array of every result on each call; the flat list is now cached per emission.
  - **Focus theft.** `ngOnChanges` fired for every input, so a `currentUser` or
    `environmentId` re-emit while the panel was open pulled focus out of whatever field the
    user was in. Replaced with a setter keyed on the open transition.
  - **The search icon escaped its input.** Explorer's app-wide `_shared-patterns.scss`
    absolutely-positions any bare `.search-icon` and pairs that with a `padding-left` scoped
    to three wrapper classes this panel does not use, so the icon positioned against the
    overlay while the input slid into its vacated flex slot.

  Also exports the `SearchResult` / `SearchResultType` types from
  `@memberjunction/ng-conversations` — they are the payload of
  `SearchPanelComponent.ResultSelected`, so consumers previously could not type a handler for it.

- 67f6c85: fix: the New/Edit Folder dialog reports why a save was refused instead of "Failed to save project"

  `BaseEntity.Save()` returns false and records the reason on `LatestResult` — a server refusal, a constraint violation, a failed hook. The folder modal threw that reason away and raised its own generic message, so the console read `Error: Failed to save project` with nothing pointing at the cause. It now raises `LatestResult.CompleteMessage` and shows it in the failure alert, matching what every other save path in this package already does.

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

- 9845c00: A realtime session in a conversation now reads as a voice call that belongs to the thread, not a banner laid across it.
  - `ng-conversations`: the session card is laid out like a chat message, with the call icon in the avatar column, a header with the title and start time, and a bubble with the status, how long the call ran, how many messages were exchanged, the last line said, and a **Review call** button (**View call** while live). It keeps the message list's margins at every breakpoint. The card takes the viewer's id (`CurrentUserID`, passed by the message list), so the quoted line says "You" on your own call, names the caller on someone else's, and says "Caller" when the session row doesn't say whose call it was.
  - `conversations-runtime`: the wording both surfaces share. The title is "Voice call with Sage" rather than "Realtime session · Sage", a server-shutdown close reads "Interrupted", and there are new helpers: `SessionCardStartedAt`, `SessionCardDurationLabel` ("Under a minute", "12 min", "1 hr 5 min"), `SessionCardMessageCountLabel` and `SessionCardSpeakerLabel`. The session lookup (`REALTIME_SESSION_META_FIELDS`) also reads `UserID`, `User` and `__mj_CreatedAt`, and the new `RealtimeSessionTimelineMeta` fields are optional, so existing callers still type-check.
  - `mobile-app`: the session card takes the same title and message count as the web, and names the agent on its lines. The chat screen passes the viewer's id (`CurrentUserID`), so the preview and the expanded transcript label the user's lines by the web's rule.

- e2fa695: Five nested `UUIDsEqual` scans, each over two lists that grow with the data, now match against a normalized `Set` (or a first-index `Map`) built once. The affected sites are:
  - the message placeholder getter
  - the user-row role lookup
  - the entity-permission fill-in (in Role mode, every entity × every saved row)
  - the dashboard drop handlers
  - the flow editor's `HighlightPath` and delete-selection

  Results, ordering and case-insensitive matching are unchanged. New tests pin each one and pass against the old code as well.

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
- Updated dependencies [f78fd63]
- Updated dependencies [a7da50b]
- Updated dependencies [1d43161]
- Updated dependencies [7110019]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
- Updated dependencies [9845c00]
- Updated dependencies [920bef8]
  - @memberjunction/ai@6.2.0-edge.1
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/ai-core-plus@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/ng-resource-permissions@6.2.0-edge.1
  - @memberjunction/ng-user-routines@6.2.0-edge.1
  - @memberjunction/conversations-runtime@6.2.0-edge.1
  - @memberjunction/graphql-dataprovider@6.2.0-edge.1
  - @memberjunction/ai-agent-client@6.2.0-edge.1
  - @memberjunction/ng-whiteboard@6.2.0-edge.1
  - @memberjunction/ai-realtime-client@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/interactive-component-types@6.2.0-edge.1
  - @memberjunction/ng-artifacts@6.2.0-edge.1
  - @memberjunction/ng-code-editor@6.2.0-edge.1
  - @memberjunction/ng-composer@6.2.0-edge.1
  - @memberjunction/ng-container-directives@6.2.0-edge.1
  - @memberjunction/ng-markdown@6.2.0-edge.1
  - @memberjunction/ng-media-player@6.2.0-edge.1
  - @memberjunction/ng-notifications@6.2.0-edge.1
  - @memberjunction/ng-shared-generic@6.2.0-edge.1
  - @memberjunction/ng-tasks@6.2.0-edge.1
  - @memberjunction/ng-testing@6.2.0-edge.1
  - @memberjunction/ng-ui-components@6.2.0-edge.1
  - @memberjunction/realtime-runtime@6.2.0-edge.1
  - @memberjunction/ai-engine-base@6.2.0-edge.1
  - @memberjunction/ng-base-types@6.2.0-edge.1
  - @memberjunction/ng-task-graph-editor@6.2.0-edge.1
  - @memberjunction/ng-forms@6.2.0-edge.1
  - @memberjunction/ng-agent-client@6.2.0-edge.1

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

- c157749: Extract the mention-autocomplete engine out of Angular into `@memberjunction/conversations-runtime`, so a non-Angular host can offer the same `@` / `#` / `/` pickers.

  **Why.** `MentionAutocompleteService` was 503 lines of permission-filtered caching and ranking — the agent / user / entity / query / skill sets behind every composer trigger, the `/` picker's target-agent narrowing, and the per-trigger match scoring. It imported nothing from `@angular/*` and carried no decorator; it was Angular-coupled purely by which package it sat in. `MentionParser`, the other half of the same feature, already lived in the runtime.

  That location was the problem. The React Native app needs the same three pickers, and a native host cannot depend on an Angular library — so reaching them would have meant writing the agent/skill run-permission filtering, the accepted-skills intersection and the ranking a second time. A second copy of a _permission_ rule is the copy that drifts, and it drifts silently in the direction of showing someone a skill they may not run.

  **What moved:** `MentionAutocomplete` (the engine), `IntersectAcceptedSkills` (the `/` narrowing rule), and the `MentionSuggestion` / `MentionSuggestionPreset` data shapes. Reachable as `ConversationsRuntime.Instance.MentionSuggestions` or directly as `MentionAutocomplete.Instance`.

  **On the suggestion types.** `@memberjunction/ng-composer` keeps its own structurally identical `MentionSuggestion` — that one is a _rendering_ contract (what a dropdown row and a chip display), this one is a _data_ contract (what a suggestion engine produces). They are kept assignable so the Angular shim passes runtime suggestions straight through with no mapping. Deliberately NOT consolidated: `ng-composer`'s type is consumed by Explorer's omnibar across a dozen files, and MJ forbids cross-package re-exports, so unifying them would have meant a wide, unrelated churn in a branch that had no business causing it.

  **No behaviour change.** `MentionAutocompleteService` remains importable from `@memberjunction/ng-conversations` with the same name and the same `.Instance` accessor — it is now an alias for the runtime engine, so there is still exactly one instance and one cache warm-up shared with the ClassFactory-instantiated trigger providers. Verified by the package's own suites: 1,319 tests green in `ng-conversations`, 122 in the runtime (the five skill-narrowing tests moved with the code they cover).

  `skill-picker-narrowing.ts` is gone from `ng-conversations`; import `IntersectAcceptedSkills` from `@memberjunction/conversations-runtime` instead. No in-repo consumer outside its own test.

- 7658d68: Mobile app v6: make realtime voice actually resolve on a device, route hosted applications' generic nav items, and scope the new agent-session grants with row-level security.

  **Why `minor`.** The branch adds metadata — two `MJ: Row Level Security Filters` rows and the `UI` role's `MJ: AI Agent Sessions` / `MJ: AI Agent Session Channels` permissions — which becomes a consolidated metadata-sync migration at release.

  **Realtime voice could not have worked on a device.** The React Native WebRTC drivers registered against `OpenAILiveClient` / `OpenAIRealtimeClient`, but `ClassFactory` matches on the registered base class's _name_ and the session runtime resolves against `BaseRealtimeClient` — so the RN drivers were filed in a bucket lookup never reads, the browser driver won, and `new RTCPeerConnection()` threw under Hermes. They now register against `BaseRealtimeClient` under the same provider keys the browser drivers use, `registerGlobals()` from `react-native-webrtc` runs at module load, and a unit test asserts on the resolved _class_ rather than merely that something resolves.

  Two related corrections: the RN drivers now override `createAudioSink()` rather than `attachRemoteAudio()` — the latter is where the base driver installs `pc.ontrack`, so overriding it silently removed the remote stream, its subscribers and the output audio meter — and `'xai'` is no longer advertised as supported. Grok Voice speaks the OpenAI protocol but over a websocket with a client-owned PCM plane, so it would have hit the `AudioContext` crash the provider filter exists to prevent.

  **Session lifecycle.** `RealtimeSessionRuntime` gains three fixes that apply to every host, Explorer included: a start abandoned mid-flight (the user leaves while the mint is in progress) now releases the microphone, the provider connection and the server-side session instead of leaking all three; concurrent teardowns coalesce onto one run instead of racing into two `Disconnect()` calls and two `CloseAgentSession` mutations; and a host that declines the resolved provider now unwinds through the shared teardown, so channel plugins are disposed rather than left published with live tool handlers. `IRealtimeMediaHost` gains an optional `ReleaseMicrophone()` — iOS is put into a record-and-play audio category for a call, and nothing was putting it back. `LastStartError` lets a host tell a denied microphone apart from a provider failure.

  **Agent runs reported failure as success.** `ConversationAgentRunner.processMessage` returns `null` only when no agent resolves; every other failure — a quota rejection, an agent that threw, a transport error — comes back as a well-formed result carrying `success: false`. The mobile send path tested only for `null`, so those turns reported success and left a permanently spinning bubble with no error anywhere in the UI.

  **Attachments were uploaded after the agent had already answered.** Photograph an invoice, ask for the totals, and the agent replied "I don't see an attachment" while the file appeared a second later. `SendMessage` now takes an `onUserMessageSaved` hook that runs in the window between the user's row existing and the run starting.

  **Hosted applications.** Nav items are parsed into a shape derived from the generated `MJApplicationEntity_IDefaultNavItem` rather than a hand-copy, which restores `RecordID` — the field identifying which record a non-`Custom` item opens. Generic resource types now resolve through the same registry as `Custom` ones, keyed by the type name, and this build ships a `Dashboards` surface backed by the same `DashboardView` the Explorer route mounts. Retired applications and deactivated nav items are filtered the way MJ Explorer filters them, and the launcher's ordering now matches `compareUserApplications`.

  **Storage seam corrections.** `MJStorageBlobStore` restores the compensating `DeleteObject` when the `MJ: Files` row fails to save (otherwise a successful upload with a failed row leaves permanently orphaned bytes) and configures `FileStorageEngine` before reading its accounts, so a cold process does not silently fall back to environment-only credentials. `ConversationAttachmentService.DeleteAttachment` now honours the store's return value instead of deleting the row regardless — the anti-orphan guarantee three doc comments promised. The browser store implements `GetDownloadUrl` through `CreateMediaAccessToken`, which is what makes Explorer's new storage-backed attachments readable rather than write-only, and `saveAttachments` accepts the agent whose `InlineStorageThresholdBytes` the decision should honour.

  **Security.** The `UI` role's new read/update permissions on agent sessions and session channels are scoped by two new RLS filters (`UI: Own Agent Sessions`, `UI: Own Agent Session Channels`), matching the pattern the Widget Guest rows already use. Unscoped, any signed-in user could read and modify another user's sessions.

  The sample application no longer sets `DefaultForNewUser` — a worked example should not install itself into every deployment's new users — and its screen now handles transport failures rather than showing "Loading…" forever on a dead network.

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

- 6ad6434: Put conversation-attachment blob access behind a seam, so the attachment service stops being server-only — and fix the inline-everything bug that duplication had already caused.

  `ConversationAttachmentService` is 859 lines of attachment _policy_: limit validation, the inline-vs-MJStorage threshold, modality resolution, thumbnails, content URLs for AI consumption. None of it is platform-specific. But it imported `@memberjunction/storage` for four members, and that package depends on `@aws-sdk/client-s3`, `@azure/storage-blob`, `dropbox` and more — so one import made the whole package unusable from any browser or React Native client. It was that package's **only** server-only dependency.

  The predictable result was three implementations of one policy: this service, a 494-line copy in `@memberjunction/ng-conversations`, and a third in the mobile app. And they had already drifted — **the Angular copy stored every attachment inline**, never consulting `ConversationUtility.ShouldStoreInline`, so a 5 MB image went into a database column instead of MJStorage, contradicting the `MJ: Conversation Detail Attachments` contract that `InlineData` is for small attachments and `FileID` for large ones.

  **The seam.** `IAttachmentBlobStore` — `Upload` / `Download` / `GetDownloadUrl` / `Delete`. Three deliberate choices:
  - **base64 at the boundary, never `Buffer`.** `Buffer` is a Node global; its presence in a shared signature is precisely what pinned this to one runtime. (The realtime runtime extraction learned the same lesson when `Blob` had leaked into session orchestration.)
  - **Optional by contract.** A host binding nothing gets inline attachments and a distinct, recognizable "storage not available on this host" — so a caller can tell a _deployment shape_ from an _incident_. That is the normal case for an end user, who typically cannot write to MJStorage at all.
  - **Bindings live outside the service.** `MJStorageBlobStore` (MJServer, wrapping `FileStorageEngine`) and `GraphQLAttachmentBlobStore` (ng-conversations, wrapping the existing `GraphQLFileStorageClient`). Neither is imported by the service.

  **What changed behaviourally:** Explorer now honours the storage threshold — large attachments go to MJStorage through MJAPI instead of silently inline. Everything else is a same-shape substitution.

  `DownloadFileContent` returns `string` (base64) rather than `Buffer | null`; its one caller, `RunAIAgentResolver`, is updated. Behaviour is otherwise unchanged: the MJStorage bodies moved verbatim, and the account-vs-provider credential resolution — which previously existed in only one of the three near-identical driver-resolution blocks — is now shared by all of them.

  Verified: full monorepo build 306/306 + 278/278; ng-conversations 1,324 tests green; aiengine 130 tests green (including new seam coverage); mobile 195 green.

  **Scope of the portability win, stated exactly.** This takes `@memberjunction/storage` — and with it the AWS, Azure and Dropbox SDKs — out of the attachment service's dependency graph, and it puts the inline-vs-storage decision behind one shared `ConversationUtility.ShouldStoreInline` call on every surface. It does **not** make `@memberjunction/aiengine` importable from a browser at runtime: the package's entry point also exports `AIEngine`, which imports Node's `crypto` at module scope for an embedding-cache key, and Explorer's bundler cannot resolve that. So the Angular host takes the _type_ from this package (`import type`, erased at compile time) and the _policy_ from `@memberjunction/ai-core-plus`, holding its own `GraphQLAttachmentBlobStore` rather than reaching through `GetAttachmentService()`. Removing that one `crypto` import — or splitting the package's entry points — is the remaining step, and it belongs to `aiengine`'s owners.

- d665a6e: feat(ai): Gemini Live direct tools support, prompt framing alignment, and change-driven remote browser screencast deduplication
  - Declared `SupportsDynamicToolSet = true` on `GeminiRealtime` and its session capabilities so target agent direct action tools are projected into Gemini Live sessions.
  - Fixed `hasDirectTools` calculation in `RealtimeClientSessionService` to consider `input.ExtraTools` (whiteboard, browser, media, context tools), ensuring interactive surface tools prevent the negative "do not attempt to do the work yourself" prompt guidance.
  - Implemented change-driven screencast frame deduplication in `RemoteBrowserChannel` with a 15-second heartbeat, preserving ~15k tokens/min on static pages while maintaining instant visual push on user interactions.
  - Reworded `ResolveGeminiThinkingLevel` fallback warning and added `CompileBrowserDelegationPolicy` doc clarification per PR review feedback.
  - Added Node < 23 `CloseEvent` compatibility polyfills in `ai-realtime-client` test suites.

- 575bfae: fix(ai-realtime): OpenAI Live planning model fallback, tool barrier synchronization, and remote video bridge
  - **OpenAI Live Default Planning Model**: Exported `DEFAULT_OPENAI_LIVE_PLANNING_MODEL = 'gpt-5.6-terra'` and warned with `console.warn` whenever `Reasoning.Remote.Ref` is undefined instead of falling back to legacy `gpt-4o`.
  - **Delegation Policy & Tool Framing**: Added `CompileBrowserDelegationPolicy` which omits the spoken holding phrase clause for browser-direct sessions. Guarded against appending delegation policy instructions when the session prompt already contains tool framing or interactive-surface execution rules.
  - **SendText Barrier Guard**: Prevented premature `response.create` emissions during `SendText` when background tool batches are in-flight (`!this.toolBatchBarrier.IsEmpty`). The creation is safely deferred until the tool batch completes via `SendToolResult`.
  - **Dedupe & Tool Barrier Lifetimes**: Maintained tool deduplication (`emittedToolCallIds`) throughout the lifetime of active tool batches, preventing duplicate execution from redelivered events when `response.completed` arrives before tool outputs. Cleared deduplication state upon batch completion and barrier timeout flushes.
  - **Remote Browser Video Bridge**: Wired `ChannelInboundVideoBridge` with client-getter support and hooked `OnSessionStarted` into active channels after WebRTC track negotiation so screencast frames stream reliably to the live model.
  - **Full-Duplex Barge-in Unblock**: Removed premature state gate in `GeminiRealtimeClient.sendMicChunk` so mic streaming and barge-in remain uninterrupted while the model is speaking or in extended thinking.
  - **Track Descriptors**: Added `Required?: boolean` to `RealtimeTrackDescriptor` so optional and channel-sourced media tracks are cleanly negotiated without breaking the session.

- 3977917: Extract the realtime co-agent session runtime out of Angular into `@memberjunction/realtime-runtime`, and register the GPT-Live client driver so it survives bundling.

  **Why.** `RealtimeSessionService` was 2,768 lines of client-direct realtime orchestration — mint, driver resolution, transcripts, tool relay, delegation narration, channel lifecycle, usage relay, teardown — living inside `@memberjunction/ng-conversations`. Its own header noted it stays component-free so it "must stay importable in plain-node tests", and the measurement bore that out: its entire Angular surface was `import { Injectable }` plus the decorator, and its entire DOM surface was one `navigator.mediaDevices.getUserMedia` call. But because it shipped in an Angular package, no other host could drive a realtime session without reimplementing it — and a second copy drifts from the first at the next protocol change, which GPT-Live just demonstrated is a frequent event.

  This follows the precedent set by `@memberjunction/conversations-runtime`, whose extraction plan explicitly noted realtime was landing in parallel and would need the same treatment.

  **What moved** into the new pure-TypeScript package: the session runtime (now `RealtimeSessionRuntime`), the channel plugin base class, the delegation-result parser, and the narration template builder.

  **The host seam.** `IRealtimeMediaHost` supplies the two genuinely platform-specific pieces: microphone acquisition (the Real-Time Co-Agents guide already specifies "the host acquires the mic — it owns the permission UX"; that seam simply had never been cut) and optional audio recording. Recording now returns base64 across the seam, so the runtime no longer touches `Blob` or `FileReader` — a browser reaches for `FileReader`, React Native reads a file, a test harness holds bytes in memory, and the orchestration layer should never have been asking.

  **`BaseRealtimeChannelClient`'s only Angular tie** was a type-only `Type<T>` import, used in one method the runtime never calls. It is now an opaque component-class reference that Angular's `Type<T>` satisfies unchanged, with the narrowing done at the single Angular call site that instantiates a component. This is what makes interactive channels authorable from a non-Angular host at all.

  **Bug fixed alongside:** `LoadOpenAILiveClient()` was exported but never called, while every sibling driver's Load function was. Since client drivers resolve dynamically through the ClassFactory, GPT-Live's driver could be tree-shaken out of a production bundle and fail to resolve at runtime while working in dev — the exact failure mode the Load-function convention exists to prevent.

  **No behaviour change for Explorer.** `RealtimeSessionService` keeps its name, injectable token and methods; it is now a thin subclass supplying the browser media host, and Explorer is untouched. `@memberjunction/ng-conversations` does, however, stop _exporting_ the types that moved — `public-api.ts` no longer re-exports `base-realtime-channel-client`, `delegation-result-parser` or `FormatToolName` — so a downstream consumer importing them from there must re-point at `@memberjunction/realtime-runtime`. No in-repo consumer does. The bump stays `patch` because MJ ties changeset level to database impact rather than semver breakage (see `.claude/rules/changesets.md`); the required import change is called out here instead. Verified by the package's existing suites: 108 test files / 1,324 tests green, including all 13 realtime-session suites.

  Types that moved (`RealtimeCaption`, `RealtimeConnectionState`, `RealtimeSessionRunOptions`, `BaseRealtimeChannelClient`, `ParseDelegationResultJson`, …) must now be imported from `@memberjunction/realtime-runtime`, since MJ does not re-export across package boundaries.

- d61b425: Voice and text now share a conversation properly, in both directions and on both surfaces.

  **Context flows into a voice session.** `ConversationMessages` was a hardcoded `[]` with an MVP
  note, so a call started mid-thread opened knowing nothing about what had been typed — the symptom
  being the agent asking the user to repeat something they had just written. The consumer had been
  written all along; only the plumbing was missing. The conversation's turns are now hydrated at
  session mint under the same caps the session-resume path uses (newest 30 turns, 8,000 characters,
  oldest dropped first). Because voice turns are themselves conversation rows, a resumed session
  would otherwise receive its previous leg twice, so the prior-transcript loader returns its leg ids
  and those legs are excluded; earlier calls that are not being resumed stay in.

  **Voice sessions collapse in the mobile thread.** The realtime-session timeline grouping and the
  card's presentation logic move from `ng-conversations` to `@memberjunction/conversations-runtime`
  (`BuildConversationTimeline`, `SessionCardTitle`, `SessionCardStatusChip`,
  `SessionCardIsSameDayRange`, `CollectRealtimeSessionIDs`, `MapRealtimeSessionMeta`,
  `FindRealtimeSessionMeta`, `IsVisibleRealtimeTurn`). The module was always pure TypeScript — and
  its own header already said rendering session-stamped rows as chat bubbles was wrong — but living
  behind an Angular import meant the React Native thread did exactly that. Both surfaces now run the
  same pass. `ng-conversations` re-exports from `lib/utils/realtime-session-timeline`, so its call
  sites are unchanged, and the Angular card delegates to the promoted functions instead of keeping
  its own copies.

  Mobile renders the collapsed card natively, expandable in place to the turns it counted, with a new
  `realtimeSessionCard` slot so a host can replace it.

- fc3da91: fix(realtime): confirm whiteboard agent edits only when the tool succeeded, and source inbound-video capability from per-model profile data

  Review follow-ups to #4512.
  - **A failed whiteboard tool no longer reports success to the model.** `ApplyAgentTool` pushed a confirmation frame and a "visual confirmation of your action — do NOT narrate or announce your own change" note unconditionally, including when the tool returned `{ success: false, error }` (invalid JSON arguments, unknown tool, per-tool validation). The model received its failure result alongside an assertion that the edit had landed, plus an instruction not to mention it — so a failed edit disappeared from the user's view. It also pushed a frame identical to the previous one, since a failed tool mutates nothing.
  - **Inbound-video capability and its frame-rate ceiling are now per-model data.** `GeminiLiveModelProfile` gains `MaxInboundVideoRate`, the mint carries both it and `SupportsInboundVideo` in the session config, and the browser driver reads them instead of inferring capability from the model id with `startsWith('gemini-3.8-live')`. That sniff and the profile table were two answers to one question, agreeing only because the model names happened to line up; a model that broke the naming pattern would have diverged silently. A future model that accepts a faster feed now declares it in the profile and every consumer follows.
  - **The whiteboard channel is change-driven with no liveness heartbeat.** Its `WHITEBOARD_HEARTBEAT_MS` constant could never fire — the elapsed check lived inside the mutation path, which an idle board never enters — so it read as a liveness guarantee while providing none.
  - `RealtimeTrack.Descriptor`'s doc now states that negotiation refinement covers `Rate` only, so no one reads `Encoding` or `UsageBasis` off a live track expecting the model's answer.

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
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [d665a6e]
- Updated dependencies [5df9486]
- Updated dependencies [e225ece]
- Updated dependencies [c157749]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [7658d68]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [575bfae]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [3977917]
- Updated dependencies [d61b425]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8d1a373]
- Updated dependencies [8a5d2c0]
- Updated dependencies [e962151]
- Updated dependencies [af57e8d]
- Updated dependencies [2c590b0]
- Updated dependencies [fc3da91]
  - @memberjunction/ai@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/ai-core-plus@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/ai-realtime-client@6.2.0-edge.0
  - @memberjunction/graphql-dataprovider@6.2.0-edge.0
  - @memberjunction/ng-shared-generic@6.2.0-edge.0
  - @memberjunction/conversations-runtime@6.2.0-edge.0
  - @memberjunction/realtime-runtime@6.2.0-edge.0
  - @memberjunction/ai-engine-base@6.2.0-edge.0
  - @memberjunction/ng-user-routines@6.2.0-edge.0
  - @memberjunction/ng-testing@6.2.0-edge.0
  - @memberjunction/ng-artifacts@6.2.0-edge.0
  - @memberjunction/ng-base-types@6.2.0-edge.0
  - @memberjunction/ng-code-editor@6.2.0-edge.0
  - @memberjunction/ng-notifications@6.2.0-edge.0
  - @memberjunction/ng-resource-permissions@6.2.0-edge.0
  - @memberjunction/ng-task-graph-editor@6.2.0-edge.0
  - @memberjunction/ng-tasks@6.2.0-edge.0
  - @memberjunction/ng-forms@6.2.0-edge.0
  - @memberjunction/ai-agent-client@6.2.0-edge.0
  - @memberjunction/ng-composer@6.2.0-edge.0
  - @memberjunction/ng-container-directives@6.2.0-edge.0
  - @memberjunction/ng-media-player@6.2.0-edge.0
  - @memberjunction/interactive-component-types@6.2.0-edge.0
  - @memberjunction/ng-whiteboard@6.2.0-edge.0
  - @memberjunction/ng-agent-client@6.2.0-edge.0
  - @memberjunction/ng-markdown@6.2.0-edge.0
  - @memberjunction/ng-ui-components@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Minor Changes

- 22ec804: Clickable record-link tokens in Chat messages (`type: "record"`). Agents emit `@{…}` JSON; the renderer turns it into a pill that opens the row via OpenEntityRecord, including composite primary keys. `name` is optional — omit it for an icon-only pill when surrounding prose already names the record. Loop prompt teaches the grammar and asks for world-class UX: prefer icon-only, one citation per record per section.
- 2792d97: Add a Skills button to the composer, beside Plan Mode.

  `/` skill commands already worked, but were reachable only by knowing to type `/`. Nothing on
  screen said the feature existed, so a user who had never been told about it had no way to find it.
  The button is the visible door to the same trigger.

  Clicking it calls the new `MentionEditorComponent.OpenTrigger('/')`, which opens the dropdown
  WITHOUT writing anything into the editor. The trigger character only ever exists as the chip the
  user picks, so dismissing leaves the message exactly as they left it. With no character to anchor
  on, the editor captures a baseline length when a trigger opens this way, and three paths consult
  it: typing filters against the baseline rather than searching for the character, chip insertion
  removes only what was typed, and dismissal has nothing to undo.

  It also toggles: a second click closes, because a disclosure control has to be able to close what
  it opened. Without that the second click re-ran the open path, re-emitting the event pair and
  re-capturing the baseline at the new caret.

  Built as a sibling of the existing strip controls, with the same `attach-button-icon` chrome and
  the same active treatment as Plan Mode. The ARIA deliberately differs: Plan Mode is a toggle button
  (a mode that stays on) so `aria-pressed` is correct there, while this opens a popup and therefore
  uses `aria-expanded` + `aria-haspopup`. Announcing "pressed" for revealing a list is the wrong
  thing for a screen reader to say. It joins the strip's
  visibility gate so a composer offering skills but no attachments, voice or plan mode still renders
  the strip.

  **Before/After pair, per `guides/UI_LAYERING_GUIDE.md` section 6.** Opening skills is an action a
  host might veto, so it ships as `BeforeSkillsOpened` (carrying `BeforeSkillsOpenedEventArgs` with
  `Cancel` / `CancelReason`) and `AfterSkillsOpened`. `After` is not emitted on the canceled path, and
  not emitted when no active provider owns the trigger, so a host counting it counts dropdowns the
  user saw rather than clicks. `Before` handlers must be synchronous: EventEmitter's synchronous
  dispatch is how `Cancel` travels back.

  The base, `CancellableComposerEventArgs`, is per-domain rather than shared. That matches the same
  guide's naming table, which specifies `Cancellable<Domain>EventArgs` for exactly this class, and the
  sixteen packages already following it. It is also the only option here on dependency grounds:
  `ng-composer` is the generic layer and cannot import from `ng-conversations`.

  **The expanded state is derived, not an input.** Plan Mode's active state is a persisted user
  preference the host owns and threads down. "Is the skill dropdown open" is intrinsic to the
  composer, so it reads `MentionEditorComponent.IsTriggerOpen('/')` instead. An `@Input` there would
  be an API no host could answer, and would leave the button permanently collapsed if nobody bound it.

  No new host-level cap: the button is gated on the existing `EnableSkillCommands` /
  `enableSkillCommands` / `allowSkillCommands` chain, which already defaults true at every layer. The
  button and the keystroke are two doors to one feature, so one flag governs both rather than letting
  a composer advertise skills it will not serve.

  **Two pre-existing dropdown bugs fixed along the way**, both of which affect every trigger
  (`@`, `#`, `/`) rather than only the new button:
  - **Click-away never dismissed.** Dismissal relied entirely on the editor's blur, and clicking a
    non-focusable area does not blur a contenteditable, so the dropdown stayed open with nothing able
    to close it. A `document:mousedown` listener now closes it, chosen over `click` because mousedown
    fires before focus moves and therefore cannot race blur's 200ms timer. Clicks inside the
    component are exempt, so a suggestion row still selects. The Skills button sits OUTSIDE the
    editor's host, so it needs the same exemption: without it the button's mousedown read as an
    outside press and closed the dropdown, then the click saw it already closed and reopened it, so
    the toggle never appeared to work. That seam is covered by a DOM test that fires real bubbling
    mousedown/click rather than calling the handler, which is what hid the bug.
  - **The dropdown could land off screen.** Positioning measures the caret, and a collapsed range in
    an empty editor measures 0x0 at 0,0 in every browser, pinning the menu to the bottom-left corner
    of the viewport. It now falls back to the editor's own box. The menu also prefers to open ABOVE
    the composer: the composer sits at the bottom of the chat, so a downward menu covers the text
    being typed.
  - **A button-opened menu anchors to the button, not the caret.** On the typed path the user's eyes
    and query are both at the caret, so the caret is the right anchor. On the button path nobody is
    looking at the caret. The anchored menu aligns left and grows rightward, flipping to right-aligned
    only when that would overflow the viewport — and the flip aligns to the COMPOSER's right edge
    rather than the button's, because the strip is pinned bottom-right and Skills is the leftmost of
    five icons, so pinning to that one icon hangs the menu's whole width out to its left. Coordinates
    are viewport-relative throughout, since the dropdown renders with `useFixedPositioning`.

  `OpenTrigger` and `IsTriggerOpen` are public and generic. Any trigger character with an active
  provider can now be opened from a control, and any control can reflect whether its trigger is open.

  **BREAKING (renames), and the reason this is `minor` rather than `patch`.** `MessageInputBoxComponent`
  was violating MJ's convention that public class members are `PascalCase`, so every public input,
  output, getter and method on it is renamed: `placeholder` to `Placeholder`, `disabled` to `Disabled`,
  `value` to `Value`, `valueChange` to `ValueChange`, `textSubmitted` to `TextSubmitted`,
  `planModeToggle` to `PlanModeToggle`, `canSend` to `CanSend`, `onSendClick` to `OnSendClick`, and so
  on for all of them. `TriggerProviders`, `ExcludedTriggerKeys` and `Provider` were already correct.

  Native DOM bindings and framework members are deliberately untouched: `[disabled]` on a `<button>`
  is a DOM property, `ngOnInit` / `writeValue` / `registerOnChange` are framework contracts, and
  `mj-mention-editor`'s own inputs keep their current casing because that component is not renamed
  here.

  `mj-ai-composer` is updated to the new names. Any other consumer binding these inputs or listening
  to these outputs must rename accordingly.

- 9fc0e2d: Carry an authored realtime voice to any provider, not just OpenAI — both override builders filed the voice under a hardcoded `openai` provider key, so a session resolving to ElevenLabs, Gemini, Inworld, AssemblyAI or HuggingFace silently got nothing: the setting stayed visible in the effective config and never reached a driver. On the default-model path the framework picks the vendor itself and never disclosed which, making a provider-keyed voice unauthorable rather than merely wrong. Adds the provider-agnostic `realtime.voice.default.voice` slot, filed onto whichever driver resolves — every realtime driver already reads the same neutral `voice` bag key by design (ElevenLabs maps it to `tts.voice_id` on the wire), so no per-driver accessor is needed. Precedence is per-key: the agnostic value wins `voice` while a matching `providers.<key>` bag still contributes its other settings, so a runtime pick beats a vendor-pinned value in agent metadata. With no agnostic voice authored, behavior is unchanged. Also ends the silence around it — the mint log now carries the resolved driver and the voice that reached it, both realtime surfaces log when authored provider bags matched nothing, and the resolved `DriverClass` is surfaced to the browser on `StartRealtimeClientSessionResult` — and consolidates three byte-identical copies of the vendor-selection walk into one `SelectRealtimeVendorForModel`.

  Minor rather than patch because the change is additive to the public API: `SelectRealtimeVendorForModel`, `RealtimeVendorSelection`, `MatchProviderVoiceSettings` and `WarnOnUnmatchedProviderVoice` are newly exported from `@memberjunction/ai-agents`, and `RealtimeClientSessionPrepResult` / `StartRealtimeClientSessionResult` gain `DriverClass`.

  Three compatibility notes, in rough order of how likely they are to bite:
  1. **Deploy the client and server together.** A new `@memberjunction/ng-conversations` against an older MJAPI silently drops a picked voice for **every** provider including OpenAI, because the older server's `normalizeVoice` does not carry `default.voice` through the cascade — a regression of currently-working behavior, so a same-version bump is not enough if the two deploy independently. The reverse (old client, new server) is safe: the `providers.openai` shape is still honored.
  2. **The agent-type `ConfigSchema` reaches a database only via `mj sync push`.** The schema gains the agnostic slot and marks `providers.*.voiceId` deprecated (no driver has ever read it). Until that push runs, authoring `realtime.voice.default.voice` in an agent's `TypeConfiguration` **fails the save** — the old schema validates `voice.default` with `additionalProperties: false`. Runtime overrides are unaffected; they bypass that validator.
  3. **Bridge hosts that supply a voice without pinning a model now forward that id to whatever vendor wins the priority walk.** `BridgeRealtimeSessionContext.RealtimeVoice` is host-supplied (LiveKit/Twilio/Teams) and independent of the model pin, so a previously inert misconfiguration becomes reachable: an OpenAI voice name like `echo` reaching ElevenLabs is sent as `tts.voice_id`, and an invalid voice id there fails the session rather than degrading. An agnostic voice is only as portable as the id itself — pin the model alongside the voice, or author per-vendor ids under `providers.<key>`.

  One gap found here was closed separately in the same release: **Gemini** consumed the neutral `voice` key no further than its config object — `buildConnectConfig` assigned the bag onto a `LiveConnectConfig` with no `voice` property, so the value was dropped before the wire. `@memberjunction/ai-gemini` now maps it to `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName` on both topologies (#3721). Separately, only `OpenAIRealtime`, `xAIRealtime` and `HuggingFaceRealtime` declare `SupportedVoices` (HuggingFace returns none) and the native picker's dropdown is gated on that list, so for the vendors this unblocks the voice is reachable through agent metadata and programmatic hosts rather than the picker.

- 71ccf29: Realtime: mint and run become separable.

  `RealtimeSessionService.StartRealtimeSession` fused two responsibilities — **minting** the session through the `StartRealtimeClientSession` mutation, and **running** it: resolving the driver from the result's `Provider`, booting it with the ephemeral token, wiring tool and transcript relays, connection state and teardown. A host that must mint the session itself, because it attaches server-side context the stock mutation cannot carry, had no way to reuse the second half. The public API was all-or-nothing.

  The only way through was to subclass `GraphQLDataProvider`, install it on the service's public `Provider` seam, intercept the single armed mint operation, redirect it to the host's own mutation and reshape the reply into the ten fields the client consumes. That works, but it depends on an implementation detail nobody promised — that _every_ GraphQL call the service makes goes through `Provider` — so a refactor entirely reasonable on MJ's own terms would break such a host silently.

  `StartRealtimeSessionFromResult(result, options)` exposes the run half directly, with `StartRealtimeClientSessionResult` and `RealtimeSessionRunOptions` now exported. `StartRealtimeSession` becomes `mintSession` + the new method, so **existing callers see no behavioural change**.

- e1ebab9: Remote Browser: the agent is told when the page moves, whoever moved it (#3496)

  A user takes over the browser and navigates. Asked "what do I have open right now?", the agent
  confidently describes the **previous** page and corrects only when told to look again.

  `RemoteBrowserChannel` pushed its `[browser] current page:` note from exactly two call sites, both
  immediately after a server action the model itself initiated. Nothing observed a page change from any
  other origin: human-relayed input drove the page without producing a note, and pushed screencast
  frames carried only image bytes. The effective rule was **a surface change the agent did not cause is
  invisible to it** — not stale caching, it was never told. Human takeover is on by default for
  `Collaborative` providers, so the default configuration was the broken one, and the failure mode was
  confident misdescription rather than a visible error.

  Every observation now funnels through one `notePageChange(url, cause)`, so "the agent hears about the
  page whenever it MOVES" is a property of that method rather than of where callers happen to sit. It
  is fed from three places: the agent's own actions and goals (as before), the perception poll (which
  already carried the URL — only the surface read it), and pushed screencast frames, which now carry
  `currentUrl` because under streaming the poll is stopped and frames were the only thing seeing the
  page.

  `cause` is the part the agent could never work out for itself. A change it made reads as before; a
  change it did not reads _"the page changed to X — you did not navigate here, so someone else is
  driving"_, which is the difference between knowing the page moved and knowing it is no longer the one
  moving it. The first page of a session is announced plainly: a session opening somewhere is nobody's
  takeover. Unchanged URLs are silent, which is a requirement rather than an optimisation — the poll
  runs every ~700ms.

  `currentUrl` on the frame envelope is optional on the client, so an older MJAPI behaves exactly as it
  did rather than reading a missing field as "the page has no URL". `GetCurrentUrl()` is a synchronous
  last-known read, so it costs nothing per frame.

  `cause` alone cannot settle attribution, because a pushed frame or a perception poll only says the
  page moved — never who moved it. Two cases make that decisive rather than pedantic: under streaming,
  frames of the new page are pushed while the action's mutation is still in flight, so the observation
  reliably lands BEFORE the URL is returned; and `browser_AchieveGoal` drives an autonomous loop
  server-side for minutes with nothing returned until it ends. Both would have reported the agent's own
  navigation back to it as somebody else's takeover — the original lie, inverted. So an agent-initiated
  operation raises a depth counter for its whole span (a counter, not a flag: goals and actions overlap,
  and `finally` closes the window on a thrown transport error too), and a change observed inside that
  window is the agent's own whichever feed spotted it first.

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

- 394d276: Follow-up to Phase 2 of the unified workflow DAG program (plan: PR #3456) — the task-graph control plane becomes **Remote Operations**, and the durable dispatcher actually starts.

  **BREAKING: the `SubmitTaskGraph`, `CancelTaskGraph`, and `RetryTask` GraphQL mutations are removed**, one release after they were added. They shipped in Phase 2 as bespoke resolvers, which fixed the _durability_ problem — nothing awaits a whole workflow inside one request anymore — but left the _reachability_ problem exactly where it was: callable from the Explorer client and nothing else. That undercuts the program's own goal of letting agents **set up** workflows rather than only navigate to them.

  Remote Operations are MJ's typed control plane, and the closest analogous substrate already uses them for precisely this shape of verb: Record Set Processing exposes `Run` / `Pause` / `Resume` / `Cancel` / `Get Run Status` entirely as Remote Operations. One registration is reachable from MCP (external agents), from an Action wrapper (internal agents), and from the UI, with the framework's authorization scopes applied uniformly rather than re-implemented per resolver.

  The replacements are `TaskGraph.Submit`, `TaskGraph.Cancel`, `TaskGraph.RetryTask`, and `TaskGraph.GetStatus`. `GetStatus` is new — it has no mutation predecessor. It is the observation half of making execution durable: once nobody holds a request open, a caller re-attaching after a reload, an agent checking work it submitted, or an external MCP caller all need a way to ask "where is it?". Its rollup runs the same pure algorithm the dispatcher runs, so the reported status cannot disagree with the engine's own view.

  There is deliberately no `TaskGraph.Pause`. The dispatcher has no pause concept — pausing a claimed task means deciding what happens to its claim, and inventing that here to round out a verb set would be guessing ahead of Phase 4.

  **The durable dispatcher now starts.** Phase 2 landed `TaskGraphDispatcher` but nothing ever instantiated it, so a submitted graph persisted correctly and then sat in `Pending` forever — durable and inert, which is strictly worse than the client-driven path it replaced. MJServer now starts one instance per process after `listen()`, alongside the other boot-time reconcilers, keyed by hostname + pid so reconciliation can tell its own orphaned work from a peer's live work. It is gated on SQL Server because the provider factory mints a `SQLServerDataProvider`; the PostgreSQL branch lands with PG parity.

  **The dispatcher self-registers with `ShutdownRegistry`** rather than making each host remember to stop it. A dispatcher still polling through a graceful shutdown would claim work the process is about to abandon — creating exactly the orphaned-claim state reconciliation exists to clean up.

  The Angular conversation client now calls `TaskGraph.Submit` through the generic `ExecuteRemoteOperation` transport, so the hand-written GraphQL document is gone from the client as well.

- 394d276: Phase 5 continued — the two **Save as Workflow** surfaces deferred out of Phase 4 (D17). Phase 4 shipped the converter; these are where a person actually reaches it.

  **Agent Run admin — a Workflow tab on the `TaskGraph` run step.** Phase 3 writes that step for _every_ emitted graph, dispatched or constant-folded, which is what makes a folded single-node graph just as promotable as a dispatched one — the point of recording the fold rather than letting it vanish. The tab opens by default on a `TaskGraph` step, because that step's whole content _is_ the graph and opening on the JSON would bury the one thing it exists to show. A folded graph says so, so the reader sees _why_ it never reached the dispatcher instead of inferring it.

  **ng-conversations — a plan card.** The moment this serves: an agent breaks a request into steps, the work runs, it was good, and today that is where it ends — the decomposition was ephemeral, so the next person who wants the same thing asks an agent to invent it again. Save is offered only once the work has **settled**; offering it mid-run invites saving a shape that may yet change under a retry or a failure routing down a recovery branch. The card starts collapsed, because it sits inline in a thread and must not dominate it.

  **Both render through the same `TaskGraphSpec` component the editor uses**, in `ReadOnly` mode. A second, simpler renderer for chat would be a second thing that can disagree with the canvas about what a graph means — which is the exact class of divergence this whole program has been removing.

  **Save is intent only** on both surfaces. Neither persists agents; the host converts and writes through `AgentSpecSync`, keeping the one place that writes an agent the one place that writes an agent.

- 768980d: **A Workflows app, and the Create Workflow front door inside it.**

  Phase 5 shipped every component this composes — the canvas, the properties panel, the runtime-overlay
  source, both Save-as-Workflow surfaces — but not the front door, because the design was not locked.
  It is now: `mockups/workflow-ux/front-door-v1.html` carries five ratified answers, and this builds
  all three of its screens against them.

  **Its own Explorer app, not a tab in AI.** D18 puts _Workflow_ in front of end users while _Flow
  Agent_ survives in metadata and dev docs — filing the surface under "AI" would contradict that at the
  navigation level, and D19 exists precisely because the editor is today buried inside a saved agent
  record. Scheduling and Routines set the precedent for an AI-adjacent domain getting its own app.

  **Three doors**, in the locked order, with "Describe it" pre-selected — the only one that needs no
  prior knowledge of the product. Each states _when to pick it_, not just what it does, because that is
  the actual question someone has on this screen. Only settled runs are promotable: an in-flight run
  may still change shape under a retry or a recovery branch, so the saved workflow would not be the one
  that ran. That is enforced three ways — the handler guards, the row leaves the tab order, and
  `aria-disabled` is set — because dimming alone leaves a row clickable and keyboard-reachable.

  **Save as Workflow now names it inline and offers the editor** (answer ④). The card previously
  emitted a save with no name and no way to continue editing, leaving the host to invent both. The name
  seeds from the plan's own — making someone invent another is the difference between saving and not
  bothering — but once touched it keeps what was typed, including empty. "Open in editor" is secondary
  on purpose: making the editor mandatory turns a two-second capture into a task.

  **Nothing anywhere asks for a trigger or a schedule.** Saving is capture, not scheduling; a workflow
  runs on demand until someone gives it a cadence, and the card says so rather than leaving it to be
  discovered.

  **D18 is enforced by test.** The vocabulary rule is invisible to a compiler and erodes one label at a
  time, so the templates and user-facing copy are asserted to contain no _graph_ / _DAG_ / _node_ /
  _Flow Agent_ — with a companion assertion that _step_ IS present, so the rule cannot be satisfied by
  deleting the concept instead of renaming it.

  The front door emits a draft rather than persisting anything, because the middle tile promises
  "Nothing is saved until you approve it" in so many words, and approval happens on the canvas.

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

- 1bced7c: Show that a generated artifact is still loading

  A message with a generated image rendered as finished with nothing where the image belonged, then
  the image appeared unannounced a few seconds later. It read as a failed generation rather than one
  still in flight. Two windows had no visual state at all:
  - `applyArtifactsToInstance` awaited each artifact and version row before rendering anything, even
    though `resolveDistinctArtifacts` had already returned them synchronously from an in-memory map.
    The artifacts that still need one are now published to the message immediately — name and
    visibility included, since `LazyArtifactInfo` carries both and only the ENTITY rows are lazy —
    and each draws a named `mj-loading` placeholder until its card is ready. `isLoaded` decides what
    counts as pending, so an artifact already in hand is never announced; the rest is filtered per
    artifact (by `UUIDsEqual`, since the two IDs come from different sources and differ in case
    between SQL Server and PostgreSQL), so a message showing a loaded report and still fetching an
    image renders both. Placeholders sort after the loaded cards, so an arrival appends rather than
    reorders. Applies to every artifact type.
  - The image, audio and video previews each had only an `error` and a `loaded` branch, so they drew
    nothing while `resolveContentUrl()` resolved. All three now show `mj-loading`. The image holds it
    until the `<img>` `load` event fires rather than until `src` is assigned, because an inline
    `data:` URI — what MJ stores whenever no file storage account is configured — can be several MB
    and the decode is the part the user waits on; the pending image is hidden with `opacity` rather
    than `display: none`, which would take it out of the paint tree and stop the decode it is
    waiting for.

  Three defects fixed alongside, all in the same code path: the artifact apply now runs after the
  message's other inputs are assigned (it forces the child's first change-detection pass, so running
  it early meant `ngAfterViewInit` saw a null agent run and never started the run-duration timer); a
  per-message generation counter stops a stale in-flight load clobbering a newer one; and the
  settle handlers no longer touch a destroyed view.

  This does not change how long anything takes, and it does not address the separate delay before an
  artifact exists server-side.

- c1fea88: Chat area scrolling: an in-place message update (progress, status, streamed text) no longer scrolls a reader who has scrolled up back to the bottom — the tail is followed only for a reader already at it. New opt-in `readReplyFromTop` on `mj-conversation-chat-area` scrolls a finished turn to the top of the pane when it is taller than the pane, so the run ends at the start of the answer.

  Agent completion is announced once, as a rich toast: `MJNotificationService.CreateRichNotification` (image or icon, title, detail, on the surface tokens with the brand colour as accent; dismissible with hover-pause; a same-key toast already on screen is kept, one still held back by `deferMs` is superseded). The server's Agent Completion notification (deferred) and message-input's client-side completion share a key per conversation, so the reader sees one toast in one wording — the client's, with the conversation's current name. New `CompletionImageUrlResolver` host hook lets a white-label host put its assistant's avatar on the toast.

- 241c2c1: Make the conversation UI's diagnostic logging opt-in instead of unconditional.

  Reported from a deployed app: "the browser's dev console is absolutely packed with spam. Every single character a user types into the input box triggers a message in the console. This isn't something we can put out into the world since some users will bring that up and it looks terrible."

  Nothing is removed — twelve `console.*` calls become `LogStatusEx({ …, verboseOnly: true })`, so they are silent by default and still there for anyone tracing this code. In a browser, verbose is enabled by `window.MJ_VERBOSE = true`, `localStorage.setItem('MJ_VERBOSE','true')`, or a `?MJ_VERBOSE=true` URL parameter.

  **The per-keystroke pair**, which is the specific behaviour in the report: `ComposerDraftStore.SetDraft` logs on every character typed, and `conversation-chat-area` logs the same event again on the way in. Together they are the largest single source of console output in the app.

  **Task-lifecycle narration**: `ActiveTasksService.add()` and `.remove()` each printed three lines per call (`➕ Task added:`, `📊 Total tasks:`, `🗂️ Conversation IDs with tasks:`), and `markMessageComplete` printed two more describing its own happy path.

  **One `console.warn` that was misdiagnosing itself.** `⚠️ No task found for completed message … - task may have been removed prematurely or not added` fired on every turn, by construction. A turn registers exactly one task, against whichever message its flow chose — `activeTasks.add()` is called with the user message, a Sage delegation message, a status message, or the agent response depending on the path — while `markMessageComplete` runs for _every_ message in the turn that reaches `Complete` or `Error`. Most calls therefore find no task, which is the normal case and not the lifecycle race the text described. It is now verbose-only and reworded to say what it actually means.

  `console.error` is untouched — all 179 in the package.

  Scoped deliberately to the per-keystroke path and this instrumentation rather than converting the package's remaining `console.*` calls: raw `console` is the prevailing style across MJ's Angular packages (863 calls vs 105 `LogStatus`), so a wholesale conversion is a convention decision rather than a bug fix.

- 919f0c7: Input dialog (rename conversation, and every `dialogService.input()` prompt) gets the same horizontal padding as the rating dialog. The dialog container pads only string content, so a component body's message, labels and inputs sat flush against the dialog edges while the header and footer were padded.
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

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- dd6d1f0: The realtime client says it is alive, so the janitor stops reaping live calls.

  `SessionJanitor` force-closed sessions people were actively talking to — three consecutive sessions with conversation throughout, each closed roughly 15 minutes after the last _server-side_ event. This is topology rather than a janitor defect: in the client-direct realtime path audio goes browser → provider over WebRTC, so the server sees the mint, a few early channel actions, then nothing. `RecordActivity` is only reached by server-side events, so `LastActiveAt` freezes about 45 seconds in and never moves again, and an active call is indistinguishable from an abandoned one. A session whose channels are all client-side goes quiet from the server's point of view almost immediately.

  The server half already existed and was simply never connected: `SessionManager.Heartbeat` (coalesced writes, reactivates `Idle → Active`, refuses a `Closed` session) and the `AgentSessionHeartbeat` mutation with its ownership check. A grep for that mutation across the tree returned exactly one hit — its own definition. This change is the missing caller, not new plumbing: a pulse in `RealtimeSessionService`, started where `SessionStarted$` is emitted (the point at which the session is connected _and_ `agentSessionId` is set) and stopped first thing in teardown.

  Three details worth knowing. The 60s interval is chosen against both neighbours — comfortably under the 15-minute close threshold, so several beats must be missed in a row before a live session is reaped, and well above the server's write-coalescing window, so the database sees a trickle rather than a stream. The session id is read at fire time rather than captured at start, so a beat landing during teardown finds `null` and does nothing instead of resurrecting a row that was just closed. And the pulse is stopped _before_ anything else in teardown, so a beat racing the close cannot re-stamp `LastActiveAt` on a session being deliberately ended.

- a8710bf: Realtime: the agent can speak FIRST

  Every existing path into the live model's voice is reactive — the human spoke, or a channel
  reported input. A host that needs the agent to open the conversation (an interviewer greeting a
  candidate, a guide introducing a task) had nothing to call, so the session connected and both
  sides waited for the other. The service already had the primitive; it was private and reachable
  only from a channel.

  `RealtimeSessionService.RequestSpokenOpening(instructions)` exposes it at the session level. The
  instructions say what to open with, in the host's words; the model still speaks in its own voice
  and persona.

  It returns whether the request was DELIVERED, which is the one way it deliberately differs from
  `SendContextNote` beside it: a dropped context note costs the model a little perception, while a
  dropped opening line is a session that sits in silence. `false` means no session was live — a host
  that asked before the connection reached a speaking state can retry, but only if it is told.

- cf2484c: Review follow-ups to #4358 and #4366.
  - `EntityPermissionInfo.IsDeny` — one predicate for "this is a Deny row" (case- and whitespace-insensitive; blank Type is Allow), used by `GetUserPermisions` and now by both RLS readers: `UserExemptFromRowLevelSecurity` and `GetUserRowLevelSecurityInfo` skip Deny rows, so a set `Can*` flag on a Deny row is never read as a grant. Unreachable in practice (a user carrying a Deny row fails the permission gate first), but the methods now implement the invariant their docs state. Tests cover the Deny axis with typed builders.
  - The materialization leak gate's comments no longer claim parity with the runtime RLS reader; they say the gate is deliberately wider.
  - Input dialog: `box-sizing: border-box` parity with the rating dialog. The dialog container documents its contract — component bodies pad themselves.

- 938cd9e: Internal: memoise the `/` skill picker's `@agent` chip lookup.

  `pickerTargetAgentId` is bound in `mj-message-input`'s template on a default-change-detection component and walked the editor DOM (`getMentionChipsData()` → `querySelectorAll('.mention-chip')`) on every change-detection cycle. It now reads a memo invalidated from `messageText`'s setter — the one point every chip change passes through, including programmatic writes (a restored draft, a post-send reset, a host assigning `messageText` directly) which rebuild or empty the chip DOM via `ngModel.writeValue` without emitting `valueChange`. `messageText` becomes a get/set pair; it is read-compatible and has no two-way `ngModel` binding. No behaviour change.

- dbaa967: **The `/` skill picker offers only what the target agent accepts.**

  The composer's '/' trigger listed every skill the _user_ could run, including ones the agent the
  message goes to would refuse (`AcceptsSkills='Limited'` without a grant, or `'None'`). The refusal
  only surfaced after send, as a system note. `mj-ai-composer` now takes `TargetAgentId`;
  `mj-message-input` binds it to an explicit `@agent` chip in the draft, else the agent it resolves for
  the message (continuity, pinned, embedder default), and the picker narrows to
  `AIEngineBase.GetSkillsForAgent(agent)` ∩ the user's runnable set (`IntersectAcceptedSkills`).
  Intersection only — it never adds a skill the user could not run; an unknown agent means no
  narrowing, as before. First-adopter feedback.

- d7feeae: Stop Explorer from showing "Unknown error" with a stuck Running timer when a Skip/sub-agent transport path fails. Pass the real error through invokeSubAgent, keep In-Progress when the agent may still be running, and persist Failed/Error on the run and conversation detail if executeAIAgent throws.
- 4b1257f: Window the chat transcript: load the latest display page on open, prepend older pages from a top sentinel, and keep the ConversationEngine full-history API unchanged for agents.

  Opening a conversation previously ran `GetConversationComplete` for every row, hydrated all of them, and mounted a component per timeline item. It now reads only the newest page. `ConversationEngine.LoadDetailWindow` is additive and pages on `Sequence` (not `AfterKey` — the primary key is a uniqueidentifier, so PK order is not chat order); `LoadConversationDetails` is untouched and still returns complete history, which `GetAgentContextWindow` and the server callers depend on. A window is deliberately never written into `_detailCache`.

  Paging is counted in display items rather than rows, so a realtime session still collapses to one card and is never split across pages.

- 394d276: DOM specs for the three components Phase 5 added, which takes the `packages/Angular/Generic` coverage ratchet from **138 (failing) to 135 (passing)** — better than the state it has been in on `next`.

  Each covers only what exists in the rendered template rather than the class, because the graph _logic_ is already tested against the pure adapter and the component classes where no TestBed is needed:
  - **The validation banner** earns DOM coverage specifically. It is the one place author-time feedback from the engine becomes visible, and a template regression there is silent — the component would still compute `IsValid` correctly while showing the user nothing.
  - **The properties panel never writes.** Every control emits a request the parent applies; a regression there would not throw, it would quietly bypass the veto contract.
  - **When "Save as Workflow" appears** is the plan card's highest-stakes rule. Offering it while work is still running invites saving a shape that may yet change under a retry or a failure routing down a recovery branch — so the graph a user believed they saved would not be the one that ran.

- Updated dependencies [4273317]
- Updated dependencies [394d276]
- Updated dependencies [634aa8c]
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
- Updated dependencies [1bced7c]
- Updated dependencies [05b4cb5]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [c1fea88]
- Updated dependencies [4586215]
- Updated dependencies [22ec804]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [2792d97]
- Updated dependencies [f5ec13b]
- Updated dependencies [1a2ce13]
- Updated dependencies [4c1de04]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [199eb2b]
- Updated dependencies [7a71c96]
- Updated dependencies [f80bdb7]
- Updated dependencies [1940a4d]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [deea1a3]
- Updated dependencies [1d2ffd4]
- Updated dependencies [c09c818]
- Updated dependencies [711c208]
- Updated dependencies [3c591a3]
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
- Updated dependencies [51017a5]
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
- Updated dependencies [e93f221]
- Updated dependencies [8288711]
- Updated dependencies [10cbc60]
- Updated dependencies [be0bdb2]
- Updated dependencies [5f33ca8]
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
- Updated dependencies [2e2879e]
- Updated dependencies [394d276]
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
- Updated dependencies [4cdfdcf]
- Updated dependencies [0db6105]
- Updated dependencies [d7feeae]
- Updated dependencies [7fefca2]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [394d276]
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
- Updated dependencies [5c6e36c]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [ce3d526]
- Updated dependencies [ba71cd4]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [63ea273]
- Updated dependencies [1be0f14]
- Updated dependencies [6cd337d]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [1c0d586]
  - @memberjunction/ng-shared-generic@6.1.0
  - @memberjunction/ng-whiteboard@6.1.0
  - @memberjunction/ng-ui-components@6.1.0
  - @memberjunction/ai-core-plus@6.1.0
  - @memberjunction/ng-artifacts@6.1.0
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/ai-engine-base@6.1.0
  - @memberjunction/ai@6.1.0
  - @memberjunction/ng-agent-client@6.1.0
  - @memberjunction/ng-base-types@6.1.0
  - @memberjunction/ng-code-editor@6.1.0
  - @memberjunction/ng-composer@6.1.0
  - @memberjunction/ng-container-directives@6.1.0
  - @memberjunction/ng-forms@6.1.0
  - @memberjunction/ng-markdown@6.1.0
  - @memberjunction/ng-media-player@6.1.0
  - @memberjunction/ng-notifications@6.1.0
  - @memberjunction/ng-resource-permissions@6.1.0
  - @memberjunction/ng-task-graph-editor@6.1.0
  - @memberjunction/ng-tasks@6.1.0
  - @memberjunction/ng-testing@6.1.0
  - @memberjunction/ng-user-routines@6.1.0
  - @memberjunction/graphql-dataprovider@6.1.0
  - @memberjunction/ai-realtime-client@6.1.0
  - @memberjunction/conversations-runtime@6.1.0
  - @memberjunction/interactive-component-types@6.1.0
  - @memberjunction/ai-agent-client@6.1.0

## 6.1.0-edge.7

### Patch Changes

- 919f0c7: Input dialog (rename conversation, and every `dialogService.input()` prompt) gets the same horizontal padding as the rating dialog. The dialog container pads only string content, so a component body's message, labels and inputs sat flush against the dialog edges while the header and footer were padded.
- cf2484c: Review follow-ups to #4358 and #4366.
  - `EntityPermissionInfo.IsDeny` — one predicate for "this is a Deny row" (case- and whitespace-insensitive; blank Type is Allow), used by `GetUserPermisions` and now by both RLS readers: `UserExemptFromRowLevelSecurity` and `GetUserRowLevelSecurityInfo` skip Deny rows, so a set `Can*` flag on a Deny row is never read as a grant. Unreachable in practice (a user carrying a Deny row fails the permission gate first), but the methods now implement the invariant their docs state. Tests cover the Deny axis with typed builders.
  - The materialization leak gate's comments no longer claim parity with the runtime RLS reader; they say the gate is deliberately wider.
  - Input dialog: `box-sizing: border-box` parity with the rating dialog. The dialog container documents its contract — component bodies pad themselves.

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
  - @memberjunction/ai@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/graphql-dataprovider@6.1.0-edge.7
  - @memberjunction/ai-core-plus@6.1.0-edge.7
  - @memberjunction/ng-ui-components@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/ng-testing@6.1.0-edge.7
  - @memberjunction/ng-artifacts@6.1.0-edge.7
  - @memberjunction/ng-base-types@6.1.0-edge.7
  - @memberjunction/ng-code-editor@6.1.0-edge.7
  - @memberjunction/ng-notifications@6.1.0-edge.7
  - @memberjunction/ng-resource-permissions@6.1.0-edge.7
  - @memberjunction/ng-shared-generic@6.1.0-edge.7
  - @memberjunction/ng-task-graph-editor@6.1.0-edge.7
  - @memberjunction/ng-tasks@6.1.0-edge.7
  - @memberjunction/ng-user-routines@6.1.0-edge.7
  - @memberjunction/conversations-runtime@6.1.0-edge.7
  - @memberjunction/ai-realtime-client@6.1.0-edge.7
  - @memberjunction/ai-agent-client@6.1.0-edge.7
  - @memberjunction/ng-composer@6.1.0-edge.7
  - @memberjunction/ng-container-directives@6.1.0-edge.7
  - @memberjunction/ng-media-player@6.1.0-edge.7
  - @memberjunction/interactive-component-types@6.1.0-edge.7
  - @memberjunction/ng-forms@6.1.0-edge.7
  - @memberjunction/ng-whiteboard@6.1.0-edge.7
  - @memberjunction/ng-agent-client@6.1.0-edge.7
  - @memberjunction/ng-markdown@6.1.0-edge.7

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

- 1bced7c: Show that a generated artifact is still loading

  A message with a generated image rendered as finished with nothing where the image belonged, then
  the image appeared unannounced a few seconds later. It read as a failed generation rather than one
  still in flight. Two windows had no visual state at all:
  - `applyArtifactsToInstance` awaited each artifact and version row before rendering anything, even
    though `resolveDistinctArtifacts` had already returned them synchronously from an in-memory map.
    The artifacts that still need one are now published to the message immediately — name and
    visibility included, since `LazyArtifactInfo` carries both and only the ENTITY rows are lazy —
    and each draws a named `mj-loading` placeholder until its card is ready. `isLoaded` decides what
    counts as pending, so an artifact already in hand is never announced; the rest is filtered per
    artifact (by `UUIDsEqual`, since the two IDs come from different sources and differ in case
    between SQL Server and PostgreSQL), so a message showing a loaded report and still fetching an
    image renders both. Placeholders sort after the loaded cards, so an arrival appends rather than
    reorders. Applies to every artifact type.
  - The image, audio and video previews each had only an `error` and a `loaded` branch, so they drew
    nothing while `resolveContentUrl()` resolved. All three now show `mj-loading`. The image holds it
    until the `<img>` `load` event fires rather than until `src` is assigned, because an inline
    `data:` URI — what MJ stores whenever no file storage account is configured — can be several MB
    and the decode is the part the user waits on; the pending image is hidden with `opacity` rather
    than `display: none`, which would take it out of the paint tree and stop the decode it is
    waiting for.

  Three defects fixed alongside, all in the same code path: the artifact apply now runs after the
  message's other inputs are assigned (it forces the child's first change-detection pass, so running
  it early meant `ngAfterViewInit` saw a null agent run and never started the run-duration timer); a
  per-message generation counter stops a stale in-flight load clobbering a newer one; and the
  settle handlers no longer touch a destroyed view.

  This does not change how long anything takes, and it does not address the separate delay before an
  artifact exists server-side.

- c1fea88: Chat area scrolling: an in-place message update (progress, status, streamed text) no longer scrolls a reader who has scrolled up back to the bottom — the tail is followed only for a reader already at it. New opt-in `readReplyFromTop` on `mj-conversation-chat-area` scrolls a finished turn to the top of the pane when it is taller than the pane, so the run ends at the start of the answer.

  Agent completion is announced once, as a rich toast: `MJNotificationService.CreateRichNotification` (image or icon, title, detail, on the surface tokens with the brand colour as accent; dismissible with hover-pause; a same-key toast already on screen is kept, one still held back by `deferMs` is superseded). The server's Agent Completion notification (deferred) and message-input's client-side completion share a key per conversation, so the reader sees one toast in one wording — the client's, with the conversation's current name. New `CompletionImageUrlResolver` host hook lets a white-label host put its assistant's avatar on the toast.

- 241c2c1: Make the conversation UI's diagnostic logging opt-in instead of unconditional.

  Reported from a deployed app: "the browser's dev console is absolutely packed with spam. Every single character a user types into the input box triggers a message in the console. This isn't something we can put out into the world since some users will bring that up and it looks terrible."

  Nothing is removed — twelve `console.*` calls become `LogStatusEx({ …, verboseOnly: true })`, so they are silent by default and still there for anyone tracing this code. In a browser, verbose is enabled by `window.MJ_VERBOSE = true`, `localStorage.setItem('MJ_VERBOSE','true')`, or a `?MJ_VERBOSE=true` URL parameter.

  **The per-keystroke pair**, which is the specific behaviour in the report: `ComposerDraftStore.SetDraft` logs on every character typed, and `conversation-chat-area` logs the same event again on the way in. Together they are the largest single source of console output in the app.

  **Task-lifecycle narration**: `ActiveTasksService.add()` and `.remove()` each printed three lines per call (`➕ Task added:`, `📊 Total tasks:`, `🗂️ Conversation IDs with tasks:`), and `markMessageComplete` printed two more describing its own happy path.

  **One `console.warn` that was misdiagnosing itself.** `⚠️ No task found for completed message … - task may have been removed prematurely or not added` fired on every turn, by construction. A turn registers exactly one task, against whichever message its flow chose — `activeTasks.add()` is called with the user message, a Sage delegation message, a status message, or the agent response depending on the path — while `markMessageComplete` runs for _every_ message in the turn that reaches `Complete` or `Error`. Most calls therefore find no task, which is the normal case and not the lifecycle race the text described. It is now verbose-only and reworded to say what it actually means.

  `console.error` is untouched — all 179 in the package.

  Scoped deliberately to the per-keystroke path and this instrumentation rather than converting the package's remaining `console.*` calls: raw `console` is the prevailing style across MJ's Angular packages (863 calls vs 105 `LogStatus`), so a wholesale conversion is a convention decision rather than a bug fix.

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

- 938cd9e: Internal: memoise the `/` skill picker's `@agent` chip lookup.

  `pickerTargetAgentId` is bound in `mj-message-input`'s template on a default-change-detection component and walked the editor DOM (`getMentionChipsData()` → `querySelectorAll('.mention-chip')`) on every change-detection cycle. It now reads a memo invalidated from `messageText`'s setter — the one point every chip change passes through, including programmatic writes (a restored draft, a post-send reset, a host assigning `messageText` directly) which rebuild or empty the chip DOM via `ngModel.writeValue` without emitting `valueChange`. `messageText` becomes a get/set pair; it is read-compatible and has no two-way `ngModel` binding. No behaviour change.

- dbaa967: **The `/` skill picker offers only what the target agent accepts.**

  The composer's '/' trigger listed every skill the _user_ could run, including ones the agent the
  message goes to would refuse (`AcceptsSkills='Limited'` without a grant, or `'None'`). The refusal
  only surfaced after send, as a system note. `mj-ai-composer` now takes `TargetAgentId`;
  `mj-message-input` binds it to an explicit `@agent` chip in the draft, else the agent it resolves for
  the message (continuity, pinned, embedder default), and the picker narrows to
  `AIEngineBase.GetSkillsForAgent(agent)` ∩ the user's runnable set (`IntersectAcceptedSkills`).
  Intersection only — it never adds a skill the user could not run; an unknown agent means no
  narrowing, as before. First-adopter feedback.

- Updated dependencies [634aa8c]
- Updated dependencies [2c826f7]
- Updated dependencies [b915983]
- Updated dependencies [1bced7c]
- Updated dependencies [05b4cb5]
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
- Updated dependencies [b9de989]
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
- Updated dependencies [0db6105]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [ce3d526]
- Updated dependencies [ba71cd4]
  - @memberjunction/ai-core-plus@6.1.0-edge.6
  - @memberjunction/ng-artifacts@6.1.0-edge.6
  - @memberjunction/ai@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/ng-agent-client@6.1.0-edge.6
  - @memberjunction/ng-base-types@6.1.0-edge.6
  - @memberjunction/ng-code-editor@6.1.0-edge.6
  - @memberjunction/ng-composer@6.1.0-edge.6
  - @memberjunction/ng-container-directives@6.1.0-edge.6
  - @memberjunction/ng-forms@6.1.0-edge.6
  - @memberjunction/ng-markdown@6.1.0-edge.6
  - @memberjunction/ng-media-player@6.1.0-edge.6
  - @memberjunction/ng-notifications@6.1.0-edge.6
  - @memberjunction/ng-resource-permissions@6.1.0-edge.6
  - @memberjunction/ng-shared-generic@6.1.0-edge.6
  - @memberjunction/ng-task-graph-editor@6.1.0-edge.6
  - @memberjunction/ng-tasks@6.1.0-edge.6
  - @memberjunction/ng-testing@6.1.0-edge.6
  - @memberjunction/ng-ui-components@6.1.0-edge.6
  - @memberjunction/ng-user-routines@6.1.0-edge.6
  - @memberjunction/ng-whiteboard@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/graphql-dataprovider@6.1.0-edge.6
  - @memberjunction/ai-engine-base@6.1.0-edge.6
  - @memberjunction/conversations-runtime@6.1.0-edge.6
  - @memberjunction/ai-realtime-client@6.1.0-edge.6
  - @memberjunction/ai-agent-client@6.1.0-edge.6
  - @memberjunction/interactive-component-types@6.1.0-edge.6

## 6.1.0-edge.5

### Minor Changes

- 22ec804: Clickable record-link tokens in Chat messages (`type: "record"`). Agents emit `@{…}` JSON; the renderer turns it into a pill that opens the row via OpenEntityRecord, including composite primary keys. `name` is optional — omit it for an icon-only pill when surrounding prose already names the record. Loop prompt teaches the grammar and asks for world-class UX: prefer icon-only, one citation per record per section.
- 71ccf29: Realtime: mint and run become separable.

  `RealtimeSessionService.StartRealtimeSession` fused two responsibilities — **minting** the session through the `StartRealtimeClientSession` mutation, and **running** it: resolving the driver from the result's `Provider`, booting it with the ephemeral token, wiring tool and transcript relays, connection state and teardown. A host that must mint the session itself, because it attaches server-side context the stock mutation cannot carry, had no way to reuse the second half. The public API was all-or-nothing.

  The only way through was to subclass `GraphQLDataProvider`, install it on the service's public `Provider` seam, intercept the single armed mint operation, redirect it to the host's own mutation and reshape the reply into the ten fields the client consumes. That works, but it depends on an implementation detail nobody promised — that _every_ GraphQL call the service makes goes through `Provider` — so a refactor entirely reasonable on MJ's own terms would break such a host silently.

  `StartRealtimeSessionFromResult(result, options)` exposes the run half directly, with `StartRealtimeClientSessionResult` and `RealtimeSessionRunOptions` now exported. `StartRealtimeSession` becomes `mintSession` + the new method, so **existing callers see no behavioural change**.

- e1ebab9: Remote Browser: the agent is told when the page moves, whoever moved it (#3496)

  A user takes over the browser and navigates. Asked "what do I have open right now?", the agent
  confidently describes the **previous** page and corrects only when told to look again.

  `RemoteBrowserChannel` pushed its `[browser] current page:` note from exactly two call sites, both
  immediately after a server action the model itself initiated. Nothing observed a page change from any
  other origin: human-relayed input drove the page without producing a note, and pushed screencast
  frames carried only image bytes. The effective rule was **a surface change the agent did not cause is
  invisible to it** — not stale caching, it was never told. Human takeover is on by default for
  `Collaborative` providers, so the default configuration was the broken one, and the failure mode was
  confident misdescription rather than a visible error.

  Every observation now funnels through one `notePageChange(url, cause)`, so "the agent hears about the
  page whenever it MOVES" is a property of that method rather than of where callers happen to sit. It
  is fed from three places: the agent's own actions and goals (as before), the perception poll (which
  already carried the URL — only the surface read it), and pushed screencast frames, which now carry
  `currentUrl` because under streaming the poll is stopped and frames were the only thing seeing the
  page.

  `cause` is the part the agent could never work out for itself. A change it made reads as before; a
  change it did not reads _"the page changed to X — you did not navigate here, so someone else is
  driving"_, which is the difference between knowing the page moved and knowing it is no longer the one
  moving it. The first page of a session is announced plainly: a session opening somewhere is nobody's
  takeover. Unchanged URLs are silent, which is a requirement rather than an optimisation — the poll
  runs every ~700ms.

  `currentUrl` on the frame envelope is optional on the client, so an older MJAPI behaves exactly as it
  did rather than reading a missing field as "the page has no URL". `GetCurrentUrl()` is a synchronous
  last-known read, so it costs nothing per frame.

  `cause` alone cannot settle attribution, because a pushed frame or a perception poll only says the
  page moved — never who moved it. Two cases make that decisive rather than pedantic: under streaming,
  frames of the new page are pushed while the action's mutation is still in flight, so the observation
  reliably lands BEFORE the URL is returned; and `browser_AchieveGoal` drives an autonomous loop
  server-side for minutes with nothing returned until it ends. Both would have reported the agent's own
  navigation back to it as somebody else's takeover — the original lie, inverted. So an agent-initiated
  operation raises a depth counter for its whole span (a counter, not a flag: goals and actions overlap,
  and `finally` closes the window on a thrown transport error too), and a change observed inside that
  window is the agent's own whichever feed spotted it first.

### Patch Changes

- dd6d1f0: The realtime client says it is alive, so the janitor stops reaping live calls.

  `SessionJanitor` force-closed sessions people were actively talking to — three consecutive sessions with conversation throughout, each closed roughly 15 minutes after the last _server-side_ event. This is topology rather than a janitor defect: in the client-direct realtime path audio goes browser → provider over WebRTC, so the server sees the mint, a few early channel actions, then nothing. `RecordActivity` is only reached by server-side events, so `LastActiveAt` freezes about 45 seconds in and never moves again, and an active call is indistinguishable from an abandoned one. A session whose channels are all client-side goes quiet from the server's point of view almost immediately.

  The server half already existed and was simply never connected: `SessionManager.Heartbeat` (coalesced writes, reactivates `Idle → Active`, refuses a `Closed` session) and the `AgentSessionHeartbeat` mutation with its ownership check. A grep for that mutation across the tree returned exactly one hit — its own definition. This change is the missing caller, not new plumbing: a pulse in `RealtimeSessionService`, started where `SessionStarted$` is emitted (the point at which the session is connected _and_ `agentSessionId` is set) and stopped first thing in teardown.

  Three details worth knowing. The 60s interval is chosen against both neighbours — comfortably under the 15-minute close threshold, so several beats must be missed in a row before a live session is reaped, and well above the server's write-coalescing window, so the database sees a trickle rather than a stream. The session id is read at fire time rather than captured at start, so a beat landing during teardown finds `null` and does nothing instead of resurrecting a row that was just closed. And the pulse is stopped _before_ anything else in teardown, so a beat racing the close cannot re-stamp `LastActiveAt` on a session being deliberately ended.

- a8710bf: Realtime: the agent can speak FIRST

  Every existing path into the live model's voice is reactive — the human spoke, or a channel
  reported input. A host that needs the agent to open the conversation (an interviewer greeting a
  candidate, a guide introducing a task) had nothing to call, so the session connected and both
  sides waited for the other. The service already had the primitive; it was private and reachable
  only from a channel.

  `RealtimeSessionService.RequestSpokenOpening(instructions)` exposes it at the session level. The
  instructions say what to open with, in the host's words; the model still speaks in its own voice
  and persona.

  It returns whether the request was DELIVERED, which is the one way it deliberately differs from
  `SendContextNote` beside it: a dropped context note costs the model a little perception, while a
  dropped opening line is a session that sits in silence. `false` means no session was live — a host
  that asked before the connection reached a speaking state can retry, but only if it is told.

- d7feeae: Stop Explorer from showing "Unknown error" with a stuck Running timer when a Skip/sub-agent transport path fails. Pass the real error through invokeSubAgent, keep In-Progress when the agent may still be running, and persist Failed/Error on the run and conversation detail if executeAIAgent throws.
- Updated dependencies [4273317]
- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [22ec804]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [c09c818]
- Updated dependencies [3c591a3]
- Updated dependencies [ada8784]
- Updated dependencies [d66a26a]
- Updated dependencies [e93f221]
- Updated dependencies [5f33ca8]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [905820a]
  - @memberjunction/ng-shared-generic@6.1.0-edge.5
  - @memberjunction/ng-whiteboard@6.1.0-edge.5
  - @memberjunction/ai@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-core-plus@6.1.0-edge.5
  - @memberjunction/ai-engine-base@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/ng-ui-components@6.1.0-edge.5
  - @memberjunction/ng-forms@6.1.0-edge.5
  - @memberjunction/ng-markdown@6.1.0-edge.5
  - @memberjunction/ng-artifacts@6.1.0-edge.5
  - @memberjunction/conversations-runtime@6.1.0-edge.5
  - @memberjunction/graphql-dataprovider@6.1.0-edge.5
  - @memberjunction/ng-resource-permissions@6.1.0-edge.5
  - @memberjunction/ng-tasks@6.1.0-edge.5
  - @memberjunction/ng-user-routines@6.1.0-edge.5
  - @memberjunction/ai-realtime-client@6.1.0-edge.5
  - @memberjunction/ng-testing@6.1.0-edge.5
  - @memberjunction/ng-base-types@6.1.0-edge.5
  - @memberjunction/ng-code-editor@6.1.0-edge.5
  - @memberjunction/ng-notifications@6.1.0-edge.5
  - @memberjunction/ng-task-graph-editor@6.1.0-edge.5
  - @memberjunction/ai-agent-client@6.1.0-edge.5
  - @memberjunction/ng-composer@6.1.0-edge.5
  - @memberjunction/ng-container-directives@6.1.0-edge.5
  - @memberjunction/ng-media-player@6.1.0-edge.5
  - @memberjunction/interactive-component-types@6.1.0-edge.5
  - @memberjunction/ng-agent-client@6.1.0-edge.5

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
  - @memberjunction/ai-engine-base@6.1.0-edge.4
  - @memberjunction/ai-core-plus@6.1.0-edge.4
  - @memberjunction/ai-realtime-client@6.1.0-edge.4
  - @memberjunction/ng-testing@6.1.0-edge.4
  - @memberjunction/ng-artifacts@6.1.0-edge.4
  - @memberjunction/ng-base-types@6.1.0-edge.4
  - @memberjunction/ng-code-editor@6.1.0-edge.4
  - @memberjunction/ng-notifications@6.1.0-edge.4
  - @memberjunction/ng-resource-permissions@6.1.0-edge.4
  - @memberjunction/ng-shared-generic@6.1.0-edge.4
  - @memberjunction/ng-task-graph-editor@6.1.0-edge.4
  - @memberjunction/ng-tasks@6.1.0-edge.4
  - @memberjunction/ng-user-routines@6.1.0-edge.4
  - @memberjunction/conversations-runtime@6.1.0-edge.4
  - @memberjunction/graphql-dataprovider@6.1.0-edge.4
  - @memberjunction/ai-agent-client@6.1.0-edge.4
  - @memberjunction/ng-agent-client@6.1.0-edge.4
  - @memberjunction/ng-composer@6.1.0-edge.4
  - @memberjunction/ng-container-directives@6.1.0-edge.4
  - @memberjunction/ng-whiteboard@6.1.0-edge.4
  - @memberjunction/ng-media-player@6.1.0-edge.4
  - @memberjunction/interactive-component-types@6.1.0-edge.4
  - @memberjunction/ng-forms@6.1.0-edge.4
  - @memberjunction/ng-markdown@6.1.0-edge.4
  - @memberjunction/ng-ui-components@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- 4b1257f: Window the chat transcript: load the latest display page on open, prepend older pages from a top sentinel, and keep the ConversationEngine full-history API unchanged for agents.

  Opening a conversation previously ran `GetConversationComplete` for every row, hydrated all of them, and mounted a component per timeline item. It now reads only the newest page. `ConversationEngine.LoadDetailWindow` is additive and pages on `Sequence` (not `AfterKey` — the primary key is a uniqueidentifier, so PK order is not chat order); `LoadConversationDetails` is untouched and still returns complete history, which `GetAgentContextWindow` and the server callers depend on. A window is deliberately never written into `_detailCache`.

  Paging is counted in display items rather than rows, so a realtime session still collapses to one card and is never split across pages.

- Updated dependencies [834f8d7]
- Updated dependencies [f5ec13b]
- Updated dependencies [199eb2b]
- Updated dependencies [7a71c96]
- Updated dependencies [f80bdb7]
- Updated dependencies [e7f1f88]
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
- Updated dependencies [2e2879e]
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
- Updated dependencies [63ea273]
- Updated dependencies [1be0f14]
- Updated dependencies [6cd337d]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/ai@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/graphql-dataprovider@6.1.0-edge.3
  - @memberjunction/ng-task-graph-editor@6.1.0-edge.3
  - @memberjunction/ng-code-editor@6.1.0-edge.3
  - @memberjunction/ng-base-types@6.1.0-edge.3
  - @memberjunction/ng-notifications@6.1.0-edge.3
  - @memberjunction/ng-ui-components@6.1.0-edge.3
  - @memberjunction/ai-agent-client@6.1.0-edge.3
  - @memberjunction/ai-engine-base@6.1.0-edge.3
  - @memberjunction/ai-realtime-client@6.1.0-edge.3
  - @memberjunction/ng-testing@6.1.0-edge.3
  - @memberjunction/ng-agent-client@6.1.0-edge.3
  - @memberjunction/ng-artifacts@6.1.0-edge.3
  - @memberjunction/ng-composer@6.1.0-edge.3
  - @memberjunction/ng-container-directives@6.1.0-edge.3
  - @memberjunction/ng-resource-permissions@6.1.0-edge.3
  - @memberjunction/ng-shared-generic@6.1.0-edge.3
  - @memberjunction/ng-tasks@6.1.0-edge.3
  - @memberjunction/ng-user-routines@6.1.0-edge.3
  - @memberjunction/ng-whiteboard@6.1.0-edge.3
  - @memberjunction/conversations-runtime@6.1.0-edge.3
  - @memberjunction/ng-media-player@6.1.0-edge.3
  - @memberjunction/interactive-component-types@6.1.0-edge.3
  - @memberjunction/ng-forms@6.1.0-edge.3
  - @memberjunction/ng-markdown@6.1.0-edge.3

## 6.1.0-edge.2

### Minor Changes

- 2792d97: Add a Skills button to the composer, beside Plan Mode.

  `/` skill commands already worked, but were reachable only by knowing to type `/`. Nothing on
  screen said the feature existed, so a user who had never been told about it had no way to find it.
  The button is the visible door to the same trigger.

  Clicking it calls the new `MentionEditorComponent.OpenTrigger('/')`, which opens the dropdown
  WITHOUT writing anything into the editor. The trigger character only ever exists as the chip the
  user picks, so dismissing leaves the message exactly as they left it. With no character to anchor
  on, the editor captures a baseline length when a trigger opens this way, and three paths consult
  it: typing filters against the baseline rather than searching for the character, chip insertion
  removes only what was typed, and dismissal has nothing to undo.

  It also toggles: a second click closes, because a disclosure control has to be able to close what
  it opened. Without that the second click re-ran the open path, re-emitting the event pair and
  re-capturing the baseline at the new caret.

  Built as a sibling of the existing strip controls, with the same `attach-button-icon` chrome and
  the same active treatment as Plan Mode. The ARIA deliberately differs: Plan Mode is a toggle button
  (a mode that stays on) so `aria-pressed` is correct there, while this opens a popup and therefore
  uses `aria-expanded` + `aria-haspopup`. Announcing "pressed" for revealing a list is the wrong
  thing for a screen reader to say. It joins the strip's
  visibility gate so a composer offering skills but no attachments, voice or plan mode still renders
  the strip.

  **Before/After pair, per `guides/UI_LAYERING_GUIDE.md` section 6.** Opening skills is an action a
  host might veto, so it ships as `BeforeSkillsOpened` (carrying `BeforeSkillsOpenedEventArgs` with
  `Cancel` / `CancelReason`) and `AfterSkillsOpened`. `After` is not emitted on the canceled path, and
  not emitted when no active provider owns the trigger, so a host counting it counts dropdowns the
  user saw rather than clicks. `Before` handlers must be synchronous: EventEmitter's synchronous
  dispatch is how `Cancel` travels back.

  The base, `CancellableComposerEventArgs`, is per-domain rather than shared. That matches the same
  guide's naming table, which specifies `Cancellable<Domain>EventArgs` for exactly this class, and the
  sixteen packages already following it. It is also the only option here on dependency grounds:
  `ng-composer` is the generic layer and cannot import from `ng-conversations`.

  **The expanded state is derived, not an input.** Plan Mode's active state is a persisted user
  preference the host owns and threads down. "Is the skill dropdown open" is intrinsic to the
  composer, so it reads `MentionEditorComponent.IsTriggerOpen('/')` instead. An `@Input` there would
  be an API no host could answer, and would leave the button permanently collapsed if nobody bound it.

  No new host-level cap: the button is gated on the existing `EnableSkillCommands` /
  `enableSkillCommands` / `allowSkillCommands` chain, which already defaults true at every layer. The
  button and the keystroke are two doors to one feature, so one flag governs both rather than letting
  a composer advertise skills it will not serve.

  **Two pre-existing dropdown bugs fixed along the way**, both of which affect every trigger
  (`@`, `#`, `/`) rather than only the new button:
  - **Click-away never dismissed.** Dismissal relied entirely on the editor's blur, and clicking a
    non-focusable area does not blur a contenteditable, so the dropdown stayed open with nothing able
    to close it. A `document:mousedown` listener now closes it, chosen over `click` because mousedown
    fires before focus moves and therefore cannot race blur's 200ms timer. Clicks inside the
    component are exempt, so a suggestion row still selects. The Skills button sits OUTSIDE the
    editor's host, so it needs the same exemption: without it the button's mousedown read as an
    outside press and closed the dropdown, then the click saw it already closed and reopened it, so
    the toggle never appeared to work. That seam is covered by a DOM test that fires real bubbling
    mousedown/click rather than calling the handler, which is what hid the bug.
  - **The dropdown could land off screen.** Positioning measures the caret, and a collapsed range in
    an empty editor measures 0x0 at 0,0 in every browser, pinning the menu to the bottom-left corner
    of the viewport. It now falls back to the editor's own box. The menu also prefers to open ABOVE
    the composer: the composer sits at the bottom of the chat, so a downward menu covers the text
    being typed.
  - **A button-opened menu anchors to the button, not the caret.** On the typed path the user's eyes
    and query are both at the caret, so the caret is the right anchor. On the button path nobody is
    looking at the caret. The anchored menu aligns left and grows rightward, flipping to right-aligned
    only when that would overflow the viewport — and the flip aligns to the COMPOSER's right edge
    rather than the button's, because the strip is pinned bottom-right and Skills is the leftmost of
    five icons, so pinning to that one icon hangs the menu's whole width out to its left. Coordinates
    are viewport-relative throughout, since the dropdown renders with `useFixedPositioning`.

  `OpenTrigger` and `IsTriggerOpen` are public and generic. Any trigger character with an active
  provider can now be opened from a control, and any control can reflect whether its trigger is open.

  **BREAKING (renames), and the reason this is `minor` rather than `patch`.** `MessageInputBoxComponent`
  was violating MJ's convention that public class members are `PascalCase`, so every public input,
  output, getter and method on it is renamed: `placeholder` to `Placeholder`, `disabled` to `Disabled`,
  `value` to `Value`, `valueChange` to `ValueChange`, `textSubmitted` to `TextSubmitted`,
  `planModeToggle` to `PlanModeToggle`, `canSend` to `CanSend`, `onSendClick` to `OnSendClick`, and so
  on for all of them. `TriggerProviders`, `ExcludedTriggerKeys` and `Provider` were already correct.

  Native DOM bindings and framework members are deliberately untouched: `[disabled]` on a `<button>`
  is a DOM property, `ngOnInit` / `writeValue` / `registerOnChange` are framework contracts, and
  `mj-mention-editor`'s own inputs keep their current casing because that component is not renamed
  here.

  `mj-ai-composer` is updated to the new names. Any other consumer binding these inputs or listening
  to these outputs must rename accordingly.

- 9fc0e2d: Carry an authored realtime voice to any provider, not just OpenAI — both override builders filed the voice under a hardcoded `openai` provider key, so a session resolving to ElevenLabs, Gemini, Inworld, AssemblyAI or HuggingFace silently got nothing: the setting stayed visible in the effective config and never reached a driver. On the default-model path the framework picks the vendor itself and never disclosed which, making a provider-keyed voice unauthorable rather than merely wrong. Adds the provider-agnostic `realtime.voice.default.voice` slot, filed onto whichever driver resolves — every realtime driver already reads the same neutral `voice` bag key by design (ElevenLabs maps it to `tts.voice_id` on the wire), so no per-driver accessor is needed. Precedence is per-key: the agnostic value wins `voice` while a matching `providers.<key>` bag still contributes its other settings, so a runtime pick beats a vendor-pinned value in agent metadata. With no agnostic voice authored, behavior is unchanged. Also ends the silence around it — the mint log now carries the resolved driver and the voice that reached it, both realtime surfaces log when authored provider bags matched nothing, and the resolved `DriverClass` is surfaced to the browser on `StartRealtimeClientSessionResult` — and consolidates three byte-identical copies of the vendor-selection walk into one `SelectRealtimeVendorForModel`.

  Minor rather than patch because the change is additive to the public API: `SelectRealtimeVendorForModel`, `RealtimeVendorSelection`, `MatchProviderVoiceSettings` and `WarnOnUnmatchedProviderVoice` are newly exported from `@memberjunction/ai-agents`, and `RealtimeClientSessionPrepResult` / `StartRealtimeClientSessionResult` gain `DriverClass`.

  Three compatibility notes, in rough order of how likely they are to bite:
  1. **Deploy the client and server together.** A new `@memberjunction/ng-conversations` against an older MJAPI silently drops a picked voice for **every** provider including OpenAI, because the older server's `normalizeVoice` does not carry `default.voice` through the cascade — a regression of currently-working behavior, so a same-version bump is not enough if the two deploy independently. The reverse (old client, new server) is safe: the `providers.openai` shape is still honored.
  2. **The agent-type `ConfigSchema` reaches a database only via `mj sync push`.** The schema gains the agnostic slot and marks `providers.*.voiceId` deprecated (no driver has ever read it). Until that push runs, authoring `realtime.voice.default.voice` in an agent's `TypeConfiguration` **fails the save** — the old schema validates `voice.default` with `additionalProperties: false`. Runtime overrides are unaffected; they bypass that validator.
  3. **Bridge hosts that supply a voice without pinning a model now forward that id to whatever vendor wins the priority walk.** `BridgeRealtimeSessionContext.RealtimeVoice` is host-supplied (LiveKit/Twilio/Teams) and independent of the model pin, so a previously inert misconfiguration becomes reachable: an OpenAI voice name like `echo` reaching ElevenLabs is sent as `tts.voice_id`, and an invalid voice id there fails the session rather than degrading. An agnostic voice is only as portable as the id itself — pin the model alongside the voice, or author per-vendor ids under `providers.<key>`.

  One gap found here was closed separately in the same release: **Gemini** consumed the neutral `voice` key no further than its config object — `buildConnectConfig` assigned the bag onto a `LiveConnectConfig` with no `voice` property, so the value was dropped before the wire. `@memberjunction/ai-gemini` now maps it to `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName` on both topologies (#3721). Separately, only `OpenAIRealtime`, `xAIRealtime` and `HuggingFaceRealtime` declare `SupportedVoices` (HuggingFace returns none) and the native picker's dropdown is gated on that list, so for the vendors this unblocks the voice is reachable through agent metadata and programmatic hosts rather than the picker.

- 768980d: **A Workflows app, and the Create Workflow front door inside it.**

  Phase 5 shipped every component this composes — the canvas, the properties panel, the runtime-overlay
  source, both Save-as-Workflow surfaces — but not the front door, because the design was not locked.
  It is now: `mockups/workflow-ux/front-door-v1.html` carries five ratified answers, and this builds
  all three of its screens against them.

  **Its own Explorer app, not a tab in AI.** D18 puts _Workflow_ in front of end users while _Flow
  Agent_ survives in metadata and dev docs — filing the surface under "AI" would contradict that at the
  navigation level, and D19 exists precisely because the editor is today buried inside a saved agent
  record. Scheduling and Routines set the precedent for an AI-adjacent domain getting its own app.

  **Three doors**, in the locked order, with "Describe it" pre-selected — the only one that needs no
  prior knowledge of the product. Each states _when to pick it_, not just what it does, because that is
  the actual question someone has on this screen. Only settled runs are promotable: an in-flight run
  may still change shape under a retry or a recovery branch, so the saved workflow would not be the one
  that ran. That is enforced three ways — the handler guards, the row leaves the tab order, and
  `aria-disabled` is set — because dimming alone leaves a row clickable and keyboard-reachable.

  **Save as Workflow now names it inline and offers the editor** (answer ④). The card previously
  emitted a save with no name and no way to continue editing, leaving the host to invent both. The name
  seeds from the plan's own — making someone invent another is the difference between saving and not
  bothering — but once touched it keeps what was typed, including empty. "Open in editor" is secondary
  on purpose: making the editor mandatory turns a two-second capture into a task.

  **Nothing anywhere asks for a trigger or a schedule.** Saving is capture, not scheduling; a workflow
  runs on demand until someone gives it a cadence, and the card says so rather than leaving it to be
  discovered.

  **D18 is enforced by test.** The vocabulary rule is invisible to a compiler and erodes one label at a
  time, so the templates and user-facing copy are asserted to contain no _graph_ / _DAG_ / _node_ /
  _Flow Agent_ — with a companion assertion that _step_ IS present, so the rule cannot be satisfied by
  deleting the concept instead of renaming it.

  The front door emits a draft rather than persisting anything, because the middle tile promises
  "Nothing is saved until you approve it" in so many words, and approval happens on the canvas.

### Patch Changes

- Updated dependencies [2792d97]
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
  - @memberjunction/ng-composer@6.1.0-edge.2
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/graphql-dataprovider@6.1.0-edge.2
  - @memberjunction/ai-engine-base@6.1.0-edge.2
  - @memberjunction/ai-realtime-client@6.1.0-edge.2
  - @memberjunction/ng-user-routines@6.1.0-edge.2
  - @memberjunction/ng-testing@6.1.0-edge.2
  - @memberjunction/ng-artifacts@6.1.0-edge.2
  - @memberjunction/ng-base-types@6.1.0-edge.2
  - @memberjunction/ng-code-editor@6.1.0-edge.2
  - @memberjunction/ng-notifications@6.1.0-edge.2
  - @memberjunction/ng-resource-permissions@6.1.0-edge.2
  - @memberjunction/ng-shared-generic@6.1.0-edge.2
  - @memberjunction/ng-task-graph-editor@6.1.0-edge.2
  - @memberjunction/ng-tasks@6.1.0-edge.2
  - @memberjunction/conversations-runtime@6.1.0-edge.2
  - @memberjunction/ng-forms@6.1.0-edge.2
  - @memberjunction/ai-agent-client@6.1.0-edge.2
  - @memberjunction/ng-agent-client@6.1.0-edge.2
  - @memberjunction/ng-container-directives@6.1.0-edge.2
  - @memberjunction/ng-whiteboard@6.1.0-edge.2
  - @memberjunction/ng-media-player@6.1.0-edge.2
  - @memberjunction/interactive-component-types@6.1.0-edge.2
  - @memberjunction/ng-markdown@6.1.0-edge.2
  - @memberjunction/ng-ui-components@6.1.0-edge.2

## 6.1.0-edge.1

### Minor Changes

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

- 394d276: Follow-up to Phase 2 of the unified workflow DAG program (plan: PR #3456) — the task-graph control plane becomes **Remote Operations**, and the durable dispatcher actually starts.

  **BREAKING: the `SubmitTaskGraph`, `CancelTaskGraph`, and `RetryTask` GraphQL mutations are removed**, one release after they were added. They shipped in Phase 2 as bespoke resolvers, which fixed the _durability_ problem — nothing awaits a whole workflow inside one request anymore — but left the _reachability_ problem exactly where it was: callable from the Explorer client and nothing else. That undercuts the program's own goal of letting agents **set up** workflows rather than only navigate to them.

  Remote Operations are MJ's typed control plane, and the closest analogous substrate already uses them for precisely this shape of verb: Record Set Processing exposes `Run` / `Pause` / `Resume` / `Cancel` / `Get Run Status` entirely as Remote Operations. One registration is reachable from MCP (external agents), from an Action wrapper (internal agents), and from the UI, with the framework's authorization scopes applied uniformly rather than re-implemented per resolver.

  The replacements are `TaskGraph.Submit`, `TaskGraph.Cancel`, `TaskGraph.RetryTask`, and `TaskGraph.GetStatus`. `GetStatus` is new — it has no mutation predecessor. It is the observation half of making execution durable: once nobody holds a request open, a caller re-attaching after a reload, an agent checking work it submitted, or an external MCP caller all need a way to ask "where is it?". Its rollup runs the same pure algorithm the dispatcher runs, so the reported status cannot disagree with the engine's own view.

  There is deliberately no `TaskGraph.Pause`. The dispatcher has no pause concept — pausing a claimed task means deciding what happens to its claim, and inventing that here to round out a verb set would be guessing ahead of Phase 4.

  **The durable dispatcher now starts.** Phase 2 landed `TaskGraphDispatcher` but nothing ever instantiated it, so a submitted graph persisted correctly and then sat in `Pending` forever — durable and inert, which is strictly worse than the client-driven path it replaced. MJServer now starts one instance per process after `listen()`, alongside the other boot-time reconcilers, keyed by hostname + pid so reconciliation can tell its own orphaned work from a peer's live work. It is gated on SQL Server because the provider factory mints a `SQLServerDataProvider`; the PostgreSQL branch lands with PG parity.

  **The dispatcher self-registers with `ShutdownRegistry`** rather than making each host remember to stop it. A dispatcher still polling through a graceful shutdown would claim work the process is about to abandon — creating exactly the orphaned-claim state reconciliation exists to clean up.

  The Angular conversation client now calls `TaskGraph.Submit` through the generic `ExecuteRemoteOperation` transport, so the hand-written GraphQL document is gone from the client as well.

- 394d276: Phase 5 continued — the two **Save as Workflow** surfaces deferred out of Phase 4 (D17). Phase 4 shipped the converter; these are where a person actually reaches it.

  **Agent Run admin — a Workflow tab on the `TaskGraph` run step.** Phase 3 writes that step for _every_ emitted graph, dispatched or constant-folded, which is what makes a folded single-node graph just as promotable as a dispatched one — the point of recording the fold rather than letting it vanish. The tab opens by default on a `TaskGraph` step, because that step's whole content _is_ the graph and opening on the JSON would bury the one thing it exists to show. A folded graph says so, so the reader sees _why_ it never reached the dispatcher instead of inferring it.

  **ng-conversations — a plan card.** The moment this serves: an agent breaks a request into steps, the work runs, it was good, and today that is where it ends — the decomposition was ephemeral, so the next person who wants the same thing asks an agent to invent it again. Save is offered only once the work has **settled**; offering it mid-run invites saving a shape that may yet change under a retry or a failure routing down a recovery branch. The card starts collapsed, because it sits inline in a thread and must not dominate it.

  **Both render through the same `TaskGraphSpec` component the editor uses**, in `ReadOnly` mode. A second, simpler renderer for chat would be a second thing that can disagree with the canvas about what a graph means — which is the exact class of divergence this whole program has been removing.

  **Save is intent only** on both surfaces. Neither persists agents; the host converts and writes through `AgentSpecSync`, keeping the one place that writes an agent the one place that writes an agent.

### Patch Changes

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- 394d276: DOM specs for the three components Phase 5 added, which takes the `packages/Angular/Generic` coverage ratchet from **138 (failing) to 135 (passing)** — better than the state it has been in on `next`.

  Each covers only what exists in the rendered template rather than the class, because the graph _logic_ is already tested against the pure adapter and the component classes where no TestBed is needed:
  - **The validation banner** earns DOM coverage specifically. It is the one place author-time feedback from the engine becomes visible, and a template regression there is silent — the component would still compute `IsValid` correctly while showing the user nothing.
  - **The properties panel never writes.** Every control emits a request the parent applies; a regression there would not throw, it would quietly bypass the veto contract.
  - **When "Save as Workflow" appears** is the plan card's highest-stakes rule. Offering it while work is still running invites saving a shape that may yet change under a retry or a failure routing down a recovery branch — so the graph a user believed they saved would not be the one that ran.

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
  - @memberjunction/ng-ui-components@6.1.0-edge.1
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ng-agent-client@6.1.0-edge.1
  - @memberjunction/ng-artifacts@6.1.0-edge.1
  - @memberjunction/ng-base-types@6.1.0-edge.1
  - @memberjunction/ng-code-editor@6.1.0-edge.1
  - @memberjunction/ng-composer@6.1.0-edge.1
  - @memberjunction/ng-container-directives@6.1.0-edge.1
  - @memberjunction/ng-forms@6.1.0-edge.1
  - @memberjunction/ng-markdown@6.1.0-edge.1
  - @memberjunction/ng-media-player@6.1.0-edge.1
  - @memberjunction/ng-notifications@6.1.0-edge.1
  - @memberjunction/ng-resource-permissions@6.1.0-edge.1
  - @memberjunction/ng-shared-generic@6.1.0-edge.1
  - @memberjunction/ng-tasks@6.1.0-edge.1
  - @memberjunction/ng-testing@6.1.0-edge.1
  - @memberjunction/ng-user-routines@6.1.0-edge.1
  - @memberjunction/ng-whiteboard@6.1.0-edge.1
  - @memberjunction/ng-task-graph-editor@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/graphql-dataprovider@6.1.0-edge.1
  - @memberjunction/ai-agent-client@6.1.0-edge.1
  - @memberjunction/ai-engine-base@6.1.0-edge.1
  - @memberjunction/conversations-runtime@6.1.0-edge.1
  - @memberjunction/interactive-component-types@6.1.0-edge.1
  - @memberjunction/ai@6.1.0-edge.1
  - @memberjunction/ai-realtime-client@6.1.0-edge.1
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
- Updated dependencies [5c6e36c]
  - @memberjunction/ng-ui-components@6.1.0-edge.0
  - @memberjunction/ng-artifacts@6.1.0-edge.0
  - @memberjunction/ng-composer@6.1.0-edge.0
  - @memberjunction/ng-user-routines@6.1.0-edge.0
  - @memberjunction/ng-testing@6.1.0-edge.0
  - @memberjunction/ng-markdown@6.1.0-edge.0
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/interactive-component-types@6.1.0-edge.0
  - @memberjunction/ng-forms@6.1.0-edge.0
  - @memberjunction/ng-resource-permissions@6.1.0-edge.0
  - @memberjunction/ng-whiteboard@6.1.0-edge.0
  - @memberjunction/ai-engine-base@6.1.0-edge.0
  - @memberjunction/ai-core-plus@6.1.0-edge.0
  - @memberjunction/ng-base-types@6.1.0-edge.0
  - @memberjunction/ng-code-editor@6.1.0-edge.0
  - @memberjunction/ng-notifications@6.1.0-edge.0
  - @memberjunction/ng-shared-generic@6.1.0-edge.0
  - @memberjunction/ng-tasks@6.1.0-edge.0
  - @memberjunction/conversations-runtime@6.1.0-edge.0
  - @memberjunction/graphql-dataprovider@6.1.0-edge.0
  - @memberjunction/ai-agent-client@6.1.0-edge.0
  - @memberjunction/ng-container-directives@6.1.0-edge.0
  - @memberjunction/ng-media-player@6.1.0-edge.0
  - @memberjunction/ng-agent-client@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/ai-realtime-client@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-agent-client@6.0.0
  - @memberjunction/ai-engine-base@6.0.0
  - @memberjunction/ai-core-plus@6.0.0
  - @memberjunction/ng-testing@6.0.0
  - @memberjunction/ng-artifacts@6.0.0
  - @memberjunction/ng-base-types@6.0.0
  - @memberjunction/ng-code-editor@6.0.0
  - @memberjunction/ng-composer@6.0.0
  - @memberjunction/ng-container-directives@6.0.0
  - @memberjunction/ng-media-player@6.0.0
  - @memberjunction/ng-notifications@6.0.0
  - @memberjunction/ng-resource-permissions@6.0.0
  - @memberjunction/ng-shared-generic@6.0.0
  - @memberjunction/ng-tasks@6.0.0
  - @memberjunction/ng-user-routines@6.0.0
  - @memberjunction/conversations-runtime@6.0.0
  - @memberjunction/graphql-dataprovider@6.0.0
  - @memberjunction/interactive-component-types@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/ng-agent-client@6.0.0
  - @memberjunction/ng-forms@6.0.0
  - @memberjunction/ng-whiteboard@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/ai-realtime-client@6.0.0
  - @memberjunction/ng-markdown@6.0.0
  - @memberjunction/ng-ui-components@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ai-agent-client@5.51.0
  - @memberjunction/ai-engine-base@5.51.0
  - @memberjunction/ai-core-plus@5.51.0
  - @memberjunction/ng-testing@5.51.0
  - @memberjunction/ng-artifacts@5.51.0
  - @memberjunction/ng-base-types@5.51.0
  - @memberjunction/ng-code-editor@5.51.0
  - @memberjunction/ng-composer@5.51.0
  - @memberjunction/ng-container-directives@5.51.0
  - @memberjunction/ng-media-player@5.51.0
  - @memberjunction/ng-notifications@5.51.0
  - @memberjunction/ng-resource-permissions@5.51.0
  - @memberjunction/ng-shared-generic@5.51.0
  - @memberjunction/ng-tasks@5.51.0
  - @memberjunction/ng-user-routines@5.51.0
  - @memberjunction/conversations-runtime@5.51.0
  - @memberjunction/graphql-dataprovider@5.51.0
  - @memberjunction/interactive-component-types@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/ng-agent-client@5.51.0
  - @memberjunction/ng-forms@5.51.0
  - @memberjunction/ng-whiteboard@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/ai-realtime-client@5.51.0
  - @memberjunction/ng-markdown@5.51.0
  - @memberjunction/ng-ui-components@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Minor Changes

- d36131a: Assistant identity inputs for the message feed. `assistantDisplayName` and `assistantAvatarUrl` on `mj-conversation-chat-area` (both default `null` = today's engine-resolved agent identity) let a white-label host brand the AI side of the conversation through the component contract instead of `::ng-deep` on `.message-sender` / `.avatar-circle` internals. The override is display-only by design: `isConversationManager` and the run-details header/record link keep comparing the engine-resolved agent name, so relabeling the persona can never change routing or behavior decisions. A whitespace-only or failing avatar URL degrades back to the agent's Font Awesome icon, and identity changes restamp already-rendered messages so a branding config that resolves after first render still applies.
- 8580aef: Brandable conversation export + an additive `headerActions` slot. `ExportBranding` (`brandTokens` / `logoUrl` / `title` / `trademark`), supplied via `exportBranding` on `mj-conversation-chat-area`, now applies across all four export formats: HTML gets theme colors as a sanitized `:root{}` block, an inlined data-URI logo, the title, and a styled trademark footer; markdown/text carry the title and trademark (markdown also references the logo); JSON emits a `branding` block. The HTML export's stylesheet was converted to `var(--mj-token, <legacyHex>)` where every fallback is the exact prior literal, so an unbranded export renders identically to previous releases and the JSON/markdown/text output is byte-identical.

  Host CSS values baked into the exported document pass a safe-function **allowlist** (`var`/`calc`/`min`/`max`/`clamp`/`rgb`/`rgba`/`hsl`/`hsla`/`hwb`/`lab`/`lch`/`oklab`/`oklch`/`color`/`color-mix`) plus a rejection of declaration- and tag-escape characters. Blocking only `url()` would have let `image-set()`, `-webkit-image-set()`, `cross-fade()`, `image()`, and `src()` fetch a remote URL from an exported local file without ever writing the literal `url(`.

  Also adds `exportButtonLabel` / `exportButtonIcon` for relabeling the header Export button, the download-free `ExportService.BuildExportContent()` and `SnapshotBrandTokens()` seams, and a seventh chat slot — `headerActions` — which appends host buttons inside the DEFAULT header's action strip (a projected `header` slot replaces the whole header and therefore suppresses it).

  The theme snapshot captures a **chosen** mode rather than the live one: `ExportOptions.themeMode` (`'light'` | `'dark'`, default `'light'`, surfaced as a Theme dropdown in the export modal) reads the requested palette by briefly toggling `data-theme` on `documentElement` and restoring it synchronously. Without this, exporting during a dark session baked dark text onto the export's white page and produced an unreadable file. The exported `body` now carries `--mj-bg-page` / `--mj-text-primary` / `--mj-font-family` so a dark export is coherent and a themed export carries the brand's type; `.message` corners read `--mj-radius-md`, and the user-message tint moved from `--mj-status-info-bg` to `--mj-brand-accent-subtle` (status colors never re-theme, so info-blue bubbles would otherwise survive every rebrand). Each keeps the prior literal as its `var()` fallback, with one deliberate exception: the new `body` rule sets `color: var(--mj-text-primary, #333)`, where message text previously inherited the browser default (black). The same rule makes the export explicitly white-backed, so a reader whose browser defaults to a dark canvas no longer gets black-on-dark — an unbranded export is therefore _more_ robust than before, not merely unchanged.

- 35fb5e3: White-label theming + chrome toggles for the conversation list panel. Nine new public design tokens (`--mj-chat-list-{bg,ink,hover-bg,active-bg,active-ink,active-hover-bg,accent,accent-ink,accent-hover}`) let a host remap the list off the stock brand-secondary rail and onto surface tokens so it matches the chat area; hover, border, divider, preview, badge, and placeholder tints all derive from the ink (or the active-row ink) via `color-mix`, so they follow a remap automatically. They resolve in the component's `:host` onto private `--conv-list-*` names — a custom property cannot name itself in its own fallback without forming a cycle, so the two-name indirection is required rather than stylistic.

  Four chrome toggles (`showSearch`, `showNewConversationButton`, `showHeaderMenu`, `showSectionHeaders`, all default `true`) remove list chrome for embedded and end-user surfaces; the header strip drops out entirely when nothing would occupy it, and `showSectionHeaders=false` renders a flat, fully-expanded list. `mj-conversation-sidebar` passes all four through and now re-emits the list's `(conversationDeleted)` and `(refreshRequested)` outputs, which previously died at the sidebar boundary.

  Defaults are unchanged with one exception: the rename-flash keyframes were hardcoded `rgba()` values that ignored theming entirely (inline `styles:` blocks in `.ts` files escape the repo's CSS token gate) and now run on brand/status tokens at the same alpha ramp — same animation, theme-following hue.

- abab5dc: Per-type mention gating on the chat area. `allowAgentMentions`, `allowEntityMentions`, and `allowSkillCommands` (all default `true`, all under the pre-existing `allowMentions` master) forward host-level caps to `mj-ai-composer`'s existing `EnableAgentMentions` / `EnableEntityMentions` / `EnableSkillCommands` toggles, through every composer consumer — the empty state and both message inputs. No composer or trigger-provider logic changes; the composer already treated `@` agents, `#` entities, and `/` skills as three independent plugins, and only the forwarding was missing.

  This lets a surface offer `/` skill commands while dropping `@` agent mentions. That matters because an `@` outranks the entire default-agent resolution chain, so a host pinned to one agent via `[defaultAgentId]` has not really pinned it while `@` is available. Disabling a type removes its trigger provider rather than hiding UI, and `allowMentions=false` still disables all three regardless of the per-type flags.

### Patch Changes

- 938ae80: Fix collection sharing end-to-end: run the share-create authorization gate against the entity's provider with the caller as contextUser (it previously rejected every share server-side), surface the real block reason instead of "Unknown error creating record", open shared collections from the Sharing Center via the Collections nav item, and polish the shared-indicator UI (badge sizing/styling, Shared chip, owner name resolution and truncation). Includes share-affordance gating for legacy null-OwnerID collections and regression tests for the create gate.
- 28c1dcd: `showAgentRunDetails=false` now hides the whole agent run-details section rather than only its grid, and the gear button that opens the panel renders only when that panel would actually have content.

  Previously the flag gated the run-detail grid but left the section's "… Run Details" header — and, more visibly, left the gear icon opening onto an empty popup. The gate now sits at the panel root, and `hasAgentDetailsPanelContent` mirrors the panel's three sibling blocks exactly (run details when enabled, associated tasks, and on non-last messages the delete/rating/pin overflow), so a white-labeled end-user surface with run details off and no message actions gets no gear at all. The rating arm is AND-gated on `messageStatus === 'Complete'` to match the template, which only renders the rating in that branch.

  Default behavior is unchanged: with `showAgentRunDetails=true` the gate is unconditionally true, so the gear renders for every agent-run message exactly as before — including the pre-existing window where the run record hasn't loaded yet.

- fe1b8e7: Repair `tsconfig.spec.json`, which two merge resolutions had left as invalid JSON by appending `include` entries without a preceding comma. `vitest.dom.shared.ts` hands that file to `@analogjs/vite-plugin-angular` as its `tsconfig`; with it unparseable, the plugin's TypeScript program no longer contained the component sources, so the AOT transform never ran for them and 9 DOM test files failed with `Component 'X' is not resolved`. The hand-enumerated file list is replaced with `src/**/*.ts` — the include the other Angular packages use — so it cannot drift out of sync with the files on disk again.
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
  - @memberjunction/ng-artifacts@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/ai-engine-base@5.50.0
  - @memberjunction/ng-testing@5.50.0
  - @memberjunction/ng-base-types@5.50.0
  - @memberjunction/ng-code-editor@5.50.0
  - @memberjunction/ng-notifications@5.50.0
  - @memberjunction/ng-resource-permissions@5.50.0
  - @memberjunction/ng-shared-generic@5.50.0
  - @memberjunction/ng-tasks@5.50.0
  - @memberjunction/ng-user-routines@5.50.0
  - @memberjunction/conversations-runtime@5.50.0
  - @memberjunction/graphql-dataprovider@5.50.0
  - @memberjunction/ai-agent-client@5.50.0
  - @memberjunction/ng-composer@5.50.0
  - @memberjunction/ng-container-directives@5.50.0
  - @memberjunction/ng-media-player@5.50.0
  - @memberjunction/interactive-component-types@5.50.0
  - @memberjunction/ng-forms@5.50.0
  - @memberjunction/ai-realtime-client@5.50.0
  - @memberjunction/ng-markdown@5.50.0
  - @memberjunction/ng-ui-components@5.50.0
  - @memberjunction/ng-whiteboard@5.50.0
  - @memberjunction/ng-agent-client@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Minor Changes

- 02c8a15: Add host-level pass-through toggles to `mj-conversation-chat-area` so embedding products can disable composer and chrome features through the component contract instead of CSS on internal class names: `allowPlanMode` / `allowRealtime` (thread into new `enablePlanMode` / `enableRealtime` inputs on both `mj-message-input` instances, then into the `ai-composer` inputs that were previously bound to literal `true`), `showEmptyFill` (the message list's "No messages yet" filler), and `showLoadingState` (the centered loading spinner, gated so the loading branch still short-circuits and never flashes the empty state). All default to `true`, so existing consumers are unaffected.

### Patch Changes

- c5e4b9e: Agent conversation compaction: durable cross-turn summaries stored on the conversation (Sequence + SummaryPromptRunID, budget knobs on AIAgentType/AIAgent, Compaction run steps), conversation-history retrieval tools (getMessageBySequence, getMessagesByRange, searchConversation, summarizeRange), edit handling with OriginalMessageChanged flagging and a wired chat edit affordance, plus hardening fixes: failed message expansions now surface a reason to the model (breaks an unbounded retry loop), json5 ESM import fix restores the local JSON-repair tier, and SQLConverter no longer truncates PG column comments at escaped apostrophes.
- b52ffa8: Fix four silent-failure bugs found while triaging the open issue backlog. Each one looked correct from the outside while doing nothing, or doing the wrong thing, at runtime. No schema changes.

  **`BaseLLM` silently truncated streamed responses (`@memberjunction/ai`).** The streaming chunk loop caught any mid-stream error, logged it, and then finalized the response as a **success**. A dropped connection, a provider fault, or an abort part-way through a stream produced truncated content that the caller was told was complete — under every provider, for every streaming consumer. Genuine failures now surface as failures; cancellation is still routed to the driver's `finalizeStreamingResponse`, since providers differ on whether an abort throws there or simply ends iteration.

  **No LLM driver honored `ChatParams.cancellationToken`** (13 provider packages). The field existed on `ChatParams` and zero drivers read it, so an aborted or timed-out request abandoned the promise while the socket kept streaming and pinning buffers. Now forwarded to the SDK across all 19 drivers — 13 fixed directly, the remaining 6 inheriting from `OpenAILLM` / `GeminiLLM` — on both the streaming and non-streaming paths. The mechanism differs per provider and was verified rather than assumed — Bedrock takes `abortSignal` (not `signal`); Ollama has no per-request hook at all, so the signal is threaded through a custom `fetch`; and `Inception` overrides both chat paths without calling `super`, so it does not inherit the fix from `OpenAILLM` despite appearing to. An abort is reported `Fatal` / `canFailover: false`, because `ErrorAnalyzer` otherwise classifies it as retriable — meaning a request the user just cancelled would have been retried.

  **Prompt execution could not be bounded (`@memberjunction/ai-prompts`, `@memberjunction/ai-core-plus`).** On the single-model path the model call was awaited with no bound unless the caller hand-supplied an `AbortSignal`, so a hung provider connection never resolved. Adds a per-request `AIPromptParams.timeoutMS` and a typed `AIPromptTimeoutError` that `ErrorAnalyzer` classifies as retriable, so a timeout now flows into the existing retry/failover machinery instead of hanging. The timeout and any caller-supplied token compose — neither is discarded. Enforcement lives in `executeModel`, the one method the parallel coordinator also inherits, so the single-model and parallel paths cannot diverge. (Issue #3064 was filed as "`AIPromptRunner` does not enforce `AIPrompt.TimeoutMS`", but that column does not exist — the bound could not be expressed at all. A prompt-level column is tracked separately in #3133.)

  **A malformed deny-list silently disarmed the Predictive Studio leakage guard** (`@memberjunction/predictive-studio*`, `@memberjunction/core-entities-server`, `@memberjunction/ng-dashboards`). Pasting a bracketed list into the pipeline editor produced `DenyFields: ["[CheckInTime", …, "Status]"]`; the deny-set then matched nothing, so the most dangerous leak columns trained completely unguarded and the save was accepted. The editor no longer manufactures the bad input, a new `MJMLTrainingPipelineEntityServer.ValidateAsync` rejects it at save, and the dominance threshold is clamped at enforcement time so rows written before this validation existed cannot disable the guard. Also unifies `DEFAULT_DOMINANCE_THRESHOLD`, which was defined twice with different values (`0.85` vs `0.6`) — agent-authored pipelines had been held to a materially laxer guard than hand-authored ones.

  **Dead CSS shipped to production (`@memberjunction/ng-dashboards`, `@memberjunction/ng-conversations`).** These packages build with bare `ngc` — no Sass step — so `styleUrls` content is embedded verbatim. Native CSS nesting makes `&:hover` accidentally work, but it cannot do string concatenation, so every `&__elem` / `&--modifier` rule was silently dropped. Three components were affected. **This resurrects styling that has never rendered**: the realtime media-surface tab bar had no active-tab indicator, and evidence playback had no active-turn highlight and no played-progress color on its waveform. A new `check:ui-ngc-scss` CI gate prevents the trap re-arming.

  Also fixes `@memberjunction/ai-azure`, whose unit tests had never actually run — the package had test files and a vitest config but no `test` script.

- 3993034: Reset artifact pane width when leaving a maximized pane on conversation switch, so the next artifact opened in another conversation no longer overflows the viewport
- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [a9ec419]
- Updated dependencies [42a680a]
- Updated dependencies [88d707b]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [9e2278c]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [70c658c]
- Updated dependencies [b5a8e3f]
  - @memberjunction/core@5.49.0
  - @memberjunction/ai-core-plus@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/graphql-dataprovider@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/ng-testing@5.49.0
  - @memberjunction/ai-realtime-client@5.49.0
  - @memberjunction/ng-artifacts@5.49.0
  - @memberjunction/ng-composer@5.49.0
  - @memberjunction/ng-forms@5.49.0
  - @memberjunction/ng-markdown@5.49.0
  - @memberjunction/ng-media-player@5.49.0
  - @memberjunction/ng-resource-permissions@5.49.0
  - @memberjunction/ng-shared-generic@5.49.0
  - @memberjunction/ng-tasks@5.49.0
  - @memberjunction/ng-ui-components@5.49.0
  - @memberjunction/ng-whiteboard@5.49.0
  - @memberjunction/ai-agent-client@5.49.0
  - @memberjunction/ai-engine-base@5.49.0
  - @memberjunction/ng-base-types@5.49.0
  - @memberjunction/ng-code-editor@5.49.0
  - @memberjunction/ng-container-directives@5.49.0
  - @memberjunction/ng-notifications@5.49.0
  - @memberjunction/ng-user-routines@5.49.0
  - @memberjunction/conversations-runtime@5.49.0
  - @memberjunction/interactive-component-types@5.49.0
  - @memberjunction/ng-agent-client@5.49.0

## 5.48.0

### Minor Changes

- c20723a: Add a self-hosted **HuggingFace speech-to-speech** realtime (voice) provider, sitting side-by-side with the cloud realtime providers (OpenAI, Gemini, ElevenLabs, AssemblyAI) with no host changes. It treats HuggingFace's open-source VAD → STT → LLM → TTS stack (in its OpenAI-Realtime-compatible `/v1/realtime` mode) as a `Realtime` model — private-by-design (audio never leaves owned infrastructure), cost-free, and component-swappable.

  Because the endpoint is self-hosted, the shipped client-direct audio topology runs through a new provider-agnostic **MJAPI realtime proxy**: the driver mints a one-time ticket into a shared `RealtimeProxyRegistry` (`@memberjunction/ai`) and hands the browser a `wss://<mjapi-public>/realtime-proxy?ticket=…` URL, so the internal endpoint + auth never reach the browser and the box needs no browser-facing ingress. Adds the new `@memberjunction/ai-huggingface` driver package, the `HuggingFaceRealtimeClient` (`@memberjunction/ai-realtime-client`), the `RealtimeProxyServer` + single upgrade-router in `@memberjunction/server`, the class-registration manifest entry (`@memberjunction/server-bootstrap`), and the client-load wiring (`@memberjunction/ng-conversations`), plus the `Hugging Face` vendor + `HuggingFace Speech-to-Speech` model metadata (low PowerRank — opt-in). Additive only; endpoint/auth/sample-rate are deployment config.

- f613d0d: Unified Ctrl+K omnibar command palette + composer draft persistence.
  - **Omnibar (ng-explorer-core)**: pluggable `OmnibarProvider` ClassFactory registry powering a unified Ctrl+K palette (search, `@agent`, `#entity`, `/skills`, `>commands`, recent searches), gated by a two-layer switch — the `Shell.Omnibar.Enabled` instance config flag is the master availability switch (default ON; OFF = legacy trio for everyone), and each user opts in personally via My Profile → Command Palette (UserInfoEngine setting `mj.shell.omnibar.enabled`, default OFF, cross-device, flips live). Modal palette is summonable from within editable elements (Slack/Linear semantics). `@agent` selection lands in Chat with a one-shot `agent|agentReq` nonce instruction so URL↔tab-config sync echoes can never re-stage the pre-address or wipe an in-progress draft.
  - **Composer (ng-composer)**: public `InsertMention()` API stages a resolved mention pill programmatically (chip + trailing space + caret focus), `FocusCaretAtEnd()`, blur output, and full serialized-mention rehydration — `writeValue` re-renders `@{...}` tokens as pills via `ParseSerializedMentions`.
  - **Conversations (ng-conversations)**: `InsertAgentMention()` resolves an agent name to a pill with replace-not-stack semantics and focus re-assertion; new `ComposerDraftStore` persists in-progress drafts per conversation (plus the new-conversation composer) via `UserInfoEngine` under `mj.chat.drafts.v1` — debounced while typing, flushed on blur, cleared on send, restored (pills included) on reload across sessions/devices.
  - **core-entities**: `UserInfoEngine.SetSetting` recovers when a cached settings row was deleted out-of-band (recreates instead of failing the UPDATE).

### Patch Changes

- 09e1b4b: Fix Apply to my Form (resolve spec code, handle Pending overrides, improve # typeahead), auto-add app schemas to excludeSchemas on OpenApp install/upgrade, surface RenderedSQL through RunQueryResult and TestQuerySQL, strip ORDER BY before outer-wrapping unparseable SQL in MaxRows, fix lazy-config loader variable name collisions in codegen manifest, and add read-only provider support and missing SQL function keywords in PostgreSQL provider
- Updated dependencies [09e1b4b]
- Updated dependencies [c20723a]
- Updated dependencies [f613d0d]
  - @memberjunction/ng-artifacts@5.48.0
  - @memberjunction/core@5.48.0
  - @memberjunction/ai@5.48.0
  - @memberjunction/ai-realtime-client@5.48.0
  - @memberjunction/ng-composer@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/ai-agent-client@5.48.0
  - @memberjunction/ai-engine-base@5.48.0
  - @memberjunction/ai-core-plus@5.48.0
  - @memberjunction/ng-testing@5.48.0
  - @memberjunction/ng-base-types@5.48.0
  - @memberjunction/ng-code-editor@5.48.0
  - @memberjunction/ng-container-directives@5.48.0
  - @memberjunction/ng-media-player@5.48.0
  - @memberjunction/ng-notifications@5.48.0
  - @memberjunction/ng-resource-permissions@5.48.0
  - @memberjunction/ng-shared-generic@5.48.0
  - @memberjunction/ng-tasks@5.48.0
  - @memberjunction/ng-user-routines@5.48.0
  - @memberjunction/conversations-runtime@5.48.0
  - @memberjunction/graphql-dataprovider@5.48.0
  - @memberjunction/interactive-component-types@5.48.0
  - @memberjunction/ng-markdown@5.48.0
  - @memberjunction/ng-agent-client@5.48.0
  - @memberjunction/ng-forms@5.48.0
  - @memberjunction/ng-whiteboard@5.48.0
  - @memberjunction/ng-ui-components@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ai-agent-client@5.47.0
  - @memberjunction/ai-engine-base@5.47.0
  - @memberjunction/ai-core-plus@5.47.0
  - @memberjunction/ng-testing@5.47.0
  - @memberjunction/ng-artifacts@5.47.0
  - @memberjunction/ng-base-types@5.47.0
  - @memberjunction/ng-code-editor@5.47.0
  - @memberjunction/ng-composer@5.47.0
  - @memberjunction/ng-container-directives@5.47.0
  - @memberjunction/ng-media-player@5.47.0
  - @memberjunction/ng-notifications@5.47.0
  - @memberjunction/ng-resource-permissions@5.47.0
  - @memberjunction/ng-shared-generic@5.47.0
  - @memberjunction/ng-tasks@5.47.0
  - @memberjunction/ng-user-routines@5.47.0
  - @memberjunction/conversations-runtime@5.47.0
  - @memberjunction/graphql-dataprovider@5.47.0
  - @memberjunction/interactive-component-types@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/ng-agent-client@5.47.0
  - @memberjunction/ng-forms@5.47.0
  - @memberjunction/ng-whiteboard@5.47.0
  - @memberjunction/ai@5.47.0
  - @memberjunction/ai-realtime-client@5.47.0
  - @memberjunction/ng-markdown@5.47.0
  - @memberjunction/ng-ui-components@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/ai-engine-base@5.46.0
  - @memberjunction/ai-agent-client@5.46.0
  - @memberjunction/ai-core-plus@5.46.0
  - @memberjunction/ng-testing@5.46.0
  - @memberjunction/ng-artifacts@5.46.0
  - @memberjunction/ng-base-types@5.46.0
  - @memberjunction/ng-code-editor@5.46.0
  - @memberjunction/ng-composer@5.46.0
  - @memberjunction/ng-container-directives@5.46.0
  - @memberjunction/ng-media-player@5.46.0
  - @memberjunction/ng-notifications@5.46.0
  - @memberjunction/ng-resource-permissions@5.46.0
  - @memberjunction/ng-shared-generic@5.46.0
  - @memberjunction/ng-tasks@5.46.0
  - @memberjunction/ng-user-routines@5.46.0
  - @memberjunction/conversations-runtime@5.46.0
  - @memberjunction/graphql-dataprovider@5.46.0
  - @memberjunction/interactive-component-types@5.46.0
  - @memberjunction/ng-agent-client@5.46.0
  - @memberjunction/ng-forms@5.46.0
  - @memberjunction/ng-whiteboard@5.46.0
  - @memberjunction/ai@5.46.0
  - @memberjunction/ai-realtime-client@5.46.0
  - @memberjunction/ng-markdown@5.46.0
  - @memberjunction/ng-ui-components@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- 572d219: Render agent final-response streaming in the conversation chat. Adds an optional `kind` discriminator to agent streaming chunks — `'final-response'` marks deltas of the user-facing reply — passed through the server's PubSub payload; the conversation client now routes those chunks, accumulates deltas service-side, renders the growing text in the message bubble, and reconciles with the saved final message on completion. Unmarked streams (e.g. Loop-agent JSON turn envelopes) keep today's behavior exactly (dropped), so agents that don't opt in are unaffected.
- Updated dependencies [572d219]
  - @memberjunction/ai-core-plus@5.45.1
  - @memberjunction/conversations-runtime@5.45.1
  - @memberjunction/ai-engine-base@5.45.1
  - @memberjunction/ng-forms@5.45.1
  - @memberjunction/ng-tasks@5.45.1
  - @memberjunction/graphql-dataprovider@5.45.1
  - @memberjunction/ng-user-routines@5.45.1
  - @memberjunction/ng-testing@5.45.1
  - @memberjunction/ai-agent-client@5.45.1
  - @memberjunction/ng-artifacts@5.45.1
  - @memberjunction/ng-media-player@5.45.1
  - @memberjunction/ng-notifications@5.45.1
  - @memberjunction/ng-agent-client@5.45.1
  - @memberjunction/ng-resource-permissions@5.45.1
  - @memberjunction/ai@5.45.1
  - @memberjunction/ai-realtime-client@5.45.1
  - @memberjunction/ng-base-types@5.45.1
  - @memberjunction/ng-code-editor@5.45.1
  - @memberjunction/ng-composer@5.45.1
  - @memberjunction/ng-container-directives@5.45.1
  - @memberjunction/ng-markdown@5.45.1
  - @memberjunction/ng-shared-generic@5.45.1
  - @memberjunction/ng-ui-components@5.45.1
  - @memberjunction/ng-whiteboard@5.45.1
  - @memberjunction/interactive-component-types@5.45.1
  - @memberjunction/core@5.45.1
  - @memberjunction/core-entities@5.45.1
  - @memberjunction/global@5.45.1

## 5.45.0

### Minor Changes

- ad9f4a3: Surface dropped skill-activation requests instead of silently ignoring them: new 'skill-activation-refused' message type; BaseAgent injects an explanatory system note + logs a warning when requested skills fail the activation guard; conversations UI shows a warning toast at send time when the mentioned agent can't activate the requested skills.
- c1f2d3d: User Routines (P1.5): user-owned scheduled/monitoring routines that run an Agent, Action, or Prompt on a cron schedule. New UserRoutine/UserRoutineRecipient/UserRoutineRun schema; UserRoutineDispatcherDriver scheduled-job driver (1-minute sweep, claim-before-run, bounded concurrency, per-routine isolation, runs as the owner, Template-driven notifications with OnChange result-hash detection, RequestedSkillIDs pre-arming for Agent targets); pure UserRoutineProcessor schedule/notify primitives shared with MJUserRoutineEntityServer (NextRunAt on save, cron validation) and MJUserRoutineRecipientEntityServer (User-xor-Email); lazy non-startup UserRoutineEngine; new @memberjunction/ng-user-routines widget set (list/editor/history + command-center composite + slide-in, cancelable Before/After events, Agent-only creation with categorical ng-trees picker); conversations bottom-sidebar Routines section gated by ShowRoutines input AND entity-Read permission (hosted in both the generic workspace sidebar and Explorer's Chat wrapper); Routines Explorer app; pure cron preset/describe helpers now in @memberjunction/global (CronUtils); mj-tree gains a DefaultExpansion input ('first-level' | 'all' | 'none'); BaseScheduledJob gains IsHighFrequencyByDesign so by-design pollers (the routine dispatcher) opt out of the high-frequency cron warning; Agent-target routines run inside a dedicated per-routine Conversation (Application-scoped via the Routines app so it stays out of the default chat list; RunAgentInConversation writes proper user/assistant turns; standalone fallback when the app is absent); UserRoutine.ConversationID schema + open-conversation and open-execution-record event chains through the conversations hosts; server-side cascade delete (recipients + run bookkeeping) so routines that have run delete cleanly; agent picker is a compact mj-tree-dropdown (DefaultExpansion pass-through added); mj-slide-panel settles to transform:none when open so position:fixed descendants (dropdown panels) keep true viewport coordinates; time-relative sidebar/card/history text is snapshot-based (NG0100 fix); 16-test live integration suite + live Playwright E2E; Explorer notifications page rebuilt (day-grouped cards, sanitized HTML + Markdown message rendering with expand/collapse previews, snapshot relative times, removal of a test harness that created junk Conversations on Mark-All-Read) and the seeded routine notification template gains a compact Markdown Text body that the dispatcher now prefers for in-app delivery (the HTML document stays for email); new @memberjunction/ng-composer package extracts the conversations message composer (mention editor + dropdown + message input box) so the routine editor's InitialMessage field uses the mention editor without an ng-conversations dependency cycle — and the composer's mention/command triggers are PLUGGABLE: a generic ComposerTriggerProvider contract (TriggerChar/Key/Priority/GetSuggestions, generic MentionSuggestion with provider-supplied presets) with two supply modes (explicit [TriggerProviders] list, or ClassFactory discovery via @RegisterClass(ComposerTriggerProvider,'<key>') filtered by [ExcludedTriggerKeys]), leaving ng-composer with ZERO AI knowledge; the AI plugins moved to ng-conversations (composer-plugins: 'agent-mentions' '@' agents+users w/ configuration presets, 'record-mentions' '#' entities+queries, 'skill-commands' '/' skills — tree-shake-guarded by LoadComposerPlugins(); MentionAutocompleteService moved back to ng-conversations as a BaseSingleton engine shared by plugins and components) plus a new mj-ai-composer wrapped component that proxies the full mj-message-input-box surface with the AI triggers built in and familiar EnableAgentMentions/EnableEntityMentions/EnableSkillCommands convenience flags (the chat composer now uses it); the routine editor uses discovery mode with agent-mentions excluded.

### Patch Changes

- 13716e4: Add the canonical confirm-prompt primitives to `@memberjunction/ng-ui-components` and migrate every native `window.confirm()` in MJ Explorer onto them.

  **`@memberjunction/ng-ui-components` (new capability):**
  - New **`<mj-confirm-dialog>`** — the canonical confirmation dialog (danger/warning/info/default variants, title + message + detail lines, MJ left-confirm button order, `Processing` state, Esc/backdrop dismissal inherited from `mj-dialog`).
  - New **`MJConfirmService`** — the imperative, Promise-based replacement for `window.confirm()`: `await confirm.Confirm('Discard changes?')` / `ConfirmDelete({ message, detail, confirmText })`. Mounts the dialog on `document.body`, resolves `true`/`false`, tears down on settle.
  - **Layering fix:** service-spawned dialogs are lifted into their own stacking context (z-index 20000) so a confirm launched over a drawer, slide-panel, or `mj-window` renders above that overlay instead of dimmed and unclickable beneath its backdrop (previously each swallowed click could re-trigger the caller and stack another dialog). Declarative template usage is unchanged.

  **Consumers — 47 native `confirm()` prompts migrated** across 23 files in 6 packages: dashboards (Credentials, MCP, Tags/Autotagging/Prompts, QueryBrowser, FormBuilder, ComponentStudio, DatabaseDesigner), core-entity-forms (Queries, Templates, Tests, Lists, template editor), artifacts (version restore), ai-test-harness (save/clear/delete/import), conversations (collection + artifact share modals, collection tree/view — whose ten native `alert()`s were also replaced with `MJNotificationService` toasts), and credentials (the credential/type/category edit-panel deletes, adding the package's missing `ng-ui-components` dependency). Deletes route through `ConfirmDelete` (red confirm, "Delete"/"Remove" labels); discards and overwrite warnings through `Confirm`. Handlers that gate on the answer were made async only after verifying every caller is fire-and-forget.

  The single intentional exception is DatabaseDesigner's `ModifyPanelCanClose` — a synchronous `[CanClose]` guard that must return a boolean immediately, documented as such in `MJConfirmService`'s docs.

  No public API changes in the consumer packages. Verified with per-package unit test runs (~2,200 tests across touched packages), full-page light+dark state screenshots of 8 distinct surfaces, and live end-to-end executions of the true paths.

- 6e10f66: Export the components `ConversationsModule` declares from `public-api` so consumers embedding `mj-conversation-chat-area` can build under Angular's local-compilation / HMR mode. 15 module-exported components (e.g. `ActionableCommandsComponent`) were missing from `public-api.ts`; a consumer app importing `ConversationsModule` and running `ng serve --hmr` failed with NG3004 ("Unable to import component … not exported from @memberjunction/ng-conversations"), while full (non-HMR) builds were unaffected. Additive re-exports only — no behavior change, no new dependencies.
- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [13716e4]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [ad9f4a3]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/graphql-dataprovider@5.45.0
  - @memberjunction/ng-ui-components@5.45.0
  - @memberjunction/ng-artifacts@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/ai-engine-base@5.45.0
  - @memberjunction/ai-core-plus@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ng-user-routines@5.45.0
  - @memberjunction/ng-composer@5.45.0
  - @memberjunction/ai-agent-client@5.45.0
  - @memberjunction/ng-testing@5.45.0
  - @memberjunction/ng-base-types@5.45.0
  - @memberjunction/ng-code-editor@5.45.0
  - @memberjunction/ng-container-directives@5.45.0
  - @memberjunction/ng-media-player@5.45.0
  - @memberjunction/ng-notifications@5.45.0
  - @memberjunction/ng-resource-permissions@5.45.0
  - @memberjunction/ng-shared-generic@5.45.0
  - @memberjunction/ng-tasks@5.45.0
  - @memberjunction/conversations-runtime@5.45.0
  - @memberjunction/interactive-component-types@5.45.0
  - @memberjunction/ng-forms@5.45.0
  - @memberjunction/ng-whiteboard@5.45.0
  - @memberjunction/ai@5.45.0
  - @memberjunction/ai-realtime-client@5.45.0
  - @memberjunction/ng-agent-client@5.45.0
  - @memberjunction/ng-markdown@5.45.0

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

### Patch Changes

- f8be8a0: Consolidate collapsible/disclosure UI onto the canonical `<mj-accordion-panel>` across MJ Explorer, and level up the accordion component itself.

  **`@memberjunction/ng-ui-components` (the component):**
  - New **`MJAccordionModule`** — bundles the panel + all three slot directives (`mjAccordionTitle`, `mjAccordionActions`, `mjAccordionBody`) so consumers import one symbol instead of four (works in both NgModule and standalone `imports`). An NgModule is used because AOT can't expand a value-array across a compiled-package boundary (NG1010) and an `as const` tuple is rejected by the `imports` type (TS2322).
  - New lazy **`[mjAccordionBody]`** slot — heavy bodies (code editors, grids, charts) instantiate on first expand and stay alive for animated re-toggle, so consumers don't have to reason about content weight or hand-write `@if (expanded)`.
  - Hardening: `--sm`/`--disabled`/`--muted-icon` modifiers scoped to child combinators (no nested-panel style bleed); `hasBeenExpanded` made non-public per naming conventions; added a DOM test proving the module exposes every declarable.

  **~50 disclosure surfaces migrated** from bespoke `<div (click)>`-header + `@if` markup to `<mj-accordion-panel>` across 20 Angular packages — dashboard-viewer config panels, DevTools Class Registry, Version History diff/snapshot groups, the test-run dialog, Explorer section toggles (about-dialog, sql-logging, SystemDiagnostics, App Roles, Home add-pin, Integration activity, Actions/Permissions/Credentials/Testing/ComponentStudio), and Generic components (agents, clustering, conversations, search, entity-viewer, filter-builder, record-tags, resource-permissions, core-entity-forms). Each replaces a non-focusable `<div (click)>` header with a real `<button [attr.aria-expanded]>` — a genuine accessibility improvement, not cosmetic — and deletes the per-consumer collapse chrome CSS. Card-based collapsibles, trees, and fill-panes are intentionally out of scope (they route to their own primitives).

  No public API changes in the consumer packages (internal refactor). Verified: all affected package test suites pass, CI UI gates green (design tokens + button overrides), and a full audit confirmed side-effects preserved with two visual regressions caught and fixed (SystemDiagnostics severity tint restored with semantic tokens; cluster-scatter members list scroll-confined via `[Fill]`).
  </content>

- 18b5bf0: Predictive Studio — business-user experience + a deterministic prediction-builder agent

  **`@memberjunction/predictive-studio-core`** — adds the **trust translator** (`deriveTrustVerdict`): turns a model's raw metrics into a plain-language Poor/Fair/Good/Excellent verdict + a `canAct` action gate. Shared by the UI (catalog badges + workspace gate) and the agent's publish gate, so a coin-flip / unmeasured model is fail-safe blocked (never silently acted on or published).

  **`@memberjunction/predictive-studio`** — elevates the Model Development Agent into a domain-builder (Database-Designer pattern): a deterministic `PredictiveStudioPipelineBuilder` (pure code, no LLM) turns the agent's approved `ModelingPlanSpec` into a real `MJ: ML Training Pipeline`, trains it, and **publishes only if the trust verdict clears the bar**; a `PredictiveStudioPipelineBuilderAgent` code sub-agent wraps it and a `PredictiveStudioModelDevAgent` orchestrator forces approve→build deterministically. Covered by unit, in-process integration, and an AgentRunner-driven agent-loop test.

  **`@memberjunction/ng-dashboards`** — a new business-user **Predictions** surface (the default Predictive Studio nav item): a catalog of published models reframed as plain-language predictions with trust badges (Poor/unmeasured blocked as "Needs an analyst"); a trust-gated workspace with a ranked at-risk list, plain-language drivers, and four actions (review / save scores / send to a list / export); and a "+ New prediction" docked Model Dev Agent co-pilot. Zero ML jargon — the analyst surfaces remain as Advanced.

  Also **consolidates the Predictive Studio nav from eight flat top-level items into three doors** — `Predictions` (business), `Studio` (the build/run workbench: Overview · Pipelines · Algorithm Catalog · Experiments · Compare Runs), and `Models` (Model Registry · Models in Production). The two workbench doors are single resources hosting an internal left-nav that swaps the existing section panels, with the active section round-tripped through a `section` query param (deep links + back/forward). The seven old per-section resources and the legacy monolith dashboard are removed. Also **fixes the embedded "New prediction" / Model Dev Agent co-pilot** not sending the first message: the chat-area was missing its conversation lifecycle wiring (`isNewConversation` + `conversationCreated`), so the suppressed empty-state input had no conversation to write into and silently no-op'd.

  **`@memberjunction/ng-conversations`** — fixes the realtime session widget's surface/Details panel not opening for a new user (or the agent): the on-demand "Details peek" no longer also requires the cross-session disclosure ratchet, so it opens at any level.

- be5ab50: Prevent AI agent runs from bleeding into other conversations when swapping conversations early after sending: agent-lifecycle events now carry the captured ConversationID so the chat-area drops events from a backgrounded conversation, pending-message auto-send is pinned to its target conversation, intent-check start/complete are guarded symmetrically, the shared agent runner tracks in-flight runs with a refcount, and new-conversation creation no longer produces a duplicate sidebar row.
- 0476455: Migrate inline empty-state placeholders to the canonical `<mj-empty-state>` component across Explorer and Generic Angular packages (UI-consistency objective O4), wiring the component into the packages that needed it (and adding `@memberjunction/ng-ui-components` as a dependency where missing). Also fixes reset-filter CTA correctness in three picker dialogs (sub-agent selector, add-action, action gallery) where the handler cleared only a subset of the active filter dimensions, and refines the UI adoption measurement script with a transparent three-tier empty-state count (raw widened → non-placeholder false-positives → wrappers-around-migrated → genuine).
- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [f8be8a0]
- Updated dependencies [89ea055]
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
  - @memberjunction/ai-agent-client@5.44.0
  - @memberjunction/ai-engine-base@5.44.0
  - @memberjunction/ai-core-plus@5.44.0
  - @memberjunction/conversations-runtime@5.44.0
  - @memberjunction/graphql-dataprovider@5.44.0
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ng-ui-components@5.44.0
  - @memberjunction/ng-resource-permissions@5.44.0
  - @memberjunction/ng-testing@5.44.0
  - @memberjunction/ai@5.44.0
  - @memberjunction/ng-media-player@5.44.0
  - @memberjunction/ng-artifacts@5.44.0
  - @memberjunction/ai-realtime-client@5.44.0
  - @memberjunction/ng-whiteboard@5.44.0
  - @memberjunction/ng-agent-client@5.44.0
  - @memberjunction/ng-tasks@5.44.0
  - @memberjunction/ng-forms@5.44.0
  - @memberjunction/ng-notifications@5.44.0
  - @memberjunction/ng-base-types@5.44.0
  - @memberjunction/ng-code-editor@5.44.0
  - @memberjunction/ng-shared-generic@5.44.0
  - @memberjunction/ng-markdown@5.44.0
  - @memberjunction/ng-container-directives@5.44.0
  - @memberjunction/interactive-component-types@5.44.0

## 5.43.0

### Patch Changes

- 3eaa05a: Surface runnable queries under the '#' mention trigger alongside entities in the conversations autocomplete, dropdown, editor chips, and rendered message badges. Queries are permission-filtered via QueryInfo.UserCanRun, and entity mentions now render with their display name and configured icon.
- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
- Updated dependencies [54183aa]
  - @memberjunction/core@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ai-core-plus@5.43.0
  - @memberjunction/ai@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/ng-ui-components@5.43.0
  - @memberjunction/ai-agent-client@5.43.0
  - @memberjunction/ai-engine-base@5.43.0
  - @memberjunction/ng-testing@5.43.0
  - @memberjunction/ng-artifacts@5.43.0
  - @memberjunction/ng-base-types@5.43.0
  - @memberjunction/ng-code-editor@5.43.0
  - @memberjunction/ng-container-directives@5.43.0
  - @memberjunction/ng-notifications@5.43.0
  - @memberjunction/ng-resource-permissions@5.43.0
  - @memberjunction/ng-shared-generic@5.43.0
  - @memberjunction/ng-tasks@5.43.0
  - @memberjunction/conversations-runtime@5.43.0
  - @memberjunction/graphql-dataprovider@5.43.0
  - @memberjunction/interactive-component-types@5.43.0
  - @memberjunction/ai-realtime-client@5.43.0
  - @memberjunction/ng-agent-client@5.43.0
  - @memberjunction/ng-whiteboard@5.43.0
  - @memberjunction/ng-forms@5.43.0
  - @memberjunction/ng-markdown@5.43.0

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

- e4235fd: Add clipboard paste-in and copy-out to the remote-browser human-control (Self-Hosted Chrome canvas viewer), which previously couldn't bridge the local and remote clipboards.
  - **Paste-in:** a new `'text'` `RemoteBrowserHumanInput` kind, mapped (CDP) to the existing text-insertion path (`TypeAction` / `Input.insertText`) — no clipboard sync needed. The viewer captures the local `paste`, reads `clipboardData`, and relays the text to the remote page's focused element.
  - **Copy-out:** a new capability-gated `IRemoteBrowserSession.GetSelectionText()` (CDP `page.evaluate(window.getSelection())`) + a `GetRemoteBrowserSelection` GraphQL query; the viewer captures the local `copy`, fetches the remote selection, and writes it to the local clipboard via `navigator.clipboard.writeText` (best-effort, gated on `HumanTakeover`).

  Lets a human controlling the remote browser paste credentials in and copy text out. Tests added for the `'text'` mapping, `GetSelectionText`, and the channel relay.

- 3ee0f22: Fix `browser_AchieveGoal` losing its result on long goal loops — make the goal run async (start + poll) instead of one blocking request.

  A goal-driven browser run (computer-use loop) can take minutes, but `ExecuteRemoteBrowserGoal` ran the whole loop inside a single synchronous GraphQL mutation. The client held one HTTP request open for the entire loop, which died at a transport boundary (browser fetch / proxy / ngrok idle / session-janitor churn) before the loop finished — so the agent got `"no response from the server"` even though the loop completed successfully server-side (confirmed in a live run: 17 successful Gemini-3.1-Flash-Lite controller/judge prompt runs, client got null).
  - **Server:** `ExecuteRemoteBrowserGoal` now STARTS the goal (fires the loop without awaiting), registers it in a new process-local `RemoteBrowserGoalRegistry` (`BaseSingleton`, keyed by agent-session id, TTL-swept), and returns a `GoalRunID` with `Status: 'Running'` immediately. The background completion finalizes the observability step and stores the terminal outcome. New `GetRemoteBrowserGoalResult(agentSessionID, goalRunID)` query reads the registry (ownership-gated).
  - **Client:** the Remote Browser channel's `achieveGoal` starts the goal then POLLS `GetRemoteBrowserGoalResult` (every 2.5s, up to 5 min) until terminal — each request short, so no transport timeout. Bounds are protected fields tests can shrink.

  Tests added: `RemoteBrowserGoalRegistry` lifecycle (7) and the channel start→poll→terminal flow incl. failure/no-start/still-running (5).

- a5d4a15: Fix the "session ID missing to drive computer use" race in the Remote Browser realtime channel with defense-in-depth.

  The channel's `AgentSessionID` is a live getter over the session service's current id — `null` in the window BEFORE the session mints (the realtime model can fire a `browser_*` tool the first beat it connects, before `mintSession` binds the id) and again after teardown. The three model-facing tool paths (`ApplyAgentTool`, `achieveGoal`/`browser_AchieveGoal`, `interpretPage`/`browser_DescribePage`+`browser_LocateElement`) previously read the id synchronously and failed instantly when it was null.
  - New `BaseRealtimeChannelClient.ResolveAgentSessionId()` (generic, so every channel benefits) briefly WAITS for the id to bind — resolving immediately on the common path, polling on a short interval up to a bounded timeout, and bailing fast if the channel is disposed (`Context` goes null) so it never waits on a torn-down session. Wait bounds are protected fields tests can shrink.
  - The three tool paths now route through it, so a tool invoked a beat early waits for the session to come live instead of returning a hard failure to the model.

  Tests added for the mint-race wait + the existing null-forever guards (shortened so they stay fast).

- da5a3dd: Group conversations into collapsible, nestable folders (backed by MJ: Projects) and make the Collections view's artifact organization fluid — drag-and-drop, frictionless multi-select, bulk move, a staging shelf, a navigator pane, and a right-click "Open source conversation". Also fixes stale-cache reads after moves/deletes (BypassCache), conversation-folder delete not refreshing, and cached-tab navigation that opened the Conversations app without selecting the conversation.
- Updated dependencies [313c1c5]
- Updated dependencies [256ab06]
- Updated dependencies [9b9b484]
- Updated dependencies [e7c2437]
- Updated dependencies [5fde509]
- Updated dependencies [4ec1732]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/ng-ui-components@5.42.0
  - @memberjunction/ai-core-plus@5.42.0
  - @memberjunction/core@5.42.0
  - @memberjunction/graphql-dataprovider@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/ng-testing@5.42.0
  - @memberjunction/ng-artifacts@5.42.0
  - @memberjunction/ng-forms@5.42.0
  - @memberjunction/ng-resource-permissions@5.42.0
  - @memberjunction/ai-engine-base@5.42.0
  - @memberjunction/ng-tasks@5.42.0
  - @memberjunction/conversations-runtime@5.42.0
  - @memberjunction/ai-agent-client@5.42.0
  - @memberjunction/ng-base-types@5.42.0
  - @memberjunction/ng-code-editor@5.42.0
  - @memberjunction/ng-container-directives@5.42.0
  - @memberjunction/ng-notifications@5.42.0
  - @memberjunction/ng-shared-generic@5.42.0
  - @memberjunction/interactive-component-types@5.42.0
  - @memberjunction/ai@5.42.0
  - @memberjunction/ai-realtime-client@5.42.0
  - @memberjunction/ng-agent-client@5.42.0
  - @memberjunction/ng-whiteboard@5.42.0
  - @memberjunction/ng-markdown@5.42.0

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
- a5f5472: Remote Browser channel + new realtime voice providers + computer-use enrichment.
  - **Remote Browser channel** (`@memberjunction/remote-browser-*`): an in-house realtime channel where an agent drives a live, CDP-connected browser while it talks (sales demos, support walkthroughs, trainer agents). New `AIRemoteBrowserProvider` registry (migration V202606161000) with JSONType capability gating; a universal `remote-browser-base` (driver family + `RemoteBrowserEngineBase`), a shared `remote-browser-cdp` kit (one lossless action mapper + `CdpRemoteBrowserSession`), a `remote-browser-server` engine + `RemoteBrowserChannel` (control arbiter, control modes AgentOnly/ViewOnly/Collaborative vs strategies ComputerUse/NativeAI), and five thin backends (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).
  - **computer-use** enriched additively into a complete browser-I/O + perception engine: CSS-selector-aware actions, CDP screencast, MouseMove, accessibility-snapshot/QueryElement/GetVisibleText/GetTitle/WaitForLoadState — every consumer benefits, existing vision/coordinate path unchanged.
  - **New realtime model providers**: xAI Grok Voice (`@memberjunction/ai-xai`, OpenAI-Realtime-compatible) and Inworld (`@memberjunction/ai-inworld`), with vendor/model seeds.
  - **Console logging improvements** across `@memberjunction/ai-core-plus`, `ai-engine-base`, `ai-prompts`, `aiengine`, `cli`, `generic-database-provider`, `metadata-sync`, and the bootstrap/forms packages.

- 4b3fb9d: Add Skip entity-form support: #entity mentions in conversations, interactive-form host wiring, and reusable form-field components
- c5d93a0: Metadata changes (default app agent -> Sage)

### Patch Changes

- 8c8b658: Realtime UX wave 2 — the progressive-disclosure console (pure-audio-first overlay with the breathing hero orb, disclosure levels 0–4 ratcheted per-user via UserInfoEngine, gear density escape hatch, unified app-bar, fused composer dock; content never flips the console open — the one auto-reveal is a channel's first agent activity, finished artifacts arrive as glowing unfocused tabs, Activity tab pinned last); audio-reactive call visuals (BaseRealtimeClient GetAudioActivity capability — per-direction RMS + 9-bin spectrum metered on all four drivers via a shared RealtimePcmPlayback master-gain tap / WebRTC stream analysers — driving the hero + app-bar orbs and a true-spectrum EQ through a zero-CD rAF loop, with turn-state fallback). Whiteboard: OneNote-style PAGES (v2 JSON with tolerant v1 migration, AddPage/SwitchPage/RenamePage agent tools, page strip with inline rename + right-click Rename/Delete/New-page context menus, agent-authored page garnish), multi-select (marquee, shift-click, single-undo group drag/delete), hold-to-zoom, multi-page HTML/SVG export, shared active-page note on all item tools, UUIDsEqual compliance. ElevenLabs: tool-schema sanitizer (non-string enums + leaf descriptions, fingerprint-stable) and the absorbed-tool-result voice nudge. Conversations: shared auto-naming helper + race-free realtime naming lifecycle on SessionStarted$, slide-panel splitter rework, angular-split dependency removed. Plus integration-test script groundwork (server/client/runquery cache suites) and cache-layer fixes carried on this branch.
- 659ee5b: Realtime co-agent pairing & type configuration. New `MJ: AI Agent Paired Agents` junction (opt-in: a co-agent with zero rows stays universal — today's zero-config default unchanged; rows restrict + prebuild its target list with an IsDefault preselection), `AIAgent.TypeConfiguration` (agent-type-specific JSON: realtime model preference, per-provider voice, tone/speaking style, override policy, narration pacing), and `AIAgentType.ConfigSchema`/`DefaultConfiguration` (the type publishes a JSON Schema + type-level defaults; effective config = type defaults <- agent config <- runtime overrides, deep-merged per key, server-authoritative). Runtime overrides ride a new `configOverridesJson` session-start argument gated by the seeded `Realtime: Advanced Session Controls` authorization (Developer-mapped) — enforced server-side, disclosed client-side (unauthorized users silently get defaults). ValidateAsync server subclasses enforce ConfigSchema conformance, Realtime-type co-agents, and at-most-one-default-per-co-agent. Conversations UX: co-agent picker for everyone with more than one permitted co-agent (persisted via UserInfoEngine), pairing-constrained target selection, authorization-gated model/config override pickers.
- 4b30726: Fix stale collection contents after removing an artifact: read collection membership from the join entity directly instead of via a subquery, so the per-entity RunView cache invalidates correctly on add/remove.
- ef5a5d7: Remove the dead RealtimeCallOverlayComponent — the pre-progressive-console call overlay deleted in Realtime wave 2 was silently resurrected by the voice→realtime rename merge (rename-vs-delete); nothing instantiates it, no ClassFactory registration, no manifest impact.
- 15b743b: Real-Time AI Agents — Sessions, Channels & the Realtime Model (plans/ai-agent-sessions.md). Adds the AIAgentSession/AIAgentChannel/AIAgentSessionChannel schema (+ AgentSessionID on AIAgentRun/ConversationDetail, CloseReason on AIAgentSession); the BaseRealtimeModel server primitive with OpenAIRealtime + GeminiRealtime drivers (server-bridged StartSession and client-direct ephemeral-token CreateClientSession, optional SendContextNote/RequestSpokenUpdate interim updates); the new @memberjunction/ai-realtime-client package with the BaseRealtimeClient browser abstraction + OpenAI/Gemini client drivers resolved via ClassFactory by provider key; the Realtime agent type + Voice Co-Agent with RealtimeSessionRunner/RealtimeToolBroker, AgentMemoryContextBuilder extraction, server session lifecycle (SessionManager, SessionJanitor, start/close/heartbeat + client-direct resolvers with delegated-run progress streaming, AwaitingFeedback resume, co-agent observability runs, user-selectable realtime model); the full-panel realtime voice call UX in ng-conversations (phone trigger + agent/model picker, banner/thread/activity rail, delegation working/result cards with provenance, ephemeral paced first-person progress narration driven by DB prompt templates, in-call text composer); Realtime Voice admin (AI Analytics dashboard sections, session/channel custom forms, agent Runs|Sessions execution history); and Query Builder/Strategist reliability fixes (entity catalog in prompt, Get Entity Details sample caps + semantic fallback, plan formatting). Also: the standalone @memberjunction/ng-whiteboard package (collaborative board with agent tool API, sandboxed interactive widgets + input bridge, markdown panels, exports, cancelable before/after events); ElevenLabs Agents + AssemblyAI Voice Agent realtime provider pairs (4-provider matrix, zero contract changes); session review mode with multi-leg resume carryover (timeline dividers, artifact junction closure, prior-transcript model hydration); delegation cancel channel; usage telemetry relay; Realtime Co-Agent rename with run-step/prompt-run observability.
- 1568bae: Realtime ledger completion + two field bugs. SERVER CHANNEL PLUGIN HALF: `ServerPluginClass` is now consumed — `BaseRealtimeChannelServer` lifecycle contract in @memberjunction/ai, `RealtimeChannelServerHost` (ClassFactory resolution mirroring the client half, per-session instances, failure-isolated hooks, post-close dispose linger) in ai-agents with a `WhiteboardChannelServer` reference impl that validates/canonicalizes landed board saves, wired through SessionManager create/close and the channel-state save path. TRANSCRIPT CORRECTIONS END-TO-END: `RealtimeClientTranscript.ReplacesPrevious` (stamped by the ElevenLabs driver on `agent_response_correction`) replaces the caption in place and `RelayRealtimeTranscript(replacesPrevious)` updates the persisted turn instead of appending. ASSEMBLYAI RESUME WINDOW: one-shot `session.resume` reattach on unexpected socket drop (mic/playout survive; failed/second drop falls through to the old fatal path). WHITEBOARD: widget srcdoc rebuilt per mount via a view-scoped pure pipe — SVG charts survive page switches/lazy remounts, and mounted widgets no longer reload on unrelated journal ops (the old journal-invalidated identity cache was both stale on remount and over-eager on 'replace'). CONVERSATIONS: surface-panel (re)creation lands on the marquee channel tab (the whiteboard) instead of the Activity rail, the agent's first stroke reveals synchronously, and session review now merges channel states across ALL chain legs (newest leg with a saved board wins) so resumed sessions never hide an earlier leg's drawing. Plus Per-Minute/Per-Hour AI model price unit types seeded via metadata.
- fb2a22f: refactor(conversations): rename Voice* session/adapter/component symbols to Realtime* (no functional change)
- Updated dependencies [8fd6f59]
- Updated dependencies [6f227ab]
- Updated dependencies [2e48d1a]
- Updated dependencies [84089ae]
- Updated dependencies [34d17e2]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
- Updated dependencies [4b3fb9d]
- Updated dependencies [fb2a22f]
- Updated dependencies [c5d93a0]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ai-realtime-client@5.41.0
  - @memberjunction/ai@5.41.0
  - @memberjunction/graphql-dataprovider@5.41.0
  - @memberjunction/ai-engine-base@5.41.0
  - @memberjunction/ng-whiteboard@5.41.0
  - @memberjunction/ai-core-plus@5.41.0
  - @memberjunction/ng-notifications@5.41.0
  - @memberjunction/conversations-runtime@5.41.0
  - @memberjunction/ng-artifacts@5.41.0
  - @memberjunction/ai-agent-client@5.41.0
  - @memberjunction/ng-testing@5.41.0
  - @memberjunction/ng-base-types@5.41.0
  - @memberjunction/ng-code-editor@5.41.0
  - @memberjunction/ng-container-directives@5.41.0
  - @memberjunction/ng-resource-permissions@5.41.0
  - @memberjunction/ng-shared-generic@5.41.0
  - @memberjunction/ng-tasks@5.41.0
  - @memberjunction/interactive-component-types@5.41.0
  - @memberjunction/ng-forms@5.41.0
  - @memberjunction/ng-agent-client@5.41.0
  - @memberjunction/ng-markdown@5.41.0
  - @memberjunction/ng-ui-components@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- Updated dependencies [3da89ef]
  - @memberjunction/ng-artifacts@5.40.2
  - @memberjunction/ai-agent-client@5.40.2
  - @memberjunction/ai-engine-base@5.40.2
  - @memberjunction/ai@5.40.2
  - @memberjunction/ai-core-plus@5.40.2
  - @memberjunction/ng-testing@5.40.2
  - @memberjunction/ng-agent-client@5.40.2
  - @memberjunction/ng-base-types@5.40.2
  - @memberjunction/ng-code-editor@5.40.2
  - @memberjunction/ng-container-directives@5.40.2
  - @memberjunction/ng-forms@5.40.2
  - @memberjunction/ng-markdown@5.40.2
  - @memberjunction/ng-notifications@5.40.2
  - @memberjunction/ng-resource-permissions@5.40.2
  - @memberjunction/ng-shared-generic@5.40.2
  - @memberjunction/ng-tasks@5.40.2
  - @memberjunction/ng-ui-components@5.40.2
  - @memberjunction/graphql-dataprovider@5.40.2
  - @memberjunction/interactive-component-types@5.40.2
  - @memberjunction/core@5.40.2
  - @memberjunction/core-entities@5.40.2
  - @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-agent-client@5.40.1
  - @memberjunction/ai-engine-base@5.40.1
  - @memberjunction/ai-core-plus@5.40.1
  - @memberjunction/ng-testing@5.40.1
  - @memberjunction/ng-artifacts@5.40.1
  - @memberjunction/ng-base-types@5.40.1
  - @memberjunction/ng-code-editor@5.40.1
  - @memberjunction/ng-container-directives@5.40.1
  - @memberjunction/ng-notifications@5.40.1
  - @memberjunction/ng-resource-permissions@5.40.1
  - @memberjunction/ng-shared-generic@5.40.1
  - @memberjunction/ng-tasks@5.40.1
  - @memberjunction/graphql-dataprovider@5.40.1
  - @memberjunction/interactive-component-types@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/ng-agent-client@5.40.1
  - @memberjunction/ng-forms@5.40.1
  - @memberjunction/ai@5.40.1
  - @memberjunction/ng-markdown@5.40.1
  - @memberjunction/ng-ui-components@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- 40e90fa: Show all distinct artifacts on a conversation message instead of only the most recently created one — a message that carries both a report and a standalone generated image now renders a card for each. Multiple versions of the same artifact still collapse to the latest. Also halves the inline image/video preview height (280px → 140px) so thumbnails don't dominate the message.
- 6957711: Clean up the conversation empty-state welcome screen (remove duplicate sidebar toggle, fix non-rendering suggested-prompt icons, keep it scroll-free at 1080p) and fix the chat resource on mobile so the conversation sidebar slides over the chat with a tap-to-close backdrop instead of squishing it. Also center the chat header actions vertically.
- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [7bbfd62]
- Updated dependencies [f2cca15]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
- Updated dependencies [40e90fa]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/graphql-dataprovider@5.40.0
  - @memberjunction/ng-artifacts@5.40.0
  - @memberjunction/ai-agent-client@5.40.0
  - @memberjunction/ai-engine-base@5.40.0
  - @memberjunction/ai-core-plus@5.40.0
  - @memberjunction/ng-testing@5.40.0
  - @memberjunction/ng-base-types@5.40.0
  - @memberjunction/ng-code-editor@5.40.0
  - @memberjunction/ng-container-directives@5.40.0
  - @memberjunction/ng-notifications@5.40.0
  - @memberjunction/ng-resource-permissions@5.40.0
  - @memberjunction/ng-shared-generic@5.40.0
  - @memberjunction/ng-tasks@5.40.0
  - @memberjunction/interactive-component-types@5.40.0
  - @memberjunction/ng-agent-client@5.40.0
  - @memberjunction/ng-forms@5.40.0
  - @memberjunction/ai@5.40.0
  - @memberjunction/ng-markdown@5.40.0
  - @memberjunction/ng-ui-components@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [f60e340]
- Updated dependencies [bd95e83]
- Updated dependencies [3c53858]
- Updated dependencies [4bc6fb4]
- Updated dependencies [3b29882]
- Updated dependencies [d1cc0ad]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [5b4102c]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/graphql-dataprovider@5.39.0
  - @memberjunction/ng-ui-components@5.39.0
  - @memberjunction/ng-shared-generic@5.39.0
  - @memberjunction/ai-core-plus@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ng-markdown@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai@5.39.0
  - @memberjunction/ai-engine-base@5.39.0
  - @memberjunction/ai-agent-client@5.39.0
  - @memberjunction/ng-testing@5.39.0
  - @memberjunction/ng-artifacts@5.39.0
  - @memberjunction/ng-base-types@5.39.0
  - @memberjunction/ng-code-editor@5.39.0
  - @memberjunction/ng-container-directives@5.39.0
  - @memberjunction/ng-notifications@5.39.0
  - @memberjunction/ng-resource-permissions@5.39.0
  - @memberjunction/ng-tasks@5.39.0
  - @memberjunction/interactive-component-types@5.39.0
  - @memberjunction/ng-forms@5.39.0
  - @memberjunction/ng-agent-client@5.39.0

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

- b2e6782: Propagate `inputArtifacts` from a parent agent to its sub-agents so delegates inherit the artifact manifest and tools (e.g. a Codesmith delegate can read a Data Snapshot the parent references). Add `group_aggregate`, `compute` (safe arithmetic expression parser), `filter`, and `percentile` tools to the DataSnapshot artifact tool library. Improve client-side snapshot capture to wait for actual rows (not just registered tables) and bump the capture timeout to 15s so query-backed / server-paged components have time to load.
- a529993: Keep the message header gear icon right-anchored after agent completion by moving the right-anchor onto the whole right-side cluster, and surface the frozen live-elapsed value as a fallback when neither the agent run nor message timestamps yield a duration.
- Updated dependencies [6b6c321]
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [d285996]
- Updated dependencies [8bd97f3]
- Updated dependencies [6a3ac36]
- Updated dependencies [918d663]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [b26d0ee]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/ai-core-plus@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/interactive-component-types@5.38.0
  - @memberjunction/ng-artifacts@5.38.0
  - @memberjunction/graphql-dataprovider@5.38.0
  - @memberjunction/ng-code-editor@5.38.0
  - @memberjunction/ai-engine-base@5.38.0
  - @memberjunction/ng-forms@5.38.0
  - @memberjunction/ng-tasks@5.38.0
  - @memberjunction/ng-testing@5.38.0
  - @memberjunction/ai-agent-client@5.38.0
  - @memberjunction/ng-base-types@5.38.0
  - @memberjunction/ng-container-directives@5.38.0
  - @memberjunction/ng-notifications@5.38.0
  - @memberjunction/ng-resource-permissions@5.38.0
  - @memberjunction/ng-shared-generic@5.38.0
  - @memberjunction/ai@5.38.0
  - @memberjunction/ng-agent-client@5.38.0
  - @memberjunction/ng-markdown@5.38.0
  - @memberjunction/ng-ui-components@5.38.0

## 5.37.0

### Patch Changes

- 86a9d0e: Make the floating chat-agents overlay bubble user-draggable (mouse, touch, or pen) so it can be moved out of the way of underlying app buttons it would otherwise occlude. Position persists per-user; the expanded panel anchors to the bubble's location and clamps so the chat interface always stays visible. MJExplorer passes its shell-header height as a top boundary so the bubble cannot be dragged into the header.
- 22b775f: Add `client:capture-data-snapshot` actionable command so agents can request the user's live view of an artifact (including client-side filter/sort/selection state) before answering. Wires the command through SkipProxyAgent and adds a chat-UI handler that captures the snapshot, attaches it as a Data Snapshot artifact, and auto-sends the followup question.
- 4f15f31: Add Feedback Explorer dashboard with 1–10 conversation-rating modal persisting to ConversationDetail, plus a migration granting the UI role Create/Update on MJ: User Settings so user-scoped preferences (e.g. Agent Feedback consent) stop silently failing.
- Updated dependencies [dadbde9]
- Updated dependencies [22b775f]
- Updated dependencies [4f15f31]
  - @memberjunction/graphql-dataprovider@5.37.0
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ai-agent-client@5.37.0
  - @memberjunction/ng-testing@5.37.0
  - @memberjunction/ng-artifacts@5.37.0
  - @memberjunction/ng-notifications@5.37.0
  - @memberjunction/ai-engine-base@5.37.0
  - @memberjunction/ng-forms@5.37.0
  - @memberjunction/ng-tasks@5.37.0
  - @memberjunction/ng-base-types@5.37.0
  - @memberjunction/ng-code-editor@5.37.0
  - @memberjunction/ng-container-directives@5.37.0
  - @memberjunction/ng-resource-permissions@5.37.0
  - @memberjunction/ng-shared-generic@5.37.0
  - @memberjunction/ng-agent-client@5.37.0
  - @memberjunction/ai@5.37.0
  - @memberjunction/ng-markdown@5.37.0
  - @memberjunction/ng-ui-components@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- Updated dependencies [f29b7c0]
- Updated dependencies [1c0fce9]
- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/graphql-dataprovider@5.36.0
  - @memberjunction/ng-ui-components@5.36.0
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ai-agent-client@5.36.0
  - @memberjunction/ng-testing@5.36.0
  - @memberjunction/ng-artifacts@5.36.0
  - @memberjunction/ng-notifications@5.36.0
  - @memberjunction/ng-forms@5.36.0
  - @memberjunction/ng-resource-permissions@5.36.0
  - @memberjunction/ai-engine-base@5.36.0
  - @memberjunction/ai-core-plus@5.36.0
  - @memberjunction/ng-base-types@5.36.0
  - @memberjunction/ng-code-editor@5.36.0
  - @memberjunction/ng-shared-generic@5.36.0
  - @memberjunction/ng-tasks@5.36.0
  - @memberjunction/ng-container-directives@5.36.0
  - @memberjunction/ng-agent-client@5.36.0
  - @memberjunction/ai@5.36.0
  - @memberjunction/ng-markdown@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- 2c905e3: Fix Save-to-Collection dialog so a new collection can be created from the empty state. Previously the "Create new collection…" affordance only rendered inside the collection tree, which is hidden when the user has no editable collections — leaving no way to create the first one.
- 32c4a02: Unify artifact and attachment delivery paths for AI agents. Seperate artifact storage from rendering. Every attachement now creates paired Artifact + ArtifactVersion and routing functions exist to replace hardcoded MIME allowlist. Unregistered file types are rejected at upload time unless the agent opts into AcceptUnregisteredFiles. Adds wildecard MIME resolver. `mj artifacts reclassify` for legacy rows
- Updated dependencies [6fa8e13]
- Updated dependencies [ee380f7]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [77e4782]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/ng-ui-components@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/graphql-dataprovider@5.35.0
  - @memberjunction/ai-agent-client@5.35.0
  - @memberjunction/ai-core-plus@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/ai-engine-base@5.35.0
  - @memberjunction/ng-testing@5.35.0
  - @memberjunction/ng-artifacts@5.35.0
  - @memberjunction/ng-base-types@5.35.0
  - @memberjunction/ng-code-editor@5.35.0
  - @memberjunction/ng-container-directives@5.35.0
  - @memberjunction/ng-notifications@5.35.0
  - @memberjunction/ng-resource-permissions@5.35.0
  - @memberjunction/ng-shared-generic@5.35.0
  - @memberjunction/ng-tasks@5.35.0
  - @memberjunction/ng-forms@5.35.0
  - @memberjunction/ng-agent-client@5.35.0
  - @memberjunction/ai@5.35.0
  - @memberjunction/ng-markdown@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [8695f65]
- Updated dependencies [5abf790]
  - @memberjunction/core@5.34.1
  - @memberjunction/graphql-dataprovider@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/ai-agent-client@5.34.1
  - @memberjunction/ai-engine-base@5.34.1
  - @memberjunction/ng-testing@5.34.1
  - @memberjunction/ng-artifacts@5.34.1
  - @memberjunction/ng-base-types@5.34.1
  - @memberjunction/ng-code-editor@5.34.1
  - @memberjunction/ng-container-directives@5.34.1
  - @memberjunction/ng-notifications@5.34.1
  - @memberjunction/ng-resource-permissions@5.34.1
  - @memberjunction/ng-shared-generic@5.34.1
  - @memberjunction/ng-tasks@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/ng-forms@5.34.1
  - @memberjunction/ng-agent-client@5.34.1
  - @memberjunction/ai@5.34.1
  - @memberjunction/ng-markdown@5.34.1
  - @memberjunction/ng-ui-components@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- a6a16fa: Conversation sidebar now uses MJ design tokens for all text, borders, popovers, and status colors instead of hardcoded `rgba(255,255,255,X)` / `rgba(239,68,68,X)` / `#fb923c` / `rgba(0,0,0,0.4)` values. The "Pinned" and "Messages" section headers share the same style (no special background on Pinned), and the thumbtack icon no longer rotates when the section is collapsed/expanded.
- 389d356: Fix XSS vulnerability in search-result highlighters across form-field labels, collapsible-panel section names, and conversation search snippets. Extracted shared `HighlightSearchMatches` helper in `@memberjunction/global` that escapes each text segment individually after a literal-string match, so HTML in the source can never leak into `[innerHTML]` as live markup. Also restored multi-match highlighting that had regressed to single-match.
- ad61267: no migration
- Updated dependencies [b03bfb4]
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [11ae7e6]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [ad61267]
- Updated dependencies [72cb92e]
  - @memberjunction/ng-artifacts@5.34.0
  - @memberjunction/ng-markdown@5.34.0
  - @memberjunction/ai-agent-client@5.34.0
  - @memberjunction/ai-engine-base@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/ng-testing@5.34.0
  - @memberjunction/ng-agent-client@5.34.0
  - @memberjunction/ng-base-types@5.34.0
  - @memberjunction/ng-code-editor@5.34.0
  - @memberjunction/ng-container-directives@5.34.0
  - @memberjunction/ng-forms@5.34.0
  - @memberjunction/ng-notifications@5.34.0
  - @memberjunction/ng-resource-permissions@5.34.0
  - @memberjunction/ng-shared-generic@5.34.0
  - @memberjunction/ng-tasks@5.34.0
  - @memberjunction/ng-ui-components@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/graphql-dataprovider@5.34.0
  - @memberjunction/global@5.34.0
  - @memberjunction/ai@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [97ed790]
- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/graphql-dataprovider@5.33.0
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ai-agent-client@5.33.0
  - @memberjunction/ng-testing@5.33.0
  - @memberjunction/ng-artifacts@5.33.0
  - @memberjunction/ng-notifications@5.33.0
  - @memberjunction/ai-engine-base@5.33.0
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/ng-base-types@5.33.0
  - @memberjunction/ng-code-editor@5.33.0
  - @memberjunction/ng-container-directives@5.33.0
  - @memberjunction/ng-resource-permissions@5.33.0
  - @memberjunction/ng-shared-generic@5.33.0
  - @memberjunction/ng-tasks@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/ai@5.33.0
  - @memberjunction/ng-agent-client@5.33.0
  - @memberjunction/ng-forms@5.33.0
  - @memberjunction/ng-markdown@5.33.0
  - @memberjunction/ng-ui-components@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ai-agent-client@5.32.0
  - @memberjunction/ai-engine-base@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/ng-testing@5.32.0
  - @memberjunction/ng-artifacts@5.32.0
  - @memberjunction/ng-base-types@5.32.0
  - @memberjunction/ng-code-editor@5.32.0
  - @memberjunction/ng-container-directives@5.32.0
  - @memberjunction/ng-notifications@5.32.0
  - @memberjunction/ng-resource-permissions@5.32.0
  - @memberjunction/ng-shared-generic@5.32.0
  - @memberjunction/ng-tasks@5.32.0
  - @memberjunction/graphql-dataprovider@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/ng-agent-client@5.32.0
  - @memberjunction/ng-forms@5.32.0
  - @memberjunction/ai@5.32.0
  - @memberjunction/ng-markdown@5.32.0
  - @memberjunction/ng-ui-components@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- 6779c1e: Lazy field hydration in BaseEntity + smarter engine startup (~30x warm-load speedup, ~14s to ~470ms). Defers per-row Field construction until something mutates or walks Fields, removes a speculative per-view fast-start path, adds a `deferred` flag to `@RegisterForStartup` and an `EnsureLoaded()` shortcut on `BaseEngine` / `AIEngine`. DeveloperModeService and WorkspaceStateManager swapped weak `Get`/`Set` calls for typed accessors. EnsureLoaded calls added at AI engine consumption sites.
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [c8b6f8a]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
- Updated dependencies [0e3365f]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/graphql-dataprovider@5.31.0
  - @memberjunction/ai-agent-client@5.31.0
  - @memberjunction/ai-engine-base@5.31.0
  - @memberjunction/ai@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/ng-testing@5.31.0
  - @memberjunction/ng-agent-client@5.31.0
  - @memberjunction/ng-artifacts@5.31.0
  - @memberjunction/ng-base-types@5.31.0
  - @memberjunction/ng-code-editor@5.31.0
  - @memberjunction/ng-container-directives@5.31.0
  - @memberjunction/ng-forms@5.31.0
  - @memberjunction/ng-markdown@5.31.0
  - @memberjunction/ng-notifications@5.31.0
  - @memberjunction/ng-resource-permissions@5.31.0
  - @memberjunction/ng-shared-generic@5.31.0
  - @memberjunction/ng-tasks@5.31.0
  - @memberjunction/ng-ui-components@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-agent-client@5.30.1
- @memberjunction/ai-engine-base@5.30.1
- @memberjunction/ai@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/ng-testing@5.30.1
- @memberjunction/ng-agent-client@5.30.1
- @memberjunction/ng-artifacts@5.30.1
- @memberjunction/ng-base-types@5.30.1
- @memberjunction/ng-code-editor@5.30.1
- @memberjunction/ng-container-directives@5.30.1
- @memberjunction/ng-forms@5.30.1
- @memberjunction/ng-markdown@5.30.1
- @memberjunction/ng-notifications@5.30.1
- @memberjunction/ng-resource-permissions@5.30.1
- @memberjunction/ng-shared-generic@5.30.1
- @memberjunction/ng-tasks@5.30.1
- @memberjunction/ng-ui-components@5.30.1
- @memberjunction/graphql-dataprovider@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- c199f3b: Phase 2 of the unified permissions architecture: introduces the `IPermissionProvider` interface with 9 domain providers (Entity, Application Role, Dashboard, Resource, Artifact, AI Agent, Collection, Query, Access Control Rule) aggregated by a new `PermissionEngine` singleton, adds explicit Allow/Deny support to `EntityPermission`, and ships the Permissions admin dashboard. Includes migrations for the Permission Domain catalog, EntityPermission.Type column, Dashboard FK cascade delete, ResourcePermission.SharedByUserID, and UI role permission fixes.
- 216ddc3: Wrap sequential Save/Delete looops in atomic transcatoins (TransactionGroup client-side BeginTransaction/Commit/Rollback server-side)
- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [9154ac7]
- Updated dependencies [b1f32a4]
- Updated dependencies [a00af98]
- Updated dependencies [c199f3b]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/graphql-dataprovider@5.30.0
  - @memberjunction/ai-engine-base@5.30.0
  - @memberjunction/ng-artifacts@5.30.0
  - @memberjunction/ng-resource-permissions@5.30.0
  - @memberjunction/ng-testing@5.30.0
  - @memberjunction/ng-base-types@5.30.0
  - @memberjunction/ng-code-editor@5.30.0
  - @memberjunction/ng-notifications@5.30.0
  - @memberjunction/ng-shared-generic@5.30.0
  - @memberjunction/ng-tasks@5.30.0
  - @memberjunction/ai-agent-client@5.30.0
  - @memberjunction/ng-container-directives@5.30.0
  - @memberjunction/ng-forms@5.30.0
  - @memberjunction/ng-agent-client@5.30.0
  - @memberjunction/ai@5.30.0
  - @memberjunction/ng-markdown@5.30.0
  - @memberjunction/ng-ui-components@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- 98bad3a: Auto-populate ContentSizeBytes on artifact version saves; redesign non-image attachement tiles with type badge and restore click-to-open/download behavior
- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ai-agent-client@5.29.0
  - @memberjunction/ai-engine-base@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/ng-testing@5.29.0
  - @memberjunction/ng-artifacts@5.29.0
  - @memberjunction/ng-base-types@5.29.0
  - @memberjunction/ng-code-editor@5.29.0
  - @memberjunction/ng-container-directives@5.29.0
  - @memberjunction/ng-notifications@5.29.0
  - @memberjunction/ng-shared-generic@5.29.0
  - @memberjunction/ng-tasks@5.29.0
  - @memberjunction/graphql-dataprovider@5.29.0
  - @memberjunction/ng-agent-client@5.29.0
  - @memberjunction/ng-forms@5.29.0
  - @memberjunction/ai@5.29.0
  - @memberjunction/ng-markdown@5.29.0
  - @memberjunction/ng-ui-components@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [115e4da]
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ng-testing@5.28.0
  - @memberjunction/ai-agent-client@5.28.0
  - @memberjunction/ai-engine-base@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/ng-artifacts@5.28.0
  - @memberjunction/ng-base-types@5.28.0
  - @memberjunction/ng-code-editor@5.28.0
  - @memberjunction/ng-container-directives@5.28.0
  - @memberjunction/ng-notifications@5.28.0
  - @memberjunction/ng-shared-generic@5.28.0
  - @memberjunction/ng-tasks@5.28.0
  - @memberjunction/graphql-dataprovider@5.28.0
  - @memberjunction/ng-agent-client@5.28.0
  - @memberjunction/ng-forms@5.28.0
  - @memberjunction/ai@5.28.0
  - @memberjunction/ng-markdown@5.28.0
  - @memberjunction/ng-ui-components@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
- Updated dependencies [6c39ff0]
  - @memberjunction/global@5.27.1
  - @memberjunction/graphql-dataprovider@5.27.1
  - @memberjunction/ai-agent-client@5.27.1
  - @memberjunction/ai-engine-base@5.27.1
  - @memberjunction/ai@5.27.1
  - @memberjunction/ai-core-plus@5.27.1
  - @memberjunction/ng-testing@5.27.1
  - @memberjunction/ng-agent-client@5.27.1
  - @memberjunction/ng-artifacts@5.27.1
  - @memberjunction/ng-base-types@5.27.1
  - @memberjunction/ng-code-editor@5.27.1
  - @memberjunction/ng-container-directives@5.27.1
  - @memberjunction/ng-notifications@5.27.1
  - @memberjunction/ng-shared-generic@5.27.1
  - @memberjunction/ng-tasks@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/ng-forms@5.27.1
  - @memberjunction/ng-markdown@5.27.1
  - @memberjunction/ng-ui-components@5.27.1

## 5.27.0

### Patch Changes

- 4357090: Repair three query composition pipeline regressions surfaced by Skip-Brain, clear test feedback dialog state when switching conversations, strip tag IDs from taxonomy context injected into LLM prompts, exclude in-progress runs from last-run-date lookups, and replace direct UUID equality checks with `UUIDsEqual()` in the AI analytics dashboards to comply with the cross-platform UUID compliance test.
  - @memberjunction/ng-artifacts@5.27.0
  - @memberjunction/ai-agent-client@5.27.0
  - @memberjunction/ai-engine-base@5.27.0
  - @memberjunction/ai@5.27.0
  - @memberjunction/ai-core-plus@5.27.0
  - @memberjunction/ng-testing@5.27.0
  - @memberjunction/ng-agent-client@5.27.0
  - @memberjunction/ng-base-types@5.27.0
  - @memberjunction/ng-code-editor@5.27.0
  - @memberjunction/ng-container-directives@5.27.0
  - @memberjunction/ng-forms@5.27.0
  - @memberjunction/ng-markdown@5.27.0
  - @memberjunction/ng-notifications@5.27.0
  - @memberjunction/ng-shared-generic@5.27.0
  - @memberjunction/ng-tasks@5.27.0
  - @memberjunction/ng-ui-components@5.27.0
  - @memberjunction/graphql-dataprovider@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/core-entities@5.27.0
  - @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/ng-code-editor@5.26.0
  - @memberjunction/ng-shared-generic@5.26.0
  - @memberjunction/ng-tasks@5.26.0
  - @memberjunction/ng-ui-components@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-engine-base@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/ng-testing@5.26.0
  - @memberjunction/ng-artifacts@5.26.0
  - @memberjunction/ng-base-types@5.26.0
  - @memberjunction/ng-notifications@5.26.0
  - @memberjunction/graphql-dataprovider@5.26.0
  - @memberjunction/ng-forms@5.26.0
  - @memberjunction/ai-agent-client@5.26.0
  - @memberjunction/ng-container-directives@5.26.0
  - @memberjunction/ng-agent-client@5.26.0
  - @memberjunction/ai@5.26.0
  - @memberjunction/ng-markdown@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Minor Changes

- 008a62d: Add file based artifact I/O

### Patch Changes

- fc8cd52: Autotagging pipeline with run tracking, retry, and tag merge/delete; taxonomy server-side SQL aggregates; vector sync credential engine integration; search resolver and organic key support; unit test fixes across geo-core, ai-vector-sync, MJServer, and UUID compliance.
- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [008a62d]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/graphql-dataprovider@5.25.0
  - @memberjunction/ng-artifacts@5.25.0
  - @memberjunction/ai-agent-client@5.25.0
  - @memberjunction/ai-engine-base@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/ng-testing@5.25.0
  - @memberjunction/ng-base-types@5.25.0
  - @memberjunction/ng-code-editor@5.25.0
  - @memberjunction/ng-container-directives@5.25.0
  - @memberjunction/ng-notifications@5.25.0
  - @memberjunction/ng-shared-generic@5.25.0
  - @memberjunction/ng-tasks@5.25.0
  - @memberjunction/ng-agent-client@5.25.0
  - @memberjunction/ng-forms@5.25.0
  - @memberjunction/ai@5.25.0
  - @memberjunction/ng-markdown@5.25.0
  - @memberjunction/ng-ui-components@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/graphql-dataprovider@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/ng-artifacts@5.24.0
  - @memberjunction/ai-engine-base@5.24.0
  - @memberjunction/ng-forms@5.24.0
  - @memberjunction/ng-tasks@5.24.0
  - @memberjunction/ai-agent-client@5.24.0
  - @memberjunction/ng-testing@5.24.0
  - @memberjunction/ng-notifications@5.24.0
  - @memberjunction/ng-base-types@5.24.0
  - @memberjunction/ng-code-editor@5.24.0
  - @memberjunction/ng-container-directives@5.24.0
  - @memberjunction/ng-shared-generic@5.24.0
  - @memberjunction/ng-agent-client@5.24.0
  - @memberjunction/ai@5.24.0
  - @memberjunction/ng-markdown@5.24.0
  - @memberjunction/ng-ui-components@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [58af481]
- Updated dependencies [fb0c69f]
- Updated dependencies [1d1e02e]
- Updated dependencies [c17be20]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/ng-artifacts@5.23.0
  - @memberjunction/graphql-dataprovider@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ng-ui-components@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/ai-agent-client@5.23.0
  - @memberjunction/ai-engine-base@5.23.0
  - @memberjunction/ng-testing@5.23.0
  - @memberjunction/ng-base-types@5.23.0
  - @memberjunction/ng-code-editor@5.23.0
  - @memberjunction/ng-container-directives@5.23.0
  - @memberjunction/ng-notifications@5.23.0
  - @memberjunction/ng-shared-generic@5.23.0
  - @memberjunction/ng-tasks@5.23.0
  - @memberjunction/ai@5.23.0
  - @memberjunction/ng-agent-client@5.23.0
  - @memberjunction/ng-forms@5.23.0
  - @memberjunction/ng-markdown@5.23.0

## 5.22.0

### Minor Changes

- a42aba6: metadata

### Patch Changes

- 6a5093b: no migration
- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/ng-artifacts@5.22.0
  - @memberjunction/ai-engine-base@5.22.0
  - @memberjunction/ng-forms@5.22.0
  - @memberjunction/ng-tasks@5.22.0
  - @memberjunction/graphql-dataprovider@5.22.0
  - @memberjunction/ng-testing@5.22.0
  - @memberjunction/ng-base-types@5.22.0
  - @memberjunction/ng-code-editor@5.22.0
  - @memberjunction/ng-container-directives@5.22.0
  - @memberjunction/ng-notifications@5.22.0
  - @memberjunction/ng-shared-generic@5.22.0
  - @memberjunction/core-entities@5.22.0
  - @memberjunction/ai@5.22.0
  - @memberjunction/ng-markdown@5.22.0

## 5.21.0

### Patch Changes

- 5e2f54a: Clean up chat UI
- c0347d3: Chat UI fix
- Updated dependencies [c7dfb20]
- Updated dependencies [76cd2bc]
  - @memberjunction/core@5.21.0
  - @memberjunction/ai-core-plus@5.21.0
  - @memberjunction/ai-engine-base@5.21.0
  - @memberjunction/ng-testing@5.21.0
  - @memberjunction/ng-artifacts@5.21.0
  - @memberjunction/ng-base-types@5.21.0
  - @memberjunction/ng-code-editor@5.21.0
  - @memberjunction/ng-container-directives@5.21.0
  - @memberjunction/ng-notifications@5.21.0
  - @memberjunction/ng-shared-generic@5.21.0
  - @memberjunction/ng-tasks@5.21.0
  - @memberjunction/graphql-dataprovider@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/ng-forms@5.21.0
  - @memberjunction/ai@5.21.0
  - @memberjunction/ng-markdown@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ai-engine-base@5.20.0
  - @memberjunction/ai-core-plus@5.20.0
  - @memberjunction/ng-testing@5.20.0
  - @memberjunction/ng-artifacts@5.20.0
  - @memberjunction/ng-base-types@5.20.0
  - @memberjunction/ng-code-editor@5.20.0
  - @memberjunction/ng-container-directives@5.20.0
  - @memberjunction/ng-notifications@5.20.0
  - @memberjunction/ng-shared-generic@5.20.0
  - @memberjunction/ng-tasks@5.20.0
  - @memberjunction/graphql-dataprovider@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/ng-forms@5.20.0
  - @memberjunction/ai@5.20.0
  - @memberjunction/ng-markdown@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai-engine-base@5.19.0
- @memberjunction/ai@5.19.0
- @memberjunction/ai-core-plus@5.19.0
- @memberjunction/ng-testing@5.19.0
- @memberjunction/ng-artifacts@5.19.0
- @memberjunction/ng-base-types@5.19.0
- @memberjunction/ng-code-editor@5.19.0
- @memberjunction/ng-container-directives@5.19.0
- @memberjunction/ng-forms@5.19.0
- @memberjunction/ng-markdown@5.19.0
- @memberjunction/ng-notifications@5.19.0
- @memberjunction/ng-shared-generic@5.19.0
- @memberjunction/ng-tasks@5.19.0
- @memberjunction/graphql-dataprovider@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [322dac6]
- Updated dependencies [de310bc]
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/ng-markdown@5.18.0
  - @memberjunction/ai-engine-base@5.18.0
  - @memberjunction/ng-forms@5.18.0
  - @memberjunction/ng-tasks@5.18.0
  - @memberjunction/graphql-dataprovider@5.18.0
  - @memberjunction/ng-artifacts@5.18.0
  - @memberjunction/ng-testing@5.18.0
  - @memberjunction/ng-notifications@5.18.0
  - @memberjunction/ai@5.18.0
  - @memberjunction/ng-base-types@5.18.0
  - @memberjunction/ng-code-editor@5.18.0
  - @memberjunction/ng-container-directives@5.18.0
  - @memberjunction/ng-shared-generic@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0
  - @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [bbfbf5e]
- Updated dependencies [9881045]
  - @memberjunction/graphql-dataprovider@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/ng-testing@5.17.0
  - @memberjunction/ng-notifications@5.17.0
  - @memberjunction/ai-engine-base@5.17.0
  - @memberjunction/ai-core-plus@5.17.0
  - @memberjunction/ng-artifacts@5.17.0
  - @memberjunction/ng-base-types@5.17.0
  - @memberjunction/ng-code-editor@5.17.0
  - @memberjunction/ng-container-directives@5.17.0
  - @memberjunction/ng-shared-generic@5.17.0
  - @memberjunction/ng-tasks@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/ng-forms@5.17.0
  - @memberjunction/ai@5.17.0
  - @memberjunction/ng-markdown@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [179a4ce]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/graphql-dataprovider@5.16.0
  - @memberjunction/ai-engine-base@5.16.0
  - @memberjunction/ai-core-plus@5.16.0
  - @memberjunction/ng-testing@5.16.0
  - @memberjunction/ng-artifacts@5.16.0
  - @memberjunction/ng-base-types@5.16.0
  - @memberjunction/ng-code-editor@5.16.0
  - @memberjunction/ng-container-directives@5.16.0
  - @memberjunction/ng-notifications@5.16.0
  - @memberjunction/ng-shared-generic@5.16.0
  - @memberjunction/ng-tasks@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/ng-forms@5.16.0
  - @memberjunction/ai@5.16.0
  - @memberjunction/ng-markdown@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/core@5.15.0
  - @memberjunction/ai@5.15.0
  - @memberjunction/ai-core-plus@5.15.0
  - @memberjunction/ai-engine-base@5.15.0
  - @memberjunction/ng-testing@5.15.0
  - @memberjunction/ng-artifacts@5.15.0
  - @memberjunction/ng-base-types@5.15.0
  - @memberjunction/ng-code-editor@5.15.0
  - @memberjunction/ng-container-directives@5.15.0
  - @memberjunction/ng-notifications@5.15.0
  - @memberjunction/ng-shared-generic@5.15.0
  - @memberjunction/ng-tasks@5.15.0
  - @memberjunction/graphql-dataprovider@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/ng-forms@5.15.0
  - @memberjunction/ng-markdown@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/graphql-dataprovider@5.14.0
  - @memberjunction/ai-engine-base@5.14.0
  - @memberjunction/ai-core-plus@5.14.0
  - @memberjunction/ng-testing@5.14.0
  - @memberjunction/ng-artifacts@5.14.0
  - @memberjunction/ng-base-types@5.14.0
  - @memberjunction/ng-code-editor@5.14.0
  - @memberjunction/ng-container-directives@5.14.0
  - @memberjunction/ng-notifications@5.14.0
  - @memberjunction/ng-shared-generic@5.14.0
  - @memberjunction/ng-tasks@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/ng-forms@5.14.0
  - @memberjunction/ai@5.14.0
  - @memberjunction/ng-markdown@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ai-engine-base@5.13.0
  - @memberjunction/ai-core-plus@5.13.0
  - @memberjunction/ng-testing@5.13.0
  - @memberjunction/ng-artifacts@5.13.0
  - @memberjunction/ng-base-types@5.13.0
  - @memberjunction/ng-code-editor@5.13.0
  - @memberjunction/ng-container-directives@5.13.0
  - @memberjunction/ng-notifications@5.13.0
  - @memberjunction/ng-shared-generic@5.13.0
  - @memberjunction/ng-tasks@5.13.0
  - @memberjunction/graphql-dataprovider@5.13.0
  - @memberjunction/core-entities@5.13.0
  - @memberjunction/ai@5.13.0
  - @memberjunction/ng-forms@5.13.0
  - @memberjunction/ng-markdown@5.13.0

## 5.12.0

### Patch Changes

- a57b8d5: Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
- e87d153: design tokens phase 1
- Updated dependencies [05f19ff]
- Updated dependencies [a57b8d5]
- Updated dependencies [e87d153]
- Updated dependencies [7def002]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/ng-artifacts@5.12.0
  - @memberjunction/ng-shared-generic@5.12.0
  - @memberjunction/ng-testing@5.12.0
  - @memberjunction/ng-code-editor@5.12.0
  - @memberjunction/ng-markdown@5.12.0
  - @memberjunction/ng-tasks@5.12.0
  - @memberjunction/graphql-dataprovider@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ai-engine-base@5.12.0
  - @memberjunction/ai-core-plus@5.12.0
  - @memberjunction/ng-base-types@5.12.0
  - @memberjunction/ng-container-directives@5.12.0
  - @memberjunction/ng-notifications@5.12.0
  - @memberjunction/ng-forms@5.12.0
  - @memberjunction/ai@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/graphql-dataprovider@5.11.0
  - @memberjunction/core@5.11.0
  - @memberjunction/ng-artifacts@5.11.0
  - @memberjunction/ng-testing@5.11.0
  - @memberjunction/ng-notifications@5.11.0
  - @memberjunction/ai-engine-base@5.11.0
  - @memberjunction/ai-core-plus@5.11.0
  - @memberjunction/ng-base-types@5.11.0
  - @memberjunction/ng-code-editor@5.11.0
  - @memberjunction/ng-container-directives@5.11.0
  - @memberjunction/ng-shared-generic@5.11.0
  - @memberjunction/ng-tasks@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/ai@5.11.0
  - @memberjunction/ng-markdown@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai-engine-base@5.10.1
- @memberjunction/ai@5.10.1
- @memberjunction/ai-core-plus@5.10.1
- @memberjunction/ng-testing@5.10.1
- @memberjunction/ng-artifacts@5.10.1
- @memberjunction/ng-base-types@5.10.1
- @memberjunction/ng-code-editor@5.10.1
- @memberjunction/ng-container-directives@5.10.1
- @memberjunction/ng-markdown@5.10.1
- @memberjunction/ng-notifications@5.10.1
- @memberjunction/ng-shared-generic@5.10.1
- @memberjunction/ng-tasks@5.10.1
- @memberjunction/graphql-dataprovider@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [4e298b7]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/graphql-dataprovider@5.10.0
  - @memberjunction/ai-engine-base@5.10.0
  - @memberjunction/ai-core-plus@5.10.0
  - @memberjunction/ng-testing@5.10.0
  - @memberjunction/ng-artifacts@5.10.0
  - @memberjunction/ng-base-types@5.10.0
  - @memberjunction/ng-code-editor@5.10.0
  - @memberjunction/ng-container-directives@5.10.0
  - @memberjunction/ng-notifications@5.10.0
  - @memberjunction/ng-shared-generic@5.10.0
  - @memberjunction/ng-tasks@5.10.0
  - @memberjunction/ai@5.10.0
  - @memberjunction/ng-markdown@5.10.0
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
  - @memberjunction/ng-testing@5.9.0
  - @memberjunction/ng-artifacts@5.9.0
  - @memberjunction/ng-base-types@5.9.0
  - @memberjunction/ng-code-editor@5.9.0
  - @memberjunction/ng-notifications@5.9.0
  - @memberjunction/ng-shared-generic@5.9.0
  - @memberjunction/ng-tasks@5.9.0
  - @memberjunction/graphql-dataprovider@5.9.0
  - @memberjunction/ai@5.9.0
  - @memberjunction/ng-container-directives@5.9.0
  - @memberjunction/ng-markdown@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [de9f2c0]
- Updated dependencies [0753249]
  - @memberjunction/graphql-dataprovider@5.8.0
  - @memberjunction/core@5.8.0
  - @memberjunction/ng-testing@5.8.0
  - @memberjunction/ng-notifications@5.8.0
  - @memberjunction/ai-engine-base@5.8.0
  - @memberjunction/ai-core-plus@5.8.0
  - @memberjunction/ng-artifacts@5.8.0
  - @memberjunction/ng-base-types@5.8.0
  - @memberjunction/ng-code-editor@5.8.0
  - @memberjunction/ng-container-directives@5.8.0
  - @memberjunction/ng-shared-generic@5.8.0
  - @memberjunction/ng-tasks@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/ai@5.8.0
  - @memberjunction/ng-markdown@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- f52e156: Fix agent infinite retry loop and OOM crash when API credentials are missing by adding NoCredentials error classification, max consecutive failure safety net, and descriptive error propagation to the UI. Fix artifact collection removal UI update, artifact pane width reset on conversation switch, and component spec caching to survive render errors.
- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ai@5.7.0
  - @memberjunction/ng-artifacts@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/ai-engine-base@5.7.0
  - @memberjunction/ai-core-plus@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/ng-testing@5.7.0
  - @memberjunction/ng-base-types@5.7.0
  - @memberjunction/ng-code-editor@5.7.0
  - @memberjunction/ng-container-directives@5.7.0
  - @memberjunction/ng-notifications@5.7.0
  - @memberjunction/ng-shared-generic@5.7.0
  - @memberjunction/ng-tasks@5.7.0
  - @memberjunction/graphql-dataprovider@5.7.0
  - @memberjunction/ng-markdown@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/graphql-dataprovider@5.6.0
  - @memberjunction/ai-engine-base@5.6.0
  - @memberjunction/ai-core-plus@5.6.0
  - @memberjunction/ng-testing@5.6.0
  - @memberjunction/ng-artifacts@5.6.0
  - @memberjunction/ng-base-types@5.6.0
  - @memberjunction/ng-code-editor@5.6.0
  - @memberjunction/ng-container-directives@5.6.0
  - @memberjunction/ng-notifications@5.6.0
  - @memberjunction/ng-shared-generic@5.6.0
  - @memberjunction/ng-tasks@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/ai@5.6.0
  - @memberjunction/ng-markdown@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- a1648c5: Add MiniMax AI provider package, add MiniMax and Gemini 3.1 Pro models to AI model catalog, fix ng-conversations to prevent client from overwriting server-completed conversation details, and align metadata files with SQL logger output to prevent phantom mj-sync updates
- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/graphql-dataprovider@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ai-engine-base@5.5.0
  - @memberjunction/ai@5.5.0
  - @memberjunction/ai-core-plus@5.5.0
  - @memberjunction/ng-testing@5.5.0
  - @memberjunction/ng-artifacts@5.5.0
  - @memberjunction/ng-base-types@5.5.0
  - @memberjunction/ng-code-editor@5.5.0
  - @memberjunction/ng-container-directives@5.5.0
  - @memberjunction/ng-markdown@5.5.0
  - @memberjunction/ng-notifications@5.5.0
  - @memberjunction/ng-shared-generic@5.5.0
  - @memberjunction/ng-tasks@5.5.0

## 5.4.1

### Patch Changes

- @memberjunction/ng-testing@5.4.1
- @memberjunction/ai-engine-base@5.4.1
- @memberjunction/ai@5.4.1
- @memberjunction/ai-core-plus@5.4.1
- @memberjunction/ng-artifacts@5.4.1
- @memberjunction/ng-base-types@5.4.1
- @memberjunction/ng-code-editor@5.4.1
- @memberjunction/ng-container-directives@5.4.1
- @memberjunction/ng-markdown@5.4.1
- @memberjunction/ng-notifications@5.4.1
- @memberjunction/ng-shared-generic@5.4.1
- @memberjunction/ng-tasks@5.4.1
- @memberjunction/graphql-dataprovider@5.4.1
- @memberjunction/core@5.4.1
- @memberjunction/core-entities@5.4.1
- @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- 8a11457: Add centralized fire-and-forget pattern for all long-running GraphQL mutations (RunTest, RunTestSuite, RunAIAgent, RunAIAgentFromConversationDetail) to avoid Azure's ~230s HTTP proxy timeout. Use fire-and-forget mutation to avoid Azure proxy timeouts on agent execution, allow \_\_ prefixed schema names in Open App manifest validation, add inlineSources to Angular tsconfig for vendor sourcemap support, and add .env.\* to gitignore
- Updated dependencies [8a11457]
- Updated dependencies [c9a760c]
  - @memberjunction/graphql-dataprovider@5.4.0
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ng-testing@5.4.0
  - @memberjunction/ng-notifications@5.4.0
  - @memberjunction/ai-engine-base@5.4.0
  - @memberjunction/ai-core-plus@5.4.0
  - @memberjunction/ng-artifacts@5.4.0
  - @memberjunction/ng-base-types@5.4.0
  - @memberjunction/ng-code-editor@5.4.0
  - @memberjunction/ng-shared-generic@5.4.0
  - @memberjunction/ng-tasks@5.4.0
  - @memberjunction/ai@5.4.0
  - @memberjunction/ng-container-directives@5.4.0
  - @memberjunction/ng-markdown@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai-engine-base@5.3.1
- @memberjunction/ai@5.3.1
- @memberjunction/ai-core-plus@5.3.1
- @memberjunction/ng-testing@5.3.1
- @memberjunction/ng-artifacts@5.3.1
- @memberjunction/ng-base-types@5.3.1
- @memberjunction/ng-code-editor@5.3.1
- @memberjunction/ng-container-directives@5.3.1
- @memberjunction/ng-markdown@5.3.1
- @memberjunction/ng-notifications@5.3.1
- @memberjunction/ng-shared-generic@5.3.1
- @memberjunction/ng-tasks@5.3.1
- @memberjunction/graphql-dataprovider@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- a6aea29: Fix artifact auto-open for delegated sub-agent completions, add SSE-aware request method and fire-and-forget GraphQL mutation to prevent Azure proxy timeouts, fix WebSocket reconnection catch-up check, and remove crossOrigin CORS enforcement with fallback CDN support in React runtime
- Updated dependencies [a6aea29]
- Updated dependencies [1692c53]
- Updated dependencies [7af1846]
  - @memberjunction/graphql-dataprovider@5.3.0
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ng-artifacts@5.3.0
  - @memberjunction/ng-testing@5.3.0
  - @memberjunction/ng-notifications@5.3.0
  - @memberjunction/ai-engine-base@5.3.0
  - @memberjunction/ai-core-plus@5.3.0
  - @memberjunction/ng-base-types@5.3.0
  - @memberjunction/ng-code-editor@5.3.0
  - @memberjunction/ng-shared-generic@5.3.0
  - @memberjunction/ng-tasks@5.3.0
  - @memberjunction/ai@5.3.0
  - @memberjunction/ng-container-directives@5.3.0
  - @memberjunction/ng-markdown@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- 4618227: Fix Angular 21/zone.js 0.15 change detection regressions, improve conversation caching performance, and resolve blank tabs in artifacts and entity viewer
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
- Updated dependencies [4618227]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/graphql-dataprovider@5.2.0
  - @memberjunction/ai-engine-base@5.2.0
  - @memberjunction/ai-core-plus@5.2.0
  - @memberjunction/ng-tasks@5.2.0
  - @memberjunction/ng-artifacts@5.2.0
  - @memberjunction/ng-testing@5.2.0
  - @memberjunction/ng-base-types@5.2.0
  - @memberjunction/ng-code-editor@5.2.0
  - @memberjunction/ng-notifications@5.2.0
  - @memberjunction/ng-shared-generic@5.2.0
  - @memberjunction/ng-container-directives@5.2.0
  - @memberjunction/ai@5.2.0
  - @memberjunction/ng-markdown@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ai-engine-base@5.1.0
  - @memberjunction/ai@5.1.0
  - @memberjunction/ai-core-plus@5.1.0
  - @memberjunction/ng-testing@5.1.0
  - @memberjunction/ng-artifacts@5.1.0
  - @memberjunction/ng-base-types@5.1.0
  - @memberjunction/ng-code-editor@5.1.0
  - @memberjunction/ng-container-directives@5.1.0
  - @memberjunction/ng-notifications@5.1.0
  - @memberjunction/graphql-dataprovider@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/ng-tasks@5.1.0
  - @memberjunction/ng-shared-generic@5.1.0
  - @memberjunction/ng-markdown@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [737b56b]
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/graphql-dataprovider@5.0.0
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ai-engine-base@5.0.0
  - @memberjunction/ai@5.0.0
  - @memberjunction/ai-core-plus@5.0.0
  - @memberjunction/ng-testing@5.0.0
  - @memberjunction/ng-artifacts@5.0.0
  - @memberjunction/ng-base-types@5.0.0
  - @memberjunction/ng-code-editor@5.0.0
  - @memberjunction/ng-container-directives@5.0.0
  - @memberjunction/ng-markdown@5.0.0
  - @memberjunction/ng-notifications@5.0.0
  - @memberjunction/ng-shared-generic@5.0.0
  - @memberjunction/ng-tasks@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-engine-base@4.4.0
  - @memberjunction/ai-core-plus@4.4.0
  - @memberjunction/ng-testing@4.4.0
  - @memberjunction/ng-artifacts@4.4.0
  - @memberjunction/ng-base-types@4.4.0
  - @memberjunction/ng-code-editor@4.4.0
  - @memberjunction/ng-container-directives@4.4.0
  - @memberjunction/ng-notifications@4.4.0
  - @memberjunction/ng-shared-generic@4.4.0
  - @memberjunction/ng-tasks@4.4.0
  - @memberjunction/graphql-dataprovider@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/ai@4.4.0
  - @memberjunction/ng-markdown@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai-engine-base@4.3.1
- @memberjunction/ai@4.3.1
- @memberjunction/ai-core-plus@4.3.1
- @memberjunction/ng-testing@4.3.1
- @memberjunction/ng-artifacts@4.3.1
- @memberjunction/ng-base-types@4.3.1
- @memberjunction/ng-code-editor@4.3.1
- @memberjunction/ng-container-directives@4.3.1
- @memberjunction/ng-markdown@4.3.1
- @memberjunction/ng-notifications@4.3.1
- @memberjunction/ng-shared-generic@4.3.1
- @memberjunction/ng-tasks@4.3.1
- @memberjunction/graphql-dataprovider@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/graphql-dataprovider@4.3.0
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ng-testing@4.3.0
  - @memberjunction/ng-notifications@4.3.0
  - @memberjunction/ai-engine-base@4.3.0
  - @memberjunction/ai-core-plus@4.3.0
  - @memberjunction/ng-artifacts@4.3.0
  - @memberjunction/ng-base-types@4.3.0
  - @memberjunction/ng-code-editor@4.3.0
  - @memberjunction/ng-container-directives@4.3.0
  - @memberjunction/ng-shared-generic@4.3.0
  - @memberjunction/ng-tasks@4.3.0
  - @memberjunction/ai@4.3.0
  - @memberjunction/ng-markdown@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai-engine-base@4.2.0
- @memberjunction/ai@4.2.0
- @memberjunction/ai-core-plus@4.2.0
- @memberjunction/ng-testing@4.2.0
- @memberjunction/ng-artifacts@4.2.0
- @memberjunction/ng-base-types@4.2.0
- @memberjunction/ng-code-editor@4.2.0
- @memberjunction/ng-container-directives@4.2.0
- @memberjunction/ng-markdown@4.2.0
- @memberjunction/ng-notifications@4.2.0
- @memberjunction/ng-shared-generic@4.2.0
- @memberjunction/ng-tasks@4.2.0
- @memberjunction/graphql-dataprovider@4.2.0
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
  - @memberjunction/ng-testing@4.1.0
  - @memberjunction/ng-artifacts@4.1.0
  - @memberjunction/ng-base-types@4.1.0
  - @memberjunction/ng-code-editor@4.1.0
  - @memberjunction/ng-container-directives@4.1.0
  - @memberjunction/ng-notifications@4.1.0
  - @memberjunction/ng-shared-generic@4.1.0
  - @memberjunction/ng-tasks@4.1.0
  - @memberjunction/graphql-dataprovider@4.1.0
  - @memberjunction/ai@4.1.0
  - @memberjunction/ng-markdown@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [65b4274]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/graphql-dataprovider@4.0.0
  - @memberjunction/ai-engine-base@4.0.0
  - @memberjunction/ai@4.0.0
  - @memberjunction/ai-core-plus@4.0.0
  - @memberjunction/ng-testing@4.0.0
  - @memberjunction/ng-artifacts@4.0.0
  - @memberjunction/ng-base-types@4.0.0
  - @memberjunction/ng-code-editor@4.0.0
  - @memberjunction/ng-container-directives@4.0.0
  - @memberjunction/ng-markdown@4.0.0
  - @memberjunction/ng-notifications@4.0.0
  - @memberjunction/ng-shared-generic@4.0.0
  - @memberjunction/ng-tasks@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/ai-engine-base@3.4.0
  - @memberjunction/ai-core-plus@3.4.0
  - @memberjunction/ng-testing@3.4.0
  - @memberjunction/ng-artifacts@3.4.0
  - @memberjunction/ng-base-types@3.4.0
  - @memberjunction/ng-code-editor@3.4.0
  - @memberjunction/ng-notifications@3.4.0
  - @memberjunction/ng-shared-generic@3.4.0
  - @memberjunction/ng-tasks@3.4.0
  - @memberjunction/graphql-dataprovider@3.4.0
  - @memberjunction/ng-container-directives@3.4.0
  - @memberjunction/ai@3.4.0
  - @memberjunction/ng-markdown@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/ai-engine-base@3.3.0
  - @memberjunction/ai-core-plus@3.3.0
  - @memberjunction/ng-testing@3.3.0
  - @memberjunction/ng-artifacts@3.3.0
  - @memberjunction/ng-base-types@3.3.0
  - @memberjunction/ng-code-editor@3.3.0
  - @memberjunction/ng-notifications@3.3.0
  - @memberjunction/ng-shared-generic@3.3.0
  - @memberjunction/ng-tasks@3.3.0
  - @memberjunction/graphql-dataprovider@3.3.0
  - @memberjunction/ai@3.3.0
  - @memberjunction/ng-container-directives@3.3.0
  - @memberjunction/ng-markdown@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [cbd2714]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/graphql-dataprovider@3.2.0
  - @memberjunction/ng-artifacts@3.2.0
  - @memberjunction/ai-engine-base@3.2.0
  - @memberjunction/ai-core-plus@3.2.0
  - @memberjunction/ng-testing@3.2.0
  - @memberjunction/ng-base-types@3.2.0
  - @memberjunction/ng-code-editor@3.2.0
  - @memberjunction/ng-notifications@3.2.0
  - @memberjunction/ng-shared-generic@3.2.0
  - @memberjunction/ng-tasks@3.2.0
  - @memberjunction/ai@3.2.0
  - @memberjunction/ng-container-directives@3.2.0
  - @memberjunction/ng-markdown@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- Updated dependencies [8c0b624]
  - @memberjunction/graphql-dataprovider@3.1.1
  - @memberjunction/ng-testing@3.1.1
  - @memberjunction/ng-notifications@3.1.1
  - @memberjunction/ng-artifacts@3.1.1
  - @memberjunction/ai-engine-base@3.1.1
  - @memberjunction/ai@3.1.1
  - @memberjunction/ai-core-plus@3.1.1
  - @memberjunction/ng-base-types@3.1.1
  - @memberjunction/ng-code-editor@3.1.1
  - @memberjunction/ng-container-directives@3.1.1
  - @memberjunction/ng-markdown@3.1.1
  - @memberjunction/ng-shared-generic@3.1.1
  - @memberjunction/ng-tasks@3.1.1
  - @memberjunction/core@3.1.1
  - @memberjunction/core-entities@3.1.1
  - @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ai-engine-base@3.0.0
- @memberjunction/ai@3.0.0
- @memberjunction/ai-core-plus@3.0.0
- @memberjunction/ng-testing@3.0.0
- @memberjunction/ng-artifacts@3.0.0
- @memberjunction/ng-base-types@3.0.0
- @memberjunction/ng-code-editor@3.0.0
- @memberjunction/ng-container-directives@3.0.0
- @memberjunction/ng-markdown@3.0.0
- @memberjunction/ng-notifications@3.0.0
- @memberjunction/ng-shared-generic@3.0.0
- @memberjunction/ng-tasks@3.0.0
- @memberjunction/graphql-dataprovider@3.0.0
- @memberjunction/core@3.0.0
- @memberjunction/core-entities@3.0.0
- @memberjunction/global@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/ai-engine-base@2.133.0
  - @memberjunction/ai-core-plus@2.133.0
  - @memberjunction/ng-testing@2.133.0
  - @memberjunction/ng-artifacts@2.133.0
  - @memberjunction/ng-base-types@2.133.0
  - @memberjunction/ng-code-editor@2.133.0
  - @memberjunction/ng-container-directives@2.133.0
  - @memberjunction/ng-notifications@2.133.0
  - @memberjunction/ng-shared-generic@2.133.0
  - @memberjunction/ng-tasks@2.133.0
  - @memberjunction/graphql-dataprovider@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/ai@2.133.0
  - @memberjunction/ng-markdown@2.133.0
  - @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/ai-engine-base@2.132.0
  - @memberjunction/ai-core-plus@2.132.0
  - @memberjunction/ng-testing@2.132.0
  - @memberjunction/ng-artifacts@2.132.0
  - @memberjunction/ng-base-types@2.132.0
  - @memberjunction/ng-code-editor@2.132.0
  - @memberjunction/ng-container-directives@2.132.0
  - @memberjunction/ng-notifications@2.132.0
  - @memberjunction/ng-shared-generic@2.132.0
  - @memberjunction/ng-tasks@2.132.0
  - @memberjunction/graphql-dataprovider@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/ai@2.132.0
  - @memberjunction/ng-markdown@2.132.0
  - @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- 3604aa1: Fix Conversations Performance: Replace Timer Polling with PubSub + Fix Race Conditions
- Updated dependencies [280a4c7]
- Updated dependencies [81598e3]
  - @memberjunction/core@2.131.0
  - @memberjunction/ai-engine-base@2.131.0
  - @memberjunction/ai-core-plus@2.131.0
  - @memberjunction/ng-testing@2.131.0
  - @memberjunction/ng-artifacts@2.131.0
  - @memberjunction/ng-base-types@2.131.0
  - @memberjunction/ng-code-editor@2.131.0
  - @memberjunction/ng-container-directives@2.131.0
  - @memberjunction/ng-notifications@2.131.0
  - @memberjunction/ng-shared-generic@2.131.0
  - @memberjunction/ng-tasks@2.131.0
  - @memberjunction/graphql-dataprovider@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/ai@2.131.0
  - @memberjunction/ng-markdown@2.131.0
  - @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- d01c028: Revert broken conversation UI changes
- Updated dependencies [8884553]
- Updated dependencies [0dcb9cb]
  - @memberjunction/ng-testing@2.130.1
  - @memberjunction/ng-markdown@2.130.1
  - @memberjunction/ng-artifacts@2.130.1
  - @memberjunction/ai-engine-base@2.130.1
  - @memberjunction/ai@2.130.1
  - @memberjunction/ai-core-plus@2.130.1
  - @memberjunction/ng-base-types@2.130.1
  - @memberjunction/ng-code-editor@2.130.1
  - @memberjunction/ng-container-directives@2.130.1
  - @memberjunction/ng-notifications@2.130.1
  - @memberjunction/ng-shared-generic@2.130.1
  - @memberjunction/ng-tasks@2.130.1
  - @memberjunction/graphql-dataprovider@2.130.1
  - @memberjunction/core@2.130.1
  - @memberjunction/core-entities@2.130.1
  - @memberjunction/global@2.130.1

## 2.130.0

### Patch Changes

- 83d81ad: Fix conversation UI performance
- f4e1f05: Fix Conversation UI issue after browser refresh
- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
  - @memberjunction/ai-engine-base@2.130.0
  - @memberjunction/ai@2.130.0
  - @memberjunction/ai-core-plus@2.130.0
  - @memberjunction/graphql-dataprovider@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/ng-tasks@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/ng-testing@2.130.0
  - @memberjunction/ng-notifications@2.130.0
  - @memberjunction/ng-artifacts@2.130.0
  - @memberjunction/ng-base-types@2.130.0
  - @memberjunction/ng-code-editor@2.130.0
  - @memberjunction/ng-container-directives@2.130.0
  - @memberjunction/ng-shared-generic@2.130.0
  - @memberjunction/ng-markdown@2.130.0
  - @memberjunction/global@2.130.0

## 2.129.0

### Patch Changes

- 573179f: Fix Conversation UI issues with Browser Refresh
- a39946c: no migration
- 3458156: Fix conversation UI stale state after navigation
- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [6ce6e67]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [a39946c]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/ai-core-plus@2.129.0
  - @memberjunction/graphql-dataprovider@2.129.0
  - @memberjunction/ng-artifacts@2.129.0
  - @memberjunction/ai-engine-base@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/ng-testing@2.129.0
  - @memberjunction/ng-base-types@2.129.0
  - @memberjunction/ng-code-editor@2.129.0
  - @memberjunction/ng-container-directives@2.129.0
  - @memberjunction/ng-notifications@2.129.0
  - @memberjunction/ng-shared-generic@2.129.0
  - @memberjunction/ng-tasks@2.129.0
  - @memberjunction/ai@2.129.0
  - @memberjunction/ng-markdown@2.129.0

## 2.128.0

### Patch Changes

- Updated dependencies [f407abe]
- Updated dependencies [3dde14d]
- Updated dependencies [0863f85]
- Updated dependencies [e41becd]
  - @memberjunction/core@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/ng-notifications@2.128.0
  - @memberjunction/ng-markdown@2.128.0
  - @memberjunction/ng-artifacts@2.128.0
  - @memberjunction/ai-engine-base@2.128.0
  - @memberjunction/ai-core-plus@2.128.0
  - @memberjunction/ng-testing@2.128.0
  - @memberjunction/ng-base-types@2.128.0
  - @memberjunction/ng-code-editor@2.128.0
  - @memberjunction/ng-container-directives@2.128.0
  - @memberjunction/ng-shared-generic@2.128.0
  - @memberjunction/ng-tasks@2.128.0
  - @memberjunction/graphql-dataprovider@2.128.0
  - @memberjunction/ai@2.128.0
  - @memberjunction/global@2.128.0

## 2.127.0

### Minor Changes

- 65318c4: migration

### Patch Changes

- c7c3378: Fix memory leaks and improve conversation naming performance
- Updated dependencies [65318c4]
- Updated dependencies [0e56e97]
- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/ng-artifacts@2.127.0
  - @memberjunction/ai-core-plus@2.127.0
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/graphql-dataprovider@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/ai-engine-base@2.127.0
  - @memberjunction/ng-testing@2.127.0
  - @memberjunction/ng-base-types@2.127.0
  - @memberjunction/ng-code-editor@2.127.0
  - @memberjunction/ng-container-directives@2.127.0
  - @memberjunction/ng-notifications@2.127.0
  - @memberjunction/ng-shared-generic@2.127.0
  - @memberjunction/ng-tasks@2.127.0
  - @memberjunction/ai@2.127.0
  - @memberjunction/ng-markdown@2.127.0

## 2.126.1

### Patch Changes

- Updated dependencies [d6ae2a0]
- Updated dependencies [8fa1aa2]
  - @memberjunction/graphql-dataprovider@2.126.1
  - @memberjunction/ng-artifacts@2.126.1
  - @memberjunction/ng-testing@2.126.1
  - @memberjunction/ng-notifications@2.126.1
  - @memberjunction/ai-engine-base@2.126.1
  - @memberjunction/ai@2.126.1
  - @memberjunction/ai-core-plus@2.126.1
  - @memberjunction/ng-base-types@2.126.1
  - @memberjunction/ng-code-editor@2.126.1
  - @memberjunction/ng-container-directives@2.126.1
  - @memberjunction/ng-markdown@2.126.1
  - @memberjunction/ng-shared-generic@2.126.1
  - @memberjunction/ng-tasks@2.126.1
  - @memberjunction/core@2.126.1
  - @memberjunction/core-entities@2.126.1
  - @memberjunction/global@2.126.1

## 2.126.0

### Minor Changes

- d424fce: migration for metadata for Sage change
- 389183e: migration

### Patch Changes

- eae1a1f: Add Phase B component linter fixtures, reorganize test structure, refactor financial analytics components, and fix OpenEntityRecord event propagation in artifacts and collections
- Updated dependencies [eae1a1f]
- Updated dependencies [389183e]
- Updated dependencies [703221e]
  - @memberjunction/ng-artifacts@2.126.0
  - @memberjunction/ng-markdown@2.126.0
  - @memberjunction/core@2.126.0
  - @memberjunction/ai-engine-base@2.126.0
  - @memberjunction/ai-core-plus@2.126.0
  - @memberjunction/ng-testing@2.126.0
  - @memberjunction/ng-base-types@2.126.0
  - @memberjunction/ng-code-editor@2.126.0
  - @memberjunction/ng-container-directives@2.126.0
  - @memberjunction/ng-notifications@2.126.0
  - @memberjunction/ng-shared-generic@2.126.0
  - @memberjunction/ng-tasks@2.126.0
  - @memberjunction/graphql-dataprovider@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/ai@2.126.0
  - @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- Updated dependencies [bd4aa3d]
  - @memberjunction/core@2.125.0
  - @memberjunction/ng-artifacts@2.125.0
  - @memberjunction/graphql-dataprovider@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/ai-engine-base@2.125.0
  - @memberjunction/ai-core-plus@2.125.0
  - @memberjunction/ng-testing@2.125.0
  - @memberjunction/ng-base-types@2.125.0
  - @memberjunction/ng-code-editor@2.125.0
  - @memberjunction/ng-container-directives@2.125.0
  - @memberjunction/ng-notifications@2.125.0
  - @memberjunction/ng-shared-generic@2.125.0
  - @memberjunction/ng-tasks@2.125.0
  - @memberjunction/ai@2.125.0
  - @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- Updated dependencies [75058a9]
- Updated dependencies [cabe329]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/ai-core-plus@2.124.0
  - @memberjunction/ai-engine-base@2.124.0
  - @memberjunction/ng-testing@2.124.0
  - @memberjunction/ng-artifacts@2.124.0
  - @memberjunction/ng-base-types@2.124.0
  - @memberjunction/ng-code-editor@2.124.0
  - @memberjunction/ng-container-directives@2.124.0
  - @memberjunction/ng-notifications@2.124.0
  - @memberjunction/ng-shared-generic@2.124.0
  - @memberjunction/ng-tasks@2.124.0
  - @memberjunction/graphql-dataprovider@2.124.0
  - @memberjunction/ai@2.124.0
  - @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai-engine-base@2.123.1
- @memberjunction/ai@2.123.1
- @memberjunction/ai-core-plus@2.123.1
- @memberjunction/ng-testing@2.123.1
- @memberjunction/ng-artifacts@2.123.1
- @memberjunction/ng-base-types@2.123.1
- @memberjunction/ng-code-editor@2.123.1
- @memberjunction/ng-container-directives@2.123.1
- @memberjunction/ng-notifications@2.123.1
- @memberjunction/ng-shared-generic@2.123.1
- @memberjunction/ng-tasks@2.123.1
- @memberjunction/graphql-dataprovider@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/global@2.123.1

## 2.123.0

### Patch Changes

- 52cf482: Fix conversation state reference after service refactor, improve component linter test structure, and fix chart ordering
- Updated dependencies [0944f59]
  - @memberjunction/ai-core-plus@2.123.0
  - @memberjunction/graphql-dataprovider@2.123.0
  - @memberjunction/ng-testing@2.123.0
  - @memberjunction/ng-notifications@2.123.0
  - @memberjunction/ng-artifacts@2.123.0
  - @memberjunction/ai-engine-base@2.123.0
  - @memberjunction/ai@2.123.0
  - @memberjunction/ng-shared-generic@2.123.0
  - @memberjunction/ng-base-types@2.123.0
  - @memberjunction/ng-code-editor@2.123.0
  - @memberjunction/ng-container-directives@2.123.0
  - @memberjunction/ng-tasks@2.123.0
  - @memberjunction/core@2.123.0
  - @memberjunction/core-entities@2.123.0
  - @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- 3d763e9: Fix MJExplorer UI rendering issues including conversation messages not displaying, collections page showing duplicate items on reload, dialog containers for deletions, loading spinner flashes during navigation, and improve JWT token handling for WebSocket connections
- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
- Updated dependencies [3d763e9]
- Updated dependencies [81f0c44]
  - @memberjunction/graphql-dataprovider@2.122.2
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/ng-artifacts@2.122.2
  - @memberjunction/ng-code-editor@2.122.2
  - @memberjunction/ng-container-directives@2.122.2
  - @memberjunction/ng-testing@2.122.2
  - @memberjunction/ng-notifications@2.122.2
  - @memberjunction/ai-engine-base@2.122.2
  - @memberjunction/ai-core-plus@2.122.2
  - @memberjunction/ng-base-types@2.122.2
  - @memberjunction/ng-shared-generic@2.122.2
  - @memberjunction/ng-tasks@2.122.2
  - @memberjunction/ai@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- 699a480: Fix missing @memberjunction dependencies in 24 Angular packages
- Updated dependencies [699a480]
  - @memberjunction/ng-artifacts@2.122.1
  - @memberjunction/ng-testing@2.122.1
  - @memberjunction/ai-engine-base@2.122.1
  - @memberjunction/ai@2.122.1
  - @memberjunction/ai-core-plus@2.122.1
  - @memberjunction/ng-base-types@2.122.1
  - @memberjunction/ng-code-editor@2.122.1
  - @memberjunction/ng-container-directives@2.122.1
  - @memberjunction/ng-notifications@2.122.1
  - @memberjunction/ng-shared-generic@2.122.1
  - @memberjunction/ng-tasks@2.122.1
  - @memberjunction/graphql-dataprovider@2.122.1
  - @memberjunction/core@2.122.1
  - @memberjunction/core-entities@2.122.1
  - @memberjunction/global@2.122.1

## 2.122.0

### Patch Changes

- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/graphql-dataprovider@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/ai-engine-base@2.122.0
  - @memberjunction/ai-core-plus@2.122.0
  - @memberjunction/ng-testing@2.122.0
  - @memberjunction/ng-artifacts@2.122.0
  - @memberjunction/ng-base-types@2.122.0
  - @memberjunction/ng-code-editor@2.122.0
  - @memberjunction/ng-container-directives@2.122.0
  - @memberjunction/ng-notifications@2.122.0
  - @memberjunction/ng-tasks@2.122.0
  - @memberjunction/ai@2.122.0
  - @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/ai@2.121.0
  - @memberjunction/ai-engine-base@2.121.0
  - @memberjunction/ai-core-plus@2.121.0
  - @memberjunction/ng-testing@2.121.0
  - @memberjunction/ng-artifacts@2.121.0
  - @memberjunction/ng-base-types@2.121.0
  - @memberjunction/ng-code-editor@2.121.0
  - @memberjunction/ng-container-directives@2.121.0
  - @memberjunction/ng-notifications@2.121.0
  - @memberjunction/ng-tasks@2.121.0
  - @memberjunction/graphql-dataprovider@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/graphql-dataprovider@2.120.0
  - @memberjunction/ai-engine-base@2.120.0
  - @memberjunction/ai-core-plus@2.120.0
  - @memberjunction/ng-testing@2.120.0
  - @memberjunction/ng-artifacts@2.120.0
  - @memberjunction/ng-base-types@2.120.0
  - @memberjunction/ng-code-editor@2.120.0
  - @memberjunction/ng-container-directives@2.120.0
  - @memberjunction/ng-notifications@2.120.0
  - @memberjunction/ng-tasks@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/ai@2.120.0
  - @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- 0a133df: Agent Conversation UI Improvement
- Updated dependencies [7dd7cca]
- Updated dependencies [0a133df]
  - @memberjunction/core@2.119.0
  - @memberjunction/ng-testing@2.119.0
  - @memberjunction/ai-core-plus@2.119.0
  - @memberjunction/ai-engine-base@2.119.0
  - @memberjunction/ng-artifacts@2.119.0
  - @memberjunction/ng-base-types@2.119.0
  - @memberjunction/ng-code-editor@2.119.0
  - @memberjunction/ng-container-directives@2.119.0
  - @memberjunction/ng-notifications@2.119.0
  - @memberjunction/ng-tasks@2.119.0
  - @memberjunction/graphql-dataprovider@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/ai@2.119.0
  - @memberjunction/global@2.119.0

## 2.118.0

### Patch Changes

- Updated dependencies [264c57a]
- Updated dependencies [096ece6]
- Updated dependencies [78721d8]
- Updated dependencies [1bb5c29]
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/ai-core-plus@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/ng-testing@2.118.0
  - @memberjunction/ai-engine-base@2.118.0
  - @memberjunction/ng-artifacts@2.118.0
  - @memberjunction/ng-base-types@2.118.0
  - @memberjunction/ng-code-editor@2.118.0
  - @memberjunction/ng-notifications@2.118.0
  - @memberjunction/ng-tasks@2.118.0
  - @memberjunction/graphql-dataprovider@2.118.0
  - @memberjunction/ng-container-directives@2.118.0
  - @memberjunction/ai@2.118.0
  - @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [8c092ec]
  - @memberjunction/core@2.117.0
  - @memberjunction/ai-engine-base@2.117.0
  - @memberjunction/ai-core-plus@2.117.0
  - @memberjunction/ng-artifacts@2.117.0
  - @memberjunction/ng-base-types@2.117.0
  - @memberjunction/ng-code-editor@2.117.0
  - @memberjunction/ng-container-directives@2.117.0
  - @memberjunction/ng-notifications@2.117.0
  - @memberjunction/ng-tasks@2.117.0
  - @memberjunction/graphql-dataprovider@2.117.0
  - @memberjunction/core-entities@2.117.0
  - @memberjunction/ai@2.117.0
  - @memberjunction/global@2.117.0

## 2.116.0

### Minor Changes

- b80fe44: Migration

### Patch Changes

- Updated dependencies [81bb7a4]
- Updated dependencies [a8d5592]
  - @memberjunction/core@2.116.0
  - @memberjunction/global@2.116.0
  - @memberjunction/ai-engine-base@2.116.0
  - @memberjunction/ai-core-plus@2.116.0
  - @memberjunction/ng-artifacts@2.116.0
  - @memberjunction/ng-base-types@2.116.0
  - @memberjunction/ng-code-editor@2.116.0
  - @memberjunction/ng-container-directives@2.116.0
  - @memberjunction/ng-notifications@2.116.0
  - @memberjunction/ng-tasks@2.116.0
  - @memberjunction/graphql-dataprovider@2.116.0
  - @memberjunction/core-entities@2.116.0
  - @memberjunction/ai@2.116.0

## 2.115.0

### Minor Changes

- 751e3d1: Fixed Conversations Hamburger Functionality
- 5b7d788: Migration

### Patch Changes

- dffe12f: code fixes
- 1a96840: Conversation UI Improvement
  - @memberjunction/ai-engine-base@2.115.0
  - @memberjunction/ai@2.115.0
  - @memberjunction/ai-core-plus@2.115.0
  - @memberjunction/ng-artifacts@2.115.0
  - @memberjunction/ng-base-types@2.115.0
  - @memberjunction/ng-code-editor@2.115.0
  - @memberjunction/ng-container-directives@2.115.0
  - @memberjunction/ng-notifications@2.115.0
  - @memberjunction/ng-tasks@2.115.0
  - @memberjunction/graphql-dataprovider@2.115.0
  - @memberjunction/core@2.115.0
  - @memberjunction/core-entities@2.115.0
  - @memberjunction/global@2.115.0

## 2.114.0

### Minor Changes

- a17ec8e: Migration

### Patch Changes

- 12ae685: chat mobile fixes
  - @memberjunction/ai-engine-base@2.114.0
  - @memberjunction/ai@2.114.0
  - @memberjunction/ai-core-plus@2.114.0
  - @memberjunction/ng-artifacts@2.114.0
  - @memberjunction/ng-base-types@2.114.0
  - @memberjunction/ng-code-editor@2.114.0
  - @memberjunction/ng-container-directives@2.114.0
  - @memberjunction/ng-notifications@2.114.0
  - @memberjunction/ng-tasks@2.114.0
  - @memberjunction/graphql-dataprovider@2.114.0
  - @memberjunction/core@2.114.0
  - @memberjunction/core-entities@2.114.0
  - @memberjunction/global@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/ai-engine-base@2.113.2
  - @memberjunction/ai-core-plus@2.113.2
  - @memberjunction/ng-artifacts@2.113.2
  - @memberjunction/ng-base-types@2.113.2
  - @memberjunction/ng-code-editor@2.113.2
  - @memberjunction/ng-container-directives@2.113.2
  - @memberjunction/ng-notifications@2.113.2
  - @memberjunction/ng-tasks@2.113.2
  - @memberjunction/graphql-dataprovider@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/ai@2.113.2
  - @memberjunction/global@2.113.2

## 2.112.0

### Minor Changes

- 2ac2120: Migration
- 2ac2120: migration

### Patch Changes

- 621960a: Patch
- Updated dependencies [2ac2120]
- Updated dependencies [c126b59]
- Updated dependencies [ed74bb8]
  - @memberjunction/ng-artifacts@2.112.0
  - @memberjunction/global@2.112.0
  - @memberjunction/ai-core-plus@2.112.0
  - @memberjunction/ai-engine-base@2.112.0
  - @memberjunction/ai@2.112.0
  - @memberjunction/ng-base-types@2.112.0
  - @memberjunction/ng-code-editor@2.112.0
  - @memberjunction/ng-container-directives@2.112.0
  - @memberjunction/ng-notifications@2.112.0
  - @memberjunction/graphql-dataprovider@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0
  - @memberjunction/ng-tasks@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/ai-engine-base@2.110.1
- @memberjunction/ai@2.110.1
- @memberjunction/ai-core-plus@2.110.1
- @memberjunction/ng-artifacts@2.110.1
- @memberjunction/ng-base-types@2.110.1
- @memberjunction/ng-code-editor@2.110.1
- @memberjunction/ng-container-directives@2.110.1
- @memberjunction/ng-notifications@2.110.1
- @memberjunction/ng-tasks@2.110.1
- @memberjunction/graphql-dataprovider@2.110.1
- @memberjunction/core@2.110.1
- @memberjunction/core-entities@2.110.1
- @memberjunction/global@2.110.1

## 2.110.0

### Minor Changes

- d2d7ab9: migration

### Patch Changes

- Updated dependencies [02d72ff]
- Updated dependencies [d2d7ab9]
- Updated dependencies [c8b9aca]
  - @memberjunction/core-entities@2.110.0
  - @memberjunction/ng-artifacts@2.110.0
  - @memberjunction/graphql-dataprovider@2.110.0
  - @memberjunction/ai-core-plus@2.110.0
  - @memberjunction/ai-engine-base@2.110.0
  - @memberjunction/ng-base-types@2.110.0
  - @memberjunction/ng-code-editor@2.110.0
  - @memberjunction/ng-notifications@2.110.0
  - @memberjunction/ng-tasks@2.110.0
  - @memberjunction/ai@2.110.0
  - @memberjunction/ng-container-directives@2.110.0
  - @memberjunction/core@2.110.0
  - @memberjunction/global@2.110.0

## 2.109.0

### Minor Changes

- 6e45c17: migration

### Patch Changes

- Updated dependencies [6e45c17]
- Updated dependencies [a38989b]
  - @memberjunction/ng-artifacts@2.109.0
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/ai-core-plus@2.109.0
  - @memberjunction/ai-engine-base@2.109.0
  - @memberjunction/ng-base-types@2.109.0
  - @memberjunction/ng-code-editor@2.109.0
  - @memberjunction/ng-notifications@2.109.0
  - @memberjunction/ng-tasks@2.109.0
  - @memberjunction/graphql-dataprovider@2.109.0
  - @memberjunction/ai@2.109.0
  - @memberjunction/ng-container-directives@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0

## 2.108.0

### Minor Changes

- a4d545b: migration

### Patch Changes

- 687e2ae: UI Fixes for Conversation Artifacts and Refactoring of the Agent Embedding System
- Updated dependencies [d205a6c]
- Updated dependencies [656d86c]
  - @memberjunction/ai-core-plus@2.108.0
  - @memberjunction/ai@2.108.0
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/graphql-dataprovider@2.108.0
  - @memberjunction/ai-engine-base@2.108.0
  - @memberjunction/ng-artifacts@2.108.0
  - @memberjunction/ng-base-types@2.108.0
  - @memberjunction/ng-code-editor@2.108.0
  - @memberjunction/ng-notifications@2.108.0
  - @memberjunction/ng-tasks@2.108.0
  - @memberjunction/ng-container-directives@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Minor Changes

- effc77f: migration

### Patch Changes

- e2c4513: Fix Task Graph Execution 'Unknown Error' by Correcting GraphQL Response Parsing
  - @memberjunction/ai-engine-base@2.107.0
  - @memberjunction/ai@2.107.0
  - @memberjunction/ai-core-plus@2.107.0
  - @memberjunction/ng-artifacts@2.107.0
  - @memberjunction/ng-base-types@2.107.0
  - @memberjunction/ng-code-editor@2.107.0
  - @memberjunction/ng-container-directives@2.107.0
  - @memberjunction/ng-notifications@2.107.0
  - @memberjunction/ng-tasks@2.107.0
  - @memberjunction/graphql-dataprovider@2.107.0
  - @memberjunction/core@2.107.0
  - @memberjunction/core-entities@2.107.0
  - @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/ai-engine-base@2.106.0
- @memberjunction/ai@2.106.0
- @memberjunction/ai-core-plus@2.106.0
- @memberjunction/ng-artifacts@2.106.0
- @memberjunction/ng-base-types@2.106.0
- @memberjunction/ng-code-editor@2.106.0
- @memberjunction/ng-container-directives@2.106.0
- @memberjunction/ng-notifications@2.106.0
- @memberjunction/ng-tasks@2.106.0
- @memberjunction/graphql-dataprovider@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/core-entities@2.106.0
- @memberjunction/global@2.106.0

## 2.105.0

### Minor Changes

- 5c2119c: migration

### Patch Changes

- Updated dependencies [4807f35]
- Updated dependencies [1d7a841]
- Updated dependencies [5c2119c]
- Updated dependencies [9b67e0c]
  - @memberjunction/ai-core-plus@2.105.0
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/ai-engine-base@2.105.0
  - @memberjunction/ng-artifacts@2.105.0
  - @memberjunction/ai@2.105.0
  - @memberjunction/graphql-dataprovider@2.105.0
  - @memberjunction/ng-base-types@2.105.0
  - @memberjunction/ng-code-editor@2.105.0
  - @memberjunction/ng-notifications@2.105.0
  - @memberjunction/ng-tasks@2.105.0
  - @memberjunction/ng-container-directives@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Minor Changes

- 9ad6353: migrations

### Patch Changes

- 0d66490: tweaks on UI
- Updated dependencies [2ff5428]
- Updated dependencies [4567af3]
- Updated dependencies [9ad6353]
  - @memberjunction/global@2.104.0
  - @memberjunction/graphql-dataprovider@2.104.0
  - @memberjunction/ai-core-plus@2.104.0
  - @memberjunction/core-entities@2.104.0
  - @memberjunction/ai-engine-base@2.104.0
  - @memberjunction/ai@2.104.0
  - @memberjunction/ng-base-types@2.104.0
  - @memberjunction/ng-code-editor@2.104.0
  - @memberjunction/ng-container-directives@2.104.0
  - @memberjunction/ng-notifications@2.104.0
  - @memberjunction/core@2.104.0

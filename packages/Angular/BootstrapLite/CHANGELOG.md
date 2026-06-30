# @memberjunction/ng-bootstrap-lite

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
- Updated dependencies [3eaa05a]
  - @memberjunction/core@5.43.0
  - @memberjunction/ai-core-plus@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/ng-conversations@5.43.0
  - @memberjunction/ai-engine-base@5.43.0
  - @memberjunction/ai-vectors-memory@5.43.0
  - @memberjunction/actions-base@5.43.0
  - @memberjunction/ng-auth-services@5.43.0
  - @memberjunction/ng-core-entity-forms@5.43.0
  - @memberjunction/ng-explorer-core@5.43.0
  - @memberjunction/ng-shared@5.43.0
  - @memberjunction/ng-artifacts@5.43.0
  - @memberjunction/ng-dashboard-viewer@5.43.0
  - @memberjunction/ng-entity-action-ux@5.43.0
  - @memberjunction/ng-entity-viewer@5.43.0
  - @memberjunction/ng-file-storage@5.43.0
  - @memberjunction/communication-types@5.43.0
  - @memberjunction/entity-communications-base@5.43.0
  - @memberjunction/graphql-dataprovider@5.43.0
  - @memberjunction/ai-realtime-client@5.43.0

## 5.42.0

### Patch Changes

- 08c016c: Add `@memberjunction/ai-bridge-livekit-native` — the real native LiveKit room client that wraps `@livekit/rtc-node` behind the `NativeRoomModule` contract `LiveKitNativeMeetingSdk` expects, giving the agent two-way audio (publish the agent's voice + subscribe to per-participant audio for diarized hearing) in a live LiveKit room. `@livekit/rtc-node` is an optionalDependency loaded lazily, so the package builds/tests with no addon (fake-module tests). Also regenerates the pre-built class-registration manifests to include `LoopbackBridge` from `@memberjunction/ai-bridge-server`.
- Updated dependencies [313c1c5]
- Updated dependencies [256ab06]
- Updated dependencies [9b9b484]
- Updated dependencies [e7c2437]
- Updated dependencies [37c73f6]
- Updated dependencies [0c6bf61]
- Updated dependencies [5fde509]
- Updated dependencies [4ec1732]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [ccaf49b]
- Updated dependencies [0fa3cbc]
- Updated dependencies [e4235fd]
- Updated dependencies [3ee0f22]
- Updated dependencies [a5d4a15]
- Updated dependencies [da5a3dd]
  - @memberjunction/ng-explorer-core@5.42.0
  - @memberjunction/ai-core-plus@5.42.0
  - @memberjunction/core@5.42.0
  - @memberjunction/ng-conversations@5.42.0
  - @memberjunction/communication-types@5.42.0
  - @memberjunction/ai-vectors-memory@5.42.0
  - @memberjunction/graphql-dataprovider@5.42.0
  - @memberjunction/actions-base@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/ng-entity-viewer@5.42.0
  - @memberjunction/ng-core-entity-forms@5.42.0
  - @memberjunction/ng-artifacts@5.42.0
  - @memberjunction/ng-file-storage@5.42.0
  - @memberjunction/ai-engine-base@5.42.0
  - @memberjunction/ng-shared@5.42.0
  - @memberjunction/ng-auth-services@5.42.0
  - @memberjunction/ng-dashboard-viewer@5.42.0
  - @memberjunction/entity-communications-base@5.42.0
  - @memberjunction/ai-realtime-client@5.42.0

## 5.41.0

### Minor Changes

- cd6c5f0: Realtime AI Agents wave 3: consolidated v5.41 migration (sessions, channels, co-agent schema) with the AIAgentCoAgent affinity registry replacing AIAgentPairedAgent — typed relationship vocabulary (CoAgent implemented; Peer/Delegate/Fallback/Reviewer/Observer reserved), type-level co-agent defaults as junction rows (removing the only FK cycle in core MJ), and the full code sweep (engine cache, resolver resolution chain, server-side invariants, client pairing reads, regenerated manifests). Realtime UX: progressive-disclosure voice console with persisted captions preference, user-owned composer and tabs toggles, audio-reactive visuals; whiteboard pages/multi-select and review-persistence fixes. Gemini Live triggering turns ride realtime text so widget clicks/typed input/narration speak immediately on native-audio models. CodeGen: single-winner IsNameField enforcement with eligibility guardrail fixes, SCC-based cycle diagnostics, and clean-database bootstrap robustness (conditional engine registry datasets).
- a5f5472: Remote Browser channel + new realtime voice providers + computer-use enrichment.
  - **Remote Browser channel** (`@memberjunction/remote-browser-*`): an in-house realtime channel where an agent drives a live, CDP-connected browser while it talks (sales demos, support walkthroughs, trainer agents). New `AIRemoteBrowserProvider` registry (migration V202606161000) with JSONType capability gating; a universal `remote-browser-base` (driver family + `RemoteBrowserEngineBase`), a shared `remote-browser-cdp` kit (one lossless action mapper + `CdpRemoteBrowserSession`), a `remote-browser-server` engine + `RemoteBrowserChannel` (control arbiter, control modes AgentOnly/ViewOnly/Collaborative vs strategies ComputerUse/NativeAI), and five thin backends (Self-Hosted Chrome, Browserbase, Steel, Browserless, Hyperbrowser).
  - **computer-use** enriched additively into a complete browser-I/O + perception engine: CSS-selector-aware actions, CDP screencast, MouseMove, accessibility-snapshot/QueryElement/GetVisibleText/GetTitle/WaitForLoadState — every consumer benefits, existing vision/coordinate path unchanged.
  - **New realtime model providers**: xAI Grok Voice (`@memberjunction/ai-xai`, OpenAI-Realtime-compatible) and Inworld (`@memberjunction/ai-inworld`), with vendor/model seeds.
  - **Console logging improvements** across `@memberjunction/ai-core-plus`, `ai-engine-base`, `ai-prompts`, `aiengine`, `cli`, `generic-database-provider`, `metadata-sync`, and the bootstrap/forms packages.

### Patch Changes

- 15b743b: Real-Time AI Agents — Sessions, Channels & the Realtime Model (plans/ai-agent-sessions.md). Adds the AIAgentSession/AIAgentChannel/AIAgentSessionChannel schema (+ AgentSessionID on AIAgentRun/ConversationDetail, CloseReason on AIAgentSession); the BaseRealtimeModel server primitive with OpenAIRealtime + GeminiRealtime drivers (server-bridged StartSession and client-direct ephemeral-token CreateClientSession, optional SendContextNote/RequestSpokenUpdate interim updates); the new @memberjunction/ai-realtime-client package with the BaseRealtimeClient browser abstraction + OpenAI/Gemini client drivers resolved via ClassFactory by provider key; the Realtime agent type + Voice Co-Agent with RealtimeSessionRunner/RealtimeToolBroker, AgentMemoryContextBuilder extraction, server session lifecycle (SessionManager, SessionJanitor, start/close/heartbeat + client-direct resolvers with delegated-run progress streaming, AwaitingFeedback resume, co-agent observability runs, user-selectable realtime model); the full-panel realtime voice call UX in ng-conversations (phone trigger + agent/model picker, banner/thread/activity rail, delegation working/result cards with provenance, ephemeral paced first-person progress narration driven by DB prompt templates, in-call text composer); Realtime Voice admin (AI Analytics dashboard sections, session/channel custom forms, agent Runs|Sessions execution history); and Query Builder/Strategist reliability fixes (entity catalog in prompt, Get Entity Details sample caps + semantic fallback, plan formatting). Also: the standalone @memberjunction/ng-whiteboard package (collaborative board with agent tool API, sandboxed interactive widgets + input bridge, markdown panels, exports, cancelable before/after events); ElevenLabs Agents + AssemblyAI Voice Agent realtime provider pairs (4-provider matrix, zero contract changes); session review mode with multi-leg resume carryover (timeline dividers, artifact junction closure, prior-transcript model hydration); delegation cancel channel; usage telemetry relay; Realtime Co-Agent rename with run-step/prompt-run observability.
- Updated dependencies [8fd6f59]
- Updated dependencies [6f227ab]
- Updated dependencies [2e48d1a]
- Updated dependencies [34d17e2]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [4b30726]
- Updated dependencies [ef5a5d7]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
- Updated dependencies [4b3fb9d]
- Updated dependencies [fb2a22f]
- Updated dependencies [c5d93a0]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ng-core-entity-forms@5.41.0
  - @memberjunction/ai-realtime-client@5.41.0
  - @memberjunction/ng-conversations@5.41.0
  - @memberjunction/graphql-dataprovider@5.41.0
  - @memberjunction/ai-engine-base@5.41.0
  - @memberjunction/ai-core-plus@5.41.0
  - @memberjunction/ng-artifacts@5.41.0
  - @memberjunction/ai-vectors-memory@5.41.0
  - @memberjunction/actions-base@5.41.0
  - @memberjunction/ng-auth-services@5.41.0
  - @memberjunction/ng-explorer-core@5.41.0
  - @memberjunction/ng-shared@5.41.0
  - @memberjunction/ng-dashboard-viewer@5.41.0
  - @memberjunction/ng-entity-viewer@5.41.0
  - @memberjunction/ng-file-storage@5.41.0
  - @memberjunction/communication-types@5.41.0
  - @memberjunction/entity-communications-base@5.41.0

## 5.40.2

### Patch Changes

- Updated dependencies [3da89ef]
  - @memberjunction/ng-artifacts@5.40.2
  - @memberjunction/ng-explorer-core@5.40.2
  - @memberjunction/ng-dashboard-viewer@5.40.2
  - @memberjunction/ai-engine-base@5.40.2
  - @memberjunction/ai-core-plus@5.40.2
  - @memberjunction/ai-vectors-memory@5.40.2
  - @memberjunction/actions-base@5.40.2
  - @memberjunction/ng-auth-services@5.40.2
  - @memberjunction/ng-core-entity-forms@5.40.2
  - @memberjunction/ng-shared@5.40.2
  - @memberjunction/ng-entity-viewer@5.40.2
  - @memberjunction/ng-file-storage@5.40.2
  - @memberjunction/communication-types@5.40.2
  - @memberjunction/entity-communications-base@5.40.2
  - @memberjunction/graphql-dataprovider@5.40.2
  - @memberjunction/core@5.40.2
  - @memberjunction/core-entities@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-engine-base@5.40.1
  - @memberjunction/ai-core-plus@5.40.1
  - @memberjunction/ai-vectors-memory@5.40.1
  - @memberjunction/actions-base@5.40.1
  - @memberjunction/ng-auth-services@5.40.1
  - @memberjunction/ng-core-entity-forms@5.40.1
  - @memberjunction/ng-explorer-core@5.40.1
  - @memberjunction/ng-shared@5.40.1
  - @memberjunction/ng-artifacts@5.40.1
  - @memberjunction/ng-dashboard-viewer@5.40.1
  - @memberjunction/ng-entity-viewer@5.40.1
  - @memberjunction/ng-file-storage@5.40.1
  - @memberjunction/communication-types@5.40.1
  - @memberjunction/entity-communications-base@5.40.1
  - @memberjunction/graphql-dataprovider@5.40.1
  - @memberjunction/core-entities@5.40.1

## 5.40.0

### Minor Changes

- 253a188: Knowledge Hub Classify redesign
  - **Clustering**: new `@memberjunction/clustering-engine` (framework-agnostic fetch → cluster → reduce → LLM-name pipeline), a "Run Cluster Analysis" action, a `RunClusterAnalysis` GraphQL resolver, a `GraphQLClusterClient` transport, and the Angular `ClusteringService` thinned to delegate to the server.
  - **View-type plug-in architecture (entity viewer)**: `ViewType` registry + `ViewTypeEngine` + `IViewTypeDescriptor`/`IViewRenderer`/`IViewPropSheet` contracts in `ng-entity-viewer`, with Grid/Cards/Timeline/Map descriptors. The host now **dynamic-mounts** any registered plug-in view type (via `ViewContainerRef`) with zero host changes, and the switcher shows the active type's icon + label, collapsing from an icon strip to a dropdown as the list grows. **Cluster view type** added in `@memberjunction/ng-clustering` (descriptor + `IViewRenderer` wrapper over the scatter + `IViewPropSheet` + an Entity-Document availability engine) — available on any entity with vectors, reusing the same `ClusteringService`. The active view type persists to `UserView.ViewTypeID` (new source of truth; backfilled from the legacy `DisplayState.defaultMode`) and per-view-type config to `UserView.DisplayState.viewTypeConfigs` (new typed `IViewTypeConfigEntry`). `ViewType.Icon` is now `ExtendedType='Icon'` for the admin icon picker. See `packages/Angular/Generic/entity-viewer/VIEW_TYPE_PLUGINS.md`.
  - **Classify UX**: per-tab scroll fix, Refresh buttons, meaningful content-item display names, loading states, `BaseEntityEvent` reactivity, and load-more pagination.
  - **Audit & analytics**: direct tag→prompt-run lineage (`AIPromptRunID` + `Reasoning` on Content Item Tags), `ClassifyAnalyticsEngine`, reusable item grid + drilldown, and an Overview analytics section.
  - **Setup & onboarding**: contextual prompt injection (org/content-type/source aggregation), `generateSeedTaxonomy` (clustering-backed) + resolver, source-form domain-context UI, org-context editor, inline Entity Document creation, seed-taxonomy review, and a guided setup wizard.
  - **Visualize surface**: Knowledge Hub "Clusters" tab generalized to a "Visualize" host with Clusters / Tag Cloud modes, a `TagCloudEngine`, and a shared record drilldown.
  - **Foundations**: `ApplicationSettingEngine` (global + app-scoped settings), and the `tag-engine` → `tag-engine-base` split so browser code no longer pulls server-only AI dependencies.
  - **Fix**: stop server-only packages (`templates` → `aiengine`/`ai-provider-bundle`, storage, vector-DB and LLM provider SDKs) from leaking into the browser class-registration manifest, which previously broke the MJExplorer cold build. Added CLAUDE.md guardrails to the Bootstrap and BootstrapLite packages.

### Patch Changes

- 7bbfd62: Add PreShellGuard for request-scoped TenantContext and auth fixes in MJServer CurrentUserContextResolver
- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [7bbfd62]
- Updated dependencies [f2cca15]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
- Updated dependencies [40e90fa]
- Updated dependencies [6957711]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/ng-entity-viewer@5.40.0
  - @memberjunction/ng-core-entity-forms@5.40.0
  - @memberjunction/graphql-dataprovider@5.40.0
  - @memberjunction/ng-artifacts@5.40.0
  - @memberjunction/ng-auth-services@5.40.0
  - @memberjunction/ng-explorer-core@5.40.0
  - @memberjunction/ng-shared@5.40.0
  - @memberjunction/ai-engine-base@5.40.0
  - @memberjunction/ai-core-plus@5.40.0
  - @memberjunction/ai-vectors-memory@5.40.0
  - @memberjunction/actions-base@5.40.0
  - @memberjunction/ng-dashboard-viewer@5.40.0
  - @memberjunction/ng-file-storage@5.40.0
  - @memberjunction/communication-types@5.40.0
  - @memberjunction/entity-communications-base@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [f60e340]
- Updated dependencies [bd95e83]
- Updated dependencies [3c53858]
- Updated dependencies [3b29882]
- Updated dependencies [d1cc0ad]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/graphql-dataprovider@5.39.0
  - @memberjunction/ng-explorer-core@5.39.0
  - @memberjunction/ng-core-entity-forms@5.39.0
  - @memberjunction/ai-core-plus@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ai-engine-base@5.39.0
  - @memberjunction/ai-vectors-memory@5.39.0
  - @memberjunction/actions-base@5.39.0
  - @memberjunction/ng-auth-services@5.39.0
  - @memberjunction/ng-shared@5.39.0
  - @memberjunction/ng-artifacts@5.39.0
  - @memberjunction/ng-dashboard-viewer@5.39.0
  - @memberjunction/ng-file-storage@5.39.0
  - @memberjunction/communication-types@5.39.0
  - @memberjunction/entity-communications-base@5.39.0

## 5.38.0

### Patch Changes

- 60947be: Fix several entity-record save flow issues in MJ Explorer: re-key the tab and component cache when a "Create New Record" form transitions to a saved record so subsequent new-record clicks open a blank form; correct the URL-segment format used by ResourceRecordSaved so the form no longer fails to reload after save with a doubled-prefix key; wire up the previously no-op tab title refresh after save (including refreshing the Home app's dynamic nav-item label) so the user sees the latest entity name without navigating away.
- ebb0e3d: Eliminate provider.Refresh() from query save/delete paths, introduce MJQueryEntityExtended with child-relationship getters and business logic, migrate all QueryInfo consumers outside MJCore to use QueryEngine and entity types, remove dead QueryCacheManager, and replace 12 redundant RunView calls with QueryEngine cache reads. Fixes major performance bottleneck on large-entity deployments where every query save reloaded the entire metadata graph.
- Updated dependencies [6b6c321]
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [6a571d3]
- Updated dependencies [275afda]
- Updated dependencies [d285996]
- Updated dependencies [8bd97f3]
- Updated dependencies [6a3ac36]
- Updated dependencies [918d663]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [b26d0ee]
- Updated dependencies [60947be]
- Updated dependencies [ebb0e3d]
  - @memberjunction/ai-core-plus@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/ng-core-entity-forms@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/ng-shared@5.38.0
  - @memberjunction/ng-explorer-core@5.38.0
  - @memberjunction/ng-artifacts@5.38.0
  - @memberjunction/graphql-dataprovider@5.38.0
  - @memberjunction/ai-engine-base@5.38.0
  - @memberjunction/ai-vectors-memory@5.38.0
  - @memberjunction/actions-base@5.38.0
  - @memberjunction/ng-auth-services@5.38.0
  - @memberjunction/ng-dashboard-viewer@5.38.0
  - @memberjunction/ng-file-storage@5.38.0
  - @memberjunction/communication-types@5.38.0
  - @memberjunction/entity-communications-base@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [dadbde9]
- Updated dependencies [22b775f]
- Updated dependencies [4f15f31]
  - @memberjunction/graphql-dataprovider@5.37.0
  - @memberjunction/ai-core-plus@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ng-core-entity-forms@5.37.0
  - @memberjunction/ng-explorer-core@5.37.0
  - @memberjunction/ng-shared@5.37.0
  - @memberjunction/ng-artifacts@5.37.0
  - @memberjunction/ng-file-storage@5.37.0
  - @memberjunction/ai-engine-base@5.37.0
  - @memberjunction/ai-vectors-memory@5.37.0
  - @memberjunction/actions-base@5.37.0
  - @memberjunction/ng-auth-services@5.37.0
  - @memberjunction/ng-dashboard-viewer@5.37.0
  - @memberjunction/communication-types@5.37.0
  - @memberjunction/entity-communications-base@5.37.0

## 5.36.0

### Patch Changes

- 91036ee: Refreshable, shareable, taggable Lists with an agent-callable Actions surface.
  - New `@memberjunction/lists` core: ListOperations (delta + drop-guard + materialize/refresh/set-op), ListSharing, AudienceResolver.
  - `MJ: Lists` lineage fields (SourceViewID, SourceFilterSnapshot, LastRefreshedAt, RefreshMode, UseSnapshot) wired into Refresh-from-source.
  - GraphQL: ListOperationsResolver + GraphQLListsClient. New `SendToAudience` in communication-engine.
  - 12 new Actions covering materialize / refresh / share / invite / move / compose / resolve-audience / send-to-audience.
  - UI: Save-as-List, mixed list+view operands, compose-into-target, Shared With Me tab, invitations + audit-log dialogs, viewer-perspective gating, bulk Move/Copy with delta-confirm, tag chips + filter, list-stats sidebar, audience picker, Communications New Message page, Excel/CSV/JSON column-picker export.

- Updated dependencies [f29b7c0]
- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/graphql-dataprovider@5.36.0
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/ng-explorer-core@5.36.0
  - @memberjunction/ng-core-entity-forms@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ng-shared@5.36.0
  - @memberjunction/ng-artifacts@5.36.0
  - @memberjunction/ng-file-storage@5.36.0
  - @memberjunction/ng-dashboard-viewer@5.36.0
  - @memberjunction/ai-engine-base@5.36.0
  - @memberjunction/ai-core-plus@5.36.0
  - @memberjunction/actions-base@5.36.0
  - @memberjunction/communication-types@5.36.0
  - @memberjunction/entity-communications-base@5.36.0
  - @memberjunction/ai-vectors-memory@5.36.0
  - @memberjunction/ng-auth-services@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [ee380f7]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [eb54def]
- Updated dependencies [77e4782]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [383784c]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/ng-file-storage@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/ng-core-entity-forms@5.35.0
  - @memberjunction/graphql-dataprovider@5.35.0
  - @memberjunction/ai-core-plus@5.35.0
  - @memberjunction/ng-shared@5.35.0
  - @memberjunction/ng-explorer-core@5.35.0
  - @memberjunction/ai-engine-base@5.35.0
  - @memberjunction/ai-vectors-memory@5.35.0
  - @memberjunction/actions-base@5.35.0
  - @memberjunction/ng-auth-services@5.35.0
  - @memberjunction/ng-artifacts@5.35.0
  - @memberjunction/ng-dashboard-viewer@5.35.0
  - @memberjunction/communication-types@5.35.0
  - @memberjunction/entity-communications-base@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
- Updated dependencies [8695f65]
- Updated dependencies [5abf790]
  - @memberjunction/core@5.34.1
  - @memberjunction/graphql-dataprovider@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/ai-engine-base@5.34.1
  - @memberjunction/ai-vectors-memory@5.34.1
  - @memberjunction/actions-base@5.34.1
  - @memberjunction/ng-auth-services@5.34.1
  - @memberjunction/ng-core-entity-forms@5.34.1
  - @memberjunction/ng-explorer-core@5.34.1
  - @memberjunction/ng-shared@5.34.1
  - @memberjunction/ng-artifacts@5.34.1
  - @memberjunction/ng-dashboard-viewer@5.34.1
  - @memberjunction/ng-file-storage@5.34.1
  - @memberjunction/communication-types@5.34.1
  - @memberjunction/entity-communications-base@5.34.1
  - @memberjunction/core-entities@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [b03bfb4]
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [11ae7e6]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [ad61267]
- Updated dependencies [72cb92e]
  - @memberjunction/ng-core-entity-forms@5.34.0
  - @memberjunction/ng-explorer-core@5.34.0
  - @memberjunction/ng-artifacts@5.34.0
  - @memberjunction/ai-engine-base@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/ai-vectors-memory@5.34.0
  - @memberjunction/actions-base@5.34.0
  - @memberjunction/ng-auth-services@5.34.0
  - @memberjunction/ng-shared@5.34.0
  - @memberjunction/ng-dashboard-viewer@5.34.0
  - @memberjunction/ng-file-storage@5.34.0
  - @memberjunction/communication-types@5.34.0
  - @memberjunction/entity-communications-base@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/graphql-dataprovider@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [97ed790]
- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/ng-explorer-core@5.33.0
  - @memberjunction/graphql-dataprovider@5.33.0
  - @memberjunction/core@5.33.0
  - @memberjunction/ng-core-entity-forms@5.33.0
  - @memberjunction/ng-shared@5.33.0
  - @memberjunction/ng-artifacts@5.33.0
  - @memberjunction/ng-file-storage@5.33.0
  - @memberjunction/ai-engine-base@5.33.0
  - @memberjunction/ai-core-plus@5.33.0
  - @memberjunction/actions-base@5.33.0
  - @memberjunction/ng-auth-services@5.33.0
  - @memberjunction/ng-dashboard-viewer@5.33.0
  - @memberjunction/communication-types@5.33.0
  - @memberjunction/entity-communications-base@5.33.0
  - @memberjunction/core-entities@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ai-engine-base@5.32.0
  - @memberjunction/ai-core-plus@5.32.0
  - @memberjunction/actions-base@5.32.0
  - @memberjunction/ng-auth-services@5.32.0
  - @memberjunction/ng-core-entity-forms@5.32.0
  - @memberjunction/ng-explorer-core@5.32.0
  - @memberjunction/ng-shared@5.32.0
  - @memberjunction/ng-artifacts@5.32.0
  - @memberjunction/ng-dashboard-viewer@5.32.0
  - @memberjunction/ng-file-storage@5.32.0
  - @memberjunction/communication-types@5.32.0
  - @memberjunction/entity-communications-base@5.32.0
  - @memberjunction/graphql-dataprovider@5.32.0
  - @memberjunction/core-entities@5.32.0

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
- Updated dependencies [c8b6f8a]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
- Updated dependencies [0e3365f]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/graphql-dataprovider@5.31.0
  - @memberjunction/ng-core-entity-forms@5.31.0
  - @memberjunction/ai-engine-base@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/actions-base@5.31.0
  - @memberjunction/ng-auth-services@5.31.0
  - @memberjunction/ng-explorer-core@5.31.0
  - @memberjunction/ng-shared@5.31.0
  - @memberjunction/ng-artifacts@5.31.0
  - @memberjunction/ng-dashboard-viewer@5.31.0
  - @memberjunction/ng-file-storage@5.31.0
  - @memberjunction/communication-types@5.31.0
  - @memberjunction/entity-communications-base@5.31.0
  - @memberjunction/core@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ai-engine-base@5.30.1
- @memberjunction/ai-core-plus@5.30.1
- @memberjunction/actions-base@5.30.1
- @memberjunction/ng-auth-services@5.30.1
- @memberjunction/ng-core-entity-forms@5.30.1
- @memberjunction/ng-explorer-core@5.30.1
- @memberjunction/ng-shared@5.30.1
- @memberjunction/ng-artifacts@5.30.1
- @memberjunction/ng-dashboard-viewer@5.30.1
- @memberjunction/ng-file-storage@5.30.1
- @memberjunction/communication-types@5.30.1
- @memberjunction/entity-communications-base@5.30.1
- @memberjunction/graphql-dataprovider@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1

## 5.30.0

### Patch Changes

- c199f3b: Phase 2 of the unified permissions architecture: introduces the `IPermissionProvider` interface with 9 domain providers (Entity, Application Role, Dashboard, Resource, Artifact, AI Agent, Collection, Query, Access Control Rule) aggregated by a new `PermissionEngine` singleton, adds explicit Allow/Deny support to `EntityPermission`, and ships the Permissions admin dashboard. Includes migrations for the Permission Domain catalog, EntityPermission.Type column, Dashboard FK cascade delete, ResourcePermission.SharedByUserID, and UI role permission fixes.
- Updated dependencies [8980b38]
- Updated dependencies [c2c5892]
- Updated dependencies [11df18d]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [9154ac7]
- Updated dependencies [b1f32a4]
- Updated dependencies [a00af98]
- Updated dependencies [c199f3b]
- Updated dependencies [216ddc3]
  - @memberjunction/ng-core-entity-forms@5.30.0
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/ng-dashboard-viewer@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/actions-base@5.30.0
  - @memberjunction/ai-core-plus@5.30.0
  - @memberjunction/graphql-dataprovider@5.30.0
  - @memberjunction/ai-engine-base@5.30.0
  - @memberjunction/ng-artifacts@5.30.0
  - @memberjunction/ng-explorer-core@5.30.0
  - @memberjunction/ng-shared@5.30.0
  - @memberjunction/ng-file-storage@5.30.0
  - @memberjunction/communication-types@5.30.0
  - @memberjunction/entity-communications-base@5.30.0
  - @memberjunction/ng-auth-services@5.30.0

## 5.29.0

### Patch Changes

- 5c7a57f: Add in-app feedback system with mj-dialog UI, GitHub App authentication for issue creation, and shell header integration. Feedback submissions create formatted GitHub issues with labels, severity, environment info, and browser details.
- Updated dependencies [5c7a57f]
- Updated dependencies [e02e24e]
- Updated dependencies [5585961]
- Updated dependencies [7006276]
  - @memberjunction/ng-explorer-core@5.29.0
  - @memberjunction/core@5.29.0
  - @memberjunction/ng-core-entity-forms@5.29.0
  - @memberjunction/ng-file-storage@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ai-engine-base@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/actions-base@5.29.0
  - @memberjunction/ng-auth-services@5.29.0
  - @memberjunction/ng-shared@5.29.0
  - @memberjunction/ng-artifacts@5.29.0
  - @memberjunction/ng-dashboard-viewer@5.29.0
  - @memberjunction/communication-types@5.29.0
  - @memberjunction/entity-communications-base@5.29.0
  - @memberjunction/graphql-dataprovider@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [2542615]
- Updated dependencies [115e4da]
  - @memberjunction/ng-shared@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ng-explorer-core@5.28.0
  - @memberjunction/ng-core-entity-forms@5.28.0
  - @memberjunction/ng-file-storage@5.28.0
  - @memberjunction/ai-engine-base@5.28.0
  - @memberjunction/ai-core-plus@5.28.0
  - @memberjunction/actions-base@5.28.0
  - @memberjunction/ng-auth-services@5.28.0
  - @memberjunction/ng-artifacts@5.28.0
  - @memberjunction/ng-dashboard-viewer@5.28.0
  - @memberjunction/communication-types@5.28.0
  - @memberjunction/entity-communications-base@5.28.0
  - @memberjunction/graphql-dataprovider@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
- Updated dependencies [6c39ff0]
  - @memberjunction/ng-dashboard-viewer@5.27.1
  - @memberjunction/graphql-dataprovider@5.27.1
  - @memberjunction/ng-explorer-core@5.27.1
  - @memberjunction/ai-engine-base@5.27.1
  - @memberjunction/ai-core-plus@5.27.1
  - @memberjunction/actions-base@5.27.1
  - @memberjunction/ng-auth-services@5.27.1
  - @memberjunction/ng-core-entity-forms@5.27.1
  - @memberjunction/ng-shared@5.27.1
  - @memberjunction/ng-artifacts@5.27.1
  - @memberjunction/ng-file-storage@5.27.1
  - @memberjunction/communication-types@5.27.1
  - @memberjunction/entity-communications-base@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1

## 5.27.0

### Patch Changes

- Updated dependencies [6fd2886]
  - @memberjunction/ng-explorer-core@5.27.0
  - @memberjunction/ng-core-entity-forms@5.27.0
  - @memberjunction/ng-artifacts@5.27.0
  - @memberjunction/ng-dashboard-viewer@5.27.0
  - @memberjunction/ai-engine-base@5.27.0
  - @memberjunction/ai-core-plus@5.27.0
  - @memberjunction/actions-base@5.27.0
  - @memberjunction/ng-auth-services@5.27.0
  - @memberjunction/ng-shared@5.27.0
  - @memberjunction/ng-file-storage@5.27.0
  - @memberjunction/communication-types@5.27.0
  - @memberjunction/entity-communications-base@5.27.0
  - @memberjunction/graphql-dataprovider@5.27.0
  - @memberjunction/core@5.27.0
  - @memberjunction/core-entities@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/ng-core-entity-forms@5.26.0
  - @memberjunction/ng-dashboard-viewer@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-engine-base@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/actions-base@5.26.0
  - @memberjunction/ng-explorer-core@5.26.0
  - @memberjunction/ng-shared@5.26.0
  - @memberjunction/ng-artifacts@5.26.0
  - @memberjunction/ng-file-storage@5.26.0
  - @memberjunction/communication-types@5.26.0
  - @memberjunction/entity-communications-base@5.26.0
  - @memberjunction/graphql-dataprovider@5.26.0
  - @memberjunction/ng-auth-services@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [a24ff53]
- Updated dependencies [d6370e8]
- Updated dependencies [008a62d]
- Updated dependencies [7ddf732]
- Updated dependencies [5e2a64f]
- Updated dependencies [1eb9f6e]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/graphql-dataprovider@5.25.0
  - @memberjunction/ng-core-entity-forms@5.25.0
  - @memberjunction/ng-explorer-core@5.25.0
  - @memberjunction/ng-dashboard-viewer@5.25.0
  - @memberjunction/ng-artifacts@5.25.0
  - @memberjunction/ai-engine-base@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/actions-base@5.25.0
  - @memberjunction/ng-auth-services@5.25.0
  - @memberjunction/ng-shared@5.25.0
  - @memberjunction/ng-file-storage@5.25.0
  - @memberjunction/communication-types@5.25.0
  - @memberjunction/entity-communications-base@5.25.0

## 5.24.0

### Minor Changes

- c318a0c: metadata + migrations in this PR == minor

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [3a35955]
- Updated dependencies [1912726]
  - @memberjunction/ai-core-plus@5.24.0
  - @memberjunction/ng-explorer-core@5.24.0
  - @memberjunction/graphql-dataprovider@5.24.0
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/ng-auth-services@5.24.0
  - @memberjunction/ng-artifacts@5.24.0
  - @memberjunction/ai-engine-base@5.24.0
  - @memberjunction/ng-core-entity-forms@5.24.0
  - @memberjunction/ng-shared@5.24.0
  - @memberjunction/ng-file-storage@5.24.0
  - @memberjunction/actions-base@5.24.0
  - @memberjunction/ng-dashboard-viewer@5.24.0
  - @memberjunction/communication-types@5.24.0
  - @memberjunction/entity-communications-base@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [1d1e02e]
- Updated dependencies [c17be20]
  - @memberjunction/core@5.23.0
  - @memberjunction/ng-explorer-core@5.23.0
  - @memberjunction/ng-artifacts@5.23.0
  - @memberjunction/ng-dashboard-viewer@5.23.0
  - @memberjunction/graphql-dataprovider@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ai-core-plus@5.23.0
  - @memberjunction/ai-engine-base@5.23.0
  - @memberjunction/actions-base@5.23.0
  - @memberjunction/ng-auth-services@5.23.0
  - @memberjunction/ng-core-entity-forms@5.23.0
  - @memberjunction/ng-shared@5.23.0
  - @memberjunction/ng-file-storage@5.23.0
  - @memberjunction/communication-types@5.23.0
  - @memberjunction/entity-communications-base@5.23.0

## 5.22.0

### Minor Changes

- a42aba6: metadata

### Patch Changes

- Updated dependencies [0b23772]
- Updated dependencies [cf91278]
- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [e5993ff]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/ng-explorer-core@5.22.0
  - @memberjunction/ng-artifacts@5.22.0
  - @memberjunction/ng-dashboard-viewer@5.22.0
  - @memberjunction/ai-engine-base@5.22.0
  - @memberjunction/ng-core-entity-forms@5.22.0
  - @memberjunction/graphql-dataprovider@5.22.0
  - @memberjunction/actions-base@5.22.0
  - @memberjunction/ng-auth-services@5.22.0
  - @memberjunction/ng-shared@5.22.0
  - @memberjunction/ng-file-storage@5.22.0
  - @memberjunction/communication-types@5.22.0
  - @memberjunction/entity-communications-base@5.22.0
  - @memberjunction/core-entities@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
- Updated dependencies [76cd2bc]
  - @memberjunction/core@5.21.0
  - @memberjunction/ai-core-plus@5.21.0
  - @memberjunction/ai-engine-base@5.21.0
  - @memberjunction/actions-base@5.21.0
  - @memberjunction/ng-auth-services@5.21.0
  - @memberjunction/ng-core-entity-forms@5.21.0
  - @memberjunction/ng-explorer-core@5.21.0
  - @memberjunction/ng-shared@5.21.0
  - @memberjunction/ng-artifacts@5.21.0
  - @memberjunction/ng-dashboard-viewer@5.21.0
  - @memberjunction/ng-file-storage@5.21.0
  - @memberjunction/communication-types@5.21.0
  - @memberjunction/entity-communications-base@5.21.0
  - @memberjunction/graphql-dataprovider@5.21.0
  - @memberjunction/core-entities@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ai-engine-base@5.20.0
  - @memberjunction/ai-core-plus@5.20.0
  - @memberjunction/actions-base@5.20.0
  - @memberjunction/ng-auth-services@5.20.0
  - @memberjunction/ng-core-entity-forms@5.20.0
  - @memberjunction/ng-explorer-core@5.20.0
  - @memberjunction/ng-shared@5.20.0
  - @memberjunction/ng-artifacts@5.20.0
  - @memberjunction/ng-dashboard-viewer@5.20.0
  - @memberjunction/ng-file-storage@5.20.0
  - @memberjunction/communication-types@5.20.0
  - @memberjunction/entity-communications-base@5.20.0
  - @memberjunction/graphql-dataprovider@5.20.0
  - @memberjunction/core-entities@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ai-engine-base@5.19.0
- @memberjunction/ai-core-plus@5.19.0
- @memberjunction/actions-base@5.19.0
- @memberjunction/ng-auth-services@5.19.0
- @memberjunction/ng-core-entity-forms@5.19.0
- @memberjunction/ng-explorer-core@5.19.0
- @memberjunction/ng-shared@5.19.0
- @memberjunction/ng-artifacts@5.19.0
- @memberjunction/ng-dashboard-viewer@5.19.0
- @memberjunction/ng-file-storage@5.19.0
- @memberjunction/communication-types@5.19.0
- @memberjunction/entity-communications-base@5.19.0
- @memberjunction/graphql-dataprovider@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0

## 5.18.0

### Patch Changes

- Updated dependencies [322dac6]
- Updated dependencies [ee4bf94]
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/ng-core-entity-forms@5.18.0
  - @memberjunction/ai-engine-base@5.18.0
  - @memberjunction/ng-explorer-core@5.18.0
  - @memberjunction/graphql-dataprovider@5.18.0
  - @memberjunction/ng-artifacts@5.18.0
  - @memberjunction/ng-shared@5.18.0
  - @memberjunction/ng-file-storage@5.18.0
  - @memberjunction/ng-dashboard-viewer@5.18.0
  - @memberjunction/actions-base@5.18.0
  - @memberjunction/ng-auth-services@5.18.0
  - @memberjunction/communication-types@5.18.0
  - @memberjunction/entity-communications-base@5.18.0
  - @memberjunction/core@5.18.0
  - @memberjunction/core-entities@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [bbfbf5e]
- Updated dependencies [001fd3e]
- Updated dependencies [9881045]
  - @memberjunction/graphql-dataprovider@5.17.0
  - @memberjunction/ng-core-entity-forms@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/ng-explorer-core@5.17.0
  - @memberjunction/ng-shared@5.17.0
  - @memberjunction/ng-file-storage@5.17.0
  - @memberjunction/ai-engine-base@5.17.0
  - @memberjunction/ai-core-plus@5.17.0
  - @memberjunction/actions-base@5.17.0
  - @memberjunction/ng-auth-services@5.17.0
  - @memberjunction/ng-artifacts@5.17.0
  - @memberjunction/ng-dashboard-viewer@5.17.0
  - @memberjunction/communication-types@5.17.0
  - @memberjunction/entity-communications-base@5.17.0
  - @memberjunction/core-entities@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [179a4ce]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/graphql-dataprovider@5.16.0
  - @memberjunction/ai-engine-base@5.16.0
  - @memberjunction/ai-core-plus@5.16.0
  - @memberjunction/actions-base@5.16.0
  - @memberjunction/ng-auth-services@5.16.0
  - @memberjunction/ng-core-entity-forms@5.16.0
  - @memberjunction/ng-explorer-core@5.16.0
  - @memberjunction/ng-shared@5.16.0
  - @memberjunction/ng-artifacts@5.16.0
  - @memberjunction/ng-dashboard-viewer@5.16.0
  - @memberjunction/ng-file-storage@5.16.0
  - @memberjunction/communication-types@5.16.0
  - @memberjunction/entity-communications-base@5.16.0
  - @memberjunction/core-entities@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
- Updated dependencies [c3e8b94]
  - @memberjunction/ng-core-entity-forms@5.15.0
  - @memberjunction/core@5.15.0
  - @memberjunction/ai-core-plus@5.15.0
  - @memberjunction/ai-engine-base@5.15.0
  - @memberjunction/actions-base@5.15.0
  - @memberjunction/ng-auth-services@5.15.0
  - @memberjunction/ng-explorer-core@5.15.0
  - @memberjunction/ng-shared@5.15.0
  - @memberjunction/ng-artifacts@5.15.0
  - @memberjunction/ng-dashboard-viewer@5.15.0
  - @memberjunction/ng-file-storage@5.15.0
  - @memberjunction/communication-types@5.15.0
  - @memberjunction/entity-communications-base@5.15.0
  - @memberjunction/graphql-dataprovider@5.15.0
  - @memberjunction/core-entities@5.15.0

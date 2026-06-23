# @memberjunction/ng-bootstrap

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
  - @memberjunction/ng-dashboards@5.42.0
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
  - @memberjunction/ng-explorer-settings@5.42.0
  - @memberjunction/ng-artifacts@5.42.0
  - @memberjunction/ng-file-storage@5.42.0
  - @memberjunction/ai-engine-base@5.42.0
  - @memberjunction/ng-shared@5.42.0
  - @memberjunction/tag-engine-base@5.42.0
  - @memberjunction/ng-auth-services@5.42.0
  - @memberjunction/ng-clustering@5.42.0
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
  - @memberjunction/ng-dashboards@5.41.0
  - @memberjunction/ng-artifacts@5.41.0
  - @memberjunction/tag-engine-base@5.41.0
  - @memberjunction/ai-vectors-memory@5.41.0
  - @memberjunction/actions-base@5.41.0
  - @memberjunction/ng-auth-services@5.41.0
  - @memberjunction/ng-explorer-core@5.41.0
  - @memberjunction/ng-explorer-settings@5.41.0
  - @memberjunction/ng-shared@5.41.0
  - @memberjunction/ng-clustering@5.41.0
  - @memberjunction/ng-dashboard-viewer@5.41.0
  - @memberjunction/ng-entity-viewer@5.41.0
  - @memberjunction/ng-file-storage@5.41.0
  - @memberjunction/communication-types@5.41.0
  - @memberjunction/entity-communications-base@5.41.0

## 5.40.2

### Patch Changes

- Updated dependencies [3da89ef]
- Updated dependencies [da2ee38]
  - @memberjunction/ng-artifacts@5.40.2
  - @memberjunction/ng-dashboards@5.40.2
  - @memberjunction/ng-explorer-core@5.40.2
  - @memberjunction/ng-dashboard-viewer@5.40.2
  - @memberjunction/ai-engine-base@5.40.2
  - @memberjunction/ai-core-plus@5.40.2
  - @memberjunction/tag-engine-base@5.40.2
  - @memberjunction/ai-vectors-memory@5.40.2
  - @memberjunction/actions-base@5.40.2
  - @memberjunction/ng-auth-services@5.40.2
  - @memberjunction/ng-core-entity-forms@5.40.2
  - @memberjunction/ng-explorer-settings@5.40.2
  - @memberjunction/ng-shared@5.40.2
  - @memberjunction/ng-clustering@5.40.2
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
  - @memberjunction/tag-engine-base@5.40.1
  - @memberjunction/ai-vectors-memory@5.40.1
  - @memberjunction/actions-base@5.40.1
  - @memberjunction/ng-auth-services@5.40.1
  - @memberjunction/ng-core-entity-forms@5.40.1
  - @memberjunction/ng-dashboards@5.40.1
  - @memberjunction/ng-explorer-core@5.40.1
  - @memberjunction/ng-explorer-settings@5.40.1
  - @memberjunction/ng-shared@5.40.1
  - @memberjunction/ng-artifacts@5.40.1
  - @memberjunction/ng-clustering@5.40.1
  - @memberjunction/ng-dashboard-viewer@5.40.1
  - @memberjunction/ng-entity-viewer@5.40.1
  - @memberjunction/ng-file-storage@5.40.1
  - @memberjunction/communication-types@5.40.1
  - @memberjunction/entity-communications-base@5.40.1
  - @memberjunction/graphql-dataprovider@5.40.1
  - @memberjunction/core-entities@5.40.1

## 5.40.0

### Minor Changes

- 43e6c0f: MJ-issued magic-link sessions for external, app-scoped users: passwordless, single-use (or multi-use) invite links that sign external users into MJExplorer confined to one application and a per-link role. MJ issues and validates its own RS256 session tokens (published via JWKS, accepted by the standard auth-provider path), so there's no external IdP dependency or per-user IdP cost. Invite scope (app, role, expiry, max uses) is configured per link, with support for per-invite app/role, resource-scoped RLS sharing, and anonymous sessions — a shared Anonymous principal whose scope rides per-session JWT claims rather than DB roles, so concurrent anonymous visitors can't accrete privileges.

  Also includes two framework changes made along the way:
  - **RunView server-cache RLS fix:** the cache fingerprint now incorporates the per-user Row-Level-Security where-clause, so an RLS-scoped read can no longer be served an unscoped cached result. No-op for users without an RLS filter (byte-identical fingerprint), so normal caching is untouched.
  - **BaseEngine degrades gracefully under restricted roles:** a config load that fails because the current user lacks Read permission is now treated as a permanent condition — the property loads empty and the engine is marked loaded — instead of looping on "not marking as loaded", which previously hung the MJExplorer shell for least-privilege users (e.g. magic-link guests). Only genuinely transient failures (network, server restart) keep retrying.

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
  - @memberjunction/ng-dashboards@5.40.0
  - @memberjunction/ng-clustering@5.40.0
  - @memberjunction/ng-entity-viewer@5.40.0
  - @memberjunction/ng-core-entity-forms@5.40.0
  - @memberjunction/graphql-dataprovider@5.40.0
  - @memberjunction/ng-artifacts@5.40.0
  - @memberjunction/ng-auth-services@5.40.0
  - @memberjunction/ng-explorer-core@5.40.0
  - @memberjunction/ng-shared@5.40.0
  - @memberjunction/tag-engine-base@5.40.0
  - @memberjunction/ai-engine-base@5.40.0
  - @memberjunction/ai-core-plus@5.40.0
  - @memberjunction/ai-vectors-memory@5.40.0
  - @memberjunction/actions-base@5.40.0
  - @memberjunction/ng-explorer-settings@5.40.0
  - @memberjunction/ng-dashboard-viewer@5.40.0
  - @memberjunction/ng-file-storage@5.40.0
  - @memberjunction/communication-types@5.40.0
  - @memberjunction/entity-communications-base@5.40.0

## 5.39.0

### Minor Changes

- 0f9acba: feat(knowledge-hub): Classify sub-app decomposition + new classification features

  Decompose the Classify (content autotagging) dashboard from a single ~5,150-line component into a thin host shell plus 6 self-contained tab sub-page components and 4 dialog components, with a shared pure helper layer. Cacheable metadata reuses the existing `KnowledgeHubMetadataEngine` / `TagEngineBase` / `AIEngineBase`; high-volume rows stay on `RunView`.

  Surfaces backend capabilities that previously had no UI:
  - **Suggestions Inbox** — human-in-the-loop review queue over `MJ: Tag Suggestions` (approve / merge / reject).
  - **Tag Health** — real merge-candidate / low-usage / wide-node signals, replacing the prior heuristic.
  - **Governance / Synonyms / Scope** editors on the Taxonomy tag panel (typed `MJTag` flags, synonym approval workflow, tag scope).
  - **Config parity** — full `IContentSourceConfiguration` (taxonomy mode, thresholds, tag root, budgets, toggles, effective-values) inline in the source form, which is now sectioned and a resizable, width-remembering slide-in.
  - **Dry-run preview** — in-memory disposition preview of a source's tags under its current mode + thresholds (no LLM call, nothing persisted).

  Adds `TagSynonym.Status` (`Active`/`Pending`/`Rejected`, default `Active`) for the synonym approval workflow — additive and backward-compatible — with the regenerated entity, server, and form code. `ng-bootstrap`'s class manifest + allow-list pick up `TagEngineBase`.

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [f60e340]
- Updated dependencies [bd95e83]
- Updated dependencies [1b69c68]
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
  - @memberjunction/ng-dashboards@5.39.0
  - @memberjunction/ng-explorer-core@5.39.0
  - @memberjunction/ng-explorer-settings@5.39.0
  - @memberjunction/ng-core-entity-forms@5.39.0
  - @memberjunction/ai-core-plus@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ai-engine-base@5.39.0
  - @memberjunction/tag-engine-base@5.39.0
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
- Updated dependencies [4d2881d]
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
  - @memberjunction/ng-dashboards@5.38.0
  - @memberjunction/ng-shared@5.38.0
  - @memberjunction/ng-explorer-core@5.38.0
  - @memberjunction/ng-artifacts@5.38.0
  - @memberjunction/graphql-dataprovider@5.38.0
  - @memberjunction/ai-engine-base@5.38.0
  - @memberjunction/ng-explorer-settings@5.38.0
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
  - @memberjunction/ng-dashboards@5.37.0
  - @memberjunction/ng-explorer-core@5.37.0
  - @memberjunction/ng-explorer-settings@5.37.0
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
- Updated dependencies [1c0fce9]
- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/graphql-dataprovider@5.36.0
  - @memberjunction/ng-dashboards@5.36.0
  - @memberjunction/ng-explorer-settings@5.36.0
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
  - @memberjunction/ng-dashboards@5.35.0
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
  - @memberjunction/ng-explorer-settings@5.35.0
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
  - @memberjunction/ng-dashboards@5.34.1
  - @memberjunction/graphql-dataprovider@5.34.1
  - @memberjunction/ai-core-plus@5.34.1
  - @memberjunction/ai-engine-base@5.34.1
  - @memberjunction/ai-vectors-memory@5.34.1
  - @memberjunction/actions-base@5.34.1
  - @memberjunction/ng-auth-services@5.34.1
  - @memberjunction/ng-core-entity-forms@5.34.1
  - @memberjunction/ng-explorer-core@5.34.1
  - @memberjunction/ng-explorer-settings@5.34.1
  - @memberjunction/ng-shared@5.34.1
  - @memberjunction/ng-artifacts@5.34.1
  - @memberjunction/ng-dashboard-viewer@5.34.1
  - @memberjunction/ng-file-storage@5.34.1
  - @memberjunction/communication-types@5.34.1
  - @memberjunction/entity-communications-base@5.34.1
  - @memberjunction/core-entities@5.34.1

## 5.34.0

### Patch Changes

- b03bfb4: Replace hardcoded colors with semantic design tokens across Angular components and shared styles, restoring correct dark-mode behavior and enabling white-labeling. Also maps the System Diagnostics PerfMon chrome (background, borders, text, controls) to MJ semantic tokens so the panel adapts to the active theme; series colors stay categorical.
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
- Updated dependencies [e13dd99]
  - @memberjunction/ng-core-entity-forms@5.34.0
  - @memberjunction/ng-dashboards@5.34.0
  - @memberjunction/ng-explorer-core@5.34.0
  - @memberjunction/ng-artifacts@5.34.0
  - @memberjunction/ai-engine-base@5.34.0
  - @memberjunction/ai-core-plus@5.34.0
  - @memberjunction/ai-vectors-memory@5.34.0
  - @memberjunction/actions-base@5.34.0
  - @memberjunction/ng-auth-services@5.34.0
  - @memberjunction/ng-explorer-settings@5.34.0
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
  - @memberjunction/ng-dashboards@5.33.0
  - @memberjunction/graphql-dataprovider@5.33.0
  - @memberjunction/core@5.33.0
  - @memberjunction/ng-core-entity-forms@5.33.0
  - @memberjunction/ng-explorer-settings@5.33.0
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
  - @memberjunction/ng-dashboards@5.32.0
  - @memberjunction/ng-explorer-core@5.32.0
  - @memberjunction/ng-explorer-settings@5.32.0
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
- cc2dea9: Add service worker app-shell pre-cache for MJExplorer-style apps via new shipped package `@memberjunction/ng-explorer-service-worker`. Targets ~700ms perceived warm-load improvement by serving the JS/CSS/HTML shell from a local cache on subsequent visits.

  **New package** `@memberjunction/ng-explorer-service-worker`:
  - `MJServiceWorkerModule.forRoot({ enabled, pollIntervalMs })` wraps `ServiceWorkerModule.register` with `registerWhenStable:30000`.
  - `UpdateNotificationService` — RxJS wrapper around `SwUpdate.versionUpdates`. Auto-polls every 15 minutes (default) while the tab is visible; suspends polling when hidden; fires an immediate check when the tab regains visibility. Exposes `window.__mjUpdateNotificationService__` debug hook for ops/QA console use.
  - `<mj-update-notification>` standalone toast — slide-up entrance, pulsing brand-tinted icon, two-line title/subtitle, "Reload now" + "Later" + × close. All MJ design tokens, `prefers-reduced-motion` aware.
  - `ngsw-config.json` shipped at the package root — pre-tuned (app-shell prefetch, lazy assets, GraphQL/auth/MSAL exclusions). Cache strategy updates flow to consumers via `npm update`.

  **Wired into `@memberjunction/ng-explorer-app`**: `MJExplorerAppModule.forRoot(environment)` now internally calls `MJServiceWorkerModule.forRoot({ enabled: production && enableServiceWorker })` and renders `<mj-update-notification />` in the shell. Consumers get SW + UI transparently — no `app.module.ts` / `app.component.ts` edits required. Adds `@memberjunction/ng-explorer-service-worker` as a regular dep (transitively pulls in `@angular/service-worker`).

  **Typed kill switch**: `enableServiceWorker?: boolean` added to `MJEnvironmentConfig` in `@memberjunction/ng-bootstrap` with JSDoc. When false (default) or `production: false`, no SW is registered — app behaves exactly as today. Combined gate is `production && enableServiceWorker`.

  **Consumer enablement (two opt-in edits, both required)**:
  1. `angular.json` production config: `"serviceWorker": "../../node_modules/@memberjunction/ng-explorer-service-worker/ngsw-config.json"`
  2. `environment.ts`: `enableServiceWorker: true`

  Either omitted = no SW. No code changes required in MJExplorer or any downstream consumer.

  **Safety**: Single-line kill switch in `environment.ts` plus removal of the `serviceWorker` line from `angular.json` fully disables the system. Worst-case incident response is one config flip + redeploy. Failure mode is bounded — users see the previous working version until reload.

  **Verified end-to-end locally** across multiple successive prod-build cycles: SW registration, asset caching, manifest detection on tab refocus, manual `checkForUpdate()` from console, downloaded-version waiting state, reload-to-activate, wipe-and-reinstall recovery. 11 unit tests cover the service. See plan doc `plans/service-worker-app-shell.md` for design rationale, mermaid diagrams, and honest pros/cons review.

  Remaining work (post-merge, tracked in plan doc): ops runbook, cross-browser smoke (Safari iOS, Firefox, Edge), staged production rollout, copy cleanup of `(test build #N)` markers left in toast text from verification cycles.

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
  - @memberjunction/ng-dashboards@5.31.0
  - @memberjunction/ng-core-entity-forms@5.31.0
  - @memberjunction/ai-engine-base@5.31.0
  - @memberjunction/ai-core-plus@5.31.0
  - @memberjunction/actions-base@5.31.0
  - @memberjunction/ng-auth-services@5.31.0
  - @memberjunction/ng-explorer-core@5.31.0
  - @memberjunction/ng-explorer-settings@5.31.0
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
- @memberjunction/ng-dashboards@5.30.1
- @memberjunction/ng-explorer-core@5.30.1
- @memberjunction/ng-explorer-settings@5.30.1
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
- Updated dependencies [735a618]
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
  - @memberjunction/ng-dashboards@5.30.0
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
  - @memberjunction/ng-explorer-settings@5.30.0
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
- Updated dependencies [90a0fec]
  - @memberjunction/ng-explorer-core@5.29.0
  - @memberjunction/core@5.29.0
  - @memberjunction/ng-dashboards@5.29.0
  - @memberjunction/ng-core-entity-forms@5.29.0
  - @memberjunction/ng-file-storage@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ai-engine-base@5.29.0
  - @memberjunction/ai-core-plus@5.29.0
  - @memberjunction/actions-base@5.29.0
  - @memberjunction/ng-auth-services@5.29.0
  - @memberjunction/ng-explorer-settings@5.29.0
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
  - @memberjunction/ng-dashboards@5.28.0
  - @memberjunction/ng-shared@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ng-explorer-core@5.28.0
  - @memberjunction/ng-core-entity-forms@5.28.0
  - @memberjunction/ng-explorer-settings@5.28.0
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
  - @memberjunction/ng-dashboards@5.27.1
  - @memberjunction/ng-explorer-settings@5.27.1
  - @memberjunction/ng-shared@5.27.1
  - @memberjunction/ng-artifacts@5.27.1
  - @memberjunction/ng-file-storage@5.27.1
  - @memberjunction/communication-types@5.27.1
  - @memberjunction/entity-communications-base@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1

## 5.27.0

### Patch Changes

- Updated dependencies [348decb]
- Updated dependencies [4357090]
- Updated dependencies [6fd2886]
  - @memberjunction/ng-dashboards@5.27.0
  - @memberjunction/ng-explorer-core@5.27.0
  - @memberjunction/ng-core-entity-forms@5.27.0
  - @memberjunction/ng-artifacts@5.27.0
  - @memberjunction/ng-dashboard-viewer@5.27.0
  - @memberjunction/ai-engine-base@5.27.0
  - @memberjunction/ai-core-plus@5.27.0
  - @memberjunction/actions-base@5.27.0
  - @memberjunction/ng-auth-services@5.27.0
  - @memberjunction/ng-explorer-settings@5.27.0
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
  - @memberjunction/ng-dashboards@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ai-engine-base@5.26.0
  - @memberjunction/ai-core-plus@5.26.0
  - @memberjunction/actions-base@5.26.0
  - @memberjunction/ng-explorer-core@5.26.0
  - @memberjunction/ng-explorer-settings@5.26.0
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
  - @memberjunction/ng-dashboards@5.25.0
  - @memberjunction/ng-explorer-core@5.25.0
  - @memberjunction/ng-dashboard-viewer@5.25.0
  - @memberjunction/ng-artifacts@5.25.0
  - @memberjunction/ai-engine-base@5.25.0
  - @memberjunction/ai-core-plus@5.25.0
  - @memberjunction/actions-base@5.25.0
  - @memberjunction/ng-auth-services@5.25.0
  - @memberjunction/ng-explorer-settings@5.25.0
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
  - @memberjunction/ng-dashboards@5.24.0
  - @memberjunction/ng-artifacts@5.24.0
  - @memberjunction/ai-engine-base@5.24.0
  - @memberjunction/ng-core-entity-forms@5.24.0
  - @memberjunction/ng-explorer-settings@5.24.0
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
  - @memberjunction/ng-dashboards@5.23.0
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
  - @memberjunction/ng-explorer-settings@5.23.0
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
- Updated dependencies [e89c3bc]
- Updated dependencies [e5993ff]
- Updated dependencies [f2a6bec]
  - @memberjunction/ai-core-plus@5.22.0
  - @memberjunction/ng-dashboards@5.22.0
  - @memberjunction/core@5.22.0
  - @memberjunction/ng-explorer-core@5.22.0
  - @memberjunction/ng-artifacts@5.22.0
  - @memberjunction/ng-dashboard-viewer@5.22.0
  - @memberjunction/ai-engine-base@5.22.0
  - @memberjunction/ng-core-entity-forms@5.22.0
  - @memberjunction/graphql-dataprovider@5.22.0
  - @memberjunction/actions-base@5.22.0
  - @memberjunction/ng-auth-services@5.22.0
  - @memberjunction/ng-explorer-settings@5.22.0
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
  - @memberjunction/ng-dashboards@5.21.0
  - @memberjunction/ng-explorer-core@5.21.0
  - @memberjunction/ng-explorer-settings@5.21.0
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
  - @memberjunction/ng-dashboards@5.20.0
  - @memberjunction/ng-explorer-core@5.20.0
  - @memberjunction/ng-explorer-settings@5.20.0
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
- @memberjunction/ng-dashboards@5.19.0
- @memberjunction/ng-explorer-core@5.19.0
- @memberjunction/ng-explorer-settings@5.19.0
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

- 931740a: Fix SQLParser to extract parameters from Jinja2 control flow conditions ({% if %}/{% elif %}) and remove hardcoded golden-queries reusability check from QueryEntityServer.
- Updated dependencies [322dac6]
- Updated dependencies [ee4bf94]
  - @memberjunction/ai-core-plus@5.18.0
  - @memberjunction/ng-core-entity-forms@5.18.0
  - @memberjunction/ai-engine-base@5.18.0
  - @memberjunction/ng-dashboards@5.18.0
  - @memberjunction/ng-explorer-core@5.18.0
  - @memberjunction/graphql-dataprovider@5.18.0
  - @memberjunction/ng-artifacts@5.18.0
  - @memberjunction/ng-shared@5.18.0
  - @memberjunction/ng-explorer-settings@5.18.0
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
  - @memberjunction/ng-dashboards@5.17.0
  - @memberjunction/ng-explorer-core@5.17.0
  - @memberjunction/ng-explorer-settings@5.17.0
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
  - @memberjunction/ng-dashboards@5.16.0
  - @memberjunction/ng-explorer-core@5.16.0
  - @memberjunction/ng-explorer-settings@5.16.0
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
  - @memberjunction/ng-dashboards@5.15.0
  - @memberjunction/ai-engine-base@5.15.0
  - @memberjunction/actions-base@5.15.0
  - @memberjunction/ng-auth-services@5.15.0
  - @memberjunction/ng-explorer-core@5.15.0
  - @memberjunction/ng-explorer-settings@5.15.0
  - @memberjunction/ng-shared@5.15.0
  - @memberjunction/ng-artifacts@5.15.0
  - @memberjunction/ng-dashboard-viewer@5.15.0
  - @memberjunction/ng-file-storage@5.15.0
  - @memberjunction/communication-types@5.15.0
  - @memberjunction/entity-communications-base@5.15.0
  - @memberjunction/graphql-dataprovider@5.15.0
  - @memberjunction/core-entities@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [8fe1124]
- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/ng-auth-services@5.14.0
  - @memberjunction/core@5.14.0
  - @memberjunction/graphql-dataprovider@5.14.0
  - @memberjunction/actions-base@5.14.0
  - @memberjunction/ng-explorer-core@5.14.0
  - @memberjunction/ai-engine-base@5.14.0
  - @memberjunction/ai-core-plus@5.14.0
  - @memberjunction/ng-core-entity-forms@5.14.0
  - @memberjunction/ng-dashboards@5.14.0
  - @memberjunction/ng-explorer-settings@5.14.0
  - @memberjunction/ng-shared@5.14.0
  - @memberjunction/ng-artifacts@5.14.0
  - @memberjunction/ng-dashboard-viewer@5.14.0
  - @memberjunction/ng-file-storage@5.14.0
  - @memberjunction/communication-types@5.14.0
  - @memberjunction/entity-communications-base@5.14.0
  - @memberjunction/core-entities@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [1bb9b86]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/ng-core-entity-forms@5.13.0
  - @memberjunction/ng-explorer-core@5.13.0
  - @memberjunction/ng-dashboards@5.13.0
  - @memberjunction/ai-engine-base@5.13.0
  - @memberjunction/ai-core-plus@5.13.0
  - @memberjunction/actions-base@5.13.0
  - @memberjunction/ng-auth-services@5.13.0
  - @memberjunction/ng-explorer-settings@5.13.0
  - @memberjunction/ng-shared@5.13.0
  - @memberjunction/ng-artifacts@5.13.0
  - @memberjunction/ng-dashboard-viewer@5.13.0
  - @memberjunction/ng-file-storage@5.13.0
  - @memberjunction/communication-types@5.13.0
  - @memberjunction/entity-communications-base@5.13.0
  - @memberjunction/graphql-dataprovider@5.13.0
  - @memberjunction/core-entities@5.13.0

## 5.12.0

### Minor Changes

- 1e5d181: migration

### Patch Changes

- a57b8d5: Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
- e87d153: design tokens phase 1
- 7def002: Fix ExternalChangeDetection unquoted string IDs and log spam, add /healthcheck endpoint before auth middleware, return TechnicalDescription in CreateQuery/UpdateQuery mutations, and improve MJCLI config validation errors with env var hints
- Updated dependencies [05f19ff]
- Updated dependencies [a57b8d5]
- Updated dependencies [e87d153]
- Updated dependencies [7def002]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/ng-artifacts@5.12.0
  - @memberjunction/ng-core-entity-forms@5.12.0
  - @memberjunction/ng-dashboards@5.12.0
  - @memberjunction/ng-explorer-core@5.12.0
  - @memberjunction/ng-explorer-settings@5.12.0
  - @memberjunction/ng-dashboard-viewer@5.12.0
  - @memberjunction/ng-file-storage@5.12.0
  - @memberjunction/graphql-dataprovider@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ai-engine-base@5.12.0
  - @memberjunction/ai-core-plus@5.12.0
  - @memberjunction/actions-base@5.12.0
  - @memberjunction/ng-auth-services@5.12.0
  - @memberjunction/ng-shared@5.12.0
  - @memberjunction/communication-types@5.12.0
  - @memberjunction/entity-communications-base@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
- Updated dependencies [fc2bd47]
- Updated dependencies [457afcf]
  - @memberjunction/graphql-dataprovider@5.11.0
  - @memberjunction/core@5.11.0
  - @memberjunction/ng-explorer-core@5.11.0
  - @memberjunction/ng-core-entity-forms@5.11.0
  - @memberjunction/ng-dashboards@5.11.0
  - @memberjunction/ng-artifacts@5.11.0
  - @memberjunction/ng-dashboard-viewer@5.11.0
  - @memberjunction/ng-explorer-settings@5.11.0
  - @memberjunction/ng-shared@5.11.0
  - @memberjunction/ng-file-storage@5.11.0
  - @memberjunction/ai-engine-base@5.11.0
  - @memberjunction/ai-core-plus@5.11.0
  - @memberjunction/actions-base@5.11.0
  - @memberjunction/ng-auth-services@5.11.0
  - @memberjunction/communication-types@5.11.0
  - @memberjunction/entity-communications-base@5.11.0
  - @memberjunction/core-entities@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai-engine-base@5.10.1
- @memberjunction/ai-core-plus@5.10.1
- @memberjunction/actions-base@5.10.1
- @memberjunction/ng-auth-services@5.10.1
- @memberjunction/ng-core-entity-forms@5.10.1
- @memberjunction/ng-dashboards@5.10.1
- @memberjunction/ng-explorer-core@5.10.1
- @memberjunction/ng-explorer-settings@5.10.1
- @memberjunction/ng-shared@5.10.1
- @memberjunction/ng-artifacts@5.10.1
- @memberjunction/ng-dashboard-viewer@5.10.1
- @memberjunction/ng-file-storage@5.10.1
- @memberjunction/communication-types@5.10.1
- @memberjunction/entity-communications-base@5.10.1
- @memberjunction/graphql-dataprovider@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [3df5e4b]
- Updated dependencies [4e298b7]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/ng-core-entity-forms@5.10.0
  - @memberjunction/ng-dashboards@5.10.0
  - @memberjunction/graphql-dataprovider@5.10.0
  - @memberjunction/ai-engine-base@5.10.0
  - @memberjunction/ai-core-plus@5.10.0
  - @memberjunction/actions-base@5.10.0
  - @memberjunction/ng-auth-services@5.10.0
  - @memberjunction/ng-explorer-core@5.10.0
  - @memberjunction/ng-explorer-settings@5.10.0
  - @memberjunction/ng-shared@5.10.0
  - @memberjunction/ng-artifacts@5.10.0
  - @memberjunction/ng-dashboard-viewer@5.10.0
  - @memberjunction/ng-file-storage@5.10.0
  - @memberjunction/communication-types@5.10.0
  - @memberjunction/entity-communications-base@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ai-engine-base@5.9.0
  - @memberjunction/ai-core-plus@5.9.0
  - @memberjunction/actions-base@5.9.0
  - @memberjunction/ng-core-entity-forms@5.9.0
  - @memberjunction/ng-dashboards@5.9.0
  - @memberjunction/ng-explorer-core@5.9.0
  - @memberjunction/ng-explorer-settings@5.9.0
  - @memberjunction/ng-shared@5.9.0
  - @memberjunction/ng-artifacts@5.9.0
  - @memberjunction/ng-dashboard-viewer@5.9.0
  - @memberjunction/ng-file-storage@5.9.0
  - @memberjunction/communication-types@5.9.0
  - @memberjunction/entity-communications-base@5.9.0
  - @memberjunction/graphql-dataprovider@5.9.0
  - @memberjunction/ng-auth-services@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [de9f2c0]
- Updated dependencies [0753249]
  - @memberjunction/graphql-dataprovider@5.8.0
  - @memberjunction/core@5.8.0
  - @memberjunction/ng-core-entity-forms@5.8.0
  - @memberjunction/ng-dashboards@5.8.0
  - @memberjunction/ng-explorer-core@5.8.0
  - @memberjunction/ng-explorer-settings@5.8.0
  - @memberjunction/ng-shared@5.8.0
  - @memberjunction/ng-file-storage@5.8.0
  - @memberjunction/ai-engine-base@5.8.0
  - @memberjunction/ai-core-plus@5.8.0
  - @memberjunction/actions-base@5.8.0
  - @memberjunction/ng-auth-services@5.8.0
  - @memberjunction/ng-artifacts@5.8.0
  - @memberjunction/ng-dashboard-viewer@5.8.0
  - @memberjunction/communication-types@5.8.0
  - @memberjunction/entity-communications-base@5.8.0
  - @memberjunction/core-entities@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ng-artifacts@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/ai-engine-base@5.7.0
  - @memberjunction/ai-core-plus@5.7.0
  - @memberjunction/ng-core-entity-forms@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/ng-explorer-core@5.7.0
  - @memberjunction/ng-dashboard-viewer@5.7.0
  - @memberjunction/actions-base@5.7.0
  - @memberjunction/ng-auth-services@5.7.0
  - @memberjunction/ng-dashboards@5.7.0
  - @memberjunction/ng-explorer-settings@5.7.0
  - @memberjunction/ng-shared@5.7.0
  - @memberjunction/ng-file-storage@5.7.0
  - @memberjunction/communication-types@5.7.0
  - @memberjunction/entity-communications-base@5.7.0
  - @memberjunction/graphql-dataprovider@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [d24a7ff]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ng-explorer-core@5.6.0
  - @memberjunction/ng-dashboards@5.6.0
  - @memberjunction/graphql-dataprovider@5.6.0
  - @memberjunction/ai-engine-base@5.6.0
  - @memberjunction/ai-core-plus@5.6.0
  - @memberjunction/actions-base@5.6.0
  - @memberjunction/ng-auth-services@5.6.0
  - @memberjunction/ng-core-entity-forms@5.6.0
  - @memberjunction/ng-explorer-settings@5.6.0
  - @memberjunction/ng-shared@5.6.0
  - @memberjunction/ng-artifacts@5.6.0
  - @memberjunction/ng-dashboard-viewer@5.6.0
  - @memberjunction/ng-file-storage@5.6.0
  - @memberjunction/communication-types@5.6.0
  - @memberjunction/entity-communications-base@5.6.0
  - @memberjunction/core-entities@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [7ca2459]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
- Updated dependencies [6421543]
  - @memberjunction/core@5.5.0
  - @memberjunction/graphql-dataprovider@5.5.0
  - @memberjunction/ng-core-entity-forms@5.5.0
  - @memberjunction/ng-explorer-core@5.5.0
  - @memberjunction/ng-dashboards@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/ai-engine-base@5.5.0
  - @memberjunction/ai-core-plus@5.5.0
  - @memberjunction/actions-base@5.5.0
  - @memberjunction/ng-auth-services@5.5.0
  - @memberjunction/ng-explorer-settings@5.5.0
  - @memberjunction/ng-shared@5.5.0
  - @memberjunction/ng-artifacts@5.5.0
  - @memberjunction/ng-dashboard-viewer@5.5.0
  - @memberjunction/ng-file-storage@5.5.0
  - @memberjunction/communication-types@5.5.0
  - @memberjunction/entity-communications-base@5.5.0

## 5.4.1

### Patch Changes

- Updated dependencies [8789e86]
  - @memberjunction/ng-shared@5.4.1
  - @memberjunction/ng-core-entity-forms@5.4.1
  - @memberjunction/ng-explorer-core@5.4.1
  - @memberjunction/ng-explorer-settings@5.4.1
  - @memberjunction/ng-dashboards@5.4.1
  - @memberjunction/ng-file-storage@5.4.1
  - @memberjunction/ai-engine-base@5.4.1
  - @memberjunction/ai-core-plus@5.4.1
  - @memberjunction/actions-base@5.4.1
  - @memberjunction/ng-auth-services@5.4.1
  - @memberjunction/ng-artifacts@5.4.1
  - @memberjunction/ng-dashboard-viewer@5.4.1
  - @memberjunction/communication-types@5.4.1
  - @memberjunction/entity-communications-base@5.4.1
  - @memberjunction/graphql-dataprovider@5.4.1
  - @memberjunction/core@5.4.1
  - @memberjunction/core-entities@5.4.1

## 5.4.0

### Patch Changes

- c9a760c: no migration
- Updated dependencies [439129c]
- Updated dependencies [8a11457]
- Updated dependencies [c9a760c]
- Updated dependencies [081d657]
- Updated dependencies [6bcfa1c]
  - @memberjunction/ng-dashboards@5.4.0
  - @memberjunction/graphql-dataprovider@5.4.0
  - @memberjunction/ng-core-entity-forms@5.4.0
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ng-explorer-settings@5.4.0
  - @memberjunction/ng-explorer-core@5.4.0
  - @memberjunction/ng-shared@5.4.0
  - @memberjunction/ng-file-storage@5.4.0
  - @memberjunction/ai-engine-base@5.4.0
  - @memberjunction/ai-core-plus@5.4.0
  - @memberjunction/actions-base@5.4.0
  - @memberjunction/ng-artifacts@5.4.0
  - @memberjunction/ng-dashboard-viewer@5.4.0
  - @memberjunction/communication-types@5.4.0
  - @memberjunction/entity-communications-base@5.4.0
  - @memberjunction/ng-auth-services@5.4.0
  - @memberjunction/core@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai-engine-base@5.3.1
- @memberjunction/ai-core-plus@5.3.1
- @memberjunction/actions-base@5.3.1
- @memberjunction/ng-auth-services@5.3.1
- @memberjunction/ng-core-entity-forms@5.3.1
- @memberjunction/ng-dashboards@5.3.1
- @memberjunction/ng-explorer-core@5.3.1
- @memberjunction/ng-explorer-settings@5.3.1
- @memberjunction/ng-shared@5.3.1
- @memberjunction/ng-artifacts@5.3.1
- @memberjunction/ng-dashboard-viewer@5.3.1
- @memberjunction/ng-file-storage@5.3.1
- @memberjunction/communication-types@5.3.1
- @memberjunction/entity-communications-base@5.3.1
- @memberjunction/graphql-dataprovider@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [a6aea29]
- Updated dependencies [1692c53]
- Updated dependencies [7af1846]
  - @memberjunction/graphql-dataprovider@5.3.0
  - @memberjunction/ng-dashboards@5.3.0
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ng-artifacts@5.3.0
  - @memberjunction/ng-explorer-core@5.3.0
  - @memberjunction/ng-core-entity-forms@5.3.0
  - @memberjunction/ng-explorer-settings@5.3.0
  - @memberjunction/ng-shared@5.3.0
  - @memberjunction/ng-file-storage@5.3.0
  - @memberjunction/ng-dashboard-viewer@5.3.0
  - @memberjunction/ai-engine-base@5.3.0
  - @memberjunction/ai-core-plus@5.3.0
  - @memberjunction/actions-base@5.3.0
  - @memberjunction/communication-types@5.3.0
  - @memberjunction/entity-communications-base@5.3.0
  - @memberjunction/ng-auth-services@5.3.0
  - @memberjunction/core@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
- Updated dependencies [4618227]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/graphql-dataprovider@5.2.0
  - @memberjunction/ai-engine-base@5.2.0
  - @memberjunction/ai-core-plus@5.2.0
  - @memberjunction/actions-base@5.2.0
  - @memberjunction/ng-core-entity-forms@5.2.0
  - @memberjunction/ng-dashboards@5.2.0
  - @memberjunction/ng-explorer-core@5.2.0
  - @memberjunction/ng-explorer-settings@5.2.0
  - @memberjunction/ng-shared@5.2.0
  - @memberjunction/ng-dashboard-viewer@5.2.0
  - @memberjunction/communication-types@5.2.0
  - @memberjunction/entity-communications-base@5.2.0
  - @memberjunction/ng-artifacts@5.2.0
  - @memberjunction/ng-file-storage@5.2.0
  - @memberjunction/ng-auth-services@5.2.0

## 5.1.0

### Patch Changes

- f426d43: Fix CodeGen to apply excludeSchemas filter consistently across all generators (TypeScript, Angular, GraphQL), not just SQL generation. Also adds cleanup for orphaned Angular entity form directories when entities are renamed or deleted.
  - @memberjunction/ai-engine-base@5.1.0
  - @memberjunction/ai-core-plus@5.1.0
  - @memberjunction/actions-base@5.1.0
  - @memberjunction/ng-auth-services@5.1.0
  - @memberjunction/ng-core-entity-forms@5.1.0
  - @memberjunction/ng-dashboards@5.1.0
  - @memberjunction/ng-explorer-core@5.1.0
  - @memberjunction/ng-explorer-settings@5.1.0
  - @memberjunction/ng-shared@5.1.0
  - @memberjunction/ng-artifacts@5.1.0
  - @memberjunction/ng-dashboard-viewer@5.1.0
  - @memberjunction/ng-file-storage@5.1.0
  - @memberjunction/communication-types@5.1.0
  - @memberjunction/entity-communications-base@5.1.0
  - @memberjunction/graphql-dataprovider@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- 786a390: Remove explicit 3.0 references in several areas
- Updated dependencies [3cca644]
- Updated dependencies [786a390]
- Updated dependencies [737b56b]
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/ng-dashboards@5.0.0
  - @memberjunction/communication-types@5.0.0
  - @memberjunction/graphql-dataprovider@5.0.0
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ai-engine-base@5.0.0
  - @memberjunction/ai-core-plus@5.0.0
  - @memberjunction/actions-base@5.0.0
  - @memberjunction/ng-auth-services@5.0.0
  - @memberjunction/ng-core-entity-forms@5.0.0
  - @memberjunction/ng-explorer-core@5.0.0
  - @memberjunction/ng-explorer-settings@5.0.0
  - @memberjunction/ng-shared@5.0.0
  - @memberjunction/ng-artifacts@5.0.0
  - @memberjunction/ng-dashboard-viewer@5.0.0
  - @memberjunction/ng-file-storage@5.0.0
  - @memberjunction/entity-communications-base@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-engine-base@4.4.0
  - @memberjunction/ai-core-plus@4.4.0
  - @memberjunction/actions-base@4.4.0
  - @memberjunction/ng-auth-services@4.4.0
  - @memberjunction/ng-core-entity-forms@4.4.0
  - @memberjunction/ng-dashboards@4.4.0
  - @memberjunction/ng-explorer-core@4.4.0
  - @memberjunction/ng-explorer-settings@4.4.0
  - @memberjunction/ng-shared@4.4.0
  - @memberjunction/ng-artifacts@4.4.0
  - @memberjunction/ng-dashboard-viewer@4.4.0
  - @memberjunction/ng-file-storage@4.4.0
  - @memberjunction/communication-types@4.4.0
  - @memberjunction/entity-communications-base@4.4.0
  - @memberjunction/graphql-dataprovider@4.4.0
  - @memberjunction/core-entities@4.4.0

## 4.3.1

### Patch Changes

- f1b4a98: Restore singleton packages as regular dependencies in Angular Bootstrap and Explorer packages, and fix false positive error detection in CLI migrate command.
- Updated dependencies [f1b4a98]
  - @memberjunction/ng-auth-services@4.3.1
  - @memberjunction/ng-explorer-core@4.3.1
  - @memberjunction/ng-core-entity-forms@4.3.1
  - @memberjunction/ng-explorer-settings@4.3.1
  - @memberjunction/ng-dashboards@4.3.1
  - @memberjunction/ai-engine-base@4.3.1
  - @memberjunction/ai-core-plus@4.3.1
  - @memberjunction/actions-base@4.3.1
  - @memberjunction/ng-shared@4.3.1
  - @memberjunction/ng-artifacts@4.3.1
  - @memberjunction/ng-dashboard-viewer@4.3.1
  - @memberjunction/ng-file-storage@4.3.1
  - @memberjunction/communication-types@4.3.1
  - @memberjunction/entity-communications-base@4.3.1
  - @memberjunction/graphql-dataprovider@4.3.1
  - @memberjunction/core@4.3.1
  - @memberjunction/core-entities@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/graphql-dataprovider@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ng-core-entity-forms@4.3.0
  - @memberjunction/ng-dashboards@4.3.0
  - @memberjunction/ng-explorer-core@4.3.0
  - @memberjunction/ng-explorer-settings@4.3.0
  - @memberjunction/ng-shared@4.3.0
  - @memberjunction/ng-file-storage@4.3.0
  - @memberjunction/ai-engine-base@4.3.0
  - @memberjunction/ai-core-plus@4.3.0
  - @memberjunction/actions-base@4.3.0
  - @memberjunction/ng-artifacts@4.3.0
  - @memberjunction/ng-dashboard-viewer@4.3.0
  - @memberjunction/communication-types@4.3.0
  - @memberjunction/entity-communications-base@4.3.0

## 4.2.0

### Patch Changes

- Updated dependencies [d2938db]
  - @memberjunction/ng-auth-services@4.2.0
  - @memberjunction/ng-explorer-core@4.2.0
  - @memberjunction/ai-engine-base@4.2.0
  - @memberjunction/ai-core-plus@4.2.0
  - @memberjunction/actions-base@4.2.0
  - @memberjunction/ng-core-entity-forms@4.2.0
  - @memberjunction/ng-dashboards@4.2.0
  - @memberjunction/ng-explorer-settings@4.2.0
  - @memberjunction/ng-shared@4.2.0
  - @memberjunction/ng-artifacts@4.2.0
  - @memberjunction/ng-dashboard-viewer@4.2.0
  - @memberjunction/ng-file-storage@4.2.0
  - @memberjunction/communication-types@4.2.0
  - @memberjunction/entity-communications-base@4.2.0
  - @memberjunction/graphql-dataprovider@4.2.0
  - @memberjunction/core@4.2.0
  - @memberjunction/core-entities@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/ng-core-entity-forms@4.1.0
  - @memberjunction/ng-dashboards@4.1.0
  - @memberjunction/ng-explorer-core@4.1.0
  - @memberjunction/ng-explorer-settings@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ai-engine-base@4.1.0
  - @memberjunction/ai-core-plus@4.1.0
  - @memberjunction/actions-base@4.1.0
  - @memberjunction/ng-auth-services@4.1.0
  - @memberjunction/ng-shared@4.1.0
  - @memberjunction/ng-artifacts@4.1.0
  - @memberjunction/ng-dashboard-viewer@4.1.0
  - @memberjunction/ng-file-storage@4.1.0
  - @memberjunction/communication-types@4.1.0
  - @memberjunction/entity-communications-base@4.1.0
  - @memberjunction/graphql-dataprovider@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 7aa23e7: 4.0
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [2f86270]
- Updated dependencies [4723079]
- Updated dependencies [65b4274]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [0a0cda1]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ng-dashboards@4.0.0
  - @memberjunction/ng-core-entity-forms@4.0.0
  - @memberjunction/graphql-dataprovider@4.0.0
  - @memberjunction/ai-engine-base@4.0.0
  - @memberjunction/ai-core-plus@4.0.0
  - @memberjunction/actions-base@4.0.0
  - @memberjunction/ng-auth-services@4.0.0
  - @memberjunction/ng-explorer-core@4.0.0
  - @memberjunction/ng-explorer-settings@4.0.0
  - @memberjunction/ng-shared@4.0.0
  - @memberjunction/ng-artifacts@4.0.0
  - @memberjunction/ng-dashboard-viewer@4.0.0
  - @memberjunction/ng-file-storage@4.0.0
  - @memberjunction/communication-types@4.0.0
  - @memberjunction/entity-communications-base@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0

## 3.4.0

### Patch Changes

- 3a71e4e: Fix large text field corruptions, cross-platform improvements, more robust environment variable parsing for boolean values
- Updated dependencies [a3961d5]
  - @memberjunction/core@3.4.0
  - @memberjunction/ng-shared@3.4.0
  - @memberjunction/graphql-dataprovider@3.4.0
  - @memberjunction/ng-auth-services@3.4.0

## 3.3.0

### Patch Changes

- @memberjunction/ng-shared@3.3.0
- @memberjunction/graphql-dataprovider@3.3.0
- @memberjunction/ng-auth-services@3.3.0
- @memberjunction/core@3.3.0

## 3.2.0

### Patch Changes

- 470bc9d: Fix npm deployment issue with Angular/Bootstrap package
- Updated dependencies [6806a6c]
  - @memberjunction/graphql-dataprovider@3.2.0
  - @memberjunction/ng-shared@3.2.0
  - @memberjunction/ng-auth-services@3.2.0
  - @memberjunction/core@3.2.0

## 3.1.1

### Patch Changes

- Updated dependencies [8c0b624]
  - @memberjunction/graphql-dataprovider@3.1.1
  - @memberjunction/ng-shared@3.1.1
  - @memberjunction/ng-auth-services@3.1.1
  - @memberjunction/core@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ng-auth-services@3.0.0
- @memberjunction/ng-shared@3.0.0
- @memberjunction/graphql-dataprovider@3.0.0
- @memberjunction/core@3.0.0

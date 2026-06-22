# @memberjunction/ng-conversations

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

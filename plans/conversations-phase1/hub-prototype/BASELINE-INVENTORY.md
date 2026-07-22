# Baseline Inventory — Shipped Conversations Stack (code-verified 2026-07-14)

> The FULL capability inventories from the two parity sweeps, persisted so the
> baseline doesn't live in a chat transcript. PARITY-AUDIT.md is the analysis;
> this is the raw record. DESIGN-NOTES.md carries the tracked parity checklist.
> Live-walk confirmation on cdp-dev 2026-07-15 (flat avatar-row messages, form
> pills, live React component artifacts w/ 7-tab viewer, MJE top-nav shell).

## A. Conversations widget (ng-conversations)

### Post-atlas deltas (merged after 2026-07-07; on this branch as of the 2026-07-22 next merge)
- Agent final-response streaming rendered live into the chat bubble (kind:'final-response') — d5e5996b68 + e383ee0d3f
- "Apply to my Form" spec resolution + Pending-override; # typeahead: entities before queries, 50 suggestions — ae3ed11068

### Shell / deep links / overlay
- Workspace tabs Chats/Collections/Tasks (icons-only <768px); tasks dropdown + search + refresh-agent-cache in top nav
- Deep links: conversationId, artifactId, versionNumber, realtimeSessionId; collectionId set; taskId; re-applied on tab re-focus; cross-resource nav carries pending message+attachments
- Browser title tracks conversation name; sidebar drag-resize 200–500px + collapse/pin persisted (Conversations.SidebarState); mobile slide-over sidebar; click-outside collapse
- Floating chat overlay: bubble drag (clamped), hide-to-edge sliver, unread badge, collapsed/expanded/maximized, 3-edge resize 320–900w persisted, workspace handoff via bridge
- 6 host slots (header/agentPresence/emptyState/messageRenderer/messageExtra/demonstrationSurface) + cancelable before-events
- Ctrl/Cmd+K opens search (search-shortcut.directive)

### Sidebar & organization
- Live name/description filter box; header menu: Refresh, Select Conversations, Group-by-folder/flat, Hide Sidebar
- Pinned section (only when pins exist); row menu: Pin/Unpin, Move-to-folder submenu (+"New folder…"), Rename, Delete(confirm)
- Rename = dialog with Name (required) + Description; AI auto-naming (30s guard, background)
- Folders: recursive tree, chevrons, icon+color tint, descendant counts; hover New Subfolder / Edit / Delete ("Nothing is deleted" — contents move out); collapse + group-by persisted (mj.conversations.folderPrefs.v1)
- Drag-drop: conversation→folder/→Ungrouped; folder→folder reparent (cycle-safe) / →header for top-level
- Row chrome: active-task spinner, notification badge (count/dot/pulse/NEW, priority colors), shared-with-me icon + tooltip
- Multi-select: checkboxes, Select/Deselect All, bulk Delete(n) w/ partial-failure report
- Folder modal: Name, Description, Color (20 swatches + custom), Icon (20 grid), live preview
- Routines bottom entry: count badge, "+" → editor, header → command center; history rows open run records; ShowRoutines + Read perm gated
- Search panel: scopes all/conversations/messages/artifacts/collections/tasks, date range, recent searches, highlighting, keyboard nav

### Chat header & panes
- Header: sidebar toggle, title, "Shared by X", project tag, test-run indicator, pin-count chip → panel, artifact-count chip → modal, members chip → modal, mode picker, agent picker, Export, Share (perm-gated)
- Artifact split-pane: drag-resize (mouse+touch, persisted), maximize, close
- Artifacts modal: card grid w/ version counts, per-version open, show/hide system artifacts
- Scroll-to-bottom button; read-only banner; "Uploading N attachments" overlay; per-conversation cached composer instances (drafts survive switches)
- Sticky date header + "Jump to…" dropdown (stub)

### Messages
- Markdown w/ collapsible headings; mention tokens as colored badges; submitted-form pills; "(edited)" badge; live elapsed/generation-time pill
- Gear → Agent Run inspector: run links, Steps, Tokens, Cost, Status, lazy Associated Tasks
- Actions: pin/unpin (optimistic), inline edit (Enter/Shift+Enter/Esc), delete-last-and-below, retry on errors, 1–10 rating dialog (pips, color bands, 2000-char comment, consent checkbox, grants reviewer-role access), test-feedback flask, Shift+click diagnostics
- Actionable command chips (last message, owner only; open:url / open:resource routing)
- Response forms (mj-dynamic-form) incl. plan approval (edit-before-approve; approve auto-disables sticky pref; reject → re-plan w/ reason)
- Attachments: image grid → fullscreen viewer (zoom 0.1–5x, pan, fit, download; no prev/next); non-image strip w/ badges
- Per-message artifact cards → viewer
- Pinned panel (200-char previews, jump, unpin); thread panel (slide-in, Ctrl+Enter reply — entry point currently orphaned)
- STUBS: reactions (display:none), jump-to-date, message save/share/export handlers

### Agents / tasks
- Active-agent header chip (status avatars, confidence %, +N); floating Active Agents panel w/ cancel-run
- Tasks dropdown (grouped Current/Other, live elapsed, navigate); floating panels minimize to bolt badge
- Tasks full view: counts → detail w/ sub-tasks, Gantt toggle, dependencies, run links

### Artifacts & collections
- Viewer: version dropdown, Save-to-Collection, Share, Analyze (state snapshot → AI), plugin Feedback, maximize; tabs Display/Code/Func-Tech-Data Requirements/JSON(+copy)/Details/Links (origin conversation ↔ collections); copy/print; usage tracking (Viewed/Opened/Shared/Saved/Exported)
- Live React rendering for Component artifacts; form-role artifacts: record picker + "Apply to my Form"
- Collections (Finder-style): breadcrumbs as drop targets, grid/list + sort persisted, search, 50/pg pagination, select mode (Shift/Cmd ranges, Cmd+A/Esc/Delete), staging shelf, drag-move, share/edit/delete, right-click menus, "Open source conversation" — permission-gated throughout
- Collection form (parent chip, permission inherit); artifact-create modal (rollback on failure); save-to-collection picker (multi-select, already-saved locks, inline create)

### Sharing & export
- Conversation share: by email, View/Edit/Owner, remove, public link toggle (COSMETIC — raw ID, no token backend)
- Artifact share (Read/Share/Edit); Collection share (Read/Share/Edit/Delete, cascades); grant-only-what-you-have
- Members modal (largely stubbed, in-memory)
- Export: Markdown/JSON/HTML/Text; include-messages/metadata, pretty-print, embedded CSS

### Voice / realtime
- Phone = instant call; caret → picker (search, co-agent, voice model+voice for advanced auth, record consent persisted)
- Live overlay: end/mute/minimize→pill, captions toggle, type-to-talk dock, density Simple/Standard/Pro/Auto, dev links, audio-reactive orb (no hold, no duration timer)
- Delegation cards (progress, expand, cancel, artifact chips); activity rail w/ artifact split-pane
- Channels: Whiteboard (drawable both ways) / Media (playback+zoom+download) / Remote Browser (human takeover: typing/click/scroll/clipboard, tab-audio mute) + per-channel onboarding + focus mode
- Transcript → one timeline card; session review (historical thread, saved whiteboard, recording playback w/ click-to-seek, resume live)

### Atlas corrections
- Rating is 1–10 pip dialog (not thumbs). Atlas omitted: bulk multi-select, group-by toggle, folder drag-drop, staging shelf/pagination/context menus, open-source-conversation, Analyze, rating consent/role grant, per-user mode presets, tasks grouping, remote-browser takeover, evidence playback
- Confirmed absent: quote/fork, context gauge, memory UI, temporary/incognito, real public link, full members modal

## B. Composer + runtime (ng-composer, ConversationsRuntime)

### Text input & keyboard
- contentEditable editor w/ mention chips; Enter sends / Shift+Enter newline; Enter consumed by open dropdown; Backspace deletes chip atomically
- Dropdown: ArrowUp/Down, Enter OR Tab select, Escape close; flips above/below by space
- Paste: clipboard images → attachments, HTML stripped to plain text; drag-drop w/ highlight, silent skip of rejected types
- Click empty container space focuses + cursor-to-end; send disabled unless text OR attachments
- Serialization: chips → JSON-in-text (`@{"type","id","name","configId"}`)

### Mention triggers (pluggable providers, @RegisterClass discovery, [TriggerProviders]/[ExcludedTriggerKeys])
- '@' agents (permission-filtered, LogoURL); '#' entities + user-runnable queries; '/' skills (AISkillPermissionHelper run-permission, fails closed; AcceptsSkills enforced server-side w/ warning toast)
- Skill chips carry IconClass + Color; nearest-trigger-wins; stale-async race guard
- Agent chips w/ 2+ config presets: in-chip preset dropdown (Fast/Standard/High), survives serialization as configId

### Attachments
- Defaults: 10 files, 20MB, image/* (all @Inputs); per-file validation errors; dataURL + thumbnail + dimensions; remove + preview
- Attach-from-artifact (fileID/mime/size/artifactVersionId); source='artifact' attachments reopen in viewer
- initialMessage/initialAttachments auto-send inputs for embedders

### Plan mode / voice / presets
- Plan toggle (fa-route, aria-pressed) always visible when enabled; server enforces SupportsPlanMode
- Pref sticky PER CONVERSATION via UserInfoEngine (cross-device), capped map + pendingNew claim for new conversations; threads into all 7 send paths
- Mic instant-start (disabled w/o resolvable agent or during session); caret → voice picker; co-agent persisted (mj.realtimeVoice.coAgent.v1)
- Header mode picker (AI Agent Configurations) on non-mention routes; mention-embedded preset wins; per-user-per-agent persistence (mj.agentMode.<id>)
- /skill chips → RequestedSkillIDs; unaccepted-skill warning toasts; failed sub-agent turn auto-retries once ("Retrying…")

### Runtime
- Default-agent chain: explicit → app AgentSettings → app-scoped → global setting → Sage const; descriptive error
- processMessage: permission-filtered agent routing, MaxHistoryMessages 20, appContext injection, planMode + requestedSkillIDs threading, 7-step progress
- isProcessing$ ref-counted; streaming via single PubSub sub, per-message callbacks, 5-min late-mount replay, 5s auto-reconnect
- MentionParser: JSON + legacy formats; first agent mention = routing target
- ClientToolRegistry → agent prompt; host-cancelable
- Overlay⇄workspace bridge: active-conversation sync, deep links, RequestExpandOverlay
- Sessions observer stream; INotificationAdapter/IActiveTaskTracker adapters

### Plan-approval UI (inline in last agent message, owner only)
- Server-built mj-dynamic-form: editable markdown plan (preview/edit toggle) + optional reason + approve/reject
- Approve → per-conversation pref OFF; Reject → stays ON, reason steers re-plan; disabled while processing; read-only pill after submit
- Out-of-conversation panel adds reassign/expired states (agent-requests pkg)

### Skills observability
- Run-step "Skills" tab: per-invocation name, activation type, provenance gates, agent reason

### Routines entry
- Sidebar section: count badge, "+" → editor, header → command center; RunNow/pause-resume w/ undo/delete/history→records; gated ShowRoutines + Read perm

## C. 2026-07-22 sweep addendum — post-07-14 deltas + omissions

> Full re-sweep of ng-conversations / ng-composer / ConversationsRuntime on 2026-07-22 (branch
> current with `next`, incl. the 07-20/07-21 host-gating commits). ng-composer and
> ConversationsRuntime have ZERO source drift since 07-14; all drift is in ng-conversations.
> Everything below is absent from (or understated by) sections A/B and must be carried by the
> redesign like any other baseline item.

### C1. Integration contracts (invisible, must-keep — PARITY §1.12 class)
- **Host-level chat-area feature-gate contract** (07-20/07-21, `conversation-chat-area.component.ts`):
  ~13 new `@Input` toggles, all default true, threaded chat-area → message-list → message-item
  (`applyMessageItemFeatureFlags`, applied on create AND in-place-update): `allowPlanMode`,
  `allowRealtime`, `showEmptyFill`, `showLoadingState`, `showAgentRunDetails`, `showReactions`,
  `showMessageRating`, `allowPinning` (pin button + header chip + panel together),
  `allowMessageEdit`, `allowMessageDelete`, `showSuggestedPrompts`, `showDateNavigation` — plus
  pre-existing untracked gates: `allowMentions`, `allowAttachments`, `showExportButton`,
  `showShareButton`, `showArtifactIndicator`, `showAgentPicker`, `showAgentModePicker`,
  `suppressNewConversationEmptyState`. Documented in the package README; white-label embedders
  now depend on these instead of CSS. The new shell must re-express every gate.
- **Server-persisted composer drafts** (`services/composer-draft-store.ts`, 07-06): ONE
  `MJ: User Settings` row `mj.chat.drafts.v1`, LRU 20 drafts / 16k chars, debounced + flush on
  blur/switch, delete-on-send, `'new'` bucket pre-creation; serialized `@{...}` mentions
  rehydrate to real chips (`ParseSerializedMentions`). Drafts survive refresh AND device switch —
  strictly stronger than §B's "cached composer instances".
- **Omnibar ⇄ composer pre-address seam** (#3042, 07-06/07-14): `OmnibarProvider` registry
  *extends* `ComposerTriggerProvider` under its own ClassFactory base (palette semantics never
  leak into composer discovery); `kind:'agent'` nav stages a REAL resolved agent pill via
  `InsertAgentMention()` → mention-editor's public `InsertResolvedMention`/`InsertMention`/
  `FocusCaretAtEnd`/`HasFocus` APIs (retry-aware). The redesign's ⌘K story must preserve
  pill pre-addressing and reconcile the legacy search panel with the shipped omnibar.
- **`ClientContextChannel` — headless 4th realtime channel** (06-27, missed by the 07-14 sweep):
  streams every app-context change to the co-agent (`RealtimeSessionService.AppContext$` fed by
  Explorer navigation) and exposes the stable `ContextTool` proxy through which the model invokes
  ANY surface client tool (navigation, OpenEntity, SearchEntities, …). A redesigned voice overlay
  that drops this wiring silently lobotomizes the co-agent.
- **Realtime overlay host-control contract + earned-controls disclosure**
  (`realtime-ui-config.ts`, `realtime-disclosure.ts`, realtime README): ~16 inputs (Chrome
  orb/console/auto + graduation rule, `AllowTextReveal`, `Show*`, `UiConfig`, `ReviewData`),
  outputs (Ended/Minimized/TextRevealed/ChromeChanged), pure `resolveRealtimeUi()`; disclosure
  ratchet: controls are EARNED by demonstrated depth, persisted per-user (`REALTIME_UX_PREF_KEY`),
  never auto-hide once earned; one auto-reveal = a channel's first agent activity; usage-gated
  channel tabs; surface-panel width pref `mj.realtimeVoice.surfacePanel.v1`. Keep the model or
  consciously re-lock it.
- **Pre-conversation header mode** (`HasPreConversationHeader` + `suppressNewConversationEmptyState`,
  05-25): embedders (Form Builder cockpit) show header + mode picker before any conversation row
  exists; first send creates it.
- **`--mj-chat-*` token injection**: `conversations-runtime-bootstrap.service.ts` injects the chat
  token stylesheet at `:root` at runtime (deliberate encapsulation bypass). Carry into the new
  shell's theming story.

### C2. Behavior semantics missed by §A/§B
- **Co-agent ⇄ target pairing** (`services/realtime-pairing.ts`): `MJ: AI Agent Co Agents` rows —
  zero rows = universal co-agent; with rows, fronts only listed targets; `IsDefault` preselects,
  `Sequence` orders. The voice picker is NOT free-choice.
- **Client-side task-graph orchestration cluster** (`message-input.component.ts`, ~1,200 lines):
  `handleTaskGraphExecution` (tempId dedupe, single-task fast path vs server orchestration,
  delegation status into the CM bubble), `handleSubAgentInvocation`, `handleSilentObservation`
  (Sage silent → auto-continue last specialist WITH its previous output artifact parsed back in
  as payload continuity). Pure behavior — must survive any composer re-plumb untouched.
- **Routing precedence 6th step** (`routeMessage`): between embedder-default and Sage-fallback —
  Sage-mentioned-earlier-with-config-preset re-routes to Sage preserving that preset
  (`findConfigurationPresetFromHistory`). PARITY §3's 5-step list is incomplete.
- **Header project tag = second folder manager**: clicking it opens the Assign Project modal
  (dropdown w/ per-project counts + Create/Edit/Delete via `project-form-modal`). §A lists the
  tag as a passive chip. Intersects GAPLIST 1.4 (nesting) and 1.6 (header consolidation).
- **Message-row placement facts** (for the GAPLIST 1.1 placement account): pin/delete/rating live
  in a LAST-message footer; earlier messages carry them inside the gear panel; gear icon shows a
  rating-count badge; non-owners get a read-only "Rated N/10" pill.
- **Maximized artifact pane resets on conversation switch** (07-21, regression-tested).
- **Share dialog attribution**: chat sharing runs through the GENERIC `mj-resource-share-dialog`
  + `MJResourcePermissionShareAdapter` (since 2026-04); redesigning it touches dashboards too.

### C3. Corrections to §A/§B claims
- **"@ people" is self-only**: `mention-autocomplete.service.ts` seeds `usersCache = [currentUser]`.
  The mechanism ships; the roster doesn't. Treat people-mentions as a seam, not a shipped feature.
- **Inline message edit** was orphaned until 07-14 (`25017279ad` wired the hover pencil); §A's
  claim is true only from that date.
- **Final-response streaming + # typeahead ranking** are ON this branch now (top-of-file caveat
  updated) — the "prototype branch lacks them" note is retired.

### C4. Residual perimeter (2026-07-22 second sweep — everything OUTSIDE the three core packages)

> Template-exhaustive sweep of the Explorer host shell, overlay wiring, ng-artifacts,
> ng-agent-requests, ng-user-routines, the notifications page, and every other importer of
> ng-conversations / conversations-runtime. These are host-contract facts the redesign must
> reproduce; most are invisible in the widget itself.

- **String-coupling contract (highest-risk invisible item)**: cross-surface routing keys on
  hardcoded names — app `'Chat'`, nav items `'Conversations'`/`'Collections'`/`'Tasks'`, app
  `'AI'` + `'Agent Requests'`, and the `@RegisterClass` keys `ChatConversationsResource`/
  `ChatCollectionsResource`/`ChatTasksResource`. Consumers: notifications click-routing, overlay
  "open full workspace", artifact Links-tab cross-nav, the agent `NavigateToApp` tool, the
  workspace-visibility check. Rename any of these in the redesign and notifications/handoff
  break silently.
- **Overlay↔route boundary**: `isChatRoute = url.includes('/chat')||url.includes('/conversations')`
  drives overlay hide, SYMMETRIC conversation handoff on ANY navigation across the boundary,
  and toast suppression via the host-installed `MJNotificationService.ShouldSuppressToast`
  predicate. Overlay render gated by `IsChatOverlayReady` + Instance Config
  `Shell.ChatOverlay.Enabled` (fail-open). Host feeds `[EmptyStateGreeting]`, `[AppContext]`,
  `[TopBoundaryPx]` (shell header + live connectivity-banner height). A new shell must
  re-derive the boundary and re-install the suppression predicate or live calls die on
  navigation and duplicate toasts return. (`explorer-app.component.ts`)
- **Notification deep-link params partially dropped TODAY**: notifications send
  `messageId`/`taskId`/`requestId` but `ChatConversationsResource.applyConfigurationParams`
  reads only `conversationId`/`artifactId`/`versionNumber`/`realtimeSessionId`/`agent`+`agentReq`
  — jump-to-message from a notification silently no-ops on the Explorer path. Redesign: fix or
  document as conscious limitation; never regress the params that DO work.
- **Notifications page is far bigger than GAPLIST 2.8's line**: read+type+text filters (types
  from UserInfoEngine, priority-sorted), day buckets, HTML-email parsing via DOMParser +
  chrome-strip, markdown detection, expand-marks-read side effect, mark-all via
  TransactionGroup, click routing incl. `meet-room` and generic resources.
  (`user-notifications.component.ts`)
- **Artifact viewer real host contract** (Studio Split re-hosts this): inputs incl. `showTabs`,
  `refreshTrigger` Subject, `viewContext 'conversation'|'collection'` (collection = version
  dropdown DISABLED/pinned), `contextCollectionId`, `canShare`/`canEdit`, `isMaximized`;
  outputs incl. `saveToCollectionRequested{excludedCollectionIds}`, `navigationRequest`
  (plugin-initiated app-level nav), `analyzeRequested` (live DataSnapshot), `applyFormRequested`,
  `openEntityRecord`. Plugin roster beyond GAPLIST 2.1: PDF/XLSX/DOCX (shared toolbar w/
  page-nav+zoom), audio/video/image/SVG/HTML/code/markdown/JSON, React component (+feedback
  panel), data-requirements, ML Experiment Results, and the **Data artifact viewer's untracked
  query-sync machinery**: live SQL re-exec via `RunQuery({SQL})`, multi-table normalization,
  entity-link click-through, sync state machine (no-query-latest/synced/outdated-latest/
  query-ahead/query-behind badges) + **Save Query slide-in** (ad-hoc SQL → `MJ: Queries` record
  w/ category tree + inline category creation). JSON tab suppressed for File-ContentCategory
  (DB-metadata-driven). `RecentAccessService.logAccess` feeds Home recents.
- **Collections wrapper host shell**: pct-based artifact-pane resize 20–80% (NOT persisted,
  unlike chat's), maximize-to-overlay, per-artifact permission load, URL round-trip w/
  cold-deep-link race guard, "Open source conversation" delivered as BOTH configuration AND
  queryParams (cached-tab correctness pattern), Analyze → new conversation w/ snapshot artifact.
- **Conversations wrapper host facts**: new-user default = collapsed sidebar + new-conversation
  screen; `realtimeSessionId` one-shot + force-cleared every URL update (stuck-overlay fix);
  `OpenRealtimeSessionReview` retry-loop = canonical programmatic session entry; omnibar
  `?agent`+`?agentReq` nonce consume path (once-only, stale-echo detection, deferred re-clear —
  prevents draft wipe); `open:resource` Report/Dashboard fallback = most-recent artifact across
  ALL messages; `isReady` pre-render engine gate (AIEngine + conversations + mentions + active
  tasks restored); wrapper hosts `<mj-toast>` (new shell must host it or agent toasts vanish);
  delete-open-conversation fallback selection.
- **Agent-requests surface (real baseline for GAPLIST 1.12)**: `AgentRequestPanelComponent`
  slide-in — actionable (Approve/Reject or schema-driven Submit Response + Reassign w/ debounced
  user search) / expired / already-handled read-only states; drag-resize persisted
  `Explorer.AgentRequestPanelWidth`; mounted ONLY via the AI app's Agent Requests dashboard
  (filterable list, prefs `AI.AgentRequests.UserPreferences`, auto-open from `requestId` param).
  The notification → requestId → auto-open chain must keep working.
- **Routines conversations-facing contract**: the two load-bearing event bridges —
  `ConversationOpened{ConversationID}` → host selects the routine's hidden conversation in chat;
  `HistoryRecordOpened{EntityName,RecordID}` → standard record nav. Slide-in exposes cancelable
  Before/After events the host doesn't yet consume (available seam).
- **Embedder matrix** (concrete regression surface for any chat-area input rename):
  Form Builder cockpit (mentions OFF, mode-picker ON, overlay mode, app-scope + linked record,
  RequestExpandOverlay affordance) · Component Studio AI assistant (Codesmith, mentions ON) ·
  Predictive Studio ×2 (minimal gates, model-dev agent) · LiveKit room resource (imports
  `UserHoldsAuthorization` + `REALTIME_ADVANCED_SESSION_CONTROLS` FROM ng-conversations) ·
  **RealtimeWidget** (`packages/Web/RealtimeWidget` — NON-Angular consumer of
  `ConversationsRuntime.Instance` over guest-JWT GraphQL; the runtime's public API is an
  external contract) · bootstrap manifests (class renames need manifest regen) ·
  integration-test-suite (DefaultAgentResolver deterministic check).

### C5. Stub/dead additions (for GAPLIST Part 3)
- `ShareModalComponent` (superseded by generic resource-share dialog) — delete.
- `LibraryFullViewComponent` (superseded by collections-full-view) — delete.
- `CollectionViewComponent` — unused, delete.
- `CollectionTreeComponent` sidebar branch — unreachable (workspace hides the sidebar on the
  collections tab); its quick create/sub-collection/delete actions are dead — delete or re-expose.
- `services/dialog.service.ts.bak` — stray backup file, delete.
- Dormant intent-check pipeline (`checkContinuityIntent` + `intentCheckStarted/Completed` events,
  LLM check removed for latency in PR #2309; chat-area still binds the handlers) — decide
  revive-or-delete before the redesign inherits the events.
- Wrinkle on existing Part-3 deletes: reactions and jump-to-date now have PUBLIC host gates
  (`showReactions`, `showDateNavigation`, README-documented, minor-released). Deleting the stubs
  now means deprecating contract inputs, not just removing UI.
- From the perimeter sweep: `Shell.ChatOverlay.AllowOpenInFullApp` Instance Config key is seeded
  metadata with ZERO code readers (the affordance is unconditional today) — wire or delete the
  row; `ArtifactVersionHistoryComponent` (ng-artifacts) is exported + styled + mounted NOWHERE —
  delete or consciously adopt for Studio Split's version story; `onPendingMessageRequested` on
  ChatConversationsResource is explicitly `@deprecated` (superseded by `conversationCreated`
  carrying pendingMessage) — delete with the redesign; `AgentRequestPanelComponent`'s standalone
  slide-in mode has no live host (only the dialog wrapper mounts it) — unexercised mode, know it
  before re-hosting.

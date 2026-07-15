# Baseline Inventory — Shipped Conversations Stack (code-verified 2026-07-14)

> The FULL capability inventories from the two parity sweeps, persisted so the
> baseline doesn't live in a chat transcript. PARITY-AUDIT.md is the analysis;
> this is the raw record. DESIGN-NOTES.md carries the tracked parity checklist.
> Live-walk confirmation on cdp-dev 2026-07-15 (flat avatar-row messages, form
> pills, live React component artifacts w/ 7-tab viewer, MJE top-nav shell).

## A. Conversations widget (ng-conversations)

### Post-atlas deltas (merged after 2026-07-07; prototype branch lacks them)
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

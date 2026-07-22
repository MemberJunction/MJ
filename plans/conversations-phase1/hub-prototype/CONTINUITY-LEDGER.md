# Continuity Ledger — Composed Shell Replacement · 2026-07-22

> **The completeness proof for the redesign.** One row per shipped capability (source:
> BASELINE-INVENTORY.md §A–§C5, code-verified 2026-07-14 + 2026-07-22 sweeps). Every row has
> exactly ONE disposition; **zero unassigned rows = "we know where we stand."** Check-off
> mechanics: MOCKUP rows are verified by the functional mockup's placement accounts;
> MOUNT rows by the reuse manifest; CONTRACT rows by the named Angular slice or the cutover
> checklist; DELETE rows by the deletion landing on record. Rows marked ⚖ need a human call
> before their disposition is final — they are listed at the top so none hides in the table.
>
> Dispositions: **MOCKUP**(frame) · **MOUNT**(component comes whole) · **CONTRACT**(engineering
> checklist — slice/cutover) · **DELETE**(conscious, on record) · **⚖**(decision needed).
>
> **MAINTENANCE RULE (keeps the completeness claim true).** This ledger is complete as of
> 2026-07-22. At the start of every mockup session and every Angular slice, run the drift check —
> `git log --since=<last sweep date> -- packages/Angular/Generic/conversations
> packages/Angular/Generic/composer packages/ConversationsRuntime packages/Angular/Explorer/explorer-core
> packages/Angular/Explorer/explorer-app` — and fold anything new into BASELINE §C and a ledger row
> BEFORE building. The parity docs went stale within one week once (the 07-20/21 feature-gate
> contract); the ledger's guarantee only holds while this rule is followed. Update the "complete
> as of" date here on every re-sweep.

## ⚖ Open calls (the complete list — nothing else in this ledger is undecided)

| # | Decision | Owner | Where it lands |
|---|---|---|---|
| ⚖1 | Nested folders: roll-up/inheritance/move rules + descendant COUNTS (counts violate the no-badges rule) | Amith agenda (GAPLIST 1.4) | Sidebar/W0b |
| ⚖2 | Plan-mode semantics re-lock: shipped sticky-per-conversation vs D5 per-request | Matt+Amith (PARITY §3) | Composer + T1 plan card |
| ⚖3 | ~~Studio Split artifact facsimile~~ — **RESOLVED 2026-07-22 (Matt): shipped 7-tab viewer facsimile.** 4-lens idea remains available as a GAPLIST 2.1 proposal | — | T3 |
| ⚖4 | Thread panel (reply-in-thread): revive or delete (entry orphaned; P1.8 builds on it) | Matt+Amith (seam 6) | T-row |
| ⚖5 | Legacy search panel vs shipped omnibar: reconciliation design | GAPLIST 2.5 session | Shell ⌘K |
| ⚖6 | Notification deep-link params dropped today (`messageId`/`taskId`/`requestId`): fix in redesign (recommended — jump-to-message is implied UX) or document as limitation | Matt | CONTRACT/cutover |
| ⚖7 | ~~Floating panels vs rail~~ — **RESOLVED 2026-07-22 (Matt): Companion Rail is the conscious replacement; cancel-run survives in the rail** | — | T2 |
| ⚖8 | ~~In-chat artifacts modal~~ — **RESOLVED 2026-07-22 (Matt): folds into T3 version trail + P4 Artifacts tab; modal retired** | — | T3/P4 |
| ⚖9 | Dormant intent-check pipeline: revive (browser-local inference) or delete events | Matt (engineering) | Composer contract |
| ⚖10 | ~~Refresh agent cache~~ — **RESOLVED 2026-07-22 (Matt): quiet row w/ description under S1 Settings → Preferences** | — | S1 |
| ⚖11 | ~~FUTURE tags~~ — **RESOLVED 2026-07-22 (Matt): NO FUTURE tags in the functional mockup.** The mockup is the TARGET-STATE design of record; everything it shows is intended product. The backed-vs-unbacked distinction moves out of the UI into **section E below** (the implementation-side tracking that replaces the tags). The v4 CANVAS keeps its tags (frozen historical reference); the canvas guide's "untagged = real today" reading rule applies to the canvas only, not the mockup | — | All surfaces |

## A. Widget surfaces

### Shell / navigation / overlay
| Capability | Disposition |
|---|---|
| Workspace tabs Chats/Collections (+ tasks dropdown, top-nav search) | MOCKUP — replaced by shell nav: sidebar + W0a/W2 (D-S2/D-S6 on record) |
| Tasks nav item + Tasks full view (counts, sub-tasks, Gantt, dependencies, run links) | DELETE — D-S6 locked 07-16 (BizApps-Tasks owns user tasking; run visibility → T2 rail + F1 "ran" + run-inspector Associated Tasks) |
| Deep links (conversationId/artifactId/versionNumber/realtimeSessionId/collectionId/taskId; re-apply on tab re-focus; cross-resource pending message+attachments) | CONTRACT — Explorer wrapper slice; ⚖6 for the dropped params |
| Browser title tracks conversation; rename animation | CONTRACT — wrapper slice |
| Sidebar drag-resize/collapse/pin persisted (`Conversations.SidebarState`); mobile slide-over; click-outside collapse | MOCKUP SB (+WP6 mobile) + CONTRACT (persistence key) |
| Floating chat overlay (bubble drag, sliver, unread, resize persisted, workspace handoff) | MOUNT — overlay persists as-is; CONTRACT for the route-boundary wiring (§C4) |
| 6 host slots + cancelable before-events | CONTRACT — architecture preserved in new shell |
| Ctrl/Cmd+K | MOUNT omnibar (#3042) + ⚖5 |

### Sidebar & organization
| Capability | Disposition |
|---|---|
| Live filter box | MOCKUP SB + W0a |
| Header menu: Select Conversations / Group-by-flat / Hide Sidebar | MOCKUP W0a (select, group-by) + SB (hide) |
| Refresh agent cache | ⚖10 |
| Pinned section | MOCKUP SB |
| Row menu: Pin, Move-to-folder (+"New folder…"), Rename (Name+Description dialog), Delete | MOCKUP SB/W0a |
| AI auto-naming (30s guard) | MOUNT — runtime behavior, unchanged |
| Folder tree: recursive, chevrons, icon+color, hover actions, collapse+group-by persisted (`mj.conversations.folderPrefs.v1`) | MOCKUP SB/W0b — reshaped per v4 two-path sidebar; nesting rules ⚖1 |
| Descendant counts on folders | ⚖1 (counts violate no-badges; conscious change pending Amith) |
| Drag-drop: conversation→folder/Ungrouped; folder reparent (cycle-safe) | MOCKUP SB/W0a/W0b (exists in prototype) |
| Row chrome: active-task spinner; shared-with-me icon | MOCKUP SB |
| Row notification badge (count/pulse/priority colors) | MOCKUP — CONSCIOUS CHANGE on record: quiet dot + "new", no counts (position 9); FUTURE unread bold+dot pending D-S9 |
| Multi-select + bulk Delete(n) w/ partial-failure report | MOCKUP W0a |
| Folder modal (20 colors + custom, 20 icons, live preview) | MOCKUP W0b/project modal — full parity at build (prototype sketch noted) |
| Routines entry (gates, "+", command center, history) | MOCKUP SB/W3 + MOUNT `mj-user-routines-slide-in` + CONTRACT event bridges (§C4) |
| Search panel (6 scopes, date range, recents, highlighting) | ⚖5 |

### Chat header & panes
| Capability | Disposition |
|---|---|
| Header: title, "Shared by X", project tag, test-run indicator, pin/artifact/members chips, mode picker, agent picker, Export, Share | MOCKUP T1 (WP4 header consolidation — decide-against-the-list per GAPLIST 1.6); project tag's folder-CRUD entry consolidated w/ ⚖1 |
| Artifact split-pane (drag-resize persisted, maximize, maximize-reset-on-switch) | MOCKUP T3 + CONTRACT (persistence + reset behavior, regression-tested) |
| Artifacts modal (card grid, version counts, system toggle) | ⚖8 |
| Scroll-to-bottom; read-only banner; uploading overlay | MOCKUP states (T-row) + MOUNT internals |
| Per-conversation cached composer instances + server-persisted drafts (`mj.chat.drafts.v1`) | MOUNT + CONTRACT (§C1 — cross-device semantics preserved) |
| Sticky date header + jump-to-date (stub) | DELETE (Part 3; deprecate `showDateNavigation` input) |

### Messages (WP4 = the placement session)
| Capability | Disposition |
|---|---|
| Markdown/collapsible headings, mention badges, form pills, "(edited)", elapsed pill | MOUNT internals; MOCKUP density (WP4) |
| Gear → run inspector (runs/Steps/Tokens/Cost/Status/lazy tasks) + rating-count badge + placement facts (§C2) | MOCKUP WP4 placement + MOUNT panel internals |
| Actions: pin, inline edit, delete-last-and-below, retry, rating dialog (pips/consent/role grant), flask, Shift+click diagnostics | MOCKUP WP4 placement + MOUNT dialogs |
| Actionable command chips (open:url/open:resource + most-recent-artifact fallback) | MOUNT + CONTRACT (fallback rule §C4) |
| Response forms incl. plan-approval card | MOUNT `mj-dynamic-form` + MOCKUP T1 presence + ⚖2 |
| Attachments grid + fullscreen viewer; non-image strip | MOUNT (prev/next improvement queued, GAPLIST 2.10) |
| Per-message artifact cards | MOCKUP T1 + MOUNT viewer |
| Pinned panel | MOUNT + MOCKUP presence (header consolidation) |
| Thread panel | ⚖4 |
| Reactions, message save/share/export stubs | DELETE (Part 3; reactions = deprecate `showReactions` input) |
| Final-response streaming into bubble | MOUNT + CONTRACT (verify under new shell hosting) |

### Agents / live work
| Capability | Disposition |
|---|---|
| Active-agent header chip; floating Active Agents panel + cancel-run; tasks dropdown; bolt badge | MOCKUP T2 — Companion Rail as conscious replacement, ⚖7; cancel-run must survive in rail |

### Artifacts & collections
| Capability | Disposition |
|---|---|
| Artifact viewer (full §C4 contract: tabs, versions, Save-to-Collection, Share, Analyze, Apply-to-Form, plugins incl. Data query-sync + Save Query, usage tracking, React rendering) | MOUNT `mj-artifact-viewer-panel` whole — facsimile at real scale in T3; ⚖3 for tab structure |
| Collections Finder (breadcrumb drop targets, grid/list+sort, search, pagination, select ranges, staging shelf, drag-move, context menus, open-source-conversation, permission gating) | MOCKUP W2 — FULL treatment (WP2, absorbs GAPLIST 2.2) |
| Collection form; artifact-create modal (rollback); save-to-collection picker (multi-select, locks, inline create) | MOUNT dialogs + MOCKUP W2 presence |
| Conversation share (email, roles, remove) | MOUNT generic `mj-resource-share-dialog` |
| Public link toggle (COSMETIC today) | CONTRACT — parcel G builds the real backend (D11); mockup shows it FUTURE-tagged until then |
| Artifact/Collection share (cascades) | MOUNT (known server bug on collection cascade tracked separately) |
| Members modal (in-memory stub) | DELETE (superseded when P1.8/D11 land) |
| Export (MD/JSON/HTML/Text + options) | MOUNT |

### Voice / realtime (entire stack)
| Capability | Disposition |
|---|---|
| Voice picker (search, co-agent, consent), live overlay (all controls, density, orb), delegation cards, activity rail, channels (Whiteboard/Media/Remote-Browser + takeover), timeline card, session review/evidence playback | MOUNT — whole stack persists; in-call THREAD state = separate design session vs #3111 (out of mockup scope) |
| ClientContextChannel (app-context streaming + ContextTool proxy); co-agent pairing; disclosure ratchet + overlay host contract; `realtimeSessionId` one-shot semantics | CONTRACT (§C1/§C2/§C4 — cutover checklist) |

## B. Composer + runtime
| Capability | Disposition |
|---|---|
| ng-composer editor (chips, keyboard, paste/drop, serialization); trigger providers (@/#//) incl. presets-in-chip, skill gating; attachments pipeline; initialMessage auto-send | MOUNT ng-composer + plugins whole; MOCKUP visual parity (composer facsimile already close) |
| "@ people" mentions | CONTRACT note — self-only today (§C3); a seam to design later, NOT parity to preserve |
| Plan toggle + sticky pref | MOUNT + ⚖2 |
| Voice entry (mic/caret/picker/prefs) | MOUNT |
| Mode picker + per-user-per-agent persistence | MOUNT + MOCKUP presence |
| Runtime (default-agent chain, processMessage, streaming/reconnect/replay, MentionParser, ClientToolRegistry, bridge, sessions observer, adapters) | MOUNT — runtime untouched; its public API is an EXTERNAL contract (RealtimeWidget consumer, §C4) |
| Client-side task-graph orchestration (dedupe, fast path, silent-observation payload continuity); 6-step routing precedence | CONTRACT — behaviors survive any re-plumb verbatim (§C2) |
| Skills observability (run-step Skills tab) | MOUNT (run-detail surface, outside shell scope) |

## C. Host wiring & perimeter (the invisible class — all CONTRACT, cutover checklist)
| Contract | Verified at |
|---|---|
| Host feature-gate contract (~20 chat-area inputs) re-expressed; embedder matrix (Form Builder / Component Studio / Predictive Studio / LiveKit exports) keeps working | Cutover + per-embedder smoke test |
| String couplings: app 'Chat', nav names, resource `@RegisterClass` keys (+ manifest regen on any rename) | Cutover checklist — rename map authored FIRST |
| Overlay↔route boundary (`isChatRoute`), toast-suppression predicate, `<mj-toast>` hosting, TopBoundaryPx/EmptyStateGreeting/AppContext feeds | Cutover |
| Omnibar `?agent`+nonce consume path (once-only, stale-echo re-clear) + pill pre-address seam | Slice that owns the wrapper |
| Pre-conversation header mode; `--mj-chat-*` token injection; pre-render `isReady` engine gate; new-user default state; delete-open fallback | Slice that owns the wrapper |
| Notifications page routing (conversation/agent-request/meet-room) + ⚖6 params; agent-requests `requestId` auto-open chain | Cutover + notification-click runtime test |
| Instance Config keys (`Shell.ChatOverlay.Enabled` etc.) honored by new shell | Cutover |
| Routines event bridges (`ConversationOpened`→chat select, `HistoryRecordOpened`→record nav) | Room/W3 slice |
| Maximized-pane reset, split persistence keys, agent-request panel width key, realtime width/disclosure prefs | Respective slices (keys preserved verbatim) |

## D. Deletions (all on record here + GAPLIST Part 3)
Reactions (+input deprecation) · jump-to-date (+input deprecation) · message save/share/export stubs · members modal stub · Tasks top-level surfaces (D-S6) · `ShareModalComponent` · `LibraryFullViewComponent` · `CollectionViewComponent` · `CollectionTree` sidebar branch · `dialog.service.ts.bak` · `onPendingMessageRequested` (deprecated) · `Shell.ChatOverlay.AllowOpenInFullApp` (wire-or-delete) · `ArtifactVersionHistoryComponent` (delete-or-adopt, feeds ⚖3) · intent-check pipeline (⚖9) · orphaned generic `mj-conversation-workspace` + `conversation-navigation` (retired at cutover).

## E. Design-of-record features awaiting backing (replaces the FUTURE tags, per ⚖11)

> The functional mockup renders these UNTAGGED as intended product (Matt's ⚖11 call). They are
> NOT backed by shipped machinery yet — each needs the listed prerequisite before its Angular
> slice can build it for real. Implementation planning reads THIS table, not the mockup, to know
> what's free vs what's gated.

| Mockup feature (untagged, design-of-record) | Backing prerequisite | Umbrella home |
|---|---|---|
| Read-status: "New" divider, unread quiet dots, "since you were last here" lines | `ConversationDetailUserReadStatus` table + migration + CodeGen | D-S9 (needs owner) |
| "Last here N days ago" recency (Room Overview, project cards) | Same D-S9 substrate (per-user visit tracking) | D-S9 |
| Context ring (composer/header usage gauge) | `computeConversationUsage()` runtime + telemetry | P1.1 (parcel C; align w/ #2732) |
| Members activity / avatar stacks / roles in Room header + project cards | Project membership model + permissions domain | Projects v1 (design first) |
| Drag-artifact-to-file into project (P4 hint, W0a drag targets are conversations — fine) | Artifact↔Project relationship (schema) | Projects v1 / audit §4 |
| Remix (artifact → new conversation) | `forkConversation` / remix capability | P1.7 (parcel G) |
| Archived-projects filter (W0b) | `MJProjectEntity.IsArchived` EXISTS — verify list/restore flows only | Cheap; Projects v1 |
| Follows-latest collection pins (if restored to W2) | `CollectionArtifact` nullable-version change | Audit §4 (small) |
| Real public artifact link (Share) | Magic-Link publish backend + privilege seed (D11) | P1.7 (parcel G) |

## Bookkeeping
- Confirmed absent today (nothing to carry): quote/fork, context gauge, memory UI, temporary/incognito, real public link, full members modal — these are NEW builds per the umbrella plan (P1.1/P1.2/P1.6/P1.7), not continuity items.
- Runtime-verification list (what static analysis can't prove — from the 07-22 confidence statement): timing dances (omnibar nonce, cold-deep-link race), DB-metadata-driven plugin tab sets, live Instance-Config/permission gates, PubSub paths, ⚖6 reachability. Folded into mockup review gates as side-by-side live walks + the three targeted tests.

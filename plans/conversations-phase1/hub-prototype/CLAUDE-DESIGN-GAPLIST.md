# Claude Design Worklist — Missing Functionality to Design

> **STATUS SWEEP 2026-07-22 (post functional mockup + correction pass).** The verified
> functional mockup RESOLVED the following at the design level (implementation still owes the
> Angular build): **1.1** message row complete (WP4; placement per BASELINE §C2) · **1.2** run
> inspector (modeled w/ steps/tokens/cost) · **1.5** composer completions (visual-parity
> facsimile; "@ people" stays a seam, §C3) · **1.6** header chips consolidation · **1.7/1.8/1.9**
> share/rating/export (modeled; internals = MOUNT) · **1.10** folder modal (project modal) ·
> **1.11** empty/first-run (F0/F0x/PA2 persona) · **1.13** scope-at-capture + "Used N notes"
> chip · **2.2** Collections workspace (full W2 treatment) · **2.9** pinned panel (modeled).
> **MOOTED**: 2.3 Tasks surfaces (deleted per D-S6). **STILL OPEN**: 1.4 nesting (⚖1, Amith) ·
> 1.12 plan-approval semantics (⚖2 re-lock; card itself is modeled) · 2.1 artifact viewer at
> real interactive scale (facsimile shipped; real-scale session when P1.7 lands) · 2.4
> voice/in-call (design vs #3111) · 2.5 search↔omnibar reconciliation (⚖5) · 2.6 overlay ·
> 2.7 threads (⚖4) · 2.8 notifications surface · 2.10 attachments viewer prev/next.
> Part 3 deletions unchanged — they execute during implementation.

> The complete list of shipped functionality that does not yet have a drawn answer in the
> redesign language. Work these in Claude Design (its mockups are the polished surface);
> **prepend the context block from CLAUDE-DESIGN-HANDOFF.md to every session** and attach
> screenshots of the live app state (cdp-dev) plus the prototype state where one exists.
> Facts below are code-verified (BASELINE-INVENTORY.md); don't let sessions re-litigate them.
>
> Status legend: 🎨 needs design · ◐ prototype has a sketch, needs the polished version ·
> ⚖ needs a decision before design starts.
>
> **THE PLACEMENT RULE (Matt, 2026-07-15).** You can't compose a layout until you have the
> complete contents. A surface's design is DONE only when every baseline item for that surface
> has an address: visible at rest · revealed on hover · in an overflow menu · consolidated
> into another element · or deleted, on the record. Blank = blocked. Every Claude Design
> session must end with its placement account — the item list with addresses — not just the
> mockup. This is the guard against the vignette trap: designing a beautiful home for the
> star feature and a homelessness crisis for everything else.

## Part 1 — In-frame gaps (surfaces the redesign already covers)

Ordered by recommended sequence — each is one Claude Design session.

### 1.1 Message row, complete 🎨 (unblocked — flat-row idiom adopted 2026-07-15)
Baseline facts: flat avatar rows both parties; hover actions per message — pin/unpin, inline
edit (Enter/Shift+Enter/Esc, "(edited)" badge), delete-last-and-below, retry on errors;
generation-time pill; gear → run inspector (run links, steps, tokens, cost); actionable
command chips on the last message; per-message artifact cards (name + type badge + version,
click → viewer); submitted-form pills; collapsible markdown headings; mention tokens as
colored badges; image thumbnail grid; Shift+click diagnostics (dev).
Design task: the full anatomy of one message row in the quiet language — rest state, hover
state (which actions surface, which fold into a menu), the pill/card/chip sub-components,
and the error+retry state. Constraint: quiet ≠ fewer capabilities; everything above must
have a home.

### 1.2 Run inspector 🎨
Baseline: gear on every agent message → agent + Run ID links (open records), step list,
token count, cost, status badge, lazy associated-tasks widgets.
Design task: where this lives in the new language (inline expansion? side panel?) and its
information design. Pairs naturally with 1.1. Note the prototype's context gauge (38% ring)
is adjacent subject matter — parcel C.

### 1.3 Sidebar management set ◐
Baseline: live filter (✅ in prototype), group-by-folder/flat toggle, multi-select mode
(checkboxes, Select All, bulk Delete w/ partial-failure report), row hover menu
(Pin/Unpin, Move-to-folder submenu w/ "New folder…", Rename ✅, Delete), notification
badges (count/dot/pulse/NEW, priority colors), active-task spinner, shared-with-me icon,
drag-drop (✅), sidebar drag-resize 200–500px + collapse/pin persisted.
Design task: the polished sidebar row anatomy + the management modes (filter active,
multi-select active) in the quiet language.

### 1.4 Nesting ⚖ then 🎨
Baseline: recursive folder tree, chevrons, subfolder create, drag reparent (cycle-safe),
descendant counts, delete-moves-contents-out. The prototype renders flat (was "deliberately
undrawn" — but nesting is SHIPPED, so flat is a regression).
Decision first (Amith review): retrofit answers to the six hierarchy questions. Then design:
indent language in the rail, hub breadcrumb for child projects, move semantics.

### 1.5 Composer completions ◐
Baseline: @ includes human users; in-chip agent config-preset dropdown (2+ presets, survives
serialization); paste-image-from-clipboard; drag-drop files w/ highlight; per-file validation
errors (count/size/type); attach-from-artifact; voice: phone instant-start + caret picker
(co-agent choice persisted, record consent); unaccepted-skill warning toast; auto-retry
("Retrying…") on failed sub-agent turns.
Design task: the preset-in-chip interaction, the voice picker popover, validation error
presentation, and the drop-target state — in the polished composer Claude Design already has.

### 1.6 Header state chips ⚖ then 🎨
Baseline: pin-count chip → pinned panel, artifact-count chip → artifacts modal, members
chip → members modal, "Shared by X" badge, test-run indicator, project tag, mode picker,
agent picker, Export, Share.
Decision: the quiet direction wants fewer chips — decide what consolidates (against this
list, item by item), then design the consolidated header + the panels the chips open.

### 1.7 Share modal, full parity ◐
Baseline: add by email, Can View/Edit/Owner, remove w/ confirm, public link toggle
(cosmetic today — D11 makes it real). Prototype has roles + remove + privilege-gated
publish; needs the polished treatment + conversation-level (not just project) share.

### 1.8 Rating flow 🎨
Baseline: 1–10 pip scale w/ color bands, 2000-char comment, one-time consent checkbox,
grants reviewer roles conversation access, on the latest AI reply only; test-feedback flask
when TestRunID.
Design task: the dialog + the entry affordance in the quiet language (the consent + access
side effect needs honest copy).

### 1.9 Export modal 🎨
Baseline: Markdown/JSON/HTML/Plain Text; include-messages, include-metadata, JSON
pretty-print, HTML embedded CSS; browser download.

### 1.10 Folder/project modal, full ◐
Baseline: Name, Description, 20 color swatches + custom picker, 20-icon grid, live preview
chip. Prototype: 6 icons/5 swatches. Design the full picker in the polished language.

### 1.11 Empty + first-run states ◐
Baseline: greeting + 4-random-of-20 suggested prompts, embedded composer, "@Agent /
Enter-to-send" tips. Prototype has a first-run page (3 static starters). Also fix baseline's
own inconsistency: welcome tips say "Enter to send," composer says Ctrl+Enter.

### 1.12 Plan-approval card ◐ (semantics ⚖ = the D5 re-lock)
Baseline: inline mj-dynamic-form on last message, owner only; editable markdown plan
(preview/edit toggle) + optional reason + approve/reject; approve disables the sticky
per-conversation pref; reject keeps plan mode on, reason steers re-plan; read-only pill
after submit; out-of-conversation panel adds reassign/expired.
Prototype has the quiet per-request version w/ stale-decay. Design the reconciled card once
D5 is re-locked.

### 1.13 Harvested from Amith's Option C render (attribution: AN-BC alt design, 2026-07-07) 🎨
Three details his Companion Canvas drew that must not get lost:
- **Scope-at-capture**: the in-chat "Remembered" moment carries `Keep / Edit / Undo` + a
  `Scope: Project ▾` selector — decide scope at the moment of capture, edit before keeping.
  (Prototype currently has Keep/Forget inline, scope editing only in the Memory tab — upgrade.)
- **"Used N project memories" chip** on agent replies — read-transparency. Designed in every
  mockup generation, shipped nowhere; prototype carries it. Keep it in the design of record.
- **"Drag any artifact here to add it to the project"** — the only drawn answer so far to
  add-existing-artifact-to-project (the collections ↔ projects boundary question).

## Part 2 — Out-of-frame surfaces (no redesign answer exists at all)

Each is a standalone Claude Design engagement; sequence after Part 1's core loop.

| # | Surface | Baseline scale (see BASELINE-INVENTORY.md for full detail) |
|---|---|---|
| 2.1 | **Artifact viewer, real scale** | Live React components (interactive tables, "Apply to my Form" w/ record picker); tabs Display / plugin (Code, Func/Tech/Data Requirements) / JSON+copy / Details / Links (origin conversation ↔ collections); version dropdown; Save-to-Collection; Share; Analyze (state snapshot → AI); usage tracking. The prototype's artifact page is a sketch of maybe 20% of this. |
| 2.2 | **Collections workspace** | Finder-style: breadcrumbs as drop targets, grid/list + sort persisted, search, pagination, select mode w/ Shift/Cmd ranges + keyboard, staging shelf, drag-move, right-click context menus, "Open source conversation," permission-gated throughout. |
| 2.3 | **Tasks surfaces** | Full view (counts → detail w/ sub-tasks, Gantt, dependencies, run links); tasks dropdown (grouped, live elapsed); floating active-tasks/global panels minimizing to a badge; cancel-run w/ confirm. |
| 2.4 | **Voice/realtime** | Live overlay (end/mute/minimize-to-pill, captions, type-to-talk, density presets, reactive orb); delegation cards w/ cancel; whiteboard/media/remote-browser channels (+human takeover); session review w/ recording playback + click-to-seek; timeline card in chat; voice picker w/ consent. |
| 2.5 | **Search** | Ctrl+K panel: 6 scopes, date range, recent searches, highlighting, keyboard nav. (Coordinate with #3042 omnibar — may merge.) |
| 2.6 | **Chat overlay mode** | Floating bubble: drag, hide-to-edge, unread badge, collapsed/expanded/maximized, 3-edge resize persisted, workspace handoff. |
| 2.7 | **Threads** | Reply-in-thread slide panel (entry point currently orphaned in product — decide revive vs delete before designing). |
| 2.8 | **Notifications** | Priority-colored badges, pulse/NEW states, per-row placement; plus the notification entry surface. |
| 2.9 | **Pinned-messages panel** | Newest-first previews, jump-to-message, unpin. |
| 2.10 | **Attachments viewer** | Fullscreen image viewer (zoom/pan/fit/download) — add the missing prev/next while designing. |

## Part 3 — Don't design (baseline stubs; propose deletion instead)
- Like/comment reactions (shipped `display:none`) — ⚠ 07-21 gave this a PUBLIC host gate
  (`showReactions`, README-documented, minor-released); deletion now = input deprecation too
- Jump-to-date (stub) — same ⚠: now gated by public `showDateNavigation` input
- Message-level save/share/export handlers (stubs)
- Members modal in-memory stub (superseded by real sharing when D11/G lands)
- `ShareModalComponent` (superseded 2026-04 by generic `mj-resource-share-dialog`) — delete
- `LibraryFullViewComponent` + `CollectionViewComponent` (superseded by collections-full-view) — delete
- `CollectionTreeComponent` sidebar branch (unreachable: workspace hides the sidebar on the
  collections tab) — delete or consciously re-expose
- `services/dialog.service.ts.bak` — stray backup file, delete
- Dormant intent-check pipeline (`checkContinuityIntent` + dead-bound `intentCheckStarted/Completed`
  events; LLM check removed for latency, PR #2309) — decide revive-or-delete

## Addendum 2026-07-22 — sweep deltas feeding the sessions above

Full re-sweep on 2026-07-22 (branch current with `next`). Raw record:
**BASELINE-INVENTORY.md §C**. What it changes here:

- **1.1 / 1.2 (message row + run inspector)**: the placement account must include the shipped
  placement facts — last-message footer (pin/delete/rating), earlier messages' actions inside
  the gear panel, gear rating-count badge, non-owner "Rated N/10" pill (§C2).
- **1.4 (nesting) + 1.6 (header chips)**: the header project tag is a SECOND full folder manager
  (Assign Project modal w/ Create/Edit/Delete) — same `MJProjectEntity` data, two managers;
  consolidate consciously (§C2).
- **1.5 (composer completions)**: drafts are server-persisted and cross-device
  (`mj.chat.drafts.v1`), not instance-cached — the redesign keeps that bar (§C1). Correction:
  "@ people" currently suggests ONLY the current user — a seam to design, not parity to keep (§C3).
- **2.4 (voice/realtime)**: add the headless `ClientContextChannel` (app-context streaming + the
  ContextTool proxy that lets the agent drive the app), co-agent pairing constraints, and the
  overlay host-control contract + earned-controls disclosure ratchet (§C1/§C2). These are
  must-keeps even though invisible.
- **2.5 (search / ⌘K)**: the omnibar is SHIPPED with a provider registry extending
  `ComposerTriggerProvider` and a real agent-pill pre-address flow into the composer; the session
  designs the reconciliation of the legacy search panel WITH it, not a fresh ⌘K (§C1).
- **Integration-contract class (PARITY §1.12)**: the 07-20/21 host feature-gate contract
  (~20 inputs), pre-conversation header mode, and `--mj-chat-*` runtime token injection join the
  must-keep list (§C1).
- **Behavior must-keeps with no UI**: client-side task-graph orchestration (incl. silent-observation
  payload continuity) and the 6-step routing precedence (§C2) — any composer re-plumb carries them.

**Second (perimeter) sweep, same day — BASELINE §C4/§C5.** What it changes here:
- **1.12 (plan-approval card)**: the out-of-conversation surface is fully enumerated now
  (agent-requests panel states, reassign flow, `requestId` auto-open chain) — that's the real
  baseline, not the one-liner.
- **2.1 (artifact viewer)**: the session's baseline grows to the REAL host contract + full
  plugin roster, incl. the Data viewer's query-sync machinery + Save Query slide-in (§C4).
  The Studio Split session consumes this directly.
- **2.2 (collections)**: add the Explorer wrapper's host facts (unpersisted pct-resize,
  config+queryParams dual delivery, Analyze → new conversation) (§C4).
- **2.8 (notifications)**: the page is far bigger than the line here — filters, HTML-email
  parsing, expand-marks-read, TransactionGroup mark-all, meet-room routing (§C4). Also a
  KNOWN GAP to fix-or-document: `messageId`/`taskId`/`requestId` deep-link params are silently
  dropped by the live Conversations host today.
- **Host wiring class (new)**: the string-coupling contract (app/nav names, resource keys),
  the overlay↔route boundary + toast-suppression predicate, the `<mj-toast>` hosting duty,
  the pre-render engine gate, and the embedder matrix (Form Builder / Component Studio /
  Predictive Studio / LiveKit / non-Angular RealtimeWidget) — all must-keeps for the cutover
  slice (§C4).

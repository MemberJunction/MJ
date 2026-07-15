# Claude Design Worklist — Missing Functionality to Design

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
- Like/comment reactions (shipped `display:none`)
- Jump-to-date (stub)
- Message-level save/share/export handlers (stubs)
- Members modal in-memory stub (superseded by real sharing when D11/G lands)

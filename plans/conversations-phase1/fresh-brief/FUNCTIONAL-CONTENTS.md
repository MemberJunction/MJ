# Functional Contents — Everything That Must Have a Home

> Document 3 of 3. The complete, code-verified contents of the product, surface by
> surface. THE PLACEMENT RULE applies: a surface's design is complete only when every
> item below has an address (at rest · on hover/focus · overflow · consolidated into X ·
> proposed-for-deletion). Tags: **[S]** shipped today — users have it, silent loss is a
> regression · **[N]** new capability being added — design it for the first time ·
> **[D?]** shipped but stub/broken — deletion may be the right proposal.

## Shell & navigation
- [S] Three workspace areas: Conversations, Collections, Tasks
- [S] Global search entry + Ctrl/Cmd+K
- [S] Deep links to conversation / artifact@version / voice session / task; survive tab refocus
- [S] Floating chat-overlay mode for host apps (movable bubble, unread badge, expand/maximize, resize, "open in full workspace" handoff)
- [S] Sidebar: drag-resize, collapse, pin (persisted per user); mobile slide-over
- [S] Notifications entry with per-conversation badges (count, priority color, pulse, NEW)
- [N] Context/cost gauge for the active conversation (tokens, window %, running cost; nudge near capacity)

## Sidebar — conversations & organization
- [S] New Conversation (primary action) · new temporary chat
- [S] Live filter over titles AND description previews
- [S] Conversation rows: title + one-line description preview + relative time; active-task spinner; shared-with-me indicator; notification badge
- [S] AI auto-naming of new conversations (guarded, background) — names must stay legible and deduped
- [S] Pinned conversations section
- [S] Projects tree: nestable, color + icon, descendant counts, expand/collapse (persisted)
- [S] Group-by-project vs flat toggle
- [S] Row menu: pin/unpin · move-to-project (submenu incl. "New project…") · rename · delete (confirm)
- [S] Rename = dialog with Name + Description (agents read the description)
- [S] Drag-and-drop: conversation → project / → ungrouped; project → project reparent
- [S] Multi-select mode: checkboxes, select all, bulk delete with partial-failure report
- [S] Project create/edit: name, description, color (20 + custom), icon (20), live preview
- [S] Project delete = contents move out, "nothing is deleted"
- [N] Project archive (get it out of the way, restorable) — proposed model, design welcome
- [S] Routines entry: active count, "+" quick-create, opens the routines manager (list, run-now, pause/resume, history linking to runs)

## Project (when opened) — largely NEW, the biggest open canvas
- [N] The project presentation itself (OPEN seam #1): orientation for a returning member — what's alive, what changed, what needs me
- [N] Project memory surface: list notes, scope (this project / org-wide), edit, forget (org-wide forget warns), provisional notes awaiting review
- [N] Project members & roles (view/edit/owner), invite, remove, leave; what each role sees
- [S→N] The project's conversations, task graphs (F3), and artifacts, presented somewhere sensible
- [N] Per-member "viewing as" honesty: read-only users get read-only reality, not disabled chrome

## Chat header
- [S] Title (editable), project affiliation visible + navigable
- [S] "Shared by X" provenance when applicable · read-only banner for view-only access
- [S] Pinned-messages count → panel (previews, jump-to-message, unpin)
- [S] Artifact count → artifact list (versions per artifact, open specific version)
- [S] Members indicator (when shared) → member management
- [S] Agent picker (pin a default agent or Auto) · response-mode picker (hidden when <2 presets)
- [S] Export · Share
- [S] Test-run indicator (QA context)

## Message rows (flat avatar rows, both parties — shipped idiom)
- [S] Avatar + name + timestamp header; agent turns add generation-time
- [S] Markdown with collapsible headings; mention tokens render as colored badges
- [S] Streaming: agent's final response streams live into the row
- [S] Submitted-form pills (a user's structured responses render as compact pills)
- [S] Hover actions: pin · edit (inline; "(edited)" badge) · delete-last-and-below · retry (on errors)
- [S] Rating on the latest agent reply: 1–10 scale dialog + comment + one-time consent (grants reviewers access — needs honest copy)
- [S] Agent-run inspector per agent turn: steps, tokens, cost, status, links to run records
- [S] Actionable command chips on the last message (agent-offered next actions; open records/URLs)
- [S] Per-message artifact cards (name, type, version) → open viewer
- [S] Image attachments: thumbnail grid → fullscreen viewer (zoom, pan, download); non-image chips
- [N] Memory transparency: "used N notes" on replies (→ manage surface); the in-chat "remembered" moment with keep / edit / discard + scope choice at capture
- [D?] Reactions (shipped hidden) · jump-to-date (stub) · per-message save/share/export (stubs)
- [S] Thread panel (OPEN seam #6: revive or delete)

## Composer
- [S] Multiline; Enter sends, Shift+Enter newline (fix shipped inconsistency: one rule everywhere)
- [S] `@` agents (reroutes conversation) and people · `#` records/queries as context · `/` skills — with keyboard-navigable popover
- [S] Mention chips; whole-chip backspace deletion; agent chips with 2+ presets carry an inline preset picker
- [S] Attachments: picker + drag-drop + paste-image; limits w/ per-file validation errors; attach-from-artifact
- [S] Plan-mode toggle (semantics = OPEN seam #5); server may force plan mode for some agents
- [N] Temporary/incognito choice at creation, locks at first send, always-visible in-chat indicator
- [S] Voice: instant-call button + options popover (agent, voice, record-consent)
- [S] Draft persistence per conversation (text survives switching away)
- [S] Skill warnings when the target agent can't use a requested skill; visible auto-retry on failed turns
- [S] Send disabled unless text or attachments

## Plan approval (in-conversation)
- [S] Editable plan (markdown, preview/edit) + approve / reject-with-reason (reject forces re-plan)
- [S] Owner-only; disabled while processing; collapses to a read-only record after action
- [N] Stale handling: a plan left unapproved while conversation moves on must not stay armed

## Artifacts & viewer
- [S] Live rendering — component artifacts are working apps (tables w/ search/sort/drill-down)
- [S] Version dropdown (append-only history: agent + human edits) · [N] human edit → new version flow
- [S] Lenses: rendered view · requirements (functional/technical/data) · code · raw JSON · details · links (origin conversation ↔ collections)
- [S] Save-to-collection (multi-select picker, inline create) · Share · Analyze (send state snapshot to an agent) · copy/print · usage tracking
- [S] "Apply to my Form" for form-role artifacts (record picker)
- [N] Remix (fork artifact into a new conversation) · [N] governed public link (privilege-gated; today's toggle is cosmetic — a trust bug to fix in design)
- [N] Drag an artifact into a project to file it there (proposed affordance)

## Collections
- [S] Second nestable tree; Finder-style browser: breadcrumbs (drop targets), grid/list, sort, search, pagination, select-mode w/ ranges + keyboard, staging shelf, drag-move, right-click menus, "open source conversation"
- [S] Collection share w/ roles, cascades to children; permission-gated everywhere

## Tasks
- [S] Full view: all graphs, active/completed counts → detail w/ sub-tasks, dependencies, Gantt, run links
- [S] Tasks dropdown (grouped, live elapsed, jump to conversation) · floating active-task panels, minimize to badge · cancel a running task (confirm)
- [N] Task graphs belong to projects (OPEN seam #3)

## Voice / realtime
- [S] Live overlay: end, mute, minimize-to-pill, captions/transcript toggle, type-to-talk, density presets
- [S] Delegation cards: watch delegated agent work, expand, cancel; artifact chips
- [S] Channels: shared whiteboard (both draw) · media viewer · remote browser (agent drives, human can take over) — each with first-run onboarding; focus mode
- [S] Session record in chat: one timeline card → full review (transcript, recording w/ click-to-seek, saved whiteboard, resume live)

## Search
- [S] Panel: scopes (all/conversations/messages/artifacts/collections/tasks), date range, recent searches, highlighting, keyboard nav
- [N] Project-scoped behavior when invoked inside a project (OPEN seam #7)

## Sharing & export
- [S] Conversation share: by email, view/edit/owner, remove (confirm)
- [S] Artifact + collection share w/ roles; grant-only-what-you-have
- [N] Project-level sharing as THE boundary (members/roles) — direction, design it
- [S] Export: Markdown / JSON / HTML / Text with per-format options
- [D?] Legacy members modal (in-memory stub — superseded by real sharing)

## Global states (every surface)
- Brand-new user (nothing exists) · sparse · established · heavy (long names, 12+ projects, 8 members, 30+ notes) · loading · error-with-retry · read-only/permission-limited

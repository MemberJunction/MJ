# SLICE-S1 — Shell frame + two-path sidebar + Settings slide-in

## Context

First visible slice of the composed shell (IMPLEMENTATION-PLAN S1). Builds the skeleton every
later surface plugs into: the `mj-composed-shell` frame, the v4 two-path sidebar, and the S1
Settings panel — matching the accepted functional mockup (`functional-mockup-src/app.js`:
`renderSidebar`, `renderSettingsPanel`, `state.showProjects`; frames F0/F0x/S1). All work on
`conversations-shell`, committed directly (no PRs), reviewed by Matt in-browser before commit.
On approval, this spec is copied to `plans/conversations-phase1/slices/SLICE-S1.md` as the
slice record.

## New components (standalone, `inject()`, PascalCase inputs — the package's widget-extension
convention; exported via public-api + added to conversations.module exports)

All under `packages/Angular/Generic/conversations/src/lib/components/shell/`:

1. **`mj-composed-shell`** (`composed-shell.component.ts/html/css`) — the frame: grid of
   sidebar + main outlet + settings overlay + `<mj-toast>` host. Owns the internal navigation
   state (`ShellView` union: `chats | projects | collections | routines | chat | frontdoor`,
   `frontdoor`/W-surfaces render honest placeholder panes until S2/S3/S4). Inputs:
   `environmentId`, `currentUser`, `Provider` (BaseAngularComponent), feature pass-throughs.
   Outputs: `viewChanged`, `conversationSelected` (host syncs URL — Generic no-Router rule).
   Selecting a Recents/Pinned row mounts the existing `mj-conversation-chat-area` in main
   (full reuse, no changes to it).
2. **`mj-shell-sidebar`** (`shell-sidebar.component.*`) — two-path sidebar per v4: New
   conversation + filter box; nav (Chats / Projects¹ / Collections / Routines); Pinned +
   Recents lists (project color-dots, hollow = ungrouped; row menu: Pin/Unpin, Move-to-project,
   Rename, Delete — reusing the existing dialogs/services from conversation-list); quiet
   activity dot (driven by the EXISTING NotificationService state, rendered as a dot never a
   count — the conscious change on record; upgrades to D-S9 later); Settings gear pinned at
   bottom; drag-resize + collapse with the existing `Conversations.SidebarState` persistence
   key (parity). ¹Projects nav item gated by the Show Projects pref; when visible with zero
   projects, renders the F0 teaching line ("Group related chats, memory, and deliverables ·
   Create your first project").
3. **`mj-shell-settings-panel`** (`shell-settings-panel.component.*`) — slide-in over scrim
   (never a route; ESC + scrim close; panel STAYS OPEN on toggle flips, mirroring the
   corrected mockup). Groups per mockup S1: **Sidebar** — Show Projects toggle (default ON),
   density (Comfortable/Compact); **Preferences** — default agent (read-only display of the
   resolved default in S1), appearance (System/Light/Dark, emitted to host via output — the
   host owns theming), refresh agent cache (quiet row + description, calls the existing
   agent-cache refresh used by today's top-nav button).
4. **`shell-preferences.ts`** (util, mirrors `utils/plan-mode-preference.ts`): UserInfoEngine-
   backed prefs — `mj.conversations.showProjects.v1` (ON default, drives F0x) and
   `mj.conversations.sidebarDensity.v1`.

## Dev mount for review (temporary, removed at S8)

`ChatConversationsResource` (explorer-core) gains a query-param gate: `?shell=v2` renders
`<mj-composed-shell>` instead of its current composition. Purely additive `@if` branch;
default path byte-for-byte unchanged, no nav/metadata changes, unreachable unless you type
the param. This is how Matt reviews every slice in the real app with real data.

## Ledger rows

Discharges (MOCKUP): sidebar filter · Pinned section · row menu · quiet-dot conscious change ·
F0 teaching line · F0x opt-out · Settings slide-in incl. ⚖10 refresh row. Carries (CONTRACT):
`Conversations.SidebarState` key parity · `<mj-toast>` hosting in the frame.

## Exclusions (slots reserved, no rework later)

Read-status unread affordances (D-S9, §E) · Front Door content (S3) · W-surfaces content
(S2/S4) · rail visuals (S6) · mobile drawer behavior (S7 — desktop-first CSS now, no blockers
left behind) · group-by-folder tree (old sidebar's tree stays untouched in the old shell;
nesting = ⚖1).

## Test plan + review checklist

- Unit: shell-preferences util (defaults, round-trip) · sidebar filter logic · settings
  panel state (stays open on toggle) · view-dispatch of the frame. Run full package suite
  (884 existing must stay green).
- Build `ng-conversations`, `npm run check:ui` for the new CSS (all `--mj-*` tokens, no hex).
- Matt's browser review via `?shell=v2`: default sidebar (established data) · F0 first-run ·
  F0x (toggle off, panel stays open) · settings panel · density variants · open a conversation
  from Recents (chat-area mounts) · light + dark full-page screenshots of each.

## Verification

`cd packages/Angular/Generic/conversations && npm run build && npm run test` green; MJExplorer
dev server picks up the lib via Vite reload; walk `localhost:4201/...Conversations?shell=v2`
per the checklist above. Old shell verified unchanged by loading WITHOUT the param.

## As-built notes (2026-07-23)

- **Frame is NgModule-declared, not standalone** (spec deviation, documented in the component):
  it mounts `mj-conversation-chat-area` + `mj-toast`, which are ConversationsModule
  declarations — a standalone frame importing its own exporting module would be circular.
  Sidebar + Settings panel are standalone per spec.
- **No sidebar row menus** — faithful to the mockup (management lives on W0a, S2); the ledger's
  row-menu MOCKUP row discharges at S2, not here.
- **Quiet dot** wired to the existing `NotificationService.getBadgeConfig(id).show` (dot, never
  a count); rows call `markConversationAsRead` on open. Upgrades to D-S9 when it ships.
- **Dev gate** honors `?shell=v2` in BOTH `applyConfigurationParams` (fresh load) and
  `OnQueryParamsChanged` (cached-tab reattach, per the round-trip rule). Known nuance:
  leaving v2 requires a reload without the param (empty-param deliveries are filtered);
  irrelevant to real users, who never carry the param.
- **Landing = Front Door placeholder** per the shell routing rule; S3 changes content only.
- Verification: ng-conversations + explorer-core build clean · 890/890 tests (6 new) ·
  token + button CSS gates 0 violations · live browser probes green (mount, F0 teach line
  requires empty-project persona — verify in review, F0x toggle w/ panel-stays-open, nav
  restore, 2 real Recents rows, conversation open mounts chat-area, no-param fresh load =
  old shell, 0 console errors).

## Review-round changes (Matt in-browser review, 2026-07-23 — all ratified live)

- Main area moved to `--mj-bg-page` (sidebar on surface, main on page tint — mockup's region
  separation; sidebar/chat surface were indistinguishable).
- New-conversation button → `mjButton variant="primary" size="sm"` (chrome ownership rule);
  only a layout-scoped full-width rule remains in the component.
- **Settings uses the shared `mj-slide-panel`** (viewport overlay above the app header, 360px,
  non-resizable) — RATIFIED over the mockup's under-mock-nav placement: consistency with every
  other Explorer slide-in wins. First bespoke fixed-position attempt sat under the header.
- **`mj-shell-settings-panel` DISSOLVED**: post-slide-panel it was a pure pass-through (6 inputs
  /5 outputs, no logic); content + styles folded into the frame, which binds its own state
  directly. Side effect: resolved a style-delivery bug where the wrapper component's stylesheet
  never registered in the browser. `ShellAppearance` moved to `shell-types.ts`.
- Settings footer: tinted strip (`--mj-bg-surface-card`), firmer border, weight 600, brand icon
  on hover — reads as its own zone.

# SLICE-S2 — W0a Chats surface · spec (2026-07-23)

> Reviewed-before-code per IMPLEMENTATION-PLAN §2b. Direct commits to `conversations-shell`
> after Matt's in-browser review. Builds on S1's frame; replaces the `chats` placeholder pane.

## 1. Ledger rows

Discharges (MOCKUP): group-by/flat toggle · multi-select + bulk Delete(n) w/ partial-failure
report · row menu (Pin/Unpin, Move-to-project, Rename, Delete) — the S1-deferred management
home · drag conversation → group label (project/Ungrouped) · Chats-surface filter · the
"activity is a quiet dot" note · empty + filter-empty states. Carries: quiet-dot rule
(position 9), delete semantics via existing engine/entity paths.

## 2. Mockup references

`functional-mockup-src/app.js`: `renderChatsSurface` (718) — toolbar (`surf-bar`: title,
filter, By-project/Flat seg gated on ShowProjects, Select/Select-all/Delete(n)/Done, New
chat) · grouped mode (Pinned group → per-project groups w/ `grp-lbl` drop targets → Ungrouped)
· flat mode (pinned first, then recents, project dots on rows) · `chatRow` (769: checkbox in
select mode, pin/comment icon, title + quiet dot + description line, relative time, ellipsis
row-menu) · `chatsMatch` filter · empty states (754) + drag hint note (756). Template CSS:
`.surf`, `.surf-bar`, `.sb-search`, `.seg`, `.grp-lbl`, `.surf-list`, `.surf-item` family,
`.rowck`.

## 3. Components / files

- **`mj-shell-chats-surface`** (standalone, `components/shell/shell-chats-surface.component.*`):
  the whole W0a body. Inputs: `Provider`, `EnvironmentId`, `ShowProjects`, `ActiveConversationId`.
  Outputs: `ConversationSelected`, `NewConversationClicked`. Data via `ConversationEngine`
  (same provider-aware getter as the sidebar). Local state: filter, group mode, select mode +
  selection set.
- **Frame**: `chats` view renders the surface instead of the placeholder; wires outputs to the
  existing handlers. Placeholder map loses its `chats` entry.
- **Row menu** (ellipsis → small anchored menu): Pin/Unpin (entity `IsPinned` save — engine
  updates reactively) · Move to project (submenu of projects + Ungrouped — sets `ProjectID`,
  save) · Rename (reuse the conversation-list pattern: `MJDialogService` name+description
  dialog; description feeds agents) · Delete (confirm via `MJConfirmService.ConfirmDelete`,
  then entity delete). Bulk delete: same confirm with count, per-row delete, partial-failure
  toast (reuse conversation-list's report approach).
- **Drag-to-group** (grouped mode only): HTML5 drag on rows, `grp-lbl` headers as drop targets
  (project id / `__none`), sets `ProjectID` + save, drop-hover styling per mockup.

## 4. State/persistence keys

`ShellPreferences` gains `ChatsGroupMode` (`'project' | 'flat'`) → `mj.conversations.chatsGroup.v1`
(default `'project'`; forced flat when ShowProjects is off, per mockup line 734).

## 5. Exclusions (slots reserved)

Unread affordances beyond the quiet dot (D-S9) · Temporary-chat row (P1.6 incognito) ·
per-row share/export (live in the chat header, not the list) · sidebar drag-drop (mockup:
management re-homed HERE; sidebar stays two-path) · nesting semantics (⚖1).

## 6. Test plan + review checklist

- Unit: filter matching (title+description) · grouping partition (pinned/projects/ungrouped;
  flat ordering) · selection set ops (toggle, select-all-visible, clear-on-done) · group-mode
  pref round-trip. Full package suite stays green.
- Gates: build both packages, `check-css-hex-tokens` + btn-override on new CSS.
- Matt's walk (`?shell=v2` → Chats): grouped view w/ real projects · flat toggle · filter ·
  select mode → bulk delete (on disposable conversations) · row menu all four actions ·
  drag a conversation onto a project label and onto Ungrouped · empty-filter state · dark ·
  ShowProjects-off variant (seg hidden, flat forced, dots hidden).

## Tabled during review (2026-07-23)

Matt: standardize icon buttons (`mjButton variant="icon"` EXISTS — bespoke `.iconbtn` duplicates
it here and in conversation-list/chat-area) and build a canonical `mj-menu` in ng-ui-components
(no menu primitive exists; bespoke menu-item menus in conversation-list, collections-full-view,
and this surface). Investigated, deliberately NOT implemented in S2. Natural trigger: before S4
(Room surfaces want the same menus). Tracked in memory: mj-menu-iconbtn-consolidation.

## As-built notes (2026-07-23)

- Faithful to spec: grouped/flat + pref (`mj.conversations.chatsGroup.v1`, forced flat when
  ShowProjects off), filter (name+description), select mode + bulk delete w/ partial-failure
  report, row menu (Pin/Move w/ submenu/Rename/Delete via engine + DialogService patterns),
  drag-to-group with drop-hover, three empty states, quiet-dot rule.
- **Shared-components compliance pass (Matt's all-the-way-down rule, ratified mid-review):**
  Settings toggle → `mj-switch` · Settings selects → `mj-dropdown` · refresh → `mjButton
  secondary` · both filter inputs → shared `.mj-input` (layout-only icon wrappers) · row-menu
  trigger → `mjButton variant="icon"` + ariaLabel (hover-reveal stays as behavior CSS) ·
  **InputDialogComponent fix**: deleted its component-scoped REDEFINITIONS of
  `.mj-input`/`.mj-textarea` (the .mj-btn-override anti-pattern in input form) — all callers
  app-wide now get true shared field chrome. Filter inputs are now 38px (shared standard) vs
  the mockup's 28px pill — accepted; a size variant is a ui-components conversation if wanted.
- Tabled (see section above + memory): `mj-menu` primitive + broad iconbtn migration.
- Verification: build clean · 896/896 (6 new S2 tests: filter/grouping/selection/time-label,
  Object.create pattern w/ seeded EventEmitters) · CSS gates 0 violations · live smoke
  (surface mount, groups, seg, shared controls render).

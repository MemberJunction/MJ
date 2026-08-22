# Explorer Tab/Nav Feedback — Fixes + Option Stock

## Context

Feedback relayed to Matt after a colleague used the new tab work in MJ Explorer (nav
overhaul: PR #3295 + records-arc PR #3444). Four items:

1. Middle-click doesn't close tabs (expected browser behavior).
2. The breadcrumb back-arrow icon does nothing (crumb text segments work fine).
3. The three-dots affordance on tabs makes short tabs hard to click without opening
   the menu or hitting the X.
4. Nothing on a record view says what entity type the record is.

**Matt's decisions (2026-08-20):**
- Item 1: fix it (no design question). Middle-click must NOT close pinned tabs.
- Item 2: **remove the arrow** — it shipped as a decorative glyph with no handler; deleting
  it kills the false affordance. The crumb text remains the back mechanism.
- Items 3 & 4: **no decision yet** — document the options ("stock" them), build nothing.

So this plan **implements items 1 + 2 only** and records the option stock for 3 + 4.

## Root causes (from exploration)

- **Tabs are Golden Layout 2.6.0 native DOM**, not Angular — decorated imperatively by
  `GoldenLayoutManager` (`packages/Angular/Explorer/base-application/src/lib/golden-layout-manager.ts`),
  styled globally by `tab-container.component.css` (ViewEncapsulation.None).
- **Middle-click**: GL's own middle-click-close code listens on `click`; browsers have fired
  `auxclick` for non-primary buttons for years, so it's dead code. MJ adds no `auxclick`
  handling anywhere.
- **Back arrow**: `record-origin-crumb.component.ts:30` renders
  `<i class="fa-solid fa-arrow-left crumb-lead" aria-hidden="true">` — decorative lead-in,
  no click binding, no cursor. No in-app history stack exists; the crumb text calls
  `NavigationService.ReturnToRecordSource`.

## Branch

`tab-ux-feedback-fixes` — created 2026-08-20 from latest `origin/next`, pushed, and
verified tracking `origin/tab-ux-feedback-fixes` (same-named remote, per CLAUDE.md rule 3).

---

## Item 1 — Middle-click closes tabs

Pattern: new subject in the manager (mirrors `tabDoubleClicked`/`tabRightClicked`), routed
by tab-container into the SAME close path as the context-menu close (`manager.RemoveTab` →
GL `container.close()` → `beforeComponentRelease` → `tabClosed$` → `WorkspaceStateManager.CloseTab`),
so component teardown/cache cleanup is never skipped. Do NOT synthesize a click on
`.lm_close_tab` (pinned tabs hide it via CSS but its listener still fires; couples to DOM).

### `packages/Angular/Explorer/base-application/src/lib/golden-layout-manager.ts`

1. Next to the existing subjects (~line 253): `private tabMiddleClicked = new Subject<string>();`
   Public getter `TabMiddleClicked` beside `TabRightClicked` (~line 300).
2. In the `data-events-attached` block (after the `contextmenu` listener, ~line 703), add on
   `tabElement`:
   - `auxclick`: if `e.button === 1` → `e.preventDefault(); e.stopPropagation(); this.tabMiddleClicked.next(state.tabId);`
     (auxclick bubbles from title/slot/pin/close children — closing regardless of target
     inside the tab is the desired browser-like behavior; button guard excludes right-button).
   - `mousedown`: if `e.button === 1` → `e.preventDefault();` — suppresses Chrome/Edge
     middle-click autoscroll over the strip (and Linux middle-paste). Do NOT touch
     `pointerdown` (would break GL's own activation path). A quick middle-click never
     trips GL's drag tracker (needs 10px movement or 1800ms hold) — no drag guard needed.

### `packages/Angular/Explorer/explorer-core/src/lib/shell/components/tabs/tab-container.component.ts`

3. Private helper near `onContextClose` (line ~2533):
   ```ts
   private closeTabFromMiddleClick(tabId: string): void {
     const tab = this.workspaceManager.GetTab(tabId);
     if (!tab || tab.isPinned) return;   // pinned: middle-click is a no-op
     // mirror onContextClose's manager routing (records vs main region), then RemoveTab
   }
   ```
   Mirror `onContextClose`'s actual manager-selection code (lines ~2535-2537) — do NOT
   refactor `onContextClose` to share it (context-menu close IS allowed on pinned tabs;
   the guard differs). Resolve pinned-ness from the workspace manager at event time, never
   from the manager's captured `state` (stale after pin toggles).
4. Subscribe in both wiring blocks:
   - main region (`ngOnInit` subscriptions, after ~line 560)
   - records region (`wireRecordsLayoutEvents`, after ~line 728)
   Closing the last records tab flows through the existing `TabClosed` subscription →
   `backfillEmptyWorkspace()` — no special handling.

---

## Item 2 — Remove the dead back arrow

### `packages/Angular/Explorer/explorer-core/src/lib/shell/components/record-open/record-origin-crumb.component.ts`

1. Delete template line 30 (the `<i ... crumb-lead>` element).
2. Delete the `.crumb-lead` style rule (lines 69–73). Host `gap: 2px` + segment padding
   keep spacing sane; no other spacing edits needed.
3. Test `record-origin-crumb.dom.test.ts` (lines 40–51) asserts only the two `.crumb-seg`
   buttons — stays green. Add one assertion that `.crumb-lead` / `fa-arrow-left` is absent
   so the removal is locked in.

---

## Option stock — Item 3: three-dots / tab hit area (NO decision, NO code)

Current mechanics: one 24×24 `<button.mj-tab-type-slot>` at tab left holds the type icon
AND a `fa-ellipsis`; CSS swaps icon→dots on hover of the WHOLE tab
(`tab-container.component.css:453–469`); clicking the slot opens the tab menu. `.lm_tab`
has no min-width; fixed chrome ≈76px, so a short title leaves ~30px of safe click area.
GL marks the active tab with `lm_active` (already targeted at css:482).

| Variant | Change | Fixes | Cost |
|---|---|---|---|
| **A. Dots on slot hover only** | Pure CSS: swap on `.mj-tab-type-slot:hover` instead of `.lm_tab:hover` (keep focus-visible swap) | The surprise factor | Misclicks remain — slot still opens menu |
| **B. Icon click selects tab** | CSS: delete hover swap. TS in `applyTypeIconSlot` click handler: `e.detail === 0` (keyboard) → menu as today; pointer → activate tab (`containerMap.get(tabId)?.focus()`, same as `FocusTab`) | Misclicks fully (browser model) | Menu loses its visible affordance (right-click only) |
| **C. Tab min-width (~104px)** | CSS: `min-width` on `.lm_tab` + `.lm_title` → `flex: 1 1 auto` so controls stay right-aligned | Short-tab squeeze | Density — fewer tabs before scroll; compatible add-on to any other variant |
| **D. Dots on ACTIVE tab only** | CSS: scope both swaps to `.lm_tab.lm_active`. TS: slot click branches on `tabElement.classList.contains('lm_active')` — active → menu, inactive → activate tab. Keyboard: first Enter activates, second opens menu | Misclicks where they happen (inactive tabs), keeps menu discoverable on the current tab | `aria-haspopup` becomes conditionally accurate (toggle in style pass) |

Planner's recommendation if/when asked: **D**, optionally + C. All variants touch only
`tab-container.component.css` ± `golden-layout-manager.ts` (`applyTypeIconSlot`, 766–827).

---

## Option stock — Item 4: record-type indicator (NO decision, NO code)

Facts: read-mode form toolbar renders zero text (`form-toolbar.component.html:34–239`,
`packages/Angular/Generic/base-forms`); record name appears only in the edit banner
(line 15). `EntityInfo` (`.DisplayNameOrName`, `.Icon`) is already available in the toolbar
component (input line 106 + self-assigned line 247). Shared by ~394 forms — no CodeGen
regen. Overlay/slide-in forms ALREADY title themselves with the entity label
(`base-form-overlay.ts:169–180`); full-page is the inconsistent one.

**Variant A — minimal chip (planner recommendation):** leading pill in the read-mode
toolbar (entity icon + `DisplayNameOrName`), adapting existing `.mj-entity-badge--current`
CSS (form-toolbar.component.css:275–283); new `FormToolbarConfig.ShowEntityTypeBadge`
flag, default true, in all 3 presets (`types/toolbar-config.ts`); guard
`!(ShowEntityHierarchy && IsInHierarchy)` to avoid double-badge with the IS-A block
(html:102–124 — which also has an `MJ: `-prefix bug worth fixing: uses `.Name` not
`DisplayNameOrName`). Edit banner gets the type prefixed ("Editing AI Agent: …").

**Variant B — full title header:** real title row in read mode (record name + type
subtitle). Bigger design move — read mode currently shows no record name either; risks
double-titles with custom-form heroes; overlaps the queued record-pages-chrome-alignment
work. Needs a design pass (mockups) before committing.

**Cheap add-on (either variant):** entity type in the shell tab tooltip. GL's `setTitle`
stomps `element.title`, so it must be (re)applied in `applyTabStyles` — add `typeLabel` to
`TabComponentState`, set `tabElement.title = title — typeLabel` there; tab-container
resolves the label via `EntityByName(config.Entity)?.DisplayNameOrName` alongside its
existing `typeIcon` resolution. (Tab text itself stays record-name-only — tab width
concedes the reporter's point; the at-rest type ICON in the tab already carries some of
this.)

---

## Definition of done (items 1 + 2)

1. **Builds** (dependency order): `cd packages/Angular/Explorer/base-application && pnpm run build`,
   then `cd packages/Angular/Explorer/explorer-core && pnpm run build`. Zero TS errors.
2. **Unit tests**: `pnpm test` in both touched packages. Update/extend
   `record-origin-crumb.dom.test.ts` per item 2. No new GL DOM harness for base-application
   (the Subject/getter is additive; existing tests must stay green).
3. **Integration tier**: `pnpm run test:integration` (deterministic suite) — required by
   repo Definition of Done even for UI-only changes. Report pass/fail/skip counts.
4. **Changeset**: one changeset, `patch`, listing `@memberjunction/ng-base-application`
   and `@memberjunction/ng-explorer-core` (no migrations/metadata → patch per rules).

## Verification (Playwright, `playwright-cli` skill)

Against Matt's running Explorer at localhost:4201 — **never start/restart dev servers**; if
it isn't up or needs a rebuild pickup, surface it and wait (Vite may serve stale dists —
verify the rebuilt package actually loaded).

1. Middle-click a nav tab → closes; workspace persists after reload. Middle-click a record
   tab in the records region → closes, backfill behaves. Middle-click a PINNED tab →
   no-op. Middle-click title, icon slot, and X area of a tab → all close (auxclick
   bubbles). No autoscroll cursor appears over the strip.
2. Left-click behavior unchanged: tab select, dots menu, close X, dblclick pin, right-click
   menu, tab drag-reorder.
3. Open a record from an entity list → crumb bar shows text segments only, no arrow;
   segments still navigate. Light + dark screenshots of the crumb bar area (full page) for
   async review — Matt reviews screenshots BEFORE any commit (standing feedback).
4. No commits without Matt's explicit per-commit instruction.

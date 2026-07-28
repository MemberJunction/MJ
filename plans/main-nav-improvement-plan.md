# Main Navigation Improvement Plan

**Owner:** Matt (design lead) + Claude (implementation)
**Started:** 2026-07-24
**Status:** Phase 1 in progress

The MJ Explorer shell navigation (top bar, app switcher, per-app nav strip, tab system,
mobile drawer) works on solid plumbing but has accumulated real usability and visual
debt. This plan fixes it in phases, one at a time, lowest-risk-highest-impact first.

Full investigation notes: see the audit summary at the bottom of this doc.

---

## Ground rules (apply to every phase)

- **Never modify MJAPI or MJExplorer** — all changes go in `explorer-core`,
  `base-application`, `shared`, or `ng-ui-components` (Amith's architectural rule).
- **Design tokens only** — no hardcoded colors; run `npm run check:ui` before push.
- **Phases 1–3 share one working branch: `main-nav-overhaul`** (Matt's call,
  2026-07-24); phases 4–6 branch separately once unblocked. Branch tracks
  same-named remote.
- **Screenshot review before commit** — full-page screenshots of every changed
  surface, light + dark, presented for Matt's review; commit only on explicit approval.
- Matt owns server lifecycle (never start/restart MJAPI/MJExplorer).
- UX-only PRs → reviewer @rkihm-BC, flag @BarnattW-BC for component-level Angular tests.
- Unit tests for any package touched (`npm run test` in that package).

### Key files (the nav chrome lives here)

| File | Owns |
|---|---|
| `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.{html,css,ts}` | Header bar, pinned app icons, header actions, mobile drawer, overlays |
| `.../shell/components/header/app-nav.component.{html,css,ts}` | Per-app nav pill strip |
| `.../shell/components/header/app-switcher.component.{html,css,ts}` | App switcher dropdown |
| `.../shell/components/tabs/tab-container.component.*` | Golden Layout tab strip |
| `packages/Angular/Explorer/base-application/src/lib/application-manager.ts` | App catalog / active app state |
| `packages/Angular/Explorer/shared/src/lib/navigation.service.ts` | All navigation orchestration |

---

## Decision log

| # | Decision | Status |
|---|---|---|
| D1 | Active-state color = **brand-primary everywhere**; per-app metadata color demoted to identity accent (icon glyph only). Kills red-as-active and the nav rainbow. | ✅ Decided (long-standing unified-brand-color direction) |
| D2 | App switcher becomes a **launcher grid panel** (icon grid + filter input + recents, mini version of the Home app cards) | ✅ Decided 2026-07-24 |
| D3 | Record-open behavior (today: silently reassigns to Home app, source-app context lost). Options: (a) stay in source app, (b) keep Home + breadcrumb, (c) browser-style always-a-tab | ⏳ Matt thinking — blocks Phase 4 |
| D4 | Role of the tab system (today: invisible until shift-click, then duplicates header pills). Options: (a) tabs = opened records only, (b) everything is a tab, (c) minimal/no tabs | ⏳ Matt thinking — blocks Phase 5, informs D3 |
| D5 | Phase order: start with visual unification | ✅ Decided 2026-07-24 |

---

## Phase 1 — Visual unification (ACTIVE)

**Goal:** one coherent active-state language across the whole header, brand-primary
for "you are here," no more red-active, no label wrapping, zero hardcoded colors.

**Branch:** `main-nav-overhaul` (shared with Phases 2–3)

### Scope

1. **Unify the three active-state languages** (today: pinned apps = bottom underline
   bar, switcher items = left color bar, nav pills = tinted background) into ONE
   treatment used by all three surfaces. Proposed: tinted background +
   brand-primary text/icon (the pill treatment, applied consistently).
2. **Brand-primary active states.** Replace `--app-color`-driven active/hover
   tints in `shell.component.css` (`.nav-bar-app-btn`), `app-nav.component.css`
   (`.nav-item.active`), and `app-switcher.component.css` (active item) with
   `--mj-brand-primary` tokens. The app's metadata color remains ONLY as the
   icon glyph accent (identity, not state).
3. **Single-line nav labels.** `white-space: nowrap` on `.nav-item` (fixes
   "Agent Requests" two-line wrap breaking header rhythm).
4. **Token cleanup** (8 hardcoded values found in audit):
   - `app-nav.component.css:40` `color: white` → `var(--mj-text-inverse)`
   - `shell.component.css` lines 289, 343, 347, 472, 1003: `rgba(0,0,0,…)` shadows
     → `--mj-shadow-*` tokens or `color-mix` equivalents
   - `shell.component.css:666` and `:895` scrims → the `color-mix(in srgb,
     var(--mj-text-primary) N%, transparent)` pattern already used at `:1039`/`:1106`
5. **Focus + AT parity while we're in these selectors** (cheap, same files):
   - `:focus-visible` ring on `.nav-item`, `.nav-bar-app-btn`, `.app-switcher-button`,
     `.icon-btn`, `.avatar-btn` (match the existing `.search-btn` ring at css:208)
   - `aria-current` on pinned app buttons (they're the only nav surface not
     exposing active state to screen readers)

### Out of scope for this phase
Overflow behavior, switcher redesign, tab logic, breakpoints — later phases.

### Verification
- Build `@memberjunction/ng-explorer-core`, run its unit tests
- `npm run check:ui` clean
- Full-page screenshots, light + dark: Home, AI app (worst-case red app), an app
  with pinned header icons, switcher open, mobile drawer — presented before commit

---

## Phase 2 — Header overflow + responsive sanity

**Goal:** the header never clips or squeezes content at any width.

**Found in audit:** at ~1180px with the AI app's 8 nav items, the search/bell/chat/
avatar cluster is pushed off-screen with no fallback. Breakpoints disagree (shell
768px vs switcher 600px). Nav items pop in with no skeleton, shifting layout.

### Scope
1. **Priority+ overflow for nav items:** measure available width; items that don't
   fit collapse into a trailing "More" dropdown (`ResizeObserver`-driven; pattern
   candidate for `ng-ui-components` if generalizable).
2. **Align breakpoints** — one shared breakpoint (768px) for shell + switcher.
3. **Nav skeleton** — placeholder pills while `GetNavItems()` resolves, so the
   header doesn't pop/shift on app switch.
4. **Mobile drawer touch targets** to 48px (currently ~40px, below the switcher's own 48px).

---

## Phase 3 — App switcher: launcher grid panel (D2 ✅)

**Goal:** replace the flat 26-item scrolling dropdown with a scannable launcher.

### Scope (design to be mocked before build)
1. Wider anchored panel: **icon grid** of apps (mini Home-card visual language,
   icon + name), with **type-to-filter input** at top and a **Recent** row.
2. Keyboard: arrows navigate grid, Enter opens, filter focused on open, Esc closes.
3. Preserve: per-app loading spinner, "Configure…" entry, `HideNavBarIconWhenActive`
   behavior, access-gate dialog.
4. Recents source: track last-N app switches (UserInfoEngine setting
   `mj.shell.recentApps.v1` — server-persisted per the no-localStorage rule).
5. Mobile: the same panel full-width, 48px targets.
6. Build on `ng-ui-components` primitives where they exist; no bespoke controls.

Design gate: 2–3 mockup variants → Matt picks → build.

---

## Phase 4 — Record-open context (D3 ✅ DECIDED 2026-07-27: "records style")

**Problem (historical):** opening a record from inside an app silently reassigned
you to the Home app. Header nav flipped, source context vanished, no way back.

**Decision:** after prototyping (a), (b), and (c) live, Matt landed on a synthesis —
**records are their own global surface**. Shipped on branch `record-open-context`
(`b2a2a690f5`), gated by instance config `Shell.RecordOpen.Style`
('records' default | 'classic' escape hatch):

- Record opens stay in the active app (no Home reassignment, no nav flip),
  always as a tab; re-open focuses the existing tab (browser-style dedup).
- Records live in a **separate Golden Layout region** in the tab container
  (own tab strip, native close/drag-split, own `recordsLayout` persistence
  slot), visible only while a record is being viewed. The main tab bar never
  contains records (`WorkspaceStateManager.MainLayoutTabFilter`).
- A count-badged **Records pill** in the app-nav's trailing slot resumes the
  last-viewed record from anywhere (+ standalone header fallback and a
  mobile-drawer entry for reachability). Invariant: any open record is ≤2
  clicks away from anywhere.
- Home's dynamic orphan nav items are skipped under records style.

Independently audited (3 agents: best-practices / downstream-compat / GL
correctness); all findings remediated in the same commit.

**Phase 4 follow-ups (open):**
- Mobile records UX: drawer entry is a minimal treatment — needs a real
  design pass.
- Release note: one-time saved-main-layout reset on first boot when an
  existing workspace contains record tabs.
- **Slide-panel punch-through (FIXED 2026-07-28):** overlays whose show-state
  class was named `visible` collided with explorer-app's global
  `.visible { visibility: visible !important }` utility and punched through
  the records region's visibility-hidden main area (bespoke AI detail panels
  stayed painted over open records; also stale-open on return). Fixes: the
  region-hidden rule now force-hides descendants
  (`.region-hidden, .region-hidden * { visibility: hidden !important }`);
  `mj-slide-panel`'s own state class renamed `visible` → `sp-open` (it had
  the same collision); all four bespoke AI detail panels (Agents, Models,
  System Config, Prompts) MIGRATED onto `mj-slide-panel`; Open Full Record
  now closes the panel (execution-monitor precedent, Matt's ruling).
  **QUEUED follow-up:** audit/scope the global `.visible !important` utility
  itself (`explorer-app/src/lib/styles/_utilities.scss:425`) — it remains a
  repo-wide name-collision landmine for any component state class.
- **lm_tab redesign (QUEUED — own branch, Matt 2026-07-27):** GL tab chrome
  is now a primary surface but still pre-Phase-1 design. Current state:
  `tab-container.component.css:204-345` (!important overrides of GL stock) —
  raised-card active tab (borders/rounded top/-1px margin trick), 3px
  app-color left-edge bar with glow on active (the app-color-as-state +
  left-bar pattern Phase 1 killed elsewhere), 35px/13px density, hover-X
  error-red. Italic-title (unpinned) + thumbtack pin are INLINE styles
  injected from `golden-layout-manager.ts` `applyTabStyles` — the redesign
  must include that JS, not just CSS. Open design axes (Matt to pick,
  side-by-side mockups like the launcher round): active-state language
  (brand-tint pill recipe vs refined raised-card vs underline), app color
  (drop / identity dot / keep bar), density (35px vs nav-pill height),
  pinned/temp vocabulary (italic+pin is invisible vocabulary).

---

## Phase 5 — Tabs vs pills mental model (BLOCKED on D4)

**Problem:** tab bar is invisible until a second tab exists; the only way to get one
is undocumented shift-click; once visible, tabs duplicate the header nav (same
"Prompts" as active pill AND italic preview tab).

Options under consideration (Matt deciding):
- **(a) Tabs = opened records only** — pills are pure navigation and never appear
  as tabs; tab bar appears only when a record/resource is open.
- **(b) Everything is a tab** — always-visible tab bar, pills focus their tab.
- **(c) Minimal tabs** — single-document flow, rely on back/recents/pins.

Whatever the call: the new-tab affordance must become discoverable (context menu
"Open in new tab", middle-click support, tooltip for shift-click).

---

## Phase 6 — Polish + a11y sweep

Grab-bag of confirmed issues not covered above:
1. **Escape doesn't close** the record slide-in panel (verified live).
2. **Mobile drawer focus trap** + keyboard-dismissible scrim.
3. **Icon audit:** `fa-grid-2` (FA Pro-only) renders nothing — AI app "Overview"
  nav item has no icon on desktop or mobile. Sweep all `DefaultNavItems` metadata
  icons against the free FA set (same bug family as the fixed Configuration
  view-toggle icon).
4. **NG0100 `ExpressionChangedAfterItHasBeenCheckedError`** storm during navigation
   (hundreds of dev-mode console errors; previous value '21' — likely a badge/count
   binding). Diagnose and fix with `ChangeDetectorRef` per repo convention.
5. User menu shows name and email as the same string twice when DisplayName is unset.
6. Loading-screen "Taking longer than expected" flow — verify it still resets cleanly.

---

## Audit summary (2026-07-24, for reference)

- Shell = single 60px top bar in `ShellComponent`; no sidebar. Apps + nav items are
  metadata (`MJ: Applications`.`DefaultNavItems` JSON); 26 active apps, 8 default
  for new users. User-level app install/hide/reorder via `MJ: User Applications`.
- Navigation is workspace-first: NavigationService → WorkspaceStateManager (tabs,
  server-persisted per user in `MJ: Workspaces`) → shell syncs URL. Deep links,
  back/forward, component caching all verified working.
- ⌘K omnibar (global search, `#` records, `/` apps, `@` agents, recents) is the
  strongest existing asset.
- Verified issues: Home-teleport on record open; flat 26-app switcher; red active
  pill in AI app (app color = active color); "Agent Requests" label wrap; header
  clipping at ~1180px; invisible tab system + shift-click secret + duplicate
  pill/tab; fa-grid-2 icon silently missing; Escape not closing slide-in; 8
  hardcoded rgba/white values in nav CSS; 3 different active-state treatments;
  focus rings only on search; pinned apps missing `aria-current`; breakpoint
  mismatch 768/600; no nav skeleton; drawer touch targets ~40px; NG0100 storm.
- Light mode: header chrome intentionally stays dark while content goes light —
  keep as-is unless Matt says otherwise.

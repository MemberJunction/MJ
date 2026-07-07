# Omnibar Command Palette — UX Review Feedback

**Reviewer:** Matt Chriest (design lead) · **Date:** 2026-07-07 · **Branch:** `omnibar-command-palette`

First hands-on design review of the Ctrl+K omnibar. Items are numbered in the order raised.
Status: `open` = not yet addressed · `deferred` = consciously out of scope for this PR · `decided` = design decision recorded, no code change.

---

## 1. Platform-aware shortcut label — `open`

The UI hardcodes "Ctrl+K" everywhere. On macOS the convention is **⌘K**.

- The **keybinding already works** on Mac — the handler checks `isMac ? event.metaKey : event.ctrlKey` (`shell.component.ts`). This is verbiage only.
- Three display sites hardcode the string:
  1. Header affordance `<kbd>` chip — `shell.component.html` (~line 56)
  2. Its tooltip "Search everything (Ctrl+K)" — `shell.component.html` (~line 53)
  3. My Profile → Command Palette hint — `profile-dialog.component.ts` (~line 127)
- **Fix direction:** one platform-aware `ShortcutLabel` getter, consumed by all three sites. Render `⌘K` on Mac, `Ctrl+K` elsewhere (same pattern as VS Code / Slack / Linear).

## 2. Keyboard/tab accessibility through the suggestion list — `open`

Tabbing into the omnibar stops at the "Talk to an Agent" chip and cannot reach the suggestion rows. Accessibility concern.

- Current state: ArrowUp/ArrowDown **do** move the highlight (standard combobox model, focus stays in the input). Tab is unhandled — native browser tabbing walks the mode chips and dead-ends because suggestion rows aren't focusable.
- ARIA is half-done: `role="dialog"` + `aria-modal` exist, but no `role="listbox"` / `role="option"`, no `aria-activedescendant`, so assistive tech can't announce the highlighted row.
- **Fix direction:** full WAI-ARIA combobox pattern — focus pinned to input, Tab either mirrors ArrowDown or cycles the dialog's real controls, listbox/option roles + `aria-activedescendant` (rows need DOM ids — shared prerequisite with item 6), Esc closes and restores focus.
- Files: `omnibar-palette.component.{ts,html,css}`.

## 3. Not mobile friendly — `open` (noted; presentation decision deferred)

Once opted in, the omnibar is the default search on every device. The palette has **zero media queries**: fixed panel at `top: 96px`, `esc` kbd hint, `mouseenter` row selection, keyboard-shortcut affordance chip, and the trigger-char model assumes a physical keyboard.

Two possible directions (decision deferred, noted for later):
- **(a) Device gate:** small viewports keep the legacy search even when opted in. Cheap stopgap; forks the experience.
- **(b) Mobile-first palette:** same palette presented as a full-screen / bottom sheet on small viewports (consistent with the dashboard-mobile filter-sheet conventions), touch-sized rows, tappable mode chips instead of typed trigger chars, kbd hints hidden.

Interacts with item 7 — an icon-only header affordance is also the right mobile header treatment.

## 4. `#` empty state shows nothing — reads as broken — `open`

Typing `#` alone renders an empty panel. The provider deliberately returns `[]` for empty queries (avoiding a ~375-entity dump) but — unlike `@` (full agent list) and `/` (recent apps) — `OmnibarRecordProvider` has no `EmptyStateSuggestions` override. To a user this reads as "no results / broken."

- **Fix direction:** real empty state — recently opened records and/or most-used entities, plus a syntax-hint row teaching the two-phase pattern (`#accounts acme` → entity, then record term). At minimum, never a bare empty panel for a just-activated mode.
- File: `providers/omnibar-record.provider.ts` (+ empty-state rendering in `omnibar-palette.component.html`).

## 5. "Commands" label is misleading — `open`

The `/` mode is labeled **Commands** but only navigates (switch apps, jump to nav items) — it executes nothing. The label sets a verb expectation; the design reviewer couldn't tell what the mode was for. Rename to match behavior — candidates: "Go to App" / "Navigate" / "Apps & Pages" (final label: Matt's call).

- Touch points: `OmnibarCommandProvider.ModeLabel` + `Placeholder`, the empty-state hint chip, doc references.
- Future note: if the mode later grows real executable commands (MJ Actions would be the natural backing), revisit the name then — don't ship a mislabel now.

## 6. Arrow-key selection doesn't scroll the list — `open`

When suggestions overflow the scrollable body, ArrowDown moves the highlight out of view — the list doesn't follow.

- **Fix direction:** `scrollIntoView({ block: 'nearest' })` on the selected row after keyboard-driven selection changes. Mouse-driven (`mouseenter`) selection must NOT auto-scroll (it would fight the pointer). Implement together with item 2 — both need per-row DOM ids.

## 7. Header redesign: search collapses to an icon; both experiences open as overlays — `open` (design direction)

The header hosts a full search input bar that consumes real estate — yet with omnibar enabled, interacting with it just opens the palette dialog anyway. Direction:

1. Reduce the header search affordance to an **icon button toward the right side of the header** (tooltip carries the platform-aware shortcut from item 1).
2. Omnibar enabled → icon opens the palette (as today).
3. Omnibar **not** enabled → the legacy/default search **also opens in a similar dialog** instead of living inline in the header.

Net effect: the header layout is stable regardless of opt-in — the toggle changes *what the overlay is*, not the chrome. Frees real estate for everyone; also the right mobile treatment (item 3). The meatier half is re-housing the legacy search composite into a dialog presentation.

## 8. Recent searches don't appear after searching — `open` (bug, two-part root cause identified)

Search something, reopen the palette: the recent area doesn't show it. Investigation found two stacked causes:

1. **Persisted recents never load when omnibar is on.** `SearchService.LoadRecentSearches()` is only called by the legacy search composite's init. With omnibar enabled that composite never renders, so the persisted list (UserInfoEngine) never loads into `RecentSearches$` — prior-session recents are invisible. Fix: palette calls `LoadRecentSearches()` itself.
2. **Recording is indirect.** `addToRecentSearches()` only fires inside `SearchService.Search()` (i.e., when a full search actually executes on the results page). Palette interactions that navigate directly (record/app/agent rows) record nothing. Consider recording the query at palette `Execute()` time.

Also note the display cap: palette shows top **3** recents, default mode empty state only — a design knob to revisit.
Files: `omnibar-palette.component.ts` (`loadRecents` / `Execute`), `packages/Angular/Generic/search/src/lib/search.service.ts` (~362–400).

---

## Decisions recorded (no code change)

- **Palette stays its own surface — not rebased on `mj-dialog`.** A command palette is a top-anchored, chromeless, keyboard-transient overlay; `mj-dialog` is a titled task container. Rebasing would inherit overrides, not behavior, and the dialog's focus trap conflicts with the combobox model item 2 needs. The palette already uses `--mj-*` tokens throughout, so visual/theming consistency doesn't require it. (Follow-up ideas noted but not tracked: shared z-index layering scale — palette 1400/1401 vs dialog 1000 vs service dialogs 20000 — and a headless overlay primitive.)

## Review clarifications (context for future readers)

- **`#` Jump to Record** = open a specific record from anywhere: entity-name matches first (Enter = entity's list view), then top records of the best-matching entity by name (`#accounts acme` → the Acme record). Fails soft on permissions.
- **`/` Commands** = app/page navigation only (absorbed the old Ctrl+/ app palette): apps by recency/fuzzy match, strong matches surface their nav items. Executes nothing — hence item 5.

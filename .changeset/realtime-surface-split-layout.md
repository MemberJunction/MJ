---
"@memberjunction/ng-conversations": minor
---

Realtime surface panel: a declared layout mode, so a host can show two surfaces at once (#3535)

`RealtimeSurfaceTabsComponent` showed exactly one surface at a time, and there was no way to ask
it for more — so a side-by-side arrangement had to be imposed from outside, which silently lost a
specificity tie: the panel's own `.surface { display: flex }` carries the same specificity as a
host's `.surface.my-split { display: grid }` and wins on document order, so `grid-template-columns`
computed correctly and was ignored. Two debugging sessions were lost to that, once with CSS grid
and once with Golden Layout laying its whole tree into a 0px-tall container while reporting no
error.

- **`[Layout]="'tabs' | 'split'"` + `[SplitKeys]`** on `mj-realtime-surface-tabs` (and
  `[SurfaceLayout]` / `[SurfaceSplitKeys]` on `mj-realtime-session-overlay`, which hosts it).
  `'tabs'` is the default and is unchanged — existing callers bind nothing and get today's panel.
  `'split'` arranges the named surfaces side by side with draggable splitters (Golden Layout),
  and shows every open surface when no keys are named.
- **Panes are never re-created by a layout switch.** Golden Layout runs in VIRTUAL component mode:
  the panes stay exactly where they are in the panel's template and only get positioned, so a
  whiteboard's drawing and a remote browser's page survive switching in and out of a split.
  Inline positioning is also what makes the mode declarable — it outranks every stylesheet, so
  nobody has to win a specificity tie to arrange this panel.
- **The zero-size trap fails loudly now.** The split waits (capped) for its container to report a
  real size before Golden Layout ever sees it, re-checks afterwards that every pane actually
  received area, and on any failure logs with context and degrades to the tabs layout instead of
  leaving a blank panel. It also degrades when fewer than two of the requested surfaces are open.
- **Panes carry `data-channel`** (the issue's secondary ask), so a host — and the split itself —
  addresses a pane by its channel rather than by index into the tab list.
- The structural Golden Layout rules the arrangement depends on are injected (scoped to the
  layout host), so a host that never imported `goldenlayout-base.css` gets a real split rather
  than two silently stacked surfaces.

Geometry is verified in a real browser by `npm run verify:split-layout` in the package — jsdom has
no layout engine, so the unit specs fake Golden Layout and that script proves the part a fake
cannot.

---
"@memberjunction/ng-base-forms": patch
---

Left-nav record forms: render the **Details** rail item's field panels as one card instead of loose label/value rows floating on the page background. The left-nav "no accordion chrome" rules were written for a single related grid (the rail label is its header); Details shows every field panel under one rail item, so the container now tags them `mj-chrome-details` (+ `-first` / `-last` on the visual edges, following section display order) and the CSS draws them as segments of a single surface with no per-section headers.

Also: the left-nav rail's items now scroll on their own when a form has more rail items than fit the viewport (they sit in a `.mj-forms-chrome-rail-items` wrapper with `overflow-y: auto`); before, the overflow was clipped by the panels container and the bottom items were unreachable. The pin / collapse toolbar above them stays fixed.

---
"@memberjunction/ng-base-forms": patch
---

Left-nav record forms: render the **Details** rail item's field panels as one card instead of loose label/value rows floating on the page background. The left-nav "no accordion chrome" rules were written for a single related grid (the rail label is its header); Details shows every field panel under one rail item, so the container now tags them `mj-chrome-details` (+ `-first` / `-last` on the visual edges, following section display order) and the CSS draws them as segments of a single surface with no per-section headers.

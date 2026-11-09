---
"@memberjunction/ng-whiteboard": patch
---

Whiteboard item `Color` must be a hex color (`#rgb` / `#rrggbb`). Loading a saved board drops any other `Color` (ink falls back to the first pen color), and the HTML and SVG exports write only hex colors. `WHITEBOARD_PEN_COLORS` now lives in `whiteboard-state.ts` (still exported from the package).

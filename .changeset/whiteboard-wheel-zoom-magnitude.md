---
"@memberjunction/ng-whiteboard": patch
---

Trackpad zoom on the whiteboard now tracks the gesture. `OnWheel` read only the sign of `deltaY` and applied a fixed 10% step per event, so a macOS pinch (ctrl+wheel with small fractional deltas at the trackpad's sample rate) zoomed by event COUNT, not finger distance: about nine samples saturated the 25%–200% range, which is the "way too fast and abrupt, hard to fine-tune" report.

- **Magnitude-scaled factor.** The zoom factor is `exp(-delta * k)` with the delta capped at 50px per event and `k` tuned so one mouse notch is still exactly the familiar 10% step. A 5px trackpad sample moves ~1%, and ten small samples land where one sample of their sum lands.
- **`deltaMode` normalized.** Line and page deltas (Firefox mouse wheels) convert to pixels first instead of reading as a few pixels.
- **Only `ctrlKey` zooms.** `metaKey` used to zoom too, so Cmd+two-finger scroll zoomed and macOS momentum kept it zooming after the fingers lifted. Cmd-scroll now pans like a plain scroll.
- **Stepped zoom eases.** The zoom cluster's +/− buttons jump between presets (11%, then 25%, then 33%); the viewport now carries a 180ms transform transition for that button path only, honoring `prefers-reduced-motion`. The wheel and the hold-to-zoom tick path stay un-transitioned, since a transition on a continuous gesture lags it. New public `ViewportStepping` flag and `ZOOM_STEP_TRANSITION_MS` export on the board component.
- **Board CSS is token-clean.** The six hardcoded colors the hex gate flagged on first touch (sticky paper gradients, sticky ink, the Sage cursor ink, the text-label shadow, the widget frame's fixed white) now derive from the `--mj-color-warning-*` ramp, the neutral ramp, and the board's `--sage` accent, so re-tinting the agent accent re-tints its notes. No visual change intended.

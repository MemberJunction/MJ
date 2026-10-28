---
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
---

Realtime channel surfaces can go picture-in-picture. "Move to…" gains "Picture-in-picture": the surface floats in a box over the call that the user drags by its bar, resizes from its corner, or moves with the arrow keys (Shift and the arrow keys resize it). Boxes stack upward from the bottom-right corner, newest in the corner, until moved; the one touched last floats highest. A box's bar carries the same "Move to…" menu, and its channel's tab says where it went, with "Bring it here".

`mj-media-stage` adds the `pip` placement, `PipRects` (where the user put each box, as fractions of the stage), `PipRectChange`, and an `mjMediaStagePipActions` template for the bar's buttons; `MediaStageSurface` gains `Label` and `PipIndex`. The geometry helpers (`DefaultPipBox`, `ClampPipBox`, `MovePipBox`, `ResizePipBox`, `PipBoxToRect`, `PipRectToBox`) are exported. The overlay saves each box per user under `mj.realtime.pip.v1`, and "Reset layout" puts every box back in its corner.

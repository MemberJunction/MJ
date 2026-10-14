---
"@memberjunction/ng-whiteboard": patch
---

Whiteboard: a resize gesture that doesn't move a markdown panel's top or bottom edge no longer changes its max-height cap. A click on a handle (including the pixel of travel a real mouse or trackpad adds, under the same 3px threshold as a move) commits nothing, and a corner dragged only sideways changes the width but keeps the cap. Before, both lowered the cap to the text's current height, so the agent's next, longer answer clipped there.

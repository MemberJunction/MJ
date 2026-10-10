---
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
---

The realtime call overlay's controls are now the design system's. In all three of the composer's layouts (the lean dock, the labelled phone-call strip and the fused dock), the microphone is `mj-media-controls`, the call controls the LiveKit room uses, and Captions, Details, Type, the "•••" overflow, hide and End are `mjButton` circles: 52 px in the strip and for the lean dock's microphone and End, 44 px for the lean dock's other controls, 32 px in the fused dock. Captions and Details use the button's own toggle (`Toggleable` / `Selected`, which sets `aria-pressed`). A muted microphone now reads red, as in the room, where it was amber. `mj-media-controls` gains `Size` (its circles' size; the Share arrow stays small) and `ShowLabels` (a short label under each control, which the strip uses).

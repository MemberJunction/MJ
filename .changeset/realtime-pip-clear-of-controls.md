---
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
---

A call's picture-in-picture boxes (the camera, a shared screen) start clear of the call's controls. The call overlay's stage paints over the whole call, controls included, and a box the user has not moved started in the stage's bottom-right corner, so with no side panel open the camera's box covered End call and the controls beside it until the user moved it. `mj-media-stage` gains `PipKeepClear`, an element along the stage's foot that the default boxes start clear of: while the box in the corner would cover any of it, the boxes stack upward from just above it. `DefaultPipBox` takes that element's box as an optional third argument. The call overlay wraps the "Agent can see" chip, the channel strip and the composer in `.call-controls` and passes it to the stage. A box the user moved keeps its saved place, and with the side panel open beside the controls the box keeps its corner over the panel.

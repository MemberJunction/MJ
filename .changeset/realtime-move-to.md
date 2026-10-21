---
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-whiteboard": patch
---

The realtime overlay's channel surfaces can be moved. "Move to…", beside the active channel tab (and in the call pill while a surface is on the stage), puts a surface on the stage, back on its tab, or out of sight, and "Reset layout" puts every surface back. A surface on the stage is the focus layout: the call column folds away and the pill appears. A channel whose surface is elsewhere says where in its tab, with "Bring it here". Moves are saved per user (`mj.realtime.placement.v1`, through `UserInfoEngine`) and carry over to later sessions.

`BaseRealtimeChannelClient` gains an optional `OnSurfacePlacementChange(placement)` hook, called right after `BindSurface` with the surface's placement and then on every move. `mj-media-stage` gives each surface's template its `Placement`, and `mj-realtime-channel-pane` passes it on. The whiteboard's header button becomes "Move to stage", or "Back to tab" while the board is on the stage, kept true by the new hook.

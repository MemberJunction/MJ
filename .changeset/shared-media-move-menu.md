---
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
---

The "Move to…" menu moves into `@memberjunction/ng-realtime-media` as `mj-media-move-menu` (`MediaMoveMenuComponent`, with `MediaMoveRequest` and `MEDIA_MOVE_LABELS`), so the realtime call and the meeting room share one menu. It lists the places a surface may go (stage, picture-in-picture, tab, hidden), the current one disabled, then "Reset layout"; a host can name its places with `Labels` (the room will call the stage "Spotlight"), and each place keeps its icon. The call overlay and its tab strip use it, with no visible change. `mj-realtime-surface-move-menu` (`RealtimeSurfaceMoveMenuComponent`) and `RealtimeSurfaceMove` in `@memberjunction/ng-conversations` are deprecated; the component is now a wrapper around the shared menu with the same inputs and outputs.

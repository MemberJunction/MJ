---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-livekit-room": patch
---

Meeting tiles can go into picture-in-picture boxes. Every tile's "Move to…" menu offers Picture-in-picture (the participant the call put in the spotlight is offered the spotlight and a box); a box floats over the stage, the whiteboard included, through `mj-media-stage`, and its bar carries the participant's menu. Someone in a box is not shown again: they leave the filmstrip and the grid, and are not the speaker pane in split view, though their shared screen still shows. Without pinning, the menus offer the strip and a box. A host turning the self-view off takes the user's box away until it is back on.

The shared media stage (`LayoutMediaStage`) no longer picks for the spotlight a participant already shown in a picture-in-picture box; the next in line takes it. `mj-media-tile`'s minimum height reads `--mj-media-tile-min-height` (120px by default), so a host can let a tile shrink into a small box.

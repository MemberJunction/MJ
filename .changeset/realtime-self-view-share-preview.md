---
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-livekit-room": patch
"@memberjunction/livekit-room-core": patch
"@memberjunction/ai-realtime-client": patch
---

`mj-self-view` (ng-realtime-media) is the user's own tile, as `mj-media-tile` draws it with the camera mirrored, with an "Agent can see this" badge while the host says frames reach an agent, and a Hide button (`HideRequested`). `mj-share-preview` shows what the user shares, whole and not mirrored, labelled by the kind of surface ("Sharing a window"), with Stop sharing and Change (`StopRequested`, `ChangeRequested`). `mj-media-tile` gains `Mirror`, which mirrors the camera only.

The LiveKit room draws the user's own tile with them in every layout: their self-view, or their share preview while they share. Hide (in the grid and filmstrip) leaves a "Self-view hidden · Show" chip in the stage's top-left corner for the session; the camera stays on. Your own tile no longer has a pin button. `LiveKitRoomController.ChangeScreenShare(preferredSurface?)` stops a share and asks the browser's picker again, and `LiveKitLocalMediaState.ScreenShareSurface` says what is shared. `/media` exports `CapturedSurfaceOf(track)`, which reads the kind of surface from any captured display track.

---
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-livekit-room": patch
"@memberjunction/livekit-room-core": patch
"@memberjunction/ng-ui-components": patch
---

`mj-media-controls` (ng-realtime-media) is a call's microphone, camera and Share buttons, drawn as round `mjButton`s. Share is a split button: its main part asks the browser's picker with no preference, or stops sharing; its arrow opens a menu that asks for an entire screen, a window or a browser tab first and, when the host lists `SharePanels`, offers "This panel" with one of them. The arrow hides while the user shares. It emits `MicrophoneToggled`, `CameraToggled`, `ShareRequested` (`MediaShareRequest`) and `StopShareRequested`.

The LiveKit room's control bar renders it for its media buttons, and its other buttons become round `mjButton`s. The bar gains `EnableShareMenu` (off by default) and `ScreenShareRequested`; the room turns the menu on and starts the share with `LiveKitRoomController.SetScreenShareEnabled(true, surface)`, which now takes the kind of surface to offer first and passes it to LiveKit as `displaySurface` (`ToScreenShareCaptureOptions`). The chat and participants buttons are named with the counts their badges show.

`mj-menu-item` shows an arrow after its label when it opens a submenu.

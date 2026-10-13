---
"@memberjunction/ng-mj-livekit-room": patch
"@memberjunction/ng-explorer-core": patch
---

Meet's landing offers a "Preview room" to holders of the `Realtime: Advanced Session Controls` authorization: the meeting room with your camera and microphone and simulated people, and no LiveKit server. `mj-livekit-agent-room` takes `Mode="preview"`: nothing is minted and no agent session starts, the room runs on `LiveKitPreviewRoomController` (on the camera and microphone `LOCAL_MEDIA_CONTROLLER_FACTORY` provides), recording is off, and the preview saves its layout per user under its own keys (`LIVEKIT_PREVIEW_PLACEMENT_PREF_KEY`, `LIVEKIT_PREVIEW_PIP_PREF_KEY`), apart from meetings'. In the other modes the room's controller still comes from `LIVEKIT_ROOM_CONTROLLER_FACTORY` as provided above the binding.

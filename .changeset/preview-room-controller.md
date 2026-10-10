---
"@memberjunction/livekit-room-core": patch
---

`LiveKitPreviewRoomController` is a meeting-room controller that needs no LiveKit server, for trying the room UI: `mj-livekit-room` runs on it through `LIVEKIT_ROOM_CONTROLLER_FACTORY`. Your camera, microphone and screen share are real (the camera and microphone on the shared `MediaPreview`, the share through the browser's picker); the other people are simulated (by default an agent and three participants, `LIVEKIT_PREVIEW_PEOPLE`) and take turns speaking. Nothing is sent anywhere. A participant view can now carry media from outside LiveKit (`LiveKitParticipantView.Media`), which `ToMediaParticipant` shows in place of the participant's LiveKit tracks and level; `ToMediaDeviceKind` maps a LiveKit device kind to a `/media` one.

---
"@memberjunction/ng-livekit-room": patch
"@memberjunction/ng-realtime-media": patch
"@memberjunction/livekit-room-core": patch
---

The meeting room's lobby runs on the shared `MediaPreview` and renders `mj-camera-check` itself, instead of the deprecated `mj-livekit-prejoin` wrapper and its `LiveKitMediaPreview`. The lobby starts the microphone and camera as the room's `StartWithMicrophone` and `StartWithCamera` say (the wrapper always started the microphone), lets the user pick devices, frees them before the room connects with the name and devices chosen, and frees them if the room goes away first. `LOCAL_MEDIA_CONTROLLER_FACTORY` in `@memberjunction/ng-realtime-media` makes the camera-and-microphone controller a component runs on (the browser's `LocalMediaController` by default; a test provides a fake). `LiveKitMediaPreview` in `@memberjunction/livekit-room-core` is deprecated in favor of `MediaPreview`; `mj-livekit-prejoin` stays exported, deprecated.

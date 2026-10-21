---
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-livekit-room": patch
---

`mj-camera-check` (ng-realtime-media) is a look at the camera and a listen to the microphone before anything is shared: the camera mirrored, a level meter, the microphone and camera buttons of `mj-media-controls`, microphone and camera pickers, an optional name, and a confirm button that emits `Confirmed` with the choices (`MediaCameraCheckChoices`). It is presentational: the host runs the preview, passing the camera as `CameraSource` and the level as `MicrophoneLevel`, and starts, stops or switches devices on `MicrophoneToggled`, `CameraToggled` and `DeviceSelected`.

`mj-livekit-prejoin` is now a deprecated wrapper: it runs `LiveKitMediaPreview` and renders `mj-camera-check`, with the same inputs and `Join` output. Its text now follows the theme (it was white on the light page), its meter is the shared `mj-audio-meter`, and `MicLevelPct` reads the level on demand instead of being updated on every animation frame.

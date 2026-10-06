---
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-conversations": patch
---

`RealtimeSessionRuntime` can show the agent the user's camera and a shared screen: `StartCamera(deviceId?)`, `StopCamera()`, `StartScreenShare(options?)` and `StopScreenShare()`, with both reported on `Captures$` (off, starting, on with the stream to show the user, or failed with the reason and a message). A start first makes sure the model takes video, adding the inbound video track only now (`AddTrack`), so a session is not limited or billed for video before anyone shares; then it opens the camera through the host's `ILocalMediaController`, or asks for a screen, window or tab through the host's new optional `IRealtimeMediaHost.RequestDisplayCapture`. The capture becomes a source of the video source arbiter, sampled at the negotiated rate. Stopping undoes it all, and removes the track again when the runtime added it and nothing else is captured; a camera that goes away or a share ended from the browser's bar stops the same way, and the session's end stops both. The browser host implements `RequestDisplayCapture`. No UI uses this yet.

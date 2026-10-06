---
"@memberjunction/ai-realtime-client": patch
---

Adds `FrameSampler` to `@memberjunction/ai-realtime-client/media`. It samples any `MediaStream` at the rate the caller passes, with no 1 fps ceiling, and can cap the frame size with `MaxDimension`. `CreateStreamFrameCapture` is deprecated and now wraps it; it no longer caps `Rate` at 1 fps. The camera and screen capture helpers no longer cap the device's frame rate at 1 fps, so a self-view of their stream plays smoothly while the model still receives frames at the requested rate. `GeminiRealtimeClient` samples the camera passed to `Connect` at the negotiated rate and feeds it through the session's `VideoSourceArbiter` as a camera source instead of writing frames directly.

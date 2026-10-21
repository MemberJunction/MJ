---
"@memberjunction/ai-realtime-client": patch
---

`BaseRealtimeClient.AddTrack(descriptor)` adds a track to a running session, such as inbound video when the user starts their camera, resolved against what the driver supported at connect: the track is `'live'`, or `'unsupported'` with the reason (the model takes no such track, or no more inbound video streams, counting the live ones). A live track added again is returned as it is, and other tracks keep their ids. `RemoveTrack(descriptor)` reports a track `'ended'` and drops it; audio cannot be removed. Gemini Live needs nothing more: it accepts video frames without a setup change, so frames flow as soon as the track is live.

`OnRemoteVideo` now hands over a `MediaVideoSource` (a stream, or a player that owns the `<video>` element, such as MSE playout of avatar video) instead of a `MediaStream`; `emitRemoteVideo` still takes a plain stream and wraps it. No driver emits remote video yet.

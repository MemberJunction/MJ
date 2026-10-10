---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/realtime-runtime": patch
---

The user can pick which video source the agent sees. `RealtimeSessionRuntime.SelectVideoSource(sourceId)` makes a source the user's pick, which beats every other rule of the session's video source arbiter (a camera or screen share the user started, the surface in view); `SelectVideoSource(null)` lets the call decide again. Each source on `VideoSources$` carries `Picked: true` while it is the pick; the arbiter clears the pick when its source is turned off or leaves.

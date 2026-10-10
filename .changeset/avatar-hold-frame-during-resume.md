---
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
---

The agent's video holds its last frame while a call resumes on a new connection, for up to 5 s, instead of giving way to the orb after a second (#5357). On Gemini Enterprise (Vertex AI) new video comes about 3 s after each move (Google's `goAway`, about every 9 minutes, and any dropped socket), so the avatar's tile showed the orb for about 2 s each time, as if the agent had left. `RealtimeSessionRuntime.Resuming$`, also on `RealtimeChannelContext`, is `true` from a `'connecting'` the driver reports while the call is live until the call is live again, fails or ends; a call's first connect is not a resume. `mj-media-tile` takes `HoldLastFrame`, which keeps the frame on show through a stall, and emits `FramesFlowingChange` when the video's frames stop or come back. The Avatar channel's surface holds from a resume's start until new frames come, `AGENT_VIDEO_RESUME_HOLD_MS` (5 s) pass, or the call fails or ends; the orb then shows if the video is still out of frames. A stall outside a resume still shows the orb after about a second.

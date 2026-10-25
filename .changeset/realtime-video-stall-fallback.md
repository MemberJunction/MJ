---
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
---

A video that stops sending frames gives way to its placeholder. `mj-media-tile` gains `StallAfterMs`: until the video's first frame, and once no frame has come for that long, the video fades out (it stays attached) and the participant's picture or initials fade in, until frames come back; the "AI-generated video" label shows only while the avatar's video does. The tile watches its own `<video>` element through `VideoFrameWatch` (new), which uses `requestVideoFrameCallback` where the browser has it and the moving playback position otherwise, outside Angular's zone. The Avatar channel's surface waits about a second (plan section 5) before it shows the agent's initials.

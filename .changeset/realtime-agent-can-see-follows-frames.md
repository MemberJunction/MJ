---
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-conversations": patch
---

In a realtime call, the camera's self-view says "Agent can see this" only while the model is being sent the camera's frames (#5373). It used to show whenever the camera was on and the Camera channel allowed pixels. On a model that takes one video stream, a screen share started after the camera is what the model is sent, so the badge stayed on while the "Agent can see" chip said "Agent sees: Shared screen". The badge now also needs the camera's source among the session's video sources to be on and active, which is what the chip reads, and it comes back when the user picks the camera. A channel's context gains `VideoSources$` (the runtime's `VideoSources$`), and `REALTIME_CAPTURE_SOURCE_IDS` names the camera's and the screen share's sources (`capture:camera`, `capture:screen`). A host whose channel context has no `VideoSources$` keeps the previous rule.

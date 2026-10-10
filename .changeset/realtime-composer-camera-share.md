---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
---

The realtime call overlay's composer shows Camera and Share whenever the call offers them, in all three layouts. A call offers a capture while it is connected, the model takes inbound video (`BaseRealtimeClient.SupportsInboundVideo`, new), the host can open it, and its channel's policy admits it; the runtime publishes this as `CaptureOffers$` (new). The buttons follow `Captures$` and call `StartCamera` / `StopCamera` / `StartScreenShare` (offering the kind of surface picked in the Share menu first) / `StopScreenShare`. The camera is optional in an agent call, so it is neutral while off and filled while on: `mj-media-controls` gains `CameraOptional` for this, and the LiveKit room keeps its red. In the fused dock the Share arrow is left out for room, and on a narrow composer the strip wraps onto a second row and the dock puts its text box on a row of its own (a container query on the composer's width). `RealtimeControlId` gains `camera` and `share`.

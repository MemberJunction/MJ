---
"@memberjunction/core-entities": minor
"@memberjunction/ai-realtime-client": minor
"@memberjunction/realtime-runtime": minor
"@memberjunction/ng-conversations": minor
---

A realtime channel's surface now shows where its `MJ: AI Agent Channels` row says. The row's `UIConfig` JSON gains `Placement` (`stage`, `pip`, `tab` or `hidden`; the tab when absent) and `AllowedPlacements` (where the user may move it; anywhere when absent), and CodeGen regenerates the typed `UIConfigObject` accessor. The runtime reads each row's placement when it builds the channel (a row whose `UIConfig` is not valid JSON keeps its channel and starts on its tab) and exposes it as `BaseRealtimeChannelClient.SurfacePlacement`. The call overlay starts each surface there, offers only the allowed placements in "Move to…", hides "Bring it here" when the tab is not allowed, and sends a surface leaving the stage to where its channel places it, using the media module's newly exported `PlacementOffStage`. No existing row sets a placement, so every surface still starts on its tab.

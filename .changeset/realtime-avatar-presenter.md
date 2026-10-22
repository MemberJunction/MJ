---
"@memberjunction/realtime-runtime": patch
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-conversations": patch
---

The agent's video shows in the agent's place in the call rather than in the focus layout. `BaseRealtimeChannelClient.ShowsAgentVideo` (new) says whether a channel shows the agent's video (it sinks outbound video); the runtime uses it to mark that channel as used when the video arrives. `mj-media-stage` gains `StageSlot`: a stage surface covers that element instead of filling the stage, followed as it moves and resizes, and out of sight while it has no size. The call overlay gives the stage that slot while a channel that shows the agent's video holds the stage: in the hero it takes the orb's place, in the console it is a compact tile above the thread, and the surface carries its own "Move to…" menu. Any other surface on the stage is the focus layout as before. The agent's first video gives its channel a tab without opening the panel.

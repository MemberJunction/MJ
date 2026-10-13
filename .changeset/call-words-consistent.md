---
"@memberjunction/ng-realtime-media": patch
"@memberjunction/ng-livekit-room": patch
"@memberjunction/mobile-app": patch
---

The words a call shows now match across the web and the phone. The phone's red call button is named "End call" for screen readers, as the web names it, and its hint says "Tap to end the call · swipe right for keyboard" (it said "Stop" and "Tap to stop"). The words for what agents see are plural only in a room with more than one agent: the participant tile's chip says "Agents can see", the self-view's badge "Agents can see this" and the control "Let agents see me" / "Hide from agents" (named "Let agents in this room see your camera and screen") there, and "Agent can see", "Agent can see this" and "Let the agent see me" / "Hide from the agent" (named "Let the agent see your camera and screen") in a call with one agent. `mj-media-tile`, `mj-self-view`, `mj-media-controls` and `mj-livekit-control-bar` take an `AgentCount` input (1 by default); `mj-livekit-room` passes its number of agents (`AgentCount`, participants whose role is `agent`), and the words are exported as `AgentVisionText(agentCount)`.

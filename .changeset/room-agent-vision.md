---
"@memberjunction/livekit-room-core": patch
"@memberjunction/ng-livekit-room": patch
"@memberjunction/ng-mj-livekit-room": patch
---

The meeting room lets each person choose whether an agent sees their camera and shared screen. Two LiveKit participant attributes carry it: `mj.agentCanSee` (the person allows it; the server sets it, since a participant's token can't change its own attributes) and `mj.agentWatches` (an agent's bot watches). `LiveKitRoomController` reads them into `LiveKitRoomState.AgentWatching`, `LiveKitLocalMediaState.AgentVisionOn` and each participant view's `AgentCanSee`, which the tiles show as "Agent can see". `mj-livekit-room` offers the "Let the agent see" switch only while an agent watches (`EnableAgentVisionControl` turns it off) and reports the person's choice through `AgentVisionChange`; the room changes nothing itself. The preview room simulates it: its agent watches, Ada allows it, and `LiveKitPreviewRoomController.SetAgentVision` records your choice at once, which `mj-livekit-agent-room` does in preview mode.

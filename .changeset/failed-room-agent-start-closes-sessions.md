---
"@memberjunction/livekit-room-server": patch
"@memberjunction/server": patch
---

A LiveKit agent room start that fails no longer leaves the agent's model session open or its `MJ: AI Agent Sessions` row `Active` (#5308).

- `LiveKitAgentRoomCoordinator.StartAgentRoomSession` closes the model session it opened when the start fails before the bridge engine takes that session: when the bot's token can't be minted (as before) and now also when the bridge doesn't start, for example because its row can't be saved. Before, a failed bridge start left the model connection open in MJAPI until the provider timed it out.
- `StartLiveKitAgentRoomSession` and `StartMeeting` close the agent session they created for an agent that fails to start, with reason `Error`, instead of leaving it `Active` until the janitor's staleness sweep. A meeting still starts without that agent. A session the caller passed in (`AgentSessionID`) is the caller's and is left as it was.
- New `SessionManager.CloseSessionForFailedStart` runs `CloseSession` with `Error`. It never throws, so the caller still reports the start's own error; a close that fails is logged and left to the janitor.

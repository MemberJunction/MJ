---
"@memberjunction/server": patch
"@memberjunction/livekit-room-server": patch
---

A LiveKit meeting agent's `MJ: AI Agent Sessions` row now closes when the agent leaves the room (#5356). Before, stopping the agent (`StopLiveKitAgentRoomSession`), ending the room (`EndLiveKitRoom`) or ending a scheduled meeting stopped the bot but left its session `Active` until the janitor's staleness sweep closed it, 15 minutes or more later, as `Janitor`.

- The session `StartLiveKitAgentRoomSession` creates for an agent, and the one `StartMeeting` creates for each agent participant, closes once the agent's bridge has ended, whatever ended it: a stop or an ended meeting, an emptied room, a lost model session. Both pass the room coordinator an end-of-session hook, as phone and room calls already do for theirs.
- New `SessionManager.CloseSessionForEndedBridge` runs the janitor's close (`CloseSession`) with the bridge's reason: `Explicit` for a stop, an ended meeting or an emptied room, otherwise the bridge's own (`Error`, `Janitor`, `Shutdown`). A session already closed keeps its reason. It never throws; a failure is logged and the janitor closes the session later, as before.
- A session the caller passed in (`AgentSessionID`) is the caller's to close and is left open.
- The coordinator's `AgentRoomHostOptions` TSDoc says a plain Meet room may pass only the end-of-session hook.

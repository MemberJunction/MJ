---
"@memberjunction/livekit-room-core": patch
"@memberjunction/ng-mj-livekit-room": patch
---

In a meeting, `mj-livekit-agent-room` now asks MJAPI to record the user's choice of whether agents may see their camera and shared screen (`GraphQLLiveKitClient.SetAgentVision`); the room shows the change once LiveKit reports it. When MJAPI can't record it, a dismissible notice over the room says why ("Couldn't change what the agent sees: …"), the room stays open, and `ErrorOccurred` reports it with the new `LiveKitRoomError` kind `'agent-vision'`. The preview room still records the choice itself.

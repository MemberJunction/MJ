---
"@memberjunction/ai-bridge-base": patch
"@memberjunction/ai-bridge-livekit": patch
"@memberjunction/ai-bridge-livekit-native": patch
"@memberjunction/ai-bridge-server": patch
"@memberjunction/ai-realtime-client": patch
---

An agent that watches a LiveKit meeting now picks which camera or screen its model sees, instead of keeping the first one until it ends. A shared screen comes first (the most recent share). After that comes the camera of whoever leads LiveKit's active-speaker list, once they have led for 1.5 s, then the camera already in view, then the camera of whoever spoke last, then the first camera in the room. A camera stays in view for 4 s from its first frame before another camera replaces it. A shared screen, a withdrawn consent and an ended source never wait. The bot itself and other agents never count as speakers. Only the chosen source is subscribed and read: a switch drops the old one, then subscribes the new one. The model is told what it sees: "[You can now see: Ada's screen]" right before the first frame of each source new to its session, and "[You can no longer see: Bob's camera]" when a source it saw stops, including on a switch (the ended note used to read "[The agent can no longer see: …]"). The hold lengths can be overridden through the bridge's `Configuration` (`VideoSpeakerOnsetMs`, `VideoSpeakerHoldMs`). Room telemetry gains `sourceSwitches`, `switchesHeld`, `activeSpeakerUpdates` and `switchGapMsLast` / `switchGapMsMax`. The live check script gains a switch scenario (`VISION_SCENARIO=switch`).

A browser call's video notes use the same second-person set. `VideoSourceArbiter` now says "[You can now see: Camera]" when what the model sees changes (it said "[The agent is now viewing: Camera]"), "[You can no longer see: Whiteboard (the user turned it off)]" when a source is turned off (it said "[The user turned off the agent's view of: Whiteboard]"), and "[You can now see: Whiteboard (turned back on)]" when it is turned back on (it said "[The agent can see Whiteboard again]"). The notes are sent at the same moments as before, and `FormatSwitchNote`, `FormatDisabledNote` and `FormatEnabledNote` still override them.

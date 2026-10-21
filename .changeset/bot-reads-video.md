---
"@memberjunction/ai": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ai-bridge-base": patch
"@memberjunction/ai-bridge-livekit": patch
"@memberjunction/ai-bridge-livekit-native": patch
"@memberjunction/ai-bridge-server": patch
"@memberjunction/livekit-room-server": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/server": patch
---

An agent can now watch a LiveKit meeting. Set `realtime.video.watchMeetings: true` in the voiced agent's `TypeConfiguration`. When its realtime model takes video (Gemini 3.8 Live), the agent's bot joins with the `mj.agentWatches` attribute, so the room offers each person the choice, and reads the camera or shared screen of the people who allow it: one source at a time, at the model's frame rate, as JPEG (cameras scaled to 640 px on the longer side, screens to 1280 px). When a source whose frames reached the model ends (the person withdraws, leaves, stops sharing or turns the camera off), the model is told "[The agent can no longer see: Ada's camera]". In every meeting the bot now unsubscribes from video it does not read. The frame-rate and scaling math moves to `@memberjunction/ai` (`RealtimeVideoFrameIntervalMs`, `ScaleRealtimeVideoFrame`, `InboundVideoRateOf`), and the Gemini driver declares its video rate from the model's profile.

---
"@memberjunction/ai": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-agents": patch
---

Browser Gemini Live sessions now continue past Gemini's ~10-minute connection limit and survive a dropped connection. The server driver requests session resumption, and the browser driver moves to a new connection with Google's resumption handle when Google announces the connection is ending (at the next resumable point) or when the socket drops (retrying with back-off). Events from a replaced socket are ignored, so its close no longer ends the session. The timing logic is a new Core helper, `RealtimeSessionResumption`. Sessions on a model declared zero-data-retention (`RealtimeSessionParams.ZeroDataRetention`, set from `Privacy.ZeroDataRetention`) never get resumption, because Google stores resumable session state.

---
"@memberjunction/ai": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ai-gemini": patch
---

Server-bridged Gemini Live sessions (meetings, telephony) now continue past Gemini's ~10-minute connection limit and survive a dropped connection, using the same `RealtimeSessionResumption` rules as the browser driver. The session opens its own connections through a connector the driver provides, ignores events from replaced connections, and after a resume ends the cut-off turn and opens a fresh meeting-mode activity window. `ParseDurationToMs` (Core) now reads Gemini's `goAway.timeLeft` for both drivers.

---
"@memberjunction/ai-gemini": patch
---

Gemini Live no longer logs "Scrubbed non-Gemini config key(s) from the session bag: turnDetection" for sessions that set a turn coverage (#5334). The driver applies `turnDetection` (its `Coverage`), `reasoning`, `effortLevel` and `reasoningEffort` itself, reading them from the config bag after the merge, so that line no longer names them. Gemini 3.8 Live's catalog rows set the coverage, so the line showed on every such session. Shared keys Gemini Live does not apply (`parallelToolCalls`, `mcpTools`, `inputTranscriptionModel`, `firstMessage`, `endpoint`, `sampleRate`, `proxyBaseUrl`) are still named in it, now worded "other realtime drivers use these; Gemini Live does not apply them". A value of one of the four keys that the driver cannot read, such as a numeric `effortLevel` (Gemini Live reads only a named effort), is logged on a line of its own; `null` reads as unset and is not logged.

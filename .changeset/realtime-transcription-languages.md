---
"@memberjunction/ai": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-openai": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ai-vertex": patch
---

Adds `realtime.session.transcriptionLanguages`, a caption-language hint for realtime voice sessions, and makes a rejected Gemini Live connect fail instead of hang.

- Gemini Live captions both sides of a call with its own transcription, and with no hint it guesses each utterance's language. A call held in English could show captions in Arabic, Tamil or Korean script while the audio was fine. `"transcriptionLanguages": ["en-US"]` (BCP-47 codes) under `realtime.session` sends the codes as `languageCodes` on both of Gemini's caption streams. It is a hint, not a lock: speech in another language is still captioned in that language. Unset, nothing changes.
- Where it can be set today: the target agent's `TypeConfiguration` when its agent type has no `ConfigSchema` (Loop, Flow), the agent type's `DefaultConfiguration`, or a runtime `configOverridesJson`. The Realtime agent type's schema does not declare `realtime.session` yet, so a Realtime-type co-agent cannot save any session key; that gap predates this change.
- The OpenAI-protocol drivers scrub the key (the agent's captions there are the model's own text), and the other drivers drop it with the rest of the shared session keys.
- Raises `@google/genai` from `^2.8.0` to `^2.16.0`. SDKs before 2.14.0 throw on `languageCodes` against the Gemini Developer API. Set the key only after every browser bundle that opens Gemini sessions is rebuilt on this release; an older bundle cannot connect with it.
- From SDK 2.11, `live.connect` waits for the server's setup acknowledgement and never settles if the socket closes first (a rejected key, model or setup field). The server driver and the browser client now reject the connect with the close reason instead of waiting forever.

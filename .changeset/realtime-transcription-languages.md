---
"@memberjunction/ai": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-openai": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ai-vertex": patch
---

Adds `realtime.session.transcriptionLanguages`, a caption-language hint for realtime voice sessions, and makes a rejected Gemini Live connect fail instead of hang.

- Gemini Live captions both sides of a call with its own transcription, and with no hint it guesses each utterance's language, so an English call could show captions in Arabic, Tamil or Korean script. `"transcriptionLanguages": ["en-US"]` (BCP-47 codes) under `realtime.session` is sent as `languageCodes` on both caption streams. It is a hint, not a lock: other languages still caption in their own script. Unset, nothing changes.
- Set it on the target agent's `TypeConfiguration` (agent types without a `ConfigSchema`), an agent type's `DefaultConfiguration`, or a runtime override. A Realtime-type co-agent cannot save it yet: that type's schema does not declare `realtime.session`, which was already true for every session key.
- The OpenAI-protocol drivers scrub the key, and the other drivers drop it with the rest of the shared session keys.
- Raises `@google/genai` from `^2.8.0` to `^2.16.0`, because SDKs before 2.14.0 throw on `languageCodes`. Set the key only after every browser bundle that opens Gemini sessions is rebuilt on this release.
- A Gemini Live connect now rejects with the close reason when the socket errors or closes before setup completes, on the server driver and the browser client. Before, a close before the socket opened hung on any SDK, and from SDK 2.11 so did a rejected key, model or setup field.

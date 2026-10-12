---
"@memberjunction/ai": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-openai": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ai-vertex": patch
---

Adds `realtime.session.transcriptionLanguages`, a caption-language hint for realtime voice sessions.

- Gemini Live captions both sides of a call with its own transcription, and with no hint it guesses each utterance's language. A call held in English could show captions in Arabic, Tamil or Korean script while the audio was fine. Setting `"transcriptionLanguages": ["en-US"]` (BCP-47 codes) in an agent's or app's `realtime.session` config sends the codes as `languageCodes` on both of Gemini's caption streams. It is a hint, not a lock: speech in another language is still captioned in that language. Unset, nothing changes.
- The OpenAI-protocol drivers scrub the key (the agent's captions there are the model's own text), and the other drivers drop it with the rest of the shared session keys.
- Raises `@google/genai` from `^2.8.0` to `^2.16.0`. SDKs before 2.14.0 throw on `languageCodes` against the Gemini Developer API, so on the old floor a deployment that set the hint could not connect.

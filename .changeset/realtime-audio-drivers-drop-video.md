---
"@memberjunction/ai": patch
"@memberjunction/ai-assemblyai": patch
"@memberjunction/ai-elevenlabs": patch
"@memberjunction/ai-inworld": patch
"@memberjunction/ai-openai": patch
---

The server AssemblyAI, ElevenLabs, Inworld and OpenAI Realtime drivers, and the xAI and Hugging Face drivers built on OpenAI's session, drop a video frame passed to `SendInput` instead of sending its bytes to the model as audio. Each session logs a dropped kind and type once (`console.warn`), not once per frame. `RealtimeDroppedInputReporter` (Core) is the shared reporter.

---
"@memberjunction/ai": patch
"@memberjunction/ai-bridge-base": patch
"@memberjunction/ai-bridge-server": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-assemblyai": patch
"@memberjunction/ai-elevenlabs": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-inworld": patch
"@memberjunction/ai-openai": patch
---

`IRealtimeSession.SendInput` takes one `RealtimeInputFrame` (`Data`, `Kind`, and optional `MimeType` and `TimestampMs`) instead of `(chunk, kind?)`. A realtime driver outside this repo must change its `SendInput` signature, and a caller passes `{ Data: chunk, Kind: 'audio' }`. The bridge engine passes each inbound frame's type and capture time, and `BridgeMediaFrame` gains an optional `MimeType`. The server Gemini Live driver sends a JPEG or PNG video frame as video instead of as audio, sends audio in the PCM format the frame names, and drops a frame it cannot send, reporting each type once. The other drivers behave as before.

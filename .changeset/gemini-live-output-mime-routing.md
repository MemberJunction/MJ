---
"@memberjunction/ai": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ai-gemini": patch
---

Both Gemini Live drivers now route model output by MIME type: only PCM audio reaches audio playback (browser) or the session's audio output (server). A part of another type, such as the `video/mp4` frames a Live Avatar session streams, is dropped and reported once per session instead of being played as noise. A part with no MIME type still plays, as before. `IsPcmAudioMimeType` (Core) is the shared check.

---
"@memberjunction/ai-realtime-client": patch
---

OpenAI-protocol realtime sessions (OpenAI Realtime, xAI Grok Voice) keep their persona and tools. The client-side `requestedTracks` negotiation hint is no longer sent in `session.update` (OpenAI rejected the whole update with `unknown_parameter`, so the session ran with no instructions and no tools).

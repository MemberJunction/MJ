---
"@memberjunction/ai-gemini": patch
---

Gemini Live model profiles now resolve per endpoint: `ResolveGeminiLiveProfile(model, endpoint)` takes `'developer'` (the default, the Gemini Developer API) or `'enterprise'` (Gemini Enterprise on Vertex AI) and returns the model's facts plus what it renders there: `SupportsAvatarOutput`, `AvatarOutputEncoding` and `AvatarAudioMuxed`. Only `gemini-3.8-live` on Enterprise renders a live avatar (fragmented MP4, H.264 and AAC, the voice inside the video, from Google's sample stream). Nothing changes at runtime: every caller still resolves the Developer endpoint. `GeminiLiveEndpoint` is exported.

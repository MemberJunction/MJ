---
"@memberjunction/ai-openai": patch
"@memberjunction/ai-xai": patch
---

A raw `audio` override in the realtime Config bag now merges into the built audio block (transcription, turn detection and the meeting-mode floor are kept) on the mint, `session.update` and `Reconfigure` paths, instead of replacing it. Merge happens within a turn-detection type; a different type replaces the built block. An explicit `null` in the bag is sent as `null` (for example `turn_detection: null` turns VAD off, in meeting mode too, since without VAD nothing auto-responds), and a meeting-mode profile that builds no turn detection gets none invented. `Reconfigure` always sends `turn_detection`: `null` when the bag turned VAD off, otherwise with `create_response` set from its `DisableAutoResponse`.

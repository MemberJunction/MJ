---
"@memberjunction/ai-openai": patch
"@memberjunction/ai-xai": patch
---

A raw `audio` override in the realtime Config bag now merges into the built audio block (transcription, turn detection and the meeting-mode floor are kept) on the mint, `session.update` and `Reconfigure` paths, instead of replacing it. Merge happens within a turn-detection type; a different type replaces the built block.

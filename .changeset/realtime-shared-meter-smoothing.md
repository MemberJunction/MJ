---
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ng-conversations": patch
---

Adds the meter smoothing every audio display shares to `@memberjunction/ai-realtime-client/media`: `GateAudioLevel`, `SmoothAudioLevel`, `SmoothAudioBars`, `SynthesizeAudioBars`, and `AudioLevelSmoother`, which smooths one source's level and bars (from its spectrum, or synthesized from the level when it has none). The call overlay's `RealtimeAudioVisualSmoother` in `@memberjunction/ng-conversations` now uses them and produces the same frames as before. Its `GateLevel` and `SmoothLevel` exports are deprecated in favor of the `/media` functions.

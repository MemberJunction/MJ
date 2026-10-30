---
"@memberjunction/ai": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-openai": minor
"@memberjunction/ai-xai": minor
"@memberjunction/ai-gemini": minor
"@memberjunction/ai-vertex": minor
"@memberjunction/ai-elevenlabs": minor
"@memberjunction/ai-huggingface": minor
"@memberjunction/ai-provider-bundle": minor
"@memberjunction/core-entities": minor
---

One `NormalizeTurnDetectionSettings` in `@memberjunction/ai` now validates turn-detection blocks for the cascade and every driver, so `Coverage` survives every config layer. Each realtime driver declares `SupportedTurnSettings` in its `DriverFacts` (mirrored on session `Capabilities`): the normalized fields it maps, each `exact` or `approximate`. Gemini (and Vertex Gemini Enterprise) map `SilenceDurationMs`, `Eagerness` (low/high → end-of-speech sensitivity; auto leaves Google's default) and `Threshold` onto `automaticActivityDetection`; `Threshold` is approximate (below 0.5 → high start sensitivity, 0.5 and above → low), and meeting mode's `disabled` is kept. xAI maps `Eagerness` onto end-of-turn silence (1200/700/400 ms) unless any layer sets `SilenceDurationMs`; a request that sets any turn field without a `Mode` is now sent as `serverVad` with those values instead of xAI's default block. On OpenAI and Eleven Realtime, `Eagerness` applies only with `Mode: 'semanticVad'`. ElevenLabs Agents still maps only `Eagerness`, and `ELEVENLABS_SUPPORTED_TURN_SETTINGS` is unchanged. The `AIConfiguration` JSON type's turn-detection field docs state these rules.

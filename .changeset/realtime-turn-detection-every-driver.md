---
"@memberjunction/ai": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-openai": minor
"@memberjunction/ai-xai": minor
"@memberjunction/ai-gemini": minor
"@memberjunction/ai-elevenlabs": minor
"@memberjunction/ai-vertex": minor
"@memberjunction/ai-huggingface": minor
---

Turn detection now works the same way on every realtime driver. One `NormalizeTurnDetectionSettings` merges the layers, and each driver declares `SupportedTurnSettings` with fidelity (`exact`, `lossy`). Gemini maps `SilenceDurationMs`, `Eagerness` and `Threshold` onto `automaticActivityDetection` (`Threshold` is lossy: below 0.5 is high start sensitivity, 0.5 and above is low). xAI maps `Eagerness` to a silence ladder (1200/700/400 ms) unless `SilenceDurationMs` is set. ElevenLabs Agents still maps only `Eagerness`. The turn-detection field docs in the `AIConfiguration` JSON type now state these rules.

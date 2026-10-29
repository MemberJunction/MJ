---
"@memberjunction/ai": patch
"@memberjunction/ai-inworld": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-openai": patch
"@memberjunction/ai-assemblyai": patch
---

Realtime drivers apply the normalized `turnDetection` setting where their provider can express it and warn at launch for the settings they cannot: Inworld maps `Eagerness` (semantic VAD) and `Threshold` / `SilenceDurationMs` (server VAD); Gemini maps `SilenceDurationMs` and `Eagerness` onto automatic activity detection; AssemblyAI maps `Threshold` onto `vad_threshold`; GPT-Live has no turn-detection field and warns for every requested setting.

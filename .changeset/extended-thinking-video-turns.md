---
"@memberjunction/ai-gemini": minor
"@memberjunction/aiengine": minor
---

Gemini 3.8 Live Extended Thinking now counts video into its turns, as Gemini 3.8 Live does: its model row and its Google model-vendor row set `ModelConfiguration.Realtime.TurnDetection.Coverage` to `audioActivityAndAllVideo`. Without it the Gemini driver states `audioActivityOnly`, so camera and screen frames sent while nobody speaks may not be part of a turn. Metadata only, no code change.

---
"@memberjunction/core": minor
---

Gemini 4 Hydrogen (Medium) and Gemini 4 Hydrogen (High) now state `ModelConfiguration.LLM.SupportsNativeToolCalling`, with the same native-tool settings as the other Gemini 3.x models (supported, not the default). Google's Gemini 4 Hydrogen docs list function calling as supported. The rows came in #6692 without the setting, which failed the `modelConfiguration.test.ts` guard that every LLM states it.

---
"@memberjunction/ai-prompts": patch
"@memberjunction/ai-gemini": patch
---

Wire Prompt.ModelSpecificResponseFormat through AIPromptRunner to the Gemini provider, and map responseFormat correctly so JSON mode sets responseMimeType=application/json and ModelSpecific applies the prompt-supplied config (e.g. responseSchema) to the Gemini model options.

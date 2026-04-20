---
"@memberjunction/ai-prompts": minor
---

Set PrefillFallbackMode to Ignore on all prompts that use AssistantPrefill.

The SystemInstruction fallback injects stop sequences on models that don't support native prefill (Gemini/Vertex), which can truncate JSON responses containing markdown code fences. Setting fallback to Ignore means prefill only activates on models that natively support it and is silently skipped elsewhere. Also removes prefill+stop sequences entirely from the Loop and Flow Agent Type system prompts, which are too broadly used to safely apply stop sequences.

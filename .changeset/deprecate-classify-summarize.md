---
"@memberjunction/ai": patch
---

Deprecates `BaseLLM.ClassifyText`, `BaseLLM.SummarizeText`, and their associated parameter and result types (`ClassifyParams`, `ClassifyTag`, `ClassifyResult`, `SummarizeParams`, `SummarizeResult`). The only caller is the already-deprecated AI Actions path, and running AI Prompts via `AIPromptRunner` (`@memberjunction/ai-prompts`) is the supported route. Zero runtime behaviour changes are introduced; removal comes in the next major version.

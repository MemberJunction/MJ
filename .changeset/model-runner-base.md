---
'@memberjunction/ai-core-plus': patch
'@memberjunction/ai-prompts': patch
---

Extract `BaseModelRunner` and shared model-run types. A behaviour-neutral move (typed-decision plan, #4660, Phase 0 Task 0.3).
- Move shared parameter/result types to `@memberjunction/ai-core-plus`
- Introduce `BaseModelRunner` abstract base in `@memberjunction/ai-prompts`. It declares `RequiredModelType`, a model-type name that a later change in this series enforces; nothing reads it yet. Its protected API is still settling across that series.
- Reparent `AIPromptRunner` onto `BaseModelRunner` (behavior-neutral). `AIPromptRunner` still logs uncategorized errors under `AIPromptRunner`; a runner that does not override `DefaultLogCategory` logs them under `BaseModelRunner`.

---
'@memberjunction/ai-core-plus': patch
'@memberjunction/ai-prompts': patch
---

Extract `BaseModelRunner` and shared model-run types. A behaviour-neutral move (typed-decision plan, #4660, Phase 0 Task 0.3).
- Move shared parameter/result types to `@memberjunction/ai-core-plus`
- Introduce `BaseModelRunner` abstract base in `@memberjunction/ai-prompts`
- Reparent `AIPromptRunner` onto `BaseModelRunner` (behavior-neutral)

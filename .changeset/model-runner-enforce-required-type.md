---
"@memberjunction/ai-prompts": patch
---

A runner's `RequiredModelType` is now a hard floor on model selection. For `AIPromptRunner` that type is `LLM`.

- A prompt whose `AIModelTypeID` is empty now draws only models of the runner's required type. Previously it could select a model of any type, such as an embeddings or realtime model with a high `PowerRank`.
- A prompt whose `AIModelTypeID` names a different type now fails with an error naming both types, instead of running.
- Prompt model bindings (`AIPromptModel`) that point at a model of another type are skipped, and the skip is logged.
- An explicit model override (`override.modelId`, a scoped prompt config's `ModelID`, an eval matrix cell) that names a model of another type now fails with an error naming both types, instead of running a different model.

On a clean install no shipped prompt is affected: every stock prompt leaves `AIModelTypeID` empty, and the only non-LLM bindings are the two embedding prompts, which the embeddings runner runs rather than `AIPromptRunner`.

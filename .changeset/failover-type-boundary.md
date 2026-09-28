---
"@memberjunction/ai-prompts": patch
---

Removes dead failover candidate-building code from `AIPromptRunner`, and pins model type as a hard boundary for failover with a test.

The typed-decision plan (#4660, Phase 0, Task 0.2) identified a failover type filter that compared model-type **name strings** from a denormalised view column, while the other three candidate filters compare `AIModelTypeID` with `UUIDsEqual`. That filter lived in `buildFailoverCandidates` (and its helper `createCandidatesFromModels`), and **nothing calls either method**. The live failover path, `executeModelWithFailover` → `selectFailoverCandidates`, only reorders and filters the `allCandidates` list produced by model selection, which already filters by type ID. So for a prompt whose `AIModelTypeID` is set, failover never crossed types, and the name-string comparison was unreachable. A prompt whose `AIModelTypeID` is null is treated as "any type" by selection, and so by failover, before and after this change; the runner's `RequiredModelType` floor, later in this series, closes that case.

- Removes two unused protected methods, `buildFailoverCandidates` and `createCandidatesFromModels`, and the doc comment that still listed them, so Task 0.3 has less to move into the shared runner base. Nothing in MJ called them, so runtime behaviour is unchanged. A subclass that overrode either method must drop the override (TypeScript reports TS4113), and one that called it through `super` must stop.
- Adds `AIPromptRunner.failover.test.ts` › "failover never crosses model types". For a prompt whose `AIModelTypeID` is the LLM type, a credentialed embeddings model out-ranks every LLM in the catalog, every LLM call fails, and the test asserts the runner walks the LLM candidates without ever calling the embeddings model. Removing the ID filter from `getModelPoolForStrategy` makes it fail, with the embeddings model tried first.

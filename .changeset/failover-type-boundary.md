---
"@memberjunction/ai-prompts": patch
---

Removes dead failover candidate-building code from `AIPromptRunner`, and pins model type as a hard boundary for failover with a test.

The typed-decision plan (#4660, Phase 0, Task 0.2) identified a failover type filter that compared model-type **name strings** from a denormalised view column, while the other three candidate filters compare `AIModelTypeID` with `UUIDsEqual`. That filter lived in `buildFailoverCandidates` (and its helper `createCandidatesFromModels`), and **nothing calls either method**. The live failover path, `executeModelWithFailover` → `selectFailoverCandidates`, only reorders and filters the `allCandidates` list produced by model selection, which already filters by type ID. So failover never crossed types; the name-string comparison was unreachable.

- Deletes both dead protected methods, and the doc comment that still listed them, so Task 0.3 has less to move into the shared runner base. A subclass that overrode either method was already unaffected, since neither is ever invoked.
- Adds `AIPromptRunner.failover.test.ts` › "failover never crosses model types". A credentialed embeddings model out-ranks every LLM in the catalog, every LLM call fails, and the test asserts the runner walks the LLM candidates without ever calling the embeddings model. Removing the ID filter from `getModelPoolForStrategy` makes it fail, with the embeddings model tried first.

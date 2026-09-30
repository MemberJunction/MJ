---
"@memberjunction/ai-reranker": minor
"@memberjunction/ai-agents": minor
---

Adds a `DecisionReranker` and a `Decision Reranker` model: it scores each candidate note with one typed-decision Likelihood question, and an agent opts in by pointing its `RerankerConfiguration.rerankerModelId` at the model. Examples can now be reranked too, with the same reranker, when an agent's reranker configuration sets `rerankExamples` to true; it is off by default. The examples rerank records a `Rerank Examples` step on the agent run, linked to its prompt run, as the notes rerank records `Rerank Notes`.

A rerank's prompt runs (the decision runs, or `LLMReranker`'s chat run) are children of the rerank's run, whose cost and token rollups include them, and the rerank's run step joins the agent run's steps, so the agent run's cost and token totals and its `MaxCostPerRun` / `MaxTokensPerRun` guardrails count the rerank.

A `DecisionReranker` rerank has a time budget, 15 seconds unless `RerankerConfiguration.decisionTimeoutMS` sets another: when it runs out the decision calls are aborted and the rerank fails, so the agent falls back as `fallbackOnError` says. When no decision model declares `MaxQuestionsPerCall`, each decision call carries at most 20 documents, or `RerankerConfiguration.decisionMaxDocumentsPerCall`, and a larger rerank is split across parallel calls.

When no candidate reaches `minRelevanceThreshold`, the agent keeps the vector search results instead of injecting nothing. For a `DecisionReranker`, whose probabilities are not calibrated, 0.1 is the recommended threshold.

`RerankerService.GetReranker` builds a `DecisionReranker` without a prompt ID, as its docs say: it asks the decision prompt its model-vendor `APIName` names, or `Default Decision`.

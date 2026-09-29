---
"@memberjunction/ai-reranker": minor
"@memberjunction/ai-agents": minor
---

Adds a `DecisionReranker` and a `Decision Reranker` model: it scores each candidate note with one typed-decision Likelihood question, and an agent opts in by pointing its `RerankerConfiguration.rerankerModelId` at the model. Examples can now be reranked too, with the same reranker, when an agent's reranker configuration sets `rerankExamples` to true; it is off by default.

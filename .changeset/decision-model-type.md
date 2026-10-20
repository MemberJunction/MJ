---
"@memberjunction/ai": minor
"@memberjunction/core-entities": minor
---

Add the `Decision` AI model type, for models that answer typed questions (Likelihood, Choice, Score) with probabilities instead of text, and a `Decision` section in the model configuration bag. The section declares a decision model's limits (questions per call, options per Choice, levels per Score, state size), so a request that exceeds them can be refused before the call. No behaviour changes until a decision runner reads it.

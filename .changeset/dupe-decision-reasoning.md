---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/ai-vector-dupe": minor
---

Duplicate detection gains two reasoning modes: `Decision`, where a typed decision model recommends without ever merging, and `DecisionThenPrompt`, where the decision filters candidates before the prompt reasons over the survivors. Auto-merge (`AutoMergeAboveAbsolute`) now also requires the candidate's own verdict to be `Merge`, carried on the new `PotentialDuplicate.ReasoningRecommendation`, so a set-level `Merge` never merges a candidate the reasoner judged otherwise.

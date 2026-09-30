---
"@memberjunction/ai-vector-dupe": patch
---

The duplicate check's `Decision` reasoning mode now calibrates each decision model's probability for that model (Platt scaling) before banding it, at a band set from the duplicate-check measurement. A candidate is flagged at a calibrated 0.7 or above, and the decision stage of `DecisionThenPrompt` keeps candidates at a calibrated 0.3 or above for the prompt. A model with no calibration gives no probability, so its candidates are flagged. Each candidate also carries the model's own `RawProbability`, and `BuildDecisionParams` is now a protected extension point.

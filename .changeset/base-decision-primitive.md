---
"@memberjunction/ai": patch
---

Add the abstract `BaseDecision` model type and its supporting types (`DecisionParams`, `DecisionResult`, `DecisionQuestion`, `DecisionAnswer`). This primitive enables typed decisions (Likelihood, Choice, Score) with a probability per answer, with no drivers yet. The base class validates both the request and the driver's answers; calibration is left to the caller.

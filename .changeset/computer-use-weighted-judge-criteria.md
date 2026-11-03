---
"@memberjunction/testing-engine": patch
"@memberjunction/computer-use-engine": patch
---

Computer Use and Agent Eval tests accept weighted judge criteria (`{ criterion, weight }`) in `judgeValidationCriteria`. The Computer Use driver reads them with the judge oracles' rules (`ReadJudgeCriteriaList`, now exported with `JudgeCriterionInput`) and passes their texts to the in-run judge; the oracles apply the weights.

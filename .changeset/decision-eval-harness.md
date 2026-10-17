---
"@memberjunction/ai-core-plus": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/testing-engine": minor
"@memberjunction/integration-test-suite": minor
---

Add a `Decision Eval` test type that measures typed decisions against labels inside MJ's test harness, with a suite generator and a scorecard for agreement, repeatability and calibration. The conversation-routing decision's builders (and `IsAgentAllowed`) move from `@memberjunction/ng-conversations` to `@memberjunction/ai-core-plus`, so the chat and the harness build the decision with the same code; import them from there.

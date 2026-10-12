---
"@memberjunction/testing-engine": patch
---

Add the `decision-judge` oracle, which scores a test's criteria as Likelihood questions to a typed decision model in one call, and reports each criterion's probability, a weighted score and a configurable pass threshold. It reads the same criteria and trace as the `llm-judge` oracle, so the two can run side by side. Like the `llm-judge`, it reports its call's cost as `llmCost` in the result details; neither judge's cost is added to the test run's `CostUSD`.

Both judges now read criteria through one parser. The `llm-judge` accepts weighted criteria (`{ "criterion": "...", "weight": 2 }`) and sends their text, and it fails with a clear message, without calling the model, when a criterion is malformed.

Both judges now bound each model call with the oracle config's `timeoutMS`, two minutes by default, so a hung judge call fails the oracle instead of hanging the test. Before this the `llm-judge` call had no timeout.

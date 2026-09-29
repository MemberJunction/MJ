---
"@memberjunction/testing-engine": patch
---

Add the `decision-judge` oracle, which scores a test's criteria as Likelihood questions to a typed decision model in one call, and reports each criterion's probability, a weighted score and a configurable pass threshold. It reads the same criteria and trace as the `llm-judge` oracle, so the two can run side by side.

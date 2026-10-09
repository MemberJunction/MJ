---
"@memberjunction/testing-engine": minor
---

Fix the Rubric Evaluator template's required parameter name: the v6.2 release seed shipped it as `criteria`, but the template iterates `Criteria` and the rubric/LLM-judge oracles pass `Criteria`, so every LLM-judge evaluation failed with "Parameter criteria is required". Metadata now declares the parameter as `Criteria`, so the next release seed corrects existing installs.

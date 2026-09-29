---
"@memberjunction/ai-prompts": patch
---

A decision answered by `LLMDecision` now carries its chat model's cost: the chat prompt's run is a child of the decision's run, and its cost is recorded as the decision run's `DescendantCost` and `TotalCost`, so an agent's `MaxCostPerRun` counts it.

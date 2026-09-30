---
"@memberjunction/ai-prompts": patch
---

A decision answered by `LLMDecision` now carries its chat model's cost: the chat prompt's run is a child of the decision's run, and its cost is recorded as the decision run's `DescendantCost` and `TotalCost`, so an agent's `MaxCostPerRun` counts it. The cost is booked as a descendant only when the chat run was actually linked as a child; when the decision run's own INSERT failed, it stays the decision run's own `Cost`. When a decision fails over, every linked attempt's cost is kept, not only the answering attempt's.

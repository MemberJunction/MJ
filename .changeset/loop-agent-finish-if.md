---
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
---

Loop agents can attach conditional completion gates (`finishIf`) to `Actions` and `Sub-Agent` steps. When the step completes successfully, a dedicated fast decision model evaluates the specified Likelihood questions against the step outputs. If all criteria meet or exceed the threshold (default 0.90), the agent completes immediately with the specified message, saving an entire turn of LLM latency and cost.

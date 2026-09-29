---
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
---

Loop agents can attach conditional completion gates (`finishIf`) to `Actions` steps and to a single `Sub-Agent` (not parallel `subAgents`). When the step completes successfully, a dedicated fast decision model evaluates the specified Likelihood questions against the step outputs. If all criteria meet or exceed the threshold (default 0.90), the agent completes immediately with the specified message, saving an entire turn of LLM latency and cost. The gate is skipped when an action returns `AIDirectives`, so the agent still reads them.

**On by default for every Loop agent**, with the conservative 0.90 threshold until calibration replaces it. The gate can only end a run early, and only when every action succeeded and every answer clears the threshold; every gate is logged as a `Finish check` step. To turn it off for an agent, set `includeFinishIfDocs: false` in its `AgentTypePromptParams`. **Data flow:** each gate sends the step's results (action outputs, or the sub-agent's result) to the `Default Decision` prompt's model: Jev, via OpenRouter, first, and LLM Decision on failover.

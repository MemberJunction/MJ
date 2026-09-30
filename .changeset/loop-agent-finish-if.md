---
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
---

Loop agents can attach conditional completion gates (`finishIf`) to `Actions` steps and to a single `Sub-Agent` (not parallel `subAgents`). When the step completes successfully, a dedicated fast decision model evaluates the specified Likelihood questions against the step outputs. If all criteria meet or exceed the threshold (default 0.90), the agent completes immediately with the specified message, saving an entire turn of LLM latency and cost. The gate is skipped when an action returns `AIDirectives`, so the agent still reads them.

**Off by default: gates are opt-in per agent**, through the new `finishIfMode` prompt param in the agent's `AgentTypePromptParams`:
- `off` (the default): the model is not taught `finishIf`, and a gate it writes anyway is never evaluated.
- `shadow`: the model writes gates, and each one is evaluated and recorded as a `Finish check` step, but it never ends the run. Use it to measure an agent's gates on real traffic, at the cost of one decision call per gate.
- `on`: a passing gate ends the run with the model's pre-written message.

A replay of recorded action rounds found that a gate at the 0.90 threshold would have ended 22% of the rounds where the agent went on to act, so turn an agent `on` only after its shadow results look right. In `on` mode a gate can only end a run early, and only when every action succeeded and every answer clears the threshold; every gate is logged as a `Finish check` step. **Data flow** (in `shadow` and `on`): each gate sends the step's results (action outputs, or the sub-agent's result) to the `Default Decision` prompt's model: Jev, via OpenRouter, first, and LLM Decision on failover.

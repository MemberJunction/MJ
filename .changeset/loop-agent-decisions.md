---
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agents": minor
---

Loop agents can ask typed decision questions (Likelihood, Choice, Score) through a new `decisions` field in their response. A fast decision model answers them inline on the same turn, at no LLM-turn cost, and the answers arrive on the next turn, as artifact tool results do. A request can target literal text, a payload path, or each item of a payload array. **Opt-in per agent:** set `includeDecisionsDocs: true` in the agent's `AgentTypePromptParams` (the default is `false`). That adds the decisions docs to its loop system prompt and the `decisions` field to its response type. Setting `includeResponseTypeDefinition.decisions: true` on its own adds the field without the docs. A `decisions` field from an agent that has neither is skipped. **Data flow:** each request sends its state (literal text, or the payload values it names) to the `Default Decision` prompt's model: Jev, via OpenRouter, first, and LLM Decision on failover. Set `decisionPromptName` to route them to a different prompt.

Each decision call is linked to its Decision step, so it counts toward the run's cost and token totals and their `MaxCostPerRun` / `MaxTokensPerRun` limits. At most 8 requests run per turn (`decisionsMaxRequests`), a malformed request fails on its own without losing the turn, and decisions sent with a step that ends the run (a sub-agent's `terminateAfter`, or client tools with `taskComplete`) are skipped rather than paid for and never read.

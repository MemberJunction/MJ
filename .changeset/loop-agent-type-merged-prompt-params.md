---
"@memberjunction/ai-agents": patch
---

Fix `BaseAgent.determineNextStep` so `LoopAgentType` gates receive the agent's merged `AgentTypePromptParams` (`this._agentTypePromptParams`) on a shallow copy of `params.data.__agentTypePromptParams`. Agents opted into task graphs through metadata (Sage, Query Builder, Research Agent) now submit or fold emitted task graphs instead of having them refused by the `taskGraphsEnabled` gate.

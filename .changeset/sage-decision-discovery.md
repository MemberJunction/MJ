---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/core-actions": minor
---

Loop agents can now suggest the agent to delegate to before their first prompt: with the new `decisionDiscovery` prompt param on (off by default), one decision over the agents the user may run and the host allows adds a `<suggested_agent>` message when it is confident, and Sage's prompt delegates to that agent directly instead of calling Find Candidate Agents first. The agent run-permission filter the Find Candidate Agents actions use now lives on `AIAgentPermissionHelper` (`FilterRunnableAgents`, `IsDirectlyDiscoverable`), so both offer the same agents.

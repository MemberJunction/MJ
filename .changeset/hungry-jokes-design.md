---
"@memberjunction/core-actions": minor
---

Fixed Find Agent action to use a hybrid search on avaliable agent to avoid newly created agents being unfindable to the Agent Manager due to the daily vectorization of searchable entities. Changed AgentManager's subagent call to Agent Spec Loader (workflow agent) to a direct call to the underlying action to avoid automatic failing of the sub-workflow agent.

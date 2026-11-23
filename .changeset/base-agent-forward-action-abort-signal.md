---
"@memberjunction/ai-agents": patch
---

Forward `ExecuteAgentParams.cancellationToken` as `AbortSignal` when `BaseAgent.ExecuteSingleAction` invokes `ActionEngineServer.Instance.RunAction`, so cancelling or timing out an agent run immediately propagates abort into long-running actions.

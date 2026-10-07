---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/server": patch
"@memberjunction/core-actions": patch
"@memberjunction/integration-test-suite": patch
---

Behaviour change: an agent run now reads its scope and agent-type parameters from `data` only when the server says it may, whatever started the run. The reserved keys are `PrimaryScopeEntityName`, `PrimaryScopeEntityID`, `PrimaryScopeRecordID`, `SecondaryScopes` and `__agentTypePromptParams`. `BaseAgent.Execute` removes them from every run's `data` unless the params set the new server-only `ExecuteAgentParams.TrustReservedRunData`. It logs the removed key names, never the values. The GraphQL resolvers used to strip these keys themselves; the Execute Agent action, MCP (`Run_Agent`, `Execute_*_Agent`), A2A and the Runtime Action bridge (`utilities.agents.Run`) passed them through. That let any user, or a model calling Execute Agent inside a run, choose a run's tenant or turn on task graphs. Now:

- **Who loses a scope in `data`.** A browser, an Execute Agent action call (from `RunAction`, a user routine or a model), an MCP or A2A request, and a Runtime Action script. Their other `data` keys are unchanged.
- **Who keeps it.** MJServer's agent-run resolvers set `TrustReservedRunData` for the system user and API-key integrations, never for a browser or a widget guest; they now forward `data` as sent. A sub-agent and a realtime delegation target inherit their parent's marker. The model-authored template parameters merged into a sub-agent's `data` still lose the reserved keys either way.
- **What server code does instead.** It sets the first-class `PrimaryScopeEntityName` / `PrimaryScopeRecordID` / `SecondaryScopes` fields, or sets `TrustReservedRunData` when `data` comes from a caller it trusts.
- **Shared rule.** `WithAgentRunDataTrustApplied` in ai-core-plus is the one implementation. `AgentRunner`'s returning-visitor scope and `ExecuteSingleAction` called outside a run use it too, so an untrusted data scope no longer suppresses a widget guest's derived visitor scope.
- **Tests.** Tests that pass `__agentTypePromptParams` as a per-run override now set the marker. The agent memory scoping doc states the rule.

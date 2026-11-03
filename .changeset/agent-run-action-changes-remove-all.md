---
"@memberjunction/actions-base": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/search-engine": patch
"@memberjunction/core-actions": patch
"@memberjunction/action-runtime-host": patch
"@memberjunction/global": patch
---

Host-assigned search scopes for agent runs, and `actionChanges` that remove every action are now honored.

- **`ExecuteAgentParams.SearchScopeIDs`:** the search scopes a host (for example a collaboration space) assigns to a run. They are stamped on every action dispatch as `RunActionParams.RunScope.SearchScopeIDs` and passed to every agent the run starts: sub-agents, `Execute Agent`, realtime delegation and runtime actions. Scoped Search then searches only those scopes (the first when the model names none). The host's assignment stands in for the calling agent's own `SearchScopeAccess` and assigned-scope list, so any agent a host runs can search what the host allows. It never grants: the user's own permission on the scope (`SearchScopePermissionResolver`, new `HostAssigned` input), skill rules, the scope's dimension rules and row-level security still apply. It is read only from the parameter, never from `data`. In such a run the plain Search action refuses (it would search past the host's scopes) and task graphs are withheld (their nodes run without the scopes).
- **Remove-all `actionChanges`:** `BaseAgent` treated an empty effective action (or sub-agent) list as "not computed" and fell back to the agent's configured set, so a host that limited an agent to zero actions gave all of them back. A computed empty list is now authoritative; a non-empty or uncomputed one behaves as before.

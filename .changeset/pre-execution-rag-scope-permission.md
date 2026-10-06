---
"@memberjunction/ai-agents": patch
---

Pre-execution RAG now applies the same scope-permission gate as the Scoped Search action and the GraphQL resolver. Before searching one of an agent's assigned scopes it resolves the effective `SearchScopePermission` for the acting user, with the agent as principal and the run's tenant, and requires a level above `Read`; a scope the user may not search is skipped and the attempt is logged as `Forbidden` in the search log, and a resolver failure denies that scope only. Previously every assigned scope was searched for every user before the first tool call — the one scoped search path that never consulted scope permissions.

**Behaviour change for existing configurations.** An agent whose `SearchScopeAccess` is `None` (the column default) no longer gets pre-execution retrieval, and an `Assigned` agent's scopes now need a `MJ: Search Scope Permissions` grant for the acting user or one of their roles (or the agent set to `All`), exactly as the Scoped Search action already required. Deployments that attached pre-execution scopes without setting the agent's access or granting the scope will see retrieval stop, with a `Forbidden` row per scope explaining why. The integration fixture `IT: Integration Test Scope` gains the grants it needed.

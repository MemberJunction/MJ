---
"@memberjunction/server": minor
---

An API key is trusted to set a run's scope and agent-type parameters through `data` only when it holds the new `agent:trusted` API scope. Before, every `mj_sk_*` key was trusted, and any user who may create keys can mint one for themselves, so a browser user lost the reserved keys but the same person with a key kept them. Now a key without the scope is treated like that user's browser session: `BaseAgent.Execute` drops `PrimaryScopeEntityName`, `PrimaryScopeRecordID`, `SecondaryScopes` and `__agentTypePromptParams` from its runs' `data`. The system user is trusted as before.

- **The scope.** `agent:trusted` (resource type Agent, checked against the agent being run) is added to `metadata/api-scopes` with an MJAPI application ceiling row. Granting it to a key takes create rights on `MJ: API Key Scopes`, which the stock UI role does not have. `full_access` does not include it, and an allow that matches no key rule (scope enforcement switched off, or `defaultBehaviorNoScopes: 'allow'`) does not count. A failed check counts as untrusted.
- **Upgrade.** An integration key that sets a run's scope through the GraphQL `data` argument needs the `agent:trusted` scope. Without it the run continues unscoped under the key's user.
- **API.** `IsTrustedAgentRunCaller` is now async and takes the `AgentID`.

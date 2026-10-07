---
"@memberjunction/server": patch
"@memberjunction/ai-agents": patch
---

Agent-run resolvers no longer let a browser set a run's scope or agent-type parameters through `data`. `RunAIAgent`, `RunAIAgentFromConversationDetail` (including the widget-guest path, which runs as an elevated server principal) and `RunAIAgentSystemUser` now drop the reserved keys `PrimaryScopeEntityName`, `PrimaryScopeEntityID`, `PrimaryScopeRecordID`, `SecondaryScopes` and `__agentTypePromptParams` unless the caller is the system user or an API-key integration; a widget-guest run always loses them. The stripped keys and the user are logged with `LogStatus`, never the values. Everything else in `data` passes through unchanged, and a request with nothing to strip is forwarded byte for byte. A host that needs a run scope sets it in its own server operation. The agent memory scoping doc now says which GraphQL callers may pass scope through `data`.

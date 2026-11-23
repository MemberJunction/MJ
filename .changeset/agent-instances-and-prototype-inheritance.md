---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-engine-base": patch
"@memberjunction/aiengine": patch
"@memberjunction/communication-engine": patch
"@memberjunction/conversations-runtime": patch
"@memberjunction/core-actions": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/ng-composer": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/server": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Add personal and shared AI Agent instances via multi-level prototype inheritance (`AIAgent.BaseAgentID`, `MaxDepth = 5`), `InstantiationMode` (`None | Optional | Required`), `AdditionalInstructions`, exclusive `IsPrimaryInstance` sibling sync, 2x2 RBAC with SQL Row-Level Security (`UserAccessibleAIAgents`), ancestor policy/limit ceiling intersection, unified text + Realtime voice personas with audience-aware tone framing, `Manage My Agent Instance` action, `LocalJsonCommunicationProvider` for local JSON-backed Email & Calendar testing, Frecency + FK-style Smart `@Mention` autocomplete, per-user Default Chat Agent (`chat.defaultAgentId`), and the unified **My Agents** Explorer application (`Overview`, `Agents`, `Agent Channels`).

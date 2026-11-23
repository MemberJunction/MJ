---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-engine-base": patch
"@memberjunction/aiengine": patch
"@memberjunction/conversations-runtime": patch
"@memberjunction/core-actions": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/server": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Add personal and shared AI Agent instances via multi-level prototype inheritance (`AIAgent.BaseAgentID`, `MaxDepth = 5`), `InstantiationMode` (`None | Optional | Required`), `AdditionalInstructions`, `IsPrimaryInstance`, 2x2 RBAC with SQL Row-Level Security (`UserAccessibleAIAgents`), ancestor policy/limit ceiling intersection, unified text + Realtime voice personas with audience-aware tone framing, `Manage My Agent Instance` action, Grok-Bot-style Conversations left-rail (`MyAgentsSectionComponent` + `AgentInstanceEditorModalComponent`), and Chief of Staff multi-instance switcher.

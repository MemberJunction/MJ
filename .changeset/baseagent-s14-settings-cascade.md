---
"@memberjunction/core-entities": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ai-agents": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/ng-core-entity-forms": minor
---

BaseAgent Refactor Slice s14: Add 3-table `IAgentConfiguration` settings cascade (`AIAgent.Configuration`, `AIAgentCategory.DefaultConfiguration`, `AIAgentType.DefaultAgentConfiguration`) with additive SQL backfill migration, lockstep `IAgentConfiguration` JSONType contract & tolerant parser, metadata deprecation of 49 `AIAgent` + 7 `AIAgentType` legacy columns (slated for v7.0 removal), bidirectional dirty-field sync in `MJAIAgentEntityServer` & new `MJAIAgentTypeEntityServer`, and full 3-table narrow-only cascade resolution in `AIEngineBase.ResolveEffectiveAgentProperties` and `AgentRunSetupHelper`.

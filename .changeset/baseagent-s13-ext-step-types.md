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
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-core-entity-forms": minor
---

BaseAgent Refactor Slice s13: Add `AIAgentStepType` metadata table and `StepTypeID` foreign keys (`AIAgentRunStep`, `AIAgentStep`) with `'Custom'` step type support, seed the 14 built-in step types in `metadata/agent-step-types`, introduce `BaseAgentStepHandler` and `AgentStepTypeRegistry` (Extension Point #1) replacing hardcoded step switches and type casts, wire per-agent `helperPlugins` resolution (Extension Point #3) with admin-only write checks and hard rejection of code-only security seams (`limits`, `actionPolicy`), and add comprehensive extension-point tests.

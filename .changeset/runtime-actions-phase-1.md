---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/actions-base": minor
"@memberjunction/actions": minor
"@memberjunction/action-runtime": minor
"@memberjunction/code-execution": minor
"@memberjunction/core-actions": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Runtime Actions — Phase 1 complete. Introduces `Action.Type='Runtime'`, a new action type where agents dynamically generate, test, and persist JavaScript actions that execute in MJ's isolated-vm sandbox with a permissioned bridge to metadata, views, queries, entity CRUD, other actions, agents, and AI prompts. Ships the v5.29.x migration (new `RuntimeActionConfiguration`, universal `MaxExecutionTimeMS`, and `CreatedByAgentID` columns on `Action`), the JSONType-authored config interface, the Zod validator with drift detection, the bidirectional IPC bridge in WorkerPool, the full `utilities.*` handler surface, the ActionSmith meta-agent with `Create Runtime Action` / `Test Runtime Action` helpers, Agent Manager wiring, the generic `Execute Agent` action, and Runtime-aware approval UI enhancements. Minor bumps across all touched packages because the schema migration + metadata records are coupled surface changes.

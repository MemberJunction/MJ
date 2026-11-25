---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-agent-manager": minor
"@memberjunction/ai-agents": minor
"@memberjunction/task-graph": minor
"@memberjunction/server": minor
"@memberjunction/ng-core-entity-forms": minor
---

Add per-workflow and per-graph execution isolation levels (`InProcess`, `Worker`, `Process`, `Container`), dual-dialect `AIAgent.Isolation` schema migrations backfilling existing rows to `InProcess`, `Workflow.Draft` default of `Worker`, `LimitsConfigResolver` isolation defaults/ceilings, and Node `worker_threads` / `child_process` / container isolation execution runners with documented fault-boundary guarantees.

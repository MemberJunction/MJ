---
'@memberjunction/ai-core-plus': minor
'@memberjunction/task-graph': minor
'@memberjunction/ai-agents': minor
'@memberjunction/server': patch
'@memberjunction/core-entities': patch
---

Flow agents now execute on the durable task-graph dispatcher instead of walking their own graph
inside an agent run.

`FlowAgentType.DetermineInitialStep` compiles the agent's steps and paths into a `TaskGraphSpec` and
returns a `Tasks` step; `BaseAgent.executeTasksStep` submits it and detaches. From there a workflow
is `Task` rows owned by a server-side dispatcher, with the same claiming, conditions, skip cascade,
retry and failure semantics as any other graph — one traversal engine rather than two that drift.
The in-run walker is retained as the reference implementation the compiler is checked against, but
refuses at its single choke point, so a workflow that runs at all provably ran on the new engine.

Also in this change:

- `Task` gains `StepType`, `PromptID` and a typed `Configuration` bag (`ITaskStepConfiguration`)
  carrying kind-specific settings, the payload mappings, the execution policy and the author's
  canvas layout. `CK_Task_Assignment` now counts `PromptID`.
- Payload mapping semantics are lifted into `@memberjunction/ai-core-plus` so both engines share one
  dialect — the `*` wildcard, case-insensitive result lookup, `[]` append, `$message` fields, and the
  `static:` / `payload.` / `data.` / `context.` prefixes.
- `ForEach` and `While` steps run through a new `TaskLoopExecutor`: bounds (`maxIterations: 0` means
  unlimited), `continueOnError`, delay, and parallel batches that keep results in **iteration** order.
- New deterministic DAG layout (`LayoutTaskGraph` / `LayoutGraphNodes` / `GraphLayoutBounds`) — a
  `Task` row has no position columns, so a run view previously drew every node on the origin.
- A settled graph credits its spending back to the submitting run through the `…Rollup` columns on
  `AIAgentRun`, which existed since v3 and were never written. `TotalCost` keeps its current meaning.
- `TaskGraphActionRunner` returns a flat, name-addressable result instead of an `ActionParam[]`, so
  output mappings resolve and branch conditions can be evaluated.
- `GetTaskGraphSubmitter()` now honours its documented contract and returns `null` when no
  durable-execution package is loaded, instead of an instantiated abstract base.

New guide: `guides/WORKFLOW_AND_TASK_GRAPH_GUIDE.md`.

---
"@memberjunction/core-entities": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/server": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-tasks": minor
"@memberjunction/integration-test-suite": minor
---

Phase 1 of the unified workflow DAG engine program (plan: PR #3456) — makes the task substrate tell the truth about what actually happened.

**Payloads become columns.** `Task` gains `InputPayload`, `OutputPayload`, `ErrorMessage`, and `AgentRunID`. Inputs and outputs previously rode inside `Task.Description` behind `__TASK_METADATA__` / `__TASK_OUTPUT__` markers, which leaked orchestration plumbing into search results and the task detail panel. A one-time migration backfill converts existing marker rows into the new columns and strips the markers; there is deliberately **no fallback parse** in code, because a fallback with no backfill never dies. The backfill is conservative — a row whose marker text doesn't parse as JSON is left byte-for-byte intact for inspection rather than silently discarded.

**Failures propagate instead of stalling.** A `Failed` dependency used to leave its dependents `Pending` forever: they never became eligible, so the graph appeared to finish while work silently never ran — and the parent was marked `Complete` at 100% regardless. Now failure propagates transitively to `Blocked`, and the parent rolls its children up honestly (`Failed` > `Blocked` > `Cancelled` > `Complete`, with progress counting only completed children). Completion notifications fire only for genuinely successful graphs.

**Bad graphs are rejected before they are persisted.** Dependency cycles are detected at creation (a cyclic graph could previously be saved and then deadlock silently), and a graph naming an unknown agent is now an error rather than being logged-and-skipped — which used to execute the graph with holes where the caller's tasks should have been.

**Waves run in parallel.** Eligible tasks execute with bounded concurrency (5) rather than one at a time, and each pass loads the graph once instead of issuing a dependency query per candidate task. Stalled graphs — pending work, nothing runnable, nothing in flight — are now detected and logged rather than exiting quietly.

**The Gantt links the right run.** `Task.AgentRunID` records the specific run that executed each task. The UI previously joined tasks to runs through the shared `ConversationDetailID`, so every sibling task in a graph resolved to the *same* agent run; the link was wrong for all but one. `Blocked` and `Failed` also now render distinctly instead of inheriting the pending treatment.

**New pure graph algorithms** in `@memberjunction/ai-core-plus` (`computeEligibleTasks`, `computeTasksToBlock`, `computeParentRollup`, `detectCycle`, `isGraphStalled`, `findUnknownDependencyRefs`) — dependency-free, operating on plain shapes rather than entities, with 44 unit tests. Phase 2's durable dispatcher consumes these unchanged rather than reimplementing eligibility and propagation.

**Also:** dispatcher claim columns (`ClaimedBy`, `ClaimExpiresAt`) and their supporting indexes land now so Phase 2 adds the dispatcher without further schema churn — nothing reads them yet. `AIAgentRunStep.StepType` gains `TaskGraph`. New deterministic integration bundle `task-graph-orchestration` (TG1–TG4) covering cycle rejection, unknown-agent rejection, payload columns, and the new schema's presence in generated metadata.

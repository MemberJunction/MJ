---
"@memberjunction/ai-agents": patch
---

Flow agents can be sub-agents and return their result again (#4555). A Flow agent run with a `parentRun`, or with `agentTypeParams.executionMode: 'inRun'`, now walks its steps in-process and returns the final payload, including `startAtStep`. A top-level run with no option set is still dispatched to the task-graph dispatcher. Each run records which mode it used as a `Decision` step.

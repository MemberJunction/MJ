---
"@memberjunction/ai-agents": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/task-graph": patch
"@memberjunction/server": patch
---

Flow agent in-run gaps: an in-run Flow that reaches a Human step stops with a message naming the step instead of "Unknown step type"; a refused in-run `startAtStep` ends the run with its own message instead of ten "No current step" retries; a dispatched run refuses `skipSteps` as it refuses `startAtStep`; no routing Decision step is recorded for a run refused before its first step; an in-run Flow can reach a sub-agent named on its own step without a ParentID or relationship row; and an Agent task that runs with no submitting run is now logged.

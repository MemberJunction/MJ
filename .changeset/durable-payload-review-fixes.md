---
"@memberjunction/actions": patch
"@memberjunction/task-graph": patch
"@memberjunction/server": patch
"@memberjunction/ng-dashboards": patch
---

Follow-ups to the durable entity-action payload fix (#4794), found while verifying it end to end.

- `@memberjunction/actions`: a durable binding now redacts its payload against the engine's live `ActionParam` definitions, the same ones `ActionExecutionLog.Params` uses. Before, it read a per-action cached collection that keeps the old row after an in-place update, so setting a parameter's `LogValue` to 0 on a running server redacted the log while the value was still written to `Task.InputPayload` until a restart.
- `@memberjunction/task-graph`: a task whose `InputPayload` is not valid JSON now **fails** (`Task <id> has an InputPayload that is not valid JSON …`) instead of running with no inputs. A raw string reaches that column through `TaskGraph.RetryTask` / `UpdateTaskInput`.
- `@memberjunction/server`: `TaskGraphActionRunner` no longer adds one parameter per upstream task to an action step. That map is keyed by upstream task ID, so every step with a dependency received an extra parameter named by a GUID and holding the upstream step's whole output (logged in full). The dependency outputs still reach the step, merged by key, through the dispatcher.
- `@memberjunction/ng-dashboards`: the Workflows run view shows why a failed step failed ("Why it failed"). Before, the message was only in the JSON tab.

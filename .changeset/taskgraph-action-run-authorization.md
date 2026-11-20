---
"@memberjunction/actions-base": patch
"@memberjunction/actions": patch
"@memberjunction/task-graph": patch
"@memberjunction/core-actions": patch
"@memberjunction/server": patch
---

Action run authorization is now shared code in `@memberjunction/actions-base` (`EvaluateActionRunAuthorization`, `CheckActionRunAuthorization`, `ActionClassAuthorizesCaller`). `TaskGraph.Submit` refuses a graph whose Action or compensation node names an action the submitter may not run, and the dispatcher checks again before it runs an action step. `TaskGraph.Cancel` and `TaskGraph.GetStatus` accept only a UUID as the workflow run ID and only from the run's owner or an Owner-type user. Test Runtime Action tests only Runtime actions the caller may run, marks inline code Approved only for an Owner-type caller, and always turns off the `allowAny*` permissions of the supplied configuration.

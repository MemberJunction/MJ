---
"@memberjunction/actions-base": patch
"@memberjunction/actions": patch
"@memberjunction/task-graph": patch
"@memberjunction/core-actions": patch
"@memberjunction/server": patch
---

Action run authorization is now shared code in `@memberjunction/actions-base` (`EvaluateActionRunAuthorization`, `CheckActionRunAuthorization`, `ActionClassAuthorizesCaller`).

Task graphs check who may run each action:

- An agent runs the actions bound to it (its active agent actions and the actions of its active steps) for any user who may run the agent. A sub-agent also runs the actions bound to the agents of its parent runs in the same run tree, when those runs belong to the same user and the user may run their agents. An action bound to no agent in that chain runs only when the user is authorized for it (an Owner, a linked authorization, or an action that checks its caller itself).
- A durable entity action runs its bound action for the user who saved the record. Any other action in that graph needs an authorization of the user.
- `TaskGraph.Submit` refuses a graph that names an action the user may not run: as a node, as a node's compensation action, or as the compensation action in the action's metadata. Magic Link sessions cannot call `TaskGraph.Submit`.
- The dispatcher checks again before it runs each action: action steps, loop body actions and the steps of multi-step loops. It reads the authorization rows as its own server user.

`TaskGraph.Cancel` and `TaskGraph.GetStatus` accept only a UUID as the workflow run ID and only from the run's owner or an Owner-type user.

Test Runtime Action tests only Runtime actions the caller may run. Inline code needs an Owner: anyone else gets `OWNER_REQUIRED` and nothing runs. The `allowAny*` permissions of the supplied configuration are always turned off.

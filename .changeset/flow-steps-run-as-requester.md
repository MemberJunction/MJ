---
"@memberjunction/task-graph": patch
"@memberjunction/ai-agents": patch
"@memberjunction/actions": patch
"@memberjunction/server": patch
---

Flow agents (and anything else that submits a task graph) now run for users who hold only the baseline UI role, and every step of a graph now runs with the permissions of the person who submitted it.

- **Plan rows are written by the platform.** `TaskGraphService.Submit` writes the graph's parent task, its steps and their dependencies as the system user, because the UI role may only read `MJ: Tasks` and `MJ: Task Dependencies`. The submitter is still recorded on the parent as `submittedByUserID`, and a Human step is still assigned to them. With no system user available the rows are written as the submitter, as before.
- **Steps run as the submitter, not as the dispatcher.** The dispatcher runs as the system user, and it used to pass that identity to every prompt, action, agent and decision step — so a graph could do anything the system user can, whoever asked for it. Each step now runs as the user recorded in `submittedByUserID`, looked up fresh per step through the new `TaskUserResolver` seam (MJServer supplies one backed by `UserCache`). A graph submitted by the system user, or persisted before submitters were recorded, runs as the system user exactly as before. A recorded submitter who cannot be found or is inactive fails the step instead of falling back to the system user. The dispatcher's own bookkeeping (task status, human-step requests, run-step logs) is still written as the system user.
- **Behaviour change to expect:** a submitter without rights to an action, prompt or agent used inside a graph now sees that step fail, where before it silently succeeded as the system user. Durable entity actions submit as the user whose save fired them, so they now run as that user — matching how the same binding runs inline.
- **A graph's parent row can no longer have its stored input rewritten** through `TaskGraph.RetryTask` or `TaskGraph.UpdateTaskInput`, since that input now decides whose permissions the graph runs with. Steps' inputs remain editable.
- **Pause-for-reply requests** (`MJ: AI Agent Requests` written by an agent's Chat or Plan step) are written as the system user, still addressed to the same `RequestForUserID`.
- **Action execution logs** are written as the system user, and `UserID` now names the user the action ran for (it previously took the action engine singleton's last-configured user). A log write that fails still never stops the action and is logged with its full message.

---
"@memberjunction/ai-agents": patch
"@memberjunction/ng-conversations": patch
---

A Stop button on an in-progress agent reply now actually stops the run, and the stop keeps the work.

- **Stop reaches the running agent.** The run's row is the control channel: the chat marks the run `Cancelled` with reason `User Request`, and the agent-run watchdog on the process that owns the run polls for that (every 3 seconds, `cancellationPollIntervalMs`) and aborts the run's own cancellation token. `BaseAgent` already honors that token throughout its loop and forwards it into prompts and actions, so the in-flight step ends and the run finalizes as Cancelled. Because the row is the channel, this works whichever MJAPI replica owns the run. `AgentRunWatchdog.Track` takes the run's `AbortController`; `RequestCancel` and `IsStoppable` cover in-process callers; `USER_CANCEL_ABORT_REASON` is the reason the agent sees.
- **The stopped run records the reason and the payload.** The cancelled result sets `CancellationReason` from the abort reason (`User Request`, `Timeout`, or `System`) rather than overwriting the UI's write with null, and promotes the last completed step's `PayloadAtEnd` to `FinalPayload` so the next turn, chained by `LastRunID`, starts from where the stopped one left off.
- **The reply reads as stopped, not failed.** `AgentRunner.ResolveFinalDetailState` marks a user-stopped reply `Complete` with "Stopped by user" instead of `Error` with the cancellation text.
- **The button.** `mj-conversation-message-item` shows a Stop control beside the time pill while the reply is in progress (hidden for read-only viewers), emits `StopClicked`, and reads "Stopping…" until the message leaves In-Progress. The list relays it as `StopMessage`; the chat area resolves the run (mapped, or by the reply's detail id) and calls `AgentStateService.CancelAgent`, which now loads the row fresh, refuses a run that already finished, and records the reason. New: `AgentStateService.CancelAgentForDetail`.

Known limit: the previous `CancelAgent` only wrote the row, which the running agent then overwrote on finish. That path is what this replaces.

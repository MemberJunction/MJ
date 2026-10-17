---
"@memberjunction/core-entities": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ng-conversations": patch
---

Only the user who started an agent run, or the owner of its conversation, can stop it.

- **The rule is enforced where the stop is saved.** `MJAIAgentRunEntityExtended.Save` refuses a stop request (an existing run whose `Status` moves to `Cancelled` with no reason or `User Request`) from any user other than the run's starter (`UserID`) or the owner of its conversation (the conversation's `UserID`, or an Owner-level grant: the same rule as Share), returning `false` with `StopRefusedMessage` in `LatestResult`. The framework's own cancellations (`Timeout`, `System`) and the agent's finalizing save of an already-cancelled run are not stop requests. Server-side only: on a client provider the server's copy of the save runs the check. New: `IsStopRequest`, static `StopPermitted` (the rule, shared with the UI), `StopRefusedMessage`, `StopCheckFailedMessage`; `UserOwnsConversation` in core-entities beside `UserMayWriteConversation`.
- **The controls offer only what the rule allows.** In a shared conversation the composer's stop control and the per-reply Stop pill cover the runs the viewer started; the owner stops every run. While only other users' runs are in flight the slot stays Send and the status line says whose work it is ("Sage is working for another user", "2 agents working for other users"). A run whose starter cannot be told is treated as the viewer's own. New on the chat area: `CanStopAnyRun`, `CanStopDetail`, `StoppableDetailIds`, `StoppableCount`, `OthersInFlightCount`; the message list takes `StoppableDetailIds` and stamps `StopAllowed` on each item.

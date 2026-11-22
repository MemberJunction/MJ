---
"@memberjunction/core-entities": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ng-conversations": patch
---

Only the user who started an agent run, or the owner of its conversation, can stop it.

- **The rule is enforced where the stop is saved.** `MJAIAgentRunEntityExtended.Save` refuses any unmarked save of an existing run with `Status = 'Cancelled'` (regardless of `CancellationReason` or client-supplied dirty flags) from any user other than the run's persisted starter (`UserID`) or the owner of its conversation (walking `ParentRunID` for child sub-agent runs; owner is the conversation's `UserID`, an Owner-level grant, or an inherited Owner-level folder grant: the same rule as Share), returning `false` with `StopRefusedMessage` in `LatestResult`. Already-cancelled rows in the database remain updatable, and trusted server-side cancellations (`BaseAgent.createCancelledResult`) authorize a single save via the non-field capability marker `MarkServerCancellation()`. Server-side only: on a client provider the server's own copy of the save runs the check. New: `MarkServerCancellation`, `IsStopRequest`, static `StopPermitted` (the rule, shared with the UI), `StopRefusedMessage`, `StopCheckFailedMessage`; `UserOwnsConversation` in core-entities beside `UserMayWriteConversation`.
- **The controls offer only what the rule allows.** In a shared conversation the composer's stop control and the per-reply Stop pill cover the runs the viewer started; the owner stops every run. While only other users' runs are in flight the slot stays Send and the status line says whose work it is ("Sage is working for another user", "2 agents working for other users"). A run whose starter cannot be told is treated as the viewer's own. New on the chat area: `CanStopAnyRun`, `CanStopDetail`, `StoppableDetailIds`, `StoppableCount`, `OthersInFlightCount`; the message list takes `StoppableDetailIds` and stamps `StopAllowed` on each item.

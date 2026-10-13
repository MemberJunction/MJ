---
"@memberjunction/ng-conversations": patch
---

Stop all stops only the viewer's own runs. In a shared conversation, the composer's stop control and the per-reply Stop pill now cover the runs the viewer started; the conversation's owner (or a user with an Owner-level grant, the same rule as Share) stops every run. While only other users' runs are in flight the slot stays Send and the status line says whose work it is ("Sage is working for another user", "2 agents working for other users"). A run whose starter cannot be told is treated as the viewer's own. New on the chat area: `CanStopAnyRun`, `CanStopDetail`, `StoppableDetailIds`, `StoppableCount`, `OthersInFlightCount`; the message list takes `StoppableDetailIds` and stamps `StopAllowed` on each item. The server does not enforce this; it decides what the controls offer.

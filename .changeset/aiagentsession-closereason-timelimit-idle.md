---
"@memberjunction/server": minor
"@memberjunction/core-entities": minor
"@memberjunction/ai": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/conversations-runtime": minor
---

`AIAgentSession.CloseReason` now accepts `TimeLimit` (the session's authored deadline passed) and `Idle` (no activity beyond the idle threshold), so an expiry close records why the session ended instead of the generic `Janitor`. `RealtimeChannelCloseReason` in `@memberjunction/ai` widens to the same six values. The realtime dashboards, the session review and agent banner in conversations, and the conversations-runtime session timeline label the two new reasons, and the realtime overview's KPI, now named "System closes", counts every close not made by a person (orphan, idle and time-limit); a time-limit close is not titled as a janitor close, since the browser's verified deadline alarm records it too. A stale session whose `LastActiveAt` will not parse now closes as `Idle` with a logged error instead of staying open.

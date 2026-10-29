---
"@memberjunction/server": minor
"@memberjunction/core-entities": minor
---

`AIAgentSession.CloseReason` now accepts `TimeLimit` (the session's authored deadline passed) and `Idle` (no activity beyond the idle threshold), so an expiry close records why the session ended instead of the generic `Janitor`.

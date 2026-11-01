---
"@memberjunction/core-entities-server": minor
"@memberjunction/server": minor
"@memberjunction/telephony-adapters": minor
---

`MJ: AI Agent Sessions` treats the server-only `CloseReason` values (`TimeLimit`, `Idle`, `Janitor`, `Shutdown`) as server-managed: an ordinary save, such as the generic `UpdateMJAIAgentSession` mutation, may set only `Explicit` or `Error` and cannot replace a server-only reason already recorded, so a session owner can no longer stamp `TimeLimit` and skip the deadline check in `SessionManager.CloseSession`. The server's own close paths (`SessionManager.CloseSession` and the telephony call bookkeeping) save inside `RunWithTrustedSessionConfigWrites`. `@memberjunction/telephony-adapters` now depends on `@memberjunction/core-entities-server`.

---
"@memberjunction/server": patch
"@memberjunction/ai-agents": patch
---

Security (C3): the realtime relay no longer takes authority from a session's `Config` JSON, which the session owner can edit through the generic entity API. `ExecuteRealtimeSessionTool` re-checks `CanRun` on the session's target agent for the caller on every call. Direct actions are no longer read from `Config`: the service uses the actions it projected for the session at start, or the target agent's own metadata when another process prepared the session. The co-agent, prompt, step and paused run ids in `Config` are used only when they are records of the session (new `SessionRunIDVerifier`), on the relay, prompt-run mirror, close, heartbeat and remote-browser goal paths. `BaseAgent` rejects a `lastRunId` that is not a UUID before it reaches a filter.

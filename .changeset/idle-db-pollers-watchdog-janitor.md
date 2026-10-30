---
"@memberjunction/ai-agents": patch
"@memberjunction/server": patch
---

Let an idle MJAPI stop polling its database. `AgentRunWatchdog` now runs its heartbeat and stale-run sweep only while an agent run is in flight, stops both when the last run finishes, starts them again on the next run, and untracks a run before the subclass `finalizeRun` hook so a failing hook can't leave a finished run heart-beaten. New settings: `agentRunWatchdog.sweepIntervalMs` (`0` = startup sweep only; env `MJ_AGENT_RUN_WATCHDOG_SWEEP_INTERVAL_MS`), `heartbeatIntervalMs`, `staleThresholdMinutes`, and `agentSessions.janitor.enabled` (env `MJ_SESSION_JANITOR_ENABLED`), `sweepIntervalMs` (env `MJ_SESSION_JANITOR_SWEEP_INTERVAL_MS`), `closeThresholdMinutes`. Defaults are unchanged.

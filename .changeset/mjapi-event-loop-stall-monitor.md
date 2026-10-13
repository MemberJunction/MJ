---
"@memberjunction/server": patch
"@memberjunction/ai-agents": patch
"@memberjunction/scheduling-engine": patch
---

MJAPI now reports event-loop stalls. When the loop is blocked for 1s or more, it logs one warning with how long, the heap, and the agent runs and scheduled jobs running in the process, and `/healthcheck` returns the latest `eventLoopLagMs` next to `status: 'ok'` (the heap stays in the log line, since `/healthcheck` is unauthenticated). Tune or turn it off with the new `eventLoopMonitor` config block (`enabled`, `warnThresholdMs`, `sampleIntervalMs`). `AgentRunWatchdog.TrackedRunIDs` and `SchedulingEngine.InflightJobIDs` are new read-only getters that name the work in flight. A finished agent run now leaves the watchdog's tracked set as soon as its final state is saved (it used to wait for the 5-minute prune), so the warning names only runs that are actually running.

---
"@memberjunction/server": patch
"@memberjunction/ai-agents": patch
"@memberjunction/scheduling-engine": patch
---

MJAPI now reports event-loop stalls. When the loop is blocked for 1s or more, it logs one warning with how long, the heap, and the agent runs and scheduled jobs running in the process, and `/healthcheck` returns the latest `eventLoopLagMs` and `heapUsedMb` next to `status: 'ok'`. Tune or turn it off with the new `eventLoopMonitor` config block (`enabled`, `warnThresholdMs`, `sampleIntervalMs`). `AgentRunWatchdog.TrackedRunIDs` and `SchedulingEngine.InflightJobIDs` are new read-only getters that name the work in flight.

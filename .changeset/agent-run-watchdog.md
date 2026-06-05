---
"@memberjunction/ai-agents": minor
"@memberjunction/server": minor
"@memberjunction/scheduling-engine": minor
---

Add an agent-run watchdog that prevents `AIAgentRun` records from being left in `Status='Running'` after a process restart, crash/OOM, or a failed terminal-state write. While a run is in flight the owning process stamps a new `LastHeartbeatAt` column; a staleness-based sweep (once on boot and on a timer) force-fails any `Running` run whose heartbeat has gone stale, and a graceful-shutdown handler cancels the in-flight runs the process owns. All timing is anchored to the database clock and the sweep only ever touches `Status='Running'` rows, so it is safe across multiple MJAPI instances behind a load balancer. Also adds an optional, opt-in `Agent Run Sweep` scheduled-job type (`AgentRunSweepScheduledJobDriver`) that runs the same idempotent sweep through MJ's scheduler for audit/observability.

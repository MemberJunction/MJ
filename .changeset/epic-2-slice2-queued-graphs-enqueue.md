---
"@memberjunction/core": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/task-graph": patch
"@memberjunction/server": patch
---

Implement Slice 2 queued graph execution (`Dispatch: 'Queue'`), recoverable terminal caller notifications across restarts, `Enqueue` step waiting-state coordination, and bounded 10,000-item `ForEach` + `Enqueue` WorkQueue fan-out with early-completion reconciliation, idempotent deduplication, and terminal failure propagation.

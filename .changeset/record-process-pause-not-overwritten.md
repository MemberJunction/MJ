---
"@memberjunction/record-set-processor": patch
---

Pausing or cancelling a running Record Process works again. `GenericProcessRunTracker.Checkpoint` saved its long-lived run entity before re-reading it, and an entity save writes every loaded field, so the run's stale `CancellationRequested = false` overwrote the request that `RecordProcess.PauseRun` or `CancelRun` had just saved, and the run never stopped. The checkpoint now re-reads the run first, then saves its counters, then honours the flag it read.

---
"@memberjunction/integration-engine": patch
---

Stop one hung discovery from making a connector permanently unrefreshable.

`Run()` coalesces concurrent callers for the same CompanyIntegration onto a single promise, and removes the map entry in a `finally` — which only fires when that promise SETTLES. A run that hangs therefore owned its slot forever, and every later refresh took the `if (inFlight) return inFlight` path and attached to a promise that would never resolve. No new run started, no `run.start` was emitted, nothing reached the workspace log: from the outside the request simply vanished.

That is the whole explanation for behaviour that read as random for two days. A fresh process discovers in ~4 minutes; one hang poisons the slot; every attempt after it hangs; restarting the workspace clears the in-memory map and it appears fixed — until the next hang. Observed live 2026-08-12: a run frozen at `EventCount 5` with healthy runs on either side of it, and a customer pressing Re-check to no effect and no log output.

Coalescing is correct for concurrent callers, but it is only safe if runs terminate, and nothing guarantees that. The entry now carries its start time and expires after `IN_FLIGHT_MAX_AGE_MS` (20 minutes): past that a caller stops trusting it and runs fresh, logging the discard. This does not stop the stalled work — a promise is not cancellable — it stops one hang from costing every future attempt.

The `finally` now clears the slot only if it still holds *this* run's promise, so a run settling after it was evicted cannot drop a newer run's entry.

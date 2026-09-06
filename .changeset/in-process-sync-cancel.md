---
'@memberjunction/integration-engine': patch
'@memberjunction/server': patch
---

In-process sync cancellation, complementing the durable `CancelSyncAsync` DB stamp.

`CancelSyncAsync` stamps `CancelRequestedAt` on the run row so a cancel issued from ANY process reaches the owner — necessary since the owner may be a different node entirely. But when the run is executing in the SAME process handling the cancel request, waiting on the owner's next batch boundary / heartbeat poll of that stamp is pure added latency: the engine already holds a live `(cancelRequested flag, AbortController)` pair for the run, wired through the same `onCancelRequested` path the boundary check uses.

`IntegrationEngine.RequestCancelInProcess(companyIntegrationID)` is a new static method that looks up that live pair in an in-process registry (keyed lowercase, like `activeSyncs`) and trips it directly — the run winds down through its normal cancel handling and finalizes as `Cancelled`, just triggered faster. The registry is populated when a run starts executing in this process, including adopted/resumed runs, and cleared in a `finally` when the run ends.

`IntegrationDiscoveryResolver.IntegrationCancelSync` now falls back to `RequestCancelInProcess` when `CancelSyncAsync` reports nothing was stamped. The durable stamp is still attempted first and unconditionally, so cross-process cancel correctness is unchanged — this only adds a second, faster path for the common case where the caller and the run share a process.

This also closes a real gap: on a deployment whose schema predates the ownership columns `CancelSyncAsync` depends on, the durable stamp is a no-op — `CancelSyncAsync` truthfully (but uselessly) reports nothing cancelled, leaving no working cancel path at all. `RequestCancelInProcess` needs no schema; it is a plain in-memory map, so it is the only cancel path that works there. Observed in production on a deployment predating the ownership migration.

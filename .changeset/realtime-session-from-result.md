---
"@memberjunction/ng-conversations": minor
---

Realtime: mint and run become separable.

`RealtimeSessionService.StartRealtimeSession` fused two responsibilities — **minting** the session through the `StartRealtimeClientSession` mutation, and **running** it: resolving the driver from the result's `Provider`, booting it with the ephemeral token, wiring tool and transcript relays, connection state and teardown. A host that must mint the session itself, because it attaches server-side context the stock mutation cannot carry, had no way to reuse the second half. The public API was all-or-nothing.

The only way through was to subclass `GraphQLDataProvider`, install it on the service's public `Provider` seam, intercept the single armed mint operation, redirect it to the host's own mutation and reshape the reply into the ten fields the client consumes. That works, but it depends on an implementation detail nobody promised — that *every* GraphQL call the service makes goes through `Provider` — so a refactor entirely reasonable on MJ's own terms would break such a host silently.

`StartRealtimeSessionFromResult(result, options)` exposes the run half directly, with `StartRealtimeClientSessionResult` and `RealtimeSessionRunOptions` now exported. `StartRealtimeSession` becomes `mintSession` + the new method, so **existing callers see no behavioural change**.

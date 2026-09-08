---
'@memberjunction/task-graph': patch
---

A stopped task-graph dispatcher stops

`pollOnce` checked `running` only when the tick fired, then awaited a provider, a rollup pass and a
claim query before taking work. `Stop` could land in any of those gaps, so a dispatcher that had
already been stopped went on to roll up graphs — emitting `GraphSettled` to observers that had been
torn down — and to claim tasks it would never execute, leaving them claimed until their lease
expired. On a graceful shutdown or a rolling restart that strands freshly claimed work for the whole
TTL.

`running` is now re-read after every await in the pass, including per iteration of the claim loop,
and `Stop` waits for an in-flight pass before draining in-flight tasks. Without that ordering the
drain loop could observe an empty `inFlight` set while a pass was moments from populating it, which
is the exact state the drain exists to prevent — and is why `Stop`'s documented promise to wait for
in-flight tasks did not hold.

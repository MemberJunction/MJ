---
"@memberjunction/integration-engine": patch
---

The absence-proof prefetch now passes `IgnoreMaxRows`, so a row-limit default can never truncate it.

A plain `RunView` is not unbounded — it falls back to the entity's `UserViewMaxRows`, which defaults
to 1000. The prefetch's result is what `CoversWholeBatch` absence proofs are judged against, and
coverage is computed from the request side, never reconciled with the response length: a silently
truncated response would mark every existing row beyond the cap "provably absent" and re-INSERT each
as a duplicate on every sync. Today the apply batch (500) happens to sit under the default cap, so
nothing fires — a 2× margin defended by nothing. This engine already documents the identical trap on
its push side and fixes it the same way.

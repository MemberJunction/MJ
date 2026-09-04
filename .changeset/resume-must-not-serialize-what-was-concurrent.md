---
"@memberjunction/integration-engine": minor
---

A restart no longer turns concurrent syncs into a queue.

Syncs are **started** concurrently — `processRSUPendingWork` launches each connector's `RunSync` without awaiting it — and were **resumed** serially: `ResumeOrphanedSyncs` awaited `ExecuteEntityMaps` + `FinalizeRun` inside its loop. So a restart silently converted a parallel workload into a queue ordered by whatever `RunView` happened to return, and the slowest connector became a head-of-line block for every other connector on the workspace. If it never finished, they never started.

Observed live: a restart orphaned three syncs. One resumed and was still running five hours later; the other two (99,463 and 13,238 rows) never began. Nothing in the logs said so, because nothing had failed — they had never been reached. From outside the process a queued run and a crashed one are indistinguishable: `IsInFlight: true`, `CompletedAt: null`, counters frozen at the instant of the restart. The absence of an error is the only tell.

The loop body is now `ResumeOneOrphanedRun` (line-for-line unchanged), run through a bounded pool. What is **not** parallelised: the write section stays serialized by `runWriteExclusive` — all maps share one provider connection with singular transaction state — and per-CompanyIntegration exclusion stays via the `activeSyncs` lock each resume takes. What overlaps is what overlapped before the restart: different connectors waiting on different sources.

Bounded (default 4, `MJ_RESUME_CONCURRENCY` to override) rather than unbounded, because a workspace is one Node process: concurrency buys overlap on waiting, not more CPU, and a boot that adopted fifty runs at once would trade one pathology for another. A junk/zero/negative override falls back to the default rather than to 1 — silently restoring serial behaviour on a typo is the one outcome this must not have.

The pool never stops early: one resume's failure costs exactly that resume, and the first error is rethrown only after every run has had its turn. Abandoning the queue on one bad item would recreate the head-of-line failure in a different shape.

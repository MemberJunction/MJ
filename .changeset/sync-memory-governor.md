---
"@memberjunction/integration-engine": patch
"@memberjunction/server": patch
---

Sync sheds load under host memory pressure instead of only warning about it.

`ResourcePressure` previously watched the V8 heap, which cannot see the memory that actually
kills a sync: `--max-old-space-size` bounds old space only, while an HTTP response body lives in
`Buffer`/`ArrayBuffer` — external, and counted in neither. A throttle watching the heap reads
healthy right up to the kill. Measured on a 3,830 MB box: the kernel killed node at 3,478 MB RSS
against a 1,964 MB heap ceiling — 1.8x — with heap usage unremarkable.

It now also reads host RAM from `/proc/meminfo` (MemAvailable, not MemFree, which excludes
reclaimable page cache and reads far tighter than what a process can obtain) and reports
`ResidentFraction`. Where both thresholds trip, the worse of the two is reported under one code,
so a caller has a single number to act on.

`MemoryGovernor` decides and `RunMemoryControl` applies, split so the decision is testable without
a live sync. The governor runs PER BATCH rather than between entity maps: a table fetching twelve
consecutive 2,000-record pages allocates all of it without ever reaching a boundary, which is the
difference between noticing and dying. One control per run, never shared — the engine is a
singleton across concurrent syncs, so calibration held on it would let one connection's behaviour
throttle another's.

`AdaptiveConcurrency` gains `Hold()`/`Release()`: stop the cap GROWING without lowering it. The
cheapest possible response — everything in flight keeps running and nothing new is admitted — so
it costs no throughput. Without it the only options were "carry on" and "halve", and halving work
that is already succeeding is a real cost paid for a problem holding would have solved.

Memory pressure feeds the SAME AIMD signal a source rate-limit uses, so no per-connector tuning
and no advance knowledge of which connector misbehaves is required: a connector returning 10x the
requested batch costs 10x the memory, the reading notices, and the cap follows. The floor is 1, so
a sync always makes progress rather than deadlocking on a full box.

`ResourcePressureOutput` exposes `ResidentFraction`, `HostMemTotalMB` and `HostMemAvailableMB`.

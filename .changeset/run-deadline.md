---
"@memberjunction/integration-engine": patch
---

Give the connector-creation pipeline a whole-run deadline, so a hung stage fails instead of running forever.

Every other budget in this system bounds something *inside* a stage, and none of them can preempt an `await` that never settles. A connector's `outOfTime()` is only checked between requests; an HTTP abort signal governs only its own request; the discovery sample budget is spent by the code reading the stream. There is always one more layer able to stall — and when one does, the pipeline waits on it forever.

Forever is literal. `complete()` and `fail()` are the only writers of `result.json`, and both sit inside the try/catch around the stages, so a stage that never returns reaches neither. Since `isInFlight` is computed as "result.json is absent", the run then reports itself running for the rest of time: no client can learn otherwise, no retry clears it, and the customer is left with a spinner over work that stopped being observable.

Observed live 2026-08-12, three times on one connector — ConnectionTest completing in ~1s, Introspect starting, and the event stream flat for ten minutes and counting, against a reference run that finished the entire pipeline in 3m53s.

Stages are now raced against `RunDeadlineMs` (default 45 minutes; 0 disables). This does **not** stop the stalled work — a promise is not cancellable, so it keeps running until the process ends — it stops *waiting* on it. The run fails honestly, writes its artifact, and becomes retryable. A reported failure you can act on beats silence you cannot.

The default is deliberately far above any healthy run, so it only ever fires on work that has genuinely stopped rather than work that is merely large.

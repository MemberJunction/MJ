---
"@memberjunction/integration-engine": patch
---

A discovery sample that degrades to the catalog description now says so.

When streaming fails, `DiscoverFieldsViaFetch` falls back to single-sample `DiscoverFields` — the
catalog's own description, which carries no observed widths. The fallback was announced only to the
console, so from the pipeline's side it was indistinguishable from a successful sample: the method
returned fields and the run recorded a discovery that succeeded. The object then kept whatever width
its catalog guessed, and every longer value it later received was dropped at sync time as a string
overflow.

`DiscoverFieldsViaFetch` takes an optional `OnFallback` notifier, and the creation pipeline passes
one that emits a `discover-fields-fallback` stage error naming the object and what is unknown for
that run. Behaviour is otherwise unchanged — the fallback still happens, callers that pass no
notifier are byte-identical, and a throwing notifier cannot turn a degraded discovery into a failed
one.

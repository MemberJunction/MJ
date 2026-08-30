---
'@memberjunction/integration-engine': patch
---

A transport failure is retryable again: read the error's `cause` chain, not just its message.

`fetch` (undici) reports EVERY transport failure as the bare message `fetch failed` and puts the
real reason — `ECONNRESET`, `ENOTFOUND`, `EAI_AGAIN`, `UND_ERR_SOCKET`, `socket hang up` — in
`error.cause`. `ClassifyError` only read the top-level message, so that string matched no
pattern, fell through to `UNKNOWN_ERROR`/`Critical`, and was therefore **not retryable**: a
routine network blip ended the object's fetch loop, and the sync stopped early while reporting
success on a partial pull. Measured on a long-running production sync, this fired every 30-60
minutes and was indistinguishable from a completed run.

`ClassifyError` now flattens the error's message plus every `cause` in the chain (depth-capped,
so a cyclic chain cannot hang it) along with any `code`/`errno` found along the way, and checks
an explicit list of transport-level signals FIRST — because a request that never reached a server
carries no verdict, and must not be shadowed by a deterministic-looking keyword appearing deeper
in the chain. Those classify as `NETWORK_TIMEOUT`/`Warning`, which the existing retry path
already honors.

Deliberately an explicit signal list rather than a loose substring: the neighbouring
`DATABASE_ERROR` branch previously had to be narrowed for exactly that reason, and
deterministic errors (duplicate key, FK violation, write-verification) must keep classifying as
before.

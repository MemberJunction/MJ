---
'@memberjunction/integration-engine': patch
---

Stop retrying the engine's own `FetchChanges` timeout — it multiplied load on sources that were already too slow.

`WithTimeout` is a `Promise.race` with no cancellation: when the budget expires it rejects, but the wrapped operation **keeps running**. `ClassifyError` maps the timeout to `NETWORK_TIMEOUT` and `IsRetryableError` treats that as transient, so the fetch path retried it — up to `MaxAttempts: 3`.

For a connector that fans out one request per parent record inside a single `FetchChanges` call, that meant attempt 1 timed out with its requests still in flight, ~1s later attempt 2 issued a *second* full page of vendor requests overlapping the first, and ~2s later a third overlapped both. Up to **3× the concurrent load on a source that could not finish the work once** — a reliable way to earn a genuine 429, which *does* back the adaptive limiter off. And the retry could never have succeeded on its merits: the same work under the same budget exceeds it again.

`WithTimeout` now rejects with a new exported `OperationTimeoutError` (same message text, so `ClassifyError`, logging and the run-event stream are unchanged), and the fetch retry predicate excludes it by `instanceof`. The exclusion is deliberately identity-based rather than dropping `NETWORK_TIMEOUT` from `IsRetryableError`: `ClassifyError` folds `econnreset` in under that same code, and a reset socket genuinely is worth retrying. A vendor's own "gateway timeout" also stays retryable — only a budget *this engine* set is treated as terminal.

A page that exceeds its budget now fails once and lets the object end incomplete, which surfaces as the `FETCH_ABORTED_INCOMPLETE` run-event warning rather than after three full-cost attempts. Deployments that need a longer budget raise `Configuration.fetchTimeoutMs` or the connector's `FetchChangesTimeoutMs`, which is what those knobs are for.

Also corrects a comment on `BaseIntegrationConnector.FetchChangesTimeoutMs` that described a timeout→concurrency-cut spiral. Only `RATE_LIMIT_EXCEEDED` feeds the adaptive limiter; a timeout never cut concurrency directly.

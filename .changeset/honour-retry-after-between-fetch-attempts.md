---
"@memberjunction/integration-engine": patch
---

Honour `Retry-After` between fetch attempts, and re-acquire a rate token on each retry.

A 429 was already retried — `WithRetry` wraps `FetchChanges` and `IsRetryableError` admits `RATE_LIMIT_EXCEEDED` — but two things around that retry made the adaptation ineffective:

- **The wait ignored what the source said.** `computeDelay` is pure exponential backoff plus jitter. The `Retry-After` a connector can already parse was consumed only by `RateLimiter.ReportThrottle`, which is called from the `catch` — after every attempt is exhausted. A source replying "expected available in 60 seconds" was retried on a ~1s/2s ladder regardless.
- **Retries bypassed the limiter.** The rate token is acquired once, *before* `WithRetry`, and never between attempts. So even once the bucket was frozen by a throttle report, the retries sailed straight past it.

Net effect: a throttled object burned its attempts in a few seconds and ended with zero records, while every other object fetching concurrently kept hammering the source, because the shared bucket was never frozen in time to matter.

`WithRetry` now takes two optional hooks, both no-ops for existing callers. `DelayForError` may replace the computed backoff with a source-directed wait — returning null or undefined keeps today's backoff, so a connector that cannot parse `Retry-After` is unaffected. `BeforeRetry` is awaited after the wait and before the next attempt, which is where the fetch path re-acquires its rate token, so a retry passes through the same gate the first attempt did and actually waits out the freeze.

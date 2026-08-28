---
'@memberjunction/integration-engine': patch
---

Adaptive per-connection fetch concurrency gate. The engine can fire more simultaneous vendor fetches than the account's concurrency grant allows (lanes × prefetch), and vendors that govern by concurrent requests answer the overflow with long backoffs served inside the fetch — invisible to every resource metric because a backoff is idle. The gate caps simultaneous in-flight fetches per company integration with a FIFO queue, and its cap is adaptive: it halves when a throttle is reported (including throttles a connector absorbed in its own retry and surfaced via ctx.RateLimitReport) and creeps back up by one on clean outcomes, clamped at the ceiling — so it converges on the account's real grant with zero configuration. Ceiling = `Configuration.fetchConcurrency` override, else the connector's `MaxConcurrencyHint`, else 5.

---
"@memberjunction/integration-engine": minor
---

Discovery now recognises a rate limit for connectors that write no rate-limit code — which is all of them.

`IntrospectSchema` fans describes out to 8 concurrent and feeds each outcome to an AIMD controller that cuts the in-flight cap when an item reports `throttled`. It decided `throttled` by asking one question: whether `ExtractRetryAfterMs` returned a value. That method's base implementation returned `undefined` unconditionally, and **no connector in this repo overrides it** — so the answer was "not a throttle" for every 429 MJ has ever received, and the fan-out stayed at 8 straight through the vendor telling it to slow down.

Two changes, both in the base class so every connector inherits them:

- **Classifier fallback.** The throttle test now falls back to `ClassifyError`, which reads the error's own text (`rate limit` / `throttl` / `429`) — the same classifier the sync fetch path already uses for exactly this decision. A connector's parsed value still wins when it has one; this is the floor beneath it. A throttled describe also emits an `introspect.object.throttled` event, so backing off is visible rather than inferred.
- **`ExtractRetryAfterMs` now reads the standard header by default.** `Retry-After` (RFC 9110 §10.2.3) in both delay-seconds and HTTP-date forms, from headers on the error, on `error.response`, or one level into `error.cause`. Values are bounded at 5 minutes, so a vendor returning a Unix timestamp as delay-seconds can't freeze the token bucket for millennia; anything unusable falls back to the limiter's own decrease. Deliberately not a message-text parser — inventing a delay is worse than having none, so prose signals stay the connector's job.

Ordinary describe failures are still not throttles: cutting concurrency on every error would make a permissions problem look like a rate limit.

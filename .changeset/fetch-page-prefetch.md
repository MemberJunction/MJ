---
"@memberjunction/integration-engine": patch
---

Overlap a cursor-paged connector's next page download with the current page's processing.

The fetch loop was strictly serial — fetch a page, apply it, fetch the next — even though the next cursor is known the moment a page arrives. On a connector whose fetch dominates its apply, which is the common shape, the shorter leg sat idle waiting for the longer one twice per cycle.

This is latency hiding, not concurrency: exactly one extra request is ever in flight, and it is the request the loop was about to make anyway. Vendor pacing is unchanged because the prefetch acquires the same rate token through the same limiter; error semantics are unchanged because the failure surfaces where the loop awaits it. Both hold by construction rather than by duplication — the fetch is now defined once and used by both the loop and the prefetch, so an overlapped page carries the identical timeout, retry predicate, `Retry-After` honouring and token re-acquire.

The safety property is the claim check: a page in flight is served only when its cursor is the one the loop is actually about to use. A gap skip, a reset, or a connector rewriting its own cursor discards the page rather than serving it for the wrong position, which would silently skip or duplicate records. A refused page is dropped rather than retained, so a later cursor cannot match it by coincidence.

Cursor-paged connectors only, and that falls out of the gate rather than being asserted separately: arming requires a `NextCursor`, which offset- and page-paged connectors do not produce. Those modes could not participate anyway — gap-skip resume means the position the loop will ask for next is not knowable when a prefetch would have to start.

Disable with `MJ_INTEGRATION_PREFETCH=off`. Anything other than `off` leaves it on, so a typo cannot silently disable it.

---
"@memberjunction/core": patch
---

Fix RunView cache-miss results returning ALL entity columns instead of the caller's requested Fields. The caching pipeline widens params.Fields to all entity fields so cache entries are universal supersets; that superset is now projected back down to the caller's requested Fields on cache misses (it already was on hits), so result shape is identical regardless of cache temperature. Also includes Fields and ResultType in the RunView dedup/linger key so concurrent or near-sequential callers with different field subsets or result types no longer receive each other's projected/transformed result shapes.

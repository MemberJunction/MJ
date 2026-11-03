---
"@memberjunction/core": patch
"@memberjunction/scheduling-engine": patch
"@memberjunction/redis-provider": patch
"@memberjunction/server": patch
---

Shared-cache incident fixes: the scheduler's timestamp-filtered reads (due routines, wake-gate deltas, action-log retention) bypass the cache instead of writing a never-read entry per tick; `InvalidateEntityCaches` skips the storage lookup and registry rewrite for a non-cacheable entity with nothing indexed, and rewrites the registry only when it removed something; the Redis provider applies `options` on the URL path too and answers a read that takes longer than `readTimeoutMs` (default 2000 ms; `cacheSettings.redisReadTimeoutMs` / `REDIS_READ_TIMEOUT_MS` in MJServer) as a cache miss.

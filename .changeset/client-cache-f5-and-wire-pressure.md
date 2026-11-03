---
"@memberjunction/core": patch
---

Route cold client `RunQuery({ CacheLocal: true })` requests through `RunQueriesWithCacheCheck` so the initial local cache slot is stamped with `maxUpdatedAt` and `definitionHash` on first fetch, and repopulate `LocalCacheManager` after fallback refetches when `ApplyDifferentialUpdate` declines an in-place differential merge.

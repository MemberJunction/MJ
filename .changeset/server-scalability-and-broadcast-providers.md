---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/api-keys": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
---

Implement 4-pillar MJServer / MJAPI horizontal and vertical scalability architecture:
1. **Pluggable Cache Invalidation Broadcast Hierarchy**: Add `BaseCacheInvalidationBroadcastProvider`, default `SequencedRoleBucketBroadcastProvider`, `AzureWebPubSubBroadcastProvider`, `AWSIoTCoreBroadcastProvider`, `GCPPubSubBroadcastProvider`, `CacheInvalidationBroadcastManager`, `GetCacheInvalidationsSince` delta catch-up query, `NegotiateCacheBroadcastConnection` query, `X-MJ-Cache-Seq` / `X-MJ-Server-ID` HTTP response headers, and $O(1)$ per-session `PushStatusUpdates` topic routing (`CreateSessionRoutingPubSub`) with `WeakMap` single-parse JSON memoization.
2. **Per-Request & Per-Field GraphQL Overhead Elimination**: Apply `VariablesLoggingMiddleware` only to root `Query`/`Mutation`/`Subscription` fields (`ApplyRootVariablesLoggingMiddleware`), use zero-copy prototype delegation (`Object.create(shared)`) in `ProviderBase.CreateSharedMetadataShell`, lazily allocate RxJS transaction subjects in `SQLServerDataProvider`, cache decoded `jwt.JwtPayload` claims in `AuthCache`, and add short-TTL validation caching + `LastUsedAt` write throttling in `APIKeyEngine`.
3. **Single-Flight `RunView` Coalescing & Bounded Batch Concurrency**: Deduplicate concurrent identical in-flight `InternalRunView` executions on non-transactional providers with deep-cloned result isolation and cap concurrent queries in `InternalRunViews` to `MaxConcurrentViewsPerBatch` (`8`).
4. **Multi-Replica Horizontal Scaling (`MJ_SERVER_ROLE`)**: Support `'all' | 'api' | 'worker'` server roles (`ResolveServerRole`, `ShouldServeInteractiveTraffic`, `ShouldRunBackgroundWorkers`) to split interactive GraphQL/REST replicas from background job workers.

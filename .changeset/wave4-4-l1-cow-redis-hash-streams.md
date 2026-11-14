---
"@memberjunction/core": patch
"@memberjunction/redis-provider": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/server-bootstrap": patch
---

Wave 4.4 two-tier L1 frozen CoW + L2 Redis HASH cache, Redis Stream cluster invalidation sequence, cross-replica GraphQL PubSub fan-out, multi-tab browser invalidation multiplexer, and coalesced metadata storage persistence:
- `@memberjunction/core`: cache per-slot PK array indices via `WeakMap` in `LocalCacheManager.ApplyRowChanges` for $O(\Delta)$ Copy-on-Write row updates, compute `maxUpdatedAt` incrementally on non-displacing updates, delegate in-place row deltas via `ILocalStorageProvider.ApplyRunViewRowDelta`, and add trailing-edge coalesced/serialized `ScheduleSaveLocalMetadataToStorage` on `ProviderBase`.
- `@memberjunction/redis-provider`: add `TwoTierCacheStorageProvider` (byte-bounded L1 deep-frozen LRU cache with $O(\Delta)$ peer `row_delta` patching in front of L2 Redis), per-row Redis `HASH` storage (`useHashForRunViewSlots`) with Lua `APPLY_RUNVIEW_ROW_DELTA_SCRIPT` (`HSET`/`HDEL`), and atomic cluster epoch + Redis Stream `INCR`/`XADD`/`XRANGE` helpers.
- `@memberjunction/server` & `@memberjunction/server-bootstrap`: wrap shared Redis cache in `TwoTierCacheStorageProvider` (`WrapSharedCacheWithL1`), register `RedisStreamBroadcastProvider` (`'RedisStream'`) for cluster-wide monotonic `X-MJ-Server-ID` / `X-MJ-Cache-Seq` watermarks and `XRANGE` catch-up, and bridge all non-bespoke TypeGraphQL `@Subscription` topics across pods via `AttachRedisClusterPubSub`.
- `@memberjunction/graphql-dataprovider`: add `ClientTabInvalidationMultiplexer` electing a single leader browser tab via Web Locks to hold the `CacheInvalidation` WebSocket and relay invalidations + deduplicated catch-up watermarks to follower tabs over `BroadcastChannel` / `SharedWorker`.

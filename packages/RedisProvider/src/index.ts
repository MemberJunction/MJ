/**
 * @module @memberjunction/redis-provider
 *
 * Redis-backed {@link ILocalStorageProvider} for MemberJunction.
 *
 * Provides persistent, shared server-side caching via any Redis-compatible service
 * (self-hosted Redis, Azure Managed Redis, AWS ElastiCache, Redis Cloud, Upstash, etc.).
 *
 * Drop-in replacement for `InMemoryLocalStorageProvider` — works with `LocalCacheManager`,
 * `ProviderBase` metadata caching, and all other MJ subsystems that use `ILocalStorageProvider`.
 *
 * @example
 * ```typescript
 * import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
 *
 * const provider = new RedisLocalStorageProvider({
 *     url: 'redis://localhost:6379',
 *     defaultTTLSeconds: 300
 * });
 * ```
 */
export { RedisLocalStorageProvider, RedisProviderConfig, CachePublishMode, KeyLockTimeoutError, KeyLockLostError } from './RedisLocalStorageProvider.js';
export {
    ClearSharedCacheCategories,
    SHARED_CACHE_WRITE_CATEGORIES,
    SharedCacheCategoryClear,
    SharedCacheClearOptions,
} from './SharedCacheClear.js';

// Re-export CacheChangedEvent from core for convenience
// (consumers can also import directly from @memberjunction/core)
export type { CacheChangedEvent } from '@memberjunction/core';

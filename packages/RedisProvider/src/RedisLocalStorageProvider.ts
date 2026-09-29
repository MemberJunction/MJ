/**
 * @fileoverview Redis-backed implementation of {@link ILocalStorageProvider}.
 *
 * This module provides a drop-in replacement for `InMemoryLocalStorageProvider`
 * that persists data in Redis, enabling:
 *
 * - **Shared caching** across multiple MJAPI server instances (horizontal scaling)
 * - **Persistence** across process restarts
 * - **Native TTL** via Redis `EXPIRE` — expired keys are automatically reclaimed
 *
 * Compatible with any Redis-protocol service: self-hosted Redis, Azure Managed Redis,
 * AWS ElastiCache, Redis Cloud, Upstash, etc.
 *
 * @module @memberjunction/redis-provider
 */

import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { ILocalStorageProvider, LogStatus, LogError } from '@memberjunction/core';
import type { CacheChangedEvent, LocalStorageWriteOptions } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

/**
 * Configuration options for the Redis local storage provider.
 *
 * Accepts either a Redis connection URL string or an `ioredis` options object,
 * plus optional MemberJunction-specific settings.
 *
 * @example
 * ```typescript
 * // Simple URL connection (works with Azure, AWS, self-hosted)
 * const config: RedisProviderConfig = {
 *     url: 'rediss://default:password@my-redis.example.com:6380'
 * };
 *
 * // Full options object with MJ settings
 * const config: RedisProviderConfig = {
 *     options: {
 *         host: 'localhost',
 *         port: 6379,
 *         password: 'secret',
 *         tls: {},
 *         db: 0,
 *     },
 *     keyPrefix: 'myapp',
 *     defaultTTLSeconds: 600,
 * };
 * ```
 */
export interface RedisProviderConfig {
    /**
     * Redis connection URL (e.g., `redis://localhost:6379`, `rediss://user:pass@host:6380`).
     * Mutually exclusive with `options`.
     * The `rediss://` scheme enables TLS, which is required for most cloud-hosted Redis services.
     */
    url?: string;

    /**
     * Full `ioredis` options object for fine-grained connection control.
     * Mutually exclusive with `url`.
     *
     * @see https://github.com/redis/ioredis?tab=readme-ov-file#connect-to-redis
     */
    options?: RedisOptions;

    /**
     * Optional prefix prepended to all Redis keys. Useful for isolating
     * MemberJunction data in a shared Redis instance.
     *
     * Keys are stored as `{keyPrefix}:{category}:{key}`.
     *
     * @default 'mj'
     */
    keyPrefix?: string;

    /**
     * Default time-to-live in seconds applied to every `SetItem` call
     * unless the call passes its own TTL.
     *
     * Event-driven invalidation stays the primary freshness mechanism; the TTL bounds how long
     * an entry written by a process that never publishes (a direct SQL change, another
     * application) can be served, and gives a `volatile-*` eviction policy something to evict —
     * Redis never evicts a key without an expiry under those policies.
     *
     * Set to `0` to store keys without expiration (persistent).
     *
     * @default 3600 (one hour)
     */
    defaultTTLSeconds?: number;

    /**
     * Expiry per category, overriding {@link defaultTTLSeconds} (0 = no expiry). Defaults to
     * `{ default: 0 }`.
     *
     * The `default` category holds **proxy keys**: entries that vouch for other entries. The
     * metadata snapshot's timestamps key is written after the payload it describes, and a dataset's
     * `_date` key after its blob — so under one blanket TTL the proxy outlives what it vouches for,
     * and a reader finds a freshness claim with nothing behind it. A server booting into that
     * window adopted the timestamps and served empty metadata as current; the dataset check threw.
     * Plan §16.3 #3.
     */
    categoryTTLSeconds?: Readonly<Record<string, number>>;

    /**
     * Maximum number of connection retry attempts before giving up.
     * Each retry uses exponential backoff (doubling delay up to 30 seconds).
     *
     * @default 10
     */
    maxRetries?: number;

    /**
     * Whether to log connection events (connect, disconnect, error) via
     * MemberJunction's `LogStatus` / `LogError` functions.
     *
     * @default true
     */
    enableLogging?: boolean;

    /**
     * Whether to enable Redis pub/sub for cross-server cache invalidation.
     * When enabled, the provider will:
     * - **Publish** a {@link CacheChangedEvent} on every `SetItem`, `Remove`, and `ClearCategory` call
     * - **Subscribe** (via a dedicated second Redis connection) for events from other servers
     * - **Emit** local events so consumers (like `LocalCacheManager`) can dispatch to registered callbacks
     *
     * Pub/sub is **not** started automatically — call {@link RedisLocalStorageProvider.StartListening}
     * after construction to begin subscribing.
     *
     * @default false
     */
    enablePubSub?: boolean;

    /**
     * What a `set` or `removed` publishes, per category (the category `default` covers writes
     * without one). `category_cleared` is always published in full.
     *
     * - `'full'` — the event carries the stored value in `Data`, so a subscriber can apply it
     *   without reading Redis. Right for categories whose values subscribers adopt (the RunView
     *   cache: engines apply the rows).
     * - `'notice'` — the event names the key but carries no value. Right for large values that
     *   subscribers only need to know changed (the metadata snapshot: a server that hears about it
     *   re-checks its metadata against the database).
     * - `'none'` — nothing is published.
     *
     * Categories not listed use {@link defaultPublishMode}.
     */
    publishModes?: Readonly<Record<string, CachePublishMode>>;

    /**
     * Publish mode for categories not named in {@link publishModes}.
     * @default 'full' (every change carries its value — the behaviour before modes existed)
     */
    defaultPublishMode?: CachePublishMode;
}

/** How much a cache write publishes. See {@link RedisProviderConfig.publishModes}. */
export type CachePublishMode = 'full' | 'notice' | 'none';

/**
 * Default category used when none is specified in storage operations.
 * @internal
 */
const DEFAULT_CATEGORY = 'default';

/**
 * Categories whose expiry differs from the default. The `default` category never expires on its
 * own: it holds keys that vouch for other keys, and a proxy that outlives its subject is worse
 * than one that never expires. See {@link RedisProviderConfig.categoryTTLSeconds}.
 * @internal
 */
const DEFAULT_CATEGORY_TTL_SECONDS: Readonly<Record<string, number>> = { default: 0 };

/** Expiry applied when the configuration does not set `defaultTTLSeconds`. @internal */
const DEFAULT_TTL_SECONDS = 3600;

/** Keys requested per `SCAN` step. @internal */
const SCAN_BATCH = 500;

/**
 * Adds a key to an index-group set and keeps the set alive at least as long as its longest-lived
 * member, atomically.
 *
 * KEYS[1] = the group set, ARGV[1] = the member key, ARGV[2] = the member's TTL in seconds (0 = none).
 *
 * - A member stored without expiry makes the set persistent.
 * - A member with a TTL extends the set's expiry when the set would otherwise expire first.
 * - A set that is persistent and already holds other members keeps no expiry: every TTL write
 *   gives the set an expiry, so a persistent set with more than one member holds a persistent
 *   member.
 *
 * Only `SADD`/`TTL`/`SCARD`/`EXPIRE`/`PERSIST` — no Redis 7-only flags, so it runs on the 6.x
 * tiers that hosted Redis services still offer.
 * @internal
 */
/**
 * Prunes one index group and returns its live members, atomically.
 *
 * Every step — reading the set, testing each member, removing the dead ones, dropping a set that
 * ends up empty — has to happen without another process's `SADD` landing in between. Done as
 * separate round trips (SMEMBERS, a pipeline of EXISTS, then SREM/DEL), a peer adding a key after
 * the read was removed by a DEL that had never seen it, and that slot lost its invalidation hook
 * permanently: no later save could find it through the index, so every server served it stale until
 * it expired. Plan §22.
 *
 * KEYS[1] = the group set, ARGV[1] = the `{prefix}:{category}:` prefix of a member's own key.
 * @internal
 */
const PRUNE_GROUP_SCRIPT = `
local members = redis.call('SMEMBERS', KEYS[1])
if #members == 0 then
  return {}
end
local alive = {}
local dead = {}
for i = 1, #members do
  if redis.call('EXISTS', ARGV[1] .. members[i]) == 1 then
    alive[#alive + 1] = members[i]
  else
    dead[#dead + 1] = members[i]
  end
end
if #dead > 0 then
  if #alive == 0 then
    -- Deleting beats emptying: a set made persistent by a member without expiry stays persistent
    -- once that member goes, and a volatile-* maxmemory policy can never evict it (§16.3 #11).
    redis.call('DEL', KEYS[1])
  else
    redis.call('SREM', KEYS[1], unpack(dead))
  end
end
return alive
`;

const ADD_TO_GROUP_SCRIPT = `
redis.call('SADD', KEYS[1], ARGV[1])
local ttl = tonumber(ARGV[2])
if ttl <= 0 then
  redis.call('PERSIST', KEYS[1])
  return 0
end
local current = redis.call('TTL', KEYS[1])
if current == -1 and redis.call('SCARD', KEYS[1]) > 1 then
  return 0
end
if current < ttl then
  redis.call('EXPIRE', KEYS[1], ttl)
end
return 1
`;

/** Deletes a lock key only if it still holds the caller's token. @internal */
const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/** How long a key lock lives if its holder dies, and how long a caller waits for one. @internal */
const KEY_LOCK_TTL_MS = 10000;
const KEY_LOCK_WAIT_MS = 5000;
const KEY_LOCK_RETRY_MS = 20;
/** How often a held lock is extended while its work runs. Must be well under the TTL. @internal */
const KEY_LOCK_RENEW_MS = 3000;
/**
 * The longest a lock is renewed for. Renewal keeps a slow read-modify-write safe; without a cap it
 * also keeps a HUNG one holding the key forever, which is worse than the expiry it replaced — no
 * other process could ever take that slot again. Past this, renewal stops and the lock expires on
 * its own TTL, as it did before renewal existed (plan §22).
 * @internal
 */
const KEY_LOCK_MAX_HOLD_MS = 60000;

/** Extends a lock's expiry only if the caller still holds it. @internal */
const RENEW_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

/**
 * Thrown by {@link RedisLocalStorageProvider.WithKeyLock} when the lock could not be taken in
 * time — distinct from anything `work` itself throws, so a caller can tell "another process is
 * holding this slot" (fall back to invalidating it) from "my own read-modify-write is broken"
 * (a bug, which must not be silently downgraded to an invalidation). Plan §16.3 #12.
 */
export class KeyLockTimeoutError extends Error {
    public constructor(public readonly LockKey: string, waitedMs: number) {
        super(`timed out after ${waitedMs} ms waiting for another process's lock`);
        this.name = 'KeyLockTimeoutError';
    }
}

/**
 * Thrown when a held lock expired before its work finished — the work may have raced another
 * writer, so its result must not be trusted.
 */
export class KeyLockLostError extends Error {
    public constructor(public readonly LockKey: string) {
        super(`the lock expired before the work completed; another process may have written the same key`);
        this.name = 'KeyLockLostError';
    }
}

/**
 * Escapes the glob metacharacters Redis `MATCH` understands, so a literal prefix or category can
 * be embedded in a pattern.
 * @internal
 */
function escapeGlob(literal: string): string {
    return literal.replace(/[*?[\]\\]/g, ch => `\\${ch}`);
}

/**
 * Redis-backed implementation of the MemberJunction {@link ILocalStorageProvider} interface.
 *
 * Provides persistent, shared caching for server-side environments using Redis.
 * This is a drop-in replacement for `InMemoryLocalStorageProvider` — all consumers
 * (like `LocalCacheManager`, `ProviderBase` metadata caching, etc.) work without
 * any code changes.
 *
 * ### Key Structure
 *
 * All keys follow the pattern: `{prefix}:{category}:{key}`
 *
 * - **prefix** — configurable, defaults to `"mj"` to isolate MJ data in shared Redis instances
 * - **category** — maps to the MJ cache category (`RunViewCache`, `Metadata`, `DatasetCache`, etc.)
 * - **key** — the original key from the caller
 *
 * Keys written with an `IndexGroup` are also recorded in a Redis Set at
 * `{prefix}:__group__:{category}:{group}` (the RunView cache uses the entity name), which
 * `GetIndexGroupKeys()` reads and prunes. `ClearCategory()` and `GetCategoryKeys()` walk the
 * keyspace with `SCAN`; no category-wide set is kept, because expiry never removes set members
 * and such a set grows without bound once keys carry a TTL.
 *
 * ### TTL Support
 *
 * Redis has native key expiration. The provider supports TTL at two levels:
 * 1. **`defaultTTLSeconds`** in config — applied to all `SetItem` calls
 * 2. **`ttlSeconds` parameter** on `SetItem` — overrides the default per-call
 *
 * ### Error Handling
 *
 * Redis operations are wrapped in try/catch blocks. Connection errors are logged
 * via `LogError()` but do not throw — the provider gracefully returns `null` for
 * reads and silently skips writes. This prevents a Redis outage from crashing the
 * application. The `ioredis` client handles automatic reconnection.
 *
 * @example
 * ```typescript
 * import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
 *
 * const provider = new RedisLocalStorageProvider({
 *     url: 'redis://localhost:6379',
 *     defaultTTLSeconds: 300  // 5-minute default TTL
 * });
 *
 * await provider.SetItem('user:123', JSON.stringify(userData), 'UserCache');
 * const cached = await provider.GetItem('user:123', 'UserCache');
 * ```
 */
export class RedisLocalStorageProvider implements ILocalStorageProvider {
    /**
     * `false` — values are JSON-serialized onto the wire and parsed back on read, so a
     * Redis-backed cache never hands out a live reference to a caller's object.
     * See {@link ILocalStorageProvider.SharesReferences}.
     */
    public readonly SharesReferences = false;

    /**
     * `true` — every process configured with the same URL and key prefix shares this keyspace.
     * See {@link ILocalStorageProvider.SharedAcrossProcesses}.
     */
    public readonly SharedAcrossProcesses = true;

    private _client: Redis;
    private _keyPrefix: string;
    private _defaultTTLSeconds: number;
    private _categoryTTLSeconds: Readonly<Record<string, number>>;
    private _enableLogging: boolean;
    /** Tokens of the leases this provider holds, so it releases only its own. */
    private readonly _leaseTokens = new Map<string, string>();
    private _connected: boolean = false;

    // Pub/sub fields
    private _enablePubSub: boolean;
    private _subscriber: Redis | null = null;
    private _pubSubChannel: string;
    private _eventEmitter: EventEmitter = new EventEmitter();
    private _subscriberConnected: boolean = false;
    /** Fully-qualified channel name -> handlers registered via {@link SubscribeToChannel}. */
    private _channelHandlers: Map<string, Set<(message: string) => void>> = new Map();
    /** Fully-qualified channel name -> the subscribe still in flight, shared by concurrent callers. */
    private _pendingChannelSubscribes: Map<string, Promise<Set<(message: string) => void>>> = new Map();
    private _config: RedisProviderConfig;

    /**
     * Creates a new Redis local storage provider and establishes a connection.
     *
     * The constructor sets up the `ioredis` client with automatic reconnection,
     * error handling, and optional logging. The client connects lazily on the
     * first command, so construction itself does not block.
     *
     * @param config - Redis connection and behavior configuration.
     *                 At minimum, provide either `url` or `options`.
     *                 If neither is provided, connects to `localhost:6379`.
     *
     * @example
     * ```typescript
     * // Connect to local Redis
     * const provider = new RedisLocalStorageProvider({});
     *
     * // Connect to Azure Managed Redis with TLS
     * const provider = new RedisLocalStorageProvider({
     *     url: 'rediss://default:ACCESS_KEY@myredis.redis.cache.windows.net:6380',
     *     defaultTTLSeconds: 600
     * });
     *
     * // Connect to AWS ElastiCache
     * const provider = new RedisLocalStorageProvider({
     *     options: {
     *         host: 'my-cluster.abc123.use1.cache.amazonaws.com',
     *         port: 6379,
     *         tls: {}
     *     }
     * });
     * ```
     */
    constructor(config: RedisProviderConfig = {}) {
        this._config = config;
        this._keyPrefix = config.keyPrefix ?? 'mj';
        this._defaultTTLSeconds = config.defaultTTLSeconds ?? DEFAULT_TTL_SECONDS;
        this._categoryTTLSeconds = config.categoryTTLSeconds ?? DEFAULT_CATEGORY_TTL_SECONDS;
        this._enableLogging = config.enableLogging ?? true;
        this._enablePubSub = config.enablePubSub ?? false;
        this._pubSubChannel = `${this._keyPrefix}:__pubsub__`;

        const maxRetries = config.maxRetries ?? 10;

        if (config.url) {
            this._client = new Redis(config.url, {
                maxRetriesPerRequest: null,
                retryStrategy: (times: number) => this.retryStrategy(times, maxRetries),
                lazyConnect: false,
            });
        } else {
            this._client = new Redis({
                host: 'localhost',
                port: 6379,
                maxRetriesPerRequest: null,
                retryStrategy: (times: number) => this.retryStrategy(times, maxRetries),
                lazyConnect: false,
                ...config.options,
            });
        }

        this.setupEventHandlers();
    }

    /**
     * Exponential backoff retry strategy for Redis connections.
     * Doubles the delay on each attempt (capped at 30 seconds) and gives up
     * after `maxRetries` attempts.
     *
     * @param times - Current retry attempt number (1-based)
     * @param maxRetries - Maximum number of retries before giving up
     * @returns Delay in milliseconds, or `null` to stop retrying
     * @internal
     */
    private retryStrategy(times: number, maxRetries: number): number | null {
        if (times > maxRetries) {
            if (this._enableLogging) {
                LogError(`Redis: max retries (${maxRetries}) exceeded, giving up`);
            }
            return null;
        }
        // Exponential backoff: 200ms, 400ms, 800ms, ... capped at 30s
        const delay = Math.min(times * 200, 30000);
        if (this._enableLogging) {
            LogStatus(`Redis: reconnecting in ${delay}ms (attempt ${times}/${maxRetries})`);
        }
        return delay;
    }

    /**
     * Registers event handlers on the ioredis client for logging connection
     * lifecycle events (connect, ready, close, error, reconnecting).
     * @internal
     */
    private setupEventHandlers(): void {
        this._client.on('connect', () => {
            this._connected = true;
            if (this._enableLogging) {
                LogStatus('Redis: connected');
            }
        });

        this._client.on('ready', () => {
            this._connected = true;
            if (this._enableLogging) {
                LogStatus('Redis: ready to accept commands');
            }
        });

        this._client.on('close', () => {
            this._connected = false;
            if (this._enableLogging) {
                LogStatus('Redis: connection closed');
            }
        });

        this._client.on('error', (err: Error) => {
            if (this._enableLogging) {
                LogError(`Redis: ${err.message}`);
            }
        });

        this._client.on('reconnecting', () => {
            if (this._enableLogging) {
                LogStatus('Redis: reconnecting...');
            }
        });
    }

    /**
     * Builds the full Redis key from a category and key name.
     *
     * Format: `{prefix}:{category}:{key}`
     *
     * @param key - The storage key
     * @param category - The category for key isolation
     * @returns The fully-qualified Redis key string
     * @internal
     */
    private buildKey(key: string, category: string): string {
        return `${this._keyPrefix}:${category}:${key}`;
    }

    /**
     * Builds the Redis Set key used to track all keys in a category.
     *
     * Format: `{prefix}:__categories__:{category}`
     *
     * @param category - The category name
     * @returns The Redis key for the category's membership set
     * @internal
     */
    private buildCategorySetKey(category: string): string {
        return `${this._keyPrefix}:__categories__:${category}`;
    }

    /**
     * Builds the Redis Set key that indexes the keys written with one
     * {@link LocalStorageWriteOptions.IndexGroup} in a category.
     *
     * Format: `{prefix}:__group__:{category}:{group}`
     * @internal
     */
    private buildGroupSetKey(category: string, group: string): string {
        return `${this._keyPrefix}:__group__:${category}:${group}`;
    }

    /**
     * Resolves the TTL for one write: the per-call value when given (a bare number is the legacy
     * `ttlSeconds` argument), then the category's own expiry, then the configured default. `0`
     * means no expiry.
     * @internal
     */
    private resolveWriteOptions(options: number | LocalStorageWriteOptions | undefined, category: string): { ttlSeconds: number; group?: string } {
        const explicit = typeof options === 'number' ? options : options?.TTLSeconds;
        const ttlSeconds = explicit ?? this._categoryTTLSeconds[category] ?? this._defaultTTLSeconds;
        const group = typeof options === 'object' ? options.IndexGroup : undefined;
        return { ttlSeconds: ttlSeconds > 0 ? Math.ceil(ttlSeconds) : 0, group };
    }

    /**
     * Lists every Redis key matching a glob pattern with `SCAN`, which never blocks the server
     * the way `KEYS` does. Used only for category-wide operations, not on the per-save path.
     * @internal
     */
    private async scanKeys(pattern: string): Promise<string[]> {
        const found: string[] = [];
        let cursor = '0';
        do {
            const [next, batch] = await this._client.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_BATCH);
            found.push(...batch);
            cursor = next;
        } while (cursor !== '0');
        return found;
    }

    /**
     * Deletes Redis keys in fixed-size batches so one call never sends an unbounded argument list.
     * @internal
     */
    private async deleteKeys(redisKeys: string[]): Promise<void> {
        for (let i = 0; i < redisKeys.length; i += SCAN_BATCH) {
            await this._client.del(...redisKeys.slice(i, i + SCAN_BATCH));
        }
    }

    /**
     * Retrieves a value from Redis by key and optional category.
     *
     * Redis stores values as strings — this method JSON-deserializes the stored value
     * internally so callers see a typed object back. Returns `null` for missing keys,
     * Redis unavailability, or corrupt JSON.
     *
     * @typeParam T - Expected type of the stored value. Caller-controlled.
     * @param key - The key to look up
     * @param category - Optional category for key isolation (defaults to `"default"`)
     *
     * @example
     * ```typescript
     * interface CachedEntity { ID: string; Name: string; }
     * const value = await provider.GetItem<CachedEntity>('entity-metadata', 'Metadata');
     * if (value) {
     *     console.log(value.Name);  // already typed
     * }
     * ```
     */
    public async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        try {
            const redisKey = this.buildKey(key, category ?? DEFAULT_CATEGORY);
            const raw = await this._client.get(redisKey);
            if (raw === null) return null;
            try {
                return JSON.parse(raw) as T;
            } catch {
                // Corrupt entry — treat as cache miss so the caller refetches.
                if (this._enableLogging) {
                    LogError(`Redis GetItem: failed to JSON.parse value at "${redisKey}" — treating as cache miss`);
                }
                return null;
            }
        } catch (err) {
            if (this._enableLogging) {
                LogError(`Redis GetItem failed for key "${key}": ${(err as Error).message}`);
            }
            return null;
        }
    }

    /**
     * Batched read using Redis `MGET` — one command, one network round-trip,
     * N values returned. For N keys this is ~N× faster than individual `GET`s
     * which each pay full RTT.
     *
     * Inputs are deduplicated (same key requested twice → one Redis fetch, one
     * map entry). Missing keys, corrupt JSON entries, and Redis errors all map
     * to `null` for the affected key — callers see them as cache misses.
     *
     * @typeParam T - Expected type of all stored values. Caller-controlled.
     * @param keys - The keys to retrieve.
     * @param category - Optional category for key isolation.
     */
    public async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        const out = new Map<string, T | null>();
        if (keys.length === 0) return out;

        try {
            const cat = category ?? DEFAULT_CATEGORY;
            const uniqueKeys = Array.from(new Set(keys));
            const redisKeys = uniqueKeys.map(k => this.buildKey(k, cat));

            // MGET returns an array of strings/nulls in the same order as the inputs.
            // ioredis variadic call: pass keys as separate args.
            const raws = await this._client.mget(...redisKeys);

            for (let i = 0; i < uniqueKeys.length; i++) {
                const raw = raws[i];
                if (raw === null) {
                    out.set(uniqueKeys[i], null);
                    continue;
                }
                try {
                    out.set(uniqueKeys[i], JSON.parse(raw) as T);
                } catch {
                    if (this._enableLogging) {
                        LogError(`Redis GetItems: failed to JSON.parse value at "${redisKeys[i]}" — treating as cache miss`);
                    }
                    out.set(uniqueKeys[i], null);
                }
            }
            return out;
        } catch (err) {
            if (this._enableLogging) {
                LogError(`Redis GetItems failed for ${keys.length} keys: ${(err as Error).message}`);
            }
            // On error, return null entries for every requested key — callers see them as cache misses.
            for (const key of new Set(keys)) {
                out.set(key, null);
            }
            return out;
        }
    }

    /**
     * Stores a value in Redis under the given key and optional category.
     *
     * Redis stores values as strings — this method JSON-serializes the value internally.
     * Callers should pass plain data (objects/arrays/primitives). Class instances will
     * lose their prototype on retrieval; functions, Maps, Sets, and Dates have JSON's
     * usual limitations.
     *
     * The key expires after the per-call TTL when one is given, otherwise after the configured
     * `defaultTTLSeconds`. If neither is set (or the value is `0`), the key persists indefinitely.
     *
     * When the options carry an `IndexGroup`, the key is also added to that group's Redis Set so
     * {@link GetIndexGroupKeys} can find it. The set is kept alive at least as long as its
     * longest-lived member. There is no category-wide set: one would grow for ever once keys
     * expire, because expiry never removes set members. Category-wide operations use `SCAN`.
     *
     * @typeParam T - Type of the value being stored. Caller-controlled.
     * @param key - The key to store under
     * @param value - The value to store (will be JSON-serialized internally)
     * @param category - Optional category for key isolation (defaults to `"default"`)
     * @param options - Expiry and index group. A bare number is accepted as the TTL in seconds.
     *
     * @example
     * ```typescript
     * // Store with default TTL
     * await provider.SetItem('view:users', { results, maxUpdatedAt }, 'RunViewCache');
     *
     * // Store with explicit 10-minute TTL, indexed under the entity name
     * await provider.SetItem('Users|…', { results }, 'RunViewCache', { TTLSeconds: 600, IndexGroup: 'Users' });
     * ```
     */
    public async SetItem<T>(key: string, value: T, category?: string, options?: number | LocalStorageWriteOptions): Promise<void> {
        try {
            const cat = category ?? DEFAULT_CATEGORY;
            const redisKey = this.buildKey(key, cat);

            // Serialize once. We need the string for both the Redis SET and (optionally)
            // the pub/sub publishChange payload, so build it up front.
            let serialized: string;
            try {
                serialized = JSON.stringify(value);
            } catch (err) {
                if (this._enableLogging) {
                    LogError(`Redis SetItem: failed to JSON.stringify value for "${redisKey}": ${(err as Error).message}`);
                }
                return;
            }

            const { ttlSeconds, group } = this.resolveWriteOptions(options, cat);
            const pipeline = this._client.pipeline();
            if (ttlSeconds > 0) {
                pipeline.setex(redisKey, ttlSeconds, serialized);
            } else {
                pipeline.set(redisKey, serialized);
            }
            if (group) {
                pipeline.eval(ADD_TO_GROUP_SCRIPT, 1, this.buildGroupSetKey(cat, group), key, ttlSeconds);
            }
            this.logPipelineErrors(await pipeline.exec(), `SetItem "${key}"`);

            // Publish cache change event for cross-server invalidation
            this.publishChange(key, cat, 'set', serialized);
        } catch (err) {
            if (this._enableLogging) {
                LogError(`Redis SetItem failed for key "${key}": ${(err as Error).message}`);
            }
        }
    }

    /**
     * Removes a key from Redis and from its category tracking set.
     *
     * @param key - The key to remove
     * @param category - Optional category for key isolation (defaults to `"default"`)
     *
     * @example
     * ```typescript
     * await provider.Remove('view:users', 'RunViewCache');
     * ```
     */
    public async Remove(key: string, category?: string): Promise<void> {
        try {
            const cat = category ?? DEFAULT_CATEGORY;
            // Index-group membership is not touched here: the caller does not say which group the
            // key was in, and GetIndexGroupKeys drops members whose key no longer exists.
            await this._client.del(this.buildKey(key, cat));

            // Publish cache change event for cross-server invalidation
            this.publishChange(key, cat, 'removed');
        } catch (err) {
            if (this._enableLogging) {
                LogError(`Redis Remove failed for key "${key}": ${(err as Error).message}`);
            }
        }
    }

    /**
     * Clears all keys belonging to a specific category, together with the category's index-group
     * sets and the category set older versions of this provider maintained.
     *
     * Keys are found with `SCAN`, so the operation also removes keys a peer wrote and keys whose
     * index entry was lost.
     *
     * @param category - The category to clear. If empty, clears the `"default"` category.
     *
     * @example
     * ```typescript
     * // Clear all cached RunView results
     * await provider.ClearCategory('RunViewCache');
     * ```
     */
    public async ClearCategory(category: string): Promise<void> {
        await this.ClearCategoryChecked(category);
    }

    /**
     * {@link ClearCategory}, but reporting what happened instead of swallowing it. An administrator
     * running `mj cache clear` needs to know a category did NOT go: the old path logged (with
     * logging off, by default, in the CLI) and returned normally, so the command printed a key
     * count and "servers will reload" for a clear that never happened (plan §16.3 #15).
     *
     * @returns Ok, plus the error when it failed.
     */
    public async ClearCategoryChecked(category: string): Promise<{ Ok: boolean; Error?: string }> {
        try {
            const cat = category || DEFAULT_CATEGORY;
            const prefix = escapeGlob(this._keyPrefix);
            const escapedCat = escapeGlob(cat);
            const entryKeys = await this.scanKeys(`${prefix}:${escapedCat}:*`);
            const groupKeys = await this.scanKeys(`${prefix}:__group__:${escapedCat}:*`);
            await this.deleteKeys([...entryKeys, ...groupKeys, this.buildCategorySetKey(cat)]);

            // Publish category-level change event
            this.publishChange(cat, cat, 'category_cleared');
            return { Ok: true };
        } catch (err) {
            const message = (err as Error).message;
            if (this._enableLogging) {
                LogError(`Redis ClearCategory failed for "${category}": ${message}`);
            }
            return { Ok: false, Error: message };
        }
    }

    /**
     * Returns all live keys belonging to a specific category.
     *
     * Walks the keyspace with `SCAN`, so the cost grows with the whole keyspace. Meant for
     * administration and diagnostics; per-entity lookups on the save path use
     * {@link GetIndexGroupKeys}.
     *
     * @param category - The category to list keys from
     * @returns Array of original key names (without the Redis prefix/category prefix)
     *
     * @example
     * ```typescript
     * const keys = await provider.GetCategoryKeys('RunViewCache');
     * console.log(`${keys.length} cached views`);
     * ```
     */
    public async GetCategoryKeys(category: string): Promise<string[]> {
        try {
            const cat = category || DEFAULT_CATEGORY;
            const redisPrefix = this.buildKey('', cat);
            const redisKeys = await this.scanKeys(`${escapeGlob(redisPrefix)}*`);
            return redisKeys.map(k => k.substring(redisPrefix.length));
        } catch (err) {
            if (this._enableLogging) {
                LogError(`Redis GetCategoryKeys failed for "${category}": ${(err as Error).message}`);
            }
            return [];
        }
    }

    /**
     * Returns the keys written to `category` with `IndexGroup = group` that still exist.
     *
     * Members whose key has expired or been removed are dropped from the group set as a side
     * effect, so the set shrinks back to the live keys whenever it is read. The read and the prune
     * are one Lua script: a peer's `SADD` cannot land between them and be pruned unseen (§22).
     *
     * @param category - The category the keys were written to
     * @param group - The index group (for the RunView cache, the entity name)
     * @returns The live keys, without the Redis prefix/category prefix
     */
    public async GetIndexGroupKeys(category: string, group: string): Promise<string[]> {
        try {
            const cat = category || DEFAULT_CATEGORY;
            const groupSetKey = this.buildGroupSetKey(cat, group);
            const alive = await this._client.eval(PRUNE_GROUP_SCRIPT, 1, groupSetKey, this.buildKey('', cat));
            return Array.isArray(alive) ? alive.map(m => String(m)) : [];
        } catch (err) {
            if (this._enableLogging) {
                LogError(`Redis GetIndexGroupKeys failed for "${category}"/"${group}": ${(err as Error).message}`);
            }
            return [];
        }
    }

    /**
     * Runs `work` holding an exclusive lock on `key` across every process sharing this keyspace.
     *
     * The lock is `SET {prefix}:__lock__:{category}:{key} <token> NX PX 10000`, retried every 20 ms
     * for up to 5 s, and released only by its holder (compare-and-delete). The 10 s expiry frees a
     * lock whose holder died; `work` is expected to be a short read-modify-write.
     *
     * @throws when the lock is not acquired in time; `work` has not run
     */
    public async WithKeyLock<T>(key: string, category: string, work: () => Promise<T>): Promise<T> {
        const lockKey = `${this._keyPrefix}:__lock__:${category || DEFAULT_CATEGORY}:${key}`;
        const token = randomUUID();
        await this.acquireLock(lockKey, token);
        // Work longer than the TTL used to lose the lock silently: it expired, another process took
        // it, and both wrote — the very lost update this lock exists to prevent. The lock is now
        // extended while the work runs, and a lock that was lost anyway (a stalled renewal, a
        // failover) is reported rather than ignored (plan §16.3 #12).
        const renewUntil = Date.now() + KEY_LOCK_MAX_HOLD_MS;
        const renewal = setInterval(() => {
            if (Date.now() >= renewUntil) {
                clearInterval(renewal);
                LogError(`Redis key lock "${lockKey}" has been held for ${KEY_LOCK_MAX_HOLD_MS} ms; no longer renewing it, so it expires on its own and other processes can proceed. The work holding it is hung.`);
                return;
            }
            this.renewLock(lockKey, token).catch(() => undefined);
        }, KEY_LOCK_RENEW_MS);
        if (typeof renewal === 'object' && renewal !== null && 'unref' in renewal) {
            (renewal as { unref(): void }).unref();
        }
        try {
            const result = await work();
            if (!(await this.stillHoldsLock(lockKey, token))) {
                throw new KeyLockLostError(lockKey);
            }
            return result;
        } finally {
            clearInterval(renewal);
            await this.releaseLock(lockKey, token);
        }
    }

    /** Extends this holder's lock. @internal */
    private async renewLock(lockKey: string, token: string): Promise<void> {
        await this._client.eval(RENEW_LOCK_SCRIPT, 1, lockKey, token, String(KEY_LOCK_TTL_MS));
    }

    /** Whether this holder's token is still the one in the lock. @internal */
    private async stillHoldsLock(lockKey: string, token: string): Promise<boolean> {
        try {
            return (await this._client.get(lockKey)) === token;
        } catch {
            return true; // cannot tell; do not turn an unreadable check into a failed write
        }
    }

    /**
     * Claims `{prefix}:__lease__:{name}` for `ttlMs` with `SET NX PX`, so one process in the fleet
     * runs a periodic job per period. The lease is not released; it expires.
     */
    public async TryAcquireLease(name: string, ttlMs: number): Promise<boolean> {
        const token = randomUUID();
        const claimed = (await this._client.set(this.leaseKey(name), token, 'PX', Math.max(1, Math.floor(ttlMs)), 'NX')) === 'OK';
        if (claimed) {
            this._leaseTokens.set(name, token);
        }
        return claimed;
    }

    /**
     * Extends a lease this provider holds, without being able to extend anyone else's: the script
     * only acts when the stored token is this provider's. A lease that has already expired and been
     * taken by another process is NOT stolen back — the caller learns it lost its turn.
     *
     * @returns true when this process still holds the lease afterwards.
     */
    public async RenewLease(name: string, ttlMs: number): Promise<boolean> {
        const token = this._leaseTokens.get(name);
        if (!token) {
            return false;
        }
        const extended = await this._client.eval(RENEW_LOCK_SCRIPT, 1, this.leaseKey(name), token, String(Math.max(1, Math.floor(ttlMs))));
        return Number(extended) === 1;
    }

    /** Ends a lease this provider claimed, if it still holds it (compare-and-delete). */
    public async ReleaseLease(name: string): Promise<void> {
        const token = this._leaseTokens.get(name);
        if (!token) {
            return;
        }
        this._leaseTokens.delete(name);
        await this.releaseLock(this.leaseKey(name), token);
    }

    private leaseKey(name: string): string {
        return `${this._keyPrefix}:__lease__:${name}`;
    }

    /** @internal */
    private async acquireLock(lockKey: string, token: string): Promise<void> {
        const deadline = Date.now() + KEY_LOCK_WAIT_MS;
        for (;;) {
            if ((await this._client.set(lockKey, token, 'PX', KEY_LOCK_TTL_MS, 'NX')) === 'OK') {
                return;
            }
            if (Date.now() >= deadline) {
                throw new KeyLockTimeoutError(lockKey, KEY_LOCK_WAIT_MS);
            }
            await new Promise(resolve => setTimeout(resolve, KEY_LOCK_RETRY_MS));
        }
    }

    /** @internal */
    private async releaseLock(lockKey: string, token: string): Promise<void> {
        try {
            await this._client.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, token);
        } catch (err) {
            // The lock expires on its own; a failed release only delays the next writer.
            if (this._enableLogging) {
                LogError(`Redis lock release failed for "${lockKey}": ${(err as Error).message}`);
            }
        }
    }

    /** Logs any per-command failure a pipeline reported; `exec()` itself does not throw for them. @internal */
    private logPipelineErrors(results: [Error | null, unknown][] | null, context: string): void {
        if (!this._enableLogging || !results) {
            return;
        }
        for (const [err] of results) {
            if (err) {
                LogError(`Redis ${context}: ${err.message}`);
            }
        }
    }

    /**
     * Whether the Redis client currently has an active connection.
     *
     * Note: `ioredis` automatically reconnects on failure, so a `false` value
     * here is usually transient. The provider continues to accept commands
     * (they queue until reconnection succeeds or retry limit is hit).
     */
    public get IsConnected(): boolean {
        return this._connected;
    }

    /**
     * Returns the underlying `ioredis` client instance for advanced operations.
     *
     * Use with caution — direct client access bypasses key prefixing and
     * category tracking. Prefer the `ILocalStorageProvider` methods for
     * standard operations.
     *
     * @example
     * ```typescript
     * // Use for Redis-specific commands like pub/sub, streams, etc.
     * const client = provider.Client;
     * await client.publish('cache-invalidation', 'entity:Users');
     * ```
     */
    public get Client(): Redis {
        return this._client;
    }

    /**
     * Gracefully disconnects from Redis.
     *
     * Sends a `QUIT` command and waits for pending replies. After calling this
     * method, the provider should not be used for further operations.
     *
     * Call this during application shutdown to ensure clean disconnection.
     *
     * @example
     * ```typescript
     * // During application shutdown
     * process.on('SIGTERM', async () => {
     *     await redisProvider.Disconnect();
     *     process.exit(0);
     * });
     * ```
     */
    public async Disconnect(): Promise<void> {
        // Disconnect subscriber first if active
        if (this._subscriber) {
            try {
                await this._subscriber.quit();
            } catch {
                this._subscriber.disconnect();
            }
            this._subscriber = null;
            this._subscriberConnected = false;
        }

        // Remove all event listeners
        this._eventEmitter.removeAllListeners();
        this._channelHandlers.clear();

        try {
            await this._client.quit();
            this._connected = false;
            if (this._enableLogging) {
                LogStatus('Redis: disconnected gracefully');
            }
        } catch (err) {
            if (this._enableLogging) {
                LogError(`Redis disconnect error: ${(err as Error).message}`);
            }
            // Force disconnect if graceful quit fails
            this._client.disconnect();
            this._connected = false;
        }
    }

    /**
     * Checks if a key exists in the specified category.
     *
     * This is more efficient than `GetItem()` when you only need to check
     * existence without retrieving the value (avoids transferring the value
     * over the network).
     *
     * @param key - The key to check
     * @param category - Optional category for key isolation (defaults to `"default"`)
     * @returns `true` if the key exists and has not expired
     *
     * @example
     * ```typescript
     * if (await provider.Exists('view:users', 'RunViewCache')) {
     *     // Use cached value
     * }
     * ```
     */
    public async Exists(key: string, category?: string): Promise<boolean> {
        try {
            const redisKey = this.buildKey(key, category ?? DEFAULT_CATEGORY);
            const result = await this._client.exists(redisKey);
            return result === 1;
        } catch (err) {
            if (this._enableLogging) {
                LogError(`Redis Exists failed for key "${key}": ${(err as Error).message}`);
            }
            return false;
        }
    }

    /**
     * Returns the remaining time-to-live (in seconds) for a key.
     *
     * @param key - The key to check
     * @param category - Optional category for key isolation (defaults to `"default"`)
     * @returns TTL in seconds, `-1` if no expiration is set, `-2` if the key doesn't exist,
     *          or `null` if Redis is unavailable
     *
     * @example
     * ```typescript
     * const ttl = await provider.GetTTL('view:users', 'RunViewCache');
     * if (ttl !== null && ttl > 0) {
     *     console.log(`Key expires in ${ttl} seconds`);
     * }
     * ```
     */
    public async GetTTL(key: string, category?: string): Promise<number | null> {
        try {
            const redisKey = this.buildKey(key, category ?? DEFAULT_CATEGORY);
            return await this._client.ttl(redisKey);
        } catch (err) {
            if (this._enableLogging) {
                LogError(`Redis GetTTL failed for key "${key}": ${(err as Error).message}`);
            }
            return null;
        }
    }

    /**
     * Pings the Redis server to verify connectivity.
     *
     * Useful for health checks and connection validation.
     *
     * @returns `true` if the server responds with `PONG`, `false` otherwise
     *
     * @example
     * ```typescript
     * const healthy = await provider.Ping();
     * if (!healthy) {
     *     console.error('Redis is unreachable');
     * }
     * ```
     */
    public async Ping(): Promise<boolean> {
        try {
            const result = await this._client.ping();
            return result === 'PONG';
        } catch {
            return false;
        }
    }

    // ========================================================================
    // PUB/SUB — Cross-Server Cache Invalidation
    // ========================================================================

    /**
     * Starts listening for cache change events from other server instances.
     * Creates a dedicated Redis connection for pub/sub (required by Redis protocol —
     * a client in subscribe mode cannot execute other commands).
     *
     * Must be called explicitly after construction. No-op if `enablePubSub` is `false`
     * in the config, or if already listening.
     *
     * @example
     * ```typescript
     * const provider = new RedisLocalStorageProvider({
     *     url: 'redis://localhost:6379',
     *     enablePubSub: true
     * });
     * await provider.StartListening();
     *
     * // Register for change events
     * provider.OnCacheChanged((event) => {
     *     console.log(`Key "${event.CacheKey}" changed by server ${event.SourceServerId}`);
     * });
     * ```
     */
    public async StartListening(): Promise<void> {
        if (!this._enablePubSub) {
            if (this._enableLogging) {
                LogStatus('Redis pub/sub: not enabled (set enablePubSub: true in config)');
            }
            return;
        }

        if (this._subscriber) {
            // Already listening
            return;
        }

        this._subscriber = this.createSubscriberClient();
        this.setupSubscriberEventHandlers();

        await this._subscriber.subscribe(this._pubSubChannel);
        if (this._enableLogging) {
            LogStatus(`Redis pub/sub: subscribed to channel "${this._pubSubChannel}"`);
        }

        this._subscriber.on('message', (channel: string, message: string) => {
            if (channel === this._pubSubChannel) {
                this.handlePubSubMessage(message);
                return;
            }
            this.dispatchChannelMessage(channel, message);
        });
    }

    /**
     * Creates the subscriber Redis client, mirroring the main client's connection config.
     * @internal
     */
    private createSubscriberClient(): Redis {
        const maxRetries = this._config.maxRetries ?? 10;

        if (this._config.url) {
            return new Redis(this._config.url, {
                maxRetriesPerRequest: null,
                retryStrategy: (times: number) => this.retryStrategy(times, maxRetries),
                lazyConnect: false,
            });
        }

        return new Redis({
            host: 'localhost',
            port: 6379,
            maxRetriesPerRequest: null,
            retryStrategy: (times: number) => this.retryStrategy(times, maxRetries),
            lazyConnect: false,
            ...this._config.options,
        });
    }

    /**
     * Sets up event handlers on the subscriber client for logging.
     * @internal
     */
    private setupSubscriberEventHandlers(): void {
        if (!this._subscriber) return;

        this._subscriber.on('connect', () => {
            this._subscriberConnected = true;
            if (this._enableLogging) {
                LogStatus('Redis pub/sub subscriber: connected');
            }
        });

        this._subscriber.on('close', () => {
            this._subscriberConnected = false;
        });

        this._subscriber.on('error', (err: Error) => {
            if (this._enableLogging) {
                LogError(`Redis pub/sub subscriber: ${err.message}`);
            }
        });
    }

    /**
     * Handles an incoming pub/sub message. Parses the {@link CacheChangedEvent},
     * filters out self-originated events, and emits to local listeners.
     * @internal
     */
    private handlePubSubMessage(message: string): void {
        try {
            const event: CacheChangedEvent = JSON.parse(message);

            // Skip events from this server instance
            if (event.SourceServerId === MJGlobal.Instance.ProcessUUID) {
                return;
            }

            if (this._enableLogging) {
                const sourceShort = event.SourceServerId ? event.SourceServerId.substring(0, 8) : 'unknown';
                LogStatus(`Redis pub/sub: received ${event.Action} event for key "${event.CacheKey}" from server ${sourceShort}`);
            }

            // Emit to local listeners
            this._eventEmitter.emit('cacheChanged', event);
        } catch (err) {
            if (this._enableLogging) {
                LogError(`Redis pub/sub: failed to parse message: ${(err as Error).message}`);
            }
        }
    }

    /**
     * Publishes a cache change event to Redis pub/sub. Called internally by
     * `SetItem`, `Remove`, and `ClearCategory`. No-op if pub/sub is disabled.
     *
     * @param cacheKey - The cache key that changed
     * @param category - The storage category
     * @param action - What happened ('set', 'removed', 'category_cleared')
     * @param data - The new value (only for 'set' actions)
     * @internal
     */
    private publishChange(
        cacheKey: string,
        category: string,
        action: CacheChangedEvent['Action'],
        data?: string
    ): void {
        if (!this._enablePubSub) {
            return;
        }
        const mode = action === 'category_cleared' ? 'full' : this.publishModeFor(category);
        if (mode === 'none') {
            return;
        }
        if (mode === 'notice') {
            data = undefined;
        }

        const event: CacheChangedEvent = {
            CacheKey: cacheKey,
            Category: category,
            Action: action,
            Timestamp: Date.now(),
            SourceServerId: MJGlobal.Instance.ProcessUUID,
            Data: data,
        };

        // Publish fire-and-forget — don't await, don't block the caller
        const payload = JSON.stringify(event);
        this._client.publish(this._pubSubChannel, payload).then(() => {
            if (this._enableLogging) {
                LogStatus(`Redis pub/sub: published ${action} event for key "${cacheKey}" on channel "${this._pubSubChannel}"`);
            }
        }).catch((err) => {
            if (this._enableLogging) {
                LogError(`Redis pub/sub publish failed: ${(err as Error).message}`);
            }
        });
    }

    /** The configured publish mode for a category. @internal */
    private publishModeFor(category: string): CachePublishMode {
        return this._config.publishModes?.[category] ?? this._config.defaultPublishMode ?? 'full';
    }

    /**
     * Publishes an arbitrary message on a named channel. Fire-and-forget: the promise is not
     * awaited and a failure is logged rather than raised, so a caller on a hot path is never
     * blocked or broken by the message bus.
     *
     * The channel is namespaced with the provider's key prefix, so several applications can share
     * one Redis without hearing each other.
     *
     * @param channel Logical channel name (unprefixed).
     * @param payload Message body. Serialize before calling — this layer is shape-agnostic.
     */
    public PublishMessage(channel: string, payload: string): void {
        if (!this._enablePubSub) {
            return;
        }
        const fullChannel = this.qualifyChannel(channel);
        this._client.publish(fullChannel, payload).catch((err) => {
            if (this._enableLogging) {
                LogError(`Redis pub/sub publish failed on "${fullChannel}": ${(err as Error).message}`);
            }
        });
    }

    /**
     * Registers a handler for messages on a named channel, starting the subscriber if needed.
     *
     * No echo suppression happens here — this layer does not know the payload shape. A publisher
     * that needs it must stamp its own origin on the message and check it in the handler.
     *
     * @returns A function that removes this handler.
     */
    public async SubscribeToChannel(channel: string, handler: (message: string) => void): Promise<() => void> {
        if (!this._enablePubSub) {
            return () => undefined;
        }

        await this.StartListening();
        const fullChannel = this.qualifyChannel(channel);

        const handlers = await this.channelHandlersFor(fullChannel);
        handlers.add(handler);

        return () => {
            handlers.delete(handler);
        };
    }

    /**
     * The handler set for a channel, subscribing first when no caller has yet.
     *
     * Callers that arrive while a subscribe is in flight wait on that same subscribe. Each one
     * starting its own would publish its own handler set, and the last to finish would replace
     * the others' sets, so their handlers would never receive a message.
     */
    private channelHandlersFor(fullChannel: string): Promise<Set<(message: string) => void>> {
        const existing = this._channelHandlers.get(fullChannel);
        if (existing) {
            return Promise.resolve(existing);
        }
        const pending = this._pendingChannelSubscribes.get(fullChannel);
        if (pending) {
            return pending;
        }
        const subscribing = this.subscribeChannel(fullChannel).finally(() => {
            this._pendingChannelSubscribes.delete(fullChannel);
        });
        this._pendingChannelSubscribes.set(fullChannel, subscribing);
        return subscribing;
    }

    /**
     * Subscribes to a channel and publishes its handler set.
     *
     * The set is registered only once the subscribe has succeeded. A map entry published ahead of
     * the await would survive a rejection, and every later caller reads that entry as proof the
     * channel is subscribed — registering handlers against a channel Redis is not listening on,
     * with nothing surfaced.
     */
    private async subscribeChannel(fullChannel: string): Promise<Set<(message: string) => void>> {
        await this._subscriber?.subscribe(fullChannel);
        const handlers = new Set<(message: string) => void>();
        this._channelHandlers.set(fullChannel, handlers);
        if (this._enableLogging) {
            LogStatus(`Redis pub/sub: subscribed to channel "${fullChannel}"`);
        }
        return handlers;
    }

    /** Routes an inbound message to the handlers registered for its channel. @internal */
    private dispatchChannelMessage(channel: string, message: string): void {
        const handlers = this._channelHandlers.get(channel);
        if (!handlers) {
            return;
        }
        for (const handler of handlers) {
            try {
                handler(message);
            } catch (err) {
                if (this._enableLogging) {
                    LogError(`Redis pub/sub handler for "${channel}" threw: ${(err as Error).message}`);
                }
            }
        }
    }

    /** Namespaces a channel with the provider's key prefix. @internal */
    private qualifyChannel(channel: string): string {
        return `${this._keyPrefix}:${channel}`;
    }

    /**
     * Registers a callback for cache change events from other servers.
     * The callback fires whenever another server instance modifies a cached entry
     * (via `SetItem`, `Remove`, or `ClearCategory`).
     *
     * Events from this server instance (identified by {@link MJGlobal.ProcessUUID})
     * are automatically filtered out.
     *
     * @param callback - Function invoked with the {@link CacheChangedEvent}
     * @returns A function that, when called, removes this callback registration
     *
     * @example
     * ```typescript
     * const unsubscribe = provider.OnCacheChanged((event) => {
     *     // Dispatch to LocalCacheManager for callback routing
     *     LocalCacheManager.Instance.DispatchCacheChange(event);
     * });
     *
     * // Later, on shutdown:
     * unsubscribe();
     * ```
     */
    public OnCacheChanged(callback: (event: CacheChangedEvent) => void): () => void {
        this._eventEmitter.on('cacheChanged', callback);

        return () => {
            this._eventEmitter.off('cacheChanged', callback);
        };
    }

    /**
     * Whether the pub/sub subscriber connection is currently active.
     */
    public get IsSubscriberConnected(): boolean {
        return this._subscriberConnected;
    }
}

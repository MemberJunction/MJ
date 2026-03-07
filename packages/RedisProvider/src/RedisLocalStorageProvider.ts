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
import { ILocalStorageProvider, LogStatus, LogError } from '@memberjunction/core';
import type { CacheChangedEvent } from '@memberjunction/core';
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
     * unless overridden by the `ttlSeconds` parameter.
     *
     * Set to `0` or `undefined` to store keys without expiration (persistent).
     *
     * @default undefined (no expiration)
     */
    defaultTTLSeconds?: number;

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
}

/**
 * Default category used when none is specified in storage operations.
 * @internal
 */
const DEFAULT_CATEGORY = 'default';

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
 * Categories are tracked in a Redis Set at `{prefix}:__categories__:{category}` so that
 * `ClearCategory()` and `GetCategoryKeys()` operations are efficient.
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
    private _client: Redis;
    private _keyPrefix: string;
    private _defaultTTLSeconds: number | undefined;
    private _enableLogging: boolean;
    private _connected: boolean = false;

    // Pub/sub fields
    private _enablePubSub: boolean;
    private _subscriber: Redis | null = null;
    private _pubSubChannel: string;
    private _eventEmitter: EventEmitter = new EventEmitter();
    private _subscriberConnected: boolean = false;
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
        this._defaultTTLSeconds = config.defaultTTLSeconds;
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
     * Retrieves a value from Redis by key and optional category.
     *
     * @param key - The key to look up
     * @param category - Optional category for key isolation (defaults to `"default"`)
     * @returns The stored string value, or `null` if the key doesn't exist or Redis is unavailable
     *
     * @example
     * ```typescript
     * const value = await provider.GetItem('entity-metadata', 'Metadata');
     * if (value) {
     *     const metadata = JSON.parse(value);
     * }
     * ```
     */
    public async GetItem(key: string, category?: string): Promise<string | null> {
        try {
            const redisKey = this.buildKey(key, category ?? DEFAULT_CATEGORY);
            return await this._client.get(redisKey);
        } catch (err) {
            if (this._enableLogging) {
                LogError(`Redis GetItem failed for key "${key}": ${(err as Error).message}`);
            }
            return null;
        }
    }

    /**
     * Stores a value in Redis under the given key and optional category.
     *
     * If a `ttlSeconds` is provided, the key will automatically expire after that
     * duration. Otherwise, the configured `defaultTTLSeconds` is used. If neither
     * is set, the key persists indefinitely.
     *
     * The key is also added to a Redis Set that tracks all keys in the category,
     * enabling efficient `ClearCategory()` and `GetCategoryKeys()` operations.
     *
     * @param key - The key to store under
     * @param value - The string value to store
     * @param category - Optional category for key isolation (defaults to `"default"`)
     * @param ttlSeconds - Optional time-to-live in seconds. Overrides `defaultTTLSeconds` from config.
     *
     * @example
     * ```typescript
     * // Store with default TTL
     * await provider.SetItem('view:users', JSON.stringify(results), 'RunViewCache');
     *
     * // Store with explicit 10-minute TTL
     * await provider.SetItem('view:users', JSON.stringify(results), 'RunViewCache', 600);
     * ```
     */
    public async SetItem(key: string, value: string, category?: string, ttlSeconds?: number): Promise<void> {
        try {
            const cat = category ?? DEFAULT_CATEGORY;
            const redisKey = this.buildKey(key, cat);
            const categorySetKey = this.buildCategorySetKey(cat);

            const effectiveTTL = ttlSeconds ?? this._defaultTTLSeconds;

            // Use pipeline for atomic set + category tracking
            const pipeline = this._client.pipeline();

            if (effectiveTTL && effectiveTTL > 0) {
                pipeline.setex(redisKey, effectiveTTL, value);
            } else {
                pipeline.set(redisKey, value);
            }

            // Track this key in the category set for ClearCategory/GetCategoryKeys
            pipeline.sadd(categorySetKey, key);

            await pipeline.exec();

            // Publish cache change event for cross-server invalidation
            this.publishChange(key, cat, 'set', value);
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
            const redisKey = this.buildKey(key, cat);
            const categorySetKey = this.buildCategorySetKey(cat);

            const pipeline = this._client.pipeline();
            pipeline.del(redisKey);
            pipeline.srem(categorySetKey, key);
            await pipeline.exec();

            // Publish cache change event for cross-server invalidation
            this.publishChange(key, cat, 'removed');
        } catch (err) {
            if (this._enableLogging) {
                LogError(`Redis Remove failed for key "${key}": ${(err as Error).message}`);
            }
        }
    }

    /**
     * Clears all keys belonging to a specific category.
     *
     * Uses the category tracking Set to find all member keys, deletes them
     * in a single pipeline call, then removes the tracking Set itself.
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
        try {
            const cat = category || DEFAULT_CATEGORY;
            const categorySetKey = this.buildCategorySetKey(cat);

            // Get all keys in this category
            const keys = await this._client.smembers(categorySetKey);

            if (keys.length > 0) {
                const pipeline = this._client.pipeline();

                // Delete each key
                for (const key of keys) {
                    pipeline.del(this.buildKey(key, cat));
                }

                // Delete the category set itself
                pipeline.del(categorySetKey);

                await pipeline.exec();
            } else {
                // Category set might still exist even if empty
                await this._client.del(categorySetKey);
            }

            // Publish category-level change event
            this.publishChange(cat, cat, 'category_cleared');
        } catch (err) {
            if (this._enableLogging) {
                LogError(`Redis ClearCategory failed for "${category}": ${(err as Error).message}`);
            }
        }
    }

    /**
     * Returns all keys belonging to a specific category.
     *
     * Reads from the category tracking Set, so the result reflects keys
     * that were added via `SetItem` (some may have expired via TTL but
     * will still appear in the set until cleaned up).
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
            const categorySetKey = this.buildCategorySetKey(cat);
            return await this._client.smembers(categorySetKey);
        } catch (err) {
            if (this._enableLogging) {
                LogError(`Redis GetCategoryKeys failed for "${category}": ${(err as Error).message}`);
            }
            return [];
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
            if (channel !== this._pubSubChannel) {
                return;
            }
            this.handlePubSubMessage(message);
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

        const event: CacheChangedEvent = {
            CacheKey: cacheKey,
            Category: category,
            Action: action,
            Timestamp: Date.now(),
            SourceServerId: MJGlobal.Instance.ProcessUUID,
            Data: data,
        };

        // Publish fire-and-forget — don't await, don't block the caller
        this._client.publish(this._pubSubChannel, JSON.stringify(event)).catch((err) => {
            if (this._enableLogging) {
                LogError(`Redis pub/sub publish failed: ${(err as Error).message}`);
            }
        });
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

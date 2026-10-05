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
     * Caps reconnection attempts. Past the cap ioredis stops reconnecting for the life of the
     * client, leaving the process cache-blind until it restarts.
     *
     * Omit it on a long-running process. Set it only for a short-lived script that should fail
     * rather than wait out an outage.
     *
     * @default undefined — retry indefinitely, with each wait capped by {@link maxRetryDelayMs}
     */
    maxRetries?: number;

    /**
     * Ceiling on the wait between reconnection attempts, in milliseconds. The backoff doubles from
     * 200ms up to this value and then holds there, so a long outage costs one attempt per ceiling.
     *
     * @default 30000
     */
    maxRetryDelayMs?: number;

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
 * The categories a reconnect-flush clears.
 *
 * Mirrors `CacheCategory` from `@memberjunction/core` as literals rather than importing it, so the
 * provider takes no value dependency on that module and a category added there cannot change
 * recovery behaviour here without an edit to this list.
 */
const RECONCILED_CATEGORIES: readonly string[] = ['RunViewCache', 'RunQueryCache', 'DatasetCache', 'Metadata', 'default'];

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
    /**
     * `false` — values are JSON-serialized onto the wire and parsed back on read, so a
     * Redis-backed cache never hands out a live reference to a caller's object.
     * See {@link ILocalStorageProvider.SharesReferences}.
     */
    public readonly SharesReferences = false;

    private _client: Redis;
    private _keyPrefix: string;
    private _defaultTTLSeconds: number | undefined;
    private _enableLogging: boolean;
    private _connected: boolean = false;

    /** Ceiling on the reconnect delay. See {@link RedisProviderConfig.maxRetryDelayMs}. */
    private _maxRetryDelayMs: number;

    /**
     * Whether this client has ever been connected. Distinguishes a startup that has not reached
     * Redis yet, where queueing a command is useful, from a connection that was lost, where
     * {@link shouldFailFast} applies.
     */
    private _hasEverConnected: boolean = false;

    /**
     * The highest shared epoch this process has seen, from its own mutations and from events
     * received. {@link reconcileAfterReconnect} compares it against the value in Redis to decide
     * whether anything was invalidated during a connection gap.
     */
    private _lastSeenEpoch: number = 0;

    /**
     * Whether this process mutated shared state while disconnected, meaning other servers never
     * received those invalidations. Set so {@link reconcileAfterReconnect} can bump the epoch on
     * recovery and make them flush.
     */
    private _mutatedWhileDisconnected: boolean = false;

    /** Guards against two overlapping reconciliations (client and subscriber both recover). */
    private _reconciling: boolean = false;

    /**
     * Whether the loss of this connection has already been reported to consumers. Reports the loss
     * once per outage — `close` fires on every failed reconnection attempt — and tells the `ready`
     * handler that a recovery, rather than a first connection, is what it is seeing.
     */
    private _connectionLostEmitted: boolean = false;

    /** As {@link _hasEverConnected}, for the subscriber connection. */
    private _subscriberHasEverConnected: boolean = false;

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
        this._defaultTTLSeconds = config.defaultTTLSeconds;
        this._enableLogging = config.enableLogging ?? true;
        this._maxRetryDelayMs = config.maxRetryDelayMs ?? 30000;
        this._enablePubSub = config.enablePubSub ?? false;
        this._pubSubChannel = `${this._keyPrefix}:__pubsub__`;

        const maxRetries = config.maxRetries; // undefined = retry forever, with a capped delay

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
    private retryStrategy(times: number, maxRetries: number | undefined): number | null {
        // Returning null stops ioredis reconnecting for the life of the client, recoverable only by
        // restarting the process, so only an explicit maxRetries gets that.
        if (maxRetries !== undefined && times > maxRetries) {
            // Error channel: status output is suppressed in production, and this is the one message
            // that must reach a deployed log.
            LogError(
                `Redis: max retries (${maxRetries}) exceeded after ${times} attempts — giving up permanently. ` +
                `This process is now cache-blind until it restarts. Omit maxRetries to retry forever with a capped delay.`
            );
            this.noteConnectionLost('retries exhausted');
            return null;
        }

        // 200, 400, 800, 1600 … then held at maxRetryDelayMs.
        const delay = Math.min(200 * Math.pow(2, times - 1), this._maxRetryDelayMs);
        if (this._enableLogging) {
            const ceiling = maxRetries === undefined ? 'no limit' : `${maxRetries}`;
            LogStatus(`Redis: reconnecting in ${delay}ms (attempt ${times}, limit ${ceiling})`);
        }
        return delay;
    }

    /**
     * Registers event handlers on the ioredis client for logging connection
     * lifecycle events (connect, ready, close, error, reconnecting).
     * @internal
     */
    private handleClientConnect(): void {
        this._connected = true;
        if (this._enableLogging) {
            LogStatus('Redis: connected');
        }
    }

    /**
     * On `ready` the client can serve commands again. A recovery is identified by
     * {@link _connectionLostEmitted} rather than by inspecting `_connected`: ioredis emits `connect`
     * before `ready`, so by this point `_connected` has already been set back to true and cannot
     * distinguish a reconnect from a first connection.
     *
     * @internal
     */
    private handleClientReady(): void {
        this._connected = true;
        this._hasEverConnected = true;
        if (this._enableLogging) {
            LogStatus('Redis: ready to accept commands');
        }
        if (this._connectionLostEmitted) {
            this._connectionLostEmitted = false;
            this.emitConnectionRestored();
        }
    }

    /**
     * `close` fires once per failed reconnection attempt, not only on the first drop, so the loss is
     * announced through {@link noteConnectionLost} and reported once per outage.
     *
     * @internal
     */
    private handleClientClose(): void {
        this._connected = false;
        if (this._enableLogging) {
            LogStatus('Redis: connection closed');
        }
        if (this._hasEverConnected) {
            this.noteConnectionLost('connection closed');
        }
    }

    /**
     * Registers event handlers on the ioredis client for logging connection
     * lifecycle events (connect, ready, close, error, reconnecting).
     * @internal
     */
    private setupEventHandlers(): void {
        this._client.on('connect', () => this.handleClientConnect());
        this._client.on('ready', () => this.handleClientReady());
        this._client.on('close', () => this.handleClientClose());

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
     * Whether a command should fail immediately instead of being handed to ioredis.
     *
     * True once a connection has been established and then lost. The clients set
     * `maxRetriesPerRequest: null` and leave ioredis's offline queue enabled, so a command issued
     * while disconnected is queued and its promise never settles — over a long outage that is
     * unbounded memory and indefinitely hanging awaits. Callers instead get a miss from a read and
     * a no-op from a write, both of which are correct and only slower.
     *
     * False before the first connection, so a brief queue can still warm the cache at startup.
     * Nothing is stale at that point because nothing is cached.
     *
     * @internal
     */
    private get shouldFailFast(): boolean {
        return this._hasEverConnected && !this._connected;
    }

    /**
     * Records the highest epoch this process has observed, from either direction — a mutation it
     * published, or an event it received. Monotonic: a late-arriving lower value is ignored.
     * @internal
     */
    private noteEpochSeen(epoch: number | undefined): void {
        if (typeof epoch === 'number' && epoch > this._lastSeenEpoch) {
            this._lastSeenEpoch = epoch;
        }
    }

    /**
     * Records that shared state changed while this process could not tell anyone.
     *
     * Reconciliation has to be symmetric. The obvious direction is what this process MISSED, and the
     * epoch comparison covers that. This is the other direction: writes this process made that its
     * siblings never heard, which leave *them* confidently stale. On recovery the epoch is bumped so
     * they flush too.
     * @internal
     */
    private noteMutationWhileDisconnected(): void {
        this._mutatedWhileDisconnected = true;
    }

    /**
     * Decides whether this process's caches are still trustworthy after a reconnect, and flushes
     * them if not.
     *
     * ioredis resubscribes on its own, but pub/sub has no replay: invalidations published while this
     * process was disconnected are gone, so the cache may hold entries other servers have already
     * invalidated. One read of the shared epoch counter settles it:
     *
     * - unchanged — nothing was invalidated anywhere during the gap, so the cache is kept
     * - advanced — something changed and this process cannot know what, so everything is dropped
     * - this process mutated while disconnected — the epoch is bumped so siblings flush too, and
     *   the cache is dropped here as well
     *
     * An epoch that cannot be read is treated as advanced: without evidence of correctness, flush.
     *
     * @internal
     */
    private async reconcileAfterReconnect(): Promise<void> {
        if (!this._enablePubSub || this._reconciling) {
            return; // no cross-server invalidation to reconcile, or already in progress
        }
        this._reconciling = true;
        try {
            const dirty = this._mutatedWhileDisconnected;
            this._mutatedWhileDisconnected = false;

            let current: number;
            if (dirty) {
                // Make siblings flush: our writes never reached them.
                current = await this._client.incr(this.buildEpochKey());
            } else {
                const raw = await this._client.get(this.buildEpochKey());
                current = raw === null ? 0 : Number(raw);
                if (!Number.isFinite(current)) {
                    throw new Error(`epoch key held a non-numeric value: ${JSON.stringify(raw)}`);
                }
            }

            // Any DIFFERENCE means flush, not only an advance. A lower value is not "no change": the
            // counter is gone — cleared, evicted under maxmemory, or a different instance — and what
            // happened before that is unknowable. Inequality also bounds the damage a peer can do by
            // publishing an absurd epoch, since a later real value differs from it and flushes.
            const suspect = dirty || current !== this._lastSeenEpoch;
            if (!suspect) {
                if (this._enableLogging) {
                    // Status, not the error channel: this is the routine outcome and says nothing
                    // happened. Only the decisions that DROP a cache are worth an operator's log.
                    LogStatus(
                        `[Redis] reconciled after reconnect: epoch unchanged at ${current} — nothing was ` +
                        `invalidated while this process was away, so the local cache is kept`
                    );
                }
                return;
            }

            LogError(
                `[Redis] reconciled after reconnect: epoch ${this._lastSeenEpoch} → ${current}` +
                `${dirty ? ' (this process also mutated while disconnected, so siblings were told to flush)' : ''}` +
                ` — dropping local cache`
            );
            this._lastSeenEpoch = current;
            this.requestLocalFlush();
        } catch (err) {
            // Could not establish correctness; flush rather than trust.
            LogError(`[Redis] reconciliation could not read the epoch (${(err as Error).message}) — flushing local cache to be safe`);
            this.requestLocalFlush();
        } finally {
            this._reconciling = false;
        }
    }

    /**
     * Tells local consumers to drop everything they hold.
     *
     * Expressed as a `category_cleared` event per shared category rather than a new event type,
     * because that action already means "assume nothing in this category is valid" and
     * `LocalCacheManager.DispatchCacheChange` already fans it out to EVERY registered callback. A
     * bespoke event would need every consumer taught about it; this one is understood today.
     *
     * `SourceServerId` is this process deliberately — the flush is local, and a sibling receiving it
     * would filter it out as self-originated anyway since it is never published.
     * @internal
     */
    private requestLocalFlush(): void {
        for (const category of RECONCILED_CATEGORIES) {
            const event: CacheChangedEvent = {
                CacheKey: category,
                Category: category,
                Action: 'category_cleared',
                Timestamp: Date.now(),
                SourceServerId: MJGlobal.Instance.ProcessUUID,
                Epoch: this._lastSeenEpoch,
            };
            this.safeEmit('cacheChanged', event);
        }
        this.safeEmit('reconciliationRequired');
    }

    /** The Redis key holding the fleet-wide invalidation counter. @internal */
    private buildEpochKey(): string {
        return `${this._keyPrefix}:__epoch__`;
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
        if (this.shouldFailFast) {
            return null; // a miss: the caller refetches from the source of truth
        }
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

        if (this.shouldFailFast) {
            // Every key a miss — same answer MGET would give for absent keys.
            for (const k of keys) out.set(k, null);
            return out;
        }

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
     * If a `ttlSeconds` is provided, the key will automatically expire after that
     * duration. Otherwise, the configured `defaultTTLSeconds` is used. If neither
     * is set, the key persists indefinitely.
     *
     * The key is also added to a Redis Set that tracks all keys in the category,
     * enabling efficient `ClearCategory()` and `GetCategoryKeys()` operations.
     *
     * @typeParam T - Type of the value being stored. Caller-controlled.
     * @param key - The key to store under
     * @param value - The value to store (will be JSON-serialized internally)
     * @param category - Optional category for key isolation (defaults to `"default"`)
     * @param ttlSeconds - Optional time-to-live in seconds. Overrides `defaultTTLSeconds` from config.
     *
     * @example
     * ```typescript
     * // Store with default TTL
     * await provider.SetItem('view:users', { results, maxUpdatedAt }, 'RunViewCache');
     *
     * // Store with explicit 10-minute TTL
     * await provider.SetItem('view:users', { results }, 'RunViewCache', 600);
     * ```
     */
    public async SetItem<T>(key: string, value: T, category?: string, ttlSeconds?: number): Promise<void> {
        if (this.shouldFailFast) {
            this.noteMutationWhileDisconnected();
            return;
        }
        try {
            const cat = category ?? DEFAULT_CATEGORY;
            const redisKey = this.buildKey(key, cat);
            const categorySetKey = this.buildCategorySetKey(cat);

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

            const effectiveTTL = ttlSeconds ?? this._defaultTTLSeconds;

            // Use pipeline for atomic set + category tracking
            const pipeline = this._client.pipeline();

            if (effectiveTTL && effectiveTTL > 0) {
                pipeline.setex(redisKey, effectiveTTL, serialized);
            } else {
                pipeline.set(redisKey, serialized);
            }

            // Track this key in the category set for ClearCategory/GetCategoryKeys
            pipeline.sadd(categorySetKey, key);

            await pipeline.exec();

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
        if (this.shouldFailFast) {
            this.noteMutationWhileDisconnected();
            return;
        }
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
        if (this.shouldFailFast) {
            this.noteMutationWhileDisconnected();
            return;
        }
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
        if (this.shouldFailFast) {
            return []; // unknown rather than wrong: the caller treats it as nothing cached
        }
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
        if (this.shouldFailFast) {
            return false; // nothing is reachable, so nothing is cached as far as the caller is concerned
        }
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
        if (this.shouldFailFast) {
            return null; // unknown, which is what the catch below reports for an unreachable server
        }
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
        const maxRetries = this._config.maxRetries; // undefined = retry forever, with a capped delay

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
            const wasDown = this._subscriberHasEverConnected && !this._subscriberConnected;
            this._subscriberConnected = true;
            this._subscriberHasEverConnected = true;
            if (this._enableLogging) {
                LogStatus('Redis pub/sub subscriber: connected');
            }
            // Reconciliation hangs off the subscriber because that is the connection which misses
            // invalidations. ioredis resubscribes, but cannot replay what it missed.
            if (wasDown) {
                void this.reconcileAfterReconnect();
            }
        });

        this._subscriber.on('close', () => {
            const wasUp = this._subscriberConnected;
            this._subscriberConnected = false;
            if (wasUp) {
                LogError('[Redis] pub/sub subscriber disconnected — invalidations from other servers are not arriving');
            }
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

            // Before the self-filter below: any event reaching this subscriber shows how far the
            // shared counter has advanced, regardless of who published it.
            this.noteEpochSeen(event.Epoch);

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

        const event: CacheChangedEvent = {
            CacheKey: cacheKey,
            Category: category,
            Action: action,
            Timestamp: Date.now(),
            SourceServerId: MJGlobal.Instance.ProcessUUID,
            Data: data,
        };

        // Bump the shared epoch, then publish carrying its new value. The counter lives here
        // because every mutation already routes through this method. INCR has to precede PUBLISH so
        // the payload can carry the result, which costs a second round trip — off the caller's path,
        // since this method is fire-and-forget.
        this._client.incr(this.buildEpochKey()).then((epoch) => {
            this.noteEpochSeen(epoch);
            event.Epoch = epoch;
            return this._client.publish(this._pubSubChannel, JSON.stringify(event));
        }).then(() => {
            if (this._enableLogging) {
                LogStatus(`Redis pub/sub: published ${action} event for key "${cacheKey}" on channel "${this._pubSubChannel}"`);
            }
        }).catch((err) => {
            // Nobody heard this change, so record it for reconcileAfterReconnect to bump the epoch
            // on recovery and make the other servers flush.
            this.noteMutationWhileDisconnected();
            if (this._enableLogging) {
                LogError(`Redis pub/sub publish failed: ${(err as Error).message}`);
            }
        });
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

    /**
     * Registers a callback for the loss of the Redis connection.
     *
     * Fires on a transition only — not on the first connect, and not again while a reconnect is
     * being retried. {@link IsConnected} reports the current state but not that it changed, so a
     * consumer wanting to degrade or report health needs this rather than a poll.
     *
     * Use this in preference to reading the log: status-level logging is suppressed when
     * `GetProductionStatus()` is true, so a deployed process says nothing when its cache client
     * dies.
     *
     * @param callback - Invoked with a short human-readable reason for the loss
     * @returns A function that removes this registration
     *
     * @example
     * ```typescript
     * const stop = provider.OnConnectionLost(reason => health.markCacheDown(reason));
     * provider.OnConnectionRestored(() => health.markCacheUp());
     * ```
     */
    public OnConnectionLost(callback: (reason: string) => void): () => void {
        this._eventEmitter.on('connectionLost', callback);
        return () => {
            this._eventEmitter.off('connectionLost', callback);
        };
    }

    /**
     * Registers a callback for the Redis connection being restored after a loss. Not fired for the
     * first connection.
     *
     * Cache correctness after the gap is handled by the provider itself; see
     * {@link OnReconciliationRequired} for the signal that local state had to be dropped.
     *
     * @param callback - Invoked when the connection comes back
     * @returns A function that removes this registration
     */
    public OnConnectionRestored(callback: () => void): () => void {
        this._eventEmitter.on('connectionRestored', callback);
        return () => {
            this._eventEmitter.off('connectionRestored', callback);
        };
    }

    /**
     * Registers a callback for the provider having concluded, after a connection gap, that local
     * cache state must be dropped.
     *
     * The standard categories are flushed by the provider itself via {@link OnCacheChanged}. Use
     * this for state those categories do not describe — an in-process engine, a derived index, a
     * memoized permission set — which would otherwise survive a reconnect while stale.
     *
     * Does not fire when nothing was invalidated anywhere during the gap.
     *
     * @param callback - Invoked when a flush is required
     * @returns A function that removes this registration
     */
    public OnReconciliationRequired(callback: () => void): () => void {
        this._eventEmitter.on('reconciliationRequired', callback);
        return () => {
            this._eventEmitter.off('reconciliationRequired', callback);
        };
    }

    /**
     * The highest fleet-wide epoch this process has observed. Exposed for diagnostics and for tests
     * that need to assert what reconciliation decided; consumers should not need it.
     */
    public get LastSeenEpoch(): number {
        return this._lastSeenEpoch;
    }

    /**
     * Reports a lost connection once per outage.
     *
     * Both routes into this are repeatable: `close` fires on every failed reconnection attempt, and an
     * exhausted retry ceiling arrives separately after one. Consumers get a single notification, and
     * the next `ready` clears the latch so the following outage reports again.
     *
     * @internal
     */
    private noteConnectionLost(reason: string): void {
        if (this._connectionLostEmitted) {
            return;
        }
        this._connectionLostEmitted = true;
        this.emitConnectionLost(reason);
    }

    /**
     * Raises the public lost-connection event and logs it.
     *
     * Uses the error channel, and is not gated behind `enableLogging`: status-level output is
     * suppressed in production and that flag is routinely turned off, either of which would leave a
     * dead cache client silent.
     *
     * @internal
     */
    private emitConnectionLost(reason: string): void {
        LogError(`[Redis] connection lost (${reason}) — cache reads will miss and writes will no-op until it returns`);
        this.safeEmit('connectionLost', reason);
    }

    /**
     * Raises the public restored-connection event and logs it, on the error channel for the same
     * reason as the loss — otherwise the logs show an outage that never ends.
     *
     * @internal
     */
    private emitConnectionRestored(): void {
        LogError('[Redis] connection restored');
        this.safeEmit('connectionRestored');
    }

    /**
     * Emits to consumer callbacks, containing each listener's errors so that neither the connection
     * handling that triggered the event nor the other listeners are affected.
     *
     * Invokes listeners individually rather than through `EventEmitter.emit`, which calls them
     * synchronously in turn: one throwing there would stop every listener after it from running at
     * all.
     *
     * @internal
     */
    private safeEmit(event: string, ...args: unknown[]): void {
        for (const listener of this._eventEmitter.rawListeners(event)) {
            try {
                (listener as (...listenerArgs: unknown[]) => void)(...args);
            } catch (err) {
                LogError(`[Redis] a ${event} listener threw: ${(err as Error).message}`);
            }
        }
    }
}

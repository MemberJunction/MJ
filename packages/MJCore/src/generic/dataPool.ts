import { BaseSingleton } from '@memberjunction/global';
import { RunViewParams } from '../views/runView';
import { RunView } from '../views/runView';
import { RunViewResult, IRunViewProvider, ILocalStorageProvider } from './interfaces';
import { UserInfo } from './securityInfo';
import { BaseEntity } from './baseEntity';
import { LogError, LogStatus } from './logging';
import { Metadata } from './metadata';

/**
 * Request parameters for the DataPool
 */
export interface DataPoolRequest {
    /**
     * The entity name to load
     */
    entityName: string;
    /**
     * Optional SQL WHERE clause filter
     */
    filter?: string;
    /**
     * Optional SQL ORDER BY clause
     */
    orderBy?: string;
    /**
     * Result type - defaults to 'entity_object'
     */
    resultType?: 'entity_object' | 'simple';
}

/**
 * Tracks an engine's access to a cache entry
 */
export interface CacheEntryEngineAccess {
    /**
     * The engine class name that accessed this cache entry
     */
    engineClassName: string;
    /**
     * When this engine first loaded/accessed this cache entry
     */
    firstAccessedAt: Date;
    /**
     * When this engine last accessed this cache entry
     */
    lastAccessedAt: Date;
    /**
     * Number of times this engine has accessed this entry
     */
    accessCount: number;
}

/**
 * A cached entry in the DataPool
 */
export interface DataPoolCacheEntry {
    /**
     * The cached data
     */
    data: BaseEntity[] | Record<string, unknown>[];
    /**
     * The entity name this data is from
     */
    entityName: string;
    /**
     * The filter used for this query
     */
    filter?: string;
    /**
     * When this data was loaded
     */
    loadedAt: Date;
    /**
     * When this data was last accessed
     */
    lastAccessedAt: Date;
    /**
     * MAX(__mj_UpdatedAt) at time of load - used for staleness detection
     */
    entityUpdatedAt: Date | null;
    /**
     * Estimated size in bytes
     */
    estimatedSizeBytes: number;
    /**
     * Engines that have accessed this cache entry
     */
    engineAccesses: CacheEntryEngineAccess[];
}

/**
 * Configuration for the DataPool
 */
export interface DataPoolConfig {
    /**
     * Enable request pooling (capped debounce). Default: true
     */
    enablePooling: boolean;
    /**
     * Initial pooling window in milliseconds. Default: 50
     */
    poolingWindowMs: number;
    /**
     * Maximum pooling extension in milliseconds. Default: 250
     */
    poolingMaxExtensionMs: number;
    /**
     * Enable IndexedDB caching (client-side only). Default: true
     */
    enableLocalCache: boolean;
    /**
     * Enable cross-engine data sharing via memory cache. Default: true
     */
    enableCrossEngineSharing: boolean;
}

/**
 * Options for individual DataPool requests
 */
export interface DataPoolRequestOptions {
    /**
     * Force refresh from server, bypassing all caches
     */
    forceRefresh?: boolean;
    /**
     * Skip the pooling window and execute immediately
     */
    skipPooling?: boolean;
    /**
     * Skip local cache (IndexedDB) for this request
     */
    skipCache?: boolean;
    /**
     * The engine class name making this request (for tracking cache sharing)
     */
    engineClassName?: string;
}

/**
 * Internal structure for queued requests during pooling
 */
interface QueuedRequest {
    request: DataPoolRequest;
    resolve: (value: BaseEntity[] | Record<string, unknown>[]) => void;
    reject: (reason: Error) => void;
    options?: DataPoolRequestOptions;
}

/**
 * DataPool is a central coordination layer for entity data requests.
 *
 * It provides:
 * - Request pooling/batching with capped debounce
 * - Cross-engine data sharing via memory cache
 * - In-flight request deduplication
 * - IndexedDB caching (client-side)
 * - Staleness detection via __mj_UpdatedAt
 *
 * @example
 * ```typescript
 * // Configure the DataPool
 * DataPool.Instance.Configure({
 *   enablePooling: true,
 *   poolingWindowMs: 50,
 *   poolingMaxExtensionMs: 250
 * });
 *
 * // Request data
 * const results = await DataPool.Instance.Request(
 *   { entityName: 'Customers', filter: 'Status = "Active"' },
 *   contextUser
 * );
 * ```
 */
export class DataPool extends BaseSingleton<DataPool> {
    private _config: DataPoolConfig = {
        // Pooling disabled temporarily - causing 36+ second delays when batching
        // many requests together. The server struggles with large batched RunViews calls.
        // TODO: Investigate server-side RunViews performance with large batch sizes.
        enablePooling: false,
        poolingWindowMs: 50,
        poolingMaxExtensionMs: 250,
        // Local cache disabled by default - JSON.stringify of BaseEntity objects
        // causes RangeError for large datasets. TODO: Implement proper serialization
        // using GetAll() for storage and LoadFromData() for retrieval.
        enableLocalCache: false,
        enableCrossEngineSharing: true
    };

    // Memory cache for cross-engine sharing
    private _sharedCache: Map<string, DataPoolCacheEntry> = new Map();

    // In-flight requests for deduplication
    private _inFlightRequests: Map<string, Promise<BaseEntity[] | Record<string, unknown>[]>> = new Map();

    // Pooling state
    private _poolQueue: QueuedRequest[] = [];
    private _poolTimer: ReturnType<typeof setTimeout> | null = null;
    private _poolWindowStartTime: number = 0;

    // Local storage availability
    private _localStorageAvailable: boolean | null = null;
    private _localStorageChecked: boolean = false;

    // Provider reference
    private _provider: IRunViewProvider | null = null;

    /**
     * Returns the singleton instance of DataPool
     */
    public static get Instance(): DataPool {
        return super.getInstance<DataPool>();
    }

    /**
     * Configure the DataPool with custom settings
     */
    public Configure(config: Partial<DataPoolConfig>): void {
        this._config = { ...this._config, ...config };
    }

    /**
     * Get current configuration
     */
    public get Config(): Readonly<DataPoolConfig> {
        return { ...this._config };
    }

    /**
     * Set a custom provider (useful for testing or multi-provider scenarios)
     */
    public SetProvider(provider: IRunViewProvider): void {
        this._provider = provider;
    }

    /**
     * Get the provider to use for requests
     */
    private get ProviderToUse(): IRunViewProvider {
        return this._provider || RunView.Provider;
    }

    /**
     * Request data from the pool. This is the primary API.
     *
     * @param params - Single request or array of requests
     * @param contextUser - The user context for permission checks
     * @param options - Request options
     * @returns Array of result arrays (one per request)
     */
    public async Request(
        params: DataPoolRequest | DataPoolRequest[],
        contextUser?: UserInfo,
        options?: DataPoolRequestOptions
    ): Promise<(BaseEntity[] | Record<string, unknown>[])[]> {
        const requests = Array.isArray(params) ? params : [params];
        console.log(`[DataPool.Request] START - ${requests.length} request(s):`, requests.map(r => r.entityName));
        const startTime = Date.now();

        // For single request, use simple path
        if (requests.length === 1) {
            console.log(`[DataPool.Request] Single request path for: ${requests[0].entityName}`);
            const result = await this.RequestSingle(requests[0], contextUser, options);
            console.log(`[DataPool.Request] END - took ${Date.now() - startTime}ms`);
            return [result];
        }

        // For multiple requests, separate cached vs uncached
        const results: (BaseEntity[] | Record<string, unknown>[] | null)[] = new Array(requests.length).fill(null);
        const uncachedRequests: { index: number; request: DataPoolRequest }[] = [];

        // First pass: check caches and collect uncached requests
        const engineClassName = options?.engineClassName;
        for (let i = 0; i < requests.length; i++) {
            const request = requests[i];
            const cacheKey = this.BuildCacheKey(request);

            // Check memory cache
            if (this._config.enableCrossEngineSharing && !options?.forceRefresh && !options?.skipCache) {
                const cached = this._sharedCache.get(cacheKey);
                if (cached) {
                    this.TrackCacheHit(cacheKey, engineClassName);
                    results[i] = cached.data;
                    continue;
                }
            }

            // Check in-flight deduplication
            if (this._inFlightRequests.has(cacheKey) && !options?.forceRefresh) {
                results[i] = await this._inFlightRequests.get(cacheKey)!;
                continue;
            }

            // Check local storage cache
            if (this._config.enableLocalCache && !options?.forceRefresh && !options?.skipCache) {
                const localCacheData = await this.CheckLocalStorageCache(cacheKey);
                if (localCacheData) {
                    // Initialize engineAccesses if missing (from older cached data)
                    if (!localCacheData.engineAccesses) {
                        localCacheData.engineAccesses = [];
                    }
                    this._sharedCache.set(cacheKey, localCacheData);
                    this.TrackCacheHit(cacheKey, engineClassName);
                    results[i] = localCacheData.data;
                    continue;
                }
            }

            uncachedRequests.push({ index: i, request });
        }

        // If all cached, return immediately
        if (uncachedRequests.length === 0) {
            const cachedCount = requests.length;
            console.log(`[DataPool.Request] All ${cachedCount} requests served from cache`);
            return results as (BaseEntity[] | Record<string, unknown>[])[];
        }

        const cachedCount = requests.length - uncachedRequests.length;
        console.log(`[DataPool.Request] ${cachedCount} cached, ${uncachedRequests.length} uncached requests to execute`);

        // Execute uncached requests - use pooling or batch RunViews
        if (this._config.enablePooling && !options?.skipPooling) {
            // Use pooling for uncached requests (capped debounce)
            console.log(`[DataPool.Request] Using pooling path (may delay for batching)`);
            const pooledResults = await Promise.all(
                uncachedRequests.map(item => this.QueueRequest(item.request, contextUser, options))
            );
            for (let i = 0; i < uncachedRequests.length; i++) {
                results[uncachedRequests[i].index] = pooledResults[i];
            }
        } else {
            // Use batched RunViews for immediate execution (no delay)
            console.log(`[DataPool.Request] Using immediate batch path`);
            await this.ExecuteBatchImmediate(uncachedRequests, results, contextUser, engineClassName);
        }

        console.log(`[DataPool.Request] END - took ${Date.now() - startTime}ms`);
        return results as (BaseEntity[] | Record<string, unknown>[])[];
    }

    /**
     * Execute multiple requests as a single batched RunViews call
     */
    private async ExecuteBatchImmediate(
        uncachedRequests: { index: number; request: DataPoolRequest }[],
        results: (BaseEntity[] | Record<string, unknown>[] | null)[],
        contextUser?: UserInfo,
        engineClassName?: string
    ): Promise<void> {
        console.log(`[DataPool.ExecuteBatchImmediate] START - ${uncachedRequests.length} requests`);
        const startTime = Date.now();

        // Deduplicate requests
        const seen = new Map<string, number[]>(); // cacheKey -> array of result indices
        const uniqueRequests: DataPoolRequest[] = [];

        for (const item of uncachedRequests) {
            const key = this.BuildCacheKey(item.request);
            if (!seen.has(key)) {
                seen.set(key, [item.index]);
                uniqueRequests.push(item.request);
            } else {
                seen.get(key)!.push(item.index);
            }
        }

        console.log(`[DataPool.ExecuteBatchImmediate] ${uniqueRequests.length} unique requests after dedup:`, uniqueRequests.map(r => r.entityName));

        // Build RunViewParams and execute batch
        const viewParams: RunViewParams[] = uniqueRequests.map(req => ({
            EntityName: req.entityName,
            ExtraFilter: req.filter,
            OrderBy: req.orderBy,
            ResultType: req.resultType || 'entity_object'
        }));

        console.log(`[DataPool.ExecuteBatchImmediate] Calling RunViews...`);
        const rv = new RunView(this.ProviderToUse);
        const batchResults = await rv.RunViews(viewParams, contextUser);
        console.log(`[DataPool.ExecuteBatchImmediate] RunViews returned in ${Date.now() - startTime}ms`);

        // Distribute results
        let uniqueIndex = 0;
        for (const [key, indices] of seen) {
            const result = batchResults[uniqueIndex];
            const request = uniqueRequests[uniqueIndex];
            if (result && result.Success) {
                const data = result.Results as BaseEntity[] | Record<string, unknown>[];

                // Cache the result with engine tracking
                this.CacheResult(key, data, request, engineClassName);

                // Assign to all indices that requested this data
                for (const idx of indices) {
                    results[idx] = data;
                }
            } else {
                throw new Error(result?.ErrorMessage || `Failed to load request at index ${uniqueIndex}`);
            }
            uniqueIndex++;
        }
    }

    /**
     * Request data for a single entity
     */
    private async RequestSingle(
        request: DataPoolRequest,
        contextUser?: UserInfo,
        options?: DataPoolRequestOptions
    ): Promise<BaseEntity[] | Record<string, unknown>[]> {
        const cacheKey = this.BuildCacheKey(request);
        const engineClassName = options?.engineClassName;
        console.log(`[DataPool.RequestSingle] ${request.entityName} - checking caches...`);

        // 1. Check shared memory cache (cross-engine sharing)
        if (this._config.enableCrossEngineSharing && !options?.forceRefresh && !options?.skipCache) {
            const cached = this._sharedCache.get(cacheKey);
            if (cached) {
                console.log(`[DataPool.RequestSingle] ${request.entityName} - HIT memory cache`);
                this.TrackCacheHit(cacheKey, engineClassName);
                return cached.data;
            }
        }

        // 2. Check for in-flight request (deduplication)
        if (this._inFlightRequests.has(cacheKey) && !options?.forceRefresh) {
            console.log(`[DataPool.RequestSingle] ${request.entityName} - waiting for in-flight request`);
            return this._inFlightRequests.get(cacheKey)!;
        }

        // 3. Check local storage cache
        if (this._config.enableLocalCache && !options?.forceRefresh && !options?.skipCache) {
            const localCacheData = await this.CheckLocalStorageCache(cacheKey);
            if (localCacheData) {
                console.log(`[DataPool.RequestSingle] ${request.entityName} - HIT local storage cache`);
                // Initialize engineAccesses if missing (from older cached data)
                if (!localCacheData.engineAccesses) {
                    localCacheData.engineAccesses = [];
                }
                // Promote to memory cache
                this._sharedCache.set(cacheKey, localCacheData);
                this.TrackCacheHit(cacheKey, engineClassName);
                return localCacheData.data;
            }
        }

        // 4. Execute request - either pooled or immediate
        console.log(`[DataPool.RequestSingle] ${request.entityName} - MISS all caches, executing...`);
        if (this._config.enablePooling && !options?.skipPooling) {
            return this.QueueRequest(request, contextUser, options);
        } else {
            return this.ExecuteImmediate(request, contextUser, cacheKey, engineClassName);
        }
    }

    /**
     * Queue a request for pooled execution
     */
    private QueueRequest(
        request: DataPoolRequest,
        contextUser?: UserInfo,
        options?: DataPoolRequestOptions
    ): Promise<BaseEntity[] | Record<string, unknown>[]> {
        return new Promise((resolve, reject) => {
            this._poolQueue.push({ request, resolve, reject, options });

            const now = Date.now();

            if (!this._poolTimer) {
                // First request - start the window
                this._poolWindowStartTime = now;
                this._poolTimer = setTimeout(
                    () => this.FlushPool(contextUser),
                    this._config.poolingWindowMs
                );
            } else {
                // Subsequent request - extend window if within cap (capped debounce)
                const elapsed = now - this._poolWindowStartTime;
                const remaining = this._config.poolingMaxExtensionMs - elapsed;

                if (remaining > 0) {
                    // Can still extend
                    clearTimeout(this._poolTimer);
                    const extensionTime = Math.min(this._config.poolingWindowMs, remaining);
                    this._poolTimer = setTimeout(
                        () => this.FlushPool(contextUser),
                        extensionTime
                    );
                }
                // If remaining <= 0, timer will fire soon anyway
            }
        });
    }

    /**
     * Flush the pool and execute all queued requests as a batch
     */
    private async FlushPool(contextUser?: UserInfo): Promise<void> {
        this._poolTimer = null;

        const queue = [...this._poolQueue];
        this._poolQueue = [];
        this._poolWindowStartTime = 0;

        if (queue.length === 0) return;

        try {
            // Deduplicate requests
            const { uniqueRequests, requestMap } = this.DeduplicateRequests(queue);

            // Build RunViewParams array
            const viewParams: RunViewParams[] = uniqueRequests.map(req => ({
                EntityName: req.entityName,
                ExtraFilter: req.filter,
                OrderBy: req.orderBy,
                ResultType: req.resultType || 'entity_object'
            }));

            // Execute as single batch
            const rv = new RunView(this.ProviderToUse);
            const results = await rv.RunViews(viewParams, contextUser);

            // Distribute results back to original requesters
            this.DistributeResults(queue, uniqueRequests, results, requestMap);
        } catch (error) {
            // Reject all pending requests
            for (const item of queue) {
                item.reject(error as Error);
            }
        }
    }

    /**
     * Deduplicate requests based on cache key
     */
    private DeduplicateRequests(queue: QueuedRequest[]): {
        uniqueRequests: DataPoolRequest[];
        requestMap: Map<string, number>;
    } {
        const seen = new Map<string, number>();
        const uniqueRequests: DataPoolRequest[] = [];

        for (const item of queue) {
            const key = this.BuildCacheKey(item.request);
            if (!seen.has(key)) {
                seen.set(key, uniqueRequests.length);
                uniqueRequests.push(item.request);
            }
        }

        return { uniqueRequests, requestMap: seen };
    }

    /**
     * Distribute batch results back to individual requesters
     */
    private DistributeResults(
        queue: QueuedRequest[],
        _uniqueRequests: DataPoolRequest[],
        results: RunViewResult[],
        requestMap: Map<string, number>
    ): void {
        for (const item of queue) {
            const key = this.BuildCacheKey(item.request);
            const index = requestMap.get(key);
            const engineClassName = item.options?.engineClassName;

            if (index !== undefined && results[index]) {
                const result = results[index];
                if (result.Success) {
                    const data = result.Results as BaseEntity[] | Record<string, unknown>[];

                    // Cache the result with engine tracking
                    this.CacheResult(key, data, item.request, engineClassName);

                    item.resolve(data);
                } else {
                    item.reject(new Error(result.ErrorMessage || 'RunView failed'));
                }
            } else {
                item.reject(new Error('Result not found for request'));
            }
        }
    }

    /**
     * Execute a request immediately (not pooled)
     */
    private async ExecuteImmediate(
        request: DataPoolRequest,
        contextUser?: UserInfo,
        cacheKey?: string,
        engineClassName?: string
    ): Promise<BaseEntity[] | Record<string, unknown>[]> {
        const key = cacheKey || this.BuildCacheKey(request);

        // Create promise and store for deduplication
        const promise = this.DoExecute(request, contextUser, key, engineClassName);
        this._inFlightRequests.set(key, promise);

        try {
            const result = await promise;
            return result;
        } finally {
            this._inFlightRequests.delete(key);
        }
    }

    /**
     * Actually execute the RunView request
     */
    private async DoExecute(
        request: DataPoolRequest,
        contextUser?: UserInfo,
        cacheKey?: string,
        engineClassName?: string
    ): Promise<BaseEntity[] | Record<string, unknown>[]> {
        const rv = new RunView(this.ProviderToUse);
        const result = await rv.RunView({
            EntityName: request.entityName,
            ExtraFilter: request.filter,
            OrderBy: request.orderBy,
            ResultType: request.resultType || 'entity_object'
        }, contextUser);

        if (!result.Success) {
            throw new Error(result.ErrorMessage || `Failed to load ${request.entityName}`);
        }

        const data = result.Results as BaseEntity[] | Record<string, unknown>[];
        const key = cacheKey || this.BuildCacheKey(request);

        // Cache the result with engine tracking
        this.CacheResult(key, data, request, engineClassName);

        return data;
    }

    /**
     * Cache a result in memory (and optionally IndexedDB)
     * @param cacheKey - The cache key
     * @param data - The data to cache
     * @param request - The original request
     * @param engineClassName - Optional engine class name that is caching this data
     */
    private CacheResult(cacheKey: string, data: BaseEntity[] | Record<string, unknown>[], request: DataPoolRequest, engineClassName?: string): void {
        // Get the max __mj_UpdatedAt if available
        let entityUpdatedAt: Date | null = null;
        if (data.length > 0) {
            const firstItem = data[0];
            if (firstItem && typeof firstItem === 'object' && '__mj_UpdatedAt' in firstItem) {
                const dates = data
                    .map(item => {
                        const d = (item as Record<string, unknown>)['__mj_UpdatedAt'];
                        return d ? new Date(d as string | number | Date) : null;
                    })
                    .filter((d): d is Date => d !== null);

                if (dates.length > 0) {
                    entityUpdatedAt = new Date(Math.max(...dates.map(d => d.getTime())));
                }
            }
        }

        // Check if entry already exists to preserve engine access history
        const existingEntry = this._sharedCache.get(cacheKey);
        const engineAccesses: CacheEntryEngineAccess[] = existingEntry?.engineAccesses || [];

        // Track this engine's access if provided
        if (engineClassName) {
            this.RecordEngineAccess(engineAccesses, engineClassName);
        }

        const entry: DataPoolCacheEntry = {
            data,
            entityName: request.entityName,
            filter: request.filter,
            loadedAt: new Date(),
            lastAccessedAt: new Date(),
            entityUpdatedAt,
            estimatedSizeBytes: this.EstimateSize(data),
            engineAccesses
        };

        // Store in memory cache
        if (this._config.enableCrossEngineSharing) {
            this._sharedCache.set(cacheKey, entry);
        }

        // Store in local storage (async, fire-and-forget)
        if (this._config.enableLocalCache) {
            this.SaveToLocalStorage(cacheKey, entry).catch((err: Error) => {
                LogError(`Failed to save to local storage: ${err}`);
            });
        }
    }

    /**
     * Record an engine's access to a cache entry
     */
    private RecordEngineAccess(engineAccesses: CacheEntryEngineAccess[], engineClassName: string): void {
        const now = new Date();
        const existing = engineAccesses.find(ea => ea.engineClassName === engineClassName);
        if (existing) {
            existing.lastAccessedAt = now;
            existing.accessCount++;
        } else {
            engineAccesses.push({
                engineClassName,
                firstAccessedAt: now,
                lastAccessedAt: now,
                accessCount: 1
            });
        }
    }

    /**
     * Track an engine accessing a cached entry (for cache hits)
     */
    private TrackCacheHit(cacheKey: string, engineClassName?: string): void {
        if (!engineClassName) return;

        const entry = this._sharedCache.get(cacheKey);
        if (entry) {
            entry.lastAccessedAt = new Date();
            this.RecordEngineAccess(entry.engineAccesses, engineClassName);
        }
    }

    /**
     * Build a normalized cache key for a request
     */
    public BuildCacheKey(request: DataPoolRequest): string {
        const normalizedFilter = (request.filter || '').trim().toLowerCase();
        const normalizedOrderBy = (request.orderBy || '').trim().toLowerCase();
        const normalizedResultType = request.resultType || 'entity_object';

        return `dp:${request.entityName}|f:${normalizedFilter}|o:${normalizedOrderBy}|t:${normalizedResultType}`;
    }

    /**
     * Invalidate cached data for a specific entity/filter combination
     */
    public async InvalidateEntity(entityName: string, filter?: string): Promise<void> {
        const prefix = `dp:${entityName}|f:${(filter || '').trim().toLowerCase()}`;

        // Clear from memory cache
        for (const key of this._sharedCache.keys()) {
            if (key.startsWith(prefix)) {
                this._sharedCache.delete(key);
            }
        }

        // Clear from local storage
        if (this._config.enableLocalCache) {
            await this.ClearLocalStorageByPrefix(prefix);
        }
    }

    /**
     * Invalidate all cached data
     */
    public async InvalidateAll(): Promise<void> {
        this._sharedCache.clear();

        if (this._config.enableLocalCache) {
            await this.ClearAllLocalStorage();
        }
    }

    /**
     * Get statistics about the cache
     */
    public GetCacheStats(): {
        memoryEntries: number;
        totalEstimatedBytes: number;
        oldestEntry: Date | null;
        newestEntry: Date | null;
    } {
        let totalBytes = 0;
        let oldest: Date | null = null;
        let newest: Date | null = null;

        for (const entry of this._sharedCache.values()) {
            totalBytes += entry.estimatedSizeBytes;
            if (!oldest || entry.loadedAt < oldest) oldest = entry.loadedAt;
            if (!newest || entry.loadedAt > newest) newest = entry.loadedAt;
        }

        return {
            memoryEntries: this._sharedCache.size,
            totalEstimatedBytes: totalBytes,
            oldestEntry: oldest,
            newestEntry: newest
        };
    }

    /**
     * Detailed entry info returned by GetDetailedCacheStats
     */
    public static readonly CacheEntryDetailType: {
        key: string;
        entityName: string;
        filter: string | undefined;
        itemCount: number;
        estimatedSizeBytes: number;
        loadedAt: Date;
        lastAccessedAt: Date;
        entityUpdatedAt: Date | null;
        engineAccesses: CacheEntryEngineAccess[];
        sharedByEngines: string[];
    };

    /**
     * Get detailed statistics about the cache including per-entry info and engine sharing
     */
    public GetDetailedCacheStats(): {
        memoryEntries: number;
        totalEstimatedBytes: number;
        oldestEntry: Date | null;
        newestEntry: Date | null;
        entries: Array<{
            key: string;
            entityName: string;
            filter: string | undefined;
            itemCount: number;
            estimatedSizeBytes: number;
            loadedAt: Date;
            lastAccessedAt: Date;
            entityUpdatedAt: Date | null;
            engineAccesses: CacheEntryEngineAccess[];
            sharedByEngines: string[];
        }>;
    } {
        let totalBytes = 0;
        let oldest: Date | null = null;
        let newest: Date | null = null;
        const entries: Array<{
            key: string;
            entityName: string;
            filter: string | undefined;
            itemCount: number;
            estimatedSizeBytes: number;
            loadedAt: Date;
            lastAccessedAt: Date;
            entityUpdatedAt: Date | null;
            engineAccesses: CacheEntryEngineAccess[];
            sharedByEngines: string[];
        }> = [];

        for (const [key, entry] of this._sharedCache.entries()) {
            totalBytes += entry.estimatedSizeBytes;
            if (!oldest || entry.loadedAt < oldest) oldest = entry.loadedAt;
            if (!newest || entry.loadedAt > newest) newest = entry.loadedAt;

            const engineAccesses = entry.engineAccesses || [];
            entries.push({
                key,
                entityName: entry.entityName,
                filter: entry.filter,
                itemCount: Array.isArray(entry.data) ? entry.data.length : 0,
                estimatedSizeBytes: entry.estimatedSizeBytes,
                loadedAt: entry.loadedAt,
                lastAccessedAt: entry.lastAccessedAt,
                entityUpdatedAt: entry.entityUpdatedAt,
                engineAccesses: engineAccesses,
                sharedByEngines: engineAccesses.map(ea => ea.engineClassName)
            });
        }

        // Sort by entity name for easier viewing
        entries.sort((a, b) => a.entityName.localeCompare(b.entityName));

        return {
            memoryEntries: this._sharedCache.size,
            totalEstimatedBytes: totalBytes,
            oldestEntry: oldest,
            newestEntry: newest,
            entries
        };
    }

    /**
     * Get local storage availability and status
     */
    public async GetLocalStorageStatus(): Promise<{
        available: boolean;
        enabled: boolean;
        providerType: string | null;
        entriesSynced: number;
    }> {
        const available = await this.CheckLocalStorageAvailability();
        const ls = this.LocalStorageProvider;

        return {
            available,
            enabled: this._config.enableLocalCache,
            providerType: ls ? ls.constructor.name : null,
            // Since we mirror memory cache to local storage, count is the same
            entriesSynced: available && this._config.enableLocalCache ? this._sharedCache.size : 0
        };
    }

    /**
     * Get cache sharing graph showing how engines share cache entries.
     * Returns data structured for visualization (nodes and links).
     */
    public GetCacheSharingGraph(): {
        engines: Array<{
            name: string;
            cacheEntriesUsed: number;
            totalAccessCount: number;
            sharedWithEngines: string[];
        }>;
        cacheEntries: Array<{
            entityName: string;
            filter: string | undefined;
            itemCount: number;
            usedByEngines: string[];
            isShared: boolean;
        }>;
        sharingLinks: Array<{
            engine1: string;
            engine2: string;
            sharedEntities: string[];
            sharedEntryCount: number;
        }>;
    } {
        // Build engine-to-entries map
        const engineMap = new Map<string, {
            cacheEntriesUsed: number;
            totalAccessCount: number;
            entries: Set<string>;
        }>();

        // Build entry info
        const cacheEntries: Array<{
            entityName: string;
            filter: string | undefined;
            itemCount: number;
            usedByEngines: string[];
            isShared: boolean;
        }> = [];

        for (const [_key, entry] of this._sharedCache.entries()) {
            const engineNames = (entry.engineAccesses || []).map(ea => ea.engineClassName);

            cacheEntries.push({
                entityName: entry.entityName,
                filter: entry.filter,
                itemCount: Array.isArray(entry.data) ? entry.data.length : 0,
                usedByEngines: engineNames,
                isShared: engineNames.length > 1
            });

            // Track per-engine stats
            for (const access of entry.engineAccesses || []) {
                let engineStats = engineMap.get(access.engineClassName);
                if (!engineStats) {
                    engineStats = { cacheEntriesUsed: 0, totalAccessCount: 0, entries: new Set() };
                    engineMap.set(access.engineClassName, engineStats);
                }
                engineStats.cacheEntriesUsed++;
                engineStats.totalAccessCount += access.accessCount;
                engineStats.entries.add(entry.entityName);
            }
        }

        // Build engine stats with sharing info
        const engines: Array<{
            name: string;
            cacheEntriesUsed: number;
            totalAccessCount: number;
            sharedWithEngines: string[];
        }> = [];

        for (const [engineName, stats] of engineMap.entries()) {
            // Find other engines that share entries with this one
            const sharedWith = new Set<string>();
            for (const entry of this._sharedCache.values()) {
                const engineNames = (entry.engineAccesses || []).map(ea => ea.engineClassName);
                if (engineNames.includes(engineName)) {
                    for (const otherEngine of engineNames) {
                        if (otherEngine !== engineName) {
                            sharedWith.add(otherEngine);
                        }
                    }
                }
            }

            engines.push({
                name: engineName,
                cacheEntriesUsed: stats.cacheEntriesUsed,
                totalAccessCount: stats.totalAccessCount,
                sharedWithEngines: Array.from(sharedWith)
            });
        }

        // Build sharing links between engines
        const sharingLinks: Array<{
            engine1: string;
            engine2: string;
            sharedEntities: string[];
            sharedEntryCount: number;
        }> = [];

        const processedPairs = new Set<string>();
        for (const engine of engines) {
            for (const otherEngine of engine.sharedWithEngines) {
                const pairKey = [engine.name, otherEngine].sort().join('|');
                if (!processedPairs.has(pairKey)) {
                    processedPairs.add(pairKey);

                    // Find shared entities
                    const sharedEntities = new Set<string>();
                    let sharedCount = 0;
                    for (const entry of this._sharedCache.values()) {
                        const engineNames = (entry.engineAccesses || []).map(ea => ea.engineClassName);
                        if (engineNames.includes(engine.name) && engineNames.includes(otherEngine)) {
                            sharedEntities.add(entry.entityName);
                            sharedCount++;
                        }
                    }

                    sharingLinks.push({
                        engine1: engine.name,
                        engine2: otherEngine,
                        sharedEntities: Array.from(sharedEntities),
                        sharedEntryCount: sharedCount
                    });
                }
            }
        }

        return { engines, cacheEntries, sharingLinks };
    }

    /**
     * Get cache entries used by a specific engine
     */
    public GetCacheEntriesForEngine(engineClassName: string): Array<{
        entityName: string;
        filter: string | undefined;
        itemCount: number;
        sizeBytes: number;
        firstAccessedAt: Date;
        lastAccessedAt: Date;
        accessCount: number;
        sharedWith: string[];
    }> {
        const entries: Array<{
            entityName: string;
            filter: string | undefined;
            itemCount: number;
            sizeBytes: number;
            firstAccessedAt: Date;
            lastAccessedAt: Date;
            accessCount: number;
            sharedWith: string[];
        }> = [];

        for (const entry of this._sharedCache.values()) {
            const access = (entry.engineAccesses || []).find(ea => ea.engineClassName === engineClassName);
            if (access) {
                const otherEngines = (entry.engineAccesses || [])
                    .filter(ea => ea.engineClassName !== engineClassName)
                    .map(ea => ea.engineClassName);

                entries.push({
                    entityName: entry.entityName,
                    filter: entry.filter,
                    itemCount: Array.isArray(entry.data) ? entry.data.length : 0,
                    sizeBytes: entry.estimatedSizeBytes,
                    firstAccessedAt: access.firstAccessedAt,
                    lastAccessedAt: access.lastAccessedAt,
                    accessCount: access.accessCount,
                    sharedWith: otherEngines
                });
            }
        }

        return entries.sort((a, b) => a.entityName.localeCompare(b.entityName));
    }

    /**
     * Check multiple entities for staleness in a single batch
     */
    public async CheckMultipleEntitiesStale(
        checks: Array<{ entityName: string; cachedUpdatedAt: Date }>,
        contextUser?: UserInfo
    ): Promise<Map<string, boolean>> {
        const rv = new RunView(this.ProviderToUse);
        const viewParams: RunViewParams[] = checks.map(c => ({
            EntityName: c.entityName,
            Fields: ['__mj_UpdatedAt'],
            OrderBy: '__mj_UpdatedAt DESC',
            MaxRows: 1,
            ResultType: 'simple'
        }));

        const results = await rv.RunViews(viewParams, contextUser);

        const staleMap = new Map<string, boolean>();
        checks.forEach((check, i) => {
            const result = results[i];
            if (result.Success && result.Results.length > 0) {
                const serverUpdatedAt = new Date(result.Results[0].__mj_UpdatedAt);
                staleMap.set(check.entityName, serverUpdatedAt > check.cachedUpdatedAt);
            } else {
                staleMap.set(check.entityName, true); // Assume stale if we can't determine
            }
        });

        return staleMap;
    }

    /**
     * Get data from the shared cache without making a request
     */
    public GetFromCache(request: DataPoolRequest): DataPoolCacheEntry | null {
        const key = this.BuildCacheKey(request);
        return this._sharedCache.get(key) || null;
    }

    /**
     * Estimate the size of an object in bytes
     */
    private EstimateSize(obj: unknown): number {
        try {
            const json = JSON.stringify(obj);
            return json.length * 2; // UTF-16 = 2 bytes per character
        } catch {
            return 0;
        }
    }

    /***********************************************************************
     * LOCAL STORAGE METHODS
     * These methods handle persistent caching using the provider's
     * ILocalStorageProvider abstraction (IndexedDB, file system, Redis, etc.)
     ***********************************************************************/

    private static readonly CACHE_KEY_PREFIX = 'mj_datapool_';

    /**
     * Get the local storage provider from the metadata provider
     */
    private get LocalStorageProvider(): ILocalStorageProvider | null {
        try {
            return Metadata.Provider?.LocalStorageProvider || null;
        } catch {
            return null;
        }
    }

    /**
     * Check if local storage is available
     */
    private async CheckLocalStorageAvailability(): Promise<boolean> {
        if (this._localStorageChecked) {
            return this._localStorageAvailable || false;
        }

        this._localStorageChecked = true;

        try {
            const ls = this.LocalStorageProvider;
            if (!ls) {
                this._localStorageAvailable = false;
                return false;
            }

            // Test write/read/remove
            const testKey = DataPool.CACHE_KEY_PREFIX + '_test';
            await ls.SetItem(testKey, 'test');
            const result = await ls.GetItem(testKey);
            await ls.Remove(testKey);

            this._localStorageAvailable = result === 'test';
        } catch {
            this._localStorageAvailable = false;
            LogStatus('Local storage not available, falling back to memory-only caching');
        }

        return this._localStorageAvailable || false;
    }

    /**
     * Build the storage key for a cache entry
     */
    private BuildStorageKey(cacheKey: string): string {
        return DataPool.CACHE_KEY_PREFIX + cacheKey;
    }

    /**
     * Check local storage for cached data
     */
    private async CheckLocalStorageCache(cacheKey: string): Promise<DataPoolCacheEntry | null> {
        if (!await this.CheckLocalStorageAvailability()) {
            return null;
        }

        try {
            const ls = this.LocalStorageProvider;
            if (!ls) return null;

            const storageKey = this.BuildStorageKey(cacheKey);
            const val = await ls.GetItem(storageKey);

            if (!val) return null;

            const entry = JSON.parse(val) as DataPoolCacheEntry;
            // Reconstitute dates
            entry.loadedAt = new Date(entry.loadedAt);
            entry.lastAccessedAt = new Date(entry.lastAccessedAt);
            if (entry.entityUpdatedAt) {
                entry.entityUpdatedAt = new Date(entry.entityUpdatedAt);
            }
            return entry;
        } catch {
            return null;
        }
    }

    /**
     * Maximum size in bytes for a single local storage entry.
     * Entries larger than this will be skipped for local storage but still cached in memory.
     * Set to 5MB to be safe for browser localStorage limits.
     */
    private static readonly MAX_LOCAL_STORAGE_ENTRY_SIZE = 5 * 1024 * 1024;

    /**
     * Save data to local storage
     */
    private async SaveToLocalStorage(cacheKey: string, entry: DataPoolCacheEntry): Promise<void> {
        if (!await this.CheckLocalStorageAvailability()) {
            return;
        }

        try {
            const ls = this.LocalStorageProvider;
            if (!ls) return;

            // Skip entries that are estimated to be too large to avoid RangeError
            // Use the already-calculated estimate plus some overhead for metadata
            const estimatedSize = entry.estimatedSizeBytes + 1000; // Add overhead for metadata
            if (estimatedSize > DataPool.MAX_LOCAL_STORAGE_ENTRY_SIZE) {
                // Skip this entry for local storage - it will remain in memory cache only
                return;
            }

            const storageKey = this.BuildStorageKey(cacheKey);
            const val = JSON.stringify(entry);
            await ls.SetItem(storageKey, val);
        } catch (error) {
            // Check for quota/size errors and skip silently for those
            const errorMessage = String(error);
            if (errorMessage.includes('RangeError') ||
                errorMessage.includes('QuotaExceededError') ||
                errorMessage.includes('Invalid string length')) {
                // Silently skip - entry is too large for local storage
                return;
            }
            LogError(`Local storage save error: ${error}`);
        }
    }

    /**
     * Clear local storage entries by prefix.
     * Note: This requires iterating through keys, which may not be efficient
     * for all storage implementations. Consider using a key index if needed.
     */
    private async ClearLocalStorageByPrefix(prefix: string): Promise<void> {
        if (!await this.CheckLocalStorageAvailability()) {
            return;
        }

        try {
            const ls = this.LocalStorageProvider;
            if (!ls) return;

            // For ILocalStorageProvider, we can only remove specific keys
            // We'll track our keys in the memory cache and remove those
            for (const key of this._sharedCache.keys()) {
                if (key.startsWith(prefix)) {
                    await ls.Remove(this.BuildStorageKey(key));
                }
            }
        } catch (error) {
            LogError(`Local storage clear error: ${error}`);
        }
    }

    /**
     * Clear all DataPool entries from local storage
     */
    private async ClearAllLocalStorage(): Promise<void> {
        if (!await this.CheckLocalStorageAvailability()) {
            return;
        }

        try {
            const ls = this.LocalStorageProvider;
            if (!ls) return;

            // Remove all keys we know about from the memory cache
            for (const key of this._sharedCache.keys()) {
                await ls.Remove(this.BuildStorageKey(key));
            }
        } catch (error) {
            LogError(`Local storage clear all error: ${error}`);
        }
    }
}

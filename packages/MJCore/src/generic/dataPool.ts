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
        enablePooling: true,
        poolingWindowMs: 50,
        poolingMaxExtensionMs: 250,
        enableLocalCache: true,
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
        for (let i = 0; i < requests.length; i++) {
            const request = requests[i];
            const cacheKey = this.BuildCacheKey(request);

            // Check memory cache
            if (this._config.enableCrossEngineSharing && !options?.forceRefresh && !options?.skipCache) {
                const cached = this._sharedCache.get(cacheKey);
                if (cached) {
                    cached.lastAccessedAt = new Date();
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
                    this._sharedCache.set(cacheKey, localCacheData);
                    results[i] = localCacheData.data;
                    continue;
                }
            }

            uncachedRequests.push({ index: i, request });
        }

        // If all cached, return immediately
        if (uncachedRequests.length === 0) {
            return results as (BaseEntity[] | Record<string, unknown>[])[];
        }

        // Execute uncached requests - use pooling or batch RunViews
        console.log(`[DataPool.Request] ${uncachedRequests.length} uncached requests to execute`);
        if (this._config.enablePooling && !options?.skipPooling) {
            // Use pooling for uncached requests
            console.log(`[DataPool.Request] Using pooling path`);
            const pooledResults = await Promise.all(
                uncachedRequests.map(item => this.QueueRequest(item.request, contextUser, options))
            );
            for (let i = 0; i < uncachedRequests.length; i++) {
                results[uncachedRequests[i].index] = pooledResults[i];
            }
        } else {
            // Use batched RunViews for immediate execution
            console.log(`[DataPool.Request] Using ExecuteBatchImmediate path`);
            await this.ExecuteBatchImmediate(uncachedRequests, results, contextUser);
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
        contextUser?: UserInfo
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

                // Cache the result
                this.CacheResult(key, data, request);

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
        console.log(`[DataPool.RequestSingle] ${request.entityName} - checking caches...`);

        // 1. Check shared memory cache (cross-engine sharing)
        if (this._config.enableCrossEngineSharing && !options?.forceRefresh && !options?.skipCache) {
            const cached = this._sharedCache.get(cacheKey);
            if (cached) {
                console.log(`[DataPool.RequestSingle] ${request.entityName} - HIT memory cache`);
                cached.lastAccessedAt = new Date();
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
                // Promote to memory cache
                this._sharedCache.set(cacheKey, localCacheData);
                return localCacheData.data;
            }
        }

        // 4. Execute request - either pooled or immediate
        console.log(`[DataPool.RequestSingle] ${request.entityName} - MISS all caches, executing...`);
        if (this._config.enablePooling && !options?.skipPooling) {
            return this.QueueRequest(request, contextUser, options);
        } else {
            return this.ExecuteImmediate(request, contextUser, cacheKey);
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
        uniqueRequests: DataPoolRequest[],
        results: RunViewResult[],
        requestMap: Map<string, number>
    ): void {
        for (const item of queue) {
            const key = this.BuildCacheKey(item.request);
            const index = requestMap.get(key);

            if (index !== undefined && results[index]) {
                const result = results[index];
                if (result.Success) {
                    const data = result.Results as BaseEntity[] | Record<string, unknown>[];

                    // Cache the result
                    this.CacheResult(key, data, item.request);

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
        cacheKey?: string
    ): Promise<BaseEntity[] | Record<string, unknown>[]> {
        const key = cacheKey || this.BuildCacheKey(request);

        // Create promise and store for deduplication
        const promise = this.DoExecute(request, contextUser, key);
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
        cacheKey?: string
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

        // Cache the result
        this.CacheResult(key, data, request);

        return data;
    }

    /**
     * Cache a result in memory (and optionally IndexedDB)
     */
    private CacheResult(cacheKey: string, data: BaseEntity[] | Record<string, unknown>[], request: DataPoolRequest): void {
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

        const entry: DataPoolCacheEntry = {
            data,
            entityName: request.entityName,
            filter: request.filter,
            loadedAt: new Date(),
            lastAccessedAt: new Date(),
            entityUpdatedAt,
            estimatedSizeBytes: this.EstimateSize(data)
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
     * Get detailed statistics about the cache including per-entry info
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
        }> = [];

        for (const [key, entry] of this._sharedCache.entries()) {
            totalBytes += entry.estimatedSizeBytes;
            if (!oldest || entry.loadedAt < oldest) oldest = entry.loadedAt;
            if (!newest || entry.loadedAt > newest) newest = entry.loadedAt;

            entries.push({
                key,
                entityName: entry.entityName,
                filter: entry.filter,
                itemCount: Array.isArray(entry.data) ? entry.data.length : 0,
                estimatedSizeBytes: entry.estimatedSizeBytes,
                loadedAt: entry.loadedAt,
                lastAccessedAt: entry.lastAccessedAt,
                entityUpdatedAt: entry.entityUpdatedAt
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
     * Save data to local storage
     */
    private async SaveToLocalStorage(cacheKey: string, entry: DataPoolCacheEntry): Promise<void> {
        if (!await this.CheckLocalStorageAvailability()) {
            return;
        }

        try {
            const ls = this.LocalStorageProvider;
            if (!ls) return;

            const storageKey = this.BuildStorageKey(cacheKey);
            const val = JSON.stringify(entry);
            await ls.SetItem(storageKey, val);
        } catch (error) {
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

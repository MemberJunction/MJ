/**
 * @fileoverview Two-tier caching provider (L1 in-process frozen CoW + L2 distributed Redis).
 *
 * Implements {@link ILocalStorageProvider} with:
 * - **L1 RAM**: in-process byte-bounded LRU cache with deep-frozen objects (0.001 ms hits, reference sharing)
 * - **L2 Redis**: persistent shared cache across all cluster nodes (via RedisLocalStorageProvider)
 * - **Differential Row Patching**: peer row_delta events update L1 via Copy-on-Write without re-fetching
 * - **Automatic Sync & Eviction**: pub/sub event integration and reconciliation flushes
 *
 * @module @memberjunction/redis-provider
 */

import type {
    CacheChangedEvent,
    CacheRowDeltaPayload,
    CachedRunViewData,
    ILocalStorageProvider,
} from '@memberjunction/core';
import { LogError } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import {
    RedisLocalStorageProvider,
    ExtendedWriteOptions,
} from './RedisLocalStorageProvider.js';

/**
 * Configuration options for {@link TwoTierCacheStorageProvider}.
 */
export interface TwoTierCacheConfig {
    /**
     * Maximum bytes for in-memory L1 cache.
     * @default 134217728 (128 MB)
     */
    MaxL1Bytes?: number;

    /**
     * Categories allowed to be cached in L1 RAM.
     * Categories not listed (such as 'default' or 'Metadata') bypass L1 and delegate directly to Redis.
     * @default ['RunViewCache', 'DatasetCache', 'RunQueryCache']
     */
    CategoriesInL1?: ReadonlyArray<string>;
}

/**
 * Metadata tracked for each L1 cache slot.
 */
interface L1Entry {
    Value: unknown;
    SizeBytes: number;
    ExpiresAt: number | null;
    Category: string;
    Key: string;
}

/**
 * Deep-freezes an object tree recursively using a WeakSet to guard against cycles.
 * When an object or row is already frozen, it returns immediately in O(1).
 */
export function DeepFreeze<T>(obj: T, visited: WeakSet<object> = new WeakSet()): T {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Object.isFrozen(obj) || visited.has(obj as object)) {
        return obj;
    }
    visited.add(obj as object);

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            DeepFreeze(obj[i], visited);
        }
    } else {
        const record = obj as Record<string, unknown>;
        for (const key of Object.keys(record)) {
            DeepFreeze(record[key], visited);
        }
    }
    try {
        return Object.freeze(obj);
    } catch {
        return obj;
    }
}

/**
 * Returns `true` when an L1 cache entry represents provider-internal metadata scaffolding
 * that is exempt from freeze-on-write (mirroring `LocalCacheManager`'s
 * `ProviderInternalScaffolding` contract and `cache-immutability.F14`).
 */
function isFreezeExempt<T>(category: string, key: string, value: T): boolean {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    if (category === 'RunViewCache' && 'providerInternalScaffolding' in value) {
        return value.providerInternalScaffolding === true;
    }
    if (category === 'DatasetCache') {
        if ('DatasetName' in value && value.DatasetName === 'MJ_Metadata') {
            return true;
        }
        return key.includes('__DATASET__MJ_Metadata');
    }
    return false;
}

/**
 * Fast approximate byte size estimator for L1 heap budget management.
 */
function estimateSizeBytes(value: unknown): number {
    if (value === null || value === undefined) return 8;
    if (typeof value === 'string') return value.length * 2;
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 4;
    if (Array.isArray(value)) {
        if (value.length === 0) return 32;
        const sampleSize = estimateSizeBytes(value[0]);
        return 32 + sampleSize * value.length;
    }
    if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (Array.isArray(obj.results)) {
            const resultsSize = estimateSizeBytes(obj.results);
            return 256 + resultsSize;
        }
        let size = 64;
        for (const [k, v] of Object.entries(obj)) {
            size += k.length * 2 + (typeof v === 'string' ? v.length * 2 : 16);
        }
        return size;
    }
    return 64;
}

/**
 * Matches two record rows by primary key fields using NormalizeUUID / UUIDsEqual.
 */
function rowsMatch(
    rowA: Record<string, unknown>,
    rowB: Record<string, unknown>,
    pkFields: string[]
): boolean {
    for (const pk of pkFields) {
        const valA = rowA[pk];
        const valB = rowB[pk];
        if (valA === undefined || valB === undefined || valA === null || valB === null) {
            return false;
        }
        if (!UUIDsEqual(String(valA), String(valB))) {
            return false;
        }
    }
    return true;
}

/**
 * Two-tier cache storage provider combining an in-process deep-frozen L1 LRU heap cache
 * with a cluster-shared L2 Redis backend.
 */
export class TwoTierCacheStorageProvider implements ILocalStorageProvider {
    /**
     * `true` — L1 stores and returns deep-frozen live object references for 0.001 ms hits.
     */
    public readonly SharesReferences = true;

    /**
     * `true` — backed by distributed Redis for persistence across process restarts.
     */
    public readonly SupportsCrossProcessPersistence = true;

    /**
     * `true` — L2 Redis is shared across processes and replicas.
     */
    public readonly SharedAcrossProcesses = true;

    private readonly _redis: RedisLocalStorageProvider;
    private readonly _maxL1Bytes: number;
    private readonly _categoriesInL1: Set<string>;
    private readonly _l1Map = new Map<string, L1Entry>();
    private _currentL1Bytes: number = 0;
    private readonly _unsubs: Array<() => void> = [];

    public constructor(redisProvider: RedisLocalStorageProvider, config?: TwoTierCacheConfig) {
        this._redis = redisProvider;
        this._maxL1Bytes = config?.MaxL1Bytes ?? 128 * 1024 * 1024;
        const categories = config?.CategoriesInL1 ?? ['RunViewCache', 'DatasetCache', 'RunQueryCache'];
        this._categoriesInL1 = new Set(categories);

        // Subscribe to Redis cache events for automatic peer synchronization
        this._unsubs.push(
            this._redis.OnCacheChanged(event => this.handleRedisCacheChanged(event))
        );
        this._unsubs.push(
            this._redis.OnReconciliationRequired(() => this.ClearL1())
        );
    }

    /**
     * Exposes the underlying L2 Redis provider.
     */
    public get RedisProvider(): RedisLocalStorageProvider {
        return this._redis;
    }

    /**
     * Current total bytes occupied by entries in the L1 RAM cache.
     */
    public get CurrentL1Bytes(): number {
        return this._currentL1Bytes;
    }

    /**
     * Total count of slots currently stored in L1.
     */
    public get L1EntryCount(): number {
        return this._l1Map.size;
    }

    /**
     * Retrieves an item from L1 if eligible and cached, otherwise reads from Redis L2 and populates L1.
     */
    public async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        const cat = category ?? 'default';
        if (!this._categoriesInL1.has(cat)) {
            return this._redis.GetItem<T>(key, cat);
        }

        const l1Key = this.buildL1Key(key, cat);
        const entry = this._l1Map.get(l1Key);
        if (entry) {
            if (entry.ExpiresAt !== null && Date.now() > entry.ExpiresAt) {
                this.deleteL1Entry(l1Key);
            } else {
                // LRU refresh: delete and re-insert at tail
                this._l1Map.delete(l1Key);
                this._l1Map.set(l1Key, entry);
                return entry.Value as T;
            }
        }

        // Miss in L1: fetch from L2 Redis
        const value = await this._redis.GetItem<T>(key, cat);
        if (value !== null) {
            this.setL1Entry(key, value, cat, undefined);
        }
        return value;
    }

    /**
     * Batched retrieval across L1 and L2.
     */
    public async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        const cat = category ?? 'default';
        if (!this._categoriesInL1.has(cat) || keys.length === 0) {
            return this._redis.GetItems<T>(keys, cat);
        }

        const result = new Map<string, T | null>();
        const missingKeys: string[] = [];

        for (const key of new Set(keys)) {
            const l1Key = this.buildL1Key(key, cat);
            const entry = this._l1Map.get(l1Key);
            if (entry) {
                if (entry.ExpiresAt !== null && Date.now() > entry.ExpiresAt) {
                    this.deleteL1Entry(l1Key);
                    missingKeys.push(key);
                } else {
                    // LRU refresh
                    this._l1Map.delete(l1Key);
                    this._l1Map.set(l1Key, entry);
                    result.set(key, entry.Value as T);
                }
            } else {
                missingKeys.push(key);
            }
        }

        if (missingKeys.length > 0) {
            const redisMap = await this._redis.GetItems<T>(missingKeys, cat);
            for (const [key, val] of redisMap.entries()) {
                if (val !== null) {
                    this.setL1Entry(key, val, cat, undefined);
                }
                result.set(key, val);
            }
        }

        return result;
    }

    /**
     * Stores a value in L1 (if eligible, deep-frozen unless freeze-exempt) and writes through to L2 Redis.
     */
    public async SetItem<T>(
        key: string,
        value: T,
        category?: string,
        options?: number | ExtendedWriteOptions
    ): Promise<void> {
        const cat = category ?? 'default';
        if (this._categoriesInL1.has(cat)) {
            this.setL1Entry(key, value, cat, options);
        }
        await this._redis.SetItem(key, value, cat, options);
    }

    /**
     * Removes an item from L1 and L2 Redis.
     */
    public async Remove(key: string, category?: string): Promise<void> {
        const cat = category ?? 'default';
        const l1Key = this.buildL1Key(key, cat);
        this.deleteL1Entry(l1Key);
        await this._redis.Remove(key, cat);
    }

    /**
     * Clears all items in a category from L1 and L2 Redis.
     */
    public async ClearCategory(category: string): Promise<void> {
        const cat = category || 'default';
        this.clearCategoryInL1(cat);
        await this._redis.ClearCategory(cat);
    }

    /**
     * Clears all items in a category from L1 and L2 Redis, returning detailed status.
     */
    public async ClearCategoryChecked(category: string): Promise<{ Ok: boolean; Error?: string }> {
        const cat = category || 'default';
        this.clearCategoryInL1(cat);
        return this._redis.ClearCategoryChecked(cat);
    }

    /**
     * Applies a differential row update to L1 RAM and delegates to L2 Redis.
     */
    public async ApplyRunViewRowDelta<T = unknown>(
        fingerprint: string,
        deltaPayloadJson: string,
        updatedSlotValue: T,
        options?: ExtendedWriteOptions
    ): Promise<boolean> {
        // Immediately store updated value into L1 (deep-frozen unless freeze-exempt)
        this.setL1Entry(fingerprint, updatedSlotValue, 'RunViewCache', options);

        // Delegate to L2 Redis
        const applied = await this._redis.ApplyRunViewRowDelta(
            fingerprint,
            deltaPayloadJson,
            updatedSlotValue,
            options
        );

        if (!applied) {
            // Redis slot had expired, was cold, or was stored as string: fall back to full SetItem
            await this._redis.SetItem(fingerprint, updatedSlotValue, 'RunViewCache', options);
        }
        return true;
    }

    /**
     * Checks if a key exists in L1 or L2 Redis.
     */
    public async Exists(key: string, category?: string): Promise<boolean> {
        const cat = category ?? 'default';
        if (this.HasL1Key(key, cat)) {
            return true;
        }
        return this._redis.Exists(key, cat);
    }

    /**
     * Checks if a live, unexpired key exists in L1 RAM.
     */
    public HasL1Key(key: string, category?: string): boolean {
        const cat = category ?? 'default';
        const l1Key = this.buildL1Key(key, cat);
        const entry = this._l1Map.get(l1Key);
        if (!entry) return false;
        if (entry.ExpiresAt !== null && Date.now() > entry.ExpiresAt) {
            this.deleteL1Entry(l1Key);
            return false;
        }
        return true;
    }

    /**
     * Drops all entries currently in L1 RAM.
     */
    public ClearL1(): void {
        this._l1Map.clear();
        this._currentL1Bytes = 0;
    }

    /**
     * Cleans up all event listeners and frees L1 memory.
     */
    public Dispose(): void {
        for (const unsub of this._unsubs) {
            unsub();
        }
        this._unsubs.length = 0;
        this.ClearL1();
    }

    // ========================================================================
    // Delegated ILocalStorageProvider Distributed Primitives
    // ========================================================================

    public async GetCategoryKeys(category: string): Promise<string[]> {
        return this._redis.GetCategoryKeys(category);
    }

    public async GetIndexGroupKeys(category: string, group: string): Promise<string[]> {
        return this._redis.GetIndexGroupKeys(category, group);
    }

    public async WithKeyLock<T>(key: string, category: string, work: () => Promise<T>): Promise<T> {
        return this._redis.WithKeyLock(key, category, work);
    }

    public async TryAcquireLease(name: string, ttlMs: number): Promise<boolean> {
        return this._redis.TryAcquireLease(name, ttlMs);
    }

    public async ReleaseLease(name: string): Promise<void> {
        return this._redis.ReleaseLease(name);
    }

    public async GetTTL(key: string, category?: string): Promise<number | null> {
        return this._redis.GetTTL(key, category);
    }

    public async Ping(): Promise<boolean> {
        return this._redis.Ping();
    }

    public async Disconnect(): Promise<void> {
        this.Dispose();
        await this._redis.Disconnect();
    }

    public OnCacheChanged(callback: (event: CacheChangedEvent) => void): () => void {
        return this._redis.OnCacheChanged(callback);
    }

    public OnReconciliationRequired(callback: () => void): () => void {
        return this._redis.OnReconciliationRequired(callback);
    }

    // ========================================================================
    // Internal L1 Management & Peer Sync
    // ========================================================================

    private buildL1Key(key: string, category: string): string {
        return `${category}::${key}`;
    }

    private setL1Entry(
        key: string,
        value: unknown,
        category: string,
        options?: number | ExtendedWriteOptions
    ): void {
        if (!this._categoriesInL1.has(category)) {
            return;
        }

        const l1Key = this.buildL1Key(key, category);
        const storedValue = isFreezeExempt(category, key, value) ? value : DeepFreeze(value);
        const sizeBytes = estimateSizeBytes(storedValue);

        if (sizeBytes > this._maxL1Bytes) {
            // Slot is larger than total L1 budget; do not store in L1
            this.deleteL1Entry(l1Key);
            return;
        }

        let expiresAt: number | null = null;
        if (typeof options === 'number' && options > 0) {
            expiresAt = Date.now() + options * 1000;
        } else if (typeof options === 'object' && options?.TTLSeconds && options.TTLSeconds > 0) {
            expiresAt = Date.now() + options.TTLSeconds * 1000;
        }

        const existing = this._l1Map.get(l1Key);
        if (existing) {
            this._currentL1Bytes -= existing.SizeBytes;
            this._l1Map.delete(l1Key);
        }

        this._currentL1Bytes += sizeBytes;
        this._l1Map.set(l1Key, {
            Value: storedValue,
            SizeBytes: sizeBytes,
            ExpiresAt: expiresAt,
            Category: category,
            Key: key,
        });

        this.evictIfNeeded();
    }

    private deleteL1Entry(l1Key: string): void {
        const entry = this._l1Map.get(l1Key);
        if (entry) {
            this._l1Map.delete(l1Key);
            this._currentL1Bytes -= entry.SizeBytes;
            if (this._currentL1Bytes < 0) {
                this._currentL1Bytes = 0;
            }
        }
    }

    private clearCategoryInL1(category: string): void {
        for (const [l1Key, entry] of Array.from(this._l1Map.entries())) {
            if (entry.Category === category) {
                this.deleteL1Entry(l1Key);
            }
        }
    }

    private evictIfNeeded(): void {
        if (this._currentL1Bytes <= this._maxL1Bytes) {
            return;
        }
        for (const [k, entry] of this._l1Map.entries()) {
            this._l1Map.delete(k);
            this._currentL1Bytes -= entry.SizeBytes;
            if (this._currentL1Bytes <= this._maxL1Bytes) {
                break;
            }
        }
        if (this._currentL1Bytes < 0) {
            this._currentL1Bytes = 0;
        }
    }

    private handleRedisCacheChanged(event: CacheChangedEvent): void {
        if (event.Action === 'category_cleared') {
            this.clearCategoryInL1(event.Category);
            return;
        }

        if (event.Action === 'removed' || event.Action === 'set') {
            const l1Key = this.buildL1Key(event.CacheKey, event.Category);
            this.deleteL1Entry(l1Key);
            return;
        }

        if (event.Action === 'row_delta' && event.Category === 'RunViewCache' && event.Data) {
            this.applyRowDeltaToL1(event.CacheKey, event.Data);
            return;
        }
    }

    private applyRowDeltaToL1(cacheKey: string, deltaJson: string): void {
        const l1Key = this.buildL1Key(cacheKey, 'RunViewCache');
        const entry = this._l1Map.get(l1Key);
        if (!entry) {
            return;
        }

        try {
            const delta = JSON.parse(deltaJson) as CacheRowDeltaPayload;
            const currentData = entry.Value as CachedRunViewData;

            if (typeof currentData !== 'object' || currentData === null || !Array.isArray(currentData.results)) {
                this.deleteL1Entry(l1Key);
                return;
            }

            // Schema hash verification: if both provide a schemaHash and they differ, evict
            if (delta.schemaHash && currentData.schemaHash && delta.schemaHash !== currentData.schemaHash) {
                this.deleteL1Entry(l1Key);
                return;
            }

            const pkFields = delta.primaryKeyFields;
            if (!Array.isArray(pkFields) || pkFields.length === 0) {
                this.deleteL1Entry(l1Key);
                return;
            }

            // Copy-on-Write: shallow copy results array
            let nextResults = (currentData.results as Array<Record<string, unknown>>).slice();

            // 1. Process deletedPrimaryKeys
            if (Array.isArray(delta.deletedPrimaryKeys)) {
                for (const delPk of delta.deletedPrimaryKeys) {
                    nextResults = nextResults.filter(row => !rowsMatch(row, delPk, pkFields));
                }
            }

            const exempt = isFreezeExempt('RunViewCache', cacheKey, currentData);

            // 2. Process upsertedRows
            if (Array.isArray(delta.upsertedRows)) {
                for (const rawRow of delta.upsertedRows) {
                    const nextRow = exempt ? rawRow : DeepFreeze(rawRow);
                    const idx = nextResults.findIndex(row => rowsMatch(row, nextRow, pkFields));
                    if (idx >= 0) {
                        nextResults[idx] = nextRow;
                    } else {
                        nextResults.push(nextRow);
                    }
                }
            }

            // 3. Invariant check: postRowCount must equal delta.rowCount
            if (nextResults.length !== delta.rowCount) {
                // Drift detected; evict slot so next read re-hydrates from Redis L2
                this.deleteL1Entry(l1Key);
                return;
            }

            // 4. Construct updated envelope (frozen unless scaffolding-exempt)
            const updatedData: CachedRunViewData = {
                ...currentData,
                results: exempt ? nextResults : (Object.freeze(nextResults) as CachedRunViewData['results']),
                maxUpdatedAt: delta.maxUpdatedAt,
                totalRowCount: delta.totalRowCount,
            };
            if (delta.schemaHash !== undefined) {
                updatedData.schemaHash = delta.schemaHash;
            }
            const nextEntryValue = exempt ? updatedData : Object.freeze(updatedData);

            // Update in-place in L1
            const oldSize = entry.SizeBytes;
            const newSize = estimateSizeBytes(nextEntryValue);
            entry.Value = nextEntryValue;
            entry.SizeBytes = newSize;
            this._currentL1Bytes = this._currentL1Bytes - oldSize + newSize;
            this.evictIfNeeded();
        } catch (err) {
            LogError(`Failed to apply row delta to L1 for key "${cacheKey}": ${(err as Error).message}`);
            this.deleteL1Entry(l1Key);
        }
    }
}

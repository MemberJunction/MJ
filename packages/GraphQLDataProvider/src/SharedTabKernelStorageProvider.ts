import type { ILocalStorageProvider } from '@memberjunction/core';
import type { SharedTabKernelClient } from './SharedTabKernelClient';

/**
 * {@link ILocalStorageProvider} proxy that routes browser storage operations through the
 * SharedWorker's single IDB + L1 cache owner ({@link SharedTabKernelClient}), eliminating
 * cross-tab IndexedDB connection contention, redundant IDB reads, and duplicate writes.
 *
 * When the SharedWorker kernel is unavailable or falls back (mobile Safari, SSR, Node,
 * handshake failure), transparently delegates to the configured fallback storage provider
 * (`BrowserIndexedDBStorageProvider` in browsers, `InMemoryLocalStorageProvider` in Node).
 */
export class SharedTabKernelStorageProvider implements ILocalStorageProvider {
    private readonly _getKernelClient: () => SharedTabKernelClient | null;
    private readonly _getFallbackProvider: () => ILocalStorageProvider;

    constructor(
        getKernelClient: () => SharedTabKernelClient | null,
        getFallbackProvider: () => ILocalStorageProvider
    ) {
        this._getKernelClient = getKernelClient;
        this._getFallbackProvider = getFallbackProvider;
    }

    /**
     * `false` when backed by the worker kernel (`MessagePort` + `CloneKernelValue` isolate
     * every value), or reflects the fallback provider's isolation contract.
     */
    public get SharesReferences(): boolean {
        const client = this._getKernelClient();
        if (client && client.IsKernelConnected) {
            return false;
        }
        return this._getFallbackProvider().SharesReferences ?? false;
    }

    /**
     * `true` when backed by the worker kernel (which owns `BrowserIndexedDBStorageProvider`),
     * or reflects the fallback provider's persistence contract.
     */
    public get SupportsCrossProcessPersistence(): boolean {
        const client = this._getKernelClient();
        if (client && (client.IsKernelConnected || client.Mode === 'connecting')) {
            return true;
        }
        return this._getFallbackProvider().SupportsCrossProcessPersistence ?? true;
    }

    /**
     * Reflects the fallback provider's cross-process fleet contract (`false` for browser
     * IndexedDB / in-memory). The SharedWorker kernel is a local single-origin IDB proxy,
     * NOT a multi-server Redis fleet — returning `true` here would enable rolling-deploy
     * schema write-holds and disable local TTL expiry in `LocalCacheManager`.
     */
    public get SharedAcrossProcesses(): boolean {
        return this._getFallbackProvider().SharedAcrossProcesses ?? false;
    }

    /**
     * `true` while the SharedWorker kernel is active so `LocalCacheManager` keeps its
     * per-tab eviction registry (`__MJ_CACHE_REGISTRY__`) isolated in memory without
     * opting into multi-server Redis fleet semantics (`SharedAcrossProcesses`).
     */
    public get ProcessLocalRegistry(): boolean {
        const client = this._getKernelClient();
        if (client && (client.IsKernelConnected || client.Mode === 'connecting')) {
            return true;
        }
        return this._getFallbackProvider().ProcessLocalRegistry ?? false;
    }

    private async resolveActiveClient(): Promise<SharedTabKernelClient | null> {
        const client = this._getKernelClient();
        if (!client || client.IsDisposed) {
            return null;
        }
        if (client.IsKernelConnected) {
            return client;
        }
        if (client.Mode === 'connecting') {
            const ready = await client.WaitUntilReady();
            return ready && client.IsKernelConnected ? client : null;
        }
        return null;
    }

    public async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        const client = await this.resolveActiveClient();
        if (client) {
            try {
                const res = await client.SendStorageRequest('get_item', { Key: key, Category: category });
                return (res.Value === undefined ? null : (res.Value as T | null));
            } catch {
                // Fall back on transient worker disconnect
            }
        }
        return this._getFallbackProvider().GetItem<T>(key, category);
    }

    public async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        if (keys.length === 0) {
            return new Map();
        }
        const client = await this.resolveActiveClient();
        if (client) {
            try {
                const res = await client.SendStorageRequest('get_items', { Keys: keys, Category: category });
                const out = new Map<string, T | null>();
                if (Array.isArray(res.Items)) {
                    for (const [k, v] of res.Items) {
                        out.set(k, v === undefined ? null : (v as T | null));
                    }
                }
                return out;
            } catch {
                // Fall back on transient worker disconnect
            }
        }
        return this._getFallbackProvider().GetItems<T>(keys, category);
    }

    public async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
        const client = await this.resolveActiveClient();
        if (client) {
            try {
                await client.SendStorageRequest('set_item', { Key: key, Value: value, Category: category });
                return;
            } catch {
                // Fall back on transient worker disconnect
            }
        }
        await this._getFallbackProvider().SetItem<T>(key, value, category);
    }

    public async SetObject<T>(key: string, value: T, category?: string): Promise<void> {
        const client = await this.resolveActiveClient();
        if (client) {
            try {
                await client.SendStorageRequest('set_item', { Key: key, Value: value, Category: category });
                return;
            } catch {
                // Fall back
            }
        }
        const fallback = this._getFallbackProvider();
        if (typeof fallback.SetObject === 'function') {
            await fallback.SetObject<T>(key, value, category);
        } else {
            await fallback.SetItem<T>(key, value, category);
        }
    }

    public async GetObject<T>(key: string, category?: string): Promise<T | null> {
        const client = await this.resolveActiveClient();
        if (client) {
            try {
                const res = await client.SendStorageRequest('get_item', { Key: key, Category: category });
                if (res.Value === undefined || res.Value === null) {
                    return null;
                }
                if (typeof res.Value === 'string') {
                    try {
                        return JSON.parse(res.Value) as T;
                    } catch {
                        return res.Value as unknown as T;
                    }
                }
                return res.Value as T;
            } catch {
                // Fall back
            }
        }
        const fallback = this._getFallbackProvider();
        if (typeof fallback.GetObject === 'function') {
            return fallback.GetObject<T>(key, category);
        }
        return fallback.GetItem<T>(key, category);
    }

    public async Remove(key: string, category?: string): Promise<void> {
        const client = await this.resolveActiveClient();
        if (client) {
            try {
                await client.SendStorageRequest('remove', { Key: key, Category: category });
                return;
            } catch {
                // Fall back
            }
        }
        await this._getFallbackProvider().Remove(key, category);
    }

    public async ClearCategory(category: string): Promise<void> {
        const client = await this.resolveActiveClient();
        if (client) {
            try {
                await client.SendStorageRequest('clear_category', { Category: category });
                return;
            } catch {
                // Fall back
            }
        }
        await this._getFallbackProvider().ClearCategory(category);
    }

    public async GetCategoryKeys(category: string): Promise<string[]> {
        const client = await this.resolveActiveClient();
        if (client) {
            try {
                const res = await client.SendStorageRequest('get_category_keys', { Category: category });
                return res.Keys ?? [];
            } catch {
                // Fall back
            }
        }
        return this._getFallbackProvider().GetCategoryKeys(category);
    }
}

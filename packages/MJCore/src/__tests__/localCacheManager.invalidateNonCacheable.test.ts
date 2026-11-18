/**
 * `InvalidateEntityCaches` for an entity that is never cached (#5261).
 *
 * The scheduler invalidates 'MJ: Scheduled Jobs' after every job run, but that entity has
 * AllowCaching = false, so nothing was ever written for it. The call still ran the fingerprint
 * lookup against storage and rewrote the whole registry each time.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { LocalCacheManager } from '../generic/localCacheManager';
import type { ILocalStorageProvider, IMetadataProvider } from '../generic/interfaces';
import type { RunViewParams } from '../views/runView';

function resetLocalCacheManager(): void {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__LocalCacheManager'];
}

/** A metadata provider that only answers EntityByName, with the given AllowCaching per entity. */
function providerWith(allowCaching: Record<string, boolean>): IMetadataProvider {
    return {
        EntityByName: (name: string) => (name in allowCaching ? { Name: name, AllowCaching: allowCaching[name] } : undefined),
    } as unknown as IMetadataProvider;
}

describe('LocalCacheManager.InvalidateEntityCaches — non-cacheable entities', () => {
    let storage: Map<string, unknown>;
    let provider: ILocalStorageProvider;
    let setItem: ReturnType<typeof vi.fn>;
    let remove: ReturnType<typeof vi.fn>;
    let getCategoryKeys: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        storage = new Map();
        setItem = vi.fn(async (key: string, value: unknown) => { storage.set(key, value); });
        remove = vi.fn(async (key: string) => { storage.delete(key); });
        getCategoryKeys = vi.fn(async () => [] as string[]);
        provider = {
            GetItem: async (key: string) => storage.get(key) ?? null,
            SetItem: setItem,
            Remove: remove,
            GetItems: async (keys: string[]) => new Map(keys.map(k => [k, storage.get(k) ?? null])),
            GetCategoryKeys: getCategoryKeys,
        } as unknown as ILocalStorageProvider;
        resetLocalCacheManager();
        await LocalCacheManager.Instance.Initialize(provider, { enabled: true });
        // Initialize probes the store (a write and a remove); only what follows counts.
        setItem.mockClear();
        remove.mockClear();
        getCategoryKeys.mockClear();
    });

    afterEach(() => {
        resetLocalCacheManager();
    });

    it('makes no storage call and does not persist the registry when nothing is indexed', async () => {
        setItem.mockClear();
        await LocalCacheManager.Instance.InvalidateEntityCaches('MJ: Scheduled Jobs', providerWith({ 'MJ: Scheduled Jobs': false }));

        expect(getCategoryKeys).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
        expect(setItem).not.toHaveBeenCalled();
    });

    it('still removes entries indexed before AllowCaching was turned off', async () => {
        const fp = 'Things|f|o|simple|10|0|a';
        await LocalCacheManager.Instance.SetRunViewResult(fp, { EntityName: 'Things' } as RunViewParams, [{ ID: 1 }],
            '2026-11-01T00:00:00Z', undefined, undefined, providerWith({ Things: true }));
        expect(LocalCacheManager.Instance.GetFingerprintsForEntity('Things').has(fp)).toBe(true);

        setItem.mockClear();
        await LocalCacheManager.Instance.InvalidateEntityCaches('Things', providerWith({ Things: false }));

        expect(remove).toHaveBeenCalledWith(fp, expect.anything());
        expect(LocalCacheManager.Instance.GetFingerprintsForEntity('Things').size).toBe(0);
        expect(setItem).toHaveBeenCalledTimes(1); // the registry, once
    });

    it('does not persist the registry when a cacheable entity has nothing to remove', async () => {
        setItem.mockClear();
        await LocalCacheManager.Instance.InvalidateEntityCaches('Users', providerWith({ Users: true }));

        expect(getCategoryKeys).toHaveBeenCalledTimes(1); // the lookup still runs for a cacheable entity
        expect(setItem).not.toHaveBeenCalled();
    });

    it('treats an entity that does not resolve as cacheable, so its invalidation still runs', async () => {
        getCategoryKeys.mockResolvedValueOnce(['Unknown|f|o|simple|10|0|a']);
        await LocalCacheManager.Instance.InvalidateEntityCaches('Unknown', providerWith({}));

        expect(remove).toHaveBeenCalledWith('Unknown|f|o|simple|10|0|a', expect.anything());
    });
});

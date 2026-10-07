/**
 * instrumented-cache.ts — the InstrumentedLocalStorageProvider and UniqueFilter,
 * lifted verbatim from the original live harness. These are the two net-new
 * primitives this package introduces; everything else they touch
 * (InMemoryLocalStorageProvider, ILocalStorageProvider) is imported from
 * @memberjunction/core, never copied.
 */
import type { ILocalStorageProvider, LocalStorageWriteOptions } from '@memberjunction/core';

/**
 * Wraps any ILocalStorageProvider with call counters so tests can prove cache
 * behavior from the outside: a cache WRITE shows up as SetItemCount++, a cache
 * READ as GetItemCount/GetItemsCount++, and "served without touching storage"
 * (e.g. a dedup/linger hit) as no counter movement at all.
 */
export class InstrumentedLocalStorageProvider implements ILocalStorageProvider {
    /**
     * Delegated — this wrapper only counts calls; the isolation semantics are entirely
     * the inner provider's. See {@link ILocalStorageProvider.SharesReferences}.
     *
     * `undefined` passes through deliberately: if the inner provider does not declare its
     * semantics, this wrapper must not invent them either, and LocalCacheManager's probe then
     * measures straight through these delegating methods into the real store.
     */
    public get SharesReferences(): boolean | undefined {
        return this.inner.SharesReferences;
    }

    /**
     * Delegated for the same reason as {@link SharesReferences}: this wrapper stores nothing of its
     * own, so whether what it holds outlives the process is a property of the inner store.
     * See {@link ILocalStorageProvider.SupportsCrossProcessPersistence}.
     */
    public get SupportsCrossProcessPersistence(): boolean | undefined {
        return this.inner.SupportsCrossProcessPersistence;
    }

    /** Delegated, like {@link SharesReferences}: sharing is a property of the inner store. */
    public get SharedAcrossProcesses(): boolean | undefined {
        return this.inner.SharedAcrossProcesses;
    }

    public GetItemCount = 0;
    public GetItemsCount = 0;
    public SetItemCount = 0;
    public RemoveCount = 0;
    private perCategory = new Map<string, { Gets: number; Sets: number }>();

    /**
     * Present only when the inner provider has it: `LocalCacheManager` chooses its lookup path by
     * whether the method exists, so the wrapper must not add one the real provider lacks.
     */
    public readonly GetIndexGroupKeys?: (category: string, group: string) => Promise<string[]>;

    /** Present only when the inner provider has it, for the same reason as {@link GetIndexGroupKeys}. */
    public readonly WithKeyLock?: <T>(key: string, category: string, work: () => Promise<T>) => Promise<T>;

    /** Present only when the inner provider has it, for the same reason as {@link GetIndexGroupKeys}. */
    public readonly TryAcquireLease?: (name: string, ttlMs: number) => Promise<boolean>;

    /** Present only when the inner provider has it, for the same reason as {@link GetIndexGroupKeys}. */
    public readonly ReleaseLease?: (name: string) => Promise<void>;

    constructor(private readonly inner: ILocalStorageProvider) {
        const innerGroupKeys = inner.GetIndexGroupKeys;
        if (innerGroupKeys) {
            this.GetIndexGroupKeys = (category, group) => innerGroupKeys.call(inner, category, group);
        }
        const innerLock = inner.WithKeyLock;
        if (innerLock) {
            this.WithKeyLock = <T>(key: string, category: string, work: () => Promise<T>) => innerLock.call(inner, key, category, work) as Promise<T>;
        }
        const innerLease = inner.TryAcquireLease;
        if (innerLease) {
            this.TryAcquireLease = (name, ttlMs) => innerLease.call(inner, name, ttlMs);
        }
        const innerRelease = inner.ReleaseLease;
        if (innerRelease) {
            this.ReleaseLease = (name) => innerRelease.call(inner, name);
        }
    }

    public ResetCounts(): void {
        this.GetItemCount = 0;
        this.GetItemsCount = 0;
        this.SetItemCount = 0;
        this.RemoveCount = 0;
        this.perCategory.clear();
    }

    /**
     * Per-category counters — IMPORTANT for assertions: LocalCacheManager also
     * persists its registry index asynchronously (a different category), so tests
     * about RunView cache traffic must scope to the 'RunViewCache' category rather
     * than the global counters.
     */
    public GetCount(category: string): number {
        return this.perCategory.get(category)?.Gets ?? 0;
    }

    public SetCount(category: string): number {
        return this.perCategory.get(category)?.Sets ?? 0;
    }

    private bump(category: string | undefined, kind: 'Gets' | 'Sets'): void {
        const key = category ?? 'default';
        const entry = this.perCategory.get(key) ?? { Gets: 0, Sets: 0 };
        entry[kind]++;
        this.perCategory.set(key, entry);
    }

    public async GetItem<T = unknown>(key: string, category?: string): Promise<T | null> {
        this.GetItemCount++;
        this.bump(category, 'Gets');
        return this.inner.GetItem<T>(key, category);
    }

    public async GetItems<T = unknown>(keys: string[], category?: string): Promise<Map<string, T | null>> {
        this.GetItemsCount++;
        this.bump(category, 'Gets');
        return this.inner.GetItems<T>(keys, category);
    }

    public async SetItem<T>(key: string, value: T, category?: string, options?: LocalStorageWriteOptions): Promise<void> {
        this.SetItemCount++;
        this.bump(category, 'Sets');
        return this.inner.SetItem<T>(key, value, category, options);
    }

    public async Remove(key: string, category?: string): Promise<void> {
        this.RemoveCount++;
        return this.inner.Remove(key, category);
    }

    public async ClearCategory(category: string): Promise<void> {
        if (this.inner.ClearCategory) {
            return this.inner.ClearCategory(category);
        }
    }

    public async GetCategoryKeys(category: string): Promise<string[]> {
        if (this.inner.GetCategoryKeys) {
            return this.inner.GetCategoryKeys(category);
        }
        return [];
    }
}

/**
 * Returns an always-true ExtraFilter that is textually unique per tag — every tag
 * yields a distinct cache fingerprint (Filter is part of the fingerprint) while
 * matching the same rows. This lets each check start from a guaranteed-cold cache
 * entry without mutating any data.
 */
export function UniqueFilter(column: string, tag: string): string {
    return `${column} <> 'zzz-cache-test-${tag}'`;
}

/**
 * instrumented-cache.ts — the InstrumentedLocalStorageProvider and UniqueFilter,
 * lifted verbatim from the original live harness. These are the two net-new
 * primitives this package introduces; everything else they touch
 * (InMemoryLocalStorageProvider, ILocalStorageProvider) is imported from
 * @memberjunction/core, never copied.
 */
import type { ILocalStorageProvider } from '@memberjunction/core';

/**
 * Wraps any ILocalStorageProvider with call counters so tests can prove cache
 * behavior from the outside: a cache WRITE shows up as SetItemCount++, a cache
 * READ as GetItemCount/GetItemsCount++, and "served without touching storage"
 * (e.g. a dedup/linger hit) as no counter movement at all.
 */
export class InstrumentedLocalStorageProvider implements ILocalStorageProvider {
    public GetItemCount = 0;
    public GetItemsCount = 0;
    public SetItemCount = 0;
    public RemoveCount = 0;
    private perCategory = new Map<string, { Gets: number; Sets: number }>();

    constructor(private readonly inner: ILocalStorageProvider) {}

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

    public async SetItem<T>(key: string, value: T, category?: string): Promise<void> {
        this.SetItemCount++;
        this.bump(category, 'Sets');
        return this.inner.SetItem<T>(key, value, category);
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
